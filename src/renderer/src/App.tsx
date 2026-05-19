import { useEffect, useState } from "react";
import { useContentStudioApp } from "./app/useContentStudioApp";
import { AppSidebar } from "./components/AppSidebar";
import { BuguAuthGate } from "./components/BuguAuthGate";
import { ModuleOutlet } from "./components/ModuleOutlet";
import { ParamsPanel } from "./components/ParamsPanel";
import { SettingsDialogOutlet } from "./components/SettingsDialogOutlet";
import { StageHeader } from "./components/StageHeader";

const AUTH_ONBOARDING_SKIP_KEY = "buguai:auth-onboarding-skipped";

export function App() {
  const app = useContentStudioApp();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authOnboardingSkipped, setAuthOnboardingSkipped] = useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem(AUTH_ONBOARDING_SKIP_KEY) === "1",
  );

  useEffect(() => {
    if (!app.authState?.authenticated || authOnboardingSkipped) return;
    window.localStorage.setItem(AUTH_ONBOARDING_SKIP_KEY, "1");
    setAuthOnboardingSkipped(true);
  }, [app.authState?.authenticated, authOnboardingSkipped]);

  if (!app.authState?.authenticated && !authOnboardingSkipped) {
    return (
      <BuguAuthGate
        checking={app.authChecking}
        authState={app.authState}
        onSkip={() => {
          window.localStorage.setItem(AUTH_ONBOARDING_SKIP_KEY, "1");
          setAuthOnboardingSkipped(true);
        }}
        onPasswordLogin={app.loginByPassword}
      />
    );
  }

  return (
    <main
      className="app-shell"
      data-theme={app.effectiveTheme}
      data-color={app.colorTheme}
      data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}
    >
      <AppSidebar
        activeModule={app.activeModule}
        runMode={app.params.runMode}
        workspacePath={app.workspacePath}
        updateState={app.updateState}
        authState={app.authState}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onSelectModule={app.setActiveModule}
        onSetRunMode={(runMode) =>
          app.setParams((current) => ({ ...current, runMode }))
        }
        onChooseWorkspace={() => app.runAction(app.chooseWorkspace)}
        onRefreshWorkspace={() =>
          app.runAction(() => app.refresh(app.workspacePath))
        }
        onOpenAccountSettings={() => {
          app.setSettingsTab("account");
          app.setShowSettingsDialog(true);
        }}
        onOpenSettings={() => app.setShowSettingsDialog(true)}
        onOpenUpdates={app.openUpdateSettings}
      />

      <section className="stage">
        <StageHeader
          busy={app.busy}
          currentActionLabel={app.currentActionLabel}
          workspaceReady={Boolean(app.workspacePath)}
          onGeneratePromptPack={() => {
            app.setActiveModule("knowledge");
            app.runAction(app.generatePromptPack);
          }}
          onCancelAction={app.cancelCurrentAction}
        />

        {app.error ? <div className="error-banner">{app.error}</div> : null}
        <div className="stage-module-surface">
          <ModuleOutlet app={app} />
        </div>
      </section>

      <ParamsPanel
        params={app.params}
        citations={app.citationsForRequest}
        logs={app.logs}
        skillSelection={app.skillSelection}
        setParams={app.setParams}
        onOpenModelSettings={() => {
          app.setShowSettingsDialog(true);
          app.setSettingsTab("model");
        }}
      />

      <SettingsDialogOutlet app={app} />
    </main>
  );
}
