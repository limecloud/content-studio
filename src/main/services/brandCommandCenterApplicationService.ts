import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  BrandCommandActionRecordsExportResult,
  BrandCommandActionOutcome,
  BrandCommandActionRecord,
  BrandCommandConfirmStage,
  BrandCommandCenterRecord,
  BrandCommandQueueItem,
  BuildBrandCommandCenterInput,
  ConfirmBrandCommandStageInput,
  ContentMaterialCoverageResult,
  ContentKnowledgeRelease,
  ContentKnowledgeReleaseReference,
  ContentKnowledgeMapTeamSyncSummary,
  ContentKnowledgeMapCoverageDimensions,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentReviewTask,
  CreateSceneCardFromContentInput,
  ExportBrandCommandActionRecordsInput,
  RecordBrandCommandReviewInput,
  RecordBrandCommandActionInput,
  RefreshBrandCommandActionsInput,
  StartWorkflowRunInput,
  WorkflowRunRecord,
} from '../../shared/types';
import { buildBrandCommandCenterDraft } from './brandCommandCenterBuilder';
import { checkBrandCommandExecution } from './brandCommandExecutionPolicy';
import { BrandCommandCenterStore } from './brandCommandCenterStore';
import type {
  BrandCommandActionSyncAdapter,
  BrandCommandCenterSyncAdapter,
  BrandCommandExecutionQueueSyncAdapter,
  ContentReviewTaskSyncAdapter,
} from './buguContentWorkspaceSyncAdapter';
import { ContentMaterialFeedbackService } from './contentMaterialFeedbackService';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import { ContentKnowledgeReleaseStore } from './contentKnowledgeReleaseStore';
import type { ContentKnowledgeMapSyncPort } from './contentKnowledgeMapSyncPort';
import { ContentReviewTaskStore } from './contentReviewTaskStore';
import { PromptDraftStore } from './promptDraftStore';
import { SceneLibraryStore } from './sceneLibraryStore';
import { getWorkspaceDataDir } from './paths';

export interface BrandCommandWorkflowRunStarter {
  startRun(input: StartWorkflowRunInput): Promise<WorkflowRunRecord>;
}

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

function releaseReference(release?: ContentKnowledgeRelease): ContentKnowledgeReleaseReference | undefined {
  if (!release) return undefined;
  return {
    id: release.serverReleaseId || release.id,
    title: release.title,
    version: release.version,
    contentKnowledgeMapId: release.contentKnowledgeMapId,
    contentKnowledgeMapTitle: release.contentKnowledgeMapTitle,
    packageObjectKey: release.packageObjectKey,
    packagePublicUrl: release.packagePublicUrl,
    packageUploadStatus: release.packageUploadStatus,
    approvalStatus: release.approvalStatus,
  };
}

