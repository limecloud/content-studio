# 布谷AI内容工厂 v1 实施计划

更新时间：2026-05-19
状态：Draft
技术栈：Electron + React + Vite + Claude SDK + 文件系统 能力

## 0. 当前基线

当前项目已经具备：

- 2026-05-19 已完成上一代 Web 调研，结论沉淀到 `docs/roadmap/v1/yanshi-legacy-research.md`。
- Electron 主进程、preload、React renderer 基础骨架。
- 官方 `@anthropic-ai/claude-agent-sdk` 依赖。
- `SettingsStore` 保存 Anthropic API Key 与 工作区。
- `SkillManager` 扫描内置、用户、项目 能力。
- 4 个内容生产内置 skills。
- 首版浅色 布谷AI UI。

v1 需要把当前通用布谷AI内容工厂骨架改造成深色 AI 电商内容生产工作台，覆盖文章、已成型知识库接入、图片、视频、skills 管理和生成历史；策略分析和 AI 自动搭建知识库后置。

## 1. 模块事实源

| 分类 | 模块 | 说明 |
| --- | --- | --- |
| current | `src/main/services/settingsStore.ts` | API Key、工作区、本地配置。 |
| current | `src/main/services/skillManager.ts` | 能力 文件系统扫描与安装。 |
| current | `src/main/services/claudeAgentService.ts` | Claude SDK 文本编排入口。 |
| new current | `src/main/services/modelConfigStore.ts` | 统一 API endpoint 和文字 / 图片 / 视频模型配置。 |
| new current | `src/main/services/skillSelectionStore.ts` | 当前工作区 启用的 能力。 |
| new current | `src/main/services/knowledgeBaseStore.ts` | 工作区 已成型知识库、章节、标签和引用片段。 |
| new current | `src/main/services/promptPackService.ts` | 品牌 / 产品提示词包生成与读取。 |
| new current | `src/main/services/sceneLibraryStore.ts` | 产品场景卡生成、保存和复用。 |
| new current | `src/main/services/articleGenerationService.ts` | 文章大纲、正文和发布检查生成。 |
| new current | `src/main/services/generationLogStore.ts` | 文章 / 图片 / 视频生成日志。 |
| new current | `src/main/providers/mediaProvider.ts` | 图片 / 视频生成服务适配。 |
| new current | `src/main/providers/imageGenerationProvider.ts` | 图片协议生成服务，负责 Responses / Chat data URI / Gemini inlineData 和图片落盘。 |
| new current | `src/shared/imageTemplates.ts` | 图片模板参数共享事实源，Renderer 渲染表单，Main 生成服务 格式化中文模板参数。 |
| new current | `src/renderer/src/features/workbench/*` | v1 工作台 UI。 |
| new current | `src/renderer/src/features/skills/*` | skills 管理 UI。 |
| new current | `src/renderer/src/features/article-engine/*` | 文章生成 UI。 |
| new current | `src/renderer/src/features/knowledge-base/*` | 知识库 UI。 |
| new current | `src/renderer/src/features/prompt-workbench/*` | 提示词包与产品场景库 UI。 |
| new current | `src/renderer/src/features/asset-library/*` | 素材库与生成历史 UI。 |
| future | 策略分析、竞品 / 差评 / 店铺抓取、AI 自动搭建知识库、批量处理、定时任务、云端协作知识库、向量 向量检索、团队素材库 | v1 不实现。 |

事实源声明：v1 只向 `布谷AI Electron main services + renderer workbench` 收敛；不引入 Tauri、不 fork Craft、不新增独立后端服务。

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
3. 增加图片生成、视频生成、文章生成、知识库、素材库、生成历史入口。
4. 增加合规检测、内容助手、图片精修、创意视频、自定义视频占位入口。
5. 增加模型配置和 skills 管理入口。
6. 增加处理模式：单次处理可用，批量 / 定时 disabled。
7. 按截图改成暗色霓虹视觉。

验收：

