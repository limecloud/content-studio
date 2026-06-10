import type {
  PlatformAgentRuntimeResult,
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
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

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

type BridgeSource = 'env' | 'discovery';
const BRIDGE_FETCH_TIMEOUT_MS = 1500;
const CONTENT_STUDIO_APP_ID = 'content-studio';

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

async function bridgeFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), BRIDGE_FETCH_TIMEOUT_MS);
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
  private descriptor = parseJsonEnv<PlatformRuntimeBridgeDescriptor>('LIME_RUNTIME_BRIDGE');
  private descriptorSource: BridgeSource | undefined = this.descriptor ? 'env' : undefined;
  private readonly injectedSnapshot = parseJsonEnv<PlatformHostSnapshot>('LIME_HOST_SNAPSHOT');
  private discoveredSnapshot: PlatformHostSnapshot | undefined;
  private lastError: string | undefined = process.env.LIME_RUNTIME_BRIDGE && !this.descriptor
    ? 'LIME_RUNTIME_BRIDGE 不是合法 runtime bridge descriptor。'
    : undefined;

  isAvailable(): boolean {
    return isRuntimeBridgeDescriptor(this.descriptor) && !isExpired(this.descriptor.expiresAt);
  }

  async ensureConnected(): Promise<boolean> {
    if (this.isAvailable()) return true;
    if (this.descriptorSource === 'env') return false;
    const discovery = await this.readDiscoveryDescriptor();
    if (!discovery) return false;
    try {
      const descriptor = await this.attachDiscovery(discovery);
      this.descriptor = descriptor;
      this.descriptorSource = 'discovery';
      this.lastError = undefined;
      this.discoveredSnapshot = await this.readSnapshot().catch(() => undefined);
      return true;
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : '连接 lime-desktop-platform runtime bridge 失败。';
      return false;
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
      source: this.descriptorSource,
      snapshot,
      bridge: redactDescriptor(this.descriptor),
    };
  }

  async readSnapshot(): Promise<PlatformHostSnapshot | undefined> {
    if (!this.descriptor) return this.injectedSnapshot;
    const response = await bridgeFetch(`${this.descriptor.endpoint}/snapshot`, {
      method: 'POST',
      headers: bridgeFetchHeaders(this.descriptor),
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
    await this.ensureConnected();
    if (!this.descriptor) {
      throw new Error('未检测到 lime-desktop-platform runtime bridge。');
    }
    const response = await bridgeFetch(`${this.descriptor.endpoint}/capability/invoke`, {
      method: 'POST',
      headers: bridgeFetchHeaders(this.descriptor),
      body: JSON.stringify({
        capability: input.capability,
        operation: input.operation,
        input: input.input,
      }),
    });
    const payload = (await response.json().catch(() => ({}))) as BridgeResponse<PlatformCapabilityInvokeResult>;
    if (!response.ok) {
      throw new Error(payload.error?.message || `平台 capability 调用失败：HTTP ${response.status}`);
    }
    return assertBridgeResponse(payload, '平台 capability 调用失败。');
  }

  async invokeAgent(input: {
    prompt: string;
    workspacePath: string;
    capabilityId?: string;
    workflowId?: string;
    modelId?: string;
    modelPreference?: string;
    permissionMode?: 'safe' | 'ask' | 'allow-all';
    providerPreference?: string;
    metadata?: Record<string, unknown>;
    selectedSkillSlugs?: string[];
    businessObjectRef?: unknown;
  }): Promise<PlatformAgentRuntimeResult> {
    const result = await this.invokeCapability({
      capability: 'lime.agent',
      operation: 'agentSession/turn/start',
      input: {
        agentAppId: 'content-studio',
        taskId: input.workflowId,
        prompt: input.prompt,
        runtimeOptions: {
          capabilityId: input.capabilityId ?? 'content.draft.generate',
          workflowId: input.workflowId,
          modelId: input.modelId,
          modelPreference: input.modelPreference ?? input.modelId,
          permissionMode: input.permissionMode ?? 'ask',
          providerPreference: input.providerPreference,
        },
        modelPolicy: {
          preferredModelId: input.modelId,
          capability: 'agent',
        },
        toolPolicy: {
          allowedToolIds: input.selectedSkillSlugs,
          permissionMode: input.permissionMode ?? 'ask',
        },
        metadata: {
          workspacePath: input.workspacePath,
          selectedSkillSlugs: input.selectedSkillSlugs ?? [],
          ...(input.metadata ?? {}),
        },
        businessObjectRef: input.businessObjectRef,
      },
    });
    if (!result.ok) {
      throw new Error(result.error?.message || '平台 lime.agent 调用被阻断。');
    }
    return result.output as PlatformAgentRuntimeResult;
  }

  async openIntent(input: PlatformNavigationIntent): Promise<PlatformNavigationResult> {
    await this.ensureConnected();
    if (!this.descriptor) {
      throw new Error('未检测到 lime-desktop-platform runtime bridge。');
    }
    const response = await bridgeFetch(`${this.descriptor.endpoint}/intent/open`, {
      method: 'POST',
      headers: bridgeFetchHeaders(this.descriptor),
      body: JSON.stringify(input),
    });
    const payload = (await response.json().catch(() => ({}))) as BridgeResponse<PlatformNavigationResult>;
    if (!response.ok) {
      throw new Error(payload.error?.message || `平台导航意图失败：HTTP ${response.status}`);
    }
    return assertBridgeResponse(payload, '平台导航意图失败。');
  }

  async getPlatformSettings(): Promise<PlatformSettingsProjection> {
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
