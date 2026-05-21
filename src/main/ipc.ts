import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type {
  AgentEvent,
  ContinueAgentPromptSessionInput,
  ArticleGenerationRequest,
  GenerateBrandKnowledgeBaseInput,
  GenerateIpKnowledgeBaseInput,
  ReviewAssetInput,
  AssetFileKind,
  CreateWorkflowDraftInput,
  ExportAssetInput,
  ExportMixPackageInput,
  ExportMarkdownInput,
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
  IpKnowledgeBaseRecord,
  BuguEmailCodeSendInput,
  BuguEmailCodeVerifyInput,
  BuguPasswordLoginInput,
  ImportInputSourceFromFileOptions,
  InputSourcePurpose,
  InstallSkillPackageInput,
  CreateSkillInput,
  RenameSkillInput,
  ReplaceSkillPackageInput,
  RegisterInputSourceInput,
  SkillWorkspaceInput,
} from '../shared/types';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MediaProvider } from './providers/mediaProvider';
import { ArticleGenerationService } from './services/articleGenerationService';
import { AgentPromptSessionStore } from './services/agentPromptSessionStore';
import { BrandKnowledgeBaseStore } from './services/brandKnowledgeBaseStore';
import { AssetReviewStore } from './services/assetReviewStore';
import { AutoUpdateService } from './services/autoUpdateService';
import { BuguAuthService } from './services/buguAuthService';
import { ClaudeAgentService } from './services/claudeAgentService';
import { FileAssociationService } from './services/fileAssociationService';
import { GenerationLogStore } from './services/generationLogStore';
import { ImageSkillGenerationService } from './services/imageSkillGenerationService';
import { InputSourceStore } from './services/inputSourceStore';
import { KnowledgeBaseStore } from './services/knowledgeBaseStore';
import { ModelConfigStore } from './services/modelConfigStore';
import { MixPackageStore } from './services/mixPackageStore';
import { OverlayCardStore } from './services/overlayCardStore';
import { PromptDraftStore } from './services/promptDraftStore';
import { PromptPackService } from './services/promptPackService';
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
  const imageSkills = new ImageSkillGenerationService(textGeneration);
  const inputSources = new InputSourceStore();
  const promptDrafts = new PromptDraftStore(inputSources, textGeneration);
  const agentPromptSessions = new AgentPromptSessionStore(inputSources, promptDrafts, textGeneration);
  const brandKnowledgeBases = new BrandKnowledgeBaseStore(textGeneration);
  const ipKnowledgeBases = new IpKnowledgeBaseStore(textGeneration);
  const overlayCards = new OverlayCardStore();
  const assetReviews = new AssetReviewStore();
  const mixPackages = new MixPackageStore(assetReviews);
  const promptPacks = new PromptPackService(logs, textGeneration);
  const sceneCards = new SceneLibraryStore(logs, promptPacks, textGeneration);
  const referenceReverse = new ReferenceReverseService(logs, inputSources, promptDrafts, modelConfig);
  const articles = new ArticleGenerationService(logs, textGeneration);
  const videoWorkflow = new VideoWorkflowService(logs, textGeneration, modelConfig);
  const media = new MediaProvider(modelConfig, logs);
  const agent = new ClaudeAgentService(settings, modelConfig);
  const workflows = new WorkflowStore();
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
  );

  const publish = (event: AgentEvent) => {
    mainWindow.webContents.send(`agent:event:${event.taskId}`, event);
  };

  ipcMain.handle('auth:getSession', () => buguAuth.getAuthState());
  ipcMain.handle('auth:loginByPassword', (_event, input: BuguPasswordLoginInput) => buguAuth.loginByPassword(input));
  ipcMain.handle('auth:sendEmailCode', (_event, input: BuguEmailCodeSendInput) => buguAuth.sendEmailCode(input));
  ipcMain.handle('auth:verifyEmailCode', (_event, input: BuguEmailCodeVerifyInput) => buguAuth.verifyEmailCode(input));
  ipcMain.handle('auth:logout', () => buguAuth.logout());

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
      title: '选择布谷AI工作区',
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
  ipcMain.handle('sceneCards:update', (_event, input: SceneCard) => sceneCards.update(input));
  ipcMain.handle('inputSources:list', (_event, workspacePath: string) => inputSources.list(workspacePath));
  ipcMain.handle('inputSources:register', (_event, input: RegisterInputSourceInput) => inputSources.register(input));
  ipcMain.handle('inputSources:importFromFile', async (
    _event,
    workspacePath: string,
    purpose: InputSourcePurpose,
    options?: ImportInputSourceFromFileOptions,
  ) => {
    const e2eSelection = purpose === 'successful-asset' ? readE2eAssetSelection('video') : null;
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
  ipcMain.handle('promptDrafts:update', (_event, input: UpdatePromptDraftInput) => promptDrafts.update(input));
  ipcMain.handle('promptDrafts:recordCopy', (_event, input: RecordPromptDraftCopyInput) => promptDrafts.recordCopy(input));
  ipcMain.handle('agentPromptSessions:list', (_event, workspacePath: string) => agentPromptSessions.list(workspacePath));
  ipcMain.handle('agentPromptSessions:start', (_event, input: StartAgentPromptSessionInput) => agentPromptSessions.start(input));
  ipcMain.handle('agentPromptSessions:continue', (_event, input: ContinueAgentPromptSessionInput) => agentPromptSessions.continue(input));
  ipcMain.handle('overlayCards:list', (_event, workspacePath: string) => overlayCards.list(workspacePath));
  ipcMain.handle('overlayCards:generate', (_event, input: GenerateOverlayCardsInput) => overlayCards.generate(input));
  ipcMain.handle('assetReviews:list', (_event, workspacePath: string) => assetReviews.list(workspacePath));
  ipcMain.handle('assetReviews:review', (_event, input: ReviewAssetInput) => assetReviews.review(input));
  ipcMain.handle('mixPackages:list', (_event, workspacePath: string) => mixPackages.list(workspacePath));
  ipcMain.handle('mixPackages:export', (_event, input: ExportMixPackageInput) => mixPackages.exportPackage(input));
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
      : [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }];
    const result = await dialog.showOpenDialog(mainWindow, {
      title: kind === 'video' ? '选择参考视频' : '选择图片素材',
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
  ipcMain.handle('generationLogs:list', (_event, workspacePath: string) => logs.list(workspacePath));

  ipcMain.handle('agent:run', async (_event, input: RunTaskInput) => ({ taskId: await agent.run(input, publish) }));
  ipcMain.handle('agent:cancel', (_event, taskId: string) => agent.cancel(taskId));
}
