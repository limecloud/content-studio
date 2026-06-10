import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import {
  PlatformSettingsDialog,
  type PlatformAboutSettingsProjection,
} from '@limecloud/desktop-platform-react';
import type { PlatformNavigationIntent, PlatformSettings } from '@limecloud/desktop-platform-contracts';
import type { PlatformSettingsProjection } from '../../../shared/types';
import {
  createDefaultPlatformAppearance,
  platformColorThemeToContentStudio,
} from '../app/platformAppearance';
import { createPlatformAccountProjection } from '../app/platformAccountProjection';
import { createModelSettingsProjection } from '../app/platformModelSettingsProjection';
import { CONTENT_STUDIO_PLATFORM_SETTINGS_THEME } from '../app/platformSettingsTheme';
import type { ContentStudioAppController } from '../app/useContentStudioApp';

interface SettingsDialogOutletProps {
  app: ContentStudioAppController;
}

export function SettingsDialogOutlet({ app }: SettingsDialogOutletProps): ReactElement | null {
  const account = createPlatformAccountProjection(app.authState);
  const modelSettings = createModelSettingsProjection(app);
  const about = createAboutProjection(app);
  const setThemeMode = app.setThemeMode;
  const setColorTheme = app.setColorTheme;
  const fallbackPlatformSettings = createPlatformSettingsProjection(app);
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(fallbackPlatformSettings);

  useEffect(() => {
    if (!app.showSettingsDialog) {
      return undefined;
    }
    let cancelled = false;
    setPlatformSettings(createPlatformSettingsProjection(app));
    void window.contentStudio.getPlatformSettings().then((next) => {
      if (!cancelled) {
        setPlatformSettings(next);
        applyPlatformSettingsToApp(app, next);
      }
    }).catch(() => {
      // 独立启动或开发模式没有平台宿主时，设置页使用当前窗口投影。
    });
    return () => {
      cancelled = true;
    };
  }, [
    app.showSettingsDialog,
    app.modelConfig?.platformHost?.snapshot,
    app.modelConfig?.updatedAt,
    app.workspacePath,
    setColorTheme,
    setThemeMode,
  ]);

  if (!app.showSettingsDialog) return null;

  return (
    <PlatformSettingsDialog
      about={about}
      account={account}
      activePage={app.settingsPage}
      className="content-studio-platform-settings-host"
      modelSettings={modelSettings}
      platformSettings={platformSettings}
      theme={CONTENT_STUDIO_PLATFORM_SETTINGS_THEME}
      onPreviewPlatformSettings={(settings) => {
        setPlatformSettings(settings);
        applyPlatformSettingsToApp(app, settings);
      }}
      onSavePlatformSettings={(settings) => savePlatformSettings(app, settings, setPlatformSettings)}
      onSelectPage={app.setSettingsPage}
      onClose={() => app.setShowSettingsDialog(false)}
      onOpenPlatformIntent={(intent) => openPlatformIntent(app, intent)}
    />
  );
}

function createPlatformSettingsProjection(app: ContentStudioAppController): PlatformSettings {
  const snapshot = app.modelConfig?.platformHost?.snapshot;
  return {
    version: snapshot?.modelSettingsVersion ?? app.modelConfig?.updatedAt ?? 'content-studio-local',
    updatedAt: app.modelConfig?.updatedAt ?? new Date(0).toISOString(),
    locale: snapshot?.locale ?? 'zh-CN',
    theme: snapshot?.theme ?? app.themeMode,
    appearance: snapshot?.appearance ?? createDefaultPlatformAppearance(app.colorTheme),
    workspacePath: snapshot?.workspacePath ?? app.workspacePath ?? '',
    proxy: {
      enabled: false,
      url: '',
    },
    developerMode: false,
    general: createDefaultPlatformGeneralSettings(),
  };
}

