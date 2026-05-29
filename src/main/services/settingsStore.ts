import { app, safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { AppSettingsView, SaveSettingsInput } from '../../shared/types';

interface StoredSettings {
  workspacePath?: string;
  anthropicApiKeyEncrypted?: string;
  anthropicApiKeyPlain?: string;
  autoUpdateEnabled?: boolean;
  lastUpdateCheckAt?: string;
}

export class SettingsStore {
  private readonly filePath = join(app.getPath('userData'), 'settings.json');
  private readonly defaultWorkspacePath = join(app.getPath('userData'), 'workspace');

  async readView(): Promise<AppSettingsView> {
    const settings = await this.readRaw();
    return {
      workspacePath: settings.workspacePath,
      hasAnthropicApiKey: Boolean(settings.anthropicApiKeyEncrypted || settings.anthropicApiKeyPlain),
      apiKeyStorage: settings.anthropicApiKeyEncrypted
        ? 'safeStorage'
        : settings.anthropicApiKeyPlain
          ? 'plain'
          : 'none',
      autoUpdateEnabled: settings.autoUpdateEnabled ?? true,
      lastUpdateCheckAt: settings.lastUpdateCheckAt,
    };
  }

  async save(input: SaveSettingsInput): Promise<AppSettingsView> {
    const settings = await this.readRaw();
    if (input.workspacePath !== undefined) {
      settings.workspacePath = input.workspacePath || undefined;
      if (settings.workspacePath) {
        await mkdir(settings.workspacePath, { recursive: true });
      }
    }
    if (input.clearAnthropicApiKey) {
      delete settings.anthropicApiKeyEncrypted;
      delete settings.anthropicApiKeyPlain;
    }
    if (input.autoUpdateEnabled !== undefined) {
      settings.autoUpdateEnabled = input.autoUpdateEnabled;
    }
    if (input.anthropicApiKey !== undefined) {
      const key = input.anthropicApiKey.trim();
      delete settings.anthropicApiKeyEncrypted;
      delete settings.anthropicApiKeyPlain;
      if (key) {
        if (safeStorage.isEncryptionAvailable()) {
          settings.anthropicApiKeyEncrypted = safeStorage.encryptString(key).toString('base64');
        } else {
          settings.anthropicApiKeyPlain = key;
        }
      }
    }
    await this.writeRaw(settings);
    return this.readView();
  }

  async setAutoUpdateEnabled(enabled: boolean): Promise<AppSettingsView> {
    const settings = await this.readRaw();
    settings.autoUpdateEnabled = enabled;
    await this.writeRaw(settings);
    return this.readView();
  }

  async setLastUpdateCheckAt(checkedAt: string): Promise<AppSettingsView> {
    const settings = await this.readRaw();
    settings.lastUpdateCheckAt = checkedAt;
    await this.writeRaw(settings);
    return this.readView();
  }

  async ensureDefaultWorkspace(): Promise<AppSettingsView> {
    const settings = await this.readRaw();
    if (!settings.workspacePath) {
      await mkdir(this.defaultWorkspacePath, { recursive: true });
      const latest = await this.readRaw();
      if (!latest.workspacePath) {
        latest.workspacePath = this.defaultWorkspacePath;
        await this.writeRaw(latest);
      } else {
        await mkdir(latest.workspacePath, { recursive: true });
      }
    } else {
      await mkdir(settings.workspacePath, { recursive: true });
    }
    return this.readView();
  }

  async getAnthropicApiKey(): Promise<string | undefined> {
    const settings = await this.readRaw();
    if (settings.anthropicApiKeyEncrypted) {
      const payload = Buffer.from(settings.anthropicApiKeyEncrypted, 'base64');
      try {
        return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(payload) : undefined;
      } catch {
        return undefined;
      }
    }
    return settings.anthropicApiKeyPlain;
  }

  private async readRaw(): Promise<StoredSettings> {
    if (!existsSync(this.filePath)) {
      return {};
    }
    try {
      return JSON.parse(await readFile(this.filePath, 'utf-8')) as StoredSettings;
    } catch {
      return {};
    }
  }

  private async writeRaw(settings: StoredSettings): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, `${JSON.stringify(settings, null, 2)}\n`, 'utf-8');
  }
}
