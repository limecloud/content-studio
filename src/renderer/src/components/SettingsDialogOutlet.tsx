import type { ContentStudioAppController } from '../app/useContentStudioApp';
import { SettingsDialog } from './SettingsDialog';

interface SettingsDialogOutletProps {
  app: ContentStudioAppController;
}

export function SettingsDialogOutlet({ app }: SettingsDialogOutletProps) {
  if (!app.showSettingsDialog) return null;

  return (
    <SettingsDialog
      settingsTab={app.settingsTab}
      setSettingsTab={app.setSettingsTab}
      themeMode={app.themeMode}
      setThemeMode={app.setThemeMode}
      colorTheme={app.colorTheme}
      setColorTheme={app.setColorTheme}
      modelConfig={app.modelConfig}
      modelCatalog={app.modelCatalog}
      modelDraft={app.modelDraft}
      setModelDraft={app.setModelDraft}
      menubarShow={app.menubarShow}
      setMenubarShow={app.setMenubarShow}
      autoStart={app.autoStart}
      setAutoStart={app.setAutoStart}
      notificationsEnabled={app.notificationsEnabled}
      setNotificationsEnabled={app.setNotificationsEnabled}
      reduceAnimation={app.reduceAnimation}
      setReduceAnimation={app.setReduceAnimation}
      syncClaudeHistory={app.syncClaudeHistory}
      setSyncClaudeHistory={app.setSyncClaudeHistory}
      shortcutActive={app.shortcutActive}
      setShortcutActive={app.setShortcutActive}
      commandWhitelist={app.commandWhitelist}
      setCommandWhitelist={app.setCommandWhitelist}
      updateState={app.updateState}
      authState={app.authState}
      onSetAutoUpdateEnabled={(enabled) => app.runAction(() => app.setAutoUpdateEnabled(enabled))}
      onCheckForUpdates={() => app.runAction(app.checkForUpdates, '正在检查更新')}
      onOpenUpdateDownload={() => app.runAction(app.openUpdateDownload, '正在打开更新下载')}
      onOpenUpdateReleaseNotes={() => app.runAction(app.openUpdateReleaseNotes, '正在打开更新日志')}
      onOpenLogsDirectory={() => app.runAction(app.openLogsDirectory, '正在打开日志目录')}
      onGetSkillFileAssociation={app.getSkillFileAssociation}
      onSetSkillFileAssociationDefault={app.setSkillFileAssociationDefault}
      onLoadModelCatalog={() => app.loadModelCatalog()}
      onSaveModelConfig={() => app.runAction(app.saveModelConfig)}
      onPasswordLogin={app.loginByPassword}
      onLogoutAuth={() => app.runAction(app.logoutAuth, '正在退出登录')}
      onClose={() => app.setShowSettingsDialog(false)}
    />
  );
}
