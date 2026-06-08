import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type {
  AgentPromptSession,
  AssetFileKind,
  BuguAuthState,
  GenerationLogEntry,
  MediaGenerationResult,
  OemPublicAsset,
  OemPublicCase,
  OemPublicSiteConfig,
  OemSiteConfigRequest,
  PromptDraftPurpose,
} from "../../../../shared/types";
import { fileNameFromPath, localAssetUrl, statusLabel } from "../../app/formatters";
import rawDressingkitVideoShared from "../../data/dressingkit-ai-video-shared.json";
import rawDressingkitMaterials from "../../data/dressingkit-materials.json";
import { AgentSessionPanel, type AgentActionResolver, type AgentExecutionStep } from "../agent/AgentSessionPanel";
import { DetailDialog } from "../DetailDialog";

type VideoShowcaseDialog = "feature-picker" | "material-upload" | "preview" | "history" | "prompt-list" | "prompt-assistant" | null;
type VideoShowcaseAssetRole = "input" | "output" | "unknown";
type VideoShowcaseFeatureId = "storyboard" | "smart-video" | "omni-video";
type VideoShowcaseMainTab = "features" | "results" | "materials";
type VideoPromptAssistantTab = "text" | "reverse";
type VideoPromptListKind = "all" | "default" | "saved";
type VideoPromptListFormMode = "create" | "edit" | null;
type VideoMaterialKind = "image" | "video" | "audio";
type VideoMaterialActor = "virtual" | "real";
type VideoMaterialStatus = "reported" | "reviewing" | "rejected";
type VideoMaterialStatusFilter = "all" | VideoMaterialStatus;
type VideoPreviewState = { url: string; kind: "image" | "video" | "artifact"; title: string; label: string };
const VIDEO_SHOWCASE_AGENT_SOURCE = "AI 视频展示提示词助手";

interface VideoShowcaseModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  productImageRefs: string[];
  videoAssetRefs: string[];
  audioAssetRefs: string[];
  mediaResult: MediaGenerationResult | null;
  authState: BuguAuthState | null;
  logs: GenerationLogEntry[];
  agentPromptSessions: AgentPromptSession[];
  activeAgentPromptSessionId: string;
  textModel?: string;
  onSelectProductImages: () => void;
  onSelectVideo: () => void;
  onSelectAudio: () => void;
  onSelectMaterialFiles: (kind: AssetFileKind) => Promise<string[]>;
  onRemoveProductImageRef: (ref: string) => void;
  onRemoveVideoAssetRef: (ref: string) => void;
  onRemoveAudioAssetRef: (ref: string) => void;
  onSelectAgentSession: (sessionId: string) => void;
  onStartAgentSession: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    textModel?: string;
  }) => void;
  onContinueAgentSession: (input: {
    sessionId: string;
    message: string;
    textModel?: string;
  }) => void;
  onResolveAgentAction?: AgentActionResolver;
  onUsePromptInVideo: (input: ShowcaseVideoHandoff) => void;
  onStartPartialRetouch: (input: {
    prompt: string;
    productImageRefs: string[];
    referenceImageRefs: string[];
    productImageLabel: string;
    referenceImageLabel: string;
    featureId?: string;
    featureTitle?: string;
    outputRefs: string[];
    sourceLogId?: string;
    sourceTitle?: string;
  }) => void;
  onClearResult: () => void;
  onGenerateVideo: (input: ShowcaseVideoHandoff) => void;
}

export interface ShowcaseVideoHandoff {
  prompt: string;
  imageAssetRefs: string[];
  videoAssetRefs: string[];
  audioAssetRefs: string[];
  featureId: VideoShowcaseFeatureId;
  featureTitle: string;
  durationSeconds: number;
  aspectRatio?: "1:1" | "3:4" | "4:3" | "9:16" | "16:9";
  resolution?: string;
  storyboardCount?: number;
  quality?: string;
  selectedCaseTitle?: string;
}

interface VideoShowcaseFeature {
  id: VideoShowcaseFeatureId;
  title: string;
  subtitle: string;
  businessFlag: number;
  iconKey: VideoShowcaseIconName;
}

interface VideoShowcaseFeatureUiItem {
  id?: string;
  title?: string;
  businessFlag?: number;
  iconKey?: string;
  sourceUi?: unknown;
}

interface VideoShowcaseFeatureUiConfig {
  schemaVersion?: number;
  source?: unknown;
  featureGroups?: Array<{
    id?: string;
    label?: string;
    features?: VideoShowcaseFeatureUiItem[];
  }>;
}

interface VideoCaseAsset {
  id: string;
  url: string;
  role: VideoShowcaseAssetRole;
  kind: "image" | "video";
  caption?: string;
  width?: number;
  height?: number;
  mimeType?: string;
}

interface VideoShowcaseCase {
  id: string;
  title: string;
  industry: string;
  summary: string;
  prompt: string;
  featureId: VideoShowcaseFeatureId;
  assets: VideoCaseAsset[];
}

interface HistoryEntry {
  id: string;
  title: string;
  detail: string;
  tone: "ready" | "idle" | "warning" | "blocked";
  createdAt: string;
  featureTitle?: string;
  jobType?: string;
  status?: MediaGenerationResult["status"];
  statusText?: string;
  inputRefs?: string[];
  outputRefs?: string[];
  prompt?: string;
  logId?: string;
  source?: "local" | "global";
}

const AGENT_SESSION_STATUS_LABELS: Record<AgentPromptSession["status"], string> = {
  active: "协作中",
  "waiting-user": "待补充",
  "draft-created": "已生成草稿",
  blocked: "待配置",
  closed: "已关闭",
};

interface SavedVideoPromptTemplate {
  id: string;
  title: string;
  featureId: VideoShowcaseFeatureId;
  featureTitle: string;
  prompt: string;
  mediaRefs?: string[];
  createdAt: string;
  updatedAt?: string;
}

interface VideoMaterialEntry {
  id: string;
  kind: VideoMaterialKind;
  actor: VideoMaterialActor;
  status: VideoMaterialStatus;
  title: string;
  ref: string;
  createdAt: string;
}

interface VideoMaterialUploadDraft {
  kind: VideoMaterialKind;
  actor: VideoMaterialActor;
  title: string;
  refs: string[];
  error?: string;
}

interface DressingkitLibraryMaterial {
  id: string;
  tab?: string;
  imagePath: string;
}

type VideoShowcaseIconName = "storyboard" | "smart-video" | "omni-video";

const VIDEO_FEATURES: VideoShowcaseFeature[] = [
  {
    id: "storyboard",
    title: "分镜图",
    subtitle: "生成 6 宫格分镜图和服装视觉大片",
    businessFlag: 90,
    iconKey: "storyboard",
  },
  {
    id: "smart-video",
    title: "智能视频",
    subtitle: "基于产品卖点和人物生成带货视频",
    businessFlag: 130,
    iconKey: "smart-video",
  },
  {
    id: "omni-video",
    title: "全能视频",
    subtitle: "融合图片、视频和音频生成多素材视频",
    businessFlag: 134,
    iconKey: "omni-video",
  },
];

const FEATURE_IDS = new Set<VideoShowcaseFeatureId>(VIDEO_FEATURES.map((feature) => feature.id));
const FEATURE_BY_ID = new Map(VIDEO_FEATURES.map((feature) => [feature.id, feature]));
const FEATURE_ID_BY_BUSINESS_FLAG = new Map(
  VIDEO_FEATURES.map((feature) => [String(feature.businessFlag), feature.id]),
);
const DRESSINGKIT_VIDEO_SHARED_SITE = rawDressingkitVideoShared as OemPublicSiteConfig;
const DRESSINGKIT_VIDEO_FACE_MATERIALS = (rawDressingkitMaterials as DressingkitLibraryMaterial[])
  .filter((item) => item.tab === "model")
  .slice(0, 9);

const DEFAULT_PROMPTS: Record<VideoShowcaseFeatureId, string> = {
  storyboard: "生成图片的6宫格分镜图，服装视觉大片，4K，相机拍摄真实风格。包含特写与局部，远景与近景。",
  "smart-video": "根据图中产品的卖点与特点，结合图中人物生成产品带货视频。语音与文字为中文环境。",
  "omni-video": "根据图中产品的卖点与特点，结合图中人物生成产品带货视频。语音与文字为中文环境。",
};
const DEFAULT_VIDEO_FEATURE_ID: VideoShowcaseFeatureId = "storyboard";
const DEFAULT_PROMPT_VALUES = new Set(Object.values(DEFAULT_PROMPTS));
const VIDEO_PROMPT_TEMPLATE_STORAGE_KEY = "buguai:dressingkit-video-prompt-templates";
const VIDEO_DURATIONS = ["5s", "10s", "15s"];
const VIDEO_RESOLUTIONS = ["480P", "720P", "1080P"];
const STORYBOARD_COUNTS = [1, 2, 3];
const STORYBOARD_RATIOS = ["3:4", "1:1", "4:3", "9:16", "16:9"];
const STORYBOARD_QUALITIES = ["1K", "2K", "4K"];

function readSavedVideoPromptTemplates(): SavedVideoPromptTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(VIDEO_PROMPT_TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedVideoPromptTemplate =>
        Boolean(item) &&
        typeof item === "object" &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.prompt === "string" &&
        typeof item.featureId === "string" &&
        FEATURE_IDS.has(item.featureId as VideoShowcaseFeatureId) &&
        typeof item.featureTitle === "string" &&
        typeof item.createdAt === "string",
      )
      .map((item) => ({
        ...item,
        featureId: item.featureId as VideoShowcaseFeatureId,
        mediaRefs: Array.isArray(item.mediaRefs)
          ? item.mediaRefs.filter((ref): ref is string => typeof ref === "string" && ref.trim().length > 0).slice(0, 8)
          : undefined,
      }))
      .slice(0, 24);
  } catch {
    return [];
  }
}

