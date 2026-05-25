import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  BuguAuthState,
  OemPublicAsset,
  OemPublicCase,
  OemPublicSiteConfig,
  OemSiteConfigRequest,
} from "../../../../shared/types";
import { DetailDialog } from "../DetailDialog";

type VideoShowcaseDialog = "feature-picker" | "materials" | "preview" | "history" | null;
type VideoShowcaseAssetRole = "input" | "output" | "unknown";
type VideoShowcaseFeatureId = "storyboard" | "smart-video" | "omni-video";

interface VideoShowcaseModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  productImageRefs: string[];
  videoAssetRefs: string[];
  authState: BuguAuthState | null;
  onSelectProductImages: () => void;
  onSelectVideo: () => void;
  onUsePromptInVideo: (prompt: string) => void;
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

const DEFAULT_PROMPTS: Record<VideoShowcaseFeatureId, string> = {
  storyboard: "生成图片的6宫格分镜图，服装视觉大片，4K，相机拍摄真实风格。包含特写与局部，远景与近景。",
  "smart-video": "根据图中产品的卖点与特点，结合图中人物生成产品带货视频。语音与文字为中文环境。",
  "omni-video": "根据图中产品的卖点与特点，结合图中人物生成产品带货视频。语音与文字为中文环境。",
};

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

