import logoUrl from '../logo.png';
import { NAV_GROUPS } from '../app/constants';
import type { ModuleKey } from '../app/types';

interface AppSidebarProps {
  activeModule: ModuleKey;
  workspacePath?: string;
  onSelectModule: (module: ModuleKey) => void;
  onChooseWorkspace: () => void;
  onRefreshWorkspace: () => void;
  onOpenSettings: () => void;
}

export function AppSidebar({
  activeModule,
  workspacePath,
  onSelectModule,
  onChooseWorkspace,
  onRefreshWorkspace,
  onOpenSettings,
}: AppSidebarProps) {
  return (
    <aside className="sidebar">
      <section className="brand-card">
        <img src={logoUrl} alt="Logo" className="brand-logo-img" />
        <div>
          <p className="eyebrow">布谷AI</p>
          <h1>内容工厂</h1>
        </div>
      </section>

      <section className="workspace-card">
        <p className="eyebrow">Workspace</p>
        <strong>{workspacePath ? workspacePath.split('/').slice(-2).join('/') : '尚未选择工作区'}</strong>
        <button className="primary small" onClick={onChooseWorkspace}>选择 Workspace</button>
        <button className="ghost small" onClick={onRefreshWorkspace}>刷新本地事实源</button>
      </section>

      <nav className="nav-stack">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="nav-group">
            <p>{group.title}</p>
            {group.items.map((item) => (
              <button
                key={`${group.title}:${item.label}`}
                className={`nav-item ${item.key && activeModule === item.key ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
                onClick={() => item.key && !item.disabled && onSelectModule(item.key)}
              >
                <span>{item.label}</span>
                {item.badge ? <em>{item.badge}</em> : null}
              </button>
            ))}
          </div>
        ))}
      </nav>

      <section className="mode-card">
        <p className="eyebrow">处理模式</p>
        <div className="mode-grid">
          <button className="active">单次</button>
          <button disabled>批量</button>
          <button disabled>定时</button>
        </div>
      </section>

      <div className="sidebar-bottom">
        <div className="account-card" onClick={onOpenSettings}>
          <div className="avatar">C</div>
          <span className="email">coso@gmail.com</span>
          <button className="settings-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}
