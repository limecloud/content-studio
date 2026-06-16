# Release Notes

## v0.24.0 - 2026-06-16

### Platform Host WebSearch 主链修复

- Content Studio 平台宿主 runtime live check 默认覆盖实时新闻类请求，并断言 WebSearch 工具事件实际出现，避免只看最终文本导致假通过。
- Agents 通过 Lime App Server runtime 发起 required WebSearch 时，App Server turn context 会携带 WebSearch 权限标记，工具权限不再因缺少 turn metadata 被阻断。
- Platform Host adapter 保留并清洗 Product App 传入的 `runtimeOptions.hostOptions`，确保 `asterChatRequest.search_mode=required` 能传入 App Server，同时阻断 API Key、token、secret 等敏感字段回流。

### Desktop Platform npm 包发布

- 发布并接入 `@limecloud/desktop-platform-contracts@0.2.2`，补齐 runtime hostOptions 公开契约。
- 发布并接入 `@limecloud/desktop-platform-electron-adapter@0.2.6`，生产构建不再依赖本地 diagnostic override。
- Content Studio 依赖锁定到新的 Desktop Platform adapter 版本，平台宿主下的实时新闻用例可通过正式 npm 包复现。

### 发版回归修复

- Functional test bundler 在 CI 没有本地 Lime agent package `dist/` 时回退 npm 包，避免 release workflow 因本地 alias 缺失失败。
- Agents blocked 会话会净化联网搜索预调用失败、内部 Prompt 回显和未返回交付物错误，不再把 system / skill / 输入源上下文展示到对话正文或运行错误事实中。
- 平台模型设置页在平台图片 Provider 暂无可用模型列表时保留 Product App 本地图片模型快照，避免只读公共 Provider 设置页丢失已保存图片模型显示。

### 验证

- `npm run verify:local`
- `npm run app-server:runtime:live -- --data-dir "<provider-store-data-dir>" --provider "<providerId>" --model "gemini-2.5-flash" --prompt "整理一下今天的国际新闻"`
- `node scripts/run-functional-tests.mjs --test-name-pattern "今天的国际新闻"`
- `node scripts/run-functional-tests.mjs --test-name-pattern "平台宿主下 Prompt Agent 会为实时新闻类请求强制打开 WebSearch"`

## v0.23.0 - 2026-06-14

### Lime Agent Runtime 标准包发布

- Agents 工作台接入 npmjs 发布的 `@limecloud/agent-runtime-projection@0.1.1` 和 `@limecloud/agent-runtime-ui@0.1.1`，生产构建不再依赖本地 workspace alias。
- 新增 Agent runtime npm 发布门禁，校验 runtime UI / projection 包来源、版本和依赖关系，确保发布包可从 npmjs 解析。
- 补齐本地 Lime runtime tarball 与 production package gate，避免开发态 alias 泄漏到正式桌面包。

### AgentUI Facts 与运行能力投影

- Agents UI 继续对齐 Lime 标准表面，把 tools、MCP、skills、subagents、artifact、evidence 和 human-in-the-loop action 投影到专用 runtime facts 区域。
- 运行详情和对话消息进一步分离，普通 assistant 正文只承载对话内容，工具结果、审批、证据和交付物不再重复输出进消息气泡。
- 补齐运行事实引用列表、artifact / evidence 展示和 blocked 恢复路径，保持 Content Studio 业务对象与 Lime runtime facts 一致。

### Gemini Provider 与 App Server 主链

- 修复 Content Studio 通过平台 provider store 使用 Gemini 模型时的模型列表、默认模型和真实调用链路，保持 key 只存在于 Lime App Server provider store。
- Agents 第二轮普通对话继续走 `continueConversation`，不会因为无 Prompt 草稿误报 `AI Agent 对话未启动`。
- 发布门禁覆盖 `Content Studio agents -> LIME_RUNTIME_BRIDGE -> lime.agent -> app-server --backend runtime --data-dir -> provider store -> LLM -> events/artifacts` 主链，不恢复第二套 runtime adapter。

### 验证

- `npm run verify:local`
- `npm run assert:agent-runtime-packages`
- `npm run assert:local-lime-agent-runtime-tarballs`
- `npm run verify:lime-agent`
- `CONTENT_STUDIO_E2E_LIVE_GEMINI=1 npm run test:e2e -- --grep "embedded 平台宿主真实调用 Gemini"`

