import { randomUUID } from 'node:crypto';
import type {
  BrandCommandActionRecord,
  BrandCommandCampaignCell,
  BrandCommandCenterRecord,
  BrandCommandDecisionCheck,
  BrandCommandObjective,
  BrandCommandQueueItem,
  BrandCommandResourceBundle,
  BrandCommandSignal,
  BrandObjectiveType,
  BuildBrandCommandCenterInput,
  ContentKnowledgeMapCoverageDimensions,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentKnowledgeMapTeamSyncSummary,
  ContentReviewTask,
} from '../../shared/types';

interface BrandCommandReviewGate {
  enabled: boolean;
  approvedRowIds: Set<string>;
}

function compactText(value: string | undefined, fallback = ''): string {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function clip(value: string, max = 160): string {
  const text = compactText(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function uniqueStrings(values: Array<string | undefined>, limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = compactText(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function allMatrixRows(map: ContentKnowledgeMapRecord): ContentKnowledgeMapMatrixRow[] {
  return [...map.sellingPoints, ...map.painPoints, ...map.scenarios];
}

function uniqueRows(rows: ContentKnowledgeMapMatrixRow[], limit = 12): ContentKnowledgeMapMatrixRow[] {
  const seen = new Set<string>();
  const result: ContentKnowledgeMapMatrixRow[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    result.push(row);
    if (result.length >= limit) break;
  }
  return result;
}

function reviewGateFor(map: ContentKnowledgeMapRecord, reviewTasks?: ContentReviewTask[]): BrandCommandReviewGate {
  if (!reviewTasks) return { enabled: false, approvedRowIds: new Set() };
  const approvedRowIds = new Set(
    reviewTasks
      .filter((task) =>
        task.sourceKnowledgeMapId === map.id &&
        task.status === 'approved' &&
        (task.targetType === 'selling-point' || task.targetType === 'pain-point' || task.targetType === 'scenario') &&
        Boolean(task.targetId),
      )
      .map((task) => task.targetId as string),
  );
  return { enabled: true, approvedRowIds };
}

function rowSearchText(row: ContentKnowledgeMapMatrixRow): string {
  return [
    row.title,
    row.summary,
    ...row.tags,
    ...(row.performanceTags ?? []),
    ...(row.dimensions?.audiences ?? []),
    ...(row.dimensions?.channels ?? []),
    ...(row.dimensions?.contentFormats ?? []),
    ...(row.dimensions?.useCases ?? []),
  ].join(' ');
}

function firstRowMatching(
  map: ContentKnowledgeMapRecord,
  patterns: RegExp[],
): ContentKnowledgeMapMatrixRow | undefined {
  return allMatrixRows(map).find((row) => patterns.some((pattern) => pattern.test(rowSearchText(row))));
}

function mergeDimensions(
  sources: Array<ContentKnowledgeMapCoverageDimensions | undefined>,
  limit = 12,
): ContentKnowledgeMapCoverageDimensions | undefined {
  const audiences = uniqueStrings(sources.flatMap((item) => item?.audiences ?? []), limit);
  const channels = uniqueStrings(sources.flatMap((item) => item?.channels ?? []), limit);
  const stages = uniqueStrings(sources.flatMap((item) => item?.stages ?? []), limit);
  const contentFormats = uniqueStrings(sources.flatMap((item) => item?.contentFormats ?? []), limit);
  const useCases = uniqueStrings(sources.flatMap((item) => item?.useCases ?? []), limit);
  const dimensions: ContentKnowledgeMapCoverageDimensions = {
    ...(audiences.length ? { audiences } : {}),
    ...(channels.length ? { channels } : {}),
    ...(stages.length ? { stages } : {}),
    ...(contentFormats.length ? { contentFormats } : {}),
    ...(useCases.length ? { useCases } : {}),
  };
  return Object.keys(dimensions).length ? dimensions : undefined;
}

function dimensionsFromRows(
  rows: ContentKnowledgeMapMatrixRow[],
  extra?: ContentKnowledgeMapCoverageDimensions,
): ContentKnowledgeMapCoverageDimensions | undefined {
  return mergeDimensions([...rows.map((row) => row.dimensions), extra]);
}

function rowsForSignal(map: ContentKnowledgeMapRecord, signal: BrandCommandSignal): ContentKnowledgeMapMatrixRow[] {
  const relatedIds = new Set(signal.relatedMapRowIds);
  if (!relatedIds.size) return [];
  return allMatrixRows(map).filter((row) => relatedIds.has(row.id));
}

function rowsForObjective(
  map: ContentKnowledgeMapRecord,
  objective: BrandCommandObjective,
  signals: BrandCommandSignal[],
): ContentKnowledgeMapMatrixRow[] {
  const linkedSignalIds = new Set(objective.signalIds);
  const relatedIds = new Set(
    signals
      .filter((signal) => linkedSignalIds.has(signal.id))
      .flatMap((signal) => signal.relatedMapRowIds),
  );
  if (!relatedIds.size) return [];
  return allMatrixRows(map).filter((row) => relatedIds.has(row.id));
}

function defaultChannelsFor(type: BrandObjectiveType): string[] {
  if (type === 'risk-control' || type === 'evidence-gap' || type === 'material-gap') return ['审核台', '私域'];
  return ['小红书', '抖音', '私域'];
}

function objectiveTitle(type: BrandObjectiveType): string {
  const labels: Record<BrandObjectiveType, string> = {
    acquisition: '拉新获客',
    conversion: '转化推进',
    'objection-handling': '异议解释',
    'trust-building': '信任建设',
    'price-defense': '价格防守',
    'risk-control': '风险拦截',
    'evidence-gap': '补证据',
    'material-gap': '补素材',
    retention: '复购维护',
  };
  return labels[type];
}

function queueStatusFor(checks: BrandCommandDecisionCheck[]): BrandCommandQueueItem['status'] {
  if (checks.some((check) => check.status === 'blocked')) return 'blocked';
  if (checks.some((check) => check.status === 'needs-resource')) return 'needs-resource';
  if (checks.some((check) => check.status === 'needs-review')) return 'needs-review';
  return 'ready';
}

function buildDecisionChecks(
  map: ContentKnowledgeMapRecord,
  bundle: BrandCommandResourceBundle,
  reviewGate: BrandCommandReviewGate,
): BrandCommandDecisionCheck[] {
  const coverageRowIds = bundle.coverageRowIds ?? [];
  const approvedCoverageRowIds = bundle.approvedCoverageRowIds ?? [];
  const reviewStatus = !reviewGate.enabled
    ? undefined
    : !coverageRowIds.length
      ? {
          status: 'needs-review' as const,
          message: '资源包没有绑定可审核的内容组合。',
          recoveryAction: '重新生成资源包',
        }
      : approvedCoverageRowIds.length === coverageRowIds.length
        ? {
            status: 'passed' as const,
            message: `已通过 ${approvedCoverageRowIds.length} 个内容组合审核。`,
          }
        : {
            status: 'needs-review' as const,
            message: `还有 ${coverageRowIds.length - approvedCoverageRowIds.length} 个内容组合未通过审核。`,
            recoveryAction: '发起审核或处理审核任务',
          };
  return [
    {
      key: 'evidence',
      label: '证据',
      status: bundle.evidenceRefs.length ? 'passed' : 'needs-resource',
      message: bundle.evidenceRefs.length ? `已关联 ${bundle.evidenceRefs.length} 条证据。` : '缺少可引用证据。',
      recoveryAction: bundle.evidenceRefs.length ? undefined : '创建补证据任务',
    },
    ...(reviewStatus ? [{
      key: 'review',
      label: '审核',
      status: reviewStatus.status,
      message: reviewStatus.message,
      recoveryAction: reviewStatus.recoveryAction,
    }] : []),
    {
      key: 'brand-boundary',
      label: '品牌边界',
      status: map.constraints.length ? 'passed' : 'needs-review',
      message: map.constraints.length ? '已带入品牌规则和禁用表达。' : '需要品牌负责人确认可用表达。',
      recoveryAction: map.constraints.length ? undefined : '发起品牌审核',
    },
    {
      key: 'material',
      label: '素材',
      status: bundle.materialRefs.length ? 'passed' : 'needs-resource',
      message: bundle.materialRefs.length ? `已关联 ${bundle.materialRefs.length} 条素材线索。` : '缺少可直接交接的图片、视频或证明素材。',
      recoveryAction: bundle.materialRefs.length ? undefined : '创建补素材清单',
    },
    {
      key: 'risk',
      label: '风险',
      status: map.gaps.some((gap) => /禁用|风险|审核|证据/.test(gap)) ? 'needs-review' : 'passed',
      message: map.gaps.some((gap) => /禁用|风险|审核|证据/.test(gap)) ? '存在需人工确认的证据或审核缺口。' : '未发现高风险缺口。',
      recoveryAction: '送审或改写',
    },
  ];
}

function signalFromPainPoint(map: ContentKnowledgeMapRecord): BrandCommandSignal | null {
  const row = map.painPoints[0];
  if (!row) return null;
  return {
    id: randomUUID(),
    type: 'feedback-pain',
    title: row.title,
    summary: row.summary,
    sourceLabel: '评论痛点矩阵',
    businessValue: 82,
    evidenceReadiness: row.evidenceRefs.length ? 76 : 36,
    urgency: 72,
    riskLevel: row.status === 'ready' ? 38 : 64,
    productionCost: map.scenarios.length ? 42 : 68,
    recommendedObjectiveType: 'objection-handling',
    riskBoundary: '评论不能证明产品事实，执行前必须回查证据。',
    relatedMapRowIds: [row.id],
  };
}

function signalFromCompetitor(map: ContentKnowledgeMapRecord): BrandCommandSignal | null {
  const row = firstRowMatching(map, [/竞品|竞对|对标|差异化/]);
  if (!row) return null;
  return {
    id: randomUUID(),
    type: 'competitor-action',
    title: row.title,
    summary: row.summary,
    sourceLabel: '竞品观察',
    businessValue: 76,
    evidenceReadiness: row.evidenceRefs.length ? 58 : 24,
    urgency: 60,
    riskLevel: 72,
    productionCost: row.materialRefs?.length ? 42 : 62,
    recommendedObjectiveType: /价格|贵|便宜|平替/.test(rowSearchText(row)) ? 'price-defense' : 'risk-control',
    riskBoundary: '竞品只能作为结构和差异化机会，不能复制标题、构图、分镜或可识别表达。',
    relatedMapRowIds: [row.id],
  };
}

function signalFromMaterialPerformance(map: ContentKnowledgeMapRecord): BrandCommandSignal | null {
  const row = allMatrixRows(map).find((item) => (item.performanceTags ?? []).length > 0);
  if (!row) return null;
  return {
    id: randomUUID(),
    type: 'material-performance',
    title: row.title,
    summary: `${row.summary} 表现标签：${row.performanceTags?.join(' / ')}`,
    sourceLabel: '素材表现回写',
    businessValue: 80,
    evidenceReadiness: row.evidenceRefs.length ? 68 : 34,
    urgency: 58,
    riskLevel: 36,
    productionCost: row.materialRefs?.length ? 30 : 54,
    recommendedObjectiveType: /复购|私域|老客/.test(rowSearchText(row)) ? 'retention' : 'acquisition',
    riskBoundary: '素材表现只证明内容组合有效，不能自动变成产品事实。',
    relatedMapRowIds: [row.id],
  };
}

function signalFromAdPerformance(map: ContentKnowledgeMapRecord): BrandCommandSignal | null {
  const row = firstRowMatching(map, [/投放|点击|转化|CTR|CPA|ROI|线索|加购/]);
  if (!row) return null;
  return {
    id: randomUUID(),
    type: 'ad-performance',
    title: row.title,
    summary: row.summary,
    sourceLabel: '投放表现',
    businessValue: 78,
    evidenceReadiness: row.evidenceRefs.length ? 62 : 28,
    urgency: 66,
    riskLevel: 46,
    productionCost: row.materialRefs?.length ? 34 : 56,
    recommendedObjectiveType: 'conversion',
    riskBoundary: '投放表现只能作为优化信号，不能替代产品事实和证据。',
    relatedMapRowIds: [row.id],
  };
}

function signalFromTrend(map: ContentKnowledgeMapRecord): BrandCommandSignal | null {
  const row = firstRowMatching(map, [/热点|趋势|高温|夏日|露营季|开学|大促|节日|搜索/]);
  if (!row) return null;
  return {
    id: randomUUID(),
    type: 'trend',
    title: row.title,
    summary: row.summary,
    sourceLabel: '平台热点 / 搜索问题',
    businessValue: 72,
    evidenceReadiness: row.evidenceRefs.length ? 58 : 30,
    urgency: 76,
    riskLevel: 42,
    productionCost: row.materialRefs?.length ? 36 : 58,
    recommendedObjectiveType: 'acquisition',
    riskBoundary: '热点和搜索问题不能绕过证据、品牌口径和平台规则。',
    relatedMapRowIds: [row.id],
  };
}

function signalFromBrandRisk(map: ContentKnowledgeMapRecord): BrandCommandSignal | null {
  const highRiskPattern = /禁用|绝对|全网最|100%|保证|医疗|治疗|儿童|安全承诺|合规风险|高风险|违规|审核风险/;
  const riskText = [
    ...map.gaps,
    ...map.constraints,
    ...allMatrixRows(map).map(rowSearchText),
  ].join(' ');
  if (!highRiskPattern.test(riskText)) return null;
  const row = firstRowMatching(map, [highRiskPattern]);
  return {
    id: randomUUID(),
    type: 'brand-risk',
    title: row?.title ?? '品牌风险需要处理',
    summary: row?.summary ?? map.gaps.find((gap) => highRiskPattern.test(gap)) ?? '存在需要人工确认的品牌或平台风险。',
    sourceLabel: '品牌风险 / 平台规则',
    businessValue: 74,
    evidenceReadiness: row?.evidenceRefs.length ? 48 : 20,
    urgency: 78,
    riskLevel: 84,
    productionCost: 46,
    recommendedObjectiveType: 'risk-control',
    riskBoundary: '禁用表达、无证据承诺和平台风险必须硬拦截或送审改写。',
    relatedMapRowIds: row ? [row.id] : [],
  };
}

function signalFromScenario(map: ContentKnowledgeMapRecord): BrandCommandSignal | null {
  const row = map.scenarios[0];
  if (!row) return null;
  return {
    id: randomUUID(),
    type: 'material-performance',
    title: row.title,
    summary: row.summary,
    sourceLabel: '场景矩阵',
    businessValue: 74,
    evidenceReadiness: row.evidenceRefs.length ? 70 : 42,
    urgency: 56,
    riskLevel: 34,
    productionCost: map.promptDraftIds.length ? 36 : 58,
    recommendedObjectiveType: 'acquisition',
    riskBoundary: '素材表现只作为复盘信号，不能自动变成产品事实。',
    relatedMapRowIds: [row.id],
  };
}

function signalFromGap(map: ContentKnowledgeMapRecord): BrandCommandSignal | null {
  const gap = map.gaps[0];
  if (!gap) return null;
  const isEvidence = /证据|主张/.test(gap);
  return {
    id: randomUUID(),
    type: isEvidence ? 'brand-risk' : 'manual',
    title: isEvidence ? '证据缺口需要处理' : '内容地图缺口需要处理',
    summary: gap,
    sourceLabel: '知识地图缺口',
    businessValue: 66,
    evidenceReadiness: 22,
    urgency: 64,
    riskLevel: isEvidence ? 78 : 52,
    productionCost: 55,
    recommendedObjectiveType: isEvidence ? 'evidence-gap' : 'material-gap',
    riskBoundary: '缺口未处理前不能进入确定性发布交接。',
    relatedMapRowIds: [],
  };
}

function dedupeSignals(signals: BrandCommandSignal[], limit = 8): BrandCommandSignal[] {
  const seen = new Set<string>();
  const result: BrandCommandSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.type}:${signal.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(signal);
    if (result.length >= limit) break;
  }
  return result;
}

function buildObjectives(signals: BrandCommandSignal[], map: ContentKnowledgeMapRecord): BrandCommandObjective[] {
  return signals.map((signal, index) => {
    const dimensions = dimensionsFromRows(rowsForSignal(map, signal));
    const channels = dimensions?.channels?.length ? dimensions.channels : defaultChannelsFor(signal.recommendedObjectiveType);
    return {
      id: randomUUID(),
      type: signal.recommendedObjectiveType,
      title: `${objectiveTitle(signal.recommendedObjectiveType)}：${clip(signal.title, 28)}`,
      summary: signal.summary,
      priority: index === 0 ? 'P0' : index === 1 ? 'P1' : 'P2',
      channels,
      dimensions,
      successCriteria: [
        '产物只引用已记录来源。',
        '发布检查通过后再交给外部渠道。',
        signal.recommendedObjectiveType === 'material-gap' ? '生成补素材清单。' : '形成可复用 Prompt 或场景卡。',
      ],
      signalIds: [signal.id],
    };
  });
}

function buildBundle(
  map: ContentKnowledgeMapRecord,
  objective: BrandCommandObjective,
  signals: BrandCommandSignal[],
  reviewGate: BrandCommandReviewGate,
): BrandCommandResourceBundle {
  const matrixRows = allMatrixRows(map);
  const objectiveRows = rowsForObjective(map, objective, signals);
  const bundleRows = uniqueRows([
    ...(objectiveRows.length ? objectiveRows : []),
    ...map.sellingPoints,
    ...map.painPoints.slice(0, 2),
    ...map.scenarios,
    ...(objectiveRows.length ? [] : matrixRows),
  ], 12);
  const sellingPointIds = new Set(map.sellingPoints.map((row) => row.id));
  const painPointIds = new Set(map.painPoints.map((row) => row.id));
  const scenarioIds = new Set(map.scenarios.map((row) => row.id));
  const dimensions = dimensionsFromRows(objectiveRows.length ? objectiveRows : matrixRows, objective.dimensions);
  const coverageRowIds = bundleRows.map((row) => row.id);
  const approvedCoverageRowIds = reviewGate.enabled
    ? coverageRowIds.filter((rowId) => reviewGate.approvedRowIds.has(rowId))
    : undefined;
  const sellingPointRefs = bundleRows.filter((row) => sellingPointIds.has(row.id)).slice(0, 4).map((row) => row.title);
  const sceneRefs = bundleRows
    .filter((row) => scenarioIds.has(row.id) || painPointIds.has(row.id))
    .slice(0, 4)
    .map((row) => row.title);
  const evidenceRefs = uniqueStrings([
    ...bundleRows.flatMap((row) => row.evidenceRefs),
  ], 12);
  const materialRefs = uniqueStrings(bundleRows.flatMap((row) => row.materialRefs ?? []), 12);
  const missingReviewCount = reviewGate.enabled && approvedCoverageRowIds
    ? coverageRowIds.length - approvedCoverageRowIds.length
    : 0;
  const gaps = uniqueStrings([
    evidenceRefs.length ? '' : '缺证据',
    materialRefs.length ? '' : '缺素材',
    missingReviewCount > 0 ? `${missingReviewCount} 个内容组合未通过审核` : '',
    map.status === 'ready' ? '' : '知识地图待补齐',
    ...map.gaps.slice(0, 3),
  ], 8);
  const readyChecks = [
    sellingPointRefs.length > 0,
    evidenceRefs.length > 0,
    sceneRefs.length > 0,
    materialRefs.length > 0,
    !reviewGate.enabled || missingReviewCount === 0,
    map.constraints.length > 0,
    gaps.length === 0,
  ];
  return {
    id: randomUUID(),
    title: `${objective.title}资源包`,
    objectiveId: objective.id,
    sourceKnowledgeMapId: map.id,
    coverageRowIds,
    approvedCoverageRowIds,
    sellingPointRefs,
    evidenceRefs,
    sceneRefs,
    sceneCardIds: map.sceneCardIds.slice(0, 4),
    promptDraftIds: map.promptDraftIds.slice(0, 4),
    materialRefs,
    sopRefs: [],
    dimensions,
    constraints: map.constraints.slice(0, 8),
    gaps,
    handoffStatus: 'none',
    handoffRefs: [],
    readyPercent: Math.round((readyChecks.filter(Boolean).length / readyChecks.length) * 100),
  };
}

function buildQueueItems(
  cellId: string,
  bundle: BrandCommandResourceBundle,
  checks: BrandCommandDecisionCheck[],
  now: string,
  dimensions?: ContentKnowledgeMapCoverageDimensions,
): BrandCommandQueueItem[] {
  const status = queueStatusFor(checks);
  const blockedReason = checks.find((check) => check.status !== 'passed')?.message;
  const recoveryAction = checks.find((check) => check.status !== 'passed')?.recoveryAction;
  const mainAction: BrandCommandQueueItem = {
    id: randomUUID(),
    campaignCellId: cellId,
    actionType: status === 'needs-resource' ? 'create-material-gap-list' : status === 'needs-review' ? 'request-review' : 'generate-prompt-draft',
    title: status === 'ready' ? '生成内容 Prompt 草稿' : status === 'needs-review' ? '送品牌审核' : '创建补资源任务',
    summary: status === 'ready'
      ? '基于资源包生成可复制到 Prompt 工作台的草稿。'
      : blockedReason || '需要先处理发布检查问题。',
    status,
    blockedReason: status === 'ready' ? undefined : blockedReason,
    recoveryAction,
    outputTarget: status === 'ready' ? 'prompt-draft' : status === 'needs-review' ? 'review-task' : 'material-gap',
    resourceBundleId: bundle.id,
    dimensions,
    createdAt: now,
    updatedAt: now,
  };
  const evidenceTask: BrandCommandQueueItem | null = bundle.evidenceRefs.length ? null : {
    id: randomUUID(),
    campaignCellId: cellId,
    actionType: 'request-evidence',
    title: '请求补证据',
    summary: '为资源包补充产品事实、测试、用户原声或品牌确认。',
    status: 'needs-resource',
    blockedReason: '缺少证据。',
    recoveryAction: '补充产品文档、测试记录或审核确认。',
    outputTarget: 'evidence-task',
    resourceBundleId: bundle.id,
    dimensions,
    createdAt: now,
    updatedAt: now,
  };
  return evidenceTask ? [mainAction, evidenceTask] : [mainAction];
}

export function buildBrandCommandCenterDraft(
  input: BuildBrandCommandCenterInput,
  map: ContentKnowledgeMapRecord | undefined,
  teamSync: ContentKnowledgeMapTeamSyncSummary,
  reviewTasks?: ContentReviewTask[],
): BrandCommandCenterRecord {
  const now = new Date().toISOString();
  if (!map) {
    return {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      title: compactText(input.title, '品牌战情室'),
      status: 'blocked',
      syncStatus: teamSync.status,
      signals: [],
      objectives: [],
      resourceBundles: [],
      campaignCells: [],
      queueItems: [],
      actionRecords: [],
      constraints: [],
      gaps: ['缺少内容知识地图，无法生成资源包和执行队列。'],
      teamSync,
      createdAt: now,
      updatedAt: now,
    };
  }

  const signals = [
    signalFromPainPoint(map),
    signalFromCompetitor(map),
    signalFromMaterialPerformance(map),
    signalFromAdPerformance(map),
    signalFromTrend(map),
    signalFromBrandRisk(map),
    signalFromScenario(map),
    signalFromGap(map),
  ].filter((item): item is BrandCommandSignal => Boolean(item));
  const uniqueSignals = dedupeSignals(signals);
  const objectives = buildObjectives(uniqueSignals, map);
  const reviewGate = reviewGateFor(map, reviewTasks);
  const resourceBundles = objectives.map((objective) => buildBundle(map, objective, uniqueSignals, reviewGate));
  const campaignCells: BrandCommandCampaignCell[] = [];
  const queueItems: BrandCommandQueueItem[] = [];
  for (const objective of objectives) {
    const bundle = resourceBundles.find((item) => item.objectiveId === objective.id);
    if (!bundle) continue;
    const cellId = randomUUID();
    const decisionChecks = buildDecisionChecks(map, bundle, reviewGate);
    const cellChannels = bundle.dimensions?.channels?.length ? bundle.dimensions.channels : objective.channels;
    const cellDimensions = mergeDimensions([bundle.dimensions, objective.dimensions, { channels: cellChannels }]);
    const cellQueueItems = buildQueueItems(cellId, bundle, decisionChecks, now, cellDimensions);
    campaignCells.push({
      id: cellId,
      title: objective.title,
      objectiveId: objective.id,
      ownerRole: objective.priority === 'P0' ? '战役负责人' : '内容运营',
      agentRole: '内容工程 Agent',
      channels: cellChannels,
      dimensions: cellDimensions,
      timeWindow: objective.priority === 'P0' ? '今天' : '本周',
      resourceBundleId: bundle.id,
      decisionChecks,
      queueItemIds: cellQueueItems.map((item) => item.id),
    });
    queueItems.push(...cellQueueItems);
  }
  const actionRecords: BrandCommandActionRecord[] = [{
    id: randomUUID(),
    actionType: 'create-material-gap-list',
    title: '生成品牌战情室草稿',
    outcome: 'recorded',
    actorLabel: '本机工作台',
    inputSummary: map.title,
    outputSummary: `生成 ${uniqueSignals.length} 个信号、${resourceBundles.length} 个资源包和 ${queueItems.length} 个队列动作。`,
    createdAt: now,
  }];
  const gaps = uniqueStrings([
    ...map.gaps.slice(0, 6),
    resourceBundles.some((bundle) => bundle.evidenceRefs.length === 0) ? '部分资源包缺证据。' : '',
    resourceBundles.some((bundle) => bundle.materialRefs.length === 0) ? '部分资源包缺素材。' : '',
    map.syncStatus === 'synced' ? '' : '当前知识来源仍是本机草稿，团队共享需接入 Bugu 业务后端。',
  ], 10);
  return {
    id: randomUUID(),
    workspacePath: input.workspacePath,
    title: compactText(input.title, `${map.title.replace(/内容知识地图$/g, '').trim()} 品牌战情室`),
    status: queueItems.some((item) => item.status === 'ready') ? 'active' : 'needs-review',
    syncStatus: teamSync.status,
    sourceKnowledgeMapId: map.id,
    sourceKnowledgeMapTitle: map.title,
    signals: uniqueSignals,
    objectives,
    resourceBundles,
    campaignCells,
    queueItems,
    actionRecords,
    constraints: map.constraints,
    gaps,
    teamSync,
    createdAt: now,
    updatedAt: now,
  };
}