function roleFromAsset(ref: string, asset?: OemPublicAsset): VideoShowcaseAssetRole {
  const text = `${ref} ${asset?.caption || ""}`.toLowerCase();
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
  return (
    <article className={`ai-video-case-card ${wide ? "is-wide" : ""}`}>
      <div className={`ai-video-case-media ${wide ? "is-wide" : ""}`}>
        <MediaStack item={item} role="input" wide={wide} />
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
  authState,
  onSelectProductImages,
  onSelectVideo,
  onUsePromptInVideo,
}: VideoShowcaseModuleProps) {
  const [activeFeatureId, setActiveFeatureId] = useState<VideoShowcaseFeatureId>("storyboard");
  const [selectedIndustry, setSelectedIndustry] = useState("全部");
  const [promptDraft, setPromptDraft] = useState(DEFAULT_PROMPTS.storyboard);
  const [selectedCase, setSelectedCase] = useState<VideoShowcaseCase | null>(null);
  const [activeDialog, setActiveDialog] = useState<VideoShowcaseDialog>(null);
  const [backendCases, setBackendCases] = useState<OemPublicCase[]>([]);
  const [backendAssets, setBackendAssets] = useState<OemPublicAsset[]>([]);
  const [backendStatus, setBackendStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [backendMessage, setBackendMessage] = useState("");
  const [featureUiConfig, setFeatureUiConfig] = useState<VideoShowcaseFeatureUiConfig | null>(null);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const activeFeature = FEATURE_BY_ID.get(activeFeatureId) || VIDEO_FEATURES[0];

  function appendHistory(entry: Omit<HistoryEntry, "id" | "createdAt">): void {
    setHistoryEntries((current) => [
      { ...entry, id: historyId(), createdAt: new Date().toISOString() },
      ...current,
    ].slice(0, 16));
  }

  useEffect(() => {
    const controller = new AbortController();
    setBackendStatus("loading");
    setBackendMessage("");
    window.contentStudio.getOemSiteConfig(buildOemSiteConfigRequest(authState))
      .then((site) => {
        if (controller.signal.aborted) return;
        const cases = Array.isArray(site.cases) ? site.cases : [];
        const assets = Array.isArray(site.assets) ? site.assets : [];
        const videoCases = cases.filter(isVideoShowcaseBackendCase);
        setBackendCases(videoCases);
        setBackendAssets(assets);
        setFeatureUiConfig(readFeatureUiConfig(site));
        setBackendStatus(videoCases.length ? "ready" : "empty");
        appendHistory({
          title: videoCases.length ? "已加载 AI 视频案例清单" : "AI 视频案例清单为空",
          detail: videoCases.length
            ? `${videoCases.length} 组案例 · ${assets.length} 个资产`
            : "后端没有返回 ai-video-showcase 共享案例。",
          tone: videoCases.length ? "ready" : "warning",
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setFeatureUiConfig(null);
        setBackendStatus("error");
        setBackendMessage(error instanceof Error ? error.message : "读取 AI 视频案例失败");
        appendHistory({
          title: "AI 视频案例读取失败",
          detail: error instanceof Error ? error.message : "读取公共配置时发生未知错误。",
          tone: "blocked",
        });
      });
    return () => controller.abort();
  }, [authState]);

  const backendCards = useMemo(
    () => buildBackendCards(backendCases, backendAssets),
    [backendAssets, backendCases],
  );
  const featureUiById = useMemo(() => indexFeatureUiById(featureUiConfig), [featureUiConfig]);
  const visibleCards = backendCards.filter(
    (item) =>
      item.featureId === activeFeatureId &&
      (selectedIndustry === "全部" || item.industry === selectedIndustry),
  );
  const totalAssetCount = backendCards.reduce((total, item) => total + item.assets.length, 0);
  const featureCaseCount = backendCards.filter((item) => item.featureId === activeFeatureId).length;
  const featureLabel = activeFeature.title;

  function selectFeature(featureId: VideoShowcaseFeatureId): void {
    const feature = FEATURE_BY_ID.get(featureId) || VIDEO_FEATURES[0];
    setActiveFeatureId(feature.id);
    setSelectedIndustry("全部");
    const featurePrompt = backendCards.find((item) => item.featureId === feature.id && item.prompt)?.prompt || DEFAULT_PROMPTS[feature.id];
    setPromptDraft(featurePrompt);
    appendHistory({
      title: `已切换功能：${feature.title}`,
      detail: featurePrompt.slice(0, 90),
      tone: "idle",
    });
  }

  function applyCase(item: VideoShowcaseCase): void {
    setSelectedCase(item);
    setActiveFeatureId(item.featureId);
    const nextPrompt = item.prompt.trim() || DEFAULT_PROMPTS[item.featureId];
    setPromptDraft(nextPrompt);
    appendHistory({
      title: `已套用视频案例：${item.title}`,
      detail: nextPrompt.slice(0, 100),
      tone: "ready",
    });
  }

  function startGenerate(): void {
    const prompt = promptDraft.trim();
    if (!prompt) return;
    onUsePromptInVideo(prompt);
  }

  return (
    <div className="ai-video-showcase-shell">
      <aside className="ai-video-left">
        <section className="ai-video-panel scene-panel">
          <div className="ai-video-panel-heading">
            <div>
              <span>选择场景</span>
              <h2>（{featureLabel}）</h2>
            </div>
            <button type="button" className="ai-video-link-button" onClick={() => setActiveDialog("feature-picker")}>选择功能</button>
          </div>
          <p>{activeFeature.subtitle}</p>
        </section>

        <section className="ai-video-panel">
          <div className="ai-video-section-title">
            <span>上传素材</span>
            <em>{productImageRefs.length + videoAssetRefs.length ? `${productImageRefs.length} 图 · ${videoAssetRefs.length} 视频` : "未选择"}</em>
          </div>
          <div className="ai-video-upload-grid">
            <button type="button" className="ai-video-upload-card" onClick={onSelectProductImages}>
              <strong>上传图片</strong>
              <span>{productImageRefs.length ? `${productImageRefs.length} 张已选` : "选择输入图"}</span>
            </button>
            <button type="button" className="ai-video-upload-card" onClick={onSelectVideo}>
              <strong>上传视频</strong>
              <span>{videoAssetRefs.length ? `${videoAssetRefs.length} 条已选` : "选择参考视频"}</span>
            </button>
            <button type="button" className="ai-video-upload-card is-disabled" disabled>
              <strong>上传音频</strong>
              <span>后续接入</span>
            </button>
          </div>
          <p className="ai-video-muted">图片可上传 1-7 张，视频可上传多个，音频入口保留为不可用状态。</p>
        </section>

        <section className="ai-video-panel ai-video-control-stack">
          <div className="ai-video-section-title">
            <span>提示词</span>
            <button type="button" onClick={() => setActiveDialog("materials")}>素材库</button>
          </div>
          <textarea
            value={promptDraft}
            onChange={(event) => setPromptDraft(event.target.value)}
            placeholder="描述图片中主体、场景、动作等"
          />
          <div className="ai-video-prompt-actions">
            <button type="button" onClick={() => setPromptDraft(DEFAULT_PROMPTS[activeFeatureId])}>恢复默认</button>
            <button type="button" onClick={() => setActiveDialog("history")}>历史记录</button>
          </div>
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

      <main className="ai-video-main">
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
              <span>选择样例</span>
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
      </main>

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

      {activeDialog === "materials" ? (
        <DetailDialog
          eyebrow="AI 视频"
          title="后端案例素材"
          description={backendStatus === "ready" ? `${backendCards.length} 组案例 · ${totalAssetCount} 个资产` : backendMessage || "素材清单未就绪"}
          className="ai-video-dialog"
          bodyClassName="ai-video-dialog-body"
          onClose={() => setActiveDialog(null)}
        >
          {backendCards.length ? (
            <div className="ai-video-material-list">
              {backendCards.slice(0, 24).map((item) => (
                <button key={item.id} type="button" onClick={() => applyCase(item)}>
                  <strong>{item.title}</strong>
                  <span>{FEATURE_BY_ID.get(item.featureId)?.title || item.featureId} · {item.industry} · {item.assets.length} 个资产</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="ai-video-dialog-empty">暂无可展示的后端 AI 视频素材。</div>
          )}
        </DetailDialog>
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
            <div className="ai-video-preview-compare">
              <MediaStack item={selectedCase} role="input" wide variant="preview" />
              <MediaStack item={selectedCase} role="output" wide variant="preview" />
            </div>
            <p>{selectedCase.prompt || selectedCase.summary}</p>
          </section>
        </div>
      ) : null}

      {activeDialog === "history" ? (
        <DetailDialog
          eyebrow="AI 视频"
          title="历史记录"
          description="记录当前 AI 视频页的加载、切换和示例套用动作。"
          className="ai-video-dialog"
          bodyClassName="ai-video-dialog-body"
          onClose={() => setActiveDialog(null)}
        >
          {historyEntries.length ? (
            <div className="ai-video-history-list">
              {historyEntries.map((entry) => (
                <article key={entry.id} className={`ai-video-history-item tone-${entry.tone}`}>
                  <div>
                    <strong>{entry.title}</strong>
                    <span>{formatHistoryTime(entry.createdAt)}</span>
                  </div>
                  <p>{entry.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="ai-video-dialog-empty">暂无历史记录。</div>
          )}
        </DetailDialog>
      ) : null}
    </div>
  );
}
