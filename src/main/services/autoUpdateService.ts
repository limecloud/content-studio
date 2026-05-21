import { app, BrowserWindow, shell } from 'electron';
import { mkdir } from 'node:fs/promises';
import type { AutoUpdateAsset, AutoUpdateState, UpdateActionResult, UpdateCheckOptions } from '../../shared/types';
import { getOemRuntimeConfig } from './oemRuntimeConfig';
import { SettingsStore } from './settingsStore';

const GITHUB_RELEASES_URL = 'https://github.com/limecloud/content-studio/releases/latest';
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const STARTUP_CHECK_DELAY_MS = 5000;
const REQUEST_TIMEOUT_MS = 15000;

interface RemoteDownloadAsset {
  platform?: string;
  kind?: string;
  label?: string;
  fileName?: string;
  url?: string;
  sha256?: string;
  size?: number;
  sizeBytes?: number;
  primary?: boolean;
}

interface RemoteDownloadPayload {
  version?: string;
  channel?: string;
  publishedAt?: string;
  updatedAt?: string;
  releaseNotesUrl?: string;
  releasePageUrl?: string;
  packageUrl?: string;
  assets?: RemoteDownloadAsset[];
}

interface DownloadSource {
  payload: RemoteDownloadPayload;
  manifestUrl: string;
  sourceLabel: string;
}

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function getRuntimeBrandId(): string {
  return normalizeText(getOemRuntimeConfig().brandId) || 'bugu';
}

function getRuntimeApiBaseUrl(): string {
  return normalizeText(getOemRuntimeConfig().apiBaseUrl).replace(/\/+$/, '') || 'https://api.bugu.run/api';
}

function getLatestApiUrl(): string {
  const brandId = getRuntimeBrandId();
  const appId = brandId === 'bugu' ? 'buguai' : brandId;
  return process.env.CONTENT_STUDIO_UPDATE_API_URL
    || `${getRuntimeApiBaseUrl()}/v1/public/agent-apps/${encodeURIComponent(appId)}/downloads/latest?channel=stable`;
}

function getLatestManifestUrl(): string {
  const brandId = getRuntimeBrandId();
  return process.env.CONTENT_STUDIO_UPDATE_MANIFEST_URL
    || `https://downloads.bugu.run/${encodeURIComponent(brandId)}/stable/latest.json`;
}

function getUpdateSourceLabel(): string {
  return `${getOemRuntimeConfig().productName || getRuntimeBrandId()}更新服务`;
}

function normalizeVersion(value: string | undefined): string | undefined {
  const normalized = normalizeText(value).replace(/^v/i, '');
  return normalized || undefined;
}

function parseVersion(value: string | undefined): { numbers: number[]; prerelease: string[] } {
  const normalized = normalizeVersion(value) ?? '0.0.0';
  const [withoutBuild = ''] = normalized.split('+');
  const [core = '', prerelease = ''] = withoutBuild.split('-', 2);
  return {
    numbers: core.split('.').map((part) => Number.parseInt(part, 10)).map((part) => (Number.isFinite(part) ? part : 0)),
    prerelease: prerelease ? prerelease.split('.') : [],
  };
}

function isNewerVersion(latest: string | undefined, current: string): boolean {
  const left = parseVersion(latest);
  const right = parseVersion(current);
  const length = Math.max(left.numbers.length, right.numbers.length, 3);
  for (let index = 0; index < length; index += 1) {
    const a = left.numbers[index] ?? 0;
    const b = right.numbers[index] ?? 0;
    if (a !== b) return a > b;
  }
  if (left.prerelease.length === 0 && right.prerelease.length > 0) return true;
  if (left.prerelease.length > 0 && right.prerelease.length === 0) return false;
  return left.prerelease.join('.') > right.prerelease.join('.');
}

