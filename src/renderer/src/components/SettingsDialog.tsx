import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { COLOR_THEME_OPTIONS } from '../app/constants';
import type {
  AutoUpdateState,
  BuguAuthState,
  ModelConfigView,
  ModelSecretStatus,
  SkillFileAssociationResult,
  SkillFileAssociationState,
} from '../../../shared/types';
import type { ColorTheme, ModelDraft, SettingsTab } from '../app/types';
import { BuguAuthForm, type BuguAuthActions } from './BuguAuthGate';

interface SettingsDialogProps extends BuguAuthActions {
  settingsTab: SettingsTab;
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: Dispatch<SetStateAction<'light' | 'dark' | 'system'>>;
  colorTheme: ColorTheme;
  setColorTheme: Dispatch<SetStateAction<ColorTheme>>;
  modelConfig: ModelConfigView | null;
  modelDraft: ModelDraft;
  setModelDraft: Dispatch<SetStateAction<ModelDraft>>;
  menubarShow: boolean;
  setMenubarShow: Dispatch<SetStateAction<boolean>>;
  autoStart: boolean;
  setAutoStart: Dispatch<SetStateAction<boolean>>;
  notificationsEnabled: boolean;
  setNotificationsEnabled: Dispatch<SetStateAction<boolean>>;
  reduceAnimation: boolean;
  setReduceAnimation: Dispatch<SetStateAction<boolean>>;
  syncClaudeHistory: boolean;
  setSyncClaudeHistory: Dispatch<SetStateAction<boolean>>;
  shortcutActive: boolean;
  setShortcutActive: Dispatch<SetStateAction<boolean>>;
  commandWhitelist: boolean;
  setCommandWhitelist: Dispatch<SetStateAction<boolean>>;
  updateState: AutoUpdateState;
  authState: BuguAuthState | null;
  onSetAutoUpdateEnabled: (enabled: boolean) => void;
  onCheckForUpdates: () => void;
  onOpenUpdateDownload: () => void;
  onOpenUpdateReleaseNotes: () => void;
  onOpenLogsDirectory: () => void;
  onGetSkillFileAssociation: () => Promise<SkillFileAssociationState>;
  onSetSkillFileAssociationDefault: () => Promise<SkillFileAssociationResult>;
  onSaveModelConfig: () => void;
  onLogoutAuth: () => void;
  onClose: () => void;
}

function formatVersion(version?: string) {
  if (!version) return '未知版本';
  return version.startsWith('v') ? version : `v${version}`;
}

function formatSize(size?: number) {
  if (!size || !Number.isFinite(size)) return '';
  return `${Math.round(size / 1024 / 1024)} MB`;
}

function formatDateTime(value?: string) {
  if (!value) return '尚未检查';
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleString() : value;
}

function updateStatusText(updateState: AutoUpdateState) {
  if (updateState.status === 'checking') return '正在检查更新...';
  if (updateState.status === 'update-available') return `发现新版本 ${formatVersion(updateState.latestVersion)}`;
  if (updateState.status === 'up-to-date') return '当前已是最新版本';
  if (updateState.status === 'error') return updateState.error || '检查更新失败';
  return '开启后，正式安装包启动时会自动检查更新。';
}

function keyStatusTone(status: ModelSecretStatus | undefined, hasKey: boolean | undefined, optional = false): 'ready' | 'missing' | 'muted' | 'reauthorize' {
  if (status === 'requires-reauthorization') return 'reauthorize';
  if (status === 'available' || hasKey) return 'ready';
  return optional ? 'muted' : 'missing';
}

function keyStatusLabel(status: ModelSecretStatus | undefined, hasKey: boolean | undefined, optional = false): string {
  if (status === 'requires-reauthorization') return '需重新授权';
  if (status === 'available' || hasKey) return '已授权';
  return optional ? '可选' : '未配置';
}

function reauthorizationSummary(modelConfig: ModelConfigView | null): string | null {
  const labels: string[] = [];
  if (modelConfig?.textApiKeyStatus === 'requires-reauthorization') labels.push('文字');
  if (modelConfig?.imageApiKeyStatus === 'requires-reauthorization') labels.push('图片');
  if (modelConfig?.videoApiKeyStatus === 'requires-reauthorization') labels.push('视频');
  return labels.length ? `${labels.join('、')} API Key 需要重新授权。` : null;
}

