#!/usr/bin/env node

import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath, pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_PROMPT = '请生成一段 80 字以内的 Content Studio runtime provider store live 验收草稿。';
const DEFAULT_TIMEOUT_MS = 120_000;

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const key = item.slice(2);
    const next = argv[index + 1];
    const value = !next || next.startsWith('--') ? 'true' : next;
    if (value !== 'true') index += 1;
    args[key] = value;
  }
  return args;
}

function firstValue(...values) {
  return values.map((value) => String(value || '').trim()).find(Boolean);
}

function parseAppServerArgs(raw) {
  if (!String(raw || '').trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')) {
      return parsed;
    }
  } catch {
    // Fall through to whitespace-separated args.
  }
  return String(raw).split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function dataDirFromAppServerArgs(raw) {
  const args = parseAppServerArgs(raw);
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item === '--data-dir') return args[index + 1];
    if (item.startsWith('--data-dir=')) return item.slice('--data-dir='.length);
  }
  return undefined;
}

function hasRuntimeSidecarSource(env) {
  if (firstValue(env.APP_SERVER_RESOURCES_DIR, env.CONTENT_STUDIO_RESOURCES_DIR)) return true;
  return env.CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE === '1' && Boolean(firstValue(env.APP_SERVER_BIN));
}

function assertNoProductAppKeyEnv(env) {
  const forbidden = Object.keys(env).filter((key) => {
    if (key === 'AUTHORIZATION' || key === 'COOKIE' || key === 'LIME_RUNTIME_BRIDGE') return true;
    return /(^|_)(API_KEY|APIKEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|CREDENTIALS|AUTHORIZATION|COOKIE)(_|$)/i.test(key);
  });
  if (forbidden.length) {
    throw new Error(`runtime live check must not receive Product App key/token env: ${forbidden.sort().join(', ')}`);
  }
}

function resolveRequiredConfig({ env, args }) {
  if (!hasRuntimeSidecarSource(env)) {
    throw new Error('missing App Server runtime source: set APP_SERVER_RESOURCES_DIR, or set CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE=1 with APP_SERVER_BIN');
  }
  const dataDir = firstValue(args['data-dir'], env.CONTENT_STUDIO_APP_SERVER_DATA_DIR, env.APP_SERVER_DATA_DIR, dataDirFromAppServerArgs(env.APP_SERVER_ARGS));
  const providerPreference = firstValue(args.provider, env.CONTENT_STUDIO_RUNTIME_PROVIDER_PREFERENCE, env.APP_SERVER_RUNTIME_PROVIDER_PREFERENCE);
  const modelPreference = firstValue(args.model, env.CONTENT_STUDIO_RUNTIME_MODEL_PREFERENCE, env.APP_SERVER_RUNTIME_MODEL_PREFERENCE);
  if (!dataDir) {
    throw new Error('missing runtime data root: set CONTENT_STUDIO_APP_SERVER_DATA_DIR or APP_SERVER_DATA_DIR, or pass --data-dir');
  }
  if (!providerPreference) {
    throw new Error('missing provider preference: pass --provider or set CONTENT_STUDIO_RUNTIME_PROVIDER_PREFERENCE');
  }
  if (!modelPreference) {
    throw new Error('missing model preference: pass --model or set CONTENT_STUDIO_RUNTIME_MODEL_PREFERENCE');
  }
  return { dataDir, providerPreference, modelPreference };
}

async function loadAppServerSidecarService() {
  const outDir = join(tmpdir(), `content-studio-app-server-runtime-live-${process.pid}`);
  const entryPath = join(outDir, 'entry.ts');
  const bundlePath = join(outDir, 'entry.mjs');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    entryPath,
    `export { AppServerSidecarService } from ${JSON.stringify(join(projectRoot, 'src/main/services/appServerSidecarService.ts'))};\n`,
  );
  await esbuild.build({
    entryPoints: [entryPath],
    outfile: bundlePath,
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'esm',
    logLevel: 'silent',
    plugins: [{
      name: 'electron-runtime-live-shim',
      setup(build) {
        build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron-runtime-live-shim', namespace: 'content-studio-runtime-live' }));
        build.onLoad({ filter: /.*/, namespace: 'content-studio-runtime-live' }, () => ({
          loader: 'js',
          contents: `
            import { join } from 'node:path';
            import { tmpdir } from 'node:os';
            export const app = {
              getPath: (name) => name === 'userData' ? join(tmpdir(), 'content-studio-runtime-live-user-data') : tmpdir(),
            };
          `,
        }));
      },
    }],
  });
  const mod = await import(pathToFileURL(bundlePath).href);
  return {
    AppServerSidecarService: mod.AppServerSidecarService,
    cleanup: () => rm(outDir, { recursive: true, force: true }),
  };
}

