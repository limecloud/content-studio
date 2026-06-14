#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { app, safeStorage } from 'electron';

const DEFAULT_APP_SERVER_BIN = resolve('resources/app-server/current/app-server');

app.setName('content-studio');

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

function decryptSecret(value) {
  if (!value) return '';
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Electron safeStorage 不可用，无法迁移本地模型 key。');
  }
  return safeStorage.decryptString(Buffer.from(value, 'base64'));
}

async function readModelConfig() {
  const userData = argValue('--content-studio-user-data') || join(app.getPath('appData'), 'content-studio');
  const configPath = argValue('--model-config') || join(userData, 'model-config.json');
  const raw = JSON.parse(await readFile(configPath, 'utf-8'));
  const apiKey = decryptSecret(raw.textApiKeyEncrypted) || decryptSecret(raw.apiKeyEncrypted) || raw.textApiKeyPlain || raw.apiKeyPlain || '';
  if (!apiKey) throw new Error('本地模型配置没有可迁移的文本 API Key。');
  const endpoint = String(raw.textApiEndpoint || raw.apiEndpoint || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = String(raw.textModel || raw.textModels?.[0] || '').trim();
  if (!model) throw new Error('本地模型配置没有文本模型。');
  return { apiKey, endpoint, model };
}

function createRpcClient({ binaryPath, dataDir }) {
  const child = spawn(binaryPath, ['--stdio', '--backend', 'runtime', '--data-dir', dataDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
      TMPDIR: process.env.TMPDIR || '',
      ELECTRON_RUN_AS_NODE: '1',
    },
  });
  const pending = new Map();
  let nextId = 1;
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  createInterface({ input: child.stdout }).on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const { resolve: resolveRequest, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
    else resolveRequest(message.result);
  });
  child.once('exit', (code, signal) => {
    const error = new Error(`app-server exited: code=${code ?? 'null'} signal=${signal ?? 'null'} stderr=${stderr.trim()}`);
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  });
  return {
    request(method, params = {}, timeoutMs = 30_000) {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      return new Promise((resolveRequest, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms stderr=${stderr.trim()}`));
        }, timeoutMs);
        pending.set(id, {
          resolve: (value) => {
            clearTimeout(timer);
            resolveRequest(value);
          },
          reject: (error) => {
            clearTimeout(timer);
            reject(error);
          },
        });
      });
    },
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ method, params })}\n`);
    },
    close() {
      child.kill('SIGTERM');
    },
  };
}

async function main() {
  await app.whenReady();
  const binaryPath = argValue('--app-server-bin') || process.env.APP_SERVER_BIN || DEFAULT_APP_SERVER_BIN;
  const dataDir = argValue('--app-server-data-dir') || process.env.CONTENT_STUDIO_APP_SERVER_DATA_DIR || join(app.getPath('userData'), 'app-server');
  const config = await readModelConfig();
  const rpc = createRpcClient({ binaryPath, dataDir });
  try {
    await rpc.request('initialize', {
      clientInfo: { name: 'content-studio-provider-seed', version: '0.0.0' },
      capabilities: { experimentalApi: false, optOutNotificationMethods: [] },
    });
    rpc.notify('initialized');
    const listed = await rpc.request('modelProvider/list', {});
    const providers = Array.isArray(listed?.providers) ? listed.providers : [];
    const provider = providers.find((item) => item.id === 'openai') || providers.find((item) => item.type === 'openai');
    if (!provider?.id) throw new Error('App Server provider store 没有 openai provider。');
    await rpc.request('modelProvider/update', {
      providerId: provider.id,
      patch: {
        enabled: true,
        apiHost: config.endpoint,
        customModels: [config.model],
      },
    });
    await rpc.request('modelProviderKey/create', {
      providerId: provider.id,
      apiKey: config.apiKey,
      alias: 'Content Studio text model',
      replaceExisting: true,
    });
    const after = await rpc.request('modelProvider/list', {});
    const updated = (after.providers || []).find((item) => item.id === provider.id);
    console.log(JSON.stringify({
      ok: true,
      providerId: provider.id,
      endpoint: config.endpoint,
      model: config.model,
      apiKeyCount: updated?.api_key_count ?? 0,
    }, null, 2));
  } finally {
    rpc.close();
    app.quit();
  }
}

main().catch((error) => {
  console.error(`[seed-app-server-provider] failed: ${error instanceof Error ? error.message : String(error)}`);
  app.quit();
  process.exit(1);
});
