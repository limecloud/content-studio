import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  AgentPromptMessage,
  AgentPromptExecutionEvent,
  AgentPromptSession,
  AgentPromptSessionResult,
  AgentPromptSourceSnapshot,
  AttachAgentPromptSessionInputSourcesInput,
  ContinueAgentPromptSessionInput,
  InputSourceRecord,
  PromptDraft,
  PromptDraftVersion,
  RespondAgentPromptActionInput,
  StartAgentPromptSessionInput,
} from '../../shared/types';
import { isReusablePromptInputSource } from '../../shared/inputSourcePolicy';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { InputSourceStore } from './inputSourceStore';
import { getOemRuntimeConfig } from './oemRuntimeConfig';
import { PromptDraftStore } from './promptDraftStore';
import { SkillManager } from './skillManager';
import { buildSkillRuntimeContext, type SkillRuntimeContext } from './skillRuntimeContext';
import { TextGenerationService, TextProviderBlockedError, TextProviderFailedError } from './textGenerationService';
import type {
  GenerateAgentPromptDraftInput,
  GenerateAgentPromptDraftResult,
  GenerateAgentPromptRefinementInput,
  GenerateAgentPromptRefinementResult,
} from './claudePromptAgentService';
import type { TextProviderRuntimeEvent } from '../providers/textGenerationProvider';

function sessionsFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'agent-prompt-sessions.json');
}

function activeVersion(draft: PromptDraft): PromptDraftVersion {
  return draft.versions.find((version) => version.id === draft.activeVersionId) ?? draft.versions[draft.versions.length - 1];
}

function snapshotSource(source: InputSourceRecord): AgentPromptSourceSnapshot {
  return {
    sourceId: source.id,
    title: source.title,
    kind: source.kind,
    purpose: source.purpose,
    status: source.status,
    summary: source.summary,
    markdownPath: source.markdownPath,
    blockedReason: source.blockedReason,
  };
}

function sourceKindLabel(kind: InputSourceRecord['kind']): string {
  if (kind === 'docx' || kind === 'markdown') return '文档';
  if (kind === 'image') return '图片';
  if (kind === 'video') return '视频';
  if (kind === 'sku-table') return 'SKU 表';
  if (kind === 'url') return '网页';
  if (kind === 'manual-note') return '手动记录';
  return '文本';
}

function sourcePurposeLabel(purpose: InputSourceRecord['purpose']): string {
  const labels: Record<InputSourceRecord['purpose'], string> = {
    'brand-kb': '品牌 / 产品知识库',
    'ip-kb': 'IP 知识库',
    'ip-scenario-kb': 'IP 场景库',
    'competitor-observation': '竞品观察',
    reference: '参考素材',
    'product-brief': '产品资料',
    'user-feedback': '评论 / 客服问题',
    'sop-input': '任务输入',
    'successful-asset': '成功素材',
  };
  return labels[purpose] ?? '输入资料';
}

function sourceStatusLabel(status: InputSourceRecord['status']): string {
  if (status === 'converted') return '已生成可追溯转换稿';
  if (status === 'blocked') return '待补齐';
  if (status === 'failed') return '解析失败';
  return '已登记';
}

