import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { PlatformRuntimeModelMenu } from "@limecloud/desktop-platform-react";
import type { PlatformModelSelection, PlatformModelSettingsProjection } from "@limecloud/desktop-platform-react";
import type {
  AgentPromptExecutionEvent,
  AgentPromptMessage,
  AgentPromptSession,
  LoadedSkill,
  MediaGenerationResult,
  PromptDraftPurpose,
  SkillRef,
} from "../../../../shared/types";
import { AgentUiProjectionSurface } from "../agent/AgentUiProjectionSurface";
import { projectAgentRuntimeReadModel, type AgentRuntimeEventProjection } from "../agent/agentRuntimeProjection";
import type { ShowcaseImageHandoff } from "../modules/ImageShowcaseModule";

interface AgentsWorkbenchProps {
  busy: boolean;
  workspaceReady: boolean;
  workspacePath?: string;
  recentWorkspacePaths: string[];
  productImageRefs: string[];
  referenceImageRefs: string[];
  textModel?: string;
  textProviderId?: string;
  modelSettings?: PlatformModelSettingsProjection | null;
  skills: LoadedSkill[];
  enabledSkillKeys: Set<string>;
  mediaResult: MediaGenerationResult | null;
  agentPromptSessions: AgentPromptSession[];
  activeSessionId?: string;
  onSelectWorkspacePath: (workspacePath: string) => void | Promise<void>;
  onChooseWorkspace: () => void | Promise<void>;
  onClearWorkspace: () => void | Promise<void>;
  onSelectProductImages: () => void;
  onSelectReferenceImages: () => void;
  onSelectAgentSession: (sessionId: string) => void;
  onSelectTextModel: (selection: PlatformModelSelection) => void;
  onStartAgentSession: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    productImageRefs?: string[];
    referenceImageRefs?: string[];
    textModel?: string;
    selectedSkills?: SkillRef[];
    selectedSkillSlugs?: string[];
  }) => AgentPromptSession | void | undefined | Promise<AgentPromptSession | void | undefined>;
  onContinueAgentSession: (input: { sessionId: string; message: string; textModel?: string }) => void | Promise<void>;
  onUsePromptInImage: (input: ShowcaseImageHandoff) => void;
  onGenerateImage: (input: ShowcaseImageHandoff) => void;
  onOpenImageProduction: () => void;
  onOpenImageShowcase: () => void;
  onOpenMaterialBreakdown: () => void;
  onOpenScenePrompts: () => void;
  onOpenVideoPrompt: () => void;
  onOpenArticle: () => void;
  onOpenArticleTitle: () => void;
  onOpenArticleScript: () => void;
  onOpenGreenScreen: () => void;
  onOpenAssets: () => void;
  onOpenSkills: () => void;
  onOpenModelSettings: () => void;
  onResolveAgentAction?: (event: AgentPromptExecutionEvent) => void;
}

type QuickIntentId =
  | "guide"
  | "breakdown"
  | "scenePrompt"
  | "imageGenerate"
  | "videoPrompt"
  | "article"
  | "articleTitle"
  | "articleScript"
  | "greenScreen"
  | "assets";

interface QuickIntent {
  id: QuickIntentId;
  label: string;
  icon: IconName;
  placeholder: string;
}

interface CopywritingTask {
  intentId: Extract<QuickIntentId, "article" | "articleTitle" | "articleScript">;
  title: string;
  object: string;
  output: string;
  requiredSkillSlugs: string[];
}

type ActiveMenu = "add" | "access" | "project" | null;
type WorkbenchView = "entry" | "thread";
type ThreadToolbarMenu = "workspace" | "task" | null;
type ThreadViewMode = "focus" | "artifact" | "sources";

type IconName =
  | "add"
  | "arrowUp"
  | "archive"
  | "book"
  | "bot"
  | "chat"
  | "chevronDown"
  | "compass"
  | "doc"
  | "file"
  | "folder"
  | "grid"
  | "image"
  | "layoutArtifact"
  | "layoutFocus"
  | "layoutSources"
  | "more"
  | "panel"
  | "search"
  | "settings"
  | "spark"
  | "trend"
  | "video";

const QUICK_INTENTS: QuickIntent[] = [
  {
    id: "guide",
    label: "引导帮助",
    icon: "bot",
    placeholder: "说明要检查的产品、平台、资料缺口和交付物",
  },
  {
    id: "breakdown",
    label: "拆解素材",
    icon: "trend",
    placeholder: "说明要拆解的产品图、参考图和关注重点",
  },
  {
    id: "scenePrompt",
    label: "场景提示词",
    icon: "compass",
    placeholder: "说明目标人群、场景方向和需要输出的 Prompt 数量",
  },
  {
    id: "imageGenerate",
    label: "图片生成",
    icon: "image",
    placeholder: "说明图片候选的画面、风格、比例和负面约束",
  },
  {
    id: "videoPrompt",
    label: "视频 Prompt",
    icon: "video",
    placeholder: "说明视频时长、分镜节奏、镜头运动和交付格式",
  },
  {
    id: "article",
    label: "文章生成",
    icon: "doc",
    placeholder: "说明文章平台、口吻、卖点和素材追溯要求",
  },
  {
    id: "articleTitle",
    label: "标题生成",
    icon: "chat",
    placeholder: "说明平台、内容对象、标题角度和禁用表达",
  },
  {
    id: "articleScript",
    label: "脚本生成",
    icon: "video",
    placeholder: "说明脚本类型、时长、受众、镜头结构和交付去向",
  },
  {
    id: "greenScreen",
    label: "绿幕文案图",
    icon: "panel",
    placeholder: "说明短句方向、留白区域和图片 Prompt 要求",
  },
  {
    id: "assets",
    label: "素材入库",
    icon: "archive",
    placeholder: "说明要入库的素材、来源、状态和下游复用方式",
  },
];

