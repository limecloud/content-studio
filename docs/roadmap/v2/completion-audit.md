# 布谷AI内容工厂 v2 完成度审计

更新时间：2026-05-22
状态：Local Verified / 发布级真实证据待补

## 1. 审计目标

本文件用于判断 v2 是否真正完成“知识体系 + 场景库 + Prompt 生产 + 素材生成”的内容工厂，避免只完成几个演示页面、单一知识库流程或炫技 canvas，但没有可复用场景库 / Prompt / SOP / Skill / 素材体系。

当前结论：v2 技术主链已经通过本地总闸验证，功能测试和 E2E 覆盖了输入源、品牌 / IP 知识库、场景库、Prompt 草稿、SOP 运行、审核、视频 Prompt 手工交接、混剪包和平台草稿包。但经过普通用户用例重审，产品可用性不能只按“对象已存在”判断，还必须按用户故事确认入口可发现、下一步清楚、页面不把工程对象当主任务。本轮已把场景库、输入源、成品视频导入和运行历史作为当前一级分组下的普通用户二级入口暴露；工作流定义和 Canvas 编排已收进“高级维护”，供内容工程师展开使用；关键模块已加入普通用户任务导轨。v2 仍不能标记生产完成，真实用户 provider 配置下的端到端联调、实际业务素材验收和点击级 GUI 回归还需要继续补证据；无 Key / 无 provider 的路径已经验证为 blocked，不伪造成果。

真实 provider 联调入口：`npm run verify:v2:providers`。默认只做 dry-run 配置诊断，不发起网络请求；设置 `CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1` 后才会调用文字 / 视觉 provider，设置 `CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1` 后才会继续验证视频媒体 provider。需要留存联调证据时使用 `-- --output <报告路径>` 或 `CONTENT_STUDIO_V2_PROVIDER_REPORT=<报告路径>`。

真实 provider 发布门槛：`npm run verify:v2:providers:strict`。严格模式下必须显式开启网络和媒体联调，且只要存在 `failed` 或 `blocked` 就退出非 0；默认 dry-run 仍用于诊断，不作为发布通过信号。

