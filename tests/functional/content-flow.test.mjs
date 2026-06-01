import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

import { ArticleGenerationService } from '../../src/main/services/articleGenerationService.ts';
import { AgentPromptSessionStore } from '../../src/main/services/agentPromptSessionStore.ts';
import { AssetReviewStore } from '../../src/main/services/assetReviewStore.ts';
import { AutoUpdateService } from '../../src/main/services/autoUpdateService.ts';
import { BrandKnowledgeBaseStore } from '../../src/main/services/brandKnowledgeBaseStore.ts';
import { BrandCommandCenterApplicationService } from '../../src/main/services/brandCommandCenterApplicationService.ts';
import { BrandCommandCenterStore } from '../../src/main/services/brandCommandCenterStore.ts';
import { PromptAgentService } from '../../src/main/services/claudePromptAgentService.ts';
import { GenerationLogStore } from '../../src/main/services/generationLogStore.ts';
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
import { WorkflowEngine } from '../../src/main/services/workflowEngine.ts';
import { WorkflowStore } from '../../src/main/services/workflowStore.ts';
import { AgentKnowledgeContentExportService } from '../../src/main/services/agentKnowledgeContentExportService.ts';
import { BuguContentWorkspaceSyncAdapter } from '../../src/main/services/buguContentWorkspaceSyncAdapter.ts';
import { buildClaudeSubprocessEnv, resolveAsarUnpackedPath } from '../../src/main/services/claudeSdkRuntime.ts';
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
import { ContentWorkspaceSyncService } from '../../src/main/services/contentWorkspaceSyncService.ts';
import { buildPromptGroundingSummary } from '../../src/main/services/promptGroundingAssembler.ts';
import { getOemRuntimeConfig } from '../../src/main/services/oemRuntimeConfig.ts';
import { MediaProvider } from '../../src/main/providers/mediaProvider.ts';
import { formatImageTemplateInputs, formatImageTemplatePromptContext } from '../../src/shared/imageTemplates.ts';
import { isReusablePromptInputSource, isReusableWorkflowInputSource } from '../../src/shared/inputSourcePolicy.ts';
import { buildProductBriefPromptPlan, structureProductBriefSources } from '../../src/shared/productBrief.ts';
import { clusterUserFeedbackSources } from '../../src/shared/userFeedbackInsights.ts';
import { buildScenePromptGroupContent } from '../../src/shared/scenePromptComposer.ts';
import { buildContentSyncConflictMergeDraft } from '../../src/shared/contentSyncConflictMerge.ts';
import { planContentMatrixRows } from '../../src/shared/contentMatrixPlanning.ts';
import { buildContentReviewTasksFromMap } from '../../src/main/services/contentReviewTaskBuilder.ts';
import { buildAssetCoverageByReviewId } from '../../src/renderer/src/app/assetCoverage.ts';
import { createDevBridge } from '../../src/renderer/src/devContentStudioBridge.ts';
import { extractGeneratedAssetRefsFromLog, extractLocalRefsFromLog } from '../../src/renderer/src/app/formatters.ts';
import { projectAgentRuntimeReadModel } from '../../src/renderer/src/components/agent/agentRuntimeProjection.ts';
import { SkillManager } from '../../src/main/services/skillManager.ts';
import { buildBusinessAcceptanceReport, loadWorkspaceAcceptanceInput } from '../../scripts/v2-business-acceptance.mjs';
import { buildProviderCheckReport, hasProviderStrictFailure } from '../../scripts/v2-provider-check.mjs';
import { buildV2UxCopyAudit } from '../../scripts/v2-ux-copy-audit.mjs';
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

function createPublicPackageFetch(localBaseUrl, publicBaseUrl) {
  return (url, init = {}) => {
    const text = String(url);
    const mappedUrl = text.startsWith(publicBaseUrl)
      ? `${localBaseUrl}${text.slice(publicBaseUrl.length)}`
      : text;
    return fetch(mappedUrl, init);
  };
}

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
        if (String(url).includes('/content-action-records?')) {
          const requestUrl = new URL(String(url));
          assert.equal(requestUrl.searchParams.get('workspaceId'), 'workspace-server-1');
          assert.equal(requestUrl.searchParams.get('commandCenterId'), 'command-center-server-1');
          assert.equal(requestUrl.searchParams.get('limit'), '80');
          return new Response(JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              workspace: { id: 'workspace-server-1', currentRevision: '14' },
              items: [{
                id: 'action-server-1',
                commandCenterId: 'command-center-server-1',
                queueItemId: 'queue-server-1',
                campaignCellId: 'cell-server-1',
                actionType: 'generate-prompt-draft',
                title: '团队已交接 Prompt 草稿',
                outcome: 'handoff',
                actorLabel: '团队成员',
                inputSummary: '团队资源包',
                outputSummary: '已交接到 Prompt 工作台。',
                writeBackSummary: '等待素材导入后回写。',
                serverRevision: '14',
                baseRevision: '13',
                createdAt: '2026-05-28T00:04:00.000Z',
              }],
            },
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
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
        if (String(url).includes('/content-command-centers?')) {
          const requestUrl = new URL(String(url));
          assert.equal(requestUrl.searchParams.get('workspaceId'), 'workspace-server-1');
          assert.equal(requestUrl.searchParams.get('limit'), '100');
          return new Response(JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              revision: '23',
              items: [{
                id: 'command-center-server-1',
                workspaceId: 'workspace-server-1',
                title: '团队品牌内容作战系统',
                status: 'active',
                sourceKnowledgeMapId: 'map-server-1',
                sourceKnowledgeMapTitle: '团队通勤防晒内容地图',
                signals: [{
                  id: 'signal-server-1',
                  type: 'feedback-pain',
                  title: '团队信号',
                  summary: '团队评论反馈。',
                  sourceLabel: '团队评论',
                  businessValue: 90,
                  evidenceReadiness: 80,
                  urgency: 70,
                  riskLevel: 10,
                  productionCost: 20,
                  recommendedObjectiveType: 'conversion',
                  riskBoundary: '不能绝对化表达。',
                  relatedMapRowIds: ['selling-server-1'],
                }],
                objectives: [],
                resourceBundles: [{
                  id: 'bundle-server-1',
                  title: '团队资源包',
                  objectiveId: 'objective-server-1',
                  sourceKnowledgeMapId: 'map-server-1',
                  coverageRowIds: ['selling-server-1'],
                  sellingPointRefs: ['团队清爽补涂'],
                  evidenceRefs: ['evidence-server-1'],
                  sceneRefs: ['午后通勤'],
                  promptDraftIds: ['prompt-server-1'],
                  materialRefs: [],
                  sopRefs: [],
                  constraints: ['不能绝对化表达。'],
                  gaps: [],
                  handoffRefs: ['prompt-draft:prompt-server-1'],
                  readyPercent: 91,
                }],
                campaignCells: [],
                queueSummary: {
                  items: [{
                    id: 'queue-server-1',
                    campaignCellId: 'cell-server-1',
                    actionType: 'generate-prompt-draft',
                    title: '团队队列动作',
                    summary: '生成团队 Prompt。',
                    status: 'handed-off',
                    outputTarget: 'prompt-draft',
                    resourceBundleId: 'bundle-server-1',
                    createdAt: '2026-05-28T00:05:00.000Z',
                    updatedAt: '2026-05-28T00:05:01.000Z',
                  }],
                },
                actionSummary: {
                  records: [{
                    id: 'action-server-2',
                    queueItemId: 'queue-server-1',
                    campaignCellId: 'cell-server-1',
                    actionType: 'generate-prompt-draft',
                    title: '团队已生成 Prompt',
                    outcome: 'handoff',
                    actorLabel: '团队成员',
                    actorRole: 'operator',
                    inputSummary: '团队资源包。',
                    outputSummary: '已交接 Prompt 工作台。',
                    promptDraftId: 'prompt-server-1',
                    artifactRefs: ['prompt-draft:prompt-server-1'],
                    createdAt: '2026-05-28T00:05:01.000Z',
                  }],
                },
                constraints: ['不能绝对化表达。'],
                gaps: [],
                serverRevision: '23',
                baseRevision: '22',
                createdAt: '2026-05-28T00:05:00.000Z',
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
        if (String(url).endsWith('/content-command-centers')) {
          assert.equal(body.id, 'command-center-1');
          assert.equal(body.sourceKnowledgeMapId, 'map-1');
          assert.equal(body.signalCount, 1);
          assert.equal(body.queueItemCount, 1);
          assert.equal(body.actionRecordCount, 1);
          assert.equal(body.snapshot.signals[0].title, '通勤用户担心闷肤');
          assert.equal(body.snapshot.queueSummary.statusCounts.ready, 1);
          assert.equal(body.snapshot.actionSummary.records[0].artifactRefs[0], '[本机工作区]/exports/action-records.json');
          return new Response(JSON.stringify({
            code: 0,
            message: 'ok',
            data: {
              workspace: { id: 'workspace-server-1', currentRevision: '17' },
              commandCenter: { id: 'command-center-1', serverRevision: '17', baseRevision: '16' },
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

  const actionFetch = await adapter.listActionRecords({
    workspacePath: '/Users/coso/private-project',
    workspaceId: 'workspace-server-1',
    commandCenterId: 'command-center-server-1',
  });
  assert.equal(actionFetch.teamSync.status, 'synced');
  assert.equal(actionFetch.records.length, 1);
  assert.equal(actionFetch.records[0].id, 'action-server-1');
  assert.equal(actionFetch.records[0].actionType, 'generate-prompt-draft');
  assert.equal(actionFetch.records[0].syncStatus, 'synced');
  assert.equal(actionFetch.records[0].teamSync?.revision, '14');

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

  const teamCommandCenters = await adapter.listCommandCenters({
    workspacePath: '/Users/coso/private-project',
    workspaceId: 'workspace-server-1',
  });
  assert.equal(teamCommandCenters.length, 1);
  assert.equal(teamCommandCenters[0].id, 'command-center-server-1');
  assert.equal(teamCommandCenters[0].teamSync.revision, '23');
  assert.equal(teamCommandCenters[0].signals[0].title, '团队信号');
  assert.equal(teamCommandCenters[0].queueItems[0].status, 'handed-off');
  assert.equal(teamCommandCenters[0].actionRecords[0].promptDraftId, 'prompt-server-1');

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
      model: 'fake-claude-sonnet',
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
      model: 'fake-claude-sonnet',
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

  const commandCenterSync = await adapter.upsertCommandCenterSnapshot({
    record: {
      id: 'command-center-1',
      workspacePath: '/Users/coso/private-project',
      title: '通勤防晒品牌作战系统',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-1',
      sourceKnowledgeMapTitle: '通勤防晒内容知识地图',
      signals: [{
        id: 'signal-1',
        type: 'feedback-pain',
        title: '通勤用户担心闷肤',
        summary: '评论区追问午后补涂是否闷肤。',
        sourceLabel: '用户评论',
        businessValue: 88,
        evidenceReadiness: 80,
        urgency: 72,
        riskLevel: 20,
        productionCost: 30,
        recommendedObjectiveType: 'conversion',
        riskBoundary: '不能绝对化表达。',
        relatedMapRowIds: ['selling-1'],
      }],
      objectives: [{
        id: 'objective-1',
        type: 'conversion',
        title: '解释清爽补涂',
        summary: '用证据说明清爽体验。',
        priority: 'P1',
        channels: ['抖音'],
        successCriteria: ['评论区能理解清爽体验。'],
        signalIds: ['signal-1'],
      }],
      resourceBundles: [{
        id: 'bundle-1',
        title: '清爽补涂资源包',
        objectiveId: 'objective-1',
        sourceKnowledgeMapId: 'map-1',
        coverageRowIds: ['selling-1'],
        sellingPointRefs: ['清爽补涂'],
        evidenceRefs: ['evidence-1'],
        sceneRefs: ['午后补涂'],
        promptDraftIds: ['prompt-1'],
        materialRefs: ['/Users/coso/private-project/assets/private.mov'],
        sopRefs: [],
        constraints: ['不能绝对化表达。'],
        gaps: [],
        readyPercent: 80,
      }],
      campaignCells: [{
        id: 'cell-1',
        title: '通勤转化作战单元',
        objectiveId: 'objective-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['抖音'],
        timeWindow: '本周',
        resourceBundleId: 'bundle-1',
        decisionChecks: [],
        queueItemIds: ['queue-1'],
      }],
      queueItems: [{
        id: 'queue-1',
        campaignCellId: 'cell-1',
        actionType: 'generate-prompt-draft',
        title: '生成清爽补涂 Prompt',
        summary: '生成 15 秒口播 Prompt。',
        status: 'ready',
        outputTarget: 'prompt-draft',
        resourceBundleId: 'bundle-1',
        createdAt: '2026-05-28T00:00:00.000Z',
        updatedAt: '2026-05-28T00:00:00.000Z',
      }],
      actionRecords: [{
        id: 'action-1',
        queueItemId: 'queue-1',
        campaignCellId: 'cell-1',
        actionType: 'generate-prompt-draft',
        title: '生成清爽补涂 Prompt',
        outcome: 'handoff',
        actorLabel: '功能测试',
        inputSummary: '清爽补涂资源包。',
        outputSummary: '已交接 Prompt 工作台。',
        artifactRefs: ['/Users/coso/private-project/exports/action-records.json'],
        createdAt: '2026-05-28T00:00:01.000Z',
      }],
      constraints: ['不能绝对化表达。'],
      gaps: [],
      teamSync: runSync,
      createdAt: '2026-05-28T00:00:00.000Z',
      updatedAt: '2026-05-28T00:00:01.000Z',
    },
  });
  assert.equal(commandCenterSync.status, 'synced');
  assert.equal(commandCenterSync.revision, '17');
  assert.ok(requests.some((request) => String(request.url).endsWith('/content-knowledge-maps')));
  assert.ok(requests.some((request) => String(request.url).endsWith('/content-build-runs')));
  assert.ok(requests.some((request) => String(request.url).endsWith('/content-command-centers')));
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
  const commandCenterItems = [{ id: 'command-center-online-1', sourceKnowledgeMapId: 'map-online-1', title: '线上品牌作战系统' }];
  const reviewItems = Array.from({ length: 105 }, (_, index) => ({ id: `review-online-${index + 1}`, title: `确认卖点证据 ${index + 1}` }));
  const queueItems = Array.from({ length: 105 }, (_, index) => ({ id: `queue-online-${index + 1}`, title: `生成通勤场景 Prompt ${index + 1}` }));
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
    if (url.pathname === '/api/v1/oem/content-command-centers') {
      response.end(JSON.stringify({ code: 0, data: paginate(commandCenterItems, url) }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-review-tasks') {
      response.end(JSON.stringify({ code: 0, data: paginate(reviewItems, url) }));
      return;
    }
    if (url.pathname === '/api/v1/oem/content-execution-queue') {
      response.end(JSON.stringify({ code: 0, data: paginate(queueItems, url) }));
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
    assert.equal(result.summaries.actorA.commandCenterCount, 1);
    assert.deepEqual(result.summaries.actorB.commandCenterIds, ['command-center-online-1']);
    assert.equal(result.summaries.actorA.releaseCount, 1);
    assert.deepEqual(result.summaries.actorB.releaseIds, ['release-team-online']);
    assert.equal(result.summaries.actorA.knowledgeMapListComplete, true);
    assert.equal(result.summaries.actorB.buildRunListComplete, true);
    assert.equal(result.summaries.actorA.commandCenterListComplete, true);
    assert.equal(result.summaries.actorA.releaseListComplete, true);
    assert.equal(result.summaries.actorA.reviewTaskCount, 105);
    assert.equal(result.summaries.actorB.executionQueueCount, 105);
    assert.equal(result.summaries.actorA.actionRecordCount, 105);
    assert.equal(result.summaries.actorA.reviewTaskListComplete, true);
    assert.equal(result.summaries.actorB.executionQueueListComplete, true);
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
    assert.equal(result.checks.find((check) => check.id === 'command-center-list-complete')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'knowledge-map-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'build-run-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'command-center-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'review-task-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'execution-queue-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'release-list-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'release-list-complete')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'knowledge-map-list-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'build-run-list-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'command-center-list-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'release-list-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-list-complete')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-list-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-artifacts-present')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-artifacts-match')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'action-record-artifacts-safe')?.status, 'passed');
    assert.equal(result.checks.find((check) => check.id === 'material-gap-artifact-present')?.status, 'passed');
    assert.ok(requests.some((item) => item.pathname === '/api/v1/oem/content-knowledge-maps'));
    assert.ok(requests.some((item) => item.pathname === '/api/v1/oem/content-build-runs'));
    assert.ok(requests.some((item) => item.pathname === '/api/v1/oem/content-command-centers'));
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
      url.pathname === '/api/v1/oem/content-command-centers' ||
      url.pathname === '/api/v1/oem/content-review-tasks' ||
      url.pathname === '/api/v1/oem/content-execution-queue'
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
  assert.equal(result.summaries.actorA.commandCenterCount, 0);
  assert.equal(result.checks.find((check) => check.id === 'knowledge-map-list-present')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.id === 'build-run-list-present')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.id === 'command-center-list-present')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.id === 'review-task-list-present')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.id === 'execution-queue-list-present')?.status, 'failed');
});

test('团队共享在线验收会拒绝空的团队审核任务和执行队列', async () => {
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
            id: 'workspace-empty-review-queue',
            name: '空审核队列工作区',
            currentRevision: 'rev-empty-review-queue',
            defaultKnowledgeReleaseId: 'release-empty-review-queue',
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
            id: 'release-empty-review-queue',
            title: '空审核队列知识包',
            version: 'v1-empty-review-queue',
            status: 'published',
            approvalStatus: 'approved',
            packagePublicUrl: 'https://r2.bugu.run/packages/release-empty-review-queue.zip',
            packageUploadStatus: 'stored',
          }],
          total: 1,
        },
      });
    }
    if (url.pathname === '/api/v1/oem/content-knowledge-maps') {
      return jsonResponse({ code: 0, data: { items: [{ id: 'map-empty-review-queue' }], total: 1 } });
    }
    if (url.pathname === '/api/v1/oem/content-build-runs') {
      return jsonResponse({ code: 0, data: { items: [{ id: 'build-run-empty-review-queue' }], total: 1 } });
    }
    if (url.pathname === '/api/v1/oem/content-command-centers') {
      return jsonResponse({ code: 0, data: { items: [{ id: 'command-center-empty-review-queue' }], total: 1 } });
    }
    if (url.pathname === '/api/v1/oem/content-action-records') {
      return jsonResponse({
        code: 0,
        data: {
          items: [{
            id: 'action-empty-review-queue',
            title: '生成补素材清单',
            artifactRefs: ['material-gap-list.json'],
          }],
          total: 1,
        },
      });
    }
    if (
      url.pathname === '/api/v1/oem/content-review-tasks' ||
      url.pathname === '/api/v1/oem/content-execution-queue'
    ) {
      return jsonResponse({ code: 0, data: { items: [], total: 0 } });
    }
    return jsonResponse({ code: 404, message: 'not found' }, 404);
  };

  const result = await verifyContentTeamSharingOnline({
    apiBaseUrl: 'https://api.bugu.run',
    tenant: 'tenant-prod',
    workspaceId: 'workspace-empty-review-queue',
    actorAToken: 'token-a',
    actorBToken: 'token-b',
    fetchImpl,
  });

  assert.equal(result.ok, false);
  assert.equal(result.checks.find((check) => check.id === 'knowledge-map-list-present')?.status, 'passed');
  assert.equal(result.checks.find((check) => check.id === 'build-run-list-present')?.status, 'passed');
  assert.equal(result.checks.find((check) => check.id === 'command-center-list-present')?.status, 'passed');
  assert.equal(result.checks.find((check) => check.id === 'review-task-list-present')?.status, 'failed');
  assert.equal(result.checks.find((check) => check.id === 'execution-queue-list-present')?.status, 'failed');
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
    if (url.pathname === '/api/v1/oem/content-command-centers') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{ id: 'command-center-v1-online', sourceKnowledgeMapId: 'map-v1-online' }],
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
    if (url.pathname === '/api/v1/oem/content-execution-queue') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        code: 0,
        data: {
          items: [{ id: 'queue-v1-online', title: '生成 v1 通勤场景 Prompt' }],
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
    assert.equal(result.sections.team.summaries.actorA.executionQueueCount, 1);
    assert.equal(result.sections.team.checks.find((check) => check.id === 'review-task-list-present')?.status, 'passed');
    assert.equal(result.sections.team.checks.find((check) => check.id === 'execution-queue-list-present')?.status, 'passed');
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
            commandCenterCount: 1,
            reviewTaskCount: 1,
            executionQueueCount: 1,
            actionRecordCount: 1,
            releaseCount: 1,
            knowledgeMapIds: ['map-v1-online'],
            buildRunIds: ['build-run-v1-online'],
            commandCenterIds: ['command-center-v1-online'],
            reviewTaskIds: ['review-task-1'],
            executionQueueIds: ['queue-item-1'],
            actionRecordIds: ['action-record-1'],
            actionArtifactRecordCount: 1,
            actionArtifactRecordIds: ['action-record-1'],
            actionArtifactRefsByRecordId: {
              'action-record-1': ['material-gap-list.json'],
            },
            releaseIds: ['release-v1-online'],
            knowledgeMapListComplete: true,
            buildRunListComplete: true,
            commandCenterListComplete: true,
            reviewTaskListComplete: true,
            executionQueueListComplete: true,
            actionRecordListComplete: true,
            releaseListComplete: true,
          },
          actorB: {
            knowledgeMapCount: 1,
            buildRunCount: 1,
            commandCenterCount: 1,
            reviewTaskCount: 1,
            executionQueueCount: 1,
            actionRecordCount: 1,
            releaseCount: 1,
            knowledgeMapIds: ['map-v1-online'],
            buildRunIds: ['build-run-v1-online'],
            commandCenterIds: ['command-center-v1-online'],
            reviewTaskIds: ['review-task-1'],
            executionQueueIds: ['queue-item-1'],
            actionRecordIds: ['action-record-1'],
            actionArtifactRecordCount: 1,
            actionArtifactRecordIds: ['action-record-1'],
            actionArtifactRefsByRecordId: {
              'action-record-1': ['material-gap-list.json'],
            },
            releaseIds: ['release-v1-online'],
            knowledgeMapListComplete: true,
            buildRunListComplete: true,
            commandCenterListComplete: true,
            reviewTaskListComplete: true,
            executionQueueListComplete: true,
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

  const mismatchedTeamReport = structuredClone(productionReport);
  mismatchedTeamReport.sections.team.summaries.actorB.executionQueueIds = ['queue-item-other'];
  const mismatchedTeam = validateContentOntologyV1Report(mismatchedTeamReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(mismatchedTeam.ok, false);
  assert.ok(mismatchedTeam.issues.some((issue) => issue.id === 'team-queue-ids-match'));

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

  const missingQueueReport = structuredClone(productionReport);
  missingQueueReport.sections.team.summaries.actorA.executionQueueCount = 0;
  missingQueueReport.sections.team.summaries.actorB.executionQueueCount = 0;
  missingQueueReport.sections.team.summaries.actorA.executionQueueIds = [];
  missingQueueReport.sections.team.summaries.actorB.executionQueueIds = [];
  const missingQueue = validateContentOntologyV1Report(missingQueueReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(missingQueue.ok, false);
  assert.ok(missingQueue.issues.some((issue) => issue.id === 'team-queue-present'));

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

  const mismatchedBuildRunReport = structuredClone(productionReport);
  mismatchedBuildRunReport.sections.team.summaries.actorB.buildRunIds = ['build-run-other'];
  const mismatchedBuildRun = validateContentOntologyV1Report(mismatchedBuildRunReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(mismatchedBuildRun.ok, false);
  assert.ok(mismatchedBuildRun.issues.some((issue) => issue.id === 'team-build-run-ids-match'));

  const mismatchedCommandCenterReport = structuredClone(productionReport);
  mismatchedCommandCenterReport.sections.team.summaries.actorB.commandCenterIds = ['command-center-other'];
  const mismatchedCommandCenter = validateContentOntologyV1Report(mismatchedCommandCenterReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(mismatchedCommandCenter.ok, false);
  assert.ok(mismatchedCommandCenter.issues.some((issue) => issue.id === 'team-command-center-ids-match'));

  const mismatchedActionReport = structuredClone(productionReport);
  mismatchedActionReport.sections.team.summaries.actorB.actionRecordIds = ['action-record-other'];
  const mismatchedAction = validateContentOntologyV1Report(mismatchedActionReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(mismatchedAction.ok, false);
  assert.ok(mismatchedAction.issues.some((issue) => issue.id === 'team-action-ids-match'));

  const mismatchedReleaseReport = structuredClone(productionReport);
  mismatchedReleaseReport.sections.team.summaries.actorB.releaseIds = ['release-other'];
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

  const incompleteActionIdsReport = structuredClone(productionReport);
  incompleteActionIdsReport.sections.team.summaries.actorA.actionRecordCount = 2;
  incompleteActionIdsReport.sections.team.summaries.actorB.actionRecordCount = 2;
  incompleteActionIdsReport.sections.team.summaries.actorA.actionRecordIds = ['action-record-1'];
  incompleteActionIdsReport.sections.team.summaries.actorB.actionRecordIds = ['action-record-1'];
  const incompleteActionIds = validateContentOntologyV1Report(incompleteActionIdsReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(incompleteActionIds.ok, false);
  assert.ok(incompleteActionIds.issues.some((issue) => issue.id === 'team-action-ids-complete'));

  const missingActionArtifactsWithoutActionIdsReport = structuredClone(productionReport);
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorA.actionRecordCount = 0;
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorB.actionRecordCount = 0;
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorA.actionRecordIds = [];
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorB.actionRecordIds = [];
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorA.actionArtifactRecordCount = 0;
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorB.actionArtifactRecordCount = 0;
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorA.actionArtifactRecordIds = [];
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorB.actionArtifactRecordIds = [];
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorA.actionArtifactRefsByRecordId = {};
  missingActionArtifactsWithoutActionIdsReport.sections.team.summaries.actorB.actionArtifactRefsByRecordId = {};
  const missingActionArtifactsWithoutActionIds = validateContentOntologyV1Report(missingActionArtifactsWithoutActionIdsReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(missingActionArtifactsWithoutActionIds.ok, false);
  assert.ok(missingActionArtifactsWithoutActionIds.issues.some((issue) => issue.id === 'team-action-present'));
  assert.ok(missingActionArtifactsWithoutActionIds.issues.some((issue) => issue.id === 'team-action-artifacts-present'));

  const missingArtifactRefsReport = structuredClone(productionReport);
  missingArtifactRefsReport.sections.team.summaries.actorA.actionArtifactRecordCount = 0;
  missingArtifactRefsReport.sections.team.summaries.actorB.actionArtifactRecordCount = 0;
  missingArtifactRefsReport.sections.team.summaries.actorA.actionArtifactRecordIds = [];
  missingArtifactRefsReport.sections.team.summaries.actorB.actionArtifactRecordIds = [];
  missingArtifactRefsReport.sections.team.summaries.actorA.actionArtifactRefsByRecordId = {};
  missingArtifactRefsReport.sections.team.summaries.actorB.actionArtifactRefsByRecordId = {};
  const missingArtifactRefs = validateContentOntologyV1Report(missingArtifactRefsReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(missingArtifactRefs.ok, false);
  assert.ok(missingArtifactRefs.issues.some((issue) => issue.id === 'team-action-artifacts-present'));

  const mismatchedArtifactRefsReport = structuredClone(productionReport);
  mismatchedArtifactRefsReport.sections.team.summaries.actorB.actionArtifactRefsByRecordId['action-record-1'] = ['other-material-gap-list.json'];
  const mismatchedArtifactRefs = validateContentOntologyV1Report(mismatchedArtifactRefsReport, {
    production: true,
    requireApiBaseUrl: 'https://api.bugu.run',
  });
  assert.equal(mismatchedArtifactRefs.ok, false);
  assert.ok(mismatchedArtifactRefs.issues.some((issue) => issue.id === 'team-action-artifact-refs-match'));

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
  assert.ok(localReadiness.checks.some((check) => check.id === 'v1-user-facing-copy-gate' && check.status === 'passed' && check.files === 5 && check.rules >= 10));
  assert.ok(localReadiness.checks.some((check) => check.id === 'team-knowledge-refresh-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'build-run-detail-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'matrix-row-primary-action-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'content-knowledge-map-model-click-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'asset-library-material-task-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'team-sync-conflict-resolution-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'team-offline-change-import-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'production-handoff-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'team-release-list-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'agent-knowledge-pack-file-preview-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'bugu-server-policy-gate' && check.status === 'passed'));
  assert.ok(localReadiness.checks.some((check) => check.id === 'bugu-knowledge-map-fact-source' && check.status === 'passed'));
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
    assert.equal(record.model, 'fake-claude-sonnet');
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
    assert.equal(buildRuns[0].model, 'fake-claude-sonnet');
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

test('v1 本地事实源并发写入不会丢失审核和行动记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const reviewStore = new ContentReviewTaskStore();
    const commandStore = new BrandCommandCenterStore();
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

    const commandRecord = (index) => ({
      id: `command-concurrent-${index}`,
      workspacePath,
      title: `并发品牌战情室 ${index}`,
      status: 'active',
      syncStatus: 'local-only',
      sourceKnowledgeMapId: `map-concurrent-${index}`,
      sourceKnowledgeMapTitle: `并发内容地图 ${index}`,
      signals: [],
      objectives: [],
      resourceBundles: [],
      campaignCells: [],
      queueItems: [],
      actionRecords: [{
        id: `action-concurrent-${index}`,
        actionType: 'content-production-blocked',
        title: `并发行动记录 ${index}`,
        outcome: 'blocked',
        actorLabel: '功能测试',
        inputSummary: '并发写入验证。',
        outputSummary: '已记录并发行动。',
        createdAt: `${now}.${index}`,
      }],
      constraints: [],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'local-only',
        message: '本机草稿。',
      },
      createdAt: `${now}.${index}`,
      updatedAt: `${now}.${index}`,
    });

    await Promise.all(Array.from({ length: 12 }, (_, index) => commandStore.save(commandRecord(index))));
    const commandCenters = await commandStore.list(workspacePath);
    assert.equal(commandCenters.length, 12);
    assert.equal(new Set(commandCenters.flatMap((item) => item.actionRecords.map((record) => record.id))).size, 12);

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
        nextStep: '进入 Prompt 工作台确认。',
        createdAt: `${now}.${index}`,
      }],
      createdAt: `${now}.${index}`,
    });

    await Promise.all(Array.from({ length: 12 }, (_, index) => handoffStore.append(handoffRecord(index))));
    const handoffs = await handoffStore.list(workspacePath);
    assert.equal(handoffs.length, 12);
    assert.equal(new Set(handoffs.map((item) => item.id)).size, 12);
    assert.equal(new Set(handoffs.flatMap((item) => item.actionRecords.map((record) => record.id))).size, 12);

    const workflowStore = new WorkflowStore();
    await Promise.all(Array.from({ length: 6 }, (_, index) => workflowStore.createDraft({
      workspacePath,
      templateKey: 'brand-scene-prompts',
      title: `并发 SOP 草案 ${index}`,
      description: '并发写入验证。',
    })));
    const workflowDefinitions = await workflowStore.listDefinitions(workspacePath);
    const draftTitles = new Set(workflowDefinitions.filter((item) => item.status === 'draft').map((item) => item.title));
    assert.equal(draftTitles.size, 6);
    assert.ok(Array.from({ length: 6 }, (_, index) => `并发 SOP 草案 ${index}`).every((title) => draftTitles.has(title)));
  });
});

test('v1 本地事实源超过展示阈值仍保留审计历史', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const buildRunStore = new ContentKnowledgeMapBuildRunStore();
    const draftStore = new ContentDraftChangeStore();
    const reviewStore = new ContentReviewTaskStore();
    const commandStore = new BrandCommandCenterStore();
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

    const commandRecord = (index) => ({
      id: `command-history-${index}`,
      workspacePath,
      title: `历史品牌战情室 ${index}`,
      status: 'active',
      syncStatus: 'local-only',
      sourceKnowledgeMapId: `map-history-${index}`,
      sourceKnowledgeMapTitle: `历史内容地图 ${index}`,
      signals: [],
      objectives: [],
      resourceBundles: [],
      campaignCells: [],
      queueItems: [],
      actionRecords: [{
        id: `action-history-${index}`,
        actionType: 'content-production-blocked',
        title: `历史行动记录 ${index}`,
        outcome: 'blocked',
        actorLabel: '功能测试',
        inputSummary: '超过展示阈值仍需保留。',
        outputSummary: '已记录。',
        createdAt: at(index),
      }],
      constraints: [],
      gaps: [],
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
        nextStep: '进入 Prompt 工作台确认。',
        createdAt: at(index),
      }],
      createdAt: at(index),
    });

    await Promise.all(Array.from({ length: 61 }, (_, index) => mapStore.save(mapRecord(index))));
    await Promise.all(Array.from({ length: 61 }, (_, index) => commandStore.save(commandRecord(index))));
    await Promise.all(Array.from({ length: 201 }, (_, index) => buildRunStore.save(buildRunRecord(index))));
    await Promise.all(Array.from({ length: 241 }, (_, index) => draftStore.save(draftChange(index))));
    await Promise.all(Array.from({ length: 241 }, (_, index) => reviewStore.saveMany(workspacePath, [reviewTask(index)])));
    await Promise.all(Array.from({ length: 241 }, (_, index) => handoffStore.append(handoffRecord(index))));

    const maps = await mapStore.list(workspacePath);
    const commands = await commandStore.list(workspacePath);
    const buildRuns = await buildRunStore.list(workspacePath);
    const drafts = await draftStore.list(workspacePath);
    const reviews = await reviewStore.list(workspacePath);
    const handoffs = await handoffStore.list(workspacePath);

    assert.equal(maps.length, 61);
    assert.equal(commands.length, 61);
    assert.equal(buildRuns.length, 201);
    assert.equal(drafts.length, 241);
    assert.equal(reviews.length, 241);
    assert.equal(handoffs.length, 241);
    assert.ok(maps.some((item) => item.id === 'map-history-0'));
    assert.ok(commands.some((item) => item.id === 'command-history-0'));
    assert.ok(buildRuns.some((item) => item.id === 'build-run-history-0'));
    assert.ok(drafts.some((item) => item.id === 'draft-history-0'));
    assert.ok(reviews.some((item) => item.id === 'review-history-0'));
    assert.ok(handoffs.some((item) => item.id === 'handoff-history-0'));
  });
});

