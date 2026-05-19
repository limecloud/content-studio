import type { Dispatch, SetStateAction } from 'react';
import logoUrl from '../logo.png';
import { COLOR_THEME_OPTIONS } from '../app/constants';
import type { ModelConfigView } from '../../../shared/types';
import type { ColorTheme, ModelDraft, ModelSettingView, ProviderTab, SettingsTab } from '../app/types';

interface SettingsDialogProps {
  settingsTab: SettingsTab;
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: Dispatch<SetStateAction<'light' | 'dark' | 'system'>>;
  colorTheme: ColorTheme;
  setColorTheme: Dispatch<SetStateAction<ColorTheme>>;
  modelSettingView: ModelSettingView;
  setModelSettingView: Dispatch<SetStateAction<ModelSettingView>>;
  modelConfig: ModelConfigView | null;
  modelDraft: ModelDraft;
  setModelDraft: Dispatch<SetStateAction<ModelDraft>>;
  providerTab: ProviderTab;
  setProviderTab: Dispatch<SetStateAction<ProviderTab>>;
  responsesApiActive: boolean;
  setResponsesApiActive: Dispatch<SetStateAction<boolean>>;
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
  onLoadModelCatalog: () => void;
  onSaveModelConfig: () => void;
  onClose: () => void;
}

