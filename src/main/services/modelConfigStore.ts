import { app, safeStorage } from 'electron';
import { join } from 'node:path';
import {
  isImageGenerationProtocol,
  isTextGenerationProtocol,
  type ModelCatalogView,
  type ModelConfigView,
  type ModelSecretStatus,
  type PlatformCapabilityInvokeResult,
  type PlatformModelCapabilityKind,
  type PlatformModelSettings,
  type SaveModelConfigInput,
} from '../../shared/types';
import { resolveAuthorizationHeader } from '../providers/multimodalProviderUtils';
import { readJsonFile, writeJsonFile } from './jsonStore';
import type { PlatformHostBridgeClient } from './platformHostBridgeClient';

interface StoredModelConfig {
  apiEndpoint?: string;
  apiKeyEncrypted?: string;
  apiKeyPlain?: string;
  textProvider?: ModelConfigView['textProvider'];
  textProtocol?: ModelConfigView['textProtocol'];
  textApiEndpoint?: string;
  textApiKeyEncrypted?: string;
  textApiKeyPlain?: string;
  textModel?: string;
  textModels?: string[];
  imageProvider?: ModelConfigView['imageProvider'];
  imageProtocol?: ModelConfigView['imageProtocol'];
  imageApiEndpoint?: string;
  imageApiKeyEncrypted?: string;
  imageApiKeyPlain?: string;
  imageOuterModel?: string;
  imageModels?: string[];
  videoProvider?: ModelConfigView['videoProvider'];
  videoApiEndpoint?: string;
  videoApiKeyEncrypted?: string;
  videoApiKeyPlain?: string;
  videoModel?: string;
  videoModels?: string[];
  updatedAt?: string;
}

const DEFAULT_CONFIG = {
  textProvider: 'http-text-generation' as const,
  textProtocol: 'openai-chat' as const,
  textApiEndpoint: 'https://api.openai.com/v1',
  textModel: '',
  textModels: [],
  imageProvider: 'disabled' as const,
  imageProtocol: 'openai-responses' as const,
  imageApiEndpoint: 'https://api.openai.com/v1',
  imageOuterModel: '',
  imageModels: [],
  videoProvider: 'video-understanding-openai-compatible' as const,
  videoApiEndpoint: '',
  videoModel: '',
  videoModels: [],
};

type SecretPrefix = 'apiKey' | 'textApiKey' | 'imageApiKey' | 'videoApiKey';
type ModelCatalogKind = 'text' | 'image' | 'video';
type ModelCatalogProtocol = ModelConfigView['textProtocol'] | ModelConfigView['imageProtocol'] | 'openai-compatible';

interface ModelCatalogBuckets {
  textModels: string[];
  imageModels: string[];
  videoModels: string[];
}

interface RemoteModelSource {
  kind: ModelCatalogKind;
  endpoint: string;
  apiKey: string;
  protocol: ModelCatalogProtocol;
}

type PlatformModelSettingsMigrationPayload = Omit<PlatformModelSettings, 'providers'> & {
  providers: Array<PlatformModelSettings['providers'][number] & { apiKey?: string }>;
};

const MODEL_CATALOG_TIMEOUT_MS = 8_000;

function decryptStoredSecret(encrypted: string): string | undefined {
  if (!safeStorage.isEncryptionAvailable()) return undefined;
  try {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  } catch {
    return undefined;
  }
}

function readSecretStatus(config: StoredModelConfig, prefix: SecretPrefix): ModelSecretStatus {
  const source = config as Record<string, string | undefined>;
  const encrypted = source[`${prefix}Encrypted`];
  const plain = source[`${prefix}Plain`];
  if (encrypted && decryptStoredSecret(encrypted)) return 'available';
  if (plain) return 'available';
  if (encrypted) return 'requires-reauthorization';
  return 'missing';
}

function combineSecretStatus(statuses: ModelSecretStatus[]): ModelSecretStatus {
  if (statuses.includes('available')) return 'available';
  if (statuses.includes('requires-reauthorization')) return 'requires-reauthorization';
  return 'missing';
}

function readSecret(config: StoredModelConfig, prefix: SecretPrefix): string | undefined {
  const source = config as Record<string, string | undefined>;
  const encrypted = source[`${prefix}Encrypted`];
  if (encrypted) {
    const decrypted = decryptStoredSecret(encrypted);
    if (decrypted) return decrypted;
  }
  return source[`${prefix}Plain`];
}

function writeSecret(config: StoredModelConfig, prefix: SecretPrefix, value: string): void {
  const target = config as Record<string, string | undefined>;
  delete target[`${prefix}Encrypted`];
  delete target[`${prefix}Plain`];
  if (!value) return;
  if (safeStorage.isEncryptionAvailable()) {
    target[`${prefix}Encrypted`] = safeStorage.encryptString(value).toString('base64');
  } else {
    target[`${prefix}Plain`] = value;
  }
}

function clearSecret(config: StoredModelConfig, prefix: SecretPrefix): void {
  const target = config as Record<string, string | undefined>;
  delete target[`${prefix}Encrypted`];
  delete target[`${prefix}Plain`];
}

function compactModels(models: string[] | undefined, fallback: string[]): string[] {
  const normalized = (models ?? []).map((item) => item.trim()).filter(Boolean);
  return normalized.length ? Array.from(new Set(normalized)) : fallback;
}

function uniqueModels(models: Array<string | undefined>): string[] {
  return Array.from(new Set(models.map((model) => model?.trim()).filter((model): model is string => Boolean(model))));
}