test('v1 本地事实源禁止覆盖已有审核决策、行动记录和已发布知识包版本', async () => {
  await withWorkspace(async (workspacePath) => {
    const reviewStore = new ContentReviewTaskStore();
    const commandStore = new BrandCommandCenterStore();
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

    const commandCenter = {
      id: 'command-append-only-1',
      workspacePath,
      title: '追加不变量战情室',
      status: 'active',
      syncStatus: 'local-only',
      signals: [],
      objectives: [],
      resourceBundles: [],
      campaignCells: [],
      queueItems: [],
      actionRecords: [{
        id: 'action-append-only-1',
        actionType: 'generate-prompt-draft',
        title: '已生成 Prompt 草稿',
        outcome: 'handoff',
        actorLabel: '内容运营',
        inputSummary: '已审核组合。',
        outputSummary: 'Prompt 草稿已创建。',
        createdAt: now,
      }],
      constraints: [],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'local-only',
        message: '本机草稿。',
      },
      createdAt: now,
      updatedAt: now,
    };
    await commandStore.save(commandCenter);

    await assert.rejects(
      commandStore.update({
        ...commandCenter,
        gaps: ['尝试覆盖已有行动记录。'],
        actionRecords: [],
      }),
      /行动记录只能追加/,
    );
    const [savedCommandCenter] = await commandStore.list(workspacePath);
    assert.equal(savedCommandCenter.actionRecords.length, 1);
    assert.equal(savedCommandCenter.actionRecords[0].id, 'action-append-only-1');

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

test('品牌战情室列表会从 Bugu current 事实源刷新完整作战系统快照', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const commandStore = new BrandCommandCenterStore();
    const now = '2026-05-31T00:10:00.000Z';
    await mapStore.save({
      id: 'map-command-anchor',
      workspacePath,
      title: '团队作战锚点地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步。',
        workspaceId: 'workspace-command-current-1',
        revision: 'command-rev-1',
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

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      { draftStatus: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }) },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        upsertCommandCenterSnapshot: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }),
        listCommandCenters: async ({ workspaceId }) => {
          assert.equal(workspaceId, 'workspace-command-current-1');
          return [{
            id: 'command-team-current-1',
            workspacePath,
            title: '团队远端品牌作战系统',
            status: 'active',
            syncStatus: 'synced',
            sourceKnowledgeMapId: 'map-command-anchor',
            sourceKnowledgeMapTitle: '团队作战锚点地图',
            signals: [{
              id: 'signal-team-current-1',
              type: 'feedback-pain',
              title: '团队用户反馈',
              summary: '团队成员补充的用户反馈。',
              sourceLabel: '团队评论',
              businessValue: 92,
              evidenceReadiness: 88,
              urgency: 80,
              riskLevel: 10,
              productionCost: 30,
              recommendedObjectiveType: 'conversion',
              riskBoundary: '不能绝对化表达。',
              relatedMapRowIds: ['selling-team-1'],
            }],
            objectives: [],
            resourceBundles: [{
              id: 'bundle-team-current-1',
              title: '团队远端资源包',
              objectiveId: 'objective-team-current-1',
              sourceKnowledgeMapId: 'map-command-anchor',
              coverageRowIds: ['selling-team-1'],
              sellingPointRefs: ['团队卖点'],
              evidenceRefs: ['evidence-team-1'],
              sceneRefs: ['团队场景'],
              promptDraftIds: ['prompt-team-1'],
              materialRefs: [],
              sopRefs: [],
              constraints: ['不能绝对化表达。'],
              gaps: [],
              handoffRefs: ['prompt-draft:prompt-team-1'],
              readyPercent: 92,
            }],
            campaignCells: [],
            queueItems: [{
              id: 'queue-team-current-1',
              campaignCellId: 'cell-team-current-1',
              actionType: 'generate-prompt-draft',
              title: '团队队列动作',
              summary: '生成团队 Prompt。',
              status: 'handed-off',
              outputTarget: 'prompt-draft',
              resourceBundleId: 'bundle-team-current-1',
              syncStatus: 'synced',
              teamSync: {
                backend: 'bugu',
                status: 'synced',
                message: '已同步。',
                workspaceId,
                revision: 'command-rev-2',
              },
              createdAt: now,
              updatedAt: now,
            }],
            actionRecords: [{
              id: 'action-team-current-1',
              queueItemId: 'queue-team-current-1',
              campaignCellId: 'cell-team-current-1',
              actionType: 'generate-prompt-draft',
              title: '团队已生成 Prompt',
              outcome: 'handoff',
              actorLabel: '团队成员',
              inputSummary: '团队资源包。',
              outputSummary: '已交接 Prompt 工作台。',
              promptDraftId: 'prompt-team-1',
              artifactRefs: ['prompt-draft:prompt-team-1'],
              syncStatus: 'synced',
              teamSync: {
                backend: 'bugu',
                status: 'synced',
                message: '已同步。',
                workspaceId,
                revision: 'command-rev-2',
              },
              createdAt: now,
            }],
            constraints: ['不能绝对化表达。'],
            gaps: [],
            teamSync: {
              backend: 'bugu',
              status: 'synced',
              message: '已从团队事实源拉取。',
              workspaceId,
              revision: 'command-rev-2',
            },
            createdAt: now,
            updatedAt: now,
          }];
        },
      },
    );

    const records = await service.list(workspacePath);
    assert.equal(records.some((item) => item.id === 'command-team-current-1'), true);
    const saved = (await commandStore.list(workspacePath)).find((item) => item.id === 'command-team-current-1');
    assert.equal(saved?.signals[0].title, '团队用户反馈');
    assert.equal(saved?.queueItems[0].status, 'handed-off');
    assert.equal(saved?.actionRecords[0].promptDraftId, 'prompt-team-1');
  });
});

test('品牌战情室团队事实源刷新不会覆盖本机待同步队列动作', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const commandStore = new BrandCommandCenterStore();
    const now = '2026-05-31T00:20:00.000Z';
    await mapStore.save({
      id: 'map-command-local-queue',
      workspacePath,
      title: '本机作战锚点地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步。',
        workspaceId: 'workspace-command-current-2',
        revision: 'command-local-rev-1',
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
    await commandStore.save({
      id: 'command-local-queue-current',
      workspacePath,
      title: '本机品牌作战系统',
      status: 'active',
      syncStatus: 'pending-sync',
      sourceKnowledgeMapId: 'map-command-local-queue',
      sourceKnowledgeMapTitle: '本机作战锚点地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-local-queue-current',
        title: '本机待同步资源包',
        objectiveId: 'objective-local-queue-current',
        sourceKnowledgeMapId: 'map-command-local-queue',
        coverageRowIds: ['selling-local-queue'],
        approvedCoverageRowIds: ['selling-local-queue'],
        sellingPointRefs: ['本机卖点'],
        evidenceRefs: ['evidence-local-queue'],
        sceneRefs: ['本机场景'],
        promptDraftIds: [],
        materialRefs: ['asset-local-queue'],
        sopRefs: ['workflow-local-queue'],
        constraints: ['本机边界。'],
        gaps: [],
        handoffRefs: [],
        readyPercent: 100,
      }],
      campaignCells: [{
        id: 'cell-local-queue-current',
        title: '本机待同步作战单元',
        objectiveId: 'objective-local-queue-current',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['抖音'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-local-queue-current',
        decisionChecks: [],
        queueItemIds: ['queue-local-scene-card'],
      }],
      queueItems: [{
        id: 'queue-local-scene-card',
        campaignCellId: 'cell-local-queue-current',
        actionType: 'create-scene-card',
        title: '创建本机场景卡',
        summary: '本机新增但还没有同步的队列动作。',
        status: 'ready',
        outputTarget: 'scene-card',
        resourceBundleId: 'bundle-local-queue-current',
        syncStatus: 'pending-sync',
        teamSync: {
          backend: 'bugu',
          status: 'pending-sync',
          message: '本机队列待同步。',
          workspaceId: 'workspace-command-current-2',
          revision: 'command-local-rev-2',
        },
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [{
        id: 'action-local-queue-current',
        queueItemId: 'queue-local-scene-card',
        campaignCellId: 'cell-local-queue-current',
        actionType: 'create-scene-card',
        title: '本机准备创建场景卡',
        outcome: 'recorded',
        actorLabel: '本机运营',
        inputSummary: '本机待同步队列。',
        outputSummary: '等待团队同步。',
        syncStatus: 'pending-sync',
        teamSync: {
          backend: 'bugu',
          status: 'pending-sync',
          message: '本机行动待同步。',
          workspaceId: 'workspace-command-current-2',
          revision: 'command-local-rev-2',
        },
        createdAt: now,
      }],
      constraints: [],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'pending-sync',
        message: '本机作战系统待同步。',
        workspaceId: 'workspace-command-current-2',
        revision: 'command-local-rev-2',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      { draftStatus: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }) },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        upsertCommandCenterSnapshot: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }),
        listCommandCenters: async ({ workspaceId }) => {
          assert.equal(workspaceId, 'workspace-command-current-2');
          return [{
            id: 'command-local-queue-current',
            workspacePath,
            title: '团队当前品牌作战系统',
            status: 'active',
            syncStatus: 'synced',
            sourceKnowledgeMapId: 'map-command-local-queue',
            sourceKnowledgeMapTitle: '本机作战锚点地图',
            signals: [{
              id: 'signal-team-local-queue',
              type: 'feedback-pain',
              title: '团队当前信号',
              summary: '团队当前事实源信号。',
              sourceLabel: '团队评论',
              businessValue: 90,
              evidenceReadiness: 88,
              urgency: 80,
              riskLevel: 10,
              productionCost: 30,
              recommendedObjectiveType: 'conversion',
              riskBoundary: '不能绝对化表达。',
              relatedMapRowIds: ['selling-team-current'],
            }],
            objectives: [],
            resourceBundles: [{
              id: 'bundle-local-queue-current',
              title: '团队当前资源包',
              objectiveId: 'objective-local-queue-current',
              sourceKnowledgeMapId: 'map-command-local-queue',
              coverageRowIds: ['selling-team-current'],
              sellingPointRefs: ['团队卖点'],
              evidenceRefs: ['evidence-team-current'],
              sceneRefs: ['团队场景'],
              promptDraftIds: ['prompt-team-current'],
              materialRefs: [],
              sopRefs: [],
              constraints: ['团队边界。'],
              gaps: [],
              handoffRefs: ['prompt-draft:prompt-team-current'],
              readyPercent: 92,
            }],
            campaignCells: [{
              id: 'cell-local-queue-current',
              title: '团队当前作战单元',
              objectiveId: 'objective-local-queue-current',
              ownerRole: '内容负责人',
              agentRole: '内容工程 Agent',
              channels: ['小红书'],
              timeWindow: '本周',
              resourceBundleId: 'bundle-local-queue-current',
              decisionChecks: [],
              queueItemIds: ['queue-team-current'],
            }],
            queueItems: [{
              id: 'queue-team-current',
              campaignCellId: 'cell-local-queue-current',
              actionType: 'generate-prompt-draft',
              title: '团队当前 Prompt 动作',
              summary: '团队当前队列动作。',
              status: 'handed-off',
              outputTarget: 'prompt-draft',
              resourceBundleId: 'bundle-local-queue-current',
              syncStatus: 'synced',
              teamSync: {
                backend: 'bugu',
                status: 'synced',
                message: '已同步。',
                workspaceId,
                revision: 'command-team-rev-1',
              },
              createdAt: now,
              updatedAt: now,
            }],
            actionRecords: [{
              id: 'action-team-current',
              queueItemId: 'queue-team-current',
              campaignCellId: 'cell-local-queue-current',
              actionType: 'generate-prompt-draft',
              title: '团队已生成 Prompt',
              outcome: 'handoff',
              actorLabel: '团队成员',
              inputSummary: '团队当前队列。',
              outputSummary: '已交接 Prompt。',
              promptDraftId: 'prompt-team-current',
              syncStatus: 'synced',
              teamSync: {
                backend: 'bugu',
                status: 'synced',
                message: '已同步。',
                workspaceId,
                revision: 'command-team-rev-1',
              },
              createdAt: now,
            }],
            constraints: ['团队边界。'],
            gaps: [],
            teamSync: {
              backend: 'bugu',
              status: 'synced',
              message: '已从团队事实源拉取。',
              workspaceId,
              revision: 'command-team-rev-1',
            },
            createdAt: '2026-05-31T00:19:00.000Z',
            updatedAt: '2026-05-31T00:19:00.000Z',
          }];
        },
      },
    );

    const [record] = await service.list(workspacePath);
    assert.equal(record.title, '团队当前品牌作战系统');
    assert.equal(record.signals[0].title, '团队当前信号');
    assert.equal(record.teamSync.status, 'pending-sync');
    assert.equal(record.teamSync.revision, 'command-local-rev-2');
    assert.equal(record.queueItems.some((item) => item.id === 'queue-team-current'), true);
    assert.equal(record.queueItems.some((item) => item.id === 'queue-local-scene-card'), true);
    assert.equal(record.queueItems.find((item) => item.id === 'queue-local-scene-card')?.actionType, 'create-scene-card');
    assert.equal(record.resourceBundles[0].coverageRowIds?.includes('selling-local-queue'), true);
    assert.equal(record.resourceBundles[0].sopRefs?.includes('workflow-local-queue'), true);
    assert.equal(record.campaignCells[0].queueItemIds.includes('queue-local-scene-card'), true);
    assert.equal(record.actionRecords.some((item) => item.id === 'action-team-current'), true);
    assert.equal(record.actionRecords.some((item) => item.id === 'action-local-queue-current'), true);
  });
});

test('品牌战情室团队事实源刷新不会覆盖本机已同步的更新快照', async () => {
  await withWorkspace(async (workspacePath) => {
    const mapStore = new ContentKnowledgeMapStore();
    const commandStore = new BrandCommandCenterStore();
    const workspaceId = 'workspace-command-current-3';
    await mapStore.save({
      id: 'map-command-local-review',
      workspacePath,
      title: '复盘作战锚点地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步。',
        workspaceId,
        revision: 'command-review-map-rev-1',
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
      createdAt: '2026-05-31T00:28:00.000Z',
      updatedAt: '2026-05-31T00:28:00.000Z',
    });
    await commandStore.save({
      id: 'command-local-review-current',
      workspacePath,
      title: '本机复盘后的品牌作战系统',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-command-local-review',
      sourceKnowledgeMapTitle: '复盘作战锚点地图',
      signals: [{
        id: 'signal-local-review-current',
        type: 'manual',
        title: '复盘信号：午后补涂素材',
        summary: '抖音 Prompt 已交接，下一轮优先补拍午后补涂 9:16 素材。',
        sourceLabel: '行动记录复盘',
        businessValue: 82,
        evidenceReadiness: 60,
        urgency: 82,
        riskLevel: 58,
        productionCost: 62,
        recommendedObjectiveType: 'material-gap',
        riskBoundary: '复盘结论只能作为下一轮行动信号，不能自动改写产品事实。',
        relatedMapRowIds: ['selling-local-review'],
      }],
      objectives: [{
        id: 'objective-local-review-current',
        type: 'material-gap',
        title: '补素材：午后补涂素材',
        summary: '下一轮优先补拍午后补涂 9:16 素材。',
        priority: 'P0',
        channels: ['抖音'],
        successCriteria: ['补齐竖版素材后再回到执行队列。'],
        signalIds: ['signal-local-review-current'],
      }],
      resourceBundles: [{
        id: 'bundle-local-review-current',
        title: '复盘补素材资源包',
        objectiveId: 'objective-local-review-current',
        sourceKnowledgeMapId: 'map-command-local-review',
        coverageRowIds: ['selling-local-review'],
        approvedCoverageRowIds: ['selling-local-review'],
        sellingPointRefs: ['轻量通勤卖点'],
        evidenceRefs: ['evidence-local-review'],
        sceneRefs: ['午后补涂场景'],
        promptDraftIds: [],
        materialRefs: [],
        sopRefs: [],
        constraints: ['复盘结论不得改写产品事实。'],
        gaps: ['午后补涂 9:16 素材'],
        handoffRefs: [],
        readyPercent: 64,
      }],
      campaignCells: [{
        id: 'cell-local-review-current',
        title: '补素材作战单元',
        objectiveId: 'objective-local-review-current',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['抖音'],
        timeWindow: '下一轮',
        resourceBundleId: 'bundle-local-review-current',
        decisionChecks: [],
        queueItemIds: ['queue-local-review-current'],
      }],
      queueItems: [{
        id: 'queue-local-review-current',
        campaignCellId: 'cell-local-review-current',
        actionType: 'create-material-gap-list',
        title: '复盘创建补素材清单',
        summary: '午后补涂 9:16 素材。',
        status: 'needs-resource',
        blockedReason: '复盘发现素材缺口。',
        recoveryAction: '生成补素材清单，补齐后再回到执行队列。',
        outputTarget: 'material-gap',
        resourceBundleId: 'bundle-local-review-current',
        syncStatus: 'synced',
        teamSync: {
          backend: 'bugu',
          status: 'synced',
          message: '复盘补资源队列已同步。',
          workspaceId,
          revision: 'command-review-queue-rev-2',
        },
        createdAt: '2026-05-31T00:30:00.000Z',
        updatedAt: '2026-05-31T00:30:00.000Z',
      }],
      actionRecords: [{
        id: 'action-local-review-current',
        actionType: 'review-action-records',
        title: '行动复盘',
        outcome: 'recorded',
        actorLabel: '内容负责人',
        inputSummary: '复盘行动记录。',
        outputSummary: '抖音 Prompt 已交接，下一轮优先补拍午后补涂 9:16 素材。',
        writeBackSummary: '复盘已生成 1 个下一轮信号、1 个复盘目标和 1 个执行队列动作：复盘创建补素材清单。',
        syncStatus: 'synced',
        teamSync: {
          backend: 'bugu',
          status: 'synced',
          message: '复盘记录已同步。',
          workspaceId,
          revision: 'command-review-action-rev-2',
        },
        createdAt: '2026-05-31T00:30:00.000Z',
      }],
      constraints: [],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '品牌内容作战系统已同步到 Bugu 团队事实源。',
        workspaceId,
        revision: 'command-review-current-rev-2',
        baseRevision: 'command-review-action-rev-2',
      },
      createdAt: '2026-05-31T00:28:00.000Z',
      updatedAt: '2026-05-31T00:30:00.000Z',
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      { draftStatus: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }) },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        upsertCommandCenterSnapshot: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }),
        listCommandCenters: async ({ workspaceId: requestedWorkspaceId }) => {
          assert.equal(requestedWorkspaceId, workspaceId);
          return [{
            id: 'command-local-review-current',
            workspacePath,
            title: '团队旧品牌作战系统',
            status: 'active',
            syncStatus: 'synced',
            sourceKnowledgeMapId: 'map-command-local-review',
            sourceKnowledgeMapTitle: '复盘作战锚点地图',
            signals: [],
            objectives: [],
            resourceBundles: [],
            campaignCells: [],
            queueItems: [],
            actionRecords: [{
              id: 'action-team-review-current',
              actionType: 'generate-prompt-draft',
              title: '团队旧 Prompt 交接',
              outcome: 'handoff',
              actorLabel: '团队成员',
              inputSummary: '旧团队快照。',
              outputSummary: '已生成 Prompt。',
              promptDraftId: 'prompt-team-review-current',
              syncStatus: 'synced',
              teamSync: {
                backend: 'bugu',
                status: 'synced',
                message: '已同步。',
                workspaceId,
                revision: 'command-review-current-rev-1',
              },
              createdAt: '2026-05-31T00:29:00.000Z',
            }],
            constraints: [],
            gaps: [],
            teamSync: {
              backend: 'bugu',
              status: 'synced',
              message: '已从团队旧快照拉取。',
              workspaceId,
              revision: 'command-review-current-rev-1',
            },
            createdAt: '2026-05-31T00:28:00.000Z',
            updatedAt: '2026-05-31T00:29:00.000Z',
          }];
        },
      },
    );

    const [record] = await service.list(workspacePath);
    assert.equal(record.title, '本机复盘后的品牌作战系统');
    assert.equal(record.teamSync.revision, 'command-review-current-rev-2');
    assert.equal(record.signals.some((signal) => signal.sourceLabel === '行动记录复盘'), true);
    assert.equal(record.objectives.some((objective) => objective.type === 'material-gap'), true);
    assert.equal(record.resourceBundles.some((bundle) => bundle.gaps?.includes('午后补涂 9:16 素材')), true);
    assert.equal(record.campaignCells.some((cell) => cell.queueItemIds.includes('queue-local-review-current')), true);
    assert.equal(record.queueItems.some((item) => item.actionType === 'create-material-gap-list' && item.status === 'needs-resource'), true);
    assert.equal(record.actionRecords.some((item) => item.id === 'action-local-review-current'), true);
    assert.equal(record.actionRecords.some((item) => item.id === 'action-team-review-current'), true);
  });
});

test('v1 品牌战情室行动记录超过展示阈值也保留审计历史', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const now = '2026-05-30T00:10:00.000Z';
    const existingActions = Array.from({ length: 130 }, (_, index) => ({
      id: `action-history-${index}`,
      actionType: 'generate-prompt-draft',
      title: `历史行动 ${index}`,
      outcome: 'handoff',
      actorLabel: '内容运营',
      inputSummary: '历史审计记录。',
      outputSummary: '已完成交接。',
      createdAt: `2026-05-30T00:${String(index).padStart(2, '0')}:00.000Z`,
    }));
    await commandStore.save({
      id: 'command-history-1',
      workspacePath,
      title: '行动记录历史战情室',
      status: 'active',
      syncStatus: 'synced',
      signals: [],
      objectives: [],
      resourceBundles: [],
      campaignCells: [],
      queueItems: [],
      actionRecords: existingActions,
      constraints: [],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步。',
        workspaceId: 'workspace-history-1',
        revision: 'history-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      new ContentKnowledgeMapStore(),
      { draftStatus: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }) },
      {
        appendActionRecord: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }),
        listActionRecords: async () => ({
          records: [{
            id: 'team-action-history-new',
            actionType: 'create-scene-card',
            title: '团队新行动',
            outcome: 'handoff',
            actorLabel: '团队成员',
            inputSummary: '团队工作区记录。',
            outputSummary: '已同步到本机。',
            createdAt: '2026-05-30T02:30:00.000Z',
          }],
          teamSync: {
            backend: 'bugu',
            status: 'synced',
            message: '已刷新团队行动记录。',
            workspaceId: 'workspace-history-1',
            revision: 'history-rev-2',
          },
        }),
      },
    );

    const refreshed = await service.refreshActions({
      workspacePath,
      commandCenterId: 'command-history-1',
    });
    assert.equal(refreshed.actionRecords.length, 131);
    assert.equal(refreshed.actionRecords.some((record) => record.id === 'action-history-0'), true);
    assert.equal(refreshed.actionRecords.some((record) => record.id === 'action-history-129'), true);
    assert.equal(refreshed.actionRecords[0].id, 'team-action-history-new');
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

      const workflows = new WorkflowStore();
      const definition = (await workflows.listDefinitions(workspaceB)).find((item) => item.status === 'published');
      assert.ok(definition);
      const run = await workflows.startRun({
        workspacePath: workspaceB,
        workflowDefinitionId: definition.id,
        inputs: { intent: '用户 B 基于团队知识包继续生产内容。' },
        teamKnowledgeRelease: handoffResult.promptDraft?.teamKnowledgeRelease,
      });
      assert.equal(run.teamKnowledgeRelease?.id, released.release.serverReleaseId);
      assert.ok(run.artifactRefs.includes(`team-knowledge-release:${released.release.serverReleaseId}`));
    });
  });
});

