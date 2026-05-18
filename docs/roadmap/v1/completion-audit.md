# 内容工坊 v1 PRD 完成度审计

更新时间：2026-05-19
状态：Working Audit

## 1. 目标重述

本轮目标是对照 `docs/roadmap/v1`，把未开发或弱实现的 v1 功能继续补齐。v1 成功标准拆成以下可交付项：

1. 模型配置弹窗可编辑、保存、回填右侧全局参数，且 API Key 不暴露给 Renderer。
2. 图片引擎支持产品图 / 参考图、提示词、单次生成、明确结果态、本地产物入口。
3. 视频引擎支持拆解、脚本生成、字幕、语音、镜头数、时长和视频队列参数。
4. Skills 管理支持扫描、安装、启用 / 停用、详情查看、路径复制和错误展示。
5. 知识库支持内置 / 导入、检索、类型 / 章节筛选、详情、标签、章节引用。
6. 品牌提示词包和场景库能从引用派生，并被文章 / 图片 / 视频复用。
7. 文章生成支持类型、平台、目标读者、主题、语气、字数、自定义要求、发布检查和 Markdown 导出。
8. 素材库 / 历史支持按类型过滤，查看输入 / 输出 / 错误 / 引用 / Skills / 本地产物。
9. v1 不实现的入口必须 disabled 或明确“后续接入”。
10. 非功能要求至少覆盖：可追溯、安全、跨平台路径、明确 loading / disabled / failed 状态。

## 2. Prompt-to-Artifact 清单

| PRD / 计划项 | 明确要求 | 当前证据 | 状态 | 未覆盖 / 弱覆盖 |
| --- | --- | --- | --- | --- |
| FR-01 模型配置 | API endpoint、API Key、文字 / 图片 / 视频模型；保存后右侧参数读取；获取模型 | `src/main/services/modelConfigStore.ts`、`src/main/ipc.ts`、`src/preload/index.ts`、`src/renderer/src/components/SettingsDialog.tsx`、`src/renderer/src/components/SettingsDialogOutlet.tsx` | 本轮补强 | `getModelCatalog()` 仍是本地 catalog，不是远端 endpoint metadata |
| FR-02 图片输入 | 产品图 0-10、参考图 0-6、提示词、预设模式、模板 | `selectAssetFiles()`、`ImageGenerationRequest`、`ImageModule` 本轮新增提示词模式、生成模式、模板和水印选中态并写入 payload | 本轮补强 | 素材仍只保留本地路径引用，未复制到 workspace 素材库 |
| FR-03 图片生成与预览 | 单次生成、loading、成功 / 失败态、预览、导出、日志 | `src/main/providers/mediaProvider.ts`、`GenerationLogStore`、`ImageModule` 本轮新增 `assetRefs` 本地产物卡片、打开位置和导出副本 | v1 完成 | 真实图片 provider 属于后续接入；当前是 SVG 占位产物和 blocked 状态 |
| FR-04 视频拆解 | 本地视频 / 链接、16 维度、结构化结果 | `src/main/services/videoWorkflowService.ts`、`VideoModule` 维度选择 | 基本完成 | 尚未接入真实视频理解模型 |
| FR-05 视频脚本生成 | 产品名、场景、字幕、语音、镜头数、时长、比例、自定义要求 | `VideoScriptGenerationRequest`、`useContentStudioApp.ts`、`VideoModule` 本轮新增字幕 / 语音 / 镜头数 / 时长 UI 并写入请求 | 本轮补强 | 分镜图仍是文本 storyboard，不是真实图片 |
| FR-06 视频生成队列 | 素材、提示词、模型、比例、时长、历史 | `MediaProvider.generateVideo()`、`VideoModule` 本轮新增队列产物卡片、打开位置和导出副本 | v1 完成 | 真实视频 provider 属于后续接入，当前保持 blocked 队列文件 |
| FR-07 Skills 管理 | 扫描、安装、启停、无效错误、详情、复制路径、生成请求带 selectedSkillSlugs | `skillManager.ts`、`skillSelectionStore.ts`、`SkillsModule` 本轮新增详情面板、frontmatter 字段、复制路径 | 本轮补强 | 暂无内置编辑器，符合 v1 边界 |
| FR-08 文章生成 | 类型、平台、读者、主题、语气、字数、引用、素材、Skills、标题、大纲、正文、发布检查、导出 | `articleGenerationService.ts`、`ArticleModule.tsx`、`exportMarkdown()` | 基本完成 | 字数自定义数值和更多平台预设后置 |
| FR-09 知识库 | 内置 / 导入、章节结构、类型、标签、摘要、原文、关键词 / 标签 / 章节检索、引用 | `knowledgeBaseStore.ts`、`KnowledgeModule` 本轮新增知识库详情、标签、章节列表、引用本章节和 tag chip 筛选 | 本轮补强 | 原文全文仍以摘要截断展示，避免详情区过长 |
| FR-10 提示词包 / 场景库 | 从知识引用派生，可编辑，被文章 / 图片 / 视频复用，写入历史 | `promptPackService.ts`、`sceneLibraryStore.ts`、`KnowledgeModule` 编辑区、`useContentStudioApp.ts` 请求组装 | 基本完成 | 仅编辑品牌口吻、视觉风格、场景标题和素材建议；完整字段编辑 / 版本历史后置 |
| FR-11 素材库 / 历史 | 按类型过滤，查看输入 / 输出 / 错误 / 模型 / 参数 / 引用 / Skills，复制 / 打开本地产物 | `AssetsModule.tsx`、`GenerationLogStore`、`extractLocalRefsFromLog()`、`extractSkillSlugsFromLog()`；本轮新增耗时展示和“重试本次请求” | 本轮补强 | 旧历史缺少 `input` 时不能重试 |
| FR-12 入口占位 | 合规检测、AI 对话、图片精修、批量、定时、创意视频、自定义视频 disabled | `src/renderer/src/app/constants.ts`、`AppSidebar.tsx`、`ParamsPanel.tsx` | 基本完成 | 后续可增加占位详情页，但当前无假可用按钮 |
| P1 壳层拆分 | 三栏工作台、入口清晰、右侧参数一致 | `App.tsx`、`AppSidebar.tsx`、`ParamsPanel.tsx`、`ModuleOutlet.tsx`、`styles/*`、`npm run smoke:electron` | 已验证 | 多分辨率截图对比后置，不阻塞 v1 内部预览 |
| 非功能：安全 | API Key 只在 main process 保存 | `ModelConfigStore` 通过 `safeStorage` 保存，Renderer 只拿 `hasApiKey` | 基本完成 | 未做安全专项测试 |
| 非功能：稳定性 | 支持取消和错误重试 | `useContentStudioApp.runAction()` 本轮新增可取消运行上下文；`StageHeader` 新增取消按钮；文章 / 图片 / 视频 / 拆解 / 脚本 / 提示词包 / 场景卡会忽略取消后的迟到结果；历史支持重试 | 本轮补强 | 当前取消为 renderer 级取消，不会强杀已经进入 main process 的短任务 |
| 非功能：可追溯 | 输入、模型、参数、模式、耗时和错误 | `GenerationLogEntry.durationMs`、`GenerationLogStore`、文章 / 提示词包 / 场景卡 / 图片 / 视频 / 拆解 / 脚本生成均记录耗时 | 本轮补强 | 旧历史没有耗时字段，会显示未记录 |
| 验证命令 | 最小验证 `npm run typecheck` / `npm run build`；GUI smoke | 2026-05-19 本轮 `npm run build && npm run smoke:electron` 已通过；smoke 验证 preload bridge、内置 Skills、知识库 -> 提示词包 -> 场景卡 -> 文章 -> 图片 -> 视频拆解 -> 视频脚本 -> 视频队列 -> 历史；点击验证视频、文章、知识库、资产、Skills、设置和模型页 | 已验证 | 未做人工视觉截图评审 |

