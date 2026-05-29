import type { AgentPromptExecutionEvent, AgentPromptSession } from '../../../../shared/types';

export type AgentRuntimeActionKind = 'add-input-source' | 'configure-text-model' | string;
export type AgentRuntimeActionDecision = 'open-input-source' | 'open-model-settings' | 'acknowledge';
export type AgentRuntimeSurface =
  | 'runtime-status'
  | 'human-action'
  | 'tool'
  | 'permission'
  | 'artifact'
  | 'evidence'
  | 'context'
  | 'message';

export interface AgentRuntimeActionProjection {
  actionKind: AgentRuntimeActionKind;
  targetModule: string;
  buttonLabel: string;
  decision: AgentRuntimeActionDecision;
}

export interface AgentRuntimeEventProjection {
  id: string;
  source: AgentPromptExecutionEvent;
  surface: AgentRuntimeSurface;
  title: string;
  detail?: string;
  status: AgentPromptExecutionEvent['status'];
  displayStatus: string;
  action?: AgentRuntimeActionProjection;
  actionId?: string;
  resolved: boolean;
  actionKind: string;
  targetModule: string;
}

export interface AgentRuntimeReadModel {
  events: AgentRuntimeEventProjection[];
  visibleEvents: AgentRuntimeEventProjection[];
  pendingActions: AgentRuntimeEventProjection[];
  inputSourceRecovery: boolean;
  sourceCount: number;
  artifactRefs: string[];
  evidenceRefs: string[];
  taskRefs: string[];
}

interface AgentRuntimeProjectionContext {
  resolvedActionIds: Set<string>;
  resolvedEventIds: Set<string>;
}

export function agentEventStatusLabel(status: AgentPromptExecutionEvent['status']): string {
  if (status === 'completed') return '完成';
  if (status === 'running') return '执行中';
  if (status === 'blocked') return '待配置';
  if (status === 'failed') return '失败';
  return '等待';
}

export function agentEventDisplayStatus(event: AgentPromptExecutionEvent): string {
  if (event.eventClass === 'action.required') return '待处理';
  if (event.eventClass === 'action.resolved') return '已处理';
  return agentEventStatusLabel(event.status);
}

export function agentEventActionKind(event: AgentPromptExecutionEvent): string {
  return typeof event.payload?.actionKind === 'string' ? event.payload.actionKind : '';
}

export function agentEventTargetModule(event: AgentPromptExecutionEvent): string {
  return typeof event.payload?.targetModule === 'string' ? event.payload.targetModule : '';
}

export function projectAgentRuntimeAction(event: AgentPromptExecutionEvent): AgentRuntimeActionProjection {
  const actionKind = agentEventActionKind(event);
  const targetModule = agentEventTargetModule(event);
  if (actionKind === 'configure-text-model') {
    return {
      actionKind,
      targetModule,
      buttonLabel: '打开模型设置',
      decision: 'open-model-settings',
    };
  }
  if (actionKind === 'add-input-source' || targetModule === 'knowledge-inputs') {
    return {
      actionKind: actionKind || 'add-input-source',
      targetModule,
      buttonLabel: '补输入源',
      decision: 'open-input-source',
    };
  }
  return {
    actionKind,
    targetModule,
    buttonLabel: '处理',
    decision: 'acknowledge',
  };
}

function resolvedFromEventId(event: AgentPromptExecutionEvent): string {
  return typeof event.payload?.resolvedFromEventId === 'string' ? event.payload.resolvedFromEventId : '';
}

function buildProjectionContext(events: AgentPromptExecutionEvent[]): AgentRuntimeProjectionContext {
  const resolvedActionIds = new Set<string>();
  const resolvedEventIds = new Set<string>();
  events.forEach((event) => {
    if (event.eventClass !== 'action.resolved') return;
    if (event.actionId) resolvedActionIds.add(event.actionId);
    const sourceEventId = resolvedFromEventId(event);
    if (sourceEventId) resolvedEventIds.add(sourceEventId);
  });
  return { resolvedActionIds, resolvedEventIds };
}