function hasCatalogModels(catalog: ModelCatalogBuckets): boolean {
  return catalog.textModels.length > 0 || catalog.imageModels.length > 0 || catalog.videoModels.length > 0;
}

function catalogFromStoredConfig(config: StoredModelConfig): ModelCatalogBuckets {
  return {
    textModels: uniqueModels([config.textModel, ...(config.textModels ?? [])]),
    imageModels: uniqueModels([...(config.imageModels ?? [])]),
    videoModels: uniqueModels([config.videoModel, ...(config.videoModels ?? [])]),
  };
}

function mergeCatalogs(...catalogs: ModelCatalogBuckets[]): ModelCatalogBuckets {
  return {
    textModels: uniqueModels(catalogs.flatMap((catalog) => catalog.textModels)),
    imageModels: uniqueModels(catalogs.flatMap((catalog) => catalog.imageModels)),
    videoModels: uniqueModels(catalogs.flatMap((catalog) => catalog.videoModels)),
  };
}

function baseUrlWithoutKnownSuffix(endpoint: string): string {
  let base = endpoint.trim().replace(/\/+$/, '');
  base = base.replace(/\/chat\/completions$/i, '');
  base = base.replace(/\/responses$/i, '');
  base = base.replace(/\/messages$/i, '');
  base = base.replace(/\/models\/[^/]+:generateContent$/i, '');
  return base.replace(/\/+$/, '');
}

function resolveOpenAICompatibleModelsEndpoint(endpoint: string): string {
  const base = baseUrlWithoutKnownSuffix(endpoint);
  if (!base) return '';
  if (/\/models$/i.test(base)) return base;
  if (/\/v\d(?:beta)?$/i.test(base)) return `${base}/models`;
  return `${base}/v1/models`;
}

function resolveAnthropicModelsEndpoints(endpoint: string): string[] {
  const base = baseUrlWithoutKnownSuffix(endpoint);
  if (!base) return [];
  if (/\/models$/i.test(base)) return [base];
  if (/\/v\d(?:beta)?$/i.test(base)) return [`${base}/models`];
  return [`${base}/v1/models`, `${base}/models`];
}

function resolveGeminiModelsEndpoints(endpoint: string, apiKey: string): string[] {
  const base = baseUrlWithoutKnownSuffix(endpoint);
  if (!base) return [];
  const root = /\/v\d(?:beta)?$/i.test(base) ? base : `${base}/v1beta`;
  const modelsEndpoint = `${root}/models`;
  if (/generativelanguage\.googleapis\.com$/i.test(hostnameFromUrl(modelsEndpoint))) {
    return [`${modelsEndpoint}?key=${encodeURIComponent(apiKey)}`];
  }
  return [modelsEndpoint, resolveOpenAICompatibleModelsEndpoint(endpoint)].filter(Boolean);
}

function hostnameFromUrl(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return '';
  }
}

function resolveCatalogEndpoints(source: RemoteModelSource): string[] {
  if (source.protocol === 'anthropic-messages') {
    return resolveAnthropicModelsEndpoints(source.endpoint);
  }
  if (source.protocol === 'gemini-generate-content') {
    return resolveGeminiModelsEndpoints(source.endpoint, source.apiKey);
  }
  const endpoint = resolveOpenAICompatibleModelsEndpoint(source.endpoint);
  return endpoint ? [endpoint] : [];
}

function catalogRequestHeaders(source: RemoteModelSource, endpoint: string): Record<string, string> {
  const headers: Record<string, string> = { accept: 'application/json' };
  const hostname = hostnameFromUrl(endpoint).toLowerCase();
  if (source.protocol === 'anthropic-messages') {
    headers['x-api-key'] = source.apiKey;
    headers['anthropic-version'] = '2023-06-01';
    return headers;
  }
  if (source.protocol === 'gemini-generate-content' && hostname.endsWith('generativelanguage.googleapis.com')) {
    headers['x-goog-api-key'] = source.apiKey;
    return headers;
  }
  headers.authorization = resolveAuthorizationHeader(source.apiKey, endpoint);
  return headers;
}

function normalizeRemoteModelId(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/^models\//i, '');
}

function extractModelId(value: unknown): string | undefined {
  if (typeof value === 'string') return normalizeRemoteModelId(value);
  if (!value || typeof value !== 'object') return undefined;
  const record = value as Record<string, unknown>;
  const candidate = record.id ?? record.name ?? record.model;
  return typeof candidate === 'string' ? normalizeRemoteModelId(candidate) : undefined;
}

function extractRemoteModelIds(payload: unknown): string[] {
  if (Array.isArray(payload)) return uniqueModels(payload.map(extractModelId));
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  const container = Array.isArray(record.data)
    ? record.data
    : Array.isArray(record.models)
      ? record.models
      : Array.isArray(record.items)
        ? record.items
        : [];
  return uniqueModels(container.map(extractModelId));
}

function classifyRemoteModel(model: string, fallbackKind: ModelCatalogKind): ModelCatalogKind {
  const normalized = model.toLowerCase();
  if (/(^|[-_.:/])(video|veo|kling|runway|seedance|sora|pika|luma|wan|hailuo|minimax|gen[-_]?4?|image-to-video)([-_.:/]|$)/.test(normalized)) {
    return 'video';
  }
  if (/(^|[-_.:/])(image|img|imagen|dall-e|sdxl|stable-diffusion|flux|midjourney|recraft|ideogram)([-_.:/]|$)/.test(normalized)) {
    return 'image';
  }
  if (/(^|[-_.:/])(claude|gpt|o1|o3|o4|gemini|deepseek|qwen|kimi|doubao|llama|mistral|grok|ernie|hunyuan|moonshot|yi)([-_.:/]|$)/.test(normalized)) {
    return 'text';
  }
  return fallbackKind;
}