## v0.22.0 - 2026-06-12

### Lime App Server 与 Desktop Platform 一体化

- Electron 启动链路内置启动 Lime App Server sidecar，并通过 `lime-desktop-platform` 统一读取 provider store、模型选择和平台 Host 状态，不再把模型密钥同步到 Content Studio 本地配置。
- App Server / Platform Host runtime live check、release resource gate 和边界审计继续收敛，阻断旧 sidecar、旧 runtime adapter、renderer 直连 JSON-RPC 或 API Key 回流。
- 模型设置入口恢复为平台公共 Provider 设置页投影，模型下拉、默认模型和待配置状态统一从平台设置事实源读取。

### Codex 式 Agents 对话工作台

- `agents` 工作台收敛为 Codex 式单列对话体验：启动后不自动折叠应用侧栏，右侧运行详情作为整体抽屉呈现，普通寒暄不再伪造成 Prompt 草稿。
- Agent 对话支持真实流式输出和平台会话事实投影，消息正文只展示用户 / 助手对话；Prompt 交付物只在真实 artifact / PromptDraft 存在时展示。
- 工具、Web Search、MCP 和 Skill 运行事实从 `executionEvents` 投影为对话内折叠块，同时完整保留在运行详情中，不把工具日志、证据或审批状态塞进普通助手正文。

### 内容主链与验证覆盖

- 品牌 / IP 知识库、内容知识地图、文章 / 图片 / 视频主链继续使用平台文字 capability 和真实 blocked 分支；未配置真实生成服务时不伪造成果。
- E2E 覆盖 Agent 入口、真实图片输入源、寒暄对话、运行事实投影、Human-in-the-loop action、模型设置页和主业务链路。
- 发布门禁补齐 Lime Agent 边界审计、平台 runtime live check、App Server resource 检查和全量 Playwright E2E。

### 验证

- `npm run verify:local`

## v0.21.0 - 2026-06-11

### Lime Desktop Platform Runtime 接入

- `AI agents` 工作台 Prompt Agent 主链接入 `lime-desktop-platform` runtime bridge，平台宿主下优先通过 `lime.agent` capability 调用 App Server runtime，不再读取或传递 Content Studio 本地模型 API Key。
- 新增 `PlatformHostBridgeClient`、平台设置投影和模型设置迁移链路；旧本地文字 / 图片 / 视频 Provider 配置只作为一次性迁移 source，迁移成功后清除本地 key，平台宿主失败时 fail closed。
- App Server runtime sidecar 增加 `--data-dir`、provider store 预检和敏感环境变量清理，Prompt Agent 只提交 provider / model preference，由 App Server provider store 解析凭证。

### Agents 工作台与 AgentUI Facts

- 新增 `agents` 工作台界面，围绕新对话、项目、历史对话、素材输入、模型选择和运行事实组织协作，不再把 Agent 能力散落到普通模块说明区。
- Agent runtime events 接入共享 `@limecloud/agent-runtime-ui` / projection：工具结果、证据、Human-in-the-loop action、artifact 和 runtime status 进入专用事实面板，不再塞进普通助手正文。
- 修正平台 runtime event 映射顺序，`tool.failed` 保持 Tool UI fact，不再被误归类为 `model.failed`；人工动作可写回并跳转到模型设置或输入源补齐路径。
- AI 生图和 AI 视频模块不再触发应用侧栏整体自动折叠；窄屏仍按响应式规则收起，一级导航分组继续由当前模块和用户操作控制。

### 平台设置、导航与发布门禁

- 设置入口迁移到 `@limecloud/desktop-platform-react` 公共设置页，模型配置、账号入口、外观字号和平台 Host 状态统一从平台投影消费。
- App Server release resources 准备脚本支持 `app-resource://` artifact，并对同平台 sidecar 执行 runtime provider store gate，阻断不支持 `--data-dir` / `modelProvider/list` 的旧 binary 进入发布资源。
- 新增 `npm run verify:lime-agent`、`npm run app-server:runtime:live`、`npm run platform-host:runtime:live`，并把 Prompt Agent key/env 回流、公开平台模型保存入口和第二套 runtime / SDK 回流检查串入 `verify:local`。

### 验证

- `npm run verify:local`
- `npm run app-server:runtime:live` / `npm run platform-host:runtime:live` 作为真实 Provider / 平台宿主 live gate；无真实 runtime bridge、provider store 或显式 provider/model preference 时必须 fail closed。