真实业务素材验收入口：`npm run verify:v2:acceptance`。当前默认使用 local-sample 固化品牌资料、IP 六层、产品资料结构化、主图 / 卖点图 / 详情页 Prompt 追溯、评论痛点聚类、标题方向、客服异议话术、对标图字段、参考视频拆解、绿幕文案图、成功素材回炉、混剪包导入说明、平台草稿包、视频成本边界、跨产物 runId 关键覆盖和一致性的验收口径；真实素材可通过 `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 替换同一报告输入，也可通过 `npm run verify:v2:acceptance -- --workspace <工作区路径>` 直接从 `.content-studio/` 读取已生成产物，而不是另建一套不可复核的人工清单。目录 / 工作区模式会校验输入源里的产品资料 / 评论反馈、视频拆解与脚本、绿幕文案图、成功素材沉淀、混剪清单文件的 `packagedPath` 是否指向真实文件，并校验 `import-guide.md` 是否覆盖第三方混剪软件、素材目录、CSV 和人工审核边界。需要把“已在真实混剪工具导入”作为门槛时，加 `-- --require-external-mix-evidence`，并在混剪包目录放 `import-evidence.json` 及截图 / 录屏 / 验收记录文件，参考 `docs/roadmap/v2/mix-import-evidence.example.json`。需要证明不是 local-sample 或手填清单，而是完整真实工作区闭环时，加 `-- --require-real-workspace-evidence --require-external-mix-evidence`；其中 `--require-real-workspace-evidence` 会自动要求真实混剪工具导入证据，并要求 `--workspace`、真实产品资料 / 评论反馈 / 参考图视频、视频拆解、绿幕图审核、成功素材沉淀、混剪包实存文件、平台草稿包、runId 一致性和 provider strict 证据都成立。需要留存验收证据时使用 `-- --output <报告路径>` 或 `CONTENT_STUDIO_V2_ACCEPTANCE_REPORT=<报告路径>`。

成套验收证据入口：`npm run verify:v2:evidence -- --output-dir docs/dev/v2-acceptance/<日期>`。该命令会在同一目录生成 `provider-check.json`、`business-acceptance.json`、`manifest.json` 和 `SUMMARY.md`；默认无 Key 环境只保留 provider blocked 诊断，不把它当成本地业务验收失败。真实发布门槛优先使用 `npm run verify:v2:release -- --workspace <工作区路径> --output-dir docs/dev/v2-acceptance/<日期>`；该入口固定启用 provider strict、真实工作区闭环、真实混剪导入证据、网络联调和媒体联调。

v2 本地总闸：`npm run verify:v2` 会顺序执行 provider dry-run 诊断和业务验收报告，并已纳入 `npm run verify:local`。真实 provider 发布门槛仍使用 `verify:v2:providers:strict`，避免无 Key 的本地环境伪装为生产就绪。

## 2. 完成度总表

| 模块 | 完成标准 | 状态 |
| --- | --- | --- |
| v2 文档体系 | README、PRD、工作流模型、架构图、UI 蓝图、实施计划、审计清单齐全。 | 已落地，需随实现持续校准 |
| 输入源模型 | 知识库文档、参考图、参考视频、产品资料、SKU 表、竞品内容能统一登记。 | 已验证 |
| 品牌 / 产品知识库 | 能从品牌或产品文档生成卖点、合规边界和来源引用。 | 已验证 |
| 场景库 | 能从品牌 / 产品知识库生成结构化场景卡。 | 已验证 |
| 提示词组 | 能从场景库生成 UGC 实拍图片 / 图生视频提示词。 | 已验证，数量按场景卡配置生成 |
| IP 知识库 | 能展示身份、价值观、语言、判断方法、素材和创作引擎六层完整度。 | 已验证 |
| Prompt 工作台 | 能选择输入源、多轮调整 Prompt、保存版本并确认用途。 | 已验证 |
| 对标图反推 | 无知识库路径能反推 Prompt 并进入同风格图片链路。 | 已验证 blocked / HTTP provider mock 成功分支，待真实用户 provider 联调 |
| 工作流类型 | `WorkflowDefinition`、`WorkflowRun`、步骤输入 / 输出 / artifact refs 有共享类型。 | 已验证 |
| 内置 SOP | 至少 7 个内置 SOP 可列出，并覆盖产品商业素材、评论痛点选题和绿幕文案图。 | 已验证 |
| SOP 执行页 | 不打开 canvas 可运行 SOP，运行前能显式确认本次资料来源。 | 已验证，输入源显式选择已补齐 |
| 工作流运行记录 | 每次运行可追溯步骤、输入、输出和错误。 | 已验证 |
| 人工审核 | 支持通过、驳回、重生成、入库。 | 已通过功能测试和 E2E 主路径验证 |
| 素材库 artifact 化 | 文案、图片、视频 Prompt、手动导入视频统一登记。 | 已通过功能测试和 E2E 主路径验证 |
| 视频 Prompt 人工外部生成 | 可复制视频 Prompt 到 RunningHub / 第三方平台，不创建外部任务。 | 已验证 |
| 成品视频可选导入 | 可把第三方生成的视频文件导入素材库并关联原 Prompt。 | 已验证 |
| 混剪素材包 | 可导出文件夹、manifest、CSV 和剪辑人员可读导入说明。 | 已验证 |
| 发布平台草稿包 | 文章草稿可导出本地平台草稿包、平台复制稿、格式指南、发布前检查和 manifest，并能在文章页检索、按平台过滤、回到 SOP、Prompt 草稿或来源记录，不接平台账号。 | 已通过功能测试和 E2E 主路径验证 |
| canvas 视图 | 能查看和轻编辑定义，但不是必经路径。 | 已验证，非主路径 |

### 2.1 已落地补充

- 视频 Prompt：`VideoPromptModule` 只负责生成 / 复制 / 记录复制动作，不创建第三方任务。
- DOCX / Markdown 输入源：`InputSourceStore` 导入文件后调用 `documentTextExtractor` 抽取可读文本，写入 `extractedText` 和可追溯 `markdownPath`；图片 / 视频等未理解素材保留 blocked 原因。
- 默认知识引用：`useContentStudioApp` 生成提示词包时按“手动引用 -> 检索结果 -> 当前知识库重点章节 -> 已解析输入源”的顺序构造 `KnowledgeCitation`，避免导入 DOCX 后还必须先手动搜索才能进入提示词包。
- PromptDraft 生成：`PromptDraftStore` 优先通过 `TextGenerationService.generateJson` 调用 Claude SDK / Anthropic / OpenAI / Gemini 显式协议 provider；未配置或失败时只生成 `blocked:text-provider` / `fallback:local-rule` 的可追溯本地草稿，不伪造成模型成功。
- Agent 多轮会话：`AgentPromptSessionStore` 记录会话、用户意图、输入源快照、消息流和关联草稿；启动会话时先生成首版 PromptDraft，继续会话时会写入新的草稿版本并同步会话历史。
- IP 场景延伸：`IpKnowledgeModule` 可从同一套 IP 六层知识库生成口播 / 长文 / 私域等 `ip-scenario-kb` 输入源和对应 `PromptDraft`，并把来源回写到关联 IP SOP 运行记录，避免不同场景各自发明人设。
- 对标图反推：`ReferenceReverseService` 只在真实视觉理解 endpoint 可用时分析参考图 / 产品图，未配置时保持 blocked，不伪造“看过图”的结果；成功后会产出 `PromptDraft` 和 `generation-log:reference-reverse`。
- 成品视频导入：`VideoImportModule` 通过输入源登记第三方生成后的视频文件，并关联原 PromptDraft。
- 内部视频 API 成本边界：`MediaProvider.generateVideo` 在真实 Generic HTTP 成功、任务 queued、失败和未配置 blocked 队列四种路径中统一写入 `model`、`durationSeconds`、`aspectRatio` 和 `costEstimate`；provider 返回 `cost/currency` 时优先使用真实返回值，否则按 `CONTENT_STUDIO_VIDEO_CNY_PER_SECOND` 或默认 2 元/秒估算，视频工作台直接展示成本估算。
- 绿幕文案图：`OverlayCardStore` 生成本地 9:16 绿幕 SVG 文案图，作为确定性本地素材，不伪造成 AI 图片生成。
- 素材审核门槛：`AssetReviewStore` 记录图片 / 视频 / 绿幕图的 pending / approved / rejected，混剪包只能导出 approved 素材。
- 审核后流转：通过素材可进入混剪包；驳回素材可按来源回炉到图片生成、视频 Prompt、视频生成或绿幕文案图。
- 成功素材沉淀：通过审核的图片 / 视频素材可在素材库和混剪包页面沉淀为 `successful-asset` 输入源和新的 `PromptDraft`，并把 `input-source:*`、`prompt-draft:*` 回写到关联 SOP 运行记录；带 `prompt-distilled` 标签的追溯输入源不再作为新的媒体候选，避免覆盖原素材审核状态。
- 混剪包导出：`MixPackageStore` 复制已通过审核的图片 / 视频 / 绿幕图到本地包目录，并写入 `manifest.json`、`manifest.csv` 和 `import-guide.md`。
- 平台草稿包导出：`PlatformDraftStore` 把文章正文、平台复制稿、格式指南、发布前检查、metadata 和 manifest 写入 `.content-studio/assets/platform-drafts/`，并把记录写入 `.content-studio/platform-drafts.json`；文章页会加载草稿包记录，支持按标题 / 平台 / 主题 / 人群检索、按平台过滤、打开本地包、打开复制稿、回到关联 SOP、Prompt 草稿和来源生成记录；只作为人工复制到平台前的本地交付包，不做账号授权或自动发布。
- SOP 产物快捷入口：`WorkflowFeatureModule` 同时读取步骤输出和 `artifactRefs`，把 `brand-knowledge-base:*`、`ip-knowledge-base:*`、`scene-card:*`、`prompt-draft:*`、`asset-review:*`、`overlay-card:*`、`mix-package:*` 和 `.content-studio/assets/platform-drafts/` 本地草稿包归并为可点击业务入口；视频 SOP 的绿幕图和混剪包回到对应工作台，文章 SOP 的平台草稿包直接打开本地位置；相关入口挂在现有一级分组下，不新增另一套一级导航。
- SOP 执行资料选择：`WorkflowFeatureModule` 会按同一套 `inputSourcePolicy` 在执行页展示“本次使用资料”，默认勾选和当前 SOP 匹配的产品资料、参考素材、评论原声、品牌 / IP 知识库或任务输入；用户可取消或重新勾选，运行时显式把所选 `inputSourceIds` 写入 `WorkflowRun`，不再让普通用户只能依赖隐式全局匹配。
- SOP 运行上下文恢复：`useContentStudioApp` 从 `artifactRefs` 兜底恢复品牌知识库、IP 知识库、提示词包、场景卡和 PromptDraft 选择状态，避免运行详情有产物 ID 但跳转后丢上下文。
- Canvas 高级轻编辑：`WorkflowFeatureModule` 的 Canvas tab 已收进 SOP 页“高级维护”，左侧导航也只在展开“高级维护”后显示；它只服务内容工程师查看和轻编辑复杂依赖，不是普通用户运行 SOP 的主路径。点击节点可轻编辑标题、说明、依赖、输出键和 blocked 原因，保存直接更新同一份 `WorkflowDefinition`，不另存画布坐标，已发布定义必须先复制草案再改。
- SOP 最小执行器：`WorkflowEngine` 已接入 `workflow:startRun`，可执行 `input`、`build-brand-knowledge-base`、`agent-read`、`reference-reverse`、`structure-product-brief`、`cluster-user-feedback`、`generate-prompt-pack`、`generate-scene-library`、`generate-prompt-group`、`prompt-generate`、`image-generate`、`video-prompt`、`review`、`asset-store`、`export` 等步骤；未知步骤和未配置 provider 保持 blocked。
- 产品商业素材 SOP：`WorkflowStore` 已内置 `product-commercial-assets`，普通电商运营可从产品 brief / SKU 表进入“结构化产品资料 -> 三类商业图片 Prompt -> 图片生成 -> 审核 -> 入素材库”主链；字段缺失时停在结构化步骤，不进入下游编造。
- 评论痛点选题 SOP：`WorkflowStore` 已内置 `feedback-topic-matrix`，普通运营负责人可从评论、差评、客服问题和私信原声进入“聚类痛点 -> 选题方向 -> 客服异议话术 -> 文案 Prompt -> 人工审核”主链；缺少真实反馈时停在输入和聚类步骤，不进入下游编造。
- 绿幕文案图 SOP：`WorkflowStore` 已内置 `green-screen-card-package`，短视频运营可从口播脚本、卖点列表和 CTA 文案进入“绿幕 Prompt -> 本地 9:16 SVG 绿幕卡 -> pending 审核”主链；脚本不足时 blocked，不强行生成不可读卡片。
- IP 内容 SOP：已能从 SOP 输入登记 `InputSource`，启动 `AgentPromptSession`，生成 `PromptDraft`，并停在人工审核节点。
- 图片 SOP 审核桥：图片步骤通过真实 `MediaProvider` 成功生成本地素材后，会同时写入 `GenerationLogStore` 和 `AssetReviewStore` 的 pending 审核记录，运行记录保留 `generation-log:*`、素材路径和 `asset-review:*` 引用。
- 品牌场景 SOP：`WorkflowEngine` 已支持携带 `KnowledgeCitation` 运行，能执行“品牌知识库抽取 -> 提示词包 -> 场景库 -> Prompt 组 -> 人工审核”链路；运行记录保留 `brand-knowledge-base:*`、`prompt-pack:*`、`scene-card:*`、`prompt-draft:*` 引用。
- 内置 SOP：`WorkflowStore` 会补齐缺失的内置定义，不覆盖用户已有定义；当前至少包含品牌场景提示词、小红书种草图、产品商业素材、评论痛点选题、绿幕文案图、公众号 IP 内容和视频素材包 7 条定义。
- 文档事实源：`.gitignore` 已放行 `docs/roadmap/v2/**`，v2 README、PRD、架构图、工作流模型、UI 蓝图、实施计划、审计清单、原型和 skill 分析资料可以进入仓库事实源；`.DS_Store` 仍保持忽略。

### 2.2 2026-05-22 普通用户用例重审

本轮按 PRD 用户故事重新审计前端，不再只看“对象能否生成”。判断标准改为：普通用户打开页面后是否知道自己正在完成哪条任务、当前缺什么、主按钮是什么、完成后去哪里。

| 用户故事 / 用例 | 普通用户目标 | 本轮修正 | 仍需继续 |
| --- | --- | --- | --- |
| US-01 / UC-03 无知识库对标图反推 | 上传参考图和产品资料，得到可修改图片提示词，再生成图片和审核入库。 | 对标图页新增“无知识库小红书扒图”导轨，明确参考图、产品资料、反推提示词、图片生成和审核入库的顺序；反推成功仍自动进入 Prompt 工作台继续修改。 | 需要真实视觉 provider + 真实业务参考图做点击级验收。 |
| US-04 / UC-05 产品资料结构化 | 把产品 brief / SKU 表变成卖点、规格、场景和禁用表达变量表，再进入图片、详情页或 Prompt 生产。 | 输入源页新增“产品资料结构化”面板，登记产品资料后自动从明示字段整理产品名称、卖点、规格、适用场景、禁用表达和 SKU 行；缺项直接标记待补，不编造字段，并生成主图、卖点图和详情页模块 Prompt 交付，保留输入源与 SKU / 规格追溯。 | 仍需真实 SKU / 详情页资料验收批量变体质量。 |
| US-11 用户反馈痛点聚类 | 从评论、差评和客服问题里找到真实痛点、选题方向和可用标签。 | 输入源模型新增 `user-feedback` 用途；输入源页新增“评论痛点聚类 / 用户问题矩阵”面板；`feedback-topic-matrix` SOP 已能把评论原声推进到痛点矩阵、选题方向、客服异议话术、确认态文案 Prompt 和人工审核。 | 仍需真实评论 / 客服记录验收聚类与话术质量，并决定是否沉淀为独立痛点库。 |
| US-02 / US-13 / UC-15 品牌知识库到场景库 | 导入品牌 / 产品资料，先得到场景库，再生成可复制提示词。 | 品牌知识库页新增“品牌 / 产品资料先变成场景库”导轨，主路径固定为选择资料 -> 抽取事实 -> 生成场景库 -> 生产提示词组；场景库页已补场景卡字段编辑和确认动作，可在下游前修正人群、痛点、空间、构图、卖点和素材建议。 | 仍需真实业务资料下的场景质量人工验收。 |
| US-14 / UC-16 场景提示词生成 | 从场景卡生成 10 组图片 / 图生视频 / 文案 / 绿幕图提示词，并进入下游。 | 场景提示词页新增“场景库到素材生产”导轨，提示词组生成、图片生成、视频 Prompt 的下一步不再靠用户猜；新增“下游交接”面板，区分内部图片 / 视频 / 文案 / 绿幕下游和外部图片 / 视频工具，视频复制会记录到 `PromptDraft.copyCount / lastCopiedTarget` 并进入待导入状态。 | 仍需真实外部工具交接和内部 provider 生成质量验收。 |
| US-15 / US-16 / UC-17 / UC-18 IP 运营 | 构建六层 IP 知识库，再延伸出口播、私域、产品化等场景。 | IP 知识库页新增六层导轨，并把层级 key 显示为中文业务层级，避免普通用户看到 `identity`、`methodology` 等内部字段；新增结构化“IP 运营场景库”，按口播、私域、产品化等场景展示来源 IP 版本、延伸知识库状态、提示词状态和下一步动作。 | 仍需真实 IP 素材验收口播 / 私域 / 产品化输出质量。 |
| US-05 / UC-08 / UC-09 视频 Prompt 外部生成 | 生成 15 秒视频提示词，复制到第三方平台，成品回来后手动导入。 | 视频 Prompt 页新增外部生成导轨，强调软件只记录提示词和复制动作；导航新增“成品视频导入”；复制后按本地证据派生“已复制待导入 / 已导入成品 / 未复制”状态并可筛选。 | 仍需真实第三方平台交接后的业务素材验收。 |
| US-06 / UC-10 绿幕文案图 | 把口播脚本或卖点拆成标题卡、卖点卡和 CTA 卡，审核后交给第三方混剪叠加。 | 绿幕文案图已纳入业务验收；`green-screen-card-package` SOP 已能把脚本 / 卖点 / CTA 拆成三类本地 9:16 SVG 绿幕卡，并自动创建 pending 审核记录，后续可作为 overlay 进入混剪清单。 | 仍需真实口播脚本、真实绿幕图和真实混剪工具导入验收。 |
| US-07 / UC-11 审核与入库 | 审核人员能从素材看到输入、提示词、参数、质检和下一步。 | 导航新增“合规检测”和“图片精修”，让审核 / 回炉入口可直接找到；素材详情已补“审核决策”面板，按来源、质检结果、建议下一步和处理动作组织；驳回素材必须填写原因，回炉提示词会带入该原因。 | 已接入生成日志和关联 Prompt 草稿中的结构化质检 / 风险证据；仍需真实 provider 素材质量验收。 |
| US-08 / UC-12 混剪素材包 | 剪辑人员拿到已通过素材文件夹、manifest、CSV 和导入说明。 | 导航保留“混剪包导出”，成品视频导入和运行历史成为可发现入口；导出包新增 `import-guide.md`，说明第三方混剪软件导入顺序、`videos/` / `overlays/` 目录、`manifest.csv` 用法和人工审核边界，并纳入业务验收。 | 仍需真实混剪工具按导入说明试导入一次，补外部验收证据。 |
| US-09 / US-12 内容工程师 SOP / Canvas | 工程师维护定义，普通用户用表单执行。 | 工作流定义和 Canvas 已收进“高级维护”，默认导航和 SOP 页面只展示普通用户需要的执行表单、运行记录和恢复路径；内容工程师展开高级维护后仍可编辑定义和 Canvas。 | 仍需真实团队权限 / 角色策略验收；v2 暂不做复杂权限系统。 |

补充修正：SOP 执行页已把“本次使用资料”提升为运行前必选项。普通用户不再只填写一段“输入源”文本并由系统暗中匹配全局资料，而是在表单内看到候选产品资料、参考素材、评论原声、品牌 / IP 知识库和任务输入；取消全部资料时“运行 SOP”会禁用，并给出去输入源 / 文档转换登记资料的恢复路径。

本轮前端修正范围：

- `src/renderer/src/app/constants.ts`：补齐现有一级分组下的二级入口，不新增另一套一级导航。
- `src/renderer/src/components/UserJourneyGuide.tsx`：新增复用任务导轨，服务普通用户“当前在哪、缺什么、下一步去哪”。
- `InputSourcesModule`、`ReferenceReverseModule`、`BrandKnowledgeModule`、`IpKnowledgeModule`、`ScenePromptModule`、`VideoPromptModule`、`PromptWorkbenchModule`：接入任务导轨并收敛工程化文案；场景库页支持场景卡字段确认 / 编辑，场景提示词支持单条复制，IP 知识库页支持结构化 IP 运营场景库和已生成延伸提示词回看。
- `VideoPromptModule` / `VideoImportModule`：视频 Prompt 复制后进入“已复制待导入”本地状态，成品视频导入后变为“已导入成品”，导入页可按状态筛选原提示词。
- `AssetsModule`：素材卡片和详情不再把 SOP / Prompt 作为主判断层，改为“任务可追溯 / 提示词可追溯 / 审核决策 / 建议下一步”，审核人员先做业务判断，再查看追溯信息。
- `tests/e2e/electron-app.spec.mjs`：导航断言改为普通用户关键二级入口可见，创意视频 / 自定义视频继续作为高级入口隐藏。

## 3. 必须通过的用户路径

### 3.1 无知识库小红书扒图 SOP

```text
选择对标图反推
-> 上传 1-10 张参考图
-> 上传产品图 / 填产品资料
-> 模型反推构图、风格、文字区域和 Prompt
-> 用户多轮调整 Prompt
-> 生成 4 张同风格图
-> 质检文字、主体一致性和侵权风险
-> 人工审核
-> 通过图进入素材库
-> 成功素材反向沉淀 Prompt
```

验收：

- 全流程不要求知识库。
- 参考图、产品资料、Prompt 版本和生成结果能追溯到同一个 runId。
- 多模态模型未配置时必须 blocked，不伪造分析。
- 通过图可复用到下一次 SOP。

### 3.2 品牌知识库场景提示词 SOP

```text
导入品牌 / 产品知识库
-> Agent 读取文档
-> 抽取季节、人群、问题、空间、动作、情绪、镜头和合规边界
-> 生成场景库
-> 从场景卡生成 10 组 UGC 手机实拍提示词
-> 用户复制到外部图片 / 图生视频工具
-> 可选导入成品素材
```

验收：

- 场景卡能追溯到知识库来源。
- 提示词包含人物、动作、空间、光线、镜头、真实感要求和负面约束。
- 不出现医疗化承诺、不摆拍、不广告棚拍。
- 外部生成过程不被软件当成内部任务。

### 3.3 IP 知识库构建 SOP

```text
上传访谈稿 / 课程大纲 / 工作坊记录 / 产品资料
-> Agent 读取素材
-> 生成六层 IP 知识库
-> 标记缺失层级和待补充素材
-> 导出 DOCX / Markdown
-> 生成口播、文案、私域、产品化等场景延伸库
```

验收：

- 六层完整度可见：身份、价值观、语言、判断方法、素材、创作引擎。
- 场景延伸库关联同一 IP 知识库版本。
- 不把 IP 知识库和品牌 / 产品知识库混用。
- 缺失内容标记待补充，不编造素材。

### 3.4 知识库驱动 IP 内容 SOP

```text
选择 SOP
-> 选择 IP 知识库
-> 输入用户意图
-> Agent 读取文档并追问
-> 生成 Prompt 草稿
-> 用户多轮调整并确认
-> 生成标题和正文 / 口播稿
-> 发布检查
-> 人工审核
-> 导出 Markdown
```

验收：

- 正文引用知识库事实。
- Agent 会话、Prompt 草稿和文档来源能追溯。
- 发布检查能指出风险。
- Markdown 可导出。

### 3.5 混合商业素材 SOP

```text
选择 SOP
-> 上传产品图 / 参考图
-> 选择品牌 / 产品知识库或填写产品资料
-> 生成或选择场景库
-> 反推参考图风格
-> 生成标题和种草图提示词
-> 生成 4 张图
-> 质检
-> 人工审核
-> 通过图进入素材库
-> 导出素材包
```

验收：

- 标题、图片、提示词都能追溯到同一个 runId。
- 不通过的图能标记原因。
- 通过图可复用到下一次 SOP。

### 3.6 公众号长图文 SOP

```text
选择 SOP
-> 选择 IP 知识库或品牌 / 产品知识库
-> 生成大纲
-> 生成正文
-> 发布检查
-> 人工审核
-> 导出 Markdown
```

验收：

- 正文引用知识库事实。
- 发布检查能指出风险。
- Markdown 可导出。

### 3.7 参考视频拆解 SOP

```text
选择视频拆解
-> 上传参考视频
-> 拆开头钩子、镜头节奏、字幕结构和 CTA
-> 替换为自己的产品资料
-> 生成脚本、分镜和视频 Prompt
-> 生成视频 Prompt
```

验收：

- 参考视频作为输入源可追溯。
- 输出脚本结构、分镜 Prompt 和视频 Prompt 草稿。
- 未配置视频理解模型时 blocked。

### 3.8 视频素材包 SOP

```text
选择 SOP
-> 选择已通过图片素材
-> 生成视频提示词和绿幕文案图
-> 复制 Prompt 到 RunningHub / 第三方平台
-> 第三方生成过程脱离软件
-> 用户可选导入成品视频
-> 进入素材库
-> 审核通过后可反向沉淀视频 Prompt
-> 导出混剪素材包
```

验收：

- 不配置视频 API 也能生成并复制视频 Prompt。
- 绿幕文案图包含标题卡、卖点卡和 CTA 卡，文案可读、通过审核，并以 overlay 写入混剪清单。
- 手动导入视频关联原 Prompt。
- 通过审核的第三方成品视频可在混剪包页沉淀 Prompt，并回写 SOP artifactRefs。
- 混剪包只导出已通过审核的素材，包含 manifest、CSV、导入说明和 SOP 追溯。

### 3.9 内部视频 API 路径

```text
选择视频 provider internal-api
-> 填写视频提示词
-> 调用 API
-> 写入视频素材
-> 进入审核
```

验收：

- 未配置 API Key 时必须 blocked，不伪造结果。
- 配置后记录模型、时长、成本相关字段。

## 4. 关键质量门槛

| 门槛 | 要求 |
| --- | --- |
| 可追溯 | 每个 artifact 有 runId、stepId、sourceLogId 或明确来源。 |
| 多输入源 | 知识库、参考图、参考视频、产品资料等都能作为 SOP 输入源。 |
| 场景中间层 | 品牌 / 产品知识库进入图片或视频 Prompt 前，必须经过场景库或内容任务结构。 |
| IP 体系独立 | IP 知识库不能被当作品牌知识库字段，六层结构必须可见。 |
| 可审核 | AI 产物默认不直接进入最终导出，必须支持人工确认。 |
| 可复用 | 通过审核的素材能被后续 SOP 选择。 |
| 可导出 | 混剪素材包和文案导出不依赖远端服务。 |
| 可降级 | provider 未配置时返回 blocked / waiting external。 |
| 可维护 | 新增 SOP 不需要新增整套页面。 |

## 5. 不合格信号

- 新增一个 SOP 需要复制一个完整 React 页面。
- 品牌 / 产品知识库直接生成 Prompt，没有场景库。
- IP 知识库只剩人设简介，没有价值观、语言、方法论、素材和创作引擎。
- 视频 API 未配置时仍显示“生成成功”。
- 图片素材没有记录来源提示词。
- 参考图反推结果没有记录参考图来源。
- 手动导入视频无法关联原 Prompt。
- canvas 保存的数据无法被表单视图执行。
- 运行历史只能看最终结果，看不到中间步骤。
- 素材库只按文件展示，没有平台、状态和标签。

## 6. 发布前检查

发布 v2 前必须确认：

- `npm run verify:local` 通过。
- 至少 5 条 SOP 用户路径有本地验证记录。
- 品牌知识库 -> 场景库 -> 提示词组路径有本地验证记录。
- IP 知识库六层构建路径有本地验证记录。
- 无知识库对标图反推路径有本地验证记录。
- GUI 关键路径经过 smoke 或 e2e 验证。
- 文档已同步最新边界：不做混剪、不默认自动发布、第三方视频生成只做 Prompt 人工复制。
- 未配置 provider 的 blocked 状态有明确 UI。
- 导出包在本地文件系统可打开。

### 6.1 2026-05-22 本地验证记录

已完成：

- `npm run typecheck`
- `npm run test:functional`
- `npm run build`
- `npm run test:e2e`

本轮全量 E2E 覆盖 17 条关键路径并全部通过，包括：

- v2 新增入口落到真实工作流动作，不再只是静态说明页。
- Prompt 工作台按用途收敛动作并可物化 Skill / SOP 草案。
- 视频素材包 SOP 可推进 Prompt 复制、成品视频导入、绿幕文案图、素材审核和混剪包导出。
- 品牌 SOP、图片 SOP、IP 长文 SOP 的运行详情可打开对应业务产物。
- 品牌知识库 -> 场景库 -> Prompt 组 -> 图片工作台链路可运行。
- 未配置真实 provider 时业务主链保持 blocked，不伪造成果。
- 真实图片 provider mock 成功后可展示真实图片预览。

### 6.2 2026-05-22 视频成本边界验证

已完成：

- `npm run typecheck`
- `npm run test:functional`
- `npm run build`
- `npm run test:e2e -- --grep "参考视频拆解三步工作台使用真实 blocked 分支，不伪造视频结果"`

验证点：

- Generic HTTP 视频 provider 成功返回视频文件时，日志 output 保留 `model`、`durationSeconds` 和 `costEstimate`。
- provider 返回 `cost: 15, currency: "CNY"` 时，`MediaGenerationResult.billing` 使用真实 provider-response 成本，单价按时长折算为 1.5 元/秒。
- 未配置视频 provider 时，视频生成保持 blocked，不伪造成果，同时队列 JSON / Markdown 和 UI 均展示默认内部 API 成本估算：18 秒 × 2 元/秒 = 36 元。

### 6.3 2026-05-22 Canvas 轻编辑验证

已完成：

- `npm run typecheck`
- `npm run build`
- `npm run test:e2e -- --grep "SOP 定义草案可以编辑、发布并从表单运行"`
- `npm run test:e2e`

验证点：

- Canvas 不作为普通用户入口；它收进“管理 / 高级维护”，也收进 SOP 工作流内部的“高级维护”。
- 从定义管理复制草案后，可在 Canvas 选择节点并保存轻编辑。
- Canvas 保存后的节点标题和说明回写到同一份 WorkflowDefinition JSON。
- 发布后的 SOP 执行表单能运行该草案，运行详情可看到 Canvas 改过的节点，证明画布不是独立数据源。

### 6.4 2026-05-22 发布前本地全量验证

已完成：

- `npm run verify:local`

覆盖：

- `npm run typecheck`
- `npm run build`
- `npm run test:functional`，33/33 通过。
- `npm run smoke:electron`，Electron 壳层、preload bridge、导航、skills、设置、blocked 主链和滚动状态通过。
- `npm run test:e2e`，17/17 通过。

同时完成：

- `.gitignore` 放行 `docs/roadmap/v2/**`，避免 v2 体系文档继续停留在被忽略的本地文件中。
- `docs/roadmap/v2/.DS_Store` 和子目录 `.DS_Store` 继续忽略，不进入事实源。

### 6.5 2026-05-22 平台草稿包双向追溯

已完成：

- 文章页导出的平台草稿包继续作为本地交付包，不接平台账号、不自动发布。
- Prompt 工作台在当前 PromptDraft 下展示派生平台草稿包，可打开本地包、复制稿，并回到 SOP 或来源生成记录。
- SOP 运行详情内置展示本次运行导出的平台草稿包，不新增另一套一级导航。
- 打开 PromptDraft 时按草稿用途进入对应工作台状态，避免文章 / 视频 Prompt 被错误落到图片 Prompt 视图。

已完成验证：

- `npm run typecheck`
- `npm run test:functional`，34/34 通过。
- `npm run build`
- `npm run test:e2e`，17/17 通过。
- `npm run smoke:electron`

### 6.6 2026-05-22 SOP 定义级伪阻塞清理

已完成：

- 小红书种草图内置 SOP 从 `v0.1` 提升到 `v0.2`，移除 `reference-reverse` 和 `image-generate` 的定义级 `blockedReason`。
- 运行记录创建后不再因为“旧占位说明”直接 blocked；是否 blocked 由 `WorkflowEngine` 调用真实视觉 / 图片 provider 后按结果决定。
- 功能测试同步为：裸 `WorkflowStore.startRun` 只创建 queued 运行记录，执行器路径继续覆盖真实 blocked / succeeded 分支。

已完成验证：

- `npm run typecheck`
- `npm run test:functional`，34/34 通过。
- `npm run build`

### 6.7 2026-05-22 场景 Prompt 组数量对齐

已完成：

- `buildScenePromptGroupContent` 已把图片 Prompt 和视频 Prompt 统一为 10 组，符合 PRD 中“10 组 UGC 手机实拍图片 / 图生视频提示词”的验收口径。
- `ScenePromptModule` 的视频输出说明从 6 组改为 10 组，避免 UI 与 PRD 不一致。
- 组合器在缺少场景卡时返回可追溯的未生成说明，不再隐式读取空数组。

已补验证：

- 功能测试断言品牌场景 SOP 生成的图片 PromptDraft 含 10 组图片 Prompt。
- 功能测试断言同一批场景卡可生成 10 组视频 Prompt。

最终验证：

- `npm run verify:local` 通过，覆盖 `typecheck`、`build`、`test:functional`、`smoke:electron` 和 `test:e2e`。
- `test:functional`：34/34 通过。
- `test:e2e`：17/17 通过。

### 6.8 2026-05-22 混剪 CSV manifest

已完成：

- `MixPackageStore` 导出混剪包时同步写入 `manifest.csv`，字段包含素材顺序、类型、标题、打包路径、原始路径、来源、PromptDraft、场景卡、时长和标签。
- `MixPackageRecord` 新增 `manifestCsvPath`；视频素材包 SOP 的 `mix-package-exported` 手工事件会把 CSV 路径写入 `artifactRefs`。
- 混剪包历史区新增“打开 CSV”入口，运营可以直接把 CSV 给第三方混剪工具或表格工具。

已补验证：

- 功能测试断言 `manifest.csv` 存在，包含 video / overlay 素材行，并回写到 SOP 运行追溯。
- `npm run typecheck` 通过。
- `npm run test:functional`：35/35 通过。
- `npm run build` 通过。
- `npm run test:e2e`：17/17 通过。

### 6.9 2026-05-22 Provider 联调入口

已完成：

- 新增 `npm run verify:v2:providers`，输出 `buguai.v2-provider-check.v1` JSON 报告。
- 默认 dry-run 只检查文字、视觉、图片和视频 provider 的配置完备性，不外发请求，不打印密钥。
- 设置 `CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1` 后可进行真实文字 / 视觉 provider 网络探测；设置 `CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1` 后才会继续探测视频媒体 provider。
- 新增 `npm run verify:v2:providers:strict`，严格模式下必须显式开启网络和媒体联调，且不能出现 `failed` 或 `blocked`；配置完整但未外发的 dry-run 只会显示 `ready`，不再被当作发布门槛通过。
- Provider 报告会为每个检查项输出 `requiredEnv`、`configured`、`severity` 和 `nextAction`，`strictGate.nextActions` 汇总恢复步骤，避免真实联调失败后只能看到 blocked / failed。

已补验证：

- 功能测试断言 dry-run 配置完整时 4 个 provider 均为 `ready`。
- 功能测试断言空配置会返回 blocked，不伪装 ready。
- 功能测试断言严格 provider 门槛会拒绝 blocked 报告，也会拒绝未开启网络 / 媒体联调的 dry-run ready 报告，避免配置诊断被误当作真实 provider 联调通过。
- 功能测试断言报告包含缺失环境变量、脱敏配置状态和 strict 恢复步骤。
- `npm run verify:v2:providers` 在当前无 Key 环境下返回 4 个 blocked，未外发网络请求。
- `npm run typecheck`、`npm run test:functional` 和 `npm run build` 通过。

### 6.10 2026-05-22 业务验收报告入口

已完成：

- 新增 `npm run verify:v2:acceptance`，输出 `buguai.v2-business-acceptance.v1` JSON 报告。
- 报告用 local-sample 验证品牌事实、合规边界、10 组图片 Prompt、10 组视频 Prompt、Prompt 可执行结构、IP 六层完整度、对标图 / 参考视频反推字段、混剪包双 manifest、混剪素材记录和平台草稿包交付文件。
- 报告支持 `-- --input <json>` 或 `CONTENT_STUDIO_V2_ACCEPTANCE_INPUT=<json>` 读取真实验收输入；外部输入缺少 IP 六层、对标字段、混剪文件、追溯字段或平台草稿文件时会返回 failed，不用默认值掩盖缺口。
- 外部输入可以手填 `actualFiles` / `actualTraceFields` / `actualAssetKinds`，也可以只提供 `videoPackage.packageDir`、`platformDraft.packageDir` 或对应 `manifestPath`，脚本会扫描目录并解析 manifest 提取真实交付证据。
- 报告支持 `-- --workspace <path>` 或 `CONTENT_STUDIO_V2_ACCEPTANCE_WORKSPACE=<path>`，可从工作区 `.content-studio/brand-knowledge-bases.json`、`ip-knowledge-bases.json`、`scene-cards.json`、`generation-logs.json`、`mix-packages.json` 和 `platform-drafts.json` 自动组装验收输入。
- 报告会校验 `mediaCost.actual`，或从最新视频 `generation-log.output.costEstimate` 自动提取模型、时长、币种、单价、总成本和成本来源，确保内部视频 API 成本边界可复核。
- 报告会校验 `trace.requiredSources` 与 `trace.actualWorkflowRunRefs`，或从 reference log、视频拆解日志、视频脚本日志、视频生成日志、混剪清单文件、平台草稿 manifest / record 自动提取 `workflowRunId`，确保关键产物都留下证据且没有分叉到不同 SOP 运行。
- 已提供外部输入示例：`docs/roadmap/v2/business-acceptance-input.example.json`。
- 品牌场景验收复用生产 `buildScenePromptGroupContent` 组合器，并把图片 / 视频 Prompt 数量、Prompt 片段和结构字段写入 `promptGroupEvidence`，避免业务验收和真实生成逻辑分裂。
- 报告会内嵌 `verify:v2:providers` 的 dry-run 结果；provider 未配置时保留 blocked 状态，但不把 blocked 当作本地业务口径失败。

已补验证：

- 功能测试断言业务验收报告 schema、mode、0 failed、图片 / 视频 Prompt 各 10 组、IP 完整度 100、混剪交付包含 `manifest.csv`。
- 功能测试断言外部真实素材输入可通过，同一报告在缺少 IP 层级、混剪文件或平台草稿文件时会失败并列出缺口。
- 功能测试断言手工验收输入缺少医疗化和绝对化表达边界会失败。
- 功能测试断言手工验收输入缺少竞品复制和素材授权边界会失败。
- 功能测试断言外部真实素材输入缺少视频成本估算会失败，并且有效成本会进入 `mediaCost` 分区。
- 功能测试断言手填 `manual` 视频成本来源会失败。
- 功能测试断言手工验收输入缺少 `publishBoundary` 会失败。
- 功能测试断言外部真实素材输入的跨产物 `workflowRunId` 必须一致，出现多个 runId 时会失败并列出来源。
- 功能测试断言脚本可从真实混剪包目录、平台草稿包目录和 `manifest.json` 自动提取文件清单、素材类型、素材文件存在性与追溯字段。
- 功能测试断言脚本可从真实工作区 `.content-studio` 数据自动生成验收输入，进入同一 `buguai.v2-business-acceptance.v1` 报告。
- `npm run verify:v2:acceptance` 可在无 Key 环境生成报告，不外发网络请求。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 可生成 `external-input` 报告，34/34 通过，不外发网络请求。
- `npm run verify:v2:providers` 在当前无 Key 环境下返回 4 个 blocked，未外发网络请求。
- `npm run typecheck`、`npm run test:functional`（41/41）和 `npm run build` 通过。

### 6.11 2026-05-22 v2 验收纳入本地总闸

已完成：

- 新增 `npm run verify:v2`，聚合 `verify:v2:providers` dry-run 和 `verify:v2:acceptance`。
- `npm run verify:local` 已纳入 `npm run verify:v2`，本地总闸会覆盖 v2 provider 配置诊断和业务验收结构。
- 功能测试断言 `verify:v2` 与 `verify:local` 的脚本关系，避免后续改动把 v2 验收从总闸移除。

已补验证：

- `npm run verify:v2`
- `npm run typecheck`
- `npm run test:functional`
- `npm run build`

### 6.12 2026-05-22 真实验收报告落盘

已完成：

- `scripts/v2-provider-check.mjs` 支持 `--output <报告路径>` 和 `CONTENT_STUDIO_V2_PROVIDER_REPORT=<报告路径>`，可把 `buguai.v2-provider-check.v1` 写入文件，同时保留 stdout。
- `scripts/v2-business-acceptance.mjs` / `npm run verify:v2:acceptance` 支持 `-- --output <报告路径>` 和 `CONTENT_STUDIO_V2_ACCEPTANCE_REPORT=<报告路径>`，可把 `buguai.v2-business-acceptance.v1` 写入文件，同时保留 stdout。
- 输出目录不存在时自动创建父目录，便于把真实 provider strict 联调和 workspace 业务验收报告保存到同一个证据目录。

已补验证：

- 功能测试执行真实 CLI，断言 provider 报告和业务验收报告均可写入文件并能被 JSON 解析。
- `npm run test:functional`
- `npm run typecheck`
- `npm run build`

### 6.13 2026-05-22 跨产物 runId 一致性验收

已完成：

- `buguai.v2-business-acceptance.v1` 新增 `trace` 分区，检查验收证据中是否存在 `workflowRunId`，以及 reference log、视频拆解日志、视频脚本日志、视频生成日志、混剪包、平台草稿包是否指向同一条 SOP 运行。
- `--workspace` 模式会从 `.content-studio/generation-logs.json`、`mix-packages.json`、`platform-drafts.json` 和对应 manifest 自动提取 `workflowRunId`。
- 外部输入示例新增 `trace.expectedWorkflowRunId`、`trace.requiredSources` 和 `trace.actualWorkflowRunRefs`，真实验收不再只证明“文件存在”，还要证明参考反推、视频拆解、脚本、视频生成、混剪交付和平台草稿属于同一条业务链路。

已补验证：

- 功能测试断言一致 runId 可通过。
- 功能测试断言分叉 runId 会失败。
- 功能测试断言从真实交付包目录和 workspace 数据可自动提取一致 runId。

### 6.14 2026-05-22 视频成本边界纳入业务验收

已完成：

- `buguai.v2-business-acceptance.v1` 新增 `mediaCost` 分区，检查视频模型、状态、时长、币种、单价、估算总成本和成本来源；成本来源必须来自 `provider-response`、`env` 或 `default-internal-api`。
- `--workspace` 模式会从最新 `kind: "video"` 的 generation log 中读取 `output.costEstimate`，不需要另写人工清单。
- 外部输入示例新增 `mediaCost.actual`，真实验收必须证明内部视频 API 成本边界已经记录。

已补验证：

- 功能测试断言有效成本估算可通过。
- 功能测试断言缺少视频成本估算会失败。
- 功能测试断言从 workspace 视频日志可自动提取成本估算。

### 6.15 2026-05-22 真实交付包证据强化

已完成：

- `brand-compliance` 不再只检查合规条数，还要求品牌合规资料证明医疗化和绝对化表达边界，避免泛化“人工复核”文本伪过。
- `buguai.v2-business-acceptance.v1` 的品牌分区新增 `scene-prompt-structure` 检查，要求生产 Prompt 组合器输出的图片 Prompt 包含主体、画面、自然光和负面约束，视频 Prompt 包含 0-3s / 3-9s / 9-15s 结构、自然光和负面约束。
- reference 分区新增 `reference-source-kinds` 检查，真实验收必须同时证明参考图和参考视频来源，避免只用单一图片冒充完整对标链路。
- `reference-boundary` 不再只因存在参考来源而通过，还要求反推输出或手工验收输入显式保留竞品复制和素材授权风险边界。
- delivery 分区新增 `mix-package-assets` 检查，混剪清单文件必须包含至少一个视频素材记录，避免只有目录和清单文件的空壳包。
- 目录 / 工作区模式下，`mix-package-assets` 还会校验 manifest `assets[].packagedPath` 指向的本地文件真实存在，避免 manifest 指向不存在素材。
- delivery 分区新增 `mix-package-approved-assets` 检查，混剪清单文件必须保留 `reviewStatus: approved`，证明导出素材已通过审核门槛。
- delivery 分区新增 `platform-draft-trace` 检查，平台草稿 manifest 必须保留 `workflowRunId`、`promptDraftId` 和 `sourceLogId`，保证草稿能回到 SOP、PromptDraft 和来源文章日志。
- delivery 分区新增 `platform-draft-content` 检查，平台草稿包必须证明正文、复制稿、格式指南和发布检查清单都有可复核内容，避免只交付空文件。
- `platform-draft-content` 同时要求 `publishBoundary` 证据，证明平台草稿包只用于本地人工复制和发布前确认，不包含账号授权或自动发布任务。
- `--workspace` 模式会继续从 `.content-studio`、`asset-reviews.json`、manifest、混剪包素材文件和平台草稿包文件自动提取上述证据；旧混剪 manifest 即使没有 `reviewStatus`，也可以通过 `asset-reviews.json` 匹配素材 `assetKey` 证明过审状态。手工 `--input` 模式需要按 `business-acceptance-input.example.json` 补齐 `reference.sources`、`reference.actualBoundaryTerms`、`videoPackage.actualAssetKinds`、`videoPackage.actualReviewStatuses`、`platformDraft.actualTraceFields` 和 `platformDraft.actualContentFields`。
- `mediaCost` 分区只接受 `provider-response`、`env` 或 `default-internal-api` 作为成本来源；正数金额但来源为 `manual` 等手填值会失败，避免成本边界被人工数字伪过。

已补验证：

- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，报告为 34/34。
- `npm run test:functional -- --test-name-pattern "v2 业务验收"` 通过，覆盖 local-sample、外部输入、目录提取和 workspace 自动提取。

### 6.16 2026-05-22 素材审核台普通用户决策流

已完成：

- 素材卡片把 `SOP / Prompt` 工程状态改成“任务可追溯 / 提示词可追溯 / 场景 / 回炉生成”等普通审核语言，避免审核人员先读运行对象。
- 素材详情新增“审核决策”面板，先展示来源类型、当前审核状态、风险检查和“建议下一步”，再展示路径、任务 ID、提示词草稿等追溯信息。
- 待审核、已通过、已驳回分别给出不同下一步：核对后通过 / 填原因驳回，进入混剪包或沉淀提示词，回炉重做后再入库。
- 驳回原因提供“产品不一致 / 字体模糊 / 文案不合规 / 风格不匹配 / 画面构图不可用”快捷项和补充说明，后续回炉会把原因写入提示词版本。
- 按钮词表同步为“通过审核 / 驳回素材 / 回炉重做 / 沉淀提示词 / 打开任务 / 打开提示词”，降低普通用户对内部对象名的依赖。
- E2E 收敛 `补输入源` 按钮定位到 Prompt 输入面板，避免任务导轨新增同名按钮后产生全局选择器歧义。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "小红书图片 SOP 运行详情可以进入图片工作台和素材审核"` 通过。
- `npm run test:e2e -- --grep "视频素材包 SOP"` 通过。

### 6.17 2026-05-22 视频 Prompt 复制后待导入状态

已完成：

- 新增 `videoPromptHandoff` 前端派生层，只从 `PromptDraft.copyCount / lastCopiedAt` 和成品视频 `InputSource.relatedPromptDraftId` 判断状态，不新增外部任务或第三方轮询。
- 视频 Prompt 页复制后显示“已复制待导入”，并给出“去导入”入口；若已导入成品视频，则显示“已导入成品”和导入数量。
- 成品视频导入页新增提示词状态筛选：全部、已复制待导入、已导入成品、未复制；左侧提示词卡片显示复制次数、最近目标和成品数量。
- 导入页空状态会提示当前有几个已复制待导入提示词，避免用户复制后回到软件不知道该选哪条 Prompt。
- 仍坚持 PRD 边界：第三方平台生成过程脱离软件，不保存外部任务 ID、不轮询、不把未导入当失败。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "视频素材包 SOP"` 通过。

### 6.18 2026-05-22 IP 场景延伸库结构化视图

已完成：

- IP 知识库页新增“IP 运营场景库”结构化面板，不再只展示 PromptDraft 列表。
- 每个延伸场景卡片显示场景用途、来源 IP 版本、延伸知识库是否已生成、提示词版本状态和下一步动作。
- 口播、私域、产品化、咨询回复等场景继续引用同一套 IP 六层知识库，状态从现有 `ip-scenario-kb` 输入源和 PromptDraft 派生，不新增平行数据源。
- “生成口播延伸库”等动作会生成延伸知识库输入源和对应提示词，生成后回到 IP 页可看到该场景从“待生成延伸知识库”变为“已确认 / 延伸知识库已生成”。
- 旧的“已生成的 IP 场景提示词”保留为追溯列表，但普通用户主判断入口改为结构化场景库卡片。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "IP 长文 SOP|IP 知识库能进入"` 通过。

### 6.19 2026-05-22 场景卡字段确认

已完成：

- 场景库页新增场景卡确认编辑器，用户可在下游 Prompt 前修正标题、人群、痛点、使用场景、画面构图、卖点、口播方向、图片素材建议和视频素材建议。
- 场景卡列表新增“待确认 / 已确认”状态，确认后复用现有 `updateSceneCard` 刷新 `updatedAt`，不新增平行状态表。
- 场景确认区保留来源提示词包、SOP、输入源和引用数量，避免普通用户只改文案却丢失事实来源。
- 品牌 / 产品知识库 -> 场景库 -> Prompt 组主链现在明确包含“生成并确认场景卡”步骤。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "品牌知识库能真实接到场景库"` 通过。
- `npm run test:e2e -- --grep "文章生成不会自动混入未显式选择的场景卡"` 通过。

### 6.20 2026-05-22 质检结果进入审核决策

已完成：

- 素材详情的“审核决策”面板新增“质检结果”，普通审核人员可以直接看到检查项、风险项、来源提醒和发布检查，不需要先理解生成日志结构。
- 审核决策从生成日志 `output.qualityChecklist / risks / sourceWarnings / publishCheck` 和嵌套 `analysis` 中提取结构化证据；没有结构化字段时，兜底读取关联 Prompt 草稿里的“质量检查 / 下游检查清单 / 风险与边界 / 来源与合规提醒”。
- 未接入自动质检的素材明确显示“未接入自动质检，按人工审核清单确认”，不伪造通过结论。
- 下一步建议会优先响应阻塞风险：有风险项时提示先处理风险或驳回回炉，避免用户误把可追溯当成可发布。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "小红书图片 SOP 运行详情可以进入图片工作台和素材审核"` 通过。
- `npm run test:e2e -- --grep "视频素材包 SOP"` 通过。

### 6.21 2026-05-22 场景提示词下游交接状态

已完成：

- 场景提示词页新增“下游交接”面板，普通用户可以在“内部下游 / 外部工具”之间明确选择，不再只看到复制按钮。
- 图片 Prompt 默认走内部图片生成，也可切到外部图片工具复制；复制后显示已复制到具体去向。
- 视频 Prompt 默认走第三方平台复制，可选择 RunningHub / Vidu / Runway / 可灵 / 其他第三方；复制后复用现有 `PromptDraft.copyCount / lastCopiedTarget`，成品视频导入页能继续识别“已复制待导入”。
- 文案和绿幕图用途只保留内部下游入口，避免把普通用户带到不存在的外部任务状态。
- 内部下游按钮会把当前 Prompt 草稿或选中单条 Prompt 带到图片、视频 Prompt、文章生成或绿幕文案图模块，继续沿用现有事实源和 blocked 规则。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "品牌知识库能真实接到场景库"` 通过。

### 6.22 2026-05-22 高级维护入口收敛

已完成：

- 左侧“管理”默认只暴露 `skills 管理` 和“高级维护”折叠入口，不再把 `工作流定义 / Canvas 编排` 当作普通用户一级可见任务。
- 展开“高级维护”后，内容工程师仍可进入 `工作流定义` 和 `Canvas 编排`；如果当前已经处于高级模块，导航会自动保持高级入口可见。
- SOP 工作流页默认只展示“执行表单 / 运行记录 / 高级维护”，定义管理和 Canvas 不再和普通执行 tab 平级抢占注意力。
- 展开 SOP 页内“高级维护”后，仍可进行定义管理和 Canvas 轻编辑，继续读写同一份 `WorkflowDefinition`，不新增平行事实源。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作"` 通过。
- `npm run test:e2e -- --grep "SOP 定义草案可以编辑"` 通过。

### 6.23 2026-05-22 真实验收参考来源类型证据强化

已完成：

- `buguai.v2-business-acceptance.v1` 输入模型新增 `reference.actualSourceKinds`，手工验收可直接提供 `image / video` 结构化来源类型，不再只能靠文件名或标题推断。
- `--workspace` 模式会优先从对标反推日志 `input.referenceSources[].kind / purpose / sourcePath` 提取来源类型；用户把素材命名为“素材 A / 素材 B”时，也能证明同时覆盖参考图和参考视频。
- `business-acceptance-input.example.json` 补充 `reference.actualSourceKinds` 示例，降低真实验收填写成本。

已补验证：

- `npm run test:functional -- --test-name-pattern "v2 业务验收"` 通过。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，报告为 34/34。
- `npm run verify:v2:acceptance` 通过，local-sample 报告为 34/34。

### 6.24 2026-05-22 Provider strict 诊断可读性

已完成：

- `buguai.v2-provider-check.v1` 每个 provider 检查项新增 `severity`、`requiredEnv`、`configured` 和 `nextAction`，报告可直接说明缺哪个环境变量、当前配置是否存在、下一步如何恢复。
- `strictGate` 新增 `nextActions`，把 `NETWORK_CHECK_NOT_ENABLED`、`MEDIA_CHECK_NOT_ENABLED`、blocked 和 failed provider 的恢复动作汇总到发布门槛层。
- 报告继续不输出密钥值，只输出布尔配置状态；provider 错误信息仍走脱敏。

已补验证：

- `npm run test:functional -- --test-name-pattern "provider"` 通过。
- `npm run verify:v2:providers` 通过；当前无 Key 环境返回 4 个 blocked，报告包含 `requiredEnv`、`configured` 和 `strictGate.nextActions`，未外发网络请求。

### 6.25 2026-05-22 成套验收证据目录

已完成：

- 新增 `npm run verify:v2:evidence`，通过 bundled runner 生成同一个证据目录，避免 Node 直接加载 `.ts` 共享模块导致 CLI 在不同本地版本下不稳定。
- `scripts/v2-acceptance-evidence.mjs` 会一次性写入 `provider-check.json`、`business-acceptance.json`、`manifest.json` 和 `SUMMARY.md`。
- `manifest.json` 使用 `buguai.v2-acceptance-evidence.v1`，记录验收模式、输入路径、输出文件、provider strict 要求、业务验收结果、建议重跑命令和 strict 恢复动作。
- 默认模式下无 Key / 无 provider 只表现为 provider blocked 诊断，不影响 local-sample 业务验收通过；显式 `--provider-strict` 时 provider strict 未过会退出非 0，但仍保留完整证据目录。
- `SUMMARY.md` 面向普通验收协作，直接展示 Provider 摘要、业务验收摘要和 Strict 恢复动作，不再让用户分别翻两个 JSON 报告。

已补验证：

- 功能测试断言默认无 Key 环境可生成 4 个证据文件且退出 0。
- 功能测试断言 strict 模式退出非 0 时仍写出完整证据目录。
- 功能测试断言外部验收输入模式下，`manifest.commands.business` 和 `manifest.commands.evidence` 会保留 `--input`，真实验收复跑不会退回 local-sample。
- `scripts/run-functional-tests.mjs` 已透传 Node test 参数，`--test-name-pattern` 等定向验证命令不再被误跑成全量测试。
- `npm run test:functional -- --test-name-pattern "v2 验收证据"` 通过，仅执行 3 条 evidence 用例。
- `npm run test:functional` 通过，46/46。
- `npm run verify:v2:evidence -- --input docs/roadmap/v2/business-acceptance-input.example.json --output-dir /tmp/content-studio-v2-evidence-codex-input` 通过；当前无 Key 环境 provider 为 4 个 blocked，业务验收 35/35。
- `npm run typecheck` 通过。
- `npm run build` 通过。

### 6.26 2026-05-22 产品资料结构化普通用户入口

已完成：

- 新增 `src/shared/productBrief.ts`，从产品资料 / SKU 输入源中提取明示的产品名称、卖点、规格、适用场景、禁用表达和 SKU 行。
- 解析器只整理用户已写出的字段；缺少产品名称、规格 / SKU、场景 / 人群、禁用表达等内容时标记 `missingFields`，不做模板补全或编造。
- 输入源页新增“产品资料结构化 / 产品变量表”面板，普通用户登记产品 brief 后能直接看到变量表、待补字段和 SKU 预览。
- 面板给出去 Prompt 工作台、对标图反推和图片生成的下游入口，补齐 UC-05 到 US-01 / US-04 图片生产链路之间的断点。

已补验证：

- `npm run test:functional -- --test-name-pattern "产品资料输入源"` 通过，覆盖完整字段和缺失字段不编造。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作"` 通过，点击级验证输入源页登记产品资料后能看到产品变量表和下游入口。

### 6.27 2026-05-22 评论痛点聚类普通用户入口

已完成：

- `InputSourcePurpose` 新增 `user-feedback`，和 v2 工作流模型中的 `user-feedback` 对齐。
- 新增 `src/shared/userFeedbackInsights.ts`，从评论、差评、客服问题和私信输入源中提取真实原声，并按价格信任、使用门槛、人群禁忌、场景需求、售后包装、竞品对比等维度聚类。
- 输入源页新增“评论痛点聚类 / 用户问题矩阵”面板，普通用户登记评论后可以看到痛点分类、证据示例、推荐标签、选题方向、客服异议处理话术和 `痛点 x 人群 x 场景 x 内容角度` 矩阵。
- Prompt 工作台、工作流输入源选择和视频提示词来源已把 `user-feedback` 纳入可用事实源，评论痛点能继续进入标题、文案、Prompt 和 SOP。
- 聚类只引用用户输入的原声；未识别到明确类型时归入“待人工归类的真实问题”，不编造痛点。

已补验证：

- `npm run test:functional -- --test-name-pattern "用户反馈输入源"` 通过，覆盖痛点聚类、选题方向、客服异议话术和标签。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作"` 通过，点击级验证输入源页登记评论后能看到用户问题矩阵和下游标题入口。

### 6.28 2026-05-22 业务验收纳入产品资料与用户反馈

已完成：

- `scripts/v2-business-acceptance.mjs` 复用 `structureProductBriefSources` 和 `clusterUserFeedbackSources`，业务验收报告新增 `productBrief` 与 `feedback` 两个 section。
- `productBrief` 验收产品名称、卖点、规格 / SKU、适用场景、禁用表达、SKU 行和变量表下游可用性；缺字段仍作为 `missingFields` 暴露，不编造通过。
- `feedback` 验收价格信任、使用门槛、人群边界、场景需求等关键痛点聚类，检查痛点矩阵、推荐标签、标题方向、客服异议话术和示例是否来自评论原声。
- `--workspace` 模式新增读取 `.content-studio/input-sources.json`，能从真实工作区输入源自动提取产品资料、SKU 表和用户反馈，不再依赖手工清单补证据。
- `docs/roadmap/v2/business-acceptance-input.example.json` 已加入产品资料和评论反馈样例，真实验收可按同一 schema 复跑。

已补验证：

- `npm run test:functional -- --test-name-pattern "v2 业务验收"` 通过，覆盖 local-sample、外部输入、真实目录证据和工作区自动提取四种模式。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 35/35；当前无 Key 环境 provider 为 4 个 blocked。
- `npm run verify:v2:acceptance` 通过，local-sample 业务验收 35/35；当前无 Key 环境 provider 为 4 个 blocked。
- `npm run verify:v2:evidence -- --input docs/roadmap/v2/business-acceptance-input.example.json --output-dir /tmp/content-studio-v2-evidence-codex-input` 通过，成套证据目录中的 business summary 为 35/35。
- `npm run test:functional` 通过，46/46。
- `npm run typecheck` 通过。
- `npm run build` 通过。

### 6.29 2026-05-22 业务验收纳入参考视频拆解

已完成：

- `scripts/v2-business-acceptance.mjs` 新增 `videoBreakdown` section，覆盖 UC-04 的“参考视频 -> 拆解报告 -> 新视频脚本 / 视频 Prompt”路径。
- 验收会检查参考视频来源、拆解片段字段、可复用公式、授权 / 照搬 / 合规风险、分镜脚本、视频 Prompt、发布检查和拆解来源关联。
- `--workspace` 模式会从 `.content-studio/generation-logs.json` 的 `video-breakdown` 和 `video-script` 成功日志自动提取证据，避免真实工作区仍靠手填清单。
- `docs/roadmap/v2/business-acceptance-input.example.json` 已加入参考视频拆解和新脚本样例，真实验收可按同一 schema 补齐。
- `VideoModule` 普通用户文案从“视频复刻 / 下载”收敛为“参考视频拆解 / 不下载平台视频 / 不照搬竞品元素”，和 PRD 边界一致。

已补验证：

- `npm run test:functional -- --test-name-pattern "v2 业务验收"` 通过，覆盖 local-sample、外部输入、真实目录证据和工作区自动提取四种模式。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 35/35；当前无 Key 环境 provider 为 4 个 blocked。
- `npm run verify:v2:acceptance` 通过，local-sample 业务验收 35/35；当前无 Key 环境 provider 为 4 个 blocked。
- `npm run verify:v2:evidence -- --input docs/roadmap/v2/business-acceptance-input.example.json --output-dir /tmp/content-studio-v2-evidence-codex-input` 通过，成套证据目录中的 business summary 为 35/35。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "参考视频拆解三步工作台使用真实 blocked 分支，不伪造视频结果"` 通过。
- `npm run test:functional` 通过，46/46。

### 6.30 2026-05-22 跨产物 runId 覆盖关键产物

已完成：

- `scripts/v2-business-acceptance.mjs` 将默认追溯源扩展为 `reference-log`、`video-breakdown-log`、`video-script-log`、`video-generation-log`、`mix-package` 和 `platform-draft`。
- `trace` 分区新增 `workflow-run-trace-coverage` 检查；它只负责证明关键产物证据齐全，`workflow-run-trace-consistent` 仍负责证明这些证据没有分叉到不同 `workflowRunId`。
- `local-sample`、外部输入示例和 workspace 自动提取都已补齐视频拆解、视频脚本和视频生成日志的 runId 证据，避免“拆了参考视频，但后续脚本 / 成品视频不属于同一条 SOP”的断链问题。
- 功能测试新增覆盖：关键产物齐全时通过，缺少关键产物证据或 runId 分叉时失败。

已补验证：

- `npm run verify:v2:evidence -- --input docs/roadmap/v2/business-acceptance-input.example.json --output-dir /tmp/content-studio-v2-evidence-codex-input` 通过；当前无 Key 环境 provider 为 4 个 blocked，业务验收 40/40。
- `npm run verify:v2:acceptance` 通过，local-sample 业务验收 40/40；当前无 Key 环境 provider 为 4 个 blocked。
- `npm run test:functional` 通过，46/46。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作|参考视频拆解三步工作台使用真实 blocked 分支，不伪造视频结果"` 通过，2/2。
- `git diff --check -- scripts/v2-business-acceptance.mjs docs/roadmap/v2/business-acceptance-input.example.json docs/roadmap/v2/completion-audit.md docs/roadmap/v2/implementation-plan.md tests/functional/content-flow.test.mjs src/renderer/src/components/modules/VideoModule.tsx tests/e2e/electron-app.spec.mjs` 通过。

### 6.31 2026-05-22 业务验收纳入成功素材回炉

已完成：

- `scripts/v2-business-acceptance.mjs` 新增 `successfulAsset` 分区，覆盖 `US-10 / UC-14` 的“通过审核素材 -> 成功素材输入源 -> 可复用 PromptDraft -> SOP 运行回写”路径。
- 验收会检查素材先通过审核、沉淀输入源为 `successful-asset` 且带 `prompt-distilled` 标签、原素材路径和原 Prompt 关联、生成确认态图片 / 视频 PromptDraft，并保留“不复制竞品 / 人工确认”复用边界。
- `--workspace` 模式新增读取 `.content-studio/prompt-drafts.json` 和 `.content-studio/workflow-runs.json`，并结合 `input-sources.json` 与 `asset-reviews.json` 自动提取成功素材沉淀证据；带 `prompt-distilled` 的输入源只作为 Prompt 追溯，不会重新进入媒体候选。
- `docs/roadmap/v2/business-acceptance-input.example.json` 已加入 `successfulAsset.actual` 样例，真实验收可按同一 schema 补齐。

已补验证：

- `npm run test:functional -- --test-name-pattern "v2 业务验收"` 通过，覆盖 local-sample、外部输入、真实目录证据和工作区自动提取四种模式。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 40/40；当前无 Key 环境 provider 为 4 个 blocked。
- `npm run verify:v2:acceptance` 通过，local-sample 业务验收 40/40；当前无 Key 环境 provider 为 4 个 blocked。
- `npm run verify:v2:evidence -- --input docs/roadmap/v2/business-acceptance-input.example.json --output-dir /tmp/content-studio-v2-evidence-codex-input` 通过；当前无 Key 环境 provider 为 4 个 blocked，业务验收 40/40。
- `npm run test:functional` 通过，46/46。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- `git diff --check -- scripts/v2-business-acceptance.mjs docs/roadmap/v2/business-acceptance-input.example.json docs/roadmap/v2/completion-audit.md docs/roadmap/v2/implementation-plan.md tests/functional/content-flow.test.mjs` 通过。

### 6.32 2026-05-22 业务验收纳入绿幕文案图

已完成：

- `scripts/v2-business-acceptance.mjs` 新增 `greenScreen` 分区，覆盖 `US-06 / UC-10` 的“口播脚本 / 卖点 -> 标题卡、卖点卡、CTA 卡 -> 绿幕文案图 -> 审核 -> 混剪清单”路径。
- 验收会检查绿幕卡类型是否包含 `title`、`selling-point` 和 `cta`，字段是否包含 `type`、`title`、`text`、`durationSeconds`、`assetPath`、`background`、`aspectRatio` 和 `promptDraftId`。
- 绿幕卡必须是 `background=green-screen`、`aspectRatio=9:16`，资产路径必须进入 `overlays/` 或 SVG / PNG / WebP 等可打包文件；文案超过可读长度会失败，避免普通用户拿到不可读的叠加字幕图。
- 绿幕卡必须通过审核；混剪包验收从“至少有视频素材”升级为“视频素材 + 绿幕图素材”同时存在，manifest 里的 overlay `packagedPath` 必须指向真实文件。
- `--workspace` 模式新增读取 `.content-studio/overlay-cards.json`，并结合 `.content-studio/asset-reviews.json` 自动提取绿幕卡审核状态；真实工作区不需要另建人工表格补证据。
- `docs/roadmap/v2/business-acceptance-input.example.json` 已加入 `greenScreen.actualCards` 样例，并把混剪包素材类型补齐为 `video` 和 `overlay`。

已补验证：

- `npm run test:functional -- --test-name-pattern "v2 业务验收"` 通过，覆盖 local-sample、外部输入、真实目录证据和工作区自动提取四种模式。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 45/45；当前无 Key 环境 provider 为 4 个 blocked。
- `npm run verify:v2:acceptance` 通过，local-sample 业务验收 45/45；当前无 Key 环境 provider 为 4 个 blocked。

### 6.33 2026-05-22 用户反馈验收补齐标题方向和客服异议

已完成：

- `src/shared/userFeedbackInsights.ts` 在痛点聚类之外新增 `objectionResponses`，每条话术保留痛点、异议原声、目标人群、场景、回复建议、证据和回复边界。
- 评论行提取不再把输入源标题当成用户原声；只有缺少正文和摘要时才用标题兜底，避免把“评论和客服问题”这类标题误算成真实反馈。
- `InputSourcesModule` 的“用户问题矩阵”面板新增“客服异议处理”，普通运营登记评论或客服问题后可以直接看到可复核的回复话术和边界。
- `scripts/v2-business-acceptance.mjs` 新增 `feedback-title-directions` 和 `feedback-objection-responses` 检查，业务验收不再只证明“聚类了”，还必须证明能支撑标题矩阵和客服异议处理。
- `docs/roadmap/v2/business-acceptance-input.example.json` 在 `feedback` 中补充 `expectedTitleMinimum` 和 `expectedObjectionMinimum`，真实验收可显式提高标题方向和异议话术数量门槛。

已补验证：

- `npm run test:functional -- --test-name-pattern "用户反馈输入源|v2 业务验收"` 通过，覆盖用户反馈解析、local-sample、外部输入、真实目录证据和工作区自动提取。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 47/47；当前无 Key 环境 provider 为 4 个 blocked。

### 6.34 2026-05-22 产品资料验收补齐三类图片 Prompt 追溯

已完成：

- `src/shared/productBrief.ts` 新增 `buildProductBriefPromptPlan`，从结构化产品资料确定性生成主图、卖点图和详情页模块三类 Prompt。
- 每条 Prompt 保留产品名称、卖点、适用场景、禁用表达、输入源 ID 和 SKU / 规格追溯；缺字段仍沿用 `missingFields` 暴露，不编造产品事实。
- `InputSourcesModule` 的“产品变量表”面板新增“下游 Prompt 交付”，普通电商运营登记产品 brief / SKU 后能直接看到三类可进入图片链路的 Prompt。
- `scripts/v2-business-acceptance.mjs` 新增 `product-brief-prompt-plan` 和 `product-brief-prompt-trace` 检查，业务验收不再只证明变量表存在，还必须证明变量表能支撑主图、卖点图和详情页模块 Prompt，并保留输入源 / SKU 追溯。
- `docs/roadmap/v2/business-acceptance-input.example.json` 在 `productBrief` 中补充 `expectedPromptTypes`，真实验收可显式要求三类图片 Prompt。

已补验证：

- `npm run test:functional -- --test-name-pattern "产品资料输入源|v2 业务验收"` 通过，覆盖产品资料解析、Prompt 计划、local-sample、外部输入、真实目录证据和工作区自动提取。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 49/49；当前无 Key 环境 provider 为 4 个 blocked。

### 6.35 2026-05-22 混剪包补齐普通剪辑人员导入说明

已完成：

- `MixPackageStore` 导出混剪包时新增 `import-guide.md`，内容覆盖第三方混剪软件导入顺序、`videos/` / `overlays/` 目录、`manifest.csv` 对照方式、绿幕叠加和人工审核边界。
- `MixPackageRecord` 与 `RecordWorkflowManualEventInput` 新增 `importGuidePath`，视频素材包 SOP 的 `mix-package-exported` 事件会把导入说明路径写入 `artifactRefs` 和步骤输出。
- `MixExportModule` 的历史混剪包新增“打开导入说明”入口；普通用户不需要打开 JSON 也能把包交给剪辑人员。
- `scripts/v2-business-acceptance.mjs` 的 delivery 分区新增 `mix-package-import-guide` 检查，业务验收不再只证明 manifest 存在，还要求交付包有剪辑人员可读的导入说明。
- `--workspace` / 目录模式会从混剪包目录或 `.content-studio/mix-packages.json` 自动读取 `import-guide.md`，并校验第三方混剪软件、`manifest.csv`、`videos/`、`overlays/` 和人工审核边界。
- `docs/roadmap/v2/business-acceptance-input.example.json` 已补 `import-guide.md` 和 `actualGuideTerms` 样例，真实验收可直接按同一口径提交交付证据。

已补验证：

- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作"` 通过，1/1。
- `npm run test:functional -- --test-name-pattern "v2 业务验收|视频素材包 SOP"` 通过，5/5。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 50/50；当前无 Key 环境 provider 为 4 个 blocked。
- `npm run verify:v2:acceptance` 通过，local-sample 业务验收 50/50；当前无 Key 环境 provider 为 4 个 blocked。

### 6.36 2026-05-22 SOP 执行页前置必填输入校验

已完成：

- `WorkflowFeatureModule` 的表单化 SOP 执行页新增运行前缺口提示；缺少资料选择或用户意图时直接禁用“运行 SOP”并显示恢复路径。
- 前端不再只依赖定义里的 `required` 标记；`intent` 作为普通用户 SOP 执行的事实级必填字段，资料来源由“本次使用资料”选择承载。
- `WorkflowStore.startRun` 同步采用同一规则：没有 `inputSourceIds` 且没有补充资料说明时才认为缺少“资料来源”；已有明确 `inputSourceIds` 时，`source` 文本可以为空。
- E2E 已覆盖：SOP 页缺用户意图时禁用运行按钮，选择资料并填写用户意图后即允许运行。

已补验证：

- `npm run test:functional -- --test-name-pattern "SOP 缺少必填输入|工作流运行会记录"` 通过，2/2。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作"` 通过，1/1。

### 6.37 2026-05-22 产品商业素材 SOP 落地

已完成：

- `WorkflowStore` 新增 `product-commercial-assets` 内置 SOP，把 US-04 / UC-05 从输入源页的局部工具补成可运行工作流：产品资料 / SKU -> 结构化产品变量 -> 主图、卖点图、详情页模块 Prompt -> 真实图片 provider -> 人工审核 -> 素材库。
- `WorkflowStepKind` 新增 `structure-product-brief`，`WorkflowEngine` 复用 `structureProductBriefSources` 和 `buildProductBriefPromptPlan` 生成确定性的产品变量表和三类 Prompt，不依赖文字 provider 才能完成产品事实结构化。
- 产品字段缺失时，运行停在 `product_brief_structure` 并输出缺失字段；不会继续生成 Prompt、图片或伪造 SKU / 卖点。
- 结构化成功后生成 confirmed `PromptDraft`，内容保留产品资料、SKU 行、输入源和 Prompt 版本追溯；后续 `prompt_generate` 复用同一草稿，图片生成继续遵守真实 provider blocked 规则。

已补验证：

- `npm run test:functional -- --test-name-pattern "产品商业素材"` 通过，2/2。
- `npm run test:functional` 通过，49/49。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作"` 通过，1/1。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 50/50；当前无 Key 环境 provider 为 4 个 blocked。

### 6.38 2026-05-22 评论痛点选题 SOP 落地

已完成：

- `WorkflowStore` 新增 `feedback-topic-matrix` 内置 SOP，把 US-11 从输入源页的局部洞察面板补成可运行工作流：评论 / 差评 / 客服问题 / 私信 -> 痛点聚类 -> 选题方向 -> 客服异议话术 -> 文案 Prompt -> 人工审核 -> 入历史。
- `WorkflowStepKind` 新增 `cluster-user-feedback`，`WorkflowEngine` 复用 `clusterUserFeedbackSources` 生成确定性的痛点矩阵、推荐标签、选题方向和客服异议话术，不依赖文字 provider 才能完成真实反馈结构化。
- 缺少真实反馈或反馈证据不足时，运行停在输入或 `feedback_cluster` 步骤；不会继续生成标题、文案 Prompt 或凭空客服结论。
- 聚类成功后生成 confirmed `PromptDraft`，内容保留用户原声、痛点 x 人群 x 场景 x 内容角度矩阵、客服人工复核边界、输入源和 Prompt 版本追溯。

已补验证：

- `npm run test:functional -- --test-name-pattern "评论痛点选题"` 通过，2/2。
- `npm run test:functional` 通过，51/51。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作"` 通过，1/1。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 50/50；当前无 Key 环境 provider 为 4 个 blocked。

### 6.39 2026-05-22 绿幕文案图 SOP 接入运行时

已完成：

- `WorkflowStore` 新增 `green-screen-card-package` 内置 SOP，把 US-06 / UC-10 从绿幕页面单点能力补成可运行工作流：口播脚本 / 卖点 / CTA -> 绿幕文案 Prompt -> 本地 9:16 SVG 绿幕卡 -> pending 审核 -> 入素材库。
- `WorkflowEngine` 的 `overlay-generate` 不再只停留在 queued；接入 `OverlayCardStore` 后可直接生成标题卡、卖点卡和行动卡，并把 `overlay-card:*`、SVG 路径和 `asset-review:*` 写入运行记录。
- 执行器优先读取用户输入源里的显式“标题卡 / 卖点卡 / CTA”行，避免 Prompt 草稿模板污染绿幕卡内容。
- 脚本或卖点不足时，`overlay_cards` 步骤 blocked 并要求补充口播脚本、卖点列表或 CTA 文案，不生成不可读或不可追溯的绿幕图。

已补验证：

- `npm run test:functional -- --test-name-pattern "绿幕文案图 SOP"` 通过，2/2。
- `npm run test:functional` 通过，53/53。
- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作"` 通过，1/1。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，业务验收 50/50；当前无 Key 环境 provider 为 4 个 blocked。

### 6.40 2026-05-22 真实服务工作区产物验收收敛

已完成：

- 新增功能测试用真实 `WorkflowEngine`、`InputSourceStore`、`PromptDraftStore`、`OverlayCardStore`、`AssetReviewStore`、`MixPackageStore` 和 `PlatformDraftStore` 写出 `.content-studio` 工作区产物，再通过 `loadWorkspaceAcceptanceInput(workspacePath)` 进入同一套 `buguai.v2-business-acceptance.v1` 报告。
- 该用例覆盖品牌场景 SOP、IP 内容 SOP、产品商业素材 SOP、评论痛点选题 SOP、绿幕文案图 SOP 和视频素材包 SOP，验证 `US-04 / UC-05`、`US-06 / UC-10`、`US-08 / UC-12`、`US-10 / UC-14`、`US-11` 不再只靠手写 JSON fixture 证明。
- 混剪包、平台草稿包、成功素材沉淀和跨产物 `workflowRunId` 均使用真实 store 写入的文件和 manifest，验收脚本会校验真实包内文件存在、审核状态为 approved、导入说明包含第三方混剪边界、平台草稿保留人工发布边界。
- 修正 `BrandKnowledgeBaseStore` 合规兜底：无模型或模型漏字段时，品牌知识库也会保留“治疗 / 专业建议”和“绝对化收益”两类硬边界，避免普通用户后续从场景库生成 Prompt 时丢失关键限制。

已补验证：

- `npm run test:functional -- --test-name-pattern "真实服务写入的工作区 SOP 产物|品牌和 IP 知识库可以从知识引用生成并落盘"` 通过，2/2。

### 6.41 2026-05-22 SOP 执行资料显式选择

已完成：

- `src/shared/inputSourcePolicy.ts` 抽出 SOP 输入源匹配规则，`useContentStudioApp` 和 `WorkflowFeatureModule` 共用同一套策略，避免运行 hook 和 UI 各自猜测应该使用哪些资料。
- SOP 执行页新增“本次使用资料”，按 SOP 类型展示候选产品资料、参考素材、评论 / 客服问题、品牌 / IP 知识库和任务输入，默认勾选推荐资料。
- 普通用户可在执行前取消或重新勾选资料；取消全部资料或没有可用候选时，运行按钮禁用，并显示“去输入源 / 文档转换”的恢复路径。
- 原 `source` 文本框已在 UI 中改为“补充资料说明”，有资料选择时不再必填；它只用于补充本次口径、平台、限制或未登记的临时说明，避免普通用户既选资料又被要求再写一遍“输入源”。
- `startWorkflowRun` 支持接收 UI 显式选择的 `inputSourceIds`；未传入时才回退到共享默认匹配，兼容旧调用。
- E2E 新增“产品商业素材 SOP 只写入用户勾选的产品资料，不误带评论资料，且不要求重复填写 source 文本”覆盖，防止后续又退回隐式全局筛选。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:functional -- --test-name-pattern "SOP 缺少必填输入|SOP 已选择输入源时补充资料说明可以为空|工作流运行会记录"` 通过，3/3。
- `npm run test:functional` 通过，55/55。
- `npm run test:e2e -- --grep "SOP 执行页显式选择资料|v2 新增入口能落到真实工作流动作|SOP 定义草案可以编辑"` 通过，3/3。
- `npm run verify:v2:acceptance` 通过，业务验收 50/50；当前无 Key 环境 provider 为 4 个 blocked。

### 6.42 2026-05-22 SOP 运行详情资料追溯可读化

已完成：

- `WorkflowFeatureModule` 的运行详情新增“本次资料来源”面板，直接展示本次 SOP 使用的输入源标题、用途、素材类型、状态和摘要。
- 运行详情区分普通用户选择的资料和系统为本次运行生成的“运行补充记录”；有用户资料时优先展示用户资料，补充记录只作为留档摘要，避免审核人员看到多个泛化“输入源”标签却不知道主资料是哪一个。
- 运行详情里的输入字段名从内部 key 改成中文业务名：`source` 显示为“补充资料说明”，`intent` 显示为“用户意图”，避免普通用户看到空的 `source` 后误判本次没有资料来源。
- E2E 覆盖产品商业素材 SOP 运行后，运行详情能看到“显式选择产品资料”，且看不到未勾选的评论资料。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:functional` 通过，55/55。
- `npm run test:e2e -- --grep "SOP 执行页显式选择资料|v2 新增入口能落到真实工作流动作|SOP 定义草案可以编辑"` 通过，3/3。
- `npm run verify:v2:acceptance` 通过，业务验收 50/50；当前无 Key 环境 provider 为 4 个 blocked。

### 6.43 2026-05-22 新增 SOP 运行后下一步动作补齐

已完成：

- `WorkflowFeatureModule` 为 `product-commercial-assets` 补齐按步骤状态判断的下一步动作：缺产品资料时去输入源 / 文档转换，商业图片 Prompt 已生成但图片 provider blocked 时进入图片工作台，待审或入库阶段进入素材审核。
- `WorkflowFeatureModule` 为 `feedback-topic-matrix` 补齐普通运营负责人路径：缺评论原声时去输入源 / 文档转换，痛点矩阵生成后进入 Prompt 工作台审核选题 Prompt，不再停在运行详情里看 JSON。
- `WorkflowFeatureModule` 为 `green-screen-card-package` 补齐短视频运营路径：缺脚本 / 卖点时去输入源 / 文档转换，Prompt 生成后进入绿幕文案图工作台，已生成待审素材时进入素材审核，完成后进入混剪包导出。
- `WorkflowRunAction` 新增 `open-input-sources`，只作为 SOP blocked 恢复路径使用，不新增一级导航，也不把普通用户带去 Canvas。
- E2E 覆盖产品商业素材 SOP 运行后点击“打开图片工作台”，评论痛点选题 SOP 点击“审核选题 Prompt”，绿幕文案图 SOP 点击“打开绿幕文案图”，验证新增 SOP 不再把普通用户丢在运行历史里。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:functional` 通过，55/55。
- `npm run test:e2e -- --grep "SOP 执行页显式选择资料|新增 SOP 下一步动作"` 通过，2/2。
- `npm run verify:v2:acceptance` 通过，业务验收 50/50；当前无 Key 环境 provider 为 4 个 blocked。

### 6.44 2026-05-22 真实混剪工具导入证据纳入验收

已完成：

- `scripts/v2-business-acceptance.mjs` 新增可选 `mix-package-external-import` 检查；默认 local-sample 不伪装外部导入成功，只有显式 `--require-external-mix-evidence` 或提供 `videoPackage.externalImportEvidence / import-evidence.json` 时才纳入业务验收。
- 外部导入证据必须包含第三方工具名、导入时间、已导入素材类型、manifest 是否导入、可复核证据文件；证据文件会解析为真实本地路径并检查是否存在。
- `--workspace` 或 `videoPackage.packageDir` 模式会自动读取混剪包目录里的 `import-evidence.json`，并把截图、录屏说明或验收记录文件纳入 `verifiedEvidenceFiles`；缺证据时显式失败，不再把 `import-guide.md` 当作真实导入成功。
- `scripts/v2-acceptance-evidence.mjs` 支持 `--require-external-mix-evidence`，成套证据目录的 manifest / SUMMARY 会记录是否要求真实混剪导入证据。
- 新增 `docs/roadmap/v2/mix-import-evidence.example.json`，用于真实剪辑人员按同一 schema 提交剪映、CapCut、Premiere 或其他混剪工具的导入证据。

已补验证：

- `node --check scripts/v2-business-acceptance.mjs` 通过。
- `node --check scripts/v2-acceptance-evidence.mjs` 通过。
- `npm run test:functional -- --test-name-pattern "v2 业务验收脚本支持外部真实素材输入|v2 业务验收脚本可从真实交付包目录自动提取证据"` 通过，2/2。
- `npm run verify:v2:acceptance` 通过，默认 local-sample 仍为 50/50，当前无 Key 环境 provider 为 4 个 blocked。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json` 通过，external-input 仍为 50/50。
- `npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json --require-external-mix-evidence` 按预期失败，新增 `mix-package-external-import` 检查显示缺少真实第三方导入证据，50/51。
- `npm run test:functional` 通过，55/55。
- `npm run test:e2e` 通过，19/19；已同步 E2E 选择器到普通用户界面的“沉淀为 Skill / SOP”文案，并对图片模板“导入”按钮做精确匹配，避免与侧栏“成品视频导入”混淆。

### 6.45 2026-05-22 真实工作区闭环验收门槛

已完成：

- `scripts/v2-business-acceptance.mjs` 新增 `--require-real-workspace-evidence` / `--require-real-business-evidence`；默认 local-sample 仍只做本地结构回归，显式 strict 时才新增 `real-workspace-evidence` 检查。
- `real-workspace-evidence` 会拒绝 local-sample、外部手填清单和 provider dry-run 被当成 v2 完成证据；它要求真实 `--workspace`、真实产品资料 / 评论反馈 / 参考图视频、视频拆解、绿幕图审核、成功素材沉淀、混剪包实存文件、平台草稿包、runId 一致性和 provider strict 均成立。
- `scripts/v2-acceptance-evidence.mjs` 支持 `--require-real-workspace-evidence`，并把该要求写入 `manifest.json`、`SUMMARY.md` 和建议重跑命令。
- `SUMMARY.md` 新增“业务失败项”和“业务恢复动作”，普通用户不用打开 JSON 也能看到缺少哪些真实资料、混剪包文件、平台草稿包或 provider strict 证据。
- 若无真实工作区或真实 provider strict 证据，新增门槛会明确失败并给出下一步，不再把样例素材或 `sample-*` / “示例”内容当作完成。

已补验证：

- `node --check scripts/v2-business-acceptance.mjs` 通过。
- `node --check scripts/v2-acceptance-evidence.mjs` 通过。
- `npm run test:functional -- --test-name-pattern "v2 验收证据 CLI 真实工作区门槛|v2 业务验收脚本覆盖本地 sample 主链口径|v2 业务验收脚本支持外部真实素材输入"` 通过，3/3。
- `npm run test:functional` 通过，56/56。
- `npm run verify:v2:acceptance` 通过，默认 local-sample 仍为 50/50。
- `npm run verify:v2:acceptance -- --require-real-workspace-evidence` 按预期失败，新增 `real-workspace-evidence` 检查显示缺真实工作区、实存混剪包 / 平台草稿包和 provider strict 证据，50/51。
- `npm run verify:v2:evidence -- --require-real-workspace-evidence --output-dir .tmp/v2-real-evidence-gate` 按预期失败并保留证据目录，manifest 显示 `requireRealWorkspaceEvidence=true`。
- `.tmp/v2-real-evidence-gate/SUMMARY.md` 已抽查，包含 `realEvidence` 失败项、缺口列表和业务恢复动作。

### 6.46 2026-05-22 strict 重跑命令对齐真实发布门槛

已完成：

- `scripts/v2-acceptance-evidence.mjs` 的 `manifest.commands.provider` 不再固定输出 dry-run `npm run verify:v2:providers`；当证据 run 要求 provider strict 或已开启网络 / 媒体联调时，会输出带环境变量的 `npm run verify:v2:providers:strict`。
- `manifest.commands.evidence` 在 `--provider-strict` 下会带上 `--allow-network --allow-media`，避免用户照 `SUMMARY.md` 重跑时又退回 dry-run。
- `SUMMARY.md` 的建议重跑命令现在能对齐真实发布门槛：provider strict、真实工作区闭环和业务验收会在同一组命令里呈现。

已补验证：

- `node --check scripts/v2-acceptance-evidence.mjs` 通过。
- `npm run test:functional -- --test-name-pattern "v2 验收证据 CLI strict 失败|v2 验收证据 CLI 真实工作区门槛"` 通过，2/2。
- `npm run test:functional` 通过，56/56。
- `npm run verify:v2:evidence -- --provider-strict --require-real-workspace-evidence --output-dir .tmp/v2-strict-command-check` 按预期失败并保留证据目录；manifest 中 provider 命令为 `CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1 CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1 npm run verify:v2:providers:strict`。

### 6.47 2026-05-22 用户故事流程重审与 SOP 临时资料路径

已完成：

- 新增 `docs/roadmap/v2/user-story-flow-map.md`，把 US-01 到 US-16 逐条映射到普通用户入口、主按钮 / 关键动作、完成后下一步和仍缺的真实验收证据。
- SOP 表单修正为“已登记资料 + 临时粘贴资料”双入口：有匹配输入源时继续默认勾选；没有匹配输入源或用户临时补 brief / 评论 / 脚本时，只要“补充资料说明”有内容即可运行。
- 临时资料不绕过追溯：后端已有 `executeInputStep` 会把 `source` 文本登记为 `workflow-run` 输入源，本轮前端不再误禁用这条路径。
- 运行按钮仍保持守门：既没有勾选资料，也没有粘贴临时资料时继续禁用，并显示去“输入源 / 文档转换”的恢复路径。
- E2E 覆盖产品商业素材 SOP：取消推荐产品资料后运行按钮禁用；粘贴临时产品资料后按钮恢复可用并提示“已粘贴临时资料，将自动留痕”；清空后再次禁用。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:functional` 通过，56/56。
- `npm run test:e2e -- --grep "SOP 执行页显式选择资料"` 通过，1/1。
- `npm run verify:v2:acceptance` 通过，默认 local-sample 仍为 50/50；当前无 Key 环境 provider 为 4 个 blocked。
- `git diff --check` 通过。

### 6.48 2026-05-22 缺口补齐清单抽查

已完成：

- `npm run verify:v2:evidence -- --provider-strict --require-real-workspace-evidence --output-dir .tmp/v2-missing-evidence-check` 按预期失败并保留证据目录。
- `.tmp/v2-missing-evidence-check/MISSING_EVIDENCE.md` 已抽查，包含 Provider 待补、业务待补、真实工作区验收门槛、`--workspace` 真实工作区要求、真实 provider strict 重跑命令和 evidence 重跑命令。
- 缺口清单明确拒绝把 local-sample、手填外部清单、provider dry-run、sample / 示例内容当作 v2 完成证据。

已补验证：

- `sed -n '1,220p' .tmp/v2-missing-evidence-check/MISSING_EVIDENCE.md` 已抽查。

### 6.49 2026-05-22 普通用户可见文案与追溯入口收敛

已完成：

- 普通用户界面不再直接暴露 `blocked`、`PromptDraft`、`Artifact 引用`、`WorkflowRun` 等工程词；运行状态统一显示“待配置 / 待解析 / 待补充”，底层状态码不变。
- SOP 运行详情的产物入口从“打开 Prompt 草稿 / Artifact 引用”收敛为“打开提示词草稿 / 产物引用”，并保留真实步骤输出和 runId 追溯。
- 平台草稿包、文章草稿包和混剪素材候选的按钮从单独的 `Prompt` 收敛为“提示词”，普通用户不用识别内部对象名。
- 对标图反推、Prompt 工作台、绿幕文案图、视频生成、场景提示词和 v2 功能说明中的“provider / blocked / PromptRef / inputSchema”等可见描述改成“生成服务 / 待配置 / 提示词来源 / 输入字段”等业务表达。
- `docs/roadmap/v2/user-story-flow-map.md` 同步说明：`blocked` 仅保留为底层状态码，普通用户必须看到恢复路径，而不是错误码。

已补验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:e2e -- --grep "视频素材包 SOP|品牌 SOP 运行详情|IP 长文 SOP"` 通过，3/3。
- `npm run test:e2e -- --grep "小红书图片 SOP"` 通过，1/1。

### 6.50 2026-05-22 混剪包第三方导入证据 App 内登记入口

已完成：

- `US-08 / UC-12` 从“导出混剪包后手工放 JSON”推进为普通用户可操作流程：历史混剪包卡显示“待登记导入证据 / 导入证据已登记”，可直接登记第三方工具、导入时间、验收人、素材类型、文件数、manifest 核对、时间线 / 工程创建、验收结果、证据文件和备注。
- 主进程 `MixPackageStore.recordImportEvidence` 会在混剪包目录写入 `import-evidence.json` 和 `import-check.md`，并更新 `mix-packages.json` 里的 `externalImportEvidencePath / externalImportEvidence`。
- `recordWorkflowManualEvent` 新增 `mix-package-import-verified` 手工事件，视频素材包 SOP 会把导入证据路径和混剪包目录写入 `artifactRefs` 与 `export_manifest` 步骤输出。
- `MixExportModule` 的历史包展示改为普通用户词表：平台显示“第三方混剪软件 / 抖音 / 剪映”等业务名称，素材计数显示“图片 / 视频 / 绿幕”，不再暴露内部平台值或英文计数。
- E2E 覆盖视频素材包 SOP 主链：Prompt 复制、成品视频导入、绿幕图、审核、混剪包导出、登记导入证据、SOP 运行记录回写和本地证据文件实存。
- functional 覆盖 store 和 workflow：登记证据后确认 `import-evidence.json`、`import-check.md`、`mix-packages.json` 记录和 SOP `artifactRefs` 均能串起来。

边界：

- App 内表单只负责登记和留痕，不能替代真实剪映 / CapCut / Premiere 等第三方工具中的导入动作。
- 发布级 strict 验收仍需要真实截图、录屏或剪辑验收记录，并用 `npm run verify:v2:acceptance -- --workspace <工作区路径> --require-external-mix-evidence` 从真实工作区读取。

### 6.51 2026-05-22 视频 Prompt 临时资料追溯入口

已完成：

- `US-05 / UC-08` 的独立视频 Prompt 页不再允许“只有生成意图、没有任何业务资料”就生成孤立提示词。
- 视频 Prompt 页新增“本次资料”输入区，普通用户可直接粘贴产品卖点、参考素材说明、口播脚本或本地素材说明。
- 生成按钮守住三选一：已选场景卡、已勾选输入源、已粘贴本次资料；否则禁用并显示恢复路径。
- 使用“本次资料”生成时，前端先自动登记 `sop-input` 输入源，再把该输入源 ID 写入视频 Prompt 草稿，保证后续复制、成品导入、审核和混剪都能回到业务资料。
- E2E 覆盖无资料禁用、粘贴临时资料后可生成、临时资料自动登记、视频 Prompt 草稿引用该输入源。

边界：

- 临时资料只解决普通用户入口可用性和追溯问题，不能替代真实第三方平台复制、成品导入和真实素材审核证据。

### 6.52 2026-05-22 素材审核入库动作与追溯文案收敛

已完成：

- `US-07 / UC-11` 的素材审核台把普通用户主动作从“通过审核”收敛为“通过并入库”，状态和筛选同步显示“已通过并入库 / 已入库”，避免用户误以为审核后还要另找入库按钮。
- 素材详情页不再直接展示提示词 ID、运行记录 ID 或回炉 assetKey；改为“已关联提示词，可打开查看”“已关联运行记录，可打开查看”“原素材记录”等业务表达。
- 图片 SOP 手工事件的用户可见摘要从 `run 来源` 收敛为“运行来源”，底层 `workflowRunId / promptDraftId / assetKey / artifactRefs` 仍保留给追溯和验收脚本。
- 回炉链路保留：驳回原因 -> 回炉重做 -> 新素材通过并入库 -> 成功素材沉淀提示词。

边界：

- 当前仍需要真实素材质量、真实人工审核记录和真实 provider strict 证据，才能宣称 `US-07 / US-10` 在发布级真实业务中完成。

### 6.53 2026-05-22 文章平台草稿包交付动作闭环

已完成：

- `US-02 / UC-07` 的文章生成链路从“导出后显示本地路径”收敛为普通用户可理解的交付状态：导出成功显示“平台草稿包已导出”，说明包含正文稿、发布文案、格式指南、发布检查和追溯清单。
- 平台草稿包历史卡、Prompt 工作台派生交付物和 SOP 运行详情统一提供“复制发布文案”真实动作，不再用“复制稿”按钮打开文件。
- 新增 `readPlatformDraftCopyText` IPC / preload / store 能力，只允许从当前工作区的平台草稿包读取 `platform-copy.txt`，前端复制到剪贴板并显示“已复制”反馈。
- 平台草稿包 UI 统一提示“本地交付，不自动发布”，保留“打开草稿包”“提示词”“回到 SOP”“来源记录”等追溯入口，但不把 `platform-drafts` 路径作为普通用户成功文案。
- functional 覆盖草稿包导出后读取发布文案；E2E 覆盖文章导出成功文案、复制发布文案按钮和 SOP 运行详情内的平台草稿包追溯。

边界：

- 平台草稿包仍是本地交付物，不代表自动发布；真实发布验收需要用户在目标平台人工粘贴、补封面 / 配图 / 标签并做最终合规复核。

### 6.54 2026-05-22 Prompt 工作台普通用户词表收敛

已完成：

- Prompt 工作台输入源列表不再把 `manual-note`、`sop-input`、`markdownPath` 这类内部值直接展示给普通用户；改为“手动记录 / 任务输入 / 已生成可追溯转换稿”等业务词。
- 草稿列表、AI 会话列表和来源追溯从短任务 ID 收敛为“已关联 SOP”，保留点击跳转和底层 `workflowRunId` 追溯。
- AI 会话状态从 `active / draft-created / waiting-user / blocked` 收敛为“会话中 / 已生成草稿 / 待补充 / 待配置”。
- SOP / Skill 物化、成功素材回炉和错误提示中的 `PromptDraft` 改为“提示词草稿”，避免普通用户看到内部对象名。

边界：

- 当前只是 UI 词表和可理解性收敛；Prompt 工作台仍需要真实知识库全文读取、多轮调整记录和真实 provider 输出，才能证明 `US-02 / US-03` 发布级完成。

### 6.55 2026-05-22 输入源与 SOP 运行详情普通用户语义收敛

已完成：

- 输入源页的产品资料下游交付不再显示 sourceId 列表，改为“资料来源：资料标题”，手动登记文案也从“可追溯 Markdown”收敛为“可追溯转换稿”。
- SOP 定义卡和运行详情不再把 `published` 或 `workflowKey@version` 当作普通用户上下文；改为“已发布 / SOP vX”。
- SOP 运行详情的“输入、步骤输入、步骤输出”按业务字段格式化：提示词草稿、输入资料、审核记录、正文稿、发布文案、混剪包、导入证据等只显示“已关联 / 已导出 / 已生成 / 已登记”，不直接显示 ID、路径或原始数组。
- SOP 下一步动作继续从用户故事主路径出发：图片、商业素材、评论选题、绿幕图、品牌场景和 IP 长文统一使用“提示词草稿 / 提示词 / 正文稿”等普通用户词表。
- 素材回炉和产物快捷入口仍保留真实追溯，但普通用户只看到“原素材记录 / 新候选素材 / 已通过并入库 / 产物线索”等业务表达。

已补验证：

- `npm run typecheck` 通过。

边界：

- 这一刀只解决可见语义和详情页连贯性；真实业务完成仍取决于第 7 节列出的真实 provider、真实素材、真实工作区和第三方混剪导入证据。

### 6.56 2026-05-22 混剪交接与历史详情去工程化

已完成：

- 混剪包导出页不再把 manifest raw JSON 作为普通用户预览；改为“交接清单预览”，展示目标平台、图片 / 视频 / 绿幕数量和前几条素材标题。
- 历史混剪包的导入证据摘要不再直接显示本地证据路径；改为“导入证据已记录，可打开查看”，仍保留“打开导入证据”动作。
- 混剪交接按钮和表单文案从“打开 manifest / manifest 已导入或已核对”收敛为“打开清单 / 清单文件已导入或已核对”。
- v2 功能说明和混剪包默认备注从“manifest”收敛为“混剪清单 / 清单文件”，只在本地文件产物层保留 manifest 文件名。
- 视频素材包 SOP 下一步、产物快捷入口和绿幕文案图业务导轨统一使用“混剪清单 / 交付清单”，不再把 manifest 当作普通用户动作目标。
- 图片历史生成详情不再展示生成日志 ID；改为“生成文件 N 个 / 生成记录已保存”。
- 图片历史列表、素材候选和素材库的生成来源从 `local` / 原始模型值收敛为“本地生成服务 / 生成服务：xxx”，审核仍可看到来源但不直接暴露 provider 默认值。
- 视频 Prompt 和成品视频导入边界文案从“外部任务 ID / 任务 ID”收敛为“第三方任务编号”，继续明确软件不创建外部任务、不轮询第三方状态。

边界：

- 混剪包导出仍会在本地生成真实 manifest / CSV / 导入说明，供剪辑软件和验收脚本使用；这里只调整普通用户可见层，不削弱文件追溯。

### 6.57 2026-05-22 知识库与图片技能入口去配置化

已完成：

- 成型知识库主入口从“导入 DOCX / MD / JSON”收敛为“导入知识库文档”，说明聚焦 DOCX / Markdown 等知识库文档。
- 知识库提示词包和场景卡追溯从内部短 ID 收敛为“资料 N 份 / 已关联 SOP / 已关联提示词包”。
- 图片技能编辑弹窗默认打开“系统提示词”而不是原始配置；完整配置入口改名为“高级配置”，明确面向内容工程师。
- 图片技能编辑说明和错误文案从 `JSON / payload / prompts.system` 收敛为“高级配置 / 参数字段 / 系统提示词”，降低普通用户误入后的理解成本。
- E2E 已同步断言：图片技能编辑默认系统提示词页，知识库导入按钮显示“导入知识库文档”。

边界：

- 底层图片技能仍用结构化配置保存，内容工程师可在高级配置里直接编辑；本轮只调整普通用户默认路径和可见文案，不删除高级能力。

### 6.58 2026-05-22 主链追溯位去内部枚举和短 ID

已完成：

- 品牌 / 产品知识库和 IP 知识库当前来源从 `source:id` 组合收敛为“产品型 / 个人 IP 型”业务标签。
- 品牌 / IP 知识库版本状态从 `ready` 收敛为“已抽取 / 已构建”；IP 场景延伸不再展示短 IP 版本 ID，改为“已关联同一 IP 知识库版本”。
- IP 场景延伸结果和场景提示词版本列表不再展示 `image / video / article` 用途枚举或短任务 ID；改为“图片提示词 / 视频提示词 / 文案提示词 / 已关联 SOP / 资料 N 份”。
- 对标图反推输入源、素材库导入标签、混剪候选标签和知识引用标题统一显示“图片 / 视频 / 文档 / 任务输入”等业务词，不把 `manual-note`、`sop-input` 或原始 kind / purpose 当用户上下文。
- 右侧最近生成记录、图片历史详情和生成结果详情统一使用“本地生成服务 / 生成服务：xxx / 生成服务待配置 / 本地规则草稿”展示模型来源，不直接显示 `local`、`blocked:*` 或 `fallback:*`。
- SOP 高级维护页把“输入字段 JSON / 执行步骤 JSON”收敛为“输入字段（高级配置）/ 执行步骤（高级配置）”，错误提示改为“列表格式”；Canvas 节点卡片显示能力类型、输出项数量和上游步骤数量，不把节点 ID、输出 key 列表作为主文案。

边界：

- 高级维护和本地文件层仍保留结构化定义、ID、路径和 manifest 文件名，用于内容工程师维护、验收脚本和第三方交接；本轮只收敛普通用户可见表达。

### 6.59 2026-05-22 视频三步工作台改为 Prompt 交接主路径

已完成：

- 参考视频拆解工作台第三步从“视频生成 / 生成视频队列”收敛为“Prompt 交接 / 打开视频 Prompt 交接”，普通用户主按钮不再默认创建内部视频任务。
- 打开交接会把当前视频 Prompt、脚本、分镜、参考素材、时长、画幅和“第三方生成后手动导入”边界登记为本次输入源，并创建已确认的视频 Prompt 草稿。
- 交接后的页面进入“视频 Prompt”工作台，沿用复制到第三方平台、记录复制动作、导入成品视频的 `US-05 / UC-08 / UC-09` 主路径。
- 视频入口和自定义视频 Prompt 入口的说明同步收敛为“生成视频 Prompt / 外部复制 / 成品手动导入”，不再把内部生成服务当默认步骤。
- 成品视频导入页在未选择视频 Prompt 或未记录复制动作时禁用导入按钮，并提示先复制视频 Prompt，避免绕过外部生成交接记录直接导入无关联成品。
- 内部视频生成保留为“可选：内部视频生成”，继续在未配置真实服务时走 blocked 分支和成本估算，不伪造视频结果。
- E2E 已同步断言：第三步主动作进入视频 Prompt 交接并产生可追溯输入源；可选内部生成仍记录真实 blocked 视频日志。

边界：

- 这一刀纠正的是三步工作台的默认流向；真实第三方平台复制、真实成品视频导入和真实素材审核仍属于第 7 节真实验收剩余项，不能据此宣称 v2 整体完成。

### 6.60 2026-05-22 成功素材沉淀和回炉 Prompt 去工程追溯字段

已完成：

- 驳回素材回炉时写入 Prompt 版本的内容从“原素材路径 / 原素材 Key”收敛为“原素材 / 原素材文件 / 审核记录已关联 / 回炉原因”，避免普通用户把 asset key 当作复用方法。
- 成功素材反向沉淀 Prompt 的素材来源从 `generation-log / input-source / SOP Run / 场景卡 ID 列表` 收敛为“生成记录 / 输入资料 / 已关联运行记录 / 场景卡 N 张”等业务语义。
- 底层 `assetKey / sourceId / workflowRunId / artifactRefs` 仍继续保留在 store、运行记录和验收脚本可读位置，不削弱 SOP 追溯。
- E2E 已补断言：视频素材包 SOP 的成品视频沉淀、图片 SOP 回炉后的成功素材沉淀，Prompt 编辑器里不能出现 `原素材 Key / SOP Run / generation-log / input-source`。

边界：

- 这一刀只处理 Prompt 正文的普通用户可读性；真实成功素材是否值得复用，仍需第 7 节真实素材质量、授权边界和回炉效果验收。

### 6.61 2026-05-22 场景提示词视频交接保留当前草稿上下文

已完成：

- 场景提示词页的“打开视频 Prompt”入口不再只切模块，而是先选中当前场景生成的视频 Prompt 草稿，再进入视频 Prompt 工作台。
- “去导入成品”会先选中当前视频 Prompt 草稿，再进入成品视频导入页；导入页继续使用复制状态控制是否允许导入。
- E2E 已补断言：从场景提示词复制到 Vidu 后点击“去导入成品”，导入页必须显示当前 Prompt 已复制状态、最近目标为 Vidu，且“导入并关联提示词”可用。

边界：

- 场景提示词复制到真实外部工具后的成品质量和导入证据，仍需按第 7 节真实外部工具验收补齐。

### 6.62 2026-05-22 产品商业素材 Prompt 和 Agent 上下文去内部追溯字段

已完成：

- 产品商业素材 SOP 生成的主图 / 卖点图 / 详情页模块 Prompt 正文不再写 source id、`追溯输入源` 或 `main-image` 这类内部用途枚举；普通用户只看到“追溯资料：已关联 N 份产品资料 / SKU 表”。
- 产品资料结构化生成的 Prompt 仍保留产品名、SKU / 规格、卖点、适用场景和禁用表达，底层 `sourceIds` 继续留在步骤输出和 `artifactRefs`，不削弱验收脚本追溯。
- Agent Prompt 会话和 Prompt 草稿生成上下文从 `kind / purpose / status`、本地转换稿路径、场景卡 ID 收敛为“产品资料 / 评论问题 / 参考素材 / 已登记 / 待补齐 / 已生成可追溯转换稿 / 场景卡 N 张”等业务语义，避免模型把工程字段写回用户可复用 Prompt。
- Skill 物化来源从“输入源 ID / 场景卡 ID”收敛为“输入资料 N 份 / 场景卡 N 张”。
- 视频素材包 SOP 运行摘要和导出步骤继续收敛为“混剪清单”，不把 manifest 当普通用户动作目标。
- E2E 已补断言：产品商业素材 SOP 打开图片工作台后，Prompt 内容必须包含资料追溯数量，且不能出现被选产品资料 source id、`追溯输入源` 或 `类型：main-image`。

边界：

- 这一刀只处理 Prompt 正文、Agent 上下文和 Skill 指令的普通用户语义；`US-04 / UC-05` 仍需要第 7 节真实产品 brief、SKU、参考详情页、真实图片生成和人工审核证据，不能据此宣称 v2 整体完成。

### 6.63 2026-05-22 SOP 启动资料来源接受已选知识引用

已完成：

- `WorkflowStore.startRun` 的必填校验不再只看“补充资料说明”和 `inputSourceIds`；当用户已选择知识引用时，`source` 可以为空，避免普通用户勾选知识库章节后还要重复粘贴资料名称。
- `WorkflowEngine.executeInputStep` 在只有知识引用、没有临时补充资料时，不创建空的 workflow-run 输入源；输入步骤摘要改为“已使用 N 条已选择知识引用”，下游通过 citations 追溯。
- 品牌知识库 -> 场景库 -> Prompt 组 functional 用例改为真正的知识引用主路径：`source` 留空，PromptPack、场景卡和 Prompt 草稿不要求 `inputSourceIds`，而是验证 citations 和场景卡引用不断链。
- 继续保留“已选择输入源时补充资料说明可以为空”和“用户粘贴临时资料 / 本地文件路径时自动留痕”的既有路径，避免把补充说明重新变成隐藏必填项。
- `scripts/v2-business-acceptance.mjs` 的产品 Prompt 追溯检查同步改为普通用户语义：底层必须保留 `sourceIds` 和 `sourceTrace`，用户可见 Prompt 必须显示“追溯资料”，且不能泄露 source id 或 `追溯输入源`。
- functional 覆盖新增“已选择知识引用时补充资料说明可以为空”，并加强产品资料 Prompt 断言：看得到资料数量追溯，看不到 source id 和内部追溯词。

验证：

- `npm run typecheck` 通过。
- `npm run test:functional` 通过，57/57。
- `npm run verify:v2:acceptance -- --output .tmp/v2-acceptance-debug.json` 通过，50/50。
- `npm run verify:v2` 通过；provider dry-run 仍按本地无 Key / 端点报告 4 个 blocked，业务验收 50/50。

边界：

- 这一刀修正的是普通用户“已选知识引用 / 已选资料后不再重复填补充说明”的主路径；真实知识库内容质量、真实 provider 返回和真实素材交付仍在第 7 节真实验收范围内。

### 6.64 2026-05-22 混剪导入说明和验收文件去 manifest 主任务化

已完成：

- `MixPackageStore` 生成的 `import-guide.md` 不再把 manifest 当作剪辑人员主任务；交付文件改为“清单文件 `manifest.json` / CSV 简表 `manifest.csv`”，导入步骤使用“清单文件 / 提示词来源”，交付边界改为“素材文件夹和清单文件”。
- 第三方导入验收 `import-check.md` 从“manifest 已导入”收敛为“清单文件已导入或已核对”，与 App 表单标签保持一致。
- 视频素材包 SOP 的测试用户意图、E2E 导入备注和 functional 用例名称同步改成“混剪清单 / 清单文件”，避免测试继续把旧词当普通用户路径。
- v2 README、PRD、workflow-model、user-story-flow-map、ui-blueprint、llm-playbook 和静态原型的产品描述同步从“混剪 manifest”改为“混剪清单”，只在底层文件契约、验收脚本和文件名处保留 `manifest.json` / `manifest.csv`。
- 静态原型的混剪包预览不再展示 raw JSON，改为展示平台、素材数量、审核状态和提示词来源摘要；素材库和成品视频导入文案也从 `PromptRef / Prompt 来源` 收敛为“提示词来源”。
- `mix-import-evidence.example.json` 的备注示例使用“提示词来源”，避免第三方导入证据模板继续传播旧词。

验证：

- `npm run typecheck` 通过。
- `npm run build` 通过。
- `npm run test:functional` 通过，57/57。
- `npm run test:e2e` 通过，20/20。
- `npm run verify:v2` 通过；provider dry-run 仍按本地无 Key / 端点报告 4 个 blocked，业务验收 50/50。
- `node -e "JSON.parse(require('fs').readFileSync('docs/roadmap/v2/mix-import-evidence.example.json','utf8')); console.log('mix-import-evidence.example.json ok')"` 通过。
- `git diff --check` 通过。

边界：

- 文件名和机器可读字段仍保留 `manifestPath / manifestCsvPath / manifestImported`，用于第三方交接格式、验收脚本和历史兼容；本轮只修普通用户可读文案和生成的交接说明。

### 6.65 2026-05-22 静态原型去 blocked 状态主路径化

已完成：

- `docs/roadmap/v2/prototype/README.md` 的统一状态契约从 `blocked` 改为“待配置”，US-08 映射从 manifest 导出改为混剪清单导出。
- `docs/roadmap/v2/prototype/index.html` 中普通用户可见的失败状态从 `blocked` 收敛为“待配置 / 待处理 / 可重试”，并把图片 / 视频 provider 文案改为“生成服务”。
- `src/renderer/src/app/v2FeatureTypes.ts` 不再允许 v2 功能入口状态使用 `blocked`，改为“待配置”；`V2FeatureModule` 只在“待配置”状态下使用 blocked 样式，避免后续 registry 把英文状态码显示给普通用户。
- `src/renderer/src/app/v2FeatureRegistry.ts` 的运行历史预览从 `run_20260520_001 / run_001` 改为“运行记录 / 运行记录 001”，避免 v2 入口页把内部运行编号当作普通用户上下文。
- 原型的运行历史、输入源转换、Provider 设置和右侧恢复路径均强调“显示恢复路径、不能伪造成果”，但不再要求普通用户理解底层状态码。
- 原型混剪包、素材库、成品视频导入和绿幕文案图继续使用“混剪清单 / 提示词来源”，避免后续原型迭代重新把 manifest 或 `PromptRef` 当作主对象。

验证：

- `rg -n "\\bblocked\\b|PromptRef|Prompt 来源|badge\\\">manifest|\\+ manifest|manifest 字段|导出 manifest|混剪 manifest|Provider 状态|选择 provider|provider 未配置|配置 provider" docs/roadmap/v2/prototype/README.md docs/roadmap/v2/prototype/index.html` 无结果。
- `rg -n "status: 'blocked'|status: \\"blocked\\"|V2FeatureStatus|feature.status === 'blocked'|feature.status === \\"blocked\\"" src/renderer/src/app src/renderer/src/components/modules/V2FeatureModule.tsx` 仅剩 `V2FeatureStatus` 类型定义，无可显示 `blocked` 状态。
- `rg -n "run_[0-9]|run_\\d|run_" src/renderer/src/app/v2FeatureRegistry.ts docs/roadmap/v2/prototype/index.html` 无结果。
- `npm run typecheck` 通过。
- `npm run test:e2e -- --grep "v2 新增入口能落到真实工作流动作"` 通过，1/1。
- `npm run build` 通过。
- `git diff --check` 通过。

边界：

- 这一刀只修原型契约和静态原型的普通用户可见语义；底层 provider dry-run、验收脚本和类型字段仍可保留英文状态码作为机器契约。

### 6.66 2026-05-22 SOP 运行产物线索不暴露 step key

已完成：

- `WorkflowFeatureModule` 的 `workflow-run:*:step:*` 产物引用不再显示“步骤快照 / input_register”这类内部步骤 ID，统一显示为“步骤快照”。
- `.content-studio/input-sources/<uuid>.md` 这类内部输入源转换稿路径不再显示 UUID 文件名，统一显示为“输入源转换稿”；混剪包目录和平台草稿包路径也继续显示为业务交付物。
- 产物线索的 hover title 不再使用原始 `artifactRef`，而是使用同一套业务标签；未知引用也不再截断显示内部字符串，统一显示“可追溯产物”。
- 自定义 SOP 发布并运行的 E2E 增加断言：运行详情的“产物线索”必须显示“步骤快照”和“输入源转换稿”，且正文与 title 都不能出现 `workflow-run:`、`input_register` 或 UUID `.md` 文件名。
- 该修正只改普通用户可见标签；底层 `artifactRefs` 仍保留 `workflow-run:<runId>:step:<stepId>`，用于审计和自动验收。

验证：

- `rg -n "步骤快照 /|workflow-run:.*步骤" src/renderer/src/components/modules/WorkflowFeatureModule.tsx out/renderer/assets` 仅显示 `workflow-run:` 分支返回“步骤快照”，无 step key 拼接输出。
- `npm run typecheck` 通过。
- `npm run build` 通过，并刷新 `out/renderer`。
- `npm run test:e2e -- --grep "SOP 定义草案可以编辑、发布并从表单运行"` 通过，1/1。
- `npm run test:e2e` 通过，20/20。

边界：

- 这一刀只处理运行详情里 `workflow-run:*` 产物引用的显示；其他 artifact 类型继续按既有映射显示为品牌知识库、提示词草稿、输入源、生成素材、清单文件等业务词。

### 6.67 2026-05-22 普通用户文案审计总闸

已完成：

- 新增 `scripts/v2-ux-copy-audit.mjs`，把 v2 普通用户可见面纳入固定审计，覆盖产品文档、静态原型、v2 功能入口、SOP 运行详情和混剪导入证据模板。
- `npm run verify:v2:ux-copy` 已接入 `npm run verify:v2`，后续本地 v2 总闸会同时检查 provider dry-run、业务验收报告和普通用户文案退化。
- 审计规则会阻断把 `blocked`、`provider`、`PromptRef`、`Prompt 来源`、`run_*`、manifest 主任务、步骤 key 或原始 artifactRef 重新暴露给普通用户的回退。
- 功能测试新增“v2 UX 文案审计会阻断普通用户可见工程词回退”，验证脚本既能通过当前仓库，也能在临时文件命中 `配置 Provider` 时失败并指出文件、行号和规则。
- 静态原型曾被该总闸拦出“配置 Provider”旧词，已改为“配置生成服务”，证明审计不是只做静态清单，而能拦真实回退。

验证：

- `npm run verify:v2:ux-copy` 通过，11 个文件、38 条规则。

边界：

- 这一刀解决的是“普通用户可见语言不能退回工程对象”的质量门槛；它不替代真实 provider strict、真实业务素材、真实工作区闭环和第三方混剪导入证据。

### 6.68 2026-05-22 smoke 验证对齐视频 Prompt 交接主路径

已完成：

- `scripts/electron-smoke.mjs` 的视频三步工作台点击路径从旧的“视频生成 / 生成视频队列”对齐到当前产品主路径“Prompt 交接 / 可选：内部视频生成”。
- smoke 仍保留无 provider 环境下的真实恢复验证：视频拆解无真实理解服务时必须提示待配置，脚本生成无文字模型时必须提示文字模型未配置，可选内部视频生成无视频服务时只能保存可追溯队列文件，不伪造视频素材。
- 该修正只更新验证脚本，不改 App 业务代码；当前 App 第三步仍以外部平台 Prompt 交接为普通用户主路径，内部视频生成是高成本备选能力。

验证：

- `npm run smoke:electron` 通过。

边界：

- smoke 只覆盖无 Key 环境的恢复路径和基础点击链；真实第三方平台复制、真实成品导入和真实混剪软件导入仍归入第 7 节真实验收。

### 6.69 2026-05-22 真实工作区门槛自动要求混剪导入证据

已完成：

- `scripts/v2-business-acceptance.mjs` 中 `--require-real-workspace-evidence` 会自动启用真实混剪工具导入证据检查，不再依赖用户额外记住 `--require-external-mix-evidence`。
- `scripts/v2-acceptance-evidence.mjs` 的 manifest、SUMMARY 和建议重跑命令会在真实工作区门槛下同时显示 `requireExternalMixEvidence=true` 和 `requireRealWorkspaceEvidence=true`。
- 最终发布门槛文档已统一为 `--provider-strict --require-real-workspace-evidence --require-external-mix-evidence --workspace <工作区路径>`，并说明真实工作区闭环会自动要求第三方混剪导入证据。
- 功能测试同步断言真实工作区门槛会阻断本地样例，并且失败项必须同时包含 `real-workspace-evidence` 和 `mix-package-external-import`。

验证：

- `npm run test:functional -- --test-name-pattern "v2 验收证据 CLI 真实工作区门槛|v2 业务验收脚本支持外部真实素材输入"` 通过。
- `npm run verify:v2:evidence -- --provider-strict --require-real-workspace-evidence --output-dir .tmp/v2-final-missing-evidence` 按预期失败；manifest 显示 `requireExternalMixEvidence=true`、`requireRealWorkspaceEvidence=true`，业务验收 50/52，失败项包含“真实工作区验收门槛”和“真实混剪工具导入证据”。

边界：

- 这一刀收紧的是发布级验收门槛；它不会让本地无 Key 环境通过真实验收，也不会用 `import-guide.md` 代替剪映 / CapCut / Premiere 等第三方工具的真实导入证据。

### 6.70 2026-05-22 v2 发布级验收一键入口

已完成：

- `package.json` 新增 `npm run verify:v2:release`，固定执行 `run-v2-acceptance-evidence` 的 provider strict、真实工作区闭环、真实混剪导入证据、网络联调和媒体联调参数。
- 发布级入口只需要追加 `-- --workspace <工作区路径> --output-dir <证据目录>`，避免人工漏掉 `--require-real-workspace-evidence`、`--require-external-mix-evidence`、`--allow-network` 或 `--allow-media`。
- 功能测试同步断言 `verify:v2:release` 保持发布级参数，不允许后续改回 dry-run 或 local-sample 口径。

验证：

- `npm run verify:v2:release -- --output-dir .tmp/v2-release-gate-check` 按预期失败；manifest 显示 `networkAllowed=true`、`mediaAllowed=true`、`requireExternalMixEvidence=true`、`requireRealWorkspaceEvidence=true`，业务验收 50/52，失败项为真实工作区验收门槛和真实混剪工具导入证据。
- `npm run verify:v2` 通过，默认 local-sample 业务验收仍为 50/50，UX 文案审计 11 个文件、38 条规则。
- `npm run test:functional` 通过。

边界：

- `verify:v2:release` 是发布级真实证据入口，不会在无真实 provider / 无真实工作区时通过；当前本地无 Key 环境仍必须按第 7 节补真实证据。

### 6.71 2026-05-22 最终本地收口验证和剩余项确认

已完成：

- 普通用户可见文案禁用词最终扫描通过；README、PRD、UI 蓝图和 LLM playbook 中没有重新出现 `provider`、`blocked`、`PromptRef`、`Prompt 来源`、manifest 主任务、步骤 key 或原始追溯对象。
- PRD 中“软件不导出 RunningHub 任务包”已收敛为“软件不导出第三方平台任务文件”，避免普通用户误解为 App 会管理第三方平台任务。
- 本地 v2 总闸、构建、功能测试、Electron smoke 和 Playwright E2E 已在最新工作树上重新跑通。
- 发布级总闸已用 `verify:v2:release` 复核，确认当前剩余不是本地流程断裂，而是缺真实生成服务 strict、真实工作区闭环和真实混剪工具导入证据。

验证：

- `rg -n "\\bprovider\\b|\\bblocked\\b|pending external|waiting external|PromptRef|Prompt 来源|混剪\\s+manifest|导出\\s+manifest|RunningHub 任务包|回填任务|KnowledgeCitation|Context Run|\\bBuilder\\b" docs/roadmap/v2/README.md docs/roadmap/v2/prd.md docs/roadmap/v2/ui-blueprint.md docs/roadmap/v2/llm-playbook.md` 无结果。
- `git diff --check` 通过。
- `npm run verify:v2` 通过；provider dry-run 在无 Key / 端点环境下报告 4 个待配置，业务验收 local-sample 50/50，UX 文案审计 11 个文件、38 条规则。
- `npm run build` 通过。
- `npm run test:functional` 通过。
- `npm run smoke:electron` 通过。
- `npm run test:e2e` 通过，20/20。
- `npm run verify:v2:release -- --output-dir .tmp/v2-release-gate-final` 按预期失败；provider strict 未通过，业务验收 50/52，失败项为 `real-workspace-evidence` 和 `mix-package-external-import`。
- `npm run verify:local` 通过；本地总验收覆盖 typecheck、build、v2 provider dry-run / 业务验收 / UX 文案审计、功能测试、Electron smoke 和 Playwright E2E 20/20。

边界：

- 本地工程主链可收口，但 v2 发布级完成不能宣称完成；仍必须按第 7 节补真实生成服务、真实业务素材工作区和第三方混剪导入证据。

### 6.72 2026-05-22 目标到证据收口审计

目标拆解：

- 普通用户主路径必须按用户故事可用，不再把工程对象、Canvas、状态码或清单文件当作主任务。
- 品牌 / 产品知识库、IP 知识库、场景库、Prompt、SOP、图片、视频 Prompt、成品导入、审核、素材库和混剪包必须连成可追溯链路。
- 本地验证必须覆盖主路径；发布完成必须额外有真实生成服务、真实工作区和真实第三方混剪导入证据。

| 要求 | 证据 | 当前判断 |
| --- | --- | --- |
| 普通用户入口和下一步动作可发现 | `user-story-flow-map.md`、`ui-blueprint.md`、`ModuleOutlet.tsx`、`WorkflowFeatureModule.tsx`；`npm run test:e2e` 覆盖 v2 入口、SOP 下一步、运行详情跳转 | 本地已验证 |
| 不把 Canvas 作为普通用户主路径 | `WorkflowFeatureModule.tsx` 高级维护收拢；`completion-audit.md` 6.22 / 6.59 / 6.68 | 本地已验证 |
| 视频第三方生成只复制 Prompt，成品手动导入 | `VideoModule.tsx`、`VideoImportModule.tsx`、`scripts/electron-smoke.mjs`；E2E 覆盖 Prompt 交接、复制状态、导入关联 | 本地已验证，真实外部平台待验收 |
| SOP 执行前显式选择资料，已选输入源或知识引用时不重复要求补充说明 | `workflowEngine.ts`、`workflowStore.ts`、`WorkflowFeatureModule.tsx`；functional 和 E2E 覆盖输入源选择、知识引用、运行记录写入 | 本地已验证 |
| 用户可见文案不回退到工程词 | `scripts/v2-ux-copy-audit.mjs`、`package.json` 的 `verify:v2:ux-copy`；审计通过 11 个文件、38 条规则 | 本地已验证 |
| 混剪交接为素材文件夹、清单文件、CSV 和剪辑人员说明 | `mixPackageStore.ts`、`mix-import-evidence.example.json`、`workflow-model.md`、`prd.md`；业务验收 local-sample 覆盖混剪包导入说明 | 本地已验证，真实混剪工具导入待补 |
| 发布级门槛不能被本地样例冒充 | `verify:v2:release`、`v2-business-acceptance.mjs`、`v2-acceptance-evidence.mjs`；`.tmp/v2-release-gate-final/manifest.json` 显示 provider strict 和真实证据均为必需 | 已阻断伪完成 |
| 本地总验收 | `npm run verify:local` 通过，覆盖 typecheck、build、v2 总闸、功能测试、Electron smoke、Playwright E2E 20/20 | 本地已验证 |

缺口审计：

- 真实生成服务 strict：缺文字、视觉、图片、视频服务配置与联调结果。
- 真实业务工作区：缺真实品牌 / IP / 产品 / SKU / 评论 / 参考图 / 参考视频跑完主链后的 `.content-studio/` 证据。
- 真实混剪工具导入：缺 `import-evidence.json`、截图 / 录屏 / 验收记录，以及视频和绿幕图在真实工具里的导入证明。

## 7. 剩余工作

工程主链和普通用户流程已进入本地总闸；剩余项只剩不能在无 Key / 无真实素材环境里伪造的发布级证据。下一刀只处理真实验收，不再新增平行架构：

最后只剩三类必补证据：

1. 真实生成服务 strict：配置文字、视觉理解、图片生成和视频生成服务，开启网络和媒体联调，跑通 `verify:v2:release` 中的 provider strict。
2. 真实业务工作区闭环：用 1 套真实品牌资料、1 套真实 IP 资料、真实产品 brief / SKU、真实评论客服语料、参考图和参考视频跑完 App 主链，并从 `.content-studio/` 自动生成验收报告。
3. 真实第三方混剪导入：把包含视频素材和绿幕图的混剪包导入剪映 / CapCut / Premiere 等真实工具，在混剪包目录保存 `import-evidence.json`、截图 / 录屏 / 验收记录文件。

不再新增新的并行模块、Canvas 主路径或手工清单口径；发布级验收统一使用 `npm run verify:v2:release -- --workspace <工作区路径> --output-dir docs/dev/v2-acceptance/<日期>`。

- 用用户真实评论、差评和客服问答跑 `US-11` 业务验收报告，确认痛点聚类、标题方向和客服异议话术在真实行业语料下可用。
- 用用户真实产品 brief、SKU 表和参考详情页跑 `US-04 / UC-05` 业务验收报告，确认主图、卖点图和详情页模块 Prompt 在真实电商资料下可用，并继续补真实生成图的审核证据。
- 用用户真实通过审核的图片 / 视频素材跑 `US-10 / UC-14` 业务验收报告，确认成功素材沉淀在真实素材质量和授权边界下仍可复用。
- 用用户真实口播脚本、卖点列表和审核后的绿幕图跑 `US-06 / UC-10` 业务验收报告，确认标题卡、卖点卡、CTA 卡在真实文案长度下可读、过审，并作为 overlay 进入真实混剪清单。
- 用真实混剪工具按 `import-guide.md` 导入包含视频素材和绿幕图的混剪包，在 App 历史混剪包里登记真实截图 / 录屏 / 验收记录，再用 `npm run verify:v2:acceptance -- --workspace <工作区路径> --require-external-mix-evidence` 补齐 `US-08 / UC-12` 的外部工具验收证据。
- 用用户真实文字 / 视觉 / 图片 / 视频 provider 配置跑一遍品牌场景 SOP、小红书对标图 SOP、IP 长文 SOP 和视频素材包 SOP，记录真实 provider 返回、成本、失败恢复和生成质量。
- 用 1 套真实品牌资料、1 套真实 IP 资料、1 组参考图和 1 条参考视频跑完 App 主链后，优先用 `npm run verify:v2:acceptance -- --workspace <工作区路径>` 从真实工作区产物生成业务验收报告；必要时再按 `business-acceptance-input.example.json` 手工补充缺失字段。
- 真实素材验收报告优先通过 `npm run verify:v2:release -- --workspace <工作区路径> --output-dir docs/dev/v2-acceptance/<日期>` 成套归档，避免 local-sample 和真实验收口径分裂；该入口已经包含 provider strict、真实工作区闭环、真实混剪导入证据、网络联调和媒体联调。
- 如媒体成本不可接受，先只开 `CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1` 做文字 / 视觉联调诊断，但不能替代最终 `npm run verify:v2:release -- --workspace <工作区路径> --output-dir <证据目录>` 发布门槛。
- 发布前在最终工作区状态重跑 `npm run verify:local`；该命令已经包含 `verify:v2`，但不替代真实 provider strict 联调。commit / tag / push 仍按发布流程另行确认。