function textProtocolFromPlatformProtocol(protocol: PlatformModelSettings['providers'][number]['protocol']): ModelConfigView['textProtocol'] {
  if (protocol === 'anthropic-compatible') return 'anthropic-messages';
  if (protocol === 'gemini-native') return 'gemini-generate-content';
  return 'openai-chat';
}

function imageProtocolFromPlatformProtocol(protocol: PlatformModelSettings['providers'][number]['protocol']): ModelConfigView['imageProtocol'] {
  if (protocol === 'gemini-native') return 'gemini-generate-content';
  return 'openai-responses';
}

function isPlatformModelSettings(value: unknown): value is PlatformModelSettings {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<PlatformModelSettings>;
  return typeof record.version === 'string' && Array.isArray(record.providers);
}

function modelSettingsFromCapability(result: PlatformCapabilityInvokeResult): PlatformModelSettings | undefined {
  return isPlatformModelSettings(result.output) ? sanitizePlatformModelSettings(result.output) : undefined;
}

function sanitizePlatformModelSettings(settings: PlatformModelSettings): PlatformModelSettings {
  const modelsForCapability = (capability: PlatformModelCapabilityKind) =>
    uniqueModels(
      settings.providers
        .filter((provider) => provider.enabled && provider.capabilityKinds.includes(capability))
        .flatMap((provider) => provider.models),
    );
  const validDefaultModel = (modelId: string | undefined, capability: PlatformModelCapabilityKind) =>
    modelId && modelsForCapability(capability).includes(modelId) ? modelId : undefined;
  return {
    ...settings,
    defaultTextModelId: validDefaultModel(settings.defaultTextModelId, 'text'),
    defaultImageModelId: validDefaultModel(settings.defaultImageModelId, 'image'),
    defaultVideoModelId: validDefaultModel(settings.defaultVideoModelId, 'video'),
    providers: settings.providers.map((provider) => {
      const { apiKey: _apiKey, ...projection } = provider as PlatformModelSettings['providers'][number] & { apiKey?: string };
      return projection;
    }),
  };
}

function selectPlatformProvider(
  settings: PlatformModelSettings,
  capability: 'text' | 'image' | 'video',
  preferredProviderId?: string,
): PlatformModelSettings['providers'][number] | undefined {
  const candidates = settings.providers.filter(
    (provider) => provider.enabled && provider.capabilityKinds.includes(capability),
  );
  return candidates.find((provider) => provider.id === preferredProviderId) ?? candidates[0];
}

function configuredStatus(configured: boolean, authType?: 'api-key' | 'oauth' | 'none'): ModelSecretStatus {
  if (authType === 'none') return 'available';
  return configured ? 'available' : 'missing';
}

function platformProviderConfigured(provider: PlatformModelSettings['providers'][number] | undefined): boolean {
  if (!provider) return false;
  return provider.authType === 'none' || provider.apiKeyConfigured;
}

function platformDefaultModel(defaultModelId: string | undefined, models: string[]): string {
  return defaultModelId && models.includes(defaultModelId) ? defaultModelId : models[0] ?? '';
}

function platformReadiness(
  textProvider: PlatformModelSettings['providers'][number] | undefined,
  textModels: string[],
): ModelConfigView['platformReadiness'] {
  if (!textProvider) {
    return {
      state: 'needs-setup',
      reasons: [
        {
          code: 'platform-text-provider-missing',
          message: '平台模型设置中尚未启用文字 Provider。',
          fixable: true,
        },
      ],
      setupActions: ['open-platform-model-settings'],
    };
  }
  if (!textModels.length) {
    return {
      state: 'needs-setup',
      reasons: [
        {
          code: 'platform-text-model-missing',
          message: '平台文字 Provider 尚未配置显式模型 ID。',
          fixable: true,
        },
      ],
      setupActions: ['open-platform-model-settings'],
    };
  }
  if (!platformProviderConfigured(textProvider)) {
    return {
      state: 'needs-setup',
      reasons: [
        {
          code: 'platform-text-secret-missing',
          message: '平台文字 Provider 尚未配置可用凭据。',
          fixable: true,
        },
      ],
      setupActions: ['open-platform-model-settings'],
    };
  }
  return {
    state: 'ready',
    reasons: [],
    setupActions: [],
  };
}

