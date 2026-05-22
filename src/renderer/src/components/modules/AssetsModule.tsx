import { useEffect, useMemo, useState } from 'react';
import type {
  AssetReworkSource,
  AssetReviewRecord,
  AssetReviewStatus,
  GenerationLogEntry,
  InputSourceRecord,
  PromptDraft,
  ReviewAssetInput,
} from '../../../../shared/types';
import { isPromptDistilledSource } from '../../../../shared/inputSourcePolicy';
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
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface AssetsModuleProps {
  variant?: 'library' | 'compliance' | 'retouch';
  logsCount: number;
  logs: GenerationLogEntry[];
  inputSources: InputSourceRecord[];
  promptDrafts: PromptDraft[];
  assetReviews: AssetReviewRecord[];
  copiedLogId: string | null;
  onCopyLogPrompt: (log: GenerationLogEntry) => void;
  onRevealLogPath: (log: GenerationLogEntry) => void;
  onRevealPath: (path: string) => void;
  onReuseImageLogInput: (log: GenerationLogEntry) => void;
  onReviewAsset: (input: Omit<ReviewAssetInput, 'workspacePath'>) => void;
  onReworkAsset: (input: {
    kind: AssetKind;
    assetKey?: string;
    path: string;
    title?: string;
    sourceType: 'generation-log' | 'input-source' | 'manual';
    sourceId?: string;
    promptDraftId?: string;
    promptText?: string;
    sceneCardIds?: string[];
    workflowRunId?: string;
  }) => void;
  onDistillAssetPrompt: (input: {
    kind: AssetKind;
    assetKey?: string;
    path: string;
    title?: string;
    sourceType: 'generation-log' | 'input-source' | 'manual';
    sourceId?: string;
    promptDraftId?: string;
    promptText?: string;
    sceneCardIds?: string[];
    workflowRunId?: string;
  }) => void;
  onOpenMixExport: () => void;
  onOpenPromptDraft: (draftId: string) => void;
  onOpenSceneCards: (sceneCardIds: string[]) => void;
  onOpenWorkflowRun: (workflowRunId: string) => void;
}

type AssetKind = 'image' | 'video';
type AssetSource = 'generation' | 'imported';

interface AssetItem {
  id: string;
  kind: AssetKind;
  source: AssetSource;
  path: string;
  title: string;
  subtitle: string;
  prompt: string;
  createdAt: string;
  tags: string[];
  model?: string;
  durationMs?: number;
  promptDraftId?: string;
  sceneCardIds?: string[];
  workflowRunId?: string;
  reworkSource?: AssetReworkSource;
  log?: GenerationLogEntry;
  inputSource?: InputSourceRecord;
  relatedPromptDraft?: PromptDraft;
}

type ReviewTone = 'ready' | 'warning' | 'blocked' | 'idle';

interface ReviewCheckItem {
  text: string;
  tone: ReviewTone;
}

interface AssetQualityItem {
  text: string;
  tone: ReviewTone;
  source: string;
}

interface AssetReviewDecision {
  source: string;
  status: string;
  statusClass: string;
  checks: ReviewCheckItem[];
  qualityItems: AssetQualityItem[];
  nextAction: string;
  lineage: string[];
}

const REJECTION_REASONS = [
  '产品不一致',
  '字体模糊',
  '文案不合规',
  '风格不匹配',
  '画面构图不可用',
];

function activeDraftContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function normalizeQualityText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  const message = recordValue(value, 'message');
  return typeof message === 'string' ? message.trim() : '';
}

function stringItems(value: unknown): string[] {
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  if (!Array.isArray(value)) return [];
  return value.map(normalizeQualityText).filter(Boolean);
}

function qualityToneFromLevel(level: unknown): ReviewTone {
  if (level === 'risk') return 'blocked';
  if (level === 'warning') return 'warning';
  return 'ready';
}

function addQualityItem(items: AssetQualityItem[], item: AssetQualityItem): void {
  if (!item.text.trim()) return;
  if (items.some((existing) => existing.text === item.text && existing.source === item.source)) return;
  items.push(item);
}

function addStringItems(
  items: AssetQualityItem[],
  values: string[],
  source: string,
  tone: ReviewTone,
): void {
  values.forEach((text) => addQualityItem(items, { text, source, tone }));
}

