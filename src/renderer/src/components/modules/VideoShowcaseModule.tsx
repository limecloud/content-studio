import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import type {
  AssetFileKind,
  BuguAuthState,
  MediaGenerationResult,
  OemPublicAsset,
  OemPublicCase,
  OemPublicSiteConfig,
  OemSiteConfigRequest,
} from "../../../../shared/types";
import { fileNameFromPath, localAssetUrl, statusLabel } from "../../app/formatters";
import rawDressingkitVideoShared from "../../data/dressingkit-ai-video-shared.json";
import rawDressingkitMaterials from "../../data/dressingkit-materials.json";
import { DetailDialog } from "../DetailDialog";

type VideoShowcaseDialog = "feature-picker" | "material-upload" | "preview" | "history" | null;
type VideoShowcaseAssetRole = "input" | "output" | "unknown";
type VideoShowcaseFeatureId = "storyboard" | "smart-video" | "omni-video";
type VideoShowcaseMainTab = "features" | "results" | "materials";
type VideoMaterialKind = "image" | "video" | "audio";
type VideoMaterialActor = "virtual" | "real";
type VideoMaterialStatus = "reported" | "reviewing" | "rejected";
type VideoMaterialStatusFilter = "all" | VideoMaterialStatus;
type VideoPreviewState = { url: string; kind: "image" | "video"; title: string; label: string };

interface VideoShowcaseModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  productImageRefs: string[];
  videoAssetRefs: string[];
  audioAssetRefs: string[];
  mediaResult: MediaGenerationResult | null;
  authState: BuguAuthState | null;
  onSelectProductImages: () => void;
  onSelectVideo: () => void;
  onSelectAudio: () => void;
  onSelectMaterialFiles: (kind: AssetFileKind) => Promise<string[]>;
  onRemoveProductImageRef: (ref: string) => void;
  onRemoveVideoAssetRef: (ref: string) => void;
  onRemoveAudioAssetRef: (ref: string) => void;
  onUsePromptInVideo: (input: ShowcaseVideoHandoff) => void;
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
const VIDEO_DURATIONS = ["5s", "10s", "15s"];
const VIDEO_RESOLUTIONS = ["480P", "720P", "1080P"];
const STORYBOARD_COUNTS = [1, 2, 3];
const STORYBOARD_RATIOS = ["3:4", "1:1", "4:3", "9:16", "16:9"];
const STORYBOARD_QUALITIES = ["1K", "2K", "4K"];

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

