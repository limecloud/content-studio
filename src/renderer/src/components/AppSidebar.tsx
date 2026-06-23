import { NAV_GROUPS } from "../app/constants";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  PlatformAccountEntry,
  type PlatformSettingsPageKey,
} from "@limecloud/desktop-platform-react";
import type {
  AutoUpdateState,
  BuguAuthState,
} from "../../../shared/types";
import { createPlatformAccountProjection } from "../app/platformAccountProjection";
import { CONTENT_STUDIO_PLATFORM_SETTINGS_THEME } from "../app/platformSettingsTheme";
import type { ModuleKey } from "../app/types";
import defaultAppLogoUrl from "../logo.png";

interface AppSidebarProps {
  activeModule: ModuleKey;
  updateState: AutoUpdateState;
  authState: BuguAuthState | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onSelectModule: (module: ModuleKey) => void;
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

const NAV_ICONS = new Map<string, string>([
  ["图片生成", "🖼️"],
  ["AI 生图", "AI"],
  ["拆解素材", "✂️"],
  ["绿幕文案图", "字"],
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
  ["成型知识库", "📚"],
  ["品牌 / 产品知识库", "品"],
  ["素材库", "🗂️"],
  ["skills 管理", "🧩"],
]);

const DEFAULT_OPEN_GROUP_TITLES = new Set(["图片"]);

type RailIconName = "skills" | "image" | "video" | "database" | "box";

const RAIL_ICON_PATHS: Record<RailIconName, ReactNode> = {
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

function RailIcon({ name }: { name: RailIconName }) {
  return (
    <svg className="sidebar-rail-icon" viewBox="0 0 24 24" aria-hidden="true">
      {RAIL_ICON_PATHS[name]}
    </svg>
  );
}

export function AppSidebar({
  activeModule,
  updateState,
  authState,
  collapsed,
  onToggleCollapsed,
  onSelectModule,
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
  const visibleActiveModule = activeModule;
  const collapsedRailItems: Array<{
    label: string;
    icon: RailIconName;
    active: boolean;
    onClick: () => void;
  }> = [
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
      active: activeModule.startsWith("knowledge"),
      onClick: () => onSelectModule("knowledge"),
    },
    {
      label: "素材库",
      icon: "box",
      active: activeModule === "assets",
      onClick: () => onSelectModule("assets"),
    },
  ];
  const activeGroupTitle = useMemo(() => NAV_GROUPS.find((group) =>
    group.items.some((item) => item.key === visibleActiveModule),
  )?.title, [visibleActiveModule]);
  const [openGroups, setOpenGroups] = useState<Set<string>>(
    () => new Set(NAV_GROUPS.filter((group) => DEFAULT_OPEN_GROUP_TITLES.has(group.title)).map((group) => group.title)),
  );

  useEffect(() => {
    if (!activeGroupTitle) return;
    setOpenGroups((current) => {
      if (current.has(activeGroupTitle)) return current;
      const next = new Set(current);
      next.add(activeGroupTitle);
      return next;
    });
  }, [activeGroupTitle]);

  function toggleGroup(title: string): void {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  return (
    <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
      <span className="visually-hidden">
        {brandName} 内容工厂 skills 管理 图片生成 视频生成 成型知识库 素材库
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
        {NAV_GROUPS.map((group) => {
          const groupOpen = openGroups.has(group.title);
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
                  {group.items.map((item) => (
                    <button
                      key={`${group.title}:${item.label}`}
                      className={`nav-item ${item.key && visibleActiveModule === item.key ? "active" : ""}`}
                      type="button"
                      aria-label={item.label}
                      title={item.label}
                      onClick={() => item.key && onSelectModule(item.key)}
                    >
                      <span className="nav-icon">
                        {NAV_ICONS.get(item.label) ?? "•"}
                      </span>
                      <span className="nav-label">{item.label}</span>
                    </button>
                  ))}
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
