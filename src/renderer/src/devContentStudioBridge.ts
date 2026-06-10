import {
  APP_SERVER_AGENT_RUNTIME_BRIDGE_PROFILE,
  APP_SERVER_PROTOCOL_VERSION,
} from "../../shared/types";
import type {
  AgentPromptExecutionEvent,
  AgentPromptSession,
  AppSettingsView,
  AutoUpdateState,
  BuildContentBatchInput,
  BuguAuthState,
  BuildContentKnowledgeMapInput,
  ContentBatchRecord,
  ContentBatchStageId,
  ContentKnowledgeReleaseReference,
  ContentKnowledgeMapBuildRunRecord,
  ContentKnowledgeMapRecord,
  ContentReviewDecisionAction,
  ContentReviewTask,
  ContentStudioApi,
  ExportContentKnowledgePackInput,
  GeneratePromptDraftInput,
  ImageGenerationRequest,
  InputSourceKind,
  InputSourcePurpose,
  InputSourceSensitivity,
  RegisterInputSourceInput,
  MediaGenerationResult,
  ModelCatalogView,
  ModelConfigView,
  PlatformSettingsProjection,
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
  recentWorkspacePaths: [DEV_WORKSPACE_PATH],
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
  hasApiKey: false,
  safeStorageAvailable: false,
  textProvider: "http-text-generation",
  textProtocol: "openai-chat",
  textApiEndpoint: "",
  hasTextApiKey: false,
  textApiKeyStatus: "missing",
  textModel: "",
  textModels: [],
  imageProvider: "disabled",
  imageProtocol: "openai-responses",
  imageApiEndpoint: "",
  imageOuterModel: "",
  hasImageApiKey: false,
  imageApiKeyStatus: "missing",
  imageModels: [],
  videoProvider: "disabled",
  videoApiEndpoint: "",
  hasVideoApiKey: false,
  videoApiKeyStatus: "missing",
  videoModel: "",
  videoModels: [],
  updatedAt: new Date().toISOString(),
};

const modelCatalog: ModelCatalogView = {
  textModels: [],
  imageModels: [],
  videoModels: [],
  source: "offline-seed",
  updatedAt: new Date().toISOString(),
};

let devPlatformSettings: PlatformSettingsProjection = {
  version: "0",
  updatedAt: new Date(0).toISOString(),
  locale: "zh-CN",
  theme: "light",
  appearance: {
    colorTheme: "emerald",
    fontScale: 1,
    serifEnabled: false,
  },
  workspacePath: DEV_WORKSPACE_PATH,
  proxy: {
    enabled: false,
    url: "",
  },
  developerMode: false,
  general: {
    notificationsEnabled: true,
    reduceMotion: false,
    syncLocalAgentHistory: false,
    quickWindowShortcutEnabled: true,
    commandWhitelistEnabled: false,
    permissionMode: "auto-approve",
    thinkingMode: "auto",
    showToolCalls: true,
    expandToolCallsByDefault: false,
  },
};

const devInputSources: ContentStudioApi extends { listInputSources(workspacePath: string): Promise<infer T> } ? T : never = [];
const devPromptDrafts: PromptDraft[] = [];
const devAgentPromptSessions: AgentPromptSession[] = [];
const devSceneCards: SceneCard[] = [];
const devContentKnowledgeMaps: ContentKnowledgeMapRecord[] = [];
const devContentKnowledgeMapBuildRuns: ContentKnowledgeMapBuildRunRecord[] = [];
const devContentDraftChanges: Awaited<ReturnType<ContentStudioApi["listContentDraftChanges"]>> = [];
const devContentKnowledgeReleases: Awaited<ReturnType<ContentStudioApi["listContentKnowledgeReleases"]>> = [];
const devContentBatches: ContentBatchRecord[] = [];
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
  const content = input.versions?.[0]?.content ?? input.userIntent;
  return {
    id: `browser-dev-draft-${Date.now()}`,
    workspacePath: input.workspacePath,
    contentKnowledgeMapId: input.contentKnowledgeMapId,
    contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
    teamKnowledgeRelease: input.teamKnowledgeRelease,
    coverageRowIds: input.coverageRowIds,
    sourceRefs: input.sourceRefs,
    title: input.title || input.userIntent.slice(0, 24) || "浏览器开发 Prompt",
    purpose: input.purpose,
    status: "confirmed",
    userIntent: input.userIntent,
    inputSourceIds: [],
    sceneCardIds: input.sceneCardIds,
    versions: [
      {
        id: "browser-dev-version",
        version: 1,
        content,
        createdAt,
      },
    ],
    activeVersionId: "browser-dev-version",
    createdAt,
    updatedAt: createdAt,
  };
}

