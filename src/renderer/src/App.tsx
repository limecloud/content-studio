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
const SHOWCASE_MODULES = new Set(["image-showcase", "video-showcase"]);

function modelReauthorizationLabels(app: ReturnType<typeof useContentStudioApp>): string[] {
  const labels: string[] = [];
  if (app.modelConfig?.textApiKeyStatus === "requires-reauthorization") labels.push("文字");
  if (app.modelConfig?.imageApiKeyStatus === "requires-reauthorization") labels.push("图片");
  if (app.modelConfig?.videoApiKeyStatus === "requires-reauthorization") labels.push("视频");
  return labels;
}

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
      const shouldCollapse = mediaQuery.matches || SHOWCASE_MODULES.has(app.activeModule);
      setSidebarCollapsed(shouldCollapse);
      setParamsPanelCollapsed(shouldCollapse);
    };

    syncCompactLayout();
    mediaQuery.addEventListener("change", syncCompactLayout);

    return () => {
      mediaQuery.removeEventListener("change", syncCompactLayout);
    };
  }, [app.activeModule]);

  const reauthorizationLabels = modelReauthorizationLabels(app);
  const reauthorizationKey = reauthorizationLabels.join("-");
  const modelReauthorizationMessage = reauthorizationLabels.length
    ? `${reauthorizationLabels.join("、")} API Key 已保存但当前系统无法解密，请重新授权后再生成内容。`
    : "";

  useEffect(() => {
    if (!modelReauthorizationMessage) return;
    if (!app.authState?.authenticated && !authOnboardingSkipped) return;
    if (typeof window === "undefined") return;

    const storageKey = `buguai:model-reauthorization-opened:${reauthorizationKey}`;
    if (window.sessionStorage.getItem(storageKey) === "1") return;
    window.sessionStorage.setItem(storageKey, "1");
    app.setSettingsTab("model");
    app.setShowSettingsDialog(true);
  }, [
    app.authState?.authenticated,
    authOnboardingSkipped,
    modelReauthorizationMessage,
    reauthorizationKey,
  ]);

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
        {modelReauthorizationMessage ? (
          <div className="model-reauthorization-banner" role="alert">
            <div>
              <strong>模型授权需要处理</strong>
              <span>{modelReauthorizationMessage}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                app.setSettingsTab("model");
                app.setShowSettingsDialog(true);
              }}
            >
              重新授权
            </button>
          </div>
        ) : null}
        {app.error ? (
          <div className="error-banner app-error-banner" role="alert">
            <span className="app-error-message">{app.error}</span>
            <button
              type="button"
              className="app-error-close"
              aria-label="关闭错误提示"
              title="关闭错误提示"
              onClick={app.dismissError}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
        ) : null}
        <div className="stage-module-surface">
          <ModuleOutlet
            app={app}
            onOpenSkillPackage={(packagePath: string) => setSkillPackagePathRequest(packagePath)}
          />
        </div>
      </section>

      <ParamsPanel
        params={app.params}
        textProtocol={app.modelConfig?.textProtocol ?? "claude-sdk"}
        textModels={app.textModelOptions}
        imageModels={app.imageModelOptions}
        videoModels={app.videoModelOptions}
        citations={app.activeModule === "material-breakdown" ? [] : app.selectedCitations}
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
