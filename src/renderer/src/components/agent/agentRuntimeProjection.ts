import {
  agentEventActionKind,
  agentEventDisplayStatus,
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
  agentEventDisplayStatus,
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
      .filter((event) => visibleEventIds.has(event.id) || event.surface === 'tool')
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

export function isAgentInputSourceRecoveryEvent(event: AgentPromptExecutionEvent): boolean {
  return isSharedAgentInputSourceRecoveryEvent(event);
}

export function isAgentInputSourceRecoverySession(session: AgentPromptSession): boolean {
  return Boolean(session.executionEvents?.some(isAgentInputSourceRecoveryEvent));
}
