import type { ImageTemplateConfig } from './imageTemplates';

export type PermissionMode = 'ask' | 'safe' | 'allow-all';
export type SkillSource = 'builtin' | 'project' | 'project-compat' | 'user' | 'user-compat';
export type KnowledgeBaseSource = 'builtin' | 'workspace';
export type KnowledgeBaseType = 'product-kb' | 'personal-ip-kb';
export type TextGenerationProtocol = 'claude-sdk' | 'anthropic-messages' | 'openai-chat' | 'gemini-generate-content';
export type ImageGenerationProtocol = 'openai-responses' | 'openai-chat-data-uri' | 'gemini-generate-content';
export const TEXT_GENERATION_PROTOCOLS: readonly TextGenerationProtocol[] = ['claude-sdk', 'anthropic-messages', 'openai-chat', 'gemini-generate-content'];
export const IMAGE_GENERATION_PROTOCOLS: readonly ImageGenerationProtocol[] = ['openai-responses', 'openai-chat-data-uri', 'gemini-generate-content'];

export function isTextGenerationProtocol(value: unknown): value is TextGenerationProtocol {
  return typeof value === 'string' && TEXT_GENERATION_PROTOCOLS.includes(value as TextGenerationProtocol);
}

export function isImageGenerationProtocol(value: unknown): value is ImageGenerationProtocol {
  return typeof value === 'string' && IMAGE_GENERATION_PROTOCOLS.includes(value as ImageGenerationProtocol);
}

export function isClaudeModelName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().toLowerCase().startsWith('claude-');
}

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
  autoUpdateEnabled: boolean;
  lastUpdateCheckAt?: string;
}

export interface BuguTenantUser {
  id: string;
  email?: string;
  username?: string;
  displayName?: string;
  avatarUrl?: string;
  passwordConfigured?: boolean;
  roles?: string[];
  status?: string;
}

export interface BuguTenantSession {
  id: string;
  expiresAt?: string;
}

export interface BuguClientBootstrap {
  tenant?: {
    id?: string;
    name?: string;
    slug?: string;
  };
  branding?: ContentStudioBrandingConfig;
  user?: BuguTenantUser;
  subscription?: {
    status?: string;
    planName?: string;
    planKey?: string;
  };
  creditAccount?: {
    balance?: number;
  };
  agentAppCatalog?: {
    apps?: Array<{ appId?: string; displayName?: string; enabled?: boolean }>;
  };
}

export interface ContentStudioBrandingConfig {
  brandId?: string;
  tenantId?: string;
  appName?: string;
  shortName?: string;
  logoUrl?: string;
  primaryColor?: string;
  copyrightName?: string;
  supportUrl?: string;
  downloadChannel?: string;
}

export interface OemRuntimeConfig {
  schemaVersion?: number;
  brandId?: string;
  tenantId?: string;
  appId?: string;
  productName?: string;
  shortName?: string;
  logoUrl?: string;
  supportUrl?: string;
  apiBaseUrl?: string;
  downloadBaseUrl?: string;
}

export interface BuguCurrentSession {
  token?: string;
  user: BuguTenantUser;
  session: BuguTenantSession;
}

export interface BuguAuthState {
  authenticated: boolean;
  user?: BuguTenantUser;
  session?: BuguTenantSession;
  bootstrap?: BuguClientBootstrap;
  error?: string;
}

export interface BuguPasswordLoginInput {
  identifier: string;
  password: string;
}

export interface BuguEmailCodeSendInput {
  identifier: string;
  turnstileToken?: string;
}

export interface BuguEmailCodeSendResult {
  sent: boolean;
  maskedEmail?: string;
  expiresInSeconds?: number;
}

export interface BuguEmailCodeVerifyInput {
  identifier: string;
  code: string;
  displayName?: string;
}

export interface SaveSettingsInput {
  workspacePath?: string;
  anthropicApiKey?: string;
  clearAnthropicApiKey?: boolean;
  autoUpdateEnabled?: boolean;
}

export type AutoUpdateStatus = 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'error';

export interface AutoUpdateAsset {
  platform: string;
  kind: string;
  label: string;
  fileName?: string;
  url: string;
  sha256?: string;
  size?: number;
  primary?: boolean;
}

export interface AutoUpdateState {
  enabled: boolean;
  status: AutoUpdateStatus;
  currentVersion: string;
  latestVersion?: string;
  hasUpdate: boolean;
  checkedAt?: string;
  lastAutoCheckAt?: string;
  publishedAt?: string;
  channel?: string;
  sourceLabel?: string;
  manifestUrl?: string;
  releaseNotesUrl?: string;
  downloadUrl?: string;
  asset?: AutoUpdateAsset;
  error?: string;
}

export interface UpdateCheckOptions {
  manual?: boolean;
}

