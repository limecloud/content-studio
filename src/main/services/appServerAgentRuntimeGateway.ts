import { randomUUID } from 'node:crypto';
import { createAgentRuntimeClientFromSessionGateway } from '@limecloud/agent-runtime-client/sessionGateway';
import type {
  AgentRuntimeClient,
  AgentSessionActionRespondParams,
  AgentSessionActionRespondResponse,
  AgentSessionEventNotification as StandardAgentSessionEventNotification,
  AgentSessionReadParams,
  AgentSessionReadResponse,
  AgentSessionTurnCancelParams,
  AgentSessionTurnCancelResponse,
  AgentSessionTurnStartParams,
  AgentSessionTurnStartResponse,
  AppServerRequestResult as StandardAppServerRequestResult,
  EvidenceExportParams,
  EvidenceExportResponse,
} from '@limecloud/agent-runtime-client';
import {
  APP_SERVER_AGENT_SESSION_METHODS,
} from '../../shared/types';
import type {
  AppServerBusinessObjectRef,
  AppServerJsonRpcMessage,
  AppServerRuntimeEvent,
  PermissionMode,
} from '../../shared/types';
import { buildAgentRuntimeToolPolicy } from './agentRuntimeToolPolicy';

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
    params: AgentSessionActionRespondParams | { sessionId: string; actionId: string; response: Record<string, unknown> },
    options?: AppServerRequestOptions,
  ): Promise<AppServerRequestResult<AppServerActionRespondResponse>> {
    return this.request(APP_SERVER_AGENT_SESSION_METHODS.respondAction, normalizeActionResponseParams(params), options);
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
  const runtimeClient = createContentStudioAgentRuntimeClient(gateway);
  const sessionPrefix = input.sessionIdPrefix?.trim() || 'content_studio_capability';
  const sessionId = `${sessionPrefix}_${randomUUID()}`;
  const turnId = `turn_${randomUUID()}`;
  const toolPolicy = buildAgentRuntimeToolPolicy(input);

  await gateway.startSession({
    sessionId,
    threadId: `thread_${randomUUID()}`,
    appId: 'content-studio',
    workspaceId: input.workspacePath,
    businessObjectRef: input.businessObjectRef,
  }, { timeoutMs });

  const turn = await runtimeClient.startTurn({
    sessionId,
    turnId,
    input: toAgentRuntimeInput(input.input),
    runtimeOptions: {
      stream: true,
      capabilityId: input.capabilityId,
      providerPreference: input.providerPreference,
      modelPreference: input.modelPreference,
      metadata: {
        selectedSkillSlugs: toolPolicy.selectedSkillSlugs,
        permissionMode: toolPolicy.permissionMode,
        toolPolicy,
        ...(input.metadata ?? {}),
      },
    },
    queueIfBusy: true,
    skipPreSubmitResume: true,
  }, { timeoutMs });

  const events = turn.notifications.map(notificationEvent).filter(isRuntimeEvent);
  await drainRuntimeEvents(runtimeClient, events, timeoutMs);
  await runtimeClient.readThread({ sessionId }, { timeoutMs });
  const artifacts = await readArtifacts(gateway, sessionId, turnId, events, timeoutMs);
  const evidence = await exportEvidence(runtimeClient, sessionId, turnId, timeoutMs);
  return {
    sessionId,
    turnId,
    events,
    artifacts,
    evidenceEvents: evidence.events,
    evidenceArtifacts: evidence.artifacts,
  };
}

function createContentStudioAgentRuntimeClient(gateway: ContentStudioAgentRuntimeSessionGateway): AgentRuntimeClient {
  return createAgentRuntimeClientFromSessionGateway({
    startTurn: async (params: AgentSessionTurnStartParams, options) =>
      toStandardRequestResult<AgentSessionTurnStartResponse>(await gateway.startTurn(toGatewayTurnStartParams(params), options)),
    readSession: async (params: AgentSessionReadParams, options) =>
      toStandardRequestResult<AgentSessionReadResponse>(await gateway.readSession(params, options)),
    cancelTurn: async (params: AgentSessionTurnCancelParams, options) =>
      toStandardRequestResult<AgentSessionTurnCancelResponse>(await gateway.cancelTurn(params, options)),
    respondAction: async (params: AgentSessionActionRespondParams, options) =>
      toStandardRequestResult<AgentSessionActionRespondResponse>(await gateway.respondAction(params, options)),
    exportEvidence: async (params: EvidenceExportParams, options) =>
      toStandardRequestResult<EvidenceExportResponse>(await gateway.exportEvidence(params, options)),
    nextEvent: async (timeoutMs?: number) =>
      gateway.nextEvent(timeoutMs) as Promise<StandardAgentSessionEventNotification>,
  });
}

