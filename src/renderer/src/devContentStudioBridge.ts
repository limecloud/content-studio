import type {
  AgentPromptExecutionEvent,
  AgentPromptSession,
  AppSettingsView,
  AutoUpdateState,
  BrandCommandCenterRecord,
  BuguAuthState,
  BuildBrandCommandCenterInput,
  BuildContentKnowledgeMapInput,
  ContentKnowledgeMapBuildRunRecord,
  ContentKnowledgeMapRecord,
  ContentReviewDecisionAction,
  ContentReviewTask,
  ContentStudioApi,
  ExportContentKnowledgePackInput,
  GeneratePromptDraftInput,
  ImageGenerationRequest,
  InputSourcePurpose,
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
const DEV_RUNTIME_SCHEMA_VERSION = "agent-runtime-draft-2026-05";
const DEV_RUNTIME_ID = "content-studio-browser-dev";

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
  currentVersion: "0.16.0",
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

const devInputSources: ContentStudioApi extends { listInputSources(workspacePath: string): Promise<infer T> } ? T : never = [];
const devPromptDrafts: PromptDraft[] = [];
const devAgentPromptSessions: AgentPromptSession[] = [];
const devSceneCards: SceneCard[] = [];
const devContentKnowledgeMaps: ContentKnowledgeMapRecord[] = [];
const devContentKnowledgeMapBuildRuns: ContentKnowledgeMapBuildRunRecord[] = [];
const devContentDraftChanges: Awaited<ReturnType<ContentStudioApi["listContentDraftChanges"]>> = [];
const devContentKnowledgeReleases: Awaited<ReturnType<ContentStudioApi["listContentKnowledgeReleases"]>> = [];
const devBrandCommandCenters: BrandCommandCenterRecord[] = [];
const devContentReviewTasks: ContentReviewTask[] = [];
const devAssetReviews: Awaited<ReturnType<ContentStudioApi["listAssetReviews"]>> = [];

function devRuntimeEvent(
  input: Omit<AgentPromptExecutionEvent, "id" | "createdAt" | "schemaVersion" | "runtimeId"> & {
    id?: string;
    createdAt?: string;
  },
): AgentPromptExecutionEvent {
  const now = input.createdAt ?? new Date().toISOString();
  return {
    ...input,
    id: input.id ?? `browser-dev-event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    schemaVersion: DEV_RUNTIME_SCHEMA_VERSION,
    runtimeId: DEV_RUNTIME_ID,
    createdAt: now,
    completedAt: input.completedAt ?? (input.status === "pending" || input.status === "running" ? undefined : now),
  };
}

function devSnapshotEvent(input: {
  now: string;
  sequence: number;
  sessionId: string;
  turnId?: string;
  taskId?: string;
  runId?: string;
  status: AgentPromptSession["status"];
  events: AgentPromptExecutionEvent[];
  messageCount?: number;
  draftIds?: string[];
}): AgentPromptExecutionEvent {
  const resolvedActionIds = new Set(
    input.events
      .filter((event) => event.eventClass === "action.resolved" && event.actionId)
      .map((event) => event.actionId as string),
  );
  const pendingActionIds = input.events
    .filter((event) => event.eventClass === "action.required" && event.actionId && !resolvedActionIds.has(event.actionId))
    .map((event) => event.actionId as string);
  const artifactRefs = Array.from(new Set(input.events.flatMap((event) => event.artifactRefs ?? [])));
  const evidenceRefs = Array.from(new Set(input.events.flatMap((event) => event.evidenceRefs ?? [])));
  return devRuntimeEvent({
    kind: "state",
    status: "completed",
    eventClass: "snapshot.updated",
    owner: "runtime",
    phase: input.status === "blocked" ? "blocked" : "completed",
    sequence: input.sequence,
    threadId: input.sessionId,
    turnId: input.turnId,
    taskId: input.taskId,
    runId: input.runId,
    stepId: `snapshot:${input.sessionId}:${input.sequence}`,
    title: "会话快照已更新",
    detail: pendingActionIds.length ? `${pendingActionIds.length} 个待处理动作` : "当前没有待处理动作。",
    artifactRefs,
    evidenceRefs,
    payload: {
      sessionStatus: input.status,
      eventCount: input.events.length,
      messageCount: input.messageCount,
      draftIds: input.draftIds,
      pendingActionIds,
      artifactRefs,
      evidenceRefs,
    },
    createdAt: input.now,
  });
}

function devSourceSnapshots(sources: typeof devInputSources): AgentPromptSession["sourceSnapshots"] {
  return sources.map((source) => ({
    sourceId: source.id,
    title: source.title,
    kind: source.kind,
    purpose: source.purpose,
    status: source.status,
    summary: source.summary,
    markdownPath: source.markdownPath,
    blockedReason: source.blockedReason,
  }));
}

function generationResult(kind: "image" | "video", refs: string[]): MediaGenerationResult {
  return {
    logId: `browser-dev-${kind}-${Date.now()}`,
    status: "blocked",
    message: "浏览器开发模式未连接 Electron 主进程，不能模拟生成成功。请在 Electron 应用中配置真实生成服务后重试。",
    assetRefs: [],
  };
}

function generationTask(input: SubmitGenerationTaskInput) {
  const createdAt = new Date().toISOString();
  return {
    id: `browser-dev-task-${Date.now()}`,
    workspacePath: input.input.workspacePath,
    logId: `browser-dev-${input.kind}-${Date.now()}`,
    kind: input.kind,
    status: "blocked" as const,
    title: `${input.kind} 浏览器开发任务`,
    message: "浏览器开发模式未连接 Electron 主进程，后台生成任务未实际提交。",
    createdAt,
    updatedAt: createdAt,
  };
}

function promptDraft(input: Pick<GeneratePromptDraftInput, "workspacePath" | "purpose" | "userIntent"> & Partial<PromptDraft>): PromptDraft {
  const createdAt = new Date().toISOString();
  return {
    id: `browser-dev-draft-${Date.now()}`,
    workspacePath: input.workspacePath,
    contentKnowledgeMapId: input.contentKnowledgeMapId,
    contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
    coverageRowIds: input.coverageRowIds,
    sourceRefs: input.sourceRefs,
    title: input.userIntent.slice(0, 24) || "浏览器开发 Prompt",
    purpose: input.purpose,
    status: "confirmed",
    userIntent: input.userIntent,
    inputSourceIds: [],
    sceneCardIds: input.sceneCardIds,
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

function inputSource(purpose: InputSourcePurpose, title: string, sourcePath?: string) {
  const createdAt = new Date().toISOString();
  const kind = sourcePath ? "image" as const : "manual-note" as const;
  return {
    id: `browser-dev-source-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    workspacePath: DEV_WORKSPACE_PATH,
    kind,
    status: kind === "image" ? "blocked" as const : "converted" as const,
    purpose,
    title,
    sourcePath,
    tags: [purpose, kind],
    summary: sourcePath ? `已登记文件：${title}` : title,
    extractedText: kind === "manual-note" ? title : undefined,
    artifactRefs: sourcePath ? [sourcePath] : [],
    blockedReason: kind === "image" ? "浏览器开发模式已登记图片文件。" : undefined,
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

function sceneCardFromContent(input: Parameters<ContentStudioApi["createSceneCardFromContent"]>[0]): SceneCard {
  const createdAt = new Date().toISOString();
  return {
    id: `browser-dev-scene-${Date.now()}`,
    workspacePath: input.workspacePath,
    promptPackId: input.promptPackId,
    inputSourceIds: input.inputSourceIds,
    contentKnowledgeMapId: input.contentKnowledgeMapId,
    contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
    coverageRowIds: input.coverageRowIds,
    sourceRefs: input.sourceRefs,
    title: input.title,
    audience: input.audience,
    painPoint: input.painPoint,
    usageScene: input.usageScene,
    visualComposition: input.visualComposition,
    sellingPoint: input.sellingPoint,
    voiceoverDirection: input.voiceoverDirection,
    imageMaterialSuggestion: input.imageMaterialSuggestion,
    videoMaterialSuggestion: input.videoMaterialSuggestion,
    citations: input.citations ?? [],
    createdAt,
    updatedAt: createdAt,
  };
}

function contentKnowledgeMap(input: BuildContentKnowledgeMapInput): ContentKnowledgeMapRecord {
  const createdAt = new Date().toISOString();
  const source = devInputSources[0];
  const evidenceId = source ? `browser-dev-evidence-${source.id}` : "";
  const sourceRef = source ? `input-source:${source.id}` : "browser-dev";
  return {
    id: `browser-dev-map-${Date.now()}`,
    workspacePath: input.workspacePath,
    title: input.title || "浏览器开发内容知识地图",
    status: devInputSources.length ? "needs-review" : "blocked",
    syncStatus: "local-only",
    teamSync: {
      backend: "bugu",
      status: "local-only",
      message: "浏览器开发模式未连接 Bugu 业务后端，当前仅为本机草稿。",
    },
    sourceInputSourceIds: devInputSources.map((source) => source.id),
    brandKnowledgeBaseIds: [],
    sceneCardIds: devSceneCards.map((scene) => scene.id),
    promptDraftIds: devPromptDrafts.map((draft) => draft.id),
    sellingPoints: source ? [{
      id: `browser-dev-row-selling-${Date.now()}`,
      title: "浏览器开发卖点组合",
      summary: source.summary || source.title,
      tags: ["卖点", "浏览器开发"],
      sourceRefs: [sourceRef],
      evidenceRefs: [evidenceId],
      confidence: 72,
      status: "needs-review",
    }] : [],
    painPoints: source ? [{
      id: `browser-dev-row-pain-${Date.now()}`,
      title: "浏览器开发痛点组合",
      summary: "用于预览审核后交接到 Prompt 工作台。",
      tags: ["痛点", "浏览器开发"],
      sourceRefs: [sourceRef],
      evidenceRefs: [evidenceId],
      confidence: 68,
      status: "needs-review",
    }] : [],
    scenarios: devSceneCards.map((scene) => ({
      id: `browser-dev-row-scene-${scene.id}`,
      title: scene.title,
      summary: scene.usageScene,
      tags: ["场景", "浏览器开发"],
      sourceRefs: scene.sourceRefs ?? [],
      evidenceRefs: [evidenceId].filter(Boolean),
      confidence: 74,
      status: "needs-review" as const,
    })),
    evidence: devInputSources.map((source) => ({
      id: `browser-dev-evidence-${source.id}`,
      sourceType: "input-source",
      sourceId: source.id,
      sourceTitle: source.title,
      claim: source.summary || source.title,
      excerpt: source.extractedText || source.summary || source.title,
      status: source.status === "converted" ? "ready" : "needs-review",
    })),
    constraints: ["涉及功效、效果、对比和背书时必须回到证据来源。"],
    gaps: ["浏览器开发模式只预览界面，不模拟完整知识地图生成。"],
    coverage: {
      inputSourceCount: devInputSources.length,
      brandKnowledgeBaseCount: 0,
      sceneCardCount: devSceneCards.length,
      promptDraftCount: devPromptDrafts.length,
      evidenceCount: devInputSources.length,
      gapCount: 1,
      readyPercent: devInputSources.length ? 42 : 0,
    },
    model: "browser-dev",
    createdAt,
    updatedAt: createdAt,
  };
}

function contentKnowledgeMapBuildRun(record: ContentKnowledgeMapRecord): ContentKnowledgeMapBuildRunRecord {
  const now = new Date().toISOString();
  return {
    id: `browser-dev-map-run-${Date.now()}`,
    workspacePath: record.workspacePath,
    title: `${record.title} 生成流程`,
    status: record.status === "blocked" ? "blocked" : "completed",
    contentKnowledgeMapId: record.id,
    contentKnowledgeMapTitle: record.title,
    model: record.model,
    inputSourceIds: record.sourceInputSourceIds,
    brandKnowledgeBaseIds: record.brandKnowledgeBaseIds,
    ipKnowledgeBaseIds: record.ipKnowledgeBaseIds ?? [],
    sceneCardIds: record.sceneCardIds,
    promptDraftIds: record.promptDraftIds,
    readyPercent: record.coverage.readyPercent,
    evidenceCount: record.coverage.evidenceCount,
    gapCount: record.coverage.gapCount,
    issues: record.gaps,
    teamSync: record.teamSync,
    steps: [
      {
        key: "collect-inputs",
        title: "收集输入",
        status: "completed",
        message: `${record.sourceInputSourceIds.length} 个输入源`,
        startedAt: now,
        completedAt: now,
      },
      {
        key: "structure-output",
        title: "生成结构化矩阵",
        status: record.status === "blocked" ? "blocked" : "completed",
        message: record.gaps[0] || `${record.sellingPoints.length} 个卖点 / ${record.painPoints.length} 个痛点 / ${record.scenarios.length} 个场景`,
        startedAt: now,
        completedAt: now,
      },
      {
        key: "quality-check",
        title: "质量检查",
        status: record.status === "blocked" ? "blocked" : "completed",
        message: record.gaps[0] || `${record.coverage.readyPercent}% 内容可用`,
        startedAt: now,
        completedAt: now,
      },
    ],
    startedAt: now,
    completedAt: now,
    updatedAt: now,
  };
}

function brandCommandCenter(input: BuildBrandCommandCenterInput): BrandCommandCenterRecord {
  const createdAt = new Date().toISOString();
  const map = input.contentKnowledgeMapId
    ? devContentKnowledgeMaps.find((item) => item.id === input.contentKnowledgeMapId)
    : devContentKnowledgeMaps[0];
  const signalId = `browser-dev-signal-${Date.now()}`;
  const objectiveId = `browser-dev-objective-${Date.now()}`;
  const bundleId = `browser-dev-bundle-${Date.now()}`;
  const cellId = `browser-dev-cell-${Date.now()}`;
  const queueId = `browser-dev-queue-${Date.now()}`;
  return {
    id: `browser-dev-command-${Date.now()}`,
    workspacePath: input.workspacePath,
    title: input.title || "浏览器开发品牌战情室",
    status: map ? "active" : "blocked",
    syncStatus: "local-only",
    sourceKnowledgeMapId: map?.id,
    sourceKnowledgeMapTitle: map?.title,
    signals: map ? [{
      id: signalId,
      type: "feedback-pain",
      title: "浏览器开发信号",
      summary: "用于预览品牌战情室交互。",
      sourceLabel: "浏览器开发",
      businessValue: 72,
      evidenceReadiness: 42,
      urgency: 50,
      riskLevel: 30,
      productionCost: 40,
      recommendedObjectiveType: "objection-handling",
      riskBoundary: "浏览器开发模式不模拟真实发布检查。",
      relatedMapRowIds: [],
    }] : [],
    objectives: map ? [{
      id: objectiveId,
      type: "objection-handling",
      title: "异议解释：浏览器开发信号",
      summary: "预览从信号到队列的闭环。",
      priority: "P1",
      channels: ["小红书", "私域"],
      successCriteria: ["生成可交接 Prompt 草稿。"],
      signalIds: [signalId],
    }] : [],
    resourceBundles: map ? [{
      id: bundleId,
      title: "浏览器开发资源包",
      objectiveId,
      sourceKnowledgeMapId: map.id,
      sellingPointRefs: map.sellingPoints.slice(0, 2).map((row) => row.title),
      evidenceRefs: map.evidence.slice(0, 2).map((item) => item.id),
      sceneRefs: map.scenarios.slice(0, 2).map((row) => row.title),
      promptDraftIds: [],
      materialRefs: [],
      sopRefs: [],
      constraints: map.constraints.slice(0, 2),
      gaps: ["浏览器开发模式只预览界面。"],
      readyPercent: 48,
    }] : [],
    campaignCells: map ? [{
      id: cellId,
      title: "浏览器开发作战单元",
      objectiveId,
      ownerRole: "内容运营",
      agentRole: "内容工程 Agent",
      channels: ["小红书"],
      timeWindow: "今天",
      resourceBundleId: bundleId,
      decisionChecks: [{ key: "dev", label: "发布检查", status: "needs-resource", message: "浏览器开发模式需要真实数据后再执行。" }],
      queueItemIds: [queueId],
    }] : [],
    queueItems: map ? [{
      id: queueId,
      campaignCellId: cellId,
      actionType: "generate-prompt-draft",
      title: "生成内容 Prompt 草稿",
      summary: "浏览器开发模式预览队列动作。",
      status: "needs-resource",
      blockedReason: "缺少真实资源。",
      recoveryAction: "在 Electron 中生成内容知识地图。",
      outputTarget: "prompt-draft",
      resourceBundleId: bundleId,
      createdAt,
      updatedAt: createdAt,
    }] : [],
    actionRecords: [],
    constraints: map?.constraints ?? [],
    gaps: map ? ["浏览器开发模式只预览界面。"] : ["缺少内容知识地图。"],
    teamSync: {
      backend: "bugu",
      status: "local-only",
      message: "浏览器开发模式未连接 Bugu 业务后端。",
    },
    createdAt,
    updatedAt: createdAt,
  };
}

function contentKnowledgePackExport(input: ExportContentKnowledgePackInput) {
  const map = input.contentKnowledgeMapId
    ? devContentKnowledgeMaps.find((item) => item.id === input.contentKnowledgeMapId)
    : devContentKnowledgeMaps[0];
  if (!map || map.status !== "ready") {
    return {
      status: "blocked" as const,
      files: [],
      issues: [map ? "浏览器开发模式中的知识地图未通过检查。" : "缺少内容知识地图。"],
    };
  }
  return {
    status: "exported" as const,
    packageDir: `${input.workspacePath}/.content-studio/exports/agentknowledge/browser-dev`,
    knowledgePath: `${input.workspacePath}/.content-studio/exports/agentknowledge/browser-dev/KNOWLEDGE.md`,
    manifestPath: `${input.workspacePath}/.content-studio/exports/agentknowledge/browser-dev/manifest.json`,
    files: ["KNOWLEDGE.md", "ontology/ontology.json", "compiled/prompt-grounding.md"],
    issues: [],
  };
}

function contentReviewTasks(workspacePath: string, input?: { targetRowIds?: string[]; taskPurpose?: ContentReviewTask["taskPurpose"] }): ContentReviewTask[] {
  const map = devContentKnowledgeMaps[0];
  if (!map) return [];
  const createdAt = new Date().toISOString();
  const targetRowIds = new Set(input?.targetRowIds?.filter(Boolean) ?? []);
  const hasTargets = targetRowIds.size > 0;
  const taskPurpose = input?.taskPurpose ?? "review";
  const rows = [
    ...map.sellingPoints.map((row) => ({ targetType: "selling-point" as const, row })),
    ...map.painPoints.map((row) => ({ targetType: "pain-point" as const, row })),
    ...map.scenarios.map((row) => ({ targetType: "scenario" as const, row })),
  ].filter(({ row }) => (
    hasTargets
      ? targetRowIds.has(row.id)
      : taskPurpose === "material-supplement"
        ? row.materialStatus === "missing" || !row.materialRefs?.length
        : row.status !== "ready" || row.evidenceRefs.length === 0 || row.confidence < 65
  ));
  return [
    ...rows.slice(0, hasTargets ? rows.length : 4).map(({ targetType, row }) => ({
      id: `browser-dev-review-${taskPurpose}-${row.id}`,
      workspacePath,
      sourceKnowledgeMapId: map.id,
      sourceKnowledgeMapTitle: map.title,
      targetType,
      targetId: row.id,
      title: taskPurpose === "material-supplement" ? `补素材：${row.title}` : row.title,
      summary: taskPurpose === "material-supplement"
        ? `当前组合需要补充可用图片、视频、案例或客服截图。\n${row.summary}`
        : row.summary,
      taskPurpose,
      evidenceRefs: row.evidenceRefs,
      sourceRefs: row.sourceRefs,
      risk: row.status === "ready" && row.confidence >= 65 && row.evidenceRefs.length ? "low" as const : row.evidenceRefs.length ? "medium" as const : "high" as const,
      status: taskPurpose === "material-supplement" ? "needs-material" as const : row.evidenceRefs.length ? "open" as const : "needs-evidence" as const,
      suggestedAction: taskPurpose === "material-supplement" ? "request-material" as const : row.evidenceRefs.length ? "approve" as const : "request-evidence" as const,
      issueLabels: taskPurpose === "material-supplement" ? ["补素材", "缺素材"] : row.evidenceRefs.length ? ["本批送审"] : ["缺证据"],
      decisions: [],
      createdAt,
      updatedAt: createdAt,
    })),
    ...(hasTargets ? [] : map.gaps.slice(0, 4).map((gap, index) => ({
      id: `browser-dev-review-gap-${index}`,
      workspacePath,
      sourceKnowledgeMapId: map.id,
      sourceKnowledgeMapTitle: map.title,
      targetType: "gap" as const,
      title: "知识地图缺口处理",
      summary: gap,
      taskPurpose: "evidence-supplement" as const,
      evidenceRefs: [],
      sourceRefs: [],
      risk: "medium" as const,
      status: "needs-evidence" as const,
      suggestedAction: "request-evidence" as const,
      issueLabels: ["缺口"],
      decisions: [],
      createdAt,
      updatedAt: createdAt,
    }))),
  ];
}

function reviewStatusForAction(action: ContentReviewDecisionAction): ContentReviewTask["status"] {
  if (action === "approve") return "approved";
  if (action === "reject") return "rejected";
  if (action === "mark-forbidden") return "forbidden";
  if (action === "request-evidence") return "needs-evidence";
  if (action === "request-material") return "needs-material";
  return "open";
}

export function createDevBridge(): ContentStudioApi {
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
  const createDraft = (input: Pick<GeneratePromptDraftInput, "workspacePath" | "purpose" | "userIntent"> & Partial<PromptDraft>) =>
    promptDraft(input);
  const createAgentResult = (input: Parameters<ContentStudioApi["startAgentPromptSession"]>[0]) => {
    const createdAt = new Date().toISOString();
    const selectedSourceIds = new Set(input.inputSourceIds ?? []);
    const selectedSources = devInputSources.filter((source) => selectedSourceIds.has(source.id));
    const evidenceRefs = selectedSources.map((source) => `input-source:${source.id}`);
    const hasSources = selectedSources.length > 0;
    const draft = createDraft({
      workspacePath: input.workspacePath,
      purpose: input.purpose || "image",
      userIntent: input.userIntent || "浏览器开发对话",
    });
    const idSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const sessionId = `browser-dev-agent-${idSuffix}`;
    const turnId = `turn:${idSuffix}`;
    const runId = `run:${idSuffix}`;
    const taskId = `task:${sessionId}:draft`;
    const toolCallId = `tool:${sessionId}:input-sources`;
    const actionId = `action:add-input-source:${idSuffix}`;
    draft.status = "draft";
    draft.inputSourceIds = selectedSources.map((source) => source.id);
    draft.model = "blocked:browser-dev-runtime";
    draft.textProtocol = modelConfig.textProtocol;
    devPromptDrafts.unshift(draft);
    const events: AgentPromptExecutionEvent[] = [
      devRuntimeEvent({
        id: `browser-dev-event-submit-${idSuffix}`,
        kind: "context",
        status: "completed",
        eventClass: "turn.submitted",
        owner: "runtime",
        threadId: sessionId,
        turnId,
        taskId,
        runId,
        phase: "submitted",
        title: "已收到需求",
        createdAt,
      }),
      devRuntimeEvent({
        id: `browser-dev-event-tool-start-${idSuffix}`,
        kind: "tool",
        status: "completed",
        eventClass: "tool.started",
        owner: "runtime",
        threadId: sessionId,
        turnId,
        taskId,
        runId,
        phase: "tool_running",
        toolCallId,
        title: "准备读取资料",
        detail: hasSources ? `待读取 ${selectedSources.length} 份输入源。` : "本轮没有选择可复用输入源。",
        refIds: selectedSources.map((source) => source.id),
        evidenceRefs,
        payload: {
          toolName: "input-source.read",
          safeArgs: { sourceCount: selectedSources.length },
        },
        createdAt,
      }),
      devRuntimeEvent({
        id: `browser-dev-event-context-${idSuffix}`,
        kind: "source",
        status: hasSources ? "completed" : "blocked",
        eventClass: "context.resolved",
        owner: "runtime",
        threadId: sessionId,
        turnId,
        taskId,
        runId,
        phase: hasSources ? "preparing" : "blocked",
        title: hasSources ? "已读取输入源" : "缺少输入源",
        detail: hasSources ? `已选择 ${selectedSources.length} 个输入源。` : "需要先登记产品资料、参考素材或业务说明。",
        refIds: selectedSources.map((source) => source.id),
        evidenceRefs,
        payload: { sourceCount: selectedSources.length },
        createdAt,
      }),
      devRuntimeEvent({
        id: `browser-dev-event-tool-result-${idSuffix}`,
        kind: "tool",
        status: hasSources ? "completed" : "blocked",
        eventClass: hasSources ? "tool.result" : "tool.failed",
        owner: "runtime",
        threadId: sessionId,
        turnId,
        taskId,
        runId,
        phase: hasSources ? "completed" : "blocked",
        toolCallId,
        title: hasSources ? "资料读取完成" : "资料读取受阻",
        detail: hasSources ? `${selectedSources.length} 份资料已进入上下文。` : "缺少输入源，需要人工补充资料。",
        refIds: selectedSources.map((source) => source.id),
        evidenceRefs,
        payload: {
          toolName: "input-source.read",
          outputPreview: hasSources ? `${selectedSources.length} sources` : "missing sources",
        },
        createdAt,
      }),
      ...(hasSources ? [
        devRuntimeEvent({
          id: `browser-dev-event-evidence-${idSuffix}`,
          kind: "evidence",
          status: "completed",
          eventClass: "evidence.changed",
          owner: "evidence",
          threadId: sessionId,
          turnId,
          taskId,
          runId,
          phase: "preparing",
          title: "绑定来源证据",
          detail: `${selectedSources.length} 份输入源已进入本轮证据链。`,
          refIds: selectedSources.map((source) => source.id),
          evidenceRefs,
          payload: { evidenceKind: "input-source", sourceCount: selectedSources.length },
          createdAt,
        }),
      ] : [
        devRuntimeEvent({
          id: `browser-dev-event-permission-source-${idSuffix}`,
          kind: "permission",
          status: "pending",
          eventClass: "permission.requested",
          owner: "runtime",
          threadId: sessionId,
          turnId,
          taskId,
          runId,
          actionId,
          phase: "action_required",
          title: "请求补充资料权限",
          detail: "需要用户补充输入源后再继续生成。",
          payload: {
            permissionDecision: {
              decision: "ask",
              decisionSource: "runtime",
              decisionReason: "missing-input-source",
              approvalActionId: actionId,
              scope: "turn",
            },
          },
          createdAt,
        }),
        devRuntimeEvent({
        id: `browser-dev-event-action-${idSuffix}`,
        kind: "action" as const,
        status: "pending" as const,
        eventClass: "action.required" as const,
        owner: "runtime" as const,
        threadId: sessionId,
        turnId,
        taskId,
        runId,
        actionId,
        phase: "action_required" as const,
        title: "需要补充输入源",
        detail: "先补充可追溯资料，再继续生成 Prompt 草稿。",
        payload: {
          actionKind: "add-input-source",
          targetModule: "knowledge-inputs",
        },
        createdAt,
        }),
      ]),
      devRuntimeEvent({
        id: `browser-dev-event-model-${idSuffix}`,
        kind: "model",
        status: "blocked",
        eventClass: "model.failed",
        owner: "runtime",
        threadId: sessionId,
        turnId,
        taskId,
        runId,
        phase: "blocked",
        model: draft.model,
        title: "未执行文字模型",
        detail: "浏览器开发模式未连接 Electron 主进程，不能模拟模型生成成功。",
        payload: {
          protocol: modelConfig.textProtocol,
          model: draft.model,
          blockedReason: "browser-dev-bridge",
        },
        createdAt,
      }),
    ];
    const sequencedEvents = events.map((event, index) => ({ ...event, sequence: index + 1 }));
    const status: AgentPromptSession["status"] = hasSources ? "blocked" : "waiting-user";
    const executionEvents = [
      ...sequencedEvents,
      devSnapshotEvent({
        now: createdAt,
        sequence: sequencedEvents.length + 1,
        sessionId,
        turnId,
        taskId,
        runId,
        status,
        events: sequencedEvents,
        messageCount: 1,
        draftIds: [draft.id],
      }),
    ];
    const session: AgentPromptSession = {
      id: sessionId,
      workspacePath: input.workspacePath,
      title: draft.title,
      purpose: draft.purpose,
      status,
      userIntent: draft.userIntent,
      inputSourceIds: selectedSources.map((source) => source.id),
      promptDraftIds: [draft.id],
      sourceSnapshots: devSourceSnapshots(selectedSources),
      messages: [
        {
          id: `browser-dev-message-user-${idSuffix}`,
          role: "user",
          kind: "intent",
          content: draft.userIntent,
          createdAt,
        },
      ],
      executionEvents,
      model: modelConfig.textModel,
      textProtocol: modelConfig.textProtocol,
      createdAt,
      updatedAt: createdAt,
    };
    devAgentPromptSessions.unshift(session);
    return {
      session,
      draft,
    };
  };
  const continueAgentResult = (input: Parameters<ContentStudioApi["continueAgentPromptSession"]>[0]) => {
    const session = devAgentPromptSessions.find((item) => item.id === input.sessionId);
    if (!session) throw new Error(`对话不存在: ${input.sessionId}`);
    const draftId = session.promptDraftIds[session.promptDraftIds.length - 1];
    const draft = devPromptDrafts.find((item) => item.id === draftId);
    if (!draft) throw new Error(`对话关联的 Prompt 草稿不存在: ${draftId}`);

    const now = new Date().toISOString();
    const idSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const turnId = `turn:refine:${idSuffix}`;
    const runId = `run:refine:${idSuffix}`;
    const taskId = `task:${session.id}:refine`;
    const events = session.executionEvents ?? [];
    const nextVersion = {
      id: `browser-dev-version-${idSuffix}`,
      version: draft.versions.length + 1,
      content: [
        draft.versions.find((version) => version.id === draft.activeVersionId)?.content ?? draft.versions.at(-1)?.content ?? "",
        "",
        "浏览器开发模式未连接 Electron 主进程，已记录本轮调整要求，未模拟生成新草稿。",
        input.message,
      ].filter(Boolean).join("\n"),
      note: "浏览器开发模式未执行模型生成。",
      createdAt: now,
    };
    draft.versions = [...draft.versions, nextVersion];
    draft.activeVersionId = nextVersion.id;
    draft.updatedAt = now;
    draft.model = "blocked:browser-dev-runtime";
    draft.textProtocol = modelConfig.textProtocol;

    const nextEvents = [
      devRuntimeEvent({
        kind: "context",
        status: "completed",
        eventClass: "turn.submitted",
        owner: "runtime",
        sequence: events.length + 1,
        threadId: session.id,
        turnId,
        taskId,
        runId,
        phase: "submitted",
        title: "读取本轮追问",
        detail: input.message.slice(0, 160),
        payload: { adjustmentLength: input.message.length },
        createdAt: now,
      }),
      devRuntimeEvent({
        kind: "model",
        status: "blocked",
        eventClass: "model.failed",
        owner: "runtime",
        sequence: events.length + 2,
        threadId: session.id,
        turnId,
        taskId,
        runId,
        phase: "blocked",
        model: draft.model,
        title: "未执行文字模型",
        detail: "浏览器开发模式未连接 Electron 主进程，不能模拟模型生成成功。",
        payload: {
          protocol: modelConfig.textProtocol,
          model: draft.model,
          blockedReason: "browser-dev-bridge",
        },
        createdAt: now,
      }),
    ];
    const mergedEvents = [...events, ...nextEvents];
    session.status = "blocked";
    session.messages = [
      ...session.messages,
      {
        id: `browser-dev-message-user-${idSuffix}`,
        role: "user",
        kind: "adjustment",
        content: input.message,
        promptDraftId: draft.id,
        createdAt: now,
      },
      {
        id: `browser-dev-message-system-${idSuffix}`,
        role: "system",
        kind: "note",
        content: "浏览器开发模式未连接 Electron 主进程，未生成新的模型输出。",
        promptDraftId: draft.id,
        createdAt: now,
      },
    ];
    session.executionEvents = [
      ...mergedEvents,
      devSnapshotEvent({
        now,
        sequence: mergedEvents.length + 1,
        sessionId: session.id,
        turnId,
        taskId,
        runId,
        status: session.status,
        events: mergedEvents,
        messageCount: session.messages.length,
        draftIds: session.promptDraftIds,
      }),
    ];
    session.model = draft.model;
    session.textProtocol = draft.textProtocol;
    session.updatedAt = now;
    return { session, draft };
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
    listSceneCards: async () => devSceneCards,
    createSceneCardFromContent: async (input) => {
      const card = sceneCardFromContent(input);
      devSceneCards.unshift(card);
      return card;
    },
    listContentKnowledgeMaps: async () => devContentKnowledgeMaps,
    listContentKnowledgeMapBuildRuns: async () => devContentKnowledgeMapBuildRuns,
    buildContentKnowledgeMap: async (input) => {
      const record = contentKnowledgeMap(input);
      const run = contentKnowledgeMapBuildRun(record);
      devContentKnowledgeMaps.unshift(record);
      devContentKnowledgeMapBuildRuns.unshift(run);
      return record;
    },
    updateContentKnowledgeMap: async (input) => input,
    listContentDraftChanges: async () => devContentDraftChanges,
    createContentDraftChange: async (input) => {
      const map = input.contentKnowledgeMapId
        ? devContentKnowledgeMaps.find((item) => item.id === input.contentKnowledgeMapId)
        : devContentKnowledgeMaps[0];
      if (!map) return { status: "blocked" as const, issues: ["缺少内容知识地图。"] };
      const now = new Date().toISOString();
      const draftChange = {
        id: `browser-dev-change-${Date.now()}`,
        workspacePath: input.workspacePath,
        contentKnowledgeMapId: map.id,
        contentKnowledgeMapTitle: map.title,
        title: `${map.title} 变更包`,
        summary: `${map.sellingPoints.length} 个卖点 / ${map.painPoints.length} 个痛点 / ${map.scenarios.length} 个场景`,
        kind: "knowledge-map-updated" as const,
        affectedObjectIds: [map.id],
        syncStatus: "local-draft" as const,
        authorLabel: input.authorLabel || "浏览器开发",
        issues: [],
        createdAt: now,
        updatedAt: now,
      };
      devContentDraftChanges.unshift(draftChange);
      return { status: "created" as const, issues: [], draftChange, teamSync: map.teamSync };
    },
    submitContentDraftChange: async (input) => {
      const draftChange = devContentDraftChanges.find((item) => item.id === input.draftChangeId);
      if (!draftChange) return { status: "blocked" as const, issues: ["变更包不存在。"] };
      draftChange.syncStatus = "blocked";
      draftChange.issues = ["浏览器开发模式未连接 Bugu 团队内容工作区。"];
      draftChange.updatedAt = new Date().toISOString();
      return {
        status: "blocked" as const,
        issues: draftChange.issues,
        draftChange,
        teamSync: {
          backend: "bugu" as const,
          status: "blocked" as const,
          message: draftChange.issues[0],
        },
      };
    },
    exportContentDraftChange: async (input) => {
      const draftChange = devContentDraftChanges.find((item) => item.id === input.draftChangeId);
      if (!draftChange) return { status: "blocked" as const, issues: ["变更包不存在。"] };
      return {
        status: "exported" as const,
        issues: [],
        draftChange,
        packageDir: `${input.workspacePath}/.content-studio/exports/content-draft-changes/${draftChange.id}`,
        manifestPath: `${input.workspacePath}/.content-studio/exports/content-draft-changes/${draftChange.id}/manifest.json`,
        draftChangePath: `${input.workspacePath}/.content-studio/exports/content-draft-changes/${draftChange.id}/draft-change.json`,
        files: ["manifest.json", "draft-change.json", "import-guide.md"],
      };
    },
    importContentDraftChange: async (input) => {
      const now = new Date().toISOString();
      const draftChange = {
        id: `browser-dev-import-${Date.now()}`,
        workspacePath: input.workspacePath,
        contentKnowledgeMapId: "browser-dev-import-map",
        contentKnowledgeMapTitle: "导入内容知识地图",
        title: "导入变更包",
        summary: "浏览器开发模式导入的变更包。",
        kind: "knowledge-map-updated" as const,
        affectedObjectIds: ["browser-dev-import-map"],
        syncStatus: "local-draft" as const,
        authorLabel: input.authorLabel || "浏览器开发",
        issues: [],
        createdAt: now,
        updatedAt: now,
      };
      devContentDraftChanges.unshift(draftChange);
      return {
        status: "imported" as const,
        issues: [],
        draftChange,
        packageDir: input.packagePath,
        files: ["manifest.json", "draft-change.json"],
      };
    },
    listContentKnowledgeReleases: async () => devContentKnowledgeReleases,
    createContentKnowledgeRelease: async (input) => {
      const map = input.contentKnowledgeMapId
        ? devContentKnowledgeMaps.find((item) => item.id === input.contentKnowledgeMapId)
        : devContentKnowledgeMaps[0];
      if (!map) return { status: "blocked" as const, issues: ["缺少内容知识地图。"] };
      const now = new Date().toISOString();
      const release = {
        id: `browser-dev-release-${Date.now()}`,
        workspacePath: input.workspacePath,
        contentKnowledgeMapId: map.id,
        contentKnowledgeMapTitle: map.title,
        title: input.title || `${map.title} 团队知识包`,
        version: input.version || "v-browser-dev",
        status: "local-preview" as const,
        packageDir: `${input.workspacePath}/.content-studio/exports/agentknowledge/browser-dev`,
        knowledgePath: `${input.workspacePath}/.content-studio/exports/agentknowledge/browser-dev/KNOWLEDGE.md`,
        manifestPath: `${input.workspacePath}/.content-studio/exports/agentknowledge/browser-dev/manifest.json`,
        files: ["KNOWLEDGE.md", "ontology/ontology.json", "compiled/prompt-grounding.md"],
        issues: ["浏览器开发模式未连接 Bugu release API，当前只是本地预览。"],
        createdAt: now,
        updatedAt: now,
      };
      devContentKnowledgeReleases.unshift(release);
      return { status: "blocked" as const, issues: release.issues, release };
    },
    listBrandCommandCenters: async () => devBrandCommandCenters,
    buildBrandCommandCenter: async (input) => {
      const record = brandCommandCenter(input);
      devBrandCommandCenters.unshift(record);
      return record;
    },
    recordBrandCommandAction: async (input) => {
      const record = devBrandCommandCenters.find((item) => item.id === input.commandCenterId);
      if (!record) return brandCommandCenter({ workspacePath: input.workspacePath });
      const queueItem = record.queueItems.find((item) => item.id === input.queueItemId);
      if (!queueItem) return record;
      const now = new Date().toISOString();
      queueItem.updatedAt = now;
      if (queueItem.status === "ready") queueItem.status = "handed-off";
      record.actionRecords.unshift({
        id: `browser-dev-action-${Date.now()}`,
        queueItemId: queueItem.id,
        campaignCellId: queueItem.campaignCellId,
        actionType: queueItem.actionType,
        title: queueItem.title,
        outcome: queueItem.status === "handed-off" ? "handoff" : "needs-resource",
        actorLabel: input.actorLabel || "浏览器开发",
        actorRole: input.actorRole,
        inputSummary: queueItem.summary,
        outputSummary: input.note || "浏览器开发模式已记录动作。",
        createdAt: now,
      });
      record.updatedAt = now;
      return record;
    },
    refreshBrandCommandActions: async (input) => {
      const record = devBrandCommandCenters.find((item) => item.id === input.commandCenterId);
      return record || brandCommandCenter({ workspacePath: input.workspacePath });
    },
    exportContentKnowledgePack: async (input) => contentKnowledgePackExport(input),
    listContentReviewTasks: async () => devContentReviewTasks,
    generateContentReviewTasks: async (input) => {
      const generated = contentReviewTasks(input.workspacePath, input);
      const existing = new Set(devContentReviewTasks.map((task) => task.id));
      devContentReviewTasks.unshift(...generated.filter((task) => !existing.has(task.id)));
      return devContentReviewTasks;
    },
    submitContentReviewDecision: async (input) => {
      const task = devContentReviewTasks.find((item) => item.id === input.taskId);
      if (!task) {
        const fallback = contentReviewTasks(input.workspacePath)[0];
        if (!fallback) throw new Error("审核任务不存在。");
        devContentReviewTasks.unshift(fallback);
        return fallback;
      }
      const createdAt = new Date().toISOString();
      if (input.action === "rename-target" && input.payload?.title) {
        task.title = input.payload.title;
        task.summary = input.payload.summary || task.summary;
      }
      if (input.action === "merge-related" && input.payload?.mergeTargetIds?.length) {
        task.issueLabels = Array.from(new Set([...task.issueLabels, "已合并"]));
      }
      if (input.action === "split-target" && input.payload?.splitItems?.length) {
        task.title = input.payload.splitItems[0].title;
        task.summary = input.payload.splitItems[0].summary || task.summary;
        task.issueLabels = Array.from(new Set([...task.issueLabels, "已拆分"]));
      }
      task.status = reviewStatusForAction(input.action);
      task.decisions.unshift({
        id: `browser-dev-review-decision-${Date.now()}`,
        taskId: task.id,
        action: input.action,
        reviewerLabel: input.reviewerLabel || "浏览器开发",
        reason: input.reason || "浏览器开发模式审核记录。",
        payload: input.payload,
        beforeSnapshot: {},
        afterSnapshot: { status: task.status },
        createdAt,
      });
      task.updatedAt = createdAt;
      return task;
    },
    createContentProductionHandoff: async (input) => {
      const task = devContentReviewTasks.find((item) => item.id === input.reviewTaskId);
      const map = task?.sourceKnowledgeMapId
        ? devContentKnowledgeMaps.find((item) => item.id === task.sourceKnowledgeMapId)
        : devContentKnowledgeMaps[0];
      const rows = task?.targetType === "selling-point"
        ? map?.sellingPoints
        : task?.targetType === "pain-point"
        ? map?.painPoints
        : task?.targetType === "scenario"
        ? map?.scenarios
        : [];
      const row = rows?.find((item) => item.id === task?.targetId);
      if (!task || task.status !== "approved" || !map || !row) {
        return {
          status: "blocked" as const,
          issues: ["审核任务尚未通过或缺少对应矩阵组合。"],
        };
      }
      const scene = sceneCardFromContent({
        workspacePath: input.workspacePath,
        promptPackId: `content-knowledge-map:${map.id}`,
        contentKnowledgeMapId: map.id,
        contentKnowledgeMapTitle: map.title,
        coverageRowIds: [row.id],
        sourceRefs: row.sourceRefs,
        title: `${row.title} · 浏览器开发场景`,
        audience: "内容运营",
        painPoint: row.summary,
        usageScene: row.summary,
        visualComposition: "浏览器开发模式生成的场景卡。",
        sellingPoint: row.title,
        voiceoverDirection: "保持克制、可追溯。",
        imageMaterialSuggestion: "生成一张内容场景图。",
        videoMaterialSuggestion: "生成 15-30 秒短视频分镜。",
      });
      devSceneCards.unshift(scene);
      const draft = promptDraft({
        workspacePath: input.workspacePath,
        purpose: "article",
        userIntent: `提示词依据：${row.title}\n${row.summary}`,
        contentKnowledgeMapId: map.id,
        contentKnowledgeMapTitle: map.title,
        coverageRowIds: [row.id],
        sourceRefs: row.sourceRefs,
        sceneCardIds: [scene.id],
      });
      devPromptDrafts.unshift(draft);
      return {
        status: "created" as const,
        issues: [],
        grounding: {
          title: `${row.title} 提示词依据`,
          content: draft.versions[0]?.content ?? "",
          sourceKnowledgeMapId: map.id,
          sourceKnowledgeMapTitle: map.title,
          coverageRowIds: [row.id],
          sourceRefs: row.sourceRefs,
          evidenceRefs: row.evidenceRefs,
          constraints: map.constraints,
          readyEvidenceCount: row.evidenceRefs.length,
        },
        record: {
          id: `browser-dev-handoff-${Date.now()}`,
          workspacePath: input.workspacePath,
          reviewTaskId: task.id,
          target: input.target ?? "prompt-and-scene",
          status: "created" as const,
          batchId: `handoff:${map.id}:${row.id}`,
          issues: [],
          sourceKnowledgeMapId: map.id,
          sourceKnowledgeMapTitle: map.title,
          coverageRowIds: [row.id],
          sourceRefs: row.sourceRefs,
          evidenceRefs: row.evidenceRefs,
          promptDraftId: draft.id,
          sceneCardId: scene.id,
          actorLabel: input.actorLabel || "浏览器开发",
          syncStatus: "blocked" as const,
          teamSync: {
            backend: "bugu" as const,
            status: "blocked" as const,
            message: "浏览器开发模式未连接 Bugu 团队内容工作区。",
          },
          actionRecords: [{
            id: `browser-dev-handoff-action-${Date.now()}`,
            batchId: `handoff:${map.id}:${row.id}`,
            actionType: "create-prompt-draft" as const,
            outcome: "handoff" as const,
            title: row.title,
            inputSummary: `${map.title} / ${row.title} / ${row.evidenceRefs.length} 条证据`,
            outputSummary: `已生成 Prompt 草稿 ${draft.id} 和场景卡 ${scene.id}`,
            actorLabel: input.actorLabel || "浏览器开发",
            sourceKnowledgeMapId: map.id,
            coverageRowIds: [row.id],
            evidenceRefs: row.evidenceRefs,
            sourceRefs: row.sourceRefs,
            promptDraftId: draft.id,
            sceneCardId: scene.id,
            syncStatus: "blocked" as const,
            teamSync: {
              backend: "bugu" as const,
              status: "blocked" as const,
              message: "浏览器开发模式未连接 Bugu 团队内容工作区。",
            },
            checks: [{
              label: "审核结论",
              status: "passed" as const,
              message: "审核任务已通过。",
            }, {
              label: "证据",
              status: "passed" as const,
              message: `${row.evidenceRefs.length} 条证据可追溯。`,
            }],
            nextStep: "在 Prompt 工作台确认草稿，或在场景库继续拆成图片、视频和 SOP 任务。",
            createdAt: new Date().toISOString(),
          }],
          createdAt: new Date().toISOString(),
        },
        promptDraft: draft,
        sceneCard: scene,
      };
    },
    writeBackContentMaterialCoverage: async (input) => {
      const map = input.contentKnowledgeMapId
        ? devContentKnowledgeMaps.find((item) => item.id === input.contentKnowledgeMapId)
        : devContentKnowledgeMaps[0];
      const approvedAssets = devAssetReviews.filter((asset) => asset.status === "approved");
      if (!map || !approvedAssets.length) {
        return {
          status: "blocked" as const,
          issues: [map ? "浏览器开发模式没有已通过素材。" : "缺少内容知识地图。"],
          updatedRowCount: 0,
          reviewedAssetCount: devAssetReviews.length,
          approvedAssetCount: approvedAssets.length,
          updates: [],
        };
      }
      const updatedRows = [...map.sellingPoints, ...map.painPoints, ...map.scenarios].slice(0, 3);
      updatedRows.forEach((row) => {
        row.materialStatus = "approved";
        row.materialRefs = approvedAssets.map((asset) => asset.id);
        row.performanceTags = ["高复用"];
      });
      map.updatedAt = new Date().toISOString();
      return {
        status: "updated" as const,
        issues: [],
        contentKnowledgeMap: map,
        updatedRowCount: updatedRows.length,
        reviewedAssetCount: devAssetReviews.length,
        approvedAssetCount: approvedAssets.length,
        pendingSupplementTaskCount: updatedRows.length,
        pendingSupplementTasks: [],
        updates: updatedRows.map((row) => ({
          rowId: row.id,
          rowTitle: row.title,
          targetType: map.sellingPoints.some((item) => item.id === row.id)
            ? "selling-point" as const
            : map.painPoints.some((item) => item.id === row.id)
            ? "pain-point" as const
            : "scenario" as const,
          assetReviewIds: approvedAssets.map((asset) => asset.id),
          materialStatus: "approved" as const,
          performanceTags: ["高复用"],
        })),
      };
    },
    listInputSources: async () => devInputSources,
    removeInputSource: async (_workspacePath, sourceId) => {
      const index = devInputSources.findIndex((source) => source.id === sourceId);
      if (index < 0) return null;
      const [removed] = devInputSources.splice(index, 1);
      return removed ?? null;
    },
    listPromptDrafts: async () => devPromptDrafts,
    generatePromptDraft: async (input) => createDraft(input),
    createPromptDraftFromContent: async (input) => createDraft({
      workspacePath: input.workspacePath,
      purpose: input.purpose,
      userIntent: input.content,
      contentKnowledgeMapId: input.contentKnowledgeMapId,
      contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
      coverageRowIds: input.coverageRowIds,
      sourceRefs: input.sourceRefs,
    }),
    updatePromptDraft: async (input) => createDraft({ workspacePath: input.workspacePath, purpose: "image", userIntent: input.content }),
    recordPromptDraftCopy: async (input) => createDraft({ workspacePath: input.workspacePath, purpose: "image", userIntent: input.draftId }),
    listAgentPromptSessions: async () => devAgentPromptSessions,
    startAgentPromptSession: async (input) => createAgentResult(input),
    continueAgentPromptSession: async (input) => continueAgentResult(input),
    respondAgentPromptAction: async (input) => {
      const session = devAgentPromptSessions.find((item) => item.id === input.sessionId);
      if (!session) throw new Error(`对话不存在: ${input.sessionId}`);
      const events = session.executionEvents ?? [];
      const sourceEvent = events.find((event) => event.eventClass === "action.required" && event.actionId === input.actionId);
      if (!sourceEvent) throw new Error(`待处理动作不存在: ${input.actionId}`);
      const alreadyResolved = events.some((event) => (
        event.eventClass === "action.resolved" &&
        event.actionId === input.actionId &&
        event.payload?.resolvedFromEventId === sourceEvent.id
      ));
      if (alreadyResolved) return session;

      const now = new Date().toISOString();
      const sourcePermission = events.find((event) => event.eventClass === "permission.requested" && event.actionId === input.actionId);
      const resolvedPermissionEvent = devRuntimeEvent({
        id: `browser-dev-event-permission-resolved-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind: "permission",
        status: "completed",
        eventClass: "permission.resolved",
        owner: "runtime",
        sequence: events.length + 1,
        threadId: sourceEvent.threadId ?? session.id,
        turnId: sourceEvent.turnId,
        taskId: sourceEvent.taskId,
        runId: sourceEvent.runId,
        stepId: sourcePermission?.stepId ? `${sourcePermission.stepId}:resolved` : `permission:${input.actionId}:resolved`,
        actionId: input.actionId,
        phase: "completed",
        title: "人工处理已记录",
        detail: input.note || "用户已处理该待办动作。",
        refIds: sourceEvent.refIds,
        artifactRefs: sourceEvent.artifactRefs,
        evidenceRefs: sourceEvent.evidenceRefs,
        payload: {
          ...(sourcePermission?.payload ?? {}),
          permissionDecision: {
            decision: "allow",
            decisionSource: "human",
            decisionReason: input.decision,
            approvalActionId: input.actionId,
            scope: "turn",
          },
          responsePayload: input.payload ?? {},
          resolvedFromEventId: sourcePermission?.id ?? sourceEvent.id,
        },
        model: sourceEvent.model,
        createdAt: now,
      });
      const resolvedEvent = devRuntimeEvent({
        id: `browser-dev-event-resolved-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        kind: "action",
        status: "completed",
        eventClass: "action.resolved",
        owner: "runtime",
        sequence: events.length + 2,
        threadId: sourceEvent.threadId ?? session.id,
        turnId: sourceEvent.turnId,
        taskId: sourceEvent.taskId,
        runId: sourceEvent.runId,
        stepId: sourceEvent.stepId ? `${sourceEvent.stepId}:resolved` : `action:${input.actionId}:resolved`,
        actionId: input.actionId,
        phase: "completed",
        title: input.decision === "open-input-source"
          ? "已打开输入源登记"
          : input.decision === "open-model-settings"
          ? "已打开模型设置"
          : "已处理待办",
        detail: input.note || "用户已处理该待办动作。",
        refIds: sourceEvent.refIds,
        artifactRefs: sourceEvent.artifactRefs,
        evidenceRefs: sourceEvent.evidenceRefs,
        payload: {
          ...(sourceEvent.payload ?? {}),
          decision: input.decision,
          responsePayload: input.payload ?? {},
          resolvedFromEventId: sourceEvent.id,
        },
        model: sourceEvent.model,
        createdAt: now,
      });
      const mergedEvents = [...events, resolvedPermissionEvent, resolvedEvent];
      session.executionEvents = [
        ...mergedEvents,
        devSnapshotEvent({
          now,
          sequence: mergedEvents.length + 1,
          sessionId: session.id,
          turnId: sourceEvent.turnId,
          taskId: sourceEvent.taskId,
          runId: sourceEvent.runId,
          status: session.status,
          events: mergedEvents,
          messageCount: session.messages.length,
          draftIds: session.promptDraftIds,
        }),
      ];
      session.updatedAt = now;
      return session;
    },
    attachAgentPromptSessionInputSources: async (input) => {
      const session = devAgentPromptSessions.find((item) => item.id === input.sessionId);
      if (!session) throw new Error(`对话不存在: ${input.sessionId}`);
      const sourceIds = new Set(input.inputSourceIds);
      const currentIds = new Set(session.inputSourceIds);
      const sources = devInputSources.filter((source) => sourceIds.has(source.id) && !currentIds.has(source.id));
      if (!sources.length) return session;

      const now = new Date().toISOString();
      const events = session.executionEvents ?? [];
      const eventSuffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const refIds = sources.map((source) => source.id);
      const evidenceRefs = sources.map((source) => `input-source:${source.id}`);
      const turnId = `turn:source:${eventSuffix}`;
      const runId = `run:source:${eventSuffix}`;
      const taskId = `task:${session.id}:source-supplement`;
      const pendingSourceAction = events.find((event) => (
        event.eventClass === "action.required" &&
        event.payload?.actionKind === "add-input-source" &&
        !events.some((item) => item.eventClass === "action.resolved" && item.actionId === event.actionId)
      ));
      session.inputSourceIds = Array.from(new Set([...session.inputSourceIds, ...refIds]));
      session.sourceSnapshots = [
        ...session.sourceSnapshots.filter((snapshot) => !sourceIds.has(snapshot.sourceId)),
        ...devSourceSnapshots(sources),
      ];
      session.messages = [...session.messages, {
        id: `browser-dev-message-source-${eventSuffix}`,
        role: "system",
        kind: "note",
        content: [
          "已补充输入源：",
          ...sources.map((source, index) => `${index + 1}. ${source.title}`),
        ].join("\n"),
        createdAt: now,
      }];
      const nextEvents = [
        devRuntimeEvent({
          id: `browser-dev-event-context-source-${eventSuffix}`,
          kind: "source",
          status: "completed",
          eventClass: "context.resolved",
          owner: "runtime",
          sequence: events.length + 1,
          threadId: session.id,
          turnId,
          taskId,
          runId,
          phase: "preparing",
          title: "已补充输入源",
          detail: `${sources.length} 份资料已绑定到当前对话。`,
          refIds,
          evidenceRefs,
          payload: { sourceCount: sources.length, reason: input.reason ?? "input-source-supplement" },
          createdAt: now,
        }),
        devRuntimeEvent({
          id: `browser-dev-event-evidence-source-${eventSuffix}`,
          kind: "evidence",
          status: "completed",
          eventClass: "evidence.changed",
          owner: "evidence",
          sequence: events.length + 2,
          threadId: session.id,
          turnId,
          taskId,
          runId,
          phase: "preparing",
          title: "来源证据已更新",
          detail: sources.map((source) => source.title).join("、"),
          refIds,
          evidenceRefs,
          payload: { evidenceKind: "input-source", sourceCount: sources.length },
          createdAt: now,
        }),
        ...(pendingSourceAction?.actionId ? [
          devRuntimeEvent({
            id: `browser-dev-event-source-permission-resolved-${eventSuffix}`,
            kind: "permission",
            status: "completed",
            eventClass: "permission.resolved",
            owner: "runtime",
            sequence: events.length + 3,
            threadId: session.id,
            turnId,
            taskId,
            runId,
            actionId: pendingSourceAction.actionId,
            phase: "completed",
            title: "补充资料权限已完成",
            detail: `${sources.length} 份资料已绑定到当前对话。`,
            refIds,
            evidenceRefs,
            payload: {
              permissionDecision: {
                decision: "allow",
                decisionSource: "human",
                decisionReason: input.reason ?? "input-source-supplement",
                approvalActionId: pendingSourceAction.actionId,
                scope: "turn",
              },
              responsePayload: { inputSourceIds: refIds },
              resolvedFromEventId: pendingSourceAction.id,
            },
            createdAt: now,
          }),
          devRuntimeEvent({
            id: `browser-dev-event-source-action-resolved-${eventSuffix}`,
            kind: "action",
            status: "completed",
            eventClass: "action.resolved",
            owner: "runtime",
            sequence: events.length + 4,
            threadId: session.id,
            turnId,
            taskId,
            runId,
            actionId: pendingSourceAction.actionId,
            phase: "completed",
            title: "输入源已补充",
            detail: `${sources.length} 份资料已进入本轮证据链。`,
            refIds,
            evidenceRefs,
            payload: {
              ...(pendingSourceAction.payload ?? {}),
              decision: "open-input-source",
              responsePayload: { inputSourceIds: refIds },
              resolvedFromEventId: pendingSourceAction.id,
            },
            createdAt: now,
          }),
        ] : []),
      ];
      session.status = session.status === "waiting-user" ? "active" : session.status;
      const mergedEvents = [...events, ...nextEvents];
      session.executionEvents = [
        ...mergedEvents,
        devSnapshotEvent({
          now,
          sequence: mergedEvents.length + 1,
          sessionId: session.id,
          turnId,
          taskId,
          runId,
          status: session.status,
          events: mergedEvents,
          messageCount: session.messages.length,
          draftIds: session.promptDraftIds,
        }),
      ];
      session.updatedAt = now;
      return session;
    },
    listOverlayCards: async () => [],
    generateOverlayCards: async () => [],
    listAssetReviews: async () => devAssetReviews,
    reviewAsset: async () => {
      const review = createReviewRecord();
      devAssetReviews.unshift(review);
      return review;
    },
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

    registerInputSource: async (input) => {
      const source = inputSource(input.purpose, input.title || input.text || "浏览器开发输入源", input.sourcePath);
      devInputSources.unshift(source);
      return source;
    },
    importInputSourceFromFile: async (_workspacePath, purpose) => {
      const title = purpose === "reference" ? "browser-reference.png" : "browser-product.png";
      const source = inputSource(purpose, title, `/tmp/content-studio-browser-dev/${title}`);
      devInputSources.unshift(source);
      return source;
    },
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
    reverseReferencePrompt: async (input) => {
      const analysis = {
        composition: "竖版 4:5，三分法构图，产品位于右下三分一区域。",
        subjectLayout: "本方产品作为唯一主体，占画面 30%。",
        lighting: "早餐桌自然光，暖色调侧光，柔和阴影。",
        background: "木质桌面、咖啡杯和绿植营造生活场景。",
        camera: "45 度俯拍，浅景深，焦点在产品标签。",
        textArea: "左上角留白，适合放标题和卖点短句。",
        style: "小红书手机实拍感，真实自然，避免棚拍广告感。",
        platformFit: "适合小红书 4:5 种草图。",
        reusableElements: ["三分法构图", "自然光侧光", "生活道具", "左上留白"],
        replacementRules: ["替换为本方产品", "不复制竞品包装和 Logo", "卖点以产品资料为准"],
        generationControls: ["输出 3-4 条 Prompt", "画幅 4:5", "真实感优先"],
        risks: ["避免复制竞品可识别元素", "不编造功效承诺"],
        prompt: "竖版 4:5，小红书手机实拍风格，本方产品位于画面右下三分之一，早餐桌自然光暖色调，木质桌面搭配咖啡杯和绿植，左上角保留标题留白，浅景深，产品标签清晰可见，生活化真实质感。",
        negativePrompt: "竞品 Logo、过度饱和、棚拍感、广角畸变、文字水印、虚假功效承诺",
        qualityChecklist: ["产品清晰可辨", "构图平衡", "留白充足", "不出现竞品元素"],
      };
      const draft = promptDraft({
        workspacePath: input.workspacePath,
        purpose: "image",
        userIntent: [
          "任务：素材拆解生成图片 Prompt",
          "",
          input.userIntent,
          "",
          "图片 Prompt：",
          analysis.prompt,
          "",
          "负面约束：",
          analysis.negativePrompt,
        ].join("\n"),
      });
      devPromptDrafts.unshift(draft);
      return {
        logId: `browser-dev-reference-reverse-${Date.now()}`,
        analysis,
        promptDraft: draft,
      };
    },
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
