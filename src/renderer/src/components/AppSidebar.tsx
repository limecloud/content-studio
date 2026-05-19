import logoUrl from "../logo.png";
import { NAV_GROUPS } from "../app/constants";
import type {
  AutoUpdateState,
  BuguAuthState,
  GlobalGenerationParams,
} from "../../../shared/types";
import type { ModuleKey } from "../app/types";

interface AppSidebarProps {
  activeModule: ModuleKey;
  runMode: GlobalGenerationParams["runMode"];
  workspacePath?: string;
  updateState: AutoUpdateState;
  authState: BuguAuthState | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectModule: (module: ModuleKey) => void;
  onSetRunMode: (mode: GlobalGenerationParams["runMode"]) => void;
  onChooseWorkspace: () => void;
  onRefreshWorkspace: () => void;
  onOpenAccountSettings: () => void;
  onOpenSettings: () => void;
  onOpenUpdates: () => void;
}

function formatVersion(version?: string) {
  if (!version) return "";
  return version.startsWith("v") ? version : `v${version}`;
}

const NAV_ICONS = new Map<string, string>([
  ["图片生成", "🖼️"],
  ["合规检测", "🛡️"],
  ["图片精修", "✨"],
  ["视频生成", "🎬"],
  ["创意视频", "🎞️"],
  ["自定义视频", "🎥"],
  ["文章生成", "✍️"],
  ["内容助手", "🤖"],
  ["成型知识库", "📚"],
  ["素材库 / 历史", "🗂️"],
  ["能力管理", "🧩"],
]);

export function AppSidebar({
  activeModule,
  runMode,
  workspacePath,
  updateState,
  authState,
  collapsed,
  onToggleCollapsed,
  onSelectModule,
  onSetRunMode,
  onChooseWorkspace,
  onRefreshWorkspace,
  onOpenAccountSettings,
  onOpenSettings,
  onOpenUpdates,
}: AppSidebarProps) {
  const hasUpdate =
    updateState.status === "update-available" && updateState.hasUpdate;
  const accountAction = hasUpdate ? onOpenUpdates : onOpenAccountSettings;
  const user = authState?.user;
  const isAuthenticated = Boolean(authState?.authenticated);
  const displayName = isAuthenticated
    ? user?.displayName || user?.username || user?.email || "布谷用户"
    : "本地模式";
  const email = isAuthenticated
    ? user?.email || user?.username || "账号已登录"
    : "未登录布谷账号";
  const avatarText = displayName.trim().slice(0, 1).toUpperCase() || "B";

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <section className="brand-card">
        <img src={logoUrl} alt="Logo" className="brand-logo-img" />
        <div className="brand-copy">
          <p className="eyebrow">布谷AI</p>
          <h1>内容工厂</h1>
        </div>
        <button
          className="sidebar-collapse-btn"
          type="button"
          aria-label={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          title={collapsed ? "展开侧边栏" : "折叠侧边栏"}
          onClick={onToggleCollapsed}
        >
          {collapsed ? "›" : "‹"}
        </button>
      </section>

      <section className="workspace-card">
        <p className="eyebrow">工作区</p>
        <strong>
          {workspacePath
            ? workspacePath.split("/").slice(-2).join("/")
            : "尚未选择工作区"}
        </strong>
        <button className="primary small" onClick={onChooseWorkspace}>
          选择工作区
        </button>
        <button className="ghost small" onClick={onRefreshWorkspace}>
          刷新本地事实源
        </button>
      </section>

      <nav className="nav-stack">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="nav-group">
            <p>{group.title}</p>
            {group.items.map((item) => (
              <button
                key={`${group.title}:${item.label}`}
                className={`nav-item ${item.key && activeModule === item.key ? "active" : ""} ${item.disabled ? "disabled" : ""}`}
                title={item.label}
                onClick={() =>
                  item.key && !item.disabled && onSelectModule(item.key)
                }
              >
                <span className="nav-icon">
                  {NAV_ICONS.get(item.label) ?? "•"}
                </span>
                <span className="nav-label">{item.label}</span>
                {item.badge ? <em>{item.badge}</em> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="mode-card">
        <p className="eyebrow">处理模式</p>
        <div className="mode-grid">
          <button
            className={runMode === "single" ? "active" : ""}
            onClick={() => onSetRunMode("single")}
          >
            单次
          </button>
          <button
            className={runMode === "parallel" ? "active" : ""}
            onClick={() => onSetRunMode("parallel")}
          >
            批量
          </button>
          <button disabled title="定时任务需要批量队列接入后启用">
            定时
          </button>
        </div>
      </section>

      <div className="sidebar-bottom">
        <div
          className={`account-card ${hasUpdate ? "has-update" : ""}`}
          role="button"
          tabIndex={0}
          onClick={accountAction}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") accountAction();
          }}
        >
          <div className="avatar">{avatarText}</div>
          <div className="account-meta">
            <span className="email">{email}</span>
            <span className="account-name">{displayName}</span>
            {hasUpdate ? (
              <span className="account-update-pill">
                新版本 {formatVersion(updateState.latestVersion)}
              </span>
            ) : updateState.status === "checking" ? (
              <span className="account-update-pill muted">检查更新中</span>
            ) : null}
          </div>
          <button
            className="settings-btn"
            type="button"
            aria-label="设置"
            title="设置"
            onClick={(event) => {
              event.stopPropagation();
              onOpenSettings();
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