const ENTRY_INTENT_IDS: QuickIntentId[] = [
  "guide",
  "imageGenerate",
  "videoPrompt",
  "article",
  "articleTitle",
  "articleScript",
  "assets",
];

const ACCESS_OPTIONS = [
  {
    id: "ask",
    label: "请求批准",
    detail: "执行交付或读取新资料前先确认",
  },
  {
    id: "auto",
    label: "替我审批",
    detail: "仅处理当前工作区内的安全动作",
  },
  {
    id: "full",
    label: "完全访问权限",
    detail: "可读取本任务所需的工作区素材",
  },
  {
    id: "custom",
    label: "自定义",
    detail: "后续由平台统一配置权限范围",
  },
] as const;

const COPYWRITING_TASKS: CopywritingTask[] = [
  {
    intentId: "article",
    title: "文章生成",
    object: "知识库 / 素材 / 选题",
    output: "平台正文草稿",
    requiredSkillSlugs: ["copywriting-master", "article-typesetting-master"],
  },
  {
    intentId: "articleTitle",
    title: "标题生成",
    object: "文章 / 脚本 / 素材",
    output: "标题矩阵",
    requiredSkillSlugs: ["copywriting-master", "moments-copywriter"],
  },
  {
    intentId: "articleScript",
    title: "脚本生成",
    object: "卖点 / IP 知识 / 视频任务",
    output: "口播 / 分镜脚本",
    requiredSkillSlugs: ["copywriting-master", "moments-copywriter", "ip-knowledge-base-builder"],
  },
];

const INTERNAL_PROMPT_MARKERS = [
  "内容工厂的 Prompt 生成 Agent",
  "请基于用户意图、输入源、团队知识包和 skill 约束",
  "输入源快照：",
  "本轮 skills：",
  "本轮 skill 执行规范",
  "团队知识包：",
  "本地输入源：",
  "输出要求：",
];

function skillKey(skill: LoadedSkill | SkillRef): string {
  return `${skill.source}:${skill.slug}`;
}

function skillRefFromLoaded(skill: LoadedSkill): SkillRef {
  return { slug: skill.slug, source: skill.source };
}

function skillMatchesSlug(skill: LoadedSkill, slug: string): boolean {
  return skill.slug === slug || skill.metadata.name === slug;
}

function defaultSkillKeys(skills: LoadedSkill[], enabledSkillKeys: Set<string>): string[] {
  return skills
    .filter((skill) => skill.valid && enabledSkillKeys.has(skillKey(skill)))
    .map(skillKey)
    .slice(0, 6);
}

function statusLabel(status: AgentPromptSession["status"]): string {
  if (status === "waiting-user") return "待确认";
  if (status === "draft-created") return "已出草稿";
  if (status === "blocked") return "待配置";
  if (status === "closed") return "已关闭";
  return "协作中";
}

function copywritingTaskForIntent(intentId: QuickIntentId): CopywritingTask | undefined {
  return COPYWRITING_TASKS.find((task) => task.intentId === intentId);
}

function purposeForIntent(intentId: QuickIntentId): PromptDraftPurpose {
  if (intentId === "videoPrompt") return "video";
  if (intentId === "article" || intentId === "articleTitle" || intentId === "articleScript") return "article";
  if (intentId === "greenScreen") return "green-screen";
  if (intentId === "assets" || intentId === "breakdown") return "content-task";
  return "image";
}

function titleForIntent(intentId: QuickIntentId): string {
  if (intentId === "videoPrompt") return "图生视频 Prompt 协作";
  if (intentId === "article") return "文章生成协作";
  if (intentId === "articleTitle") return "标题矩阵协作";
  if (intentId === "articleScript") return "脚本生成协作";
  if (intentId === "greenScreen") return "绿幕文案图协作";
  if (intentId === "assets") return "素材入库说明协作";
  if (intentId === "breakdown") return "素材拆解协作";
  if (intentId === "scenePrompt") return "场景提示词协作";
  return "图片 Prompt 协作";
}

function projectLabelFromPath(path?: string): string {
  if (!path) return "不使用项目";
  return path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
}

function compactProjectPath(path?: string): string {
  if (!path) return "启动前选择或新建项目";
  const parts = path.split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return path;
  return `.../${parts.slice(-2).join("/")}`;
}

function messageTitle(message: AgentPromptMessage): string {
  if (message.role === "user") return message.kind === "adjustment" ? "你的调整" : "你的任务";
  if (message.role === "assistant") {
    if (isBlockedModel(message.model)) return "未完成";
    return message.kind === "draft" ? "草稿结果" : "agents";
  }
  return "系统记录";
}