function addPublishChecks(items: AssetQualityItem[], value: unknown): void {
  if (!Array.isArray(value)) return;
  value.forEach((entry) => {
    const text = normalizeQualityText(entry);
    if (!text) return;
    addQualityItem(items, {
      text,
      source: '发布检查',
      tone: qualityToneFromLevel(recordValue(entry, 'level')),
    });
  });
}

function promptSectionKey(line: string): string {
  return line.trim().replace(/[：:]$/, '');
}

function normalizePromptListLine(line: string): string {
  return line
    .replace(/^[-*]\s*/, '')
    .replace(/^\d+[.)、]\s*/, '')
    .trim();
}

function isPromptSectionHeading(line: string): boolean {
  const clean = line.trim();
  if (!clean) return false;
  if (/^[-*]\s+/.test(clean) || /^\d+[.)、]\s+/.test(clean)) return false;
  return /[：:]$/.test(clean);
}

function promptSectionItems(content: string, sectionNames: string[]): string[] {
  const sectionKeys = new Set(sectionNames.map((name) => promptSectionKey(name)));
  const items: string[] = [];
  let collecting = false;

  content.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) return;
    if (sectionKeys.has(promptSectionKey(line))) {
      collecting = true;
      return;
    }
    if (!collecting) return;
    if (isPromptSectionHeading(line)) {
      collecting = false;
      return;
    }
    const item = normalizePromptListLine(line);
    if (item) items.push(item);
  });

  return items;
}

function qualityItemsFromOutput(output: unknown): AssetQualityItem[] {
  const items: AssetQualityItem[] = [];
  const analysis = recordValue(output, 'analysis');

  addStringItems(items, stringItems(recordValue(output, 'qualityChecklist')), '质检通过项', 'ready');
  addStringItems(items, stringItems(recordValue(analysis, 'qualityChecklist')), '质检通过项', 'ready');
  addStringItems(items, stringItems(recordValue(output, 'sourceWarnings')), '来源提醒', 'warning');
  addStringItems(items, stringItems(recordValue(analysis, 'sourceWarnings')), '来源提醒', 'warning');
  addStringItems(items, stringItems(recordValue(output, 'risks')), '风险项', 'blocked');
  addStringItems(items, stringItems(recordValue(analysis, 'risks')), '风险项', 'blocked');
  addPublishChecks(items, recordValue(output, 'publishCheck'));
  addPublishChecks(items, recordValue(analysis, 'publishCheck'));

  return items;
}

function qualityItemsFromDraft(draft?: PromptDraft): AssetQualityItem[] {
  const content = activeDraftContent(draft);
  if (!content.trim()) return [];
  const items: AssetQualityItem[] = [];

  addStringItems(items, promptSectionItems(content, ['质量检查', '下游检查清单']), '质检通过项', 'ready');
  addStringItems(items, promptSectionItems(content, ['风险与边界']), '风险项', 'blocked');
  addStringItems(items, promptSectionItems(content, ['来源与合规提醒']), '来源提醒', 'warning');

  return items;
}

function assetQualityItems(asset: AssetItem): AssetQualityItem[] {
  const items = [
    ...qualityItemsFromOutput(asset.log?.output),
    ...qualityItemsFromDraft(asset.relatedPromptDraft),
  ];
  const uniqueItems: AssetQualityItem[] = [];
  items.forEach((item) => addQualityItem(uniqueItems, item));

  if (uniqueItems.length > 0) return uniqueItems;
  return [{
    text: '未接入自动质检，按人工审核清单确认',
    tone: 'warning',
    source: '人工确认',
  }];
}

function importedAssetRefs(source: InputSourceRecord): string[] {
  const refs = [
    source.sourcePath,
    ...source.artifactRefs,
  ].filter((item): item is string => Boolean(item));
  return Array.from(new Set(refs)).filter((path) => isImageFilePath(path) || isVideoFilePath(path));
}

function relatedDraftForLog(log: GenerationLogEntry, promptDrafts: PromptDraft[]): PromptDraft | undefined {
  if (!log.workflowRunId && !log.sceneCardIds?.length) return undefined;
  return promptDrafts.find((draft) => {
    if (log.workflowRunId && draft.workflowRunId === log.workflowRunId) return true;
    return Boolean(log.sceneCardIds?.some((sceneId) => draft.sceneCardIds?.includes(sceneId)));
  });
}