export interface UpdateActionResult {
  ok: boolean;
  error?: string;
}

export interface ModelConfigView {
  apiEndpoint: string;
  hasApiKey: boolean;
  textProvider: 'anthropic-claude-sdk';
  textProtocol: TextGenerationProtocol;
  textApiEndpoint: string;
  hasTextApiKey: boolean;
  textModel: string;
  imageProvider: 'openai-responses' | 'disabled';
  imageProtocol: ImageGenerationProtocol;
  imageApiEndpoint: string;
  imageOuterModel: string;
  hasImageApiKey: boolean;
  imageModels: string[];
  videoProvider: 'generic-http' | 'disabled';
  videoApiEndpoint: string;
  hasVideoApiKey: boolean;
  videoModel: string;
  updatedAt?: string;
}

export interface ModelCatalogView {
  textModels: string[];
  imageModels: string[];
  videoModels: string[];
  source: 'configured' | 'provider' | 'offline-seed';
  updatedAt: string;
}

export interface SaveModelConfigInput {
  apiEndpoint?: string;
  apiKey?: string;
  clearApiKey?: boolean;
  textApiEndpoint?: string;
  textApiKey?: string;
  clearTextApiKey?: boolean;
  textModel?: string;
  textProtocol?: ModelConfigView['textProtocol'];
  imageProvider?: ModelConfigView['imageProvider'];
  imageProtocol?: ModelConfigView['imageProtocol'];
  imageApiEndpoint?: string;
  imageApiKey?: string;
  clearImageApiKey?: boolean;
  imageOuterModel?: string;
  imageModels?: string[];
  videoProvider?: ModelConfigView['videoProvider'];
  videoApiEndpoint?: string;
  videoApiKey?: string;
  clearVideoApiKey?: boolean;
  videoModel?: string;
}

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  author?: string;
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
  content?: string;
  files?: SkillPackageFileNode[];
  updatedAt?: string;
  error?: string;
}

export interface RenameSkillInput {
  workspacePath: string;
  skill: SkillRef;
  nextSlug: string;
}

export interface CreateSkillInput {
  workspacePath: string;
  slug: string;
  name?: string;
  description?: string;
  instructions?: string;
}

export interface SkillWorkspaceInput {
  workspacePath: string;
  skill: SkillRef;
}

export interface ReplaceSkillPackageInput extends SkillWorkspaceInput {
  packagePath?: string;
}

export interface SkillPackageFileNode {
  name: string;
  path: string;
  kind: 'file' | 'directory';
  children?: SkillPackageFileNode[];
}

export interface SkillPackagePreview {
  packagePath: string;
  slug: string;
  metadata: SkillMetadata;
  rootDir: string;
  targetPath?: string;
  targetExists: boolean;
  files: SkillPackageFileNode[];
  selectedPath: string;
  selectedContent: string;
}

export interface InstallSkillPackageInput {
  packagePath: string;
  workspacePath: string;
  overwrite?: boolean;
}

export interface StageSkillPackageInput {
  fileName: string;
  data: ArrayBuffer;
}

export interface InstallSkillPackageResult {
  skill: LoadedSkill;
  skills: LoadedSkill[];
  targetPath: string;
}

export interface SkillFileAssociationState {
  platform: string;
  supported: boolean;
  canSetDefault: boolean;
  isDefault: boolean;
  appBundleId: string;
  currentHandler?: string;
  appPath?: string;
  message: string;
}

export interface SkillFileAssociationResult extends SkillFileAssociationState {
  ok: boolean;
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
  tag?: string;
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
  workflowRunId?: string;
  name: string;
  baseType: KnowledgeBaseType;
  citations: KnowledgeCitation[];
  inputSourceIds?: string[];
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
  workflowRunId?: string;
  name?: string;
  citations: KnowledgeCitation[];
  inputSourceIds?: string[];
}

export type BrandKnowledgeBaseStatus = 'draft' | 'ready' | 'blocked' | 'archived';

