import { app, safeStorage } from 'electron';
import { join } from 'node:path';
import type { ModelConfigView, SaveModelConfigInput } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';

interface StoredModelConfig {
  apiEndpoint?: string;
  apiKeyEncrypted?: string;
  apiKeyPlain?: string;
  textModel?: string;
  imageModels?: string[];
  videoModel?: string;
  updatedAt?: string;
}

const DEFAULT_CONFIG: Required<Pick<ModelConfigView, 'apiEndpoint' | 'textModel' | 'imageModels' | 'videoModel'>> = {
  apiEndpoint: 'https://api.anthropic.com',
  textModel: 'claude-sonnet-4-5',
  imageModels: ['gpt-image-2'],
  videoModel: 'veo-3.1',
};

export class ModelConfigStore {
  private readonly filePath = join(app.getPath('userData'), 'model-config.json');

  async readView(): Promise<ModelConfigView> {
    const config = await this.readRaw();
    return {
      apiEndpoint: config.apiEndpoint ?? DEFAULT_CONFIG.apiEndpoint,
      hasApiKey: Boolean(config.apiKeyEncrypted || config.apiKeyPlain),
      textModel: config.textModel ?? DEFAULT_CONFIG.textModel,
      imageModels: config.imageModels?.length ? config.imageModels : DEFAULT_CONFIG.imageModels,
      videoModel: config.videoModel ?? DEFAULT_CONFIG.videoModel,
      updatedAt: config.updatedAt,
    };
  }

  async save(input: SaveModelConfigInput): Promise<ModelConfigView> {
    const config = await this.readRaw();
    if (input.apiEndpoint !== undefined) config.apiEndpoint = input.apiEndpoint.trim() || DEFAULT_CONFIG.apiEndpoint;
    if (input.textModel !== undefined) config.textModel = input.textModel.trim() || DEFAULT_CONFIG.textModel;
    if (input.imageModels !== undefined) {
      const imageModels = input.imageModels.map((item) => item.trim()).filter(Boolean);
      config.imageModels = imageModels.length ? Array.from(new Set(imageModels)) : DEFAULT_CONFIG.imageModels;
    }
    if (input.videoModel !== undefined) config.videoModel = input.videoModel.trim() || DEFAULT_CONFIG.videoModel;
    if (input.clearApiKey) {
      delete config.apiKeyEncrypted;
      delete config.apiKeyPlain;
    }
    if (input.apiKey !== undefined) {
      const key = input.apiKey.trim();
      delete config.apiKeyEncrypted;
      delete config.apiKeyPlain;
      if (key) {
        if (safeStorage.isEncryptionAvailable()) {
          config.apiKeyEncrypted = safeStorage.encryptString(key).toString('base64');
        } else {
          config.apiKeyPlain = key;
        }
      }
    }
    config.updatedAt = new Date().toISOString();
    await writeJsonFile(this.filePath, config);
    return this.readView();
  }

  async getApiKey(): Promise<string | undefined> {
    const config = await this.readRaw();
    if (config.apiKeyEncrypted) return safeStorage.decryptString(Buffer.from(config.apiKeyEncrypted, 'base64'));
    return config.apiKeyPlain;
  }

  private readRaw(): Promise<StoredModelConfig> {
    return readJsonFile<StoredModelConfig>(this.filePath, {});
  }
}
