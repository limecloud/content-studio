export type PermissionMode = 'ask' | 'safe' | 'allow-all';
export type SkillSource = 'builtin' | 'project' | 'project-compat' | 'user' | 'user-compat';
export type KnowledgeBaseSource = 'builtin' | 'workspace';
export type KnowledgeBaseType = 'product-kb' | 'personal-ip-kb';
export type KnowledgeSectionType =
  | 'science'
  | 'brand'
  | 'product'
  | 'selling-point'
  | 'scenario-script'
  | 'objection-handling'
  | 'compliance'
  | 'qa'
  | 'spec'
  | 'profile'
  | 'timeline'
  | 'story'
  | 'methodology'
  | 'quote'
  | 'voice-style'
  | 'boundary';

export interface AppSettingsView {
  workspacePath?: string;
  hasAnthropicApiKey: boolean;
  apiKeyStorage: 'safeStorage' | 'plain' | 'none';
}

export interface SaveSettingsInput {
  workspacePath?: string;
  anthropicApiKey?: string;
  clearAnthropicApiKey?: boolean;
}

export interface ModelConfigView {
  apiEndpoint: string;
  hasApiKey: boolean;
  textModel: string;
  imageModels: string[];
  videoModel: string;
  updatedAt?: string;
}

export interface SaveModelConfigInput {
  apiEndpoint?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  textModel?: string;
  imageModels?: string[];
  videoModel?: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
  globs?: string[];
  alwaysAllow?: string[];
  requiredSources?: string[];
  icon?: string;
}

export interface LoadedSkill {
  slug: string;
  source: SkillSource;
  path: string;
  metadata: SkillMetadata;
  valid: boolean;
  error?: string;
}

export interface SkillRef {
  slug: string;
  source: SkillSource;
}

export interface SkillSelectionView {
  workspacePath: string;
  enabledSkills: SkillRef[];
  updatedAt?: string;
}

export interface KnowledgeSection {
  id: string;
  title: string;
  sectionType: KnowledgeSectionType;
  tags: string[];
  summary?: string;
  content: string;
}