export interface BrandKnowledgeBaseRecord {
  id: string;
  workspacePath: string;
  title: string;
  status: BrandKnowledgeBaseStatus;
  sourceKnowledgeBaseId?: string;
  sourceCitationIds: string[];
  brandVoice: string;
  audience: string;
  productFacts: string[];
  coreSellingPoints: string[];
  complianceBoundaries: string[];
  sceneSeeds: string[];
  promptFragments: string[];
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateBrandKnowledgeBaseInput {
  workspacePath: string;
  title?: string;
  citations: KnowledgeCitation[];
}

export type IpKnowledgeBaseStatus = 'draft' | 'ready' | 'blocked' | 'archived';

export interface IpKnowledgeBaseLayers {
  identity: string;
  values: string;
  language: string;
  methodology: string;
  materials: string;
  engine: string;
}

export interface IpKnowledgeBaseRecord {
  id: string;
  workspacePath: string;
  title: string;
  status: IpKnowledgeBaseStatus;
  sourceKnowledgeBaseId?: string;
  sourceCitationIds: string[];
  layers: IpKnowledgeBaseLayers;
  missingLayers: string[];
  completeness: number;
  extensionScenes: string[];
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateIpKnowledgeBaseInput {
  workspacePath: string;
  title?: string;
  citations: KnowledgeCitation[];
}

export interface SceneCard {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  promptPackId: string;
  inputSourceIds?: string[];
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
  workflowRunId?: string;
  promptPackId: string;
  inputSourceIds?: string[];
  citations?: KnowledgeCitation[];
  count?: number;
}

export type InputSourceKind =
  | 'docx'
  | 'markdown'
  | 'text'
  | 'image'
  | 'video'
  | 'sku-table'
  | 'url'
  | 'manual-note';
export type InputSourceStatus = 'registered' | 'converted' | 'blocked' | 'failed';
export type InputSourcePurpose =
  | 'brand-kb'
  | 'ip-kb'
  | 'ip-scenario-kb'
  | 'reference'
  | 'product-brief'
  | 'user-feedback'
  | 'sop-input'
  | 'successful-asset';

export interface InputSourceRecord {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  kind: InputSourceKind;
  status: InputSourceStatus;
  purpose: InputSourcePurpose;
  title: string;
  sourcePath?: string;
  sourceUrl?: string;
  tags: string[];
  summary?: string;
  extractedText?: string;
  markdownPath?: string;
  artifactRefs: string[];
  relatedPromptDraftId?: string;
  relatedSceneCardIds?: string[];
  blockedReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface RegisterInputSourceInput {
  workspacePath: string;
  workflowRunId?: string;
  kind: InputSourceKind;
  purpose: InputSourcePurpose;
  title: string;
  sourcePath?: string;
  sourceUrl?: string;
  tags?: string[];
  summary?: string;
  text?: string;
  relatedPromptDraftId?: string;
  relatedSceneCardIds?: string[];
}

export interface ImportInputSourceFromFileOptions {
  workflowRunId?: string;
  relatedPromptDraftId?: string;
  relatedSceneCardIds?: string[];
  tags?: string[];
}

export type PromptDraftPurpose = 'image' | 'video' | 'article' | 'green-screen' | 'sop' | 'skill';
export type PromptDraftStatus = 'draft' | 'confirmed' | 'materialized' | 'archived';

export interface PromptDraftVersion {
  id: string;
  version: number;
  content: string;
  note?: string;
  createdAt: string;
}

export interface PromptDraft {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  title: string;
  purpose: PromptDraftPurpose;
  status: PromptDraftStatus;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
  copyCount?: number;
  lastCopiedAt?: string;
  lastCopiedTarget?: string;
  model?: string;
  textProtocol?: TextGenerationProtocol;
  versions: PromptDraftVersion[];
  activeVersionId: string;
  materializedTarget?: 'prompt-pack' | 'workflow' | 'skill';
  createdAt: string;
  updatedAt: string;
}

export interface GeneratePromptDraftInput {
  workspacePath: string;
  workflowRunId?: string;
  title?: string;
  purpose: PromptDraftPurpose;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
}

export interface CreatePromptDraftFromContentInput {
  workspacePath: string;
  workflowRunId?: string;
  title: string;
  purpose: PromptDraftPurpose;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
  content: string;
  note?: string;
  model?: string;
  textProtocol?: TextGenerationProtocol;
  status?: PromptDraftStatus;
}

export interface UpdatePromptDraftInput {
  workspacePath: string;
  draftId: string;
  content: string;
  note?: string;
  status?: PromptDraftStatus;
  model?: string;
  textProtocol?: TextGenerationProtocol;
  materializedTarget?: PromptDraft['materializedTarget'];
}

export interface RecordPromptDraftCopyInput {
  workspacePath: string;
  draftId: string;
  target?: string;
}

export type AgentPromptSessionStatus = 'active' | 'waiting-user' | 'draft-created' | 'blocked' | 'closed';
export type AgentPromptMessageRole = 'user' | 'assistant' | 'system';
export type AgentPromptMessageKind = 'intent' | 'draft' | 'adjustment' | 'note';

export interface AgentPromptSourceSnapshot {
  sourceId: string;
  title: string;
  kind: InputSourceKind;
  purpose: InputSourcePurpose;
  status: InputSourceStatus;
  summary?: string;
  markdownPath?: string;
  blockedReason?: string;
}

export interface AgentPromptMessage {
  id: string;
  role: AgentPromptMessageRole;
  kind: AgentPromptMessageKind;
  content: string;
  model?: string;
  promptDraftId?: string;
  createdAt: string;
}

export interface AgentPromptSession {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  title: string;
  purpose: PromptDraftPurpose;
  status: AgentPromptSessionStatus;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
  promptDraftIds: string[];
  sourceSnapshots: AgentPromptSourceSnapshot[];
  messages: AgentPromptMessage[];
  model?: string;
  textProtocol?: TextGenerationProtocol;
  createdAt: string;
  updatedAt: string;
}

export interface StartAgentPromptSessionInput {
  workspacePath: string;
  workflowRunId?: string;
  title?: string;
  purpose: PromptDraftPurpose;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
}

export interface ContinueAgentPromptSessionInput {
  workspacePath: string;
  sessionId: string;
  message: string;
}

export interface AgentPromptSessionResult {
  session: AgentPromptSession;
  draft: PromptDraft;
}

export type OverlayCardType = 'title' | 'selling-point' | 'quote' | 'cta' | 'subtitle';
export type OverlayCardStatus = 'draft' | 'exported' | 'archived';

export interface OverlayCardDraft {
  type: OverlayCardType;
  title: string;
  text: string;
  durationSeconds?: number;
  tags?: string[];
}

export interface OverlayCardRecord {
  id: string;
  workspacePath: string;
  promptDraftId?: string;
  type: OverlayCardType;
  title: string;
  text: string;
  durationSeconds: number;
  status: OverlayCardStatus;
  assetPath: string;
  background: 'green-screen';
  aspectRatio: '9:16';
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface GenerateOverlayCardsInput {
  workspacePath: string;
  promptDraftId?: string;
  cards: OverlayCardDraft[];
}

export type MixPackageAssetKind = 'image' | 'video' | 'overlay';
export type AssetReviewStatus = 'pending' | 'approved' | 'rejected';
export type AssetReviewSourceType = 'generation-log' | 'input-source' | 'overlay-card' | 'manual';

export interface AssetReviewRecord {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  assetKey: string;
  kind: MixPackageAssetKind;
  sourceType: AssetReviewSourceType;
  sourceId?: string;
  path: string;
  title: string;
  status: AssetReviewStatus;
  note?: string;
  tags: string[];
  reviewedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewAssetInput {
  workspacePath: string;
  workflowRunId?: string;
  assetKey: string;
  kind: MixPackageAssetKind;
  sourceType: AssetReviewSourceType;
  sourceId?: string;
  path: string;
  title: string;
  status: AssetReviewStatus;
  note?: string;
  tags?: string[];
}

export interface AssetReworkSource {
  assetKey: string;
  kind: MixPackageAssetKind;
  sourceType: AssetReviewSourceType;
  sourceId?: string;
  path?: string;
  title?: string;
  reviewId?: string;
  reviewNote?: string;
  promptDraftId?: string;
  workflowRunId?: string;
}

export interface MixPackageAssetInput {
  id: string;
  kind: MixPackageAssetKind;
  title: string;
  path: string;
  sourceType?: AssetReviewSourceType;
  sourceId?: string;
  promptDraftId?: string;
  promptText?: string;
  relatedSceneCardIds?: string[];
  durationSeconds?: number;
  tags?: string[];
}

export interface MixPackageManifestAsset {
  id: string;
  kind: MixPackageAssetKind;
  title: string;
  originalPath: string;
  packagedPath?: string;
  reviewId?: string;
  reviewStatus?: AssetReviewStatus;
  sourceType?: AssetReviewSourceType;
  sourceId?: string;
  promptDraftId?: string;
  promptText?: string;
  relatedSceneCardIds?: string[];
  durationSeconds?: number;
  tags: string[];
}

export type MixPackageImportEvidenceResult = 'verified' | 'needs-fix' | 'rejected';

export interface MixPackageExternalImportEvidence {
  toolName: string;
  importedAt: string;
  operator?: string;
  importedAssetKinds: MixPackageAssetKind[];
  importedFileCount: number;
  manifestImported: boolean;
  timelineCreated: boolean;
  result: MixPackageImportEvidenceResult;
  notes?: string;
  evidenceFiles: string[];
  evidencePath?: string;
  updatedAt: string;
}

export interface MixPackageRecord {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  title: string;
  platform: string;
  packageDir: string;
  manifestPath: string;
  manifestCsvPath?: string;
  importGuidePath?: string;
  externalImportEvidencePath?: string;
  externalImportEvidence?: MixPackageExternalImportEvidence;
  assets: MixPackageManifestAsset[];
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExportMixPackageInput {
  workspacePath: string;
  workflowRunId?: string;
  title: string;
  platform: string;
  assets: MixPackageAssetInput[];
  notes?: string;
}

export interface RecordMixPackageImportEvidenceInput {
  workspacePath: string;
  mixPackageId: string;
  toolName: string;
  importedAt: string;
  operator?: string;
  importedAssetKinds: MixPackageAssetKind[];
  importedFileCount: number;
  manifestImported: boolean;
  timelineCreated: boolean;
  result: MixPackageImportEvidenceResult;
  notes?: string;
  evidenceFiles?: string[];
}

export type WorkflowDefinitionStatus = 'draft' | 'published' | 'archived';
export type WorkflowRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';
export type WorkflowPriority = 'P0' | 'P1' | 'P2';
export type WorkflowInputFieldType = 'text' | 'textarea' | 'file' | 'select' | 'number';
export type WorkflowStepKind =
  | 'input'
  | 'build-brand-knowledge-base'
  | 'build-ip-knowledge-base'
  | 'agent-read'
  | 'reference-reverse'
  | 'structure-product-brief'
  | 'cluster-user-feedback'
  | 'generate-prompt-pack'
  | 'generate-scene-library'
  | 'generate-prompt-group'
  | 'prompt-generate'
  | 'image-generate'
  | 'video-prompt'
  | 'manual-video-prompt-copy'
  | 'manual-video-import'
  | 'overlay-generate'
  | 'review'
  | 'asset-store'
  | 'export';

export interface WorkflowInputField {
  key: string;
  label: string;
  type: WorkflowInputFieldType;
  required?: boolean;
  help?: string;
  options?: string[];
}

export interface WorkflowStepDefinition {
  id: string;
  title: string;
  kind: WorkflowStepKind;
  description: string;
  dependsOn: string[];
  outputKeys: string[];
  blockedReason?: string;
}

export interface WorkflowDefinition {
  id: string;
  workspacePath: string;
  key: string;
  version: string;
  title: string;
  description: string;
  status: WorkflowDefinitionStatus;
  priority: WorkflowPriority;
  inputSchema: WorkflowInputField[];
  steps: WorkflowStepDefinition[];
  reviewRules: string[];
  outputSpec: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface CreateWorkflowDraftInput {
  workspacePath: string;
  templateKey?: string;
  title?: string;
  description?: string;
}

export interface WorkflowRunStep {
  stepId: string;
  title: string;
  status: WorkflowRunStatus;
  summary?: string;
  input?: unknown;
  output?: unknown;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface WorkflowRunRecord {
  id: string;
  workspacePath: string;
  workflowDefinitionId: string;
  workflowKey: string;
  workflowVersion: string;
  title: string;
  status: WorkflowRunStatus;
  summary: string;
  inputs: Record<string, string>;
  inputSourceIds?: string[];
  citations?: KnowledgeCitation[];
  steps: WorkflowRunStep[];
  artifactRefs: string[];
  createdAt: string;
  updatedAt: string;
}

export interface StartWorkflowRunInput {
  workspacePath: string;
  workflowDefinitionId: string;
  inputs?: Record<string, string>;
  inputSourceIds?: string[];
  citations?: KnowledgeCitation[];
}

export type WorkflowManualEventKind =
  | 'video-prompt-copied'
  | 'finished-video-imported'
  | 'overlay-cards-generated'
  | 'image-candidates-generated'
  | 'asset-reviewed'
  | 'asset-review-rejected'
  | 'asset-prompt-distilled'
  | 'mix-package-exported'
  | 'mix-package-import-verified'
  | 'article-draft-generated'
  | 'article-markdown-exported'
  | 'article-platform-draft-exported'
  | 'ip-scenario-extended'
  | 'workflow-review-approved'
  | 'workflow-asset-archived';

export interface RecordWorkflowManualEventInput {
  workspacePath: string;
  workflowRunId: string;
  event: WorkflowManualEventKind;
  promptDraftId?: string;
  inputSourceId?: string;
  overlayCardIds?: string[];
  assetReviewId?: string;
  assetKey?: string;
  mixPackageId?: string;
  manifestPath?: string;
  manifestCsvPath?: string;
  importGuidePath?: string;
  externalImportEvidencePath?: string;
  packageDir?: string;
  generationLogId?: string;
  assetRefs?: string[];
  exportPath?: string;
  summary?: string;
}

export type GenerationStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'blocked' | 'cancelled';
export interface ReferenceReverseRequest {
  workspacePath: string;
  workflowRunId?: string;
  referenceSourceIds: string[];
  productSourceIds: string[];
  userIntent: string;
}

export interface ReferenceReverseAnalysis {
  composition: string;
  lighting: string;
  textArea: string;
  style: string;
  reusableElements: string[];
  risks: string[];
  prompt: string;
  negativePrompt: string;
  qualityChecklist: string[];
}

export interface ReferenceReverseResult {
  logId: string;
  analysis: ReferenceReverseAnalysis;
  promptDraft: PromptDraft;
}

export type GenerationKind = 'article' | 'image' | 'video' | 'video-breakdown' | 'video-script' | 'prompt-pack' | 'scene-card' | 'reference-reverse';

export interface GenerationLogEntry {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  reworkSource?: AssetReworkSource;
  kind: GenerationKind;
  status: GenerationStatus;
  title: string;
  summary?: string;
  model?: string;
  promptPackId?: string;
  sceneCardIds?: string[];
  citations?: KnowledgeCitation[];
  artifactRefs?: string[];
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs?: number;
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
  summary: string;
  markdown: string;
  publishCheck: Array<{ level: 'info' | 'warning' | 'risk'; message: string }>;
}

export interface ImageGenerationRequest {
  workspacePath: string;
  workflowRunId?: string;
  reworkSource?: AssetReworkSource;
  productImageRefs: string[];
  referenceImageRefs: string[];
  prompt: string;
  promptMode: 'free' | 'preset';
  generationMode: 'smart' | 'fixed';
  template: string;
  templateInputs?: Record<string, string | string[]>;
  watermark: boolean;
  promptPackId?: string;
  sceneCardIds?: string[];
  citations: KnowledgeCitation[];
  selectedSkillSlugs: string[];
  params: GlobalGenerationParams;
}

export interface GenerateImageSkillInput {
  workspacePath: string;
  description: string;
}

export interface GenerateImageSkillResult {
  template: ImageTemplateConfig;
  model: string;
  rawText: string;
}

export interface MediaGenerationResult {
  logId: string;
  status: GenerationStatus;
  message: string;
  assetRefs: string[];
  billing?: VideoCostEstimate;
}

export interface VideoCostEstimate {
  currency: string;
  durationSeconds: number;
  unit: 'second';
  unitPrice: number;
  estimatedCost: number;
  source: 'provider-response' | 'env' | 'default-internal-api';
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
  selectedSkillSlugs: string[];
  params: Pick<GlobalGenerationParams, 'videoModel' | 'aspectRatio'> & { durationSeconds: number };
}

export type AssetFileKind = 'product-image' | 'reference-image' | 'video' | 'image-material';

export interface ExportMarkdownInput {
  workspacePath: string;
  sourceLogId?: string;
  suggestedName: string;
  markdown: string;
}

export interface ExportPlatformDraftInput {
  workspacePath: string;
  workflowRunId?: string;
  promptDraftId?: string;
  sourceLogId?: string;
  platform: string;
  title: string;
  markdown: string;
  publishCheck: Array<{ level: 'info' | 'warning' | 'risk'; message: string }>;
  topic?: string;
  audience?: string;
  tone?: string;
}

export interface ReadPlatformDraftCopyTextInput {
  workspacePath: string;
  draftId: string;
}

export interface PlatformDraftExportResult {
  packageDir: string;
  markdownPath: string;
  platformCopyPath: string;
  formatGuidePath: string;
  metadataPath: string;
  checklistPath: string;
  manifestPath: string;
}

export interface PlatformDraftRecord extends PlatformDraftExportResult {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  promptDraftId?: string;
  sourceLogId?: string;
  title: string;
  platform: string;
  topic?: string;
  audience?: string;
  tone?: string;
  publishCheck: Array<{ level: 'info' | 'warning' | 'risk'; message: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface ExportAssetInput {
  sourcePath: string;
  suggestedName?: string;
}

export interface VideoBreakdownRequest {
  workspacePath: string;
  sourceType: 'file' | 'url';
  source: string;
  dimensions: string[];
  promptPackId?: string;
  citations: KnowledgeCitation[];
  selectedSkillSlugs: string[];
  params: Pick<GlobalGenerationParams, 'textModel'>;
}

export interface VideoBreakdownSegment {
  timeRange: string;
  hook: string;
  visual: string;
  voiceover: string;
  subtitle: string;
  rhythm: string;
  reusablePoint: string;
}

export interface VideoBreakdownResult {
  logId: string;
  summary: string;
  dimensions: string[];
  segments: VideoBreakdownSegment[];
  reusableFormula: string[];
  risks: Array<{ level: 'info' | 'warning' | 'risk'; message: string }>;
}

export interface VideoScriptGenerationRequest {
  workspacePath: string;
  productName: string;
  sceneBackground: string;
  subtitleMode: string;
  voiceStyle: string;
  customRequirement?: string;
  ratio: GlobalGenerationParams['aspectRatio'];
  shotCount: number;
  durationSeconds: number;
  breakdownLogId?: string;
  promptPackId?: string;
  sceneCardIds?: string[];
  citations: KnowledgeCitation[];
  assetRefs: string[];
  selectedSkillSlugs: string[];
  params: Pick<GlobalGenerationParams, 'textModel'>;
}

export interface VideoStoryboardShot {
  shot: number;
  duration: string;
  visual: string;
  voiceover: string;
  subtitle: string;
  rhythm: string;
}

export interface VideoScriptGenerationResult {
  logId: string;
  title: string;
  script: string;
  storyboard: VideoStoryboardShot[];
  videoPrompt: string;
  publishCheck: Array<{ level: 'info' | 'warning' | 'risk'; message: string }>;
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
  authGetSession(): Promise<BuguAuthState>;
  authLoginByPassword(input: BuguPasswordLoginInput): Promise<BuguAuthState>;
  authSendEmailCode(input: BuguEmailCodeSendInput): Promise<BuguEmailCodeSendResult>;
  authVerifyEmailCode(input: BuguEmailCodeVerifyInput): Promise<BuguAuthState>;
  authLogout(): Promise<BuguAuthState>;

  getSettings(): Promise<AppSettingsView>;
  saveSettings(input: SaveSettingsInput): Promise<AppSettingsView>;
  selectWorkspace(): Promise<string | null>;

  getUpdateState(): Promise<AutoUpdateState>;
  checkForUpdates(options?: UpdateCheckOptions): Promise<AutoUpdateState>;
  setAutoUpdateEnabled(enabled: boolean): Promise<AutoUpdateState>;
  openUpdateDownload(): Promise<UpdateActionResult>;
  openUpdateReleaseNotes(): Promise<UpdateActionResult>;
  openLogsDirectory(): Promise<UpdateActionResult>;
  onUpdateState(callback: (state: AutoUpdateState) => void): () => void;

  getModelConfig(): Promise<ModelConfigView>;
  saveModelConfig(input: SaveModelConfigInput): Promise<ModelConfigView>;
  getModelCatalog(): Promise<ModelCatalogView>;

  scanSkills(workspacePath?: string): Promise<LoadedSkill[]>;
  installBuiltinSkill(slug: string, workspacePath: string): Promise<LoadedSkill[]>;
  createSkill(input: CreateSkillInput): Promise<InstallSkillPackageResult>;
  uploadSkillPackage(workspacePath: string): Promise<InstallSkillPackageResult | null>;
  openSkillFolder(workspacePath: string, skill: SkillRef): Promise<void>;
  renameSkill(input: RenameSkillInput): Promise<LoadedSkill[]>;
  replaceSkillPackage(input: ReplaceSkillPackageInput): Promise<InstallSkillPackageResult | null>;
  uninstallSkill(input: SkillWorkspaceInput): Promise<LoadedSkill[]>;
  readSkillFile(workspacePath: string | undefined, skill: SkillRef, relativePath: string): Promise<string>;
  getPathForFile(file: File): string | null;
  stageSkillPackage(input: StageSkillPackageInput): Promise<string>;
  previewSkillPackage(packagePath: string, workspacePath?: string): Promise<SkillPackagePreview>;
  readSkillPackageFile(packagePath: string, relativePath: string): Promise<string>;
  installSkillPackage(input: InstallSkillPackageInput): Promise<InstallSkillPackageResult>;
  onSkillPackageOpenRequest(callback: (packagePath: string) => void): () => void;
  notifySkillPackageOpenReady(): void;
  getSkillFileAssociation(): Promise<SkillFileAssociationState>;
  setSkillFileAssociationDefault(): Promise<SkillFileAssociationResult>;
  getSkillSelection(workspacePath: string): Promise<SkillSelectionView>;
  setSkillEnabled(workspacePath: string, skill: SkillRef, enabled: boolean): Promise<SkillSelectionView>;

  listKnowledgeBases(workspacePath?: string): Promise<KnowledgeBaseView[]>;
  importKnowledgeBaseFromFile(workspacePath: string): Promise<KnowledgeBaseView | null>;
  installBuiltinKnowledgeBase(id: string, workspacePath: string): Promise<KnowledgeBaseView>;
  searchKnowledge(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult[]>;

  listPromptPacks(workspacePath: string): Promise<PromptPack[]>;
  generatePromptPack(input: GeneratePromptPackInput): Promise<PromptPack>;
  updatePromptPack(input: PromptPack): Promise<PromptPack>;
  listBrandKnowledgeBases(workspacePath: string): Promise<BrandKnowledgeBaseRecord[]>;
  generateBrandKnowledgeBase(input: GenerateBrandKnowledgeBaseInput): Promise<BrandKnowledgeBaseRecord>;
  updateBrandKnowledgeBase(input: BrandKnowledgeBaseRecord): Promise<BrandKnowledgeBaseRecord>;
  listIpKnowledgeBases(workspacePath: string): Promise<IpKnowledgeBaseRecord[]>;
  generateIpKnowledgeBase(input: GenerateIpKnowledgeBaseInput): Promise<IpKnowledgeBaseRecord>;
  updateIpKnowledgeBase(input: IpKnowledgeBaseRecord): Promise<IpKnowledgeBaseRecord>;
  listSceneCards(workspacePath: string): Promise<SceneCard[]>;
  generateSceneCards(input: GenerateSceneCardsInput): Promise<SceneCard[]>;
  updateSceneCard(input: SceneCard): Promise<SceneCard>;

  listInputSources(workspacePath: string): Promise<InputSourceRecord[]>;
  registerInputSource(input: RegisterInputSourceInput): Promise<InputSourceRecord>;
  importInputSourceFromFile(
    workspacePath: string,
    purpose: InputSourcePurpose,
    options?: ImportInputSourceFromFileOptions,
  ): Promise<InputSourceRecord | null>;

  listPromptDrafts(workspacePath: string): Promise<PromptDraft[]>;
  generatePromptDraft(input: GeneratePromptDraftInput): Promise<PromptDraft>;
  createPromptDraftFromContent(input: CreatePromptDraftFromContentInput): Promise<PromptDraft>;
  updatePromptDraft(input: UpdatePromptDraftInput): Promise<PromptDraft>;
  recordPromptDraftCopy(input: RecordPromptDraftCopyInput): Promise<PromptDraft>;
  listAgentPromptSessions(workspacePath: string): Promise<AgentPromptSession[]>;
  startAgentPromptSession(input: StartAgentPromptSessionInput): Promise<AgentPromptSessionResult>;
  continueAgentPromptSession(input: ContinueAgentPromptSessionInput): Promise<AgentPromptSessionResult>;

  listOverlayCards(workspacePath: string): Promise<OverlayCardRecord[]>;
  generateOverlayCards(input: GenerateOverlayCardsInput): Promise<OverlayCardRecord[]>;
  listAssetReviews(workspacePath: string): Promise<AssetReviewRecord[]>;
  reviewAsset(input: ReviewAssetInput): Promise<AssetReviewRecord>;
  listMixPackages(workspacePath: string): Promise<MixPackageRecord[]>;
  exportMixPackage(input: ExportMixPackageInput): Promise<MixPackageRecord>;
  recordMixPackageImportEvidence(input: RecordMixPackageImportEvidenceInput): Promise<MixPackageRecord>;

  listWorkflowDefinitions(workspacePath: string): Promise<WorkflowDefinition[]>;
  createWorkflowDraft(input: CreateWorkflowDraftInput): Promise<WorkflowDefinition>;
  updateWorkflowDefinition(input: WorkflowDefinition): Promise<WorkflowDefinition>;
  listWorkflowRuns(workspacePath: string): Promise<WorkflowRunRecord[]>;
  startWorkflowRun(input: StartWorkflowRunInput): Promise<WorkflowRunRecord>;
  recordWorkflowManualEvent(input: RecordWorkflowManualEventInput): Promise<WorkflowRunRecord>;

  selectAssetFiles(kind: AssetFileKind): Promise<string[]>;
  revealPath(path: string): Promise<{ ok: boolean; error?: string }>;
  exportAsset(input: ExportAssetInput): Promise<string | null>;
  exportMarkdown(input: ExportMarkdownInput): Promise<string | null>;
  exportPlatformDraft(input: ExportPlatformDraftInput): Promise<PlatformDraftExportResult>;
  listPlatformDrafts(workspacePath: string): Promise<PlatformDraftRecord[]>;
  readPlatformDraftCopyText(input: ReadPlatformDraftCopyTextInput): Promise<string>;
  generateArticle(input: ArticleGenerationRequest): Promise<ArticleGenerationResult>;
  reverseReferencePrompt(input: ReferenceReverseRequest): Promise<ReferenceReverseResult>;
  analyzeVideo(input: VideoBreakdownRequest): Promise<VideoBreakdownResult>;
  generateVideoScript(input: VideoScriptGenerationRequest): Promise<VideoScriptGenerationResult>;
  generateImage(input: ImageGenerationRequest): Promise<MediaGenerationResult>;
  generateImageSkill(input: GenerateImageSkillInput): Promise<GenerateImageSkillResult>;
  importImageSkillFromFile(): Promise<GenerateImageSkillResult | null>;
  generateVideo(input: VideoGenerationRequest): Promise<MediaGenerationResult>;
  listGenerationLogs(workspacePath: string): Promise<GenerationLogEntry[]>;

  runTask(input: RunTaskInput): Promise<RunTaskResult>;
  cancelTask(taskId: string): Promise<boolean>;
  onAgentEvent(taskId: string, callback: (event: AgentEvent) => void): () => void;
}