- 不接真实模型也能静态展示 Image #1 / #3 / #4 / #5 的主要结构。
- 文章生成、知识库、素材库、生成历史入口清晰可见，P1 可先展示静态壳。
- 页面在 1440px 和 1920px 宽度下不破版。
- skills 管理入口清晰可见，但 P1 可先展示静态壳。

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
5. `获取模型` 先支持 生成服务 mock 或 endpoint metadata。

验收：

- 弹窗保存后右侧参数即时更新。
- Renderer 不可读取 API Key 明文。
- 配置错误有明确内联错误。

### P3：skills 管理

写集：

- `src/main/services/skillSelectionStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/features/skills/*`
- `src/renderer/src/features/workbench/Sidebar.tsx`

任务：

1. 复用 `SkillManager.scan()` 展示内置、工作区和兼容来源能力。
2. 复用 `SkillManager.installBuiltin()` 将内置 skills 安装到当前工作区。
3. 增加当前工作区 的启用列表，只存 `slug + source`，不复制 能力 内容。
4. 无效 能力 展示校验错误，不允许启用。
5. 在图片 / 视频生成请求中带上启用的 `selectedSkillSlugs`。
6. skills 管理页展示来源、路径、描述、frontmatter 和安装状态。

验收：

- 至少 4 个内置 skills 可见。
- 没有工作区 时，安装动作禁用且说明原因。
- 安装后重新扫描能看到工作区 skills。
- 启用列表刷新后不丢失。
- 生成请求能拿到当前启用的 能力。

### P4：知识库基础

写集：

- `src/main/services/knowledgeBaseStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/features/knowledge-base/*`

任务：

1. 在工作区下保存已成型知识库索引、章节、标签、摘要和引用片段。
2. 支持选择内置产品型知识库和个人 IP 型知识库。
3. 支持导入 DOCX、Markdown、纯文本、JSON 等已成型知识库文件。
4. 支持关键词、标签、知识库类型和章节类型检索。
5. 支持选择引用片段并发送到文章、图片提示词或视频脚本生成。
6. 记录引用片段的 `sourceId`、`sectionType`、`title`、`excerpt`，不做云端同步。

验收：

- 无 工作区 时显示明确空态。
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
5. 场景卡可以发送到文章生成、图片生成和视频生成。
6. 提示词包和场景卡写入素材库 / 生成历史，支持复用和追溯。

验收：

- 用户能从已选知识引用生成提示词包。
- 用户能从提示词包生成至少 3 张产品场景卡。
- 图片生成能读取场景卡和图片提示词片段。
- 视频生成能读取场景卡、图片素材建议和视频提示词片段。
- 生成日志记录知识引用、提示词包、场景卡、模型和 能力。

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
3. 使用 Claude SDK + `content-strategist` / `article-drafter` / `publish-checker` 生成大纲、正文和发布检查。
4. 导出 Markdown。
5. 将文章输出、知识引用、能力、模型和错误写入生成历史。

验收：

- 无知识引用时可以生成，但 UI 明确提示未使用知识库。
- 生成结果包含标题候选、大纲、Markdown 正文和发布检查。
- 生成历史可查看并复用本次参数。
- 导出路径通过 Electron dialog 或 工作区 相对路径处理，不硬编码平台路径。

### P6：图片生成单次生成

写集：

- `src/main/providers/mediaProvider.ts`
- `src/main/services/imageGenerationService.ts`
- `src/main/services/generationLogStore.ts`
- `src/renderer/src/features/image-engine/*`
- `src/shared/types.ts`

任务：

1. 产品图上传 0/10、参考图上传 0/6。
2. 读取提示词包和场景卡作为生成兜底，但前端提示词输入框初始为空。
3. 预设提示词 / 自由模式 / 智能生成 / 固定生成。
4. 模板 chip 列表。
5. 支持提示词中 `@图片文件名` 点名重点参考图，并把引用关系写入统一生成 payload。
6. 调用图片生成服务 或在 生成服务 缺失时返回结构化错误。
7. 结果预览、日志、导出。

验收：

- 单次生成链路能形成 request log。
- 成功或失败都有 UI 反馈。
- 导出按钮不会在无结果时可用。

### P6.5：上一代图片模板参数化收敛

写集：