function compactMessage(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "无内容";
  const promptDraft = trimmed.match(/Prompt 草稿：\n([\s\S]*?)(\n\n需要追问|\n\n仍需追问|\n\n来源与合规提醒|\n\n下游检查清单|\n\n本轮调整：|$)/)?.[1]?.trim();
  if (promptDraft) return sanitizeUserFacingMessage(promptDraft);
  const userIntent = trimmed.match(/用户意图：\n([\s\S]*?)(\n\n团队知识包：|\n\nPrompt 草稿：|\n\n输入源快照：|\n\n本轮 skills：|$)/)?.[1]?.trim();
  if (userIntent) return sanitizeUserFacingMessage(userIntent);
  const displayText = promptDraft || trimmed;
  return sanitizeUserFacingMessage(displayText);
}

function draftArtifactContent(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) return "暂无内容";
  const promptDraft = trimmed.match(/Prompt 草稿：\n([\s\S]*?)(\n\n需要追问|\n\n仍需追问|\n\n来源与合规提醒|\n\n下游检查清单|\n\n本轮调整：|$)/)?.[1]?.trim();
  return sanitizeUserFacingMessage(promptDraft || trimmed) || "暂无可展示草稿";
}

function stripInternalPromptMarkers(content: string): string {
  const trimmed = content.trim();
  const firstMarkerIndex = INTERNAL_PROMPT_MARKERS
    .map((marker) => trimmed.indexOf(marker))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];
  return firstMarkerIndex === undefined ? trimmed : trimmed.slice(0, firstMarkerIndex).trim();
}

function sanitizeUserFacingMessage(message: string): string {
  const sanitized = stripInternalPromptMarkers(message)
    .replace(/blocked:[\w.-]+/gi, "生成服务待配置")
    .replace(/fallback:[\w.-]+/gi, "生成服务待配置")
    .replace(/Lime Agent Server/gi, "生成服务")
    .replace(/Lime App Server/gi, "生成服务")
    .replace(/Provider Store/gi, "模型服务")
    .replace(/Provider projection/gi, "模型服务")
    .replace(/Product App/gi, "业务应用")
    .replace(/App Server backend/gi, "生成服务")
    .replace(/App Server/gi, "生成服务")
    .replace(/backend/gi, "生成服务")
    .replace(/runtime bridge/gi, "连接")
    .replace(/runtime/gi, "运行")
    .replace(/capability/gi, "能力")
    .replace(/artifact/gi, "交付物")
    .replace(/session/gi, "会话")
    .replace(/\bskill\b/gi, "内容能力")
    .replace(/API Key/gi, "访问凭据")
    .replace(/\bkey\b/gi, "访问凭据")
    .replace(/api[_-]?key/gi, "访问凭据")
    .replace(/token|secret|credential/gi, "访问凭据")
    .replace(/Provider/gi, "模型服务")
    .replace(/接口/g, "连接")
    .trim();
  return sanitized || "本轮处理暂未完成，请按恢复路径处理。";
}

function isBlockedModel(model?: string): boolean {
  return Boolean(model?.startsWith("blocked:") || model?.startsWith("fallback:"));
}

function latestDraftMessage(messages: AgentPromptMessage[]): AgentPromptMessage | undefined {
  return [...messages].reverse().find((message) => message.kind === "draft" && message.content.trim());
}

function runtimeSurfaceText(surface: AgentRuntimeEventProjection["surface"]): string {
  if (surface === "human-action") return "待处理";
  if (surface === "tool") return "工具";
  if (surface === "permission") return "权限";
  if (surface === "artifact") return "交付";
  if (surface === "evidence") return "来源";
  if (surface === "context") return "上下文";
  if (surface === "runtime-status") return "运行";
  return "消息";
}

function sanitizeRuntimeProjectionEvent(event: AgentRuntimeEventProjection): AgentRuntimeEventProjection {
  return {
    ...event,
    surface: runtimeSurfaceText(event.surface) as AgentRuntimeEventProjection["surface"],
    title: sanitizeUserFacingMessage(event.title),
    detail: event.detail ? sanitizeUserFacingMessage(event.detail) : undefined,
    displayStatus: sanitizeUserFacingMessage(event.displayStatus),
  };
}

