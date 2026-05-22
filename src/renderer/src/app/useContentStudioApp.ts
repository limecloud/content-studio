import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ArticleGenerationResult,
  ArticleGenerationRequest,
  AgentPromptSession,
  AppSettingsView,
  AssetReworkSource,
  BrandKnowledgeBaseRecord,
  AssetReviewRecord,
  AutoUpdateState,
  BuguAuthState,
  BuguEmailCodeSendInput,
  BuguEmailCodeVerifyInput,
  BuguPasswordLoginInput,
  GenerationLogEntry,
  GeneratePromptPackInput,
  GenerateSceneCardsInput,
  GlobalGenerationParams,
  ImageGenerationRequest,
  InputSourcePurpose,
  InputSourceRecord,
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
  ModelConfigView,
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
  RecordWorkflowManualEventInput,
  ReviewAssetInput,
  SceneCard,
  SkillRef,
  SkillSelectionView,
  VideoBreakdownResult,
  VideoBreakdownRequest,
  VideoGenerationRequest,
  VideoScriptGenerationResult,
  VideoScriptGenerationRequest,
  WorkflowDefinition,
  WorkflowRunRecord,
} from "../../../shared/types";
import { selectWorkflowInputSourceIdsForDefinition } from "../../../shared/inputSourcePolicy";
import { DEFAULT_PARAMS, VIDEO_DIMENSIONS } from "./constants";
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
} from "./formatters";
import { buildScenePromptGroupContent } from "./scenePromptComposer";
import type {
  ColorTheme,
  ModelDraft,
  ModelSettingView,
  ModuleKey,
  ProviderTab,
  SettingsTab,
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

interface ActionContext {
  isCancelled: () => boolean;
  throwIfCancelled: () => void;
}

type PromptDraftCreateRequest = {
  title?: string;
  purpose: PromptDraftPurpose;
  userIntent: string;
  inputSourceIds: string[];
  sceneCardIds?: string[];
  temporarySourceText?: string;
  temporarySourceTitle?: string;
};

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

function cleanPathList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
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
  if (purpose === "article") return "article-script";
  if (purpose === "green-screen") return "image-green-screen";
  return "assets-prompt-workbench";
}

