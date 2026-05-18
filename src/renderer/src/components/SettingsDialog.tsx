import type { Dispatch, SetStateAction } from 'react';
import logoUrl from '../logo.png';
import { COLOR_THEME_OPTIONS } from '../app/constants';
import type { ColorTheme, ModelSettingView, ProviderTab, SettingsTab } from '../app/types';

interface SettingsDialogProps {
  settingsTab: SettingsTab;
  setSettingsTab: Dispatch<SetStateAction<SettingsTab>>;
  themeMode: 'light' | 'dark' | 'system';
  setThemeMode: Dispatch<SetStateAction<'light' | 'dark' | 'system'>>;
  colorTheme: ColorTheme;
  setColorTheme: Dispatch<SetStateAction<ColorTheme>>;
  modelSettingView: ModelSettingView;
  setModelSettingView: Dispatch<SetStateAction<ModelSettingView>>;
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
                  <p>如果配置遇到问题，可以查阅<a href="#">配置指南</a>。</p>
                </div>
                <div className="model-list-header">
                  <div>
                    <strong>启用的模型</strong>
                    <span>拖拽排序，首位为默认</span>
                  </div>
                  <button className="add-btn">+</button>
                </div>
                <div className="model-list">
                  <div className={`model-list-item ${modelSettingView === 'edit_claude' ? 'active' : ''}`} onClick={() => setModelSettingView('edit_claude')}>
                    <span className="drag-handle">⋮⋮</span>
                    <span className="icon" style={{ color: '#E05A47' }}>✹</span>
                    <div className="item-text">
                      <strong>默认 (Claude) <em className="tag-green">默认</em></strong>
                      <span>Use the default model (curre...</span>
                    </div>
                  </div>
                  <div className={`model-list-item ${modelSettingView === 'edit_deepseek' ? 'active' : ''}`} onClick={() => setModelSettingView('edit_deepseek')}>
                    <span className="drag-handle">⋮⋮</span>
                    <span className="icon blue">🐳</span>
                    <div className="item-text">
                      <strong>DeepSeek</strong>
                      <span>deepseek-v4-pro</span>
                    </div>
                  </div>
                  <button className="add-model-btn" onClick={() => setModelSettingView('provider_list')}>+ 添加模型</button>
                </div>
              </aside>
              <main className="model-content">
                {modelSettingView === 'edit_claude' ? (
                  <div className="model-edit-card custom-provider">
                    <div className="card-title" style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <span className="icon" style={{ color: '#E05A47' }}>✹</span> 默认 (Claude)
                    </div>

                    <div className="ready-banner">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>已就绪 — 使用 Claude 原生 OAuth 认证，无需配置 API Key</span>
                    </div>

                    <label className="field-label" style={{ fontWeight: 500, fontSize: '13px' }}>模型优先级</label>
                    <div className="priority-list">
                      <div className="priority-item">
                        <span className="drag-handle">⋮⋮</span>
                        <span className="tag tag-main">主模型</span>
                        <span className="model-name">Use the default model (currently Sonnet 4.6)</span>
                      </div>
                      <div className="priority-item">
                        <span className="drag-handle">⋮⋮</span>
                        <span className="tag tag-backup">备份 1</span>
                        <span className="model-name">Haiku 4.5</span>
                      </div>
                      <div className="priority-item">
                        <span className="drag-handle">⋮⋮</span>
                        <span className="tag tag-backup">备份 2</span>
                        <span className="model-name">Sonnet 4.6 for long sessions</span>
                      </div>
                      <div className="priority-item">
                        <span className="drag-handle">⋮⋮</span>
                        <span className="tag tag-backup">备份 3</span>
                        <span className="model-name">Opus 4.7 (1M)</span>
                      </div>
                    </div>
                    <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', paddingLeft: '4px' }}>
                      拖拽调整优先级，首位为新对话默认
                    </p>
                  </div>
                ) : modelSettingView === 'edit_deepseek' ? (
                  <div className="model-edit-card">
                    <div className="card-header">
                      <div className="title"><span className="icon blue">🐳</span> DeepSeek</div>
                      <a href="#" className="link">去获取 API 密钥 ↗</a>
                    </div>
                    <div className="card-body">
                      <label className="field-label">API 密钥</label>
                      <div className="input-with-icon">
                        <input type="password" value="********************************" readOnly />
                        <button className="icon-btn">👁</button>
                      </div>

                      <label className="field-label" style={{ marginTop: '20px' }}>模型优先级（至少添加一个）</label>
                      <div className="priority-box">
                        <div className="priority-item-inline">
                          <span className="drag-handle">⋮⋮</span>
                          <em className="tag-orange">主模型</em>
                          <span>deepseek-v4-pro</span>
                        </div>
                        <button className="add-model-inline">+ 添加模型</button>
                      </div>

                      <button className="test-conn-btn">🔌 测试连接</button>
                    </div>
                  </div>
                ) : modelSettingView === 'provider_list' ? (
                  <div className="provider-list-view">
                    <div className="provider-tabs">
                      <button className={providerTab === 'recommended' ? 'active' : ''} onClick={() => setProviderTab('recommended')}>推荐服务</button>
                      <button className={providerTab === 'domestic' ? 'active' : ''} onClick={() => setProviderTab('domestic')}>国内服务</button>
                      <button className={providerTab === 'aggregate' ? 'active' : ''} onClick={() => setProviderTab('aggregate')}>聚合平台</button>
                      <button className={providerTab === 'overseas' ? 'active' : ''} onClick={() => setProviderTab('overseas')}>海外平台</button>
                      <button className={providerTab === 'local' ? 'active' : ''} onClick={() => setProviderTab('local')}>本地模型</button>
                    </div>

                    {providerTab === 'recommended' ? (
                      <div className="provider-grid">
                        <div className="provider-card">
                          <div className="title"><span className="icon">K</span> Kimi Coding Plan <em className="tag-orange">推荐</em></div>
                          <p>Kimi 智能助手的编程版，月之暗面出品</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon red">S</span> GPTNB <em className="tag-orange">推荐</em></div>
                          <p>可用Claude，最全模型聚合服务</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon dark">✒</span> PipeIlm (Claude) <em className="tag-orange">推荐</em></div>
                          <p>推特大佬 Cydia 官方 Claude 渠道</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon dark">✒</span> PipeIlm (聚合) <em className="tag-orange">推荐</em></div>
                          <p>推特大佬 Cydia 模型聚合服务</p>
                        </div>
                        <div className="provider-card" onClick={() => setModelSettingView('edit_custom')}>
                          <div className="title"><span className="icon grey">⚙</span> 自定义供应商</div>
                          <p>配置自定义 API 兼容的供应商</p>
                        </div>
                      </div>
                    ) : providerTab === 'domestic' ? (
                      <div className="provider-grid">
                        <div className="provider-card">
                          <div className="title"><span className="icon">K</span> Kimi Coding Plan <em className="tag-orange">推荐</em></div>
                          <p>Kimi 智能助手的编程版，月之暗面出品</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon pink">〰</span> MiniMax</div>
                          <p>国产领先的 AI 编程模型，性价比高，新手...</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon dark">🌙</span> Moonshot</div>
                          <p>月之暗面开放平台，按量计费</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon blue">Z</span> 智谱</div>
                          <p>智谱 GLM 大模型，国内老牌 AI 厂商</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon blue">🐳</span> DeepSeek <em className="tag-green">已激活</em></div>
                          <p>DeepSeek 深度求索，按量计费</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon grey">⚙</span> 百炼 Coding Plan</div>
                          <p>阿里云百炼，通义千问系列模型</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon blue">↱</span> 阶跃星辰</div>
                          <p>阶跃星辰，Step 系列模型</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon blue">◯</span> 百灵 (BaiLing)</div>
                          <p>支付宝百灵，Ling 系列模型</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon green">🐱</span> Longcat</div>
                          <p>长上下文优化服务</p>
                        </div>
                        <div className="provider-card">
                          <div className="title"><span className="icon dark">☵</span> 小米 MiMo</div>
                          <p>小米 MiMo 开放平台</p>
                        </div>
                        <div className="provider-card" onClick={() => setModelSettingView('edit_custom')}>
                          <div className="title"><span className="icon grey">⚙</span> 自定义供应商</div>
                          <p>配置自定义 API 兼容的供应商</p>
                        </div>
                      </div>
                    ) : (
                      <div className="empty-state">暂无该分类的推荐服务。</div>
                    )}
                  </div>
                ) : (
                  <div className="model-edit-card custom-provider">
                    <button className="back-btn" onClick={() => setModelSettingView('provider_list')}>&lt; 返回列表</button>
                    <div className="card-body">
                      <div className="card-title"><span className="icon grey">⚙</span> 自定义供应商</div>

                      <label className="field-label">供应商名称</label>
                      <input type="text" placeholder="例如: My API Provider" />

                      <label className="field-label" style={{ marginTop: '16px' }}>API Base URL</label>
                      <input type="text" placeholder="https://api.example.com/v1" />

                      <label className="field-label" style={{ marginTop: '16px' }}>API 格式</label>
                      <div className="toggle-group">
                        <button className="active">OpenAI 格式</button>
                        <button>Anthropic 格式</button>
                      </div>

                      <div className="switch-row" style={{ marginTop: '24px' }}>
                        <div>
                          <strong>使用 Responses API</strong>
                          <p>强制走 /v1/responses，中转站 prompt cache 命中率更高。仅当供应商支持 Responses 端点时开启，否则会 404。</p>
                        </div>
                        <div className={`switch ${responsesApiActive ? 'active' : ''}`} onClick={() => setResponsesApiActive(!responsesApiActive)}></div>
                      </div>

                      <label className="field-label" style={{ marginTop: '24px' }}>API 密钥</label>
                      <div className="input-with-icon">
                        <input type="password" placeholder="输入 API 密钥" />
                        <button className="icon-btn">👁</button>
                      </div>

                      <label className="field-label" style={{ marginTop: '20px' }}>模型优先级（至少添加一个）</label>
                      <div className="priority-box">
                        <button className="add-model-inline">+ 添加模型</button>
                      </div>

                      <button className="test-conn-btn" disabled>🔌 测试连接并激活</button>
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
                <span className="about-version">版本 0.2.0 (Build 2026.05.19)</span>
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