function collectGeneratedAssets(logs: GenerationLogEntry[], promptDrafts: PromptDraft[]): AssetItem[] {
  return logs.flatMap((log) => {
    if (log.status !== 'succeeded' || (log.kind !== 'image' && log.kind !== 'video')) return [];
    const relatedDraft = relatedDraftForLog(log, promptDrafts);
    return extractGeneratedAssetRefsFromLog(log)
      .filter((path) => isImageFilePath(path) || isVideoFilePath(path))
      .map((path, index) => ({
        id: `generated:${log.id}:${index}:${path}`,
        kind: isVideoFilePath(path) ? 'video' : 'image',
        source: 'generation' as const,
        path,
        title: fileNameFromPath(path),
        subtitle: `${kindLabel(log.kind)} · ${log.model ?? 'local'} · ${formatDuration(log.durationMs)}`,
        prompt: extractPromptFromLog(log),
        createdAt: log.createdAt,
        tags: [kindLabel(log.kind), log.model ?? '', log.status].filter(Boolean),
        model: log.model,
        durationMs: log.durationMs,
        promptDraftId: relatedDraft?.id,
        sceneCardIds: log.sceneCardIds ?? relatedDraft?.sceneCardIds ?? [],
        workflowRunId: log.workflowRunId ?? relatedDraft?.workflowRunId,
        reworkSource: log.reworkSource,
        log,
        relatedPromptDraft: relatedDraft,
      }));
  });
}

function collectImportedAssets(
  inputSources: InputSourceRecord[],
  promptDrafts: PromptDraft[],
): AssetItem[] {
  return inputSources.flatMap((source) => {
    if (source.purpose !== 'successful-asset') return [];
    if (isPromptDistilledSource(source)) return [];
    return importedAssetRefs(source).map((path, index) => {
      const relatedDraft = source.relatedPromptDraftId
        ? promptDrafts.find((draft) => draft.id === source.relatedPromptDraftId)
        : undefined;
      return {
        id: `imported:${source.id}:${index}:${path}`,
        kind: isVideoFilePath(path) ? 'video' : 'image',
        source: 'imported' as const,
        path,
        title: source.title || fileNameFromPath(path),
        subtitle: `${isVideoFilePath(path) ? '视频' : '图片'} · 手动导入 · ${relatedDraft?.title ?? '未关联提示词'}`,
        prompt: activeDraftContent(relatedDraft) || source.summary || '',
        createdAt: source.createdAt,
        tags: Array.from(new Set(['手动导入', source.kind, ...source.tags].filter(Boolean))),
        promptDraftId: relatedDraft?.id,
        sceneCardIds: source.relatedSceneCardIds ?? relatedDraft?.sceneCardIds ?? [],
        workflowRunId: source.workflowRunId ?? relatedDraft?.workflowRunId,
        inputSource: source,
        relatedPromptDraft: relatedDraft,
      };
    });
  });
}

function reviewLabel(status?: AssetReviewStatus): string {
  if (status === 'approved') return '已通过并入库';
  if (status === 'rejected') return '已驳回';
  return '待审核';
}

function reviewClass(status?: AssetReviewStatus): string {
  if (status === 'approved') return 'ready';
  if (status === 'rejected') return 'blocked';
  return 'idle';
}

function sourceLabel(asset: AssetItem): string {
  if (asset.source === 'generation') return asset.kind === 'video' ? '生成服务视频' : '生成服务图片';
  if (asset.kind === 'video') return '第三方成品视频';
  return '手动导入素材';
}

function lineageSummary(asset: AssetItem): string[] {
  return [
    asset.workflowRunId ? '任务可追溯' : '无任务来源',
    asset.promptDraftId ? '提示词可追溯' : '未关联提示词',
    asset.sceneCardIds?.length ? `场景 ${asset.sceneCardIds.length} 张` : '未关联场景',
    asset.reworkSource ? '回炉生成' : '首次候选',
  ];
}

function promptTraceLabel(asset: AssetItem): string {
  if (asset.relatedPromptDraft?.title) return asset.relatedPromptDraft.title;
  if (asset.promptDraftId) return '已关联提示词，可打开查看';
  return '未关联';
}

