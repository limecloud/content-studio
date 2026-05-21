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
import {
  extractGeneratedAssetRefsFromLog,
  extractLocalRefsFromLog,
  extractPromptFromLog,
  fileNameFromPath,
  formatDuration,
  isImageFilePath,
  isPromptDistilledSource,
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

function activeDraftContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
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
        subtitle: `${source.kind} · 手动导入 · ${relatedDraft?.title ?? '未关联 Prompt'}`,
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
  if (status === 'approved') return '已通过';
  if (status === 'rejected') return '已驳回';
  return '待审核';
}

function reviewClass(status?: AssetReviewStatus): string {
  if (status === 'approved') return 'ready';
  if (status === 'rejected') return 'blocked';
  return 'idle';
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

  function reviewAsset(asset: AssetItem, status: AssetReviewStatus): void {
    onReviewAsset({
      assetKey: asset.id,
      workflowRunId: asset.workflowRunId,
      kind: asset.kind,
      sourceType: asset.source === 'generation' ? 'generation-log' : 'input-source',
      sourceId: asset.log?.id ?? asset.inputSource?.id,
      path: asset.path,
      title: asset.title,
      status,
      note: status === 'approved' ? '人工审核通过，可进入混剪包。' : '人工审核驳回，暂不进入混剪包。',
      tags: asset.tags,
    });
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
            <span className="status-pill ready">{approvedCount} 个已通过</span>
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
            { value: 'approved' as const, label: `已通过 ${approvedCount}` },
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
              <small>
                {asset.workflowRunId ? 'SOP 已关联' : 'SOP 未关联'}
                {asset.promptDraftId ? ' · Prompt 已关联' : ''}
                {asset.sceneCardIds?.length ? ` · 场景 ${asset.sceneCardIds.length}` : ''}
                {asset.reworkSource ? ' · 回炉生成' : ''}
              </small>
              <span className={`status-pill ${reviewClass(review?.status)}`}>{reviewLabel(review?.status)}</span>
            </div>
            <div className="log-actions">
              <button className="ghost small" onClick={() => setSelectedAsset(asset)}>详情</button>
              <button className="ghost small" onClick={() => reviewAsset(asset, 'rejected')}>驳回</button>
              <button className="primary small" onClick={() => reviewAsset(asset, 'approved')}>通过</button>
              {review?.status === 'approved' ? (
                <button className="primary small" onClick={() => distillAssetPrompt(asset)}>沉淀 Prompt</button>
              ) : null}
              <button className="ghost small" onClick={() => reworkAsset(asset)}>回炉</button>
              <button className="ghost small" onClick={() => revealAsset(asset)}>打开位置</button>
              {asset.log?.kind === 'image' ? (
                <button className="primary small" onClick={() => asset.log && onReuseImageLogInput(asset.log)}>复用参数</button>
              ) : null}
            </div>
          </article>
        );})}
        {visibleAssets.length === 0 ? (
          <div className="empty-state">
            还没有可展示的成功图片或视频素材。失败、阻塞和纯日志不会进入素材库。
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
                  <strong>关联 Prompt</strong>
                  <em>{selectedAsset.relatedPromptDraft?.title ?? selectedAsset.promptDraftId ?? '未关联'}</em>
                </span>
                <span>
                  <strong>SOP 运行</strong>
                  <em>{selectedAsset.workflowRunId ?? '未关联'}</em>
                </span>
                <span>
                  <strong>场景卡</strong>
                  <em>{selectedAsset.sceneCardIds?.length ? `${selectedAsset.sceneCardIds.length} 张` : '未关联'}</em>
                </span>
                <span>
                  <strong>回炉来源</strong>
                  <em>{selectedAsset.reworkSource?.title ?? selectedAsset.reworkSource?.assetKey ?? '非回炉生成'}</em>
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
                <textarea readOnly value={selectedAsset.prompt || '未记录关联 Prompt。'} />
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
                    打开 Prompt
                  </button>
                ) : null}
                {selectedAsset.sceneCardIds?.length ? (
                  <button className="ghost" onClick={() => onOpenSceneCards(selectedAsset.sceneCardIds ?? [])}>
                    打开场景
                  </button>
                ) : null}
                {selectedAsset.workflowRunId ? (
                  <button className="ghost" onClick={() => onOpenWorkflowRun(selectedAsset.workflowRunId as string)}>
                    打开 SOP
                  </button>
                ) : null}
                <button className="ghost" onClick={() => reviewAsset(selectedAsset, 'rejected')}>
                  驳回素材
                </button>
                <button className="primary" onClick={() => reviewAsset(selectedAsset, 'approved')}>
                  通过审核
                </button>
                {reviewMap.get(selectedAsset.id)?.status === 'approved' ? (
                  <button className="primary" onClick={() => distillAssetPrompt(selectedAsset)}>
                    沉淀 Prompt
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
      </section>
    </section>
  );
}
