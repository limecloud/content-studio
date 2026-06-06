#!/usr/bin/env node

import { spawn } from 'node:child_process';
import process from 'node:process';

const backendPath = new URL('../resources/app-server/backend/content-backend.mjs', import.meta.url);
const DEFAULT_PROMPT = '请生成一段 80 字以内的 App Server 生产模型验收草稿。';
const DEFAULT_TIMEOUT_MS = 45_000;

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

function hasRealProviderConfig(env) {
  const echo = env.CONTENT_STUDIO_APP_SERVER_BACKEND_ECHO === '1';
  const key = env.CONTENT_STUDIO_TEXT_API_KEY ||
    env.OPENAI_API_KEY ||
    env.ANTHROPIC_API_KEY ||
    env.GEMINI_API_KEY ||
    env.GOOGLE_API_KEY;
  return !echo && Boolean(String(key || '').trim());
}

async function runBackend(input, timeoutMs) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [backendPath.pathname], {
      env: {
        ...process.env,
        CONTENT_STUDIO_APP_SERVER_BACKEND_ECHO: '',
      },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`backend live check timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(`${JSON.stringify(input)}\n`);
  });
}

function parseBackendResponse(stdout) {
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`backend returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function assertLiveResponse(result) {
  const payload = parseBackendResponse(result.stdout);
  const events = Array.isArray(payload.events) ? payload.events : [];
  const failure = events.find((event) => event?.type === 'turn.failed');
  if (failure) {
    throw new Error(failure.payload?.message || 'backend returned turn.failed');
  }
  if (result.code !== 0) {
    throw new Error(`backend exited with code ${result.code}: ${result.stderr.trim()}`);
  }
  const artifact = events.find((event) => event?.type === 'artifact.snapshot');
  const completed = events.find((event) => event?.type === 'turn.completed');
  if (!artifact?.payload?.content) {
    throw new Error('backend live check did not produce artifact.snapshot content');
  }
  if (!completed) {
    throw new Error('backend live check did not produce turn.completed');
  }
  return {
    protocol: artifact.payload.protocol || completed.payload?.protocol || process.env.CONTENT_STUDIO_TEXT_PROTOCOL || 'openai-chat',
    model: artifact.payload.model || completed.payload?.model || process.env.CONTENT_STUDIO_TEXT_MODEL || process.env.LLM_MODEL || 'unknown',
    artifactTitle: artifact.payload.title || artifact.payload.artifactId || 'untitled',
    summary: completed.payload?.summary || '',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!hasRealProviderConfig(process.env)) {
    throw new Error('missing real provider config: set CONTENT_STUDIO_TEXT_API_KEY or provider-specific API key; echo mode is not allowed');
  }
  const prompt = String(args.prompt || process.env.CONTENT_STUDIO_BACKEND_LIVE_PROMPT || DEFAULT_PROMPT);
  const timeoutMs = Number(args['timeout-ms'] || process.env.CONTENT_STUDIO_BACKEND_LIVE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const result = await runBackend({
    kind: 'turnStart',
    request: { input: { text: prompt } },
  }, timeoutMs);
  const summary = assertLiveResponse(result);
  console.log([
    '[app-server:backend:live] ok',
    `protocol=${summary.protocol}`,
    `model=${summary.model}`,
    `artifact=${summary.artifactTitle}`,
    `summary=${summary.summary}`,
  ].join(' '));
}

main().catch((error) => {
  console.error(`[app-server:backend:live] failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