function inputSource(
  purpose: InputSourcePurpose,
  title: string,
  sourcePath?: string,
  sensitivity: InputSourceSensitivity = "internal",
) {
  const createdAt = new Date().toISOString();
  const kind = sourcePath ? "image" as const : "manual-note" as const;
  return {
    id: `browser-dev-source-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    workspacePath: DEV_WORKSPACE_PATH,
    kind,
    status: kind === "image" ? "blocked" as const : "converted" as const,
    purpose,
    sensitivity,
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

function inputSourceFromRegistration(input: RegisterInputSourceInput) {
  const createdAt = new Date().toISOString();
  const sourcePath = input.sourcePath?.trim() || undefined;
  const fallbackKind: InputSourceKind = sourcePath ? "image" : "manual-note";
  const kind = input.kind || fallbackKind;
  const text = input.text?.trim();
  const status: "converted" | "blocked" = text || kind === "manual-note" || kind === "sku-table" ? "converted" : "blocked";
  const title = (input.title || sourcePath || text || "浏览器开发输入源").trim();
  const tags = Array.from(new Set([...(input.tags ?? []), input.purpose, kind].map((tag) => tag.trim()).filter(Boolean)));
  return {
    id: `browser-dev-source-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    workspacePath: input.workspacePath || DEV_WORKSPACE_PATH,
    workflowRunId: input.workflowRunId,
    kind,
    status,
    purpose: input.purpose,
    sensitivity: input.sensitivity ?? "internal",
    title,
    sourcePath,
    sourceUrl: input.sourceUrl?.trim() || undefined,
    tags,
    summary: input.summary?.trim() || (sourcePath ? `已登记文件：${title}` : title),
    extractedText: text || undefined,
    artifactRefs: sourcePath ? [sourcePath] : [],
    relatedPromptDraftId: input.relatedPromptDraftId,
    relatedSceneCardIds: input.relatedSceneCardIds,
    blockedReason: text || kind === "manual-note" || kind === "sku-table" ? undefined : "浏览器开发模式已登记文件。",
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
      message: "浏览器开发模式未连接 Bugu 业务服务，当前仅为本机草稿。",
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
      summary: "用于预览审核后生成 Prompt 草稿。",
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

const DEV_BATCH_STAGES: ContentBatchStageId[] = [
  "selection",
  "intent",
  "modeling",
  "selling",
  "matrix",
  "manufacturing",
  "review",
  "optimization",
  "feedback",
];

function contentBatch(input: BuildContentBatchInput): ContentBatchRecord {
  const now = new Date().toISOString();
  const map = input.contentKnowledgeMapId
    ? devContentKnowledgeMaps.find((item) => item.id === input.contentKnowledgeMapId)
    : devContentKnowledgeMaps[0];
  const batchId = `browser-dev-batch-${Date.now()}`;
  const hasProductSource = devInputSources.some((source) => source.purpose === "product-brief" || source.kind === "sku-table");
  const hasFeedbackSource = devInputSources.some((source) => source.purpose === "user-feedback");
  const manufacturingDrafts = devPromptDrafts.filter((draft) => draft.purpose === "video" || draft.purpose === "image" || draft.purpose === "green-screen");
  const convertedCount = devInputSources.filter((source) => source.status === "converted").length;

  const gateFor = (stageId: ContentBatchStageId) => {
    if (stageId === "selection" && !hasProductSource) {
      return {
        status: "needs-input" as const,
        title: "缺商品资料",
        message: "浏览器开发模式还没有产品资料或 SKU 表。",
        recoveryAction: "去输入源登记产品 brief 或 SKU 表。",
      };
    }
    if (stageId === "intent" && !hasFeedbackSource) {
      return {
        status: "needs-input" as const,
        title: "缺流量意图",
        message: "还没有评论、客服问答或搜索词输入。",
        recoveryAction: "去输入源登记用户反馈。",
      };
    }
    if (stageId === "modeling" && !map) {
      return {
        status: "needs-input" as const,
        title: "缺内容知识地图",
        message: "先把输入源整理成卖点、痛点、场景和证据矩阵。",
        recoveryAction: "打开内容知识地图生成事实层。",
      };
    }
    if (stageId === "matrix" && !map && !manufacturingDrafts.length) {
      return {
        status: "needs-input" as const,
        title: "缺矩阵交接",
        message: "还没有把卖点、证据、场景和素材排成 Prompt、场景卡和补资源任务。",
        recoveryAction: "打开 agents 或场景库处理矩阵交接。",
      };
    }
    if (stageId === "manufacturing" && !manufacturingDrafts.length) {
      return {
        status: "needs-input" as const,
        title: "缺制造产物",
        message: "还没有图片候选、视频 Prompt、绿幕文案图或混剪素材。",
        recoveryAction: "打开制造工具生成可审核素材。",
      };
    }
    return {
      status: "passed" as const,
      title: "阶段门禁",
      message: "浏览器开发模式当前没有阻断项。",
    };
  };

  const currentStageId: ContentBatchStageId = !hasProductSource
    ? "selection"
    : !hasFeedbackSource
      ? "intent"
      : !map
        ? "modeling"
        : "manufacturing";

  return {
    id: batchId,
    workspacePath: input.workspacePath,
    title: input.title || map?.title?.replace(/内容知识地图$/g, "制造批次") || "浏览器开发制造批次",
    objective: input.objective || "把当前输入源、知识地图、Prompt 草稿、工作流和素材审核记录组织成九阶段内容制造批次。",
    ownerIds: [],
    status: "active",
    currentStageId,
    sourceKnowledgeMapId: map?.id,
    sourceKnowledgeMapTitle: map?.title,
    intakeSummary: {
      inputSourceCount: devInputSources.length,
      convertedCount,
      blockedCount: devInputSources.filter((source) => source.status === "blocked").length,
      coveragePercent: devInputSources.length ? Math.round((convertedCount / devInputSources.length) * 100) : 0,
      missingInputs: [],
    },
    stageRuns: DEV_BATCH_STAGES.map((stageId, index) => {
      const gate = gateFor(stageId);
      const isCurrent = stageId === currentStageId;
      const stageIndex = DEV_BATCH_STAGES.indexOf(currentStageId);
      const targetModule = stageId === "manufacturing"
        ? "video-prompt"
          : stageId === "modeling"
            ? "knowledge-map"
            : stageId === "matrix"
              ? "agents"
              : "knowledge-inputs";
      const recoveryTasks = gate.status === "passed" ? [] : [{
        id: `${batchId}:${stageId}:recovery`,
        stageId,
        status: "open" as const,
        title: gate.title,
        message: gate.message,
        recoveryAction: gate.recoveryAction || "处理阶段缺口。",
        targetModule,
        ownerLabel: "运营确认",
        createdAt: now,
      }];
      return {
        id: `${batchId}:${stageId}`,
        batchId,
        stageId,
        status: gate.status !== "passed" ? "needs-human" : index < stageIndex ? "approved" : isCurrent ? "ready" : "draft",
        inputRefs: devInputSources.slice(0, 3).map((source) => ({
          kind: "input-source",
          id: source.id,
          summary: `${source.title} · ${source.status === "converted" ? "已解析" : "待处理"}`,
          path: source.sourcePath,
          targetModule: "knowledge-inputs",
        })),
        outputRefs: [
          ...(map && (stageId === "modeling" || stageId === "selling") ? [{
            kind: "content-knowledge-map",
            id: map.id,
            summary: `${map.title} · ${map.coverage.readyPercent}% 就绪`,
            targetModule: "knowledge-map",
          }] : []),
          ...(map && stageId === "matrix" ? [{
            kind: "matrix-handoff",
            id: `${map.id}:matrix`,
            summary: `${map.title} · ${map.sellingPoints.length + map.painPoints.length + map.scenarios.length} 个事实行可交接`,
            targetModule: "agents",
          }] : []),
          ...(stageId === "manufacturing" ? manufacturingDrafts.slice(0, 6).map((draft) => ({
            kind: "prompt-draft",
            id: draft.id,
            summary: `${draft.title} · ${draft.status}`,
            targetModule: draft.purpose === "video" ? "video-prompt" : draft.purpose === "green-screen" ? "image-green-screen" : "agents",
          })) : []),
        ],
        gateResults: [{
          id: `${batchId}:${stageId}:gate`,
          stageId,
          status: gate.status,
          title: gate.title,
          message: gate.message,
          recoveryAction: gate.recoveryAction,
        }],
        recoveryTasks,
        agentRunRefs: stageId === "manufacturing" ? manufacturingDrafts.slice(0, 3).map((draft) => ({
          kind: "prompt-draft",
          id: draft.id,
          summary: `${draft.title} · ${draft.status}`,
          targetModule: draft.purpose === "video" ? "video-prompt" : draft.purpose === "green-screen" ? "image-green-screen" : "agents",
        })) : [],
        updatedAt: now,
      };
    }),
    createdAt: now,
    updatedAt: now,
  };
}

const DEV_CONTENT_KNOWLEDGE_PACK_FILES = [
  "KNOWLEDGE.md",
  "manifest.json",
  "ontology/ontology.json",
  "ontology/concepts.json",
  "ontology/relations.json",
  "ontology/coverage.json",
  "answers/questions.json",
  "assets/material-coverage.json",
  "interop/ontology.jsonld",
  "interop/ontology.ttl",
  "interop/ontology.rdf",
  "compiled/prompt-grounding.md",
];

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
    files: DEV_CONTENT_KNOWLEDGE_PACK_FILES,
    issues: [],
  };
}