function selectTeamRelease(
  releases: ContentKnowledgeRelease[],
  map: ContentKnowledgeMapRecord,
): ContentKnowledgeRelease | undefined {
  const published = releases.filter((release) => release.status === 'published');
  if (!published.length) return undefined;
  if (map.teamSync.releaseId) {
    const matched = published.find((release) =>
      release.serverReleaseId === map.teamSync.releaseId || release.id === map.teamSync.releaseId,
    );
    if (matched) return matched;
  }
  return published.find((release) => release.contentKnowledgeMapId === map.id);
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
  materialGapFiles?: string[],
): string {
  const suffix = note?.trim() ? `备注：${note.trim()}` : '';
  if (queueItem.status === 'ready' && promptDraftId) return [`已生成 Prompt 草稿 ${promptDraftId}，下一步在 Prompt 工作台确认产物。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'ready' && sceneCardId) return [`已生成场景卡 ${sceneCardId}，下一步在场景库确认画面、口播和素材建议。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'ready' && workflowRunId) return [`已启动 SOP 运行 ${workflowRunId}，下一步在 SOP 工作流确认各步骤产物。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'ready' && materialCoverage?.coverageChangeId) return [`已回写素材覆盖 ${materialCoverage.coverageChangeId}，更新 ${materialCoverage.updatedRowCount} 个内容组合。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'ready') return ['已记录交接动作，下一步在审核台生成 Prompt 草稿，或进入 Prompt 工作台确认产物。', suffix].filter(Boolean).join(' ');
  if (reviewTaskId && queueItem.status === 'needs-review') return [`已创建审核任务 ${reviewTaskId}。`, suffix].filter(Boolean).join(' ');
  if (reviewTaskId && queueItem.status === 'needs-resource' && materialGapFiles?.length) {
    return [`已创建补资源任务 ${reviewTaskId}，并生成补素材清单：${materialGapFiles.join(' / ')}。`, suffix].filter(Boolean).join(' ');
  }
  if (reviewTaskId && queueItem.status === 'needs-resource') return [`已创建补资源任务 ${reviewTaskId}。`, suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'needs-review') return ['已记录为待审核处理。', suffix].filter(Boolean).join(' ');
  if (queueItem.status === 'needs-resource') return ['已记录补资源任务。', suffix].filter(Boolean).join(' ');
  const blockedReason = queueItem.blockedReason
    ? `${queueItem.blockedReason} 动作未执行。`
    : '发布检查未通过，动作未执行。';
  return [blockedReason, suffix].filter(Boolean).join(' ');
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

function isLocalQueueItem(item: BrandCommandQueueItem): boolean {
  return item.syncStatus !== 'synced' || item.teamSync?.status !== 'synced';
}

function mergeStringRefs(left: string[] | undefined, right: string[] | undefined, limit = 200): string[] {
  return uniqueStrings([...(left ?? []), ...(right ?? [])], limit);
}

function mergeResourceBundleLocalDraft(
  teamBundle: BrandCommandCenterRecord['resourceBundles'][number],
  localBundle: BrandCommandCenterRecord['resourceBundles'][number] | undefined,
): BrandCommandCenterRecord['resourceBundles'][number] {
  if (!localBundle) return teamBundle;
  return {
    ...teamBundle,
    coverageRowIds: mergeStringRefs(teamBundle.coverageRowIds, localBundle.coverageRowIds),
    approvedCoverageRowIds: mergeStringRefs(teamBundle.approvedCoverageRowIds, localBundle.approvedCoverageRowIds),
    sellingPointRefs: mergeStringRefs(teamBundle.sellingPointRefs, localBundle.sellingPointRefs),
    evidenceRefs: mergeStringRefs(teamBundle.evidenceRefs, localBundle.evidenceRefs),
    sceneRefs: mergeStringRefs(teamBundle.sceneRefs, localBundle.sceneRefs),
    sceneCardIds: mergeStringRefs(teamBundle.sceneCardIds, localBundle.sceneCardIds),
    promptDraftIds: mergeStringRefs(teamBundle.promptDraftIds, localBundle.promptDraftIds),
    materialRefs: mergeStringRefs(teamBundle.materialRefs, localBundle.materialRefs),
    sopRefs: mergeStringRefs(teamBundle.sopRefs, localBundle.sopRefs),
    dimensions: mergeDimensions([teamBundle.dimensions, localBundle.dimensions]),
    constraints: mergeStringRefs(teamBundle.constraints, localBundle.constraints),
    gaps: mergeStringRefs(teamBundle.gaps, localBundle.gaps),
    handoffRefs: mergeStringRefs(teamBundle.handoffRefs, localBundle.handoffRefs),
    handoffStatus: localBundle.handoffStatus ?? teamBundle.handoffStatus,
    lastHandoffSummary: localBundle.lastHandoffSummary ?? teamBundle.lastHandoffSummary,
    lastBlockedReason: localBundle.lastBlockedReason ?? teamBundle.lastBlockedReason,
    readyPercent: Math.max(teamBundle.readyPercent, localBundle.readyPercent),
  };
}

function mergeCampaignCellLocalDraft(
  teamCell: BrandCommandCenterRecord['campaignCells'][number],
  localCell: BrandCommandCenterRecord['campaignCells'][number] | undefined,
  localQueueItemIds: Set<string>,
): BrandCommandCenterRecord['campaignCells'][number] {
  if (!localCell) return teamCell;
  const localDraftQueueItemIds = localCell.queueItemIds.filter((id) => localQueueItemIds.has(id));
  return {
    ...teamCell,
    channels: mergeStringRefs(teamCell.channels, localCell.channels, 80),
    dimensions: mergeDimensions([teamCell.dimensions, localCell.dimensions]),
    queueItemIds: mergeStringRefs(teamCell.queueItemIds, localDraftQueueItemIds, 200),
  };
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

function safeExportSegment(value: string): string {
  return value
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'brand-command-actions';
}

function relativeExportFile(path: string, root: string): string {
  return path.startsWith(root) ? path.slice(root.length + 1).replace(/\\/g, '/') : path.replace(/\\/g, '/');
}

function redactExportText(value: string | undefined, workspacePath?: string): string {
  const text = String(value ?? '');
  const withoutWorkspace = workspacePath ? text.split(workspacePath).join('[本机工作区]') : text;
  return withoutWorkspace.replace(/(?:\/Users|\/private\/var|\/tmp\/content-studio|\/home)\/[^\s"'，。)]+|[A-Za-z]:\\[^\s"'，。)]+/g, '[本机路径已隐藏]');
}

function clip(value: string, max = 160): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function actionTypeLabel(value: BrandCommandActionRecord['actionType']): string {
  if (value === 'generate-prompt-draft') return '生成 Prompt 草稿';
  if (value === 'create-scene-card') return '创建场景卡';
  if (value === 'request-review') return '发起审核';
  if (value === 'request-evidence') return '补证据';
  if (value === 'launch-sop-run') return '启动 SOP';
  if (value === 'create-material-gap-list') return '创建补素材清单';
  if (value === 'write-back-material-coverage') return '回写素材覆盖';
  if (value === 'confirm-objectives') return '确认目标优先级';
  if (value === 'confirm-resource-bundles') return '保存作战单元';
  if (value === 'sync-execution-queue') return '同步执行队列';
  if (value === 'review-action-records') return '行动复盘';
  if (value === 'export-action-records') return '导出行动记录';
  return '记录发布检查未通过';
}

function actionOutcomeLabel(value: BrandCommandActionRecord['outcome']): string {
  if (value === 'handoff') return '已交接';
  if (value === 'needs-review') return '待审核';
  if (value === 'needs-resource') return '待补资源';
  if (value === 'written-back') return '已回写';
  if (value === 'blocked') return '已拦截';
  return '已记录';
}

function buildActionRecordsMarkdown(input: {
  record: BrandCommandCenterRecord;
  exportedAt: string;
  actorLabel: string;
  workspacePath: string;
}): string {
  const rows = input.record.actionRecords.map((action, index) => [
    `## ${index + 1}. ${redactExportText(action.title, input.workspacePath)}`,
    '',
    `- 时间：${action.createdAt}`,
    `- 动作：${actionTypeLabel(action.actionType)}`,
    `- 结果：${actionOutcomeLabel(action.outcome)}`,
    `- 处理人：${redactExportText(action.actorLabel, input.workspacePath)}${action.actorRole ? ` / ${action.actorRole}` : ''}`,
    `- 输入：${redactExportText(action.inputSummary || '未记录', input.workspacePath)}`,
    `- 输出：${redactExportText(action.outputSummary || '未记录', input.workspacePath)}`,
    action.promptDraftId ? `- Prompt 草稿：${action.promptDraftId}` : '',
    action.sceneCardId ? `- 场景卡：${action.sceneCardId}` : '',
    action.workflowRunId ? `- SOP 运行：${action.workflowRunId}` : '',
    action.teamKnowledgeRelease ? `- 团队知识包：${redactExportText(`${action.teamKnowledgeRelease.title} ${action.teamKnowledgeRelease.version}`, input.workspacePath)}` : '',
    action.reviewTaskId ? `- 审核任务：${action.reviewTaskId}` : '',
    action.materialCoverageChangeId ? `- 素材回写：${action.materialCoverageChangeId}` : '',
    action.artifactRefs?.length ? `- 交付文件：${action.artifactRefs.map((ref) => redactExportText(ref, input.workspacePath)).join(' / ')}` : '',
    action.writeBackSummary ? `- 回写：${redactExportText(action.writeBackSummary, input.workspacePath)}` : '',
    action.blockedReason ? `- 阻断原因：${redactExportText(action.blockedReason, input.workspacePath)}` : '',
    `- 团队状态：${redactExportText(action.teamSync?.message ?? action.syncStatus ?? '本机记录', input.workspacePath)}`,
  ].filter(Boolean).join('\n')).join('\n\n');
  return [
    `# ${redactExportText(input.record.title, input.workspacePath)} 行动记录`,
    '',
    `导出时间：${input.exportedAt}`,
    `导出人：${redactExportText(input.actorLabel, input.workspacePath)}`,
    `来源内容地图：${redactExportText(input.record.sourceKnowledgeMapTitle || '未绑定', input.workspacePath)}`,
    `队列动作：${input.record.queueItems.length}`,
    `行动记录：${input.record.actionRecords.length}`,
    '',
    '本文件用于团队复盘和人工交付归档，不包含账号凭证、API Key、自动发布指令或平台操控指令。',
    '',
    rows || '暂无行动记录。',
    '',
  ].join('\n');
}

function reviewObjectiveLabel(type: BrandCommandCenterRecord['objectives'][number]['type']): string {
  const labels: Record<BrandCommandCenterRecord['objectives'][number]['type'], string> = {
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

function reviewFeedbackKind(summary: string): {
  signalType: BrandCommandCenterRecord['signals'][number]['type'];
  objectiveType: BrandCommandCenterRecord['objectives'][number]['type'];
  queueActionType: BrandCommandQueueItem['actionType'];
  queueStatus: BrandCommandQueueItem['status'];
  outputTarget: BrandCommandQueueItem['outputTarget'];
  blockedReason?: string;
  recoveryAction?: string;
} {
  if (/违规|风险|拦截|禁用|投诉|差评|法务|合规/.test(summary)) {
    return {
      signalType: 'brand-risk',
      objectiveType: 'risk-control',
      queueActionType: 'request-review',
      queueStatus: 'needs-review',
      outputTarget: 'review-task',
      blockedReason: '复盘发现品牌或平台风险，需要负责人审核。',
      recoveryAction: '转入审核台改写风险表达和发布边界。',
    };
  }
  if (/证据|报告|测试|证明|数据|背书/.test(summary)) {
    return {
      signalType: 'manual',
      objectiveType: 'evidence-gap',
      queueActionType: 'request-evidence',
      queueStatus: 'needs-resource',
      outputTarget: 'evidence-task',
      blockedReason: '复盘发现证据不足。',
      recoveryAction: '补充测试报告、用户原声、产品资料或负责人确认。',
    };
  }
  if (/缺|补拍|补素材|素材|视频|图片|9:16|竖版|拍摄|混剪|剪辑|绿幕/.test(summary)) {
    return {
      signalType: 'manual',
      objectiveType: 'material-gap',
      queueActionType: 'create-material-gap-list',
      queueStatus: 'needs-resource',
      outputTarget: 'material-gap',
      blockedReason: '复盘发现素材或交付资源缺口。',
      recoveryAction: '生成补素材清单，补齐后再回到执行队列交接。',
    };
  }
  if (/高|有效|表现|转化|点击|收藏|成交|复用|放大/.test(summary)) {
    return {
      signalType: 'material-performance',
      objectiveType: 'acquisition',
      queueActionType: 'generate-prompt-draft',
      queueStatus: 'ready',
      outputTarget: 'prompt-draft',
    };
  }
  return {
    signalType: 'manual',
    objectiveType: 'conversion',
    queueActionType: 'request-review',
    queueStatus: 'needs-review',
    outputTarget: 'review-task',
    blockedReason: '复盘结论需要负责人确认后再进入下一轮生产。',
    recoveryAction: '在审核台确认下一轮目标和资源包。',
  };
}

function buildReviewFeedbackDraft(input: {
  record: BrandCommandCenterRecord;
  summary: string;
  actorLabel: string;
  now: string;
}): {
  signal: BrandCommandCenterRecord['signals'][number];
  objective: BrandCommandCenterRecord['objectives'][number];
  resourceBundle: BrandCommandCenterRecord['resourceBundles'][number];
  campaignCell: BrandCommandCenterRecord['campaignCells'][number];
  queueItem: BrandCommandQueueItem;
  writeBackSummary: string;
} {
  const sourceSignal = input.record.signals[0];
  const sourceObjective = input.record.objectives[0];
  const sourceBundle = input.record.resourceBundles[0];
  const sourceCell = input.record.campaignCells[0];
  const kind = reviewFeedbackKind(input.summary);
  const dimensions = mergeDimensions([
    sourceBundle?.dimensions,
    sourceObjective?.dimensions,
    sourceCell?.dimensions,
    sourceCell?.channels.length ? { channels: sourceCell.channels } : undefined,
  ]);
  const channels = dimensions?.channels?.length
    ? dimensions.channels
    : sourceCell?.channels.length
      ? sourceCell.channels
      : kind.objectiveType === 'risk-control' || kind.objectiveType === 'evidence-gap' || kind.objectiveType === 'material-gap'
        ? ['审核台', '素材库']
        : ['小红书', '抖音'];
  const relatedMapRowIds = uniqueStrings([
    ...(sourceBundle?.coverageRowIds ?? []),
    ...(sourceSignal?.relatedMapRowIds ?? []),
  ], 20);
  const signal: BrandCommandCenterRecord['signals'][number] = {
    id: randomUUID(),
    type: kind.signalType,
    title: `复盘信号：${clip(input.summary, 34)}`,
    summary: input.summary,
    sourceLabel: '行动记录复盘',
    businessValue: /优先|今天|立即|高|有效|转化|成交/.test(input.summary) ? 82 : 72,
    evidenceReadiness: sourceBundle?.evidenceRefs.length ? 60 : 28,
    urgency: /优先|今天|立即|本周|下一轮/.test(input.summary) ? 82 : 64,
    riskLevel: kind.objectiveType === 'risk-control' ? 82 : kind.queueStatus === 'ready' ? 34 : 58,
    productionCost: sourceBundle?.materialRefs.length ? 36 : 62,
    recommendedObjectiveType: kind.objectiveType,
    riskBoundary: '复盘结论只能作为下一轮行动信号，不能自动改写产品事实、证据或已发布主张。',
    relatedMapRowIds,
  };
  const objective: BrandCommandCenterRecord['objectives'][number] = {
    id: randomUUID(),
    type: kind.objectiveType,
    title: `${reviewObjectiveLabel(kind.objectiveType)}：${clip(input.summary, 28)}`,
    summary: input.summary,
    priority: kind.queueStatus === 'ready' ? 'P1' : 'P0',
    channels,
    dimensions,
    successCriteria: [
      '复盘信号已经写入当前战情室。',
      kind.queueStatus === 'ready' ? '生成下一轮 Prompt 草稿并再次人工复核。' : '补齐资源或审核通过后再回到执行队列。',
      '不得把复盘结论当作产品事实或公开背书。',
    ],
    signalIds: [signal.id],
  };
  const inheritedTitle = sourceBundle?.title ? `${sourceBundle.title} / 复盘资源包` : `${reviewObjectiveLabel(kind.objectiveType)}复盘资源包`;
  const resourceBundle: BrandCommandCenterRecord['resourceBundles'][number] = {
    id: randomUUID(),
    title: inheritedTitle,
    objectiveId: objective.id,
    sourceKnowledgeMapId: input.record.sourceKnowledgeMapId,
    coverageRowIds: relatedMapRowIds,
    approvedCoverageRowIds: sourceBundle?.approvedCoverageRowIds,
    sellingPointRefs: sourceBundle?.sellingPointRefs ?? [],
    evidenceRefs: sourceBundle?.evidenceRefs ?? [],
    sceneRefs: sourceBundle?.sceneRefs ?? [],
    sceneCardIds: sourceBundle?.sceneCardIds ?? [],
    promptDraftIds: sourceBundle?.promptDraftIds ?? [],
    materialRefs: sourceBundle?.materialRefs ?? [],
    sopRefs: sourceBundle?.sopRefs ?? [],
    dimensions,
    constraints: uniqueStrings([
      ...(sourceBundle?.constraints ?? []),
      ...input.record.constraints,
      '复盘结论不得直接改写产品事实或已发布团队知识包。',
    ], 12),
    gaps: uniqueStrings([
      kind.blockedReason,
      kind.recoveryAction,
      input.summary,
      ...(sourceBundle?.gaps ?? []),
    ], 8),
    handoffStatus: 'none',
    handoffRefs: [],
    readyPercent: kind.queueStatus === 'ready' ? Math.max(sourceBundle?.readyPercent ?? 0, 70) : Math.min(sourceBundle?.readyPercent ?? 48, 64),
  };
  const campaignCell: BrandCommandCenterRecord['campaignCells'][number] = {
    id: randomUUID(),
    title: objective.title,
    objectiveId: objective.id,
    ownerRole: '内容负责人',
    agentRole: '内容工程 Agent',
    channels,
    dimensions,
    timeWindow: /今天|立即|优先/.test(input.summary) ? '今天' : '下一轮',
    resourceBundleId: resourceBundle.id,
    decisionChecks: [
      {
        key: 'review-source',
        label: '复盘来源',
        status: 'passed',
        message: `来自 ${input.actorLabel} 写入的行动记录复盘。`,
      },
      {
        key: 'review-follow-up',
        label: '下一步',
        status: kind.queueStatus === 'ready' ? 'passed' : kind.queueStatus === 'needs-review' ? 'needs-review' : 'needs-resource',
        message: kind.blockedReason ?? '可以生成下一轮 Prompt 草稿。',
        recoveryAction: kind.recoveryAction,
      },
    ],
    queueItemIds: [],
  };
  const queueItem: BrandCommandQueueItem = {
    id: randomUUID(),
    campaignCellId: campaignCell.id,
    actionType: kind.queueActionType,
    title: kind.queueStatus === 'ready' ? '复盘生成下一轮 Prompt 草稿' : kind.objectiveType === 'material-gap' ? '复盘创建补素材清单' : kind.objectiveType === 'evidence-gap' ? '复盘请求补证据' : '复盘转负责人审核',
    summary: input.summary,
    status: kind.queueStatus,
    blockedReason: kind.queueStatus === 'ready' ? undefined : kind.blockedReason,
    recoveryAction: kind.recoveryAction,
    outputTarget: kind.outputTarget,
    resourceBundleId: resourceBundle.id,
    dimensions,
    createdAt: input.now,
    updatedAt: input.now,
  };
  campaignCell.queueItemIds = [queueItem.id];
  return {
    signal,
    objective,
    resourceBundle,
    campaignCell,
    queueItem,
    writeBackSummary: `复盘已生成 1 个下一轮信号、1 个复盘目标和 1 个执行队列动作：${queueItem.title}。`,
  };
}

interface ConfirmStageProfile {
  actionType: BrandCommandActionRecord['actionType'];
  title: string;
  inputSummary: (record: BrandCommandCenterRecord) => string;
  outputSummary: (record: BrandCommandCenterRecord, queueSync?: ContentKnowledgeMapTeamSyncSummary) => string;
  emptyReason: (record: BrandCommandCenterRecord) => string | undefined;
  recoveryAction: string;
  writeBackSummary: string;
}

const CONFIRM_STAGE_PROFILES: Record<BrandCommandConfirmStage, ConfirmStageProfile> = {
  objectives: {
    actionType: 'confirm-objectives',
    title: '确认目标优先级',
    inputSummary: (record) => `${record.signals.length} 个信号，${record.objectives.length} 个作战目标。`,
    outputSummary: (record) => `已确认 ${record.objectives.length} 个作战目标的优先级、渠道、成功标准和下游资源包。`,
    emptyReason: (record) => record.objectives.length ? undefined : '当前战情室还没有作战目标。',
    recoveryAction: '先从信号雷达生成或刷新战情室，把可行动信号转成作战目标。',
    writeBackSummary: '目标优先级已进入行动记录，团队可以按目标继续编组资源包。',
  },
  bundles: {
    actionType: 'confirm-resource-bundles',
    title: '保存作战单元',
    inputSummary: (record) => `${record.resourceBundles.length} 个资源包，${record.campaignCells.length} 个作战单元。`,
    outputSummary: (record) => `已保存 ${record.resourceBundles.length} 个资源包和 ${record.campaignCells.length} 个作战单元，保留卖点、证据、素材、禁用边界和恢复路径。`,
    emptyReason: (record) => record.resourceBundles.length && record.campaignCells.length ? undefined : '当前战情室缺少资源包或作战单元。',
    recoveryAction: '先补齐可用卖点、证据、素材和负责人，再保存作战单元。',
    writeBackSummary: '作战单元已进入行动记录，后续执行队列会继续使用同一批资源包。',
  },
  queue: {
    actionType: 'sync-execution-queue',
    title: '同步执行队列',
    inputSummary: (record) => `${record.queueItems.length} 个队列动作，${record.queueItems.filter((item) => item.status === 'ready').length} 个可执行。`,
    outputSummary: (record, queueSync) => [
      `已同步 ${record.queueItems.length} 个执行队列动作，包含可执行、待审核、待补资源和已拦截状态。`,
      queueSync?.message,
    ].filter(Boolean).join(' '),
    emptyReason: (record) => record.queueItems.length ? undefined : '当前战情室还没有执行队列动作。',
    recoveryAction: '先生成战情室并完成资源包检查，再同步执行队列。',
    writeBackSummary: '执行队列状态已回写到本机战情室，并同步到团队工作区用于多人协作。',
  },
};

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

function evidenceLabelsFromRows(
  map: ContentKnowledgeMapRecord | undefined,
  rows: ContentKnowledgeMapMatrixRow[],
): string[] {
  if (!map || !rows.length) return [];
  const evidenceById = new Map(map.evidence.map((item) => [item.id, item]));
  return uniqueStrings(rows.flatMap((row) =>
    row.evidenceRefs.map((ref) => {
      const evidence = evidenceById.get(ref);
      return evidence ? `${evidence.sourceTitle}：${evidence.claim}` : ref;
    }),
  ), 16);
}

function materialGapRows(input: {
  bundle: BrandCommandCenterRecord['resourceBundles'][number];
  map?: ContentKnowledgeMapRecord;
}): ContentKnowledgeMapMatrixRow[] {
  const coverageRowIds = coverageRowIdsForBundle(input.bundle, input.map);
  const selectedIds = new Set(coverageRowIds);
  const rows = input.map ? mapRows(input.map) : [];
  const matchedRows = rows.filter((row) =>
    (selectedIds.size ? selectedIds.has(row.id) : true) &&
    (
      row.materialStatus === 'missing' ||
      row.status === 'needs-evidence' ||
      !row.materialRefs?.length
    ),
  );
  if (matchedRows.length) return matchedRows.slice(0, 24);
  const fallbackId = `material-gap:${input.bundle.id}`;
  const sourceRefs = Array.from(new Set([
    ...input.bundle.evidenceRefs.map((ref) => `evidence:${ref}`),
    ...input.bundle.materialRefs.map((ref) => `asset-review:${ref}`),
    ...input.bundle.promptDraftIds.map((ref) => `prompt-draft:${ref}`),
    ...(input.bundle.sceneCardIds ?? []).map((ref) => `scene-card:${ref}`),
  ]));
  return [{
    id: fallbackId,
    title: input.bundle.title,
    summary: input.bundle.gaps.join(' / ') || '当前资源包缺少可直接投放的素材或证据，需要运营补齐后再交接生产。',
    tags: ['品牌战情室', '补素材'],
    dimensions: input.bundle.dimensions,
    sourceRefs,
    evidenceRefs: input.bundle.evidenceRefs,
    materialStatus: input.bundle.materialRefs.length ? 'covered' : 'missing',
    materialRefs: input.bundle.materialRefs,
    confidence: Math.max(0.1, Math.min(0.8, input.bundle.readyPercent / 100)),
    status: input.bundle.evidenceRefs.length ? 'needs-review' : 'needs-evidence',
  }];
}

function buildMaterialGapMarkdown(input: {
  record: BrandCommandCenterRecord;
  queueItem: BrandCommandQueueItem;
  bundle: BrandCommandCenterRecord['resourceBundles'][number];
  campaignCell?: BrandCommandCenterRecord['campaignCells'][number];
  rows: ContentKnowledgeMapMatrixRow[];
  evidenceLabels: string[];
  reviewTaskId?: string;
  exportedAt: string;
  actorLabel: string;
  workspacePath: string;
}): string {
  const dimensions = mergeDimensions([
    input.bundle.dimensions,
    input.queueItem.dimensions,
    input.campaignCell?.dimensions,
    input.campaignCell?.channels.length ? { channels: input.campaignCell.channels } : undefined,
  ]);
  const rowSections = input.rows.map((row, index) => [
    `## ${index + 1}. ${redactExportText(row.title, input.workspacePath)}`,
    '',
    `- 目标人群：${redactExportText(dimensionText(row.dimensions ?? dimensions, 'audiences', '待运营确认'), input.workspacePath)}`,
    `- 渠道：${redactExportText(dimensionText(row.dimensions ?? dimensions, 'channels', input.campaignCell?.channels.join(' / ') || '待运营确认'), input.workspacePath)}`,
    `- 内容形式：${redactExportText(dimensionText(row.dimensions ?? dimensions, 'contentFormats', '待运营确认'), input.workspacePath)}`,
    `- 使用场景：${redactExportText(dimensionText(row.dimensions ?? dimensions, 'useCases', input.bundle.sceneRefs.join(' / ') || '待运营确认'), input.workspacePath)}`,
    `- 当前缺口：${redactExportText(row.summary || input.bundle.gaps.join(' / ') || input.queueItem.blockedReason || '缺少可用素材。', input.workspacePath)}`,
    `- 素材状态：${row.materialStatus ?? 'missing'}`,
    `- 建议补齐：${redactExportText(input.queueItem.recoveryAction || '补充真实产品图、使用场景视频、用户原声或证据截图。', input.workspacePath)}`,
    row.evidenceRefs.length ? `- 证据引用：${redactExportText(row.evidenceRefs.join(' / '), input.workspacePath)}` : '- 证据引用：待补',
    row.materialRefs?.length ? `- 已有关联素材：${redactExportText(row.materialRefs.join(' / '), input.workspacePath)}` : '- 已有关联素材：无',
  ].join('\n')).join('\n\n');
  return [
    `# ${redactExportText(input.record.title, input.workspacePath)} 补素材清单`,
    '',
    `生成时间：${input.exportedAt}`,
    `处理人：${redactExportText(input.actorLabel, input.workspacePath)}`,
    `资源包：${redactExportText(input.bundle.title, input.workspacePath)}`,
    `队列动作：${redactExportText(input.queueItem.title, input.workspacePath)}`,
    input.reviewTaskId ? `审核任务：${input.reviewTaskId}` : '审核任务：未创建',
    '',
    '本清单用于运营补齐真实素材和证据，不包含自动发布指令、账号凭证或本机绝对路径。',
    '',
    '## 生产变量',
    '',
    `- 目标人群：${redactExportText(dimensionText(dimensions, 'audiences', '待运营确认'), input.workspacePath)}`,
    `- 渠道：${redactExportText(dimensionText(dimensions, 'channels', input.campaignCell?.channels.join(' / ') || '待运营确认'), input.workspacePath)}`,
    `- 内容形式：${redactExportText(dimensionText(dimensions, 'contentFormats', '待运营确认'), input.workspacePath)}`,
    `- 使用场景：${redactExportText(dimensionText(dimensions, 'useCases', input.bundle.sceneRefs.join(' / ') || '待运营确认'), input.workspacePath)}`,
    '',
    '## 可用依据',
    '',
    ...(input.evidenceLabels.length ? input.evidenceLabels.map((item) => `- ${redactExportText(item, input.workspacePath)}`) : ['- 待补证据']),
    '',
    '## 禁用边界',
    '',
    ...(input.bundle.constraints.length ? input.bundle.constraints.map((item) => `- ${redactExportText(item, input.workspacePath)}`) : ['- 必须遵守品牌口径和平台规则。']),
    '',
    rowSections || '暂无缺口行。',
    '',
  ].join('\n');
}

async function writeMaterialGapList(input: {
  workspacePath: string;
  record: BrandCommandCenterRecord;
  queueItem: BrandCommandQueueItem;
  bundle: BrandCommandCenterRecord['resourceBundles'][number];
  campaignCell?: BrandCommandCenterRecord['campaignCells'][number];
  sourceMap?: ContentKnowledgeMapRecord;
  reviewTask?: ContentReviewTask;
  actorLabel: string;
  now: string;
}): Promise<{ packageDir: string; artifactRefs: string[]; files: string[] } | undefined> {
  if (input.queueItem.actionType !== 'create-material-gap-list' || input.queueItem.status !== 'needs-resource') return undefined;
  const rows = materialGapRows({ bundle: input.bundle, map: input.sourceMap });
  const evidenceLabels = evidenceLabelsFromRows(input.sourceMap, rows);
  const packageDir = join(
    getWorkspaceDataDir(input.workspacePath),
    'exports',
    'brand-command-material-gaps',
    `${safeExportSegment(input.queueItem.title || input.bundle.title)}-${input.now.replace(/[:.]/g, '-')}`,
  );
  await mkdir(packageDir, { recursive: true });
  const manifestPath = join(packageDir, 'manifest.json');
  const markdownPath = join(packageDir, 'material-gap-list.md');
  const jsonPath = join(packageDir, 'material-gap-list.json');
  const files = [
    relativeExportFile(manifestPath, packageDir),
    relativeExportFile(markdownPath, packageDir),
    relativeExportFile(jsonPath, packageDir),
  ];
  const dimensions = bundleDimensions({
    bundle: input.bundle,
    queueItem: input.queueItem,
    campaignCell: input.campaignCell,
  });
  const payload = {
    schema: 'buguai.brand-command.material-gap-list.v1',
    commandCenter: {
      id: input.record.id,
      title: redactExportText(input.record.title, input.workspacePath),
      sourceKnowledgeMapId: input.record.sourceKnowledgeMapId,
      sourceKnowledgeMapTitle: redactExportText(input.record.sourceKnowledgeMapTitle, input.workspacePath),
    },
    queueItem: {
      id: input.queueItem.id,
      title: redactExportText(input.queueItem.title, input.workspacePath),
      summary: redactExportText(input.queueItem.summary, input.workspacePath),
      status: input.queueItem.status,
      blockedReason: redactExportText(input.queueItem.blockedReason, input.workspacePath),
      recoveryAction: redactExportText(input.queueItem.recoveryAction, input.workspacePath),
    },
    resourceBundle: {
      id: input.bundle.id,
      title: redactExportText(input.bundle.title, input.workspacePath),
      dimensions,
      sellingPointRefs: input.bundle.sellingPointRefs.map((ref) => redactExportText(ref, input.workspacePath)),
      evidenceRefs: input.bundle.evidenceRefs.map((ref) => redactExportText(ref, input.workspacePath)),
      sceneRefs: input.bundle.sceneRefs.map((ref) => redactExportText(ref, input.workspacePath)),
      materialRefs: input.bundle.materialRefs.map((ref) => redactExportText(ref, input.workspacePath)),
      constraints: input.bundle.constraints.map((item) => redactExportText(item, input.workspacePath)),
      gaps: input.bundle.gaps.map((item) => redactExportText(item, input.workspacePath)),
      readyPercent: input.bundle.readyPercent,
    },
    reviewTask: input.reviewTask ? {
      id: input.reviewTask.id,
      status: input.reviewTask.status,
      suggestedAction: input.reviewTask.suggestedAction,
      taskPurpose: input.reviewTask.taskPurpose,
      issueLabels: input.reviewTask.issueLabels,
    } : undefined,
    rows: rows.map((row) => ({
      id: row.id,
      title: redactExportText(row.title, input.workspacePath),
      summary: redactExportText(row.summary, input.workspacePath),
      dimensions: row.dimensions,
      tags: row.tags.map((tag) => redactExportText(tag, input.workspacePath)),
      evidenceRefs: row.evidenceRefs.map((ref) => redactExportText(ref, input.workspacePath)),
      materialStatus: row.materialStatus ?? 'missing',
      materialRefs: (row.materialRefs ?? []).map((ref) => redactExportText(ref, input.workspacePath)),
      status: row.status,
      confidence: row.confidence,
    })),
    evidence: evidenceLabels.map((item) => redactExportText(item, input.workspacePath)),
    files,
    exportedAt: input.now,
    exportedBy: redactExportText(input.actorLabel, input.workspacePath),
    safety: {
      containsCredentials: false,
      containsWorkspacePath: false,
      containsAutoPublishInstruction: false,
    },
  };
  await writeFile(markdownPath, buildMaterialGapMarkdown({
    record: input.record,
    queueItem: input.queueItem,
    bundle: input.bundle,
    campaignCell: input.campaignCell,
    rows,
    evidenceLabels,
    reviewTaskId: input.reviewTask?.id,
    exportedAt: input.now,
    actorLabel: input.actorLabel,
    workspacePath: input.workspacePath,
  }), 'utf-8');
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await writeFile(manifestPath, `${JSON.stringify({
    schema: payload.schema,
    commandCenterId: input.record.id,
    queueItemId: input.queueItem.id,
    reviewTaskId: input.reviewTask?.id,
    files,
    exportedAt: input.now,
    safety: payload.safety,
  }, null, 2)}\n`, 'utf-8');
  return {
    packageDir,
    artifactRefs: [manifestPath, markdownPath, jsonPath],
    files,
  };
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
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
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
    teamKnowledgeRelease: input.teamKnowledgeRelease,
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

function isBrandCommandCenterSyncAdapter(value: unknown): value is BrandCommandCenterSyncAdapter {
  return Boolean(value && typeof value === 'object' && typeof (value as BrandCommandCenterSyncAdapter).upsertCommandCenterSnapshot === 'function');
}

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
    private readonly workflows?: BrandCommandWorkflowRunStarter,
    private readonly materialFeedback?: ContentMaterialFeedbackService,
    private readonly commandCenterSync?: BrandCommandCenterSyncAdapter,
    private readonly releases?: ContentKnowledgeReleaseStore,
  ) {}

  private releaseStore(): ContentKnowledgeReleaseStore | undefined {
    return isBrandCommandCenterSyncAdapter(this.releases) ? undefined : this.releases;
  }

  private commandCenterSyncAdapter(): BrandCommandCenterSyncAdapter | undefined {
    if (this.commandCenterSync) return this.commandCenterSync;
    return isBrandCommandCenterSyncAdapter(this.releases) ? this.releases : undefined;
  }

  async list(workspacePath: string): Promise<BrandCommandCenterRecord[]> {
    await this.refreshTeamCommandCenters(workspacePath);
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
    if (!record.queueItems.length) {
      return this.saveWithCommandCenterSync(record);
    }
    const queueSync = await this.queueSync.syncExecutionQueue({
      workspacePath: input.workspacePath,
      commandCenterId: record.id,
      items: record.queueItems,
    });
    return this.saveWithCommandCenterSync({
      ...record,
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
    const needsMaterialGapList = queueItem.status === 'needs-resource' &&
      queueItem.actionType === 'create-material-gap-list' &&
      Boolean(resourceBundle);
    const needsSourceMap = Boolean(resourceBundle) && (
      needsMaterialGapList ||
      (queueItem.status === 'ready' && (
        (queueItem.actionType === 'generate-prompt-draft' && Boolean(this.promptDrafts)) ||
        (queueItem.actionType === 'create-scene-card' && Boolean(this.sceneCards)) ||
        (queueItem.actionType === 'launch-sop-run' && Boolean(this.workflows)) ||
        requiresApprovedReview
      ))
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
    const releases = this.releaseStore();
    const teamKnowledgeRelease = effectiveQueueItem.status === 'ready' &&
      sourceMap &&
      releases &&
      isProductionQueueAction(effectiveQueueItem.actionType)
      ? releaseReference(selectTeamRelease(await releases.list(input.workspacePath), sourceMap))
      : undefined;
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
          teamKnowledgeRelease,
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
          teamKnowledgeRelease,
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
    const actorLabel = input.actorLabel?.trim() || '本机工作台';
    const materialGapList = resourceBundle
      ? await writeMaterialGapList({
          workspacePath: input.workspacePath,
          record,
          queueItem: effectiveQueueItem,
          bundle: resourceBundle,
          campaignCell,
          sourceMap,
          reviewTask,
          actorLabel,
          now,
        })
      : undefined;
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
      actorLabel,
      actorRole: input.actorRole,
      inputSummary: queueItem.summary,
      outputSummary: outputSummary(
        effectiveQueueItem,
        input.note,
        promptDraft?.id,
        reviewTask?.id,
        sceneCard?.id,
        workflowRun?.id,
        materialCoverage,
        materialGapList?.files,
      ),
      blockedReason: effectiveQueueItem.status === 'ready' ? undefined : effectiveQueueItem.blockedReason,
      writeBackSummary: effectiveQueueItem.status === 'ready'
        ? materialCoverage?.status === 'updated'
          ? `已回写 ${materialCoverage.updatedRowCount} 个素材覆盖组合，待确认补充任务 ${materialCoverage.pendingSupplementTaskCount ?? 0} 个。`
          : '已留下交接记录，等待审核台产物、外部发布或素材导入后回写。'
        : materialGapList
          ? `已生成本机补素材清单 ${materialGapList.files.join(' / ')}，并转入审核任务等待负责人补齐。`
        : reviewTask
          ? '已转入审核任务，等待负责人处理。'
          : undefined,
      promptDraftId: promptDraft?.id,
      sceneCardId: sceneCard?.id,
      workflowRunId: workflowRun?.id,
      teamKnowledgeRelease: promptDraft?.teamKnowledgeRelease ?? workflowRun?.teamKnowledgeRelease ?? teamKnowledgeRelease,
      materialCoverageChangeId: materialCoverage?.coverageChangeId,
      reviewTaskId: reviewTask?.id,
      artifactRefs: materialGapList?.artifactRefs,
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
      updatedAt: now,
    };
    return this.updateWithCommandCenterSync(updated, actionRecord.actorLabel);
  }

  async recordReview(input: RecordBrandCommandReviewInput): Promise<BrandCommandCenterRecord> {
    const records = await this.store.list(input.workspacePath);
    const record = records.find((item) => item.id === input.commandCenterId);
    if (!record) throw new Error(`品牌战情室不存在: ${input.commandCenterId}`);
    const summary = input.summary.replace(/\s+/g, ' ').trim();
    if (!summary) throw new Error('复盘结论不能为空。');
    const actorLabel = input.actorLabel?.trim() || '本机工作台';
    const now = new Date().toISOString();
    const feedbackDraft = buildReviewFeedbackDraft({
      record,
      summary,
      actorLabel,
      now,
    });
    const actionRecord: BrandCommandActionRecord = {
      id: randomUUID(),
      actionType: 'review-action-records',
      title: `${record.title} 行动复盘`,
      outcome: 'recorded',
      actorLabel,
      actorRole: input.actorRole,
      inputSummary: `${record.actionRecords.length} 条行动记录，${record.queueItems.length} 个队列动作。`,
      outputSummary: summary,
      writeBackSummary: feedbackDraft.writeBackSummary,
      createdAt: now,
    };
    const teamSync = await this.actionSync.appendActionRecord({
      workspacePath: input.workspacePath,
      commandCenterId: record.id,
      record: actionRecord,
      authorLabel: actorLabel,
    });
    const queueTeamSync = await this.queueSync.syncExecutionQueue({
      workspacePath: input.workspacePath,
      commandCenterId: record.id,
      items: [feedbackDraft.queueItem],
      authorLabel: actorLabel,
    });
    const syncedActionRecord: BrandCommandActionRecord = {
      ...actionRecord,
      syncStatus: teamSync.status,
      teamSync,
    };
    const syncedQueueItem: BrandCommandQueueItem = {
      ...feedbackDraft.queueItem,
      syncStatus: queueTeamSync.status,
      teamSync: queueTeamSync,
    };
    return this.updateWithCommandCenterSync({
      ...record,
      signals: [feedbackDraft.signal, ...record.signals],
      objectives: [feedbackDraft.objective, ...record.objectives],
      resourceBundles: [feedbackDraft.resourceBundle, ...record.resourceBundles],
      campaignCells: [feedbackDraft.campaignCell, ...record.campaignCells],
      queueItems: [syncedQueueItem, ...record.queueItems],
      actionRecords: [syncedActionRecord, ...record.actionRecords],
      updatedAt: now,
    }, actorLabel);
  }

  async confirmStage(input: ConfirmBrandCommandStageInput): Promise<BrandCommandCenterRecord> {
    const records = await this.store.list(input.workspacePath);
    const record = records.find((item) => item.id === input.commandCenterId);
    if (!record) throw new Error(`品牌战情室不存在: ${input.commandCenterId}`);
    const profile = CONFIRM_STAGE_PROFILES[input.stage];
    const actorLabel = input.actorLabel?.trim() || '本机工作台';
    const now = new Date().toISOString();
    const blockedReason = profile.emptyReason(record);
    const queueTeamSync = !blockedReason && input.stage === 'queue'
      ? await this.queueSync.syncExecutionQueue({
          workspacePath: input.workspacePath,
          commandCenterId: record.id,
          items: record.queueItems,
          authorLabel: actorLabel,
        })
      : undefined;
    const actionRecord: BrandCommandActionRecord = {
      id: randomUUID(),
      actionType: profile.actionType,
      title: `${record.title} / ${profile.title}`,
      outcome: blockedReason ? 'blocked' : 'recorded',
      actorLabel,
      actorRole: input.actorRole,
      inputSummary: profile.inputSummary(record),
      outputSummary: blockedReason ?? profile.outputSummary(record, queueTeamSync),
      blockedReason,
      writeBackSummary: blockedReason ? profile.recoveryAction : profile.writeBackSummary,
      createdAt: now,
    };
    const actionTeamSync = await this.actionSync.appendActionRecord({
      workspacePath: input.workspacePath,
      commandCenterId: record.id,
      record: actionRecord,
      authorLabel: actorLabel,
    });
    const updated: BrandCommandCenterRecord = {
      ...record,
      queueItems: queueTeamSync
        ? record.queueItems.map((item) => ({ ...item, syncStatus: queueTeamSync.status, teamSync: queueTeamSync, updatedAt: now }))
        : record.queueItems,
      actionRecords: [{
        ...actionRecord,
        syncStatus: actionTeamSync.status,
        teamSync: actionTeamSync,
      }, ...record.actionRecords],
      updatedAt: now,
    };
    return this.updateWithCommandCenterSync(updated, actorLabel);
  }

  async exportActionRecords(input: ExportBrandCommandActionRecordsInput): Promise<BrandCommandActionRecordsExportResult> {
    const records = await this.store.list(input.workspacePath);
    const record = records.find((item) => item.id === input.commandCenterId);
    if (!record) {
      return { status: 'blocked', files: [], issues: [`品牌战情室不存在: ${input.commandCenterId}`] };
    }
    if (!record.actionRecords.length) {
      return { status: 'blocked', commandCenter: record, files: [], issues: ['暂无行动记录，先处理队列动作或写入复盘记录。'] };
    }
    const actorLabel = input.actorLabel?.trim() || '本机工作台';
    const now = new Date().toISOString();
    const packageDir = join(
      getWorkspaceDataDir(input.workspacePath),
      'exports',
      'brand-command-actions',
      `${safeExportSegment(record.title)}-${now.replace(/[:.]/g, '-')}`,
    );
    await mkdir(packageDir, { recursive: true });
    const manifestPath = join(packageDir, 'manifest.json');
    const markdownPath = join(packageDir, 'action-records.md');
    const jsonPath = join(packageDir, 'action-records.json');
    const files = [
      relativeExportFile(manifestPath, packageDir),
      relativeExportFile(markdownPath, packageDir),
      relativeExportFile(jsonPath, packageDir),
    ];
    const exportPayload = {
      schema: 'buguai.brand-command.action-records.v1',
      commandCenter: {
        id: record.id,
        title: redactExportText(record.title, input.workspacePath),
        status: record.status,
        sourceKnowledgeMapId: record.sourceKnowledgeMapId,
        sourceKnowledgeMapTitle: redactExportText(record.sourceKnowledgeMapTitle, input.workspacePath),
      },
      summary: {
        signalCount: record.signals.length,
        objectiveCount: record.objectives.length,
        resourceBundleCount: record.resourceBundles.length,
        queueItemCount: record.queueItems.length,
        actionRecordCount: record.actionRecords.length,
      },
      actionRecords: record.actionRecords.map((action) => ({
        id: action.id,
        queueItemId: action.queueItemId,
        campaignCellId: action.campaignCellId,
        actionType: action.actionType,
        title: redactExportText(action.title, input.workspacePath),
        outcome: action.outcome,
        actorLabel: redactExportText(action.actorLabel, input.workspacePath),
        actorRole: action.actorRole,
        inputSummary: redactExportText(action.inputSummary, input.workspacePath),
        outputSummary: redactExportText(action.outputSummary, input.workspacePath),
        blockedReason: action.blockedReason ? redactExportText(action.blockedReason, input.workspacePath) : undefined,
        writeBackSummary: action.writeBackSummary ? redactExportText(action.writeBackSummary, input.workspacePath) : undefined,
        promptDraftId: action.promptDraftId,
        sceneCardId: action.sceneCardId,
        workflowRunId: action.workflowRunId,
        teamKnowledgeRelease: action.teamKnowledgeRelease,
        materialCoverageChangeId: action.materialCoverageChangeId,
        reviewTaskId: action.reviewTaskId,
        artifactRefs: (action.artifactRefs ?? []).map((ref) => redactExportText(ref, input.workspacePath)),
        syncStatus: action.syncStatus,
        createdAt: action.createdAt,
      })),
      files,
      exportedAt: now,
      exportedBy: redactExportText(actorLabel, input.workspacePath),
      safety: {
        containsCredentials: false,
        containsWorkspacePath: false,
        containsAutoPublishInstruction: false,
      },
    };
    await writeFile(markdownPath, buildActionRecordsMarkdown({ record, exportedAt: now, actorLabel, workspacePath: input.workspacePath }), 'utf-8');
    await writeFile(jsonPath, `${JSON.stringify(exportPayload, null, 2)}\n`, 'utf-8');
    await writeFile(manifestPath, `${JSON.stringify({
      schema: exportPayload.schema,
      commandCenterId: record.id,
      title: redactExportText(record.title, input.workspacePath),
      files,
      exportedAt: now,
      safety: exportPayload.safety,
    }, null, 2)}\n`, 'utf-8');

    const actionRecord: BrandCommandActionRecord = {
      id: randomUUID(),
      actionType: 'export-action-records',
      title: `${record.title} 行动记录导出`,
      outcome: 'recorded',
      actorLabel,
      actorRole: input.actorRole,
      inputSummary: `${record.actionRecords.length} 条行动记录。`,
      outputSummary: `已导出行动记录文件：${files.join(' / ')}。`,
      writeBackSummary: '导出文件已保存在本机交付目录，并写入团队行动记录用于审计追溯。',
      artifactRefs: [manifestPath, markdownPath, jsonPath],
      createdAt: now,
    };
    const teamSync = await this.actionSync.appendActionRecord({
      workspacePath: input.workspacePath,
      commandCenterId: record.id,
      record: actionRecord,
      authorLabel: actorLabel,
    });
    const updated = await this.updateWithCommandCenterSync({
      ...record,
      actionRecords: [{ ...actionRecord, syncStatus: teamSync.status, teamSync }, ...record.actionRecords],
      updatedAt: now,
    }, actorLabel);
    return {
      status: 'exported',
      commandCenter: updated,
      packageDir,
      manifestPath,
      markdownPath,
      jsonPath,
      files,
      issues: [],
    };
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
    return this.updateWithCommandCenterSync(updated);
  }

  private async saveWithCommandCenterSync(record: BrandCommandCenterRecord, authorLabel?: string): Promise<BrandCommandCenterRecord> {
    const saved = await this.store.save(record);
    return this.syncCommandCenterSnapshot(saved, authorLabel);
  }

  private async updateWithCommandCenterSync(record: BrandCommandCenterRecord, authorLabel?: string): Promise<BrandCommandCenterRecord> {
    const saved = await this.store.update(record);
    return this.syncCommandCenterSnapshot(saved, authorLabel);
  }

  private async syncCommandCenterSnapshot(record: BrandCommandCenterRecord, authorLabel?: string): Promise<BrandCommandCenterRecord> {
    const commandCenterSync = this.commandCenterSyncAdapter();
    if (!commandCenterSync) return record;
    const teamSync = await commandCenterSync.upsertCommandCenterSnapshot({
      record,
      authorLabel,
    });
    return this.store.update({
      ...record,
      syncStatus: teamSync.status,
      teamSync,
      updatedAt: new Date().toISOString(),
    });
  }

  private async refreshTeamCommandCenters(workspacePath: string): Promise<void> {
    const commandCenterSync = this.commandCenterSyncAdapter();
    if (!commandCenterSync?.listCommandCenters) return;
    const [localRecords, maps] = await Promise.all([
      this.store.list(workspacePath),
      this.knowledgeMaps.list(workspacePath),
    ]);
    const localById = new Map(localRecords.map((record) => [record.id, record]));
    const workspaceIds = Array.from(new Set([
      ...localRecords.map((record) => record.teamSync.workspaceId),
      ...maps.map((map) => map.teamSync.workspaceId),
    ].filter((workspaceId): workspaceId is string => Boolean(workspaceId))));
    await Promise.all(workspaceIds.map(async (workspaceId) => {
      try {
        const records = await commandCenterSync.listCommandCenters?.({ workspacePath, workspaceId });
        await Promise.all((records ?? []).map((record) => {
          const localRecord = localById.get(record.id);
          const merged = this.mergeTeamCommandCenter(record, localRecord);
          return localRecord ? this.store.update(merged) : this.store.save(merged);
        }));
      } catch {
        // 团队刷新失败时保留本机缓存，不把失败伪装成已同步。
      }
    }));
  }

  private mergeTeamCommandCenter(
    teamRecord: BrandCommandCenterRecord,
    localRecord: BrandCommandCenterRecord | undefined,
  ): BrandCommandCenterRecord {
    if (!localRecord) return teamRecord;
    const localQueueItems = localRecord.queueItems.filter(isLocalQueueItem);
    const localQueueItemIds = new Set(localQueueItems.map((item) => item.id));
    const teamQueueItemIds = new Set(teamRecord.queueItems.map((item) => item.id));
    const localQueueById = new Map(localQueueItems.map((item) => [item.id, item]));
    const localBundleById = new Map(localRecord.resourceBundles.map((bundle) => [bundle.id, bundle]));
    const localCellById = new Map(localRecord.campaignCells.map((cell) => [cell.id, cell]));
    const teamBundleIds = new Set(teamRecord.resourceBundles.map((bundle) => bundle.id));
    const teamCellIds = new Set(teamRecord.campaignCells.map((cell) => cell.id));
    const localQueueBundleIds = new Set(localQueueItems.map((item) => item.resourceBundleId));
    const localQueueCellIds = new Set(localQueueItems.map((item) => item.campaignCellId));
    const useLocalCommandSnapshot = (
      localRecord.syncStatus === 'synced' &&
      Boolean(localRecord.teamSync.revision) &&
      localRecord.updatedAt.localeCompare(teamRecord.updatedAt) >= 0
    );
    const keepLocalTeamSync = (
      (localRecord.syncStatus === 'pending-sync' || localRecord.syncStatus === 'conflict') ||
      useLocalCommandSnapshot
    );
    if (useLocalCommandSnapshot) {
      return {
        ...localRecord,
        actionRecords: mergeActionRecords(localRecord.actionRecords, teamRecord.actionRecords),
      };
    }
    return {
      ...teamRecord,
      syncStatus: keepLocalTeamSync ? localRecord.syncStatus : teamRecord.syncStatus,
      teamSync: keepLocalTeamSync ? localRecord.teamSync : teamRecord.teamSync,
      resourceBundles: [
        ...teamRecord.resourceBundles.map((bundle) => mergeResourceBundleLocalDraft(bundle, localBundleById.get(bundle.id))),
        ...localRecord.resourceBundles.filter((bundle) => !teamBundleIds.has(bundle.id) && localQueueBundleIds.has(bundle.id)),
      ],
      campaignCells: [
        ...teamRecord.campaignCells.map((cell) => mergeCampaignCellLocalDraft(cell, localCellById.get(cell.id), localQueueItemIds)),
        ...localRecord.campaignCells.filter((cell) => !teamCellIds.has(cell.id) && localQueueCellIds.has(cell.id)),
      ],
      queueItems: [
        ...teamRecord.queueItems.map((item) => localQueueById.get(item.id) ?? item),
        ...localQueueItems.filter((item) => !teamQueueItemIds.has(item.id)),
      ],
      actionRecords: mergeActionRecords(localRecord.actionRecords, teamRecord.actionRecords),
    };
  }
}
