# Release Notes

## v0.3 - 2026-05-19

### 版本定位

内容工坊 v0.3 是 v1 内部预览收口版本，目标是把 `docs/roadmap/v1` 中的未完善功能补到可验证、可追溯、可发布的 Electron 桌面工作流。

本版仍遵守 v1 current 边界：真实图片 / 视频 provider 后续接入；当前通过本地 SVG、JSON、Markdown 队列文件和 blocked 状态保证链路可用但不伪造成功。

### 新增能力

- 进一步拆分 Renderer 架构：`App.tsx` 收敛为应用壳层，复杂状态和副作用迁入 `useContentStudioApp`，模块路由迁入 `ModuleOutlet`。
- 模型设置从静态展示改为真实配置表单，支持 API endpoint、API Key、文字模型、图片模型候选和视频模型的保存 / 回填。
- 图片引擎补齐真实输入状态：提示词模式、生成模式、图片模板和水印都会写入生成 payload。
- 视频脚本生成补齐字幕模式、视频语音、镜头数和时长配置，并传入视频脚本 / 视频队列请求。
- 知识库补齐详情视图：知识库选中态、标签、tag chip 筛选、章节结构和“引用本章节”。
- Skills 管理补齐详情视图：路径、来源、有效性、启用态、`globs`、`alwaysAllow`、`requiredSources`、校验错误和复制路径。
- 生成历史补齐耗时、重试和本地产物操作；图片 / 视频结果支持打开位置和导出副本。
- 顶部流水线新增 renderer 级取消能力，取消后会忽略迟到结果，避免污染当前 UI。

### 工程与验证

- 新增 `scripts/electron-smoke.mjs` 和 `npm run smoke:electron`，用 Electron + CDP 验证主窗口、preload bridge、内置 Skills、完整核心生成链路和主要导航点击流。
- 修复构建后 resources 根路径解析，确保 built app 能找到内置 Skills 与知识库。
- 新增 `GenerationLogEntry.durationMs`，文章、提示词包、场景卡、图片、视频、视频拆解和视频脚本都会记录耗时。
- 更新 `AGENTS.md`，沉淀 Content Studio 项目级 Agent 协作规则与验证入口。
- 将应用包版本提升到 `0.3.0`，本次 Git tag 按用户指定发布为 `v0.3`。

