import { randomUUID } from 'node:crypto';
import type {
  BrandCommandActionOutcome,
  BrandCommandActionRecord,
  BrandCommandCenterRecord,
  BrandCommandQueueItem,
  BuildBrandCommandCenterInput,
  ContentMaterialCoverageResult,
  ContentKnowledgeMapCoverageDimensions,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentReviewTask,
  CreateSceneCardFromContentInput,
  RecordBrandCommandActionInput,
  RefreshBrandCommandActionsInput,
  StartWorkflowRunInput,
} from '../../shared/types';
import { buildBrandCommandCenterDraft } from './brandCommandCenterBuilder';
import { checkBrandCommandExecution } from './brandCommandExecutionPolicy';
import { BrandCommandCenterStore } from './brandCommandCenterStore';
import type { BrandCommandActionSyncAdapter, BrandCommandExecutionQueueSyncAdapter, ContentReviewTaskSyncAdapter } from './buguContentWorkspaceSyncAdapter';
import { ContentMaterialFeedbackService } from './contentMaterialFeedbackService';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import type { ContentKnowledgeMapSyncPort } from './contentKnowledgeMapSyncPort';
import { ContentReviewTaskStore } from './contentReviewTaskStore';
import { PromptDraftStore } from './promptDraftStore';
import { SceneLibraryStore } from './sceneLibraryStore';
import { WorkflowStore } from './workflowStore';

function outcomeFor(queueItem: BrandCommandQueueItem): BrandCommandActionOutcome {
  if (queueItem.status === 'ready' && queueItem.actionType === 'write-back-material-coverage') return 'written-back';
  if (queueItem.status === 'ready') return 'handoff';
  if (queueItem.status === 'needs-review') return 'needs-review';
  if (queueItem.status === 'needs-resource') return 'needs-resource';
  if (queueItem.status === 'written-back') return 'written-back';
  return 'blocked';
}

function isProductionQueueAction(actionType: BrandCommandQueueItem['actionType']): boolean {
  return actionType === 'generate-prompt-draft' ||
    actionType === 'create-scene-card' ||
    actionType === 'launch-sop-run';
}

function nextStatus(queueItem: BrandCommandQueueItem): BrandCommandQueueItem['status'] {
  if (queueItem.status === 'ready' && queueItem.actionType === 'write-back-material-coverage') return 'written-back';
  if (queueItem.status === 'ready') return 'handed-off';
  if (queueItem.status === 'written-back') return 'written-back';
  return queueItem.status;
}

