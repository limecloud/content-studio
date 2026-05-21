import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type {
  ExportMixPackageInput,
  MixPackageAssetInput,
  MixPackageManifestAsset,
  MixPackageRecord,
} from '../../shared/types';
import { AssetReviewStore } from './assetReviewStore';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceAssetDir, getWorkspaceDataDir } from './paths';

function mixPackagesFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'mix-packages.json');
}

function mixPackagesAssetDir(workspacePath: string): string {
  return join(getWorkspaceAssetDir(workspacePath), 'mix-packages');
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function compactTags(tags?: string[]): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 16);
}

function safeFilePart(value: string): string {
  return normalizeText(value).replace(/[\\/:*?"<>|]/g, '-').slice(0, 56) || 'mix-package';
}

function assetFolder(kind: MixPackageAssetInput['kind']): string {
  if (kind === 'image') return 'images';
  if (kind === 'video') return 'videos';
  return 'overlays';
}

function ensureLocalPath(path: string): void {
  if (!path.trim()) throw new Error('混剪包素材路径不能为空。');
  if (/^https?:\/\//i.test(path)) throw new Error(`混剪包当前只支持本地文件：${path}`);
  if (!existsSync(path)) throw new Error(`混剪包素材不存在：${path}`);
}

function buildPackagedFileName(asset: MixPackageAssetInput, index: number): string {
  const ext = extname(asset.path) || (asset.kind === 'overlay' ? '.svg' : '');
  const name = safeFilePart(asset.title || basename(asset.path, ext));
  return `${String(index + 1).padStart(3, '0')}-${asset.kind}-${name}${ext}`;
}

export class MixPackageStore {
  constructor(private readonly assetReviews: AssetReviewStore) {}

  async list(workspacePath: string): Promise<MixPackageRecord[]> {
    const packages = await readJsonFile<MixPackageRecord[]>(mixPackagesFilePath(workspacePath), []);
    return packages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async exportPackage(input: ExportMixPackageInput): Promise<MixPackageRecord> {
    const assets = input.assets.filter((asset) => asset.path.trim()).slice(0, 200);
    if (!normalizeText(input.title)) throw new Error('混剪包标题不能为空。');
    if (assets.length === 0) throw new Error('请至少选择一个素材后再导出混剪包。');
    await this.assetReviews.requireApproved(input.workspacePath, assets.map((asset) => asset.id));

    const now = new Date().toISOString();
    const id = randomUUID();
    const packageDir = join(mixPackagesAssetDir(input.workspacePath), `${safeFilePart(input.title)}-${id.slice(0, 8)}`);
    await mkdir(packageDir, { recursive: true });

    const manifestAssets: MixPackageManifestAsset[] = [];
    for (const [index, asset] of assets.entries()) {
      ensureLocalPath(asset.path);
      const folder = assetFolder(asset.kind);
      const targetDir = join(packageDir, folder);
      await mkdir(targetDir, { recursive: true });
      const packagedPath = join(targetDir, buildPackagedFileName(asset, index));
      await copyFile(asset.path, packagedPath);
      manifestAssets.push({
        id: asset.id,
        kind: asset.kind,
        title: normalizeText(asset.title) || basename(asset.path),
        originalPath: asset.path,
        packagedPath,
        sourceType: asset.sourceType,
        sourceId: asset.sourceId?.trim() || undefined,
        promptDraftId: asset.promptDraftId?.trim() || undefined,
        promptText: asset.promptText?.trim() || undefined,
        relatedSceneCardIds: asset.relatedSceneCardIds?.filter(Boolean).slice(0, 24),
        durationSeconds: asset.durationSeconds,
        tags: compactTags(asset.tags),
      });
    }

    const manifestPath = join(packageDir, 'manifest.json');
    const record: MixPackageRecord = {
      id,
      workspacePath: input.workspacePath,
      workflowRunId: input.workflowRunId?.trim() || undefined,
      title: normalizeText(input.title),
      platform: normalizeText(input.platform) || 'third-party-mix-tool',
      packageDir,
      manifestPath,
      assets: manifestAssets,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    await writeFile(manifestPath, `${JSON.stringify({
      schema: 'buguai.mix-package.v1',
      id: record.id,
      workflowRunId: record.workflowRunId,
      title: record.title,
      platform: record.platform,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      packageDir: record.packageDir,
      notes: record.notes,
      assets: record.assets,
    }, null, 2)}\n`, 'utf-8');

    const existing = await this.list(input.workspacePath);
    await writeJsonFile(mixPackagesFilePath(input.workspacePath), [record, ...existing].slice(0, 120));
    return record;
  }
}