function MediaAsset({ asset, title, label }: { asset: VideoCaseAsset; title: string; label: string }) {
  if (asset.kind === "video") {
    return (
      <video
        src={asset.url}
        aria-label={`${title} ${label}`}
        controls
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  return <img src={asset.url} alt={`${title} ${label}`} loading="lazy" />;
}

function MediaStack({
  item,
  role,
  wide,
  variant = "card",
}: {
  item: VideoShowcaseCase;
  role: "input" | "output";
  wide: boolean;
  variant?: "card" | "preview";
}) {
  const assets = assetsForRole(item, role);
  const label = role === "input" ? "输入文件" : "输出图";
  const visibleAssets = assets.slice(0, role === "input" && variant === "card" ? 4 : 1);
  const hiddenCount = Math.max(0, assets.length - visibleAssets.length);
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
              <MediaAsset asset={asset} title={item.title} label={`${label} ${index + 1}`} />
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
  const kind = isVideoRef(refPath) ? "video" : "image";
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
      ) : (
        <img src={source} alt={title} loading="lazy" />
      )}
      <span>{kind === "video" ? "视频结果" : "图片结果"}</span>
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
        const kind = isVideoRef(ref) ? "video" : "image";
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
}: {
  refs: string[];
  label: string;
  onOpen: (preview: VideoPreviewState) => void;
}) {
  if (!refs.length) {
    return <div className="ai-video-history-section-empty">暂无{label}</div>;
  }
  return (
    <div className="ai-video-history-asset-grid" data-count={Math.min(refs.length, 6)}>
      {refs.map((ref, index) => {
        const source = mediaAssetSource(ref);
        const kind = isVideoRef(ref) ? "video" : "image";
        const title = `${label} ${index + 1}`;
        return (
          <button
            key={`${ref}-${index}`}
            type="button"
            className="ai-video-history-asset"
            onClick={() => onOpen({ url: source, kind, title, label })}
          >
            {kind === "video" ? (
              <video src={source} muted playsInline preload="metadata" />
            ) : (
              <img src={source} alt={title} loading="lazy" />
            )}
          </button>
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
  onClose,
}: {
  entries: HistoryEntry[];
  featureTitle: string;
  uploadCount: number;
  materialCount: number;
  mediaResult: MediaGenerationResult | null;
  onOpenMedia: (preview: VideoPreviewState) => void;
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
                  <span>{formatHistoryTime(entry.createdAt)}</span>
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
                <span className={`tone-${selectedEntry.tone}`}>{historyStatusText(selectedEntry)}</span>
                <span>{formatHistoryDateTime(selectedEntry.createdAt)}</span>
              </div>
              <div className="ai-video-history-operation-row">
                <button type="button">发送到素材库</button>
                <button type="button">生成爆款视频</button>
                <button type="button">局部精修</button>
              </div>
              <section className="ai-video-history-section">
                <h3>输入文件</h3>
                <VideoHistoryAssetGrid refs={selectedEntry.inputRefs || []} label="输入文件" onOpen={onOpenMedia} />
              </section>
              <section className="ai-video-history-section">
                <h3>生成结果</h3>
                <VideoHistoryAssetGrid refs={selectedEntry.outputRefs || []} label="生成结果" onOpen={onOpenMedia} />
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
                {featureTitle} · {uploadCount} 个输入素材 · {materialCount} 个素材库记录 · {mediaResult ? statusLabel(mediaResult.status) : "未生成"}
              </p>
            </main>
          ) : (
            <div className="ai-video-history-empty-detail">
              <strong>暂无历史记录</strong>
              <span>完成一次生成后，这里会展示输入文件、生成结果和提示词。</span>
            </div>
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
        <button type="button" className="ai-video-material-action" onClick={onRefresh}>刷新</button>
        <button type="button" className="ai-video-material-action primary" onClick={onOpenUpload}>新增素材</button>
      </div>

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
            <strong>{materialDropText(draft.kind)}</strong>
            <em>{materialUploadHint(draft.kind)}</em>
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
}: {
  item: VideoShowcaseCase;
  activeFeatureId: VideoShowcaseFeatureId;
  onPreview: (item: VideoShowcaseCase) => void;
  onApply: (item: VideoShowcaseCase) => void;
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
        {hasInputAssets ? <MediaStack item={item} role="input" wide={wide} /> : null}
        <MediaStack item={item} role="output" wide={wide} />
      </div>
      <div className="ai-video-case-bottom">
        <div className="ai-video-case-meta">
          <strong title={item.title}>{item.title}</strong>
          <span>{item.industry} · {item.assets.length} 个素材</span>
        </div>
        <div className="ai-video-case-actions">
          <button type="button" onClick={() => onPreview(item)}>预览</button>
          <button type="button" className="primary" onClick={() => onApply(item)}>尝试示例</button>
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
  onSelectProductImages,
  onSelectVideo,
  onSelectAudio,
  onSelectMaterialFiles,
  onRemoveProductImageRef,
  onRemoveVideoAssetRef,
  onRemoveAudioAssetRef,
  onUsePromptInVideo,
  onClearResult,
  onGenerateVideo,
}: VideoShowcaseModuleProps) {
  const [activeFeatureId, setActiveFeatureId] = useState<VideoShowcaseFeatureId>("storyboard");
  const [activeMainTab, setActiveMainTab] = useState<VideoShowcaseMainTab>("features");
  const [selectedIndustry, setSelectedIndustry] = useState("全部");
  const [promptDraft, setPromptDraft] = useState(DEFAULT_PROMPTS.storyboard);
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
    const outputRefs = result.status === "succeeded" ? result.assetRefs : pending.outputRefs || [];
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
  const resultRefs = mediaResult?.status === "succeeded" ? mediaResult.assetRefs : [];
  const resultMessage = mediaResult && mediaResult.status !== "succeeded" ? mediaResult.message : "";
  const latestResultKey = mediaResult
    ? `${mediaResult.logId}:${mediaResult.status}:${mediaResult.assetRefs.join("|")}`
    : "";

  useEffect(() => {
    onClearResult();
  }, []);

  useEffect(() => {
    if (!mediaResult) return;
    completePendingGeneration(mediaResult);
  }, [latestResultKey]);

  function selectFeature(featureId: VideoShowcaseFeatureId): void {
    const feature = FEATURE_BY_ID.get(featureId) || VIDEO_FEATURES[0];
    setActiveFeatureId(feature.id);
    setActiveMainTab("features");
    setSelectedIndustry("全部");
    setExampleImageRefs(null);
    setExampleVideoRefs(null);
    setExampleAudioRefs(null);
    setSelectedCase(null);
    const featurePrompt = DEFAULT_PROMPTS[feature.id];
    setPromptDraft(featurePrompt);
    appendHistory({
      title: `已切换功能：${feature.title}`,
      detail: featurePrompt.slice(0, 90),
      tone: "idle",
    });
  }

  function applyCase(item: VideoShowcaseCase): void {
    onClearResult();
    setSelectedCase(item);
    setActiveFeatureId(item.featureId);
    setActiveMainTab("results");
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
    const outputRefs = assetsForRole(item, "output").map((asset) => asset.url);
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
    appendGenerationHistory({
      title: `已套用视频案例：${item.title}`,
      detail: nextPrompt.slice(0, 100),
      tone: "ready",
      featureTitle: nextFeature.title,
      jobType: nextFeature.title,
      statusText: "生成完成",
      inputRefs: [...nextImageRefs, ...nextVideoRefs],
      outputRefs,
      prompt: nextPrompt,
    });
  }

  function buildVideoHandoff(input?: {
    prompt?: string;
    feature?: VideoShowcaseFeature;
    imageRefs?: string[];
    videoRefs?: string[];
    selectedCaseTitle?: string;
  }): ShowcaseVideoHandoff {
    const feature = input?.feature || activeFeature;
    const prompt = (input?.prompt ?? promptDraft).trim();
    const imageRefs = input?.imageRefs ?? activeImageRefs;
    const videoRefs = feature.id === "omni-video" ? input?.videoRefs ?? featureVideoRefs : [];
    return {
      prompt,
      imageAssetRefs: uniqueRefs(imageRefs, 7),
      videoAssetRefs: uniqueRefs(videoRefs, 3),
      audioAssetRefs: feature.id === "storyboard" ? [] : uniqueRefs(featureAudioRefs, 1),
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
    setExampleImageRefs(null);
    onSelectProductImages();
  }

  function selectVideoUpload(): void {
    setExampleVideoRefs(null);
    onSelectVideo();
  }

  function selectAudioUpload(): void {
    setExampleAudioRefs(null);
    onSelectAudio();
  }

  function removeImageRef(ref: string): void {
    if (exampleImageRefs !== null) {
      setExampleImageRefs((current) => (current ?? []).filter((item) => item !== ref));
      return;
    }
    onRemoveProductImageRef(ref);
  }

  function removeVideoRef(ref: string): void {
    if (exampleVideoRefs !== null) {
      setExampleVideoRefs((current) => (current ?? []).filter((item) => item !== ref));
      return;
    }
    onRemoveVideoAssetRef(ref);
  }

  function removeAudioRef(ref: string): void {
    if (exampleAudioRefs !== null) {
      setExampleAudioRefs((current) => (current ?? []).filter((item) => item !== ref));
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
    <div className="ai-video-showcase-shell">
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

        <section className="ai-video-panel">
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
          <p className={activeFeatureId === "storyboard" ? "ai-video-muted" : "ai-video-muted is-warning"}>
            {activeFeatureId === "storyboard"
              ? "图片可以上传 1-7 张。"
              : activeFeatureId === "smart-video"
                ? "图片可以上传 1-7 张，音频仅支持 1 条，音频控制在 15.1 秒以内。不能直接上传人脸照片，需要通过素材库审核去选择。"
                : "图片可上传 1-7 张，视频可上传多个，音频仅支持 1 条，且视频音频都需控制在 15.1 秒内。不能直接上传人脸照片，需要通过素材库审核去选择。"}
          </p>
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
                  使用素材库中的人脸素材进行报备
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
                ) : (
                  <div className="ai-video-empty-result">
                    <div className="ai-video-empty-result-figure" aria-hidden="true">
                      <span />
                      <strong />
                    </div>
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
              <div>
                <span>{selectedCase.industry}</span>
                <h2>{selectedCase.title}</h2>
              </div>
              <button type="button" onClick={() => setActiveDialog(null)}>关闭</button>
            </div>
            <div className={[
              "ai-video-preview-compare",
              assetsForRole(selectedCase, "input").length ? "" : "output-only",
            ].filter(Boolean).join(" ")}>
              {assetsForRole(selectedCase, "input").length ? (
                <MediaStack item={selectedCase} role="input" wide variant="preview" />
              ) : null}
              <MediaStack item={selectedCase} role="output" wide variant="preview" />
            </div>
            <p>{selectedCase.prompt || selectedCase.summary}</p>
          </section>
        </div>
      ) : null}

      {activeDialog === "history" ? (
        <VideoHistoryDrawer
          entries={historyEntries}
          featureTitle={featureLabel}
          uploadCount={uploadCount}
          materialCount={materialEntries.length}
          mediaResult={mediaResult}
          onOpenMedia={setSelectedMedia}
          onClose={() => setActiveDialog(null)}
        />
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