## v0.20.0 - 2026-06-08

### Lime App Server 生成能力收敛

- `TextGenerationService`、图片生成和视频生成主链接入 `AppServerSidecarService`，统一通过 Lime App Server capability turn 承载文字、JSON、图片和视频生成事实。
- `resources/app-server/backend/content-backend.mjs` 扩展 `content.text.generate`、`content.image.generate`、`content.video.generate` 能力；未配置真实图片或视频生成服务时只返回 blocked / 队列 artifact，不生成占位素材或伪造成果。
- App Server runtime events 继续投影 artifact、evidence、tool 和 action 事实，Prompt Agent 会话保留可恢复的人审动作与证据引用。

### Agent 工作台与内容生产体验

- Agent 会话面板接入 `@limecloud/agent-runtime-ui`，区分对话流、运行事实、产物、证据和待处理动作，并新增 Claw 工作台布局变体。
- AI 生图、AI 视频和文章模块补齐 Agent 协作入口，提示词助手可携带当前功能、素材、参数和历史结果继续协作，不再只依赖本地假说明。
- 图片 / 视频工作台的右侧事实面板、历史、素材引用和 blocked 恢复路径进一步统一，普通用户可以从当前业务对象直接看到缺什么、下一步做什么和交付物在哪里。

### 自动更新、打包与发版流程

- 新增 Electron Forge 打包配置与脚本，保留 electron-builder 分发链路，并补充自动更新服务对 R2 latest feed、下载进度、安装动作和功能测试替身的支持。
- `electron-builder.yml` 显式声明 generic publish feed，自动更新和 OEM 分发使用同一下载根路径。
- 新增 `content-studio-release-workflow` 仓库 skill，区分通用版本发布与 bugu / seenx OEM 分发，避免把版本号 / release note / tag 流程和 R2 latest 推送混在一起。

### 验证

- `npm run verify:local`
- `npm run app-server:backend:test`
- `npm run smoke:app-server`
- `npm run dist:mac` 已本地产出 `release/布谷AI-0.20.0-arm64-mac.zip` 和 blockmap；DMG 子步骤受 `dmg-builder` 下载链路阻塞，完整 DMG 产物交由 GitHub Release workflow 构建验证。

## v0.19.0 - 2026-06-06

### Lime App Server Agent Runtime

- Agent runtime 主线全面收敛到 `Frontend -> Electron Desktop Host IPC -> Lime App Server JSON-RPC -> RuntimeCore / backend`，Renderer 只消费 runtime facts 投影。
- 新增 `AppServerSidecarService` 和 `AppServerPromptAgentService`，`agent:run`、Prompt 工作台会话、artifact 和 evidence 均通过随包 App Server sidecar 进入 RuntimeCore / packaged external backend。
- 删除旧本地 Agent SDK runtime 服务文件和依赖，禁止恢复第二套 runtime adapter 或旧 runtime fallback。
- `resources/app-server` 新增 packaged external backend、smoke、backend test、release manifest 准备脚本和 live gate；未配置真实 provider key 时明确失败，不伪造成功。

### 打包与 GitHub Actions

- `electron-builder.yml` 和 OEM builder 均把 `resources/app-server` 打包到 `process.resourcesPath/app-server`。
- Release GitHub Actions 会准备 App Server sidecar 资源；若未配置独立 release manifest，会从 `limecloud/lime` 指定 tag 构建 `app-server` sidecar 并生成随包 manifest。
- CI / release verify 新增 App Server resource/backend tests；OEM 产物检查强制验证 sidecar binary、release manifest 和 packaged backend。
- macOS DMG / zip 分发包已验证包含 App Server sidecar，且只读挂载 DMG 后可通过 `smoke:app-server` 产出 runtime events、artifact 和 evidence。

### 内容生产主链

- AI 生图 SOP 生产线新增素材生产任务、镜头 Prompt、测试图确认、批量生成、审核入库和素材库追溯。
- 图片生成请求注入产品一致性规则和负面约束，后台生成日志与镜头状态同步推进。
- 素材审核记录补充生产任务和镜头引用，素材库能回到 SOP 生产任务、镜头和运行记录。

### 验证

