import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type { InputSourceRecord, PromptDraft, PromptDraftPurpose, SceneCard } from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface VideoPromptModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  inputSources: InputSourceRecord[];
  sceneCards: SceneCard[];
  promptDrafts: PromptDraft[];
  activePromptDraftId: string;
  selectedSceneIds: string[];
  onSelectSceneIds: (sceneIds: string[]) => void;
  onGenerateScenePromptDraft: (input: {
    sceneCardIds: string[];
    purpose: PromptDraftPurpose;
    userIntent: string;
  }) => void;
  onGenerateDraft: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
  }) => void;
  onRecordPromptDraftCopy: (input: { draftId: string; target?: string }) => void;
  onSelectDraft: (draftId: string) => void;
  onSelectModule: (module: ModuleKey) => void;
}

const VIDEO_TARGET_OPTIONS = [
  { value: 'runninghub', label: 'RunningHub' },
  { value: 'vidu', label: 'Vidu' },
  { value: 'runway', label: 'Runway' },
  { value: 'kling', label: '可灵' },
  { value: 'other-third-party-video-platform', label: '其他第三方' },
];

function activeContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function splitPromptItems(content: string): Array<{ title: string; content: string }> {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const chunks = trimmed
    .split(/\n(?=### )/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('### '));
  if (!chunks.length) return [{ title: '完整视频 Prompt', content: trimmed }];
  return chunks.map((chunk, index) => {
    const [firstLine] = chunk.split('\n');
    return {
      title: firstLine?.replace(/^###\s*/, '').trim() || `视频 Prompt ${index + 1}`,
      content: chunk,
    };
  });
}

function statusText(draft?: PromptDraft): string {
  if (!draft) return '待生成';
  if (draft.status === 'confirmed') return '已确认';
  if (draft.status === 'materialized') return '已物化';
  if (draft.status === 'archived') return '归档';
  return '草稿';
}

function statusClass(draft?: PromptDraft): string {
  if (!draft) return 'idle';
  if (draft.status === 'confirmed' || draft.status === 'materialized') return 'ready';
  if (draft.status === 'archived') return 'blocked';
  return 'idle';
}

function formatTime(value?: string): string {
  return value ? new Date(value).toLocaleString() : '未复制';
}

function targetLabel(value?: string): string {
  if (!value) return '未记录';
  return VIDEO_TARGET_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function VideoPromptModule({
  workspaceReady,
  busy,
  inputSources,
  sceneCards,
  promptDrafts,
  activePromptDraftId,
  selectedSceneIds,
  onSelectSceneIds,
  onGenerateScenePromptDraft,
  onGenerateDraft,
  onRecordPromptDraftCopy,
  onSelectDraft,
  onSelectModule,
}: VideoPromptModuleProps) {
  const feature = V2_FEATURES['video-prompt'];
  const [userIntent, setUserIntent] = useState(
    '生成可直接复制到第三方视频平台的 15 秒图生视频素材 Prompt；不要成片字幕，不创建外部任务，成品只能手动导入。',
  );
  const [copyTarget, setCopyTarget] = useState(VIDEO_TARGET_OPTIONS[0].value);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const effectiveSceneIds = selectedSceneIds.length
    ? selectedSceneIds
    : sceneCards.slice(0, 2).map((scene) => scene.id);
  const selectedScenes = useMemo(
    () => sceneCards.filter((scene) => effectiveSceneIds.includes(scene.id)),
    [effectiveSceneIds, sceneCards],
  );
  const videoDrafts = useMemo(
    () => promptDrafts.filter((draft) => draft.purpose === 'video'),
    [promptDrafts],
  );
  const promptDraft = videoDrafts.find((draft) => draft.id === activePromptDraftId) ?? videoDrafts[0];
  const promptContent = activeContent(promptDraft);
  const promptItems = useMemo(() => splitPromptItems(promptContent), [promptContent]);
  const selectedPrompt = promptItems[Math.min(selectedPromptIndex, Math.max(promptItems.length - 1, 0))];
  const usableInputSources = useMemo(
    () => inputSources.filter((source) => ['product-brief', 'brand-kb', 'ip-kb', 'sop-input', 'reference'].includes(source.purpose)),
    [inputSources],
  );
  const canGenerate = workspaceReady && !busy && userIntent.trim().length > 0;
  const canCopy = workspaceReady && !busy && Boolean(promptDraft) && Boolean(selectedPrompt?.content.trim());

  useEffect(() => {
    if (selectedSceneIds.length || sceneCards.length === 0) return;
    onSelectSceneIds(sceneCards.slice(0, 2).map((scene) => scene.id));
  }, [onSelectSceneIds, sceneCards, selectedSceneIds.length]);

  useEffect(() => {
    if (!videoDrafts.length) return;
    if (videoDrafts.some((draft) => draft.id === activePromptDraftId)) return;
    onSelectDraft(videoDrafts[0].id);
  }, [activePromptDraftId, onSelectDraft, videoDrafts]);

  useEffect(() => {
    setSelectedPromptIndex(0);
  }, [promptDraft?.id]);

  useEffect(() => {
    if (selectedSourceIds.length || usableInputSources.length === 0) return;
    setSelectedSourceIds(usableInputSources.slice(0, 3).map((source) => source.id));
  }, [selectedSourceIds.length, usableInputSources]);

  function generateVideoPrompt(): void {
    if (selectedScenes.length > 0) {
      onGenerateScenePromptDraft({
        sceneCardIds: effectiveSceneIds,
        purpose: 'video',
        userIntent,
      });
      return;
    }

    onGenerateDraft({
      title: '视频 Prompt 草稿',
      purpose: 'video',
      userIntent,
      inputSourceIds: selectedSourceIds,
    });
  }

  async function copySelectedPrompt(): Promise<void> {
    if (!promptDraft || !selectedPrompt?.content.trim()) return;
    await navigator.clipboard.writeText(selectedPrompt.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
    onRecordPromptDraftCopy({ draftId: promptDraft.id, target: copyTarget });
  }

  return (
    <section className="video-prompt-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="flow"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{videoDrafts.length} 个视频 Prompt</span>
            <span className={`status-pill ${statusClass(promptDraft)}`}>{statusText(promptDraft)}</span>
            <span className="status-pill ready">外部生成手动交接</span>
          </div>
        )}
      >
        <div className="module-command-flow">
          <div>
            <p className="eyebrow">边界</p>
            <h3>场景卡 → 视频 Prompt → 复制到第三方平台 → 成品手动导入</h3>
          </div>
          <div className="workflow-actions">
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge-scenes')}>
              场景库
            </button>
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('video-import')}>
              导入成品视频
            </button>
          </div>
        </div>
        <div className="v2-flow-steps module-command-steps">
          {feature.flow.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </ModuleCommandCenter>

      <div className="video-prompt-layout">
        <aside className="panel video-prompt-scenes-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">输入</p>
              <h3>场景卡选择</h3>
            </div>
            <span className="status-pill">{selectedScenes.length} 已选</span>
          </div>
          <div className="video-prompt-scene-list">
            {sceneCards.map((scene) => (
              <label key={scene.id} className={`video-prompt-scene-card ${effectiveSceneIds.includes(scene.id) ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={effectiveSceneIds.includes(scene.id)}
                  onChange={(event) => {
                    onSelectSceneIds(
                      event.target.checked
                        ? [...effectiveSceneIds, scene.id].slice(0, 6)
                        : effectiveSceneIds.filter((id) => id !== scene.id),
                    );
                  }}
                />
                <span>
                  <strong>{scene.title}</strong>
                  <small>{scene.usageScene}</small>
                  <em>{scene.videoMaterialSuggestion}</em>
                </span>
              </label>
            ))}
            {sceneCards.length === 0 ? (
              <div className="empty-state">还没有场景卡。可以先用下方输入源和用户意图直接生成视频 Prompt，后续再沉淀为场景库。</div>
            ) : null}
          </div>
          {usableInputSources.length ? (
            <div className="prompt-source-list compact">
              {usableInputSources.map((source) => (
                <label key={source.id} className="prompt-source-option">
                  <input
                    type="checkbox"
                    checked={selectedSourceIds.includes(source.id)}
                    onChange={(event) => {
                      setSelectedSourceIds((current) =>
                        event.target.checked
                          ? [...current, source.id].slice(0, 6)
                          : current.filter((id) => id !== source.id),
                      );
                    }}
                  />
                  <span>
                    <strong>{source.title}</strong>
                    <small>{source.purpose} · {source.status}</small>
                  </span>
                </label>
              ))}
            </div>
          ) : null}
          <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge-inputs')}>
            补输入源
          </button>
        </aside>

        <main className="panel video-prompt-builder-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">视频 Prompt</p>
              <h3>{promptDraft?.title ?? '15 秒素材提示词'}</h3>
            </div>
            <span className={`status-pill ${statusClass(promptDraft)}`}>{statusText(promptDraft)}</span>
          </div>

          <div className="video-prompt-control-grid">
            <label className="video-prompt-intent">
              <span>生成意图</span>
              <textarea value={userIntent} onChange={(event) => setUserIntent(event.target.value)} />
            </label>
            <label>
              <span>复制目标</span>
              <select value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)}>
                {VIDEO_TARGET_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="workflow-actions left">
            <button
              className="ghost small"
              disabled={!canGenerate}
              onClick={generateVideoPrompt}
            >
              生成视频 Prompt 组
            </button>
            <button className="primary small" disabled={!canCopy} onClick={() => void copySelectedPrompt()}>
              {copied ? '已复制' : '复制到第三方平台'}
            </button>
            <button className="ghost small" disabled={!promptDraft} onClick={() => onSelectModule('video-import')}>
              导入成品视频
            </button>
          </div>

          <div className="video-prompt-result-grid">
            <div className="video-prompt-item-list">
              {promptItems.map((item, index) => (
                <button
                  key={`${item.title}:${index}`}
                  type="button"
                  className={index === selectedPromptIndex ? 'active' : ''}
                  onClick={() => setSelectedPromptIndex(index)}
                >
                  <strong>{item.title}</strong>
                  <small>{item.content.split('\n').slice(1, 3).join(' / ')}</small>
                </button>
              ))}
              {promptItems.length === 0 ? (
                <div className="empty-state">先基于场景卡生成视频 Prompt 组，再复制单条 15 秒素材 Prompt 到第三方平台。</div>
              ) : null}
            </div>
            <div className="video-prompt-preview">
              <p className="eyebrow">将复制的 Prompt</p>
              <pre>{selectedPrompt?.content || '暂无视频 Prompt。'}</pre>
            </div>
          </div>
        </main>

        <aside className="panel video-prompt-history-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">追溯</p>
              <h3>复制与导入记录</h3>
            </div>
          </div>
          {promptDraft ? (
            <div className="video-prompt-trace">
              <span>
                <strong>{promptDraft.copyCount ?? 0}</strong>
                <small>复制次数</small>
              </span>
              <span>
                <strong>{targetLabel(promptDraft.lastCopiedTarget)}</strong>
                <small>最近目标</small>
              </span>
              <span>
                <strong>{formatTime(promptDraft.lastCopiedAt)}</strong>
                <small>最近复制</small>
              </span>
            </div>
          ) : null}
          <div className="video-prompt-boundary">
            <strong>软件边界</strong>
            <p>第三方平台生成过程脱离软件：这里不创建外部任务、不保存外部任务 ID、不轮询状态。回到软件的唯一产物是用户手动导入的视频文件。</p>
          </div>
          <div className="video-prompt-draft-list">
            {videoDrafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                className={`video-prompt-draft ${draft.id === promptDraft?.id ? 'active' : ''}`}
                onClick={() => onSelectDraft(draft.id)}
              >
                <strong>{draft.title}</strong>
                <small>{draft.versions.length} 个版本 · 复制 {draft.copyCount ?? 0} 次</small>
                <small>最近：{targetLabel(draft.lastCopiedTarget)} · {formatTime(draft.lastCopiedAt)}</small>
              </button>
            ))}
            {videoDrafts.length === 0 ? (
              <div className="empty-state">暂无视频 PromptDraft。先从场景库生成视频 Prompt 组。</div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
