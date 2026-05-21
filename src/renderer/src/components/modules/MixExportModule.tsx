import { useEffect, useMemo, useState } from 'react';
import type {
  AssetReworkSource,
  AssetReviewRecord,
  AssetReviewStatus,
  GenerationLogEntry,
  InputSourceRecord,
  MixPackageAssetInput,
  MixPackageAssetKind,
  MixPackageRecord,
  OverlayCardRecord,
  PromptDraft,
  ReviewAssetInput,
} from '../../../../shared/types';
import type { ModuleKey } from '../../app/types';
import {
  extractGeneratedAssetRefsFromLog,
  extractPromptFromLog,
  fileNameFromPath,
  formatDuration,
  isImageFilePath,
  isPromptDistilledSource,
  isVideoFilePath,
  kindLabel,
  localAssetUrl,
} from '../../app/formatters';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface MixExportModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  logs: GenerationLogEntry[];
  inputSources: InputSourceRecord[];
  promptDrafts: PromptDraft[];
  overlayCards: OverlayCardRecord[];
  assetReviews: AssetReviewRecord[];
  mixPackages: MixPackageRecord[];
  onExportMixPackage: (input: {
    title: string;
    platform: string;
    assets: MixPackageAssetInput[];
    notes?: string;
  }) => void;
  onReviewAsset: (input: Omit<ReviewAssetInput, 'workspacePath'>) => void;
  onReworkAsset: (input: {
    kind: MixPackageAssetKind;
    assetKey?: string;
    path: string;
    title?: string;
    sourceType: 'generation-log' | 'input-source' | 'overlay-card' | 'manual';
    sourceId?: string;
    promptDraftId?: string;
    promptText?: string;
    sceneCardIds?: string[];
    workflowRunId?: string;
  }) => void;
  onDistillAssetPrompt: (input: {
    kind: MixPackageAssetKind;
    assetKey?: string;
    path: string;
    title?: string;
    sourceType: 'generation-log' | 'input-source' | 'overlay-card' | 'manual';
    sourceId?: string;
    promptDraftId?: string;
    promptText?: string;
    sceneCardIds?: string[];
    workflowRunId?: string;
  }) => void;
  onRevealPath: (path: string) => void;
  onOpenPromptDraft: (draftId: string) => void;
  onOpenSceneCards: (sceneCardIds: string[]) => void;
  onOpenWorkflowRun: (workflowRunId: string) => void;
  onSelectModule: (module: ModuleKey) => void;
}

type CandidateSource = 'generated' | 'imported' | 'overlay';

interface MixAssetCandidate {
  id: string;
  kind: MixPackageAssetKind;
  source: CandidateSource;
  title: string;
  path: string;
  sourceId?: string;
  promptDraftId?: string;
  promptText?: string;
  relatedSceneCardIds?: string[];
  workflowRunId?: string;
  reworkSource?: AssetReworkSource;
  durationSeconds?: number;
  tags: string[];
  createdAt: string;
  subtitle: string;
}

const PLATFORM_OPTIONS = [
  { value: 'douyin', label: '抖音 / 剪映' },
  { value: 'xiaohongshu', label: '小红书' },
  { value: 'kuaishou', label: '快手' },
  { value: 'third-party-mix-tool', label: '第三方混剪软件' },
];

function activeDraftContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function assetKindFromPath(path: string): MixPackageAssetKind | null {
  if (isImageFilePath(path)) return 'image';
  if (isVideoFilePath(path)) return 'video';
  return null;
}

function relatedDraftForLog(log: GenerationLogEntry, promptDrafts: PromptDraft[]): PromptDraft | undefined {
  if (!log.workflowRunId && !log.sceneCardIds?.length) return undefined;
  return promptDrafts.find((draft) => {
    if (log.workflowRunId && draft.workflowRunId === log.workflowRunId) return true;
    return Boolean(log.sceneCardIds?.some((sceneId) => draft.sceneCardIds?.includes(sceneId)));
  });
}