function sourceSnapshotText(sources: AgentPromptSourceSnapshot[]): string {
  if (sources.length === 0) return '未选择输入源。';
  return sources.map((source, index) => [
    `${index + 1}. ${source.title}`,
    `资料类型：${sourcePurposeLabel(source.purpose)} / ${sourceKindLabel(source.kind)} / ${sourceStatusLabel(source.status)}`,
    source.markdownPath ? '转换稿：已生成可追溯转换稿' : '',
    source.summary ? `摘要：${source.summary}` : '',
    source.blockedReason ? `待补齐原因：${source.blockedReason}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

function compactMessages(messages: AgentPromptMessage[]): string {
  return messages.slice(-12).map((message) => [
    `${message.role}/${message.kind}`,
    message.model ? `model: ${message.model}` : '',
    message.content.slice(0, 2400),
  ].filter(Boolean).join('\n')).join('\n\n');
}

const REFINE_PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt', 'followUpQuestions', 'sourceWarnings'],
  properties: {
    prompt: { type: 'string' },
    followUpQuestions: { type: 'array', items: { type: 'string' } },
    sourceWarnings: { type: 'array', items: { type: 'string' } },
  },
};

const AGENT_RUNTIME_SCHEMA_VERSION = 'agent-runtime-draft-2026-05';
const CONTENT_STUDIO_RUNTIME_ID = 'content-studio-agent-prompt-runtime';

interface RefinePromptOutput {
  prompt: string;
  followUpQuestions: string[];
  sourceWarnings: string[];
}

function normalizeList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => String(value).trim()).filter(Boolean).slice(0, 8);
}

function reusableSessionModel(model?: string): string | undefined {
  const trimmed = model?.trim();
  if (!trimmed || trimmed.startsWith('blocked:') || trimmed.startsWith('fallback:')) return undefined;
  return trimmed;
}

function formatRefinedContent(previousContent: string, adjustment: string, output: RefinePromptOutput): string {
  const prompt = String(output.prompt ?? '').trim();
  return [
    prompt || previousContent,
    '',
    '本轮调整：',
    adjustment.trim(),
    '',
    normalizeList(output.followUpQuestions).length ? '仍需追问 / 人工确认：' : '',
    ...normalizeList(output.followUpQuestions).map((item, index) => `${index + 1}. ${item}`),
    '',
    normalizeList(output.sourceWarnings).length ? '来源与合规提醒：' : '',
    ...normalizeList(output.sourceWarnings).map((item, index) => `${index + 1}. ${item}`),
  ].filter((line) => line !== '').join('\n');
}

function fallbackRefinedContent(previousContent: string, adjustment: string, reason: string): string {
  return [
    previousContent,
    '',
    '本轮调整要求：',
    adjustment.trim(),
    '',
    '处理状态：',
    `文字模型未完成，本轮只记录调整意图，原因：${reason}`,
  ].join('\n');
}

function resolvedActionTitle(decision: RespondAgentPromptActionInput['decision']): string {
  if (decision === 'open-input-source') return '已打开输入源登记';
  if (decision === 'open-model-settings') return '已打开模型设置';
  return '已处理待办';
}

function resolvedActionDetail(
  sourceEvent: AgentPromptExecutionEvent,
  input: RespondAgentPromptActionInput,
): string {
  if (input.note?.trim()) return input.note.trim();
  const actionKind = typeof sourceEvent.payload?.actionKind === 'string' ? sourceEvent.payload.actionKind : '';
  if (input.decision === 'open-input-source' || actionKind === 'add-input-source') {
    return '用户已进入输入源登记页面，后续补充资料会作为新的来源证据进入工作区。';
  }
  if (input.decision === 'open-model-settings' || actionKind === 'configure-text-model') {
    return '用户已进入模型设置页面，后续配置结果由生成服务状态继续记录。';
  }
  return '用户已确认处理该待办动作。';
}

function skillSummaryText(skillContext: SkillRuntimeContext): string {
  return skillContext.skillRefs.length ? skillContext.summaryText : '未选择 skill。';
}

function compactProviderEvents(events: TextProviderRuntimeEvent[] | undefined): Array<Record<string, unknown>> {
  return (events ?? []).map((event) => ({
    eventClass: event.eventClass,
    kind: event.kind,
    status: event.status,
    phase: event.phase,
    title: event.title,
    detail: event.detail,
    model: event.model,
    payload: event.payload,
  }));
}

function executionEvent(
  input: Omit<AgentPromptExecutionEvent, 'id' | 'createdAt' | 'schemaVersion' | 'runtimeId'> & { createdAt?: string },
): AgentPromptExecutionEvent {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    id: randomUUID(),
    kind: input.kind,
    status: input.status,
    eventClass: input.eventClass,
    owner: input.owner,
    schemaVersion: AGENT_RUNTIME_SCHEMA_VERSION,
    sequence: input.sequence,
    runtimeId: CONTENT_STUDIO_RUNTIME_ID,
    threadId: input.threadId,
    turnId: input.turnId,
    taskId: input.taskId,
    runId: input.runId,
    stepId: input.stepId,
    toolCallId: input.toolCallId,
    actionId: input.actionId,
    traceId: input.traceId,
    spanId: input.spanId,
    attemptId: input.attemptId,
    artifactId: input.artifactId,
    evidenceId: input.evidenceId,
    phase: input.phase,
    title: input.title,
    detail: input.detail,
    refIds: input.refIds,
    artifactRefs: input.artifactRefs,
    evidenceRefs: input.evidenceRefs,
    payload: input.payload,
    model: input.model,
    createdAt: now,
    completedAt: input.completedAt ?? (input.status === 'running' || input.status === 'pending' ? undefined : now),
  };
}

function snapshotUpdatedEvent(input: {
  now: string;
  sequence: number;
  sessionId: string;
  turnId?: string;
  taskId?: string;
  runId?: string;
  status: AgentPromptSession['status'];
  events: AgentPromptExecutionEvent[];
  messageCount?: number;
  draftIds?: string[];
}): AgentPromptExecutionEvent {
  const resolvedActionIds = new Set(
    input.events
      .filter((event) => event.eventClass === 'action.resolved' && event.actionId)
      .map((event) => event.actionId as string),
  );
  const pendingActionIds = input.events
    .filter((event) => event.eventClass === 'action.required' && event.actionId && !resolvedActionIds.has(event.actionId))
    .map((event) => event.actionId as string);
  const artifactRefs = Array.from(new Set(input.events.flatMap((event) => event.artifactRefs ?? [])));
  const evidenceRefs = Array.from(new Set(input.events.flatMap((event) => event.evidenceRefs ?? [])));
  return executionEvent({
    kind: 'state',
    status: 'completed',
    eventClass: 'snapshot.updated',
    owner: 'runtime',
    phase: input.status === 'blocked' ? 'blocked' : 'completed',
    sequence: input.sequence,
    threadId: input.sessionId,
    turnId: input.turnId,
    taskId: input.taskId,
    runId: input.runId,
    stepId: `snapshot:${input.sessionId}:${input.sequence}`,
    title: '会话快照已更新',
    detail: pendingActionIds.length ? `${pendingActionIds.length} 个待处理动作` : '当前没有待处理动作。',
    artifactRefs,
    evidenceRefs,
    payload: {
      sessionStatus: input.status,
      eventCount: input.events.length,
      messageCount: input.messageCount,
      draftIds: input.draftIds,
      pendingActionIds,
      artifactRefs,
      evidenceRefs,
    },
    createdAt: input.now,
  });
}

function buildStartExecutionEvents(input: {
  now: string;
  selectedSources: InputSourceRecord[];
  skillContext: SkillRuntimeContext;
  draft: PromptDraft;
  protocol?: AgentPromptSession['textProtocol'];
  providerEvents?: TextProviderRuntimeEvent[];
  sessionId: string;
  turnId: string;
  runId: string;
  messageCount?: number;
}): AgentPromptExecutionEvent[] {
  const modelStatus = input.draft.model?.startsWith('blocked:')
    ? 'blocked'
    : input.draft.model?.startsWith('fallback:')
      ? 'failed'
      : 'completed';
  const hasSources = input.selectedSources.length > 0;
  const evidenceRefs = input.selectedSources.map((source) => `input-source:${source.id}`);
  const common = {
    threadId: input.sessionId,
    turnId: input.turnId,
    taskId: `task:${input.sessionId}:draft`,
    runId: input.runId,
  };
  const inputSourceToolCallId = `tool:${input.sessionId}:input-sources`;
  const events = [
    executionEvent({
      kind: 'context',
      status: 'completed',
      eventClass: 'turn.submitted',
      owner: 'runtime',
      phase: 'submitted',
      title: '读取用户意图',
      detail: '已把本轮要求写入会话上下文。',
      stepId: 'turn:submitted',
      payload: { source: 'user-intent' },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'tool',
      status: 'completed',
      eventClass: 'tool.started',
      owner: 'runtime',
      phase: 'tool_running',
      title: '准备读取资料',
      detail: hasSources ? `待读取 ${input.selectedSources.length} 份输入源。` : '本轮没有选择可复用输入源。',
      refIds: input.selectedSources.map((source) => source.id),
      evidenceRefs,
      toolCallId: inputSourceToolCallId,
      stepId: 'tool:input-sources:started',
      payload: {
        toolName: 'input-source.read',
        safeArgs: { sourceCount: input.selectedSources.length },
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'source',
      status: hasSources ? 'completed' : 'blocked',
      eventClass: 'context.resolved',
      owner: 'runtime',
      phase: hasSources ? 'preparing' : 'blocked',
      title: '读取输入源',
      detail: hasSources ? `${input.selectedSources.length} 份可复用输入源` : '本轮没有可复用输入源，只能依赖用户意图。',
      refIds: input.selectedSources.map((source) => source.id),
      evidenceRefs,
      stepId: 'context:input-sources',
      payload: { sourceCount: input.selectedSources.length },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'tool',
      status: hasSources ? 'completed' : 'blocked',
      eventClass: hasSources ? 'tool.result' : 'tool.failed',
      owner: 'runtime',
      phase: hasSources ? 'completed' : 'blocked',
      title: hasSources ? '资料读取完成' : '资料读取受阻',
      detail: hasSources ? `${input.selectedSources.length} 份资料已进入上下文。` : '缺少输入源，需要人工补充资料。',
      refIds: input.selectedSources.map((source) => source.id),
      evidenceRefs,
      toolCallId: inputSourceToolCallId,
      stepId: 'tool:input-sources:result',
      payload: {
        toolName: 'input-source.read',
        outputPreview: hasSources ? `${input.selectedSources.length} sources` : 'missing sources',
      },
      createdAt: input.now,
      ...common,
    }),
    ...(hasSources ? [
      executionEvent({
        kind: 'evidence',
        status: 'completed',
        eventClass: 'evidence.changed',
        owner: 'evidence',
        phase: 'preparing',
        title: '绑定来源证据',
        detail: `${input.selectedSources.length} 份输入源已进入本轮证据链。`,
        refIds: input.selectedSources.map((source) => source.id),
        evidenceRefs,
        stepId: 'evidence:input-sources',
        payload: { evidenceKind: 'input-source', sourceCount: input.selectedSources.length },
        createdAt: input.now,
        ...common,
      }),
      executionEvent({
        kind: 'action',
        status: 'completed',
        eventClass: 'action.resolved',
        owner: 'runtime',
        phase: 'completed',
        title: '输入源已确认',
        detail: '本轮可继续生成 Prompt 草稿。',
        actionId: `action:${input.sessionId}:confirm-sources`,
        stepId: 'action:confirm-sources',
        payload: { actionKind: 'confirm-sources', sourceCount: input.selectedSources.length },
        createdAt: input.now,
        ...common,
      }),
    ] : [
      executionEvent({
        kind: 'permission',
        status: 'pending',
        eventClass: 'permission.requested',
        owner: 'runtime',
        phase: 'action_required',
        title: '请求补充资料权限',
        detail: '需要用户补充输入源后再继续生成。',
        actionId: `action:${input.sessionId}:add-input-source`,
        stepId: 'permission:add-input-source',
        payload: {
          permissionDecision: {
            decision: 'ask',
            decisionSource: 'runtime',
            decisionReason: 'missing-input-source',
            approvalActionId: `action:${input.sessionId}:add-input-source`,
            scope: 'turn',
          },
        },
        createdAt: input.now,
        ...common,
      }),
      executionEvent({
        kind: 'action',
        status: 'pending',
        eventClass: 'action.required',
        owner: 'runtime',
        phase: 'action_required',
        title: '需要补充输入源',
        detail: '补充品牌资料、产品资料、参考素材或用户评论后再继续生成。',
        actionId: `action:${input.sessionId}:add-input-source`,
        stepId: 'action:add-input-source',
        payload: { actionKind: 'add-input-source', targetModule: 'knowledge-inputs' },
        createdAt: input.now,
        ...common,
      }),
    ]),
    executionEvent({
      kind: 'skill',
      status: 'completed',
      eventClass: 'tool.catalog.resolved',
      owner: 'runtime',
      phase: 'routing',
      title: '应用 skill 约束',
      detail: skillSummaryText(input.skillContext),
      refIds: input.skillContext.skillRefs.map((skill) => skill.slug),
      stepId: 'tool-catalog:skills',
      payload: { skillCount: input.skillContext.skillRefs.length },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'permission',
      status: 'completed',
      eventClass: 'permission.evaluated',
      owner: 'runtime',
      phase: modelStatus === 'blocked' ? 'blocked' : 'waiting_provider',
      title: '检查生成权限',
      detail: modelStatus === 'blocked' ? '生成服务不可用，需要先配置模型。' : '允许调用当前文字生成服务。',
      model: input.draft.model,
      stepId: 'permission:model-generate',
      payload: {
        permissionState: { mode: 'default', interactive: true },
        permissionDecision: {
          decision: modelStatus === 'blocked' ? 'unavailable' : 'allow',
          decisionSource: 'runtime',
          decisionReason: modelStatus === 'blocked' ? 'text-provider-not-configured' : 'configured-text-provider',
          scope: 'turn',
        },
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'sandbox',
      status: 'completed',
      eventClass: 'sandbox.applied',
      owner: 'runtime',
      phase: modelStatus === 'blocked' ? 'blocked' : 'waiting_provider',
      title: '应用执行边界',
      detail: '仅使用当前工作区资料和已配置的文字生成服务。',
      model: input.draft.model,
      stepId: 'sandbox:model-generate',
      payload: {
        sandboxProfile: {
          mode: 'workspace_write',
          cwd: 'current-workspace',
          readRoots: ['workspace'],
          writeRoots: ['workspace'],
          network: modelStatus === 'blocked' ? 'unavailable' : 'enabled',
        },
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'model',
      status: 'completed',
      eventClass: 'model.requested',
      owner: 'runtime',
      phase: 'waiting_provider',
      title: '请求生成模型',
      detail: input.protocol ? `${input.draft.model ?? '未记录模型'} / ${input.protocol}` : input.draft.model ?? '未记录模型',
      model: input.draft.model,
      stepId: 'model:generate-draft:requested',
      payload: {
        protocol: input.protocol,
        model: input.draft.model,
        providerEvents: compactProviderEvents(input.providerEvents).filter((event) => event.eventClass === 'model.requested'),
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'model',
      status: modelStatus,
      eventClass: modelStatus === 'completed' ? 'model.completed' : 'model.failed',
      owner: 'runtime',
      phase: modelStatus === 'completed' ? 'completed' : modelStatus === 'blocked' ? 'blocked' : 'failed',
      title: '调用生成模型',
      detail: input.protocol ? `${input.draft.model ?? '未记录模型'} / ${input.protocol}` : input.draft.model ?? '未记录模型',
      model: input.draft.model,
      stepId: 'model:generate-draft',
      payload: {
        protocol: input.protocol,
        model: input.draft.model,
        providerEvents: compactProviderEvents(input.providerEvents),
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'draft',
      status: modelStatus === 'blocked' ? 'blocked' : 'completed',
      eventClass: 'artifact.changed',
      owner: 'artifact',
      phase: modelStatus === 'blocked' ? 'blocked' : 'completed',
      title: '写入 Prompt 草稿',
      detail: input.draft.title,
      refIds: [input.draft.id],
      artifactRefs: [`prompt-draft:${input.draft.id}`],
      model: input.draft.model,
      stepId: `artifact:prompt-draft:${input.draft.id}`,
      payload: { artifactKind: 'prompt-draft', draftId: input.draft.id },
      createdAt: input.now,
      ...common,
    }),
    ...(modelStatus === 'blocked' ? [
      executionEvent({
        kind: 'permission',
        status: 'pending',
        eventClass: 'permission.requested',
        owner: 'runtime',
        phase: 'action_required',
        title: '请求配置模型权限',
        detail: '需要用户打开模型设置，配置可用的文字生成服务。',
        actionId: `action:${input.sessionId}:configure-text-model`,
        stepId: 'permission:configure-text-model',
        payload: {
          permissionDecision: {
            decision: 'ask',
            decisionSource: 'runtime',
            decisionReason: 'text-provider-not-configured',
            approvalActionId: `action:${input.sessionId}:configure-text-model`,
            scope: 'turn',
          },
        },
        model: input.draft.model,
        createdAt: input.now,
        ...common,
      }),
      executionEvent({
        kind: 'action',
        status: 'pending',
        eventClass: 'action.required',
        owner: 'runtime',
        phase: 'action_required',
        title: '需要配置文字模型',
        detail: '配置 Claude 或兼容文字生成服务后，可继续本轮 Prompt 草稿。',
        actionId: `action:${input.sessionId}:configure-text-model`,
        stepId: 'action:configure-text-model',
        payload: { actionKind: 'configure-text-model', providerStatus: input.draft.model },
        model: input.draft.model,
        createdAt: input.now,
        ...common,
      }),
    ] : []),
  ];
  const sequenced = events.map((event, index) => ({ ...event, sequence: index + 1 }));
  const sessionStatus: AgentPromptSession['status'] = modelStatus === 'blocked' ? 'blocked' : 'draft-created';
  return [
    ...sequenced,
    snapshotUpdatedEvent({
      now: input.now,
      sequence: sequenced.length + 1,
      sessionId: input.sessionId,
      turnId: input.turnId,
      taskId: common.taskId,
      runId: input.runId,
      status: sessionStatus,
      events: sequenced,
      messageCount: input.messageCount,
      draftIds: [input.draft.id],
    }),
  ];
}

function buildContinueExecutionEvents(input: {
  now: string;
  adjustment: string;
  generated: { model: string; protocol?: AgentPromptSession['textProtocol']; providerEvents?: TextProviderRuntimeEvent[] };
  updatedDraft: PromptDraft;
  skillContext: SkillRuntimeContext;
  sessionId: string;
  turnId: string;
  runId: string;
  baseSequence: number;
  previousEvents?: AgentPromptExecutionEvent[];
  messageCount?: number;
  draftIds?: string[];
}): AgentPromptExecutionEvent[] {
  const modelStatus = input.generated.model.startsWith('blocked:')
    ? 'blocked'
    : input.generated.model.startsWith('fallback:')
      ? 'failed'
      : 'completed';
  const common = {
    threadId: input.sessionId,
    turnId: input.turnId,
    taskId: `task:${input.sessionId}:refine`,
    runId: input.runId,
  };
  const sessionContextToolCallId = `tool:${input.sessionId}:session-context:${input.turnId}`;
  const events = [
    executionEvent({
      kind: 'context',
      status: 'completed',
      eventClass: 'turn.submitted',
      owner: 'runtime',
      phase: 'submitted',
      title: '读取本轮追问',
      detail: input.adjustment.slice(0, 160),
      stepId: 'turn:submitted',
      payload: { adjustmentLength: input.adjustment.length },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'tool',
      status: 'completed',
      eventClass: 'tool.started',
      owner: 'runtime',
      phase: 'tool_running',
      title: '读取对话上下文',
      detail: '准备读取历史草稿、输入源快照和本轮要求。',
      toolCallId: sessionContextToolCallId,
      stepId: 'tool:session-context:started',
      payload: {
        toolName: 'agent-session.context-read',
        safeArgs: { adjustmentLength: input.adjustment.length },
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'tool',
      status: 'completed',
      eventClass: 'tool.result',
      owner: 'runtime',
      phase: 'completed',
      title: '上下文读取完成',
      detail: '已载入当前草稿版本和会话来源快照。',
      toolCallId: sessionContextToolCallId,
      artifactRefs: [`prompt-draft:${input.updatedDraft.id}`],
      stepId: 'tool:session-context:result',
      payload: {
        toolName: 'agent-session.context-read',
        outputPreview: 'draft version and source snapshots loaded',
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'skill',
      status: 'completed',
      eventClass: 'tool.catalog.resolved',
      owner: 'runtime',
      phase: 'routing',
      title: '延续 skill 约束',
      detail: skillSummaryText(input.skillContext),
      refIds: input.skillContext.skillRefs.map((skill) => skill.slug),
      stepId: 'tool-catalog:skills',
      payload: { skillCount: input.skillContext.skillRefs.length },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'permission',
      status: 'completed',
      eventClass: 'permission.evaluated',
      owner: 'runtime',
      phase: modelStatus === 'blocked' ? 'blocked' : 'waiting_provider',
      title: '检查调整权限',
      detail: modelStatus === 'blocked' ? '生成服务不可用，需要先配置模型。' : '允许调用当前文字生成服务。',
      model: input.generated.model,
      stepId: 'permission:model-refine',
      payload: {
        permissionState: { mode: 'default', interactive: true },
        permissionDecision: {
          decision: modelStatus === 'blocked' ? 'unavailable' : 'allow',
          decisionSource: 'runtime',
          decisionReason: modelStatus === 'blocked' ? 'text-provider-not-configured' : 'configured-text-provider',
          scope: 'turn',
        },
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'sandbox',
      status: 'completed',
      eventClass: 'sandbox.applied',
      owner: 'runtime',
      phase: modelStatus === 'blocked' ? 'blocked' : 'waiting_provider',
      title: '应用执行边界',
      detail: '仅使用当前对话资料、草稿版本和已配置的文字生成服务。',
      model: input.generated.model,
      stepId: 'sandbox:model-refine',
      payload: {
        sandboxProfile: {
          mode: 'workspace_write',
          cwd: 'current-workspace',
          readRoots: ['workspace'],
          writeRoots: ['workspace'],
          network: modelStatus === 'blocked' ? 'unavailable' : 'enabled',
        },
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'model',
      status: 'completed',
      eventClass: 'model.requested',
      owner: 'runtime',
      phase: 'waiting_provider',
      title: '请求调整模型',
      detail: input.generated.protocol ? `${input.generated.model} / ${input.generated.protocol}` : input.generated.model,
      model: input.generated.model,
      stepId: 'model:refine-draft:requested',
      payload: {
        protocol: input.generated.protocol,
        model: input.generated.model,
        providerEvents: compactProviderEvents(input.generated.providerEvents).filter((event) => event.eventClass === 'model.requested'),
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'model',
      status: modelStatus,
      eventClass: modelStatus === 'completed' ? 'model.completed' : 'model.failed',
      owner: 'runtime',
      phase: modelStatus === 'completed' ? 'completed' : modelStatus === 'blocked' ? 'blocked' : 'failed',
      title: '调用调整模型',
      detail: input.generated.protocol ? `${input.generated.model} / ${input.generated.protocol}` : input.generated.model,
      model: input.generated.model,
      stepId: 'model:refine-draft',
      payload: {
        protocol: input.generated.protocol,
        model: input.generated.model,
        providerEvents: compactProviderEvents(input.generated.providerEvents),
      },
      createdAt: input.now,
      ...common,
    }),
    executionEvent({
      kind: 'draft',
      status: modelStatus === 'blocked' ? 'blocked' : 'completed',
      eventClass: 'artifact.changed',
      owner: 'artifact',
      phase: modelStatus === 'blocked' ? 'blocked' : 'completed',
      title: '更新 Prompt 草稿',
      detail: input.updatedDraft.title,
      refIds: [input.updatedDraft.id],
      artifactRefs: [`prompt-draft:${input.updatedDraft.id}`],
      model: input.generated.model,
      stepId: `artifact:prompt-draft:${input.updatedDraft.id}`,
      payload: { artifactKind: 'prompt-draft', draftId: input.updatedDraft.id },
      createdAt: input.now,
      ...common,
    }),
    ...(modelStatus === 'blocked' ? [
      executionEvent({
        kind: 'permission',
        status: 'pending',
        eventClass: 'permission.requested',
        owner: 'runtime',
        phase: 'action_required',
        title: '请求配置模型权限',
        detail: '需要用户打开模型设置，配置可用的文字生成服务。',
        actionId: `action:${input.sessionId}:configure-text-model`,
        stepId: 'permission:configure-text-model',
        payload: {
          permissionDecision: {
            decision: 'ask',
            decisionSource: 'runtime',
            decisionReason: 'text-provider-not-configured',
            approvalActionId: `action:${input.sessionId}:configure-text-model`,
            scope: 'turn',
          },
        },
        model: input.generated.model,
        createdAt: input.now,
        ...common,
      }),
      executionEvent({
        kind: 'action',
        status: 'pending',
        eventClass: 'action.required',
        owner: 'runtime',
        phase: 'action_required',
        title: '需要配置文字模型',
        detail: '配置 Claude 或兼容文字生成服务后，可继续本轮调整。',
        actionId: `action:${input.sessionId}:configure-text-model`,
        stepId: 'action:configure-text-model',
        payload: { actionKind: 'configure-text-model', providerStatus: input.generated.model },
        model: input.generated.model,
        createdAt: input.now,
        ...common,
      }),
    ] : [
      executionEvent({
        kind: 'action',
        status: 'completed',
        eventClass: 'action.resolved',
        owner: 'runtime',
        phase: 'completed',
        title: '调整已完成',
        detail: '本轮调整已经写入 Prompt 草稿版本。',
        actionId: `action:${input.sessionId}:confirm-refinement`,
        stepId: 'action:confirm-refinement',
        payload: { actionKind: 'confirm-refinement', draftId: input.updatedDraft.id },
        createdAt: input.now,
        ...common,
      }),
    ]),
  ];
  const sequenced = events.map((event, index) => ({ ...event, sequence: input.baseSequence + index + 1 }));
  const sessionStatus: AgentPromptSession['status'] = modelStatus === 'blocked' ? 'blocked' : 'draft-created';
  const eventsBeforeSnapshot = [...(input.previousEvents ?? []), ...sequenced];
  return [
    ...sequenced,
    snapshotUpdatedEvent({
      now: input.now,
      sequence: input.baseSequence + sequenced.length + 1,
      sessionId: input.sessionId,
      turnId: input.turnId,
      taskId: common.taskId,
      runId: input.runId,
      status: sessionStatus,
      events: eventsBeforeSnapshot,
      messageCount: input.messageCount,
      draftIds: input.draftIds,
    }),
  ];
}

interface AgentPromptModelService {
  generatePromptDraft(input: GenerateAgentPromptDraftInput): Promise<GenerateAgentPromptDraftResult>;
  generateRefinedPrompt(input: GenerateAgentPromptRefinementInput): Promise<GenerateAgentPromptRefinementResult>;
}

export class AgentPromptSessionStore {
  constructor(
    private readonly inputSources: InputSourceStore,
    private readonly promptDrafts: PromptDraftStore,
    private readonly textGeneration: TextGenerationService,
    private readonly promptAgent?: AgentPromptModelService,
    private readonly skills = new SkillManager(),
  ) {}

  async list(workspacePath: string): Promise<AgentPromptSession[]> {
    const sessions = await readJsonFile<AgentPromptSession[]>(sessionsFilePath(workspacePath), []);
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async start(input: StartAgentPromptSessionInput): Promise<AgentPromptSessionResult> {
    if (!input.userIntent.trim()) throw new Error('开始对话前需要先填写用户意图。');
    const allSources = await this.inputSources.list(input.workspacePath);
    const selectedSources = allSources.filter((source) => input.inputSourceIds.includes(source.id) && isReusablePromptInputSource(source));
    const inputSourceIds = selectedSources.map((source) => source.id);
    const skillContext = await buildSkillRuntimeContext(this.skills, input.workspacePath, input);
    let draft: PromptDraft;
    let providerEvents: TextProviderRuntimeEvent[] | undefined;
    if (this.promptAgent) {
      const generated = await this.promptAgent.generatePromptDraft({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        title: input.title,
        purpose: input.purpose,
        userIntent: input.userIntent,
        inputSourceIds,
        sceneCardIds: input.sceneCardIds,
        selectedSkills: skillContext.skillRefs,
        selectedSkillSlugs: skillContext.skillRefs.map((skill) => skill.slug),
        selectedSources,
        skillContext,
        textModel: input.textModel,
        teamKnowledgeRelease: input.teamKnowledgeRelease,
      });
      providerEvents = generated.providerEvents;
      draft = await this.promptDrafts.createFromContent({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        teamKnowledgeRelease: input.teamKnowledgeRelease,
        title: input.title?.trim() || generated.title || '模型生成 Prompt 草稿',
        purpose: input.purpose,
        userIntent: input.userIntent.trim(),
        inputSourceIds,
        sceneCardIds: input.sceneCardIds ?? [],
        selectedSkills: skillContext.skillRefs,
        content: generated.content,
        note: generated.note,
        model: generated.model,
        textProtocol: generated.protocol,
      });
    } else {
      draft = await this.promptDrafts.generate({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        title: input.title,
        purpose: input.purpose,
        userIntent: input.userIntent,
        inputSourceIds,
        sceneCardIds: input.sceneCardIds,
        selectedSkills: skillContext.skillRefs,
        selectedSkillSlugs: skillContext.skillRefs.map((skill) => skill.slug),
        teamKnowledgeRelease: input.teamKnowledgeRelease,
      });
    }
    const now = new Date().toISOString();
    const sessionId = randomUUID();
    const turnId = randomUUID();
    const runId = randomUUID();
    const firstVersion = activeVersion(draft);
    const sourceSnapshots = selectedSources.map(snapshotSource);
    const messages: AgentPromptMessage[] = [
      {
        id: randomUUID(),
        role: 'user',
        kind: 'intent',
        content: [
          '用户意图：',
          input.userIntent.trim(),
          '',
          '输入源快照：',
          sourceSnapshotText(sourceSnapshots),
          '',
          '团队知识包：',
          input.teamKnowledgeRelease
            ? `${input.teamKnowledgeRelease.title} ${input.teamKnowledgeRelease.version}`
            : '未绑定，本轮只使用输入源和用户意图。',
          '',
          '本轮 skills：',
          skillSummaryText(skillContext),
        ].join('\n'),
        createdAt: now,
      },
      {
        id: randomUUID(),
        role: 'assistant',
        kind: 'draft',
        content: firstVersion.content,
        model: draft.model,
        promptDraftId: draft.id,
        createdAt: now,
      },
    ];
    const session: AgentPromptSession = {
      id: sessionId,
      workspacePath: input.workspacePath,
      workflowRunId: input.workflowRunId,
      teamKnowledgeRelease: input.teamKnowledgeRelease,
      title: input.title?.trim() || draft.title,
      purpose: input.purpose,
      status: draft.model?.startsWith('blocked:') ? 'blocked' : 'draft-created',
      userIntent: input.userIntent.trim(),
      inputSourceIds,
      sceneCardIds: input.sceneCardIds ?? [],
      selectedSkills: skillContext.skillRefs,
      promptDraftIds: [draft.id],
      sourceSnapshots,
      messages,
      executionEvents: buildStartExecutionEvents({
        now,
        selectedSources,
        skillContext,
        draft,
        protocol: draft.textProtocol,
        providerEvents,
        sessionId,
        turnId,
        runId,
        messageCount: messages.length,
      }),
      model: draft.model,
      textProtocol: draft.textProtocol,
      createdAt: now,
      updatedAt: now,
    };
    const existing = await this.list(input.workspacePath);
    await writeJsonFile(sessionsFilePath(input.workspacePath), [session, ...existing].slice(0, 120));
    return { session, draft };
  }

  async continue(input: ContinueAgentPromptSessionInput): Promise<AgentPromptSessionResult> {
    const adjustment = input.message.trim();
    if (!adjustment) throw new Error('继续对话需要填写调整要求。');
    const sessions = await this.list(input.workspacePath);
    const session = sessions.find((item) => item.id === input.sessionId);
    if (!session) throw new Error(`对话不存在: ${input.sessionId}`);
    const draftId = session.promptDraftIds[session.promptDraftIds.length - 1];
    const draft = (await this.promptDrafts.list(input.workspacePath)).find((item) => item.id === draftId);
    if (!draft) throw new Error(`对话关联的 Prompt 草稿不存在: ${draftId}`);

    const previousContent = activeVersion(draft).content;
    const skillContext = await buildSkillRuntimeContext(this.skills, input.workspacePath, {
      selectedSkills: session.selectedSkills ?? draft.selectedSkills ?? [],
    });
    const generated = this.promptAgent
      ? await this.promptAgent.generateRefinedPrompt({
        workspacePath: input.workspacePath,
        purpose: session.purpose,
        previousContent,
        adjustment,
        sourceSnapshots: session.sourceSnapshots,
        messages: session.messages,
        skillContext,
        textModel: input.textModel ?? reusableSessionModel(session.model),
      })
      : await this.generateRefinedContent(
        session,
        previousContent,
        adjustment,
        skillContext,
        input.textModel ?? reusableSessionModel(session.model),
      );
    const updatedDraft = await this.promptDrafts.update({
      workspacePath: input.workspacePath,
      draftId: draft.id,
      content: generated.content,
      note: generated.note,
      model: generated.model,
      textProtocol: generated.protocol,
    });
    const now = new Date().toISOString();
    const turnId = randomUUID();
    const runId = randomUUID();
    const updatedSession: AgentPromptSession = {
      ...session,
      status: generated.model.startsWith('blocked:') ? 'blocked' : 'draft-created',
      promptDraftIds: session.promptDraftIds.includes(updatedDraft.id)
        ? session.promptDraftIds
        : [...session.promptDraftIds, updatedDraft.id],
      messages: [
        ...session.messages,
        {
          id: randomUUID(),
          role: 'user' as const,
          kind: 'adjustment' as const,
          content: adjustment,
          promptDraftId: updatedDraft.id,
          createdAt: now,
        },
        {
          id: randomUUID(),
          role: 'assistant' as const,
          kind: 'draft' as const,
          content: generated.content,
          model: generated.model,
          promptDraftId: updatedDraft.id,
          createdAt: now,
        },
      ].slice(-80),
      executionEvents: [
        ...(session.executionEvents ?? []),
        ...buildContinueExecutionEvents({
          now,
          adjustment,
          generated,
          updatedDraft,
          skillContext,
          sessionId: session.id,
          turnId,
          runId,
          baseSequence: session.executionEvents?.length ?? 0,
          previousEvents: session.executionEvents ?? [],
          messageCount: session.messages.length + 2,
          draftIds: session.promptDraftIds.includes(updatedDraft.id)
            ? session.promptDraftIds
            : [...session.promptDraftIds, updatedDraft.id],
        }),
      ].slice(-120),
      model: generated.model,
      textProtocol: updatedDraft.textProtocol ?? session.textProtocol,
      updatedAt: now,
    };
    await writeJsonFile(
      sessionsFilePath(input.workspacePath),
      sessions.map((item) => (item.id === session.id ? updatedSession : item)),
    );
    return { session: updatedSession, draft: updatedDraft };
  }

  async respondAction(input: RespondAgentPromptActionInput): Promise<AgentPromptSession> {
    if (!input.actionId.trim()) throw new Error('处理待办动作需要 actionId。');
    const sessions = await this.list(input.workspacePath);
    const session = sessions.find((item) => item.id === input.sessionId);
    if (!session) throw new Error(`对话不存在: ${input.sessionId}`);
    const events = session.executionEvents ?? [];
    const sourceEvent = events.find((event) => event.eventClass === 'action.required' && event.actionId === input.actionId);
    if (!sourceEvent) throw new Error(`待处理动作不存在: ${input.actionId}`);
    const alreadyResolved = events.some((event) => (
      event.eventClass === 'action.resolved' &&
      event.actionId === input.actionId &&
      event.payload?.resolvedFromEventId === sourceEvent.id
    ));
    if (alreadyResolved) return session;

    const now = new Date().toISOString();
    const sourcePermission = events.find((event) => event.eventClass === 'permission.requested' && event.actionId === input.actionId);
    const resolvedPermissionEvent = executionEvent({
      kind: 'permission',
      status: 'completed',
      eventClass: 'permission.resolved',
      owner: 'runtime',
      phase: 'completed',
      sequence: events.length + 1,
      threadId: sourceEvent.threadId ?? session.id,
      turnId: sourceEvent.turnId,
      taskId: sourceEvent.taskId,
      runId: sourceEvent.runId,
      actionId: input.actionId,
      stepId: sourcePermission?.stepId ? `${sourcePermission.stepId}:resolved` : `permission:${input.actionId}:resolved`,
      title: '人工处理已记录',
      detail: resolvedActionDetail(sourceEvent, input),
      refIds: sourceEvent.refIds,
      artifactRefs: sourceEvent.artifactRefs,
      evidenceRefs: sourceEvent.evidenceRefs,
      payload: {
        ...(sourcePermission?.payload ?? {}),
        permissionDecision: {
          decision: 'allow',
          decisionSource: 'human',
          decisionReason: input.decision,
          approvalActionId: input.actionId,
          scope: 'turn',
        },
        responsePayload: input.payload ?? {},
        resolvedFromEventId: sourcePermission?.id ?? sourceEvent.id,
      },
      model: sourceEvent.model,
      createdAt: now,
    });
    const resolvedEvent = executionEvent({
      kind: 'action',
      status: 'completed',
      eventClass: 'action.resolved',
      owner: 'runtime',
      phase: 'completed',
      sequence: events.length + 2,
      threadId: sourceEvent.threadId ?? session.id,
      turnId: sourceEvent.turnId,
      taskId: sourceEvent.taskId,
      runId: sourceEvent.runId,
      actionId: input.actionId,
      stepId: sourceEvent.stepId ? `${sourceEvent.stepId}:resolved` : `action:${input.actionId}:resolved`,
      title: resolvedActionTitle(input.decision),
      detail: resolvedActionDetail(sourceEvent, input),
      refIds: sourceEvent.refIds,
      artifactRefs: sourceEvent.artifactRefs,
      evidenceRefs: sourceEvent.evidenceRefs,
      payload: {
        ...(sourceEvent.payload ?? {}),
        decision: input.decision,
        responsePayload: input.payload ?? {},
        resolvedFromEventId: sourceEvent.id,
      },
      model: sourceEvent.model,
      createdAt: now,
    });
    const nextEvents = [...events, resolvedPermissionEvent, resolvedEvent];
    const snapshotEvent = snapshotUpdatedEvent({
      now,
      sequence: events.length + 3,
      sessionId: session.id,
      turnId: sourceEvent.turnId,
      taskId: sourceEvent.taskId,
      runId: sourceEvent.runId,
      status: session.status,
      events: nextEvents,
      messageCount: session.messages.length,
      draftIds: session.promptDraftIds,
    });
    const updatedSession: AgentPromptSession = {
      ...session,
      executionEvents: [...nextEvents, snapshotEvent].slice(-120),
      updatedAt: now,
    };
    await writeJsonFile(
      sessionsFilePath(input.workspacePath),
      sessions.map((item) => (item.id === session.id ? updatedSession : item)),
    );
    return updatedSession;
  }

  async attachInputSources(input: AttachAgentPromptSessionInputSourcesInput): Promise<AgentPromptSession> {
    const requestedIds = Array.from(new Set(input.inputSourceIds.map((id) => id.trim()).filter(Boolean)));
    if (!requestedIds.length) throw new Error('绑定输入源需要至少一个 inputSourceId。');
    const sessions = await this.list(input.workspacePath);
    const session = sessions.find((item) => item.id === input.sessionId);
    if (!session) throw new Error(`对话不存在: ${input.sessionId}`);

    const idSet = new Set(requestedIds);
    const currentIds = new Set(session.inputSourceIds);
    const allSources = await this.inputSources.list(input.workspacePath);
    const newSources = allSources.filter((source) => (
      idSet.has(source.id) &&
      !currentIds.has(source.id) &&
      isReusablePromptInputSource(source)
    ));
    if (!newSources.length) return session;

    const now = new Date().toISOString();
    const events = session.executionEvents ?? [];
    const turnId = randomUUID();
    const runId = randomUUID();
    const taskId = `task:${session.id}:source-supplement`;
    const refIds = newSources.map((source) => source.id);
    const evidenceRefs = newSources.map((source) => `input-source:${source.id}`);
    const sourceTitles = newSources.map((source) => source.title).join('、');
    const pendingSourceAction = events.find((event) => (
      event.eventClass === 'action.required' &&
      event.payload?.actionKind === 'add-input-source' &&
      !events.some((item) => item.eventClass === 'action.resolved' && item.actionId === event.actionId)
    ));
    const nextEvents: AgentPromptExecutionEvent[] = [
      executionEvent({
        kind: 'source',
        status: 'completed',
        eventClass: 'context.resolved',
        owner: 'runtime',
        phase: 'preparing',
        sequence: events.length + 1,
        threadId: session.id,
        turnId,
        taskId,
        runId,
        stepId: `context:input-source-supplement:${turnId}`,
        title: '已补充输入源',
        detail: `${newSources.length} 份资料已绑定到当前对话。`,
        refIds,
        evidenceRefs,
        payload: {
          sourceCount: newSources.length,
          reason: input.reason?.trim() || 'input-source-supplement',
        },
        createdAt: now,
      }),
      executionEvent({
        kind: 'evidence',
        status: 'completed',
        eventClass: 'evidence.changed',
        owner: 'evidence',
        phase: 'preparing',
        sequence: events.length + 2,
        threadId: session.id,
        turnId,
        taskId,
        runId,
        stepId: `evidence:input-source-supplement:${turnId}`,
        title: '来源证据已更新',
        detail: sourceTitles,
        refIds,
        evidenceRefs,
        payload: {
          evidenceKind: 'input-source',
          sourceCount: newSources.length,
        },
        createdAt: now,
      }),
      ...(pendingSourceAction?.actionId ? [
        executionEvent({
          kind: 'permission',
          status: 'completed',
          eventClass: 'permission.resolved',
          owner: 'runtime',
          phase: 'completed',
          sequence: events.length + 3,
          threadId: session.id,
          turnId,
          taskId,
          runId,
          actionId: pendingSourceAction.actionId,
          stepId: `permission:${pendingSourceAction.actionId}:resolved`,
          title: '补充资料权限已完成',
          detail: `${newSources.length} 份资料已绑定到当前对话。`,
          refIds,
          evidenceRefs,
          payload: {
            permissionDecision: {
              decision: 'allow',
              decisionSource: 'human',
              decisionReason: input.reason?.trim() || 'input-source-supplement',
              approvalActionId: pendingSourceAction.actionId,
              scope: 'turn',
            },
            responsePayload: { inputSourceIds: refIds },
            resolvedFromEventId: pendingSourceAction.id,
          },
          createdAt: now,
        }),
        executionEvent({
          kind: 'action',
          status: 'completed',
          eventClass: 'action.resolved',
          owner: 'runtime',
          phase: 'completed',
          sequence: events.length + 4,
          threadId: session.id,
          turnId,
          taskId,
          runId,
          actionId: pendingSourceAction.actionId,
          stepId: `${pendingSourceAction.stepId ?? pendingSourceAction.actionId}:resolved`,
          title: '输入源已补充',
          detail: `${newSources.length} 份资料已进入本轮证据链。`,
          refIds,
          evidenceRefs,
          payload: {
            ...(pendingSourceAction.payload ?? {}),
            decision: 'open-input-source',
            responsePayload: { inputSourceIds: refIds },
            resolvedFromEventId: pendingSourceAction.id,
          },
          createdAt: now,
        }),
      ] : []),
    ];
    const mergedEvents = [...events, ...nextEvents];
    const mergedSnapshots = [
      ...session.sourceSnapshots.filter((source) => !idSet.has(source.sourceId)),
      ...newSources.map(snapshotSource),
    ];
    const note: AgentPromptMessage = {
      id: randomUUID(),
      role: 'system',
      kind: 'note',
      content: [
        '已补充输入源：',
        ...newSources.map((source, index) => `${index + 1}. ${source.title}（${sourcePurposeLabel(source.purpose)} / ${sourceStatusLabel(source.status)}）`),
        '',
        '后续调整必须基于这些输入源，不得编造未登记事实。',
      ].join('\n'),
      createdAt: now,
    };
    const updatedSession: AgentPromptSession = {
      ...session,
      status: session.status === 'waiting-user' ? 'active' : session.status,
      inputSourceIds: Array.from(new Set([...session.inputSourceIds, ...refIds])),
      sourceSnapshots: mergedSnapshots,
      messages: [...session.messages, note].slice(-80),
      executionEvents: [
        ...mergedEvents,
        snapshotUpdatedEvent({
          now,
          sequence: mergedEvents.length + 1,
          sessionId: session.id,
          turnId,
          taskId,
          runId,
          status: session.status === 'waiting-user' ? 'active' : session.status,
          events: mergedEvents,
          messageCount: session.messages.length + 1,
          draftIds: session.promptDraftIds,
        }),
      ].slice(-120),
      updatedAt: now,
    };
    await writeJsonFile(
      sessionsFilePath(input.workspacePath),
      sessions.map((item) => (item.id === session.id ? updatedSession : item)),
    );
    return updatedSession;
  }

  private async generateRefinedContent(
    session: AgentPromptSession,
    previousContent: string,
    adjustment: string,
    skillContext: SkillRuntimeContext,
    textModel?: string,
  ): Promise<{
    content: string;
    note: string;
    model: string;
    protocol?: AgentPromptSession['textProtocol'];
    providerEvents?: TextProviderRuntimeEvent[];
  }> {
    try {
      const result = await this.textGeneration.generateJson<RefinePromptOutput>({
        workspacePath: session.workspacePath,
        model: textModel,
        systemPrompt: [
          `你是${getOemRuntimeConfig().productName}内容工厂的 Prompt 多轮调整 Agent。`,
          '你必须基于会话输入源、已有 Prompt 草稿和用户本轮调整要求改写 Prompt。',
          '必须保留来源约束，不编造输入源没有的卖点、功效、背书或用户案例。',
          '如果调整要求缺少必要信息，要给出追问；如果来源存在 blocked，要提醒人工确认。',
          skillContext.promptText ? '本轮会话绑定了 skills，你必须持续遵守这些执行规范。' : '',
        ].join('\n'),
        prompt: [
          `下游用途：${session.purpose}`,
          '',
          skillContext.promptText ? '本轮 skill 执行规范：' : '',
          skillContext.promptText,
          skillContext.promptText ? '' : '',
          '输入源快照：',
          sourceSnapshotText(session.sourceSnapshots),
          '',
          '会话记录：',
          compactMessages(session.messages),
          '',
          '当前 Prompt 草稿：',
          previousContent,
          '',
          '本轮用户调整要求：',
          adjustment,
          '',
          '请返回改写后的完整 Prompt 正文，并列出仍需追问和来源风险。',
        ].join('\n'),
        schema: REFINE_PROMPT_SCHEMA,
        maxTurns: 2,
      });
      return {
        content: formatRefinedContent(previousContent, adjustment, result.value),
        note: [
          `对话调整完成：${result.model}`,
          skillContext.skillRefs.length ? `已应用 ${skillContext.skillRefs.length} 个 skill：${skillContext.summaryText}` : '',
        ].filter(Boolean).join('；'),
        model: result.model,
        protocol: result.protocol,
        providerEvents: result.providerEvents,
      };
    } catch (error) {
      const reason = error instanceof TextProviderBlockedError
        ? error.message
        : error instanceof TextProviderFailedError
          ? `文字模型生成失败：${error.message}`
          : `文字模型生成异常：${error instanceof Error ? error.message : String(error)}`;
      return {
        content: fallbackRefinedContent(previousContent, adjustment, reason),
        note: `对话调整未完成，已记录本轮要求：${reason}`,
        model: error instanceof TextProviderBlockedError ? 'blocked:text-provider' : 'fallback:local-rule',
        protocol: undefined,
        providerEvents: error instanceof TextProviderBlockedError || error instanceof TextProviderFailedError
          ? error.runtimeEvents
          : undefined,
      };
    }
  }
}
