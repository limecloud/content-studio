# 内容工坊 v1 PRD 完成度审计

更新时间：2026-05-19
状态：Working Audit

## 1. 目标重述

整体 PRD 目标是把 Content Studio 做成一个面向电商 / 个人 IP 的内容工程工作台，覆盖：

1. 模型配置与全局参数。
2. 已成型知识库接入、检索、引用选择。
3. 品牌 / 产品提示词包与产品场景库派生。
4. 文章生成、发布检查、Markdown 导出。
5. 图片引擎输入、提示词编辑、生成请求、错误态和历史。
6. 视频复刻三步流：参考视频拆解、新产品脚本生成、视频生成队列。
7. Skills 管理：扫描、安装、启用 / 停用、无效态。
8. 素材库 / 生成历史：按类型查看输入、输出、模型、参数、引用和错误。
9. v1 不做的能力有清晰 disabled / 后续接入状态。

## 2. Prompt-to-Artifact 清单

| PRD 项 | 明确要求 | 当前证据 | 状态 | 缺口 |
| --- | --- | --- | --- | --- |
| FR-01 模型配置 | API endpoint、API Key、文字 / 图片 / 视频模型；保存后右侧参数读取；Key 不暴露给 Renderer；支持获取模型 | `src/main/services/modelConfigStore.ts`、`ModelCatalogView`、`modelConfig:catalog` IPC、模型配置弹窗“获取模型”按钮 | 基本完成 | 当前模型列表为本地 mock catalog，后续可接 endpoint metadata |
| FR-02 图片引擎输入 | 产品图 0-10、参考图 0-6、提示词、模式、模板 | `selectAssetFiles()`、`ImageGenerationRequest.productImageRefs/referenceImageRefs`、图片页上传按钮和可编辑提示词 | 基本完成 | 素材只保留本地路径引用，未复制到 workspace 素材库 |
| FR-03 图片生成与预览 | 单次生成、loading、成功预览、导出、失败可重试 | `src/main/providers/mediaProvider.ts` 返回 `blocked`，同时写入 workspace `.content-studio/assets/images/*.svg` 本地占位预览；历史记录完整 payload 和 `artifactRefs`；UI 展示 blocked/error 并可打开本地位置 | 基本完成 | 真实图片 provider 和真实图片导出未接入；当前用本地 SVG 占位产物保证体验闭环 |
| FR-04 视频拆解 | 参考视频 / 链接、16 个拆解维度、结构化结果、可用于脚本 | `src/main/services/videoWorkflowService.ts`、`VideoBreakdownRequest/Result`、视频页维度选择和拆解按钮 | 基本完成 | 当前是文本结构化占位，未接入真实视频理解模型 |
| FR-05 视频脚本生成 | 新产品信息、场景、字幕、语音、自定义需求、比例、镜头、时长；输出镜头 / 口播 / 画面 / 字幕 / 节奏 | `VideoScriptGenerationRequest/Result`、`videoWorkflowService.generateScript()`、视频页脚本按钮 | 基本完成 | 字幕/语音模式 UI 还比较简化，尚未做完整下拉配置 |
| FR-06 视频生成队列 | 分镜图 / 图片 / 视频素材、视频提示词、模型 / 比例 / 时长、历史 | `generateVideo()`、`MediaProvider.generateVideo()` blocked 队列、本地 `.json` / `.md` 队列文件、生成日志 `artifactRefs` | 基本完成 | 真实视频 provider 和分镜图生成未接入；当前用本地队列文件保证请求可交接 |
| FR-07 Skills 管理 | 扫描、安装、启用 / 停用、无效错误、生成请求带 selectedSkillSlugs | `src/main/services/skillManager.ts`、`skillSelectionStore.ts`、Skills 页；文章 / 图片 / 视频 / 视频拆解 / 视频脚本请求均带 `selectedSkillSlugs` | 基本完成 | 后续可在历史详情中进一步突出展示 Skills 参与情况 |
| FR-08 文章生成 | 类型、主题、读者、平台、语气、字数、自定义、引用、素材、Skills、标题、大纲、正文、摘要、发布检查、导出 Markdown、历史 | `articleGenerationService.ts`、`ArticleGenerationResult.summary`、`exportMarkdown()`、文章页支持文章类型、平台、字数范围和核心字段编辑 | 基本完成 | 后续可补更多平台预设和字数自定义数值 |
| FR-09 知识库 | 内置样例、导入 DOCX/MD/TXT/JSON、章节 / 类型 / 标签 / 原文、关键词 / 标签 / 章节检索、引用进入生成 | `knowledgeBaseStore.ts`、`resources/knowledge-bases/*.json`、知识库页检索 / 选择引用，UI 支持知识库类型和章节类型筛选 | 基本完成 | 标签筛选仍可进一步细化为独立 tag chips |
| FR-10 提示词包 / 场景库 | 从知识引用生成提示词包和场景卡；被文章、图片、视频复用；可编辑后再生成 | `promptPackService.update()`、`SceneLibraryStore.update()`、`promptPacks:update` / `sceneCards:update` IPC、知识库页可编辑品牌口吻 / 视觉风格 / 场景卡素材建议 | 基本完成 | 后续可扩展到完整字段编辑和版本历史 |
| FR-11 素材库 / 历史 | 按类型过滤、查看输入 / 模型 / 参数 / 引用 / Skills / 输出摘要；失败也记录 | `generationLogStore.ts`、资产页 filter、details 展示 input/output/error，支持复制提示词 / 脚本 / Markdown、打开本地素材位置、高亮展示参与 Skills；Markdown 导出、图片 SVG 占位、视频队列文件都会写入 `artifactRefs` | 基本完成 | 后续真实媒体产物接入后需把真实图片 / 视频文件继续写入 artifactRefs |
| FR-12 入口占位 | 合规检测、AI 对话、图片精修、批量、定时、创意视频、自定义视频 disabled / 后续接入 | 左侧导航 disabled items、处理模式 disabled | 基本完成 | 按当前修改版视觉继续收口 |
| 非功能：安全 | API Key 只在 main process 保存 | `ModelConfigStore` / `SettingsStore` 使用 `safeStorage`，Renderer 只看 `hasApiKey` | 完成 | 无 |
| 非功能：可追溯 | 生成记录输入、模型、参数、错误 | `GenerationLogEntry.input/output/error/model/citations` | 基本完成 | 耗时字段未记录 |
| 非功能：跨平台 | 不硬编码用户目录；导出用 Electron dialog | `dialog.showOpenDialog/showSaveDialog`、workspace 相对 `.content-studio` | 基本完成 | 个别 UI 文案展示路径用 `/` 分割，Windows 展示可再优化 |

