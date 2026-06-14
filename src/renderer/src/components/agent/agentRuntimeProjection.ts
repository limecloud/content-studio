import {
  agentEventActionKind,
  agentEventStatusLabel,
  agentEventSurface,
  agentEventTargetModule,
  isAgentInputSourceRecoveryEvent as isSharedAgentInputSourceRecoveryEvent,
  projectAgentRuntimeAction as projectSharedAgentRuntimeAction,
  projectAgentRuntimeEvent as projectSharedAgentRuntimeEvent,
  projectAgentRuntimeReadModel as projectSharedAgentRuntimeReadModel,
  type AgentRuntimeActionDecision,
  type AgentRuntimeActionKind,
  type AgentRuntimeActionProjection,
  type AgentRuntimeEventProjection as SharedAgentRuntimeEventProjection,
  type AgentRuntimeReadModel as SharedAgentRuntimeReadModel,
  type AgentRuntimeSurface,
} from '@limecloud/agent-runtime-projection';
import type { AgentPromptExecutionEvent, AgentPromptSession } from '../../../../shared/types';

export {
  agentEventActionKind,
  agentEventStatusLabel,
  agentEventSurface,
  agentEventTargetModule,
  type AgentRuntimeActionDecision,
  type AgentRuntimeActionKind,
  type AgentRuntimeActionProjection,
  type AgentRuntimeSurface,
};

export type AgentRuntimeEventProjection = SharedAgentRuntimeEventProjection<AgentPromptExecutionEvent>;
export type AgentRuntimeReadModel = SharedAgentRuntimeReadModel<AgentPromptExecutionEvent>;

export function agentEventDisplayStatus(event: AgentPromptExecutionEvent): string {
  if (event.eventClass === 'action.required') return '需要处理';
  if (event.eventClass === 'action.resolved' || event.eventClass === 'action.denied' || event.eventClass === 'action.cancelled' || event.eventClass === 'action.canceled') return '已处理';
  if (event.status === 'completed') return '已完成';
  if (event.status === 'running') return '执行中';
  if (event.status === 'blocked') return '已阻断';
  if (event.status === 'failed') return '失败';
  if (event.status === 'canceled') return '已取消';
  return '待处理';
}

export function projectAgentRuntimeAction(event: AgentPromptExecutionEvent): AgentRuntimeActionProjection {
  return projectSharedAgentRuntimeAction(event);
}

export function projectAgentRuntimeEvent(event: AgentPromptExecutionEvent): AgentRuntimeEventProjection {
  return projectSharedAgentRuntimeEvent(event);
}

export function projectAgentRuntimeReadModel(session?: AgentPromptSession): AgentRuntimeReadModel {
  const readModel = projectSharedAgentRuntimeReadModel({
    executionEvents: session?.executionEvents ?? [],
    sourceCount: session?.sourceSnapshots.length ?? session?.inputSourceIds.length ?? 0,
  });
  const events = dedupeRuntimeEvents(readModel.events);
  const visibleEventIds = new Set(readModel.visibleEvents.map((event) => event.id));
  return {
    ...readModel,
    events,
    visibleEvents: events
      .filter((event) => isVisibleRuntimeFact(event) && (visibleEventIds.has(event.id) || event.surface === 'tool'))
      .slice(-12),
  };
}

function payloadText(event: AgentRuntimeEventProjection, key: string): string {
  const value = event.source.payload?.[key];
  return typeof value === 'string' ? value : '';
}

function dedupeRuntimeEvents(events: AgentRuntimeEventProjection[]): AgentRuntimeEventProjection[] {
  const seen = new Set<string>();
  return events.filter((event) => {
    const key = [
      event.source.turnId,
      event.source.eventClass,
      event.source.toolCallId,
      event.actionId,
      payloadText(event, 'eventId'),
      payloadText(event, 'toolName'),
      event.source.artifactRefs?.join(','),
      event.source.evidenceRefs?.join(','),
      event.detail,
    ].filter(Boolean).join(':');
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isVisibleRuntimeFact(event: AgentRuntimeEventProjection): boolean {
  const eventClass = event.source.eventClass;
  if (!eventClass) return true;
  return ![
    'model.delta',
    'model.requested',
    'run.status',
    'snapshot.updated',
    'turn.submitted',
  ].includes(eventClass);
}

export function isAgentInputSourceRecoveryEvent(event: AgentPromptExecutionEvent): boolean {
  return isSharedAgentInputSourceRecoveryEvent(event);
}

export function isAgentInputSourceRecoverySession(session: AgentPromptSession): boolean {
  return Boolean(session.executionEvents?.some(isAgentInputSourceRecoveryEvent));
}