function resolveBrandName(authState?: BuguAuthState | null): string {
  return authState?.bootstrap?.branding?.shortName
    || authState?.bootstrap?.branding?.appName
    || authState?.bootstrap?.tenant?.name
    || '布谷AI';
}

export function SettingsDialog({
  settingsTab,
  setSettingsTab,
  themeMode,
  setThemeMode,
  colorTheme,
  setColorTheme,
  modelConfig,
  modelDraft,
  setModelDraft,
  menubarShow,
  setMenubarShow,
  autoStart,
  setAutoStart,
  notificationsEnabled,
  setNotificationsEnabled,
  reduceAnimation,
  setReduceAnimation,
  syncClaudeHistory,
  setSyncClaudeHistory,
  shortcutActive,
  setShortcutActive,
  commandWhitelist,
  setCommandWhitelist,
  updateState,
  authState,
  onSetAutoUpdateEnabled,
  onCheckForUpdates,
  onOpenUpdateDownload,
  onOpenUpdateReleaseNotes,
  onOpenLogsDirectory,
  onGetSkillFileAssociation,
  onSetSkillFileAssociationDefault,
  onSaveModelConfig,
  onPasswordLogin,
  onLogoutAuth,
  onClose,
}: SettingsDialogProps) {
  const brandName = resolveBrandName(authState);
  const logoUrl = authState?.bootstrap?.branding?.logoUrl;
  const brandInitial = brandName.trim().slice(0, 1).toUpperCase() || 'C';
  const accountUser = authState?.user;
  const isAccountAuthenticated = Boolean(authState?.authenticated);
  const accountName = isAccountAuthenticated
    ? accountUser?.displayName || accountUser?.username || accountUser?.email || `${brandName}用户`
    : '本地模式';
  const accountEmail = isAccountAuthenticated
    ? accountUser?.email || accountUser?.username || '账号已登录'
    : `未登录${brandName}账号`;
  const accountInitial = accountName.trim().slice(0, 1).toUpperCase() || 'B';
  const subscription = authState?.bootstrap?.subscription;
  const subscriptionText =
    subscription?.planName || subscription?.planKey || subscription?.status || '企业开通';
  const textKeyTone = keyStatusTone(modelConfig?.textApiKeyStatus, modelConfig?.hasTextApiKey);
  const imageKeyTone = keyStatusTone(modelConfig?.imageApiKeyStatus, modelConfig?.hasImageApiKey);
  const videoKeyTone = keyStatusTone(modelConfig?.videoApiKeyStatus, modelConfig?.hasVideoApiKey, true);
  const modelReauthorizationSummary = reauthorizationSummary(modelConfig);
  const [skillAssociation, setSkillAssociation] = useState<SkillFileAssociationState | null>(null);
  const [skillAssociationBusy, setSkillAssociationBusy] = useState(false);
  const [skillAssociationMessage, setSkillAssociationMessage] = useState<string | null>(null);

  async function refreshSkillAssociation(): Promise<void> {
    setSkillAssociationBusy(true);
    setSkillAssociationMessage(null);
    try {
      const state = await onGetSkillFileAssociation();
      setSkillAssociation(state);
    } catch (error) {
      setSkillAssociationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSkillAssociationBusy(false);
    }
  }

  async function setSkillAssociationDefault(): Promise<void> {
    setSkillAssociationBusy(true);
    setSkillAssociationMessage(null);
    try {
      const result = await onSetSkillFileAssociationDefault();
      setSkillAssociation(result);
      setSkillAssociationMessage(result.ok ? `已设置 .skill 默认由${brandName}打开。` : result.error ?? result.message);
    } catch (error) {
      setSkillAssociationMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSkillAssociationBusy(false);
    }
  }

  useEffect(() => {
    if (settingsTab !== 'general') return;
    void refreshSkillAssociation();
  }, [settingsTab]);

  return (
  <div className="modal-backdrop" onClick={() => onClose()}>
    <div className="modal-card settings-modal" onClick={(event) => event.stopPropagation()}>
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <div className="settings-header">
            <h3>设置 <span className="shortcut">⌘,</span></h3>
          </div>
          <nav className="settings-nav">
            <button className={`nav-item ${settingsTab === 'general' ? 'active' : ''}`} onClick={() => setSettingsTab('general')}>
              <span className="icon">⚙️</span> 通用
            </button>
            <button className={`nav-item ${settingsTab === 'theme' ? 'active' : ''}`} onClick={() => setSettingsTab('theme')}>
              <span className="icon">🖌️</span> 主题
            </button>
            <button className={`nav-item ${settingsTab === 'model' ? 'active' : ''}`} onClick={() => setSettingsTab('model')}>
              <span className="icon">🧠</span> 模型
            </button>
            <button className={`nav-item ${settingsTab === 'account' ? 'active' : ''}`} onClick={() => setSettingsTab('account')}>
              <span className="icon">👤</span> 账号
            </button>
            <button className={`nav-item ${settingsTab === 'about' ? 'active' : ''}`} onClick={() => setSettingsTab('about')}>
              <span className="icon">ℹ️</span> 关于
            </button>
          </nav>
        </aside>

        <main className="settings-content">
          {settingsTab === 'general' ? (
            <div className="general-settings">
              <div className="panel-title" style={{ marginBottom: '24px' }}>
                <h3>通用</h3>
              </div>

              <div className="settings-list">
                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>菜单栏</strong>
                    <span>在菜单栏中显示 {brandName}</span>
                  </div>
                  <div className={`switch ${menubarShow ? 'active' : ''}`} onClick={() => setMenubarShow(!menubarShow)}></div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>开机自动</strong>
                    <span>登录计算机时自动启动 {brandName}</span>
                  </div>
                  <div className={`switch ${autoStart ? 'active' : ''}`} onClick={() => setAutoStart(!autoStart)}></div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>通知</strong>
                    <span>在 {brandName} 完成长时间生成任务时接收通知。</span>
                  </div>
                  <div className={`switch ${notificationsEnabled ? 'active' : ''}`} onClick={() => setNotificationsEnabled(!notificationsEnabled)}></div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>自动检查更新</strong>
                    <span>启动正式安装包后自动检查新版本；发现更新会在左下角账号卡片提示。</span>
                  </div>
                  <div className={`switch ${updateState.enabled ? 'active' : ''}`} onClick={() => onSetAutoUpdateEnabled(!updateState.enabled)}></div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>减少动画</strong>
                    <span>关闭界面过渡动画，降低 GPU 功耗</span>
                  </div>
                  <div className={`switch ${reduceAnimation ? 'active' : ''}`} onClick={() => setReduceAnimation(!reduceAnimation)}></div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>同步本地素材历史</strong>
                    <span>将本地内容生产记录同步到当前工作区</span>
                  </div>
                  <div className={`switch ${syncClaudeHistory ? 'active' : ''}`} onClick={() => setSyncClaudeHistory(!syncClaudeHistory)}></div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>快捷键唤起小窗</strong>
                    <span>在桌面任意位置唤起 {brandName}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="hotkey-capsule">⌥ ␣</span>
                    <div className={`switch ${shortcutActive ? 'active' : ''}`} onClick={() => setShortcutActive(!shortcutActive)}></div>
                  </div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>自动化安全确认</strong>
                    <span>涉及本地文件和生成服务调用时保留人工确认边界</span>
                  </div>
                  <div className={`switch ${commandWhitelist ? 'active' : ''}`} onClick={() => setCommandWhitelist(!commandWhitelist)}></div>
                </div>

                <div className="settings-row-item file-association-setting">
                  <div className="item-info">
                    <strong>.skill 默认打开方式</strong>
                    <span>
                      {skillAssociationMessage
                        ?? skillAssociation?.message
                        ?? `检查 .skill 是否默认由${brandName}打开。`}
                    </span>
                  </div>
                  <div className="settings-inline-actions">
                    <button className="ghost small" disabled={skillAssociationBusy} onClick={() => void refreshSkillAssociation()}>
                      刷新
                    </button>
                    <button
                      className="primary small"
                      disabled={skillAssociationBusy || !skillAssociation?.canSetDefault || skillAssociation?.isDefault}
                      onClick={() => void setSkillAssociationDefault()}
                    >
                      {skillAssociation?.isDefault ? '已是默认' : '设为默认'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : settingsTab === 'theme' ? (
            <>
              <div className="panel-title"><h3>主题外观</h3></div>
              <div className="theme-section">
                <label className="field-label">外观模式</label>
                <div className="chip-row">
                  <button className={`chip-button ${themeMode === 'light' ? 'active' : ''}`} onClick={() => setThemeMode('light')}>浅色</button>
                  <button className={`chip-button ${themeMode === 'dark' ? 'active' : ''}`} onClick={() => setThemeMode('dark')}>深色</button>
                  <button className={`chip-button ${themeMode === 'system' ? 'active' : ''}`} onClick={() => setThemeMode('system')}>跟随系统</button>
                </div>
              </div>
              <div className="theme-section">
                <label className="field-label">颜色主题</label>
                <div className="color-grid">
                  <button
                    className="color-card"
                    onClick={() => {
                      const randomTheme = COLOR_THEME_OPTIONS[Math.floor(Math.random() * COLOR_THEME_OPTIONS.length)]?.value ?? 'emerald';
                      setColorTheme(randomTheme);
                    }}
                  >
                    <span className="color-swatch" style={{ background: 'linear-gradient(135deg, #395745 50%, #F3F7F4 50%)' }}></span>
                    <div><strong>随机</strong><p>每次点击随机生成配色</p></div>
                  </button>
                  {COLOR_THEME_OPTIONS.map((option) => (
                    <button key={option.value} className={`color-card ${colorTheme === option.value ? 'active' : ''}`} onClick={() => setColorTheme(option.value)}>
                      <span className="color-swatch" style={{ background: option.color }}></span>
                      <div><strong>{option.label}</strong><p>{option.description}</p></div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : settingsTab === 'model' ? (
            <div className="model-settings-layout model-settings-simple">
              <aside className="model-sidebar">
                <div className="model-sidebar-header">
                  <h2>模型</h2>
                  <p>只配置真实可调用的文字、图片、视频生成服务；Key 保存在主进程，前端只显示配置状态。</p>
                </div>
                <div className="model-list-header">
                  <div>
                    <strong>当前连接</strong>
                    <span>{modelConfig?.updatedAt ? `更新于 ${new Date(modelConfig.updatedAt).toLocaleString()}` : '尚未保存本地配置'}</span>
                  </div>
                </div>
                <div className="model-list">
                  <div className="model-list-item active">
                    <span className="icon" style={{ color: '#395745' }}>●</span>
                    <div className="item-text">
                      <strong>生成服务连接 <em className="tag-green">真实调用</em></strong>
                      <span>{modelConfig?.textModel ?? modelDraft.textModel}</span>
                    </div>
                  </div>
                </div>
              </aside>

              <main className="model-content">
                <div className="model-config-shell">
                  <div className="model-config-hero">
                    <div>
                      <p className="eyebrow">生成服务设置</p>
                      <h3>生成服务连接配置</h3>
                      <p>先保证文字和图片可用；视频未配置时会保持待配置队列，不伪造成果。</p>
                    </div>
                    <button className="primary" onClick={onSaveModelConfig}>保存配置</button>
                  </div>

                  <div className="model-connection-summary">
                    <span className={textKeyTone}>文字 Key：{keyStatusLabel(modelConfig?.textApiKeyStatus, modelConfig?.hasTextApiKey)}</span>
                    <span className={imageKeyTone}>图片 Key：{keyStatusLabel(modelConfig?.imageApiKeyStatus, modelConfig?.hasImageApiKey)}</span>
                    <span className={videoKeyTone}>视频 Key：{keyStatusLabel(modelConfig?.videoApiKeyStatus, modelConfig?.hasVideoApiKey, true)}</span>
                  </div>

                  {modelReauthorizationSummary ? (
                    <div className="model-auth-warning">
                      <strong>{modelReauthorizationSummary}</strong>
                      <p>当前系统无法读取已保存的加密密钥。请在下面对应输入框重新填写并保存；如果不再使用该服务，直接保存会清理不可读密钥。</p>
                    </div>
                  ) : null}

                  <section className="model-config-section">
                    <header>
                      <div>
                        <strong>文字生成</strong>
                        <p>用于提示词包、场景库、文章和脚本。</p>
                      </div>
                    </header>
                    <div className="model-field-grid">
                      <label>
                        <span>协议</span>
                        <select value={modelDraft.textProtocol} onChange={(event) => setModelDraft((current) => ({ ...current, textProtocol: event.target.value as ModelDraft['textProtocol'] }))}>
                          <option value="claude-sdk">Claude SDK（Anthropic 官方）</option>
                          <option value="anthropic-messages">Anthropic Messages 兼容</option>
                          <option value="openai-chat">OpenAI Chat Completions</option>
                          <option value="gemini-generate-content">Gemini GenerateContent</option>
                        </select>
                      </label>
                      <label>
                        <span>模型</span>
                        <input value={modelDraft.textModel} onChange={(event) => setModelDraft((current) => ({ ...current, textModel: event.target.value }))} />
                      </label>
                      <label className="wide">
                        <span>端点</span>
                        <input value={modelDraft.apiEndpoint} onChange={(event) => setModelDraft((current) => ({ ...current, apiEndpoint: event.target.value }))} placeholder="https://api.anthropic.com 或兼容网关" />
                      </label>
                      <label className="wide">
                        <span>API Key</span>
                        <input type="password" value={modelDraft.apiKey} onChange={(event) => setModelDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={modelConfig?.textApiKeyStatus === 'requires-reauthorization' ? '当前文字 Key 需重新授权，请重新填写' : modelConfig?.hasTextApiKey ? '留空保留现有文字 Key；更换服务商时请重新填写' : '输入当前文字协议对应的 API Key'} />
                      </label>
                    </div>
                  </section>

                  <section className="model-config-section">
                    <header>
                      <div>
                        <strong>图片生成</strong>
                        <p>用于图片技能、素材图和电商图生成。</p>
                      </div>
                    </header>
                    <div className="model-field-grid">
                      <label>
                        <span>协议</span>
                        <select value={modelDraft.imageProtocol} onChange={(event) => setModelDraft((current) => ({ ...current, imageProtocol: event.target.value as ModelDraft['imageProtocol'] }))}>
                          <option value="openai-responses">OpenAI Responses image_generation</option>
                          <option value="openai-chat-data-uri">OpenAI Chat data URI</option>
                          <option value="gemini-generate-content">Gemini GenerateContent</option>
                        </select>
                      </label>
                      <label>
                        <span>图片生成模型</span>
                        <input value={modelDraft.imageModels} onChange={(event) => setModelDraft((current) => ({ ...current, imageModels: event.target.value }))} placeholder="多个模型用英文逗号分隔" />
                      </label>
                      <label className="wide">
                        <span>端点</span>
                        <input value={modelDraft.imageApiEndpoint} onChange={(event) => setModelDraft((current) => ({ ...current, imageApiEndpoint: event.target.value }))} placeholder="https://api.openai.com/v1 或兼容网关" />
                      </label>
                      <label className="wide">
                        <span>API Key</span>
                        <input type="password" value={modelDraft.imageApiKey} onChange={(event) => setModelDraft((current) => ({ ...current, imageApiKey: event.target.value }))} placeholder={modelConfig?.imageApiKeyStatus === 'requires-reauthorization' ? '当前图片 Key 需重新授权，请重新填写' : modelConfig?.hasImageApiKey ? '留空保留现有图片 Key；更换服务商时请重新填写' : '输入图片生成 API Key'} />
                      </label>
                      <label className="wide subdued-field">
                        <span>图片提示词编排模型（可选）</span>
                        <input value={modelDraft.imageOuterModel} onChange={(event) => setModelDraft((current) => ({ ...current, imageOuterModel: event.target.value }))} placeholder="默认跟随文字模型" />
                      </label>
                    </div>
                  </section>

                  <section className="model-config-section optional">
                    <header>
                      <div>
                        <strong>视频生成（可选）</strong>
                        <p>没有真实视频生成服务时，只保存待配置请求。</p>
                      </div>
                    </header>
                    <div className="model-field-grid">
                      <label>
                        <span>视频模型</span>
                        <input value={modelDraft.videoModel} onChange={(event) => setModelDraft((current) => ({ ...current, videoModel: event.target.value }))} />
                      </label>
                      <label>
                        <span>视频 API Key</span>
                        <input type="password" value={modelDraft.videoApiKey} onChange={(event) => setModelDraft((current) => ({ ...current, videoApiKey: event.target.value }))} placeholder={modelConfig?.videoApiKeyStatus === 'requires-reauthorization' ? '当前视频 Key 需重新授权，请重新填写' : modelConfig?.hasVideoApiKey ? '留空保留现有视频 Key' : '未配置时视频保持待配置队列'} />
                      </label>
                      <label className="wide">
                        <span>视频端点</span>
                        <input value={modelDraft.videoApiEndpoint} onChange={(event) => setModelDraft((current) => ({ ...current, videoApiEndpoint: event.target.value }))} placeholder="真实视频生成服务接口；拆解发送 analyze" />
                      </label>
                    </div>
                  </section>
                </div>
              </main>
            </div>
          ) : settingsTab === 'account' ? (
            <div className="account-settings">
              <div className="panel-title" style={{ marginBottom: '24px' }}>
                <h3>账号（可选）</h3>
              </div>

              {isAccountAuthenticated ? (
                <>
                  <div className="account-section">
                    <span className="section-label">头像</span>
                    <div className="avatar-row">
                      <div className="avatar-circle">{accountInitial}</div>
                      <span className="change-avatar-text">{brandName} 账号已登录</span>
                    </div>
                  </div>

                  <div className="account-section">
                    <span className="section-label">昵称</span>
                    <div className="nickname-row">
                      <span className="nickname-value">{accountName}</span>
                    </div>
                  </div>

                  <div className="account-section">
                    <span className="section-label">邮箱</span>
                    <div className="email-row">
                      <span className="email-value">{accountEmail}</span>
                    </div>
                  </div>

                  <div className="account-section">
                    <span className="section-label">权益</span>
                    <div className="email-row">
                      <span className="email-value">{subscriptionText}</span>
                    </div>
                  </div>

                  <div className="account-actions">
                    <button className="logout-btn" onClick={onLogoutAuth}>
                      <span className="logout-icon">↪</span> 退出登录
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="account-section">
                    <span className="section-label">当前状态</span>
                    <div className="email-row">
                      <span className="email-value">未登录；本地内容工厂可继续使用。</span>
                    </div>
                  </div>
                  <BuguAuthForm
                    compact
                    authState={authState}
                    title={`连接${brandName}账号`}
                    description="使用邮箱 + 密码同步企业权益、下载和账号状态；不登录不会影响本地工作区。"
                    onPasswordLogin={onPasswordLogin}
                  />
                </>
              )}
            </div>
          ) : settingsTab === 'about' ? (
            <div className="about-settings">
              <div className="panel-title" style={{ marginBottom: '24px' }}>
                <h3>关于</h3>
              </div>

              <div className="about-brand-section">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo" className="about-logo" />
                ) : (
                  <span className="about-logo brand-logo-fallback">{brandInitial}</span>
                )}
                <h4 className="about-app-name">{brandName}</h4>
                <span className="about-version">当前版本 {formatVersion(updateState.currentVersion)} (Build 2026.05.19)</span>
                <p className="about-copyright">© 2026 {brandName}. All rights reserved.</p>
              </div>

              <div className={`update-status-card ${updateState.status === 'update-available' ? 'has-update' : ''}`}>
                <div className="update-status-main">
                  <span className="update-dot"></span>
                  <div>
                    <strong>{updateStatusText(updateState)}</strong>
                    <p>
                      {updateState.status === 'update-available'
                        ? `当前 ${formatVersion(updateState.currentVersion)}，可更新到 ${formatVersion(updateState.latestVersion)}。`
                        : `上次检查：${formatDateTime(updateState.checkedAt || updateState.lastAutoCheckAt)}`}
                    </p>
                  </div>
                </div>
                <div className="update-actions">
                  <button className="ghost small" onClick={onCheckForUpdates} disabled={updateState.status === 'checking'}>
                    {updateState.status === 'checking' ? '检查中...' : '检查更新'}
                  </button>
                  {updateState.hasUpdate ? (
                    <button className="primary small" onClick={onOpenUpdateDownload}>
                      {updateState.asset ? '下载当前设备版本' : '打开发布页'}
                    </button>
                  ) : null}
                  <button className="ghost small" onClick={onOpenUpdateReleaseNotes}>查看更新日志</button>
                  <button className="ghost small" onClick={onOpenLogsDirectory}>打开日志目录</button>
                </div>
              </div>

              <div className="about-links-section">
                <span className="about-link-text">服务条款待配置</span>
                <span className="about-link-text">隐私政策待配置</span>
                <span className="about-link-text">官方网站待配置</span>
              </div>
            </div>
          ) : (
            <>
              <div className="panel-title"><h3>{settingsTab}</h3></div>
              <div className="empty-state">该设置项已预留，后续版本会接入真实配置。</div>
            </>
          )}
        </main>
      </div>
      <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
        {settingsTab === 'general' && (
          <button className="restore-default-btn" onClick={() => {
            setMenubarShow(true);
            setAutoStart(true);
            setNotificationsEnabled(true);
            setReduceAnimation(false);
            setSyncClaudeHistory(false);
            setShortcutActive(true);
            setCommandWhitelist(false);
          }}>恢复默认</button>
        )}
        <button className="primary" onClick={() => onClose()}>完成</button>
      </div>
    </div>
  </div>
  );
}
