import type {
  PlatformCapabilityInvokeInput,
  PlatformCapabilityInvokeResult,
  PlatformHostBridgeStatus,
  PlatformHostSnapshot,
  PlatformNavigationIntent,
  PlatformNavigationResult,
  PlatformSettingsProjection,
  PlatformRuntimeBridgeDiscoveryDescriptor,
  PlatformRuntimeBridgeDescriptor,
} from '../../shared/types';
import { app } from 'electron';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createEmbeddedElectronPlatformHost,
  type EmbeddedElectronPlatformHost,
} from '@limecloud/desktop-platform-electron-adapter';
import { getResourcesRoot } from './paths';

interface BridgeResponse<T> {
  ok: boolean;
  result?: T;
  snapshot?: PlatformHostSnapshot;
  error?: {
    code?: string;
    message?: string;
    data?: unknown;
  };
}

type BridgeSource = 'embedded' | 'env' | 'discovery';
const BRIDGE_FETCH_TIMEOUT_MS = 1500;
const BRIDGE_AGENT_FETCH_TIMEOUT_MS = 120_000;
const CONTENT_STUDIO_APP_ID = 'content-studio';
const CONTENT_STUDIO_ENTRY_KEY = 'default';
const APP_SERVER_BINARY_NAME = process.platform === 'win32' ? 'app-server.exe' : 'app-server';
const PLATFORM_KEY = `${process.platform}-${process.arch}`;
const CURRENT_FILE = fileURLToPath(import.meta.url);
const PROJECT_ROOT = resolve(dirname(CURRENT_FILE), '..', '..', '..');

export function resolveEmbeddedHostResourcesDirForTest(): string {
  return resolveEmbeddedHostResourcesDir();
}

export function resolveEmbeddedAppServerBinForTest(resourcesDir = resolveEmbeddedHostResourcesDir()): string | undefined {
  return resolveEmbeddedAppServerBinaryOverride(resourcesDir);
}

function resolveEmbeddedHostResourcesDir(): string {
  return process.env.CONTENT_STUDIO_RESOURCES_DIR?.trim() || getResourcesRoot();
}

function resolveEmbeddedAppServerDataDir(): string | undefined {
  const explicit =
    process.env.CONTENT_STUDIO_APP_SERVER_DATA_DIR?.trim() ||
    process.env.APP_SERVER_DATA_DIR?.trim();
  if (explicit) return explicit;
  if (process.env.ELECTRON_RENDERER_URL) {
    return join(app.getPath('appData'), 'content-studio', 'app-server');
  }
  return undefined;
}

function resolveEmbeddedAppServerBinaryOverride(resourcesDir: string): string | undefined {
  if (process.env.APP_SERVER_BIN?.trim()) return undefined;
  if (embeddedHostCurrentAppServerBinaryExists(resourcesDir)) return undefined;
  return embeddedHostPlatformAppServerBinary(resourcesDir) ?? limeDevEmbeddedAppServerBinary();
}

function embeddedHostCurrentAppServerBinaryExists(resourcesDir: string): boolean {
  return Boolean(resourcesDir && existsSync(join(resourcesDir, 'app-server', 'current', APP_SERVER_BINARY_NAME)));
}

function embeddedHostPlatformAppServerBinary(resourcesDir: string): string | undefined {
  if (!resourcesDir) return undefined;
  const binaryPath = join(resourcesDir, 'app-server', PLATFORM_KEY, APP_SERVER_BINARY_NAME);
  return existsSync(binaryPath) ? binaryPath : undefined;
}

function limeDevEmbeddedAppServerBinary(): string | undefined {
  const roots = [
    process.env.LIME_APP_SERVER_REPO?.trim(),
    resolve(process.cwd(), '..', '..', 'aiclientproxy', 'lime'),
    resolve(PROJECT_ROOT, '..', '..', 'aiclientproxy', 'lime'),
  ].filter((root): root is string => Boolean(root));
  return Array.from(new Set(roots)).flatMap((root) => [
    join(root, 'dist-electron', 'app-server', PLATFORM_KEY, APP_SERVER_BINARY_NAME),
    join(root, 'lime-rs', 'target', 'debug', APP_SERVER_BINARY_NAME),
  ]).find((binaryPath) => existsSync(binaryPath));
}