function platformModelConfigView(
  settings: PlatformModelSettings,
  bridge: PlatformHostBridgeClient,
  fallback: ModelConfigView,
): ModelConfigView {
  const textProvider = selectPlatformProvider(settings, 'text', settings.defaultAgentProviderId);
  const imageProvider = selectPlatformProvider(settings, 'image');
  const videoProvider = selectPlatformProvider(settings, 'video');
  const snapshot = bridge.status().snapshot;
  const textModels = uniqueModels(
    settings.providers
      .filter((provider) => provider.enabled && provider.capabilityKinds.includes('text'))
      .flatMap((provider) => provider.models),
  );
  const imageModels = uniqueModels(imageProvider?.models ?? []);
  const videoModels = uniqueModels(videoProvider?.models ?? []);
  const textModel = platformDefaultModel(settings.defaultTextModelId, textModels);
  const imageModel = platformDefaultModel(settings.defaultImageModelId, imageModels);
  const videoModel = platformDefaultModel(settings.defaultVideoModelId, videoModels);
  const bridgeStatus = bridge.status();
  const bridgeDescriptor = bridgeStatus.bridge;

  return {
    ...fallback,
    source: 'lime-desktop-platform',
    platformManaged: true,
    platformModelSettings: settings,
    agentProviderPreference: textProvider?.id,
    imageProviderPreference: imageProvider?.id,
    videoProviderPreference: videoProvider?.id,
    platformReadiness: platformReadiness(textProvider, textModels),
    platformHost: bridgeDescriptor
      ? {
        appId: bridgeDescriptor.appId,
        entryKey: bridgeDescriptor.entryKey,
        endpoint: bridgeDescriptor.endpoint,
        modelSettingsVersion: snapshot?.modelSettingsVersion ?? settings.version,
        snapshot,
      }
      : undefined,
    textProtocol: textProvider ? textProtocolFromPlatformProtocol(textProvider.protocol) : fallback.textProtocol,
    textApiEndpoint: textProvider?.baseUrl ?? '',
    apiEndpoint: textProvider?.baseUrl ?? '',
    hasTextApiKey: platformProviderConfigured(textProvider),
    hasApiKey: platformProviderConfigured(textProvider),
    textApiKeyStatus: textProvider
      ? configuredStatus(textProvider.apiKeyConfigured, textProvider.authType)
      : 'missing',
    textModel,
    textModels,
    imageProvider: imageProvider ? 'openai-responses' : 'disabled',
    imageProtocol: imageProvider ? imageProtocolFromPlatformProtocol(imageProvider.protocol) : fallback.imageProtocol,
    imageApiEndpoint: imageProvider?.baseUrl ?? '',
    imageOuterModel: imageModel,
    hasImageApiKey: platformProviderConfigured(imageProvider),
    imageApiKeyStatus: imageProvider
      ? configuredStatus(imageProvider.apiKeyConfigured, imageProvider.authType)
      : 'missing',
    imageModels,
    videoProvider: videoProvider ? 'generic-http' : 'disabled',
    videoApiEndpoint: videoProvider?.baseUrl ?? '',
    hasVideoApiKey: platformProviderConfigured(videoProvider),
    videoApiKeyStatus: videoProvider
      ? configuredStatus(videoProvider.apiKeyConfigured, videoProvider.authType)
      : 'missing',
    videoModel,
    videoModels,
    updatedAt: settings.updatedAt,
  };
}

function platformCatalog(settings: PlatformModelSettings): ModelCatalogView {
  const textModels = uniqueModels(
    settings.providers
      .filter((provider) => provider.enabled && provider.capabilityKinds.includes('text'))
      .flatMap((provider) => provider.models),
  );
  const imageModels = uniqueModels(
    settings.providers
      .filter((provider) => provider.enabled && provider.capabilityKinds.includes('image'))
      .flatMap((provider) => provider.models),
  );
  const videoModels = uniqueModels(
    settings.providers
      .filter((provider) => provider.enabled && provider.capabilityKinds.includes('video'))
      .flatMap((provider) => provider.models),
  );
  return {
    textModels,
    imageModels,
    videoModels,
    source: 'lime-desktop-platform',
    updatedAt: settings.updatedAt,
  };
}

function textProviderId(protocol: ModelConfigView['textProtocol']): string {
  if (protocol === 'anthropic-messages') return 'content-studio-text-anthropic';
  if (protocol === 'gemini-generate-content') return 'content-studio-text-gemini';
  return 'content-studio-text-openai';
}

function imageProviderId(protocol: ModelConfigView['imageProtocol']): string {
  if (protocol === 'gemini-generate-content') return 'content-studio-image-gemini';
  return 'content-studio-image-openai';
}

function protocolFromTextConfig(protocol: ModelConfigView['textProtocol']): PlatformModelSettings['providers'][number]['protocol'] {
  if (protocol === 'anthropic-messages') return 'anthropic-compatible';
  if (protocol === 'gemini-generate-content') return 'gemini-native';
  return 'openai-compatible';
}

function protocolFromImageConfig(protocol: ModelConfigView['imageProtocol']): PlatformModelSettings['providers'][number]['protocol'] {
  if (protocol === 'gemini-generate-content') return 'gemini-native';
  return 'openai-compatible';
}

function hasStoredSecrets(config: StoredModelConfig): boolean {
  return Boolean(
    config.apiKeyEncrypted ||
      config.apiKeyPlain ||
      config.textApiKeyEncrypted ||
      config.textApiKeyPlain ||
      config.imageApiKeyEncrypted ||
      config.imageApiKeyPlain ||
      config.videoApiKeyEncrypted ||
      config.videoApiKeyPlain,
  );
}

function migrationMarkerVersion(config: StoredModelConfig): string {
  return [
    config.updatedAt ?? 'unknown',
    config.textApiEndpoint ?? '',
    config.textProtocol ?? '',
    config.textModel ?? '',
    (config.textModels ?? []).join(','),
    config.imageApiEndpoint ?? '',
    config.imageProtocol ?? '',
    config.imageOuterModel ?? '',
    (config.imageModels ?? []).join(','),
    config.videoApiEndpoint ?? '',
    config.videoModel ?? '',
    (config.videoModels ?? []).join(','),
    hasStoredSecrets(config) ? 'has-secret' : 'no-secret',
  ].join('|');
}

