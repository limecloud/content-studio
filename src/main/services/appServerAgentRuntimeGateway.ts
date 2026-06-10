import { randomUUID } from 'node:crypto';
import {
  APP_SERVER_AGENT_SESSION_METHODS,
} from '../../shared/types';
import type {
  AppServerBusinessObjectRef,
  AppServerJsonRpcMessage,
  AppServerRuntimeEvent,
  PermissionMode,
} from '../../shared/types';

const AGENT_RUNTIME_EVENT_POLL_MS = 1000;

export interface AppServerRequestOptions {
  timeoutMs?: number;
}

export interface AppServerRequestResult<T> {
  result: T;
  notifications: AppServerJsonRpcMessage[];
}

export interface AppServerAgentSessionEventNotification extends AppServerJsonRpcMessage {
  method: typeof APP_SERVER_AGENT_SESSION_METHODS.events;
  params: {
    event: AppServerRuntimeEvent;
    [key: string]: unknown;
  };
}

export interface AppServerAgentRuntimeTransport {
  request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<AppServerRequestResult<T>>;
  nextMessage(timeoutMs?: number): Promise<AppServerJsonRpcMessage>;
}

export interface AppServerSessionStartResponse {
  session: {
    sessionId: string;
    threadId: string;
    appId: string;
    workspaceId?: string;
    status: string;
  };
}

export interface AppServerTurnStartResponse {
  turn: {
    turnId: string;
    sessionId: string;
    status: string;
  };
}

export interface AppServerSessionReadResponse {
  session?: AppServerSessionStartResponse['session'];
  events?: AppServerRuntimeEvent[];
}

export interface AppServerTurnCancelResponse {
  ok?: boolean;
  turn?: AppServerTurnStartResponse['turn'];
}

export interface AppServerActionRespondResponse {
  ok?: boolean;
  event?: AppServerRuntimeEvent;
}

export interface AppServerArtifactReadResponse {
  artifacts: AppServerTurnArtifact[];
}

export interface AppServerEvidenceExportResponse {
  events: AppServerRuntimeEvent[];
  artifacts: AppServerTurnArtifact[];
}

export interface AppServerTurnArtifact {
  artifactRef?: string;
  artifactId?: string;
  title?: string;
  kind?: string;
  path?: string;
  content?: string;
  payload?: unknown;
}

export interface AppServerAgentRuntimeTurnInput {
  workspacePath: string;
  capabilityId: string;
  input: Record<string, unknown>;
  permissionMode?: PermissionMode;
  selectedSkillSlugs?: string[];
  metadata?: Record<string, unknown>;
  businessObjectRef?: AppServerBusinessObjectRef;
  providerPreference?: string;
  modelPreference?: string;
  sessionIdPrefix?: string;
}

export interface AppServerAgentRuntimeTurnResult {
  sessionId: string;
  turnId: string;
  events: AppServerRuntimeEvent[];
  artifacts: AppServerTurnArtifact[];
  evidenceEvents: AppServerRuntimeEvent[];
  evidenceArtifacts: AppServerTurnArtifact[];
}

export class ContentStudioAgentRuntimeSessionGateway {
  constructor(
    private readonly transport: AppServerAgentRuntimeTransport,
    private readonly defaultTimeoutMs: number,
  ) {}

