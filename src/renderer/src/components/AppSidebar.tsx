import { NAV_GROUPS } from "../app/constants";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  PlatformAccountEntry,
  type PlatformSettingsPageKey,
} from "@limecloud/desktop-platform-react";
import type {
  AgentPromptSession,
  AutoUpdateState,
  BuguAuthState,
} from "../../../shared/types";
import { createPlatformAccountProjection } from "../app/platformAccountProjection";
import { CONTENT_STUDIO_PLATFORM_SETTINGS_THEME } from "../app/platformSettingsTheme";
import type { ModuleKey } from "../app/types";
import defaultAppLogoUrl from "../logo.png";

interface AppSidebarProps {
  activeModule: ModuleKey;
  workspacePath?: string;
  recentWorkspacePaths: string[];
  updateState: AutoUpdateState;
  authState: BuguAuthState | null;
  agentPromptSessions: AgentPromptSession[];
  activeAgentPromptSessionId: string;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectModule: (module: ModuleKey) => void;
  onSelectAgentSession: (sessionId: string) => void;
  onSelectWorkspacePath: (workspacePath: string) => void | Promise<void>;
  onOpenSettingsPage: (page: PlatformSettingsPageKey) => void;
  onOpenUpdates: () => void;
}

function formatVersion(version?: string) {
  if (!version) return "";
  return version.startsWith("v") ? version : `v${version}`;
}

