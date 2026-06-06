import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AgentEvent,
  AppServerBusinessObjectRef,
  AppServerHealthCheckResult,
  AppServerJsonRpcMessage,
  AppServerRuntimeEvent,
  AppServerSmokeResult,
  PermissionMode,
  RunTaskInput,
} from '../../shared/types';

const APP_SERVER_PROTOCOL_VERSION = 'appserver.v0';
const DEFAULT_RPC_TIMEOUT_MS = 5000;
const DEFAULT_AGENT_TIMEOUT_MS = 120_000;
const AGENT_NOTIFICATION_POLL_MS = 1000;
const DEFAULT_AGENT_RUNTIME_CAPABILITY_ID = 'content.draft.generate';

type AgentEventSink = (event: AgentEvent) => void;

interface AppServerRequestResult<T> {
  result: T;
  notifications: AppServerJsonRpcMessage[];
}

interface AppServerSessionStartResponse {
  session: {
    sessionId: string;
    threadId: string;
    appId: string;
    workspaceId?: string;
    status: string;
  };
}

interface AppServerTurnStartResponse {
  turn: {
    turnId: string;
    sessionId: string;
    status: string;
  };
}

interface AppServerCapabilityListResponse {
  capabilities: Array<{ id: string; title: string; methods: string[] }>;
}

interface AppServerArtifactReadResponse {
  artifacts: Array<{ artifactRef: string; title?: string; kind?: string; path?: string }>;
}

interface AppServerEvidenceExportResponse {
  events: AppServerRuntimeEvent[];
  artifacts: Array<{ artifactRef: string; title?: string; kind?: string; path?: string }>;
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

export interface AppServerPromptTurnInput {
  workspacePath: string;
  prompt: string;
  permissionMode?: PermissionMode;
  selectedSkillSlugs?: string[];
  metadata?: Record<string, unknown>;
  capabilityId?: string;
  businessObjectRef?: AppServerBusinessObjectRef;
  timeoutMs?: number;
  backendEnv?: NodeJS.ProcessEnv;
}

export interface AppServerPromptTurnResult {
  sessionId: string;
  turnId: string;
  events: AppServerRuntimeEvent[];
  artifacts: AppServerTurnArtifact[];
  evidenceEvents: AppServerRuntimeEvent[];
  evidenceArtifacts: AppServerTurnArtifact[];
}

interface RunningAgentTask {
  sidecar?: AppServerJsonRpcClient;
  sessionId?: string;
  turnId?: string;
  tempDir?: string;
  closed: boolean;
  completed: boolean;
  failed: boolean;
}

class AppServerJsonRpcClient {
  private nextId = 1;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: ReadlineInterface;
  private readonly buffered: AppServerJsonRpcMessage[] = [];
  private exited = false;
  private pendingRead?: {
    resolve: (message: AppServerJsonRpcMessage) => void;
    reject: (error: Error) => void;
    timer: NodeJS.Timeout;
  };

  constructor(binaryPath: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
    this.child = spawn(binaryPath, args, {
      stdio: 'pipe',
      env,
    });
    this.lines = createInterface({ input: this.child.stdout });
    this.lines.on('line', (line) => this.acceptLine(line));
    this.child.stdin.on('error', (error) => {
      this.exited = true;
      this.rejectPending(error);
    });
    this.child.once('error', (error) => this.rejectPending(error));
    this.child.once('exit', (code, signal) => {
      this.exited = true;
      this.rejectPending(new Error(`app-server exited before response: code=${code ?? 'null'} signal=${signal ?? 'null'}`));
    });
  }

  canWrite(): boolean {
    return !this.exited && !this.child.stdin.destroyed && this.child.exitCode === null;
  }

  send(method: string, params?: unknown): AppServerJsonRpcMessage {
    const request = { id: this.nextId++, method, params };
    this.writeLine(`${JSON.stringify(request)}\n`);
    return request;
  }

  notify(method: string, params?: unknown): void {
    this.writeLine(`${JSON.stringify({ method, params: params ?? {} })}\n`);
  }