function sanitizeRuntimeReadModel(readModel: ReturnType<typeof projectAgentRuntimeReadModel>): ReturnType<typeof projectAgentRuntimeReadModel> {
  const events = readModel.events.map(sanitizeRuntimeProjectionEvent);
  const visibleEvents = readModel.visibleEvents.map(sanitizeRuntimeProjectionEvent);
  const pendingActions = readModel.pendingActions.map(sanitizeRuntimeProjectionEvent);
  return { ...readModel, events, visibleEvents, pendingActions };
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg className="agents-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === "add" ? (
        <>
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </>
      ) : name === "arrowUp" ? (
        <>
          <path d="M12 19V5" />
          <path d="m6 11 6-6 6 6" />
        </>
      ) : name === "archive" ? (
        <>
          <path d="M5 7h14v13H5z" />
          <path d="M3 4h18v3H3z" />
          <path d="M9 12h6" />
        </>
      ) : name === "book" ? (
        <>
          <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z" />
          <path d="M8 4v16" />
        </>
      ) : name === "bot" ? (
        <>
          <path d="M12 3v3" />
          <rect x="5" y="7" width="14" height="11" rx="3" />
          <path d="M9 12h.01M15 12h.01" />
          <path d="M9 16h6" />
        </>
      ) : name === "chat" ? (
        <>
          <path d="M5 5h14v10H8l-3 4z" />
          <path d="M9 9h6M9 12h4" />
        </>
      ) : name === "chevronDown" ? (
        <path d="m7 10 5 5 5-5" />
      ) : name === "compass" ? (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="m15 9-2 5-5 2 2-5z" />
        </>
      ) : name === "doc" ? (
        <>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v5h5" />
          <path d="M9 13h6M9 17h5" />
        </>
      ) : name === "file" ? (
        <>
          <path d="M7 4h10v16H7z" />
          <path d="M10 8h4M10 12h4M10 16h3" />
        </>
      ) : name === "folder" ? (
        <>
          <path d="M4 7h6l2 2h8v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" />
          <path d="M4 7v11" />
        </>
      ) : name === "grid" ? (
        <>
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" />
        </>
      ) : name === "image" ? (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="m6.5 16 4.2-5 3.2 4 1.8-2.1 1.8 3.1" />
          <circle cx="16" cy="8.5" r="1.4" />
        </>
      ) : name === "layoutArtifact" ? (
        <>
          <rect x="5" y="6" width="14" height="12" rx="2" />
          <path d="M8 9h8M8 12h8M8 15h5" />
        </>
      ) : name === "layoutFocus" ? (
        <>
          <rect x="6" y="7" width="12" height="10" rx="2" />
          <path d="M9 10h6M9 13h4" />
        </>
      ) : name === "layoutSources" ? (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M13 5v14M7 9h3M7 12h3M7 15h3" />
        </>
      ) : name === "more" ? (
        <>
          <circle cx="6" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="18" cy="12" r="1" />
        </>
      ) : name === "panel" ? (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M9 5v14" />
        </>
      ) : name === "search" ? (
        <>
          <circle cx="11" cy="11" r="6" />
          <path d="m16 16 4 4" />
        </>
      ) : name === "settings" ? (
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5l-.3 3.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.5a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3.1h5l.3-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1z" />
        </>
      ) : name === "spark" ? (
        <>
          <path d="M12 3 9.8 9.8 3 12l6.8 2.2L12 21l2.2-6.8L21 12l-6.8-2.2z" />
        </>
      ) : name === "trend" ? (
        <>
          <path d="M4 18h16" />
          <path d="M6 15 10 11l3 3 5-7" />
          <path d="M16 7h2v2" />
        </>
      ) : name === "video" ? (
        <>
          <rect x="4" y="6" width="12" height="12" rx="2" />
          <path d="m16 10 5-3v10l-5-3z" />
        </>
      ) : null}
    </svg>
  );
}

