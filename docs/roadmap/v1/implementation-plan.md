# 内容工坊 v1 实施计划

更新时间：2026-05-18
状态：Draft
技术栈：Electron + React + Vite + Claude Agent SDK + 文件系统 Skills

## 0. 当前基线

当前项目已经具备：

- Electron 主进程、preload、React renderer 基础骨架。
- 官方 `@anthropic-ai/claude-agent-sdk` 依赖。
- `SettingsStore` 保存 Anthropic API Key 与 workspace。
- `SkillManager` 扫描内置、用户、项目 Skills。
- 4 个内容生产内置 Skills。
- 首版浅色 Content Studio UI。

v1 需要把当前通用内容工坊骨架改造成深色 AI 电商内容生产工作台，覆盖文章、已成型知识库接入、图片、视频、Skills 管理和生成历史；策略分析和 AI 自动搭建知识库后置。

## 1. 模块事实源

| 分类 | 模块 | 说明 |
| --- | --- | --- |
| current | `src/main/services/settingsStore.ts` | API Key、workspace、本地配置。 |
| current | `src/main/services/skillManager.ts` | Skills 文件系统扫描与安装。 |
| current | `src/main/services/claudeAgentService.ts` | Claude Agent SDK 文本编排入口。 |
| new current | `src/main/services/modelConfigStore.ts` | 统一 API endpoint 和文字 / 图片 / 视频模型配置。 |
| new current | `src/main/services/skillSelectionStore.ts` | 当前 workspace 启用的 Skills。 |
| new current | `src/main/services/knowledgeBaseStore.ts` | workspace 已成型知识库、章节、标签和引用片段。 |
| new current | `src/main/services/promptPackService.ts` | 品牌 / 产品提示词包生成与读取。 |
| new current | `src/main/services/sceneLibraryStore.ts` | 产品场景卡生成、保存和复用。 |
| new current | `src/main/services/articleGenerationService.ts` | 文章大纲、正文和发布检查生成。 |
| new current | `src/main/services/generationLogStore.ts` | 文章 / 图片 / 视频生成日志。 |
| new current | `src/main/providers/mediaProvider.ts` | 图片 / 视频 provider adapter。 |
| new current | `src/renderer/src/features/workbench/*` | v1 工作台 UI。 |
| new current | `src/renderer/src/features/skills/*` | Skills 管理 UI。 |
| new current | `src/renderer/src/features/article-engine/*` | 文章生成 UI。 |
| new current | `src/renderer/src/features/knowledge-base/*` | 知识库 UI。 |
| new current | `src/renderer/src/features/prompt-workbench/*` | 提示词包与产品场景库 UI。 |
| new current | `src/renderer/src/features/asset-library/*` | 素材库与生成历史 UI。 |
| future | 策略分析、竞品 / 差评 / 店铺抓取、AI 自动搭建知识库、批量处理、定时任务、云端协作知识库、向量 RAG、团队素材库 | v1 不实现。 |

事实源声明：v1 只向 `Content Studio Electron main services + renderer workbench` 收敛；不引入 Tauri、不 fork Craft、不新增独立后端服务。

## 2. 开发切片

### P0：路线图和设计基线

写集：

- `docs/roadmap/v1/*`

验收：

- 截图诉求被拆成 PRD、UI 蓝图和实施计划。
- 明确 v1 current / future 边界。

状态：已完成文档首版。

### P1：深色工作台壳

写集：

- `src/renderer/src/App.tsx`
- `src/renderer/src/styles.css`
- 可新增 `src/renderer/src/features/workbench/*`

任务：

1. 重构 UI 为三栏布局：左侧导航、中间工作区、右侧全局参数。
2. 增加图片 / 视频 Tab。
3. 增加图片引擎、视频引擎、文章生成、知识库、素材库、生成历史入口。
4. 增加合规检测、AI 对话、图片精修、创意视频、自定义视频占位入口。
5. 增加模型配置和 Skills 管理入口。
6. 增加处理模式：单次处理可用，批量 / 定时 disabled。
7. 按截图改成暗色霓虹视觉。

