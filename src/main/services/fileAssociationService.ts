import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import type { SkillFileAssociationResult, SkillFileAssociationState } from '../../shared/types';
import { getOemRuntimeConfig } from './oemRuntimeConfig';

const execFileAsync = promisify(execFile);
const SKILL_EXTENSION = 'skill';
const LEGACY_SKILL_CONTENT_TYPE = 'com.limecloud.lime.skill';
const LS_DOMAIN = 'com.apple.LaunchServices/com.apple.launchservices.secure';
const LSREGISTER = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
const HANDLER_ROLE_KEYS = ['LSHandlerRoleAll', 'LSHandlerRoleViewer', 'LSHandlerRoleEditor'] as const;

type LaunchServiceHandler = {
  LSHandlerContentTag?: string;
  LSHandlerContentTagClass?: string;
  LSHandlerContentType?: string;
  LSHandlerRoleAll?: string;
  LSHandlerRoleViewer?: string;
  LSHandlerRoleEditor?: string;
  LSHandlerPreferredVersions?: Record<string, string>;
};

function findAppBundlePath(): string | undefined {
  let current = process.execPath;
  while (current && current !== dirname(current)) {
    if (current.endsWith('.app')) return current;
    current = dirname(current);
  }
  return undefined;
}

function isSkillExtensionHandler(handler: LaunchServiceHandler): boolean {
  return handler.LSHandlerContentTag === SKILL_EXTENSION
    && handler.LSHandlerContentTagClass === 'public.filename-extension';
}

function getHandlerBundleId(handler: LaunchServiceHandler): string | undefined {
  return handler.LSHandlerRoleAll ?? handler.LSHandlerRoleViewer ?? handler.LSHandlerRoleEditor;
}

function isSkillContentTypeHandler(handler: LaunchServiceHandler, contentTypes: Set<string>): boolean {
  return typeof handler.LSHandlerContentType === 'string' && contentTypes.has(handler.LSHandlerContentType);
}

function isSkillHandler(handler: LaunchServiceHandler, contentTypes: Set<string>): boolean {
  return isSkillExtensionHandler(handler) || isSkillContentTypeHandler(handler, contentTypes);
}

function getRuntimeAppBundleId(): string {
  return getOemRuntimeConfig().appId || 'ai.limecloud.contentstudio';
}

function getRuntimeProductName(): string {
  return getOemRuntimeConfig().productName || '布谷AI';
}

function createRoleHandlers(appBundleId: string, descriptor: Pick<LaunchServiceHandler, 'LSHandlerContentTag' | 'LSHandlerContentTagClass' | 'LSHandlerContentType'>): LaunchServiceHandler[] {
  return HANDLER_ROLE_KEYS.map((roleKey) => ({
    ...descriptor,
    LSHandlerPreferredVersions: { [roleKey]: '-' },
    [roleKey]: appBundleId,
  }) as LaunchServiceHandler);
}

function messageFor(state: Omit<SkillFileAssociationState, 'message'>, productName: string): string {
  if (state.platform !== 'darwin') {
    return '当前平台由安装包注册 .skill 文件关联；如仍未生效，请重新安装正式包。';
  }
  if (!state.supported || !state.canSetDefault) {
    return `请使用正式安装包启动${productName}后再设置 .skill 默认打开方式。`;
  }
  if (state.isDefault) {
    return `.skill 当前默认由${productName}打开。`;
  }
  if (state.currentHandler === state.appBundleId) {
    return `.skill 扩展名已指向${productName}，但系统内容类型关联仍需修复。`;
  }
  return state.currentHandler
    ? `.skill 当前默认处理器是 ${state.currentHandler}。`
    : '.skill 当前还没有明确的默认处理器。';
}

export class FileAssociationService {
  async getSkillAssociationState(): Promise<SkillFileAssociationState> {
    const appBundleId = getRuntimeAppBundleId();
    const productName = getRuntimeProductName();
    const platform = process.platform;
    const appPath = findAppBundlePath();
    const currentBundleId = platform === 'darwin' ? await this.readAppBundleIdentifier(appPath) : undefined;
    const base = {
      platform,
      supported: platform === 'darwin',
      canSetDefault: platform === 'darwin' && Boolean(appPath) && currentBundleId === appBundleId,
      isDefault: false,
      appBundleId,
      appPath,
      currentHandler: undefined as string | undefined,
    };

    if (platform !== 'darwin') {
      return { ...base, message: messageFor(base, productName) };
    }

    const contentTypes = new Set(await this.resolveSkillContentTypes());
    const handlers = await this.readHandlers();
    const currentHandler = this.findCurrentHandler(handlers, contentTypes);
    const state = {
      ...base,
      currentHandler,
      isDefault: this.hasDefaultHandlers(handlers, contentTypes),
    };
    return { ...state, message: messageFor(state, productName) };
  }