- `npm run verify:local`
- `npm run app-server:backend:test`
- `npm run smoke:app-server`
- `npm run dist:mac`
- `APP_SERVER_RESOURCES_DIR="release/mac-arm64/布谷AI.app/Contents/Resources/app-server" npm run smoke:app-server`
- `hdiutil verify release/布谷AI-0.19.0-arm64.dmg`

## v0.18.0 - 2026-06-04

### 爆款视频拆解与内容生产迁移

- 完整迁移 `video-script-ai` 的爆款视频拆解、爆款特征库、脚本改写、脚本质检、单镜头重写、脚本历史和 Prompt 交接主链。
- 新增视频理解 Provider 链路，支持真实 Generic HTTP 视频拆解；未配置真实能力时保持 blocked / failed，不伪造拆解或脚本成果。
- 爆款特征库从本地成功拆解日志派生，支持搜索、筛选、精选、归档、恢复、完整拆解详情和脚本模板复用。
- 视频脚本生成严格校验模型返回字段，缺少画面、口播、字幕、节奏、镜头类型或图 / 视频 Prompt 时不写入不完整脚本。
- Prompt 交接收敛为第三方平台复制 Prompt 与成品手动导入；内部视频生成只作为已配置 Provider 时的独立可选入口。

### 内容工厂工作台与设计语言

- 新增内容工厂桌面端统一设计语言 skill，沉淀左侧参数、中间业务对象、右侧证据 / 历史的高密度工作台规范。
- 新增内容制造批次、数据接入成熟度、产品规划和 Ontology v2 相关事实源，继续把普通用户主链收敛到可追溯的本地工作区对象。
- 更新 v2 路线图、验收、原型和迁移审计文档，明确客户端不迁移 Auth / Supabase / Seedance 在线任务系统。

### 验证

- `npm run typecheck`
- `npm run build`
- `npm run test:functional -- --test-name-pattern "视频脚本支持 AI 质检|视频脚本生成会按已拆解镜头时间轴严格映射"`
- `npm run test:e2e -- --grep "爆款视频拆解 UI 成功链路|爆款视频拆解五阶段工作台|爆款特征库展示完整拆解详情|视频脚本历史可保存反馈"`
- 发布前执行 `npm run verify:local`

## v0.17.0 - 2026-06-01

### Ontology v2 原型与数据接入

- 新增 Ontology v2 电商短视频内容制造流水线原型，围绕批次、数据入口、阶段 SOP、规则门禁、Agent 执行、审核、调优和复盘闭环组织。
- 新增数据接入工作台 PRD、服务端控制台原型、Mock API 和 v2 数据模型草案，明确 L0 / L1 / L2 渐进接入、字段映射、缺口任务和数据质量因果链。
- 补齐现有客户端能力迁移评估，明确 v2 数据基座、流水线和服务端接入引擎边界。

### 内容知识地图与团队事实源

- 内容知识地图构建纳入素材审核记录和输入源共享范围摘要，包含仅本机资料时阻断团队同步、变更包和团队知识包发布。
- Bugu 团队同步适配器补齐内容知识地图、构建运行和品牌战情室 current 事实源读写，不再只依赖 release、执行队列或行动记录旁路。
- 团队刷新失败时保留本机缓存；本机已同步且更新时间更新时保留本机完整作战结构，避免旧团队快照覆盖本机复盘结果。

### 品牌战情室、审核与交付闭环

- 品牌战情室补齐目标确认、作战单元保存、执行队列同步、行动复盘、行动记录导出和团队审计记录。
- 生产动作会绑定当前内容地图的已发布团队知识包版本，Prompt 草稿、场景卡、SOP 运行和行动记录保留同一版本依据，避免跨地图错绑。
- 补素材动作生成可交付清单文件，行动记录写入脱敏 artifact 引用，并同步到 Bugu 团队事实源。

### 验证

- `npm run verify:local`

## v0.16.0 - 2026-05-30

### 内容知识地图 v1 深化

- 新增内容知识地图构建 run 记录，生成、刷新和失败状态可追溯到输入、产物引用和错误原因。
- 内容地图生成补齐用户意图、证据、素材状态、场景、卖点和 IP 口径结构化输出，团队知识包同步时保留核心不变量。
- v1 readiness gate 增加真实线上验收报告边界提示，明确本地 readiness 与生产验收证据的区别。

### 审核、补素材与生产交付