验收：

- 不接真实模型也能静态展示 Image #1 / #3 / #4 / #5 的主要结构。
- 文章生成、知识库、素材库、生成历史入口清晰可见，P1 可先展示静态壳。
- 页面在 1440px 和 1920px 宽度下不破版。
- Skills 管理入口清晰可见，但 P1 可先展示静态壳。

最小验证：

```bash
npm run typecheck
npm run build
```

### P2：模型配置与全局参数

写集：

- `src/main/services/modelConfigStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/features/settings/ModelConfigDialog.tsx`
- `src/renderer/src/features/workbench/GlobalParamsPanel.tsx`

任务：

1. 增加统一 API endpoint、API Key、文字模型、图片模型、视频模型。
2. API Key 继续只在 main process 保存。
3. 右侧参数面板读取模型配置。
4. 增加生成数量、比例、分辨率、质量本地状态。
5. `获取模型` 先支持 provider mock 或 endpoint metadata。

验收：

- 弹窗保存后右侧参数即时更新。
- Renderer 不可读取 API Key 明文。
- 配置错误有明确内联错误。

### P3：Skills 管理

写集：

- `src/main/services/skillSelectionStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/features/skills/*`
- `src/renderer/src/features/workbench/Sidebar.tsx`

任务：

1. 复用 `SkillManager.scan()` 展示内置、项目、用户和兼容来源 Skills。
2. 复用 `SkillManager.installBuiltin()` 将内置 Skill 安装到当前 workspace。
3. 增加当前 workspace 的启用列表，只存 `slug + source`，不复制 Skill 内容。
4. 无效 Skill 展示校验错误，不允许启用。
5. 在图片 / 视频生成请求中带上启用的 `selectedSkillSlugs`。
6. Skills 管理页展示来源、路径、描述、frontmatter 和安装状态。

验收：

- 至少 4 个内置 Skills 可见。
- 没有 workspace 时，安装动作禁用且说明原因。
- 安装后重新扫描能看到项目级 Skill。
- 启用列表刷新后不丢失。
- 生成请求能拿到当前启用的 Skills。

### P4：知识库基础

写集：

- `src/main/services/knowledgeBaseStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/features/knowledge-base/*`

任务：

1. 在 workspace 下保存已成型知识库索引、章节、标签、摘要和引用片段。
2. 支持选择内置产品型知识库和个人 IP 型知识库。
3. 支持导入 DOCX、Markdown、纯文本、JSON 等已成型知识库文件。
4. 支持关键词、标签、知识库类型和章节类型检索。
5. 支持选择引用片段并发送到文章、图片提示词或视频脚本生成。
6. 记录引用片段的 `sourceId`、`sectionType`、`title`、`excerpt`，不做云端同步。

验收：

- 无 workspace 时显示明确空态。
- 选择内置样例或导入成型知识库后可检索。
- 产品型和个人 IP 型知识库能被区分展示。
- 引用片段能被后续生成请求读取。
- 不做策略分析、竞品抓取、差评采集、店铺诊断或 AI 自动搭建知识库。
- 不提供默认删除 / 覆盖破坏性动作。

### P4.5：品牌提示词包与产品场景库

写集：

- `src/main/services/promptPackService.ts`
- `src/main/services/sceneLibraryStore.ts`
- `src/main/services/generationLogStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/features/prompt-workbench/*`
- `src/renderer/src/features/asset-library/*`

任务：

1. 从知识库引用片段生成品牌 / 产品提示词包。
2. 提示词包包含品牌口吻、视觉风格、卖点表达、合规边界、平台限制、图片提示词片段、视频提示词片段。
3. 从提示词包和知识引用生成产品场景卡。
4. 场景卡包含目标人群、痛点场景、使用场景、画面构图、主卖点、口播方向、图片素材建议、视频素材建议。
5. 场景卡可以发送到文章生成、图片引擎和视频引擎。
6. 提示词包和场景卡写入素材库 / 生成历史，支持复用和追溯。

