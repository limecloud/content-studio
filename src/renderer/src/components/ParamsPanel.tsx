import { useMemo, useState } from 'react';
import type {
  GenerationLogEntry,
  GlobalGenerationParams,
  KnowledgeCitation,
  ModelConfigView,
  SkillSelectionView,
  TextGenerationProtocol,
} from '../../../shared/types';
import { formatDuration, generationServiceLabel, kindLabel, sectionLabel, skillKey, statusLabel, textProtocolLabel } from '../app/formatters';
import type { SetGlobalParams } from '../app/types';

interface ParamsPanelProps {
  params: GlobalGenerationParams;
  textProtocol: TextGenerationProtocol;
  textModels: string[];
  imageModels: string[];
  videoModels: string[];
  modelConfig: ModelConfigView | null;
  citations: KnowledgeCitation[];
  logs: GenerationLogEntry[];
  skillSelection: SkillSelectionView | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onOpenModelSettings: () => void;
  setParams: SetGlobalParams;
}

type ParamsPanelTab = 'params' | 'logs';

export function ParamsPanel({
  params,
  textProtocol,
  textModels,
  imageModels,
  videoModels,
  modelConfig,
  citations,
  logs,
  skillSelection,
  collapsed,
  onToggleCollapsed,
  onOpenModelSettings,
  setParams,
}: ParamsPanelProps) {
  const [activeTab, setActiveTab] = useState<ParamsPanelTab>('params');
  const recentLogs = useMemo(() => logs.slice(0, 8), [logs]);
  const textModelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          textModels
            .map((model) => model.trim())
            .filter(Boolean),
        ),
      ),
    [textModels],
  );
  const modelSourceLabel = modelConfig?.platformManaged
    ? '平台模型设置'
    : '本地独立配置';
  const modelSourceDescription = modelConfig?.platformManaged
    ? `来自 ${modelConfig.platformHost?.endpoint ?? '平台设置中心'}`
    : modelConfig?.platformReadiness?.reasons[0]?.message ?? '未连接平台宿主。';
  const imageModelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          imageModels
            .map((model) => model.trim())
            .filter(Boolean),
        ),
      ),
    [imageModels],
  );
  const videoModelOptions = useMemo(
    () =>
      Array.from(
        new Set(
          videoModels
            .map((model) => model.trim())
            .filter(Boolean),
        ),
      ),
    [videoModels],
  );
  const selectedTextModel = textModelOptions.includes(params.textModel) ? params.textModel : textModelOptions[0] ?? '';
  const selectedImageModel = imageModelOptions.includes(params.imageModel) ? params.imageModel : imageModelOptions[0] ?? '';
  const selectedVideoModel = videoModelOptions.includes(params.videoModel) ? params.videoModel : videoModelOptions[0] ?? '';
  const collapseButton = (
    <button
      className="params-panel-collapse-btn"
      onClick={onToggleCollapsed}
      aria-label={collapsed ? '展开右侧参数栏' : '折叠右侧参数栏'}
      title={collapsed ? '展开右侧参数栏' : '折叠右侧参数栏'}
    >
      {collapsed ? '‹' : '›'}
    </button>
  );

  return (
    <aside className={`params-panel ${collapsed ? 'collapsed' : ''}`} aria-label="右侧参数与日志面板">
      {collapsed ? collapseButton : (
        <>
      <div className="params-panel-toolbar">
        <div className="params-panel-tabs" role="tablist" aria-label="右侧辅助面板">
          <button
            role="tab"
            aria-selected={activeTab === 'params'}
            className={activeTab === 'params' ? 'active' : ''}
            onClick={() => setActiveTab('params')}
          >
            参数
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'logs'}
            className={activeTab === 'logs' ? 'active' : ''}
            onClick={() => setActiveTab('logs')}
          >
            日志
            <span>{logs.length}</span>
          </button>
        </div>
        {collapseButton}
      </div>

      {activeTab === 'params' ? (
        <>
          <section className="panel compact">
            <div className="panel-title">
              <div>
                <p className="eyebrow">生成参数</p>
                <h3>全局参数</h3>
              </div>
              <button className="ghost small" onClick={onOpenModelSettings}>
                设置
              </button>
            </div>
            <div className={modelConfig?.platformManaged ? 'model-source-banner ready' : 'model-source-banner blocked'}>
              <strong>{modelSourceLabel}</strong>
              <span>{modelSourceDescription}</span>
            </div>
            <label>
              <span>文字协议</span>
              <input readOnly value={textProtocolLabel(textProtocol)} />
            </label>
            <label>
              <span>文字模型</span>
              <select
                value={selectedTextModel}
                disabled={!textModelOptions.length}
                onChange={(event) =>
                  setParams((current) => ({
                    ...current,
                    textModel: event.target.value,
                  }))
                }
              >
                {textModelOptions.length ? null : <option value="">未配置文字模型</option>}
                {textModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>图片模型</span>
              <select
                value={selectedImageModel}
                disabled={!imageModelOptions.length}
                onChange={(event) =>
                  setParams((current) => ({
                    ...current,
                    imageModel: event.target.value,
                  }))
                }
              >
                {imageModelOptions.length ? null : <option value="">未配置图片模型</option>}
                {imageModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>视频模型</span>
              <select
                value={selectedVideoModel}
                disabled={!videoModelOptions.length}
                onChange={(event) =>
                  setParams((current) => ({
                    ...current,
                    videoModel: event.target.value,
                  }))
                }
              >
                {videoModelOptions.length ? null : <option value="">未配置视频模型</option>}
                {videoModelOptions.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </label>
            <div className="param-block">
              <span>生成数量</span>
              <input
                type="range"
                min="1"
                max="4"
                value={params.count}
                onChange={(event) =>
                  setParams((current) => ({
                    ...current,
                    count: Number(event.target.value),
                  }))
                }
              />
              <strong>{params.count}</strong>
            </div>
            <div className="chip-row tight">
              {(['1:1', '4:5', '3:4', '9:16', '16:9'] as GlobalGenerationParams['aspectRatio'][]).map((ratio) => (
                <button
                  key={ratio}
                  className={`chip-button ${params.aspectRatio === ratio ? 'active' : ''}`}
                  onClick={() => setParams((current) => ({ ...current, aspectRatio: ratio }))}
                >
                  {ratio}
                </button>
              ))}
            </div>
            <div className="chip-row tight">
              {(['1k', '2k', '4k'] as GlobalGenerationParams['resolution'][]).map((resolution) => (
                <button
                  key={resolution}
                  className={`chip-button ${params.resolution === resolution ? 'active' : ''}`}
                  onClick={() => setParams((current) => ({ ...current, resolution }))}
                >
                  {resolution.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="chip-row tight">
              {(['low', 'medium', 'high'] as GlobalGenerationParams['quality'][]).map((quality) => (
                <button
                  key={quality}
                  className={`chip-button ${params.quality === quality ? 'active' : ''}`}
                  onClick={() => setParams((current) => ({ ...current, quality }))}
                >
                  {quality}
                </button>
              ))}
            </div>
          </section>

          <section className="panel compact">
            <p className="eyebrow">已选知识引用</p>
            <div className="citation-stack">
              {citations.map((citation) => (
                <article key={`${citation.knowledgeBaseId}:${citation.sectionId}`}>
                  <strong>{sectionLabel(citation.sectionType)}</strong>
                  <p>{citation.excerpt}</p>
                </article>
              ))}
              {citations.length === 0 ? (
                <div className="empty-state">当前模块未绑定知识引用。</div>
              ) : null}
            </div>
          </section>

          <section className="panel compact">
            <p className="eyebrow">当前启用 skills</p>
            <div className="selected-citations">
              {(skillSelection?.enabledSkills ?? []).map((skill) => (
                <span key={skillKey(skill)}>{skill.slug}</span>
              ))}
              {!skillSelection?.enabledSkills.length ? (
                <p>选择工作区后可启用内容生成 skills。</p>
              ) : null}
            </div>
          </section>
        </>
      ) : (
        <section className="panel compact params-log-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">生成记录</p>
              <h3>最近生成日志</h3>
            </div>
            <span className="status-pill">{logs.length} 条</span>
          </div>
          <div className="params-log-list">
            {recentLogs.map((log) => (
              <article key={log.id} className={`params-log-card ${log.status}`}>
                <header>
                  <span>{kindLabel(log.kind)}</span>
                  <small>{statusLabel(log.status)}</small>
                </header>
                <strong>{log.title}</strong>
                <p>{log.summary ?? log.error ?? '暂无摘要'}</p>
                <small>
                  {formatDuration(log.durationMs)} · {generationServiceLabel(log.model)} ·{' '}
                  {new Date(log.createdAt).toLocaleString()}
                </small>
              </article>
            ))}
            {recentLogs.length === 0 ? (
              <div className="empty-state">生成图片、文章或视频后，最近记录会在这里显示。</div>
            ) : null}
          </div>
        </section>
      )}
        </>
      )}
    </aside>
  );
}