- 内容地图行支持直接生成 Prompt 草稿、生成场景卡和启动 SOP，并在刷新后稳定定位到新建产物。
- 新增补素材任务入口和策略，缺素材条目可生成 `needs-material` 审核任务，保留建议动作和恢复路径。
- 审核任务、Prompt 草稿、场景卡、SOP run 与素材回写的引用关系进一步收敛，避免交付链路断在只读记录。

### 品牌战情室与团队同步

- 品牌战情室行动执行前补齐证据、审核状态、资源完整度和渠道风险门禁。
- 团队工作区同步覆盖内容知识地图、审核任务、战情室、草稿、场景、工作流和生成日志等记录。
- 本地 JSON store 改为更稳健的原子写入路径，降低异常退出导致工作区记录损坏的风险。

### 验证

- `npm run verify:local`

## v0.15.0 - 2026-05-29

### 内容知识地图 v1

- 新增内容知识地图工作台，围绕输入源、品牌知识库、IP 知识库、场景卡和提示词草稿生成可审核的内容矩阵。
- 支持团队知识包导出、团队变更包创建 / 导入 / 提交、同步冲突处理和素材覆盖回写，形成本地到团队工作区的可追溯协作链路。
- 新增 Agent Knowledge v0.7.2 ontology-aware 知识包导出，保留内容主张、证据、覆盖状态和来源追溯。

### 审核任务与生产交付

- 新增内容审核任务台，可从内容知识地图生成审核任务，记录通过、驳回、补素材和补证据等人工决策。
- 审核通过后支持交付到 Prompt 工作台、场景库和 SOP 运行，避免审核结论停留在只读记录。
- 成功素材与审核反馈可回写内容矩阵，标记已覆盖、待补充和需要复核的组合。

### 品牌战情室

- 新增品牌战情室，按信号、目标、资源包、行动队列和行动记录组织内容生产动作。
- 支持基于内容知识地图生成行动建议，执行前校验证据、审核状态、资源完整度和渠道风险。
- 行动记录可同步到团队工作区，作为后续复盘和内容矩阵更新的事实来源。

### Agent-first 工作台

- 普通用户模块统一接入 `AgentSessionPanel`，UI 只投影真实消息、执行事件、权限动作、证据、产物和任务状态。
- Prompt Agent 执行层改为协议中立服务；Claude 官方链路继续走 Claude Agent SDK，OpenAI / Gemini / Anthropic 兼容协议走显式文字生成路由。
- Human-in-the-loop 支持缺资料、补输入源、打开模型设置和恢复 blocked 会话等可交互动线，不再用模块内硬编码助手气泡模拟执行过程。

### OEM 发布链路

- 新增 `Publish OEM Distribution` workflow 和 R2 分发脚本，GitHub Release 产物可一键同步到 bugu / seenx 控制面 latest、R2 分平台 latest 和全局 download-manifest。
- 新增线上分发校验脚本，覆盖 GitHub Release 资产、控制面 latest、R2 latest、公开 download-manifest 和下载链接。
- 仓库内补齐 OEM 发布 Agent 流程文档和 skill，发布前后按 dry run、真实写入和线上验证分阶段执行。

### 验证

- `npm run verify:local`
- `npm run oem:r2:publish -- --tag=v0.15.0 --brands=all --dry-run=true`
- `npm run oem:release:verify-online -- --tag=v0.15.0 --brands=all --channel=stable`

## v0.14.0 - 2026-05-27

### 统一后台生成任务

- 新增统一 `generationTasks` 后台任务层，图片、视频、文章、视频脚本、视频拆解、提示词包、场景卡和对标反推都可复用同一套任务提交、状态广播和历史日志更新机制。
- 图片 / 视频用户点击生成后立即进入后台队列，离开当前界面不会中断；任务完成后同一条历史记录从 queued/running 更新为最终状态，不再追加重复结果日志。
- 保留原同步生成 API 供 SOP / 工作流引擎兼容使用，避免破坏已有自动化链路。

### AI 生图历史与精修

- AI 生图历史抽屉合并本地临时记录与全局生成日志，提交、生成中、成功、失败、待配置状态都会在右侧历史记录中可追溯展示。
- 点击历史详情里的“局部精修”会带入历史输出图作为待精修图，进入源站式局部精修工作台，并同步全局图片工作台状态。
- AI 生图示例的输入 / 输出图改为完整展示，多输入案例点击“尝试示例”后会按参考图语义带入，不再误填到产品图。
- 生成按钮附近新增后台队列提示，明确任务已提交、可离开页面、完成后在历史记录查看。

