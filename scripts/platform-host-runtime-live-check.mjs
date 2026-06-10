#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';

const DEFAULT_PROMPT = '请生成一段 80 字以内的 Content Studio 平台宿主联调验收草稿。';
const DEFAULT_TIMEOUT_MS = 120_000;
const CONTENT_STUDIO_APP_ID = 'content-studio';

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

function parseJsonEnv(name) {
  const raw = process.env[name]?.trim();
  if (!raw) return undefined;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`${name} 不是合法 JSON。`);
  }
}

async function parseJsonFile(filePath) {
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function isRuntimeBridgeDescriptor(value) {
  return Boolean(
    value &&
      value.protocol === 'lime.runtimeBridge' &&
      value.version === 1 &&
      isLoopbackEndpoint(value.endpoint) &&
      typeof value.token === 'string' &&
      value.appId === CONTENT_STUDIO_APP_ID &&
      typeof value.entryKey === 'string' &&
      typeof value.expiresAt === 'string',
  );
}

function isRuntimeBridgeDiscoveryDescriptor(value) {
  return Boolean(
    value &&
      value.protocol === 'lime.runtimeBridge.discovery' &&
      value.version === 1 &&
      isLoopbackEndpoint(value.endpoint) &&
      typeof value.token === 'string' &&
      typeof value.expiresAt === 'string',
  );
}

function isLoopbackEndpoint(value) {
  return typeof value === 'string' && value.startsWith('http://127.0.0.1:');
}

function isExpired(iso) {
  const timestamp = Date.parse(iso);
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function defaultAppDataPath() {
  if (process.platform === 'darwin') {
    return join(homedir(), 'Library', 'Application Support');
  }
  if (process.platform === 'win32') {
    return process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
  }
  return process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
}

function runtimeBridgeDiscoveryPath(env) {
  const overridePath = env.LIME_DESKTOP_PLATFORM_BRIDGE_DISCOVERY_PATH?.trim();
  if (overridePath) return overridePath;
  return join(defaultAppDataPath(), 'Lime Desktop Platform', 'runtime-bridge-discovery.json');
}

function assertNoProductAppKeyEnv(env) {
  const forbidden = Object.keys(env).filter((key) => {
    if (key === 'AUTHORIZATION' || key === 'COOKIE') return true;
    return /(^|_)(API_KEY|APIKEY|TOKEN|SECRET|PASSWORD|CREDENTIAL|CREDENTIALS|AUTHORIZATION|COOKIE)(_|$)/i.test(key);
  }).filter((key) => key !== 'LIME_RUNTIME_BRIDGE');
  if (forbidden.length) {
    throw new Error(`platform host live check must not receive Product App key/token env: ${forbidden.sort().join(', ')}`);
  }
}

async function resolveRuntimeBridgeDescriptor({ env, timeoutMs }) {
  const descriptor = parseJsonEnv('LIME_RUNTIME_BRIDGE');
  if (descriptor) {
    if (!isRuntimeBridgeDescriptor(descriptor)) {
      throw new Error('LIME_RUNTIME_BRIDGE 不是合法 runtime bridge descriptor。');
    }
    if (isExpired(descriptor.expiresAt)) {
      throw new Error('platform runtime bridge descriptor has expired.');
    }
    return { descriptor, source: 'env' };
  }

  const discoveryPath = runtimeBridgeDiscoveryPath(env);
  const discovery = await parseJsonFile(discoveryPath);
  if (!isRuntimeBridgeDiscoveryDescriptor(discovery)) {
    throw new Error(`missing real platform runtime bridge: launch Content Studio from lime-desktop-platform, set LIME_RUNTIME_BRIDGE, or publish discovery at ${discoveryPath}.`);
  }
  if (isExpired(discovery.expiresAt)) {
    throw new Error('platform runtime bridge discovery descriptor has expired.');
  }
  const payload = await postJson(
    discovery,
    '/attach',
    {
      appId: CONTENT_STUDIO_APP_ID,
      entryKey: 'default',
    },
    timeoutMs,
    discovery.token,
  );
  const attachedDescriptor = payload.result;
  if (!isRuntimeBridgeDescriptor(attachedDescriptor)) {
    throw new Error('platform discovery /attach did not return a valid runtime bridge descriptor.');
  }
  if (isExpired(attachedDescriptor.expiresAt)) {
    throw new Error('platform discovery /attach returned an expired runtime bridge descriptor.');
  }
  return { descriptor: attachedDescriptor, source: 'discovery' };
}

async function assertRequiredConfig({ args, env, timeoutMs }) {
  const bridge = await resolveRuntimeBridgeDescriptor({ env, timeoutMs });
  const providerPreference = firstValue(args.provider, env.CONTENT_STUDIO_RUNTIME_PROVIDER_PREFERENCE, env.APP_SERVER_RUNTIME_PROVIDER_PREFERENCE);
  const modelPreference = firstValue(args.model, env.CONTENT_STUDIO_RUNTIME_MODEL_PREFERENCE, env.APP_SERVER_RUNTIME_MODEL_PREFERENCE);
  if (!providerPreference) {
    throw new Error('missing provider preference: pass --provider or set CONTENT_STUDIO_RUNTIME_PROVIDER_PREFERENCE.');
  }
  if (!modelPreference) {
    throw new Error('missing model preference: pass --model or set CONTENT_STUDIO_RUNTIME_MODEL_PREFERENCE.');
  }
  return { ...bridge, providerPreference, modelPreference };
}

function bridgeHeaders(descriptor, token = descriptor.token) {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/json; charset=utf-8',
    accept: 'application/json',
  };
}

async function postJson(descriptor, path, body, timeoutMs, token = descriptor.token) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${descriptor.endpoint}${path}`, {
      method: 'POST',
      headers: bridgeHeaders(descriptor, token),
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error?.message || `platform bridge ${path} failed: HTTP ${response.status}`);
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeAgentResult(output) {
  if (!output || typeof output !== 'object') {
    throw new Error('platform lime.agent did not return a runtime result object.');
  }
  const result = output;
  if (!result.ok) {
    throw new Error(result.message || result.readiness?.reasons?.[0]?.message || 'platform lime.agent returned a blocked result.');
  }
  const sessionId = result.sessionId || result.appServer?.session?.sessionId;
  const turnId = result.turnId || result.appServer?.turn?.turnId;
  const events = Array.isArray(result.events) ? result.events : [];
  if (!sessionId || !turnId) {
    throw new Error('platform lime.agent did not return sessionId/turnId facts.');
  }
  if (!events.length) {
    throw new Error('platform lime.agent did not return runtime events.');
  }
  const artifact = events.find((event) => event?.type === 'artifact.snapshot' && event?.payload?.content);
  const terminal = events.find((event) => event?.type === 'turn.completed' || event?.type === 'turn.failed' || event?.type === 'turn.canceled');
  if (!artifact) {
    throw new Error(`platform lime.agent did not produce artifact.snapshot content; events=${events.map((event) => event.type).join(',')}`);
  }
  if (terminal?.type === 'turn.failed') {
    throw new Error(terminal.payload?.message || 'platform lime.agent returned turn.failed.');
  }
  return {
    sessionId,
    turnId,
    events,
    artifactTitle: artifact.payload.title || artifact.payload.artifactRef || artifact.payload.artifactId || 'untitled',
    terminalType: terminal?.type || 'unknown',
  };
}

function assertNoSecretLikeFields(value, descriptorToken) {
  const stack = [{ path: '$', value }];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const item = current.value;
    if (typeof item === 'string') {
      if (descriptorToken && item.includes(descriptorToken)) {
        throw new Error(`platform host live check result leaked bridge token at ${current.path}.`);
      }
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    if (Array.isArray(item)) {
      item.forEach((entry, index) => stack.push({ path: `${current.path}[${index}]`, value: entry }));
      continue;
    }
    for (const [key, entry] of Object.entries(item)) {
      if (/^(api[_-]?key|access[_-]?token|refresh[_-]?token|bearer[_-]?token|secret|password|credential|credentials|authorization|cookie)$/i.test(key)) {
        throw new Error(`platform host live check result contains secret-like field: ${current.path}.${key}`);
      }
      stack.push({ path: `${current.path}.${key}`, value: entry });
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const timeoutMs = Number(args['timeout-ms'] || process.env.CONTENT_STUDIO_PLATFORM_HOST_LIVE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const { descriptor, source, providerPreference, modelPreference } = await assertRequiredConfig({ args, env: process.env, timeoutMs });
  assertNoProductAppKeyEnv(process.env);

  const prompt = String(args.prompt || process.env.CONTENT_STUDIO_PLATFORM_HOST_LIVE_PROMPT || DEFAULT_PROMPT);
  const snapshotPayload = await postJson(descriptor, '/snapshot', {}, timeoutMs);
  const snapshot = snapshotPayload.snapshot;
  if (!snapshot || snapshot.appId !== 'content-studio') {
    throw new Error('platform host snapshot is missing or not bound to content-studio.');
  }

  const invokePayload = await postJson(descriptor, '/capability/invoke', {
    capability: 'lime.agent',
    operation: 'agentSession/turn/start',
    input: {
      agentAppId: 'content-studio',
      prompt,
      runtimeOptions: {
        capabilityId: 'content.draft.generate',
        providerPreference,
        modelPreference,
        modelId: modelPreference,
        permissionMode: 'ask',
      },
      modelPolicy: {
        preferredModelId: modelPreference,
        capability: 'agent',
      },
      metadata: {
        source: 'content-studio-platform-host-runtime-live-check',
        runtimeOwner: 'lime-desktop-platform',
      },
      businessObjectRef: {
        kind: 'promptDraft',
        id: 'platform-host-runtime-live-check',
        title: 'Platform host runtime live check',
      },
    },
  }, timeoutMs);
  const result = normalizeAgentResult(invokePayload.result?.output);
  assertNoSecretLikeFields({
    snapshot: {
      ...snapshot,
      accountEmail: undefined,
      tenantName: undefined,
    },
    result: {
      sessionId: result.sessionId,
      turnId: result.turnId,
      events: result.events,
      artifactTitle: result.artifactTitle,
      terminalType: result.terminalType,
    },
  }, descriptor.token);

  console.log([
    '[platform-host:runtime:live] ok',
    'mode=lime-desktop-platform',
    `source=${source}`,
    `host=${snapshot.hostKind}/${snapshot.hostVersion}`,
    `entry=${snapshot.entryKey}`,
    `provider=${providerPreference}`,
    `model=${modelPreference}`,
    `session=${result.sessionId}`,
    `turn=${result.turnId}`,
    `events=${Array.from(new Set(result.events.map((event) => event.type))).join(',')}`,
    `artifact=${result.artifactTitle}`,
    `terminal=${result.terminalType}`,
  ].join(' '));
}

main().catch((error) => {
  console.error(`[platform-host:runtime:live] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
