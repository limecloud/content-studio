import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { chmod, mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join } from 'node:path';
import { promisify } from 'node:util';

import { ArticleGenerationService } from '../../src/main/services/articleGenerationService.ts';
import { AgentPromptSessionStore } from '../../src/main/services/agentPromptSessionStore.ts';
import { AppServerPromptAgentService } from '../../src/main/services/appServerPromptAgentService.ts';
import { AppServerSidecarService } from '../../src/main/services/appServerSidecarService.ts';
import { AssetReviewStore } from '../../src/main/services/assetReviewStore.ts';
import { AutoUpdateService } from '../../src/main/services/autoUpdateService.ts';
import { BrandKnowledgeBaseStore } from '../../src/main/services/brandKnowledgeBaseStore.ts';
import { ContentBatchApplicationService } from '../../src/main/services/contentBatchApplicationService.ts';
import { ContentBatchStore } from '../../src/main/services/contentBatchStore.ts';
import { GenerationLogStore } from '../../src/main/services/generationLogStore.ts';
import { ImageProductionTaskStore } from '../../src/main/services/imageProductionTaskStore.ts';
import { ImageSkillGenerationService } from '../../src/main/services/imageSkillGenerationService.ts';
import { InputSourceStore } from '../../src/main/services/inputSourceStore.ts';
import { IpKnowledgeBaseStore } from '../../src/main/services/ipKnowledgeBaseStore.ts';
import { KnowledgeBaseStore } from '../../src/main/services/knowledgeBaseStore.ts';
import { MixPackageStore } from '../../src/main/services/mixPackageStore.ts';
import { OverlayCardStore } from '../../src/main/services/overlayCardStore.ts';
import { PlatformDraftStore } from '../../src/main/services/platformDraftStore.ts';
import { PromptPackService } from '../../src/main/services/promptPackService.ts';
import { PromptDraftStore } from '../../src/main/services/promptDraftStore.ts';
import { ReferenceReverseService } from '../../src/main/services/referenceReverseService.ts';
import { SceneLibraryStore } from '../../src/main/services/sceneLibraryStore.ts';
import { TextGenerationService, TextProviderBlockedError } from '../../src/main/services/textGenerationService.ts';
import { VideoWorkflowService } from '../../src/main/services/videoWorkflowService.ts';
import { ModelConfigStore } from '../../src/main/services/modelConfigStore.ts';
import { PlatformHostBridgeClient } from '../../src/main/services/platformHostBridgeClient.ts';
import { AgentKnowledgeContentExportService } from '../../src/main/services/agentKnowledgeContentExportService.ts';
import { BuguContentWorkspaceSyncAdapter } from '../../src/main/services/buguContentWorkspaceSyncAdapter.ts';
import { ContentKnowledgeMapApplicationService } from '../../src/main/services/contentKnowledgeMapApplicationService.ts';
import { buildContentKnowledgeMapDraft } from '../../src/main/services/contentKnowledgeMapBuilder.ts';
import { validateContentKnowledgeMapBuild } from '../../src/main/services/contentKnowledgeMapValidator.ts';
import { ContentKnowledgeMapBuildRunStore } from '../../src/main/services/contentKnowledgeMapBuildRunStore.ts';
import { ContentDraftChangeStore } from '../../src/main/services/contentDraftChangeStore.ts';
import { ContentKnowledgeMapStore } from '../../src/main/services/contentKnowledgeMapStore.ts';
import { ContentKnowledgeReleaseStore } from '../../src/main/services/contentKnowledgeReleaseStore.ts';
import { ContentMaterialFeedbackService } from '../../src/main/services/contentMaterialFeedbackService.ts';
import { checkContentProductionHandoff } from '../../src/main/services/contentProductionHandoffPolicy.ts';
import { ContentProductionHandoffService } from '../../src/main/services/contentProductionHandoffService.ts';
import { ContentProductionHandoffStore } from '../../src/main/services/contentProductionHandoffStore.ts';
import { ContentReviewTaskApplicationService } from '../../src/main/services/contentReviewTaskApplicationService.ts';
import { ContentReviewTaskStore } from '../../src/main/services/contentReviewTaskStore.ts';
import { ContentTeamKnowledgePromptDraftService } from '../../src/main/services/contentTeamKnowledgePromptDraftService.ts';
import { GenerationTaskService } from '../../src/main/services/generationTaskService.ts';
import { ContentWorkspaceSyncService } from '../../src/main/services/contentWorkspaceSyncService.ts';
import { buildPromptGroundingSummary } from '../../src/main/services/promptGroundingAssembler.ts';
import { getOemRuntimeConfig } from '../../src/main/services/oemRuntimeConfig.ts';
import { MediaProvider } from '../../src/main/providers/mediaProvider.ts';
import { formatImageTemplateInputs, formatImageTemplatePromptContext } from '../../src/shared/imageTemplates.ts';
import { isReusablePromptInputSource } from '../../src/shared/inputSourcePolicy.ts';
import { buildIntakeMaturitySummary } from '../../src/shared/intakeMaturity.ts';
import { buildManufacturingPlanProjection } from '../../src/shared/manufacturingPlan.ts';
import {
  buildOntologyV2BatchContractReport,
  projectContentBatchToOntologyV2,
  runOntologyV2HarnessCases,
} from '../../src/shared/ontologyV2.ts';
import { buildProductPlanProjection } from '../../src/shared/productPlanning.ts';
import { stripInternalTraceLinesFromPrompt } from '../../src/shared/promptTraceText.ts';
import { buildProductBriefPromptPlan, structureProductBriefSources } from '../../src/shared/productBrief.ts';
import { clusterUserFeedbackSources } from '../../src/shared/userFeedbackInsights.ts';
import { buildScenePromptGroupContent } from '../../src/shared/scenePromptComposer.ts';
import { buildContentSyncConflictMergeDraft } from '../../src/shared/contentSyncConflictMerge.ts';
import { planContentMatrixRows } from '../../src/shared/contentMatrixPlanning.ts';
import { buildContentReviewTasksFromMap } from '../../src/main/services/contentReviewTaskBuilder.ts';
import { buildAssetCoverageByReviewId } from '../../src/renderer/src/app/assetCoverage.ts';
import { planAgentAssetInputSourceRegistrations } from '../../src/renderer/src/app/agentAssetInputSources.ts';
import { createDevBridge } from '../../src/renderer/src/devContentStudioBridge.ts';
import { extractGeneratedAssetRefsFromLog, extractLocalRefsFromLog } from '../../src/renderer/src/app/formatters.ts';
import { projectAgentRuntimeReadModel } from '../../src/renderer/src/components/agent/agentRuntimeProjection.ts';
import { SkillManager } from '../../src/main/services/skillManager.ts';
import { buildBusinessAcceptanceReport, loadWorkspaceAcceptanceInput } from '../../scripts/v2-business-acceptance.mjs';
import { buildProviderCheckReport, hasProviderStrictFailure } from '../../scripts/v2-provider-check.mjs';
import { buildV2UxCopyAudit } from '../../scripts/v2-ux-copy-audit.mjs';
import { buildLimeAgentBoundaryAudit } from '../../scripts/lime-agent-boundary-audit.mjs';
import { verifyContentKnowledgeReleaseOnline } from '../../scripts/verify-content-knowledge-release-online.mjs';
import { verifyContentTeamSharingOnline } from '../../scripts/verify-content-team-sharing-online.mjs';
import { verifyContentOntologyV1Online } from '../../scripts/verify-content-ontology-v1-online.mjs';
import { validateContentOntologyV1Report } from '../../scripts/verify-content-ontology-v1-report.mjs';
import { verifyContentOntologyV1Readiness } from '../../scripts/verify-content-ontology-v1-readiness.mjs';

const execFileAsync = promisify(execFile);
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const TEST_VIDEO = Buffer.from('content-studio-test-video');
const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

async function withWorkspace(run) {
  const workspacePath = await mkdtemp(join(tmpdir(), 'content-studio-functional-'));
  try {
    await mkdir(workspacePath, { recursive: true });
    await run(workspacePath);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
}

async function withEnv(overrides, run) {
  const previous = new Map();
  for (const key of Object.keys(overrides)) {
    previous.set(key, process.env[key]);
    const value = overrides[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await run();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withPlatformRuntimeBridge(handler, run) {
  const token = `platform-token-${Date.now()}`;
  const requests = [];
  const defaultAppearance = {
    colorTheme: 'emerald',
    fontScale: 1,
    serifEnabled: false,
  };
  const snapshot = {
    hostKind: 'electron',
    hostVersion: '0.1.5-test',
    appId: 'content-studio',
    entryKey: 'workbench',
    locale: 'zh-CN',
    theme: 'system',
    appearance: defaultAppearance,
    workspacePath: 'platform-workspace',
    modelSettingsVersion: '1',
  };
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: { message: 'method not allowed' } }));
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: { message: 'unauthorized' } }));
      return;
    }
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', async () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ url: request.url, body });
      try {
        if (request.url === '/snapshot') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: true, snapshot }));
          return;
        }
        const result = await handler({ url: request.url, body, snapshot });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, result }));
      } catch (error) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          ok: false,
          error: { message: error instanceof Error ? error.message : String(error) },
        }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const descriptor = {
    protocol: 'lime.runtimeBridge',
    version: 1,
    endpoint: `http://127.0.0.1:${address.port}`,
    token,
    appId: 'content-studio',
    entryKey: 'workbench',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  try {
    return await withEnv({
      CONTENT_STUDIO_DISABLE_EMBEDDED_PLATFORM_HOST: '1',
      LIME_RUNTIME_BRIDGE: JSON.stringify(descriptor),
      LIME_HOST_SNAPSHOT: JSON.stringify(snapshot),
    }, () => run({ descriptor, snapshot, requests }));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function withPlatformRuntimeBridgeDiscovery(handler, run) {
  const discoveryToken = `platform-discovery-${Date.now()}`;
  const runtimeToken = `platform-runtime-${Date.now()}`;
  const requests = [];
  const defaultAppearance = {
    colorTheme: 'emerald',
    fontScale: 1,
    serifEnabled: false,
  };
  const snapshot = {
    hostKind: 'electron',
    hostVersion: '0.1.5-test',
    appId: 'content-studio',
    entryKey: 'default',
    locale: 'zh-CN',
    theme: 'system',
    appearance: defaultAppearance,
    workspacePath: 'platform-workspace',
    modelSettingsVersion: '9',
  };
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST') {
      response.writeHead(405, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ ok: false, error: { message: 'method not allowed' } }));
      return;
    }
    let raw = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', async () => {
      const body = raw ? JSON.parse(raw) : {};
      requests.push({ url: request.url, body });
      try {
        if (request.url === '/attach') {
          const runtimeAddress = server.address();
          assert.ok(runtimeAddress && typeof runtimeAddress !== 'string');
          assert.equal(request.headers.authorization, `Bearer ${discoveryToken}`);
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({
            ok: true,
            result: {
              protocol: 'lime.runtimeBridge',
              version: 1,
              endpoint: `http://127.0.0.1:${runtimeAddress.port}`,
              token: runtimeToken,
              appId: body.appId,
              entryKey: body.entryKey,
              expiresAt: new Date(Date.now() + 60_000).toISOString(),
            },
          }));
          return;
        }
        if (request.headers.authorization !== `Bearer ${runtimeToken}`) {
          response.writeHead(401, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: false, error: { message: 'unauthorized' } }));
          return;
        }
        if (request.url === '/snapshot') {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end(JSON.stringify({ ok: true, snapshot }));
          return;
        }
        const result = await handler({ url: request.url, body, snapshot });
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ ok: true, result }));
      } catch (error) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({
          ok: false,
          error: { message: error instanceof Error ? error.message : String(error) },
        }));
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const discoveryPath = join(await mkdtemp(join(tmpdir(), 'content-studio-platform-discovery-')), 'runtime-bridge-discovery.json');
  const discovery = {
    protocol: 'lime.runtimeBridge.discovery',
    version: 1,
    endpoint: `http://127.0.0.1:${address.port}`,
    token: discoveryToken,
    hostKind: 'electron',
    hostVersion: '0.1.5-test',
    publishedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  try {
    await writeFile(discoveryPath, JSON.stringify(discovery), 'utf8');
    return await withEnv({
      CONTENT_STUDIO_DISABLE_EMBEDDED_PLATFORM_HOST: '1',
      LIME_RUNTIME_BRIDGE: undefined,
      LIME_HOST_SNAPSHOT: undefined,
      LIME_DESKTOP_PLATFORM_BRIDGE_DISCOVERY_PATH: discoveryPath,
    }, () => run({ discovery, snapshot, requests }));
  } finally {
    await rm(dirname(discoveryPath), { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
}

async function collectAppServerAgentEvents(service, input) {
  const events = [];
  const taskId = await service.runAgent(input, (event) => events.push(event));
  await waitForAssertion(() => {
    assert.ok(events.some((event) => event.type === 'done' || event.type === 'error'));
  }, 3000);
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { taskId, events };
}

async function collectAppServerAgentEventsUntil(service, input, predicate, timeoutMs = 1000) {
  const events = [];
  const taskId = await service.runAgent(input, (event) => events.push(event));
  await waitForAssertion(() => {
    assert.ok(events.some(predicate));
  }, timeoutMs);
  return { taskId, events };
}

async function appServerSidecarAvailable() {
  const service = new AppServerSidecarService();
  return (await service.healthCheck()).available;
}

async function writeFakeAppServerBinary(targetPath, events) {
  await writeFile(targetPath, `#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write('Usage: app-server [--stdio] [--backend external|runtime|mock|unavailable] [--data-dir path]\\n');
  process.exit(0);
}

const capturePath = process.env.FAKE_APP_SERVER_CAPTURE_PATH;
if (!capturePath) {
  throw new Error('missing fake app-server capture path');
}
const configuredEvents = ${JSON.stringify(events)};
const eventsByCapability = Array.isArray(configuredEvents) ? { default: configuredEvents } : configuredEvents;
function readPreviousCaptures() {
  if (!existsSync(capturePath)) return {};
  try {
    return JSON.parse(readFileSync(capturePath, 'utf8'));
  } catch {
    return {};
  }
}
const previousCaptures = readPreviousCaptures();
const captures = {
  argv: process.argv.slice(2),
  env: {
    ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE || '',
    CONTENT_STUDIO_TEXT_API_KEY: process.env.CONTENT_STUDIO_TEXT_API_KEY || '',
    CONTENT_STUDIO_IMAGE_API_KEY: process.env.CONTENT_STUDIO_IMAGE_API_KEY || '',
    IMAGE_API_KEY: process.env.IMAGE_API_KEY || '',
    CONTENT_STUDIO_VIDEO_API_KEY: process.env.CONTENT_STUDIO_VIDEO_API_KEY || '',
    VIDEO_API_KEY: process.env.VIDEO_API_KEY || '',
    CONTENT_STUDIO_VISION_API_KEY: process.env.CONTENT_STUDIO_VISION_API_KEY || '',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || '',
    GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
    GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
    LLM_API_KEY: process.env.LLM_API_KEY || '',
    CONTENT_STUDIO_PRIVATE_TOKEN: process.env.CONTENT_STUDIO_PRIVATE_TOKEN || '',
    OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
    AZURE_OPENAI_API_KEY: process.env.AZURE_OPENAI_API_KEY || '',
    DASHSCOPE_API_KEY: process.env.DASHSCOPE_API_KEY || '',
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || '',
    GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || '',
    OPENAI_APIKEY: process.env.OPENAI_APIKEY || '',
    SESSION_COOKIE: process.env.SESSION_COOKIE || '',
    PROVIDER_SECRET: process.env.PROVIDER_SECRET || '',
    AUTHORIZATION: process.env.AUTHORIZATION || '',
    COOKIE: process.env.COOKIE || '',
    LIME_RUNTIME_BRIDGE: process.env.LIME_RUNTIME_BRIDGE || '',
  },
  initialize: null,
  sessionStart: null,
  turnStart: null,
  sessionStarts: Array.isArray(previousCaptures.sessionStarts) ? previousCaptures.sessionStarts : [],
  turnStarts: Array.isArray(previousCaptures.turnStarts) ? previousCaptures.turnStarts : [],
};
let lastTurnEvents = [];
let lastTurnArtifacts = [];

function eventsForCapability(capabilityId) {
  return eventsByCapability[capabilityId] || eventsByCapability.default || [];
}

function writeCapture() {
  writeFileSync(capturePath, JSON.stringify(captures, null, 2));
}

function respond(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}

const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);
  if (request.method === 'initialize') {
    captures.initialize = request.params;
    writeCapture();
    respond({
      id: request.id,
      result: {
        serverInfo: { name: 'fake-app-server', version: '0.0.0-test', protocolVersion: 'appserver.v0' },
      },
    });
    return;
  }
  if (request.method === 'initialized') return;
  if (request.method === 'modelProvider/list') {
    respond({ id: request.id, result: { providers: [] } });
    return;
  }
  if (request.method === 'agentSession/start') {
    captures.sessionStart = request.params;
    captures.sessionStarts.push(request.params);
    writeCapture();
    respond({
      id: request.id,
      result: {
        session: {
          sessionId: request.params.sessionId,
          threadId: request.params.threadId,
          appId: request.params.appId,
          workspaceId: request.params.workspaceId,
          status: 'idle',
        },
      },
    });
    return;
  }
  if (request.method === 'agentSession/turn/start') {
    captures.turnStart = request.params;
    captures.turnStarts.push(request.params);
    lastTurnEvents = eventsForCapability(request.params?.runtimeOptions?.capabilityId);
    lastTurnArtifacts = lastTurnEvents
      .filter((event) => event?.type === 'artifact.snapshot' && event.payload)
      .map((event) => event.payload);
    writeCapture();
    respond({
      id: request.id,
      result: {
        turn: {
          turnId: request.params.turnId,
          sessionId: request.params.sessionId,
          status: 'accepted',
        },
      },
    });
    for (const event of lastTurnEvents) {
      respond({ method: 'agentSession/event', params: { event } });
    }
    return;
  }
  if (request.method === 'agentSession/turn/cancel') {
    respond({ id: request.id, result: {} });
    return;
  }
  if (request.method === 'artifact/read') {
    respond({ id: request.id, result: { artifacts: lastTurnArtifacts } });
    return;
  }
  if (request.method === 'evidence/export') {
    respond({ id: request.id, result: { events: lastTurnEvents, artifacts: lastTurnArtifacts } });
    return;
  }
  respond({ id: request.id, result: {} });
});
`, 'utf8');
  await chmod(targetPath, 0o755);
}

async function writeFakeAppServerSmokeBinary(targetPath) {
  await writeFile(targetPath, `#!/usr/bin/env node
import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';

const capturePath = process.env.FAKE_APP_SERVER_CAPTURE_PATH;
if (!capturePath) {
  throw new Error('missing fake app-server capture path');
}
const capture = {
  argv: process.argv.slice(2),
  env: {
    ELECTRON_RUN_AS_NODE: process.env.ELECTRON_RUN_AS_NODE || '',
  },
  requests: [],
};

function writeCapture() {
  writeFileSync(capturePath, JSON.stringify(capture, null, 2));
}

function respond(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}

writeCapture();
const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);
  capture.requests.push({ id: request.id, method: request.method, params: request.params });
  writeCapture();
  if (request.method === 'initialize') {
    respond({
      id: request.id,
      result: {
        serverInfo: { name: 'fake-app-server', version: '0.0.0-test', protocolVersion: 'appserver.v0' },
      },
    });
    return;
  }
  if (request.method === 'initialized') return;
  if (request.method === 'capability/list') {
    respond({
      id: request.id,
      result: {
        capabilities: [{ id: 'content.draft.generate', title: 'Draft', methods: ['agentSession/turn/start'] }],
      },
    });
    return;
  }
  if (request.method === 'agentSession/start') {
    respond({
      id: request.id,
      result: {
        session: {
          sessionId: request.params.sessionId,
          threadId: request.params.threadId,
          appId: request.params.appId,
          workspaceId: request.params.workspaceId,
          status: 'idle',
        },
      },
    });
    return;
  }
  if (request.method === 'agentSession/turn/start') {
    respond({
      id: request.id,
      result: {
        turn: {
          turnId: request.params.turnId,
          sessionId: request.params.sessionId,
          status: 'accepted',
        },
      },
    });
    respond({
      method: 'agentSession/event',
      params: { event: { type: 'message.delta', payload: { text: 'packaged smoke message' } } },
    });
    respond({
      method: 'agentSession/event',
      params: {
        event: {
          type: 'artifact.snapshot',
          payload: {
            artifactId: 'content-studio-draft-smoke',
            artifactRef: 'content-studio-draft-smoke',
            title: 'Packaged Smoke Draft',
            kind: 'markdown',
          },
        },
      },
    });
    return;
  }
  if (request.method === 'artifact/read') {
    respond({
      id: request.id,
      result: {
        artifacts: [{ artifactRef: 'content-studio-draft-smoke', title: 'Packaged Smoke Draft', kind: 'markdown' }],
      },
    });
    return;
  }
  if (request.method === 'evidence/export') {
    respond({
      id: request.id,
      result: {
        events: [
          { type: 'message.delta', payload: { text: 'packaged smoke message' } },
          { type: 'artifact.snapshot', payload: { artifactRef: 'content-studio-draft-smoke' } },
        ],
        artifacts: [{ artifactRef: 'content-studio-draft-smoke', title: 'Packaged Smoke Draft', kind: 'markdown' }],
      },
    });
    return;
  }
  respond({ id: request.id, result: {} });
});
`, 'utf8');
  await chmod(targetPath, 0o755);
}

async function writeFakeRuntimeLiveAppServerBinary(targetPath, options = {}) {
  await writeFile(targetPath, `#!/usr/bin/env node
import { createInterface } from 'node:readline';

const supportsDataDir = ${JSON.stringify(options.supportsDataDir !== false)};
const supportsProviderStore = ${JSON.stringify(options.supportsProviderStore !== false)};
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(supportsDataDir
    ? 'Usage: app-server [--stdio] [--backend external|runtime|mock|unavailable] [--data-dir path]\\n'
    : 'Usage: app-server [--stdio] [--backend external|mock|unavailable]\\n');
  process.exit(0);
}
if (!supportsDataDir && args.some((arg) => arg === '--data-dir' || arg.startsWith('--data-dir='))) {
  process.stderr.write('Error: unknown argument: --data-dir\\n');
  process.exit(1);
}

function respond(message) {
  process.stdout.write(JSON.stringify(message) + '\\n');
}

const lines = createInterface({ input: process.stdin });
lines.on('line', (line) => {
  if (!line.trim()) return;
  const request = JSON.parse(line);
  if (request.method === 'initialized') return;
  if (request.method === 'initialize') {
    respond({
      id: request.id,
      result: {
        serverInfo: { name: 'fake-runtime-live-app-server', version: '0.0.0-test', protocolVersion: 'appserver.v0' },
        capabilities: { agentSession: true },
      },
    });
    return;
  }
  if (request.method === 'modelProvider/list') {
    if (!supportsProviderStore) {
      respond({ id: request.id, error: { code: -32601, message: 'method not found: modelProvider/list' } });
      return;
    }
    respond({ id: request.id, result: { providers: [] } });
    return;
  }
  if (request.method === 'agentSession/start') {
    respond({
      id: request.id,
      result: {
        session: {
          sessionId: request.params.sessionId,
          threadId: request.params.threadId,
          appId: request.params.appId,
          workspaceId: request.params.workspaceId,
          status: 'idle',
        },
      },
    });
    return;
  }
  if (request.method === 'agentSession/turn/start') {
    respond({
      id: request.id,
      error: { code: -32000, message: 'provider is not configured in provider store' },
    });
    return;
  }
  respond({ id: request.id, result: {} });
});
`, 'utf8');
  await chmod(targetPath, 0o755);
}

async function waitForAssertion(assertion, timeoutMs = 1000) {
  const startedAt = Date.now();
  let lastError;
  while (Date.now() - startedAt < timeoutMs) {
    try {
      return await assertion();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw lastError;
}

function createPublicPackageFetch(localBaseUrl, publicBaseUrl) {
  return (url, init = {}) => {
    const text = String(url);
    const mappedUrl = text.startsWith(publicBaseUrl)
      ? `${localBaseUrl}${text.slice(publicBaseUrl.length)}`
      : text;
    return fetch(mappedUrl, init);
  };
}

const LEGACY_AGENT_RUNTIME_SCAN_TARGETS = [
  'README.md',
  'package.json',
  'electron-builder.yml',
  'resources/app-server/README.md',
  'docs/roadmap/limeagent',
  'docs/roadmap/v2',
  'docs/roadmap/ontology/v2/client-capability-migration.md',
  'src/main',
  'src/preload',
  'src/shared',
  'src/renderer/src',
];

const LEGACY_AGENT_RUNTIME_FORBIDDEN_PATTERNS = [
  /@anthropic-ai\/claude-agent-sdk/i,
  /\bclaude-agent-sdk\b/i,
  /\bClaude SDK\b/i,
  /\bClaude SDK Agent\b/i,
  /\bClaude SDK runtime\b/i,
  /\bClaude Agent SDK\b/i,
  /\bclaudeSdk[A-Za-z0-9_]*/i,
  /\bclaudeAgent[A-Za-z0-9_]*/i,
  /\bclaudePrompt[A-Za-z0-9_]*/i,
  /\bPi\b/,
];

const LEGACY_AGENT_RUNTIME_TEXT_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

function shouldScanLegacyAgentRuntimeFile(relativePath) {
  return LEGACY_AGENT_RUNTIME_TEXT_EXTENSIONS.has(extname(relativePath).toLowerCase());
}

async function listFilesForLegacyAgentRuntimeScan(targets, root = process.cwd()) {
  const files = [];
  async function visit(relativePath) {
    const absolutePath = join(root, relativePath);
    let entries;
    try {
      entries = await readdir(absolutePath, { withFileTypes: true });
    } catch (error) {
      if (error?.code === 'ENOTDIR') {
        files.push(relativePath);
        return;
      }
      if (error?.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'out' || entry.name === 'dist') continue;
      const childPath = `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) {
        await visit(childPath);
      } else if (entry.isFile() && shouldScanLegacyAgentRuntimeFile(childPath)) {
        files.push(childPath);
      }
    }
  }

  for (const target of targets) {
    if (shouldScanLegacyAgentRuntimeFile(target)) files.push(target);
    else await visit(target);
  }
  return files;
}

test('当前主线禁止回流 Pi 或 Claude SDK Agent runtime', async () => {
  const files = await listFilesForLegacyAgentRuntimeScan(LEGACY_AGENT_RUNTIME_SCAN_TARGETS);
  const violations = [];

  for (const file of files) {
    const content = await readFile(file, 'utf8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of LEGACY_AGENT_RUNTIME_FORBIDDEN_PATTERNS) {
        if (!pattern.test(line)) continue;
        violations.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }

  assert.deepEqual(violations, []);
});

test('content-studio consumes App Server external backend sidecar', async () => {
  const service = new AppServerSidecarService();
  const health = await service.healthCheck();
  if (!health.available) {
    assert.equal(health.available, false);
    assert.equal(health.source, 'missing');
    assert.match(health.message ?? '', /APP_SERVER_BIN|app-server sidecar/);
    return;
  }

  assert.equal(health.available, true);
  assert.ok(['env', 'resources'].includes(health.source));
  const result = await service.runSmoke();
  assert.equal(result.ok, true, result.error);
  assert.equal(result.protocolVersion, 'appserver.v0');
  assert.ok(result.capabilityIds?.includes('content.draft.generate'));
  assert.ok(result.eventTypes?.includes('message.delta'));
  assert.ok(result.eventTypes?.includes('artifact.snapshot'));
  assert.ok(result.artifactRefs?.includes('content-studio-draft-smoke'));
  assert.ok((result.evidenceEventCount ?? 0) >= 2);
  assert.equal(result.evidenceArtifactCount, 1);
});

test('App Server binary resolver prefers packaged resources over APP_SERVER_BIN override', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-resolve-'));
  const binaryName = process.platform === 'win32' ? 'app-server.exe' : 'app-server';
  const resourcesDir = join(tempDir, 'resources');
  const currentDir = join(resourcesDir, 'current');
  const packagedBinary = join(currentDir, binaryName);
  const envBinary = join(tempDir, binaryName);
  try {
    await mkdir(currentDir, { recursive: true });
    await writeFile(packagedBinary, 'packaged app server');
    await writeFile(envBinary, 'env app server');
    if (process.platform !== 'win32') {
      await chmod(packagedBinary, 0o755);
      await chmod(envBinary, 0o755);
    }

    await withEnv({
      APP_SERVER_RESOURCES_DIR: resourcesDir,
      APP_SERVER_BIN: envBinary,
      CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
    }, async () => {
      const service = new AppServerSidecarService();
      const health = await service.healthCheck();
      assert.equal(health.available, true);
      assert.equal(health.binaryPath, packagedBinary);
      assert.equal(health.source, 'resources');
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('App Server smoke uses Node mode for packaged Electron backend command', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-smoke-env-'));
  const appServerPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
  const capturePath = join(tempDir, 'smoke-capture.json');
  try {
    await writeFakeAppServerSmokeBinary(appServerPath);

    await withEnv({
      APP_SERVER_RESOURCES_DIR: undefined,
      CONTENT_STUDIO_RESOURCES_DIR: undefined,
      APP_SERVER_BIN: appServerPath,
      CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
      FAKE_APP_SERVER_CAPTURE_PATH: capturePath,
    }, async () => {
      const service = new AppServerSidecarService();
      const result = await service.runSmoke();
      assert.equal(result.ok, true, result.error);
      assert.equal(result.binaryPath, appServerPath);
      assert.equal(result.source, 'env');
      assert.ok(result.capabilityIds?.includes('content.draft.generate'));
      assert.ok(result.eventTypes?.includes('message.delta'));
      assert.ok(result.eventTypes?.includes('artifact.snapshot'));

      const captured = JSON.parse(await readFile(capturePath, 'utf8'));
      assert.equal(captured.env.ELECTRON_RUN_AS_NODE, '1');
      assert.ok(captured.argv.includes('--backend-command'));
      assert.ok(captured.argv.includes(process.execPath));
      assert.ok(captured.argv.includes('--backend-arg'));
      assert.ok(captured.argv.some((arg) => /query-loop-backend\.mjs$/.test(arg)));
    });
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('App Server agent path uses packaged backend and reports text model unavailable', async () => {
  if (!await appServerSidecarAvailable()) return;

  await withWorkspace(async (workspacePath) => {
    await withEnv({
      CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND: undefined,
      CONTENT_STUDIO_APP_SERVER_BACKEND_ARGS: undefined,
      CONTENT_STUDIO_APP_SERVER_BACKEND_ECHO: undefined,
      CONTENT_STUDIO_TEXT_API_KEY: undefined,
      OPENAI_API_KEY: undefined,
      ANTHROPIC_API_KEY: undefined,
      GEMINI_API_KEY: undefined,
      GOOGLE_API_KEY: undefined,
    }, async () => {
      const service = new AppServerSidecarService();
      const { taskId, events } = await collectAppServerAgentEvents(service, {
        prompt: '写一篇内容草稿',
        workspacePath,
        permissionMode: 'ask',
        selectedSkillSlugs: ['draft'],
      });

      assert.ok(taskId);
      assert.ok(events.some((event) =>
        event.type === 'error' && /文字模型未配置/.test(event.message)
      ));
      assert.equal(events.some((event) => event.type === 'done'), false);
      assert.equal(service.cancelAgent(taskId), false);
    });
  });
});

test('App Server agent path uses packaged backend for draft artifact projection', async () => {
  if (!await appServerSidecarAvailable()) return;

  await withWorkspace(async (workspacePath) => {
    await withEnv({
      CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND: undefined,
      CONTENT_STUDIO_APP_SERVER_BACKEND_ARGS: undefined,
      CONTENT_STUDIO_APP_SERVER_BACKEND_ECHO: '1',
    }, async () => {
      const service = new AppServerSidecarService();
      const { taskId, events } = await collectAppServerAgentEvents(service, {
        prompt: '基于新品卖点写一篇公众号草稿',
        workspacePath,
        permissionMode: 'ask',
        selectedSkillSlugs: ['draft', 'brand-voice'],
      });

      assert.ok(taskId);
      assert.ok(events.some((event) =>
        event.type === 'assistant' && event.text.includes('基于新品卖点写一篇公众号草稿')
      ));
      assert.ok(events.some((event) =>
        event.type === 'result' && event.summary === 'Content Studio Draft'
      ));
      assert.ok(events.some((event) => event.type === 'result' && event.summary === 'App Server 内容草稿'));
      assert.ok(events.some((event) => event.type === 'done'));
      assert.equal(events.some((event) => event.type === 'error'), false);
      assert.equal(service.cancelAgent(taskId), false);
    });
  });
});

test('App Server agent path maps external backend events to AgentEvent', async () => {
  if (!await appServerSidecarAvailable()) return;

  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-agent-success-'));
    const backendPath = join(tempDir, 'agent-backend.mjs');
    const capturePath = join(tempDir, 'turn-start.json');
    try {
      await writeFile(backendPath, `#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.kind === 'turnStart') {
  writeFileSync(process.argv[2], JSON.stringify(input.request, null, 2));
  console.log(JSON.stringify({
    events: [
      { type: 'message.delta', payload: { text: 'App Server 生成内容片段' } },
      {
        type: 'artifact.snapshot',
        payload: {
          artifactId: 'agent-draft-artifact',
          title: 'Agent Draft Artifact',
          kind: 'markdown',
          content: '# Draft'
        }
      },
      { type: 'turn.completed', payload: { summary: 'Agent Draft Artifact' } }
    ]
  }));
  process.exit(0);
}
if (input.kind === 'turnCancel') {
  console.log(JSON.stringify({ events: [{ type: 'turn.canceled', payload: { ok: true } }] }));
  process.exit(0);
}
console.log(JSON.stringify({ events: [] }));
`);
      await withEnv({
        CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND: process.execPath,
        CONTENT_STUDIO_APP_SERVER_BACKEND_ARGS: JSON.stringify([backendPath, capturePath]),
      }, async () => {
        const service = new AppServerSidecarService();
        const { taskId, events } = await collectAppServerAgentEvents(service, {
          prompt: '基于新品卖点写一篇公众号草稿',
          workspacePath,
          permissionMode: 'ask',
          selectedSkillSlugs: ['draft', 'brand-voice'],
        });

        assert.ok(taskId);
        assert.ok(events.some((event) => event.type === 'status' && /App Server/.test(event.message)));
        assert.ok(events.some((event) =>
          event.type === 'assistant' && event.text.includes('App Server 生成内容片段')
        ));
        assert.ok(events.some((event) =>
          event.type === 'result' && event.summary === 'Agent Draft Artifact'
        ));
        assert.ok(events.some((event) => event.type === 'done'));
        assert.equal(events.some((event) => event.type === 'error'), false);
        assert.equal(service.cancelAgent(taskId), false);

        const captured = JSON.parse(await readFile(capturePath, 'utf8'));
        assert.equal(captured.input.text, '基于新品卖点写一篇公众号草稿');
        assert.equal(captured.runtimeOptions.capabilityId, 'content.draft.generate');
        assert.equal(captured.runtimeOptions.stream, true);
        assert.deepEqual(captured.runtimeOptions.metadata.selectedSkillSlugs, ['draft', 'brand-voice']);
        assert.equal(captured.runtimeOptions.metadata.permissionMode, 'ask');
        assert.equal(captured.queueIfBusy, true);
        assert.equal(captured.skipPreSubmitResume, true);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('App Server JSON-RPC client sends business object refs and treats backend failed events as terminal', async () => {
  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-json-rpc-'));
    const appServerPath = join(tempDir, 'app-server');
    const capturePath = join(tempDir, 'capture.json');
    try {
      await writeFakeAppServerBinary(appServerPath, [
        { type: 'tool.started', payload: { toolName: 'content.fetch' } },
        {
          type: 'action.required',
          payload: {
            actionId: 'action-json-rpc-1',
            actionKind: 'add-input-source',
            targetModule: 'knowledge-inputs',
            message: '需要补充输入源',
          },
        },
        {
          type: 'evidence.changed',
          payload: {
            evidenceRefs: ['evidence-json-rpc-1'],
            summary: '已记录运行证据',
          },
        },
        { type: 'tool.failed', payload: { message: 'backend tool failed for test' } },
      ]);

      await withEnv({
        APP_SERVER_RESOURCES_DIR: undefined,
        CONTENT_STUDIO_RESOURCES_DIR: undefined,
        APP_SERVER_BIN: appServerPath,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND: process.execPath,
        CONTENT_STUDIO_APP_SERVER_BACKEND_ARGS: JSON.stringify([capturePath]),
        CONTENT_STUDIO_APP_SERVER_AGENT_TIMEOUT_MS: '1000',
        FAKE_APP_SERVER_CAPTURE_PATH: capturePath,
      }, async () => {
        const service = new AppServerSidecarService();
        const { taskId, events } = await collectAppServerAgentEvents(service, {
          prompt: '验证 App Server JSON-RPC 路径',
          workspacePath,
          permissionMode: 'ask',
          selectedSkillSlugs: ['draft'],
          businessObjectRef: {
            kind: 'promptDraft',
            id: 'draft-json-rpc-1',
            title: 'JSON-RPC Prompt 草稿',
            metadata: { source: 'functional-test' },
          },
        });

        assert.ok(taskId);
        assert.ok(events.some((event) => event.type === 'tool' && event.name === 'tool.started'));
        assert.ok(events.some((event) =>
          event.type === 'action' &&
          event.actionId === 'action-json-rpc-1' &&
          event.actionKind === 'add-input-source' &&
          event.targetModule === 'knowledge-inputs' &&
          /补充输入源/.test(event.message)
        ));
        assert.ok(events.some((event) =>
          event.type === 'evidence' &&
          event.evidenceRefs?.includes('evidence-json-rpc-1') &&
          event.summary === '已记录运行证据'
        ));
        assert.ok(events.some((event) =>
          event.type === 'error' && /backend tool failed for test/.test(event.message)
        ));
        assert.equal(events.some((event) => event.type === 'done'), false);

        const captured = JSON.parse(await readFile(capturePath, 'utf8'));
        assert.equal(captured.initialize.clientInfo.name, 'content_studio');
        assert.equal(captured.initialize.clientInfo.title, 'Content Studio');
        assert.equal(captured.initialize.capabilities.experimentalApi, false);
        assert.deepEqual(captured.initialize.capabilities.optOutNotificationMethods, []);
        assert.deepEqual(captured.sessionStart.businessObjectRef, {
          kind: 'promptDraft',
          id: 'draft-json-rpc-1',
          title: 'JSON-RPC Prompt 草稿',
          metadata: { source: 'functional-test' },
        });
        assert.equal(captured.turnStart.input.text, '验证 App Server JSON-RPC 路径');
        assert.equal(captured.turnStart.runtimeOptions.capabilityId, 'content.draft.generate');
        assert.equal(captured.turnStart.runtimeOptions.stream, true);
        assert.deepEqual(captured.turnStart.runtimeOptions.metadata.selectedSkillSlugs, ['draft']);
        assert.equal(captured.turnStart.runtimeOptions.metadata.permissionMode, 'ask');
        assert.equal(captured.turnStart.queueIfBusy, true);
        assert.equal(captured.turnStart.skipPreSubmitResume, true);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('App Server agent path can cancel delayed external backend without fake completion', async () => {
  if (!await appServerSidecarAvailable()) return;

  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-agent-cancel-'));
    const backendPath = join(tempDir, 'slow-agent-backend.mjs');
    try {
      await writeFile(backendPath, `#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.kind === 'turnStart') {
  await new Promise((resolve) => setTimeout(resolve, 200));
  console.log(JSON.stringify({
    events: [
      { type: 'message.delta', payload: { text: '延迟生成内容片段' } },
      { type: 'turn.completed', payload: { summary: '延迟任务完成' } }
    ]
  }));
  process.exit(0);
}
if (input.kind === 'turnCancel') {
  console.log(JSON.stringify({ events: [{ type: 'turn.canceled', payload: { ok: true } }] }));
  process.exit(0);
}
console.log(JSON.stringify({ events: [] }));
`);
      await withEnv({
        CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND: process.execPath,
        CONTENT_STUDIO_APP_SERVER_BACKEND_ARGS: JSON.stringify([backendPath]),
      }, async () => {
        const service = new AppServerSidecarService();
        const { taskId, events } = await collectAppServerAgentEventsUntil(service, {
          prompt: '生成一个较慢的内容草稿',
          workspacePath,
          permissionMode: 'ask',
          selectedSkillSlugs: ['draft'],
        }, (event) => event.type === 'status' && /正在通过 App Server/.test(event.message), 1000);

        assert.equal(service.cancelAgent(taskId), true);
        await new Promise((resolve) => setTimeout(resolve, 350));
        assert.equal(events.some((event) => event.type === 'done'), false);
        assert.equal(events.some((event) => event.type === 'assistant' && /延迟生成/.test(event.text)), false);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('App Server agent path surfaces backend stderr crash as error', async () => {
  if (!await appServerSidecarAvailable()) return;

  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-agent-crash-'));
    const backendPath = join(tempDir, 'crash-agent-backend.mjs');
    try {
      await writeFile(backendPath, `#!/usr/bin/env node
console.error('content backend crashed for test');
process.exit(7);
`);
      await withEnv({
        CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND: process.execPath,
        CONTENT_STUDIO_APP_SERVER_BACKEND_ARGS: JSON.stringify([backendPath]),
      }, async () => {
        const service = new AppServerSidecarService();
        const { taskId, events } = await collectAppServerAgentEvents(service, {
          prompt: '触发 backend crash',
          workspacePath,
          permissionMode: 'ask',
          selectedSkillSlugs: ['draft'],
        });

        assert.ok(taskId);
        assert.ok(events.some((event) =>
          event.type === 'error' &&
          /external app-server backend exited/.test(event.message) &&
          /content backend crashed for test/.test(event.message)
        ));
        assert.equal(events.some((event) => event.type === 'done'), false);
        assert.equal(service.cancelAgent(taskId), false);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('App Server agent path recovers on next task after backend crash', async () => {
  if (!await appServerSidecarAvailable()) return;

  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-app-server-agent-recover-'));
    const backendPath = join(tempDir, 'recover-agent-backend.mjs');
    const counterPath = join(tempDir, 'counter.txt');
    try {
      await writeFile(backendPath, `#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const counterPath = process.argv[2];
const count = existsSync(counterPath) ? Number(readFileSync(counterPath, 'utf8')) : 0;
writeFileSync(counterPath, String(count + 1));
if (input.kind === 'turnStart' && count === 0) {
  console.error('first backend invocation crashed');
  process.exit(9);
}
if (input.kind === 'turnStart') {
  console.log(JSON.stringify({
    events: [
      { type: 'message.delta', payload: { text: '恢复后的内容片段' } },
      { type: 'artifact.snapshot', payload: { artifactId: 'recover-draft', title: 'Recover Draft', kind: 'markdown', content: '# Recover' } },
      { type: 'turn.completed', payload: { summary: 'Recover Draft' } }
    ]
  }));
  process.exit(0);
}
console.log(JSON.stringify({ events: [] }));
`);
      await withEnv({
        CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND: process.execPath,
        CONTENT_STUDIO_APP_SERVER_BACKEND_ARGS: JSON.stringify([backendPath, counterPath]),
      }, async () => {
        const service = new AppServerSidecarService();
        const first = await collectAppServerAgentEvents(service, {
          prompt: '第一次触发 crash',
          workspacePath,
          permissionMode: 'ask',
          selectedSkillSlugs: ['draft'],
        });
        assert.ok(first.events.some((event) => event.type === 'error' && /first backend invocation crashed/.test(event.message)));
        assert.equal(first.events.some((event) => event.type === 'done'), false);

        const second = await collectAppServerAgentEvents(service, {
          prompt: '第二次应恢复',
          workspacePath,
          permissionMode: 'ask',
          selectedSkillSlugs: ['draft'],
        });
        assert.ok(second.events.some((event) => event.type === 'assistant' && /恢复后的内容片段/.test(event.text)));
        assert.ok(second.events.some((event) => event.type === 'result' && event.summary === 'Recover Draft'));
        assert.ok(second.events.some((event) => event.type === 'done'));
        assert.equal(second.events.some((event) => event.type === 'error'), false);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('后台图片生成任务会绑定 SOP 镜头日志并推进测试/批量状态', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const imageProductionTasks = new ImageProductionTaskStore();
    const task = await imageProductionTasks.create({
      workspacePath,
      title: 'SOP 后台生图任务',
      sourceSummary: '产品特写后进入多人使用场景。',
      consistencyRules: ['产品包装和比例保持一致'],
      negativeConstraints: ['不生成医疗化承诺'],
      shotPrompts: [
        { title: '镜头 01', scene: '产品特写', prompt: '早餐桌产品特写', status: 'ready' },
      ],
    });
    const shot = task.shotPrompts[0];
    const media = {
      async generateImage(input, options = {}) {
        const assetPath = join(workspacePath, `${input.generationStage}-result.png`);
        await writeFile(assetPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
        await logs.update(input.workspacePath, options.logId, {
          status: 'succeeded',
          title: '图片生成完成',
          summary: '图片生成完成。',
          output: { assetRefs: [assetPath] },
          artifactRefs: [assetPath],
          durationMs: 1,
        });
        return { logId: options.logId, status: 'succeeded', message: 'ok', assetRefs: [assetPath] };
      },
      async generateVideo() {
        throw new Error('本测试不应调用视频生成。');
      },
    };
    const service = new GenerationTaskService(
      logs,
      media,
      {},
      {},
      {},
      {},
      {},
      imageProductionTasks,
    );

    const testRecord = await service.submit({
      kind: 'image',
      input: {
        workspacePath,
        productionTaskId: task.id,
        shotPromptId: shot.id,
        generationStage: 'test',
        productImageRefs: [],
        referenceImageRefs: [],
        prompt: shot.prompt,
        negativeConstraints: task.negativeConstraints,
        consistencyRules: task.consistencyRules,
        promptMode: 'free',
        generationMode: 'smart',
        template: '自由模式',
        watermark: false,
        citations: [],
        selectedSkillSlugs: [],
        params: { textModel: 'fake', imageModel: 'fake-image', videoModel: 'fake-video', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      },
    });
    const testingTask = (await imageProductionTasks.list(workspacePath))[0];
    assert.equal(testingTask.shotPrompts[0].status, 'testing');
    assert.deepEqual(testingTask.shotPrompts[0].testLogIds, [testRecord.logId]);

    await waitForAssertion(async () => {
      const [storedTask] = await imageProductionTasks.list(workspacePath);
      assert.equal(storedTask.shotPrompts[0].status, 'test-review');
      const storedLog = await logs.get(workspacePath, testRecord.logId);
      assert.equal(storedLog?.status, 'succeeded');
      assert.equal(service.list(workspacePath).find((item) => item.logId === testRecord.logId)?.status, 'succeeded');
    });

    const testApproved = await imageProductionTasks.updateShot({
      workspacePath,
      taskId: task.id,
      shotPromptId: shot.id,
      patch: { status: 'test-approved' },
    });
    const batchRecord = await service.submit({
      kind: 'image',
      input: {
        workspacePath,
        productionTaskId: task.id,
        shotPromptId: shot.id,
        generationStage: 'batch',
        productImageRefs: [],
        referenceImageRefs: [],
        prompt: testApproved.shotPrompts[0].prompt,
        negativeConstraints: task.negativeConstraints,
        consistencyRules: task.consistencyRules,
        promptMode: 'free',
        generationMode: 'smart',
        template: '自由模式',
        watermark: false,
        citations: [],
        selectedSkillSlugs: [],
        params: { textModel: 'fake', imageModel: 'fake-image', videoModel: 'fake-video', runMode: 'batch', count: 2, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      },
    });
    const batchingTask = (await imageProductionTasks.list(workspacePath))[0];
    assert.equal(batchingTask.shotPrompts[0].status, 'batching');
    assert.deepEqual(batchingTask.shotPrompts[0].batchLogIds, [batchRecord.logId]);

    await waitForAssertion(async () => {
      const [storedTask] = await imageProductionTasks.list(workspacePath);
      assert.equal(storedTask.shotPrompts[0].status, 'batch-review');
      const storedLog = await logs.get(workspacePath, batchRecord.logId);
      assert.equal(storedLog?.status, 'succeeded');
    });
  });
});

test('后台图片生成任务会把 SOP 镜头同步到待配置和回炉状态', async () => {
  await withWorkspace(async (workspacePath) => {
    const submitImageTask = async ({ finalStatus, error }) => {
      const logs = new GenerationLogStore();
      const imageProductionTasks = new ImageProductionTaskStore();
      const task = await imageProductionTasks.create({
        workspacePath,
        title: `SOP ${finalStatus} 生图任务`,
        sourceSummary: '产品特写。',
        shotPrompts: [
          { title: '镜头 01', scene: '产品特写', prompt: '产品特写', status: 'ready' },
        ],
      });
      const shot = task.shotPrompts[0];
      const media = {
        async generateImage(input, options = {}) {
          await logs.update(input.workspacePath, options.logId, {
            status: finalStatus,
            title: finalStatus === 'blocked' ? '图片生成待配置' : '图片生成失败',
            summary: finalStatus === 'blocked' ? '图片生成服务未配置。' : '图片生成服务失败。',
            output: { assetRefs: [] },
            artifactRefs: [],
            error,
            durationMs: 1,
          });
          return { logId: options.logId, status: finalStatus, message: error, assetRefs: [] };
        },
        async generateVideo() {
          throw new Error('本测试不应调用视频生成。');
        },
      };
      const service = new GenerationTaskService(logs, media, {}, {}, {}, {}, {}, imageProductionTasks);
      const record = await service.submit({
        kind: 'image',
        input: {
          workspacePath,
          productionTaskId: task.id,
          shotPromptId: shot.id,
          generationStage: 'test',
          productImageRefs: [],
          referenceImageRefs: [],
          prompt: shot.prompt,
          promptMode: 'free',
          generationMode: 'smart',
          template: '自由模式',
          watermark: false,
          citations: [],
          selectedSkillSlugs: [],
          params: { textModel: 'fake', imageModel: 'fake-image', videoModel: 'fake-video', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
        },
      });
      await waitForAssertion(async () => {
        const storedTask = (await imageProductionTasks.list(workspacePath)).find((item) => item.id === task.id);
        const storedLog = await logs.get(workspacePath, record.logId);
        assert.equal(storedLog?.status, finalStatus);
        assert.equal(storedLog?.output.assetRefs.length, 0);
        assert.equal(storedTask?.shotPrompts[0].testLogIds[0], record.logId);
        assert.equal(service.list(workspacePath).find((item) => item.logId === record.logId)?.status, finalStatus);
      });
      const storedTask = (await imageProductionTasks.list(workspacePath)).find((item) => item.id === task.id);
      assert.ok(storedTask);
      return storedTask;
    };

    const blockedTask = await submitImageTask({
      finalStatus: 'blocked',
      error: 'IMAGE_PROVIDER_NOT_CONFIGURED',
    });
    assert.equal(blockedTask.status, 'blocked');
    assert.equal(blockedTask.shotPrompts[0].status, 'blocked');

    const failedTask = await submitImageTask({
      finalStatus: 'failed',
      error: 'IMAGE_PROVIDER_FAILED',
    });
    assert.equal(failedTask.status, 'needs-rework');
    assert.equal(failedTask.shotPrompts[0].status, 'needs-rework');
  });
});

test('图片生产任务 Store 可以持久化镜头、测试/批量日志和状态门', async () => {
  await withWorkspace(async (workspacePath) => {
    const store = new ImageProductionTaskStore();
    const task = await store.create({
      workspacePath,
      title: 'SOP 生图任务',
      sourceSummary: '镜头 1：产品特写\n镜头 2：人物手持产品',
      productImageRefs: ['/tmp/product.png'],
      referenceImageRefs: ['/tmp/ref.png'],
      consistencyRules: ['产品外观一致'],
      negativeConstraints: ['不夸大'],
      shotPrompts: [
        { title: '镜头 01', scene: '产品特写', prompt: '产品特写', status: 'ready' },
        { title: '镜头 02', scene: '人物手持', prompt: '人物手持产品', status: 'ready' },
      ],
    });
    assert.equal(task.shotPrompts.length, 2);
    assert.equal(task.status, 'draft');
    const first = task.shotPrompts[0];

    const testing = await store.appendGenerationLog({
      workspacePath,
      taskId: task.id,
      shotPromptId: first.id,
      generationStage: 'test',
      logId: 'log-test',
    });
    assert.equal(testing.status, 'testing');
    assert.equal(testing.shotPrompts[0].status, 'testing');
    assert.deepEqual(testing.shotPrompts[0].testLogIds, ['log-test']);

    const reviewed = await store.updateShot({
      workspacePath,
      taskId: task.id,
      shotPromptId: first.id,
      patch: { status: 'test-approved' },
    });
    assert.equal(reviewed.status, 'test-approved');

    const batching = await store.appendGenerationLog({
      workspacePath,
      taskId: task.id,
      shotPromptId: first.id,
      generationStage: 'batch',
      logId: 'log-batch',
    });
    assert.equal(batching.status, 'batching');
    assert.equal(batching.shotPrompts[0].status, 'batching');
    assert.deepEqual(batching.shotPrompts[0].batchLogIds, ['log-batch']);

    await assert.rejects(() => store.updateShot({
      workspacePath,
      taskId: task.id,
      shotPromptId: 'missing-shot',
      patch: { status: 'ready' },
    }), /不存在镜头/);

    await assert.rejects(() => store.appendGenerationLog({
      workspacePath,
      taskId: task.id,
      shotPromptId: 'missing-shot',
      generationStage: 'test',
      logId: 'lost-log',
    }), /不存在镜头/);

    const reloaded = new ImageProductionTaskStore();
    const list = await reloaded.list(workspacePath);
    assert.equal(list[0].id, task.id);
    assert.equal(list[0].shotPrompts[0].batchLogIds[0], 'log-batch');
  });
});

test('skill 安装包支持根目录直接包含 SKILL.md', async () => {
  await withWorkspace(async (workspacePath) => {
    const packagePath = join(workspacePath, 'flat-skill.skill');
    await writeFile(packagePath, createStoredZip([
      {
        name: 'SKILL.md',
        data: [
          '---',
          'name: Flat Skill',
          'description: 根目录直接包含 SKILL.md 的安装包。',
          '---',
          '',
          '# Flat Skill',
          '',
          '用于验证平铺安装包兼容。',
          '',
        ].join('\n'),
      },
      {
        name: 'references/example.md',
        data: '# Example\n',
      },
      {
        name: '__MACOSX/._SKILL.md',
        data: '',
      },
    ]));

    const manager = new SkillManager();
    const preview = await manager.previewPackage(packagePath, workspacePath);
    assert.equal(preview.slug, 'flat-skill');
    assert.equal(preview.rootDir, '');
    assert.equal(preview.selectedPath, 'SKILL.md');
    assert.equal(await manager.readPackageFile(packagePath, 'references/example.md'), '# Example\n');

    const result = await manager.installPackage(packagePath, workspacePath);
    assert.equal(result.skill.slug, 'flat-skill');
    assert.equal(result.skill.metadata.name, 'Flat Skill');
    assert.ok(existsSync(join(workspacePath, '.bugu', 'skills', 'flat-skill', 'SKILL.md')));
    assert.ok(existsSync(join(workspacePath, '.bugu', 'skills', 'flat-skill', 'references', 'example.md')));
  });
});

test('Bugu 团队同步适配器不发送本机路径并能解析服务端 revision', async () => {
  await withWorkspace(async (workspacePath) => {
    const archivePath = join(workspacePath, 'release.zip');
    await writeFile(archivePath, Buffer.from('agentknowledge package'));
    const requests = [];
    const adapter = new BuguContentWorkspaceSyncAdapter({
      apiBaseUrl: 'https://api.bugu.run',
      tenantId: 'tenant-test',
      tokenProvider: async () => 'dev-secret',
      fetchImpl: async (url, init) => {
        const body = init.body ? JSON.parse(init.body) : undefined;
        requests.push({ url: String(url), headers: init.headers, body });
        assert.equal(String(init.headers.get('Authorization')), 'Bearer dev-secret');
        assert.doesNotMatch(JSON.stringify(body || {}), /\/Users\/|\/tmp\/content-studio-functional/);
        if (String(url).includes('/content-knowledge-maps?')) {
          const requestUrl = new URL(String(url));
          assert.equal(requestUrl.searchParams.get('workspaceId'), 'workspace-server-1');
          assert.equal(requestUrl.searchParams.get('limit'), '100');
          return new Response(JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              revision: '21',
              items: [{
                id: 'map-server-1',
                workspaceId: 'workspace-server-1',
                title: '团队通勤防晒内容地图',
                status: 'ready',
                model: 'team-model',
                sourceInputSourceIds: ['input-server-1'],
                brandKnowledgeBaseIds: ['brand-server-1'],
                sceneCardIds: ['scene-server-1'],
                promptDraftIds: ['prompt-server-1'],
                readyPercent: 91,
                evidenceCount: 1,
                gapCount: 0,
                coverage: {
                  inputSourceCount: 1,
                  brandKnowledgeBaseCount: 1,
                  sceneCardCount: 1,
                  promptDraftCount: 1,
                  evidenceCount: 1,
                  gapCount: 0,
                  readyPercent: 91,
                },
                snapshot: {
                  sellingPoints: [{
                    id: 'selling-server-1',
                    title: '团队清爽补涂',
                    summary: '团队事实源中的卖点。',
                    tags: ['团队'],
                    sourceRefs: ['input-source:input-server-1'],
                    evidenceRefs: ['evidence-server-1'],
                    confidence: 91,
                    status: 'ready',
                    materialStatus: 'approved',
                    performanceTags: ['高转化'],
                  }],
                  painPoints: [],
                  scenarios: [],
                  evidence: [{
                    id: 'evidence-server-1',
                    sourceType: 'input-source',
                    sourceId: 'input-server-1',
                    sourceTitle: '团队 brief',
                    claim: '清爽补涂',
                    excerpt: '团队资料确认清爽补涂。',
                    status: 'ready',
                  }],
                  constraints: ['不能绝对化表达'],
                  gaps: [],
                  updatedAt: '2026-05-28T00:05:00.000Z',
                },
                serverRevision: '21',
                baseRevision: '20',
                createdAt: '2026-05-28T00:04:00.000Z',
                updatedAt: '2026-05-28T00:05:00.000Z',
              }],
              total: 1,
              limit: 100,
              offset: 0,
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (String(url).includes('/content-build-runs?')) {
          const requestUrl = new URL(String(url));
          assert.equal(requestUrl.searchParams.get('workspaceId'), 'workspace-server-1');
          assert.equal(requestUrl.searchParams.get('limit'), '100');
          return new Response(JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              revision: '22',
              items: [{
                id: 'build-run-server-1',
                workspaceId: 'workspace-server-1',
                title: '团队内容生成流程',
                status: 'completed',
                contentKnowledgeMapId: 'map-server-1',
                contentKnowledgeMapTitle: '团队通勤防晒内容地图',
                model: 'team-model',
                inputSourceIds: ['input-server-1'],
                brandKnowledgeBaseIds: ['brand-server-1'],
                readyPercent: 91,
                evidenceCount: 1,
                gapCount: 0,
                issues: [],
                steps: [{
                  key: 'team-quality-check',
                  title: '团队质量检查',
                  status: 'completed',
                  message: '91% 内容可用',
                  startedAt: '2026-05-28T00:05:00.000Z',
                  completedAt: '2026-05-28T00:05:01.000Z',
                }],
                serverRevision: '22',
                baseRevision: '21',
                startedAt: '2026-05-28T00:05:00.000Z',
                completedAt: '2026-05-28T00:05:01.000Z',
                updatedAt: '2026-05-28T00:05:01.000Z',
              }],
              total: 1,
              limit: 100,
              offset: 0,
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (String(url).endsWith('/content-draft-changes')) {
          return new Response(JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              workspace: { id: 'workspace-server-1', currentRevision: '12' },
              draftChange: { serverRevision: '12', baseRevision: '11' },
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (String(url).endsWith('/content-knowledge-maps')) {
          assert.equal(body.id, 'map-1');
          assert.equal(body.workspaceKey.startsWith('content-studio:'), true);
          assert.equal(body.snapshot.sellingPoints[0].title, '清爽补涂');
          assert.equal(body.readyPercent, 80);
          return new Response(JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              workspace: { id: 'workspace-server-1', currentRevision: '15' },
              knowledgeMap: { id: 'map-1', serverRevision: '15', baseRevision: '14' },
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (String(url).endsWith('/content-build-runs')) {
          assert.equal(body.id, 'build-run-1');
          assert.equal(body.contentKnowledgeMapId, 'map-1');
          assert.equal(body.steps[0].key, 'quality-check');
          return new Response(JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              workspace: { id: 'workspace-server-1', currentRevision: '16' },
              buildRun: { id: 'build-run-1', serverRevision: '16', baseRevision: '15' },
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (String(url).endsWith('/content-sync-conflicts')) {
          assert.equal(body.mergeDraft.rows[0].objectTitle, '轻量便携');
          return new Response(JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              conflict: {
                id: body.conflictId,
                workspaceId: 'workspace-server-1',
                sourceType: 'draft-change',
                title: '旧版本变更包',
                summary: '提交基于旧版本，需要处理。',
                status: 'resolved',
                baseRevision: '12',
                serverRevision: '13',
                affectedObjectIds: ['selling-1'],
                affectedObjects: [{
                  id: 'selling-1',
                  objectType: 'selling-point',
                  title: '轻量便携',
                  summary: '本机提交影响卖点表达。',
                  impact: 'high',
                  recommendation: '转人工确认。',
                }],
                resolutionAction: body.resolutionAction,
                resolutionMergeDraft: body.mergeDraft,
                resolvedBy: body.resolvedBy,
                resolvedAt: '2026-05-28T00:03:00.000Z',
                createdAt: '2026-05-28T00:00:00.000Z',
                updatedAt: '2026-05-28T00:03:00.000Z',
              },
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          code: 0,
          message: 'ok',
          data: {
            workspace: { id: 'workspace-server-1', currentRevision: '13' },
            release: {
              id: 'release-server-1',
              serverRevision: '13',
              baseRevision: '12',
              packageObjectKey: 'content-workspaces/content-studio-test/agentknowledge/release-1.zip',
              packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/content-studio-test/agentknowledge/release-1.zip',
              packageStorageProvider: 'metadata-only',
              packageUploadStatus: 'registered',
            },
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    });

  const draftSync = await adapter.submitDraftChange({
    id: 'draft-1',
    workspacePath: '/Users/coso/private-project',
    contentKnowledgeMapId: 'map-1',
    contentKnowledgeMapTitle: '内容知识地图',
    title: '内容变更包',
    summary: '卖点 1 个',
    kind: 'knowledge-map-updated',
    affectedObjectIds: ['map-1'],
    baseRevision: '11',
    syncStatus: 'pending-sync',
    authorLabel: '功能测试',
    issues: [],
    createdAt: '2026-05-28T00:00:00.000Z',
    updatedAt: '2026-05-28T00:00:00.000Z',
  });

  assert.equal(draftSync.status, 'synced');
  assert.equal(draftSync.workspaceId, 'workspace-server-1');
  assert.equal(draftSync.revision, '12');

  const releaseSync = await adapter.publishRelease({
    id: 'release-1',
    workspacePath: '/Users/coso/private-project',
    workspaceId: 'workspace-server-1',
    contentKnowledgeMapId: 'map-1',
    contentKnowledgeMapTitle: '内容知识地图',
    title: '团队知识包',
    version: 'v2026.05.28',
    status: 'local-preview',
    packageDir: '/Users/coso/private-project/.content-studio/exports/agentknowledge/map-1',
    knowledgePath: '/Users/coso/private-project/.content-studio/exports/agentknowledge/map-1/KNOWLEDGE.md',
    manifestPath: '/Users/coso/private-project/.content-studio/exports/agentknowledge/map-1/manifest.json',
    packageArchivePath: archivePath,
    packageArchiveFileName: 'release.zip',
    packageArchiveSha256: 'test-sha256',
    packageArchiveSize: 22,
    files: [
      '/Users/coso/private-project/.content-studio/exports/agentknowledge/map-1/KNOWLEDGE.md',
      '/Users/coso/private-project/.content-studio/exports/agentknowledge/map-1/ontology/ontology.json',
    ],
    issues: [],
    baseRevision: '12',
    createdAt: '2026-05-28T00:00:00.000Z',
    updatedAt: '2026-05-28T00:00:00.000Z',
  });

  assert.equal(releaseSync.status, 'synced');
  assert.equal(releaseSync.revision, '13');
  assert.equal(releaseSync.packagePublicUrl, 'https://downloads.bugu.run/content-workspaces/content-studio-test/agentknowledge/release-1.zip');
  assert.equal(requests[1].body.workspaceId, 'workspace-server-1');
  assert.deepEqual(requests[1].body.packageManifest.files, ['KNOWLEDGE.md', 'ontology/ontology.json']);
  assert.equal(requests[1].body.packageArchive.fileName, 'release.zip');
  assert.equal(requests[1].body.packageArchive.sha256, 'test-sha256');
  assert.match(requests[1].body.packageArchive.objectKey, /^content-workspaces\/content-studio-[a-f0-9-]+\/agentknowledge\/release-1\.zip$/);

  await adapter.publishRelease({
    id: 'release-relative-1',
    workspacePath: '/Users/coso/private-project',
    workspaceId: 'workspace-server-1',
    contentKnowledgeMapId: 'map-1',
    contentKnowledgeMapTitle: '内容知识地图',
    title: '团队知识包相对路径',
    version: 'v2026.05.28-relative',
    status: 'local-preview',
    packageDir: '/Users/coso/private-project/.content-studio/exports/agentknowledge/map-1',
    packageArchivePath: archivePath,
    packageArchiveFileName: 'release.zip',
    packageArchiveSha256: 'test-sha256',
    packageArchiveSize: 22,
    files: [
      'KNOWLEDGE.md',
      'manifest.json',
      'ontology/ontology.json',
      'answers/questions.json',
      'compiled/prompt-grounding.md',
    ],
    issues: [],
    baseRevision: '13',
    createdAt: '2026-05-28T00:00:00.000Z',
    updatedAt: '2026-05-28T00:00:00.000Z',
  });
  const relativeReleaseRequest = requests.find((request) => request.body?.id === 'release-relative-1');
  assert.deepEqual(relativeReleaseRequest?.body.packageManifest.files, [
    'KNOWLEDGE.md',
    'manifest.json',
    'ontology/ontology.json',
    'answers/questions.json',
    'compiled/prompt-grounding.md',
  ]);

  const resolvedConflict = await adapter.resolveSyncConflict({
    workspacePath: '/Users/coso/private-project',
    conflictId: 'conflict-server-1',
    resolutionAction: 'manual-review-recorded',
    resolutionNote: '按清单转人工确认。',
    mergeDraft: {
      id: 'merge-draft:conflict-server-1',
      conflictId: 'conflict-server-1',
      summary: '共 1 个内容项，1 个需要人工确认。',
      rows: [{
        id: 'merge-row-1',
        objectTitle: '轻量便携',
        objectTypeLabel: '卖点',
        fieldLabel: '卖点表达',
        localValue: '轻量通勤',
        teamValue: '轻量便携',
        suggestedDecision: 'manual-review',
        suggestedDecisionLabel: '人工确认',
        reason: '命名影响下游脚本。',
        nextStep: '转给内容负责人确认。',
        canApplyAutomatically: false,
      }],
    },
    resolvedBy: '功能测试',
  });
  assert.equal(resolvedConflict?.status, 'resolved');
  const conflictRequest = requests.find((request) => request.body?.conflictId === 'conflict-server-1');
  assert.equal(conflictRequest?.body.mergeDraft.rows[0].objectTitle, '轻量便携');

  const teamMaps = await adapter.listKnowledgeMaps({
    workspacePath: '/Users/coso/private-project',
    workspaceId: 'workspace-server-1',
  });
  assert.equal(teamMaps.length, 1);
  assert.equal(teamMaps[0].id, 'map-server-1');
  assert.equal(teamMaps[0].syncStatus, 'synced');
  assert.equal(teamMaps[0].teamSync.revision, '21');
  assert.equal(teamMaps[0].sellingPoints[0].title, '团队清爽补涂');
  assert.equal(teamMaps[0].sellingPoints[0].materialStatus, 'approved');
  assert.deepEqual(teamMaps[0].sellingPoints[0].performanceTags, ['高转化']);

  const teamBuildRuns = await adapter.listBuildRuns({
    workspacePath: '/Users/coso/private-project',
    workspaceId: 'workspace-server-1',
  });
  assert.equal(teamBuildRuns.length, 1);
  assert.equal(teamBuildRuns[0].id, 'build-run-server-1');
  assert.equal(teamBuildRuns[0].teamSync?.revision, '22');
  assert.equal(teamBuildRuns[0].steps[0].key, 'team-quality-check');

  const mapSync = await adapter.upsertKnowledgeMapSnapshot({
    record: {
      id: 'map-1',
      workspacePath: '/Users/coso/private-project',
      title: '通勤防晒内容知识地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步。',
        workspaceId: 'workspace-server-1',
        revision: '14',
      },
      sourceInputSourceIds: ['input-1'],
      brandKnowledgeBaseIds: ['brand-1'],
      ipKnowledgeBaseIds: [],
      sceneCardIds: ['scene-1'],
      promptDraftIds: ['prompt-1'],
      sellingPoints: [{
        id: 'selling-1',
        title: '清爽补涂',
        summary: '适合通勤场景。',
        tags: ['通勤'],
        sourceRefs: ['input-source:input-1'],
        evidenceRefs: ['evidence-1'],
        confidence: 88,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-1',
        sourceType: 'input-source',
        sourceId: 'input-1',
        sourceTitle: '产品 brief',
        claim: '清爽肤感',
        excerpt: '主打清爽肤感。',
        status: 'ready',
      }],
      constraints: ['不能绝对化表达'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        ipKnowledgeBaseCount: 0,
        sceneCardCount: 1,
        promptDraftCount: 1,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 80,
      },
      model: 'fake-text-model',
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:00.000Z',
    },
  });
  assert.equal(mapSync.status, 'synced');
  assert.equal(mapSync.revision, '15');

  const runSync = await adapter.appendBuildRun({
    buildRun: {
      id: 'build-run-1',
      workspacePath: '/Users/coso/private-project',
      title: '通勤防晒生成流程',
      status: 'completed',
      contentKnowledgeMapId: 'map-1',
      contentKnowledgeMapTitle: '通勤防晒内容知识地图',
      model: 'fake-text-model',
      inputSourceIds: ['input-1'],
      brandKnowledgeBaseIds: ['brand-1'],
      ipKnowledgeBaseIds: [],
      sceneCardIds: ['scene-1'],
      promptDraftIds: ['prompt-1'],
      readyPercent: 80,
      evidenceCount: 1,
      gapCount: 0,
      issues: [],
      steps: [{
        key: 'quality-check',
        title: '质量检查',
        status: 'completed',
        message: '80% 内容可用',
        startedAt: '2026-05-28T00:00:00.000Z',
        completedAt: '2026-05-28T00:00:01.000Z',
      }],
      teamSync: mapSync,
      startedAt: '2026-05-28T00:00:00.000Z',
      completedAt: '2026-05-28T00:00:01.000Z',
      updatedAt: '2026-05-28T00:00:01.000Z',
    },
  });
  assert.equal(runSync.status, 'synced');
  assert.equal(runSync.revision, '16');

  assert.ok(requests.some((request) => String(request.url).endsWith('/content-knowledge-maps')));
  assert.ok(requests.some((request) => String(request.url).endsWith('/content-build-runs')));
  });
});

test('团队知识包在线验收脚本只读校验公开包地址和 sha256', async () => {
  const packageBuffer = createStoredZip([
    { name: 'KNOWLEDGE.md', data: '# 防晒内容团队包\n' },
    { name: 'manifest.json', data: '{"schemaVersion":1}' },
  ]);
  const packageSha256 = createHash('sha256').update(packageBuffer).digest('hex');
  const requests = [];
  let baseUrl = '';
  const publicBaseUrl = 'https://downloads.bugu.test';
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', baseUrl || 'http://127.0.0.1');
    requests.push({
      method: request.method,
      pathname: url.pathname,
      authorization: request.headers.authorization || '',
      limit: url.searchParams.get('limit') || '',
      offset: url.searchParams.get('offset') || '',
    });
    if (url.pathname === '/api/v1/oem/content-knowledge-releases') {
      assert.equal(request.method, 'GET');
      assert.equal(url.searchParams.get('tenant'), 'tenant-test');
      assert.equal(url.searchParams.get('workspaceId'), 'workspace-release-online');
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        message: 'ok',
        data: {
          items: [{
            id: 'release-online-1',
            workspaceId: 'workspace-release-online',
            title: '防晒内容团队包',
            version: 'v1.4',
            status: 'published',
            approvalStatus: 'approved',
            packageObjectKey: 'content-workspaces/workspace-release-online/agentknowledge/release-online-1.zip',
            packagePublicUrl: `${publicBaseUrl}/packages/release-online-1.zip`,
            packageStorageProvider: 'r2',
            packageUploadStatus: 'stored',
            packageSha256,
            packageSize: packageBuffer.length,
          }],
        },
      }));
      return;
    }
    if (url.pathname === '/packages/release-online-1.zip') {
      response.setHeader('content-type', 'application/zip');
      response.setHeader('content-length', String(packageBuffer.length));
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      response.end(packageBuffer);
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await verifyContentKnowledgeReleaseOnline({
      apiBaseUrl: baseUrl,
      tenant: 'tenant-test',
      workspaceId: 'workspace-release-online',
      releaseId: 'release-online-1',
      token: 'test-token',
      maxDownloadBytes: 1024 * 1024,
      fetchImpl: createPublicPackageFetch(baseUrl, publicBaseUrl),
    });

    assert.equal(result.ok, true);
    assert.equal(result.release.id, 'release-online-1');
    assert.equal(result.package.reachable, true);
    assert.equal(result.checks.find((check) => check.id === 'package-size')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'package-sha256')?.status, 'passed');
    assert.ok(requests.some((item) => item.method === 'HEAD' && item.pathname === '/packages/release-online-1.zip'));
    assert.ok(requests.some((item) => item.method === 'GET' && item.pathname === '/packages/release-online-1.zip'));
    assert.equal(requests.find((item) => item.pathname === '/api/v1/oem/content-knowledge-releases')?.authorization, 'Bearer test-token');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('团队知识包在线验收脚本会分页查找指定 release', async () => {
  const packageBuffer = createStoredZip([
    { name: 'KNOWLEDGE.md', data: '# 分页团队包\n' },
    { name: 'manifest.json', data: '{"schemaVersion":1}' },
  ]);
  const packageSha256 = createHash('sha256').update(packageBuffer).digest('hex');
  const requests = [];
  let baseUrl = '';
  const publicBaseUrl = 'https://downloads.bugu.test';
  const releaseItems = () => Array.from({ length: 105 }, (_, index) => {
    const releaseIndex = index + 1;
    const id = `release-page-${releaseIndex}`;
    return {
      id,
      workspaceId: 'workspace-release-page',
      title: `分页团队包 ${releaseIndex}`,
      version: `v1.${releaseIndex}`,
      status: 'published',
      approvalStatus: 'approved',
      packageObjectKey: `content-workspaces/workspace-release-page/agentknowledge/${id}.zip`,
      packagePublicUrl: releaseIndex === 105 ? `${publicBaseUrl}/packages/release-page-105.zip` : '',
      packageStorageProvider: releaseIndex === 105 ? 'r2' : 'metadata-only',
      packageUploadStatus: releaseIndex === 105 ? 'stored' : 'registered',
      packageSha256: releaseIndex === 105 ? packageSha256 : '',
      packageSize: releaseIndex === 105 ? packageBuffer.length : 0,
    };
  });
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', baseUrl || 'http://127.0.0.1');
    requests.push({
      method: request.method,
      pathname: url.pathname,
      authorization: request.headers.authorization || '',
      limit: url.searchParams.get('limit') || '',
      offset: url.searchParams.get('offset') || '',
    });
    if (url.pathname === '/api/v1/oem/content-knowledge-releases') {
      const limit = Number(url.searchParams.get('limit') || 100);
      const offset = Number(url.searchParams.get('offset') || 0);
      const items = releaseItems();
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: items.slice(offset, offset + limit),
          total: items.length,
          limit,
          offset,
        },
      }));
      return;
    }
    if (url.pathname === '/packages/release-page-105.zip') {
      response.setHeader('content-type', 'application/zip');
      response.setHeader('content-length', String(packageBuffer.length));
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      response.end(packageBuffer);
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await verifyContentKnowledgeReleaseOnline({
      apiBaseUrl: baseUrl,
      tenant: 'tenant-test',
      workspaceId: 'workspace-release-page',
      releaseId: 'release-page-105',
      token: 'test-token',
      maxDownloadBytes: 1024 * 1024,
      fetchImpl: createPublicPackageFetch(baseUrl, publicBaseUrl),
    });

    assert.equal(result.ok, true);
    assert.equal(result.release.id, 'release-page-105');
    assert.equal(result.package.reachable, true);
    assert.ok(requests.some((item) => item.pathname === '/api/v1/oem/content-knowledge-releases' && item.offset === '100'));
    assert.ok(requests.some((item) => item.method === 'HEAD' && item.pathname === '/packages/release-page-105.zip'));
    assert.ok(requests.some((item) => item.method === 'GET' && item.pathname === '/packages/release-page-105.zip'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('团队知识包在线验收不会把 metadata-only release 当作可下载成功', async () => {
  const result = await verifyContentKnowledgeReleaseOnline({
    release: {
      id: 'release-metadata-only',
      title: '只登记元数据的团队知识包',
      version: 'v1.0',
      status: 'published',
      approvalStatus: 'approved',
      packageObjectKey: 'content-workspaces/workspace/agentknowledge/release.zip',
      packageUploadStatus: 'registered',
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.package.reachable, false);
  assert.equal(result.checks.find((check) => check.id === 'public-url-present')?.status, 'failed');
});

test('团队知识包在线验收会拒绝非公网公开包地址', async () => {
  const unsafeUrls = [
    'file:///Users/coso/private/release.zip',
    'packages/release.zip',
    'http://127.0.0.1:8787/packages/release.zip',
    'http://10.1.2.3/packages/release.zip',
    'http://172.20.1.8/packages/release.zip',
    'http://192.168.1.10/packages/release.zip',
    'http://169.254.10.20/packages/release.zip',
    'http://[fc00::1]/packages/release.zip',
    'http://[fe80::1]/packages/release.zip',
    'http://[::ffff:7f00:1]/packages/release.zip',
    'http://[::1]/packages/release.zip',
  ];

  for (const publicUrl of unsafeUrls) {
    const result = await verifyContentKnowledgeReleaseOnline({
      release: {
        id: `release-unsafe-url-${unsafeUrls.indexOf(publicUrl)}`,
        title: '非公网公开包地址',
        version: 'v1.0',
        status: 'published',
        approvalStatus: 'approved',
        packagePublicUrl: publicUrl,
        packageUploadStatus: 'stored',
        packageSize: 128,
        packageSha256: 'a'.repeat(64),
      },
      requirePublicPackage: true,
      fetchImpl: async () => {
        throw new Error('不应请求非公网公开包地址');
      },
    });

    assert.equal(result.ok, false);
    assert.equal(result.package.reachable, false);
    assert.equal(result.checks.find((check) => check.id === 'public-url-format')?.status, 'failed');
  }
});

test('团队知识包在线验收要求生产公开包具备大小和 sha256', async () => {
  const packageBuffer = Buffer.from('release package without metadata');
  const result = await verifyContentKnowledgeReleaseOnline({
    release: {
      id: 'release-public-missing-digest',
      title: '缺少校验摘要的团队知识包',
      version: 'v1.0',
      status: 'published',
      approvalStatus: 'approved',
      packagePublicUrl: 'https://downloads.example.test/release-public-missing-digest.zip',
      packageUploadStatus: 'stored',
    },
    requirePublicPackage: true,
    fetchImpl: async (url, init = {}) => {
      assert.equal(String(url), 'https://downloads.example.test/release-public-missing-digest.zip');
      return new Response(init.method === 'HEAD' ? null : packageBuffer, {
        status: 200,
        headers: {
          'content-type': 'application/zip',
          'content-length': String(packageBuffer.length),
        },
      });
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.package.reachable, true);
  assert.equal(result.checks.find((check) => check.id === 'package-upload-status')?.status, 'passed');
  assert.equal(result.checks.find((check) => check.id === 'package-size-required')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.id === 'package-sha256-format')?.status, 'failed');
});

test('团队共享在线验收要求两个账号看到同一工作区、团队知识包和交付物引用', async () => {
  const requests = [];
  const knowledgeMapItems = [{ id: 'map-online-1', title: '线上团队内容地图' }];
  const buildRunItems = [{ id: 'build-run-online-1', contentKnowledgeMapId: 'map-online-1', title: '线上团队生成流程' }];
  const reviewItems = Array.from({ length: 105 }, (_, index) => ({ id: `review-online-${index + 1}`, title: `确认卖点证据 ${index + 1}` }));
  const actionItems = Array.from({ length: 105 }, (_, index) => ({
    id: `action-online-${index + 1}`,
    title: `确认目标优先级 ${index + 1}`,
    artifactRefs: index === 104
      ? ['[本机工作区]/.content-studio/exports/brand-command-material-gaps/manifest.json', 'material-gap-list.md', 'material-gap-list.json']
      : [],
  }));
  const paginate = (items, url) => {
    const limit = Number(url.searchParams.get('limit') || 100);
    const offset = Number(url.searchParams.get('offset') || 0);
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
    };
  };
  let baseUrl = '';
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const authorization = request.headers.authorization || '';
    requests.push({
      pathname: url.pathname,
      authorization,
      limit: url.searchParams.get('limit') || '',
      offset: url.searchParams.get('offset') || '',
    });
    response.setHeader('content-type', 'application/json');
    if (!['Bearer token-a', 'Bearer token-b'].includes(authorization)) {
      response.statusCode = 401;
      response.end(JSON.stringify({ code: 401, message: 'unauthorized' }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-workspaces') {
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{
            id: 'workspace-team-online',
            name: '线上团队验收工作区',
            currentRevision: 'team-rev-12',
            defaultKnowledgeReleaseId: 'release-team-online',
            updatedAt: '2026-05-29T00:00:00.000Z',
          }],
        },
      }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-knowledge-releases') {
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{
            id: 'release-team-online',
            title: '线上团队知识包',
            version: 'v1.6',
            status: 'published',
            approvalStatus: 'approved',
            packagePublicUrl: `${baseUrl}/packages/release-team-online.zip`,
            packageUploadStatus: 'stored',
          }],
        },
      }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-knowledge-maps') {
      response.end(JSON.stringify({ code: 0, data: paginate(knowledgeMapItems, url) }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-build-runs') {
      response.end(JSON.stringify({ code: 0, data: paginate(buildRunItems, url) }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-review-tasks') {
      response.end(JSON.stringify({ code: 0, data: paginate(reviewItems, url) }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-action-records') {
      response.end(JSON.stringify({ code: 0, data: paginate(actionItems, url) }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ code: 404, message: 'not found' }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await verifyContentTeamSharingOnline({
      apiBaseUrl: baseUrl,
      tenant: 'tenant-test',
      workspaceId: 'workspace-team-online',
      actorAToken: 'token-a',
      actorBToken: 'token-b',
      requirePublicPackage: true,
    });

    assert.equal(result.ok, true);
    assert.equal(result.workspace.actorA.id, 'workspace-team-online');
    assert.equal(result.release.id, 'release-team-online');
    assert.equal(result.summaries.actorA.knowledgeMapCount, 1);
    assert.deepEqual(result.summaries.actorB.knowledgeMapIds, ['map-online-1']);
    assert.equal(result.summaries.actorA.buildRunCount, 1);
    assert.deepEqual(result.summaries.actorB.buildRunIds, ['build-run-online-1']);
    assert.equal(result.summaries.actorA.releaseCount, 1);
    assert.deepEqual(result.summaries.actorB.releaseIds, ['release-team-online']);
    assert.equal(result.summaries.actorA.knowledgeMapListComplete, true);
    assert.equal(result.summaries.actorB.buildRunListComplete, true);
    assert.equal(result.summaries.actorA.releaseListComplete, true);
    assert.equal(result.summaries.actorA.reviewTaskCount, 105);
    assert.equal(result.summaries.actorA.actionRecordCount, 105);
    assert.equal(result.summaries.actorA.reviewTaskListComplete, true);
    assert.equal(result.summaries.actorB.actionRecordListComplete, true);
    assert.equal(result.summaries.actorB.actionRecordIds.length, 105);
    assert.ok(result.summaries.actorB.actionRecordIds.includes('action-online-105'));
    assert.equal(result.summaries.actorA.actionArtifactRecordCount, 1);
    assert.deepEqual(result.summaries.actorB.actionArtifactRecordIds, ['action-online-105']);
    assert.deepEqual(result.summaries.actorA.actionArtifactRefsByRecordId['action-online-105'], [
      '[本机工作区]/.content-studio/exports/brand-command-material-gaps/manifest.json',
      'material-gap-list.json',
      'material-gap-list.md',
    ]);
    assert.equal(result.checks.find((check) => check.id === 'release-public-url-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'knowledge-map-list-complete')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'build-run-list-complete')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'knowledge-map-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'build-run-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'review-task-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'release-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'release-list-complete')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'knowledge-map-list-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'build-run-list-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'release-list-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-list-complete')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-list-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-artifacts-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-artifacts-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-artifacts-safe')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'material-gap-artifact-present')?.status, 'passed');
    assert.ok(requests.some((item) => item.pathname === '/api/v1/oem/content-knowledge-maps'));
    assert.ok(requests.some((item) => item.pathname === '/api/v1/oem/content-build-runs'));
    assert.ok(requests.some((item) => item.pathname === '/api/v1/oem/content-action-records' && item.offset === '100'));
    assert.ok(requests.some((item) => item.authorization === 'Bearer token-a'));
    assert.ok(requests.some((item) => item.authorization === 'Bearer token-b'));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('团队共享在线验收会拒绝空的团队主事实源清单', async () => {
  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  const fetchImpl = async (requestUrl, init = {}) => {
    const url = new URL(String(requestUrl));
    const authorization = String(init.headers?.authorization || '');
    if (!['Bearer token-a', 'Bearer token-b'].includes(authorization)) {
      return jsonResponse({ code: 401, message: 'unauthorized' }, 401);
    }
    if (url.pathname === '/api/v1/oem/content-workspaces') {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            id: 'workspace-empty-current',
            name: '空主事实源工作区',
            currentRevision: 'rev-empty-current',
            defaultKnowledgeReleaseId: 'release-empty-current',
          }],
          total: 1,
        },
      });
    }
    if (url.pathname === '/api/v1/oem/content-knowledge-releases') {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            id: 'release-empty-current',
            title: '空主事实源知识包',
            version: 'v1-empty',
            status: 'published',
            approvalStatus: 'approved',
            packagePublicUrl: 'https://r2.bugu.run/packages/release-empty-current.zip',
            packageUploadStatus: 'stored',
          }],
          total: 1,
        },
      });
    }
    if (url.pathname === '/api/v1/oem/content-action-records') {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            id: 'action-empty-current',
            title: '生成补素材清单',
            artifactRefs: ['material-gap-list.json'],
          }],
          total: 1,
        },
      });
    }
    if (
      url.pathname === '/api/v1/oem/content-knowledge-maps' ||
      url.pathname === '/api/v1/oem/content-build-runs' ||
      url.pathname === '/api/v1/oem/content-review-tasks'
    ) {
      return jsonResponse({ code: 0, data: { items: [], total: 0 } });
    }
    return jsonResponse({ code: 404, message: 'not found' }, 404);
  };

  const result = await verifyContentTeamSharingOnline({
    apiBaseUrl: 'https://api.bugu.run',
    tenant: 'tenant-prod',
    workspaceId: 'workspace-empty-current',
    actorAToken: 'token-a',
    actorBToken: 'token-b',
    fetchImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.summaries.actorA.knowledgeMapCount, 0);
  assert.equal(result.summaries.actorA.buildRunCount, 0);
  assert.equal(result.checks.find((check) => check.id === 'knowledge-map-list-present')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.id === 'build-run-list-present')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.id === 'review-task-list-present')?.status, 'failed');
});

test('团队共享在线验收会拒绝空的团队审核任务和行动记录', async () => {
  const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
  const fetchImpl = async (requestUrl, init = {}) => {
    const url = new URL(String(requestUrl));
    const authorization = String(init.headers?.authorization || '');
    if (!['Bearer token-a', 'Bearer token-b'].includes(authorization)) {
      return jsonResponse({ code: 401, message: 'unauthorized' }, 401);
    }
    if (url.pathname === '/api/v1/oem/content-workspaces') {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            id: 'workspace-empty-review-action',
            name: '空审核行动工作区',
            currentRevision: 'rev-empty-review-action',
            defaultKnowledgeReleaseId: 'release-empty-review-action',
          }],
          total: 1,
        },
      });
    }
    if (url.pathname === '/api/v1/oem/content-knowledge-releases') {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            id: 'release-empty-review-action',
            title: '空审核行动知识包',
            version: 'v1-empty-review-action',
            status: 'published',
            approvalStatus: 'approved',
            packagePublicUrl: 'https://r2.bugu.run/packages/release-empty-review-action.zip',
            packageUploadStatus: 'stored',
          }],
          total: 1,
        },
      });
    }
    if (url.pathname === '/api/v1/oem/content-knowledge-maps') {
      return jsonResponse({ code: 0, data: { items: [{ id: 'map-empty-review-action' }], total: 1 } });
    }
    if (url.pathname === '/api/v1/oem/content-build-runs') {
      return jsonResponse({ code: 0, data: { items: [{ id: 'build-run-empty-review-action' }], total: 1 } });
    }
    if (url.pathname === '/api/v1/oem/content-action-records') {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            id: 'action-empty-review-action',
            title: '生成补素材清单',
            artifactRefs: ['material-gap-list.json'],
          }],
          total: 1,
        },
      });
    }
    if (
      url.pathname === '/api/v1/oem/content-review-tasks'
    ) {
      return jsonResponse({ code: 0, data: { items: [], total: 0 } });
    }
    return jsonResponse({ code: 404, message: 'not found' }, 404);
  };

  const result = await verifyContentTeamSharingOnline({
    apiBaseUrl: 'https://api.bugu.run',
    tenant: 'tenant-prod',
    workspaceId: 'workspace-empty-review-action',
    actorAToken: 'token-a',
    actorBToken: 'token-b',
    fetchImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === 'knowledge-map-list-present')?.status, 'passed');
  assert.equal(result.checks.find((check) => check.id === 'build-run-list-present')?.status, 'passed');
  assert.equal(result.checks.find((check) => check.id === 'review-task-list-present')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.id === 'action-record-list-present')?.status, 'passed');
});

test('Ontology v1 在线验收可以汇总知识包和团队共享报告', async () => {
  const packageBuffer = Buffer.from('ontology v1 online package');
  const packageSha256 = createHash('sha256').update(packageBuffer).digest('hex');
  let baseUrl = '';
  const publicBaseUrl = 'https://downloads.bugu.test';
  const server = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const authorization = request.headers.authorization || '';
    if (url.pathname.startsWith('/api/') && !['Bearer token-a', 'Bearer token-b'].includes(authorization)) {
      response.statusCode = 401;
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ code: 401, message: 'unauthorized' }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-workspaces') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{
            id: 'workspace-v1-online',
            name: 'v1 在线验收工作区',
            currentRevision: 'v1-rev-8',
            defaultKnowledgeReleaseId: 'release-v1-online',
          }],
        },
      }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-knowledge-releases') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{
            id: 'release-v1-online',
            workspaceId: 'workspace-v1-online',
            title: 'v1 在线团队知识包',
            version: 'v1.8',
            status: 'published',
            approvalStatus: 'approved',
            packagePublicUrl: `${publicBaseUrl}/packages/release-v1-online.zip`,
            packageUploadStatus: 'stored',
            packageSha256,
            packageSize: packageBuffer.length,
          }],
        },
      }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-knowledge-maps') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{ id: 'map-v1-online', title: 'v1 在线内容地图' }],
          total: 1,
        },
      }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-build-runs') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{ id: 'build-run-v1-online', contentKnowledgeMapId: 'map-v1-online' }],
          total: 1,
        },
      }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-review-tasks') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{ id: 'review-task-v1-online', title: '确认 v1 卖点证据' }],
          total: 1,
        },
      }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-action-records') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{
            id: 'action-v1-online-artifact',
            title: '生成补素材清单',
            artifactRefs: ['material-gap-list.json'],
          }],
          total: 1,
        },
      }));
      return;
    }
    if (url.pathname === '/packages/release-v1-online.zip') {
      response.setHeader('content-type', 'application/zip');
      response.setHeader('content-length', String(packageBuffer.length));
      if (request.method === 'HEAD') {
        response.end();
        return;
      }
      response.end(packageBuffer);
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
    const result = await verifyContentOntologyV1Online({
      apiBaseUrl: baseUrl,
      tenant: 'tenant-test',
      workspaceId: 'workspace-v1-online',
      releaseId: 'release-v1-online',
      actorAToken: 'token-a',
      actorBToken: 'token-b',
      token: 'token-a',
      requirePublicPackage: true,
      maxDownloadBytes: 1024 * 1024,
      fetchImpl: createPublicPackageFetch(baseUrl, publicBaseUrl),
    });

    assert.equal(result.ok, true);
    assert.equal(result.sections.release.ok, true);
    assert.equal(result.sections.team.ok, true);
    assert.equal(result.sections.team.summaries.actorA.reviewTaskCount, 1);
    assert.equal(result.sections.team.checks.find((check) => check.id === 'review-task-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'release-online-report')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'team-sharing-online-report')?.status, 'passed');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Ontology v1 生产验收报告归档会拒绝本地 mock 报告', async () => {
  const report = {
    ok: true,
    generatedAt: '2026-05-29T00:00:00.000Z',
    target: {
      apiBaseUrl: 'http://127.0.0.1:8787',
      tenant: 'tenant-test',
      workspaceId: 'workspace-v1-online',
      releaseId: 'release-v1-online',
    },
    checks: [
      { id: 'release-online-report', status: 'passed', message: '团队知识包在线验收通过。' },
      { id: 'team-sharing-online-report', status: 'passed', message: '团队共享在线验收通过。' },
    ],
    sections: {
      release: {
        ok: true,
        release: {
          id: 'release-v1-online',
          status: 'published',
          approvalStatus: 'approved',
        },
        package: {
          reachable: true,
          publicUrl: 'http://127.0.0.1:8787/packages/release-v1-online.zip',
          size: 28,
          sha256: 'a'.repeat(64),
        },
        checks: [],
      },
      team: {
        ok: true,
        workspace: {
          actorA: { id: 'workspace-v1-online', currentRevision: 'rev-1' },
          actorB: { id: 'workspace-v1-online', currentRevision: 'rev-1' },
        },
        release: { id: 'release-v1-online', version: 'v1.8' },
        summaries: {
          actorA: {
            knowledgeMapCount: 1,
            buildRunCount: 1,
            reviewTaskCount: 1,
            actionRecordCount: 1,
            releaseCount: 1,
            knowledgeMapIds: ['map-v1-online'],
            buildRunIds: ['build-run-v1-online'],
            reviewTaskIds: ['review-task-1'],
            actionRecordIds: ['action-record-1'],
            actionArtifactRecordCount: 1,
            actionArtifactRecordIds: ['action-record-1'],
            actionArtifactRefsByRecordId: {
              'action-record-1': ['material-gap-list.json'],
            },
            releaseIds: ['release-v1-online'],
            knowledgeMapListComplete: true,
            buildRunListComplete: true,
            reviewTaskListComplete: true,
            actionRecordListComplete: true,
            releaseListComplete: true,
          },
          actorB: {
            knowledgeMapCount: 1,
            buildRunCount: 1,
            reviewTaskCount: 1,
            actionRecordCount: 1,
            releaseCount: 1,
            knowledgeMapIds: ['map-v1-online'],
            buildRunIds: ['build-run-v1-online'],
            reviewTaskIds: ['review-task-1'],
            actionRecordIds: ['action-record-1'],
            actionArtifactRecordCount: 1,
            actionArtifactRecordIds: ['action-record-1'],
            actionArtifactRefsByRecordId: {
              'action-record-1': ['material-gap-list.json'],
            },
            releaseIds: ['release-v1-online'],
            knowledgeMapListComplete: true,
            buildRunListComplete: true,
            reviewTaskListComplete: true,
            actionRecordListComplete: true,
            releaseListComplete: true,
          },
        },
        checks: [],
      },
    },
  };

  const shapeResult = validateContentOntologyV1Report(report);
  assert.equal(shapeResult.ok, true);

  const productionResult = validateContentOntologyV1Report(report, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(productionResult.ok, false);
  assert.ok(productionResult.issues.some((issue) => issue.id === 'target-api-base-url'));
  assert.ok(productionResult.issues.some((issue) => issue.id === 'package-public-url'));

  const productionReport = structuredClone(report);
  productionReport.target.apiBaseUrl = 'https://api.bugu.run';
  productionReport.sections.release.package.publicUrl = 'https://r2.bugu.run/packages/release-v1-online.zip';
  const accepted = validateContentOntologyV1Report(productionReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(accepted.ok, true);

  const skippedReleaseReport = structuredClone(productionReport);
  skippedReleaseReport.checks = skippedReleaseReport.checks.map((check) => (
    check.id === 'release-online-report'
      ? { ...check, status: 'skipped', message: '已跳过团队知识包在线验收。' }
      : check
  ));
  const skippedRelease = validateContentOntologyV1Report(skippedReleaseReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(skippedRelease.ok, false);
  assert.ok(skippedRelease.issues.some((issue) => issue.id === 'release-top-check'));
  assert.ok(skippedRelease.issues.some((issue) => issue.id === 'skipped-section'));

  const skippedTeamReport = structuredClone(productionReport);
  skippedTeamReport.checks = skippedTeamReport.checks.map((check) => (
    check.id === 'team-sharing-online-report'
      ? { ...check, status: 'skipped', message: '已跳过团队共享在线验收。' }
      : check
  ));
  const skippedTeam = validateContentOntologyV1Report(skippedTeamReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(skippedTeam.ok, false);
  assert.ok(skippedTeam.issues.some((issue) => issue.id === 'team-top-check'));
  assert.ok(skippedTeam.issues.some((issue) => issue.id === 'skipped-section'));

  const localFilePackageReport = structuredClone(productionReport);
  localFilePackageReport.sections.release.package.publicUrl = 'file:///Users/coso/private/release-v1-online.zip';
  const localFilePackage = validateContentOntologyV1Report(localFilePackageReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(localFilePackage.ok, false);
  assert.ok(localFilePackage.issues.some((issue) => issue.id === 'package-public-url'));

  const relativePackageReport = structuredClone(productionReport);
  relativePackageReport.sections.release.package.publicUrl = 'packages/release-v1-online.zip';
  const relativePackage = validateContentOntologyV1Report(relativePackageReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(relativePackage.ok, false);
  assert.ok(relativePackage.issues.some((issue) => issue.id === 'package-public-url'));

  const localIpv6PackageReport = structuredClone(productionReport);
  localIpv6PackageReport.sections.release.package.publicUrl = 'http://[::1]/packages/release-v1-online.zip';
  const localIpv6Package = validateContentOntologyV1Report(localIpv6PackageReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(localIpv6Package.ok, false);
  assert.ok(localIpv6Package.issues.some((issue) => issue.id === 'package-public-url'));

  const privateIpv4PackageReport = structuredClone(productionReport);
  privateIpv4PackageReport.sections.release.package.publicUrl = 'http://10.0.0.8/packages/release-v1-online.zip';
  const privateIpv4Package = validateContentOntologyV1Report(privateIpv4PackageReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(privateIpv4Package.ok, false);
  assert.ok(privateIpv4Package.issues.some((issue) => issue.id === 'package-public-url'));

  const privateIpv6PackageReport = structuredClone(productionReport);
  privateIpv6PackageReport.sections.release.package.publicUrl = 'http://[fc00::1]/packages/release-v1-online.zip';
  const privateIpv6Package = validateContentOntologyV1Report(privateIpv6PackageReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(privateIpv6Package.ok, false);
  assert.ok(privateIpv6Package.issues.some((issue) => issue.id === 'package-public-url'));

  const privateApiBaseReport = structuredClone(productionReport);
  privateApiBaseReport.target.apiBaseUrl = 'http://192.168.1.10:8787';
  const privateApiBase = validateContentOntologyV1Report(privateApiBaseReport, {
    production: true,
  });
  assert.equal(privateApiBase.ok, false);
  assert.ok(privateApiBase.issues.some((issue) => issue.id === 'target-api-base-url'));

  const mismatchedActionReport = structuredClone(productionReport);
  mismatchedActionReport.sections.team.summaries.actorB.actionRecordIds = ['action-record-other'];
  const mismatchedAction = validateContentOntologyV1Report(mismatchedActionReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(mismatchedAction.ok, false);
  assert.ok(mismatchedAction.issues.some((issue) => issue.id === 'team-action-ids-match'));

  const missingKnowledgeMapReport = structuredClone(productionReport);
  missingKnowledgeMapReport.sections.team.summaries.actorA.knowledgeMapCount = 0;
  missingKnowledgeMapReport.sections.team.summaries.actorB.knowledgeMapCount = 0;
  missingKnowledgeMapReport.sections.team.summaries.actorA.knowledgeMapIds = [];
  missingKnowledgeMapReport.sections.team.summaries.actorB.knowledgeMapIds = [];
  const missingKnowledgeMap = validateContentOntologyV1Report(missingKnowledgeMapReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(missingKnowledgeMap.ok, false);
  assert.ok(missingKnowledgeMap.issues.some((issue) => issue.id === 'team-knowledge-map-present'));

  const missingReviewReport = structuredClone(productionReport);
  missingReviewReport.sections.team.summaries.actorA.reviewTaskCount = 0;
  missingReviewReport.sections.team.summaries.actorB.reviewTaskCount = 0;
  missingReviewReport.sections.team.summaries.actorA.reviewTaskIds = [];
  missingReviewReport.sections.team.summaries.actorB.reviewTaskIds = [];
  const missingReview = validateContentOntologyV1Report(missingReviewReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(missingReview.ok, false);
  assert.ok(missingReview.issues.some((issue) => issue.id === 'team-review-present'));

  const missingActionReport = structuredClone(productionReport);
  missingActionReport.sections.team.summaries.actorA.actionRecordCount = 0;
  missingActionReport.sections.team.summaries.actorB.actionRecordCount = 0;
  missingActionReport.sections.team.summaries.actorA.actionRecordIds = [];
  missingActionReport.sections.team.summaries.actorB.actionRecordIds = [];
  const missingAction = validateContentOntologyV1Report(missingActionReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(missingAction.ok, false);
  assert.ok(missingAction.issues.some((issue) => issue.id === 'team-action-present'));

  const missingReleaseReport = structuredClone(productionReport);
  missingReleaseReport.sections.team.summaries.actorA.releaseCount = 0;
  missingReleaseReport.sections.team.summaries.actorB.releaseCount = 0;
  missingReleaseReport.sections.team.summaries.actorA.releaseIds = [];
  missingReleaseReport.sections.team.summaries.actorB.releaseIds = [];
  const missingRelease = validateContentOntologyV1Report(missingReleaseReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(missingRelease.ok, false);
  assert.ok(missingRelease.issues.some((issue) => issue.id === 'team-release-present'));

  const mismatchedReleaseReport = structuredClone(productionReport);
  mismatchedReleaseReport.sections.team.summaries.actorB.releaseIds = ['release-v1-other'];
  const mismatchedRelease = validateContentOntologyV1Report(mismatchedReleaseReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(mismatchedRelease.ok, false);
  assert.ok(mismatchedRelease.issues.some((issue) => issue.id === 'team-release-ids-match'));

  const incompleteReleaseReport = structuredClone(productionReport);
  incompleteReleaseReport.sections.team.summaries.actorA.releaseListComplete = false;
  const incompleteRelease = validateContentOntologyV1Report(incompleteReleaseReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(incompleteRelease.ok, false);
  assert.ok(incompleteRelease.issues.some((issue) => issue.id === 'team-release-list-complete'));

  const mismatchedBuildRunReport = structuredClone(productionReport);
  mismatchedBuildRunReport.sections.team.summaries.actorB.buildRunIds = ['build-run-other'];
  const mismatchedBuildRun = validateContentOntologyV1Report(mismatchedBuildRunReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(mismatchedBuildRun.ok, false);
  assert.ok(mismatchedBuildRun.issues.some((issue) => issue.id === 'team-build-run-ids-match'));



  const unsafeArtifactRefsReport = structuredClone(productionReport);
  unsafeArtifactRefsReport.sections.team.summaries.actorA.actionArtifactRefsByRecordId['action-record-1'] = ['/Users/coso/private/material-gap-list.json'];
  unsafeArtifactRefsReport.sections.team.summaries.actorB.actionArtifactRefsByRecordId['action-record-1'] = ['/Users/coso/private/material-gap-list.json'];
  const unsafeArtifactRefs = validateContentOntologyV1Report(unsafeArtifactRefsReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(unsafeArtifactRefs.ok, false);
  assert.ok(unsafeArtifactRefs.issues.some((issue) => issue.id === 'team-action-artifact-refs-safe'));

  const missingMaterialGapArtifactReport = structuredClone(productionReport);
  missingMaterialGapArtifactReport.sections.team.summaries.actorA.actionArtifactRefsByRecordId['action-record-1'] = ['manifest.json'];
  missingMaterialGapArtifactReport.sections.team.summaries.actorB.actionArtifactRefsByRecordId['action-record-1'] = ['manifest.json'];
  const missingMaterialGapArtifact = validateContentOntologyV1Report(missingMaterialGapArtifactReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(missingMaterialGapArtifact.ok, false);
  assert.ok(missingMaterialGapArtifact.issues.some((issue) => issue.id === 'team-material-gap-artifact-present'));
});

test('Ontology v1 readiness gate 区分本地就绪和生产报告缺失', async () => {
  const localReadiness = await verifyContentOntologyV1Readiness();
  assert.equal(localReadiness.ok, true);
  assert.equal(localReadiness.mode, 'local-readiness');
  assert.ok(localReadiness.checks.some((check) => check.id === 'required-docs' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'required-implementation-files' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'package-scripts' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'verify-local-includes-readiness' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'prototype-copy' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'completion-audit' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => (
    check.id === 'v1-user-facing-copy-gate'
    && check.status === 'passed'
    && check.files === 4
    && check.rules >= 6
    && check.message.includes('知识地图、审核台和 agents')
  )));
  assert.ok(localReadiness.checks.some((check) => check.id === 'team-knowledge-refresh-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'build-run-detail-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'matrix-row-primary-action-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'content-knowledge-map-model-click-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'asset-library-material-task-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'team-sync-conflict-resolution-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'team-offline-change-import-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'production-handoff-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'retired-brand-command-runtime-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'team-release-list-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'team-workflow-presence-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'agent-knowledge-pack-file-preview-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'bugu-server-policy-gate' && ['passed', 'warning'].includes(check.status)));
  assert.ok(localReadiness.checks.some((check) => check.id === 'bugu-knowledge-map-fact-source' && ['passed', 'warning'].includes(check.status)));
  assert.ok(localReadiness.checks.some((check) => check.id === 'production-report' && check.status === 'warning'));

  const productionReadiness = await verifyContentOntologyV1Readiness({ requireProductionReport: true });
  assert.equal(productionReadiness.ok, false);
  assert.equal(productionReadiness.mode, 'production-required');
  assert.ok(productionReadiness.checks.some((check) => check.id === 'production-report' && check.status === 'failed'));
});

test('内容知识地图构建器纳入 SKU、IP 和竞品观察，并把竞品设为待审核', () => {
  const workspacePath = '/tmp/content-studio-v1-builder';
  const now = '2026-05-29T00:00:00.000Z';
  const productBrief = {
    id: 'input-product-brief-v1',
    workspacePath,
    kind: 'text',
    status: 'converted',
    purpose: 'product-brief',
    title: 'BreezeGo Air 产品资料',
    tags: ['产品资料'],
    summary: '便携风扇，轻量通勤，夹扣底座，三档风力。',
    extractedText: '便携风扇。轻量通勤。夹扣底座。三档风力。',
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
  };
  const skuTable = {
    id: 'input-sku-v1',
    workspacePath,
    kind: 'sku-table',
    status: 'converted',
    purpose: 'product-brief',
    title: 'BreezeGo Air SKU 表',
    tags: ['SKU', '规格'],
    summary: 'SKU,规格,价格,适用场景',
    extractedText: [
      'SKU,规格,价格,适用场景,人群',
      'A01,基础款,99,通勤包内携带,学生',
      'A02,夹扣款,139,婴儿车和办公桌,宝妈',
    ].join('\n'),
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
  };
  const pastedSkuTable = {
    id: 'input-pasted-sku-v1',
    workspacePath,
    kind: 'manual-note',
    status: 'converted',
    purpose: 'product-brief',
    title: '手动粘贴 SKU 表',
    tags: ['SKU', '规格'],
    summary: '手动粘贴的 SKU 表',
    extractedText: [
      'SKU,规格,价格,适用场景,人群,内容形式',
      'A03,挂绳款,159,户外通勤,通勤人群,短视频',
    ].join('\n'),
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
  };
  const feedback = {
    id: 'input-feedback-v1',
    workspacePath,
    kind: 'text',
    status: 'converted',
    purpose: 'user-feedback',
    title: '评论痛点',
    tags: ['评论'],
    summary: '包里会不会很重？续航够不够？',
    extractedText: '包里会不会很重？续航够不够？夹在婴儿车上稳不稳？',
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
  };
  const competitor = {
    id: 'input-competitor-v1',
    workspacePath,
    kind: 'text',
    status: 'converted',
    purpose: 'competitor-observation',
    title: '竞品观察',
    tags: ['竞品', '对标'],
    summary: '竞品主打超长续航和儿童安全，评论担心噪音。',
    extractedText: '竞品主打超长续航和儿童安全。评论担心噪音。短视频结构先展示包内体积，再展示桌面夹扣。',
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
  };
  const brand = {
    id: 'brand-v1',
    workspacePath,
    title: 'BreezeGo Air 品牌知识库',
    status: 'ready',
    sourceCitationIds: ['kb:brand'],
    brandVoice: '清爽、可信、少夸张。',
    audience: '夏季通勤和带娃用户',
    productFacts: ['重量 180g。', '三档风力。'],
    coreSellingPoints: ['轻量便携', '夹扣稳固'],
    complianceBoundaries: ['不能承诺绝对安全。'],
    sceneSeeds: ['地铁通勤', '办公室桌面'],
    promptFragments: [],
    createdAt: now,
    updatedAt: now,
  };
  const ip = {
    id: 'ip-v1',
    workspacePath,
    title: '创始人 IP 知识库',
    status: 'ready',
    sourceCitationIds: ['kb:ip'],
    layers: {
      identity: '小家电产品经理。',
      values: '只推荐有真实测试记录的产品。',
      language: '少用绝对词，多用测试场景和限制条件。',
      methodology: '先讲使用场景，再讲证据和边界。',
      materials: '夏季通勤测试、办公室桌面测试。',
      engine: '场景问题 -> 证据 -> 选择建议。',
    },
    missingLayers: [],
    completeness: 100,
    extensionScenes: ['口播', '私域回复'],
    createdAt: now,
    updatedAt: now,
  };

  const result = buildContentKnowledgeMapDraft({
    workspacePath,
    title: 'BreezeGo Air 内容知识地图',
    inputSourceIds: [productBrief.id, skuTable.id, pastedSkuTable.id, feedback.id, competitor.id],
    brandKnowledgeBaseIds: [brand.id],
    ipKnowledgeBaseIds: [ip.id],
  }, {
    inputSources: [productBrief, skuTable, pastedSkuTable, feedback, competitor],
    brandKnowledgeBases: [brand],
    ipKnowledgeBases: [ip],
    sceneCards: [],
    promptDrafts: [],
    assetReviews: [],
  });

  assert.deepEqual(result.ipKnowledgeBaseIds, [ip.id]);
  assert.equal(result.skuRowCount, 3);
  assert.equal(result.competitorObservationCount, 1);
  assert.ok(result.evidence.some((item) => item.sourceType === 'ip-knowledge-base' && item.sourceId === ip.id));
  assert.ok(result.sellingPoints.some((row) => row.title.includes('SKU：A01')));
  assert.ok(result.scenarios.some((row) => row.title.includes('SKU 场景：A02')));
  assert.ok(result.scenarios.some((row) => row.title.includes('SKU 场景：A03')));
  const skuSellingRow = result.sellingPoints.find((row) => row.title.includes('SKU：A01'));
  assert.deepEqual(skuSellingRow?.dimensions?.audiences, ['学生']);
  assert.deepEqual(skuSellingRow?.dimensions?.useCases, ['通勤包内携带']);
  const skuScenarioRow = result.scenarios.find((row) => row.title.includes('SKU 场景：A02'));
  assert.deepEqual(skuScenarioRow?.dimensions?.audiences, ['宝妈']);
  assert.deepEqual(skuScenarioRow?.dimensions?.useCases, ['婴儿车和办公桌']);
  const brandSellingRow = result.sellingPoints.find((row) => row.title === '轻量便携');
  assert.deepEqual(brandSellingRow?.dimensions?.audiences, ['夏季通勤和带娃用户']);
  assert.ok(result.sellingPoints.some((row) => row.title.includes('创始人 IP 知识库：核心立场')));
  assert.ok(result.scenarios.some((row) => row.title.includes('创始人 IP 知识库 / 口播')));
  assert.ok(result.constraints.some((item) => item.includes('IP 核心立场不能漂移')));
  assert.ok(result.constraints.some((item) => item.includes('竞品观察只允许用于结构')));
  const competitorRows = [...result.sellingPoints, ...result.painPoints, ...result.scenarios]
    .filter((row) => row.tags.some((tag) => tag.includes('竞品')));
  assert.ok(competitorRows.length >= 3);
  assert.ok(competitorRows.every((row) => row.status === 'needs-review'));
  const quoteEvidenceIds = new Set(result.evidence
    .filter((item) => item.sourceType === 'user-quote')
    .map((item) => item.id));
  assert.ok(quoteEvidenceIds.size >= 2);
  const feedbackPainRows = result.painPoints.filter((row) => row.tags.includes('用户原声'));
  assert.ok(feedbackPainRows.length >= 2);
  assert.ok(feedbackPainRows.every((row) => row.evidenceRefs.some((id) => quoteEvidenceIds.has(id))));
  const babyMomPlan = planContentMatrixRows({
    rows: [...result.sellingPoints, ...result.painPoints, ...result.scenarios],
    filter: { status: 'all', material: 'all', audience: '宝妈', channel: 'all', contentFormat: 'all', query: '' },
  });
  assert.ok(babyMomPlan.filteredRows.some((row) => row.title.includes('A02')));
  assert.equal(babyMomPlan.summary.audienceCount >= 1, true);
});

test('内容知识地图生成服务未配置时只保存待配置记录且不生成伪矩阵', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const productSource = await inputSources.register({
      workspacePath,
      kind: 'text',
      purpose: 'product-brief',
      title: '防晒产品 brief',
      tags: ['产品'],
      text: '防晒乳，主打清爽肤感，适合通勤补涂。',
    });
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    const service = new ContentKnowledgeMapApplicationService(
      mapStore,
      buildRunStore,
      inputSources,
      new BrandKnowledgeBaseStore(text),
      new IpKnowledgeBaseStore(text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      new PromptDraftStore(inputSources, text),
      new AssetReviewStore(),
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'local-only',
          message: '本机草稿。',
        }),
      },
      {
        getRuntimeConfig: async () => {
          throw new TextProviderBlockedError('生成服务待配置：请先配置文字生成服务。');
        },
      },
    );

    const record = await service.build({
      workspacePath,
      title: '防晒内容知识地图',
      inputSourceIds: [productSource.id],
    });

    assert.equal(record.status, 'blocked');
    assert.equal(record.model, 'blocked:text-provider');
    assert.deepEqual(record.sourceInputSourceIds, [productSource.id]);
    assert.deepEqual(record.sellingPoints, []);
    assert.deepEqual(record.painPoints, []);
    assert.deepEqual(record.scenarios, []);
    assert.deepEqual(record.evidence, []);
    assert.equal(record.coverage.readyPercent, 0);
    assert.match(record.gaps[0], /生成服务待配置/);
    const persisted = await mapStore.list(workspacePath);
    assert.equal(persisted[0].status, 'blocked');
    const buildRuns = await buildRunStore.list(workspacePath);
    assert.equal(buildRuns.length, 1);
    assert.equal(buildRuns[0].status, 'blocked');
    assert.equal(buildRuns[0].contentKnowledgeMapId, record.id);
    assert.equal(buildRuns[0].readyPercent, 0);
    assert.ok(buildRuns[0].steps.some((step) => step.key === 'model-config' && step.status === 'blocked'));
    assert.ok(buildRuns[0].steps.some((step) => step.key === 'structure-output' && step.status === 'skipped'));
  });
});

test('内容知识地图缺少结构化生成接口时不会保存本地规则伪结果', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const productSource = await inputSources.register({
      workspacePath,
      kind: 'text',
      purpose: 'product-brief',
      title: '防晒产品 brief',
      tags: ['产品'],
      text: '防晒乳，主打清爽肤感，适合通勤补涂。',
    });
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    const service = new ContentKnowledgeMapApplicationService(
      mapStore,
      buildRunStore,
      inputSources,
      new BrandKnowledgeBaseStore(text),
      new IpKnowledgeBaseStore(text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      new PromptDraftStore(inputSources, text),
      new AssetReviewStore(),
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'local-only',
          message: '本机草稿。',
        }),
      },
      {
        getRuntimeConfig: async () => ({ model: 'legacy-runtime-without-json' }),
      },
    );

    const record = await service.build({
      workspacePath,
      title: '防晒内容知识地图',
      inputSourceIds: [productSource.id],
    });

    assert.equal(record.status, 'blocked');
    assert.equal(record.model, 'blocked:text-provider');
    assert.deepEqual(record.sellingPoints, []);
    assert.deepEqual(record.evidence, []);
    assert.match(record.gaps[0], /结构化输出/);
    const buildRuns = await buildRunStore.list(workspacePath);
    assert.equal(buildRuns.length, 1);
    assert.equal(buildRuns[0].status, 'blocked');
    assert.ok(buildRuns[0].steps.some((step) => step.key === 'structure-output' && step.status === 'blocked'));
  });
});

test('内容知识地图构建会调用文字模型生成结构化矩阵而不是只用本地规则', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const productSource = await inputSources.register({
      workspacePath,
      kind: 'text',
      purpose: 'product-brief',
      title: '通勤防晒产品 brief',
      tags: ['产品', '通勤'],
      text: '防晒乳，主打清爽肤感，适合通勤补涂。不能承诺治疗或绝对防护。',
    });
    const brandStore = new BrandKnowledgeBaseStore(text);
    const brand = await brandStore.generate({
      workspacePath,
      title: '通勤防晒品牌知识库',
      citations: [{
        knowledgeBaseId: 'kb-sunscreen',
        sectionId: 'product-brief',
        title: '通勤防晒 / 产品',
        sectionType: 'product',
        excerpt: '防晒乳，主打清爽肤感，适合通勤补涂。',
      }],
    });
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    const service = new ContentKnowledgeMapApplicationService(
      mapStore,
      buildRunStore,
      inputSources,
      brandStore,
      new IpKnowledgeBaseStore(text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      new PromptDraftStore(inputSources, text),
      new AssetReviewStore(),
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'local-only',
          message: '本机草稿。',
        }),
      },
      text,
    );

    const record = await service.build({
      workspacePath,
      title: '通勤防晒内容知识地图',
      inputSourceIds: [productSource.id],
      brandKnowledgeBaseIds: [brand.id],
    });

    const mapCall = text.calls.find((call) => {
      try {
        return JSON.parse(call.prompt).task === 'generate_content_knowledge_map';
      } catch {
        return false;
      }
    });
    assert.ok(mapCall);
    assert.equal(record.model, 'fake-text-model');
    assert.equal(record.sellingPoints[0].title, '模型命名卖点：通勤清爽补涂');
    assert.equal(record.painPoints[0].title, '模型归纳痛点：担心补涂厚重');
    assert.equal(record.scenarios[0].title, '模型组合场景：通勤包内补涂');
    assert.ok(record.sellingPoints[0].evidenceRefs.length >= 1);
    assert.ok(record.gaps.some((item) => item.includes('模型识别缺口')));
    assert.equal(record.coverage.evidenceCount >= 1, true);
    const persisted = await mapStore.list(workspacePath);
    assert.equal(persisted[0].id, record.id);
    const buildRuns = await buildRunStore.list(workspacePath);
    assert.equal(buildRuns.length, 1);
    assert.equal(buildRuns[0].status, 'completed');
    assert.equal(buildRuns[0].contentKnowledgeMapId, record.id);
    assert.equal(buildRuns[0].model, 'fake-text-model');
    assert.ok(buildRuns[0].readyPercent > 0);
    assert.ok(buildRuns[0].evidenceCount >= 1);
    assert.ok(buildRuns[0].steps.some((step) => step.key === 'prepare-seed' && step.status === 'completed'));
    assert.ok(buildRuns[0].steps.some((step) => step.key === 'structure-output' && step.status === 'completed'));
    assert.ok(buildRuns[0].steps.some((step) => step.key === 'quality-check' && step.status === 'completed'));
  });
});

test('内容知识地图构建会同步地图快照和生成流程到团队事实源', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const productSource = await inputSources.register({
      workspacePath,
      kind: 'text',
      purpose: 'product-brief',
      title: '通勤防晒产品 brief',
      tags: ['产品', '通勤'],
      text: '防晒乳，主打清爽肤感，适合通勤补涂。',
    });
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    const syncedMaps = [];
    const syncedRuns = [];
    const service = new ContentKnowledgeMapApplicationService(
      mapStore,
      buildRunStore,
      inputSources,
      new BrandKnowledgeBaseStore(text),
      new IpKnowledgeBaseStore(text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      new PromptDraftStore(inputSources, text),
      new AssetReviewStore(),
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'pending-sync',
          message: '准备同步到团队事实源。',
          workspaceId: 'workspace-team-1',
          revision: '10',
        }),
        upsertKnowledgeMapSnapshot: async ({ record }) => {
          syncedMaps.push(record);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '地图快照已同步。',
            workspaceId: 'workspace-team-1',
            revision: '11',
            baseRevision: '10',
          };
        },
        appendBuildRun: async ({ buildRun, sourceKnowledgeMap }) => {
          syncedRuns.push({ buildRun, sourceKnowledgeMap });
          return {
            backend: 'bugu',
            status: 'synced',
            message: '生成流程已同步。',
            workspaceId: 'workspace-team-1',
            revision: '12',
            baseRevision: '11',
          };
        },
      },
      text,
    );

    const record = await service.build({
      workspacePath,
      title: '通勤防晒内容知识地图',
      inputSourceIds: [productSource.id],
    });

    assert.equal(record.syncStatus, 'synced');
    assert.equal(record.teamSync.workspaceId, 'workspace-team-1');
    assert.equal(record.teamSync.revision, '12');
    assert.equal(syncedMaps.length, 1);
    assert.equal(syncedMaps[0].id, record.id);
    assert.equal(syncedMaps[0].sellingPoints[0].title, '模型命名卖点：通勤清爽补涂');
    assert.equal(syncedRuns.length, 1);
    assert.equal(syncedRuns[0].buildRun.contentKnowledgeMapId, record.id);
    assert.equal(syncedRuns[0].buildRun.teamSync?.revision, '11');
    assert.equal(syncedRuns[0].sourceKnowledgeMap?.teamSync.revision, '11');
    const persisted = await mapStore.list(workspacePath);
    assert.equal(persisted[0].teamSync.revision, '12');
    const buildRuns = await buildRunStore.list(workspacePath);
    assert.equal(buildRuns[0].teamSync?.revision, '12');
  });
});

test('内容知识地图构建会把素材审核记录作为真实输入且不泄漏本机路径', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const productSource = await inputSources.register({
      workspacePath,
      kind: 'text',
      purpose: 'product-brief',
      title: '通勤防晒产品 brief',
      tags: ['产品', '抖音', '短视频', '通勤'],
      text: '防晒乳，主打清爽肤感，适合通勤补涂。不能承诺治疗或绝对防护。',
    });
    const brandStore = new BrandKnowledgeBaseStore(text);
    const brand = await brandStore.generate({
      workspacePath,
      title: '通勤防晒品牌知识库',
      citations: [{
        knowledgeBaseId: 'kb-sunscreen',
        sectionId: 'product-brief',
        title: '通勤防晒 / 产品',
        sectionType: 'product',
        excerpt: '防晒乳，主打清爽肤感，适合通勤补涂。',
      }],
    });
    const assetReviews = new AssetReviewStore();
    const approvedAsset = await assetReviews.review({
      workspacePath,
      assetKey: `generated:private-assets:0:${join(workspacePath, 'private-assets', 'commute-sunscreen.mov')}`,
      kind: 'video',
      sourceType: 'input-source',
      sourceId: productSource.id,
      path: join(workspacePath, 'private-assets', 'commute-sunscreen.mov'),
      title: '通勤补涂实拍视频',
      status: 'approved',
      note: '覆盖清爽不搓泥卖点，可用于午后通勤补涂场景。',
      tags: ['抖音', '短视频', '通勤', '补涂', '高转化'],
    });
    const rejectedAsset = await assetReviews.review({
      workspacePath,
      assetKey: 'generated:manual:0:/Users/coso/private/rejected-office-video.mov',
      kind: 'video',
      sourceType: 'manual',
      path: '/Users/coso/private/rejected-office-video.mov',
      title: '办公室补涂失败镜头',
      status: 'rejected',
      note: '口播出现绝对防护表述，需要重拍。',
      tags: ['办公室', '短视频', '驳回'],
    });
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    const service = new ContentKnowledgeMapApplicationService(
      mapStore,
      buildRunStore,
      inputSources,
      brandStore,
      new IpKnowledgeBaseStore(text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      new PromptDraftStore(inputSources, text),
      assetReviews,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'local-only',
          message: '本机草稿。',
        }),
      },
      text,
    );

    const record = await service.build({
      workspacePath,
      title: '通勤防晒内容知识地图',
      inputSourceIds: [productSource.id],
      brandKnowledgeBaseIds: [brand.id],
    });
    const mapCall = text.calls.find((call) => {
      try {
        return JSON.parse(call.prompt).task === 'generate_content_knowledge_map';
      } catch {
        return false;
      }
    });
    assert.ok(mapCall);
    const promptPayload = JSON.parse(mapCall.prompt);
    const promptText = JSON.stringify(promptPayload);
    assert.ok(promptPayload.sources.some((source) => source.kind === 'asset-review' && source.id === approvedAsset.id));
    assert.ok(promptPayload.seed.evidence.some((item) => item.sourceType === 'asset-review' && item.sourceRef === `asset-review:${approvedAsset.id}`));
    assert.equal(promptPayload.seed.assetReviewCount, 2);
    assert.equal(promptText.includes('private-assets'), false);
    assert.equal(promptText.includes('/Users/coso/private'), false);
    assert.equal(promptText.includes('commute-sunscreen.mov'), false);
    assert.equal(promptText.includes(approvedAsset.assetKey), false);
    assert.equal(promptText.includes(rejectedAsset.assetKey), false);

    assert.equal(record.coverage.assetReviewCount, 2);
    assert.ok(record.evidence.some((item) => item.sourceType === 'asset-review' && item.sourceId === approvedAsset.id));
    assert.ok(record.evidence.some((item) => item.sourceType === 'asset-review' && item.sourceId === rejectedAsset.id));
    const allRows = [...record.sellingPoints, ...record.painPoints, ...record.scenarios];
    const approvedRows = allRows.filter((row) => row.materialRefs?.includes(approvedAsset.id));
    assert.ok(approvedRows.some((row) => row.materialStatus === 'approved'));
    assert.ok(approvedRows.some((row) => row.performanceTags?.includes('高转化')));
    assert.ok(allRows.some((row) => row.materialRefs?.includes(rejectedAsset.id) && row.materialStatus === 'rejected'));
    const persistedText = JSON.stringify(await mapStore.list(workspacePath));
    assert.equal(persistedText.includes('private-assets'), false);
    assert.equal(persistedText.includes('/Users/coso/private'), false);
    assert.equal(persistedText.includes(approvedAsset.assetKey), false);
    assert.equal(persistedText.includes(rejectedAsset.assetKey), false);
  });
});

test('内容知识地图校验和生产交接会拦截禁用表达、竞品直交和 IP 漂移', () => {
  const now = '2026-05-29T00:00:00.000Z';
  const inputSources = [{
    id: 'source-boundary-1',
    workspacePath: '/tmp/content-studio-boundary',
    kind: 'text',
    status: 'converted',
    purpose: 'competitor-observation',
    title: '竞品观察',
    tags: ['竞品'],
    summary: '竞品使用绝对安全表达。',
    extractedText: '竞品使用绝对安全表达。',
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
  }];
  const forbiddenRow = {
    id: 'row-forbidden-1',
    title: '绝对安全',
    summary: '承诺 100% 绝对安全。',
    tags: ['卖点'],
    sourceRefs: ['input-source:source-boundary-1'],
    evidenceRefs: ['evidence-boundary-1'],
    confidence: 90,
    status: 'ready',
  };
  const ipDriftRow = {
    id: 'row-ip-drift-1',
    title: '创始人 IP：专家认证',
    summary: '我是小家电专家认证，保证好用。',
    tags: ['IP语言', '口播规则'],
    sourceRefs: ['ip-knowledge-base:ip-boundary-1'],
    evidenceRefs: ['evidence-boundary-1'],
    confidence: 88,
    status: 'ready',
  };
  const competitorRow = {
    id: 'row-competitor-1',
    title: '差异化机会：竞品超长续航打法',
    summary: '只应用作结构观察，不能直接复用。',
    tags: ['竞品观察', '差异化机会'],
    sourceRefs: ['input-source:source-boundary-1'],
    evidenceRefs: ['evidence-boundary-1'],
    confidence: 70,
    status: 'ready',
  };
  const forbiddenMarkerRow = {
    id: 'row-forbidden-marker-1',
    title: '低刺激日常口径',
    summary: '这条组合已标记禁止使用，不能交给下游生产。',
    tags: ['禁用表达'],
    sourceRefs: ['brand-knowledge-base:brand-boundary-1'],
    evidenceRefs: ['evidence-boundary-1'],
    confidence: 82,
    status: 'ready',
  };
  const build = {
    title: '边界校验内容地图',
    sourceInputSourceIds: ['source-boundary-1'],
    brandKnowledgeBaseIds: ['brand-boundary-1'],
    ipKnowledgeBaseIds: ['ip-boundary-1'],
    sceneCardIds: ['scene-boundary-1'],
    promptDraftIds: ['draft-boundary-1'],
    sellingPoints: [forbiddenRow, ipDriftRow, competitorRow, forbiddenMarkerRow],
    painPoints: [],
    scenarios: [],
    evidence: [{
      id: 'evidence-boundary-1',
      sourceType: 'manual',
      sourceTitle: '审核记录',
      claim: '边界测试证据',
      excerpt: '边界测试证据',
      status: 'ready',
    }],
    constraints: ['IP 语言规则：少用绝对词。', '禁止复制竞品 Logo、包装、文案、人物肖像或可识别创意元素。'],
    model: 'functional-test',
    skuRowCount: 0,
    competitorObservationCount: 1,
    assetReviewCount: 0,
  };
  const validation = validateContentKnowledgeMapBuild(build, inputSources);
  assert.equal(validation.status, 'needs-review');
  assert.ok(validation.gaps.some((gap) => gap.includes('禁用或绝对化表达')));
  assert.ok(validation.gaps.some((gap) => gap.includes('IP 表达疑似偏离')));
  assert.ok(validation.gaps.some((gap) => gap.includes('竞品观察不能直接作为可发布内容')));

  const baseTask = {
    id: 'review-boundary-1',
    workspacePath: '/tmp/content-studio-boundary',
    sourceKnowledgeMapId: 'map-boundary-1',
    sourceKnowledgeMapTitle: '边界校验内容地图',
    targetType: 'selling-point',
    targetId: 'row-boundary-1',
    title: '边界审核',
    summary: '已人工通过但仍需发布检查。',
    evidenceRefs: ['evidence-boundary-1'],
    sourceRefs: ['input-source:source-boundary-1'],
    risk: 'low',
    status: 'approved',
    suggestedAction: 'approve',
    issueLabels: [],
    decisions: [],
    createdAt: now,
    updatedAt: now,
  };
  const map = {
    id: 'map-boundary-1',
    workspacePath: '/tmp/content-studio-boundary',
    title: '边界校验内容地图',
    status: 'ready',
    syncStatus: 'synced',
    teamSync: { backend: 'bugu', status: 'synced', message: '已同步。' },
    sourceInputSourceIds: ['source-boundary-1'],
    brandKnowledgeBaseIds: ['brand-boundary-1'],
    ipKnowledgeBaseIds: ['ip-boundary-1'],
    sceneCardIds: [],
    promptDraftIds: [],
    sellingPoints: [forbiddenRow, ipDriftRow, competitorRow],
    painPoints: [],
    scenarios: [],
    evidence: build.evidence,
    constraints: build.constraints,
    gaps: [],
    coverage: {
      inputSourceCount: 1,
      brandKnowledgeBaseCount: 1,
      ipKnowledgeBaseCount: 1,
      sceneCardCount: 0,
      promptDraftCount: 1,
      evidenceCount: 1,
      gapCount: 0,
      readyPercent: 100,
    },
    model: 'functional-test',
    createdAt: now,
    updatedAt: now,
  };
  const readyEvidence = map.evidence;

  const forbiddenPolicy = checkContentProductionHandoff({ task: baseTask, map, row: forbiddenRow, readyEvidence });
  assert.equal(forbiddenPolicy.allowed, false);
  assert.ok(forbiddenPolicy.issues.some((issue) => issue.includes('禁用或绝对化表达')));

  const competitorPolicy = checkContentProductionHandoff({ task: baseTask, map, row: competitorRow, readyEvidence });
  assert.equal(competitorPolicy.allowed, false);
  assert.ok(competitorPolicy.issues.some((issue) => issue.includes('竞品观察只能用于结构')));

  const forbiddenMarkerPolicy = checkContentProductionHandoff({ task: baseTask, map, row: forbiddenMarkerRow, readyEvidence });
  assert.equal(forbiddenMarkerPolicy.allowed, false);
  assert.ok(forbiddenMarkerPolicy.issues.some((issue) => issue.includes('已标记为禁用或高风险')));

  const ipDriftPolicy = checkContentProductionHandoff({ task: baseTask, map, row: ipDriftRow, readyEvidence });
  assert.equal(ipDriftPolicy.allowed, false);
  assert.ok(ipDriftPolicy.issues.some((issue) => issue.includes('IP 表达疑似偏离')));

  const [ipDriftReviewTask] = buildContentReviewTasksFromMap('/tmp/content-studio-boundary', map, {
    targetRowIds: ['row-ip-drift-1'],
  });
  assert.equal(ipDriftReviewTask.risk, 'high');
  assert.ok(ipDriftReviewTask.issueLabels.includes('IP 口径漂移'));
  assert.equal(ipDriftReviewTask.suggestedAction, 'downgrade-to-needs-verification');
});

test('内容知识地图校验能发现重复、孤立和粒度异常条目', () => {
  const now = '2026-05-29T00:00:00.000Z';
  const inputSources = [{
    id: 'source-quality-1',
    workspacePath: '/tmp/content-studio-quality',
    kind: 'markdown',
    purpose: 'product-brief',
    status: 'converted',
    title: '产品资料',
    summary: '通勤背包产品资料。',
    extractedText: '轻量便携，适合日常通勤。',
    tags: [],
    artifactRefs: [],
    createdAt: now,
    updatedAt: now,
  }];
  const evidence = {
    id: 'evidence-quality-1',
    sourceType: 'input-source',
    sourceId: 'source-quality-1',
    sourceTitle: '产品资料',
    claim: '轻量便携',
    excerpt: '轻量便携，适合日常通勤。',
    status: 'ready',
  };
  const baseRow = {
    summary: '适合每天通勤携带电脑和文件。',
    tags: ['卖点'],
    sourceRefs: ['input-source:source-quality-1'],
    evidenceRefs: ['evidence-quality-1'],
    confidence: 82,
    status: 'ready',
  };
  const validation = validateContentKnowledgeMapBuild({
    title: '质量校验内容地图',
    sourceInputSourceIds: ['source-quality-1'],
    brandKnowledgeBaseIds: ['brand-quality-1'],
    ipKnowledgeBaseIds: [],
    sceneCardIds: ['scene-quality-1'],
    promptDraftIds: ['draft-quality-1'],
    sellingPoints: [
      { ...baseRow, id: 'row-duplicate-a', title: '轻量便携' },
      { ...baseRow, id: 'row-duplicate-b', title: '轻量便携方案' },
      {
        id: 'row-isolated-1',
        title: '孤立卖点',
        summary: '没有来源也没有证据。',
        tags: ['卖点'],
        sourceRefs: [],
        evidenceRefs: [],
        confidence: 45,
        status: 'needs-review',
      },
      { ...baseRow, id: 'row-granularity-1', title: '轻' },
    ],
    painPoints: [{ ...baseRow, id: 'pain-quality-1', title: '通勤背负疲劳', tags: ['痛点'] }],
    scenarios: [{ ...baseRow, id: 'scene-quality-1', title: '地铁通勤', tags: ['场景'] }],
    evidence: [evidence],
    constraints: ['防泼不等于完全防水。'],
    model: 'functional-test',
    skuRowCount: 0,
    competitorObservationCount: 0,
    assetReviewCount: 0,
  }, inputSources);

  assert.equal(validation.status, 'needs-review');
  assert.ok(validation.gaps.some((gap) => gap.includes('重复或近似')));
  assert.ok(validation.gaps.some((gap) => gap.includes('孤立')));
  assert.ok(validation.gaps.some((gap) => gap.includes('粒度过粗')));
});

test('提示词依据只注入短摘录和已通过证据', () => {
  const longReadyExcerpt = `通过审核的证据${'，短摘录边界'.repeat(80)}`;
  const rejectedExcerpt = '未通过证据不应进入提示词依据。';
  const map = {
    id: 'map-grounding-1',
    workspacePath: '/tmp/content-studio-grounding',
    title: '提示词依据地图',
    status: 'ready',
    syncStatus: 'synced',
    teamSync: { backend: 'bugu', status: 'synced', message: '已同步。' },
    sourceInputSourceIds: ['source-grounding-1'],
    brandKnowledgeBaseIds: ['brand-grounding-1'],
    sceneCardIds: [],
    promptDraftIds: [],
    sellingPoints: [],
    painPoints: [],
    scenarios: [],
    evidence: [{
      id: 'evidence-ready-1',
      sourceType: 'manual',
      sourceTitle: '人工证据表',
      claim: '轻薄肤感经过人工确认。',
      excerpt: longReadyExcerpt,
      status: 'ready',
    }, {
      id: 'evidence-rejected-1',
      sourceType: 'manual',
      sourceTitle: '未通过证据',
      claim: '未通过证据',
      excerpt: rejectedExcerpt,
      status: 'needs-review',
    }],
    constraints: ['不得补写没有证据支持的销量和功效承诺。'],
    gaps: [],
    coverage: {
      inputSourceCount: 1,
      brandKnowledgeBaseCount: 1,
      sceneCardCount: 0,
      promptDraftCount: 0,
      evidenceCount: 2,
      gapCount: 0,
      readyPercent: 100,
    },
    model: 'functional-test',
    createdAt: '2026-05-29T00:00:00.000Z',
    updatedAt: '2026-05-29T00:00:00.000Z',
  };
  const row = {
    id: 'row-grounding-1',
    title: '轻薄肤感',
    summary: `已审核卖点${'，只保留必要摘要'.repeat(60)}`,
    tags: ['卖点', '通勤'],
    sourceRefs: ['brand-knowledge-base:brand-grounding-1'],
    evidenceRefs: ['evidence-ready-1', 'evidence-rejected-1'],
    confidence: 88,
    status: 'ready',
  };
  const task = {
    id: 'review-grounding-1',
    workspacePath: '/tmp/content-studio-grounding',
    sourceKnowledgeMapId: 'map-grounding-1',
    sourceKnowledgeMapTitle: '提示词依据地图',
    targetType: 'selling-point',
    targetId: row.id,
    title: row.title,
    summary: row.summary,
    evidenceRefs: row.evidenceRefs,
    sourceRefs: row.sourceRefs,
    risk: 'low',
    status: 'approved',
    suggestedAction: 'approve',
    issueLabels: [],
    decisions: [],
    createdAt: '2026-05-29T00:00:00.000Z',
    updatedAt: '2026-05-29T00:00:00.000Z',
  };

  const grounding = buildPromptGroundingSummary({
    map,
    task,
    row,
    readyEvidence: [map.evidence[0]],
  });

  assert.equal(grounding.readyEvidenceCount, 1);
  assert.deepEqual(grounding.evidenceRefs, ['evidence-ready-1']);
  assert.match(grounding.content, /人工证据表/);
  assert.doesNotMatch(grounding.content, new RegExp(rejectedExcerpt));
  assert.ok(grounding.content.length < longReadyExcerpt.length + row.summary.length);
  assert.match(grounding.content, /只使用上面的可用主张、已通过证据和生成边界/);
});

test('内容矩阵规划支持筛选、排序、分页和本批摘要', () => {
  const rows = [{
    id: 'row-ready-1',
    title: '轻量通勤',
    summary: '适合通勤包携带。',
    tags: ['卖点', '通勤'],
    dimensions: {
      audiences: ['通勤用户'],
      channels: ['小红书'],
      contentFormats: ['图文'],
      useCases: ['通勤包携带'],
    },
    sourceRefs: ['brand-knowledge-base:brand-1'],
    evidenceRefs: ['evidence-1', 'evidence-2'],
    materialStatus: 'approved',
    confidence: 92,
    status: 'ready',
  }, {
    id: 'row-review-competitor-1',
    title: '差异化机会：竞品续航打法',
    summary: '只能作为结构观察，不能直接复用。',
    tags: ['竞品观察'],
    sourceRefs: ['input-source:competitor-1'],
    evidenceRefs: ['evidence-3'],
    confidence: 70,
    status: 'needs-review',
  }, {
    id: 'row-evidence-ip-1',
    title: '创始人 IP：测试后再推荐',
    summary: '口吻需要回到真实测试。',
    tags: ['IP语言'],
    sourceRefs: ['ip-knowledge-base:ip-1'],
    evidenceRefs: [],
    confidence: 48,
    status: 'needs-evidence',
  }, {
    id: 'row-ready-covered-1',
    title: '桌面夹扣场景',
    summary: '办公室桌面快速夹扣。',
    tags: ['场景'],
    dimensions: {
      audiences: ['办公用户'],
      channels: ['抖音'],
      contentFormats: ['短视频'],
      useCases: ['办公室桌面'],
    },
    sourceRefs: ['scene-card:scene-1'],
    evidenceRefs: ['evidence-4'],
    materialStatus: 'covered',
    confidence: 86,
    status: 'ready',
  }];

  const priorityPlan = planContentMatrixRows({
    rows,
    filter: { status: 'all', material: 'missing', query: '' },
    sortKey: 'priority',
    pageIndex: 0,
    pageSize: 2,
    batchSize: 1,
  });
  assert.deepEqual(priorityPlan.pageRows.map((row) => row.id), ['row-evidence-ip-1', 'row-review-competitor-1']);
  assert.equal(priorityPlan.pageCount, 1);
  assert.equal(priorityPlan.batchRows[0].id, 'row-evidence-ip-1');
  assert.equal(priorityPlan.summary.materialMissingCount, 2);
  assert.equal(priorityPlan.summary.needsEvidenceCount, 1);
  assert.equal(priorityPlan.summary.competitorRiskCount, 1);
  assert.equal(priorityPlan.summary.ipLinkedCount, 1);

  const queryPlan = planContentMatrixRows({
    rows,
    filter: { status: 'ready', material: 'available', query: '通勤' },
    sortKey: 'confidence-desc',
    pageIndex: 0,
    pageSize: 1,
    batchSize: 1,
  });
  assert.deepEqual(queryPlan.filteredRows.map((row) => row.id), ['row-ready-1']);
  assert.equal(queryPlan.summary.readyCount, 1);
  assert.equal(queryPlan.summary.audienceCount, 1);
  assert.equal(queryPlan.summary.channelCount, 1);
  assert.equal(queryPlan.summary.contentFormatCount, 1);

  const dimensionPlan = planContentMatrixRows({
    rows,
    filter: { status: 'ready', material: 'available', audience: '办公用户', channel: '抖音', contentFormat: '短视频', query: '' },
    sortKey: 'confidence-desc',
  });
  assert.deepEqual(dimensionPlan.filteredRows.map((row) => row.id), ['row-ready-covered-1']);
  assert.equal(dimensionPlan.summary.useCaseCount, 1);
});

test('指定矩阵行送审会包含 ready 行且不会带入未选行和缺口', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const reviewStore = new ContentReviewTaskStore();
    const now = '2026-05-29T00:00:00.000Z';
    const map = {
      id: 'map-targeted-review-1',
      workspacePath,
      title: '分批送审内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'map-rev-1',
      },
      sourceInputSourceIds: ['source-1'],
      brandKnowledgeBaseIds: ['brand-1'],
      sceneCardIds: ['scene-1'],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-ready-target',
        title: '轻量通勤',
        summary: '高证据 ready 行也需要分批送审。',
        tags: ['卖点'],
        sourceRefs: ['brand-knowledge-base:brand-1'],
        evidenceRefs: ['evidence-1'],
        materialStatus: 'approved',
        confidence: 92,
        status: 'ready',
      }, {
        id: 'selling-unselected',
        title: '夹扣稳固',
        summary: '未选中的行不能进入本批。',
        tags: ['卖点'],
        sourceRefs: ['brand-knowledge-base:brand-1'],
        evidenceRefs: ['evidence-1'],
        confidence: 88,
        status: 'ready',
      }],
      painPoints: [{
        id: 'pain-unselected',
        title: '担心噪音',
        summary: '未选中的痛点不能进入本批。',
        tags: ['痛点'],
        sourceRefs: ['input-source:source-1'],
        evidenceRefs: ['evidence-1'],
        confidence: 77,
        status: 'ready',
      }],
      scenarios: [{
        id: 'scenario-ready-target',
        title: '办公室桌面',
        summary: '高证据 ready 场景也需要人工批准后交接。',
        tags: ['场景'],
        sourceRefs: ['scene-card:scene-1'],
        evidenceRefs: ['evidence-1'],
        materialStatus: 'covered',
        confidence: 86,
        status: 'ready',
      }],
      evidence: [{
        id: 'evidence-1',
        sourceType: 'manual',
        sourceTitle: '产品卖点确认表',
        claim: '轻量和桌面夹扣已有证据。',
        excerpt: '确认表记录轻量和桌面夹扣场景。',
        status: 'ready',
      }],
      constraints: ['涉及效果表达必须回到证据来源。'],
      gaps: ['这个缺口不属于本批送审。'],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 1,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 1,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    };
    await mapStore.save(map);

    const directTasks = buildContentReviewTasksFromMap(workspacePath, map, {
      targetRowIds: ['selling-ready-target', 'scenario-ready-target'],
    });
    assert.deepEqual(directTasks.map((task) => task.targetId).sort(), ['scenario-ready-target', 'selling-ready-target']);
    assert.ok(directTasks.every((task) => task.status === 'open'));
    assert.ok(directTasks.every((task) => task.targetType !== 'gap'));

    const syncCalls = [];
    const service = new ContentReviewTaskApplicationService(reviewStore, mapStore, {
      syncReviewTasks: async ({ tasks }) => {
        syncCalls.push(tasks);
        assert.deepEqual(tasks.map((task) => task.targetId).filter(Boolean).sort(), ['scenario-ready-target', 'selling-ready-target']);
        return {
          backend: 'bugu',
          status: 'synced',
          message: '本批审核任务已同步。',
          workspaceId: 'workspace-targeted-review',
          revision: `review-rev-${syncCalls.length}`,
        };
      },
      submitReviewDecision: async () => {
        throw new Error('本测试不提交审核结论。');
      },
    });

    const firstRun = await service.generate({
      workspacePath,
      contentKnowledgeMapId: 'map-targeted-review-1',
      targetRowIds: ['selling-ready-target', 'scenario-ready-target'],
    });
    assert.deepEqual(firstRun.map((task) => task.targetId).filter(Boolean).sort(), ['scenario-ready-target', 'selling-ready-target']);
    assert.equal(firstRun.length, 2);
    assert.ok(firstRun.every((task) => task.syncStatus === 'synced'));

    const secondRun = await service.generate({
      workspacePath,
      contentKnowledgeMapId: 'map-targeted-review-1',
      targetRowIds: ['selling-ready-target', 'scenario-ready-target'],
    });
    assert.equal(secondRun.length, 2);
    assert.deepEqual(secondRun.map((task) => task.targetId).filter(Boolean).sort(), ['scenario-ready-target', 'selling-ready-target']);
  });
});

test('同步冲突可以生成逐项合并处理清单且不默认覆盖团队版本', () => {
  const draft = buildContentSyncConflictMergeDraft({
    id: 'conflict-merge-plan-1',
    workspacePath: '/tmp/content-studio-merge-plan',
    workspaceId: 'workspace-merge-plan',
    sourceType: 'draft-change',
    sourceId: 'draft-merge-plan',
    title: '卖点命名冲突',
    summary: '本机基于旧版本提交，团队当前版本已更新。',
    status: 'open',
    baseRevision: 'rev-1',
    serverRevision: 'rev-2',
    affectedObjectIds: ['selling-1', 'gap-1'],
    affectedObjects: [{
      id: 'selling-point:selling-1',
      objectId: 'selling-1',
      objectType: 'selling-point',
      title: '轻量通勤',
      summary: '本机建议把轻量便携改名为轻量通勤。',
      localValue: '轻量通勤 / 可交付 / 2 条证据',
      teamValue: '轻量便携 / 已用于小红书脚本',
      impact: 'high',
      recommendation: '命名影响下游脚本，必须人工确认。',
    }, {
      id: 'gap:gap-1',
      objectId: 'gap-1',
      objectType: 'gap',
      title: '缺少噪音测试',
      summary: '本机新增待补资料。',
      localValue: '需要补充低档噪音测试报告',
      teamValue: '团队当前未记录该缺口',
      impact: 'medium',
      recommendation: '可作为补充资料缺口提交。',
    }],
    authorLabel: '功能测试',
    createdAt: '2026-05-29T00:00:00.000Z',
    updatedAt: '2026-05-29T00:00:00.000Z',
  });

  assert.equal(draft.rows.length, 2);
  assert.equal(draft.manualReviewCount, 1);
  assert.equal(draft.autoAppendCount, 1);
  assert.equal(draft.rows[0].suggestedDecision, 'manual-review');
  assert.equal(draft.rows[0].canApplyAutomatically, false);
  assert.equal(draft.rows[1].suggestedDecision, 'append-local');
  assert.equal(draft.rows[1].canApplyAutomatically, true);
  assert.match(draft.summary, /人工确认/);
});

test('内容团队共享服务能提交变更包并发布团队知识包版本', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const draftStore = new ContentDraftChangeStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const now = '2026-05-28T00:00:00.000Z';
    await mapStore.save({
      id: 'map-ready-1',
      workspacePath,
      title: '夏季防晒产品内容地图',
      status: 'ready',
      syncStatus: 'local-only',
      teamSync: {
        backend: 'bugu',
        status: 'local-only',
        message: '本机草稿。',
      },
      sourceInputSourceIds: ['source-1'],
      brandKnowledgeBaseIds: ['brand-1'],
      sceneCardIds: ['scene-1'],
      promptDraftIds: ['prompt-1'],
      sellingPoints: [{
        id: 'selling-1',
        title: '轻薄不闷肤',
        summary: '适合通勤补涂，强调肤感和防晒场景。',
        tags: ['卖点', '防晒'],
        sourceRefs: ['brand-knowledge-base:brand-1'],
        evidenceRefs: ['evidence-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-1'],
        confidence: 88,
        status: 'ready',
      }],
      painPoints: [{
        id: 'pain-1',
        title: '怕油腻搓泥',
        summary: '评论中反复出现的购买异议。',
        tags: ['痛点', '评论'],
        sourceRefs: ['input-source:source-1'],
        evidenceRefs: ['evidence-1'],
        confidence: 84,
        status: 'ready',
      }],
      scenarios: [{
        id: 'scenario-1',
        title: '通勤包补涂',
        summary: '地铁、办公室和户外切换时的快速补涂。',
        tags: ['场景', '通勤'],
        sourceRefs: ['scene-card:scene-1'],
        evidenceRefs: ['evidence-1'],
        confidence: 82,
        status: 'ready',
      }],
      evidence: [{
        id: 'evidence-1',
        sourceType: 'manual',
        sourceTitle: '产品卖点确认表',
        claim: '用户关注清爽肤感和补涂便利性。',
        excerpt: '调研记录显示，清爽、便携和不搓泥是主要决策点。',
        status: 'ready',
      }],
      constraints: ['涉及防晒效果时必须引用检测或备案信息。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 1,
        promptDraftCount: 1,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });

    const syncCalls = [];
    const service = new ContentWorkspaceSyncService(
      mapStore,
      draftStore,
      releaseStore,
      new AgentKnowledgeContentExportService(mapStore),
      {
        submitDraftChange: async (input) => {
          syncCalls.push({ kind: 'draft', input });
          assert.equal(input.contentKnowledgeMapId, 'map-ready-1');
          assert.equal(input.syncStatus, 'pending-sync');
          assert.equal(input.issues.length, 0);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '已同步到测试团队工作区。',
            workspaceId: 'workspace-test-1',
            revision: 'rev-2',
            baseRevision: input.baseRevision,
            lastSyncedAt: '2026-05-28T00:01:00.000Z',
          };
        },
        publishRelease: async (input) => {
          syncCalls.push({ kind: 'release', input });
          assert.equal(input.contentKnowledgeMapId, 'map-ready-1');
          assert.equal(input.workspaceId, 'workspace-test-1');
          assert.equal(input.status, 'local-preview');
          assert.equal(input.baseRevision, 'rev-2');
          assert.ok(input.files.includes('KNOWLEDGE.md'));
          assert.ok(input.files.includes('ontology/ontology.json'));
          assert.ok(input.files.includes('manifest.json'));
          assert.ok(input.packageArchivePath);
          assert.equal(input.packageArchiveFileName, '夏季防晒产品内容地图.agentknowledge.zip');
          assert.ok(input.packageArchiveSize > 0);
          assert.match(input.packageArchiveSha256 || '', /^[a-f0-9]{64}$/);
          assert.doesNotMatch(JSON.stringify(input.files), /\/Users\/|\/tmp\/content-studio-functional/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '已发布为测试团队知识包版本。',
            workspaceId: 'workspace-test-1',
            revision: 'rev-3',
            baseRevision: input.baseRevision,
            releaseId: 'release-test-1',
            packageObjectKey: 'content-workspaces/workspace-test-1/agentknowledge/release-test-1.zip',
            packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-test-1/agentknowledge/release-test-1.zip',
            packageUploadStatus: 'registered',
            lastSyncedAt: '2026-05-28T00:02:00.000Z',
          };
        },
      },
    );

    const created = await service.createDraftChange({ workspacePath, contentKnowledgeMapId: 'map-ready-1', authorLabel: '功能测试' });
    assert.equal(created.status, 'created');
    assert.equal(created.draftChange?.syncStatus, 'local-draft');
    assert.match(created.draftChange?.summary ?? '', /1 个卖点/);

    const exported = await service.exportDraftChange({ workspacePath, draftChangeId: created.draftChange.id });
    assert.equal(exported.status, 'exported');
    assert.equal(existsSync(exported.manifestPath), true);
    assert.equal(existsSync(exported.draftChangePath), true);
    assert.ok(exported.files?.includes('manifest.json'));
    assert.ok(exported.files?.includes('draft-change.json'));
    const exportedDraftChangeText = await readFile(exported.draftChangePath, 'utf-8');
    assert.doesNotMatch(exportedDraftChangeText, /workspacePath|api[_-]?key|secret|token|password|\/Users\/|\/tmp\/content-studio-functional/);

    const imported = await service.importDraftChange({
      workspacePath: join(workspacePath, 'import-target'),
      packagePath: exported.packageDir,
      authorLabel: '用户 B',
    });
    assert.equal(imported.status, 'imported');
    assert.equal(imported.draftChange?.syncStatus, 'local-draft');
    assert.equal(imported.draftChange?.contentKnowledgeMapId, 'map-ready-1');
    assert.equal(imported.draftChange?.authorLabel, '用户 B');
    assert.notEqual(imported.draftChange?.id, created.draftChange.id);

    const submitted = await service.submitDraftChange({ workspacePath, draftChangeId: created.draftChange.id, authorLabel: '功能测试' });
    assert.equal(submitted.status, 'submitted');
    assert.equal(submitted.teamSync?.revision, 'rev-2');
    const [syncedMap] = await mapStore.list(workspacePath);
    assert.equal(syncedMap.syncStatus, 'synced');
    assert.equal(syncedMap.teamSync.revision, 'rev-2');

    const released = await service.createKnowledgeRelease({ workspacePath, contentKnowledgeMapId: 'map-ready-1', title: '防晒内容团队包' });
    assert.equal(released.status, 'released');
    assert.equal(released.release?.status, 'published');
    assert.equal(released.release?.serverReleaseId, 'release-test-1');
    assert.equal(released.release?.packagePublicUrl, 'https://downloads.bugu.run/content-workspaces/workspace-test-1/agentknowledge/release-test-1.zip');
    assert.equal(released.teamSync?.revision, 'rev-3');
    assert.equal(syncCalls.map((call) => call.kind).join(' -> '), 'draft -> release');
  });
});

test('v1 本地事实源并发写入不会丢失审核和生产交接记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const reviewStore = new ContentReviewTaskStore();
    const handoffStore = new ContentProductionHandoffStore();
    const now = '2026-05-30T00:00:00.000Z';

    const mapRecord = (index) => ({
      id: `map-concurrent-${index}`,
      workspacePath,
      title: `并发内容地图 ${index}`,
      status: 'ready',
      syncStatus: 'local-only',
      teamSync: {
        backend: 'bugu',
        status: 'local-only',
        message: '本机草稿。',
      },
      sourceInputSourceIds: [`source-concurrent-${index}`],
      brandKnowledgeBaseIds: [`brand-concurrent-${index}`],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-local-current-refresh',
        title: '本机完整卖点',
        summary: '本机已同步且更新的完整矩阵内容。',
        tags: ['本机'],
        sourceRefs: [],
        evidenceRefs: [],
        confidence: 92,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: [],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 0,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: `${now}.${index}`,
      updatedAt: `${now}.${index}`,
    });

    await Promise.all(Array.from({ length: 12 }, (_, index) => mapStore.save(mapRecord(index))));
    const maps = await mapStore.list(workspacePath);
    assert.equal(maps.length, 12);
    assert.equal(new Set(maps.map((item) => item.id)).size, 12);

    const reviewTasks = Array.from({ length: 12 }, (_, index) => ({
      id: `review-concurrent-${index}`,
      workspacePath,
      sourceKnowledgeMapId: `map-concurrent-${index}`,
      sourceKnowledgeMapTitle: `并发内容地图 ${index}`,
      targetType: 'selling-point',
      targetId: `selling-concurrent-${index}`,
      title: `并发审核任务 ${index}`,
      summary: '并发写入验证。',
      evidenceRefs: [],
      sourceRefs: [`input-source:source-concurrent-${index}`],
      risk: 'low',
      status: 'open',
      suggestedAction: 'approve',
      issueLabels: [],
      decisions: [],
      createdAt: `${now}.${index}`,
      updatedAt: `${now}.${index}`,
    }));

    await Promise.all(reviewTasks.map((task) => reviewStore.saveMany(workspacePath, [task])));
    const tasks = await reviewStore.list(workspacePath);
    assert.equal(tasks.length, 12);
    assert.equal(new Set(tasks.map((item) => item.id)).size, 12);

    const handoffRecord = (index) => ({
      id: `handoff-concurrent-${index}`,
      workspacePath,
      reviewTaskId: `review-concurrent-${index}`,
      target: 'prompt-draft',
      status: 'created',
      batchId: `batch-concurrent-${index}`,
      issues: [],
      sourceKnowledgeMapId: `map-concurrent-${index}`,
      sourceKnowledgeMapTitle: `并发内容地图 ${index}`,
      coverageRowIds: [`selling-concurrent-${index}`],
      sourceRefs: [`input-source:source-concurrent-${index}`],
      evidenceRefs: [],
      promptDraftId: `prompt-concurrent-${index}`,
      actorLabel: '功能测试',
      actionRecords: [{
        id: `handoff-action-concurrent-${index}`,
        batchId: `batch-concurrent-${index}`,
        actionType: 'create-prompt-draft',
        outcome: 'handoff',
        title: `并发交接 ${index}`,
        inputSummary: '并发写入验证。',
        outputSummary: '已创建 Prompt 草稿。',
        actorLabel: '功能测试',
        coverageRowIds: [`selling-concurrent-${index}`],
        evidenceRefs: [],
        sourceRefs: [`input-source:source-concurrent-${index}`],
        promptDraftId: `prompt-concurrent-${index}`,
        checks: [],
        nextStep: '进入 agents 确认。',
        createdAt: `${now}.${index}`,
      }],
      createdAt: `${now}.${index}`,
    });

    await Promise.all(Array.from({ length: 12 }, (_, index) => handoffStore.append(handoffRecord(index))));
    const handoffs = await handoffStore.list(workspacePath);
    assert.equal(handoffs.length, 12);
    assert.equal(new Set(handoffs.map((item) => item.id)).size, 12);
    assert.equal(new Set(handoffs.flatMap((item) => item.actionRecords.map((record) => record.id))).size, 12);
  });
});

test('v1 本地事实源超过展示阈值仍保留生产审计历史', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    const draftStore = new ContentDraftChangeStore();
    const reviewStore = new ContentReviewTaskStore();
    const handoffStore = new ContentProductionHandoffStore();
    const baseMs = Date.parse('2026-05-30T00:10:00.000Z');
    const at = (index) => new Date(baseMs + index * 1000).toISOString();

    const mapRecord = (index) => ({
      id: `map-history-${index}`,
      workspacePath,
      title: `历史内容地图 ${index}`,
      status: 'ready',
      syncStatus: 'local-only',
      teamSync: { backend: 'bugu', status: 'local-only', message: '本机草稿。' },
      sourceInputSourceIds: [`source-history-${index}`],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: [],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 0,
        ipKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 0,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: at(index),
      updatedAt: at(index),
    });

    const buildRunRecord = (index) => ({
      id: `build-run-history-${index}`,
      workspacePath,
      title: `历史生成流程 ${index}`,
      status: 'completed',
      contentKnowledgeMapId: `map-history-${index}`,
      contentKnowledgeMapTitle: `历史内容地图 ${index}`,
      model: 'functional-test',
      inputSourceIds: [`source-history-${index}`],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      readyPercent: 100,
      evidenceCount: 1,
      gapCount: 0,
      issues: [],
      steps: [{
        key: 'quality-check',
        title: '质量检查',
        status: 'completed',
        message: '已通过。',
        startedAt: at(index),
        completedAt: at(index),
      }],
      teamSync: { backend: 'bugu', status: 'local-only', message: '本机草稿。' },
      startedAt: at(index),
      completedAt: at(index),
      updatedAt: at(index),
    });

    const draftChange = (index) => ({
      id: `draft-history-${index}`,
      workspacePath,
      contentKnowledgeMapId: `map-history-${index}`,
      contentKnowledgeMapTitle: `历史内容地图 ${index}`,
      title: `历史变更包 ${index}`,
      summary: '超过展示阈值仍需保留。',
      kind: 'knowledge-map-updated',
      affectedObjectIds: [`map-history-${index}`],
      affectedObjects: [],
      baseRevision: `rev-${index}`,
      syncStatus: 'local-draft',
      authorLabel: '功能测试',
      issues: [],
      createdAt: at(index),
      updatedAt: at(index),
    });

    const reviewTask = (index) => ({
      id: `review-history-${index}`,
      workspacePath,
      sourceKnowledgeMapId: `map-history-${index}`,
      sourceKnowledgeMapTitle: `历史内容地图 ${index}`,
      targetType: 'selling-point',
      targetId: `selling-history-${index}`,
      title: `历史审核任务 ${index}`,
      summary: '超过展示阈值仍需保留。',
      evidenceRefs: [`evidence-history-${index}`],
      sourceRefs: [`input-source:source-history-${index}`],
      risk: 'low',
      status: 'open',
      suggestedAction: 'approve',
      issueLabels: [],
      decisions: [],
      syncStatus: 'local-only',
      teamSync: { backend: 'bugu', status: 'local-only', message: '本机草稿。' },
      createdAt: at(index),
      updatedAt: at(index),
    });

    const handoffRecord = (index) => ({
      id: `handoff-history-${index}`,
      workspacePath,
      reviewTaskId: `review-history-${index}`,
      target: 'prompt-draft',
      status: 'created',
      batchId: `batch-history-${index}`,
      issues: [],
      sourceKnowledgeMapId: `map-history-${index}`,
      sourceKnowledgeMapTitle: `历史内容地图 ${index}`,
      coverageRowIds: [`selling-history-${index}`],
      sourceRefs: [`input-source:source-history-${index}`],
      evidenceRefs: [`evidence-history-${index}`],
      promptDraftId: `prompt-history-${index}`,
      actorLabel: '功能测试',
      syncStatus: 'local-only',
      teamSync: { backend: 'bugu', status: 'local-only', message: '本机草稿。' },
      actionRecords: [{
        id: `handoff-action-history-${index}`,
        batchId: `batch-history-${index}`,
        actionType: 'create-prompt-draft',
        outcome: 'handoff',
        title: `历史生产交接 ${index}`,
        inputSummary: '超过展示阈值仍需保留。',
        outputSummary: '已创建 Prompt 草稿。',
        actorLabel: '功能测试',
        coverageRowIds: [`selling-history-${index}`],
        evidenceRefs: [`evidence-history-${index}`],
        sourceRefs: [`input-source:source-history-${index}`],
        promptDraftId: `prompt-history-${index}`,
        checks: [],
        nextStep: '进入 agents 确认。',
        createdAt: at(index),
      }],
      createdAt: at(index),
    });

    await Promise.all(Array.from({ length: 61 }, (_, index) => mapStore.save(mapRecord(index))));
    await Promise.all(Array.from({ length: 201 }, (_, index) => buildRunStore.save(buildRunRecord(index))));
    await Promise.all(Array.from({ length: 241 }, (_, index) => draftStore.save(draftChange(index))));
    await Promise.all(Array.from({ length: 241 }, (_, index) => reviewStore.saveMany(workspacePath, [reviewTask(index)])));
    await Promise.all(Array.from({ length: 241 }, (_, index) => handoffStore.append(handoffRecord(index))));

    const maps = await mapStore.list(workspacePath);
    const buildRuns = await buildRunStore.list(workspacePath);
    const drafts = await draftStore.list(workspacePath);
    const reviews = await reviewStore.list(workspacePath);
    const handoffs = await handoffStore.list(workspacePath);

    assert.equal(maps.length, 61);
    assert.equal(buildRuns.length, 201);
    assert.equal(drafts.length, 241);
    assert.equal(reviews.length, 241);
    assert.equal(handoffs.length, 241);
    assert.ok(maps.some((item) => item.id === 'map-history-0'));
    assert.ok(buildRuns.some((item) => item.id === 'build-run-history-0'));
    assert.ok(drafts.some((item) => item.id === 'draft-history-0'));
    assert.ok(reviews.some((item) => item.id === 'review-history-0'));
    assert.ok(handoffs.some((item) => item.id === 'handoff-history-0'));
  });
});

test('v1 本地事实源禁止覆盖已有审核决策和已发布知识包版本', async () => {
  await withWorkspace(async (workspacePath) => {
    const reviewStore = new ContentReviewTaskStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const now = '2026-05-30T00:05:00.000Z';
    const reviewTask = {
      id: 'review-append-only-1',
      workspacePath,
      sourceKnowledgeMapId: 'map-append-only-1',
      sourceKnowledgeMapTitle: '追加不变量地图',
      targetType: 'selling-point',
      targetId: 'selling-append-only-1',
      title: '追加不变量审核任务',
      summary: '已有审核决策不能被覆盖。',
      evidenceRefs: ['evidence-append-only-1'],
      sourceRefs: ['input-source:append-only-1'],
      risk: 'low',
      status: 'approved',
      suggestedAction: 'approve',
      issueLabels: [],
      decisions: [{
        id: 'decision-append-only-1',
        taskId: 'review-append-only-1',
        action: 'approve',
        reviewerLabel: '审核员 A',
        reason: '证据已确认。',
        beforeSnapshot: {},
        afterSnapshot: {},
        createdAt: now,
      }],
      createdAt: now,
      updatedAt: now,
    };
    await reviewStore.saveMany(workspacePath, [reviewTask]);

    await assert.rejects(
      reviewStore.update({
        ...reviewTask,
        summary: '尝试覆盖已有审核决策。',
        decisions: [],
      }),
      /审核决策只能追加/,
    );
    const [savedTask] = await reviewStore.list(workspacePath);
    assert.equal(savedTask.decisions.length, 1);
    assert.equal(savedTask.decisions[0].id, 'decision-append-only-1');

    const release = {
      id: 'release-immutable-1',
      workspacePath,
      workspaceId: 'workspace-immutable-1',
      contentKnowledgeMapId: 'map-immutable-1',
      contentKnowledgeMapTitle: '不可变团队知识包地图',
      title: '不可变团队知识包',
      version: 'v1.0',
      status: 'published',
      packageDir: '/tmp/local-agentknowledge',
      knowledgePath: '/tmp/local-agentknowledge/KNOWLEDGE.md',
      manifestPath: '/tmp/local-agentknowledge/manifest.json',
      packageArchivePath: '/tmp/local-agentknowledge/release.zip',
      packageArchiveFileName: 'release.zip',
      packageArchiveSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      packageArchiveSize: 128,
      packageObjectKey: 'content-workspaces/workspace-immutable-1/agentknowledge/release-immutable-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-immutable-1/agentknowledge/release-immutable-1.zip',
      packageStorageProvider: 'cloudflare-r2',
      packageUploadStatus: 'stored',
      approvalStatus: 'approved',
      files: ['KNOWLEDGE.md', 'ontology/ontology.json'],
      issues: [],
      baseRevision: 'rev-1',
      serverReleaseId: 'release-immutable-1',
      createdAt: now,
      updatedAt: now,
    };
    await releaseStore.save(release);

    await assert.rejects(
      releaseStore.update({
        ...release,
        version: 'v1.1',
        packageArchiveSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
      /已发布团队知识包版本不能原地修改/,
    );
    await assert.rejects(
      releaseStore.save({
        ...release,
        packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-immutable-1/agentknowledge/tampered.zip',
      }),
      /已发布团队知识包版本不能原地修改/,
    );
    const [savedRelease] = await releaseStore.list(workspacePath);
    assert.equal(savedRelease.version, 'v1.0');
    assert.equal(savedRelease.packageArchiveSha256, release.packageArchiveSha256);
    assert.equal(savedRelease.packagePublicUrl, release.packagePublicUrl);
  });
});

test('v1 团队知识包远端同步可刷新元数据并保留发布历史', async () => {
  await withWorkspace(async (workspacePath) => {
    const releaseStore = new ContentKnowledgeReleaseStore();
    const now = '2026-05-30T00:08:00.000Z';
    const localRelease = {
      id: 'local-release-sync-1',
      workspacePath,
      workspaceId: 'workspace-release-sync-1',
      contentKnowledgeMapId: 'map-release-sync-1',
      contentKnowledgeMapTitle: '远端同步团队知识包地图',
      title: '远端同步团队知识包',
      version: 'v1.0',
      status: 'published',
      packageDir: '/tmp/local-agentknowledge',
      knowledgePath: '/tmp/local-agentknowledge/KNOWLEDGE.md',
      manifestPath: '/tmp/local-agentknowledge/manifest.json',
      packageArchivePath: '/tmp/local-agentknowledge/release.zip',
      packageArchiveFileName: 'release.zip',
      packageArchiveSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      packageArchiveSize: 128,
      packageObjectKey: 'content-workspaces/workspace-release-sync-1/agentknowledge/release-sync-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-release-sync-1/agentknowledge/release-sync-1.zip',
      packageStorageProvider: 'cloudflare-r2',
      packageUploadStatus: 'registered',
      approvalStatus: 'pending',
      files: ['KNOWLEDGE.md'],
      issues: [],
      baseRevision: 'rev-1',
      serverReleaseId: 'release-sync-1',
      createdAt: now,
      updatedAt: now,
    };
    await releaseStore.save(localRelease);

    const synced = await releaseStore.syncFromTeam({
      id: 'release-sync-1',
      workspacePath,
      workspaceId: 'workspace-release-sync-1',
      contentKnowledgeMapId: 'map-release-sync-1',
      contentKnowledgeMapTitle: '远端同步团队知识包地图',
      title: '远端同步团队知识包',
      version: 'v1.1',
      status: 'published',
      packageArchiveSha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      packageArchiveSize: 256,
      packageObjectKey: 'content-workspaces/workspace-release-sync-1/agentknowledge/release-sync-1-v1-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-release-sync-1/agentknowledge/release-sync-1-v1-1.zip',
      packageStorageProvider: 'cloudflare-r2',
      packageUploadStatus: 'stored',
      approvalStatus: 'approved',
      approvedBy: '内容负责人',
      files: ['KNOWLEDGE.md', 'ontology/ontology.json'],
      issues: [],
      baseRevision: 'rev-2',
      serverReleaseId: 'release-sync-1',
      createdAt: now,
      updatedAt: '2026-05-30T00:09:00.000Z',
    });

    assert.equal(synced.id, 'release-sync-1');
    assert.equal(synced.version, 'v1.1');
    assert.equal(synced.packagePublicUrl, 'https://downloads.bugu.run/content-workspaces/workspace-release-sync-1/agentknowledge/release-sync-1-v1-1.zip');
    assert.equal(synced.packageArchivePath, '/tmp/local-agentknowledge/release.zip');
    assert.equal(synced.approvalStatus, 'approved');

    const releasesAfterSync = await releaseStore.list(workspacePath);
    assert.equal(releasesAfterSync.length, 1);
    assert.equal(releasesAfterSync[0].serverReleaseId, 'release-sync-1');

    await Promise.all(Array.from({ length: 130 }, (_, index) => releaseStore.save({
      id: `release-history-${index}`,
      workspacePath,
      workspaceId: 'workspace-release-sync-1',
      contentKnowledgeMapId: `map-release-history-${index}`,
      contentKnowledgeMapTitle: `发布历史地图 ${index}`,
      title: `发布历史知识包 ${index}`,
      version: `v${index}`,
      status: 'local-preview',
      files: ['KNOWLEDGE.md'],
      issues: [],
      createdAt: `2026-05-30T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
      updatedAt: `2026-05-30T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
    })));
    const releases = await releaseStore.list(workspacePath);
    assert.equal(releases.length, 131);
    assert.ok(releases.some((item) => item.id === 'release-sync-1'));
    assert.ok(releases.some((item) => item.id === 'release-history-129'));
  });
});

test('内容知识地图列表会从 Bugu current 事实源刷新团队地图和生成流程', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    const now = '2026-05-31T00:00:00.000Z';
    await mapStore.save({
      id: 'map-local-anchor',
      workspacePath,
      title: '本机锚点内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步。',
        workspaceId: 'workspace-team-current-1',
        revision: 'team-rev-1',
      },
      sourceInputSourceIds: [],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: [],
      gaps: [],
      coverage: {
        inputSourceCount: 0,
        brandKnowledgeBaseCount: 0,
        ipKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 0,
        gapCount: 0,
        readyPercent: 0,
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new ContentKnowledgeMapApplicationService(
      mapStore,
      buildRunStore,
      new InputSourceStore(),
      new BrandKnowledgeBaseStore(text),
      new IpKnowledgeBaseStore(text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      new PromptDraftStore(new InputSourceStore(), text),
      new AssetReviewStore(),
      {
        draftStatus: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }),
        listKnowledgeMaps: async ({ workspaceId }) => {
          assert.equal(workspaceId, 'workspace-team-current-1');
          return [{
            id: 'map-team-current-1',
            workspacePath,
            title: '团队远端内容地图',
            status: 'ready',
            syncStatus: 'synced',
            teamSync: {
              backend: 'bugu',
              status: 'synced',
              message: '已从团队事实源拉取。',
              workspaceId,
              revision: 'team-rev-2',
            },
            sourceInputSourceIds: ['input-team-1'],
            brandKnowledgeBaseIds: ['brand-team-1'],
            ipKnowledgeBaseIds: [],
            sceneCardIds: ['scene-team-1'],
            promptDraftIds: ['prompt-team-1'],
            sellingPoints: [{
              id: 'selling-team-1',
              title: '团队清爽补涂',
              summary: '团队成员补充的卖点。',
              tags: ['团队'],
              sourceRefs: ['input-source:input-team-1'],
              evidenceRefs: ['evidence-team-1'],
              confidence: 93,
              status: 'ready',
              materialStatus: 'approved',
            }],
            painPoints: [],
            scenarios: [],
            evidence: [{
              id: 'evidence-team-1',
              sourceType: 'input-source',
              sourceId: 'input-team-1',
              sourceTitle: '团队 brief',
              claim: '清爽补涂',
              excerpt: '团队确认清爽补涂。',
              status: 'ready',
            }],
            constraints: ['不能绝对化表达'],
            gaps: [],
            coverage: {
              inputSourceCount: 1,
              brandKnowledgeBaseCount: 1,
              ipKnowledgeBaseCount: 0,
              sceneCardCount: 1,
              promptDraftCount: 1,
              evidenceCount: 1,
              gapCount: 0,
              readyPercent: 93,
            },
            model: 'team-model',
            createdAt: now,
            updatedAt: now,
          }];
        },
        listBuildRuns: async ({ workspaceId }) => {
          assert.equal(workspaceId, 'workspace-team-current-1');
          return [{
            id: 'build-team-current-1',
            workspacePath,
            title: '团队远端生成流程',
            status: 'completed',
            contentKnowledgeMapId: 'map-team-current-1',
            contentKnowledgeMapTitle: '团队远端内容地图',
            model: 'team-model',
            inputSourceIds: ['input-team-1'],
            brandKnowledgeBaseIds: ['brand-team-1'],
            ipKnowledgeBaseIds: [],
            sceneCardIds: ['scene-team-1'],
            promptDraftIds: ['prompt-team-1'],
            readyPercent: 93,
            evidenceCount: 1,
            gapCount: 0,
            issues: [],
            steps: [{
              key: 'team-quality-check',
              title: '团队质量检查',
              status: 'completed',
              message: '93% 内容可用',
              startedAt: now,
              completedAt: now,
            }],
            teamSync: {
              backend: 'bugu',
              status: 'synced',
              message: '已从团队事实源拉取。',
              workspaceId,
              revision: 'team-rev-3',
            },
            startedAt: now,
            completedAt: now,
            updatedAt: now,
          }];
        },
      },
      text,
    );

    const maps = await service.list(workspacePath);
    assert.equal(maps.some((item) => item.id === 'map-team-current-1'), true);
    const savedMaps = await mapStore.list(workspacePath);
    assert.equal(savedMaps.some((item) => item.id === 'map-team-current-1'), true);
    assert.equal(savedMaps.find((item) => item.id === 'map-team-current-1')?.sellingPoints[0].title, '团队清爽补涂');

    const buildRuns = await service.listBuildRuns(workspacePath);
    assert.equal(buildRuns.some((item) => item.id === 'build-team-current-1'), true);
    assert.equal((await buildRunStore.list(workspacePath)).find((item) => item.id === 'build-team-current-1')?.teamSync?.revision, 'team-rev-3');
  });
});

test('内容知识地图团队事实源刷新不会覆盖本机待同步冲突状态', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    const now = '2026-05-31T00:05:00.000Z';
    await mapStore.save({
      id: 'map-conflict-current-refresh',
      workspacePath,
      title: '本机已同步内容地图',
      status: 'ready',
      syncStatus: 'pending-sync',
      teamSync: {
        backend: 'bugu',
        status: 'pending-sync',
        message: '冲突处理已记录，请重新生成变更包并提交团队工作区。',
        workspaceId: 'workspace-current-refresh-1',
        revision: 'local-pending-rev',
      },
      sourceInputSourceIds: [],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-local-current-refresh',
        title: '本机完整卖点',
        summary: '本机冲突处理后的待同步内容。',
        tags: ['本机'],
        sourceRefs: [],
        evidenceRefs: [],
        confidence: 92,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: [],
      gaps: [],
      coverage: {
        inputSourceCount: 0,
        brandKnowledgeBaseCount: 0,
        ipKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 0,
        gapCount: 0,
        readyPercent: 0,
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new ContentKnowledgeMapApplicationService(
      mapStore,
      buildRunStore,
      new InputSourceStore(),
      new BrandKnowledgeBaseStore(text),
      new IpKnowledgeBaseStore(text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      new PromptDraftStore(new InputSourceStore(), text),
      new AssetReviewStore(),
      {
        draftStatus: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }),
        listKnowledgeMaps: async () => [{
          id: 'map-conflict-current-refresh',
          workspacePath,
          title: '团队当前内容地图',
          status: 'ready',
          syncStatus: 'synced',
          teamSync: {
            backend: 'bugu',
            status: 'synced',
            message: '已从团队事实源拉取。',
            workspaceId: 'workspace-current-refresh-1',
            revision: 'team-current-rev',
          },
          sourceInputSourceIds: [],
          brandKnowledgeBaseIds: [],
          ipKnowledgeBaseIds: [],
          sceneCardIds: [],
          promptDraftIds: [],
          sellingPoints: [{
            id: 'selling-current-refresh',
            title: '团队当前卖点',
            summary: '团队当前事实源内容。',
            tags: ['团队'],
            sourceRefs: [],
            evidenceRefs: [],
            confidence: 90,
            status: 'ready',
          }],
          painPoints: [],
          scenarios: [],
          evidence: [],
          constraints: [],
          gaps: [],
          coverage: {
            inputSourceCount: 0,
            brandKnowledgeBaseCount: 0,
            ipKnowledgeBaseCount: 0,
            sceneCardCount: 0,
            promptDraftCount: 0,
            evidenceCount: 0,
            gapCount: 0,
            readyPercent: 90,
          },
          createdAt: now,
          updatedAt: now,
        }],
      },
      text,
    );

    const [map] = await service.list(workspacePath);
    assert.equal(map.id, 'map-conflict-current-refresh');
    assert.equal(map.title, '本机已同步内容地图');
    assert.equal(map.sellingPoints[0].title, '本机完整卖点');
    assert.equal(map.syncStatus, 'pending-sync');
    assert.equal(map.teamSync.status, 'pending-sync');
    assert.equal(map.teamSync.message, '冲突处理已记录，请重新生成变更包并提交团队工作区。');
    assert.equal(map.teamSync.revision, 'local-pending-rev');
  });
});

test('内容知识地图团队事实源刷新不会回退本机更高同步 revision 和素材覆盖', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    await mapStore.save({
      id: 'map-synced-current-refresh',
      workspacePath,
      title: '本机已同步内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '生成流程已同步到 Bugu 团队事实源。',
        workspaceId: 'workspace-current-refresh-2',
        revision: 'team-rev-2',
      },
      sourceInputSourceIds: [],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-synced-local-refresh',
        title: '本机已回写卖点',
        summary: '本机刚完成素材覆盖回写，不能被团队旧快照覆盖。',
        tags: ['本机', '素材覆盖'],
        sourceRefs: ['input-source:local-refresh-1'],
        evidenceRefs: ['evidence-local-refresh-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-local-refresh-1'],
        performanceTags: ['高收藏'],
        confidence: 95,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: [],
      gaps: [],
      coverage: {
        inputSourceCount: 0,
        brandKnowledgeBaseCount: 0,
        ipKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 0,
        gapCount: 0,
        readyPercent: 95,
      },
      createdAt: '2026-05-31T00:00:00.000Z',
      updatedAt: '2026-05-31T00:02:00.000Z',
    });

    const service = new ContentKnowledgeMapApplicationService(
      mapStore,
      buildRunStore,
      new InputSourceStore(),
      new BrandKnowledgeBaseStore(text),
      new IpKnowledgeBaseStore(text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      new PromptDraftStore(new InputSourceStore(), text),
      new AssetReviewStore(),
      {
        draftStatus: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }),
        listKnowledgeMaps: async () => [{
          id: 'map-synced-current-refresh',
          workspacePath,
          title: '团队当前内容地图',
          status: 'ready',
          syncStatus: 'synced',
          teamSync: {
            backend: 'bugu',
            status: 'synced',
            message: '已从团队事实源拉取。',
            workspaceId: 'workspace-current-refresh-2',
            revision: 'team-rev-1',
          },
          sourceInputSourceIds: [],
          brandKnowledgeBaseIds: [],
          ipKnowledgeBaseIds: [],
          sceneCardIds: [],
          promptDraftIds: [],
          sellingPoints: [{
            id: 'selling-synced-current-refresh',
            title: '团队当前卖点',
            summary: '团队当前事实源内容。',
            tags: ['团队'],
            sourceRefs: [],
            evidenceRefs: [],
            confidence: 90,
            status: 'ready',
          }],
          painPoints: [],
          scenarios: [],
          evidence: [],
          constraints: [],
          gaps: [],
          coverage: {
            inputSourceCount: 0,
            brandKnowledgeBaseCount: 0,
            ipKnowledgeBaseCount: 0,
            sceneCardCount: 0,
            promptDraftCount: 0,
            evidenceCount: 0,
            gapCount: 0,
            readyPercent: 90,
          },
          createdAt: '2026-05-31T00:00:00.000Z',
          updatedAt: '2026-05-31T00:01:00.000Z',
        }],
      },
      text,
    );

    const [map] = await service.list(workspacePath);
    assert.equal(map.id, 'map-synced-current-refresh');
    assert.equal(map.title, '本机已同步内容地图');
    assert.equal(map.sellingPoints[0].title, '本机已回写卖点');
    assert.equal(map.sellingPoints[0].materialStatus, 'approved');
    assert.deepEqual(map.sellingPoints[0].materialRefs, ['asset-local-refresh-1']);
    assert.deepEqual(map.sellingPoints[0].performanceTags, ['高收藏']);
    assert.equal(map.syncStatus, 'synced');
    assert.equal(map.teamSync.message, '生成流程已同步到 Bugu 团队事实源。');
    assert.equal(map.teamSync.revision, 'team-rev-2');
  });
});

test('Agent Knowledge 导出会校验 v0.7.2 数据包并在失败时阻止发布', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const now = '2026-05-29T00:00:00.000Z';
    const readyMap = {
      id: 'map-export-policy-1',
      workspacePath,
      title: '导出校验内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-export-policy-1',
        revision: 'rev-export-1',
      },
      sourceInputSourceIds: ['source-export-1'],
      brandKnowledgeBaseIds: ['brand-export-1'],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-export-1',
        title: '轻薄不闷肤',
        summary: '适合通勤补涂，强调肤感和防晒场景。',
        tags: ['卖点'],
        dimensions: {
          audiences: ['通勤人群'],
          channels: ['小红书'],
          contentFormats: ['图文'],
          useCases: ['补涂场景'],
        },
        sourceRefs: ['brand-knowledge-base:brand-export-1'],
        evidenceRefs: ['evidence-export-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-export-1'],
        performanceTags: ['收藏率高'],
        confidence: 88,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-export-1',
        sourceType: 'manual',
        sourceTitle: '产品卖点确认表',
        claim: '用户关注清爽肤感。',
        excerpt: '调研记录显示，清爽和不搓泥是主要决策点。',
        status: 'ready',
      }],
      constraints: ['涉及防晒效果时必须引用检测或备案信息。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    };
    await mapStore.save(readyMap);

    const exporter = new AgentKnowledgeContentExportService(mapStore);
    const exported = await exporter.exportPack({ workspacePath, contentKnowledgeMapId: 'map-export-policy-1' });
    assert.equal(exported.status, 'exported');
    assert.ok(exported.files.includes('ontology/concepts.json'));
    assert.ok(exported.files.includes('answers/questions.json'));
    assert.ok(exported.files.includes('assets/material-coverage.json'));
    assert.ok(exported.files.includes('interop/ontology.jsonld'));
    assert.ok(exported.files.includes('interop/ontology.ttl'));
    assert.ok(exported.files.includes('interop/ontology.rdf'));
    assert.ok(exported.files.includes('manifest.json'));
    assert.equal(exported.preview?.agentKnowledgeVersion, '0.7.2');
    assert.equal(exported.preview?.readyRowCount, 1);
    assert.equal(exported.preview?.readyEvidenceCount, 1);
    assert.equal(exported.preview?.materialCoverageCount, 1);
    assert.deepEqual(exported.preview?.interopFormats, ['JSON-LD', 'Turtle', 'RDF/XML']);
    assert.equal(exported.preview?.promptGroundingFile, 'compiled/prompt-grounding.md');
    const knowledgeText = await readFile(exported.knowledgePath, 'utf8');
    assert.match(knowledgeText, /primaryOntology: ontology\/ontology\.json/);
    assert.match(knowledgeText, /primaryAnswers: answers\/questions\.json/);
    const concepts = JSON.parse(await readFile(join(exported.packageDir, 'ontology', 'concepts.json'), 'utf8'));
    assert.equal(concepts[0].status, 'ready');
    const materialCoverage = JSON.parse(await readFile(join(exported.packageDir, 'assets', 'material-coverage.json'), 'utf8'));
    assert.equal(materialCoverage[0].rowId, 'selling-export-1');
    assert.deepEqual(materialCoverage[0].materialRefs, ['asset-export-1']);
    assert.deepEqual(materialCoverage[0].performanceTags, ['收藏率高']);
    const jsonLd = JSON.parse(await readFile(join(exported.packageDir, 'interop', 'ontology.jsonld'), 'utf8'));
    assert.equal(jsonLd['@type'], 'bugu:ContentKnowledgeMap');
    assert.equal(jsonLd.concepts[0]['@id'], 'bugu:concept/selling-export-1');
    const ttl = await readFile(join(exported.packageDir, 'interop', 'ontology.ttl'), 'utf8');
    assert.match(ttl, /bugu:ContentKnowledgeMap/);
    assert.match(ttl, /concept:selling-export-1 bugu:supported-by evidence:evidence-export-1/);
    const rdf = await readFile(join(exported.packageDir, 'interop', 'ontology.rdf'), 'utf8');
    assert.match(rdf, /<bugu:ContentKnowledgeMap/);
    assert.match(rdf, /<bugu:supported-by rdf:resource="https:\/\/schema\.bugu\.run\/evidence\/evidence-export-1"/);
    const promptGroundingPreview = await exporter.readPackFile({
      workspacePath,
      packageDir: exported.packageDir,
      relativePath: 'compiled/prompt-grounding.md',
    });
    assert.equal(promptGroundingPreview.status, 'loaded');
    assert.equal(promptGroundingPreview.relativePath, 'compiled/prompt-grounding.md');
    assert.match(promptGroundingPreview.content ?? '', /轻薄不闷肤/);
    assert.match(promptGroundingPreview.content ?? '', /涉及防晒效果时必须引用检测或备案信息/);
    const traversalPreview = await exporter.readPackFile({
      workspacePath,
      packageDir: exported.packageDir,
      relativePath: '../content-knowledge-maps.json',
    });
    assert.equal(traversalPreview.status, 'blocked');
    assert.match(traversalPreview.issues.join(' / '), /路径非法|越界/);
    const outsidePackagePreview = await exporter.readPackFile({
      workspacePath,
      packageDir: tmpdir(),
      relativePath: 'anything.txt',
    });
    assert.equal(outsidePackagePreview.status, 'blocked');
    assert.match(outsidePackagePreview.issues.join(' / '), /当前工作区/);
    const outsideSecretPath = join(workspacePath, 'outside-preview-secret.txt');
    const linkedSecretPath = join(exported.packageDir, 'linked-secret.txt');
    await writeFile(outsideSecretPath, '不应该通过知识包预览读取。', 'utf8');
    try {
      await symlink(outsideSecretPath, linkedSecretPath);
      const symlinkPreview = await exporter.readPackFile({
        workspacePath,
        packageDir: exported.packageDir,
        relativePath: 'linked-secret.txt',
      });
      assert.equal(symlinkPreview.status, 'blocked');
      assert.match(symlinkPreview.issues.join(' / '), /越界/);
    } catch (error) {
      if (!['EPERM', 'ENOSYS'].includes(error?.code)) throw error;
    }

    await mapStore.save({
      ...readyMap,
      id: 'map-export-policy-bad-1',
      title: '导出失败内容地图',
      constraints: ['禁止把 curl https://example.com/publish 写入团队知识包。'],
    });
    const blockedExport = await exporter.exportPack({ workspacePath, contentKnowledgeMapId: 'map-export-policy-bad-1' });
    assert.equal(blockedExport.status, 'blocked');
    assert.equal(blockedExport.packageDir, undefined);
    assert.ok(blockedExport.issues.some((issue) => issue.includes('命令行指令')));

    await mapStore.save({
      ...readyMap,
      id: 'map-export-policy-review-1',
      title: '待审核不能发布内容地图',
      sellingPoints: [{ ...readyMap.sellingPoints[0], id: 'selling-export-review-1', status: 'needs-review' }],
    });
    let publishCalled = false;
    const service = new ContentWorkspaceSyncService(
      mapStore,
      new ContentDraftChangeStore(),
      releaseStore,
      new AgentKnowledgeContentExportService(mapStore),
      {
        submitDraftChange: async () => { throw new Error('not used'); },
        publishRelease: async () => {
          publishCalled = true;
          throw new Error('invalid release should not publish');
        },
        listSyncConflicts: async () => [],
        resolveSyncConflict: async () => null,
      },
    );
    const releaseResult = await service.createKnowledgeRelease({
      workspacePath,
      contentKnowledgeMapId: 'map-export-policy-review-1',
      title: '待审核不能发布团队包',
    });
    assert.equal(releaseResult.status, 'blocked');
    assert.equal(publishCalled, false);
    assert.ok(releaseResult.issues.some((issue) => issue.includes('待审核')));
  });
});

test('内容团队共享服务能拉取团队知识包版本并保留本机预览路径', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const draftStore = new ContentDraftChangeStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const now = '2026-05-28T00:00:00.000Z';
    await mapStore.save({
      id: 'map-release-pull-1',
      workspacePath,
      title: '团队知识包拉取验证',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        workspaceId: 'workspace-release-pull-1',
        revision: 'rev-10',
        message: '已同步到团队工作区。',
        lastSyncedAt: now,
      },
      sourceRefs: [],
      sellingPoints: [],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: [],
      gaps: [],
      coverage: {
        inputSourceCount: 0,
        sellingPointCount: 0,
        painPointCount: 0,
        scenarioCount: 0,
        evidenceCount: 0,
        readyPercent: 100,
        gapCount: 0,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });
    await releaseStore.save({
      id: 'release-pull-1',
      workspacePath,
      contentKnowledgeMapId: 'map-release-pull-1',
      contentKnowledgeMapTitle: '团队知识包拉取验证',
      title: '团队知识包拉取验证',
      version: 'v1.0',
      status: 'published',
      packageDir: '/tmp/local-agentknowledge',
      knowledgePath: '/tmp/local-agentknowledge/KNOWLEDGE.md',
      manifestPath: '/tmp/local-agentknowledge/manifest.json',
      packageArchivePath: '/tmp/local-agentknowledge/release.zip',
      packageArchiveFileName: 'release.zip',
      files: ['KNOWLEDGE.md'],
      issues: [],
      baseRevision: 'rev-9',
      serverReleaseId: 'release-pull-1',
      createdAt: now,
      updatedAt: now,
    });

    const requestedWorkspaces = [];
    const service = new ContentWorkspaceSyncService(
      mapStore,
      draftStore,
      releaseStore,
      new AgentKnowledgeContentExportService(mapStore),
      {
        submitDraftChange: async () => { throw new Error('not used'); },
        publishRelease: async () => { throw new Error('not used'); },
        listReleases: async (input) => {
          requestedWorkspaces.push(input.workspaceId);
          return [
            {
              id: 'release-pull-1',
              workspacePath,
              contentKnowledgeMapId: 'map-release-pull-1',
              contentKnowledgeMapTitle: '团队知识包拉取验证',
              title: '团队知识包拉取验证',
              version: 'v1.1',
              status: 'published',
              packageObjectKey: 'content-workspaces/workspace-release-pull-1/agentknowledge/release-pull-1.zip',
              packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-release-pull-1/agentknowledge/release-pull-1.zip',
              packageStorageProvider: 'cloudflare-r2',
              packageUploadStatus: 'stored',
              packageArchiveSha256: 'remote-sha256',
              packageArchiveSize: 128,
              approvalStatus: 'approved',
              approvedBy: '内容负责人',
              files: ['KNOWLEDGE.md', 'ontology/ontology.json'],
              issues: [],
              baseRevision: 'rev-10',
              serverReleaseId: 'release-pull-1',
              createdAt: now,
              updatedAt: '2026-05-28T00:03:00.000Z',
            },
          ];
        },
        listSyncConflicts: async () => [],
        resolveSyncConflict: async () => null,
      },
    );

    const releases = await service.listReleases(workspacePath);
    assert.deepEqual(requestedWorkspaces, ['workspace-release-pull-1']);
    assert.equal(releases[0].version, 'v1.1');
    assert.equal(releases[0].packagePublicUrl, 'https://downloads.bugu.run/content-workspaces/workspace-release-pull-1/agentknowledge/release-pull-1.zip');
    assert.equal(releases[0].packageArchivePath, '/tmp/local-agentknowledge/release.zip');
    assert.equal(releases[0].approvalStatus, 'approved');
    assert.deepEqual(releases[0].files, ['KNOWLEDGE.md', 'ontology/ontology.json']);
  });
});

test('两台工作区能通过团队知识包版本进入同一下游口径', async () => {
  await withWorkspace(async (workspaceA) => {
    await withWorkspace(async (workspaceB) => {
      const now = '2026-05-28T00:00:00.000Z';
      const teamWorkspaceId = 'workspace-two-device-1';
      const mapId = 'map-two-device-1';
      const mapFixture = (workspacePath, teamSync) => ({
        id: mapId,
        workspacePath,
        title: '两设备团队知识地图',
        status: 'ready',
        syncStatus: teamSync.status,
        teamSync,
        sourceInputSourceIds: ['source-two-device-1'],
        brandKnowledgeBaseIds: ['brand-two-device-1'],
        sceneCardIds: ['scene-two-device-1'],
        promptDraftIds: [],
        sellingPoints: [{
          id: 'selling-two-device-1',
          title: '轻薄不闷肤',
          summary: '适合通勤补涂，强调肤感和防晒场景。',
          tags: ['卖点', '防晒'],
          sourceRefs: ['brand-knowledge-base:brand-two-device-1'],
          evidenceRefs: ['evidence-two-device-1'],
          materialStatus: 'approved',
          materialRefs: ['asset-two-device-1'],
          confidence: 90,
          status: 'ready',
        }],
        painPoints: [],
        scenarios: [{
          id: 'scenario-two-device-1',
          title: '通勤包补涂',
          summary: '地铁、办公室和户外切换时的快速补涂。',
          tags: ['场景', '通勤'],
          sourceRefs: ['scene-card:scene-two-device-1'],
          evidenceRefs: ['evidence-two-device-1'],
          confidence: 82,
          status: 'ready',
        }],
        evidence: [{
          id: 'evidence-two-device-1',
          sourceType: 'manual',
          sourceTitle: '产品卖点确认表',
          claim: '用户关注清爽肤感和补涂便利性。',
          excerpt: '调研记录显示，清爽、便携和不搓泥是主要决策点。',
          status: 'ready',
        }],
        constraints: ['涉及防晒效果时必须引用检测或备案信息。'],
        gaps: [],
        coverage: {
          inputSourceCount: 1,
          brandKnowledgeBaseCount: 1,
          sceneCardCount: 1,
          promptDraftCount: 0,
          evidenceCount: 1,
          gapCount: 0,
          readyPercent: 100,
        },
        model: 'functional-test',
        createdAt: now,
        updatedAt: now,
      });

      const mapStoreA = new ContentKnowledgeMapStore();
      const draftStoreA = new ContentDraftChangeStore();
      const releaseStoreA = new ContentKnowledgeReleaseStore();
      const mapStoreB = new ContentKnowledgeMapStore();
      const draftStoreB = new ContentDraftChangeStore();
      const releaseStoreB = new ContentKnowledgeReleaseStore();
      const sharedReleases = [];

      await mapStoreA.save(mapFixture(workspaceA, {
        backend: 'bugu',
        status: 'local-only',
        message: '本机草稿。',
      }));
      await mapStoreB.save(mapFixture(workspaceB, {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: teamWorkspaceId,
        revision: 'rev-20',
      }));

      const adapterA = {
        submitDraftChange: async (input) => ({
          backend: 'bugu',
          status: 'synced',
          message: '用户 A 已提交团队工作区。',
          workspaceId: teamWorkspaceId,
          revision: 'rev-21',
          baseRevision: input.baseRevision,
          lastSyncedAt: now,
        }),
        publishRelease: async (input) => {
          const release = {
            id: input.id,
            workspacePath: workspaceA,
            workspaceId: teamWorkspaceId,
            contentKnowledgeMapId: input.contentKnowledgeMapId,
            contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
            title: input.title,
            version: input.version,
            status: 'published',
            packageObjectKey: `content-workspaces/${teamWorkspaceId}/agentknowledge/${input.id}.zip`,
            packagePublicUrl: `https://downloads.bugu.run/content-workspaces/${teamWorkspaceId}/agentknowledge/${input.id}.zip`,
            packageUploadStatus: 'stored',
            approvalStatus: 'approved',
            approvedBy: '用户 A',
            files: input.files,
            issues: [],
            baseRevision: 'rev-21',
            serverReleaseId: input.id,
            createdAt: now,
            updatedAt: now,
          };
          sharedReleases.unshift(release);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '用户 A 已发布团队知识包。',
            workspaceId: teamWorkspaceId,
            revision: 'rev-22',
            baseRevision: input.baseRevision,
            releaseId: input.id,
            packageObjectKey: release.packageObjectKey,
            packagePublicUrl: release.packagePublicUrl,
            packageUploadStatus: release.packageUploadStatus,
            lastSyncedAt: now,
          };
        },
        listSyncConflicts: async () => [],
        resolveSyncConflict: async () => null,
      };
      const adapterB = {
        submitDraftChange: async () => { throw new Error('not used'); },
        publishRelease: async () => { throw new Error('not used'); },
        listReleases: async ({ workspacePath, workspaceId }) => {
          assert.equal(workspaceId, teamWorkspaceId);
          return sharedReleases.map((release) => ({ ...release, workspacePath }));
        },
        listSyncConflicts: async () => [],
        resolveSyncConflict: async () => null,
      };

      const serviceA = new ContentWorkspaceSyncService(
        mapStoreA,
        draftStoreA,
        releaseStoreA,
        new AgentKnowledgeContentExportService(mapStoreA),
        adapterA,
      );
      const serviceB = new ContentWorkspaceSyncService(
        mapStoreB,
        draftStoreB,
        releaseStoreB,
        new AgentKnowledgeContentExportService(mapStoreB),
        adapterB,
      );

      const created = await serviceA.createDraftChange({ workspacePath: workspaceA, contentKnowledgeMapId: mapId, authorLabel: '用户 A' });
      const submitted = await serviceA.submitDraftChange({ workspacePath: workspaceA, draftChangeId: created.draftChange.id, authorLabel: '用户 A' });
      assert.equal(submitted.status, 'submitted');
      const released = await serviceA.createKnowledgeRelease({ workspacePath: workspaceA, contentKnowledgeMapId: mapId, title: '防晒内容团队包', authorLabel: '用户 A' });
      assert.equal(released.status, 'released');
      assert.equal(sharedReleases.length, 1);

      const pulledReleases = await serviceB.listReleases(workspaceB);
      assert.equal(pulledReleases[0].id, released.release.serverReleaseId);
      assert.equal(pulledReleases[0].packageUploadStatus, 'stored');
      assert.doesNotMatch(JSON.stringify(pulledReleases[0]), new RegExp(workspaceA.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

      const reviewStoreB = new ContentReviewTaskStore();
      await reviewStoreB.saveMany(workspaceB, [{
        id: 'review-two-device-1',
        workspacePath: workspaceB,
        sourceKnowledgeMapId: mapId,
        sourceKnowledgeMapTitle: '两设备团队知识地图',
        targetType: 'selling-point',
        targetId: 'selling-two-device-1',
        title: '轻薄不闷肤',
        summary: '用户 B 审核通过后交给下游生产。',
        evidenceRefs: ['evidence-two-device-1'],
        sourceRefs: ['brand-knowledge-base:brand-two-device-1'],
        risk: 'low',
        status: 'approved',
        suggestedAction: 'approve',
        issueLabels: [],
        decisions: [],
        createdAt: now,
        updatedAt: now,
      }]);
      const text = new FakeTextGenerationService();
      const promptDrafts = new PromptDraftStore(new InputSourceStore(), text);
      const handoff = new ContentProductionHandoffService(
        reviewStoreB,
        mapStoreB,
        releaseStoreB,
        promptDrafts,
        new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
        new ContentProductionHandoffStore(),
      );
      const handoffResult = await handoff.create({
        workspacePath: workspaceB,
        reviewTaskId: 'review-two-device-1',
        target: 'prompt-draft',
        actorLabel: '用户 B',
      });
      assert.equal(handoffResult.promptDraft?.teamKnowledgeRelease?.id, released.release.serverReleaseId);
      assert.match(handoffResult.grounding?.content ?? '', /团队知识包：防晒内容团队包/);
    });
  });
});

test('生产交接会把团队知识包版本绑定到 Prompt 草稿', async () => {
  await withWorkspace(async (workspacePath) => {
    const now = '2026-05-28T00:00:00.000Z';
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const reviewStore = new ContentReviewTaskStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sceneCards = new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text);
    const actionSyncCalls = [];
    const service = new ContentProductionHandoffService(
      reviewStore,
      mapStore,
      releaseStore,
      promptDrafts,
      sceneCards,
      new ContentProductionHandoffStore(),
      {
        syncProductionHandoffActions: async (input) => {
          actionSyncCalls.push(input);
          assert.equal(input.sourceKnowledgeMapId, 'map-handoff-release-1');
          assert.equal(input.actions.length, 1);
          assert.equal(input.actions[0].actionType, 'create-prompt-draft');
          assert.equal(input.actions[0].outcome, 'handoff');
          assert.doesNotMatch(JSON.stringify(input.actions), new RegExp(workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
          return {
            backend: 'bugu',
            status: 'synced',
            message: '生产交接行动记录已同步到测试团队工作区。',
            workspaceId: 'workspace-handoff-release-1',
            revision: 'handoff-action-rev-1',
          };
        },
      },
    );

    await mapStore.save({
      id: 'map-handoff-release-1',
      workspacePath,
      title: '团队知识包交接地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-handoff-release-1',
        revision: 'rev-20',
        releaseId: 'release-handoff-1',
      },
      sourceInputSourceIds: ['source-handoff-1'],
      brandKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-handoff-1',
        title: '轻薄不闷肤',
        summary: '适合通勤补涂，强调肤感和防晒场景。',
        tags: ['卖点', '防晒'],
        sourceRefs: ['input-source:source-handoff-1'],
        evidenceRefs: ['evidence-handoff-1'],
        materialStatus: 'approved',
        materialRefs: [],
        confidence: 90,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-handoff-1',
        sourceType: 'manual',
        sourceTitle: '产品卖点确认表',
        claim: '用户关注清爽肤感和补涂便利性。',
        excerpt: '调研记录显示，清爽、便携和不搓泥是主要决策点。',
        status: 'ready',
      }],
      constraints: ['涉及防晒效果时必须引用检测或备案信息。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });
    await releaseStore.save({
      id: 'local-release-handoff-1',
      workspacePath,
      workspaceId: 'workspace-handoff-release-1',
      contentKnowledgeMapId: 'map-handoff-release-1',
      contentKnowledgeMapTitle: '团队知识包交接地图',
      title: '防晒内容团队包',
      version: 'v1.4',
      status: 'published',
      packageObjectKey: 'content-workspaces/workspace-handoff-release-1/agentknowledge/release-handoff-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-handoff-release-1/agentknowledge/release-handoff-1.zip',
      packageUploadStatus: 'stored',
      files: ['KNOWLEDGE.md', 'ontology/ontology.json'],
      issues: [],
      baseRevision: 'rev-20',
      serverReleaseId: 'release-handoff-1',
      createdAt: now,
      updatedAt: now,
    });
    await reviewStore.saveMany(workspacePath, [{
      id: 'review-handoff-1',
      workspacePath,
      sourceKnowledgeMapId: 'map-handoff-release-1',
      sourceKnowledgeMapTitle: '团队知识包交接地图',
      targetType: 'selling-point',
      targetId: 'selling-handoff-1',
      title: '轻薄不闷肤',
      summary: '已确认可用于生产。',
      evidenceRefs: ['evidence-handoff-1'],
      sourceRefs: ['input-source:source-handoff-1'],
      risk: 'low',
      status: 'approved',
      suggestedAction: 'approve',
      issueLabels: [],
      decisions: [],
      createdAt: now,
      updatedAt: now,
    }]);
    const result = await service.create({
      workspacePath,
      reviewTaskId: 'review-handoff-1',
      target: 'prompt-draft',
      actorLabel: '功能测试',
    });

    assert.equal(result.status, 'created');
    assert.equal(result.grounding?.teamKnowledgeRelease?.id, 'release-handoff-1');
    assert.match(result.grounding?.content ?? '', /团队知识包：防晒内容团队包 v1\.4/);
    assert.equal(result.promptDraft?.teamKnowledgeRelease?.version, 'v1.4');
    assert.equal(result.promptDraft?.teamKnowledgeRelease?.packageUploadStatus, 'stored');
    assert.equal(result.record?.teamKnowledgeRelease?.id, 'release-handoff-1');
    assert.equal(result.record?.batchId, 'handoff:map-handoff-release-1:selling-handoff-1');
    assert.equal(result.record?.actionRecords.length, 1);
    assert.equal(result.record?.actionRecords[0].actionType, 'create-prompt-draft');
    assert.equal(result.record?.actionRecords[0].outcome, 'handoff');
    assert.equal(result.record?.actionRecords[0].teamKnowledgeRelease?.id, 'release-handoff-1');
    assert.deepEqual(result.record?.actionRecords[0].coverageRowIds, ['selling-handoff-1']);
    assert.ok(result.record?.actionRecords[0].checks.some((check) => check.label === '审核结论' && check.status === 'passed'));
    assert.ok(result.record?.actionRecords[0].checks.some((check) => check.label === '团队知识包' && check.status === 'passed'));
    assert.match(result.record?.actionRecords[0].outputSummary ?? '', /Prompt 草稿/);
    assert.match(result.record?.actionRecords[0].nextStep ?? '', /agents/);
    assert.equal(result.record?.syncStatus, 'synced');
    assert.equal(result.record?.teamSync?.revision, 'handoff-action-rev-1');
    assert.equal(result.record?.actionRecords[0].syncStatus, 'synced');
    assert.equal(actionSyncCalls.length, 1);
  });
});

test('生产交接不会把其他内容知识地图的团队知识包误绑定到本机草稿', async () => {
  await withWorkspace(async (workspacePath) => {
    const now = '2026-05-30T00:00:00.000Z';
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const reviewStore = new ContentReviewTaskStore();
    const handoffStore = new ContentProductionHandoffStore();
    const text = new FakeTextGenerationService();
    const service = new ContentProductionHandoffService(
      reviewStore,
      mapStore,
      releaseStore,
      new PromptDraftStore(new InputSourceStore(), text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      handoffStore,
    );

    await releaseStore.save({
      id: 'local-release-other-map-1',
      workspacePath,
      workspaceId: 'workspace-map-scoped-release-1',
      contentKnowledgeMapId: 'map-other-release-1',
      contentKnowledgeMapTitle: '其他项目内容地图',
      title: '其他项目团队知识包',
      version: 'v9.9',
      status: 'published',
      packageObjectKey: 'content-workspaces/workspace-map-scoped-release-1/agentknowledge/release-other-map-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-map-scoped-release-1/agentknowledge/release-other-map-1.zip',
      packageUploadStatus: 'stored',
      files: ['KNOWLEDGE.md', 'ontology/ontology.json'],
      issues: [],
      baseRevision: 'other-release-rev-1',
      serverReleaseId: 'release-other-map-1',
      createdAt: now,
      updatedAt: now,
    });
    await mapStore.save({
      id: 'map-no-release-handoff-1',
      workspacePath,
      title: '尚未发布团队知识包的内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区，但尚未发布团队知识包。',
        workspaceId: 'workspace-map-scoped-release-1',
        revision: 'map-no-release-rev-1',
      },
      sourceInputSourceIds: ['source-no-release-1'],
      brandKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-no-release-1',
        title: '轻便随身携带',
        summary: '该组合已审核，但当前地图还没有自己的团队知识包版本。',
        tags: ['卖点'],
        sourceRefs: ['input-source:source-no-release-1'],
        evidenceRefs: ['evidence-no-release-1'],
        materialStatus: 'approved',
        materialRefs: [],
        confidence: 91,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-no-release-1',
        sourceType: 'product-brief',
        sourceTitle: '产品资料',
        claim: '轻便随身携带。',
        excerpt: '产品资料显示该产品便于放入口袋和通勤包。',
        status: 'ready',
      }],
      constraints: ['不得把其他项目团队知识包当成本项目默认口径。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });
    await reviewStore.saveMany(workspacePath, [{
      id: 'review-no-release-handoff-1',
      workspacePath,
      sourceKnowledgeMapId: 'map-no-release-handoff-1',
      sourceKnowledgeMapTitle: '尚未发布团队知识包的内容地图',
      targetType: 'selling-point',
      targetId: 'selling-no-release-1',
      title: '轻便随身携带',
      summary: '审核通过后可以生成本机草稿，但不能绑定其他地图的团队知识包。',
      evidenceRefs: ['evidence-no-release-1'],
      sourceRefs: ['input-source:source-no-release-1'],
      risk: 'low',
      status: 'approved',
      suggestedAction: 'approve',
      issueLabels: [],
      decisions: [],
      createdAt: now,
      updatedAt: now,
    }]);

    const result = await service.create({
      workspacePath,
      reviewTaskId: 'review-no-release-handoff-1',
      target: 'prompt-draft',
      actorLabel: '功能测试',
    });

    assert.equal(result.status, 'created');
    assert.equal(result.promptDraft?.teamKnowledgeRelease, undefined);
    assert.equal(result.grounding?.teamKnowledgeRelease, undefined);
    assert.equal(result.record?.teamKnowledgeRelease, undefined);
    assert.ok(result.record?.actionRecords[0].checks.some((check) => (
      check.label === '团队知识包' &&
      check.status === 'blocked' &&
      check.message.includes('仅可作为本机草稿继续处理')
    )));
    assert.doesNotMatch(result.grounding?.content ?? '', /团队知识包：其他项目团队知识包/);
    const persisted = await handoffStore.list(workspacePath);
    assert.equal(persisted[0].teamKnowledgeRelease, undefined);
  });
});

test('生产交接被发布检查拦截时也会写入行动记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const now = '2026-05-29T00:00:00.000Z';
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const reviewStore = new ContentReviewTaskStore();
    const handoffStore = new ContentProductionHandoffStore();
    const text = new FakeTextGenerationService();
    const blockedSyncCalls = [];
    const service = new ContentProductionHandoffService(
      reviewStore,
      mapStore,
      releaseStore,
      new PromptDraftStore(new InputSourceStore(), text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      handoffStore,
      {
        syncProductionHandoffActions: async (input) => {
          blockedSyncCalls.push(input);
          assert.equal(input.actions.length, 1);
          assert.equal(input.actions[0].actionType, 'blocked');
          assert.equal(input.actions[0].outcome, 'blocked');
          return {
            backend: 'bugu',
            status: 'blocked',
            message: '测试团队工作区记录了 blocked 交接动作。',
          };
        },
      },
    );

    await mapStore.save({
      id: 'map-handoff-blocked-1',
      workspacePath,
      title: '拦截交接地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: { backend: 'bugu', status: 'synced', message: '已同步。' },
      sourceInputSourceIds: ['source-blocked-1'],
      brandKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-blocked-1',
        title: '绝对安全',
        summary: '包含禁用表达，不能交给下游生产。',
        tags: ['卖点'],
        sourceRefs: ['input-source:source-blocked-1'],
        evidenceRefs: ['evidence-blocked-1'],
        confidence: 90,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-blocked-1',
        sourceType: 'manual',
        sourceTitle: '审核记录',
        claim: '边界测试证据',
        excerpt: '边界测试证据',
        status: 'ready',
      }],
      constraints: ['涉及安全表达必须引用正式检测或改写为弱表达。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });
    await reviewStore.saveMany(workspacePath, [{
      id: 'review-handoff-blocked-1',
      workspacePath,
      sourceKnowledgeMapId: 'map-handoff-blocked-1',
      sourceKnowledgeMapTitle: '拦截交接地图',
      targetType: 'selling-point',
      targetId: 'selling-blocked-1',
      title: '绝对安全',
      summary: '虽然审核任务通过，但发布检查仍要二次拦截。',
      evidenceRefs: ['evidence-blocked-1'],
      sourceRefs: ['input-source:source-blocked-1'],
      risk: 'high',
      status: 'approved',
      suggestedAction: 'approve',
      issueLabels: [],
      decisions: [],
      createdAt: now,
      updatedAt: now,
    }]);
    const result = await service.create({
      workspacePath,
      reviewTaskId: 'review-handoff-blocked-1',
      target: 'prompt-draft',
      actorLabel: '功能测试',
    });

    assert.equal(result.status, 'blocked');
    assert.ok(result.issues.some((issue) => issue.includes('禁用或绝对化表达')));
    assert.equal(result.promptDraft, undefined);
    assert.equal(result.record?.status, 'blocked');
    assert.equal(result.record?.actionRecords.length, 1);
    assert.equal(result.record?.actionRecords[0].actionType, 'blocked');
    assert.equal(result.record?.actionRecords[0].outcome, 'blocked');
    assert.ok(result.record?.actionRecords[0].checks.some((check) => check.label === '发布边界' && check.status === 'blocked'));
    assert.match(result.record?.actionRecords[0].nextStep ?? '', /发布检查/);
    assert.equal(result.record?.syncStatus, 'blocked');
    assert.equal(result.record?.actionRecords[0].syncStatus, 'blocked');
    assert.equal(blockedSyncCalls.length, 1);
    const persisted = await handoffStore.list(workspacePath);
    assert.equal(persisted[0].actionRecords[0].actionType, 'blocked');
    assert.equal(persisted[0].teamSync?.message, '测试团队工作区记录了 blocked 交接动作。');
  });
});

test('内容团队共享服务能拉取并记录同步冲突处理结论', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const draftStore = new ContentDraftChangeStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const now = '2026-05-28T00:00:00.000Z';
    await mapStore.save({
      id: 'map-conflict-1',
      workspacePath,
      title: '冲突验证内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-conflict-test',
        revision: 'rev-2',
        baseRevision: 'rev-1',
      },
      sourceInputSourceIds: [],
      brandKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-conflict-1',
        title: '轻量便携',
        summary: '用于验证旧版本提交进入冲突队列。',
        tags: ['卖点'],
        sourceRefs: [],
        evidenceRefs: [],
        confidence: 80,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: [],
      gaps: [],
      coverage: {
        inputSourceCount: 0,
        brandKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 0,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });

    const conflicts = [{
      id: 'conflict-1',
      workspacePath,
      workspaceId: 'workspace-conflict-test',
      sourceType: 'draft-change',
      sourceId: 'draft-conflict-1',
      title: '旧版本变更包',
      summary: '提交基于旧版本 rev-1，团队当前版本是 rev-2。',
      status: 'open',
      baseRevision: 'rev-1',
      serverRevision: 'rev-2',
      affectedObjectIds: ['selling-conflict-1'],
      affectedObjects: [{
        id: 'selling-point:selling-conflict-1',
        objectId: 'selling-conflict-1',
        objectType: 'selling-point',
        title: '轻量便携',
        summary: '用于验证旧版本提交进入冲突队列。',
        localValue: '可交付 / 缺少证据 / 缺少来源',
        teamValue: '团队工作区已有更新，需要拉取当前团队版本后再判断是否保留本机修改。',
        impact: 'high',
        recommendation: '先保留团队当前版本，重新同步后把本机修改拆成新的变更包提交。',
      }],
      authorLabel: '功能测试',
      createdAt: now,
      updatedAt: now,
    }];

    const service = new ContentWorkspaceSyncService(
      mapStore,
      draftStore,
      releaseStore,
      new AgentKnowledgeContentExportService(mapStore),
      {
        submitDraftChange: async () => ({
          backend: 'bugu',
          status: 'conflict',
          message: '团队已有更新，请先处理冲突。',
          workspaceId: 'workspace-conflict-test',
          revision: 'rev-2',
          baseRevision: 'rev-1',
        }),
        publishRelease: async () => ({
          backend: 'bugu',
          status: 'blocked',
          message: '本测试不发布团队知识包。',
        }),
        listSyncConflicts: async ({ workspaceId }) => {
          assert.equal(workspaceId, 'workspace-conflict-test');
          return conflicts;
        },
        resolveSyncConflict: async ({ conflictId, resolutionAction }) => ({
          ...conflicts[0],
          id: conflictId,
          status: 'resolved',
          resolutionAction,
          resolutionNote: '已记录为人工处理。',
          resolvedBy: '功能测试',
          resolvedAt: now,
        }),
      },
    );

    const created = await service.createDraftChange({ workspacePath, contentKnowledgeMapId: 'map-conflict-1', authorLabel: '功能测试' });
    assert.equal(created.draftChange.affectedObjects[0].title, '冲突验证内容地图');
    assert.ok(created.draftChange.affectedObjects.some((item) => item.title === '轻量便携'));
    const submitted = await service.submitDraftChange({ workspacePath, draftChangeId: created.draftChange.id, authorLabel: '功能测试' });
    assert.equal(submitted.status, 'conflict');
    const [conflictedMap] = await mapStore.list(workspacePath);
    assert.equal(conflictedMap.syncStatus, 'conflict');

    const listed = await service.listSyncConflicts(workspacePath);
    assert.equal(listed.length, 1);
    assert.equal(listed[0].baseRevision, 'rev-1');
    assert.equal(listed[0].serverRevision, 'rev-2');
    assert.equal(listed[0].affectedObjects[0].title, '轻量便携');
    assert.equal(listed[0].affectedObjects[0].impact, 'high');

    const resolved = await service.resolveSyncConflict({
      workspacePath,
      conflictId: 'conflict-1',
      resolutionAction: 'keep-local-change',
      resolutionNote: '保留本机修改。',
      resolvedBy: '功能测试',
    });
    assert.equal(resolved?.status, 'resolved');
    assert.equal(resolved?.resolutionAction, 'keep-local-change');
    const [pendingMap] = await mapStore.list(workspacePath);
    assert.equal(pendingMap.syncStatus, 'pending-sync');
    assert.match(pendingMap.teamSync.message, /保留本机修改/);
  });
});

test('内容审核任务能同步到团队工作区并提交审核结论', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const reviewStore = new ContentReviewTaskStore();
    const now = '2026-05-28T00:00:00.000Z';
    await mapStore.save({
      id: 'map-review-1',
      workspacePath,
      title: '防晒产品待审内容地图',
      status: 'needs-review',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'map-rev-1',
      },
      sourceInputSourceIds: ['source-1'],
      brandKnowledgeBaseIds: ['brand-1'],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-review-1',
        title: '敏感肌安心可用',
        summary: '该表达需要补充测试或备案证据。',
        tags: ['卖点', '待验证'],
        sourceRefs: ['brand-knowledge-base:brand-1'],
        evidenceRefs: [],
        confidence: 52,
        status: 'needs-evidence',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: ['功效和人群安全表达必须回到证据来源。'],
      gaps: ['缺少敏感肌人群的可引用证据。'],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 0,
        gapCount: 1,
        readyPercent: 42,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });

    const syncCalls = [];
    const service = new ContentReviewTaskApplicationService(reviewStore, mapStore, {
      syncReviewTasks: async ({ tasks }) => {
        syncCalls.push({ kind: 'tasks', tasks });
        assert.ok(tasks.length >= 1);
        assert.ok(tasks.every((task) => task.sourceKnowledgeMapId === 'map-review-1'));
        return {
          backend: 'bugu',
          status: 'synced',
          message: '审核任务已同步到测试团队工作区。',
          workspaceId: 'workspace-review-test',
          revision: 'review-rev-1',
        };
      },
      submitReviewDecision: async ({ task, decision }) => {
        syncCalls.push({ kind: 'decision', task, decision });
        assert.equal(task.teamSync?.revision, 'review-rev-1');
        assert.equal(decision.action, 'request-evidence');
        return {
          backend: 'bugu',
          status: 'synced',
          message: '审核结论已同步到测试团队工作区。',
          workspaceId: 'workspace-review-test',
          revision: 'review-rev-2',
          baseRevision: task.teamSync?.revision,
        };
      },
    });

    const tasks = await service.generate({ workspacePath, contentKnowledgeMapId: 'map-review-1' });
    const task = tasks.find((item) => item.sourceKnowledgeMapId === 'map-review-1');
    assert.ok(task);
    assert.equal(task.syncStatus, 'synced');
    assert.equal(task.teamSync?.revision, 'review-rev-1');
    assert.equal(task.status, 'needs-evidence');

    const decided = await service.submitDecision({
      workspacePath,
      taskId: task.id,
      action: 'request-evidence',
      reviewerLabel: '功能测试',
      reason: '需要补充敏感肌人群证据。',
    });
    assert.equal(decided.status, 'needs-evidence');
    assert.equal(decided.decisions[0].action, 'request-evidence');
    assert.equal(decided.syncStatus, 'synced');
    assert.equal(decided.teamSync?.revision, 'review-rev-2');
    assert.equal(syncCalls.map((call) => call.kind).join(' -> '), 'tasks -> decision');
  });
});

test('内容审核支持改名、合并和拆分并回写内容知识地图', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const reviewStore = new ContentReviewTaskStore();
    const now = '2026-05-29T00:00:00.000Z';
    await mapStore.save({
      id: 'map-review-mutation-1',
      workspacePath,
      title: '通勤背包内容地图',
      status: 'needs-review',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'map-mutation-rev-1',
      },
      sourceInputSourceIds: ['source-mutation-1'],
      brandKnowledgeBaseIds: ['brand-mutation-1'],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [
        {
          id: 'sp-light-1',
          title: '轻便通勤',
          summary: '适合每天背电脑和文件。',
          tags: ['卖点', '通勤'],
          sourceRefs: ['input-source:source-mutation-1'],
          evidenceRefs: ['evidence-weight-1'],
          materialStatus: 'covered',
          materialRefs: ['asset-light-1'],
          confidence: 72,
          status: 'ready',
        },
        {
          id: 'sp-light-duplicate',
          title: '背起来不累',
          summary: '肩带和重量控制降低通勤负担。',
          tags: ['卖点', '轻便'],
          sourceRefs: ['input-source:source-mutation-1'],
          evidenceRefs: ['evidence-strap-1'],
          materialStatus: 'approved',
          materialRefs: ['asset-strap-1'],
          performanceTags: ['高点击'],
          confidence: 68,
          status: 'needs-review',
        },
        {
          id: 'sp-waterproof-1',
          title: '小雨防泼',
          summary: '短途通勤遇到小雨时保护随身物品。',
          tags: ['卖点', '雨天'],
          sourceRefs: ['input-source:source-mutation-1'],
          evidenceRefs: ['evidence-fabric-1'],
          confidence: 70,
          status: 'ready',
        },
      ],
      painPoints: [],
      scenarios: [],
      evidence: [
        {
          id: 'evidence-weight-1',
          sourceType: 'input-source',
          sourceId: 'source-mutation-1',
          sourceTitle: '产品参数',
          claim: '重量控制',
          excerpt: '整包重量适合日常通勤。',
          status: 'ready',
        },
        {
          id: 'evidence-strap-1',
          sourceType: 'input-source',
          sourceId: 'source-mutation-1',
          sourceTitle: '肩带说明',
          claim: '肩带缓压',
          excerpt: '肩带加宽并有缓冲层。',
          status: 'ready',
        },
        {
          id: 'evidence-fabric-1',
          sourceType: 'input-source',
          sourceId: 'source-mutation-1',
          sourceTitle: '面料说明',
          claim: '防泼面料',
          excerpt: '表面面料可应对短时间小雨。',
          status: 'ready',
        },
      ],
      constraints: ['防泼不等于完全防水。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 3,
        gapCount: 0,
        readyPercent: 67,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });

    const syncCalls = [];
    const service = new ContentReviewTaskApplicationService(reviewStore, mapStore, {
      syncReviewTasks: async ({ tasks }) => {
        syncCalls.push({ kind: 'tasks', tasks });
        return {
          backend: 'bugu',
          status: 'synced',
          message: '审核任务已同步。',
          workspaceId: 'workspace-review-mutation',
          revision: 'review-mutation-rev-1',
        };
      },
      submitReviewDecision: async ({ task, decision }) => {
        syncCalls.push({ kind: 'decision', task, decision });
        assert.match(task.teamSync?.revision ?? '', /^draft-mutation-rev-/);
        return {
          backend: 'bugu',
          status: 'synced',
          message: '审核结论已同步。',
          workspaceId: 'workspace-review-mutation',
          revision: `review-mutation-rev-${syncCalls.length}`,
          baseRevision: task.teamSync?.revision,
        };
      },
    }, {
      createDraftChange: async ({ workspacePath: draftWorkspacePath, contentKnowledgeMapId, authorLabel }) => {
        syncCalls.push({ kind: 'draft-created', contentKnowledgeMapId, authorLabel });
        return {
          status: 'created',
          issues: [],
          draftChange: {
            id: `draft-review-mutation-${syncCalls.length}`,
            workspacePath: draftWorkspacePath,
            workspaceId: 'workspace-review-mutation',
            contentKnowledgeMapId,
            contentKnowledgeMapTitle: '通勤背包内容地图',
            title: '审核调整变更包',
            summary: '审核调整已回写内容知识地图。',
            kind: 'knowledge-map-updated',
            affectedObjectIds: [contentKnowledgeMapId],
            baseRevision: 'map-mutation-rev-1',
            syncStatus: 'local-draft',
            authorLabel,
            issues: [],
            createdAt: now,
            updatedAt: now,
          },
        };
      },
      submitDraftChange: async ({ draftChangeId, authorLabel }) => {
        syncCalls.push({ kind: 'draft-submitted', draftChangeId, authorLabel });
        return {
          status: 'submitted',
          issues: [],
          teamSync: {
            backend: 'bugu',
            status: 'synced',
            message: '审核调整变更包已同步。',
            workspaceId: 'workspace-review-mutation',
            revision: `draft-mutation-rev-${syncCalls.length}`,
          },
        };
      },
    });

    const tasks = await service.generate({
      workspacePath,
      contentKnowledgeMapId: 'map-review-mutation-1',
      targetRowIds: ['sp-light-1'],
    });
    const task = tasks.find((item) => item.targetId === 'sp-light-1');
    assert.ok(task);

    const renamed = await service.submitDecision({
      workspacePath,
      taskId: task.id,
      action: 'rename-target',
      payload: {
        title: '通勤轻便不压肩',
        summary: '把重量和肩带缓压合并成通勤人群能理解的表达。',
      },
      reviewerLabel: '功能测试',
    });
    assert.equal(renamed.title, '通勤轻便不压肩');
    assert.equal(renamed.status, 'open');
    assert.equal(renamed.decisions[0].payload.title, '通勤轻便不压肩');
    let [map] = await mapStore.list(workspacePath);
    assert.equal(map.sellingPoints.find((row) => row.id === 'sp-light-1')?.title, '通勤轻便不压肩');
    assert.equal(map.syncStatus, 'pending-sync');

    const merged = await service.submitDecision({
      workspacePath,
      taskId: task.id,
      action: 'merge-related',
      payload: {
        title: '通勤轻便缓压',
        summary: '整合重量控制和肩带缓压，作为同一个通勤卖点审核。',
        mergeTargetIds: ['sp-light-duplicate'],
      },
      reviewerLabel: '功能测试',
    });
    assert.equal(merged.title, '通勤轻便缓压');
    assert.deepEqual(new Set(merged.evidenceRefs), new Set(['evidence-weight-1', 'evidence-strap-1']));
    map = (await mapStore.list(workspacePath))[0];
    const mergedRow = map.sellingPoints.find((row) => row.id === 'sp-light-1');
    assert.ok(mergedRow);
    assert.equal(map.sellingPoints.some((row) => row.id === 'sp-light-duplicate'), false);
    assert.equal(mergedRow.materialStatus, 'approved');
    assert.ok(mergedRow.performanceTags.includes('高点击'));

    const split = await service.submitDecision({
      workspacePath,
      taskId: task.id,
      action: 'split-target',
      payload: {
        splitItems: [
          { title: '通勤轻便', summary: '用于日常通勤背负。' },
          { title: '肩带缓压', summary: '用于长时间背负不勒肩。' },
        ],
      },
      reviewerLabel: '功能测试',
    });
    assert.equal(split.title, '通勤轻便');
    map = (await mapStore.list(workspacePath))[0];
    const splitRows = map.sellingPoints.filter((row) => row.title === '通勤轻便' || row.title === '肩带缓压');
    assert.equal(splitRows.length, 2);
    assert.ok(splitRows.every((row) => row.status === 'needs-review'));
    assert.ok(splitRows.every((row) => row.materialStatus === 'missing'));
    assert.equal(syncCalls.filter((call) => call.kind === 'decision').length, 3);
    assert.equal(syncCalls.filter((call) => call.kind === 'draft-submitted').length, 3);
    assert.equal(syncCalls.at(-1).decision.afterSnapshot.mutation.type, 'split-target');
  });
});

test('内容知识地图可为同一组合创建独立补素材任务', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const reviewStore = new ContentReviewTaskStore();
    const now = '2026-05-30T00:20:00.000Z';
    await mapStore.save({
      id: 'map-material-task-1',
      workspacePath,
      title: '便携风扇内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'material-task-map-rev-1',
      },
      sourceInputSourceIds: ['source-material-task-1'],
      brandKnowledgeBaseIds: ['brand-material-task-1'],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-material-task-1',
        title: '长效续航',
        summary: '适合办公室低档持续使用，但短视频素材仍缺竖版演示。',
        tags: ['卖点', '续航'],
        sourceRefs: ['brand-knowledge-base:brand-material-task-1'],
        evidenceRefs: ['evidence-material-task-1'],
        materialStatus: 'missing',
        materialRefs: [],
        confidence: 82,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-material-task-1',
        sourceType: 'input-source',
        sourceId: 'source-material-task-1',
        sourceTitle: '续航测试',
        claim: '低档 9-14h',
        excerpt: '低档续航测试记录 9-14 小时。',
        status: 'ready',
      }],
      constraints: ['续航表达必须引用测试区间。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });

    const syncCalls = [];
    const service = new ContentReviewTaskApplicationService(reviewStore, mapStore, {
      syncReviewTasks: async ({ tasks }) => {
        syncCalls.push({ kind: 'tasks', tasks });
        return {
          backend: 'bugu',
          status: 'synced',
          message: '审核任务已同步到测试团队工作区。',
          workspaceId: 'workspace-material-task',
          revision: `material-task-review-rev-${syncCalls.length}`,
        };
      },
      submitReviewDecision: async ({ task, decision }) => {
        syncCalls.push({ kind: 'decision', task, decision });
        assert.equal(decision.action, 'request-material');
        assert.equal(task.taskPurpose, 'material-supplement');
        return {
          backend: 'bugu',
          status: 'synced',
          message: '补素材结论已同步到测试团队工作区。',
          workspaceId: 'workspace-material-task',
          revision: 'material-task-review-rev-final',
          baseRevision: task.teamSync?.revision,
        };
      },
    });

    const reviewTasks = await service.generate({
      workspacePath,
      contentKnowledgeMapId: 'map-material-task-1',
      targetRowIds: ['selling-material-task-1'],
    });
    const reviewTask = reviewTasks.find((task) => task.targetId === 'selling-material-task-1' && (task.taskPurpose ?? 'review') === 'review');
    assert.ok(reviewTask);
    assert.equal(reviewTask.status, 'open');
    assert.equal(reviewTask.suggestedAction, 'approve');

    const materialTasks = await service.generate({
      workspacePath,
      contentKnowledgeMapId: 'map-material-task-1',
      targetRowIds: ['selling-material-task-1'],
      taskPurpose: 'material-supplement',
    });
    const materialTask = materialTasks.find((task) => task.targetId === 'selling-material-task-1' && task.taskPurpose === 'material-supplement');
    assert.ok(materialTask);
    assert.equal(materialTask.status, 'needs-material');
    assert.equal(materialTask.suggestedAction, 'request-material');
    assert.match(materialTask.title, /补素材/);
    assert.ok(materialTask.issueLabels.includes('补素材'));

    const persisted = await reviewStore.list(workspacePath);
    assert.equal(persisted.filter((task) => task.targetId === 'selling-material-task-1').length, 2);
    assert.ok(persisted.some((task) => (task.taskPurpose ?? 'review') === 'review'));
    assert.ok(persisted.some((task) => task.taskPurpose === 'material-supplement'));

    const decided = await service.submitDecision({
      workspacePath,
      taskId: materialTask.id,
      action: 'request-material',
      reviewerLabel: '功能测试',
      reason: '需要补一条办公室低档竖版演示视频。',
    });
    assert.equal(decided.status, 'needs-material');
    assert.equal(decided.decisions[0].action, 'request-material');
    assert.equal(decided.syncStatus, 'synced');
    assert.equal(decided.teamSync?.revision, 'material-task-review-rev-final');
    assert.equal(syncCalls.filter((call) => call.kind === 'tasks').length, 2);
    assert.equal(syncCalls.filter((call) => call.kind === 'decision').length, 1);
  });
});

test('素材覆盖回写能同步到团队工作区且不发送素材本机路径', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const assetStore = new AssetReviewStore();
    const now = '2026-05-28T00:00:00.000Z';
    await mapStore.save({
      id: 'map-material-1',
      workspacePath,
      title: '防晒素材覆盖内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'material-rev-1',
      },
      sourceInputSourceIds: ['source-1'],
      brandKnowledgeBaseIds: ['brand-1'],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-material-1',
        title: '轻薄不闷肤',
        summary: '适合通勤补涂的肤感卖点。',
        tags: ['卖点', '通勤'],
        sourceRefs: ['brand-knowledge-base:brand-1'],
        evidenceRefs: ['evidence-1'],
        confidence: 88,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-1',
        sourceType: 'manual',
        sourceTitle: '产品卖点确认表',
        claim: '轻薄肤感适合通勤补涂。',
        excerpt: '调研记录显示用户关注清爽、不闷和不搓泥。',
        status: 'ready',
      }],
      constraints: ['功效表达必须引用证据。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });
    const asset = await assetStore.review({
      workspacePath,
      assetKey: 'asset-material-1',
      kind: 'image',
      sourceType: 'manual',
      path: `${workspacePath}/private/material-1.png`,
      title: '轻薄不闷肤通勤实拍',
      status: 'approved',
      note: '可覆盖通勤补涂卖点。',
      tags: ['coverage:selling-material-1', '高复用'],
    });

    const syncCalls = [];
    const service = new ContentMaterialFeedbackService(mapStore, assetStore, {
      appendMaterialCoverage: async ({ contentKnowledgeMapId, result }) => {
        syncCalls.push({ contentKnowledgeMapId, result });
        assert.equal(contentKnowledgeMapId, 'map-material-1');
        assert.equal(result.updatedRowCount, 1);
        assert.ok(result.coverageChangeId);
        assert.doesNotMatch(JSON.stringify(result.updates), /private\/material-1|\/Users\/|\/tmp\/content-studio-functional/);
        return {
          backend: 'bugu',
          status: 'synced',
          message: '素材覆盖已同步到测试团队工作区。',
          workspaceId: 'workspace-material-test',
          revision: 'material-rev-2',
          baseRevision: 'material-rev-1',
        };
      },
    });

    const result = await service.writeBack({
      workspacePath,
      contentKnowledgeMapId: 'map-material-1',
      assetReviewIds: [asset.id],
    });
    assert.equal(result.status, 'updated');
    assert.equal(result.syncStatus, 'synced');
    assert.equal(result.teamSync?.revision, 'material-rev-2');
    assert.equal(result.contentKnowledgeMap?.sellingPoints[0].materialStatus, 'approved');
    assert.deepEqual(result.contentKnowledgeMap?.sellingPoints[0].materialRefs, [asset.id]);
    assert.deepEqual(result.contentKnowledgeMap?.sellingPoints[0].performanceTags, ['高复用']);
    const coverageByReviewId = buildAssetCoverageByReviewId(result.contentKnowledgeMap ? [result.contentKnowledgeMap] : []);
    const assetCoverageLinks = coverageByReviewId.get(asset.id) ?? [];
    assert.equal(assetCoverageLinks.length, 1);
    assert.equal(assetCoverageLinks[0].rowTitle, '轻薄不闷肤');
    assert.equal(assetCoverageLinks[0].targetLabel, '卖点组合');
    assert.equal(assetCoverageLinks[0].materialStatus, 'approved');
    assert.deepEqual(assetCoverageLinks[0].performanceTags, ['高复用']);
    assert.equal(syncCalls.length, 1);
    const [savedMap] = await mapStore.list(workspacePath);
    assert.equal(savedMap.syncStatus, 'synced');
    assert.equal(savedMap.teamSync.revision, 'material-rev-2');
  });
});

test('素材覆盖回写只生成待确认补充任务且不自动改写主文案', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const assetStore = new AssetReviewStore();
    const reviewStore = new ContentReviewTaskStore();
    const now = '2026-05-28T00:00:00.000Z';
    await mapStore.save({
      id: 'map-material-supplement-1',
      workspacePath,
      title: '防晒素材补充内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'material-supplement-rev-1',
      },
      sourceInputSourceIds: ['source-1'],
      brandKnowledgeBaseIds: ['brand-1'],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-material-supplement-1',
        title: '轻薄不闷肤',
        summary: '适合通勤补涂的肤感卖点。',
        tags: ['卖点', '通勤'],
        sourceRefs: ['brand-knowledge-base:brand-1'],
        evidenceRefs: ['evidence-1'],
        confidence: 88,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-1',
        sourceType: 'manual',
        sourceTitle: '产品卖点确认表',
        claim: '轻薄肤感适合通勤补涂。',
        excerpt: '调研记录显示用户关注清爽、不闷和不搓泥。',
        status: 'ready',
      }],
      constraints: ['功效表达必须引用证据。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });
    const asset = await assetStore.review({
      workspacePath,
      assetKey: 'asset-material-supplement-1',
      kind: 'image',
      sourceType: 'manual',
      path: `${workspacePath}/private/material-supplement-1.png`,
      title: '轻薄不闷肤通勤实拍',
      status: 'approved',
      note: '素材证明清爽肤感和通勤补涂场景。',
      tags: ['coverage:selling-material-supplement-1', '高复用'],
    });

    const reviewSyncCalls = [];
    const service = new ContentMaterialFeedbackService(
      mapStore,
      assetStore,
      {
        appendMaterialCoverage: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '素材覆盖已同步到测试团队工作区。',
          workspaceId: 'workspace-material-supplement-test',
          revision: 'material-supplement-rev-2',
          baseRevision: 'material-supplement-rev-1',
        }),
      },
      reviewStore,
      {
        syncReviewTasks: async ({ tasks }) => {
          reviewSyncCalls.push(tasks);
          assert.equal(tasks.length, 1);
          assert.equal(tasks[0].targetType, 'evidence');
          assert.equal(tasks[0].targetId, 'material-supplement:map-material-supplement-1:selling-point:selling-material-supplement-1');
          assert.equal(tasks[0].status, 'open');
          assert.equal(tasks[0].suggestedAction, 'approve');
          assert.ok(tasks[0].issueLabels.includes('不改主文案'));
          assert.match(tasks[0].summary, /不会自动改写主文案/);
          assert.doesNotMatch(JSON.stringify(tasks), /private\/material-supplement-1|\/Users\/|\/tmp\/content-studio-functional/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '待确认补充已同步到团队审核。',
            workspaceId: 'workspace-material-supplement-test',
            revision: 'material-supplement-rev-3',
            baseRevision: 'material-supplement-rev-2',
          };
        },
        submitReviewDecision: async () => {
          throw new Error('素材补充生成不应提交审核结论');
        },
      },
    );

    const result = await service.writeBack({
      workspacePath,
      contentKnowledgeMapId: 'map-material-supplement-1',
      assetReviewIds: [asset.id],
    });
    assert.equal(result.status, 'updated');
    assert.equal(result.pendingSupplementTaskCount, 1);
    assert.equal(result.teamSync?.revision, 'material-supplement-rev-3');
    assert.equal(result.contentKnowledgeMap?.sellingPoints[0].title, '轻薄不闷肤');
    assert.equal(result.contentKnowledgeMap?.sellingPoints[0].summary, '适合通勤补涂的肤感卖点。');
    assert.equal(reviewSyncCalls.length, 1);
    const reviewTasks = await reviewStore.list(workspacePath);
    assert.equal(reviewTasks.length, 1);
    assert.equal(reviewTasks[0].syncStatus, 'synced');
    assert.equal(reviewTasks[0].teamSync?.revision, 'material-supplement-rev-3');
    const [savedMap] = await mapStore.list(workspacePath);
    assert.equal(savedMap.teamSync.revision, 'material-supplement-rev-3');
  });
});

test('Prompt 草案物化 Skill 时可以写入真实执行规范', async () => {
  await withWorkspace(async (workspacePath) => {
    const manager = new SkillManager();
    const result = await manager.createProjectSkill({
      workspacePath,
      slug: 'prompt-materialized-skill',
      name: 'Prompt 物化 Skill',
      description: '由 PromptDraft 物化的本地 skill。',
      instructions: [
        '### 执行规范',
        '根据品牌知识库和用户意图生成可追溯 Prompt。',
        '',
        '### 输出约束',
        '- 不编造功效和案例。',
      ].join('\n'),
    });

    assert.equal(result.skill.slug, 'prompt-materialized-skill');
    assert.equal(result.skill.metadata.name, 'Prompt 物化 Skill');
    const content = await readFile(join(workspacePath, '.bugu', 'skills', 'prompt-materialized-skill', 'SKILL.md'), 'utf-8');
    assert.match(content, /根据品牌知识库和用户意图生成可追溯 Prompt/);
    assert.match(content, /不编造功效和案例/);
  });
});

class FakeTextGenerationService {
  calls = [];

  async getRuntimeConfig(model) {
    return { model: model || 'fake-text-model' };
  }

  async generateJson(input) {
    this.calls.push(input);
    let task;
    let parsedPrompt;
    try {
      parsedPrompt = JSON.parse(input.prompt);
      task = parsedPrompt.task;
    } catch {
      task = undefined;
    }
    if (!task && typeof input.prompt === 'string' && input.prompt.includes('下游用途：')) {
      const hasSupplementSource = input.prompt.includes('补充产品资料');
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          title: '多轮 Prompt 草稿',
          prompt: hasSupplementSource
            ? '基于补充产品资料生成可执行 Prompt：便携条包，早餐后与办公室抽屉场景，不承诺治疗。'
            : '围绕用户意图与输入源生成可执行 Prompt。',
          followUpQuestions: ['请补充平台和画幅。'],
          sourceWarnings: ['仅基于输入源摘录，不扩写功效。'],
          qualityChecklist: ['人物、场景、动作、镜头清楚'],
        },
      };
    }
    if (task === 'generate_prompt_pack') {
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          name: '功能测试品牌提示词包',
          brandVoice: '真实、克制、可追溯，不夸大效果。',
          visualStyle: '干净电商质感，产品主体清晰，保留生活化场景。',
          sellingPointRules: ['先讲场景再讲卖点', '所有收益回到知识引用', '避免绝对化表达'],
          complianceBoundaries: ['不承诺疗效', '不做无依据对比'],
          platformConstraints: ['公众号完整论证', '小红书真实体验', '详情页强调视觉证据'],
          imagePromptFragments: ['自然光厨房场景', '产品主体清晰', '少字高可信'],
          videoPromptFragments: ['开头痛点', '中段展示使用', '结尾给行动提示'],
        },
      };
    }
    if (task === 'generate_brand_knowledge_base') {
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          title: '便携条包品牌知识库',
          brandVoice: '真实、克制、可追溯，不夸大效果。',
          audience: '早餐后和办公室用户',
          productFacts: ['便携条包', '早餐后或办公室抽屉'],
          coreSellingPoints: ['降低坚持门槛', '随手可放'],
          complianceBoundaries: ['不承诺治疗', '不写绝对化收益', '不做无依据背书'],
          sceneSeeds: ['早餐后', '办公室抽屉'],
          promptFragments: ['真实生活场景', '自然光', '少字高可信'],
        },
      };
    }
    if (task === 'generate_content_knowledge_map') {
      const evidence = Array.isArray(parsedPrompt?.seed?.evidence) ? parsedPrompt.seed.evidence : [];
      const firstEvidence = evidence[0] ?? {};
      const evidenceRef = typeof firstEvidence.id === 'string' ? firstEvidence.id : '';
      const sourceRef = typeof firstEvidence.sourceRef === 'string' ? firstEvidence.sourceRef : '';
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          title: '通勤防晒内容知识地图',
          sellingPoints: [{
            title: '模型命名卖点：通勤清爽补涂',
            summary: '基于产品资料归纳为适合通勤补涂的清爽肤感表达。',
            tags: ['卖点', '通勤', '清爽'],
            dimensions: {
              audiences: ['通勤人群'],
              channels: ['抖音'],
              stages: ['种草'],
              contentFormats: ['短视频'],
              useCases: ['通勤补涂'],
            },
            sourceRefs: sourceRef ? [sourceRef] : [],
            evidenceRefs: evidenceRef ? [evidenceRef] : [],
            confidence: 88,
            status: 'ready',
            materialStatus: 'missing',
          }],
          painPoints: [{
            title: '模型归纳痛点：担心补涂厚重',
            summary: '从输入资料的清爽肤感反推用户对厚重和黏腻的购买顾虑。',
            tags: ['痛点', '补涂'],
            dimensions: {
              audiences: ['通勤人群'],
              channels: ['抖音'],
              stages: ['转化'],
              contentFormats: ['口播'],
              useCases: ['午后补涂'],
            },
            sourceRefs: sourceRef ? [sourceRef] : [],
            evidenceRefs: evidenceRef ? [evidenceRef] : [],
            confidence: 82,
            status: 'ready',
            materialStatus: 'missing',
          }],
          scenarios: [{
            title: '模型组合场景：通勤包内补涂',
            summary: '把产品资料转成可拍摄场景：通勤包内携带，午后快速补涂。',
            tags: ['场景', '通勤'],
            dimensions: {
              audiences: ['通勤人群'],
              channels: ['抖音'],
              stages: ['种草'],
              contentFormats: ['短视频'],
              useCases: ['包内携带'],
            },
            sourceRefs: sourceRef ? [sourceRef] : [],
            evidenceRefs: evidenceRef ? [evidenceRef] : [],
            confidence: 84,
            status: 'ready',
            materialStatus: 'missing',
          }],
          constraints: ['不能承诺治疗、绝对防护或无依据背书。'],
          gaps: ['模型识别缺口：缺少真实用户评论和已审核 Prompt 草稿。'],
        },
      };
    }
    if (task === 'generate_ip_knowledge_base') {
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          title: '嘉文老师 IP 知识库',
          layers: {
            identity: '身份锚定',
            values: '价值观立场',
            language: '语言风格',
            methodology: '判断方法',
            materials: '内容素材',
            engine: '创作引擎',
          },
          extensionScenes: ['口播', '朋友圈', '私域回复'],
          missingLayers: [],
        },
      };
    }
    if (task === 'generate_scene_cards') {
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          cards: [1, 2, 3].map((index) => ({
            title: `办公室早餐场景 ${index}`,
            audience: '忙碌上班族',
            painPoint: '早餐后健康管理难坚持',
            usageScene: '办公室抽屉和早餐桌',
            visualComposition: '产品居中，真实台面，自然光',
            sellingPoint: '便携条包，降低坚持门槛',
            voiceoverDirection: '像真实使用者解释，不夸张',
            imageMaterialSuggestion: '生成办公室早餐电商场景图',
            videoMaterialSuggestion: '生成 15 秒早餐后使用短视频',
          })),
        },
      };
    }
    if (task === 'generate_article') {
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          titleCandidates: ['把产品讲成人话', '从使用场景开始做内容', '知识库驱动的内容草稿'],
          outline: ['痛点', '事实引用', '场景', '合规边界', '行动建议'],
          summary: '基于知识库引用生成可复核文章。',
          markdown: '# 把产品讲成人话\n\n引用知识库事实 [1]，再进入场景化表达。',
          publishCheck: [
            { level: 'info', message: '已包含事实引用。' },
            { level: 'warning', message: '发布前复核合规边界。' },
          ],
        },
      };
    }
    if (task === 'generate_video_script') {
      const targetShotCount = Math.max(1, Number(parsedPrompt?.targetShotCount ?? 3));
      const referenceRhythm = Array.isArray(parsedPrompt?.scriptContext?.referenceRhythm)
        ? parsedPrompt.scriptContext.referenceRhythm
        : [];
      const storyboard = Array.from({ length: targetShotCount }, (_, index) => {
        const shot = index + 1;
        const reference = referenceRhythm[index] ?? {};
        return {
          shot,
          duration: reference.timeRange || '5s',
          timeRange: reference.timeRange || '',
          shotType: reference.shotType || 'medium',
          character: '目标达人',
          characterAction: `镜头 ${shot} 的目标动作`,
          scene: '目标厨房',
          cameraMovement: reference.cameraMovement || '固定机位',
          visual: `镜头 ${shot} 的真实使用画面`,
          voiceover: `镜头 ${shot} 的自然口播`,
          subtitle: `字幕 ${shot}`,
          rhythm: reference.shotType ? `${reference.shotType} / 复用节奏` : shot === 1 ? '快节奏钩子' : '中速解释',
          imagePrompt: `Photorealistic product video shot ${shot}, real home kitchen, natural light`,
          videoPrompt: `目标达人展示本方产品的第 ${shot} 个动作，目标厨房真实场景，${reference.shotType || '中景'}固定机位，写实短视频风格。`,
          transitionHint: 'cut',
          voiceStyle: '自然中速',
        };
      });
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          title: '早餐后场景短视频脚本',
          script: storyboard.map((shot) => `镜头 ${shot.shot}：${shot.visual}`).join('\n'),
          resourceFramework: {
            characters: [{ name: '目标达人', shotCount: targetShotCount, voiceTraits: '自然中速', threeViewPrompt: 'photorealistic target presenter, front side back view' }],
            scenes: [{ name: '目标厨房', shotCount: targetShotCount, environment: '明亮真实厨房', lighting: '自然窗光', sceneImagePrompt: 'Bright realistic kitchen, natural window light, photorealistic' }],
          },
          storyboard,
          videoPrompt: '4:5，15 秒，真实产品使用画面。',
          publishCheck: [
            { level: 'info', message: '脚本已绑定知识引用。' },
            { level: 'warning', message: '上线前复核素材授权。' },
          ],
        },
      };
    }
    if (task === 'evaluate_video_script') {
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          hookScore: { score: 7, reasoning: '首镜头用痛点提问进入。' },
          structureScore: { score: 6.5, reasoning: '脚本按痛点、演示、证明推进。' },
          sellingPointScore: { score: 7.2, reasoning: '产品卖点出现在演示镜头。' },
          voiceoverScore: { score: 6.8, reasoning: '口播自然，但结尾可更强。' },
          pacingScore: { score: 7.1, reasoning: '镜头时长较紧凑。' },
          suggestions: ['补证据镜头', '强化 CTA', '减少绝对化'],
        },
      };
    }
    if (task === 'rewrite_video_script_shot') {
      const currentShot = parsedPrompt?.currentShot ?? {};
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          timeRange: currentShot.timeRange || currentShot.duration || '00:00-00:03',
          duration: currentShot.duration || '3s',
          visual: '重写后的真实厨房油污对比镜头',
          voiceover: '喷完以后别急着擦，先看油污自己浮起来。',
          subtitle: '油污浮起来',
          rhythm: '更强对比节奏',
          shotType: currentShot.shotType || 'comparison',
          character: currentShot.character || '目标达人',
          scene: currentShot.scene || '目标厨房',
          cameraMovement: currentShot.cameraMovement || '固定机位',
          imagePrompt: 'Photorealistic kitchen grease comparison shot, natural light',
          videoPrompt: '目标达人展示油污浮起的前后对比，真实厨房场景，固定机位，手机短视频质感。',
          reasoning: '增强前后对比并保留时间线。',
          publishCheck: [{ level: 'warning', message: '重写镜头需复核功效依据。' }],
        },
      };
    }
    if (task === 'generate_image_skill') {
      return {
        model: input.model || 'fake-text-model',
        rawText: '{}',
        value: {
          id: 'xiaohongshu-skincare-cover',
          name: '小红书护肤封面',
          version: '1.0.0',
          icon: '🧴',
          category: '社媒',
          description: '生成高端护肤品小红书封面图。',
          config: { defaultRatio: '3:4', defaultCount: 1 },
          prompts: {
            system: '你是专业的小红书护肤品封面图片提示词专家。请根据产品名称、卖点、目标人群和风格偏好，生成适合真实商业投放的图片提示词。要求画面主体清晰、包装可辨识、背景与护肤场景一致，避免夸大功效、医疗暗示和不可读文字。输出时要把构图、光线、材质、颜色、镜头语言和合规边界写清楚。',
            enhance: 'premium skincare, clean composition, soft daylight, commercial photography',
            negative: 'medical claims, messy text, watermark, distorted packaging',
          },
          variables: [
            { key: 'productName', label: '产品名称', type: 'text', required: true, placeholder: '例如：多肽精华' },
            { key: 'style', label: '风格', type: 'select', options: ['清透', '高级'], default: '高级' },
          ],
        },
      };
    }
    throw new Error(`未覆盖的测试任务：${task}`);
  }
}

class FakeAppServerPromptAgentService {
  draftCalls = [];
  refineCalls = [];
  failDraftReason;
  failRefineReason;

  constructor(options = {}) {
    this.failDraftReason = options.failDraftReason;
    this.failRefineReason = options.failRefineReason;
  }

  async generatePromptDraft(input) {
    this.draftCalls.push(input);
    if (this.failDraftReason) throw new Error(this.failDraftReason);
    const model = input.textModel || 'lime-agent-server-test';
    const content = [
      'Lime Agent Server Prompt 草稿',
      '',
      `模型：${model}`,
      '',
      'Prompt 正文：',
      '围绕用户意图与输入源生成可执行 Prompt。',
    ].join('\n');
    return {
      title: 'Lime Agent Server 会话草稿',
      content,
      note: `Lime Agent Server 会话草稿：${model}`,
      model,
      protocol: undefined,
      providerEvents: [
        {
          eventClass: 'model.requested',
          kind: 'model',
          status: 'completed',
          phase: 'waiting_provider',
          title: 'Lime Agent Server requested',
          detail: model,
          model,
          payload: { runtime: 'lime-agent-server', operation: 'draft' },
        },
        {
          eventClass: 'artifact.changed',
          kind: 'draft',
          status: 'completed',
          phase: 'completed',
          title: 'Lime Agent Server artifact.snapshot',
          detail: '上游 Prompt artifact 快照',
          model,
          payload: {
            runtime: 'lime-agent-server',
            operation: 'draft',
            eventType: 'artifact.snapshot',
            artifactRef: 'app-server:prompt-draft:snapshot',
            rawPayload: {
              artifactRef: 'app-server:prompt-draft:snapshot',
              content,
            },
          },
        },
        {
          eventClass: 'model.completed',
          kind: 'model',
          status: 'completed',
          phase: 'completed',
          title: 'Lime Agent Server completed',
          detail: model,
          model,
          payload: { runtime: 'lime-agent-server', operation: 'draft' },
        },
      ],
    };
  }

  async generateRefinedPrompt(input) {
    this.refineCalls.push(input);
    if (this.failRefineReason) throw new Error(this.failRefineReason);
    const hasSupplementSource = input.sourceSnapshots?.some((source) => source.title.includes('补充产品资料'));
    const model = input.textModel || 'lime-agent-server-test';
    const content = [
      input.previousContent,
      '',
      '本轮调整：',
      input.adjustment,
      hasSupplementSource ? '补充产品资料：便携条包，早餐后与办公室抽屉场景，不承诺治疗。' : '',
    ].join('\n');
    return {
      content,
      note: `Lime Agent Server 多轮调整：${model}`,
      model,
      protocol: undefined,
      providerEvents: [
        {
          eventClass: 'model.requested',
          kind: 'model',
          status: 'completed',
          phase: 'waiting_provider',
          title: 'Lime Agent Server requested',
          detail: model,
          model,
          payload: { runtime: 'lime-agent-server', operation: 'refine' },
        },
        {
          eventClass: 'artifact.changed',
          kind: 'draft',
          status: 'completed',
          phase: 'completed',
          title: 'Lime Agent Server artifact.snapshot',
          detail: '上游 Prompt artifact 快照',
          model,
          payload: {
            runtime: 'lime-agent-server',
            operation: 'refine',
            eventType: 'artifact.snapshot',
            artifactRef: 'app-server:prompt-draft:snapshot',
            rawPayload: {
              artifactRef: 'app-server:prompt-draft:snapshot',
              content,
            },
          },
        },
        {
          eventClass: 'model.completed',
          kind: 'model',
          status: 'completed',
          phase: 'completed',
          title: 'Lime Agent Server completed',
          detail: model,
          model,
          payload: { runtime: 'lime-agent-server', operation: 'refine' },
        },
      ],
    };
  }
}

const citation = {
  knowledgeBaseId: 'product-demo',
  sectionId: 'product-1',
  title: '示例产品 / 产品',
  sectionType: 'product',
  excerpt: '示例产品主打清晰成分、便携条包、适合早餐后或办公场景使用。',
};


test('图片模板参数会格式化为可读中文字段', () => {
  const formatted = formatImageTemplateInputs('场景图', {
    productName: '测试产品',
    sceneType: '厨房餐厅',
  });
  assert.match(formatted, /产品名称: 测试产品/);
  assert.match(formatted, /场景选择: 厨房餐厅/);

  const promptContext = formatImageTemplatePromptContext('美食摄影');
  assert.match(promptContext, /Skill System Prompt/);
  assert.match(promptContext, /SMART INGREDIENT MATCHING TABLE/);
  assert.doesNotMatch(promptContext, new RegExp(`${['光', '核'].join('')}|${['g', 'uanghe'].join('')}`, 'i'));
});

test('生成素材引用只取输出产物，不把输入参考图当成素材库资产', () => {
  const log = {
    kind: 'image',
    status: 'succeeded',
    input: {
      productImageRefs: ['/tmp/product.png'],
      referenceImageRefs: ['/tmp/reference.png'],
    },
    output: {
      assetRefs: ['/tmp/generated-1.png', 'https://cdn.example.com/generated-remote.png'],
    },
    artifactRefs: ['/tmp/generated-1.png', '/tmp/generated-2.png'],
  };

  assert.deepEqual(extractGeneratedAssetRefsFromLog(log), ['/tmp/generated-1.png', '/tmp/generated-2.png']);
  assert.deepEqual(extractLocalRefsFromLog(log), ['/tmp/product.png', '/tmp/reference.png', '/tmp/generated-1.png', '/tmp/generated-2.png']);
});

test('AI 创建图片技能会生成当前内容工厂可用的模板配置', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const imageSkills = new ImageSkillGenerationService(text);
    const result = await imageSkills.generate({
      workspacePath,
      description: '创建一个小红书护肤品封面技能，适合高端护肤品牌种草。',
    });

    assert.equal(result.model, 'fake-text-model');
    assert.equal(result.template.id, 'xiaohongshu-skincare-cover');
    assert.equal(result.template.name, '小红书护肤封面');
    assert.equal(result.template.author, getOemRuntimeConfig().shortName);
    assert.equal(result.template.defaultRatio, '3:4');
    assert.equal(result.template.defaultCount, 1);
    assert.equal(result.template.fields.length, 2);
    assert.deepEqual(result.template.fields.map((field) => field.key), ['productName', 'style']);
    assert.equal(result.template.fields[1].kind, 'single');
    assert.match(result.template.prompts.system, /护肤品封面图片提示词专家/);
    assert.doesNotMatch(JSON.stringify(result.template), new RegExp(`${['光', '核'].join('')}|${['g', 'uanghe'].join('')}`, 'i'));
    assert.equal(JSON.parse(text.calls.at(-1).prompt).task, 'generate_image_skill');
  });
});

test('本地图片技能 JSON 可以导入并归一化为模板配置', async () => {
  await withWorkspace(async (workspacePath) => {
    const skillPath = join(workspacePath, 'imported-image.skill.json');
    await writeFile(skillPath, JSON.stringify({
      id: 'imported-food-cover',
      name: '导入美食封面',
      version: '2.0.0',
      author: '第三方',
      icon: '🍜',
      category: '美食',
      description: '生成餐饮品牌社媒封面。',
      config: { defaultRatio: '4:5', defaultCount: 2 },
      prompts: {
        system: '你是专业餐饮摄影图片提示词专家。请根据菜品名称、餐厅定位和用户补充需求生成适合社媒封面的图片提示词，突出真实食材、自然光、热气、餐具、背景氛围和商业可用性，避免夸张文字、低清晰度、水印和不真实摆盘。',
        enhance: 'food photography, warm light, appetizing, commercial cover',
        negative: 'watermark, low quality, messy plate',
      },
      variables: [
        { key: 'foodName', label: '菜品名称', type: 'text', required: true, placeholder: '例如：牛肉面' },
        { key: 'scene', label: '拍摄场景', type: 'select', options: ['餐桌', '外卖包装'] },
      ],
    }), 'utf-8');

    const imageSkills = new ImageSkillGenerationService(new FakeTextGenerationService());
    const result = await imageSkills.importFromFile(skillPath);

    assert.equal(result.model, 'local-json');
    assert.equal(result.template.name, '导入美食封面');
    assert.equal(result.template.author, getOemRuntimeConfig().shortName);
    assert.equal(result.template.defaultRatio, '4:5');
    assert.equal(result.template.defaultCount, 2);
    assert.deepEqual(result.template.fields.map((field) => field.kind), ['text', 'single']);
    assert.match(result.rawText, /imported-food-cover/);
  });
});

test('更新检查在品牌 API 和静态清单 404 时回退到 GitHub Release', async () => {
  const previousApiUrl = process.env.CONTENT_STUDIO_UPDATE_API_URL;
  const previousManifestUrl = process.env.CONTENT_STUDIO_UPDATE_MANIFEST_URL;
  const previousReleaseApiUrl = process.env.CONTENT_STUDIO_GITHUB_RELEASE_API_URL;
  const previousBrandId = process.env.CONTENT_STUDIO_BRAND_ID;
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (request.url === '/api/latest' || request.url === '/static/latest.json') {
      response.statusCode = 404;
      response.end('not found');
      return;
    }
    if (request.url === '/github/latest') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        tag_name: 'v0.10.0',
        html_url: 'https://github.com/limecloud/content-studio/releases/tag/v0.10.0',
        published_at: '2026-05-22T11:30:27Z',
        assets: [
          {
            name: 'bugu-0.10.0-linux-x86_64.AppImage',
            size: 266502323,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/bugu-0.10.0-linux-x86_64.AppImage',
          },
          {
            name: 'bugu-0.10.0-mac-arm64.dmg',
            size: 182018032,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/bugu-0.10.0-mac-arm64.dmg',
          },
          {
            name: 'bugu-0.10.0-win-x64.exe',
            size: 151754456,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/bugu-0.10.0-win-x64.exe',
          },
          {
            name: 'seenx-0.10.0-linux-x86_64.AppImage',
            size: 265497525,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/seenx-0.10.0-linux-x86_64.AppImage',
          },
          {
            name: 'seenx-0.10.0-mac-arm64.dmg',
            size: 179065910,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/seenx-0.10.0-mac-arm64.dmg',
          },
          {
            name: 'seenx-0.10.0-win-x64.exe',
            size: 151036537,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/seenx-0.10.0-win-x64.exe',
          },
        ],
      }));
      return;
    }
    response.statusCode = 500;
    response.end('unexpected request');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    process.env.CONTENT_STUDIO_UPDATE_API_URL = `${baseUrl}/api/latest`;
    process.env.CONTENT_STUDIO_UPDATE_MANIFEST_URL = `${baseUrl}/static/latest.json`;
    process.env.CONTENT_STUDIO_GITHUB_RELEASE_API_URL = `${baseUrl}/github/latest`;
    process.env.CONTENT_STUDIO_BRAND_ID = 'bugu';

    const settings = {
      async readView() {
        return {
          recentWorkspacePaths: [],
          hasAnthropicApiKey: false,
          apiKeyStorage: 'none',
          autoUpdateEnabled: true,
        };
      },
      async setAutoUpdateEnabled() { return this.readView(); },
      async setLastUpdateCheckAt() { return this.readView(); },
    };
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: () => undefined,
      },
    };

    const updates = new AutoUpdateService(settings, mainWindow);
    const state = await updates.checkForUpdates({ manual: true });

    assert.deepEqual(requests, ['/api/latest', '/static/latest.json', '/github/latest']);
    assert.equal(state.status, 'update-available');
    assert.equal(state.latestVersion, '0.10.0');
    assert.equal(state.sourceLabel, 'GitHub Release');
    assert.match(state.asset?.fileName ?? '', /^bugu-0\.10\.0-/);
    assert.doesNotMatch(state.asset?.fileName ?? '', /^seenx-/);
    assert.match(state.downloadUrl ?? '', /\/bugu-0\.10\.0-/);

    process.env.CONTENT_STUDIO_BRAND_ID = 'seenx';
    const seenxState = await new AutoUpdateService(settings, mainWindow).checkForUpdates({ manual: true });
    assert.equal(seenxState.sourceLabel, 'GitHub Release');
    assert.match(seenxState.asset?.fileName ?? '', /^seenx-0\.10\.0-/);
    assert.doesNotMatch(seenxState.asset?.fileName ?? '', /^bugu-/);
    assert.match(seenxState.downloadUrl ?? '', /\/seenx-0\.10\.0-/);
  } finally {
    if (previousApiUrl === undefined) delete process.env.CONTENT_STUDIO_UPDATE_API_URL;
    else process.env.CONTENT_STUDIO_UPDATE_API_URL = previousApiUrl;
    if (previousManifestUrl === undefined) delete process.env.CONTENT_STUDIO_UPDATE_MANIFEST_URL;
    else process.env.CONTENT_STUDIO_UPDATE_MANIFEST_URL = previousManifestUrl;
    if (previousReleaseApiUrl === undefined) delete process.env.CONTENT_STUDIO_GITHUB_RELEASE_API_URL;
    else process.env.CONTENT_STUDIO_GITHUB_RELEASE_API_URL = previousReleaseApiUrl;
    if (previousBrandId === undefined) delete process.env.CONTENT_STUDIO_BRAND_ID;
    else process.env.CONTENT_STUDIO_BRAND_ID = previousBrandId;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('内容工厂文字主链可以生成提示词包、场景卡、文章和视频脚本', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const promptPacks = new PromptPackService(logs, text);
    const scenes = new SceneLibraryStore(logs, promptPacks, text);
    const articles = new ArticleGenerationService(logs, text);
    const videos = new VideoWorkflowService(logs, text);

    const pack = await promptPacks.generate({
      workspacePath,
      citations: [citation],
      inputSourceIds: ['input-source-brand-001'],
      name: '测试提示词包',
    });
    assert.equal(pack.brandVoice.includes('克制'), true);

    const cards = await scenes.generate({ workspacePath, promptPackId: pack.id, citations: [citation], count: 3 });
    assert.equal(cards.length, 3);
    assert.equal(cards[0].promptPackId, pack.id);
    assert.deepEqual(cards[0].inputSourceIds, ['input-source-brand-001']);

    const article = await articles.generate({
      workspacePath,
      articleType: 'wechat-longform',
      platform: '公众号',
      audience: '真实用户',
      topic: '产品内容工程化',
      tone: '自然可信',
      length: 'medium',
      citations: [citation],
      promptPackId: pack.id,
      sceneCardIds: cards.map((card) => card.id),
      assetRefs: [],
      selectedSkillSlugs: ['article-drafter'],
      params: { textModel: 'fake-text-model' },
    });
    assert.match(article.markdown, /# 把产品讲成人话/);

    const script = await videos.generateScript({
      workspacePath,
      productName: '示例产品',
      sceneBackground: '早餐后办公室场景',
      subtitleMode: 'burned-subtitle',
      voiceStyle: '自然可信',
      ratio: '4:5',
      shotCount: 3,
      durationSeconds: 15,
      promptPackId: pack.id,
      sceneCardIds: cards.map((card) => card.id),
      citations: [citation],
      assetRefs: [],
      selectedSkillSlugs: ['video-script-writer'],
      params: { textModel: 'fake-text-model' },
    });
    assert.equal(script.storyboard.length, 3);

    const storedLogs = await logs.list(workspacePath);
    assert.deepEqual(new Set(storedLogs.map((log) => log.kind)), new Set(['prompt-pack', 'scene-card', 'article', 'video-script']));
    assert.equal(storedLogs.every((log) => log.status === 'succeeded'), true);
  });
});

test('视频脚本支持 AI 质检和单镜头重写并写入本地日志', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const videos = new VideoWorkflowService(logs, text);
    const script = await videos.generateScript({
      workspacePath,
      productName: '植物清洁喷雾',
      sceneBackground: '居家厨房',
      subtitleMode: 'burned-subtitle',
      voiceStyle: '自然可信',
      ratio: '9:16',
      shotCount: 3,
      durationSeconds: 18,
      citations: [citation],
      assetRefs: [],
      selectedSkillSlugs: ['video-script-writer'],
      params: { textModel: 'fake-text-model' },
    });

    const evaluation = await videos.evaluateScript({
      workspacePath,
      sourceScriptLogId: script.logId,
      productName: '植物清洁喷雾',
      productDesc: '商品名称：植物清洁喷雾\n场景背景：居家厨房',
      templateInfo: { hookType: '痛点提问', framework: 'PSP' },
      script,
      citations: [citation],
      params: { textModel: 'fake-text-model' },
    });
    assert.equal(evaluation.scores.totalScore, 6.9);
    assert.equal(evaluation.suggestions.length, 3);

    const rewrite = await videos.rewriteScriptShot({
      workspacePath,
      sourceScriptLogId: script.logId,
      rowIndex: 1,
      productName: '植物清洁喷雾',
      productDesc: '商品名称：植物清洁喷雾\n场景背景：居家厨房',
      templateInfo: { hookType: '痛点提问', framework: 'PSP' },
      script,
      citations: [citation],
      params: { textModel: 'fake-text-model' },
    });
    assert.equal(rewrite.rowIndex, 1);
    assert.match(rewrite.shot.visual, /重写后的真实厨房/);
    assert.equal(rewrite.publishCheck[0].level, 'warning');

    const storedLogs = await logs.list(workspacePath);
    const sourceScriptLog = storedLogs.find((entry) => entry.id === script.logId);
    assert.equal(sourceScriptLog.output.evaluation.logId, evaluation.logId);
    assert.equal(storedLogs.some((entry) => entry.kind === 'video-script-evaluation' && entry.status === 'succeeded'), true);
    assert.equal(storedLogs.some((entry) => entry.kind === 'video-script-shot-rewrite' && entry.status === 'succeeded'), true);
    assert.deepEqual(text.calls.slice(-2).map((call) => JSON.parse(call.prompt).task), ['evaluate_video_script', 'rewrite_video_script_shot']);
  });
});

test('平台草稿包导出只生成本地交付文件并回写文章日志', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const articleLog = await logs.append({
      workspacePath,
      kind: 'article',
      status: 'succeeded',
      title: '真实使用场景长文',
      summary: '测试文章草稿',
      input: { platform: '公众号' },
      output: { markdown: '# 真实使用场景长文' },
    });
    const drafts = new PlatformDraftStore(logs);

    const result = await drafts.exportDraft({
      workspacePath,
      sourceLogId: articleLog.id,
      promptDraftId: 'prompt-draft-article-001',
      platform: '公众号',
      title: '真实使用场景长文',
      topic: '便携营养补充产品如何讲清真实使用场景',
      audience: '关注健康管理但讨厌夸张营销的办公人群',
      tone: '专业、自然、克制',
      markdown: '# 真实使用场景长文\n\n正文内容。',
      publishCheck: [
        { level: 'warning', message: '需要人工确认产品事实引用。' },
        { level: 'risk', message: '避免医疗化承诺。' },
      ],
    });

    assert.equal(existsSync(result.packageDir), true);
    assert.equal(existsSync(result.markdownPath), true);
    assert.equal(existsSync(result.platformCopyPath), true);
    assert.equal(existsSync(result.formatGuidePath), true);
    assert.equal(existsSync(result.metadataPath), true);
    assert.equal(existsSync(result.checklistPath), true);
    assert.equal(existsSync(result.manifestPath), true);
    assert.match(await readFile(result.markdownPath, 'utf-8'), /# 真实使用场景长文/);
    assert.match(await readFile(result.platformCopyPath, 'utf-8'), /发布前补充：封面图、摘要/);
    assert.match(await readFile(result.formatGuidePath, 'utf-8'), /公众号 格式指南/);
    assert.match(await readFile(result.checklistPath, 'utf-8'), /避免医疗化承诺/);
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf-8'));
    assert.equal(manifest.schema, 'buguai.platform-draft.v1');
    assert.equal(manifest.platform, '公众号');
    assert.equal(manifest.sourceLogId, articleLog.id);
    assert.equal(manifest.files.platformCopy, 'platform-copy.txt');
    assert.equal(manifest.files.formatGuide, 'format-guide.md');

    const [storedLog] = await logs.list(workspacePath);
    assert.ok(storedLog.artifactRefs.includes(result.manifestPath));
    assert.ok(storedLog.artifactRefs.includes(result.markdownPath));
    assert.ok(storedLog.artifactRefs.includes(result.platformCopyPath));
    const [record] = await drafts.list(workspacePath);
    assert.equal(record.title, '真实使用场景长文');
    assert.equal(record.platform, '公众号');
    assert.equal(record.sourceLogId, articleLog.id);
    assert.equal(record.promptDraftId, 'prompt-draft-article-001');
    assert.equal(record.platformCopyPath, result.platformCopyPath);
    const copyText = await drafts.readCopyText({ workspacePath, draftId: record.id });
    assert.match(copyText, /标题：真实使用场景长文/);
    assert.match(copyText, /发布前补充：封面图、摘要/);
  });
});

test('对话可以记录首版草稿和多轮调整', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, new FakeAppServerPromptAgentService());

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '便携条包知识库',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
      tags: ['brand-kb'],
    });

    const started = await sessions.start({
      workspacePath,
      title: '便携条包 Prompt 会话',
      purpose: 'image',
      userIntent: '生成小红书真实生活场景图片 Prompt。',
      inputSourceIds: [source.id],
    });

    assert.equal(started.session.promptDraftIds.length, 1);
    assert.equal(started.session.messages.length, 2);
    assert.deepEqual(started.session.executionEvents?.map((event) => event.eventClass), [
      'turn.submitted',
      'model.requested',
      'artifact.changed',
      'model.completed',
      'artifact.changed',
      'snapshot.updated',
    ]);
    assert.deepEqual(started.session.executionEvents?.map((event) => event.sequence), Array.from({ length: 6 }, (_, index) => index + 1));
    const startedSnapshot = started.session.executionEvents?.at(-1);
    assert.equal(startedSnapshot?.eventClass, 'snapshot.updated');
    assert.equal(startedSnapshot?.payload?.sessionStatus, 'draft-created');
    assert.equal(startedSnapshot?.payload?.eventCount, 4);
    assert.equal(startedSnapshot?.payload?.messageCount, 2);
    assert.deepEqual(startedSnapshot?.payload?.draftIds, [started.draft.id]);
    assert.deepEqual(startedSnapshot?.payload?.artifactRefs, ['app-server:prompt-draft:snapshot', `prompt-draft:${started.draft.id}`]);
    assert.deepEqual(startedSnapshot?.payload?.evidenceRefs, []);
    assert.deepEqual(startedSnapshot?.payload?.pendingActionIds, []);
    const startedReadModel = projectAgentRuntimeReadModel(started.session);
    assert.deepEqual(startedReadModel.visibleEvents.map((event) => event.source.eventClass), [
      'artifact.changed',
      'model.completed',
      'artifact.changed',
    ]);
    assert.equal(startedReadModel.visibleEvents.some((event) => event.source.eventClass === 'snapshot.updated'), false);
    assert.equal(started.session.executionEvents?.at(-2)?.owner, 'artifact');
    assert.deepEqual(started.session.executionEvents?.at(-2)?.artifactRefs, [`prompt-draft:${started.draft.id}`]);
    assert.equal(started.session.executionEvents?.some((event) => event.eventClass === 'action.resolved'), false);
    assert.match(started.draft.versions[0].content, /Lime Agent Server Prompt 草稿/);
    assert.match(started.draft.versions[0].content, /Prompt 正文/);

    const continued = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '把平台改成小红书，镜头更自然，不要广告棚拍感。',
    });

    assert.equal(continued.session.messages.length, 4);
    assert.equal(continued.session.executionEvents?.length, 12);
    assert.equal(continued.session.executionEvents?.at(-3)?.eventClass, 'model.completed');
    assert.equal(continued.session.executionEvents?.at(-2)?.kind, 'draft');
    assert.equal(continued.session.executionEvents?.at(-2)?.eventClass, 'artifact.changed');
    const continuedSnapshot = continued.session.executionEvents?.at(-1);
    assert.equal(continuedSnapshot?.eventClass, 'snapshot.updated');
    assert.equal(continuedSnapshot?.sequence, 12);
    assert.equal(continuedSnapshot?.payload?.sessionStatus, 'draft-created');
    assert.equal(continuedSnapshot?.payload?.eventCount, 4);
    assert.equal(continuedSnapshot?.payload?.messageCount, 4);
    assert.deepEqual(continuedSnapshot?.payload?.draftIds, [started.draft.id]);
    assert.deepEqual(continuedSnapshot?.payload?.artifactRefs, ['app-server:prompt-draft:snapshot', `prompt-draft:${started.draft.id}`]);
    assert.deepEqual(continuedSnapshot?.payload?.evidenceRefs, []);
    const continuedReadModel = projectAgentRuntimeReadModel(continued.session);
    assert.equal(continuedReadModel.visibleEvents.some((event) => event.source.eventClass === 'snapshot.updated'), false);
    assert.equal(continued.draft.versions.length, 2);
    assert.match(continued.draft.versions.at(-1).content, /本轮调整/);
  });
});

test('Agent 运行事实会保留 tools、webSearch、MCP 和 skills 分类且不混入助手正文', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const promptAgent = new FakeAppServerPromptAgentService();
    const originalGenerate = promptAgent.generatePromptDraft.bind(promptAgent);
    promptAgent.generatePromptDraft = async (input) => {
      const result = await originalGenerate(input);
      result.providerEvents.splice(1, 0,
        {
          eventClass: 'tool.started',
          kind: 'tool',
          status: 'completed',
          phase: 'tool_running',
          title: '网页搜索开始处理：web_search',
          detail: '搜索内容素材趋势',
          model: result.model,
          payload: {
            runtime: 'lime-agent-server',
            eventType: 'tool.started',
            toolName: 'web_search',
            toolFamily: 'webSearch',
            rawPayload: { toolName: 'web_search', query: '内容素材趋势' },
          },
        },
        {
          eventClass: 'tool.result',
          kind: 'tool',
          status: 'completed',
          phase: 'tool_running',
          title: '网页搜索处理完成：mcp__browser__web_search',
          detail: '返回 3 条网页结果',
          model: result.model,
          payload: {
            runtime: 'lime-agent-server',
            eventType: 'tool.result',
            toolName: 'mcp__browser__web_search',
            toolFamily: 'webSearch',
            mcpServer: 'browser',
            rawPayload: { toolName: 'mcp__browser__web_search' },
          },
        },
        {
          eventClass: 'tool.started',
          kind: 'tool',
          status: 'completed',
          phase: 'tool_running',
          title: 'Skill开始处理：lime_run_service_skill',
          detail: '执行内容能力',
          model: result.model,
          payload: {
            runtime: 'lime-agent-server',
            eventType: 'tool.started',
            toolName: 'lime_run_service_skill',
            toolFamily: 'skill',
            skillSlug: 'copywriting-master',
            rawPayload: { toolName: 'lime_run_service_skill', skillSlug: 'copywriting-master' },
          },
        },
      );
      return result;
    };
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, promptAgent);

    const started = await sessions.start({
      workspacePath,
      title: '工具事实 Prompt 会话',
      purpose: 'image',
      userIntent: '基于真实输入源生成小红书图片 Prompt。',
      inputSourceIds: [],
    });

    const toolEvents = started.session.executionEvents?.filter((event) => event.kind === 'tool') ?? [];
    assert.equal(toolEvents.length, 3);
    assert.equal(toolEvents.some((event) => event.payload?.toolFamily === 'webSearch' && event.payload?.toolName === 'web_search'), true);
    assert.equal(toolEvents.some((event) => (
      event.payload?.toolFamily === 'webSearch' &&
      event.payload?.mcpServer === 'browser' &&
      event.payload?.toolName === 'mcp__browser__web_search'
    )), true);
    assert.equal(toolEvents.some((event) => (
      event.payload?.toolFamily === 'skill' &&
      event.payload?.skillSlug === 'copywriting-master'
    )), true);
    const readModel = projectAgentRuntimeReadModel(started.session);
    assert.equal(readModel.visibleEvents.some((event) => event.surface === 'tool' && event.source.payload?.toolFamily === 'webSearch'), true);
    assert.equal(readModel.visibleEvents.some((event) => event.surface === 'tool' && event.source.payload?.mcpServer === 'browser'), true);
    assert.equal(readModel.visibleEvents.some((event) => event.surface === 'tool' && event.source.payload?.skillSlug === 'copywriting-master'), true);
    const assistantText = started.session.messages
      .filter((message) => message.role === 'assistant')
      .map((message) => message.content)
      .join('\n');
    assert.equal(/网页结果|lime_run_service_skill|mcp__browser__web_search|copywriting-master/.test(assistantText), false);
  });
});

test('Prompt 草稿和 agents 协作会绑定团队知识包版本', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const promptAgent = new FakeAppServerPromptAgentService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, promptAgent);
    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '防晒品牌知识库',
      text: '产品事实：通勤补涂，轻薄肤感。合规：不承诺医学防晒效果。',
      tags: ['brand-kb'],
    });
    const teamKnowledgeRelease = {
      id: 'release-prompt-team-1',
      title: '防晒团队知识包',
      version: 'v1.4',
      contentKnowledgeMapId: 'map-prompt-team-1',
      contentKnowledgeMapTitle: '防晒内容知识地图',
      packageUploadStatus: 'stored',
      packagePublicUrl: 'https://cdn.example.com/agentknowledge/release-prompt-team-1.zip',
    };

    const generated = await promptDrafts.generate({
      workspacePath,
      title: '手动生成 Prompt',
      purpose: 'image',
      userIntent: '生成通勤补涂场景的小红书图片 Prompt。',
      inputSourceIds: [source.id],
      teamKnowledgeRelease,
    });

    assert.equal(generated.teamKnowledgeRelease?.id, 'release-prompt-team-1');
    assert.match(generated.versions[0].content, /团队知识包：/);
    assert.match(generated.versions[0].content, /防晒团队知识包 v1\.4/);
    assert.match(text.calls.at(-1)?.prompt ?? '', /团队知识包：防晒团队知识包 v1\.4/);

    const started = await sessions.start({
      workspacePath,
      title: '协作生成 Prompt',
      purpose: 'image',
      userIntent: '请协作打磨通勤补涂 Prompt。',
      inputSourceIds: [source.id],
      teamKnowledgeRelease,
      textModel: 'gpt-4o-mini',
    });

    assert.equal(promptAgent.draftCalls.length, 1);
    assert.equal(promptAgent.draftCalls[0].teamKnowledgeRelease?.id, 'release-prompt-team-1');
    assert.equal(started.draft.teamKnowledgeRelease?.version, 'v1.4');
    assert.equal(started.session.teamKnowledgeRelease?.id, 'release-prompt-team-1');
    assert.match(started.session.messages[0].content, /团队知识包：/);
    assert.match(started.session.messages[0].content, /防晒团队知识包 v1\.4/);
  });
});

test('团队知识包详情页交接会在主进程生成带版本依据的 Prompt 草稿', async () => {
  await withWorkspace(async (workspacePath) => {
    const now = '2026-05-30T00:00:00.000Z';
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const service = new ContentTeamKnowledgePromptDraftService(mapStore, releaseStore, promptDrafts);

    await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: 'BreezeGo Air 产品资料',
      text: '产品事实：轻量机身、通勤包收纳、风感舒适。禁用：不承诺医疗效果。',
      tags: ['brand-kb'],
    });
    await mapStore.save({
      id: 'map-team-prompt-1',
      workspacePath,
      title: 'BreezeGo Air v1 真实工作台地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-team-prompt-1',
        revision: 'rev-team-prompt-1',
        releaseId: 'release-team-prompt-1',
      },
      sourceInputSourceIds: ['input-team-prompt-1'],
      brandKnowledgeBaseIds: [],
      sceneCardIds: ['scene-team-prompt-1'],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-v1-light',
        title: '轻量机身适合通勤携带',
        summary: '把轻量机身和通勤包收纳组合成可拍摄卖点。',
        tags: ['卖点', '通勤'],
        dimensions: {
          audiences: ['通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['包内携带'],
        },
        sourceRefs: ['input-source:input-team-prompt-1'],
        evidenceRefs: ['evidence-team-prompt-1'],
        materialStatus: 'approved',
        confidence: 92,
        status: 'ready',
      }],
      painPoints: [{
        id: 'pain-v1-bag',
        title: '担心小风扇占包内空间',
        summary: '用户希望不增加通勤负担。',
        tags: ['痛点', '通勤包'],
        dimensions: {
          audiences: ['通勤人群'],
          channels: ['抖音'],
          contentFormats: ['口播'],
          useCases: ['午后通勤'],
        },
        sourceRefs: ['input-source:input-team-prompt-1'],
        evidenceRefs: ['evidence-team-prompt-2'],
        materialStatus: 'missing',
        confidence: 84,
        status: 'ready',
      }],
      scenarios: [{
        id: 'scenario-v1-commute',
        title: '地铁出站后快速降温',
        summary: '从地铁出站到办公室路上的真实使用场景。',
        tags: ['场景', '通勤'],
        dimensions: {
          audiences: ['通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['地铁出站'],
        },
        sourceRefs: ['input-source:input-team-prompt-1'],
        evidenceRefs: ['evidence-team-prompt-3'],
        materialStatus: 'covered',
        confidence: 86,
        status: 'ready',
      }],
      evidence: [
        {
          id: 'evidence-team-prompt-1',
          sourceType: 'input-source',
          sourceId: 'input-team-prompt-1',
          sourceTitle: '产品资料',
          claim: '轻量机身适合通勤携带。',
          excerpt: '轻量机身，放入通勤包不占空间。',
          status: 'ready',
        },
        {
          id: 'evidence-team-prompt-2',
          sourceType: 'user-quote',
          sourceId: 'input-team-prompt-1',
          sourceTitle: '用户反馈',
          claim: '用户担心包内空间。',
          excerpt: '夏天已经带很多东西，不想再塞一个大设备。',
          status: 'ready',
        },
        {
          id: 'evidence-team-prompt-3',
          sourceType: 'scene-card',
          sourceId: 'scene-team-prompt-1',
          sourceTitle: '场景卡',
          claim: '地铁出站后快速降温。',
          excerpt: '地铁出站到办公室路上，短时间需要降温。',
          status: 'ready',
        },
      ],
      constraints: ['不能承诺医疗效果或绝对降温。'],
      gaps: ['缺少真实拍摄素材授权。'],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 0,
        sceneCardCount: 1,
        promptDraftCount: 0,
        evidenceCount: 3,
        gapCount: 1,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });
    await releaseStore.save({
      id: 'local-release-team-prompt-1',
      workspacePath,
      workspaceId: 'workspace-team-prompt-1',
      contentKnowledgeMapId: 'map-team-prompt-1',
      contentKnowledgeMapTitle: 'BreezeGo Air v1 真实工作台地图',
      title: 'BreezeGo Air 团队知识包',
      version: 'v1.4',
      status: 'published',
      packageObjectKey: 'content-workspaces/workspace-team-prompt-1/agentknowledge/release-team-prompt-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-team-prompt-1/agentknowledge/release-team-prompt-1.zip',
      packageUploadStatus: 'stored',
      files: ['KNOWLEDGE.md', 'manifest.json', 'ontology/ontology.json'],
      issues: [],
      baseRevision: 'rev-team-prompt-1',
      serverReleaseId: 'release-team-prompt-1',
      createdAt: now,
      updatedAt: now,
    });

    const draft = await service.create({
      workspacePath,
      contentKnowledgeMapId: 'map-team-prompt-1',
    });

    assert.equal(draft.title, 'BreezeGo Air 团队知识包 v1.4 / Prompt 依据');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.purpose, 'image');
    assert.equal(draft.model, 'local-team-knowledge-package-handoff');
    assert.equal(draft.contentKnowledgeMapId, 'map-team-prompt-1');
    assert.equal(draft.contentKnowledgeMapTitle, 'BreezeGo Air v1 真实工作台地图');
    assert.equal(draft.teamKnowledgeRelease?.id, 'release-team-prompt-1');
    assert.equal(draft.teamKnowledgeRelease?.title, 'BreezeGo Air 团队知识包');
    assert.equal(draft.teamKnowledgeRelease?.version, 'v1.4');
    assert.deepEqual(draft.coverageRowIds, ['selling-v1-light', 'pain-v1-bag', 'scenario-v1-commute']);
    assert.ok(draft.sourceRefs?.includes('content-knowledge-map:map-team-prompt-1'));
    assert.ok(draft.sourceRefs?.includes('content-knowledge-release:release-team-prompt-1'));
    assert.ok(draft.sourceRefs?.includes('input-source:input-team-prompt-1'));
    assert.match(draft.versions[0].content, /团队知识包：BreezeGo Air 团队知识包 v1\.4/);
    assert.match(draft.versions[0].content, /可复用卖点/);
    assert.match(draft.versions[0].content, /禁用边界/);
    assert.match(draft.versions[0].content, /不能把知识包标题、版本号或文件地址当成产品事实/);
    assert.match(draft.versions[0].content, /节奏、语气、情绪、背景音乐、说话速度/);
    assert.doesNotMatch(draft.versions[0].content, new RegExp(workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));

    const [updatedMap] = await mapStore.list(workspacePath);
    assert.ok(updatedMap.promptDraftIds.includes(draft.id));
    assert.equal(updatedMap.coverage.promptDraftCount, 1);

    const listed = await promptDrafts.list(workspacePath);
    assert.equal(listed[0].id, draft.id);
  });
});

test('对话启动会把当前模型作为 Lime Agent Server metadata', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const promptAgent = new FakeAppServerPromptAgentService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, promptAgent);

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '便携条包知识库',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
      tags: ['brand-kb'],
    });

    const started = await sessions.start({
      workspacePath,
      title: '便携条包 Prompt 会话',
      purpose: 'image',
      userIntent: '生成小红书真实生活场景图片 Prompt。',
      inputSourceIds: [source.id],
      textModel: 'gpt-4o-mini',
    });

    assert.equal(promptAgent.draftCalls.length, 1);
    assert.equal(promptAgent.draftCalls[0].textModel, 'gpt-4o-mini');
    assert.equal(started.draft.model, 'gpt-4o-mini');
    assert.equal(started.session.model, 'gpt-4o-mini');
    assert.equal(started.session.textProtocol, undefined);
    assert.equal(started.session.executionEvents?.some((event) => (
      event.eventClass === 'model.completed' &&
      event.payload?.runtime === 'lime-agent-server'
    )), true);

    const continued = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '把平台改成小红书，镜头更自然，不要广告棚拍感。',
    });

    assert.equal(promptAgent.refineCalls.length, 1);
    assert.equal(promptAgent.refineCalls[0].textModel, 'gpt-4o-mini');
    assert.equal(continued.draft.model, 'gpt-4o-mini');
    assert.equal(continued.session.model, 'gpt-4o-mini');

    const switched = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '这一轮换成更快模型，保留同样结构。',
      textModel: 'gpt-4.1-mini',
    });

    assert.equal(promptAgent.refineCalls.length, 2);
    assert.equal(promptAgent.refineCalls[1].textModel, 'gpt-4.1-mini');
    assert.equal(switched.draft.model, 'gpt-4.1-mini');
    assert.equal(switched.session.model, 'gpt-4.1-mini');
  });
});

test('agents 工作台图片输入会先登记为真实输入源再进入对话事实', async () => {
  await withWorkspace(async (workspacePath) => {
    const productPath = join(workspacePath, 'hero-product.png');
    const referenceUrl = 'https://assets.example.test/reference.png';
    await writeFile(productPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
    const additionalProductRefs = Array.from({ length: 9 }, (_, index) => join(workspacePath, `hero-product-${index + 2}.png`));
    const referenceRefs = [
      referenceUrl,
      ...Array.from({ length: 5 }, (_, index) => `https://assets.example.test/reference-${index + 1}.png`),
    ];
    await Promise.all(additionalProductRefs.map((path) => writeFile(path, Buffer.from(ONE_PIXEL_PNG, 'base64'))));

    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, new FakeAppServerPromptAgentService());
    const existingProduct = await inputSources.register({
      workspacePath,
      kind: 'image',
      purpose: 'task-input',
      sensitivity: 'internal',
      title: '已有产品图 / hero-product.png',
      sourcePath: productPath,
      summary: '已登记产品图。',
      tags: ['agents', '产品图'],
    });

    const plan = planAgentAssetInputSourceRegistrations({
      productRefs: [`local-asset://${encodeURI(productPath)}`, ...additionalProductRefs, 'data:image/png;base64,ignored'],
      referenceRefs,
      knownSources: await inputSources.list(workspacePath),
      fileNameFromPath: (value) => value.split('/').filter(Boolean).at(-1) ?? value,
    });

    assert.deepEqual(plan.existingIds, [existingProduct.id]);
    assert.equal(plan.registrations.length, 15);
    assert.equal(plan.registrations.filter((item) => item.input.tags?.includes('产品图')).length, 9);
    assert.equal(plan.registrations.filter((item) => item.input.tags?.includes('参考图')).length, 6);
    assert.equal(plan.registrations.some((item) => item.input.sourceUrl === referenceUrl), true);
    assert.equal(plan.registrations.every((item) => item.input.kind === 'image'), true);
    assert.equal(plan.registrations.every((item) => item.input.purpose === 'task-input'), true);
    assert.equal(plan.registrations.every((item) => item.input.sensitivity === 'internal'), true);
    assert.equal(JSON.stringify(plan).includes('local-asset:'), false);

    const registeredSources = [];
    for (const registration of plan.registrations) {
      registeredSources.push(await inputSources.register({
        workspacePath,
        ...registration.input,
      }));
    }
    const referenceSource = registeredSources.find((source) => source.sourceUrl === referenceUrl);
    assert.ok(referenceSource);
    const started = await sessions.start({
      workspacePath,
      title: 'agents 工作台图片输入源对话',
      purpose: 'image',
      userIntent: '基于产品图和参考图生成真实生活场景图片 Prompt。',
      inputSourceIds: [
        existingProduct.id,
        ...registeredSources.map((source) => source.id),
        `local-asset://${encodeURI(productPath)}`,
      ],
    });

    assert.equal(started.session.inputSourceIds.length, 16);
    assert.equal(started.draft.inputSourceIds.length, 16);
    assert.equal(started.session.sourceSnapshots.length, 16);
    assert.equal(started.session.inputSourceIds.some((id) => id.startsWith('local-asset:')), false);
    assert.equal(started.session.sourceSnapshots.some((source) => source.sourceId === existingProduct.id && source.kind === 'image'), true);
    assert.equal(started.session.sourceSnapshots.some((source) => (
      source.sourceId === referenceSource.id &&
      source.kind === 'image' &&
      source.status === 'blocked' &&
      source.summary.includes('参考图')
    )), true);
    const persistedReferenceSource = (await inputSources.list(workspacePath)).find((source) => source.id === referenceSource.id);
    assert.equal(persistedReferenceSource?.sourceUrl, referenceUrl);
    assert.equal(started.session.messages[0].content.includes('输入源快照：'), true);
    assert.equal(started.session.messages[0].content.includes('图片 / 待补齐'), true);
  });
});

test('AI agents 工作台 Prompt Agent 直连启动时不回退本地 App Server provider store', async () => {
  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-prompt-agent-runtime-'));
    const appServerPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
    const capturePath = join(tempDir, 'capture.json');
    const dataDir = join(tempDir, 'app-server-data');
    try {
      await writeFakeAppServerBinary(appServerPath, [
        {
          type: 'message.delta',
          payload: {
            text: '# App Server Prompt 草稿\n\n可追溯内容生产 Prompt。',
            model: 'gpt-4.1-mini',
          },
        },
        {
          type: 'artifact.snapshot',
          payload: {
            artifactId: 'prompt-agent-artifact',
            artifactRef: 'prompt-agent-artifact',
            title: 'Prompt Agent Draft',
            kind: 'markdown',
            content: '# App Server Prompt 草稿\n\n可追溯内容生产 Prompt。',
            model: 'gpt-4.1-mini',
          },
        },
        {
          type: 'turn.completed',
          payload: {
            summary: 'Prompt Agent 已完成',
            model: 'gpt-4.1-mini',
          },
        },
      ]);

      const modelConfig = {
        async readView() {
          return {
            textProvider: 'http-text-generation',
            textProtocol: 'openai-chat',
            textApiEndpoint: 'https://api.openai.example/v1',
            textModel: 'gpt-4.1-mini',
            textModels: ['gpt-4.1-mini'],
          };
        },
        async getTextApiKey() {
          throw new Error('Prompt Agent 不应读取 Product App 本地 text key');
        },
      };

      await withEnv({
        APP_SERVER_RESOURCES_DIR: undefined,
        CONTENT_STUDIO_RESOURCES_DIR: undefined,
        APP_SERVER_BIN: appServerPath,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        CONTENT_STUDIO_APP_SERVER_DATA_DIR: dataDir,
        FAKE_APP_SERVER_CAPTURE_PATH: capturePath,
        CONTENT_STUDIO_TEXT_API_KEY: 'product-app-text-key',
        OPENAI_API_KEY: 'product-app-openai-key',
        ANTHROPIC_API_KEY: 'product-app-anthropic-key',
        GEMINI_API_KEY: 'product-app-gemini-key',
        GOOGLE_API_KEY: 'product-app-google-key',
        LLM_API_KEY: 'product-app-llm-key',
        CONTENT_STUDIO_PRIVATE_TOKEN: 'product-app-token',
        OPENROUTER_API_KEY: 'product-app-openrouter-key',
        AZURE_OPENAI_API_KEY: 'product-app-azure-openai-key',
        DASHSCOPE_API_KEY: 'product-app-dashscope-key',
        DEEPSEEK_API_KEY: 'product-app-deepseek-key',
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/product-app-google-credentials.json',
        OPENAI_APIKEY: 'product-app-openai-apikey',
        SESSION_COOKIE: 'product-app-session-cookie',
        PROVIDER_SECRET: 'product-app-provider-secret',
        AUTHORIZATION: 'Bearer product-app-authorization',
        COOKIE: 'product-app-cookie',
        LIME_RUNTIME_BRIDGE: JSON.stringify({
          protocol: 'lime.runtimeBridge',
          version: 1,
          endpoint: 'http://127.0.0.1:1',
          token: 'product-app-runtime-bridge-token',
          appId: 'content-studio',
          entryKey: 'workbench',
          expiresAt: '2026-06-09T00:00:00.000Z',
        }),
      }, async () => {
        const promptAgent = new AppServerPromptAgentService(new AppServerSidecarService(), modelConfig);
        await assert.rejects(
          () => promptAgent.generatePromptDraft({
            workspacePath,
            title: 'AI agents 工作台 Prompt',
            purpose: 'image',
            userIntent: '生成小红书真实生活场景图片 Prompt。',
            inputSourceIds: [],
            sceneCardIds: [],
            selectedSources: [],
            skillContext: {
              skillRefs: [],
              selectedSkills: [],
              promptText: '',
              summaryText: '未选择 skill。',
              sdkSkillNames: [],
              additionalDirectories: [],
            },
            textModel: 'gpt-4.1-mini',
          }),
          /必须先连接 lime-desktop-platform 模型设置 projection|必须通过 lime-desktop-platform runtime bridge/,
        );
        assert.equal(existsSync(capturePath), false);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('AI agents runtime service 会阻断不支持 data-dir 的旧 App Server sidecar', async () => {
  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-prompt-agent-runtime-old-sidecar-'));
    const appServerPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
    const dataDir = join(tempDir, 'app-server-data');
    try {
      await writeFakeRuntimeLiveAppServerBinary(appServerPath, { supportsDataDir: false });
      await withEnv({
        APP_SERVER_RESOURCES_DIR: undefined,
        CONTENT_STUDIO_RESOURCES_DIR: undefined,
        APP_SERVER_BIN: appServerPath,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        CONTENT_STUDIO_APP_SERVER_DATA_DIR: dataDir,
      }, async () => {
        const service = new AppServerSidecarService();
        await assert.rejects(() => service.runPromptTurn({
          workspacePath,
          prompt: '验证旧 App Server 不应进入 agents runtime 主链。',
          providerPreference: 'probe-provider',
          modelPreference: 'probe-model',
        }), /requires an app-server binary with --data-dir support/);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('AI agents runtime service 会阻断缺少 provider store 方法的 App Server sidecar', async () => {
  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-prompt-agent-runtime-no-provider-store-'));
    const appServerPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
    const dataDir = join(tempDir, 'app-server-data');
    try {
      await writeFakeRuntimeLiveAppServerBinary(appServerPath, { supportsProviderStore: false });
      await withEnv({
        APP_SERVER_RESOURCES_DIR: undefined,
        CONTENT_STUDIO_RESOURCES_DIR: undefined,
        APP_SERVER_BIN: appServerPath,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        CONTENT_STUDIO_APP_SERVER_DATA_DIR: dataDir,
      }, async () => {
        const service = new AppServerSidecarService();
        await assert.rejects(() => service.runPromptTurn({
          workspacePath,
          prompt: '验证缺少 provider store 的 App Server 不应进入 agents runtime 主链。',
          providerPreference: 'probe-provider',
          modelPreference: 'probe-model',
        }), /runtime provider store is unavailable: method not found: modelProvider\/list/);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('平台宿主下模型设置从 Content Studio 本地迁移到 lime-desktop-platform provider store', async () => {
  await withWorkspace(async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-platform-migration-'));
    const shimUserDataDir = join(tmpdir(), 'content-studio-functional-user-data');
    try {
      await rm(shimUserDataDir, { recursive: true, force: true });
      const savedSettings = [];
      await withPlatformRuntimeBridge(async ({ url, body }) => {
        assert.equal(url, '/capability/invoke');
        if (body.capability === 'lime.modelSettings' && body.operation === 'model-settings/save') {
          savedSettings.push(body.input.settings);
          const settings = body.input.settings;
          return {
            ok: true,
            requestId: 'save-model-settings',
            output: {
              ...settings,
              version: '2',
              updatedAt: '2026-06-09T00:00:00.000Z',
              providers: settings.providers.map((provider) => ({
                ...provider,
                apiKey: undefined,
                apiKeyConfigured: true,
              })),
            },
            event: {},
          };
        }
        if (body.capability === 'lime.modelSettings') {
          return {
            ok: true,
            requestId: 'read-model-settings',
            output: {
              version: '2',
              updatedAt: '2026-06-09T00:00:00.000Z',
              defaultAgentProviderId: 'content-studio-text-openai',
              defaultTextModelId: 'gpt-4.1-mini',
              providers: [
                {
                  id: 'content-studio-text-openai',
                  displayName: 'Content Studio 文字 openai-chat',
                  protocol: 'openai-compatible',
                  capabilityKinds: ['text'],
                  enabled: true,
                  apiKeyConfigured: true,
                  authType: 'api-key',
                  baseUrl: 'https://api.openai.example/v1',
                  useResponsesApi: true,
                  models: ['gpt-4.1-mini'],
                  apiKey: 'sk-platform-read-secret',
                },
              ],
            },
            event: {},
          };
        }
        throw new Error(`unexpected capability ${body.capability}`);
      }, async () => {
        await withEnv({}, async () => {
          const localStore = new ModelConfigStore();
          await localStore.save({
            textApiEndpoint: 'https://api.openai.example/v1',
            textProtocol: 'openai-chat',
            textModel: 'gpt-4.1-mini',
            textModels: ['gpt-4.1-mini'],
            textApiKey: 'sk-content-studio-local',
          });
          assert.equal(savedSettings.length, 0);

          const store = new ModelConfigStore(new PlatformHostBridgeClient());
          const view = await store.readView();
          assert.equal(savedSettings.length, 1);
          assert.equal(savedSettings[0].providers[0].apiKey, 'sk-content-studio-local');
          assert.equal(savedSettings[0].providers[0].id, 'content-studio-text-openai');
          assert.equal(view.platformManaged, true);
          assert.equal(view.source, 'lime-desktop-platform');
          assert.equal(view.agentProviderPreference, 'content-studio-text-openai');
          assert.equal(view.hasTextApiKey, true);
          assert.equal(view.platformModelSettings?.providers[0]?.id, 'content-studio-text-openai');
          assert.equal(view.platformModelSettings?.providers[0]?.apiKey, undefined);
          assert.equal(JSON.stringify(view.platformModelSettings).includes('sk-content-studio-local'), false);
          const persisted = await readFile(join(shimUserDataDir, 'model-config.json'), 'utf8');
          assert.equal(persisted.includes('sk-content-studio-local'), false);
          assert.equal(persisted.includes('textApiKey'), false);
        });
      });
    } finally {
      await rm(shimUserDataDir, { recursive: true, force: true });
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('平台宿主下普通模型保存不会从 Product App 传递模型访问凭据', async () => {
  const shimUserDataDir = join(tmpdir(), 'content-studio-functional-user-data');
  try {
    await rm(shimUserDataDir, { recursive: true, force: true });
    const requests = [];
    await withPlatformRuntimeBridge(async ({ url, body }) => {
      assert.equal(url, '/capability/invoke');
      requests.push(body);
      if (body.capability === 'lime.modelSettings' && body.operation === 'model-settings/read') {
        return {
          ok: true,
          requestId: 'read-model-settings',
          output: {
            version: '3',
            updatedAt: '2026-06-09T00:00:00.000Z',
            defaultAgentProviderId: 'platform-openai',
            defaultTextModelId: 'gpt-4.1-mini',
            providers: [
              {
                id: 'platform-openai',
                displayName: 'Platform OpenAI',
                protocol: 'openai-compatible',
                capabilityKinds: ['text'],
                enabled: true,
                apiKeyConfigured: true,
                authType: 'api-key',
                baseUrl: 'https://api.openai.example/v1',
                models: ['gpt-4.1-mini'],
              },
            ],
          },
          event: {},
        };
      }
      if (body.capability === 'lime.modelSettings' && body.operation === 'model-settings/save') {
        throw new Error('Product App 不应保存平台模型设置。');
      }
      throw new Error(`unexpected capability ${body.capability}:${body.operation}`);
    }, async () => {
      const store = new ModelConfigStore(new PlatformHostBridgeClient());
      const view = await store.save({
        textApiEndpoint: 'https://api.openai.example/v1',
        textProtocol: 'openai-chat',
        textModel: 'gpt-4.1-mini',
        textModels: ['gpt-4.1-mini'],
        textApiKey: 'sk-product-app-should-not-send',
      });
      assert.equal(view.platformManaged, true);
      assert.equal(view.source, 'lime-desktop-platform');
      assert.equal(JSON.stringify(requests).includes('sk-product-app-should-not-send'), false);
      assert.equal(requests.some((request) => request.capability === 'lime.modelSettings' && request.operation === 'model-settings/save'), false);
    });
  } finally {
    await rm(shimUserDataDir, { recursive: true, force: true });
  }
});

test('直接启动 Content Studio 时通过 runtime bridge discovery 读取平台 Provider 设置', async () => {
  const shimUserDataDir = join(tmpdir(), 'content-studio-functional-user-data');
  try {
    await rm(shimUserDataDir, { recursive: true, force: true });
    await withPlatformRuntimeBridgeDiscovery(async ({ url, body }) => {
      assert.equal(url, '/capability/invoke');
      if (body.capability === 'lime.modelSettings') {
        return {
          ok: true,
          requestId: 'discovered-model-settings',
          output: {
            version: '9',
            updatedAt: '2026-06-09T00:00:00.000Z',
            defaultAgentProviderId: 'platform-openai',
            defaultTextModelId: 'gpt-4.1-mini',
            providers: [
              {
                id: 'platform-openai',
                displayName: 'Platform OpenAI',
                protocol: 'openai-compatible',
                capabilityKinds: ['text'],
                enabled: true,
                apiKeyConfigured: true,
                authType: 'api-key',
                baseUrl: 'https://api.openai.example/v1',
                models: ['gpt-4.1-mini', 'gpt-4.1'],
              },
              {
                id: 'platform-gemini-compatible',
                displayName: 'Platform Gemini Compatible',
                protocol: 'openai-compatible',
                capabilityKinds: ['text'],
                enabled: true,
                apiKeyConfigured: true,
                authType: 'api-key',
                baseUrl: 'https://gptproto.example/v1',
                models: ['gemini-2.5-flash'],
              },
            ],
          },
          event: {},
        };
      }
      throw new Error(`unexpected capability ${body.capability}`);
    }, async ({ requests }) => {
      const platformHost = new PlatformHostBridgeClient();
      const store = new ModelConfigStore(platformHost);
      const view = await store.readView();

      assert.equal(view.platformManaged, true);
      assert.equal(view.source, 'lime-desktop-platform');
      assert.equal(view.platformHost?.modelSettingsVersion, '9');
      assert.equal(view.platformHost?.snapshot?.theme, 'system');
      assert.equal(view.platformHost?.snapshot?.workspacePath, 'platform-workspace');
      assert.equal(view.agentProviderPreference, 'platform-openai');
      assert.deepEqual(view.textModels, ['gpt-4.1-mini', 'gpt-4.1', 'gemini-2.5-flash']);
      assert.equal(view.hasTextApiKey, true);
      assert.equal(view.platformModelSettings?.providers[0]?.displayName, 'Platform OpenAI');
      assert.equal(view.platformModelSettings?.providers[0]?.apiKey, undefined);
      assert.equal(platformHost.status().source, 'discovery');
      assert.ok(requests.some((request) => request.url === '/attach' && request.body.appId === 'content-studio'));
      assert.ok(requests.some((request) => request.url === '/capability/invoke' && request.body.capability === 'lime.modelSettings'));
    });
  } finally {
    await rm(shimUserDataDir, { recursive: true, force: true });
  }
});

test('runtime bridge discovery endpoint 变化后 Content Studio 会重新 attach 并重试 capability', async () => {
  const firstServer = createServer((_, response) => {
    response.destroy();
  });
  let firstServerClosed = false;
  await new Promise((resolve, reject) => {
    firstServer.once('error', reject);
    firstServer.listen(0, '127.0.0.1', resolve);
  });
  const firstAddress = firstServer.address();
  assert.ok(firstAddress && typeof firstAddress !== 'string');

  try {
    await withPlatformRuntimeBridgeDiscovery(async ({ url, body }) => {
      assert.equal(url, '/capability/invoke');
      assert.equal(body.capability, 'lime.modelSettings');
      return {
        ok: true,
        requestId: 'reattached-model-settings',
        output: {
          version: '10',
          updatedAt: '2026-06-09T00:00:00.000Z',
          defaultAgentProviderId: 'platform-openai',
          defaultTextModelId: 'gemini-2.5-flash',
          providers: [
            {
              id: 'platform-openai',
              displayName: 'Platform OpenAI',
              protocol: 'openai-compatible',
              capabilityKinds: ['text'],
              enabled: true,
              apiKeyConfigured: true,
              authType: 'api-key',
              baseUrl: 'https://api.openai.example/v1',
              models: ['gemini-2.5-flash'],
            },
          ],
        },
        event: {},
      };
    }, async ({ discovery, requests }) => {
      const staleDescriptor = {
        protocol: 'lime.runtimeBridge',
        version: 1,
        endpoint: `http://127.0.0.1:${firstAddress.port}`,
        token: 'stale-runtime-token',
        appId: 'content-studio',
        entryKey: 'default',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      };
      await new Promise((resolve) => firstServer.close(resolve));
      firstServerClosed = true;
      await withEnv({
        LIME_RUNTIME_BRIDGE: JSON.stringify(staleDescriptor),
        LIME_HOST_SNAPSHOT: undefined,
        LIME_DESKTOP_PLATFORM_BRIDGE_DISCOVERY_PATH: process.env.LIME_DESKTOP_PLATFORM_BRIDGE_DISCOVERY_PATH,
      }, async () => {
        const platformHost = new PlatformHostBridgeClient();
        platformHost.descriptorSource = 'discovery';
        const store = new ModelConfigStore(platformHost);
        const view = await store.readView();

        assert.equal(view.platformManaged, true);
        assert.equal(view.platformHost?.endpoint, discovery.endpoint);
        assert.deepEqual(view.textModels, ['gemini-2.5-flash']);
        assert.ok(requests.some((request) => request.url === '/attach' && request.body.appId === 'content-studio'));
        assert.ok(requests.some((request) => request.url === '/capability/invoke' && request.body.capability === 'lime.modelSettings'));
      });
    });
  } finally {
    if (!firstServerClosed) {
      await new Promise((resolve) => firstServer.close(resolve));
    }
  }
});

test('平台 Provider 有凭据但无显式模型时 Content Studio 不回落本地默认模型', async () => {
  const shimUserDataDir = join(tmpdir(), 'content-studio-functional-user-data');
  try {
    await rm(shimUserDataDir, { recursive: true, force: true });
    await withPlatformRuntimeBridge(async ({ url, body }) => {
      assert.equal(url, '/capability/invoke');
      if (body.capability === 'lime.modelSettings') {
        return {
          ok: true,
          requestId: 'empty-model-settings',
          output: {
            version: 'empty-models',
            updatedAt: '2026-06-09T00:00:00.000Z',
            defaultAgentProviderId: 'platform-openai-empty',
            defaultTextModelId: 'gpt-4o-mini',
            defaultImageModelId: 'gpt-image-2',
            defaultVideoModelId: 'gemini-2.5-flash',
            providers: [
              {
                id: 'platform-openai-empty',
                displayName: 'Platform OpenAI Empty',
                protocol: 'openai-compatible',
                capabilityKinds: ['text', 'image', 'video'],
                enabled: true,
                apiKeyConfigured: true,
                authType: 'api-key',
                baseUrl: 'https://api.openai.example/v1',
                models: [],
                apiKey: 'sk-platform-read-secret',
              },
            ],
          },
          event: {},
        };
      }
      throw new Error(`unexpected capability ${body.capability}`);
    }, async () => {
      const platformHost = new PlatformHostBridgeClient();
      const store = new ModelConfigStore(platformHost);
      const view = await store.readView();
      const catalog = await store.readCatalog();

      assert.equal(view.platformManaged, true);
      assert.equal(view.hasTextApiKey, true);
      assert.equal(view.textModel, '');
      assert.deepEqual(view.textModels, []);
      assert.equal(view.imageOuterModel, '');
      assert.deepEqual(view.imageModels, []);
      assert.equal(view.videoModel, '');
      assert.deepEqual(view.videoModels, []);
      assert.equal(view.platformReadiness?.state, 'needs-setup');
      assert.equal(view.platformReadiness?.reasons[0]?.code, 'platform-text-model-missing');
      assert.equal(view.platformModelSettings?.providers[0]?.apiKey, undefined);
      assert.equal(view.platformModelSettings?.defaultTextModelId, undefined);
      assert.equal(view.platformModelSettings?.defaultImageModelId, undefined);
      assert.equal(view.platformModelSettings?.defaultVideoModelId, undefined);
      assert.deepEqual(catalog.textModels, []);
      assert.deepEqual(catalog.imageModels, []);
      assert.deepEqual(catalog.videoModels, []);
      assert.equal(JSON.stringify(view).includes('gpt-4o-mini'), false);
      assert.equal(JSON.stringify(view).includes('gpt-image-2'), false);
      assert.equal(JSON.stringify(view).includes('gemini-2.5-flash'), false);
      assert.equal(view.textModels.includes('gpt-4o-mini'), false);
      assert.equal(view.imageModels.includes('gpt-image-2'), false);
      assert.equal(view.videoModels.includes('gemini-2.5-flash'), false);
      assert.equal(JSON.stringify(view.platformModelSettings).includes('sk-platform-read-secret'), false);
    });
  } finally {
    await rm(shimUserDataDir, { recursive: true, force: true });
  }
});

test('平台 Provider 无显式文字模型时通用文字生成不会启动 App Server turn', async () => {
  await withWorkspace(async (workspacePath) => {
    let turnStarted = false;
    const modelConfig = {
      async readView() {
        return {
          platformManaged: true,
          agentProviderPreference: 'platform-openai-empty',
          textProtocol: 'openai-chat',
          textApiEndpoint: 'https://api.openai.example/v1',
          hasTextApiKey: true,
          textApiKeyStatus: 'available',
          textModel: '',
          textModels: [],
        };
      },
      async getTextApiKey() {
        throw new Error('平台托管文字生成不应读取 Product App 本地 text key');
      },
    };
    const appServer = {
      async runCapabilityTurn() {
        turnStarted = true;
        throw new Error('不应启动 App Server turn');
      },
    };
    const text = new TextGenerationService(modelConfig, appServer);

    await assert.rejects(
      () => text.generateJson({
        workspacePath,
        model: 'gpt-4o-mini',
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"platform_empty_model"}',
        schema: { type: 'object' },
      }),
      /平台文字模型未配置/,
    );
    assert.equal(turnStarted, false);
  });
});

test('平台 Provider 无显式文字模型时 Prompt Agent 不向平台 lime.agent 发送空模型', async () => {
  await withWorkspace(async (workspacePath) => {
    const requests = [];
    await withPlatformRuntimeBridge(async ({ url, body }) => {
      assert.equal(url, '/capability/invoke');
      requests.push(body);
      if (body.capability === 'lime.modelSettings') {
        return {
          ok: true,
          requestId: 'empty-model-settings',
          output: {
            version: 'empty-agent-models',
            updatedAt: '2026-06-09T00:00:00.000Z',
            defaultAgentProviderId: 'platform-openai-empty',
            providers: [
              {
                id: 'platform-openai-empty',
                displayName: 'Platform OpenAI Empty',
                protocol: 'openai-compatible',
                capabilityKinds: ['text'],
                enabled: true,
                apiKeyConfigured: true,
                authType: 'api-key',
                baseUrl: 'https://api.openai.example/v1',
                models: [],
              },
            ],
          },
          event: {},
        };
      }
      if (body.capability === 'lime.agent') {
        throw new Error('不应在无显式模型时调用 lime.agent');
      }
      throw new Error(`unexpected capability ${body.capability}`);
    }, async () => {
      const platformHost = new PlatformHostBridgeClient();
      const modelConfig = new ModelConfigStore(platformHost);
      const promptAgent = new AppServerPromptAgentService(new AppServerSidecarService(), modelConfig, platformHost);

      await assert.rejects(
        () => promptAgent.generatePromptDraft({
          workspacePath,
          title: '平台空模型 Prompt',
          purpose: 'image',
          userIntent: '生成小红书真实生活场景图片 Prompt。',
          inputSourceIds: [],
          sceneCardIds: [],
          selectedSources: [],
          skillContext: {
            skillRefs: [],
            selectedSkills: [],
            promptText: '',
            summaryText: '未选择 skill。',
            sdkSkillNames: [],
            additionalDirectories: [],
          },
          textModel: 'gpt-4o-mini',
        }),
        /平台文字模型未配置/,
      );
      assert.equal(requests.some((request) => request.capability === 'lime.agent'), false);
    });
  });
});

test('平台设置保存后刷新 runtime bridge Host Snapshot 并接管主题', async () => {
  await withPlatformRuntimeBridge(async ({ url, body, snapshot }) => {
    assert.equal(url, '/capability/invoke');
    assert.equal(body.capability, 'lime.settings');
    assert.equal(body.operation, 'platform-settings/save');
    const nextSettings = {
      version: '2',
      updatedAt: '2026-06-09T00:00:00.000Z',
      locale: body.input.settings.locale,
      theme: body.input.settings.theme,
      appearance: body.input.settings.appearance,
      workspacePath: body.input.settings.workspacePath,
      proxy: body.input.settings.proxy,
      developerMode: body.input.settings.developerMode,
    };
    snapshot.theme = nextSettings.theme;
    snapshot.appearance = nextSettings.appearance;
    snapshot.workspacePath = nextSettings.workspacePath;
    return {
      ok: true,
      requestId: 'save-platform-settings',
      output: nextSettings,
      event: {},
    };
  }, async ({ requests }) => {
    const platformHost = new PlatformHostBridgeClient();
    const saved = await platformHost.savePlatformSettings({
      version: '1',
      updatedAt: '2026-06-09T00:00:00.000Z',
      locale: 'zh-CN',
      theme: 'dark',
      appearance: {
        colorTheme: 'ocean',
        fontScale: 1.1,
        serifEnabled: true,
      },
      workspacePath: 'platform-workspace',
      proxy: {
        enabled: false,
        url: '',
      },
      developerMode: false,
    });

    assert.equal(saved.theme, 'dark');
    assert.equal(saved.appearance.colorTheme, 'ocean');
    assert.equal(platformHost.status().snapshot?.theme, 'dark');
    assert.equal(platformHost.status().snapshot?.appearance?.colorTheme, 'ocean');
    assert.ok(requests.some((request) =>
      request.url === '/capability/invoke' &&
      request.body.capability === 'lime.settings' &&
      request.body.operation === 'platform-settings/save',
    ));
    assert.ok(requests.some((request) => request.url === '/snapshot'));
  });
});

test('平台宿主下 Prompt Agent 优先走 lime-desktop-platform lime.agent bridge', async () => {
  await withWorkspace(async (workspacePath) => {
    const requests = [];
    await withPlatformRuntimeBridge(async ({ url, body }) => {
      assert.equal(url, '/capability/invoke');
      requests.push(body);
      if (body.capability === 'lime.modelSettings') {
        return {
          ok: true,
          requestId: 'model-settings',
          output: {
            version: '7',
            updatedAt: '2026-06-09T00:00:00.000Z',
            defaultAgentProviderId: 'platform-openai',
            defaultTextModelId: 'gpt-4.1-mini',
            providers: [
              {
                id: 'platform-openai',
                displayName: 'Platform OpenAI',
                protocol: 'openai-compatible',
                capabilityKinds: ['text'],
                enabled: true,
                apiKeyConfigured: true,
                authType: 'api-key',
                baseUrl: 'https://api.openai.example/v1',
                useResponsesApi: true,
                models: ['gpt-4.1-mini'],
              },
            ],
          },
          event: {},
        };
      }
      if (body.capability === 'lime.agent') {
        return {
          ok: true,
          requestId: 'agent-turn',
          output: {
            ok: true,
            state: 'started',
            sessionId: 'platform-session',
            threadId: 'platform-thread',
            turnId: 'platform-turn',
            bridge: 'app-server-json-rpc',
            message: 'platform runtime started',
            readiness: { state: 'ready', reasons: [], setupActions: [] },
            runtimeContext: {
              modelProfile: {
                modelId: 'gpt-4.1-mini',
              },
            },
            events: [
              {
                sessionId: 'platform-session',
                threadId: 'platform-thread',
                turnId: 'platform-turn',
                sequence: 1,
                type: 'message.delta',
                payload: {
                  text: '# 平台 Prompt 草稿\n\n来自 lime-desktop-platform Host Kit。',
                  model: 'gpt-4.1-mini',
                },
              },
              {
                sessionId: 'platform-session',
                threadId: 'platform-thread',
                turnId: 'platform-turn',
                sequence: 2,
                type: 'tool.failed',
                payload: {
                  toolName: 'input-source.read',
                  message: '平台工具需要人工补源',
                  evidenceRefs: ['platform-evidence-input'],
                },
              },
              {
                sessionId: 'platform-session',
                threadId: 'platform-thread',
                turnId: 'platform-turn',
                sequence: 3,
                type: 'evidence.changed',
                payload: {
                  evidenceRef: 'platform-evidence-input',
                  evidenceRefs: ['platform-evidence-input'],
                  message: '平台来源证据已更新',
                },
              },
              {
                sessionId: 'platform-session',
                threadId: 'platform-thread',
                turnId: 'platform-turn',
                sequence: 4,
                type: 'action.required',
                payload: {
                  actionId: 'platform-action-add-input-source',
                  actionKind: 'add-input-source',
                  targetModule: 'knowledge-inputs',
                  message: '需要补充输入源',
                  evidenceRefs: ['platform-evidence-input'],
                },
              },
              {
                sessionId: 'platform-session',
                threadId: 'platform-thread',
                turnId: 'platform-turn',
                sequence: 5,
                type: 'artifact.snapshot',
                payload: {
                  artifactId: 'platform-artifact',
                  artifactRef: 'platform-artifact',
                  title: 'Platform Prompt Draft',
                  kind: 'markdown',
                  content: '# 平台 Prompt 草稿\n\n来自 lime-desktop-platform Host Kit。',
                  model: 'gpt-4.1-mini',
                },
              },
            ],
            bridgeProfile: {},
          },
          event: {},
        };
      }
      throw new Error(`unexpected capability ${body.capability}`);
    }, async () => {
      await withEnv({
        APP_SERVER_BIN: undefined,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: undefined,
        CONTENT_STUDIO_TEXT_API_KEY: 'product-app-text-key',
        OPENAI_API_KEY: 'product-app-openai-key',
        GOOGLE_APPLICATION_CREDENTIALS: '/tmp/product-app-google-credentials.json',
        AUTHORIZATION: 'Bearer product-app-authorization',
        COOKIE: 'product-app-cookie',
      }, async () => {
        const platformHost = new PlatformHostBridgeClient();
        const modelConfig = new ModelConfigStore(platformHost);
        const promptAgent = new AppServerPromptAgentService(new AppServerSidecarService(), modelConfig, platformHost);
        const result = await promptAgent.generatePromptDraft({
          workspacePath,
          title: 'AI agents 工作台 Prompt',
          purpose: 'image',
          userIntent: '生成小红书真实生活场景图片 Prompt。',
          inputSourceIds: [],
          sceneCardIds: [],
          selectedSources: [],
          skillContext: {
            skillRefs: [],
            selectedSkills: [],
            promptText: '',
            summaryText: '未选择 skill。',
            sdkSkillNames: [],
            additionalDirectories: [],
          },
        });

        assert.equal(result.model, 'gpt-4.1-mini');
        assert.match(result.content, /平台 Prompt 草稿/);
        assert.equal(result.providerEvents?.some((event) => (
          event.eventClass === 'tool.failed' &&
          event.kind === 'tool' &&
          event.detail === '平台工具需要人工补源' &&
          event.payload?.rawPayload?.evidenceRefs?.includes('platform-evidence-input')
        )), true);
        assert.equal(result.providerEvents?.some((event) => (
          event.eventClass === 'evidence.changed' &&
          event.kind === 'evidence' &&
          event.payload?.rawPayload?.evidenceRef === 'platform-evidence-input'
        )), true);
        assert.equal(result.providerEvents?.some((event) => (
          event.eventClass === 'action.required' &&
          event.kind === 'action' &&
          event.payload?.rawPayload?.actionId === 'platform-action-add-input-source' &&
          event.payload?.rawPayload?.actionKind === 'add-input-source'
        )), true);
        assert.equal(result.providerEvents?.some((event) => (
          event.eventClass === 'artifact.changed' &&
          event.kind === 'draft' &&
          event.payload?.rawPayload?.artifactRef === 'platform-artifact'
        )), true);
        assert.equal(result.providerEvents?.some((event) => (
          event.eventClass === 'model.failed' &&
          event.detail === '平台工具需要人工补源'
        )), false);
        const agentRequest = requests.find((item) => item.capability === 'lime.agent');
        assert.ok(agentRequest);
        assert.equal(agentRequest.input.runtimeOptions.modelId, 'gpt-4.1-mini');
        assert.equal(agentRequest.input.runtimeOptions.modelPreference, 'gpt-4.1-mini');
        assert.equal(agentRequest.input.runtimeOptions.providerPreference, 'platform-openai');
        assert.equal(agentRequest.input.runtimeOptions.permissionMode, 'ask');
        assert.equal(agentRequest.input.metadata.runtimeOwner, 'lime-desktop-platform');
        const serializedAgentRequest = JSON.stringify(agentRequest);
        assert.equal(serializedAgentRequest.includes('sk-platform-read-secret'), false);
        assert.equal(serializedAgentRequest.includes('apiKey'), false);
        assert.equal(serializedAgentRequest.includes('product-app-text-key'), false);
        assert.equal(serializedAgentRequest.includes('product-app-openai-key'), false);
        assert.equal(serializedAgentRequest.includes('product-app-google-credentials'), false);
        assert.equal(serializedAgentRequest.includes('product-app-authorization'), false);
        assert.equal(serializedAgentRequest.includes('product-app-cookie'), false);
        assert.equal(serializedAgentRequest.includes('platform-token-'), false);
        assert.equal(serializedAgentRequest.includes('LIME_RUNTIME_BRIDGE'), false);
      });
    });
  });
});

test('平台托管 Prompt Agent 未连接宿主时不回退 Content Studio 本地 sidecar', async () => {
  await withWorkspace(async (workspacePath) => {
    let sidecarCalled = false;
    const modelConfig = {
      async readView() {
        return {
          platformManaged: true,
          agentProviderPreference: 'platform-openai',
          textProtocol: 'openai-chat',
          textApiEndpoint: 'https://api.openai.example/v1',
          hasTextApiKey: true,
          textApiKeyStatus: 'available',
          textModel: 'gpt-4.1-mini',
          textModels: ['gpt-4.1-mini'],
        };
      },
    };
    const platformHost = {
      async ensureConnected() {
        return false;
      },
    };
    const appServer = {
      async runPromptTurn() {
        sidecarCalled = true;
        throw new Error('不应调用 Product App 本地 App Server sidecar');
      },
    };
    const promptAgent = new AppServerPromptAgentService(appServer, modelConfig, platformHost);

    await assert.rejects(
      () => promptAgent.generatePromptDraft({
        workspacePath,
        title: '平台 bridge 断开 Prompt',
        purpose: 'image',
        userIntent: '生成小红书真实生活场景图片 Prompt。',
        inputSourceIds: [],
        sceneCardIds: [],
        selectedSources: [],
        skillContext: {
          skillRefs: [],
          selectedSkills: [],
          promptText: '',
          summaryText: '未选择 skill。',
          sdkSkillNames: [],
          additionalDirectories: [],
          },
        }),
      /必须通过 lime-desktop-platform runtime bridge|必须先连接 lime-desktop-platform 模型设置 projection/,
    );
    assert.equal(sidecarCalled, false);
  });
});

test('平台宿主下 Prompt Agent 缺少运行事实时不生成成功草稿', async () => {
  await withWorkspace(async (workspacePath) => {
    await withPlatformRuntimeBridge(async ({ url, body }) => {
      assert.equal(url, '/capability/invoke');
      if (body.capability === 'lime.modelSettings') {
        return {
          ok: true,
          requestId: 'model-settings',
          output: {
            version: '7',
            updatedAt: '2026-06-09T00:00:00.000Z',
            defaultAgentProviderId: 'platform-openai',
            defaultTextModelId: 'gpt-4.1-mini',
            providers: [
              {
                id: 'platform-openai',
                displayName: 'Platform OpenAI',
                protocol: 'openai-compatible',
                capabilityKinds: ['text'],
                enabled: true,
                apiKeyConfigured: true,
                authType: 'api-key',
                models: ['gpt-4.1-mini'],
              },
            ],
          },
          event: {},
        };
      }
      if (body.capability === 'lime.agent') {
        return {
          ok: true,
          requestId: 'agent-turn',
          output: {
            ok: true,
            state: 'started',
            message: 'platform runtime started without required facts',
            readiness: { state: 'ready', reasons: [], setupActions: [] },
            runtimeContext: { modelProfile: { modelId: 'gpt-4.1-mini' } },
            events: [],
          },
          event: {},
        };
      }
      throw new Error(`unexpected capability ${body.capability}`);
    }, async () => {
      const platformHost = new PlatformHostBridgeClient();
      const modelConfig = new ModelConfigStore(platformHost);
      const promptAgent = new AppServerPromptAgentService(new AppServerSidecarService(), modelConfig, platformHost);
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
      const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, promptAgent);
      const started = await sessions.start({
        workspacePath,
        title: '平台事实缺失 Prompt',
        purpose: 'image',
        userIntent: '生成小红书真实生活场景图片 Prompt。',
        inputSourceIds: [],
      });

      assert.equal(started.session.status, 'blocked');
      assert.equal(started.draft, undefined);
      assert.equal(started.session.promptDraftIds.length, 0);
      assert.equal(started.session.model, 'blocked:lime-agent-server');
      const runtimeArtifactEvents = started.session.executionEvents?.filter((event) => (
        event.eventClass === 'artifact.changed' &&
        event.owner === 'artifact'
      )) ?? [];
      assert.equal(runtimeArtifactEvents.length, 0);
    });
  });
});

test('平台宿主下 Prompt Agent 只有消息流时不把消息当交付物', async () => {
  await withWorkspace(async (workspacePath) => {
    await withPlatformRuntimeBridge(async ({ url, body }) => {
      assert.equal(url, '/capability/invoke');
      if (body.capability === 'lime.modelSettings') {
        return {
          ok: true,
          requestId: 'model-settings',
          output: {
            version: '7',
            updatedAt: '2026-06-09T00:00:00.000Z',
            defaultAgentProviderId: 'platform-openai',
            defaultTextModelId: 'gpt-4.1-mini',
            providers: [
              {
                id: 'platform-openai',
                displayName: 'Platform OpenAI',
                protocol: 'openai-compatible',
                capabilityKinds: ['text'],
                enabled: true,
                apiKeyConfigured: true,
                authType: 'api-key',
                models: ['gpt-4.1-mini'],
              },
            ],
          },
          event: {},
        };
      }
      if (body.capability === 'lime.agent') {
        return {
          ok: true,
          requestId: 'agent-turn',
          output: {
            ok: true,
            state: 'started',
            sessionId: 'message-only-session',
            threadId: 'message-only-thread',
            turnId: 'message-only-turn',
            message: 'platform runtime streamed message only',
            readiness: { state: 'ready', reasons: [], setupActions: [] },
            runtimeContext: { modelProfile: { modelId: 'gpt-4.1-mini' } },
            events: [
              {
                sessionId: 'message-only-session',
                threadId: 'message-only-thread',
                turnId: 'message-only-turn',
                sequence: 1,
                type: 'message.delta',
                payload: {
                  text: '# 不能作为交付物的普通消息',
                  model: 'gpt-4.1-mini',
                },
              },
            ],
          },
          event: {},
        };
      }
      throw new Error(`unexpected capability ${body.capability}`);
    }, async () => {
      const platformHost = new PlatformHostBridgeClient();
      const modelConfig = new ModelConfigStore(platformHost);
      const promptAgent = new AppServerPromptAgentService(new AppServerSidecarService(), modelConfig, platformHost);
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
      const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, promptAgent);
      const started = await sessions.start({
        workspacePath,
        title: '平台消息流 Prompt',
        purpose: 'image',
        userIntent: '生成小红书真实生活场景图片 Prompt。',
        inputSourceIds: [],
      });

      assert.equal(started.session.status, 'waiting-user');
      assert.equal(started.draft, undefined);
      assert.equal(started.session.promptDraftIds.length, 0);
      assert.equal(started.session.messages.at(-1)?.kind, 'note');
      assert.match(started.session.messages.at(-1)?.content ?? '', /不能作为交付物的普通消息/);
      const runtimeArtifactEvents = started.session.executionEvents?.filter((event) => (
        event.eventClass === 'artifact.changed' &&
        event.owner === 'artifact'
      )) ?? [];
      assert.equal(runtimeArtifactEvents.length, 0);
    });
  });
});

test('平台宿主下通用文字生成走 App Server provider store 且不传 Product App Key', async () => {
  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-platform-text-runtime-'));
    const appServerPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
    const capturePath = join(tempDir, 'capture.json');
    try {
      await writeFakeAppServerBinary(appServerPath, [
        {
          type: 'message.delta',
          payload: { text: '{"ok":true,"source":"provider-store"}', model: 'platform-text-model' },
        },
        {
          type: 'artifact.snapshot',
          payload: {
            artifactId: 'platform-text-json',
            artifactRef: 'platform-text-json',
            title: 'Platform Text JSON',
            kind: 'json',
            content: '{"ok":true,"source":"provider-store"}',
            model: 'platform-text-model',
          },
        },
        {
          type: 'turn.completed',
          payload: { summary: 'done', model: 'platform-text-model' },
        },
      ]);

      const modelConfig = {
        async readView() {
          return {
            platformManaged: true,
            agentProviderPreference: 'platform-openai',
            textProtocol: 'openai-chat',
            textApiEndpoint: 'https://api.openai.example/v1',
            textModel: 'platform-text-model',
            textModels: ['platform-text-model'],
            textApiKeyStatus: 'available',
          };
        },
        async getTextApiKey() {
          throw new Error('平台托管文字生成不应读取 Product App 本地 text key');
        },
      };

      await withEnv({
        APP_SERVER_RESOURCES_DIR: undefined,
        CONTENT_STUDIO_RESOURCES_DIR: undefined,
        APP_SERVER_BIN: appServerPath,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        FAKE_APP_SERVER_CAPTURE_PATH: capturePath,
        CONTENT_STUDIO_TEXT_API_KEY: 'product-app-text-key',
        OPENAI_API_KEY: 'product-app-openai-key',
        LLM_API_KEY: 'product-app-llm-key',
        PROVIDER_SECRET: 'product-app-provider-secret',
        LIME_RUNTIME_BRIDGE: JSON.stringify({
          protocol: 'lime.runtimeBridge',
          version: 1,
          endpoint: 'http://127.0.0.1:1',
          token: 'product-app-runtime-bridge-token',
          appId: 'content-studio',
          entryKey: 'workbench',
          expiresAt: '2026-06-09T00:00:00.000Z',
        }),
      }, async () => {
        const text = new TextGenerationService(modelConfig, new AppServerSidecarService());
        const result = await text.generateJson({
          workspacePath,
          systemPrompt: '只输出 JSON。',
          prompt: '{"task":"platform_text_runtime"}',
          schema: { type: 'object', required: ['ok', 'source'], properties: { ok: { type: 'boolean' }, source: { type: 'string' } } },
        });

        assert.deepEqual(result.value, { ok: true, source: 'provider-store' });
        const captured = JSON.parse(await readFile(capturePath, 'utf8'));
        assert.ok(captured.argv.includes('--backend'));
        assert.equal(captured.argv[captured.argv.indexOf('--backend') + 1], 'runtime');
        assert.equal(captured.argv.includes('--backend-command'), false);
        assert.equal(captured.env.CONTENT_STUDIO_TEXT_API_KEY, '');
        assert.equal(captured.env.OPENAI_API_KEY, '');
        assert.equal(captured.env.LLM_API_KEY, '');
        assert.equal(captured.env.PROVIDER_SECRET, '');
        assert.equal(captured.env.LIME_RUNTIME_BRIDGE, '');
        assert.equal(captured.turnStart.runtimeOptions.capabilityId, 'content.text.generate');
        assert.equal(captured.turnStart.runtimeOptions.providerPreference, 'platform-openai');
        assert.equal(captured.turnStart.runtimeOptions.modelPreference, 'platform-text-model');
        assert.equal(captured.turnStart.runtimeOptions.metadata.textProtocol, 'openai-chat');
        const serializedTurn = JSON.stringify(captured.turnStart);
        assert.equal(serializedTurn.includes('apiKey'), false);
        assert.equal(serializedTurn.includes('product-app-text-key'), false);
        assert.equal(serializedTurn.includes('product-app-openai-key'), false);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('平台宿主下媒体生成走 App Server provider store 且不传 Product App Key', async () => {
  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-platform-media-runtime-'));
    const appServerPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
    const capturePath = join(tempDir, 'capture.json');
    const imageAssetPath = join(workspacePath, 'platform-image.png');
    const videoAssetPath = join(workspacePath, 'platform-video.mp4');
    try {
      await writeFile(imageAssetPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      await writeFile(videoAssetPath, TEST_VIDEO);
      await writeFakeAppServerBinary(appServerPath, {
        'content.image.generate': [
          {
            type: 'message.delta',
            payload: {
              status: 'succeeded',
              message: '平台图片生成完成',
              assetRefs: [imageAssetPath],
              model: 'platform-image-model',
            },
          },
          {
            type: 'turn.completed',
            payload: { status: 'succeeded', summary: '平台图片生成完成', assetRefs: [imageAssetPath] },
          },
        ],
        'content.video.generate': [
          {
            type: 'message.delta',
            payload: {
              status: 'succeeded',
              message: '平台视频生成完成',
              assetRefs: [videoAssetPath],
              billing: { currency: 'CNY', durationSeconds: 8, unit: 'second', unitPrice: 2, estimatedCost: 16, source: 'provider-response' },
              model: 'platform-video-model',
            },
          },
          {
            type: 'turn.completed',
            payload: {
              status: 'succeeded',
              summary: '平台视频生成完成',
              assetRefs: [videoAssetPath],
              billing: { currency: 'CNY', durationSeconds: 8, unit: 'second', unitPrice: 2, estimatedCost: 16, source: 'provider-response' },
            },
          },
        ],
      });

      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            platformManaged: true,
            imageProviderPreference: 'platform-image-provider',
            videoProviderPreference: 'platform-video-provider',
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: 'https://api.image.example/v1',
            imageOuterModel: 'platform-image-model',
            imageApiKeyStatus: 'available',
            imageModels: ['platform-image-model'],
            videoProvider: 'generic-http',
            videoApiEndpoint: 'https://api.video.example/v1',
            videoApiKeyStatus: 'available',
            videoModel: 'platform-video-model',
            videoModels: ['platform-video-model'],
          };
        },
        async getImageApiKey() {
          throw new Error('平台托管图片生成不应读取 Product App 本地 image key');
        },
        async getVideoApiKey() {
          throw new Error('平台托管视频生成不应读取 Product App 本地 video key');
        },
      };

      await withEnv({
        APP_SERVER_RESOURCES_DIR: undefined,
        CONTENT_STUDIO_RESOURCES_DIR: undefined,
        APP_SERVER_BIN: appServerPath,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        FAKE_APP_SERVER_CAPTURE_PATH: capturePath,
        CONTENT_STUDIO_IMAGE_API_KEY: 'product-app-image-key',
        IMAGE_API_KEY: 'product-app-image-env-key',
        CONTENT_STUDIO_VIDEO_API_KEY: 'product-app-video-key',
        VIDEO_API_KEY: 'product-app-video-env-key',
        OPENAI_API_KEY: 'product-app-openai-key',
        PROVIDER_SECRET: 'product-app-provider-secret',
        LIME_RUNTIME_BRIDGE: JSON.stringify({
          protocol: 'lime.runtimeBridge',
          version: 1,
          endpoint: 'http://127.0.0.1:1',
          token: 'product-app-runtime-bridge-token',
          appId: 'content-studio',
          entryKey: 'workbench',
          expiresAt: '2026-06-09T00:00:00.000Z',
        }),
      }, async () => {
        const provider = new MediaProvider(modelConfig, logs, new AppServerSidecarService());
        const image = await provider.generateImage({
          workspacePath,
          productImageRefs: [],
          referenceImageRefs: [],
          prompt: '通过平台 Provider Store 生成图片',
          promptMode: 'preset',
          generationMode: 'smart',
          template: '场景图',
          watermark: false,
          citations: [citation],
          selectedSkillSlugs: ['ecommerce-image-prompt'],
          params: { textModel: 'fake', imageModel: 'platform-image-model', videoModel: 'platform-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
        });
        const video = await provider.generateVideo({
          workspacePath,
          imageAssetRefs: image.assetRefs,
          videoAssetRefs: [],
          prompt: '通过平台 Provider Store 生成视频',
          script: '测试脚本',
          citations: [citation],
          selectedSkillSlugs: ['video-script-writer'],
          params: { videoModel: 'platform-video-model', aspectRatio: '4:5', durationSeconds: 8 },
        });

        assert.equal(image.status, 'succeeded');
        assert.deepEqual(image.assetRefs, [imageAssetPath]);
        assert.equal(video.status, 'succeeded');
        assert.deepEqual(video.assetRefs, [videoAssetPath]);
        const captured = JSON.parse(await readFile(capturePath, 'utf8'));
        assert.equal(captured.env.CONTENT_STUDIO_IMAGE_API_KEY, '');
        assert.equal(captured.env.IMAGE_API_KEY, '');
        assert.equal(captured.env.CONTENT_STUDIO_VIDEO_API_KEY, '');
        assert.equal(captured.env.VIDEO_API_KEY, '');
        assert.equal(captured.env.OPENAI_API_KEY, '');
        assert.equal(captured.env.PROVIDER_SECRET, '');
        assert.equal(captured.env.LIME_RUNTIME_BRIDGE, '');
        assert.deepEqual(
          captured.turnStarts.map((turnStart) => turnStart.runtimeOptions.capabilityId),
          ['content.image.generate', 'content.video.generate'],
        );
        assert.equal(captured.turnStarts[0].runtimeOptions.providerPreference, 'platform-image-provider');
        assert.equal(captured.turnStarts[0].runtimeOptions.modelPreference, 'platform-image-model');
        assert.equal(captured.turnStarts[1].runtimeOptions.providerPreference, 'platform-video-provider');
        assert.equal(captured.turnStarts[1].runtimeOptions.modelPreference, 'platform-video-model');
        const serializedTurns = JSON.stringify(captured.turnStarts);
        assert.equal(serializedTurns.includes('apiKey'), false);
        assert.equal(serializedTurns.includes('product-app-image-key'), false);
        assert.equal(serializedTurns.includes('product-app-video-key'), false);
        assert.equal(serializedTurns.includes('product-app-openai-key'), false);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('平台宿主下未接入 lime.agent 的视觉/视频直连 Provider 不读取 Product App Key', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const referencePath = join(workspacePath, 'platform-reference.png');
    await writeFile(referencePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
    const reference = await inputSources.register({
      workspacePath,
      kind: 'image',
      purpose: 'reference',
      title: '平台参考图',
      sourcePath: referencePath,
      summary: '参考图。',
    });
    const product = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '平台产品资料',
      text: '便携条包。',
    });
    const platformModelConfig = {
      async readView() {
        return {
          platformManaged: true,
          apiEndpoint: 'https://api.openai.example/v1',
          safeStorageAvailable: false,
          hasApiKey: true,
          textProvider: 'http-text-generation',
          textProtocol: 'openai-chat',
          textApiEndpoint: 'https://api.openai.example/v1',
          hasTextApiKey: true,
          textApiKeyStatus: 'available',
          textModel: 'platform-text-model',
          textModels: [],
          imageProvider: 'openai-responses',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: 'https://api.image.example/v1',
          imageOuterModel: 'platform-vision-model',
          hasImageApiKey: true,
          imageApiKeyStatus: 'available',
          imageModels: [],
          videoProvider: 'video-understanding-openai-compatible',
          videoApiEndpoint: 'https://api.video.example/v1',
          hasVideoApiKey: true,
          videoApiKeyStatus: 'available',
          videoModel: 'platform-video-model',
          videoModels: [],
        };
      },
      async getImageApiKey() {
        throw new Error('平台托管素材拆解不应读取 Product App 本地 image key');
      },
      async getVideoApiKey() {
        throw new Error('平台托管视频拆解不应读取 Product App 本地 video key');
      },
    };

    await withEnv({
      CONTENT_STUDIO_VISION_API_KEY: 'product-app-vision-key',
      CONTENT_STUDIO_VIDEO_API_KEY: 'product-app-video-key',
      VIDEO_API_KEY: 'product-app-video-env-key',
      CONTENT_STUDIO_VISION_MODEL: 'vision-provider',
      VISUAL_MODEL: 'gemini-2.5-flash',
      LLM_API_KEY: 'product-app-llm-key',
      OPENAI_API_KEY: 'product-app-openai-key',
    }, async () => {
      const referenceReverse = new ReferenceReverseService(logs, inputSources, promptDrafts, platformModelConfig);
      await assert.rejects(
        () => referenceReverse.generate({
          workspacePath,
          referenceSourceIds: [reference.id],
          productSourceIds: [product.id],
          userIntent: '生成平台托管素材拆解 Prompt。',
        }),
        /暂未接入平台 lime\.agent 视觉理解 runtime/,
      );

      const videos = new VideoWorkflowService(logs, new FakeTextGenerationService(), platformModelConfig);
      await assert.rejects(
        () => videos.analyze({
          workspacePath,
          sourceType: 'url',
          source: 'https://video.example.test/item.mp4',
          promptPackId: 'platform-video-breakdown',
          citations: [citation],
          params: { textModel: 'platform-text-model' },
          dimensions: ['hook'],
        }),
        /真实视频理解模型未配置/,
      );
    });

    const storedLogs = await logs.list(workspacePath);
    const visionLog = storedLogs.find((entry) => entry.error === 'VISION_PLATFORM_AGENT_RUNTIME_REQUIRED');
    const videoLog = storedLogs.find((entry) => entry.error === 'VIDEO_UNDERSTANDING_PROVIDER_NOT_CONFIGURED');
    assert.equal(Boolean(visionLog), true);
    assert.equal(Boolean(videoLog), true);
    assert.equal(visionLog?.model, '');
    assert.equal(videoLog?.model, '');
    assert.notEqual(visionLog?.model, 'vision-provider');
    assert.notEqual(videoLog?.model, 'gemini-2.5-flash');
    assert.notEqual(videoLog?.model, 'platform-text-model');
  });
});

test('对话会话首轮和续写都只记录 Lime Agent Server runtime 事实', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const promptAgent = new FakeAppServerPromptAgentService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, promptAgent);

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '便携条包知识库',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
      tags: ['brand-kb'],
    });

    const started = await sessions.start({
      workspacePath,
      title: '便携条包 Prompt 会话',
      purpose: 'image',
      userIntent: '生成小红书真实生活场景图片 Prompt。',
      inputSourceIds: [source.id],
      textModel: 'gpt-compatible',
    });

    assert.equal(started.draft.textProtocol, undefined);
    assert.equal(started.session.textProtocol, undefined);
    assert.equal(started.draft.model, 'gpt-compatible');
    assert.equal(started.session.model, 'gpt-compatible');
    assert.match(started.draft.versions[0].note, /Lime Agent Server 会话草稿：gpt-compatible/);
    assert.equal(started.session.executionEvents?.some((event) => (
      event.eventClass === 'model.completed' &&
      event.payload?.runtime === 'lime-agent-server' &&
      event.payload?.operation === 'draft'
    )), true);

    const continued = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '把平台改成小红书，镜头更自然，不要广告棚拍感。',
    });

    assert.equal(promptAgent.refineCalls.length, 1);
    assert.equal(promptAgent.refineCalls[0].textModel, 'gpt-compatible');
    assert.equal(continued.draft.model, 'gpt-compatible');
    assert.equal(continued.session.model, 'gpt-compatible');
    assert.equal(continued.session.textProtocol, undefined);
    assert.match(continued.draft.versions.at(-1)?.content ?? '', /本轮调整/);
    assert.match(continued.draft.versions.at(-1)?.note ?? '', /Lime Agent Server 多轮调整：gpt-compatible/);
    assert.equal(continued.session.executionEvents?.some((event) => (
      event.eventClass === 'model.completed' &&
      event.payload?.runtime === 'lime-agent-server' &&
      event.payload?.operation === 'refine'
    )), true);
  });
});

test('对话会话会把 App Server artifact snapshot 收口成本地 Prompt 草稿产物', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const promptAgent = new FakeAppServerPromptAgentService();
    const originalGeneratePromptDraft = promptAgent.generatePromptDraft.bind(promptAgent);
    promptAgent.generatePromptDraft = async (input) => {
      const result = await originalGeneratePromptDraft(input);
      return {
        ...result,
        providerEvents: [
          ...(result.providerEvents ?? []),
          {
            eventClass: 'artifact.changed',
            kind: 'draft',
            status: 'completed',
            phase: 'completed',
            title: 'Lime Agent Server artifact.snapshot',
            detail: '上游 Prompt artifact 快照',
            model: result.model,
            payload: {
              runtime: 'lime-agent-server',
              eventType: 'artifact.snapshot',
              artifactRef: 'app-server:prompt-draft:snapshot',
            },
          },
        ],
      };
    };
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, promptAgent);

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '便携条包知识库',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
      tags: ['brand-kb'],
    });

    const started = await sessions.start({
      workspacePath,
      title: '便携条包 Prompt 会话',
      purpose: 'image',
      userIntent: '生成小红书真实生活场景图片 Prompt。',
      inputSourceIds: [source.id],
      textModel: 'gpt-compatible',
    });

    const artifactEvents = started.session.executionEvents?.filter((event) => event.eventClass === 'artifact.changed') ?? [];
    const upstreamArtifactEvent = artifactEvents.find((event) => event.owner === 'artifact');
    const localDraftEvent = artifactEvents.find((event) => event.owner === 'artifact' && event.payload?.draftId === started.draft.id);
    assert.equal(Boolean(upstreamArtifactEvent), true);
    assert.equal(Boolean(localDraftEvent), true);
    assert.deepEqual(upstreamArtifactEvent?.artifactRefs, ['app-server:prompt-draft:snapshot']);
    assert.deepEqual(localDraftEvent?.artifactRefs, [`prompt-draft:${started.draft.id}`]);

    const readModel = projectAgentRuntimeReadModel(started.session);
    const visibleArtifactEvents = readModel.visibleEvents.filter((event) => event.source.eventClass === 'artifact.changed');
    assert.ok(visibleArtifactEvents.length >= 1);
    assert.equal(readModel.artifactRefs.includes('app-server:prompt-draft:snapshot'), true);
    assert.equal(started.session.executionEvents?.some((event) => (
      event.eventClass === 'artifact.changed' &&
      event.artifactRefs?.includes('app-server:prompt-draft:snapshot')
    )), true);
  });
});

test('Lime Agent Server 不可用时保留 runtime 失败事实并要求配置模型', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const promptAgent = new FakeAppServerPromptAgentService({ failDraftReason: 'sidecar offline' });
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, promptAgent);

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '便携条包知识库',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
      tags: ['brand-kb'],
    });

    const started = await sessions.start({
      workspacePath,
      title: 'Lime Agent Server blocked Prompt 对话',
      purpose: 'image',
      userIntent: '生成小红书真实生活场景图片 Prompt。',
      inputSourceIds: [source.id],
      textModel: 'gpt-compatible',
    });

    const runtimeError = started.session.executionEvents?.find((event) => event.eventClass === 'runtime.error');
    assert.equal(started.session.status, 'blocked');
    assert.equal(started.draft, undefined);
    assert.equal(started.session.model, 'blocked:lime-agent-server');
    assert.equal(runtimeError?.status, 'blocked');
    assert.equal(JSON.stringify(started.session).includes('sidecar offline'), false);
    assert.equal(started.session.executionEvents?.some((event) => event.eventClass === 'action.required'), false);
    assert.equal(started.session.executionEvents?.at(-1)?.eventClass, 'runtime.error');
  });
});

test('对话缺少输入源会写入待处理动作事实', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, new FakeAppServerPromptAgentService());

    const started = await sessions.start({
      workspacePath,
      title: '缺来源 Prompt 对话',
      purpose: 'image',
      userIntent: '先判断需要补哪些产品资料。',
      inputSourceIds: [],
    });

    assert.equal(started.session.executionEvents?.some((event) => event.eventClass === 'action.required'), false);
    assert.equal(started.session.executionEvents?.some((event) => event.eventClass === 'permission.requested'), false);
    const startedSnapshot = started.session.executionEvents?.at(-1);
    assert.equal(startedSnapshot?.eventClass, 'snapshot.updated');
    assert.deepEqual(startedSnapshot?.payload?.pendingActionIds, []);

    await assert.rejects(() => sessions.respondAction({
      workspacePath,
      sessionId: started.session.id,
      actionId: 'action:missing-input-source',
      decision: 'open-input-source',
      payload: { targetModule: 'knowledge-inputs' },
    }), /必须由 Lime App Server runtime 处理/);

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '补充产品资料',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。',
      tags: ['product'],
    });
    await assert.rejects(() => sessions.attachInputSources({
      workspacePath,
      sessionId: started.session.id,
      inputSourceIds: [source.id],
      reason: 'manual-input-source-registered',
    }), /必须重新提交到 Lime App Server runtime/);

    const continued = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '资料已补齐，请基于新资料重新生成图片 Prompt。',
    });
    assert.match(continued.draft.versions.at(-1)?.content ?? '', /资料已补齐/);
    assert.equal(continued.session.sourceSnapshots.some((snapshot) => snapshot.sourceId === source.id), false);
    assert.equal(continued.session.messages.at(-1)?.kind, 'draft');
    assert.equal(continued.session.executionEvents?.some((event) => (
      event.eventClass === 'model.completed' &&
      event.payload?.runtime === 'lime-agent-server'
    )), true);
  });
});

test('浏览器开发桥接不会模拟模型成功并保留可恢复运行快照', async () => {
  const api = createDevBridge();
  const workspacePath = '/tmp/content-studio-browser-dev-functional';
  await assert.rejects(() => api.startAgentPromptSession({
    workspacePath,
    title: '浏览器开发对话事实',
    purpose: 'image',
    userIntent: '先判断需要补哪些产品资料。',
    inputSourceIds: [],
  }), /未接入 Lime App Server runtime/);

  const source = await api.registerInputSource({
    workspacePath,
    kind: 'manual-note',
    purpose: 'product-brief',
    title: '浏览器开发补充资料',
    text: '产品事实：便携条包。场景：早餐后。',
    tags: ['product'],
  });
  await assert.rejects(() => api.respondAgentPromptAction({
    workspacePath,
    sessionId: 'browser-dev-session',
    actionId: 'action:missing-input-source',
    decision: 'open-input-source',
    payload: { targetModule: 'knowledge-inputs' },
  }), /未接入 Lime App Server runtime/);
  await assert.rejects(() => api.attachAgentPromptSessionInputSources({
    workspacePath,
    sessionId: 'browser-dev-session',
    inputSourceIds: [source.id],
    reason: 'manual-input-source-registered',
  }), /未接入 Lime App Server runtime/);
  await assert.rejects(() => api.continueAgentPromptSession({
    workspacePath,
    sessionId: 'browser-dev-session',
    message: '资料已补齐，请继续。',
  }), /未接入 Lime App Server runtime/);
  assert.equal((await api.listAgentPromptSessions(workspacePath)).length, 0);
});

test('Prompt 生成服务不会把成功素材沉淀追溯源作为新输入源', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, new FakeAppServerPromptAgentService());

    const realSource = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '真实产品资料',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。',
      tags: ['product'],
    });
    const traceSource = await inputSources.register({
      workspacePath,
      kind: 'video',
      purpose: 'successful-asset',
      title: '成功素材沉淀 / third-party-finished-video.mp4',
      sourcePath: join(workspacePath, 'third-party-finished-video.mp4'),
      summary: '已通过素材反向沉淀 Prompt。',
      text: '任务：成功素材反向沉淀 Prompt',
      tags: ['successful-asset', 'prompt-distilled', 'video'],
    });

    const generated = await promptDrafts.generate({
      workspacePath,
      title: '追溯源服务层过滤',
      purpose: 'video',
      userIntent: '生成新的 15 秒视频 Prompt。',
      inputSourceIds: [traceSource.id, realSource.id],
    });
    assert.deepEqual(generated.inputSourceIds, [realSource.id]);

    const started = await sessions.start({
      workspacePath,
      title: '追溯源过滤',
      purpose: 'video',
      userIntent: '启动视频 Prompt 对话。',
      inputSourceIds: [traceSource.id, realSource.id],
    });
    assert.deepEqual(started.draft.inputSourceIds, [realSource.id]);
    assert.deepEqual(started.session.inputSourceIds, [realSource.id]);
    assert.equal(started.session.sourceSnapshots.some((source) => source.sourceId === traceSource.id), false);
  });
});

test('成功素材回炉和沉淀 Prompt 会清理旧正文中的内部追溯字段', () => {
  const cleaned = stripInternalTraceLinesFromPrompt([
    '早餐桌自然光，产品主体清晰。',
    'assetKey: generated:old-log:0:/tmp/private-old.png',
    'sourceId：source-secret-1',
    'workflowRunId = workflow-run-secret-1',
    'generation-log:log-secret',
    'input-source:source-secret-1',
    'sourceType: generation-log',
    '保留真实手机实拍和低广告感。',
  ].join('\n'));

  assert.equal(cleaned.includes('早餐桌自然光'), true);
  assert.equal(cleaned.includes('保留真实手机实拍'), true);
  assert.equal(/assetKey|sourceId|workflowRunId|generation-log|input-source|sourceType/i.test(cleaned), false);
});

test('输入源可以从工作区列表移除且不删除原始文件', async () => {
  await withWorkspace(async (workspacePath) => {
    const sourcePath = join(workspacePath, 'reference.png');
    await writeFile(sourcePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
    const inputSources = new InputSourceStore();
    const source = await inputSources.register({
      workspacePath,
      kind: 'image',
      purpose: 'reference',
      title: '待移除参考图',
      sourcePath,
    });

    const removed = await inputSources.remove(workspacePath, source.id);
    assert.equal(removed?.id, source.id);
    assert.equal((await inputSources.list(workspacePath)).some((item) => item.id === source.id), false);
    assert.equal(existsSync(sourcePath), true);
    assert.equal(await inputSources.remove(workspacePath, source.id), null);
  });
});

test('输入源共享范围会进入内容地图并阻止仅本机资料发布到团队', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    const restricted = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'task-input',
      title: '仅本机投放复盘',
      text: '内部投放数据：仅本机使用，禁止共享到团队。',
      tags: ['投放数据', '禁止共享'],
    });
    const feedback = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '客服问题摘要',
      text: '客户问：价格贵不贵？',
      tags: ['客服记录'],
    });
    assert.equal(restricted.sensitivity, 'restricted');
    assert.equal(feedback.sensitivity, 'confidential');

    const now = new Date().toISOString();
    const mapStore = new ContentKnowledgeMapStore();
    await mapStore.save({
      id: 'map-restricted-source',
      workspacePath,
      title: '仅本机资料内容地图',
      status: 'ready',
      syncStatus: 'local-only',
      teamSync: {
        backend: 'bugu',
        status: 'local-only',
        message: '本机草稿。',
      },
      sourceInputSourceIds: [restricted.id],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-restricted',
        title: '仅本机卖点',
        summary: '这条内容来自仅本机资料。',
        tags: ['仅本机'],
        sourceRefs: [`input-source:${restricted.id}`],
        evidenceRefs: [],
        confidence: 0.8,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: [],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 0,
        ipKnowledgeBaseCount: 0,
        skuRowCount: 0,
        competitorObservationCount: 0,
        assetReviewCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 0,
        gapCount: 0,
        readyPercent: 100,
      },
      sourceSensitivity: {
        highest: 'restricted',
        counts: {
          public: 0,
          internal: 0,
          confidential: 0,
          restricted: 1,
        },
        restrictedSourceTitles: [restricted.title],
        confidentialSourceTitles: [],
      },
      model: 'local-test',
      createdAt: now,
      updatedAt: now,
    });

    let adapterCalled = false;
    const sync = new ContentWorkspaceSyncService(
      mapStore,
      new ContentDraftChangeStore(),
      new ContentKnowledgeReleaseStore(),
      new AgentKnowledgeContentExportService(mapStore),
      {
        submitDraftChange: async () => {
          adapterCalled = true;
          throw new Error('仅本机资料不应提交到团队。');
        },
        publishRelease: async () => {
          adapterCalled = true;
          throw new Error('仅本机资料不应发布到团队。');
        },
        listSyncConflicts: async () => [],
        resolveSyncConflict: async () => null,
      },
    );

    const draft = await sync.createDraftChange({ workspacePath });
    assert.equal(draft.status, 'blocked');
    assert.match(draft.issues.join('\n'), /仅本机可用资料/);
    const release = await sync.createKnowledgeRelease({ workspacePath });
    assert.equal(release.status, 'blocked');
    assert.match(release.issues.join('\n'), /仅本机可用资料/);
    assert.equal(adapterCalled, false);
  });
});

test('输入源复用策略区分 Prompt 追溯和内容制造输入', () => {
  const importedSuccessfulAsset = {
    purpose: 'successful-asset',
    tags: ['第三方生成', '成品视频'],
  };
  const distilledTraceSource = {
    purpose: 'successful-asset',
    tags: ['successful-asset', 'prompt-distilled', 'video'],
  };
  const productBrief = {
    purpose: 'product-brief',
    tags: ['product'],
  };

  assert.equal(isReusablePromptInputSource(importedSuccessfulAsset), true);
  assert.equal(isReusablePromptInputSource(distilledTraceSource), false);
});

test('产品资料输入源会结构化为变量表且不编造缺失字段', () => {
  const fullBrief = structureProductBriefSources([
    {
      id: 'product-brief-1',
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '便携条包产品资料',
      tags: ['产品资料'],
      extractedText: [
        '产品名称：便携营养条包',
        '卖点：早餐后、办公室抽屉和通勤包里都能顺手取用',
        '规格：15g * 20 条',
        '适用场景：早餐后、通勤、办公室加班',
        '禁用表达：不得承诺治疗、见效或替代专业建议',
      ].join('\n'),
    },
    {
      id: 'sku-1',
      kind: 'sku-table',
      purpose: 'product-brief',
      title: 'SKU 表',
      tags: ['sku'],
      extractedText: 'SKU,规格,价格\nA01,15g*20条,99\nA02,15g*40条,169',
    },
  ]);

  assert.equal(fullBrief.productName, '便携营养条包');
  assert.deepEqual(fullBrief.sellingPoints, ['早餐后、办公室抽屉和通勤包里都能顺手取用']);
  assert.equal(fullBrief.skuRows.length, 2);
  assert.equal(fullBrief.skuRows[0].SKU, 'A01');
  assert.equal(fullBrief.missingFields.length, 0);
  assert.match(fullBrief.variableTable, /禁用表达：不得承诺治疗/);
  const promptPlan = buildProductBriefPromptPlan(fullBrief);
  assert.deepEqual(promptPlan.map((item) => item.type), ['main-image', 'selling-point-image', 'detail-page-section']);
  assert.ok(promptPlan.every((item) => item.sourceIds.includes('product-brief-1')));
  assert.ok(promptPlan.every((item) => item.skuTrace.includes('A01')));
  assert.ok(promptPlan.every((item) => item.sourceTrace === '已关联 2 份产品资料 / SKU 表'));
  assert.ok(promptPlan.every((item) => item.prompt.includes('追溯资料：已关联 2 份产品资料 / SKU 表')));
  assert.ok(promptPlan.every((item) => !item.prompt.includes('追溯输入源')));
  assert.ok(promptPlan.every((item) => !item.prompt.includes('product-brief-1')));
  assert.ok(promptPlan.every((item) => !item.prompt.includes('sku-1')));
  assert.ok(promptPlan.some((item) => item.prompt.includes('详情页模块')));

  const partialBrief = structureProductBriefSources([
    {
      id: 'product-brief-2',
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '只有一句话的产品资料',
      tags: ['产品资料'],
      extractedText: '卖点：放在包里不占地方',
    },
  ]);
  assert.equal(partialBrief.productName, '');
  assert.deepEqual(partialBrief.missingFields, ['产品名称', '规格 / SKU', '适用场景 / 人群', '禁用表达 / 合规边界']);
  assert.match(partialBrief.variableTable, /产品名称：待补充/);
});

test('用户反馈输入源会聚类痛点和选题方向', () => {
  const insight = clusterUserFeedbackSources([
    {
      id: 'feedback-1',
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '评论和客服问题',
      tags: ['评论', '客服问题'],
      extractedText: [
        '用户：价格有点贵，值不值这个钱？',
        '差评：早上总是忘记吃，坚持不下来。',
        '客服：孩子能不能吃？有没有禁忌？',
        '评论：办公室加班时能不能放抽屉里？',
      ].join('\n'),
    },
  ]);

  assert.deepEqual(insight.sourceIds, ['feedback-1']);
  assert.equal(insight.totalLines, 4);
  assert.ok(insight.clusters.some((cluster) => cluster.key === 'price-trust'));
  assert.ok(insight.clusters.some((cluster) => cluster.key === 'usage-friction'));
  assert.ok(insight.clusters.some((cluster) => cluster.key === 'audience-fit'));
  assert.ok(insight.recommendedTags.includes('价格顾虑'));
  assert.ok(insight.titleDirections.some((item) => item.includes('价格有点贵')));
  assert.ok(insight.objectionResponses.some((item) => item.objection.includes('价格有点贵') && item.boundary.includes('不承诺效果')));
  assert.ok(insight.objectionResponses.some((item) => item.response.includes('人工复核')));
  assert.ok(insight.matrix.some((row) => row.audience.includes('办公和通勤人群') || row.scenario.includes('办公室')));
});

test('v2 provider 验收脚本默认只做 dry-run 配置诊断', async () => {
  const report = await buildProviderCheckReport({
    CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
    CONTENT_STUDIO_TEXT_API_KEY: 'test-text-key',
    CONTENT_STUDIO_TEXT_MODEL: 'gpt-test',
    CONTENT_STUDIO_VISION_ENDPOINT: 'https://vision.example.test/analyze',
    CONTENT_STUDIO_VISION_MODEL: 'test-vision-model',
    CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
    CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
    CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'test-outer-model',
    CONTENT_STUDIO_VIDEO_ENDPOINT: 'https://video.example.test/generate',
    CONTENT_STUDIO_VIDEO_API_KEY: 'test-video-key',
    CONTENT_STUDIO_VIDEO_MODEL: 'test-video-model',
    CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK: '0',
  }, { allowNetwork: false, allowMedia: false });

  assert.equal(report.schema, 'buguai.v2-provider-check.v1');
  assert.equal(report.networkAllowed, false);
  assert.equal(report.mediaAllowed, false);
  assert.equal(report.summary.ready, 4);
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.checks.every((item) => item.status === 'ready'), true);
  assert.equal(report.checks.every((item) => Array.isArray(item.requiredEnv)), true);
  assert.equal(report.checks.every((item) => typeof item.nextAction === 'string'), true);
  assert.ok(report.checks.find((item) => item.name === 'text')?.configured.apiKey);
  assert.equal(report.strictGate.passed, false);
  assert.ok(report.strictGate.reasons.includes('NETWORK_CHECK_NOT_ENABLED'));
  assert.ok(report.strictGate.reasons.includes('MEDIA_CHECK_NOT_ENABLED'));
  assert.ok(report.strictGate.nextActions.some((item) => item.includes('CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1')));
  assert.ok(report.strictGate.nextActions.some((item) => item.includes('CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1')));
  assert.equal(hasProviderStrictFailure(report), true);

  const blocked = await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false });
  assert.equal(blocked.summary.blocked >= 3, true);
  assert.equal(blocked.checks.some((item) => item.name === 'video' && item.status === 'blocked'), true);
  const blockedText = blocked.checks.find((item) => item.name === 'text');
  assert.ok(blockedText.requiredEnv.includes('CONTENT_STUDIO_TEXT_API_KEY or OPENAI_API_KEY'));
  assert.equal(blockedText.configured.apiKey, false);
  assert.equal(blockedText.severity, 'blocking');
  assert.match(blockedText.nextAction, /配置文字模型 Key/);
  assert.ok(blocked.strictGate.reasons.includes('PROVIDER_CHECK_BLOCKED'));
  assert.ok(blocked.strictGate.nextActions.some((item) => item.includes('text: 配置文字模型 Key')));
  assert.equal(hasProviderStrictFailure(blocked), true);

  assert.equal(blocked.strictGate.required.noSkippedChecks, true);
});

test('v2 provider 验收脚本会真实探测图片 provider 返回的图片 payload', async () => {
  let capturedRequest;
  const server = createServer((request, response) => {
    if (request.url === '/v1/responses') {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => {
        capturedRequest = JSON.parse(body);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
      });
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const report = await buildProviderCheckReport({
      CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
      CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
      CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'test-outer-model',
    }, { allowNetwork: true, allowMedia: true });

    const image = report.checks.find((item) => item.name === 'image');
    assert.equal(image?.status, 'succeeded');
    assert.equal(image?.imageCount, 1);
    assert.equal(image?.model, 'test-image-model');
    assert.equal(image?.outerModel, 'test-outer-model');
    assert.deepEqual(report.strictGate.skippedChecks, []);
    assert.equal(report.strictGate.reasons.includes('PROVIDER_CHECK_SKIPPED'), false);
    assert.ok(report.strictGate.reasons.includes('PROVIDER_CHECK_BLOCKED'));
    assert.equal(hasProviderStrictFailure(report), true);
    assert.equal(capturedRequest.model, 'test-outer-model');
    assert.deepEqual(capturedRequest.tools, [{ type: 'image_generation', model: 'test-image-model' }]);
    assert.equal(capturedRequest.stream, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('v2 provider strict 不接受图片 provider 非图片 payload', async () => {
  const fakeImageBase64 = Buffer.from('not an image payload, only plain text. '.repeat(4)).toString('base64');
  const server = createServer((request, response) => {
    if (request.url === '/v1/responses') {
      request.resume();
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: fakeImageBase64 }] }));
      return;
    }
    if (request.url === '/v1beta/models/test-image-model:generateContent') {
      request.resume();
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: fakeImageBase64 } }] } }] }));
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const report = await buildProviderCheckReport({
      CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
      CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
      CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'test-outer-model',
    }, { allowNetwork: true, allowMedia: true });

    const image = report.checks.find((item) => item.name === 'image');
    assert.equal(image?.status, 'failed');
    assert.match(image?.error ?? '', /IMAGE_PROVIDER_NO_IMAGE_RESULT/);
    assert.ok(report.strictGate.failedChecks.includes('image'));
    assert.equal(hasProviderStrictFailure(report), true);

    const geminiReport = await buildProviderCheckReport({
      CONTENT_STUDIO_IMAGE_PROTOCOL: 'gemini-generate-content',
      CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
      CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
    }, { allowNetwork: true, allowMedia: true });
    const geminiImage = geminiReport.checks.find((item) => item.name === 'image');
    assert.equal(geminiImage?.status, 'failed');
    assert.match(geminiImage?.error ?? '', /IMAGE_PROVIDER_NO_IMAGE_RESULT/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('v2 provider strict 在四类 provider 都真实响应后才通过', async () => {
  const requests = [];
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    requests.push({ method: request.method, pathname: url.pathname });
    if (url.pathname === '/v1/chat/completions') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
      return;
    }
    if (url.pathname === '/vision') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        prompt: '真实视觉理解结果',
        composition: '4:5 竖版构图，产品位于右下三分之一。',
        lighting: '自然光。',
        negativePrompt: '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
        risks: ['需要人工复核素材授权、商标和肖像风险。'],
        qualityChecklist: ['主体一致', '来源可追溯', '无竞品可识别元素'],
      }));
      return;
    }
    if (url.pathname === '/v1/responses') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
      return;
    }
    if (url.pathname === '/video') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ jobId: 'video-provider-check-1', status: 'queued' }));
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const report = await buildProviderCheckReport({
      CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
      CONTENT_STUDIO_TEXT_API_KEY: 'test-text-key',
      CONTENT_STUDIO_TEXT_MODEL: 'test-text-model',
      CONTENT_STUDIO_VISION_ENDPOINT: `${baseUrl}/vision`,
      CONTENT_STUDIO_VISION_API_KEY: 'test-vision-key',
      CONTENT_STUDIO_VISION_MODEL: 'test-vision-model',
      CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
      CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
      CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'test-outer-model',
      CONTENT_STUDIO_VIDEO_ENDPOINT: `${baseUrl}/video`,
      CONTENT_STUDIO_VIDEO_API_KEY: 'test-video-key',
      CONTENT_STUDIO_VIDEO_MODEL: 'test-video-model',
    }, { allowNetwork: true, allowMedia: true });

    assert.equal(report.summary.succeeded, 4);
    assert.equal(report.summary.blocked, 0);
    assert.equal(report.summary.failed, 0);
    assert.equal(report.summary.skipped, 0);
    assert.equal(report.strictGate.passed, true);
    assert.deepEqual(report.strictGate.reasons, []);
    assert.equal(hasProviderStrictFailure(report), false);
    assert.deepEqual(requests.map((item) => item.pathname), ['/v1/chat/completions', '/vision', '/v1/responses', '/video']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('v2 provider strict 不接受文字 provider 普通文本响应', async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/v1/chat/completions') {
      response.end(JSON.stringify({ choices: [{ message: { content: 'provider is online' } }] }));
      return;
    }
    if (url.pathname === '/vision') {
      response.end(JSON.stringify({
        prompt: '真实视觉理解结果',
        composition: '4:5 竖版构图，产品位于右下三分之一。',
        lighting: '自然光。',
        negativePrompt: '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
        risks: ['需要人工复核素材授权、商标和肖像风险。'],
        qualityChecklist: ['主体一致', '来源可追溯', '无竞品可识别元素'],
      }));
      return;
    }
    if (url.pathname === '/v1/responses') {
      response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
      return;
    }
    if (url.pathname === '/video') {
      response.end(JSON.stringify({ jobId: 'video-provider-check-1', status: 'queued' }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const report = await buildProviderCheckReport({
      CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
      CONTENT_STUDIO_TEXT_API_KEY: 'test-text-key',
      CONTENT_STUDIO_TEXT_MODEL: 'test-text-model',
      CONTENT_STUDIO_VISION_ENDPOINT: `${baseUrl}/vision`,
      CONTENT_STUDIO_VISION_MODEL: 'test-vision-model',
      CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
      CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
      CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'test-outer-model',
      CONTENT_STUDIO_VIDEO_ENDPOINT: `${baseUrl}/video`,
      CONTENT_STUDIO_VIDEO_API_KEY: 'test-video-key',
      CONTENT_STUDIO_VIDEO_MODEL: 'test-video-model',
    }, { allowNetwork: true, allowMedia: true });

    const text = report.checks.find((item) => item.name === 'text');
    assert.equal(text?.status, 'failed');
    assert.match(text?.error ?? '', /TEXT_PROVIDER_NO_MODEL_OUTPUT/);
    assert.equal(report.summary.succeeded, 3);
    assert.equal(report.summary.failed, 1);
    assert.deepEqual(report.strictGate.failedChecks, ['text']);
    assert.equal(hasProviderStrictFailure(report), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('v2 provider strict 不接受视觉 provider 空结构响应', async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/v1/chat/completions') {
      response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
      return;
    }
    if (url.pathname === '/vision') {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.pathname === '/v1/responses') {
      response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
      return;
    }
    if (url.pathname === '/video') {
      response.end(JSON.stringify({ jobId: 'video-provider-check-1', status: 'queued' }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const report = await buildProviderCheckReport({
      CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
      CONTENT_STUDIO_TEXT_API_KEY: 'test-text-key',
      CONTENT_STUDIO_TEXT_MODEL: 'test-text-model',
      CONTENT_STUDIO_VISION_ENDPOINT: `${baseUrl}/vision`,
      CONTENT_STUDIO_VISION_MODEL: 'test-vision-model',
      CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
      CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
      CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'test-outer-model',
      CONTENT_STUDIO_VIDEO_ENDPOINT: `${baseUrl}/video`,
      CONTENT_STUDIO_VIDEO_API_KEY: 'test-video-key',
      CONTENT_STUDIO_VIDEO_MODEL: 'test-video-model',
    }, { allowNetwork: true, allowMedia: true });

    const vision = report.checks.find((item) => item.name === 'vision');
    assert.equal(vision?.status, 'failed');
    assert.match(vision?.error ?? '', /VISION_PROVIDER_NO_STRUCTURED_ANALYSIS/);
    assert.equal(report.summary.succeeded, 3);
    assert.equal(report.summary.failed, 1);
    assert.equal(report.strictGate.passed, false);
    assert.deepEqual(report.strictGate.failedChecks, ['vision']);
    assert.equal(hasProviderStrictFailure(report), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('v2 provider strict 不接受视觉 provider 缺少风险边界响应', async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/v1/chat/completions') {
      response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
      return;
    }
    if (url.pathname === '/vision') {
      response.end(JSON.stringify({
        prompt: '生成同风格产品图。',
        composition: '4:5 竖版构图，产品位于右下三分之一。',
        lighting: '自然光。',
      }));
      return;
    }
    if (url.pathname === '/v1/responses') {
      response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
      return;
    }
    if (url.pathname === '/video') {
      response.end(JSON.stringify({ jobId: 'video-provider-check-1', status: 'queued' }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const report = await buildProviderCheckReport({
      CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
      CONTENT_STUDIO_TEXT_API_KEY: 'test-text-key',
      CONTENT_STUDIO_TEXT_MODEL: 'test-text-model',
      CONTENT_STUDIO_VISION_ENDPOINT: `${baseUrl}/vision`,
      CONTENT_STUDIO_VISION_MODEL: 'test-vision-model',
      CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
      CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
      CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'test-outer-model',
      CONTENT_STUDIO_VIDEO_ENDPOINT: `${baseUrl}/video`,
      CONTENT_STUDIO_VIDEO_API_KEY: 'test-video-key',
      CONTENT_STUDIO_VIDEO_MODEL: 'test-video-model',
    }, { allowNetwork: true, allowMedia: true });

    const vision = report.checks.find((item) => item.name === 'vision');
    assert.equal(vision?.status, 'failed');
    assert.match(vision?.error ?? '', /VISION_PROVIDER_NO_STRUCTURED_ANALYSIS/);
    assert.equal(vision?.responseEvidence?.prompt, true);
    assert.equal(vision?.responseEvidence?.hasVisualDescription, true);
    assert.equal(vision?.responseEvidence?.hasRiskBoundary, false);
    assert.deepEqual(report.strictGate.failedChecks, ['vision']);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('v2 provider strict 不接受视频 provider 空 JSON 响应', async () => {
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/v1/chat/completions') {
      response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
      return;
    }
    if (url.pathname === '/vision') {
      response.end(JSON.stringify({
        prompt: '真实视觉理解结果',
        composition: '4:5 竖版构图，产品位于右下三分之一。',
        lighting: '自然光。',
        negativePrompt: '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
        risks: ['需要人工复核素材授权、商标和肖像风险。'],
        qualityChecklist: ['主体一致', '来源可追溯', '无竞品可识别元素'],
      }));
      return;
    }
    if (url.pathname === '/v1/responses') {
      response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
      return;
    }
    if (url.pathname === '/video') {
      response.end(JSON.stringify({ ok: true }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const report = await buildProviderCheckReport({
      CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
      CONTENT_STUDIO_TEXT_API_KEY: 'test-text-key',
      CONTENT_STUDIO_TEXT_MODEL: 'test-text-model',
      CONTENT_STUDIO_VISION_ENDPOINT: `${baseUrl}/vision`,
      CONTENT_STUDIO_VISION_MODEL: 'test-vision-model',
      CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
      CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
      CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'test-outer-model',
      CONTENT_STUDIO_VIDEO_ENDPOINT: `${baseUrl}/video`,
      CONTENT_STUDIO_VIDEO_API_KEY: 'test-video-key',
      CONTENT_STUDIO_VIDEO_MODEL: 'test-video-model',
    }, { allowNetwork: true, allowMedia: true });

    const video = report.checks.find((item) => item.name === 'video');
    assert.equal(video?.status, 'failed');
    assert.match(video?.error ?? '', /VIDEO_PROVIDER_NO_JOB_OR_ASSET_RESULT/);
    assert.equal(report.summary.succeeded, 3);
    assert.equal(report.summary.failed, 1);
    assert.equal(report.strictGate.passed, false);
    assert.deepEqual(report.strictGate.failedChecks, ['video']);
    assert.equal(hasProviderStrictFailure(report), true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('v2 provider strict 不接受视频 provider 单独状态、普通 URL 或伪 base64 响应', async () => {
  let videoCallCount = 0;
  const fakeTextBase64 = Buffer.from('G'.repeat(256)).toString('base64');
  const server = createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1');
    response.setHeader('content-type', 'application/json');
    if (url.pathname === '/v1/chat/completions') {
      response.end(JSON.stringify({ choices: [{ message: { content: '{"ok":true}' } }] }));
      return;
    }
    if (url.pathname === '/vision') {
      response.end(JSON.stringify({
        prompt: '真实视觉理解结果',
        composition: '4:5 竖版构图，产品位于右下三分之一。',
        lighting: '自然光。',
        negativePrompt: '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
        risks: ['需要人工复核素材授权、商标和肖像风险。'],
        qualityChecklist: ['主体一致', '来源可追溯', '无竞品可识别元素'],
      }));
      return;
    }
    if (url.pathname === '/v1/responses') {
      response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
      return;
    }
    if (url.pathname === '/video') {
      videoCallCount += 1;
      response.end(JSON.stringify(videoCallCount === 1
        ? { status: 'queued' }
        : { type: 'video_generation', url: 'https://example.test/not-a-video-page', videoBase64: fakeTextBase64 }));
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ error: 'not found' }));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const env = {
      CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
      CONTENT_STUDIO_TEXT_API_KEY: 'test-text-key',
      CONTENT_STUDIO_TEXT_MODEL: 'test-text-model',
      CONTENT_STUDIO_VISION_ENDPOINT: `${baseUrl}/vision`,
      CONTENT_STUDIO_VISION_MODEL: 'test-vision-model',
      CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
      CONTENT_STUDIO_IMAGE_MODEL: 'test-image-model',
      CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'test-outer-model',
      CONTENT_STUDIO_VIDEO_ENDPOINT: `${baseUrl}/video`,
      CONTENT_STUDIO_VIDEO_API_KEY: 'test-video-key',
      CONTENT_STUDIO_VIDEO_MODEL: 'test-video-model',
    };
    const statusOnlyReport = await buildProviderCheckReport(env, { allowNetwork: true, allowMedia: true });
    const statusOnlyVideo = statusOnlyReport.checks.find((item) => item.name === 'video');
    assert.equal(statusOnlyVideo?.status, 'failed');
    assert.match(statusOnlyVideo?.error ?? '', /VIDEO_PROVIDER_NO_JOB_OR_ASSET_RESULT/);

    const fakeBase64Report = await buildProviderCheckReport(env, { allowNetwork: true, allowMedia: true });
    const fakeBase64Video = fakeBase64Report.checks.find((item) => item.name === 'video');
    assert.equal(fakeBase64Video?.status, 'failed');
    assert.match(fakeBase64Video?.error ?? '', /VIDEO_PROVIDER_NO_JOB_OR_ASSET_RESULT/);
    assert.equal(fakeBase64Video?.responseEvidence?.rejectedUrlCount, 1);
    assert.equal(fakeBase64Video?.responseEvidence?.rejectedBase64Count, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('本地总闸包含 v2 provider dry-run 和业务验收入口', async () => {
  const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf-8'));

  assert.equal(packageJson.scripts['verify:v2'], 'npm run verify:v2:providers && npm run verify:v2:acceptance && npm run verify:v2:ux-copy');
  assert.equal(packageJson.scripts['verify:v2:evidence'], 'node scripts/run-v2-acceptance-evidence.mjs');
  assert.equal(packageJson.scripts['verify:v2:ux-copy'], 'node scripts/v2-ux-copy-audit.mjs');
  assert.equal(packageJson.scripts['app-server:runtime:live'], 'node scripts/app-server-runtime-live-check.mjs');
  assert.equal(packageJson.scripts['platform-host:runtime:live'], 'node scripts/platform-host-runtime-live-check.mjs');
  assert.equal(packageJson.scripts['verify:lime-agent'], 'node scripts/lime-agent-boundary-audit.mjs');
  assert.equal(packageJson.scripts['verify:v2:release'], 'node scripts/run-v2-acceptance-evidence.mjs --provider-strict --require-real-workspace-evidence --require-external-mix-evidence --allow-network --allow-media');
  assert.match(packageJson.scripts['verify:local'], /npm run verify:v2/);
  assert.match(packageJson.scripts['verify:local'], /npm run verify:lime-agent/);
});

test('App Server runtime live gate 缺真实 provider store 配置时不会伪通过', async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    'scripts/app-server-runtime-live-check.mjs',
  ], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_OPTIONS: process.env.NODE_OPTIONS,
    },
  }).then(
    (result) => ({ ...result, code: 0 }),
    (error) => ({
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      code: error.code ?? 1,
    }),
  );

  assert.notEqual(stdout, undefined);
  assert.match(stderr, /missing App Server runtime source/);
});

test('App Server runtime live gate 会阻断不支持 data-dir 的旧 sidecar', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-runtime-live-old-sidecar-'));
  const binaryPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
  const dataDir = join(tempDir, 'data');
  try {
    await writeFakeRuntimeLiveAppServerBinary(binaryPath, { supportsDataDir: false });
    const { stderr } = await execFileAsync(process.execPath, [
      'scripts/app-server-runtime-live-check.mjs',
    ], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        APP_SERVER_BIN: binaryPath,
        CONTENT_STUDIO_APP_SERVER_DATA_DIR: dataDir,
        CONTENT_STUDIO_RUNTIME_PROVIDER_PREFERENCE: 'probe-provider',
        CONTENT_STUDIO_RUNTIME_MODEL_PREFERENCE: 'probe-model',
      },
    }).then(
      (result) => ({ ...result, code: 0 }),
      (error) => ({
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        code: error.code ?? 1,
      }),
    );

    assert.match(stderr, /does not support --data-dir/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('App Server runtime live gate 会阻断缺少 provider store 方法的 sidecar', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-runtime-live-no-provider-store-'));
  const binaryPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
  const dataDir = join(tempDir, 'data');
  try {
    await writeFakeRuntimeLiveAppServerBinary(binaryPath, { supportsProviderStore: false });
    const { stderr } = await execFileAsync(process.execPath, [
      'scripts/app-server-runtime-live-check.mjs',
    ], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        APP_SERVER_BIN: binaryPath,
        CONTENT_STUDIO_APP_SERVER_DATA_DIR: dataDir,
        CONTENT_STUDIO_RUNTIME_PROVIDER_PREFERENCE: 'probe-provider',
        CONTENT_STUDIO_RUNTIME_MODEL_PREFERENCE: 'probe-model',
      },
    }).then(
      (result) => ({ ...result, code: 0 }),
      (error) => ({
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        code: error.code ?? 1,
      }),
    );

    assert.match(stderr, /does not expose provider store modelProvider\/list/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('App Server runtime live gate 通过 provider store 预检后仍要求真实 provider 配置', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-runtime-live-provider-missing-'));
  const binaryPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
  const dataDir = join(tempDir, 'data');
  try {
    await writeFakeRuntimeLiveAppServerBinary(binaryPath);
    const { stderr } = await execFileAsync(process.execPath, [
      'scripts/app-server-runtime-live-check.mjs',
    ], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        APP_SERVER_BIN: binaryPath,
        CONTENT_STUDIO_APP_SERVER_DATA_DIR: dataDir,
        CONTENT_STUDIO_RUNTIME_PROVIDER_PREFERENCE: 'probe-provider',
        CONTENT_STUDIO_RUNTIME_MODEL_PREFERENCE: 'probe-model',
      },
    }).then(
      (result) => ({ ...result, code: 0 }),
      (error) => ({
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
        code: error.code ?? 1,
      }),
    );

    assert.match(stderr, /provider is not configured in provider store/);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('平台宿主 runtime live gate 缺真实 bridge 时不会伪通过', async () => {
  const { stdout, stderr } = await execFileAsync(process.execPath, [
    'scripts/platform-host-runtime-live-check.mjs',
  ], {
    cwd: process.cwd(),
    env: {
      PATH: process.env.PATH,
      NODE_OPTIONS: process.env.NODE_OPTIONS,
    },
  }).then(
    (result) => ({ ...result, code: 0 }),
    (error) => ({
      stdout: error.stdout ?? '',
      stderr: error.stderr ?? '',
      code: error.code ?? 1,
    }),
  );

  assert.notEqual(stdout, undefined);
  assert.match(stderr, /missing real platform runtime bridge/);
});

test('平台宿主 runtime live gate 会通过真实 bridge 合同调用 lime.agent', async () => {
  const requests = [];
  await withPlatformRuntimeBridge(async ({ url, body }) => {
    requests.push({ url, body });
    assert.equal(url, '/capability/invoke');
    assert.equal(body.capability, 'lime.agent');
    assert.equal(body.operation, 'agentSession/turn/start');
    assert.equal(body.input.runtimeOptions.providerPreference, 'platform-provider');
    assert.equal(body.input.runtimeOptions.modelPreference, 'platform-model');
    assert.equal(body.input.runtimeOptions.modelId, 'platform-model');
    return {
      ok: true,
      requestId: 'platform-live-check',
      output: {
        ok: true,
        state: 'completed',
        sessionId: 'platform-live-session',
        threadId: 'platform-live-thread',
        turnId: 'platform-live-turn',
        events: [
          {
            sessionId: 'platform-live-session',
            threadId: 'platform-live-thread',
            turnId: 'platform-live-turn',
            sequence: 1,
            type: 'artifact.snapshot',
            payload: {
              artifactId: 'platform-live-artifact',
              title: '平台联调草稿',
              content: '平台宿主联调草稿。',
            },
          },
          {
            sessionId: 'platform-live-session',
            threadId: 'platform-live-thread',
            turnId: 'platform-live-turn',
            sequence: 2,
            type: 'turn.completed',
            payload: { summary: 'done', inputTokens: 12, outputTokens: 8 },
          },
        ],
      },
    };
  }, async () => {
    const descriptor = JSON.parse(process.env.LIME_RUNTIME_BRIDGE);
    const result = await execFileAsync(process.execPath, [
      'scripts/platform-host-runtime-live-check.mjs',
      '--provider',
      'platform-provider',
      '--model',
      'platform-model',
      '--prompt',
      '平台宿主联调',
    ], {
      cwd: process.cwd(),
      env: {
        PATH: process.env.PATH,
        NODE_OPTIONS: process.env.NODE_OPTIONS,
        LIME_RUNTIME_BRIDGE: JSON.stringify(descriptor),
      },
    });
    assert.match(result.stdout, /mode=lime-desktop-platform/);
    assert.match(result.stdout, /provider=platform-provider/);
    assert.match(result.stdout, /model=platform-model/);
    assert.match(result.stdout, /artifact=平台联调草稿/);
  });
  assert.equal(requests.some((request) => request.url === '/capability/invoke'), true);
});

test('v2 UX 文案审计会阻断普通用户可见工程词回退', async () => {
  const report = await buildV2UxCopyAudit();
  assert.equal(report.schema, 'buguai.v2-ux-copy-audit.v1');
  assert.equal(report.summary.passed, true, JSON.stringify(report.checks.flatMap((item) => item.failures), null, 2));
  assert.equal(report.summary.failed, 0);
  assert.ok(report.summary.files >= 8);
  assert.ok(report.summary.rules >= 10);

  const tmpRoot = await mkdtemp(join(tmpdir(), 'content-studio-ux-copy-'));
  try {
    await writeFile(join(tmpRoot, 'bad.md'), '用户主路径：功能概览页面导出 manifest 后查看 blocked 状态。', 'utf-8');
    const failed = await buildV2UxCopyAudit({
      projectRoot: tmpRoot,
      audits: [{
        path: 'bad.md',
        rules: [
          { id: 'mix-manifest-main-task', pattern: /导出\s+manifest/, message: '应使用“混剪清单”。' },
          { id: 'visible-blocked-status', pattern: /\bblocked\b/, message: '应使用“待配置”。' },
          { id: 'flat-feature-overview', pattern: /功能概览/, message: '不能退回功能罗列式 UI。' },
        ],
      }],
    });
    assert.equal(failed.summary.passed, false);
    assert.equal(failed.summary.failed, 3);
    assert.deepEqual(failed.checks[0].failures.map((item) => item.ruleId), ['mix-manifest-main-task', 'visible-blocked-status', 'flat-feature-overview']);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('公开桥接不会暴露平台模型设置保存入口', async () => {
  const files = {
    shared: await readFile(join(process.cwd(), 'src/shared/types.ts'), 'utf-8'),
    preload: await readFile(join(process.cwd(), 'src/preload/index.ts'), 'utf-8'),
    ipc: await readFile(join(process.cwd(), 'src/main/ipc.ts'), 'utf-8'),
    settingsOutlet: await readFile(join(process.cwd(), 'src/renderer/src/components/SettingsDialogOutlet.tsx'), 'utf-8'),
  };

  assert.equal(files.shared.includes('savePlatformModelSettings('), false);
  assert.equal(files.preload.includes('savePlatformModelSettings:'), false);
  assert.equal(files.preload.includes('modelConfig:savePlatformModelSettings'), false);
  assert.equal(files.ipc.includes('modelConfig:savePlatformModelSettings'), false);
  assert.equal(files.settingsOutlet.includes('onSaveModelSettings'), false);
  assert.equal(files.settingsOutlet.includes('window.contentStudio.savePlatformModelSettings'), false);
});

test('Lime Agent 边界审计会阻断 runtime/key/UI 协议回流', async () => {
  const report = await buildLimeAgentBoundaryAudit();
  assert.equal(report.schema, 'buguai.lime-agent-boundary-audit.v1');
  assert.equal(report.summary.passed, true, JSON.stringify(report.failures, null, 2));
  assert.equal(report.summary.failed, 0);
  assert.ok(report.summary.files >= 8);

  const tmpRoot = await mkdtemp(join(tmpdir(), 'content-studio-lime-agent-audit-'));
  try {
    await mkdir(join(tmpRoot, 'src/shared'), { recursive: true });
    await mkdir(join(tmpRoot, 'src/preload'), { recursive: true });
    await mkdir(join(tmpRoot, 'src/main/services'), { recursive: true });
    await mkdir(join(tmpRoot, 'src/main'), { recursive: true });
    await mkdir(join(tmpRoot, 'src/renderer/src/components/agents'), { recursive: true });
    await mkdir(join(tmpRoot, 'src/renderer/src/components/agent'), { recursive: true });
    await mkdir(join(tmpRoot, 'src/renderer/src/components'), { recursive: true });
    const minimalFiles = {
      'package.json': '{"dependencies":{"@limecloud/agent-runtime-client":"0.1.1","@limecloud/agent-runtime-ui":"0.1.0","@limecloud/agent-runtime-projection":"0.1.0"},"scripts":{"verify:lime-agent":"node scripts/lime-agent-boundary-audit.mjs"}}',
      'package-lock.json': '{"packages":{"":{"dependencies":{"@limecloud/agent-runtime-client":"0.1.1"}},"node_modules/@limecloud/agent-runtime-client":{"version":"0.1.1","resolved":"https://registry.npmjs.org/@limecloud/agent-runtime-client/-/agent-runtime-client-0.1.1.tgz","dependencies":{"@limecloud/app-server-client":"1.66.0"}},"node_modules/@limecloud/app-server-client":{"version":"1.66.0","resolved":"https://registry.npmjs.org/@limecloud/app-server-client/-/app-server-client-1.66.0.tgz"}}}',
      'src/shared/types.ts': 'export interface PlatformModelProviderConfig { id: string; displayName: string; apiKey?: string; apiKeyConfigured: boolean; }',
      'src/preload/index.ts': 'export const api = { savePlatformModelSettings() {} };',
      'src/main/ipc.ts': "ipcMain.handle('modelConfig:savePlatformModelSettings', () => undefined);",
      'src/main/services/appServerAgentRuntimeGateway.ts': 'export function runContentStudioAgentRuntimeTurn() { return {}; }',
      'src/main/services/appServerSidecarService.ts': 'export class AppServerSidecarService { runCapabilityTurn() { return {}; } }',
      'src/main/services/appServerPromptAgentService.ts': 'async function run(modelConfig) { await modelConfig.getTextApiKey(); return process.env.CONTENT_STUDIO_TEXT_API_KEY; }',
      'src/main/services/agentPromptSessionStore.ts': "const event = { owner: 'ui', eventClass: 'snapshot.updated' };",
      'src/main/services/modelConfigStore.ts': 'export class ModelConfigStore {}',
      'src/renderer/src/components/agents/AgentsWorkbench.tsx': 'export function AgentsWorkbench() { return "后端接口"; }',
      'src/renderer/src/components/agent/AgentSessionPanel.tsx': "import { AgentRuntimeRefLists } from './AgentRuntimeRefLists'; export function AgentSessionPanel() { return 'bad'; }",
      'src/renderer/src/components/agent/AgentUiProjectionSurface.tsx': "export function AgentUiProjectionSurface() { return 'missing-standard-surface'; }",
      'src/renderer/src/components/agent/agentRuntimeProjection.ts': 'export function projectAgentRuntimeReadModel() { return {}; }',
      'src/renderer/src/components/SettingsDialogOutlet.tsx': 'window.contentStudio.savePlatformModelSettings({});',
    };
    await Promise.all(Object.entries(minimalFiles).map(([path, content]) => writeFile(join(tmpRoot, path), content, 'utf-8')));

    const failed = await buildLimeAgentBoundaryAudit({ projectRoot: tmpRoot });
    assert.equal(failed.summary.passed, false);
    assert.ok(failed.failures.some((item) => item.ruleId === 'no-public-platform-model-save'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'platform-provider-projection-no-api-key'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'prompt-agent-no-product-app-key'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agent-runtime-client-standard-session-gateway-import'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agent-runtime-client-standard-session-gateway-factory'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agent-runtime-session-gateway-contract'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agent-runtime-gateway-start-turn-method'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agent-runtime-gateway-event-notification-method'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agent-runtime-gateway-internal-runtime-event-helper'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'sidecar-uses-agent-runtime-session-gateway'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'sidecar-constructs-agent-runtime-session-gateway'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agents-no-old-visible-copy'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agents-uses-agentui-projection-surface'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agent-session-panel-uses-agentui-projection-surface'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'agentui-projection-surface-contract'));
    assert.ok(failed.failures.some((item) => item.ruleId === 'no-page-local-agentui-composition'));
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('v2 验收 CLI 可以把 provider 和业务报告写入文件', async () => {
  await withWorkspace(async (workspacePath) => {
    const providerReportPath = join(workspacePath, 'reports', 'provider.json');
    const acceptanceReportPath = join(workspacePath, 'reports', 'acceptance.json');

    await execFileAsync(process.execPath, [
      'scripts/v2-provider-check.mjs',
      '--output',
      providerReportPath,
    ], { cwd: process.cwd() });
    await execFileAsync(process.execPath, [
      'scripts/run-v2-business-acceptance.mjs',
      '--output',
      acceptanceReportPath,
    ], { cwd: process.cwd() });

    const providerReport = JSON.parse(await readFile(providerReportPath, 'utf-8'));
    const acceptanceReport = JSON.parse(await readFile(acceptanceReportPath, 'utf-8'));
    assert.equal(providerReport.schema, 'buguai.v2-provider-check.v1');
    assert.equal(providerReport.summary.blocked >= 3, true);
    assert.ok(providerReport.strictGate.nextActions.length >= 1);
    assert.ok(providerReport.checks.every((item) => Array.isArray(item.requiredEnv)));
    assert.equal(acceptanceReport.schema, 'buguai.v2-business-acceptance.v1');
    assert.equal(acceptanceReport.summary.failed, 0);
    assert.equal(acceptanceReport.sections.provider.summary.blocked >= 3, true);
  });
});

test('v2 验收证据 CLI 默认生成成套目录且无 Key 不失败', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence');

    await execFileAsync(process.execPath, [
      'scripts/run-v2-acceptance-evidence.mjs',
      '--output-dir',
      evidenceDir,
    ], { cwd: process.cwd() });

    const manifestPath = join(evidenceDir, 'manifest.json');
    const providerPath = join(evidenceDir, 'provider-check.json');
    const businessPath = join(evidenceDir, 'business-acceptance.json');
    const summaryPath = join(evidenceDir, 'SUMMARY.md');
    const missingEvidencePath = join(evidenceDir, 'MISSING_EVIDENCE.md');
    assert.equal(existsSync(manifestPath), true);
    assert.equal(existsSync(providerPath), true);
    assert.equal(existsSync(businessPath), true);
    assert.equal(existsSync(summaryPath), true);
    assert.equal(existsSync(missingEvidencePath), true);

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const providerReport = JSON.parse(await readFile(providerPath, 'utf-8'));
    const businessReport = JSON.parse(await readFile(businessPath, 'utf-8'));
    const summary = await readFile(summaryPath, 'utf-8');
    const missingEvidence = await readFile(missingEvidencePath, 'utf-8');

    assert.equal(manifest.schema, 'buguai.v2-acceptance-evidence.v1');
    assert.equal(manifest.files.missingEvidence, 'MISSING_EVIDENCE.md');
    assert.equal(manifest.providerStrictRequired, false);
    assert.equal(manifest.providerStrictPassed, false);
    assert.equal(manifest.businessAcceptancePassed, true);
    assert.equal(manifest.exitCode, 0);
    assert.equal(providerReport.schema, 'buguai.v2-provider-check.v1');
    assert.equal(providerReport.summary.blocked >= 3, true);
    assert.equal(businessReport.schema, 'buguai.v2-business-acceptance.v1');
    assert.equal(businessReport.summary.failed, 0);
    assert.match(summary, /Provider 报告/);
    assert.match(summary, /业务验收报告/);
    assert.match(summary, /缺口清单/);
    assert.match(summary, /Strict 恢复动作/);
    assert.match(summary, /CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1/);
    assert.match(missingEvidence, /v2 缺口补齐清单/);
    assert.match(missingEvidence, /Provider 待补/);
  });
});

test('v2 验收证据 CLI strict 失败时仍保留证据目录', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence-strict');
    let failed = false;

    try {
      await execFileAsync(process.execPath, [
        'scripts/run-v2-acceptance-evidence.mjs',
        '--provider-strict',
        '--output-dir',
        evidenceDir,
      ], { cwd: process.cwd() });
    } catch (error) {
      failed = true;
      assert.equal(error.code, 1);
    }

    assert.equal(failed, true);
    assert.equal(existsSync(join(evidenceDir, 'provider-check.json')), true);
    assert.equal(existsSync(join(evidenceDir, 'business-acceptance.json')), true);
    assert.equal(existsSync(join(evidenceDir, 'manifest.json')), true);
    assert.equal(existsSync(join(evidenceDir, 'SUMMARY.md')), true);
    assert.equal(existsSync(join(evidenceDir, 'MISSING_EVIDENCE.md')), true);

    const manifest = JSON.parse(await readFile(join(evidenceDir, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.providerStrictRequired, true);
    assert.equal(manifest.providerStrictPassed, false);
    assert.equal(manifest.businessAcceptancePassed, true);
    assert.equal(manifest.exitCode, 1);
    assert.match(manifest.commands.provider, /CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1/);
    assert.match(manifest.commands.provider, /CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1/);
    assert.match(manifest.commands.provider, /verify:v2:providers:strict/);
    assert.match(manifest.commands.evidence, /--provider-strict/);
    assert.match(manifest.commands.evidence, /--allow-network/);
    assert.match(manifest.commands.evidence, /--allow-media/);
    assert.ok(manifest.nextActions.some((item) => item.includes('CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1')));
  });
});

test('v2 验收证据 CLI 真实工作区门槛会阻断本地样例', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence-real-workspace');
    let failed = false;

    try {
      await execFileAsync(process.execPath, [
        'scripts/run-v2-acceptance-evidence.mjs',
        '--require-real-workspace-evidence',
        '--output-dir',
        evidenceDir,
      ], { cwd: process.cwd() });
    } catch (error) {
      failed = true;
      assert.equal(error.code, 1);
    }

    assert.equal(failed, true);
    const manifest = JSON.parse(await readFile(join(evidenceDir, 'manifest.json'), 'utf-8'));
    const businessReport = JSON.parse(await readFile(join(evidenceDir, 'business-acceptance.json'), 'utf-8'));
    const summary = await readFile(join(evidenceDir, 'SUMMARY.md'), 'utf-8');
    const missingEvidence = await readFile(join(evidenceDir, 'MISSING_EVIDENCE.md'), 'utf-8');
    const realWorkspaceCheck = businessReport.sections.realEvidence.checks.find((check) => check.id === 'real-workspace-evidence');

    assert.equal(manifest.requireRealWorkspaceEvidence, true);
    assert.equal(manifest.requireExternalMixEvidence, true);
    assert.equal(manifest.businessAcceptancePassed, false);
    assert.equal(manifest.exitCode, 1);
    assert.ok(manifest.businessFailures.some((check) => check.id === 'real-workspace-evidence'));
    assert.ok(manifest.businessFailures.some((check) => check.id === 'mix-package-external-import'));
    assert.ok(manifest.businessNextActions.some((item) => item.includes('--workspace')));
    const manifestRealWorkspaceFailure = manifest.businessFailures.find((check) => check.id === 'real-workspace-evidence');
    assert.ok(manifestRealWorkspaceFailure.missing.some((item) => item.includes('样例/占位污染')));
    assert.match(manifest.commands.business, /verify:v2:acceptance --/);
    assert.match(manifest.commands.business, /--require-external-mix-evidence/);
    assert.match(manifest.commands.business, /--require-real-workspace-evidence/);
    assert.match(manifest.commands.evidence, /--require-external-mix-evidence/);
    assert.match(manifest.commands.evidence, /--require-real-workspace-evidence/);
    assert.match(summary, /真实混剪导入证据要求：是/);
    assert.match(summary, /真实工作区闭环要求：是/);
    assert.match(summary, /业务失败项/);
    assert.match(summary, /必须使用 --workspace 从真实工作区读取产物/);
    assert.match(summary, /真实混剪工具导入证据/);
    assert.match(missingEvidence, /v2 缺口补齐清单/);
    assert.match(missingEvidence, /真实工作区验收门槛/);
    assert.match(missingEvidence, /真实混剪工具导入证据/);
    assert.match(missingEvidence, /- \[ \] 必须使用 --workspace 从真实工作区读取产物/);
    assert.match(missingEvidence, /样例\/占位污染/);
    assert.match(missingEvidence, /sample-product-brief/);
    assert.equal(realWorkspaceCheck.status, 'fail');
    assert.ok(realWorkspaceCheck.missing.includes('必须使用 --workspace 从真实工作区读取产物'));
  });
});

test('v2 验收证据 CLI 会展开缺失混剪素材路径', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence-missing-packaged-files');
    const mixDir = join(workspacePath, 'mix-package');
    const platformDir = join(workspacePath, 'platform-draft');
    const importEvidencePath = join(mixDir, 'capcut-import-evidence.md');
    const inputPath = join(workspacePath, 'business-input.json');
    await mkdir(mixDir, { recursive: true });
    await mkdir(platformDir, { recursive: true });
    await writeFile(importEvidencePath, '# 剪映导入验收\n\n已导入 videos/ 和 overlays/，manifest.csv 已核对。', 'utf-8');
    const input = JSON.parse(await readFile(join(process.cwd(), 'docs/roadmap/v2/business-acceptance-input.example.json'), 'utf-8'));
    input.workspacePath = workspacePath;
    input.videoPackage = {
      ...input.videoPackage,
      packageDir: mixDir,
      declaredPackagedFilePaths: ['videos/missing-video.mp4', 'overlays/missing-title.png'],
      actualPackagedFilePaths: ['videos/missing-video.mp4', 'overlays/missing-title.png'],
      externalImportEvidence: {
        toolName: '剪映专业版',
        importedAt: '2026-05-22T16:30:00+08:00',
        operator: '剪辑验收',
        importedAssetKinds: ['video', 'overlay'],
        importedFileCount: 2,
        manifestImported: true,
        timelineCreated: true,
        result: 'verified',
        evidenceFiles: [importEvidencePath],
      },
    };
    input.platformDraft = {
      ...input.platformDraft,
      packageDir: platformDir,
    };
    await writeFile(inputPath, JSON.stringify(input, null, 2), 'utf-8');

    let failed = false;
    try {
      await execFileAsync(process.execPath, [
        'scripts/run-v2-acceptance-evidence.mjs',
        '--input',
        inputPath,
        '--require-real-workspace-evidence',
        '--output-dir',
        evidenceDir,
      ], { cwd: process.cwd() });
    } catch (error) {
      failed = true;
      assert.equal(error.code, 1);
    }

    assert.equal(failed, true);
    const manifest = JSON.parse(await readFile(join(evidenceDir, 'manifest.json'), 'utf-8'));
    const missingEvidence = await readFile(join(evidenceDir, 'MISSING_EVIDENCE.md'), 'utf-8');
    const mixPackageFailure = manifest.businessFailures.find((check) => check.id === 'mix-package-assets');
    assert.ok(mixPackageFailure.missing.some((item) => item.includes('缺失混剪素材文件') && item.includes('videos/missing-video.mp4')));
    assert.ok(mixPackageFailure.missing.some((item) => item.includes('未验证混剪素材路径') && item.includes('videos/missing-video.mp4')));
    assert.match(missingEvidence, /缺失混剪素材文件：.*videos\/missing-video\.mp4/);
    assert.match(missingEvidence, /未验证混剪素材路径：videos\/missing-video\.mp4/);
  });
});

test('v2 验收证据 CLI 会展开混剪导入证据目录越界路径', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence-out-of-scope-import');
    const mixDir = join(workspacePath, 'mix-package');
    const outsideEvidencePath = join(workspacePath, 'capcut-import-evidence-outside.md');
    const inputPath = join(workspacePath, 'business-input.json');
    await mkdir(mixDir, { recursive: true });
    await writeFile(outsideEvidencePath, '# 剪映导入验收\n\n这个文件没有随混剪包归档。', 'utf-8');
    const input = JSON.parse(await readFile(join(process.cwd(), 'docs/roadmap/v2/business-acceptance-input.example.json'), 'utf-8'));
    input.videoPackage = {
      ...input.videoPackage,
      packageDir: mixDir,
      requireExternalImportEvidence: true,
      externalImportEvidence: {
        toolName: '剪映专业版',
        importedAt: '2026-05-22T16:30:00+08:00',
        operator: '剪辑验收',
        importedAssetKinds: ['video', 'overlay'],
        importedFileCount: 2,
        manifestImported: true,
        timelineCreated: true,
        result: 'verified',
        evidenceFiles: [outsideEvidencePath],
      },
    };
    await writeFile(inputPath, JSON.stringify(input, null, 2), 'utf-8');

    let failed = false;
    try {
      await execFileAsync(process.execPath, [
        'scripts/run-v2-acceptance-evidence.mjs',
        '--input',
        inputPath,
        '--require-external-mix-evidence',
        '--output-dir',
        evidenceDir,
      ], { cwd: process.cwd() });
    } catch (error) {
      failed = true;
      assert.equal(error.code, 1);
    }

    assert.equal(failed, true);
    const manifest = JSON.parse(await readFile(join(evidenceDir, 'manifest.json'), 'utf-8'));
    const missingEvidence = await readFile(join(evidenceDir, 'MISSING_EVIDENCE.md'), 'utf-8');
    const mixImportFailure = manifest.businessFailures.find((check) => check.id === 'mix-package-external-import');
    assert.ok(mixImportFailure.missing.some((item) => item.includes('混剪导入证据文件不在混剪包目录') && item.includes('capcut-import-evidence-outside.md')));
    assert.match(missingEvidence, /混剪导入证据文件不在混剪包目录：.*capcut-import-evidence-outside\.md/);
  });
});

test('v2 验收证据 CLI 复跑命令保留外部输入', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence-input');
    const inputPath = join(process.cwd(), 'docs/roadmap/v2/business-acceptance-input.example.json');

    await execFileAsync(process.execPath, [
      'scripts/run-v2-acceptance-evidence.mjs',
      '--input',
      inputPath,
      '--output-dir',
      evidenceDir,
    ], { cwd: process.cwd() });

    const manifest = JSON.parse(await readFile(join(evidenceDir, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.mode, 'external-input');
    assert.equal(manifest.inputs.inputPath, inputPath);
    assert.match(manifest.commands.business, /--input/);
    assert.match(manifest.commands.business, /business-acceptance-input\.example\.json/);
    assert.match(manifest.commands.evidence, /--input/);
    assert.match(manifest.commands.evidence, /business-acceptance-input\.example\.json/);
  });
});

test('v2 业务验收脚本覆盖本地 sample 主链口径', async () => {
  const report = await buildBusinessAcceptanceReport({}, {
    providerReport: await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false }),
  });

  assert.equal(report.schema, 'buguai.v2-business-acceptance.v1');
  assert.equal(report.mode, 'local-sample');
  assert.equal(report.summary.total, 50);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.sections.realEvidence.checks.length, 0);
  assert.equal(report.sections.brand.imagePrompts.length, 10);
  assert.equal(report.sections.brand.videoPrompts.length, 10);
  assert.equal(report.sections.brand.promptGroupEvidence.imagePromptCount, 10);
  assert.equal(report.sections.brand.promptGroupEvidence.videoPromptCount, 10);
  assert.ok(report.sections.brand.checks.some((check) => check.id === 'scene-prompt-structure' && check.status === 'pass'));
  assert.equal(report.sections.ip.completeness, 100);
  assert.ok(report.sections.productBrief.checks.some((check) => check.id === 'product-brief-downstream-ready' && check.status === 'pass'));
  assert.ok(report.sections.productBrief.checks.some((check) => check.id === 'product-brief-prompt-plan' && check.status === 'pass'));
  assert.ok(report.sections.productBrief.checks.some((check) => check.id === 'product-brief-prompt-trace' && check.status === 'pass'));
  assert.deepEqual(report.sections.productBrief.promptPlan.map((item) => item.type), ['main-image', 'selling-point-image', 'detail-page-section']);
  assert.ok(report.sections.productBrief.promptPlan.every((item) => item.sourceTrace === '已关联 2 份产品资料 / SKU 表'));
  assert.ok(report.sections.productBrief.promptPlan.every((item) => item.prompt.includes('追溯资料：已关联 2 份产品资料 / SKU 表')));
  assert.ok(report.sections.productBrief.promptPlan.every((item) => !item.prompt.includes('追溯输入源')));
  assert.ok(report.sections.productBrief.promptPlan.every((item) => !item.prompt.includes('sample-product-brief')));
  assert.ok(report.sections.productBrief.promptPlan.every((item) => !item.prompt.includes('sample-sku-table')));
  assert.equal(report.sections.productBrief.skuRows.length, 2);
  assert.ok(report.sections.feedback.checks.some((check) => check.id === 'feedback-clusters' && check.status === 'pass'));
  assert.ok(report.sections.feedback.checks.some((check) => check.id === 'feedback-title-directions' && check.status === 'pass'));
  assert.ok(report.sections.feedback.checks.some((check) => check.id === 'feedback-objection-responses' && check.status === 'pass'));
  assert.ok(report.sections.feedback.matrix.length >= 4);
  assert.ok(report.sections.reference.checks.some((check) => check.id === 'reference-source-kinds' && check.status === 'pass'));
  assert.ok(report.sections.videoBreakdown.checks.some((check) => check.id === 'video-breakdown-segments' && check.status === 'pass'));
  assert.ok(report.sections.videoBreakdown.checks.some((check) => check.id === 'video-script-structure' && check.status === 'pass'));
  assert.ok(report.sections.greenScreen.checks.some((check) => check.id === 'green-screen-card-types' && check.status === 'pass'));
  assert.ok(report.sections.successfulAsset.checks.some((check) => check.id === 'successful-asset-prompt-draft' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.details?.expectedFiles?.includes('manifest.csv') || check.expectedFiles?.includes('manifest.csv')));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'mix-package-assets' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'mix-package-approved-assets' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'mix-package-import-guide' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'platform-draft-trace' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'platform-draft-content' && check.status === 'pass'));
  assert.ok(report.sections.trace.checks.some((check) => check.id === 'workflow-run-trace-coverage' && check.status === 'pass'));
  assert.equal(report.summary.providerBlocked >= 3, true);
});

test('v2 业务验收脚本支持外部真实素材输入并暴露缺口', async () => {
  const providerReport = await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false });
  const externalInput = {
    brand: {
      title: '真实验收品牌',
      facts: ['产品事实 A。', '场景事实 B。'],
      compliance: ['不承诺治疗。', '不写绝对化收益。'],
      scenes: [
        {
          title: '通勤包侧袋备用',
          audience: '通勤用户',
          painPoint: '出门后容易忘记准备。',
          usageScene: '通勤包侧袋',
          visualComposition: '真实包内俯拍，自然光，产品只占画面三分之一。',
          sellingPoint: '便携条包方便随手取用。',
          imageMaterialSuggestion: '生成手机实拍包内场景图。',
          videoMaterialSuggestion: '生成 15 秒手部取用动作素材。',
        },
        '办公室抽屉里备用',
      ],
    },
    ip: {
      title: '真实验收 IP',
      layers: {
        identity: '身份',
        values: '价值观',
        language: '语言',
        methodology: '方法论',
        materials: '素材',
        engine: '创作引擎',
      },
    },
    productBrief: {
      sources: [{
        id: 'product-brief-real',
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '真实产品 brief',
        tags: ['产品资料', 'brief'],
        extractedText: [
          '产品名称：每日轻补便携条包',
          '卖点：小条包装，早餐后、办公室和通勤包里都能随手取用',
          '规格：每盒 20 条，每条独立包装',
          '适用场景：早餐后、办公室抽屉、通勤包侧袋、出差洗漱包',
          '禁用表达：不承诺治疗、见效、改善疾病或替代专业建议',
          'SKU,规格,价格,适用场景',
          'trial-10,10 条装,49,首次尝试',
        ].join('\n'),
      }],
    },
    feedback: {
      sources: [{
        id: 'feedback-real',
        kind: 'manual-note',
        purpose: 'user-feedback',
        title: '真实评论和客服问题',
        tags: ['评论', '客服问题'],
        extractedText: [
          '用户：价格有点贵，值不值，怕是智商税。',
          '差评：买了以后不知道怎么用，步骤太复杂，坚持几天就忘记。',
          '客服：孩子和老人能不能吃，敏感人群有没有禁忌？',
          '评论：早餐后放办公室抽屉和通勤包里会不会更方便？',
        ].join('\n'),
      }],
    },
    reference: {
      sources: ['reference-a.png', 'reference-video-a.mp4'],
      actualPromptFields: ['composition', 'lighting', 'negativePrompt', 'risks', 'qualityChecklist'],
      actualBoundaryTerms: [
        '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
        '需要人工复核素材授权、商标和肖像风险。',
      ],
    },
    videoBreakdown: {
      sources: ['reference-video-a.mp4'],
      actual: {
        summary: '已拆解参考视频的钩子、镜头、字幕、节奏和可复用结构。',
        dimensions: ['开头钩子', '字幕口播', '镜头运镜'],
        segments: [{
          timeRange: '0-3s',
          hook: '先抛早餐后难坚持的真实痛点',
          visual: '早餐桌自然光，手把便携条包放进通勤包侧袋',
          voiceover: '很多人不是不知道要坚持，而是每天准备太麻烦。',
          subtitle: '早餐后顺手放进包里',
          rhythm: '快节奏钩子',
          reusablePoint: '用具体生活动作降低坚持门槛',
        }],
        reusableFormula: ['痛点 -> 顺手使用 -> 事实边界'],
        risks: [{ level: 'warning', message: '新脚本只能复用结构，不照搬原视频画面；发布前复核素材授权和合规表达。' }],
      },
      script: {
        title: '便携条包 15 秒新视频脚本',
        script: '镜头 1：早餐后顺手放进包里。',
        storyboard: [{
          shot: 1,
          duration: '0-3s',
          visual: '自然光早餐桌，手拿起条包。',
          voiceover: '每天坚持，难的不是知道，而是顺手。',
          subtitle: '早餐后顺手完成',
          rhythm: '快速钩子',
        }],
        videoPrompt: '15 秒 9:16 手机实拍视频，自然光，不复制原视频构图和品牌元素。',
        publishCheck: [
          { level: 'warning', message: '复核素材授权，避免照搬参考视频画面。' },
          { level: 'risk', message: '不要承诺治疗、见效或替代专业建议。' },
        ],
        breakdownLogId: 'video-breakdown-real',
      },
    },
    videoPackage: {
      actualFiles: ['videos/', 'overlays/', 'manifest.json', 'manifest.csv', 'import-guide.md'],
      actualTraceFields: ['workflowRunId', 'promptDraftId', 'sourceId', 'packagedPath'],
      actualAssetKinds: ['video', 'overlay'],
      actualReviewStatuses: ['approved'],
      actualGuideTerms: ['第三方混剪软件', 'manifest.csv', 'overlays/', 'videos/', '人工审核'],
    },
    greenScreen: {
      actualCards: [{
        id: 'overlay-title-real',
        type: 'title',
        title: '标题卡',
        text: '早餐后顺手一次',
        durationSeconds: 3,
        assetPath: 'overlays/001-overlay-title.svg',
        background: 'green-screen',
        aspectRatio: '9:16',
        promptDraftId: 'video-prompt-real',
        tags: ['绿幕文案图', '标题卡'],
      }, {
        id: 'overlay-selling-point-real',
        type: 'selling-point',
        title: '卖点卡',
        text: '抽屉包里都能放',
        durationSeconds: 4,
        assetPath: 'overlays/002-overlay-selling-point.svg',
        background: 'green-screen',
        aspectRatio: '9:16',
        promptDraftId: 'video-prompt-real',
        tags: ['绿幕文案图', '卖点卡'],
      }, {
        id: 'overlay-cta-real',
        type: 'cta',
        title: '行动卡',
        text: '先从顺手一次开始',
        durationSeconds: 4,
        assetPath: 'overlays/003-overlay-cta.svg',
        background: 'green-screen',
        aspectRatio: '9:16',
        promptDraftId: 'video-prompt-real',
        tags: ['绿幕文案图', '行动卡'],
      }],
      actualReviewStatuses: ['approved'],
    },
    platformDraft: {
      actualFiles: ['draft.md', 'platform-copy.txt', 'format-guide.md', 'publish-checklist.md', 'manifest.json'],
      actualTraceFields: ['workflowRunId', 'promptDraftId', 'sourceLogId'],
      actualContentFields: ['draft', 'platformCopy', 'formatGuide', 'publishChecklist', 'publishBoundary'],
    },
    mediaCost: {
      actual: {
        model: 'test-video-model',
        status: 'succeeded',
        durationSeconds: 10,
        currency: 'CNY',
        unitPrice: 1.5,
        estimatedCost: 15,
        source: 'provider-response',
      },
    },
    successfulAsset: {
      actual: {
        assetKey: 'generated:real-image-log:0:approved-breakfast.png',
        kind: 'image',
        path: 'approved-breakfast.png',
        title: '已通过早餐桌素材',
        reviewStatus: 'approved',
        workflowRunId: 'workflow-run-real',
        originalPromptDraftId: 'image-prompt-real',
        workflowArtifactRefs: [
          'generated:real-image-log:0:approved-breakfast.png',
          'input-source:successful-asset-real',
          'prompt-draft:successful-asset-draft-real',
        ],
        distilledInputSource: {
          id: 'successful-asset-real',
          kind: 'image',
          purpose: 'successful-asset',
          title: '成功素材沉淀 / 已通过早餐桌素材',
          sourcePath: 'approved-breakfast.png',
          tags: ['successful-asset', 'prompt-distilled', 'image', 'run-trace'],
          relatedPromptDraftId: 'image-prompt-real',
          relatedSceneCardIds: ['scene-real-001'],
          extractedText: [
            '素材状态：已通过审核。',
            '质量原因：真实早餐桌自然光，产品清楚但不过度硬广。',
            '复用 Prompt 草稿：早餐桌自然光，手部自然拿起便携条包。',
            '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
            '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
          ].join('\n'),
        },
        distilledPromptDraft: {
          id: 'successful-asset-draft-real',
          title: '成功素材 Prompt：已通过早餐桌素材',
          purpose: 'image',
          status: 'confirmed',
          workflowRunId: 'workflow-run-real',
          inputSourceIds: ['successful-asset-real'],
          sceneCardIds: ['scene-real-001'],
          model: 'local-successful-asset-distiller',
          content: [
            '素材状态：已通过审核。',
            '质量原因：真实早餐桌自然光，产品清楚但不过度硬广。',
            '复用 Prompt 草稿：早餐桌自然光，手部自然拿起便携条包。',
            '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
            '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
          ].join('\n'),
        },
      },
    },
    trace: {
      expectedWorkflowRunId: 'workflow-run-real',
      actualWorkflowRunRefs: [
        { source: 'reference-log', workflowRunId: 'workflow-run-real' },
        { source: 'video-breakdown-log', workflowRunId: 'workflow-run-real' },
        { source: 'video-script-log', workflowRunId: 'workflow-run-real' },
        { source: 'video-generation-log', workflowRunId: 'workflow-run-real' },
        { source: 'mix-package', workflowRunId: 'workflow-run-real' },
        { source: 'platform-draft', workflowRunId: 'workflow-run-real' },
      ],
    },
  };

  const passed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: externalInput,
    mode: 'external-input',
  });
  assert.equal(passed.mode, 'external-input');
  assert.equal(passed.summary.failed, 0);
  assert.equal(passed.sections.brand.sample, '真实验收品牌');
  assert.equal(passed.sections.brand.promptGroupEvidence.imagePromptCount, 10);
  assert.ok(passed.sections.productBrief.checks.some((check) => check.id === 'product-brief-fields' && check.status === 'pass'));
  assert.ok(passed.sections.productBrief.checks.some((check) => check.id === 'product-brief-prompt-plan' && check.status === 'pass'));
  assert.ok(passed.sections.productBrief.promptPlan.some((item) => item.type === 'detail-page-section' && item.prompt.includes('SKU')));
  assert.ok(passed.sections.feedback.checks.some((check) => check.id === 'feedback-evidence' && check.status === 'pass'));
  assert.ok(passed.sections.feedback.checks.some((check) => check.id === 'feedback-title-directions' && check.status === 'pass'));
  assert.ok(passed.sections.feedback.checks.some((check) => check.id === 'feedback-objection-responses' && check.status === 'pass'));
  assert.ok(passed.sections.videoBreakdown.checks.some((check) => check.id === 'video-breakdown-boundary' && check.status === 'pass'));
  assert.ok(passed.sections.greenScreen.checks.some((check) => check.id === 'green-screen-card-approved' && check.status === 'pass'));
  assert.ok(passed.sections.successfulAsset.checks.some((check) => check.id === 'successful-asset-workflow-trace' && check.status === 'pass'));
  assert.equal(passed.sections.mediaCost.actual.estimatedCost, 15);
  assert.equal(passed.sections.trace.uniqueWorkflowRunIds[0], 'workflow-run-real');
  assert.ok(passed.sections.trace.checks.some((check) => check.id === 'workflow-run-trace-coverage' && check.status === 'pass'));

  const missingRealWorkspaceEvidence = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: externalInput,
    mode: 'external-input',
    requireRealWorkspaceEvidence: true,
  });
  const realWorkspaceCheck = missingRealWorkspaceEvidence.sections.realEvidence.checks.find((check) => check.id === 'real-workspace-evidence');
  assert.ok(missingRealWorkspaceEvidence.summary.failed >= 2);
  assert.equal(realWorkspaceCheck.status, 'fail');
  assert.ok(realWorkspaceCheck.missing.includes('必须使用 --workspace 从真实工作区读取产物'));
  assert.ok(realWorkspaceCheck.missing.includes('真实 provider strict 未通过；请用 verify:v2:evidence --provider-strict 联调'));
  assert.ok(realWorkspaceCheck.missing.includes('缺少真实第三方混剪导入证据文件'));
  assert.ok(realWorkspaceCheck.nextActions.some((item) => item.includes('真实第三方混剪工具导入')));
  assert.equal(
    missingRealWorkspaceEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import').status,
    'fail',
  );

  const missingMixImportEvidence = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: externalInput,
    mode: 'external-input',
    requireExternalMixEvidence: true,
  });
  const missingMixImportCheck = missingMixImportEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import');
  assert.equal(missingMixImportCheck.status, 'fail');
  assert.ok(missingMixImportCheck.missingFields.includes('toolName'));
  assert.ok(missingMixImportCheck.missingFields.includes('evidenceFiles'));

  await withWorkspace(async (workspacePath) => {
    const mixDir = join(workspacePath, 'mix-package-json-only');
    await mkdir(mixDir, { recursive: true });
    await writeFile(join(mixDir, 'import-evidence.json'), JSON.stringify({
      toolName: '剪映专业版',
      importedAt: '2026-05-22T16:30:00+08:00',
      operator: '剪辑验收',
      importedAssetKinds: ['video', 'overlay'],
      importedFileCount: 2,
      manifestImported: true,
      timelineCreated: true,
      result: 'verified',
    }, null, 2), 'utf-8');
    const jsonOnlyMixImportEvidence = await buildBusinessAcceptanceReport({}, {
      providerReport,
      acceptanceInput: {
        ...externalInput,
        videoPackage: {
          ...externalInput.videoPackage,
          packageDir: mixDir,
          requireExternalImportEvidence: true,
        },
      },
      mode: 'external-input',
    });
    const jsonOnlyMixImportCheck = jsonOnlyMixImportEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import');
    assert.equal(jsonOnlyMixImportCheck.status, 'fail');
    assert.ok(jsonOnlyMixImportCheck.missingFields.includes('evidenceFiles'));
    assert.deepEqual(jsonOnlyMixImportCheck.verifiedEvidenceFiles, []);
  });

  await withWorkspace(async (workspacePath) => {
    const emptyEvidencePath = join(workspacePath, 'empty-import-evidence.md');
    await writeFile(emptyEvidencePath, '', 'utf-8');
    const emptyFileMixImportEvidence = await buildBusinessAcceptanceReport({}, {
      providerReport,
      acceptanceInput: {
        ...externalInput,
        videoPackage: {
          ...externalInput.videoPackage,
          requireExternalImportEvidence: true,
          externalImportEvidence: {
            toolName: '剪映专业版',
            importedAt: '2026-05-22T16:30:00+08:00',
            operator: '剪辑验收',
            importedAssetKinds: ['video', 'overlay'],
            importedFileCount: 2,
            manifestImported: true,
            timelineCreated: true,
            result: 'verified',
            evidenceFiles: [emptyEvidencePath],
          },
        },
      },
      mode: 'external-input',
    });
    const emptyEvidenceCheck = emptyFileMixImportEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import');
    assert.equal(emptyEvidenceCheck.status, 'fail');
    assert.ok(emptyEvidenceCheck.missingFields.includes('evidenceFiles'));
    assert.deepEqual(emptyEvidenceCheck.verifiedEvidenceFiles, []);
    assert.ok(emptyEvidenceCheck.missingEvidenceFiles.some((filePath) => filePath.endsWith('empty-import-evidence.md')));
  });

  await withWorkspace(async (workspacePath) => {
    const mixDir = join(workspacePath, 'mix-package');
    const outsideEvidencePath = join(workspacePath, 'capcut-import-evidence-outside.md');
    await mkdir(mixDir, { recursive: true });
    await writeFile(outsideEvidencePath, '# 剪映导入验收\n\n这个文件没有随混剪包归档。', 'utf-8');
    const outOfScopeMixImportEvidence = await buildBusinessAcceptanceReport({}, {
      providerReport,
      acceptanceInput: {
        ...externalInput,
        videoPackage: {
          ...externalInput.videoPackage,
          packageDir: mixDir,
          requireExternalImportEvidence: true,
          externalImportEvidence: {
            toolName: '剪映专业版',
            importedAt: '2026-05-22T16:30:00+08:00',
            operator: '剪辑验收',
            importedAssetKinds: ['video', 'overlay'],
            importedFileCount: 2,
            manifestImported: true,
            timelineCreated: true,
            result: 'verified',
            evidenceFiles: [outsideEvidencePath],
          },
        },
      },
      mode: 'external-input',
    });
    const outOfScopeEvidenceCheck = outOfScopeMixImportEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import');
    assert.equal(outOfScopeEvidenceCheck.status, 'fail');
    assert.ok(outOfScopeEvidenceCheck.missingFields.includes('evidenceFiles'));
    assert.deepEqual(outOfScopeEvidenceCheck.verifiedEvidenceFiles, []);
    assert.ok(outOfScopeEvidenceCheck.outOfScopeEvidenceFiles.some((filePath) => filePath.endsWith('capcut-import-evidence-outside.md')));
  });

  await withWorkspace(async (workspacePath) => {
    const evidencePath = join(workspacePath, 'capcut-import-evidence.md');
    await writeFile(evidencePath, '# 剪映导入验收\n\n只导入了一个素材，还没有创建时间线。', 'utf-8');
    const incompleteMixImportEvidence = await buildBusinessAcceptanceReport({}, {
      providerReport,
      acceptanceInput: {
        ...externalInput,
        videoPackage: {
          ...externalInput.videoPackage,
          requireExternalImportEvidence: true,
          externalImportEvidence: {
            toolName: '剪映专业版',
            importedAt: '2026-05-22T16:30:00+08:00',
            operator: '剪辑验收',
            importedAssetKinds: ['video', 'overlay'],
            importedFileCount: 1,
            manifestImported: true,
            timelineCreated: false,
            result: 'draft',
            evidenceFiles: [evidencePath],
          },
        },
      },
      mode: 'external-input',
    });
    const incompleteEvidenceCheck = incompleteMixImportEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import');
    assert.equal(incompleteEvidenceCheck.status, 'fail');
    assert.ok(incompleteEvidenceCheck.missingFields.includes('importedFileCount'));
    assert.ok(incompleteEvidenceCheck.missingFields.includes('timelineCreated'));
    assert.ok(incompleteEvidenceCheck.missingFields.includes('result'));
    assert.equal(incompleteEvidenceCheck.importedFileCount, 1);
    assert.equal(incompleteEvidenceCheck.requiredImportedFileCount, 2);
  });

  await withWorkspace(async (workspacePath) => {
    const evidencePath = join(workspacePath, 'capcut-import-evidence.md');
    await writeFile(evidencePath, '# 剪映导入验收\n\n已导入 videos/ 和 overlays/，manifest.csv 已核对。', 'utf-8');
    const passedWithMixImportEvidence = await buildBusinessAcceptanceReport({}, {
      providerReport,
      acceptanceInput: {
        ...externalInput,
        videoPackage: {
          ...externalInput.videoPackage,
          requireExternalImportEvidence: true,
          externalImportEvidence: {
            toolName: '剪映专业版',
            importedAt: '2026-05-22T16:30:00+08:00',
            operator: '剪辑验收',
            importedAssetKinds: ['video', 'overlay'],
            importedFileCount: 2,
            manifestImported: true,
            timelineCreated: true,
            result: 'verified',
            evidenceFiles: [evidencePath],
          },
        },
      },
      mode: 'external-input',
    });
    const mixImportCheck = passedWithMixImportEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import');
    assert.equal(mixImportCheck.status, 'pass');
    assert.equal(mixImportCheck.toolName, '剪映专业版');
    assert.ok(mixImportCheck.evidenceFiles.some((filePath) => filePath.endsWith('capcut-import-evidence.md')));
  });

  await withWorkspace(async (workspacePath) => {
    const evidencePath = join(workspacePath, 'capcut-import-evidence.md');
    await writeFile(evidencePath, '# 剪映导入验收\n\n已导入 videos/ 和 overlays/，manifest.csv 已核对。', 'utf-8');
    const providerStrictPassed = {
      schema: 'buguai.v2-provider-check.v1',
      strictGate: { passed: true, reasons: [], failedChecks: [], blockedChecks: [], skippedChecks: [] },
      summary: { total: 4, succeeded: 4, ready: 0, blocked: 0, skipped: 0, failed: 0 },
      checks: [],
    };
    const sampleTextWorkspace = await buildBusinessAcceptanceReport({}, {
      providerReport: providerStrictPassed,
      acceptanceInput: {
        ...externalInput,
        workspacePath,
        productBrief: {
          sources: [{
            ...externalInput.productBrief.sources[0],
            id: 'product-brief-real',
            title: '真实产品资料',
            extractedText: `${externalInput.productBrief.sources[0].extractedText}\n示例素材不得进入发布验收。`,
          }],
        },
        videoPackage: {
          ...externalInput.videoPackage,
          packageDir: workspacePath,
          actualPackagedFilePaths: ['videos/real-video.mp4', 'overlays/real-title.png'],
          externalImportEvidence: {
            toolName: '剪映专业版',
            importedAt: '2026-05-22T16:30:00+08:00',
            operator: '剪辑验收',
            importedAssetKinds: ['video', 'overlay'],
            importedFileCount: 2,
            manifestImported: true,
            timelineCreated: true,
            result: 'verified',
            evidenceFiles: [evidencePath],
          },
        },
        platformDraft: {
          ...externalInput.platformDraft,
          packageDir: workspacePath,
        },
      },
      mode: 'workspace',
      requireRealWorkspaceEvidence: true,
    });
    const sampleTextCheck = sampleTextWorkspace.sections.realEvidence.checks.find((check) => check.id === 'real-workspace-evidence');
    assert.equal(sampleTextCheck.status, 'fail');
    assert.ok(sampleTextCheck.missing.includes('验收证据仍包含 sample / 示例占位内容'));
    assert.ok(sampleTextCheck.sampleLikeValues.some((value) => value.includes('示例素材')));
    assert.equal(sampleTextCheck.providerStrictPassed, true);
  });

  await withWorkspace(async (workspacePath) => {
    const evidencePath = join(workspacePath, 'capcut-import-evidence.md');
    await writeFile(evidencePath, '# 剪映导入验收\n\n已导入 videos/ 和 overlays/，manifest.csv 已核对。', 'utf-8');
    const providerStrictPassed = {
      schema: 'buguai.v2-provider-check.v1',
      strictGate: { passed: true, reasons: [], failedChecks: [], blockedChecks: [], skippedChecks: [] },
      summary: { total: 4, succeeded: 4, ready: 0, blocked: 0, skipped: 0, failed: 0 },
      checks: [],
    };
    const missingPackagedFileWorkspace = await buildBusinessAcceptanceReport({}, {
      providerReport: providerStrictPassed,
      acceptanceInput: {
        ...externalInput,
        workspacePath,
        reference: {
          ...externalInput.reference,
          actualSourceKinds: ['image', 'video'],
        },
        videoPackage: {
          ...externalInput.videoPackage,
          packageDir: workspacePath,
          declaredPackagedFilePaths: ['videos/missing-video.mp4', 'overlays/missing-title.png'],
          actualPackagedFilePaths: ['videos/missing-video.mp4', 'overlays/missing-title.png'],
          externalImportEvidence: {
            toolName: '剪映专业版',
            importedAt: '2026-05-22T16:30:00+08:00',
            operator: '剪辑验收',
            importedAssetKinds: ['video', 'overlay'],
            importedFileCount: 2,
            manifestImported: true,
            timelineCreated: true,
            result: 'verified',
            evidenceFiles: [evidencePath],
          },
        },
        platformDraft: {
          ...externalInput.platformDraft,
          packageDir: workspacePath,
        },
      },
      mode: 'workspace',
      requireRealWorkspaceEvidence: true,
    });
    const missingPackagedFileCheck = missingPackagedFileWorkspace.sections.realEvidence.checks.find((check) => check.id === 'real-workspace-evidence');
    assert.equal(missingPackagedFileCheck.status, 'fail');
    assert.ok(missingPackagedFileCheck.missing.includes('缺少混剪包素材文件实存证据'));
    assert.ok(missingPackagedFileCheck.missing.includes('混剪包 manifest 指向的素材文件不存在'));
    assert.deepEqual(missingPackagedFileCheck.actualPackagedFilePaths, []);
    assert.ok(missingPackagedFileCheck.missingPackagedFilePaths.some((filePath) => filePath.endsWith('videos/missing-video.mp4')));
    const mixPackageAssetsCheck = missingPackagedFileWorkspace.sections.delivery.checks.find((check) => check.id === 'mix-package-assets');
    assert.equal(mixPackageAssetsCheck.status, 'fail');
    assert.ok(mixPackageAssetsCheck.unverifiedPackagedFilePaths.includes('videos/missing-video.mp4'));
  });

  const complianceFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      brand: {
        ...externalInput.brand,
        compliance: ['表达保持克制。', '上线前人工复核。'],
      },
    },
    mode: 'external-input',
  });
  const complianceCheck = complianceFailed.sections.brand.checks.find((check) => check.id === 'brand-compliance');
  assert.equal(complianceCheck.status, 'fail');
  assert.ok(complianceCheck.missingTerms.includes('治疗'));
  assert.ok(complianceCheck.missingTerms.includes('绝对化'));

  const failed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      ip: { title: '缺层 IP', layers: { identity: '身份' } },
      productBrief: {
        sources: [{
          id: 'product-brief-missing',
          kind: 'manual-note',
          purpose: 'product-brief',
          title: '缺字段产品资料',
          tags: ['产品资料'],
          extractedText: '卖点：便携好带。\n适用场景：办公室抽屉。',
        }],
      },
      feedback: {
        sources: [],
      },
      videoBreakdown: {
        sources: ['reference-video-a.mp4'],
        actual: {
          segments: [{ timeRange: '0-3s', hook: '只返回钩子' }],
          reusableFormula: [],
          risks: [{ level: 'warning', message: '仅人工复核。' }],
        },
        script: {
          title: '',
          storyboard: [],
          videoPrompt: '',
          publishCheck: [],
        },
      },
      videoPackage: { actualFiles: ['videos/', 'manifest.json'], actualTraceFields: ['workflowRunId'], actualAssetKinds: ['video'] },
      greenScreen: {
        actualCards: [{
          id: 'overlay-bad',
          type: 'title',
          title: '标题卡',
          text: '这是一段过长的绿幕文案，会让第三方混剪叠加时不可读，需要拆成多张卡片',
          durationSeconds: 0,
          assetPath: 'overlays/overlay-bad.txt',
          background: 'plain',
          aspectRatio: '16:9',
          promptDraftId: '',
        }],
        actualReviewStatuses: ['rejected'],
      },
      platformDraft: { actualFiles: ['draft.md'] },
      mediaCost: { actual: { durationSeconds: 0, estimatedCost: 0, currency: '' } },
      successfulAsset: {
        actual: {
          ...externalInput.successfulAsset.actual,
          reviewStatus: 'pending',
          distilledInputSource: {
            ...externalInput.successfulAsset.actual.distilledInputSource,
            tags: ['successful-asset'],
            relatedPromptDraftId: '',
          },
        },
      },
    },
    mode: 'external-input',
  });
  assert.ok(failed.summary.failed >= 3);
  assert.deepEqual(failed.sections.ip.missingLayers, ['values', 'language', 'methodology', 'materials', 'engine']);
  assert.ok(failed.sections.productBrief.checks.some((check) => check.status === 'fail' && check.id === 'product-brief-fields'));
  assert.ok(failed.sections.productBrief.checks.some((check) => check.status === 'fail' && check.id === 'product-brief-sku'));
  assert.ok(failed.sections.productBrief.checks.some((check) => check.status === 'fail' && check.id === 'product-brief-prompt-trace'));
  assert.ok(failed.sections.feedback.checks.some((check) => check.status === 'fail' && check.id === 'feedback-clusters'));
  assert.ok(failed.sections.feedback.checks.some((check) => check.status === 'fail' && check.id === 'feedback-title-directions'));
  assert.ok(failed.sections.feedback.checks.some((check) => check.status === 'fail' && check.id === 'feedback-objection-responses'));
  assert.ok(failed.sections.videoBreakdown.checks.some((check) => check.status === 'fail' && check.id === 'video-breakdown-segments'));
  assert.ok(failed.sections.videoBreakdown.checks.some((check) => check.status === 'fail' && check.id === 'video-script-structure'));
  assert.ok(failed.sections.greenScreen.checks.some((check) => check.status === 'fail' && check.id === 'green-screen-card-types'));
  assert.ok(failed.sections.greenScreen.checks.some((check) => check.status === 'fail' && check.id === 'green-screen-card-approved'));
  assert.ok(failed.sections.successfulAsset.checks.some((check) => check.status === 'fail' && check.id === 'successful-asset-approved'));
  assert.ok(failed.sections.successfulAsset.checks.some((check) => check.status === 'fail' && check.id === 'successful-asset-source-trace'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'mix-package-files'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'mix-package-assets'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'mix-package-approved-assets'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'platform-draft-files'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'platform-draft-trace'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'platform-draft-content'));
  assert.ok(failed.sections.mediaCost.checks.some((check) => check.status === 'fail' && check.id === 'video-cost-present'));

  const manualCostFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      mediaCost: {
        actual: {
          model: 'test-video-model',
          status: 'succeeded',
          durationSeconds: 10,
          currency: 'CNY',
          unitPrice: 1.5,
          estimatedCost: 15,
          source: 'manual',
        },
      },
    },
    mode: 'external-input',
  });
  assert.ok(manualCostFailed.sections.mediaCost.checks.some((check) => check.status === 'fail' && check.id === 'video-cost-total'));

  const referenceBoundaryFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      reference: {
        ...externalInput.reference,
        actualBoundaryTerms: ['只描述画面构图和自然光。'],
      },
    },
    mode: 'external-input',
  });
  const referenceBoundaryCheck = referenceBoundaryFailed.sections.reference.checks.find((check) => check.id === 'reference-boundary');
  assert.equal(referenceBoundaryCheck.status, 'fail');
  assert.ok(referenceBoundaryCheck.missingBoundaryTerms.includes('复制竞品'));
  assert.ok(referenceBoundaryCheck.missingBoundaryTerms.includes('授权'));

  const publishBoundaryFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      platformDraft: {
        ...externalInput.platformDraft,
        actualContentFields: ['draft', 'platformCopy', 'formatGuide', 'publishChecklist'],
      },
    },
    mode: 'external-input',
  });
  const publishBoundaryCheck = publishBoundaryFailed.sections.delivery.checks.find((check) => check.id === 'platform-draft-content');
  assert.equal(publishBoundaryCheck.status, 'fail');
  assert.ok(publishBoundaryCheck.missingFields.includes('publishBoundary'));

  const traceFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      trace: {
        actualWorkflowRunRefs: [
          { source: 'reference-log', workflowRunId: 'workflow-run-a' },
          { source: 'mix-package', workflowRunId: 'workflow-run-b' },
        ],
      },
    },
    mode: 'external-input',
  });
  assert.ok(traceFailed.sections.trace.checks.some((check) => check.status === 'fail' && check.id === 'workflow-run-trace-consistent'));
  assert.ok(traceFailed.sections.trace.checks.some((check) => check.status === 'fail' && check.id === 'workflow-run-trace-coverage'));
});

test('v2 业务验收脚本可从真实交付包目录自动提取证据', async () => {
  await withWorkspace(async (workspacePath) => {
    const mixDir = join(workspacePath, 'mix-package');
    const platformDir = join(workspacePath, 'platform-draft');
    await mkdir(join(mixDir, 'videos'), { recursive: true });
    await mkdir(join(mixDir, 'overlays'), { recursive: true });
    await mkdir(platformDir, { recursive: true });
    await writeFile(join(mixDir, 'videos', '001-video.mp4'), 'fake video fixture', 'utf-8');
    await writeFile(join(mixDir, 'overlays', '001-overlay-title.svg'), '<svg></svg>', 'utf-8');
    await writeFile(join(mixDir, 'manifest.csv'), '"kind","title","packagedPath"\n"video","成品视频","videos/001-video.mp4"\n"overlay","标题卡","overlays/001-overlay-title.svg"\n', 'utf-8');
    await writeFile(join(mixDir, 'import-guide.md'), [
      '# 真实混剪包导入说明',
      '第三方混剪软件中先导入 videos/ 主体素材，再导入 overlays/ 绿幕文案图。',
      '使用 manifest.csv 对照素材用途、提示词来源和人工审核状态。',
    ].join('\n'), 'utf-8');
    await writeFile(join(mixDir, 'capcut-import-screenshot.txt'), '剪映专业版导入截图占位：视频轨和绿幕叠加轨均已导入。', 'utf-8');
    await writeFile(join(mixDir, 'import-evidence.json'), JSON.stringify({
      toolName: '剪映专业版',
      importedAt: '2026-05-22T16:30:00+08:00',
      operator: '剪辑验收',
      importedAssetKinds: ['video', 'overlay'],
      importedFileCount: 2,
      manifestImported: true,
      timelineCreated: true,
      result: 'verified',
      evidenceFiles: ['capcut-import-screenshot.txt'],
    }, null, 2), 'utf-8');
    await writeFile(join(mixDir, 'manifest.json'), JSON.stringify({
      schema: 'buguai.mix-package.v1',
      workflowRunId: 'workflow-run-real',
      assets: [{
        id: 'imported:real-video:0',
        kind: 'video',
        title: '成品视频',
        reviewStatus: 'approved',
        reviewId: 'asset-review-real-video',
        sourceId: 'input-source-real-video',
        promptDraftId: 'prompt-draft-real-video',
        packagedPath: join(mixDir, 'videos', '001-video.mp4'),
      }, {
        id: 'overlay:overlay-title-real',
        kind: 'overlay',
        title: '标题卡',
        reviewStatus: 'approved',
        reviewId: 'asset-review-real-overlay',
        sourceType: 'overlay-card',
        sourceId: 'overlay-title-real',
        promptDraftId: 'video-prompt-real',
        durationSeconds: 3,
        packagedPath: join(mixDir, 'overlays', '001-overlay-title.svg'),
      }],
    }, null, 2), 'utf-8');
    await writeFile(join(platformDir, 'draft.md'), '# 真实平台草稿\n\n这是一份用于验收的真实正文草稿，包含可人工复核的业务内容。', 'utf-8');
    await writeFile(join(platformDir, 'platform-copy.txt'), '标题：真实平台草稿\n\n正文复制稿。\n\n发布前补充：封面图、摘要和配图位置需要人工确认。', 'utf-8');
    await writeFile(join(platformDir, 'format-guide.md'), '# 公众号 格式指南\n\n- 发布前复核事实引用、功效表达、绝对化词和医疗化暗示。', 'utf-8');
    await writeFile(join(platformDir, 'publish-checklist.md'), '# 真实平台草稿 发布前检查\n\n## 检查项\n\n- [ ] WARNING：确认事实来源。\n\n## 交付边界\n\n- 本包只用于人工复制到目标平台前检查，不包含平台账号、授权或自动发布任务。\n- 发布前需要人工确认平台格式、封面、配图、引用事实和高风险表达。', 'utf-8');
    await writeFile(join(platformDir, 'manifest.json'), JSON.stringify({
      schema: 'buguai.platform-draft.v1',
      workflowRunId: 'workflow-run-real',
      promptDraftId: 'prompt-draft-real-article',
      sourceLogId: 'article-log-real',
      files: {
        markdown: 'draft.md',
        platformCopy: 'platform-copy.txt',
        formatGuide: 'format-guide.md',
        checklist: 'publish-checklist.md',
        metadata: 'metadata.json',
      },
    }, null, 2), 'utf-8');

    const report = await buildBusinessAcceptanceReport({}, {
      providerReport: await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false }),
      mode: 'external-input',
      acceptanceInput: {
        brand: {
          title: '目录证据品牌',
          facts: ['产品事实 A。', '场景事实 B。'],
          compliance: ['不承诺治疗。', '不写绝对化收益。'],
          scenes: ['办公室抽屉里备用', '通勤包侧袋备用'],
        },
        ip: {
          title: '目录证据 IP',
          layers: {
            identity: '身份',
            values: '价值观',
            language: '语言',
            methodology: '方法论',
            materials: '素材',
            engine: '创作引擎',
          },
        },
        productBrief: {
          sources: [{
            id: 'directory-product-brief',
            kind: 'manual-note',
            purpose: 'product-brief',
            title: '目录证据产品资料',
            tags: ['产品资料'],
            extractedText: [
              '产品名称：目录证据便携条包',
              '卖点：小条包装，适合真实生活场景。',
              '规格：每盒 20 条。',
              '适用场景：办公室抽屉、通勤包侧袋。',
              '禁用表达：不承诺治疗，不写绝对化收益。',
              'SKU,规格,价格',
              'trial-10,10 条装,49',
            ].join('\n'),
          }],
        },
        feedback: {
          sources: [{
            id: 'directory-feedback',
            kind: 'manual-note',
            purpose: 'user-feedback',
            title: '目录证据评论',
            tags: ['评论'],
            extractedText: [
              '用户：价格有点贵，值不值？',
              '用户：怎么用，步骤会不会麻烦，坚持会忘记。',
              '客服：孩子和老人能不能用，有没有禁忌？',
              '评论：办公室和通勤包里更方便。',
            ].join('\n'),
          }],
        },
        reference: {
          sources: ['reference-a.png', 'reference-video-a.mp4'],
          actualPromptFields: ['composition', 'lighting', 'negativePrompt', 'risks', 'qualityChecklist'],
          actualBoundaryTerms: [
            '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
            '需要人工复核素材授权、商标和肖像风险。',
          ],
        },
        videoBreakdown: {
          sources: ['reference-video-a.mp4'],
          actual: {
            summary: '目录证据视频拆解',
            dimensions: ['开头钩子', '字幕口播'],
            segments: [{
              timeRange: '0-3s',
              hook: '先抛真实痛点',
              visual: '早餐桌自然光',
              voiceover: '坚持难在每天顺手。',
              subtitle: '顺手完成',
              rhythm: '快速钩子',
              reusablePoint: '痛点后接低门槛动作',
            }],
            reusableFormula: ['痛点 -> 低门槛动作 -> 合规边界'],
            risks: [{ level: 'warning', message: '不照搬原视频画面，复核授权和合规表达。' }],
          },
          script: {
            title: '目录证据视频脚本',
            script: '镜头 1：真实痛点。\n镜头 2：低门槛动作。',
            storyboard: [{
              shot: 1,
              duration: '0-3s',
              visual: '自然光早餐桌。',
              voiceover: '先讲真实痛点。',
              subtitle: '顺手完成',
              rhythm: '快速钩子',
            }],
            videoPrompt: '15 秒 9:16 手机实拍视频，不复制原视频。',
            publishCheck: [
              { level: 'warning', message: '复核素材授权。' },
              { level: 'risk', message: '避免照搬参考视频。' },
            ],
            breakdownLogId: 'directory-video-breakdown',
          },
        },
        greenScreen: {
          actualCards: [{
            id: 'overlay-title-real',
            type: 'title',
            title: '标题卡',
            text: '早餐后顺手一次',
            durationSeconds: 3,
            assetPath: join(mixDir, 'overlays', '001-overlay-title.svg'),
            background: 'green-screen',
            aspectRatio: '9:16',
            promptDraftId: 'video-prompt-real',
            tags: ['绿幕文案图', '标题卡'],
          }, {
            id: 'overlay-selling-point-real',
            type: 'selling-point',
            title: '卖点卡',
            text: '抽屉包里都能放',
            durationSeconds: 4,
            assetPath: 'overlays/002-overlay-selling-point.svg',
            background: 'green-screen',
            aspectRatio: '9:16',
            promptDraftId: 'video-prompt-real',
            tags: ['绿幕文案图', '卖点卡'],
          }, {
            id: 'overlay-cta-real',
            type: 'cta',
            title: '行动卡',
            text: '先从顺手一次开始',
            durationSeconds: 4,
            assetPath: 'overlays/003-overlay-cta.svg',
            background: 'green-screen',
            aspectRatio: '9:16',
            promptDraftId: 'video-prompt-real',
            tags: ['绿幕文案图', '行动卡'],
          }],
          actualReviewStatuses: ['approved'],
        },
        videoPackage: { packageDir: mixDir },
        platformDraft: { packageDir: platformDir },
        mediaCost: {
          actual: {
            model: 'test-video-model',
            status: 'succeeded',
            durationSeconds: 10,
            currency: 'CNY',
            unitPrice: 1.5,
            estimatedCost: 15,
            source: 'provider-response',
          },
        },
        successfulAsset: {
          actual: {
            assetKey: 'imported:real-video:0',
            kind: 'video',
            path: join(mixDir, 'videos', '001-video.mp4'),
            title: '成品视频',
            reviewStatus: 'approved',
            workflowRunId: 'workflow-run-real',
            originalPromptDraftId: 'prompt-draft-real-video',
            workflowArtifactRefs: [
              'imported:real-video:0',
              'input-source:successful-asset-directory',
              'prompt-draft:successful-asset-directory-draft',
            ],
            distilledInputSource: {
              id: 'successful-asset-directory',
              kind: 'video',
              purpose: 'successful-asset',
              title: '成功素材沉淀 / 成品视频',
              sourcePath: join(mixDir, 'videos', '001-video.mp4'),
              tags: ['successful-asset', 'prompt-distilled', 'video', 'run-trace'],
              relatedPromptDraftId: 'prompt-draft-real-video',
              relatedSceneCardIds: ['scene-directory-001'],
              extractedText: [
                '素材状态：已通过审核。',
                '质量原因：真实早餐桌自然光，动作节奏清楚。',
                '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
                '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
                '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
              ].join('\n'),
            },
            distilledPromptDraft: {
              id: 'successful-asset-directory-draft',
              title: '成功素材 Prompt：成品视频',
              purpose: 'video',
              status: 'confirmed',
              workflowRunId: 'workflow-run-real',
              inputSourceIds: ['successful-asset-directory'],
              sceneCardIds: ['scene-directory-001'],
              model: 'local-successful-asset-distiller',
              content: [
                '素材状态：已通过审核。',
                '质量原因：真实早餐桌自然光，动作节奏清楚。',
                '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
                '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
                '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
              ].join('\n'),
            },
          },
        },
        trace: {
          expectedWorkflowRunId: 'workflow-run-real',
          actualWorkflowRunRefs: [
            { source: 'reference-log', workflowRunId: 'workflow-run-real' },
            { source: 'video-breakdown-log', workflowRunId: 'workflow-run-real' },
            { source: 'video-script-log', workflowRunId: 'workflow-run-real' },
            { source: 'video-generation-log', workflowRunId: 'workflow-run-real' },
            { source: 'mix-package', workflowRunId: 'workflow-run-real' },
            { source: 'platform-draft', workflowRunId: 'workflow-run-real' },
          ],
        },
      },
    });

    assert.equal(report.summary.failed, 0);
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-files')?.actualFiles.includes('manifest.csv'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-trace')?.actualTraceFields.includes('promptDraftId'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualAssetKinds.includes('video'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualAssetKinds.includes('overlay'));
    assert.ok(report.sections.greenScreen.checks.find((check) => check.id === 'green-screen-card-fields')?.status === 'pass');
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.some((filePath) => filePath.endsWith('001-video.mp4')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.some((filePath) => filePath.endsWith('001-overlay-title.svg')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-approved-assets')?.actualReviewStatuses.includes('approved'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-import-guide')?.actualGuideTerms.includes('第三方混剪软件'));
    assert.equal(report.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import')?.status, 'pass');
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import')?.evidenceFiles.some((filePath) => filePath.endsWith('capcut-import-screenshot.txt')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-files')?.actualFiles.includes('platform-copy.txt'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-trace')?.actualTraceFields.includes('sourceLogId'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('publishChecklist'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('publishBoundary'));
    assert.equal(report.sections.mediaCost.actual.estimatedCost, 15);
    assert.deepEqual(report.sections.trace.uniqueWorkflowRunIds, ['workflow-run-real']);
  });
});

test('v2 业务验收脚本可从工作区数据自动生成验收输入', async () => {
  await withWorkspace(async (workspacePath) => {
    const dataDir = join(workspacePath, '.content-studio');
    const mixDir = join(dataDir, 'assets', 'mix-packages', '真实混剪包');
    const platformDir = join(dataDir, 'assets', 'platform-drafts', '真实平台草稿包');
    await mkdir(join(mixDir, 'videos'), { recursive: true });
    await mkdir(join(mixDir, 'overlays'), { recursive: true });
    await mkdir(platformDir, { recursive: true });
    await writeFile(join(mixDir, 'videos', '001-video.mp4'), 'fake video fixture', 'utf-8');
    await writeFile(join(mixDir, 'overlays', '001-overlay-title.svg'), '<svg></svg>', 'utf-8');
    await writeFile(join(mixDir, 'manifest.csv'), '"kind","title","packagedPath"\n"video","成品视频","videos/001-video.mp4"\n"overlay","标题卡","overlays/001-overlay-title.svg"\n', 'utf-8');
    await writeFile(join(mixDir, 'import-guide.md'), [
      '# 工作区混剪包导入说明',
      '第三方混剪软件中先导入 videos/ 主体素材，再导入 overlays/ 绿幕文案图。',
      '使用 manifest.csv 对照素材用途、提示词来源和人工审核状态。',
    ].join('\n'), 'utf-8');
    await writeFile(join(mixDir, 'manifest.json'), JSON.stringify({
      schema: 'buguai.mix-package.v1',
      workflowRunId: 'workflow-run-workspace',
      assets: [{
        id: 'imported:workspace-video:0',
        kind: 'video',
        title: '成品视频',
        sourceId: 'input-source-workspace-video',
        promptDraftId: 'prompt-draft-workspace-video',
        packagedPath: join(mixDir, 'videos', '001-video.mp4'),
      }, {
        id: 'overlay:overlay-card-workspace-title',
        kind: 'overlay',
        title: '标题卡',
        reviewStatus: 'approved',
        reviewId: 'asset-review-workspace-overlay',
        sourceType: 'overlay-card',
        sourceId: 'overlay-card-workspace-title',
        promptDraftId: 'prompt-draft-workspace-video',
        durationSeconds: 3,
        packagedPath: join(mixDir, 'overlays', '001-overlay-title.svg'),
      }],
    }, null, 2), 'utf-8');
    await writeFile(join(platformDir, 'draft.md'), '# 工作区平台草稿\n\n这是一份从真实工作区读取的正文草稿，包含足够内容供发布前复核。', 'utf-8');
    await writeFile(join(platformDir, 'platform-copy.txt'), '标题：工作区平台草稿\n\n正文复制稿。\n\n发布前补充：封面图、摘要和配图位置需要人工确认。', 'utf-8');
    await writeFile(join(platformDir, 'format-guide.md'), '# 公众号 格式指南\n\n- 发布前复核事实引用、功效表达、绝对化词和医疗化暗示。', 'utf-8');
    await writeFile(join(platformDir, 'publish-checklist.md'), '# 工作区平台草稿 发布前检查\n\n## 检查项\n\n- [ ] WARNING：确认事实来源。\n\n## 交付边界\n\n- 本包只用于人工复制到目标平台前检查，不包含平台账号、授权或自动发布任务。\n- 发布前需要人工确认平台格式、封面、配图、引用事实和高风险表达。', 'utf-8');
    await writeFile(join(platformDir, 'manifest.json'), JSON.stringify({
      schema: 'buguai.platform-draft.v1',
      workflowRunId: 'workflow-run-workspace',
      promptDraftId: 'prompt-draft-workspace-article',
      sourceLogId: 'article-log-workspace',
      files: {
        markdown: 'draft.md',
        platformCopy: 'platform-copy.txt',
        formatGuide: 'format-guide.md',
        checklist: 'publish-checklist.md',
        metadata: 'metadata.json',
      },
    }, null, 2), 'utf-8');
    await writeFile(join(dataDir, 'brand-knowledge-bases.json'), JSON.stringify([{
      id: 'brand-kb-workspace',
      title: '工作区品牌知识库',
      productFacts: ['便携条包。', '办公室抽屉备用。'],
      coreSellingPoints: ['降低准备门槛。'],
      complianceBoundaries: ['不承诺治疗。', '不写绝对化收益。'],
      sceneSeeds: ['办公室抽屉里备用'],
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'ip-knowledge-bases.json'), JSON.stringify([{
      id: 'ip-kb-workspace',
      title: '工作区 IP 知识库',
      layers: {
        identity: '身份',
        values: '价值观',
        language: '语言',
        methodology: '方法论',
        materials: '素材',
        engine: '创作引擎',
      },
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'scene-cards.json'), JSON.stringify([{
      id: 'scene-workspace-1',
      title: '通勤包侧袋备用',
      audience: '通勤用户',
      painPoint: '出门后容易忘记准备。',
      usageScene: '通勤包侧袋',
      visualComposition: '真实包内俯拍，自然光。',
      sellingPoint: '便携条包方便随手取用。',
      imageMaterialSuggestion: '生成手机实拍包内场景图。',
      videoMaterialSuggestion: '生成 15 秒手部取用动作素材。',
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'input-sources.json'), JSON.stringify([{
      id: 'input-source-product-brief-workspace',
      workspacePath,
      kind: 'manual-note',
      status: 'converted',
      purpose: 'product-brief',
      title: '工作区产品资料',
      tags: ['产品资料', 'brief'],
      summary: '工作区产品资料',
      extractedText: [
        '产品名称：工作区便携条包',
        '卖点：小条包装，适合早餐后和办公室抽屉备用。',
        '规格：每盒 20 条，每条独立包装。',
        '适用场景：早餐后、办公室抽屉、通勤包侧袋。',
        '禁用表达：不承诺治疗，不写绝对化收益。',
      ].join('\n'),
      artifactRefs: [],
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'input-source-sku-workspace',
      workspacePath,
      kind: 'sku-table',
      status: 'converted',
      purpose: 'product-brief',
      title: '工作区 SKU 表',
      tags: ['SKU', '规格'],
      summary: '工作区 SKU 表',
      extractedText: [
        'SKU,规格,价格,适用场景',
        'trial-10,10 条装,49,首次尝试',
        'family-30,30 条装,129,家庭常备',
      ].join('\n'),
      artifactRefs: [],
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'input-source-feedback-workspace',
      workspacePath,
      kind: 'manual-note',
      status: 'converted',
      purpose: 'user-feedback',
      title: '工作区评论和客服问题',
      tags: ['评论', '客服问题'],
      summary: '工作区评论和客服问题',
      extractedText: [
        '用户：价格有点贵，值不值，怕是智商税。',
        '差评：买了以后不知道怎么用，步骤太复杂，坚持几天就忘记。',
        '客服：孩子和老人能不能吃，敏感人群有没有禁忌？',
        '评论：早餐后放办公室抽屉和通勤包里会不会更方便？',
      ].join('\n'),
      artifactRefs: [],
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'successful-asset-source-workspace',
      workspacePath,
      workflowRunId: 'workflow-run-workspace',
      kind: 'video',
      status: 'converted',
      purpose: 'successful-asset',
      title: '成功素材沉淀 / 成品视频',
      sourcePath: join(mixDir, 'videos', '001-video.mp4'),
      tags: ['successful-asset', 'prompt-distilled', 'video', 'run-trace'],
      summary: '已通过素材反向沉淀 Prompt：成品视频',
      extractedText: [
        '素材状态：已通过审核。',
        '质量原因：真实早餐桌自然光，动作节奏清楚。',
        '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
        '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
        '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
      ].join('\n'),
      artifactRefs: [],
      relatedPromptDraftId: 'video-prompt-original-workspace',
      relatedSceneCardIds: ['scene-workspace-001'],
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'generation-logs.json'), JSON.stringify([{
      id: 'reference-log-workspace',
      workflowRunId: 'workflow-run-workspace',
      kind: 'reference-reverse',
      status: 'succeeded',
      input: {
        referenceSources: [
          { id: 'reference-a', title: '素材 A', kind: 'image', purpose: 'reference', sourcePath: 'asset-a' },
          { id: 'reference-video-a', title: '素材 B', kind: 'video', purpose: 'reference', sourcePath: 'asset-b' },
        ],
      },
      output: {
        analysis: {
          composition: '构图',
          lighting: '光线',
          negativePrompt: '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
          risks: ['需要人工复核素材授权、商标和肖像风险。'],
          qualityChecklist: ['主体一致', '来源可追溯', '无竞品可识别元素'],
        },
      },
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'video-breakdown-workspace',
      workflowRunId: 'workflow-run-workspace',
      kind: 'video-breakdown',
      status: 'succeeded',
      input: {
        sourceType: 'file',
        source: 'reference-video-a.mp4',
        dimensions: ['开头钩子', '字幕口播'],
      },
      output: {
        summary: '工作区视频拆解',
        dimensions: ['开头钩子', '字幕口播'],
        segments: [{
          timeRange: '0-3s',
          hook: '先抛真实痛点',
          visual: '早餐桌自然光',
          voiceover: '坚持难在每天顺手。',
          subtitle: '顺手完成',
          rhythm: '快速钩子',
          reusablePoint: '痛点后接低门槛动作',
        }],
        reusableFormula: ['痛点 -> 低门槛动作 -> 合规边界'],
        risks: [{ level: 'warning', message: '不照搬原视频画面，复核授权和合规表达。' }],
      },
      updatedAt: '2026-05-22T01:00:01.000Z',
    }, {
      id: 'video-script-workspace',
      workflowRunId: 'workflow-run-workspace',
      kind: 'video-script',
      status: 'succeeded',
      input: {
        breakdownLogId: 'video-breakdown-workspace',
      },
      output: {
        title: '工作区视频脚本',
        script: '镜头 1：真实痛点。\n镜头 2：低门槛动作。',
        storyboard: [{
          shot: 1,
          duration: '0-3s',
          visual: '自然光早餐桌。',
          voiceover: '先讲真实痛点。',
          subtitle: '顺手完成',
          rhythm: '快速钩子',
        }],
        videoPrompt: '15 秒 9:16 手机实拍视频，不复制原视频。',
        publishCheck: [
          { level: 'warning', message: '复核素材授权。' },
          { level: 'risk', message: '避免照搬参考视频。' },
        ],
      },
      updatedAt: '2026-05-22T01:00:02.000Z',
    }, {
      id: 'video-log-workspace',
      workflowRunId: 'workflow-run-workspace',
      kind: 'video',
      status: 'succeeded',
      model: 'test-video-model',
      output: {
        model: 'test-video-model',
        durationSeconds: 10,
        costEstimate: {
          currency: 'CNY',
          durationSeconds: 10,
          source: 'provider-response',
          unitPrice: 1.5,
          estimatedCost: 15,
        },
      },
      updatedAt: '2026-05-22T01:00:03.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'mix-packages.json'), JSON.stringify([{
      id: 'mix-package-workspace',
      packageDir: mixDir,
      manifestPath: join(mixDir, 'manifest.json'),
      manifestCsvPath: join(mixDir, 'manifest.csv'),
      importGuidePath: join(mixDir, 'import-guide.md'),
      workflowRunId: 'workflow-run-workspace',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'asset-reviews.json'), JSON.stringify([{
      id: 'asset-review-workspace-video',
      assetKey: 'imported:workspace-video:0',
      kind: 'video',
      sourceType: 'input-source',
      sourceId: 'input-source-workspace-video',
      path: join(mixDir, 'videos', '001-video.mp4'),
      title: '成品视频',
      status: 'approved',
      tags: ['第三方生成', '成品视频'],
      reviewedAt: '2026-05-22T01:00:00.000Z',
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'asset-review-workspace-overlay',
      assetKey: 'overlay:overlay-card-workspace-title',
      kind: 'overlay',
      sourceType: 'overlay-card',
      sourceId: 'overlay-card-workspace-title',
      path: join(mixDir, 'overlays', '001-overlay-title.svg'),
      title: '标题卡',
      status: 'approved',
      tags: ['绿幕文案图', '标题卡'],
      reviewedAt: '2026-05-22T01:00:04.000Z',
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'overlay-cards.json'), JSON.stringify([{
      id: 'overlay-card-workspace-title',
      workspacePath,
      promptDraftId: 'prompt-draft-workspace-video',
      type: 'title',
      title: '标题卡',
      text: '早餐后顺手一次',
      durationSeconds: 3,
      status: 'exported',
      assetPath: join(mixDir, 'overlays', '001-overlay-title.svg'),
      background: 'green-screen',
      aspectRatio: '9:16',
      tags: ['绿幕文案图', '标题卡'],
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }, {
      id: 'overlay-card-workspace-selling-point',
      workspacePath,
      promptDraftId: 'prompt-draft-workspace-video',
      type: 'selling-point',
      title: '卖点卡',
      text: '抽屉包里都能放',
      durationSeconds: 4,
      status: 'exported',
      assetPath: join(mixDir, 'overlays', '002-overlay-selling-point.svg'),
      background: 'green-screen',
      aspectRatio: '9:16',
      tags: ['绿幕文案图', '卖点卡'],
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }, {
      id: 'overlay-card-workspace-cta',
      workspacePath,
      promptDraftId: 'prompt-draft-workspace-video',
      type: 'cta',
      title: '行动卡',
      text: '先从顺手一次开始',
      durationSeconds: 4,
      status: 'exported',
      assetPath: join(mixDir, 'overlays', '003-overlay-cta.svg'),
      background: 'green-screen',
      aspectRatio: '9:16',
      tags: ['绿幕文案图', '行动卡'],
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'prompt-drafts.json'), JSON.stringify([{
      id: 'successful-asset-draft-workspace',
      workspacePath,
      workflowRunId: 'workflow-run-workspace',
      title: '成功素材 Prompt：成品视频',
      purpose: 'video',
      status: 'confirmed',
      userIntent: '复用通过审核素材「成品视频」的成功经验。',
      inputSourceIds: ['successful-asset-source-workspace'],
      sceneCardIds: ['scene-workspace-001'],
      copyCount: 0,
      model: 'local-successful-asset-distiller',
      versions: [{
        id: 'successful-asset-version-workspace',
        version: 1,
        content: [
          '素材状态：已通过审核。',
          '质量原因：真实早餐桌自然光，动作节奏清楚。',
          '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
          '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
          '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
        ].join('\n'),
        createdAt: '2026-05-22T01:00:04.000Z',
      }],
      activeVersionId: 'successful-asset-version-workspace',
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'workflow-runs.json'), JSON.stringify([{
      id: 'workflow-run-workspace',
      workspacePath,
      workflowDefinitionId: 'video-material-package',
      workflowKey: 'video-material-package',
      workflowVersion: '1.0.0',
      title: '工作区视频素材包历史运行',
      status: 'succeeded',
      summary: '已从通过素材沉淀 Prompt 草稿。',
      inputs: {},
      steps: [],
      artifactRefs: [
        'imported:workspace-video:0',
        'input-source:successful-asset-source-workspace',
        'prompt-draft:successful-asset-draft-workspace',
      ],
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'platform-drafts.json'), JSON.stringify([{
      id: 'platform-draft-workspace',
      packageDir: platformDir,
      manifestPath: join(platformDir, 'manifest.json'),
      workflowRunId: 'workflow-run-workspace',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');

    const acceptanceInput = await loadWorkspaceAcceptanceInput(workspacePath);
    const report = await buildBusinessAcceptanceReport({}, {
      providerReport: await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false }),
      acceptanceInput,
      mode: 'workspace',
    });

    assert.equal(report.mode, 'workspace');
    assert.equal(report.summary.failed, 0, JSON.stringify(
      Object.values(report.sections)
        .flatMap((section) => section.checks ?? [])
        .filter((check) => check.status === 'fail')
        .map((check) => ({ id: check.id, title: check.title, details: check.details })),
      null,
      2,
    ));
    assert.equal(report.sections.brand.sample, '工作区品牌知识库');
    assert.equal(report.sections.productBrief.productName, '工作区便携条包');
    assert.ok(report.sections.productBrief.checks.find((check) => check.id === 'product-brief-downstream-ready')?.status === 'pass');
    assert.ok(report.sections.productBrief.checks.find((check) => check.id === 'product-brief-prompt-plan')?.status === 'pass');
    assert.ok(report.sections.productBrief.checks.find((check) => check.id === 'product-brief-prompt-trace')?.status === 'pass');
    assert.ok(report.sections.productBrief.promptPlan.some((item) => item.type === 'main-image' && item.skuTrace.includes('trial-10')));
    assert.ok(report.sections.feedback.clusters.some((cluster) => cluster.key === 'price-trust'));
    assert.ok(report.sections.feedback.checks.find((check) => check.id === 'feedback-matrix')?.status === 'pass');
    assert.ok(report.sections.feedback.checks.find((check) => check.id === 'feedback-title-directions')?.status === 'pass');
    assert.ok(report.sections.feedback.checks.find((check) => check.id === 'feedback-objection-responses')?.status === 'pass');
    assert.ok(report.sections.feedback.objectionResponses.some((item) => item.boundary.includes('人工复核')));
    assert.equal(report.sections.videoBreakdown.sources[0], 'reference-video-a.mp4');
    assert.ok(report.sections.videoBreakdown.checks.find((check) => check.id === 'video-breakdown-boundary')?.status === 'pass');
    assert.ok(report.sections.videoBreakdown.checks.find((check) => check.id === 'video-script-trace')?.status === 'pass');
    assert.deepEqual(report.sections.greenScreen.actualTypes.sort(), ['cta', 'selling-point', 'title']);
    assert.ok(report.sections.greenScreen.checks.find((check) => check.id === 'green-screen-card-approved')?.status === 'pass');
    assert.equal(report.sections.successfulAsset.asset.reviewStatus, 'approved');
    assert.ok(report.sections.successfulAsset.checks.find((check) => check.id === 'successful-asset-prompt-draft')?.status === 'pass');
    assert.ok(report.sections.successfulAsset.checks.find((check) => check.id === 'successful-asset-workflow-trace')?.status === 'pass');
    assert.equal(report.sections.reference.sampleSources[0], '素材 A');
    assert.deepEqual(report.sections.reference.sourceKinds.sort(), ['image', 'video']);
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-trace')?.actualTraceFields.includes('workflowRunId'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualAssetKinds.includes('video'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualAssetKinds.includes('overlay'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.some((filePath) => filePath.endsWith('001-video.mp4')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.some((filePath) => filePath.endsWith('001-overlay-title.svg')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-approved-assets')?.actualReviewStatuses.includes('approved'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-import-guide')?.actualGuideTerms.includes('manifest.csv'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-trace')?.actualTraceFields.includes('promptDraftId'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('platformCopy'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('publishBoundary'));
    assert.equal(report.sections.mediaCost.actual.estimatedCost, 15);
    assert.ok(report.sections.trace.checks.find((check) => check.id === 'workflow-run-trace-coverage')?.status === 'pass');
    assert.deepEqual(report.sections.trace.uniqueWorkflowRunIds, ['workflow-run-workspace']);
  });
});

test('品牌和 IP 知识库可以从知识引用生成并落盘', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const brandStore = new BrandKnowledgeBaseStore(text);
    const ipStore = new IpKnowledgeBaseStore(text);

    const brand = await brandStore.generate({
      workspacePath,
      title: '唯他瑞品牌知识库',
      citations: [citation],
    });
    const ip = await ipStore.generate({
      workspacePath,
      title: '嘉文老师 IP 知识库',
      citations: [{
        knowledgeBaseId: 'ip-demo',
        sectionId: 'profile-1',
        title: '嘉文老师 / 人物档案',
        sectionType: 'profile',
        excerpt: '身份锚定、价值观立场、语言风格、判断方法、内容素材、创作引擎。',
      }],
    });

    assert.equal(brand.status, 'ready');
    assert.equal(ip.status, 'ready');
    assert.equal(brand.brandVoice.includes('真实'), true);
    assert.equal(ip.layers.identity.includes('身份'), true);
    assert.ok((await brandStore.list(workspacePath)).length >= 1);
    assert.ok((await ipStore.list(workspacePath)).length >= 1);
  });
});

test('内容制造批次审核阶段会把候选素材导向审核入库和回炉', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    const knowledgeMaps = new ContentKnowledgeMapStore();

    const reviewTasks = new ContentReviewTaskStore();
    const assetReviews = new AssetReviewStore();
    const logs = new GenerationLogStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const batches = new ContentBatchApplicationService(
      new ContentBatchStore(),
      inputSources,
      knowledgeMaps,
      reviewTasks,
      assetReviews,
      logs,
      promptDrafts,
    );

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '便携条包产品资料',
      text: '产品：便携条包。场景：早餐后、办公室抽屉、通勤包。',
    });
    const assetPath = join(workspacePath, 'candidate.png');
    await writeFile(assetPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
    const log = await logs.append({
      workspacePath,
      kind: 'image',
      status: 'succeeded',
      title: '早餐桌候选图',
      summary: '本批制造阶段生成的待审候选图。',
      model: 'test-image-model',
      artifactRefs: [assetPath],
      input: { sourceId: source.id },
      output: { prompt: '早餐桌自然光，便携条包主体清晰。' },
    });

    const built = await batches.build({
      workspacePath,
      title: '便携条包短视频制造批次',
      objective: '把产品资料和候选素材推进到审核入库。',
    });
    const projectedReview = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'review',
    });
    const reviewStage = projectedReview.stageRuns.find((stage) => stage.stageId === 'review');
    assert.ok(reviewStage, '应存在审核阶段');
    assert.ok(reviewStage.gateResults.some((gate) => gate.title === '制造产物待送审'));
    assert.equal(
      [...reviewStage.inputRefs, ...reviewStage.outputRefs, ...reviewStage.agentRunRefs].some((ref) => /\bblocked\b/.test(ref.summary)),
      false,
    );
    assert.ok(reviewStage.recoveryTasks.some((task) =>
      task.targetModule === 'assets' &&
      task.title === '打开素材库审核候选素材' &&
      task.message.includes('通过并入库') &&
      task.message.includes('回炉重做') &&
      task.sourceRef?.id === log.id
    ));

    await assetReviews.review({
      workspacePath,
      assetKey: `generated:${log.id}:0:${assetPath}`,
      kind: 'image',
      sourceType: 'generation-log',
      sourceId: log.id,
      path: assetPath,
      title: 'candidate.png',
      status: 'pending',
      note: '等待审核人员判断是否通过并入库。',
      tags: ['批次审核'],
    });
    const pendingReview = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'review',
    });
    const pendingStage = pendingReview.stageRuns.find((stage) => stage.stageId === 'review');
    assert.ok(pendingStage?.gateResults.some((gate) => gate.title === '候选素材待审核'));
    assert.ok(pendingStage?.recoveryTasks.some((task) =>
      task.title === '审核 candidate.png' &&
      task.targetModule === 'assets' &&
      task.message.includes('通过并入库')
    ));

    await assetReviews.review({
      workspacePath,
      assetKey: `generated:${log.id}:0:${assetPath}`,
      kind: 'image',
      sourceType: 'generation-log',
      sourceId: log.id,
      path: assetPath,
      title: 'candidate.png',
      status: 'rejected',
      note: '主体不清晰，需要回炉重做。',
      tags: ['批次审核', '回炉'],
    });
    const rejectedReview = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'review',
    });
    const rejectedStage = rejectedReview.stageRuns.find((stage) => stage.stageId === 'review');
    assert.equal(rejectedStage?.status, 'blocked');
    assert.ok(rejectedStage?.gateResults.some((gate) => gate.title === '有素材被驳回'));
    assert.ok(rejectedStage?.recoveryTasks.some((task) =>
      task.title === '回炉 candidate.png' &&
      task.targetModule === 'assets' &&
      task.message.includes('回炉重做')
    ));
  });
});

test('内容制造批次制造阶段会把视频 Prompt 草稿投影为制造产物', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    const knowledgeMaps = new ContentKnowledgeMapStore();

    const reviewTasks = new ContentReviewTaskStore();
    const assetReviews = new AssetReviewStore();
    const logs = new GenerationLogStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const batches = new ContentBatchApplicationService(
      new ContentBatchStore(),
      inputSources,
      knowledgeMaps,
      reviewTasks,
      assetReviews,
      logs,
      promptDrafts,
    );

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '便携风扇产品资料',
      text: '便携风扇，桌面和通勤场景，强调轻量和安全边界。',
    });
    const draft = await promptDrafts.createFromContent({
      workspacePath,
      title: '便携风扇短视频制造单',
      purpose: 'video',
      userIntent: '把批次制造阶段转成可复制到第三方视频平台的视频 Prompt。',
      inputSourceIds: [source.id],
      content: [
        '# 便携风扇短视频制造单',
        '只生成可审核的视频 Prompt，不伪造成片成功。',
        '成片需要由用户手动导入并进入素材审核。',
      ].join('\n'),
      note: 'functional test',
      model: 'local-content-batch-manufacturing-handoff',
      status: 'confirmed',
    });

    const built = await batches.build({
      workspacePath,
      title: '便携风扇短视频制造批次',
      objective: '把产品资料推进到视频 Prompt 制造交接。',
    });
    const projected = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'manufacturing',
    });
    const manufacturingStage = projected.stageRuns.find((stage) => stage.stageId === 'manufacturing');
    assert.ok(manufacturingStage, '应存在制造阶段');
    assert.equal(manufacturingStage.status, 'approved');
    assert.ok(manufacturingStage.outputRefs.some((ref) =>
      ref.kind === 'prompt-draft' &&
      ref.id === draft.id &&
      ref.targetModule === 'video-prompt' &&
      ref.summary.includes('便携风扇短视频制造单')
    ));
    assert.ok(manufacturingStage.gateResults.some((gate) => gate.status === 'passed'));
    assert.equal(manufacturingStage.recoveryTasks.length, 0);
  });
});

test('Ontology v2 制造能力会把数据成熟度投影成档位和可执行工具池', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const assetReviews = new AssetReviewStore();
    const now = '2026-06-01T00:00:00.000Z';

    const productSource = await inputSources.register({
      workspacePath,
      kind: 'sku-table',
      purpose: 'product-brief',
      title: '商品库存映射表',
      text: 'sku,price,stock\nfan-a,99,120',
      tags: ['CSV', '映射'],
    });
    await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '评论与搜索词',
      text: '办公室低噪、通勤轻便、担心续航。',
    });

    const sparsePlan = buildManufacturingPlanProjection({
      inputSources: await inputSources.list(workspacePath),
      promptDrafts: [],
      logs: [],
      assetReviews: [],
    });
    assert.equal(sparsePlan.blockedTiers.includes('premium'), true);
    assert.equal(sparsePlan.blockedTiers.includes('standard'), true);
    assert.equal(sparsePlan.capabilities.find((item) => item.id === 'video-prompt')?.status, 'ready');
    assert.equal(sparsePlan.capabilities.find((item) => item.id === 'image-generation')?.status, 'ready');
    assert.equal(sparsePlan.capabilities.find((item) => item.id === 'mix-export')?.status, 'needs-input');

    const draft = await promptDrafts.createFromContent({
      workspacePath,
      title: '便携风扇视频制造单',
      purpose: 'video',
      userIntent: '生成可复制到第三方平台的视频 Prompt。',
      inputSourceIds: [productSource.id],
      content: '只生成视频 Prompt，不创建外部视频任务。',
      note: 'functional test',
      model: 'local-content-batch-manufacturing-handoff',
      status: 'confirmed',
    });
    const approvedAsset = await assetReviews.review({
      workspacePath,
      assetKey: 'approved:image:fan-a',
      kind: 'image',
      sourceType: 'manual',
      path: join(workspacePath, 'approved-fan.png'),
      title: '低噪桌面图',
      status: 'approved',
      note: '已通过素材审核。',
      tags: ['content-batch'],
    });
    const knowledgeMap = {
      id: 'manufacturing-map-1',
      workspacePath,
      title: '便携风扇内容知识地图',
      status: 'ready',
      syncStatus: 'local-only',
      teamSync: {
        backend: 'bugu',
        status: 'local-only',
        message: '本机草稿。',
      },
      sourceInputSourceIds: [productSource.id],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [draft.id],
      sellingPoints: [{
        id: 'selling-low-noise',
        title: '低噪办公室使用',
        summary: '办公室低噪场景，适合桌面使用。',
        tags: ['低噪', '办公室'],
        sourceRefs: [`input-source:${productSource.id}`],
        evidenceRefs: ['evidence-low-noise'],
        materialStatus: 'approved',
        materialRefs: [approvedAsset.id],
        confidence: 86,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [{
        id: 'scenario-commute',
        title: '通勤包携带',
        summary: '轻便携带，适合通勤包。',
        tags: ['通勤', '轻便'],
        sourceRefs: [`input-source:${productSource.id}`],
        evidenceRefs: ['evidence-commute'],
        materialStatus: 'approved',
        materialRefs: [approvedAsset.id],
        confidence: 82,
        status: 'ready',
      }],
      evidence: [
        {
          id: 'evidence-low-noise',
          sourceType: 'input-source',
          sourceId: productSource.id,
          excerpt: '办公室低噪',
          confidence: 88,
        },
        {
          id: 'evidence-commute',
          sourceType: 'input-source',
          sourceId: productSource.id,
          excerpt: '通勤轻便',
          confidence: 82,
        },
      ],
      constraints: ['不夸张续航。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 0,
        ipKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 1,
        evidenceCount: 2,
        gapCount: 0,
        readyPercent: 100,
      },
      createdAt: now,
      updatedAt: now,
    };
    const richPlan = buildManufacturingPlanProjection({
      inputSources: await inputSources.list(workspacePath),
      knowledgeMap,
      promptDrafts: await promptDrafts.list(workspacePath),
      logs: [],
      assetReviews: await assetReviews.list(workspacePath),
    });
    assert.equal(richPlan.materialCoveragePercent, 100);
    assert.equal(richPlan.evidenceCoveragePercent, 100);
    assert.equal(richPlan.readyPromptCount, 1);
    assert.equal(richPlan.approvedAssetCount, 1);
    assert.equal(richPlan.capabilities.find((item) => item.id === 'video-prompt')?.status, 'done');
    assert.equal(richPlan.capabilities.find((item) => item.id === 'mix-export')?.status, 'ready');
    assert.equal(richPlan.capabilities.find((item) => item.id === 'retouch')?.status, 'ready');
    assert.equal(richPlan.capabilities.find((item) => item.id === 'video-import')?.status, 'ready');
  });
});

test('Ontology v2 商品规划会为 SKU 表全量分配制造档位和推广波次', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    await inputSources.register({
      workspacePath,
      kind: 'sku-table',
      purpose: 'product-brief',
      title: '商品库存映射表',
      text: [
        'sku,title,price,stock',
        'fan-a,BreezeGo Air 标准版,99,120',
        'fan-b,BreezeGo Air Mini,59,0',
      ].join('\n'),
      tags: ['CSV', '映射'],
    });

    const plan = buildProductPlanProjection({
      inputSources: await inputSources.list(workspacePath),
      manufacturing: {
        recommendedTier: 'ai-quick',
        tierLabel: 'AI 快产',
        tierReason: '素材和证据不足，先按低投入排产。',
        blockedTiers: ['premium', 'standard', 'template'],
        capabilities: [],
        materialCoveragePercent: 0,
        evidenceCoveragePercent: 0,
        readyPromptCount: 0,
        approvedAssetCount: 0,
        manufacturingArtifactCount: 0,
      },
    });

    assert.equal(plan.mode, 'brand-full-coverage');
    assert.equal(plan.candidateCount, 2);
    assert.equal(plan.plannedCount, 2);
    assert.equal(plan.allCovered, true);
    assert.equal(plan.items.some((item) => item.skuId === 'fan-a'), true);
    assert.equal(plan.items.some((item) => item.skuId === 'fan-b'), true);
    assert.equal(plan.items.some((item) => item.inventoryScore === 0), true);
    assert.equal(plan.items.every((item) => item.manufacturingTier), true);
    assert.equal(plan.items.every((item) => item.wave === 'W1' || item.wave === 'W2' || item.wave === 'W3'), true);
    assert.ok(plan.bottleneckCount >= 1);
  });
});

test('Ontology v2 本地模型校验器会覆盖正例、边界、负例和人工确认例外', () => {
  const results = runOntologyV2HarnessCases();
  assert.equal(results.length, 4);
  assert.equal(results.every((result) => result.passed), true, JSON.stringify(results, null, 2));
  assert.ok(results.some((result) => result.kind === 'negative' && result.expectedOk === false && result.actualOk === false));
  assert.ok(results.some((result) => result.kind === 'exception' && result.actualOk === true));
});

test('内容制造批次调优阶段会要求投放表现和行动复盘', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    const knowledgeMaps = new ContentKnowledgeMapStore();
    const reviewTasks = new ContentReviewTaskStore();
    const assetReviews = new AssetReviewStore();
    const logs = new GenerationLogStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const batches = new ContentBatchApplicationService(
      new ContentBatchStore(),
      inputSources,
      knowledgeMaps,
      reviewTasks,
      assetReviews,
      logs,
      promptDrafts,
    );

    await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '便携风扇产品资料',
      text: '便携风扇，桌面和通勤场景，强调低噪与安全边界。',
    });

    const built = await batches.build({
      workspacePath,
      title: '便携风扇短视频制造批次',
      objective: '根据制造、审核和投放表现调优下一轮素材方向。',
    });
    const missingProjection = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'optimization',
    });
    const missingStage = missingProjection.stageRuns.find((stage) => stage.stageId === 'optimization');
    assert.ok(missingStage, '应存在调优阶段');
    assert.equal(missingStage.status, 'needs-human');
    assert.ok(missingStage.gateResults.some((gate) => gate.title === '缺投放表现'));
    assert.ok(missingStage.gateResults.some((gate) => gate.title === '缺运行复盘'));
    assert.ok(missingStage.recoveryTasks.some((task) =>
      task.title === '登记投放表现' &&
      task.targetModule === 'knowledge-inputs'
    ));
    assert.ok(missingStage.recoveryTasks.some((task) =>
      task.title === '写入运行复盘' &&
      task.targetModule === 'assets'
    ));

    const performanceSource = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '投放表现日报',
      text: 'CTR 3.2%，ROI 1.8，评论集中反馈桌面低噪和通勤便携。',
      tags: ['投放', 'ROI', 'CTR'],
    });
    const performanceProjection = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'optimization',
    });
    const performanceStage = performanceProjection.stageRuns.find((stage) => stage.stageId === 'optimization');
    assert.ok(performanceStage, '应存在调优阶段');
    assert.equal(performanceStage.gateResults.some((gate) => gate.title === '缺投放表现'), false);
    assert.ok(performanceStage.gateResults.some((gate) => gate.title === '缺运行复盘'));
    assert.ok(performanceStage.outputRefs.some((ref) =>
      ref.kind === 'input-source' &&
      ref.id === performanceSource.id &&
      ref.targetModule === 'knowledge-inputs'
    ));

    const reviewLog = await logs.append({
      workspacePath,
      kind: 'article',
      status: 'succeeded',
      title: '批次调优复盘',
      summary: '汇总投放表现、素材审核结果和评论信号，下一轮优先补桌面低噪镜头和通勤收纳镜头。',
      model: 'functional-run-review',
      input: { sourceIds: [performanceSource.id] },
      output: { nextSignals: ['桌面低噪镜头', '通勤收纳镜头'] },
    });
    const readyProjection = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'optimization',
    });
    const readyStage = readyProjection.stageRuns.find((stage) => stage.stageId === 'optimization');
    assert.ok(readyStage, '应存在调优阶段');
    assert.equal(readyStage.status, 'approved');
    assert.equal(readyStage.gateResults.some((gate) => gate.title === '缺运行复盘'), false);
    assert.ok(readyStage.outputRefs.some((ref) =>
      ref.kind === 'generation-log' &&
      ref.id === reviewLog.id &&
      ref.summary.includes('已生成') &&
      ref.targetModule === 'assets'
    ));
  });
});

test('内容制造批次复盘阶段会要求素材覆盖回写和成功素材沉淀', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    const knowledgeMaps = new ContentKnowledgeMapStore();

    const reviewTasks = new ContentReviewTaskStore();
    const assetReviews = new AssetReviewStore();
    const logs = new GenerationLogStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const batches = new ContentBatchApplicationService(
      new ContentBatchStore(),
      inputSources,
      knowledgeMaps,
      reviewTasks,
      assetReviews,
      logs,
      promptDrafts,
    );
    const now = '2026-06-01T00:00:00.000Z';

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '便携风扇产品资料',
      text: '便携风扇，桌面低噪和通勤收纳场景。',
    });
    const row = {
      id: 'row-feedback-1',
      title: '桌面低噪使用场景',
      summary: '办公室桌面低噪使用，产品主体清晰。',
      tags: ['桌面', '低噪', '办公室'],
      sourceRefs: [`input-source:${source.id}`],
      evidenceRefs: ['evidence-feedback-1'],
      materialStatus: 'missing',
      materialRefs: [],
      confidence: 88,
      status: 'ready',
    };
    const map = await knowledgeMaps.save({
      id: 'map-feedback-batch-1',
      workspacePath,
      title: '便携风扇内容知识地图',
      status: 'ready',
      syncStatus: 'local-only',
      teamSync: {
        backend: 'bugu',
        status: 'local-only',
        message: '本机草稿。',
      },
      sourceInputSourceIds: [source.id],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [row],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-feedback-1',
        sourceType: 'input-source',
        sourceId: source.id,
        sourceTitle: source.title,
        claim: '便携风扇适合办公室桌面低噪使用。',
        excerpt: '桌面低噪和通勤收纳场景。',
        status: 'ready',
      }],
      constraints: ['不承诺绝对静音。'],
      gaps: [],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 0,
        ipKnowledgeBaseCount: 0,
        skuRowCount: 0,
        competitorObservationCount: 0,
        assetReviewCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });
    const assetPath = join(workspacePath, 'office-desk-fan.mp4');
    await writeFile(assetPath, TEST_VIDEO);
    const approvedAsset = await assetReviews.review({
      workspacePath,
      assetKey: `imported:${source.id}:0:${assetPath}`,
      kind: 'video',
      sourceType: 'input-source',
      sourceId: source.id,
      path: assetPath,
      title: '办公室桌面低噪实拍',
      status: 'approved',
      note: '覆盖办公室桌面低噪使用场景，可作为成功素材沉淀。',
      tags: ['桌面', '低噪', '办公室', '高转化'],
    });

    const built = await batches.build({
      workspacePath,
      contentKnowledgeMapId: map.id,
      title: '便携风扇短视频制造批次',
      objective: '把已通过素材回写知识地图，并沉淀下一批可复用 Prompt。',
    });
    const missingProjection = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'feedback',
    });
    const missingStage = missingProjection.stageRuns.find((stage) => stage.stageId === 'feedback');
    assert.ok(missingStage, '应存在复盘阶段');
    assert.equal(missingStage.status, 'needs-human');
    assert.ok(missingStage.gateResults.some((gate) => gate.title === '素材覆盖待回写'));
    assert.ok(missingStage.gateResults.some((gate) => gate.title === '成功素材待沉淀'));
    assert.ok(missingStage.recoveryTasks.some((task) =>
      task.title === '回写素材覆盖' &&
      task.targetModule === 'knowledge-map' &&
      task.sourceRef?.id === approvedAsset.id
    ));
    assert.ok(missingStage.recoveryTasks.some((task) =>
      task.title === '沉淀成功素材 Prompt' &&
      task.targetModule === 'assets' &&
      task.sourceRef?.id === approvedAsset.id
    ));

    await knowledgeMaps.update({
      ...map,
      sellingPoints: [{
        ...row,
        materialStatus: 'approved',
        materialRefs: [approvedAsset.id],
        performanceTags: ['高转化'],
      }],
      coverage: {
        ...map.coverage,
        assetReviewCount: 1,
      },
    });
    const distilled = await promptDrafts.createFromContent({
      workspacePath,
      contentKnowledgeMapId: map.id,
      contentKnowledgeMapTitle: map.title,
      coverageRowIds: [row.id],
      sourceRefs: [`content-knowledge-map:${map.id}`, `asset-review:${approvedAsset.id}`],
      title: '办公室桌面低噪成功素材 Prompt',
      purpose: 'video',
      userIntent: '把已通过素材沉淀为下一批可复用的视频 Prompt。',
      inputSourceIds: [source.id],
      content: '办公室桌面低噪使用场景，产品主体清晰，口播克制，不承诺绝对静音。',
      note: 'functional test',
      model: 'local-successful-asset-distiller',
      status: 'materialized',
    });
    const readyProjection = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'feedback',
    });
    const readyStage = readyProjection.stageRuns.find((stage) => stage.stageId === 'feedback');
    assert.ok(readyStage, '应存在复盘阶段');
    assert.equal(readyStage.status, 'approved');
    assert.equal(readyStage.gateResults.some((gate) => gate.title === '素材覆盖待回写'), false);
    assert.equal(readyStage.gateResults.some((gate) => gate.title === '成功素材待沉淀'), false);
    assert.ok(readyStage.outputRefs.some((ref) =>
      ref.kind === 'prompt-draft' &&
      ref.id === distilled.id &&
      ref.summary.includes('已沉淀') &&
      !/confirmed|materialized/.test(ref.summary)
    ));
    assert.ok(readyStage.outputRefs.some((ref) =>
      ref.kind === 'asset-review' &&
      ref.id === approvedAsset.id &&
      ref.summary.includes('已通过并入库')
    ));
  });
});

test('内容制造批次审核阶段会把第三方成品视频排入素材审核', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    const knowledgeMaps = new ContentKnowledgeMapStore();

    const reviewTasks = new ContentReviewTaskStore();
    const assetReviews = new AssetReviewStore();
    const logs = new GenerationLogStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const batches = new ContentBatchApplicationService(
      new ContentBatchStore(),
      inputSources,
      knowledgeMaps,
      reviewTasks,
      assetReviews,
      logs,
      promptDrafts,
    );

    const productSource = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '便携风扇产品资料',
      text: '便携风扇，桌面和通勤场景，强调轻量和安全边界。',
    });
    const draft = await promptDrafts.createFromContent({
      workspacePath,
      title: '便携风扇短视频制造单',
      purpose: 'video',
      userIntent: '复制到第三方平台生成成品视频。',
      inputSourceIds: [productSource.id],
      content: '只生成可审核的视频 Prompt，不伪造成片成功。',
      status: 'confirmed',
    });
    const videoPath = join(workspacePath, 'third-party-finished-video.mp4');
    await writeFile(videoPath, TEST_VIDEO);
    const finishedVideo = await inputSources.importFile(workspacePath, videoPath, 'successful-asset', {
      relatedPromptDraftId: draft.id,
      tags: ['第三方生成', '成品视频'],
    });

    const built = await batches.build({
      workspacePath,
      title: '便携风扇短视频制造批次',
      objective: '把第三方成品视频推进到人工素材审核。',
    });
    const projected = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'review',
    });
    const reviewStage = projected.stageRuns.find((stage) => stage.stageId === 'review');
    assert.ok(reviewStage?.gateResults.some((gate) => gate.title === '成品视频待审核'));
    assert.ok(reviewStage?.recoveryTasks.some((task) =>
      task.targetModule === 'assets' &&
      task.title.includes(finishedVideo.title) &&
      task.message.includes('通过并入库')
    ));

    const assetKey = `imported:${finishedVideo.id}:0:${finishedVideo.sourcePath}`;
    const queued = await assetReviews.review({
      workspacePath,
      assetKey,
      kind: 'video',
      sourceType: 'input-source',
      sourceId: finishedVideo.id,
      path: finishedVideo.sourcePath,
      title: finishedVideo.title,
      status: 'pending',
      note: '由批次审核阶段排队。',
      tags: ['content-batch', '批次审核', ...finishedVideo.tags],
    });
    assert.equal(queued.status, 'pending');
    assert.equal(queued.sourceId, finishedVideo.id);

    const pendingProjected = await batches.advanceStage({
      workspacePath,
      batchId: built.id,
      stageId: 'review',
    });
    const pendingStage = pendingProjected.stageRuns.find((stage) => stage.stageId === 'review');
    assert.ok(pendingStage?.gateResults.some((gate) => gate.title === '候选素材待审核'));
    assert.ok(pendingStage?.recoveryTasks.some((task) =>
      task.targetModule === 'assets' &&
      task.sourceRef?.id === queued.id
    ));
  });
});

test('Ontology v2 接入成熟度会从现有输入源投影 L0 L1 L2 与质量瓶颈', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    await inputSources.register({
      workspacePath,
      kind: 'sku-table',
      purpose: 'product-brief',
      title: '商品库存日导出 CSV',
      text: 'sku,price,stock\nfan-a,99,120',
      tags: ['CSV', 'T+1', '映射'],
    });
    await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '评论搜索词粘贴',
      text: '评论：办公室低噪，通勤轻便。',
      tags: ['评论', '搜索词'],
    });
    await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '投放表现日报',
      text: 'CTR 3.2%，ROI 1.8，预算 500。',
      tags: ['投放', 'ROI', 'CTR'],
    });

    const summary = buildIntakeMaturitySummary(await inputSources.list(workspacePath));
    assert.equal(summary.sourceCount, 6);
    assert.equal(summary.projections.some((source) => source.name === '商品与库存' && source.level === 'L1'), true);
    assert.equal(summary.projections.some((source) => source.name === '搜索与评论' && source.responsibility === 'self-serve'), true);
    assert.equal(summary.projections.some((source) => source.name === '投放与流量' && source.responsibility === 'implementation'), true);
    assert.equal(summary.projections.some((source) => source.name === '素材与证据' && source.coverage === 0 && source.health === 'bad'), true);
    assert.ok(summary.averageCoverage > 0 && summary.averageCoverage < 100);
    assert.ok(summary.bottleneckCount >= 1);
  });
});

test('内容制造批次摘要会使用 Ontology v2 接入成熟度和瓶颈恢复任务', async () => {
  await withWorkspace(async (workspacePath) => {
    const inputSources = new InputSourceStore();
    const knowledgeMaps = new ContentKnowledgeMapStore();

    const reviewTasks = new ContentReviewTaskStore();
    const assetReviews = new AssetReviewStore();
    const logs = new GenerationLogStore();
    const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
    const batches = new ContentBatchApplicationService(
      new ContentBatchStore(),
      inputSources,
      knowledgeMaps,
      reviewTasks,
      assetReviews,
      logs,
      promptDrafts,
    );

    await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '便携风扇产品资料',
      text: '产品名：便携风扇。卖点：低噪、轻便、安全边界。',
    });
    await inputSources.register({
      workspacePath,
      kind: 'image',
      purpose: 'reference',
      title: '参考素材包',
      sourcePath: join(workspacePath, 'reference.png'),
      summary: '只登记了图片原文件，待视觉理解。',
    });

    const projected = await batches.build({
      workspacePath,
      title: '便携风扇短视频制造批次',
      objective: '验证接入成熟度进入批次摘要。',
    });
    assert.ok(projected.intakeSummary.maturity, '应包含接入成熟度摘要');
    assert.ok(projected.intakeSummary.productPlan, '应包含商品规划投影');
    assert.ok(projected.intakeSummary.manufacturing, '应包含制造能力投影');
    assert.equal(projected.intakeSummary.coveragePercent, projected.intakeSummary.maturity.averageCoverage);
    assert.equal(projected.intakeSummary.maturity.sourceCount, 6);
    assert.ok(projected.intakeSummary.maturity.bottleneckCount >= 1);
    assert.equal(projected.intakeSummary.productPlan.mode, 'brand-full-coverage');
    assert.equal(projected.intakeSummary.productPlan.allCovered, true);
    assert.equal(projected.intakeSummary.productPlan.plannedCount, projected.intakeSummary.productPlan.candidateCount);
    assert.equal(projected.intakeSummary.manufacturing.capabilities.some((capability) =>
      capability.id === 'video-prompt' &&
      capability.targetModule === 'video-prompt'
    ), true);
    const selectionStage = projected.stageRuns.find((stage) => stage.stageId === 'selection');
    assert.ok(selectionStage?.outputRefs.some((ref) =>
      ref.kind === 'product-plan' &&
      ref.targetModule === 'content-batch'
    ));
    const manufacturingStage = projected.stageRuns.find((stage) => stage.stageId === 'manufacturing');
    assert.ok(manufacturingStage?.outputRefs.some((ref) =>
      ref.kind === 'manufacturing-plan' &&
      ref.targetModule === 'content-batch'
    ));
    assert.ok(projected.intakeSummary.missingInputs.some((task) =>
      task.title.includes('投放与流量') ||
      task.title.includes('搜索与评论') ||
      task.title.includes('平台与品牌规则')
    ));
    assert.equal(projected.intakeSummary.missingInputs.some((task) => /L0|L1|L2/.test(`${task.message} ${task.recoveryAction}`)), false);
    assert.ok(projected.intakeSummary.missingInputs.some((task) => /手动补齐|文件映射|自动接入/.test(task.message)));

    const ontologyBatch = projectContentBatchToOntologyV2(projected);
    assert.equal(ontologyBatch.stageRuns.length, 9);
    assert.equal(ontologyBatch.stageRuns.some((stage) => stage.stageId === 'manufacturing'), true);
    const contractReport = buildOntologyV2BatchContractReport(projected);
    assert.equal(contractReport.ok, true, JSON.stringify(contractReport.issues, null, 2));
    assert.equal(contractReport.stageReports.some((stage) =>
      stage.stageId === 'selection' &&
      stage.primaryObject === 'ProductPlan / SelectionScore' &&
      stage.outputCoverage > 0
    ), true);
    assert.equal(contractReport.stageReports.some((stage) =>
      stage.stageId === 'manufacturing' &&
      stage.primaryObject === 'VideoManufacturingJob' &&
      stage.outputCoverage > 0
    ), true);
  });
});

test('图片素材回炉会生成 PromptDraft 新版本并让新日志关联原审核记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const oldAssetPath = join(workspacePath, 'old-rejected.png');
      await writeFile(oldAssetPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const logs = new GenerationLogStore();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
      const assetReviews = new AssetReviewStore();
      const source = await inputSources.register({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '回炉产品资料',
        text: '产品事实：便携条包。回炉要求：保持真实早餐桌自然光。',
      });
      const draft = await promptDrafts.createFromContent({
        workspacePath,
        title: '回炉图片 Prompt',
        purpose: 'image',
        userIntent: '重做一张更真实的小红书图片。',
        inputSourceIds: [source.id],
        sceneCardIds: ['scene-rework-001'],
        workflowRunId: 'workflow-run-rework',
        content: '原始 Prompt：早餐桌自然光，产品主体清晰。',
        status: 'confirmed',
      });
      const review = await assetReviews.review({
        workspacePath,
        workflowRunId: 'workflow-run-rework',
        assetKey: `generated:old-log:0:${oldAssetPath}`,
        kind: 'image',
        sourceType: 'generation-log',
        sourceId: 'old-log',
        path: oldAssetPath,
        title: 'old-rejected.png',
        status: 'rejected',
        note: '构图太像广告棚拍，回炉为真实手机实拍。',
        tags: ['回炉'],
      });
      const updatedDraft = await promptDrafts.update({
        workspacePath,
        draftId: draft.id,
        content: [
          '基于驳回素材回炉重做，保留事实来源。',
          `回炉原因：${review.note}`,
          '原始 Prompt：早餐桌自然光，产品主体清晰。',
        ].join('\n'),
        note: `素材回炉：${review.note}`,
        status: 'draft',
      });
      const provider = new MediaProvider({
        async readView() {
          return {
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: true,
            imageModels: ['test-image-model'],
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      }, logs);
      const result = await provider.generateImage({
        workspacePath,
        workflowRunId: 'workflow-run-rework',
        reworkSource: {
          assetKey: review.assetKey,
          kind: 'image',
          sourceType: 'generation-log',
          sourceId: 'old-log',
          path: oldAssetPath,
          title: review.title,
          reviewId: review.id,
          reviewNote: review.note,
          promptDraftId: draft.id,
          workflowRunId: 'workflow-run-rework',
        },
        productImageRefs: [],
        referenceImageRefs: [oldAssetPath],
        prompt: updatedDraft.versions.at(-1).content,
        promptMode: 'free',
        generationMode: 'smart',
        template: '回炉图',
        watermark: false,
        promptPackId: 'prompt-pack-rework',
        sceneCardIds: ['scene-rework-001'],
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'test-image-model', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      });

      assert.equal(result.status, 'succeeded');
      const [storedDraft] = await promptDrafts.list(workspacePath);
      assert.equal(storedDraft.versions.length, 2);
      assert.match(storedDraft.versions.at(-1).content, /回炉原因/);
      const [storedLog] = await logs.list(workspacePath);
      assert.equal(storedLog.id, result.logId);
      assert.equal(storedLog.workflowRunId, 'workflow-run-rework');
      assert.equal(storedLog.reworkSource.reviewId, review.id);
      assert.equal(storedLog.reworkSource.assetKey, review.assetKey);
      assert.equal(storedLog.reworkSource.promptDraftId, draft.id);
      assert.equal(storedLog.sceneCardIds[0], 'scene-rework-001');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('素材拆解会复用模型设置的 OpenAI Responses 多模态配置生成 PromptDraft', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            output: [{
              content: [{
                type: 'output_text',
                text: JSON.stringify({
                  composition: '4:5 竖版，产品位于右下三分之一，左上保留标题区。',
                  lighting: '早餐桌自然光，轻微手持感。',
                  textArea: '左上角留白用于短标题，底部不放大段文字。',
                  style: '小红书 UGC 手机实拍，真实台面和手部动作。',
                  reusableElements: ['三分构图', '自然光', '标题留白'],
                  replacementRules: ['替换为本方便携条包，不复用竞品包装'],
                  generationControls: ['4:5 竖版', '自然光', '产品标签清晰'],
                  risks: ['不要复制竞品包装和 Logo'],
                  prompt: '4:5，小红书 UGC 手机实拍，早餐桌自然光，手拿便携条包，产品在右下三分之一，左上留白。',
                  negativePrompt: '竞品 Logo、医疗化承诺、广告棚拍、过度磨皮。',
                  qualityChecklist: ['主体一致', '左上留白', '无竞品元素'],
                }),
              }],
            }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const previousEndpoint = process.env.CONTENT_STUDIO_VISION_ENDPOINT;
    const previousKey = process.env.CONTENT_STUDIO_VISION_API_KEY;
    try {
      delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      delete process.env.CONTENT_STUDIO_VISION_API_KEY;
      const referencePath = join(workspacePath, 'reference.png');
      await writeFile(referencePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const logs = new GenerationLogStore();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
      const modelConfig = {
        async readView() {
          return {
            apiEndpoint: 'https://api.anthropic.com',
            safeStorageAvailable: false,
            hasApiKey: false,
            textProvider: 'http-text-generation',
            textProtocol: 'openai-chat',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textApiKeyStatus: 'missing',
            textModel: 'gpt-4o-mini',
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-vision-model',
            hasImageApiKey: true,
            imageApiKeyStatus: 'available',
            imageModels: ['test-image-model'],
            videoProvider: 'disabled',
            videoApiEndpoint: '',
            hasVideoApiKey: false,
            videoApiKeyStatus: 'missing',
            videoModel: 'test-video-model',
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      };
      const service = new ReferenceReverseService(logs, inputSources, promptDrafts, modelConfig);
      const reference = await inputSources.register({
        workspacePath,
        kind: 'image',
        purpose: 'reference',
        title: '小红书参考图',
        sourcePath: referencePath,
        summary: '参考图：早餐桌自然光。',
      });
      const product = await inputSources.register({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '产品资料',
        text: '便携条包，早餐后使用，表达降低坚持门槛。',
      });

      const result = await service.generate({
        workspacePath,
        referenceSourceIds: [reference.id],
        productSourceIds: [product.id],
        userIntent: '反推小红书种草图 Prompt。',
      });

      assert.equal(capturedRequest.model, 'test-vision-model');
      assert.equal(capturedRequest.input[0].content.some((part) => part.type === 'input_image'), true);
      assert.equal(capturedRequest.input[0].content.some((part) => part.type === 'input_text' && part.text.includes('小红书参考图')), true);
      assert.equal(result.analysis.composition.includes('右下三分之一'), true);
      assert.equal(result.promptDraft.purpose, 'image');
      assert.match(result.promptDraft.versions[0].content, /小红书 UGC 手机实拍/);
      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs[0].kind, 'reference-reverse');
      assert.equal(storedLogs[0].status, 'succeeded');
      assert.equal(existsSync(storedLogs[0].artifactRefs[0]), true);
    } finally {
      if (previousEndpoint === undefined) delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      else process.env.CONTENT_STUDIO_VISION_ENDPOINT = previousEndpoint;
      if (previousKey === undefined) delete process.env.CONTENT_STUDIO_VISION_API_KEY;
      else process.env.CONTENT_STUDIO_VISION_API_KEY = previousKey;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('素材拆解支持 Chat Completions 和 Gemini 多模态协议', async () => {
  await withWorkspace(async (workspacePath) => {
    const referencePath = join(workspacePath, 'reference.png');
    await writeFile(referencePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
    const runCase = async ({ protocol, path, responseBody, assertRequest }) => {
      let capturedRequest;
      const server = createServer((request, response) => {
        if (request.url === path) {
          let body = '';
          request.on('data', (chunk) => { body += chunk.toString(); });
          request.on('end', () => {
            capturedRequest = JSON.parse(body);
            response.setHeader('content-type', 'application/json');
            response.end(JSON.stringify(responseBody));
          });
          return;
        }
        response.statusCode = 404;
        response.end('not found');
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const previousEndpoint = process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      const previousKey = process.env.CONTENT_STUDIO_VISION_API_KEY;
      try {
        delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
        delete process.env.CONTENT_STUDIO_VISION_API_KEY;
        const baseUrl = `http://127.0.0.1:${server.address().port}`;
        const logs = new GenerationLogStore();
        const inputSources = new InputSourceStore();
        const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
        const service = new ReferenceReverseService(logs, inputSources, promptDrafts, {
          async readView() {
            return {
              apiEndpoint: 'https://api.anthropic.com',
              safeStorageAvailable: false,
              hasApiKey: false,
              textProvider: 'http-text-generation',
              textProtocol: 'openai-chat',
              textApiEndpoint: 'https://api.anthropic.com',
              hasTextApiKey: false,
              textApiKeyStatus: 'missing',
              textModel: 'gpt-4o-mini',
              imageProvider: 'openai-responses',
              imageProtocol: protocol,
              imageApiEndpoint: baseUrl,
              imageOuterModel: 'test-vision-model',
              hasImageApiKey: true,
              imageApiKeyStatus: 'available',
              imageModels: ['test-image-model'],
              videoProvider: 'disabled',
              videoApiEndpoint: '',
              hasVideoApiKey: false,
              videoApiKeyStatus: 'missing',
              videoModel: 'test-video-model',
            };
          },
          async getImageApiKey() { return 'test-image-key'; },
        });
        const reference = await inputSources.register({
          workspacePath,
          kind: 'image',
          purpose: 'reference',
          title: `${protocol} 参考图`,
          sourcePath: referencePath,
          summary: '参考图。',
        });
        const product = await inputSources.register({
          workspacePath,
          kind: 'manual-note',
          purpose: 'product-brief',
          title: `${protocol} 产品资料`,
          text: '便携条包，早餐后使用。',
        });

        const result = await service.generate({
          workspacePath,
          referenceSourceIds: [reference.id],
          productSourceIds: [product.id],
          userIntent: '生成小红书种草图 Prompt。',
        });

        assertRequest(capturedRequest);
        assert.equal(result.analysis.prompt.includes('早餐桌自然光'), true);
      } finally {
        if (previousEndpoint === undefined) delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
        else process.env.CONTENT_STUDIO_VISION_ENDPOINT = previousEndpoint;
        if (previousKey === undefined) delete process.env.CONTENT_STUDIO_VISION_API_KEY;
        else process.env.CONTENT_STUDIO_VISION_API_KEY = previousKey;
        await new Promise((resolve) => server.close(resolve));
      }
    };
    const analysis = {
      composition: '4:5，右下角产品主体，左上留白。',
      lighting: '自然光，真实桌面。',
      textArea: '左上标题区。',
      style: 'UGC 手机实拍。',
      reusableElements: ['自然光', '留白', '手持感'],
      replacementRules: ['替换为本方产品'],
      generationControls: ['4:5 画幅', '产品清晰'],
      risks: ['不要复制竞品包装'],
      prompt: '4:5，早餐桌自然光，右下产品主体，左上留白，UGC 手机实拍。',
      negativePrompt: '竞品包装、Logo、医疗化承诺。',
      qualityChecklist: ['主体一致', '留白明确', '无竞品元素'],
    };

    await runCase({
      protocol: 'openai-chat-data-uri',
      path: '/v1/chat/completions',
      responseBody: { choices: [{ message: { role: 'assistant', content: JSON.stringify(analysis) } }] },
      assertRequest(request) {
        assert.equal(request.model, 'test-vision-model');
        assert.equal(request.messages[0].content.some((part) => part.type === 'image_url'), true);
        assert.equal(request.response_format.type, 'json_object');
      },
    });

    await runCase({
      protocol: 'gemini-generate-content',
      path: '/v1beta/models/test-vision-model:generateContent',
      responseBody: { candidates: [{ content: { parts: [{ text: JSON.stringify(analysis) }] } }] },
      assertRequest(request) {
        assert.equal(request.contents[0].parts.some((part) => part.inlineData), true);
        assert.equal(request.generationConfig.responseMimeType, 'application/json');
      },
    });
  });
});

test('素材拆解缺少设置页多模态配置时引导用户配置模型', async () => {
  await withWorkspace(async (workspacePath) => {
    const previousEndpoint = process.env.CONTENT_STUDIO_VISION_ENDPOINT;
    const previousKey = process.env.CONTENT_STUDIO_VISION_API_KEY;
    try {
      delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      delete process.env.CONTENT_STUDIO_VISION_API_KEY;
      const referencePath = join(workspacePath, 'reference.png');
      await writeFile(referencePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const logs = new GenerationLogStore();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
      const service = new ReferenceReverseService(logs, inputSources, promptDrafts, {
        async readView() {
          return {
            apiEndpoint: 'https://api.anthropic.com',
            safeStorageAvailable: false,
            hasApiKey: false,
            textProvider: 'http-text-generation',
            textProtocol: 'openai-chat',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textApiKeyStatus: 'missing',
            textModel: 'gpt-4o-mini',
            imageProvider: 'disabled',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: '',
            imageOuterModel: 'test-vision-model',
            hasImageApiKey: false,
            imageApiKeyStatus: 'missing',
            imageModels: ['test-image-model'],
            videoProvider: 'disabled',
            videoApiEndpoint: '',
            hasVideoApiKey: false,
            videoApiKeyStatus: 'missing',
            videoModel: 'test-video-model',
          };
        },
        async getImageApiKey() { return undefined; },
      });
      const reference = await inputSources.register({
        workspacePath,
        kind: 'image',
        purpose: 'reference',
        title: '参考图',
        sourcePath: referencePath,
        summary: '参考图。',
      });
      const product = await inputSources.register({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '产品资料',
        text: '便携条包。',
      });

      await assert.rejects(
        () => service.generate({
          workspacePath,
          referenceSourceIds: [reference.id],
          productSourceIds: [product.id],
          userIntent: '生成 Prompt。',
        }),
        /设置 - 模型中保存图片 API Key、端点和模型/,
      );
      const [log] = await logs.list(workspacePath);
      assert.equal(log.status, 'blocked');
      assert.equal(log.error, 'VISION_PROVIDER_NOT_CONFIGURED');
    } finally {
      if (previousEndpoint === undefined) delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      else process.env.CONTENT_STUDIO_VISION_ENDPOINT = previousEndpoint;
      if (previousKey === undefined) delete process.env.CONTENT_STUDIO_VISION_API_KEY;
      else process.env.CONTENT_STUDIO_VISION_API_KEY = previousKey;
    }
  });
});

test('素材拆解遇到 429 时不自动重试并提示用户手动重试', async () => {
  await withWorkspace(async (workspacePath) => {
    let requestCount = 0;
    const server = createServer((request, response) => {
      if (request.url === '/v1beta/models/test-vision-model:generateContent') {
        requestCount += 1;
        request.resume();
        response.statusCode = 429;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          error: {
            message: '当前分组上游负载已饱和，请稍后再试 (request id: test-request)',
          },
        }));
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const previousEndpoint = process.env.CONTENT_STUDIO_VISION_ENDPOINT;
    const previousKey = process.env.CONTENT_STUDIO_VISION_API_KEY;
    try {
      delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      delete process.env.CONTENT_STUDIO_VISION_API_KEY;
      const referencePath = join(workspacePath, 'reference.png');
      await writeFile(referencePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const logs = new GenerationLogStore();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
      const service = new ReferenceReverseService(logs, inputSources, promptDrafts, {
        async readView() {
          return {
            apiEndpoint: 'https://api.anthropic.com',
            safeStorageAvailable: false,
            hasApiKey: false,
            textProvider: 'http-text-generation',
            textProtocol: 'openai-chat',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textApiKeyStatus: 'missing',
            textModel: 'gpt-4o-mini',
            imageProvider: 'openai-responses',
            imageProtocol: 'gemini-generate-content',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-vision-model',
            hasImageApiKey: true,
            imageApiKeyStatus: 'available',
            imageModels: ['test-image-model'],
            videoProvider: 'disabled',
            videoApiEndpoint: '',
            hasVideoApiKey: false,
            videoApiKeyStatus: 'missing',
            videoModel: 'test-video-model',
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      });
      const reference = await inputSources.register({
        workspacePath,
        kind: 'image',
        purpose: 'reference',
        title: '参考图',
        sourcePath: referencePath,
        summary: '参考图。',
      });
      const product = await inputSources.register({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '产品资料',
        text: '便携条包。',
      });

      await assert.rejects(
        () => service.generate({
          workspacePath,
          referenceSourceIds: [reference.id],
          productSourceIds: [product.id],
          userIntent: '生成 Prompt。',
        }),
        /未自动重试以避免重复消耗模型额度/,
      );
      assert.equal(requestCount, 1);
      const [log] = await logs.list(workspacePath);
      assert.equal(log.status, 'failed');
      assert.match(log.error, /未自动重试/);
    } finally {
      if (previousEndpoint === undefined) delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      else process.env.CONTENT_STUDIO_VISION_ENDPOINT = previousEndpoint;
      if (previousKey === undefined) delete process.env.CONTENT_STUDIO_VISION_API_KEY;
      else process.env.CONTENT_STUDIO_VISION_API_KEY = previousKey;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('知识库可以导入、结构化并参与搜索引用', async () => {
  await withWorkspace(async (workspacePath) => {
    const source = join(workspacePath, '产品知识库.md');
    await writeFile(source, ['# 产品', '清晰成分，便携条包，适合早餐后使用。', '# 异议处理', '回应价格时强调配方、规格和使用场景。'].join('\n'), 'utf-8');
    const store = new KnowledgeBaseStore();
    const imported = await store.importFile(workspacePath, source);
    assert.equal(imported.source, 'workspace');
    assert.ok(imported.sections.length >= 2);

    const results = await store.search({ workspacePath, query: '价格 使用场景', baseType: 'product-kb', sectionType: 'all' });
    assert.ok(results.length >= 1);
    assert.ok(results.some((result) => result.section.content.includes('价格')));
  });
});

test('文字模型支持 Anthropic 兼容 HTTP 网关生成 JSON', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/messages') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            type: 'message',
            role: 'assistant',
            model: capturedRequest.model,
            content: [{ type: 'text', text: '{"ok":true,"name":"兼容网关"}' }],
            stop_reason: 'end_turn',
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const modelConfig = {
        async readView() {
          return {
            apiEndpoint: baseUrl,
            hasApiKey: true,
            textProvider: 'http-text-generation',
            textProtocol: 'anthropic-messages',
            textApiEndpoint: baseUrl,
            hasTextApiKey: true,
            textModel: 'gemini-3-pro-preview',
          };
        },
        async getTextApiKey() { return 'test-text-key'; },
      };
      const text = new TextGenerationService(modelConfig);
      const result = await text.generateJson({
        workspacePath,
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"compat_test"}',
        schema: {
          type: 'object',
          required: ['ok', 'name'],
          properties: { ok: { type: 'boolean' }, name: { type: 'string' } },
        },
      });

      assert.deepEqual(result.value, { ok: true, name: '兼容网关' });
      assert.equal(result.model, 'gemini-3-pro-preview');
      assert.equal(result.protocol, 'anthropic-messages');
      assert.equal(capturedRequest.model, 'gemini-3-pro-preview');
      assert.match(capturedRequest.system, /JSON Schema/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('文字模型运行时通过 Lime App Server capability 生成 JSON', async () => {
  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-text-app-server-'));
    const appServerPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
    const capturePath = join(tempDir, 'capture.json');
    try {
      await writeFakeAppServerBinary(appServerPath, [
        {
          type: 'message.delta',
          payload: {
            text: '{"ok":true,"name":"App Server JSON"}',
            model: 'app-server-text-model',
          },
        },
        {
          type: 'artifact.snapshot',
          payload: {
            artifactId: 'text-json-artifact',
            artifactRef: 'text-json-artifact',
            title: 'Text JSON Artifact',
            kind: 'json',
            content: '{"ok":true,"name":"App Server JSON"}',
            model: 'app-server-text-model',
          },
        },
        {
          type: 'turn.completed',
          payload: {
            summary: '文字 JSON 已生成',
            model: 'app-server-text-model',
          },
        },
      ]);

      const modelConfig = {
        async readView() {
          return {
            textProtocol: 'openai-chat',
            textApiEndpoint: 'http://127.0.0.1:65535',
            textModel: 'app-server-text-model',
          };
        },
        async getTextApiKey() { return 'app-server-text-key'; },
      };

      await withEnv({
        APP_SERVER_RESOURCES_DIR: undefined,
        CONTENT_STUDIO_RESOURCES_DIR: undefined,
        APP_SERVER_BIN: appServerPath,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        FAKE_APP_SERVER_CAPTURE_PATH: capturePath,
      }, async () => {
        const appServer = new AppServerSidecarService();
        const text = new TextGenerationService(modelConfig, appServer);
        const result = await text.generateJson({
          workspacePath,
          systemPrompt: '只输出 JSON。',
          prompt: '{"task":"app_server_text"}',
          schema: { type: 'object', required: ['ok', 'name'], properties: { ok: { type: 'boolean' }, name: { type: 'string' } } },
        });

        assert.deepEqual(result.value, { ok: true, name: 'App Server JSON' });
        assert.equal(result.model, 'app-server-text-model');
        assert.equal(result.protocol, 'openai-chat');
        assert.equal(result.providerEvents?.some((event) => event.payload?.runtime === 'lime-agent-server'), true);
        assert.equal(result.providerEvents?.some((event) => event.payload?.capabilityId === 'content.text.generate'), true);

        const captured = JSON.parse(await readFile(capturePath, 'utf8'));
        assert.equal(captured.turnStart.runtimeOptions.capabilityId, 'content.text.generate');
        assert.equal(captured.turnStart.input.text, '{"task":"app_server_text"}');
        assert.equal(captured.turnStart.input.systemPrompt, '只输出 JSON。');
        assert.equal(captured.turnStart.input.responseKind, 'json');
        assert.deepEqual(captured.turnStart.runtimeOptions.metadata.selectedSkillSlugs, []);
        assert.equal(captured.turnStart.runtimeOptions.metadata.operation, 'generateJson');
        assert.equal(captured.turnStart.runtimeOptions.metadata.textModel, 'app-server-text-model');
        assert.equal(captured.turnStart.runtimeOptions.metadata.textProtocol, 'openai-chat');
        assert.equal(captured.sessionStart.businessObjectRef.kind, 'textGeneration');
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('文字模型支持 OpenAI Chat Completions 兼容协议生成 JSON', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/chat/completions') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: '{"ok":true,"name":"OpenAI 兼容"}' }, finish_reason: 'stop' }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const text = new TextGenerationService({
        async readView() {
          return {
            textProtocol: 'openai-chat',
            textApiEndpoint: baseUrl,
            textModel: 'gpt-compatible',
          };
        },
        async getTextApiKey() { return 'test-text-key'; },
      });
      const result = await text.generateJson({
        workspacePath,
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"compat_test"}',
        schema: { type: 'object', required: ['ok', 'name'], properties: { ok: { type: 'boolean' }, name: { type: 'string' } } },
      });
      assert.deepEqual(result.value, { ok: true, name: 'OpenAI 兼容' });
      assert.equal(result.protocol, 'openai-chat');
      assert.equal(capturedRequest.model, 'gpt-compatible');
      assert.equal(capturedRequest.response_format.type, 'json_object');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('文字模型支持 Gemini GenerateContent 原生协议生成 JSON', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1beta/models/gemini-test:generateContent') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"ok":true,"name":"Gemini 原生"}' }] } }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const text = new TextGenerationService({
        async readView() {
          return {
            textProtocol: 'gemini-generate-content',
            textApiEndpoint: baseUrl,
            textModel: 'gemini-test',
          };
        },
        async getTextApiKey() { return 'test-text-key'; },
      });
      const result = await text.generateJson({
        workspacePath,
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"compat_test"}',
        schema: { type: 'object', required: ['ok', 'name'], properties: { ok: { type: 'boolean' }, name: { type: 'string' } } },
      });
      assert.deepEqual(result.value, { ok: true, name: 'Gemini 原生' });
      assert.equal(result.protocol, 'gemini-generate-content');
      assert.equal(capturedRequest.generationConfig.responseMimeType, 'application/json');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('媒体 Provider 可以调用真实 HTTP 适配器并沉淀图片/视频产物', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedVideoRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
        return;
      }
      if (request.url === '/video') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedVideoRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            video_url: `http://127.0.0.1:${server.address().port}/video-file.mp4`,
            cost: 15,
            currency: 'CNY',
          }));
        });
        return;
      }
      if (request.url === '/video-file.mp4') {
        response.setHeader('content-type', 'video/mp4');
        response.end(TEST_VIDEO);
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            apiEndpoint: 'https://api.anthropic.com',
            hasApiKey: false,
            textProvider: 'http-text-generation',
            textProtocol: 'openai-chat',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textModel: 'gpt-4o-mini',
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: true,
            imageModels: ['test-image-model'],
            videoProvider: 'generic-http',
            videoApiEndpoint: `${baseUrl}/video`,
            hasVideoApiKey: true,
            videoModel: 'test-video-model',
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
        async getVideoApiKey() { return 'test-video-key'; },
      };
      const provider = new MediaProvider(modelConfig, logs);
      const image = await provider.generateImage({
        workspacePath,
        productImageRefs: [],
        referenceImageRefs: [],
        prompt: '生成测试图片',
        promptMode: 'preset',
        generationMode: 'smart',
        template: '场景图',
        watermark: false,
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'test-image-model', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      });
      assert.equal(image.status, 'succeeded');
      assert.equal(image.assetRefs.length, 1);
      assert.equal(existsSync(image.assetRefs[0]), true);

      const video = await provider.generateVideo({
        workspacePath,
        imageAssetRefs: image.assetRefs,
        videoAssetRefs: [],
        prompt: '生成测试视频',
        script: '测试脚本',
        citations: [citation],
        selectedSkillSlugs: ['video-script-writer'],
        params: { videoModel: 'test-video-model', aspectRatio: '4:5', durationSeconds: 10 },
      });
      assert.equal(video.status, 'succeeded');
      assert.equal(video.assetRefs.length, 1);
      assert.equal(existsSync(video.assetRefs[0]), true);
      assert.equal(capturedVideoRequest.duration_seconds, 10);
      assert.equal(video.billing.estimatedCost, 15);
      assert.equal(video.billing.unitPrice, 1.5);
      assert.equal(video.billing.source, 'provider-response');
      const videoLog = (await logs.list(workspacePath)).find((entry) => entry.kind === 'video');
      assert.equal(videoLog.output.model, 'test-video-model');
      assert.equal(videoLog.output.durationSeconds, 10);
      assert.equal(videoLog.output.costEstimate.estimatedCost, 15);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('媒体 Provider 运行时通过 Lime App Server capability 生成图片和视频', async () => {
  await withWorkspace(async (workspacePath) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'content-studio-media-app-server-'));
    const appServerPath = join(tempDir, process.platform === 'win32' ? 'app-server.exe' : 'app-server');
    const capturePath = join(tempDir, 'capture.json');
    const imageAssetPath = join(workspacePath, 'app-server-image.png');
    const videoAssetPath = join(workspacePath, 'app-server-video.mp4');
    try {
      await writeFile(imageAssetPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      await writeFile(videoAssetPath, TEST_VIDEO);
      await writeFakeAppServerBinary(appServerPath, {
        'content.image.generate': [
          {
            type: 'message.delta',
            payload: {
              status: 'succeeded',
              message: 'App Server 图片生成完成',
              assetRefs: [imageAssetPath],
              capabilityId: 'content.image.generate',
              model: 'app-server-image-model',
            },
          },
          {
            type: 'artifact.snapshot',
            payload: {
              artifactId: 'app-server-image-result',
              artifactRef: 'app-server-image-result',
              title: 'Image Result',
              kind: 'json',
              status: 'succeeded',
              message: 'App Server 图片生成完成',
              assetRefs: [imageAssetPath],
              capabilityId: 'content.image.generate',
              model: 'app-server-image-model',
            },
          },
          {
            type: 'turn.completed',
            payload: {
              status: 'succeeded',
              summary: 'App Server 图片生成完成',
              assetRefs: [imageAssetPath],
              capabilityId: 'content.image.generate',
              model: 'app-server-image-model',
            },
          },
        ],
        'content.video.generate': [
          {
            type: 'message.delta',
            payload: {
              status: 'succeeded',
              message: 'App Server 视频生成完成',
              assetRefs: [videoAssetPath],
              billing: { currency: 'CNY', durationSeconds: 8, unit: 'second', unitPrice: 2, estimatedCost: 16, source: 'provider-response' },
              capabilityId: 'content.video.generate',
              model: 'app-server-video-model',
            },
          },
          {
            type: 'artifact.snapshot',
            payload: {
              artifactId: 'app-server-video-result',
              artifactRef: 'app-server-video-result',
              title: 'Video Result',
              kind: 'json',
              status: 'succeeded',
              message: 'App Server 视频生成完成',
              assetRefs: [videoAssetPath],
              billing: { currency: 'CNY', durationSeconds: 8, unit: 'second', unitPrice: 2, estimatedCost: 16, source: 'provider-response' },
              capabilityId: 'content.video.generate',
              model: 'app-server-video-model',
            },
          },
          {
            type: 'turn.completed',
            payload: {
              status: 'succeeded',
              summary: 'App Server 视频生成完成',
              assetRefs: [videoAssetPath],
              billing: { currency: 'CNY', durationSeconds: 8, unit: 'second', unitPrice: 2, estimatedCost: 16, source: 'provider-response' },
              capabilityId: 'content.video.generate',
              model: 'app-server-video-model',
            },
          },
        ],
      });

      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: 'http://127.0.0.1:65535',
            imageOuterModel: 'app-server-image-outer-model',
            imageApiKeyStatus: 'available',
            imageModels: ['app-server-image-model'],
            videoProvider: 'generic-http',
            videoApiEndpoint: 'http://127.0.0.1:65535/video',
            videoApiKeyStatus: 'available',
            videoModel: 'app-server-video-model',
          };
        },
        async getImageApiKey() { return 'app-server-image-key'; },
        async getVideoApiKey() { return 'app-server-video-key'; },
      };

      await withEnv({
        APP_SERVER_RESOURCES_DIR: undefined,
        CONTENT_STUDIO_RESOURCES_DIR: undefined,
        APP_SERVER_BIN: appServerPath,
        CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE: '1',
        FAKE_APP_SERVER_CAPTURE_PATH: capturePath,
      }, async () => {
        const provider = new MediaProvider(modelConfig, logs, new AppServerSidecarService());
        const image = await provider.generateImage({
          workspacePath,
          productImageRefs: [],
          referenceImageRefs: [],
          prompt: '通过 App Server 生成图片',
          promptMode: 'preset',
          generationMode: 'smart',
          template: '场景图',
          watermark: false,
          citations: [citation],
          selectedSkillSlugs: ['ecommerce-image-prompt'],
          params: { textModel: 'fake', imageModel: 'app-server-image-model', videoModel: 'app-server-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
        });
        const video = await provider.generateVideo({
          workspacePath,
          imageAssetRefs: image.assetRefs,
          videoAssetRefs: [],
          prompt: '通过 App Server 生成视频',
          script: '测试脚本',
          citations: [citation],
          selectedSkillSlugs: ['video-script-writer'],
          params: { videoModel: 'app-server-video-model', aspectRatio: '4:5', durationSeconds: 8 },
        });

        assert.equal(image.status, 'succeeded');
        assert.deepEqual(image.assetRefs, [imageAssetPath]);
        assert.equal(video.status, 'succeeded');
        assert.deepEqual(video.assetRefs, [videoAssetPath]);
        assert.equal(video.billing.estimatedCost, 16);

        const storedLogs = await logs.list(workspacePath);
        const imageLog = storedLogs.find((entry) => entry.kind === 'image');
        const videoLog = storedLogs.find((entry) => entry.kind === 'video');
        assert.equal(imageLog.output.runtime, 'lime-agent-server');
        assert.equal(imageLog.output.capabilityId, 'content.image.generate');
        assert.equal(videoLog.output.runtime, 'lime-agent-server');
        assert.equal(videoLog.output.capabilityId, 'content.video.generate');

        const captured = JSON.parse(await readFile(capturePath, 'utf8'));
        assert.deepEqual(
          captured.turnStarts.map((turnStart) => turnStart.runtimeOptions.capabilityId),
          ['content.image.generate', 'content.video.generate'],
        );
        assert.match(captured.turnStarts[0].input.text, /图片生成器/);
        assert.match(captured.turnStarts[0].input.text, /核心提示词：通过 App Server 生成图片/);
        assert.equal(captured.turnStarts[0].input.request.prompt, '通过 App Server 生成图片');
        assert.match(captured.turnStarts[0].input.compiledImagePrompt, /图片生成器/);
        assert.match(captured.turnStarts[0].input.compiledImagePrompt, /核心提示词：通过 App Server 生成图片/);
        assert.equal(captured.turnStarts[1].input.text, '通过 App Server 生成视频');
        assert.equal(captured.turnStarts[1].input.request.params.durationSeconds, 8);
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});

test('媒体 Provider 支持 Chat Completions 图片 data URI 协议', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: { message: 'not implemented' } }));
        return;
      }
      if (request.url === '/v1/chat/completions') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
          choices: [{
            message: {
              role: 'assistant',
              content: `![image](data:image/png;base64,${ONE_PIXEL_PNG})`,
            },
            finish_reason: 'stop',
          }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-chat-data-uri',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'gemini-3-pro-preview',
            hasImageApiKey: true,
            imageModels: ['gemini-3-pro-image-preview'],
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      };
      const provider = new MediaProvider(modelConfig, logs);
      const image = await provider.generateImage({
        workspacePath,
        productImageRefs: [],
        referenceImageRefs: [],
        prompt: '生成一张兜底测试图',
        productionTaskId: 'task-sop-001',
        shotPromptId: 'shot-001',
        generationStage: 'test',
        consistencyRules: ['产品包装颜色和文字必须与产品图一致'],
        negativeConstraints: ['不要改变产品结构', '不要夸大功效'],
        promptMode: 'preset',
        generationMode: 'smart',
        template: '场景图',
        templateInputs: { productName: '测试产品', sceneType: '厨房餐厅' },
        watermark: false,
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'gemini-3-pro-image-preview', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      });

      assert.equal(image.status, 'succeeded');
      assert.equal(image.assetRefs.length, 1);
      assert.equal(existsSync(image.assetRefs[0]), true);
      assert.match(capturedRequest.messages[0].content, /模板参数/);
      assert.match(capturedRequest.messages[0].content, /产品名称: 测试产品/);
      assert.match(capturedRequest.messages[0].content, /场景选择: 厨房餐厅/);
      assert.match(capturedRequest.messages[0].content, /产品一致性规则/);
      assert.match(capturedRequest.messages[0].content, /产品包装颜色和文字必须与产品图一致/);
      assert.match(capturedRequest.messages[0].content, /负面约束/);
      assert.match(capturedRequest.messages[0].content, /不要改变产品结构/);
      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs[0].output.endpoint, 'openai-chat-data-uri');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('图片提示词支持 @ 点名某张输入图片作为重点参考', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const heroPath = join(workspacePath, 'hero.png');
      await writeFile(heroPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: true,
            imageModels: ['test-image-model'],
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      };
      const provider = new MediaProvider(modelConfig, logs);
      const image = await provider.generateImage({
        workspacePath,
        productImageRefs: [heroPath],
        referenceImageRefs: [],
        prompt: '重点参考 @hero.png 的构图，生成一张白底主图',
        promptMode: 'free',
        generationMode: 'smart',
        template: '自由模式',
        watermark: false,
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'test-image-model', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '1:1', resolution: '1k', quality: 'low' },
      });

      assert.equal(image.status, 'succeeded');
      const content = capturedRequest.input[0].content;
      assert.equal(content.some((part) => part.type === 'input_image'), true);
      assert.equal(content.some((part) => part.type === 'input_text' && part.text.includes('hero.png') && part.text.includes('用户 @ 点名重点参考')), true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('媒体 Provider 支持 Gemini GenerateContent 图片 inlineData 协议', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1beta/models/gemini-image-test:generateContent') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: ONE_PIXEL_PNG } }] } }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            imageProvider: 'openai-responses',
            imageProtocol: 'gemini-generate-content',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'unused',
            hasImageApiKey: true,
            imageModels: ['gemini-image-test'],
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      };
      const provider = new MediaProvider(modelConfig, logs);
      const image = await provider.generateImage({
        workspacePath,
        productImageRefs: [],
        referenceImageRefs: [],
        prompt: '生成一张 Gemini 协议测试图',
        promptMode: 'preset',
        generationMode: 'smart',
        template: '场景图',
        watermark: false,
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'gemini-image-test', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      });

      assert.equal(image.status, 'succeeded');
      assert.equal(image.assetRefs.length, 1);
      assert.equal(existsSync(image.assetRefs[0]), true);
      assert.deepEqual(capturedRequest.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs[0].output.endpoint, 'gemini-generate-content');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('视频拆解可以调用真实 Generic HTTP 理解 Provider 并写入日志', async () => {
  await withWorkspace(async (workspacePath) => {
    const server = createServer((request, response) => {
      if (request.url === '/understand') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          const payload = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            summary: `已拆解 ${payload.source_type} 参考视频`,
            dimensions: payload.dimensions,
            segments: [
              {
                timeRange: '0-3s',
                hook: '先抛早餐后难坚持的痛点',
                visual: '桌面上出现产品和早餐',
                voiceover: '很多人不是不知道要坚持，而是场景太麻烦',
                subtitle: '早餐后也能顺手完成',
                rhythm: '快速钩子',
                reusablePoint: '先讲坚持门槛，再展示解决方式',
              },
            ],
            reusableFormula: ['痛点 -> 顺手使用 -> 事实边界'],
            risks: [{ level: 'warning', message: '复刻时避免照搬原视频画面。' }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const logs = new GenerationLogStore();
      const endpoint = `http://127.0.0.1:${server.address().port}/understand`;
      const modelConfig = {
        async readView() {
          return {
            videoProvider: 'generic-http',
            videoApiEndpoint: endpoint,
            videoModel: 'test-video-understanding',
          };
        },
        async getVideoApiKey() { return 'test-video-key'; },
      };
      const videos = new VideoWorkflowService(logs, new FakeTextGenerationService(), modelConfig);
      const breakdown = await videos.analyze({
        workspacePath,
        sourceType: 'url',
        source: 'https://example.com/reference.mp4',
        dimensions: ['开头钩子', '字幕口播'],
        citations: [citation],
        selectedSkillSlugs: ['video-breakdown'],
        params: { textModel: 'fake-text-model' },
      });
      assert.equal(breakdown.segments.length, 1);
      assert.equal(breakdown.reusableFormula[0], '痛点 -> 顺手使用 -> 事实边界');

      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs[0].kind, 'video-breakdown');
      assert.equal(storedLogs[0].status, 'succeeded');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('爆款视频拆解支持 OpenAI 兼容视觉链路和 LLM 环境变量', async () => {
  await withWorkspace(async (workspacePath) => {
    const videoPath = join(workspacePath, 'reference.mp4');
    await writeFile(videoPath, TEST_VIDEO);
    const previousApiKey = process.env.LLM_API_KEY;
    const previousBaseUrl = process.env.LLM_BASE_URL;
    const previousVisualModel = process.env.VISUAL_MODEL;
    const previousTextModel = process.env.LLM_MODEL;
    const previousAuthPrefix = process.env.LLM_AUTH_PREFIX;
    const capturedRequests = [];
    const server = createServer((request, response) => {
      if (request.url === '/v1/chat/completions') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          const payload = JSON.parse(body);
          capturedRequests.push({
            authorization: request.headers.authorization,
            payload,
          });
          response.setHeader('content-type', 'application/json');
          if (payload.model === 'gemini-2.5-flash-test') {
            response.end(JSON.stringify({
              choices: [{
                message: {
                  role: 'assistant',
                  content: JSON.stringify({
                    characters: [{ id: '宝妈', voiceTraits: '亲切女声', threeViewPrompt: 'photorealistic mother character sheet' }],
                    scenes: [{ id: '厨房', environment: '明亮厨房台面', lighting: '自然窗光' }],
                    shots: [
                      { startSec: 0, endSec: 3, shotType: 'close_up', characterId: '宝妈', characterAction: '指向油污', sceneId: '厨房', cameraMovement: '固定机位', description: '台面油污特写', objects: ['油污'], voiceover: '你家台面真的干净吗？' },
                      { startSec: 3, endSec: 7, shotType: 'product_demo', characterId: '宝妈', characterAction: '喷涂产品', sceneId: '厨房', cameraMovement: '俯拍', description: '产品喷涂到油污上', objects: ['清洁喷雾'], voiceover: '喷一下等三秒。' },
                      { startSec: 7, endSec: 11, shotType: 'comparison', characterId: '宝妈', characterAction: '擦拭对比', sceneId: '厨房', cameraMovement: '固定机位', description: '前后对比展示', objects: ['抹布'], voiceover: '轻轻一擦就亮了。' },
                    ],
                  }),
                },
                finish_reason: 'stop',
              }],
            }));
            return;
          }
          response.end(JSON.stringify({
            choices: [{
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  contentTitle: '痛点提问 · 厨房油污快清洁',
                  hookType: { value: 'pain_point_question', confidence: 0.86, reasoning: '0秒口播提问台面是否干净，结合油污特写。' },
                  hookElements: [{ name: '痛点提问', description: '用台面干净问题制造停留。', timestampRange: '00:00-00:03' }],
                  emotionCurve: [
                    { timestampSec: 0, emotion: 'curiosity', intensity: 70 },
                    { timestampSec: 7, emotion: 'satisfaction', intensity: 82 },
                  ],
                  narrativeFramework: { value: 'PSP', confidence: 0.9, reasoning: '痛点、方案、证明依次出现。' },
                  narrativeStages: [
                    { name: '痛点', description: '油污特写和提问。', timeRange: '00:00-00:03', emotionShift: '平静到好奇' },
                    { name: '方案', description: '产品喷涂。', timeRange: '00:03-00:07', emotionShift: '好奇到信任' },
                    { name: '证明', description: '擦拭后对比。', timeRange: '00:07-00:11', emotionShift: '信任到满足' },
                  ],
                  pacing: { avgCutsPerSecond: 0.27, avgShotDurationSec: 3.7, wordsPerMinute: 160 },
                  timeline: [
                    { timestampSec: 0, label: '痛点提问', emotionLabel: 'curiosity', intensity: 7 },
                    { timestampSec: 7, label: '效果证明', emotionLabel: 'satisfaction', intensity: 8 },
                  ],
                  viralScores: {
                    hookStrength: { score: 7.2, reasoning: '开头问题明确。' },
                    narrativeTension: { score: 7.0, reasoning: 'PSP 完整。' },
                    pacingQuality: { score: 7.4, reasoning: '三镜头紧凑。' },
                    emotionDesign: { score: 7.1, reasoning: '从好奇到满足。' },
                    ctaEffectiveness: { score: 5.0, reasoning: '未出现强 CTA。' },
                  },
                }),
              },
              finish_reason: 'stop',
            }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      process.env.LLM_API_KEY = 'gptproto-test-key';
      process.env.LLM_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
      process.env.VISUAL_MODEL = 'gemini-2.5-flash-test';
      process.env.LLM_MODEL = 'gpt-4o-test';
      process.env.LLM_AUTH_PREFIX = '';

      const logs = new GenerationLogStore();
      const videos = new VideoWorkflowService(logs, new FakeTextGenerationService(), {
        async readView() {
          return {
            videoProvider: 'disabled',
            videoApiEndpoint: '',
            videoModel: '',
            textModel: 'gpt-4o-mini',
          };
        },
        async getVideoApiKey() { return undefined; },
      });
      const breakdown = await videos.analyze({
        workspacePath,
        sourceType: 'file',
        source: videoPath,
        dimensions: ['开头钩子', '镜头节奏'],
        citations: [citation],
        selectedSkillSlugs: ['video-breakdown'],
        params: { textModel: 'fake-text-model' },
      });

      assert.equal(capturedRequests.length, 2);
      assert.equal(capturedRequests[0].authorization, 'gptproto-test-key');
      assert.equal(capturedRequests[0].payload.model, 'gemini-2.5-flash-test');
      assert.equal(capturedRequests[1].payload.model, 'gpt-4o-test');
      assert.match(capturedRequests[0].payload.messages[0].content[0].image_url.url, /^data:video\/mp4;base64,/);
      assert.equal(breakdown.contentTitle, '痛点提问 · 厨房油污快清洁');
      assert.equal(breakdown.segments.length, 3);
      assert.equal(breakdown.resourceFramework.characters[0].name, '宝妈');
      assert.equal(breakdown.resourceFramework.scenes[0].name, '厨房');
      assert.equal(breakdown.referenceScore, 6.8);
      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs[0].status, 'succeeded');
      assert.match(storedLogs[0].model, /gemini-2\.5-flash-test \+ gpt-4o-test/);
    } finally {
      if (previousApiKey === undefined) delete process.env.LLM_API_KEY;
      else process.env.LLM_API_KEY = previousApiKey;
      if (previousBaseUrl === undefined) delete process.env.LLM_BASE_URL;
      else process.env.LLM_BASE_URL = previousBaseUrl;
      if (previousVisualModel === undefined) delete process.env.VISUAL_MODEL;
      else process.env.VISUAL_MODEL = previousVisualModel;
      if (previousTextModel === undefined) delete process.env.LLM_MODEL;
      else process.env.LLM_MODEL = previousTextModel;
      if (previousAuthPrefix === undefined) delete process.env.LLM_AUTH_PREFIX;
      else process.env.LLM_AUTH_PREFIX = previousAuthPrefix;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('视频脚本生成会按已拆解镜头时间轴严格映射并输出资源框架', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const breakdownLog = await logs.append({
      workspacePath,
      kind: 'video-breakdown',
      status: 'succeeded',
      title: '参考视频拆解',
      summary: '已拆出 4 个镜头。',
      model: 'gemini-2.5-flash + gpt-4o',
      input: { source: 'reference.mp4' },
      output: {
        summary: '已拆出 4 个镜头。',
        dimensions: ['镜头节奏'],
        contentTitle: '痛点提问 · 厨房清洁',
        durationSec: 14,
        segments: [
          { timeRange: '00:00-00:03', hook: '痛点', visual: '油污特写', voiceover: '油污擦不干净？', subtitle: '', rhythm: '快切', reusablePoint: '痛点提问', shotType: 'close_up', scene: '厨房', cameraMovement: '固定机位' },
          { timeRange: '00:03-00:06', hook: '方案', visual: '喷涂', voiceover: '喷上等一会。', subtitle: '', rhythm: '演示', reusablePoint: '产品介入', shotType: 'product_demo', scene: '厨房', cameraMovement: '俯拍' },
          { timeRange: '00:06-00:10', hook: '证明', visual: '擦拭', voiceover: '轻轻一擦。', subtitle: '', rhythm: '证明', reusablePoint: '效果证明', shotType: 'comparison', scene: '厨房', cameraMovement: '固定机位' },
          { timeRange: '00:10-00:14', hook: 'CTA', visual: '总结', voiceover: '适合每天用。', subtitle: '', rhythm: '收束', reusablePoint: '轻 CTA', shotType: 'talking_head', scene: '厨房', cameraMovement: '缓慢推进' },
        ],
        pacing: {
          avgCutsPerSecond: 0.28,
          avgShotDurationSec: 3.5,
          wordsPerMinute: 160,
          rhythm: [
            { timeRange: '00:00-00:03', shotType: 'close_up', intensity: 8, description: '油污特写', voiceover: '油污擦不干净？', scene: '厨房', cameraMovement: '固定机位' },
            { timeRange: '00:03-00:06', shotType: 'product_demo', intensity: 6, description: '喷涂演示', voiceover: '喷上等一会。', scene: '厨房', cameraMovement: '俯拍' },
            { timeRange: '00:06-00:10', shotType: 'comparison', intensity: 8, description: '擦拭前后对比', voiceover: '轻轻一擦。', scene: '厨房', cameraMovement: '固定机位' },
            { timeRange: '00:10-00:14', shotType: 'talking_head', intensity: 5, description: '真人总结', voiceover: '适合每天用。', scene: '厨房', cameraMovement: '缓慢推进' },
          ],
        },
        reusableFormula: ['痛点 -> 产品演示 -> 效果证明 -> 轻 CTA'],
        risks: [{ level: 'warning', message: '不要复刻原视频人物和画面。' }],
        resourceFramework: {
          characters: [{ name: '宝妈', shotCount: 3, voiceTraits: '亲切女声', threeViewPrompt: 'source character prompt' }],
          scenes: [{ name: '厨房', shotCount: 4, environment: '明亮厨房', lighting: '自然光' }],
        },
      },
    });

    const videos = new VideoWorkflowService(logs, text);
    const script = await videos.generateScript({
      workspacePath,
      productName: '本方清洁喷雾',
      sceneBackground: '居家厨房',
      subtitleMode: 'burned-subtitle',
      voiceStyle: '自然可信',
      ratio: '4:5',
      shotCount: 2,
      durationSeconds: 8,
      breakdownLogId: breakdownLog.id,
      citations: [citation],
      assetRefs: [],
      selectedSkillSlugs: ['video-script-writer'],
      params: { textModel: 'fake-text-model' },
    });

    assert.equal(script.storyboard.length, 4);
    assert.deepEqual(script.storyboard.map((shot) => shot.timeRange), ['00:00-00:03', '00:03-00:06', '00:06-00:10', '00:10-00:14']);
    assert.deepEqual(script.storyboard.map((shot) => shot.shotType), ['close_up', 'product_demo', 'comparison', 'talking_head']);
    assert.equal(script.resourceFramework.characters[0].name, '目标达人');
    assert.equal(script.resourceFramework.characters[0].shotCount, 4);
    assert.equal(script.resourceFramework.scenes[0].sceneImagePrompt.includes('Bright realistic kitchen'), true);
    const promptPayload = JSON.parse(text.calls.at(-1).prompt);
    assert.equal(promptPayload.targetShotCount, 4);
    assert.equal(promptPayload.targetDurationSeconds, 14);
    assert.equal(promptPayload.scriptContext.exactMappingRequired, true);
    assert.equal(promptPayload.scriptContext.referenceRhythm.length, 4);
    assert.ok(promptPayload.requirements.some((item) => item.includes('2-6 秒')));
    assert.ok(promptPayload.requirements.some((item) => item.includes('threeViewPrompt')));
    assert.ok(promptPayload.requirements.some((item) => item.includes('sceneImagePrompt')));
    assert.ok(promptPayload.requirements.some((item) => item.includes('before-after')));
    const storedScriptLog = (await logs.list(workspacePath)).find((entry) => entry.kind === 'video-script');
    assert.match(storedScriptLog.summary, /4 镜头、14s/);
    assert.deepEqual(storedScriptLog.artifactRefs, [`generation-log:${breakdownLog.id}`]);
  });
});