test('生产交接会把团队知识包版本绑定到 Prompt 草稿', async () => {
  await withWorkspace(async (workspacePath) => {
    const now = '2026-05-28T00:00:00.000Z';
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const reviewStore = new ContentReviewTaskStore();
    const commandStore = new BrandCommandCenterStore();
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
      commandStore,
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
    await commandStore.save({
      id: 'command-handoff-1',
      workspacePath,
      title: '团队知识包交接战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-handoff-release-1',
      sourceKnowledgeMapTitle: '团队知识包交接地图',
      signals: [],
      objectives: [],
      resourceBundles: [],
      campaignCells: [],
      queueItems: [],
      actionRecords: [],
      constraints: [],
      gaps: [],
      teamSync: { backend: 'bugu', status: 'synced', message: '已同步。', revision: 'command-rev-1' },
      createdAt: now,
      updatedAt: now,
    });
    const seededBlockedCommandCenter = (await commandStore.list(workspacePath))[0];
    assert.ok(seededBlockedCommandCenter);
    await commandStore.update({
      ...seededBlockedCommandCenter,
      resourceBundles: [{
        id: 'bundle-handoff-blocked-1',
        title: '拦截资源包',
        objectiveId: 'objective-handoff-blocked-1',
        sourceKnowledgeMapId: 'map-handoff-blocked-1',
        sellingPointRefs: ['绝对安全'],
        evidenceRefs: ['evidence-blocked-1'],
        sceneRefs: [],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: [],
        sopRefs: [],
        constraints: [],
        gaps: [],
        readyPercent: 80,
      }],
      campaignCells: [{
        id: 'cell-handoff-blocked-1',
        title: '拦截作战单元',
        objectiveId: 'objective-handoff-blocked-1',
        ownerRole: '内容运营',
        agentRole: '内容工程 Agent',
        channels: ['抖音'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-handoff-blocked-1',
        decisionChecks: [],
        queueItemIds: [],
      }],
    });
    const seededCommandCenter = (await commandStore.list(workspacePath))[0];
    assert.ok(seededCommandCenter);
    await commandStore.update({
      ...seededCommandCenter,
      resourceBundles: [{
        id: 'bundle-handoff-1',
        title: '交接资源包',
        objectiveId: 'objective-handoff-1',
        sourceKnowledgeMapId: 'map-handoff-release-1',
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: ['evidence-handoff-1'],
        sceneRefs: [],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: [],
        sopRefs: [],
        constraints: [],
        gaps: [],
        readyPercent: 80,
      }],
      campaignCells: [{
        id: 'cell-handoff-1',
        title: '交接作战单元',
        objectiveId: 'objective-handoff-1',
        ownerRole: '内容运营',
        agentRole: '内容工程 Agent',
        channels: ['小红书'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-handoff-1',
        decisionChecks: [],
        queueItemIds: [],
      }],
    });

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
    assert.match(result.record?.actionRecords[0].nextStep ?? '', /Prompt 工作台/);
    assert.equal(result.record?.syncStatus, 'synced');
    assert.equal(result.record?.teamSync?.revision, 'handoff-action-rev-1');
    assert.equal(result.record?.actionRecords[0].syncStatus, 'synced');
    assert.equal(actionSyncCalls.length, 1);
    const [commandCenter] = await commandStore.list(workspacePath);
    assert.equal(commandCenter.actionRecords.length, 1);
    assert.equal(commandCenter.actionRecords[0].actionType, 'generate-prompt-draft');
    assert.equal(commandCenter.actionRecords[0].outcome, 'handoff');
    assert.equal(commandCenter.actionRecords[0].syncStatus, 'synced');
    assert.equal(commandCenter.teamSync?.revision, 'handoff-action-rev-1');
    assert.equal(commandCenter.resourceBundles[0].handoffStatus, 'handed-off');
    assert.deepEqual(commandCenter.resourceBundles[0].promptDraftIds, [result.promptDraft?.id]);
    assert.match(commandCenter.resourceBundles[0].lastHandoffSummary ?? '', /Prompt 草稿/);
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

test('生产交接能把审核通过组合创建为 SOP 运行记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const now = '2026-05-29T00:00:00.000Z';
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const reviewStore = new ContentReviewTaskStore();
    const commandStore = new BrandCommandCenterStore();
    const workflows = new WorkflowStore();
    const text = new FakeTextGenerationService();
    const syncCalls = [];
    const service = new ContentProductionHandoffService(
      reviewStore,
      mapStore,
      releaseStore,
      new PromptDraftStore(new InputSourceStore(), text),
      new SceneLibraryStore(new GenerationLogStore(), new PromptPackService(new GenerationLogStore(), text), text),
      new ContentProductionHandoffStore(),
      {
        syncProductionHandoffActions: async (input) => {
          syncCalls.push(input);
          assert.equal(input.sourceKnowledgeMapId, 'map-handoff-sop-1');
          assert.equal(input.actions.length, 1);
          assert.equal(input.actions[0].actionType, 'launch-sop-run');
          assert.ok(input.actions[0].workflowRunId);
          assert.doesNotMatch(JSON.stringify(input.actions), new RegExp(workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
          return {
            backend: 'bugu',
            status: 'synced',
            message: 'SOP 交接行动记录已同步。',
            workspaceId: 'workspace-handoff-sop-1',
            revision: 'handoff-sop-rev-2',
          };
        },
      },
      commandStore,
      workflows,
    );

    await mapStore.save({
      id: 'map-handoff-sop-1',
      workspacePath,
      title: 'SOP 交接内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-handoff-sop-1',
        revision: 'sop-map-rev-1',
        releaseId: 'release-handoff-sop-1',
      },
      sourceInputSourceIds: ['source-handoff-sop-1'],
      brandKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-handoff-sop-1',
        title: '通勤补涂轻薄感',
        summary: '把通勤补涂痛点转为 SOP 生产输入。',
        tags: ['卖点', 'SOP'],
        sourceRefs: ['input-source:source-handoff-sop-1'],
        evidenceRefs: ['evidence-handoff-sop-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-handoff-sop-1'],
        confidence: 92,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-handoff-sop-1',
        sourceType: 'manual',
        sourceTitle: '用户调研',
        claim: '通勤用户关注补涂后的轻薄肤感。',
        excerpt: '用户反馈显示，补涂不闷肤是核心购买理由。',
        status: 'ready',
      }],
      constraints: ['不得写成绝对防晒效果。'],
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
      id: 'local-release-handoff-sop-1',
      workspacePath,
      workspaceId: 'workspace-handoff-sop-1',
      contentKnowledgeMapId: 'map-handoff-sop-1',
      contentKnowledgeMapTitle: 'SOP 交接内容地图',
      title: 'SOP 内容团队包',
      version: 'v1.0',
      status: 'published',
      packageObjectKey: 'content-workspaces/workspace-handoff-sop-1/agentknowledge/release-handoff-sop-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-handoff-sop-1/agentknowledge/release-handoff-sop-1.zip',
      packageUploadStatus: 'stored',
      files: ['KNOWLEDGE.md', 'ontology/ontology.json'],
      issues: [],
      baseRevision: 'sop-map-rev-1',
      serverReleaseId: 'release-handoff-sop-1',
      createdAt: now,
      updatedAt: now,
    });
    await reviewStore.saveMany(workspacePath, [{
      id: 'review-handoff-sop-1',
      workspacePath,
      sourceKnowledgeMapId: 'map-handoff-sop-1',
      sourceKnowledgeMapTitle: 'SOP 交接内容地图',
      targetType: 'selling-point',
      targetId: 'selling-handoff-sop-1',
      title: '通勤补涂轻薄感',
      summary: '已确认可作为 SOP 输入。',
      evidenceRefs: ['evidence-handoff-sop-1'],
      sourceRefs: ['input-source:source-handoff-sop-1'],
      risk: 'low',
      status: 'approved',
      suggestedAction: 'approve',
      issueLabels: [],
      decisions: [],
      createdAt: now,
      updatedAt: now,
    }]);
    await commandStore.save({
      id: 'command-handoff-sop-1',
      workspacePath,
      title: 'SOP 交接战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-handoff-sop-1',
      sourceKnowledgeMapTitle: 'SOP 交接内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-handoff-sop-1',
        title: 'SOP 交接资源包',
        objectiveId: 'objective-handoff-sop-1',
        sourceKnowledgeMapId: 'map-handoff-sop-1',
        sellingPointRefs: ['通勤补涂轻薄感'],
        evidenceRefs: ['evidence-handoff-sop-1'],
        sceneRefs: ['通勤补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: ['asset-handoff-sop-1'],
        sopRefs: [],
        constraints: ['不得写成绝对防晒效果。'],
        gaps: [],
        readyPercent: 100,
      }],
      campaignCells: [],
      queueItems: [],
      actionRecords: [],
      constraints: [],
      gaps: [],
      teamSync: { backend: 'bugu', status: 'synced', message: '已同步。', revision: 'command-sop-rev-1' },
      createdAt: now,
      updatedAt: now,
    });

    const result = await service.create({
      workspacePath,
      reviewTaskId: 'review-handoff-sop-1',
      target: 'sop-run',
      workflowDefinitionId: 'workflow-brand-scene-prompts',
      actorLabel: '功能测试',
    });

    assert.equal(result.status, 'created');
    assert.ok(result.workflowRun);
    assert.equal(result.workflowRun.teamKnowledgeRelease?.id, 'release-handoff-sop-1');
    assert.equal(result.workflowRun.workflowDefinitionId, 'workflow-brand-scene-prompts');
    assert.deepEqual(result.workflowRun.inputSourceIds, ['source-handoff-sop-1']);
    assert.match(result.workflowRun.inputs.intent, /通勤补涂轻薄感/);
    assert.ok(result.workflowRun.artifactRefs.includes('team-knowledge-release:release-handoff-sop-1'));
    assert.equal(result.record?.workflowRunId, result.workflowRun.id);
    assert.equal(result.record?.actionRecords[0].actionType, 'launch-sop-run');
    assert.equal(result.record?.actionRecords[0].workflowRunId, result.workflowRun.id);
    assert.match(result.record?.actionRecords[0].outputSummary ?? '', /SOP 运行/);
    assert.equal(syncCalls.length, 1);
    const [commandCenter] = await commandStore.list(workspacePath);
    assert.equal(commandCenter.actionRecords[0].actionType, 'launch-sop-run');
    assert.equal(commandCenter.actionRecords[0].workflowRunId, result.workflowRun.id);
    assert.ok(commandCenter.resourceBundles[0].handoffRefs?.includes(`workflow-run:${result.workflowRun.id}`));
  });
});

test('生产交接启动 SOP 会经过真实 WorkflowEngine 并生成步骤产物', async () => {
  await withWorkspace(async (workspacePath) => {
    const now = '2026-05-30T00:00:00.000Z';
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const reviewStore = new ContentReviewTaskStore();
    const inputSources = new InputSourceStore();
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const promptPacks = new PromptPackService(logs, text);
    const sceneCards = new SceneLibraryStore(logs, promptPacks, text);
    const brandKnowledgeBases = new BrandKnowledgeBaseStore(text);
    const workflows = new WorkflowStore();
    const workflowEngine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      new AgentPromptSessionStore(inputSources, promptDrafts, text, new FakePromptAgentService()),
      new MediaProvider({ readView: async () => ({ imageProvider: 'disabled', videoProvider: 'disabled' }) }, logs),
      undefined,
      brandKnowledgeBases,
      promptPacks,
      sceneCards,
    );
    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '通勤防晒产品资料',
      text: '产品事实：便携条包，通勤补涂不黏腻。合规边界：不得承诺治疗、绝对防护或无依据背书。',
      summary: '通勤防晒产品资料',
      tags: ['功能测试', 'SOP 交接'],
    });
    const service = new ContentProductionHandoffService(
      reviewStore,
      mapStore,
      releaseStore,
      promptDrafts,
      sceneCards,
      new ContentProductionHandoffStore(),
      {
        syncProductionHandoffActions: async (input) => ({
          backend: 'bugu',
          status: 'synced',
          message: `已同步 ${input.actions.length} 条 SOP 交接行动记录。`,
          workspaceId: 'workspace-engine-handoff-1',
          revision: 'engine-handoff-rev-1',
        }),
      },
      undefined,
      workflowEngine,
    );

    await mapStore.save({
      id: 'map-engine-handoff-1',
      workspacePath,
      title: '执行型 SOP 交接地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-engine-handoff-1',
        revision: 'engine-map-rev-1',
        releaseId: 'release-engine-handoff-1',
      },
      sourceInputSourceIds: [source.id],
      brandKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-engine-handoff-1',
        title: '通勤补涂不黏腻',
        summary: '把通勤补涂不黏腻卖点转为 SOP 生产输入。',
        tags: ['卖点', 'SOP'],
        sourceRefs: [`input-source:${source.id}`],
        evidenceRefs: ['evidence-engine-handoff-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-engine-handoff-1'],
        confidence: 93,
        status: 'ready',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-engine-handoff-1',
        sourceType: 'product-brief',
        sourceTitle: '通勤防晒产品资料',
        claim: '便携条包适合通勤补涂，不黏腻。',
        excerpt: '产品事实：便携条包，通勤补涂不黏腻。',
        status: 'ready',
      }],
      constraints: ['不得承诺治疗、绝对防护或无依据背书。'],
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
      id: 'local-release-engine-handoff-1',
      workspacePath,
      workspaceId: 'workspace-engine-handoff-1',
      contentKnowledgeMapId: 'map-engine-handoff-1',
      contentKnowledgeMapTitle: '执行型 SOP 交接地图',
      title: '执行型 SOP 团队包',
      version: 'v1.0',
      status: 'published',
      packageObjectKey: 'content-workspaces/workspace-engine-handoff-1/agentknowledge/release-engine-handoff-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-engine-handoff-1/agentknowledge/release-engine-handoff-1.zip',
      packageUploadStatus: 'stored',
      files: ['KNOWLEDGE.md', 'ontology/ontology.json'],
      issues: [],
      baseRevision: 'engine-map-rev-1',
      serverReleaseId: 'release-engine-handoff-1',
      createdAt: now,
      updatedAt: now,
    });
    await reviewStore.saveMany(workspacePath, [{
      id: 'review-engine-handoff-1',
      workspacePath,
      sourceKnowledgeMapId: 'map-engine-handoff-1',
      sourceKnowledgeMapTitle: '执行型 SOP 交接地图',
      targetType: 'selling-point',
      targetId: 'selling-engine-handoff-1',
      title: '通勤补涂不黏腻',
      summary: '已确认可作为执行型 SOP 输入。',
      evidenceRefs: ['evidence-engine-handoff-1'],
      sourceRefs: [`input-source:${source.id}`],
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
      reviewTaskId: 'review-engine-handoff-1',
      target: 'sop-run',
      workflowDefinitionId: 'workflow-brand-scene-prompts',
      actorLabel: '功能测试',
    });

    assert.equal(result.status, 'created');
    assert.equal(result.workflowRun?.workflowDefinitionId, 'workflow-brand-scene-prompts');
    assert.equal(result.workflowRun?.teamKnowledgeRelease?.id, 'release-engine-handoff-1');
    assert.equal(result.workflowRun?.status, 'queued');
    assert.match(result.workflowRun?.summary ?? '', /人工审核/);
    assert.equal(result.workflowRun?.steps.find((step) => step.stepId === 'brand_extract')?.status, 'succeeded');
    assert.equal(result.workflowRun?.steps.find((step) => step.stepId === 'prompt_pack')?.status, 'succeeded');
    assert.equal(result.workflowRun?.steps.find((step) => step.stepId === 'scene_library')?.status, 'succeeded');
    assert.equal(result.workflowRun?.steps.find((step) => step.stepId === 'prompt_group')?.status, 'succeeded');
    assert.equal(result.workflowRun?.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.ok(result.workflowRun?.artifactRefs.some((ref) => ref.startsWith('brand-knowledge-base:')));
    assert.ok(result.workflowRun?.artifactRefs.some((ref) => ref.startsWith('prompt-pack:')));
    assert.ok(result.workflowRun?.artifactRefs.some((ref) => ref.startsWith('scene-card:')));
    assert.ok(result.workflowRun?.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
    const [storedRun] = await workflows.listRuns(workspacePath);
    assert.equal(storedRun.id, result.workflowRun?.id);
    assert.equal(storedRun.status, 'queued');
    const storedDrafts = await promptDrafts.list(workspacePath);
    assert.ok(storedDrafts.some((draft) => draft.workflowRunId === result.workflowRun?.id));
    const storedSceneCards = await sceneCards.list(workspacePath);
    assert.ok(storedSceneCards.some((card) => card.workflowRunId === result.workflowRun?.id));
  });
});

test('生产交接被发布检查拦截时也会写入行动记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const now = '2026-05-29T00:00:00.000Z';
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const reviewStore = new ContentReviewTaskStore();
    const handoffStore = new ContentProductionHandoffStore();
    const commandStore = new BrandCommandCenterStore();
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
      commandStore,
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
    await commandStore.save({
      id: 'command-handoff-blocked-1',
      workspacePath,
      title: '拦截交接战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-handoff-blocked-1',
      sourceKnowledgeMapTitle: '拦截交接地图',
      signals: [],
      objectives: [],
      resourceBundles: [],
      campaignCells: [],
      queueItems: [],
      actionRecords: [],
      constraints: [],
      gaps: [],
      teamSync: { backend: 'bugu', status: 'synced', message: '已同步。' },
      createdAt: now,
      updatedAt: now,
    });

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
    const [commandCenter] = await commandStore.list(workspacePath);
    assert.equal(commandCenter.actionRecords[0].actionType, 'content-production-blocked');
    assert.equal(commandCenter.actionRecords[0].outcome, 'blocked');
    assert.match(commandCenter.actionRecords[0].blockedReason ?? '', /禁用或绝对化表达/);
    assert.equal(commandCenter.resourceBundles[0].handoffStatus, 'blocked');
    assert.match(commandCenter.resourceBundles[0].lastBlockedReason ?? '', /禁用或绝对化表达/);
  });
});

test('SOP 运行记录会保留团队知识包版本', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const definitions = await workflows.listDefinitions(workspacePath);
    const definition = definitions.find((item) => item.status === 'published');
    assert.ok(definition);

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: { intent: '基于已审核团队知识包生成内容任务。' },
      teamKnowledgeRelease: {
        id: 'release-sop-1',
        title: '防晒内容团队包',
        version: 'v1.4',
        contentKnowledgeMapId: 'map-sop-1',
        packageObjectKey: 'content-workspaces/workspace-sop/agentknowledge/release-sop-1.zip',
        packageUploadStatus: 'stored',
      },
    });

    assert.equal(run.teamKnowledgeRelease?.id, 'release-sop-1');
    assert.ok(run.artifactRefs.includes('team-knowledge-release:release-sop-1'));
  });
});

test('SOP 执行可以显式选择团队知识包版本', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const inputSources = new InputSourceStore();
    const text = new FakeTextGenerationService();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text, new FakePromptAgentService());
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, new GenerationLogStore());
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'product-commercial-assets');
    assert.ok(definition, '应存在产品商业素材 SOP');

    const productBrief = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '团队版便携条包产品资料',
      tags: ['产品资料', 'SOP 团队知识包'],
      text: '产品名称：团队版便携条包\n卖点：通勤随手取用\n规格：15g * 20 条\n禁用表达：不得承诺治疗。',
    });
    const skuTable = await inputSources.register({
      workspacePath,
      kind: 'sku-table',
      purpose: 'product-brief',
      title: '团队版 SKU 表',
      tags: ['sku'],
      text: 'SKU,规格,价格\nteam-20,15g*20条,99',
    });
    const teamKnowledgeRelease = {
      id: 'release-sop-selected-1',
      title: '团队版便携条包知识包',
      version: 'v1.6',
      contentKnowledgeMapId: 'map-sop-selected-1',
      contentKnowledgeMapTitle: '团队版便携条包内容地图',
      packageObjectKey: 'content-workspaces/workspace-sop-selected/agentknowledge/release-sop-selected-1.zip',
      packageUploadStatus: 'stored',
    };

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [productBrief.id, skuTable.id],
      inputs: {
        source: '产品资料和 SKU 表',
        intent: '使用已发布团队口径生成电商素材 Prompt。',
        reviewOwner: '内容负责人',
        platform: '天猫 / 淘宝',
      },
      teamKnowledgeRelease,
    });

    assert.equal(run.teamKnowledgeRelease?.id, 'release-sop-selected-1');
    assert.equal(run.teamKnowledgeRelease?.version, 'v1.6');
    assert.ok(run.artifactRefs.includes('team-knowledge-release:release-sop-selected-1'));
    const [storedRun] = await workflows.listRuns(workspacePath);
    assert.equal(storedRun.teamKnowledgeRelease?.id, 'release-sop-selected-1');
    assert.ok(storedRun.artifactRefs.includes('team-knowledge-release:release-sop-selected-1'));
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

test('品牌作战行动记录能追加到团队工作区', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const now = '2026-05-28T00:00:00.000Z';
    await mapStore.save({
      id: 'map-action-1',
      workspacePath,
      title: '防晒内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-action-test',
        revision: 'map-action-rev-1',
        releaseId: 'release-action-1',
      },
      sourceInputSourceIds: ['source-action-1'],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: ['抖音平台发布规则：功效表达必须引用证据，禁用绝对化表达。'],
      matrixRows: [{
        id: 'row-action-1',
        title: '通勤补涂轻薄感',
        summary: '基于防晒轻薄卖点和通勤场景生成 Prompt 草稿。',
        tags: ['防晒', '通勤'],
        sourceRefs: ['input-source:source-action-1'],
        evidenceRefs: ['evidence-action-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-action-1'],
        confidence: 91,
        status: 'ready',
      }],
      validationIssues: [],
      gaps: [],
      coverageSummary: {
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
      id: 'local-release-action-1',
      workspacePath,
      workspaceId: 'workspace-action-test',
      contentKnowledgeMapId: 'map-action-1',
      contentKnowledgeMapTitle: '防晒内容地图',
      title: '防晒团队知识包',
      version: 'v1.4',
      status: 'published',
      packageObjectKey: 'content-workspaces/workspace-action-test/agentknowledge/release-action-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-action-test/agentknowledge/release-action-1.zip',
      packageUploadStatus: 'stored',
      packageArchiveSha256: 'release-action-sha',
      packageArchiveSize: 1024,
      files: ['KNOWLEDGE.md'],
      issues: [],
      baseRevision: 'map-action-rev-1',
      serverReleaseId: 'release-action-1',
      createdAt: now,
      updatedAt: now,
    });
    await commandStore.save({
      id: 'command-center-action-1',
      workspacePath,
      title: '防晒内容品牌战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-action-1',
      sourceKnowledgeMapTitle: '防晒内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-1',
        title: '通勤场景资源包',
        objectiveId: 'objective-1',
        sourceKnowledgeMapId: 'map-action-1',
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: ['evidence-action-1'],
      sceneRefs: ['通勤补涂'],
      sceneCardIds: [],
      promptDraftIds: [],
      materialRefs: ['asset-action-1'],
      sopRefs: [],
      dimensions: {
        audiences: ['城市通勤女性'],
        channels: ['抖音'],
        contentFormats: ['15 秒口播短视频'],
        useCases: ['早高峰补涂'],
      },
      constraints: ['抖音平台发布规则：功效表达必须引用证据，禁用绝对化表达。'],
      gaps: [],
      readyPercent: 100,
      }],
      campaignCells: [{
        id: 'campaign-cell-1',
        title: '通勤场景转化',
        objectiveId: 'objective-1',
        ownerRole: '内容负责人',
      agentRole: '内容工程 Agent',
      channels: ['小红书'],
      dimensions: {
        audiences: ['城市通勤女性'],
        channels: ['抖音'],
        contentFormats: ['15 秒口播短视频'],
        useCases: ['早高峰补涂'],
      },
      timeWindow: '今天',
        resourceBundleId: 'bundle-1',
        decisionChecks: [{
          key: 'evidence',
          label: '证据',
          status: 'passed',
          message: '已关联 1 条证据。',
        }, {
          key: 'material',
          label: '素材',
          status: 'passed',
          message: '已关联 1 条素材线索。',
        }, {
          key: 'platform-rule',
          label: '平台规则',
          status: 'passed',
          message: '抖音短视频发布前复核功效证据和禁用词。',
        }],
        queueItemIds: ['queue-action-1'],
      }],
      queueItems: [{
        id: 'queue-action-1',
        campaignCellId: 'campaign-cell-1',
        actionType: 'generate-prompt-draft',
        title: '生成通勤场景 Prompt 草稿',
        summary: '基于防晒轻薄卖点和通勤场景生成 Prompt 草稿。',
        status: 'ready',
      outputTarget: 'prompt-draft',
      resourceBundleId: 'bundle-1',
      dimensions: {
        audiences: ['城市通勤女性'],
        channels: ['抖音'],
        contentFormats: ['15 秒口播短视频'],
        useCases: ['早高峰补涂'],
      },
      createdAt: now,
      updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['抖音平台发布规则：功效表达必须引用证据，禁用绝对化表达。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'action-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const syncCalls = [];
    const promptDraftStore = new PromptDraftStore(new InputSourceStore(), new FakeTextGenerationService());
    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'action-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ commandCenterId, record }) => {
          syncCalls.push({ commandCenterId, record });
          assert.equal(commandCenterId, 'command-center-action-1');
          assert.equal(record.queueItemId, 'queue-action-1');
          assert.equal(record.outcome, 'handoff');
          assert.equal(record.teamKnowledgeRelease?.id, 'release-action-1');
          return {
            backend: 'bugu',
            status: 'synced',
            message: '行动记录已同步到测试团队工作区。',
            workspaceId: 'workspace-action-test',
            revision: 'action-rev-2',
            baseRevision: 'action-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ commandCenterId, items }) => {
          assert.equal(commandCenterId, 'command-center-action-1');
          assert.equal(items.length, 1);
          assert.equal(items[0].id, 'queue-action-1');
          assert.equal(items[0].status, 'handed-off');
          return {
            backend: 'bugu',
            status: 'synced',
            message: '执行队列已同步到测试团队工作区。',
            workspaceId: 'workspace-action-test',
            revision: 'queue-rev-2',
            baseRevision: 'action-rev-2',
          };
        },
      },
      promptDraftStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      releaseStore,
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-center-action-1',
      queueItemId: 'queue-action-1',
      actorLabel: '功能测试',
      note: '已交给 Prompt 工作台确认。',
    });
    const updatedQueueItem = updated.queueItems.find((item) => item.id === 'queue-action-1');
    assert.equal(updatedQueueItem?.status, 'handed-off');
    assert.equal(updatedQueueItem?.syncStatus, 'synced');
    assert.equal(updatedQueueItem?.teamSync?.revision, 'queue-rev-2');
    assert.equal(updated.actionRecords.length, 1);
    assert.ok(updated.actionRecords[0].promptDraftId);
    assert.equal(updated.actionRecords[0].teamKnowledgeRelease?.id, 'release-action-1');
    assert.equal(updated.actionRecords[0].syncStatus, 'synced');
    assert.equal(updated.actionRecords[0].teamSync?.revision, 'action-rev-2');
    assert.equal(updated.resourceBundles[0].handoffStatus, 'handed-off');
    assert.deepEqual(updated.resourceBundles[0].promptDraftIds, [updated.actionRecords[0].promptDraftId]);
    assert.match(updated.resourceBundles[0].lastHandoffSummary ?? '', /Prompt 草稿/);
    assert.equal(updated.syncStatus, 'synced');
    assert.equal(syncCalls.length, 1);
    const drafts = await promptDraftStore.list(workspacePath);
    assert.equal(drafts.length, 1);
    assert.equal(drafts[0].id, updated.actionRecords[0].promptDraftId);
    assert.equal(drafts[0].contentKnowledgeMapId, 'map-action-1');
    assert.equal(drafts[0].teamKnowledgeRelease?.id, 'release-action-1');
    assert.ok(drafts[0].sourceRefs?.includes('content-knowledge-map:map-action-1'));
    assert.ok(drafts[0].sourceRefs?.includes('asset-review:asset-action-1'));
    assert.match(drafts[0].versions[0].content, /目标人群：城市通勤女性/);
    assert.match(drafts[0].versions[0].content, /渠道：抖音/);
    assert.match(drafts[0].versions[0].content, /内容形式：15 秒口播短视频/);
    assert.match(drafts[0].versions[0].content, /使用场景：早高峰补涂/);
  });
});

test('品牌作战不会把其他内容知识地图的团队知识包误绑定到队列产物', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const promptDraftStore = new PromptDraftStore(new InputSourceStore(), new FakeTextGenerationService());
    const now = '2026-05-30T00:00:00.000Z';
    await releaseStore.save({
      id: 'local-release-brand-command-other-1',
      workspacePath,
      workspaceId: 'workspace-brand-command-map-scope',
      contentKnowledgeMapId: 'map-brand-command-other-1',
      contentKnowledgeMapTitle: '其他项目内容地图',
      title: '其他项目团队知识包',
      version: 'v9.9',
      status: 'published',
      packageObjectKey: 'content-workspaces/workspace-brand-command-map-scope/agentknowledge/release-other.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-brand-command-map-scope/agentknowledge/release-other.zip',
      packageUploadStatus: 'stored',
      packageArchiveSha256: 'other-release-sha',
      packageArchiveSize: 4096,
      files: ['KNOWLEDGE.md'],
      issues: [],
      baseRevision: 'other-map-rev-1',
      serverReleaseId: 'release-brand-command-other-1',
      createdAt: now,
      updatedAt: now,
    });
    await mapStore.save({
      id: 'map-brand-command-no-release-1',
      workspacePath,
      title: '尚未发布团队知识包的品牌地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区，但尚未发布团队知识包。',
        workspaceId: 'workspace-brand-command-map-scope',
        revision: 'brand-command-no-release-map-rev-1',
      },
      sourceInputSourceIds: ['source-brand-command-no-release-1'],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: ['不能把其他项目团队知识包当成本项目默认口径。'],
      matrixRows: [{
        id: 'row-brand-command-no-release-1',
        title: '通勤补涂轻薄感',
        summary: '当前地图没有自己的团队知识包版本。',
        tags: ['防错绑'],
        sourceRefs: ['input-source:source-brand-command-no-release-1'],
        evidenceRefs: ['evidence-brand-command-no-release-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-brand-command-no-release-1'],
        confidence: 90,
        status: 'ready',
      }],
      validationIssues: [],
      gaps: [],
      coverageSummary: {
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
    await commandStore.save({
      id: 'command-center-brand-command-no-release-1',
      workspacePath,
      title: '无本项目团队知识包战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-brand-command-no-release-1',
      sourceKnowledgeMapTitle: '尚未发布团队知识包的品牌地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-brand-command-no-release-1',
        title: '通勤补涂资源包',
        objectiveId: 'objective-brand-command-no-release-1',
        sourceKnowledgeMapId: 'map-brand-command-no-release-1',
        coverageRowIds: ['row-brand-command-no-release-1'],
        sellingPointRefs: ['通勤补涂轻薄感'],
        evidenceRefs: ['evidence-brand-command-no-release-1'],
        sceneRefs: ['通勤补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: ['asset-brand-command-no-release-1'],
        sopRefs: [],
        dimensions: {
          audiences: ['通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['通勤补涂'],
        },
        constraints: ['抖音平台发布规则：不能使用其他项目团队知识包，发布前复核证据和禁用词。'],
        gaps: [],
        readyPercent: 100,
      }],
      campaignCells: [{
        id: 'campaign-cell-brand-command-no-release-1',
        title: '通勤补涂作战单元',
        objectiveId: 'objective-brand-command-no-release-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['抖音'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-brand-command-no-release-1',
        decisionChecks: [{
          key: 'evidence',
          label: '证据',
          status: 'passed',
          message: '证据已准备。',
        }, {
          key: 'platform-rule',
          label: '平台规则',
          status: 'passed',
          message: '抖音短视频发布前复核证据和禁用词。',
        }],
        queueItemIds: ['queue-brand-command-no-release-1'],
      }],
      queueItems: [{
        id: 'queue-brand-command-no-release-1',
        campaignCellId: 'campaign-cell-brand-command-no-release-1',
        actionType: 'generate-prompt-draft',
        title: '生成本项目 Prompt 草稿',
        summary: '当前地图尚未发布团队知识包，只能生成不带团队知识包版本的本机草稿。',
        status: 'ready',
        outputTarget: 'prompt-draft',
        resourceBundleId: 'bundle-brand-command-no-release-1',
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['不能把其他项目团队知识包当成本项目默认口径。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-brand-command-map-scope',
        revision: 'brand-command-no-release-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      { draftStatus: async () => ({ backend: 'bugu', status: 'synced', message: '已同步。' }) },
      {
        appendActionRecord: async ({ record }) => {
          assert.equal(record.teamKnowledgeRelease, undefined);
          return { backend: 'bugu', status: 'synced', message: '行动记录已同步。' };
        },
      },
      { syncExecutionQueue: async () => ({ backend: 'bugu', status: 'synced', message: '队列已同步。' }) },
      promptDraftStore,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      releaseStore,
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-center-brand-command-no-release-1',
      queueItemId: 'queue-brand-command-no-release-1',
      actorLabel: '功能测试',
    });
    const drafts = await promptDraftStore.list(workspacePath);
    assert.equal(updated.actionRecords[0].teamKnowledgeRelease, undefined);
    assert.equal(drafts[0].teamKnowledgeRelease, undefined);
    assert.doesNotMatch(drafts[0].versions[0].content, /团队知识包：其他项目团队知识包/);
  });
});

test('品牌战情室行动记录复盘会写入本机并同步团队记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-30T00:00:00.000Z';
    await commandStore.save({
      id: 'command-center-review-action-1',
      workspacePath,
      title: '行动复盘战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-review-action-1',
      sourceKnowledgeMapTitle: '行动复盘内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [],
      campaignCells: [],
      queueItems: [],
      actionRecords: [{
        id: 'action-before-review-1',
        actionType: 'generate-prompt-draft',
        title: '已交接 Prompt 草稿',
        outcome: 'handoff',
        actorLabel: '功能测试',
        inputSummary: '通勤补涂资源包',
        outputSummary: '已生成 Prompt 草稿。',
        createdAt: now,
      }],
      constraints: [],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-review-action-1',
        revision: 'review-action-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const syncCalls = [];
    const queueSyncCalls = [];
    const commandCenterSyncCalls = [];
    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          workspaceId: 'workspace-review-action-1',
          revision: 'review-action-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ commandCenterId, record }) => {
          syncCalls.push({ commandCenterId, record });
          assert.equal(commandCenterId, 'command-center-review-action-1');
          assert.equal(record.actionType, 'review-action-records');
          assert.equal(record.outcome, 'recorded');
          assert.match(record.outputSummary, /下一轮优先补拍/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '复盘记录已同步。',
            workspaceId: 'workspace-review-action-1',
            revision: 'review-action-rev-2',
            baseRevision: 'review-action-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ commandCenterId, items }) => {
          queueSyncCalls.push({ commandCenterId, items });
          assert.equal(commandCenterId, 'command-center-review-action-1');
          assert.equal(items.length, 1);
          assert.equal(items[0].actionType, 'create-material-gap-list');
          assert.equal(items[0].status, 'needs-resource');
          assert.match(items[0].summary, /午后补涂场景/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '复盘补资源队列已同步。',
            workspaceId: 'workspace-review-action-1',
            revision: 'review-action-rev-queue-1',
            baseRevision: 'review-action-rev-2',
          };
        },
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        upsertCommandCenterSnapshot: async ({ record }) => {
          commandCenterSyncCalls.push(record);
          assert.equal(record.id, 'command-center-review-action-1');
          assert.ok(record.signals.some((signal) => signal.sourceLabel === '行动记录复盘'));
          assert.ok(record.objectives.some((objective) => objective.type === 'material-gap'));
          assert.ok(record.queueItems.some((item) => item.actionType === 'create-material-gap-list'));
          return {
            backend: 'bugu',
            status: 'synced',
            message: '复盘后的品牌战情室快照已同步。',
            workspaceId: 'workspace-review-action-1',
            revision: 'review-action-rev-command-1',
            baseRevision: 'review-action-rev-queue-1',
          };
        },
      },
    );

    const updated = await service.recordReview({
      workspacePath,
      commandCenterId: 'command-center-review-action-1',
      summary: '抖音 Prompt 已交接，缺 9:16 通勤视频；下一轮优先补拍午后补涂场景。',
      actorLabel: '内容负责人',
      actorRole: 'content-engineer',
    });

    assert.equal(syncCalls.length, 1);
    assert.equal(queueSyncCalls.length, 1);
    assert.equal(commandCenterSyncCalls.length, 1);
    assert.equal(updated.signals.length, 1);
    assert.equal(updated.signals[0].type, 'manual');
    assert.match(updated.signals[0].title, /复盘信号/);
    assert.match(updated.signals[0].riskBoundary, /不能自动改写产品事实/);
    assert.equal(updated.objectives.length, 1);
    assert.equal(updated.objectives[0].type, 'material-gap');
    assert.equal(updated.resourceBundles.length, 1);
    assert.equal(updated.campaignCells.length, 1);
    assert.equal(updated.queueItems.length, 1);
    assert.equal(updated.queueItems[0].actionType, 'create-material-gap-list');
    assert.equal(updated.queueItems[0].status, 'needs-resource');
    assert.equal(updated.queueItems[0].syncStatus, 'synced');
    assert.equal(updated.queueItems[0].teamSync?.revision, 'review-action-rev-queue-1');
    assert.equal(updated.actionRecords.length, 2);
    assert.equal(updated.actionRecords[0].actionType, 'review-action-records');
    assert.equal(updated.actionRecords[0].actorRole, 'content-engineer');
    assert.equal(updated.actionRecords[0].syncStatus, 'synced');
    assert.equal(updated.actionRecords[0].teamSync?.revision, 'review-action-rev-2');
    assert.match(updated.actionRecords[0].writeBackSummary ?? '', /下一轮信号/);
    assert.match(updated.actionRecords[0].writeBackSummary ?? '', /执行队列动作/);
    assert.equal(updated.teamSync.revision, 'review-action-rev-command-1');
    assert.equal(updated.actionRecords[1].id, 'action-before-review-1');
  });
});