function createEmbeddedAppServerArgs(resourcesDir: string, dataDir: string | undefined): string {
  const args = [
    '--backend',
    'runtime',
    '--app-policy',
    join(resourcesDir, 'app-server', 'content-studio.policy.example.json'),
  ];
  if (dataDir) {
    args.push(`--data-dir=${dataDir}`);
  }
  return args.join('\n');
}

function withEmbeddedAppServerBinOverride<T>(
  resourcesDir: string,
  dataDir: string | undefined,
  create: () => T,
): T {
  const binaryOverride = resolveEmbeddedAppServerBinaryOverride(resourcesDir);
  if (!binaryOverride) return create();
  const previous = {
    APP_SERVER_BIN: process.env.APP_SERVER_BIN,
    APP_SERVER_ARGS: process.env.APP_SERVER_ARGS,
  };
  process.env.APP_SERVER_BIN = binaryOverride;
  if (!process.env.APP_SERVER_ARGS) {
    process.env.APP_SERVER_ARGS = createEmbeddedAppServerArgs(resourcesDir, dataDir);
  }
  try {
    return create();
  } finally {
    if (previous.APP_SERVER_BIN === undefined) delete process.env.APP_SERVER_BIN;
    else process.env.APP_SERVER_BIN = previous.APP_SERVER_BIN;
    if (previous.APP_SERVER_ARGS === undefined) delete process.env.APP_SERVER_ARGS;
    else process.env.APP_SERVER_ARGS = previous.APP_SERVER_ARGS;
  }
}