function applyPlatformSettingsToApp(app: ContentStudioAppController, settings: PlatformSettings): void {
  app.setThemeMode(settings.theme);
  app.setColorTheme(platformColorThemeToContentStudio(settings.appearance?.colorTheme));
  if (settings.appearance) {
    app.setFontScale(settings.appearance.fontScale);
    app.setSerifEnabled(settings.appearance.serifEnabled);
  }
}

function createDefaultPlatformGeneralSettings(): PlatformSettings['general'] {
  return {
    notificationsEnabled: true,
    reduceMotion: false,
    syncLocalAgentHistory: false,
    quickWindowShortcutEnabled: true,
    commandWhitelistEnabled: false,
    permissionMode: 'auto-approve',
    thinkingMode: 'auto',
    showToolCalls: true,
    expandToolCallsByDefault: false,
  };
}

function createAboutProjection(app: ContentStudioAppController): PlatformAboutSettingsProjection {
  const branding = app.authState?.bootstrap?.branding;
  return {
    productName: branding?.appName ?? '布谷AI内容工厂',
    version: app.updateState.currentVersion,
    copyright: `© 2026 ${branding?.shortName ?? branding?.appName ?? '布谷AI'}. All rights reserved.`,
  };
}

async function savePlatformSettings(
  app: ContentStudioAppController,
  settings: PlatformSettings,
  updatePlatformSettings: (settings: PlatformSettings) => void,
): Promise<PlatformSettings> {
  const previousTheme = app.themeMode;
  const previousColorTheme = app.colorTheme;
  const previousFontScale = app.fontScale;
  const previousSerifEnabled = app.serifEnabled;
  applyPlatformSettingsToApp(app, settings);
  const status = await window.contentStudio.getPlatformHostStatus();
  if (!status.available) {
    throw new Error('基础设置由平台设置中心统一保存；请先通过平台宿主打开 Content Studio。');
  }
  try {
    const next = await window.contentStudio.savePlatformSettings(settings as PlatformSettingsProjection);
    updatePlatformSettings(next);
    applyPlatformSettingsToApp(app, next);
    await app.refresh(next.workspacePath || app.workspacePath);
    return next;
  } catch (error) {
    app.setThemeMode(previousTheme);
    app.setColorTheme(previousColorTheme);
    app.setFontScale(previousFontScale);
    app.setSerifEnabled(previousSerifEnabled);
    throw error;
  }
}

async function openPlatformIntent(app: ContentStudioAppController, intent: PlatformNavigationIntent): Promise<unknown> {
  if (intent.target === 'model-settings') {
    app.runAction(async () => {
      await openPlatformModelSettings();
    }, '正在打开平台模型设置');
    return undefined;
  }
  if (intent.target === 'updates') {
    if (intent.reason?.includes('检查')) {
      app.runAction(async () => {
        await app.checkForUpdates();
      }, '正在检查更新');
      return undefined;
    }
    if (app.updateState.hasUpdate) {
      app.runAction(async () => {
        await app.openUpdateDownload();
      }, '正在打开更新下载');
      return undefined;
    }
    app.runAction(async () => {
      await app.openUpdateReleaseNotes();
    }, '正在打开更新日志');
    return undefined;
  }
  if (intent.target === 'diagnostics') {
    app.runAction(async () => {
      await app.openLogsDirectory();
    }, '正在打开日志目录');
    return undefined;
  }
  return {
    ok: false,
    target: intent.target,
    message: '当前 Content Studio 只接入模型设置、更新和诊断入口；其他平台设置请从平台设置中心打开。',
  };
}

async function openPlatformModelSettings(): Promise<void> {
  const status = await window.contentStudio.getPlatformHostStatus();
  if (!status.available) {
    throw new Error('当前窗口未连接平台设置中心，请从平台客户端打开内容工厂后再进入完整模型设置。');
  }
  const result = await window.contentStudio.openPlatformModelSettings();
  if (!result.ok) {
    throw new Error(result.message || '平台模型设置暂时无法打开，请从平台客户端进入设置中心。');
  }
}

function formatVersion(version?: string): string {
  return version?.trim() ? `v${version.replace(/^v/i, '')}` : '未知版本';
}