### AI 视频历史与素材流转

- AI 视频历史记录合并全局后台生成日志，离开页面后仍可从右侧历史入口查看队列文件、输入素材、输出素材和 Prompt。
- 未配置真实视频服务时，blocked 队列文件以可预览 / 可下载的追溯文件展示，不再当成坏图或空结果。
- AI 视频历史里的“发送到素材库”和“局部精修”按真实输出类型启用，视频结果可沉淀到视频素材库，图片结果可带入 AI 生图局部精修。
- 视频案例卡进一步对齐源站尺寸与展示规则，单输入案例不再错误折叠为分组缩略图，媒体预览保持完整比例。

### 验证

- `npm run typecheck`
- `npm run build`
- `npm run test:e2e -- --grep "AI 生图"`
- `npm run test:e2e -- --grep "AI 视频"`
- `npm run test:e2e -- --grep "小红书图片 SOP|参考视频拆解三步"`
- `npm run smoke:electron`
- `npm run verify:local`

## v0.13.0 - 2026-05-27

### DressingKit 复刻完善

- AI 生图继续按 DressingKit 源站体验补齐，保留左侧主导航，移除客户端内官网顶部导航，复刻上传、素材库、Prompt、案例、历史记录和生成工作台主流程。
- AI 生图案例卡尺寸、输入 / 输出图双列、预览和多图展示对齐源站，点击单张图可放大查看，多参考图可清理或继续带入生成。
- 点击“尝试示例”会同步带入案例 Prompt、产品图和参考图，产品 / 参考素材按当前功能的上传槽语义拆分，不再把参考图错误当作固定生成画布。
- 新增提示词助手弹窗，支持文本生成、图片反推上传、本地模板保存、编辑、删除和应用回填。
- AI 视频页继续迁移分镜图、智能视频、全能视频三类数据与交互，案例卡、媒体区、功能入口和左侧参数区按源站尺寸复刻。
- 复刻页布局改为内容自适应高度，案例区不再被固定视口高度裁切；生成工作台仍保留满屏画布交互。
- 历史记录收敛为右侧漂浮入口，详情保留输入素材、输出素材、Prompt 和状态信息。

### 数据与双品牌发布

- `bugu` 与 `seenx` 继续使用通用 DressingKit shared 数据，客户端不依赖 `oss.dressingkit.com` 回源。
- 本地开发环境补齐浏览器/Electron shim，便于在桌面壳和 Vite 渲染页中验证同一套复刻数据。
- 更新双品牌自动更新与 OEM 运行时配置，确保 `bugu` / `seenx` 发布链路使用各自品牌入口。

### 验证

- `npm run typecheck`
- `npm run build`
- `npm run verify:local`

## v0.12.0 - 2026-05-26

### AI 视频案例迁移

- 新增 AI 视频案例页，复刻 DressingKit 视频页的分镜图、智能视频和全能视频三类功能入口。
- AI 视频案例支持后端共享数据读取，`bugu` 和 `seenx` 可通过同一批通用 shared 数据展示 51 组案例、111 个资产和 45 个视频资源。
- AI 视频素材已发布到 Cloudflare R2 / D1，客户端读取时不依赖 `oss.dressingkit.com` 域名。
- 案例卡片按源站输入 / 输出关系展示图片和视频资源，保留分镜图普通卡片与全能视频宽卡片尺寸。
- 点击“尝试示例”会套用该案例 Prompt 到左侧提示词，但不再改变当前行业筛选，避免从“全部”跳到单一分类。
- 修复图片资源路径包含 `ai-video-showcase` 时被误判为视频的问题，PNG / JPG 现在按图片渲染，视频资源按真实视频字段和扩展名渲染。

### 验证

- `npm run build`
- `npm run test:e2e -- --grep "AI 视频页"`
- `npm run verify:local`

## v0.11.0 - 2026-05-25

### AI 生图案例迁移

