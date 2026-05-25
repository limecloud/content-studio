import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  BuguAuthState,
  OemPublicAsset,
  OemPublicCase,
  OemPublicSiteConfig,
  OemSiteConfigRequest,
} from "../../../../shared/types";
import { fileNameFromPath, localAssetUrl } from "../../app/formatters";
import { DetailDialog } from "../DetailDialog";

type ShowcaseCategoryId = "marketing" | "product-design" | "production";
type Viewpoint = "front" | "back" | "side";
type ShowcaseDialog = "feature-picker" | "materials" | "prompt-list" | "history" | null;

interface ImageShowcaseModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  productImageRefs: string[];
  authState: BuguAuthState | null;
  onSelectProductImages: () => void;
  onUsePromptInImage: (prompt: string) => void;
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
  createdAt: string;
}

interface HistoryEntry {
  id: string;
  title: string;
  detail: string;
  tone: "ready" | "idle" | "warning" | "blocked";
  createdAt: string;
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
  return tags.includes("ai-image-showcase") || tags.includes("dressingkit-compatible") || (item.mediaRefs || []).length >= 2;
}

function tagValue(tags: string[] | undefined, prefix: string): string {
  const tag = (tags || []).find((item) => item.startsWith(prefix));
  return tag ? tag.slice(prefix.length).trim() : "";
}

function featureIdFromCase(item: OemPublicCase): string {
  const tags = item.tags || [];
  const explicitFeatureId = tagValue(tags, "feature:");
  if (FEATURE_IDS.has(explicitFeatureId)) return explicitFeatureId;

  const businessFlagTag = tags.find((tag) => tag.startsWith("dressingkit-business-"));
  const businessFlag = businessFlagTag?.replace("dressingkit-business-", "") || "";
  const featureId = FEATURE_ID_BY_BUSINESS_FLAG.get(businessFlag);
  if (featureId) return featureId;

  const plainFeatureId = tags.find((tag) => FEATURE_IDS.has(tag));
  return plainFeatureId || "model-product-display";
}