- `src/shared/imageTemplates.ts`
- `src/renderer/src/app/constants.ts`
- `src/renderer/src/components/modules/ImageModule.tsx`
- `src/main/providers/imageGenerationProvider.ts`
- `src/shared/types.ts`
- `tests/functional/content-flow.test.mjs`

任务：

1. 把 9 个上一代图片模板沉淀为共享配置。
2. Renderer 根据共享配置展示模板参数卡。
3. 生成请求携带 `templateInputs`。
4. Main 生成服务 把模板参数格式化为中文字段，并注入图片生成 prompt。
5. 功能测试断言 Chat data URI 图片生成服务 收到包含「模板参数」的真实请求。

验收：

- 9 个模板字段与上一代调研结果对齐。
- 必填字段有提示，但不阻断纯提示词生成。
- 图片历史重试能复用 `templateInputs`。
- `npm run test:functional` 覆盖模板参数进入 生成服务 prompt。

当前状态：已完成本轮实现；`npm run typecheck` 和 `npm run test:functional` 通过。

### P6.6：批量模式受控 Shell

写集：

- `src/renderer/src/components/AppSidebar.tsx`
- `src/renderer/src/components/modules/ImageModule.tsx`
- `src/renderer/src/app/useContentStudioApp.ts`
- `src/renderer/src/styles/modules.css`
- `tests/e2e/electron-app.spec.mjs`

任务：

1. 侧栏批量模式可切换，但定时任务继续禁用。
2. 图片页显示任务统计、多线程和文件夹入口说明。
3. 批量模式下主按钮禁用，防止未接队列时伪造成功。
4. `generateImage` 对非单次模式做前端保护。
5. Playwright E2E 覆盖批量 Shell 可见和主按钮禁用。

验收：已完成；`npm run test:e2e` 通过。

### P6.7：内容助手与模板编辑受控入口

写集：

- `src/renderer/src/components/modules/AiAssistantModule.tsx`
- `src/renderer/src/components/modules/ImageModule.tsx`
- `src/renderer/src/components/ModuleOutlet.tsx`
- `src/renderer/src/app/constants.ts`
- `src/renderer/src/app/types.ts`
- `tests/e2e/electron-app.spec.mjs`

任务：

1. 内容助手从 disabled 入口变成可进入 Shell，展示 `/skill`、`/model`、`/help` 和端口 `19997` 边界。
2. 图片页补齐 `AI 创建`、`导入`、`导出 / 编辑` 操作条。
3. 模板编辑弹窗支持 JSON 直接编辑，并在本次会话内影响模板字段。
4. AI 创建技能和 AI 辅助修改只展示受控入口，不伪造 助手 生成结果。
5. E2E 覆盖 内容助手 Shell、AI 创建禁用态、模板编辑弹窗和 AI 辅助修改边界。

验收：已完成；`npm run test:e2e` 覆盖 内容助手 Shell、AI 创建禁用态、模板编辑弹窗和 AI 辅助修改边界。

### P7：视频拆解和脚本生成

写集：

- `src/main/services/videoAnalysisService.ts`
- `src/main/services/videoScriptService.ts`
- `src/renderer/src/features/video-engine/*`
- `resources/skills/video-breakdown/SKILL.md`
- `resources/skills/video-script-writer/SKILL.md`

任务：

1. 视频拆解页：本地视频上传 / 链接输入 / 拆解维度选择。
2. 使用 Claude SDK + 能力 生成拆解结果。
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
5. 生成服务 未接入时展示明确「视频模型未配置」错误。

验收：

- 视频生成页面可完整操作到生成队列。
- 不产生假成功视频。

### P9：入口占位与收口

写集：

- `src/renderer/src/features/sidebar/*`
- `src/renderer/src/features/placeholders/*`
- `README.md`

任务：

1. 合规检测、内容助手、图片精修、创意视频、自定义视频显示占位页。
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

### 3.5 能力Selection

