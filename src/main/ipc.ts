import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type {
  AgentEvent,
  AttachAgentPromptSessionInputSourcesInput,
  ContinueAgentPromptSessionInput,
  ArticleGenerationRequest,
  CreateContentDraftChangeInput,
  CreateContentKnowledgeReleaseInput,
  CreatePromptDraftFromContentInput,
  CreateContentProductionHandoffInput,
  CreateSceneCardFromContentInput,
  CreateTeamKnowledgePromptDraftInput,
  BuildContentKnowledgeMapInput,
  ExportContentDraftChangeInput,
  GenerateBrandKnowledgeBaseInput,
  GenerateIpKnowledgeBaseInput,
  ReviewAssetInput,
  AssetFileKind,
  CreateWorkflowDraftInput,
  ExportAssetInput,
  ExportBrandCommandActionRecordsInput,
  ExportContentKnowledgePackInput,
  ConfirmBrandCommandStageInput,
  ExportMixPackageInput,
  ExportMarkdownInput,
  ExportPlatformDraftInput,
  GenerateContentReviewTasksInput,
  GenerateOverlayCardsInput,
  StartAgentPromptSessionInput,
  GeneratePromptPackInput,
  GeneratePromptDraftInput,
  GenerateImageSkillInput,
  GenerateSceneCardsInput,
  ImageGenerationRequest,
  KnowledgeSearchInput,
  PromptPack,
  ReferenceReverseRequest,
  RecordWorkflowManualEventInput,
  RecordPromptDraftCopyInput,
  RecordMixPackageImportEvidenceInput,
  ReadPlatformDraftCopyTextInput,
  ReadContentKnowledgePackFileInput,
  RefreshBrandCommandActionsInput,
  SubmitContentReviewDecisionInput,
  SubmitContentDraftChangeInput,
  WriteBackContentMaterialCoverageInput,
  RunTaskInput,
  SaveModelConfigInput,
  SaveSettingsInput,
  SceneCard,
  SkillRef,
  StageSkillPackageInput,
  StartWorkflowRunInput,
  UpdatePromptDraftInput,
  VideoBreakdownRequest,
  VideoGenerationRequest,
  VideoScriptGenerationRequest,
  WorkflowDefinition,
  BrandKnowledgeBaseRecord,
  ContentKnowledgeMapRecord,
  IpKnowledgeBaseRecord,
  BuguEmailCodeSendInput,
  BuguEmailCodeVerifyInput,
  BuguPasswordLoginInput,
  BuildBrandCommandCenterInput,
  ImportInputSourceFromFileOptions,
  ImportContentDraftChangeInput,
  InputSourcePurpose,
  InstallSkillPackageInput,
  OemSiteConfigRequest,
  CreateSkillInput,
  RenameSkillInput,
  ReplaceSkillPackageInput,
  RegisterInputSourceInput,
  RecordBrandCommandActionInput,
  RecordBrandCommandReviewInput,
  RespondAgentPromptActionInput,
  ResolveContentSyncConflictInput,
  SkillWorkspaceInput,
  SubmitGenerationTaskInput,
} from '../shared/types';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, dirname, isAbsolute, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MediaProvider } from './providers/mediaProvider';
import { AgentKnowledgeContentExportService } from './services/agentKnowledgeContentExportService';
import { ArticleGenerationService } from './services/articleGenerationService';
import { AgentPromptSessionStore } from './services/agentPromptSessionStore';
import { BrandCommandCenterApplicationService } from './services/brandCommandCenterApplicationService';
import { BrandCommandCenterStore } from './services/brandCommandCenterStore';
import { BrandKnowledgeBaseStore } from './services/brandKnowledgeBaseStore';
import { AssetReviewStore } from './services/assetReviewStore';
import { AutoUpdateService } from './services/autoUpdateService';
import { BuguAuthService } from './services/buguAuthService';
import { BuguContentWorkspaceSyncAdapter } from './services/buguContentWorkspaceSyncAdapter';
import { ClaudeAgentService } from './services/claudeAgentService';
import { PromptAgentService } from './services/claudePromptAgentService';
import { ContentKnowledgeMapApplicationService } from './services/contentKnowledgeMapApplicationService';
import { ContentKnowledgeMapBuildRunStore } from './services/contentKnowledgeMapBuildRunStore';
import { ContentKnowledgeMapStore } from './services/contentKnowledgeMapStore';
import { ContentDraftChangeStore } from './services/contentDraftChangeStore';
import { ContentKnowledgeReleaseStore } from './services/contentKnowledgeReleaseStore';
import { ContentMaterialFeedbackService } from './services/contentMaterialFeedbackService';
import { ContentProductionHandoffService } from './services/contentProductionHandoffService';
import { ContentProductionHandoffStore } from './services/contentProductionHandoffStore';
import { ContentReviewTaskApplicationService } from './services/contentReviewTaskApplicationService';
import { ContentReviewTaskStore } from './services/contentReviewTaskStore';
import { ContentTeamKnowledgePromptDraftService } from './services/contentTeamKnowledgePromptDraftService';
import { ContentWorkspaceSyncService } from './services/contentWorkspaceSyncService';
import { FileAssociationService } from './services/fileAssociationService';
import { GenerationLogStore } from './services/generationLogStore';
import { GenerationTaskService } from './services/generationTaskService';
import { ImageSkillGenerationService } from './services/imageSkillGenerationService';
import { InputSourceStore } from './services/inputSourceStore';
import { KnowledgeBaseStore } from './services/knowledgeBaseStore';
import { ModelConfigStore } from './services/modelConfigStore';
import { MixPackageStore } from './services/mixPackageStore';
import { getOemRuntimeConfig } from './services/oemRuntimeConfig';
import { OverlayCardStore } from './services/overlayCardStore';
import { PromptDraftStore } from './services/promptDraftStore';
import { PromptPackService } from './services/promptPackService';
import { PlatformDraftStore } from './services/platformDraftStore';
import { ReferenceReverseService } from './services/referenceReverseService';
import { IpKnowledgeBaseStore } from './services/ipKnowledgeBaseStore';
import { SceneLibraryStore } from './services/sceneLibraryStore';
import { SettingsStore } from './services/settingsStore';
import { SkillManager } from './services/skillManager';
import { SkillSelectionStore } from './services/skillSelectionStore';
import { TextGenerationService } from './services/textGenerationService';
import { VideoWorkflowService } from './services/videoWorkflowService';
import { WorkflowEngine } from './services/workflowEngine';
import { WorkflowStore } from './services/workflowStore';

