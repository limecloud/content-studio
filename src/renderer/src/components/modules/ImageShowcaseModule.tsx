import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  BuguAuthState,
  GenerationLogEntry,
  MediaGenerationResult,
  OemPublicAsset,
  OemPublicCase,
  OemPublicMaterial,
  OemPublicSiteConfig,
  OemSiteConfigRequest,
} from "../../../../shared/types";
import { statusLabel } from "../../app/formatters";
import rawDressingkitImageShared from "../../data/dressingkit-ai-image-shared.json";
import rawDressingkitMaterials from "../../data/dressingkit-materials.json";
import { DetailDialog } from "../DetailDialog";

type ShowcaseCategoryId = "marketing" | "product-design" | "production";
type Viewpoint = "front" | "back" | "side";
type ShowcaseDialog = "prompt-list" | "history" | "prompt-assistant" | null;
type ShowcaseMainView = "cases" | "materials";
type ShowcaseStageView = "home" | "workbench";
type RefinementTool = "select" | "pan" | "rotate" | "crop" | "brush" | "clear";
type PromptAssistantTab = "text" | "reverse";
type PromptListKind = "all" | "default" | "saved";
type PromptListFormMode = "create" | "edit" | null;

const PROMPT_TEMPLATE_STORAGE_KEY = "buguai:dressingkit-image-prompt-templates";

interface ImageShowcaseModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  productImageRefs: string[];
  referenceImageRefs: string[];
  mediaResult: MediaGenerationResult | null;
  authState: BuguAuthState | null;
  logs: GenerationLogEntry[];
  onSelectProductImages: () => void;
  onSelectReferenceImages: () => void;
  onRemoveProductImageRef: (ref: string) => void;
  onRemoveReferenceImageRef: (ref: string) => void;
  onUsePromptInImage: (input: ShowcaseImageHandoff) => void;
  onStartPartialRetouch: (input: ShowcaseImageHandoff & { outputRefs: string[]; sourceLogId?: string; sourceTitle?: string }) => void;
  onClearResult: () => void;
  onGenerateImage: (input: ShowcaseImageHandoff) => void;
}

export interface ShowcaseImageHandoff {
  prompt: string;
  productImageRefs: string[];
  referenceImageRefs: string[];
  productImageLabel: string;
  referenceImageLabel: string;
  featureId?: string;
  featureTitle?: string;
}

interface ShowcaseFeature {
  id: string;
  title: string;
  subtitle: string;
  businessFlag?: number;
  iconKey?: string;
}

interface ShowcaseFeatureUiItem {
  id?: string;
  title?: string;
  businessFlag?: number;
  iconKey?: string;
  sourceUi?: unknown;
}

interface ShowcaseFeatureUiConfig {
  schemaVersion?: number;
  source?: unknown;
  featureGroups?: Array<{
    id?: string;
    label?: string;
    features?: ShowcaseFeatureUiItem[];
  }>;
}

interface LocalShowcaseCase {
  id: string;
  title: string;
  industry: string;
  featureId: string;
  summary: string;
  prompt?: string;
  inputUrl?: string;
  outputUrl?: string;
  inputUrls?: string[];
  outputUrls?: string[];
  tone: "studio" | "outdoor" | "product" | "detail" | "model";
}

interface BackendCaseCard extends LocalShowcaseCase {}

interface SavedPromptTemplate {
  id: string;
  title: string;
  viewpoint: Viewpoint;
  featureTitle: string;
  prompt: string;
  imageRefs?: string[];
  createdAt: string;
  updatedAt?: string;
}

function readSavedPromptTemplates(): SavedPromptTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROMPT_TEMPLATE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is SavedPromptTemplate =>
        item &&
        typeof item.id === "string" &&
        typeof item.title === "string" &&
        typeof item.prompt === "string" &&
        ["front", "back", "side"].includes(item.viewpoint) &&
        typeof item.featureTitle === "string" &&
        typeof item.createdAt === "string",
      )
      .map((item) => ({
        ...item,
        imageRefs: Array.isArray(item.imageRefs)
          ? item.imageRefs.filter((ref): ref is string => typeof ref === "string").slice(0, 8)
          : undefined,
      }))
      .slice(0, 24);
  } catch {
    return [];
  }
}

function writeSavedPromptTemplates(templates: SavedPromptTemplate[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PROMPT_TEMPLATE_STORAGE_KEY, JSON.stringify(templates.slice(0, 24)));
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

type ShowcaseUploadRole = "product" | "reference";

interface ShowcaseUploadSlot {
  id: string;
  uploadLabel: string;
  assetLabel: string;
  role: ShowcaseUploadRole;
}

interface ShowcaseAssetLabels {
  panelTitle: string;
  productLabel: string;
  referenceLabel: string;
  uploadSlots: ShowcaseUploadSlot[];
}

interface ShowcaseControlProfile extends ShowcaseAssetLabels {
  showUpload: boolean;
  showUploadTabs: boolean;
  showMaterialLibrary: boolean;
  showViewpoints: boolean;
  showRatio: boolean;
  showQuality: boolean;
  showPrompt: boolean;
  showPromptTools: boolean;
  showPromptTabs: boolean;
  imageCountLabel: string;
}

interface ImagePreviewState {
  url: string;
  title: string;
  label: string;
  alt: string;
}

interface ShowcaseMaterialItem {
  id: string;
  name: string;
  imageUrl: string;
  caseId: string;
  caseTitle: string;
  featureId: string;
  featureTitle: string;
  industry: string;
  summary: string;
  roleLabel: string;
}

type DressingkitMaterialTab = "model" | "pose";

interface DressingkitLibraryMaterial {
  id: string;
  sourceMaterialLibraryId: number;
  sourceFileId: number;
  name: string;
  tab: DressingkitMaterialTab;
  source: string;
  gender: string;
  region: string;
  ageGroup: string;
  favorite: boolean;
  imagePath: string;
}

interface DressingkitMaterialItem extends DressingkitLibraryMaterial {
  imageUrl: string;
}

type ShowcaseIconName =
  | "apparel"
  | "users"
  | "swap-product"
  | "sequence"
  | "zoom"
  | "rotate"
  | "face"
  | "sparkle-user"
  | "user-plus"
  | "user-switch"
  | "pose"
  | "merge-users"
  | "background"
  | "layers"
  | "text-image"
  | "combine"
  | "fabric"
  | "refresh"
  | "lightbulb"
  | "edit"
  | "palette"
  | "wand"
  | "stamp"
  | "pattern"
  | "crop-pattern"
  | "cube"
  | "brush"
  | "layout"
  | "copy-design"
  | "image-copy"
  | "pen"
  | "eraser"
  | "shield"
  | "process"
  | "file-pattern"
  | "grid"
  | "ruler"
  | "upscale"
  | "vector"
  | "sparkle";

const FEATURE_ICON_KEY_BY_TITLE: Record<string, ShowcaseIconName> = {
  "模特产品展示": "apparel",
  "多人场景展示": "users",
  "模特换产品": "swap-product",
  "连拍产品展示": "sequence",
  "产品特写": "zoom",
  "多视角展示": "rotate",
  "Ai换脸": "face",
  "模特修改": "sparkle-user",
  "Ai模特创造": "user-plus",
  "换模特": "user-switch",
  "换姿势": "pose",
  "多人融合": "merge-users",
  "换背景": "background",
  "批量产品展示": "layers",
  "文生图": "text-image",
  "产品融合设计": "combine",
  "材质创新设计": "fabric",
  "材质替换": "refresh",
  "产品灵感设计": "lightbulb",
  "产品改款": "edit",
  "产品改色": "palette",
  "一键改色": "wand",
  "图案应用": "stamp",
  "图案生成": "pattern",
  "图案提取": "crop-pattern",
  "3D图生成": "cube",
  "局部精修": "brush",
  "产品详情页": "layout",
  "产品仿款设计": "copy-design",
  "图片复刻": "image-copy",
  "线稿生款": "pen",
  "Ai移除": "eraser",
  "Ai去水印": "shield",
  "图案工艺": "process",
  "纸样图生成": "file-pattern",
  "平铺图生成": "grid",
  "智能尺码": "ruler",
  "图片变清晰": "upscale",
  "矢量图生成": "vector",
};

const SHOWCASE_ICON_PATHS: Record<ShowcaseIconName, ReactNode> = {
  apparel: (
    <>
      <path d="M9 4h6l2 3 4 2-2 5-2-1v7H7v-7l-2 1-2-5 4-2z" />
      <path d="M9 4c.8 1.4 1.8 2 3 2s2.2-.6 3-2" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="16.5" cy="9" r="2.5" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M14 19a4.5 4.5 0 0 1 6.5 0" />
    </>
  ),
  "swap-product": (
    <>
      <path d="M4 7h9l3 3-3 3H4z" />
      <path d="M20 17h-9l-3-3 3-3h9z" />
    </>
  ),
  sequence: (
    <>
      <rect x="4" y="6" width="5" height="12" rx="1.5" />
      <rect x="10.5" y="4" width="5" height="16" rx="1.5" />
      <rect x="17" y="7" width="3" height="10" rx="1.2" />
    </>
  ),
  zoom: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m16 16 4 4M9 11h4M11 9v4" />
    </>
  ),
  rotate: (
    <>
      <path d="M4 12a8 8 0 0 1 13-6" />
      <path d="M17 3v5h-5" />
      <path d="M20 12a8 8 0 0 1-13 6" />
      <path d="M7 21v-5h5" />
    </>
  ),
  face: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M9 10h.1M15 10h.1M9 15c1.8 1.3 4.2 1.3 6 0" />
    </>
  ),
  "sparkle-user": (
    <>
      <circle cx="10" cy="8" r="3" />
      <path d="M4 20a6 6 0 0 1 12 0" />
      <path d="M18 4v5M15.5 6.5h5M18 15l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </>
  ),
  "user-plus": (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
      <path d="M18 8v8M14 12h8" />
    </>
  ),
  "user-switch": (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="16" r="3" />
      <path d="M3 20a5 5 0 0 1 7-4.6M14 8.5A5 5 0 0 1 21 13" />
      <path d="m18 5 3 3-3 3" />
    </>
  ),
  pose: (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v5l-4 4M12 12l4 4M9 10h6M8 22l4-6 4 6" />
    </>
  ),
  "merge-users": (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="8" r="3" />
      <path d="M3.5 20a5.5 5.5 0 0 1 9-4.2A5.5 5.5 0 0 1 20.5 20" />
      <path d="M11 13h2" />
    </>
  ),
  background: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="m4 16 4.5-4 3.5 3 3-2.5 5 4.5" />
      <circle cx="15.5" cy="9.5" r="1.5" />
    </>
  ),
  layers: (
    <>
      <path d="m12 3 9 5-9 5-9-5z" />
      <path d="m3 12 9 5 9-5" />
      <path d="m3 16 9 5 9-5" />
    </>
  ),
  "text-image": (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M7 9h7M7 13h4M14 16l2-2 2 2" />
    </>
  ),
  combine: (
    <>
      <circle cx="9" cy="10" r="5" />
      <circle cx="15" cy="14" r="5" />
      <path d="M12 8v8" />
    </>
  ),
  fabric: (
    <>
      <path d="M5 5h14v14H5z" />
      <path d="M5 10c3-2 5 2 7 0s4-2 7 0M5 15c3-2 5 2 7 0s4-2 7 0" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7v5h-5" />
      <path d="M4 17v-5h5" />
      <path d="M19 12a7 7 0 0 0-12-5M5 12a7 7 0 0 0 12 5" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M9 18h6M10 22h4" />
      <path d="M8 14a6 6 0 1 1 8 0c-1 1-1 2-1 4H9c0-2 0-3-1-4z" />
    </>
  ),
  edit: (
    <>
      <path d="M17 3 21 7 10 18l-5 1 1-5z" />
      <path d="M4 22h16M15 5l4 4" />
    </>
  ),
  palette: (
    <>
      <path d="M12 4a8 8 0 0 0 0 16h1.5a2 2 0 0 0 1.5-3.3 1.6 1.6 0 0 1 1.2-2.7H18a6 6 0 0 0-6-10z" />
      <path d="M8 10h.1M10.5 7.5h.1M14 8h.1M7.5 14h.1" />
    </>
  ),
  wand: (
    <>
      <path d="m4 20 9-9" />
      <path d="m11 9 4 4" />
      <path d="M18 4v4M16 6h4M6 5l1 2 2 1-2 1-1 2-1-2-2-1 2-1z" />
    </>
  ),
  stamp: (
    <>
      <path d="M9 4h6v5l2 3v3H7v-3l2-3z" />
      <path d="M5 20h14M7 15h10" />
    </>
  ),
  pattern: (
    <>
      <rect x="5" y="5" width="6" height="6" rx="1" />
      <rect x="13" y="5" width="6" height="6" rx="1" />
      <rect x="5" y="13" width="6" height="6" rx="1" />
      <rect x="13" y="13" width="6" height="6" rx="1" />
    </>
  ),
  "crop-pattern": (
    <>
      <path d="M6 3v15h15" />
      <path d="M3 6h15v15" />
      <path d="M10 10h5v5h-5z" />
    </>
  ),
  cube: (
    <>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
      <path d="M12 12 4 7.5M12 12l8-4.5M12 12v9" />
    </>
  ),
  brush: (
    <>
      <path d="M15 4 21 10 11 20H5v-6z" />
      <path d="m13 6 5 5M5 20l-2 2" />
    </>
  ),
  layout: (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M4 9h16M9 9v11M12 13h5M12 16h5" />
    </>
  ),
  "copy-design": (
    <>
      <rect x="7" y="7" width="12" height="12" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
      <path d="M10 12h6M10 15h4" />
    </>
  ),
  "image-copy": (
    <>
      <rect x="7" y="7" width="12" height="12" rx="2" />
      <path d="M4 15V5a2 2 0 0 1 2-2h10" />
      <path d="m9 16 3-3 2 2 2-2 3 3" />
    </>
  ),
  pen: (
    <>
      <path d="M4 20c5-1 9-5 12-12l-4-4C5 7 2 13 4 20z" />
      <path d="m12 4 8 8M8 16l3-3" />
    </>
  ),
  eraser: (
    <>
      <path d="m4 15 8-8a3 3 0 0 1 4 0l4 4-9 9H6z" />
      <path d="M13 20h8M9 11l6 6" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 20 6v6c0 5-3.3 8.2-8 9-4.7-.8-8-4-8-9V6z" />
      <path d="m9 12 2 2 4-5" />
    </>
  ),
  process: (
    <>
      <path d="M5 7h14M5 12h14M5 17h14" />
      <path d="M8 5v4M16 10v4M11 15v4" />
    </>
  ),
  "file-pattern": (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M8 13h8M8 17h5" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M4 10h16M4 15h16M9 5v14M15 5v14" />
    </>
  ),
  ruler: (
    <>
      <path d="m4 17 13-13 3 3L7 20z" />
      <path d="M8 13l2 2M11 10l2 2M14 7l2 2" />
    </>
  ),
  upscale: (
    <>
      <rect x="4" y="6" width="14" height="14" rx="2" />
      <path d="M14 4h6v6M20 4l-8 8M8 16h5" />
    </>
  ),
  vector: (
    <>
      <path d="M6 18 18 6M7 6h10v10" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="6" r="2" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 3l2.3 5.7L20 11l-5.7 2.3L12 19l-2.3-5.7L4 11l5.7-2.3z" />
      <path d="M19 3v4M17 5h4M5 17v4M3 19h4" />
    </>
  ),
};