  async setSkillAssociationDefault(): Promise<SkillFileAssociationResult> {
    const before = await this.getSkillAssociationState();
    if (!before.supported || !before.canSetDefault) {
      return { ...before, ok: false, error: before.message };
    }

    try {
      if (before.appPath) {
        await execFileAsync(LSREGISTER, ['-f', before.appPath]);
      }

      const contentTypes = await this.resolveSkillContentTypes();
      for (const contentType of contentTypes) {
        await this.setDefaultRoleHandler(contentType);
      }
      const handlers = await this.readHandlers();
      const nextHandlers = handlers.filter((handler) => !isSkillHandler(handler, new Set(contentTypes)));
      nextHandlers.push(...createRoleHandlers(before.appBundleId, {
        LSHandlerContentTag: SKILL_EXTENSION,
        LSHandlerContentTagClass: 'public.filename-extension',
      }));
      for (const contentType of contentTypes) {
        nextHandlers.push(...createRoleHandlers(before.appBundleId, { LSHandlerContentType: contentType }));
      }
      await this.writeHandlers(nextHandlers);
      await execFileAsync(LSREGISTER, ['-kill', '-r', '-domain', 'local', '-domain', 'system', '-domain', 'user']);

      const after = await this.getSkillAssociationState();
      return {
        ...after,
        ok: after.isDefault,
        error: after.isDefault ? undefined : `系统已写入默认打开方式，但 LaunchServices 尚未刷新到${getRuntimeProductName()}。`,
      };
    } catch (error) {
      return {
        ...before,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async setDefaultRoleHandler(contentType: string): Promise<void> {
    const script = [
      'import CoreServices',
      'import Foundation',
      `let status = LSSetDefaultRoleHandlerForContentType(${JSON.stringify(contentType)} as NSString, LSRolesMask.all, ${JSON.stringify(getRuntimeAppBundleId())} as NSString)`,
      'if status != 0 { Foundation.exit(Int32(status)) }',
    ].join('\n');
    await execFileAsync('/usr/bin/swift', ['-e', script]);
  }

  private findCurrentHandler(handlers: LaunchServiceHandler[], contentTypes: Set<string>): string | undefined {
    const contentTypeHandler = this.findLastHandler(handlers, (handler) => isSkillContentTypeHandler(handler, contentTypes));
    if (contentTypeHandler) return contentTypeHandler;
    return this.findLastHandler(handlers, isSkillExtensionHandler);
  }

  private findLastHandler(handlers: LaunchServiceHandler[], predicate: (handler: LaunchServiceHandler) => boolean): string | undefined {
    for (let index = handlers.length - 1; index >= 0; index -= 1) {
      const handler = handlers[index];
      if (predicate(handler)) return getHandlerBundleId(handler);
    }
    return undefined;
  }

  private hasDefaultHandlers(handlers: LaunchServiceHandler[], contentTypes: Set<string>): boolean {
    const extensionHandler = this.findLastHandler(handlers, isSkillExtensionHandler);
    const appBundleId = getRuntimeAppBundleId();
    if (extensionHandler !== appBundleId) return false;
    for (const contentType of contentTypes) {
      const contentTypeHandler = this.findLastHandler(
        handlers,
        (handler) => handler.LSHandlerContentType === contentType,
      );
      if (contentTypeHandler !== appBundleId) return false;
    }
    return true;
  }

  private async readAppBundleIdentifier(appPath?: string): Promise<string | undefined> {
    if (!appPath) return undefined;
    try {
      const { stdout } = await execFileAsync('/usr/libexec/PlistBuddy', [
        '-c',
        'Print :CFBundleIdentifier',
        join(appPath, 'Contents', 'Info.plist'),
      ]);
      return stdout.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  private async resolveSkillContentTypes(): Promise<string[]> {
    const contentTypes = new Set([`${getRuntimeAppBundleId()}.skill`, LEGACY_SKILL_CONTENT_TYPE]);
    const tempDir = await mkdtemp(join(tmpdir(), 'bugu-skill-uti-'));
    const probePath = join(tempDir, `probe.${SKILL_EXTENSION}`);
    try {
      await writeFile(probePath, '');
      const { stdout } = await execFileAsync('/usr/bin/mdls', ['-raw', '-name', 'kMDItemContentType', probePath]);
      const dynamicType = stdout.trim();
      if (dynamicType && dynamicType !== '(null)') contentTypes.add(dynamicType);
    } catch {
      // mdls 失败时仍保留布谷声明的 UTI，避免阻断正式包的文件关联设置。
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
    return Array.from(contentTypes);
  }

  private async readHandlers(): Promise<LaunchServiceHandler[]> {
    const tempDir = await mkdtemp(join(tmpdir(), 'bugu-ls-read-'));
    const plistPath = join(tempDir, 'launchservices.plist');
    const jsonPath = join(tempDir, 'launchservices.json');
    try {
      try {
        await execFileAsync('/usr/bin/defaults', ['export', LS_DOMAIN, plistPath]);
      } catch {
        return [];
      }
      await execFileAsync('/usr/bin/plutil', ['-convert', 'json', '-o', jsonPath, plistPath]);
      const payload = JSON.parse(await readFile(jsonPath, 'utf-8')) as { LSHandlers?: unknown };
      return Array.isArray(payload.LSHandlers)
        ? payload.LSHandlers.filter((item): item is LaunchServiceHandler => typeof item === 'object' && item !== null)
        : [];
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private async writeHandlers(handlers: LaunchServiceHandler[]): Promise<void> {
    const tempDir = await mkdtemp(join(tmpdir(), 'bugu-ls-write-'));
    const jsonPath = join(tempDir, 'launchservices.json');
    const plistPath = join(tempDir, 'launchservices.plist');
    try {
      await writeFile(jsonPath, JSON.stringify({ LSHandlers: handlers }, null, 2));
      await execFileAsync('/usr/bin/plutil', ['-convert', 'xml1', '-o', plistPath, jsonPath]);
      await execFileAsync('/usr/bin/defaults', ['import', LS_DOMAIN, plistPath]);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
