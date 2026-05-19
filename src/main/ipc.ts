import { BrowserWindow, dialog, ipcMain, shell } from 'electron';
import type {
  AgentEvent,
  ArticleGenerationRequest,
  AssetFileKind,
  ExportAssetInput,
  ExportMarkdownInput,
  GeneratePromptPackInput,
  GenerateImageSkillInput,
  GenerateSceneCardsInput,
  ImageGenerationRequest,
  KnowledgeSearchInput,
  PromptPack,
  RunTaskInput,
  SaveModelConfigInput,
  SaveSettingsInput,
  SceneCard,
  SkillRef,
  VideoBreakdownRequest,
  VideoGenerationRequest,
  VideoScriptGenerationRequest,
  BuguEmailCodeSendInput,
  BuguEmailCodeVerifyInput,
  BuguPasswordLoginInput,
} from '../shared/types';
import { copyFile, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { MediaProvider } from './providers/mediaProvider';
import { ArticleGenerationService } from './services/articleGenerationService';
import { AutoUpdateService } from './services/autoUpdateService';
import { BuguAuthService } from './services/buguAuthService';
import { ClaudeAgentService } from './services/claudeAgentService';
import { GenerationLogStore } from './services/generationLogStore';
import { ImageSkillGenerationService } from './services/imageSkillGenerationService';
import { KnowledgeBaseStore } from './services/knowledgeBaseStore';
import { ModelConfigStore } from './services/modelConfigStore';
import { PromptPackService } from './services/promptPackService';
import { SceneLibraryStore } from './services/sceneLibraryStore';
import { SettingsStore } from './services/settingsStore';
import { SkillManager } from './services/skillManager';
import { SkillSelectionStore } from './services/skillSelectionStore';
import { TextGenerationService } from './services/textGenerationService';
import { VideoWorkflowService } from './services/videoWorkflowService';

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

export function registerIpc(mainWindow: BrowserWindow): void {
  const settings = new SettingsStore();
  const buguAuth = new BuguAuthService();
  const autoUpdates = new AutoUpdateService(settings, mainWindow);
  const modelConfig = new ModelConfigStore();
  const skills = new SkillManager();
  const skillSelection = new SkillSelectionStore();
  const knowledgeBases = new KnowledgeBaseStore();
  const logs = new GenerationLogStore();
  const textGeneration = new TextGenerationService(modelConfig);
  const imageSkills = new ImageSkillGenerationService(textGeneration);
  const promptPacks = new PromptPackService(logs, textGeneration);
  const sceneCards = new SceneLibraryStore(logs, promptPacks, textGeneration);
  const articles = new ArticleGenerationService(logs, textGeneration);
  const videoWorkflow = new VideoWorkflowService(logs, textGeneration, modelConfig);
  const media = new MediaProvider(modelConfig, logs);
  const agent = new ClaudeAgentService(settings, modelConfig);

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
  ipcMain.handle('sceneCards:list', (_event, workspacePath: string) => sceneCards.list(workspacePath));
  ipcMain.handle('sceneCards:generate', (_event, input: GenerateSceneCardsInput) => sceneCards.generate(input));
  ipcMain.handle('sceneCards:update', (_event, input: SceneCard) => sceneCards.update(input));

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