function videoSubtitleModeLabel(value: string): string {
  if (value === "caption-file") return "输出字幕文件";
  if (value === "no-subtitle") return "无字幕";
  return "内嵌字幕";
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
  const [effectiveTheme, setEffectiveTheme] = useState<"light" | "dark">(
    "light",
  );
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [modelSettingView, setModelSettingView] =
    useState<ModelSettingView>("edit_claude");
  const [providerTab, setProviderTab] = useState<ProviderTab>("recommended");
  const [responsesApiActive, setResponsesApiActive] = useState(false);

  // 通用设置 Switch States
  const [menubarShow, setMenubarShow] = useState(true);
  const [autoStart, setAutoStart] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [reduceAnimation, setReduceAnimation] = useState(false);
  const [syncClaudeHistory, setSyncClaudeHistory] = useState(false);
  const [shortcutActive, setShortcutActive] = useState(true);
  const [commandWhitelist, setCommandWhitelist] = useState(false);

  const [activeModule, setActiveModule] = useState<ModuleKey>("image");
  const [settings, setSettings] = useState<AppSettingsView | null>(null);
  const [authState, setAuthState] = useState<BuguAuthState | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [updateState, setUpdateState] =
    useState<AutoUpdateState>(INITIAL_UPDATE_STATE);
  const [modelConfig, setModelConfig] = useState<ModelConfigView | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelDraft>({
    apiEndpoint: "",
    apiKey: "",
    textProtocol: "claude-sdk",
    imageApiEndpoint: "",
    imageApiKey: "",
    imageProtocol: "openai-responses",
    imageOuterModel: "",
    textModel: "",
    imageModels: "",
    videoApiEndpoint: "",
    videoApiKey: "",
    videoModel: "",
  });
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [skills, setSkills] = useState<LoadedSkill[]>([]);
  const [skillSelection, setSkillSelection] =
    useState<SkillSelectionView | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseView[]>([]);
  const [brandKnowledgeBases, setBrandKnowledgeBases] = useState<BrandKnowledgeBaseRecord[]>([]);
  const [ipKnowledgeBases, setIpKnowledgeBases] = useState<IpKnowledgeBaseRecord[]>([]);
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
  const [overlayCards, setOverlayCards] = useState<OverlayCardRecord[]>([]);
  const [assetReviews, setAssetReviews] = useState<AssetReviewRecord[]>([]);
  const [mixPackages, setMixPackages] = useState<MixPackageRecord[]>([]);
  const [platformDrafts, setPlatformDrafts] = useState<PlatformDraftRecord[]>([]);
  const [workflowDefinitions, setWorkflowDefinitions] = useState<WorkflowDefinition[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunRecord[]>([]);
  const [activeWorkflowDefinitionId, setActiveWorkflowDefinitionId] = useState("");
  const [activeWorkflowRunId, setActiveWorkflowRunId] = useState("");
  const [params, setParams] = useState<GlobalGenerationParams>(DEFAULT_PARAMS);
  const [productImageRefs, setProductImageRefs] = useState<string[]>([]);
  const [referenceImageRefs, setReferenceImageRefs] = useState<string[]>([]);
  const [videoAssetRefs, setVideoAssetRefs] = useState<string[]>([]);
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
  const activeWorkflowDefinition = useMemo(
    () =>
      workflowDefinitions.find((definition) => definition.id === activeWorkflowDefinitionId) ??
      workflowDefinitions[0],
    [activeWorkflowDefinitionId, workflowDefinitions],
  );
  const activeWorkflowRun = useMemo(
    () =>
      workflowRuns.find((run) => run.id === activeWorkflowRunId) ??
      workflowRuns.find((run) => run.workflowDefinitionId === activeWorkflowDefinition?.id) ??
      workflowRuns[0],
    [activeWorkflowDefinition?.id, activeWorkflowRunId, workflowRuns],
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
            ["brand-kb", "ip-kb", "product-brief", "user-feedback", "sop-input"].includes(source.purpose),
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
            ["brand-kb", "product-brief", "user-feedback", "sop-input"].includes(source.purpose),
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
            ["ip-kb", "sop-input"].includes(source.purpose),
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

  async function refresh(nextWorkspace?: string): Promise<void> {
    const [nextSettings, nextModelConfig] = await Promise.all([
      window.contentStudio.getSettings(),
      window.contentStudio.getModelConfig(),
    ]);
    const workspace = nextWorkspace ?? nextSettings.workspacePath;
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
    setSettings(nextSettings);
    setModelConfig(nextModelConfig);
    setSkills(nextSkills);
    setKnowledgeBases(nextKnowledgeBases);
    setBrandKnowledgeBases([]);
    setIpKnowledgeBases([]);
    setSearchResults(nextSearchResults);
    setParams((current) => ({
      ...current,
      textModel: nextModelConfig.textModel,
      imageModel: nextModelConfig.imageModels[0] ?? current.imageModel,
      videoModel: nextModelConfig.videoModel,
    }));

    if (!workspace) {
      setSkillSelection(null);
      setPromptPacks([]);
      setSceneCards([]);
      setLogs([]);
      setInputSources([]);
      setPromptDrafts([]);
      setAgentPromptSessions([]);
      setBrandKnowledgeBases([]);
      setIpKnowledgeBases([]);
      setOverlayCards([]);
      setAssetReviews([]);
      setMixPackages([]);
      setPlatformDrafts([]);
      setActivePromptDraftId("");
      setActiveAgentPromptSessionId("");
      setActiveBrandKnowledgeBaseId("");
      setActiveIpKnowledgeBaseId("");
      setPreferredKnowledgeSource(null);
      setWorkflowDefinitions([]);
      setWorkflowRuns([]);
      setActiveWorkflowDefinitionId("");
      setActiveWorkflowRunId("");
      return;
    }

    const [
      nextSelection,
      nextPromptPacks,
      nextSceneCards,
      nextLogs,
      nextInputSources,
      nextPromptDrafts,
      nextAgentPromptSessions,
      nextBrandKnowledgeBases,
      nextIpKnowledgeBases,
      nextOverlayCards,
      nextAssetReviews,
      nextMixPackages,
      nextPlatformDrafts,
      nextWorkflowDefinitions,
      nextWorkflowRuns,
    ] =
      await Promise.all([
        window.contentStudio.getSkillSelection(workspace),
        window.contentStudio.listPromptPacks(workspace),
        window.contentStudio.listSceneCards(workspace),
        window.contentStudio.listGenerationLogs(workspace),
        window.contentStudio.listInputSources(workspace),
        window.contentStudio.listPromptDrafts(workspace),
        window.contentStudio.listAgentPromptSessions(workspace),
        window.contentStudio.listBrandKnowledgeBases(workspace),
        window.contentStudio.listIpKnowledgeBases(workspace),
        window.contentStudio.listOverlayCards(workspace),
        window.contentStudio.listAssetReviews(workspace),
        window.contentStudio.listMixPackages(workspace),
        window.contentStudio.listPlatformDrafts(workspace),
        window.contentStudio.listWorkflowDefinitions(workspace),
        window.contentStudio.listWorkflowRuns(workspace),
      ]);
    setSkillSelection(nextSelection);
    setPromptPacks(nextPromptPacks);
    setSceneCards(nextSceneCards);
    setLogs(nextLogs);
    setInputSources(nextInputSources);
    setPromptDrafts(nextPromptDrafts);
    setAgentPromptSessions(nextAgentPromptSessions);
    setBrandKnowledgeBases(nextBrandKnowledgeBases);
    setIpKnowledgeBases(nextIpKnowledgeBases);
    setOverlayCards(nextOverlayCards);
    setAssetReviews(nextAssetReviews);
    setMixPackages(nextMixPackages);
    setPlatformDrafts(nextPlatformDrafts);
    setActivePromptDraftId((current) => current || nextPromptDrafts[0]?.id || "");
    setActiveAgentPromptSessionId((current) => current || nextAgentPromptSessions[0]?.id || "");
    setActiveBrandKnowledgeBaseId((current) => current || nextBrandKnowledgeBases[0]?.id || "");
    setActiveIpKnowledgeBaseId((current) => current || nextIpKnowledgeBases[0]?.id || "");
    setWorkflowDefinitions(nextWorkflowDefinitions);
    setWorkflowRuns(nextWorkflowRuns);
    setActiveWorkflowDefinitionId((current) => current || nextWorkflowDefinitions[0]?.id || "");
    setActiveWorkflowRunId((current) => current || nextWorkflowRuns[0]?.id || "");
    setMediaResult((current) => {
      if (current) return current;
      const lastImage = nextLogs.find(
        (log) => log.kind === "image" && log.status === "succeeded" && (log.output as { assetRefs?: string[] })?.assetRefs?.length,
      );
      if (!lastImage) return null;
      const output = lastImage.output as { assetRefs: string[] };
      return { logId: lastImage.id, status: "succeeded", message: "", assetRefs: output.assetRefs };
    });
    setActivePromptPackId((current) => current || nextPromptPacks[0]?.id || "");
    setSelectedSceneIds((current) => {
      const availableSceneIds = new Set(nextSceneCards.map((scene) => scene.id));
      return current.filter((sceneId) => availableSceneIds.has(sceneId));
    });
  }

  useEffect(() => {
    void refresh();
  }, []);

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
      unsubscribe();
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
      imageModels: modelConfig.imageModels.join(", "),
      videoApiEndpoint: modelConfig.videoApiEndpoint,
      videoApiKey: "",
      videoModel: modelConfig.videoModel,
    });
  }, [
    modelConfig?.textApiEndpoint,
    modelConfig?.textProtocol,
    modelConfig?.imageApiEndpoint,
    modelConfig?.imageProtocol,
    modelConfig?.imageOuterModel,
    modelConfig?.textModel,
    modelConfig?.imageModels,
    modelConfig?.videoApiEndpoint,
    modelConfig?.videoModel,
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

  function runAction(
    action: (context: ActionContext) => Promise<void>,
    label = "正在处理当前任务",
  ): void {
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
    void action(context)
      .catch((nextError) => {
        if (nextError instanceof ActionCancelledError) return;
        setError(
          nextError instanceof Error ? nextError.message : String(nextError),
        );
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

  function requireWorkspace(): string {
    if (!workspacePath)
      throw new Error(
        "请先选择工作区，生成结果和配置会写入本地内容工厂目录。",
      );
    return workspacePath;
  }

  function openModelDialog(): void {
    setModelDraft({
      apiEndpoint: modelConfig?.textApiEndpoint ?? "",
      apiKey: "",
      textProtocol: modelConfig?.textProtocol ?? "claude-sdk",
      imageApiEndpoint: modelConfig?.imageApiEndpoint ?? "",
      imageApiKey: "",
      imageProtocol: modelConfig?.imageProtocol ?? "openai-responses",
      imageOuterModel: modelConfig?.imageOuterModel ?? "gpt-5.5",
      textModel: modelConfig?.textModel ?? params.textModel,
      imageModels: modelConfig?.imageModels.join(", ") ?? params.imageModel,
      videoApiEndpoint: modelConfig?.videoApiEndpoint ?? "",
      videoApiKey: "",
      videoModel: modelConfig?.videoModel ?? params.videoModel,
    });
    setShowModelDialog(true);
  }

  async function chooseWorkspace(): Promise<void> {
    const selected = await window.contentStudio.selectWorkspace();
    if (!selected) return;
    const nextSettings = await window.contentStudio.saveSettings({
      workspacePath: selected,
    });
    setSettings(nextSettings);
    await refresh(selected);
  }

  async function saveModelConfig(): Promise<void> {
    const next = await window.contentStudio.saveModelConfig({
      textApiEndpoint: modelDraft.apiEndpoint,
      textApiKey: modelDraft.apiKey || undefined,
      textModel: modelDraft.textModel,
      textProtocol: modelDraft.textProtocol,
      imageProvider:
        modelDraft.imageApiKey || modelConfig?.hasImageApiKey
          ? "openai-responses"
          : "disabled",
      imageProtocol: modelDraft.imageProtocol,
      imageApiEndpoint: modelDraft.imageApiEndpoint,
      imageApiKey: modelDraft.imageApiKey || undefined,
      imageOuterModel: modelDraft.imageOuterModel,
      imageModels: modelDraft.imageModels
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      videoProvider:
        modelDraft.videoApiEndpoint.trim() &&
        (modelDraft.videoApiKey.trim() || modelConfig?.hasVideoApiKey)
          ? "generic-http"
          : "disabled",
      videoApiEndpoint: modelDraft.videoApiEndpoint,
      videoApiKey: modelDraft.videoApiKey || undefined,
      videoModel: modelDraft.videoModel,
    });
    setModelConfig(next);
    setParams((current) => ({
      ...current,
      textModel: next.textModel,
      imageModel: next.imageModels[0] ?? current.imageModel,
      videoModel: next.videoModel,
    }));
    setShowModelDialog(false);
  }

  async function loadModelCatalog(): Promise<void> {
    const catalog = await window.contentStudio.getModelCatalog();
    setModelDraft((current) => ({
      ...current,
      textModel: current.textModel || catalog.textModels[0] || params.textModel,
      imageModels: catalog.imageModels.join(", "),
      imageOuterModel: current.imageOuterModel || "gpt-5.5",
      videoModel:
        current.videoModel || catalog.videoModels[0] || params.videoModel,
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
    setSettingsTab("about");
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
    kind: "product-image" | "reference-image" | "video",
  ): Promise<void> {
    const paths = await window.contentStudio.selectAssetFiles(kind);
    if (paths.length === 0) return;
    if (kind === "product-image")
      setProductImageRefs((current) => [...current, ...paths].slice(0, 10));
    if (kind === "reference-image")
      setReferenceImageRefs((current) => [...current, ...paths].slice(0, 6));
    if (kind === "video")
      setVideoAssetRefs((current) => [...current, ...paths].slice(0, 3));
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

  async function importInputSource(purpose: InputSourcePurpose): Promise<void> {
    const workspace = requireWorkspace();
    const imported = await window.contentStudio.importInputSourceFromFile(
      workspace,
      purpose,
    );
    if (imported) {
      if (purpose === "successful-asset") setActiveModule("video-import");
      await refresh(workspace);
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
      },
    );
    if (imported) {
      await recordWorkflowManualEvent({
        workflowRunId: workflowRun?.id,
        event: "finished-video-imported",
        inputSourceId: imported.id,
        promptDraftId: draft?.id,
        summary: `已导入成品视频：${imported.title}`,
      });
      await refresh(workspace);
    }
  }

  async function registerManualInputSource(input: {
    title: string;
    purpose: InputSourcePurpose;
    text: string;
    tags?: string[];
  }): Promise<void> {
    const workspace = requireWorkspace();
    await window.contentStudio.registerInputSource({
      workspacePath: workspace,
      kind: "manual-note",
      purpose: input.purpose,
      title: input.title,
      text: input.text,
      tags: input.tags,
      summary: input.text.slice(0, 160),
    });
    await refresh(workspace);
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
        purpose: "sop-input",
        title: input.temporarySourceTitle?.trim() || "视频 Prompt 临时资料",
        text: temporarySourceText,
        summary: temporarySourceText.slice(0, 160),
        tags: ["video-prompt", "临时资料", "workflow-run"],
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
      sceneCardIds: input.sceneCardIds,
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

  async function startAgentPromptSession(input: PromptDraftCreateRequest): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.startAgentPromptSession({
      workspacePath: workspace,
      title: input.title,
      purpose: input.purpose,
      userIntent: input.userIntent,
      inputSourceIds: input.inputSourceIds,
      sceneCardIds: input.sceneCardIds,
    });
    setPromptDrafts((current) => [result.draft, ...current.filter((item) => item.id !== result.draft.id)]);
    setAgentPromptSessions((current) => [result.session, ...current.filter((item) => item.id !== result.session.id)]);
    setActivePromptDraftId(result.draft.id);
    setActiveAgentPromptSessionId(result.session.id);
    await refresh(workspace);
  }

  async function continueAgentPromptSession(input: {
    sessionId: string;
    message: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.continueAgentPromptSession({
      workspacePath: workspace,
      sessionId: input.sessionId,
      message: input.message,
    });
    setPromptDrafts((current) => [result.draft, ...current.filter((item) => item.id !== result.draft.id)]);
    setAgentPromptSessions((current) =>
      [result.session, ...current.filter((item) => item.id !== result.session.id)],
    );
    setActivePromptDraftId(result.draft.id);
    setActiveAgentPromptSessionId(result.session.id);
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
    if (relatedRun && isIpLongformWorkflow(relatedRun)) {
      await recordWorkflowManualEvent({
        workflowRunId: relatedRun.id,
        event: "ip-scenario-extended",
        inputSourceId: source.id,
        promptDraftId: draft.id,
        summary: `已从 IP 知识库延伸「${normalizedScene}」场景 Prompt。`,
      });
    }
    setActiveModule(promptWorkbenchModuleForPurpose(draft.purpose));
    await refresh(workspace);
  }

  async function generateReferenceReversePrompt(input: {
    referenceSourceIds: string[];
    productSourceIds: string[];
    userIntent: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.reverseReferencePrompt({
      workspacePath: workspace,
      ...input,
    });
    setPromptDrafts((current) => [
      result.promptDraft,
      ...current.filter((draft) => draft.id !== result.promptDraft.id),
    ]);
    setActivePromptDraftId(result.promptDraft.id);
    setActiveModule(promptWorkbenchModuleForPurpose(result.promptDraft.purpose));
    await refresh(workspace);
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
    setImagePromptDraft(prompt);
    setImagePromptMode("free");
    setActiveModule("image");
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
    await recordWorkflowManualEvent({
      workflowRunId: workflowRunForPromptDraft(draft.id)?.id,
      event: "video-prompt-copied",
      promptDraftId: draft.id,
      summary: `已复制视频 Prompt 到 ${input.target?.trim() || "第三方平台"}。`,
    });
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
    await recordWorkflowManualEvent({
      workflowRunId: input.workflowRunId ?? workflowRunForPromptDraft(input.promptDraftId)?.id,
      event: "overlay-cards-generated",
      promptDraftId: input.promptDraftId,
      overlayCardIds: cards.map((card) => card.id),
      summary: `已生成 ${cards.length} 张绿幕文案图。`,
    });
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
    await recordWorkflowManualEvent({
      workflowRunId: workflowRun?.id,
      event: "mix-package-exported",
      mixPackageId: mixPackage.id,
      manifestPath: mixPackage.manifestPath,
      manifestCsvPath: mixPackage.manifestCsvPath,
      importGuidePath: mixPackage.importGuidePath,
      packageDir: mixPackage.packageDir,
      summary: `已导出混剪包：${mixPackage.title}`,
    });
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
    await recordWorkflowManualEvent({
      workflowRunId: mixPackage.workflowRunId,
      event: "mix-package-import-verified",
      mixPackageId: mixPackage.id,
      externalImportEvidencePath: mixPackage.externalImportEvidencePath,
      packageDir: mixPackage.packageDir,
      summary: `已登记 ${mixPackage.externalImportEvidence?.toolName ?? "第三方混剪工具"} 导入证据。`,
    });
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
    if (review.status === "approved" && workflowRun?.id) {
      await recordWorkflowManualEvent({
        workflowRunId: workflowRun.id,
        event: "asset-reviewed",
        assetReviewId: review.id,
        assetKey: review.assetKey,
        summary: `已通过素材审核：${review.title}`,
      });
    } else if (review.status === "rejected" && workflowRun?.id) {
      await recordWorkflowManualEvent({
        workflowRunId: workflowRun.id,
        event: "asset-review-rejected",
        assetReviewId: review.id,
        assetKey: review.assetKey,
        summary: `已驳回素材并等待回炉：${review.title}`,
      });
    }
    await refresh(workspace);
  }

  async function approveWorkflowRunReview(runId: string): Promise<void> {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    await recordWorkflowManualEvent({
      workflowRunId: run.id,
      event: "workflow-review-approved",
      summary: `已确认「${run.title}」人工审核通过。`,
    });
    await refresh(requireWorkspace());
  }

  async function archiveWorkflowRunAssets(runId: string): Promise<void> {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    await recordWorkflowManualEvent({
      workflowRunId: run.id,
      event: "workflow-asset-archived",
      summary: `已归档「${run.title}」产物和来源引用。`,
    });
    await refresh(requireWorkspace());
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
    const previousContent = promptDraftActiveContent(draft) || input.promptText?.trim();
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
      setActiveModule("image");
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
      input.promptText?.trim() ||
      promptDraftActiveContent(input.relatedDraft) ||
      (input.sourceLog ? extractPromptFromLog(input.sourceLog) : "") ||
      input.sourceInput?.summary ||
      "";
    return [
      "任务：成功素材反向沉淀 Prompt",
      "",
      "目标：",
      "把已经通过人工审核的素材沉淀成可复用 Prompt 草稿，后续可继续物化为 SOP 或 Skill。",
      "",
      "素材来源：",
      `- 素材：${assetTitle}`,
      input.source.path ? `- 文件：${fileNameFromPath(input.source.path)}` : "",
      `- 类型：${assetKindLabel(input.source.kind)}`,
      `- 来源：${assetSourceLineageLabel(input)}`,
      input.source.workflowRunId ? "- 关联 SOP：已关联运行记录" : "- 关联 SOP：未关联",
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
      input.source.workflowRunId ? "- SOP 可追溯" : "",
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
        ...(source.workflowRunId ? ["workflow-run"] : []),
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
    if (source.workflowRunId) {
      const run = workflowRuns.find((item) => item.id === source.workflowRunId);
      if (run && (isImageSopWorkflow(run) || isVideoMaterialWorkflow(run))) {
        await recordWorkflowManualEvent({
          workflowRunId: run.id,
          event: "asset-prompt-distilled",
          inputSourceId: registeredSource.id,
          promptDraftId: draft.id,
          assetKey: source.assetKey,
          summary: `已从通过素材沉淀 Prompt 草稿：${draft.title}`,
        });
      }
    }
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

  async function createWorkflowDraft(): Promise<void> {
    const workspace = requireWorkspace();
    const draft = await window.contentStudio.createWorkflowDraft({
      workspacePath: workspace,
      templateKey: activeWorkflowDefinition?.key,
    });
    setWorkflowDefinitions((current) => [draft, ...current]);
    setActiveWorkflowDefinitionId(draft.id);
    setActiveModule("workflow-definition");
    await refresh(workspace);
  }

  async function materializePromptDraftToWorkflow(input: {
    draftId: string;
    content: string;
  }): Promise<void> {
    const workspace = requireWorkspace();
    const promptDraft =
      promptDrafts.find((item) => item.id === input.draftId) ??
      activePromptDraft;
    if (!promptDraft) throw new Error("请先选择一个 Prompt 草稿。");
    const templateKey =
      promptDraft.purpose === "sop"
        ? undefined
        : promptDraft.purpose === "video" || promptDraft.purpose === "green-screen"
        ? "video-material-package"
        : promptDraft.purpose === "article"
          ? "ip-longform"
          : "xiaohongshu-seeding-image";
    const workflow = await window.contentStudio.createWorkflowDraft({
      workspacePath: workspace,
      templateKey,
      title: `${promptDraft.title} SOP 草案`,
      description: [
        `由提示词草稿「${promptDraft.title}」物化。`,
        "后续需要确认输入字段、执行步骤、审核规则和导出规则。",
        "",
        input.content.slice(0, 1200),
      ].join("\n"),
    });
    const updatedDraft = await window.contentStudio.updatePromptDraft({
      workspacePath: workspace,
      draftId: promptDraft.id,
      content: input.content,
      note: `已物化为 SOP 草案：${workflow.title}`,
      status: "materialized",
      materializedTarget: "workflow",
    });
    setWorkflowDefinitions((current) => [workflow, ...current]);
    setActiveWorkflowDefinitionId(workflow.id);
    setPromptDrafts((current) =>
      current.map((item) => (item.id === updatedDraft.id ? updatedDraft : item)),
    );
    setActivePromptDraftId(updatedDraft.id);
    setActiveModule("workflow-definition");
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

  async function publishWorkflowDefinition(definitionId?: string): Promise<void> {
    const workspace = requireWorkspace();
    const definition =
      workflowDefinitions.find((item) => item.id === definitionId) ??
      activeWorkflowDefinition;
    if (!definition) throw new Error("请先选择一个工作流定义。");
    const updated = await window.contentStudio.updateWorkflowDefinition({
      ...definition,
      status: "published",
    });
    setWorkflowDefinitions((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setActiveWorkflowDefinitionId(updated.id);
    await refresh(workspace);
  }

  async function updateWorkflowDefinition(definition: WorkflowDefinition): Promise<void> {
    const workspace = requireWorkspace();
    const updated = await window.contentStudio.updateWorkflowDefinition({
      ...definition,
      workspacePath: workspace,
    });
    setWorkflowDefinitions((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setActiveWorkflowDefinitionId(updated.id);
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

  function isImageSopWorkflow(run: WorkflowRunRecord): boolean {
    return workflowKeyMatches(run.workflowKey, "xiaohongshu-seeding-image");
  }

  function isIpLongformWorkflow(run: WorkflowRunRecord): boolean {
    return workflowKeyMatches(run.workflowKey, "ip-longform");
  }

  function selectWorkflowRunContext(run: WorkflowRunRecord): string | undefined {
    setActiveWorkflowRunId(run.id);
    setActiveWorkflowDefinitionId(run.workflowDefinitionId);
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
    if (!run) throw new Error("SOP 运行记录不存在，请刷新后重试。");
    return run;
  }

  function openWorkflowRunPrompt(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("video-prompt");
  }

  function openWorkflowRunBrandKnowledge(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("knowledge-brand");
  }

  function openWorkflowRunIpKnowledge(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("knowledge-ip");
  }

  function openWorkflowRunSceneLibrary(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("image-scene-prompts");
  }

  function openWorkflowRunPromptDraft(runId: string): void {
    const run = workflowRunById(runId);
    const promptDraftId = selectWorkflowRunContext(run);
    const draft = promptDrafts.find((item) => item.id === promptDraftId);
    setActiveModule(draft ? promptWorkbenchModuleForPurpose(draft.purpose) : "assets-prompt-workbench");
  }

  function openWorkflowRunAssetReview(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("image-compliance");
  }

  function openWorkflowRunReferenceReverse(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("image-reference-reverse");
  }

  function openWorkflowRunImageWorkbench(runId: string): void {
    const run = workflowRunById(runId);
    const promptDraftId = selectWorkflowRunContext(run);
    const content = promptDraftContent(promptDraftId);
    setImageWorkflowRunId(run.id);
    setImagePromptDraft(content || run.inputs.intent || "");
    setImagePromptMode("free");
    setActiveModule("image");
  }

  function openWorkflowRunArticleWorkbench(runId: string): void {
    const run = workflowRunById(runId);
    const promptDraftId = selectWorkflowRunContext(run);
    const content = promptDraftContent(promptDraftId);
    const ipKnowledgeBaseId = workflowStepOutputValue(run, ["ipKnowledgeBaseId"]);
    const ipRecord = ipKnowledgeBaseId
      ? ipKnowledgeBases.find((record) => record.id === ipKnowledgeBaseId)
      : activeIpKnowledgeBase;
    const draftTitle = promptDraftId
      ? promptDrafts.find((draft) => draft.id === promptDraftId)?.title
      : undefined;
    setArticleType("wechat-longform");
    setArticlePlatform("公众号");
    setArticleTopic(run.inputs.intent || draftTitle || "IP 内容长文");
    setArticleAudience(ipRecord?.extensionScenes.join(" / ") || "关注该 IP 方法论和实践场景的读者");
    setArticleTone(ipRecord?.layers.language || "专业、自然、克制");
    setArticleRequirement([
      "来自 IP 长文 SOP，请基于已选 IP 知识库、Agent 会话和文章 Prompt 生成正文。",
      run.inputs.source ? `输入源：${run.inputs.source}` : "",
      run.inputs.reviewOwner ? `审核人：${run.inputs.reviewOwner}` : "",
      content ? "" : "当前运行记录未找到提示词草稿正文，请先回 Prompt 工作台确认草稿。",
      content,
    ].filter(Boolean).join("\n\n"));
    setArticleWorkflowRunId(run.id);
    setActiveModule("article");
  }

  async function importWorkflowRunFinishedVideo(runId: string): Promise<void> {
    const run = workflowRunById(runId);
    const promptDraftId = selectWorkflowRunContext(run);
    await importFinishedVideo(promptDraftId, run.id);
  }

  function openWorkflowRunOverlay(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("image-green-screen");
  }

  function openWorkflowRunMixExport(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("video-mix-export");
  }

  async function openWorkflowRunPlatformDraft(runId: string): Promise<void> {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    const platformDraftPath = run.artifactRefs.find((ref) =>
      ref.replace(/\\/g, "/").includes("/platform-drafts/") &&
      !ref.replace(/\\/g, "/").endsWith("/draft.md"),
    ) ?? run.artifactRefs.find((ref) =>
      ref.replace(/\\/g, "/").includes("/platform-drafts/"),
    );
    if (!platformDraftPath) throw new Error("这条 SOP 运行记录没有平台草稿包路径。");
    await revealPath(platformDraftPath);
  }

  function openTraceWorkflowRun(runId: string): void {
    const run = workflowRunById(runId);
    selectWorkflowRunContext(run);
    setActiveModule("assets-history");
  }

  function openTraceGenerationLog(logId: string): void {
    const log = logs.find((item) => item.id === logId);
    if (!log) throw new Error("生成记录不存在，请刷新后重试。");
    if (log.workflowRunId) {
      const run = workflowRuns.find((item) => item.id === log.workflowRunId);
      if (run) selectWorkflowRunContext(run);
    }
    setHistoryFilter(log.kind);
    setActiveModule("assets-history");
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
      .filter((run) => isVideoMaterialWorkflow(run) || isImageSopWorkflow(run))
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

  async function recordWorkflowManualEvent(
    input: Omit<RecordWorkflowManualEventInput, "workspacePath" | "workflowRunId"> & {
      workflowRunId?: string;
    },
  ): Promise<WorkflowRunRecord | null> {
    const workspace = requireWorkspace();
    const workflowRunId = input.workflowRunId;
    if (!workflowRunId) return null;
    const run = await window.contentStudio.recordWorkflowManualEvent({
      ...input,
      workspacePath: workspace,
      workflowRunId,
    });
    setWorkflowRuns((current) =>
      [run, ...current.filter((item) => item.id !== run.id)]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
    setActiveWorkflowRunId(run.id);
    return run;
  }

  function inputSourceIdsForWorkflow(definition: WorkflowDefinition): string[] {
    return selectWorkflowInputSourceIdsForDefinition(definition, inputSources);
  }

  function citationsForWorkflowDefinition(definition: WorkflowDefinition): KnowledgeCitation[] {
    if (definition.key.includes("brand")) return brandCitationsForRequest;
    if (definition.key.includes("ip") || definition.key.includes("longform")) return ipCitationsForRequest;
    return citationsForRequest;
  }

  async function startWorkflowRun(
    definitionId?: string,
    inputs?: Record<string, string>,
    inputSourceIds?: string[],
  ): Promise<void> {
    const workspace = requireWorkspace();
    const definition =
      workflowDefinitions.find((item) => item.id === definitionId) ??
      activeWorkflowDefinition;
    if (!definition) throw new Error("请先选择一个可运行的 SOP。");
    const run = await window.contentStudio.startWorkflowRun({
      workspacePath: workspace,
      workflowDefinitionId: definition.id,
      inputs,
      inputSourceIds: inputSourceIds ?? inputSourceIdsForWorkflow(definition),
      citations: citationsForWorkflowDefinition(definition),
    });
    setWorkflowRuns((current) => [run, ...current]);
    setActiveWorkflowDefinitionId(definition.id);
    setActiveWorkflowRunId(run.id);
    const promptDraftId = promptDraftIdFromWorkflowRun(run);
    if (promptDraftId) setActivePromptDraftId(promptDraftId);
    setActiveModule("assets-history");
    await refresh(workspace);
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
    if (articleWorkflowRunId) {
      const run = workflowRunById(articleWorkflowRunId);
      if (isIpLongformWorkflow(run)) {
        await recordWorkflowManualEvent({
          workflowRunId: run.id,
          event: "article-draft-generated",
          promptDraftId: promptDraftIdFromWorkflowRun(run),
          generationLogId: result.logId,
          summary: "已从 IP 长文 SOP 生成文章草稿，等待人工确认或导出 Markdown。",
        });
      }
    }
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
    if (exported && articleWorkflowRunId) {
      const run = workflowRunById(articleWorkflowRunId);
      if (isIpLongformWorkflow(run)) {
        await recordWorkflowManualEvent({
          workflowRunId: run.id,
          event: "article-markdown-exported",
          promptDraftId: promptDraftIdFromWorkflowRun(run),
          generationLogId: articleResult.logId,
          exportPath: exported ?? undefined,
          summary: "已确认文章草稿并导出 Markdown，公众号 IP 内容 SOP 进入完成态。",
        });
      }
    }
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
    if (articleWorkflowRunId) {
      const run = workflowRunById(articleWorkflowRunId);
      if (isIpLongformWorkflow(run)) {
        await recordWorkflowManualEvent({
          workflowRunId: run.id,
          event: "article-platform-draft-exported",
          promptDraftId: articlePromptDraftId,
          generationLogId: articleResult.logId,
          exportPath: exported.markdownPath,
          manifestPath: exported.manifestPath,
          packageDir: exported.packageDir,
          summary: "已确认文章草稿并导出平台草稿包，公众号 IP 内容 SOP 进入完成态。",
        });
      }
    }
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
    setActiveModule("image");
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
    setActiveModule("image");
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
      setActiveModule("image");
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
      setActiveModule("image");
    } else {
      throw new Error(`暂不支持重试该历史类型：${log.kind}`);
    }

    await refresh(workspace);
  }

  async function generateImage(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    if (params.runMode !== "single")
      throw new Error("批量 / 定时队列当前未启用，请先切回单次处理。");
    const workflowRun = imageWorkflowRunId
      ? workflowRuns.find((run) => run.id === imageWorkflowRunId)
      : imageReworkSource?.workflowRunId
        ? workflowRuns.find((run) => run.id === imageReworkSource.workflowRunId)
      : undefined;
    const result = await window.contentStudio.generateImage({
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
      params,
    });
    context?.throwIfCancelled();
    setMediaResult(result);
    if (workflowRun && isImageSopWorkflow(workflowRun) && result.status === "succeeded") {
      await recordWorkflowManualEvent({
        workflowRunId: workflowRun.id,
        event: "image-candidates-generated",
        generationLogId: result.logId,
        assetRefs: result.assetRefs,
        summary: `已从图片工作台生成 ${result.assetRefs.length || 1} 个候选图。`,
      });
      setImageWorkflowRunId("");
    }
    if (result.status === "succeeded") setImageReworkSource(null);
    await refresh(workspace);
  }

  async function generateVideo(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateVideo({
      workspacePath: workspace,
      imageAssetRefs: [...productImageRefs, ...referenceImageRefs],
      videoAssetRefs,
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
        durationSeconds: videoDurationSeconds,
      },
    });
    context?.throwIfCancelled();
    setMediaResult(result);
    await refresh(workspace);
  }

  function buildVideoPromptHandoffContent(): string {
    const materialLines = [
      ...productImageRefs.map((ref) => `- 产品图：${fileNameFromPath(ref)}`),
      ...referenceImageRefs.map((ref) => `- 参考图：${fileNameFromPath(ref)}`),
      ...videoAssetRefs.map((ref) => `- 参考视频：${fileNameFromPath(ref)}`),
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
    const breakdownLines = videoBreakdown?.segments.map((segment) =>
      `- ${segment.timeRange}：${segment.hook}；可复用点：${segment.reusablePoint}`,
    ) ?? [];
    const storyboardLines = videoScript?.storyboard.map((shot) => [
      `### 镜头 ${shot.shot}（${shot.duration}）`,
      `画面：${shot.visual}`,
      `口播：${shot.voiceover}`,
      `字幕：${shot.subtitle || "无"}`,
      `节奏：${shot.rhythm}`,
    ].join("\n")) ?? [];

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
      breakdownLines.length ? ["", "## 参考视频拆解", ...breakdownLines].join("\n") : "",
      videoScript?.script ? ["", "## 新视频脚本", videoScript.script].join("\n") : "",
      storyboardLines.length ? ["", "## 分镜脚本", ...storyboardLines].join("\n\n") : "",
    ].filter((line) => line.trim().length > 0).join("\n");
  }

  async function openVideoPromptHandoff(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const content = buildVideoPromptHandoffContent();
    const source = await window.contentStudio.registerInputSource({
      workspacePath: workspace,
      kind: "manual-note",
      purpose: "sop-input",
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
    await refresh(workspace);
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
    effectiveTheme,
    showSettingsDialog,
    setShowSettingsDialog,
    settingsTab,
    setSettingsTab,
    modelSettingView,
    setModelSettingView,
    providerTab,
    setProviderTab,
    responsesApiActive,
    setResponsesApiActive,
    menubarShow,
    setMenubarShow,
    autoStart,
    setAutoStart,
    notificationsEnabled,
    setNotificationsEnabled,
    reduceAnimation,
    setReduceAnimation,
    syncClaudeHistory,
    setSyncClaudeHistory,
    shortcutActive,
    setShortcutActive,
    commandWhitelist,
    setCommandWhitelist,
    activeModule,
    setActiveModule,
    settings,
    updateState,
    setUpdateState,
    modelConfig,
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
    workflowDefinitions,
    workflowRuns,
    activeWorkflowDefinition,
    activeWorkflowDefinitionId,
    setActiveWorkflowDefinitionId,
    activeWorkflowRun,
    activeWorkflowRunId,
    setActiveWorkflowRunId,
    params,
    setParams,
    productImageRefs,
    referenceImageRefs,
    videoAssetRefs,
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
    installBuiltinKnowledgeBase,
    importKnowledgeBase,
    importInputSource,
    importFinishedVideo,
    registerManualInputSource,
    generatePromptDraft,
    startAgentPromptSession,
    continueAgentPromptSession,
    generateBrandKnowledgeBase,
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
    approveWorkflowRunReview,
    archiveWorkflowRunAssets,
    reworkAsset,
    distillAssetPrompt,
    useScenePromptInImage,
    usePromptDraftInVideo,
    usePromptDraftInArticle,
    usePromptDraftInGreenScreen,
    generatePromptPack,
    generateSceneCards,
    savePromptPackDraft,
    saveSceneCardDraft,
    updateSceneCard,
    createWorkflowDraft,
    materializePromptDraftToWorkflow,
    materializePromptDraftToSkill,
    publishWorkflowDefinition,
    updateWorkflowDefinition,
    startWorkflowRun,
    openWorkflowRunBrandKnowledge,
    openWorkflowRunIpKnowledge,
    openWorkflowRunSceneLibrary,
    openWorkflowRunPromptDraft,
    openWorkflowRunAssetReview,
    openWorkflowRunReferenceReverse,
    openWorkflowRunImageWorkbench,
    openWorkflowRunArticleWorkbench,
    openWorkflowRunPrompt,
    importWorkflowRunFinishedVideo,
    openWorkflowRunOverlay,
    openWorkflowRunMixExport,
    openWorkflowRunPlatformDraft,
    openTraceWorkflowRun,
    openTraceGenerationLog,
    openTracePromptDraft,
    openTraceSceneCards,
    generateArticle,
    exportArticleMarkdown,
    exportArticlePlatformDraft,
    copyPlatformDraftText,
    copyLogPrompt,
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
    generateVideoScript,
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