function toStandardRequestResult<T>(result: AppServerRequestResult<unknown>): StandardAppServerRequestResult<T> {
  const response = {
    jsonrpc: '2.0',
    id: 'content-studio-runtime-client',
    result: result.result as T,
  };
  return {
    id: response.id,
    result: response.result,
    response,
    notifications: result.notifications.filter(isJsonRpcNotification),
    messages: [...result.notifications, response],
  } as StandardAppServerRequestResult<T>;
}

function toGatewayTurnStartParams(params: AgentSessionTurnStartParams): Parameters<ContentStudioAgentRuntimeSessionGateway['startTurn']>[0] {
  if (!params.turnId) {
    throw new Error('App Server turnId is required before starting a Content Studio agent turn.');
  }
  return {
    sessionId: params.sessionId,
    turnId: params.turnId,
    input: { ...params.input } as Record<string, unknown>,
    runtimeOptions: { ...(params.runtimeOptions ?? {}) } as Record<string, unknown>,
    queueIfBusy: params.queueIfBusy,
    skipPreSubmitResume: params.skipPreSubmitResume,
  };
}

function toAgentRuntimeInput(input: Record<string, unknown>): AgentSessionTurnStartParams['input'] {
  const text = typeof input.text === 'string' && input.text.trim()
    ? input.text
    : JSON.stringify(input);
  return { ...input, text } as AgentSessionTurnStartParams['input'];
}

function normalizeActionResponseParams(
  params: AgentSessionActionRespondParams | { sessionId: string; actionId: string; response: Record<string, unknown> },
): AgentSessionActionRespondParams {
  if ('requestId' in params) return params;
  return {
    sessionId: params.sessionId,
    requestId: params.actionId,
    actionType: 'ask_user',
    confirmed: true,
    userData: params.response,
    response: textFromRuntimePayload(params.response),
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

function isJsonRpcNotification(message: AppServerJsonRpcMessage): message is AppServerJsonRpcMessage & { method: string } {
  return 'method' in message && !('id' in message);
}

async function drainRuntimeEvents(
  runtimeClient: AgentRuntimeClient,
  events: AppServerRuntimeEvent[],
  timeoutMs: number,
): Promise<void> {
  const expiresAt = Date.now() + timeoutMs;
  for (;;) {
    const terminalEvent = events.find((event) => (
      isCompletedRuntimeEvent(event) ||
      isFailedRuntimeEvent(event) ||
      event.type === 'turn.canceled'
    ));
    if (terminalEvent && isCompletedRuntimeEvent(terminalEvent)) return;
    if (terminalEvent && isFailedRuntimeEvent(terminalEvent)) {
      throw new Error(textFromRuntimePayload(terminalEvent.payload) || 'App Server turn failed');
    }
    if (terminalEvent?.type === 'turn.canceled') {
      throw new Error('App Server turn canceled');
    }

    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) throw new Error(`app-server prompt turn timed out after ${timeoutMs}ms`);
    try {
      const event = notificationEvent(await runtimeClient.nextEvent(Math.min(AGENT_RUNTIME_EVENT_POLL_MS, remainingMs)));
      if (!isRuntimeEvent(event)) {
        throw new Error('App Server notification is not agentSession/event.');
      }
      events.push(event);
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
  runtimeClient: AgentRuntimeClient,
  sessionId: string,
  turnId: string,
  timeoutMs: number,
): Promise<{ events: AppServerRuntimeEvent[]; artifacts: AppServerTurnArtifact[] }> {
  const response = await runtimeClient.exportEvidence({
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

function isCompletedRuntimeEvent(event: AppServerRuntimeEvent): boolean {
  return event.type === 'turn.final_done' || event.type === 'turn.completed';
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
