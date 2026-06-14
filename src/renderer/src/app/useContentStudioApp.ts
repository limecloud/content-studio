import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ArticleGenerationResult,
  ArticleGenerationRequest,
  AgentPromptSession,
  AppSettingsView,
  AssetFileKind,
  AssetReworkSource,
  BrandKnowledgeBaseRecord,
  AssetReviewRecord,
  AutoUpdateState,
  BuguAuthState,
  BuguEmailCodeSendInput,
  BuguEmailCodeVerifyInput,
  BuguPasswordLoginInput,
  ContentDraftChange,
  ContentBatchRecord,
  ContentBatchStageId,
  ContentKnowledgeMapBuildRunRecord,
  ContentKnowledgeMapRecord,
  ContentKnowledgePackFilePreview,
  ContentKnowledgePackExportResult,
  ContentKnowledgeRelease,
  ContentKnowledgeReleaseReference,
  ContentMaterialCoverageResult,
  ContentProductionHandoffResult,
  ContentProductionHandoffTarget,
  ContentReviewDecisionAction,
  ContentReviewDecisionPayload,
  ContentReviewTask,
  ContentSyncConflict,
  ContentSyncConflictResolutionAction,
  ContentTeamRole,
  ContentWorkspaceSyncResult,
  GenerationLogEntry,
  GenerationTaskRecord,
  GeneratePromptPackInput,
  GenerateSceneCardsInput,
  GlobalGenerationParams,
  ImageGenerationRequest,
  ImageProductionTask,
  ImageProductionTaskStatus,
  ShotPrompt,
  ShotPromptStatus,
  InputSourcePurpose,
  InputSourceRecord,
  InputSourceSensitivity,
  KnowledgeBaseType,
  KnowledgeBaseView,
  KnowledgeCitation,
  KnowledgeSearchResult,
  KnowledgeSection,
  KnowledgeSectionType,
  CreateSkillInput,
  LoadedSkill,
  MediaGenerationResult,
  MixPackageAssetInput,
  MixPackageRecord,
  ModelCatalogView,
  ModelConfigView,
  AttachAgentPromptSessionInputSourcesInput,
  GenerateBrandKnowledgeBaseInput,
  GenerateIpKnowledgeBaseInput,
  IpKnowledgeBaseRecord,
  OverlayCardDraft,
  OverlayCardRecord,
  PlatformDraftRecord,
  PromptDraft,
  PromptDraftPurpose,
  PromptPack,
  RecordMixPackageImportEvidenceInput,
  RespondAgentPromptActionInput,
  ReferenceReverseResult,
  ReviewAssetInput,
  SceneCard,
  SkillRef,
  SkillSelectionView,
  SubmitGenerationTaskInput,
  UpdateGenerationLogReviewInput,
  VideoCostEstimate,
  VideoBreakdownResult,
  VideoBreakdownRequest,
  VideoGenerationRequest,
  VideoScriptEvaluationRequest,
  VideoScriptGenerationResult,
  VideoScriptGenerationRequest,
  VideoScriptShotRewriteRequest,
  VideoScriptShotRewriteResult,
  WorkflowRunRecord,
} from "../../../shared/types";
import { buildContentSyncConflictMergeDraft } from "../../../shared/contentSyncConflictMerge";
import { stripInternalTraceLinesFromPrompt } from "../../../shared/promptTraceText";
import { isAgentInputSourceRecoverySession } from "../components/agent/agentRuntimeProjection";
import { cleanAgentAssetRefs, planAgentAssetInputSourceRegistrations } from "./agentAssetInputSources";
import { DEFAULT_PARAMS, VIDEO_DIMENSIONS } from "./constants";
import { platformColorThemeToContentStudio } from "./platformAppearance";
import {
  citationFromResult,
  citationFromInputSource,
  citationFromSection,
  extractLocalRefsFromLog,
  extractGeneratedAssetRefsFromLog,
  extractPromptFromLog,
  fileNameFromPath,
  imageRequestFromLog,
  isSameCitation,
  knowledgeBaseKey,
  skillKey,
  statusLabel,
} from "./formatters";
import { buildScenePromptGroupContent } from "./scenePromptComposer";
import { isFinishedVideoSource } from "./videoPromptFlow";
import {
  buildCharacterPromptItems,
  buildScenePromptItems,
  buildVideoProductionDeliveryItems,
  buildVideoProductionReviewItems,
} from "./videoProductionPrompts";
import { buildProductionSegments } from "./videoProductionSegments";
import type {
  ColorTheme,
  ModelDraft,
  ModelSettingView,
  ModuleKey,
  ProviderTab,
  SettingsPageKey,
} from "./types";

class ActionCancelledError extends Error {
  constructor() {
    super("ACTION_CANCELLED");
  }
}

const INITIAL_UPDATE_STATE: AutoUpdateState = {
  enabled: true,
  status: "idle",
  currentVersion: "0.0.0",
  hasUpdate: false,
};

function imageModelFromConfig(
  currentModel: string,
  imageModels: string[],
): string {
  const normalized = imageModels.map((model) => model.trim()).filter(Boolean);
  if (currentModel && normalized.includes(currentModel)) return currentModel;
  return normalized[0] ?? currentModel;
}

function modelFromOptions(
  currentModel: string,
  models: string[],
): string {
  const normalized = uniqueModelNames(models);
  if (currentModel && normalized.includes(currentModel)) return currentModel;
  return normalized[0] ?? currentModel;
}

function platformModelFromOptions(
  currentModel: string,
  models: string[],
  preferredModel?: string,
  previousDefaultModel?: string,
): string {
  const normalized = uniqueModelNames(models);
  const current = currentModel.trim();
  const preferred = preferredModel?.trim() ?? "";
  const previousDefault = previousDefaultModel?.trim() ?? "";
  if (current && normalized.includes(current) && previousDefault && current !== previousDefault) return current;
  if (preferred && normalized.includes(preferred)) return preferred;
  if (current && normalized.includes(current)) return current;
  return normalized[0] ?? "";
}

function requestedModelFromOptions(model: string | undefined, models: string[]): string | undefined {
  const requested = model?.trim();
  const normalized = uniqueModelNames(models);
  return requested && normalized.includes(requested) ? requested : undefined;
}

function uniqueModelNames(models: string[]): string[] {
  return Array.from(
    new Set(models.map((model) => model.trim()).filter(Boolean)),
  );
}

function compactModelNames(models: Array<string | undefined>): string[] {
  return uniqueModelNames(models.filter((model): model is string => Boolean(model)));
}

function createPendingAgentPromptSession(input: {
  workspacePath: string;
  title?: string;
  purpose: PromptDraftPurpose;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
  selectedSkills?: SkillRef[];
  selectedSkillSlugs?: string[];
  textModel?: string;
}): AgentPromptSession {
  const now = new Date().toISOString();
  const id = `pending-agent-${Date.now()}`;
  return {
    id,
    workspacePath: input.workspacePath,
    title: input.title?.trim() || "AI Agent 正在处理",
    purpose: input.purpose,
    status: "active",
    userIntent: input.userIntent.trim(),
    inputSourceIds: input.inputSourceIds,
    sceneCardIds: input.sceneCardIds ?? [],
    selectedSkills: input.selectedSkills,
    selectedSkillSlugs: input.selectedSkillSlugs,
    promptDraftIds: [],
    sourceSnapshots: [],
    messages: [
      {
        id: `${id}:user`,
        role: "user",
        kind: "intent",
        content: input.userIntent.trim(),
        createdAt: now,
      },
      {
        id: `${id}:assistant`,
        role: "assistant",
        kind: "note",
        content: "正在连接 Lime Desktop Platform 并生成回复。",
        model: input.textModel,
        createdAt: now,
      },
    ],
    executionEvents: [
      {
        id: `${id}:submitted`,
        kind: "state",
        status: "running",
        eventClass: "turn.submitted",
        owner: "runtime",
        sequence: 1,
        runtimeId: "content-studio-agent-prompt-runtime",
        threadId: id,
        phase: "submitted",
        title: "请求已提交",
        detail: "正在等待平台运行结果。",
        model: input.textModel,
        createdAt: now,
      },
    ],
    model: input.textModel,
    createdAt: now,
    updatedAt: now,
  };
}

function upsertAgentPromptSession(
  sessions: AgentPromptSession[],
  nextSession: AgentPromptSession,
  replaceId?: string,
): AgentPromptSession[] {
  return [
    nextSession,
    ...sessions.filter((session) => (
      session.id !== nextSession.id &&
      (!replaceId || session.id !== replaceId)
    )),
  ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function paramsForImageGeneration(
  current: GlobalGenerationParams,
  imageModel?: string,
): GlobalGenerationParams {
  const nextImageModel = imageModel?.trim() || current.imageModel;
  return nextImageModel === current.imageModel
    ? current
    : { ...current, imageModel: nextImageModel };
}

interface ActionContext {
  isCancelled: () => boolean;
  throwIfCancelled: () => void;
}

type PromptDraftCreateRequest = {
  title?: string;
  purpose: PromptDraftPurpose;
  userIntent: string;
  inputSourceIds: string[];
  productImageRefs?: string[];
  referenceImageRefs?: string[];
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
  sceneCardIds?: string[];
  selectedSkills?: SkillRef[];
  selectedSkillSlugs?: string[];
  textModel?: string;
  temporarySourceText?: string;
  temporarySourceTitle?: string;
};

function contentTeamRoleFromAuthRoles(roles?: string[]): ContentTeamRole | undefined {
  const normalized = new Set((roles ?? []).map((role) => role.trim().toLowerCase()).filter(Boolean));
  if (
    normalized.has('owner') ||
    normalized.has('admin') ||
    normalized.has('bugu_admin') ||
    normalized.has('tenant_admin') ||
    normalized.has('content-lead')
  ) return 'owner';
  if (normalized.has('content-engineer') || normalized.has('content_engineer') || normalized.has('editor')) return 'content-engineer';
  if (normalized.has('reviewer')) return 'reviewer';
  if (normalized.has('operator')) return 'operator';
  if (normalized.has('viewer') || normalized.has('member')) return 'viewer';
  return undefined;
}

type ReworkAssetRequest = {
  kind: "image" | "video" | "overlay";
  assetKey?: string;
  path: string;
  title?: string;
  sourceType: "generation-log" | "input-source" | "overlay-card" | "manual";
  sourceId?: string;
  promptDraftId?: string;
  promptText?: string;
  sceneCardIds?: string[];
  workflowRunId?: string;
};

type PreferredKnowledgeSource =
  | { kind: "brand"; id: string }
  | { kind: "ip"; id: string }
  | null;

type ShowcaseImageHandoffInput = {
  prompt: string;
  productImageRefs?: string[];
  referenceImageRefs?: string[];
  productImageLabel?: string;
  referenceImageLabel?: string;
  featureId?: string;
  featureTitle?: string;
  imageModel?: string;
};

type ReferenceReverseGenerateInput = {
  referenceSourceIds: string[];
  productSourceIds: string[];
  userIntent: string;
  platform?: string;
  targetFormat?: GlobalGenerationParams["aspectRatio"];
  outputUsage?: "xiaohongshu-seeding" | "ecommerce-detail" | "social-post" | "generic";
};

type ShowcaseVideoHandoffInput = {
  prompt: string;
  imageAssetRefs?: string[];
  videoAssetRefs?: string[];
  audioAssetRefs?: string[];
  featureId?: string;
  featureTitle?: string;
  durationSeconds?: number;
  aspectRatio?: GlobalGenerationParams["aspectRatio"];
  resolution?: string;
  storyboardCount?: number;
  quality?: string;
  selectedCaseTitle?: string;
};

type MediaGenerationTaskInput =
  | Extract<SubmitGenerationTaskInput, { kind: "image" }>
  | Extract<SubmitGenerationTaskInput, { kind: "video" }>;

type MediaGenerationSubmission =
  | { type: "task"; task: GenerationTaskRecord }
  | { type: "fallback"; result: MediaGenerationResult };

const cleanPathList = cleanAgentAssetRefs;

function imageLogStage(log: GenerationLogEntry): ImageGenerationRequest["generationStage"] | undefined {
  const input = imageRequestFromLog(log);
  return input?.generationStage;
}

function imageLogProductionIds(log: GenerationLogEntry): { taskId?: string; shotPromptId?: string } {
  const input = imageRequestFromLog(log);
  return {
    taskId: input?.productionTaskId,
    shotPromptId: input?.shotPromptId,
  };
}

function nextShotStatusFromLog(log: GenerationLogEntry): ShotPromptStatus | undefined {
  const stage = imageLogStage(log);
  if (!stage) return undefined;
  if (log.status === "succeeded") return stage === "test" ? "test-review" : "batch-review";
  if (log.status === "blocked") return "blocked";
  if (log.status === "failed") return "needs-rework";
  return undefined;
}

function imageRefsFromGenerationLog(log: GenerationLogEntry): string[] {
  const output = log.output && typeof log.output === "object"
    ? log.output as Record<string, unknown>
    : {};
  const outputRefs = Array.isArray(output.assetRefs)
    ? output.assetRefs.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
  return outputRefs.length ? outputRefs : log.artifactRefs ?? [];
}

function generatedAssetKey(logId: string, assetRef: string, index: number): string {
  return `generated:${logId}:${index}:${assetRef}`;
}

function shotPromptSeedsFromText(text: string, fallbackPrompt: string): Array<{
  title: string;
  scene: string;
  prompt: string;
  negativePrompt?: string;
  status: ShotPromptStatus;
}> {
  const normalized = text.trim();
  const lines = normalized
    .split(/\n+/)
    .map((line) => line.replace(/^\s*(?:镜头|shot)?\s*\d+[\s.、:：-]*/i, "").trim())
    .filter((line) => line.length >= 8);
  const candidates = lines.length >= 2
    ? lines
    : normalized
      .split(/[；;]/)
      .map((line) => line.trim())
      .filter((line) => line.length >= 12);
  const prompts = (candidates.length >= 2 ? candidates : [fallbackPrompt || normalized || "当前画面需求"])
    .slice(0, 12);
  return prompts.map((prompt, index) => ({
    title: `镜头 ${String(index + 1).padStart(2, "0")}`,
    scene: prompt.slice(0, 48),
    prompt,
    negativePrompt: "不改变产品结构、包装文字和主体比例，不生成医疗化或夸大表达。",
    status: prompt.trim() ? "ready" : "draft",
  }));
}

function isMissingGenerationTaskHandler(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("No handler registered for 'generationTasks:submit'") ||
    message.includes('No handler registered for "generationTasks:submit"')
  );
}

function userFacingActionError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    /platformHost:openModelSettings/i.test(message) ||
    /未检测到 lime-desktop-platform runtime bridge/i.test(message)
  ) {
    return "当前窗口未连接平台设置中心，请从平台客户端打开内容工厂后再进入完整模型设置。";
  }
  if (/Error invoking remote method/i.test(message)) {
    return "当前操作未能连接到桌面服务，请稍后重试或重新打开应用。";
  }
  return message || "当前任务处理失败，请稍后重试。";
}

function videoCostEstimateFromOutput(output: Record<string, unknown>): VideoCostEstimate | undefined {
  const value = output.costEstimate;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (
    typeof record.currency !== "string" ||
    record.unit !== "second" ||
    typeof record.durationSeconds !== "number" ||
    typeof record.unitPrice !== "number" ||
    typeof record.estimatedCost !== "number" ||
    (record.source !== "provider-response" && record.source !== "env" && record.source !== "default-internal-api")
  ) {
    return undefined;
  }
  return {
    currency: record.currency,
    durationSeconds: record.durationSeconds,
    unit: "second",
    unitPrice: record.unitPrice,
    estimatedCost: record.estimatedCost,
    source: record.source,
  };
}

function skillSlugFromTitle(title: string): string {
  const normalized = title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9._\s-]/g, " ")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[^a-z0-9]+|[^a-z0-9._-]+$/g, "")
    .slice(0, 48);
  return normalized || "prompt-skill";
}

function uniqueSkillSlug(baseSlug: string, existingSkills: LoadedSkill[]): string {
  const used = new Set(existingSkills.map((skill) => skill.slug));
  if (!used.has(baseSlug)) return baseSlug;
  for (let index = 2; index < 100; index += 1) {
    const candidate = `${baseSlug}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${baseSlug}-${Date.now()}`;
}

function buildSkillInstructionsFromPromptDraft(draft: PromptDraft, content: string): string {
  return [
    '请在当前内容工厂中作为可复用能力使用，优先服务当前客户端的知识库、Prompt、图片素材、视频素材和混剪包流程。',
    '',
    '### 来源',
    `- 来源提示词草稿：${draft.title}`,
    `- 下游用途：${draft.purpose}`,
    `- 用户意图：${draft.userIntent}`,
    draft.inputSourceIds.length ? `- 输入资料：已关联 ${draft.inputSourceIds.length} 份` : '- 输入资料：未绑定',
    draft.sceneCardIds?.length ? `- 场景卡：已关联 ${draft.sceneCardIds.length} 张` : '- 场景卡：未绑定',
    draft.teamKnowledgeRelease ? `- 团队知识包：${draft.teamKnowledgeRelease.title} ${draft.teamKnowledgeRelease.version}` : '- 团队知识包：未绑定',
    '',
    '### 执行规范',
    content.trim(),
    '',
    '### 输出约束',
    '- 只使用用户提供的知识库、输入源、素材和明确意图，不编造功效、案例、背书或平台数据。',
    '- 输出要能被下游模块直接复制或继续编辑，并保留需要人工确认的缺口。',
    '- 如果输入信息不足，先列出必须追问的问题，不伪造完整结果。',
  ].join('\n');
}

function mergePathList(paths: string[], current: string[], limit: number): string[] {
  return Array.from(new Set([...paths, ...current])).slice(0, limit);
}

function citationKey(citation: KnowledgeCitation): string {
  return `${citation.knowledgeBaseId}:${citation.sectionId}`;
}

function sameCitationSet(left: KnowledgeCitation[], right: KnowledgeCitation[]): boolean {
  if (left.length !== right.length) return false;
  const rightKeys = new Set(right.map(citationKey));
  return left.every((citation) => rightKeys.has(citationKey(citation)));
}

function promptPurposeForIpScenario(scene: string): PromptDraftPurpose {
  return /口播|视频|直播|短视频/i.test(scene) ? "video" : "article";
}

function promptWorkbenchModuleForPurpose(purpose: PromptDraftPurpose): ModuleKey {
  if (purpose === "video") return "video-creative";
  if (purpose === "green-screen") return "image-green-screen";
  return "agents";
}

function activeModuleForUserPath(module: ModuleKey): ModuleKey {
  if (module === "assets-prompt-workbench") return "agents";
  if (module === "assets-history") return "assets";
  return module;
}

function videoSubtitleModeLabel(value: string): string {
  if (value === "caption-file") return "输出字幕文件";
  if (value === "no-subtitle") return "无字幕";
  return "内嵌字幕";
}

function formatBreakdownRate(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "未返回";
  return `${Math.round(value * 100)}%`;
}

function formatBreakdownScore(value?: number): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "未返回";
  return value.toFixed(1);
}

function brandKnowledgeBaseCitations(record?: BrandKnowledgeBaseRecord): KnowledgeCitation[] {
  if (!record) return [];
  const knowledgeBaseId = `brand-kb:${record.id}`;
  const facts = record.productFacts.join("\n");
  const sellingPoints = record.coreSellingPoints.join("\n");
  const compliance = record.complianceBoundaries.join("\n");
  const scenes = record.sceneSeeds.join("\n");
  const promptFragments = record.promptFragments.join("\n");
  const citations: KnowledgeCitation[] = [
    {
      knowledgeBaseId,
      sectionId: "brand-voice",
      title: `${record.title} / 品牌口吻`,
      sectionType: "brand",
      excerpt: [record.brandVoice, record.audience].filter(Boolean).join("\n"),
    },
    {
      knowledgeBaseId,
      sectionId: "product-facts",
      title: `${record.title} / 产品事实`,
      sectionType: "product",
      excerpt: facts,
    },
    {
      knowledgeBaseId,
      sectionId: "selling-points",
      title: `${record.title} / 核心卖点`,
      sectionType: "selling-point",
      excerpt: sellingPoints,
    },
    {
      knowledgeBaseId,
      sectionId: "compliance",
      title: `${record.title} / 合规边界`,
      sectionType: "compliance",
      excerpt: compliance,
    },
    {
      knowledgeBaseId,
      sectionId: "scene-seeds",
      title: `${record.title} / 场景种子`,
      sectionType: "scenario-script",
      excerpt: [scenes, promptFragments].filter(Boolean).join("\n"),
    },
  ];
  return citations.filter((citation) => citation.excerpt.trim().length > 0);
}

function ipKnowledgeBaseCitations(record?: IpKnowledgeBaseRecord): KnowledgeCitation[] {
  if (!record) return [];
  const knowledgeBaseId = `ip-kb:${record.id}`;
  const citations: KnowledgeCitation[] = [
    {
      knowledgeBaseId,
      sectionId: "identity",
      title: `${record.title} / 身份锚定`,
      sectionType: "profile",
      excerpt: record.layers.identity,
    },
    {
      knowledgeBaseId,
      sectionId: "values",
      title: `${record.title} / 价值观立场`,
      sectionType: "methodology",
      excerpt: record.layers.values,
    },
    {
      knowledgeBaseId,
      sectionId: "language",
      title: `${record.title} / 声音语言`,
      sectionType: "voice-style",
      excerpt: record.layers.language,
    },
    {
      knowledgeBaseId,
      sectionId: "methodology",
      title: `${record.title} / 判断方法`,
      sectionType: "methodology",
      excerpt: record.layers.methodology,
    },
    {
      knowledgeBaseId,
      sectionId: "materials",
      title: `${record.title} / 内容素材`,
      sectionType: "story",
      excerpt: record.layers.materials,
    },
    {
      knowledgeBaseId,
      sectionId: "extension-scenes",
      title: `${record.title} / 场景延伸`,
      sectionType: "scenario-script",
      excerpt: [record.layers.engine, record.extensionScenes.join("\n")].filter(Boolean).join("\n"),
    },
  ];
  return citations.filter((citation) => citation.excerpt.trim().length > 0);
}

