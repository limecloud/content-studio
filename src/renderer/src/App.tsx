import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import { useContentStudioApp } from "./app/useContentStudioApp";
import { AppSidebar } from "./components/AppSidebar";
import { BuguAuthGate } from "./components/BuguAuthGate";
import { ModuleOutlet } from "./components/ModuleOutlet";
import { ParamsPanel } from "./components/ParamsPanel";
import { SettingsDialogOutlet } from "./components/SettingsDialogOutlet";
import { SkillPackageInstallDialog } from "./components/SkillPackageInstallDialog";

const AUTH_ONBOARDING_SKIP_KEY = "buguai:auth-onboarding-skipped";
const AGENT_MODULES = new Set(["agents"]);

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

  const reauthorizationLabels = modelReauthorizationLabels(app);
  const reauthorizationKey = reauthorizationLabels.join("-");
  const modelReauthorizationMessage = reauthorizationLabels.length
    ? `${reauthorizationLabels.join("、")}访问凭据已保存但当前系统无法解密，请重新授权后再生成内容。`
    : "";
  const showParamsPanel = !AGENT_MODULES.has(app.activeModule);
  const paramsPanelState = showParamsPanel ? (paramsPanelCollapsed ? "collapsed" : "expanded") : "hidden";

  useEffect(() => {
    if (!modelReauthorizationMessage) return;
    if (!app.authState?.authenticated && !authOnboardingSkipped) return;
    if (typeof window === "undefined") return;

    const storageKey = `buguai:model-reauthorization-opened:${reauthorizationKey}`;
    if (window.sessionStorage.getItem(storageKey) === "1") return;
    window.sessionStorage.setItem(storageKey, "1");
    app.setSettingsPage("model");
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
      data-serif={app.serifEnabled ? "enabled" : "disabled"}
      data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}
      data-params={paramsPanelState}
      style={{
        "--content-studio-font-scale": app.fontScale,
      } as CSSProperties}
    >
      <AppSidebar
        activeModule={app.activeModule}
        workspacePath={app.workspacePath}
        recentWorkspacePaths={app.settings?.recentWorkspacePaths ?? []}
        updateState={app.updateState}
        authState={app.authState}
        agentPromptSessions={app.agentPromptSessions}
        activeAgentPromptSessionId={app.activeAgentPromptSessionId}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onSelectModule={app.setActiveModule}
        onSelectAgentSession={app.setActiveAgentPromptSessionId}
        onSelectWorkspacePath={(workspacePath) =>
          app.runAction(() => app.switchWorkspace(workspacePath), "正在切换项目")
        }
        onOpenSettingsPage={(page) => {
          app.setSettingsPage(page);
          app.setShowSettingsDialog(true);
        }}
        onOpenUpdates={app.openUpdateSettings}
      />

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
                app.setSettingsPage("model");
                app.setShowSettingsDialog(true);
              }}
            >
              重新授权
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

      {showParamsPanel ? (
        <ParamsPanel
          params={app.params}
          textProtocol={app.modelConfig?.textProtocol ?? "openai-chat"}
          textModels={app.textModelOptions}
          imageModels={app.imageModelOptions}
          videoModels={app.videoModelOptions}
          modelConfig={app.modelConfig}
          logs={app.logs}
          collapsed={paramsPanelCollapsed}
          onToggleCollapsed={() => setParamsPanelCollapsed((current) => !current)}
          setParams={app.setParams}
          onOpenModelSettings={() => {
            app.setShowSettingsDialog(true);
            app.setSettingsPage("model");
          }}
        />
      ) : null}

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