const CATEGORIES: Array<{
  id: ShowcaseCategoryId;
  label: string;
  features: ShowcaseFeature[];
}> = [
  {
    id: "marketing",
    label: "Ai营销",
    features: [
      { id: "model-product-display", title: "模特产品展示", subtitle: "服装上身与商拍展示", businessFlag: 50 },
      { id: "multi-person-scene", title: "多人场景展示", subtitle: "多人同框与组合营销", businessFlag: 51 },
      { id: "model-change-product", title: "模特换产品", subtitle: "保留模特并替换商品", businessFlag: 52 },
      { id: "continuous-product", title: "连拍产品展示", subtitle: "多姿态连拍图组", businessFlag: 53 },
      { id: "product-closeup", title: "产品特写", subtitle: "材质、纹理和卖点特写", businessFlag: 54 },
      { id: "multi-view", title: "多视角展示", subtitle: "正面、背面、侧面同步生成", businessFlag: 55 },
      { id: "face-swap", title: "Ai换脸", subtitle: "参考脸部一致性迁移", businessFlag: 5 },
      { id: "model-retouch", title: "模特修改", subtitle: "模特细节与风格调整", businessFlag: 77 },
      { id: "model-create", title: "Ai模特创造", subtitle: "创建专属品牌模特", businessFlag: 6 },
      { id: "change-model", title: "换模特", subtitle: "同款换人群画像", businessFlag: 56 },
      { id: "change-pose", title: "换姿势", subtitle: "动作、表情、站姿调整", businessFlag: 57 },
      { id: "multi-person-fusion", title: "多人融合", subtitle: "多主体自然合成", businessFlag: 58 },
      { id: "change-background", title: "换背景", subtitle: "保留主体并重建场景", businessFlag: 59 },
      { id: "batch-product-display", title: "批量产品展示", subtitle: "批量商品图生产", businessFlag: 308 },
    ],
  },
  {
    id: "product-design",
    label: "Ai产品设计",
    features: [
      { id: "text-to-image", title: "文生图", subtitle: "用文字生成产品概念图", businessFlag: 83 },
      { id: "product-fusion-design", title: "产品融合设计", subtitle: "多产品元素融合探索", businessFlag: 61 },
      { id: "material-innovation-design", title: "材质创新设计", subtitle: "新材质方向快速试稿", businessFlag: 62 },
      { id: "material-replacement", title: "材质替换", subtitle: "面料、皮革、金属等材质", businessFlag: 73 },
      { id: "product-inspiration-design", title: "产品灵感设计", subtitle: "从灵感图生成设计方向", businessFlag: 63 },
      { id: "product-redesign", title: "产品改款", subtitle: "版型、结构和细节改造", businessFlag: 64 },
      { id: "product-recolor", title: "产品改色", subtitle: "多色系产品变体", businessFlag: 65 },
      { id: "one-click-recolor", title: "一键改色", subtitle: "快速批量输出色彩方案", businessFlag: 66 },
      { id: "pattern-application", title: "图案应用", subtitle: "把图案落到商品表面", businessFlag: 67 },
      { id: "pattern-generation", title: "图案生成", subtitle: "服装图案与纹理探索", businessFlag: 74 },
      { id: "pattern-extraction", title: "图案提取", subtitle: "从参考图提取图案元素", businessFlag: 68 },
      { id: "3d-image-generation", title: "3D图生成", subtitle: "生成产品三维视觉稿", businessFlag: 69 },
      { id: "partial-retouch", title: "局部精修", subtitle: "局部结构和瑕疵修正", businessFlag: 75 },
      { id: "product-detail-page", title: "产品详情页", subtitle: "详情页场景和卖点图", businessFlag: 82 },
      { id: "product-copycat-design", title: "产品仿款设计", subtitle: "参考款式生成变体", businessFlag: 60 },
      { id: "image-replication", title: "图片复刻", subtitle: "复刻参考图片构图与风格", businessFlag: 84 },
      { id: "sketch-to-style", title: "线稿生款", subtitle: "从线稿生成款式图", businessFlag: 85 },
    ],
  },
  {
    id: "production",
    label: "Ai生产",
    features: [
      { id: "ai-remove", title: "Ai移除", subtitle: "移除画面多余元素", businessFlag: 71 },
      { id: "ai-watermark-removal", title: "Ai去水印", subtitle: "清理水印和遮挡内容", businessFlag: 36 },
      { id: "pattern-process", title: "图案工艺", subtitle: "图案工艺图和生产参考", businessFlag: 76 },
      { id: "paper-pattern-generation", title: "纸样图生成", subtitle: "服装纸样和版型参考", businessFlag: 86 },
      { id: "flat-layout-generation", title: "平铺图生成", subtitle: "货架、平铺和白底图", businessFlag: 87 },
      { id: "smart-sizing", title: "智能尺码", subtitle: "尺码规格与版型辅助", businessFlag: 88 },
      { id: "image-upscale", title: "图片变清晰", subtitle: "提升清晰度和细节", businessFlag: 89 },
      { id: "vector-generation", title: "矢量图生成", subtitle: "生成可复用矢量视觉稿", businessFlag: 39 },
    ],
  },
];

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

const DRESSINGKIT_MATERIALS = rawDressingkitMaterials as DressingkitLibraryMaterial[];
const DRESSINGKIT_IMAGE_SHARED_SITE = rawDressingkitImageShared as OemPublicSiteConfig;
const MATERIAL_SOURCE_FILTERS = ["全部", "我的模特", "系统模特", "真人模特"];
const MATERIAL_GENDER_FILTERS = ["全部", "男性", "女性"];
const MATERIAL_AGE_FILTERS = ["全部", "婴幼儿", "儿童", "青年", "中年", "老年"];
const MATERIAL_REGION_FILTERS = [
  "全部",
  "东亚裔",
  "东南亚裔",
  "南亚裔",
  "中东裔",
  "拉丁美洲裔",
  "北美原住民裔",
  "大洋洲裔",
  "混血",
  "欧洲裔",
  "非洲裔",
];

const VIEWPOINT_LABELS: Record<Viewpoint, string> = {
  front: "正面视角",
  back: "背面视角",
  side: "侧面视角",
};

const DEFAULT_PROMPTS: Record<Viewpoint, string> = {
  front:
    "#【请务必生成一张符合以下描述的图像】，按照下列要求生成这套衣服的全身图，性别：女，种族：欧美（金色头发，白皮肤，蓝色眼睛），年龄：30岁，身材：匀称，身高：178cm，尺码：普通码，表情：微笑，姿势：自动匹配合适的姿势，视角：正面，穿搭：自动匹配合适的穿搭，背景：摄影棚，白色背景，#其他细节：保持服装的面料质感、颜色、文字、图案、纹理、设计细节，人物不变",
  back:
    "#【请务必生成一张符合以下描述的图像】，按照下列要求生成这套衣服的全身图，性别：女，种族：欧美，年龄：30岁，身材：匀称，身高：178cm，表情自然，姿势：自动匹配合适的背面展示姿势，视角：背面，背景：摄影棚，白色背景，#其他细节：保持服装背部版型、面料质感、颜色、文字、图案、纹理和设计细节",
  side:
    "#【请务必生成一张符合以下描述的图像】，按照下列要求生成这套衣服的全身图，性别：女，种族：欧美，年龄：30岁，身材：匀称，身高：178cm，表情自然，姿势：自动匹配合适的侧身展示姿势，视角：侧面，背景：摄影棚，白色背景，#其他细节：保持服装廓形、面料质感、颜色、文字、图案、纹理和设计细节",
};

function defaultPromptForFeature(feature: ShowcaseFeature): string {
  if (feature.id === "multi-person-fusion") {
    return "请基于上传素材生成多人同框商业展示图，人物比例自然，服装和产品细节清晰，画面适合电商营销使用。";
  }
  if (feature.id === "batch-product-display") {
    return "请基于上传素材批量生成产品展示图，保持主体、材质、颜色、文字和结构一致，背景干净，构图统一。";
  }
  if (feature.id === "text-to-image") {
    return "请生成一张适合电商营销使用的高清商业图片，主体清晰，构图干净，光线自然，避免无来源改款。";
  }
  return `请基于上传素材生成${feature.title}图片，保持主体、材质、颜色、文字、图案和可识别卖点一致，画面适合商业投放。`;
}

function promptDraftsForFeature(feature: ShowcaseFeature): Record<Viewpoint, string> {
  const profile = controlProfileForFeature(feature);
  if (profile.showPromptTabs) return DEFAULT_PROMPTS;
  const prompt = defaultPromptForFeature(feature);
  return {
    front: prompt,
    back: prompt,
    side: prompt,
  };
}

const LOCAL_CASES: LocalShowcaseCase[] = [
  { id: "case-white-suit", title: "白色西装", industry: "服饰类", featureId: "model-product-display", summary: "白底模特商拍", tone: "studio" },
  { id: "case-fixed-background", title: "固定背景穿搭", industry: "服饰类", featureId: "model-product-display", summary: "固定场景换衣", tone: "outdoor" },
  { id: "case-half-body-bg", title: "背景-半身图", industry: "服饰类", featureId: "change-background", summary: "半身图场景化", tone: "model" },
  { id: "case-texture-style", title: "质感强的款式", industry: "服饰类", featureId: "product-closeup", summary: "面料质感强化", tone: "detail" },
  { id: "case-reference-model", title: "参考模特换衣", industry: "服饰类", featureId: "change-model", summary: "参考模特一致", tone: "model" },
  { id: "case-back-try-on", title: "背面换衣", industry: "服饰类", featureId: "multi-view", summary: "背面版型展示", tone: "studio" },
  { id: "case-side-bg", title: "侧面试衣-带背景", industry: "服饰类", featureId: "multi-view", summary: "侧身带场景", tone: "outdoor" },
  { id: "case-kids", title: "儿童试衣", industry: "服饰类", featureId: "model-product-display", summary: "童装模特展示", tone: "model" },
  { id: "case-kids-02", title: "儿童试衣02", industry: "服饰类", featureId: "model-product-display", summary: "儿童场景商拍", tone: "studio" },
  { id: "case-back-bg", title: "背面试衣-背景", industry: "服饰类", featureId: "change-background", summary: "背面场景生成", tone: "outdoor" },
  { id: "case-xhs", title: "小红书", industry: "服饰类", featureId: "model-product-display", summary: "内容平台种草图", tone: "model" },
  { id: "case-single-0344", title: "单人试衣0344", industry: "服饰类", featureId: "model-product-display", summary: "单人试衣图", tone: "studio" },
  { id: "case-sportswear", title: "运动装", industry: "运动户外类", featureId: "model-product-display", summary: "运动服装展示", tone: "outdoor" },
  { id: "case-menswear", title: "男装", industry: "服饰类", featureId: "change-model", summary: "男装模特展示", tone: "model" },
  { id: "case-shoes", title: "鞋子", industry: "运动户外类", featureId: "product-closeup", summary: "鞋履产品展示", tone: "product" },
  { id: "case-sofa", title: "沙发", industry: "家居类", featureId: "change-background", summary: "家居场景图", tone: "product" },
  { id: "case-motor", title: "电动摩托车", industry: "汽车交通类", featureId: "change-background", summary: "交通工具营销图", tone: "outdoor" },
  { id: "case-building", title: "建筑营销大片", industry: "建筑类", featureId: "change-background", summary: "建筑氛围图", tone: "outdoor" },
  { id: "case-watch", title: "手表", industry: "珠宝首饰类", featureId: "product-closeup", summary: "腕表特写", tone: "detail" },
  { id: "case-bench", title: "实木长椅", industry: "家居类", featureId: "product-closeup", summary: "实木材质展示", tone: "product" },
  { id: "case-earrings", title: "耳环", industry: "珠宝首饰类", featureId: "product-closeup", summary: "首饰细节图", tone: "detail" },
  { id: "case-full-match", title: "全身搭配展示", industry: "服饰类", featureId: "model-product-display", summary: "整套穿搭图", tone: "model" },
];

const ALL_FEATURES = CATEGORIES.flatMap((category) => category.features);
const FEATURE_IDS = new Set(ALL_FEATURES.map((feature) => feature.id));
const FEATURE_ID_BY_BUSINESS_FLAG = new Map(
  ALL_FEATURES
    .filter((feature) => typeof feature.businessFlag === "number")
    .map((feature) => [String(feature.businessFlag), feature.id]),
);
const REFINEMENT_FEATURE_IDS = new Set([
  "partial-retouch",
]);
const REFINEMENT_TOOLS: Array<{ id: RefinementTool; label: string; icon: string }> = [
  { id: "select", label: "选择", icon: "↖" },
  { id: "pan", label: "平移画布", icon: "✣" },
  { id: "rotate", label: "旋转", icon: "↻" },
  { id: "crop", label: "框选", icon: "□" },
  { id: "brush", label: "画笔", icon: "✎" },
  { id: "clear", label: "清除标注", icon: "⌫" },
];

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