test('品牌战情室行动记录导出会生成本机交付文件并同步团队记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-30T00:00:00.000Z';
    await commandStore.save({
      id: 'command-center-export-action-1',
      workspacePath,
      title: '行动导出战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-export-action-1',
      sourceKnowledgeMapTitle: '行动导出内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [],
      campaignCells: [],
      queueItems: [],
      actionRecords: [{
        id: 'action-before-export-1',
        actionType: 'generate-prompt-draft',
        title: '已交接 Prompt 草稿',
        outcome: 'handoff',
        actorLabel: '功能测试',
        inputSummary: '通勤补涂资源包',
        outputSummary: `已生成 Prompt 草稿，草稿源文件在 ${workspacePath}/private-note.md。`,
        promptDraftId: 'prompt-before-export-1',
        createdAt: now,
      }],
      constraints: [],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-export-action-1',
        revision: 'export-action-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const syncCalls = [];
    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          workspaceId: 'workspace-export-action-1',
          revision: 'export-action-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ commandCenterId, record }) => {
          syncCalls.push({ commandCenterId, record });
          assert.equal(commandCenterId, 'command-center-export-action-1');
          assert.equal(record.actionType, 'export-action-records');
          assert.equal(record.outcome, 'recorded');
          assert.match(record.outputSummary, /action-records\.md/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '行动记录导出已同步。',
            workspaceId: 'workspace-export-action-1',
            revision: 'export-action-rev-2',
            baseRevision: 'export-action-rev-1',
          };
        },
      },
    );

    const result = await service.exportActionRecords({
      workspacePath,
      commandCenterId: 'command-center-export-action-1',
      actorLabel: '内容负责人',
      actorRole: 'content-engineer',
    });

    assert.equal(result.status, 'exported');
    assert.equal(syncCalls.length, 1);
    assert.ok(result.packageDir);
    assert.ok(result.markdownPath);
    assert.ok(result.jsonPath);
    assert.ok(result.manifestPath);
    assert.deepEqual(result.files, ['manifest.json', 'action-records.md', 'action-records.json']);
    assert.ok(result.markdownPath.startsWith(workspacePath));
    const markdown = await readFile(result.markdownPath, 'utf-8');
    const payload = JSON.parse(await readFile(result.jsonPath, 'utf-8'));
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf-8'));
    assert.match(markdown, /已交接 Prompt 草稿/);
    assert.match(markdown, /不包含账号凭证、API Key、自动发布指令或平台操控指令/);
    assert.equal(markdown.includes(workspacePath), false);
    assert.equal(payload.commandCenter.id, 'command-center-export-action-1');
    assert.equal(payload.actionRecords.length, 1);
    assert.equal(payload.safety.containsWorkspacePath, false);
    assert.equal(JSON.stringify(payload).includes(workspacePath), false);
    assert.deepEqual(manifest.files, result.files);
    assert.equal(result.commandCenter?.actionRecords[0].actionType, 'export-action-records');
    assert.equal(result.commandCenter?.actionRecords[0].syncStatus, 'synced');
    assert.equal(result.commandCenter?.actionRecords[0].teamSync?.revision, 'export-action-rev-2');
  });
});

test('品牌战情室主动作确认会写入行动记录并同步团队事实源', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-30T00:00:00.000Z';
    await commandStore.save({
      id: 'command-center-confirm-stage-1',
      workspacePath,
      title: '主动作确认战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-confirm-stage-1',
      sourceKnowledgeMapTitle: '主动作确认内容地图',
      signals: [{
        id: 'signal-confirm-stage-1',
        type: 'feedback-pain',
        title: '通勤用户担心闷肤',
        summary: '评论区持续追问夏天补涂是否闷肤。',
        sourceLabel: '评论反馈',
        businessValue: 86,
        evidenceReadiness: 72,
        urgency: 68,
        riskLevel: 20,
        productionCost: 36,
        recommendedObjectiveType: 'conversion',
        riskBoundary: '不能夸大防晒功效。',
        relatedMapRowIds: ['selling-confirm-stage-1'],
      }],
      objectives: [{
        id: 'objective-confirm-stage-1',
        type: 'conversion',
        title: '解释通勤补涂不闷肤',
        summary: '面向通勤人群解释轻薄补涂体验。',
        priority: 'P1',
        channels: ['抖音'],
        dimensions: {
          audiences: ['城市通勤女性'],
          channels: ['抖音'],
          contentFormats: ['15 秒口播短视频'],
          useCases: ['午后补涂'],
        },
        successCriteria: ['评论区能理解轻薄体验证据。'],
        signalIds: ['signal-confirm-stage-1'],
      }],
      resourceBundles: [{
        id: 'bundle-confirm-stage-1',
        title: '通勤补涂资源包',
        objectiveId: 'objective-confirm-stage-1',
        sourceKnowledgeMapId: 'map-confirm-stage-1',
        coverageRowIds: ['selling-confirm-stage-1'],
        approvedCoverageRowIds: ['selling-confirm-stage-1'],
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: ['evidence-confirm-stage-1'],
        sceneRefs: ['午后补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: ['asset-confirm-stage-1'],
        sopRefs: [],
        dimensions: {
          audiences: ['城市通勤女性'],
          channels: ['抖音'],
          contentFormats: ['15 秒口播短视频'],
          useCases: ['午后补涂'],
        },
        constraints: ['功效表达必须引用证据。'],
        gaps: [],
        readyPercent: 100,
      }],
      campaignCells: [{
        id: 'cell-confirm-stage-1',
        title: '通勤补涂转化单元',
        objectiveId: 'objective-confirm-stage-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['抖音'],
        dimensions: {
          audiences: ['城市通勤女性'],
          channels: ['抖音'],
          contentFormats: ['15 秒口播短视频'],
          useCases: ['午后补涂'],
        },
        timeWindow: '本周',
        resourceBundleId: 'bundle-confirm-stage-1',
        decisionChecks: [{
          key: 'evidence',
          label: '证据',
          status: 'passed',
          message: '已绑定用户反馈证据。',
        }],
        queueItemIds: ['queue-confirm-stage-1'],
      }],
      queueItems: [{
        id: 'queue-confirm-stage-1',
        campaignCellId: 'cell-confirm-stage-1',
        actionType: 'generate-prompt-draft',
        title: '生成通勤补涂 Prompt 草稿',
        summary: '基于轻薄不闷肤证据生成短视频 Prompt 草稿。',
        status: 'ready',
        outputTarget: 'prompt-draft',
        resourceBundleId: 'bundle-confirm-stage-1',
        dimensions: {
          audiences: ['城市通勤女性'],
          channels: ['抖音'],
          contentFormats: ['15 秒口播短视频'],
          useCases: ['午后补涂'],
        },
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['抖音平台发布规则：功效表达必须引用证据，禁用绝对化表达。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-confirm-stage-1',
        revision: 'confirm-stage-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const actionSyncCalls = [];
    const queueSyncCalls = [];
    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          workspaceId: 'workspace-confirm-stage-1',
          revision: 'confirm-stage-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ commandCenterId, record }) => {
          actionSyncCalls.push({ commandCenterId, record });
          assert.equal(commandCenterId, 'command-center-confirm-stage-1');
          return {
            backend: 'bugu',
            status: 'synced',
            message: '主动作确认已同步到测试团队工作区。',
            workspaceId: 'workspace-confirm-stage-1',
            revision: `confirm-action-rev-${actionSyncCalls.length}`,
            baseRevision: 'confirm-stage-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ commandCenterId, items, authorLabel }) => {
          queueSyncCalls.push({ commandCenterId, items, authorLabel });
          assert.equal(commandCenterId, 'command-center-confirm-stage-1');
          assert.equal(items.length, 1);
          assert.equal(items[0].id, 'queue-confirm-stage-1');
          assert.equal(authorLabel, '内容负责人');
          return {
            backend: 'bugu',
            status: 'synced',
            message: '执行队列已同步到测试团队工作区。',
            workspaceId: 'workspace-confirm-stage-1',
            revision: 'confirm-queue-rev-1',
            baseRevision: 'confirm-action-rev-2',
          };
        },
      },
    );

    const objectives = await service.confirmStage({
      workspacePath,
      commandCenterId: 'command-center-confirm-stage-1',
      stage: 'objectives',
      actorLabel: '内容负责人',
      actorRole: 'content-engineer',
    });
    assert.equal(objectives.actionRecords[0].actionType, 'confirm-objectives');
    assert.equal(objectives.actionRecords[0].outcome, 'recorded');
    assert.match(objectives.actionRecords[0].outputSummary, /作战目标/);

    const bundles = await service.confirmStage({
      workspacePath,
      commandCenterId: 'command-center-confirm-stage-1',
      stage: 'bundles',
      actorLabel: '内容负责人',
      actorRole: 'content-engineer',
    });
    assert.equal(bundles.actionRecords[0].actionType, 'confirm-resource-bundles');
    assert.equal(bundles.actionRecords[0].syncStatus, 'synced');
    assert.match(bundles.actionRecords[0].writeBackSummary ?? '', /作战单元/);

    const queue = await service.confirmStage({
      workspacePath,
      commandCenterId: 'command-center-confirm-stage-1',
      stage: 'queue',
      actorLabel: '内容负责人',
      actorRole: 'content-engineer',
    });
    assert.equal(queue.actionRecords[0].actionType, 'sync-execution-queue');
    assert.equal(queue.actionRecords[0].syncStatus, 'synced');
    assert.equal(queue.queueItems[0].syncStatus, 'synced');
    assert.equal(queue.queueItems[0].teamSync?.revision, 'confirm-queue-rev-1');
    assert.equal(queue.syncStatus, 'synced');
    assert.equal(actionSyncCalls.map((call) => call.record.actionType).join(','), 'confirm-objectives,confirm-resource-bundles,sync-execution-queue');
    assert.equal(queueSyncCalls.length, 1);
  });
});

test('品牌作战 create-scene-card 动作会生成真实场景卡并回填资源包', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-29T00:00:00.000Z';
    await mapStore.save({
      id: 'map-scene-action-1',
      workspacePath,
      title: '通勤防晒内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'scene-action-map-rev-1',
      },
      sourceInputSourceIds: ['source-scene-action-1'],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-scene-action-1',
        sourceType: 'input-source',
        sourceId: 'source-scene-action-1',
        title: '防晒轻薄实测',
        excerpt: '通勤补涂后肤感清爽。',
        trustLevel: 'high',
        status: 'ready',
      }],
      constraints: ['功效表达必须引用证据。'],
      matrixRows: [{
        id: 'row-scene-action-1',
        type: 'selling-point',
        title: '轻薄不闷肤',
        summary: '通勤补涂场景下强调轻薄肤感。',
        audience: '城市通勤人群',
        painPoint: '怕闷肤',
        sellingPoint: '轻薄不闷肤',
        scenario: '通勤补涂',
        channel: '小红书',
        evidenceRefs: ['evidence-scene-action-1'],
        sourceRefs: ['input-source:source-scene-action-1'],
      materialStatus: 'approved',
      materialRefs: ['asset-scene-action-1'],
      dimensions: {
        audiences: ['办公室通勤人群'],
        channels: ['抖音'],
        contentFormats: ['短视频'],
        useCases: ['午休前补涂'],
      },
      status: 'ready',
        priority: 90,
        confidence: 85,
        tags: ['卖点', '通勤'],
      }],
      validationIssues: [],
      gaps: [],
      coverageSummary: {
        sellingPointCount: 1,
        painPointCount: 0,
        scenarioCount: 1,
        evidenceReadyCount: 1,
        evidenceMissingCount: 0,
        materialCoveredCount: 1,
        materialMissingCount: 0,
        readyPercent: 100,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });
    await commandStore.save({
      id: 'command-center-scene-action-1',
      workspacePath,
      title: '场景卡作战室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-scene-action-1',
      sourceKnowledgeMapTitle: '通勤防晒内容地图',
      signals: [{
        id: 'signal-scene-action-1',
        type: 'feedback-pain',
        title: '通勤补涂怕闷肤',
        summary: '用户担心补涂后闷肤和妆面负担。',
        sourceLabel: '用户反馈',
        businessValue: 88,
        evidenceReadiness: 90,
        urgency: 80,
        riskLevel: 20,
        productionCost: 40,
        recommendedObjectiveType: 'conversion',
        riskBoundary: '不能夸大防晒效果。',
        relatedMapRowIds: ['row-scene-action-1'],
      }],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-scene-action-1',
        title: '通勤补涂资源包',
        objectiveId: 'objective-scene-action-1',
        sourceKnowledgeMapId: 'map-scene-action-1',
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: ['evidence-scene-action-1'],
        sceneRefs: ['通勤补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: ['asset-scene-action-1'],
        sopRefs: [],
        dimensions: {
          audiences: ['办公室通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['午休前补涂'],
        },
        constraints: ['抖音平台发布规则：功效表达必须引用证据，禁用绝对化表达。'],
        gaps: [],
        readyPercent: 100,
      }],
      campaignCells: [{
        id: 'campaign-cell-scene-action-1',
        title: '通勤补涂作战单元',
        objectiveId: 'objective-scene-action-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['小红书'],
        dimensions: {
          audiences: ['办公室通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['午休前补涂'],
        },
        timeWindow: '今天',
        resourceBundleId: 'bundle-scene-action-1',
        decisionChecks: [{
          key: 'evidence',
          label: '证据',
          status: 'passed',
          message: '证据已准备。',
        }],
        queueItemIds: ['queue-scene-action-1'],
      }],
      queueItems: [{
        id: 'queue-scene-action-1',
        campaignCellId: 'campaign-cell-scene-action-1',
        actionType: 'create-scene-card',
        title: '创建通勤补涂场景卡',
        summary: '把资源包转成可进入场景库的卡片。',
        status: 'ready',
        outputTarget: 'scene-card',
        resourceBundleId: 'bundle-scene-action-1',
        dimensions: {
          audiences: ['办公室通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['午休前补涂'],
        },
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['功效表达必须引用证据。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'scene-action-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const sceneCards = new SceneLibraryStore(logs, new PromptPackService(logs, text), text);
    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'scene-action-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ record }) => {
          assert.equal(record.outcome, 'handoff');
          assert.ok(record.sceneCardId);
          assert.match(record.outputSummary, /场景卡/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '场景卡行动记录已同步。',
            workspaceId: 'workspace-scene-action-test',
            revision: 'scene-action-rev-2',
            baseRevision: 'scene-action-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.equal(items[0].status, 'handed-off');
          return {
            backend: 'bugu',
            status: 'synced',
            message: '场景卡执行队列已同步。',
            workspaceId: 'workspace-scene-action-test',
            revision: 'scene-action-rev-3',
            baseRevision: 'scene-action-rev-2',
          };
        },
      },
      undefined,
      undefined,
      undefined,
      sceneCards,
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-center-scene-action-1',
      queueItemId: 'queue-scene-action-1',
      actorLabel: '功能测试',
    });
    assert.equal(updated.queueItems[0].status, 'handed-off');
    assert.equal(updated.actionRecords[0].syncStatus, 'synced');
    assert.ok(updated.actionRecords[0].sceneCardId);
    assert.deepEqual(updated.resourceBundles[0].sceneCardIds, [updated.actionRecords[0].sceneCardId]);
    assert.match(updated.resourceBundles[0].lastHandoffSummary ?? '', /场景卡/);

    const cards = await sceneCards.list(workspacePath);
    assert.equal(cards.length, 1);
    assert.equal(cards[0].id, updated.actionRecords[0].sceneCardId);
    assert.equal(cards[0].contentKnowledgeMapId, 'map-scene-action-1');
    assert.deepEqual(cards[0].coverageRowIds, ['row-scene-action-1']);
    assert.equal(cards[0].audience, '办公室通勤人群');
    assert.equal(cards[0].usageScene, '午休前补涂');
    assert.match(cards[0].voiceoverDirection, /抖音/);
    assert.match(cards[0].visualComposition, /短视频/);
    assert.ok(cards[0].sourceRefs?.includes('content-knowledge-map:map-scene-action-1'));
    assert.ok(cards[0].sourceRefs?.includes('asset-review:asset-scene-action-1'));
  });
});

test('品牌作战 launch-sop-run 动作会创建真实 SOP 运行并回填资源包', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const releaseStore = new ContentKnowledgeReleaseStore();
    const workflows = new WorkflowStore();
    const now = '2026-05-29T00:00:00.000Z';
    await mapStore.save({
      id: 'map-sop-action-1',
      workspacePath,
      title: '种草图内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'sop-action-map-rev-1',
        releaseId: 'release-sop-action-1',
      },
      sourceInputSourceIds: ['source-sop-action-1'],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: ['不得使用无依据对比。'],
      matrixRows: [{
        id: 'row-sop-action-1',
        title: '通勤补涂轻薄感',
        summary: '把通勤补涂痛点转成小红书种草图 SOP。',
        tags: ['卖点', '小红书'],
        sourceRefs: ['input-source:source-sop-action-1'],
        evidenceRefs: ['evidence-sop-action-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-sop-action-1'],
        confidence: 90,
        status: 'ready',
      }],
      validationIssues: [],
      gaps: [],
      coverageSummary: {
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
      id: 'local-release-sop-action-1',
      workspacePath,
      workspaceId: 'workspace-sop-action-test',
      contentKnowledgeMapId: 'map-sop-action-1',
      contentKnowledgeMapTitle: '种草图内容地图',
      title: '种草图团队知识包',
      version: 'v1.7',
      status: 'published',
      packageObjectKey: 'content-workspaces/workspace-sop-action-test/agentknowledge/release-sop-action-1.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-sop-action-test/agentknowledge/release-sop-action-1.zip',
      packageUploadStatus: 'stored',
      packageArchiveSha256: 'release-sop-action-sha',
      packageArchiveSize: 2048,
      files: ['KNOWLEDGE.md'],
      issues: [],
      baseRevision: 'sop-action-map-rev-1',
      serverReleaseId: 'release-sop-action-1',
      createdAt: now,
      updatedAt: now,
    });
    await commandStore.save({
      id: 'command-center-sop-action-1',
      workspacePath,
      title: 'SOP 作战室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-sop-action-1',
      sourceKnowledgeMapTitle: '种草图内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-sop-action-1',
        title: '小红书种草图资源包',
        objectiveId: 'objective-sop-action-1',
        sourceKnowledgeMapId: 'map-sop-action-1',
        sellingPointRefs: ['通勤补涂轻薄感'],
        evidenceRefs: ['evidence-sop-action-1'],
        sceneRefs: ['小红书通勤补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: ['asset-sop-action-1'],
        sopRefs: ['workflow-xiaohongshu-seeding-image'],
        dimensions: {
          audiences: ['通勤补涂用户'],
          channels: ['小红书'],
          contentFormats: ['图文'],
          useCases: ['通勤补涂'],
        },
        constraints: ['不得使用无依据对比。'],
        gaps: [],
        readyPercent: 100,
      }],
      campaignCells: [{
        id: 'campaign-cell-sop-action-1',
        title: '小红书种草图作战单元',
        objectiveId: 'objective-sop-action-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['小红书'],
        dimensions: {
          audiences: ['通勤补涂用户'],
          channels: ['小红书'],
          contentFormats: ['图文'],
          useCases: ['通勤补涂'],
        },
        timeWindow: '今天',
        resourceBundleId: 'bundle-sop-action-1',
        decisionChecks: [{
          key: 'sop',
          label: 'SOP',
          status: 'passed',
          message: '已绑定小红书图片 SOP。',
        }],
        queueItemIds: ['queue-sop-action-1'],
      }],
      queueItems: [{
        id: 'queue-sop-action-1',
        campaignCellId: 'campaign-cell-sop-action-1',
        actionType: 'launch-sop-run',
        title: '启动小红书图片 SOP',
        summary: '把资源包交给小红书种草图 SOP 形成运行记录。',
        status: 'ready',
        outputTarget: 'sop-run',
        resourceBundleId: 'bundle-sop-action-1',
        dimensions: {
          audiences: ['通勤补涂用户'],
          channels: ['小红书'],
          contentFormats: ['图文'],
          useCases: ['通勤补涂'],
        },
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['不得使用无依据对比。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'sop-action-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'sop-action-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ record }) => {
          assert.equal(record.outcome, 'handoff');
          assert.ok(record.workflowRunId);
          assert.equal(record.teamKnowledgeRelease?.id, 'release-sop-action-1');
          assert.match(record.outputSummary, /SOP 运行/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: 'SOP 行动记录已同步。',
            workspaceId: 'workspace-sop-action-test',
            revision: 'sop-action-rev-2',
            baseRevision: 'sop-action-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.equal(items[0].status, 'handed-off');
          return {
            backend: 'bugu',
            status: 'synced',
            message: 'SOP 执行队列已同步。',
            workspaceId: 'workspace-sop-action-test',
            revision: 'sop-action-rev-3',
            baseRevision: 'sop-action-rev-2',
          };
        },
      },
      undefined,
      undefined,
      undefined,
      undefined,
      workflows,
      undefined,
      undefined,
      releaseStore,
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-center-sop-action-1',
      queueItemId: 'queue-sop-action-1',
      actorLabel: '功能测试',
    });
    assert.equal(updated.queueItems[0].status, 'handed-off');
    assert.ok(updated.actionRecords[0].workflowRunId);
    assert.equal(updated.actionRecords[0].teamKnowledgeRelease?.id, 'release-sop-action-1');
    assert.ok(updated.resourceBundles[0].handoffRefs?.includes(`workflow-run:${updated.actionRecords[0].workflowRunId}`));
    assert.match(updated.resourceBundles[0].lastHandoffSummary ?? '', /SOP 运行/);

    const runs = await workflows.listRuns(workspacePath);
    assert.equal(runs.length, 1);
    assert.equal(runs[0].id, updated.actionRecords[0].workflowRunId);
    assert.equal(runs[0].workflowDefinitionId, 'workflow-xiaohongshu-seeding-image');
    assert.equal(runs[0].inputs.platform, '小红书');
    assert.match(runs[0].inputs.intent, /目标人群：通勤补涂用户/);
    assert.match(runs[0].inputs.intent, /内容形式：图文/);
    assert.match(runs[0].inputs.intent, /使用场景：通勤补涂/);
    assert.deepEqual(runs[0].inputSourceIds, ['source-sop-action-1']);
    assert.equal(runs[0].teamKnowledgeRelease?.id, 'release-sop-action-1');
    assert.equal(runs[0].status, 'queued');
  });
});

test('品牌作战 write-back-material-coverage 动作会回写素材覆盖并留下行动记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const assetStore = new AssetReviewStore();
    const now = '2026-05-29T00:00:00.000Z';
    const asset = await assetStore.review({
      workspacePath,
      assetKey: 'asset-material-action-key-1',
      kind: 'image',
      sourceType: 'manual',
      path: '/tmp/asset-material-action.png',
      title: '通勤补涂轻薄感素材',
      status: 'approved',
      tags: ['coverage:row-material-action-1', '高转化'],
    });
    const row = {
      id: 'row-material-action-1',
      title: '通勤补涂轻薄感',
      summary: '通勤补涂场景下强调轻薄肤感。',
      tags: ['卖点', '通勤补涂'],
      sourceRefs: ['input-source:source-material-action-1'],
      evidenceRefs: ['evidence-material-action-1'],
      materialStatus: 'missing',
      materialRefs: [],
      confidence: 88,
      status: 'ready',
    };
    await mapStore.save({
      id: 'map-material-action-1',
      workspacePath,
      title: '素材回写内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'material-action-map-rev-1',
      },
      sourceInputSourceIds: ['source-material-action-1'],
      brandKnowledgeBaseIds: [],
      ipKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [row],
      painPoints: [],
      scenarios: [],
      evidence: [],
      constraints: ['素材表现只能作为排序信号。'],
      matrixRows: [row],
      validationIssues: [],
      gaps: [],
      coverageSummary: {
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
    await commandStore.save({
      id: 'command-center-material-action-1',
      workspacePath,
      title: '素材回写作战室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-material-action-1',
      sourceKnowledgeMapTitle: '素材回写内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-material-action-1',
        title: '素材回写资源包',
        objectiveId: 'objective-material-action-1',
        sourceKnowledgeMapId: 'map-material-action-1',
        sellingPointRefs: ['通勤补涂轻薄感'],
        evidenceRefs: ['evidence-material-action-1'],
        sceneRefs: ['通勤补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: [asset.id],
        sopRefs: [],
        constraints: ['素材表现只能作为排序信号。'],
        gaps: [],
        readyPercent: 100,
      }],
      campaignCells: [{
        id: 'campaign-cell-material-action-1',
        title: '素材回写作战单元',
        objectiveId: 'objective-material-action-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['小红书'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-material-action-1',
        decisionChecks: [{
          key: 'material',
          label: '素材',
          status: 'passed',
          message: '素材已通过审核。',
        }],
        queueItemIds: ['queue-material-action-1'],
      }],
      queueItems: [{
        id: 'queue-material-action-1',
        campaignCellId: 'campaign-cell-material-action-1',
        actionType: 'write-back-material-coverage',
        title: '回写素材覆盖',
        summary: '把已通过素材回写到内容组合。',
        status: 'ready',
        outputTarget: 'material-coverage',
        resourceBundleId: 'bundle-material-action-1',
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['素材表现只能作为排序信号。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'material-action-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const materialFeedback = new ContentMaterialFeedbackService(mapStore, assetStore, {
      appendMaterialCoverage: async ({ result }) => {
        assert.equal(result.updatedRowCount, 1);
        assert.deepEqual(result.updates[0].assetReviewIds, [asset.id]);
        return {
          backend: 'bugu',
          status: 'synced',
          message: '素材覆盖已同步。',
          workspaceId: 'workspace-material-action-test',
          revision: 'material-action-coverage-rev-1',
          baseRevision: 'material-action-map-rev-1',
        };
      },
    });
    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'material-action-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ record }) => {
          assert.equal(record.outcome, 'written-back');
          assert.ok(record.materialCoverageChangeId);
          assert.match(record.outputSummary, /素材覆盖/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '素材回写行动记录已同步。',
            workspaceId: 'workspace-material-action-test',
            revision: 'material-action-rev-2',
            baseRevision: 'material-action-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.equal(items[0].status, 'written-back');
          return {
            backend: 'bugu',
            status: 'synced',
            message: '素材回写执行队列已同步。',
            workspaceId: 'workspace-material-action-test',
            revision: 'material-action-rev-3',
            baseRevision: 'material-action-rev-2',
          };
        },
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      materialFeedback,
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-center-material-action-1',
      queueItemId: 'queue-material-action-1',
      actorLabel: '功能测试',
    });
    assert.equal(updated.queueItems[0].status, 'written-back');
    assert.equal(updated.actionRecords[0].outcome, 'written-back');
    assert.ok(updated.actionRecords[0].materialCoverageChangeId);
    assert.ok(updated.resourceBundles[0].handoffRefs?.includes(`material-coverage:${updated.actionRecords[0].materialCoverageChangeId}`));

    const maps = await mapStore.list(workspacePath);
    const saved = maps.find((item) => item.id === 'map-material-action-1');
    assert.ok(saved);
    assert.equal(saved.sellingPoints[0].materialStatus, 'approved');
    assert.deepEqual(saved.sellingPoints[0].materialRefs, [asset.id]);
    assert.ok(saved.sellingPoints[0].performanceTags?.includes('高转化'));
  });
});

test('品牌作战 ready 动作执行前会二次发布检查并拦截缺素材资源包', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-29T00:00:00.000Z';
    await commandStore.save({
      id: 'command-center-policy-1',
      workspacePath,
      title: '缺素材发布检查战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-policy-1',
      sourceKnowledgeMapTitle: '缺素材内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-policy-1',
        title: '缺素材资源包',
        objectiveId: 'objective-policy-1',
        sourceKnowledgeMapId: 'map-policy-1',
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: ['evidence-policy-1'],
        sceneRefs: ['通勤补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: [],
        sopRefs: [],
        constraints: ['功效表达必须引用证据。'],
        gaps: [],
        readyPercent: 80,
      }],
      campaignCells: [{
        id: 'campaign-cell-policy-1',
        title: '缺素材作战单元',
        objectiveId: 'objective-policy-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['小红书'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-policy-1',
        decisionChecks: [],
        queueItemIds: ['queue-policy-1'],
      }],
      queueItems: [{
        id: 'queue-policy-1',
        campaignCellId: 'campaign-cell-policy-1',
        actionType: 'generate-prompt-draft',
        title: '生成缺素材 Prompt 草稿',
        summary: '这个动作被标记 ready，但执行前应被资源包检查拦截。',
        status: 'ready',
        outputTarget: 'prompt-draft',
        resourceBundleId: 'bundle-policy-1',
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['功效表达必须引用证据。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'policy-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'policy-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ record }) => {
          assert.equal(record.outcome, 'blocked');
          assert.match(record.blockedReason ?? '', /缺少可用素材/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '拦截行动记录已同步。',
            workspaceId: 'workspace-policy-test',
            revision: 'policy-rev-2',
            baseRevision: 'policy-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.equal(items[0].status, 'blocked');
          assert.match(items[0].blockedReason ?? '', /缺少可用素材/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '拦截后的执行队列已同步。',
            workspaceId: 'workspace-policy-test',
            revision: 'policy-rev-3',
            baseRevision: 'policy-rev-2',
          };
        },
      },
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-center-policy-1',
      queueItemId: 'queue-policy-1',
      actorLabel: '功能测试',
    });
    assert.equal(updated.queueItems[0].status, 'blocked');
    assert.equal(updated.actionRecords[0].outcome, 'blocked');
    assert.match(updated.actionRecords[0].outputSummary, /动作未执行/);
  });
});

test('品牌作战 ready 动作执行前会拦截无权限团队角色', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-29T00:00:00.000Z';
    await commandStore.save({
      id: 'command-center-role-policy-1',
      workspacePath,
      title: '角色权限发布检查战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-role-policy-1',
      sourceKnowledgeMapTitle: '角色权限内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-role-policy-1',
        title: '完整资源包',
        objectiveId: 'objective-role-policy-1',
        sourceKnowledgeMapId: 'map-role-policy-1',
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: ['evidence-role-policy-1'],
        sceneRefs: ['通勤补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: ['asset-role-policy-1'],
        sopRefs: [],
        constraints: ['小红书平台发布规则：必须引用真实体验证据，禁用绝对化表达。'],
        gaps: [],
        readyPercent: 100,
      }],
      campaignCells: [{
        id: 'campaign-cell-role-policy-1',
        title: '角色权限作战单元',
        objectiveId: 'objective-role-policy-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['小红书'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-role-policy-1',
        decisionChecks: [],
        queueItemIds: ['queue-role-policy-1'],
      }],
      queueItems: [{
        id: 'queue-role-policy-1',
        campaignCellId: 'campaign-cell-role-policy-1',
        actionType: 'generate-prompt-draft',
        title: '生成角色权限 Prompt 草稿',
        summary: '资源包完整，但只读角色不能执行生产动作。',
        status: 'ready',
        outputTarget: 'prompt-draft',
        resourceBundleId: 'bundle-role-policy-1',
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['小红书平台发布规则：发布前复核功效证据和禁用词。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'role-policy-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'role-policy-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ record }) => {
          assert.equal(record.outcome, 'blocked');
          assert.equal(record.actorRole, 'viewer');
          assert.match(record.blockedReason ?? '', /无权执行/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '无权限拦截行动记录已同步。',
            workspaceId: 'workspace-role-policy-test',
            revision: 'role-policy-rev-2',
            baseRevision: 'role-policy-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.equal(items[0].status, 'blocked');
          assert.match(items[0].blockedReason ?? '', /无权执行/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '无权限拦截后的执行队列已同步。',
            workspaceId: 'workspace-role-policy-test',
            revision: 'role-policy-rev-3',
            baseRevision: 'role-policy-rev-2',
          };
        },
      },
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-center-role-policy-1',
      queueItemId: 'queue-role-policy-1',
      actorLabel: '功能测试',
      actorRole: 'viewer',
    });
    assert.equal(updated.queueItems[0].status, 'blocked');
    assert.match(updated.queueItems[0].blockedReason ?? '', /无权执行/);
    assert.equal(updated.actionRecords[0].outcome, 'blocked');
    assert.equal(updated.actionRecords[0].actorRole, 'viewer');
    assert.match(updated.actionRecords[0].outputSummary, /动作未执行/);
  });
});