```ts
export interface 能力Selection {
  工作区Path: string;
  enabled能力: Array<{
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
  工作区Path: string;
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
  工作区Path: string;
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
  工作区Path: string;
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

## 4. 能力 规划

现有 能力：

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

注意：用户 UI 不展示 能力 路径，显示为「预设提示词」「拆解维度」「生成方式」。

管理策略：

- `skills 管理` 是高级页面，可以展示 skills 名称、来源、路径和校验错误。
- 生成主链只展示业务化名称，不把 `能力路径` 放到普通用户流程里。
- v1 只做本地文件系统 能力，不接在线市场。
- 内置 skills 可以安装到工作区；工作区 skills 只扫描、启用、禁用，不主动覆盖。

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
- 图片生成 生成服务 mock smoke。
- 视频拆解文本 smoke。
- 导出路径 smoke。

## 6. 模型 运行底座 演进

当前迭代不引入 Pi。v1 先把模型能力拆成协议化 生成服务路由：

- Claude / Anthropic 官方链路继续走 `claude-sdk`，保留官方 SDK 的稳定兜底。
- Anthropic 兼容网关走 `anthropic-messages` HTTP 生成服务。
- OpenAI 兼容网关走 `openai-chat` / `openai-responses` 生成服务。
- Gemini 原生链路走 `gemini-generate-content` 生成服务。
- 图片生成独立于文字 会话运行底座，按 `openai-responses` / `openai-chat-data-uri` / `gemini-generate-content` 显式协议落盘，不再根据模型名猜协议。

本轮实施状态：

- [x] `TextGenerationService` 收敛为配置编排层，文字调用下沉到 `textGenerationProvider`。
- [x] `Media生成服务` 保留日志 / 视频职责，图片调用下沉到 `imageGenerationProvider`。
- [x] 模型设置 UI 支持文字协议和图片协议显式选择。
- [x] 功能测试覆盖 Anthropic Messages、OpenAI Chat、Gemini GenerateContent 文本 JSON，以及 Chat data URI / Gemini inlineData 图片落盘。
- [x] Pi 运行底座 只登记后续触发条件，当前不引入依赖、不迁移 会话模型。

Pi 作为后续 `会话运行底座` 预留，不进入当前第一刀：

- 触发条件：非 Claude 模型也需要完整会话、工具调用、权限、安全模式、MCP / 能力调度和会话恢复。
- 参考方向：借鉴 `craft-agents-oss` 的 `anthropic -> ClaudeAgent`、`pi / pi_compat -> PiAgent`、`customEndpoint.api -> openai-completions | anthropic-messages` 分流设计。
- 边界：Pi 解决多模型 会话运行底座，不替代布谷AI内容工厂自己的图片 / 视频素材 生成服务、素材落盘、日志和导出链路。

## 7. 风险

| 风险 | 应对 |
| --- | --- |
| 图片 / 视频生成服务 API 不稳定 | 通过 `mediaProvider` adapter 隔离。 |
| Claude SDK 被误用为万能 运行底座 | 模型设置必须显式选择协议；OpenAI / Gemini / 兼容网关走 生成服务路由，不硬塞 Claude SDK。 |
| UI 一次性复刻过多页面导致复杂 | 先做静态 shell，再接生成链路。 |
| skills 与预设提示词概念混淆 | UI 翻译成用户语言，内部保留 skills 管理。 |
| skills 管理误覆盖用户文件 | 只允许安装内置 skills 到工作区；覆盖动作如需保留，后续加确认与备份。 |
| 知识库范围膨胀成复杂 向量检索 平台 | v1 只消费已成型知识库，做本地索引、关键词检索和手动引用；策略分析、自动搭建、向量、网页抓取和云同步后置。 |
| 文章生成事实漂移 | 生成请求必须记录知识引用；未引用时 UI 明确提示。 |
| API Key 泄漏 | 继续只在 Electron main 保存，不经 Renderer 回传。 |
| 视频生成成本和时延高 | v1 先做队列和日志，不伪造成功。 |

## 8. 推荐下一刀

下一刀优先补齐合规检测 / 图片精修的受控入口和说明页，然后再评估真实队列与本地 会话运行底座。
- 2026-05-19 追加图片技能复刻矩阵：每个模板的参数、默认比例、默认张数和 system prompt 已同步到共享模板事实源。
