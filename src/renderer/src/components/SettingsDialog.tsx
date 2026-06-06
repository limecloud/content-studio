import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { COLOR_THEME_OPTIONS } from '../app/constants';
import type {
  AutoUpdateState,
  BuguAuthState,
  ModelConfigView,
  ModelCatalogView,
  ModelSecretStatus,
  SkillFileAssociationResult,
  SkillFileAssociationState,
} from '../../../shared/types';
import type { ColorTheme, ModelDraft, SettingsTab } from '../app/types';
import { BuguAuthForm, type BuguAuthActions } from './BuguAuthGate';

const MODEL_CATALOG_COLLAPSED_LIMIT = 8;

type ModelCatalogPresetKind = 'text' | 'image' | 'video';

type ActiveModelPane = ModelCatalogPresetKind;

interface SettingsDialogProps extends BuguAuthActions {
  settingsTab: SettingsTab;
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: Dispatch<SetStateAction<'light' | 'dark' | 'system'>>;
  colorTheme: ColorTheme;
  setColorTheme: Dispatch<SetStateAction<ColorTheme>>;
  modelConfig: ModelConfigView | null;
  modelCatalog: ModelCatalogView | null;
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
  syncLocalAssetHistory: boolean;
  setSyncLocalAssetHistory: Dispatch<SetStateAction<boolean>>;
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
  onLoadModelCatalog: () => Promise<void>;
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

function parseModelNames(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

function formatModelNames(models: string[]): string {
  return models.join(', ');
}

export function SettingsDialog({
  settingsTab,
  setSettingsTab,
  themeMode,
  setThemeMode,
  colorTheme,
  setColorTheme,
  modelConfig,
  modelCatalog,
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
  syncLocalAssetHistory,
  setSyncLocalAssetHistory,
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
  onLoadModelCatalog,
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
  const [textModelDraft, setTextModelDraft] = useState('');
  const [imageModelDraft, setImageModelDraft] = useState('');
  const [videoModelDraft, setVideoModelDraft] = useState('');
  const [activeModelPane, setActiveModelPane] = useState<ActiveModelPane>('text');
  const [expandedCatalogs, setExpandedCatalogs] = useState<Record<ModelCatalogPresetKind, boolean>>({
    text: false,
    image: false,
    video: false,
  });
  const textModelNames = parseModelNames(modelDraft.textModels);
  const imageModelNames = parseModelNames(modelDraft.imageModels);
  const videoModelNames = parseModelNames(modelDraft.videoModels);
  const textCatalogModelNames = modelCatalog?.textModels ?? [];
  const imageCatalogModelNames = modelCatalog?.imageModels ?? [];
  const videoCatalogModelNames = modelCatalog?.videoModels ?? [];
  const visibleTextCatalogModelNames = expandedCatalogs.text
    ? textCatalogModelNames
    : textCatalogModelNames.slice(0, MODEL_CATALOG_COLLAPSED_LIMIT);
  const visibleImageCatalogModelNames = expandedCatalogs.image
    ? imageCatalogModelNames
    : imageCatalogModelNames.slice(0, MODEL_CATALOG_COLLAPSED_LIMIT);
  const visibleVideoCatalogModelNames = expandedCatalogs.video
    ? videoCatalogModelNames
    : videoCatalogModelNames.slice(0, MODEL_CATALOG_COLLAPSED_LIMIT);
  const activeModelPaneTitle = activeModelPane === 'text'
    ? '文字生成'
    : activeModelPane === 'image'
      ? '图片生成'
      : '视频理解 / 生成';
  const activeModelPaneDescription = activeModelPane === 'text'
    ? '配置文案、提示词、脚本和 Agent 协作使用的文字模型。'
    : activeModelPane === 'image'
      ? '配置图片生成页可选择的图片模型池。'
      : '配置视频理解和视频生成使用的模型；未配置时保持待配置队列。';

  function toggleCatalogExpanded(kind: ModelCatalogPresetKind): void {
    setExpandedCatalogs((current) => ({ ...current, [kind]: !current[kind] }));
  }

  function updateDraftModels(key: 'textModels' | 'imageModels' | 'videoModels', models: string[]): void {
    setModelDraft((current) => ({
      ...current,
      [key]: formatModelNames(Array.from(new Set(models.map((item) => item.trim()).filter(Boolean)))),
    }));
  }

  function selectTextModel(model: string): void {
    const nextModel = model.trim();
    if (!nextModel) return;
    setModelDraft((current) => ({
      ...current,
      textModel: nextModel,
      textModels: formatModelNames([nextModel, ...parseModelNames(current.textModels).filter((item) => item !== nextModel)]),
    }));
  }

  function selectImageModel(model: string): void {
    const nextModel = model.trim();
    if (!nextModel) return;
    setModelDraft((current) => ({
      ...current,
      imageModels: formatModelNames([nextModel, ...parseModelNames(current.imageModels).filter((item) => item !== nextModel)]),
    }));
  }

  function selectVideoModel(model: string): void {
    const nextModel = model.trim();
    if (!nextModel) return;
    setModelDraft((current) => ({
      ...current,
      videoModel: nextModel,
      videoModels: formatModelNames([nextModel, ...parseModelNames(current.videoModels).filter((item) => item !== nextModel)]),
    }));
  }

  function updateTextModels(models: string[]): void {
    updateDraftModels('textModels', models);
  }

  function updateImageModels(models: string[]): void {
    updateDraftModels('imageModels', models);
  }

  function updateVideoModels(models: string[]): void {
    updateDraftModels('videoModels', models);
  }

  function addTextModel(): void {
    const nextModels = parseModelNames(textModelDraft);
    if (nextModels.length === 0) return;
    setModelDraft((current) => ({
      ...current,
      textModel: nextModels[0],
      textModels: formatModelNames([...nextModels, ...parseModelNames(current.textModels).filter((item) => !nextModels.includes(item))]),
    }));
    setTextModelDraft('');
  }

  function addImageModel(): void {
    const nextModels = parseModelNames(imageModelDraft);
    if (nextModels.length === 0) return;
    setModelDraft((current) => ({
      ...current,
      imageModels: formatModelNames([...nextModels, ...parseModelNames(current.imageModels).filter((item) => !nextModels.includes(item))]),
    }));
    setImageModelDraft('');
  }

  function addVideoModel(): void {
    const nextModels = parseModelNames(videoModelDraft);
    if (nextModels.length === 0) return;
    setModelDraft((current) => ({
      ...current,
      videoModel: nextModels[0],
      videoModels: formatModelNames([...nextModels, ...parseModelNames(current.videoModels).filter((item) => !nextModels.includes(item))]),
    }));
    setVideoModelDraft('');
  }

  function removeTextModel(model: string): void {
    const nextModels = textModelNames.filter((item) => item !== model);
    setModelDraft((current) => ({
      ...current,
      textModel: current.textModel === model ? nextModels[0] ?? '' : current.textModel,
      textModels: formatModelNames(nextModels),
    }));
  }

  function removeImageModel(model: string): void {
    updateImageModels(imageModelNames.filter((item) => item !== model));
  }

  function removeVideoModel(model: string): void {
    const nextModels = videoModelNames.filter((item) => item !== model);
    setModelDraft((current) => ({
      ...current,
      videoModel: current.videoModel === model ? nextModels[0] ?? '' : current.videoModel,
      videoModels: formatModelNames(nextModels),
    }));
  }

  function promoteTextModel(model: string): void {
    updateTextModels([model, ...textModelNames.filter((item) => item !== model)]);
    setModelDraft((current) => ({ ...current, textModel: model }));
  }

  function promoteImageModel(model: string): void {
    updateImageModels([model, ...imageModelNames.filter((item) => item !== model)]);
  }

  function promoteVideoModel(model: string): void {
    updateVideoModels([model, ...videoModelNames.filter((item) => item !== model)]);
    setModelDraft((current) => ({ ...current, videoModel: model }));
  }

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

  useEffect(() => {
    if (settingsTab !== 'model') return;
    void onLoadModelCatalog();
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
                  <div className={`switch ${syncLocalAssetHistory ? 'active' : ''}`} onClick={() => setSyncLocalAssetHistory(!syncLocalAssetHistory)}></div>
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
                  <button
                    type="button"
                    className={`model-list-item ${activeModelPane === 'text' ? 'active' : ''}`}
                    onClick={() => setActiveModelPane('text')}
                  >
                    <span className="icon" style={{ color: '#395745' }}>●</span>
                    <div className="item-text">
                      <strong>文字生成 <em className="tag-green">主链</em></strong>
                      <span>{textModelNames[0] ?? modelConfig?.textModel ?? modelDraft.textModel}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`model-list-item ${activeModelPane === 'image' ? 'active' : ''}`}
                    onClick={() => setActiveModelPane('image')}
                  >
                    <span className="icon" style={{ color: '#3B82F6' }}>●</span>
                    <div className="item-text">
                      <strong>图片生成 <em className="tag-orange">{imageModelNames.length || 1} 个模型</em></strong>
                      <span>{imageModelNames[0] ?? modelConfig?.imageModels[0] ?? '待添加图片模型'}</span>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`model-list-item ${activeModelPane === 'video' ? 'active' : ''}`}
                    onClick={() => setActiveModelPane('video')}
                  >
                    <span className="icon" style={{ color: '#9CA3AF' }}>●</span>
                    <div className="item-text">
                      <strong>视频生成 <em className="tag-muted">可选</em></strong>
                      <span>{videoModelNames[0] ?? modelDraft.videoModel ?? '待配置'}</span>
                    </div>
                  </button>
                </div>
              </aside>

              <main className="model-content">
                <div className="model-config-shell">
                  <div className="model-config-hero">
                    <div>
                      <p className="eyebrow">生成服务设置</p>
                      <h3>{activeModelPaneTitle}</h3>
                      <p>{activeModelPaneDescription}</p>
                    </div>
                    <button className="primary" onClick={onSaveModelConfig}>保存配置</button>
                  </div>

                  <div className="model-connection-summary">
                    {activeModelPane === 'text' ? (
                      <span className={textKeyTone}>文字 Key：{keyStatusLabel(modelConfig?.textApiKeyStatus, modelConfig?.hasTextApiKey)}</span>
                    ) : null}
                    {activeModelPane === 'image' ? (
                      <span className={imageKeyTone}>图片 Key：{keyStatusLabel(modelConfig?.imageApiKeyStatus, modelConfig?.hasImageApiKey)}</span>
                    ) : null}
                    {activeModelPane === 'video' ? (
                      <span className={videoKeyTone}>视频 Key：{keyStatusLabel(modelConfig?.videoApiKeyStatus, modelConfig?.hasVideoApiKey, true)}</span>
                    ) : null}
                  </div>

                  {modelReauthorizationSummary ? (
                    <div className="model-auth-warning">
                      <strong>{modelReauthorizationSummary}</strong>
                      <p>当前系统无法读取已保存的加密密钥。请在下面对应输入框重新填写并保存；如果不再使用该服务，直接保存会清理不可读密钥。</p>
                    </div>
                  ) : null}

                  {activeModelPane === 'text' ? (
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
                          <option value="anthropic-messages">Anthropic Messages 兼容</option>
                          <option value="openai-chat">OpenAI Chat Completions</option>
                          <option value="gemini-generate-content">Gemini GenerateContent</option>
                        </select>
                      </label>
                      <label>
                        <span>当前文字模型</span>
                        <select value={modelDraft.textModel} onChange={(event) => selectTextModel(event.target.value)}>
                          {Array.from(new Set([modelDraft.textModel, ...textModelNames, ...textCatalogModelNames].filter(Boolean))).map((model) => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </select>
                      </label>
                      <div className="wide image-model-priority-box">
                        <div className="image-model-priority-head">
                          <div>
                            <strong>文字模型池</strong>
                            <small>只用于文案、提示词、脚本和 Agent 协作；不会出现在图片生图模型下拉里。</small>
                          </div>
                        </div>
                        <div className="model-preset-row">
                          {visibleTextCatalogModelNames.map((model) => (
                            <button
                              key={model}
                              type="button"
                              className={textModelNames.includes(model) ? 'active' : ''}
                              onClick={() => selectTextModel(model)}
                            >
                              {model}
                            </button>
                          ))}
                          {textCatalogModelNames.length > MODEL_CATALOG_COLLAPSED_LIMIT ? (
                            <button type="button" className="model-preset-toggle" onClick={() => toggleCatalogExpanded('text')}>
                              {expandedCatalogs.text ? '收起' : `显示全部 ${textCatalogModelNames.length} 个`}
                            </button>
                          ) : null}
                        </div>
                        <div className="image-model-priority-list">
                          {textModelNames.length ? (
                            textModelNames.map((model, index) => (
                              <div key={model} className="image-model-priority-item">
                                <span className="drag-handle" aria-hidden="true">⋮⋮</span>
                                <strong>{model}</strong>
                                <em className={index === 0 ? 'tag-main' : 'tag-backup'}>{index === 0 ? '默认' : '备选'}</em>
                                <div className="image-model-priority-actions">
                                  {index > 0 ? <button type="button" className="ghost small" onClick={() => promoteTextModel(model)}>设为默认</button> : null}
                                  <button type="button" className="ghost small" onClick={() => removeTextModel(model)}>移除</button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="image-model-empty">尚未添加文字模型；保存时会回退到默认模型。</div>
                          )}
                        </div>
                        <div className="image-model-add-row">
                          <input
                            value={textModelDraft}
                            onChange={(event) => setTextModelDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              addTextModel();
                            }}
                            placeholder="输入文字模型 ID，例如 gpt-4o-mini"
                          />
                          <button type="button" className="ghost small" onClick={addTextModel} disabled={!textModelDraft.trim()}>添加模型</button>
                        </div>
                      </div>
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
                  ) : null}

                  {activeModelPane === 'image' ? (
                  <section className="model-config-section">
                    <header>
                      <div>
                        <strong>图片生成</strong>
                        <p>独立维护图片模型池，图片生成页会从这里选择本次使用的模型。</p>
                      </div>
                      <span className="model-section-count">{imageModelNames.length || 1} 个可选模型</span>
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
                      <label className="subdued-field">
                        <span>图片提示词编排模型（可选）</span>
                        <input value={modelDraft.imageOuterModel} onChange={(event) => setModelDraft((current) => ({ ...current, imageOuterModel: event.target.value }))} placeholder="默认跟随文字模型" />
                      </label>
                      <label>
                        <span>当前图片模型</span>
                        <select value={imageModelNames[0] ?? ''} onChange={(event) => selectImageModel(event.target.value)}>
                          {Array.from(new Set([imageModelNames[0], ...imageModelNames, ...imageCatalogModelNames].filter(Boolean))).map((model) => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </select>
                      </label>
                      <div className="wide image-model-priority-box">
                        <div className="image-model-priority-head">
                          <div>
                            <strong>图片模型优先级</strong>
                            <small>首位作为默认模型；生成页可按任务切换到其他图片模型。</small>
                          </div>
                        </div>
                        <div className="model-preset-row">
                          {visibleImageCatalogModelNames.map((model) => (
                            <button
                              key={model}
                              type="button"
                              className={imageModelNames.includes(model) ? 'active' : ''}
                              onClick={() => selectImageModel(model)}
                            >
                              {model}
                            </button>
                          ))}
                          {imageCatalogModelNames.length > MODEL_CATALOG_COLLAPSED_LIMIT ? (
                            <button type="button" className="model-preset-toggle" onClick={() => toggleCatalogExpanded('image')}>
                              {expandedCatalogs.image ? '收起' : `显示全部 ${imageCatalogModelNames.length} 个`}
                            </button>
                          ) : null}
                        </div>
                        <div className="image-model-priority-list">
                          {imageModelNames.length ? (
                            imageModelNames.map((model, index) => (
                              <div key={model} className="image-model-priority-item">
                                <span className="drag-handle" aria-hidden="true">⋮⋮</span>
                                <strong>{model}</strong>
                                <em className={index === 0 ? 'tag-main' : 'tag-backup'}>
                                  {index === 0 ? '主模型' : '备选'}
                                </em>
                                <div className="image-model-priority-actions">
                                  {index > 0 ? (
                                    <button type="button" className="ghost small" onClick={() => promoteImageModel(model)}>
                                      设为主模型
                                    </button>
                                  ) : null}
                                  <button type="button" className="ghost small" onClick={() => removeImageModel(model)}>
                                    移除
                                  </button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="image-model-empty">
                              尚未添加图片模型；保存时会回退到默认模型。
                            </div>
                          )}
                        </div>
                        <div className="image-model-add-row">
                          <input
                            value={imageModelDraft}
                            onChange={(event) => setImageModelDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              addImageModel();
                            }}
                            placeholder="输入图片模型 ID，例如 gpt-image-2"
                          />
                          <button type="button" className="ghost small" onClick={addImageModel} disabled={!imageModelDraft.trim()}>
                            添加模型
                          </button>
                        </div>
                      </div>
                      <label className="wide">
                        <span>端点</span>
                        <input value={modelDraft.imageApiEndpoint} onChange={(event) => setModelDraft((current) => ({ ...current, imageApiEndpoint: event.target.value }))} placeholder="https://api.openai.com/v1 或兼容网关" />
                      </label>
                      <label className="wide">
                        <span>API Key</span>
                        <input type="password" value={modelDraft.imageApiKey} onChange={(event) => setModelDraft((current) => ({ ...current, imageApiKey: event.target.value }))} placeholder={modelConfig?.imageApiKeyStatus === 'requires-reauthorization' ? '当前图片 Key 需重新授权，请重新填写' : modelConfig?.hasImageApiKey ? '留空保留现有图片 Key；更换服务商时请重新填写' : '输入图片生成 API Key'} />
                      </label>
                    </div>
                  </section>
                  ) : null}

                  {activeModelPane === 'video' ? (
                  <section className="model-config-section optional">
                    <header>
                      <div>
                        <strong>视频理解 / 生成（可选）</strong>
                        <p>默认走 OpenAI 兼容视频理解网关：视频模型做视觉拆镜，文字模型做结构分类。</p>
                      </div>
                    </header>
                    <div className="model-field-grid">
                      <label>
                        <span>视频拆解模型</span>
                        <select value={modelDraft.videoModel} onChange={(event) => selectVideoModel(event.target.value)}>
                          {Array.from(new Set([modelDraft.videoModel, ...videoModelNames, ...videoCatalogModelNames].filter(Boolean))).map((model) => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>视频 API Key</span>
                        <input type="password" value={modelDraft.videoApiKey} onChange={(event) => setModelDraft((current) => ({ ...current, videoApiKey: event.target.value }))} placeholder={modelConfig?.videoApiKeyStatus === 'requires-reauthorization' ? '当前视频 Key 需重新授权，请重新填写' : modelConfig?.hasVideoApiKey ? '留空保留现有视频 Key' : '未配置时视频保持待配置队列'} />
                      </label>
                      <label className="wide">
                        <span>视频端点</span>
                        <input value={modelDraft.videoApiEndpoint} onChange={(event) => setModelDraft((current) => ({ ...current, videoApiEndpoint: event.target.value }))} placeholder="OpenAI 兼容 Base URL，例如 https://gptproto.com/v1" />
                      </label>
                      <div className="wide image-model-priority-box">
                        <div className="image-model-priority-head">
                          <div>
                            <strong>视频模型池</strong>
                            <small>只用于视频理解 / 视频生成，不会出现在文字或图片模型下拉里。</small>
                          </div>
                        </div>
                        <div className="model-preset-row">
                          {visibleVideoCatalogModelNames.map((model) => (
                            <button
                              key={model}
                              type="button"
                              className={videoModelNames.includes(model) ? 'active' : ''}
                              onClick={() => selectVideoModel(model)}
                            >
                              {model}
                            </button>
                          ))}
                          {videoCatalogModelNames.length > MODEL_CATALOG_COLLAPSED_LIMIT ? (
                            <button type="button" className="model-preset-toggle" onClick={() => toggleCatalogExpanded('video')}>
                              {expandedCatalogs.video ? '收起' : `显示全部 ${videoCatalogModelNames.length} 个`}
                            </button>
                          ) : null}
                        </div>
                        <div className="image-model-priority-list">
                          {videoModelNames.length ? (
                            videoModelNames.map((model, index) => (
                              <div key={model} className="image-model-priority-item">
                                <span className="drag-handle" aria-hidden="true">⋮⋮</span>
                                <strong>{model}</strong>
                                <em className={index === 0 ? 'tag-main' : 'tag-backup'}>{index === 0 ? '默认' : '备选'}</em>
                                <div className="image-model-priority-actions">
                                  {index > 0 ? <button type="button" className="ghost small" onClick={() => promoteVideoModel(model)}>设为默认</button> : null}
                                  <button type="button" className="ghost small" onClick={() => removeVideoModel(model)}>移除</button>
                                </div>
                              </div>
                            ))
                          ) : (
                            <div className="image-model-empty">尚未添加视频模型；保存时会回退到默认模型。</div>
                          )}
                        </div>
                        <div className="image-model-add-row">
                          <input
                            value={videoModelDraft}
                            onChange={(event) => setVideoModelDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key !== 'Enter') return;
                              event.preventDefault();
                              addVideoModel();
                            }}
                            placeholder="输入视频模型 ID，例如 veo-3.1"
                          />
                          <button type="button" className="ghost small" onClick={addVideoModel} disabled={!videoModelDraft.trim()}>添加模型</button>
                        </div>
                      </div>
                    </div>
                  </section>
                  ) : null}
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
            setSyncLocalAssetHistory(false);
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
