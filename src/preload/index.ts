import { contextBridge, ipcRenderer } from 'electron';
import type {
  AgentEvent,
  ArticleGenerationRequest,
  ContentStudioApi,
  GeneratePromptPackInput,
  GenerateSceneCardsInput,
  ImageGenerationRequest,
  KnowledgeSearchInput,
  RunTaskInput,
  SaveModelConfigInput,
  SaveSettingsInput,
  SkillRef,
  VideoGenerationRequest,
} from '../shared/types';

const api: ContentStudioApi = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (input: SaveSettingsInput) => ipcRenderer.invoke('settings:save', input),
  selectWorkspace: () => ipcRenderer.invoke('workspace:select'),

  getModelConfig: () => ipcRenderer.invoke('modelConfig:get'),
  saveModelConfig: (input: SaveModelConfigInput) => ipcRenderer.invoke('modelConfig:save', input),

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
  listSceneCards: (workspacePath: string) => ipcRenderer.invoke('sceneCards:list', workspacePath),
  generateSceneCards: (input: GenerateSceneCardsInput) => ipcRenderer.invoke('sceneCards:generate', input),

  generateArticle: (input: ArticleGenerationRequest) => ipcRenderer.invoke('article:generate', input),
  generateImage: (input: ImageGenerationRequest) => ipcRenderer.invoke('image:generate', input),
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
