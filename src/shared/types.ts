import type { ImageTemplateConfig } from './imageTemplates';

export type PermissionMode = 'ask' | 'safe' | 'allow-all';
export type SkillSource = 'builtin' | 'project' | 'project-compat' | 'user' | 'user-compat';
export type KnowledgeBaseSource = 'builtin' | 'workspace';
export type KnowledgeBaseType = 'product-kb' | 'personal-ip-kb';
export type TextGenerationProtocol = 'anthropic-messages' | 'openai-chat' | 'gemini-generate-content';
export type ImageGenerationProtocol = 'openai-responses' | 'openai-chat-data-uri' | 'gemini-generate-content';
export type ModelSecretStatus = 'missing' | 'available' | 'requires-reauthorization';
export const TEXT_GENERATION_PROTOCOLS: readonly TextGenerationProtocol[] = ['anthropic-messages', 'openai-chat', 'gemini-generate-content'];
export const IMAGE_GENERATION_PROTOCOLS: readonly ImageGenerationProtocol[] = ['openai-responses', 'openai-chat-data-uri', 'gemini-generate-content'];

export function isTextGenerationProtocol(value: unknown): value is TextGenerationProtocol {
  return typeof value === 'string' && TEXT_GENERATION_PROTOCOLS.includes(value as TextGenerationProtocol);
}

export function isImageGenerationProtocol(value: unknown): value is ImageGenerationProtocol {
  return typeof value === 'string' && IMAGE_GENERATION_PROTOCOLS.includes(value as ImageGenerationProtocol);
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
  oemPublicApiBaseUrl?: string;
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
  oemPublicApiBaseUrl?: string;
  downloadBaseUrl?: string;
}

export interface OemSiteConfigRequest {
  tenant?: string;
  apiBaseUrl?: string;
  includeShared?: boolean;
}

export interface OemPublicAsset {
  id: string;
  kind?: string;
  publicUrl?: string;
  caption?: string;
  role?: string;
  group?: string;
  fileName?: string;
  width?: number;
  height?: number;
  mimeType?: string;
}

export interface OemPublicCase {
  id: string;
  title: string;
  industry?: string;
  summary?: string;
  prompt?: string;
  tags?: string[];
  mediaRefs?: string[];
}

export interface OemPublicMaterial {
  id: string;
  type?: string;
  title: string;
  description?: string;
  previewRef?: string;
  assetRefs?: string[];
  sourceRefs?: string[];
  tags?: string[];
  status?: string;
}

export interface OemFeatureFlagItem {
  tenantId?: string;
  flagKey: string;
  flagValue?: unknown;
  status?: string;
  updatedAt?: string;
}

