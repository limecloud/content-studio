import { randomUUID } from 'node:crypto';
import type {
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentKnowledgeRelease,
  ContentKnowledgeReleaseReference,
  ContentProductionHandoffActionRecord,
  ContentProductionHandoffRecord,
  ContentProductionHandoffResult,
  ContentProductionHandoffTarget,
  ContentReviewTask,
  CreateContentProductionHandoffInput,
  StartWorkflowRunInput,
  WorkflowRunRecord,
} from '../../shared/types';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import { ContentKnowledgeReleaseStore } from './contentKnowledgeReleaseStore';
import { ContentProductionHandoffStore } from './contentProductionHandoffStore';
import { checkContentProductionHandoff } from './contentProductionHandoffPolicy';
import { ContentReviewTaskStore } from './contentReviewTaskStore';
import { PromptDraftStore } from './promptDraftStore';
import { SceneLibraryStore } from './sceneLibraryStore';
import { buildPromptGroundingSummary } from './promptGroundingAssembler';
import { buildSceneCardFromKnowledgeMap } from './sceneCardAssembler';
import type { ContentProductionHandoffActionSyncAdapter } from './buguContentWorkspaceSyncAdapter';
import { BrandCommandCenterStore } from './brandCommandCenterStore';

const localOnlyHandoffActionSync: ContentProductionHandoffActionSyncAdapter = {
  async syncProductionHandoffActions() {
    return {
      backend: 'bugu',
      status: 'blocked',
      message: '生产交接行动记录已保存在本机，尚未同步到团队工作区。',
    };
  },
};

export interface ContentWorkflowRunStarter {
  startRun(input: StartWorkflowRunInput): Promise<WorkflowRunRecord>;
}

function rowsForTarget(map: ContentKnowledgeMapRecord, targetType: ContentReviewTask['targetType']): ContentKnowledgeMapMatrixRow[] {
  if (targetType === 'selling-point') return map.sellingPoints;
  if (targetType === 'pain-point') return map.painPoints;
  if (targetType === 'scenario') return map.scenarios;
  return [];
}

function inputSourceIdsFromRefs(sourceRefs: string[]): string[] {
  return sourceRefs
    .filter((ref) => ref.startsWith('input-source:'))
    .map((ref) => ref.slice('input-source:'.length))
    .filter(Boolean);
}

function targetIncludesPrompt(target: ContentProductionHandoffTarget): boolean {
  return target === 'prompt-draft' || target === 'prompt-and-scene' || target === 'prompt-scene-sop';
}

function targetIncludesScene(target: ContentProductionHandoffTarget): boolean {
  return target === 'scene-card' || target === 'prompt-and-scene' || target === 'prompt-scene-sop';
}

function targetIncludesSop(target: ContentProductionHandoffTarget): boolean {
  return target === 'sop-run' || target === 'prompt-scene-sop';
}

function buildPromptContent(groundingContent: string): string {
  return [
    groundingContent,
    '',
    '# 生产草稿要求',
    '',
    '请基于上面的提示词依据生成一组可交给内容生产的草稿：',
    '',
    '## 1. 文案 Prompt',
    '- 给出标题方向、开头钩子、主体结构、证据露出和 CTA。',
    '- 不扩写没有证据支持的效果承诺。',
    '',
    '## 2. 图片 Prompt',
    '- 给出主体、场景、构图、产品细节、光线、画面禁忌。',
    '- 不生成夸张前后对比或无法验证的视觉效果。',
    '',
    '## 3. 视频 Prompt',
    '- 给出 15-30 秒分镜：痛点进入、卖点解释、证据露出、行动建议。',
    '- 标注口播语气、节奏和必须避免的表达。',
    '',
    '## 4. SOP 输入',
    '- 列出需要人工确认的素材、证据和发布检查项。',
  ].join('\n');
}

function handoffTargetLabel(target: ContentProductionHandoffTarget): string {
  if (target === 'prompt-draft') return 'Prompt 草稿';
  if (target === 'scene-card') return '场景卡';
  if (target === 'sop-run') return 'SOP 运行';
  if (target === 'prompt-scene-sop') return 'Prompt 草稿、场景卡和 SOP 运行';
  return 'Prompt 草稿和场景卡';
}

function sourceSummary(input: {
  map?: ContentKnowledgeMapRecord;
  row?: ContentKnowledgeMapMatrixRow;
  task: ContentReviewTask;
  readyEvidenceCount: number;
}): string {
  const mapTitle = input.map?.title ?? input.task.sourceKnowledgeMapTitle ?? '内容知识地图';
  const rowTitle = input.row?.title ?? input.task.title;
  return `${mapTitle} / ${rowTitle} / ${input.readyEvidenceCount} 条已通过证据`;
}

