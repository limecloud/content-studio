import type {
  AppSettingsView,
  AutoUpdateState,
  BuguAuthState,
  ContentStudioApi,
  GeneratePromptDraftInput,
  ImageGenerationRequest,
  MediaGenerationResult,
  ModelCatalogView,
  ModelConfigView,
  PromptDraft,
  SaveSettingsInput,
  SceneCard,
  SkillSelectionView,
  SubmitGenerationTaskInput,
  VideoGenerationRequest,
} from "../../shared/types";

const DEV_WORKSPACE_PATH = "/tmp/content-studio-browser-dev";

const authState: BuguAuthState = {
  authenticated: true,
  user: {
    id: "browser-dev-user",
    displayName: "布谷AI",
    username: "browser-dev",
  },
  session: {
    id: "browser-dev-session",
  },
  bootstrap: {
    tenant: {
      id: "bugu",
      name: "布谷AI",
      slug: "bugu",
    },
    branding: {
      brandId: "bugu",
      tenantId: "bugu",
      appName: "布谷AI",
      shortName: "布谷AI",
    },
    user: {
      id: "browser-dev-user",
      displayName: "布谷AI",
      username: "browser-dev",
    },
  },
};

const settings: AppSettingsView = {
  workspacePath: DEV_WORKSPACE_PATH,
  hasAnthropicApiKey: false,
  apiKeyStorage: "none",
  autoUpdateEnabled: false,
};

const updateState: AutoUpdateState = {
  enabled: false,
  status: "idle",
  currentVersion: "0.14.0",
  hasUpdate: false,
};

const modelConfig: ModelConfigView = {
  apiEndpoint: "",
  hasApiKey: true,
  safeStorageAvailable: false,
  textProvider: "anthropic-claude-sdk",
  textProtocol: "claude-sdk",
  textApiEndpoint: "",
  hasTextApiKey: true,
  textApiKeyStatus: "available",
  textModel: "claude-sonnet-4-5",
  imageProvider: "openai-responses",
  imageProtocol: "openai-responses",
  imageApiEndpoint: "",
  imageOuterModel: "gpt-image-2",
  hasImageApiKey: true,
  imageApiKeyStatus: "available",
  imageModels: ["gpt-image-2"],
  videoProvider: "generic-http",
  videoApiEndpoint: "",
  hasVideoApiKey: true,
  videoApiKeyStatus: "available",
  videoModel: "veo-3.1",
  updatedAt: new Date().toISOString(),
};

const modelCatalog: ModelCatalogView = {
  textModels: ["claude-sonnet-4-5"],
  imageModels: ["gpt-image-2"],
  videoModels: ["veo-3.1"],
  source: "offline-seed",
  updatedAt: new Date().toISOString(),
};

function generationResult(kind: "image" | "video", refs: string[]): MediaGenerationResult {
  return {
    logId: `browser-dev-${kind}-${Date.now()}`,
    status: "succeeded",
    message: "浏览器开发模式已模拟生成结果；Electron 正式运行时会调用真实主进程服务。",
    assetRefs: refs,
  };
}

function generationTask(input: SubmitGenerationTaskInput) {
  const createdAt = new Date().toISOString();
  return {
    id: `browser-dev-task-${Date.now()}`,
    workspacePath: input.input.workspacePath,
    logId: `browser-dev-${input.kind}-${Date.now()}`,
    kind: input.kind,
    status: "queued" as const,
    title: `${input.kind} 浏览器开发任务`,
    message: "浏览器开发模式已模拟提交后台生成任务。",
    createdAt,
    updatedAt: createdAt,
  };
}

function promptDraft(input: Pick<GeneratePromptDraftInput, "workspacePath" | "purpose" | "userIntent">): PromptDraft {
  const createdAt = new Date().toISOString();
  return {
    id: `browser-dev-draft-${Date.now()}`,
    workspacePath: input.workspacePath,
    title: input.userIntent.slice(0, 24) || "浏览器开发 Prompt",
    purpose: input.purpose,
    status: "confirmed",
    userIntent: input.userIntent,
    inputSourceIds: [],
    versions: [
      {
        id: "browser-dev-version",
        version: 1,
        content: input.userIntent,
        createdAt,
      },
    ],
    activeVersionId: "browser-dev-version",
    createdAt,
    updatedAt: createdAt,
  };
}