export interface OemPublicSiteConfig {
  tenantId?: string;
  slug?: string;
  displayName?: string;
  primaryDomain?: string;
  cases?: OemPublicCase[];
  materials?: OemPublicMaterial[];
  assets?: OemPublicAsset[];
  featureFlags?: Record<string, unknown>;
  featureFlagItems?: OemFeatureFlagItem[];
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
  safeStorageAvailable: boolean;
  textProvider: 'http-text-generation';
  textProtocol: TextGenerationProtocol;
  textApiEndpoint: string;
  hasTextApiKey: boolean;
  textApiKeyStatus: ModelSecretStatus;
  textModel: string;
  textModels: string[];
  imageProvider: 'openai-responses' | 'disabled';
  imageProtocol: ImageGenerationProtocol;
  imageApiEndpoint: string;
  imageOuterModel: string;
  hasImageApiKey: boolean;
  imageApiKeyStatus: ModelSecretStatus;
  imageModels: string[];
  videoProvider: 'video-understanding-openai-compatible' | 'generic-http' | 'disabled';
  videoApiEndpoint: string;
  hasVideoApiKey: boolean;
  videoApiKeyStatus: ModelSecretStatus;
  videoModel: string;
  videoModels: string[];
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
  textModels?: string[];
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
  videoModels?: string[];
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
  contentKnowledgeMapId?: string;
  contentKnowledgeMapTitle?: string;
  coverageRowIds?: string[];
  sourceRefs?: string[];
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

export interface CreateSceneCardFromContentInput {
  workspacePath: string;
  workflowRunId?: string;
  promptPackId: string;
  inputSourceIds?: string[];
  contentKnowledgeMapId?: string;
  contentKnowledgeMapTitle?: string;
  coverageRowIds?: string[];
  sourceRefs?: string[];
  title: string;
  audience: string;
  painPoint: string;
  usageScene: string;
  visualComposition: string;
  sellingPoint: string;
  voiceoverDirection: string;
  imageMaterialSuggestion: string;
  videoMaterialSuggestion: string;
  citations?: KnowledgeCitation[];
}

export type ContentKnowledgeMapStatus = 'draft' | 'ready' | 'needs-review' | 'blocked' | 'published';
export type ContentKnowledgeMapSyncStatus = 'local-only' | 'pending-sync' | 'synced' | 'conflict' | 'blocked';
export type ContentKnowledgeMapRowStatus = 'ready' | 'needs-evidence' | 'needs-review';
export type ContentKnowledgeMapMaterialStatus = 'missing' | 'covered' | 'approved' | 'rejected';

export interface ContentKnowledgeMapEvidence {
  id: string;
  sourceType:
    | 'input-source'
    | 'user-quote'
    | 'customer-service-log'
    | 'generated-inference'
    | 'brand-knowledge-base'
    | 'ip-knowledge-base'
    | 'scene-card'
    | 'prompt-draft'
    | 'asset-review'
    | 'manual';
  sourceId?: string;
  sourceTitle: string;
  claim: string;
  excerpt: string;
  status: 'ready' | 'missing' | 'needs-review';
}

export interface ContentKnowledgeMapCoverageDimensions {
  audiences?: string[];
  channels?: string[];
  stages?: string[];
  contentFormats?: string[];
  useCases?: string[];
}

export interface ContentKnowledgeMapMatrixRow {
  id: string;
  title: string;
  summary: string;
  tags: string[];
  dimensions?: ContentKnowledgeMapCoverageDimensions;
  sourceRefs: string[];
  evidenceRefs: string[];
  materialStatus?: ContentKnowledgeMapMaterialStatus;
  materialRefs?: string[];
  performanceTags?: string[];
  confidence: number;
  status: ContentKnowledgeMapRowStatus;
}

export interface ContentKnowledgeMapCoverageSummary {
  inputSourceCount: number;
  brandKnowledgeBaseCount: number;
  ipKnowledgeBaseCount?: number;
  skuRowCount?: number;
  competitorObservationCount?: number;
  assetReviewCount?: number;
  sceneCardCount: number;
  promptDraftCount: number;
  evidenceCount: number;
  gapCount: number;
  readyPercent: number;
}

export type InputSourceSensitivity = 'public' | 'internal' | 'confidential' | 'restricted';
export type IntakeLevel = 'L0' | 'L1' | 'L2';
export type IntakeResponsibility = 'self-serve' | 'implementation' | 'system-auto';
export type IntakeConfidence = '高' | '中' | '低' | '无';
export type IntakeHealth = 'ok' | 'warn' | 'bad' | 'info';

export interface IntakeSourceProjection {
  id: string;
  name: string;
  level: IntakeLevel;
  responsibility: IntakeResponsibility;
  adapterName: string;
  adapterVersion: string;
  adapterReuseCount: number;
  coverage: number;
  freshness: string;
  confidence: IntakeConfidence;
  health: IntakeHealth;
  outputObjects: string[];
  sourceIds: string[];
  missingSourceCount: number;
  fieldMappings: Array<{
    sourceField: string;
    ontologyField: string;
    status: 'mapped' | 'ai-inferred' | 'ocr-pending' | 'missing';
  }>;
  impact: {
    blocksTier: Array<'premium' | 'standard' | 'template' | 'ai-quick'>;
    note: string;
  };
  upgrade?: {
    next: IntakeLevel;
    action: string;
    blocker: string;
  };
}

export interface IntakeMaturitySummary {
  averageCoverage: number;
  selfServeSourceCount: number;
  l2SourceCount: number;
  bottleneckCount: number;
  sourceCount: number;
  projections: IntakeSourceProjection[];
}

export type ManufacturingTier = 'premium' | 'standard' | 'template' | 'ai-quick';
export type ManufacturingCapabilityStatus = 'ready' | 'needs-input' | 'blocked' | 'done';

export interface ManufacturingCapabilityProjection {
  id: 'image-generation' | 'video-prompt' | 'green-screen' | 'mix-export' | 'retouch' | 'video-import';
  title: string;
  targetModule: string;
  status: ManufacturingCapabilityStatus;
  tier: ManufacturingTier;
  priority: number;
  reason: string;
  requiredInputs: string[];
  output: string;
  blockedReason?: string;
}

export interface ManufacturingPlanProjection {
  recommendedTier: ManufacturingTier;
  tierLabel: string;
  tierReason: string;
  blockedTiers: ManufacturingTier[];
  capabilities: ManufacturingCapabilityProjection[];
  primaryCapabilityId?: ManufacturingCapabilityProjection['id'];
  materialCoveragePercent: number;
  evidenceCoveragePercent: number;
  readyPromptCount: number;
  approvedAssetCount: number;
  manufacturingArtifactCount: number;
}

export type ProductPlanWave = 'W1' | 'W2' | 'W3';
export type ProductPlanDecision = 'deep-modeling' | 'standard-production' | 'template-production' | 'ai-quick';
export type ProductPlanBudgetLevel = 'high' | 'medium-high' | 'medium' | 'low';

export interface ProductPlanCandidateProjection {
  id: string;
  title: string;
  sourceIds: string[];
  skuHints: string[];
  inventory?: number;
  price?: number;
}

export interface ProductPlanItemProjection {
  id: string;
  skuId: string;
  title: string;
  clusterTitle: string;
  sourceIds: string[];
  manufacturingTier: ManufacturingTier;
  tierLabel: string;
  wave: ProductPlanWave;
  budgetLevel: ProductPlanBudgetLevel;
  decision: ProductPlanDecision;
  opportunityScore: number;
  marginScore: number;
  inventoryScore: number;
  evidenceScore: number;
  assetScore: number;
  riskScore: number;
  totalScore: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  recoveryActions: string[];
}

export interface ProductPlanProjection {
  mode: 'brand-full-coverage';
  modeLabel: string;
  summary: string;
  candidateCount: number;
  plannedCount: number;
  allCovered: boolean;
  topTierCount: number;
  bottleneckCount: number;
  inputCoveragePercent: number;
  distribution: Record<ManufacturingTier, number>;
  waves: Record<ProductPlanWave, number>;
  items: ProductPlanItemProjection[];
}

export interface ContentKnowledgeMapSourceSensitivitySummary {
  highest: InputSourceSensitivity;
  counts: Record<InputSourceSensitivity, number>;
  restrictedSourceTitles: string[];
  confidentialSourceTitles: string[];
}

export interface ContentKnowledgeMapTeamSyncSummary {
  backend: 'bugu';
  status: ContentKnowledgeMapSyncStatus;
  message: string;
  workspaceId?: string;
  revision?: string;
  baseRevision?: string;
  releaseId?: string;
  packageObjectKey?: string;
  packagePublicUrl?: string;
  packageUploadStatus?: string;
  packageStorageProvider?: string;
  lastSyncedAt?: string;
}

export interface ContentKnowledgeMapRecord {
  id: string;
  workspacePath: string;
  title: string;
  status: ContentKnowledgeMapStatus;
  syncStatus: ContentKnowledgeMapSyncStatus;
  teamSync: ContentKnowledgeMapTeamSyncSummary;
  sourceInputSourceIds: string[];
  brandKnowledgeBaseIds: string[];
  ipKnowledgeBaseIds?: string[];
  sceneCardIds: string[];
  promptDraftIds: string[];
  sellingPoints: ContentKnowledgeMapMatrixRow[];
  painPoints: ContentKnowledgeMapMatrixRow[];
  scenarios: ContentKnowledgeMapMatrixRow[];
  evidence: ContentKnowledgeMapEvidence[];
  constraints: string[];
  gaps: string[];
  coverage: ContentKnowledgeMapCoverageSummary;
  sourceSensitivity?: ContentKnowledgeMapSourceSensitivitySummary;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export type ContentKnowledgeMapBuildRunStatus = 'completed' | 'blocked' | 'failed';
export type ContentKnowledgeMapBuildRunStepStatus = 'completed' | 'blocked' | 'failed' | 'skipped';

export interface ContentKnowledgeMapBuildRunStep {
  key: string;
  title: string;
  status: ContentKnowledgeMapBuildRunStepStatus;
  message: string;
  startedAt: string;
  completedAt: string;
}

export interface ContentKnowledgeMapBuildRunRecord {
  id: string;
  workspacePath: string;
  title: string;
  status: ContentKnowledgeMapBuildRunStatus;
  contentKnowledgeMapId?: string;
  contentKnowledgeMapTitle?: string;
  model?: string;
  inputSourceIds: string[];
  brandKnowledgeBaseIds: string[];
  ipKnowledgeBaseIds: string[];
  sceneCardIds: string[];
  promptDraftIds: string[];
  readyPercent: number;
  evidenceCount: number;
  gapCount: number;
  issues: string[];
  steps: ContentKnowledgeMapBuildRunStep[];
  teamSync?: ContentKnowledgeMapTeamSyncSummary;
  startedAt: string;
  completedAt: string;
  updatedAt: string;
}

export interface BuildContentKnowledgeMapInput {
  workspacePath: string;
  title?: string;
  inputSourceIds?: string[];
  brandKnowledgeBaseIds?: string[];
  ipKnowledgeBaseIds?: string[];
  sceneCardIds?: string[];
  promptDraftIds?: string[];
}

export type ContentBatchStageId =
  | 'selection'
  | 'intent'
  | 'modeling'
  | 'selling'
  | 'matrix'
  | 'manufacturing'
  | 'review'
  | 'optimization'
  | 'feedback';

export type ContentBatchStatus = 'draft' | 'active' | 'blocked' | 'completed' | 'archived';
export type ContentBatchRunStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'blocked'
  | 'needs-human'
  | 'approved'
  | 'rejected';
export type ContentBatchGateStatus = 'passed' | 'needs-input' | 'needs-review' | 'blocked';
export type ContentBatchRecoveryStatus = 'open' | 'resolved' | 'blocked';

export interface ContentBatchArtifactRef {
  kind: string;
  id: string;
  summary: string;
  path?: string;
  targetModule?: string;
}

export interface ContentBatchGateResult {
  id: string;
  stageId: ContentBatchStageId;
  status: ContentBatchGateStatus;
  title: string;
  message: string;
  recoveryAction?: string;
  sourceRef?: ContentBatchArtifactRef;
}

export interface ContentBatchRecoveryTask {
  id: string;
  stageId: ContentBatchStageId;
  status: ContentBatchRecoveryStatus;
  title: string;
  message: string;
  recoveryAction: string;
  targetModule: string;
  sourceRef?: ContentBatchArtifactRef;
  ownerLabel?: string;
  createdAt: string;
}

export interface ContentBatchStageRun {
  id: string;
  batchId: string;
  stageId: ContentBatchStageId;
  status: ContentBatchRunStatus;
  inputRefs: ContentBatchArtifactRef[];
  outputRefs: ContentBatchArtifactRef[];
  gateResults: ContentBatchGateResult[];
  recoveryTasks: ContentBatchRecoveryTask[];
  agentRunRefs: ContentBatchArtifactRef[];
  updatedAt: string;
}

export interface ContentBatchIntakeSummary {
  inputSourceCount: number;
  convertedCount: number;
  blockedCount: number;
  coveragePercent: number;
  maturity?: IntakeMaturitySummary;
  productPlan?: ProductPlanProjection;
  manufacturing?: ManufacturingPlanProjection;
  missingInputs: ContentBatchRecoveryTask[];
}

export interface ContentBatchRecord {
  id: string;
  workspacePath: string;
  title: string;
  objective: string;
  ownerIds: string[];
  status: ContentBatchStatus;
  currentStageId: ContentBatchStageId;
  sourceKnowledgeMapId?: string;
  sourceKnowledgeMapTitle?: string;
  intakeSummary: ContentBatchIntakeSummary;
  stageRuns: ContentBatchStageRun[];
  createdAt: string;
  updatedAt: string;
}

export interface BuildContentBatchInput {
  workspacePath: string;
  title?: string;
  objective?: string;
  contentKnowledgeMapId?: string;
}

export interface AdvanceContentBatchStageInput {
  workspacePath: string;
  batchId: string;
  stageId?: ContentBatchStageId;
}

export interface ExportContentKnowledgePackInput {
  workspacePath: string;
  contentKnowledgeMapId?: string;
}

export interface ContentKnowledgePackExportResult {
  status: 'exported' | 'blocked';
  packageDir?: string;
  knowledgePath?: string;
  manifestPath?: string;
  packageArchivePath?: string;
  packageArchiveFileName?: string;
  packageArchiveSha256?: string;
  packageArchiveSize?: number;
  preview?: {
    agentKnowledgeVersion: string;
    readyRowCount: number;
    readyEvidenceCount: number;
    materialCoverageCount: number;
    interopFormats: string[];
    answerQuestionCount: number;
    promptGroundingFile: string;
  };
  files: string[];
  issues: string[];
}

export interface ReadContentKnowledgePackFileInput {
  workspacePath: string;
  packageDir?: string;
  relativePath: string;
  maxBytes?: number;
}

export interface ContentKnowledgePackFilePreview {
  status: 'loaded' | 'blocked';
  relativePath: string;
  content?: string;
  size?: number;
  truncated?: boolean;
  issues: string[];
}

export type ContentWorkspaceSyncPolicy = 'server-authoritative' | 'offline-draft-allowed' | 'read-only-release';
export type ContentTeamRole = 'owner' | 'content-engineer' | 'reviewer' | 'operator' | 'viewer';
export type ContentDraftChangeStatus = 'local-draft' | 'pending-sync' | 'synced' | 'conflict' | 'blocked';
export type ContentDraftChangeKind =
  | 'knowledge-map-updated'
  | 'review-decision-appended'
  | 'action-record-appended'
  | 'material-coverage-updated'
  | 'knowledge-release-created';

export interface ContentTeamWorkspace {
  id: string;
  tenantId?: string;
  name: string;
  currentRevision?: string;
  defaultKnowledgeReleaseId?: string;
  syncPolicy: ContentWorkspaceSyncPolicy;
  role?: ContentTeamRole;
  updatedAt?: string;
}

export interface ContentDraftChange {
  id: string;
  workspacePath: string;
  workspaceId?: string;
  contentKnowledgeMapId: string;
  contentKnowledgeMapTitle: string;
  title: string;
  summary: string;
  kind: ContentDraftChangeKind;
  affectedObjectIds: string[];
  affectedObjects?: ContentSyncConflictAffectedObject[];
  baseRevision?: string;
  syncStatus: ContentDraftChangeStatus;
  authorLabel: string;
  issues: string[];
  createdAt: string;
  updatedAt: string;
}

export type ContentKnowledgeReleaseStatus = 'local-preview' | 'pending-server' | 'published' | 'blocked';
export type ContentKnowledgeReleaseApprovalStatus = 'pending' | 'approved' | 'rejected';

export interface ContentKnowledgeRelease {
  id: string;
  workspacePath: string;
  workspaceId?: string;
  contentKnowledgeMapId: string;
  contentKnowledgeMapTitle: string;
  title: string;
  version: string;
  status: ContentKnowledgeReleaseStatus;
  packageDir?: string;
  knowledgePath?: string;
  manifestPath?: string;
  packageArchivePath?: string;
  packageArchiveFileName?: string;
  packageArchiveSha256?: string;
  packageArchiveSize?: number;
  packageObjectKey?: string;
  packagePublicUrl?: string;
  packageStorageProvider?: string;
  packageUploadStatus?: string;
  approvalStatus?: ContentKnowledgeReleaseApprovalStatus;
  approvalRequestedBy?: string;
  approvalRequestedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  approvalNote?: string;
  files: string[];
  issues: string[];
  baseRevision?: string;
  serverReleaseId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContentKnowledgeReleaseReference {
  id: string;
  title: string;
  version: string;
  contentKnowledgeMapId?: string;
  contentKnowledgeMapTitle?: string;
  packageObjectKey?: string;
  packagePublicUrl?: string;
  packageUploadStatus?: string;
  approvalStatus?: ContentKnowledgeReleaseApprovalStatus;
}

export type ContentSyncConflictStatus = 'open' | 'resolved' | 'dismissed';
export type ContentSyncConflictResolutionAction =
  | 'keep-local-change'
  | 'keep-team-version'
  | 'manual-review-recorded';
export type ContentSyncConflictSourceType =
  | 'draft-change'
  | 'review-task'
  | 'review-decision'
  | 'knowledge-release'
  | 'team-sync';
export type ContentSyncConflictImpact = 'high' | 'medium' | 'low';

export interface ContentSyncConflictAffectedObject {
  id: string;
  objectId?: string;
  objectType: 'content-map' | 'selling-point' | 'pain-point' | 'scenario' | 'evidence' | 'constraint' | 'gap' | 'release' | 'review-task' | 'action' | 'unknown';
  title: string;
  summary: string;
  localValue?: string;
  teamValue?: string;
  impact: ContentSyncConflictImpact;
  recommendation: string;
}

export interface ContentSyncConflict {
  id: string;
  workspacePath: string;
  workspaceId?: string;
  sourceType: ContentSyncConflictSourceType;
  sourceId?: string;
  title: string;
  summary: string;
  status: ContentSyncConflictStatus;
  baseRevision?: string;
  serverRevision?: string;
  affectedObjectIds: string[];
  affectedObjects?: ContentSyncConflictAffectedObject[];
  authorLabel?: string;
  resolutionAction?: ContentSyncConflictResolutionAction | string;
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContentDraftChangeInput {
  workspacePath: string;
  contentKnowledgeMapId?: string;
  authorLabel?: string;
}

export interface SubmitContentDraftChangeInput {
  workspacePath: string;
  draftChangeId: string;
  authorLabel?: string;
}

export interface ExportContentDraftChangeInput {
  workspacePath: string;
  draftChangeId: string;
}

export interface ImportContentDraftChangeInput {
  workspacePath: string;
  packagePath?: string;
  authorLabel?: string;
}

export interface CreateContentKnowledgeReleaseInput {
  workspacePath: string;
  contentKnowledgeMapId?: string;
  title?: string;
  version?: string;
  authorLabel?: string;
}

export interface CreateTeamKnowledgePromptDraftInput {
  workspacePath: string;
  contentKnowledgeMapId?: string;
  contentKnowledgeReleaseId?: string;
}

export interface ResolveContentSyncConflictInput {
  workspacePath: string;
  conflictId: string;
  resolutionAction?: ContentSyncConflictResolutionAction;
  resolutionNote?: string;
  mergeDraft?: unknown;
  resolvedBy?: string;
}

export interface ContentWorkspaceSyncResult {
  status: 'created' | 'submitted' | 'released' | 'exported' | 'imported' | 'blocked' | 'conflict';
  issues: string[];
  teamSync?: ContentKnowledgeMapTeamSyncSummary;
  draftChange?: ContentDraftChange;
  release?: ContentKnowledgeRelease;
  conflict?: ContentSyncConflict;
  packageDir?: string;
  manifestPath?: string;
  draftChangePath?: string;
  files?: string[];
}

export type ContentReviewTaskStatus = 'open' | 'approved' | 'rejected' | 'needs-evidence' | 'needs-material' | 'forbidden';
export type ContentReviewTaskRisk = 'low' | 'medium' | 'high';
export type ContentReviewTaskPurpose = 'review' | 'evidence-supplement' | 'material-supplement';
export type ContentReviewDecisionAction =
  | 'approve'
  | 'reject'
  | 'request-evidence'
  | 'request-material'
  | 'mark-forbidden'
  | 'downgrade-to-needs-verification'
  | 'rename-target'
  | 'merge-related'
  | 'split-target';

export interface ContentReviewDecisionSplitItem {
  title: string;
  summary?: string;
  tags?: string[];
}

export interface ContentReviewDecisionPayload {
  title?: string;
  summary?: string;
  mergeTargetIds?: string[];
  splitItems?: ContentReviewDecisionSplitItem[];
}

export interface ContentReviewDecision {
  id: string;
  taskId: string;
  action: ContentReviewDecisionAction;
  reviewerLabel: string;
  reason: string;
  payload?: ContentReviewDecisionPayload;
  beforeSnapshot: unknown;
  afterSnapshot: unknown;
  createdAt: string;
}

export interface ContentReviewTask {
  id: string;
  workspacePath: string;
  sourceKnowledgeMapId?: string;
  sourceKnowledgeMapTitle?: string;
  targetType: 'selling-point' | 'pain-point' | 'scenario' | 'evidence' | 'constraint' | 'gap';
  targetId?: string;
  title: string;
  summary: string;
  taskPurpose?: ContentReviewTaskPurpose;
  evidenceRefs: string[];
  sourceRefs: string[];
  risk: ContentReviewTaskRisk;
  status: ContentReviewTaskStatus;
  suggestedAction: ContentReviewDecisionAction;
  issueLabels: string[];
  decisions: ContentReviewDecision[];
  syncStatus?: ContentKnowledgeMapSyncStatus;
  teamSync?: ContentKnowledgeMapTeamSyncSummary;
  createdAt: string;
  updatedAt: string;
}

export interface GenerateContentReviewTasksInput {
  workspacePath: string;
  contentKnowledgeMapId?: string;
  targetRowIds?: string[];
  targetTypes?: Array<'selling-point' | 'pain-point' | 'scenario'>;
  taskPurpose?: ContentReviewTaskPurpose;
}

export interface SubmitContentReviewDecisionInput {
  workspacePath: string;
  taskId: string;
  action: ContentReviewDecisionAction;
  payload?: ContentReviewDecisionPayload;
  reviewerLabel?: string;
  reason?: string;
}

export type ContentProductionHandoffTarget = 'prompt-draft' | 'scene-card' | 'prompt-and-scene';

export interface CreateContentProductionHandoffInput {
  workspacePath: string;
  reviewTaskId: string;
  target?: ContentProductionHandoffTarget;
  actorLabel?: string;
}

export interface ContentProductionGroundingSummary {
  title: string;
  content: string;
  sourceKnowledgeMapId: string;
  sourceKnowledgeMapTitle: string;
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
  coverageRowIds: string[];
  sourceRefs: string[];
  evidenceRefs: string[];
  constraints: string[];
  readyEvidenceCount: number;
}

export interface ContentProductionHandoffActionRecord {
  id: string;
  batchId: string;
  actionType: 'create-prompt-draft' | 'create-scene-card' | 'blocked';
  outcome: 'handoff' | 'blocked';
  title: string;
  inputSummary: string;
  outputSummary: string;
  actorLabel: string;
  sourceKnowledgeMapId?: string;
  coverageRowIds: string[];
  evidenceRefs: string[];
  sourceRefs: string[];
  promptDraftId?: string;
  sceneCardId?: string;
  workflowRunId?: string;
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
  checks: Array<{
    label: string;
    status: 'passed' | 'blocked';
    message: string;
  }>;
  nextStep: string;
  syncStatus?: ContentKnowledgeMapSyncStatus;
  teamSync?: ContentKnowledgeMapTeamSyncSummary;
  createdAt: string;
}

export interface ContentProductionHandoffRecord {
  id: string;
  workspacePath: string;
  reviewTaskId: string;
  target: ContentProductionHandoffTarget;
  status: 'created' | 'blocked';
  batchId: string;
  issues: string[];
  sourceKnowledgeMapId?: string;
  sourceKnowledgeMapTitle?: string;
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
  coverageRowIds: string[];
  sourceRefs: string[];
  evidenceRefs: string[];
  promptDraftId?: string;
  sceneCardId?: string;
  workflowRunId?: string;
  actorLabel: string;
  syncStatus?: ContentKnowledgeMapSyncStatus;
  teamSync?: ContentKnowledgeMapTeamSyncSummary;
  actionRecords: ContentProductionHandoffActionRecord[];
  createdAt: string;
}

export interface ContentProductionHandoffResult {
  status: 'created' | 'blocked';
  issues: string[];
  grounding?: ContentProductionGroundingSummary;
  record?: ContentProductionHandoffRecord;
  promptDraft?: PromptDraft;
  sceneCard?: SceneCard;
}

export interface WriteBackContentMaterialCoverageInput {
  workspacePath: string;
  contentKnowledgeMapId?: string;
  assetReviewIds?: string[];
}

export interface ContentMaterialCoverageUpdate {
  rowId: string;
  rowTitle: string;
  targetType: 'selling-point' | 'pain-point' | 'scenario';
  assetReviewIds: string[];
  materialStatus: ContentKnowledgeMapMaterialStatus;
  performanceTags: string[];
}

export interface ContentMaterialCoverageResult {
  status: 'updated' | 'blocked';
  issues: string[];
  coverageChangeId?: string;
  contentKnowledgeMap?: ContentKnowledgeMapRecord;
  updatedRowCount: number;
  reviewedAssetCount: number;
  approvedAssetCount: number;
  updates: ContentMaterialCoverageUpdate[];
  pendingSupplementTaskCount?: number;
  pendingSupplementTasks?: ContentReviewTask[];
  syncStatus?: ContentKnowledgeMapSyncStatus;
  teamSync?: ContentKnowledgeMapTeamSyncSummary;
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
  | 'competitor-observation'
  | 'reference'
  | 'product-brief'
  | 'user-feedback'
  | 'task-input'
  | 'sop-input'
  | 'successful-asset';

export interface InputSourceRecord {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  kind: InputSourceKind;
  status: InputSourceStatus;
  purpose: InputSourcePurpose;
  sensitivity: InputSourceSensitivity;
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
  sensitivity?: InputSourceSensitivity;
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
  sensitivity?: InputSourceSensitivity;
}

export type PromptDraftPurpose = 'image' | 'video' | 'article' | 'green-screen' | 'content-task' | 'sop' | 'skill';
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
  contentKnowledgeMapId?: string;
  contentKnowledgeMapTitle?: string;
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
  coverageRowIds?: string[];
  sourceRefs?: string[];
  title: string;
  purpose: PromptDraftPurpose;
  status: PromptDraftStatus;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
  selectedSkills?: SkillRef[];
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
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
  sceneCardIds?: string[];
  selectedSkills?: SkillRef[];
  selectedSkillSlugs?: string[];
}

export interface CreatePromptDraftFromContentInput {
  workspacePath: string;
  workflowRunId?: string;
  contentKnowledgeMapId?: string;
  contentKnowledgeMapTitle?: string;
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
  coverageRowIds?: string[];
  sourceRefs?: string[];
  title: string;
  purpose: PromptDraftPurpose;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
  selectedSkills?: SkillRef[];
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
export type AgentPromptExecutionEventKind =
  | 'context'
  | 'source'
  | 'skill'
  | 'tool'
  | 'permission'
  | 'sandbox'
  | 'state'
  | 'model'
  | 'draft'
  | 'handoff'
  | 'action'
  | 'evidence'
  | 'note';
export type AgentPromptExecutionEventStatus = 'pending' | 'running' | 'completed' | 'blocked' | 'failed';
export type AgentRuntimeEventClass =
  | 'session.created'
  | 'turn.submitted'
  | 'turn.started'
  | 'turn.completed'
  | 'turn.failed'
  | 'run.status'
  | 'context.resolved'
  | 'tool.started'
  | 'tool.result'
  | 'tool.failed'
  | 'tool.catalog.resolved'
  | 'permission.evaluated'
  | 'permission.requested'
  | 'permission.resolved'
  | 'sandbox.applied'
  | 'sandbox.violation'
  | 'model.requested'
  | 'model.delta'
  | 'model.completed'
  | 'model.failed'
  | 'artifact.changed'
  | 'action.required'
  | 'action.resolved'
  | 'runtime.error'
  | 'evidence.changed'
  | 'snapshot.updated';
export type AgentRuntimeFactOwner = 'runtime' | 'artifact' | 'evidence' | 'ui';
export type AgentRuntimePhase =
  | 'submitted'
  | 'routing'
  | 'preparing'
  | 'waiting_provider'
  | 'streaming'
  | 'tool_running'
  | 'action_required'
  | 'failed'
  | 'completed'
  | 'blocked';

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

export interface AgentPromptExecutionEvent {
  id: string;
  kind: AgentPromptExecutionEventKind;
  status: AgentPromptExecutionEventStatus;
  eventClass?: AgentRuntimeEventClass;
  owner?: AgentRuntimeFactOwner;
  schemaVersion?: string;
  sequence?: number;
  runtimeId?: string;
  threadId?: string;
  turnId?: string;
  taskId?: string;
  runId?: string;
  stepId?: string;
  toolCallId?: string;
  actionId?: string;
  traceId?: string;
  spanId?: string;
  attemptId?: string;
  artifactId?: string;
  evidenceId?: string;
  phase?: AgentRuntimePhase;
  title: string;
  detail?: string;
  refIds?: string[];
  artifactRefs?: string[];
  evidenceRefs?: string[];
  payload?: Record<string, unknown>;
  model?: string;
  createdAt: string;
  completedAt?: string;
}

export interface AgentPromptSession {
  id: string;
  workspacePath: string;
  workflowRunId?: string;
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
  title: string;
  purpose: PromptDraftPurpose;
  status: AgentPromptSessionStatus;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
  selectedSkills?: SkillRef[];
  promptDraftIds: string[];
  sourceSnapshots: AgentPromptSourceSnapshot[];
  messages: AgentPromptMessage[];
  executionEvents?: AgentPromptExecutionEvent[];
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
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
  sceneCardIds?: string[];
  selectedSkills?: SkillRef[];
  selectedSkillSlugs?: string[];
  textModel?: string;
}

export interface ContinueAgentPromptSessionInput {
  workspacePath: string;
  sessionId: string;
  message: string;
  textModel?: string;
}

export type AgentPromptActionDecision = 'open-input-source' | 'open-model-settings' | 'acknowledge';

export interface RespondAgentPromptActionInput {
  workspacePath: string;
  sessionId: string;
  actionId: string;
  decision: AgentPromptActionDecision;
  note?: string;
  payload?: Record<string, unknown>;
}

export interface AttachAgentPromptSessionInputSourcesInput {
  workspacePath: string;
  sessionId: string;
  inputSourceIds: string[];
  reason?: string;
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
  productionTaskId?: string;
  shotPromptId?: string;
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
  productionTaskId?: string;
  shotPromptId?: string;
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
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
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
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
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
  platform?: string;
  targetFormat?: GlobalGenerationParams['aspectRatio'];
  outputUsage?: 'xiaohongshu-seeding' | 'ecommerce-detail' | 'social-post' | 'generic';
}

export interface ReferenceReverseAnalysis {
  composition: string;
  lighting: string;
  textArea: string;
  style: string;
  subjectLayout?: string;
  background?: string;
  camera?: string;
  platformFit?: string;
  reusableElements: string[];
  replacementRules?: string[];
  generationControls?: string[];
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

export type GenerationKind =
  | 'article'
  | 'image'
  | 'video'
  | 'video-breakdown'
  | 'video-script'
  | 'video-script-evaluation'
  | 'video-script-shot-rewrite'
  | 'prompt-pack'
  | 'scene-card'
  | 'reference-reverse';

export interface GenerationLogReview {
  rating?: 'useful' | 'needs-rework';
  note?: string;
  source: 'script-history' | 'asset-review' | 'manual';
  updatedAt: string;
}

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
  review?: GenerationLogReview;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateGenerationLogReviewInput {
  workspacePath: string;
  logId: string;
  rating?: GenerationLogReview['rating'] | null;
  note?: string;
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
  productionTaskId?: string;
  shotPromptId?: string;
  generationStage?: 'test' | 'batch';
  productImageRefs: string[];
  referenceImageRefs: string[];
  prompt: string;
  negativeConstraints?: string[];
  consistencyRules?: string[];
  promptMode: 'free' | 'preset';
  generationMode: 'smart' | 'fixed';
  template: string;
  templateInputs?: Record<string, string | string[]>;
  watermark: boolean;
  promptPackId?: string;
  sceneCardIds?: string[];
  featureId?: string;
  featureTitle?: string;
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

export type ImageProductionTaskStatus = 'draft' | 'testing' | 'test-review' | 'test-approved' | 'batching' | 'batch-review' | 'completed' | 'needs-rework' | 'blocked';
export type ShotPromptStatus = 'draft' | 'ready' | 'testing' | 'test-review' | 'test-approved' | 'batching' | 'batch-review' | 'approved' | 'rejected' | 'needs-rework' | 'blocked';

export interface ShotPrompt {
  id: string;
  title: string;
  scene: string;
  prompt: string;
  negativePrompt?: string;
  productAction?: string;
  camera?: string;
  lighting?: string;
  referenceImageRefs: string[];
  status: ShotPromptStatus;
  testLogIds: string[];
  batchLogIds: string[];
  reviewIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ImageProductionTask {
  id: string;
  workspacePath: string;
  title: string;
  status: ImageProductionTaskStatus;
  sourceSummary: string;
  productImageRefs: string[];
  referenceImageRefs: string[];
  consistencyRules: string[];
  negativeConstraints: string[];
  shotPrompts: ShotPrompt[];
  activeShotPromptId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateImageProductionTaskInput {
  workspacePath: string;
  title?: string;
  sourceSummary?: string;
  productImageRefs?: string[];
  referenceImageRefs?: string[];
  consistencyRules?: string[];
  negativeConstraints?: string[];
  shotPrompts?: Array<Partial<Omit<ShotPrompt, 'id' | 'createdAt' | 'updatedAt'>> & { id?: string }>;
}

export interface UpdateImageProductionTaskInput {
  workspacePath: string;
  taskId: string;
  title?: string;
  status?: ImageProductionTaskStatus;
  sourceSummary?: string;
  productImageRefs?: string[];
  referenceImageRefs?: string[];
  consistencyRules?: string[];
  negativeConstraints?: string[];
  activeShotPromptId?: string;
}

export interface UpdateShotPromptInput {
  workspacePath: string;
  taskId: string;
  shotPromptId?: string;
  patch: Partial<Omit<ShotPrompt, 'id' | 'createdAt' | 'updatedAt'>>;
}

export interface AppendShotGenerationLogInput {
  workspacePath: string;
  taskId: string;
  shotPromptId: string;
  generationStage: 'test' | 'batch';
  logId: string;
}

export type GenerationTaskKind =
  | 'image'
  | 'video'
  | 'article'
  | 'video-script'
  | 'video-breakdown'
  | 'prompt-pack'
  | 'scene-card'
  | 'reference-reverse';

export interface GenerationTaskRecord {
  id: string;
  workspacePath: string;
  logId: string;
  kind: GenerationTaskKind;
  status: GenerationStatus;
  title: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export type SubmitGenerationTaskInput =
  | { kind: 'image'; input: ImageGenerationRequest }
  | { kind: 'video'; input: VideoGenerationRequest }
  | { kind: 'article'; input: ArticleGenerationRequest }
  | { kind: 'video-script'; input: VideoScriptGenerationRequest }
  | { kind: 'video-breakdown'; input: VideoBreakdownRequest }
  | { kind: 'prompt-pack'; input: GeneratePromptPackInput }
  | { kind: 'scene-card'; input: GenerateSceneCardsInput }
  | { kind: 'reference-reverse'; input: ReferenceReverseRequest };

export interface GenerationTaskEvent {
  task: GenerationTaskRecord;
  log: GenerationLogEntry;
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
  audioAssetRefs?: string[];
  prompt: string;
  script?: string;
  featureId?: string;
  featureTitle?: string;
  selectedCaseTitle?: string;
  promptPackId?: string;
  sceneCardIds?: string[];
  citations: KnowledgeCitation[];
  selectedSkillSlugs: string[];
  params: Pick<GlobalGenerationParams, 'videoModel' | 'aspectRatio'> & { durationSeconds: number };
}

export type AssetFileKind = 'product-image' | 'reference-image' | 'video' | 'audio' | 'image-material';

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
  startSec?: number;
  endSec?: number;
  shotType?: string;
  character?: string;
  characterAction?: string;
  scene?: string;
  cameraMovement?: string;
  objects?: string[];
  intensity?: number;
}

export interface VideoBreakdownTranscriptSegment {
  startSec: number;
  endSec: number;
  text: string;
}

export interface VideoBreakdownScene {
  timestampSec: number;
  startSec?: number;
  endSec?: number;
  shotType: string;
  character?: string;
  characterAction?: string;
  scene?: string;
  cameraMovement?: string;
  description: string;
  objects: string[];
  voiceover?: string;
}

export interface VideoBreakdownScore {
  score: number;
  reasoning: string;
}

export interface VideoBreakdownWithConfidence<T = string> {
  value: T;
  confidence: number;
  reasoning?: string;
}

export interface VideoBreakdownHook {
  hookType?: VideoBreakdownWithConfidence;
  elements: Array<{
    name: string;
    description: string;
    timestampRange: string;
  }>;
  emotionCurve: Array<{
    timestampSec: number;
    emotion: string;
    intensity: number;
  }>;
}

export interface VideoBreakdownNarrative {
  framework?: VideoBreakdownWithConfidence;
  stages: Array<{
    name: string;
    description: string;
    timeRange: string;
    emotionShift?: string;
  }>;
}

export interface VideoBreakdownPacing {
  avgCutsPerSecond?: number;
  avgShotDurationSec?: number;
  wordsPerMinute?: number;
  rhythm: Array<{
    timeRange: string;
    shotType: string;
    intensity: number;
    description: string;
    voiceover?: string;
    character?: string;
    characterAction?: string;
    scene?: string;
    cameraMovement?: string;
  }>;
}

export interface VideoBreakdownTimelineEvent {
  timestampSec: number;
  label: string;
  emotionLabel: string;
  intensity: number;
}

export interface VideoBreakdownResourceFramework {
  characters: Array<{
    name: string;
    shotCount: number;
    voiceTraits?: string;
    threeViewPrompt?: string;
  }>;
  scenes: Array<{
    name: string;
    shotCount: number;
    environment?: string;
    lighting?: string;
    sceneImagePrompt?: string;
  }>;
}

export interface VideoBreakdownViralScores {
  hookStrength?: VideoBreakdownScore;
  narrativeTension?: VideoBreakdownScore;
  pacingQuality?: VideoBreakdownScore;
  emotionDesign?: VideoBreakdownScore;
  ctaEffectiveness?: VideoBreakdownScore;
}

export interface VideoBreakdownResult {
  logId: string;
  summary: string;
  dimensions: string[];
  segments: VideoBreakdownSegment[];
  contentTitle?: string;
  platform?: string;
  durationSec?: number;
  transcript?: string;
  transcriptSegments?: VideoBreakdownTranscriptSegment[];
  scenes?: VideoBreakdownScene[];
  hook?: VideoBreakdownHook;
  narrative?: VideoBreakdownNarrative;
  pacing?: VideoBreakdownPacing;
  timeline?: VideoBreakdownTimelineEvent[];
  viralScores?: VideoBreakdownViralScores;
  resourceFramework?: VideoBreakdownResourceFramework;
  overallConfidence?: number;
  confidenceRate?: number;
  richnessRate?: number;
  referenceScore?: number;
  reusableFormula: string[];
  risks: Array<{ level: 'info' | 'warning' | 'risk'; message: string }>;
  warnings?: string[];
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

export type VideoScriptScoreKey = 'hookScore' | 'structureScore' | 'sellingPointScore' | 'voiceoverScore' | 'pacingScore';

export interface VideoScriptEvaluationScore {
  score: number;
  reasoning: string;
}

export interface VideoScriptEvaluationResult {
  logId: string;
  sourceScriptLogId?: string;
  scores: Record<VideoScriptScoreKey, VideoScriptEvaluationScore> & { totalScore: number };
  suggestions: string[];
}

export interface VideoStoryboardShot {
  shot: number;
  duration: string;
  visual: string;
  voiceover: string;
  subtitle: string;
  rhythm: string;
  timeRange?: string;
  shotType?: string;
  character?: string;
  characterAction?: string;
  scene?: string;
  cameraMovement?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  transitionHint?: string;
  voiceStyle?: string;
}

export interface VideoScriptGenerationResult {
  logId: string;
  title: string;
  script: string;
  storyboard: VideoStoryboardShot[];
  videoPrompt: string;
  resourceFramework?: VideoBreakdownResourceFramework;
  evaluation?: VideoScriptEvaluationResult;
  publishCheck: Array<{ level: 'info' | 'warning' | 'risk'; message: string }>;
}

export interface VideoScriptEvaluationRequest {
  workspacePath: string;
  sourceScriptLogId?: string;
  productName: string;
  productDesc: string;
  templateInfo?: {
    hookType?: string;
    framework?: string;
    sourceTitle?: string;
  };
  script: VideoScriptGenerationResult;
  citations: KnowledgeCitation[];
  params: Pick<GlobalGenerationParams, 'textModel'>;
}

export interface VideoScriptShotRewriteRequest {
  workspacePath: string;
  sourceScriptLogId?: string;
  rowIndex: number;
  productName: string;
  productDesc: string;
  templateInfo?: {
    hookType?: string;
    framework?: string;
    sourceTitle?: string;
  };
  script: VideoScriptGenerationResult;
  citations: KnowledgeCitation[];
  params: Pick<GlobalGenerationParams, 'textModel'>;
}

export interface VideoScriptShotRewriteResult {
  logId: string;
  sourceScriptLogId?: string;
  rowIndex: number;
  shot: VideoStoryboardShot;
  reasoning?: string;
  publishCheck: Array<{ level: 'info' | 'warning' | 'risk'; message: string }>;
}

export interface AppServerBusinessObjectRef {
  kind: string;
  id: string;
  title?: string;
  uri?: string;
  metadata?: Record<string, unknown>;
}

export interface RunTaskInput {
  prompt: string;
  workspacePath: string;
  permissionMode: PermissionMode;
  selectedSkillSlugs?: string[];
  businessObjectRef?: AppServerBusinessObjectRef;
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

export interface AppServerJsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface AppServerJsonRpcMessage {
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: AppServerJsonRpcError;
}

export interface AppServerRuntimeEvent {
  eventId?: string;
  sequence?: number;
  sessionId?: string;
  threadId?: string;
  turnId?: string;
  type: string;
  timestamp?: string;
  payload?: unknown;
}

export type AppServerSidecarSource = 'env' | 'resources' | 'missing';

export interface AppServerHealthCheckResult {
  available: boolean;
  protocolVersion: string;
  source: AppServerSidecarSource;
  binaryPath?: string;
  message?: string;
}

export interface AppServerSmokeResult {
  ok: boolean;
  protocolVersion: string;
  source: AppServerSidecarSource;
  binaryPath?: string;
  capabilityIds?: string[];
  eventTypes?: string[];
  artifactRefs?: string[];
  evidenceEventCount?: number;
  evidenceArtifactCount?: number;
  error?: string;
}

export interface ContentStudioApi {
  authGetSession(): Promise<BuguAuthState>;
  authLoginByPassword(input: BuguPasswordLoginInput): Promise<BuguAuthState>;
  authSendEmailCode(input: BuguEmailCodeSendInput): Promise<BuguEmailCodeSendResult>;
  authVerifyEmailCode(input: BuguEmailCodeVerifyInput): Promise<BuguAuthState>;
  authLogout(): Promise<BuguAuthState>;
  getOemSiteConfig(input?: OemSiteConfigRequest): Promise<OemPublicSiteConfig>;

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
  createSceneCardFromContent(input: CreateSceneCardFromContentInput): Promise<SceneCard>;
  updateSceneCard(input: SceneCard): Promise<SceneCard>;
  listContentKnowledgeMaps(workspacePath: string): Promise<ContentKnowledgeMapRecord[]>;
  listContentKnowledgeMapBuildRuns(workspacePath: string): Promise<ContentKnowledgeMapBuildRunRecord[]>;
  buildContentKnowledgeMap(input: BuildContentKnowledgeMapInput): Promise<ContentKnowledgeMapRecord>;
  updateContentKnowledgeMap(input: ContentKnowledgeMapRecord): Promise<ContentKnowledgeMapRecord>;
  listContentDraftChanges(workspacePath: string): Promise<ContentDraftChange[]>;
  createContentDraftChange(input: CreateContentDraftChangeInput): Promise<ContentWorkspaceSyncResult>;
  submitContentDraftChange(input: SubmitContentDraftChangeInput): Promise<ContentWorkspaceSyncResult>;
  exportContentDraftChange(input: ExportContentDraftChangeInput): Promise<ContentWorkspaceSyncResult>;
  importContentDraftChange(input: ImportContentDraftChangeInput): Promise<ContentWorkspaceSyncResult>;
  listContentKnowledgeReleases(workspacePath: string): Promise<ContentKnowledgeRelease[]>;
  createContentKnowledgeRelease(input: CreateContentKnowledgeReleaseInput): Promise<ContentWorkspaceSyncResult>;
  listContentSyncConflicts(workspacePath: string): Promise<ContentSyncConflict[]>;
  resolveContentSyncConflict(input: ResolveContentSyncConflictInput): Promise<ContentSyncConflict | null>;
  listContentBatches(workspacePath: string): Promise<ContentBatchRecord[]>;
  buildContentBatch(input: BuildContentBatchInput): Promise<ContentBatchRecord>;
  advanceContentBatchStage(input: AdvanceContentBatchStageInput): Promise<ContentBatchRecord>;
  exportContentKnowledgePack(input: ExportContentKnowledgePackInput): Promise<ContentKnowledgePackExportResult>;
  readContentKnowledgePackFile(input: ReadContentKnowledgePackFileInput): Promise<ContentKnowledgePackFilePreview>;
  listContentReviewTasks(workspacePath: string): Promise<ContentReviewTask[]>;
  generateContentReviewTasks(input: GenerateContentReviewTasksInput): Promise<ContentReviewTask[]>;
  submitContentReviewDecision(input: SubmitContentReviewDecisionInput): Promise<ContentReviewTask>;
  createContentProductionHandoff(input: CreateContentProductionHandoffInput): Promise<ContentProductionHandoffResult>;
  writeBackContentMaterialCoverage(input: WriteBackContentMaterialCoverageInput): Promise<ContentMaterialCoverageResult>;

  listInputSources(workspacePath: string): Promise<InputSourceRecord[]>;
  registerInputSource(input: RegisterInputSourceInput): Promise<InputSourceRecord>;
  removeInputSource(workspacePath: string, sourceId: string): Promise<InputSourceRecord | null>;
  importInputSourceFromFile(
    workspacePath: string,
    purpose: InputSourcePurpose,
    options?: ImportInputSourceFromFileOptions,
  ): Promise<InputSourceRecord | null>;

  listPromptDrafts(workspacePath: string): Promise<PromptDraft[]>;
  generatePromptDraft(input: GeneratePromptDraftInput): Promise<PromptDraft>;
  createPromptDraftFromContent(input: CreatePromptDraftFromContentInput): Promise<PromptDraft>;
  createTeamKnowledgePromptDraft(input: CreateTeamKnowledgePromptDraftInput): Promise<PromptDraft>;
  updatePromptDraft(input: UpdatePromptDraftInput): Promise<PromptDraft>;
  recordPromptDraftCopy(input: RecordPromptDraftCopyInput): Promise<PromptDraft>;
  listAgentPromptSessions(workspacePath: string): Promise<AgentPromptSession[]>;
  startAgentPromptSession(input: StartAgentPromptSessionInput): Promise<AgentPromptSessionResult>;
  continueAgentPromptSession(input: ContinueAgentPromptSessionInput): Promise<AgentPromptSessionResult>;
  respondAgentPromptAction(input: RespondAgentPromptActionInput): Promise<AgentPromptSession>;
  attachAgentPromptSessionInputSources(input: AttachAgentPromptSessionInputSourcesInput): Promise<AgentPromptSession>;

  listOverlayCards(workspacePath: string): Promise<OverlayCardRecord[]>;
  generateOverlayCards(input: GenerateOverlayCardsInput): Promise<OverlayCardRecord[]>;
  listAssetReviews(workspacePath: string): Promise<AssetReviewRecord[]>;
  reviewAsset(input: ReviewAssetInput): Promise<AssetReviewRecord>;
  listMixPackages(workspacePath: string): Promise<MixPackageRecord[]>;
  exportMixPackage(input: ExportMixPackageInput): Promise<MixPackageRecord>;
  recordMixPackageImportEvidence(input: RecordMixPackageImportEvidenceInput): Promise<MixPackageRecord>;

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
  evaluateVideoScript(input: VideoScriptEvaluationRequest): Promise<VideoScriptEvaluationResult>;
  rewriteVideoScriptShot(input: VideoScriptShotRewriteRequest): Promise<VideoScriptShotRewriteResult>;
  listImageProductionTasks(workspacePath: string): Promise<ImageProductionTask[]>;
  createImageProductionTask(input: CreateImageProductionTaskInput): Promise<ImageProductionTask>;
  updateImageProductionTask(input: UpdateImageProductionTaskInput): Promise<ImageProductionTask>;
  updateShotPrompt(input: UpdateShotPromptInput): Promise<ImageProductionTask>;
  appendShotGenerationLog(input: AppendShotGenerationLogInput): Promise<ImageProductionTask>;
  generateImage(input: ImageGenerationRequest): Promise<MediaGenerationResult>;
  generateImageSkill(input: GenerateImageSkillInput): Promise<GenerateImageSkillResult>;
  importImageSkillFromFile(): Promise<GenerateImageSkillResult | null>;
  generateVideo(input: VideoGenerationRequest): Promise<MediaGenerationResult>;
  submitGenerationTask(input: SubmitGenerationTaskInput): Promise<GenerationTaskRecord>;
  listGenerationTasks(workspacePath: string): Promise<GenerationTaskRecord[]>;
  onGenerationTaskEvent(callback: (event: GenerationTaskEvent) => void): () => void;
  listGenerationLogs(workspacePath: string): Promise<GenerationLogEntry[]>;
  updateGenerationLogReview(input: UpdateGenerationLogReviewInput): Promise<GenerationLogEntry | null>;

  runTask(input: RunTaskInput): Promise<RunTaskResult>;
  cancelTask(taskId: string): Promise<boolean>;
  onAgentEvent(taskId: string, callback: (event: AgentEvent) => void): () => void;
  getAppServerHealth(): Promise<AppServerHealthCheckResult>;
  runAppServerSmoke(): Promise<AppServerSmokeResult>;
}