test('品牌作战 ready 动作执行前会拦截缺平台规则的生产动作', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-29T00:00:00.000Z';
    await commandStore.save({
      id: 'command-center-platform-policy-1',
      workspacePath,
      title: '平台规则发布检查战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-platform-policy-1',
      sourceKnowledgeMapTitle: '平台规则内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-platform-policy-1',
        title: '缺平台规则资源包',
        objectiveId: 'objective-platform-policy-1',
        sourceKnowledgeMapId: 'map-platform-policy-1',
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: ['evidence-platform-policy-1'],
        sceneRefs: ['通勤补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: ['asset-platform-policy-1'],
        sopRefs: [],
        constraints: ['功效表达必须引用证据，避免绝对化表述。'],
        gaps: [],
        readyPercent: 100,
      }],
      campaignCells: [{
        id: 'campaign-cell-platform-policy-1',
        title: '平台规则作战单元',
        objectiveId: 'objective-platform-policy-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['小红书'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-platform-policy-1',
        decisionChecks: [],
        queueItemIds: ['queue-platform-policy-1'],
      }],
      queueItems: [{
        id: 'queue-platform-policy-1',
        campaignCellId: 'campaign-cell-platform-policy-1',
        actionType: 'generate-prompt-draft',
        title: '生成缺平台规则 Prompt 草稿',
        summary: '资源包有证据和素材，但缺平台发布边界。',
        status: 'ready',
        outputTarget: 'prompt-draft',
        resourceBundleId: 'bundle-platform-policy-1',
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['功效表达必须引用证据，避免绝对化表述。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'platform-policy-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'platform-policy-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ record }) => {
          assert.equal(record.outcome, 'blocked');
          assert.match(record.blockedReason ?? '', /缺少平台规则或渠道发布边界/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '缺平台规则拦截行动记录已同步。',
            workspaceId: 'workspace-platform-policy-test',
            revision: 'platform-policy-rev-2',
            baseRevision: 'platform-policy-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.equal(items[0].status, 'blocked');
          assert.match(items[0].blockedReason ?? '', /缺少平台规则或渠道发布边界/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '缺平台规则拦截后的执行队列已同步。',
            workspaceId: 'workspace-platform-policy-test',
            revision: 'platform-policy-rev-3',
            baseRevision: 'platform-policy-rev-2',
          };
        },
      },
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-center-platform-policy-1',
      queueItemId: 'queue-platform-policy-1',
      actorLabel: '功能测试',
      actorRole: 'content-engineer',
    });
    assert.equal(updated.queueItems[0].status, 'blocked');
    assert.match(updated.queueItems[0].blockedReason ?? '', /缺少平台规则或渠道发布边界/);
    assert.equal(updated.actionRecords[0].outcome, 'blocked');
    assert.equal(updated.actionRecords[0].actorRole, 'content-engineer');
    assert.match(updated.actionRecords[0].outputSummary, /动作未执行/);
  });
});

test('品牌作战补资源动作会创建审核任务并同步到团队工作区', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const reviewStore = new ContentReviewTaskStore();
    const now = '2026-05-29T00:00:00.000Z';
    await mapStore.save({
      id: 'map-review-task-1',
      workspacePath,
      title: '补资源内容地图',
      status: 'needs-review',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'review-task-rev-1',
      },
      sourceInputSourceIds: ['source-review-task-1'],
      brandKnowledgeBaseIds: [],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'row-review-task-selling-1',
        title: '轻薄不闷肤',
        summary: `面向通勤补涂用户，需要补拍 9:16 使用素材；本机路径 ${workspacePath}/private-video.mp4 不应进入交付文件。`,
        tags: ['防晒', '通勤'],
        dimensions: {
          audiences: ['通勤白领'],
          channels: ['小红书'],
          contentFormats: ['短视频'],
          useCases: ['午后补涂'],
        },
        sourceRefs: ['input-source:source-review-task-1'],
        evidenceRefs: ['evidence-review-task-1'],
        materialStatus: 'missing',
        materialRefs: [],
        confidence: 0.68,
        status: 'needs-evidence',
      }],
      painPoints: [],
      scenarios: [],
      evidence: [{
        id: 'evidence-review-task-1',
        sourceType: 'user-quote',
        sourceId: 'quote-review-task-1',
        sourceTitle: '用户原声',
        claim: '午后补涂怕厚重',
        excerpt: '下午补涂之后容易闷，需要更轻薄的素材证明。',
        status: 'needs-review',
      }],
      constraints: ['功效表达必须引用证据。'],
      gaps: ['缺少 9:16 素材'],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 0,
        sceneCardCount: 0,
        promptDraftCount: 0,
        evidenceCount: 1,
        gapCount: 1,
        readyPercent: 40,
      },
      createdAt: now,
      updatedAt: now,
    });
    await commandStore.save({
      id: 'command-center-review-task-1',
      workspacePath,
      title: '补资源战情室',
      status: 'needs-review',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-review-task-1',
      sourceKnowledgeMapTitle: '补资源内容地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-review-task-1',
        title: '缺证据资源包',
        objectiveId: 'objective-review-task-1',
        sourceKnowledgeMapId: 'map-review-task-1',
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: [],
        sceneRefs: ['通勤补涂'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: [],
        sopRefs: [],
        constraints: ['功效表达必须引用证据。'],
        gaps: ['缺少用户原声证据', '缺少 9:16 素材'],
        readyPercent: 50,
      }],
      campaignCells: [{
        id: 'campaign-cell-review-task-1',
        title: '补资源作战单元',
        objectiveId: 'objective-review-task-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['小红书'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-review-task-1',
        decisionChecks: [{
          key: 'evidence',
          label: '证据',
          status: 'needs-resource',
          message: '缺少可引用证据。',
          recoveryAction: '创建补证据任务',
        }],
        queueItemIds: ['queue-review-task-1'],
      }],
      queueItems: [{
        id: 'queue-review-task-1',
        campaignCellId: 'campaign-cell-review-task-1',
        actionType: 'create-material-gap-list',
        title: '创建补资源任务',
        summary: '为缺证据和缺素材的资源包创建待确认任务。',
        status: 'needs-resource',
        blockedReason: '资源包缺证据和素材。',
        recoveryAction: '补充产品文档、用户原声和素材。',
        outputTarget: 'material-gap',
        resourceBundleId: 'bundle-review-task-1',
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['功效表达必须引用证据。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'review-task-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'review-task-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ record }) => {
          assert.equal(record.outcome, 'needs-resource');
          assert.ok(record.reviewTaskId);
          assert.ok(record.artifactRefs?.some((ref) => ref.endsWith('manifest.json')));
          assert.ok(record.artifactRefs?.some((ref) => ref.endsWith('material-gap-list.md')));
          assert.ok(record.artifactRefs?.some((ref) => ref.endsWith('material-gap-list.json')));
          assert.match(record.outputSummary, /补资源任务/);
          assert.match(record.outputSummary, /补素材清单/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '行动记录已同步。',
            workspaceId: 'workspace-review-task-test',
            revision: 'review-task-rev-3',
            baseRevision: 'review-task-rev-2',
          };
        },
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.equal(items[0].status, 'needs-resource');
          return {
            backend: 'bugu',
            status: 'synced',
            message: '执行队列已同步。',
            workspaceId: 'workspace-review-task-test',
            revision: 'review-task-rev-4',
            baseRevision: 'review-task-rev-3',
          };
        },
      },
      undefined,
      reviewStore,
      {
        syncReviewTasks: async ({ tasks }) => {
          assert.equal(tasks.length, 1);
          assert.equal(tasks[0].targetType, 'gap');
          assert.equal(tasks[0].targetId, 'brand-command:command-center-review-task-1:queue-review-task-1');
          assert.equal(tasks[0].status, 'needs-material');
          assert.ok(tasks[0].issueLabels.includes('补素材'));
          return {
            backend: 'bugu',
            status: 'synced',
            message: '补资源审核任务已同步。',
            workspaceId: 'workspace-review-task-test',
            revision: 'review-task-rev-2',
            baseRevision: 'review-task-rev-1',
          };
        },
        submitReviewDecision: async () => {
          throw new Error('补资源动作不应提交审核结论');
        },
      },
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-center-review-task-1',
      queueItemId: 'queue-review-task-1',
      actorLabel: '功能测试',
    });

    assert.equal(updated.actionRecords.length, 1);
    assert.ok(updated.actionRecords[0].reviewTaskId);
    assert.equal(updated.actionRecords[0].syncStatus, 'synced');
    assert.equal(updated.actionRecords[0].artifactRefs?.length, 3);
    const manifestPath = updated.actionRecords[0].artifactRefs?.find((ref) => ref.endsWith('manifest.json'));
    const markdownPath = updated.actionRecords[0].artifactRefs?.find((ref) => ref.endsWith('material-gap-list.md'));
    const jsonPath = updated.actionRecords[0].artifactRefs?.find((ref) => ref.endsWith('material-gap-list.json'));
    assert.ok(manifestPath);
    assert.ok(markdownPath);
    assert.ok(jsonPath);
    assert.equal(existsSync(manifestPath), true);
    assert.equal(existsSync(markdownPath), true);
    assert.equal(existsSync(jsonPath), true);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const materialGapPayload = JSON.parse(await readFile(jsonPath, 'utf-8'));
    const markdown = await readFile(markdownPath, 'utf-8');
    assert.equal(manifest.schema, 'buguai.brand-command.material-gap-list.v1');
    assert.equal(materialGapPayload.schema, 'buguai.brand-command.material-gap-list.v1');
    assert.equal(materialGapPayload.reviewTask.id, updated.actionRecords[0].reviewTaskId);
    assert.equal(materialGapPayload.rows[0].id, 'row-review-task-selling-1');
    assert.equal(materialGapPayload.rows[0].materialStatus, 'missing');
    assert.match(markdown, /补素材清单/);
    assert.match(markdown, /轻薄不闷肤/);
    assert.doesNotMatch(JSON.stringify(materialGapPayload), new RegExp(workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(markdown, new RegExp(workspacePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    const reviewTasks = await reviewStore.list(workspacePath);
    assert.equal(reviewTasks.length, 1);
    assert.equal(reviewTasks[0].id, updated.actionRecords[0].reviewTaskId);
    assert.equal(reviewTasks[0].syncStatus, 'synced');
    assert.equal(reviewTasks[0].teamSync?.revision, 'review-task-rev-2');
  });
});

test('品牌战情室生成后能同步执行队列到团队工作区', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-28T00:00:00.000Z';
    await mapStore.save({
      id: 'map-command-queue-1',
      workspacePath,
      title: '防晒内容作战地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'queue-build-rev-1',
      },
      sourceInputSourceIds: ['source-1'],
      brandKnowledgeBaseIds: ['brand-1'],
      sceneCardIds: ['scene-1'],
      promptDraftIds: ['prompt-1'],
      sellingPoints: [{
        id: 'selling-command-1',
        title: '轻薄不闷肤',
        summary: '适合通勤补涂。',
        tags: ['卖点', '通勤'],
        dimensions: {
          audiences: ['敏感肌通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['早高峰补涂'],
        },
        sourceRefs: ['brand-knowledge-base:brand-1'],
        evidenceRefs: ['evidence-command-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-1'],
        confidence: 88,
        status: 'ready',
      }],
      painPoints: [{
        id: 'pain-command-1',
        title: '怕油腻搓泥',
        summary: '评论中的核心异议。',
        tags: ['痛点'],
        dimensions: {
          audiences: ['敏感肌通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['早高峰补涂'],
        },
        sourceRefs: ['input-source:source-1'],
        evidenceRefs: ['evidence-command-1'],
        confidence: 80,
        status: 'ready',
      }],
      scenarios: [{
        id: 'scenario-command-1',
        title: '早高峰通勤补涂',
        summary: '办公室和地铁之间快速补涂。',
        tags: ['场景'],
        dimensions: {
          audiences: ['敏感肌通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['早高峰补涂'],
        },
        sourceRefs: ['scene-card:scene-1'],
        evidenceRefs: ['evidence-command-1'],
        confidence: 82,
        status: 'ready',
      }],
      evidence: [{
        id: 'evidence-command-1',
        sourceType: 'manual',
        sourceTitle: '用户评论摘要',
        claim: '用户关注清爽和不搓泥。',
        excerpt: '评论集中提到清爽、不闷和通勤携带。',
        status: 'ready',
      }],
      constraints: ['功效表达必须引用证据。'],
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

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'queue-build-rev-1',
        }),
      },
      {
        appendActionRecord: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '行动记录已同步。',
          revision: 'unused',
        }),
      },
      {
        syncExecutionQueue: async ({ commandCenterId, items }) => {
          assert.ok(commandCenterId);
          assert.ok(items.length > 0);
          assert.ok(items.every((item) => item.title && item.status));
          assert.ok(items.some((item) => item.dimensions?.useCases?.includes('早高峰补涂')));
          return {
            backend: 'bugu',
            status: 'synced',
            message: '执行队列已同步到测试团队工作区。',
            workspaceId: 'workspace-command-queue-test',
            revision: 'queue-build-rev-2',
            baseRevision: 'queue-build-rev-1',
          };
        },
      },
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        upsertCommandCenterSnapshot: async ({ record }) => {
          assert.equal(record.sourceKnowledgeMapId, 'map-command-queue-1');
          assert.ok(record.signals.length > 0);
          assert.ok(record.objectives.some((objective) => objective.channels.includes('抖音')));
          assert.ok(record.resourceBundles.some((bundle) => bundle.materialRefs.includes('asset-1')));
          assert.ok(record.campaignCells.some((cell) => cell.queueItemIds.length > 0));
          assert.ok(record.queueItems.every((item) => item.syncStatus === 'synced'));
          return {
            backend: 'bugu',
            status: 'synced',
            message: '品牌内容作战系统已同步到测试团队事实源。',
            workspaceId: 'workspace-command-queue-test',
            revision: 'command-center-build-rev-3',
            baseRevision: 'queue-build-rev-2',
          };
        },
      },
    );

    const record = await service.build({ workspacePath, contentKnowledgeMapId: 'map-command-queue-1' });
    assert.equal(record.syncStatus, 'synced');
    assert.equal(record.teamSync.revision, 'command-center-build-rev-3');
    assert.ok(record.queueItems.length > 0);
    assert.ok(record.queueItems.every((item) => item.syncStatus === 'synced'));
    assert.ok(record.resourceBundles.some((bundle) => bundle.materialRefs.includes('asset-1')));
    assert.ok(record.objectives.some((objective) => objective.channels.includes('抖音')));
    assert.ok(record.resourceBundles.some((bundle) => bundle.dimensions?.audiences?.includes('敏感肌通勤人群')));
    assert.ok(record.resourceBundles.some((bundle) => bundle.dimensions?.contentFormats?.includes('短视频')));
    assert.ok(record.campaignCells.some((cell) => cell.channels.includes('抖音')));
    assert.ok(record.queueItems.some((item) => item.dimensions?.useCases?.includes('早高峰补涂')));
    assert.ok(record.campaignCells.some((cell) =>
      cell.decisionChecks.some((check) => check.key === 'material' && check.status === 'passed'),
    ));
  });
});

test('品牌战情室执行队列必须等待内容组合审核通过', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const reviewStore = new ContentReviewTaskStore();
    const now = '2026-05-29T00:00:00.000Z';
    await mapStore.save({
      id: 'map-command-review-gate-1',
      workspacePath,
      title: '审核门禁内容地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'review-gate-rev-1',
      },
      sourceInputSourceIds: ['source-review-gate-1'],
      brandKnowledgeBaseIds: ['brand-review-gate-1'],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-review-gate-1',
        title: '轻薄不闷肤',
        summary: '适合通勤补涂。',
        tags: ['卖点'],
        sourceRefs: ['brand-knowledge-base:brand-review-gate-1'],
        evidenceRefs: ['evidence-review-gate-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-review-gate-1'],
        confidence: 88,
        status: 'ready',
      }],
      painPoints: [{
        id: 'pain-review-gate-1',
        title: '怕油腻搓泥',
        summary: '评论中的核心异议。',
        tags: ['痛点'],
        sourceRefs: ['input-source:source-review-gate-1'],
        evidenceRefs: ['evidence-review-gate-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-review-gate-1'],
        confidence: 82,
        status: 'ready',
      }],
      scenarios: [{
        id: 'scenario-review-gate-1',
        title: '早高峰通勤补涂',
        summary: '办公室和地铁之间快速补涂。',
        tags: ['场景'],
        sourceRefs: ['input-source:source-review-gate-1'],
        evidenceRefs: ['evidence-review-gate-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-review-gate-1'],
        confidence: 84,
        status: 'ready',
      }],
      evidence: [{
        id: 'evidence-review-gate-1',
        sourceType: 'manual',
        sourceTitle: '审核门禁证据',
        claim: '用户关注清爽和不搓泥。',
        excerpt: '评论集中提到清爽、不闷和通勤携带。',
        status: 'ready',
      }],
      constraints: ['平台规则：小红书发布前必须复核禁用表达。'],
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

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'review-gate-rev-1',
        }),
      },
      {
        appendActionRecord: async () => {
          throw new Error('构建队列不应追加行动记录');
        },
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.ok(items.length > 0);
          assert.ok(items.every((item) => item.status === 'needs-review'));
          return {
            backend: 'bugu',
            status: 'synced',
            message: '执行队列已同步。',
            workspaceId: 'workspace-review-gate-test',
            revision: 'review-gate-rev-2',
            baseRevision: 'review-gate-rev-1',
          };
        },
      },
      undefined,
      reviewStore,
    );

    const record = await service.build({ workspacePath, contentKnowledgeMapId: 'map-command-review-gate-1' });
    assert.ok(record.queueItems.length > 0);
    assert.ok(record.queueItems.every((item) => item.status === 'needs-review'));
    assert.ok(record.campaignCells.every((cell) =>
      cell.decisionChecks.some((check) => check.key === 'review' && check.status === 'needs-review'),
    ));
    assert.ok(record.resourceBundles.every((bundle) => bundle.coverageRowIds?.length));
    assert.ok(record.resourceBundles.every((bundle) => (bundle.approvedCoverageRowIds ?? []).length === 0));
    assert.ok(record.resourceBundles.some((bundle) => bundle.gaps.some((gap) => gap.includes('未通过审核'))));
  });
});

test('品牌战情室旧队列动作也不能绕过未审核内容组合直接生成 Prompt', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const reviewStore = new ContentReviewTaskStore();
    const promptDraftStore = new PromptDraftStore(new InputSourceStore(), new FakeTextGenerationService());
    const now = '2026-05-29T00:00:00.000Z';
    await mapStore.save({
      id: 'map-command-review-action-1',
      workspacePath,
      title: '旧队列审核门禁地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'review-action-map-rev-1',
      },
      sourceInputSourceIds: ['source-review-action-1'],
      brandKnowledgeBaseIds: ['brand-review-action-1'],
      sceneCardIds: [],
      promptDraftIds: [],
      sellingPoints: [{
        id: 'selling-review-action-1',
        title: '轻薄不闷肤',
        summary: '适合通勤补涂。',
        tags: ['卖点'],
        sourceRefs: ['brand-knowledge-base:brand-review-action-1'],
        evidenceRefs: ['evidence-review-action-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-review-action-1'],
        confidence: 90,
        status: 'ready',
      }],
      painPoints: [{
        id: 'pain-review-action-1',
        title: '怕油腻搓泥',
        summary: '评论中的核心异议。',
        tags: ['痛点'],
        sourceRefs: ['input-source:source-review-action-1'],
        evidenceRefs: ['evidence-review-action-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-review-action-1'],
        confidence: 86,
        status: 'ready',
      }],
      scenarios: [],
      evidence: [{
        id: 'evidence-review-action-1',
        sourceType: 'manual',
        sourceTitle: '旧队列审核门禁证据',
        claim: '用户关注清爽和不搓泥。',
        excerpt: '评论集中提到清爽、不闷和通勤携带。',
        status: 'ready',
      }],
      constraints: ['平台规则：抖音发布前必须复核禁用表达。'],
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
    await reviewStore.saveMany(workspacePath, [{
      id: 'review-approved-action-1',
      workspacePath,
      sourceKnowledgeMapId: 'map-command-review-action-1',
      sourceKnowledgeMapTitle: '旧队列审核门禁地图',
      targetType: 'selling-point',
      targetId: 'selling-review-action-1',
      title: '轻薄不闷肤',
      summary: '适合通勤补涂。',
      evidenceRefs: ['evidence-review-action-1'],
      sourceRefs: ['brand-knowledge-base:brand-review-action-1'],
      risk: 'low',
      status: 'approved',
      suggestedAction: 'approve',
      issueLabels: ['已通过'],
      decisions: [],
      createdAt: now,
      updatedAt: now,
    }]);
    await commandStore.save({
      id: 'command-review-action-1',
      workspacePath,
      title: '旧队列审核门禁战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-command-review-action-1',
      sourceKnowledgeMapTitle: '旧队列审核门禁地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-review-action-1',
        title: '旧队列资源包',
        objectiveId: 'objective-review-action-1',
        sourceKnowledgeMapId: 'map-command-review-action-1',
        coverageRowIds: ['selling-review-action-1', 'pain-review-action-1'],
        approvedCoverageRowIds: ['selling-review-action-1'],
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: ['evidence-review-action-1'],
        sceneRefs: ['怕油腻搓泥'],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: ['asset-review-action-1'],
        sopRefs: [],
        constraints: ['平台规则：抖音发布前必须复核禁用表达。'],
        gaps: [],
        readyPercent: 90,
      }],
      campaignCells: [{
        id: 'campaign-review-action-1',
        title: '旧队列作战单元',
        objectiveId: 'objective-review-action-1',
        ownerRole: '内容负责人',
        agentRole: '内容工程 Agent',
        channels: ['抖音'],
        timeWindow: '今天',
        resourceBundleId: 'bundle-review-action-1',
        decisionChecks: [{
          key: 'evidence',
          label: '证据',
          status: 'passed',
          message: '证据已准备。',
        }],
        queueItemIds: ['queue-review-action-1'],
      }],
      queueItems: [{
        id: 'queue-review-action-1',
        campaignCellId: 'campaign-review-action-1',
        actionType: 'generate-prompt-draft',
        title: '生成内容 Prompt 草稿',
        summary: '旧队列中已有的可执行动作。',
        status: 'ready',
        outputTarget: 'prompt-draft',
        resourceBundleId: 'bundle-review-action-1',
        createdAt: now,
        updatedAt: now,
      }],
      actionRecords: [],
      constraints: ['平台规则：抖音发布前必须复核禁用表达。'],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'review-action-rev-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'review-action-rev-1',
        }),
      },
      {
        appendActionRecord: async ({ record }) => {
          assert.equal(record.outcome, 'blocked');
          assert.match(record.blockedReason ?? '', /未通过审核/);
          assert.equal(record.promptDraftId, undefined);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '拦截记录已同步。',
            workspaceId: 'workspace-review-action-test',
            revision: 'review-action-rev-2',
            baseRevision: 'review-action-rev-1',
          };
        },
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.equal(items[0].status, 'blocked');
          assert.match(items[0].blockedReason ?? '', /未通过审核/);
          return {
            backend: 'bugu',
            status: 'synced',
            message: '执行队列拦截已同步。',
            workspaceId: 'workspace-review-action-test',
            revision: 'review-action-rev-3',
            baseRevision: 'review-action-rev-2',
          };
        },
      },
      promptDraftStore,
      reviewStore,
    );

    const updated = await service.recordAction({
      workspacePath,
      commandCenterId: 'command-review-action-1',
      queueItemId: 'queue-review-action-1',
      actorLabel: '功能测试',
      actorRole: 'operator',
    });
    assert.equal(updated.queueItems[0].status, 'blocked');
    assert.equal(updated.actionRecords[0].outcome, 'blocked');
    assert.match(updated.actionRecords[0].blockedReason ?? '', /未通过审核/);
    assert.equal((await promptDraftStore.list(workspacePath)).length, 0);
  });
});

test('品牌战情室信号雷达覆盖竞品、素材表现、投放、热点和品牌风险', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-29T00:00:00.000Z';
    await mapStore.save({
      id: 'map-command-radar-1',
      workspacePath,
      title: '夏季便携风扇作战地图',
      status: 'ready',
      syncStatus: 'synced',
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        revision: 'radar-rev-1',
      },
      sourceInputSourceIds: ['source-radar-1'],
      brandKnowledgeBaseIds: ['brand-radar-1'],
      sceneCardIds: ['scene-radar-1'],
      promptDraftIds: ['prompt-radar-1'],
      sellingPoints: [{
        id: 'selling-radar-1',
        title: '竞品差异化机会：不复制大风力话术',
        summary: '竞品主打大风力，本品牌只能转成轻量通勤和桌面低档场景。',
        tags: ['竞品观察', '差异化'],
        dimensions: {
          audiences: ['通勤用户'],
          channels: ['小红书'],
          contentFormats: ['图文'],
          useCases: ['包内携带'],
        },
        sourceRefs: ['input-source:source-radar-1'],
        evidenceRefs: ['evidence-radar-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-radar-1'],
        confidence: 78,
        status: 'needs-review',
      }, {
        id: 'selling-radar-risk-1',
        title: '绝对安全表达需要拦截',
        summary: '达人想写绝对安全，必须改成有边界的使用建议。',
        tags: ['品牌风险', '禁用表达'],
        dimensions: {
          audiences: ['带娃用户'],
          channels: ['私域'],
          contentFormats: ['FAQ'],
          useCases: ['儿童场景咨询'],
        },
        sourceRefs: ['brand-knowledge-base:brand-radar-1'],
        evidenceRefs: ['evidence-radar-1'],
        confidence: 70,
        status: 'needs-review',
      }],
      painPoints: [{
        id: 'pain-radar-1',
        title: '搜索问题：Mini 和 Pro 怎么选',
        summary: '搜索和私域都在问 Mini 与 Pro 的选择差异。',
        tags: ['搜索', '私域问题'],
        dimensions: {
          audiences: ['价格敏感用户'],
          channels: ['私域'],
          contentFormats: ['FAQ'],
          useCases: ['购买前咨询'],
        },
        sourceRefs: ['input-source:source-radar-1'],
        evidenceRefs: ['evidence-radar-1'],
        confidence: 82,
        status: 'ready',
      }],
      scenarios: [{
        id: 'scenario-radar-performance-1',
        title: '通勤包内图收藏率高',
        summary: '通勤包内图收藏率高，适合复用到小红书和抖音短视频。',
        tags: ['素材表现', '通勤'],
        performanceTags: ['高收藏', '高复用'],
        dimensions: {
          audiences: ['通勤用户'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['早高峰通勤'],
        },
        sourceRefs: ['asset-review:asset-radar-1'],
        evidenceRefs: ['evidence-radar-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-radar-1'],
        confidence: 90,
        status: 'ready',
      }, {
        id: 'scenario-radar-ad-1',
        title: '投放点击高但转化低',
        summary: '通勤标题点击高但转化低，需要补证据和 CTA。',
        tags: ['投放表现', '转化'],
        dimensions: {
          audiences: ['通勤用户'],
          channels: ['小红书'],
          contentFormats: ['图文'],
          useCases: ['种草转化'],
        },
        sourceRefs: ['input-source:source-radar-1'],
        evidenceRefs: ['evidence-radar-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-radar-1'],
        confidence: 76,
        status: 'ready',
      }, {
        id: 'scenario-radar-trend-1',
        title: '高温夏日通勤热点',
        summary: '高温天气带动夏日通勤和露营季搜索。',
        tags: ['热点', '高温', '搜索'],
        dimensions: {
          audiences: ['夏季通勤人群'],
          channels: ['抖音'],
          contentFormats: ['短视频'],
          useCases: ['高温通勤'],
        },
        sourceRefs: ['input-source:source-radar-1'],
        evidenceRefs: ['evidence-radar-1'],
        materialStatus: 'approved',
        materialRefs: ['asset-radar-1'],
        confidence: 74,
        status: 'ready',
      }],
      evidence: [{
        id: 'evidence-radar-1',
        sourceType: 'manual',
        sourceTitle: '战情输入',
        claim: '评论、投放和素材表现都指向通勤内容机会。',
        excerpt: '竞品大风力、通勤包内图高收藏、Mini 和 Pro 选择问题、高温通勤搜索上升。',
        status: 'ready',
      }],
      constraints: ['小红书和抖音发布前必须复核平台规则；禁止绝对安全表达；竞品观察不能复制标题、构图或分镜。'],
      gaps: ['绝对安全表达属于禁用表达，需要品牌审核。'],
      coverage: {
        inputSourceCount: 1,
        brandKnowledgeBaseCount: 1,
        sceneCardCount: 1,
        promptDraftCount: 1,
        evidenceCount: 1,
        gapCount: 1,
        readyPercent: 82,
      },
      model: 'functional-test',
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          revision: 'radar-rev-1',
        }),
      },
      {
        appendActionRecord: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '行动记录已同步。',
          revision: 'unused',
        }),
      },
      {
        syncExecutionQueue: async ({ items }) => {
          assert.ok(items.length >= 5);
          assert.ok(items.some((item) => item.dimensions?.channels?.includes('抖音')));
          assert.ok(items.some((item) => item.dimensions?.contentFormats?.includes('短视频')));
          return {
            backend: 'bugu',
            status: 'synced',
            message: '信号雷达执行队列已同步。',
            workspaceId: 'workspace-command-radar-test',
            revision: 'radar-rev-2',
            baseRevision: 'radar-rev-1',
          };
        },
      },
    );

    const record = await service.build({ workspacePath, contentKnowledgeMapId: 'map-command-radar-1' });
    const signalTypes = new Set(record.signals.map((signal) => signal.type));
    assert.ok(signalTypes.has('feedback-pain'));
    assert.ok(signalTypes.has('competitor-action'));
    assert.ok(signalTypes.has('material-performance'));
    assert.ok(signalTypes.has('ad-performance'));
    assert.ok(signalTypes.has('trend'));
    assert.ok(signalTypes.has('brand-risk'));
    assert.ok(record.signals.some((signal) => signal.riskBoundary.includes('不能复制标题')));
    assert.ok(record.signals.some((signal) => signal.riskBoundary.includes('不能自动变成产品事实')));
    assert.ok(record.objectives.some((objective) => objective.type === 'risk-control'));
    assert.ok(record.objectives.some((objective) => objective.type === 'conversion'));
    assert.ok(record.objectives.some((objective) => objective.type === 'acquisition'));
    assert.ok(record.resourceBundles.some((bundle) => bundle.dimensions?.audiences?.includes('通勤用户')));
    assert.ok(record.campaignCells.some((cell) => cell.channels.includes('抖音')));
    assert.ok(record.queueItems.every((item) => item.syncStatus === 'synced'));
  });
});