验收：

- 用户能从已选知识引用生成提示词包。
- 用户能从提示词包生成至少 3 张产品场景卡。
- 图片引擎能读取场景卡和图片提示词片段。
- 视频引擎能读取场景卡、图片素材建议和视频提示词片段。
- 生成日志记录知识引用、提示词包、场景卡、模型和 Skills。

### P5：文章生成

写集：

- `src/main/services/articleGenerationService.ts`
- `src/main/services/generationLogStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/features/article-engine/*`
- `src/renderer/src/features/asset-library/*`

任务：

1. 文章输入：类型、平台、目标读者、主题、语气、字数范围、自定义要求。
2. 选择知识库引用、提示词包、场景卡和素材引用。
3. 使用 Claude Agent SDK + `content-strategist` / `article-drafter` / `publish-checker` 生成大纲、正文和发布检查。
4. 导出 Markdown。
5. 将文章输出、知识引用、Skills、模型和错误写入生成历史。

验收：

- 无知识引用时可以生成，但 UI 明确提示未使用知识库。
- 生成结果包含标题候选、大纲、Markdown 正文和发布检查。
- 生成历史可查看并复用本次参数。
- 导出路径通过 Electron dialog 或 workspace 相对路径处理，不硬编码平台路径。

### P6：图片引擎单次生成

写集：

- `src/main/providers/mediaProvider.ts`
- `src/main/services/imageGenerationService.ts`
- `src/main/services/generationLogStore.ts`
- `src/renderer/src/features/image-engine/*`
- `src/shared/types.ts`

任务：

1. 产品图上传 0/10、参考图上传 0/6。
2. 读取提示词包和场景卡，生成图片提示词草稿。
3. 预设提示词 / 自由模式 / 智能生成 / 固定生成。
4. 模板 chip 列表。
5. 统一生成 payload。
6. 调用图片 provider 或在 provider 缺失时返回结构化错误。
7. 结果预览、日志、导出。

验收：

- 单次生成链路能形成 request log。
- 成功或失败都有 UI 反馈。
- 导出按钮不会在无结果时可用。

### P7：视频拆解和脚本生成

写集：

- `src/main/services/videoAnalysisService.ts`
- `src/main/services/videoScriptService.ts`
- `src/renderer/src/features/video-engine/*`
- `resources/skills/video-breakdown/SKILL.md`
- `resources/skills/video-script-writer/SKILL.md`

任务：

1. 视频拆解页：本地视频上传 / 链接输入 / 拆解维度选择。
2. 使用 Claude Agent SDK + Skills 生成拆解结果。
3. 脚本生成页：新产品信息表单。
4. 输出新视频脚本和分镜占位。
5. 脚本可读取产品场景卡和品牌提示词包。
6. 把拆解结果、产品信息、提示词包和场景卡写入生成日志。

验收：

- 无真实视频模型时，文本拆解和脚本生成仍可工作。
- 脚本包含镜头、口播、字幕、画面和节奏。

### P8：视频生成占位队列

写集：

- `src/main/services/videoGenerationService.ts`
- `src/renderer/src/features/video-engine/VideoGenerationStep.tsx`
- `src/main/services/generationLogStore.ts`

任务：

1. 视频生成页字段：模型、比例、时长、素材、提示词。
2. 支持从图片素材、场景卡、脚本和视频提示词生成视频队列。
3. 生成历史列表。
4. 任务状态：等待中 / 生成中 / 成功 / 失败。
5. provider 未接入时展示明确「视频模型未配置」错误。

验收：

- 视频生成页面可完整操作到生成队列。
- 不产生假成功视频。

### P9：入口占位与收口

写集：