function projectLabelFromPath(path?: string): string {
  if (!path) return "未命名项目";
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function sessionTitle(session: AgentPromptSession): string {
  return session.title?.trim() || session.userIntent?.trim().slice(0, 24) || "新对话";
}

function formatSessionAge(value?: string): string {
  if (!value) return "";
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const diff = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;
  if (diff < hour) return `${Math.max(1, Math.floor(diff / minute))} 分`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时`;
  if (diff < week) return `${Math.floor(diff / day)} 天`;
  return `${Math.floor(diff / week)} 周`;
}

const NAV_ICONS = new Map<string, string>([
  ["agents", "AI"],
  ["图片生成", "🖼️"],
  ["AI 生图", "AI"],
  ["拆解素材", "✂️"],
  ["场景提示词", "词"],
  ["绿幕文案图", "字"],
  ["合规检测", "审"],
  ["图片精修", "修"],
  ["视频生成", "🎬"],
  ["AI 视频", "AI"],
  ["视频 Prompt", "P"],
  ["视频脚本", "拆"],
  ["成品视频导入", "入"],
  ["混剪包导出", "包"],
  ["创意视频", "🎞️"],
  ["自定义视频", "🎥"],
  ["文章生成", "✍️"],
  ["标题生成", "题"],
  ["脚本生成", "稿"],
  ["内容制造", "造"],
  ["成型知识库", "📚"],
  ["内容知识地图", "图"],
  ["审核任务", "审"],
  ["品牌 / 产品知识库", "品"],
  ["场景库", "景"],
  ["IP 知识库", "IP"],
  ["输入源 / 文档转换", "源"],
  ["素材库", "🗂️"],
  ["skills 管理", "🧩"],
]);

const NAV_ACTIVE_PARENT = new Map<ModuleKey, ModuleKey>([
  ["assets-prompt-workbench", "agents"],
  ["assets-history", "assets"],
]);

const ADVANCED_MODULES = new Set<ModuleKey>([
]);

const DEFAULT_OPEN_GROUP_TITLES = new Set(["agents"]);

type RailIconName = "agent" | "skills" | "image" | "video" | "database" | "box";
type AgentNavIconName = "new-chat" | "skills" | "project";

const RAIL_ICON_PATHS: Record<RailIconName, ReactNode> = {
  agent: (
    <>
      <path d="M7 8.5h10" />
      <path d="M7 12h6" />
      <path d="M9 19l3-3h5a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h2z" />
    </>
  ),
  skills: (
    <>
      <path d="M12 3l7 7-7 11-7-11z" />
      <path d="M5 10h14" />
      <path d="M12 3v18" />
    </>
  ),
  image: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M7 17l4-4 3 3 2-2 3 3" />
    </>
  ),
  video: (
    <>
      <rect x="4" y="7" width="11" height="10" rx="2" />
      <path d="M15 11l5-3v8l-5-3z" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="3" />
      <path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6" />
      <path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
    </>
  ),
  box: (
    <>
      <path d="M4 8l8-4 8 4-8 4z" />
      <path d="M4 8v8l8 4 8-4V8" />
      <path d="M12 12v8" />
    </>
  ),
};

const AGENT_NAV_ICON_PATHS: Record<AgentNavIconName, ReactNode> = {
  "new-chat": (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  skills: (
    <>
      <path d="M12 3l7 7-7 11-7-11z" />
      <path d="M5 10h14" />
      <path d="M12 3v18" />
    </>
  ),
  project: (
    <>
      <path d="M4 7h6l2 2h8v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
      <path d="M4 7v11" />
    </>
  ),
};

function RailIcon({ name }: { name: RailIconName }) {
  return (
    <svg className="sidebar-rail-icon" viewBox="0 0 24 24" aria-hidden="true">
      {RAIL_ICON_PATHS[name]}
    </svg>
  );
}

function AgentNavIcon({ name }: { name: AgentNavIconName }) {
  return (
    <svg className="agent-nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {AGENT_NAV_ICON_PATHS[name]}
    </svg>
  );
}

export function AppSidebar({
  activeModule,
  workspacePath,
  recentWorkspacePaths,
  updateState,
  authState,
  agentPromptSessions,
  activeAgentPromptSessionId,
  collapsed,
  onToggleCollapsed,
  onSelectModule,
  onSelectAgentSession,
  onSelectWorkspacePath,
  onOpenSettingsPage,
  onOpenUpdates,
}: AppSidebarProps) {
  const hasUpdate =
    updateState.status === "update-available" && updateState.hasUpdate;
  const accountProjection = createPlatformAccountProjection(authState);
  const brandName =
    authState?.bootstrap?.branding?.shortName ||
    authState?.bootstrap?.branding?.appName ||
    authState?.bootstrap?.tenant?.name ||
    "布谷AI";
  const logoUrl = authState?.bootstrap?.branding?.logoUrl;
  const sidebarLogoUrl = logoUrl || defaultAppLogoUrl;
  const brandInitial = brandName.trim().slice(0, 1).toUpperCase() || "C";
  const visibleActiveModule = NAV_ACTIVE_PARENT.get(activeModule) ?? activeModule;
  const collapsedRailItems: Array<{
    label: string;
    icon: RailIconName;
    active: boolean;
    onClick: () => void;
  }> = [
    {
      label: "Agents",
      icon: "agent",
      active: visibleActiveModule === "agents",
      onClick: () => onSelectModule("agents"),
    },
    {
      label: "skills 管理",
      icon: "skills",
      active: visibleActiveModule === "skills",
      onClick: () => onSelectModule("skills"),
    },
    {
      label: "图片",
      icon: "image",
      active: activeModule.startsWith("image") || activeModule === "material-breakdown",
      onClick: () => onSelectModule("image-production"),
    },
    {
      label: "视频",
      icon: "video",
      active: activeModule.startsWith("video"),
      onClick: () => onSelectModule("video"),
    },
    {
      label: "知识库",
      icon: "database",
      active: activeModule.startsWith("knowledge") || activeModule === "content-batch",
      onClick: () => onSelectModule("content-batch"),
    },
    {
      label: "素材库",
      icon: "box",
      active: activeModule === "assets",
      onClick: () => onSelectModule("assets"),
    },
  ];
  const activeAgentSession = useMemo(
    () => agentPromptSessions.find((session) => session.id === activeAgentPromptSessionId),
    [activeAgentPromptSessionId, agentPromptSessions],
  );
  const agentProjects = useMemo(() => {
    const sessionsByPath = new Map<string, AgentPromptSession[]>();
    if (workspacePath) sessionsByPath.set(workspacePath, []);
    recentWorkspacePaths.forEach((path) => {
      if (path.trim()) sessionsByPath.set(path, sessionsByPath.get(path) ?? []);
    });
    agentPromptSessions.forEach((session) => {
      if (!session.workspacePath) return;
      const sessions = sessionsByPath.get(session.workspacePath) ?? [];
      sessions.push(session);
      sessionsByPath.set(session.workspacePath, sessions);
    });
    return Array.from(sessionsByPath.entries()).map(([path, sessions]) => ({
      path,
      label: projectLabelFromPath(path),
      sessions,
    }));
  }, [agentPromptSessions, recentWorkspacePaths, workspacePath]);
  const agentProjectPaths = useMemo(
    () => new Set(agentProjects.map((project) => project.path)),
    [agentProjects],
  );
  const ungroupedAgentSessions = useMemo(
    () => agentPromptSessions.filter((session) => !session.workspacePath || !agentProjectPaths.has(session.workspacePath)),
    [agentProjectPaths, agentPromptSessions],
  );
  const activeGroupTitle = useMemo(() => NAV_GROUPS.find((group) =>
    group.items.some((item) => item.key === visibleActiveModule),
  )?.title, [visibleActiveModule]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(NAV_GROUPS.filter((group) => DEFAULT_OPEN_GROUP_TITLES.has(group.title)).map((group) => group.title)),
  );
  const [openAgentProjectPaths, setOpenAgentProjectPaths] = useState<Set<string>>(() => new Set());
  const [advancedMaintenanceOpen, setAdvancedMaintenanceOpen] = useState(false);
  const shouldShowAdvancedMaintenance = advancedMaintenanceOpen || ADVANCED_MODULES.has(visibleActiveModule);

  useEffect(() => {
    if (!activeGroupTitle) return;
    setOpenGroups((current) => {
      if (current.has(activeGroupTitle)) return current;
      const next = new Set(current);
      next.add(activeGroupTitle);
      return next;
    });
  }, [activeGroupTitle]);

  useEffect(() => {
    if (!workspacePath) return;
    setOpenAgentProjectPaths((current) => {
      if (current.has(workspacePath)) return current;
      const next = new Set(current);
      next.add(workspacePath);
      return next;
    });
  }, [workspacePath]);

  useEffect(() => {
    if (!activeAgentSession?.workspacePath) return;
    setOpenAgentProjectPaths((current) => {
      if (current.has(activeAgentSession.workspacePath)) return current;
      const next = new Set(current);
      next.add(activeAgentSession.workspacePath);
      return next;
    });
  }, [activeAgentSession?.workspacePath]);

  function toggleGroup(title: string): void {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  function toggleAgentProject(path: string): void {
    setOpenAgentProjectPaths((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function selectAgentProject(path: string): void {
    if (path === workspacePath) {
      toggleAgentProject(path);
      onSelectModule("agents");
      return;
    }
    setOpenAgentProjectPaths((current) => {
      const next = new Set(current);
      next.add(path);
      return next;
    });
    onSelectModule("agents");
    void onSelectWorkspacePath(path);
  }

  function openAgentSession(session: AgentPromptSession): void {
    onSelectAgentSession(session.id);
    onSelectModule("agents");
  }

  function startNewAgentDialog(): void {
    onSelectAgentSession("");
    onSelectModule("agents");
  }

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <span className="visually-hidden">
        {brandName} 内容工厂 agents skills 管理 图片生成 视频生成 成型知识库 素材库
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
          {sidebarLogoUrl ? (
            <img src={sidebarLogoUrl} alt="Logo" className="brand-logo-img" />
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

      <nav className="nav-stack">
        {collapsed ? (
          <div className="sidebar-rail-nav" aria-label="折叠导航">
            {collapsedRailItems.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`sidebar-rail-item ${item.active ? "active" : ""}`}
                aria-label={item.label}
                title={item.label}
                onClick={item.onClick}
              >
                <RailIcon name={item.icon} />
              </button>
            ))}
          </div>
        ) : (
          <>
          <section className="agent-nav" aria-label="agents">
          <button
            type="button"
            className="agent-nav-root"
            aria-expanded={openGroups.has("agents")}
            title="Agents"
            onClick={() => toggleGroup("agents")}
          >
            <span>Agents</span>
            <em>{openGroups.has("agents") ? "−" : "+"}</em>
          </button>

          {openGroups.has("agents") ? (
            <div className="agent-nav-body">
              <div className="agent-nav-actions">
                <button
                  type="button"
                  className={`agent-nav-action ${visibleActiveModule === "agents" && !activeAgentPromptSessionId ? "active" : ""}`}
                  title="新对话"
                  onClick={startNewAgentDialog}
                >
                  <AgentNavIcon name="new-chat" />
                  <span>新对话</span>
                </button>
                <button
                  type="button"
                  className={`agent-nav-action ${visibleActiveModule === "skills" ? "active" : ""}`}
                  title="skills 管理"
                  onClick={() => onSelectModule("skills")}
                >
                  <AgentNavIcon name="skills" />
                  <span>skills 管理</span>
                </button>
              </div>

              {agentProjects.length ? (
                <div className="agent-nav-section">
                  <div className="agent-nav-branch">项目</div>
                  {agentProjects.map((project) => {
                    const projectOpen = openAgentProjectPaths.has(project.path);
                    const projectActive = workspacePath === project.path;
                    const visibleSessions = project.sessions.slice(0, 5);
                    return (
                      <div key={project.path} className="agent-project">
                        <button
                          type="button"
                          className={`agent-project-row ${projectActive ? "active" : ""}`}
                          aria-expanded={projectOpen}
                          title={project.label}
                          onClick={() => selectAgentProject(project.path)}
                        >
                          <AgentNavIcon name="project" />
                          <span>{project.label}</span>
                        </button>
                        {projectOpen && visibleSessions.length ? (
                          <div className="agent-conversation-list" aria-label={`${project.label} 对话`}>
                            {visibleSessions.map((session) => (
                              <button
                                key={session.id}
                                type="button"
                                className={`agent-conversation-row ${activeAgentPromptSessionId === session.id ? "active" : ""}`}
                                title={sessionTitle(session)}
                                onClick={() => openAgentSession(session)}
                              >
                                <span>{sessionTitle(session)}</span>
                                <time>{formatSessionAge(session.updatedAt || session.createdAt)}</time>
                              </button>
                            ))}
                            {project.sessions.length > visibleSessions.length ? (
                              <span className="agent-more-row">展开显示</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              <div className="agent-nav-section">
                <div className="agent-nav-branch">对话</div>
                <div className="agent-conversation-list agent-conversation-list-standalone" aria-label="未归类对话">
                  {ungroupedAgentSessions.slice(0, 5).map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={`agent-conversation-row ${activeAgentPromptSessionId === session.id ? "active" : ""}`}
                      title={sessionTitle(session)}
                      onClick={() => openAgentSession(session)}
                    >
                      <span>{sessionTitle(session)}</span>
                      <time>{formatSessionAge(session.updatedAt || session.createdAt)}</time>
                    </button>
                  ))}
                  {ungroupedAgentSessions.length > 5 ? (
                    <span className="agent-more-row">展开显示</span>
                  ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </section>

        {NAV_GROUPS.filter((group) => group.title !== "agents").map((group) => {
          const groupOpen = openGroups.has(group.title);
          const normalItems = group.items.filter((item) => !item.advanced);
          const advancedItems = group.items.filter((item) => item.advanced);
          return (
            <div key={group.title} className={`nav-group ${groupOpen ? "open" : "collapsed"}`}>
              <button
                type="button"
                className="nav-group-toggle"
                aria-expanded={groupOpen}
                aria-label={`${groupOpen ? "折叠" : "展开"}${group.title}`}
                title={group.title}
                onClick={() => toggleGroup(group.title)}
              >
                <span>{group.title}</span>
                <em>{groupOpen ? "−" : "+"}</em>
              </button>
              {groupOpen ? (
                <>
                  {normalItems.map((item) => (
                    <button
                      key={`${group.title}:${item.label}`}
                      className={`nav-item ${item.key && visibleActiveModule === item.key ? "active" : ""} ${item.disabled ? "disabled" : ""}`}
                      type="button"
                      aria-label={item.label}
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
                  aria-label="高级维护"
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
                      type="button"
                      aria-label={item.label}
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
                </>
              ) : null}
            </div>
          );
        })}
          </>
        )}
      </nav>

      <div className="sidebar-bottom">
        <div className="content-studio-platform-account-shell">
          <PlatformAccountEntry
            account={accountProjection}
            className="content-studio-platform-account-entry"
            theme={CONTENT_STUDIO_PLATFORM_SETTINGS_THEME}
            onOpenSettingsPage={onOpenSettingsPage}
          />
          {hasUpdate ? (
            <button
              className="content-studio-platform-account-update"
              type="button"
              onClick={onOpenUpdates}
              title={`新版本 ${formatVersion(updateState.latestVersion)}`}
            >
              <span>新版本 {formatVersion(updateState.latestVersion)}</span>
            </button>
          ) : updateState.status === "checking" ? (
            <span className="content-studio-platform-account-update muted">检查更新中</span>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