export function useContentStudioApp() {
  const [themeMode, setThemeMode] = useState<"light" | "dark" | "system">(
    "light",
  );
  const [colorTheme, setColorTheme] = useState<ColorTheme>("emerald");
  const [fontScale, setFontScale] = useState(1);
  const [serifEnabled, setSerifEnabled] = useState(false);
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(
    "light",
  );
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPageKey>("general");
  const [modelSettingView, setModelSettingView] =
    useState<ModelSettingView>("edit_text_http");
  const [providerTab, setProviderTab] = useState<ProviderTab>("recommended");
  const [responsesApiActive, setResponsesApiActive] = useState(false);

  const [activeModule, setActiveModuleState] = useState<ModuleKey>("agents");
  const setActiveModule = (module: ModuleKey) => setActiveModuleState(activeModuleForUserPath(module));
  const [settings, setSettings] = useState<AppSettingsView | null>(null);
  const [authState, setAuthState] = useState<BuguAuthState | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [updateState, setUpdateState] =
    useState<AutoUpdateState>(INITIAL_UPDATE_STATE);
  const [modelConfig, setModelConfig] = useState<ModelConfigView | null>(null);
  const [modelCatalog, setModelCatalog] = useState<ModelCatalogView | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelDraft>({
    apiEndpoint: "",
    apiKey: "",
    textProtocol: "openai-chat",
    imageApiEndpoint: "",
    imageApiKey: "",
    imageProtocol: "openai-responses",
    imageOuterModel: "",
    textModel: "",
    textModels: "",
    imageModels: "",
    videoApiEndpoint: "",
    videoApiKey: "",
    videoModel: "",
    videoModels: "",
  });
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [skills, setSkills] = useState<LoadedSkill[]>([]);
  const [skillSelection, setSkillSelection] =
    useState<SkillSelectionView | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseView[]>([]);
  const [brandKnowledgeBases, setBrandKnowledgeBases] = useState<BrandKnowledgeBaseRecord[]>([]);
  const [ipKnowledgeBases, setIpKnowledgeBases] = useState<IpKnowledgeBaseRecord[]>([]);
  const [contentKnowledgeMaps, setContentKnowledgeMaps] = useState<ContentKnowledgeMapRecord[]>([]);
  const [contentKnowledgeMapBuildRuns, setContentKnowledgeMapBuildRuns] = useState<ContentKnowledgeMapBuildRunRecord[]>([]);
  const [contentDraftChanges, setContentDraftChanges] = useState<ContentDraftChange[]>([]);
  const [contentKnowledgeReleases, setContentKnowledgeReleases] = useState<ContentKnowledgeRelease[]>([]);
  const [contentSyncConflicts, setContentSyncConflicts] = useState<ContentSyncConflict[]>([]);
  const [contentWorkspaceSyncResult, setContentWorkspaceSyncResult] = useState<ContentWorkspaceSyncResult | null>(null);
  const [contentBatches, setContentBatches] = useState<ContentBatchRecord[]>([]);
  const [contentKnowledgePackExport, setContentKnowledgePackExport] = useState<ContentKnowledgePackExportResult | null>(null);
  const [contentKnowledgePackFilePreview, setContentKnowledgePackFilePreview] = useState<ContentKnowledgePackFilePreview | null>(null);
  const [contentProductionHandoff, setContentProductionHandoff] = useState<ContentProductionHandoffResult | null>(null);
  const [contentMaterialCoverage, setContentMaterialCoverage] = useState<ContentMaterialCoverageResult | null>(null);
  const [contentReviewTasks, setContentReviewTasks] = useState<ContentReviewTask[]>([]);
  const [inputSources, setInputSources] = useState<InputSourceRecord[]>([]);
  const [promptDrafts, setPromptDrafts] = useState<PromptDraft[]>([]);
  const [activePromptDraftId, setActivePromptDraftId] = useState("");
  const [agentPromptSessions, setAgentPromptSessions] = useState<AgentPromptSession[]>([]);
  const [activeAgentPromptSessionId, setActiveAgentPromptSessionId] = useState("");
  const [knowledgeQuery, setKnowledgeQuery] = useState("卖点 合规 场景");
  const [knowledgeBaseFilter, setKnowledgeBaseFilter] = useState<
    KnowledgeBaseType | "all"
  >("all");
  const [knowledgeSectionFilter, setKnowledgeSectionFilter] = useState<
    KnowledgeSectionType | "all"
  >("all");
  const [knowledgeTagFilter, setKnowledgeTagFilter] = useState("");
  const [activeKnowledgeBaseKey, setActiveKnowledgeBaseKey] = useState("");
  const [activeBrandKnowledgeBaseId, setActiveBrandKnowledgeBaseId] = useState("");
  const [activeIpKnowledgeBaseId, setActiveIpKnowledgeBaseId] = useState("");
  const [activeContentKnowledgeMapId, setActiveContentKnowledgeMapId] = useState("");
  const [activeContentReviewTaskId, setActiveContentReviewTaskId] = useState("");
  const [preferredKnowledgeSource, setPreferredKnowledgeSource] =
    useState<PreferredKnowledgeSource>(null);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>(
    [],
  );
  const [selectedCitations, setSelectedCitations] = useState<
    KnowledgeCitation[]
  >([]);
  const [promptPacks, setPromptPacks] = useState<PromptPack[]>([]);
  const [activePromptPackId, setActivePromptPackId] = useState("");
  const [promptPackDraft, setPromptPackDraft] = useState({
    brandVoice: "",
    visualStyle: "",
  });
  const [sceneCards, setSceneCards] = useState<SceneCard[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [sceneCardDraft, setSceneCardDraft] = useState({
    title: "",
    imageMaterialSuggestion: "",
    videoMaterialSuggestion: "",
  });
  const [logs, setLogs] = useState<GenerationLogEntry[]>([]);
  const [generationTasks, setGenerationTasks] = useState<GenerationTaskRecord[]>([]);
  const [imageProductionTasks, setImageProductionTasks] = useState<ImageProductionTask[]>([]);
  const [activeImageProductionTaskId, setActiveImageProductionTaskId] = useState("");
  const [overlayCards, setOverlayCards] = useState<OverlayCardRecord[]>([]);
  const [assetReviews, setAssetReviews] = useState<AssetReviewRecord[]>([]);
  const [mixPackages, setMixPackages] = useState<MixPackageRecord[]>([]);
  const [platformDrafts, setPlatformDrafts] = useState<PlatformDraftRecord[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunRecord[]>([]);
  const [activeWorkflowRunId, setActiveWorkflowRunId] = useState("");
  const [referenceReverseResult, setReferenceReverseResult] =
    useState<ReferenceReverseResult | null>(null);
  const [referenceReverseError, setReferenceReverseError] = useState<string | null>(null);
  const [params, setParams] = useState<GlobalGenerationParams>(DEFAULT_PARAMS);
  const [productImageRefs, setProductImageRefs] = useState<string[]>([]);
  const [referenceImageRefs, setReferenceImageRefs] = useState<string[]>([]);
  const [imageProductLabel, setImageProductLabel] = useState("产品图");
  const [imageReferenceLabel, setImageReferenceLabel] = useState("参考图");
  const [videoAssetRefs, setVideoAssetRefs] = useState<string[]>([]);
  const [audioAssetRefs, setAudioAssetRefs] = useState<string[]>([]);
  const [imagePromptDraft, setImagePromptDraft] = useState("");
  const [imagePromptMode, setImagePromptMode] =
    useState<ImageGenerationRequest["promptMode"]>("free");
  const [imageGenerationMode, setImageGenerationMode] =
    useState<ImageGenerationRequest["generationMode"]>("smart");
  const [imageTemplate, setImageTemplate] = useState("电商白底主图");
  const [imageTemplateInputs, setImageTemplateInputs] = useState<
    Record<string, string | string[]>
  >({});
  const [imageWatermark, setImageWatermark] = useState(false);
  const [imageReworkSource, setImageReworkSource] =
    useState<AssetReworkSource | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [selectedVideoDimensions, setSelectedVideoDimensions] =
    useState<string[]>(VIDEO_DIMENSIONS);
  const [videoBreakdown, setVideoBreakdown] =
    useState<VideoBreakdownResult | null>(null);
  const [videoScript, setVideoScript] =
    useState<VideoScriptGenerationResult | null>(null);
  const [videoProductName, setVideoProductName] = useState("新产品");
  const [videoSceneBackground, setVideoSceneBackground] =
    useState("电商真实使用场景");
  const [videoSubtitleMode, setVideoSubtitleMode] = useState("burned-subtitle");
  const [videoVoiceStyle, setVideoVoiceStyle] = useState("自然可信");
  const [videoShotCount, setVideoShotCount] = useState(5);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(18);
  const [videoCustomRequirement, setVideoCustomRequirement] = useState(
    "保留爆款结构，但所有卖点回到知识库事实源。",
  );
  const [articleType, setArticleType] =
    useState<ArticleGenerationRequest["articleType"]>("wechat-longform");
  const [articlePlatform, setArticlePlatform] = useState("公众号");
  const [articleLength, setArticleLength] =
    useState<ArticleGenerationRequest["length"]>("medium");
  const [articleTopic, setArticleTopic] = useState("成型知识库驱动的内容工程");
  const [articleAudience, setArticleAudience] =
    useState("关注产品真实价值和使用场景的用户");
  const [articleTone, setArticleTone] = useState("专业、自然、克制");
  const [articleRequirement, setArticleRequirement] = useState(
    "先做人话策略，再给事实引用，最后承接图片和视频素材生成。",
  );
  const [articleResult, setArticleResult] =
    useState<ArticleGenerationResult | null>(null);
  const [articleExportPath, setArticleExportPath] = useState<string | null>(
    null,
  );
  const [articleWorkflowRunId, setArticleWorkflowRunId] = useState("");
  const [imageWorkflowRunId, setImageWorkflowRunId] = useState("");
  const [mediaResult, setMediaResult] = useState<MediaGenerationResult | null>(
    null,
  );
  const [historyFilter, setHistoryFilter] = useState<
    GenerationLogEntry["kind"] | "all"
  >("all");
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [copiedPlatformDraftId, setCopiedPlatformDraftId] = useState<string | null>(null);
  const [activeSkillKey, setActiveSkillKey] = useState("");
  const [copiedSkillKey, setCopiedSkillKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentActionLabel, setCurrentActionLabel] = useState<string | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const actionRunIdRef = useRef(0);
  const cancelledRunIdsRef = useRef(new Set<number>());
  const recordedImageTaskLogIdsRef = useRef(new Set<string>());
  const workflowRunsRef = useRef<WorkflowRunRecord[]>([]);

  const workspacePath = settings?.workspacePath;
  const enabledSkillKeys = useMemo(
    () => new Set((skillSelection?.enabledSkills ?? []).map(skillKey)),
    [skillSelection],
  );
  const activePromptPack = useMemo(
    () =>
      promptPacks.find((pack) => pack.id === activePromptPackId) ??
      promptPacks[0],
    [activePromptPackId, promptPacks],
  );
  const activeKnowledgeBase = useMemo(
    () =>
      knowledgeBases.find(
        (base) => knowledgeBaseKey(base) === activeKnowledgeBaseKey,
      ) ?? knowledgeBases[0],
    [activeKnowledgeBaseKey, knowledgeBases],
  );
  const availableKnowledgeTags = useMemo(
    () =>
      Array.from(
        new Set(
          knowledgeBases.flatMap((base) => [
            ...base.tags,
            ...base.sections.flatMap((section) => section.tags),
          ]),
        ),
      ).slice(0, 24),
    [knowledgeBases],
  );
  const activeSkill = useMemo(
    () =>
      skills.find((skill) => skillKey(skill) === activeSkillKey) ?? skills[0],
    [activeSkillKey, skills],
  );
  const activeScenes = useMemo(
    () => sceneCards.filter((card) => selectedSceneIds.includes(card.id)),
    [sceneCards, selectedSceneIds],
  );
  const activeWorkflowRun = useMemo(
    () =>
      workflowRuns.find((run) => run.id === activeWorkflowRunId) ??
      workflowRuns[0],
    [activeWorkflowRunId, workflowRuns],
  );
  const activePromptDraft = useMemo(
    () =>
      promptDrafts.find((draft) => draft.id === activePromptDraftId) ??
      promptDrafts[0],
    [activePromptDraftId, promptDrafts],
  );
  const activeAgentPromptSession = useMemo(
    () =>
      agentPromptSessions.find((session) => session.id === activeAgentPromptSessionId) ??
      agentPromptSessions.find((session) => activePromptDraft?.id && session.promptDraftIds.includes(activePromptDraft.id)) ??
      agentPromptSessions[0],
    [activeAgentPromptSessionId, activePromptDraft?.id, agentPromptSessions],
  );
  const activeBrandKnowledgeBase = useMemo(
    () =>
      brandKnowledgeBases.find((record) => record.id === activeBrandKnowledgeBaseId) ??
      brandKnowledgeBases[0],
    [activeBrandKnowledgeBaseId, brandKnowledgeBases],
  );
  const activeIpKnowledgeBase = useMemo(
    () =>
      ipKnowledgeBases.find((record) => record.id === activeIpKnowledgeBaseId) ??
      ipKnowledgeBases[0],
    [activeIpKnowledgeBaseId, ipKnowledgeBases],
  );
  const activeContentKnowledgeMap = useMemo(
    () =>
      contentKnowledgeMaps.find((record) => record.id === activeContentKnowledgeMapId) ??
      contentKnowledgeMaps[0],
    [activeContentKnowledgeMapId, contentKnowledgeMaps],
  );
  const activeContentBatch = useMemo(() => contentBatches[0], [contentBatches]);
  const activeContentReviewTask = useMemo(
    () =>
      contentReviewTasks.find((task) => task.id === activeContentReviewTaskId) ??
      contentReviewTasks[0],
    [activeContentReviewTaskId, contentReviewTasks],
  );
  const preferredKnowledgeSourceCitations = useMemo(() => {
    if (preferredKnowledgeSource?.kind === "brand") {
      return brandKnowledgeBaseCitations(
        brandKnowledgeBases.find((record) => record.id === preferredKnowledgeSource.id) ??
          activeBrandKnowledgeBase,
      );
    }
    if (preferredKnowledgeSource?.kind === "ip") {
      return ipKnowledgeBaseCitations(
        ipKnowledgeBases.find((record) => record.id === preferredKnowledgeSource.id) ??
          activeIpKnowledgeBase,
      );
    }
    return [];
  }, [
    activeBrandKnowledgeBase,
    activeIpKnowledgeBase,
    brandKnowledgeBases,
    ipKnowledgeBases,
    preferredKnowledgeSource,
  ]);
  const activeEditableScene = activeScenes[0] ?? sceneCards[0];
  const selectedSceneIdsForRequest = activeScenes.map((scene) => scene.id);
  const activeImageProductionTask = useMemo(
    () =>
      imageProductionTasks.find((task) => task.id === activeImageProductionTaskId) ??
      imageProductionTasks[0],
    [activeImageProductionTaskId, imageProductionTasks],
  );
  const defaultKnowledgeCitations = useMemo(() => {
    if (!activeKnowledgeBase) return [];
    const preferredTypes: KnowledgeSectionType[] =
      activeKnowledgeBase.baseType === "personal-ip-kb"
        ? ["profile", "methodology", "voice-style", "boundary", "story", "quote"]
        : ["product", "selling-point", "compliance", "scenario-script", "brand", "spec"];
    const preferred = activeKnowledgeBase.sections.filter((section) =>
      preferredTypes.includes(section.sectionType),
    );
    const fallback = activeKnowledgeBase.sections.filter(
      (section) => !preferredTypes.includes(section.sectionType),
    );
    return [...preferred, ...fallback]
      .slice(0, 6)
      .map((section) => citationFromSection(activeKnowledgeBase, section));
  }, [activeKnowledgeBase]);
  const inputSourceCitations = useMemo(
    () =>
      inputSources
        .filter(
          (source) =>
            source.status === "converted" &&
            ["brand-kb", "ip-kb", "product-brief", "user-feedback", "task-input", "sop-input"].includes(source.purpose),
        )
        .slice(0, 6)
        .map(citationFromInputSource),
    [inputSources],
  );
  const brandInputSourceCitations = useMemo(
    () =>
      inputSources
        .filter(
          (source) =>
            source.status === "converted" &&
            ["brand-kb", "product-brief", "user-feedback", "task-input", "sop-input"].includes(source.purpose),
        )
        .slice(0, 8)
        .map(citationFromInputSource),
    [inputSources],
  );
  const ipInputSourceCitations = useMemo(
    () =>
      inputSources
        .filter(
          (source) =>
            source.status === "converted" &&
            ["ip-kb", "task-input", "sop-input"].includes(source.purpose),
        )
        .slice(0, 8)
        .map(citationFromInputSource),
    [inputSources],
  );
  const citationsForRequest = selectedCitations.length
    ? selectedCitations
    : preferredKnowledgeSourceCitations.length
      ? preferredKnowledgeSourceCitations
    : searchResults.length
      ? searchResults.slice(0, 3).map(citationFromResult)
      : defaultKnowledgeCitations.length
        ? defaultKnowledgeCitations
        : inputSourceCitations;
  const brandCitationsForRequest = selectedCitations.length
    ? selectedCitations
    : preferredKnowledgeSource?.kind === "brand" && preferredKnowledgeSourceCitations.length
      ? preferredKnowledgeSourceCitations
      : brandInputSourceCitations.length
        ? brandInputSourceCitations
        : citationsForRequest;
  const ipCitationsForRequest = selectedCitations.length
    ? selectedCitations
    : preferredKnowledgeSource?.kind === "ip" && preferredKnowledgeSourceCitations.length
      ? preferredKnowledgeSourceCitations
      : ipInputSourceCitations.length
        ? ipInputSourceCitations
        : citationsForRequest;
  const filteredLogs = useMemo(
    () =>
      historyFilter === "all"
        ? logs
        : logs.filter((log) => log.kind === historyFilter),
    [historyFilter, logs],
  );
  const suggestedImagePrompt =
    imagePromptDraft ||
    activeScenes[0]?.imageMaterialSuggestion ||
    activePromptPack?.imagePromptFragments[0] ||
    "根据知识库生成一张电商场景图，突出产品主体和真实使用场景。";
  const suggestedVideoPrompt =
    videoScript?.videoPrompt ||
    activeScenes[0]?.videoMaterialSuggestion ||
    activePromptPack?.videoPromptFragments.join("\n") ||
    "根据知识库和场景卡生成短视频镜头提示词。";
  const textModelOptions = useMemo(
    () => {
      if (modelConfig?.platformManaged) {
        return uniqueModelNames([
          ...modelConfig.textModels,
          ...(modelCatalog?.source === "lime-desktop-platform" ? modelCatalog.textModels : []),
        ]);
      }
      return compactModelNames([
        modelConfig?.textModel,
        ...(modelConfig?.textModels ?? []),
        ...(modelCatalog?.source === "lime-desktop-platform" ? [] : modelCatalog?.textModels ?? []),
      ]);
    },
    [modelCatalog?.source, modelCatalog?.textModels, modelConfig?.platformManaged, modelConfig?.textModel, modelConfig?.textModels],
  );
  const imageModelOptions = useMemo(
    () => {
      if (modelConfig?.platformManaged) {
        return uniqueModelNames([
          ...modelConfig.imageModels,
          ...(modelCatalog?.source === "lime-desktop-platform" ? modelCatalog.imageModels : []),
        ]);
      }
      return compactModelNames([
        modelConfig?.imageOuterModel,
        ...(modelConfig?.imageModels ?? []),
        ...(modelCatalog?.source === "lime-desktop-platform" ? [] : modelCatalog?.imageModels ?? []),
      ]);
    },
    [modelCatalog?.imageModels, modelCatalog?.source, modelConfig?.imageModels, modelConfig?.imageOuterModel, modelConfig?.platformManaged],
  );
  const videoModelOptions = useMemo(
    () => {
      if (modelConfig?.platformManaged) {
        return uniqueModelNames([
          ...modelConfig.videoModels,
          ...(modelCatalog?.source === "lime-desktop-platform" ? modelCatalog.videoModels : []),
        ]);
      }
      return compactModelNames([
        modelConfig?.videoModel,
        ...(modelConfig?.videoModels ?? []),
        ...(modelCatalog?.source === "lime-desktop-platform" ? [] : modelCatalog?.videoModels ?? []),
      ]);
    },
    [modelCatalog?.source, modelCatalog?.videoModels, modelConfig?.platformManaged, modelConfig?.videoModel, modelConfig?.videoModels],
  );

  async function refresh(nextWorkspace?: string): Promise<void> {
    const [nextSettings, nextModelConfig, nextModelCatalog] = await Promise.all([
      window.contentStudio.getSettings(),
      window.contentStudio.getModelConfig(),
      window.contentStudio.getModelCatalog(),
    ]);
    const platformSnapshot = nextModelConfig.platformManaged
      ? nextModelConfig.platformHost?.snapshot
      : undefined;
    const workspace = nextWorkspace ?? platformSnapshot?.workspacePath ?? nextSettings.workspacePath;
    const [nextSkills, nextKnowledgeBases, nextSearchResults] =
      await Promise.all([
        window.contentStudio.scanSkills(workspace),
        window.contentStudio.listKnowledgeBases(workspace),
        window.contentStudio.searchKnowledge({
          workspacePath: workspace,
          query: knowledgeQuery,
          baseType: knowledgeBaseFilter,
          sectionType: knowledgeSectionFilter,
          tag: knowledgeTagFilter,
        }),
      ]);
    setSettings(
      platformSnapshot?.workspacePath
        ? { ...nextSettings, workspacePath: platformSnapshot.workspacePath }
        : nextSettings,
    );
    if (platformSnapshot?.theme) {
      setThemeMode(platformSnapshot.theme);
    }
    if (platformSnapshot?.appearance?.colorTheme) {
      setColorTheme(platformColorThemeToContentStudio(platformSnapshot.appearance.colorTheme));
    }
    if (platformSnapshot?.appearance) {
      setFontScale(platformSnapshot.appearance.fontScale);
      setSerifEnabled(platformSnapshot.appearance.serifEnabled);
    }
    setModelConfig(nextModelConfig);
    setModelCatalog(nextModelCatalog);
    setSkills(nextSkills);
    setKnowledgeBases(nextKnowledgeBases);
    setBrandKnowledgeBases([]);
    setIpKnowledgeBases([]);
    setContentKnowledgeMaps([]);
    setContentKnowledgeMapBuildRuns([]);
    setContentDraftChanges([]);
    setContentKnowledgeReleases([]);
    setContentSyncConflicts([]);
    setContentWorkspaceSyncResult(null);
    setContentBatches([]);
    setContentKnowledgePackExport(null);
    setContentProductionHandoff(null);
    setContentMaterialCoverage(null);
    setContentReviewTasks([]);
    setSearchResults(nextSearchResults);
    const nextTextModels = uniqueModelNames([
      ...nextModelConfig.textModels,
      ...(nextModelCatalog.source === "lime-desktop-platform" ? nextModelCatalog.textModels : []),
    ]);
    const nextImageModels = uniqueModelNames([
      ...nextModelConfig.imageModels,
      ...(nextModelCatalog.source === "lime-desktop-platform" ? nextModelCatalog.imageModels : []),
    ]);
    const nextVideoModels = uniqueModelNames([
      ...nextModelConfig.videoModels,
      ...(nextModelCatalog.source === "lime-desktop-platform" ? nextModelCatalog.videoModels : []),
    ]);
    setParams((current) => ({
      ...current,
      textModel: nextModelConfig.platformManaged
        ? platformModelFromOptions(current.textModel, nextTextModels, nextModelConfig.textModel, modelConfig?.textModel)
        : modelFromOptions(current.textModel, nextTextModels),
      imageModel: nextModelConfig.platformManaged
        ? platformModelFromOptions(current.imageModel, nextImageModels, nextModelConfig.imageOuterModel, modelConfig?.imageOuterModel)
        : imageModelFromConfig(current.imageModel, nextImageModels),
      videoModel: nextModelConfig.platformManaged
        ? platformModelFromOptions(current.videoModel, nextVideoModels, nextModelConfig.videoModel, modelConfig?.videoModel)
        : modelFromOptions(current.videoModel, nextVideoModels),
    }));

    if (!workspace) {
      setSkillSelection(null);
      setPromptPacks([]);
      setSceneCards([]);
      setLogs([]);
      setGenerationTasks([]);
      setImageProductionTasks([]);
      setActiveImageProductionTaskId("");
      setInputSources([]);
      setPromptDrafts([]);
      setAgentPromptSessions([]);
      setBrandKnowledgeBases([]);
      setIpKnowledgeBases([]);
      setContentKnowledgeMaps([]);
      setContentKnowledgeMapBuildRuns([]);
      setContentDraftChanges([]);
      setContentKnowledgeReleases([]);
      setContentSyncConflicts([]);
      setContentWorkspaceSyncResult(null);
      setContentBatches([]);
      setContentKnowledgePackExport(null);
      setContentProductionHandoff(null);
      setContentMaterialCoverage(null);
      setContentReviewTasks([]);
      setOverlayCards([]);
      setAssetReviews([]);
      setMixPackages([]);
      setPlatformDrafts([]);
      setActivePromptDraftId("");
      setActiveAgentPromptSessionId("");
      setActiveBrandKnowledgeBaseId("");
      setActiveIpKnowledgeBaseId("");
      setActiveContentKnowledgeMapId("");
      setActiveContentReviewTaskId("");
      setPreferredKnowledgeSource(null);
      setWorkflowRuns([]);
      setActiveWorkflowRunId("");
      return;
    }

    const [
      nextSelection,
      nextPromptPacks,
      nextSceneCards,
      nextLogs,
      nextGenerationTasks,
      nextImageProductionTasks,
      nextInputSources,
      nextPromptDrafts,
      nextAgentPromptSessions,
      nextBrandKnowledgeBases,
      nextIpKnowledgeBases,
      nextContentKnowledgeMaps,
      nextContentKnowledgeMapBuildRuns,
      nextContentDraftChanges,
      nextContentKnowledgeReleases,
      nextContentSyncConflicts,
      nextContentBatches,
      nextContentReviewTasks,
      nextOverlayCards,
      nextAssetReviews,
      nextMixPackages,
      nextPlatformDrafts,
    ] =
      await Promise.all([
        window.contentStudio.getSkillSelection(workspace),
        window.contentStudio.listPromptPacks(workspace),
        window.contentStudio.listSceneCards(workspace),
        window.contentStudio.listGenerationLogs(workspace),
        window.contentStudio.listGenerationTasks(workspace),
        window.contentStudio.listImageProductionTasks(workspace),
        window.contentStudio.listInputSources(workspace),
        window.contentStudio.listPromptDrafts(workspace),
        window.contentStudio.listAgentPromptSessions(workspace),
        window.contentStudio.listBrandKnowledgeBases(workspace),
        window.contentStudio.listIpKnowledgeBases(workspace),
        window.contentStudio.listContentKnowledgeMaps(workspace),
        window.contentStudio.listContentKnowledgeMapBuildRuns(workspace),
        window.contentStudio.listContentDraftChanges(workspace),
        window.contentStudio.listContentKnowledgeReleases(workspace),
        window.contentStudio.listContentSyncConflicts(workspace),
        window.contentStudio.listContentBatches(workspace),
        window.contentStudio.listContentReviewTasks(workspace),
        window.contentStudio.listOverlayCards(workspace),
        window.contentStudio.listAssetReviews(workspace),
        window.contentStudio.listMixPackages(workspace),
        window.contentStudio.listPlatformDrafts(workspace),
      ]);
    setSkillSelection(nextSelection);
    setPromptPacks(nextPromptPacks);
    setSceneCards(nextSceneCards);
    setLogs(nextLogs);
    setGenerationTasks(nextGenerationTasks);
    setImageProductionTasks(nextImageProductionTasks);
    setInputSources(nextInputSources);
    setPromptDrafts(nextPromptDrafts);
    setAgentPromptSessions(nextAgentPromptSessions);
    setBrandKnowledgeBases(nextBrandKnowledgeBases);
    setIpKnowledgeBases(nextIpKnowledgeBases);
    setContentKnowledgeMaps(nextContentKnowledgeMaps);
    setContentKnowledgeMapBuildRuns(nextContentKnowledgeMapBuildRuns);
    setContentDraftChanges(nextContentDraftChanges);
    setContentKnowledgeReleases(nextContentKnowledgeReleases);
    setContentSyncConflicts(nextContentSyncConflicts);
    setContentBatches(nextContentBatches);
    setContentReviewTasks(nextContentReviewTasks);
    setOverlayCards(nextOverlayCards);
    setAssetReviews(nextAssetReviews);
    setMixPackages(nextMixPackages);
    setPlatformDrafts(nextPlatformDrafts);
    setActivePromptDraftId((current) => current || nextPromptDrafts[0]?.id || "");
    setActiveAgentPromptSessionId((current) =>
      current && nextAgentPromptSessions.some((session) => session.id === current)
        ? current
        : "",
    );
    setActiveBrandKnowledgeBaseId((current) => current || nextBrandKnowledgeBases[0]?.id || "");
    setActiveIpKnowledgeBaseId((current) => current || nextIpKnowledgeBases[0]?.id || "");
    setActiveContentKnowledgeMapId((current) => current || nextContentKnowledgeMaps[0]?.id || "");
    setActiveContentReviewTaskId((current) => current || nextContentReviewTasks[0]?.id || "");
    setActivePromptPackId((current) => current || nextPromptPacks[0]?.id || "");
    setActiveImageProductionTaskId((current) => current || nextImageProductionTasks[0]?.id || "");
    setSelectedSceneIds((current) => {
      const availableSceneIds = new Set(nextSceneCards.map((scene) => scene.id));
      return current.filter((sceneId) => availableSceneIds.has(sceneId));
    });
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    const needsPlatformModelSettings =
      modelConfig?.platformManaged && !(modelConfig.platformModelSettings?.providers.length);
    if (modelConfig?.platformManaged && !needsPlatformModelSettings) return undefined;
    let cancelled = false;
    let refreshing = false;
    const interval = window.setInterval(() => {
      if (refreshing) return;
      refreshing = true;
      window.contentStudio.getModelConfig()
        .then((nextModelConfig) => {
          const nextHasPlatformProviders = Boolean(nextModelConfig.platformModelSettings?.providers.length);
          if (!cancelled && (nextModelConfig.platformManaged || nextHasPlatformProviders)) {
            void refresh();
          }
        })
        .catch(() => undefined)
        .finally(() => {
          refreshing = false;
        });
    }, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [modelConfig?.platformManaged, modelConfig?.platformModelSettings?.providers.length]);

  useEffect(() => {
    workflowRunsRef.current = workflowRuns;
  }, [workflowRuns]);

  useEffect(() => {
    const unsubscribe = window.contentStudio.onGenerationTaskEvent((event) => {
      if (workspacePath && event.task.workspacePath !== workspacePath) return;
      setGenerationTasks((current) => [
        event.task,
        ...current.filter((task) => task.id !== event.task.id),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      setLogs((current) => [
        event.log,
        ...current.filter((log) => log.id !== event.log.id),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
      const output = event.log.output && typeof event.log.output === "object"
        ? event.log.output as Record<string, unknown>
        : {};
      const outputRefs = Array.isArray(output.assetRefs)
        ? output.assetRefs.filter((item): item is string => typeof item === "string")
        : [];
      if ((event.log.kind === "image" || event.log.kind === "video") && event.log.status !== "running") {
        setMediaResult({
          logId: event.log.id,
          status: event.log.status,
          message: event.log.summary || event.log.error || event.task.message,
          assetRefs: outputRefs.length ? outputRefs : event.log.artifactRefs ?? [],
          billing: event.log.kind === "video" ? videoCostEstimateFromOutput(output) : undefined,
        });
      }
      if (event.log.kind === "image" && event.log.status !== "queued" && event.log.status !== "running") {
        void syncShotStatusFromLog(event.log);
      }
    });
    return () => unsubscribe();
  }, [workspacePath]);

  useEffect(() => {
    const unsubscribe = window.contentStudio.onAgentPromptSessionEvent((event) => {
      if (workspacePath && event.workspacePath !== workspacePath) return;
      setAgentPromptSessions((current) => upsertAgentPromptSession(current, event.session));
      setActiveAgentPromptSessionId((current) => current || event.session.id);
    });
    return () => unsubscribe();
  }, [workspacePath]);

  useEffect(() => {
    let alive = true;
    void window.contentStudio.authGetSession()
      .then((state) => {
        if (alive) setAuthState(state);
      })
      .catch((error) => {
        if (alive) {
          setAuthState({
            authenticated: false,
            error: error instanceof Error ? error.message : '账号状态同步失败。',
          });
        }
      })
      .finally(() => {
        if (alive) setAuthChecking(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    let alive = true;
    void window.contentStudio.getUpdateState().then((state) => {
      if (alive) setUpdateState(state);
    });
    const unsubscribe = window.contentStudio.onUpdateState((state) =>
      setUpdateState(state),
    );
    return () => {
      alive = false;
      if (typeof unsubscribe === "function") unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!activePromptPack) return;
    setPromptPackDraft({
      brandVoice: activePromptPack.brandVoice,
      visualStyle: activePromptPack.visualStyle,
    });
  }, [
    activePromptPack?.id,
    activePromptPack?.brandVoice,
    activePromptPack?.visualStyle,
  ]);

  useEffect(() => {
    if (!modelConfig) return;
    setModelDraft({
      apiEndpoint: modelConfig.textApiEndpoint,
      apiKey: "",
      textProtocol: modelConfig.textProtocol,
      imageApiEndpoint: modelConfig.imageApiEndpoint,
      imageApiKey: "",
      imageProtocol: modelConfig.imageProtocol,
      imageOuterModel: modelConfig.imageOuterModel,
      textModel: modelConfig.textModel,
      textModels: modelConfig.textModels.join(", "),
      imageModels: modelConfig.imageModels.join(", "),
      videoApiEndpoint: modelConfig.videoApiEndpoint,
      videoApiKey: "",
      videoModel: modelConfig.videoModel,
      videoModels: modelConfig.videoModels.join(", "),
    });
  }, [
    modelConfig?.textApiEndpoint,
    modelConfig?.textProtocol,
    modelConfig?.imageApiEndpoint,
    modelConfig?.imageProtocol,
    modelConfig?.imageOuterModel,
    modelConfig?.textModel,
    modelConfig?.textModels,
    modelConfig?.imageModels,
    modelConfig?.videoApiEndpoint,
    modelConfig?.videoModel,
    modelConfig?.videoModels,
  ]);

  useEffect(() => {
    if (!activeEditableScene) return;
    setSceneCardDraft({
      title: activeEditableScene.title,
      imageMaterialSuggestion: activeEditableScene.imageMaterialSuggestion,
      videoMaterialSuggestion: activeEditableScene.videoMaterialSuggestion,
    });
  }, [
    activeEditableScene?.id,
    activeEditableScene?.title,
    activeEditableScene?.imageMaterialSuggestion,
    activeEditableScene?.videoMaterialSuggestion,
  ]);

  useEffect(() => {
    if (themeMode !== "system") {
      setEffectiveTheme(themeMode);
      return;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setEffectiveTheme(media.matches ? "dark" : "light");
    const listener = (e: MediaQueryListEvent) =>
      setEffectiveTheme(e.matches ? "dark" : "light");
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [themeMode]);

  function runAction<T = void>(
    action: (context: ActionContext) => Promise<T>,
    label = "正在处理当前任务",
  ): Promise<T | undefined> {
    const runId = actionRunIdRef.current + 1;
    actionRunIdRef.current = runId;
    cancelledRunIdsRef.current.delete(runId);
    const context: ActionContext = {
      isCancelled: () => cancelledRunIdsRef.current.has(runId),
      throwIfCancelled: () => {
        if (cancelledRunIdsRef.current.has(runId))
          throw new ActionCancelledError();
      },
    };
    setBusy(true);
    setCurrentActionLabel(label);
    setError(null);
    return action(context)
      .catch((nextError) => {
        if (nextError instanceof ActionCancelledError) return;
        setError(userFacingActionError(nextError));
        return undefined;
      })
      .finally(() => {
        cancelledRunIdsRef.current.delete(runId);
        if (actionRunIdRef.current === runId) {
          setBusy(false);
          setCurrentActionLabel(null);
        }
      });
  }

  function cancelCurrentAction(): void {
    if (!busy) return;
    cancelledRunIdsRef.current.add(actionRunIdRef.current);
    setBusy(false);
    setCurrentActionLabel(null);
    setError("已取消当前本地任务；如果底层操作已完成，迟到结果会被忽略。");
  }

  function dismissError(): void {
    setError(null);
  }

  function clearMediaResult(): void {
    setMediaResult(null);
  }

  function queueMediaResult(task: GenerationTaskRecord): void {
    setGenerationTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
    setMediaResult({
      logId: task.logId,
      status: task.status,
      message: task.message,
      assetRefs: [],
    });
  }

  async function submitMediaGeneration(input: MediaGenerationTaskInput): Promise<MediaGenerationSubmission> {
    try {
      const task = await window.contentStudio.submitGenerationTask(input);
      return { type: "task", task };
    } catch (error) {
      if (!isMissingGenerationTaskHandler(error)) throw error;
      const result =
        input.kind === "image"
          ? await window.contentStudio.generateImage(input.input)
          : await window.contentStudio.generateVideo(input.input);
      setError("当前运行中的主进程仍是旧版本，已临时使用兼容生成路径；请重启应用以启用后台异步任务。");
      return { type: "fallback", result };
    }
  }

  function applyMediaGenerationSubmission(submission: MediaGenerationSubmission): void {
    if (submission.type === "task") {
      queueMediaResult(submission.task);
      return;
    }
    setMediaResult(submission.result);
  }

  function requireWorkspace(): string {
    if (!workspacePath)
      throw new Error(
        "请先选择工作区，生成结果和配置会写入本地内容工厂目录。",
      );
    return workspacePath;
  }

  function requireModelKeyReadable(kind: "text" | "image" | "video"): void {
    const status =
      kind === "text"
        ? modelConfig?.textApiKeyStatus
        : kind === "image"
          ? modelConfig?.imageApiKeyStatus
          : modelConfig?.videoApiKeyStatus;
    if (status !== "requires-reauthorization") return;
    const label = kind === "text" ? "文字" : kind === "image" ? "图片" : "视频";
    setSettingsPage("model");
    setShowSettingsDialog(true);
    throw new Error(
      `${label}访问凭据已保存，但当前系统无法解密。请在设置 - 模型中重新保存 ${label}访问凭据后再继续。`,
    );
  }

  function openModelDialog(): void {
    setModelDraft({
      apiEndpoint: modelConfig?.textApiEndpoint ?? "",
      apiKey: "",
      textProtocol: modelConfig?.textProtocol ?? "openai-chat",
      imageApiEndpoint: modelConfig?.imageApiEndpoint ?? "",
      imageApiKey: "",
      imageProtocol: modelConfig?.imageProtocol ?? "openai-responses",
      imageOuterModel: modelConfig?.imageOuterModel ?? "",
      textModel: modelConfig?.textModel ?? params.textModel,
      textModels: modelConfig?.textModels.join(", ") ?? params.textModel,
      imageModels: modelConfig?.imageModels.join(", ") ?? params.imageModel,
      videoApiEndpoint: modelConfig?.videoApiEndpoint ?? "",
      videoApiKey: "",
      videoModel: modelConfig?.videoModel ?? params.videoModel,
      videoModels: modelConfig?.videoModels.join(", ") ?? params.videoModel,
    });
    setShowModelDialog(true);
  }

  async function chooseWorkspace(): Promise<void> {
    const selected = await window.contentStudio.selectWorkspace();
    if (!selected) return;
    await switchWorkspace(selected);
  }

  async function switchWorkspace(nextWorkspace: string): Promise<void> {
    const nextSettings = await window.contentStudio.saveSettings({
      workspacePath: nextWorkspace,
    });
    setActiveAgentPromptSessionId("");
    setActivePromptDraftId("");
    setSettings(nextSettings);
    await refresh(nextWorkspace);
  }

  async function clearWorkspace(): Promise<void> {
    const nextSettings = await window.contentStudio.saveSettings({
      workspacePath: "",
    });
    setActiveAgentPromptSessionId("");
    setActivePromptDraftId("");
    setSettings(nextSettings);
    setInputSources([]);
    setPromptDrafts([]);
    setAgentPromptSessions([]);
    setSearchResults([]);
    setLogs([]);
  }

  async function saveModelConfig(): Promise<void> {
    if (modelConfig?.platformManaged) {
      setSettingsPage("model");
      setShowSettingsDialog(true);
      throw new Error("模型设置已由平台设置中心统一管理，请在设置 - 模型中进入完整模型设置。");
    }
    const next = await window.contentStudio.saveModelConfig({
      textApiEndpoint: modelDraft.apiEndpoint,
      textApiKey: modelDraft.apiKey || undefined,
      clearTextApiKey:
        !modelDraft.apiKey && modelConfig?.textApiKeyStatus === "requires-reauthorization",
      textModel: modelDraft.textModel,
      textModels: modelDraft.textModels
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      textProtocol: modelDraft.textProtocol,
      imageProvider:
        modelDraft.imageApiKey || modelConfig?.hasImageApiKey
          ? "openai-responses"
          : "disabled",
      imageProtocol: modelDraft.imageProtocol,
      imageApiEndpoint: modelDraft.imageApiEndpoint,
      imageApiKey: modelDraft.imageApiKey || undefined,
      clearImageApiKey:
        !modelDraft.imageApiKey && modelConfig?.imageApiKeyStatus === "requires-reauthorization",
      imageOuterModel: modelDraft.imageOuterModel,
      imageModels: modelDraft.imageModels
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      videoProvider:
        modelDraft.videoApiEndpoint.trim() &&
        (modelDraft.videoApiKey.trim() || modelConfig?.hasVideoApiKey)
          ? "video-understanding-openai-compatible"
          : "disabled",
      videoApiEndpoint: modelDraft.videoApiEndpoint,
      videoApiKey: modelDraft.videoApiKey || undefined,
      clearVideoApiKey:
        !modelDraft.videoApiKey && modelConfig?.videoApiKeyStatus === "requires-reauthorization",
      videoModel: modelDraft.videoModel,
      videoModels: modelDraft.videoModels
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    });
    const catalog = await window.contentStudio.getModelCatalog();
    setModelConfig(next);
    setModelCatalog(catalog);
    setParams((current) => ({
      ...current,
      textModel: next.textModel || next.textModels[0] || current.textModel,
      imageModel: next.imageModels[0] || current.imageModel,
      videoModel: next.videoModel || next.videoModels[0] || current.videoModel,
    }));
    setShowModelDialog(false);
  }

  async function loadModelCatalog(): Promise<void> {
    const catalog = await window.contentStudio.getModelCatalog();
    setModelCatalog(catalog);
    setModelDraft((current) => ({
      ...current,
      textModel: current.textModel || catalog.textModels[0] || params.textModel,
      textModels: current.textModels || catalog.textModels.join(", "),
      imageModels: current.imageModels || catalog.imageModels.join(", "),
      imageOuterModel: current.imageOuterModel,
      videoModel:
        current.videoModel || catalog.videoModels[0] || params.videoModel,
      videoModels: current.videoModels || catalog.videoModels.join(", "),
    }));
  }

  async function checkForUpdates(): Promise<void> {
    const next = await window.contentStudio.checkForUpdates({ manual: true });
    setUpdateState(next);
    if (next.status === "error" && next.error) throw new Error(next.error);
  }

  async function setAutoUpdateEnabled(enabled: boolean): Promise<void> {
    setUpdateState(await window.contentStudio.setAutoUpdateEnabled(enabled));
  }

  async function openUpdateDownload(): Promise<void> {
    const result = await window.contentStudio.openUpdateDownload();
    if (!result.ok) throw new Error(result.error ?? "无法打开更新下载链接。");
  }

  async function openUpdateReleaseNotes(): Promise<void> {
    const result = await window.contentStudio.openUpdateReleaseNotes();
    if (!result.ok) throw new Error(result.error ?? "无法打开更新日志。");
  }

  async function openLogsDirectory(): Promise<void> {
    const result = await window.contentStudio.openLogsDirectory();
    if (!result.ok) throw new Error(result.error ?? "无法打开日志目录。");
  }

  function openUpdateSettings(): void {
    setSettingsPage("about");
    setShowSettingsDialog(true);
  }

  async function loginByPassword(input: BuguPasswordLoginInput): Promise<BuguAuthState> {
    const next = await window.contentStudio.authLoginByPassword(input);
    setAuthState(next);
    return next;
  }

  async function sendAuthEmailCode(input: BuguEmailCodeSendInput) {
    return window.contentStudio.authSendEmailCode(input);
  }

  async function verifyAuthEmailCode(input: BuguEmailCodeVerifyInput): Promise<BuguAuthState> {
    const next = await window.contentStudio.authVerifyEmailCode(input);
    setAuthState(next);
    return next;
  }

  async function logoutAuth(): Promise<void> {
    const next = await window.contentStudio.authLogout();
    setAuthState(next);
  }

  async function searchKnowledge(): Promise<void> {
    const results = await window.contentStudio.searchKnowledge({
      workspacePath,
      query: knowledgeQuery,
      baseType: knowledgeBaseFilter,
      sectionType: knowledgeSectionFilter,
      tag: knowledgeTagFilter,
    });
    setSearchResults(results);
  }

  function addCitation(result: KnowledgeSearchResult): void {
    const citation = citationFromResult(result);
    setSelectedCitations((current) =>
      current.some((item) => isSameCitation(item, citation))
        ? current
        : [...current, citation].slice(0, 8),
    );
  }

  function addKnowledgeSectionCitation(
    base: KnowledgeBaseView,
    section: KnowledgeSection,
  ): void {
    const citation = citationFromSection(base, section);
    setSelectedCitations((current) =>
      current.some((item) => isSameCitation(item, citation))
        ? current
        : [...current, citation].slice(0, 8),
    );
  }

  function selectKnowledgeBaseKey(key: string): void {
    setActiveKnowledgeBaseKey(key);
    setPreferredKnowledgeSource(null);
  }

  function selectBrandKnowledgeBase(recordId: string): void {
    setActiveBrandKnowledgeBaseId(recordId);
    setPreferredKnowledgeSource({ kind: "brand", id: recordId });
  }

  function selectIpKnowledgeBase(recordId: string): void {
    setActiveIpKnowledgeBaseId(recordId);
    setPreferredKnowledgeSource({ kind: "ip", id: recordId });
  }

  function toggleVideoDimension(dimension: string): void {
    setSelectedVideoDimensions((current) =>
      current.includes(dimension)
        ? current.filter((item) => item !== dimension)
        : [...current, dimension],
    );
  }

  async function selectAssetFiles(
    kind: "product-image" | "reference-image" | "video" | "audio",
  ): Promise<void> {
    const paths = await window.contentStudio.selectAssetFiles(kind);
    if (!paths?.length) return;
    if (kind === "product-image")
      setProductImageRefs((current) => [...current, ...paths].slice(0, 10));
    if (kind === "reference-image")
      setReferenceImageRefs((current) => [...current, ...paths].slice(0, 6));
    if (kind === "video")
      setVideoAssetRefs((current) => [...current, ...paths].slice(0, 3));
    if (kind === "audio")
      setAudioAssetRefs((current) => [...current, ...paths].slice(0, 1));
  }

  async function selectMaterialFiles(kind: AssetFileKind): Promise<string[]> {
    return window.contentStudio.selectAssetFiles(kind);
  }

  function removeProductImageRef(ref: string): void {
    setProductImageRefs((current) => current.filter((item) => item !== ref));
  }

  function removeReferenceImageRef(ref: string): void {
    setReferenceImageRefs((current) => current.filter((item) => item !== ref));
  }

  function removeVideoAssetRef(ref: string): void {
    setVideoAssetRefs((current) => current.filter((item) => item !== ref));
  }

  function removeAudioAssetRef(ref: string): void {
    setAudioAssetRefs((current) => current.filter((item) => item !== ref));
  }

  function clearProductImageRefs(): void {
    setProductImageRefs([]);
  }

  function clearReferenceImageRefs(): void {
    setReferenceImageRefs([]);
  }

  async function installBuiltinKnowledgeBase(id: string): Promise<void> {
    const workspace = requireWorkspace();
    await window.contentStudio.installBuiltinKnowledgeBase(id, workspace);
    await refresh(workspace);
  }

  async function importKnowledgeBase(): Promise<void> {
    const workspace = requireWorkspace();
    const imported =
      await window.contentStudio.importKnowledgeBaseFromFile(workspace);
    if (imported) await refresh(workspace);
  }

  async function resolveInputSourceRecoverySessionId(workspace: string, explicitSessionId?: string): Promise<string | undefined> {
    if (explicitSessionId) return explicitSessionId;
    const sessions = await window.contentStudio.listAgentPromptSessions(workspace);
    const candidates = sessions.filter(isAgentInputSourceRecoverySession);
    return candidates.find((session) => session.id === activeAgentPromptSessionId)?.id ?? candidates[0]?.id;
  }

  async function importInputSource(
    purpose: InputSourcePurpose,
    agentSessionId?: string,
    sensitivity?: InputSourceSensitivity,
  ): Promise<void> {
    const workspace = requireWorkspace();
    const imported = await window.contentStudio.importInputSourceFromFile(
      workspace,
      purpose,
      sensitivity ? { sensitivity } : undefined,
    );
    if (imported) {
      if (purpose === "successful-asset") setActiveModule("video-import");
      setInputSources((current) => [imported, ...current.filter((item) => item.id !== imported.id)]);
      const recoverySessionId = await resolveInputSourceRecoverySessionId(workspace, agentSessionId);
      if (recoverySessionId) {
        await attachAgentPromptSessionInputSources({
          sessionId: recoverySessionId,
          inputSourceIds: [imported.id],
          reason: "file-input-source-imported",
        });
      } else {
        await refresh(workspace);
      }
    }
  }

  async function importFinishedVideo(promptDraftId?: string, workflowRunId?: string): Promise<void> {
    const workspace = requireWorkspace();
    const draft = promptDraftId
      ? promptDrafts.find((item) => item.id === promptDraftId)
      : activePromptDraft?.purpose === "video"
        ? activePromptDraft
        : promptDrafts.find((item) => item.purpose === "video");
    const workflowRun = workflowRunId
      ? workflowRuns.find((item) => item.id === workflowRunId)
      : workflowRunForPromptDraft(draft?.id);
    const imported = await window.contentStudio.importInputSourceFromFile(
      workspace,
      "successful-asset",
      {
        workflowRunId: workflowRun?.id,
        relatedPromptDraftId: draft?.id,
        relatedSceneCardIds: draft?.sceneCardIds ?? selectedSceneIds,
        tags: ["成品视频", "第三方生成", draft?.title ?? ""].filter(Boolean),
        sensitivity: "internal",
      },
    );
    if (imported) {
      await refresh(workspace);
    }
  }

  async function registerManualInputSource(input: {
    title: string;
    purpose: InputSourcePurpose;
    sensitivity?: InputSourceSensitivity;
    text: string;
    tags?: string[];
    agentSessionId?: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const source = await window.contentStudio.registerInputSource({
      workspacePath: workspace,
      kind: "manual-note",
      purpose: input.purpose,
      sensitivity: input.sensitivity,
      title: input.title,
      text: input.text,
      tags: input.tags,
      summary: input.text.slice(0, 160),
    });
    setInputSources((current) => [source, ...current.filter((item) => item.id !== source.id)]);
    const recoverySessionId = await resolveInputSourceRecoverySessionId(workspace, input.agentSessionId);
    if (recoverySessionId) {
      await attachAgentPromptSessionInputSources({
        sessionId: recoverySessionId,
        inputSourceIds: [source.id],
        reason: "manual-input-source-registered",
      });
    } else {
      await refresh(workspace);
    }
  }

  async function ensureAgentAssetInputSources(
    workspace: string,
    productRefs?: string[],
    referenceRefs?: string[],
  ): Promise<string[]> {
    const plan = planAgentAssetInputSourceRegistrations({
      productRefs,
      referenceRefs,
      knownSources: inputSources,
      fileNameFromPath,
    });
    if (!plan.existingIds.length && !plan.registrations.length) return [];

    const createdSources: InputSourceRecord[] = [];
    const ids: string[] = [...plan.existingIds];
    for (const registration of plan.registrations) {
      const source = await window.contentStudio.registerInputSource({
        workspacePath: workspace,
        ...registration.input,
      });
      createdSources.push(source);
      ids.push(source.id);
    }
    if (createdSources.length) {
      setInputSources((current) => [
        ...createdSources,
        ...current.filter((source) => !createdSources.some((created) => created.id === source.id)),
      ]);
    }
    return Array.from(new Set(ids));
  }

  async function removeInputSource(sourceId: string): Promise<void> {
    const workspace = requireWorkspace();
    const removed = await window.contentStudio.removeInputSource(workspace, sourceId);
    if (!removed) return;
    setInputSources((current) => current.filter((source) => source.id !== sourceId));
  }

  async function createPromptDraftRecord(
    workspace: string,
    input: PromptDraftCreateRequest,
  ): Promise<PromptDraft> {
    let inputSourceIds = input.inputSourceIds;
    const temporarySourceText = input.temporarySourceText?.trim();
    if (temporarySourceText) {
      const temporarySource = await window.contentStudio.registerInputSource({
        workspacePath: workspace,
        kind: "manual-note",
        purpose: "task-input",
        title: input.temporarySourceTitle?.trim() || "视频 Prompt 临时资料",
        sensitivity: "internal",
        text: temporarySourceText,
        summary: temporarySourceText.slice(0, 160),
        tags: ["video-prompt", "临时资料", "运行追溯"],
      });
      inputSourceIds = Array.from(new Set([...inputSourceIds, temporarySource.id]));
      setInputSources((current) => [temporarySource, ...current.filter((item) => item.id !== temporarySource.id)]);
    }
    const draft = await window.contentStudio.generatePromptDraft({
      workspacePath: workspace,
      title: input.title,
      purpose: input.purpose,
      userIntent: input.userIntent,
      inputSourceIds,
      teamKnowledgeRelease: input.teamKnowledgeRelease,
      sceneCardIds: input.sceneCardIds,
      selectedSkills: input.selectedSkills,
      selectedSkillSlugs: input.selectedSkillSlugs,
    });
    setPromptDrafts((current) => [draft, ...current]);
    setActivePromptDraftId(draft.id);
    return draft;
  }

  async function generatePromptDraft(input: PromptDraftCreateRequest): Promise<void> {
    const workspace = requireWorkspace();
    await createPromptDraftRecord(workspace, input);
    await refresh(workspace);
  }

  async function startAgentPromptSession(input: PromptDraftCreateRequest): Promise<AgentPromptSession> {
    const workspace = requireWorkspace();
    const assetInputSourceIds = await ensureAgentAssetInputSources(workspace, input.productImageRefs, input.referenceImageRefs);
    const inputSourceIds = Array.from(new Set([...input.inputSourceIds, ...assetInputSourceIds]));
    const agentTextModel = requestedModelFromOptions(input.textModel, textModelOptions);
    const pendingSession = createPendingAgentPromptSession({
      workspacePath: workspace,
      title: input.title,
      purpose: input.purpose,
      userIntent: input.userIntent,
      inputSourceIds,
      sceneCardIds: input.sceneCardIds,
      selectedSkills: input.selectedSkills,
      selectedSkillSlugs: input.selectedSkillSlugs,
      textModel: agentTextModel,
    });
    setAgentPromptSessions((current) => upsertAgentPromptSession(current, pendingSession));
    setActiveAgentPromptSessionId(pendingSession.id);
    const result = await window.contentStudio.startAgentPromptSession({
      workspacePath: workspace,
      title: input.title,
      purpose: input.purpose,
      userIntent: input.userIntent,
      inputSourceIds,
      teamKnowledgeRelease: input.teamKnowledgeRelease,
      sceneCardIds: input.sceneCardIds,
      selectedSkills: input.selectedSkills,
      selectedSkillSlugs: input.selectedSkillSlugs,
      textModel: agentTextModel,
    });
    if (result.draft) {
      setPromptDrafts((current) => [result.draft!, ...current.filter((item) => item.id !== result.draft!.id)]);
      setActivePromptDraftId(result.draft.id);
    }
    setAgentPromptSessions((current) => upsertAgentPromptSession(current, result.session, pendingSession.id));
    setActiveAgentPromptSessionId(result.session.id);
    await refresh(workspace);
    return result.session;
  }

  async function continueAgentPromptSession(input: {
    sessionId: string;
    message: string;
    textModel?: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const agentTextModel = requestedModelFromOptions(input.textModel, textModelOptions);
    const result = await window.contentStudio.continueAgentPromptSession({
      workspacePath: workspace,
      sessionId: input.sessionId,
      message: input.message,
      textModel: agentTextModel,
    });
    if (result.draft) {
      setPromptDrafts((current) => [result.draft!, ...current.filter((item) => item.id !== result.draft!.id)]);
      setActivePromptDraftId(result.draft.id);
    }
    setAgentPromptSessions((current) => upsertAgentPromptSession(current, result.session));
    setActiveAgentPromptSessionId(result.session.id);
    await refresh(workspace);
  }

  async function respondAgentPromptAction(input: Omit<RespondAgentPromptActionInput, 'workspacePath'>): Promise<void> {
    const workspace = requireWorkspace();
    const session = await window.contentStudio.respondAgentPromptAction({
      workspacePath: workspace,
      ...input,
    });
    setAgentPromptSessions((current) => upsertAgentPromptSession(current, session));
    setActiveAgentPromptSessionId(session.id);
    await refresh(workspace);
  }

  async function attachAgentPromptSessionInputSources(input: Omit<AttachAgentPromptSessionInputSourcesInput, 'workspacePath'>): Promise<void> {
    const workspace = requireWorkspace();
    const session = await window.contentStudio.attachAgentPromptSessionInputSources({
      workspacePath: workspace,
      ...input,
    });
    setAgentPromptSessions((current) => upsertAgentPromptSession(current, session));
    setActiveAgentPromptSessionId(session.id);
    await refresh(workspace);
  }

  async function generateBrandKnowledgeBase(): Promise<void> {
    const workspace = requireWorkspace();
    const citations = brandCitationsForRequest;
    if (citations.length === 0) throw new Error('请先选择至少一条知识引用。');
    const sourceTitle = inputSources.find((source) => citations[0]?.knowledgeBaseId === `input-source:${source.id}`)?.title;
    const record = await window.contentStudio.generateBrandKnowledgeBase({
      workspacePath: workspace,
      title: sourceTitle
        ? `${sourceTitle} 品牌知识库`
        : activeKnowledgeBase?.title
        ? `${activeKnowledgeBase.title} 品牌知识库`
        : undefined,
      citations,
    });
    setBrandKnowledgeBases((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    setActiveBrandKnowledgeBaseId(record.id);
    setPreferredKnowledgeSource({ kind: "brand", id: record.id });
    setSelectedCitations([]);
    await refresh(workspace);
  }

  async function buildContentKnowledgeMap(): Promise<void> {
    const workspace = requireWorkspace();
    const titleSource =
      activeBrandKnowledgeBase?.title ||
      activeIpKnowledgeBase?.title ||
      activeKnowledgeBase?.title ||
      inputSources[0]?.title ||
      "内容项目";
    const record = await window.contentStudio.buildContentKnowledgeMap({
      workspacePath: workspace,
      title: `${titleSource.replace(/(品牌知识库|IP 知识库|内容知识地图)$/g, '').trim()} 内容知识地图`,
      inputSourceIds: inputSources.map((source) => source.id),
      brandKnowledgeBaseIds: brandKnowledgeBases.map((item) => item.id),
      ipKnowledgeBaseIds: ipKnowledgeBases.map((item) => item.id),
      sceneCardIds: sceneCards.map((scene) => scene.id),
      promptDraftIds: promptDrafts.map((draft) => draft.id),
    });
    setContentKnowledgeMaps((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    setActiveContentKnowledgeMapId(record.id);
    await refresh(workspace);
  }

  async function buildContentBatch(): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    const record = await window.contentStudio.buildContentBatch({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap?.id,
      title: sourceMap?.title
        ? sourceMap.title.replace(/内容知识地图$/g, '制造批次')
        : '电商短视频制造批次',
    });
    setContentBatches((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    await refresh(workspace);
  }

  async function advanceContentBatchStage(): Promise<void> {
    const workspace = requireWorkspace();
    const batch = activeContentBatch ?? contentBatches[0];
    if (!batch) throw new Error('请先生成内容制造批次。');
    const record = await window.contentStudio.advanceContentBatchStage({
      workspacePath: workspace,
      batchId: batch.id,
    });
    setContentBatches((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    await refresh(workspace);
  }

  function contentBatchManufacturingHandoffContent(batch: ContentBatchRecord): string {
    const map = activeContentKnowledgeMap ?? contentKnowledgeMaps.find((item) => item.id === batch.sourceKnowledgeMapId) ?? contentKnowledgeMaps[0];
    const sellingRows = map ? [...map.sellingPoints, ...map.painPoints, ...map.scenarios].slice(0, 8) : [];
    const relatedReviewTasks = contentReviewTasks.filter((task) =>
      task.status === 'open' ||
      task.status === 'needs-evidence' ||
      task.status === 'needs-material'
    ).slice(0, 6);
    const relatedWorkflowRuns = workflowRuns.filter((run) =>
      run.status === 'running' ||
      run.status === 'succeeded' ||
      /prompt|scene|sop|handoff|matrix|提示词|场景|交接|矩阵/i.test(`${run.workflowKey} ${run.title} ${run.summary}`),
    ).slice(0, 6);
    const relatedPromptDrafts = promptDrafts.filter((draft) =>
      draft.coverageRowIds?.some((rowId) => sellingRows.some((row) => row.id === rowId)) ||
      draft.sceneCardIds?.length ||
      draft.purpose === 'video' ||
      draft.purpose === 'image' ||
      draft.purpose === 'green-screen'
    ).slice(0, 6);
    const selectedScenes = sceneCards.filter((scene) =>
      selectedSceneIds.includes(scene.id) ||
      sellingRows.some((row) => row.sourceRefs.includes(`scene-card:${scene.id}`) || row.materialRefs?.includes(`scene-card:${scene.id}`)),
    ).slice(0, 5);
    const sourceLines = inputSources.slice(0, 10).map((source, index) => [
      `${index + 1}. ${source.title}`,
      `   - 用途：${source.purpose}`,
      `   - 状态：${source.status}`,
      source.summary ? `   - 摘要：${source.summary}` : '',
      source.blockedReason ? `   - 缺口：${source.blockedReason}` : '',
    ].filter(Boolean).join('\n'));
    const sellingLines = sellingRows.map((row, index) => [
      `${index + 1}. ${row.title}`,
      `   - 摘要：${row.summary}`,
      `   - 状态：${row.status}；素材：${row.materialStatus ?? 'missing'}；置信度：${row.confidence}`,
      row.tags.length ? `   - 标签：${row.tags.join(' / ')}` : '',
    ].filter(Boolean).join('\n'));
    const matrixLines = [
      ...relatedPromptDrafts.map((draft) => [
        draft.title,
        `   - 类型：Prompt 草稿；用途：${draft.purpose}；状态：${draft.status}`,
        draft.coverageRowIds?.length ? `   - 覆盖行：${draft.coverageRowIds.length} 个` : '',
      ].filter(Boolean).join('\n')),
      ...relatedWorkflowRuns.map((run) => [
        run.title,
        `   - 类型：历史运行记录；状态：${run.status}`,
        run.summary ? `   - 摘要：${run.summary}` : '',
      ].filter(Boolean).join('\n')),
      ...relatedReviewTasks.map((task) => [
        task.title,
        `   - 类型：审核 / 补资源任务；状态：${task.status}`,
        task.summary ? `   - 摘要：${task.summary}` : '',
      ].filter(Boolean).join('\n')),
    ].slice(0, 10).map((line, index) => `${index + 1}. ${line}`);
    const runReviewLines = [
      ...logs.filter((log) => log.status === 'succeeded' || log.status === 'failed' || log.status === 'blocked').slice(0, 4).map((log) => [
        log.title,
        `   - 类型：生成记录；状态：${log.status}`,
        log.summary ? `   - 摘要：${log.summary}` : '',
      ].filter(Boolean).join('\n')),
      ...assetReviews.filter((review) => review.status === 'approved' || review.status === 'rejected').slice(0, 4).map((review) => [
        review.title,
        `   - 类型：素材审核；状态：${review.status}`,
        review.note ? `   - 结论：${review.note}` : '',
      ].filter(Boolean).join('\n')),
      ...contentBatchPerformanceSources().slice(0, 4).map((source) => [
        source.title,
        `   - 类型：投放 / 用户反馈；状态：${source.status}`,
        source.summary ? `   - 摘要：${source.summary}` : '',
      ].filter(Boolean).join('\n')),
    ].slice(0, 8).map((line, index) => `${index + 1}. ${line}`);
    const sceneLines = selectedScenes.map((scene, index) => [
      `${index + 1}. ${scene.title}`,
      `   - 人群：${scene.audience}`,
      `   - 痛点：${scene.painPoint}`,
      `   - 场景：${scene.usageScene}`,
      `   - 画面：${scene.visualComposition}`,
      `   - 卖点：${scene.sellingPoint}`,
      `   - 口播：${scene.voiceoverDirection}`,
      `   - 视频素材建议：${scene.videoMaterialSuggestion}`,
    ].filter(Boolean).join('\n'));
    const constraints = [
      ...(map?.constraints ?? []),
      '不在软件内伪造第三方视频生成成功。',
      '成品视频必须由用户手动导入，并关联本 Prompt 草稿。',
      '评论、搜索词和投放表现只能解释意图，不能升级为产品事实。',
    ];
    return [
      `# ${batch.title} / 视频制造单`,
      '',
      '## 批次目标',
      batch.objective,
      '',
      '## 使用边界',
      '- 本草稿是制造阶段交付物，可复制到第三方视频平台或继续拆成图片 / 绿幕 / 混剪任务。',
      '- 当前客户端只生成可审核的视频 Prompt 交接，不创建外部视频任务，不轮询第三方状态。',
      '- 第三方生成后的成品视频需要在“成品视频导入”中手动登记，之后进入审核和素材库。',
      '',
      '## 推荐视频结构',
      `- 批次制造按 60-75 秒规划，拆成 4-5 个约 15 秒片段；如只做单条短素材，按当前 ${videoDurationSeconds || 18} 秒设置裁剪。`,
      '- 0-3 秒：先给真实使用场景或用户痛点，不夸张承诺。',
      '- 中段：按卖点、证据、场景和素材可得性组织镜头。',
      '- 收尾：只使用已确认的活动、价格、库存和适用边界。',
      '',
      sourceLines.length ? '## 批次输入源' : '',
      ...sourceLines,
      '',
      sellingLines.length ? '## 卖点 / 痛点 / 场景事实' : '',
      ...sellingLines,
      '',
      matrixLines.length ? '## 矩阵交接依据' : '',
      ...matrixLines,
      '',
      runReviewLines.length ? '## 运行和复盘依据' : '',
      ...runReviewLines,
      '',
      sceneLines.length ? '## 可用场景卡' : '',
      ...sceneLines,
      '',
      '## 规则和禁用边界',
      ...Array.from(new Set(constraints)).slice(0, 16).map((item) => `- ${item}`),
      '',
      '## 可复制视频 Prompt',
      [
        `围绕「${batch.objective}」生成一条电商短视频。`,
        '画面必须体现真实产品、真实使用场景和可追溯卖点。',
        selectedScenes[0]?.visualComposition ? `首镜画面：${selectedScenes[0].visualComposition}` : '首镜画面：从用户正在遇到的问题切入，产品主体清晰可见。',
        selectedScenes[0]?.voiceoverDirection ? `口播方向：${selectedScenes[0].voiceoverDirection}` : '口播方向：自然、克制、像真实导购说明，不使用夸张功效承诺。',
        sellingRows[0]?.summary ? `核心卖点：${sellingRows[0].summary}` : '核心卖点：只使用上方事实源中已登记的信息。',
        '输出分镜、口播、字幕、素材需求和需要人工确认的缺口；不要声称已经生成成片。',
      ].join('\n'),
    ].filter((line) => line.trim().length > 0).join('\n');
  }

  async function createContentBatchManufacturingPrompt(): Promise<void> {
    const workspace = requireWorkspace();
    const batch = activeContentBatch ?? contentBatches[0];
    if (!batch) throw new Error('请先生成内容制造批次。');
    const map = activeContentKnowledgeMap ?? contentKnowledgeMaps.find((item) => item.id === batch.sourceKnowledgeMapId) ?? contentKnowledgeMaps[0];
    const sourceIds = inputSources.map((source) => source.id);
    const rowIds = map ? [...map.sellingPoints, ...map.painPoints, ...map.scenarios].slice(0, 12).map((row) => row.id) : [];
    const sceneIds = Array.from(new Set([
      ...selectedSceneIds,
      ...sceneCards
        .filter((scene) => rowIds.some((rowId) => scene.coverageRowIds?.includes(rowId)))
        .map((scene) => scene.id),
    ])).slice(0, 8);
    const content = contentBatchManufacturingHandoffContent(batch);
    const source = await window.contentStudio.registerInputSource({
      workspacePath: workspace,
      kind: 'manual-note',
      purpose: 'task-input',
      sensitivity: 'internal',
      title: `${batch.title} 制造阶段交接`,
      text: content,
      summary: `由内容制造批次生成的视频制造单，来源于 ${sourceIds.length} 个输入源、${rowIds.length} 个知识地图行和 ${promptDrafts.length + workflowRuns.length + contentReviewTasks.length} 个矩阵交接依据。`,
      tags: ['content-batch', 'video-manufacturing-job', batch.id],
      relatedSceneCardIds: sceneIds,
    });
    const draft = await window.contentStudio.createPromptDraftFromContent({
      workspacePath: workspace,
      contentKnowledgeMapId: map?.id,
      contentKnowledgeMapTitle: map?.title,
      coverageRowIds: rowIds,
      sourceRefs: [
        `content-batch:${batch.id}`,
        ...(map ? [`content-knowledge-map:${map.id}`] : []),
      ],
      title: `${batch.title} 视频制造单`,
      purpose: 'video',
      userIntent: `执行批次「${batch.title}」制造阶段，生成可复制到第三方视频平台的视频 Prompt 交接草稿。`,
      inputSourceIds: [source.id, ...sourceIds],
      sceneCardIds: sceneIds,
      content,
      note: '由内容制造批次制造阶段主动作生成。',
      model: 'local-content-batch-manufacturing-handoff',
      status: 'confirmed',
    });
    setInputSources((current) => [source, ...current.filter((item) => item.id !== source.id)]);
    setPromptDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    setSelectedSceneIds(sceneIds);
    setActivePromptDraftId(draft.id);
    setVideoCustomRequirement(promptDraftActiveContent(draft));
    setVideoShotCount(5);
    setVideoDurationSeconds((current) => Math.max(current, 60));
    setActiveModule('video-prompt');
    await refresh(workspace);
  }

  function contentBatchManufacturingDrafts(batch: ContentBatchRecord, drafts: PromptDraft[] = promptDrafts): PromptDraft[] {
    return drafts.filter((draft) => {
      if (draft.purpose !== 'video') return false;
      if (draft.sourceRefs?.includes(`content-batch:${batch.id}`)) return true;
      return draft.model === 'local-content-batch-manufacturing-handoff' && draft.title.includes(batch.title);
    });
  }

  function preferredContentBatchManufacturingModule(batch: ContentBatchRecord): ModuleKey | undefined {
    const plan = batch.intakeSummary.manufacturing;
    if (!plan) return undefined;
    const primary = plan.capabilities.find((capability) => capability.id === plan.primaryCapabilityId);
    const fallback = plan.capabilities.find((capability) => capability.status === 'ready') ??
      plan.capabilities.find((capability) => capability.status === 'done');
    const target = primary?.status === 'ready' || primary?.status === 'done' ? primary.targetModule : fallback?.targetModule;
    return target as ModuleKey | undefined;
  }

  function pendingImportedContentBatchAssets(
    sources: InputSourceRecord[] = inputSources,
    reviews: AssetReviewRecord[] = assetReviews,
  ): InputSourceRecord[] {
    const reviewedKeys = new Set(reviews.map((review) => review.assetKey));
    return sources.filter((source) => {
      if (!isFinishedVideoSource(source)) return false;
      const path = source.sourcePath || source.artifactRefs.find((ref) => /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i.test(ref));
      if (!path) return false;
      const assetKey = `imported:${source.id}:0:${path}`;
      return !reviewedKeys.has(assetKey);
    });
  }

  function hasActionableContentBatchAssetReviews(reviews: AssetReviewRecord[] = assetReviews): boolean {
    return reviews.some((review) =>
      (review.status === 'pending' || review.status === 'rejected') &&
      (review.tags.includes('content-batch') || review.tags.includes('批次审核')),
    );
  }

  function contentBatchPerformanceSources(sources: InputSourceRecord[] = inputSources): InputSourceRecord[] {
    return sources.filter((source) =>
      source.purpose === 'user-feedback' ||
      source.tags.some((tag) => /投放|roi|ad|metric|表现|转化|点击|ctr|cpa/i.test(tag)) ||
      /投放|roi|广告|转化|点击|表现|ctr|cpa/i.test(`${source.title} ${source.summary ?? ''}`),
    );
  }

  function successfulAssetPromptDrafts(drafts: PromptDraft[] = promptDrafts): PromptDraft[] {
    return drafts.filter((draft) => draft.model === 'local-successful-asset-distiller');
  }

  function approvedAssetsMissingContentCoverage(
    map: ContentKnowledgeMapRecord | undefined = activeContentKnowledgeMap ?? contentKnowledgeMaps[0],
    reviews: AssetReviewRecord[] = assetReviews,
  ): AssetReviewRecord[] {
    if (!map) return [];
    const materialRefs = new Set(
      [...map.sellingPoints, ...map.painPoints, ...map.scenarios].flatMap((row) => row.materialRefs ?? []),
    );
    return reviews.filter((review) => review.status === 'approved' && !materialRefs.has(review.id));
  }

  function reworkRequestFromAssetReview(review: AssetReviewRecord): ReworkAssetRequest | undefined {
    if (review.kind === 'overlay') return undefined;
    return {
      kind: review.kind,
      assetKey: review.assetKey,
      path: review.path,
      title: review.title,
      sourceType: review.sourceType,
      sourceId: review.sourceId,
      workflowRunId: review.workflowRunId,
      sceneCardIds: inputSources.find((source) => source.id === review.sourceId)?.relatedSceneCardIds,
    };
  }

  async function queueImportedContentBatchAssetReviews(): Promise<void> {
    const workspace = requireWorkspace();
    const [latestSources, latestReviews] = await Promise.all([
      window.contentStudio.listInputSources(workspace),
      window.contentStudio.listAssetReviews(workspace),
    ]);
    setInputSources(latestSources);
    setAssetReviews(latestReviews);
    const pendingSources = pendingImportedContentBatchAssets(latestSources, latestReviews);
    if (hasActionableContentBatchAssetReviews(latestReviews)) {
      setActiveModule('assets');
      return;
    }
    if (pendingSources.length === 0) {
      const videoDraft = promptDrafts.find((draft) => draft.purpose === 'video' && draft.title.includes('视频制造单')) ??
        promptDrafts.find((draft) => draft.purpose === 'video');
      if (videoDraft) setActivePromptDraftId(videoDraft.id);
      setActiveModule('video-import');
      return;
    }
    const queuedReviews = await Promise.all(pendingSources.slice(0, 8).map((source) => {
      const path = source.sourcePath || source.artifactRefs.find((ref) => /\.(mp4|mov|webm|m4v)(?:[?#].*)?$/i.test(ref)) || '';
      const assetKey = `imported:${source.id}:0:${path}`;
      return window.contentStudio.reviewAsset({
        workspacePath: workspace,
        workflowRunId: source.workflowRunId,
        assetKey,
        kind: 'video',
        sourceType: 'input-source',
        sourceId: source.id,
        path,
        title: source.title || fileNameFromPath(path),
        status: 'pending',
        note: '由批次审核阶段排队，等待人工判断通过并入库、驳回或回炉。',
        tags: Array.from(new Set(['content-batch', '批次审核', '第三方成品视频', ...source.tags])),
      });
    }));
    setAssetReviews((current) => [
      ...queuedReviews,
      ...current.filter((item) => !queuedReviews.some((review) => review.assetKey === item.assetKey)),
    ]);
    setActiveModule('assets');
    await refresh(workspace);
  }

  async function runContentBatchStagePrimaryAction(stageId: ContentBatchStageId): Promise<void> {
    requireWorkspace();
    if (stageId === 'selection') {
      setActiveModule('knowledge-inputs');
      return;
    }
    if (stageId === 'intent') {
      setActiveModule('knowledge-inputs');
      return;
    }
    if (stageId === 'modeling') {
      await buildContentKnowledgeMap();
      return;
    }
    if (stageId === 'selling') {
      if (!activeContentKnowledgeMap && !contentKnowledgeMaps[0]) {
        await buildContentKnowledgeMap();
        return;
      }
      setActiveModule('knowledge-map');
      return;
    }
    if (stageId === 'matrix') {
      setActiveModule('agents');
      return;
    }
    if (stageId === 'manufacturing') {
      const batch = activeContentBatch ?? contentBatches[0];
      if (!batch) throw new Error('请先生成内容制造批次。');
      const existingDraft = contentBatchManufacturingDrafts(batch)[0];
      if (!existingDraft) {
        await createContentBatchManufacturingPrompt();
        return;
      }
      setActivePromptDraftId(existingDraft.id);
      setActiveModule(preferredContentBatchManufacturingModule(batch) ?? 'video-prompt');
      return;
    }
    if (stageId === 'review') {
      if (hasActionableContentBatchAssetReviews() || pendingImportedContentBatchAssets().length || promptDrafts.some((draft) => draft.purpose === 'video')) {
        await queueImportedContentBatchAssetReviews();
        return;
      }
      await generateContentReviewTasks();
      setActiveModule('knowledge-review');
      return;
    }
    if (stageId === 'optimization') {
      if (contentBatchPerformanceSources().length === 0) {
        setActiveModule('knowledge-inputs');
        return;
      }
      setActiveModule('assets');
      return;
    }
    if (stageId === 'feedback') {
      const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
      const missingCoverage = approvedAssetsMissingContentCoverage(sourceMap);
      const approvedAsset = assetReviews.find((review) => review.status === 'approved');
      const promptDistillableAsset = assetReviews.find((review) =>
        review.status === 'approved' && review.kind !== 'overlay',
      );
      if (missingCoverage.length > 0 && sourceMap) {
        await writeBackContentMaterialCoverage();
        setActiveModule('knowledge-map');
        return;
      }
      if (promptDistillableAsset && successfulAssetPromptDrafts().length === 0) {
        const reworkRequest = reworkRequestFromAssetReview(promptDistillableAsset);
        if (reworkRequest) {
          await distillAssetPrompt(reworkRequest);
          return;
        }
      }
      setActiveModule(approvedAsset ? 'agents' : 'assets');
      return;
    }
    setActiveModule('assets');
  }

  async function exportContentKnowledgePack(): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    if (!sourceMap) throw new Error('请先生成内容知识地图。');
    const result = await window.contentStudio.exportContentKnowledgePack({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap.id,
    });
    setContentKnowledgePackExport(result);
    setContentKnowledgePackFilePreview(null);
    if (result.status === 'blocked') {
      throw new Error(result.issues[0] || '团队知识包导出检查未通过。');
    }
  }

  async function readContentKnowledgePackFile(input: { packageDir?: string; relativePath: string }): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.readContentKnowledgePackFile({
      workspacePath: workspace,
      packageDir: input.packageDir,
      relativePath: input.relativePath,
    });
    setContentKnowledgePackFilePreview(result);
    if (result.status === 'blocked') {
      throw new Error(result.issues[0] || '知识包文件暂不可预览。');
    }
  }

  async function writeBackContentMaterialCoverage(): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    if (!sourceMap) throw new Error('请先生成内容知识地图。');
    const result = await window.contentStudio.writeBackContentMaterialCoverage({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap.id,
    });
    setContentMaterialCoverage(result);
    if (result.status === 'blocked') {
      throw new Error(result.issues[0] || '素材覆盖回写未完成。');
    }
    if (result.contentKnowledgeMap) {
      setContentKnowledgeMaps((current) => [result.contentKnowledgeMap!, ...current.filter((item) => item.id !== result.contentKnowledgeMap!.id)]);
      setActiveContentKnowledgeMapId(result.contentKnowledgeMap.id);
    }
    await refresh(workspace);
  }

  async function createContentDraftChange(): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    if (!sourceMap) throw new Error('请先生成内容知识地图。');
    const result = await window.contentStudio.createContentDraftChange({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap.id,
      authorLabel: authState?.user?.displayName || authState?.user?.username || '本机工作台',
    });
    setContentWorkspaceSyncResult(result);
    if (result.draftChange) {
      setContentDraftChanges((current) => [result.draftChange!, ...current.filter((item) => item.id !== result.draftChange!.id)]);
    }
    if (result.status === 'blocked') {
      throw new Error(result.issues[0] || '变更包检查未通过。');
    }
    await refresh(workspace);
  }

  async function submitContentDraftChange(draftChangeId?: string): Promise<void> {
    const workspace = requireWorkspace();
    const draftChange = draftChangeId
      ? contentDraftChanges.find((item) => item.id === draftChangeId)
      : contentDraftChanges[0];
    if (!draftChange) throw new Error('请先生成变更包。');
    const result = await window.contentStudio.submitContentDraftChange({
      workspacePath: workspace,
      draftChangeId: draftChange.id,
      authorLabel: authState?.user?.displayName || authState?.user?.username || '本机工作台',
    });
    setContentWorkspaceSyncResult(result);
    if (result.draftChange) {
      setContentDraftChanges((current) => [result.draftChange!, ...current.filter((item) => item.id !== result.draftChange!.id)]);
    }
    if (result.status !== 'submitted') {
      if (result.status === 'conflict') {
        const conflicts = await window.contentStudio.listContentSyncConflicts(workspace);
        setContentSyncConflicts(conflicts);
      }
      throw new Error(result.issues[0] || 'Bugu 团队同步未完成。');
    }
    await refresh(workspace);
  }

  async function exportContentDraftChange(draftChangeId?: string): Promise<void> {
    const workspace = requireWorkspace();
    const draftChange = draftChangeId
      ? contentDraftChanges.find((item) => item.id === draftChangeId)
      : contentDraftChanges[0];
    if (!draftChange) throw new Error('请先生成变更包。');
    const result = await window.contentStudio.exportContentDraftChange({
      workspacePath: workspace,
      draftChangeId: draftChange.id,
    });
    setContentWorkspaceSyncResult(result);
    if (result.status !== 'exported') {
      throw new Error(result.issues[0] || '变更包导出未完成。');
    }
  }

  async function importContentDraftChange(): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.importContentDraftChange({
      workspacePath: workspace,
      authorLabel: authState?.user?.displayName || authState?.user?.username || '本机工作台',
    });
    setContentWorkspaceSyncResult(result);
    if (result.draftChange) {
      setContentDraftChanges((current) => [result.draftChange!, ...current.filter((item) => item.id !== result.draftChange!.id)]);
    }
    if (result.status !== 'imported') {
      throw new Error(result.issues[0] || '变更包导入未完成。');
    }
    await refresh(workspace);
    setContentWorkspaceSyncResult(result);
  }

  async function resolveContentSyncConflict(conflict: ContentSyncConflict, resolutionAction: ContentSyncConflictResolutionAction = 'manual-review-recorded'): Promise<void> {
    const workspace = requireWorkspace();
    const conflictId = conflict.id;
    const mergeDraft = buildContentSyncConflictMergeDraft(conflict);
    const resolutionNote = resolutionAction === 'keep-team-version'
      ? '已选择以团队版本为准，本机需要刷新团队版本后再继续。'
      : resolutionAction === 'keep-local-change'
        ? '已选择保留本机修改，需要重新生成变更包并提交团队工作区。'
        : '已记录为人工处理，请重新同步团队版本后再提交。';
    const resolved = await window.contentStudio.resolveContentSyncConflict({
      workspacePath: workspace,
      conflictId,
      resolutionAction,
      resolutionNote,
      mergeDraft,
      resolvedBy: authState?.user?.displayName || authState?.user?.username || '本机工作台',
    });
    setContentSyncConflicts((current) => current.filter((item) => item.id !== conflictId));
    if (resolved) {
      setContentWorkspaceSyncResult({
        status: 'conflict',
        issues: [resolutionNote],
        conflict: resolved,
      });
    }
    await refresh(workspace);
  }

  async function createContentKnowledgeRelease(): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    if (!sourceMap) throw new Error('请先生成内容知识地图。');
    const result = await window.contentStudio.createContentKnowledgeRelease({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap.id,
      authorLabel: authState?.user?.displayName || authState?.user?.username || '本机工作台',
    });
    setContentWorkspaceSyncResult(result);
    if (result.release) {
      setContentKnowledgeReleases((current) => [result.release!, ...current.filter((item) => item.id !== result.release!.id)]);
    }
    if (result.status === 'blocked') {
      throw new Error(result.issues[0] || '团队知识包发布未完成。');
    }
    await refresh(workspace);
  }

  async function createTeamKnowledgePromptDraft(): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    if (!sourceMap) throw new Error('请先生成内容知识地图。');
    const draft = await window.contentStudio.createTeamKnowledgePromptDraft({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap.id,
    });
    setPromptDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    setActivePromptDraftId(draft.id);
    setActiveModule(promptWorkbenchModuleForPurpose(draft.purpose));
    await refresh(workspace);
    setActivePromptDraftId(draft.id);
  }

  async function generateContentReviewTasks(): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    const tasks = await window.contentStudio.generateContentReviewTasks({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap?.id,
    });
    setContentReviewTasks(tasks);
    setActiveContentReviewTaskId((current) => current || tasks[0]?.id || "");
    await refresh(workspace);
  }

  async function generateContentReviewTasksForRows(rowIds: string[]): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    const targetRowIds = rowIds.filter(Boolean);
    if (!sourceMap) throw new Error('请先生成内容知识地图。');
    if (!targetRowIds.length) throw new Error('请先选择要送审的内容条目。');
    const targetRowIdSet = new Set(targetRowIds);
    const tasks = await window.contentStudio.generateContentReviewTasks({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap.id,
      targetRowIds,
    });
    setContentReviewTasks(tasks);
    const firstTargetTask = tasks.find((task) => task.targetId && targetRowIdSet.has(task.targetId));
    setActiveContentReviewTaskId(firstTargetTask?.id || tasks[0]?.id || "");
    setActiveModule('knowledge-review');
    await refresh(workspace);
  }

  async function generateContentMaterialTasksForRows(rowIds: string[]): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    const targetRowIds = rowIds.filter(Boolean);
    if (!sourceMap) throw new Error('请先生成内容知识地图。');
    if (!targetRowIds.length) throw new Error('请先选择需要补素材的内容条目。');
    const targetRowIdSet = new Set(targetRowIds);
    const tasks = await window.contentStudio.generateContentReviewTasks({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap.id,
      targetRowIds,
      taskPurpose: 'material-supplement',
    });
    setContentReviewTasks(tasks);
    const firstTargetTask = tasks.find((task) => task.targetId && targetRowIdSet.has(task.targetId) && task.taskPurpose === 'material-supplement');
    setActiveContentReviewTaskId(firstTargetTask?.id || tasks[0]?.id || "");
    setActiveModule('knowledge-review');
    await refresh(workspace);
  }

  async function generateContentMaterialTasksForCoverageRows(targets: Array<{
    contentKnowledgeMapId: string;
    rowId: string;
  }>): Promise<void> {
    const workspace = requireWorkspace();
    const groupedTargets = new Map<string, Set<string>>();
    targets.forEach((target) => {
      const mapId = target.contentKnowledgeMapId.trim();
      const rowId = target.rowId.trim();
      if (!mapId || !rowId) return;
      const rowIds = groupedTargets.get(mapId) ?? new Set<string>();
      rowIds.add(rowId);
      groupedTargets.set(mapId, rowIds);
    });
    if (!groupedTargets.size) throw new Error('请先选择需要补素材的内容组合。');

    const knownMapIds = new Set(contentKnowledgeMaps.map((map) => map.id));
    const missingMapIds = Array.from(groupedTargets.keys()).filter((mapId) => !knownMapIds.has(mapId));
    if (missingMapIds.length) throw new Error('找不到对应的内容知识地图，请先拉取团队更新。');

    const targetKeys = new Set<string>();
    let combinedTasks: ContentReviewTask[] = [];
    for (const [contentKnowledgeMapId, rowIdSet] of groupedTargets) {
      const targetRowIds = Array.from(rowIdSet);
      targetRowIds.forEach((rowId) => targetKeys.add(`${contentKnowledgeMapId}:${rowId}`));
      const tasks = await window.contentStudio.generateContentReviewTasks({
        workspacePath: workspace,
        contentKnowledgeMapId,
        targetRowIds,
        taskPurpose: 'material-supplement',
      });
      combinedTasks = tasks;
    }

    setContentReviewTasks(combinedTasks);
    const firstTargetTask = combinedTasks.find((task) =>
      task.sourceKnowledgeMapId &&
      task.targetId &&
      targetKeys.has(`${task.sourceKnowledgeMapId}:${task.targetId}`) &&
      task.taskPurpose === 'material-supplement',
    );
    if (firstTargetTask?.sourceKnowledgeMapId) setActiveContentKnowledgeMapId(firstTargetTask.sourceKnowledgeMapId);
    setActiveContentReviewTaskId(firstTargetTask?.id || combinedTasks[0]?.id || "");
    setActiveModule('knowledge-review');
    await refresh(workspace);
  }

  async function createContentProductionHandoffForRow(rowId: string, target: ContentProductionHandoffTarget): Promise<void> {
    const workspace = requireWorkspace();
    const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
    if (!sourceMap) throw new Error('请先生成内容知识地图。');
    if (!rowId) throw new Error('请先选择要交接的内容条目。');
    const approvedTask = contentReviewTasks.find((task) =>
      task.sourceKnowledgeMapId === sourceMap.id &&
      task.targetId === rowId &&
      (task.taskPurpose ?? 'review') === 'review' &&
      task.status === 'approved',
    );
    if (approvedTask) {
      await createContentProductionHandoff(approvedTask.id, target);
      return;
    }
    const tasks = await window.contentStudio.generateContentReviewTasks({
      workspacePath: workspace,
      contentKnowledgeMapId: sourceMap.id,
      targetRowIds: [rowId],
    });
    setContentReviewTasks(tasks);
    const reviewTask = tasks.find((task) =>
      task.sourceKnowledgeMapId === sourceMap.id &&
      task.targetId === rowId &&
      (task.taskPurpose ?? 'review') === 'review',
    );
    setActiveContentReviewTaskId(reviewTask?.id || tasks[0]?.id || '');
    setActiveModule('knowledge-review');
    await refresh(workspace);
  }

  async function submitContentReviewDecision(
    taskId: string,
    action: ContentReviewDecisionAction,
    payload?: ContentReviewDecisionPayload,
  ): Promise<void> {
    const workspace = requireWorkspace();
    const task = await window.contentStudio.submitContentReviewDecision({
      workspacePath: workspace,
      taskId,
      action,
      payload,
      reviewerLabel: authState?.user?.displayName || authState?.user?.username || '本机工作台',
    });
    setContentReviewTasks((current) => [task, ...current.filter((item) => item.id !== task.id)]);
    setActiveContentReviewTaskId(task.id);
    await refresh(workspace);
  }

  async function createContentProductionHandoff(taskId: string, target: ContentProductionHandoffTarget = 'prompt-and-scene'): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.createContentProductionHandoff({
      workspacePath: workspace,
      reviewTaskId: taskId,
      target,
      actorLabel: authState?.user?.displayName || authState?.user?.username || '本机工作台',
    });
    setContentProductionHandoff(result);
    if (result.status === 'blocked') {
      throw new Error(result.issues[0] || '发布检查未通过，不能交给下游生产。');
    }
    if (result.promptDraft) {
      setPromptDrafts((current) => [result.promptDraft!, ...current.filter((item) => item.id !== result.promptDraft!.id)]);
      setActivePromptDraftId(result.promptDraft.id);
    }
    if (result.sceneCard) {
      setSceneCards((current) => [result.sceneCard!, ...current.filter((item) => item.id !== result.sceneCard!.id)]);
      setSelectedSceneIds((current) => current.includes(result.sceneCard!.id) ? current : [result.sceneCard!.id, ...current].slice(0, 6));
    }
    const nextModule = result.promptDraft
      ? promptWorkbenchModuleForPurpose(result.promptDraft.purpose)
      : result.sceneCard
        ? 'knowledge-scenes'
        : 'agents';
    await refresh(workspace);
    if (result.promptDraft) setActivePromptDraftId(result.promptDraft.id);
    if (result.sceneCard) {
      setSelectedSceneIds((current) => current.includes(result.sceneCard!.id) ? current : [result.sceneCard!.id, ...current].slice(0, 6));
    }
    setActiveModule(nextModule);
  }

  async function generateIpKnowledgeBase(): Promise<void> {
    const workspace = requireWorkspace();
    const citations = ipCitationsForRequest;
    if (citations.length === 0) throw new Error('请先选择至少一条知识引用。');
    const sourceTitle = inputSources.find((source) => citations[0]?.knowledgeBaseId === `input-source:${source.id}`)?.title;
    const record = await window.contentStudio.generateIpKnowledgeBase({
      workspacePath: workspace,
      title: sourceTitle
        ? `${sourceTitle} IP 知识库`
        : activeKnowledgeBase?.title
        ? `${activeKnowledgeBase.title} IP 知识库`
        : undefined,
      citations,
    });
    setIpKnowledgeBases((current) => [record, ...current.filter((item) => item.id !== record.id)]);
    setActiveIpKnowledgeBaseId(record.id);
    setPreferredKnowledgeSource({ kind: "ip", id: record.id });
    setSelectedCitations([]);
    await refresh(workspace);
  }

  function workflowRunForIpKnowledgeBase(recordId?: string): WorkflowRunRecord | undefined {
    if (!recordId) return undefined;
    return workflowRuns.find((run) =>
      workflowRunReferences(run, [`ip-knowledge-base:${recordId}`, recordId]),
    );
  }

  function ipScenarioExtensionContent(record: IpKnowledgeBaseRecord, scene: string): string {
    return [
      "任务：IP 场景延伸知识库",
      "",
      `IP 知识库：${record.title}`,
      `延伸场景：${scene}`,
      "",
      "六层事实源：",
      `- 身份：${record.layers.identity}`,
      `- 价值观：${record.layers.values}`,
      `- 语言：${record.layers.language}`,
      `- 判断方法：${record.layers.methodology}`,
      `- 内容素材：${record.layers.materials}`,
      `- 创作引擎：${record.layers.engine}`,
      "",
      "场景 Prompt 要求：",
      "- 保持同一个 IP 的身份、观点、语言和禁区，不做人设漂移。",
      "- 只使用上述 IP 知识库事实，不编造经历、案例、背书或成绩。",
      "- 输出要能直接进入对应下游：口播 / 长文 / 私域 / 产品化 / 咨询回复。",
      "- 如果信息不足，明确列出需要补充的素材，不用空泛套话补齐。",
      "",
      "可直接复用的 Prompt 草稿：",
      `请基于「${record.title}」为「${scene}」场景生成内容方案。`,
      "先说明目标受众和使用场景，再给内容结构、表达口吻、素材引用、禁用表达和人工确认清单。",
      "输出必须保留 IP 的判断方法和语言风格，避免把 IP 改写成泛泛行业专家。",
    ].join("\n");
  }

  async function createIpScenarioPrompt(scene: string): Promise<void> {
    const workspace = requireWorkspace();
    const record = activeIpKnowledgeBase;
    if (!record) throw new Error("请先生成或选择一个 IP 知识库。");
    const normalizedScene = scene.trim();
    if (!normalizedScene) throw new Error("场景名称不能为空。");
    const relatedRun = workflowRunForIpKnowledgeBase(record.id);
    const content = ipScenarioExtensionContent(record, normalizedScene);
    const source = await window.contentStudio.registerInputSource({
      workspacePath: workspace,
      workflowRunId: relatedRun?.id,
      kind: "manual-note",
      purpose: "ip-scenario-kb",
      sensitivity: "internal",
      title: `${record.title} / ${normalizedScene} 场景延伸库`,
      summary: `基于 ${record.title} 延伸「${normalizedScene}」内容场景，保留六层 IP 事实源。`,
      text: content,
      tags: Array.from(new Set(["ip-scenario", normalizedScene, record.id])),
    });
    const draft = await window.contentStudio.createPromptDraftFromContent({
      workspacePath: workspace,
      workflowRunId: relatedRun?.id,
      title: `${record.title} / ${normalizedScene} Prompt`,
      purpose: promptPurposeForIpScenario(normalizedScene),
      userIntent: `基于 ${record.title} 生成「${normalizedScene}」场景内容 Prompt。`,
      inputSourceIds: [source.id],
      content,
      note: "由 IP 知识库场景延伸生成。",
      model: "local-ip-scenario-extension",
      status: "confirmed",
    });
    setInputSources((current) => [source, ...current.filter((item) => item.id !== source.id)]);
    setPromptDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    setActivePromptDraftId(draft.id);
    setActiveModule(promptWorkbenchModuleForPurpose(draft.purpose));
    await refresh(workspace);
  }

  async function generateReferenceReversePrompt(input: ReferenceReverseGenerateInput): Promise<void> {
    const workspace = requireWorkspace();
    setReferenceReverseError(null);
    try {
      const result = await window.contentStudio.reverseReferencePrompt({
        workspacePath: workspace,
        ...input,
      });
      setReferenceReverseResult(result);
      setPromptDrafts((current) => [
        result.promptDraft,
        ...current.filter((draft) => draft.id !== result.promptDraft.id),
      ]);
      setActivePromptDraftId(result.promptDraft.id);
      await refresh(workspace);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setReferenceReverseError(message);
      throw error;
    }
  }

  async function generateScenePromptDraft(input: {
    sceneCardIds: string[];
    purpose: PromptDraftPurpose;
    userIntent: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const selectedScenes = sceneCards.filter((scene) =>
      input.sceneCardIds.includes(scene.id),
    );
    if (selectedScenes.length === 0) throw new Error("请先选择至少一张场景卡。");
    const draftTitle =
      input.purpose === "video" ? "场景视频 Prompt 草稿" :
      input.purpose === "green-screen" ? "场景绿幕文案图 Prompt 草稿" :
      input.purpose === "article" ? "场景文案 Prompt 草稿" :
      "场景图片 Prompt 草稿";
    const inputSourceIds = Array.from(
      new Set(selectedScenes.flatMap((scene) => scene.inputSourceIds ?? [])),
    ).slice(0, 12);
    const draft = await createPromptDraftRecord(workspace, {
      title: draftTitle,
      purpose: input.purpose,
      userIntent: [
        "基于已确认场景卡生成下游 Prompt。",
        input.userIntent,
        "场景卡摘要：",
        ...selectedScenes.map((scene, index) => [
          `${index + 1}. ${scene.title}`,
          `人群：${scene.audience}`,
          `痛点：${scene.painPoint}`,
          `场景：${scene.usageScene}`,
          `画面：${scene.visualComposition}`,
          `卖点：${scene.sellingPoint}`,
          input.purpose === "video"
            ? `视频素材建议：${scene.videoMaterialSuggestion}`
            : `图片素材建议：${scene.imageMaterialSuggestion}`,
        ].join("\n")),
        "要求：保持知识库事实可追溯，输出可以直接进入图片生成或外部视频平台复制使用。",
      ].join("\n"),
      inputSourceIds,
      sceneCardIds: input.sceneCardIds,
    });
    const content = buildScenePromptGroupContent(
      input.purpose,
      input.userIntent,
      selectedScenes,
    );
    const updated = await window.contentStudio.updatePromptDraft({
      workspacePath: workspace,
      draftId: draft.id,
      content,
      note: input.purpose === "video"
        ? "场景库生成的 15 秒视频 Prompt 组"
        : "场景库生成的可下游使用 Prompt 组",
      status: "confirmed",
    });
    setPromptDrafts((current) =>
      [updated, ...current.filter((item) => item.id !== updated.id)],
    );
    setActivePromptDraftId(updated.id);
    await refresh(workspace);
  }

  function useScenePromptInImage(prompt: string, sceneCardIds?: string[]): void {
    setSelectedSceneIds(sceneCardIds ?? []);
    setImageWorkflowRunId("");
    setImageProductLabel("产品图");
    setImageReferenceLabel("参考图");
    setImagePromptDraft(prompt);
    setImagePromptMode("free");
    setActiveModule("image-production");
  }

  function useShowcasePromptInImage(input: ShowcaseImageHandoffInput): void {
    const nextProductRefs = cleanPathList(input.productImageRefs);
    const nextReferenceRefs = cleanPathList(input.referenceImageRefs);
    setSelectedSceneIds([]);
    setImageWorkflowRunId("");
    setImageProductLabel(input.productImageLabel?.trim() || "产品图");
    setImageReferenceLabel(input.referenceImageLabel?.trim() || "参考图");
    setProductImageRefs(nextProductRefs.slice(0, 10));
    setReferenceImageRefs(nextReferenceRefs.slice(0, 6));
    setImagePromptDraft(input.prompt);
    setImagePromptMode("free");
  }

  function startShowcasePartialRetouch(
    input: ShowcaseImageHandoffInput & {
      outputRefs?: string[];
      sourceLogId?: string;
      sourceTitle?: string;
    },
  ): void {
    const nextOutputRefs = cleanPathList(input.outputRefs ?? []);
    const nextProductRefs = (nextOutputRefs.length
      ? nextOutputRefs
      : cleanPathList(input.productImageRefs)).slice(0, 10);
    const nextReferenceRefs = cleanPathList(input.referenceImageRefs).slice(0, 6);
    setSelectedSceneIds([]);
    setImageWorkflowRunId("");
    setImageProductLabel(input.productImageLabel?.trim() || input.sourceTitle?.trim() || "待精修图");
    setImageReferenceLabel(input.referenceImageLabel?.trim() || "参考图");
    setProductImageRefs(nextProductRefs);
    setReferenceImageRefs(nextReferenceRefs);
    setImagePromptDraft(input.prompt);
    setImagePromptMode("free");
    setImageGenerationMode("smart");
    setImageReworkSource(input.sourceLogId
      ? {
          assetKey: input.sourceLogId,
          kind: "image",
          sourceType: "generation-log",
          sourceId: input.sourceLogId,
          path: nextProductRefs[0] || "",
          title: input.sourceTitle || "历史生成图局部精修",
        }
      : null);
  }

  async function generateShowcaseImage(
    input: ShowcaseImageHandoffInput,
    context?: ActionContext,
  ): Promise<void> {
    const workspace = requireWorkspace();
    if (params.runMode !== "single")
      throw new Error("批量 / 定时队列当前未启用，请先切回单次处理。");
    requireModelKeyReadable("image");
    const nextProductRefs = cleanPathList(input.productImageRefs).slice(0, 10);
    const nextReferenceRefs = cleanPathList(input.referenceImageRefs).slice(0, 6);
    setSelectedSceneIds([]);
    setImageWorkflowRunId("");
    setImageProductLabel(input.productImageLabel?.trim() || "产品图");
    setImageReferenceLabel(input.referenceImageLabel?.trim() || "参考图");
    setProductImageRefs(nextProductRefs);
    setReferenceImageRefs(nextReferenceRefs);
    setImagePromptDraft(input.prompt);
    setImagePromptMode("free");
    const submission = await submitMediaGeneration({
      kind: "image",
      input: {
        workspacePath: workspace,
        productImageRefs: nextProductRefs,
        referenceImageRefs: nextReferenceRefs,
        prompt: input.prompt,
        promptMode: "free",
        generationMode: imageGenerationMode,
        template: imageTemplate,
        templateInputs: imageTemplateInputs,
        watermark: imageWatermark,
        promptPackId: activePromptPack?.id,
        sceneCardIds: [],
        featureId: input.featureId,
        featureTitle: input.featureTitle,
        citations: citationsForRequest,
        selectedSkillSlugs:
          skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
        params: paramsForImageGeneration(params, input.imageModel),
      },
    });
    context?.throwIfCancelled();
    applyMediaGenerationSubmission(submission);
    await refresh(workspace);
  }

  function useReferenceReversePromptInImage(input: ShowcaseImageHandoffInput): void {
    useShowcasePromptInImage(input);
    setActiveModule("image-production");
  }

  async function generateReferenceReverseImage(
    input: ShowcaseImageHandoffInput,
    context?: ActionContext,
  ): Promise<void> {
    await generateShowcaseImage(input, context);
    setActiveModule("material-breakdown");
  }

  function useScenePromptInVideo(prompt: string, sceneCardIds?: string[]): void {
    setSelectedSceneIds(sceneCardIds ?? []);
    setVideoCustomRequirement(prompt);
    setVideoShotCount(5);
    setVideoDurationSeconds(18);
    setActiveModule("video");
  }

  function useShowcasePromptInVideo(input: ShowcaseVideoHandoffInput): void {
    const nextImageRefs = cleanPathList(input.imageAssetRefs).slice(0, 7);
    const nextVideoRefs = cleanPathList(input.videoAssetRefs).slice(0, 3);
    const nextAudioRefs = cleanPathList(input.audioAssetRefs).slice(0, 1);
    setSelectedSceneIds([]);
    setProductImageRefs(nextImageRefs);
    setReferenceImageRefs([]);
    setVideoAssetRefs(nextVideoRefs);
    setAudioAssetRefs(nextAudioRefs);
    setVideoCustomRequirement(input.prompt);
    setVideoDurationSeconds(input.durationSeconds ?? videoDurationSeconds);
    if (input.featureTitle || input.selectedCaseTitle) {
      setVideoProductName(input.selectedCaseTitle || input.featureTitle || videoProductName);
    }
    if (input.aspectRatio) {
      setParams((current) => ({ ...current, aspectRatio: input.aspectRatio || current.aspectRatio }));
    }
  }

  function usePromptDraftInVideo(draftId: string): void {
    const draft = promptDrafts.find((item) => item.id === draftId);
    setSelectedSceneIds(draft?.sceneCardIds ?? []);
    setActivePromptDraftId(draftId);
    setActiveModule("video-prompt");
  }

  function usePromptDraftInArticle(draftId: string, prompt: string): void {
    const draft = promptDrafts.find((item) => item.id === draftId);
    setSelectedSceneIds(draft?.sceneCardIds ?? []);
    setActivePromptDraftId(draftId);
    if (draft?.title) setArticleTopic(draft.title);
    setArticleRequirement(prompt);
    setActiveModule("article");
  }

  function usePromptDraftInGreenScreen(draftId: string): void {
    const draft = promptDrafts.find((item) => item.id === draftId);
    setSelectedSceneIds(draft?.sceneCardIds ?? []);
    setActivePromptDraftId(draftId);
    setActiveModule("image-green-screen");
  }

  async function updatePromptDraft(input: {
    draftId: string;
    content: string;
    note?: string;
    confirm?: boolean;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const draft = await window.contentStudio.updatePromptDraft({
      workspacePath: workspace,
      draftId: input.draftId,
      content: input.content,
      note: input.note,
      status: input.confirm ? "confirmed" : undefined,
    });
    setPromptDrafts((current) =>
      current.map((item) => (item.id === draft.id ? draft : item)),
    );
    setActivePromptDraftId(draft.id);
    await refresh(workspace);
  }

  async function recordPromptDraftCopy(input: {
    draftId: string;
    target?: string;
  }): Promise<PromptDraft> {
    const workspace = requireWorkspace();
    const draft = await window.contentStudio.recordPromptDraftCopy({
      workspacePath: workspace,
      draftId: input.draftId,
      target: input.target,
    });
    setPromptDrafts((current) =>
      current.map((item) => (item.id === draft.id ? draft : item)),
    );
    setActivePromptDraftId(draft.id);
    await refresh(workspace);
    return draft;
  }

  async function generateOverlayCards(input: {
    promptDraftId?: string;
    cards: OverlayCardDraft[];
    workflowRunId?: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const cards = await window.contentStudio.generateOverlayCards({
      workspacePath: workspace,
      promptDraftId: input.promptDraftId,
      cards: input.cards,
    });
    setOverlayCards((current) => [...cards, ...current]);
    setActiveModule("image-green-screen");
    await refresh(workspace);
  }

  async function exportMixPackage(input: {
    title: string;
    platform: string;
    assets: MixPackageAssetInput[];
    notes?: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const workflowRun = workflowRunForMixAssets(input.assets);
    const mixPackage = await window.contentStudio.exportMixPackage({
      workspacePath: workspace,
      workflowRunId: workflowRun?.id,
      title: input.title,
      platform: input.platform,
      assets: input.assets,
      notes: input.notes,
    });
    setMixPackages((current) => [mixPackage, ...current]);
    setActiveModule("video-mix-export");
    await refresh(workspace);
  }

  async function recordMixPackageImportEvidence(
    input: Omit<RecordMixPackageImportEvidenceInput, "workspacePath">,
  ): Promise<void> {
    const workspace = requireWorkspace();
    const mixPackage = await window.contentStudio.recordMixPackageImportEvidence({
      workspacePath: workspace,
      ...input,
    });
    setMixPackages((current) => current.map((item) => (item.id === mixPackage.id ? mixPackage : item)));
    setActiveModule("video-mix-export");
    await refresh(workspace);
  }

  async function reviewAsset(input: Omit<ReviewAssetInput, "workspacePath">): Promise<void> {
    const workspace = requireWorkspace();
    const workflowRun = workflowRunForAssetReview(input);
    const review = await window.contentStudio.reviewAsset({
      workspacePath: workspace,
      ...input,
      workflowRunId: input.workflowRunId ?? workflowRun?.id,
    });
    setAssetReviews((current) => [
      review,
      ...current.filter((item) => item.assetKey !== review.assetKey),
    ]);
    await refresh(workspace);
  }

  function updateImageProductionTaskState(task: ImageProductionTask): void {
    setImageProductionTasks((current) => [
      task,
      ...current.filter((item) => item.id !== task.id),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setActiveImageProductionTaskId(task.id);
  }

  async function createImageProductionTask(input?: {
    title?: string;
    sourceSummary?: string;
  }): Promise<ImageProductionTask> {
    const workspace = requireWorkspace();
    const sourceSummary = input?.sourceSummary || suggestedImagePrompt;
    const task = await window.contentStudio.createImageProductionTask({
      workspacePath: workspace,
      title: input?.title || activeScenes[0]?.title || "图片素材生产任务",
      sourceSummary,
      productImageRefs,
      referenceImageRefs,
      consistencyRules: [
        "产品外观、包装文字、尺寸比例和主体结构必须保持一致。",
        "参考图只作为构图、光线、姿态和氛围参考，不得编造产品事实。",
      ],
      negativeConstraints: [
        "不生成医疗化、夸大承诺或无法由资料支撑的表达。",
        "不改变产品包装结构，不添加无来源的文字、Logo 或规格。",
      ],
      shotPrompts: shotPromptSeedsFromText(sourceSummary, suggestedImagePrompt).map((shot) => ({
        ...shot,
        referenceImageRefs,
      })),
    });
    updateImageProductionTaskState(task);
    await refresh(workspace);
    return task;
  }

  async function updateImageProductionTask(input: {
    taskId: string;
    title?: string;
    status?: ImageProductionTaskStatus;
    sourceSummary?: string;
    productImageRefs?: string[];
    referenceImageRefs?: string[];
    consistencyRules?: string[];
    negativeConstraints?: string[];
    activeShotPromptId?: string;
  }): Promise<ImageProductionTask> {
    const workspace = requireWorkspace();
    const task = await window.contentStudio.updateImageProductionTask({
      workspacePath: workspace,
      ...input,
    });
    updateImageProductionTaskState(task);
    return task;
  }

  async function updateShotPrompt(input: {
    taskId: string;
    shotPromptId?: string;
    patch: Partial<Omit<ShotPrompt, "id" | "createdAt" | "updatedAt">>;
  }): Promise<ImageProductionTask> {
    const workspace = requireWorkspace();
    const task = await window.contentStudio.updateShotPrompt({
      workspacePath: workspace,
      ...input,
    });
    updateImageProductionTaskState(task);
    return task;
  }

  async function syncShotStatusFromLog(log: GenerationLogEntry): Promise<void> {
    const { taskId, shotPromptId } = imageLogProductionIds(log);
    const status = nextShotStatusFromLog(log);
    if (!taskId || !shotPromptId || !status) return;
    const task = await window.contentStudio.updateShotPrompt({
      workspacePath: log.workspacePath,
      taskId,
      shotPromptId,
      patch: { status },
    });
    setImageProductionTasks((current) => [
      task,
      ...current.filter((item) => item.id !== task.id),
    ].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
  }

  async function generateImageForShot(input: {
    taskId: string;
    shotPromptId: string;
    generationStage: "test" | "batch";
  }, context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    requireModelKeyReadable("image");
    const task = imageProductionTasks.find((item) => item.id === input.taskId);
    const shot = task?.shotPrompts.find((item) => item.id === input.shotPromptId);
    if (!task || !shot) throw new Error("请选择要生成的镜头 Prompt。");
    const prompt = shot.prompt.trim();
    if (!prompt) throw new Error("镜头 Prompt 为空，不能开始生成。");
    const referenceRefs = Array.from(new Set([
      ...shot.referenceImageRefs,
      ...task.referenceImageRefs,
      ...referenceImageRefs,
    ])).slice(0, 6);
    const nextParams = {
      ...paramsForImageGeneration(params),
      count: input.generationStage === "test" ? 1 : Math.max(1, params.count),
    };
    const generationInput: ImageGenerationRequest = {
      workspacePath: workspace,
      productionTaskId: task.id,
      shotPromptId: shot.id,
      generationStage: input.generationStage,
      productImageRefs: task.productImageRefs.length ? task.productImageRefs : productImageRefs,
      referenceImageRefs: referenceRefs,
      prompt,
      negativeConstraints: [
        ...task.negativeConstraints,
        ...(shot.negativePrompt ? [shot.negativePrompt] : []),
      ].filter(Boolean),
      consistencyRules: task.consistencyRules,
      promptMode: imagePromptMode,
      generationMode: imageGenerationMode,
      template: imageTemplate,
      templateInputs: imageTemplateInputs,
      watermark: imageWatermark,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      selectedSkillSlugs:
        skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: nextParams,
    };
    const submission = await submitMediaGeneration({
      kind: "image",
      input: generationInput,
    });
    const logId = submission.type === "task" ? submission.task.logId : submission.result.logId;
    const nextTask = submission.type === "fallback"
      ? await window.contentStudio.appendShotGenerationLog({
        workspacePath: workspace,
        taskId: task.id,
        shotPromptId: shot.id,
        generationStage: input.generationStage,
        logId,
      })
      : undefined;
    context?.throwIfCancelled();
    if (nextTask) updateImageProductionTaskState(nextTask);
    applyMediaGenerationSubmission(submission);
    await refresh(workspace);
    if (submission.type === "fallback") {
      const nextLogs = await window.contentStudio.listGenerationLogs(workspace);
      const log = nextLogs.find((item) => item.id === logId);
      if (log) await syncShotStatusFromLog(log);
    }
  }

  async function reviewShotAsset(input: {
    taskId: string;
    shotPromptId: string;
    logId: string;
    assetRef: string;
    status: "approved" | "rejected";
    note?: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const task = imageProductionTasks.find((item) => item.id === input.taskId);
    const shot = task?.shotPrompts.find((item) => item.id === input.shotPromptId);
    const log = logs.find((item) => item.id === input.logId);
    if (!task || !shot || !log) throw new Error("缺少镜头、任务或生成记录，无法审核入库。");
    const stage = imageLogStage(log);
    const assetRefs = imageRefsFromGenerationLog(log);
    const assetIndex = Math.max(0, assetRefs.indexOf(input.assetRef));
    const review = await window.contentStudio.reviewAsset({
      workspacePath: workspace,
      workflowRunId: log.workflowRunId,
      productionTaskId: task.id,
      shotPromptId: shot.id,
      assetKey: generatedAssetKey(log.id, input.assetRef, assetIndex),
      kind: "image",
      sourceType: "generation-log",
      sourceId: log.id,
      path: input.assetRef,
      title: `${shot.title} · ${fileNameFromPath(input.assetRef)}`,
      status: input.status,
      note: input.note,
      tags: [
        "AI生图",
        "SOP生产",
        stage === "test" ? "测试生成" : "批量生成",
        task.title,
        shot.title,
      ],
    });
    setAssetReviews((current) => [
      review,
      ...current.filter((item) => item.assetKey !== review.assetKey),
    ]);
    const nextStatus: ShotPromptStatus = input.status === "rejected"
      ? "needs-rework"
      : stage === "test"
        ? "test-approved"
        : "approved";
    const nextTask = await window.contentStudio.updateShotPrompt({
      workspacePath: workspace,
      taskId: task.id,
      shotPromptId: shot.id,
      patch: {
        status: nextStatus,
        reviewIds: Array.from(new Set([...shot.reviewIds, review.id])),
      },
    });
    updateImageProductionTaskState(nextTask);
    await refresh(workspace);
  }

  function reviewForRework(input: ReworkAssetRequest): AssetReviewRecord | undefined {
    if (input.assetKey) {
      const review = assetReviews.find((item) => item.assetKey === input.assetKey);
      if (review) return review;
    }
    return assetReviews.find((item) =>
      item.path === input.path ||
      (input.sourceId && item.sourceId === input.sourceId && item.sourceType === input.sourceType),
    );
  }

  function buildReworkSource(input: ReworkAssetRequest): AssetReworkSource {
    const review = reviewForRework(input);
    const sourceLog =
      input.sourceType === "generation-log" && input.sourceId
        ? logs.find((log) => log.id === input.sourceId)
        : undefined;
    const sourceInput =
      input.sourceType === "input-source" && input.sourceId
        ? inputSources.find((source) => source.id === input.sourceId)
        : undefined;
    const draft = input.promptDraftId
      ? promptDrafts.find((item) => item.id === input.promptDraftId)
      : undefined;
    const workflowRunId =
      input.workflowRunId ??
      review?.workflowRunId ??
      sourceLog?.workflowRunId ??
      sourceInput?.workflowRunId ??
      draft?.workflowRunId;
    return {
      assetKey: input.assetKey ?? review?.assetKey ?? `${input.sourceType}:${input.sourceId ?? "manual"}:${input.path}`,
      kind: input.kind,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      path: input.path,
      title: input.title ?? review?.title,
      reviewId: review?.id,
      reviewNote: review?.note,
      promptDraftId: input.promptDraftId,
      workflowRunId,
    };
  }

  function assetKindLabel(kind: AssetReworkSource["kind"]): string {
    if (kind === "video") return "视频素材";
    if (kind === "overlay") return "绿幕文案图";
    return "图片素材";
  }

  function assetSourceLineageLabel(input: {
    source: AssetReworkSource;
    sourceLog?: GenerationLogEntry;
    sourceInput?: InputSourceRecord;
  }): string {
    if (input.sourceLog?.title) return `生成记录：${input.sourceLog.title}`;
    if (input.source.sourceType === "generation-log") return "生成记录已关联";
    if (input.sourceInput?.title) return `输入资料：${input.sourceInput.title}`;
    if (input.source.sourceType === "input-source") return "输入资料已关联";
    return "手动选择素材";
  }

  async function createReworkPromptVersion(
    input: ReworkAssetRequest,
    source: AssetReworkSource,
  ): Promise<PromptDraft | undefined> {
    const draftId = input.promptDraftId;
    if (!draftId) return undefined;
    const draft = promptDrafts.find((item) => item.id === draftId);
    if (!draft) return undefined;
    const previousContent = stripInternalTraceLinesFromPrompt(promptDraftActiveContent(draft) || input.promptText?.trim() || "");
    if (!previousContent) return undefined;
    const reason = source.reviewNote || "人工选择回炉重做。";
    const assetTitle = source.title ?? (source.path ? fileNameFromPath(source.path) : "原素材");
    const content = [
      "基于驳回素材回炉重做，保留原始事实来源、构图意图和合规边界。",
      `回炉原因：${reason}`,
      `原素材：${assetTitle}`,
      source.path ? `原素材文件：${fileNameFromPath(source.path)}` : "",
      source.reviewId ? "审核记录：已关联原素材记录" : "",
      "",
      previousContent,
    ].filter(Boolean).join("\n");
    const updated = await window.contentStudio.updatePromptDraft({
      workspacePath: requireWorkspace(),
      draftId,
      content,
      note: `素材回炉：${reason.slice(0, 80)}`,
      status: "draft",
    });
    setPromptDrafts((current) =>
      [updated, ...current.filter((item) => item.id !== updated.id)],
    );
    setActivePromptDraftId(updated.id);
    return updated;
  }

  async function reworkAsset(input: ReworkAssetRequest): Promise<void> {
    const source = buildReworkSource(input);
    if (input.kind === "image") {
      const sourceLog =
        input.sourceType === "generation-log" && input.sourceId
          ? logs.find((log) => log.id === input.sourceId)
          : undefined;
      const updatedDraft = await createReworkPromptVersion(input, source);
      const nextPrompt = updatedDraft
        ? promptDraftActiveContent(updatedDraft)
        : input.promptText?.trim();
      setImageReworkSource({
        ...source,
        promptDraftId: updatedDraft?.id ?? source.promptDraftId,
        workflowRunId: source.workflowRunId,
      });
      setImageWorkflowRunId(source.workflowRunId ?? "");
      if (sourceLog) {
        reuseImageLogInput(sourceLog);
        setImageWorkflowRunId(source.workflowRunId ?? sourceLog.workflowRunId ?? "");
        if (input.path) {
          setReferenceImageRefs((current) =>
            mergePathList([input.path], current, 6),
          );
        }
        if (nextPrompt) setImagePromptDraft(nextPrompt);
        return;
      }
      setReferenceImageRefs((current) =>
        input.path ? mergePathList([input.path], current, 6) : current,
      );
      if (nextPrompt) {
        setImagePromptDraft(nextPrompt);
        setImagePromptMode("free");
      }
      setActiveModule("image-production");
      return;
    }

    if (input.kind === "overlay") {
      if (input.promptDraftId) setActivePromptDraftId(input.promptDraftId);
      setActiveModule("image-green-screen");
      return;
    }

    if (input.promptDraftId) {
      if (input.path) {
        setVideoAssetRefs((current) =>
          mergePathList([input.path], current, 3),
        );
      }
      if (input.promptText?.trim()) {
        setVideoCustomRequirement(`基于驳回素材重做：${input.promptText.trim().slice(0, 300)}`);
      }
      usePromptDraftInVideo(input.promptDraftId);
      return;
    }
    if (input.path) {
      setVideoAssetRefs((current) =>
        current.includes(input.path) ? current : [input.path, ...current].slice(0, 3),
      );
    }
    if (input.promptText?.trim()) {
      setVideoCustomRequirement(`基于驳回素材重做：${input.promptText.trim().slice(0, 300)}`);
    }
    setActiveModule("video");
  }

  function successfulAssetPromptContent(input: {
    source: AssetReworkSource;
    review?: AssetReviewRecord;
    sourceLog?: GenerationLogEntry;
    sourceInput?: InputSourceRecord;
    relatedDraft?: PromptDraft;
    promptText?: string;
    sceneCardIds: string[];
  }): string {
    const assetTitle = input.source.title ?? (input.source.path ? fileNameFromPath(input.source.path) : "未命名素材");
    const previousPrompt =
      stripInternalTraceLinesFromPrompt(
        input.promptText?.trim() ||
        promptDraftActiveContent(input.relatedDraft) ||
        "",
      ) ||
      (input.sourceLog ? extractPromptFromLog(input.sourceLog) : "") ||
      input.sourceInput?.summary ||
      "";
    return [
      "任务：成功素材反向沉淀 Prompt",
      "",
      "目标：",
      "把已经通过人工审核的素材沉淀成可复用 Prompt 草稿，后续可继续物化为 Skill。",
      "",
      "素材来源：",
      `- 素材：${assetTitle}`,
      input.source.path ? `- 文件：${fileNameFromPath(input.source.path)}` : "",
      `- 类型：${assetKindLabel(input.source.kind)}`,
      `- 来源：${assetSourceLineageLabel(input)}`,
      input.source.workflowRunId ? "- 关联历史：已关联运行记录" : "- 关联历史：未关联",
      input.relatedDraft ? `- 原提示词草稿：${input.relatedDraft.title}` : "- 原提示词草稿：未关联",
      input.sceneCardIds.length ? `- 关联场景卡：${input.sceneCardIds.length} 张` : "- 关联场景卡：未关联",
      "",
      "审核结论：",
      `- 状态：${input.review?.status === "approved" ? "人工审核通过" : "未找到通过审核记录"}`,
      input.review?.note ? `- 审核备注：${input.review.note}` : "- 审核备注：未记录",
      "",
      "可复用标签：",
      "- 成功素材",
      `- ${input.source.kind === "video" ? "视频素材" : "图片素材"}`,
      input.source.workflowRunId ? "- 历史可追溯" : "",
      input.sceneCardIds.length ? "- 场景库关联" : "",
      "",
      "复用 Prompt 草稿：",
      previousPrompt || "原始 Prompt 未记录。复用前请先人工补充主体、场景、镜头、风格、负面约束和合规边界。",
      "",
      "复用要求：",
      "- 只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。",
      "- 保留事实来源、构图意图、真实感要求和合规边界。",
      "- 下游生成前需要人工确认产品事实、平台规则和禁用表达。",
    ].filter(Boolean).join("\n");
  }

  async function distillAssetPrompt(input: ReworkAssetRequest): Promise<void> {
    if (input.kind === "overlay") throw new Error("绿幕文案图请从原 Prompt 或文案卡继续沉淀。");
    const workspace = requireWorkspace();
    const source = buildReworkSource(input);
    const review = reviewForRework(input);
    if (review?.status !== "approved") throw new Error("请先通过素材审核，再沉淀成功素材 Prompt。");
    const sourceLog =
      input.sourceType === "generation-log" && input.sourceId
        ? logs.find((log) => log.id === input.sourceId)
        : undefined;
    const sourceInput =
      input.sourceType === "input-source" && input.sourceId
        ? inputSources.find((item) => item.id === input.sourceId)
        : undefined;
    const relatedDraft = input.promptDraftId
      ? promptDrafts.find((draft) => draft.id === input.promptDraftId)
      : undefined;
    const sceneCardIds = Array.from(new Set([
      ...(input.sceneCardIds ?? []),
      ...(sourceLog?.sceneCardIds ?? []),
      ...(sourceInput?.relatedSceneCardIds ?? []),
      ...(relatedDraft?.sceneCardIds ?? []),
    ].filter(Boolean)));
    const text = successfulAssetPromptContent({
      source,
      review,
      sourceLog,
      sourceInput,
      relatedDraft,
      promptText: input.promptText,
      sceneCardIds,
    });
    const registeredSource = await window.contentStudio.registerInputSource({
      workspacePath: workspace,
      workflowRunId: source.workflowRunId,
      kind: input.kind,
      purpose: "successful-asset",
      sensitivity: "internal",
      title: `成功素材沉淀 / ${source.title ?? fileNameFromPath(input.path)}`,
      sourcePath: input.path,
      summary: `已通过素材反向沉淀 Prompt：${source.title ?? fileNameFromPath(input.path)}`,
      text,
      relatedPromptDraftId: input.promptDraftId,
      relatedSceneCardIds: sceneCardIds,
      tags: Array.from(new Set([
        "successful-asset",
        "prompt-distilled",
        input.kind,
        ...(source.workflowRunId ? ["run-trace"] : []),
      ])),
    });
    const draft = await window.contentStudio.createPromptDraftFromContent({
      workspacePath: workspace,
      workflowRunId: source.workflowRunId,
      title: `成功素材 Prompt：${source.title ?? fileNameFromPath(input.path)}`,
      purpose: input.kind === "video" ? "video" : "image",
      userIntent: `复用通过审核素材「${source.title ?? fileNameFromPath(input.path)}」的成功经验。`,
      inputSourceIds: [registeredSource.id],
      sceneCardIds,
      content: text,
      note: "由通过审核素材反向沉淀。",
      model: "local-successful-asset-distiller",
      status: "confirmed",
    });
    setInputSources((current) => [registeredSource, ...current.filter((item) => item.id !== registeredSource.id)]);
    setPromptDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    setActivePromptDraftId(draft.id);
    setActiveModule(promptWorkbenchModuleForPurpose(draft.purpose));
    await refresh(workspace);
  }

  async function generatePromptPack(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const citations = citationsForRequest;
    if (citations.length === 0) throw new Error("请先选择至少一条知识引用。");
    const pack = await window.contentStudio.generatePromptPack({
      workspacePath: workspace,
      citations,
      name: activeKnowledgeBase?.title
        ? `${activeKnowledgeBase.title}提示词包`
        : `${inputSources.find((source) => citations[0]?.knowledgeBaseId === `input-source:${source.id}`)?.title ?? "布谷内容工厂"}提示词包`,
    });
    context?.throwIfCancelled();
    setPromptPacks((current) => [pack, ...current]);
    setActivePromptPackId(pack.id);
    await refresh(workspace);
  }

  async function generateSceneCards(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const citations = citationsForRequest;
    let promptPackId =
      activePromptPack && sameCitationSet(activePromptPack.citations, citations)
        ? activePromptPack.id
        : undefined;
    if (!promptPackId) {
      if (citations.length === 0) throw new Error("请先导入知识库或登记输入源，再生成场景库。");
      const pack = await window.contentStudio.generatePromptPack({
        workspacePath: workspace,
        citations,
        name: preferredKnowledgeSource?.kind === "brand" && activeBrandKnowledgeBase
          ? `${activeBrandKnowledgeBase.title}提示词包`
          : preferredKnowledgeSource?.kind === "ip" && activeIpKnowledgeBase
            ? `${activeIpKnowledgeBase.title}提示词包`
            : activeKnowledgeBase?.title
              ? `${activeKnowledgeBase.title}提示词包`
              : "布谷内容工厂提示词包",
      });
      context?.throwIfCancelled();
      setPromptPacks((current) => [pack, ...current]);
      setActivePromptPackId(pack.id);
      promptPackId = pack.id;
    }
    const cards = await window.contentStudio.generateSceneCards({
      workspacePath: workspace,
      promptPackId,
      citations,
      count: 5,
    });
    context?.throwIfCancelled();
    setSceneCards((current) => [...cards, ...current]);
    setSelectedSceneIds(cards.slice(0, 2).map((card) => card.id));
    setActiveModule("knowledge-scenes");
    await refresh(workspace);
  }

  async function savePromptPackDraft(): Promise<void> {
    const workspace = requireWorkspace();
    if (!activePromptPack) throw new Error("请先生成提示词包。");
    const updated = await window.contentStudio.updatePromptPack({
      ...activePromptPack,
      brandVoice: promptPackDraft.brandVoice,
      visualStyle: promptPackDraft.visualStyle,
    });
    setPromptPacks((current) =>
      current.map((pack) => (pack.id === updated.id ? updated : pack)),
    );
    await refresh(workspace);
  }

  async function saveSceneCardDraft(): Promise<void> {
    const workspace = requireWorkspace();
    if (!activeEditableScene) throw new Error("请先生成场景卡。");
    const updated = await window.contentStudio.updateSceneCard({
      ...activeEditableScene,
      title: sceneCardDraft.title,
      imageMaterialSuggestion: sceneCardDraft.imageMaterialSuggestion,
      videoMaterialSuggestion: sceneCardDraft.videoMaterialSuggestion,
    });
    setSceneCards((current) =>
      current.map((card) => (card.id === updated.id ? updated : card)),
    );
    await refresh(workspace);
  }

  async function updateSceneCard(input: SceneCard): Promise<void> {
    const workspace = requireWorkspace();
    const updated = await window.contentStudio.updateSceneCard(input);
    setSceneCards((current) =>
      current.map((card) => (card.id === updated.id ? updated : card)),
    );
    setSelectedSceneIds((current) =>
      current.includes(updated.id) ? current : [updated.id, ...current].slice(0, 6),
    );
    await refresh(workspace);
  }

  async function materializePromptDraftToSkill(input: {
    draftId: string;
    content: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const promptDraft =
      promptDrafts.find((item) => item.id === input.draftId) ??
      activePromptDraft;
    if (!promptDraft) throw new Error("请先选择一个 Prompt 草稿。");
    if (!input.content.trim()) throw new Error("Skill 草案内容不能为空。");
    const slug = uniqueSkillSlug(skillSlugFromTitle(promptDraft.title), skills);
    const result = await window.contentStudio.createSkill({
      workspacePath: workspace,
      slug,
      name: promptDraft.title,
      description: `由提示词草稿「${promptDraft.title}」物化的布谷本地 skill。`,
      instructions: buildSkillInstructionsFromPromptDraft(promptDraft, input.content),
    });
    const updatedDraft = await window.contentStudio.updatePromptDraft({
      workspacePath: workspace,
      draftId: promptDraft.id,
      content: input.content,
      note: `已物化为 Skill：${result.skill.metadata.name}`,
      status: "materialized",
      materializedTarget: "skill",
    });
    setSkills(result.skills);
    setActiveSkillKey(skillKey(result.skill));
    setPromptDrafts((current) =>
      current.map((item) => (item.id === updatedDraft.id ? updatedDraft : item)),
    );
    setActivePromptDraftId(updatedDraft.id);
    setActiveModule("skills");
    await refresh(workspace);
  }

  function workflowStepOutputValue(
    run: WorkflowRunRecord | undefined,
    keys: string[],
  ): string | undefined {
    if (!run) return undefined;
    for (const step of run.steps) {
      if (!step.output || typeof step.output !== "object" || Array.isArray(step.output)) continue;
      const output = step.output as Record<string, unknown>;
      for (const key of keys) {
        const value = output[key];
        if (typeof value === "string" && value.trim()) return value;
      }
    }
    return undefined;
  }

  function workflowStepOutputValues(
    run: WorkflowRunRecord | undefined,
    keys: string[],
  ): string[] {
    if (!run) return [];
    const values: string[] = [];
    for (const step of run.steps) {
      if (!step.output || typeof step.output !== "object" || Array.isArray(step.output)) continue;
      const output = step.output as Record<string, unknown>;
      for (const key of keys) {
        const value = output[key];
        if (typeof value === "string" && value.trim()) values.push(value);
        if (Array.isArray(value)) {
          values.push(...value.filter((item): item is string => typeof item === "string" && item.trim().length > 0));
        }
      }
    }
    return Array.from(new Set(values));
  }

  function promptDraftContent(draftId?: string): string {
    const draft = draftId ? promptDrafts.find((item) => item.id === draftId) : undefined;
    return promptDraftActiveContent(draft);
  }

  function promptDraftActiveContent(draft?: PromptDraft): string {
    if (!draft) return "";
    return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
      ?? draft.versions[draft.versions.length - 1]?.content
      ?? "";
  }

  function collectWorkflowOutputRefs(value: unknown, refs: Set<string>): void {
    if (typeof value === "string" && value.trim()) {
      refs.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => collectWorkflowOutputRefs(item, refs));
      return;
    }
    if (!value || typeof value !== "object") return;
    Object.values(value as Record<string, unknown>).forEach((item) => collectWorkflowOutputRefs(item, refs));
  }

  function workflowArtifactRefIds(run: WorkflowRunRecord | undefined, prefix: string): string[] {
    if (!run) return [];
    const marker = `${prefix}:`;
    return Array.from(new Set(run.artifactRefs
      .filter((ref) => ref.startsWith(marker))
      .map((ref) => ref.slice(marker.length).trim())
      .filter(Boolean)));
  }

  function firstWorkflowArtifactRefId(run: WorkflowRunRecord | undefined, prefix: string): string | undefined {
    return workflowArtifactRefIds(run, prefix)[0];
  }

  function promptDraftIdFromWorkflowRun(run?: WorkflowRunRecord): string | undefined {
    return workflowStepOutputValue(run, ["promptDraftId", "expectedPromptDraftId", "relatedPromptDraftId"])
      ?? firstWorkflowArtifactRefId(run, "prompt-draft");
  }

  function workflowRunReferences(run: WorkflowRunRecord, refs: string[]): boolean {
    const refSet = new Set(run.artifactRefs);
    const outputRefs = new Set<string>();
    run.steps.forEach((step) => collectWorkflowOutputRefs(step.output, outputRefs));
    return refs.filter(Boolean).some((ref) => {
      const normalized = ref.replace(/^[^:]+:/, "");
      return refSet.has(ref) || refSet.has(normalized) || outputRefs.has(ref) || outputRefs.has(normalized);
    });
  }

  function workflowKeyMatches(key: string, baseKey: string): boolean {
    return key === baseKey || key.startsWith(`${baseKey}-draft-`);
  }

  function isVideoMaterialWorkflow(run: WorkflowRunRecord): boolean {
    return workflowKeyMatches(run.workflowKey, "video-material-package");
  }

  function selectWorkflowRunContext(run: WorkflowRunRecord): string | undefined {
    setActiveWorkflowRunId(run.id);
    const brandKnowledgeBaseId = workflowStepOutputValue(run, ["brandKnowledgeBaseId"])
      ?? firstWorkflowArtifactRefId(run, "brand-knowledge-base");
    const ipKnowledgeBaseId = workflowStepOutputValue(run, ["ipKnowledgeBaseId"])
      ?? firstWorkflowArtifactRefId(run, "ip-knowledge-base");
    const promptPackId = workflowStepOutputValue(run, ["promptPackId"])
      ?? firstWorkflowArtifactRefId(run, "prompt-pack");
    const sceneCardIds = Array.from(new Set([
      ...workflowStepOutputValues(run, ["sceneCardIds"]),
      ...workflowArtifactRefIds(run, "scene-card"),
    ]));
    const agentSessionId = workflowStepOutputValue(run, ["agentSessionId"]);
    const promptDraftId = promptDraftIdFromWorkflowRun(run);
    if (brandKnowledgeBaseId) selectBrandKnowledgeBase(brandKnowledgeBaseId);
    if (ipKnowledgeBaseId) selectIpKnowledgeBase(ipKnowledgeBaseId);
    if (promptPackId) setActivePromptPackId(promptPackId);
    if (sceneCardIds.length) setSelectedSceneIds(sceneCardIds);
    if (agentSessionId) setActiveAgentPromptSessionId(agentSessionId);
    if (promptDraftId) setActivePromptDraftId(promptDraftId);
    return promptDraftId;
  }

  function workflowRunById(runId: string): WorkflowRunRecord {
    const run = workflowRuns.find((item) => item.id === runId);
    if (!run) throw new Error("历史运行记录不存在，请刷新后重试。");
    return run;
  }

  function openRunTrace(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("assets");
  }

  function openTraceGenerationLog(logId: string): void {
    const log = logs.find((item) => item.id === logId);
    if (!log) throw new Error("生成记录不存在，请刷新后重试。");
    if (log.workflowRunId) {
      const run = workflowRuns.find((item) => item.id === log.workflowRunId);
      if (run) selectWorkflowRunContext(run);
    }
    setHistoryFilter(log.kind);
    setActiveModule("assets");
  }

  function openTracePromptDraft(draftId: string): void {
    const draft = promptDrafts.find((item) => item.id === draftId);
    if (!draft) throw new Error("提示词草稿不存在，请刷新后重试。");
    setActivePromptDraftId(draft.id);
    setSelectedSceneIds(draft.sceneCardIds ?? []);
    if (draft.workflowRunId) {
      const run = workflowRuns.find((item) => item.id === draft.workflowRunId);
      if (run) selectWorkflowRunContext(run);
    }
    setActiveModule(promptWorkbenchModuleForPurpose(draft.purpose));
  }

  function openTraceSceneCards(sceneCardIds: string[]): void {
    const ids = Array.from(new Set(sceneCardIds.filter(Boolean))).slice(0, 12);
    if (ids.length === 0) throw new Error("当前产物没有关联场景卡。");
    const cards = sceneCards.filter((card) => ids.includes(card.id));
    if (cards.length === 0) throw new Error("关联场景卡已不在当前工作区，请刷新后重试。");
    setSelectedSceneIds(cards.map((card) => card.id));
    if (cards[0]?.promptPackId) setActivePromptPackId(cards[0].promptPackId);
    if (cards[0]?.workflowRunId) {
      const run = workflowRuns.find((item) => item.id === cards[0].workflowRunId);
      if (run) selectWorkflowRunContext(run);
    }
    setActiveModule("image-scene-prompts");
  }

  function workflowRunForPromptDraft(draftId?: string): WorkflowRunRecord | undefined {
    if (!draftId) return undefined;
    const draft = promptDrafts.find((item) => item.id === draftId);
    if (draft?.workflowRunId) {
      const directRun = workflowRuns.find((run) => run.id === draft.workflowRunId);
      if (directRun) return directRun;
    }
    return workflowRuns.find((run) => workflowRunReferences(run, [`prompt-draft:${draftId}`, draftId]));
  }

  function workflowRunForAssetReview(input: Omit<ReviewAssetInput, "workspacePath">): WorkflowRunRecord | undefined {
    if (input.workflowRunId) {
      const directRun = workflowRuns.find((run) => run.id === input.workflowRunId);
      if (directRun) return directRun;
    }
    const sourceLog =
      input.sourceType === "generation-log" && input.sourceId
        ? logs.find((log) => log.id === input.sourceId)
        : undefined;
    if (sourceLog?.workflowRunId) {
      const directRun = workflowRuns.find((run) => run.id === sourceLog.workflowRunId);
      if (directRun) return directRun;
    }
    const sourceInput =
      input.sourceType === "input-source" && input.sourceId
        ? inputSources.find((source) => source.id === input.sourceId)
        : undefined;
    if (sourceInput?.workflowRunId) {
      const directRun = workflowRuns.find((run) => run.id === sourceInput.workflowRunId);
      if (directRun) return directRun;
    }
    const refs = [
      input.sourceType === "generation-log" && input.sourceId ? `generation-log:${input.sourceId}` : "",
      input.sourceType === "generation-log" && input.sourceId ? input.sourceId : "",
      input.sourceType === "input-source" && input.sourceId ? `input-source:${input.sourceId}` : "",
      input.sourceType === "overlay-card" && input.sourceId ? `overlay-card:${input.sourceId}` : "",
      input.assetKey,
      input.path,
    ].filter(Boolean);
    return workflowRuns
      .filter((run) => isVideoMaterialWorkflow(run))
      .find((run) => workflowRunReferences(run, refs));
  }

  function workflowRunForMixAssets(assets: MixPackageAssetInput[]): WorkflowRunRecord | undefined {
    for (const asset of assets) {
      const sourceLog =
        asset.sourceType === "generation-log" && asset.sourceId
          ? logs.find((log) => log.id === asset.sourceId)
          : undefined;
      if (sourceLog?.workflowRunId) {
        const run = workflowRuns.find((item) => item.id === sourceLog.workflowRunId);
        if (run) return run;
      }
      const sourceInput =
        asset.sourceType === "input-source" && asset.sourceId
          ? inputSources.find((source) => source.id === asset.sourceId)
          : undefined;
      if (sourceInput?.workflowRunId) {
        const run = workflowRuns.find((item) => item.id === sourceInput.workflowRunId);
        if (run) return run;
      }
      const draftRun = workflowRunForPromptDraft(asset.promptDraftId);
      if (draftRun) return draftRun;
    }
    const refs = assets.flatMap((asset) => [
      asset.promptDraftId ? `prompt-draft:${asset.promptDraftId}` : "",
      asset.sourceType === "generation-log" && asset.sourceId ? `generation-log:${asset.sourceId}` : "",
      asset.sourceType === "generation-log" && asset.sourceId ? asset.sourceId : "",
      asset.sourceType === "input-source" && asset.sourceId ? `input-source:${asset.sourceId}` : "",
      asset.sourceType === "overlay-card" && asset.sourceId ? `overlay-card:${asset.sourceId}` : "",
      asset.id,
      asset.path,
    ]).filter(Boolean);
    return workflowRuns.find((run) => workflowRunReferences(run, refs));
  }

  function teamKnowledgeReleaseReference(release?: ContentKnowledgeRelease): ContentKnowledgeReleaseReference | undefined {
    if (!release) return undefined;
    return {
      id: release.serverReleaseId || release.id,
      title: release.title,
      version: release.version,
      contentKnowledgeMapId: release.contentKnowledgeMapId,
      contentKnowledgeMapTitle: release.contentKnowledgeMapTitle,
      packageObjectKey: release.packageObjectKey,
      packagePublicUrl: release.packagePublicUrl,
      packageUploadStatus: release.packageUploadStatus,
    };
  }

  function defaultTeamKnowledgeRelease(): ContentKnowledgeRelease | undefined {
    const published = contentKnowledgeReleases.filter((release) => release.status === "published");
    if (!published.length) return undefined;
    if (activeContentKnowledgeMap) {
      if (activeContentKnowledgeMap.teamSync.releaseId) {
        const matched = published.find((release) =>
          release.serverReleaseId === activeContentKnowledgeMap.teamSync.releaseId ||
          release.id === activeContentKnowledgeMap.teamSync.releaseId,
        );
        if (matched) return matched;
      }
      const matched = published.find((release) => release.contentKnowledgeMapId === activeContentKnowledgeMap.id);
      if (matched) return matched;
      return undefined;
    }
    return published[0];
  }

  async function generateArticle(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateArticle({
      workspacePath: workspace,
      articleType,
      platform: articlePlatform,
      audience: articleAudience,
      topic:
        articleTopic || activePromptPack?.name || "成型知识库驱动的内容工程",
      tone: articleTone || activePromptPack?.brandVoice || "专业、自然、克制",
      length: articleLength,
      customRequirement: articleRequirement,
      citations: citationsForRequest,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      assetRefs: [...productImageRefs, ...referenceImageRefs],
      selectedSkillSlugs:
        skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: { textModel: params.textModel },
    });
    context?.throwIfCancelled();
    setArticleResult(result);
    setArticleExportPath(null);
    setActiveModule("article");
    await refresh(workspace);
  }

  async function exportArticleMarkdown(): Promise<void> {
    const workspace = requireWorkspace();
    if (!articleResult) throw new Error("请先生成文章草稿，再导出 Markdown。");
    const exported = await window.contentStudio.exportMarkdown({
      workspacePath: workspace,
      sourceLogId: articleResult.logId,
      suggestedName: `${articleResult.titleCandidates[0] || "buguai-draft"}.md`,
      markdown: articleResult.markdown,
    });
    setArticleExportPath(exported);
    await refresh(workspace);
  }

  async function exportArticlePlatformDraft(): Promise<void> {
    const workspace = requireWorkspace();
    if (!articleResult) throw new Error("请先生成文章草稿，再导出平台草稿包。");
    const articlePromptDraftId = articleWorkflowRunId
      ? promptDraftIdFromWorkflowRun(workflowRunById(articleWorkflowRunId))
      : activePromptDraft?.purpose === "article"
        ? activePromptDraft.id
        : undefined;
    const exported = await window.contentStudio.exportPlatformDraft({
      workspacePath: workspace,
      workflowRunId: articleWorkflowRunId || undefined,
      promptDraftId: articlePromptDraftId,
      sourceLogId: articleResult.logId,
      platform: articlePlatform,
      title: articleResult.titleCandidates[0] || articleTopic || "文章草稿",
      markdown: articleResult.markdown,
      publishCheck: articleResult.publishCheck,
      topic: articleTopic,
      audience: articleAudience,
      tone: articleTone,
    });
    setArticleExportPath(exported.packageDir);
    await refresh(workspace);
  }

  async function copyPlatformDraftText(draftId: string): Promise<void> {
    const workspace = requireWorkspace();
    const text = await window.contentStudio.readPlatformDraftCopyText({
      workspacePath: workspace,
      draftId,
    });
    await navigator.clipboard.writeText(text);
    setCopiedPlatformDraftId(draftId);
    window.setTimeout(
      () => setCopiedPlatformDraftId((current) => (current === draftId ? null : current)),
      1400,
    );
  }

  async function copyLogPrompt(log: GenerationLogEntry): Promise<void> {
    await navigator.clipboard.writeText(extractPromptFromLog(log));
    setCopiedLogId(log.id);
    window.setTimeout(
      () => setCopiedLogId((current) => (current === log.id ? null : current)),
      1400,
    );
  }

  async function updateGenerationLogReview(
    input: Omit<UpdateGenerationLogReviewInput, "workspacePath">,
  ): Promise<void> {
    const workspace = requireWorkspace();
    await window.contentStudio.updateGenerationLogReview({
      workspacePath: workspace,
      ...input,
    });
    await refresh(workspace);
  }

  async function revealLogPath(log: GenerationLogEntry): Promise<void> {
    const [firstPath] = extractGeneratedAssetRefsFromLog(log);
    const [fallbackPath] = extractLocalRefsFromLog(log);
    const targetPath = firstPath ?? fallbackPath;
    if (!targetPath) throw new Error("这条历史没有可打开的本地素材路径。");
    await revealPath(targetPath);
  }

  function reuseImageLogInput(log: GenerationLogEntry): void {
    const input = imageRequestFromLog(log);
    if (!input) throw new Error("这条历史缺少可复用的图片生成参数。");
    setImageWorkflowRunId("");
    const nextProductRefs = cleanPathList(input.productImageRefs);
    const nextReferenceRefs = cleanPathList(input.referenceImageRefs);
    if (nextProductRefs.length) {
      setProductImageRefs((current) =>
        mergePathList(nextProductRefs, current, 10),
      );
    }
    if (nextReferenceRefs.length) {
      setReferenceImageRefs((current) =>
        mergePathList(nextReferenceRefs, current, 6),
      );
    }
    if (typeof input.prompt === "string") setImagePromptDraft(input.prompt);
    if (input.promptMode === "free" || input.promptMode === "preset") {
      setImagePromptMode(input.promptMode);
    }
    if (input.generationMode === "smart" || input.generationMode === "fixed") {
      setImageGenerationMode(input.generationMode);
    }
    if (typeof input.template === "string") setImageTemplate(input.template);
    if (input.templateInputs && typeof input.templateInputs === "object") {
      setImageTemplateInputs(
        input.templateInputs as Record<string, string | string[]>,
      );
    }
    if (typeof input.watermark === "boolean") setImageWatermark(input.watermark);
    setActiveModule("image-production");
  }

  function routeAiImageCommand(input: string): string {
    const prompt = input
      .replace(/(^|\s)@(图片|image)\s*/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    const nextPrompt =
      prompt ||
      activeScenes[0]?.imageMaterialSuggestion ||
      activePromptPack?.imagePromptFragments[0] ||
      "根据知识库生成一张电商场景图，突出产品主体和真实使用场景。";
    setImagePromptDraft(nextPrompt);
    setImagePromptMode("free");
    setImageWorkflowRunId("");
    setActiveModule("image-production");
    return nextPrompt;
  }

  function useGeneratedImageAsReference(path: string): void {
    setReferenceImageRefs((current) =>
      current.includes(path) ? current : [...current, path].slice(0, 6),
    );
  }

  async function revealPath(path: string): Promise<void> {
    const result = await window.contentStudio.revealPath(path);
    if (!result.ok) throw new Error(result.error ?? "无法打开本地位置。");
  }

  async function exportAsset(path: string): Promise<void> {
    const exported = await window.contentStudio.exportAsset({
      sourcePath: path,
      suggestedName: fileNameFromPath(path),
    });
    if (!exported) return;
    await revealPath(exported);
  }

  async function retryLog(
    log: GenerationLogEntry,
    context?: ActionContext,
  ): Promise<void> {
    const workspace = requireWorkspace();
    if (!log.input || typeof log.input !== "object")
      throw new Error("这条历史缺少可重试的输入 payload。");

    if (log.kind === "article") {
      const result = await window.contentStudio.generateArticle(
        log.input as ArticleGenerationRequest,
      );
      context?.throwIfCancelled();
      setArticleResult(result);
      setArticleExportPath(null);
      setActiveModule("article");
    } else if (log.kind === "image") {
      const result = await window.contentStudio.generateImage(
        log.input as ImageGenerationRequest,
      );
      context?.throwIfCancelled();
      setMediaResult(result);
      setActiveModule("image-production");
    } else if (log.kind === "video") {
      const result = await window.contentStudio.generateVideo(
        log.input as VideoGenerationRequest,
      );
      context?.throwIfCancelled();
      setMediaResult(result);
      setActiveModule("video");
    } else if (log.kind === "video-breakdown") {
      const result = await window.contentStudio.analyzeVideo(
        log.input as VideoBreakdownRequest,
      );
      context?.throwIfCancelled();
      setVideoBreakdown(result);
      setActiveModule("video");
    } else if (log.kind === "video-script") {
      const result = await window.contentStudio.generateVideoScript(
        log.input as VideoScriptGenerationRequest,
      );
      context?.throwIfCancelled();
      setVideoScript(result);
      setActiveModule("video");
    } else if (log.kind === "prompt-pack") {
      const pack = await window.contentStudio.generatePromptPack(
        log.input as GeneratePromptPackInput,
      );
      context?.throwIfCancelled();
      setPromptPacks((current) => [pack, ...current]);
      setActivePromptPackId(pack.id);
      setActiveModule("knowledge");
    } else if (log.kind === "scene-card") {
      const cards = await window.contentStudio.generateSceneCards(
        log.input as GenerateSceneCardsInput,
      );
      context?.throwIfCancelled();
      setSceneCards((current) => [...cards, ...current]);
      setSelectedSceneIds(cards.slice(0, 2).map((card) => card.id));
      setActiveModule("image-production");
    } else {
      throw new Error(`暂不支持重试该历史类型：${log.kind}`);
    }

    await refresh(workspace);
  }

  async function generateImage(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    if (params.runMode !== "single")
      throw new Error("批量 / 定时队列当前未启用，请先切回单次处理。");
    requireModelKeyReadable("image");
    const workflowRun = imageWorkflowRunId
      ? workflowRuns.find((run) => run.id === imageWorkflowRunId)
      : imageReworkSource?.workflowRunId
        ? workflowRuns.find((run) => run.id === imageReworkSource.workflowRunId)
      : undefined;
    const generationInput: ImageGenerationRequest = {
      workspacePath: workspace,
      workflowRunId: workflowRun?.id,
      reworkSource: imageReworkSource ?? undefined,
      productImageRefs,
      referenceImageRefs,
      prompt: suggestedImagePrompt,
      promptMode: imagePromptMode,
      generationMode: imageGenerationMode,
      template: imageTemplate,
      templateInputs: imageTemplateInputs,
      watermark: imageWatermark,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      selectedSkillSlugs:
        skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: paramsForImageGeneration(params),
    };
    const submission = await submitMediaGeneration({
      kind: "image",
      input: generationInput,
    });
    context?.throwIfCancelled();
    applyMediaGenerationSubmission(submission);
    await refresh(workspace);
  }

  async function generateVideo(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    requireModelKeyReadable("video");
    const nextDurationSeconds =
      Number.isFinite(videoDurationSeconds) && videoDurationSeconds >= 5
        ? Math.min(300, Math.round(videoDurationSeconds))
        : 18;
    const submission = await submitMediaGeneration({
      kind: "video",
      input: {
        workspacePath: workspace,
        imageAssetRefs: [...productImageRefs, ...referenceImageRefs],
        videoAssetRefs,
        audioAssetRefs,
        prompt: suggestedVideoPrompt,
        script: videoScript?.script || activeScenes[0]?.voiceoverDirection,
        promptPackId: activePromptPack?.id,
        sceneCardIds: selectedSceneIdsForRequest,
        citations: citationsForRequest,
        selectedSkillSlugs:
          skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
        params: {
          videoModel: params.videoModel,
          aspectRatio: params.aspectRatio,
          durationSeconds: nextDurationSeconds,
        },
      },
    });
    context?.throwIfCancelled();
    applyMediaGenerationSubmission(submission);
    await refresh(workspace);
  }

  async function generateShowcaseVideo(
    input: ShowcaseVideoHandoffInput,
    context?: ActionContext,
  ): Promise<void> {
    const workspace = requireWorkspace();
    requireModelKeyReadable("video");
    const nextImageRefs = cleanPathList(input.imageAssetRefs).slice(0, 7);
    const nextVideoRefs = cleanPathList(input.videoAssetRefs).slice(0, 3);
    const nextAudioRefs = cleanPathList(input.audioAssetRefs).slice(0, 1);
    const nextPrompt = input.prompt.trim();
    const nextDurationSeconds = input.durationSeconds ?? videoDurationSeconds;
    const nextAspectRatio = input.aspectRatio ?? params.aspectRatio;
    setSelectedSceneIds([]);
    setProductImageRefs(nextImageRefs);
    setReferenceImageRefs([]);
    setVideoAssetRefs(nextVideoRefs);
    setAudioAssetRefs(nextAudioRefs);
    setVideoCustomRequirement(nextPrompt);
    setVideoDurationSeconds(nextDurationSeconds);
    if (input.featureTitle || input.selectedCaseTitle) {
      setVideoProductName(input.selectedCaseTitle || input.featureTitle || videoProductName);
    }
    if (input.aspectRatio) {
      setParams((current) => ({ ...current, aspectRatio: nextAspectRatio }));
    }
    const submission = await submitMediaGeneration({
      kind: "video",
      input: {
        workspacePath: workspace,
        imageAssetRefs: nextImageRefs,
        videoAssetRefs: nextVideoRefs,
        audioAssetRefs: nextAudioRefs,
        prompt: [
          nextPrompt,
          "",
          "## DressingKit AI 视频复刻参数",
          `- 功能：${input.featureTitle || input.featureId || "AI 视频"}`,
          input.selectedCaseTitle ? `- 示例：${input.selectedCaseTitle}` : "",
          input.storyboardCount ? `- 生图数量：${input.storyboardCount}` : "",
          input.resolution ? `- 分辨率/质量：${input.resolution}` : "",
          input.quality ? `- 图片质量：${input.quality}` : "",
        ].filter(Boolean).join("\n"),
        script: nextPrompt,
        featureId: input.featureId,
        featureTitle: input.featureTitle,
        selectedCaseTitle: input.selectedCaseTitle,
        promptPackId: activePromptPack?.id,
        sceneCardIds: [],
        citations: citationsForRequest,
        selectedSkillSlugs:
          skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
        params: {
          videoModel: params.videoModel,
          aspectRatio: nextAspectRatio,
          durationSeconds: nextDurationSeconds,
        },
      },
    });
    context?.throwIfCancelled();
    applyMediaGenerationSubmission(submission);
    await refresh(workspace);
  }

  function buildVideoPromptHandoffContent(): string {
    const materialLines = [
      ...productImageRefs.map((ref) => `- 产品图：${fileNameFromPath(ref)}`),
      ...referenceImageRefs.map((ref) => `- 参考图：${fileNameFromPath(ref)}`),
      ...videoAssetRefs.map((ref) => `- 参考视频：${fileNameFromPath(ref)}`),
      ...audioAssetRefs.map((ref) => `- 参考音频：${fileNameFromPath(ref)}`),
      videoUrl.trim() ? `- 参考视频链接：${videoUrl.trim()}` : "",
    ].filter(Boolean);
    const sceneLines = activeScenes.map((scene, index) => [
      `### 场景 ${index + 1}：${scene.title}`,
      `- 人群：${scene.audience}`,
      `- 痛点：${scene.painPoint}`,
      `- 场景：${scene.usageScene}`,
      `- 画面：${scene.visualComposition}`,
      `- 卖点：${scene.sellingPoint}`,
      `- 视频素材建议：${scene.videoMaterialSuggestion}`,
    ].join("\n"));
    const breakdownScoreLines = videoBreakdown ? [
      `- 拆解标题：${videoBreakdown.contentTitle || "未返回"}`,
      `- 参考指数：${formatBreakdownScore(videoBreakdown.referenceScore)}`,
      `- 分析可信度：${formatBreakdownRate(videoBreakdown.confidenceRate)}`,
      `- 策略丰富度：${formatBreakdownRate(videoBreakdown.richnessRate)}`,
      videoBreakdown.hook?.hookType?.value ? `- Hook 类型：${videoBreakdown.hook.hookType.value}（${formatBreakdownRate(videoBreakdown.hook.hookType.confidence)}）` : "",
      videoBreakdown.narrative?.framework?.value ? `- 叙事框架：${videoBreakdown.narrative.framework.value}（${formatBreakdownRate(videoBreakdown.narrative.framework.confidence)}）` : "",
    ].filter(Boolean) : [];
    const hookLines = videoBreakdown?.hook?.elements.map((element) =>
      `- ${element.timestampRange || "未标注时间"}：${element.name}，${element.description}`,
    ) ?? [];
    const narrativeLines = videoBreakdown?.narrative?.stages.map((stage) =>
      `- ${stage.timeRange || "未标注时间"}：${stage.name}，${stage.description}${stage.emotionShift ? `；情绪变化：${stage.emotionShift}` : ""}`,
    ) ?? [];
    const pacingLines = videoBreakdown?.pacing?.rhythm.slice(0, 12).map((item) =>
      `- ${item.timeRange || "未标注时间"}：${item.shotType} / 强度 ${item.intensity}；${item.description}${item.voiceover ? `；口播：${item.voiceover}` : ""}`,
    ) ?? [];
    const transcriptLines = videoBreakdown?.transcriptSegments?.slice(0, 12).map((segment) =>
      `- ${formatBreakdownScore(segment.startSec)}s-${formatBreakdownScore(segment.endSec)}s：${segment.text}`,
    ) ?? [];
    const breakdownLines = videoBreakdown?.segments.map((segment) =>
      `- ${segment.timeRange}：${segment.hook}；画面：${segment.visual}；口播：${segment.voiceover || "无"}；可复用点：${segment.reusablePoint}`,
    ) ?? [];
    const breakdownRiskLines = videoBreakdown?.risks.map((risk) => `- ${risk.level}：${risk.message}`) ?? [];
    const storyboardLines = videoScript?.storyboard.map((shot) => [
      `### 镜头 ${shot.shot}（${shot.duration}）`,
      shot.timeRange ? `时间：${shot.timeRange}` : "",
      shot.shotType ? `镜头类型：${shot.shotType}` : "",
      shot.character ? `角色：${shot.character}` : "",
      shot.scene ? `场景：${shot.scene}` : "",
      shot.cameraMovement ? `运镜：${shot.cameraMovement}` : "",
      `画面：${shot.visual}`,
      `口播：${shot.voiceover}`,
      `字幕：${shot.subtitle || "无"}`,
      `节奏：${shot.rhythm}`,
      shot.videoPrompt ? `视频 Prompt：${shot.videoPrompt}` : "",
      shot.imagePrompt ? `图片 Prompt：${shot.imagePrompt}` : "",
      shot.transitionHint ? `转场：${shot.transitionHint}` : "",
      shot.voiceStyle ? `语音风格：${shot.voiceStyle}` : "",
    ].filter(Boolean).join("\n")) ?? [];
    const productionSegmentLines = buildProductionSegments(videoScript?.storyboard ?? [], videoScript?.resourceFramework).map((segment, index) => [
      `### 段落 ${index + 1}：镜头 ${segment.shotNumbers}（${segment.externalDurationSeconds}s）`,
      `- 估算内容时长：${segment.totalDurationSeconds.toFixed(1)}s`,
      `- 角色：${segment.character}`,
      `- 场景：${segment.scene}`,
      "",
      segment.prompt,
    ].join("\n"));
    const characterPromptLines = buildCharacterPromptItems(videoScript?.resourceFramework).map((item, index) => [
      `### 角色 ${index + 1}：${item.title}`,
      `- ${item.meta}`,
      "",
      item.prompt,
    ].join("\n"));
    const scenePromptLines = buildScenePromptItems(videoScript?.resourceFramework).map((item, index) => [
      `### 场景 ${index + 1}：${item.title}`,
      `- ${item.meta}`,
      "",
      item.prompt,
    ].join("\n"));
    const productionReviewLines = buildVideoProductionReviewItems(videoScript).map((item) =>
      `- ${item.title}（${item.status}）：${item.detail}`,
    );
    const productionDeliveryLines = buildVideoProductionDeliveryItems({
      characterPromptCount: characterPromptLines.length,
      scenePromptCount: scenePromptLines.length,
      segmentCount: productionSegmentLines.length,
      hasScript: Boolean(videoScript),
    }).map((item) => `- ${item.title}（${item.status}）：${item.detail}`);
    const scriptResourceLines = videoScript?.resourceFramework ? [
      ...videoScript.resourceFramework.characters.map((character) =>
        `- 角色：${character.name}，${character.shotCount} 镜${character.voiceTraits ? `，${character.voiceTraits}` : ""}`,
      ),
      ...videoScript.resourceFramework.scenes.map((scene) =>
        `- 场景：${scene.name}，${scene.shotCount} 镜${scene.environment ? `，${scene.environment}` : ""}${scene.lighting ? `，${scene.lighting}` : ""}${scene.sceneImagePrompt ? `\n  场景图 Prompt：${scene.sceneImagePrompt}` : ""}`,
      ),
    ] : [];

    return [
      "# 视频 Prompt 交接",
      "",
      "## 使用边界",
      "- 软件只生成可复制到第三方视频平台的视频 Prompt。",
      "- 不创建外部任务，不轮询第三方任务状态。",
      "- 第三方生成后的成品视频需要由用户手动导入，并关联本提示词。",
      "",
      "## 本次设置",
      `- 产品名称：${videoProductName.trim() || "未填写"}`,
      `- 场景背景：${videoSceneBackground}`,
      `- 视频时长：${videoDurationSeconds} 秒`,
      `- 镜头数量：${videoShotCount}`,
      `- 字幕方式：${videoSubtitleModeLabel(videoSubtitleMode)}`,
      `- 视频语音：${videoVoiceStyle.trim() || "自然可信"}`,
      `- 画幅：${params.aspectRatio}`,
      videoCustomRequirement.trim() ? `- 额外要求：${videoCustomRequirement.trim()}` : "",
      "",
      "## 可复制视频 Prompt",
      suggestedVideoPrompt.trim(),
      materialLines.length ? ["", "## 本次素材", ...materialLines].join("\n") : "",
      sceneLines.length ? ["", "## 关联场景", ...sceneLines].join("\n\n") : "",
      breakdownScoreLines.length ? ["", "## 参考视频拆解评分", ...breakdownScoreLines].join("\n") : "",
      hookLines.length ? ["", "## Hook 构成", ...hookLines].join("\n") : "",
      narrativeLines.length ? ["", "## 叙事结构", ...narrativeLines].join("\n") : "",
      pacingLines.length ? ["", "## 节奏与镜头", ...pacingLines].join("\n") : "",
      transcriptLines.length ? ["", "## 原视频口播摘录", ...transcriptLines].join("\n") : "",
      breakdownLines.length ? ["", "## 参考视频拆解", ...breakdownLines].join("\n") : "",
      breakdownRiskLines.length ? ["", "## 拆解风险与边界", ...breakdownRiskLines].join("\n") : "",
      videoScript?.script ? ["", "## 新视频脚本", videoScript.script].join("\n") : "",
      scriptResourceLines?.length ? ["", "## 新脚本资源框架", ...scriptResourceLines].join("\n") : "",
      characterPromptLines.length ? ["", "## 角色参考图 Prompt", "- 复制到外部生图平台生成角色三视图。", ...characterPromptLines].join("\n\n") : "",
      scenePromptLines.length ? ["", "## 场景背景图 Prompt", "- 复制到外部生图平台生成无人物背景图。", ...scenePromptLines].join("\n\n") : "",
      productionSegmentLines.length ? ["", "## 外部生成段落", "- 每段按 5/10 秒复制到第三方视频平台；生成后手动导入成品视频。", ...productionSegmentLines].join("\n\n") : "",
      productionReviewLines.length ? ["", "## 审核预览", "- 只记录脚本发布检查和人工复核项，不伪造成品预览。", ...productionReviewLines].join("\n") : "",
      productionDeliveryLines.length ? ["", "## 合成导出交付", "- 外部生成和剪辑完成后，手动导入成品视频并关联本交接 Prompt。", ...productionDeliveryLines].join("\n") : "",
      storyboardLines.length ? ["", "## 分镜脚本", ...storyboardLines].join("\n\n") : "",
    ].filter((line) => line.trim().length > 0).join("\n");
  }

  async function openVideoPromptHandoff(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const content = buildVideoPromptHandoffContent();
    const source = await window.contentStudio.registerInputSource({
      workspacePath: workspace,
      kind: "manual-note",
      purpose: "task-input",
      sensitivity: "internal",
      title: "视频 Prompt 交接资料",
      text: content,
      summary: "由参考视频拆解工作台整理的视频 Prompt、脚本、素材和使用边界。",
      tags: ["video-prompt", "视频交接"],
      relatedSceneCardIds: selectedSceneIdsForRequest,
    });
    context?.throwIfCancelled();
    const titleBase = videoScript?.title || videoProductName.trim() || "视频素材";
    const draft = await window.contentStudio.createPromptDraftFromContent({
      workspacePath: workspace,
      title: `${titleBase} Prompt 交接`,
      purpose: "video",
      userIntent: "复制视频 Prompt 到第三方视频平台，生成完成后手动导入成品视频。",
      inputSourceIds: [source.id],
      sceneCardIds: selectedSceneIdsForRequest,
      content,
      note: "由参考视频拆解工作台生成交接草稿。",
      model: "local-video-prompt-handoff",
      status: "confirmed",
    });
    context?.throwIfCancelled();
    setInputSources((current) => [source, ...current.filter((item) => item.id !== source.id)]);
    setPromptDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    setSelectedSceneIds(selectedSceneIdsForRequest);
    setActivePromptDraftId(draft.id);
    setActiveModule("video-prompt");
    await refresh(workspace);
  }

  async function analyzeReferenceVideo(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const source = videoAssetRefs[0] || videoUrl.trim();
    if (!source)
      throw new Error(
        "请先选择本地视频或粘贴参考视频链接；当前不会使用 demo 数据伪造拆解结果。",
      );
    const result = await window.contentStudio.analyzeVideo({
      workspacePath: workspace,
      sourceType: videoAssetRefs[0] ? "file" : "url",
      source,
      dimensions: selectedVideoDimensions,
      promptPackId: activePromptPack?.id,
      citations: citationsForRequest,
      selectedSkillSlugs:
        skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: { textModel: params.textModel },
    });
    context?.throwIfCancelled();
    setVideoBreakdown(result);
    const breakdownShotCount = result.pacing?.rhythm.length || result.segments.length;
    if (breakdownShotCount > 0) setVideoShotCount(Math.min(80, Math.max(1, breakdownShotCount)));
    if (result.durationSec && result.durationSec > 0) setVideoDurationSeconds(Math.min(300, Math.max(5, Math.round(result.durationSec))));
    await refresh(workspace);
  }

  function useVideoBreakdownLog(log: GenerationLogEntry): void {
    if (log.kind !== "video-breakdown" || log.status !== "succeeded") {
      throw new Error("只能使用已成功的视频拆解记录作为脚本模板。");
    }
    if (!log.output || typeof log.output !== "object") {
      throw new Error("这条视频拆解记录缺少可复用的结构化输出。");
    }
    const output = log.output as Omit<VideoBreakdownResult, "logId">;
    const result: VideoBreakdownResult = { logId: log.id, ...output };
    setVideoBreakdown(result);
    const breakdownShotCount = result.pacing?.rhythm.length || result.segments.length;
    if (breakdownShotCount > 0) setVideoShotCount(Math.min(80, Math.max(1, breakdownShotCount)));
    if (result.durationSec && result.durationSec > 0) {
      setVideoDurationSeconds(Math.min(300, Math.max(5, Math.round(result.durationSec))));
    }
    const refs = [
      ...(log.artifactRefs ?? []),
      typeof (log.input as Record<string, unknown> | undefined)?.source === "string"
        ? (log.input as Record<string, unknown>).source as string
        : "",
    ].filter((ref): ref is string => Boolean(ref && !/^https?:\/\//i.test(ref)));
    if (refs.length) {
      setVideoAssetRefs((current) => Array.from(new Set([...refs, ...current])));
    }
    setActiveModule("video-script");
  }

  function useVideoScriptLog(log: GenerationLogEntry): void {
    if (log.kind !== "video-script" || log.status !== "succeeded") {
      throw new Error("只能使用已成功的视频脚本记录进行 Prompt 交接。");
    }
    if (!log.output || typeof log.output !== "object") {
      throw new Error("这条视频脚本记录缺少结构化输出。");
    }
    const output = log.output as Omit<VideoScriptGenerationResult, "logId">;
    const result: VideoScriptGenerationResult = {
      logId: log.id,
      title: output.title,
      script: output.script,
      storyboard: output.storyboard ?? [],
      videoPrompt: output.videoPrompt ?? "",
      resourceFramework: output.resourceFramework,
      evaluation: output.evaluation,
      publishCheck: output.publishCheck ?? [],
    };
    setVideoScript(result);
    const productName = (log.input as Record<string, unknown> | undefined)?.productName;
    if (typeof productName === "string" && productName.trim()) setVideoProductName(productName);
    const nextShotCount = result.storyboard.length;
    if (nextShotCount > 0) setVideoShotCount(Math.min(80, Math.max(1, nextShotCount)));
    setActiveModule("video");
  }

  async function generateVideoScript(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateVideoScript({
      workspacePath: workspace,
      productName: videoProductName,
      sceneBackground: videoSceneBackground,
      subtitleMode: videoSubtitleMode,
      voiceStyle: videoVoiceStyle || activePromptPack?.brandVoice || "自然可信",
      customRequirement: videoCustomRequirement,
      ratio: params.aspectRatio,
      shotCount: videoShotCount,
      durationSeconds: videoDurationSeconds,
      breakdownLogId: videoBreakdown?.logId,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      assetRefs: [
        ...productImageRefs,
        ...referenceImageRefs,
        ...videoAssetRefs,
      ],
      selectedSkillSlugs:
        skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: { textModel: params.textModel },
    });
    context?.throwIfCancelled();
    setVideoScript(result);
    await refresh(workspace);
  }

  function videoScriptActionContext(
    script: VideoScriptGenerationResult,
    sourceLog?: GenerationLogEntry,
  ): Omit<VideoScriptEvaluationRequest, "workspacePath" | "script" | "citations" | "params"> {
    const sourceInput = sourceLog?.input && typeof sourceLog.input === "object"
      ? sourceLog.input as Record<string, unknown>
      : {};
    const productName = typeof sourceInput.productName === "string" && sourceInput.productName.trim()
      ? sourceInput.productName.trim()
      : videoProductName.trim();
    const sceneBackground = typeof sourceInput.sceneBackground === "string" && sourceInput.sceneBackground.trim()
      ? sourceInput.sceneBackground.trim()
      : videoSceneBackground;
    const customRequirement = typeof sourceInput.customRequirement === "string" && sourceInput.customRequirement.trim()
      ? sourceInput.customRequirement.trim()
      : videoCustomRequirement.trim();
    const voiceStyle = typeof sourceInput.voiceStyle === "string" && sourceInput.voiceStyle.trim()
      ? sourceInput.voiceStyle.trim()
      : videoVoiceStyle.trim();
    const sourceBreakdownLogId = typeof sourceInput.breakdownLogId === "string" ? sourceInput.breakdownLogId : videoBreakdown?.logId;
    const sourceBreakdownLog = sourceBreakdownLogId
      ? logs.find((log) => log.id === sourceBreakdownLogId && log.kind === "video-breakdown")
      : undefined;
    const sourceBreakdownOutput = sourceBreakdownLog?.output && typeof sourceBreakdownLog.output === "object"
      ? sourceBreakdownLog.output as Partial<VideoBreakdownResult>
      : undefined;
    const templateInfo = {
      hookType: videoBreakdown?.hook?.hookType?.value ?? sourceBreakdownOutput?.hook?.hookType?.value,
      framework: videoBreakdown?.narrative?.framework?.value ?? sourceBreakdownOutput?.narrative?.framework?.value,
      sourceTitle: videoBreakdown?.contentTitle ?? sourceBreakdownOutput?.contentTitle ?? sourceBreakdownLog?.title,
    };
    return {
      sourceScriptLogId: sourceLog?.id || (script.logId ? script.logId : undefined),
      productName,
      productDesc: [
        `商品名称：${productName || "未填写"}`,
        `场景背景：${sceneBackground || "未填写"}`,
        voiceStyle ? `语音风格：${voiceStyle}` : "",
        customRequirement ? `补充要求：${customRequirement}` : "",
        script.publishCheck.length ? `已知发布检查：${script.publishCheck.map((item) => `${item.level}:${item.message}`).join("；")}` : "",
      ].filter(Boolean).join("\n"),
      templateInfo,
    };
  }

  async function evaluateVideoScript(
    script: VideoScriptGenerationResult,
    sourceLog?: GenerationLogEntry,
    context?: ActionContext,
  ): Promise<void> {
    const workspace = requireWorkspace();
    const actionContext = videoScriptActionContext(script, sourceLog);
    const evaluation = await window.contentStudio.evaluateVideoScript({
      workspacePath: workspace,
      ...actionContext,
      script,
      citations: citationsForRequest,
      params: { textModel: params.textModel },
    });
    context?.throwIfCancelled();
    setVideoScript((current) => {
      if (current && current.logId === script.logId) return { ...current, evaluation };
      return { ...script, evaluation };
    });
    await refresh(workspace);
  }

  async function rewriteVideoScriptShot(
    script: VideoScriptGenerationResult,
    rowIndex: number,
    sourceLog?: GenerationLogEntry,
    context?: ActionContext,
  ): Promise<VideoScriptShotRewriteResult> {
    const workspace = requireWorkspace();
    const actionContext = videoScriptActionContext(script, sourceLog);
    const rewrite = await window.contentStudio.rewriteVideoScriptShot({
      workspacePath: workspace,
      ...actionContext,
      rowIndex,
      script,
      citations: citationsForRequest,
      params: { textModel: params.textModel },
    });
    context?.throwIfCancelled();
    const nextScript: VideoScriptGenerationResult = {
      ...script,
      evaluation: undefined,
      storyboard: script.storyboard.map((shot, index) => (index === rowIndex ? rewrite.shot : shot)),
      script: script.storyboard.map((shot, index) => {
        const nextShot = index === rowIndex ? rewrite.shot : shot;
        return `镜头 ${nextShot.shot}（${nextShot.timeRange || nextShot.duration}）\n画面：${nextShot.visual}\n口播：${nextShot.voiceover}\n字幕：${nextShot.subtitle || "无字幕"}\n节奏：${nextShot.rhythm}`;
      }).join("\n\n"),
      videoPrompt: script.storyboard.map((shot, index) => (index === rowIndex ? rewrite.shot : shot).videoPrompt).filter(Boolean).join("\n") || script.videoPrompt,
      publishCheck: [
        ...rewrite.publishCheck,
        ...script.publishCheck,
      ].slice(0, 8),
    };
    setVideoScript(nextScript);
    setActiveModule("video-script");
    await refresh(workspace);
    return rewrite;
  }

  async function installSkill(slug: string): Promise<void> {
    const workspace = requireWorkspace();
    setSkills(await window.contentStudio.installBuiltinSkill(slug, workspace));
  }

  async function createSkill(draft: Omit<CreateSkillInput, 'workspacePath'>): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.createSkill({
      workspacePath: workspace,
      ...draft,
    });
    setSkills(result.skills);
    setActiveSkillKey(skillKey(result.skill));
  }

  async function uploadSkillPackage(): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.uploadSkillPackage(workspace);
    if (!result) return;
    setSkills(result.skills);
    setActiveSkillKey(skillKey(result.skill));
  }

  async function openSkillFolder(skill: LoadedSkill): Promise<void> {
    const workspace = requireWorkspace();
    await window.contentStudio.openSkillFolder(workspace, { slug: skill.slug, source: skill.source });
  }

  async function renameSkill(skill: LoadedSkill, nextSlug: string): Promise<void> {
    const workspace = requireWorkspace();
    const next = await window.contentStudio.renameSkill({
      workspacePath: workspace,
      skill: { slug: skill.slug, source: skill.source },
      nextSlug,
    });
    setSkills(next);
    const nextKey = skillKey({ slug: nextSlug, source: 'project' });
    setActiveSkillKey(nextKey);
    setSkillSelection(await window.contentStudio.getSkillSelection(workspace));
  }

  async function replaceSkillPackage(skill: LoadedSkill): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.replaceSkillPackage({
      workspacePath: workspace,
      skill: { slug: skill.slug, source: skill.source },
    });
    if (!result) return;
    setSkills(result.skills);
    setActiveSkillKey(skillKey(result.skill));
  }

  async function uninstallSkill(skill: LoadedSkill): Promise<void> {
    const workspace = requireWorkspace();
    const next = await window.contentStudio.uninstallSkill({
      workspacePath: workspace,
      skill: { slug: skill.slug, source: skill.source },
    });
    setSkills(next);
    setActiveSkillKey('');
    setSkillSelection(await window.contentStudio.getSkillSelection(workspace));
  }

  async function toggleSkill(skill: LoadedSkill): Promise<void> {
    const workspace = requireWorkspace();
    if (!skill.valid)
      throw new Error("无效 Skill 不能启用，请先修复 SKILL.md frontmatter。");
    const ref: SkillRef = { slug: skill.slug, source: skill.source };
    const next = await window.contentStudio.setSkillEnabled(
      workspace,
      ref,
      !enabledSkillKeys.has(skillKey(ref)),
    );
    setSkillSelection(next);
  }

  async function copySkillPath(skill: LoadedSkill): Promise<void> {
    await navigator.clipboard.writeText(skill.path);
    const key = skillKey(skill);
    setCopiedSkillKey(key);
    window.setTimeout(
      () => setCopiedSkillKey((current) => (current === key ? null : current)),
      1400,
    );
  }

  async function readSkillFile(skill: LoadedSkill, relativePath: string): Promise<string> {
    return window.contentStudio.readSkillFile(
      workspacePath,
      { slug: skill.slug, source: skill.source },
      relativePath,
    );
  }

  async function getSkillFileAssociation() {
    return window.contentStudio.getSkillFileAssociation();
  }

  async function setSkillFileAssociationDefault() {
    return window.contentStudio.setSkillFileAssociationDefault();
  }

  return {
    themeMode,
    setThemeMode,
    colorTheme,
    setColorTheme,
    fontScale,
    setFontScale,
    serifEnabled,
    setSerifEnabled,
    effectiveTheme,
    showSettingsDialog,
    setShowSettingsDialog,
    settingsPage,
    setSettingsPage,
    modelSettingView,
    setModelSettingView,
    providerTab,
    setProviderTab,
    responsesApiActive,
    setResponsesApiActive,
    activeModule,
    setActiveModule,
    settings,
    updateState,
    setUpdateState,
    modelConfig,
    modelCatalog,
    textModelOptions,
    imageModelOptions,
    videoModelOptions,
    modelDraft,
    setModelDraft,
    authState,
    authChecking,
    showModelDialog,
    setShowModelDialog,
    skills,
    skillSelection,
    knowledgeBases,
    brandKnowledgeBases,
    ipKnowledgeBases,
    contentKnowledgeMaps,
    contentKnowledgeMapBuildRuns,
    contentDraftChanges,
    contentKnowledgeReleases,
    contentSyncConflicts,
    contentWorkspaceSyncResult,
    contentBatches,
    activeContentBatch,
    contentKnowledgePackExport,
    contentKnowledgePackFilePreview,
    contentProductionHandoff,
    contentMaterialCoverage,
    contentReviewTasks,
    inputSources,
    promptDrafts,
    agentPromptSessions,
    overlayCards,
    assetReviews,
    mixPackages,
    activePromptDraft,
    activePromptDraftId,
    setActivePromptDraftId,
    activeAgentPromptSession,
    activeAgentPromptSessionId,
    setActiveAgentPromptSessionId,
    knowledgeQuery,
    setKnowledgeQuery,
    knowledgeBaseFilter,
    setKnowledgeBaseFilter,
    knowledgeSectionFilter,
    setKnowledgeSectionFilter,
    knowledgeTagFilter,
    setKnowledgeTagFilter,
    availableKnowledgeTags,
    activeKnowledgeBaseKey,
    setActiveKnowledgeBaseKey: selectKnowledgeBaseKey,
    activeBrandKnowledgeBase,
    activeBrandKnowledgeBaseId,
    setActiveBrandKnowledgeBaseId: selectBrandKnowledgeBase,
    activeIpKnowledgeBase,
    activeIpKnowledgeBaseId,
    setActiveIpKnowledgeBaseId: selectIpKnowledgeBase,
    activeContentKnowledgeMap,
    activeContentKnowledgeMapId,
    setActiveContentKnowledgeMapId,
    activeContentReviewTask,
    activeContentReviewTaskId,
    setActiveContentReviewTaskId,
    searchResults,
    selectedCitations,
    effectiveCitationCount: citationsForRequest.length,
    promptPacks,
    activePromptPackId,
    setActivePromptPackId,
    promptPackDraft,
    setPromptPackDraft,
    sceneCards,
    selectedSceneIds,
    setSelectedSceneIds,
    sceneCardDraft,
    setSceneCardDraft,
    logs,
    generationTasks,
    imageProductionTasks,
    activeImageProductionTask,
    activeImageProductionTaskId,
    setActiveImageProductionTaskId,
    workflowRuns,
    referenceReverseResult,
    referenceReverseError,
    activeWorkflowRun,
    activeWorkflowRunId,
    setActiveWorkflowRunId,
    params,
    setParams,
    productImageRefs,
    referenceImageRefs,
    imageProductLabel,
    imageReferenceLabel,
    videoAssetRefs,
    audioAssetRefs,
    imagePromptDraft,
    setImagePromptDraft,
    imagePromptMode,
    setImagePromptMode,
    imageGenerationMode,
    setImageGenerationMode,
    imageTemplate,
    setImageTemplate,
    imageTemplateInputs,
    setImageTemplateInputs,
    imageWatermark,
    setImageWatermark,
    videoUrl,
    setVideoUrl,
    selectedVideoDimensions,
    videoBreakdown,
    videoScript,
    videoProductName,
    setVideoProductName,
    videoSceneBackground,
    setVideoSceneBackground,
    videoSubtitleMode,
    setVideoSubtitleMode,
    videoVoiceStyle,
    setVideoVoiceStyle,
    videoShotCount,
    setVideoShotCount,
    videoDurationSeconds,
    setVideoDurationSeconds,
    videoCustomRequirement,
    setVideoCustomRequirement,
    articleType,
    setArticleType,
    articlePlatform,
    setArticlePlatform,
    articleLength,
    setArticleLength,
    articleTopic,
    setArticleTopic,
    articleAudience,
    setArticleAudience,
    articleTone,
    setArticleTone,
    articleRequirement,
    setArticleRequirement,
    articleResult,
    articleExportPath,
    platformDrafts,
    mediaResult,
    clearMediaResult,
    historyFilter,
    setHistoryFilter,
    copiedLogId,
    copiedPlatformDraftId,
    activeSkillKey,
    setActiveSkillKey,
    copiedSkillKey,
    busy,
    currentActionLabel,
    error,
    dismissError,
    workspacePath,
    enabledSkillKeys,
    activePromptPack,
    activeKnowledgeBase,
    activeSkill,
    activeScenes,
    activeEditableScene,
    selectedSceneIdsForRequest,
    citationsForRequest,
    filteredLogs,
    suggestedImagePrompt,
    suggestedVideoPrompt,
    refresh,
    runAction,
    cancelCurrentAction,
    requireWorkspace,
    openModelDialog,
    chooseWorkspace,
    switchWorkspace,
    clearWorkspace,
    saveModelConfig,
    loadModelCatalog,
    checkForUpdates,
    setAutoUpdateEnabled,
    openUpdateDownload,
    openUpdateReleaseNotes,
    openLogsDirectory,
    openUpdateSettings,
    loginByPassword,
    sendAuthEmailCode,
    verifyAuthEmailCode,
    logoutAuth,
    searchKnowledge,
    addCitation,
    addKnowledgeSectionCitation,
    toggleVideoDimension,
    selectAssetFiles,
    selectMaterialFiles,
    removeProductImageRef,
    removeReferenceImageRef,
    removeVideoAssetRef,
    removeAudioAssetRef,
    clearProductImageRefs,
    clearReferenceImageRefs,
    installBuiltinKnowledgeBase,
    importKnowledgeBase,
    importInputSource,
    importFinishedVideo,
    registerManualInputSource,
    removeInputSource,
    generatePromptDraft,
    startAgentPromptSession,
    continueAgentPromptSession,
    respondAgentPromptAction,
    attachAgentPromptSessionInputSources,
    generateBrandKnowledgeBase,
    buildContentKnowledgeMap,
    buildContentBatch,
    advanceContentBatchStage,
    runContentBatchStagePrimaryAction,
    exportContentKnowledgePack,
    readContentKnowledgePackFile,
    writeBackContentMaterialCoverage,
    createContentDraftChange,
    submitContentDraftChange,
    exportContentDraftChange,
    importContentDraftChange,
    resolveContentSyncConflict,
    createContentKnowledgeRelease,
    generateContentReviewTasks,
    generateContentReviewTasksForRows,
    generateContentMaterialTasksForRows,
    generateContentMaterialTasksForCoverageRows,
    createContentProductionHandoffForRow,
    createTeamKnowledgePromptDraft,
    submitContentReviewDecision,
    createContentProductionHandoff,
    generateIpKnowledgeBase,
    createIpScenarioPrompt,
    generateReferenceReversePrompt,
    generateScenePromptDraft,
    updatePromptDraft,
    recordPromptDraftCopy,
    generateOverlayCards,
    exportMixPackage,
    recordMixPackageImportEvidence,
    reviewAsset,
    createImageProductionTask,
    updateImageProductionTask,
    updateShotPrompt,
    generateImageForShot,
    reviewShotAsset,
    reworkAsset,
    distillAssetPrompt,
    useScenePromptInImage,
    useShowcasePromptInImage,
    useReferenceReversePromptInImage,
    startShowcasePartialRetouch,
    generateShowcaseImage,
    generateReferenceReverseImage,
    useScenePromptInVideo,
    useShowcasePromptInVideo,
    generateShowcaseVideo,
    usePromptDraftInVideo,
    usePromptDraftInArticle,
    usePromptDraftInGreenScreen,
    generatePromptPack,
    generateSceneCards,
    savePromptPackDraft,
    saveSceneCardDraft,
    updateSceneCard,
    materializePromptDraftToSkill,
    openRunTrace,
    openTraceGenerationLog,
    openTracePromptDraft,
    openTraceSceneCards,
    generateArticle,
    exportArticleMarkdown,
    exportArticlePlatformDraft,
    copyPlatformDraftText,
    copyLogPrompt,
    updateGenerationLogReview,
    revealLogPath,
    reuseImageLogInput,
    routeAiImageCommand,
    useGeneratedImageAsReference,
    revealPath,
    exportAsset,
    retryLog,
    generateImage,
    generateVideo,
    openVideoPromptHandoff,
    analyzeReferenceVideo,
    useVideoBreakdownLog,
    useVideoScriptLog,
    generateVideoScript,
    evaluateVideoScript,
    rewriteVideoScriptShot,
    installSkill,
    createSkill,
    uploadSkillPackage,
    openSkillFolder,
    renameSkill,
    replaceSkillPackage,
    uninstallSkill,
    toggleSkill,
    copySkillPath,
    readSkillFile,
    getSkillFileAssociation,
    setSkillFileAssociationDefault,
  };
}

export type ContentStudioAppController = ReturnType<typeof useContentStudioApp>;