  async request<T>(method: string, params?: unknown, timeoutMs = DEFAULT_RPC_TIMEOUT_MS): Promise<AppServerRequestResult<T>> {
    const request = this.send(method, params);
    const notifications: AppServerJsonRpcMessage[] = [];
    for (;;) {
      const message = await this.nextMessage(timeoutMs);
      if ('method' in message && !('id' in message)) {
        notifications.push(message);
        continue;
      }
      if ('id' in message && message.id === request.id && 'error' in message) {
        throw new Error(message.error?.message || `${method} failed`);
      }
      if ('id' in message && message.id === request.id && 'result' in message) {
        return { result: message.result as T, notifications };
      }
      this.buffered.push(message);
    }
  }

  async nextMessage(timeoutMs = DEFAULT_RPC_TIMEOUT_MS): Promise<AppServerJsonRpcMessage> {
    const buffered = this.buffered.shift();
    if (buffered) return buffered;
    if (this.pendingRead) throw new Error('app-server sidecar already has a pending read');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRead = undefined;
        reject(new Error(`app-server sidecar timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      this.pendingRead = { resolve, reject, timer };
    });
  }

  close(): void {
    this.exited = true;
    this.lines.close();
    this.child.kill();
  }

  private writeLine(line: string): void {
    if (!this.canWrite()) {
      throw new Error('app-server sidecar is not writable');
    }
    this.child.stdin.write(line);
  }

  private acceptLine(line: string): void {
    if (!line.trim()) return;
    const message = JSON.parse(line) as AppServerJsonRpcMessage;
    if (this.pendingRead) {
      const pending = this.pendingRead;
      this.pendingRead = undefined;
      clearTimeout(pending.timer);
      pending.resolve(message);
      return;
    }
    this.buffered.push(message);
  }

  private rejectPending(error: Error): void {
    if (!this.pendingRead) return;
    const pending = this.pendingRead;
    this.pendingRead = undefined;
    clearTimeout(pending.timer);
    pending.reject(error);
  }
}

export class AppServerSidecarService {
  private readonly runningTasks = new Map<string, RunningAgentTask>();

  async healthCheck(): Promise<AppServerHealthCheckResult> {
    const binaryPath = this.resolveBinaryPath();
    if (!binaryPath) {
      return {
        available: false,
        protocolVersion: APP_SERVER_PROTOCOL_VERSION,
        source: 'missing',
        message: missingAppServerMessage(),
      };
    }
    return {
      available: true,
      protocolVersion: APP_SERVER_PROTOCOL_VERSION,
      binaryPath,
      source: this.binarySource(binaryPath),
      message: 'app-server sidecar 已可启动。',
    };
  }

  async runSmoke(): Promise<AppServerSmokeResult> {
    const binaryPath = this.resolveBinaryPath();
    if (!binaryPath) {
      return {
        ok: false,
        protocolVersion: APP_SERVER_PROTOCOL_VERSION,
        source: 'missing',
        error: missingAppServerMessage(),
      };
    }

    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-'));
    const backendPath = join(tempDir, 'query-loop-backend.mjs');
    const policyPath = join(tempDir, 'content-studio.policy.json');
    let sidecar: AppServerJsonRpcClient | undefined;
    try {
      await mkdir(tempDir, { recursive: true });
      await writeBackend(backendPath);
      await writePolicy(policyPath);

      sidecar = new AppServerJsonRpcClient(binaryPath, [
        '--stdio',
        '--backend',
        'external',
        '--backend-command',
        process.execPath,
        '--backend-arg',
        backendPath,
        '--backend-timeout-ms',
        String(DEFAULT_RPC_TIMEOUT_MS),
        '--app-policy',
        policyPath,
      ], appServerSidecarEnv());

      const initialize = await sidecar.request<{ serverInfo?: { protocolVersion?: string } }>('initialize', {
        clientInfo: appServerClientInfo(),
        capabilities: appServerClientCapabilities(),
      });
      const protocolVersion = initialize.result.serverInfo?.protocolVersion ?? APP_SERVER_PROTOCOL_VERSION;
      sidecar.notify('initialized');

      const capabilities = await sidecar.request<AppServerCapabilityListResponse>('capability/list', {
        appId: 'content-studio',
        workspaceId: 'content-studio-smoke',
      });
      const capabilityIds = capabilities.result.capabilities.map((capability) => capability.id);
      const sessionId = `content_studio_${randomUUID()}`;
      const turnId = `turn_${randomUUID()}`;
      await sidecar.request<AppServerSessionStartResponse>('agentSession/start', {
        sessionId,
        threadId: `thread_${randomUUID()}`,
        appId: 'content-studio',
        workspaceId: 'content-studio-smoke',
        businessObjectRef: {
          kind: 'smoke',
          id: 'content-studio-smoke',
          title: 'Content Studio App Server smoke',
        },
      });
      const turn = await sidecar.request<AppServerTurnStartResponse>('agentSession/turn/start', {
        sessionId,
        turnId,
        input: {
          text: 'content-studio app-server smoke',
        },
        runtimeOptions: {
          stream: true,
          capabilityId: 'content.draft.generate',
        },
      });

      const events = [...turn.notifications]
        .map(notificationEvent)
        .filter(isRuntimeEvent);
      while (!events.some((event) => event.type === 'message.delta') || !events.some((event) => event.type === 'artifact.snapshot')) {
        const notification = await sidecar.nextMessage(DEFAULT_RPC_TIMEOUT_MS);
        const event = notificationEvent(notification);
        if (isRuntimeEvent(event)) events.push(event);
      }

      const artifacts = await sidecar.request<AppServerArtifactReadResponse>('artifact/read', {
        sessionId,
        turnId,
      });
      const evidence = await sidecar.request<AppServerEvidenceExportResponse>('evidence/export', {
        sessionId,
        turnId,
        includeEvents: true,
        includeArtifacts: true,
      });

      return {
        ok: true,
        protocolVersion,
        source: this.binarySource(binaryPath),
        binaryPath,
        capabilityIds,
        eventTypes: events.map((event) => event.type),
        artifactRefs: artifacts.result.artifacts.map((artifact) => artifact.artifactRef),
        evidenceEventCount: evidence.result.events.length,
        evidenceArtifactCount: evidence.result.artifacts.length,
      };
    } catch (error) {
      return {
        ok: false,
        protocolVersion: APP_SERVER_PROTOCOL_VERSION,
        source: this.binarySource(binaryPath),
        binaryPath,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      sidecar?.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async runAgent(input: RunTaskInput, sink: AgentEventSink): Promise<string> {
    const taskId = randomUUID();
    const task: RunningAgentTask = { closed: false, completed: false, failed: false };
    this.runningTasks.set(taskId, task);
    void this.executeAgent(taskId, task, input, sink);
    return taskId;
  }

  async runPromptTurn(input: AppServerPromptTurnInput): Promise<AppServerPromptTurnResult> {
    const binaryPath = this.resolveBinaryPath();
    if (!binaryPath) {
      throw new Error(missingAppServerMessage());
    }
    const backend = this.resolveAgentBackend();
    if (!backend) {
      throw new Error('未配置 App Server external backend。设置 CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND，或随包携带 resources/app-server/backend/content-backend.mjs。');
    }

    const timeoutMs = input.timeoutMs ?? resolveAgentTimeoutMs();
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-prompt-'));
    const policyPath = join(tempDir, 'content-studio.policy.json');
    let sidecar: AppServerJsonRpcClient | undefined;
    try {
      await writePolicy(policyPath);
      sidecar = this.createSidecar(binaryPath, policyPath, backend, timeoutMs, input.backendEnv);
      const initialize = await sidecar.request<{ serverInfo?: { protocolVersion?: string } }>('initialize', {
        clientInfo: appServerClientInfo(),
        capabilities: appServerClientCapabilities(),
      });
      const protocolVersion = initialize.result.serverInfo?.protocolVersion ?? APP_SERVER_PROTOCOL_VERSION;
      if (protocolVersion !== APP_SERVER_PROTOCOL_VERSION) {
        throw new Error(`unsupported app-server protocol: ${protocolVersion}`);
      }
      sidecar.notify('initialized');

      const sessionId = `content_studio_prompt_${randomUUID()}`;
      const turnId = `turn_${randomUUID()}`;
      await sidecar.request<AppServerSessionStartResponse>('agentSession/start', {
        sessionId,
        threadId: `thread_${randomUUID()}`,
        appId: 'content-studio',
        workspaceId: input.workspacePath,
        businessObjectRef: input.businessObjectRef,
      });
      const turn = await sidecar.request<AppServerTurnStartResponse>('agentSession/turn/start', {
        sessionId,
        turnId,
        input: {
          text: input.prompt,
        },
        runtimeOptions: {
          stream: true,
          capabilityId: input.capabilityId ?? DEFAULT_AGENT_RUNTIME_CAPABILITY_ID,
          metadata: {
            selectedSkillSlugs: input.selectedSkillSlugs ?? [],
            permissionMode: input.permissionMode ?? 'ask',
            ...(input.metadata ?? {}),
          },
        },
        queueIfBusy: true,
        skipPreSubmitResume: true,
      }, timeoutMs);

      const events = turn.notifications.map(notificationEvent).filter(isRuntimeEvent);
      await drainRuntimeEvents(sidecar, events, timeoutMs);
      const artifacts = await readArtifacts(sidecar, sessionId, turnId, events);
      const evidence = await exportEvidence(sidecar, sessionId, turnId);
      return {
        sessionId,
        turnId,
        events,
        artifacts,
        evidenceEvents: evidence.events,
        evidenceArtifacts: evidence.artifacts,
      };
    } finally {
      sidecar?.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  cancelAgent(taskId: string): boolean {
    const task = this.runningTasks.get(taskId);
    if (!task) return false;
    task.closed = true;
    if (task.sidecar?.canWrite() && task.sessionId && task.turnId) {
      void task.sidecar.request('agentSession/turn/cancel', {
        sessionId: task.sessionId,
        turnId: task.turnId,
      }, DEFAULT_RPC_TIMEOUT_MS).catch(() => undefined);
    }
    task.sidecar?.close();
    void (task.tempDir ? rm(task.tempDir, { recursive: true, force: true }) : Promise.resolve());
    this.runningTasks.delete(taskId);
    return true;
  }

  private async executeAgent(taskId: string, task: RunningAgentTask, input: RunTaskInput, sink: AgentEventSink): Promise<void> {
    try {
      const binaryPath = this.resolveBinaryPath();
      if (!binaryPath) {
        sink({ type: 'error', taskId, message: missingAppServerMessage() });
        return;
      }

      const backend = this.resolveAgentBackend();
      if (!backend) {
        sink({ type: 'error', taskId, message: '未配置 App Server external backend。设置 CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND，或随包携带 resources/app-server/backend/content-backend.mjs。' });
        return;
      }

      const agentTimeoutMs = resolveAgentTimeoutMs();
      task.tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-agent-'));
      const policyPath = join(task.tempDir, 'content-studio.policy.json');
      await writePolicy(policyPath);
      task.sidecar = this.createSidecar(binaryPath, policyPath, backend, agentTimeoutMs);
      sink({ type: 'status', taskId, message: '正在通过 App Server 启动内容生产任务...' });

      const initialize = await task.sidecar.request<{ serverInfo?: { protocolVersion?: string } }>('initialize', {
        clientInfo: appServerClientInfo(),
        capabilities: appServerClientCapabilities(),
      });
      const protocolVersion = initialize.result.serverInfo?.protocolVersion ?? APP_SERVER_PROTOCOL_VERSION;
      if (protocolVersion !== APP_SERVER_PROTOCOL_VERSION) {
        throw new Error(`unsupported app-server protocol: ${protocolVersion}`);
      }
      task.sidecar.notify('initialized');

      task.sessionId = `content_studio_${taskId}`;
      task.turnId = `turn_${taskId}`;
      await task.sidecar.request<AppServerSessionStartResponse>('agentSession/start', {
        sessionId: task.sessionId,
        threadId: `thread_${taskId}`,
        appId: 'content-studio',
        workspaceId: input.workspacePath,
        businessObjectRef: input.businessObjectRef ?? {
          kind: 'agentTask',
          id: taskId,
          title: input.prompt.slice(0, 80),
          metadata: {
            selectedSkillSlugs: input.selectedSkillSlugs ?? [],
          },
        },
      });
      const turn = await task.sidecar.request<AppServerTurnStartResponse>('agentSession/turn/start', {
        sessionId: task.sessionId,
        turnId: task.turnId,
        input: {
          text: input.prompt,
        },
        runtimeOptions: {
          stream: true,
          capabilityId: DEFAULT_AGENT_RUNTIME_CAPABILITY_ID,
          metadata: {
            selectedSkillSlugs: input.selectedSkillSlugs ?? [],
            permissionMode: input.permissionMode,
          },
        },
        queueIfBusy: true,
        skipPreSubmitResume: true,
      }, agentTimeoutMs);
      sink({ type: 'status', taskId, message: `App Server turn ${turn.result.turn.status}` });

      const handled = new Set<string>();
      for (const notification of turn.notifications) {
        this.publishNotificationEvent(taskId, notification, handled, sink, task);
      }
      await this.drainAgentNotifications(taskId, task, handled, sink, agentTimeoutMs);
      if (!task.closed && !task.failed) sink({ type: 'done', taskId });
    } catch (error) {
      if (!task.closed) {
        sink({ type: 'error', taskId, message: error instanceof Error ? error.message : String(error) });
      }
    } finally {
      task.sidecar?.close();
      if (task.tempDir) await rm(task.tempDir, { recursive: true, force: true });
      this.runningTasks.delete(taskId);
    }
  }

  private async drainAgentNotifications(
    taskId: string,
    task: RunningAgentTask,
    handled: Set<string>,
    sink: AgentEventSink,
    timeoutMs: number,
  ): Promise<void> {
    if (!task.sidecar) return;
    const expiresAt = Date.now() + timeoutMs;
    while (!task.closed && !task.failed && !task.completed) {
      const remainingMs = expiresAt - Date.now();
      if (remainingMs <= 0) {
        throw new Error(`app-server agent turn timed out after ${timeoutMs}ms`);
      }
      try {
        const message = await task.sidecar.nextMessage(Math.min(AGENT_NOTIFICATION_POLL_MS, remainingMs));
        this.publishNotificationEvent(taskId, message, handled, sink, task);
      } catch (error) {
        if (task.closed) return;
        const message = error instanceof Error ? error.message : String(error);
        if (/timed out/.test(message)) continue;
        throw error;
      }
    }
  }

  private publishNotificationEvent(
    taskId: string,
    message: AppServerJsonRpcMessage,
    handled: Set<string>,
    sink: AgentEventSink,
    task?: RunningAgentTask,
  ): void {
    const event = notificationEvent(message);
    if (!isRuntimeEvent(event)) return;
    const eventKey = event.eventId ?? `${event.sequence ?? handled.size}:${event.type}`;
    if (handled.has(eventKey)) return;
    handled.add(eventKey);
    if (isFailedRuntimeEvent(event)) task && (task.failed = true);
    if (event.type === 'turn.completed') task && (task.completed = true);
    if (event.type === 'turn.canceled') task && (task.closed = true);
    const mapped = mapRuntimeEvent(taskId, event);
    if (mapped) sink(mapped);
  }

  private createSidecar(
    binaryPath: string,
    policyPath: string,
    backend: { command: string; args: string[] },
    backendTimeoutMs = DEFAULT_RPC_TIMEOUT_MS,
    backendEnv?: NodeJS.ProcessEnv,
  ): AppServerJsonRpcClient {
    const args = [
      '--stdio',
      '--backend',
      'external',
      '--backend-command',
      backend.command,
      ...backend.args.flatMap((arg) => ['--backend-arg', arg]),
      '--backend-timeout-ms',
      String(backendTimeoutMs),
      '--app-policy',
      policyPath,
    ];
    return new AppServerJsonRpcClient(binaryPath, args, {
      ...appServerSidecarEnv(),
      ...(backendEnv ?? {}),
    });
  }

  private resolveBinaryPath(): string | null {
    const envResourcesPath = this.resolveResourcesDir();
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? '';
    const binaryName = process.platform === 'win32' ? 'app-server.exe' : 'app-server';
    const envPath = process.env.APP_SERVER_BIN?.trim();
    const candidates = [
      ...(envResourcesPath
        ? [
          join(envResourcesPath, 'current', binaryName),
          join(envResourcesPath, `${process.platform}-${process.arch}`, binaryName),
        ]
        : []),
      ...(resourcesPath
        ? [
          join(resourcesPath, 'app-server', 'current', binaryName),
          join(resourcesPath, 'app-server', `${process.platform}-${process.arch}`, binaryName),
        ]
        : []),
      ...(envPath && allowAppServerBinaryOverride() ? [envPath] : []),
      ...repoResourceCandidates('current', binaryName),
    ];
    return candidates.find((candidate) => Boolean(candidate && existsSync(candidate))) ?? null;
  }

  private binarySource(binaryPath: string): AppServerHealthCheckResult['source'] {
    return allowAppServerBinaryOverride() && process.env.APP_SERVER_BIN?.trim() === binaryPath ? 'env' : 'resources';
  }

  private resolveAgentBackend(): { command: string; args: string[] } | null {
    const command = process.env.CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND?.trim();
    if (command) {
      return {
        command,
        args: parseBackendArgs(process.env.CONTENT_STUDIO_APP_SERVER_BACKEND_ARGS),
      };
    }
    const backendPath = this.resolvePackagedBackendPath();
    if (!backendPath) return null;
    return {
      command: process.execPath,
      args: [backendPath],
    };
  }

  private resolvePackagedBackendPath(): string | null {
    const envResourcesPath = this.resolveResourcesDir();
    const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath ?? '';
    const candidates = [
      ...(envResourcesPath ? [join(envResourcesPath, 'backend', 'content-backend.mjs')] : []),
      ...(resourcesPath ? [join(resourcesPath, 'app-server', 'backend', 'content-backend.mjs')] : []),
      ...repoResourceCandidates('backend', 'content-backend.mjs'),
    ];
    return candidates.find((candidate) => Boolean(candidate && existsSync(candidate))) ?? null;
  }

  private resolveResourcesDir(): string {
    const appServerResourcesDir = process.env.APP_SERVER_RESOURCES_DIR?.trim();
    if (appServerResourcesDir) return appServerResourcesDir;
    const contentStudioResourcesDir = process.env.CONTENT_STUDIO_RESOURCES_DIR?.trim();
    return contentStudioResourcesDir ? join(contentStudioResourcesDir, 'app-server') : '';
  }
}

function parseBackendArgs(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    // Fall through to newline-separated args.
  }
  return raw.split('\n').map((item) => item.trim()).filter(Boolean);
}

function allowAppServerBinaryOverride(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE === '1';
}

function appServerSidecarEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ELECTRON_RUN_AS_NODE: '1',
  };
}

function repoResourceCandidates(...parts: string[]): string[] {
  const roots = [
    process.env.CONTENT_STUDIO_REPO_ROOT?.trim(),
    process.cwd(),
    resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  ].filter((root): root is string => Boolean(root));
  return Array.from(new Set(roots.map((root) => join(root, 'resources', 'app-server', ...parts))));
}

function missingAppServerMessage(): string {
  return [
    '未找到随包 app-server sidecar。',
    '生产包必须携带 resources/app-server/current/app-server(.exe)。',
    '本地开发或测试如需覆盖，可设置 CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE=1 和 APP_SERVER_BIN。',
  ].join(' ');
}

function mapRuntimeEvent(taskId: string, event: AppServerRuntimeEvent): AgentEvent | null {
  if (event.type === 'message.delta') {
    const text = textFromRuntimePayload(event.payload);
    return text ? { type: 'assistant', taskId, text } : null;
  }
  if (event.type === 'artifact.snapshot') {
    return { type: 'result', taskId, summary: artifactSummary(event.payload), raw: event.payload };
  }
  if (isFailedRuntimeEvent(event)) {
    return { type: 'error', taskId, message: textFromRuntimePayload(event.payload) || 'App Server turn failed' };
  }
  if (event.type.includes('tool')) {
    return { type: 'tool', taskId, name: event.type, input: event.payload };
  }
  if (event.type === 'turn.completed') {
    return { type: 'result', taskId, summary: textFromRuntimePayload(event.payload), raw: event.payload };
  }
  if (event.type === 'turn.canceled') {
    return { type: 'status', taskId, message: 'App Server turn canceled' };
  }
  return { type: 'status', taskId, message: event.type };
}

function resolveAgentTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.CONTENT_STUDIO_APP_SERVER_AGENT_TIMEOUT_MS || env.APP_SERVER_AGENT_TIMEOUT_MS || DEFAULT_AGENT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : DEFAULT_AGENT_TIMEOUT_MS;
}

function textFromRuntimePayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  return [record.text, record.summary, record.message]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';
}

function artifactSummary(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title : undefined;
  const artifactId = typeof record.artifactId === 'string' ? record.artifactId : undefined;
  return title ?? artifactId;
}

function isFailedRuntimeEvent(event: AppServerRuntimeEvent): boolean {
  return event.type === 'turn.failed' || event.type.endsWith('.failed');
}

function isRuntimeEvent(value: unknown): value is AppServerRuntimeEvent {
  return Boolean(value && typeof value === 'object' && typeof (value as AppServerRuntimeEvent).type === 'string');
}

function notificationEvent(message: AppServerJsonRpcMessage): unknown {
  const params = message.params;
  return params && typeof params === 'object' ? (params as { event?: unknown }).event : undefined;
}

async function drainRuntimeEvents(
  sidecar: AppServerJsonRpcClient,
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
      const message = await sidecar.nextMessage(Math.min(AGENT_NOTIFICATION_POLL_MS, remainingMs));
      const event = notificationEvent(message);
      if (isRuntimeEvent(event)) events.push(event);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timed out/.test(message)) continue;
      throw error;
    }
  }
}

async function readArtifacts(
  sidecar: AppServerJsonRpcClient,
  sessionId: string,
  turnId: string,
  events: AppServerRuntimeEvent[],
): Promise<AppServerTurnArtifact[]> {
  const snapshots = events
    .filter((event) => event.type === 'artifact.snapshot')
    .map((event) => normalizeArtifact(event.payload))
    .filter((artifact): artifact is AppServerTurnArtifact => Boolean(artifact));
  const response = await sidecar.request<AppServerArtifactReadResponse>('artifact/read', {
    sessionId,
    turnId,
  });
  return uniqueArtifacts([
    ...snapshots,
    ...response.result.artifacts.map((artifact) => normalizeArtifact(artifact)).filter((artifact): artifact is AppServerTurnArtifact => Boolean(artifact)),
  ]);
}

async function exportEvidence(
  sidecar: AppServerJsonRpcClient,
  sessionId: string,
  turnId: string,
): Promise<{ events: AppServerRuntimeEvent[]; artifacts: AppServerTurnArtifact[] }> {
  const response = await sidecar.request<AppServerEvidenceExportResponse>('evidence/export', {
    sessionId,
    turnId,
    includeEvents: true,
    includeArtifacts: true,
  });
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

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function appServerClientInfo(): { name: string; title: string; version: string } {
  return {
    name: 'content_studio',
    title: 'Content Studio',
    version: process.env.npm_package_version ?? '0.0.0',
  };
}

function appServerClientCapabilities(): { experimentalApi: boolean; optOutNotificationMethods: string[] } {
  return {
    experimentalApi: false,
    optOutNotificationMethods: [],
  };
}

async function writePolicy(policyPath: string): Promise<void> {
  await writeFile(policyPath, `${JSON.stringify({
    capabilities: [
      {
        id: 'content.draft.generate',
        title: 'Generate Draft',
        methods: ['agentSession/turn/start'],
        appIds: ['content-studio'],
      },
    ],
  }, null, 2)}\n`);
}

async function writeBackend(backendPath: string): Promise<void> {
  await writeFile(backendPath, `#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.kind === 'turnStart') {
  console.log(JSON.stringify({
    events: [
      {
        type: 'message.delta',
        payload: {
          text: 'content-studio external backend ready',
          backend: 'external',
        },
      },
      {
        type: 'artifact.snapshot',
        payload: {
          artifactId: 'content-studio-draft-smoke',
          title: 'Content Studio Draft Smoke',
          kind: 'markdown',
          path: '.content-studio/app-server/content-studio-draft-smoke.md',
          content: '# Content Studio Draft Smoke',
        },
      },
    ],
  }));
  process.exit(0);
}
console.log(JSON.stringify({ events: [] }));
`);
}