function providerDisplayName(kind: 'text' | 'image' | 'video', protocol: string): string {
  const prefix = kind === 'text' ? 'Content Studio 文字' : kind === 'image' ? 'Content Studio 图片' : 'Content Studio 视频';
  return `${prefix} ${protocol}`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return {};
  }
}

async function fetchRemoteModelIds(source: RemoteModelSource): Promise<string[]> {
  const endpoints = resolveCatalogEndpoints(source);
  for (const endpoint of endpoints) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), MODEL_CATALOG_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: catalogRequestHeaders(source, endpoint),
        signal: controller.signal,
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) {
        if (response.status === 404 || response.status === 405) continue;
        throw new Error(`HTTP ${response.status}`);
      }
      const models = extractRemoteModelIds(payload);
      if (models.length > 0) return models;
    } catch {
      // 模型目录只是候选来源；失败时回落到已保存配置，避免影响主工作台启动。
    } finally {
      clearTimeout(timeout);
    }
  }
  return [];
}

export class ModelConfigStore {
  private readonly filePath = join(app.getPath('userData'), 'model-config.json');
  private readonly migrationFilePath = join(app.getPath('userData'), 'model-config-platform-migration.json');

  constructor(private readonly platformHost?: PlatformHostBridgeClient) {}

  async readView(): Promise<ModelConfigView> {
    const localView = await this.readLocalView();
    await this.migrateLocalConfigToPlatformIfNeeded();
    const platformSettings = await this.readPlatformModelSettings();
    if (platformSettings) {
      return platformModelConfigView(platformSettings, this.platformHost!, localView);
    }
    return localView;
  }

  async readLocalView(): Promise<ModelConfigView> {
    const config = await this.readRaw();
    const textApiEndpoint = config.textApiEndpoint ?? config.apiEndpoint ?? DEFAULT_CONFIG.textApiEndpoint;
    const textProtocol = isTextGenerationProtocol(config.textProtocol) ? config.textProtocol : DEFAULT_CONFIG.textProtocol;
    const imageProtocol = isImageGenerationProtocol(config.imageProtocol) ? config.imageProtocol : DEFAULT_CONFIG.imageProtocol;
    const textApiKeyStatus = combineSecretStatus([readSecretStatus(config, 'textApiKey'), readSecretStatus(config, 'apiKey')]);
    const imageApiKeyStatus = readSecretStatus(config, 'imageApiKey');
    const videoApiKeyStatus = readSecretStatus(config, 'videoApiKey');
    const hasTextApiKey = textApiKeyStatus === 'available';
    const hasImageApiKey = imageApiKeyStatus === 'available';
    const hasVideoApiKey = videoApiKeyStatus === 'available';
    const imageProvider = config.imageProvider ?? (hasImageApiKey ? 'openai-responses' : DEFAULT_CONFIG.imageProvider);
    const videoApiEndpoint = config.videoApiEndpoint ?? DEFAULT_CONFIG.videoApiEndpoint;
    const videoProvider = config.videoProvider ?? (hasVideoApiKey && videoApiEndpoint ? 'video-understanding-openai-compatible' : 'disabled');
    return {
      apiEndpoint: textApiEndpoint,
      hasApiKey: hasTextApiKey,
      safeStorageAvailable: safeStorage.isEncryptionAvailable(),
      source: 'content-studio-local',
      platformManaged: false,
      platformReadiness: {
        state: 'disabled',
        reasons: [
          {
            code: 'platform-host-not-connected',
            message: '未连接 lime-desktop-platform 宿主，当前只使用 Content Studio 本地配置。',
            fixable: true,
          },
        ],
        setupActions: ['start-lime-desktop-platform'],
      },
      textProvider: config.textProvider ?? DEFAULT_CONFIG.textProvider,
      textProtocol,
      textApiEndpoint,
      hasTextApiKey,
      textApiKeyStatus,
      agentProviderPreference: undefined,
      textModel: config.textModel ?? DEFAULT_CONFIG.textModel,
      textModels: compactModels([
        ...(config.textModels ?? []),
        ...(config.videoModels ?? []),
      ], DEFAULT_CONFIG.textModels),
      imageProvider,
      imageProtocol,
      imageApiEndpoint: config.imageApiEndpoint ?? DEFAULT_CONFIG.imageApiEndpoint,
      imageOuterModel: config.imageOuterModel ?? DEFAULT_CONFIG.imageOuterModel,
      hasImageApiKey,
      imageApiKeyStatus,
      imageModels: compactModels(config.imageModels, DEFAULT_CONFIG.imageModels),
      videoProvider,
      videoApiEndpoint,
      hasVideoApiKey,
      videoApiKeyStatus,
      videoModel: config.videoModel ?? DEFAULT_CONFIG.videoModel,
      videoModels: compactModels(config.videoModels, DEFAULT_CONFIG.videoModels),
      updatedAt: config.updatedAt,
    };
  }

