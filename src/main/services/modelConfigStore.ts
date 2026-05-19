import { app, safeStorage } from 'electron';
import { join } from 'node:path';
import type { ModelCatalogView, ModelConfigView, SaveModelConfigInput } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';

interface StoredModelConfig {
  apiEndpoint?: string;
  apiKeyEncrypted?: string;
  apiKeyPlain?: string;
  textProvider?: ModelConfigView['textProvider'];
  textApiEndpoint?: string;
  textApiKeyEncrypted?: string;
  textApiKeyPlain?: string;
  textModel?: string;
  imageProvider?: ModelConfigView['imageProvider'];
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
  textApiEndpoint: 'https://api.anthropic.com',
  textModel: 'claude-sonnet-4-5',
  imageProvider: 'disabled' as const,
  imageApiEndpoint: 'https://api.openai.com/v1',
  imageOuterModel: 'gpt-5.5',
  imageModels: ['gpt-image-2'],
  videoProvider: 'disabled' as const,
  videoApiEndpoint: '',
  videoModel: 'veo-3.1',
};

type SecretPrefix = 'apiKey' | 'textApiKey' | 'imageApiKey' | 'videoApiKey';

function readSecret(config: StoredModelConfig, prefix: SecretPrefix): string | undefined {
  const source = config as Record<string, string | undefined>;
  const encrypted = source[`${prefix}Encrypted`];
  if (encrypted) return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
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
    const hasTextApiKey = Boolean(config.textApiKeyEncrypted || config.textApiKeyPlain || config.apiKeyEncrypted || config.apiKeyPlain);
    const imageProvider = config.imageProvider ?? (config.imageApiKeyEncrypted || config.imageApiKeyPlain ? 'openai-responses' : DEFAULT_CONFIG.imageProvider);
    const hasVideoApiKey = Boolean(config.videoApiKeyEncrypted || config.videoApiKeyPlain);
    const videoApiEndpoint = config.videoApiEndpoint ?? DEFAULT_CONFIG.videoApiEndpoint;
    const videoProvider = config.videoProvider ?? (hasVideoApiKey && videoApiEndpoint ? 'generic-http' : DEFAULT_CONFIG.videoProvider);
    return {
      apiEndpoint: textApiEndpoint,
      hasApiKey: hasTextApiKey,
      textProvider: config.textProvider ?? DEFAULT_CONFIG.textProvider,
      textApiEndpoint,
      hasTextApiKey,
      textModel: config.textModel ?? DEFAULT_CONFIG.textModel,
      imageProvider,
      imageApiEndpoint: config.imageApiEndpoint ?? DEFAULT_CONFIG.imageApiEndpoint,
      imageOuterModel: config.imageOuterModel ?? DEFAULT_CONFIG.imageOuterModel,
      hasImageApiKey: Boolean(config.imageApiKeyEncrypted || config.imageApiKeyPlain),
      imageModels: compactModels(config.imageModels, DEFAULT_CONFIG.imageModels),
      videoProvider,
      videoApiEndpoint,
      hasVideoApiKey,
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

    if (input.imageProvider !== undefined) config.imageProvider = input.imageProvider;
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
      textModels: Array.from(new Set([view.textModel, 'claude-sonnet-4-5', 'claude-opus-4-1', 'claude-haiku-4-5'].filter(Boolean))),
      imageModels: Array.from(new Set([...view.imageModels, 'gpt-image-2'].filter(Boolean))),
      videoModels: Array.from(new Set([view.videoModel, 'veo-3.1', 'kling-2.1', 'runway-gen-4'].filter(Boolean))),
      source: view.hasTextApiKey || view.hasImageApiKey || view.hasVideoApiKey ? 'configured' : 'offline-seed',
      updatedAt: new Date().toISOString(),
    };
  }

  private readRaw(): Promise<StoredModelConfig> {
    return readJsonFile<StoredModelConfig>(this.filePath, {});
  }
}