function readE2eAssetSelection(kind: AssetFileKind): string[] | null {
  if (process.env.CONTENT_STUDIO_E2E !== '1') return null;
  const raw = process.env.CONTENT_STUDIO_E2E_ASSET_SELECTIONS;
  if (!raw) return null;
  try {
    const selections = JSON.parse(raw) as Partial<Record<AssetFileKind, unknown>>;
    const refs = selections[kind];
    if (!Array.isArray(refs)) return null;
    return refs.filter((ref): ref is string => typeof ref === 'string' && ref.length > 0);
  } catch {
    return null;
  }
}

function safeSkillPackageFileName(fileName: string): string {
  const base = basename(fileName || 'dropped.skill').replace(/[^\w.-]+/g, '-');
  return base.toLowerCase().endsWith('.skill') ? base : `${base}.skill`;
}

function normalizeUrlBase(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function toLocalAssetUrl(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const absolutePath = /^[A-Za-z]:\//.test(normalized)
    ? `/${normalized}`
    : normalized.startsWith('/')
      ? normalized
      : `/${normalized}`;
  return `local-asset://${encodeURI(absolutePath).replace(/#/g, '%23')}`;
}

function resolveFixturePath(fixturePath: string, assetPath: string): string {
  if (isAbsolute(assetPath)) return assetPath;
  return resolve(dirname(fixturePath), assetPath);
}

function normalizeFixtureFeatureFlags(data: Record<string, unknown>): Record<string, unknown> | undefined {
  const featureFlags =
    data.featureFlags && typeof data.featureFlags === 'object' && !Array.isArray(data.featureFlags)
      ? { ...(data.featureFlags as Record<string, unknown>) }
      : {};
  const source = data.source && typeof data.source === 'object' ? data.source as Record<string, unknown> : undefined;
  const sourcePageUrl = typeof source?.pageUrl === 'string' ? source.pageUrl : '';
  const fixtureShowcaseKind = typeof data.showcaseKind === 'string' ? data.showcaseKind : '';
  const inferredFlagKey =
    fixtureShowcaseKind === 'ai-video' || sourcePageUrl.includes('/pages-sub/video/video')
      ? 'ai-video-showcase-ui'
      : 'ai-image-showcase-ui';
  if (!featureFlags[inferredFlagKey] && Array.isArray(data.featureGroups)) {
    featureFlags[inferredFlagKey] = {
      schemaVersion: 1,
      source,
      featureGroups: data.featureGroups,
    };
  }
  return Object.keys(featureFlags).length ? featureFlags : undefined;
}

function normalizeFixtureFeatureFlagItems(
  data: Record<string, unknown>,
  featureFlags: Record<string, unknown> | undefined,
): Array<Record<string, unknown>> | undefined {
  if (Array.isArray(data.featureFlagItems)) {
    return data.featureFlagItems.filter((item): item is Record<string, unknown> =>
      Boolean(item && typeof item === 'object' && !Array.isArray(item)),
    );
  }
  if (!featureFlags) return undefined;
  return Object.entries(featureFlags).map(([flagKey, flagValue]) => ({
    flagKey,
    flagValue,
    status: 'published',
  }));
}

function normalizeFixtureStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function normalizeOemFixtureSiteConfig(raw: unknown, fixturePath: string): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const payload = raw as Record<string, unknown>;
  const data = payload.data && typeof payload.data === 'object' ? payload.data as Record<string, unknown> : payload;
  const cases = Array.isArray(data.cases) ? data.cases as Record<string, unknown>[] : [];
  const materials = Array.isArray(data.materials) ? data.materials as Record<string, unknown>[] : [];
  const assets = Array.isArray(data.assets) ? data.assets as Record<string, unknown>[] : [];
  const featureFlags = normalizeFixtureFeatureFlags(data);
  const featureFlagItems = normalizeFixtureFeatureFlagItems(data, featureFlags);

  if (!cases.length && !materials.length && !assets.length && !featureFlags && !featureFlagItems?.length) return raw;

  const rawAssets = [
    ...assets,
    ...cases.flatMap((item, caseIndex) => {
      const caseId = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `case-${caseIndex + 1}`;
      const caseAssets = Array.isArray(item.assets) ? item.assets as Record<string, unknown>[] : [];
      return caseAssets.map((asset, assetIndex) => ({
        ...asset,
        id: typeof asset.id === 'string' && asset.id.trim()
          ? asset.id.trim()
          : `asset-${caseId}-${assetIndex + 1}`,
      }));
    }),
  ];

  const normalizedAssets = rawAssets.map((asset, index) => {
    const assetRecord = asset as Record<string, unknown>;
    const source = typeof assetRecord.publicUrl === 'string' && assetRecord.publicUrl.trim()
      ? assetRecord.publicUrl.trim()
      : typeof assetRecord.path === 'string' && assetRecord.path.trim()
        ? assetRecord.path.trim()
        : typeof assetRecord.url === 'string' && assetRecord.url.trim()
          ? assetRecord.url.trim()
          : '';
    const publicUrl = typeof assetRecord.publicUrl === 'string' && assetRecord.publicUrl.trim()
      ? assetRecord.publicUrl.trim()
      : source
        ? /^https?:\/\//i.test(source) || /^data:image\//i.test(source) || /^blob:/i.test(source) || /^local-asset:/i.test(source)
          ? source
          : toLocalAssetUrl(resolveFixturePath(fixturePath, source))
        : undefined;
    const id = typeof assetRecord.id === 'string' && assetRecord.id.trim()
      ? assetRecord.id.trim()
      : `asset-${index + 1}`;
    const role = typeof assetRecord.role === 'string' && assetRecord.role.trim() ? assetRecord.role.trim() : undefined;
    const group = typeof assetRecord.group === 'string' && assetRecord.group.trim() ? assetRecord.group.trim() : undefined;
    const fileName = typeof assetRecord.fileName === 'string' && assetRecord.fileName.trim() ? assetRecord.fileName.trim() : undefined;
    const caption = typeof assetRecord.caption === 'string' && assetRecord.caption.trim()
      ? assetRecord.caption.trim()
      : [group, role, fileName].filter(Boolean).join(' ') || undefined;
    return {
      id,
      kind: typeof assetRecord.kind === 'string' && assetRecord.kind.trim() ? assetRecord.kind.trim() : 'image',
      publicUrl,
      caption,
      role,
      group,
      fileName,
      width: typeof assetRecord.width === 'number' ? assetRecord.width : undefined,
      height: typeof assetRecord.height === 'number' ? assetRecord.height : undefined,
      mimeType: typeof assetRecord.mimeType === 'string' && assetRecord.mimeType.trim() ? assetRecord.mimeType.trim() : undefined,
    };
  }).filter((asset) => Boolean(asset.publicUrl));
  const uniqueAssets = Array.from(new Map(normalizedAssets.map((asset) => [asset.id, asset])).values());

  const normalizedCases = cases.map((item, index) => {
    const mediaRefs = normalizeFixtureStringArray(item.mediaRefs);
    const mediaRefsJson = normalizeFixtureStringArray(item.mediaRefsJson);
    const caseAssets = Array.isArray(item.assets) ? item.assets as Record<string, unknown>[] : [];
    const resolvedMediaRefs = mediaRefs.length
      ? mediaRefs
      : mediaRefsJson.length
        ? mediaRefsJson
        : caseAssets.map((asset, assetIndex) => {
            if (typeof asset.id === 'string' && asset.id.trim()) return asset.id.trim();
            return `asset-${typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `case-${index + 1}`}-${assetIndex + 1}`;
          });
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `case-${index + 1}`,
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `案例 ${index + 1}`,
      industry: typeof item.industry === 'string' && item.industry.trim() ? item.industry.trim() : undefined,
      summary: typeof item.summary === 'string' && item.summary.trim() ? item.summary.trim() : undefined,
      prompt: typeof item.prompt === 'string' && item.prompt.trim() ? item.prompt.trim() : undefined,
      tags: normalizeFixtureStringArray(item.tags).length
        ? normalizeFixtureStringArray(item.tags)
        : normalizeFixtureStringArray(item.tagsJson),
      mediaRefs: resolvedMediaRefs,
    };
  });

  const normalizedMaterials = materials.map((item, index) => ({
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `material-${index + 1}`,
    type: typeof item.type === 'string' && item.type.trim() ? item.type.trim() : undefined,
    title: typeof item.title === 'string' && item.title.trim() ? item.title.trim() : `素材 ${index + 1}`,
    description: typeof item.description === 'string' && item.description.trim() ? item.description.trim() : undefined,
    previewRef: typeof item.previewRef === 'string' && item.previewRef.trim() ? item.previewRef.trim() : undefined,
    assetRefs: normalizeFixtureStringArray(item.assetRefs).length
      ? normalizeFixtureStringArray(item.assetRefs)
      : normalizeFixtureStringArray(item.assetRefsJson),
    sourceRefs: normalizeFixtureStringArray(item.sourceRefs).length
      ? normalizeFixtureStringArray(item.sourceRefs)
      : normalizeFixtureStringArray(item.sourceRefsJson),
    tags: normalizeFixtureStringArray(item.tags).length
      ? normalizeFixtureStringArray(item.tags)
      : normalizeFixtureStringArray(item.tagsJson),
    status: typeof item.status === 'string' && item.status.trim() ? item.status.trim() : undefined,
  }));

  return {
    tenantId: typeof data.tenantId === 'string' && data.tenantId.trim() ? data.tenantId.trim() : undefined,
    slug: typeof data.slug === 'string' && data.slug.trim() ? data.slug.trim() : undefined,
    displayName: typeof data.displayName === 'string' && data.displayName.trim() ? data.displayName.trim() : undefined,
    primaryDomain: typeof data.primaryDomain === 'string' && data.primaryDomain.trim() ? data.primaryDomain.trim() : undefined,
    cases: normalizedCases,
    materials: normalizedMaterials,
    assets: uniqueAssets,
    featureFlags,
    featureFlagItems,
  };
}