function roleFromAsset(ref: string, asset?: OemPublicAsset): "input" | "output" | "unknown" {
  const text = `${ref} ${asset?.caption || ""}`.toLowerCase();
  if (text.includes("output") || text.includes("输出")) return "output";
  if (text.includes("input") || text.includes("输入")) return "input";
  return "unknown";
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

function urlsForRole(item: LocalShowcaseCase, role: "input" | "output"): string[] {
  const urls = role === "input"
    ? item.inputUrls || (item.inputUrl ? [item.inputUrl] : [])
    : item.outputUrls || (item.outputUrl ? [item.outputUrl] : []);
  return urls.filter(Boolean);
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

function ImageStack({
  item,
  role,
  variant = "card",
}: {
  item: LocalShowcaseCase;
  role: "input" | "output";
  variant?: "card" | "preview";
}) {
  const urls = urlsForRole(item, role);
  const label = role === "input" ? "输入图" : "输出图";
  const visibleUrls = urls.slice(0, role === "input" && variant === "card" ? 3 : 1);
  const hiddenCount = Math.max(0, urls.length - visibleUrls.length);
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
        <div className="ai-image-stack-grid" data-count={Math.min(visibleUrls.length, 3)} data-role={role}>
          {visibleUrls.map((url, index) => (
            <div key={`${url}-${index}`} className="ai-image-frame">
              <img src={url} alt={`${item.title} ${label} ${index + 1}`} loading="lazy" />
              {hiddenCount && index === visibleUrls.length - 1 ? (
                <span className="ai-image-more">+{hiddenCount}</span>
              ) : null}
            </div>
          ))}
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
    input.feature.id === "change-background" ? `- 换背景黑白阈值：${input.threshold}` : "",
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

export function ImageShowcaseModule({
  busy,
  workspaceReady,
  productImageRefs,
  authState,
  onSelectProductImages,
  onUsePromptInImage,
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
  const [colorValue, setColorValue] = useState("#395745");
  const [promptDrafts, setPromptDrafts] = useState(DEFAULT_PROMPTS);
  const [selectedCase, setSelectedCase] = useState<LocalShowcaseCase | null>(null);
  const [activeDialog, setActiveDialog] = useState<ShowcaseDialog>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedPromptTemplate[]>([]);
  const [historyEntries, setHistoryEntries] = useState<HistoryEntry[]>([]);
  const [backendCases, setBackendCases] = useState<OemPublicCase[]>([]);
  const [backendAssets, setBackendAssets] = useState<OemPublicAsset[]>([]);
  const [backendStatus, setBackendStatus] = useState<"loading" | "ready" | "empty" | "error">("loading");
  const [backendMessage, setBackendMessage] = useState("");
  const [featureUiConfig, setFeatureUiConfig] = useState<ShowcaseFeatureUiConfig | null>(null);

  function appendHistory(entry: Omit<HistoryEntry, "id" | "createdAt">): void {
    setHistoryEntries((current) => [
      { ...entry, id: historyId(), createdAt: new Date().toISOString() },
      ...current,
    ].slice(0, 16));
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
        const cases = Array.isArray(site.cases) ? site.cases : [];
        const assets = Array.isArray(site.assets) ? site.assets : [];
        setBackendCases(cases);
        setBackendAssets(assets);
        setFeatureUiConfig(readFeatureUiConfig(site));
        setBackendStatus(cases.length || assets.length ? "ready" : "empty");
        appendHistory({
          title: cases.length || assets.length ? "已加载 OEM 案例清单" : "OEM 素材清单为空",
          detail: cases.length || assets.length
            ? `${cases.length} 组案例 · ${assets.length} 张素材`
            : "后端没有返回可展示的案例和素材。",
          tone: cases.length || assets.length ? "ready" : "warning",
        });
      })
      .catch((error) => {
        if (error?.name === "AbortError") return;
        setFeatureUiConfig(null);
        setBackendStatus("error");
        setBackendMessage(error instanceof Error ? error.message : "读取 OEM 公共配置失败");
        appendHistory({
          title: "OEM 案例清单读取失败",
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
  const activePrompt = promptDrafts[activeViewpoint];
  const selectedFeatureCaseCount = visibleCards.length;

  function saveCurrentPromptAsTemplate(): void {
    const template = {
      id: historyId(),
      title: `${activeFeature.title} · ${VIEWPOINT_LABELS[activeViewpoint]}`,
      viewpoint: activeViewpoint,
      featureTitle: activeFeature.title,
      prompt: activePrompt.trim(),
      createdAt: new Date().toISOString(),
    };
    if (!template.prompt) return;
    setSavedTemplates((current) => [template, ...current].slice(0, 12));
    appendHistory({
      title: "已保存当前提示词模板",
      detail: `${template.title} · ${template.prompt.slice(0, 80)}`,
      tone: "ready",
    });
    setActiveDialog("prompt-list");
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

  function applyCase(item: LocalShowcaseCase): void {
    setActiveCategoryId(findFeatureCategoryId(item.featureId));
    setActiveFeatureId(item.featureId);
    setSelectedIndustry(item.industry);
    const nextPrompt = item.prompt?.trim() || `${DEFAULT_PROMPTS.front}\n\n参考案例：${item.title}。生成方向：${item.summary}。`;
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
  }

  return (
    <div className="ai-showcase-shell">
      <aside className="ai-showcase-left">
        <section className="ai-panel scene-panel">
          <div className="ai-panel-heading">
            <div>
              <span>选择场景</span>
              <h2>{activeFeature.title}</h2>
            </div>
            <button type="button" className="ai-link-button" onClick={() => setActiveDialog("feature-picker")}>选择功能</button>
          </div>
          <p>{activeFeature.subtitle}</p>
        </section>

        <section className="ai-panel">
          <div className="ai-section-title">
            <span>上传素材</span>
            <em>{productImageRefs.length ? `${productImageRefs.length} 张已选` : "未选择"}</em>
          </div>
          <div className="ai-upload-grid">
            {(["front", "back", "side"] as Viewpoint[]).map((viewpoint) => (
              <button
                key={viewpoint}
                type="button"
                className="ai-upload-card"
                onClick={onSelectProductImages}
              >
                <strong>{VIEWPOINT_LABELS[viewpoint]}</strong>
                <span>{productImageRefs.length ? "重新选择素材" : "上传图片"}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-section-title">
            <span>选择素材</span>
            <button type="button" onClick={() => setActiveDialog("materials")}>素材库</button>
          </div>
          <p className="ai-muted">配置您的个性化商拍方案</p>
        </section>

        <section className="ai-panel ai-control-stack">
          <div className="ai-control-row">
            <span>视角</span>
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
          <div className="ai-control-row">
            <span>生图数量</span>
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
          <div className="ai-control-row">
            <span>生图比例</span>
            <select value={ratio} onChange={(event) => setRatio(event.target.value)}>
              {["1:1", "3:4", "4:3", "9:16", "16:9"].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </div>
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
          {activeFeature.id === "change-background" ? (
            <>
              <label className="ai-slider-row">
                <span>黑白阈值：{threshold}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={threshold}
                  onChange={(event) => setThreshold(Number(event.target.value))}
                />
              </label>
              <label className="ai-color-row">
                <span>选择色号</span>
                <input
                  type="color"
                  value={colorValue}
                  onChange={(event) => setColorValue(event.target.value)}
                />
                <em>{colorValue.toUpperCase()}</em>
              </label>
            </>
          ) : null}
        </section>

        <section className="ai-panel ai-prompt-panel">
          <div className="ai-prompt-actions">
            <button type="button" onClick={expandPromptWithCurrentContext}>智能扩写</button>
            <button type="button" onClick={() => setActiveDialog("prompt-list")}>提示词列表</button>
            <button type="button" onClick={saveCurrentPromptAsTemplate}>保存到模板</button>
          </div>
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
          <textarea
            value={activePrompt}
            onChange={(event) =>
              setPromptDrafts((current) => ({
                ...current,
                [activeViewpoint]: event.target.value,
              }))
            }
          />
          <button
            type="button"
            className="ai-generate-button"
            disabled={busy || !workspaceReady}
            onClick={() => onUsePromptInImage(activePrompt)}
          >
            {busy ? "生成中" : "开始Ai生成"}
          </button>
        </section>
      </aside>

      <main className="ai-showcase-main">
        <section className="ai-function-board">
          <div className="ai-category-tabs">
            {CATEGORIES.map((category) => (
              <button
                key={category.id}
                type="button"
                className={activeCategoryId === category.id ? "active" : ""}
                onClick={() => setActiveCategoryId(category.id)}
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
                onClick={() => setActiveFeatureId(feature.id)}
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
                  ? `后端素材 ${backendCards.length} 组 · ${backendAssets.length} 张资产`
                  : backendStatus === "empty"
                    ? "后端素材待导入"
                    : backendStatus === "error"
                      ? "后端素材读取失败"
                      : "正在读取后端素材"}
                {selectedFeatureCaseCount ? ` · 当前功能 ${selectedFeatureCaseCount} 组` : ""}
              </p>
              {backendMessage ? <p className="ai-muted">{backendMessage}</p> : null}
            </div>
            <button type="button" className="ai-history-pill" onClick={() => setActiveDialog("history")}>历史记录</button>
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
                  {urlsForRole(item, "input").length ? <ImageStack item={item} role="input" /> : null}
                  <ImageStack item={item} role="output" />
                </div>
                <div className="ai-case-card-meta">
                  <strong>{item.title}</strong>
                  <span>{item.industry}</span>
                </div>
                <div className="ai-case-card-footer">
                  <button type="button" onClick={() => setSelectedCase(item)}>预览</button>
                  <button type="button" className="primary" onClick={() => applyCase(item)}>尝试示例</button>
                </div>
              </article>
            )) : (
              <div className="ai-case-empty">
                当前功能暂无优秀案例
              </div>
            )}
          </div>
        </section>
      </main>

      <button type="button" className="ai-floating-history" onClick={() => setActiveDialog("history")}>历史记录</button>
      <div className="ai-prompt-helper">
        <strong>提示词助手</strong>
        <span>{ratio} · {quality} · {imageCount} 张</span>
      </div>

      {activeDialog === "feature-picker" ? (
        <DetailDialog
          className="ai-showcase-dialog"
          bodyClassName="ai-showcase-dialog-body"
          eyebrow="场景选择"
          title="选择功能"
          description="按业务分类切换不同的 AI 生图能力，保持和原站一致的功能入口。"
          onClose={() => setActiveDialog(null)}
        >
          <div className="ai-feature-picker">
            {CATEGORIES.map((category) => (
              <section key={category.id} className="ai-dialog-section">
                <header className="ai-dialog-section-header">
                  <div>
                    <strong>{category.label}</strong>
                    <span>{category.features.length} 个功能</span>
                  </div>
                </header>
                <div className="ai-feature-picker-grid">
                  {category.features.map((feature) => (
                    <button
                      key={feature.id}
                      type="button"
                      className={activeFeature.id === feature.id && activeCategoryId === category.id ? "active" : ""}
                      onClick={() => {
                        setActiveCategoryId(category.id as ShowcaseCategoryId);
                        setActiveFeatureId(feature.id);
                        setActiveDialog(null);
                        appendHistory({
                          title: `切换功能：${feature.title}`,
                          detail: `${category.label} · ${feature.subtitle}`,
                          tone: "ready",
                        });
                      }}
                    >
                      <span className="ai-feature-picker-title">
                        <FeatureButtonIcon
                          iconKey={iconKeyForFeature(feature, featureUiById, featureUiByTitle)}
                        />
                        <strong>{feature.title}</strong>
                      </span>
                      <span>{feature.subtitle}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </DetailDialog>
      ) : null}

      {activeDialog === "materials" ? (
        <DetailDialog
          className="ai-showcase-dialog"
          bodyClassName="ai-showcase-dialog-body"
          eyebrow="素材库"
          title="选择素材"
          description="上传素材和后端案例素材都可以在这里查看。"
          onClose={() => setActiveDialog(null)}
        >
          <div className="ai-dialog-columns">
            <section className="ai-dialog-section">
              <header className="ai-dialog-section-header">
                <div>
                  <strong>当前上传素材</strong>
                  <span>{productImageRefs.length} 张</span>
                </div>
                <button type="button" className="ghost small" onClick={onSelectProductImages}>继续上传</button>
              </header>
              <div className="ai-material-grid">
                {productImageRefs.length ? (
                  productImageRefs.map((ref) => (
                    <figure key={ref} className="ai-material-card">
                      <img src={localAssetUrl(ref)} alt={fileNameFromPath(ref)} loading="lazy" />
                      <figcaption>{fileNameFromPath(ref)}</figcaption>
                    </figure>
                  ))
                ) : (
                  <div className="ai-dialog-empty">还没有选择上传素材。</div>
                )}
              </div>
            </section>

            <section className="ai-dialog-section">
              <header className="ai-dialog-section-header">
                <div>
                  <strong>后端案例素材</strong>
                  <span>{backendAssets.length} 张 · {backendCards.length} 组案例</span>
                </div>
              </header>
              <div className="ai-material-grid">
                {backendAssets.length ? (
                  backendAssets.slice(0, 12).map((asset) => (
                    <figure key={asset.id} className="ai-material-card">
                      {asset.publicUrl ? (
                        <img src={asset.publicUrl} alt={asset.caption || asset.id} loading="lazy" />
                      ) : (
                        <div className="ai-dialog-empty">无可预览链接</div>
                      )}
                      <figcaption>{asset.caption || asset.id}</figcaption>
                    </figure>
                  ))
                ) : (
                  <div className="ai-dialog-empty">后端还没有可展示的素材。</div>
                )}
              </div>
            </section>
          </div>
        </DetailDialog>
      ) : null}

      {activeDialog === "prompt-list" ? (
        <DetailDialog
          className="ai-showcase-dialog"
          bodyClassName="ai-showcase-dialog-body"
          eyebrow="提示词"
          title="提示词列表"
          description="快速切换默认提示词或保存当前方案。"
          onClose={() => setActiveDialog(null)}
        >
          <div className="ai-dialog-columns">
            <section className="ai-dialog-section">
              <header className="ai-dialog-section-header">
                <div>
                  <strong>默认提示词</strong>
                  <span>点击即可切换视角</span>
                </div>
              </header>
              <div className="ai-prompt-bank">
                {(Object.entries(DEFAULT_PROMPTS) as Array<[Viewpoint, string]>).map(([viewpoint, prompt]) => (
                  <button
                    key={viewpoint}
                    type="button"
                    className={activeViewpoint === viewpoint ? "active" : ""}
                    onClick={() => applyPromptTemplate(viewpoint)}
                  >
                    <strong>{VIEWPOINT_LABELS[viewpoint]}</strong>
                    <span>{prompt.slice(0, 110)}...</span>
                  </button>
                ))}
              </div>
            </section>

            <section className="ai-dialog-section">
              <header className="ai-dialog-section-header">
                <div>
                  <strong>当前模板</strong>
                  <span>{savedTemplates.length} 个已保存模板</span>
                </div>
                <button type="button" className="ghost small" onClick={saveCurrentPromptAsTemplate}>保存当前</button>
              </header>
              <div className="ai-prompt-editor">
                <textarea
                  value={activePrompt}
                  onChange={(event) =>
                    setPromptDrafts((current) => ({
                      ...current,
                      [activeViewpoint]: event.target.value,
                    }))
                  }
                />
                <div className="ai-muted">当前：{activeFeature.title} · {ratio} · {quality}</div>
              </div>
              <div className="ai-saved-template-list">
                {savedTemplates.length ? (
                  savedTemplates.map((template) => (
                    <article key={template.id} className="ai-saved-template-card">
                      <div>
                        <strong>{template.title}</strong>
                        <span>{formatHistoryTime(template.createdAt)} · {template.featureTitle}</span>
                      </div>
                      <p>{template.prompt.slice(0, 140)}</p>
                      <button
                        type="button"
                        className="ghost small"
                        onClick={() => {
                          setActiveViewpoint(template.viewpoint);
                          setPromptDrafts((current) => ({
                            ...current,
                            [template.viewpoint]: template.prompt,
                          }));
                          appendHistory({
                            title: `已应用模板：${template.title}`,
                            detail: template.featureTitle,
                            tone: "ready",
                          });
                          setActiveDialog(null);
                        }}
                      >
                        应用
                      </button>
                    </article>
                  ))
                ) : (
                  <div className="ai-dialog-empty">还没有保存模板。</div>
                )}
              </div>
            </section>
          </div>
        </DetailDialog>
      ) : null}

      {activeDialog === "history" ? (
        <DetailDialog
          className="ai-showcase-dialog"
          bodyClassName="ai-showcase-dialog-body"
          eyebrow="运行历史"
          title="历史记录"
          description="查看最近的素材加载、案例套用和提示词动作。"
          onClose={() => setActiveDialog(null)}
        >
          <div className="ai-history-summary">
            <span>后端案例 {backendCards.length} 组</span>
            <span>后端资产 {backendAssets.length} 张</span>
            <span>当前功能 {selectedFeatureCaseCount} 组</span>
          </div>
          <div className="ai-history-list">
            {historyEntries.length ? (
              historyEntries.map((entry) => (
                <article key={entry.id} className={`ai-history-item tone-${entry.tone}`}>
                  <div>
                    <strong>{entry.title}</strong>
                    <span>{formatHistoryTime(entry.createdAt)}</span>
                  </div>
                  <p>{entry.detail}</p>
                </article>
              ))
            ) : (
              <div className="ai-dialog-empty">还没有生成任何历史记录。</div>
            )}
          </div>
        </DetailDialog>
      ) : null}

      {selectedCase ? (
        <div className="ai-preview-modal" role="dialog" aria-modal="true">
          <div className="ai-preview-card">
            <div className="ai-preview-head">
              <div>
                <span>{selectedCase.industry}</span>
                <h2>{selectedCase.title}</h2>
              </div>
              <button type="button" onClick={() => setSelectedCase(null)}>关闭</button>
            </div>
            <div className="ai-preview-compare">
              {urlsForRole(selectedCase, "input").length ? <ImageStack item={selectedCase} role="input" variant="preview" /> : null}
              <ImageStack item={selectedCase} role="output" variant="preview" />
            </div>
            <p>{selectedCase.summary}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
