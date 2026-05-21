import { useEffect, useState } from "react";
import { useContentStudioApp } from "./app/useContentStudioApp";
import { AppSidebar } from "./components/AppSidebar";
import { BuguAuthGate } from "./components/BuguAuthGate";
import { ModuleOutlet } from "./components/ModuleOutlet";
import { ParamsPanel } from "./components/ParamsPanel";
import { SettingsDialogOutlet } from "./components/SettingsDialogOutlet";
import { SkillPackageInstallDialog } from "./components/SkillPackageInstallDialog";

const AUTH_ONBOARDING_SKIP_KEY = "buguai:auth-onboarding-skipped";
const COMPACT_LAYOUT_QUERY = "(max-width: 1440px)";

export function App() {
  const app = useContentStudioApp();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [paramsPanelCollapsed, setParamsPanelCollapsed] = useState(false);
  const [skillPackagePathRequest, setSkillPackagePathRequest] = useState<string | null>(null);
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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const mediaQuery = window.matchMedia(COMPACT_LAYOUT_QUERY);
    const syncCompactLayout = () => {
      setSidebarCollapsed(mediaQuery.matches);
      setParamsPanelCollapsed(mediaQuery.matches);
    };

    syncCompactLayout();
    mediaQuery.addEventListener("change", syncCompactLayout);

    return () => {
      mediaQuery.removeEventListener("change", syncCompactLayout);
    };
  }, []);

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
      data-params={paramsPanelCollapsed ? "collapsed" : "expanded"}
    >
      <AppSidebar
        activeModule={app.activeModule}
        workspacePath={app.workspacePath}
        updateState={app.updateState}
        authState={app.authState}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onSelectModule={app.setActiveModule}
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
        {app.error ? <div className="error-banner">{app.error}</div> : null}
        <div className="stage-module-surface">
          <ModuleOutlet
            app={app}
            onOpenSkillPackage={(packagePath: string) => setSkillPackagePathRequest(packagePath)}
          />
        </div>
      </section>

      <ParamsPanel
        params={app.params}
        citations={app.citationsForRequest}
        logs={app.logs}
        skillSelection={app.skillSelection}
        collapsed={paramsPanelCollapsed}
        onToggleCollapsed={() => setParamsPanelCollapsed((current) => !current)}
        setParams={app.setParams}
        onOpenModelSettings={() => {
          app.setShowSettingsDialog(true);
          app.setSettingsTab("model");
        }}
      />

      <SkillPackageInstallDialog
        workspacePath={app.workspacePath}
        packagePathRequest={skillPackagePathRequest}
        onPackagePathRequestHandled={() => setSkillPackagePathRequest(null)}
        onInstalled={async (result) => {
          app.setActiveModule("skills");
          app.setActiveSkillKey(`${result.skill.source}:${result.skill.slug}`);
          await app.refresh(app.workspacePath);
        }}
      />

      <SettingsDialogOutlet app={app} />
    </main>
  );
}
