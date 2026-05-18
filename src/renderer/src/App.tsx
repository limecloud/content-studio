import { useContentStudioApp } from './app/useContentStudioApp';
import { AppSidebar } from './components/AppSidebar';
import { ModuleOutlet } from './components/ModuleOutlet';
import { ParamsPanel } from './components/ParamsPanel';
import { SettingsDialogOutlet } from './components/SettingsDialogOutlet';
import { StageHeader } from './components/StageHeader';

export function App() {
  const app = useContentStudioApp();

  return (
    <main className="app-shell" data-theme={app.effectiveTheme} data-color={app.colorTheme}>
      <AppSidebar
        activeModule={app.activeModule}
        workspacePath={app.workspacePath}
        onSelectModule={app.setActiveModule}
        onChooseWorkspace={() => app.runAction(app.chooseWorkspace)}
        onRefreshWorkspace={() => app.runAction(() => app.refresh(app.workspacePath))}
        onOpenSettings={() => app.setShowSettingsDialog(true)}
      />

      <section className="stage">
        <StageHeader
          busy={app.busy}
          currentActionLabel={app.currentActionLabel}
          workspaceReady={Boolean(app.workspacePath)}
          onGeneratePromptPack={() => app.runAction(app.generatePromptPack)}
          onCancelAction={app.cancelCurrentAction}
        />

        {app.error ? <div className="error-banner">{app.error}</div> : null}
        <ModuleOutlet app={app} />
      </section>

      <ParamsPanel
        params={app.params}
        citations={app.citationsForRequest}
        skillSelection={app.skillSelection}
        setParams={app.setParams}
        onOpenModelSettings={() => {
          app.setShowSettingsDialog(true);
          app.setSettingsTab('model');
        }}
      />

      <SettingsDialogOutlet app={app} />
    </main>
  );
}
