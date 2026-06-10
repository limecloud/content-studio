import { randomUUID } from 'node:crypto';
import type {
  AdvanceContentBatchStageInput,
  AssetReviewRecord,
  BuildContentBatchInput,
  ContentBatchArtifactRef,
  ContentBatchGateResult,
  ContentBatchIntakeSummary,
  ContentBatchRecord,
  ContentBatchRecoveryTask,
  ContentBatchRunStatus,
  ContentBatchStageId,
  ContentBatchStageRun,
  ContentKnowledgeMapRecord,
  ContentReviewTask,
  GenerationLogEntry,
  InputSourceRecord,
  PromptDraft,
} from '../../shared/types';
import { AssetReviewStore } from './assetReviewStore';
import { ContentBatchStore } from './contentBatchStore';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import { ContentReviewTaskStore } from './contentReviewTaskStore';
import { GenerationLogStore } from './generationLogStore';
import { InputSourceStore } from './inputSourceStore';
import { PromptDraftStore } from './promptDraftStore';
import { buildIntakeMaturitySummary } from '../../shared/intakeMaturity';
import { buildManufacturingPlanProjection } from '../../shared/manufacturingPlan';
import { buildProductPlanProjection } from '../../shared/productPlanning';

const STAGE_IDS: ContentBatchStageId[] = [
  'selection',
  'intent',
  'modeling',
  'selling',
  'matrix',
  'manufacturing',
  'review',
  'optimization',
  'feedback',
];

const STAGE_TITLES: Record<ContentBatchStageId, string> = {
  selection: '选品',
  intent: '意图',
  modeling: '建模',
  selling: '卖点',
  matrix: '矩阵',
  manufacturing: '制造',
  review: '审核',
  optimization: '调优',
  feedback: '复盘',
};