test('品牌战情室能从团队工作区刷新行动记录并回填资源包交接状态', async () => {
  await withWorkspace(async (workspacePath) => {
    const commandStore = new BrandCommandCenterStore();
    const mapStore = new ContentKnowledgeMapStore();
    const now = '2026-05-29T00:00:00.000Z';
    await commandStore.save({
      id: 'command-refresh-1',
      workspacePath,
      title: '团队刷新战情室',
      status: 'active',
      syncStatus: 'synced',
      sourceKnowledgeMapId: 'map-refresh-1',
      sourceKnowledgeMapTitle: '团队刷新知识地图',
      signals: [],
      objectives: [],
      resourceBundles: [{
        id: 'bundle-refresh-1',
        title: '团队交接资源包',
        objectiveId: 'objective-refresh-1',
        sourceKnowledgeMapId: 'map-refresh-1',
        sellingPointRefs: ['轻薄不闷肤'],
        evidenceRefs: ['evidence-refresh-1'],
        sceneRefs: [],
        sceneCardIds: [],
        promptDraftIds: [],
        materialRefs: [],
        sopRefs: [],
        constraints: [],
        gaps: [],
        handoffStatus: 'none',
        handoffRefs: [],
        readyPercent: 80,
      }],
      campaignCells: [],
      queueItems: [],
      actionRecords: [{
        id: 'local-action-refresh-1',
        actionType: 'request-evidence',
        title: '本机补证据记录',
        outcome: 'needs-resource',
        actorLabel: '本机工作台',
        inputSummary: '缺证据资源包',
        outputSummary: '已记录补证据。',
        createdAt: now,
      }],
      constraints: [],
      gaps: [],
      teamSync: {
        backend: 'bugu',
        status: 'synced',
        message: '已同步到团队工作区。',
        workspaceId: 'workspace-refresh-1',
        revision: 'rev-refresh-1',
      },
      createdAt: now,
      updatedAt: now,
    });

    const service = new BrandCommandCenterApplicationService(
      commandStore,
      mapStore,
      {
        draftStatus: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '已同步到团队工作区。',
          workspaceId: 'workspace-refresh-1',
          revision: 'rev-refresh-1',
        }),
      },
      {
        appendActionRecord: async () => ({
          backend: 'bugu',
          status: 'synced',
          message: '行动记录已同步。',
        }),
        listActionRecords: async ({ commandCenterId, workspaceId, limit }) => {
          assert.equal(workspaceId, 'workspace-refresh-1');
          assert.equal(limit, 80);
          if (commandCenterId === 'content-production:map-refresh-1') {
            return {
              teamSync: {
                backend: 'bugu',
                status: 'synced',
                message: '已刷新生产交接记录。',
                workspaceId,
                revision: 'rev-refresh-2',
              },
              records: [{
                id: 'team-handoff-refresh-1',
                queueItemId: 'handoff:map-refresh-1:selling-refresh-1',
                campaignCellId: 'handoff:map-refresh-1:selling-refresh-1',
                actionType: 'generate-prompt-draft',
                title: '团队交接 Prompt 草稿',
                outcome: 'handoff',
                actorLabel: '团队成员',
                inputSummary: '团队知识地图 / 轻薄不闷肤 / 1 条证据',
                outputSummary: '已生成 Prompt 草稿。',
                writeBackSummary: '继续在 Prompt 工作台确认。',
                syncStatus: 'synced',
                teamSync: {
                  backend: 'bugu',
                  status: 'synced',
                  message: '已刷新生产交接记录。',
                  workspaceId,
                  revision: 'rev-refresh-2',
                },
                createdAt: '2026-05-29T00:02:00.000Z',
              }],
            };
          }
          return {
            teamSync: {
              backend: 'bugu',
              status: 'synced',
              message: '已刷新战情室行动记录。',
              workspaceId,
              revision: 'rev-refresh-2',
            },
            records: [{
              id: 'team-action-refresh-1',
              queueItemId: 'queue-refresh-1',
              campaignCellId: 'cell-refresh-1',
              actionType: 'request-review',
              title: '团队送审记录',
              outcome: 'needs-review',
              actorLabel: '团队审核员',
              inputSummary: '团队资源包',
              outputSummary: '已转入审核。',
              syncStatus: 'synced',
              teamSync: {
                backend: 'bugu',
                status: 'synced',
                message: '已刷新战情室行动记录。',
                workspaceId,
                revision: 'rev-refresh-2',
              },
              createdAt: '2026-05-29T00:01:00.000Z',
            }],
          };
        },
      },
    );

    const refreshed = await service.refreshActions({
      workspacePath,
      commandCenterId: 'command-refresh-1',
    });

    assert.equal(refreshed.syncStatus, 'synced');
    assert.equal(refreshed.actionRecords.length, 3);
    assert.equal(refreshed.actionRecords[0].id, 'team-handoff-refresh-1');
    assert.equal(refreshed.actionRecords.some((record) => record.id === 'local-action-refresh-1'), true);
    assert.equal(refreshed.resourceBundles[0].handoffStatus, 'handed-off');
    assert.deepEqual(refreshed.resourceBundles[0].handoffRefs, ['handoff:map-refresh-1:selling-refresh-1']);
    assert.match(refreshed.resourceBundles[0].lastHandoffSummary ?? '', /Prompt 草稿/);
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
    return { model: model || 'fake-claude-sonnet' };
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
        model: input.model || 'fake-claude-sonnet',
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
        model: input.model || 'fake-claude-sonnet',
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
        model: input.model || 'fake-claude-sonnet',
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
        model: input.model || 'fake-claude-sonnet',
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
        model: input.model || 'fake-claude-sonnet',
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
        model: input.model || 'fake-claude-sonnet',
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
        model: input.model || 'fake-claude-sonnet',
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
      return {
        model: input.model || 'fake-claude-sonnet',
        rawText: '{}',
        value: {
          title: '早餐后场景短视频脚本',
          script: '镜头 1：痛点。\n镜头 2：使用。\n镜头 3：行动提示。',
          storyboard: [1, 2, 3].map((shot) => ({
            shot,
            duration: '5s',
            visual: `镜头 ${shot} 的真实使用画面`,
            voiceover: `镜头 ${shot} 的自然口播`,
            subtitle: `字幕 ${shot}`,
            rhythm: shot === 1 ? '快节奏钩子' : '中速解释',
          })),
          videoPrompt: '4:5，15 秒，真实产品使用画面。',
          publishCheck: [
            { level: 'info', message: '脚本已绑定知识引用。' },
            { level: 'warning', message: '上线前复核素材授权。' },
          ],
        },
      };
    }
    if (task === 'generate_image_skill') {
      return {
        model: input.model || 'fake-claude-sonnet',
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

class FakePromptAgentService {
  draftCalls = [];
  refineCalls = [];

  async generatePromptDraft(input) {
    this.draftCalls.push(input);
    return {
      title: 'Claude 会话草稿',
      content: [
        'Claude 会话草稿',
        '',
        `模型：${input.textModel || 'claude-sonnet-4-5'}`,
        '',
        'Prompt 正文：',
        '围绕用户意图与输入源生成可执行 Prompt。',
      ].join('\n'),
      note: `Claude SDK 会话草稿：${input.textModel || 'claude-sonnet-4-5'}`,
      model: input.textModel || 'claude-sonnet-4-5',
      protocol: 'claude-sdk',
    };
  }

  async generateRefinedPrompt(input) {
    this.refineCalls.push(input);
    return {
      content: [
        input.previousContent,
        '',
        '本轮调整：',
        input.adjustment,
      ].join('\n'),
      note: `Claude SDK 多轮调整：${input.textModel || 'claude-sonnet-4-5'}`,
      model: input.textModel || 'claude-sonnet-4-5',
      protocol: 'claude-sdk',
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

    assert.equal(result.model, 'fake-claude-sonnet');
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
      params: { textModel: 'fake-claude-sonnet' },
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
      params: { textModel: 'fake-claude-sonnet' },
    });
    assert.equal(script.storyboard.length, 3);

    const storedLogs = await logs.list(workspacePath);
    assert.deepEqual(new Set(storedLogs.map((log) => log.kind)), new Set(['prompt-pack', 'scene-card', 'article', 'video-script']));
    assert.equal(storedLogs.every((log) => log.status === 'succeeded'), true);
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
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);

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
    assert.deepEqual(started.session.executionEvents?.map((event) => event.kind), [
      'context',
      'tool',
      'source',
      'tool',
      'evidence',
      'action',
      'skill',
      'permission',
      'sandbox',
      'model',
      'model',
      'draft',
      'state',
    ]);
    assert.deepEqual(started.session.executionEvents?.map((event) => event.eventClass), [
      'turn.submitted',
      'tool.started',
      'context.resolved',
      'tool.result',
      'evidence.changed',
      'action.resolved',
      'tool.catalog.resolved',
      'permission.evaluated',
      'sandbox.applied',
      'model.requested',
      'model.completed',
      'artifact.changed',
      'snapshot.updated',
    ]);
    assert.deepEqual(started.session.executionEvents?.map((event) => event.sequence), Array.from({ length: 13 }, (_, index) => index + 1));
    assert.deepEqual(started.session.executionEvents?.find((event) => event.eventClass === 'evidence.changed')?.evidenceRefs, [`input-source:${source.id}`]);
    assert.equal(started.session.executionEvents?.find((event) => event.eventClass === 'tool.result')?.toolCallId?.startsWith('tool:'), true);
    assert.equal(started.session.executionEvents?.find((event) => event.eventClass === 'permission.evaluated')?.payload?.permissionDecision?.decision, 'allow');
    assert.equal(started.session.executionEvents?.find((event) => event.eventClass === 'sandbox.applied')?.payload?.sandboxProfile?.cwd, 'current-workspace');
    const startedSnapshot = started.session.executionEvents?.at(-1);
    assert.equal(startedSnapshot?.eventClass, 'snapshot.updated');
    assert.equal(startedSnapshot?.payload?.sessionStatus, 'draft-created');
    assert.equal(startedSnapshot?.payload?.eventCount, 12);
    assert.equal(startedSnapshot?.payload?.messageCount, 2);
    assert.deepEqual(startedSnapshot?.payload?.draftIds, [started.draft.id]);
    assert.deepEqual(startedSnapshot?.payload?.artifactRefs, [`prompt-draft:${started.draft.id}`]);
    assert.deepEqual(startedSnapshot?.payload?.evidenceRefs, [`input-source:${source.id}`]);
    assert.deepEqual(startedSnapshot?.payload?.pendingActionIds, []);
    const startedReadModel = projectAgentRuntimeReadModel(started.session);
    assert.deepEqual(startedReadModel.visibleEvents.map((event) => event.source.eventClass), [
      'evidence.changed',
      'action.resolved',
      'model.completed',
      'artifact.changed',
    ]);
    assert.equal(startedReadModel.visibleEvents.some((event) => event.source.eventClass === 'snapshot.updated'), false);
    assert.equal(started.session.executionEvents?.at(-2)?.owner, 'artifact');
    assert.deepEqual(started.session.executionEvents?.at(-2)?.artifactRefs, [`prompt-draft:${started.draft.id}`]);
    assert.equal(started.session.executionEvents?.find((event) => event.kind === 'source')?.status, 'completed');
    assert.match(started.draft.versions[0].content, /Prompt 草稿/);

    const continued = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '把平台改成小红书，镜头更自然，不要广告棚拍感。',
    });

    assert.equal(continued.session.messages.length, 4);
    assert.equal(continued.session.executionEvents?.length, 24);
    assert.equal(continued.session.executionEvents?.at(-3)?.kind, 'draft');
    assert.equal(continued.session.executionEvents?.at(-3)?.eventClass, 'artifact.changed');
    assert.equal(continued.session.executionEvents?.at(-2)?.eventClass, 'action.resolved');
    const continuedSnapshot = continued.session.executionEvents?.at(-1);
    assert.equal(continuedSnapshot?.eventClass, 'snapshot.updated');
    assert.equal(continuedSnapshot?.sequence, 24);
    assert.equal(continuedSnapshot?.payload?.sessionStatus, 'draft-created');
    assert.equal(continuedSnapshot?.payload?.eventCount, 23);
    assert.equal(continuedSnapshot?.payload?.messageCount, 4);
    assert.deepEqual(continuedSnapshot?.payload?.draftIds, [started.draft.id]);
    assert.deepEqual(continuedSnapshot?.payload?.artifactRefs, [`prompt-draft:${started.draft.id}`]);
    assert.deepEqual(continuedSnapshot?.payload?.evidenceRefs, [`input-source:${source.id}`]);
    const continuedReadModel = projectAgentRuntimeReadModel(continued.session);
    assert.equal(continuedReadModel.visibleEvents.some((event) => event.source.eventClass === 'snapshot.updated'), false);
    assert.equal(continued.draft.versions.length, 2);
    assert.match(continued.draft.versions.at(-1).content, /本轮调整/);
  });
});

test('Prompt 工作台手动草稿和协作会绑定团队知识包版本', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const promptAgent = new FakePromptAgentService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text, promptAgent);
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
      textModel: 'claude-opus-4-1',
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

test('对话启动会显式使用当前选中的 Claude 模型', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const promptAgent = new FakePromptAgentService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text, promptAgent);

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
      textModel: 'claude-opus-4-1',
    });

    assert.equal(promptAgent.draftCalls.length, 1);
    assert.equal(promptAgent.draftCalls[0].textModel, 'claude-opus-4-1');
    assert.equal(started.draft.model, 'claude-opus-4-1');
    assert.equal(started.session.model, 'claude-opus-4-1');
    assert.equal(started.session.textProtocol, 'claude-sdk');

    const continued = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '把平台改成小红书，镜头更自然，不要广告棚拍感。',
    });

    assert.equal(promptAgent.refineCalls.length, 1);
    assert.equal(promptAgent.refineCalls[0].textModel, 'claude-opus-4-1');
    assert.equal(continued.draft.model, 'claude-opus-4-1');
    assert.equal(continued.session.model, 'claude-opus-4-1');

    const switched = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '这一轮换成更快模型，保留同样结构。',
      textModel: 'claude-haiku-4-5',
    });

    assert.equal(promptAgent.refineCalls.length, 2);
    assert.equal(promptAgent.refineCalls[1].textModel, 'claude-haiku-4-5');
    assert.equal(switched.draft.model, 'claude-haiku-4-5');
    assert.equal(switched.session.model, 'claude-haiku-4-5');
  });
});

test('对话会话使用非 Claude 协议时首轮和续写都沿用当前文字模型', async () => {
  await withWorkspace(async (workspacePath) => {
    const requests = [];
    const server = createServer((request, response) => {
      if (request.url === '/v1/chat/completions') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          const parsedBody = JSON.parse(body);
          requests.push(parsedBody);
          const output = requests.length === 1
            ? {
              title: 'OpenAI 协议 Prompt 草稿',
              prompt: '基于便携条包生成 Prompt。',
              followUpQuestions: [],
              sourceWarnings: ['仅基于输入源'],
              qualityChecklist: ['可追溯'],
            }
            : {
              prompt: '继续基于便携条包改写。',
              followUpQuestions: [],
              sourceWarnings: [],
            };
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: JSON.stringify(output) }, finish_reason: 'stop' }],
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
            textProtocol: 'openai-chat',
            textApiEndpoint: baseUrl,
            textModel: 'gpt-compatible',
            textApiKeyStatus: 'available',
          };
        },
        async getTextApiKey() { return 'test-text-key'; },
      };
      const settings = {
        async getAnthropicApiKey() { return undefined; },
      };
      const text = new TextGenerationService(modelConfig);
      const promptAgent = new PromptAgentService(settings, modelConfig, text);
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, text);
      const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text, promptAgent);

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

      assert.equal(started.draft.textProtocol, 'openai-chat');
      assert.equal(started.session.textProtocol, 'openai-chat');
      assert.equal(started.draft.model, 'gpt-compatible');
      assert.equal(started.session.model, 'gpt-compatible');
      assert.match(started.draft.versions[0].note, /生成服务完成：gpt-compatible/);
      assert.doesNotMatch(started.draft.versions[0].note, /Claude SDK/);
      const startProviderEvents = started.session.executionEvents
        ?.find((event) => event.eventClass === 'model.completed')
        ?.payload?.providerEvents;
      assert.equal(Array.isArray(startProviderEvents), true);
      assert.equal(startProviderEvents.some((event) => (
        event.eventClass === 'model.requested' &&
        event.payload?.transport === 'http' &&
        event.payload?.endpoint === `${baseUrl}/v1/chat/completions`
      )), true);
      assert.equal(startProviderEvents.some((event) => (
        event.eventClass === 'model.completed' &&
        event.payload?.status === 200 &&
        event.payload?.finishReason === 'stop'
      )), true);

      const continued = await sessions.continue({
        workspacePath,
        sessionId: started.session.id,
        message: '把平台改成小红书，镜头更自然，不要广告棚拍感。',
      });

      assert.equal(requests.length, 2);
      assert.deepEqual(requests.map((item) => item.model), ['gpt-compatible', 'gpt-compatible']);
      assert.equal(continued.draft.model, 'gpt-compatible');
      assert.equal(continued.session.model, 'gpt-compatible');
      assert.equal(continued.session.textProtocol, 'openai-chat');
      assert.match(continued.draft.versions.at(-1)?.content ?? '', /继续基于便携条包改写/);
      assert.match(continued.draft.versions.at(-1)?.note ?? '', /对话调整完成：gpt-compatible/);
      assert.doesNotMatch(continued.draft.versions.at(-1)?.note ?? '', /Claude SDK|Agent 多轮调整/);
      const continueProviderEvents = continued.session.executionEvents
        ?.filter((event) => event.eventClass === 'model.completed')
        .at(-1)
        ?.payload?.providerEvents;
      assert.equal(Array.isArray(continueProviderEvents), true);
      assert.equal(continueProviderEvents.some((event) => (
        event.eventClass === 'model.completed' &&
        event.payload?.status === 200 &&
        event.payload?.transport === 'http'
      )), true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('对话生成服务缺少密钥时保留 provider 失败事实并要求配置模型', async () => {
  await withWorkspace(async (workspacePath) => {
    const modelConfig = {
      async readView() {
        return {
          textProtocol: 'openai-chat',
          textApiEndpoint: 'http://127.0.0.1:9',
          textModel: 'gpt-compatible',
          textApiKeyStatus: 'missing',
        };
      },
      async getTextApiKey() { return undefined; },
    };
    const settings = {
      async getAnthropicApiKey() { return undefined; },
    };
    const text = new TextGenerationService(modelConfig);
    const promptAgent = new PromptAgentService(settings, modelConfig, text);
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text, promptAgent);

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
      title: '缺密钥 Prompt 对话',
      purpose: 'image',
      userIntent: '生成小红书真实生活场景图片 Prompt。',
      inputSourceIds: [source.id],
      textModel: 'gpt-compatible',
    });

    const modelFailure = started.session.executionEvents?.find((event) => event.eventClass === 'model.failed');
    const permissionRequest = started.session.executionEvents?.find((event) => (
      event.eventClass === 'permission.requested' &&
      event.actionId === `action:${started.session.id}:configure-text-model`
    ));
    const configureAction = started.session.executionEvents?.find((event) => (
      event.eventClass === 'action.required' &&
      event.payload?.actionKind === 'configure-text-model'
    ));
    const providerEvents = modelFailure?.payload?.providerEvents;
    assert.equal(started.session.status, 'blocked');
    assert.equal(started.draft.model, 'blocked:text-provider');
    assert.equal(modelFailure?.status, 'blocked');
    assert.equal(Array.isArray(providerEvents), true);
    assert.equal(providerEvents.some((event) => (
      event.eventClass === 'model.requested' &&
      event.payload?.transport === 'http' &&
      event.payload?.endpoint === 'http://127.0.0.1:9/v1/chat/completions'
    )), true);
    assert.equal(providerEvents.some((event) => (
      event.eventClass === 'model.failed' &&
      event.payload?.auth === true
    )), true);
    assert.equal(permissionRequest?.payload?.permissionDecision?.decision, 'ask');
    assert.equal(permissionRequest?.payload?.permissionDecision?.approvalActionId, configureAction?.actionId);
    assert.equal(configureAction?.phase, 'action_required');
    assert.equal(configureAction?.payload?.providerStatus, 'blocked:text-provider');
  });
});

test('对话缺少输入源会写入待处理动作事实', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);

    const started = await sessions.start({
      workspacePath,
      title: '缺来源 Prompt 对话',
      purpose: 'image',
      userIntent: '先判断需要补哪些产品资料。',
      inputSourceIds: [],
    });

    const requiredAction = started.session.executionEvents?.find((event) => event.eventClass === 'action.required');
    const permissionRequest = started.session.executionEvents?.find((event) => (
      event.eventClass === 'permission.requested' &&
      event.actionId === requiredAction?.actionId
    ));
    assert.equal(requiredAction?.kind, 'action');
    assert.equal(requiredAction?.phase, 'action_required');
    assert.equal(requiredAction?.payload?.actionKind, 'add-input-source');
    assert.equal(requiredAction?.payload?.targetModule, 'knowledge-inputs');
    assert.ok(requiredAction?.actionId);
    assert.equal(permissionRequest?.payload?.permissionDecision?.decision, 'ask');
    assert.equal(permissionRequest?.payload?.permissionDecision?.approvalActionId, requiredAction.actionId);
    const startedSnapshot = started.session.executionEvents?.at(-1);
    assert.equal(startedSnapshot?.eventClass, 'snapshot.updated');
    assert.deepEqual(startedSnapshot?.payload?.pendingActionIds, [requiredAction.actionId]);

    const resolved = await sessions.respondAction({
      workspacePath,
      sessionId: started.session.id,
      actionId: requiredAction.actionId,
      decision: 'open-input-source',
      payload: { targetModule: 'knowledge-inputs' },
    });
    const resolvedSnapshot = resolved.executionEvents?.at(-1);
    const resolvedAction = resolved.executionEvents?.at(-2);
    const resolvedPermission = resolved.executionEvents?.at(-3);
    assert.equal(resolvedPermission?.eventClass, 'permission.resolved');
    assert.equal(resolvedPermission?.actionId, requiredAction.actionId);
    assert.equal(resolvedPermission?.payload?.permissionDecision?.decision, 'allow');
    assert.equal(resolvedPermission?.payload?.permissionDecision?.decisionSource, 'human');
    assert.equal(resolvedAction?.eventClass, 'action.resolved');
    assert.equal(resolvedAction?.actionId, requiredAction.actionId);
    assert.equal(resolvedAction?.payload?.resolvedFromEventId, requiredAction.id);
    assert.equal(resolvedAction?.payload?.decision, 'open-input-source');
    assert.equal(resolvedAction?.sequence, (started.session.executionEvents?.length ?? 0) + 2);
    assert.equal(resolvedSnapshot?.eventClass, 'snapshot.updated');
    assert.equal(resolvedSnapshot?.sequence, (started.session.executionEvents?.length ?? 0) + 3);
    assert.deepEqual(resolvedSnapshot?.payload?.pendingActionIds, []);

    const idempotent = await sessions.respondAction({
      workspacePath,
      sessionId: started.session.id,
      actionId: requiredAction.actionId,
      decision: 'open-input-source',
      payload: { targetModule: 'knowledge-inputs' },
    });
    assert.equal(idempotent.executionEvents?.length, resolved.executionEvents?.length);

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '补充产品资料',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。',
      tags: ['product'],
    });
    const attached = await sessions.attachInputSources({
      workspacePath,
      sessionId: started.session.id,
      inputSourceIds: [source.id],
      reason: 'manual-input-source-registered',
    });
    assert.ok(attached.inputSourceIds.includes(source.id));
    assert.equal(attached.sourceSnapshots.some((snapshot) => snapshot.sourceId === source.id), true);
    assert.equal(attached.messages.at(-1)?.kind, 'note');
    assert.equal(attached.executionEvents?.some((event) => (
      event.eventClass === 'context.resolved' &&
      event.refIds?.includes(source.id) &&
      event.payload?.reason === 'manual-input-source-registered'
    )), true);
    assert.equal(attached.executionEvents?.some((event) => (
      event.eventClass === 'evidence.changed' &&
      event.evidenceRefs?.includes(`input-source:${source.id}`)
    )), true);
    assert.equal(attached.executionEvents?.some((event) => (
      event.eventClass === 'permission.resolved' &&
      event.actionId === requiredAction.actionId &&
      event.payload?.permissionDecision?.decisionSource === 'human'
    )), true);
    assert.equal(attached.executionEvents?.at(-1)?.eventClass, 'snapshot.updated');
    assert.deepEqual(attached.executionEvents?.at(-1)?.payload?.pendingActionIds, []);

    const continued = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '资料已补齐，请基于新资料重新生成图片 Prompt。',
    });
    assert.match(continued.draft.versions.at(-1)?.content ?? '', /补充产品资料|便携条包/);
    assert.equal(continued.session.sourceSnapshots.some((snapshot) => snapshot.sourceId === source.id), true);
    assert.equal(continued.session.messages.at(-1)?.kind, 'draft');
    assert.match(continued.session.messages.at(-1)?.content ?? '', /便携条包/);
    assert.equal(continued.session.executionEvents?.some((event) => (
      event.eventClass === 'model.completed' &&
      event.payload?.model === 'fake-claude-sonnet'
    )), true);
  });
});

test('浏览器开发桥接不会模拟模型成功并保留可恢复运行快照', async () => {
  const api = createDevBridge();
  const workspacePath = '/tmp/content-studio-browser-dev-functional';
  const started = await api.startAgentPromptSession({
    workspacePath,
    title: '浏览器开发对话事实',
    purpose: 'image',
    userIntent: '先判断需要补哪些产品资料。',
    inputSourceIds: [],
  });

  const requiredAction = started.session.executionEvents?.find((event) => event.eventClass === 'action.required');
  const startedSnapshot = started.session.executionEvents?.at(-1);
  assert.ok(requiredAction?.actionId);
  assert.equal(started.session.executionEvents?.some((event) => event.kind === 'note'), false);
  assert.equal(started.session.executionEvents?.some((event) => event.eventClass === 'model.completed'), false);
  assert.equal(started.session.executionEvents?.some((event) => event.eventClass === 'model.failed'), true);
  assert.equal(startedSnapshot?.eventClass, 'snapshot.updated');
  assert.deepEqual(startedSnapshot?.payload?.pendingActionIds, [requiredAction.actionId]);

  const resolved = await api.respondAgentPromptAction({
    workspacePath,
    sessionId: started.session.id,
    actionId: requiredAction.actionId,
    decision: 'open-input-source',
    payload: { targetModule: 'knowledge-inputs' },
  });
  assert.equal(resolved.executionEvents?.at(-3)?.eventClass, 'permission.resolved');
  assert.equal(resolved.executionEvents?.at(-2)?.eventClass, 'action.resolved');
  assert.equal(resolved.executionEvents?.at(-1)?.eventClass, 'snapshot.updated');
  assert.deepEqual(resolved.executionEvents?.at(-1)?.payload?.pendingActionIds, []);

  const source = await api.registerInputSource({
    workspacePath,
    kind: 'manual-note',
    purpose: 'product-brief',
    title: '浏览器开发补充资料',
    text: '产品事实：便携条包。场景：早餐后。',
    tags: ['product'],
  });
  const attached = await api.attachAgentPromptSessionInputSources({
    workspacePath,
    sessionId: started.session.id,
    inputSourceIds: [source.id],
    reason: 'manual-input-source-registered',
  });
  assert.equal(attached.inputSourceIds.includes(source.id), true);
  assert.equal(attached.executionEvents?.some((event) => (
    event.eventClass === 'evidence.changed' &&
    event.evidenceRefs?.includes(`input-source:${source.id}`)
  )), true);
  assert.equal(attached.executionEvents?.at(-1)?.eventClass, 'snapshot.updated');
  assert.deepEqual(attached.executionEvents?.at(-1)?.payload?.pendingActionIds, []);

  const continued = await api.continueAgentPromptSession({
    workspacePath,
    sessionId: started.session.id,
    message: '资料已补齐，请继续。',
  });
  assert.equal(continued.session.id, started.session.id);
  assert.equal(continued.session.messages.some((message) => (
    message.kind === 'adjustment' &&
    message.content.includes('资料已补齐')
  )), true);
  assert.equal(continued.session.executionEvents?.some((event) => event.eventClass === 'model.completed'), false);
  assert.equal(continued.session.executionEvents?.at(-1)?.eventClass, 'snapshot.updated');
  assert.equal(continued.session.executionEvents?.at(-1)?.payload?.messageCount, continued.session.messages.length);
  assert.equal(continued.draft.versions.length, 2);
});

test('Prompt 生成服务不会把成功素材沉淀追溯源作为新输入源', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);

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
      purpose: 'sop-input',
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