## 3. 本轮新增证据

- `App.tsx` 收敛为壳层，状态和副作用迁入 `src/renderer/src/app/useContentStudioApp.ts`，模块路由迁入 `src/renderer/src/components/ModuleOutlet.tsx`。
- 模型设置从静态展示改为真实 `modelDraft` 表单，可调用 `getModelCatalog()` 和 `saveModelConfig()`，保存后同步 `params.textModel / imageModel / videoModel`。
- 图片引擎的提示词模式、生成模式、图片模板和水印从静态 chip 改为真实状态，生成请求不再硬编码 `preset / smart / 电商场景图`。
- 图片和视频结果区新增 `assetRefs` 本地产物卡片，可从结果直接打开本地位置或导出副本。
- 视频脚本请求新增可编辑字幕模式、视频语音、镜头数、时长，视频队列时长也改为读取用户设置。
- 知识库列表新增选中态、详情区、标签展示、tag chip 筛选、章节结构和“引用本章节”。
- Skills 管理新增详情面板，展示来源、路径、有效性、启用态、`globs`、`alwaysAllow`、`requiredSources` 和校验错误，并支持复制路径。
- 历史日志新增 `durationMs`，主要生成主链都会记录耗时；历史页新增“重试本次请求”。
- 顶部流水线新增“取消当前任务”，主链生成动作接入可取消上下文，取消后不会把迟到结果写回当前 UI。
- 新增 `scripts/electron-smoke.mjs` 和 `npm run smoke:electron`，通过 Electron + CDP 验证主窗口、preload bridge、12 个内置 Skills、33 个 bridge 方法、完整核心生成链路，以及主要导航和设置弹窗点击流。
- 修复 `src/main/services/paths.ts` 的 resources 根路径解析；构建后的 Electron app 现在能正确找到 `resources/skills` 和 `resources/knowledge-bases`。
- 项目级 `AGENTS.md` 已按 Content Studio 当前架构更新模块拆分边界。

## 4. 完成判定

按 `docs/roadmap/v1/prd.md` 与 `implementation-plan.md` 的 v1 current 边界，本轮已达到内部预览完成标准：

1. v1 明确允许图片 / 视频 provider 未接入时返回结构化 blocked / 占位队列；当前已生成本地 SVG、JSON、Markdown 产物，并写入历史和 `artifactRefs`。
2. v1 不包含在线市场、真实视频模型、策略分析、竞品抓取、差评采集、AI 自动搭建知识库、云协作和向量 RAG。
3. `npm run smoke:electron` 已验证 Electron 主窗口、preload bridge、内置资源、核心生成链路、历史耗时和主要入口点击。
4. 剩余项均为后续增强：真实图片 provider、真实视频 provider、provider 级 AbortSignal、人工视觉截图评审和多分辨率视觉对比。

结论：v1 内部预览目标完成。

## 5. 后续增强建议

1. 若要对外体验，优先接真实图片 provider；视频 provider 可以继续保持 blocked 队列。
2. 若接真实 provider，再把 renderer 级取消升级为 main process / provider 级 AbortSignal。
3. 发布前可增加人工视觉截图评审和 1440 / 1920 多分辨率截图对比。