function isShowcaseBackendCase(item: OemPublicCase): boolean {
  const tags = item.tags || [];
  return tags.includes("ai-image-showcase") || tags.includes("dressingkit-compatible");
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

function mergeWithSharedDressingkitSite(site: OemPublicSiteConfig | null | undefined): OemPublicSiteConfig {
  return {
    tenantId: site?.tenantId || DRESSINGKIT_IMAGE_SHARED_SITE.tenantId,
    slug: site?.slug,
    displayName: site?.displayName,
    primaryDomain: site?.primaryDomain,
    cases: uniqueById([
      ...(DRESSINGKIT_IMAGE_SHARED_SITE.cases || []),
      ...(site?.cases || []),
    ]),
    materials: uniqueById([
      ...(DRESSINGKIT_IMAGE_SHARED_SITE.materials || []),
      ...(site?.materials || []),
    ]),
    assets: uniqueById([
      ...(DRESSINGKIT_IMAGE_SHARED_SITE.assets || []),
      ...(site?.assets || []),
    ]),
    featureFlags: {
      ...(DRESSINGKIT_IMAGE_SHARED_SITE.featureFlags || {}),
      ...(site?.featureFlags || {}),
    },
    featureFlagItems: site?.featureFlagItems,
  };
}

function tagValue(tags: string[] | undefined, prefix: string): string {
  const tag = (tags || []).find((item) => item.startsWith(prefix));
  return tag ? tag.slice(prefix.length).trim() : "";
}

function featureIdFromTags(tags: string[] | undefined): string {
  const explicitFeatureId = tagValue(tags, "feature:");
  if (FEATURE_IDS.has(explicitFeatureId)) return explicitFeatureId;

  const businessFlagTag = (tags || []).find((tag) => tag.startsWith("dressingkit-business-"));
  const businessFlag = businessFlagTag?.replace("dressingkit-business-", "") || "";
  const featureId = FEATURE_ID_BY_BUSINESS_FLAG.get(businessFlag);
  if (featureId) return featureId;

  const plainFeatureId = (tags || []).find((tag) => FEATURE_IDS.has(tag));
  return plainFeatureId || "model-product-display";
}

function featureIdFromCase(item: OemPublicCase): string {
  return featureIdFromTags(item.tags);
}

function roleFromAsset(ref: string, asset?: OemPublicAsset): "input" | "output" | "unknown" {
  const roleText = `${asset?.group || ""} ${asset?.role || ""}`.toLowerCase();
  if (roleText.includes("output") || roleText.includes("输出")) return "output";
  if (roleText.includes("input") || roleText.includes("输入")) return "input";
  const text = `${ref} ${asset?.caption || ""} ${asset?.fileName || ""}`.toLowerCase();
  if (text.includes("output") || text.includes("输出")) return "output";
  if (text.includes("input") || text.includes("输入")) return "input";
  return "unknown";
}

function isImageAsset(ref: string, asset?: OemPublicAsset): boolean {
  const kind = (asset?.kind || "").toLowerCase();
  if (kind === "video") return false;
  if (kind === "image") return true;

  const mimeType = (asset?.mimeType || "").toLowerCase();
  if (mimeType.startsWith("video/")) return false;
  if (mimeType.startsWith("image/")) return true;

  const source = `${asset?.publicUrl || ""} ${ref}`.toLowerCase();
  if (/^data:video\//.test(source)) return false;
  if (/^data:image\//.test(source)) return true;
  return /\.(avif|gif|jpe?g|png|webp)(?:$|[?#\s])/.test(source);
}

function caseImageGroupsFromRefs(
  mediaRefs: string[] | undefined,
  assetsById: Map<string, OemPublicAsset>,
): { inputUrls: string[]; outputUrls: string[] } {
  const inputUrls: string[] = [];
  const outputUrls: string[] = [];
  const unknownUrls: string[] = [];

  for (const ref of mediaRefs || []) {
    const asset = assetsById.get(ref);
    if (!isImageAsset(ref, asset)) continue;
    const url = /^(https?:|data:image\/|blob:|local-asset:)/i.test(ref)
      ? ref
      : asset?.publicUrl || "";
    if (!url) continue;

    const role = roleFromAsset(ref, asset);
    if (role === "input") {
      inputUrls.push(url);
    } else if (role === "output") {
      outputUrls.push(url);
    } else {
      unknownUrls.push(url);
    }
  }

  if (!inputUrls.length && !outputUrls.length && unknownUrls.length) {
    return {
      inputUrls: unknownUrls.slice(0, 1),
      outputUrls: unknownUrls.slice(1),
    };
  }
  if (!inputUrls.length && unknownUrls.length) inputUrls.push(unknownUrls[0]);
  if (!outputUrls.length && unknownUrls.length > 1) outputUrls.push(...unknownUrls.slice(1));
  if (!outputUrls.length && inputUrls.length === 1 && unknownUrls.length === 0) outputUrls.push(inputUrls[0]);
  return { inputUrls, outputUrls };
}

function buildBackendCards(cases: OemPublicCase[], assets: OemPublicAsset[]): BackendCaseCard[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  return cases.filter(isShowcaseBackendCase).map((item, index) => {
    const { inputUrls, outputUrls } = caseImageGroupsFromRefs(item.mediaRefs, assetsById);
    return {
      id: item.id,
      title: item.title,
      industry: item.industry || "未分类",
      featureId: featureIdFromCase(item),
      summary: item.summary || "OEM 后端案例素材",
      prompt: item.prompt,
      inputUrl: inputUrls[0],
      outputUrl: outputUrls[0] || inputUrls[0],
      inputUrls,
      outputUrls,
      tone: (["studio", "outdoor", "product", "detail", "model"] as const)[index % 5],
    };
  });
}

function imageAssetRefsFromCards(cards: BackendCaseCard[]): Set<string> {
  const refs = new Set<string>();
  for (const card of cards) {
    for (const ref of card.inputUrls || []) refs.add(ref);
    for (const ref of card.outputUrls || []) refs.add(ref);
  }
  return refs;
}

function imageAssetsForCards(cards: BackendCaseCard[], assets: OemPublicAsset[]): OemPublicAsset[] {
  const publicUrls = imageAssetRefsFromCards(cards);
  return assets.filter((asset) =>
    asset.publicUrl &&
    publicUrls.has(asset.publicUrl) &&
    isImageAsset(asset.id, asset),
  );
}

function urlsForRole(item: LocalShowcaseCase, role: "input" | "output"): string[] {
  const urls = role === "input"
    ? item.inputUrls || (item.inputUrl ? [item.inputUrl] : [])
    : item.outputUrls || (item.outputUrl ? [item.outputUrl] : []);
  return urls.filter(Boolean);
}

function rendererPublicAssetUrl(assetPath: string): string {
  if (/^(https?:|data:image\/|blob:|local-asset:)/i.test(assetPath)) return assetPath;
  const normalizedPath = assetPath.replace(/^\/+/, "");
  const url = new URL(`./${normalizedPath}`, window.location.href);
  if (url.protocol !== "file:") return url.toString();
  const pathname = decodeURIComponent(url.pathname);
  return `local-asset://${encodeURI(pathname).replace(/#/g, "%23")}`;
}

function imageAssetSource(assetRef: string): string {
  if (/^(https?:|data:image\/|blob:|local-asset:)/i.test(assetRef)) return assetRef;
  const normalized = assetRef.replace(/\\/g, "/");
  let absolutePath = normalized;
  if (/^[A-Za-z]:\//.test(normalized)) absolutePath = `/${normalized}`;
  else if (!normalized.startsWith("/")) absolutePath = `/${normalized}`;
  return `local-asset://${encodeURI(absolutePath).replace(/#/g, "%23")}`;
}

function MaterialFilterRow({
  label,
  value,
  values,
  onChange,
}: {
  label: string;
  value: string;
  values: string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="ai-material-filter-row">
      <span>{label}</span>
      <div className="ai-material-filter-tags">
        {values.map((item) => (
          <button
            key={item}
            type="button"
            className={value === item ? "active" : ""}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readFeatureUiConfig(site: OemPublicSiteConfig): ShowcaseFeatureUiConfig | null {
  const value = site.featureFlags?.["ai-image-showcase-ui"];
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

function indexFeatureUiById(config: ShowcaseFeatureUiConfig | null): Map<string, ShowcaseFeatureUiItem> {
  const map = new Map<string, ShowcaseFeatureUiItem>();
  for (const group of config?.featureGroups || []) {
    for (const feature of group.features || []) {
      if (feature.id) map.set(feature.id, feature);
    }
  }
  return map;
}

function indexFeatureUiByTitle(config: ShowcaseFeatureUiConfig | null): Map<string, ShowcaseFeatureUiItem> {
  const map = new Map<string, ShowcaseFeatureUiItem>();
  for (const group of config?.featureGroups || []) {
    for (const feature of group.features || []) {
      if (feature.title) map.set(feature.title, feature);
    }
  }
  return map;
}

function normalizeIconName(value: string | undefined): ShowcaseIconName | undefined {
  if (!value) return undefined;
  return Object.prototype.hasOwnProperty.call(SHOWCASE_ICON_PATHS, value)
    ? value as ShowcaseIconName
    : undefined;
}

function iconKeyForFeature(
  feature: ShowcaseFeature,
  featureUiById: Map<string, ShowcaseFeatureUiItem>,
  featureUiByTitle: Map<string, ShowcaseFeatureUiItem>,
): ShowcaseIconName {
  return (
    normalizeIconName(featureUiById.get(feature.id)?.iconKey) ||
    normalizeIconName(featureUiByTitle.get(feature.title)?.iconKey) ||
    normalizeIconName(feature.iconKey) ||
    FEATURE_ICON_KEY_BY_TITLE[feature.title] ||
    "sparkle"
  );
}

function FeatureButtonIcon({ iconKey }: { iconKey: ShowcaseIconName }) {
  return (
    <span className="ai-feature-icon-wrap" aria-hidden="true">
      <svg className="ai-feature-icon" viewBox="0 0 24 24">
        {SHOWCASE_ICON_PATHS[iconKey]}
      </svg>
    </span>
  );
}

function CaseActionIcon({ name }: { name: "preview" | "try" }) {
  return (
    <svg className="ai-case-action-icon" viewBox="0 0 24 24" aria-hidden="true">
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

function ImageStack({
  item,
  role,
  variant = "card",
  onOpenImage,
}: {
  item: LocalShowcaseCase;
  role: "input" | "output";
  variant?: "card" | "preview";
  onOpenImage?: (preview: ImagePreviewState) => void;
}) {
  const urls = urlsForRole(item, role);
  const label = role === "input" ? "输入图" : "输出图";
  const cardLimit = 4;
  const visibleUrls = variant === "preview" ? urls : urls.slice(0, cardLimit);
  const hiddenCount = variant === "card" ? Math.max(0, urls.length - visibleUrls.length) : 0;
  const className = [
    "ai-image-stack",
    `role-${role}`,
    urls.length > 1 ? "has-multiple" : "",
    variant === "preview" ? "is-preview" : "",
  ].filter(Boolean).join(" ");
  return (
    <div className={className}>
      <span className="ai-image-stack-label">{label}</span>
      {urls.length ? (
        <div className="ai-image-stack-grid" data-count={Math.min(visibleUrls.length, 4)} data-role={role}>
          {visibleUrls.map((url, index) => {
            const alt = `${item.title} ${label} ${index + 1}`;
            return (
              <div key={`${url}-${index}`} className="ai-image-frame">
                {onOpenImage ? (
                  <button
                    type="button"
                    className="ai-image-open-button"
                    aria-label={`查看${alt}`}
                    onClick={() => onOpenImage({ url, title: item.title, label, alt })}
                  >
                    <img src={url} alt={alt} loading="lazy" />
                  </button>
                ) : (
                  <img src={url} alt={alt} loading="lazy" />
                )}
                {hiddenCount && index === visibleUrls.length - 1 ? (
                  <span className="ai-image-more">+{hiddenCount}</span>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <TonePlaceholder title={item.title} label={label} tone={item.tone} />
      )}
    </div>
  );
}

function TonePlaceholder({ title, label, tone }: { title: string; label: string; tone: LocalShowcaseCase["tone"] }) {
  return (
    <div className="ai-showcase-placeholder" data-tone={tone}>
      <span>{label}</span>
      <strong>{title.slice(0, 4)}</strong>
    </div>
  );
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

function promptFromImageLog(log: GenerationLogEntry): string {
  const inputPrompt = log.input && typeof log.input === "object"
    ? (log.input as Record<string, unknown>).prompt
    : undefined;
  if (typeof inputPrompt === "string" && inputPrompt.trim()) return inputPrompt;
  return log.summary || log.title;
}

function stringFromInputField(log: GenerationLogEntry, key: string): string {
  if (!log.input || typeof log.input !== "object") return "";
  const value = (log.input as Record<string, unknown>)[key];
  return typeof value === "string" ? value.trim() : "";
}

function historyEntryFromImageLog(log: GenerationLogEntry): HistoryEntry | null {
  if (log.kind !== "image") return null;
  const featureTitle = stringFromInputField(log, "featureTitle") || "AI 生图";
  const jobType = stringFromInputField(log, "featureTitle") || log.title;
  const inputRefs = [
    ...stringArrayFromField(log.input, "productImageRefs"),
    ...stringArrayFromField(log.input, "referenceImageRefs"),
  ];
  const outputRefs = [
    ...stringArrayFromField(log.output, "assetRefs"),
    ...(log.artifactRefs || []),
  ];
  const uniqueInputRefs = Array.from(new Set(inputRefs));
  const uniqueOutputRefs = Array.from(new Set(outputRefs));
  const hasOutput = uniqueOutputRefs.length > 0;
  const normalizedStatus = log.status === "succeeded" && !hasOutput ? "failed" : log.status;
  const statusTone: HistoryEntry["tone"] =
    normalizedStatus === "succeeded" ? "ready" :
    normalizedStatus === "failed" || normalizedStatus === "blocked" || normalizedStatus === "cancelled" ? "blocked" :
    "warning";
  const emptySuccessMessage = "生成服务未返回可展示图片，已按失败记录处理。";
  return {
    id: `log:${log.id}`,
    title: log.title,
    detail: log.status === "succeeded" && !hasOutput
      ? emptySuccessMessage
      : log.summary || log.error || promptFromImageLog(log),
    tone: statusTone,
    createdAt: log.createdAt,
    featureTitle,
    jobType,
    status: normalizedStatus,
    statusText: normalizedStatus === "succeeded" ? "生成完成" : statusLabel(normalizedStatus),
    inputRefs: uniqueInputRefs,
    outputRefs: uniqueOutputRefs,
    prompt: promptFromImageLog(log),
    logId: log.id,
    source: "global",
  };
}

function mergeHistoryEntries(localEntries: HistoryEntry[], logs: GenerationLogEntry[]): HistoryEntry[] {
  const entriesByKey = new Map<string, HistoryEntry>();
  for (const entry of localEntries) {
    if (!isGenerationHistoryEntry(entry)) continue;
    const key = entry.logId ? `log:${entry.logId}` : `local:${entry.id}`;
    entriesByKey.set(key, { ...entry, source: entry.source || "local" });
  }
  for (const log of logs) {
    const entry = historyEntryFromImageLog(log);
    if (!entry) continue;
    const key = `log:${log.id}`;
    const local = entriesByKey.get(key);
    entriesByKey.set(key, local ? { ...local, ...entry, id: local.id, source: local.source || entry.source } : entry);
  }
  return [...entriesByKey.values()]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 32);
}

function ImageHistoryThumbGrid({ refs }: { refs: string[] }) {
  const visibleRefs = refs.slice(0, 4);
  const hiddenCount = Math.max(0, refs.length - visibleRefs.length);
  return (
    <span className="ai-history-thumb-grid" data-count={Math.min(visibleRefs.length, 4)}>
      {visibleRefs.map((ref, index) => (
        <img key={`${ref}-${index}`} src={imageAssetSource(ref)} alt="" loading="lazy" />
      ))}
      {hiddenCount ? <em>+{hiddenCount}</em> : null}
    </span>
  );
}

function ImageHistoryAssetGrid({
  refs,
  label,
  onOpenImage,
  showActions = false,
}: {
  refs: string[];
  label: string;
  onOpenImage: (preview: ImagePreviewState) => void;
  showActions?: boolean;
}) {
  if (!refs.length) {
    return <div className="ai-history-section-empty">暂无{label}</div>;
  }
  return (
    <div className="ai-history-asset-grid" data-count={Math.min(refs.length, 6)}>
      {refs.map((ref, index) => {
        const source = imageAssetSource(ref);
        const title = `${label} ${index + 1}`;
        const openPreview = () => onOpenImage({ url: source, title, label, alt: title });
        return (
          <figure
            key={`${ref}-${index}`}
            className="ai-history-asset"
          >
            <button
              type="button"
              className="ai-history-asset-preview"
              aria-label={`预览${title}`}
              onClick={openPreview}
            >
              <img src={source} alt={title} loading="lazy" />
            </button>
            {showActions ? (
              <figcaption className="ai-history-asset-actions">
                <button type="button" onClick={openPreview}>预览</button>
                <a href={source} download={`bugu-${title}.png`} onClick={(event) => event.stopPropagation()}>下载</a>
              </figcaption>
            ) : null}
          </figure>
        );
      })}
    </div>
  );
}

function ImageHistoryDrawer({
  entries,
  featureTitle,
  backendCaseCount,
  backendAssetCount,
  selectedFeatureCaseCount,
  uploadCount,
  selectedMaterialName,
  mediaResult,
  onOpenImage,
  onPartialRetouch,
  onClose,
}: {
  entries: HistoryEntry[];
  featureTitle: string;
  backendCaseCount: number;
  backendAssetCount: number;
  selectedFeatureCaseCount: number;
  uploadCount: number;
  selectedMaterialName?: string;
  mediaResult: MediaGenerationResult | null;
  onOpenImage: (preview: ImagePreviewState) => void;
  onPartialRetouch: (entry: HistoryEntry) => void;
  onClose: () => void;
}) {
  const records = entries;
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
  const loadedSummary = `案例 ${backendCaseCount} 组 · 资产 ${backendAssetCount} 张 · 当前功能 ${selectedFeatureCaseCount} 组`;
  return (
    <div className="ai-history-layer" role="presentation" onClick={onClose}>
      <section
        className="ai-history-drawer"
        role="dialog"
        aria-modal="true"
        aria-label="历史记录"
        onClick={(event) => event.stopPropagation()}
        data-empty={selectedEntry ? "false" : "true"}
      >
        <header className="ai-history-modal-header">
          <h2>历史记录</h2>
          <div className="ai-history-modal-actions">
            <button type="button" aria-label="刷新历史记录">↻</button>
            <button type="button" aria-label="关闭历史记录" onClick={onClose}>×</button>
          </div>
        </header>
        <div className="ai-history-toolbar">
          <button type="button" className="ai-history-filter">
            全部 <span>⌄</span>
          </button>
          <div className="ai-history-date-range" aria-label="时间范围">
            <span>▦</span>
            <em>开始时间</em>
            <strong>To</strong>
            <em>结束时间</em>
          </div>
          <button type="button" className="ai-history-query">查询</button>
          <button type="button" className="ai-history-download">批量下载</button>
        </div>
        <div className="ai-history-modal-body">
          <aside className="ai-history-record-list" aria-label="历史记录列表">
            {records.length ? (
              records.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className={entry.id === selectedEntry?.id ? "ai-history-record-thumb active" : "ai-history-record-thumb"}
                  onClick={() => setSelectedId(entry.id)}
                >
                  <ImageHistoryThumbGrid refs={historyRecordRefs(entry)} />
                </button>
              ))
            ) : (
              <div className="ai-history-empty-list">暂无记录</div>
            )}
          </aside>

          {selectedEntry ? (
            <main className="ai-history-detail">
              <div className="ai-history-meta-row">
                <span>{historyTaskNumber(selectedEntry)}</span>
                <span>{selectedEntry.jobType || selectedEntry.featureTitle || featureTitle}</span>
                <span className={`tone-${selectedEntry.tone}`}>{historyStatusText(selectedEntry)}</span>
                <span>{formatHistoryDateTime(selectedEntry.createdAt)}</span>
              </div>
              <div className="ai-history-operation-row">
                <button type="button">发送到素材库</button>
                <button
                  type="button"
                  disabled={!selectedEntry.outputRefs?.length}
                  onClick={() => onPartialRetouch(selectedEntry)}
                >
                  局部精修
                </button>
              </div>
              <section className="ai-history-section">
                <h3>输入文件</h3>
                <ImageHistoryAssetGrid
                  refs={selectedEntry.inputRefs || []}
                  label="输入文件"
                  onOpenImage={onOpenImage}
                />
              </section>
              <section className="ai-history-section">
                <h3>生成结果</h3>
                <ImageHistoryAssetGrid
                  refs={selectedEntry.outputRefs || []}
                  label="生成结果"
                  onOpenImage={onOpenImage}
                  showActions
                />
              </section>
              <section className="ai-history-section ai-history-prompt-section">
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
              <p className="ai-history-footnote">
                {loadedSummary} · {uploadCount} 张输入素材 · {selectedMaterialName ? `素材 ${selectedMaterialName}` : "未选素材库"} · {mediaResult ? statusLabel(mediaResult.status) : "未生成"}
              </p>
            </main>
          ) : (
            <main className="ai-history-detail ai-history-empty-detail">
              <section className="ai-history-section">
                <h3>输入文件</h3>
                <ImageHistoryAssetGrid
                  refs={[]}
                  label="输入文件"
                  onOpenImage={onOpenImage}
                />
              </section>
              <section className="ai-history-section">
                <h3>生成结果</h3>
                <ImageHistoryAssetGrid
                  refs={[]}
                  label="生成结果"
                  onOpenImage={onOpenImage}
                  showActions
                />
              </section>
              <section className="ai-history-section ai-history-prompt-section">
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

function buildExpandedPrompt(input: {
  basePrompt: string;
  feature: ShowcaseFeature;
  industry: string;
  viewpoints: Viewpoint[];
  activeViewpoint: Viewpoint;
  imageCount: number;
  ratio: string;
  quality: string;
  threshold: number;
  colorValue: string;
  selectedCase?: LocalShowcaseCase | null;
}): string {
  const prompt = input.basePrompt.trim();
  const constraints = [
    "补充生成约束：",
    `- 当前功能：${input.feature.title}（${input.feature.subtitle}）`,
    `- 当前行业：${input.industry}`,
    `- 当前视角：${VIEWPOINT_LABELS[input.activeViewpoint]}`,
    `- 同步视角：${input.viewpoints.map((viewpoint) => VIEWPOINT_LABELS[viewpoint]).join("、")}`,
    `- 单次数量：${input.imageCount} 张`,
    `- 输出比例：${input.ratio}`,
    `- 图片质量：${input.quality}`,
    `- 参考色号：${input.colorValue.toUpperCase()}`,
    input.feature.id === "vector-generation" ? `- 黑白阈值：${input.threshold}` : "",
    input.selectedCase ? `- 参考案例：${input.selectedCase.title}，方向：${input.selectedCase.summary}` : "",
    "- 保持产品主体、版型、材质、文字、图案和可识别卖点一致，避免无来源改款。",
    "- 画面按电商商拍构图输出，主体清晰，背景干净，光线自然。",
  ].filter(Boolean);
  return [prompt, "", ...constraints].join("\n");
}

function findFeatureCategoryId(featureId: string): ShowcaseCategoryId {
  const category = CATEGORIES.find((item) => item.features.some((feature) => feature.id === featureId));
  return category?.id || "marketing";
}

function promptForShowcaseCase(item: LocalShowcaseCase, fallbackPrompt: string): string {
  const casePrompt = item.prompt?.trim();
  if (casePrompt) return casePrompt;
  const fallback = fallbackPrompt.trim();
  if (fallback) return fallback;
  return `${DEFAULT_PROMPTS.front}\n\n参考案例：${item.title}。生成方向：${item.summary}。`;
}

function assetLabelsForFeature(feature: ShowcaseFeature): ShowcaseAssetLabels {
  if (feature.id === "change-background") {
    return {
      panelTitle: "上传素材",
      productLabel: "主体图",
      referenceLabel: "背景图",
      uploadSlots: [{ id: "upload", uploadLabel: "上传", assetLabel: "图", role: "product" }],
    };
  }
  if (feature.id === "face-swap") {
    return {
      panelTitle: "上传素材",
      productLabel: "模特图",
      referenceLabel: "脸部参考图",
      uploadSlots: [
        { id: "model-image", uploadLabel: "上传模特图片", assetLabel: "模特图片", role: "product" },
        { id: "face-image", uploadLabel: "上传人脸图片", assetLabel: "人脸图片", role: "reference" },
      ],
    };
  }
  if (feature.id === "model-create") {
    return {
      panelTitle: "上传素材",
      productLabel: "融合人脸",
      referenceLabel: "目标人脸",
      uploadSlots: [
        { id: "source-face", uploadLabel: "上传融合人脸", assetLabel: "融合人脸图片", role: "product" },
        { id: "target-face", uploadLabel: "上传目标人脸", assetLabel: "目标人脸图片", role: "reference" },
      ],
    };
  }
  if (feature.id === "change-model" || feature.id === "model-retouch" || feature.id === "model-change-product") {
    return {
      panelTitle: "上传素材",
      productLabel: "服装图",
      referenceLabel: "模特图",
      uploadSlots: [{ id: "upload", uploadLabel: "上传", assetLabel: "图", role: "product" }],
    };
  }
  if (feature.id === "change-pose" || feature.id === "multi-person-fusion") {
    return {
      panelTitle: "上传素材",
      productLabel: "人物图",
      referenceLabel: "姿势参考图",
      uploadSlots: [{ id: "upload", uploadLabel: "上传", assetLabel: "图", role: "product" }],
    };
  }
  return {
    panelTitle: "上传素材",
    productLabel: "服装图",
    referenceLabel: "参考图",
    uploadSlots: [{ id: "upload", uploadLabel: "上传", assetLabel: "图", role: "product" }],
  };
}

function controlProfileForFeature(feature: ShowcaseFeature): ShowcaseControlProfile {
  const labels = assetLabelsForFeature(feature);
  const base: ShowcaseControlProfile = {
    ...labels,
    showUpload: true,
    showUploadTabs: false,
    showMaterialLibrary: false,
    showViewpoints: false,
    showRatio: true,
    showQuality: true,
    showPrompt: true,
    showPromptTools: true,
    showPromptTabs: false,
    imageCountLabel: "生图数量",
  };

  if (feature.id === "model-product-display") {
    return {
      ...base,
      showUploadTabs: true,
      showMaterialLibrary: true,
      showViewpoints: true,
      showPromptTabs: true,
      imageCountLabel: "生图数量（每个面）",
    };
  }

  if (feature.id === "face-swap") {
    return {
      ...base,
      panelTitle: "上传素材",
      productLabel: "模特图片",
      referenceLabel: "人脸图片",
      showMaterialLibrary: true,
      showQuality: false,
      showPrompt: false,
      showPromptTools: false,
    };
  }

  if (feature.id === "model-create") {
    return {
      ...base,
      showMaterialLibrary: true,
      showQuality: false,
      showPrompt: false,
      showPromptTools: false,
    };
  }

  if (feature.id === "change-model") {
    return {
      ...base,
      showMaterialLibrary: true,
    };
  }

  if (feature.id === "text-to-image") {
    return {
      ...base,
      showUpload: false,
    };
  }

  if (feature.id === "ai-watermark-removal") {
    return {
      ...base,
      panelTitle: "上传素材图片",
      productLabel: "素材图片",
      uploadSlots: [{ id: "upload", uploadLabel: "上传", assetLabel: "素材图片", role: "product" }],
      showQuality: false,
      showPrompt: false,
      showPromptTools: false,
    };
  }

  if (feature.id === "vector-generation") {
    return {
      ...base,
      panelTitle: "上传素材图片",
      productLabel: "素材图片",
      uploadSlots: [{ id: "upload", uploadLabel: "上传", assetLabel: "素材图片", role: "product" }],
      showRatio: false,
      showQuality: false,
      showPrompt: false,
      showPromptTools: false,
    };
  }

  return base;
}

function featureById(featureId: string): ShowcaseFeature | undefined {
  return ALL_FEATURES.find((feature) => feature.id === featureId);
}

function buildImageHandoff(
  prompt: string,
  feature: ShowcaseFeature,
  productImageRefs: string[],
  referenceImageRefs: string[] = [],
): ShowcaseImageHandoff {
  const labels = controlProfileForFeature(feature);
  return {
    prompt,
    productImageRefs: Array.from(new Set(productImageRefs.filter(Boolean))),
    referenceImageRefs: Array.from(new Set(referenceImageRefs.filter(Boolean))),
    productImageLabel: labels.productLabel,
    referenceImageLabel: labels.referenceLabel,
    featureId: feature.id,
    featureTitle: feature.title,
  };
}

function splitCaseInputRefsForFeature(
  inputRefs: string[],
  feature: ShowcaseFeature,
): { productRefs: string[]; referenceRefs: string[] } {
  if (inputRefs.length <= 1) {
    return { productRefs: [], referenceRefs: inputRefs };
  }
  const labels = assetLabelsForFeature(feature);
  const hasDedicatedReferenceSlot = labels.uploadSlots.some((slot) => slot.role === "reference");
  if (!hasDedicatedReferenceSlot) {
    return { productRefs: [], referenceRefs: inputRefs };
  }
  return {
    productRefs: inputRefs.slice(0, 1),
    referenceRefs: inputRefs.slice(1),
  };
}

function isDressingkitOssUrl(value: string): boolean {
  return /https?:\/\/oss\.dressingkit\.com/i.test(value);
}

function featureTitleById(featureId: string): string {
  return featureById(featureId)?.title || "未分类功能";
}

function isGeneratedCaseTitle(item: LocalShowcaseCase): boolean {
  const featureTitle = featureTitleById(item.featureId);
  return item.title === `${featureTitle}案例 ${item.id.match(/-(\d+)$/)?.[1] || ""}`;
}

function displayCaseTitle(item: LocalShowcaseCase): string {
  const title = item.title.trim();
  if (!title || isGeneratedCaseTitle(item)) return "-";
  return title;
}

function buildMaterialItems(cards: BackendCaseCard[]): ShowcaseMaterialItem[] {
  const items: ShowcaseMaterialItem[] = [];
  for (const card of cards) {
    urlsForRole(card, "input").forEach((url, index) => {
      if (!url || isDressingkitOssUrl(url)) return;
      items.push({
        id: `${card.id}-input-${index + 1}`,
        name: `${card.title} 图${index + 1}`,
        imageUrl: url,
        caseId: card.id,
        caseTitle: card.title,
        featureId: card.featureId,
        featureTitle: featureTitleById(card.featureId),
        industry: card.industry,
        summary: card.summary,
        roleLabel: `输入图 ${index + 1}`,
      });
    });
  }
  return items;
}

function refToImageUrl(ref: string, assetsById: Map<string, OemPublicAsset>): string {
  if (/^(https?:|data:image\/|blob:|local-asset:)/i.test(ref)) return ref;
  return assetsById.get(ref)?.publicUrl || "";
}

function buildMaterialItemsFromRecords(
  materials: OemPublicMaterial[],
  cards: BackendCaseCard[],
  assets: OemPublicAsset[],
): ShowcaseMaterialItem[] {
  const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
  const cardsById = new Map(cards.map((card) => [card.id, card]));
  const items: ShowcaseMaterialItem[] = [];

  for (const material of materials) {
    const tags = material.tags || [];
    if (!tags.includes("ai-image-reference-material")) continue;

    const sourceCase = (material.sourceRefs || [])
      .map((ref) => cardsById.get(ref))
      .find(Boolean);
    const refs = (material.assetRefs?.length ? material.assetRefs : material.previewRef ? [material.previewRef] : [])
      .filter(Boolean);

    refs.forEach((ref, index) => {
      const asset = assetsById.get(ref);
      if (asset && roleFromAsset(ref, asset) === "output") return;
      const imageUrl = refToImageUrl(ref, assetsById);
      if (!imageUrl || isDressingkitOssUrl(imageUrl)) return;
      const featureId = sourceCase?.featureId || featureIdFromTags(tags);
      const caseTitle = sourceCase?.title || material.title;
      items.push({
        id: `${material.id}-${ref}-${index + 1}`,
        name: refs.length > 1 ? `${material.title} 图${index + 1}` : material.title,
        imageUrl,
        caseId: sourceCase?.id || material.sourceRefs?.[0] || material.id,
        caseTitle,
        featureId,
        featureTitle: featureTitleById(featureId),
        industry: sourceCase?.industry || "未分类",
        summary: material.description || sourceCase?.summary || "案例输入参考素材",
        roleLabel: `输入图 ${index + 1}`,
      });
    });
  }

  return items;
}

export function ImageShowcaseModule({
  busy,
  workspaceReady,
  productImageRefs,
  referenceImageRefs,
  mediaResult,
  authState,
  logs,
  onSelectProductImages,
  onSelectReferenceImages,
  onRemoveProductImageRef,
  onRemoveReferenceImageRef,
  onUsePromptInImage,
  onStartPartialRetouch,
  onClearResult,
  onGenerateImage,
}: ImageShowcaseModuleProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<ShowcaseCategoryId>("marketing");
  const activeCategory = CATEGORIES.find((item) => item.id === activeCategoryId) || CATEGORIES[0];
  const [activeFeatureId, setActiveFeatureId] = useState(activeCategory.features[0].id);
  const activeFeature = activeCategory.features.find((item) => item.id === activeFeatureId) || activeCategory.features[0];
  const [selectedIndustry, setSelectedIndustry] = useState("全部");
  const [selectedViewpoints, setSelectedViewpoints] = useState<Viewpoint[]>(["front"]);
  const [activeViewpoint, setActiveViewpoint] = useState<Viewpoint>("front");
  const [imageCount, setImageCount] = useState(1);
  const [ratio, setRatio] = useState("3:4");
  const [quality, setQuality] = useState("2K");
  const [threshold, setThreshold] = useState(65);
  const [colorValue, setColorValue] = useState("#CD5C5C");
  const [promptDrafts, setPromptDrafts] = useState(DEFAULT_PROMPTS);
  const [selectedCase, setSelectedCase] = useState<LocalShowcaseCase | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImagePreviewState | null>(null);
  const [exampleImageRefs, setExampleImageRefs] = useState<string[]>([]);
  const [exampleReferenceImageRefs, setExampleReferenceImageRefs] = useState<string[]>([]);
  const [activeDialog, setActiveDialog] = useState<ShowcaseDialog>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedPromptTemplate[]>(() => readSavedPromptTemplates());
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [backendCases, setBackendCases] = useState<OemPublicCase[]>([]);
  const [backendMaterials, setBackendMaterials] = useState<OemPublicMaterial[]>([]);
  const [backendAssets, setBackendAssets] = useState<OemPublicAsset[]>([]);
  const [backendStatus, setBackendStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [backendMessage, setBackendMessage] = useState("");
  const [featureUiConfig, setFeatureUiConfig] = useState<ShowcaseFeatureUiConfig | null>(null);
  const [stageView, setStageView] = useState<ShowcaseStageView>("home");
  const [mainView, setMainView] = useState<ShowcaseMainView>("cases");
  const [materialTab, setMaterialTab] = useState<DressingkitMaterialTab>("model");
  const [selectedMaterialSource, setSelectedMaterialSource] = useState("全部");
  const [selectedMaterialGender, setSelectedMaterialGender] = useState("全部");
  const [selectedMaterialAge, setSelectedMaterialAge] = useState("全部");
  const [selectedMaterialRegion, setSelectedMaterialRegion] = useState("全部");
  const [selectedMaterialId, setSelectedMaterialId] = useState("");
  const [workbenchTool, setWorkbenchTool] = useState<RefinementTool>("select");
  const [workbenchCaseId, setWorkbenchCaseId] = useState("");
  const [workbenchMessage, setWorkbenchMessage] = useState("");
  const [generationValidationMessage, setGenerationValidationMessage] = useState("");
  const [assistantTab, setAssistantTab] = useState<PromptAssistantTab>("text");
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantResult, setAssistantResult] = useState("");
  const [assistantTemplatesOpen, setAssistantTemplatesOpen] = useState(false);
  const [templateDraftTitle, setTemplateDraftTitle] = useState("");
  const [editingTemplateId, setEditingTemplateId] = useState("");
  const [promptListKind, setPromptListKind] = useState<PromptListKind>("all");
  const [promptListQuery, setPromptListQuery] = useState("");
  const [promptListDraftTitle, setPromptListDraftTitle] = useState("");
  const [promptListDraftPrompt, setPromptListDraftPrompt] = useState("");
  const [promptListEditingId, setPromptListEditingId] = useState("");
  const [promptListDefaultViewpoint, setPromptListDefaultViewpoint] = useState<Viewpoint | "">("");
  const [promptListFormMode, setPromptListFormMode] = useState<PromptListFormMode>(null);
  const [promptListDraftImageRefs, setPromptListDraftImageRefs] = useState<string[]>([]);
  const [generationNotice, setGenerationNotice] = useState("");
  const pendingGenerationRef = useRef<HistoryEntry | null>(null);
  const refinementSidebarRef = useRef<HTMLElement | null>(null);

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
    setGenerationNotice(
      result.status === "succeeded"
        ? "后台生成已完成，结果已同步到历史记录。"
        : result.status === "queued" || result.status === "running"
          ? "任务已提交到后台生成队列，可以离开当前界面；完成后会同步到历史记录。"
          : result.message || "后台生成未完成，请在历史记录中查看详情。",
    );
    pendingGenerationRef.current = null;
  }

  useEffect(() => {
    const hasActiveFeature = activeCategory.features.some((feature) => feature.id === activeFeatureId);
    if (!hasActiveFeature) {
      const nextFeature = activeCategory.features[0];
      setActiveFeatureId(nextFeature.id);
    }
  }, [activeCategoryId, activeCategory.features, activeFeatureId]);

  useEffect(() => {
    const controller = new AbortController();
    setBackendStatus("loading");
    setBackendMessage("");
    window.contentStudio.getOemSiteConfig(buildOemSiteConfigRequest(authState))
      .then((site) => {
        if (controller.signal.aborted) return;
        const remoteCases = Array.isArray(site.cases) ? site.cases : [];
        const remoteMaterials = Array.isArray(site.materials) ? site.materials : [];
        const remoteAssets = Array.isArray(site.assets) ? site.assets : [];
        const mergedSite = mergeWithSharedDressingkitSite(site);
        const cases = mergedSite.cases || [];
        const materials = mergedSite.materials || [];
        const assets = mergedSite.assets || [];
        setBackendCases(cases);
        setBackendMaterials(materials);
        setBackendAssets(assets);
        setFeatureUiConfig(readFeatureUiConfig(mergedSite));
        setBackendStatus(cases.length || materials.length || assets.length ? "ready" : "empty");
        appendHistory({
          title: cases.length || materials.length || assets.length ? "已加载 OEM 案例清单" : "OEM 素材清单为空",
          detail: cases.length || materials.length || assets.length
            ? `${cases.length} 组案例 · ${materials.length} 组参考素材 · ${assets.length} 张素材 · 后端增量 ${remoteCases.length}/${remoteMaterials.length}/${remoteAssets.length}`
            : "后端没有返回可展示的案例和素材。",
          tone: cases.length || materials.length || assets.length ? "ready" : "warning",
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        const mergedSite = mergeWithSharedDressingkitSite(null);
        const cases = mergedSite.cases || [];
        const materials = mergedSite.materials || [];
        const assets = mergedSite.assets || [];
        setBackendCases(cases);
        setBackendMaterials(materials);
        setBackendAssets(assets);
        setFeatureUiConfig(readFeatureUiConfig(mergedSite));
        setBackendStatus(cases.length || materials.length || assets.length ? "ready" : "error");
        setBackendMessage(
          `后端读取失败，已使用内置通用素材。${error instanceof Error ? error.message : "读取公共配置时发生未知错误。"}`,
        );
        appendHistory({
          title: "已启用内置通用案例清单",
          detail: `${cases.length} 组案例 · ${materials.length} 组参考素材 · ${assets.length} 张素材`,
          tone: cases.length || materials.length || assets.length ? "ready" : "blocked",
        });
      });
    return () => controller.abort();
  }, [authState]);

  const backendCards = useMemo(
    () => buildBackendCards(backendCases, backendAssets),
    [backendAssets, backendCases],
  );
  const backendImageAssets = useMemo(
    () => imageAssetsForCards(backendCards, backendAssets),
    [backendAssets, backendCards],
  );
  const libraryMaterials = useMemo(
    () => DRESSINGKIT_MATERIALS.map((item) => ({
      ...item,
      imageUrl: rendererPublicAssetUrl(item.imagePath),
    })),
    [],
  );
  const featureUiById = useMemo(() => indexFeatureUiById(featureUiConfig), [featureUiConfig]);
  const featureUiByTitle = useMemo(() => indexFeatureUiByTitle(featureUiConfig), [featureUiConfig]);
  const allCards = useMemo(
    () => backendCards.length ? backendCards : LOCAL_CASES,
    [backendCards],
  );
  const visibleCards = allCards.filter(
    (item) =>
      item.featureId === activeFeature.id &&
      (selectedIndustry === "全部" || item.industry === selectedIndustry),
  );
  const workbenchCase = visibleCards.find((item) => item.id === workbenchCaseId) || visibleCards[0] || null;
  const activePrompt = promptDrafts[activeViewpoint];
  const selectedFeatureCaseCount = visibleCards.length;
  const selectedCasePrompt = selectedCase ? promptForShowcaseCase(selectedCase, activePrompt) : "";
  const activeControlProfile = useMemo(() => controlProfileForFeature(activeFeature), [activeFeature]);
  const showColorPicker = activeFeature.id === "product-recolor";
  const showThresholdControl = activeFeature.id === "vector-generation";
  const visibleMaterials = useMemo(
    () => libraryMaterials.filter((item) =>
      item.tab === materialTab &&
      (selectedMaterialSource === "全部" || item.source === selectedMaterialSource) &&
      (selectedMaterialGender === "全部" || item.gender === selectedMaterialGender) &&
      (selectedMaterialAge === "全部" || item.ageGroup === selectedMaterialAge) &&
      (selectedMaterialRegion === "全部" || item.region === selectedMaterialRegion),
    ),
    [
      libraryMaterials,
      materialTab,
      selectedMaterialAge,
      selectedMaterialGender,
      selectedMaterialRegion,
      selectedMaterialSource,
    ],
  );
  const selectedMaterial = libraryMaterials.find((item) => item.id === selectedMaterialId) || null;
  const selectedMaterialRefs = selectedMaterial ? [selectedMaterial.imageUrl] : [];
  const hasExampleImageRefs = Boolean(exampleImageRefs.length || exampleReferenceImageRefs.length);
  const activeProductImageRefs = hasExampleImageRefs ? exampleImageRefs : productImageRefs;
  const activeReferenceImageRefs = exampleReferenceImageRefs.length
    ? exampleReferenceImageRefs
    : selectedMaterialRefs.length
    ? selectedMaterialRefs
    : referenceImageRefs;
  const activeUploadImageCount = activeProductImageRefs.length + activeReferenceImageRefs.length;
  const isSplitUpload = activeControlProfile.uploadSlots.length > 1;
  const visibleSourceUploadRefs = activeProductImageRefs.concat(
    activeReferenceImageRefs.filter((ref) => !activeProductImageRefs.includes(ref)),
  );
  const assistantImageRefs = Array.from(new Set([...activeProductImageRefs, ...activeReferenceImageRefs]));
  const generatedImageRefs = mediaResult?.status === "succeeded" ? mediaResult.assetRefs : [];
  const canvasImageRefs = generatedImageRefs.length ? generatedImageRefs : assistantImageRefs;
  const assistantImageRefsKey = assistantImageRefs.join("|");
  const workbenchUploadTitle = activeControlProfile.panelTitle === "上传素材"
    ? "上传素材图片"
    : activeControlProfile.panelTitle;
  const latestResultKey = mediaResult
    ? `${mediaResult.logId}:${mediaResult.status}:${mediaResult.assetRefs.join("|")}`
    : "";
  const promptListDefaultRows = useMemo(
    () => (Object.entries(DEFAULT_PROMPTS) as Array<[Viewpoint, string]>)
      .filter(([viewpoint, prompt]) => {
        const query = promptListQuery.trim();
        if (!query) return true;
        return VIEWPOINT_LABELS[viewpoint].includes(query) || prompt.includes(query);
      }),
    [promptListQuery],
  );
  const promptListSavedRows = useMemo(
    () => savedTemplates.filter((template) => {
      const query = promptListQuery.trim();
      if (!query) return true;
      return template.title.includes(query) || template.featureTitle.includes(query) || template.prompt.includes(query);
    }),
    [promptListQuery, savedTemplates],
  );
  const selectedPromptListTemplate = savedTemplates.find((template) => template.id === promptListEditingId) || null;
  const promptListVisibleRowCount =
    (promptListKind !== "saved" ? promptListDefaultRows.length : 0) +
    (promptListKind !== "default" ? promptListSavedRows.length : 0);
  const visibleHistoryEntries = useMemo(
    () => mergeHistoryEntries(historyEntries, logs),
    [historyEntries, logs],
  );

  useEffect(() => {
    onClearResult();
  }, []);

  useEffect(() => {
    if (stageView !== "workbench") return;
    refinementSidebarRef.current?.scrollTo({ top: 0 });
  }, [stageView]);

  useEffect(() => {
    if (selectedMaterialId && !libraryMaterials.some((item) => item.id === selectedMaterialId)) {
      setSelectedMaterialId("");
    }
  }, [libraryMaterials, selectedMaterialId]);

  useEffect(() => {
    if (!workbenchCaseId || visibleCards.some((item) => item.id === workbenchCaseId)) return;
    setWorkbenchCaseId(visibleCards[0]?.id || "");
  }, [visibleCards, workbenchCaseId]);

  useEffect(() => {
    if (!mediaResult) return;
    completePendingGeneration(mediaResult);
  }, [latestResultKey]);

  useEffect(() => {
    if (activeDialog !== "prompt-list" || !promptListFormMode) return;
    setPromptListDraftImageRefs((current) =>
      Array.from(new Set([...current, ...assistantImageRefs])).slice(0, 8),
    );
  }, [activeDialog, assistantImageRefsKey, promptListFormMode]);

  function persistPromptTemplates(nextTemplates: SavedPromptTemplate[]): void {
    const normalized = nextTemplates.slice(0, 24);
    setSavedTemplates(normalized);
    writeSavedPromptTemplates(normalized);
  }

  function savePromptTemplate(
    prompt: string,
    title?: string,
    templateId = editingTemplateId,
    imageRefs?: string[],
  ): SavedPromptTemplate | null {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) return null;
    const now = new Date().toISOString();
    const draftTitle = title?.trim() || `${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`;
    const normalizedImageRefs = imageRefs?.filter(Boolean).slice(0, 8);
    let saved: SavedPromptTemplate;
    if (templateId) {
      const existing = savedTemplates.find((item) => item.id === templateId);
      saved = {
        id: templateId,
        title: draftTitle,
        viewpoint: activeViewpoint,
        featureTitle: activeFeature.title,
        prompt: trimmedPrompt,
        imageRefs: imageRefs === undefined
          ? existing?.imageRefs
          : normalizedImageRefs?.length
          ? normalizedImageRefs
          : undefined,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      persistPromptTemplates([saved, ...savedTemplates.filter((item) => item.id !== templateId)]);
    } else {
      saved = {
        id: historyId(),
        title: draftTitle,
        viewpoint: activeViewpoint,
        featureTitle: activeFeature.title,
        prompt: trimmedPrompt,
        imageRefs: normalizedImageRefs?.length ? normalizedImageRefs : undefined,
        createdAt: now,
        updatedAt: now,
      };
      persistPromptTemplates([saved, ...savedTemplates]);
    }
    setTemplateDraftTitle(saved.title);
    setEditingTemplateId(saved.id);
    appendHistory({
      title: templateId ? `已更新提示词模板：${saved.title}` : `已保存提示词模板：${saved.title}`,
      detail: saved.prompt.slice(0, 90),
      tone: "ready",
    });
    return saved;
  }

  function saveCurrentPromptAsTemplate(): void {
    const template = savePromptTemplate(
      activePrompt,
      `${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`,
      "",
      assistantImageRefs.length ? assistantImageRefs : undefined,
    );
    if (!template) return;
    setPromptListDraftTitle(template.title);
    setPromptListDraftPrompt(template.prompt);
    setPromptListEditingId(template.id);
    setPromptListDefaultViewpoint("");
    setPromptListDraftImageRefs(template.imageRefs || []);
    setPromptListKind("saved");
    setActiveDialog("prompt-list");
  }

  function applyPromptTemplateImages(imageRefs?: string[]): void {
    const refs = Array.from(new Set((imageRefs || []).filter(Boolean))).slice(0, 8);
    if (!refs.length) return;
    setSelectedMaterialId("");
    setExampleImageRefs([]);
    setExampleReferenceImageRefs(refs);
    setWorkbenchMessage("");
    setGenerationValidationMessage("");
  }

  function applySavedPromptTemplate(template: SavedPromptTemplate, closeDialog = true): void {
    setActiveViewpoint(template.viewpoint);
    setPromptDrafts((current) => ({
      ...current,
      [template.viewpoint]: template.prompt,
    }));
    setAssistantInput(template.prompt);
    setAssistantResult(template.prompt);
    setTemplateDraftTitle(template.title);
    setEditingTemplateId(template.id);
    applyPromptTemplateImages(template.imageRefs);
    appendHistory({
      title: `已应用模板：${template.title}`,
      detail: template.imageRefs?.length ? `${template.featureTitle} · 已带入 ${template.imageRefs.length} 张参考图` : template.featureTitle,
      tone: "ready",
    });
    if (closeDialog) setActiveDialog(null);
  }

  function editSavedPromptTemplate(template: SavedPromptTemplate): void {
    setAssistantTemplatesOpen(true);
    setTemplateDraftTitle(template.title);
    setEditingTemplateId(template.id);
    setAssistantInput(template.prompt);
    setAssistantResult(template.prompt);
    setActiveViewpoint(template.viewpoint);
  }

  function deleteSavedPromptTemplate(templateId: string): void {
    const template = savedTemplates.find((item) => item.id === templateId);
    persistPromptTemplates(savedTemplates.filter((item) => item.id !== templateId));
    if (editingTemplateId === templateId) {
      setEditingTemplateId("");
      setTemplateDraftTitle("");
    }
    appendHistory({
      title: template ? `已删除模板：${template.title}` : "已删除提示词模板",
      detail: "模板列表已更新。",
      tone: "idle",
    });
  }

  function openPromptAssistant(tab: PromptAssistantTab = "text"): void {
    setAssistantTab(tab);
    setAssistantInput(activePrompt);
    setAssistantResult("");
    setAssistantTemplatesOpen(false);
    setTemplateDraftTitle(`${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`);
    setEditingTemplateId("");
    setActiveDialog("prompt-assistant");
  }

  function openPromptListDialog(): void {
    setPromptListKind("all");
    setPromptListQuery("");
    setPromptListDraftTitle(`${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`);
    setPromptListDraftPrompt(activePrompt);
    setPromptListEditingId("");
    setPromptListDefaultViewpoint(activeViewpoint);
    setPromptListDraftImageRefs(assistantImageRefs);
    setPromptListFormMode(null);
    setActiveDialog("prompt-list");
  }

  function startPromptListCreate(): void {
    setPromptListDraftTitle(`${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`);
    setPromptListDraftPrompt(activePrompt);
    setPromptListEditingId("");
    setPromptListDefaultViewpoint("");
    setPromptListDraftImageRefs(assistantImageRefs);
    setPromptListFormMode("create");
  }

  function startPromptListEdit(template: SavedPromptTemplate): void {
    setPromptListDraftTitle(template.title);
    setPromptListDraftPrompt(template.prompt);
    setPromptListEditingId(template.id);
    setPromptListDefaultViewpoint("");
    setPromptListDraftImageRefs(template.imageRefs || []);
    setPromptListFormMode("edit");
    setActiveViewpoint(template.viewpoint);
  }

  function selectPromptListDefault(viewpoint: Viewpoint, prompt: string): void {
    setActiveViewpoint(viewpoint);
    setPromptListDraftTitle(`默认提示词 · ${VIEWPOINT_LABELS[viewpoint]}`);
    setPromptListDraftPrompt(prompt);
    setPromptListEditingId("");
    setPromptListDefaultViewpoint(viewpoint);
    setPromptListDraftImageRefs([]);
  }

  function savePromptListDraft(): void {
    const template = savePromptTemplate(
      promptListDraftPrompt || activePrompt,
      promptListDraftTitle || `${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`,
      promptListEditingId,
      promptListDraftImageRefs,
    );
    if (!template) return;
    setPromptListDraftTitle(template.title);
    setPromptListDraftPrompt(template.prompt);
    setPromptListEditingId(template.id);
    setPromptListDefaultViewpoint("");
    setPromptListDraftImageRefs(template.imageRefs || []);
    setPromptListKind("saved");
    setPromptListFormMode(null);
  }

  function deletePromptListDraft(): void {
    if (!promptListEditingId) return;
    deleteSavedPromptTemplate(promptListEditingId);
    setPromptListEditingId("");
    setPromptListDraftTitle("");
    setPromptListDraftPrompt(activePrompt);
    setPromptListDraftImageRefs(assistantImageRefs);
    setPromptListFormMode(null);
  }

  function queryPromptList(): void {
    appendHistory({
      title: "已查询提示词列表",
      detail: promptListQuery.trim() || "全部模板",
      tone: "idle",
    });
  }

  function confirmPromptList(): void {
    const nextPrompt = promptListDraftPrompt.trim();
    if (nextPrompt) {
      setPromptDrafts((current) => ({
        ...current,
        [activeViewpoint]: nextPrompt,
      }));
    }
    if (promptListEditingId) {
      applyPromptTemplateImages(promptListDraftImageRefs);
    }
    if (promptListEditingId) {
      savePromptListDraft();
    } else if (!promptListDefaultViewpoint && nextPrompt && nextPrompt !== activePrompt.trim()) {
      savePromptListDraft();
    }
    appendHistory({
      title: promptListEditingId ? "已确认提示词模板" : "已确认提示词",
      detail: nextPrompt.slice(0, 90),
      tone: "ready",
    });
    setActiveDialog(null);
  }

  function startPartialRetouchFromHistory(entry: HistoryEntry): void {
    const outputRefs = (entry.outputRefs || []).filter(Boolean);
    if (!outputRefs.length) return;
    const feature = featureById("partial-retouch") || activeFeature;
    setActiveCategoryId(findFeatureCategoryId(feature.id));
    setActiveFeatureId(feature.id);
    setStageView("workbench");
    setMainView("cases");
    setActiveDialog(null);
    setSelectedMaterialId("");
    setSelectedCase(null);
    setActiveViewpoint("front");
    setExampleImageRefs(outputRefs.slice(0, 10));
    setExampleReferenceImageRefs([]);
    setPromptDrafts((current) => {
      const next = promptDraftsForFeature(feature);
      const prompt = (entry.prompt || entry.detail || current.front || next.front).trim();
      return {
        ...next,
        front: prompt,
        back: prompt,
        side: prompt,
      };
    });
    setWorkbenchMessage("已从历史记录带入生成结果，可继续局部精修。");
    setGenerationNotice("已进入局部精修，并带入历史生成结果。");
    onStartPartialRetouch({
      prompt: entry.prompt || entry.detail,
      productImageRefs: outputRefs,
      referenceImageRefs: [],
      productImageLabel: "待精修图",
      referenceImageLabel: "参考图",
      outputRefs,
      sourceLogId: entry.logId,
      sourceTitle: entry.title,
    });
  }

  function cancelPromptListForm(): void {
    setPromptListFormMode(null);
    setPromptListEditingId("");
    setPromptListDefaultViewpoint(activeViewpoint);
    setPromptListDraftTitle(`${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`);
    setPromptListDraftPrompt(activePrompt);
    setPromptListDraftImageRefs(assistantImageRefs);
  }

  function selectPromptTemplateImages(): void {
    selectReferenceImages();
    appendHistory({
      title: "已打开模板图片上传",
      detail: "选择完成后会同步到提示词模板表单。",
      tone: "idle",
    });
  }

  function removePromptListImageRef(ref: string): void {
    setPromptListDraftImageRefs((current) => current.filter((item) => item !== ref));
  }

  function generateAssistantPrompt(): void {
    const basePrompt = assistantInput.trim() || activePrompt;
    const nextPrompt = assistantTab === "reverse"
      ? buildExpandedPrompt({
        basePrompt: [
          basePrompt,
          `参考图：${activeProductImageRefs.length + activeReferenceImageRefs.length || 0} 张`,
          `功能：${activeFeature.title}`,
          `输出比例：${ratio}`,
          "请根据参考图反推可直接用于 AI 生图的完整中文提示词，保留主体、材质、构图、背景、光线和商业用途约束。",
        ].filter(Boolean).join("\n"),
        feature: activeFeature,
        industry: selectedIndustry,
        viewpoints: selectedViewpoints,
        activeViewpoint,
        imageCount,
        ratio,
        quality,
        threshold,
        colorValue,
        selectedCase,
      })
      : buildExpandedPrompt({
        basePrompt,
        feature: activeFeature,
        industry: selectedIndustry,
        viewpoints: selectedViewpoints,
        activeViewpoint,
        imageCount,
        ratio,
        quality,
        threshold,
        colorValue,
        selectedCase,
      });
    setAssistantResult(nextPrompt);
    appendHistory({
      title: assistantTab === "reverse" ? "图片反推提示词已生成" : "文本提示词已生成",
      detail: nextPrompt.slice(0, 90),
      tone: "ready",
    });
  }

  function confirmAssistantPrompt(): void {
    const nextPrompt = (assistantResult || assistantInput).trim();
    if (nextPrompt) {
      setPromptDrafts((current) => ({
        ...current,
        [activeViewpoint]: nextPrompt,
      }));
      appendHistory({
        title: "已确认提示词助手结果",
        detail: nextPrompt.slice(0, 90),
        tone: "ready",
      });
    }
    setActiveDialog(null);
  }

  function applyPromptTemplate(viewpoint: Viewpoint): void {
    setActiveViewpoint(viewpoint);
    setPromptDrafts((current) => ({
      ...current,
      [viewpoint]: DEFAULT_PROMPTS[viewpoint],
    }));
    appendHistory({
      title: `切换到${VIEWPOINT_LABELS[viewpoint]}`,
      detail: "已恢复该视角的默认提示词。",
      tone: "idle",
    });
    setActiveDialog(null);
  }

  function expandPromptWithCurrentContext(): void {
    const nextPrompt = buildExpandedPrompt({
      basePrompt: activePrompt,
      feature: activeFeature,
      industry: selectedIndustry,
      viewpoints: selectedViewpoints,
      activeViewpoint,
      imageCount,
      ratio,
      quality,
      threshold,
      colorValue,
      selectedCase,
    });
    setPromptDrafts((current) => ({ ...current, [activeViewpoint]: nextPrompt }));
    appendHistory({
      title: "智能扩写已完成",
      detail: `${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]} · ${ratio} · ${quality}`,
      tone: "ready",
    });
  }

  function toggleViewpoint(viewpoint: Viewpoint): void {
    setSelectedViewpoints((current) => {
      if (current.includes(viewpoint)) {
        const next = current.filter((item) => item !== viewpoint);
        if (!next.length) return current;
        if (activeViewpoint === viewpoint) setActiveViewpoint(next[0]);
        return next;
      }
      setActiveViewpoint(viewpoint);
      return [...current, viewpoint];
    });
  }

  function openMaterialLibrary(): void {
    setMainView("materials");
  }

  function openCaseBoard(): void {
    setMainView("cases");
  }

  function selectCategory(category: { id: ShowcaseCategoryId; features: ShowcaseFeature[] }): void {
    const nextFeature = category.features[0];
    setActiveCategoryId(category.id);
    setActiveFeatureId(nextFeature?.id || activeFeatureId);
    setSelectedIndustry("全部");
    setExampleImageRefs([]);
    setExampleReferenceImageRefs([]);
    setSelectedMaterialId("");
    setWorkbenchMessage("");
    setGenerationValidationMessage("");
    if (nextFeature) {
      setActiveViewpoint("front");
      setPromptDrafts(promptDraftsForFeature(nextFeature));
    }
  }

  function selectFeature(feature: ShowcaseFeature, categoryId = activeCategoryId): void {
    if (categoryId !== activeCategoryId) setSelectedIndustry("全部");
    setActiveCategoryId(categoryId);
    setActiveFeatureId(feature.id);
    setActiveViewpoint("front");
    setPromptDrafts(promptDraftsForFeature(feature));
    setExampleImageRefs([]);
    setExampleReferenceImageRefs([]);
    setSelectedMaterialId("");
    setWorkbenchMessage("");
    setGenerationValidationMessage("");
    if (REFINEMENT_FEATURE_IDS.has(feature.id)) {
      setStageView("workbench");
      setMainView("cases");
    }
  }

  function startHomeGeneration(): void {
    if (!activeUploadImageCount && activeControlProfile.showUpload) {
      setGenerationValidationMessage("请先上传至少一张图片");
      setWorkbenchMessage("请先上传至少一张图片");
      return;
    }
    setGenerationValidationMessage("");
    onClearResult();
    const handoff = handoffForCurrentState();
    rememberPendingGeneration({
      title: `提交生成：${activeFeature.title}`,
      prompt: handoff.prompt,
      inputRefs: [...handoff.productImageRefs, ...handoff.referenceImageRefs],
      featureTitle: activeFeature.title,
      jobType: activeFeature.title,
    });
    setGenerationNotice("任务已提交到后台生成队列，可以离开当前界面；完成后会同步到历史记录。");
    onGenerateImage(handoff);
  }

  function runWorkbenchGeneration(): void {
    if (!activeUploadImageCount && activeControlProfile.showUpload) {
      setWorkbenchMessage("请先上传至少一张图片");
      setGenerationValidationMessage("请先上传至少一张图片");
      return;
    }
    setWorkbenchMessage("");
    setGenerationValidationMessage("");
    onClearResult();
    const handoff = handoffForCurrentState();
    rememberPendingGeneration({
      title: `提交生成：${activeFeature.title}`,
      prompt: handoff.prompt,
      inputRefs: [...handoff.productImageRefs, ...handoff.referenceImageRefs],
      featureTitle: activeFeature.title,
      jobType: activeFeature.title,
    });
    setGenerationNotice("任务已提交到后台生成队列，可以离开当前界面；完成后会同步到历史记录。");
    onGenerateImage(handoff);
  }

  function selectProductImages(): void {
    setExampleImageRefs([]);
    setWorkbenchMessage("");
    setGenerationValidationMessage("");
    onSelectProductImages();
  }

  function selectReferenceImages(): void {
    if (selectedMaterial) setSelectedMaterialId("");
    setExampleReferenceImageRefs([]);
    setWorkbenchMessage("");
    setGenerationValidationMessage("");
    onSelectReferenceImages();
  }

  function refsForUploadRole(role: ShowcaseUploadRole): string[] {
    return role === "product" ? activeProductImageRefs : activeReferenceImageRefs;
  }

  function selectImagesForUploadRole(role: ShowcaseUploadRole): void {
    if (role === "product") {
      selectProductImages();
      return;
    }
    selectReferenceImages();
  }

  function removeImageForUploadRole(role: ShowcaseUploadRole, ref: string): void {
    if (role === "product") {
      if (exampleImageRefs.includes(ref)) {
        setExampleImageRefs((current) => current.filter((item) => item !== ref));
        return;
      }
      onRemoveProductImageRef(ref);
      return;
    }
    if (exampleReferenceImageRefs.includes(ref)) {
      setExampleReferenceImageRefs((current) => current.filter((item) => item !== ref));
      return;
    }
    if (selectedMaterialRefs.includes(ref)) {
      clearSelectedMaterial();
      return;
    }
    onRemoveReferenceImageRef(ref);
  }

  function removeAssistantImageRef(ref: string): void {
    const isReferenceRef = activeReferenceImageRefs.includes(ref) && !activeProductImageRefs.includes(ref);
    removeImageForUploadRole(isReferenceRef ? "reference" : "product", ref);
  }

  function handoffForCurrentState(prompt = activePrompt): ShowcaseImageHandoff {
    return buildImageHandoff(
      prompt,
      activeFeature,
      activeProductImageRefs,
      activeReferenceImageRefs,
    );
  }

  function applyMaterial(item: DressingkitMaterialItem): void {
    setSelectedMaterialId(item.id);
    setGenerationValidationMessage("");
    appendHistory({
      title: `已选择素材：${item.name}`,
      detail: `${item.source} · ${item.gender} · ${item.ageGroup} · ${item.region}`,
      tone: "ready",
    });
  }

  function clearSelectedMaterial(): void {
    if (!selectedMaterial) return;
    appendHistory({
      title: `已移除素材：${selectedMaterial.name}`,
      detail: "生成时不再带入该素材作为参考图。",
      tone: "idle",
    });
    setSelectedMaterialId("");
    setGenerationValidationMessage("");
  }

  function applyCase(item: LocalShowcaseCase): void {
    setActiveCategoryId(findFeatureCategoryId(item.featureId));
    setActiveFeatureId(item.featureId);
    const nextPrompt = promptForShowcaseCase(item, activePrompt);
    const caseInputRefs = urlsForRole(item, "input");
    const caseFeature = featureById(item.featureId) || activeFeature;
    const { productRefs: caseProductRefs, referenceRefs: caseReferenceRefs } = splitCaseInputRefsForFeature(caseInputRefs, caseFeature);
    setSelectedMaterialId("");
    setGenerationValidationMessage("");
    setExampleImageRefs(caseProductRefs);
    setExampleReferenceImageRefs(caseReferenceRefs);
    setPromptDrafts((current) => {
      const next = { ...current };
      for (const viewpoint of Object.keys(current) as Viewpoint[]) {
        next[viewpoint] = nextPrompt;
      }
      return next;
    });
    appendHistory({
      title: `已套用案例：${item.title}`,
      detail: `${item.industry} · ${item.summary}`,
      tone: "ready",
    });
    onUsePromptInImage(buildImageHandoff(
      nextPrompt,
      caseFeature,
      caseProductRefs,
      caseReferenceRefs,
    ));
  }

  if (stageView === "workbench") {
    return (
      <div className="ai-refinement-shell">
        <aside className="ai-refinement-sidebar" ref={refinementSidebarRef}>
          <section className="ai-refinement-case-panel">
            <header>
              <strong>案例库</strong>
              <button type="button" aria-label="返回首页" onClick={() => setStageView("home")}>›</button>
            </header>
            {workbenchCase ? (
              <button
                type="button"
                className="ai-refinement-case-card"
                onClick={() => applyCase(workbenchCase)}
              >
                <div className="ai-refinement-case-images">
                  <span>
                    {urlsForRole(workbenchCase, "input")[0] ? (
                      <img src={imageAssetSource(urlsForRole(workbenchCase, "input")[0])} alt={`${workbenchCase.title} 输入图`} loading="lazy" />
                    ) : null}
                    <em>输入图</em>
                  </span>
                  <span>
                    {urlsForRole(workbenchCase, "output")[0] ? (
                      <img src={imageAssetSource(urlsForRole(workbenchCase, "output")[0])} alt={`${workbenchCase.title} 输出图`} loading="lazy" />
                    ) : null}
                    <em>输出图</em>
                  </span>
                </div>
                <strong>{workbenchCase.title || "案例名称"}</strong>
              </button>
            ) : (
              <div className="ai-refinement-empty-card">暂无案例</div>
            )}
          </section>

          {activeControlProfile.showUpload ? (
            <section className="ai-refinement-upload">
              <h3>{workbenchUploadTitle}</h3>
              <div className={isSplitUpload ? "ai-refinement-upload-grid is-split" : "ai-refinement-upload-grid"}>
                {isSplitUpload ? (
                  activeControlProfile.uploadSlots.map((slot) => {
                    const refs = refsForUploadRole(slot.role);
                    const previewRef = refs[0];
                    return (
                      <div key={slot.id} className="ai-refinement-upload-item">
                        <button type="button" onClick={() => selectImagesForUploadRole(slot.role)}>
                          {previewRef ? (
                            <img src={imageAssetSource(previewRef)} alt={slot.assetLabel} loading="lazy" />
                          ) : (
                            <span className="ai-refinement-placeholder" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
                                <path d="m6.5 16 4.2-5.2 3.2 4 1.8-2.1 1.8 2.3" />
                                <circle cx="16.5" cy="7.5" r="1.4" />
                              </svg>
                            </span>
                          )}
                        </button>
                        {previewRef ? (
                          <button
                            type="button"
                            className="ai-refinement-remove"
                            aria-label={`删除${slot.assetLabel}`}
                            onClick={() => removeImageForUploadRole(slot.role, previewRef)}
                          >
                            ×
                          </button>
                        ) : null}
                        <strong>{previewRef ? slot.assetLabel : slot.uploadLabel}</strong>
                      </div>
                    );
                  })
                ) : (
                  <>
                    <div className="ai-refinement-upload-item">
                      <button type="button" onClick={selectProductImages}>
                        <span className="ai-refinement-placeholder" aria-hidden="true">
                          <svg viewBox="0 0 24 24">
                            <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
                            <path d="m6.5 16 4.2-5.2 3.2 4 1.8-2.1 1.8 2.3" />
                            <circle cx="16.5" cy="7.5" r="1.4" />
                          </svg>
                        </span>
                      </button>
                      <strong>上传</strong>
                    </div>
                    {activeProductImageRefs.map((ref, index) => (
                      <div key={`${ref}-${index}`} className="ai-refinement-upload-item has-image">
                        <button
                          type="button"
                          onClick={() => setSelectedImage({
                            url: imageAssetSource(ref),
                            title: `图${index + 1}`,
                            label: "上传素材图片",
                            alt: `上传素材图片 图${index + 1}`,
                          })}
                        >
                          <img src={imageAssetSource(ref)} alt={`图${index + 1}`} loading="lazy" />
                        </button>
                        <button
                          type="button"
                          className="ai-refinement-remove"
                          aria-label={`删除图${index + 1}`}
                          onClick={() => removeImageForUploadRole("product", ref)}
                        >
                          ×
                        </button>
                        <strong>图{index + 1}</strong>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </section>
          ) : null}

          <section className="ai-refinement-controls">
            <div className="ai-refinement-control-line">
              <strong>生图数量</strong>
              <div className="ai-refinement-segment">
                {[1, 2, 3].map((count) => (
                  <button key={count} type="button" className={imageCount === count ? "active" : ""} onClick={() => setImageCount(count)}>
                    {count}
                  </button>
                ))}
              </div>
            </div>
            <div className="ai-refinement-control-line">
              <strong>生图比例</strong>
              <select value={ratio} onChange={(event) => setRatio(event.target.value)}>
                {["1:1", "3:4", "4:3", "9:16", "16:9"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
            {activeControlProfile.showQuality ? (
              <div className="ai-refinement-control-block">
                <strong>图片质量 <em>请参考提示词模板，根据需求修改</em></strong>
                <div className="ai-refinement-segment">
                  {["1K_V2", "2K", "4K"].map((item) => (
                    <button key={item} type="button" className={quality === item ? "active" : ""} onClick={() => setQuality(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {activeControlProfile.showPrompt ? (
            <section className="ai-refinement-prompt">
              <h3>提示词</h3>
              <textarea
                placeholder="请输入提示词。"
                value={activePrompt}
                onChange={(event) =>
                  setPromptDrafts((current) => ({
                    ...current,
                    [activeViewpoint]: event.target.value,
                  }))
                }
              />
            </section>
          ) : null}

          <button
            type="button"
            className="ai-refinement-generate"
            disabled={busy || !workspaceReady}
            onClick={runWorkbenchGeneration}
          >
            {busy ? "生成中" : "生成"}
          </button>
          {generationNotice ? (
            <p className="ai-generation-notice">{generationNotice}</p>
          ) : null}
        </aside>

        <main className="ai-refinement-canvas">
          <div className="ai-refinement-toolbar">
            {REFINEMENT_TOOLS.map((tool) => (
              <button
                key={tool.id}
                type="button"
                className={workbenchTool === tool.id ? "active" : ""}
                title={tool.label}
                aria-label={tool.label}
                onClick={() => setWorkbenchTool(tool.id)}
              >
                <span>{tool.icon}</span>
                <em>{tool.label}</em>
              </button>
            ))}
          </div>
          <section className={canvasImageRefs.length ? "ai-refinement-board has-images" : "ai-refinement-board"}>
            {canvasImageRefs.length ? (
              <div className="ai-refinement-board-images">
                {canvasImageRefs.map((ref, index) => (
                  <button
                    key={`${ref}-${index}`}
                    type="button"
                    onClick={() => setSelectedImage({
                      url: imageAssetSource(ref),
                      title: `生成图 ${index + 1}`,
                      label: "生成结果",
                      alt: `生成图 ${index + 1}`,
                    })}
                  >
                    <img src={imageAssetSource(ref)} alt={`生成图 ${index + 1}`} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p>{workbenchMessage || "请先上传至少一张图片"}</p>
            )}
            {mediaResult && mediaResult.status !== "succeeded" ? (
              <div className={`ai-refinement-result-message ${mediaResult.status}`}>
                {mediaResult.message}
              </div>
            ) : null}
          </section>
        </main>

        <button type="button" className="ai-refinement-record" onClick={() => setActiveDialog("history")}>
          <span>生成记录</span>
        </button>

        <button type="button" className="ai-prompt-assistant-fab" onClick={() => openPromptAssistant("text")}>
          <span aria-hidden="true">AI</span>
          <strong>提示词助手</strong>
        </button>

        {activeDialog === "history" ? (
          <ImageHistoryDrawer
            entries={visibleHistoryEntries}
            featureTitle={activeFeature.title}
            backendCaseCount={backendCards.length}
            backendAssetCount={backendAssets.length}
            selectedFeatureCaseCount={selectedFeatureCaseCount}
            uploadCount={activeUploadImageCount}
            selectedMaterialName={selectedMaterial?.name}
            mediaResult={mediaResult}
            onOpenImage={setSelectedImage}
            onPartialRetouch={startPartialRetouchFromHistory}
            onClose={() => setActiveDialog(null)}
          />
        ) : null}

        {activeDialog === "prompt-assistant" ? (
          <div className="ai-assistant-overlay" role="presentation" onClick={() => setActiveDialog(null)}>
            <section
              className={assistantTemplatesOpen ? "ai-assistant-dialog has-templates" : "ai-assistant-dialog"}
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
                      图片反推
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
                          assistantResult || assistantInput || activePrompt,
                          templateDraftTitle,
                          editingTemplateId,
                          assistantImageRefs.length ? assistantImageRefs : undefined,
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
                          <div className="ai-assistant-section-title">上传图片</div>
                          <div className="ai-assistant-upload-list">
                            <button type="button" className="ai-assistant-upload-card is-upload" onClick={selectReferenceImages}>
                              <span aria-hidden="true">+</span>
                              <strong>上传</strong>
                            </button>
                            {assistantImageRefs.map((ref, index) => {
                              const isReferenceRef = activeReferenceImageRefs.includes(ref) && !activeProductImageRefs.includes(ref);
                              return (
                                <div key={`${ref}-${index}`} className="ai-assistant-upload-card has-image">
                                  <button
                                    type="button"
                                    className="ai-assistant-upload-image"
                                    onClick={() => setSelectedImage({
                                      url: imageAssetSource(ref),
                                      title: `图片${index + 1}`,
                                      label: isReferenceRef ? activeControlProfile.referenceLabel : activeControlProfile.productLabel,
                                      alt: `提示词助手图片${index + 1}`,
                                    })}
                                  >
                                    <img src={imageAssetSource(ref)} alt={`提示词助手图片${index + 1}`} loading="lazy" />
                                  </button>
                                  <button
                                    type="button"
                                    className="ai-assistant-upload-remove"
                                    aria-label={`删除提示词助手图片${index + 1}`}
                                    onClick={() => removeAssistantImageRef(ref)}
                                  >
                                    ×
                                  </button>
                                  <strong>{isReferenceRef ? activeControlProfile.referenceLabel : activeControlProfile.productLabel}</strong>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                        <label>输入提示词</label>
                        <textarea
                          value={assistantInput}
                          onChange={(event) => setAssistantInput(event.target.value)}
                          placeholder="描述参考图、主体、材质、背景或上传素材需要反推的重点。"
                        />
                      </section>
                    ) : (
                      <section>
                        <label>输入提示词</label>
                        <textarea
                          value={assistantInput}
                          onChange={(event) => setAssistantInput(event.target.value)}
                          placeholder="请输入要扩写或优化的提示词。"
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
                      <span>{savedTemplates.length} 个模板</span>
                    </header>
                    <label>
                      模板名称
                      <input
                        value={templateDraftTitle}
                        onChange={(event) => setTemplateDraftTitle(event.target.value)}
                        placeholder={`${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`}
                      />
                    </label>
                    <div className="ai-assistant-template-actions">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingTemplateId("");
                          setTemplateDraftTitle(`${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`);
                          setAssistantResult("");
                        }}
                      >
                        新建
                      </button>
                      <button
                        type="button"
                        className="primary"
                        onClick={() => savePromptTemplate(
                          assistantResult || assistantInput || activePrompt,
                          templateDraftTitle,
                          editingTemplateId,
                          assistantImageRefs.length ? assistantImageRefs : undefined,
                        )}
                      >
                        {editingTemplateId ? "更新" : "保存"}
                      </button>
                    </div>
                    <div className="ai-assistant-template-list">
                      {savedTemplates.length ? savedTemplates.map((template) => (
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
              <footer className="ai-assistant-footer">
                <button type="button" onClick={() => setActiveDialog(null)}>取消</button>
                <button type="button" className="primary" onClick={confirmAssistantPrompt}>确定</button>
              </footer>
            </section>
          </div>
        ) : null}

        {selectedImage ? (
          <div
            className="ai-image-preview-modal"
            role="dialog"
            aria-modal="true"
            aria-label={selectedImage.alt}
            onClick={() => setSelectedImage(null)}
          >
            <button type="button" className="ai-image-preview-close" onClick={() => setSelectedImage(null)}>
              关闭
            </button>
            <figure className="ai-image-preview-card" onClick={(event) => event.stopPropagation()}>
              <img src={selectedImage.url} alt={selectedImage.alt} />
              <figcaption>
                <strong>{selectedImage.title}</strong>
                <span>{selectedImage.label}</span>
              </figcaption>
            </figure>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="ai-showcase-shell">
      <aside className="ai-showcase-left">
        <section className="ai-panel scene-panel">
          <div className="ai-scene-heading">
            <span className="ai-scene-title">
              选择场景 <em>（{activeFeature.title}）</em>
            </span>
          </div>
          <div className="ai-feature-entry-label">选择功能</div>
          <button type="button" className="ai-feature-entry-card" onClick={openCaseBoard}>
            <span className="ai-feature-entry-icon" aria-hidden="true">
              <FeatureButtonIcon
                iconKey={iconKeyForFeature(activeFeature, featureUiById, featureUiByTitle)}
              />
            </span>
            <span className="ai-feature-entry-content">
              <strong>选择功能</strong>
            </span>
            <span className="ai-feature-entry-arrow" aria-hidden="true">›</span>
          </button>
        </section>

        {activeControlProfile.showUpload ? (
        <section className="ai-panel">
          <div className="ai-section-title">
            <span>{activeControlProfile.panelTitle}</span>
          </div>
          <>
              {activeControlProfile.showUploadTabs ? (
                <div className="ai-upload-tabs">
                  {selectedViewpoints.map((viewpoint) => (
                    <button
                      key={viewpoint}
                      type="button"
                      className={activeViewpoint === viewpoint ? "active" : ""}
                      onClick={() => setActiveViewpoint(viewpoint)}
                    >
                      {VIEWPOINT_LABELS[viewpoint]}
                    </button>
                  ))}
                </div>
              ) : null}
              <div
                className={isSplitUpload ? "ai-upload-grid is-split" : "ai-upload-grid is-source-strip"}
                data-count={isSplitUpload ? activeControlProfile.uploadSlots.length : Math.min(visibleSourceUploadRefs.length + 1, 4)}
              >
                {isSplitUpload ? (
                  activeControlProfile.uploadSlots.map((slot) => {
                    const refs = refsForUploadRole(slot.role);
                    const previewRef = refs[0];
                    return (
                      <div key={slot.id} className={previewRef ? "ai-upload-slot-card has-image" : "ai-upload-slot-card"}>
                        <button
                          type="button"
                          className="ai-upload-slot-main"
                          onClick={() => selectImagesForUploadRole(slot.role)}
                        >
                          {previewRef ? (
                            <img src={imageAssetSource(previewRef)} alt={slot.assetLabel} loading="lazy" />
                          ) : (
                            <span className="ai-upload-icon" aria-hidden="true">
                              <svg viewBox="0 0 24 24">
                                <path d="M12 5v14M5 12h14" />
                              </svg>
                            </span>
                          )}
                          <strong>{slot.uploadLabel}</strong>
                        </button>
                        {previewRef ? (
                          <button
                            type="button"
                            className="ai-upload-remove"
                            aria-label={`删除${slot.assetLabel}`}
                            onClick={() => removeImageForUploadRole(slot.role, previewRef)}
                          >
                            ×
                          </button>
                        ) : null}
                        <span className="ai-upload-caption">{slot.assetLabel}</span>
                      </div>
                    );
                  })
                ) : (
                  <>
                    <button
                      type="button"
                      className="ai-upload-source-card is-upload"
                      onClick={selectProductImages}
                    >
                      <span className="ai-upload-placeholder" aria-hidden="true">
                        <svg viewBox="0 0 24 24">
                          <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5z" />
                          <path d="m6.5 16 4.2-5.2 3.2 4 1.8-2.1 1.8 2.3" />
                          <circle cx="16.5" cy="7.5" r="1.4" />
                        </svg>
                      </span>
                      <strong>{activeControlProfile.uploadSlots[0]?.uploadLabel || "上传"}</strong>
                    </button>
                    {visibleSourceUploadRefs.map((ref, index) => {
                      const isReferenceRef = activeReferenceImageRefs.includes(ref) && !activeProductImageRefs.includes(ref);
                      return (
                      <div key={`${ref}-${index}`} className="ai-upload-source-card has-image">
                        <button
                          type="button"
                          className="ai-upload-image-button"
                          onClick={() => setSelectedImage({
                            url: imageAssetSource(ref),
                            title: isReferenceRef
                              ? `${activeControlProfile.referenceLabel}${index + 1}`
                              : `${activeControlProfile.productLabel}${index + 1}`,
                            label: "上传素材",
                            alt: isReferenceRef
                              ? `${activeControlProfile.referenceLabel}${index + 1}`
                              : `${activeControlProfile.productLabel}${index + 1}`,
                          })}
                        >
                          <img
                            src={imageAssetSource(ref)}
                            alt={isReferenceRef
                              ? `${activeControlProfile.referenceLabel}${index + 1}`
                              : `${activeControlProfile.productLabel}${index + 1}`}
                            loading="lazy"
                          />
                        </button>
                        <button
                          type="button"
                          className="ai-upload-remove"
                          aria-label={`删除图${index + 1}`}
                          onClick={() => removeImageForUploadRole(isReferenceRef ? "reference" : "product", ref)}
                        >
                          ×
                        </button>
                        <strong>图{index + 1}</strong>
                      </div>
                    );
                    })}
                  </>
                )}
              </div>
          </>
        </section>
        ) : null}

        {activeControlProfile.showMaterialLibrary ? (
        <section className="ai-panel">
          <div className="ai-section-title">
            <span>选择素材</span>
          </div>
          <button type="button" className="ai-material-entry-card" onClick={openMaterialLibrary}>
            {selectedMaterial ? (
              <>
                <img src={selectedMaterial.imageUrl} alt={selectedMaterial.name} loading="lazy" />
                <span>
                  <strong>{selectedMaterial.name}</strong>
                  <em>{selectedMaterial.source} · {selectedMaterial.gender} · {selectedMaterial.ageGroup}</em>
                </span>
              </>
            ) : (
              <>
                <span className="ai-material-entry-mosaic" aria-hidden="true">
                  {libraryMaterials.slice(0, 4).map((item) => (
                    <img key={item.id} src={item.imageUrl} alt="" loading="lazy" />
                  ))}
                </span>
                <span>
                  <strong>素材库</strong>
                  <em>配置您的个性化商拍方案</em>
                </span>
              </>
            )}
          </button>
          {selectedMaterial ? (
            <button type="button" className="ai-selected-material-clear" onClick={clearSelectedMaterial}>
              清理参考素材
            </button>
          ) : null}
        </section>
        ) : null}

        <section className="ai-panel ai-control-stack">
          {activeControlProfile.showViewpoints ? (
          <div className="ai-control-row">
            <span>视角 （多选）</span>
            <div className="ai-chip-group">
              {(["front", "back", "side"] as Viewpoint[]).map((viewpoint) => (
                <button
                  key={viewpoint}
                  type="button"
                  className={selectedViewpoints.includes(viewpoint) ? "active" : ""}
                  onClick={() => toggleViewpoint(viewpoint)}
                >
                  {VIEWPOINT_LABELS[viewpoint]}
                </button>
              ))}
            </div>
          </div>
          ) : null}
          <div className="ai-control-row">
            <span>{activeControlProfile.imageCountLabel}</span>
            <div className="ai-segment">
              {[1, 2, 3].map((count) => (
                <button
                  key={count}
                  type="button"
                  className={imageCount === count ? "active" : ""}
                  onClick={() => setImageCount(count)}
                >
                  {count}
                </button>
              ))}
            </div>
          </div>
          {activeControlProfile.showRatio ? (
            <div className="ai-control-row">
              <span>生图比例</span>
              <select value={ratio} onChange={(event) => setRatio(event.target.value)}>
                {["1:1", "3:4", "4:3", "9:16", "16:9"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </div>
          ) : null}
          {showThresholdControl ? (
            <div className="ai-slider-row">
              <span>黑白阈值：{threshold}</span>
              <input
                type="range"
                aria-label="黑白阈值"
                min="0"
                max="100"
                value={threshold}
                onChange={(event) => setThreshold(Number(event.target.value))}
              />
            </div>
          ) : null}
          {activeControlProfile.showQuality ? (
            <div className="ai-control-row">
              <span>图片质量</span>
              <div className="ai-segment">
                {["2K", "4K"].map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={quality === item ? "active" : ""}
                    onClick={() => setQuality(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {showColorPicker ? (
            <div className="ai-color-row">
              <span>选择色号</span>
              <input
                type="color"
                aria-label="选择色号"
                value={colorValue}
                onChange={(event) => setColorValue(event.target.value.toUpperCase())}
              />
              <em>{colorValue.toUpperCase()}</em>
            </div>
          ) : null}
        </section>

        {activeControlProfile.showPrompt ? (
        <section className="ai-panel ai-prompt-panel">
          <h3>提示词</h3>
          {activeControlProfile.showPromptTools ? (
            <div className="ai-prompt-actions">
              <button type="button" onClick={expandPromptWithCurrentContext}>智能扩写</button>
              <button type="button" onClick={openPromptListDialog}>提示词列表</button>
              <button type="button" onClick={saveCurrentPromptAsTemplate}>保存到模板</button>
            </div>
          ) : null}
          {activeControlProfile.showPromptTabs ? (
            <div className="ai-prompt-tabs">
            {selectedViewpoints.map((viewpoint) => (
              <button
                key={viewpoint}
                type="button"
                className={activeViewpoint === viewpoint ? "active" : ""}
                onClick={() => setActiveViewpoint(viewpoint)}
              >
                {VIEWPOINT_LABELS[viewpoint]}
              </button>
            ))}
            </div>
          ) : null}
          <textarea
            value={activePrompt}
            onChange={(event) =>
              setPromptDrafts((current) => ({
                ...current,
                [activeViewpoint]: event.target.value,
              }))
            }
          />
        </section>
        ) : null}
        <button
          type="button"
          className="ai-generate-button"
          disabled={busy || !workspaceReady}
          onClick={startHomeGeneration}
        >
          {busy ? "生成中" : "开始Ai生成"}
        </button>
        {generationValidationMessage ? (
          <p className="ai-validation-message">{generationValidationMessage}</p>
        ) : null}
        {generationNotice ? (
          <p className="ai-generation-notice">{generationNotice}</p>
        ) : null}
      </aside>

      <main className={mainView === "materials" ? "ai-showcase-main is-materials" : "ai-showcase-main"}>
        {mainView === "cases" ? (
          <>
          <section className="ai-function-board">
            <div className="ai-category-tabs">
              {CATEGORIES.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={activeCategoryId === category.id ? "active" : ""}
                  onClick={() => selectCategory(category)}
                >
                  {category.label}
                </button>
              ))}
            </div>
            <div className="ai-feature-grid">
              {activeCategory.features.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  className={activeFeature.id === feature.id ? "ai-feature-button active" : "ai-feature-button"}
                  title={feature.subtitle}
                  onClick={() => selectFeature(feature)}
                >
                  <FeatureButtonIcon
                    iconKey={iconKeyForFeature(feature, featureUiById, featureUiByTitle)}
                  />
                  <strong>{feature.title}</strong>
                </button>
              ))}
            </div>
          </section>
          <section className="ai-case-board">
            <div className="ai-case-heading">
              <div>
                <h2>优秀案例</h2>
                <p>
                  {backendStatus === "ready"
                    ? `后端素材 ${backendCards.length} 组 · ${backendImageAssets.length} 张资产`
                    : backendStatus === "empty"
                      ? "后端素材待导入"
                      : backendStatus === "error"
                        ? "后端素材读取失败"
                        : "正在读取后端素材"}
                  {selectedFeatureCaseCount ? ` · 当前功能 ${selectedFeatureCaseCount} 组` : ""}
                </p>
                {backendMessage ? <p className="ai-muted">{backendMessage}</p> : null}
              </div>
            </div>
            <div className="ai-industry-filter">
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
            <div className="ai-case-grid">
              {visibleCards.length ? visibleCards.map((item) => (
                <article key={item.id} className="ai-case-card">
                  <div className={urlsForRole(item, "input").length ? "ai-case-compare" : "ai-case-compare output-only"}>
                    {urlsForRole(item, "input").length ? (
                      <ImageStack item={item} role="input" onOpenImage={setSelectedImage} />
                    ) : null}
                    <ImageStack item={item} role="output" onOpenImage={setSelectedImage} />
                  </div>
                  <div className="ai-case-card-footer">
                    <strong className="ai-case-card-name">{displayCaseTitle(item)}</strong>
                    <div className="ai-case-card-actions">
                      <button type="button" onClick={() => setSelectedCase(item)}>
                        <CaseActionIcon name="preview" />
                        <span>预览</span>
                      </button>
                      <button type="button" className="primary" onClick={() => applyCase(item)}>
                        <CaseActionIcon name="try" />
                        <span>尝试示例</span>
                      </button>
                    </div>
                  </div>
                </article>
              )) : (
                <div className="ai-case-empty">
                  暂无数据
                </div>
              )}
            </div>
          </section>
          </>
        ) : (
          <section className="ai-material-library ai-source-material-library">
            <div className="ai-material-library-top">
              <p>系统模特为AI合成数字人，商用需用户自行判断（真人模特中模特图片已获得授权）</p>
              <div className="ai-material-library-actions">
                <button type="button">+ 添加我的模特</button>
                <button type="button">我的收藏</button>
              </div>
            </div>
            <div className="ai-material-tab-bar">
              {([
                ["model", "模特"],
                ["pose", "姿势"],
              ] as Array<[DressingkitMaterialTab, string]>).map(([tab, label]) => (
                <button
                  key={tab}
                  type="button"
                  className={materialTab === tab ? "active" : ""}
                  onClick={() => setMaterialTab(tab)}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="ai-material-filter-panel">
              <MaterialFilterRow
                label="模特"
                value={selectedMaterialSource}
                values={MATERIAL_SOURCE_FILTERS}
                onChange={setSelectedMaterialSource}
              />
              <MaterialFilterRow
                label="性别"
                value={selectedMaterialGender}
                values={MATERIAL_GENDER_FILTERS}
                onChange={setSelectedMaterialGender}
              />
              <MaterialFilterRow
                label="年龄"
                value={selectedMaterialAge}
                values={MATERIAL_AGE_FILTERS}
                onChange={setSelectedMaterialAge}
              />
              <MaterialFilterRow
                label="区域"
                value={selectedMaterialRegion}
                values={MATERIAL_REGION_FILTERS}
                onChange={setSelectedMaterialRegion}
              />
            </div>
            <div className="ai-source-material-grid">
              {visibleMaterials.length ? visibleMaterials.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={selectedMaterialId === item.id ? "ai-source-material-card active" : "ai-source-material-card"}
                  onClick={() => applyMaterial(item)}
                >
                  <span className="ai-source-material-thumb">
                    <img src={item.imageUrl} alt={item.name} loading="lazy" />
                    <span className={item.favorite ? "ai-material-favorite active" : "ai-material-favorite"} aria-hidden="true">
                      ♥
                    </span>
                  </span>
                  <strong>{item.name}</strong>
                </button>
              )) : (
                <div className="ai-case-empty">
                  当前筛选暂无可选素材
                </div>
              )}
            </div>
          </section>
        )}
      </main>

      <button
        type="button"
        className="ai-floating-history"
        aria-label="历史记录"
        onClick={() => setActiveDialog("history")}
      >
        <strong aria-hidden="true">«</strong>
        <span>历史记录</span>
      </button>

      <button type="button" className="ai-prompt-assistant-fab" onClick={() => openPromptAssistant("text")}>
        <span aria-hidden="true">AI</span>
        <strong>提示词助手</strong>
      </button>

      {activeDialog === "prompt-list" ? (
        <DetailDialog
          className="ai-showcase-dialog ai-prompt-list-dialog"
          bodyClassName="ai-showcase-dialog-body ai-prompt-list-dialog-body"
          eyebrow="提示词"
          title="提示词列表"
          description="管理提示词模板，查询、选择、增删改后可确认应用到左侧提示词。"
          onClose={() => setActiveDialog(null)}
        >
          <div className="ai-prompt-list-toolbar">
            <label>
              请选择类型
              <select
                aria-label="提示词类型"
                value={promptListKind}
                onChange={(event) => setPromptListKind(event.target.value as PromptListKind)}
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
                if (selectedPromptListTemplate) {
                  startPromptListEdit(selectedPromptListTemplate);
                }
              }}
              disabled={!selectedPromptListTemplate}
            >
              编辑
            </button>
            <button type="button" className="danger" onClick={deletePromptListDraft} disabled={!promptListEditingId}>删除</button>
          </div>
          <div className="ai-prompt-list-table" role="list" aria-label="提示词列表结果">
            {promptListKind !== "saved" ? (
              promptListDefaultRows.map(([viewpoint, prompt]) => (
                <button
                  key={viewpoint}
                  type="button"
                  className={promptListDefaultViewpoint === viewpoint ? "ai-prompt-list-row active" : "ai-prompt-list-row"}
                  onClick={() => selectPromptListDefault(viewpoint, prompt)}
                >
                  <span className="ai-prompt-list-row-type">默认</span>
                  <strong>{VIEWPOINT_LABELS[viewpoint]}</strong>
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
                    setPromptListDefaultViewpoint("");
                    setPromptListDraftImageRefs(template.imageRefs || []);
                    setActiveViewpoint(template.viewpoint);
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
                  value={activeViewpoint}
                  onChange={(event) => setActiveViewpoint(event.target.value as Viewpoint)}
                >
                  {(Object.keys(VIEWPOINT_LABELS) as Viewpoint[]).map((viewpoint) => (
                    <option key={viewpoint} value={viewpoint}>{VIEWPOINT_LABELS[viewpoint]}</option>
                  ))}
                </select>
              </label>
              <div className="ai-prompt-template-upload">
                <div className="ai-prompt-template-label">上传图片</div>
                <div className="ai-prompt-template-upload-list">
                  <button type="button" className="ai-prompt-template-upload-card" onClick={selectPromptTemplateImages}>
                    <span aria-hidden="true">+</span>
                  </button>
                  {promptListDraftImageRefs.map((ref, index) => (
                    <figure key={`${ref}-${index}`} className="ai-prompt-template-upload-card has-image">
                      <button
                        type="button"
                        onClick={() => setSelectedImage({
                          url: imageAssetSource(ref),
                          title: `模板图片 ${index + 1}`,
                          label: "提示词模板图片",
                          alt: `提示词模板图片${index + 1}`,
                        })}
                      >
                        <img src={imageAssetSource(ref)} alt={`提示词模板图片${index + 1}`} loading="lazy" />
                      </button>
                      <button
                        type="button"
                        className="ai-prompt-template-remove"
                        aria-label={`删除模板图片${index + 1}`}
                        onClick={() => removePromptListImageRef(ref)}
                      >
                        ×
                      </button>
                    </figure>
                  ))}
                </div>
              </div>
              <label>
                提示词内容
                <textarea
                  aria-label="模板提示词"
                  value={promptListDraftPrompt}
                  onChange={(event) => {
                    setPromptListDraftPrompt(event.target.value);
                    setPromptListDefaultViewpoint("");
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

      {activeDialog === "history" ? (
        <ImageHistoryDrawer
          entries={visibleHistoryEntries}
          featureTitle={activeFeature.title}
          backendCaseCount={backendCards.length}
          backendAssetCount={backendAssets.length}
          selectedFeatureCaseCount={selectedFeatureCaseCount}
          uploadCount={activeUploadImageCount}
          selectedMaterialName={selectedMaterial?.name}
          mediaResult={mediaResult}
          onOpenImage={setSelectedImage}
          onPartialRetouch={startPartialRetouchFromHistory}
          onClose={() => setActiveDialog(null)}
        />
      ) : null}

      {activeDialog === "prompt-assistant" ? (
        <div className="ai-assistant-overlay" role="presentation" onClick={() => setActiveDialog(null)}>
          <section
            className={assistantTemplatesOpen ? "ai-assistant-dialog has-templates" : "ai-assistant-dialog"}
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
                    图片反推
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
                        assistantResult || assistantInput || activePrompt,
                        templateDraftTitle,
                        editingTemplateId,
                        assistantImageRefs.length ? assistantImageRefs : undefined,
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
                        <div className="ai-assistant-section-title">上传图片</div>
                        <div className="ai-assistant-upload-list">
                          <button type="button" className="ai-assistant-upload-card is-upload" onClick={selectReferenceImages}>
                            <span aria-hidden="true">+</span>
                            <strong>上传</strong>
                          </button>
                          {assistantImageRefs.map((ref, index) => {
                            const isReferenceRef = activeReferenceImageRefs.includes(ref) && !activeProductImageRefs.includes(ref);
                            return (
                              <div key={`${ref}-${index}`} className="ai-assistant-upload-card has-image">
                                <button
                                  type="button"
                                  className="ai-assistant-upload-image"
                                  onClick={() => setSelectedImage({
                                    url: imageAssetSource(ref),
                                    title: `图片${index + 1}`,
                                    label: isReferenceRef ? activeControlProfile.referenceLabel : activeControlProfile.productLabel,
                                    alt: `提示词助手图片${index + 1}`,
                                  })}
                                >
                                  <img src={imageAssetSource(ref)} alt={`提示词助手图片${index + 1}`} loading="lazy" />
                                </button>
                                <button
                                  type="button"
                                  className="ai-assistant-upload-remove"
                                  aria-label={`删除提示词助手图片${index + 1}`}
                                  onClick={() => removeAssistantImageRef(ref)}
                                >
                                  ×
                                </button>
                                <strong>{isReferenceRef ? activeControlProfile.referenceLabel : activeControlProfile.productLabel}</strong>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <label>输入提示词</label>
                      <textarea
                        value={assistantInput}
                        onChange={(event) => setAssistantInput(event.target.value)}
                        placeholder="描述参考图、主体、材质、背景或上传素材需要反推的重点。"
                      />
                    </section>
                  ) : (
                    <section>
                      <label>输入提示词</label>
                      <textarea
                        value={assistantInput}
                        onChange={(event) => setAssistantInput(event.target.value)}
                        placeholder="请输入要扩写或优化的提示词。"
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
                    <span>{savedTemplates.length} 个模板</span>
                  </header>
                  <label>
                    模板名称
                    <input
                      value={templateDraftTitle}
                      onChange={(event) => setTemplateDraftTitle(event.target.value)}
                      placeholder={`${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`}
                    />
                  </label>
                  <div className="ai-assistant-template-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTemplateId("");
                        setTemplateDraftTitle(`${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`);
                        setAssistantResult("");
                      }}
                    >
                      新建
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => savePromptTemplate(
                        assistantResult || assistantInput || activePrompt,
                        templateDraftTitle,
                        editingTemplateId,
                        assistantImageRefs.length ? assistantImageRefs : undefined,
                      )}
                    >
                      {editingTemplateId ? "更新" : "保存"}
                    </button>
                  </div>
                  <div className="ai-assistant-template-list">
                    {savedTemplates.length ? savedTemplates.map((template) => (
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
            <footer className="ai-assistant-footer">
              <button type="button" onClick={() => setActiveDialog(null)}>取消</button>
              <button type="button" className="primary" onClick={confirmAssistantPrompt}>确定</button>
            </footer>
          </section>
        </div>
      ) : null}

      {selectedCase ? (
        <div className="ai-preview-modal" role="dialog" aria-modal="true" aria-label="预览">
          <div className="ai-preview-card">
            <div className="ai-preview-head">
              <div>
                <span>{selectedCase.industry}</span>
                <h2>预览</h2>
                <em>{selectedCase.title}</em>
              </div>
              <button type="button" onClick={() => setSelectedCase(null)}>关闭</button>
            </div>
            <div className={urlsForRole(selectedCase, "input").length ? "ai-preview-compare" : "ai-preview-compare output-only"}>
              {urlsForRole(selectedCase, "input").length ? (
                <ImageStack item={selectedCase} role="input" variant="preview" onOpenImage={setSelectedImage} />
              ) : null}
              <ImageStack item={selectedCase} role="output" variant="preview" onOpenImage={setSelectedImage} />
            </div>
            <section className="ai-preview-prompt">
              <header>
                <span>提示词</span>
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(selectedCasePrompt);
                    appendHistory({
                      title: `已复制案例提示词：${selectedCase.title}`,
                      detail: selectedCasePrompt.slice(0, 90),
                      tone: "ready",
                    });
                  }}
                >
                  复制
                </button>
              </header>
              <textarea value={selectedCasePrompt} readOnly />
            </section>
            <footer className="ai-preview-footer">
              <button type="button" onClick={() => setSelectedCase(null)}>取消</button>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  applyCase(selectedCase);
                  setSelectedCase(null);
                }}
              >
                确定
              </button>
            </footer>
          </div>
        </div>
      ) : null}

      {selectedImage ? (
        <div
          className="ai-image-preview-modal"
          role="dialog"
          aria-modal="true"
          aria-label={selectedImage.alt}
          onClick={() => setSelectedImage(null)}
        >
          <button type="button" className="ai-image-preview-close" onClick={() => setSelectedImage(null)}>
            关闭
          </button>
          <figure className="ai-image-preview-card" onClick={(event) => event.stopPropagation()}>
            <img src={selectedImage.url} alt={selectedImage.alt} />
            <figcaption>
              <strong>{selectedImage.title}</strong>
              <span>{selectedImage.label}</span>
            </figcaption>
          </figure>
        </div>
      ) : null}
    </div>
  );
}