- `src/renderer/src/features/sidebar/*`
- `src/renderer/src/features/placeholders/*`
- `README.md`

任务：

1. 合规检测、AI 对话、图片精修、创意视频、自定义视频显示占位页。
2. 内容策划、发布检查作为文章生成内置步骤，不额外做假页面。
3. 批量处理、定时任务显示 disabled 原因。
4. 增加空态和错误态文案。
5. README 更新使用说明。

验收：

- 所有可见入口都有清晰状态。
- 用户不会误以为未实现能力已经可用。

## 3. 数据模型草案

### 3.1 ModelConfig

```ts
export interface ModelConfig {
  apiEndpoint: string;
  hasApiKey: boolean;
  textModel: string;
  imageModels: string[];
  videoModel: string;
  updatedAt: string;
}
```

### 3.2 GlobalGenerationParams

```ts
export interface GlobalGenerationParams {
  imageModel: string;
  textModel: string;
  videoModel: string;
  runMode: 'single' | 'parallel' | 'inline';
  count: number;
  aspectRatio: '1:1' | '4:5' | '5:4' | '3:4' | '4:3' | '2:3' | '3:2' | '9:16' | '16:9' | '21:9' | '9:21' | '1:8';
  resolution: '1k' | '2k' | '4k';
  quality: 'low' | 'medium' | 'high';
}
```

### 3.3 ImageGenerationRequest

```ts
export interface ImageGenerationRequest {
  productImageRefs: string[];
  referenceImageRefs: string[];
  prompt: string;
  promptMode: 'free' | 'preset';
  generationMode: 'smart' | 'fixed';
  template: string;
  watermark: boolean;
  params: GlobalGenerationParams;
}
```

### 3.4 VideoBreakdownResult

```ts
export interface VideoBreakdownResult {
  sourceRef: string;
  selectedDimensions: string[];
  segments: Array<{
    index: number;
    startMs?: number;
    endMs?: number;
    hook?: string;
    sellingPoint?: string;
    visual?: string;
    script?: string;
    conversionCue?: string;
  }>;
  summary: string;
}
```

### 3.5 SkillSelection

```ts
export interface SkillSelection {
  workspacePath: string;
  enabledSkills: Array<{
    slug: string;
    source: 'builtin' | 'project' | 'project-compat' | 'user' | 'user-compat';
  }>;
  updatedAt: string;
}
```

### 3.6 KnowledgeSource

```ts
export interface KnowledgeSource {
  id: string;
  workspacePath: string;
  title: string;
  baseType: 'product-kb' | 'personal-ip-kb';
  sectionType:
    | 'science'
    | 'brand'
    | 'product'
    | 'selling-point'
    | 'scenario-script'
    | 'objection-handling'
    | 'compliance'
    | 'qa'
    | 'spec'
    | 'profile'
    | 'timeline'
    | 'story'
    | 'methodology'
    | 'quote'
    | 'voice-style'
    | 'boundary';
  tags: string[];
  summary?: string;
  content: string;
  sourcePath?: string;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeCitation {
  sourceId: string;
  title: string;
  sectionType?: KnowledgeSource['sectionType'];
  excerpt: string;
}
```

### 3.7 PromptPack

```ts
export interface PromptPack {
  id: string;
  workspacePath: string;
  name: string;
  baseType: 'product-kb' | 'personal-ip-kb';
  citations: KnowledgeCitation[];
  brandVoice: string;
  visualStyle: string;
  sellingPointRules: string[];
  complianceBoundaries: string[];
  platformConstraints: string[];
  imagePromptFragments: string[];
  videoPromptFragments: string[];
  createdAt: string;
  updatedAt: string;
}
```

### 3.8 SceneCard

```ts
export interface SceneCard {
  id: string;
  workspacePath: string;
  promptPackId: string;
  title: string;
  audience: string;
  painPoint: string;
  usageScene: string;
  visualComposition: string;
  sellingPoint: string;
  voiceoverDirection: string;
  imageMaterialSuggestion: string;
  videoMaterialSuggestion: string;
  citations: KnowledgeCitation[];
  createdAt: string;
  updatedAt: string;
}
```