function cleanText(value: string | undefined, fallback: string): string {
  const text = value?.replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function artifact(kind: string, id: string, summary: string, path?: string, targetModule?: string): ContentBatchArtifactRef {
  return { kind, id, summary: cleanText(summary, id), path, targetModule };
}

function inputSourceStatusLabel(status: InputSourceRecord['status']): string {
  if (status === 'converted') return '已解析';
  if (status === 'registered') return '已登记';
  if (status === 'blocked') return '待处理';
  return '解析失败';
}

function reviewTaskStatusLabel(status: ContentReviewTask['status']): string {
  if (status === 'approved') return '已通过';
  if (status === 'rejected') return '已驳回';
  if (status === 'needs-evidence') return '待补证据';
  if (status === 'needs-material') return '待补素材';
  if (status === 'forbidden') return '已禁用';
  return '待处理';
}

function generationStatusLabel(status: GenerationLogEntry['status']): string {
  if (status === 'queued') return '排队中';
  if (status === 'running') return '生成中';
  if (status === 'succeeded') return '已生成';
  if (status === 'failed') return '生成失败';
  if (status === 'blocked') return '待配置';
  return '已取消';
}

function promptDraftStatusLabel(status: PromptDraft['status']): string {
  if (status === 'confirmed') return '已确认';
  if (status === 'materialized') return '已沉淀';
  if (status === 'archived') return '已归档';
  return '草稿';
}

function intakeLevelLabel(level: 'L0' | 'L1' | 'L2'): string {
  if (level === 'L2') return '自动接入';
  if (level === 'L1') return '文件映射';
  return '手动补齐';
}

function sourceArtifact(source: InputSourceRecord): ContentBatchArtifactRef {
  return artifact('input-source', source.id, `${source.title} · ${inputSourceStatusLabel(source.status)}`, source.sourcePath || source.markdownPath, 'knowledge-inputs');
}

function reviewArtifact(task: ContentReviewTask): ContentBatchArtifactRef {
  return artifact('review-task', task.id, `${task.title} · ${reviewTaskStatusLabel(task.status)}`, undefined, 'knowledge-review');
}

function logArtifact(log: GenerationLogEntry): ContentBatchArtifactRef {
  return artifact('generation-log', log.id, `${log.title} · ${generationStatusLabel(log.status)}`, log.artifactRefs?.[0], targetModuleForLog(log.kind));
}

function promptDraftArtifact(draft: PromptDraft): ContentBatchArtifactRef {
  const targetModule = draft.purpose === 'video'
    ? 'video-prompt'
    : draft.purpose === 'green-screen'
      ? 'image-green-screen'
      : draft.purpose === 'image'
        ? 'image'
        : 'agents';
  return artifact('prompt-draft', draft.id, `${draft.title} · ${promptDraftStatusLabel(draft.status)}`, undefined, targetModule);
}

function assetReviewArtifact(review: AssetReviewRecord): ContentBatchArtifactRef {
  const statusLabel = review.status === 'approved'
    ? '已通过并入库'
    : review.status === 'rejected'
      ? '已驳回'
      : '待人工审核';
  return artifact('asset-review', review.id, `${review.title} · ${statusLabel}`, review.path, 'assets');
}

function targetModuleForLog(kind: GenerationLogEntry['kind']): string {
  if (kind === 'image') return 'image';
  if (kind === 'video' || kind === 'video-script' || kind === 'video-breakdown') return 'video';
  if (kind === 'scene-card') return 'knowledge-scenes';
  if (kind === 'prompt-pack' || kind === 'reference-reverse') return 'agents';
  return 'article';
}

function sourceMatchesStage(source: InputSourceRecord, stageId: ContentBatchStageId): boolean {
  if (stageId === 'selection') return source.kind === 'sku-table' || source.purpose === 'product-brief';
  if (stageId === 'intent') return source.purpose === 'user-feedback' || source.kind === 'text';
  if (stageId === 'modeling') return ['brand-kb', 'ip-kb', 'product-brief', 'task-input', 'sop-input'].includes(source.purpose);
  if (stageId === 'selling') return ['brand-kb', 'product-brief', 'user-feedback'].includes(source.purpose);
  if (stageId === 'matrix') return ['reference', 'successful-asset', 'task-input', 'sop-input'].includes(source.purpose);
  if (stageId === 'manufacturing') return ['reference', 'successful-asset', 'product-brief'].includes(source.purpose);
  if (stageId === 'review') return source.purpose === 'successful-asset' || source.purpose === 'reference';
  if (stageId === 'optimization') return source.purpose === 'user-feedback' || source.tags.some((tag) => /投放|roi|ad|metric/i.test(tag));
  return source.purpose === 'successful-asset' || source.purpose === 'user-feedback';
}

function logMatchesStage(log: GenerationLogEntry, stageId: ContentBatchStageId): boolean {
  if (stageId === 'manufacturing') return ['image', 'video', 'video-script', 'video-breakdown'].includes(log.kind);
  if (stageId === 'selling') return ['prompt-pack', 'scene-card', 'reference-reverse'].includes(log.kind);
  if (stageId === 'matrix') return ['scene-card', 'prompt-pack'].includes(log.kind);
  if (stageId === 'feedback') return ['article', 'reference-reverse'].includes(log.kind);
  return false;
}

function promptDraftMatchesStage(draft: PromptDraft, stageId: ContentBatchStageId): boolean {
  if (stageId === 'manufacturing') return draft.purpose === 'video' || draft.purpose === 'image' || draft.purpose === 'green-screen';
  if (stageId === 'selling') return draft.purpose === 'image' || draft.purpose === 'video' || draft.purpose === 'green-screen';
  if (stageId === 'matrix') return Boolean(draft.coverageRowIds?.length || draft.sceneCardIds?.length);
  if (stageId === 'feedback') return draft.model === 'local-successful-asset-distiller' || draft.status === 'materialized';
  return false;
}

function manufacturingLogs(logs: GenerationLogEntry[]): GenerationLogEntry[] {
  return logs.filter((log) => log.status === 'succeeded' && ['image', 'video', 'video-script'].includes(log.kind));
}

function hasReviewForLog(assetReviews: AssetReviewRecord[], log: GenerationLogEntry): boolean {
  return assetReviews.some((review) => review.sourceType === 'generation-log' && review.sourceId === log.id);
}

function sourceAssetPath(source: InputSourceRecord): string | undefined {
  return source.sourcePath || source.artifactRefs.find((ref) => /\.(mp4|mov|webm|m4v|png|jpe?g|webp|gif|avif|svg)(?:[?#].*)?$/i.test(ref));
}

function hasReviewForInputSource(assetReviews: AssetReviewRecord[], source: InputSourceRecord): boolean {
  return assetReviews.some((review) => review.sourceType === 'input-source' && review.sourceId === source.id);
}

function performanceSources(inputSources: InputSourceRecord[]): InputSourceRecord[] {
  return inputSources.filter((source) =>
    source.purpose === 'user-feedback' ||
    source.tags.some((tag) => /投放|roi|ad|metric|表现|转化|点击|ctr|cpa/i.test(tag)) ||
    /投放|roi|广告|转化|点击|表现|ctr|cpa/i.test(`${source.title} ${source.summary ?? ''}`),
  );
}

function terminalGenerationLogs(logs: GenerationLogEntry[]): GenerationLogEntry[] {
  return logs.filter((log) => log.status === 'succeeded' || log.status === 'failed' || log.status === 'blocked');
}

function runReviewArtifacts(input: {
  logs: GenerationLogEntry[];
  promptDrafts: PromptDraft[];
  assetReviews: AssetReviewRecord[];
}): ContentBatchArtifactRef[] {
  return [
    ...terminalGenerationLogs(input.logs).slice(0, 4).map(logArtifact),
    ...input.promptDrafts.filter((draft) => draft.model === 'local-successful-asset-distiller' || draft.status === 'materialized').slice(0, 4).map(promptDraftArtifact),
    ...input.assetReviews.filter((review) => review.status === 'approved' || review.status === 'rejected').slice(0, 4).map(assetReviewArtifact),
  ];
}

function hasRunReviewEvidence(input: {
  logs: GenerationLogEntry[];
  promptDrafts: PromptDraft[];
  assetReviews: AssetReviewRecord[];
}): boolean {
  return runReviewArtifacts(input).length > 0;
}

function mapRows(map?: ContentKnowledgeMapRecord) {
  return map ? [...map.sellingPoints, ...map.painPoints, ...map.scenarios] : [];
}

function matrixKnowledgeRows(map?: ContentKnowledgeMapRecord) {
  return mapRows(map).filter((row) => row.status === 'ready' || row.materialStatus === 'approved' || row.confidence >= 70);
}

function matrixHandoffArtifacts(input: {
  knowledgeMap?: ContentKnowledgeMapRecord;
  reviewTasks: ContentReviewTask[];
  logs: GenerationLogEntry[];
  promptDrafts: PromptDraft[];
}): ContentBatchArtifactRef[] {
  const rows = matrixKnowledgeRows(input.knowledgeMap);
  return [
    ...(rows.length && input.knowledgeMap
      ? [artifact(
        'matrix-handoff',
        `${input.knowledgeMap.id}:matrix`,
        `${input.knowledgeMap.title} · ${rows.length} 个卖点 / 痛点 / 场景可交接`,
        undefined,
        'knowledge-map',
      )]
      : []),
    ...input.promptDrafts.filter((draft) => promptDraftMatchesStage(draft, 'matrix')).slice(0, 4).map(promptDraftArtifact),
    ...input.logs.filter((log) => logMatchesStage(log, 'matrix')).slice(0, 3).map(logArtifact),
    ...input.reviewTasks.filter((task) => task.status === 'open' || task.status === 'needs-evidence' || task.status === 'needs-material').slice(0, 3).map(reviewArtifact),
  ];
}

function approvedAssetsMissingCoverage(map: ContentKnowledgeMapRecord | undefined, assetReviews: AssetReviewRecord[]): AssetReviewRecord[] {
  if (!map) return [];
  const refs = new Set(mapRows(map).flatMap((row) => row.materialRefs ?? []));
  return assetReviews.filter((review) => review.status === 'approved' && !refs.has(review.id));
}

function successfulAssetPromptDrafts(promptDrafts: PromptDraft[]): PromptDraft[] {
  return promptDrafts.filter((draft) => draft.model === 'local-successful-asset-distiller');
}

function activeStageIndex(batch: ContentBatchRecord): number {
  const direct = STAGE_IDS.indexOf(batch.currentStageId);
  if (direct >= 0) return direct;
  const blocked = batch.stageRuns.findIndex((stage) => stage.status === 'blocked' || stage.status === 'needs-human');
  if (blocked >= 0) return blocked;
  const ready = batch.stageRuns.findIndex((stage) => stage.status === 'ready' || stage.status === 'draft');
  return ready >= 0 ? ready : 0;
}

function stageStatus(input: {
  stageId: ContentBatchStageId;
  index: number;
  currentIndex: number;
  inputRefs: ContentBatchArtifactRef[];
  outputRefs: ContentBatchArtifactRef[];
  gateResults: ContentBatchGateResult[];
  recoveryTasks: ContentBatchRecoveryTask[];
}): ContentBatchRunStatus {
  if (input.gateResults.some((gate) => gate.status === 'blocked')) return 'blocked';
  if (input.recoveryTasks.length || input.gateResults.some((gate) => gate.status === 'needs-input' || gate.status === 'needs-review')) return 'needs-human';
  if (input.index < input.currentIndex || input.outputRefs.length > 0) return 'approved';
  if (input.index === input.currentIndex) return input.inputRefs.length ? 'ready' : 'draft';
  return 'draft';
}

function gate(
  stageId: ContentBatchStageId,
  status: ContentBatchGateResult['status'],
  title: string,
  message: string,
  recoveryAction?: string,
  sourceRef?: ContentBatchArtifactRef,
): ContentBatchGateResult {
  return {
    id: `${stageId}:${title}`,
    stageId,
    status,
    title,
    message,
    recoveryAction,
    sourceRef,
  };
}

function recoveryTask(
  stageId: ContentBatchStageId,
  title: string,
  message: string,
  recoveryAction: string,
  targetModule: string,
  createdAt: string,
  sourceRef?: ContentBatchArtifactRef,
): ContentBatchRecoveryTask {
  return {
    id: `${stageId}:${title}:${sourceRef?.id ?? 'manual'}`,
    stageId,
    status: 'open',
    title,
    message,
    recoveryAction,
    targetModule,
    sourceRef,
    ownerLabel: '运营确认',
    createdAt,
  };
}

function buildIntakeSummary(input: {
  inputSources: InputSourceRecord[];
  knowledgeMap?: ContentKnowledgeMapRecord;
  promptDrafts: PromptDraft[];
  logs: GenerationLogEntry[];
  assetReviews: AssetReviewRecord[];
  now: string;
}): ContentBatchIntakeSummary {
  const { inputSources, knowledgeMap, promptDrafts, logs, assetReviews, now } = input;
  const maturity = buildIntakeMaturitySummary(inputSources);
  const manufacturing = buildManufacturingPlanProjection({
    inputSources,
    knowledgeMap,
    promptDrafts,
    logs,
    assetReviews,
    intake: maturity,
  });
  const productPlan = buildProductPlanProjection({
    inputSources,
    intake: maturity,
    manufacturing,
  });
  const blockedSources = inputSources.filter((source) => source.status === 'blocked');
  const convertedCount = inputSources.filter((source) => source.status === 'converted').length;
  const coveragePercent = maturity.averageCoverage;
  const maturityGaps = maturity.projections
    .filter((source) => source.coverage < 45 || source.health === 'bad')
    .slice(0, 4)
    .map((source) =>
      recoveryTask(
        'selection',
        `补齐 ${source.name}`,
        `${source.name} 当前以${intakeLevelLabel(source.level)}为主，覆盖率 ${source.coverage}%，${source.impact.note}`,
        source.upgrade?.action || '补充文件、文本或人工确认记录。',
        'knowledge-inputs',
        now,
      ),
    );
  return {
    inputSourceCount: inputSources.length,
    convertedCount,
    blockedCount: blockedSources.length,
    coveragePercent,
    maturity,
    productPlan,
    manufacturing,
    missingInputs: [
      ...maturityGaps,
      ...blockedSources.slice(0, Math.max(0, 8 - maturityGaps.length)).map((source) =>
        recoveryTask(
          'modeling',
          `补齐 ${source.title}`,
          source.blockedReason || '输入源尚未转换成可用内容。',
          '补充可解析文本、改传 Markdown，或接入对应理解服务。',
          'knowledge-inputs',
          now,
          sourceArtifact(source),
        ),
      ),
    ],
  };
}

function gatesForStage(input: {
  stageId: ContentBatchStageId;
  inputSources: InputSourceRecord[];
  knowledgeMap?: ContentKnowledgeMapRecord;
  reviewTasks: ContentReviewTask[];
  assetReviews: AssetReviewRecord[];
  logs: GenerationLogEntry[];
  promptDrafts: PromptDraft[];
  now: string;
}): { gates: ContentBatchGateResult[]; recoveryTasks: ContentBatchRecoveryTask[] } {
  const { stageId, inputSources, knowledgeMap, reviewTasks, assetReviews, logs, promptDrafts, now } = input;
  const gates: ContentBatchGateResult[] = [];
  const recoveryTasks: ContentBatchRecoveryTask[] = [];

  if (stageId === 'selection' && !inputSources.some((source) => source.kind === 'sku-table' || source.purpose === 'product-brief')) {
    gates.push(gate(stageId, 'needs-input', '缺商品资料', '没有 SKU 表或产品资料，选品只能停留在草稿判断。', '登记 SKU 表或产品 Brief。'));
    recoveryTasks.push(recoveryTask(stageId, '补商品资料', '补齐 SKU 表、库存、价格或产品 Brief 后才能形成商品规划。', '登记商品与库存输入源。', 'knowledge-inputs', now));
  }

  if (stageId === 'intent' && !inputSources.some((source) => source.purpose === 'user-feedback')) {
    gates.push(gate(stageId, 'needs-input', '缺流量意图', '还没有评论、搜索词、客服问答或投放词包。', '登记用户反馈或流量输入源。'));
    recoveryTasks.push(recoveryTask(stageId, '补评论和搜索词', '补齐评论、搜索词或客服问答，避免凭空推断用户意图。', '登记用户反馈输入源。', 'knowledge-inputs', now));
  }

  if (stageId === 'modeling' && !knowledgeMap) {
    gates.push(gate(stageId, 'needs-input', '缺内容知识地图', '还没有把输入源整理成卖点、痛点、场景和证据矩阵。', '生成内容知识地图。'));
    recoveryTasks.push(recoveryTask(stageId, '生成内容知识地图', '从输入源、品牌知识库和素材审核结果生成可追溯事实层。', '打开内容知识地图。', 'knowledge-map', now));
  }

  if (stageId === 'selling' && knowledgeMap && knowledgeMap.coverage.gapCount > 0) {
    gates.push(gate(stageId, 'needs-review', '卖点缺口待处理', `内容知识地图仍有 ${knowledgeMap.coverage.gapCount} 个缺口。`, '补证据或送审。'));
  }

  if (stageId === 'matrix' && !matrixHandoffArtifacts({ knowledgeMap, reviewTasks, logs, promptDrafts }).length) {
    gates.push(gate(stageId, 'needs-input', '缺矩阵交接', '还没有把卖点、证据、场景和素材排成 Prompt、场景卡和补资源任务。', '打开 agents 处理矩阵交接。'));
    recoveryTasks.push(recoveryTask(stageId, '生成矩阵交接', '把内容知识地图转成 Prompt 草稿、场景卡和补资源任务。', '打开 agents 处理矩阵交接。', 'agents', now));
  }

  const manufacturingDrafts = promptDrafts.filter((draft) => promptDraftMatchesStage(draft, 'manufacturing'));
  if (stageId === 'manufacturing' && !manufacturingDrafts.length && !logs.some((item) => ['image', 'video', 'video-script'].includes(item.kind))) {
    gates.push(gate(stageId, 'needs-input', '缺制造产物', '还没有图片、视频脚本或视频 Prompt 产物。', '进入图片 / 视频制造工具。'));
    recoveryTasks.push(recoveryTask(stageId, '生成视频制造单', '选择已确认的场景和卖点，生成图片素材、视频 Prompt 或绿幕图。', '打开视频 Prompt 交接。', 'video-prompt', now));
    recoveryTasks.push(recoveryTask(stageId, '生成图片候选', '把已确认提示词送到图片生成，候选图完成后进入审核和素材库。', '打开图片生成。', 'image', now));
    recoveryTasks.push(recoveryTask(stageId, '生成绿幕文案图', '把口播脚本拆成标题卡、卖点卡和 CTA 卡，准备混剪交接。', '打开绿幕文案图。', 'image-green-screen', now));
  }

  const openReviewTasks = reviewTasks.filter((task) => task.status === 'open' || task.status === 'needs-evidence' || task.status === 'needs-material');
  if (stageId === 'review' && openReviewTasks.length > 0) {
    gates.push(gate(stageId, 'needs-review', '审核任务未完成', `还有 ${openReviewTasks.length} 个审核 / 补证据 / 补素材任务。`, '进入审核任务台处理。'));
    recoveryTasks.push(...openReviewTasks.slice(0, 4).map((task) =>
      recoveryTask(stageId, task.title, task.summary, '处理审核任务并记录人工决策。', 'knowledge-review', now, reviewArtifact(task)),
    ));
  }

  if (stageId === 'review') {
    const pendingAssetReviews = assetReviews.filter((review) => review.status === 'pending');
    if (pendingAssetReviews.length > 0) {
      gates.push(gate(stageId, 'needs-review', '候选素材待审核', `还有 ${pendingAssetReviews.length} 个候选素材等待人工通过、驳回或回炉。`, '进入素材库处理待审核素材。'));
      recoveryTasks.push(...pendingAssetReviews.slice(0, 4).map((review) =>
        recoveryTask(stageId, `审核 ${review.title}`, '判断候选素材是否可通过并入库，或记录原因后回炉重做。', '打开素材库审核。', 'assets', now, assetReviewArtifact(review)),
      ));
    }

    const unreviewedImportedAssets = inputSources.filter((source) =>
      source.purpose === 'successful-asset' &&
      Boolean(sourceAssetPath(source)) &&
      !hasReviewForInputSource(assetReviews, source),
    );
    if (unreviewedImportedAssets.length > 0) {
      gates.push(gate(stageId, 'needs-review', '成品视频待审核', `还有 ${unreviewedImportedAssets.length} 个手动导入的成品素材未进入素材审核。`, '进入素材库创建待审核记录。'));
      recoveryTasks.push(...unreviewedImportedAssets.slice(0, 4).map((source) =>
        recoveryTask(stageId, `审核 ${source.title}`, '判断第三方成品视频是否可通过并入库，或记录原因后回炉重做。', '打开素材库审核。', 'assets', now, sourceArtifact(source)),
      ));
    }

    const unreviewedLogs = manufacturingLogs(logs).filter((log) => !hasReviewForLog(assetReviews, log));
    if (unreviewedLogs.length > 0) {
      gates.push(gate(stageId, 'needs-review', '制造产物待送审', `还有 ${unreviewedLogs.length} 个图片 / 视频产物未形成素材审核记录。`, '进入素材库完成通过并入库或回炉判断。'));
      recoveryTasks.push(recoveryTask(
        stageId,
        '打开素材库审核候选素材',
        '把本批制造产物逐个标记为通过并入库、驳回或回炉重做。',
        '打开素材库处理待审核素材。',
        'assets',
        now,
        logArtifact(unreviewedLogs[0]),
      ));
    }

    const rejectedAssetReviews = assetReviews.filter((review) => review.status === 'rejected');
    if (rejectedAssetReviews.length > 0) {
      gates.push(gate(stageId, 'blocked', '有素材被驳回', '素材库存在已驳回产物，需要回炉或排除后再交付。', '查看素材审核记录。'));
      recoveryTasks.push(...rejectedAssetReviews.slice(0, 4).map((review) =>
        recoveryTask(stageId, `回炉 ${review.title}`, review.note || '素材已驳回，需要回炉重做或排除后再交付。', '打开素材库回炉重做。', 'assets', now, assetReviewArtifact(review)),
      ));
    }
  }

  if (stageId === 'optimization' && !performanceSources(inputSources).length) {
    gates.push(gate(stageId, 'needs-input', '缺投放表现', '还没有投放报表、预算、关键词或 ROI 输入源。', '登记投放表现输入源。'));
    recoveryTasks.push(recoveryTask(stageId, '登记投放表现', '补充投放报表、复制记录、点击转化或用户反馈，调优阶段才能判断下一轮素材方向。', '登记投放表现输入源。', 'knowledge-inputs', now));
  }

  if (stageId === 'optimization' && !hasRunReviewEvidence({ logs, promptDrafts, assetReviews })) {
    gates.push(gate(stageId, 'needs-review', '缺运行复盘', '还没有运行记录或复盘结论，无法判断哪些产物已交接、哪些需要补资源。', '写入运行复盘。'));
    recoveryTasks.push(recoveryTask(stageId, '写入运行复盘', '复盘交接结果、拦截原因、素材回写和下一轮补充信号。', '打开素材库复盘。', 'assets', now));
  }

  const uncoveredApprovedAssets = approvedAssetsMissingCoverage(knowledgeMap, assetReviews);
  const distilledDrafts = successfulAssetPromptDrafts(promptDrafts);
  if (stageId === 'feedback' && uncoveredApprovedAssets.length > 0) {
    gates.push(gate(stageId, 'needs-review', '素材覆盖待回写', `还有 ${uncoveredApprovedAssets.length} 个已通过素材未回写到内容知识地图。`, '回写素材覆盖。'));
    recoveryTasks.push(recoveryTask(
      stageId,
      '回写素材覆盖',
      '把已通过素材关联到卖点、痛点或场景组合，作为下一批内容依据。',
      '打开内容知识地图回写素材覆盖。',
      'knowledge-map',
      now,
      assetReviewArtifact(uncoveredApprovedAssets[0]),
    ));
  }

  if (stageId === 'feedback' && !assetReviews.some((review) => review.status === 'approved')) {
    gates.push(gate(stageId, 'needs-review', '缺可复盘素材', '还没有通过审核的素材，复盘只能记录草稿。', '先完成素材审核和交付。'));
    recoveryTasks.push(recoveryTask(stageId, '完成素材审核', '先在素材库把候选素材标记为通过并入库，复盘阶段才能沉淀成功经验。', '打开素材库审核。', 'assets', now));
  } else if (stageId === 'feedback' && assetReviews.some((review) => review.status === 'approved') && !distilledDrafts.length) {
    gates.push(gate(stageId, 'needs-review', '成功素材待沉淀', '已有通过素材，但还没有沉淀成可复用 Prompt 草稿。', '从素材库沉淀成功素材 Prompt。'));
    recoveryTasks.push(recoveryTask(
      stageId,
      '沉淀成功素材 Prompt',
      '从已通过素材反向沉淀 Prompt 和标签，后续可继续物化为 Skill。',
      '打开素材库沉淀提示词。',
      'assets',
      now,
      assetReviewArtifact(assetReviews.find((review) => review.status === 'approved')!),
    ));
  }

  return { gates, recoveryTasks };
}

function outputRefsForStage(input: {
  stageId: ContentBatchStageId;
  inputSources: InputSourceRecord[];
  knowledgeMap?: ContentKnowledgeMapRecord;
  reviewTasks: ContentReviewTask[];
  logs: GenerationLogEntry[];
  promptDrafts: PromptDraft[];
  assetReviews: AssetReviewRecord[];
}): ContentBatchArtifactRef[] {
  const { stageId, knowledgeMap, reviewTasks, logs, promptDrafts, assetReviews } = input;
  if (stageId === 'selection') {
    const maturity = buildIntakeMaturitySummary(input.inputSources);
    const manufacturing = buildManufacturingPlanProjection(input);
    const productPlan = buildProductPlanProjection({ inputSources: input.inputSources, intake: maturity, manufacturing });
    return productPlan.plannedCount
      ? [artifact('product-plan', 'current', `${productPlan.modeLabel} · ${productPlan.plannedCount}/${productPlan.candidateCount} 商品已分档 · ${productPlan.summary}`, undefined, 'content-batch')]
      : [];
  }
  if (stageId === 'modeling' && knowledgeMap) {
    return [artifact('content-knowledge-map', knowledgeMap.id, `${knowledgeMap.title} · ${knowledgeMap.coverage.readyPercent}% 就绪`, undefined, 'knowledge-map')];
  }
  if (stageId === 'selling' && knowledgeMap) {
    return [
      artifact('selling-point', `${knowledgeMap.id}:selling`, `${knowledgeMap.sellingPoints.length} 个卖点候选`, undefined, 'knowledge-map'),
      artifact('evidence', `${knowledgeMap.id}:evidence`, `${knowledgeMap.evidence.length} 条证据`, undefined, 'knowledge-map'),
    ];
  }
  if (stageId === 'matrix') {
    return matrixHandoffArtifacts({ knowledgeMap, reviewTasks, logs, promptDrafts }).slice(0, 10);
  }
  if (stageId === 'manufacturing') {
    const plan = buildManufacturingPlanProjection(input);
    return [
      artifact('manufacturing-plan', 'current', `${plan.tierLabel} · ${plan.tierReason}`, undefined, 'content-batch'),
      ...promptDrafts.filter((draft) => promptDraftMatchesStage(draft, stageId)).slice(0, 8).map(promptDraftArtifact),
      ...logs.filter((log) => logMatchesStage(log, stageId)).slice(0, 8).map(logArtifact),
    ].slice(0, 10);
  }
  if (stageId === 'review') {
    return [
      ...reviewTasks.filter((task) => task.status === 'approved').slice(0, 6).map(reviewArtifact),
      ...assetReviews.filter((review) => review.status === 'approved').slice(0, 6).map(assetReviewArtifact),
    ];
  }
  if (stageId === 'optimization') {
    return [
      ...performanceSources(input.inputSources).slice(0, 4).map(sourceArtifact),
      ...runReviewArtifacts({ logs, promptDrafts, assetReviews }).map((ref) => ({
        ...ref,
        kind: ref.kind === 'input-source' ? 'run-review' : ref.kind,
        targetModule: 'assets',
      })),
    ].slice(0, 8);
  }
  if (stageId === 'feedback') {
    return [
      ...promptDrafts.filter((draft) => promptDraftMatchesStage(draft, stageId)).slice(0, 4).map(promptDraftArtifact),
      ...assetReviews.filter((review) => review.status === 'approved').slice(0, 4).map(assetReviewArtifact),
      ...logs.filter((log) => log.status === 'succeeded').slice(0, 4).map(logArtifact),
    ].slice(0, 10);
  }
  return [];
}

function buildStageRuns(input: {
  batchId: string;
  currentStageId: ContentBatchStageId;
  inputSources: InputSourceRecord[];
  knowledgeMap?: ContentKnowledgeMapRecord;
  reviewTasks: ContentReviewTask[];
  assetReviews: AssetReviewRecord[];
  logs: GenerationLogEntry[];
  promptDrafts: PromptDraft[];
  now: string;
}): ContentBatchStageRun[] {
  const currentIndex = STAGE_IDS.indexOf(input.currentStageId);
  return STAGE_IDS.map((stageId, index) => {
    const inputRefs = input.inputSources.filter((source) => sourceMatchesStage(source, stageId)).slice(0, 8).map(sourceArtifact);
    const outputRefs = outputRefsForStage({ ...input, stageId });
    const { gates, recoveryTasks } = gatesForStage({ ...input, stageId });
    const agentRunRefs = [
      ...input.promptDrafts.filter((draft) => promptDraftMatchesStage(draft, stageId)).slice(0, 3).map(promptDraftArtifact),
      ...input.logs.filter((log) => logMatchesStage(log, stageId)).slice(0, 3).map(logArtifact),
    ];
    return {
      id: `${input.batchId}:${stageId}`,
      batchId: input.batchId,
      stageId,
      status: stageStatus({
        stageId,
        index,
        currentIndex: currentIndex >= 0 ? currentIndex : 0,
        inputRefs,
        outputRefs,
        gateResults: gates,
        recoveryTasks,
      }),
      inputRefs,
      outputRefs,
      gateResults: gates.length ? gates : [gate(stageId, 'passed', `${STAGE_TITLES[stageId]}门禁`, '当前阶段没有阻断项。')],
      recoveryTasks,
      agentRunRefs,
      updatedAt: input.now,
    };
  });
}

function inferCurrentStageId(existing: ContentBatchRecord | undefined, stageRuns: ContentBatchStageRun[]): ContentBatchStageId {
  if (existing?.currentStageId && STAGE_IDS.includes(existing.currentStageId)) {
    const existingStage = stageRuns.find((stage) => stage.stageId === existing.currentStageId);
    if (existingStage?.status !== 'approved') return existing.currentStageId;
  }
  const actionable = stageRuns.find((stage) =>
    stage.status === 'blocked' ||
    stage.status === 'needs-human' ||
    stage.status === 'ready' ||
    stage.status === 'draft',
  );
  return actionable?.stageId ?? 'feedback';
}

export class ContentBatchApplicationService {
  constructor(
    private readonly batches: ContentBatchStore,
    private readonly inputSources: InputSourceStore,
    private readonly knowledgeMaps: ContentKnowledgeMapStore,
    private readonly reviewTasks: ContentReviewTaskStore,
    private readonly assetReviews: AssetReviewStore,
    private readonly logs: GenerationLogStore,
    private readonly promptDrafts: PromptDraftStore,
  ) {}

  async list(workspacePath: string): Promise<ContentBatchRecord[]> {
    const records = await this.batches.list(workspacePath);
    if (records.length) return Promise.all(records.map((record) => this.project(record)));
    const created = await this.build({ workspacePath });
    return [created];
  }

  async build(input: BuildContentBatchInput): Promise<ContentBatchRecord> {
    const now = new Date().toISOString();
    const maps = await this.knowledgeMaps.list(input.workspacePath);
    const sourceMap = maps.find((map) => map.id === input.contentKnowledgeMapId) ?? maps[0];
    const batchId = randomUUID();
    const draft: ContentBatchRecord = {
      id: batchId,
      workspacePath: input.workspacePath,
      title: cleanText(input.title, sourceMap?.title?.replace(/内容知识地图$/g, '制造批次') || '电商短视频制造批次'),
      objective: cleanText(
        input.objective,
        sourceMap
          ? `把 ${sourceMap.title} 转成可审核的视频制造单和素材包。`
          : '从输入源、知识地图和素材记录出发，推进一批可审核的短视频制造单。',
      ),
      ownerIds: [],
      status: 'active',
      currentStageId: 'selection',
      sourceKnowledgeMapId: sourceMap?.id,
      sourceKnowledgeMapTitle: sourceMap?.title,
      intakeSummary: { inputSourceCount: 0, convertedCount: 0, blockedCount: 0, coveragePercent: 0, missingInputs: [] },
      stageRuns: [],
      createdAt: now,
      updatedAt: now,
    };
    const projected = await this.project(draft);
    return this.batches.save(projected);
  }

  async advanceStage(input: AdvanceContentBatchStageInput): Promise<ContentBatchRecord> {
    const records = await this.batches.list(input.workspacePath);
    const existing = records.find((record) => record.id === input.batchId);
    if (!existing) throw new Error(`内容批次不存在: ${input.batchId}`);
    const projected = await this.project(existing);
    const currentIndex = activeStageIndex(projected);
    const nextStageId = input.stageId && STAGE_IDS.includes(input.stageId)
      ? input.stageId
      : STAGE_IDS[Math.min(currentIndex + 1, STAGE_IDS.length - 1)];
    const updated = await this.project({
      ...projected,
      currentStageId: nextStageId,
      status: nextStageId === 'feedback' && projected.stageRuns.every((stage) => stage.status === 'approved')
        ? 'completed'
        : 'active',
      updatedAt: new Date().toISOString(),
    }, true);
    return this.batches.save(updated);
  }

  private async project(record: ContentBatchRecord, preserveCurrentStage = false): Promise<ContentBatchRecord> {
    const now = new Date().toISOString();
    const [
      inputSources,
      knowledgeMaps,
      reviewTasks,
      assetReviews,
      logs,
      promptDrafts,
    ] = await Promise.all([
      this.inputSources.list(record.workspacePath),
      this.knowledgeMaps.list(record.workspacePath),
      this.reviewTasks.list(record.workspacePath),
      this.assetReviews.list(record.workspacePath),
      this.logs.list(record.workspacePath),
      this.promptDrafts.list(record.workspacePath),
    ]);
    const knowledgeMap = knowledgeMaps.find((map) => map.id === record.sourceKnowledgeMapId) ?? knowledgeMaps[0];
    const intakeSummary = buildIntakeSummary({
      inputSources,
      knowledgeMap,
      promptDrafts,
      logs,
      assetReviews,
      now,
    });
    const firstPassStageRuns = buildStageRuns({
      batchId: record.id,
      currentStageId: record.currentStageId,
      inputSources,
      knowledgeMap,
      reviewTasks,
      assetReviews,
      logs,
      promptDrafts,
      now,
    });
    const currentStageId = preserveCurrentStage ? record.currentStageId : inferCurrentStageId(record, firstPassStageRuns);
    const stageRuns = currentStageId === record.currentStageId
      ? firstPassStageRuns
      : buildStageRuns({
        batchId: record.id,
        currentStageId,
        inputSources,
        knowledgeMap,
        reviewTasks,
        assetReviews,
        logs,
        promptDrafts,
        now,
      });
    const blocked = stageRuns.some((stage) => stage.status === 'blocked');
    return {
      ...record,
      status: record.status === 'archived'
        ? record.status
        : blocked
          ? 'blocked'
          : record.status === 'completed'
            ? 'completed'
            : 'active',
      currentStageId,
      sourceKnowledgeMapId: knowledgeMap?.id,
      sourceKnowledgeMapTitle: knowledgeMap?.title,
      intakeSummary,
      stageRuns,
      updatedAt: now,
    };
  }
}