function collectGeneratedCandidates(logs: GenerationLogEntry[], promptDrafts: PromptDraft[]): MixAssetCandidate[] {
  return logs.flatMap((log) => {
    if (log.status !== 'succeeded' || (log.kind !== 'image' && log.kind !== 'video')) return [];
    const relatedDraft = relatedDraftForLog(log, promptDrafts);
    return extractGeneratedAssetRefsFromLog(log).flatMap((path, index) => {
      const kind = assetKindFromPath(path);
      if (!kind) return [];
      return [{
        id: `generated:${log.id}:${index}:${path}`,
        kind,
        source: 'generated' as const,
        title: fileNameFromPath(path),
        path,
        sourceId: log.id,
        promptDraftId: relatedDraft?.id,
        promptText: extractPromptFromLog(log),
        relatedSceneCardIds: log.sceneCardIds ?? relatedDraft?.sceneCardIds ?? [],
        workflowRunId: log.workflowRunId ?? relatedDraft?.workflowRunId,
        reworkSource: log.reworkSource,
        tags: [kindLabel(log.kind), log.model ?? '', log.status].filter(Boolean),
        createdAt: log.createdAt,
        subtitle: `${kindLabel(log.kind)} · ${log.model ?? 'local'} · ${formatDuration(log.durationMs)}`,
      }];
    });
  });
}

function collectImportedCandidates(
  inputSources: InputSourceRecord[],
  promptDrafts: PromptDraft[],
): MixAssetCandidate[] {
  return inputSources.flatMap((source) => {
    if (source.purpose !== 'successful-asset') return [];
    if (isPromptDistilledSource(source)) return [];
    const refs = Array.from(new Set([source.sourcePath, ...source.artifactRefs].filter((item): item is string => Boolean(item))));
    const relatedDraft = source.relatedPromptDraftId
      ? promptDrafts.find((draft) => draft.id === source.relatedPromptDraftId)
      : undefined;
    return refs.flatMap((path, index) => {
      const kind = assetKindFromPath(path);
      if (!kind) return [];
      return [{
        id: `imported:${source.id}:${index}:${path}`,
        kind,
        source: 'imported' as const,
        title: source.title || fileNameFromPath(path),
        path,
        sourceId: source.id,
        promptDraftId: source.relatedPromptDraftId,
        promptText: activeDraftContent(relatedDraft) || source.summary,
        relatedSceneCardIds: source.relatedSceneCardIds,
        workflowRunId: source.workflowRunId ?? relatedDraft?.workflowRunId,
        tags: Array.from(new Set(['手动导入', source.kind, ...source.tags].filter(Boolean))),
        createdAt: source.createdAt,
        subtitle: `手动导入 · ${relatedDraft?.title ?? '未关联 Prompt'}`,
      }];
    });
  });
}

function collectOverlayCandidates(overlayCards: OverlayCardRecord[], promptDrafts: PromptDraft[]): MixAssetCandidate[] {
  return overlayCards.map((card) => {
    const draft = card.promptDraftId
      ? promptDrafts.find((item) => item.id === card.promptDraftId)
      : undefined;
    return {
      id: `overlay:${card.id}`,
      kind: 'overlay' as const,
      source: 'overlay' as const,
      title: card.title,
      path: card.assetPath,
      sourceId: card.id,
      promptDraftId: card.promptDraftId,
      promptText: card.text,
      relatedSceneCardIds: draft?.sceneCardIds,
      workflowRunId: draft?.workflowRunId,
      durationSeconds: card.durationSeconds,
      tags: card.tags,
      createdAt: card.createdAt,
      subtitle: `绿幕图 · ${card.type} · ${card.durationSeconds}s`,
    };
  });
}

