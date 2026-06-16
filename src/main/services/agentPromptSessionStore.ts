import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  AgentPromptMessage,
  AgentPromptExecutionEvent,
  AgentPromptSession,
  AgentPromptSessionEvent,
  AgentPromptSessionResult,
  AgentPromptSourceSnapshot,
  AttachAgentPromptSessionInputSourcesInput,
  ContinueAgentPromptSessionInput,
  InputSourceRecord,
  PromptDraft,
  PromptDraftVersion,
  RespondAgentPromptActionInput,
  SkillRef,
  StartAgentPromptSessionInput,
} from '../../shared/types';
import { isReusablePromptInputSource } from '../../shared/inputSourcePolicy';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { InputSourceStore } from './inputSourceStore';
import { PromptDraftStore } from './promptDraftStore';
import { SkillManager } from './skillManager';
import { buildSkillRuntimeContext, type SkillRuntimeContext } from './skillRuntimeContext';
import type {
  ContinueAgentConversationInput,
  ContinueAgentConversationResult,
  GenerateAgentPromptDraftInput,
  GenerateAgentPromptDraftResult,
  GenerateAgentPromptRefinementInput,
  GenerateAgentPromptRefinementResult,
  RespondAgentRuntimeActionInput,
  RespondAgentRuntimeActionResult,
} from './appServerPromptAgentService';
import type { TextProviderRuntimeEvent } from '../providers/textGenerationProvider';

type AgentPromptSessionPublisher = (event: AgentPromptSessionEvent) => void;

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
    'task-input': '任务输入',
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

const AGENT_RUNTIME_SCHEMA_VERSION = 'agent-runtime-draft-2026-05';
const CONTENT_STUDIO_RUNTIME_ID = 'content-studio-agent-prompt-runtime';

function reusableSessionModel(model?: string): string | undefined {
  const trimmed = model?.trim();
  if (!trimmed || trimmed.startsWith('blocked:') || trimmed.startsWith('fallback:')) return undefined;
  return trimmed;
}

interface LimeAgentServerFailure {
  title: string;
  summary: string;
  recoveryHint: string;
  reason: string;
}

function limeAgentServerErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /lime-desktop-platform|runtime bridge|provider store|sidecar/i.test(message) &&
    !isModelInvocationFailureMessage(message) &&
    !isModelSetupFailureMessage(message)
  ) {
    return '未连接 Lime Desktop Platform，无法读取统一模型设置并启动 AI Agent 对话。请先启动平台宿主后重试。';
  }
  const sanitized = message
    .replace(/Lime Agent Server/gi, '协作生成服务')
    .replace(/App Server backend/gi, '生成服务')
    .replace(/App Server/gi, '生成服务')
    .replace(/backend/gi, '生成服务')
    .replace(/interface/gi, '连接')
    .replace(/API/gi, '生成服务')
    .replace(/接口/g, '连接')
    .replace(/session/gi, '对话')
    .replace(/sidecar/gi, '本地服务')
    .replace(/Prompt artifact/gi, '可交付 Prompt')
    .replace(/artifact/gi, '交付物');
  return sanitized;
}

function isModelInvocationFailureMessage(message: string): boolean {
  return /Authentication failed|Model not available|Status:\s*40[13]|403 Forbidden|401 Unauthorized|unauthorized|forbidden|鉴权失败|模型不可用/i.test(message);
}

function isModelSetupFailureMessage(message: string): boolean {
  return /平台文字模型未配置|未配置或未授权|Provider Key|可用凭据|显式模型 ID/i.test(message);
}

function limeAgentServerFailure(errorOrReason: unknown): LimeAgentServerFailure {
  const reason = typeof errorOrReason === 'string'
    ? errorOrReason
    : limeAgentServerErrorMessage(errorOrReason);
  if (isModelSetupFailureMessage(reason)) {
    return {
      title: 'AI Agent 模型未配置或未授权',
      summary: [
        'AI Agent 已连接平台，但当前没有可用文字模型或 Provider 凭据。',
        reason,
        '当前不会生成本地 Prompt 草稿、工具记录或证据链；请在平台模型设置中启用文字 Provider、添加模型 ID 或重新授权后重试。',
      ].join('\n'),
      recoveryHint: '请在平台模型设置中启用文字 Provider、添加模型 ID 或重新授权后重试。',
      reason,
    };
  }
  if (isModelInvocationFailureMessage(reason)) {
    return {
      title: 'AI Agent 模型调用失败',
      summary: [
        'AI Agent 已连接平台，但模型服务返回鉴权失败或模型不可用。',
        reason,
        '当前不会生成本地 Prompt 草稿、工具记录或证据链；请在平台模型设置中切换可用模型或重新授权后重试。',
      ].join('\n'),
      recoveryHint: '请在平台模型设置中切换可用模型或重新授权后重试。',
      reason,
    };
  }
  return {
    title: 'AI Agent 对话未启动',
    summary: [
      'AI Agent 对话未启动。',
      reason,
      '当前不会生成本地 Prompt 草稿、工具记录或证据链；请连接 Lime Desktop Platform 后重试。',
    ].join('\n'),
    recoveryHint: '请连接 Lime Desktop Platform 后重试。',
    reason,
  };
}

function blockedAgentSession(input: {
  workspacePath: string;
  workflowRunId?: string;
  teamKnowledgeRelease?: AgentPromptSession['teamKnowledgeRelease'];
  title?: string;
  purpose: AgentPromptSession['purpose'];
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
  selectedSkills?: AgentPromptSession['selectedSkills'];
  selectedSkillSlugs?: string[];
  sourceSnapshots: AgentPromptSourceSnapshot[];
  failure: LimeAgentServerFailure;
  createdAt?: string;
}): AgentPromptSession {
  const now = input.createdAt ?? new Date().toISOString();
  const sessionId = randomUUID();
  const turnId = randomUUID();
  const message = input.failure.summary;
  return {
    id: sessionId,
    workspacePath: input.workspacePath,
    workflowRunId: input.workflowRunId,
    teamKnowledgeRelease: input.teamKnowledgeRelease,
    title: input.title?.trim() || input.failure.title,
    purpose: input.purpose,
    status: 'blocked',
    userIntent: input.userIntent.trim(),
    inputSourceIds: input.inputSourceIds,
    sceneCardIds: input.sceneCardIds ?? [],
    selectedSkills: input.selectedSkills,
    selectedSkillSlugs: input.selectedSkillSlugs,
    promptDraftIds: [],
    sourceSnapshots: input.sourceSnapshots,
    messages: [
      {
        id: randomUUID(),
        role: 'user',
        kind: 'intent',
        content: input.userIntent.trim(),
        createdAt: now,
      },
      {
        id: randomUUID(),
        role: 'system',
        kind: 'note',
        content: message,
        model: 'blocked:lime-agent-server',
        createdAt: now,
      },
    ],
    executionEvents: [
      executionEvent({
        kind: 'state',
        status: 'blocked',
        eventClass: 'runtime.error',
        owner: 'runtime',
        phase: 'blocked',
        sequence: 1,
        threadId: sessionId,
        turnId,
        taskId: `task:${sessionId}:app-server-runtime`,
        runId: `run:${sessionId}:app-server-runtime`,
        stepId: 'runtime:error',
        title: input.failure.title,
        detail: input.failure.reason,
        payload: {
          runtime: 'lime-agent-server',
          blockedReason: input.failure.reason,
          recoveryHint: input.failure.recoveryHint,
        },
        model: 'blocked:lime-agent-server',
        createdAt: now,
      }),
    ],
    model: 'blocked:lime-agent-server',
    createdAt: now,
    updatedAt: now,
  };
}

