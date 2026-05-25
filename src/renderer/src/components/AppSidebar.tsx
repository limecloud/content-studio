import { NAV_GROUPS } from "../app/constants";
import { useState } from "react";
import type {
  AutoUpdateState,
  BuguAuthState,
} from "../../../shared/types";
import type { ModuleKey } from "../app/types";

interface AppSidebarProps {
  activeModule: ModuleKey;
  workspacePath?: string;
  updateState: AutoUpdateState;
  authState: BuguAuthState | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectModule: (module: ModuleKey) => void;
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
  ["AI 生图", "AI"],
  ["对标图反推", "🔎"],
  ["场景提示词", "🎯"],
  ["绿幕文案图", "字"],
  ["合规检测", "🛡️"],
  ["图片精修", "✨"],
  ["视频生成", "🎬"],
  ["视频脚本", "拆"],
  ["视频 Prompt", "▶"],
  ["成品视频入库", "入"],
  ["成品视频导入", "入"],
  ["混剪包导出", "包"],
  ["创意视频", "🎞️"],
  ["自定义视频", "🎥"],
  ["文章生成", "✍️"],
  ["标题生成", "题"],
  ["脚本生成", "稿"],
  ["成型知识库", "📚"],
  ["品牌 / 产品知识库", "品"],
  ["场景库", "景"],
  ["IP 知识库", "IP"],
  ["输入源 / 文档转换", "源"],
  ["素材库", "🗂️"],
  ["Prompt 工作台", "P"],
  ["SOP 工作流", "S"],
  ["运行历史", "史"],
  ["skills 管理", "🧩"],
  ["工作流定义", "流"],
  ["Canvas 编排", "画"],
]);

const NAV_ACTIVE_PARENT = new Map<ModuleKey, ModuleKey>([
  ["video-creative", "assets-prompt-workbench"],
  ["video-custom", "assets-prompt-workbench"],
]);

const ADVANCED_MODULES = new Set<ModuleKey>([
  "workflow-definition",
  "workflow-canvas",
]);

export function AppSidebar({
  activeModule,
  workspacePath,
  updateState,
  authState,
  collapsed,
  onToggleCollapsed,
  onSelectModule,
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
  const brandName =
    authState?.bootstrap?.branding?.shortName ||
    authState?.bootstrap?.branding?.appName ||
    authState?.bootstrap?.tenant?.name ||
    "布谷AI";
  const logoUrl = authState?.bootstrap?.branding?.logoUrl;
  const brandInitial = brandName.trim().slice(0, 1).toUpperCase() || "C";
  const displayName = isAuthenticated
    ? user?.displayName || user?.username || user?.email || `${brandName}用户`
    : "本地模式";
  const email = isAuthenticated
    ? user?.email || user?.username || "账号已登录"
    : `未登录${brandName}账号`;
  const avatarText = displayName.trim().slice(0, 1).toUpperCase() || "B";
  const visibleActiveModule = NAV_ACTIVE_PARENT.get(activeModule) ?? activeModule;
  const [advancedMaintenanceOpen, setAdvancedMaintenanceOpen] = useState(false);
  const shouldShowAdvancedMaintenance = advancedMaintenanceOpen || ADVANCED_MODULES.has(visibleActiveModule);

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <span className="visually-hidden">
        {brandName} 内容工厂 图片生成 视频生成 文章生成 成型知识库 素材库 skills 管理
      </span>
      <section className="brand-card">
        <button
          className={`brand-logo-button ${collapsed ? "can-expand" : ""}`}
          type="button"
          aria-label={collapsed ? "展开侧边栏" : brandName}
          title={collapsed ? "展开侧边栏" : brandName}
          onClick={() => {
            if (collapsed) onToggleCollapsed();
          }}
        >
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="brand-logo-img" />
          ) : (
            <span className="brand-logo-fallback">{brandInitial}</span>
          )}
        </button>
        <div className="brand-copy">
          <p className="eyebrow">{brandName}</p>
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
        {NAV_GROUPS.map((group) => {
          const normalItems = group.items.filter((item) => !item.advanced);
          const advancedItems = group.items.filter((item) => item.advanced);
          return (
            <div key={group.title} className="nav-group">
              <p>{group.title}</p>
              {normalItems.map((item) => (
                <button
                  key={`${group.title}:${item.label}`}
                  className={`nav-item ${item.key && visibleActiveModule === item.key ? "active" : ""} ${item.disabled ? "disabled" : ""}`}
                  title={item.label}
                  onClick={() =>
                    item.key && !item.disabled && onSelectModule(item.key)
                  }
                >
                  <span className="nav-icon">
                    {NAV_ICONS.get(item.label) ?? "•"}
                  </span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
              {advancedItems.length > 0 ? (
                <button
                  className={`nav-item nav-advanced-toggle ${shouldShowAdvancedMaintenance ? "active" : ""}`}
                  type="button"
                  title="高级维护"
                  aria-expanded={shouldShowAdvancedMaintenance}
                  onClick={() => setAdvancedMaintenanceOpen((current) => !current)}
                >
                  <span className="nav-icon">高</span>
                  <span className="nav-label">高级维护</span>
                  <em>{shouldShowAdvancedMaintenance ? "收起" : "展开"}</em>
                </button>
              ) : null}
              {shouldShowAdvancedMaintenance ? advancedItems.map((item) => (
                <button
                  key={`${group.title}:${item.label}`}
                  className={`nav-item nav-item-advanced ${item.key && visibleActiveModule === item.key ? "active" : ""} ${item.disabled ? "disabled" : ""}`}
                  title={item.label}
                  onClick={() =>
                    item.key && !item.disabled && onSelectModule(item.key)
                  }
                >
                  <span className="nav-icon">
                    {NAV_ICONS.get(item.label) ?? "•"}
                  </span>
                  <span className="nav-label">{item.label}</span>
                </button>
              )) : null}
            </div>
          );
        })}
      </nav>

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