  async save(input: SaveModelConfigInput): Promise<ModelConfigView> {
    const platformHost = this.platformHost;
    const connectedPlatformHost = platformHost && await platformHost.ensureConnected() ? platformHost : undefined;
    if (connectedPlatformHost) {
      await this.migrateLocalConfigToPlatformIfNeeded();
      const platformSettings = await this.readPlatformModelSettings();
      if (platformSettings) {
        return platformModelConfigView(platformSettings, connectedPlatformHost, await this.readLocalView());
      }
      return this.readLocalView();
    }
    const config = await this.readRaw();
    if (input.apiEndpoint !== undefined) {
      config.textApiEndpoint = input.apiEndpoint.trim() || DEFAULT_CONFIG.textApiEndpoint;
      config.apiEndpoint = config.textApiEndpoint;
    }
    if (input.textApiEndpoint !== undefined) {
      config.textApiEndpoint = input.textApiEndpoint.trim() || DEFAULT_CONFIG.textApiEndpoint;
      config.apiEndpoint = config.textApiEndpoint;
    }
    if (input.textModel !== undefined) config.textModel = input.textModel.trim() || DEFAULT_CONFIG.textModel;
    if (input.textModels !== undefined) config.textModels = compactModels(input.textModels, DEFAULT_CONFIG.textModels);
    if (input.textProtocol !== undefined) config.textProtocol = input.textProtocol;

    if (input.imageProvider !== undefined) config.imageProvider = input.imageProvider;
    if (input.imageProtocol !== undefined) config.imageProtocol = input.imageProtocol;
    if (input.imageApiEndpoint !== undefined) config.imageApiEndpoint = input.imageApiEndpoint.trim() || DEFAULT_CONFIG.imageApiEndpoint;
    if (input.imageOuterModel !== undefined) config.imageOuterModel = input.imageOuterModel.trim() || DEFAULT_CONFIG.imageOuterModel;
    if (input.imageModels !== undefined) config.imageModels = compactModels(input.imageModels, DEFAULT_CONFIG.imageModels);

    if (input.videoProvider !== undefined) config.videoProvider = input.videoProvider;
    if (input.videoApiEndpoint !== undefined) config.videoApiEndpoint = input.videoApiEndpoint.trim();
    if (input.videoModel !== undefined) config.videoModel = input.videoModel.trim() || DEFAULT_CONFIG.videoModel;
    if (input.videoModels !== undefined) config.videoModels = compactModels(input.videoModels, DEFAULT_CONFIG.videoModels);
    if (input.videoProvider === undefined && config.videoApiEndpoint && (config.videoApiKeyEncrypted || config.videoApiKeyPlain)) {
      config.videoProvider = 'video-understanding-openai-compatible';
    }

    if (input.clearApiKey || input.clearTextApiKey) {
      clearSecret(config, 'apiKey');
      clearSecret(config, 'textApiKey');
    }
    if (input.clearImageApiKey) clearSecret(config, 'imageApiKey');
    if (input.clearVideoApiKey) clearSecret(config, 'videoApiKey');

    if (input.apiKey !== undefined) {
      const key = input.apiKey.trim();
      writeSecret(config, 'apiKey', key);
      writeSecret(config, 'textApiKey', key);
    }
    if (input.textApiKey !== undefined) writeSecret(config, 'textApiKey', input.textApiKey.trim());
    if (input.imageApiKey !== undefined) {
      writeSecret(config, 'imageApiKey', input.imageApiKey.trim());
      if (input.imageApiKey.trim()) config.imageProvider = 'openai-responses';
    }
    if (input.videoApiKey !== undefined) {
      const key = input.videoApiKey.trim();
      writeSecret(config, 'videoApiKey', key);
      if (key && config.videoApiEndpoint) config.videoProvider = 'video-understanding-openai-compatible';
    }

    config.updatedAt = new Date().toISOString();
    await writeJsonFile(this.filePath, config);
    return this.readView();
  }

  async getApiKey(): Promise<string | undefined> {
    return this.getTextApiKey();
  }

  async getTextApiKey(): Promise<string | undefined> {
    if (await this.platformHost?.ensureConnected()) {
      return undefined;
    }
    const config = await this.readRaw();
    return readSecret(config, 'textApiKey') ?? readSecret(config, 'apiKey');
  }

  async getImageApiKey(): Promise<string | undefined> {
    if (await this.platformHost?.ensureConnected()) {
      return undefined;
    }
    return readSecret(await this.readRaw(), 'imageApiKey');
  }

  async getVideoApiKey(): Promise<string | undefined> {
    if (await this.platformHost?.ensureConnected()) {
      return undefined;
    }
    return readSecret(await this.readRaw(), 'videoApiKey');
  }

  async readCatalog(): Promise<ModelCatalogView> {
    const localCatalog = await this.readLocalCatalog();
    await this.migrateLocalConfigToPlatformIfNeeded();
    const platformSettings = await this.readPlatformModelSettings();
    return platformSettings ? platformCatalog(platformSettings) : localCatalog;
  }

  async readLocalCatalog(): Promise<ModelCatalogView> {
    const config = await this.readRaw();
    const view = await this.readLocalView();
    const remoteCatalog = await this.readRemoteCatalog(view);
    const hasRemoteCatalog = hasCatalogModels(remoteCatalog);
    const configuredCatalog = catalogFromStoredConfig(config);
    const hasConfiguredCatalog = hasCatalogModels(configuredCatalog);
    const catalog = mergeCatalogs(remoteCatalog, configuredCatalog);
    return {
      textModels: catalog.textModels,
      imageModels: catalog.imageModels,
      videoModels: catalog.videoModels,
      source: hasRemoteCatalog
        ? 'provider'
        : hasConfiguredCatalog || view.hasTextApiKey || view.hasImageApiKey || view.hasVideoApiKey
          ? 'configured'
          : 'offline-seed',
      updatedAt: new Date().toISOString(),
    };
  }