function sceneCard(): SceneCard {
  const createdAt = new Date().toISOString();
  return {
    id: `browser-dev-scene-${Date.now()}`,
    workspacePath: DEV_WORKSPACE_PATH,
    promptPackId: "",
    title: "浏览器开发场景",
    audience: "电商用户",
    painPoint: "需要快速验证页面交互",
    usageScene: "本地浏览器复刻校验",
    visualComposition: "产品居中展示，背景简洁",
    sellingPoint: "用于 Playwright 对照测试",
    voiceoverDirection: "浏览器开发模式",
    imageMaterialSuggestion: "使用内置 DressingKit 案例图片",
    videoMaterialSuggestion: "使用内置 DressingKit 视频案例素材",
    citations: [],
    createdAt,
    updatedAt: createdAt,
  };
}

function createDevBridge(): ContentStudioApi {
  const selection: SkillSelectionView = {
    workspacePath: DEV_WORKSPACE_PATH,
    enabledSkills: [],
  };
  const devSkill = {
    slug: "browser-dev",
    source: "user" as const,
    path: "",
    metadata: { name: "browser-dev", description: "" },
    valid: true,
  };
  const createInstallSkillResult = () => ({
    skill: devSkill,
    skills: [],
    targetPath: "",
  });
  const createDraft = (input: Pick<GeneratePromptDraftInput, "workspacePath" | "purpose" | "userIntent">) =>
    promptDraft(input);
  const createAgentResult = (input: { workspacePath: string; purpose?: PromptDraft["purpose"]; userIntent?: string }) => {
    const createdAt = new Date().toISOString();
    const draft = createDraft({
      workspacePath: input.workspacePath,
      purpose: input.purpose || "image",
      userIntent: input.userIntent || "浏览器开发 Agent 会话",
    });
    return {
      session: {
        id: `browser-dev-agent-${Date.now()}`,
        workspacePath: input.workspacePath,
        title: draft.title,
        purpose: draft.purpose,
        status: "draft-created" as const,
        userIntent: draft.userIntent,
        inputSourceIds: [],
        promptDraftIds: [draft.id],
        sourceSnapshots: [],
        messages: [],
        createdAt,
        updatedAt: createdAt,
      },
      draft,
    };
  };
  const createReviewRecord = () => {
    const createdAt = new Date().toISOString();
    return {
      id: "browser-dev-review",
      workspacePath: DEV_WORKSPACE_PATH,
      assetKey: "browser-dev-asset",
      kind: "image" as const,
      sourceType: "manual" as const,
      path: "",
      title: "浏览器开发素材",
      status: "approved" as const,
      tags: [],
      notes: "",
      evidenceFiles: [],
      createdAt,
      updatedAt: createdAt,
    };
  };
  const createMixPackageRecord = () => {
    const createdAt = new Date().toISOString();
    return {
      id: "browser-dev-mix",
      workspacePath: DEV_WORKSPACE_PATH,
      title: "浏览器开发混剪包",
      platform: "browser-dev",
      packageDir: "",
      manifestPath: "",
      assets: [],
      createdAt,
      updatedAt: createdAt,
    };
  };
  const createWorkflowDefinition = () => {
    const createdAt = new Date().toISOString();
    return {
      id: "browser-dev-workflow",
      workspacePath: DEV_WORKSPACE_PATH,
      key: "browser-dev-workflow",
      version: "v0.1",
      title: "浏览器开发工作流",
      description: "",
      status: "draft" as const,
      priority: "P2" as const,
      inputSchema: [],
      steps: [],
      reviewRules: [],
      outputSpec: [],
      tags: [],
      createdAt,
      updatedAt: createdAt,
    };
  };
  const createWorkflowRun = (id = "browser-dev-workflow-run") => {
    const createdAt = new Date().toISOString();
    return {
      id,
      workspacePath: DEV_WORKSPACE_PATH,
      workflowDefinitionId: "browser-dev-workflow",
      workflowKey: "browser-dev-workflow",
      workflowVersion: "v0.1",
      title: "浏览器开发工作流",
      status: "running" as const,
      summary: "",
      inputs: {},
      steps: [],
      artifactRefs: [],
      createdAt,
      updatedAt: createdAt,
    };
  };
  const api: Partial<ContentStudioApi> = {
    authGetSession: async () => authState,
    authLoginByPassword: async () => authState,
    authSendEmailCode: async () => ({ sent: true, expiresInSeconds: 300 }),
    authVerifyEmailCode: async () => authState,
    authLogout: async () => authState,
    getOemSiteConfig: async () => ({ tenantId: "bugu", slug: "bugu", displayName: "布谷AI" }),

    getSettings: async () => settings,
    saveSettings: async (input: SaveSettingsInput) => ({ ...settings, workspacePath: input.workspacePath ?? settings.workspacePath }),
    selectWorkspace: async () => DEV_WORKSPACE_PATH,

    getUpdateState: async () => updateState,
    checkForUpdates: async () => updateState,
    setAutoUpdateEnabled: async () => updateState,
    openUpdateDownload: async () => ({ ok: true }),
    openUpdateReleaseNotes: async () => ({ ok: true }),
    openLogsDirectory: async () => ({ ok: true }),
    onUpdateState: () => () => undefined,

    getModelConfig: async () => modelConfig,
    saveModelConfig: async () => modelConfig,
    getModelCatalog: async () => modelCatalog,

    scanSkills: async () => [],
    installBuiltinSkill: async () => [],
    createSkill: async () => createInstallSkillResult(),
    uploadSkillPackage: async () => null,
    openSkillFolder: async () => undefined,
    renameSkill: async () => [],
    replaceSkillPackage: async () => null,
    uninstallSkill: async () => [],
    readSkillFile: async () => "",
    getPathForFile: () => null,
    stageSkillPackage: async () => "",
    previewSkillPackage: async () => ({
      packagePath: "",
      slug: "browser-dev",
      metadata: { name: "browser-dev", description: "" },
      rootDir: "",
      targetExists: false,
      files: [],
      selectedPath: "",
      selectedContent: "",
    }),
    readSkillPackageFile: async () => "",
    installSkillPackage: async () => createInstallSkillResult(),
    onSkillPackageOpenRequest: () => () => undefined,
    notifySkillPackageOpenReady: () => undefined,
    getSkillFileAssociation: async () => ({
      platform: "browser",
      supported: false,
      canSetDefault: false,
      isDefault: false,
      appBundleId: "",
      message: "浏览器开发模式不支持文件关联。",
    }),
    setSkillFileAssociationDefault: async () => ({
      platform: "browser",
      supported: false,
      canSetDefault: false,
      isDefault: false,
      appBundleId: "",
      message: "浏览器开发模式不支持文件关联。",
      ok: false,
      error: "浏览器开发模式不支持文件关联。",
    }),
    getSkillSelection: async () => selection,
    setSkillEnabled: async () => selection,

    listKnowledgeBases: async () => [],
    importKnowledgeBaseFromFile: async () => null,
    searchKnowledge: async () => [],
    listPromptPacks: async () => [],
    listBrandKnowledgeBases: async () => [],
    listIpKnowledgeBases: async () => [],
    listSceneCards: async () => [],
    listInputSources: async () => [],
    listPromptDrafts: async () => [],
    generatePromptDraft: async (input) => createDraft(input),
    createPromptDraftFromContent: async (input) => createDraft({ workspacePath: input.workspacePath, purpose: input.purpose, userIntent: input.content }),
    updatePromptDraft: async (input) => createDraft({ workspacePath: input.workspacePath, purpose: "image", userIntent: input.content }),
    recordPromptDraftCopy: async (input) => createDraft({ workspacePath: input.workspacePath, purpose: "image", userIntent: input.draftId }),
    listAgentPromptSessions: async () => [],
    startAgentPromptSession: async (input) => createAgentResult(input),
    continueAgentPromptSession: async (input) => createAgentResult({ workspacePath: input.workspacePath, userIntent: input.message }),
    listOverlayCards: async () => [],
    generateOverlayCards: async () => [],
    listAssetReviews: async () => [],
    reviewAsset: async () => createReviewRecord(),
    listMixPackages: async () => [],
    exportMixPackage: async () => createMixPackageRecord(),
    recordMixPackageImportEvidence: async () => createMixPackageRecord(),
    listPlatformDrafts: async () => [],
    listWorkflowDefinitions: async () => [],
    createWorkflowDraft: async () => createWorkflowDefinition(),
    updateWorkflowDefinition: async (input) => input,
    listWorkflowRuns: async () => [],
    startWorkflowRun: async () => createWorkflowRun(),
    recordWorkflowManualEvent: async (input) => createWorkflowRun(input.workflowRunId),
    listGenerationLogs: async () => [],

    selectAssetFiles: async () => [],
    revealPath: async () => ({ ok: true }),
    exportAsset: async () => null,
    exportMarkdown: async () => null,
    exportPlatformDraft: async () => ({
      packageDir: "",
      markdownPath: "",
      platformCopyPath: "",
      formatGuidePath: "",
      metadataPath: "",
      checklistPath: "",
      manifestPath: "",
    }),
    readPlatformDraftCopyText: async () => "",
    generateArticle: async () => ({
      logId: "browser-dev-article",
      titleCandidates: ["浏览器开发标题"],
      outline: [],
      summary: "浏览器开发模式未启用文章生成。",
      markdown: "",
      publishCheck: [],
    }),
    reverseReferencePrompt: async (input) => ({
      logId: "browser-dev-reference-reverse",
      analysis: {
        composition: "",
        lighting: "",
        textArea: "",
        style: "",
        reusableElements: [],
        risks: [],
        prompt: input.userIntent || "",
        negativePrompt: "",
        qualityChecklist: [],
      },
      promptDraft: promptDraft({ workspacePath: input.workspacePath, purpose: "image", userIntent: input.userIntent || "" }),
    }),
    analyzeVideo: async () => ({
      logId: "browser-dev-video-analysis",
      summary: "浏览器开发模式未启用视频拆解。",
      dimensions: [],
      segments: [],
      reusableFormula: [],
      risks: [],
    }),
    generateVideoScript: async () => ({
      logId: "browser-dev-video-script",
      title: "浏览器开发脚本",
      script: "",
      videoPrompt: "",
      storyboard: [],
      publishCheck: [],
    }),
    generateImage: async (input: ImageGenerationRequest) =>
      generationResult("image", [...(input.productImageRefs || []), ...(input.referenceImageRefs || [])]),
    generateImageSkill: async () => ({
      template: {
        id: "browser-dev",
        name: "浏览器开发",
        icon: "🧪",
        version: "0.0.0",
        category: "开发",
        description: "浏览器开发模式",
        prompts: { system: "", enhance: "", negative: "" },
        fields: [],
      },
      model: "browser-dev",
      rawText: "",
    }),
    importImageSkillFromFile: async () => null,
    generateVideo: async (input: VideoGenerationRequest) =>
      generationResult("video", [...(input.imageAssetRefs || []), ...(input.videoAssetRefs || [])]),
    submitGenerationTask: async (input: SubmitGenerationTaskInput) => generationTask(input),
    listGenerationTasks: async () => [],
    onGenerationTaskEvent: () => () => undefined,

    runTask: async () => ({ taskId: `browser-dev-task-${Date.now()}` }),
    cancelTask: async () => true,
    onAgentEvent: () => () => undefined,
  };

  return new Proxy(api, {
    get(target, key: keyof ContentStudioApi) {
      const value = target[key];
      if (value) return value;
      return async () => [];
    },
  }) as ContentStudioApi;
}

export function installDevContentStudioBridge(): void {
  if (!import.meta.env.DEV) return;
  if (typeof window === "undefined" || window.contentStudio) return;
  window.contentStudio = createDevBridge();
}