  startSession(
    params: {
      sessionId: string;
      threadId: string;
      appId: string;
      workspaceId: string;
      businessObjectRef?: AppServerBusinessObjectRef;
    },
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AppServerSessionStartResponse>> {
    return this.request(APP_SERVER_AGENT_SESSION_METHODS.startSession, params, options);
  }

  startTurn(
    params: {
      sessionId: string;
      turnId: string;
      input: Record<string, unknown>;
      runtimeOptions: Record<string, unknown>;
      queueIfBusy?: boolean;
      skipPreSubmitResume?: boolean;
    },
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AppServerTurnStartResponse>> {
    return this.request(APP_SERVER_AGENT_SESSION_METHODS.startTurn, params, options);
  }

  readSession(
    params: { sessionId: string },
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AppServerSessionReadResponse>> {
    return this.request(APP_SERVER_AGENT_SESSION_METHODS.readSession, params, options);
  }

  cancelTurn(
    params: { sessionId: string; turnId: string },
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AppServerTurnCancelResponse>> {
    return this.request(APP_SERVER_AGENT_SESSION_METHODS.cancelTurn, params, options);
  }

  respondAction(
    params: { sessionId: string; actionId: string; response: Record<string, unknown> },
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AppServerActionRespondResponse>> {
    return this.request(APP_SERVER_AGENT_SESSION_METHODS.respondAction, params, options);
  }

  exportEvidence(
    params: { sessionId: string; turnId?: string; includeEvents?: boolean; includeArtifacts?: boolean },
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AppServerEvidenceExportResponse>> {
    return this.request(APP_SERVER_AGENT_SESSION_METHODS.exportEvidence, params, options);
  }

  readArtifact(
    params: { sessionId: string; turnId: string },
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AppServerArtifactReadResponse>> {
    return this.request(APP_SERVER_AGENT_SESSION_METHODS.readArtifact, params, options);
  }

  async nextEvent(timeoutMs?: number): Promise<AppServerAgentSessionEventNotification> {
    const message = await this.transport.nextMessage(timeoutMs ?? this.defaultTimeoutMs);
    if (!isAgentSessionEventNotification(message)) {
      throw new Error('App Server notification is not agentSession/event.');
    }
    return message;
  }

  async nextRuntimeEvent(timeoutMs?: number): Promise<AppServerRuntimeEvent> {
    const event = notificationEvent(await this.nextEvent(timeoutMs));
    if (!isRuntimeEvent(event)) {
      throw new Error('App Server notification is not agentSession/event.');
    }
    return event;
  }

  private request<T>(
    method: string,
    params: unknown,
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<T>> {
    return this.transport.request<T>(method, params, options?.timeoutMs ?? this.defaultTimeoutMs);
  }
}

export async function runContentStudioAgentRuntimeTurn(
  gateway: ContentStudioAgentRuntimeSessionGateway,
  input: AppServerAgentRuntimeTurnInput,
  timeoutMs: number,
): Promise<AppServerAgentRuntimeTurnResult> {
  const sessionPrefix = input.sessionIdPrefix?.trim() || 'content_studio_capability';
  const sessionId = `${sessionPrefix}_${randomUUID()}`;
  const turnId = `turn_${randomUUID()}`;

  await gateway.startSession({
    sessionId,
    threadId: `thread_${randomUUID()}`,
    appId: 'content-studio',
    workspaceId: input.workspacePath,
    businessObjectRef: input.businessObjectRef,
  }, { timeoutMs });

  const turn = await gateway.startTurn({
    sessionId,
    turnId,
    input: input.input,
    runtimeOptions: {
      stream: true,
      capabilityId: input.capabilityId,
      providerPreference: input.providerPreference,
      modelPreference: input.modelPreference,
      metadata: {
        selectedSkillSlugs: input.selectedSkillSlugs ?? [],
        permissionMode: input.permissionMode ?? 'ask',
        ...(input.metadata ?? {}),
      },
    },
    queueIfBusy: true,
    skipPreSubmitResume: true,
  }, { timeoutMs });

  const events = turn.notifications.map(notificationEvent).filter(isRuntimeEvent);
  await drainRuntimeEvents(gateway, events, timeoutMs);
  const artifacts = await readArtifacts(gateway, sessionId, turnId, events, timeoutMs);
  const evidence = await exportEvidence(gateway, sessionId, turnId, timeoutMs);
  return {
    sessionId,
    turnId,
    events,
    artifacts,
    evidenceEvents: evidence.events,
    evidenceArtifacts: evidence.artifacts,
  };
}

function notificationEvent(message: AppServerJsonRpcMessage): unknown {
  const params = message.params;
  return params && typeof params === 'object' ? (params as { event?: unknown }).event : undefined;
}

function isRuntimeEvent(value: unknown): value is AppServerRuntimeEvent {
  return Boolean(value && typeof value === 'object' && typeof (value as AppServerRuntimeEvent).type === 'string');
}

function isAgentSessionEventNotification(message: AppServerJsonRpcMessage): message is AppServerAgentSessionEventNotification {
  return (
    message.method === APP_SERVER_AGENT_SESSION_METHODS.events &&
    isRuntimeEvent(notificationEvent(message))
  );
}

async function drainRuntimeEvents(
  gateway: ContentStudioAgentRuntimeSessionGateway,
  events: AppServerRuntimeEvent[],
  timeoutMs: number,
): Promise<void> {
  const expiresAt = Date.now() + timeoutMs;
  for (;;) {
    const terminalEvent = events.find((event) => (
      event.type === 'turn.completed' ||
      isFailedRuntimeEvent(event) ||
      event.type === 'turn.canceled'
    ));
    if (terminalEvent?.type === 'turn.completed') return;
    if (terminalEvent && isFailedRuntimeEvent(terminalEvent)) {
      throw new Error(textFromRuntimePayload(terminalEvent.payload) || 'App Server turn failed');
    }
    if (terminalEvent?.type === 'turn.canceled') {
      throw new Error('App Server turn canceled');
    }

    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) throw new Error(`app-server prompt turn timed out after ${timeoutMs}ms`);
    try {
      events.push(await gateway.nextRuntimeEvent(Math.min(AGENT_RUNTIME_EVENT_POLL_MS, remainingMs)));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timed out/.test(message)) continue;
      throw error;
    }
  }
}

async function readArtifacts(
  gateway: ContentStudioAgentRuntimeSessionGateway,
  sessionId: string,
  turnId: string,
  events: AppServerRuntimeEvent[],
  timeoutMs: number,
): Promise<AppServerTurnArtifact[]> {
  const snapshots = events
    .filter((event) => event.type === 'artifact.snapshot')
    .map((event) => normalizeArtifact(event.payload))
    .filter((artifact): artifact is AppServerTurnArtifact => Boolean(artifact));
  const response = await gateway.readArtifact({ sessionId, turnId }, { timeoutMs });
  return uniqueArtifacts([
    ...snapshots,
    ...response.result.artifacts.map((artifact) => normalizeArtifact(artifact)).filter((artifact): artifact is AppServerTurnArtifact => Boolean(artifact)),
  ]);
}

async function exportEvidence(
  gateway: ContentStudioAgentRuntimeSessionGateway,
  sessionId: string,
  turnId: string,
  timeoutMs: number,
): Promise<{ events: AppServerRuntimeEvent[]; artifacts: AppServerTurnArtifact[] }> {
  const response = await gateway.exportEvidence({
    sessionId,
    turnId,
    includeEvents: true,
    includeArtifacts: true,
  }, { timeoutMs });
  return {
    events: response.result.events,
    artifacts: uniqueArtifacts(response.result.artifacts
      .map((artifact) => normalizeArtifact(artifact))
      .filter((artifact): artifact is AppServerTurnArtifact => Boolean(artifact))),
  };
}

function normalizeArtifact(value: unknown): AppServerTurnArtifact | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const artifactRef = stringValue(record.artifactRef) ?? stringValue(record.ref) ?? stringValue(record.artifactId);
  const artifactId = stringValue(record.artifactId) ?? stringValue(record.id);
  const title = stringValue(record.title);
  const kind = stringValue(record.kind);
  const path = stringValue(record.path);
  const content = stringValue(record.content) ?? stringValue(record.markdown) ?? stringValue(record.text);
  if (!artifactRef && !artifactId && !title && !path && !content) return null;
  return {
    artifactRef,
    artifactId,
    title,
    kind,
    path,
    content,
    payload: value,
  };
}

function uniqueArtifacts(artifacts: AppServerTurnArtifact[]): AppServerTurnArtifact[] {
  const seen = new Set<string>();
  return artifacts.filter((artifact) => {
    const key = artifact.artifactRef ?? artifact.artifactId ?? artifact.path ?? artifact.title ?? '';
    if (!key) return true;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function isFailedRuntimeEvent(event: AppServerRuntimeEvent): boolean {
  return event.type === 'turn.failed' || event.type.endsWith('.failed');
}

function textFromRuntimePayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  return [record.text, record.summary, record.message]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
