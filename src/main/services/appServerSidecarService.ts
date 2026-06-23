import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createInterface, type Interface as ReadlineInterface } from 'node:readline';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { app as electronApp } from 'electron';
import {
  APP_SERVER_AGENT_RUNTIME_BRIDGE_PROFILE,
  APP_SERVER_AGENT_SESSION_METHODS,
  APP_SERVER_PROTOCOL_VERSION,
} from '../../shared/types';
import type {
  AppServerBusinessObjectRef,
  AppServerHealthCheckResult,
  AppServerJsonRpcMessage,
  AppServerRuntimeEvent,
  AppServerSmokeResult,
  PermissionMode,
} from '../../shared/types';
import {
  ContentStudioAgentRuntimeSessionGateway,
  runContentStudioAgentRuntimeTurn,
  type AppServerRequestResult,
  type AppServerAgentRuntimeTurnResult,
  type AppServerSessionStartResponse,
  type AppServerTurnArtifact,
  type AppServerTurnStartResponse,
  type AppServerArtifactReadResponse,
  type AppServerEvidenceExportResponse,
} from './appServerAgentRuntimeGateway';
import { buildAgentRuntimeHostOptions } from './agentRuntimeToolPolicy';

const DEFAULT_RPC_TIMEOUT_MS = 5000;
const DEFAULT_AGENT_TIMEOUT_MS = 120_000;
const DEFAULT_AGENT_RUNTIME_CAPABILITY_ID = 'content.draft.generate';
const RUNTIME_PROVIDER_STORE_PROBE_TIMEOUT_MS = 10_000;

interface AppServerCapabilityListResponse {
  capabilities: Array<{ id: string; title: string; methods: string[] }>;
}

export interface AppServerPromptTurnInput {
  workspacePath: string;
  prompt: string;
  permissionMode?: PermissionMode;
  selectedSkillSlugs?: string[];
  metadata?: Record<string, unknown>;
  capabilityId?: string;
  providerPreference?: string;
  modelPreference?: string;
  hostOptions?: unknown;
  businessObjectRef?: AppServerBusinessObjectRef;
  timeoutMs?: number;
  backendEnv?: NodeJS.ProcessEnv;
}

export interface AppServerCapabilityTurnInput {
  workspacePath: string;
  capabilityId: string;
  input: Record<string, unknown>;
  permissionMode?: PermissionMode;
  selectedSkillSlugs?: string[];
  metadata?: Record<string, unknown>;
  businessObjectRef?: AppServerBusinessObjectRef;
  timeoutMs?: number;
  backendEnv?: NodeJS.ProcessEnv;
  providerPreference?: string;
  modelPreference?: string;
  hostOptions?: unknown;
  backendMode?: 'external' | 'runtime';
  sessionIdPrefix?: string;
}

export type AppServerCapabilityTurnResult = AppServerAgentRuntimeTurnResult;
export type { AppServerTurnArtifact };
export interface AppServerPromptTurnResult extends AppServerAgentRuntimeTurnResult {}