function appendBlockedSessionNote(
  session: AgentPromptSession,
  userMessage: string,
  failure: LimeAgentServerFailure,
): AgentPromptSession {
  const now = new Date().toISOString();
  const turnId = randomUUID();
  const runId = randomUUID();
  const existingEvents = session.executionEvents ?? [];
  return {
    ...session,
    status: 'blocked',
    messages: [
      ...session.messages,
      {
        id: randomUUID(),
        role: 'user' as const,
        kind: 'adjustment' as const,
        content: userMessage.trim(),
        createdAt: now,
      },
      {
        id: randomUUID(),
        role: 'system' as const,
        kind: 'note' as const,
        content: failure.summary,
        model: 'blocked:lime-agent-server',
        createdAt: now,
      },
    ].slice(-80),
    executionEvents: [
      ...existingEvents,
      executionEvent({
        kind: 'state',
        status: 'blocked',
        eventClass: 'runtime.error',
        owner: 'runtime',
        phase: 'blocked',
        sequence: existingEvents.length + 1,
        threadId: session.id,
        turnId,
        taskId: `task:${session.id}:app-server-runtime`,
        runId,
        stepId: `runtime:error:${turnId}`,
        title: failure.title,
        detail: failure.reason,
        payload: {
          runtime: 'lime-agent-server',
          blockedReason: failure.reason,
          recoveryHint: failure.recoveryHint,
        },
        model: 'blocked:lime-agent-server',
        createdAt: now,
      }),
    ].slice(-120),
    model: 'blocked:lime-agent-server',
    updatedAt: now,
  };
}

