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
      modelSettingView={app.modelSettingView}
      setModelSettingView={app.setModelSettingView}
      modelConfig={app.modelConfig}
      modelDraft={app.modelDraft}
      setModelDraft={app.setModelDraft}
      providerTab={app.providerTab}
      setProviderTab={app.setProviderTab}
      responsesApiActive={app.responsesApiActive}
      setResponsesApiActive={app.setResponsesApiActive}
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
      onLoadModelCatalog={() => app.runAction(app.loadModelCatalog)}
      onSaveModelConfig={() => app.runAction(app.saveModelConfig)}
      onClose={() => app.setShowSettingsDialog(false)}
    />
  );
}