test('输入源复用策略区分 Prompt 追溯和 SOP 自动输入', () => {
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
  assert.equal(isReusableWorkflowInputSource(importedSuccessfulAsset), false);
  assert.equal(isReusableWorkflowInputSource(distilledTraceSource), false);
  assert.equal(isReusableWorkflowInputSource(productBrief), true);
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
    CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
    CONTENT_STUDIO_VIDEO_ENDPOINT: 'https://video.example.test/generate',
    CONTENT_STUDIO_VIDEO_API_KEY: 'test-video-key',
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
  assert.ok(blockedText.requiredEnv.includes('CONTENT_STUDIO_TEXT_API_KEY or ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN'));
  assert.equal(blockedText.configured.apiKey, false);
  assert.equal(blockedText.configured.oauthToken, false);
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
  assert.equal(packageJson.scripts['verify:v2:release'], 'node scripts/run-v2-acceptance-evidence.mjs --provider-strict --require-real-workspace-evidence --require-external-mix-evidence --allow-network --allow-media');
  assert.match(packageJson.scripts['verify:local'], /npm run verify:v2/);
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
          tags: ['successful-asset', 'prompt-distilled', 'image', 'workflow-run'],
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
              tags: ['successful-asset', 'prompt-distilled', 'video', 'workflow-run'],
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
      tags: ['successful-asset', 'prompt-distilled', 'video', 'workflow-run'],
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
      title: '工作区视频素材包 SOP',
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

test('v2 业务验收脚本可读取真实服务写入的工作区 SOP 产物', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const assetReviews = new AssetReviewStore();
    const promptPacks = new PromptPackService(logs, text);
    const brandKnowledgeBases = new BrandKnowledgeBaseStore(text);
    const ipKnowledgeBases = new IpKnowledgeBaseStore(text);
    const sceneCards = new SceneLibraryStore(logs, promptPacks, text);
    const overlayCards = new OverlayCardStore();
    const mixPackages = new MixPackageStore(assetReviews);
    const platformDrafts = new PlatformDraftStore(logs);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      assetReviews,
      brandKnowledgeBases,
      promptPacks,
      sceneCards,
      undefined,
      ipKnowledgeBases,
      overlayCards,
    );
    const definitions = await workflows.listDefinitions(workspacePath);
    const brandDefinition = definitions.find((item) => item.key === 'brand-scene-prompts');
    const ipDefinition = definitions.find((item) => item.key === 'ip-longform');
    const productDefinition = definitions.find((item) => item.key === 'product-commercial-assets');
    const feedbackDefinition = definitions.find((item) => item.key === 'feedback-topic-matrix');
    const greenDefinition = definitions.find((item) => item.key === 'green-screen-card-package');
    const videoDefinition = definitions.find((item) => item.key === 'video-material-package');
    assert.ok(brandDefinition, '应存在品牌场景 SOP');
    assert.ok(ipDefinition, '应存在 IP 内容 SOP');
    assert.ok(productDefinition, '应存在产品商业素材 SOP');
    assert.ok(feedbackDefinition, '应存在评论痛点选题 SOP');
    assert.ok(greenDefinition, '应存在绿幕文案图 SOP');
    assert.ok(videoDefinition, '应存在视频素材包 SOP');

    const brandRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: brandDefinition.id,
      inputs: {
        source: [
          '产品名称：真实工作区便携条包',
          '产品事实：便携条包，适合早餐后、办公室抽屉和通勤包中随手取用。',
          '核心卖点：降低准备门槛，适合忙碌办公人群。',
          '场景：早餐后、办公室抽屉、通勤包侧袋。',
          '合规边界：不承诺治疗，不写绝对化收益。',
        ].join('\n'),
        intent: '生成真实生活场景库和 10 组 UGC 图片 / 视频 Prompt。',
        reviewOwner: '品牌运营',
      },
    });
    assert.equal(brandRun.status, 'queued');

    const ipRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: ipDefinition.id,
      inputs: {
        source: [
          '身份：嘉文老师，长期讲普通人可执行的内容方法。',
          '价值观：先讲事实和边界，再讲行动建议。',
          '语言：自然、克制、像一对一解释。',
          '方法论：用真实案例、反常识切入和发布前检查做内容。',
          '素材：课程大纲、工作坊记录、咨询问答。',
          '创作引擎：口播、朋友圈、私域回复和产品化咨询。',
        ].join('\n'),
        intent: '构建六层 IP 知识库并生成口播内容 Prompt。',
        reviewOwner: 'IP 主理人',
      },
    });
    assert.equal(ipRun.status, 'queued');

    const productBrief = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '真实工作区产品资料',
      tags: ['产品资料', 'brief'],
      text: [
        '产品名称：真实工作区便携条包',
        '卖点：早餐后、办公室抽屉和通勤包里都能顺手取用。',
        '规格：每盒 20 条，每条独立包装。',
        '适用场景：早餐后、办公室抽屉、通勤包侧袋。',
        '禁用表达：不承诺治疗，不写绝对化收益。',
      ].join('\n'),
    });
    const skuTable = await inputSources.register({
      workspacePath,
      kind: 'sku-table',
      purpose: 'product-brief',
      title: '真实工作区 SKU 表',
      tags: ['SKU', '规格'],
      text: [
        'SKU,规格,价格,适用场景',
        'trial-10,10 条装,49,首次尝试',
        'family-30,30 条装,129,家庭常备',
      ].join('\n'),
    });
    const productRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: productDefinition.id,
      inputSourceIds: [productBrief.id, skuTable.id],
      inputs: {
        source: '真实工作区产品资料和 SKU 表',
        intent: '生成主图、卖点图和详情页局部图 Prompt。',
        reviewOwner: '电商运营',
        platform: '通用电商',
      },
    });
    assert.equal(productRun.status, 'blocked');
    assert.equal(productRun.steps.find((step) => step.stepId === 'product_brief_structure')?.status, 'succeeded');

    const feedback = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '真实工作区评论和客服问题',
      tags: ['评论', '差评', '客服问题'],
      text: [
        '评论：价格有点贵，想知道到底值不值。',
        '差评：早上总是忘记吃，坚持不下来。',
        '客服：孩子和老人能不能吃，有没有禁忌？',
        '私信：办公室抽屉里放一盒会不会方便一点？',
      ].join('\n'),
    });
    const feedbackRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: feedbackDefinition.id,
      inputSourceIds: [feedback.id],
      inputs: {
        source: '真实工作区评论、差评和客服问题',
        intent: '生成标题方向、内容角度和客服异议话术。',
        reviewOwner: '运营负责人',
        platform: '小红书',
      },
    });
    assert.equal(feedbackRun.status, 'queued');
    assert.equal(feedbackRun.steps.find((step) => step.stepId === 'feedback_cluster')?.status, 'succeeded');

    const greenRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: greenDefinition.id,
      inputs: {
        source: [
          '标题卡：早餐后顺手一次',
          '卖点卡：便携条包，包里抽屉都能放',
          'CTA：先从每天顺手一次开始',
        ].join('\n'),
        intent: '拆成第三方混剪可叠加的绿幕文案图。',
        reviewOwner: '短视频运营',
        duration: '4',
      },
    });
    assert.equal(greenRun.status, 'queued');
    assert.equal(greenRun.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'succeeded');
    const generatedOverlayCards = await overlayCards.list(workspacePath);
    assert.equal(generatedOverlayCards.length, 3);
    for (const card of generatedOverlayCards) {
      await assetReviews.review({
        workspacePath,
        workflowRunId: greenRun.id,
        assetKey: `overlay:${card.id}`,
        kind: 'overlay',
        sourceType: 'overlay-card',
        sourceId: card.id,
        path: card.assetPath,
        title: card.title,
        status: 'approved',
        tags: card.tags,
      });
    }

    const videoRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: videoDefinition.id,
      inputs: {
        source: '真实工作区视频素材包：已通过图片、口播脚本和绿幕卡。',
        intent: '生成 15 秒视频 Prompt，手动复制到第三方平台，并导入成品视频后导出混剪包。',
        reviewOwner: '短视频运营',
        duration: '15',
      },
    });
    const videoPromptDraftId = videoRun.steps.find((step) => step.stepId === 'prompt_generate')?.output?.promptDraftId;
    assert.equal(videoRun.status, 'queued');
    assert.equal(typeof videoPromptDraftId, 'string');
    await promptDrafts.recordCopy({
      workspacePath,
      draftId: videoPromptDraftId,
      target: 'RunningHub',
    });
    const copiedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: videoRun.id,
      event: 'video-prompt-copied',
      promptDraftId: videoPromptDraftId,
      summary: '已复制到第三方视频平台。',
    });

    const finishedVideoPath = join(workspacePath, '真实第三方成品视频.mp4');
    await writeFile(finishedVideoPath, TEST_VIDEO);
    const importedVideo = await inputSources.importFile(workspacePath, finishedVideoPath, 'successful-asset', {
      workflowRunId: copiedRun.id,
      relatedPromptDraftId: videoPromptDraftId,
      tags: ['第三方生成', '成品视频'],
    });
    const importedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: copiedRun.id,
      event: 'finished-video-imported',
      inputSourceId: importedVideo.id,
      promptDraftId: videoPromptDraftId,
    });
    const importedAssetKey = `imported:${importedVideo.id}:0:${importedVideo.sourcePath}`;
    const videoReview = await assetReviews.review({
      workspacePath,
      workflowRunId: importedRun.id,
      assetKey: importedAssetKey,
      kind: 'video',
      sourceType: 'input-source',
      sourceId: importedVideo.id,
      path: importedVideo.sourcePath,
      title: importedVideo.title,
      status: 'approved',
      tags: importedVideo.tags,
    });
    const overlayCard = generatedOverlayCards.find((card) => card.type === 'title') ?? generatedOverlayCards[0];
    const overlayAssetKey = `overlay:${overlayCard.id}`;
    const overlayRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: importedRun.id,
      event: 'overlay-cards-generated',
      promptDraftId: videoPromptDraftId,
      overlayCardIds: generatedOverlayCards.map((card) => card.id),
    });
    const reviewedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: overlayRun.id,
      event: 'asset-reviewed',
      assetReviewId: videoReview.id,
      assetKey: videoReview.assetKey,
    });

    const promptDraft = (await promptDrafts.list(workspacePath)).find((draft) => draft.id === videoPromptDraftId);
    const promptText = promptDraft?.versions.find((version) => version.id === promptDraft.activeVersionId)?.content
      ?? promptDraft?.versions[0]?.content
      ?? '';
    const mixPackage = await mixPackages.exportPackage({
      workspacePath,
      workflowRunId: reviewedRun.id,
      title: '真实工作区混剪包',
      platform: 'third-party-mix-tool',
      assets: [
        {
          id: importedAssetKey,
          kind: 'video',
          title: importedVideo.title,
          path: importedVideo.sourcePath,
          sourceType: 'input-source',
          sourceId: importedVideo.id,
          promptDraftId: videoPromptDraftId,
          promptText,
          tags: importedVideo.tags,
        },
        {
          id: overlayAssetKey,
          kind: 'overlay',
          title: overlayCard.title,
          path: overlayCard.assetPath,
          sourceType: 'overlay-card',
          sourceId: overlayCard.id,
          promptDraftId: videoPromptDraftId,
          promptText: overlayCard.text,
          tags: overlayCard.tags,
        },
      ],
    });
    const completedVideoRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: reviewedRun.id,
      event: 'mix-package-exported',
      mixPackageId: mixPackage.id,
      manifestPath: mixPackage.manifestPath,
      manifestCsvPath: mixPackage.manifestCsvPath,
      importGuidePath: mixPackage.importGuidePath,
      packageDir: mixPackage.packageDir,
    });
    assert.equal(completedVideoRun.status, 'succeeded');

    const referenceLog = await logs.append({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'reference-reverse',
      status: 'succeeded',
      title: '真实工作区对标反推',
      input: {
        referenceSources: [
          { id: 'reference-image-real', title: '真实参考图', kind: 'image', purpose: 'reference', sourcePath: 'reference-image.png' },
          { id: 'reference-video-real', title: '真实参考视频', kind: 'video', purpose: 'reference', sourcePath: 'reference-video.mp4' },
        ],
      },
      output: {
        analysis: {
          composition: '手机竖图，产品在真实桌面中自然出现。',
          lighting: '自然光。',
          textArea: '上方留出短标题区。',
          style: 'UGC 手机实拍感。',
          reusableElements: ['自然光', '桌面动作'],
          prompt: '真实手机实拍产品使用场景。',
          negativePrompt: '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
          risks: ['需要人工复核素材授权、商标和肖像风险。'],
          qualityChecklist: ['主体一致', '来源可追溯', '无竞品可识别元素'],
        },
      },
    });
    const videoBreakdownLog = await logs.append({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'video-breakdown',
      status: 'succeeded',
      title: '真实工作区参考视频拆解',
      input: {
        sourceType: 'file',
        source: 'reference-video.mp4',
      },
      output: {
        summary: '真实工作区参考视频拆解。',
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
    });
    const videoScriptLog = await logs.append({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'video-script',
      status: 'succeeded',
      title: '真实工作区视频脚本',
      input: {
        breakdownLogId: videoBreakdownLog.id,
      },
      output: {
        title: '真实工作区视频脚本',
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
    });
    await logs.append({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'video',
      status: 'succeeded',
      title: '真实工作区视频生成成本',
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
    });
    await platformDrafts.exportDraft({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      promptDraftId: videoPromptDraftId,
      sourceLogId: videoScriptLog.id,
      platform: '公众号',
      title: '真实工作区平台草稿',
      topic: '便携条包真实使用场景',
      audience: '通勤和办公用户',
      tone: '真实、克制、可复核',
      markdown: '# 真实工作区平台草稿\n\n这是一份由真实工作区服务导出的正文草稿，保留发布前复核边界。',
      publishCheck: [
        { level: 'warning', message: '发布前复核产品事实。' },
        { level: 'risk', message: '避免医疗化承诺。' },
      ],
    });

    const distilledSource = await inputSources.register({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'video',
      purpose: 'successful-asset',
      title: '成功素材沉淀 / 真实第三方成品视频',
      sourcePath: importedVideo.sourcePath,
      tags: ['successful-asset', 'prompt-distilled', 'video', 'workflow-run'],
      relatedPromptDraftId: videoPromptDraftId,
      relatedSceneCardIds: ['scene-card-real-video'],
      text: [
        '素材状态：已通过审核。',
        '质量原因：真实早餐桌自然光，动作节奏清楚。',
        '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
        '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
        '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
      ].join('\n'),
    });
    const distilledDraft = await promptDrafts.createFromContent({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      title: '成功素材 Prompt：真实第三方成品视频',
      purpose: 'video',
      userIntent: '复用通过审核素材的成功经验。',
      inputSourceIds: [distilledSource.id],
      content: [
        '素材状态：已通过审核。',
        '质量原因：真实早餐桌自然光，动作节奏清楚。',
        '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
        '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
        '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
      ].join('\n'),
      note: '由成功素材回炉生成',
      model: 'local-successful-asset-distiller',
      status: 'confirmed',
    });
    await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      event: 'asset-prompt-distilled',
      inputSourceId: distilledSource.id,
      promptDraftId: distilledDraft.id,
      assetKey: importedAssetKey,
    });

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
    assert.equal(report.sections.productBrief.productName, '真实工作区便携条包');
    assert.ok(report.sections.productBrief.checks.find((check) => check.id === 'product-brief-prompt-trace')?.status === 'pass');
    assert.ok(report.sections.feedback.checks.find((check) => check.id === 'feedback-objection-responses')?.status === 'pass');
    assert.deepEqual(report.sections.greenScreen.actualTypes.sort(), ['cta', 'selling-point', 'title']);
    assert.ok(report.sections.greenScreen.checks.find((check) => check.id === 'green-screen-card-approved')?.status === 'pass');
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.length >= 2);
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('publishBoundary'));
    assert.equal(report.sections.successfulAsset.asset.reviewStatus, 'approved');
    assert.ok(report.sections.successfulAsset.checks.find((check) => check.id === 'successful-asset-workflow-trace')?.status === 'pass');
    assert.ok(report.sections.reference.sampleSources.includes('真实参考图'));
    assert.equal(report.sections.mediaCost.actual.estimatedCost, 15);
    assert.deepEqual(report.sections.trace.uniqueWorkflowRunIds, [completedVideoRun.id]);
    assert.equal(referenceLog.workflowRunId, completedVideoRun.id);
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

test('工作流运行会记录步骤输入、输出和 artifact 引用', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const definitions = await workflows.listDefinitions(workspacePath);
    const definition = definitions.find((item) => item.key === 'xiaohongshu-seeding-image');
    assert.ok(definition, '应存在内置小红书种草图 SOP');

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '产品图 / 参考图 / 产品资料',
        intent: '生成小红书真实种草图 SOP 运行记录',
        reviewOwner: '审核人 A',
        platform: '小红书',
      },
    });

    assert.equal(run.status, 'queued');
    assert.ok(run.artifactRefs.length > 0);
    assert.match(run.artifactRefs[0], /^workflow-run:/);
    assert.equal(run.steps[0].status, 'succeeded');
    assert.match(JSON.stringify(run.steps[0].input), /source/);
    assert.match(JSON.stringify(run.steps[0].output), /已登记输入/);
    assert.equal(run.steps.find((step) => step.status === 'blocked'), undefined);
    assert.equal(run.steps.find((step) => step.stepId === 'reference_reverse')?.status, 'queued');
    assert.match(run.summary, /等待后续步骤执行/);
  });
});

test('SOP 缺少必填输入时不会进入后续执行步骤', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌场景提示词 SOP');

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '',
        intent: '',
      },
    });

    assert.equal(run.status, 'blocked');
    assert.match(run.summary, /缺少必填字段：资料来源、用户意图/);
    assert.equal(run.steps[0].status, 'blocked');
    assert.equal(run.steps[0].error, 'WORKFLOW_REQUIRED_INPUT_MISSING');
    assert.deepEqual(run.steps[0].output.missingRequired, ['资料来源', '用户意图']);
    assert.equal(run.steps.find((step) => step.stepId === 'brand_extract')?.status, 'queued');
  });
});

test('SOP 已选择输入源时补充资料说明可以为空', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const inputSources = new InputSourceStore();
    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '已登记品牌资料',
      text: '品牌事实：真实场景、合规边界和产品卖点。',
      summary: '已登记品牌资料',
    });
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌场景提示词 SOP');

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [source.id],
      inputs: {
        source: '',
        intent: '从已选择资料生成真实生活场景 Prompt。',
      },
    });

    assert.equal(run.status, 'queued');
    assert.deepEqual(run.inputSourceIds, [source.id]);
    assert.equal(run.steps[0].status, 'succeeded');
    assert.equal(run.steps[0].output.missingRequired, undefined);
  });
});

test('SOP 已选择知识引用时补充资料说明可以为空', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌场景提示词 SOP');

    const citations = [
      {
        knowledgeBaseId: 'brand-kb-selected',
        sectionId: 'facts',
        title: '产品知识库 / 产品事实',
        sectionType: 'product',
        excerpt: '便携条包适合早餐后和办公室抽屉场景。',
      },
    ];
    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      citations,
      inputs: {
        source: '',
        intent: '从已选择知识引用生成真实生活场景 Prompt。',
      },
    });

    assert.equal(run.status, 'queued');
    assert.deepEqual(run.citations, citations);
    assert.equal(run.steps[0].status, 'succeeded');
    assert.equal(run.steps[0].output.missingRequired, undefined);
    assert.match(JSON.stringify(run.steps[0].input), /selectedCitations/);
  });
});

test('SOP 草案可以编辑、发布并运行', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const draft = await workflows.createDraft({
      workspacePath,
      templateKey: 'brand-scene-prompts',
      title: '功能测试自定义 SOP 草案',
    });
    const edited = await workflows.updateDefinition({
      ...draft,
      title: '功能测试可运行 SOP',
      description: '验证草案编辑后可以发布并创建运行记录。',
      version: 'v0.2',
      priority: 'P1',
      tags: ['功能测试', '自定义 SOP'],
      inputSchema: [
        { key: 'source', label: '资料来源', type: 'textarea', required: true },
        { key: 'intent', label: '执行目标', type: 'textarea', required: true },
      ],
      steps: [
        { id: 'input_register', title: '登记输入源', kind: 'input', description: '登记资料和目标。', dependsOn: [], outputKeys: ['InputSource'] },
        { id: 'human_review', title: '人工审核', kind: 'review', description: '确认输入和执行目标。', dependsOn: ['input_register'], outputKeys: ['ReviewResult'] },
        { id: 'asset_store', title: '入历史', kind: 'asset-store', description: '归档本次 SOP 运行。', dependsOn: ['human_review'], outputKeys: ['RunArchive'] },
      ],
      reviewRules: ['必须确认资料来源清楚。'],
      outputSpec: ['RunArchive'],
    });
    assert.equal(edited.title, '功能测试可运行 SOP');
    assert.equal(edited.status, 'draft');
    assert.equal(edited.steps.length, 3);

    const published = await workflows.updateDefinition({ ...edited, status: 'published' });
    assert.equal(published.status, 'published');

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: published.id,
      inputs: {
        source: '一份本地 SOP 输入资料',
        intent: '验证定义编辑发布后可以运行。',
      },
    });
    assert.equal(run.title, '功能测试可运行 SOP');
    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.match(JSON.stringify(run.steps[0].input), /一份本地 SOP 输入资料/);
  });
});

test('无模板 SOP 草案使用通用方法论脚手架，不误套图片 SOP', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const draft = await workflows.createDraft({
      workspacePath,
      title: 'Prompt 工作台沉淀 SOP 草案',
      description: '由 SOP 提示词草稿物化，应该保持通用步骤而不是小红书图片模板。',
    });

    assert.match(draft.key, /^custom-sop-draft-/);
    assert.equal(draft.title, 'Prompt 工作台沉淀 SOP 草案');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.steps.some((step) => step.id === 'agent_read'), true);
    assert.equal(draft.steps.some((step) => step.id === 'image_generate'), false);
    assert.equal(draft.reviewRules.some((rule) => rule.includes('真实 provider')), true);
    assert.deepEqual(draft.tags, ['自定义', '提示词草稿', 'SOP']);
  });
});

test('从内置视频 SOP 复制出的草案发布后仍可推进手工事件', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const draft = await workflows.createDraft({
      workspacePath,
      templateKey: 'video-material-package',
      title: '客户自定义视频素材包 SOP',
    });
    const published = await workflows.updateDefinition({
      ...draft,
      status: 'published',
    });
    assert.match(published.key, /^video-material-package-draft-/);

    const started = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: published.id,
      inputs: {
        source: '客户自定义素材库和脚本。',
        intent: '生成 15 秒素材 Prompt，第三方生成后导入并交付混剪包。',
        duration: '15',
      },
    });
    assert.equal(started.workflowKey, published.key);

    const copied = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: started.id,
      event: 'video-prompt-copied',
      promptDraftId: 'prompt-draft-custom-video',
    });
    assert.equal(copied.steps.find((step) => step.stepId === 'prompt_copy')?.status, 'succeeded');

    const imported = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: copied.id,
      event: 'finished-video-imported',
      inputSourceId: 'input-source-custom-video',
      promptDraftId: 'prompt-draft-custom-video',
    });
    assert.equal(imported.steps.find((step) => step.stepId === 'finished_video_import')?.status, 'succeeded');

    const overlay = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: imported.id,
      event: 'overlay-cards-generated',
      promptDraftId: 'prompt-draft-custom-video',
      overlayCardIds: ['overlay-card-custom-title'],
    });
    assert.equal(overlay.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'succeeded');

    const reviewed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: overlay.id,
      event: 'asset-reviewed',
      assetReviewId: 'asset-review-custom-video',
      assetKey: 'imported:input-source-custom-video:0:/tmp/custom-video.mp4',
    });
    assert.equal(reviewed.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');

    const completed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: reviewed.id,
      event: 'mix-package-exported',
      mixPackageId: 'mix-package-custom-video',
      manifestPath: '/tmp/custom-manifest.json',
      packageDir: '/tmp/custom-mix-package',
    });
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.steps.every((step) => step.status === 'succeeded'), true);
    assert.ok(completed.artifactRefs.includes('mix-package:mix-package-custom-video'));
    assert.ok(completed.artifactRefs.includes('overlay-card:overlay-card-custom-title'));
  });
});

test('WorkflowEngine 可以执行 IP SOP 到 PromptDraft 并停在人工审核', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const ipKnowledgeBases = new IpKnowledgeBaseStore(text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ipKnowledgeBases,
    );
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'ip-longform');
    assert.ok(definition, '应存在内置 IP 长文 SOP');
    const citations = [{
      knowledgeBaseId: 'ip-demo',
      sectionId: 'profile-1',
      title: '嘉文老师 IP 知识库 / 人物定位',
      sectionType: 'profile',
      excerpt: '身份锚定、价值观立场、语言风格、判断方法、内容素材和创作引擎。',
    }];

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      citations,
      inputs: {
        source: '嘉文老师 IP 知识库：身份、价值观、语言风格、判断方法和内容素材。',
        intent: '生成公众号长文 Prompt，主题是个人 IP 内容资产化。',
        reviewOwner: '内容负责人',
      },
    });

    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'ip_extract')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'agent_read')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('input-source:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('ip-knowledge-base:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('agent-session:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
    assert.ok((await inputSources.list(workspacePath)).length >= 1);
    assert.equal((await ipKnowledgeBases.list(workspacePath)).length, 1);
    const storedSessions = await sessions.list(workspacePath);
    assert.ok(storedSessions.length >= 1);
    assert.equal(storedSessions[0].workflowRunId, run.id);
    const storedDrafts = await promptDrafts.list(workspacePath);
    assert.ok(storedDrafts.length >= 1);
    assert.equal(storedDrafts[0].workflowRunId, run.id);
    const [storedRun] = await workflows.listRuns(workspacePath);
    assert.equal(storedRun.id, run.id);
    assert.equal(storedRun.status, 'queued');

    const promptDraftId = run.steps.find((step) => step.stepId === 'prompt_generate')?.output?.promptDraftId;
    assert.equal(typeof promptDraftId, 'string');
    const draftRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'article-draft-generated',
      promptDraftId,
      generationLogId: 'article-log-functional',
    });
    assert.equal(draftRun.status, 'queued');
    assert.equal(draftRun.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.match(JSON.stringify(draftRun.steps.find((step) => step.stepId === 'human_review')?.output ?? {}), /article-log-functional/);

    const exportPath = join(workspacePath, 'ip-longform.md');
    const completedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'article-markdown-exported',
      promptDraftId,
      generationLogId: 'article-log-functional',
      exportPath,
    });
    assert.equal(completedRun.status, 'succeeded');
    assert.equal(completedRun.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');
    assert.equal(completedRun.steps.find((step) => step.stepId === 'asset_store')?.status, 'succeeded');
    assert.ok(completedRun.artifactRefs.includes(`generation-log:article-log-functional`));
    assert.ok(completedRun.artifactRefs.includes(exportPath));

    const platformDraftRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'article-platform-draft-exported',
      promptDraftId,
      generationLogId: 'article-log-functional',
      exportPath: join(workspacePath, 'platform-draft', 'draft.md'),
      manifestPath: join(workspacePath, 'platform-draft', 'manifest.json'),
      packageDir: join(workspacePath, 'platform-draft'),
    });
    assert.equal(platformDraftRun.status, 'succeeded');
    assert.ok(platformDraftRun.artifactRefs.includes(join(workspacePath, 'platform-draft', 'manifest.json')));
    assert.ok(platformDraftRun.artifactRefs.includes(join(workspacePath, 'platform-draft')));
  });
});

test('WorkflowEngine 可以执行品牌知识库到场景库和 Prompt 组 SOP', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const brandKnowledgeBases = new BrandKnowledgeBaseStore(text);
    const promptPacks = new PromptPackService(logs, text);
    const sceneCards = new SceneLibraryStore(logs, promptPacks, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      undefined,
      brandKnowledgeBases,
      promptPacks,
      sceneCards,
    );
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌知识库场景提示词 SOP');

    const citations = [
      {
        knowledgeBaseId: 'kb-brand',
        sectionId: 'facts',
        title: '产品知识库 / 产品事实',
        sectionType: 'product',
        excerpt: '便携条包，适合早餐后和办公室抽屉场景，强调降低坚持门槛。',
      },
      {
        knowledgeBaseId: 'kb-brand',
        sectionId: 'boundary',
        title: '产品知识库 / 合规边界',
        sectionType: 'compliance',
        excerpt: '不得承诺治疗、见效或绝对化收益，只能围绕使用场景和产品事实表达。',
      },
      {
        knowledgeBaseId: 'kb-brand',
        sectionId: 'scenario',
        title: '产品知识库 / 场景素材',
        sectionType: 'scenario-script',
        excerpt: '早餐桌、办公室抽屉、妈妈给孩子书包侧袋放入条包。',
      },
    ];

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      citations,
      inputs: {
        source: '',
        intent: '生成小红书 UGC 手机实拍图片 Prompt 组。',
        reviewOwner: '场景负责人',
      },
    });

    assert.equal(run.status, 'queued');
    assert.equal(run.citations.length, citations.length);
    assert.equal(run.steps.find((step) => step.stepId === 'brand_extract')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_pack')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'scene_library')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_group')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.ok(JSON.stringify(run.steps[0].input).includes('selectedCitations'));
    assert.match(run.steps[0].summary, /已选择知识引用/);
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('brand-knowledge-base:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-pack:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('scene-card:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
    assert.equal((await brandKnowledgeBases.list(workspacePath)).length, 1);
    const storedPacks = await promptPacks.list(workspacePath);
    assert.equal(storedPacks.length, 1);
    assert.equal(storedPacks[0].workflowRunId, run.id);
    assert.equal(storedPacks[0].inputSourceIds.length, 0);
    assert.ok(storedPacks[0].citations.some((item) => item.knowledgeBaseId.startsWith('brand-kb:')));
    const storedSceneCards = await sceneCards.list(workspacePath);
    assert.equal(storedSceneCards.length, 3);
    assert.equal(storedSceneCards.every((card) => card.workflowRunId === run.id), true);
    assert.equal(storedSceneCards.every((card) => card.inputSourceIds.length === 0), true);
    assert.equal(storedSceneCards.every((card) => card.citations.length >= 1), true);
    const storedDrafts = await promptDrafts.list(workspacePath);
    assert.equal(storedDrafts.length, 1);
    assert.equal(storedDrafts[0].workflowRunId, run.id);
    assert.equal(storedDrafts[0].inputSourceIds.length, 0);
    assert.equal(storedDrafts[0].sceneCardIds.length, 3);
    assert.match(storedDrafts[0].versions[0].content, /办公室早餐场景/);
    assert.equal(storedDrafts[0].versions[0].content.match(/### 图片 Prompt/g)?.length, 10);
    const videoPromptGroup = buildScenePromptGroupContent(
      'video',
      '生成可复制到图生视频工具的 15 秒素材 Prompt。',
      storedSceneCards,
    );
    assert.equal(videoPromptGroup.match(/### 视频 Prompt/g)?.length, 10);
    const storedLogs = await logs.list(workspacePath);
    assert.equal(storedLogs.filter((log) => log.kind === 'prompt-pack').every((log) => log.workflowRunId === run.id), true);
    assert.equal(storedLogs.filter((log) => log.kind === 'scene-card').every((log) => log.workflowRunId === run.id), true);
    const [storedRun] = await workflows.listRuns(workspacePath);
    assert.equal(storedRun.id, run.id);
    assert.equal(storedRun.citations.length, citations.length);

    const reviewed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'workflow-review-approved',
    });
    assert.equal(reviewed.status, 'queued');
    assert.equal(reviewed.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');
    assert.equal(reviewed.steps.find((step) => step.stepId === 'asset_store')?.status, 'queued');

    const archived = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'workflow-asset-archived',
    });
    assert.equal(archived.status, 'succeeded');
    assert.equal(archived.steps.find((step) => step.stepId === 'asset_store')?.status, 'succeeded');
    assert.match(archived.summary, /品牌知识库场景提示词 SOP 已完成/);
  });
});

test('WorkflowEngine 可以执行产品商业素材 SOP 到三类图片 Prompt', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'product-commercial-assets');
    assert.ok(definition, '应存在产品商业素材 SOP');

    const productBrief = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '工作区便携条包产品资料',
      tags: ['产品资料', 'brief'],
      text: [
        '产品名称：工作区便携条包',
        '卖点：早餐后、办公室抽屉和通勤包里都能顺手取用',
        '规格：15g * 20 条',
        '适用场景：早餐后、通勤、办公室加班',
        '禁用表达：不得承诺治疗、见效或替代专业建议',
      ].join('\n'),
    });
    const skuTable = await inputSources.register({
      workspacePath,
      kind: 'sku-table',
      purpose: 'product-brief',
      title: '工作区 SKU 表',
      tags: ['sku'],
      text: 'SKU,规格,价格\ntrial-10,15g*10条,59\nfamily-40,15g*40条,169',
    });

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [productBrief.id, skuTable.id],
      inputs: {
        source: '产品资料和 SKU 表',
        intent: '生成主图、卖点图和详情页局部图 Prompt。',
        reviewOwner: '电商运营',
        platform: '天猫 / 淘宝',
      },
    });

    assert.equal(run.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'succeeded');
    const productStep = run.steps.find((step) => step.stepId === 'product_brief_structure');
    assert.equal(productStep?.status, 'succeeded');
    assert.deepEqual(productStep?.output.promptTypes, ['main-image', 'selling-point-image', 'detail-page-section']);
    assert.equal(productStep?.output.skuRows.length, 2);
    assert.equal(productStep?.output.skuRows[0].SKU, 'trial-10');
    assert.match(productStep?.output.variableTable, /工作区便携条包/);
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'image_generate')?.status, 'blocked');
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
    assert.ok(run.artifactRefs.includes(`input-source:${productBrief.id}`));
    assert.ok(run.artifactRefs.includes(`input-source:${skuTable.id}`));

    const [draft] = await promptDrafts.list(workspacePath);
    assert.equal(draft.workflowRunId, run.id);
    assert.equal(draft.status, 'confirmed');
    assert.equal(draft.purpose, 'image');
    assert.ok(draft.inputSourceIds.includes(productBrief.id));
    assert.ok(draft.inputSourceIds.includes(skuTable.id));
    assert.match(draft.versions[0].content, /主图 Prompt/);
    assert.match(draft.versions[0].content, /卖点图 Prompt/);
    assert.match(draft.versions[0].content, /详情页模块 Prompt/);
    assert.match(draft.versions[0].content, /trial-10/);
  });
});

test('WorkflowEngine 产品商业素材 SOP 缺字段时阻断下游', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'product-commercial-assets');
    assert.ok(definition, '应存在产品商业素材 SOP');

    const incompleteBrief = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '缺字段产品资料',
      tags: ['产品资料'],
      text: '产品名称：缺字段条包\n卖点：放在包里不占地方',
    });

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [incompleteBrief.id],
      inputs: {
        source: '缺字段产品资料',
        intent: '生成详情页素材 Prompt。',
        reviewOwner: '电商运营',
        platform: '通用电商',
      },
    });

    const productStep = run.steps.find((step) => step.stepId === 'product_brief_structure');
    assert.equal(run.status, 'blocked');
    assert.equal(productStep?.status, 'blocked');
    assert.equal(productStep?.error, 'WORKFLOW_PRODUCT_BRIEF_FIELDS_MISSING');
    assert.deepEqual(productStep?.output.missingFields, ['规格 / SKU', '适用场景 / 人群', '禁用表达 / 合规边界']);
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'queued');
    assert.equal((await promptDrafts.list(workspacePath)).length, 0);
  });
});

test('WorkflowEngine 可以执行评论痛点选题 SOP 到文案 Prompt', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'feedback-topic-matrix');
    assert.ok(definition, '应存在评论痛点选题 SOP');

    const feedback = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '评论和客服问题',
      tags: ['评论', '差评', '客服问题'],
      text: [
        '评论：价格有点贵，想知道到底值不值。',
        '差评：早上总是忘记吃，坚持不下来。',
        '客服：孩子和老人能不能吃，有没有禁忌？',
        '私信：办公室抽屉里放一盒会不会方便一点？',
      ].join('\n'),
    });

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [feedback.id],
      inputs: {
        source: '评论、差评和客服问题',
        intent: '生成下周小红书选题、标题方向和客服异议话术。',
        reviewOwner: '运营负责人',
        platform: '小红书',
      },
    });

    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'succeeded');
    const feedbackStep = run.steps.find((step) => step.stepId === 'feedback_cluster');
    assert.equal(feedbackStep?.status, 'succeeded');
    assert.equal(feedbackStep?.output.totalLines, 4);
    assert.ok(feedbackStep?.output.clusters.some((cluster) => cluster.key === 'price-trust'));
    assert.ok(feedbackStep?.output.clusters.some((cluster) => cluster.key === 'usage-friction'));
    assert.ok(feedbackStep?.output.clusters.some((cluster) => cluster.key === 'audience-fit'));
    assert.ok(feedbackStep?.output.titleDirections.length >= 3);
    assert.ok(feedbackStep?.output.objectionResponses.some((item) => item.boundary.includes('人工复核')));
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.ok(run.artifactRefs.includes(`input-source:${feedback.id}`));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));

    const [draft] = await promptDrafts.list(workspacePath);
    assert.equal(draft.workflowRunId, run.id);
    assert.equal(draft.status, 'confirmed');
    assert.equal(draft.purpose, 'article');
    assert.ok(draft.inputSourceIds.includes(feedback.id));
    assert.match(draft.versions[0].content, /价格和信任顾虑/);
    assert.match(draft.versions[0].content, /使用门槛和坚持成本/);
    assert.match(draft.versions[0].content, /适用人群和禁忌边界/);
    assert.match(draft.versions[0].content, /客服异议处理/);
    assert.match(draft.versions[0].content, /价格有点贵/);
  });
});