function dedupeCandidates(candidates: MixAssetCandidate[]): MixAssetCandidate[] {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceLabel(source: CandidateSource): string {
  if (source === 'generated') return '生成产物';
  if (source === 'imported') return '导入视频';
  return '绿幕图';
}

function kindLabelForMix(kind: MixPackageAssetKind): string {
  if (kind === 'image') return '图片';
  if (kind === 'video') return '视频';
  return '绿幕';
}

function sourceTypeForCandidate(candidate: MixAssetCandidate): ReviewAssetInput['sourceType'] {
  if (candidate.source === 'generated') return 'generation-log';
  if (candidate.source === 'imported') return 'input-source';
  return 'overlay-card';
}

function reviewLabel(status?: AssetReviewStatus): string {
  if (status === 'approved') return '已通过';
  if (status === 'rejected') return '已驳回';
  return '待审核';
}

function reviewClass(status?: AssetReviewStatus): string {
  if (status === 'approved') return 'ready';
  if (status === 'rejected') return 'blocked';
  return 'idle';
}

export function MixExportModule({
  workspaceReady,
  busy,
  logs,
  inputSources,
  promptDrafts,
  overlayCards,
  assetReviews,
  mixPackages,
  onExportMixPackage,
  onReviewAsset,
  onReworkAsset,
  onDistillAssetPrompt,
  onRevealPath,
  onOpenPromptDraft,
  onOpenSceneCards,
  onOpenWorkflowRun,
  onSelectModule,
}: MixExportModuleProps) {
  const feature = V2_FEATURES['video-mix-export'];
  const [title, setTitle] = useState('短视频混剪素材包');
  const [platform, setPlatform] = useState(PLATFORM_OPTIONS[0].value);
  const [notes, setNotes] = useState('仅导出素材文件夹和 manifest；剪辑、成片渲染和批量混剪由第三方软件完成。');
  const [kindFilter, setKindFilter] = useState<MixPackageAssetKind | 'all'>('all');
  const [focusedCandidateId, setFocusedCandidateId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [autoSelected, setAutoSelected] = useState(false);
  const reviewMap = useMemo(
    () => new Map(assetReviews.map((review) => [review.assetKey, review])),
    [assetReviews],
  );

  const candidates = useMemo(
    () => dedupeCandidates([
      ...collectOverlayCandidates(overlayCards, promptDrafts),
      ...collectImportedCandidates(inputSources, promptDrafts),
      ...collectGeneratedCandidates(logs, promptDrafts),
    ]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [inputSources, logs, overlayCards, promptDrafts],
  );
  const visibleCandidates = useMemo(
    () => candidates.filter((candidate) => kindFilter === 'all' || candidate.kind === kindFilter),
    [candidates, kindFilter],
  );
  const selectedCandidates = useMemo(
    () => candidates.filter((candidate) => selectedIds.includes(candidate.id) && reviewMap.get(candidate.id)?.status === 'approved'),
    [candidates, reviewMap, selectedIds],
  );
  const approvedCandidates = useMemo(
    () => candidates.filter((candidate) => reviewMap.get(candidate.id)?.status === 'approved'),
    [candidates, reviewMap],
  );
  const manifestPreview = useMemo(
    () => ({
      schema: 'buguai.mix-package.v1',
      title,
      platform,
      assets: selectedCandidates.map((candidate) => ({
        kind: candidate.kind,
        title: candidate.title,
        path: candidate.path,
        sourceType: sourceTypeForCandidate(candidate),
        sourceId: candidate.sourceId,
        promptDraftId: candidate.promptDraftId,
        promptText: candidate.promptText,
        relatedSceneCardIds: candidate.relatedSceneCardIds,
        workflowRunId: candidate.workflowRunId,
        durationSeconds: candidate.durationSeconds,
        reviewStatus: reviewMap.get(candidate.id)?.status ?? 'pending',
        tags: candidate.tags,
      })),
      notes,
    }),
    [notes, platform, reviewMap, selectedCandidates, title],
  );
  const canExport = workspaceReady && !busy && title.trim().length > 0 && selectedCandidates.length > 0;

  useEffect(() => {
    if (autoSelected || candidates.length === 0) return;
    setSelectedIds(approvedCandidates.slice(0, 80).map((candidate) => candidate.id));
    setAutoSelected(true);
  }, [approvedCandidates, autoSelected, candidates.length]);

  useEffect(() => {
    if (visibleCandidates.length === 0) {
      setFocusedCandidateId(null);
      return;
    }
    if (!focusedCandidateId || !visibleCandidates.some((candidate) => candidate.id === focusedCandidateId)) {
      setFocusedCandidateId(visibleCandidates[0].id);
    }
  }, [focusedCandidateId, visibleCandidates]);

  function toggleExportCandidate(candidateId: string): void {
    if (reviewMap.get(candidateId)?.status !== 'approved') return;
    setSelectedIds((current) =>
      current.includes(candidateId)
        ? current.filter((id) => id !== candidateId)
        : [...current, candidateId],
    );
  }

  function selectCandidate(candidate: MixAssetCandidate): void {
    setFocusedCandidateId(candidate.id);
    if (reviewMap.get(candidate.id)?.status === 'approved') {
      toggleExportCandidate(candidate.id);
      return;
    }
    reviewCandidate(candidate, 'approved');
  }

  function reviewCandidate(candidate: MixAssetCandidate, status: AssetReviewStatus): void {
    setFocusedCandidateId(candidate.id);
    onReviewAsset({
      assetKey: candidate.id,
      workflowRunId: candidate.workflowRunId,
      kind: candidate.kind,
      sourceType: sourceTypeForCandidate(candidate),
      sourceId: candidate.sourceId,
      path: candidate.path,
      title: candidate.title,
      status,
      note: status === 'approved' ? '人工审核通过，可进入混剪包。' : '人工审核驳回，暂不进入混剪包。',
      tags: candidate.tags,
    });
    setSelectedIds((current) =>
      status === 'approved'
        ? (current.includes(candidate.id) ? current : [...current, candidate.id])
        : current.filter((id) => id !== candidate.id),
    );
  }

  function reworkCandidate(candidate: MixAssetCandidate): void {
    onReworkAsset({
      kind: candidate.kind,
      assetKey: candidate.id,
      path: candidate.path,
      title: candidate.title,
      sourceType: sourceTypeForCandidate(candidate),
      sourceId: candidate.sourceId,
      promptDraftId: candidate.promptDraftId,
      promptText: candidate.promptText,
      sceneCardIds: candidate.relatedSceneCardIds,
      workflowRunId: candidate.workflowRunId,
    });
  }

  function distillCandidatePrompt(candidate: MixAssetCandidate): void {
    if (candidate.kind === 'overlay') return;
    onDistillAssetPrompt({
      kind: candidate.kind,
      assetKey: candidate.id,
      path: candidate.path,
      title: candidate.title,
      sourceType: sourceTypeForCandidate(candidate),
      sourceId: candidate.sourceId,
      promptDraftId: candidate.promptDraftId,
      promptText: candidate.promptText,
      sceneCardIds: candidate.relatedSceneCardIds,
      workflowRunId: candidate.workflowRunId,
    });
  }

  function exportPackage(): void {
    onExportMixPackage({
      title,
      platform,
      notes,
      assets: selectedCandidates.map((candidate) => ({
        id: candidate.id,
        kind: candidate.kind,
        title: candidate.title,
        path: candidate.path,
        sourceType: sourceTypeForCandidate(candidate),
        sourceId: candidate.sourceId,
        promptDraftId: candidate.promptDraftId,
        promptText: candidate.promptText,
        relatedSceneCardIds: candidate.relatedSceneCardIds,
        durationSeconds: candidate.durationSeconds,
        tags: candidate.tags,
      })),
    });
  }

  return (
    <section className="mix-export-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="flow"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{candidates.length} 个候选素材</span>
            <span className="status-pill ready">{approvedCandidates.length} 个已通过</span>
            <span className="status-pill ready">{selectedCandidates.length} 个已选</span>
            <span className="status-pill">{mixPackages.length} 个历史包</span>
          </div>
        )}
      >
        <div className="module-command-flow">
          <div>
            <p className="eyebrow">交接边界</p>
            <h3>图片 / 15 秒视频素材 / 绿幕图 → 文件夹 + manifest → 第三方混剪软件</h3>
          </div>
          <div className="workflow-actions">
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('image-green-screen')}>
              生成绿幕图
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
        <div className="inline-warning">
          v2 不做时间线、不做混剪渲染、不记录第三方软件任务状态，只准备第三方工具可读取的素材包。
        </div>
      </ModuleCommandCenter>

      <div className="mix-export-layout">
        <main className="panel mix-export-assets-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">素材选择</p>
              <h3>选择要交给混剪软件的资产</h3>
            </div>
            <button
              className="ghost small"
              onClick={() =>
                setSelectedIds(visibleCandidates.filter((candidate) => reviewMap.get(candidate.id)?.status === 'approved').map((candidate) => candidate.id))
              }
            >
              选择已通过
            </button>
          </div>
          <div className="chip-row">
            {[
              { value: 'all' as const, label: `全部 ${candidates.length}` },
              { value: 'image' as const, label: `图片 ${candidates.filter((item) => item.kind === 'image').length}` },
              { value: 'video' as const, label: `视频 ${candidates.filter((item) => item.kind === 'video').length}` },
              { value: 'overlay' as const, label: `绿幕 ${candidates.filter((item) => item.kind === 'overlay').length}` },
            ].map((filter) => (
              <button
                key={filter.value}
                className={`chip-button ${kindFilter === filter.value ? 'active' : ''}`}
                onClick={() => setKindFilter(filter.value)}
              >
                {filter.label}
              </button>
            ))}
          </div>
          <div className="mix-asset-grid">
            {visibleCandidates.map((candidate) => {
              const review = reviewMap.get(candidate.id);
              const approved = review?.status === 'approved';
              const selected = selectedIds.includes(candidate.id) && approved;
              const focused = focusedCandidateId === candidate.id;
              return (
              <article key={candidate.id} className={`mix-asset-card ${focused ? 'active' : ''} ${selected ? 'selected' : ''} ${review?.status ?? 'pending'}`}>
                <button
                  className="mix-asset-preview"
                  type="button"
                  aria-pressed={focused}
                  onClick={() => selectCandidate(candidate)}
                >
                  {candidate.kind === 'video'
                    ? <video src={localAssetUrl(candidate.path)} muted playsInline preload="metadata" />
                    : <img src={localAssetUrl(candidate.path)} alt={candidate.title} />}
                  <span>{approved ? (selected ? '已选' : '可选') : reviewLabel(review?.status)}</span>
                </button>
                <button
                  className="mix-asset-meta"
                  type="button"
                  aria-pressed={focused}
                  onClick={() => selectCandidate(candidate)}
                >
                  <strong>{candidate.title}</strong>
                  <small>{kindLabelForMix(candidate.kind)} · {sourceLabel(candidate.source)} · {candidate.subtitle}</small>
                  <small>
                    {candidate.workflowRunId ? 'SOP 已关联' : 'SOP 未关联'}
                    {candidate.promptDraftId ? ' · Prompt 已关联' : ''}
                    {candidate.relatedSceneCardIds?.length ? ` · 场景 ${candidate.relatedSceneCardIds.length}` : ''}
                    {candidate.reworkSource ? ' · 回炉生成' : ''}
                  </small>
                  <span className={`status-pill ${reviewClass(review?.status)}`}>{reviewLabel(review?.status)}</span>
                  <p>{candidate.promptText || '未记录提示词。'}</p>
                </button>
                <div className="log-actions">
                  <button className="ghost small" onClick={() => onRevealPath(candidate.path)}>打开位置</button>
                  {candidate.promptDraftId ? (
                    <button className="ghost small" onClick={() => onOpenPromptDraft(candidate.promptDraftId as string)}>Prompt</button>
                  ) : null}
                  {candidate.relatedSceneCardIds?.length ? (
                    <button className="ghost small" onClick={() => onOpenSceneCards(candidate.relatedSceneCardIds ?? [])}>场景</button>
                  ) : null}
                  {candidate.workflowRunId ? (
                    <button className="ghost small" onClick={() => onOpenWorkflowRun(candidate.workflowRunId as string)}>SOP</button>
                  ) : null}
                  <button className="ghost small" onClick={() => reviewCandidate(candidate, 'rejected')}>驳回</button>
                  <button className="primary small" onClick={() => reviewCandidate(candidate, 'approved')}>通过</button>
                  {approved && candidate.kind !== 'overlay' ? (
                    <button className="primary small" onClick={() => distillCandidatePrompt(candidate)}>沉淀 Prompt</button>
                  ) : null}
                  <button className="ghost small" onClick={() => reworkCandidate(candidate)}>回炉</button>
                  <button
                    className="ghost small"
                    onClick={() => {
                      if (approved) {
                        toggleExportCandidate(candidate.id);
                        return;
                      }
                      reviewCandidate(candidate, 'approved');
                    }}
                  >
                    {approved ? (selected ? '移除导出' : '加入导出') : '通过并加入'}
                  </button>
                </div>
              </article>
            );})}
            {visibleCandidates.length === 0 ? (
              <div className="empty-state">还没有可导出的素材。先生成图片、生成绿幕文案图，或导入第三方生成的视频文件。</div>
            ) : null}
          </div>
        </main>

        <aside className="panel mix-export-config-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">导出配置</p>
              <h3>manifest 信息</h3>
            </div>
          </div>
          <label>
            <span>包标题</span>
            <input value={title} onChange={(event) => setTitle(event.target.value)} />
          </label>
          <label>
            <span>目标平台</span>
            <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {PLATFORM_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>交接备注</span>
            <textarea value={notes} onChange={(event) => setNotes(event.target.value)} />
          </label>
          <div className="mix-export-counts">
            <span><strong>{selectedCandidates.filter((item) => item.kind === 'image').length}</strong><em>图片</em></span>
            <span><strong>{selectedCandidates.filter((item) => item.kind === 'video').length}</strong><em>视频</em></span>
            <span><strong>{selectedCandidates.filter((item) => item.kind === 'overlay').length}</strong><em>绿幕</em></span>
          </div>
          <button className="primary" disabled={!canExport} onClick={exportPackage}>
            导出混剪包
          </button>
          {selectedCandidates.length === 0 ? (
            <div className="inline-warning">
              混剪包只允许导出已通过审核的素材。点击素材卡会自动通过并加入导出；也可以用“通过并加入”按钮单独处理。
            </div>
          ) : null}
          <div className="mix-manifest-preview">
            <strong>manifest 预览</strong>
            <pre>{JSON.stringify(manifestPreview, null, 2)}</pre>
          </div>
        </aside>

        <aside className="panel mix-package-history-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">历史导出</p>
              <h3>最近混剪包</h3>
            </div>
          </div>
          <div className="mix-package-list">
            {mixPackages.map((pack) => (
              <article key={pack.id} className="mix-package-card">
                <div>
                  <strong>{pack.title}</strong>
                  <small>{new Date(pack.createdAt).toLocaleString()} · {pack.platform} · {pack.assets.length} 个素材</small>
                </div>
                <p>{pack.notes ?? '无备注'}</p>
                <div className="workflow-run-steps">
                  <span>images {pack.assets.filter((asset) => asset.kind === 'image').length}</span>
                  <span>videos {pack.assets.filter((asset) => asset.kind === 'video').length}</span>
                  <span>overlays {pack.assets.filter((asset) => asset.kind === 'overlay').length}</span>
                  {pack.workflowRunId ? <span>SOP 已关联</span> : null}
                </div>
                <div className="log-actions">
                  <button className="ghost small" onClick={() => onRevealPath(pack.packageDir)}>打开文件夹</button>
                  <button className="ghost small" onClick={() => onRevealPath(pack.manifestPath)}>打开 manifest</button>
                  {pack.workflowRunId ? (
                    <button className="ghost small" onClick={() => onOpenWorkflowRun(pack.workflowRunId as string)}>打开 SOP</button>
                  ) : null}
                </div>
              </article>
            ))}
            {mixPackages.length === 0 ? (
              <div className="empty-state">导出后会生成本地文件夹、复制素材并写入 manifest.json。</div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
