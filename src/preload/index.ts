import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentEvent,
  ArticleGenerationRequest,
  AssetFileKind,
  AutoUpdateState,
  BuguEmailCodeSendInput,
  BuguEmailCodeVerifyInput,
  BuguPasswordLoginInput,
  ContentStudioApi,
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
  UpdateCheckOptions,
} from '../shared/types';

const api: ContentStudioApi = {
  authGetSession: () => ipcRenderer.invoke('auth:getSession'),
  authLoginByPassword: (input: BuguPasswordLoginInput) => ipcRenderer.invoke('auth:loginByPassword', input),
  authSendEmailCode: (input: BuguEmailCodeSendInput) => ipcRenderer.invoke('auth:sendEmailCode', input),
  authVerifyEmailCode: (input: BuguEmailCodeVerifyInput) => ipcRenderer.invoke('auth:verifyEmailCode', input),
  authLogout: () => ipcRenderer.invoke('auth:logout'),

  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: SaveSettingsInput) => ipcRenderer.invoke('settings:save', input),
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),

  getUpdateState: () => ipcRenderer.invoke('updates:getState'),
  checkForUpdates: (options?: UpdateCheckOptions) => ipcRenderer.invoke('updates:check', options),
  setAutoUpdateEnabled: (enabled: boolean) => ipcRenderer.invoke('updates:setAutoCheck', enabled),
  openUpdateDownload: () => ipcRenderer.invoke('updates:openDownload'),
  openUpdateReleaseNotes: () => ipcRenderer.invoke('updates:openReleaseNotes'),
  openLogsDirectory: () => ipcRenderer.invoke('updates:openLogsDirectory'),
  onUpdateState: (callback: (state: AutoUpdateState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: AutoUpdateState) => callback(payload);
    ipcRenderer.on('updates:state', listener);
    return () => ipcRenderer.off('updates:state', listener);
  },

  getModelConfig: () => ipcRenderer.invoke('modelConfig:get'),
  saveModelConfig: (input: SaveModelConfigInput) => ipcRenderer.invoke('modelConfig:save', input),
  getModelCatalog: () => ipcRenderer.invoke('modelConfig:catalog'),

  scanSkills: (workspacePath?: string) => ipcRenderer.invoke('skills:scan', workspacePath),
  installBuiltinSkill: (slug: string, workspacePath: string) => ipcRenderer.invoke('skills:installBuiltin', slug, workspacePath),
  getSkillSelection: (workspacePath: string) => ipcRenderer.invoke('skills:selection:get', workspacePath),
  setSkillEnabled: (workspacePath: string, skill: SkillRef, enabled: boolean) => ipcRenderer.invoke('skills:selection:set', workspacePath, skill, enabled),

  listKnowledgeBases: (workspacePath?: string) => ipcRenderer.invoke('knowledge:list', workspacePath),
  importKnowledgeBaseFromFile: (workspacePath: string) => ipcRenderer.invoke('knowledge:importFromFile', workspacePath),
  installBuiltinKnowledgeBase: (id: string, workspacePath: string) => ipcRenderer.invoke('knowledge:installBuiltin', id, workspacePath),
  searchKnowledge: (input: KnowledgeSearchInput) => ipcRenderer.invoke('knowledge:search', input),

  listPromptPacks: (workspacePath: string) => ipcRenderer.invoke('promptPacks:list', workspacePath),
  generatePromptPack: (input: GeneratePromptPackInput) => ipcRenderer.invoke('promptPacks:generate', input),
  updatePromptPack: (input: PromptPack) => ipcRenderer.invoke('promptPacks:update', input),
  listSceneCards: (workspacePath: string) => ipcRenderer.invoke('sceneCards:list', workspacePath),
  generateSceneCards: (input: GenerateSceneCardsInput) => ipcRenderer.invoke('sceneCards:generate', input),
  updateSceneCard: (input: SceneCard) => ipcRenderer.invoke('sceneCards:update', input),

  selectAssetFiles: (kind: AssetFileKind) => ipcRenderer.invoke('assets:selectFiles', kind),
  revealPath: (path: string) => ipcRenderer.invoke('assets:revealPath', path),
  exportAsset: (input: ExportAssetInput) => ipcRenderer.invoke('assets:export', input),
  exportMarkdown: (input: ExportMarkdownInput) => ipcRenderer.invoke('article:exportMarkdown', input),
  generateArticle: (input: ArticleGenerationRequest) => ipcRenderer.invoke('article:generate', input),
  analyzeVideo: (input: VideoBreakdownRequest) => ipcRenderer.invoke('video:analyze', input),
  generateVideoScript: (input: VideoScriptGenerationRequest) => ipcRenderer.invoke('video:script', input),
  generateImage: (input: ImageGenerationRequest) => ipcRenderer.invoke('image:generate', input),
  generateImageSkill: (input: GenerateImageSkillInput) => ipcRenderer.invoke('imageSkills:generate', input),
  importImageSkillFromFile: () => ipcRenderer.invoke('imageSkills:importFromFile'),
  generateVideo: (input: VideoGenerationRequest) => ipcRenderer.invoke('video:generate', input),
  listGenerationLogs: (workspacePath: string) => ipcRenderer.invoke('generationLogs:list', workspacePath),

  runTask: (input: RunTaskInput) => ipcRenderer.invoke('agent:run', input),
  cancelTask: (taskId: string) => ipcRenderer.invoke('agent:cancel', taskId),
  onAgentEvent: (taskId: string, callback: (event: AgentEvent) => void) => {
    const channel = `agent:event:${taskId}`;
    const listener = (_event: Electron.IpcRendererEvent, payload: AgentEvent) => callback(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.off(channel, listener);
  },
};

contextBridge.exposeInMainWorld('contentStudio', api);