### 验证

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run smoke:electron` 通过，关键结果：`hasBridge: true`、`bridgeMethodCount: 33`、`builtinSkillsCount: 12`、`logCount: 7`、`logsWithDuration: 7`、点击流 `failed: []`。

### 明确不包含

- 不接入真实图片模型、视频模型或视频理解模型；provider 仍以后续接入为主。
- 不做策略分析、竞品抓取、差评采集、AI 自动搭建知识库、云协作、计费、多租户或向量 RAG。
- 当前取消能力是 renderer 级“忽略迟到结果”，不是 provider 级 AbortSignal 强取消。

## v0.2.0 - 2026-05-19

### 版本定位

内容工坊 v0.2.0 是 PRD 主链补齐版本，目标是把 v0.1.0 的初始化骨架推进到可演示、可追溯、可打包的本地桌面工作流。

核心主链保持不变：

```text
已成型知识库 -> 品牌 / 产品提示词包 -> 产品场景库 -> 文章 / 图片提示词 / 视频脚本 -> 本地素材占位 / 队列文件 -> 生成历史
```

### 新增能力

- 新增视频复刻三步流：参考视频 / 链接拆解、16 个维度选择、新产品视频脚本生成、视频生成队列。
- 新增文章生成增强：支持文章类型、平台、目标读者、主题、口吻、字数范围和自定义要求，并支持 Markdown 导出。
- 新增知识库筛选：支持产品型 / 个人 IP 型知识库筛选，以及产品、卖点、场景脚本、合规、人物档案、方法论、写作风格、边界等章节筛选。
- 新增提示词包和场景卡编辑：品牌口吻、视觉风格、场景标题、图片素材建议和视频素材建议可保存后继续复用。
- 新增素材选择与历史闭环：图片页支持产品图 / 参考图选择，视频页支持本地参考视频，生成历史可按类型过滤、复制提示词 / 脚本 / Markdown、打开本地素材位置。
- 新增本地媒体占位产物：图片请求会写入 workspace `.content-studio/assets/images/*.svg` 占位预览；视频请求会写入 `.json` / `.md` 队列文件，避免在真实 provider 未接入时伪造成功。
- 新增模型目录入口：模型配置弹窗可获取本地 mock catalog，方便后续替换为 endpoint metadata。
- 新增 macOS App Icon：生成布谷鸟主题图标并接入 `electron-builder` 的 macOS 打包配置。

### 发布资产

- GitHub Release 附带 macOS DMG / ZIP、Windows NSIS、Linux AppImage 和自动更新 metadata。
- 同步上传 `build/icon.png` 和 `build/icon.icns`，便于 Release 页面和下游渠道复用品牌 Logo。

### 工程更新

- 扩展类型化 IPC 与 preload bridge，覆盖视频拆解、视频脚本、素材选择、文件定位、Markdown 导出、提示词包 / 场景卡更新和模型目录。
- 扩展 `GenerationLogEntry.artifactRefs`，文章导出、本地图片 SVG 占位和视频队列文件都能回写到生成历史。
- 新增 `VideoWorkflowService`，把爆款视频拆解和分镜脚本生成沉淀为独立历史类型。
- 新增 `getWorkspaceAssetDir()`，统一 workspace 内素材产物落点，避免硬编码用户目录。
- macOS 本地预览包默认跳过签名，避免本机重复 Developer ID 证书导致 `codesign` 歧义；正式签名后续通过证书配置单独接入。
- 将应用版本提升到 `0.2.0`，同步 `package.json` 与 `package-lock.json`。

### macOS 首次打开

当前 macOS 包是 unsigned 内部预览包，可能出现「`Content Studio` 已损坏，无法打开」提示。确认安装包来自本仓库 Release 后，可执行：

```bash
xattr -dr com.apple.quarantine "/Applications/Content Studio.app"
```

然后重新打开应用；如仍被拦截，右键点击 `Content Studio.app` 并选择「打开」。

### 明确不包含

- 不接入真实图片模型、视频模型或视频理解模型；v0.2.0 用本地占位产物和 blocked 状态保证体验闭环。
- 不做竞品抓取、差评采集、店铺诊断、策略报告生成。
- 不做 AI 自动搭建知识库；仍消费已经成型的产品型 / 个人 IP 型知识库。
- 不做云端协作、团队权限、计费、多租户和复杂向量 RAG。

### 验证

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run dist:mac` 通过，生成 unsigned 内部预览 DMG / ZIP。

## v0.1.0 - 2026-05-18

### 版本定位

内容工坊 v0.1.0 是第一版 Electron 桌面初始化版本，目标是把项目从通用 Claude Agent / Skills 骨架收敛成面向电商内容工程化的工作台。

核心主链：

```text
已成型知识库 -> 品牌 / 产品提示词包 -> 产品场景库 -> 文案 / 脚本 / 图片提示词 -> 图片素材 -> 视频生成队列 -> 生成历史
```

### 新增能力

- 新增深色三栏桌面工作台：左侧能力导航、中间内容生产区、右侧全局参数舱。
- 新增模型配置：统一 API endpoint、API Key、文字模型、图片模型、视频模型。
- 新增 Skills 管理：扫描内置 / workspace / 用户级 Skills，支持安装内置 Skill 到 workspace，支持启用 / 停用。
- 新增已成型知识库模块：支持内置样例、workspace 安装、DOCX / Markdown / TXT / JSON 导入、关键词检索和引用选择。
- 新增脱敏内置知识库样例：产品型知识库和个人 IP 型知识库。
- 新增品牌 / 产品提示词包生成：基于知识引用生成品牌口吻、视觉风格、卖点规则、合规边界和平台约束。
- 新增产品场景库生成：基于提示词包生成目标人群、痛点、场景、画面构图、口播方向和素材建议。
- 新增文章生成初始化链路：本地生成标题候选、大纲、Markdown 草稿和发布检查，并记录生成日志。
- 新增图片 / 视频 provider adapter：在真实媒体模型未接入时返回 blocked 状态，避免伪造成功素材，同时保留完整生成请求日志。
- 新增生成历史 / 素材库最小闭环：记录提示词包、场景卡、文章、图片请求和视频队列请求。

### 新增内置 Skills

- `prompt-pack-builder`：提示词包构建师。
- `scene-library-builder`：场景库构建师。
- `ecommerce-image-prompt`：电商图片提示词师。
- `video-breakdown`：爆款视频拆解师。
- `video-script-writer`：视频脚本生成师。
- `compliance-reviewer`：合规审核员。
- `brand-voice-keeper`：品牌口吻守门员。
- `knowledge-citation-picker`：知识引用选择器。

### 工程更新

- 补齐类型化 IPC 与 preload bridge，使 `ContentStudioApi` 覆盖 v1 主链。
- 新增 main process 本地 JSON stores：模型配置、Skill 选择、知识库、提示词包、场景卡、生成日志。
- 新增 DOCX 文本提取基础能力，依赖 `yauzl` 与 `fast-xml-parser`。
- 保持官方 `@anthropic-ai/claude-agent-sdk` 作为文本编排底座，媒体生成走独立 provider adapter。
- 不 fork Craft，不迁移 Craft 的远程 server、MCP、多会话 inbox 或通用聊天复杂度；只参考 workspace / Skills / typed bridge 的架构思路。

### 明确不包含

- 不做竞品抓取、差评采集、店铺诊断、策略报告生成。
- 不做 AI 自动搭建知识库；v0.1.0 只消费已经成型的知识库。
- 不接入真实图片 / 视频模型网关；图片和视频生成请求会记录为 blocked。
- 不做云端协作、团队权限、计费、多租户和复杂向量 RAG。

### 验证

- `npm run typecheck` 通过。
- `npm run build` 通过。