function safeHttpUrl(value: unknown): string | undefined {
  const url = normalizeText(value);
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function currentPlatformKey(): string {
  if (process.platform === 'win32') return process.arch === 'arm64' ? 'windows-arm64' : 'windows-x64';
  if (process.platform === 'darwin') return process.arch === 'x64' ? 'macos-x64' : 'macos-arm64';
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  return `${process.platform}-${process.arch}`;
}

function kindPreference(): string[] {
  if (process.platform === 'darwin') return ['dmg', 'zip'];
  if (process.platform === 'win32') return ['nsis', 'exe'];
  if (process.platform === 'linux') return ['appimage'];
  return [];
}

function toAsset(asset: RemoteDownloadAsset): AutoUpdateAsset | null {
  const url = safeHttpUrl(asset.url);
  if (!url) return null;
  const platform = normalizeText(asset.platform);
  const kind = normalizeText(asset.kind);
  return {
    platform,
    kind,
    label: normalizeText(asset.label) || [platform, kind].filter(Boolean).join(' ') || '安装包',
    fileName: normalizeText(asset.fileName) || undefined,
    url,
    sha256: normalizeText(asset.sha256) || undefined,
    size: asset.sizeBytes || asset.size,
    primary: Boolean(asset.primary),
  };
}

function selectCurrentAsset(assets: AutoUpdateAsset[]): AutoUpdateAsset | undefined {
  const platform = currentPlatformKey();
  const exact = assets.filter((asset) => asset.platform === platform);
  const preferences = kindPreference();
  for (const kind of preferences) {
    const preferred = exact.find((asset) => asset.kind === kind);
    if (preferred) return preferred;
  }
  return exact[0];
}

function sourceFromJson(value: unknown, manifestUrl: string, sourceLabel: string): DownloadSource {
  const envelope = value && typeof value === 'object' ? value as { data?: unknown } : {};
  const payload = envelope.data && typeof envelope.data === 'object'
    ? envelope.data as RemoteDownloadPayload
    : value as RemoteDownloadPayload;
  return { payload, manifestUrl, sourceLabel };
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function loadLatestSource(): Promise<DownloadSource> {
  const latestApiUrl = getLatestApiUrl();
  const latestManifestUrl = getLatestManifestUrl();
  try {
    const json = await fetchJson(latestApiUrl);
    return sourceFromJson(json, latestApiUrl, getUpdateSourceLabel());
  } catch (error) {
    const json = await fetchJson(latestManifestUrl);
    const source = sourceFromJson(json, latestManifestUrl, 'R2 兜底清单');
    if (!source.payload.releaseNotesUrl && !source.payload.releasePageUrl) {
      source.payload.releasePageUrl = GITHUB_RELEASES_URL;
    }
    return source;
  }
}

export class AutoUpdateService {
  private state: AutoUpdateState = {
    enabled: true,
    status: 'idle',
    currentVersion: app.getVersion(),
    hasUpdate: false,
  };

  private checkPromise: Promise<AutoUpdateState> | null = null;
  private started = false;
  private interval: NodeJS.Timeout | null = null;

  constructor(
    private readonly settings: SettingsStore,
    private readonly mainWindow: BrowserWindow,
  ) {}

  async getState(): Promise<AutoUpdateState> {
    await this.refreshSettingsState();
    return this.snapshot();
  }

  startBackgroundChecks(): void {
    if (this.started) return;
    this.started = true;
    void this.refreshSettingsState().then(() => {
      this.emit();
      if (!this.shouldRunBackgroundChecks()) return;
      setTimeout(() => void this.checkIfDue(), STARTUP_CHECK_DELAY_MS);
      this.interval = setInterval(() => void this.checkIfDue(), CHECK_INTERVAL_MS);
    });
  }

  async setEnabled(enabled: boolean): Promise<AutoUpdateState> {
    await this.settings.setAutoUpdateEnabled(enabled);
    this.state = { ...this.state, enabled };
    this.emit();
    if (enabled && this.shouldRunBackgroundChecks()) {
      void this.checkIfDue(true);
    }
    return this.snapshot();
  }

  async checkForUpdates(options: UpdateCheckOptions = {}): Promise<AutoUpdateState> {
    if (this.checkPromise) return this.checkPromise;

    this.checkPromise = this.runCheck(Boolean(options.manual))
      .finally(() => {
        this.checkPromise = null;
      });
    return this.checkPromise;
  }

  async openDownload(): Promise<UpdateActionResult> {
    const url = this.state.downloadUrl || this.state.releaseNotesUrl || GITHUB_RELEASES_URL;
    return this.openExternalUrl(url);
  }

  async openReleaseNotes(): Promise<UpdateActionResult> {
    const url = this.state.releaseNotesUrl || GITHUB_RELEASES_URL;
    return this.openExternalUrl(url);
  }

  async openLogsDirectory(): Promise<UpdateActionResult> {
    const logsPath = app.getPath('logs');
    await mkdir(logsPath, { recursive: true });
    const error = await shell.openPath(logsPath);
    return error ? { ok: false, error } : { ok: true };
  }

  dispose(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async refreshSettingsState(): Promise<void> {
    const view = await this.settings.readView();
    this.state = {
      ...this.state,
      enabled: view.autoUpdateEnabled,
      lastAutoCheckAt: view.lastUpdateCheckAt,
      currentVersion: app.getVersion(),
    };
  }

  private shouldRunBackgroundChecks(): boolean {
    return app.isPackaged || process.env.CONTENT_STUDIO_ENABLE_DEV_UPDATE_CHECK === '1';
  }

  private async checkIfDue(force = false): Promise<void> {
    await this.refreshSettingsState();
    if (!this.state.enabled) return;
    if (!force && this.state.lastAutoCheckAt) {
      const last = Date.parse(this.state.lastAutoCheckAt);
      if (Number.isFinite(last) && Date.now() - last < CHECK_INTERVAL_MS) return;
    }
    await this.checkForUpdates({ manual: false });
  }

  private async runCheck(manual: boolean): Promise<AutoUpdateState> {
    const checkedAt = new Date().toISOString();
    this.state = {
      ...this.state,
      status: 'checking',
      currentVersion: app.getVersion(),
      checkedAt,
      error: undefined,
    };
    this.emit();

    try {
      const source = await loadLatestSource();
      const latestVersion = normalizeVersion(source.payload.version);
      if (!latestVersion) throw new Error('更新清单缺少版本号。');

      const assets = (source.payload.assets ?? []).map(toAsset).filter((asset): asset is AutoUpdateAsset => Boolean(asset));
      const platformAsset = selectCurrentAsset(assets);
      const releaseNotesUrl = safeHttpUrl(source.payload.releaseNotesUrl)
        || safeHttpUrl(source.payload.releasePageUrl)
        || GITHUB_RELEASES_URL;
      const hasUpdate = isNewerVersion(latestVersion, app.getVersion());
      const downloadUrl = platformAsset?.url
        || (assets.length === 0 ? safeHttpUrl(source.payload.packageUrl) : undefined)
        || releaseNotesUrl;

      await this.settings.setLastUpdateCheckAt(checkedAt);
      this.state = {
        enabled: this.state.enabled,
        status: hasUpdate ? 'update-available' : 'up-to-date',
        currentVersion: app.getVersion(),
        latestVersion,
        hasUpdate,
        checkedAt,
        lastAutoCheckAt: checkedAt,
        publishedAt: source.payload.publishedAt || source.payload.updatedAt,
        channel: source.payload.channel,
        sourceLabel: source.sourceLabel,
        manifestUrl: source.manifestUrl,
        releaseNotesUrl,
        downloadUrl,
        asset: platformAsset,
      };
    } catch (error) {
      this.state = {
        ...this.state,
        status: 'error',
        hasUpdate: false,
        checkedAt,
        error: error instanceof Error ? error.message : String(error),
      };
      if (!manual) {
        await this.settings.setLastUpdateCheckAt(checkedAt);
      }
    }

    this.emit();
    return this.snapshot();
  }

  private async openExternalUrl(value: string | undefined): Promise<UpdateActionResult> {
    const url = safeHttpUrl(value);
    if (!url) return { ok: false, error: '缺少可打开的更新链接。' };
    await shell.openExternal(url);
    return { ok: true };
  }

  private snapshot(): AutoUpdateState {
    return { ...this.state, currentVersion: app.getVersion() };
  }

  private emit(): void {
    if (this.mainWindow.isDestroyed() || this.mainWindow.webContents.isDestroyed()) return;
    this.mainWindow.webContents.send('updates:state', this.snapshot());
  }
}