test('WorkflowEngine 评论痛点选题 SOP 缺少反馈时阻断下游', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'feedback-topic-matrix');
    assert.ok(definition, '应存在评论痛点选题 SOP');

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '',
        intent: '生成选题方向。',
        reviewOwner: '运营负责人',
        platform: '小红书',
      },
    });

    assert.equal(run.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'feedback_cluster')?.status, 'queued');
    assert.equal((await promptDrafts.list(workspacePath)).length, 0);
  });
});

test('WorkflowEngine 可以执行绿幕文案图 SOP 并自动送审', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const assetReviews = new AssetReviewStore();
    const overlayCards = new OverlayCardStore();
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      assetReviews,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      overlayCards,
    );
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'green-screen-card-package');
    assert.ok(definition, '应存在绿幕文案图 SOP');

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: [
          '标题卡：早餐后顺手一次',
          '卖点卡：便携条包，包里抽屉都能放',
          'CTA：先从每天顺手一次开始',
        ].join('\n'),
        intent: '拆成第三方混剪可叠加的绿幕文案图。',
        reviewOwner: '短视频运营',
        duration: '4',
      },
    });

    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
    const overlayStep = run.steps.find((step) => step.stepId === 'overlay_cards');
    assert.equal(overlayStep?.status, 'succeeded');
    assert.deepEqual(overlayStep?.output.cardTypes, ['title', 'selling-point', 'cta']);
    assert.equal(overlayStep?.output.overlayCardIds.length, 3);
    assert.equal(overlayStep?.output.assetReviewIds.length, 3);
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');

    const cards = await overlayCards.list(workspacePath);
    assert.equal(cards.length, 3);
    assert.equal(cards.every((card) => card.background === 'green-screen'), true);
    assert.equal(cards.every((card) => card.aspectRatio === '9:16'), true);
    assert.equal(cards.every((card) => existsSync(card.assetPath)), true);
    assert.ok(cards.some((card) => card.type === 'title' && card.text.includes('早餐后')));
    assert.ok(cards.some((card) => card.type === 'selling-point' && card.text.includes('便携条包')));
    assert.ok(cards.some((card) => card.type === 'cta' && card.text.includes('顺手一次')));
    const reviews = await assetReviews.list(workspacePath);
    assert.equal(reviews.length, 3);
    assert.equal(reviews.every((review) => review.status === 'pending'), true);
    assert.equal(reviews.every((review) => review.kind === 'overlay'), true);
    assert.equal(reviews.every((review) => review.workflowRunId === run.id), true);
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('overlay-card:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('asset-review:')));
  });
});

test('WorkflowEngine 绿幕文案图 SOP 缺少脚本时阻断下游', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new OverlayCardStore(),
    );
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'green-screen-card-package');
    assert.ok(definition, '应存在绿幕文案图 SOP');

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '',
        intent: '',
        duration: '4',
      },
    });

    assert.equal(run.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'queued');
    assert.equal((await new OverlayCardStore().list(workspacePath)).length, 0);
  });
});

test('WorkflowEngine 会从 SOP 输入源路径自动导入文件并生成知识引用', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const brandKnowledgeBases = new BrandKnowledgeBaseStore(text);
    const promptPacks = new PromptPackService(logs, text);
    const sceneCards = new SceneLibraryStore(logs, promptPacks, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      undefined,
      brandKnowledgeBases,
      promptPacks,
      sceneCards,
    );
    const knowledgePath = join(workspacePath, '唯他瑞葡聚糖知识库.md');
    await writeFile(knowledgePath, [
      '# 唯他瑞葡聚糖知识库',
      '',
      '产品事实：便携条包，适合早餐后和办公室抽屉场景。',
      '核心卖点：降低坚持门槛，先讲使用场景，再讲卖点。',
      '合规边界：不得承诺治疗、见效或绝对化收益。',
    ].join('\n'), 'utf-8');
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌知识库场景提示词 SOP');

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: knowledgePath,
        intent: '生成品牌知识库、场景库和小红书图片 Prompt 组。',
        reviewOwner: '品牌负责人',
      },
    });

    assert.equal(run.status, 'queued');
    assert.ok(run.citations.some((citation) => citation.knowledgeBaseId.startsWith('input-source:') && /便携条包/.test(citation.excerpt)));
    assert.equal(run.steps.find((step) => step.stepId === 'brand_extract')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_group')?.status, 'succeeded');
    const importedSources = await inputSources.list(workspacePath);
    const importedKnowledgeSource = importedSources.find((source) => source.title === '唯他瑞葡聚糖知识库.md' && source.status === 'converted');
    assert.ok(importedKnowledgeSource);
    assert.equal(importedKnowledgeSource.workflowRunId, run.id);
    assert.equal(importedSources.every((source) => source.workflowRunId === run.id), true);
    const inputStep = run.steps.find((step) => step.stepId === 'input_register');
    assert.match(JSON.stringify(inputStep?.output ?? {}), /importedInputSourceIds/);
    assert.ok(run.artifactRefs.some((ref) => ref.endsWith('唯他瑞葡聚糖知识库.md')));
  });
});

test('WorkflowEngine 图片步骤成功后会自动进入素材审核台', async () => {
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
      const logs = new GenerationLogStore();
      const text = new FakeTextGenerationService();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, text);
      const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
      const assetReviews = new AssetReviewStore();
      const media = new MediaProvider({
        async readView() {
          return {
            apiEndpoint: 'https://api.anthropic.com',
            hasApiKey: false,
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textModel: 'claude-sonnet-4-5',
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: true,
            imageModels: ['test-image-model'],
            videoProvider: 'disabled',
            videoApiEndpoint: '',
            hasVideoApiKey: false,
            videoModel: 'test-video-model',
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
        async getVideoApiKey() { return undefined; },
      }, logs);
      const workflows = new WorkflowStore();
      const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media, assetReviews);
      const baseDefinition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'ip-longform');
      assert.ok(baseDefinition, '应存在可复用的内置 SOP 定义');
      const definition = await workflows.updateDefinition({
        ...baseDefinition,
        key: 'image-review-smoke',
        title: '图片生成审核 SOP',
        description: '登记输入源后生成图片 Prompt，真实生成图片并自动送审。',
        tags: ['图片', '审核', 'SOP'],
        outputSpec: ['PromptVersion', 'ImageArtifact', 'ReviewResult'],
        steps: [
          { id: 'input_register', title: '登记输入源', kind: 'input', description: '记录产品和场景输入。', dependsOn: [], outputKeys: ['InputSource'] },
          { id: 'prompt_generate', title: '生成图片 Prompt', kind: 'prompt-generate', description: '生成图片生成可用 Prompt。', dependsOn: ['input_register'], outputKeys: ['PromptVersion'] },
          { id: 'image_generate', title: '图片生成', kind: 'image-generate', description: '调用真实图片 provider 生成候选图。', dependsOn: ['prompt_generate'], outputKeys: ['ImageArtifact'] },
          { id: 'human_review', title: '人工审核', kind: 'review', description: '确认图片是否可入素材库。', dependsOn: ['image_generate'], outputKeys: ['ReviewResult'] },
          { id: 'asset_store', title: '入素材库', kind: 'asset-store', description: '保存通过审核的图片和来源追溯。', dependsOn: ['human_review'], outputKeys: ['AssetRecord'] },
        ],
      });

      const run = await engine.startRun({
        workspacePath,
        workflowDefinitionId: definition.id,
        inputs: {
          source: '产品：便携条包；场景：早餐后自然光桌面。',
          intent: '生成一张小红书种草图，产品主体清晰。',
          reviewOwner: '素材审核人',
        },
      });

      assert.equal(run.status, 'queued');
      assert.equal(run.steps.find((step) => step.stepId === 'image_generate')?.status, 'succeeded');
      assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs.length, 1);
      assert.equal(storedLogs[0].status, 'succeeded');
      assert.equal(storedLogs[0].workflowRunId, run.id);
      assert.equal(existsSync(storedLogs[0].artifactRefs[0]), true);
      const reviews = await assetReviews.list(workspacePath);
      assert.equal(reviews.length, 1);
      assert.equal(reviews[0].status, 'pending');
      assert.equal(reviews[0].workflowRunId, run.id);
      assert.equal(reviews[0].sourceType, 'generation-log');
      assert.equal(reviews[0].sourceId, storedLogs[0].id);
      assert.equal(reviews[0].assetKey, `generated:${storedLogs[0].id}:0:${storedLogs[0].artifactRefs[0]}`);
      assert.ok(run.artifactRefs.includes(`asset-review:${reviews[0].id}`));

      const rejected = await workflows.recordManualEvent({
        workspacePath,
        workflowRunId: run.id,
        event: 'asset-review-rejected',
        assetReviewId: reviews[0].id,
        assetKey: reviews[0].assetKey,
      });
      assert.equal(rejected.status, 'blocked');
      assert.equal(rejected.steps.find((step) => step.stepId === 'human_review')?.status, 'blocked');
      assert.match(rejected.summary, /驳回|回炉/);

      const completed = await workflows.recordManualEvent({
        workspacePath,
        workflowRunId: run.id,
        event: 'asset-reviewed',
        assetReviewId: reviews[0].id,
        assetKey: reviews[0].assetKey,
      });
      assert.equal(completed.status, 'succeeded');
      assert.equal(completed.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');
      assert.equal(completed.steps.find((step) => step.stepId === 'asset_store')?.status, 'succeeded');
      assert.ok(completed.artifactRefs.includes(`asset-review:${reviews[0].id}`));
      assert.ok(completed.artifactRefs.includes(reviews[0].assetKey));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
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

test('图片工作台生成候选图后可以回写图片 SOP 并继续审核', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const baseDefinition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(baseDefinition, '应存在可复用的内置 SOP 定义');
    const definition = await workflows.updateDefinition({
      ...baseDefinition,
      key: 'manual-image-workbench-sop',
      title: '图片工作台回写 SOP',
      description: '从 SOP 打开图片工作台生成候选图后，应回写 image_generate 并进入人工审核。',
      tags: ['图片', '工作台回写'],
      outputSpec: ['ImageArtifact', 'ReviewResult', 'AssetRecord'],
      steps: [
        { id: 'input_register', title: '登记输入源', kind: 'input', description: '记录产品和场景输入。', dependsOn: [], outputKeys: ['InputSource'] },
        { id: 'prompt_generate', title: '生成图片 Prompt', kind: 'prompt-generate', description: '生成图片工作台可用 Prompt。', dependsOn: ['input_register'], outputKeys: ['PromptVersion'] },
        { id: 'image_generate', title: '图片生成', kind: 'image-generate', description: '用户在图片工作台生成候选图后回写。', dependsOn: ['prompt_generate'], outputKeys: ['ImageArtifact'] },
        { id: 'human_review', title: '人工审核', kind: 'review', description: '确认图片是否可入素材库。', dependsOn: ['image_generate'], outputKeys: ['ReviewResult'] },
        { id: 'asset_store', title: '入素材库', kind: 'asset-store', description: '保存通过审核的图片和来源追溯。', dependsOn: ['human_review'], outputKeys: ['AssetRecord'] },
      ],
    });

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '产品资料和参考图',
        intent: '生成一张小红书种草图。',
        reviewOwner: '素材审核人',
      },
    });
    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'image_generate')?.status, 'queued');

    const generated = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'image-candidates-generated',
      generationLogId: 'log-image-001',
      assetRefs: ['/tmp/bugu-image-001.png'],
      summary: '功能测试图片工作台已生成候选图。',
    });
    assert.equal(generated.status, 'queued');
    assert.equal(generated.steps.find((step) => step.stepId === 'image_generate')?.status, 'succeeded');
    assert.equal(generated.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.ok(generated.artifactRefs.includes('generation-log:log-image-001'));
    assert.ok(generated.artifactRefs.includes('/tmp/bugu-image-001.png'));

    const completed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'asset-reviewed',
      assetReviewId: 'review-image-001',
      assetKey: 'generated:log-image-001:0:/tmp/bugu-image-001.png',
    });
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.steps.find((step) => step.stepId === 'asset_store')?.status, 'succeeded');
    assert.ok(completed.artifactRefs.includes('asset-review:review-image-001'));
  });
});

test('视频素材包 SOP 可以通过手工事件推进到混剪清单', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const assetReviews = new AssetReviewStore();
    const overlayCards = new OverlayCardStore();
    const mixPackages = new MixPackageStore(assetReviews);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media, assetReviews);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'video-material-package');
    assert.ok(definition, '应存在视频素材包 SOP');
    assert.equal(definition.status, 'published');

    const started = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '品牌场景库和视频素材需求',
        intent: '生成 15 秒视频素材 Prompt、绿幕文案图和混剪清单。',
        reviewOwner: '视频负责人',
        duration: '15',
      },
    });

    const promptStep = started.steps.find((step) => step.stepId === 'prompt_generate');
    const promptDraftId = promptStep?.output?.promptDraftId;
    assert.equal(started.status, 'queued');
    assert.equal(promptStep?.status, 'succeeded');
    assert.equal(started.steps.find((step) => step.stepId === 'prompt_copy')?.status, 'queued');
    assert.equal(typeof promptDraftId, 'string');

    await promptDrafts.recordCopy({
      workspacePath,
      draftId: promptDraftId,
      target: 'RunningHub',
    });
    const copied = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: started.id,
      event: 'video-prompt-copied',
      promptDraftId,
      summary: '已复制到 RunningHub。',
    });
    assert.equal(copied.steps.find((step) => step.stepId === 'prompt_copy')?.status, 'succeeded');
    assert.equal(copied.steps.find((step) => step.stepId === 'finished_video_import')?.status, 'queued');

    const videoPath = join(workspacePath, 'third-party-finished-video.mp4');
    await writeFile(videoPath, TEST_VIDEO);
    const imported = await inputSources.importFile(workspacePath, videoPath, 'successful-asset', {
      workflowRunId: copied.id,
      relatedPromptDraftId: promptDraftId,
      relatedSceneCardIds: ['scene-card-video-001'],
      tags: ['第三方生成', '成品视频'],
    });
    assert.equal(imported.workflowRunId, copied.id);
    assert.equal(imported.relatedPromptDraftId, promptDraftId);
    assert.deepEqual(imported.relatedSceneCardIds, ['scene-card-video-001']);
    const importedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: copied.id,
      event: 'finished-video-imported',
      inputSourceId: imported.id,
      promptDraftId,
    });
    assert.equal(importedRun.steps.find((step) => step.stepId === 'finished_video_import')?.status, 'succeeded');
    assert.equal(importedRun.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'queued');

    const repeatedRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [imported.id],
      inputs: {
        source: '新的品牌场景库和视频素材需求',
        intent: '验证历史成品视频不会自动成为新 SOP 输入。',
        reviewOwner: '视频负责人',
        duration: '15',
      },
    });
    assert.equal(repeatedRun.inputSourceIds.includes(imported.id), false);

    const importedAssetKey = `imported:${imported.id}:0:${imported.sourcePath}`;
    const earlyVideoReview = await assetReviews.review({
      workspacePath,
      assetKey: importedAssetKey,
      kind: 'video',
      sourceType: 'input-source',
      sourceId: imported.id,
      path: imported.sourcePath,
      title: imported.title,
      status: 'approved',
      tags: imported.tags,
    });
    const earlyReviewedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: importedRun.id,
      event: 'asset-reviewed',
      assetReviewId: earlyVideoReview.id,
      assetKey: earlyVideoReview.assetKey,
    });
    assert.equal(earlyReviewedRun.status, 'queued');
    assert.equal(earlyReviewedRun.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'queued');
    assert.equal(earlyReviewedRun.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.equal(earlyReviewedRun.steps.find((step) => step.stepId === 'export_manifest')?.status, 'queued');
    assert.ok(earlyReviewedRun.artifactRefs.includes(`asset-review:${earlyVideoReview.id}`));
    assert.ok(earlyReviewedRun.artifactRefs.includes(importedAssetKey));

    const overlays = await overlayCards.generate({
      workspacePath,
      promptDraftId,
      cards: [
        { type: 'title', title: '标题卡', text: '早餐后顺手一次', durationSeconds: 3 },
        { type: 'selling-point', title: '卖点卡', text: '便携条包，包里抽屉都能放', durationSeconds: 4 },
      ],
    });
    const overlayRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: importedRun.id,
      event: 'overlay-cards-generated',
      promptDraftId,
      overlayCardIds: overlays.map((card) => card.id),
    });
    assert.equal(overlayRun.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'succeeded');
    assert.equal(overlayRun.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');

    const overlayAssetKey = `overlay:${overlays[0].id}`;
    await assetReviews.review({
      workspacePath,
      assetKey: overlayAssetKey,
      kind: 'overlay',
      sourceType: 'overlay-card',
      sourceId: overlays[0].id,
      path: overlays[0].assetPath,
      title: overlays[0].title,
      status: 'approved',
      tags: overlays[0].tags,
    });
    const reviewedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: overlayRun.id,
      event: 'asset-reviewed',
      assetReviewId: earlyVideoReview.id,
      assetKey: earlyVideoReview.assetKey,
    });
    assert.equal(reviewedRun.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');
    assert.equal(reviewedRun.steps.find((step) => step.stepId === 'export_manifest')?.status, 'queued');

    const [draft] = await promptDrafts.list(workspacePath);
    const promptText = draft.versions.find((version) => version.id === draft.activeVersionId)?.content ?? draft.versions[0].content;
    const pack = await mixPackages.exportPackage({
      workspacePath,
      workflowRunId: reviewedRun.id,
      title: '视频素材包 SOP 功能测试',
      platform: 'third-party-mix-tool',
      assets: [
        {
          id: importedAssetKey,
          kind: 'video',
          title: imported.title,
          path: imported.sourcePath,
          sourceType: 'input-source',
          sourceId: imported.id,
          promptDraftId,
          promptText,
          tags: imported.tags,
        },
        {
          id: overlayAssetKey,
          kind: 'overlay',
          title: overlays[0].title,
          path: overlays[0].assetPath,
          sourceType: 'overlay-card',
          sourceId: overlays[0].id,
          promptDraftId,
          promptText: overlays[0].text,
          tags: overlays[0].tags,
        },
      ],
    });
    const completed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: reviewedRun.id,
      event: 'mix-package-exported',
      mixPackageId: pack.id,
      manifestPath: pack.manifestPath,
      manifestCsvPath: pack.manifestCsvPath,
      importGuidePath: pack.importGuidePath,
      packageDir: pack.packageDir,
    });

    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.steps.every((step) => step.status === 'succeeded'), true);
    assert.ok(completed.artifactRefs.includes(`input-source:${imported.id}`));
    assert.ok(completed.artifactRefs.includes(`overlay-card:${overlays[0].id}`));
    assert.ok(completed.artifactRefs.includes(`asset-review:${earlyVideoReview.id}`));
    assert.ok(completed.artifactRefs.includes(`mix-package:${pack.id}`));
    assert.ok(existsSync(pack.manifestPath));
    assert.ok(existsSync(pack.manifestCsvPath));
    assert.ok(existsSync(pack.importGuidePath));
    assert.ok(completed.artifactRefs.includes(pack.manifestCsvPath));
    assert.ok(completed.artifactRefs.includes(pack.importGuidePath));
    assert.equal(pack.workflowRunId, reviewedRun.id);
    const manifest = JSON.parse(await readFile(pack.manifestPath, 'utf-8'));
    const manifestCsv = await readFile(pack.manifestCsvPath, 'utf-8');
    const importGuide = await readFile(pack.importGuidePath, 'utf-8');
    assert.equal(manifest.workflowRunId, reviewedRun.id);
    assert.equal(manifest.files.importGuide, 'import-guide.md');
    assert.match(manifestCsv, /"kind","title","packagedPath"/);
    assert.match(manifestCsv, /"reviewId","reviewStatus"/);
    assert.match(manifestCsv, /"video"/);
    assert.match(manifestCsv, /"overlay"/);
    assert.match(importGuide, /第三方混剪软件/);
    assert.match(importGuide, /manifest\.csv/);
    assert.match(importGuide, /人工审核/);
    assert.equal(manifest.assets.find((asset) => asset.kind === 'video')?.reviewStatus, 'approved');
    assert.equal(manifest.assets.find((asset) => asset.kind === 'video')?.reviewId, earlyVideoReview.id);
    assert.equal(pack.assets.find((asset) => asset.kind === 'video')?.promptDraftId, promptDraftId);
    assert.equal(pack.assets.find((asset) => asset.kind === 'video')?.sourceId, imported.id);
    assert.match(pack.assets.find((asset) => asset.kind === 'video')?.promptText ?? '', /视频 Prompt|任务/);

    const recordedEvidence = await mixPackages.recordImportEvidence({
      workspacePath,
      mixPackageId: pack.id,
      toolName: '剪映专业版',
      importedAt: '2026-05-22T16:30:00+08:00',
      operator: '剪辑验收',
      importedAssetKinds: ['video', 'overlay'],
      importedFileCount: pack.assets.length,
      manifestImported: true,
      timelineCreated: true,
      result: 'verified',
      notes: '已按导入说明核对成品视频、绿幕文案图和清单文件。',
    });
    assert.ok(recordedEvidence.externalImportEvidencePath);
    assert.ok(recordedEvidence.externalImportEvidence);
    assert.ok(existsSync(recordedEvidence.externalImportEvidencePath));
    assert.ok(existsSync(join(recordedEvidence.packageDir, 'import-check.md')));
    assert.equal(recordedEvidence.externalImportEvidence.toolName, '剪映专业版');
    assert.deepEqual(recordedEvidence.externalImportEvidence.importedAssetKinds.sort(), ['overlay', 'video']);
    assert.equal(recordedEvidence.externalImportEvidence.importedFileCount, 2);
    assert.equal(recordedEvidence.externalImportEvidence.manifestImported, true);
    assert.equal(recordedEvidence.externalImportEvidence.timelineCreated, true);
    assert.ok(recordedEvidence.externalImportEvidence.evidenceFiles.includes('import-check.md'));
    const evidenceJson = JSON.parse(await readFile(recordedEvidence.externalImportEvidencePath, 'utf-8'));
    const importCheck = await readFile(join(recordedEvidence.packageDir, 'import-check.md'), 'utf-8');
    assert.equal(evidenceJson.toolName, '剪映专业版');
    assert.deepEqual(evidenceJson.importedAssetKinds.sort(), ['overlay', 'video']);
    assert.match(importCheck, /第三方导入验收/);
    assert.match(importCheck, /清单文件已导入或已核对：是/);

    const importVerifiedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: completed.id,
      event: 'mix-package-import-verified',
      mixPackageId: recordedEvidence.id,
      externalImportEvidencePath: recordedEvidence.externalImportEvidencePath,
      packageDir: recordedEvidence.packageDir,
    });
    assert.equal(importVerifiedRun.status, 'succeeded');
    assert.ok(importVerifiedRun.artifactRefs.includes(recordedEvidence.externalImportEvidencePath));
    assert.ok(importVerifiedRun.artifactRefs.includes(recordedEvidence.packageDir));
    assert.equal(
      importVerifiedRun.steps.find((step) => step.stepId === 'export_manifest')?.output?.externalImportEvidencePath,
      recordedEvidence.externalImportEvidencePath,
    );
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
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textApiKeyStatus: 'missing',
            textModel: 'claude-sonnet-4-5',
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
              textProvider: 'anthropic-claude-sdk',
              textProtocol: 'claude-sdk',
              textApiEndpoint: 'https://api.anthropic.com',
              hasTextApiKey: false,
              textApiKeyStatus: 'missing',
              textModel: 'claude-sonnet-4-5',
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
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textApiKeyStatus: 'missing',
            textModel: 'claude-sonnet-4-5',
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
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textApiKeyStatus: 'missing',
            textModel: 'claude-sonnet-4-5',
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

test('小红书种草图 SOP 可以携带参考图输入并通过视觉反推进入后续步骤', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/vision') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            composition: '4:5，右下角产品主体，左上留白。',
            lighting: '自然光，真实桌面。',
            textArea: '左上标题区。',
            style: 'UGC 手机实拍。',
            reusableElements: ['自然光', '留白', '手持感'],
            risks: ['不要复制竞品包装'],
            prompt: '4:5，早餐桌自然光，右下产品主体，左上留白，UGC 手机实拍。',
            negativePrompt: '竞品包装、Logo、医疗化承诺。',
            qualityChecklist: ['主体一致', '留白明确', '无竞品元素'],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const previousEndpoint = process.env.CONTENT_STUDIO_VISION_ENDPOINT;
    try {
      process.env.CONTENT_STUDIO_VISION_ENDPOINT = `http://127.0.0.1:${server.address().port}/vision`;
      const referencePath = join(workspacePath, 'reference.png');
      await writeFile(referencePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const logs = new GenerationLogStore();
      const text = new FakeTextGenerationService();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, text);
      const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
      const brandKnowledgeBases = new BrandKnowledgeBaseStore(text);
      const promptPacks = new PromptPackService(logs, text);
      const sceneCards = new SceneLibraryStore(logs, promptPacks, text);
      const media = new MediaProvider({
        async readView() {
          return {
            apiEndpoint: 'https://api.anthropic.com',
            hasApiKey: false,
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textModel: 'claude-sonnet-4-5',
            imageProvider: 'disabled',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: '',
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: false,
            imageModels: ['test-image-model'],
            videoProvider: 'disabled',
            videoApiEndpoint: '',
            hasVideoApiKey: false,
            videoModel: 'test-video-model',
          };
        },
        async getImageApiKey() { return undefined; },
        async getVideoApiKey() { return undefined; },
      }, logs);
      const workflows = new WorkflowStore();
      const reference = await inputSources.register({
        workspacePath,
        kind: 'image',
        purpose: 'reference',
        title: '参考图',
        sourcePath: referencePath,
        summary: '早餐桌参考图。',
      });
      const product = await inputSources.register({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '产品资料',
        text: '便携条包，早餐后使用。',
      });
      const engine = new WorkflowEngine(
        workflows,
        inputSources,
        promptDrafts,
        sessions,
        media,
        undefined,
        brandKnowledgeBases,
        promptPacks,
        sceneCards,
        new ReferenceReverseService(logs, inputSources, promptDrafts, new (await import('../../src/main/services/modelConfigStore.ts')).ModelConfigStore()),
      );
      const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'xiaohongshu-seeding-image');
      assert.ok(definition, '应存在小红书种草图 SOP');

      const run = await engine.startRun({
        workspacePath,
        workflowDefinitionId: definition.id,
        inputSourceIds: [reference.id, product.id],
        inputs: {
          source: '参考图与产品资料',
          intent: '生成小红书种草图 SOP。',
          reviewOwner: '内容负责人',
          platform: '小红书',
        },
      });

      assert.equal(capturedRequest.operation, 'reference-reverse');
      assert.equal(run.steps.find((step) => step.stepId === 'reference_reverse')?.status, 'succeeded');
      assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
      assert.equal(run.steps.find((step) => step.stepId === 'image_generate')?.status, 'blocked');
      assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
      assert.ok(run.artifactRefs.some((ref) => ref.startsWith('generation-log:')));
      const referenceLog = (await logs.list(workspacePath)).find((log) => log.kind === 'reference-reverse');
      assert.equal(referenceLog?.workflowRunId, run.id);
      const [storedDraft] = await promptDrafts.list(workspacePath);
      assert.equal(storedDraft.workflowRunId, run.id);
    } finally {
      if (previousEndpoint === undefined) delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      else process.env.CONTENT_STUDIO_VISION_ENDPOINT = previousEndpoint;
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

test('Claude SDK 子进程环境会过滤非法路径并定位 asar 解包路径', async () => {
  await withWorkspace(async (workspacePath) => {
    const notDirectory = join(workspacePath, 'not-a-directory');
    await writeFile(notDirectory, 'not a directory', 'utf-8');
    const previousPath = process.env.PATH;
    const previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
    const previousNpmPrefix = process.env.npm_config_prefix;

    try {
      process.env.PATH = [notDirectory, workspacePath, previousPath].filter(Boolean).join(delimiter);
      process.env.CLAUDE_CONFIG_DIR = notDirectory;
      process.env.npm_config_prefix = '';

      const env = buildClaudeSubprocessEnv({ extra: { EXTRA_EMPTY_VALUE: undefined } });
      const pathEntries = env?.PATH?.split(delimiter) ?? [];

      assert.ok(pathEntries.includes(workspacePath));
      assert.ok(!pathEntries.includes(notDirectory));
      assert.equal(env?.CLAUDE_CONFIG_DIR, undefined);
      assert.equal(env?.npm_config_prefix, undefined);
      assert.equal(env?.EXTRA_EMPTY_VALUE, undefined);
      assert.ok(resolveAsarUnpackedPath('/Applications/Bugu.app/Contents/Resources/app.asar/node_modules/native/claude').includes('/app.asar.unpacked/'));
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
      if (previousNpmPrefix === undefined) delete process.env.npm_config_prefix;
      else process.env.npm_config_prefix = previousNpmPrefix;
    }
  });
});

test('Claude SDK 文字模型在工作区不是目录时返回可读错误', async () => {
  await withWorkspace(async (workspacePath) => {
    const notDirectory = join(workspacePath, 'workspace-file');
    await writeFile(notDirectory, 'not a directory', 'utf-8');
    const previousRequireExplicitKey = process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY;
    delete process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY;

    try {
      const text = new TextGenerationService({
        async readView() {
          return {
            textProtocol: 'claude-sdk',
            textApiEndpoint: '',
            textModel: 'claude-sonnet-4-5',
          };
        },
        async getTextApiKey() { return undefined; },
      });

      await assert.rejects(() => text.generateJson({
        workspacePath: notDirectory,
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"invalid_workspace"}',
        schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
      }), /工作区路径不是可访问目录/);
    } finally {
      if (previousRequireExplicitKey === undefined) delete process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY;
      else process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY = previousRequireExplicitKey;
    }
  });
});

test('Claude SDK 文字协议拒绝非 Claude 模型', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new TextGenerationService({
      async readView() {
        return {
          textProtocol: 'claude-sdk',
          textApiEndpoint: 'https://api.anthropic.com',
          textModel: 'gemini-3-pro-preview',
        };
      },
      async getTextApiKey() { return 'test-text-key'; },
    });

    await assert.rejects(() => text.generateJson({
      workspacePath,
      systemPrompt: '只输出 JSON。',
      prompt: '{"task":"model_mismatch"}',
      schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
    }), /Claude SDK 只支持 Claude 系列模型/);
  });
});

test('Claude Prompt Agent 会拒绝非 Claude 模型选择', async () => {
  await withWorkspace(async (workspacePath) => {
    const agent = new PromptAgentService(
      {
        async getAnthropicApiKey() {
          return 'test-anthropic-key';
        },
      },
      {
        async readView() {
          return {
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            textModel: 'claude-sonnet-4-5',
          };
        },
        async getTextApiKey() {
          return 'test-text-key';
        },
      },
    );

    await assert.rejects(
      () => agent.generateJson({
        workspacePath,
        model: 'gemini-3-pro-preview',
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"model_mismatch"}',
        schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
      }),
      /Claude SDK 只支持 Claude 系列模型/,
    );
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
            textProvider: 'anthropic-claude-sdk',
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
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textModel: 'claude-sonnet-4-5',
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
        params: { textModel: 'fake-claude-sonnet' },
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