async function assertRuntimeBinarySupportsProviderStore({ binaryPath, dataDir, timeoutMs }) {
  const help = await execAppServerHelp(binaryPath, timeoutMs);
  if (!help.includes('--data-dir')) {
    throw new Error('App Server binary does not support --data-dir; use Lime App Server with runtime provider store support.');
  }

  const probe = await runJsonRpcProbe({
    binaryPath,
    args: ['--stdio', '--backend', 'unavailable', '--data-dir', dataDir],
    requests: [
      {
        method: 'initialize',
        params: {
          clientInfo: { name: 'content-studio-runtime-live-probe', version: '0.0.0' },
          capabilities: { experimentalApi: false, optOutNotificationMethods: [] },
        },
      },
      { method: 'initialized', notification: true, params: {} },
      { method: 'modelProvider/list', params: {} },
    ],
    timeoutMs,
  });
  const providerList = probe.responses.find((response) => response.method === 'modelProvider/list');
  if (!providerList || providerList.error) {
    throw new Error(`App Server binary does not expose provider store modelProvider/list: ${providerList?.error || 'missing response'}`);
  }
}

async function execAppServerHelp(binaryPath, timeoutMs) {
  return await new Promise((resolveHelp, rejectHelp) => {
    const child = spawn(binaryPath, ['--help'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
        TMPDIR: process.env.TMPDIR || tmpdir(),
      },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      rejectHelp(new Error(`App Server --help timed out after ${timeoutMs}ms`));
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
      rejectHelp(new Error(`App Server --help failed: code=${code ?? 'null'} stderr=${stderr.trim()}`));
    });
  });
}

async function runJsonRpcProbe({ binaryPath, args, requests, timeoutMs }) {
  return await new Promise((resolveProbe, rejectProbe) => {
    const child = spawn(binaryPath, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: {
        PATH: process.env.PATH || '',
        HOME: process.env.HOME || '',
        TMPDIR: process.env.TMPDIR || tmpdir(),
        APP_SERVER_BACKEND_MODE: 'unavailable',
      },
    });
    const responses = [];
    const pending = new Map();
    let stderr = '';
    let nextId = 1;
    let settled = false;
    const timer = setTimeout(() => {
      finish(new Error(`App Server provider store probe timed out after ${timeoutMs}ms stderr=${stderr.trim()}`));
    }, timeoutMs);

    function finish(error) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGTERM');
      if (error) {
        rejectProbe(error);
        return;
      }
      resolveProbe({ responses });
    }

    function sendNext() {
      while (requests.length) {
        const request = requests.shift();
        if (request.notification) {
          child.stdin.write(`${JSON.stringify({ method: request.method, params: request.params ?? {} })}\n`);
          continue;
        }
        const id = nextId++;
        pending.set(id, request.method);
        child.stdin.write(`${JSON.stringify({ id, method: request.method, params: request.params ?? {} })}\n`);
        return;
      }
      if (pending.size === 0) finish();
    }

    const lines = createInterface({ input: child.stdout });
    lines.on('line', (line) => {
      if (!line.trim()) return;
      let message;
      try {
        message = JSON.parse(line);
      } catch (error) {
        finish(new Error(`App Server provider store probe returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`));
        return;
      }
      if (typeof message.id === 'number' && pending.has(message.id)) {
        const method = pending.get(message.id);
        pending.delete(message.id);
        responses.push({
          method,
          result: message.result,
          error: message.error?.message,
        });
        sendNext();
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-2000);
    });
    child.once('error', finish);
    child.once('exit', (code, signal) => {
      if (settled) return;
      finish(new Error(`App Server provider store probe exited early: code=${code ?? 'null'} signal=${signal ?? 'null'} stderr=${stderr.trim()}`));
    });
    sendNext();
  });
}