export function AgentsWorkbench({
  busy,
  workspaceReady,
  workspacePath,
  recentWorkspacePaths,
  productImageRefs,
  referenceImageRefs,
  textModel,
  textProviderId,
  modelSettings,
  skills,
  enabledSkillKeys,
  agentPromptSessions,
  activeSessionId,
  onSelectWorkspacePath,
  onChooseWorkspace,
  onClearWorkspace,
  onSelectProductImages,
  onSelectReferenceImages,
  onSelectAgentSession,
  onSelectTextModel,
  onStartAgentSession,
  onContinueAgentSession,
  onOpenImageProduction,
  onOpenVideoPrompt,
  onOpenArticle,
  onOpenAssets,
  onOpenSkills,
  onOpenModelSettings,
  onResolveAgentAction,
}: AgentsWorkbenchProps) {
  const [view, setView] = useState<WorkbenchView>("entry");
  const [prompt, setPrompt] = useState("");
  const [selectedQuickIntentId, setSelectedQuickIntentId] = useState<QuickIntentId>("guide");
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>(null);
  const [accessMode, setAccessMode] = useState<(typeof ACCESS_OPTIONS)[number]["id"]>("full");
  const [openedSessionId, setOpenedSessionId] = useState("");
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<string[]>(() => defaultSkillKeys(skills, enabledSkillKeys));
  const [threadToolbarMenu, setThreadToolbarMenu] = useState<ThreadToolbarMenu>(null);
  const [threadViewMode, setThreadViewMode] = useState<ThreadViewMode>("focus");
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const activeSession = openedSessionId
    ? agentPromptSessions.find((session) => session.id === openedSessionId)
    : undefined;
  const projectOptions = useMemo(() => {
    const paths = new Set<string>();
    if (workspacePath) paths.add(workspacePath);
    recentWorkspacePaths.forEach((path) => {
      if (path.trim()) paths.add(path);
    });
    agentPromptSessions.forEach((session) => {
      if (session.workspacePath) paths.add(session.workspacePath);
    });
    return [...paths].map((path) => ({
      path,
      label: projectLabelFromPath(path),
      detail: compactProjectPath(path),
    }));
  }, [agentPromptSessions, recentWorkspacePaths, workspacePath]);
  const currentProjectLabel = projectLabelFromPath(workspacePath);
  const currentProjectDetail = compactProjectPath(workspacePath);
  const recentSessions = agentPromptSessions
    .filter((session) => !workspacePath || session.workspacePath === workspacePath)
    .slice(0, 4);
  const entryIntents = QUICK_INTENTS.filter((intent) => ENTRY_INTENT_IDS.includes(intent.id));
  const visibleSkills = useMemo(
    () => [...skills]
      .filter((skill) => skill.valid)
      .sort((a, b) => {
        const aRecommended = COPYWRITING_TASKS.some((task) => task.requiredSkillSlugs.some((slug) => skillMatchesSlug(a, slug)));
        const bRecommended = COPYWRITING_TASKS.some((task) => task.requiredSkillSlugs.some((slug) => skillMatchesSlug(b, slug)));
        return Number(!aRecommended) - Number(!bRecommended)
          || Number(!enabledSkillKeys.has(skillKey(a))) - Number(!enabledSkillKeys.has(skillKey(b)))
          || a.slug.localeCompare(b.slug, "zh-Hans-CN");
      })
      .slice(0, 18),
    [enabledSkillKeys, skills],
  );
  const selectedSkills = useMemo(
    () => visibleSkills.filter((skill) => selectedSkillKeys.includes(skillKey(skill))),
    [selectedSkillKeys, visibleSkills],
  );
  const selectedCopywritingTask = copywritingTaskForIntent(selectedQuickIntentId);
  const recommendedCopywritingSkills = useMemo(
    () => selectedCopywritingTask
      ? skills
        .filter((skill) =>
          skill.valid && selectedCopywritingTask.requiredSkillSlugs.some((slug) => skillMatchesSlug(skill, slug)),
        )
        .slice(0, 4)
      : [],
    [selectedCopywritingTask, skills],
  );
  const runSkills = useMemo(
    () => {
      const byKey = new Map<string, LoadedSkill>();
      [...recommendedCopywritingSkills, ...selectedSkills].forEach((skill) => byKey.set(skillKey(skill), skill));
      return [...byKey.values()].slice(0, 6);
    },
    [recommendedCopywritingSkills, selectedSkills],
  );
  const conversationMessages = activeSession?.messages ?? [];
  const displayMessages = useMemo(
    () => conversationMessages.map((message) => ({
      ...message,
      content: compactMessage(message.content),
      model: undefined,
    })),
    [conversationMessages],
  );
  const draftMessage = latestDraftMessage(conversationMessages);
  const selectedQuickIntent = QUICK_INTENTS.find((intent) => intent.id === selectedQuickIntentId) ?? QUICK_INTENTS[0];
  const selectedAccessOption = ACCESS_OPTIONS.find((option) => option.id === accessMode) ?? ACCESS_OPTIONS[2];
  const runtimeReadModel = useMemo(
    () => sanitizeRuntimeReadModel(projectAgentRuntimeReadModel(activeSession)),
    [activeSession],
  );
  const hasRuntimeFacts = Boolean(
    runtimeReadModel.events.length ||
    runtimeReadModel.sourceCount ||
    runtimeReadModel.pendingActions.length ||
    runtimeReadModel.artifactRefs.length ||
    runtimeReadModel.evidenceRefs.length,
  );
  const primaryDisabled = busy || !workspaceReady || !prompt.trim() || (view === "thread" && !activeSession);
  const sourceCount = runtimeReadModel.sourceCount + productImageRefs.length + referenceImageRefs.length;
  const artifactCount = runtimeReadModel.artifactRefs.length + (draftMessage ? 1 : 0);

  useEffect(() => {
    if (!activeSessionId) {
      setView("entry");
      setOpenedSessionId("");
      return;
    }
    setOpenedSessionId(activeSessionId);
    setView("thread");
  }, [activeSessionId]);

  useEffect(() => {
    const availableKeys = new Set(visibleSkills.map(skillKey));
    setSelectedSkillKeys((current) => {
      const kept = current.filter((key) => availableKeys.has(key));
      return kept.length ? kept : defaultSkillKeys(skills, enabledSkillKeys);
    });
  }, [enabledSkillKeys, skills, visibleSkills]);

  function selectQuickIntent(intentId: QuickIntentId): void {
    setSelectedQuickIntentId(intentId);
    setActiveMenu(null);
  }

  async function startAgentSession(intentId: QuickIntentId = selectedQuickIntentId): Promise<void> {
    const userIntent = prompt.trim();
    if (!userIntent) return;
    const selectedSkillRefs = runSkills.map(skillRefFromLoaded);
    setOpenedSessionId("");
    const session = await onStartAgentSession({
      title: titleForIntent(intentId),
      purpose: purposeForIntent(intentId),
      userIntent,
      inputSourceIds: [],
      productImageRefs,
      referenceImageRefs,
      textModel,
      selectedSkills: selectedSkillRefs,
      selectedSkillSlugs: selectedSkillRefs.map((skill) => skill.slug),
    });
    if (!session?.id) return;
    setOpenedSessionId(session.id);
    onSelectAgentSession(session.id);
    setView("thread");
    setPrompt("");
    setActiveMenu(null);
  }

  async function runPrimaryAction(): Promise<void> {
    if (view === "thread" && activeSession) {
      const message = prompt.trim();
      if (!message) return;
      await onContinueAgentSession({
        sessionId: activeSession.id,
        message,
        textModel,
      });
      setView("thread");
      setPrompt("");
      setActiveMenu(null);
      return;
    }
    startAgentSession();
  }

  function openEntryIntent(intentId: QuickIntentId): void {
    setSelectedQuickIntentId(intentId);
    setActiveMenu(null);
    if (prompt.trim() && workspaceReady && !busy) {
      void startAgentSession(intentId);
      return;
    }
    composerInputRef.current?.focus();
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!primaryDisabled) void runPrimaryAction();
  }

  function toggleMenu(menu: ActiveMenu): void {
    setActiveMenu((current) => current === menu ? null : menu);
  }

  async function chooseWorkspaceFromComposer(): Promise<void> {
    setActiveMenu(null);
    await onChooseWorkspace();
  }

  async function selectWorkspaceFromComposer(path: string): Promise<void> {
    setActiveMenu(null);
    if (path === workspacePath) return;
    await onSelectWorkspacePath(path);
  }

  async function clearWorkspaceFromComposer(): Promise<void> {
    setActiveMenu(null);
    await onClearWorkspace();
  }

  function toggleThreadToolbarMenu(menu: ThreadToolbarMenu): void {
    setThreadToolbarMenu((current) => current === menu ? null : menu);
    setActiveMenu(null);
  }

  function renderThreadToolbar() {
    const taskTitle = activeSession?.title?.trim() || titleForIntent(selectedQuickIntentId);
    const viewOptions: Array<{ id: ThreadViewMode; label: string; icon: IconName }> = [
      { id: "focus", label: "专注对话", icon: "layoutFocus" },
      { id: "artifact", label: "产物视图", icon: "layoutArtifact" },
      { id: "sources", label: "来源侧栏", icon: "layoutSources" },
    ];

    return (
      <div className="agents-thread-toolbar" aria-label="对话工具">
        <div className="agents-thread-tool-anchor">
          <button
            type="button"
            className={`agents-thread-tool primary ${threadToolbarMenu === "workspace" ? "active" : ""}`}
            aria-label="切换内容工作台"
            title="切换内容工作台"
            onClick={() => toggleThreadToolbarMenu("workspace")}
          >
            <Icon name="spark" />
            <Icon name="chevronDown" />
          </button>
          {threadToolbarMenu === "workspace" ? (
            <div className="agents-thread-popover agents-thread-workspace-menu">
              {[
                { label: "内容协作", icon: "chat" as const, onClick: () => setThreadToolbarMenu(null) },
                { label: "图片生产", icon: "image" as const, onClick: onOpenImageProduction },
                { label: "视频生产", icon: "video" as const, onClick: onOpenVideoPrompt },
                { label: "素材库", icon: "archive" as const, onClick: onOpenAssets },
              ].map((item) => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => {
                    item.onClick();
                    setThreadToolbarMenu(null);
                  }}
                >
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="agents-thread-tool-anchor">
          <button
            type="button"
            className={`agents-thread-tool ${threadToolbarMenu === "task" ? "active" : ""}`}
            aria-label="任务信息"
            title="任务信息"
            onClick={() => toggleThreadToolbarMenu("task")}
          >
            <Icon name="grid" />
          </button>
          {threadToolbarMenu === "task" ? (
            <div className="agents-thread-popover agents-thread-task-card">
              <header>
                <strong>任务信息</strong>
                <button type="button" aria-label="设置任务信息" title="设置任务信息">
                  <Icon name="settings" />
                </button>
              </header>
              <dl>
                <div>
                  <dt>输入源</dt>
                  <dd>{sourceCount} 项</dd>
                </div>
                <div>
                  <dt>交付物</dt>
                  <dd>{artifactCount} 项</dd>
                </div>
                <div>
                  <dt>当前任务</dt>
                  <dd>{taskTitle}</dd>
                </div>
                <div>
                  <dt>状态</dt>
                  <dd>{activeSession ? statusLabel(activeSession.status) : "待启动"}</dd>
                </div>
              </dl>
              <section>
                <span>进度</span>
                <ul>
                  <li className="done">读取需求与输入源</li>
                  <li className={draftMessage ? "done" : ""}>生成可审核草稿</li>
                  <li className={runtimeReadModel.pendingActions.length ? "active" : ""}>等待人工确认</li>
                </ul>
              </section>
              <footer>
                <span>来源</span>
                <em>{runtimeReadModel.evidenceRefs.length || sourceCount}</em>
              </footer>
            </div>
          ) : null}
        </div>

        <div className="agents-thread-view-switch" aria-label="对话视图">
          {viewOptions.map((option) => (
            <button
              key={option.id}
              type="button"
              className={threadViewMode === option.id ? "active" : ""}
              aria-label={option.label}
              title={option.label}
              onClick={() => {
                setThreadViewMode(option.id);
                setThreadToolbarMenu(null);
              }}
            >
              <Icon name={option.icon} />
            </button>
          ))}
        </div>
      </div>
    );
  }

  function renderComposerSurface(mode: WorkbenchView, className = "") {
    const label = mode === "entry" ? "启动 agents 协作" : "agents 对话输入";
    const sendLabel = busy ? "处理中" : mode === "thread" && activeSession ? "发送" : "开始协作";
    const placeholder = selectedQuickIntent.placeholder;

    return (
      <section className={`agents-composer-frame ${className}`.trim()} aria-label={label}>
        <textarea
          ref={composerInputRef}
          aria-label="agents 输入"
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={submitOnEnter}
          placeholder={placeholder}
          rows={mode === "entry" ? 5 : 4}
        />
        <div className="agents-composer-controls">
          <div className="agents-composer-left">
            <div className="agents-menu-anchor">
              <button
                type="button"
                className="agents-icon-button"
                aria-label="添加输入"
                title="添加输入"
                onClick={() => toggleMenu("add")}
              >
                <Icon name="add" />
              </button>
              {activeMenu === "add" ? (
                <div className="agents-floating-menu agents-add-menu">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectProductImages();
                      setActiveMenu(null);
                    }}
                  >
                    <Icon name="image" />
                    <span>
                      添加照片和文件
                      <small>产品图 {productImageRefs.length}</small>
                      <i className="agents-sr-only">添加产品图</i>
                    </span>
                    <em>{productImageRefs.length}</em>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectReferenceImages();
                      setActiveMenu(null);
                    }}
                  >
                    <Icon name="file" />
                    <span>
                      添加参考图
                      <small>参考图 {referenceImageRefs.length}</small>
                      <i className="agents-sr-only">添加参考图</i>
                    </span>
                    <em>{referenceImageRefs.length}</em>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onOpenSkills();
                      setActiveMenu(null);
                    }}
                  >
                    <Icon name="grid" />
                    <span>
                      skills 管理
                      <small>管理内容能力</small>
                    </span>
                    <em>{selectedSkills.length}</em>
                  </button>
                </div>
              ) : null}
            </div>
            <label className="agents-intent-control agents-intent-control-hidden">
              <select
                aria-label="协作目标"
                value={selectedQuickIntentId}
                onChange={(event) => selectQuickIntent(event.target.value as QuickIntentId)}
              >
                {QUICK_INTENTS.map((intent) => (
                  <option key={intent.id} value={intent.id}>{intent.label}</option>
                ))}
              </select>
            </label>
            <div className="agents-menu-anchor">
              <button
                type="button"
                className="agents-composer-chip"
                aria-label="权限设置"
                onClick={() => toggleMenu("access")}
              >
                <span>{selectedAccessOption.id === "full" ? "完全访问" : selectedAccessOption.label}</span>
                <Icon name="chevronDown" />
              </button>
              {activeMenu === "access" ? (
                <div className="agents-floating-menu agents-access-menu">
                  {ACCESS_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={option.id === accessMode ? "active" : ""}
                      onClick={() => {
                        setAccessMode(option.id);
                        setActiveMenu(null);
                      }}
                    >
                      <Icon name={option.id === "custom" ? "settings" : "panel"} />
                      <span>
                        {option.label}
                        <small>{option.detail}</small>
                      </span>
                      <em>{option.id === accessMode ? "当前" : ""}</em>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="agents-composer-right">
            <PlatformRuntimeModelMenu
              modelSettings={modelSettings}
              capability="text"
              value={textModel}
              providerId={textProviderId}
              label="模型"
              contextLabel="模型设置"
              placement={mode === "entry" ? "bottom" : "top"}
              className="agents-platform-model-menu"
              emptyLabel="未配置可用模型"
              leadingIcon={null}
              onChange={onSelectTextModel}
              onOpenChange={(open) => {
                if (open) setActiveMenu(null);
              }}
              onOpenModelSettings={onOpenModelSettings}
            />
            <button
              type="button"
              className="agents-send-button"
              aria-label={sendLabel}
              title={sendLabel}
              onClick={runPrimaryAction}
              disabled={primaryDisabled}
            >
              <Icon name="arrowUp" />
            </button>
          </div>
        </div>
        <div className="agents-composer-project-rail" aria-label="项目上下文">
          <div className="agents-menu-anchor">
            <button
              type="button"
              className={`agents-project-chip ${activeMenu === "project" ? "active" : ""}`}
              aria-label="选择项目"
              title={currentProjectDetail}
              onClick={() => toggleMenu("project")}
            >
              <Icon name="folder" />
              <span>{currentProjectLabel}</span>
              <Icon name="chevronDown" />
            </button>
            {activeMenu === "project" ? (
              <div className="agents-floating-menu agents-project-menu">
                <div className="agents-project-search">
                  <Icon name="search" />
                  <span>搜索项目</span>
                </div>
                {projectOptions.map((project) => (
                  <button
                    key={project.path}
                    type="button"
                    className={project.path === workspacePath ? "active" : ""}
                    onClick={() => void selectWorkspaceFromComposer(project.path)}
                  >
                    <Icon name="folder" />
                    <span>
                      {project.label}
                      <small>{project.detail}</small>
                    </span>
                    <em>{project.path === workspacePath ? "✓" : ""}</em>
                  </button>
                ))}
                <div className="agents-menu-divider" />
                <div className="agents-project-add">
                  <button type="button" className="agents-project-add-row">
                    <Icon name="add" />
                    <span>添加新项目</span>
                    <em>›</em>
                  </button>
                  <div className="agents-project-submenu">
                    <button type="button" onClick={chooseWorkspaceFromComposer}>
                      <Icon name="add" />
                      <span>新建空白项目</span>
                    </button>
                    <button type="button" onClick={chooseWorkspaceFromComposer}>
                      <Icon name="folder" />
                      <span>使用现有文件夹</span>
                    </button>
                  </div>
                </div>
                <button type="button" onClick={clearWorkspaceFromComposer}>
                  <Icon name="folder" />
                  <span>不使用项目</span>
                </button>
              </div>
            ) : null}
          </div>
          <span className="agents-project-mode">本地模式</span>
          <span className="agents-project-mode">main</span>
        </div>
      </section>
    );
  }

  function renderComposer(mode: WorkbenchView) {
    return (
      <footer className={`agents-dialog-composer ${mode}`}>
        {renderComposerSurface(mode)}
      </footer>
    );
  }

  function renderEntryLaunch() {
    return renderComposerSurface("entry", "agents-entry-composer agents-entry-launch");
  }

  if (view === "entry") {
    return (
      <section className="agents-entry">
        <div className="agents-entry-shell">
          <main className="agents-entry-main" aria-label="agents 入口">
            <section className="agents-entry-hero">
              <h3>我们应该在 agents 中构建什么？</h3>
              <div className="agents-entry-hero-actions">
                <button
                  type="button"
                  className="agents-entry-secondary-action"
                  onClick={onOpenArticle}
                >
                  <Icon name="doc" />
                  <strong>打开文案工作台</strong>
                </button>
              </div>
            </section>

            {renderEntryLaunch()}

            <section className="agents-entry-board" aria-label="协作任务入口">
              {entryIntents.map((intent) => (
                <button
                  key={intent.id}
                  type="button"
                  className={selectedQuickIntentId === intent.id ? "active" : ""}
                  onClick={() => openEntryIntent(intent.id)}
                >
                  <Icon name={intent.icon} />
                  <span>
                    <strong>{intent.label}</strong>
                    <small>{intent.placeholder}</small>
                  </span>
                  <Icon name="arrowUp" />
                </button>
              ))}
            </section>

            <section className="agents-entry-sessions" aria-label="当前项目对话">
              <header>
                <strong>当前项目对话</strong>
                <span>{recentSessions.length}</span>
              </header>
              {recentSessions.length ? (
                <div>
                  {recentSessions.map((session) => (
                    <button
                      key={session.id}
                      type="button"
                      className={session.id === openedSessionId ? "active" : ""}
                      onClick={() => {
                        setOpenedSessionId(session.id);
                        onSelectAgentSession(session.id);
                        setView("thread");
                      }}
                    >
                      <strong>{session.title?.trim() || session.userIntent?.trim().slice(0, 22) || "agents 协作"}</strong>
                      <span>{statusLabel(session.status)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p>这个项目还没有对话。从上方输入任务后会保存到当前项目。</p>
              )}
            </section>
          </main>
        </div>
      </section>
    );
  }

  return (
    <section className="agents-workbench">
      <div className="agents-dialog-shell">
        {renderThreadToolbar()}
        <main className="agents-thread" aria-label="agents 对话">
          <div className="agents-thread-scroll" aria-label="协作对话">
            <AgentUiProjectionSurface
              mode="conversation"
              readModel={runtimeReadModel}
              messages={displayMessages}
              empty={(
                <div className="agents-thread-empty">
                  <strong>{busy ? "正在生成协作记录" : "还没有协作记录"}</strong>
                  <span>{busy ? "收到协作消息和交付物后会显示在这里。" : "返回入口输入任务后开始协作。"}</span>
                </div>
              )}
              runningLabel={busy ? "agents 正在处理" : undefined}
              messageTitle={messageTitle}
              messageMeta={(message) => new Date(message.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
              messagePreview={(message) => message.content}
            />

            {draftMessage ? (
              <section className={`agents-draft-inline${isBlockedModel(draftMessage.model) ? " blocked" : ""}`} aria-label="agents 交付内容">
                <strong>{isBlockedModel(draftMessage.model) ? "未完成记录" : "Prompt 草稿"}</strong>
                <pre>{draftArtifactContent(draftMessage.content)}</pre>
              </section>
            ) : null}

            {hasRuntimeFacts ? (
              <AgentUiProjectionSurface
                mode="runtime"
                className="agents-runtime-inline"
                readModel={runtimeReadModel}
                showRuntimeWhenEmpty={false}
                onResolveAction={onResolveAgentAction ? (event) => onResolveAgentAction(event) : undefined}
              />
            ) : null}
          </div>
        </main>

        {renderComposer("thread")}
      </div>
    </section>
  );
}
