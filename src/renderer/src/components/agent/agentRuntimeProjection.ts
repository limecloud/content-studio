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
  return projectSharedAgentRuntimeReadModel({
    executionEvents: session?.executionEvents ?? [],
    sourceCount: session?.sourceSnapshots.length ?? session?.inputSourceIds.length ?? 0,
  });
}

export function isAgentInputSourceRecoveryEvent(event: AgentPromptExecutionEvent): boolean {
  return isSharedAgentInputSourceRecoveryEvent(event);
}

export function isAgentInputSourceRecoverySession(session: AgentPromptSession): boolean {
  return Boolean(session.executionEvents?.some(isAgentInputSourceRecoveryEvent));
}