function summarizeResult(result) {
  const artifact = result.artifacts.find((item) => item.content?.trim()) ?? result.evidenceArtifacts.find((item) => item.content?.trim());
  const messageText = finalMessageText(result.events);
  const completed = result.events.find((event) => event.type === 'turn.final_done' || event.type === 'turn.completed');
  if (!completed) {
    throw new Error(`runtime live check did not produce turn.final_done; events=${result.events.map((event) => event.type).join(',')}`);
  }
  if (!artifact && !messageText) {
    throw new Error(`runtime live check did not produce artifact or message content; events=${result.events.map((event) => event.type).join(',')}`);
  }
  const serialized = JSON.stringify(result);
  if (/api[_-]?key|token|secret|password|credential|authorization|cookie/i.test(serialized)) {
    throw new Error('runtime live check result contains key/token/secret-like fields');
  }
  return {
    sessionId: result.sessionId,
    turnId: result.turnId,
    eventTypes: Array.from(new Set(result.events.map((event) => event.type))),
    artifact: artifact?.title || artifact?.artifactRef || artifact?.artifactId || (messageText ? 'message.final' : 'untitled'),
    evidenceEvents: result.evidenceEvents.length,
    evidenceArtifacts: result.evidenceArtifacts.length,
  };
}

function finalMessageText(events) {
  const deltas = events
    .filter((event) => event.type === 'message.delta_batch' || event.type === 'message.delta')
    .map((event) => textFromRuntimePayload(event.payload))
    .filter(Boolean);
  if (deltas.length) return deltas.join('').trim();
  return events
    .filter((event) => event.type === 'message')
    .map((event) => textFromRuntimePayload(event.payload))
    .filter(Boolean)
    .join('')
    .trim();
}

function textFromRuntimePayload(payload) {
  if (typeof payload === 'string') return payload.trim();
  if (!payload || typeof payload !== 'object') return '';
  const direct = [payload.text, payload.content, payload.delta]
    .find((value) => typeof value === 'string' && value.trim());
  if (direct) return direct.trim();
  const message = payload.message;
  if (message && typeof message === 'object') {
    if (typeof message.content === 'string') return message.content.trim();
    if (Array.isArray(message.content)) {
      return message.content
        .map((part) => part && typeof part === 'object' && typeof part.text === 'string' ? part.text : '')
        .join('')
        .trim();
    }
  }
  return '';
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { dataDir, providerPreference, modelPreference } = resolveRequiredConfig({ env: process.env, args });
  assertNoProductAppKeyEnv(process.env);
  if (args['data-dir']) process.env.CONTENT_STUDIO_APP_SERVER_DATA_DIR = dataDir;

  const prompt = String(args.prompt || process.env.CONTENT_STUDIO_RUNTIME_LIVE_PROMPT || DEFAULT_PROMPT);
  const timeoutMs = Number(args['timeout-ms'] || process.env.CONTENT_STUDIO_RUNTIME_LIVE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const { AppServerSidecarService, cleanup } = await loadAppServerSidecarService();
  try {
    const service = new AppServerSidecarService();
    const health = await service.healthCheck();
    if (!health.available || !health.binaryPath) {
      throw new Error(health.message || 'App Server runtime source is not available.');
    }
    await assertRuntimeBinarySupportsProviderStore({
      binaryPath: health.binaryPath,
      dataDir,
      timeoutMs: Math.min(timeoutMs, 10_000),
    });
    const result = await service.runPromptTurn({
      workspacePath: dataDir,
      prompt,
      permissionMode: 'ask',
      providerPreference,
      modelPreference,
      metadata: {
        operation: 'runtime-live-check',
        providerPreference,
        modelPreference,
        dataDir,
      },
      businessObjectRef: {
        kind: 'promptDraft',
        id: 'runtime-live-check',
        title: 'Runtime provider store live check',
      },
      timeoutMs,
    });
    const summary = summarizeResult(result);
    console.log([
      '[app-server:runtime:live] ok',
      `provider=${providerPreference}`,
      `model=${modelPreference}`,
      `session=${summary.sessionId}`,
      `turn=${summary.turnId}`,
      `events=${summary.eventTypes.join(',')}`,
      `artifact=${summary.artifact}`,
      `evidenceEvents=${summary.evidenceEvents}`,
      `evidenceArtifacts=${summary.evidenceArtifacts}`,
    ].join(' '));
  } finally {
    await cleanup();
  }
}

main().catch((error) => {
  console.error(`[app-server:runtime:live] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