function workflowTraceLabel(asset: AssetItem): string {
  return asset.workflowRunId ? '已关联运行记录，可打开查看' : '未关联';
}

function reworkSourceLabel(asset: AssetItem): string {
  if (!asset.reworkSource) return '非回炉生成';
  return asset.reworkSource.title || '原素材记录';
}

function assetReviewDecision(asset: AssetItem, review?: AssetReviewRecord): AssetReviewDecision {
  const hasSource = Boolean(asset.log || asset.inputSource || asset.workflowRunId);
  const hasPrompt = Boolean(asset.promptDraftId || asset.prompt.trim());
  const hasScene = Boolean(asset.sceneCardIds?.length);
  const hasModel = Boolean(asset.model);
  const qualityItems = assetQualityItems(asset);
  const hasQualityEvidence = qualityItems.some((item) => item.source !== '人工确认');
  const hasBlockedQuality = qualityItems.some((item) => item.tone === 'blocked');
  const hasWarningQuality = qualityItems.some((item) => item.tone === 'warning');
  const status = reviewLabel(review?.status);
  const checks: ReviewCheckItem[] = [
    {
      text: hasSource ? '来源可追溯' : '缺少来源记录',
      tone: hasSource ? 'ready' : 'blocked',
    },
    {
      text: hasPrompt ? '提示词可追溯' : '缺少提示词，建议先补充',
      tone: hasPrompt ? 'ready' : 'warning',
    },
    {
      text: hasScene ? '已关联业务场景' : '未关联场景，适合单次审核',
      tone: hasScene ? 'ready' : 'idle',
    },
    {
      text: asset.source === 'generation'
        ? (hasModel ? '模型参数已记录' : '模型参数未记录')
        : '第三方成品需人工确认画质、版权和内容一致性',
      tone: asset.source === 'generation' && !hasModel ? 'warning' : 'idle',
    },
    {
      text: hasQualityEvidence
        ? (hasBlockedQuality ? '质检发现风险，需先处理' : '质检结果已记录')
        : '未接入自动质检，需人工确认',
      tone: hasBlockedQuality ? 'blocked' : hasWarningQuality ? 'warning' : hasQualityEvidence ? 'ready' : 'warning',
    },
  ];

  if (review?.status === 'approved') {
    checks.push({
      text: '已通过审核并入库，可进入混剪包或沉淀提示词',
      tone: 'ready',
    });
  } else if (review?.status === 'rejected') {
    checks.push({
      text: review.note ? `已驳回：${review.note}` : '已驳回，等待回炉重做',
      tone: 'blocked',
    });
  } else {
    checks.push({
      text: '待人工确认文字、主体、合规表达和平台适配',
      tone: 'warning',
    });
  }

  const nextAction = review?.status === 'approved'
    ? '已入库。下一步可进入混剪包，或把成功结果沉淀为下一次可复用的提示词。'
    : review?.status === 'rejected'
      ? '回炉重做，复用原提示词和来源生成新的候选素材。'
      : hasBlockedQuality
        ? '先处理质检风险；如果风险影响发布，填写驳回原因并回炉重做。'
        : '先核对预览、来源、提示词、参数和质检结果，再选择通过或驳回。';

  return {
    source: sourceLabel(asset),
    status,
    statusClass: reviewClass(review?.status),
    checks,
    qualityItems,
    nextAction,
    lineage: lineageSummary(asset),
  };
}