export function agentEventSurface(event: AgentPromptExecutionEvent): AgentRuntimeSurface {
  if (event.eventClass === 'action.required') return 'human-action';
  if (event.kind === 'action') return 'human-action';
  if (event.kind === 'permission' || event.kind === 'sandbox' || event.eventClass?.startsWith('permission.') || event.eventClass?.startsWith('sandbox.')) return 'permission';
  if (event.kind === 'draft' || event.eventClass === 'artifact.changed') return 'artifact';
  if (event.kind === 'evidence' || event.eventClass === 'evidence.changed') return 'evidence';
  if (event.kind === 'state' || event.eventClass === 'snapshot.updated') return 'runtime-status';
  if (event.kind === 'context' || event.kind === 'source' || event.eventClass === 'context.resolved') return 'context';
  if (event.kind === 'skill' || event.kind === 'tool' || event.eventClass?.startsWith('tool.') || event.phase === 'tool_running') return 'tool';
  if (event.kind === 'model') return 'runtime-status';
  return 'message';
}

function isVisibleAgentRuntimeEvent(event: AgentRuntimeEventProjection): boolean {
  const eventClass = event.source.eventClass ?? '';
  if (event.action) return true;
  if (event.resolved) return true;
  if (event.source.status === 'blocked' || event.source.status === 'failed') return true;
  if (event.surface === 'artifact' || event.surface === 'evidence') return true;
  if (eventClass === 'action.resolved') return true;
  if (eventClass === 'model.completed' || eventClass === 'model.failed') return true;
  if (eventClass === 'tool.catalog.resolved' && Number(event.source.payload?.skillCount ?? 0) > 0) return true;
  return false;
}

export function projectAgentRuntimeEvent(
  event: AgentPromptExecutionEvent,
  context: AgentRuntimeProjectionContext = { resolvedActionIds: new Set(), resolvedEventIds: new Set() },
): AgentRuntimeEventProjection {
  const resolved = event.eventClass === 'action.required' && (
    (event.actionId ? context.resolvedActionIds.has(event.actionId) : false) ||
    context.resolvedEventIds.has(event.id)
  );
  const action = event.eventClass === 'action.required' && !resolved ? projectAgentRuntimeAction(event) : undefined;
  return {
    id: event.id,
    source: event,
    surface: agentEventSurface(event),
    title: event.title,
    detail: event.detail,
    status: event.status,
    displayStatus: resolved ? '已处理' : agentEventDisplayStatus(event),
    action,
    actionId: event.actionId,
    resolved,
    actionKind: agentEventActionKind(event),
    targetModule: agentEventTargetModule(event),
  };
}

export function projectAgentRuntimeReadModel(session?: AgentPromptSession): AgentRuntimeReadModel {
  const sourceEvents = session?.executionEvents ?? [];
  const context = buildProjectionContext(sourceEvents);
  const events = sourceEvents.map((event) => projectAgentRuntimeEvent(event, context));
  const artifactRefs = new Set<string>();
  const evidenceRefs = new Set<string>();
  const taskRefs = new Set<string>();
  sourceEvents.forEach((event) => {
    event.artifactRefs?.forEach((ref) => artifactRefs.add(ref));
    event.evidenceRefs?.forEach((ref) => evidenceRefs.add(ref));
    if (event.taskId) taskRefs.add(event.taskId);
  });
  return {
    events,
    visibleEvents: events.filter(isVisibleAgentRuntimeEvent).slice(-8),
    pendingActions: events.filter((event) => Boolean(event.action)),
    inputSourceRecovery: events.some((event) => isAgentInputSourceRecoveryEvent(event.source)),
    sourceCount: session?.sourceSnapshots.length ?? session?.inputSourceIds.length ?? 0,
    artifactRefs: Array.from(artifactRefs),
    evidenceRefs: Array.from(evidenceRefs),
    taskRefs: Array.from(taskRefs),
  };
}

export function isAgentInputSourceRecoveryEvent(event: AgentPromptExecutionEvent): boolean {
  return (
    (event.eventClass === 'action.required' || event.eventClass === 'action.resolved') &&
    (agentEventActionKind(event) === 'add-input-source' || agentEventTargetModule(event) === 'knowledge-inputs')
  );
}

export function isAgentInputSourceRecoverySession(session: AgentPromptSession): boolean {
  return Boolean(session.executionEvents?.some(isAgentInputSourceRecoveryEvent));
}