function skillSummaryText(skillContext: SkillRuntimeContext): string {
  return skillContext.skillRefs.length ? skillContext.summaryText : '未选择 skill。';
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

function nextEventSequence(session: AgentPromptSession): number {
  return (session.executionEvents?.length ?? 0) + 1;
}

function unresolvedActionIds(events: AgentPromptExecutionEvent[]): Set<string> {
  const resolvedActionIds = new Set(
    events
      .filter((event) => event.eventClass === 'action.resolved' && event.actionId)
      .map((event) => event.actionId as string),
  );
  return new Set(
    events
      .filter((event) => event.eventClass === 'action.required' && event.actionId && !resolvedActionIds.has(event.actionId))
      .map((event) => event.actionId as string),
  );
}

function actionResponseDetail(input: RespondAgentPromptActionInput): string {
  if (input.note?.trim()) return input.note.trim();
  if (input.decision === 'open-input-source') return '用户已打开输入源补充入口。';
  if (input.decision === 'open-model-settings') return '用户已打开模型设置入口。';
  return '用户已确认该动作。';
}

function actionResolvedEvent(input: {
  session: AgentPromptSession;
  response: RespondAgentPromptActionInput;
  now: string;
  scope?: 'runtime' | 'local-navigation';
}): AgentPromptExecutionEvent {
  return executionEvent({
    kind: 'action',
    status: 'completed',
    eventClass: 'action.resolved',
    owner: 'runtime',
    phase: 'completed',
    sequence: nextEventSequence(input.session),
    threadId: input.session.id,
    actionId: input.response.actionId,
    stepId: `action:${input.response.actionId}:resolved`,
    title: '人工确认已处理',
    detail: actionResponseDetail(input.response),
    payload: {
      decision: input.response.decision,
      response: input.response.payload ?? {},
      responseScope: input.scope ?? 'runtime',
    },
    createdAt: input.now,
  });
}

function actionRequiredEvent(
  session: AgentPromptSession,
  actionId: string,
): AgentPromptExecutionEvent | undefined {
  return (session.executionEvents ?? []).find((event) => (
    event.eventClass === 'action.required' &&
    event.actionId === actionId
  ));
}

function runtimeSessionIdForAction(session: AgentPromptSession, actionId: string): string | undefined {
  const actionEvent = actionRequiredEvent(session, actionId);
  const payload = payloadRecord(actionEvent?.payload);
  const rawPayload = payloadRecord(payload.rawPayload);
  return firstPayloadString(payload, rawPayload, 'sessionId', 'runtimeSessionId');
}

function isLocalNavigationAction(input: RespondAgentPromptActionInput): boolean {
  return input.decision === 'open-input-source' || input.decision === 'open-model-settings';
}

function mergeInputSourceIds(
  existingIds: string[],
  nextIds: string[],
): string[] {
  return Array.from(new Set([...existingIds, ...nextIds]));
}

function inputSourcesAttachedEvents(input: {
  session: AgentPromptSession;
  sources: InputSourceRecord[];
  reason?: string;
  now: string;
}): AgentPromptExecutionEvent[] {
  const sourceIds = input.sources.map((source) => source.id);
  const titles = input.sources.map((source) => source.title);
  const baseSequence = nextEventSequence(input.session);
  const contextEvent = executionEvent({
    kind: 'context',
    status: 'completed',
    eventClass: 'context.resolved',
    owner: 'runtime',
    phase: 'completed',
    sequence: baseSequence,
    threadId: input.session.id,
    stepId: `context:${input.session.id}:input-sources-attached`,
    title: '输入源已补充',
    detail: titles.length ? `已补充 ${titles.length} 个输入源：${titles.join('、')}` : '输入源已补充。',
    refIds: sourceIds,
    evidenceRefs: sourceIds.map((sourceId) => `input-source:${sourceId}`),
    payload: {
      reason: input.reason,
      inputSourceIds: sourceIds,
      sourceTitles: titles,
    },
    createdAt: input.now,
  });
  return [
    contextEvent,
    snapshotUpdatedEvent({
      now: input.now,
      sequence: baseSequence + 1,
      sessionId: input.session.id,
      status: input.session.status,
      events: [...(input.session.executionEvents ?? []), contextEvent],
      messageCount: input.session.messages.length,
      draftIds: input.session.promptDraftIds,
    }),
  ];
}

function payloadRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function payloadString(payload: Record<string, unknown>, rawPayload: Record<string, unknown>, field: string): string | undefined {
  const value = payload[field] ?? rawPayload[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function payloadStringArray(payload: Record<string, unknown>, rawPayload: Record<string, unknown>, ...fields: string[]): string[] {
  const values = fields.flatMap((field) => [payload[field], rawPayload[field]]);
  return Array.from(new Set(values.flatMap((value) => (
    Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  ))));
}

function firstPayloadString(
  payload: Record<string, unknown>,
  rawPayload: Record<string, unknown>,
  ...fields: string[]
): string | undefined {
  return fields
    .map((field) => payloadString(payload, rawPayload, field))
    .find((value): value is string => Boolean(value));
}

function sessionCapabilityRequest(session: AgentPromptSession): {
  requiredCapabilities: string[];
  capabilityHints: string[];
  agentTaskKind?: string;
  agentIntentId?: string;
  permissionMode?: 'safe' | 'ask' | 'allow-all';
} {
  const submittedEvent = (session.executionEvents ?? []).find((event) => event.eventClass === 'turn.submitted');
  const payload = payloadRecord(submittedEvent?.payload);
  const permissionMode = firstPayloadString(payload, {}, 'permissionMode', 'permission_mode');
  return {
    requiredCapabilities: payloadStringArray(payload, {}, 'requiredCapabilities', 'required_capabilities'),
    capabilityHints: payloadStringArray(payload, {}, 'capabilityHints', 'capability_hints'),
    agentTaskKind: firstPayloadString(payload, {}, 'agentTaskKind', 'agent_task_kind'),
    agentIntentId: firstPayloadString(payload, {}, 'agentIntentId', 'agent_intent_id'),
    permissionMode: permissionMode === 'safe' || permissionMode === 'ask' || permissionMode === 'allow-all'
      ? permissionMode
      : undefined,
  };
}

function streamingDeltaText(event: TextProviderRuntimeEvent): string {
  if (event.eventClass !== 'model.delta') return '';
  const payload = payloadRecord(event.payload);
  const rawPayload = payloadRecord(payload.rawPayload);
  const explicitText = firstPayloadString(payload, rawPayload, 'text', 'content', 'message', 'summary');
  if (explicitText) return explicitText;
  const detail = event.detail?.trim();
  if (!detail || detail === event.title.trim()) return '';
  if (/^(生成内容返回中|Lime App Server message\.delta|message\.delta)$/i.test(detail)) return '';
  return detail;
}

function isActionEventClass(eventClass?: string): boolean {
  return Boolean(eventClass?.startsWith('action.'));
}

function isToolEventClass(eventClass?: string): boolean {
  return Boolean(eventClass?.startsWith('tool.'));
}

function runtimeEventArtifactRefs(payload: Record<string, unknown>, rawPayload: Record<string, unknown>): string[] {
  const refs = [
    ...payloadStringArray(payload, rawPayload, 'artifactRefs', 'artifact_refs'),
    firstPayloadString(payload, rawPayload, 'artifactRef', 'artifact_ref', 'artifactId', 'artifact_id', 'path'),
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(refs));
}

function runtimeEventEvidenceRefs(payload: Record<string, unknown>, rawPayload: Record<string, unknown>): string[] {
  const refs = [
    ...payloadStringArray(payload, rawPayload, 'evidenceRefs', 'evidence_refs'),
    firstPayloadString(payload, rawPayload, 'evidenceRef', 'evidence_ref', 'evidenceId', 'evidence_id'),
  ].filter((value): value is string => Boolean(value));
  return Array.from(new Set(refs));
}

function runtimeEventToolCallId(input: {
  payload: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
  event: TextProviderRuntimeEvent;
  sessionId: string;
  turnId: string;
  operation: 'draft' | 'refine' | 'conversation';
  index: number;
}): string | undefined {
  const explicit = firstPayloadString(
    input.payload,
    input.rawPayload,
    'toolCallId',
    'tool_call_id',
    'callId',
    'call_id',
  );
  if (explicit) return explicit;
  if (!isToolEventClass(input.event.eventClass)) return undefined;
  const toolName = firstPayloadString(input.payload, input.rawPayload, 'toolName', 'tool_name', 'name', 'tool');
  const eventId = firstPayloadString(input.payload, input.rawPayload, 'eventId', 'id');
  const sequence = input.payload.sequence ?? input.rawPayload.sequence;
  const stablePart = eventId || sequence || toolName || input.index;
  return `tool:${input.sessionId}:${input.turnId}:${input.operation}:${stablePart}`;
}

function runtimeEventTaskId(
  payload: Record<string, unknown>,
  rawPayload: Record<string, unknown>,
  fallbackTaskId: string,
): string {
  return firstPayloadString(payload, rawPayload, 'taskId', 'task_id') ?? fallbackTaskId;
}

function runtimeFactOwner(kind: AgentPromptExecutionEvent['kind']): AgentPromptExecutionEvent['owner'] {
  if (kind === 'draft') return 'artifact';
  if (kind === 'evidence') return 'evidence';
  return 'runtime';
}

function isWaitingForUserOutput(content: string): boolean {
  const normalized = content.trim();
  if (!normalized) return true;
  if (/信息不足|信息有限|当前信息有限|资料有限|无法直接|不能直接|目前无法|不足以生成|需要进一步确认|需要确认的缺口/.test(normalized)) {
    return true;
  }
  const hasQuestion = /[？?]|请您|请提供|需要您|为了更好|无法直接|目前无法|信息不足|信息有限|未选择|补充|确认|请明确|请告诉我/.test(normalized);
  const hasDraftMarkers = /###\s*目标|##\s*.+Prompt|Prompt\s*(结构|正文)|负面约束|事实来源约束|镜头要点|主体[\/／]场景[\/／]动作/.test(normalized);
  return hasQuestion && !hasDraftMarkers;
}

function isConversationalUserIntent(content: string): boolean {
  const normalized = content
    .trim()
    .toLowerCase()
    .replace(/[。！!？?~～\s,.，、]+/g, '');
  if (!normalized) return true;
  return /^(你好|您好|哈喽|hello|hi|hey|在吗|在么|测试|test|ping)$/.test(normalized);
}

function updatedSessionStatus(model: string): AgentPromptSession['status'] {
  return model.startsWith('blocked:') ? 'blocked' : 'draft-created';
}

function isBlockedModel(model?: string): boolean {
  return Boolean(model?.startsWith('blocked:') || model?.startsWith('fallback:'));
}

function assistantVisibleContent(content: string): string {
  const promptDraftIndex = content.indexOf('Prompt 草稿：');
  if (promptDraftIndex < 0) return content;
  return content.slice(promptDraftIndex + 'Prompt 草稿：'.length).trim() || content;
}

function assistantSummaryFromContent(content: string, fallback: string): string {
  const paragraphs = assistantVisibleContent(content)
    .trim()
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const firstParagraph = paragraphs.find((item) =>
    /信息不足|信息有限|当前信息有限|资料有限|无法直接|不能直接|目前无法|不足以生成|请您提供更多|请提供更多|需要您补充|需要补充更多|补充更多关于|进一步确认|需要进一步确认|需要确认的缺口|请明确|请告诉我/.test(item),
  ) ?? paragraphs.find(Boolean);
  return firstParagraph?.slice(0, 600) || fallback;
}

function appServerProviderExecutionEvents(input: {
  now: string;
  providerEvents?: TextProviderRuntimeEvent[];
  sessionId: string;
  turnId: string;
  runId: string;
  operation: 'draft' | 'refine' | 'conversation';
  status: AgentPromptSession['status'];
  messageCount?: number;
  draftIds?: string[];
  baseSequence?: number;
}): AgentPromptExecutionEvent[] {
  const common = {
    threadId: input.sessionId,
    turnId: input.turnId,
    taskId: `task:${input.sessionId}:app-server-${input.operation}`,
    runId: input.runId,
  };
  const baseSequence = input.baseSequence ?? 0;
  const events = (input.providerEvents ?? []).map((event, index) => {
    const payload = payloadRecord(event.payload);
    const rawPayload = payloadRecord(payload.rawPayload);
    const actionId =
      firstPayloadString(payload, rawPayload, 'actionId', 'action_id') ??
      (isActionEventClass(event.eventClass)
        ? `action:${input.sessionId}:app-server:${index}`
        : undefined);
    const artifactRefs = runtimeEventArtifactRefs(payload, rawPayload);
    const evidenceRefs = runtimeEventEvidenceRefs(payload, rawPayload);
    const toolCallId = runtimeEventToolCallId({
      payload,
      rawPayload,
      event,
      sessionId: input.sessionId,
      turnId: input.turnId,
      operation: input.operation,
      index,
    });
    const taskId = runtimeEventTaskId(payload, rawPayload, common.taskId);
    return executionEvent({
      ...common,
      kind: event.kind,
      status: event.status,
      eventClass: event.eventClass,
      owner: runtimeFactOwner(event.kind),
      phase: event.phase,
      sequence: baseSequence + index + 1,
      title: event.title.replace(/^Lime Agent Server\s+/, 'Lime App Server '),
      detail: event.detail,
      model: event.model,
      taskId,
      toolCallId,
      actionId,
      artifactId: artifactRefs[0],
      evidenceId: evidenceRefs[0],
      artifactRefs: artifactRefs.length ? artifactRefs : undefined,
      evidenceRefs: evidenceRefs.length ? evidenceRefs : undefined,
      stepId: `app-server:${input.operation}:${event.eventClass}:${toolCallId ?? actionId ?? artifactRefs[0] ?? evidenceRefs[0] ?? taskId ?? index}`,
      payload: {
        ...payload,
        actionKind: firstPayloadString(payload, rawPayload, 'actionKind', 'action_kind'),
        targetModule: firstPayloadString(payload, rawPayload, 'targetModule', 'target_module'),
        taskId: firstPayloadString(payload, rawPayload, 'taskId', 'task_id') ?? taskId,
        subagentId: firstPayloadString(payload, rawPayload, 'subagentId', 'subagent_id'),
        handoffId: firstPayloadString(payload, rawPayload, 'handoffId', 'handoff_id'),
        reviewId: firstPayloadString(payload, rawPayload, 'reviewId', 'review_id'),
      },
      createdAt: input.now,
    });
  });
  const runtimeEvents = events.length ? events : [
    executionEvent({
      kind: 'state',
      status: 'blocked',
      eventClass: 'runtime.error',
      owner: 'runtime',
      phase: 'blocked',
      sequence: baseSequence + 1,
      title: 'Lime App Server runtime 未返回事件',
      detail: '未收到 Lime App Server runtime event，本轮不会补造本地执行记录。',
      stepId: `app-server:${input.operation}:missing-events`,
      payload: { runtime: 'lime-agent-server', operation: input.operation },
      createdAt: input.now,
      ...common,
    }),
  ];
  const localDraftEvents = input.status === 'draft-created'
    ? (input.draftIds ?? []).map((draftId, index) => executionEvent({
      kind: 'draft',
      status: 'completed',
      eventClass: 'artifact.changed',
      owner: 'artifact',
      phase: 'completed',
      sequence: baseSequence + runtimeEvents.length + index + 1,
      title: '本地 Prompt 草稿已投影',
      detail: 'Lime App Server 交付结果已写入 Content Studio Prompt 草稿。',
      artifactRefs: [`prompt-draft:${draftId}`],
      stepId: `content-studio:${input.operation}:draft-projected:${draftId}:${index}`,
      payload: {
        runtime: 'content-studio',
        sourceRuntime: 'lime-agent-server',
        draftId,
      },
      createdAt: input.now,
      ...common,
    }))
    : [];
  const eventsBeforeSnapshot = [...runtimeEvents, ...localDraftEvents];
  return [
    ...eventsBeforeSnapshot,
    snapshotUpdatedEvent({
      now: input.now,
      sequence: baseSequence + eventsBeforeSnapshot.length + 1,
      sessionId: input.sessionId,
      turnId: input.turnId,
      taskId: common.taskId,
      runId: input.runId,
      status: input.status,
      events: eventsBeforeSnapshot,
      messageCount: input.messageCount,
      draftIds: input.draftIds,
    }),
  ];
}

interface AgentPromptModelService {
  generatePromptDraft(input: GenerateAgentPromptDraftInput): Promise<GenerateAgentPromptDraftResult>;
  generateRefinedPrompt(input: GenerateAgentPromptRefinementInput): Promise<GenerateAgentPromptRefinementResult>;
  continueConversation(input: ContinueAgentConversationInput): Promise<ContinueAgentConversationResult>;
  respondAction?(input: RespondAgentRuntimeActionInput): Promise<RespondAgentRuntimeActionResult>;
}

export class AgentPromptSessionStore {
  constructor(
    private readonly inputSources: InputSourceStore,
    private readonly promptDrafts: PromptDraftStore,
    private readonly promptAgent: AgentPromptModelService,
    private readonly skills = new SkillManager(),
    private readonly publishSessionEvent?: AgentPromptSessionPublisher,
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
    const sourceSnapshots = selectedSources.map(snapshotSource);
    const sessionId = randomUUID();
    const turnId = randomUUID();
    const runId = randomUUID();
    let liveSession = this.createActiveSession({
      input,
      sessionId,
      turnId,
      runId,
      inputSourceIds,
      selectedSkills: skillContext.skillRefs,
      selectedSkillSlugs: skillContext.skillRefs.map((skill) => skill.slug),
      sourceSnapshots,
      skillContext,
    });
    await this.upsertSession(input.workspacePath, liveSession);
    this.publish(liveSession, 'upsert');
    let generated: GenerateAgentPromptDraftResult;
    try {
      generated = await this.promptAgent.generatePromptDraft({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        title: input.title,
        purpose: input.purpose,
        userIntent: input.userIntent,
        inputSourceIds,
        sceneCardIds: input.sceneCardIds,
        selectedSkills: skillContext.skillRefs,
        selectedSkillSlugs: skillContext.skillRefs.map((skill) => skill.slug),
        requiredCapabilities: input.requiredCapabilities,
        capabilityHints: input.capabilityHints,
        agentTaskKind: input.agentTaskKind,
        agentIntentId: input.agentIntentId,
        permissionMode: input.permissionMode,
        selectedSources,
        skillContext,
        textModel: input.textModel,
        teamKnowledgeRelease: input.teamKnowledgeRelease,
        onProviderEvent: async (event) => {
          liveSession = await this.applyProviderEvent({
            workspacePath: input.workspacePath,
            session: liveSession,
            event,
            operation: 'draft',
            turnId,
            runId,
          });
        },
      });
    } catch (error) {
      const failure = limeAgentServerFailure(error);
      const session = blockedAgentSession({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        teamKnowledgeRelease: input.teamKnowledgeRelease,
        title: input.title,
        purpose: input.purpose,
        userIntent: input.userIntent,
        inputSourceIds,
        sceneCardIds: input.sceneCardIds,
        selectedSkills: skillContext.skillRefs,
        selectedSkillSlugs: skillContext.skillRefs.map((skill) => skill.slug),
        sourceSnapshots,
        failure,
      });
      await this.upsertSession(input.workspacePath, session, sessionId);
      this.publish(session, 'blocked');
      return { session };
    }
    const now = new Date().toISOString();
    const waitingForUser = isConversationalUserIntent(input.userIntent) || isWaitingForUserOutput(generated.content);
    const draft = waitingForUser
      ? undefined
      : await this.promptDrafts.createFromContent({
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
        kind: waitingForUser ? 'note' : 'draft',
        content: waitingForUser
          ? assistantSummaryFromContent(generated.content, '需要补充更多信息后才能生成可交付 Prompt 草稿。')
          : '已生成 Prompt 草稿。完整内容已放入交付物区域，可继续调整或交付到下游。',
        model: generated.model,
        promptDraftId: draft?.id,
        createdAt: now,
      },
    ];
    const status: AgentPromptSession['status'] = waitingForUser
      ? 'waiting-user'
      : generated.model.startsWith('blocked:')
        ? 'blocked'
        : 'draft-created';
    const finalRuntimeEvents = appServerProviderExecutionEvents({
      now,
      sessionId,
      turnId,
      runId,
      operation: 'draft',
      status,
      providerEvents: generated.providerEvents,
      messageCount: messages.length,
      draftIds: draft ? [draft.id] : [],
      baseSequence: liveSession.executionEvents?.length ?? 0,
    });
    const session: AgentPromptSession = {
      ...liveSession,
      workspacePath: input.workspacePath,
      workflowRunId: input.workflowRunId,
      teamKnowledgeRelease: input.teamKnowledgeRelease,
      title: input.title?.trim() || draft?.title || '等待补充信息',
      purpose: input.purpose,
      status,
      userIntent: input.userIntent.trim(),
      inputSourceIds,
      sceneCardIds: input.sceneCardIds ?? [],
      selectedSkills: skillContext.skillRefs,
      selectedSkillSlugs: skillContext.skillRefs.map((skill) => skill.slug),
      promptDraftIds: draft ? [draft.id] : [],
      sourceSnapshots,
      messages,
      executionEvents: mergeExecutionEvents(liveSession.executionEvents ?? [], finalRuntimeEvents),
      model: generated.model,
      textProtocol: draft?.textProtocol,
      createdAt: now,
      updatedAt: now,
    };
    await this.upsertSession(input.workspacePath, session);
    this.publish(session, status === 'blocked' ? 'blocked' : 'completed');
    return { session, draft };
  }

  async continue(input: ContinueAgentPromptSessionInput): Promise<AgentPromptSessionResult> {
    const adjustment = input.message.trim();
    if (!adjustment) throw new Error('继续对话需要填写调整要求。');
    const sessions = await this.list(input.workspacePath);
    const session = sessions.find((item) => item.id === input.sessionId);
    if (!session) throw new Error(`对话不存在: ${input.sessionId}`);
    const draftId = session.promptDraftIds[session.promptDraftIds.length - 1];
    if (!draftId) {
      if (session.status === 'blocked' || isBlockedModel(session.model)) {
        const failure = limeAgentServerFailure('当前会话未接通生成服务，请先恢复模型服务后重新开始。');
        const updatedSession = appendBlockedSessionNote(session, adjustment, failure);
        await writeJsonFile(
          sessionsFilePath(input.workspacePath),
          sessions.map((item) => (item.id === session.id ? updatedSession : item)),
        );
        return { session: updatedSession };
      }
      return this.continueWithoutDraft({
        workspacePath: input.workspacePath,
        session,
        adjustment,
        textModel: input.textModel,
      });
    }
    const draft = (await this.promptDrafts.list(input.workspacePath)).find((item) => item.id === draftId);
    if (!draft) {
      const failure = limeAgentServerFailure(`对话关联的 Prompt 草稿不存在: ${draftId}`);
      const updatedSession = appendBlockedSessionNote(session, adjustment, failure);
      await writeJsonFile(
        sessionsFilePath(input.workspacePath),
        sessions.map((item) => (item.id === session.id ? updatedSession : item)),
      );
      return { session: updatedSession };
    }

    const previousContent = activeVersion(draft).content;
    const skillContext = await buildSkillRuntimeContext(this.skills, input.workspacePath, {
      selectedSkills: session.selectedSkills ?? draft.selectedSkills ?? [],
    });
    const capabilityRequest = sessionCapabilityRequest(session);
    const turnId = randomUUID();
    const runId = randomUUID();
    let liveSession = this.appendUserTurnPending(session, adjustment, turnId, runId, input.textModel ?? reusableSessionModel(session.model));
    await this.upsertSession(input.workspacePath, liveSession);
    this.publish(liveSession, 'upsert');
    let generated: GenerateAgentPromptRefinementResult;
    try {
      generated = await this.promptAgent.generateRefinedPrompt({
        workspacePath: input.workspacePath,
        sessionId: session.id,
        promptDraftId: draft.id,
        purpose: session.purpose,
        previousContent,
        adjustment,
        sourceSnapshots: session.sourceSnapshots,
        messages: session.messages,
        skillContext,
        textModel: input.textModel ?? reusableSessionModel(session.model),
        ...capabilityRequest,
        onProviderEvent: async (event) => {
          liveSession = await this.applyProviderEvent({
            workspacePath: input.workspacePath,
            session: liveSession,
            event,
            operation: 'refine',
            turnId,
            runId,
          });
        },
      });
    } catch (error) {
      const failure = limeAgentServerFailure(error);
      const updatedSession = appendBlockedSessionNote(session, adjustment, failure);
      await this.upsertSession(input.workspacePath, updatedSession);
      this.publish(updatedSession, 'blocked');
      return { session: updatedSession };
    }
    const updatedDraft = await this.promptDrafts.update({
      workspacePath: input.workspacePath,
      draftId: draft.id,
      content: generated.content,
      note: generated.note,
      model: generated.model,
      textProtocol: generated.protocol,
    });
    const now = new Date().toISOString();
    const updatedSession: AgentPromptSession = {
      ...liveSession,
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
        ...mergeExecutionEvents(
          liveSession.executionEvents ?? [],
          appServerProviderExecutionEvents({
            now,
            sessionId: session.id,
            turnId,
            runId,
            operation: 'refine',
            status: updatedSessionStatus(generated.model),
            providerEvents: generated.providerEvents,
            baseSequence: liveSession.executionEvents?.length ?? 0,
            messageCount: session.messages.length + 2,
            draftIds: session.promptDraftIds.includes(updatedDraft.id)
              ? session.promptDraftIds
              : [...session.promptDraftIds, updatedDraft.id],
          }),
        ),
      ].slice(-120),
      model: generated.model,
      textProtocol: updatedDraft.textProtocol ?? session.textProtocol,
      updatedAt: now,
    };
    await this.upsertSession(input.workspacePath, updatedSession);
    this.publish(updatedSession, updatedSession.status === 'blocked' ? 'blocked' : 'completed');
    return { session: updatedSession, draft: updatedDraft };
  }

  private async continueWithoutDraft(input: {
    workspacePath: string;
    session: AgentPromptSession;
    adjustment: string;
    textModel?: string;
  }): Promise<AgentPromptSessionResult> {
    const skillContext = await buildSkillRuntimeContext(this.skills, input.workspacePath, {
      selectedSkills: input.session.selectedSkills ?? [],
      selectedSkillSlugs: input.session.selectedSkillSlugs ?? [],
    });
    const capabilityRequest = sessionCapabilityRequest(input.session);
    const turnId = randomUUID();
    const runId = randomUUID();
    let liveSession = this.appendUserTurnPending(
      input.session,
      input.adjustment,
      turnId,
      runId,
      input.textModel ?? reusableSessionModel(input.session.model),
      'conversation',
    );
    await this.upsertSession(input.workspacePath, liveSession);
    this.publish(liveSession, 'upsert');

    let generated: ContinueAgentConversationResult;
    try {
      generated = await this.promptAgent.continueConversation({
        workspacePath: input.workspacePath,
        sessionId: input.session.id,
        purpose: input.session.purpose,
        userIntent: input.session.userIntent,
        adjustment: input.adjustment,
        sourceSnapshots: input.session.sourceSnapshots,
        messages: input.session.messages,
        skillContext,
        textModel: input.textModel ?? reusableSessionModel(input.session.model),
        ...capabilityRequest,
        onProviderEvent: async (event) => {
          liveSession = await this.applyProviderEvent({
            workspacePath: input.workspacePath,
            session: liveSession,
            event,
            operation: 'conversation',
            turnId,
            runId,
          });
        },
      });
    } catch (error) {
      const failure = limeAgentServerFailure(error);
      const updatedSession = appendBlockedSessionNote(input.session, input.adjustment, failure);
      await this.upsertSession(input.workspacePath, updatedSession);
      this.publish(updatedSession, 'blocked');
      return { session: updatedSession };
    }

    const now = new Date().toISOString();
    const waitingForUser = isConversationalUserIntent(input.adjustment) || isWaitingForUserOutput(generated.content);
    const draft = waitingForUser
      ? undefined
      : await this.promptDrafts.createFromContent({
        workspacePath: input.workspacePath,
        workflowRunId: input.session.workflowRunId,
        teamKnowledgeRelease: input.session.teamKnowledgeRelease,
        title: input.session.title?.trim() || generated.title || '模型生成 Prompt 草稿',
        purpose: input.session.purpose,
        userIntent: [input.session.userIntent, input.adjustment].filter(Boolean).join('\n'),
        inputSourceIds: input.session.inputSourceIds,
        sceneCardIds: input.session.sceneCardIds ?? [],
        selectedSkills: skillContext.skillRefs,
        content: generated.content,
        note: generated.note,
        model: generated.model,
        textProtocol: generated.protocol,
      });
    const status: AgentPromptSession['status'] = waitingForUser
      ? 'waiting-user'
      : updatedSessionStatus(generated.model);
    const promptDraftIds = draft ? [draft.id] : input.session.promptDraftIds;
    const updatedSession: AgentPromptSession = {
      ...liveSession,
      status,
      promptDraftIds,
      messages: [
        ...input.session.messages,
        {
          id: randomUUID(),
          role: 'user' as const,
          kind: 'adjustment' as const,
          content: input.adjustment,
          promptDraftId: draft?.id,
          createdAt: now,
        },
        {
          id: randomUUID(),
          role: 'assistant' as const,
          kind: waitingForUser ? 'note' as const : 'draft' as const,
          content: waitingForUser
            ? assistantSummaryFromContent(generated.content, '需要补充更多信息后才能生成可交付 Prompt 草稿。')
            : '已生成 Prompt 草稿。完整内容已放入交付物区域，可继续调整或交付到下游。',
          model: generated.model,
          promptDraftId: draft?.id,
          createdAt: now,
        },
      ].slice(-80),
      executionEvents: [
        ...mergeExecutionEvents(
          liveSession.executionEvents ?? [],
          appServerProviderExecutionEvents({
            now,
            sessionId: input.session.id,
            turnId,
            runId,
            operation: 'conversation',
            status,
            providerEvents: generated.providerEvents,
            baseSequence: liveSession.executionEvents?.length ?? 0,
            messageCount: input.session.messages.length + 2,
            draftIds: promptDraftIds,
          }),
        ),
      ].slice(-120),
      model: generated.model,
      textProtocol: draft?.textProtocol ?? input.session.textProtocol,
      updatedAt: now,
    };
    await this.upsertSession(input.workspacePath, updatedSession);
    this.publish(updatedSession, updatedSession.status === 'blocked' ? 'blocked' : 'completed');
    return { session: updatedSession, draft };
  }

  async respondAction(input: RespondAgentPromptActionInput): Promise<AgentPromptSession> {
    const sessions = await this.list(input.workspacePath);
    const session = sessions.find((item) => item.id === input.sessionId);
    if (!session) throw new Error(`对话不存在: ${input.sessionId}`);
    const actionIds = unresolvedActionIds(session.executionEvents ?? []);
    if (!actionIds.has(input.actionId)) {
      throw new Error(`待处理动作不存在或已处理: ${input.actionId}`);
    }
    const now = new Date().toISOString();
    const runtimeSessionId = runtimeSessionIdForAction(session, input.actionId);
    if (runtimeSessionId && this.promptAgent.respondAction) {
      let liveSession = session;
      const result = await this.promptAgent.respondAction({
        workspacePath: input.workspacePath,
        runtimeSessionId,
        actionId: input.actionId,
        decision: input.decision,
        note: input.note,
        payload: input.payload,
        textModel: reusableSessionModel(session.model),
        onProviderEvent: async (event) => {
          liveSession = await this.applyProviderEvent({
            workspacePath: input.workspacePath,
            session: liveSession,
            event,
            operation: 'conversation',
            turnId: event.payload && typeof event.payload === 'object' && typeof event.payload.turnId === 'string'
              ? event.payload.turnId
              : session.executionEvents?.find((item) => item.actionId === input.actionId)?.turnId ?? '',
            runId: `run:${input.sessionId}:action-respond`,
          });
        },
      });
      const responseEvents = appServerProviderExecutionEvents({
        now,
        sessionId: session.id,
        turnId: session.executionEvents?.find((event) => event.actionId === input.actionId)?.turnId ?? `turn:${input.actionId}:respond`,
        runId: `run:${input.sessionId}:action-respond`,
        operation: 'conversation',
        status: session.status,
        providerEvents: result.providerEvents,
        baseSequence: liveSession.executionEvents?.length ?? 0,
        messageCount: session.messages.length,
        draftIds: session.promptDraftIds,
      });
      const updatedSession: AgentPromptSession = {
        ...liveSession,
        executionEvents: mergeExecutionEvents(liveSession.executionEvents ?? [], responseEvents),
        model: result.model || session.model,
        updatedAt: now,
      };
      await this.upsertSession(input.workspacePath, updatedSession);
      this.publish(updatedSession, 'upsert');
      return updatedSession;
    }
    if (runtimeSessionId && !this.promptAgent.respondAction) {
      throw new Error('当前 Agent runtime 不支持 action/respond 回写，已阻断本地伪造完成。');
    }
    if (!isLocalNavigationAction(input)) {
      throw new Error('该待处理动作缺少 runtime 会话事实，不能本地伪造完成。');
    }
    const resolvedEvent = actionResolvedEvent({ session, response: input, now, scope: 'local-navigation' });
    const eventsBeforeSnapshot = mergeExecutionEvents(session.executionEvents ?? [], [resolvedEvent]);
    const updatedSession: AgentPromptSession = {
      ...session,
      executionEvents: mergeExecutionEvents(eventsBeforeSnapshot, [
        snapshotUpdatedEvent({
          now,
          sequence: eventsBeforeSnapshot.length + 1,
          sessionId: session.id,
          status: session.status,
          events: eventsBeforeSnapshot,
          messageCount: session.messages.length,
          draftIds: session.promptDraftIds,
        }),
      ]),
      updatedAt: now,
    };
    await this.upsertSession(input.workspacePath, updatedSession);
    this.publish(updatedSession, 'upsert');
    return updatedSession;
  }

  async attachInputSources(input: AttachAgentPromptSessionInputSourcesInput): Promise<AgentPromptSession> {
    const sessions = await this.list(input.workspacePath);
    const session = sessions.find((item) => item.id === input.sessionId);
    if (!session) throw new Error(`对话不存在: ${input.sessionId}`);
    const allSources = await this.inputSources.list(input.workspacePath);
    const selectedSources = allSources.filter((source) => input.inputSourceIds.includes(source.id) && isReusablePromptInputSource(source));
    if (!selectedSources.length) throw new Error('没有可用于 Agent 对话的输入源。');
    const now = new Date().toISOString();
    const inputSourceIds = mergeInputSourceIds(session.inputSourceIds, selectedSources.map((source) => source.id));
    const sourceSnapshots = [
      ...session.sourceSnapshots.filter((snapshot) => !inputSourceIds.includes(snapshot.sourceId)),
      ...allSources
        .filter((source) => inputSourceIds.includes(source.id) && isReusablePromptInputSource(source))
        .map(snapshotSource),
    ];
    const attachEvents = inputSourcesAttachedEvents({
      session,
      sources: selectedSources,
      reason: input.reason,
      now,
    });
    const updatedSession: AgentPromptSession = {
      ...session,
      inputSourceIds,
      sourceSnapshots,
      executionEvents: mergeExecutionEvents(session.executionEvents ?? [], attachEvents),
      updatedAt: now,
    };
    await this.upsertSession(input.workspacePath, updatedSession);
    this.publish(updatedSession, 'upsert');
    const continued = await this.continue({
      workspacePath: input.workspacePath,
      sessionId: updatedSession.id,
      message: [
        input.reason?.trim() || '已补充输入源，请基于新资料继续处理当前任务。',
        '',
        '新增输入源：',
        sourceSnapshotText(selectedSources.map(snapshotSource)),
      ].join('\n'),
    });
    return continued.session;
  }

  private createActiveSession(input: {
    input: StartAgentPromptSessionInput;
    sessionId: string;
    turnId: string;
    runId: string;
    inputSourceIds: string[];
    selectedSkills: SkillRef[];
    selectedSkillSlugs: string[];
    sourceSnapshots: AgentPromptSourceSnapshot[];
    skillContext: SkillRuntimeContext;
  }): AgentPromptSession {
    const now = new Date().toISOString();
    return {
      id: input.sessionId,
      workspacePath: input.input.workspacePath,
      workflowRunId: input.input.workflowRunId,
      teamKnowledgeRelease: input.input.teamKnowledgeRelease,
      title: input.input.title?.trim() || 'AI Agent 正在处理',
      purpose: input.input.purpose,
      status: 'active',
      userIntent: input.input.userIntent.trim(),
      inputSourceIds: input.inputSourceIds,
      sceneCardIds: input.input.sceneCardIds ?? [],
      selectedSkills: input.selectedSkills,
      selectedSkillSlugs: input.selectedSkillSlugs,
      promptDraftIds: [],
      sourceSnapshots: input.sourceSnapshots,
      messages: [
        {
          id: randomUUID(),
          role: 'user' as const,
          kind: 'intent' as const,
          content: input.input.userIntent.trim(),
          createdAt: now,
        },
        {
          id: randomUUID(),
          role: 'assistant' as const,
          kind: 'note' as const,
          content: '',
          model: input.input.textModel,
          createdAt: now,
        },
      ],
      executionEvents: [
        executionEvent({
          kind: 'state',
          status: 'running',
          eventClass: 'turn.submitted',
          owner: 'runtime',
          phase: 'submitted',
          sequence: 1,
          threadId: input.sessionId,
          turnId: input.turnId,
          taskId: `task:${input.sessionId}:app-server-draft`,
          runId: input.runId,
          stepId: `app-server:draft:submitted:${input.turnId}`,
          title: '请求已提交',
          detail: '正在等待 Lime App Server runtime 返回事件。',
          model: input.input.textModel,
          payload: {
            runtime: 'lime-agent-server',
            selectedSkillSlugs: input.selectedSkillSlugs,
            requiredCapabilities: input.input.requiredCapabilities ?? [],
            capabilityHints: input.input.capabilityHints ?? [],
            agentTaskKind: input.input.agentTaskKind,
            agentIntentId: input.input.agentIntentId,
            permissionMode: input.input.permissionMode,
            skillSummary: skillSummaryText(input.skillContext),
          },
          createdAt: now,
        }),
      ],
      model: input.input.textModel,
      createdAt: now,
      updatedAt: now,
    };
  }

  private appendUserTurnPending(
    session: AgentPromptSession,
    adjustment: string,
    turnId: string,
    runId: string,
    model?: string,
    operation: 'refine' | 'conversation' = 'refine',
  ): AgentPromptSession {
    const now = new Date().toISOString();
    const nextMessages: AgentPromptMessage[] = [
      ...session.messages,
      {
        id: randomUUID(),
        role: 'user' as const,
        kind: 'adjustment' as const,
        content: adjustment,
        createdAt: now,
      },
      {
        id: randomUUID(),
        role: 'assistant' as const,
        kind: 'note' as const,
        content: '',
        model,
        createdAt: now,
      },
    ].slice(-80);
    return {
      ...session,
      status: 'active',
      messages: nextMessages,
      executionEvents: [
        ...(session.executionEvents ?? []),
        executionEvent({
          kind: 'state',
          status: 'running',
          eventClass: 'turn.submitted',
          owner: 'runtime',
          phase: 'submitted',
          sequence: (session.executionEvents?.length ?? 0) + 1,
          threadId: session.id,
          turnId,
          taskId: `task:${session.id}:app-server-${operation}`,
          runId,
          stepId: `app-server:${operation}:submitted:${turnId}`,
          title: '请求已提交',
          detail: '正在等待 Lime App Server runtime 返回事件。',
          model,
          payload: { runtime: 'lime-agent-server' },
          createdAt: now,
        }),
      ].slice(-120),
      updatedAt: now,
    };
  }

  private async applyProviderEvent(input: {
    workspacePath: string;
    session: AgentPromptSession;
    event: TextProviderRuntimeEvent;
    operation: 'draft' | 'refine' | 'conversation';
    turnId: string;
    runId: string;
  }): Promise<AgentPromptSession> {
    const now = new Date().toISOString();
    const runtimeEvents = appServerProviderExecutionEvents({
      now,
      providerEvents: [input.event],
      sessionId: input.session.id,
      turnId: input.turnId,
      runId: input.runId,
      operation: input.operation,
      status: input.event.eventClass === 'model.failed' || input.event.eventClass === 'tool.failed' ? 'blocked' : 'active',
      messageCount: input.session.messages.length,
      draftIds: input.session.promptDraftIds,
      baseSequence: input.session.executionEvents?.length ?? 0,
    });
    const nextSession: AgentPromptSession = {
      ...input.session,
      status: input.event.eventClass === 'model.failed' || input.event.eventClass === 'tool.failed' ? 'blocked' : 'active',
      messages: updateStreamingAssistantMessage(input.session.messages, input.event),
      executionEvents: mergeExecutionEvents(input.session.executionEvents ?? [], runtimeEvents),
      model: input.event.model ?? input.session.model,
      updatedAt: now,
    };
    const persistedSession = await this.upsertSession(input.workspacePath, nextSession);
    this.publish(persistedSession, persistedSession.status === 'blocked' ? 'blocked' : 'upsert');
    return persistedSession;
  }

  private async upsertSession(
    workspacePath: string,
    session: AgentPromptSession,
    replaceSessionId = session.id,
  ): Promise<AgentPromptSession> {
    const existing = await this.list(workspacePath);
    const current = existing.find((item) => item.id === replaceSessionId || item.id === session.id);
    const nextSession = mergeSessionForUpsert(current, session);
    const next = [
      nextSession,
      ...existing.filter((item) => item.id !== replaceSessionId && item.id !== session.id),
    ].slice(0, 120);
    await writeJsonFile(sessionsFilePath(workspacePath), next);
    return nextSession;
  }

  private publish(session: AgentPromptSession, type: AgentPromptSessionEvent['type']): void {
    this.publishSessionEvent?.({
      type,
      workspacePath: session.workspacePath,
      session,
    });
  }

}

function mergeExecutionEvents(
  previous: AgentPromptExecutionEvent[],
  next: AgentPromptExecutionEvent[],
): AgentPromptExecutionEvent[] {
  const seen = new Set<string>();
  return [...previous, ...next]
    .filter((event) => {
      const key = [
        event.turnId,
        event.eventClass,
        event.toolCallId,
        event.actionId,
        event.artifactRefs?.join(','),
        event.evidenceRefs?.join(','),
        event.payload?.eventId,
        event.detail,
      ].filter(Boolean).join(':');
      if (key && seen.has(key)) return false;
      if (key) seen.add(key);
      return true;
    })
    .slice(-120);
}

function mergeSessionForUpsert(
  existing: AgentPromptSession | undefined,
  incoming: AgentPromptSession,
): AgentPromptSession {
  if (!existing || existing.id !== incoming.id) return incoming;
  if (shouldPreserveExistingResolvedSession(existing, incoming)) {
    return {
      ...existing,
      executionEvents: mergeExecutionEvents(existing.executionEvents ?? [], incoming.executionEvents ?? []),
      updatedAt: laterIsoTimestamp(existing.updatedAt, incoming.updatedAt),
    };
  }
  return {
    ...incoming,
    executionEvents: mergeExecutionEvents(existing.executionEvents ?? [], incoming.executionEvents ?? []),
  };
}

function shouldPreserveExistingResolvedSession(
  existing: AgentPromptSession,
  incoming: AgentPromptSession,
): boolean {
  if (incoming.status !== 'active') return false;
  if (existing.status === 'active') return false;
  if (incoming.messages.length > existing.messages.length) return false;
  return true;
}

function laterIsoTimestamp(left: string, right: string): string {
  return left.localeCompare(right) >= 0 ? left : right;
}

function updateStreamingAssistantMessage(
  messages: AgentPromptMessage[],
  event: TextProviderRuntimeEvent,
): AgentPromptMessage[] {
  if (event.kind !== 'model' || event.eventClass !== 'model.delta') return messages;
  const chunk = streamingDeltaText(event);
  if (!chunk) return messages;
  const next = [...messages];
  const index = findLastAssistantMessageIndex(next);
  const now = new Date().toISOString();
  if (index < 0) {
    return [
      ...next,
      {
        id: randomUUID(),
        role: 'assistant' as const,
        kind: 'note' as const,
        content: chunk,
        model: event.model,
        createdAt: now,
      },
    ].slice(-80);
  }
  const current = next[index];
  next[index] = {
    ...current,
    content: `${current.content ?? ''}${chunk}`,
    model: event.model ?? current.model,
  };
  return next.slice(-80);
}

function findLastAssistantMessageIndex(messages: AgentPromptMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === 'assistant') return index;
  }
  return -1;
}