  private async readRemoteCatalog(view: ModelConfigView): Promise<ModelCatalogBuckets> {
    const textApiKey = await this.getTextApiKey();
    const imageApiKey = await this.getImageApiKey();
    const videoApiKey = await this.getVideoApiKey();
    const sources: RemoteModelSource[] = [
      textApiKey && view.textApiEndpoint
        ? { kind: 'text', endpoint: view.textApiEndpoint, apiKey: textApiKey, protocol: view.textProtocol }
        : undefined,
      imageApiKey && view.imageApiEndpoint
        ? { kind: 'image', endpoint: view.imageApiEndpoint, apiKey: imageApiKey, protocol: view.imageProtocol }
        : undefined,
      videoApiKey && view.videoApiEndpoint
        ? { kind: 'video', endpoint: view.videoApiEndpoint, apiKey: videoApiKey, protocol: 'openai-compatible' }
        : undefined,
    ].filter((source): source is RemoteModelSource => Boolean(source));
    const buckets: ModelCatalogBuckets = { textModels: [], imageModels: [], videoModels: [] };
    const results = await Promise.all(sources.map(async (source) => ({ source, models: await fetchRemoteModelIds(source) })));
    for (const result of results) {
      for (const model of result.models) {
        const kind = classifyRemoteModel(model, result.source.kind);
        if (kind === 'text') buckets.textModels.push(model);
        if (kind === 'image') buckets.imageModels.push(model);
        if (kind === 'video') buckets.videoModels.push(model);
      }
    }
    return {
      textModels: uniqueModels(buckets.textModels),
      imageModels: uniqueModels(buckets.imageModels),
      videoModels: uniqueModels(buckets.videoModels),
    };
  }

  private readRaw(): Promise<StoredModelConfig> {
    return readJsonFile<StoredModelConfig>(this.filePath, {});
  }

  private async readPlatformModelSettings(): Promise<PlatformModelSettings | undefined> {
    const platformHost = this.platformHost;
    const connectedPlatformHost = platformHost && await platformHost.ensureConnected() ? platformHost : undefined;
    if (!connectedPlatformHost) return undefined;
    const result = await connectedPlatformHost.invokeCapability({
      capability: 'lime.modelSettings',
      operation: 'model-settings/read',
      input: { appId: 'content-studio' },
    });
    return modelSettingsFromCapability(result);
  }

  private async projectSaveInputToLocalConfig(
    config: StoredModelConfig,
    input: SaveModelConfigInput,
  ): Promise<StoredModelConfig> {
    const next: StoredModelConfig = { ...config };
    if (input.apiEndpoint !== undefined) {
      next.textApiEndpoint = input.apiEndpoint.trim() || DEFAULT_CONFIG.textApiEndpoint;
      next.apiEndpoint = next.textApiEndpoint;
    }
    if (input.textApiEndpoint !== undefined) {
      next.textApiEndpoint = input.textApiEndpoint.trim() || DEFAULT_CONFIG.textApiEndpoint;
      next.apiEndpoint = next.textApiEndpoint;
    }
    if (input.textModel !== undefined) next.textModel = input.textModel.trim() || DEFAULT_CONFIG.textModel;
    if (input.textModels !== undefined) next.textModels = compactModels(input.textModels, DEFAULT_CONFIG.textModels);
    if (input.textProtocol !== undefined) next.textProtocol = input.textProtocol;
    if (input.imageProvider !== undefined) next.imageProvider = input.imageProvider;
    if (input.imageProtocol !== undefined) next.imageProtocol = input.imageProtocol;
    if (input.imageApiEndpoint !== undefined) next.imageApiEndpoint = input.imageApiEndpoint.trim() || DEFAULT_CONFIG.imageApiEndpoint;
    if (input.imageOuterModel !== undefined) next.imageOuterModel = input.imageOuterModel.trim() || DEFAULT_CONFIG.imageOuterModel;
    if (input.imageModels !== undefined) next.imageModels = compactModels(input.imageModels, DEFAULT_CONFIG.imageModels);
    if (input.videoProvider !== undefined) next.videoProvider = input.videoProvider;
    if (input.videoApiEndpoint !== undefined) next.videoApiEndpoint = input.videoApiEndpoint.trim();
    if (input.videoModel !== undefined) next.videoModel = input.videoModel.trim() || DEFAULT_CONFIG.videoModel;
    if (input.videoModels !== undefined) next.videoModels = compactModels(input.videoModels, DEFAULT_CONFIG.videoModels);
    if (input.clearApiKey || input.clearTextApiKey) {
      clearSecret(next, 'apiKey');
      clearSecret(next, 'textApiKey');
    }
    if (input.clearImageApiKey) clearSecret(next, 'imageApiKey');
    if (input.clearVideoApiKey) clearSecret(next, 'videoApiKey');
    if (input.apiKey !== undefined) {
      const key = input.apiKey.trim();
      writeSecret(next, 'apiKey', key);
      writeSecret(next, 'textApiKey', key);
    }
    if (input.textApiKey !== undefined) writeSecret(next, 'textApiKey', input.textApiKey.trim());
    if (input.imageApiKey !== undefined) writeSecret(next, 'imageApiKey', input.imageApiKey.trim());
    if (input.videoApiKey !== undefined) writeSecret(next, 'videoApiKey', input.videoApiKey.trim());
    next.updatedAt = new Date().toISOString();
    return next;
  }