export function AssetsModule({
  variant = 'library',
  logsCount,
  logs,
  inputSources,
  promptDrafts,
  assetReviews,
  copiedLogId,
  onCopyLogPrompt,
  onRevealLogPath,
  onRevealPath,
  onReuseImageLogInput,
  onReviewAsset,
  onReworkAsset,
  onDistillAssetPrompt,
  onOpenMixExport,
  onOpenPromptDraft,
  onOpenSceneCards,
  onOpenWorkflowRun,
}: AssetsModuleProps) {
  const [assetFilter, setAssetFilter] = useState<AssetKind | 'all'>(variant === 'library' ? 'all' : 'image');
  const [reviewFilter, setReviewFilter] = useState<AssetReviewStatus | 'all'>('all');
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null);
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);
  const [rejectingAsset, setRejectingAsset] = useState<AssetItem | null>(null);
  const [rejectReason, setRejectReason] = useState(REJECTION_REASONS[0]);
  const [rejectDetail, setRejectDetail] = useState('');
  const reviewMap = useMemo(
    () => new Map(assetReviews.map((review) => [review.assetKey, review])),
    [assetReviews],
  );
  const assets = useMemo(
    () => [
      ...collectImportedAssets(inputSources, promptDrafts),
      ...collectGeneratedAssets(logs, promptDrafts),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [inputSources, logs, promptDrafts],
  );
  const visibleAssets = useMemo(
    () => assets.filter((asset) => {
      const kindMatched = assetFilter === 'all' || asset.kind === assetFilter;
      const reviewStatus = reviewMap.get(asset.id)?.status ?? 'pending';
      const reviewMatched = reviewFilter === 'all' || reviewStatus === reviewFilter;
      return kindMatched && reviewMatched;
    }),
    [assetFilter, assets, reviewFilter, reviewMap],
  );
  const imageCount = assets.filter((asset) => asset.kind === 'image').length;
  const videoCount = assets.filter((asset) => asset.kind === 'video').length;
  const importedCount = assets.filter((asset) => asset.source === 'imported').length;
  const approvedCount = assets.filter((asset) => reviewMap.get(asset.id)?.status === 'approved').length;
  const rejectedCount = assets.filter((asset) => reviewMap.get(asset.id)?.status === 'rejected').length;
  const selectedReview = selectedAsset ? reviewMap.get(selectedAsset.id) : undefined;
  const selectedDecision = selectedAsset ? assetReviewDecision(selectedAsset, selectedReview) : null;
  const header = {
    library: {
      eyebrow: '素材沉淀',
      title: '素材库',
      description: '成功生成或手动导入的图片 / 视频素材在这里审核、复用、回炉和进入混剪包。',
    },
    compliance: {
      eyebrow: '图片审核',
      title: '合规检测 / 人工审核台',
      description: '先把生成图和导入素材拉进同一个审核台，逐张标记通过、驳回或回炉，不伪造自动检测结论。',
    },
    retouch: {
      eyebrow: '图片回炉',
      title: '图片精修 / 回炉',
      description: '选择问题图片后回到图片生成模块复用原 Prompt 和参考图，保留原图、审核状态和重做路径。',
    },
  }[variant];

  useEffect(() => {
    if (variant === 'library') return;
    setAssetFilter('image');
  }, [variant]);

  async function copyAssetPrompt(asset: AssetItem): Promise<void> {
    if (asset.log) {
      onCopyLogPrompt(asset.log);
      return;
    }
    await navigator.clipboard.writeText(asset.prompt);
    setCopiedAssetId(asset.id);
    window.setTimeout(
      () => setCopiedAssetId((current) => (current === asset.id ? null : current)),
      1400,
    );
  }

  function revealAsset(asset: AssetItem): void {
    if (asset.log) onRevealLogPath(asset.log);
    else onRevealPath(asset.path);
  }

  function reviewAsset(asset: AssetItem, status: AssetReviewStatus, note?: string): void {
    onReviewAsset({
      assetKey: asset.id,
      workflowRunId: asset.workflowRunId,
      kind: asset.kind,
      sourceType: asset.source === 'generation' ? 'generation-log' : 'input-source',
      sourceId: asset.log?.id ?? asset.inputSource?.id,
      path: asset.path,
      title: asset.title,
      status,
      note: note ?? (
        status === 'approved' ? '人工审核通过并入库，可进入混剪包。' : '人工审核驳回，需要回炉重做后再进入混剪包。'
      ),
      tags: asset.tags,
    });
  }

  function openRejectDialog(asset: AssetItem): void {
    setRejectingAsset(asset);
    setRejectReason(REJECTION_REASONS[0]);
    setRejectDetail('');
  }

  function confirmRejectAsset(): void {
    if (!rejectingAsset) return;
    const detail = rejectDetail.trim();
    const note = detail ? `${rejectReason}：${detail}` : rejectReason;
    reviewAsset(rejectingAsset, 'rejected', note);
    setRejectingAsset(null);
    setRejectDetail('');
  }

  function reworkAsset(asset: AssetItem): void {
    onReworkAsset({
      kind: asset.kind,
      assetKey: asset.id,
      path: asset.path,
      title: asset.title,
      sourceType: asset.source === 'generation' ? 'generation-log' : 'input-source',
      sourceId: asset.log?.id ?? asset.inputSource?.id,
      promptDraftId: asset.promptDraftId,
      promptText: asset.prompt,
      sceneCardIds: asset.sceneCardIds,
      workflowRunId: asset.workflowRunId,
    });
  }

  function distillAssetPrompt(asset: AssetItem): void {
    onDistillAssetPrompt({
      kind: asset.kind,
      assetKey: asset.id,
      path: asset.path,
      title: asset.title,
      sourceType: asset.source === 'generation' ? 'generation-log' : 'input-source',
      sourceId: asset.log?.id ?? asset.inputSource?.id,
      promptDraftId: asset.promptDraftId,
      promptText: asset.prompt,
      sceneCardIds: asset.sceneCardIds,
      workflowRunId: asset.workflowRunId,
    });
  }

  return (
    <section className="asset-library-workbench">
      <ModuleCommandCenter
        eyebrow={header.eyebrow}
        title={header.title}
        description={header.description}
        density="managed"
        actions={(
          <div className="workflow-actions">
            <span className="status-pill">{assets.length} 个素材</span>
            <span className="status-pill ready">{approvedCount} 个已入库</span>
            <button className="ghost small" disabled={approvedCount === 0} onClick={onOpenMixExport}>
              去混剪包
            </button>
          </div>
        )}
      >
        <div className="chip-row module-command-filters">
          {[
            { value: 'all' as const, label: `全部 ${assets.length}` },
            { value: 'image' as const, label: `图片 ${imageCount}` },
            { value: 'video' as const, label: `视频 ${videoCount}` },
          ].map((filter) => (
            <button
              key={filter.value}
              className={`chip-button ${assetFilter === filter.value ? 'active' : ''}`}
              onClick={() => setAssetFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
          <span className="status-pill ready">手动导入 {importedCount}</span>
          {[
            { value: 'all' as const, label: `审核全部 ${assets.length}` },
            { value: 'pending' as const, label: `待审核 ${assets.length - approvedCount - rejectedCount}` },
            { value: 'approved' as const, label: `已入库 ${approvedCount}` },
            { value: 'rejected' as const, label: `已驳回 ${rejectedCount}` },
          ].map((filter) => (
            <button
              key={filter.value}
              className={`chip-button ${reviewFilter === filter.value ? 'active' : ''}`}
              onClick={() => setReviewFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </ModuleCommandCenter>

      <section className="panel full-panel asset-library-panel">
      <div className="asset-gallery">
        {visibleAssets.map((asset) => {
          const review = reviewMap.get(asset.id);
          const decision = assetReviewDecision(asset, review);
          return (
          <article key={asset.id} className={`asset-tile ${review?.status ?? 'pending'}`}>
            <button className="asset-preview-button" onClick={() => setSelectedAsset(asset)}>
              {asset.kind === 'image'
                ? <img src={localAssetUrl(asset.path)} alt={fileNameFromPath(asset.path)} />
                : <video src={localAssetUrl(asset.path)} muted playsInline preload="metadata" />}
            </button>
            <div className="asset-tile-meta">
              <strong>{asset.title}</strong>
              <small>{asset.subtitle}</small>
              <small>{decision.lineage.join(' · ')}</small>
              <span className={`status-pill ${decision.statusClass}`}>{decision.status}</span>
            </div>
            <div className="log-actions">
              <button className="ghost small" onClick={() => setSelectedAsset(asset)}>详情</button>
              <button className="ghost small" onClick={() => openRejectDialog(asset)}>驳回素材</button>
              <button className="primary small" onClick={() => reviewAsset(asset, 'approved')}>通过并入库</button>
              {review?.status === 'approved' ? (
                <button className="primary small" onClick={() => distillAssetPrompt(asset)}>沉淀提示词</button>
              ) : null}
              <button className="ghost small" onClick={() => reworkAsset(asset)}>回炉重做</button>
              <button className="ghost small" onClick={() => revealAsset(asset)}>打开位置</button>
              {asset.log?.kind === 'image' ? (
                <button className="primary small" onClick={() => asset.log && onReuseImageLogInput(asset.log)}>复用参数</button>
              ) : null}
            </div>
          </article>
        );})}
        {visibleAssets.length === 0 ? (
          <div className="empty-state">
            还没有可展示的成功图片或视频素材。失败、待配置和纯日志不会进入素材库。
            手动导入的第三方成品视频会在关联 Prompt 后展示在这里。
            {logsCount > 0 ? ` 当前已有 ${logsCount} 条生成记录。` : ''}
          </div>
        ) : null}
      </div>

      {selectedAsset ? (
        <div
          className="detail-dialog-backdrop"
          role="presentation"
          onClick={() => setSelectedAsset(null)}
        >
          <article
            className="detail-dialog-card asset-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="素材详情"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="detail-dialog-header">
              <div>
                <p className="eyebrow">{selectedAsset.kind === 'image' ? '图片素材' : '视频素材'}</p>
                <h3>{fileNameFromPath(selectedAsset.path)}</h3>
              </div>
              <button className="ghost small" onClick={() => setSelectedAsset(null)}>关闭</button>
            </div>
            <div className="detail-dialog-body asset-detail-body">
              <div className="asset-detail-preview">
                {selectedAsset.kind === 'image'
                  ? <img src={localAssetUrl(selectedAsset.path)} alt={fileNameFromPath(selectedAsset.path)} />
                  : <video src={localAssetUrl(selectedAsset.path)} controls />}
              </div>
              {selectedDecision ? (
                <section className="asset-review-summary" aria-label="审核决策">
                  <div className="asset-review-summary-head">
                    <div>
                      <p className="eyebrow">审核决策</p>
                      <h4>{selectedDecision.source}</h4>
                    </div>
                    <span className={`status-pill ${selectedDecision.statusClass}`}>{selectedDecision.status}</span>
                  </div>
                  <div className="asset-review-checklist">
                    {selectedDecision.checks.map((item) => (
                      <span key={item.text} className={item.tone}>
                        {item.text}
                      </span>
                    ))}
                  </div>
                  <div className="asset-quality-section" aria-label="质检结果">
                    <strong>质检结果</strong>
                    <div className="asset-quality-list">
                      {selectedDecision.qualityItems.map((item) => (
                        <span key={`${item.source}:${item.text}`} className={`asset-quality-item ${item.tone}`}>
                          <em>{item.source}</em>
                          {item.text}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="asset-review-next">
                    <strong>建议下一步</strong>
                    <p>{selectedDecision.nextAction}</p>
                  </div>
                  <div className="asset-review-actions">
                    <button className="ghost" onClick={() => openRejectDialog(selectedAsset)}>
                      驳回素材
                    </button>
                    <button className="primary" onClick={() => reviewAsset(selectedAsset, 'approved')}>
                      通过并入库
                    </button>
                    <button className="ghost" onClick={() => reworkAsset(selectedAsset)}>
                      回炉重做
                    </button>
                    {selectedReview?.status === 'approved' ? (
                      <button className="primary" onClick={onOpenMixExport}>
                        去混剪包
                      </button>
                    ) : null}
                  </div>
                </section>
              ) : null}
              <div className="asset-lineage-summary">
                <strong>追溯信息</strong>
                <div>
                  {selectedDecision?.lineage.map((item) => (
                    <span key={item}>{item}</span>
                  ))}
                </div>
              </div>
              <div className="asset-log-detail-grid">
                <span>
                  <strong>来源</strong>
                  <em>{selectedAsset.log?.title ?? selectedAsset.inputSource?.title ?? '手动导入'}</em>
                </span>
                <span>
                  <strong>模型</strong>
                  <em>{selectedAsset.model ?? (selectedAsset.source === 'imported' ? '第三方平台 / 手动导入' : '未记录')}</em>
                </span>
                <span>
                  <strong>关联提示词</strong>
                  <em>{promptTraceLabel(selectedAsset)}</em>
                </span>
                <span>
                  <strong>关联运行记录</strong>
                  <em>{workflowTraceLabel(selectedAsset)}</em>
                </span>
                <span>
                  <strong>场景卡</strong>
                  <em>{selectedAsset.sceneCardIds?.length ? `${selectedAsset.sceneCardIds.length} 张` : '未关联'}</em>
                </span>
                <span>
                  <strong>回炉来源</strong>
                  <em>{reworkSourceLabel(selectedAsset)}</em>
                </span>
                <span>
                  <strong>入库时间</strong>
                  <em>{new Date(selectedAsset.createdAt).toLocaleString()}</em>
                </span>
                <span>
                  <strong>审核状态</strong>
                  <em>{reviewLabel(reviewMap.get(selectedAsset.id)?.status)}</em>
                </span>
                <span className="wide">
                  <strong>路径</strong>
                  <em>{selectedAsset.path}</em>
                </span>
              </div>
              <label className="image-result-prompt">
                <span>提示词</span>
                <textarea readOnly value={selectedAsset.prompt || '未记录关联提示词。'} />
              </label>
              <div className="modal-actions">
                <button className="ghost" onClick={() => void copyAssetPrompt(selectedAsset)}>
                  {copiedLogId === selectedAsset.log?.id || copiedAssetId === selectedAsset.id ? '已复制' : '复制提示词'}
                </button>
                <button className="ghost" onClick={() => revealAsset(selectedAsset)}>
                  打开位置
                </button>
                {selectedAsset.promptDraftId ? (
                  <button className="ghost" onClick={() => onOpenPromptDraft(selectedAsset.promptDraftId as string)}>
                    打开提示词
                  </button>
                ) : null}
                {selectedAsset.sceneCardIds?.length ? (
                  <button className="ghost" onClick={() => onOpenSceneCards(selectedAsset.sceneCardIds ?? [])}>
                    打开场景
                  </button>
                ) : null}
                {selectedAsset.workflowRunId ? (
                  <button className="ghost" onClick={() => onOpenWorkflowRun(selectedAsset.workflowRunId as string)}>
                    打开运行记录
                  </button>
                ) : null}
                <button className="ghost" onClick={() => openRejectDialog(selectedAsset)}>
                  驳回素材
                </button>
                <button className="primary" onClick={() => reviewAsset(selectedAsset, 'approved')}>
                  通过并入库
                </button>
                {reviewMap.get(selectedAsset.id)?.status === 'approved' ? (
                  <button className="primary" onClick={() => distillAssetPrompt(selectedAsset)}>
                    沉淀提示词
                  </button>
                ) : null}
                <button className="ghost" onClick={() => reworkAsset(selectedAsset)}>
                  回炉重做
                </button>
                {reviewMap.get(selectedAsset.id)?.status === 'approved' ? (
                  <button className="primary" onClick={onOpenMixExport}>
                    去混剪包
                  </button>
                ) : null}
                {selectedAsset.log?.kind === 'image' ? (
                  <button
                    className="primary"
                    onClick={() => {
                      setSelectedAsset(null);
                      onReuseImageLogInput(selectedAsset.log as GenerationLogEntry);
                    }}
                  >
                    复用图片参数
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        </div>
      ) : null}
      {rejectingAsset ? (
        <div
          className="detail-dialog-backdrop"
          role="presentation"
          onClick={() => setRejectingAsset(null)}
        >
          <article
            className="detail-dialog-card asset-reject-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="填写驳回原因"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="detail-dialog-header">
              <div>
                <p className="eyebrow">填写驳回原因</p>
                <h3>{rejectingAsset.title}</h3>
              </div>
              <button className="ghost small" onClick={() => setRejectingAsset(null)}>取消</button>
            </div>
            <div className="asset-reject-body">
              <div className="asset-reject-reasons">
                {REJECTION_REASONS.map((reason) => (
                  <button
                    key={reason}
                    className={`chip-button ${rejectReason === reason ? 'active' : ''}`}
                    onClick={() => setRejectReason(reason)}
                  >
                    {reason}
                  </button>
                ))}
              </div>
              <label className="image-result-prompt">
                <span>补充说明</span>
                <textarea
                  value={rejectDetail}
                  placeholder="说明需要回炉重做的具体问题，回炉时会自动带入提示词。"
                  onChange={(event) => setRejectDetail(event.target.value)}
                />
              </label>
              <div className="modal-actions">
                <button className="ghost" onClick={() => setRejectingAsset(null)}>取消</button>
                <button className="primary" onClick={confirmRejectAsset}>确认驳回</button>
              </div>
            </div>
          </article>
        </div>
      ) : null}
      </section>
    </section>
  );
}
