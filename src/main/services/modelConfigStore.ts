import { app, safeStorage } from 'electron';
import { join } from 'node:path';
import { isImageGenerationProtocol, isTextGenerationProtocol, type ModelCatalogView, type ModelConfigView, type ModelSecretStatus, type SaveModelConfigInput } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';

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
  updatedAt?: string;
}

const DEFAULT_CONFIG = {
  textProvider: 'anthropic-claude-sdk' as const,
  textProtocol: 'claude-sdk' as const,
  textApiEndpoint: 'https://api.anthropic.com',
  textModel: 'claude-sonnet-4-5',
  imageProvider: 'disabled' as const,
  imageProtocol: 'openai-responses' as const,
  imageApiEndpoint: 'https://api.openai.com/v1',
  imageOuterModel: 'gpt-5.5',
  imageModels: ['gpt-image-2'],
  videoProvider: 'disabled' as const,
  videoApiEndpoint: '',
  videoModel: 'veo-3.1',
};

type SecretPrefix = 'apiKey' | 'textApiKey' | 'imageApiKey' | 'videoApiKey';

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

export class ModelConfigStore {
  private readonly filePath = join(app.getPath('userData'), 'model-config.json');

  async readView(): Promise<ModelConfigView> {
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
    const videoProvider = config.videoProvider ?? (hasVideoApiKey && videoApiEndpoint ? 'generic-http' : DEFAULT_CONFIG.videoProvider);
    return {
      apiEndpoint: textApiEndpoint,
      hasApiKey: hasTextApiKey,
      safeStorageAvailable: safeStorage.isEncryptionAvailable(),
      textProvider: config.textProvider ?? DEFAULT_CONFIG.textProvider,
      textProtocol,
      textApiEndpoint,
      hasTextApiKey,
      textApiKeyStatus,
      textModel: config.textModel ?? DEFAULT_CONFIG.textModel,
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
      updatedAt: config.updatedAt,
    };
  }

  async save(input: SaveModelConfigInput): Promise<ModelConfigView> {
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
    if (input.textProtocol !== undefined) config.textProtocol = input.textProtocol;

    if (input.imageProvider !== undefined) config.imageProvider = input.imageProvider;
    if (input.imageProtocol !== undefined) config.imageProtocol = input.imageProtocol;
    if (input.imageApiEndpoint !== undefined) config.imageApiEndpoint = input.imageApiEndpoint.trim() || DEFAULT_CONFIG.imageApiEndpoint;
    if (input.imageOuterModel !== undefined) config.imageOuterModel = input.imageOuterModel.trim() || DEFAULT_CONFIG.imageOuterModel;
    if (input.imageModels !== undefined) config.imageModels = compactModels(input.imageModels, DEFAULT_CONFIG.imageModels);

    if (input.videoProvider !== undefined) config.videoProvider = input.videoProvider;
    if (input.videoApiEndpoint !== undefined) config.videoApiEndpoint = input.videoApiEndpoint.trim();
    if (input.videoModel !== undefined) config.videoModel = input.videoModel.trim() || DEFAULT_CONFIG.videoModel;
    if (input.videoProvider === undefined && config.videoApiEndpoint && (config.videoApiKeyEncrypted || config.videoApiKeyPlain)) {
      config.videoProvider = 'generic-http';
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
      if (key && config.videoApiEndpoint) config.videoProvider = 'generic-http';
    }

    config.updatedAt = new Date().toISOString();
    await writeJsonFile(this.filePath, config);
    return this.readView();
  }

  async getApiKey(): Promise<string | undefined> {
    return this.getTextApiKey();
  }

  async getTextApiKey(): Promise<string | undefined> {
    const config = await this.readRaw();
    return readSecret(config, 'textApiKey') ?? readSecret(config, 'apiKey');
  }

  async getImageApiKey(): Promise<string | undefined> {
    return readSecret(await this.readRaw(), 'imageApiKey');
  }

  async getVideoApiKey(): Promise<string | undefined> {
    return readSecret(await this.readRaw(), 'videoApiKey');
  }

  async readCatalog(): Promise<ModelCatalogView> {
    const view = await this.readView();
    return {
      textModels: Array.from(new Set([view.textModel, 'claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5', 'gpt-5.5', 'gemini-3-pro-preview'].filter(Boolean))),
      imageModels: Array.from(new Set([...view.imageModels, 'gpt-image-2', 'gemini-3-pro-image-preview'].filter(Boolean))),
      videoModels: Array.from(new Set([view.videoModel, 'veo-3.1', 'kling-2.1', 'runway-gen-4'].filter(Boolean))),
      source: view.hasTextApiKey || view.hasImageApiKey || view.hasVideoApiKey ? 'configured' : 'offline-seed',
      updatedAt: new Date().toISOString(),
    };
  }

  private readRaw(): Promise<StoredModelConfig> {
    return readJsonFile<StoredModelConfig>(this.filePath, {});
  }
}