function parseJsonEnv<T>(name: string): T | undefined {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

function runtimeBridgeDiscoveryPath(): string {
  const overridePath = process.env.LIME_DESKTOP_PLATFORM_BRIDGE_DISCOVERY_PATH?.trim();
  if (overridePath) return overridePath;
  return join(app.getPath('appData'), 'Lime Desktop Platform', 'runtime-bridge-discovery.json');
}

function isRuntimeBridgeDescriptor(value: unknown): value is PlatformRuntimeBridgeDescriptor {
  const descriptor = value as Partial<PlatformRuntimeBridgeDescriptor> | undefined;
  return Boolean(
    descriptor &&
      descriptor.protocol === 'lime.runtimeBridge' &&
      descriptor.version === 1 &&
      isLoopbackEndpoint(descriptor.endpoint) &&
      typeof descriptor.token === 'string' &&
      descriptor.appId === CONTENT_STUDIO_APP_ID &&
      typeof descriptor.entryKey === 'string' &&
      typeof descriptor.expiresAt === 'string',
  );
}

function isRuntimeBridgeDiscoveryDescriptor(value: unknown): value is PlatformRuntimeBridgeDiscoveryDescriptor {
  const descriptor = value as Partial<PlatformRuntimeBridgeDiscoveryDescriptor> | undefined;
  return Boolean(
    descriptor &&
      descriptor.protocol === 'lime.runtimeBridge.discovery' &&
      descriptor.version === 1 &&
      isLoopbackEndpoint(descriptor.endpoint) &&
      typeof descriptor.token === 'string' &&
      typeof descriptor.expiresAt === 'string',
  );
}

function isLoopbackEndpoint(value: unknown): value is string {
  return typeof value === 'string' && value.startsWith('http://127.0.0.1:');
}

function isExpired(iso: string): boolean {
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function bridgeFetchHeaders(descriptor: PlatformRuntimeBridgeDescriptor): Record<string, string> {
  return {
    authorization: `Bearer ${descriptor.token}`,
    'content-type': 'application/json; charset=utf-8',
    accept: 'application/json',
  };
}

function redactDescriptor(
  descriptor: PlatformRuntimeBridgeDescriptor | undefined,
): PlatformHostBridgeStatus['bridge'] | undefined {
  if (!descriptor) return undefined;
  return {
    endpoint: descriptor.endpoint,
    appId: descriptor.appId,
    entryKey: descriptor.entryKey,
    expiresAt: descriptor.expiresAt,
  };
}

function assertBridgeResponse<T>(payload: BridgeResponse<T>, fallbackMessage: string): T {
  if (payload.ok && payload.result !== undefined) return payload.result;
  throw new Error(payload.error?.message || fallbackMessage);
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

async function bridgeFetch(url: string, init: RequestInit, timeoutMs = BRIDGE_FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export class PlatformHostBridgeClient {
  private readonly embeddedHost: EmbeddedElectronPlatformHost | undefined =
    process.env.CONTENT_STUDIO_DISABLE_EMBEDDED_PLATFORM_HOST === '1'
      ? undefined
      : (() => {
        const resourcesDir = resolveEmbeddedHostResourcesDir();
        const binaryOverride = resolveEmbeddedAppServerBinaryOverride(resourcesDir);
        const appServerDataDir = resolveEmbeddedAppServerDataDir();
        return withEmbeddedAppServerBinOverride(resourcesDir, appServerDataDir, () => createEmbeddedElectronPlatformHost({
          appId: CONTENT_STUDIO_APP_ID,
          entryKey: CONTENT_STUDIO_ENTRY_KEY,
          resourcesDir: binaryOverride ? undefined : resourcesDir,
          appServerDataDir,
          publishRuntimeBridgeDiscovery: false,
        }));
      })();
  private descriptor = parseJsonEnv<PlatformRuntimeBridgeDescriptor>('LIME_RUNTIME_BRIDGE');
  private descriptorSource: BridgeSource | undefined = this.descriptor ? 'env' : undefined;
  private readonly injectedSnapshot = parseJsonEnv<PlatformHostSnapshot>('LIME_HOST_SNAPSHOT');
  private discoveredSnapshot: PlatformHostSnapshot | undefined;
  private embeddedAppServerSidecar: PlatformHostBridgeStatus['appServerSidecar'] | undefined;
  private loggedEmbeddedSidecarState: string | undefined;
  private connecting: Promise<boolean> | undefined;
  private lastError: string | undefined = process.env.LIME_RUNTIME_BRIDGE && !this.descriptor
    ? 'LIME_RUNTIME_BRIDGE 不是合法 runtime bridge descriptor。'
    : undefined;

  isAvailable(): boolean {
    if (this.embeddedHost) return true;
    return isRuntimeBridgeDescriptor(this.descriptor) && !isExpired(this.descriptor.expiresAt);
  }

  async ensureConnected(): Promise<boolean> {
    if (this.connecting) return this.connecting;
    this.connecting = this.connectOnce().finally(() => {
      this.connecting = undefined;
    });
    return this.connecting;
  }

  private async connectOnce(): Promise<boolean> {
    if (this.embeddedHost) {
      try {
        await this.embeddedHost.ensureConnected();
        const status = this.embeddedHost.status();
        this.embeddedAppServerSidecar = status.appServerSidecar;
        this.logEmbeddedSidecarStatus(status.appServerSidecar);
        this.discoveredSnapshot = await this.readEmbeddedSnapshot();
        this.descriptorSource = 'embedded';
        this.lastError = undefined;
        return true;
      } catch (error) {
        this.lastError = errorMessage(error, '初始化 lime-desktop-platform embedded host 失败。');
        return false;
      }
    }
    if (await this.refreshDiscoveryDescriptorIfChanged()) return true;
    if (this.isAvailable()) return true;
    if (this.descriptorSource === 'env') return false;
    return this.attachLatestDiscovery();
  }

  private logEmbeddedSidecarStatus(status: PlatformHostBridgeStatus['appServerSidecar'] | undefined): void {
    const stateKey = status?.ok ? 'started' : `blocked:${status?.error ?? 'unknown reason'}`;
    if (this.loggedEmbeddedSidecarState === stateKey) {
      return;
    }
    this.loggedEmbeddedSidecarState = stateKey;
    if (status?.ok) {
      console.info('[content-studio] Lime App Server sidecar started with embedded lime-desktop-platform host.');
    } else {
      console.warn(`[content-studio] Lime App Server sidecar did not start: ${status?.error ?? 'unknown reason'}`);
    }
  }

  status(): PlatformHostBridgeStatus {
    if (!this.isAvailable()) {
      return {
        available: false,
        mode: 'standalone',
        error: this.lastError,
      };
    }
    const snapshot = this.discoveredSnapshot ?? this.injectedSnapshot;
    return {
      available: true,
      mode: 'lime-desktop-platform',
      source: this.embeddedHost ? 'embedded' : this.descriptorSource,
      snapshot,
      appServerSidecar: this.embeddedHost ? this.embeddedAppServerSidecar : undefined,
      bridge: redactDescriptor(this.descriptor),
    };
  }

  async readSnapshot(): Promise<PlatformHostSnapshot | undefined> {
    if (this.embeddedHost) {
      this.discoveredSnapshot = await this.readEmbeddedSnapshot();
      return this.discoveredSnapshot;
    }
    if (!this.descriptor) return this.injectedSnapshot;
    const descriptor = this.descriptor;
    const response = await this.fetchWithDiscoveryRetry(descriptor, '/snapshot', {
      method: 'POST',
      headers: bridgeFetchHeaders(descriptor),
      body: '{}',
    });
    const payload = (await response.json().catch(() => ({}))) as BridgeResponse<never>;
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error?.message || `读取平台 Host Snapshot 失败：HTTP ${response.status}`);
    }
    this.discoveredSnapshot = payload.snapshot ?? this.injectedSnapshot;
    return this.discoveredSnapshot;
  }

  async invokeCapability(input: Omit<PlatformCapabilityInvokeInput, 'appId' | 'entryKey'>): Promise<PlatformCapabilityInvokeResult> {
    if (this.embeddedHost) {
      return await this.embeddedHost.invokeCapability({
        capability: input.capability,
        operation: input.operation,
        input: input.input,
      }) as unknown as PlatformCapabilityInvokeResult;
    }
    await this.ensureConnected();
    if (!this.descriptor) {
      throw new Error('未检测到 lime-desktop-platform runtime bridge。');
    }
    const descriptor = this.descriptor;
    const response = await this.fetchWithDiscoveryRetry(descriptor, '/capability/invoke', {
      method: 'POST',
      headers: bridgeFetchHeaders(descriptor),
      body: JSON.stringify({
        capability: input.capability,
        operation: input.operation,
        input: input.input,
      }),
    }, input.capability === 'lime.agent' ? BRIDGE_AGENT_FETCH_TIMEOUT_MS : BRIDGE_FETCH_TIMEOUT_MS);
    const payload = (await response.json().catch(() => ({}))) as BridgeResponse<PlatformCapabilityInvokeResult>;
    if (!response.ok) {
      throw new Error(payload.error?.message || `平台 capability 调用失败：HTTP ${response.status}`);
    }
    return assertBridgeResponse(payload, '平台 capability 调用失败。');
  }

  async openIntent(input: PlatformNavigationIntent): Promise<PlatformNavigationResult> {
    if (this.embeddedHost) {
      return this.embeddedHost.openNavigationIntent(input as never) as unknown as PlatformNavigationResult;
    }
    await this.ensureConnected();
    if (!this.descriptor) {
      throw new Error('未检测到 lime-desktop-platform runtime bridge。');
    }
    const descriptor = this.descriptor;
    const response = await this.fetchWithDiscoveryRetry(descriptor, '/intent/open', {
      method: 'POST',
      headers: bridgeFetchHeaders(descriptor),
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as BridgeResponse<PlatformNavigationResult>;
    if (!response.ok) {
      throw new Error(payload.error?.message || `平台导航意图失败：HTTP ${response.status}`);
    }
    return assertBridgeResponse(payload, '平台导航意图失败。');
  }

  async getPlatformSettings(): Promise<PlatformSettingsProjection> {
    if (this.embeddedHost) {
      return this.embeddedHost.getPlatformSettings() as unknown as PlatformSettingsProjection;
    }
    const result = await this.invokeCapability({
      capability: 'lime.settings',
      operation: 'platform-settings/read',
      input: {
        source: 'content-studio-platform-settings',
      },
    });
    if (!result.ok) {
      throw new Error(result.error?.message || '平台设置读取失败。');
    }
    const output = result.output;
    if (!output || typeof output !== 'object') {
      throw new Error('lime-desktop-platform 未返回合法平台设置。');
    }
    return output as PlatformSettingsProjection;
  }

  async savePlatformSettings(settings: PlatformSettingsProjection): Promise<PlatformSettingsProjection> {
    if (this.embeddedHost) {
      const result = this.embeddedHost.savePlatformSettings(settings as never) as unknown as PlatformSettingsProjection;
      this.discoveredSnapshot = await this.readEmbeddedSnapshot().catch(() => undefined);
      return result;
    }
    const result = await this.invokeCapability({
      capability: 'lime.settings',
      operation: 'platform-settings/save',
      input: {
        settings,
        source: 'content-studio-platform-settings',
      },
    });
    if (!result.ok) {
      throw new Error(result.error?.message || '平台设置保存失败。');
    }
    const output = result.output;
    if (!output || typeof output !== 'object') {
      throw new Error('lime-desktop-platform 未返回合法平台设置。');
    }
    await this.readSnapshot().catch(() => undefined);
    return output as PlatformSettingsProjection;
  }

  private async readEmbeddedSnapshot(): Promise<PlatformHostSnapshot> {
    return this.embeddedHost!.readSnapshot() as unknown as PlatformHostSnapshot;
  }

  private async readDiscoveryDescriptor(): Promise<PlatformRuntimeBridgeDiscoveryDescriptor | undefined> {
    try {
      const raw = await readFile(runtimeBridgeDiscoveryPath(), 'utf8');
      const descriptor = JSON.parse(raw) as unknown;
      if (!isRuntimeBridgeDiscoveryDescriptor(descriptor)) {
        this.lastError = 'runtime bridge discovery descriptor 不合法。';
        return undefined;
      }
      if (isExpired(descriptor.expiresAt)) {
        this.lastError = 'runtime bridge discovery descriptor 已过期。';
        return undefined;
      }
      return descriptor;
    } catch {
      this.lastError = undefined;
      return undefined;
    }
  }

  private async refreshDiscoveryDescriptorIfChanged(): Promise<boolean> {
    if (this.descriptorSource === 'env') return false;
    if (!this.isAvailable()) return false;
    const discovery = await this.readDiscoveryDescriptor();
    if (!discovery || discovery.endpoint === this.descriptor?.endpoint) return false;
    return this.attachLatestDiscovery(discovery);
  }

  private async attachLatestDiscovery(discovery?: PlatformRuntimeBridgeDiscoveryDescriptor): Promise<boolean> {
    const nextDiscovery = discovery ?? await this.readDiscoveryDescriptor();
    if (!nextDiscovery) return false;
    try {
      const descriptor = await this.attachDiscovery(nextDiscovery);
      this.descriptor = descriptor;
      this.descriptorSource = 'discovery';
      this.lastError = undefined;
      this.discoveredSnapshot = await this.readSnapshot().catch(() => undefined);
      return true;
    } catch (error) {
      this.descriptor = undefined;
      this.discoveredSnapshot = undefined;
      this.lastError = errorMessage(error, '连接 lime-desktop-platform runtime bridge 失败。');
      return false;
    }
  }

  private async fetchWithDiscoveryRetry(
    descriptor: PlatformRuntimeBridgeDescriptor,
    path: string,
    init: RequestInit,
    timeoutMs = BRIDGE_FETCH_TIMEOUT_MS,
  ): Promise<Response> {
    try {
      const response = await bridgeFetch(`${descriptor.endpoint}${path}`, init, timeoutMs);
      if (response.status !== 401 || this.descriptorSource === 'env') {
        return response;
      }
      const retried = await this.retryWithLatestDiscovery(path, init, timeoutMs);
      return retried ?? response;
    } catch (error) {
      if (this.descriptorSource === 'env') throw error;
      const retried = await this.retryWithLatestDiscovery(path, init, timeoutMs);
      if (!retried) throw error;
      return retried;
    }
  }

  private async retryWithLatestDiscovery(
    path: string,
    init: RequestInit,
    timeoutMs: number,
  ): Promise<Response | undefined> {
    this.descriptor = undefined;
    this.discoveredSnapshot = undefined;
    const reconnected = await this.attachLatestDiscovery();
    const nextDescriptor = this.descriptor as PlatformRuntimeBridgeDescriptor | undefined;
    if (!reconnected || !nextDescriptor) return undefined;
    return bridgeFetch(`${nextDescriptor.endpoint}${path}`, {
      ...init,
      headers: bridgeFetchHeaders(nextDescriptor),
    }, timeoutMs);
  }

  private async attachDiscovery(
    discovery: PlatformRuntimeBridgeDiscoveryDescriptor,
  ): Promise<PlatformRuntimeBridgeDescriptor> {
    const response = await bridgeFetch(`${discovery.endpoint}/attach`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${discovery.token}`,
        'content-type': 'application/json; charset=utf-8',
        accept: 'application/json',
      },
      body: JSON.stringify({
        appId: CONTENT_STUDIO_APP_ID,
        entryKey: 'default',
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as BridgeResponse<PlatformRuntimeBridgeDescriptor>;
    if (!response.ok) {
      throw new Error(payload.error?.message || `连接平台 runtime bridge 失败：HTTP ${response.status}`);
    }
    const descriptor = assertBridgeResponse(payload, '连接平台 runtime bridge 失败。');
    if (!isRuntimeBridgeDescriptor(descriptor)) {
      throw new Error('平台返回的 runtime bridge descriptor 不合法。');
    }
    return descriptor;
  }
}