  private async migrateLocalConfigToPlatformIfNeeded(): Promise<void> {
    const platformHost = this.platformHost;
    const connectedPlatformHost = platformHost && await platformHost.ensureConnected() ? platformHost : undefined;
    if (!connectedPlatformHost) return;
    const config = await this.readRaw();
    if (!hasStoredSecrets(config) && !config.textApiEndpoint && !config.imageApiEndpoint && !config.videoApiEndpoint) {
      return;
    }
    const markerVersion = migrationMarkerVersion(config);
    const marker = await readJsonFile<{ version?: string; migratedAt?: string }>(this.migrationFilePath, {});
    if (marker.version === markerVersion) {
      return;
    }
    await this.savePlatformModelSettings(config, connectedPlatformHost);
    const sanitized = await this.writeSanitizedLocalConfig(config);
    await writeJsonFile(this.migrationFilePath, {
      version: migrationMarkerVersion(sanitized),
      migratedAt: new Date().toISOString(),
      target: 'lime-desktop-platform',
      plaintextSecrets: false,
    });
  }

  private async savePlatformModelSettings(
    config: StoredModelConfig,
    connectedPlatformHost?: PlatformHostBridgeClient,
  ): Promise<PlatformModelSettings> {
    const platformHost = connectedPlatformHost ?? this.platformHost;
    if (!platformHost) {
      throw new Error('未检测到 lime-desktop-platform runtime bridge。');
    }
    const textProtocol = isTextGenerationProtocol(config.textProtocol) ? config.textProtocol : DEFAULT_CONFIG.textProtocol;
    const imageProtocol = isImageGenerationProtocol(config.imageProtocol) ? config.imageProtocol : DEFAULT_CONFIG.imageProtocol;
    const textId = textProviderId(textProtocol);
    const imageId = imageProviderId(imageProtocol);
    const videoId = 'content-studio-video-openai-compatible';
    const textKey = readSecret(config, 'textApiKey') ?? readSecret(config, 'apiKey');
    const imageKey = readSecret(config, 'imageApiKey');
    const videoKey = readSecret(config, 'videoApiKey');
    const providers: PlatformModelSettingsMigrationPayload['providers'] = [];
    const textModels = compactModels(config.textModels, DEFAULT_CONFIG.textModels);
    providers.push({
      id: textId,
      displayName: providerDisplayName('text', textProtocol),
      protocol: protocolFromTextConfig(textProtocol),
      capabilityKinds: ['text'],
      enabled: true,
      apiKeyConfigured: Boolean(textKey),
      apiKey: textKey,
      authType: 'api-key',
      baseUrl: config.textApiEndpoint ?? config.apiEndpoint ?? DEFAULT_CONFIG.textApiEndpoint,
      useResponsesApi: textProtocol === 'openai-chat',
      models: textModels,
    });
    if (config.imageProvider !== 'disabled' || imageKey || config.imageApiEndpoint || config.imageModels?.length) {
      providers.push({
        id: imageId,
        displayName: providerDisplayName('image', imageProtocol),
        protocol: protocolFromImageConfig(imageProtocol),
        capabilityKinds: ['image'],
        enabled: config.imageProvider !== 'disabled',
        apiKeyConfigured: Boolean(imageKey),
        apiKey: imageKey,
        authType: 'api-key',
        baseUrl: config.imageApiEndpoint ?? DEFAULT_CONFIG.imageApiEndpoint,
        useResponsesApi: imageProtocol === 'openai-responses',
        models: compactModels(config.imageModels, DEFAULT_CONFIG.imageModels),
      });
    }
    if (config.videoApiEndpoint || videoKey || config.videoModels?.length) {
      providers.push({
        id: videoId,
        displayName: providerDisplayName('video', 'openai-compatible'),
        protocol: 'openai-compatible',
        capabilityKinds: ['video'],
        enabled: config.videoProvider !== 'disabled',
        apiKeyConfigured: Boolean(videoKey),
        apiKey: videoKey,
        authType: 'api-key',
        baseUrl: config.videoApiEndpoint,
        useResponsesApi: false,
        models: compactModels(config.videoModels, DEFAULT_CONFIG.videoModels),
      });
    }
    const result = await platformHost.invokeCapability({
      capability: 'lime.modelSettings',
      operation: 'model-settings/save',
      input: {
        settings: {
          version: '0',
          updatedAt: new Date().toISOString(),
          defaultAgentProviderId: textId,
          defaultTextModelId: config.textModel ?? textModels[0] ?? DEFAULT_CONFIG.textModel,
          defaultImageModelId: config.imageOuterModel ?? providers.find((provider) => provider.id === imageId)?.models[0],
          defaultVideoModelId: config.videoModel ?? providers.find((provider) => provider.id === videoId)?.models[0],
          providers,
        },
        source: 'content-studio-local-migration',
      },
    });
    const settings = modelSettingsFromCapability(result);
    if (!settings) {
      throw new Error('lime-desktop-platform 未返回合法模型设置 projection。');
    }
    return settings;
  }

  private async writeSanitizedLocalConfig(config: StoredModelConfig): Promise<StoredModelConfig> {
    const next: StoredModelConfig = { ...config };
    clearSecret(next, 'apiKey');
    clearSecret(next, 'textApiKey');
    clearSecret(next, 'imageApiKey');
    clearSecret(next, 'videoApiKey');
    next.updatedAt = new Date().toISOString();
    await writeJsonFile(this.filePath, next);
    return next;
  }
}
