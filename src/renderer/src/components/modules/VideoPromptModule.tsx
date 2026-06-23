import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type { InputSourceRecord, PromptDraft, PromptDraftPurpose, SceneCard } from '../../../../shared/types';
import {
  targetLabel,
  VIDEO_PROMPT_TARGET_OPTIONS,
  videoPromptHandoff,
} from '../../app/videoPromptFlow';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { ActionGroup, StatusPill, type StatusPillTone } from '../WorkbenchPrimitives';

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
    sceneCardIds?: string[];
    temporarySourceText?: string;
    temporarySourceTitle?: string;
  }) => void;
  onRecordPromptDraftCopy: (input: { draftId: string; target?: string }) => void;
  onSelectDraft: (draftId: string) => void;
  onSelectModule: (module: ModuleKey) => void;
}

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

function statusTone(draft?: PromptDraft): StatusPillTone {
  if (!draft) return 'idle';
  if (draft.status === 'confirmed' || draft.status === 'materialized') return 'ready';
  if (draft.status === 'archived') return 'blocked';
  return 'idle';
}

function formatTime(value?: string): string {
  return value ? new Date(value).toLocaleString() : '未复制';
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
  const [copyTarget, setCopyTarget] = useState(VIDEO_PROMPT_TARGET_OPTIONS[0].value);
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [temporarySourceText, setTemporarySourceText] = useState('');
  const [copied, setCopied] = useState(false);
  const selectedScenes = useMemo(
    () => sceneCards.filter((scene) => selectedSceneIds.includes(scene.id)),
    [sceneCards, selectedSceneIds],
  );
  const videoDrafts = useMemo(
    () => promptDrafts.filter((draft) => draft.purpose === 'video'),
    [promptDrafts],
  );
  const promptDraft = videoDrafts.find((draft) => draft.id === activePromptDraftId) ?? videoDrafts[0];
  const promptContent = activeContent(promptDraft);
  const promptItems = useMemo(() => splitPromptItems(promptContent), [promptContent]);
  const selectedPrompt = promptItems[Math.min(selectedPromptIndex, Math.max(promptItems.length - 1, 0))];
  const handoff = videoPromptHandoff(promptDraft, inputSources);
  const handoffCounts = useMemo(
    () => videoDrafts.reduce(
      (counts, draft) => {
        const draftHandoff = videoPromptHandoff(draft, inputSources);
        return {
          waiting: counts.waiting + (draftHandoff.status === 'waiting-import' ? 1 : 0),
          imported: counts.imported + (draftHandoff.status === 'imported' ? 1 : 0),
        };
      },
      { waiting: 0, imported: 0 },
    ),
    [inputSources, videoDrafts],
  );
  const usableInputSources = useMemo(
    () => inputSources.filter((source) => ['product-brief', 'user-feedback', 'brand-kb', 'ip-kb', 'competitor-observation', 'task-input', 'sop-input', 'reference'].includes(source.purpose)),
    [inputSources],
  );
  const hasTraceInput = selectedScenes.length > 0 || selectedSourceIds.length > 0 || temporarySourceText.trim().length > 0;
  const canGenerate = workspaceReady && !busy && userIntent.trim().length > 0 && hasTraceInput;
  const canCopy = workspaceReady && !busy && Boolean(promptDraft) && Boolean(selectedPrompt?.content.trim());

  useEffect(() => {
    if (!videoDrafts.length) return;
    if (videoDrafts.some((draft) => draft.id === activePromptDraftId)) return;
    onSelectDraft(videoDrafts[0].id);
  }, [activePromptDraftId, onSelectDraft, videoDrafts]);

  useEffect(() => {
    setSelectedPromptIndex(0);
  }, [promptDraft?.id]);

  function generateVideoPrompt(): void {
    if (temporarySourceText.trim()) {
      onGenerateDraft({
        title: '视频 Prompt 草稿',
        purpose: 'video',
        userIntent,
        inputSourceIds: selectedSourceIds,
        sceneCardIds: selectedScenes.map((scene) => scene.id),
        temporarySourceText,
        temporarySourceTitle: '视频 Prompt 临时资料',
      });
      setTemporarySourceText('');
      return;
    }

    if (selectedScenes.length > 0) {
      onGenerateScenePromptDraft({
        sceneCardIds: selectedScenes.map((scene) => scene.id),
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
      temporarySourceText,
      temporarySourceTitle: '视频 Prompt 临时资料',
    });
    setTemporarySourceText('');
  }

  async function copySelectedPrompt(): Promise<void> {
    if (!promptDraft || !selectedPrompt?.content.trim()) return;
    await navigator.clipboard.writeText(selectedPrompt.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
    onRecordPromptDraftCopy({ draftId: promptDraft.id, target: copyTarget });
  }

  const videoPromptContext = (
    <>
      <div className="panel-title compact">
        <strong>视频 Prompt 输入</strong>
        <small>{selectedScenes.length} 张场景卡 / {selectedSourceIds.length} 个输入源</small>
      </div>
      <div className="video-prompt-control-grid">
        <label className="video-prompt-intent">
          <span>生成意图</span>
          <textarea value={userIntent} onChange={(event) => setUserIntent(event.target.value)} />
        </label>
        <label className="video-prompt-intent">
          <span>本次资料</span>
          <textarea
            value={temporarySourceText}
            onChange={(event) => setTemporarySourceText(event.target.value)}
            placeholder="没有已登记资料时，粘贴产品卖点、参考图说明、口播脚本或本地素材说明；生成后会自动登记为输入源。"
          />
        </label>
        <label>
          <span>复制目标</span>
          <select value={copyTarget} onChange={(event) => setCopyTarget(event.target.value)}>
            {VIDEO_PROMPT_TARGET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="video-prompt-scenes-panel">
        <div className="panel-title compact">
          <div>
            <p className="eyebrow">可用素材</p>
            <h4>场景卡和输入源</h4>
          </div>
          <StatusPill>{selectedScenes.length} 已选</StatusPill>
        </div>
        <div className="video-prompt-scene-list">
          {sceneCards.map((scene) => (
            <label key={scene.id} className={`video-prompt-scene-card ${selectedSceneIds.includes(scene.id) ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={selectedSceneIds.includes(scene.id)}
                onChange={(event) => {
                  onSelectSceneIds(
                    event.target.checked
                      ? [...selectedSceneIds, scene.id].slice(0, 6)
                      : selectedSceneIds.filter((id) => id !== scene.id),
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
                <small>{source.summary ?? source.title}</small>
              </span>
            </label>
          ))}
          {sceneCards.length === 0 && usableInputSources.length === 0 ? (
            <div className="empty-state">还没有可用素材。粘贴本次资料也可以生成并自动留痕。</div>
          ) : null}
        </div>
      </div>
      {!hasTraceInput ? (
        <div className="inline-warning">
          请选择场景卡、勾选输入源，或粘贴本次资料后再生成；视频 Prompt 必须能追溯到业务素材。
        </div>
      ) : temporarySourceText.trim() ? (
        <div className="inline-warning">
          已粘贴临时资料，生成时会自动登记为本次输入源并进入追溯记录。
        </div>
      ) : null}
    </>
  );

  const videoPromptArtifact = (
    <>
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">视频 Prompt</p>
          <h3>{promptDraft?.title ?? '15 秒素材提示词'}</h3>
        </div>
        <StatusPill tone={statusTone(promptDraft)}>{statusText(promptDraft)}</StatusPill>
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
            <div className="empty-state">先基于场景卡或本次资料生成视频 Prompt 组。</div>
          ) : null}
        </div>
        <div className="video-prompt-preview">
          <p className="eyebrow">将复制的 Prompt</p>
          <pre>{selectedPrompt?.content || '暂无视频 Prompt。'}</pre>
        </div>
      </div>
      <div className="video-prompt-handoff-card">
        <span className={`status-pill ${handoff.className}`}>{handoff.label}</span>
        <div>
          <strong>{handoff.status === 'waiting-import' ? '下一步：导入第三方成品视频' : '视频 Prompt 交接状态'}</strong>
          <p>{handoff.description}</p>
        </div>
        <button className="ghost small" disabled={!promptDraft} onClick={() => onSelectModule('video-import')}>
          {handoff.status === 'imported' ? '查看成品视频' : '去导入'}
        </button>
      </div>
      <div className="video-prompt-history-panel">
        <div className="video-prompt-trace">
          <span>
            <strong>{promptDraft?.copyCount ?? 0}</strong>
            <small>复制次数</small>
          </span>
          <span>
            <strong>{targetLabel(promptDraft?.lastCopiedTarget)}</strong>
            <small>最近目标</small>
          </span>
          <span>
            <strong>{formatTime(promptDraft?.lastCopiedAt)}</strong>
            <small>最近复制</small>
          </span>
          <span>
            <strong>{handoff.importedCount}</strong>
            <small>已导入成品</small>
          </span>
        </div>
        <div className="video-prompt-draft-list">
          {videoDrafts.map((draft) => {
            const draftHandoff = videoPromptHandoff(draft, inputSources);
            return (
              <button
                key={draft.id}
                type="button"
                className={`video-prompt-draft ${draft.id === promptDraft?.id ? 'active' : ''}`}
                onClick={() => onSelectDraft(draft.id)}
              >
                <span className={`status-pill ${draftHandoff.className}`}>{draftHandoff.label}</span>
                <strong>{draft.title}</strong>
                <small>{draft.versions.length} 个版本 · 复制 {draft.copyCount ?? 0} 次 · 成品 {draftHandoff.importedCount}</small>
                <small>最近：{targetLabel(draft.lastCopiedTarget)} · {formatTime(draft.lastCopiedAt)}</small>
              </button>
            );
          })}
          {videoDrafts.length === 0 ? (
            <div className="empty-state">暂无视频提示词草稿。</div>
          ) : null}
        </div>
      </div>
    </>
  );

  const videoPromptFooter = (
    <>
      <ActionGroup align="left">
        <button className="primary small" disabled={!canGenerate} onClick={generateVideoPrompt}>
          生成视频 Prompt 组
        </button>
        <button className="ghost small" disabled={!canCopy} onClick={() => void copySelectedPrompt()}>
          {copied ? '已复制' : '复制到第三方平台'}
        </button>
        <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge')}>
          补知识来源
        </button>
        <button className="ghost small" disabled={!promptDraft} onClick={() => onSelectModule('video-import')}>
          {handoff.status === 'imported' ? '查看导入记录' : '导入成品视频'}
        </button>
      </ActionGroup>
      {!canGenerate && workspaceReady && !busy ? (
        <span className="scene-prompt-inline-recovery">
          {temporarySourceText.trim() && !selectedScenes.length && !selectedSourceIds.length
            ? '生成时会先把临时资料登记为输入源'
            : '请选择场景卡、输入源，或粘贴本次资料后再生成'}
        </span>
      ) : null}
    </>
  );

  return (
    <section className="video-prompt-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="compact"
        actions={(
          <div className="workflow-summary-stack">
            <StatusPill>{videoDrafts.length} 个视频 Prompt</StatusPill>
            <StatusPill tone={statusTone(promptDraft)}>{statusText(promptDraft)}</StatusPill>
            <span className={`status-pill ${handoff.className}`}>{handoff.label}</span>
            <StatusPill>{handoffCounts.waiting} 个待导入</StatusPill>
          </div>
        )}
      />

      <div className="video-prompt-builder-panel">
        <div className="panel video-prompt-builder-surface">
          {videoPromptContext}
          {videoPromptArtifact}
          {videoPromptFooter}
        </div>
      </div>
    </section>
  );
}