class AppServerJsonRpcClient {
  private nextId = 1;
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly lines: ReadlineInterface;
  private readonly buffered: AppServerJsonRpcMessage[] = [];
  private stderrBuffer = '';
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
    this.child.stderr.on('data', (chunk) => {
      this.stderrBuffer = `${this.stderrBuffer}${String(chunk)}`.slice(-4000);
    });
    this.child.stdin.on('error', (error) => {
      this.exited = true;
      this.rejectPending(error);
    });
    this.child.once('error', (error) => this.rejectPending(error));
    this.child.once('exit', (code, signal) => {
      this.exited = true;
      const stderr = this.stderrBuffer.trim();
      this.rejectPending(new Error([
        `app-server exited before response: code=${code ?? 'null'} signal=${signal ?? 'null'}`,
        stderr ? `stderr=${stderr}` : '',
      ].filter(Boolean).join(' ')));
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
  async healthCheck(): Promise<AppServerHealthCheckResult> {
    const binaryPath = this.resolveBinaryPath();
    if (!binaryPath) {
      return {
        available: false,
        protocolVersion: APP_SERVER_PROTOCOL_VERSION,
        source: 'missing',
        bridgeProfile: APP_SERVER_AGENT_RUNTIME_BRIDGE_PROFILE,
        message: missingAppServerMessage(),
      };
    }
    return {
      available: true,
      protocolVersion: APP_SERVER_PROTOCOL_VERSION,
      binaryPath,
      source: this.binarySource(binaryPath),
      bridgeProfile: APP_SERVER_AGENT_RUNTIME_BRIDGE_PROFILE,
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
        bridgeProfile: APP_SERVER_AGENT_RUNTIME_BRIDGE_PROFILE,
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

      const initialize = await sidecar.request<{ serverInfo?: { protocolVersion?: string } }>(APP_SERVER_AGENT_SESSION_METHODS.initialize, {
        clientInfo: appServerClientInfo(),
        capabilities: appServerClientCapabilities(),
      });
      const protocolVersion = initialize.result.serverInfo?.protocolVersion ?? APP_SERVER_PROTOCOL_VERSION;
      sidecar.notify(APP_SERVER_AGENT_SESSION_METHODS.initialized);

      const capabilities = await sidecar.request<AppServerCapabilityListResponse>(APP_SERVER_AGENT_SESSION_METHODS.listCapabilities, {
        appId: 'content-studio',
        workspaceId: 'content-studio-smoke',
      });
      const capabilityIds = capabilities.result.capabilities.map((capability) => capability.id);
      const sessionId = `content_studio_${randomUUID()}`;
      const turnId = `turn_${randomUUID()}`;
      await sidecar.request<AppServerSessionStartResponse>(APP_SERVER_AGENT_SESSION_METHODS.startSession, {
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
      const turn = await sidecar.request<AppServerTurnStartResponse>(APP_SERVER_AGENT_SESSION_METHODS.startTurn, {
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

      const artifacts = await sidecar.request<AppServerArtifactReadResponse>(APP_SERVER_AGENT_SESSION_METHODS.readArtifact, {
        sessionId,
        turnId,
      });
      const evidence = await sidecar.request<AppServerEvidenceExportResponse>(APP_SERVER_AGENT_SESSION_METHODS.exportEvidence, {
        sessionId,
        turnId,
        includeEvents: true,
        includeArtifacts: true,
      });

      return {
        ok: true,
        protocolVersion,
        source: this.binarySource(binaryPath),
        bridgeProfile: APP_SERVER_AGENT_RUNTIME_BRIDGE_PROFILE,
        binaryPath,
        capabilityIds,
        eventTypes: events.map((event) => event.type),
        artifactRefs: artifacts.result.artifacts
          .map((artifact) => artifact.artifactRef)
          .filter((artifactRef): artifactRef is string => Boolean(artifactRef)),
        evidenceEventCount: evidence.result.events.length,
        evidenceArtifactCount: evidence.result.artifacts.length,
      };
    } catch (error) {
      return {
        ok: false,
        protocolVersion: APP_SERVER_PROTOCOL_VERSION,
        source: this.binarySource(binaryPath),
        bridgeProfile: APP_SERVER_AGENT_RUNTIME_BRIDGE_PROFILE,
        binaryPath,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      sidecar?.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  async runPromptTurn(input: AppServerPromptTurnInput): Promise<AppServerPromptTurnResult> {
    return this.runCapabilityTurn({
      workspacePath: input.workspacePath,
      capabilityId: input.capabilityId ?? DEFAULT_AGENT_RUNTIME_CAPABILITY_ID,
      input: {
        text: input.prompt,
      },
      permissionMode: input.permissionMode,
      selectedSkillSlugs: input.selectedSkillSlugs,
      metadata: input.metadata,
      businessObjectRef: input.businessObjectRef,
      timeoutMs: input.timeoutMs,
      backendEnv: input.backendEnv,
      providerPreference: input.providerPreference,
      modelPreference: input.modelPreference,
      hostOptions: input.hostOptions ?? buildAgentRuntimeHostOptions({
        prompt: input.prompt,
        workspacePath: input.workspacePath,
        providerPreference: input.providerPreference,
        modelPreference: input.modelPreference,
        metadata: input.metadata,
      }),
      backendMode: 'runtime',
      sessionIdPrefix: 'content_studio_prompt',
    });
  }

  async runCapabilityTurn(input: AppServerCapabilityTurnInput): Promise<AppServerCapabilityTurnResult> {
    const binaryPath = this.resolveBinaryPath();
    if (!binaryPath) {
      throw new Error(missingAppServerMessage());
    }
    const backendMode = input.backendMode ?? 'external';
    const backend = backendMode === 'external' ? this.resolveAgentBackend() : null;
    if (backendMode === 'external' && !backend) {
      throw new Error('未配置 App Server external backend。设置 CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND，或随包携带 resources/app-server/backend/content-backend.mjs。');
    }
    if (backendMode === 'runtime') {
      await assertRuntimeProviderStoreSupport(binaryPath);
    }

    const timeoutMs = input.timeoutMs ?? resolveAgentTimeoutMs();
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-capability-'));
    const policyPath = join(tempDir, 'content-studio.policy.json');
    let sidecar: AppServerJsonRpcClient | undefined;
    try {
      await writePolicy(policyPath);
      sidecar = this.createSidecar({
        binaryPath,
        policyPath,
        backend,
        backendMode,
        backendTimeoutMs: timeoutMs,
        backendEnv: input.backendEnv,
      });
      const initialize = await sidecar.request<{ serverInfo?: { protocolVersion?: string } }>(APP_SERVER_AGENT_SESSION_METHODS.initialize, {
        clientInfo: appServerClientInfo(),
        capabilities: appServerClientCapabilities(),
      });
      const protocolVersion = initialize.result.serverInfo?.protocolVersion ?? APP_SERVER_PROTOCOL_VERSION;
      if (protocolVersion !== APP_SERVER_PROTOCOL_VERSION) {
        throw new Error(`unsupported app-server protocol: ${protocolVersion}`);
      }
      sidecar.notify(APP_SERVER_AGENT_SESSION_METHODS.initialized);

      return await runContentStudioAgentRuntimeTurn(
        new ContentStudioAgentRuntimeSessionGateway(sidecar, timeoutMs),
        input,
        timeoutMs,
      );
    } finally {
      sidecar?.close();
      await rm(tempDir, { recursive: true, force: true });
    }
  }

  private createSidecar(input: {
    binaryPath: string;
    policyPath: string;
    backend?: { command: string; args: string[] } | null;
    backendMode: 'external' | 'runtime';
    backendTimeoutMs?: number;
    backendEnv?: NodeJS.ProcessEnv;
  }): AppServerJsonRpcClient {
    const backendTimeoutMs = input.backendTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
    const args = [
      '--stdio',
      '--backend',
      input.backendMode,
      ...(input.backendMode === 'external' && input.backend
        ? [
          '--backend-command',
          input.backend.command,
          ...input.backend.args.flatMap((arg) => ['--backend-arg', arg]),
          '--backend-timeout-ms',
          String(backendTimeoutMs),
        ]
        : []),
      '--app-policy',
      input.policyPath,
      ...(input.backendMode === 'runtime' ? appServerExtraArgs() : []),
    ];
    return new AppServerJsonRpcClient(input.binaryPath, args, this.createSidecarEnv(input.backendMode, input.backendEnv));
  }

  private createSidecarEnv(
    backendMode: 'external' | 'runtime',
    backendEnv?: NodeJS.ProcessEnv,
  ): NodeJS.ProcessEnv {
    const env = {
      ...appServerSidecarEnv(),
      ...(backendEnv ?? {}),
    };
    return backendMode === 'runtime' ? sanitizeRuntimeSidecarEnv(env) : env;
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
      ...limeDevAppServerCandidates(binaryName),
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

async function assertRuntimeProviderStoreSupport(binaryPath: string): Promise<void> {
  const help = await runAppServerHelp(binaryPath, RUNTIME_PROVIDER_STORE_PROBE_TIMEOUT_MS);
  if (!help.includes('--data-dir')) {
    throw new Error('App Server runtime provider store requires an app-server binary with --data-dir support.');
  }

  const dataDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-runtime-provider-store-'));
  let sidecar: AppServerJsonRpcClient | undefined;
  try {
    sidecar = new AppServerJsonRpcClient(binaryPath, [
      '--stdio',
      '--backend',
      'unavailable',
      '--data-dir',
      dataDir,
    ], sanitizeRuntimeSidecarEnv(appServerSidecarEnv()));
    await sidecar.request(APP_SERVER_AGENT_SESSION_METHODS.initialize, {
      clientInfo: appServerClientInfo(),
      capabilities: appServerClientCapabilities(),
    }, RUNTIME_PROVIDER_STORE_PROBE_TIMEOUT_MS);
    sidecar.notify(APP_SERVER_AGENT_SESSION_METHODS.initialized);
    await sidecar.request('modelProvider/list', {}, RUNTIME_PROVIDER_STORE_PROBE_TIMEOUT_MS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/--data-dir/.test(message)) throw error;
    throw new Error(`App Server runtime provider store is unavailable: ${message}`);
  } finally {
    sidecar?.close();
    await rm(dataDir, { recursive: true, force: true });
  }
}

async function runAppServerHelp(binaryPath: string, timeoutMs: number): Promise<string> {
  return await new Promise((resolveHelp, rejectHelp) => {
    const child = spawn(binaryPath, ['--help'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: sanitizeRuntimeSidecarEnv(appServerSidecarEnv()),
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      rejectHelp(new Error(`app-server --help timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      rejectHelp(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolveHelp(`${stdout}\n${stderr}`);
        return;
      }
      rejectHelp(new Error(`app-server --help failed: code=${code ?? 'null'} stderr=${stderr.trim()}`));
    });
  });
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

function sanitizeRuntimeSidecarEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const next = { ...env };
  for (const key of Object.keys(next)) {
    if (isRuntimeSecretEnvKey(key)) delete next[key];
  }
  return next;
}

function isRuntimeSecretEnvKey(key: string): boolean {
  const normalized = key.toUpperCase();
  if (normalized === 'AUTHORIZATION' || normalized === 'COOKIE' || normalized === 'LIME_RUNTIME_BRIDGE') return true;
  if (/(^|_)(API_KEY|APIKEY|KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|CREDENTIALS|AUTHORIZATION|COOKIE)(_|$)/i.test(key)) return true;
  return false;
}

function appServerExtraArgs(): string[] {
  const args = parseAppServerArgs(process.env.APP_SERVER_ARGS);
  return hasDataDirArg(args) ? args : [...args, '--data-dir', resolveDefaultAppServerDataDir()];
}

function hasDataDirArg(args: string[]): boolean {
  return args.some((arg) => arg === '--data-dir' || arg.startsWith('--data-dir='));
}

function resolveDefaultAppServerDataDir(): string {
  const override = process.env.CONTENT_STUDIO_APP_SERVER_DATA_DIR?.trim() || process.env.APP_SERVER_DATA_DIR?.trim();
  if (override) return override;
  try {
    const getPath = (electronApp as unknown as { getPath?: (name: string) => string } | undefined)?.getPath;
    const userDataPath = typeof getPath === 'function' ? getPath('userData') : '';
    if (userDataPath?.trim()) return join(userDataPath, 'app-server');
  } catch {
    // Node-only smoke/test environments do not expose Electron app.
  }
  return join(tmpdir(), 'content-studio-app-server');
}

function parseAppServerArgs(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    // Fall through to whitespace-separated args.
  }
  return raw.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function repoResourceCandidates(...parts: string[]): string[] {
  const roots = [
    process.env.CONTENT_STUDIO_REPO_ROOT?.trim(),
    process.cwd(),
    resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..'),
  ].filter((root): root is string => Boolean(root));
  return Array.from(new Set(roots.map((root) => join(root, 'resources', 'app-server', ...parts))));
}

function limeDevAppServerCandidates(binaryName: string): string[] {
  const roots = [
    process.env.LIME_APP_SERVER_REPO?.trim(),
    resolve(process.cwd(), '..', '..', 'aiclientproxy', 'lime'),
    resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', 'aiclientproxy', 'lime'),
  ].filter((root): root is string => Boolean(root));
  const platformKey = `${process.platform}-${process.arch}`;
  return Array.from(new Set(roots.flatMap((root) => [
    join(root, 'dist-electron', 'app-server', platformKey, binaryName),
    join(root, 'lime-rs', 'target', 'debug', binaryName),
  ])));
}

function missingAppServerMessage(): string {
  return [
    '未找到随包 app-server sidecar。',
    '生产包必须携带 resources/app-server/current/app-server(.exe)。',
    '本地开发会自动查找 ../../aiclientproxy/lime/dist-electron/app-server；也可设置 LIME_APP_SERVER_REPO，或设置 CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE=1 和 APP_SERVER_BIN。',
  ].join(' ');
}

function resolveAgentTimeoutMs(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.CONTENT_STUDIO_APP_SERVER_AGENT_TIMEOUT_MS || env.APP_SERVER_AGENT_TIMEOUT_MS || DEFAULT_AGENT_TIMEOUT_MS);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : DEFAULT_AGENT_TIMEOUT_MS;
}

function isRuntimeEvent(value: unknown): value is AppServerRuntimeEvent {
  return Boolean(value && typeof value === 'object' && typeof (value as AppServerRuntimeEvent).type === 'string');
}

function notificationEvent(message: AppServerJsonRpcMessage): unknown {
  const params = message.params;
  return params && typeof params === 'object' ? (params as { event?: unknown }).event : undefined;
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
        methods: [APP_SERVER_AGENT_SESSION_METHODS.startTurn],
        appIds: ['content-studio'],
      },
      {
        id: 'content.text.generate',
        title: 'Generate Text',
        methods: [APP_SERVER_AGENT_SESSION_METHODS.startTurn],
        appIds: ['content-studio'],
      },
      {
        id: 'content.article.generate',
        title: 'Generate Article',
        methods: [APP_SERVER_AGENT_SESSION_METHODS.startTurn],
        appIds: ['content-studio'],
      },
      {
        id: 'content.prompt.generate',
        title: 'Generate Prompt',
        methods: [APP_SERVER_AGENT_SESSION_METHODS.startTurn],
        appIds: ['content-studio'],
      },
      {
        id: 'content.image.generate',
        title: 'Generate Image',
        methods: [APP_SERVER_AGENT_SESSION_METHODS.startTurn],
        appIds: ['content-studio'],
      },
      {
        id: 'content.video.generate',
        title: 'Generate Video',
        methods: [APP_SERVER_AGENT_SESSION_METHODS.startTurn],
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