function buildOemSiteConfigUrl(input?: OemSiteConfigRequest): string {
  const runtime = getOemRuntimeConfig();
  const tenant = input?.tenant || runtime.tenantId || runtime.brandId || 'bugu';
  const base = normalizeUrlBase(input?.apiBaseUrl || runtime.oemPublicApiBaseUrl || 'https://api.bugu.run');
  const path = base.endsWith('/api/v1')
    ? '/public/oem/site-config'
    : base.endsWith('/api')
      ? '/v1/public/oem/site-config'
      : '/api/v1/public/oem/site-config';
  const searchParams = new URLSearchParams({ tenant });
  if (input?.includeShared) {
    searchParams.set('includeShared', '1');
  }
  return `${base}${path}?${searchParams.toString()}`;
}

async function fetchOemSiteConfig(input?: OemSiteConfigRequest): Promise<unknown> {
  const fixturePath = process.env.CONTENT_STUDIO_OEM_SITE_CONFIG_FIXTURE_PATH?.trim();
  if (fixturePath) {
    const resolvedFixturePath = resolve(fixturePath);
    const content = await readFile(resolvedFixturePath, 'utf8');
    return normalizeOemFixtureSiteConfig(JSON.parse(content), resolvedFixturePath);
  }
  const response = await fetch(buildOemSiteConfigUrl(input), {
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => null) as { code?: number; message?: string; data?: unknown } | null;
  if (!response.ok || !payload || payload.code) {
    throw new Error(payload?.message || `OEM site config request failed: ${response.status}`);
  }
  return payload.data;
}

export function registerIpc(mainWindow: BrowserWindow): void {
  const settings = new SettingsStore();
  const buguAuth = new BuguAuthService();
  const autoUpdates = new AutoUpdateService(settings, mainWindow);
  const modelConfig = new ModelConfigStore();
  const fileAssociations = new FileAssociationService();
  const skills = new SkillManager();
  const skillSelection = new SkillSelectionStore();
  const knowledgeBases = new KnowledgeBaseStore();
  const logs = new GenerationLogStore();
  const textGeneration = new TextGenerationService(modelConfig);
  const promptAgent = new PromptAgentService(settings, modelConfig, textGeneration);
  const imageSkills = new ImageSkillGenerationService(textGeneration);
  const inputSources = new InputSourceStore();
  const promptDrafts = new PromptDraftStore(inputSources, textGeneration, skills);
  const agentPromptSessions = new AgentPromptSessionStore(inputSources, promptDrafts, textGeneration, promptAgent, skills);
  const brandKnowledgeBases = new BrandKnowledgeBaseStore(textGeneration);
  const ipKnowledgeBases = new IpKnowledgeBaseStore(textGeneration);
  const overlayCards = new OverlayCardStore();
  const assetReviews = new AssetReviewStore();
  const mixPackages = new MixPackageStore(assetReviews);
  const platformDrafts = new PlatformDraftStore(logs);
  const promptPacks = new PromptPackService(logs, textGeneration);
  const sceneCards = new SceneLibraryStore(logs, promptPacks, textGeneration);
  const contentKnowledgeMapStore = new ContentKnowledgeMapStore();
  const contentKnowledgeMapBuildRunStore = new ContentKnowledgeMapBuildRunStore();
  const buguContentSync = new BuguContentWorkspaceSyncAdapter({
    tokenProvider: () => buguAuth.getAccessToken(),
  });
  const contentKnowledgeMaps = new ContentKnowledgeMapApplicationService(
    contentKnowledgeMapStore,
    contentKnowledgeMapBuildRunStore,
    inputSources,
    brandKnowledgeBases,
    ipKnowledgeBases,
    sceneCards,
    promptDrafts,
    assetReviews,
    buguContentSync,
    textGeneration,
  );
  const contentDraftChangeStore = new ContentDraftChangeStore();
  const contentKnowledgeReleaseStore = new ContentKnowledgeReleaseStore();
  const agentKnowledgeContentExport = new AgentKnowledgeContentExportService(contentKnowledgeMapStore);
  const contentWorkspaceSync = new ContentWorkspaceSyncService(
    contentKnowledgeMapStore,
    contentDraftChangeStore,
    contentKnowledgeReleaseStore,
    agentKnowledgeContentExport,
    buguContentSync,
  );
  const contentTeamKnowledgePromptDrafts = new ContentTeamKnowledgePromptDraftService(
    contentKnowledgeMapStore,
    contentKnowledgeReleaseStore,
    promptDrafts,
  );
  const workflows = new WorkflowStore();
  const brandCommandCenterStore = new BrandCommandCenterStore();
  const contentReviewTaskStore = new ContentReviewTaskStore();
  const referenceReverse = new ReferenceReverseService(logs, inputSources, promptDrafts, modelConfig);
  const articles = new ArticleGenerationService(logs, textGeneration);
  const videoWorkflow = new VideoWorkflowService(logs, textGeneration, modelConfig);
  const media = new MediaProvider(modelConfig, logs);
  const workflowEngine = new WorkflowEngine(
    workflows,
    inputSources,
    promptDrafts,
    agentPromptSessions,
    media,
    assetReviews,
    brandKnowledgeBases,
    promptPacks,
    sceneCards,
    referenceReverse,
    ipKnowledgeBases,
    overlayCards,
  );
  const contentMaterialFeedback = new ContentMaterialFeedbackService(
    contentKnowledgeMapStore,
    assetReviews,
    buguContentSync,
    contentReviewTaskStore,
    buguContentSync,
  );
  const brandCommandCenters = new BrandCommandCenterApplicationService(
    brandCommandCenterStore,
    contentKnowledgeMapStore,
    buguContentSync,
    buguContentSync,
    buguContentSync,
    promptDrafts,
    contentReviewTaskStore,
    buguContentSync,
    sceneCards,
    workflowEngine,
    contentMaterialFeedback,
    buguContentSync,
    contentKnowledgeReleaseStore,
  );
  const contentReviewTasks = new ContentReviewTaskApplicationService(
    contentReviewTaskStore,
    contentKnowledgeMapStore,
    buguContentSync,
    contentWorkspaceSync,
  );
  const contentProductionHandoffs = new ContentProductionHandoffService(
    contentReviewTaskStore,
    contentKnowledgeMapStore,
    contentKnowledgeReleaseStore,
    promptDrafts,
    sceneCards,
    new ContentProductionHandoffStore(),
    buguContentSync,
    brandCommandCenterStore,
    workflowEngine,
  );
  const generationTasks = new GenerationTaskService(
    logs,
    media,
    articles,
    promptPacks,
    sceneCards,
    videoWorkflow,
    referenceReverse,
    (event) => mainWindow.webContents.send('generationTasks:event', event),
  );
  const agent = new ClaudeAgentService(settings, modelConfig, skills);

  const publish = (event: AgentEvent) => {
    mainWindow.webContents.send(`agent:event:${event.taskId}`, event);
  };
  const productName = getOemRuntimeConfig().productName || '布谷AI';

  ipcMain.handle('auth:getSession', () => buguAuth.getAuthState());
  ipcMain.handle('auth:loginByPassword', (_event, input: BuguPasswordLoginInput) => buguAuth.loginByPassword(input));
  ipcMain.handle('auth:sendEmailCode', (_event, input: BuguEmailCodeSendInput) => buguAuth.sendEmailCode(input));
  ipcMain.handle('auth:verifyEmailCode', (_event, input: BuguEmailCodeVerifyInput) => buguAuth.verifyEmailCode(input));
  ipcMain.handle('auth:logout', () => buguAuth.logout());
  ipcMain.handle('oem:getSiteConfig', (_event, input?: OemSiteConfigRequest) => fetchOemSiteConfig(input));

  ipcMain.handle('settings:get', () => settings.ensureDefaultWorkspace());
  ipcMain.handle('settings:save', (_event, input: SaveSettingsInput) => settings.save(input));
  ipcMain.handle('updates:getState', () => autoUpdates.getState());
  ipcMain.handle('updates:check', (_event, options) => autoUpdates.checkForUpdates(options));
  ipcMain.handle('updates:setAutoCheck', (_event, enabled: boolean) => autoUpdates.setEnabled(enabled));
  ipcMain.handle('updates:openDownload', () => autoUpdates.openDownload());
  ipcMain.handle('updates:openReleaseNotes', () => autoUpdates.openReleaseNotes());
  ipcMain.handle('updates:openLogsDirectory', () => autoUpdates.openLogsDirectory());
  ipcMain.handle('skills:fileAssociation:get', () => fileAssociations.getSkillAssociationState());
  ipcMain.handle('skills:fileAssociation:setDefault', () => fileAssociations.setSkillAssociationDefault());
  mainWindow.webContents.on('did-finish-load', () => {
    autoUpdates.startBackgroundChecks();
  });
  mainWindow.on('closed', () => autoUpdates.dispose());
  ipcMain.handle('workspace:select', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: `选择${productName}工作区`,
      properties: ['openDirectory', 'createDirectory'],
    });
    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle('modelConfig:get', () => modelConfig.readView());
  ipcMain.handle('modelConfig:save', (_event, input: SaveModelConfigInput) => modelConfig.save(input));
  ipcMain.handle('modelConfig:catalog', () => modelConfig.readCatalog());

  ipcMain.handle('skills:scan', (_event, workspacePath?: string) => skills.scan(workspacePath));
  ipcMain.handle('skills:installBuiltin', async (_event, slug: string, workspacePath: string) => {
    await skills.installBuiltin(slug, workspacePath);
    return skills.scan(workspacePath);
  });
  ipcMain.handle('skills:create', (_event, input: CreateSkillInput) => skills.createProjectSkill(input));
  ipcMain.handle('skills:package:upload', async (_event, workspacePath: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '选择 .skill 安装包',
      properties: ['openFile'],
      filters: [{ name: 'Skill 安装包', extensions: ['skill'] }],
    });
    const packagePath = result.canceled ? null : result.filePaths[0] ?? null;
    if (!packagePath) return null;
    const preview = await skills.previewPackage(packagePath, workspacePath);
    if (preview.targetExists) {
      const choice = await dialog.showMessageBox(mainWindow, {
        type: 'question',
        buttons: ['覆盖安装', '取消'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
        message: `${preview.slug} 已存在`,
        detail: '该 skill 已安装到当前工作区 .bugu/skills。是否覆盖安装？',
      });
      if (choice.response !== 0) return null;
    }
    return skills.installPackage(packagePath, workspacePath, preview.targetExists);
  });
  ipcMain.handle('skills:folder:open', async (_event, workspacePath: string, skill: SkillRef) => {
    const loaded = (await skills.scan(workspacePath)).find((item) => item.slug === skill.slug && item.source === skill.source);
    if (!loaded) throw new Error('未找到该 skill。');
    const error = await shell.openPath(loaded.path);
    if (error) throw new Error(error);
  });
  ipcMain.handle('skills:rename', async (_event, input: RenameSkillInput) => {
    const next = await skills.renameProjectSkill(input.workspacePath, input.skill, input.nextSlug);
    await skillSelection.renameSkill(input.workspacePath, input.skill, next);
    return skills.scan(input.workspacePath);
  });
  ipcMain.handle('skills:replacePackage', async (_event, input: ReplaceSkillPackageInput) => {
    const packagePath = input.packagePath ?? await dialog.showOpenDialog(mainWindow, {
      title: `选择用于替换 ${input.skill.slug} 的 .skill 安装包`,
      properties: ['openFile'],
      filters: [{ name: 'Skill 安装包', extensions: ['skill'] }],
    }).then((result) => (result.canceled ? null : result.filePaths[0] ?? null));
    return packagePath ? skills.replaceProjectSkill(packagePath, input.workspacePath, input.skill) : null;
  });
  ipcMain.handle('skills:uninstall', async (_event, input: SkillWorkspaceInput) => {
    await skills.uninstallProjectSkill(input.workspacePath, input.skill);
    await skillSelection.removeSkill(input.workspacePath, input.skill);
    return skills.scan(input.workspacePath);
  });
  ipcMain.handle('skills:file:read', (_event, workspacePath: string | undefined, skill: SkillRef, relativePath: string) => skills.readSkillFile(workspacePath, skill, relativePath));
  ipcMain.handle('skills:package:stageDropped', async (_event, input: StageSkillPackageInput) => {
    if (extname(input.fileName).toLowerCase() !== '.skill') {
      throw new Error('仅支持拖入 .skill 安装包。');
    }
    const buffer = Buffer.from(input.data);
    if (buffer.length === 0) {
      throw new Error('.skill 安装包为空。');
    }
    const stageDir = join(app.getPath('temp'), 'content-studio-skill-drops');
    await mkdir(stageDir, { recursive: true });
    const packagePath = join(stageDir, `${randomUUID()}-${safeSkillPackageFileName(input.fileName)}`);
    await writeFile(packagePath, buffer);
    return packagePath;
  });
  ipcMain.handle('skills:package:preview', (_event, packagePath: string, workspacePath?: string) => skills.previewPackage(packagePath, workspacePath));
  ipcMain.handle('skills:package:readFile', (_event, packagePath: string, relativePath: string) => skills.readPackageFile(packagePath, relativePath));
  ipcMain.handle('skills:package:install', (_event, input: InstallSkillPackageInput) => skills.installPackage(input.packagePath, input.workspacePath, input.overwrite));
  ipcMain.handle('skills:selection:get', (_event, workspacePath: string) => skillSelection.read(workspacePath));
  ipcMain.handle('skills:selection:set', (_event, workspacePath: string, skill: SkillRef, enabled: boolean) => skillSelection.setEnabled(workspacePath, skill, enabled));

  ipcMain.handle('knowledge:list', (_event, workspacePath?: string) => knowledgeBases.list(workspacePath));
  ipcMain.handle('knowledge:importFromFile', async (_event, workspacePath: string) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入已成型知识库',
      properties: ['openFile'],
      filters: [
        { name: '知识库文件', extensions: ['docx', 'md', 'markdown', 'txt', 'json'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return knowledgeBases.importFile(workspacePath, result.filePaths[0]);
  });
  ipcMain.handle('knowledge:installBuiltin', (_event, id: string, workspacePath: string) => knowledgeBases.installBuiltin(id, workspacePath));
  ipcMain.handle('knowledge:search', (_event, input: KnowledgeSearchInput) => knowledgeBases.search(input));

  ipcMain.handle('promptPacks:list', (_event, workspacePath: string) => promptPacks.list(workspacePath));
  ipcMain.handle('promptPacks:generate', (_event, input: GeneratePromptPackInput) => promptPacks.generate(input));
  ipcMain.handle('promptPacks:update', (_event, input: PromptPack) => promptPacks.update(input));
  ipcMain.handle('brandKnowledgeBases:list', (_event, workspacePath: string) => brandKnowledgeBases.list(workspacePath));
  ipcMain.handle('brandKnowledgeBases:generate', (_event, input: GenerateBrandKnowledgeBaseInput) => brandKnowledgeBases.generate(input));
  ipcMain.handle('brandKnowledgeBases:update', (_event, input: BrandKnowledgeBaseRecord) => brandKnowledgeBases.update(input));
  ipcMain.handle('ipKnowledgeBases:list', (_event, workspacePath: string) => ipKnowledgeBases.list(workspacePath));
  ipcMain.handle('ipKnowledgeBases:generate', (_event, input: GenerateIpKnowledgeBaseInput) => ipKnowledgeBases.generate(input));
  ipcMain.handle('ipKnowledgeBases:update', (_event, input: IpKnowledgeBaseRecord) => ipKnowledgeBases.update(input));
  ipcMain.handle('sceneCards:list', (_event, workspacePath: string) => sceneCards.list(workspacePath));
  ipcMain.handle('sceneCards:generate', (_event, input: GenerateSceneCardsInput) => sceneCards.generate(input));
  ipcMain.handle('sceneCards:createFromContent', (_event, input: CreateSceneCardFromContentInput) => sceneCards.createFromContent(input));
  ipcMain.handle('sceneCards:update', (_event, input: SceneCard) => sceneCards.update(input));
  ipcMain.handle('contentKnowledgeMaps:list', (_event, workspacePath: string) => contentKnowledgeMaps.list(workspacePath));
  ipcMain.handle('contentKnowledgeMapBuildRuns:list', (_event, workspacePath: string) => contentKnowledgeMaps.listBuildRuns(workspacePath));
  ipcMain.handle('contentKnowledgeMaps:build', (_event, input: BuildContentKnowledgeMapInput) => contentKnowledgeMaps.build(input));
  ipcMain.handle('contentKnowledgeMaps:update', (_event, input: ContentKnowledgeMapRecord) => contentKnowledgeMaps.update(input));
  ipcMain.handle('contentDraftChanges:list', (_event, workspacePath: string) => contentWorkspaceSync.listDraftChanges(workspacePath));
  ipcMain.handle('contentDraftChanges:create', (_event, input: CreateContentDraftChangeInput) => contentWorkspaceSync.createDraftChange(input));
  ipcMain.handle('contentDraftChanges:submit', (_event, input: SubmitContentDraftChangeInput) => contentWorkspaceSync.submitDraftChange(input));
  ipcMain.handle('contentDraftChanges:export', (_event, input: ExportContentDraftChangeInput) => contentWorkspaceSync.exportDraftChange(input));
  ipcMain.handle('contentDraftChanges:import', async (_event, input: ImportContentDraftChangeInput) => {
    if (input.packagePath?.trim()) return contentWorkspaceSync.importDraftChange(input);
    const result = await dialog.showOpenDialog({
      title: '选择内容变更包',
      properties: ['openFile', 'openDirectory'],
      filters: [
        { name: '内容变更包', extensions: ['json'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) {
      return { status: 'blocked', issues: ['未选择变更包。'], files: [] };
    }
    return contentWorkspaceSync.importDraftChange({ ...input, packagePath: result.filePaths[0] });
  });
  ipcMain.handle('contentKnowledgeReleases:list', (_event, workspacePath: string) => contentWorkspaceSync.listReleases(workspacePath));
  ipcMain.handle('contentKnowledgeReleases:create', (_event, input: CreateContentKnowledgeReleaseInput) => contentWorkspaceSync.createKnowledgeRelease(input));
  ipcMain.handle('contentSyncConflicts:list', (_event, workspacePath: string) => contentWorkspaceSync.listSyncConflicts(workspacePath));
  ipcMain.handle('contentSyncConflicts:resolve', (_event, input: ResolveContentSyncConflictInput) => contentWorkspaceSync.resolveSyncConflict(input));
  ipcMain.handle('brandCommandCenters:list', (_event, workspacePath: string) => brandCommandCenters.list(workspacePath));
  ipcMain.handle('brandCommandCenters:build', (_event, input: BuildBrandCommandCenterInput) => brandCommandCenters.build(input));
  ipcMain.handle('brandCommandCenters:recordAction', (_event, input: RecordBrandCommandActionInput) => brandCommandCenters.recordAction(input));
  ipcMain.handle('brandCommandCenters:recordReview', (_event, input: RecordBrandCommandReviewInput) => brandCommandCenters.recordReview(input));
  ipcMain.handle('brandCommandCenters:confirmStage', (_event, input: ConfirmBrandCommandStageInput) => brandCommandCenters.confirmStage(input));
  ipcMain.handle('brandCommandCenters:exportActions', (_event, input: ExportBrandCommandActionRecordsInput) => brandCommandCenters.exportActionRecords(input));
  ipcMain.handle('brandCommandCenters:refreshActions', (_event, input: RefreshBrandCommandActionsInput) => brandCommandCenters.refreshActions(input));
  ipcMain.handle('contentKnowledgePack:export', (_event, input: ExportContentKnowledgePackInput) => agentKnowledgeContentExport.exportPack(input));
  ipcMain.handle('contentKnowledgePack:readFile', (_event, input: ReadContentKnowledgePackFileInput) => agentKnowledgeContentExport.readPackFile(input));
  ipcMain.handle('contentReviewTasks:list', (_event, workspacePath: string) => contentReviewTasks.list(workspacePath));
  ipcMain.handle('contentReviewTasks:generate', (_event, input: GenerateContentReviewTasksInput) => contentReviewTasks.generate(input));
  ipcMain.handle('contentReviewTasks:submitDecision', (_event, input: SubmitContentReviewDecisionInput) => contentReviewTasks.submitDecision(input));
  ipcMain.handle('contentProductionHandoff:create', (_event, input: CreateContentProductionHandoffInput) => contentProductionHandoffs.create(input));
  ipcMain.handle('contentMaterialCoverage:writeBack', (_event, input: WriteBackContentMaterialCoverageInput) => contentMaterialFeedback.writeBack(input));
  ipcMain.handle('inputSources:list', (_event, workspacePath: string) => inputSources.list(workspacePath));
  ipcMain.handle('inputSources:register', (_event, input: RegisterInputSourceInput) => inputSources.register(input));
  ipcMain.handle('inputSources:remove', (_event, workspacePath: string, sourceId: string) => inputSources.remove(workspacePath, sourceId));
  ipcMain.handle('inputSources:importFromFile', async (
    _event,
    workspacePath: string,
    purpose: InputSourcePurpose,
    options?: ImportInputSourceFromFileOptions,
  ) => {
    const e2eKind = purpose === 'successful-asset' ? 'video'
      : purpose === 'reference' ? 'reference-image'
      : purpose === 'product-brief' ? 'product-image'
      : null;
    const e2eSelection = e2eKind ? readE2eAssetSelection(e2eKind) : null;
    if (e2eSelection?.[0]) return inputSources.importFile(workspacePath, e2eSelection[0], purpose, options);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '登记输入源文件',
      properties: ['openFile'],
      filters: [
        { name: '输入源文件', extensions: ['docx', 'md', 'markdown', 'txt', 'json', 'csv', 'tsv', 'xlsx', 'xls', 'png', 'jpg', 'jpeg', 'webp', 'gif', 'mp4', 'mov', 'webm', 'm4v'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return inputSources.importFile(workspacePath, result.filePaths[0], purpose, options);
  });
  ipcMain.handle('promptDrafts:list', (_event, workspacePath: string) => promptDrafts.list(workspacePath));
  ipcMain.handle('promptDrafts:generate', (_event, input: GeneratePromptDraftInput) => promptDrafts.generate(input));
  ipcMain.handle('promptDrafts:createFromContent', (_event, input: CreatePromptDraftFromContentInput) => promptDrafts.createFromContent(input));
  ipcMain.handle('promptDrafts:createTeamKnowledge', (_event, input: CreateTeamKnowledgePromptDraftInput) => contentTeamKnowledgePromptDrafts.create(input));
  ipcMain.handle('promptDrafts:update', (_event, input: UpdatePromptDraftInput) => promptDrafts.update(input));
  ipcMain.handle('promptDrafts:recordCopy', (_event, input: RecordPromptDraftCopyInput) => promptDrafts.recordCopy(input));
  ipcMain.handle('agentPromptSessions:list', (_event, workspacePath: string) => agentPromptSessions.list(workspacePath));
  ipcMain.handle('agentPromptSessions:start', (_event, input: StartAgentPromptSessionInput) => agentPromptSessions.start(input));
  ipcMain.handle('agentPromptSessions:continue', (_event, input: ContinueAgentPromptSessionInput) => agentPromptSessions.continue(input));
  ipcMain.handle('agentPromptSessions:respondAction', (_event, input: RespondAgentPromptActionInput) => agentPromptSessions.respondAction(input));
  ipcMain.handle('agentPromptSessions:attachInputSources', (_event, input: AttachAgentPromptSessionInputSourcesInput) => agentPromptSessions.attachInputSources(input));
  ipcMain.handle('overlayCards:list', (_event, workspacePath: string) => overlayCards.list(workspacePath));
  ipcMain.handle('overlayCards:generate', (_event, input: GenerateOverlayCardsInput) => overlayCards.generate(input));
  ipcMain.handle('assetReviews:list', (_event, workspacePath: string) => assetReviews.list(workspacePath));
  ipcMain.handle('assetReviews:review', (_event, input: ReviewAssetInput) => assetReviews.review(input));
  ipcMain.handle('mixPackages:list', (_event, workspacePath: string) => mixPackages.list(workspacePath));
  ipcMain.handle('mixPackages:export', (_event, input: ExportMixPackageInput) => mixPackages.exportPackage(input));
  ipcMain.handle('mixPackages:recordImportEvidence', (_event, input: RecordMixPackageImportEvidenceInput) => mixPackages.recordImportEvidence(input));
  ipcMain.handle('workflow:listDefinitions', (_event, workspacePath: string) => workflows.listDefinitions(workspacePath));
  ipcMain.handle('workflow:createDraft', (_event, input: CreateWorkflowDraftInput) => workflows.createDraft(input));
  ipcMain.handle('workflow:updateDefinition', (_event, input: WorkflowDefinition) => workflows.updateDefinition(input));
  ipcMain.handle('workflow:listRuns', (_event, workspacePath: string) => workflows.listRuns(workspacePath));
  ipcMain.handle('workflow:startRun', (_event, input: StartWorkflowRunInput) => workflowEngine.startRun(input));
  ipcMain.handle('workflow:recordManualEvent', (_event, input: RecordWorkflowManualEventInput) => workflows.recordManualEvent(input));

  ipcMain.handle('assets:selectFiles', async (_event, kind: AssetFileKind) => {
    const e2eSelection = readE2eAssetSelection(kind);
    if (e2eSelection) return e2eSelection;
    const filters = kind === 'video'
      ? [{ name: '视频文件', extensions: ['mp4', 'mov', 'webm', 'm4v'] }]
      : kind === 'audio'
        ? [{ name: '音频文件', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] }]
        : [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: kind === 'video' ? '选择参考视频' : kind === 'audio' ? '选择参考音频' : '选择图片素材',
      properties: ['openFile', 'multiSelections'],
      filters: [...filters, { name: '全部文件', extensions: ['*'] }],
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('assets:revealPath', (_event, path: string) => {
    if (!path) return { ok: false, error: '路径为空' };
    shell.showItemInFolder(path);
    return { ok: true };
  });
  ipcMain.handle('assets:export', async (_event, input: ExportAssetInput) => {
    const safeName = basename(input.suggestedName || input.sourcePath).replace(/[\\/:*?"<>|]/g, '-');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出本地产物',
      defaultPath: safeName,
      filters: [{ name: '全部文件', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await copyFile(input.sourcePath, result.filePath);
    return result.filePath;
  });
  ipcMain.handle('article:exportMarkdown', async (_event, input: ExportMarkdownInput) => {
    const safeName = basename(input.suggestedName || 'buguai-draft.md').replace(/[\\/:*?"<>|]/g, '-');
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '导出 Markdown',
      defaultPath: join(input.workspacePath, safeName.endsWith('.md') ? safeName : `${safeName}.md`),
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (result.canceled || !result.filePath) return null;
    await writeFile(result.filePath, input.markdown, 'utf-8');
    if (input.sourceLogId) {
      await logs.addArtifactRef(input.workspacePath, input.sourceLogId, result.filePath);
    }
    return result.filePath;
  });
  ipcMain.handle('article:exportPlatformDraft', (_event, input: ExportPlatformDraftInput) => platformDrafts.exportDraft(input));
  ipcMain.handle('article:listPlatformDrafts', (_event, workspacePath: string) => platformDrafts.list(workspacePath));
  ipcMain.handle('article:readPlatformDraftCopyText', (_event, input: ReadPlatformDraftCopyTextInput) => platformDrafts.readCopyText(input));
  ipcMain.handle('article:generate', (_event, input: ArticleGenerationRequest) => articles.generate(input));
  ipcMain.handle('referenceReverse:generate', (_event, input: ReferenceReverseRequest) => referenceReverse.generate(input));
  ipcMain.handle('video:analyze', (_event, input: VideoBreakdownRequest) => videoWorkflow.analyze(input));
  ipcMain.handle('video:script', (_event, input: VideoScriptGenerationRequest) => videoWorkflow.generateScript(input));
  ipcMain.handle('image:generate', (_event, input: ImageGenerationRequest) => media.generateImage(input));
  ipcMain.handle('imageSkills:generate', (_event, input: GenerateImageSkillInput) => imageSkills.generate(input));
  ipcMain.handle('imageSkills:importFromFile', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '导入图片技能 JSON',
      properties: ['openFile'],
      filters: [
        { name: '图片技能 JSON', extensions: ['json'] },
        { name: '全部文件', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return imageSkills.importFromFile(result.filePaths[0]);
  });
  ipcMain.handle('video:generate', (_event, input: VideoGenerationRequest) => media.generateVideo(input));
  ipcMain.handle('generationTasks:submit', (_event, input: SubmitGenerationTaskInput) => generationTasks.submit(input));
  ipcMain.handle('generationTasks:list', (_event, workspacePath: string) => generationTasks.list(workspacePath));
  ipcMain.handle('generationLogs:list', (_event, workspacePath: string) => logs.list(workspacePath));

  ipcMain.handle('agent:run', async (_event, input: RunTaskInput) => ({ taskId: await agent.run(input, publish) }));
  ipcMain.handle('agent:cancel', (_event, taskId: string) => agent.cancel(taskId));
}