- 重新按 DressingKit 源站功能分类迁移 AI 生图案例，保留源站 `businessFlag`、功能标签、输入图和输出图关系。
- 图片案例页支持后端共享案例按当前功能筛选，不再把所有数据错误归到同一功能。
- 图片案例页支持多输入 / 多输出图展示，素材预览优先使用输出图，输入 / 输出图按角色分组显示。
- 后端共享数据为空的功能显示空态，不再混入本地占位案例。
- 生产共享素材已发布到 Cloudflare R2 / D1，`bugu` 和 `seenx` 可读取同一批通用案例数据。
- 点击“尝试示例”会同步套用该案例源站 Prompt 到正面 / 背面 / 侧面视角，避免切换视角后仍显示旧 Prompt。

### 验证

- `npm run typecheck`
- `npm run verify:local`

## v0.10.1 - 2026-05-23

### 更新查询修复

- 修复“设置 -> 关于”手动检查更新在品牌 API 和静态发布清单返回 404 时直接失败的问题。
- 更新检查现在保持原有品牌 API、静态清单优先级，并新增 GitHub Release API 作为自动兜底来源。
- GitHub Release 兜底会按当前 OEM 品牌前缀筛选安装包，避免 `bugu` 与 `seenx` 混用下载资产。
- 功能测试新增双 OEM 更新查询回退覆盖，并补齐 Electron 测试 shim 的版本和 shell 能力。

### 验证

- `npm run typecheck`
- `npm run test:functional -- --test-name-pattern "更新检查"`
- `npm run build`
- `npm run verify:local`

## v0.10.0 - 2026-05-22

### 版本定位

v0.10.0 将内容工厂 v2 推进到本地总闸可验证的桌面发布候选：围绕普通运营用户的输入源、品牌 / IP 知识库、场景库、Prompt 工作台、素材审核、混剪包和平台草稿包形成可追溯主链，并把发布矩阵扩展为 `bugu` 和 `seenx` 双品牌。

### 双品牌发布

- 发布版本升级到 `0.10.0`，同步 `package.json` 和 `package-lock.json`。
- tag push 发布矩阵改为自动构建并发布 `bugu`、`seenx` 两个 OEM 品牌。
- 继续使用 GitHub Release 作为桌面安装包归档事实源；`bugu` 运行时入口保持 `bugu.run` 同域。
- 移除旧 R2 同步链路，发布工作流只负责验证、构建 OEM 包和更新 GitHub Release。
- 更新 `bugu` OEM 图标与品牌配置，保留 `seenx` 独立品牌 manifest 和产物目录。

### v2 内容工厂主链

- 新增 v2 provider 诊断、业务验收和证据目录脚本，并将 `npm run verify:v2` 纳入 `npm run verify:local`。
- 输入源页补齐产品资料结构化、SKU / 规格追溯、评论痛点聚类、客服异议话术和普通用户任务导轨。
- 品牌 / 产品知识库、IP 知识库、场景库、Prompt 工作台和视频 Prompt 页面继续收敛到可发现的二级入口。
- SOP 执行页新增运行前资料选择，显式记录本次 `inputSourceIds`，取消全部资料时禁止启动运行。
- 工作流引擎补齐产品商业素材、评论痛点选题、绿幕文案图、平台草稿包和混剪包主链追溯。

### 素材与交付

- 素材库强化审核决策、回炉、成功素材沉淀和混剪包导出追踪。
- 视频 Prompt 外部生成路径记录复制动作，成品视频支持手动导入并关联原 Prompt。
- 绿幕文案图生成、审核和混剪 manifest 写入形成可验证闭环。
- 文章页支持导出平台草稿包、平台复制稿、格式指南、发布前检查和 manifest，不接平台账号或自动发布。

### 工程与验证

- 更新 v2 路线图、实施计划、完成度审计、业务验收样例和原型文档。
- 扩展功能测试和 E2E，覆盖普通用户关键二级入口、v2 工作流、Prompt、素材、混剪和平台草稿包路径。
- 发布 workflow 会在构建前执行 `npm run verify:local`，再分别构建 `bugu` / `seenx` 的 macOS、Windows 和 Linux 产物。

### 验证

- `npm run typecheck`
- `npm run build`
- `npm run verify:v2`
- `npm run test:functional`
- `npm run smoke:electron`
- `npm run test:e2e`
- `npm run verify:local`

### 明确不包含

- 正式 macOS Developer ID 签名和 notarization 仍未启用，当前 macOS 包继续使用 unsigned 内部预览策略。
- 未配置真实文字 / 图片 / 视频生成服务时仍返回 `blocked`，不伪造生成成功。
- v2 不接平台账号，不做自动发布，不实现云端多租户协作或复杂权限系统。