function contentKnowledgePackFile(relativePath: string) {
  if (relativePath === "KNOWLEDGE.md") {
    return [
      "---",
      "type: content-ontology",
      "metadata:",
      "  primaryOntology: ontology/ontology.json",
      "  primaryAnswers: answers/questions.json",
      "---",
      "",
      "# 浏览器开发内容知识包",
      "",
      "本知识包用于浏览器开发模式预览，真实桌面端会读取工作区生成的本机预览文件。",
      "",
    ].join("\n");
  }
  if (relativePath === "compiled/prompt-grounding.md") {
    return [
      "# 浏览器开发提示词依据",
      "",
      "## 可用卖点",
      "- 轻量便携：用于通勤和随身场景。",
      "",
      "## 规则和禁用边界",
      "- 不使用未审核的绝对化表达。",
      "",
    ].join("\n");
  }
  if (relativePath.endsWith(".json") || relativePath.endsWith(".jsonld")) {
    return `${JSON.stringify({ file: relativePath, source: "browser-dev", status: "preview" }, null, 2)}\n`;
  }
  return `# ${relativePath}\n\n浏览器开发模式文件预览。`;
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
      teamKnowledgeRelease: input.teamKnowledgeRelease,
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
      teamKnowledgeRelease: input.teamKnowledgeRelease,
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
  const createReviewRecord = (input?: Parameters<ContentStudioApi["reviewAsset"]>[0]) => {
    const createdAt = new Date().toISOString();
    return {
      id: `browser-dev-review-${Date.now()}`,
      workspacePath: input?.workspacePath ?? DEV_WORKSPACE_PATH,
      workflowRunId: input?.workflowRunId,
      assetKey: input?.assetKey ?? "browser-dev-asset",
      kind: input?.kind ?? "image" as const,
      sourceType: input?.sourceType ?? "manual" as const,
      sourceId: input?.sourceId,
      path: input?.path ?? "",
      title: input?.title ?? "浏览器开发素材",
      status: input?.status ?? "approved" as const,
      note: input?.note,
      tags: input?.tags ?? [],
      reviewedAt: input?.status && input.status !== "pending" ? createdAt : undefined,
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
    getPlatformSettings: async () => devPlatformSettings,
    savePlatformSettings: async (input: PlatformSettingsProjection) => {
      devPlatformSettings = {
        ...input,
        version: String(Number(input.version || "0") + 1),
        updatedAt: new Date().toISOString(),
      };
      return devPlatformSettings;
    },
    getPlatformHostStatus: async () => ({
      available: false,
      mode: "standalone",
      error: "浏览器开发模式未连接平台设置中心。",
    }),
    openPlatformModelSettings: async () => ({
      ok: false,
      target: "model-settings",
      message: "浏览器开发模式未连接 lime-desktop-platform。",
    }),

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
        files: DEV_CONTENT_KNOWLEDGE_PACK_FILES,
        issues: ["浏览器开发模式未连接 Bugu release API，当前只是本地预览。"],
        createdAt: now,
        updatedAt: now,
      };
      devContentKnowledgeReleases.unshift(release);
      return { status: "blocked" as const, issues: release.issues, release };
    },
    listContentBatches: async (workspacePath) => {
      if (devContentBatches.length) return devContentBatches;
      const record = contentBatch({ workspacePath });
      devContentBatches.splice(0, devContentBatches.length, record);
      return devContentBatches;
    },
    buildContentBatch: async (input) => {
      const record = contentBatch(input);
      devContentBatches.splice(0, devContentBatches.length, record, ...devContentBatches.filter((item) => item.id !== record.id));
      return record;
    },
    advanceContentBatchStage: async (input) => {
      const record = devContentBatches.find((item) => item.id === input.batchId) ?? contentBatch({ workspacePath: input.workspacePath });
      const currentIndex = DEV_BATCH_STAGES.indexOf(record.currentStageId);
      const nextStageId = input.stageId ?? DEV_BATCH_STAGES[Math.min(currentIndex + 1, DEV_BATCH_STAGES.length - 1)];
      const updated = {
        ...record,
        currentStageId: nextStageId,
        updatedAt: new Date().toISOString(),
        stageRuns: record.stageRuns.map((stage, index) => ({
          ...stage,
          status: stage.stageId === nextStageId
            ? "ready" as const
            : index < DEV_BATCH_STAGES.indexOf(nextStageId)
              ? "approved" as const
              : stage.status,
          updatedAt: new Date().toISOString(),
        })),
      };
      devContentBatches.splice(0, devContentBatches.length, updated, ...devContentBatches.filter((item) => item.id !== updated.id));
      return updated;
    },
    exportContentKnowledgePack: async (input) => contentKnowledgePackExport(input),
    readContentKnowledgePackFile: async (input) => ({
      status: "loaded",
      relativePath: input.relativePath,
      content: contentKnowledgePackFile(input.relativePath),
      size: contentKnowledgePackFile(input.relativePath).length,
      truncated: false,
      issues: [],
    }),
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
            nextStep: "在 agents 确认草稿，或在场景库继续拆成图片、视频和生产任务。",
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
      userIntent: input.userIntent,
      title: input.title,
      contentKnowledgeMapId: input.contentKnowledgeMapId,
      contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
      teamKnowledgeRelease: input.teamKnowledgeRelease,
      coverageRowIds: input.coverageRowIds,
      sourceRefs: input.sourceRefs,
      inputSourceIds: input.inputSourceIds,
      sceneCardIds: input.sceneCardIds,
      status: input.status,
      model: input.model,
      versions: [{
        id: "browser-dev-version",
        version: 1,
        content: input.content,
        note: input.note,
        createdAt: new Date().toISOString(),
      }],
    }),
    createTeamKnowledgePromptDraft: async (input) => {
      const map = input.contentKnowledgeMapId
        ? devContentKnowledgeMaps.find((item) => item.id === input.contentKnowledgeMapId)
        : devContentKnowledgeMaps[0];
      const release = input.contentKnowledgeReleaseId
        ? devContentKnowledgeReleases.find((item) => item.id === input.contentKnowledgeReleaseId || item.serverReleaseId === input.contentKnowledgeReleaseId)
        : devContentKnowledgeReleases.find((item) => item.status === "published" && (!map || item.contentKnowledgeMapId === map.id));
      const readyRows = map ? [...map.sellingPoints, ...map.painPoints, ...map.scenarios].filter((row) => row.status === "ready").slice(0, 12) : [];
      if (!map) throw new Error("请先生成内容知识地图。");
      if (!release || release.status !== "published") throw new Error("请先发布当前内容知识地图的团队知识包版本，再生成 Prompt 草稿。");
      if (!readyRows.length) throw new Error("当前没有可复用组合，请先完成审核或补证据。");
      return createDraft({
        workspacePath: input.workspacePath,
        purpose: "image",
        userIntent: [
          `# ${map.title} / Prompt 草稿交接`,
          "",
          `团队知识包：${release.title} ${release.version}`,
          "",
          "## 使用边界",
          "- 这份草稿只能作为团队口径和 Prompt 依据，不能把知识包标题、版本号或文件地址当成产品事实。",
          "",
          "## 可复用卖点",
          ...readyRows.map((row, index) => `${index + 1}. ${row.title}：${row.summary}`),
          "",
          "## 禁用边界",
          ...(map.constraints.length ? map.constraints.map((item) => `- ${item}`) : ["- 暂无规则边界，请先补充品牌禁用表达和平台规则。"]),
          "",
          "## 下游 Prompt 要求",
          "- 如果进入短视频生产，必须补充节奏、语气、情绪、背景音乐、说话速度、镜头动作、字幕和素材缺口。",
        ].join("\n"),
        contentKnowledgeMapId: map.id,
        contentKnowledgeMapTitle: map.title,
        teamKnowledgeRelease: {
          id: release.serverReleaseId || release.id,
          title: release.title,
          version: release.version,
          contentKnowledgeMapId: release.contentKnowledgeMapId,
          contentKnowledgeMapTitle: release.contentKnowledgeMapTitle,
          packageObjectKey: release.packageObjectKey,
          packagePublicUrl: release.packagePublicUrl,
          packageUploadStatus: release.packageUploadStatus,
          approvalStatus: release.approvalStatus,
        },
        coverageRowIds: readyRows.map((row) => row.id),
        sourceRefs: Array.from(new Set([
          `content-knowledge-map:${map.id}`,
          `content-knowledge-release:${release.serverReleaseId || release.id}`,
          ...readyRows.flatMap((row) => row.sourceRefs),
        ])),
      });
    },
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
    reviewAsset: async (input) => {
      const review = createReviewRecord(input);
      devAssetReviews.unshift(review);
      return review;
    },
    listMixPackages: async () => [],
    exportMixPackage: async () => createMixPackageRecord(),
    recordMixPackageImportEvidence: async () => createMixPackageRecord(),
    listPlatformDrafts: async () => [],
    listGenerationLogs: async () => [],

    registerInputSource: async (input) => {
      const source = inputSourceFromRegistration(input);
      devInputSources.unshift(source);
      return source;
    },
    importInputSourceFromFile: async (_workspacePath, purpose, options) => {
      const title = purpose === "reference" ? "browser-reference.png" : "browser-product.png";
      const source = inputSource(purpose, title, `/tmp/content-studio-browser-dev/${title}`, options?.sensitivity);
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
      summary: "浏览器开发模式示例拆解：展示爆款结构字段，不代表真实视频分析结果。",
      dimensions: ["开头钩子", "卖点逻辑", "画面构图", "节奏密度", "转化设计"],
      contentTitle: "痛点提问 · 居家清洁演示",
      platform: "browser-dev",
      durationSec: 18,
      transcript: "台面油污总是擦不干净？先看这一步，喷上之后等一会儿，轻轻一擦就干净。",
      transcriptSegments: [
        { startSec: 0, endSec: 4, text: "台面油污总是擦不干净？" },
        { startSec: 4, endSec: 11, text: "先看这一步，喷上之后等一会儿。" },
        { startSec: 11, endSec: 18, text: "轻轻一擦就干净。" },
      ],
      scenes: [
        {
          timestampSec: 0,
          startSec: 0,
          endSec: 4,
          shotType: "close_up",
          scene: "厨房台面",
          cameraMovement: "固定机位",
          description: "厨房台面油污特写，画面先给问题。",
          objects: ["台面", "油污"],
          voiceover: "台面油污总是擦不干净？",
        },
      ],
      hook: {
        hookType: { value: "pain_point_question", confidence: 0.78, reasoning: "开头直接提问并展示油污特写。" },
        elements: [
          { name: "痛点提问", description: "用清洁难题打断滑动。", timestampRange: "00:00-00:04" },
          { name: "效果期待", description: "快速转入可见演示。", timestampRange: "00:04-00:11" },
        ],
        emotionCurve: [
          { timestampSec: 0, emotion: "anxiety", intensity: 65 },
          { timestampSec: 11, emotion: "trust", intensity: 72 },
        ],
      },
      narrative: {
        framework: { value: "PSP", confidence: 0.74, reasoning: "问题、方案、证明三段清晰。" },
        stages: [
          { name: "问题", description: "台面油污难清理。", timeRange: "00:00-00:04", emotionShift: "焦虑" },
          { name: "方案", description: "展示喷涂和等待。", timeRange: "00:04-00:11", emotionShift: "好奇" },
          { name: "证明", description: "轻擦后的结果展示。", timeRange: "00:11-00:18", emotionShift: "信任" },
        ],
      },
      pacing: {
        avgCutsPerSecond: 0.33,
        avgShotDurationSec: 3.0,
        wordsPerMinute: 170,
        rhythm: [
          { timeRange: "00:00-00:04", shotType: "close_up", intensity: 7, description: "油污特写 + 痛点提问", voiceover: "台面油污总是擦不干净？", scene: "厨房台面" },
          { timeRange: "00:04-00:11", shotType: "product_demo", intensity: 6, description: "喷涂演示", voiceover: "先看这一步，喷上之后等一会儿。" },
          { timeRange: "00:11-00:18", shotType: "comparison", intensity: 8, description: "前后对比", voiceover: "轻轻一擦就干净。" },
        ],
      },
      timeline: [
        { timestampSec: 0, label: "问题出现", emotionLabel: "anxiety", intensity: 7 },
        { timestampSec: 11, label: "效果证明", emotionLabel: "trust", intensity: 8 },
      ],
      viralScores: {
        hookStrength: { score: 7.5, reasoning: "痛点明确但信息密度偏常规。" },
        narrativeTension: { score: 7.0, reasoning: "PSP 清楚，反转较弱。" },
        pacingQuality: { score: 7.2, reasoning: "切镜紧凑。" },
        emotionDesign: { score: 6.8, reasoning: "从焦虑到信任。" },
        ctaEffectiveness: { score: 6.0, reasoning: "未展示明确 CTA。" },
      },
      resourceFramework: {
        characters: [],
        scenes: [{ name: "厨房台面", shotCount: 3, environment: "居家厨房台面", lighting: "自然光", sceneImagePrompt: "A realistic home kitchen countertop with natural window light, clean white surface, photorealistic" }],
      },
      overallConfidence: 0.72,
      confidenceRate: 0.72,
      richnessRate: 0.75,
      referenceScore: 7.0,
      segments: [
        {
          timeRange: "00:00-00:04",
          hook: "痛点提问",
          visual: "油污特写",
          voiceover: "台面油污总是擦不干净？",
          subtitle: "油污总擦不干净？",
          rhythm: "快节奏开头",
          reusablePoint: "开头直接抛痛点，并用真实场景画面承接。",
          shotType: "close_up",
          scene: "厨房台面",
          intensity: 7,
        },
      ],
      reusableFormula: ["痛点提问 -> 产品演示 -> 效果证明"],
      risks: [{ level: "warning", message: "浏览器开发模式不是视频真实分析结果；Electron 中需配置真实视频理解服务。" }],
      warnings: ["dev mock only"],
    }),
    generateVideoScript: async () => ({
      logId: "browser-dev-video-script",
      title: "居家清洁演示脚本",
      script: "镜头 1：先给台面油污特写，用痛点提问进入。\n镜头 2：展示本方产品喷涂动作。\n镜头 3：用前后对比承接效果证明。",
      videoPrompt: "30岁中国女性在明亮厨房中指向台面油污，中景固定机位，自然窗光，写实手机实拍风格。\n产品喷涂到厨房台面油污处，俯拍特写，泡沫覆盖污渍，写实电影质感。\n清洁前后分屏对比，固定机位，画面干净明亮，真实居家短视频风格。",
      resourceFramework: {
        characters: [{ name: "居家达人", shotCount: 2, voiceTraits: "亲切中速", threeViewPrompt: "photorealistic Chinese woman, casual home outfit, front side back view" }],
        scenes: [{ name: "明亮厨房", shotCount: 3, environment: "白色台面和自然窗光的居家厨房", lighting: "柔和自然光", sceneImagePrompt: "Bright modern kitchen with white countertop, natural window light, realistic home cleaning video background, photorealistic" }],
      },
      storyboard: [
        {
          shot: 1,
          duration: "00:00-00:04",
          timeRange: "00:00-00:04",
          shotType: "close_up",
          character: "居家达人",
          characterAction: "手指向台面油污",
          scene: "明亮厨房",
          cameraMovement: "固定机位",
          visual: "台面油污特写，居家达人手指油污位置。",
          voiceover: "台面油污总是擦不干净？",
          subtitle: "油污总擦不干净？",
          rhythm: "快节奏痛点开场",
          imagePrompt: "Close-up shot of kitchen countertop oil stains, a woman's finger pointing at the stain, natural window light, photorealistic.",
          videoPrompt: "30岁中国女性在明亮厨房中指向台面油污，特写固定机位，自然窗光，写实手机实拍风格。",
          transitionHint: "cut",
          voiceStyle: "疑问中速",
        },
      ],
      publishCheck: [],
    }),
    evaluateVideoScript: async (input) => ({
      logId: "browser-dev-video-script-evaluation",
      sourceScriptLogId: input.sourceScriptLogId,
      scores: {
        hookScore: { score: 7.2, reasoning: "首镜头直接抛出油污痛点，有停留理由。" },
        structureScore: { score: 7.0, reasoning: "脚本按痛点、演示、证明推进，结构完整。" },
        sellingPointScore: { score: 6.8, reasoning: "卖点能进入演示，但缺少成分或证据补强。" },
        voiceoverScore: { score: 7.4, reasoning: "口播较口语化，适合短视频带货语境。" },
        pacingScore: { score: 7.0, reasoning: "三镜头节奏紧凑，结尾 CTA 可再明确。" },
        totalScore: 7.1,
      },
      suggestions: ["补一个证据镜头", "结尾 CTA 更明确", "避免绝对化效果"],
    }),
    rewriteVideoScriptShot: async (input) => {
      const currentShot = input.script.storyboard[input.rowIndex];
      return {
        logId: "browser-dev-video-shot-rewrite",
        sourceScriptLogId: input.sourceScriptLogId,
        rowIndex: input.rowIndex,
        shot: {
          ...currentShot,
          visual: `${currentShot.visual} 加入更清楚的前后对比构图。`,
          voiceover: `${currentShot.voiceover} 这一步重点看油污变化。`,
          subtitle: currentShot.subtitle || "看油污变化",
          videoPrompt: `${currentShot.videoPrompt || currentShot.visual}，强化前后对比，真实手机短视频质感。`,
        },
        reasoning: "浏览器开发模式：保留镜头功能并增强对比。",
        publishCheck: [{ level: "warning", message: "开发模式结果需要在 Electron 中用真实模型复核。" }],
      };
    },
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
    getAppServerHealth: async () => ({
      available: false,
      protocolVersion: APP_SERVER_PROTOCOL_VERSION,
      source: "missing",
      bridgeProfile: APP_SERVER_AGENT_RUNTIME_BRIDGE_PROFILE,
      message: "浏览器开发模式不启动 App Server sidecar。",
    }),
    runAppServerSmoke: async () => ({
      ok: false,
      protocolVersion: APP_SERVER_PROTOCOL_VERSION,
      source: "missing",
      bridgeProfile: APP_SERVER_AGENT_RUNTIME_BRIDGE_PROFILE,
      error: "浏览器开发模式不启动 App Server sidecar。",
    }),
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