function writeSavedVideoPromptTemplates(templates: SavedVideoPromptTemplate[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(VIDEO_PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(templates.slice(0, 24)));
}

const INDUSTRIES = [
  "全部",
  "服饰类",
  "家居类",
  "建筑类",
  "电子产品类",
  "珠宝首饰类",
  "美妆护肤类",
  "食品饮料类",
  "汽车交通类",
  "文创 IP 类",
  "运动户外类",
];

const MATERIAL_KIND_TABS: Array<{ id: VideoMaterialKind; label: string }> = [
  { id: "image", label: "图片" },
  { id: "video", label: "视频" },
  { id: "audio", label: "音频" },
];

const MATERIAL_ACTOR_TABS: Array<{ id: VideoMaterialActor; label: string }> = [
  { id: "virtual", label: "虚拟人" },
  { id: "real", label: "真人" },
];

const MATERIAL_STATUS_TABS: Array<{ id: VideoMaterialStatusFilter; label: string }> = [
  { id: "all", label: "全部" },
  { id: "reported", label: "已报备" },
  { id: "reviewing", label: "审核中" },
  { id: "rejected", label: "未通过" },
];

const VIDEO_SHOWCASE_ICON_PATHS: Record<VideoShowcaseIconName, ReactNode> = {
  storyboard: (
    <>
      <rect x="4" y="5" width="6" height="5" rx="1.2" />
      <rect x="14" y="5" width="6" height="5" rx="1.2" />
      <rect x="4" y="14" width="6" height="5" rx="1.2" />
      <rect x="14" y="14" width="6" height="5" rx="1.2" />
      <path d="M10 7.5h4M10 16.5h4" />
    </>
  ),
  "smart-video": (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2.5" />
      <path d="m10 9 5 3-5 3z" />
      <path d="M18 4v3M16.5 5.5h3M6 20v-3M4.5 18.5h3" />
    </>
  ),
  "omni-video": (
    <>
      <rect x="3.5" y="6" width="12" height="12" rx="2" />
      <path d="m15.5 10 5-3v10l-5-3z" />
      <path d="M8 10h3M8 14h4M6 4l1.1-2M11 4l1.1-2" />
    </>
  ),
};

function buildOemSiteConfigRequest(authState: BuguAuthState | null): OemSiteConfigRequest {
  const branding = authState?.bootstrap?.branding;
  const tenant =
    authState?.bootstrap?.tenant?.slug ||
    branding?.tenantId ||
    branding?.brandId ||
    "bugu";
  return {
    tenant,
    apiBaseUrl: branding?.oemPublicApiBaseUrl,
    includeShared: true,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFeatureUiConfig(site: OemPublicSiteConfig): VideoShowcaseFeatureUiConfig | null {
  const value = site.featureFlags?.["ai-video-showcase-ui"];
  if (!isRecord(value)) return null;
  const groups = Array.isArray(value.featureGroups)
    ? value.featureGroups
        .filter(isRecord)
        .map((group) => ({
          id: readString(group.id),
          label: readString(group.label),
          features: Array.isArray(group.features)
            ? group.features.filter(isRecord).map((feature) => ({
                id: readString(feature.id),
                title: readString(feature.title),
                businessFlag: typeof feature.businessFlag === "number" ? feature.businessFlag : undefined,
                iconKey: readString(feature.iconKey),
                sourceUi: feature.sourceUi,
              }))
            : [],
        }))
    : [];
  if (!groups.length) return null;
  return {
    schemaVersion: typeof value.schemaVersion === "number" ? value.schemaVersion : undefined,
    source: value.source,
    featureGroups: groups,
  };
}

function indexFeatureUiById(config: VideoShowcaseFeatureUiConfig | null): Map<string, VideoShowcaseFeatureUiItem> {
  const map = new Map<string, VideoShowcaseFeatureUiItem>();
  for (const group of config?.featureGroups || []) {
    for (const feature of group.features || []) {
      if (feature.id) map.set(feature.id, feature);
    }
  }
  return map;
}

function normalizeIconName(value: string | undefined): VideoShowcaseIconName | undefined {
  if (!value) return undefined;
  return Object.prototype.hasOwnProperty.call(VIDEO_SHOWCASE_ICON_PATHS, value)
    ? value as VideoShowcaseIconName
    : undefined;
}

function iconKeyForFeature(
  feature: VideoShowcaseFeature,
  featureUiById: Map<string, VideoShowcaseFeatureUiItem>,
): VideoShowcaseIconName {
  return normalizeIconName(featureUiById.get(feature.id)?.iconKey) || feature.iconKey;
}

function tagValue(tags: string[] | undefined, prefix: string): string {
  const tag = (tags || []).find((item) => item.startsWith(prefix));
  return tag ? tag.slice(prefix.length).trim() : "";
}

function featureIdFromCase(item: OemPublicCase): VideoShowcaseFeatureId {
  const tags = item.tags || [];
  const explicitFeatureId = tagValue(tags, "feature:");
  if (FEATURE_IDS.has(explicitFeatureId as VideoShowcaseFeatureId)) return explicitFeatureId as VideoShowcaseFeatureId;

  const businessFlagTag = tags.find((tag) => tag.startsWith("dressingkit-business-"));
  const businessFlag = businessFlagTag?.replace("dressingkit-business-", "") || "";
  return FEATURE_ID_BY_BUSINESS_FLAG.get(businessFlag) || "smart-video";
}

function isVideoShowcaseBackendCase(item: OemPublicCase): boolean {
  return (item.tags || []).includes("ai-video-showcase");
}

function uniqueById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const uniqueItems: T[] = [];
  for (const item of items) {
    if (!item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    uniqueItems.push(item);
  }
  return uniqueItems;
}

function mergeWithSharedDressingkitVideoSite(site: OemPublicSiteConfig | null | undefined): OemPublicSiteConfig {
  return {
    tenantId: site?.tenantId || DRESSINGKIT_VIDEO_SHARED_SITE.tenantId,
    slug: site?.slug,
    displayName: site?.displayName,
    primaryDomain: site?.primaryDomain,
    cases: uniqueById([
      ...(DRESSINGKIT_VIDEO_SHARED_SITE.cases || []),
      ...(site?.cases || []),
    ]),
    materials: uniqueById([
      ...(DRESSINGKIT_VIDEO_SHARED_SITE.materials || []),
      ...(site?.materials || []),
    ]),
    assets: uniqueById([
      ...(DRESSINGKIT_VIDEO_SHARED_SITE.assets || []),
      ...(site?.assets || []),
    ]),
    featureFlags: {
      ...(DRESSINGKIT_VIDEO_SHARED_SITE.featureFlags || {}),
      ...(site?.featureFlags || {}),
    },
    featureFlagItems: site?.featureFlagItems,
  };
}

function roleFromAsset(ref: string, asset?: OemPublicAsset): VideoShowcaseAssetRole {
  const roleText = `${asset?.group || ""} ${asset?.role || ""}`.toLowerCase();
  if (roleText.includes("output") || roleText.includes("输出")) return "output";
  if (roleText.includes("input") || roleText.includes("输入")) return "input";
  const text = `${ref} ${asset?.caption || ""} ${asset?.fileName || ""}`.toLowerCase();
  if (text.includes("output") || text.includes("输出")) return "output";
  if (text.includes("input") || text.includes("输入")) return "input";
  return "unknown";
}

function kindFromAsset(asset?: OemPublicAsset, ref?: string): "image" | "video" {
  const kind = (asset?.kind || "").toLowerCase();
  if (kind === "video") return "video";
  if (kind === "image") return "image";

  const mimeType = (asset?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("image/")) return "image";

  const source = `${asset?.publicUrl || ""} ${ref || ""}`.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)(?:$|[?#\s])/.test(source)) return "video";
  return "image";
}

function publicUrlFromRef(ref: string, asset?: OemPublicAsset): string {
  if (/^(https?:|data:(?:image|video)\/|blob:|local-asset:)/i.test(ref)) return ref;
  return asset?.publicUrl || "";
}

function mediaAssetSource(ref: string): string {
  if (/^(https?:|data:(?:image|video)\/|blob:|local-asset:)/i.test(ref)) return ref;
  return localAssetUrl(ref);
}

function rendererPublicAssetUrl(assetPath: string): string {
  if (/^(https?:|data:image\/|blob:|local-asset:)/i.test(assetPath)) return assetPath;
  const normalizedPath = assetPath.replace(/^\/+/, "");
  const url = new URL(`./${normalizedPath}`, window.location.href);
  if (url.protocol !== "file:") return url.toString();
  const pathname = decodeURIComponent(url.pathname);
  return `local-asset://${encodeURI(pathname).replace(/#/g, "%23")}`;
}

function isVideoRef(ref: string): boolean {
  return /\.(mp4|mov|webm|m4v)(?:$|[?#\s])/i.test(ref);
}

function isAudioRef(ref: string): boolean {
  return /\.(mp3|wav|m4a|aac|ogg|flac)(?:$|[?#\s])/i.test(ref);
}

function isTraceArtifactRef(ref: string): boolean {
  return /\.(json|md|txt|yaml|yml)(?:$|[?#\s])/i.test(ref);
}

function previewKindFromRef(ref: string): VideoPreviewState["kind"] {
  if (isVideoRef(ref)) return "video";
  if (isAudioRef(ref) || isTraceArtifactRef(ref)) return "artifact";
  return "image";
}

function artifactTypeLabel(ref: string): string {
  const match = /\.([a-z0-9]+)(?:$|[?#\s])/i.exec(ref);
  return match ? match[1].toUpperCase() : "FILE";
}

function aspectRatioFromVideoSize(value: string): ShowcaseVideoHandoff["aspectRatio"] | undefined {
  return value === "1:1" || value === "3:4" || value === "4:3" || value === "9:16" || value === "16:9"
    ? value
    : undefined;
}

function secondsFromDuration(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function uniqueRefs(refs: string[], limit: number): string[] {
  return Array.from(new Set(refs.filter(Boolean))).slice(0, limit);
}

function featureTitleForPromptTemplate(featureId: VideoShowcaseFeatureId): string {
  return FEATURE_BY_ID.get(featureId)?.title || "AI 视频";
}

function buildVideoExpandedPrompt(input: {
  basePrompt: string;
  feature: VideoShowcaseFeature;
  selectedCase?: VideoShowcaseCase | null;
  imageCount: number;
  videoCount: number;
  audioCount: number;
  duration: string;
  resolution: string;
  size: string;
  storyboardCount: number;
  storyboardRatio: string;
  storyboardQuality: string;
  mode: VideoPromptAssistantTab;
}): string {
  const prompt = input.basePrompt.trim() || DEFAULT_PROMPTS[input.feature.id];
  const constraints = [
    `功能：${input.feature.title}`,
    input.selectedCase ? `参考案例：${input.selectedCase.title}` : "",
    `输入素材：图片 ${input.imageCount} 张，视频 ${input.videoCount} 个，音频 ${input.audioCount} 个`,
    input.feature.id === "storyboard"
      ? `分镜数量：${input.storyboardCount}，比例：${input.storyboardRatio}，质量：${input.storyboardQuality}`
      : `视频时长：${input.duration}，分辨率：${input.resolution}，画面比例：${input.size}`,
    input.mode === "reverse"
      ? "根据已上传素材反推镜头、主体动作、场景、光线、运镜和商业卖点。"
      : "扩写为可直接用于 AI 视频生成的中文提示词，明确镜头节奏、主体动作、背景、光线、质感、字幕/口播约束。",
  ].filter(Boolean);
  return [
    prompt,
    "",
    "补充生成约束：",
    ...constraints.map((item) => `- ${item}`),
    "- 保持产品主体清晰稳定，避免变形、穿帮、水印、错字和多余肢体。",
    "- 输出需适合电商展示、社媒投放和后续剪辑复用。",
  ].join("\n");
}

function buildBackendCards(cases: OemPublicCase[], assets: OemPublicAsset[]): VideoShowcaseCase[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  return cases.filter(isVideoShowcaseBackendCase).map((item) => {
    const resolvedAssets: VideoCaseAsset[] = [];
    for (const ref of item.mediaRefs || []) {
      const asset = assetsById.get(ref);
      const url = publicUrlFromRef(ref, asset);
      if (!url) continue;
      resolvedAssets.push({
        id: asset?.id || ref,
        url,
        role: roleFromAsset(ref, asset),
        kind: kindFromAsset(asset, ref),
        caption: asset?.caption,
        width: asset?.width,
        height: asset?.height,
        mimeType: asset?.mimeType,
      });
    }

    return {
      id: item.id,
      title: item.title,
      industry: item.industry || "未分类",
      summary: item.summary || "AI 视频案例素材",
      prompt: item.prompt || "",
      featureId: featureIdFromCase(item),
      assets: resolvedAssets,
    };
  });
}

function assetsForRole(item: VideoShowcaseCase, role: "input" | "output"): VideoCaseAsset[] {
  const exact = item.assets.filter((asset) => asset.role === role);
  if (exact.length) return exact;
  if (role === "input") return item.assets.filter((asset) => asset.role === "unknown").slice(0, 1);
  const unknown = item.assets.filter((asset) => asset.role === "unknown");
  return unknown.slice(1);
}

function historyId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function formatHistoryTime(value: string): string {
  return new Date(value).toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatHistoryDateTime(value: string): string {
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  if (Number.isNaN(date.getTime())) return value;
  return [
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`,
  ].join(" ");
}

function historyTaskNumber(entry: HistoryEntry): string {
  if (entry.logId) return entry.logId.replace(/[^0-9a-z]/gi, "").slice(0, 18) || entry.id;
  return entry.id.replace(/[^0-9]/g, "").slice(0, 18) || entry.id.slice(0, 18);
}

function historyStatusText(entry: HistoryEntry): string {
  if (entry.statusText) return entry.statusText;
  if (entry.status) return statusLabel(entry.status);
  if (entry.tone === "ready") return "生成完成";
  if (entry.tone === "warning") return "处理中";
  if (entry.tone === "blocked") return "生成失败";
  return "待生成";
}

function historyRecordRefs(entry: HistoryEntry): string[] {
  const outputRefs = entry.outputRefs?.filter(Boolean) || [];
  if (outputRefs.length) return outputRefs;
  return entry.inputRefs?.filter(Boolean) || [];
}

function mediaRefsOnly(refs: string[]): string[] {
  return refs.filter((ref) => previewKindFromRef(ref) !== "artifact");
}

function imageRefsOnly(refs: string[]): string[] {
  return refs.filter((ref) => previewKindFromRef(ref) === "image");
}

function isGenerationHistoryEntry(entry: HistoryEntry): boolean {
  const hasRefs = Boolean(entry.inputRefs?.length || entry.outputRefs?.length);
  return Boolean(entry.logId || entry.status || hasRefs);
}

function stringArrayFromField(value: unknown, key: string): string[] {
  if (!value || typeof value !== "object") return [];
  const field = (value as Record<string, unknown>)[key];
  return Array.isArray(field)
    ? field.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function stringFromInputField(log: GenerationLogEntry, key: string): string {
  if (!log.input || typeof log.input !== "object") return "";
  const value = (log.input as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function promptFromVideoLog(log: GenerationLogEntry): string {
  const script = stringFromInputField(log, "script");
  if (script) return script;
  const prompt = stringFromInputField(log, "prompt");
  if (prompt) return prompt;
  return log.summary || log.title;
}

function historyEntryFromVideoLog(log: GenerationLogEntry): HistoryEntry | null {
  if (log.kind !== "video") return null;
  const outputRefs = [
    ...stringArrayFromField(log.output, "assetRefs"),
    ...(log.artifactRefs || []),
  ];
  const uniqueOutputRefs = Array.from(new Set(outputRefs.filter(Boolean)));
  const uniqueInputRefs = Array.from(new Set([
    ...stringArrayFromField(log.input, "imageAssetRefs"),
    ...stringArrayFromField(log.input, "videoAssetRefs"),
    ...stringArrayFromField(log.input, "audioAssetRefs"),
  ]));
  const normalizedStatus = log.status === "succeeded" && !uniqueOutputRefs.length ? "failed" : log.status;
  const tone: HistoryEntry["tone"] =
    normalizedStatus === "succeeded" ? "ready" :
    normalizedStatus === "queued" || normalizedStatus === "running" ? "warning" :
    "blocked";
  const featureTitle = stringFromInputField(log, "featureTitle") || "AI 视频";
  return {
    id: `log:${log.id}`,
    title: log.title,
    detail: log.summary || log.error || promptFromVideoLog(log),
    tone,
    createdAt: log.createdAt,
    featureTitle,
    jobType: stringFromInputField(log, "selectedCaseTitle") || featureTitle,
    status: normalizedStatus,
    statusText: normalizedStatus === "succeeded" ? "生成完成" : statusLabel(normalizedStatus),
    inputRefs: uniqueInputRefs,
    outputRefs: uniqueOutputRefs,
    prompt: promptFromVideoLog(log),
    logId: log.id,
    source: "global",
  };
}

function mergeVideoHistoryEntries(localEntries: HistoryEntry[], logs: GenerationLogEntry[]): HistoryEntry[] {
  const entriesByKey = new Map<string, HistoryEntry>();
  for (const entry of localEntries) {
    if (!isGenerationHistoryEntry(entry)) continue;
    const key = entry.logId ? `log:${entry.logId}` : `local:${entry.id}`;
    entriesByKey.set(key, { ...entry, source: entry.source || "local" });
  }
  for (const log of logs) {
    const entry = historyEntryFromVideoLog(log);
    if (!entry) continue;
    const key = `log:${log.id}`;
    const local = entriesByKey.get(key);
    entriesByKey.set(key, local ? { ...local, ...entry, id: local.id, source: local.source || entry.source } : entry);
  }
  return [...entriesByKey.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 32);
}

function materialKindLabel(kind: VideoMaterialKind): string {
  return MATERIAL_KIND_TABS.find((item) => item.id === kind)?.label || "素材";
}

function materialActorLabel(actor: VideoMaterialActor): string {
  return MATERIAL_ACTOR_TABS.find((item) => item.id === actor)?.label || "虚拟人";
}

function materialStatusLabel(status: VideoMaterialStatus): string {
  return MATERIAL_STATUS_TABS.find((item) => item.id === status)?.label || "审核中";
}

function assetKindForMaterial(kind: VideoMaterialKind): AssetFileKind {
  if (kind === "image") return "image-material";
  if (kind === "video") return "video";
  return "audio";
}

function materialUploadTitle(kind: VideoMaterialKind): string {
  if (kind === "image") return "上传图片";
  if (kind === "audio") return "新增音频";
  return "新增素材";
}

function materialUploadHint(kind: VideoMaterialKind): string {
  if (kind === "image") return "AI 视频图片类型：支持 jpeg/png/webp/bmp/tiff/gif/heic/heif，单张小于 30MB。";
  if (kind === "audio") return "支持常见音频格式；时长 <= 15.1 秒。";
  return "支持常见视频格式；单条时长 <= 15.1 秒。";
}

function materialDropText(kind: VideoMaterialKind): string {
  if (kind === "image") return "点击上方“上传”或拖拽到此区域";
  return `点击上传或拖拽上传${materialKindLabel(kind)}素材`;
}

function defaultMaterialTitle(ref: string, kind: VideoMaterialKind): string {
  const name = fileNameFromPath(ref).replace(/\.[^.]+$/, "");
  return name || `${materialKindLabel(kind)}素材`;
}

function refsFromDroppedFiles(files: FileList): string[] {
  return Array.from(files)
    .map((file) => (file as File & { path?: string }).path || URL.createObjectURL(file))
    .filter(Boolean);
}

function FeatureButtonIcon({ iconKey }: { iconKey: VideoShowcaseIconName }) {
  return (
    <span className="ai-video-feature-icon-wrap" aria-hidden="true">
      <svg className="ai-video-feature-icon" viewBox="0 0 24 24">
        {VIDEO_SHOWCASE_ICON_PATHS[iconKey]}
      </svg>
    </span>
  );
}

function VideoCaseActionIcon({ name }: { name: "preview" | "try" }) {
  return (
    <svg className="ai-video-case-action-icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === "preview" ? (
        <>
          <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M5 12h10" />
          <path d="m12 5 7 7-7 7" />
        </>
      )}
    </svg>
  );
}

function MediaAsset({
  asset,
  title,
  label,
  controls = true,
}: {
  asset: VideoCaseAsset;
  title: string;
  label: string;
  controls?: boolean;
}) {
  const style = asset.width && asset.height
    ? ({ "--video-asset-ratio": `${asset.width} / ${asset.height}` } as React.CSSProperties)
    : undefined;

  if (asset.kind === "video") {
    return (
      <video
        src={asset.url}
        aria-label={`${title} ${label}`}
        controls={controls}
        muted
        playsInline
        preload="metadata"
        style={style}
      />
    );
  }
  return <img src={asset.url} alt={`${title} ${label}`} loading="lazy" style={style} />;
}

function videoCaseAssetKindLabel(kind: VideoCaseAsset["kind"]): string {
  return kind === "video" ? "视频" : "图片";
}

function groupedInputAssets(assets: VideoCaseAsset[]): Array<{ kind: VideoCaseAsset["kind"]; assets: VideoCaseAsset[] }> {
  return (["image", "video"] as const)
    .map((kind) => ({ kind, assets: assets.filter((asset) => asset.kind === kind) }))
    .filter((group) => group.assets.length > 0);
}

function MediaStack({
  item,
  role,
  wide,
  variant = "card",
  onOpen,
}: {
  item: VideoShowcaseCase;
  role: "input" | "output";
  wide: boolean;
  variant?: "card" | "preview";
  onOpen?: (preview: VideoPreviewState) => void;
}) {
  const assets = assetsForRole(item, role);
  const label = role === "input" ? "输入文件" : "输出图";
  const inputKinds = new Set(assets.map((asset) => asset.kind));
  const useGroupedInput = role === "input" && variant === "card" && (inputKinds.size > 1 || assets.length > 4);
  if (useGroupedInput) {
    const groups = groupedInputAssets(assets);
    return (
      <div className="ai-video-media-stack" data-role={role}>
        <span className="ai-video-media-label">{label}</span>
        {groups.length ? (
          <div className="ai-video-input-files">
            <div className="ai-video-input-files-scroll">
              {groups.map((group) => (
                <section className="ai-video-input-section" key={group.kind}>
                  <div className="ai-video-input-section-title">{videoCaseAssetKindLabel(group.kind)}</div>
                  <div className="ai-video-input-thumb-grid" data-count={Math.min(group.assets.length, 4)}>
                    {group.assets.map((asset, index) => (
                      <div key={`${asset.id}-${index}`} className="ai-video-input-thumb">
                        {!onOpen ? (
                          <MediaAsset asset={asset} title={item.title} label={`${videoCaseAssetKindLabel(asset.kind)} ${index + 1}`} />
                        ) : (
                          <button
                            type="button"
                            className="ai-video-media-open"
                            onClick={() => onOpen({
                              url: asset.url,
                              kind: asset.kind,
                              title: item.title,
                              label: `${videoCaseAssetKindLabel(asset.kind)} ${index + 1}`,
                            })}
                          >
                            <MediaAsset
                              asset={asset}
                              title={item.title}
                              label={`${videoCaseAssetKindLabel(asset.kind)} ${index + 1}`}
                              controls={false}
                            />
                          </button>
                        )}
                        {asset.kind === "video" ? <span className="ai-video-kind-badge">视频</span> : null}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="ai-video-empty-media">
            <span>{label}</span>
          </div>
        )}
      </div>
    );
  }
  const assetLimit = variant === "preview" ? 24 : role === "input" ? 4 : 1;
  const visibleAssets = assets.slice(0, assetLimit);
  const hiddenCount = variant === "preview" ? 0 : Math.max(0, assets.length - visibleAssets.length);
  return (
    <div className={`ai-video-media-stack ${variant === "preview" ? "is-preview" : ""}`} data-role={role}>
      <span className="ai-video-media-label">{label}</span>
      {visibleAssets.length ? (
        <div
          className="ai-video-media-grid"
          data-count={Math.min(visibleAssets.length, 4)}
          data-role={role}
          data-wide={wide ? "true" : "false"}
        >
          {visibleAssets.map((asset, index) => (
            <div key={`${asset.id}-${index}`} className="ai-video-media-frame">
              {!onOpen ? (
                <MediaAsset asset={asset} title={item.title} label={`${label} ${index + 1}`} />
              ) : (
                <button
                  type="button"
                  className="ai-video-media-open"
                  onClick={() => onOpen({
                    url: asset.url,
                    kind: asset.kind,
                    title: item.title,
                    label: `${label} ${index + 1}`,
                  })}
                >
                  <MediaAsset asset={asset} title={item.title} label={`${label} ${index + 1}`} controls={false} />
                </button>
              )}
              {asset.kind === "video" ? <span className="ai-video-kind-badge">视频</span> : null}
              {hiddenCount && index === visibleAssets.length - 1 ? (
                <span className="ai-video-more">+{hiddenCount}</span>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="ai-video-empty-media">
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}

function UploadPreviewStrip({
  title,
  refs,
  kind,
  onOpen,
  onRemove,
}: {
  title: string;
  refs: string[];
  kind: "image" | "video" | "audio";
  onOpen: (preview: VideoPreviewState) => void;
  onRemove: (ref: string) => void;
}) {
  if (!refs.length) return null;
  return (
    <div className="ai-video-upload-preview-strip" data-kind={kind}>
      {refs.map((ref, index) => {
        const label = `${title}${index + 1}`;
        const source = mediaAssetSource(ref);
        return (
          <article key={`${kind}-${ref}-${index}`} className="ai-video-upload-preview-card">
            {kind === "image" ? (
              <button
                type="button"
                className="ai-video-upload-thumb"
                onClick={() => onOpen({ url: source, kind: "image", title: label, label: title })}
              >
                <img src={source} alt={label} loading="lazy" />
              </button>
            ) : kind === "video" ? (
              <button
                type="button"
                className="ai-video-upload-thumb is-video"
                onClick={() => onOpen({ url: source, kind: "video", title: label, label: title })}
              >
                <video src={source} muted playsInline preload="metadata" />
                <span>视频</span>
              </button>
            ) : (
              <div className="ai-video-upload-thumb is-audio" aria-label={label}>
                <span>♪</span>
              </div>
            )}
            <strong title={kind === "audio" ? fileNameFromPath(ref) : label}>
              {kind === "audio" ? fileNameFromPath(ref) : label}
            </strong>
            <button
              type="button"
              className="ai-video-upload-remove"
              aria-label={`删除${label}`}
              onClick={() => onRemove(ref)}
            >
              ×
            </button>
          </article>
        );
      })}
    </div>
  );
}

function ResultAssetCard({ refPath, index, onOpen }: {
  refPath: string;
  index: number;
  onOpen: (preview: VideoPreviewState) => void;
}) {
  const kind = previewKindFromRef(refPath);
  const source = mediaAssetSource(refPath);
  const title = `生成结果 ${index + 1}`;
  return (
    <button
      type="button"
      className={`ai-video-result-asset is-${kind}`}
      onClick={() => onOpen({ url: source, kind, title, label: "生成结果" })}
    >
      {kind === "video" ? (
        <video src={source} muted playsInline preload="metadata" />
      ) : kind === "artifact" ? (
        <span className="ai-video-artifact-card">
          <strong>{artifactTypeLabel(refPath)}</strong>
          <em>队列文件</em>
        </span>
      ) : (
        <img src={source} alt={title} loading="lazy" />
      )}
      <span className="ai-video-result-label">{kind === "video" ? "视频结果" : kind === "artifact" ? "队列文件" : "图片结果"}</span>
    </button>
  );
}

function VideoHistoryThumbGrid({ refs }: { refs: string[] }) {
  const visibleRefs = refs.slice(0, 4);
  const hiddenCount = Math.max(0, refs.length - visibleRefs.length);
  return (
    <span className="ai-video-history-thumb-grid" data-count={Math.min(visibleRefs.length, 4)}>
      {visibleRefs.map((ref, index) => {
        const source = mediaAssetSource(ref);
        const kind = previewKindFromRef(ref);
        if (kind === "artifact") {
          return (
            <span key={`${ref}-${index}`} className="ai-video-history-thumb-artifact">
              {artifactTypeLabel(ref)}
            </span>
          );
        }
        return kind === "video" ? (
          <video key={`${ref}-${index}`} src={source} muted playsInline preload="metadata" />
        ) : (
          <img key={`${ref}-${index}`} src={source} alt="" loading="lazy" />
        );
      })}
      {hiddenCount ? <em>+{hiddenCount}</em> : null}
    </span>
  );
}

function VideoHistoryAssetGrid({
  refs,
  label,
  onOpen,
  showActions = false,
}: {
  refs: string[];
  label: string;
  onOpen: (preview: VideoPreviewState) => void;
  showActions?: boolean;
}) {
  if (!refs.length) {
    return <div className="ai-video-history-section-empty">暂无{label}</div>;
  }
  return (
    <div className="ai-video-history-asset-grid" data-count={Math.min(refs.length, 6)}>
      {refs.map((ref, index) => {
        const source = mediaAssetSource(ref);
        const kind = previewKindFromRef(ref);
        const title = `${label} ${index + 1}`;
        const openPreview = () => onOpen({ url: source, kind, title, label });
        return (
          <figure
            key={`${ref}-${index}`}
            className="ai-video-history-asset"
          >
            <button
              type="button"
              className="ai-video-history-asset-preview"
              aria-label={`预览${title}`}
              onClick={openPreview}
            >
              {kind === "video" ? (
                <video src={source} muted playsInline preload="metadata" />
              ) : kind === "artifact" ? (
                <span className="ai-video-artifact-card">
                  <strong>{artifactTypeLabel(ref)}</strong>
                  <em>队列文件</em>
                </span>
              ) : (
                <img src={source} alt={title} loading="lazy" />
              )}
            </button>
            {showActions ? (
              <figcaption className="ai-video-history-asset-actions">
                <button type="button" onClick={openPreview}>预览</button>
                <a href={source} download={`bugu-${title}.${kind === "video" ? "mp4" : kind === "artifact" ? artifactTypeLabel(ref).toLowerCase() : "png"}`} onClick={(event) => event.stopPropagation()}>下载</a>
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

function VideoHistoryDrawer({
  entries,
  featureTitle,
  uploadCount,
  materialCount,
  mediaResult,
  onOpenMedia,
  onSendToMaterialLibrary,
  onPartialRetouch,
  onClose,
}: {
  entries: HistoryEntry[];
  featureTitle: string;
  uploadCount: number;
  materialCount: number;
  mediaResult: MediaGenerationResult | null;
  onOpenMedia: (preview: VideoPreviewState) => void;
  onSendToMaterialLibrary: (entry: HistoryEntry, refs: string[]) => void;
  onPartialRetouch: (entry: HistoryEntry, refs: string[]) => void;
  onClose: () => void;
}) {
  const records = entries.filter((entry) =>
    Boolean(entry.prompt?.trim() || entry.inputRefs?.length || entry.outputRefs?.length),
  );
  const [selectedId, setSelectedId] = useState(records[0]?.id || "");
  useEffect(() => {
    if (!records.length) {
      if (selectedId) setSelectedId("");
      return;
    }
    if (!records.some((entry) => entry.id === selectedId)) {
      setSelectedId(records[0].id);
    }
  }, [records, selectedId]);

  const selectedEntry = records.find((entry) => entry.id === selectedId) || records[0];
  const selectedOutputRefs = selectedEntry?.outputRefs?.filter(Boolean) || [];
  const selectedMediaOutputRefs = mediaRefsOnly(selectedOutputRefs);
  const selectedImageOutputRefs = imageRefsOnly(selectedOutputRefs);
  const selectedInputCount = selectedEntry?.inputRefs?.length ?? uploadCount;
  return (
    <div className="ai-video-history-layer" role="presentation" onClick={onClose}>
      <section
        className="ai-video-history-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="生成记录"
        onClick={(event) => event.stopPropagation()}
        data-empty={selectedEntry ? "false" : "true"}
      >
        <header className="ai-video-history-modal-header">
          <h2>历史记录</h2>
          <div className="ai-video-history-modal-actions">
            <button type="button" aria-label="刷新历史记录">↻</button>
            <button type="button" aria-label="关闭历史记录" onClick={onClose}>×</button>
          </div>
        </header>
        <div className="ai-video-history-toolbar">
          <button type="button" className="ai-video-history-filter">
            全部 <span>⌄</span>
          </button>
          <div className="ai-video-history-date-range" aria-label="时间范围">
            <span>▦</span>
            <em>开始时间</em>
            <strong>To</strong>
            <em>结束时间</em>
          </div>
          <button type="button" className="ai-video-history-query">查询</button>
          <button type="button" className="ai-video-history-download">批量下载</button>
        </div>
        <div className="ai-video-history-modal-body">
          <aside className="ai-video-history-record-list" aria-label="历史记录列表">
            {records.length ? (
              records.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={entry.id === selectedEntry?.id ? "ai-video-history-record-thumb active" : "ai-video-history-record-thumb"}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <VideoHistoryThumbGrid refs={historyRecordRefs(entry)} />
                </button>
              ))
            ) : (
              <div className="ai-video-history-empty-list">暂无记录</div>
            )}
          </aside>

          {selectedEntry ? (
            <main className="ai-video-history-detail">
              <div className="ai-video-history-meta-row">
                <span>{historyTaskNumber(selectedEntry)}</span>
                <span>{selectedEntry.jobType || selectedEntry.featureTitle || featureTitle}</span>
                {selectedEntry.featureTitle && selectedEntry.featureTitle !== selectedEntry.jobType ? (
                  <span>{selectedEntry.featureTitle}</span>
                ) : null}
                <span className={`tone-${selectedEntry.tone}`}>{historyStatusText(selectedEntry)}</span>
                <span>{formatHistoryDateTime(selectedEntry.createdAt)}</span>
              </div>
              <div className="ai-video-history-operation-row">
                <button
                  type="button"
                  disabled={!selectedMediaOutputRefs.length}
                  onClick={() => onSendToMaterialLibrary(selectedEntry, selectedMediaOutputRefs)}
                >
                  发送到素材库
                </button>
                <button
                  type="button"
                  disabled={!selectedImageOutputRefs.length}
                  onClick={() => onPartialRetouch(selectedEntry, selectedImageOutputRefs)}
                >
                  局部精修
                </button>
              </div>
              <section className="ai-video-history-section">
                <h3>输入文件</h3>
                <VideoHistoryAssetGrid refs={selectedEntry.inputRefs || []} label="输入文件" onOpen={onOpenMedia} />
              </section>
              <section className="ai-video-history-section">
                <h3>生成结果</h3>
                <VideoHistoryAssetGrid refs={selectedEntry.outputRefs || []} label="生成结果" onOpen={onOpenMedia} showActions />
              </section>
              <section className="ai-video-history-section ai-video-history-prompt-section">
                <header>
                  <h3>提示词</h3>
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedEntry.prompt) void navigator.clipboard?.writeText(selectedEntry.prompt);
                    }}
                  >
                    复制
                  </button>
                </header>
                <textarea value={selectedEntry.prompt || selectedEntry.detail} readOnly />
              </section>
              <p className="ai-video-history-footnote">
                {selectedEntry.featureTitle || featureTitle} · {selectedInputCount} 个输入素材 · {materialCount} 个素材库记录 · {mediaResult ? statusLabel(mediaResult.status) : "未生成"}
              </p>
            </main>
          ) : (
            <main className="ai-video-history-detail ai-video-history-empty-detail">
              <section className="ai-video-history-section">
                <h3>输入文件</h3>
                <VideoHistoryAssetGrid refs={[]} label="输入文件" onOpen={onOpenMedia} />
              </section>
              <section className="ai-video-history-section">
                <h3>生成结果</h3>
                <VideoHistoryAssetGrid refs={[]} label="生成结果" onOpen={onOpenMedia} showActions />
              </section>
              <section className="ai-video-history-section ai-video-history-prompt-section">
                <header>
                  <h3>提示词</h3>
                </header>
                <textarea value="暂无历史记录。完成一次生成后，这里会展示输入文件、生成结果和提示词。" readOnly />
              </section>
            </main>
          )}
        </div>
      </section>
    </div>
  );
}

function VideoMaterialLibrary({
  entries,
  activeKind,
  activeActor,
  activeStatus,
  onBack,
  onKindChange,
  onActorChange,
  onStatusChange,
  onRefresh,
  onOpenUpload,
  onUse,
  onRemove,
  onOpen,
}: {
  entries: VideoMaterialEntry[];
  activeKind: VideoMaterialKind;
  activeActor: VideoMaterialActor;
  activeStatus: VideoMaterialStatusFilter;
  onBack: () => void;
  onKindChange: (kind: VideoMaterialKind) => void;
  onActorChange: (actor: VideoMaterialActor) => void;
  onStatusChange: (status: VideoMaterialStatusFilter) => void;
  onRefresh: () => void;
  onOpenUpload: () => void;
  onUse: (entry: VideoMaterialEntry) => void;
  onRemove: (id: string) => void;
  onOpen: (preview: VideoPreviewState) => void;
}) {
  const showActorFilter = activeKind === "image";
  const visibleEntries = entries.filter((entry) =>
    entry.kind === activeKind &&
    (!showActorFilter || entry.actor === activeActor) &&
    (activeStatus === "all" || entry.status === activeStatus),
  );

  return (
    <section
      className={`ai-video-material-library ${showActorFilter ? "has-actor-filter" : "no-actor-filter"}`}
      aria-label="视频素材库"
    >
      <header className="ai-video-material-header">
        <button type="button" className="ai-video-material-back" aria-label="返回视频生成面板" onClick={onBack}>
          ‹
        </button>
        <h2>视频素材库</h2>
      </header>

      <div className="ai-video-material-tabs ai-video-material-kind-tabs" aria-label="素材类型">
        {MATERIAL_KIND_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeKind === item.id ? "active" : ""}
            onClick={() => onKindChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {showActorFilter ? (
        <div className="ai-video-material-tabs ai-video-material-actor-tabs" aria-label="人物类型">
          {MATERIAL_ACTOR_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeActor === item.id ? "active" : ""}
              onClick={() => onActorChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="ai-video-material-toolbar">
        <div className="ai-video-material-tabs ai-video-material-status-tabs" aria-label="审核状态">
          {MATERIAL_STATUS_TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeStatus === item.id ? "active" : ""}
              onClick={() => onStatusChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="ai-video-material-actions">
          <button type="button" className="ai-video-material-action" onClick={onRefresh}>刷新</button>
          <button type="button" className="ai-video-material-action" onClick={onOpenUpload}>新增素材</button>
        </div>
      </div>

      <div className="ai-video-material-body">
        {visibleEntries.length ? (
          <div className="ai-video-material-grid">
            {visibleEntries.map((entry) => (
              <VideoMaterialCard
                key={entry.id}
                entry={entry}
                onUse={onUse}
                onRemove={onRemove}
                onOpen={onOpen}
              />
            ))}
          </div>
        ) : (
          <div className="ai-video-material-empty">
            <span aria-hidden="true" />
            <p>当前筛选下暂无素材</p>
          </div>
        )}
      </div>
    </section>
  );
}

function VideoMaterialCard({
  entry,
  onUse,
  onRemove,
  onOpen,
}: {
  entry: VideoMaterialEntry;
  onUse: (entry: VideoMaterialEntry) => void;
  onRemove: (id: string) => void;
  onOpen: (preview: VideoPreviewState) => void;
}) {
  const source = mediaAssetSource(entry.ref);
  return (
    <article className="ai-video-material-card">
      <button
        type="button"
        className={`ai-video-material-thumb is-${entry.kind}`}
        onClick={() => {
          if (entry.kind === "audio") return;
          onOpen({
            url: source,
            kind: entry.kind,
            title: entry.title,
            label: materialKindLabel(entry.kind),
          });
        }}
      >
        {entry.kind === "image" ? (
          <img src={source} alt={entry.title} loading="lazy" />
        ) : entry.kind === "video" ? (
          <video src={source} muted playsInline preload="metadata" />
        ) : (
          <span>♪</span>
        )}
      </button>
      <div className="ai-video-material-card-body">
        <strong title={entry.title}>{entry.title}</strong>
        <span>{materialActorLabel(entry.actor)} · {materialStatusLabel(entry.status)}</span>
      </div>
      <div className="ai-video-material-card-actions">
        <button type="button" onClick={() => onUse(entry)}>使用</button>
        <button type="button" onClick={() => onRemove(entry.id)}>删除</button>
      </div>
    </article>
  );
}

function VideoMaterialUploadDialog({
  draft,
  onSelectFiles,
  onDropRefs,
  onTitleChange,
  onSubmit,
  onClose,
}: {
  draft: VideoMaterialUploadDraft;
  onSelectFiles: () => void;
  onDropRefs: (refs: string[]) => void;
  onTitleChange: (title: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  const needsAudit = draft.kind !== "image";
  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const refs = refsFromDroppedFiles(event.dataTransfer.files);
    if (refs.length) onDropRefs(refs);
  };

  return (
    <div className="ai-video-material-upload-modal" role="presentation" onClick={onClose}>
      <section
        className="ai-video-material-upload-card"
        data-kind={draft.kind}
        role="dialog"
        aria-modal="true"
        aria-label={materialUploadTitle(draft.kind)}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>{materialUploadTitle(draft.kind)}</h2>
          <button type="button" aria-label="关闭此对话框" onClick={onClose}>×</button>
        </header>

        <div className="ai-video-material-upload-body">
          {draft.kind === "image" ? (
            <div className="ai-video-material-upload-row">
              <button type="button" className="ai-video-material-upload-button" onClick={onSelectFiles}>
                上传
              </button>
              <span>{materialUploadHint(draft.kind)}</span>
            </div>
          ) : null}

          <div
            className="ai-video-material-upload-drop"
            role="button"
            tabIndex={0}
            onClick={onSelectFiles}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            <span className="ai-video-material-upload-icon" aria-hidden="true" />
            <div className="ai-video-material-upload-copy">
              <strong>{materialDropText(draft.kind)}</strong>
              {draft.kind !== "image" ? <em>{materialUploadHint(draft.kind)}</em> : null}
            </div>
          </div>

          {draft.refs.length ? (
            <div className="ai-video-material-upload-selection">
              {draft.refs.map((ref, index) => (
                <span key={`${ref}-${index}`}>{fileNameFromPath(ref)}</span>
              ))}
            </div>
          ) : null}

          {needsAudit ? (
            <label className="ai-video-material-name-field">
              <span>名称 <em>*</em></span>
              <input
                name="material-title"
                value={draft.title}
                onChange={(event) => onTitleChange(event.target.value)}
                placeholder={`请输入${materialKindLabel(draft.kind)}素材名称`}
              />
            </label>
          ) : (
            <p className="ai-video-material-upload-note">注：宽高需在 300-6000px，宽高比需大于 0.4 且小于 2.5。</p>
          )}

          {draft.error ? <p className="ai-video-material-upload-error">{draft.error}</p> : null}
        </div>

        {needsAudit ? (
          <footer>
            <button type="button" onClick={onClose}>取消</button>
            <button type="button" className="primary" onClick={onSubmit}>提交审核</button>
          </footer>
        ) : null}
      </section>
    </div>
  );
}

function VideoCaseCard({
  item,
  activeFeatureId,
  onPreview,
  onApply,
  onOpenMedia,
}: {
  item: VideoShowcaseCase;
  activeFeatureId: VideoShowcaseFeatureId;
  onPreview: (item: VideoShowcaseCase) => void;
  onApply: (item: VideoShowcaseCase) => void;
  onOpenMedia: (preview: VideoPreviewState) => void;
}) {
  const wide = activeFeatureId === "omni-video";
  const hasInputAssets = assetsForRole(item, "input").length > 0;
  return (
    <article className={`ai-video-case-card ${wide ? "is-wide" : ""}`}>
      <div className={[
        "ai-video-case-media",
        wide ? "is-wide" : "",
        hasInputAssets ? "" : "output-only",
      ].filter(Boolean).join(" ")}>
        {hasInputAssets ? <MediaStack item={item} role="input" wide={wide} onOpen={onOpenMedia} /> : null}
        <MediaStack item={item} role="output" wide={wide} onOpen={onOpenMedia} />
      </div>
      <div className="ai-video-case-bottom">
        <div className="ai-video-case-meta">
          <strong title={item.title}>{item.title}</strong>
        </div>
        <div className="ai-video-case-actions">
          <button type="button" onClick={() => onPreview(item)}>
            <VideoCaseActionIcon name="preview" />
            <span>预览</span>
          </button>
          <button type="button" className="primary" onClick={() => onApply(item)}>
            <VideoCaseActionIcon name="try" />
            <span>尝试示例</span>
          </button>
        </div>
      </div>
    </article>
  );
}

export function VideoShowcaseModule({
  busy,
  workspaceReady,
  productImageRefs,
  videoAssetRefs,
  audioAssetRefs,
  mediaResult,
  authState,
  logs,
  agentPromptSessions,
  activeAgentPromptSessionId,
  textModel,
  onSelectProductImages,
  onSelectVideo,
  onSelectAudio,
  onSelectMaterialFiles,
  onRemoveProductImageRef,
  onRemoveVideoAssetRef,
  onRemoveAudioAssetRef,
  onSelectAgentSession,
  onStartAgentSession,
  onContinueAgentSession,
  onResolveAgentAction,
  onUsePromptInVideo,
  onStartPartialRetouch,
  onClearResult,
  onGenerateVideo,
}: VideoShowcaseModuleProps) {
  const [activeFeatureId, setActiveFeatureId] = useState<VideoShowcaseFeatureId>(DEFAULT_VIDEO_FEATURE_ID);
  const [activeMainTab, setActiveMainTab] = useState<VideoShowcaseMainTab>("features");
  const [selectedIndustry, setSelectedIndustry] = useState("全部");
  const [promptDraft, setPromptDraft] = useState(DEFAULT_PROMPTS[DEFAULT_VIDEO_FEATURE_ID]);
  const [storyboardCount, setStoryboardCount] = useState(1);
  const [storyboardRatio, setStoryboardRatio] = useState("3:4");
  const [storyboardQuality, setStoryboardQuality] = useState("2K");
  const [videoDuration, setVideoDuration] = useState("5s");
  const [videoResolution, setVideoResolution] = useState("720P");
  const [videoSize, setVideoSize] = useState("智能");
  const [selectedCase, setSelectedCase] = useState<VideoShowcaseCase | null>(null);
  const [activeDialog, setActiveDialog] = useState<VideoShowcaseDialog>(null);
  const [backendCases, setBackendCases] = useState<OemPublicCase[]>([]);
  const [backendAssets, setBackendAssets] = useState<OemPublicAsset[]>([]);
  const [backendStatus, setBackendStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [backendMessage, setBackendMessage] = useState("");
  const [featureUiConfig, setFeatureUiConfig] = useState<VideoShowcaseFeatureUiConfig | null>(null);
  const [savedPromptTemplates, setSavedPromptTemplates] = useState<SavedVideoPromptTemplate[]>(() => readSavedVideoPromptTemplates());
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [exampleImageRefs, setExampleImageRefs] = useState<string[] | null>(null);
  const [exampleVideoRefs, setExampleVideoRefs] = useState<string[] | null>(null);
  const [exampleAudioRefs, setExampleAudioRefs] = useState<string[] | null>(null);
  const [selectedMedia, setSelectedMedia] = useState<VideoPreviewState | null>(null);
  const [submittedGeneration, setSubmittedGeneration] = useState(false);
  const [materialEntries, setMaterialEntries] = useState<VideoMaterialEntry[]>([]);
  const [materialKind, setMaterialKind] = useState<VideoMaterialKind>("image");
  const [materialActor, setMaterialActor] = useState<VideoMaterialActor>("virtual");
  const [materialStatus, setMaterialStatus] = useState<VideoMaterialStatusFilter>("all");
  const [materialUploadDraft, setMaterialUploadDraft] = useState<VideoMaterialUploadDraft | null>(null);
  const [generationValidationMessage, setGenerationValidationMessage] = useState("");
  const [assistantTab, setAssistantTab] = useState<VideoPromptAssistantTab>("text");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantResult, setAssistantResult] = useState("");
  const [assistantAgentMessage, setAssistantAgentMessage] = useState("请结合当前视频功能、素材和参数，继续收紧提示词并指出素材不足的风险。");
  const [assistantTemplatesOpen, setAssistantTemplatesOpen] = useState(false);
  const [templateDraftTitle, setTemplateDraftTitle] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [promptListKind, setPromptListKind] = useState<VideoPromptListKind>("all");
  const [promptListQuery, setPromptListQuery] = useState("");
  const [promptListDraftTitle, setPromptListDraftTitle] = useState("");
  const [promptListDraftPrompt, setPromptListDraftPrompt] = useState("");
  const [promptListEditingId, setPromptListEditingId] = useState("");
  const [promptListDefaultFeatureId, setPromptListDefaultFeatureId] = useState<VideoShowcaseFeatureId | "">("");
  const [promptListFormMode, setPromptListFormMode] = useState<VideoPromptListFormMode>(null);
  const [promptListDraftMediaRefs, setPromptListDraftMediaRefs] = useState<string[]>([]);
  const pendingGenerationRef = useRef<HistoryEntry | null>(null);
  const activeFeature = FEATURE_BY_ID.get(activeFeatureId) || VIDEO_FEATURES[0];

  function appendHistory(entry: Omit<HistoryEntry, "id" | "createdAt">): void {
    setHistoryEntries((current) => [
      { ...entry, id: historyId(), createdAt: new Date().toISOString() },
      ...current,
    ].slice(0, 16));
  }

  function appendGenerationHistory(entry: Omit<HistoryEntry, "id" | "createdAt" | "tone"> & Partial<Pick<HistoryEntry, "tone">>): HistoryEntry {
    const nextEntry: HistoryEntry = {
      ...entry,
      id: historyId(),
      createdAt: new Date().toISOString(),
      tone: entry.tone || "ready",
    };
    setHistoryEntries((current) => [nextEntry, ...current].slice(0, 16));
    return nextEntry;
  }

  function rememberPendingGeneration(input: {
    title: string;
    prompt: string;
    inputRefs: string[];
    outputRefs?: string[];
    featureTitle?: string;
    jobType?: string;
  }): void {
    pendingGenerationRef.current = appendGenerationHistory({
      title: input.title,
      detail: input.prompt.slice(0, 120),
      tone: "warning",
      featureTitle: input.featureTitle || activeFeature.title,
      jobType: input.jobType || activeFeature.title,
      statusText: "生成中",
      inputRefs: input.inputRefs,
      outputRefs: input.outputRefs || [],
      prompt: input.prompt,
    });
  }

  function completePendingGeneration(result: MediaGenerationResult): void {
    const pending = pendingGenerationRef.current;
    if (!pending) return;
    const outputRefs = result.assetRefs.length ? result.assetRefs : pending.outputRefs || [];
    setHistoryEntries((current) =>
      current.map((entry) =>
        entry.id === pending.id
          ? {
              ...entry,
              tone: result.status === "succeeded" ? "ready" : result.status === "blocked" || result.status === "failed" ? "blocked" : "warning",
              status: result.status,
              statusText: result.status === "succeeded" ? "生成完成" : statusLabel(result.status),
              outputRefs,
              logId: result.logId,
              detail: result.message || entry.detail,
            }
          : entry,
      ),
    );
    pendingGenerationRef.current = null;
  }

  useEffect(() => {
    const controller = new AbortController();
    setBackendStatus("loading");
    setBackendMessage("");
    window.contentStudio.getOemSiteConfig(buildOemSiteConfigRequest(authState))
      .then((site) => {
        if (controller.signal.aborted) return;
        const remoteCases = Array.isArray(site.cases) ? site.cases : [];
        const remoteAssets = Array.isArray(site.assets) ? site.assets : [];
        const mergedSite = mergeWithSharedDressingkitVideoSite(site);
        const cases = Array.isArray(mergedSite.cases) ? mergedSite.cases : [];
        const assets = Array.isArray(mergedSite.assets) ? mergedSite.assets : [];
        const videoCases = cases.filter(isVideoShowcaseBackendCase);
        setBackendCases(videoCases);
        setBackendAssets(assets);
        setFeatureUiConfig(readFeatureUiConfig(mergedSite));
        setBackendStatus(videoCases.length ? "ready" : "empty");
        appendHistory({
          title: videoCases.length ? "已加载 AI 视频案例清单" : "AI 视频案例清单为空",
          detail: videoCases.length
            ? `${videoCases.length} 组案例 · ${assets.length} 个资产 · 后端增量 ${remoteCases.length}/${remoteAssets.length}`
            : "后端没有返回 ai-video-showcase 共享案例。",
          tone: videoCases.length ? "ready" : "warning",
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        const mergedSite = mergeWithSharedDressingkitVideoSite(null);
        const cases = Array.isArray(mergedSite.cases) ? mergedSite.cases : [];
        const assets = Array.isArray(mergedSite.assets) ? mergedSite.assets : [];
        const videoCases = cases.filter(isVideoShowcaseBackendCase);
        setBackendCases(videoCases);
        setBackendAssets(assets);
        setFeatureUiConfig(readFeatureUiConfig(mergedSite));
        setBackendStatus(videoCases.length ? "ready" : "error");
        setBackendMessage(
          `后端读取失败，已使用内置通用 AI 视频素材。${error instanceof Error ? error.message : "读取公共配置时发生未知错误。"}`,
        );
        appendHistory({
          title: "已启用内置通用 AI 视频案例清单",
          detail: `${videoCases.length} 组案例 · ${assets.length} 个资产`,
          tone: videoCases.length ? "ready" : "blocked",
        });
      });
    return () => controller.abort();
  }, [authState]);

  const backendCards = useMemo(
    () => buildBackendCards(backendCases, backendAssets),
    [backendAssets, backendCases],
  );
  const featureUiById = useMemo(() => indexFeatureUiById(featureUiConfig), [featureUiConfig]);
  const faceMaterialPreviewUrls = useMemo(
    () => DRESSINGKIT_VIDEO_FACE_MATERIALS.map((item) => rendererPublicAssetUrl(item.imagePath)),
    [],
  );
  const visibleCards = backendCards.filter(
    (item) =>
      item.featureId === activeFeatureId &&
      (selectedIndustry === "全部" || item.industry === selectedIndustry),
  );
  const totalAssetCount = backendCards.reduce((total, item) => total + item.assets.length, 0);
  const featureCaseCount = backendCards.filter((item) => item.featureId === activeFeatureId).length;
  const featureLabel = activeFeature.title;
  const activeImageRefs = exampleImageRefs ?? productImageRefs;
  const activeVideoRefs = exampleVideoRefs ?? videoAssetRefs;
  const activeAudioRefs = exampleAudioRefs ?? audioAssetRefs;
  const featureVideoRefs = activeFeatureId === "omni-video" ? activeVideoRefs : [];
  const featureAudioRefs = activeFeatureId !== "storyboard" ? activeAudioRefs : [];
  const uploadCount = activeImageRefs.length + featureVideoRefs.length + featureAudioRefs.length;
  const selectedCaseInputAssetCount = selectedCase?.featureId === activeFeatureId
    ? assetsForRole(selectedCase, "input").length
    : 0;
  const canGenerateFromPromptOnly = activeFeatureId === "smart-video" && Boolean(selectedCase) && selectedCaseInputAssetCount === 0;
  const assistantMediaRefs = useMemo(
    () => uniqueRefs([...activeImageRefs, ...featureVideoRefs, ...featureAudioRefs], 8),
    [activeAudioRefs, activeImageRefs, featureAudioRefs, featureVideoRefs],
  );
  const assistantMediaRefsKey = assistantMediaRefs.join("|");
  const promptListDefaultRows = useMemo(
    () => VIDEO_FEATURES
      .filter((feature) => {
        const query = promptListQuery.trim();
        const prompt = DEFAULT_PROMPTS[feature.id];
        if (!query) return true;
        return feature.title.includes(query) || prompt.includes(query);
      })
      .map((feature): [VideoShowcaseFeatureId, string] => [feature.id, DEFAULT_PROMPTS[feature.id]]),
    [promptListQuery],
  );
  const promptListSavedRows = useMemo(
    () => savedPromptTemplates.filter((template) => {
      const query = promptListQuery.trim();
      if (!query) return true;
      return template.title.includes(query) || template.featureTitle.includes(query) || template.prompt.includes(query);
    }),
    [promptListQuery, savedPromptTemplates],
  );
  const selectedPromptListTemplate = savedPromptTemplates.find((template) => template.id === promptListEditingId) || null;
  const promptListVisibleRowCount =
    (promptListKind !== "saved" ? promptListDefaultRows.length : 0) +
    (promptListKind !== "default" ? promptListSavedRows.length : 0);
  const resultRefs = mediaResult?.assetRefs ?? [];
  const resultMessage = mediaResult && mediaResult.status !== "succeeded" ? mediaResult.message : "";
  const latestResultKey = mediaResult
    ? `${mediaResult.logId}:${mediaResult.status}:${mediaResult.assetRefs.join("|")}`
    : "";
  const visibleHistoryEntries = useMemo(
    () => mergeVideoHistoryEntries(historyEntries, logs),
    [historyEntries, logs],
  );
  const relatedAgentSessions = useMemo(
    () => agentPromptSessions.filter((session) =>
      session.purpose === "video" &&
      (session.userIntent.includes(VIDEO_SHOWCASE_AGENT_SOURCE) || session.title.includes("视频提示词助手")),
    ),
    [agentPromptSessions],
  );
  const activeAgentSession =
    relatedAgentSessions.find((session) => session.id === activeAgentPromptSessionId) ??
    relatedAgentSessions.find((session) => session.title.includes(activeFeature.title)) ??
    relatedAgentSessions[0];
  const canRunPromptAssistantAgent = workspaceReady && !busy && assistantAgentMessage.trim().length > 0;
  const promptAssistantAgentSteps: AgentExecutionStep[] = [
    {
      key: "context",
      title: "读取素材",
      detail: uploadCount ? `${uploadCount} 个素材` : "未上传素材",
      state: uploadCount ? "done" : canGenerateFromPromptOnly ? "idle" : "blocked",
    },
    {
      key: "feature",
      title: "确认功能",
      detail: activeFeature.title,
      state: activeFeature ? "done" : "blocked",
    },
    {
      key: "dialog",
      title: "协作打磨",
      detail: activeAgentSession ? `${activeAgentSession.messages.length} 条消息` : "待开始",
      state: busy && activeDialog === "prompt-assistant" ? "active" : activeAgentSession ? "done" : "idle",
    },
    {
      key: "result",
      title: "确认提示词",
      detail: assistantResult.trim() ? "已有可编辑结果" : "待确认",
      state: assistantResult.trim() ? "active" : "idle",
    },
  ];

  useEffect(() => {
    onClearResult();
  }, []);

  useEffect(() => {
    if (!mediaResult) return;
    completePendingGeneration(mediaResult);
  }, [latestResultKey]);

  useEffect(() => {
    if (activeDialog !== "prompt-list" || !promptListFormMode) return;
    setPromptListDraftMediaRefs((current) =>
      uniqueRefs([...current, ...assistantMediaRefs], 8),
    );
  }, [activeDialog, assistantMediaRefsKey, promptListFormMode]);

  function persistPromptTemplates(nextTemplates: SavedVideoPromptTemplate[]): void {
    const normalized = nextTemplates.slice(0, 24);
    setSavedPromptTemplates(normalized);
    writeSavedVideoPromptTemplates(normalized);
  }

  function savePromptTemplate(
    prompt: string,
    title?: string,
    templateId = editingTemplateId,
    mediaRefs?: string[],
  ): SavedVideoPromptTemplate | null {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return null;
    const now = new Date().toISOString();
    const draftTitle = title?.trim() || `${activeFeature.title} · 视频提示词`;
    const normalizedMediaRefs = mediaRefs?.filter(Boolean).slice(0, 8);
    let saved: SavedVideoPromptTemplate;
    if (templateId) {
      const existing = savedPromptTemplates.find((item) => item.id === templateId);
      saved = {
        id: templateId,
        title: draftTitle,
        featureId: activeFeatureId,
        featureTitle: activeFeature.title,
        prompt: trimmedPrompt,
        mediaRefs: mediaRefs === undefined
          ? existing?.mediaRefs
          : normalizedMediaRefs?.length
          ? normalizedMediaRefs
          : undefined,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      persistPromptTemplates([saved, ...savedPromptTemplates.filter((item) => item.id !== templateId)]);
    } else {
      saved = {
        id: historyId(),
        title: draftTitle,
        featureId: activeFeatureId,
        featureTitle: activeFeature.title,
        prompt: trimmedPrompt,
        mediaRefs: normalizedMediaRefs?.length ? normalizedMediaRefs : undefined,
        createdAt: now,
        updatedAt: now,
      };
      persistPromptTemplates([saved, ...savedPromptTemplates]);
    }
    setTemplateDraftTitle(saved.title);
    setEditingTemplateId(saved.id);
    appendHistory({
      title: templateId ? `已更新视频提示词模板：${saved.title}` : `已保存视频提示词模板：${saved.title}`,
      detail: saved.prompt.slice(0, 90),
      tone: "ready",
    });
    return saved;
  }

  function applyPromptTemplateMedia(mediaRefs?: string[]): void {
    const refs = uniqueRefs(mediaRefs || [], 8);
    if (!refs.length) return;
    setExampleImageRefs(refs.filter((ref) => previewKindFromRef(ref) === "image").slice(0, 7));
    setExampleVideoRefs(refs.filter((ref) => previewKindFromRef(ref) === "video").slice(0, 3));
    setExampleAudioRefs(refs.filter(isAudioRef).slice(0, 1));
    setGenerationValidationMessage("");
  }

  function applySavedPromptTemplate(template: SavedVideoPromptTemplate, closeDialog = true): void {
    setActiveFeatureId(template.featureId);
    setPromptDraft(template.prompt);
    setAssistantInput(template.prompt);
    setAssistantResult(template.prompt);
    setTemplateDraftTitle(template.title);
    setEditingTemplateId(template.id);
    applyPromptTemplateMedia(template.mediaRefs);
    appendHistory({
      title: `已应用视频模板：${template.title}`,
      detail: template.mediaRefs?.length ? `${template.featureTitle} · 已带入 ${template.mediaRefs.length} 个素材` : template.featureTitle,
      tone: "ready",
    });
    if (closeDialog) setActiveDialog(null);
  }

  function editSavedPromptTemplate(template: SavedVideoPromptTemplate): void {
    setAssistantTemplatesOpen(true);
    setTemplateDraftTitle(template.title);
    setEditingTemplateId(template.id);
    setAssistantInput(template.prompt);
    setAssistantResult(template.prompt);
    setActiveFeatureId(template.featureId);
  }

  function deleteSavedPromptTemplate(templateId: string): void {
    const template = savedPromptTemplates.find((item) => item.id === templateId);
    persistPromptTemplates(savedPromptTemplates.filter((item) => item.id !== templateId));
    if (editingTemplateId === templateId) {
      setEditingTemplateId("");
      setTemplateDraftTitle("");
    }
    appendHistory({
      title: template ? `已删除视频模板：${template.title}` : "已删除视频提示词模板",
      detail: "模板列表已更新。",
      tone: "idle",
    });
  }

  function saveCurrentPromptAsTemplate(): void {
    const template = savePromptTemplate(
      promptDraft,
      `${activeFeature.title} · 视频提示词`,
      "",
      assistantMediaRefs.length ? assistantMediaRefs : undefined,
    );
    if (!template) return;
    setPromptListDraftTitle(template.title);
    setPromptListDraftPrompt(template.prompt);
    setPromptListEditingId(template.id);
    setPromptListDefaultFeatureId("");
    setPromptListDraftMediaRefs(template.mediaRefs || []);
    setPromptListKind("saved");
    setActiveDialog("prompt-list");
  }

  function openPromptAssistant(tab: VideoPromptAssistantTab = "text"): void {
    setAssistantTab(tab);
    setAssistantInput(promptDraft);
    setAssistantResult("");
    setAssistantTemplatesOpen(false);
    setTemplateDraftTitle(`${activeFeature.title} · 视频提示词`);
    setEditingTemplateId("");
    setActiveDialog("prompt-assistant");
  }

  function openPromptListDialog(): void {
    setPromptListKind("all");
    setPromptListQuery("");
    setPromptListDraftTitle(`${activeFeature.title} · 视频提示词`);
    setPromptListDraftPrompt(promptDraft);
    setPromptListEditingId("");
    setPromptListDefaultFeatureId(activeFeatureId);
    setPromptListDraftMediaRefs(assistantMediaRefs);
    setPromptListFormMode(null);
    setActiveDialog("prompt-list");
  }

  function startPromptListCreate(): void {
    setPromptListDraftTitle(`${activeFeature.title} · 视频提示词`);
    setPromptListDraftPrompt(promptDraft);
    setPromptListEditingId("");
    setPromptListDefaultFeatureId("");
    setPromptListDraftMediaRefs(assistantMediaRefs);
    setPromptListFormMode("create");
  }

  function startPromptListEdit(template: SavedVideoPromptTemplate): void {
    setPromptListDraftTitle(template.title);
    setPromptListDraftPrompt(template.prompt);
    setPromptListEditingId(template.id);
    setPromptListDefaultFeatureId("");
    setPromptListDraftMediaRefs(template.mediaRefs || []);
    setPromptListFormMode("edit");
    setActiveFeatureId(template.featureId);
  }

  function selectPromptListDefault(featureId: VideoShowcaseFeatureId, prompt: string): void {
    setActiveFeatureId(featureId);
    setPromptListDraftTitle(`默认视频提示词 · ${featureTitleForPromptTemplate(featureId)}`);
    setPromptListDraftPrompt(prompt);
    setPromptListEditingId("");
    setPromptListDefaultFeatureId(featureId);
    setPromptListDraftMediaRefs([]);
  }

  function savePromptListDraft(): void {
    const template = savePromptTemplate(
      promptListDraftPrompt || promptDraft,
      promptListDraftTitle || `${activeFeature.title} · 视频提示词`,
      promptListEditingId,
      promptListDraftMediaRefs,
    );
    if (!template) return;
    setPromptListDraftTitle(template.title);
    setPromptListDraftPrompt(template.prompt);
    setPromptListEditingId(template.id);
    setPromptListDefaultFeatureId("");
    setPromptListDraftMediaRefs(template.mediaRefs || []);
    setPromptListKind("saved");
    setPromptListFormMode(null);
  }

  function deletePromptListDraft(): void {
    if (!promptListEditingId) return;
    deleteSavedPromptTemplate(promptListEditingId);
    setPromptListEditingId("");
    setPromptListDraftTitle("");
    setPromptListDraftPrompt(promptDraft);
    setPromptListDraftMediaRefs(assistantMediaRefs);
    setPromptListFormMode(null);
  }

  function cancelPromptListForm(): void {
    setPromptListFormMode(null);
    setPromptListDraftTitle("");
    setPromptListDraftPrompt(promptDraft);
    setPromptListDraftMediaRefs(assistantMediaRefs);
  }

  function queryPromptList(): void {
    appendHistory({
      title: "已查询视频提示词列表",
      detail: promptListQuery.trim() || "全部模板",
      tone: "idle",
    });
  }

  function confirmPromptList(): void {
    const nextPrompt = promptListDraftPrompt.trim();
    if (nextPrompt) {
      setPromptDraft(nextPrompt);
    }
    if (promptListEditingId) {
      applyPromptTemplateMedia(promptListDraftMediaRefs);
      savePromptListDraft();
      const templateImageRefs = promptListDraftMediaRefs.filter((ref) => previewKindFromRef(ref) === "image").slice(0, 7);
      const templateVideoRefs = promptListDraftMediaRefs.filter((ref) => previewKindFromRef(ref) === "video").slice(0, 3);
      const templateAudioRefs = promptListDraftMediaRefs.filter(isAudioRef).slice(0, 1);
      onUsePromptInVideo(buildVideoHandoff({
        prompt: nextPrompt,
        imageRefs: templateImageRefs.length ? templateImageRefs : undefined,
        videoRefs: templateVideoRefs.length ? templateVideoRefs : undefined,
        audioRefs: templateAudioRefs.length ? templateAudioRefs : undefined,
      }));
    } else if (!promptListDefaultFeatureId && nextPrompt && nextPrompt !== promptDraft.trim()) {
      savePromptListDraft();
      onUsePromptInVideo(buildVideoHandoff({ prompt: nextPrompt }));
    } else if (nextPrompt) {
      onUsePromptInVideo(buildVideoHandoff({ prompt: nextPrompt }));
    }
    appendHistory({
      title: promptListEditingId ? "已确认视频提示词模板" : "已确认视频提示词",
      detail: nextPrompt.slice(0, 90),
      tone: "ready",
    });
    setActiveDialog(null);
  }

  function removePromptListMediaRef(ref: string): void {
    setPromptListDraftMediaRefs((current) => current.filter((item) => item !== ref));
  }

  function addPromptListMediaRefs(): void {
    setPromptListDraftMediaRefs((current) => uniqueRefs([...current, ...assistantMediaRefs], 8));
  }

  function expandPromptWithCurrentContext(): void {
    const nextPrompt = buildVideoExpandedPrompt({
      basePrompt: promptDraft,
      feature: activeFeature,
      selectedCase,
      imageCount: activeImageRefs.length,
      videoCount: featureVideoRefs.length,
      audioCount: featureAudioRefs.length,
      duration: videoDuration,
      resolution: videoResolution,
      size: videoSize,
      storyboardCount,
      storyboardRatio,
      storyboardQuality,
      mode: "text",
    });
    setPromptDraft(nextPrompt);
    appendHistory({
      title: "视频提示词智能扩写已完成",
      detail: `${activeFeature.title} · ${selectedCase?.title || "当前素材"}`,
      tone: "ready",
    });
  }

  function generateAssistantPrompt(): void {
    const nextPrompt = buildVideoExpandedPrompt({
      basePrompt: assistantInput || promptDraft,
      feature: activeFeature,
      selectedCase,
      imageCount: activeImageRefs.length,
      videoCount: featureVideoRefs.length,
      audioCount: featureAudioRefs.length,
      duration: videoDuration,
      resolution: videoResolution,
      size: videoSize,
      storyboardCount,
      storyboardRatio,
      storyboardQuality,
      mode: assistantTab,
    });
    setAssistantResult(nextPrompt);
    appendHistory({
      title: assistantTab === "reverse" ? "视频素材反推提示词已生成" : "视频文本提示词已生成",
      detail: nextPrompt.slice(0, 90),
      tone: "ready",
    });
  }

  function confirmAssistantPrompt(): void {
    const nextPrompt = (assistantResult || assistantInput).trim();
    if (nextPrompt) {
      setPromptDraft(nextPrompt);
      onUsePromptInVideo(buildVideoHandoff({ prompt: nextPrompt }));
      appendHistory({
        title: "已确认视频提示词助手结果",
        detail: nextPrompt.slice(0, 90),
        tone: "ready",
      });
    }
    setActiveDialog(null);
  }

  function buildPromptAssistantAgentIntent(message: string): string {
    const draftPrompt = (assistantResult || assistantInput || promptDraft).trim();
    const mediaRefs = assistantMediaRefs.length
      ? assistantMediaRefs.map((ref, index) => `- 素材${index + 1}（${previewKindFromRef(ref)}）：${ref}`).join("\n")
      : "- 未上传素材";
    return [
      `来源页面：${VIDEO_SHOWCASE_AGENT_SOURCE}`,
      `任务：围绕「${activeFeature.title}」打磨可交付视频提示词。`,
      "",
      "用户本轮要求：",
      message.trim(),
      "",
      "当前业务上下文：",
      `- 行业：${selectedIndustry}`,
      `- 功能：${activeFeature.title}`,
      `- 时长：${videoDuration}`,
      `- 分辨率：${videoResolution}`,
      `- 画幅：${activeFeatureId === "storyboard" ? storyboardRatio : videoSize}`,
      activeFeatureId === "storyboard" ? `- 分镜数量：${storyboardCount}` : "",
      activeFeatureId === "storyboard" ? `- 分镜质量：${storyboardQuality}` : "",
      selectedCase ? `- 参考案例：${selectedCase.title} / ${selectedCase.industry}` : "",
      "",
      "当前素材引用：",
      mediaRefs,
      "",
      "当前提示词草稿：",
      draftPrompt || "暂无提示词草稿。",
      "",
      "输出要求：如果素材不足，先明确需要补充的图片、视频或音频；如果可以生成，输出完整中文视频提示词，并保留主体、镜头、动作、节奏、卖点和合规边界。",
    ].filter(Boolean).join("\n");
  }

  function startPromptAssistantAgent(): void {
    if (!canRunPromptAssistantAgent) return;
    onStartAgentSession({
      title: `视频提示词助手 · ${activeFeature.title}`,
      purpose: "video",
      userIntent: buildPromptAssistantAgentIntent(assistantAgentMessage),
      inputSourceIds: [],
      textModel,
    });
  }

  function continuePromptAssistantAgent(): void {
    if (!activeAgentSession || !canRunPromptAssistantAgent) return;
    onContinueAgentSession({
      sessionId: activeAgentSession.id,
      message: [
        assistantAgentMessage.trim(),
        "",
        "当前页面上下文仍以以下提示词和素材为准：",
        (assistantResult || assistantInput || promptDraft).trim() || "暂无提示词草稿。",
        "",
        `素材数量：${assistantMediaRefs.length} 个；功能：${activeFeature.title}；时长：${videoDuration}；分辨率：${videoResolution}。`,
      ].join("\n"),
      textModel,
    });
  }

  function renderPromptAssistantAgentPanel(): ReactNode {
    const artifactPrompt = (assistantResult || assistantInput || promptDraft).trim();
    const context = (
      <>
        <div className="agent-turn-head">
          <strong>{activeFeature.title}</strong>
          <small>{uploadCount} 个素材 / {videoDuration} / {videoResolution}</small>
        </div>
        <div className="prompt-agent-context-note">
          {selectedCase ? `参考案例：${selectedCase.title}` : "未绑定参考案例"} · {textModel ? `模型：${textModel}` : "使用全局文字模型"}
        </div>
      </>
    );
    const artifact = artifactPrompt ? (
      <>
        <div className="agent-turn-head">
          <strong>当前视频提示词</strong>
          <small>{assistantResult.trim() ? "助手结果" : "页面草稿"}</small>
        </div>
        <div className="agent-claw-draft-editor">
          <label>
            <span>输入提示词</span>
            <textarea
              value={assistantInput}
              onChange={(event) => setAssistantInput(event.target.value)}
              placeholder="请输入要扩写或优化的视频提示词。"
            />
          </label>
          <label>
            <span>生成结果</span>
            <textarea
              value={assistantResult}
              onChange={(event) => setAssistantResult(event.target.value)}
              placeholder="开始协作或本地扩写后，这里会出现可编辑结果。"
            />
          </label>
        </div>
        <details className="agent-turn-details">
          <summary>查看提示词内容</summary>
          <pre>{artifactPrompt}</pre>
        </details>
      </>
    ) : null;
    const footer = (
      <>
        <label className="prompt-session-adjustment">
          <span>{activeAgentSession ? "继续调整" : "这次任务"}</span>
          <textarea
            value={assistantAgentMessage}
            onChange={(event) => setAssistantAgentMessage(event.target.value)}
          />
        </label>
        <div className="scene-agent-turn-actions">
          <button
            type="button"
            className="primary small"
            disabled={!canRunPromptAssistantAgent}
            onClick={activeAgentSession ? continuePromptAssistantAgent : startPromptAssistantAgent}
          >
            {activeAgentSession ? "继续协作" : "开始协作"}
          </button>
          <button type="button" className="ghost small" onClick={generateAssistantPrompt} disabled={busy}>
            本地扩写
          </button>
          <button type="button" className="ghost small" onClick={openPromptListDialog}>
            模板列表
          </button>
          <button
            type="button"
            className="ghost small"
            onClick={() => savePromptTemplate(
              assistantResult || assistantInput || promptDraft,
              templateDraftTitle,
              editingTemplateId,
              assistantMediaRefs.length ? assistantMediaRefs : undefined,
            )}
            disabled={!artifactPrompt}
          >
            保存模板
          </button>
          <button type="button" className="ghost small" onClick={confirmAssistantPrompt} disabled={!artifactPrompt}>
            应用提示词
          </button>
        </div>
      </>
    );
    return (
      <div className="ai-assistant-agent-panel">
        <AgentSessionPanel
          variant="claw"
          eyebrow="提示词助手"
          title={activeAgentSession?.title ?? `视频提示词协作 · ${activeFeature.title}`}
          session={activeAgentSession}
          sessions={relatedAgentSessions}
          statusLabel={activeAgentSession ? AGENT_SESSION_STATUS_LABELS[activeAgentSession.status] : "待开始"}
          steps={activeAgentSession || busy ? promptAssistantAgentSteps : []}
          runningLabel={busy && activeDialog === "prompt-assistant" ? "正在处理视频提示词。" : undefined}
          transcriptLabel={activeFeature.title}
          context={context}
          artifact={artifact}
          footer={footer}
          empty={(
            <>
              <strong>当前视频提示词尚未进入协作</strong>
              <span>开始协作后，会在这里记录多轮消息、执行事实和生成草稿。</span>
            </>
          )}
          onSelectSession={onSelectAgentSession}
          onResolveAction={onResolveAgentAction}
        />
      </div>
    );
  }

  function selectFeature(featureId: VideoShowcaseFeatureId): void {
    const feature = FEATURE_BY_ID.get(featureId) || VIDEO_FEATURES[0];
    setActiveFeatureId(feature.id);
    setActiveMainTab("features");
    setSelectedIndustry("全部");
    setExampleImageRefs(null);
    setExampleVideoRefs(null);
    setExampleAudioRefs(null);
    setSelectedCase(null);
    setGenerationValidationMessage("");
    const featurePrompt = DEFAULT_PROMPTS[feature.id];
    setPromptDraft((currentPrompt) => {
      const current = currentPrompt.trim();
      if (!current) return featurePrompt;
      if (DEFAULT_PROMPT_VALUES.has(current)) return featurePrompt;
      return currentPrompt;
    });
    appendHistory({
      title: `已切换功能：${feature.title}`,
      detail: featurePrompt.slice(0, 90),
      tone: "idle",
    });
  }

  function applyCase(item: VideoShowcaseCase): void {
    onClearResult();
    setGenerationValidationMessage("");
    setSelectedCase(item);
    setActiveFeatureId(item.featureId);
    setActiveMainTab("features");
    const nextPrompt = item.prompt.trim() || DEFAULT_PROMPTS[item.featureId];
    const inputAssets = assetsForRole(item, "input");
    const nextImageRefs = uniqueRefs(
      inputAssets.filter((asset) => asset.kind === "image").map((asset) => asset.url),
      7,
    );
    const nextVideoRefs = uniqueRefs(
      inputAssets.filter((asset) => asset.kind === "video").map((asset) => asset.url),
      3,
    );
    const nextFeature = FEATURE_BY_ID.get(item.featureId) || activeFeature;
    setExampleImageRefs(nextImageRefs);
    setExampleVideoRefs(nextVideoRefs);
    setExampleAudioRefs([]);
    setPromptDraft(nextPrompt);
    onUsePromptInVideo(buildVideoHandoff({
      prompt: nextPrompt,
      feature: nextFeature,
      imageRefs: nextImageRefs,
      videoRefs: nextVideoRefs,
      selectedCaseTitle: item.title,
    }));
    appendHistory({
      title: `已套用视频案例：${item.title}`,
      detail: nextPrompt.slice(0, 100),
      tone: "ready",
    });
  }

  function sendHistoryToMaterialLibrary(entry: HistoryEntry, refs: string[]): void {
    const createdAt = new Date().toISOString();
    const nextEntries = refs.map((ref, index): VideoMaterialEntry => ({
      id: `history-${entry.id}-${index + 1}-${createdAt}`,
      kind: previewKindFromRef(ref) === "video" ? "video" : "image",
      actor: "virtual",
      status: "reported",
      title: `${entry.jobType || entry.featureTitle || entry.title || "历史素材"} ${index + 1}`,
      ref,
      createdAt,
    }));
    if (!nextEntries.length) return;
    setMaterialEntries((current) => [...nextEntries, ...current].slice(0, 48));
    setMaterialKind(nextEntries[0].kind);
    setMaterialStatus("all");
    setActiveMainTab("materials");
    setActiveDialog(null);
  }

  function startPartialRetouchFromHistory(entry: HistoryEntry, refs: string[]): void {
    const outputRefs = imageRefsOnly(refs).slice(0, 10);
    if (!outputRefs.length) return;
    onStartPartialRetouch({
      prompt: entry.prompt || entry.detail,
      productImageRefs: outputRefs,
      referenceImageRefs: imageRefsOnly(entry.inputRefs || []).slice(0, 6),
      productImageLabel: "待精修图",
      referenceImageLabel: "视频参考图",
      featureId: "partial-retouch",
      featureTitle: "局部精修",
      outputRefs,
      sourceLogId: entry.logId,
      sourceTitle: entry.jobType || entry.featureTitle || entry.title,
    });
    setActiveDialog(null);
  }

  function buildVideoHandoff(input?: {
    prompt?: string;
    feature?: VideoShowcaseFeature;
    imageRefs?: string[];
    videoRefs?: string[];
    audioRefs?: string[];
    selectedCaseTitle?: string;
  }): ShowcaseVideoHandoff {
    const feature = input?.feature || activeFeature;
    const prompt = (input?.prompt ?? promptDraft).trim();
    const imageRefs = input?.imageRefs ?? activeImageRefs;
    const videoRefs = feature.id === "omni-video" ? input?.videoRefs ?? featureVideoRefs : [];
    const audioRefs = input?.audioRefs ?? featureAudioRefs;
    return {
      prompt,
      imageAssetRefs: uniqueRefs(imageRefs, 7),
      videoAssetRefs: uniqueRefs(videoRefs, 3),
      audioAssetRefs: feature.id === "storyboard" ? [] : uniqueRefs(audioRefs, 1),
      featureId: feature.id,
      featureTitle: feature.title,
      durationSeconds: feature.id === "storyboard" ? 5 : secondsFromDuration(videoDuration),
      aspectRatio: feature.id === "storyboard" ? aspectRatioFromVideoSize(storyboardRatio) : aspectRatioFromVideoSize(videoSize),
      resolution: feature.id === "storyboard" ? storyboardQuality : videoResolution,
      storyboardCount: feature.id === "storyboard" ? storyboardCount : undefined,
      quality: feature.id === "storyboard" ? storyboardQuality : undefined,
      selectedCaseTitle: input?.selectedCaseTitle ?? selectedCase?.title,
    };
  }

  function startGenerate(): void {
    const prompt = promptDraft.trim();
    if (!prompt) return;
    if (activeFeatureId === "storyboard" && !activeImageRefs.length) {
      setGenerationValidationMessage("请先上传图片");
      return;
    }
    if (activeFeatureId === "smart-video" && !activeImageRefs.length && !canGenerateFromPromptOnly) {
      setGenerationValidationMessage("请先上传图片");
      return;
    }
    if (activeFeatureId === "omni-video" && !activeImageRefs.length && !featureVideoRefs.length) {
      setGenerationValidationMessage("请先上传图片或视频");
      return;
    }
    setGenerationValidationMessage("");
    onClearResult();
    setActiveMainTab("results");
    setSubmittedGeneration(true);
    rememberPendingGeneration({
      title: `提交 AI 视频生成：${activeFeature.title}`,
      prompt,
      inputRefs: [...activeImageRefs, ...featureVideoRefs, ...featureAudioRefs],
      featureTitle: activeFeature.title,
      jobType: activeFeature.title,
    });
    onGenerateVideo(buildVideoHandoff({ prompt }));
  }

  function selectImageUpload(): void {
    setGenerationValidationMessage("");
    setExampleImageRefs(null);
    onSelectProductImages();
  }

  function selectVideoUpload(): void {
    setGenerationValidationMessage("");
    setExampleVideoRefs(null);
    onSelectVideo();
  }

  function selectAudioUpload(): void {
    setGenerationValidationMessage("");
    setExampleAudioRefs(null);
    onSelectAudio();
  }

  function removeImageRef(ref: string): void {
    if (exampleImageRefs !== null) {
      setExampleImageRefs((current) => (current ?? []).filter((item) => item !== ref));
      onRemoveProductImageRef(ref);
      return;
    }
    onRemoveProductImageRef(ref);
  }

  function removeVideoRef(ref: string): void {
    if (exampleVideoRefs !== null) {
      setExampleVideoRefs((current) => (current ?? []).filter((item) => item !== ref));
      onRemoveVideoAssetRef(ref);
      return;
    }
    onRemoveVideoAssetRef(ref);
  }

  function removeAudioRef(ref: string): void {
    if (exampleAudioRefs !== null) {
      setExampleAudioRefs((current) => (current ?? []).filter((item) => item !== ref));
      onRemoveAudioAssetRef(ref);
      return;
    }
    onRemoveAudioAssetRef(ref);
  }

  function openMaterialLibrary(): void {
    setMaterialKind("image");
    setMaterialStatus("all");
    setActiveMainTab("materials");
    setActiveDialog(null);
  }

  function openMaterialUpload(): void {
    setMaterialUploadDraft({
      kind: materialKind,
      actor: materialActor,
      title: "",
      refs: [],
      error: "",
    });
    setActiveDialog("material-upload");
  }

  function addMaterialEntries(
    refs: string[],
    kind: VideoMaterialKind,
    actor: VideoMaterialActor,
    title: string,
    status: VideoMaterialStatus,
  ): void {
    const nextEntries = uniqueRefs(refs, kind === "image" ? 12 : 1).map((ref, index) => ({
      id: `video-material-${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`,
      kind,
      actor,
      status,
      title: title.trim() || defaultMaterialTitle(ref, kind),
      ref,
      createdAt: new Date().toISOString(),
    }));
    if (!nextEntries.length) return;
    setMaterialEntries((current) => [...nextEntries, ...current].slice(0, 80));
    appendHistory({
      title: kind === "image" ? "已新增图片素材" : "已提交素材审核",
      detail: `${materialKindLabel(kind)} · ${materialActorLabel(actor)} · ${nextEntries.length} 个文件`,
      tone: status === "reported" ? "ready" : "warning",
    });
  }

  async function selectMaterialUploadFiles(): Promise<void> {
    if (!materialUploadDraft) return;
    const paths = await onSelectMaterialFiles(assetKindForMaterial(materialUploadDraft.kind));
    if (!paths.length) return;
    if (materialUploadDraft.kind === "image") {
      addMaterialEntries(paths, materialUploadDraft.kind, materialUploadDraft.actor, "", "reported");
      setActiveDialog(null);
      setMaterialUploadDraft(null);
      return;
    }
    setMaterialUploadDraft((current) => {
      if (!current) return current;
      const refs = uniqueRefs([...current.refs, ...paths], 1);
      return {
        ...current,
        refs,
        title: current.title || defaultMaterialTitle(paths[0], current.kind),
        error: "",
      };
    });
  }

  function dropMaterialUploadRefs(refs: string[]): void {
    if (!materialUploadDraft || !refs.length) return;
    if (materialUploadDraft.kind === "image") {
      addMaterialEntries(refs, materialUploadDraft.kind, materialUploadDraft.actor, "", "reported");
      setActiveDialog(null);
      setMaterialUploadDraft(null);
      return;
    }
    setMaterialUploadDraft((current) => {
      if (!current) return current;
      const nextRefs = uniqueRefs([...current.refs, ...refs], 1);
      return {
        ...current,
        refs: nextRefs,
        title: current.title || defaultMaterialTitle(nextRefs[0], current.kind),
        error: "",
      };
    });
  }

  function submitMaterialUpload(): void {
    if (!materialUploadDraft) return;
    if (!materialUploadDraft.refs.length) {
      setMaterialUploadDraft({ ...materialUploadDraft, error: "请先上传素材文件。" });
      return;
    }
    if (materialUploadDraft.kind !== "image" && !materialUploadDraft.title.trim()) {
      setMaterialUploadDraft({ ...materialUploadDraft, error: "请输入素材名称。" });
      return;
    }
    addMaterialEntries(
      materialUploadDraft.refs,
      materialUploadDraft.kind,
      materialUploadDraft.actor,
      materialUploadDraft.title,
      materialUploadDraft.kind === "image" ? "reported" : "reviewing",
    );
    setMaterialStatus(materialUploadDraft.kind === "image" ? "all" : "reviewing");
    setActiveDialog(null);
    setMaterialUploadDraft(null);
  }

  function useMaterialEntry(entry: VideoMaterialEntry): void {
    if (entry.kind === "image") {
      setExampleImageRefs((current) => uniqueRefs([entry.ref, ...(current ?? activeImageRefs)], 7));
    }
    if (entry.kind === "video") {
      setActiveFeatureId("omni-video");
      setExampleVideoRefs((current) => uniqueRefs([entry.ref, ...(current ?? activeVideoRefs)], 3));
    }
    if (entry.kind === "audio") {
      setExampleAudioRefs([entry.ref]);
    }
    setActiveMainTab("features");
    appendHistory({
      title: `已使用素材库${materialKindLabel(entry.kind)}`,
      detail: entry.title,
      tone: entry.status === "rejected" ? "blocked" : "ready",
    });
  }

  const uploadButtons = [
    {
      id: "image",
      label: "上传图片",
      helper: activeImageRefs.length ? `${activeImageRefs.length} 张已选` : "图片 1-7 张",
      onClick: selectImageUpload,
      enabled: true,
    },
    activeFeatureId === "omni-video"
      ? {
          id: "video",
          label: "上传视频",
          helper: activeVideoRefs.length ? `${activeVideoRefs.length} 条已选` : "视频 15.1 秒内",
          onClick: selectVideoUpload,
          enabled: true,
        }
      : null,
    activeFeatureId !== "storyboard"
      ? {
          id: "audio",
          label: "上传音频",
          helper: featureAudioRefs.length ? `${featureAudioRefs.length} 条已选` : "音频 15.1 秒内",
          onClick: selectAudioUpload,
          enabled: true,
        }
      : null,
  ].filter((item): item is { id: string; label: string; helper: string; onClick: () => void; enabled: boolean } => Boolean(item));

  return (
    <div className="ai-video-showcase-shell" data-feature={activeFeatureId}>
      <aside className="ai-video-left">
        <section className="ai-video-panel scene-panel">
          <div className="ai-video-scene-heading">
            <span>选择场景</span>
            <h2>（{featureLabel}）</h2>
          </div>
          <button
            type="button"
            className="ai-video-scene-selector"
            onClick={() => {
              setActiveMainTab("features");
              setActiveDialog(null);
            }}
          >
            <FeatureButtonIcon iconKey={iconKeyForFeature(activeFeature, featureUiById)} />
            <strong>选择功能</strong>
            <span aria-hidden="true">›</span>
          </button>
        </section>

        <section className="ai-video-panel ai-video-upload-panel">
          <div className="ai-video-upload-grid">
            {uploadButtons.map((item) => (
              <button
                key={item.id}
                type="button"
                className="ai-video-upload-card"
                onClick={item.onClick}
              >
                <span className="ai-video-upload-card-icon" aria-hidden="true">
                  {item.id === "audio" ? "♪" : "↥"}
                </span>
                <strong>{item.label}</strong>
              </button>
            ))}
          </div>
          <UploadPreviewStrip
            title="图"
            refs={activeImageRefs}
            kind="image"
            onOpen={setSelectedMedia}
            onRemove={removeImageRef}
          />
          {activeFeatureId === "omni-video" ? (
            <UploadPreviewStrip
              title="视频"
              refs={featureVideoRefs}
              kind="video"
              onOpen={setSelectedMedia}
              onRemove={removeVideoRef}
            />
          ) : null}
          {activeFeatureId !== "storyboard" ? (
            <UploadPreviewStrip
              title="音频"
              refs={featureAudioRefs}
              kind="audio"
              onOpen={setSelectedMedia}
              onRemove={removeAudioRef}
            />
          ) : null}
          {activeFeatureId !== "storyboard" ? (
            <p className="ai-video-muted is-warning">
              {activeFeatureId === "smart-video"
                ? "图片可以上传 1-7 张，音频仅支持 1 条，音频控制在 15.1 秒以内。 不能直接上传人脸照片，需要通过素材库审核去选择。"
                : "图片可上传 1-7 张，视频可上传多个，音频仅支持 1 条，且视频音频都需控制在 15.1 秒内。 不能直接上传人脸照片，需要通过素材库审核去选择。"}
            </p>
          ) : null}
        </section>

        <section className="ai-video-panel ai-video-control-stack">
          {activeFeatureId === "storyboard" ? (
            <div className="ai-video-parameter-panel">
              <div className="ai-video-param-row">
                <span>生图数量</span>
                <div className="ai-video-segment">
                  {STORYBOARD_COUNTS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={storyboardCount === item ? "active" : ""}
                      onClick={() => setStoryboardCount(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ai-video-param-row">
                <span>生图比例</span>
                <select value={storyboardRatio} onChange={(event) => setStoryboardRatio(event.target.value)}>
                  {STORYBOARD_RATIOS.map((item) => (
                    <option key={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="ai-video-param-row">
                <span>图片质量</span>
                <div className="ai-video-segment">
                  {STORYBOARD_QUALITIES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={storyboardQuality === item ? "active" : ""}
                      onClick={() => setStoryboardQuality(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="ai-video-parameter-panel">
              <div className="ai-video-library-entry">
                <span>视频素材库</span>
                <button type="button" className="ai-video-library-entry-card" onClick={openMaterialLibrary}>
                  <span className="ai-video-library-entry-mosaic" aria-hidden="true">
                    {faceMaterialPreviewUrls.map((url, index) => (
                      <img key={`${url}-${index}`} src={url} alt="" loading="lazy" />
                    ))}
                  </span>
                  上传视频中的人脸素材进行报备
                </button>
              </div>
              <div className="ai-video-param-row">
                <span>模型版本</span>
                <select value="Seedance 2.0" disabled>
                  <option>Seedance 2.0</option>
                </select>
              </div>
              <div className="ai-video-param-row">
                <span>视频时长</span>
                <div className="ai-video-segment">
                  {VIDEO_DURATIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={videoDuration === item ? "active" : ""}
                      onClick={() => setVideoDuration(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ai-video-param-row">
                <span>分辨率</span>
                <div className="ai-video-segment">
                  {VIDEO_RESOLUTIONS.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={videoResolution === item ? "active" : ""}
                      onClick={() => setVideoResolution(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
              <div className="ai-video-param-row">
                <span>视频大小（宽*高）</span>
                <select value={videoSize} onChange={(event) => setVideoSize(event.target.value)}>
                  <option>智能</option>
                  <option>9:16</option>
                  <option>16:9</option>
                  <option>1:1</option>
                </select>
              </div>
            </div>
          )}
          <div className="ai-video-section-title">
            <span>提示词</span>
          </div>
          <div className="ai-video-prompt-actions">
            <button type="button" onClick={expandPromptWithCurrentContext}>智能扩写</button>
            <button type="button" onClick={openPromptListDialog}>提示词列表</button>
            <button type="button" onClick={saveCurrentPromptAsTemplate}>保存到模板</button>
          </div>
          <textarea
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            placeholder="描述图片中主体、场景、动作等"
          />
          <button
            type="button"
            className="ai-video-generate-button"
            disabled={busy || !workspaceReady || !promptDraft.trim()}
            onClick={startGenerate}
          >
            开始Ai生成
          </button>
          {generationValidationMessage ? (
            <p className="ai-video-validation-message">{generationValidationMessage}</p>
          ) : null}
          {selectedCase ? (
            <p className="ai-video-muted">当前示例：{selectedCase.title}</p>
          ) : null}
        </section>
      </aside>

      <main className={`ai-video-main ${activeMainTab === "materials" ? "is-material-library" : ""}`}>
        {activeMainTab === "materials" ? (
          <VideoMaterialLibrary
            entries={materialEntries}
            activeKind={materialKind}
            activeActor={materialActor}
            activeStatus={materialStatus}
            onBack={() => setActiveMainTab("features")}
            onKindChange={(kind) => {
              setMaterialKind(kind);
              setMaterialStatus("all");
            }}
            onActorChange={(actor) => {
              setMaterialActor(actor);
              setMaterialStatus("all");
            }}
            onStatusChange={setMaterialStatus}
            onRefresh={() => appendHistory({
              title: "已刷新视频素材库",
              detail: `${materialEntries.length} 个本地素材记录`,
              tone: "idle",
            })}
            onOpenUpload={openMaterialUpload}
            onUse={useMaterialEntry}
            onRemove={(id) => setMaterialEntries((current) => current.filter((item) => item.id !== id))}
            onOpen={setSelectedMedia}
          />
        ) : (
          <>
            <nav className="ai-video-main-tabs" aria-label="AI 视频内容切换">
              <button
                type="button"
                className={activeMainTab === "features" ? "active" : ""}
                onClick={() => setActiveMainTab("features")}
              >
                选择功能
              </button>
              <button
                type="button"
                className={activeMainTab === "results" ? "active" : ""}
                onClick={() => setActiveMainTab("results")}
              >
                生成结果
              </button>
            </nav>

            {activeMainTab === "features" ? (
          <div className="ai-video-feature-content">
            <section className="ai-video-function-board">
              <div className="ai-video-feature-grid">
                {VIDEO_FEATURES.map((feature) => (
                  <button
                    key={feature.id}
                    type="button"
                    className={`ai-video-feature-button ${feature.id === activeFeatureId ? "active" : ""}`}
                    onClick={() => selectFeature(feature.id)}
                  >
                    <FeatureButtonIcon iconKey={iconKeyForFeature(feature, featureUiById)} />
                    <strong>{feature.title}</strong>
                  </button>
                ))}
              </div>
            </section>

            <section className="ai-video-case-board">
              <div className="ai-video-case-heading">
                <div>
                  <span>优秀案例</span>
                  <h2>{featureLabel}</h2>
                </div>
                <p>
                  {backendStatus === "ready"
                    ? `后端素材 ${backendCards.length} 组 · ${totalAssetCount} 个资产 · 当前功能 ${featureCaseCount} 组`
                    : backendStatus === "loading"
                      ? "正在加载后端素材"
                      : backendStatus === "error"
                        ? backendMessage
                        : "后端素材为空"}
                </p>
              </div>

              <div className="ai-video-industry-filter" aria-label="行业筛选">
                {INDUSTRIES.map((industry) => (
                  <button
                    key={industry}
                    type="button"
                    className={selectedIndustry === industry ? "active" : ""}
                    onClick={() => setSelectedIndustry(industry)}
                  >
                    {industry}
                  </button>
                ))}
              </div>

              {visibleCards.length ? (
                <div className="ai-video-case-grid" data-feature={activeFeatureId}>
                  {visibleCards.map((item) => (
                    <VideoCaseCard
                      key={item.id}
                      item={item}
                      activeFeatureId={activeFeatureId}
                      onPreview={(next) => {
                        setSelectedCase(next);
                        setActiveDialog("preview");
                      }}
                      onApply={applyCase}
                      onOpenMedia={setSelectedMedia}
                    />
                  ))}
                </div>
              ) : (
                <div className="ai-video-case-empty">
                  {backendStatus === "loading" ? "正在加载 AI 视频案例" : "当前筛选下暂无 AI 视频案例"}
                </div>
              )}
            </section>
          </div>
        ) : (
          <section className="ai-video-result-board">
              <div className="ai-video-result-stage">
                <div className="ai-video-result-shell">
                {resultRefs.length ? (
                  <>
                    <div className="ai-video-result-grid">
                      {resultRefs.map((ref, index) => (
                        <ResultAssetCard
                          key={`${ref}-${index}`}
                          refPath={ref}
                          index={index}
                          onOpen={setSelectedMedia}
                        />
                      ))}
                    </div>
                    {resultMessage ? (
                      <div className={`ai-video-result-message ${mediaResult?.status || "blocked"}`}>
                        <strong>{mediaResult ? statusLabel(mediaResult.status) : "未生成"}</strong>
                        <span>{resultMessage}</span>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className="ai-video-empty-result">
                    <p>{busy && submittedGeneration ? "正在生成中..." : "无生成结果"}</p>
                    {resultMessage ? (
                      <div className={`ai-video-result-message ${mediaResult?.status || "blocked"}`}>
                        <strong>{mediaResult ? statusLabel(mediaResult.status) : "未生成"}</strong>
                        <span>{resultMessage}</span>
                      </div>
                    ) : null}
                  </div>
                )}
                </div>
            </div>
            <p className="ai-video-result-note">注:生成结果用于商用需用户自主判断，虚拟人物肖像版权归客户所有。</p>
          </section>
        )}
          </>
        )}
      </main>

      <button type="button" className="ai-video-floating-history" onClick={() => setActiveDialog("history")}>
        <span>«</span>
        <strong>生成记录</strong>
      </button>

      <button type="button" className="ai-prompt-assistant-fab ai-video-prompt-assistant-fab" onClick={() => openPromptAssistant("text")}>
        <span aria-hidden="true">AI</span>
        <strong>提示词助手</strong>
      </button>

      {activeDialog === "feature-picker" ? (
        <DetailDialog
          eyebrow="AI 视频"
          title="选择功能"
          description="三类功能来自 DressingKit AI 视频页，图标使用本地主题化 SVG。"
          className="ai-video-dialog"
          bodyClassName="ai-video-dialog-body"
          onClose={() => setActiveDialog(null)}
        >
          <div className="ai-video-feature-picker-grid">
            {VIDEO_FEATURES.map((feature) => (
              <button
                key={feature.id}
                type="button"
                className={feature.id === activeFeatureId ? "active" : ""}
                onClick={() => {
                  selectFeature(feature.id);
                  setActiveDialog(null);
                }}
              >
                <FeatureButtonIcon iconKey={iconKeyForFeature(feature, featureUiById)} />
                <strong>{feature.title}</strong>
                <span>{feature.subtitle}</span>
              </button>
            ))}
          </div>
        </DetailDialog>
      ) : null}

      {activeDialog === "material-upload" && materialUploadDraft ? (
        <VideoMaterialUploadDialog
          draft={materialUploadDraft}
          onSelectFiles={() => { void selectMaterialUploadFiles(); }}
          onDropRefs={dropMaterialUploadRefs}
          onTitleChange={(title) => setMaterialUploadDraft((current) => current ? { ...current, title, error: "" } : current)}
          onSubmit={submitMaterialUpload}
          onClose={() => {
            setActiveDialog(null);
            setMaterialUploadDraft(null);
          }}
        />
      ) : null}

      {activeDialog === "preview" && selectedCase ? (
        <div className="ai-video-preview-modal" role="presentation" onClick={() => setActiveDialog(null)}>
          <section className="ai-video-preview-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="ai-video-preview-head">
              <h2>预览</h2>
              <button type="button" aria-label="关闭预览" onClick={() => setActiveDialog(null)}>×</button>
            </div>
            <div className={[
              "ai-video-preview-compare",
              assetsForRole(selectedCase, "input").length ? "" : "output-only",
            ].filter(Boolean).join(" ")}>
              {assetsForRole(selectedCase, "input").length ? (
                <MediaStack item={selectedCase} role="input" wide variant="preview" onOpen={setSelectedMedia} />
              ) : null}
              <MediaStack item={selectedCase} role="output" wide variant="preview" onOpen={setSelectedMedia} />
            </div>
            <section className="ai-video-preview-prompt">
              <header>
                <strong>提示词</strong>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(selectedCase.prompt || selectedCase.summary);
                  }}
                >
                  复制
                </button>
              </header>
              <textarea value={selectedCase.prompt || selectedCase.summary} readOnly />
            </section>
            <footer className="ai-video-preview-footer">
              <button type="button" onClick={() => setActiveDialog(null)}>取消</button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  applyCase(selectedCase);
                  setActiveDialog(null);
                }}
              >
                尝试示例
              </button>
              <button type="button" className="primary" onClick={() => setActiveDialog(null)}>确定</button>
            </footer>
          </section>
        </div>
      ) : null}

      {activeDialog === "history" ? (
        <VideoHistoryDrawer
          entries={visibleHistoryEntries}
          featureTitle={featureLabel}
          uploadCount={uploadCount}
          materialCount={materialEntries.length}
          mediaResult={mediaResult}
          onOpenMedia={setSelectedMedia}
          onSendToMaterialLibrary={sendHistoryToMaterialLibrary}
          onPartialRetouch={startPartialRetouchFromHistory}
          onClose={() => setActiveDialog(null)}
        />
      ) : null}

      {activeDialog === "prompt-list" ? (
        <DetailDialog
          className="ai-showcase-dialog ai-prompt-list-dialog"
          bodyClassName="ai-showcase-dialog-body ai-prompt-list-dialog-body"
          eyebrow="提示词"
          title="提示词列表"
          description="管理 AI 视频提示词模板，查询、选择、增删改后可应用到左侧提示词。"
          onClose={() => setActiveDialog(null)}
        >
          <div className="ai-prompt-list-toolbar">
            <label>
              请选择类型
              <select
                aria-label="提示词类型"
                value={promptListKind}
                onChange={(event) => setPromptListKind(event.target.value as VideoPromptListKind)}
              >
                <option value="all">全部</option>
                <option value="default">默认提示词</option>
                <option value="saved">已保存模板</option>
              </select>
            </label>
            <label>
              关键词
              <input
                aria-label="提示词关键词"
                value={promptListQuery}
                onChange={(event) => setPromptListQuery(event.target.value)}
                placeholder="请输入标题"
              />
            </label>
            <button type="button" onClick={queryPromptList}>查询</button>
            <button type="button" onClick={startPromptListCreate}>新增</button>
            <button
              type="button"
              onClick={() => {
                if (selectedPromptListTemplate) startPromptListEdit(selectedPromptListTemplate);
              }}
              disabled={!selectedPromptListTemplate}
            >
              编辑
            </button>
            <button type="button" className="danger" onClick={deletePromptListDraft} disabled={!promptListEditingId}>删除</button>
          </div>
          <div className="ai-prompt-list-table" role="list" aria-label="提示词列表结果">
            {promptListKind !== "saved" ? (
              promptListDefaultRows.map(([featureId, prompt]) => (
                <button
                  key={featureId}
                  type="button"
                  className={promptListDefaultFeatureId === featureId ? "ai-prompt-list-row active" : "ai-prompt-list-row"}
                  onClick={() => selectPromptListDefault(featureId, prompt)}
                >
                  <span className="ai-prompt-list-row-type">默认</span>
                  <strong>{featureTitleForPromptTemplate(featureId)}</strong>
                  <span>{prompt}</span>
                </button>
              ))
            ) : null}

            {promptListKind !== "default" ? (
              promptListSavedRows.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  className={promptListEditingId === template.id ? "ai-prompt-list-row active" : "ai-prompt-list-row"}
                  onClick={() => {
                    setPromptListDraftTitle(template.title);
                    setPromptListDraftPrompt(template.prompt);
                    setPromptListEditingId(template.id);
                    setPromptListDefaultFeatureId("");
                    setPromptListDraftMediaRefs(template.mediaRefs || []);
                    setActiveFeatureId(template.featureId);
                  }}
                >
                  <span className="ai-prompt-list-row-type">模板</span>
                  <strong>{template.title}</strong>
                  <span>{template.prompt}</span>
                  <em>{formatHistoryTime(template.updatedAt || template.createdAt)} · {template.featureTitle}</em>
                </button>
              ))
            ) : null}

            {!promptListVisibleRowCount ? (
              <div className="ai-dialog-empty">暂无匹配数据</div>
            ) : null}
          </div>
          <div className="ai-prompt-list-pagination" aria-label="提示词列表分页">
            <button type="button" disabled aria-label="上一页">‹</button>
            <span>1</span>
            <button type="button" disabled aria-label="下一页">›</button>
          </div>
          <div className="ai-prompt-list-footer">
            <button type="button" onClick={() => setActiveDialog(null)}>取消</button>
            <button type="button" className="primary" onClick={confirmPromptList}>确定</button>
          </div>
        </DetailDialog>
      ) : null}

      {activeDialog === "prompt-list" && promptListFormMode ? (
        <div className="ai-prompt-template-modal-backdrop" role="presentation" onClick={cancelPromptListForm}>
          <section
            className="ai-prompt-template-modal"
            role="dialog"
            aria-modal="true"
            aria-label={promptListFormMode === "create" ? "新增" : "编辑"}
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ai-prompt-template-modal-header">
              <h2>{promptListFormMode === "create" ? "新增" : "编辑"}</h2>
              <button type="button" aria-label="关闭提示词模板表单" onClick={cancelPromptListForm}>×</button>
            </header>
            <div className="ai-prompt-template-form">
              <label>
                标题
                <input
                  aria-label="模板名称"
                  value={promptListDraftTitle}
                  onChange={(event) => setPromptListDraftTitle(event.target.value)}
                  placeholder="请输入标题"
                />
              </label>
              <label>
                类型
                <select
                  aria-label="模板类型"
                  value={activeFeatureId}
                  onChange={(event) => setActiveFeatureId(event.target.value as VideoShowcaseFeatureId)}
                >
                  {VIDEO_FEATURES.map((feature) => (
                    <option key={feature.id} value={feature.id}>{feature.title}</option>
                  ))}
                </select>
              </label>
              <div className="ai-prompt-template-upload">
                <div className="ai-prompt-template-label">引用素材</div>
                <div className="ai-prompt-template-upload-list">
                  <button type="button" className="ai-prompt-template-upload-card" onClick={addPromptListMediaRefs}>
                    <span aria-hidden="true">+</span>
                  </button>
                  {promptListDraftMediaRefs.map((ref, index) => {
                    const kind = previewKindFromRef(ref);
                    return (
                      <figure key={`${ref}-${index}`} className="ai-prompt-template-upload-card has-image">
                        <button
                          type="button"
                          onClick={() => setSelectedMedia({
                            url: mediaAssetSource(ref),
                            kind,
                            title: `模板素材 ${index + 1}`,
                            label: "提示词模板素材",
                          })}
                        >
                          {kind === "image" ? (
                            <img src={mediaAssetSource(ref)} alt={`提示词模板素材${index + 1}`} loading="lazy" />
                          ) : (
                            <span>{kind === "video" ? "VID" : "FILE"}</span>
                          )}
                        </button>
                        <button
                          type="button"
                          className="ai-prompt-template-remove"
                          aria-label={`删除模板素材${index + 1}`}
                          onClick={() => removePromptListMediaRef(ref)}
                        >
                          ×
                        </button>
                      </figure>
                    );
                  })}
                </div>
              </div>
              <label>
                提示词内容
                <textarea
                  aria-label="模板提示词"
                  value={promptListDraftPrompt}
                  onChange={(event) => {
                    setPromptListDraftPrompt(event.target.value);
                    setPromptListDefaultFeatureId("");
                  }}
                />
              </label>
            </div>
            <footer className="ai-prompt-template-modal-footer">
              <button type="button" onClick={cancelPromptListForm}>取消</button>
              <button type="button" className="primary" onClick={savePromptListDraft} disabled={!promptListDraftPrompt.trim()}>
                确定
              </button>
            </footer>
          </section>
        </div>
      ) : null}

      {activeDialog === "prompt-assistant" ? (
        <div className="ai-assistant-overlay" role="presentation" onClick={() => setActiveDialog(null)}>
          <section
            className={assistantTemplatesOpen ? "ai-assistant-dialog agent-first has-templates" : "ai-assistant-dialog agent-first"}
            role="dialog"
            aria-modal="true"
            aria-label="提示词助手"
            onClick={(event) => event.stopPropagation()}
          >
            <header className="ai-assistant-header">
              <h2>提示词助手</h2>
              <button type="button" aria-label="关闭提示词助手" onClick={() => setActiveDialog(null)}>×</button>
            </header>
            <div className="ai-assistant-content">
              <div className="ai-assistant-main">
                <div className="ai-assistant-tabs" role="tablist" aria-label="提示词助手模式">
                  <button
                    type="button"
                    className={assistantTab === "text" ? "active" : ""}
                    onClick={() => setAssistantTab("text")}
                  >
                    文本生成
                  </button>
                  <button
                    type="button"
                    className={assistantTab === "reverse" ? "active" : ""}
                    onClick={() => setAssistantTab("reverse")}
                  >
                    素材反推
                  </button>
                </div>
                <div className="ai-assistant-toolbar">
                  <button type="button" onClick={() => setAssistantTemplatesOpen((current) => !current)}>
                    提示词模板
                  </button>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      const template = savePromptTemplate(
                        assistantResult || assistantInput || promptDraft,
                        templateDraftTitle,
                        editingTemplateId,
                        assistantMediaRefs.length ? assistantMediaRefs : undefined,
                      );
                      if (template) setAssistantTemplatesOpen(true);
                    }}
                  >
                    保存到模板
                  </button>
                </div>
                <div className={assistantTab === "reverse" ? "ai-assistant-grid is-image-reverse" : "ai-assistant-grid is-text-generation"}>
                  {assistantTab === "reverse" ? (
                    <section className="ai-assistant-reverse-input">
                      <div className="ai-assistant-upload-section">
                        <div className="ai-assistant-section-title">引用素材</div>
                        <div className="ai-assistant-upload-list">
                          <button type="button" className="ai-assistant-upload-card is-upload" onClick={selectImageUpload}>
                            <span aria-hidden="true">+</span>
                            <strong>上传</strong>
                          </button>
                          {assistantMediaRefs.map((ref, index) => {
                            const kind = previewKindFromRef(ref);
                            return (
                              <div key={`${ref}-${index}`} className="ai-assistant-upload-card has-image">
                                <button
                                  type="button"
                                  className="ai-assistant-upload-image"
                                  onClick={() => setSelectedMedia({
                                    url: mediaAssetSource(ref),
                                    kind,
                                    title: `素材${index + 1}`,
                                    label: "提示词助手素材",
                                  })}
                                >
                                  {kind === "image" ? (
                                    <img src={mediaAssetSource(ref)} alt={`提示词助手素材${index + 1}`} loading="lazy" />
                                  ) : (
                                    <span>{kind === "video" ? "VID" : "FILE"}</span>
                                  )}
                                </button>
                                <strong>{kind === "video" ? "视频" : kind === "image" ? "图片" : "素材"}</strong>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <label>输入提示词</label>
                      <textarea
                        value={assistantInput}
                        onChange={(event) => setAssistantInput(event.target.value)}
                        placeholder="描述参考素材、镜头、动作、主体或需要反推的商业卖点。"
                      />
                    </section>
                  ) : (
                    <section>
                      <label>输入提示词</label>
                      <textarea
                        value={assistantInput}
                        onChange={(event) => setAssistantInput(event.target.value)}
                        placeholder="请输入要扩写或优化的视频提示词。"
                      />
                    </section>
                  )}
                  <section>
                    <label>生成结果</label>
                    <textarea
                      value={assistantResult}
                      onChange={(event) => setAssistantResult(event.target.value)}
                      placeholder="点击开始生成后，这里会出现可编辑结果。"
                    />
                  </section>
                  <div className="ai-assistant-generate-row">
                    <button type="button" onClick={generateAssistantPrompt}>开始生成</button>
                  </div>
                </div>
              </div>
              {assistantTemplatesOpen ? (
                <aside className="ai-assistant-template-panel">
                  <header>
                    <strong>提示词模板</strong>
                    <span>{savedPromptTemplates.length} 个模板</span>
                  </header>
                  <label>
                    模板名称
                    <input
                      value={templateDraftTitle}
                      onChange={(event) => setTemplateDraftTitle(event.target.value)}
                      placeholder={`${activeFeature.title} · 视频提示词`}
                    />
                  </label>
                  <div className="ai-assistant-template-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTemplateId("");
                        setTemplateDraftTitle(`${activeFeature.title} · 视频提示词`);
                        setAssistantResult("");
                      }}
                    >
                      新建
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => savePromptTemplate(
                        assistantResult || assistantInput || promptDraft,
                        templateDraftTitle,
                        editingTemplateId,
                        assistantMediaRefs.length ? assistantMediaRefs : undefined,
                      )}
                    >
                      {editingTemplateId ? "更新" : "保存"}
                    </button>
                  </div>
                  <div className="ai-assistant-template-list">
                    {savedPromptTemplates.length ? savedPromptTemplates.map((template) => (
                      <article key={template.id} className={editingTemplateId === template.id ? "active" : ""}>
                        <div>
                          <strong>{template.title}</strong>
                          <span>{formatHistoryTime(template.updatedAt || template.createdAt)}</span>
                        </div>
                        <p>{template.prompt.slice(0, 120)}</p>
                        <footer>
                          <button type="button" onClick={() => applySavedPromptTemplate(template, false)}>应用</button>
                          <button type="button" onClick={() => editSavedPromptTemplate(template)}>编辑</button>
                          <button type="button" className="danger" onClick={() => deleteSavedPromptTemplate(template.id)}>删除</button>
                        </footer>
                      </article>
                    )) : (
                      <div className="ai-assistant-template-empty">暂无模板，保存当前结果后会出现在这里。</div>
                    )}
                  </div>
                </aside>
              ) : null}
            </div>
            {renderPromptAssistantAgentPanel()}
            <footer className="ai-assistant-footer">
              <button type="button" onClick={() => setActiveDialog(null)}>取消</button>
              <button type="button" className="primary" onClick={confirmAssistantPrompt}>确定</button>
            </footer>
          </section>
        </div>
      ) : null}

      {selectedMedia ? (
        <div
          className="ai-video-media-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={selectedMedia.title}
          onClick={() => setSelectedMedia(null)}
        >
          <button type="button" className="ai-video-media-preview-close" onClick={() => setSelectedMedia(null)}>
            关闭
          </button>
          <figure className="ai-video-media-preview-card" onClick={(event) => event.stopPropagation()}>
            {selectedMedia.kind === "video" ? (
              <video src={selectedMedia.url} controls autoPlay muted playsInline />
            ) : selectedMedia.kind === "artifact" ? (
              <div className="ai-video-media-preview-artifact">
                <strong>可追溯队列文件</strong>
                <span>{fileNameFromPath(selectedMedia.url)}</span>
                <a href={selectedMedia.url} download onClick={(event) => event.stopPropagation()}>下载文件</a>
              </div>
            ) : (
              <img src={selectedMedia.url} alt={selectedMedia.title} />
            )}
            <figcaption>
              <strong>{selectedMedia.title}</strong>
              <span>{selectedMedia.label}</span>
            </figcaption>
          </figure>
        </div>
      ) : null}
    </div>
  );
}