function outputSummary(
  queueItem: BrandCommandQueueItem,
  note?: string,
  promptDraftId?: string,
  reviewTaskId?: string,
  sceneCardId?: string,
  workflowRunId?: string,
  materialCoverage?: ContentMaterialCoverageResult,
): string {
  const suffix = note?.trim() ? `备注：${note.trim()}` : '';
  if (queueItem.status === 'ready' && promptDraftId) return [`已生成 Prompt 草稿 ${promptDraftId}，下一步在 Prompt 工作台确认产物。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'ready' && sceneCardId) return [`已生成场景卡 ${sceneCardId}，下一步在场景库确认画面、口播和素材建议。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'ready' && workflowRunId) return [`已启动 SOP 运行 ${workflowRunId}，下一步在 SOP 工作流确认各步骤产物。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'ready' && materialCoverage?.coverageChangeId) return [`已回写素材覆盖 ${materialCoverage.coverageChangeId}，更新 ${materialCoverage.updatedRowCount} 个内容组合。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'ready') return ['已记录交接动作，下一步在审核台生成 Prompt 草稿，或进入 Prompt 工作台确认产物。', suffix].filter(Boolean).join(' ');
  if (reviewTaskId && queueItem.status === 'needs-review') return [`已创建审核任务 ${reviewTaskId}。`, suffix].filter(Boolean).join(' ');
  if (reviewTaskId && queueItem.status === 'needs-resource') return [`已创建补资源任务 ${reviewTaskId}。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'needs-review') return ['已记录为待审核处理。', suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'needs-resource') return ['已记录补资源任务。', suffix].filter(Boolean).join(' ');
  return [queueItem.blockedReason || '发布检查未通过，动作未执行。', suffix].filter(Boolean).join(' ');
}

function isProductionHandoffRecord(record: BrandCommandActionRecord): boolean {
  return Boolean(record.queueItemId?.startsWith('handoff:'));
}

function mergeActionRecords(localRecords: BrandCommandActionRecord[], teamRecords: BrandCommandActionRecord[]): BrandCommandActionRecord[] {
  const byId = new Map<string, BrandCommandActionRecord>();
  [...teamRecords, ...localRecords].forEach((record) => {
    const existing = byId.get(record.id);
    byId.set(record.id, {
      ...existing,
      ...record,
      syncStatus: record.syncStatus || existing?.syncStatus,
      teamSync: record.teamSync || existing?.teamSync,
    });
  });
  return Array.from(byId.values())
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

function uniqueStrings(values: Array<string | undefined>, limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = String(value ?? '').replace(/\s+/g, ' ').trim();
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function mergeDimensions(
  sources: Array<ContentKnowledgeMapCoverageDimensions | undefined>,
): ContentKnowledgeMapCoverageDimensions | undefined {
  const audiences = uniqueStrings(sources.flatMap((item) => item?.audiences ?? []));
  const channels = uniqueStrings(sources.flatMap((item) => item?.channels ?? []));
  const stages = uniqueStrings(sources.flatMap((item) => item?.stages ?? []));
  const contentFormats = uniqueStrings(sources.flatMap((item) => item?.contentFormats ?? []));
  const useCases = uniqueStrings(sources.flatMap((item) => item?.useCases ?? []));
  const dimensions: ContentKnowledgeMapCoverageDimensions = {
    ...(audiences.length ? { audiences } : {}),
    ...(channels.length ? { channels } : {}),
    ...(stages.length ? { stages } : {}),
    ...(contentFormats.length ? { contentFormats } : {}),
    ...(useCases.length ? { useCases } : {}),
  };
  return Object.keys(dimensions).length ? dimensions : undefined;
}

function dimensionText(
  dimensions: ContentKnowledgeMapCoverageDimensions | undefined,
  key: keyof ContentKnowledgeMapCoverageDimensions,
  fallback: string,
): string {
  return dimensions?.[key]?.length ? dimensions[key].join(' / ') : fallback;
}

function bundleDimensions(input: {
  bundle: BrandCommandCenterRecord['resourceBundles'][number];
  queueItem?: BrandCommandQueueItem;
  campaignCell?: BrandCommandCenterRecord['campaignCells'][number];
}): ContentKnowledgeMapCoverageDimensions | undefined {
  return mergeDimensions([
    input.bundle.dimensions,
    input.queueItem?.dimensions,
    input.campaignCell?.dimensions,
    input.campaignCell?.channels.length ? { channels: input.campaignCell.channels } : undefined,
  ]);
}

function resourceBundleWithTeamActions(
  bundle: BrandCommandCenterRecord['resourceBundles'][number],
  sourceKnowledgeMapId: string | undefined,
  actions: BrandCommandActionRecord[],
): BrandCommandCenterRecord['resourceBundles'][number] {
  if (!sourceKnowledgeMapId || bundle.sourceKnowledgeMapId !== sourceKnowledgeMapId) return bundle;
  const handoffActions = actions.filter(isProductionHandoffRecord);
  if (!handoffActions.length) return bundle;
  const latest = handoffActions[0];
  const blockedReason = handoffActions.find((action) => action.outcome === 'blocked')?.blockedReason;
  const refs = handoffActions.map((action) => action.queueItemId).filter((id): id is string => Boolean(id));
  return {
    ...bundle,
    handoffStatus: blockedReason ? 'blocked' : 'handed-off',
    handoffRefs: Array.from(new Set([...(bundle.handoffRefs ?? []), ...refs])),
    lastHandoffSummary: latest.outputSummary || bundle.lastHandoffSummary,
    lastBlockedReason: blockedReason || bundle.lastBlockedReason,
  };
}

function buildPromptDraftContent(input: {
  record: BrandCommandCenterRecord;
  queueItem: BrandCommandQueueItem;
  bundle: BrandCommandCenterRecord['resourceBundles'][number];
  campaignCell?: BrandCommandCenterRecord['campaignCells'][number];
}): string {
  const dimensions = bundleDimensions(input);
  return [
    '# 品牌战情室执行草稿',
    '',
    `战情室：${input.record.title}`,
    `队列动作：${input.queueItem.title}`,
    `资源包：${input.bundle.title}`,
    '',
    '## 投放组合',
    `- 目标人群：${dimensionText(dimensions, 'audiences', '待细分目标人群')}`,
    `- 渠道：${dimensionText(dimensions, 'channels', '待确认渠道')}`,
    `- 内容形式：${dimensionText(dimensions, 'contentFormats', '待确认内容形式')}`,
    `- 使用场景：${dimensionText(dimensions, 'useCases', '待确认使用场景')}`,
    `- 阶段：${dimensionText(dimensions, 'stages', '待确认用户阶段')}`,
    '',
    '## 可用卖点',
    ...(input.bundle.sellingPointRefs.length ? input.bundle.sellingPointRefs.map((item) => `- ${item}`) : ['- 待补卖点']),
    '',
    '## 可用场景',
    ...(input.bundle.sceneRefs.length ? input.bundle.sceneRefs.map((item) => `- ${item}`) : ['- 待补场景']),
    '',
    '## 证据引用',
    ...(input.bundle.evidenceRefs.length ? input.bundle.evidenceRefs.map((item) => `- ${item}`) : ['- 待补证据']),
    '',
    '## 素材引用',
    ...(input.bundle.materialRefs.length ? input.bundle.materialRefs.map((item) => `- ${item}`) : ['- 待补素材']),
    '',
    '## 生成边界',
    ...(input.bundle.constraints.length ? input.bundle.constraints.map((item) => `- ${item}`) : ['- 必须人工确认品牌边界和平台规则。']),
    '',
    '## 下游要求',
    '- 必须围绕上面的目标人群、渠道、内容形式和使用场景组织输出。',
    '- 只使用上面的卖点、场景、证据和素材引用。',
    '- 不补写没有证据支持的功效、销量、背书或平台表现。',
    '- 输出前需要人工复核素材授权、禁用表达、竞品边界和渠道规则。',
    '- 先生成文案结构，再补图片 Prompt、视频 Prompt 和 SOP 输入建议。',
  ].join('\n');
}

function sourceRefsForBundle(input: {
  record: BrandCommandCenterRecord;
  bundle: BrandCommandCenterRecord['resourceBundles'][number];
}): string[] {
  return Array.from(new Set([
    ...(input.record.sourceKnowledgeMapId ? [`content-knowledge-map:${input.record.sourceKnowledgeMapId}`] : []),
    ...input.bundle.evidenceRefs.map((ref) => `evidence:${ref}`),
    ...input.bundle.materialRefs.map((ref) => `asset-review:${ref}`),
    ...input.bundle.promptDraftIds.map((ref) => `prompt-draft:${ref}`),
    ...(input.bundle.sceneCardIds ?? []).map((ref) => `scene-card:${ref}`),
  ]));
}

function mapRows(map: ContentKnowledgeMapRecord): ContentKnowledgeMapMatrixRow[] {
  const legacyRows = (map as ContentKnowledgeMapRecord & { matrixRows?: ContentKnowledgeMapMatrixRow[] }).matrixRows ?? [];
  return [...map.sellingPoints, ...map.painPoints, ...map.scenarios, ...legacyRows];
}

function coverageRowIdsForBundle(
  bundle: BrandCommandCenterRecord['resourceBundles'][number],
  map: ContentKnowledgeMapRecord | undefined,
): string[] {
  if (bundle.coverageRowIds?.length) return bundle.coverageRowIds;
  if (!map) return [];
  const sellingPointLabels = new Set(bundle.sellingPointRefs);
  const sceneLabels = new Set(bundle.sceneRefs);
  const evidenceLabels = new Set(bundle.evidenceRefs);
  const rows = mapRows(map);
  return rows
    .filter((row) =>
      sellingPointLabels.has(row.title) ||
      sceneLabels.has(row.title) ||
      row.evidenceRefs.some((ref) => evidenceLabels.has(ref)),
    )
    .map((row) => row.id)
    .slice(0, 12);
}

function approvedCoverageRowIdsFor(
  tasks: ContentReviewTask[],
  sourceKnowledgeMapId: string | undefined,
  coverageRowIds: string[],
): string[] {
  if (!sourceKnowledgeMapId || !coverageRowIds.length) return [];
  const targetIds = new Set(coverageRowIds);
  return Array.from(new Set(
    tasks
      .filter((task) =>
        task.sourceKnowledgeMapId === sourceKnowledgeMapId &&
        task.status === 'approved' &&
        (task.targetType === 'selling-point' || task.targetType === 'pain-point' || task.targetType === 'scenario') &&
        task.targetId &&
        targetIds.has(task.targetId),
      )
      .map((task) => task.targetId as string),
  ));
}

function inputSourceIdsFromMapRows(
  map: ContentKnowledgeMapRecord | undefined,
  coverageRowIds: string[],
): string[] {
  if (!map || !coverageRowIds.length) return [];
  const selectedIds = new Set(coverageRowIds);
  const rows = mapRows(map);
  return Array.from(new Set(
    rows
      .filter((row) => selectedIds.has(row.id))
      .flatMap((row) => row.sourceRefs)
      .filter((ref) => ref.startsWith('input-source:'))
      .map((ref) => ref.slice('input-source:'.length))
      .filter(Boolean),
  ));
}

function buildSceneCardInput(input: {
  workspacePath: string;
  record: BrandCommandCenterRecord;
  queueItem: BrandCommandQueueItem;
  bundle: BrandCommandCenterRecord['resourceBundles'][number];
  campaignCell?: BrandCommandCenterRecord['campaignCells'][number];
  sourceMap?: ContentKnowledgeMapRecord;
}): CreateSceneCardFromContentInput {
  const coverageRowIds = coverageRowIdsForBundle(input.bundle, input.sourceMap);
  const dimensions = bundleDimensions(input);
  const sellingPoint = input.bundle.sellingPointRefs.join(' / ') || '待确认卖点';
  const audience = dimensionText(dimensions, 'audiences', '资源包目标人群，需在场景库中继续细分。');
  const usageScene = dimensionText(dimensions, 'useCases', input.bundle.sceneRefs.join(' / ') || input.queueItem.summary);
  const channels = dimensionText(dimensions, 'channels', '待确认渠道');
  const formats = dimensionText(dimensions, 'contentFormats', '图片 / 短视频');
  const evidenceSummary = input.bundle.evidenceRefs.length ? `${input.bundle.evidenceRefs.length} 条可追溯证据` : '待补证据';
  const materialSummary = input.bundle.materialRefs.length ? `${input.bundle.materialRefs.length} 个已选素材` : '待补素材';
  const constraintSummary = input.bundle.constraints.slice(0, 3).join(' / ') || '遵守品牌口径和平台规则。';
  return {
    workspacePath: input.workspacePath,
    promptPackId: `brand-command-center:${input.record.id}`,
    inputSourceIds: inputSourceIdsFromMapRows(input.sourceMap, coverageRowIds),
    contentKnowledgeMapId: input.record.sourceKnowledgeMapId,
    contentKnowledgeMapTitle: input.record.sourceKnowledgeMapTitle,
    coverageRowIds,
    sourceRefs: sourceRefsForBundle(input),
    title: `${input.bundle.title} 场景卡`,
    audience,
    painPoint: input.record.signals[0]?.summary || '围绕当前作战信号处理用户异议和购买阻碍。',
    usageScene,
    visualComposition: `围绕「${audience} / ${usageScene} / ${formats}」组织画面，必须露出真实产品状态、使用动作、证据线索和素材来源。`,
    sellingPoint,
    voiceoverDirection: `面向「${audience}」在「${channels}」表达「${sellingPoint}」，引用 ${evidenceSummary}，避免夸大承诺。`,
    imageMaterialSuggestion: `优先使用 ${materialSummary}，补拍 9:16 近景、使用前后动作和证据露出画面。`,
    videoMaterialSuggestion: `生成适配「${channels}」的 15-30 秒分镜：信号痛点进入、卖点解释、证据露出、素材承接、行动建议。边界：${constraintSummary}`,
    citations: [],
  };
}

function buildWorkflowRunInput(input: {
  workspacePath: string;
  record: BrandCommandCenterRecord;
  queueItem: BrandCommandQueueItem;
  bundle: BrandCommandCenterRecord['resourceBundles'][number];
  campaignCell?: BrandCommandCenterRecord['campaignCells'][number];
  sourceMap?: ContentKnowledgeMapRecord;
  actorLabel: string;
}): StartWorkflowRunInput | undefined {
  const workflowDefinitionId = input.bundle.sopRefs[0];
  if (!workflowDefinitionId) return undefined;
  const coverageRowIds = coverageRowIdsForBundle(input.bundle, input.sourceMap);
  const dimensions = bundleDimensions(input);
  const sellingPoints = input.bundle.sellingPointRefs.join(' / ') || '待确认卖点';
  const scenes = input.bundle.sceneRefs.join(' / ') || '待确认场景';
  const evidence = input.bundle.evidenceRefs.join(' / ') || '待补证据';
  const materials = input.bundle.materialRefs.join(' / ') || '待补素材';
  const constraints = input.bundle.constraints.join(' / ') || input.record.constraints.join(' / ') || '遵守品牌口径和平台规则。';
  const channels = dimensionText(dimensions, 'channels', input.campaignCell?.channels.join(' / ') || '待确认渠道');
  const audiences = dimensionText(dimensions, 'audiences', '待确认目标人群');
  const formats = dimensionText(dimensions, 'contentFormats', '待确认内容形式');
  const useCases = dimensionText(dimensions, 'useCases', scenes);
  return {
    workspacePath: input.workspacePath,
    workflowDefinitionId,
    inputSourceIds: inputSourceIdsFromMapRows(input.sourceMap, coverageRowIds),
    inputs: {
      source: [
        input.record.sourceKnowledgeMapTitle ? `内容知识地图：${input.record.sourceKnowledgeMapTitle}` : '',
        `资源包：${input.bundle.title}`,
        `证据：${evidence}`,
        `素材：${materials}`,
      ].filter(Boolean).join('\n'),
      intent: [
        input.queueItem.summary,
        `目标人群：${audiences}`,
        `目标渠道：${channels}`,
        `内容形式：${formats}`,
        `使用场景：${useCases}`,
        `卖点：${sellingPoints}`,
        `场景：${scenes}`,
        `生成边界：${constraints}`,
      ].join('\n'),
      reviewOwner: input.actorLabel,
      platform: dimensions?.channels?.[0] ?? input.campaignCell?.channels[0] ?? '',
    },
  };
}

function reviewTaskForCommand(input: {
  workspacePath: string;
  record: BrandCommandCenterRecord;
  queueItem: BrandCommandQueueItem;
  bundle?: BrandCommandCenterRecord['resourceBundles'][number];
  actorLabel: string;
  now: string;
}): ContentReviewTask | undefined {
  if (input.queueItem.status !== 'needs-review' && input.queueItem.status !== 'needs-resource') return undefined;
  const isMaterialGap = input.queueItem.actionType === 'create-material-gap-list';
  const isEvidenceGap = input.queueItem.actionType === 'request-evidence' || input.queueItem.status === 'needs-resource';
  return {
    id: randomUUID(),
    workspacePath: input.workspacePath,
    sourceKnowledgeMapId: input.record.sourceKnowledgeMapId,
    sourceKnowledgeMapTitle: input.record.sourceKnowledgeMapTitle,
    targetType: isEvidenceGap && !isMaterialGap ? 'evidence' : 'gap',
    targetId: `brand-command:${input.record.id}:${input.queueItem.id}`,
    title: input.queueItem.title,
    summary: [
      input.queueItem.summary,
      input.queueItem.blockedReason ? `原因：${input.queueItem.blockedReason}` : '',
      input.queueItem.recoveryAction ? `恢复动作：${input.queueItem.recoveryAction}` : '',
      input.bundle?.gaps.length ? `资源包缺口：${input.bundle.gaps.join(' / ')}` : '',
    ].filter(Boolean).join('\n'),
    evidenceRefs: input.bundle?.evidenceRefs ?? [],
    sourceRefs: [
      ...(input.record.sourceKnowledgeMapId ? [`content-knowledge-map:${input.record.sourceKnowledgeMapId}`] : []),
      ...(input.bundle?.materialRefs.map((ref) => `asset-review:${ref}`) ?? []),
    ],
    risk: input.queueItem.status === 'needs-review' ? 'high' : 'medium',
    status: input.queueItem.status === 'needs-review' ? 'open' : isMaterialGap ? 'needs-material' : 'needs-evidence',
    suggestedAction: input.queueItem.status === 'needs-review' ? 'approve' : isMaterialGap ? 'request-material' : 'request-evidence',
    taskPurpose: input.queueItem.status === 'needs-review' ? 'review' : isMaterialGap ? 'material-supplement' : 'evidence-supplement',
    issueLabels: [
      input.queueItem.status === 'needs-review' ? '待审核' : isMaterialGap ? '补素材' : '补证据',
      '品牌战情室',
      input.actorLabel,
    ],
    decisions: [],
    createdAt: input.now,
    updatedAt: input.now,
  };
}

const localOnlyActionSync: BrandCommandActionSyncAdapter = {
  async appendActionRecord() {
    return {
      backend: 'bugu',
      status: 'blocked',
      message: '行动记录已保存在本机，尚未同步到团队工作区。',
    };
  },
};

const localOnlyQueueSync: BrandCommandExecutionQueueSyncAdapter = {
  async syncExecutionQueue() {
    return {
      backend: 'bugu',
      status: 'blocked',
      message: '执行队列已保存在本机，尚未同步到团队工作区。',
    };
  },
};

export class BrandCommandCenterApplicationService {
  constructor(
    private readonly store: BrandCommandCenterStore,
    private readonly knowledgeMaps: ContentKnowledgeMapStore,
    private readonly sync: ContentKnowledgeMapSyncPort,
    private readonly actionSync: BrandCommandActionSyncAdapter = localOnlyActionSync,
    private readonly queueSync: BrandCommandExecutionQueueSyncAdapter = localOnlyQueueSync,
    private readonly promptDrafts?: PromptDraftStore,
    private readonly reviewTasks?: ContentReviewTaskStore,
    private readonly reviewSync?: ContentReviewTaskSyncAdapter,
    private readonly sceneCards?: SceneLibraryStore,
    private readonly workflows?: WorkflowStore,
    private readonly materialFeedback?: ContentMaterialFeedbackService,
  ) {}

  list(workspacePath: string): Promise<BrandCommandCenterRecord[]> {
    return this.store.list(workspacePath);
  }

  async build(input: BuildBrandCommandCenterInput): Promise<BrandCommandCenterRecord> {
    const [maps, teamSync, reviewTasks] = await Promise.all([
      this.knowledgeMaps.list(input.workspacePath),
      this.sync.draftStatus(input.workspacePath),
      this.reviewTasks?.list(input.workspacePath) ?? Promise.resolve(undefined),
    ]);
    const selectedMap = input.contentKnowledgeMapId
      ? maps.find((map) => map.id === input.contentKnowledgeMapId)
      : maps[0];
    const record = buildBrandCommandCenterDraft(input, selectedMap, teamSync, reviewTasks);
    if (!record.queueItems.length) return this.store.save(record);
    const queueSync = await this.queueSync.syncExecutionQueue({
      workspacePath: input.workspacePath,
      commandCenterId: record.id,
      items: record.queueItems,
    });
    return this.store.save({
      ...record,
      syncStatus: queueSync.status,
      teamSync: queueSync,
      queueItems: record.queueItems.map((item) => ({ ...item, syncStatus: queueSync.status, teamSync: queueSync })),
    });
  }

  async recordAction(input: RecordBrandCommandActionInput): Promise<BrandCommandCenterRecord> {
    const records = await this.store.list(input.workspacePath);
    const record = records.find((item) => item.id === input.commandCenterId);
    if (!record) throw new Error(`品牌战情室不存在: ${input.commandCenterId}`);
    const queueItem = record.queueItems.find((item) => item.id === input.queueItemId);
    if (!queueItem) throw new Error(`队列动作不存在: ${input.queueItemId}`);
    const now = new Date().toISOString();
    const resourceBundle = record.resourceBundles.find((bundle) => bundle.id === queueItem.resourceBundleId);
    const campaignCell = record.campaignCells.find((cell) => cell.id === queueItem.campaignCellId);
    const requiresApprovedReview = Boolean(this.reviewTasks) && isProductionQueueAction(queueItem.actionType);
    const needsSourceMap = queueItem.status === 'ready' &&
      resourceBundle &&
      (
        (queueItem.actionType === 'generate-prompt-draft' && Boolean(this.promptDrafts)) ||
        (queueItem.actionType === 'create-scene-card' && Boolean(this.sceneCards)) ||
        (queueItem.actionType === 'launch-sop-run' && Boolean(this.workflows)) ||
        requiresApprovedReview
      );
    const sourceMap = needsSourceMap
      ? (await this.knowledgeMaps.list(input.workspacePath)).find((map) => map.id === record.sourceKnowledgeMapId)
      : undefined;
    const coverageRowIds = resourceBundle ? coverageRowIdsForBundle(resourceBundle, sourceMap) : [];
    const reviewTasks = requiresApprovedReview && this.reviewTasks
      ? await this.reviewTasks.list(input.workspacePath)
      : [];
    const approvedCoverageRowIds = requiresApprovedReview
      ? approvedCoverageRowIdsFor(reviewTasks, record.sourceKnowledgeMapId, coverageRowIds)
      : (resourceBundle?.approvedCoverageRowIds ?? []);
    const executionPolicy = checkBrandCommandExecution({
      record,
      queueItem,
      resourceBundle,
      campaignCell,
      recentActions: record.actionRecords,
      actorRole: input.actorRole,
      requiresApprovedReview,
      coverageRowIds,
      approvedCoverageRowIds,
    });
    let effectiveQueueItem: BrandCommandQueueItem = executionPolicy.allowed ? queueItem : {
      ...queueItem,
      status: 'blocked',
      blockedReason: executionPolicy.issues[0] || queueItem.blockedReason || '发布检查未通过，动作未执行。',
      recoveryAction: executionPolicy.recoveryAction ?? queueItem.recoveryAction,
    };
    const inputSourceIds = inputSourceIdsFromMapRows(sourceMap, coverageRowIds);
    const promptDraft = effectiveQueueItem.status === 'ready' &&
      effectiveQueueItem.actionType === 'generate-prompt-draft' &&
      resourceBundle &&
      this.promptDrafts
      ? await this.promptDrafts.createFromContent({
          workspacePath: input.workspacePath,
          title: `${resourceBundle.title} Prompt 草稿`,
          purpose: 'sop',
          userIntent: effectiveQueueItem.summary,
          inputSourceIds,
          sceneCardIds: resourceBundle.sceneCardIds ?? [],
          content: buildPromptDraftContent({ record, queueItem: effectiveQueueItem, bundle: resourceBundle, campaignCell }),
          note: `由品牌战情室队列动作 ${effectiveQueueItem.id} 生成。`,
          model: 'brand-command-center',
          status: 'confirmed',
          contentKnowledgeMapId: record.sourceKnowledgeMapId,
          contentKnowledgeMapTitle: record.sourceKnowledgeMapTitle,
          coverageRowIds,
          sourceRefs: sourceRefsForBundle({ record, bundle: resourceBundle }),
        })
      : undefined;
    const sceneCard = effectiveQueueItem.status === 'ready' &&
      effectiveQueueItem.actionType === 'create-scene-card' &&
      resourceBundle &&
      this.sceneCards
      ? await this.sceneCards.createFromContent(buildSceneCardInput({
          workspacePath: input.workspacePath,
          record,
          queueItem: effectiveQueueItem,
          bundle: resourceBundle,
          campaignCell,
          sourceMap,
        }))
      : undefined;
    const workflowRunInput = effectiveQueueItem.status === 'ready' &&
      effectiveQueueItem.actionType === 'launch-sop-run' &&
      resourceBundle &&
      this.workflows
      ? buildWorkflowRunInput({
          workspacePath: input.workspacePath,
          record,
          queueItem: effectiveQueueItem,
          bundle: resourceBundle,
          campaignCell,
          sourceMap,
          actorLabel: input.actorLabel?.trim() || '本机工作台',
        })
      : undefined;
    const workflowRun = workflowRunInput && this.workflows
      ? await this.workflows.startRun(workflowRunInput)
      : undefined;
    const materialCoverage = effectiveQueueItem.status === 'ready' &&
      effectiveQueueItem.actionType === 'write-back-material-coverage' &&
      resourceBundle &&
      this.materialFeedback
      ? await this.materialFeedback.writeBack({
          workspacePath: input.workspacePath,
          contentKnowledgeMapId: resourceBundle.sourceKnowledgeMapId ?? record.sourceKnowledgeMapId,
          assetReviewIds: resourceBundle.materialRefs,
        })
      : undefined;
    if (materialCoverage?.status === 'blocked') {
      effectiveQueueItem = {
        ...effectiveQueueItem,
        status: 'blocked',
        blockedReason: materialCoverage.issues[0] || '素材覆盖回写失败。',
        recoveryAction: '先确认素材审核状态、覆盖标签和内容知识地图匹配关系，再重新回写。',
      };
    }
    const reviewTaskCandidate = reviewTaskForCommand({
      workspacePath: input.workspacePath,
      record,
      queueItem: effectiveQueueItem,
      bundle: resourceBundle,
      actorLabel: input.actorLabel?.trim() || '本机工作台',
      now,
    });
    let reviewTask: ContentReviewTask | undefined;
    if (reviewTaskCandidate && this.reviewTasks) {
      const existingTasks = await this.reviewTasks.list(input.workspacePath);
      reviewTask = existingTasks.find((task) => (
        task.sourceKnowledgeMapId === reviewTaskCandidate.sourceKnowledgeMapId &&
        task.targetType === reviewTaskCandidate.targetType &&
        task.targetId === reviewTaskCandidate.targetId
      ));
      if (!reviewTask) {
        await this.reviewTasks.saveMany(input.workspacePath, [reviewTaskCandidate]);
        reviewTask = reviewTaskCandidate;
        if (this.reviewSync) {
          const reviewTeamSync = await this.reviewSync.syncReviewTasks({
            workspacePath: input.workspacePath,
            tasks: [reviewTaskCandidate],
            authorLabel: input.actorLabel?.trim() || '本机工作台',
          });
          const syncedTasks = await this.reviewTasks.updateMany(input.workspacePath, [{
            ...reviewTaskCandidate,
            syncStatus: reviewTeamSync.status,
            teamSync: reviewTeamSync,
          }]);
          reviewTask = syncedTasks.find((task) => task.id === reviewTaskCandidate.id) ?? reviewTaskCandidate;
        }
      }
    }
    const nextQueueItem: BrandCommandQueueItem = {
      ...effectiveQueueItem,
      status: nextStatus(effectiveQueueItem),
      updatedAt: now,
    };
    const actionRecord: BrandCommandActionRecord = {
      id: randomUUID(),
      queueItemId: queueItem.id,
      campaignCellId: queueItem.campaignCellId,
      actionType: queueItem.actionType,
      title: queueItem.title,
      outcome: outcomeFor(effectiveQueueItem),
      actorLabel: input.actorLabel?.trim() || '本机工作台',
      actorRole: input.actorRole,
      inputSummary: queueItem.summary,
      outputSummary: outputSummary(effectiveQueueItem, input.note, promptDraft?.id, reviewTask?.id, sceneCard?.id, workflowRun?.id, materialCoverage),
      blockedReason: effectiveQueueItem.status === 'ready' ? undefined : effectiveQueueItem.blockedReason,
      writeBackSummary: effectiveQueueItem.status === 'ready'
        ? materialCoverage?.status === 'updated'
          ? `已回写 ${materialCoverage.updatedRowCount} 个素材覆盖组合，待确认补充任务 ${materialCoverage.pendingSupplementTaskCount ?? 0} 个。`
          : '已留下交接记录，等待审核台产物、外部发布或素材导入后回写。'
        : reviewTask
          ? '已转入审核任务，等待负责人处理。'
          : undefined,
      promptDraftId: promptDraft?.id,
      sceneCardId: sceneCard?.id,
      workflowRunId: workflowRun?.id,
      materialCoverageChangeId: materialCoverage?.coverageChangeId,
      reviewTaskId: reviewTask?.id,
      createdAt: now,
    };
    const teamSync = await this.actionSync.appendActionRecord({
      workspacePath: input.workspacePath,
      commandCenterId: record.id,
      record: actionRecord,
      authorLabel: actionRecord.actorLabel,
    });
    const queueTeamSync = await this.queueSync.syncExecutionQueue({
      workspacePath: input.workspacePath,
      commandCenterId: record.id,
      items: [nextQueueItem],
      authorLabel: actionRecord.actorLabel,
    });
    const finalTeamSync = queueTeamSync.status === 'synced' ? queueTeamSync : teamSync;
    const syncedActionRecord: BrandCommandActionRecord = {
      ...actionRecord,
      syncStatus: teamSync.status,
      teamSync,
    };
    const syncedQueueItem: BrandCommandQueueItem = {
      ...nextQueueItem,
      syncStatus: queueTeamSync.status,
      teamSync: queueTeamSync,
    };
    const handoffRefs = [
      ...(promptDraft ? [`prompt-draft:${promptDraft.id}`] : []),
      ...(sceneCard ? [`scene-card:${sceneCard.id}`] : []),
      ...(workflowRun ? [`workflow-run:${workflowRun.id}`] : []),
      ...(materialCoverage?.coverageChangeId ? [`material-coverage:${materialCoverage.coverageChangeId}`] : []),
    ];
    const lastHandoffSummary = promptDraft
      ? `已生成 Prompt 草稿 ${promptDraft.id}。`
      : sceneCard
        ? `已生成场景卡 ${sceneCard.id}。`
        : workflowRun
          ? `已启动 SOP 运行 ${workflowRun.id}。`
          : materialCoverage?.coverageChangeId
            ? `已回写素材覆盖 ${materialCoverage.coverageChangeId}。`
            : undefined;
    const updated: BrandCommandCenterRecord = {
      ...record,
      queueItems: record.queueItems.map((item) => (item.id === queueItem.id ? syncedQueueItem : item)),
      resourceBundles: record.resourceBundles.map((bundle) => {
        if (!handoffRefs.length || bundle.id !== queueItem.resourceBundleId) return bundle;
        return {
          ...bundle,
          promptDraftIds: promptDraft ? Array.from(new Set([...bundle.promptDraftIds, promptDraft.id])) : bundle.promptDraftIds,
          sceneCardIds: sceneCard ? Array.from(new Set([...(bundle.sceneCardIds ?? []), sceneCard.id])) : bundle.sceneCardIds,
          handoffStatus: 'handed-off',
          handoffRefs: Array.from(new Set([...(bundle.handoffRefs ?? []), ...handoffRefs])),
          lastHandoffSummary,
        };
      }),
      actionRecords: [syncedActionRecord, ...record.actionRecords],
      syncStatus: finalTeamSync.status,
      teamSync: finalTeamSync,
      updatedAt: now,
    };
    return this.store.update(updated);
  }

  async refreshActions(input: RefreshBrandCommandActionsInput): Promise<BrandCommandCenterRecord> {
    const records = await this.store.list(input.workspacePath);
    const record = records.find((item) => item.id === input.commandCenterId);
    if (!record) throw new Error(`品牌战情室不存在: ${input.commandCenterId}`);
    if (!this.actionSync.listActionRecords) return record;
    const workspaceId = record.teamSync.workspaceId;
    const result = await this.actionSync.listActionRecords({
      workspacePath: input.workspacePath,
      workspaceId,
      commandCenterId: record.id,
      limit: 80,
    });
    const productionHandoffResult = record.sourceKnowledgeMapId
      ? await this.actionSync.listActionRecords({
          workspacePath: input.workspacePath,
          workspaceId,
          commandCenterId: `content-production:${record.sourceKnowledgeMapId}`,
          limit: 80,
        })
      : { records: [], teamSync: result.teamSync };
    const teamRecords = [...result.records, ...productionHandoffResult.records];
    const mergedRecords = mergeActionRecords(record.actionRecords, teamRecords);
    const updated: BrandCommandCenterRecord = {
      ...record,
      actionRecords: mergedRecords,
      resourceBundles: record.resourceBundles.map((bundle) => resourceBundleWithTeamActions(
        bundle,
        record.sourceKnowledgeMapId,
        mergedRecords,
      )),
      syncStatus: result.teamSync.status,
      teamSync: result.teamSync,
      updatedAt: new Date().toISOString(),
    };
    return this.store.update(updated);
  }
}