export interface KnowledgeBaseView {
  id: string;
  source: KnowledgeBaseSource;
  baseType: KnowledgeBaseType;
  title: string;
  description?: string;
  sourcePath?: string;
  sections: KnowledgeSection[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCitation {
  knowledgeBaseId: string;
  sectionId: string;
  title: string;
  sectionType: KnowledgeSectionType;
  excerpt: string;
}

export interface KnowledgeSearchInput {
  workspacePath?: string;
  query?: string;
  baseType?: KnowledgeBaseType | 'all';
  sectionType?: KnowledgeSectionType | 'all';
}

export interface KnowledgeSearchResult {
  knowledgeBaseId: string;
  baseTitle: string;
  baseType: KnowledgeBaseType;
  source: KnowledgeBaseSource;
  section: KnowledgeSection;
  score: number;
}

export interface PromptPack {
  id: string;
  workspacePath: string;
  name: string;
  baseType: KnowledgeBaseType;
  citations: KnowledgeCitation[];
  brandVoice: string;
  visualStyle: string;
  sellingPointRules: string[];
  complianceBoundaries: string[];
  platformConstraints: string[];
  imagePromptFragments: string[];
  videoPromptFragments: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GeneratePromptPackInput {
  workspacePath: string;
  name?: string;
  citations: KnowledgeCitation[];
}

export interface SceneCard {
  id: string;
  workspacePath: string;
  promptPackId: string;
  title: string;
  audience: string;
  painPoint: string;
  usageScene: string;
  visualComposition: string;
  sellingPoint: string;
  voiceoverDirection: string;
  imageMaterialSuggestion: string;
  videoMaterialSuggestion: string;
  citations: KnowledgeCitation[];
  createdAt: string;
  updatedAt: string;
}

export interface GenerateSceneCardsInput {
  workspacePath: string;
  promptPackId: string;
  citations?: KnowledgeCitation[];
  count?: number;
}

export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';
export type GenerationKind = 'article' | 'image' | 'video' | 'prompt-pack' | 'scene-card';

export interface GenerationLogEntry {
  id: string;
  workspacePath: string;
  kind: GenerationKind;
  status: GenerationStatus;
  title: string;
  summary?: string;
  model?: string;
  promptPackId?: string;
  sceneCardIds?: string[];
  citations?: KnowledgeCitation[];
  input?: unknown;
  output?: unknown;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalGenerationParams {
  imageModel: string;
  textModel: string;
  videoModel: string;
  runMode: 'single' | 'parallel' | 'inline';
  count: number;
  aspectRatio: '1:1' | '4:5' | '5:4' | '3:4' | '4:3' | '2:3' | '3:2' | '9:16' | '16:9' | '21:9' | '9:21' | '1:8';
  resolution: '1k' | '2k' | '4k';
  quality: 'low' | 'medium' | 'high';
}

export interface ArticleGenerationRequest {
  workspacePath: string;
  articleType: 'wechat-longform' | 'xiaohongshu-note' | 'product-seeding' | 'detail-page-copy' | 'short-video-script';
  platform: string;
  audience: string;
  topic: string;
  tone: string;
  length: 'short' | 'medium' | 'long' | 'custom';
  customRequirement?: string;
  citations: KnowledgeCitation[];
  promptPackId?: string;
  sceneCardIds?: string[];
  assetRefs: string[];
  selectedSkillSlugs: string[];
  params: Pick<GlobalGenerationParams, 'textModel'>;
}

export interface ArticleGenerationResult {
  logId: string;
  titleCandidates: string[];
  outline: string[];
  markdown: string;
  publishCheck: Array<{ level: 'info' | 'warning' | 'risk'; message: string }>;
}

export interface ImageGenerationRequest {
  workspacePath: string;
  productImageRefs: string[];
  referenceImageRefs: string[];
  prompt: string;
  promptMode: 'free' | 'preset';
  generationMode: 'smart' | 'fixed';
  template: string;
  watermark: boolean;
  promptPackId?: string;
  sceneCardIds?: string[];
  citations: KnowledgeCitation[];
  params: GlobalGenerationParams;
}

export interface MediaGenerationResult {
  logId: string;
  status: GenerationStatus;
  message: string;
  assetRefs: string[];
}

export interface VideoGenerationRequest {
  workspacePath: string;
  imageAssetRefs: string[];
  videoAssetRefs: string[];
  prompt: string;
  script?: string;
  promptPackId?: string;
  sceneCardIds?: string[];
  citations: KnowledgeCitation[];
  params: Pick<GlobalGenerationParams, 'videoModel' | 'aspectRatio'> & { durationSeconds: number };
}

export interface RunTaskInput {
  prompt: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  selectedSkillSlugs?: string[];
}

export type AgentEvent =
  | { type: 'status'; taskId: string; message: string }
  | { type: 'assistant'; taskId: string; text: string }
  | { type: 'tool'; taskId: string; name: string; input?: unknown }
  | { type: 'result'; taskId: string; summary?: string; raw?: unknown }
  | { type: 'error'; taskId: string; message: string }
  | { type: 'done'; taskId: string };

export interface RunTaskResult {
  taskId: string;
}

export interface ContentStudioApi {
  getSettings(): Promise<AppSettingsView>;
  saveSettings(input: SaveSettingsInput): Promise<AppSettingsView>;
  selectWorkspace(): Promise<string | null>;

  getModelConfig(): Promise<ModelConfigView>;
  saveModelConfig(input: SaveModelConfigInput): Promise<ModelConfigView>;

  scanSkills(workspacePath?: string): Promise<LoadedSkill[]>;
  installBuiltinSkill(slug: string, workspacePath: string): Promise<LoadedSkill[]>;
  getSkillSelection(workspacePath: string): Promise<SkillSelectionView>;
  setSkillEnabled(workspacePath: string, skill: SkillRef, enabled: boolean): Promise<SkillSelectionView>;

  listKnowledgeBases(workspacePath?: string): Promise<KnowledgeBaseView[]>;
  importKnowledgeBaseFromFile(workspacePath: string): Promise<KnowledgeBaseView | null>;
  installBuiltinKnowledgeBase(id: string, workspacePath: string): Promise<KnowledgeBaseView>;
  searchKnowledge(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult[]>;

  listPromptPacks(workspacePath: string): Promise<PromptPack[]>;
  generatePromptPack(input: GeneratePromptPackInput): Promise<PromptPack>;
  listSceneCards(workspacePath: string): Promise<SceneCard[]>;
  generateSceneCards(input: GenerateSceneCardsInput): Promise<SceneCard[]>;

  generateArticle(input: ArticleGenerationRequest): Promise<ArticleGenerationResult>;
  generateImage(input: ImageGenerationRequest): Promise<MediaGenerationResult>;
  generateVideo(input: VideoGenerationRequest): Promise<MediaGenerationResult>;
  listGenerationLogs(workspacePath: string): Promise<GenerationLogEntry[]>;

  runTask(input: RunTaskInput): Promise<RunTaskResult>;
  cancelTask(taskId: string): Promise<boolean>;
  onAgentEvent(taskId: string, callback: (event: AgentEvent) => void): () => void;
}
