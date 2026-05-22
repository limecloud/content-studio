import { useEffect, useMemo, useState } from 'react';
import type {
  AssetReworkSource,
  AssetReviewRecord,
  AssetReviewStatus,
  GenerationLogEntry,
  InputSourceRecord,
  MixPackageAssetInput,
  MixPackageAssetKind,
  MixPackageImportEvidenceResult,
  MixPackageRecord,
  OverlayCardRecord,
  PromptDraft,
  ReviewAssetInput,
} from '../../../../shared/types';
import { isPromptDistilledSource } from '../../../../shared/inputSourcePolicy';
import type { ModuleKey } from '../../app/types';
import {
  extractGeneratedAssetRefsFromLog,
  extractPromptFromLog,
  fileNameFromPath,
  formatDuration,
  isImageFilePath,
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
  onRecordImportEvidence: (input: {
    mixPackageId: string;
    toolName: string;
    importedAt: string;
    operator?: string;
    importedAssetKinds: MixPackageAssetKind[];
    importedFileCount: number;
    manifestImported: boolean;
    timelineCreated: boolean;
    result: MixPackageImportEvidenceResult;
    notes?: string;
    evidenceFiles?: string[];
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

function platformLabelForMix(platform: string): string {
  return PLATFORM_OPTIONS.find((option) => option.value === platform)?.label ?? platform;
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
  onRecordImportEvidence,
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
  const [activeEvidencePackId, setActiveEvidencePackId] = useState('');
  const [evidenceToolName, setEvidenceToolName] = useState('剪映专业版');
  const [evidenceImportedAt, setEvidenceImportedAt] = useState(() => new Date().toISOString());
  const [evidenceOperator, setEvidenceOperator] = useState('剪辑验收');
  const [evidenceKinds, setEvidenceKinds] = useState<MixPackageAssetKind[]>(['video', 'overlay']);
  const [evidenceFileCount, setEvidenceFileCount] = useState(0);
  const [evidenceManifestImported, setEvidenceManifestImported] = useState(true);
  const [evidenceTimelineCreated, setEvidenceTimelineCreated] = useState(true);
  const [evidenceResult, setEvidenceResult] = useState<MixPackageImportEvidenceResult>('verified');
  const [evidenceNotes, setEvidenceNotes] = useState('已按导入说明导入主体素材、绿幕文案图和 manifest，并完成素材用途核对。');
  const [evidenceFilesText, setEvidenceFilesText] = useState('');
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

  function openImportEvidenceForm(pack: MixPackageRecord): void {
    setActiveEvidencePackId((current) => (current === pack.id ? '' : pack.id));
    const evidence = pack.externalImportEvidence;
    setEvidenceToolName(evidence?.toolName ?? '剪映专业版');
    setEvidenceImportedAt(evidence?.importedAt ?? new Date().toISOString());
    setEvidenceOperator(evidence?.operator ?? '剪辑验收');
    setEvidenceKinds(evidence?.importedAssetKinds ?? Array.from(new Set(pack.assets.map((asset) => asset.kind))));
    setEvidenceFileCount(evidence?.importedFileCount ?? pack.assets.length);
    setEvidenceManifestImported(evidence?.manifestImported ?? true);
    setEvidenceTimelineCreated(evidence?.timelineCreated ?? true);
    setEvidenceResult(evidence?.result ?? 'verified');
    setEvidenceNotes(evidence?.notes ?? '已按导入说明导入主体素材、绿幕文案图和 manifest，并完成素材用途核对。');
    setEvidenceFilesText((evidence?.evidenceFiles ?? [])
      .filter((filePath) => filePath !== 'import-check.md')
      .join('\n'));
  }

  function toggleEvidenceKind(kind: MixPackageAssetKind): void {
    setEvidenceKinds((current) =>
      current.includes(kind)
        ? current.filter((item) => item !== kind)
        : [...current, kind],
    );
  }

  function submitImportEvidence(pack: MixPackageRecord): void {
    onRecordImportEvidence({
      mixPackageId: pack.id,
      toolName: evidenceToolName,
      importedAt: evidenceImportedAt,
      operator: evidenceOperator,
      importedAssetKinds: evidenceKinds,
      importedFileCount: evidenceFileCount,
      manifestImported: evidenceManifestImported,
      timelineCreated: evidenceTimelineCreated,
      result: evidenceResult,
      notes: evidenceNotes,
      evidenceFiles: evidenceFilesText
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean),
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
                    {candidate.promptDraftId ? ' · 提示词已关联' : ''}
                    {candidate.relatedSceneCardIds?.length ? ` · 场景 ${candidate.relatedSceneCardIds.length}` : ''}
                    {candidate.reworkSource ? ' · 回炉生成' : ''}
                  </small>
                  <span className={`status-pill ${reviewClass(review?.status)}`}>{reviewLabel(review?.status)}</span>
                  <p>{candidate.promptText || '未记录提示词。'}</p>
                </button>
                <div className="log-actions">
                  <button className="ghost small" onClick={() => onRevealPath(candidate.path)}>打开位置</button>
                  {candidate.promptDraftId ? (
                    <button className="ghost small" onClick={() => onOpenPromptDraft(candidate.promptDraftId as string)}>提示词</button>
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
                    <button className="primary small" onClick={() => distillCandidatePrompt(candidate)}>沉淀提示词</button>
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
                  <small>{new Date(pack.createdAt).toLocaleString()} · {platformLabelForMix(pack.platform)} · {pack.assets.length} 个素材</small>
                </div>
                <p>{pack.notes ?? '无备注'}</p>
                <div className="workflow-run-steps">
                  <span>图片 {pack.assets.filter((asset) => asset.kind === 'image').length}</span>
                  <span>视频 {pack.assets.filter((asset) => asset.kind === 'video').length}</span>
                  <span>绿幕 {pack.assets.filter((asset) => asset.kind === 'overlay').length}</span>
                  {pack.workflowRunId ? <span>SOP 已关联</span> : null}
                  {pack.externalImportEvidence ? <span className="ready">导入证据已登记</span> : <span>待登记导入证据</span>}
                </div>
                {pack.externalImportEvidence ? (
                  <div className="mix-import-evidence-summary">
                    <strong>{pack.externalImportEvidence.toolName}</strong>
                    <span>{pack.externalImportEvidence.importedAssetKinds.map(kindLabelForMix).join(' / ')} · {pack.externalImportEvidence.importedFileCount} 个文件 · {pack.externalImportEvidence.result === 'verified' ? '验收通过' : '需处理'}</span>
                    <small>{pack.externalImportEvidence.evidencePath ?? pack.externalImportEvidencePath}</small>
                  </div>
                ) : null}
                <div className="log-actions">
                  <button className="ghost small" onClick={() => onRevealPath(pack.packageDir)}>打开文件夹</button>
                  <button className="ghost small" onClick={() => onRevealPath(pack.manifestPath)}>打开 manifest</button>
                  {pack.manifestCsvPath ? (
                    <button className="ghost small" onClick={() => onRevealPath(pack.manifestCsvPath as string)}>打开 CSV</button>
                  ) : null}
                  {pack.importGuidePath ? (
                    <button className="ghost small" onClick={() => onRevealPath(pack.importGuidePath as string)}>打开导入说明</button>
                  ) : null}
                  {pack.externalImportEvidencePath ? (
                    <button className="ghost small" onClick={() => onRevealPath(pack.externalImportEvidencePath as string)}>打开导入证据</button>
                  ) : null}
                  <button className="primary small" onClick={() => openImportEvidenceForm(pack)}>
                    {pack.externalImportEvidence ? '更新导入证据' : '登记导入证据'}
                  </button>
                  {pack.workflowRunId ? (
                    <button className="ghost small" onClick={() => onOpenWorkflowRun(pack.workflowRunId as string)}>打开 SOP</button>
                  ) : null}
                </div>
                {activeEvidencePackId === pack.id ? (
                  <div className="mix-import-evidence-form">
                    <label>
                      <span>第三方工具</span>
                      <input value={evidenceToolName} onChange={(event) => setEvidenceToolName(event.target.value)} />
                    </label>
                    <label>
                      <span>导入时间</span>
                      <input value={evidenceImportedAt} onChange={(event) => setEvidenceImportedAt(event.target.value)} />
                    </label>
                    <label>
                      <span>验收人</span>
                      <input value={evidenceOperator} onChange={(event) => setEvidenceOperator(event.target.value)} />
                    </label>
                    <label>
                      <span>导入文件数</span>
                      <input type="number" min={1} value={evidenceFileCount} onChange={(event) => setEvidenceFileCount(Number(event.target.value))} />
                    </label>
                    <div className="mix-import-evidence-kinds">
                      <span>已导入素材</span>
                      {(['video', 'overlay', 'image'] as MixPackageAssetKind[]).map((kind) => (
                        <label key={kind}>
                          <input type="checkbox" checked={evidenceKinds.includes(kind)} onChange={() => toggleEvidenceKind(kind)} />
                          <span>{kindLabelForMix(kind)}</span>
                        </label>
                      ))}
                    </div>
                    <div className="mix-import-evidence-checks">
                      <label>
                        <input type="checkbox" checked={evidenceManifestImported} onChange={(event) => setEvidenceManifestImported(event.target.checked)} />
                        <span>manifest 已导入或已核对</span>
                      </label>
                      <label>
                        <input type="checkbox" checked={evidenceTimelineCreated} onChange={(event) => setEvidenceTimelineCreated(event.target.checked)} />
                        <span>已在混剪工具创建时间线 / 工程</span>
                      </label>
                    </div>
                    <label>
                      <span>验收结果</span>
                      <select value={evidenceResult} onChange={(event) => setEvidenceResult(event.target.value as MixPackageImportEvidenceResult)}>
                        <option value="verified">验收通过</option>
                        <option value="needs-fix">需要修正</option>
                        <option value="rejected">不通过</option>
                      </select>
                    </label>
                    <label>
                      <span>证据文件</span>
                      <textarea value={evidenceFilesText} onChange={(event) => setEvidenceFilesText(event.target.value)} placeholder="可选。每行一个截图、录屏说明或验收记录文件名。保存时会自动生成 import-check.md。" />
                    </label>
                    <label>
                      <span>导入备注</span>
                      <textarea value={evidenceNotes} onChange={(event) => setEvidenceNotes(event.target.value)} />
                    </label>
                    <div className="workflow-actions left">
                      <button
                        className="primary small"
                        disabled={busy || !workspaceReady || !evidenceToolName.trim() || evidenceKinds.length === 0 || evidenceFileCount <= 0}
                        onClick={() => submitImportEvidence(pack)}
                      >
                        保存导入证据
                      </button>
                      <button className="ghost small" onClick={() => setActiveEvidencePackId('')}>收起</button>
                    </div>
                  </div>
                ) : null}
              </article>
            ))}
            {mixPackages.length === 0 ? (
              <div className="empty-state">导出后会生成本地文件夹、复制素材并写入 manifest.json / manifest.csv / import-guide.md。</div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