## 3. 本轮已补的缺口

- 增加 `getModelCatalog()`，模型配置弹窗可通过“获取模型”填充本地 mock catalog。
- 增加知识库类型 / 章节类型筛选，检索可按产品型、个人 IP 型和重点章节收敛。
- 增加文章类型、平台和字数范围选择，文章生成不再固定为公众号长文 / medium。
- 增加提示词包和场景卡持久化编辑，保存后后续文章 / 图片 / 视频复用编辑结果。
- 增加 `selectAssetFiles()`，图片和视频素材可通过 Electron dialog 选择本地文件。
- 增加 `exportMarkdown()`，文章草稿可通过保存对话框导出 Markdown。
- 增加 `VideoWorkflowService`，支持视频拆解和视频脚本生成的结构化文本结果。
- 增加本地媒体占位产物：图片请求会生成 SVG 预览，视频请求会生成 JSON / Markdown 队列文件，并统一写入历史 `artifactRefs`。
- 扩展 `GenerationKind`，视频拆解和视频脚本会独立写入历史。
- 扩展资产页，支持按类型过滤、查看输入 / 输出 / 错误摘要、复制提示词 / 脚本 / Markdown、打开本地素材位置、高亮参与 Skills，并把 Markdown 导出路径回写到历史 `artifactRefs`。
- 扩展导航占位，明确合规检测、AI 对话、图片精修、创意视频、自定义视频为「后续接入」。

## 4. 当前不能宣称整体完成的原因

- 真实图片 provider、真实视频 provider、真实视频理解模型还未接入；PRD 允许 v1 先 blocked / 占位，但“完整产品目标”还未达到。
- 真实 GUI 交互已完成 dev server / Electron 进程存在性验证和 Vite 模块热更新检查；Playwright MCP 当前被既有浏览器会话占用，尚未完成点击级冒烟。

## 5. 下一刀建议

1. 做点击级 GUI smoke：启动本地 app，走一遍选择 workspace、安装知识库、生成提示词包、生成场景、文章导出、视频拆解和脚本生成。
2. 接入真实媒体产物后，把图片 / 视频文件路径继续沉淀到历史 `artifactRefs`。
3. 如果要对外体验，优先接入真实图片 provider；视频 provider 可以继续保持 blocked 队列。
