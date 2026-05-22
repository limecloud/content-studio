import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type { InputSourceRecord, InputSourceStatus, PromptDraft } from '../../../../shared/types';
import {
  finishedVideoSources,
  targetLabel,
  videoPromptHandoff,
  type VideoPromptHandoffStatus,
} from '../../app/videoPromptFlow';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface VideoImportModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  inputSources: InputSourceRecord[];
  promptDrafts: PromptDraft[];
  activePromptDraftId: string;
  onSelectDraft: (draftId: string) => void;
  onImportFinishedVideo: (promptDraftId?: string) => void;
  onSelectModule: (module: ModuleKey) => void;
}

const STATUS_LABELS: Record<InputSourceStatus, string> = {
  registered: '已登记',
  converted: '已解析',
  blocked: '已导入，待内容理解',
  failed: '失败',
};

function statusClass(status: InputSourceStatus): string {
  if (status === 'converted' || status === 'registered') return 'ready';
  if (status === 'blocked') return 'idle';
  return 'blocked';
}

function activeContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

function sourcePromptTitle(source: InputSourceRecord, drafts: PromptDraft[]): string {
  if (!source.relatedPromptDraftId) return '未关联提示词';
  return drafts.find((draft) => draft.id === source.relatedPromptDraftId)?.title ?? '关联提示词已不在列表';
}

type DraftFilter = VideoPromptHandoffStatus | 'all';