export function SettingsDialog({
  settingsTab,
  setSettingsTab,
  themeMode,
  setThemeMode,
  colorTheme,
  setColorTheme,
  modelSettingView,
  setModelSettingView,
  modelConfig,
  modelDraft,
  setModelDraft,
  providerTab,
  setProviderTab,
  responsesApiActive,
  setResponsesApiActive,
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
  onLoadModelCatalog,
  onSaveModelConfig,
  onClose,
}: SettingsDialogProps) {
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
                    <span>在菜单栏中显示 布谷AI</span>
                  </div>
                  <div className={`switch ${menubarShow ? 'active' : ''}`} onClick={() => setMenubarShow(!menubarShow)}></div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>开机自动</strong>
                    <span>登录计算机时自动启动 布谷AI</span>
                  </div>
                  <div className={`switch ${autoStart ? 'active' : ''}`} onClick={() => setAutoStart(!autoStart)}></div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>通知</strong>
                    <span>在 布谷AI 完成响应时接收通知。适用于长线程任务。</span>
                  </div>
                  <div className={`switch ${notificationsEnabled ? 'active' : ''}`} onClick={() => setNotificationsEnabled(!notificationsEnabled)}></div>
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
                    <strong>同步 Claude Code 历史</strong>
                    <span>将本地 Claude Code 终端对话同步到当前工作区</span>
                  </div>
                  <div className={`switch ${syncClaudeHistory ? 'active' : ''}`} onClick={() => setSyncClaudeHistory(!syncClaudeHistory)}></div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>快捷键唤起小窗</strong>
                    <span>在桌面任意位置唤起 布谷AI</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span className="hotkey-capsule">⌥ ␣</span>
                    <div className={`switch ${shortcutActive ? 'active' : ''}`} onClick={() => setShortcutActive(!shortcutActive)}></div>
                  </div>
                </div>

                <div className="settings-row-item">
                  <div className="item-info">
                    <strong>命令白名单</strong>
                    <span>允许自动运行的命令</span>
                  </div>
                  <div className={`switch ${commandWhitelist ? 'active' : ''}`} onClick={() => setCommandWhitelist(!commandWhitelist)}></div>
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
            <div className="model-settings-layout">
              <aside className="model-sidebar">
                <div className="model-sidebar-header">
                  <h2>模型</h2>
                  <p>分开配置文字、图片、视频 Provider。API Key 只保存在 Electron main process，Renderer 只读取是否已配置。</p>
                </div>
                <div className="model-list-header">
                  <div>
                    <strong>当前配置</strong>
                    <span>{modelConfig?.updatedAt ? `更新于 ${new Date(modelConfig.updatedAt).toLocaleString()}` : '尚未保存本地配置'}</span>
                  </div>
                  <button className="add-btn" onClick={onLoadModelCatalog}>↻</button>
                </div>
                <div className="model-list">
                  <div className={`model-list-item ${modelSettingView === 'edit_claude' ? 'active' : ''}`} onClick={() => setModelSettingView('edit_claude')}>
                    <span className="drag-handle">⋮⋮</span>
                    <span className="icon" style={{ color: '#E05A47' }}>✹</span>
                    <div className="item-text">
                      <strong>Provider 连接 <em className="tag-green">真实调用</em></strong>
                      <span>{modelConfig?.textModel ?? modelDraft.textModel}</span>
                    </div>
                  </div>
                  <button className="add-model-btn" onClick={() => setModelSettingView('provider_list')}>查看推荐供应商</button>
                </div>
              </aside>
              <main className="model-content">
                {modelSettingView === 'provider_list' ? (
                  <div className="provider-list-view">
                    <div className="provider-tabs">
                      <button className={providerTab === 'recommended' ? 'active' : ''} onClick={() => setProviderTab('recommended')}>推荐服务</button>
                      <button className={providerTab === 'domestic' ? 'active' : ''} onClick={() => setProviderTab('domestic')}>国内服务</button>
                      <button className={providerTab === 'aggregate' ? 'active' : ''} onClick={() => setProviderTab('aggregate')}>聚合平台</button>
                      <button className={providerTab === 'overseas' ? 'active' : ''} onClick={() => setProviderTab('overseas')}>海外平台</button>
                      <button className={providerTab === 'local' ? 'active' : ''} onClick={() => setProviderTab('local')}>本地模型</button>
                    </div>
                    <div className="provider-grid">
                      <button className="provider-card" onClick={() => setModelSettingView('edit_claude')}>
                        <div className="title"><span className="icon">✹</span> Claude / Anthropic <em className="tag-orange">推荐</em></div>
                        <p>适合提示词包、场景库、文章和视频脚本生成的主文本模型。</p>
                      </button>
                      <button className="provider-card" onClick={() => setModelSettingView('edit_claude')}>
                        <div className="title"><span className="icon grey">⚙</span> OpenAI Responses 图片</div>
                        <p>填写支持 Responses + image_generation 的图片端点和图片 API Key。</p>
                      </button>
                      <button className="provider-card" onClick={onLoadModelCatalog}>
                        <div className="title"><span className="icon blue">↻</span> 获取模型列表</div>
                        <p>读取当前配置和离线种子；真实远端列表失败时不会伪装已连通。</p>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="model-edit-card custom-provider model-config-form">
                    <div className="card-header">
                      <div className="title"><span className="icon grey">⚙</span> Provider 连接配置</div>
                      <button className="ghost small" onClick={onLoadModelCatalog}>获取模型</button>
                    </div>

                    <div className="ready-banner">
                      <span>{modelConfig?.hasTextApiKey ? '文字模型 Key 已保存，留空不会覆盖' : '文字模型尚未保存 API Key'}</span>
                    </div>

                    <div className="model-status-grid">
                      <span>文字：{modelConfig?.hasTextApiKey ? '已配置' : '未配置'} · {modelConfig?.textModel ?? '未加载'}</span>
                      <span>图片：{modelConfig?.hasImageApiKey ? '已配置' : '未配置'} · {modelConfig?.imageModels.join(', ') ?? '未加载'}</span>
                      <span>视频：{modelConfig?.hasVideoApiKey ? '已配置' : '未配置'} · {modelConfig?.videoModel ?? '未加载'}</span>
                    </div>

                    <label className="field-label">文字端点（Claude Agent SDK）</label>
                    <input value={modelDraft.apiEndpoint} onChange={(event) => setModelDraft((current) => ({ ...current, apiEndpoint: event.target.value }))} placeholder="https://api.anthropic.com" />

                    <label className="field-label">文字 API Key</label>
                    <input type="password" value={modelDraft.apiKey} onChange={(event) => setModelDraft((current) => ({ ...current, apiKey: event.target.value }))} placeholder={modelConfig?.hasTextApiKey ? '留空保留现有 Key' : '输入 Anthropic API Key'} />

                    <label className="field-label">文字模型</label>
                    <input value={modelDraft.textModel} onChange={(event) => setModelDraft((current) => ({ ...current, textModel: event.target.value }))} />

                    <label className="field-label">图片端点（Responses API）</label>
                    <input value={modelDraft.imageApiEndpoint} onChange={(event) => setModelDraft((current) => ({ ...current, imageApiEndpoint: event.target.value }))} placeholder="https://api.openai.com/v1" />

                    <label className="field-label">图片 API Key</label>
                    <input type="password" value={modelDraft.imageApiKey} onChange={(event) => setModelDraft((current) => ({ ...current, imageApiKey: event.target.value }))} placeholder={modelConfig?.hasImageApiKey ? '留空保留现有图片 Key' : '输入图片 Provider API Key'} />

                    <label className="field-label">图片编排模型</label>
                    <input value={modelDraft.imageOuterModel} onChange={(event) => setModelDraft((current) => ({ ...current, imageOuterModel: event.target.value }))} placeholder="gpt-5.5" />

                    <label className="field-label">图片生成模型候选</label>
                    <input value={modelDraft.imageModels} onChange={(event) => setModelDraft((current) => ({ ...current, imageModels: event.target.value }))} placeholder="多个模型用英文逗号分隔" />

                    <label className="field-label">视频端点（Generic HTTP）</label>
                    <input value={modelDraft.videoApiEndpoint} onChange={(event) => setModelDraft((current) => ({ ...current, videoApiEndpoint: event.target.value }))} placeholder="填写真实视频 Provider 接口；拆解发送 analyze，未配置则只保存队列" />

                    <label className="field-label">视频 API Key</label>
                    <input type="password" value={modelDraft.videoApiKey} onChange={(event) => setModelDraft((current) => ({ ...current, videoApiKey: event.target.value }))} placeholder={modelConfig?.hasVideoApiKey ? '留空保留现有视频 Key' : '未配置时视频保持 blocked 队列'} />

                    <label className="field-label">视频模型</label>
                    <input value={modelDraft.videoModel} onChange={(event) => setModelDraft((current) => ({ ...current, videoModel: event.target.value }))} />

                    <div className="model-field-actions">
                      <button className="ghost" onClick={onLoadModelCatalog}>获取模型</button>
                      <button className="primary" onClick={onSaveModelConfig}>保存配置并回填右侧参数</button>
                    </div>
                  </div>
                )}
              </main>
            </div>
          ) : settingsTab === 'account' ? (
            <div className="account-settings">
              <div className="panel-title" style={{ marginBottom: '24px' }}>
                <h3>账号</h3>
              </div>

              <div className="account-section">
                <span className="section-label">头像</span>
                <div className="avatar-row">
                  <div className="avatar-circle">C</div>
                  <span className="change-avatar-text">点击更换头像</span>
                </div>
              </div>

              <div className="account-section">
                <span className="section-label">昵称</span>
                <div className="nickname-row">
                  <span className="nickname-value">未设置</span>
                  <button className="modify-btn">修改</button>
                </div>
              </div>

              <div className="account-section">
                <span className="section-label">邮箱</span>
                <div className="email-row">
                  <span className="email-value">coso@gmail.com</span>
                </div>
              </div>

              <div className="account-actions">
                <button className="logout-btn">
                  <span className="logout-icon">↪</span> 退出登录
                </button>
              </div>
            </div>
          ) : settingsTab === 'about' ? (
            <div className="about-settings">
              <div className="panel-title" style={{ marginBottom: '24px' }}>
                <h3>关于</h3>
              </div>

              <div className="about-brand-section">
                <img src={logoUrl} alt="Logo" className="about-logo" />
                <h4 className="about-app-name">布谷AI</h4>
                <span className="about-version">版本 0.3.0 (Build 2026.05.19)</span>
                <p className="about-copyright">© 2026 Limecloud. All rights reserved.</p>
              </div>

              <div className="about-links-section">
                <button className="about-link-btn" onClick={() => alert('当前已是最新版本')}>检查更新</button>
                <button className="about-link-btn" onClick={() => window.open('https://limecloud.ai/terms', '_blank')}>服务条款</button>
                <button className="about-link-btn" onClick={() => window.open('https://limecloud.ai/privacy', '_blank')}>隐私政策</button>
                <button className="about-link-btn" onClick={() => window.open('https://limecloud.ai', '_blank')}>官方网站</button>
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