### 3.9 ArticleGenerationRequest

```ts
export interface ArticleGenerationRequest {
  articleType: 'wechat-longform' | 'xiaohongshu-note' | 'product-seeding' | 'detail-page-copy' | 'short-video-script';
  platform: string;
  audience: string;
  topic: string;
  tone: string;
  length: 'short' | 'medium' | 'long' | 'custom';
  customRequirement?: string;
  citations: KnowledgeCitation[];
  promptPackId?: string;
  sceneCardIds?: string[];
  assetRefs: string[];
  selectedSkillSlugs: string[];
  params: Pick<GlobalGenerationParams, 'textModel'>;
}
```

## 4. Skills 规划

现有 Skills：

- `content-strategist`
- `article-drafter`
- `asset-planner`
- `publish-checker`

v1 新增建议：

- `ecommerce-image-prompt`：电商图片提示词。
- `video-breakdown`：爆款视频拆解。
- `video-script-writer`：复刻脚本生成。
- `compliance-reviewer`：图片 / 文案合规检查。
- `knowledge-citation-picker`：从已成型知识库中挑选引用片段。
- `prompt-pack-builder`：从知识引用生成品牌 / 产品提示词包。
- `scene-library-builder`：从提示词包生成产品场景库。
- `brand-voice-keeper`：品牌 / 个人 IP 口吻与禁用表达维护。

注意：用户 UI 不展示 Skill 路径，显示为「预设提示词」「拆解维度」「生成方式」。

管理策略：

- `Skills 管理` 是高级页面，可以展示 Skill 名称、来源、路径和校验错误。
- 生成主链只展示业务化名称，不把 `Skill path` 放到普通用户流程里。
- v1 只做本地文件系统 Skills，不接在线市场。
- 内置 Skills 可以安装到 workspace；用户级和项目级 Skills 只扫描、启用、禁用，不主动覆盖。

## 5. 验证策略

每个切片最小验证：

```bash
npm run typecheck
npm run build
```

P3 以后增加：

- 模型配置保存 / 回填手动 smoke。
- 内置知识库选择 / 成型文件导入 / 检索 smoke。
- 提示词包 / 产品场景卡生成 smoke。
- 文章生成文本 smoke。
- 图片生成 provider mock smoke。
- 视频拆解文本 smoke。
- 导出路径 smoke。

## 6. 风险

| 风险 | 应对 |
| --- | --- |
| 图片 / 视频 provider API 不稳定 | 通过 `mediaProvider` adapter 隔离。 |
| UI 一次性复刻过多页面导致复杂 | 先做静态 shell，再接生成链路。 |
| Skills 与预设提示词概念混淆 | UI 翻译成用户语言，内部保留 Skill 管理。 |
| Skills 管理误覆盖用户文件 | 只允许安装内置 Skill 到 workspace；覆盖动作如需保留，后续加确认与备份。 |
| 知识库范围膨胀成复杂 RAG 平台 | v1 只消费已成型知识库，做本地索引、关键词检索和手动引用；策略分析、自动搭建、向量、网页抓取和云同步后置。 |
| 文章生成事实漂移 | 生成请求必须记录知识引用；未引用时 UI 明确提示。 |
| API Key 泄漏 | 继续只在 Electron main 保存，不经 Renderer 回传。 |
| 视频生成成本和时延高 | v1 先做队列和日志，不伪造成功。 |

## 7. 推荐下一刀

下一刀优先做 P1：把当前浅色通用内容工坊 UI 改成三栏深色 AI 电商内容工作台壳，并把文章生成、已成型知识库、素材库、生成历史、Skills 管理入口一次摆正。这样可以最快验证信息架构是否成立，并为后续模型配置、知识引用、文章生成、图片生成和视频拆解留下稳定容器。