export function VideoImportModule({
  workspaceReady,
  busy,
  inputSources,
  promptDrafts,
  activePromptDraftId,
  onSelectDraft,
  onImportFinishedVideo,
  onSelectModule,
}: VideoImportModuleProps) {
  const feature = V2_FEATURES['video-import'];
  const videoDrafts = useMemo(
    () => promptDrafts.filter((draft) => draft.purpose === 'video'),
    [promptDrafts],
  );
  const [selectedDraftId, setSelectedDraftId] = useState(activePromptDraftId);
  const [draftFilter, setDraftFilter] = useState<DraftFilter>('all');
  const selectedDraft =
    videoDrafts.find((draft) => draft.id === selectedDraftId) ??
    videoDrafts.find((draft) => draft.id === activePromptDraftId) ??
    videoDrafts[0];
  const importedVideos = useMemo(
    () => finishedVideoSources(inputSources),
    [inputSources],
  );
  const draftRows = useMemo(
    () => videoDrafts.map((draft) => ({
      draft,
      handoff: videoPromptHandoff(draft, inputSources),
    })),
    [inputSources, videoDrafts],
  );
  const visibleDraftRows = useMemo(
    () => draftRows.filter((row) => draftFilter === 'all' || row.handoff.status === draftFilter),
    [draftFilter, draftRows],
  );
  const draftCounts = useMemo(
    () => draftRows.reduce(
      (counts, row) => ({
        ...counts,
        [row.handoff.status]: counts[row.handoff.status] + 1,
      }),
      {
        all: draftRows.length,
        'not-copied': 0,
        'waiting-import': 0,
        imported: 0,
      } as Record<DraftFilter, number>,
    ),
    [draftRows],
  );
  const selectedHandoff = videoPromptHandoff(selectedDraft, inputSources);
  const selectedDraftContent = activeContent(selectedDraft);

  useEffect(() => {
    if (selectedDraftId || !selectedDraft) return;
    setSelectedDraftId(selectedDraft.id);
  }, [selectedDraft, selectedDraftId]);

  useEffect(() => {
    if (!activePromptDraftId || activePromptDraftId === selectedDraftId) return;
    setSelectedDraftId(activePromptDraftId);
  }, [activePromptDraftId, selectedDraftId]);

  return (
    <section className="video-import-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="flow"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{importedVideos.length} 条成品视频</span>
            <span className="status-pill warning">{draftCounts['waiting-import']} 个待导入</span>
            <span className="status-pill ready">{videoDrafts.length} 个可关联提示词</span>
          </div>
        )}
      >
        <div className="module-command-flow">
          <div>
            <p className="eyebrow">导入边界</p>
            <h3>第三方生成后的唯一回流产物是本地视频文件</h3>
          </div>
          <div className="workflow-actions">
            <button className="ghost small" onClick={() => onSelectModule('video-prompt')}>回到视频 Prompt</button>
            <button
              className="primary small"
              disabled={!workspaceReady || busy}
              onClick={() => onImportFinishedVideo(selectedDraft?.id)}
            >
              导入并关联提示词
            </button>
          </div>
        </div>
        <div className="v2-flow-steps module-command-steps">
          {feature.flow.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </ModuleCommandCenter>

      <div className="video-import-layout">
        <aside className="panel video-import-draft-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">关联提示词</p>
              <h3>选择原视频提示词</h3>
            </div>
          </div>
          <div className="video-import-filter-row">
            {[
              { value: 'all' as const, label: `全部 ${draftCounts.all}` },
              { value: 'waiting-import' as const, label: `已复制待导入 ${draftCounts['waiting-import']}` },
              { value: 'imported' as const, label: `已导入成品 ${draftCounts.imported}` },
              { value: 'not-copied' as const, label: `未复制 ${draftCounts['not-copied']}` },
            ].map((filter) => (
              <button
                key={filter.value}
                className={`chip-button small ${draftFilter === filter.value ? 'active' : ''}`}
                onClick={() => setDraftFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="video-prompt-draft-list">
            {visibleDraftRows.map(({ draft, handoff }) => (
              <button
                key={draft.id}
                type="button"
                className={`video-prompt-draft ${draft.id === selectedDraft?.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedDraftId(draft.id);
                  onSelectDraft(draft.id);
                }}
              >
                <span className={`status-pill ${handoff.className}`}>{handoff.label}</span>
                <strong>{draft.title}</strong>
                <small>{draft.versions.length} 个版本 · 复制 {draft.copyCount ?? 0} 次 · 成品 {handoff.importedCount}</small>
                <small>最近：{targetLabel(draft.lastCopiedTarget)}</small>
              </button>
            ))}
            {videoDrafts.length === 0 ? (
              <div className="empty-state">还没有视频 Prompt。先从“视频 Prompt”或“场景库”生成 15 秒素材 Prompt。</div>
            ) : null}
            {videoDrafts.length > 0 && visibleDraftRows.length === 0 ? (
              <div className="empty-state">当前筛选下没有视频提示词。切换筛选或先复制 Prompt 到第三方平台。</div>
            ) : null}
          </div>
        </aside>

        <main className="panel video-import-main-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">成品视频</p>
              <h3>本地入库记录</h3>
            </div>
            <span className={`status-pill ${selectedHandoff.className}`}>{selectedHandoff.label}</span>
            <button
              className="primary small"
              disabled={!workspaceReady || busy}
              onClick={() => onImportFinishedVideo(selectedDraft?.id)}
            >
              选择视频文件
            </button>
          </div>
          <div className="video-import-list">
            {importedVideos.map((source) => (
              <article key={source.id} className="video-import-card">
                <div className="workflow-run-head">
                  <span className={`status-pill ${statusClass(source.status)}`}>{STATUS_LABELS[source.status]}</span>
                  <div>
                    <strong>{source.title}</strong>
                    <small>{formatTime(source.createdAt)} · {sourcePromptTitle(source, promptDrafts)}</small>
                  </div>
                </div>
                <p>{source.summary ?? '已导入工作区，等待人工审核和后续素材库入库。'}</p>
                {source.blockedReason ? <em>{source.blockedReason}</em> : null}
                <div className="workflow-run-steps">
                  {source.tags.map((tag) => <span key={tag}>{tag}</span>)}
                  {source.relatedPromptDraftId ? <span className="ready">提示词已关联</span> : null}
                </div>
              </article>
            ))}
            {importedVideos.length === 0 ? (
              <div className="empty-state">
                暂无成品视频。{draftCounts['waiting-import'] > 0
                  ? `已有 ${draftCounts['waiting-import']} 个提示词处于“已复制待导入”，选择左侧提示词后导入本地 mp4 / mov。`
                  : '复制 Prompt 到第三方平台生成后，在这里手动选择 mp4 / mov 文件导入。'}
              </div>
            ) : null}
          </div>
        </main>

        <aside className="panel video-import-preview-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">当前关联</p>
              <h3>{selectedDraft?.title ?? '未选择提示词'}</h3>
            </div>
            <span className={`status-pill ${selectedHandoff.className}`}>{selectedHandoff.label}</span>
          </div>
          <div className="video-import-handoff-note">
            <strong>{selectedHandoff.label}</strong>
            <p>{selectedHandoff.description}</p>
          </div>
          <pre>{selectedDraftContent || '选择视频提示词后，这里显示将被关联的原始提示词。'}</pre>
          <div className="video-prompt-boundary">
            <strong>不记录第三方任务状态</strong>
            <p>导入只保存本地文件、关联提示词、来源场景和标签。外部平台的生成队列、费用、第三方任务编号和失败状态不进入本软件。</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