function outputSummary(input: {
  target: ContentProductionHandoffTarget;
  status: ContentProductionHandoffRecord['status'];
  promptDraftId?: string;
  sceneCardId?: string;
  workflowRunId?: string;
  issues: string[];
}): string {
  if (input.status === 'blocked') return input.issues[0] || '发布检查未通过，未生成下游产物。';
  const outputs = [
    input.promptDraftId ? `Prompt 草稿 ${input.promptDraftId}` : '',
    input.sceneCardId ? `场景卡 ${input.sceneCardId}` : '',
    input.workflowRunId ? `SOP 运行 ${input.workflowRunId}` : '',
  ].filter(Boolean);
  return outputs.length ? `已生成${handoffTargetLabel(input.target)}：${outputs.join(' / ')}` : `已完成${handoffTargetLabel(input.target)}交接。`;
}

function buildHandoffChecks(input: {
  status: ContentProductionHandoffRecord['status'];
  task: ContentReviewTask;
  row?: ContentKnowledgeMapMatrixRow;
  readyEvidenceCount: number;
  issues: string[];
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
}): ContentProductionHandoffActionRecord['checks'] {
  const blockedMessage = input.issues[0] || '发布检查未通过。';
  return [
    {
      label: '审核结论',
      status: input.task.status === 'approved' && input.status === 'created' ? 'passed' : 'blocked',
      message: input.task.status === 'approved' ? '审核任务已通过。' : '审核任务尚未通过。',
    },
    {
      label: '证据',
      status: input.readyEvidenceCount > 0 && input.status === 'created' ? 'passed' : 'blocked',
      message: input.readyEvidenceCount > 0 ? `${input.readyEvidenceCount} 条证据可追溯。` : '缺少已通过证据。',
    },
    {
      label: '发布边界',
      status: input.status === 'created' ? 'passed' : 'blocked',
      message: input.status === 'created' ? '禁用表达、竞品直交和 IP 漂移检查通过。' : blockedMessage,
    },
    {
      label: '团队知识包',
      status: input.teamKnowledgeRelease?.id && input.status === 'created' ? 'passed' : 'blocked',
      message: input.teamKnowledgeRelease?.id
        ? `${input.teamKnowledgeRelease.title} ${input.teamKnowledgeRelease.version}`
        : '未绑定已发布团队知识包，仅可作为本机草稿继续处理。',
    },
  ];
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

function buildWorkflowRunInput(input: {
  workspacePath: string;
  workflowDefinitionId?: string;
  actorLabel: string;
  grounding: ReturnType<typeof buildPromptGroundingSummary>;
  map: ContentKnowledgeMapRecord;
  row: ContentKnowledgeMapMatrixRow;
  task: ContentReviewTask;
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
}): StartWorkflowRunInput {
  return {
    workspacePath: input.workspacePath,
    workflowDefinitionId: input.workflowDefinitionId || 'workflow-brand-scene-prompts',
    inputSourceIds: inputSourceIdsFromRefs(input.grounding.sourceRefs),
    teamKnowledgeRelease: input.teamKnowledgeRelease,
    inputs: {
      source: [
        `内容知识地图：${input.map.title}`,
        `审核任务：${input.task.title}`,
        `证据引用：${input.grounding.evidenceRefs.join(' / ') || '待确认'}`,
      ].join('\n'),
      intent: [
        `把已审核组合「${input.row.title}」作为 SOP 输入。`,
        `目标：基于内容知识地图生成可执行生产流程，保留证据、来源和发布边界。`,
        `边界：${input.grounding.constraints.join(' / ') || '遵守品牌口径和平台规则。'}`,
      ].join('\n'),
      reviewOwner: input.actorLabel,
      platform: '小红书',
    },
  };
}

export class ContentProductionHandoffService {
  constructor(
    private readonly tasks: ContentReviewTaskStore,
    private readonly maps: ContentKnowledgeMapStore,
    private readonly releases: ContentKnowledgeReleaseStore,
    private readonly promptDrafts: PromptDraftStore,
    private readonly sceneCards: SceneLibraryStore,
    private readonly handoffs: ContentProductionHandoffStore,
    private readonly actionSync: ContentProductionHandoffActionSyncAdapter = localOnlyHandoffActionSync,
    private readonly commandCenters?: BrandCommandCenterStore,
    private readonly workflows?: ContentWorkflowRunStarter,
  ) {}

  async create(input: CreateContentProductionHandoffInput): Promise<ContentProductionHandoffResult> {
    const target = input.target ?? 'prompt-and-scene';
    const actorLabel = input.actorLabel?.trim() || '本机工作台';
    const tasks = await this.tasks.list(input.workspacePath);
    const task = tasks.find((item) => item.id === input.reviewTaskId);
    if (!task) throw new Error(`审核任务不存在: ${input.reviewTaskId}`);

    const maps = await this.maps.list(input.workspacePath);
    const map = task.sourceKnowledgeMapId
      ? maps.find((item) => item.id === task.sourceKnowledgeMapId)
      : maps[0];
    const row = map ? rowsForTarget(map, task.targetType).find((item) => item.id === task.targetId) : undefined;
    const readyEvidence = map?.evidence
      .filter((item) => item.status === 'ready' && task.evidenceRefs.includes(item.id))
      ?? [];
    const policy = checkContentProductionHandoff({ task, map, row, readyEvidence });
    if (!policy.allowed || !map || !row) {
      const blockedRecord = await this.appendRecord({
        input,
        target,
        status: 'blocked',
        issues: policy.issues,
        actorLabel,
        map,
        row,
        task,
        readyEvidenceCount: readyEvidence.length,
        promptDraftId: undefined,
        sceneCardId: undefined,
      });
      return { status: 'blocked', issues: policy.issues, record: blockedRecord };
    }
    if (targetIncludesSop(target) && !this.workflows) {
      const issues = ['SOP 工作流服务尚未接入，不能创建 SOP 运行记录。'];
      const blockedRecord = await this.appendRecord({
        input,
        target,
        status: 'blocked',
        issues,
        actorLabel,
        map,
        row,
        task,
        readyEvidenceCount: readyEvidence.length,
        promptDraftId: undefined,
        sceneCardId: undefined,
        workflowRunId: undefined,
      });
      return { status: 'blocked', issues, record: blockedRecord };
    }

    const teamKnowledgeRelease = releaseReference(selectTeamRelease(await this.releases.list(input.workspacePath), map));
    const grounding = buildPromptGroundingSummary({ map, task, row, readyEvidence, teamKnowledgeRelease });
    const sceneCard = targetIncludesScene(target)
      ? await this.sceneCards.createFromContent(buildSceneCardFromKnowledgeMap({
        workspacePath: input.workspacePath,
        map,
        task,
        row,
      }))
      : undefined;
    const promptDraft = targetIncludesPrompt(target)
      ? await this.promptDrafts.createFromContent({
        workspacePath: input.workspacePath,
        title: `${row.title} 生产提示词`,
        purpose: 'article',
        userIntent: `基于已审核内容知识地图组合生成文案、图片、视频和 SOP 的生产 Prompt。`,
        inputSourceIds: inputSourceIdsFromRefs(grounding.sourceRefs),
        sceneCardIds: sceneCard ? [sceneCard.id] : [],
        content: buildPromptContent(grounding.content),
        note: `由审核任务 ${task.id} 交接生成。`,
        model: 'content-knowledge-map-handoff',
        status: 'confirmed',
        contentKnowledgeMapId: map.id,
        contentKnowledgeMapTitle: map.title,
        teamKnowledgeRelease,
        coverageRowIds: grounding.coverageRowIds,
        sourceRefs: grounding.sourceRefs,
      })
      : undefined;
    const workflowRun = targetIncludesSop(target) && this.workflows
      ? await this.workflows.startRun(buildWorkflowRunInput({
        workspacePath: input.workspacePath,
        workflowDefinitionId: input.workflowDefinitionId,
        actorLabel,
        grounding,
        map,
        row,
        task,
        teamKnowledgeRelease,
      }))
      : undefined;
    const record = await this.appendRecord({
      input,
      target,
      status: 'created',
      issues: [],
      actorLabel,
      map,
      row,
      task,
      teamKnowledgeRelease,
      readyEvidenceCount: readyEvidence.length,
      promptDraftId: promptDraft?.id,
      sceneCardId: sceneCard?.id,
      workflowRunId: workflowRun?.id,
    });
    return { status: 'created', issues: [], grounding, record, promptDraft, sceneCard, workflowRun };
  }

  private async appendRecord(input: {
    input: CreateContentProductionHandoffInput;
    target: ContentProductionHandoffTarget;
    status: ContentProductionHandoffRecord['status'];
    issues: string[];
    actorLabel: string;
    map?: ContentKnowledgeMapRecord;
    row?: ContentKnowledgeMapMatrixRow;
    task: ContentReviewTask;
    teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
    readyEvidenceCount: number;
    promptDraftId?: string;
    sceneCardId?: string;
    workflowRunId?: string;
  }): Promise<ContentProductionHandoffRecord> {
    const now = new Date().toISOString();
    const batchId = `handoff:${input.task.sourceKnowledgeMapId ?? 'unknown'}:${input.task.targetId ?? input.task.id}`;
    const shared = {
      batchId,
      title: input.row?.title ?? input.task.title,
      inputSummary: sourceSummary({
        map: input.map,
        row: input.row,
        task: input.task,
        readyEvidenceCount: input.readyEvidenceCount,
      }),
      outputSummary: outputSummary({
        target: input.target,
        status: input.status,
        promptDraftId: input.promptDraftId,
        sceneCardId: input.sceneCardId,
        workflowRunId: input.workflowRunId,
        issues: input.issues,
      }),
      actorLabel: input.actorLabel,
      sourceKnowledgeMapId: input.map?.id,
      coverageRowIds: input.row ? [input.row.id] : [],
      evidenceRefs: input.task.evidenceRefs,
      sourceRefs: input.row?.sourceRefs ?? [],
      promptDraftId: input.promptDraftId,
      sceneCardId: input.sceneCardId,
      workflowRunId: input.workflowRunId,
      teamKnowledgeRelease: input.teamKnowledgeRelease,
      checks: buildHandoffChecks({
        status: input.status,
        task: input.task,
        row: input.row,
        readyEvidenceCount: input.readyEvidenceCount,
        issues: input.issues,
        teamKnowledgeRelease: input.teamKnowledgeRelease,
      }),
      nextStep: input.status === 'created'
        ? '在 Prompt 工作台确认草稿，或在场景库继续拆成图片、视频和 SOP 任务。'
        : '先处理发布检查问题，再重新发起生产交接。',
      createdAt: now,
    };
    const actionRecords: ContentProductionHandoffActionRecord[] = input.status === 'blocked'
      ? [{
          id: randomUUID(),
          actionType: 'blocked',
          outcome: 'blocked',
          ...shared,
        }]
      : [
          ...(input.promptDraftId ? [{
            id: randomUUID(),
            actionType: 'create-prompt-draft' as const,
            outcome: 'handoff' as const,
            ...shared,
          }] : []),
          ...(input.sceneCardId ? [{
            id: randomUUID(),
            actionType: 'create-scene-card' as const,
            outcome: 'handoff' as const,
            ...shared,
          }] : []),
          ...(input.workflowRunId ? [{
            id: randomUUID(),
            actionType: 'launch-sop-run' as const,
            outcome: 'handoff' as const,
            ...shared,
          }] : []),
        ];
    const teamSync = await this.actionSync.syncProductionHandoffActions({
      workspacePath: input.input.workspacePath,
      sourceKnowledgeMapId: input.map?.id,
      actions: actionRecords,
      authorLabel: input.actorLabel,
    });
    const syncedActionRecords = actionRecords.map((action) => ({
      ...action,
      syncStatus: teamSync.status,
      teamSync,
    }));
    const record: ContentProductionHandoffRecord = {
      id: randomUUID(),
      workspacePath: input.input.workspacePath,
      reviewTaskId: input.task.id,
      target: input.target,
      status: input.status,
      batchId,
      issues: input.issues,
      sourceKnowledgeMapId: input.map?.id,
      sourceKnowledgeMapTitle: input.map?.title,
      teamKnowledgeRelease: input.teamKnowledgeRelease,
      coverageRowIds: input.row ? [input.row.id] : [],
      sourceRefs: input.row?.sourceRefs ?? [],
      evidenceRefs: input.task.evidenceRefs,
      promptDraftId: input.promptDraftId,
      sceneCardId: input.sceneCardId,
      workflowRunId: input.workflowRunId,
      actorLabel: input.actorLabel,
      syncStatus: teamSync.status,
      teamSync,
      actionRecords: syncedActionRecords,
      createdAt: now,
    };
    await this.appendToBrandCommandCenter(input.input.workspacePath, input.map?.id, syncedActionRecords);
    return this.handoffs.append(record);
  }

  private async appendToBrandCommandCenter(
    workspacePath: string,
    sourceKnowledgeMapId: string | undefined,
    actions: ContentProductionHandoffActionRecord[],
  ): Promise<void> {
    if (!this.commandCenters || !sourceKnowledgeMapId || !actions.length) return;
    const records = await this.commandCenters.list(workspacePath);
    const commandCenter = records.find((record) => record.sourceKnowledgeMapId === sourceKnowledgeMapId);
    if (!commandCenter) return;
    const mappedActions = actions.map((action) => ({
      id: action.id,
      queueItemId: action.batchId,
      campaignCellId: action.batchId,
      actionType: action.actionType === 'create-prompt-draft'
        ? 'generate-prompt-draft' as const
        : action.actionType === 'create-scene-card'
          ? 'create-scene-card' as const
          : action.actionType === 'launch-sop-run'
            ? 'launch-sop-run' as const
            : 'content-production-blocked' as const,
      title: action.title,
      outcome: action.outcome,
      actorLabel: action.actorLabel,
      inputSummary: action.inputSummary,
      outputSummary: action.outputSummary,
      blockedReason: action.outcome === 'blocked' ? action.outputSummary : undefined,
      writeBackSummary: action.nextStep,
      promptDraftId: action.promptDraftId,
      sceneCardId: action.sceneCardId,
      workflowRunId: action.workflowRunId,
      syncStatus: action.syncStatus,
      teamSync: action.teamSync,
      createdAt: action.createdAt,
    }));
    const promptDraftIds = actions.map((action) => action.promptDraftId).filter((id): id is string => Boolean(id));
    const sceneCardIds = actions.map((action) => action.sceneCardId).filter((id): id is string => Boolean(id));
    const handoffRefs = actions.flatMap((action) => [
      action.promptDraftId ? `prompt-draft:${action.promptDraftId}` : '',
      action.sceneCardId ? `scene-card:${action.sceneCardId}` : '',
      action.workflowRunId ? `workflow-run:${action.workflowRunId}` : '',
    ]).filter(Boolean);
    const blockedReason = actions.find((action) => action.outcome === 'blocked')?.outputSummary;
    const targetBundles = commandCenter.resourceBundles.some((bundle) => bundle.sourceKnowledgeMapId === sourceKnowledgeMapId)
      ? commandCenter.resourceBundles
      : [{
          id: `${actions[0]?.batchId ?? sourceKnowledgeMapId}:resource-bundle`,
          title: `${actions[0]?.title ?? commandCenter.title} 交接资源包`,
          objectiveId: actions[0]?.batchId ?? sourceKnowledgeMapId,
          sourceKnowledgeMapId,
          coverageRowIds: actions.flatMap((action) => action.coverageRowIds),
          approvedCoverageRowIds: actions.flatMap((action) => action.coverageRowIds),
          sellingPointRefs: actions.flatMap((action) => action.coverageRowIds),
          evidenceRefs: Array.from(new Set(actions.flatMap((action) => action.evidenceRefs))),
          sceneRefs: [],
          sceneCardIds: [],
          promptDraftIds: [],
          materialRefs: [],
          sopRefs: [],
          constraints: [],
          gaps: blockedReason ? [blockedReason] : [],
          handoffStatus: 'none' as const,
          readyPercent: blockedReason ? 0 : 100,
        }, ...commandCenter.resourceBundles];
    const nextResourceBundles = targetBundles.map((bundle) => {
      if (bundle.sourceKnowledgeMapId !== sourceKnowledgeMapId) return bundle;
      return {
        ...bundle,
        promptDraftIds: Array.from(new Set([...bundle.promptDraftIds, ...promptDraftIds])),
        sceneCardIds: Array.from(new Set([...(bundle.sceneCardIds ?? []), ...sceneCardIds])),
        handoffStatus: blockedReason ? 'blocked' as const : 'handed-off' as const,
        handoffRefs: Array.from(new Set([...(bundle.handoffRefs ?? []), ...handoffRefs])),
        lastHandoffSummary: actions[0]?.outputSummary ?? bundle.lastHandoffSummary,
        lastBlockedReason: blockedReason ?? bundle.lastBlockedReason,
      };
    });
    await this.commandCenters.update({
      ...commandCenter,
      resourceBundles: nextResourceBundles,
      actionRecords: [...mappedActions, ...commandCenter.actionRecords],
      syncStatus: actions[0].syncStatus ?? commandCenter.syncStatus,
      teamSync: actions[0].teamSync ?? commandCenter.teamSync,
    });
  }
}
