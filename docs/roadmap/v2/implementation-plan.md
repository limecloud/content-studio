# 布谷AI内容工厂 v2 实施计划

更新时间：2026-05-22
状态：Local Verified
技术栈：Electron + React + TypeScript + 本地工作区文件 + 协议化模型 provider

## 0. 当前基线

当前项目已经具备：

- Electron + React 桌面工作台。
- 本地工作区 `.content-studio/` 数据目录。
- 知识库、来源追溯、Prompt Pack、Scene Card。
- 文章生成、图片生成、视频脚本 / 视频队列。
- 生成日志和素材库雏形。
- 图片 provider、视频 provider 与文本 provider 的显式协议路由。
- v2 输入源、品牌 / IP 知识库、场景库、PromptDraft、SOP 运行记录、素材审核、混剪包、平台草稿包的本地文件事实源。

当前仍未完成到“生产发布 v2”的标准：

- 真实 provider 端到端联调仍需按用户配置逐项验证，现有自动化主要覆盖 blocked 分支和 mock 成功分支。
- 本地总闸 `npm run verify:local` 已通过；后续发布前仍需在最终提交状态重跑一次。
- 已新增 `npm run verify:v2:providers` 作为真实 provider 联调入口；默认 dry-run 不外发，显式开启 `CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1` / `CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1` 后再调用真实服务。
- 已新增 `npm run verify:v2:acceptance` 作为 v2 业务验收报告入口；默认 local-sample 不外发，先固化品牌、IP、产品资料结构化、主图 / 卖点图 / 详情页 Prompt 追溯、用户反馈痛点聚类、标题方向、客服异议话术、对标图、参考视频拆解、绿幕文案图、成功素材回炉、混剪包导入说明、平台草稿包、视频成本边界、跨产物 runId 关键覆盖和一致性的验收结构；也支持 `-- --input <json>` 读取真实验收输入，或 `-- --workspace <path>` 直接从 `.content-studio` 读取真实工作区产物，并可从输入源、PromptDraft、审核记录、SOP 运行记录、绿幕文案图、混剪包 / 平台草稿包目录、视频 generation log、manifest 和 `import-guide.md` 自动提取交付证据，真实素材验收复用同一报告 schema；如需把真实第三方混剪导入作为门槛，追加 `-- --require-external-mix-evidence`，验收脚本会读取混剪包目录中的 `import-evidence.json` 并校验证据文件存在；如需证明完整真实工作区闭环，追加 `-- --require-real-workspace-evidence`，该门槛会自动要求真实第三方混剪导入证据，并拒绝 local-sample、手填清单、样例占位和 provider dry-run。
- 功能测试已新增真实服务写工作区的验收护栏：由 `WorkflowEngine` 和各 Store 写出品牌 / IP / 产品 / 评论 / 绿幕 / 视频素材包 / 成功素材 / 平台草稿产物，再通过 `loadWorkspaceAcceptanceInput` 读取同一工作区，避免验收口径只停在手写 JSON fixture。
- provider 联调和业务验收都支持 `--output <json>` 写入报告文件，真实联调不再只依赖终端输出。
- 已新增 `npm run verify:v2:evidence` 作为成套证据目录入口，一次性生成 provider 报告、业务验收报告、manifest 和人可读摘要；默认无 Key 本地不失败，只有业务验收失败或显式 `--provider-strict` 时 provider strict 未过才退出非 0。
- `npm run verify:v2` 聚合 provider dry-run 诊断和业务验收，并已纳入 `npm run verify:local`，避免 v2 验收和本地总闸分裂。
- 审核后的长期复用、Prompt / Skill / SOP 回炉和平台草稿辅助仍是局部闭环，不应标记为云端发布或自动发布能力。

v2 不重写这些能力，而是先补充“品牌 / 产品知识库 + IP 知识库 + 场景库 + Prompt 工作台 + 大模型玩法”层，再把跑稳的玩法沉淀为通用 SOP 工作流。

## 1. 模块事实源

| 分类 | 模块 | 说明 |
| --- | --- | --- |
| current | `src/shared/types.ts` | 跨进程类型契约。 |
| current | `src/shared/imageTemplates.ts` | 图片技能模板。 |
| current | `src/main/services/knowledgeBaseStore.ts` | 已成型知识库。 |
| current | `src/main/services/brandKnowledgeBaseStore.ts` | 品牌 / 产品知识库、卖点、合规边界和来源引用。 |
| current | `src/main/services/ipKnowledgeBaseStore.ts` | IP 知识库六层体系和场景延伸关系。 |
| current | `src/main/services/inputSourceStore.ts` | 知识库文档、参考图、参考视频、产品资料、SKU 表、竞品内容输入源登记。 |
| current | `src/main/services/agentPromptSessionStore.ts` | Agent 多轮 Prompt 会话记录。 |
| current | `src/main/services/promptDraftStore.ts` | Prompt 草稿、版本和确认状态。 |
| current | `src/main/services/promptPackService.ts` | 提示词包。 |
| current | `src/main/services/sceneLibraryStore.ts` | 场景卡。 |
| current | `src/main/services/referenceReverseService.ts` | 参考图 / 参考视频反推与 PromptDraft 生成。 |
| current | `src/main/services/generationLogStore.ts` | 生成日志。 |
| current | `src/main/providers/mediaProvider.ts` | 图片 / 视频生成入口。 |
| current | `src/shared/types.ts` | v2 输入源、Prompt 会话、工作流定义、运行和产物类型事实源。 |
| current | `src/main/services/workflowStore.ts` | 工作流定义保存、读取、内置定义安装和运行记录。 |
| planned | `src/main/services/workflowArtifactStore.ts` | 独立工作流产物登记；当前先由运行记录、生成日志和审核记录共同承接。 |
| current | `src/main/services/workflowEngine.ts` | 工作流步骤执行编排。 |
| current | `src/main/services/overlayCardStore.ts` | 本地绿幕文案图素材生成与登记。 |
| current | `src/main/services/assetReviewStore.ts` | 本地素材通过 / 驳回审核记录，作为混剪导出门槛。 |
| current | `src/main/services/mixPackageStore.ts` | 混剪素材包导出、manifest / CSV / import-guide 写入。 |
| current | `src/renderer/src/components/modules/WorkflowFeatureModule.tsx` | SOP 执行、运行前资料选择和运行详情。 |
| future | 云端协作、复杂权限、完整剪辑时间线、自动发布、多租户后台 | v2 不实现。 |

> 注：`PromptGroupStore` 不再作为单独的运行事实源命名，当前由 `PromptPackService + SceneLibraryStore + PromptDraftStore` 共同承接；`visionAnalysisService.ts` 已由 `referenceReverseService.ts` 替代。

## 2. 开发切片

### P0：v2 文档、输入源和工作流类型

写集：

- `docs/roadmap/v2/*`
- `src/shared/types.ts`

任务：

1. 明确 v2 产品边界：品牌 / 产品知识库先到场景库，IP 知识库独立成体系，不是知识库单链，也不是纯 canvas。
2. 定义 `BrandKnowledgeBase`、`IpKnowledgeBase`、`SceneLibrary`、`SceneCard`、`PromptGroup`。
3. 定义 `WorkflowInputSource`、`AgentPromptSession`、`PromptDraft`。
4. 定义 `WorkflowDefinition`、`WorkflowRun`、`WorkflowStepRun`、`WorkflowArtifact`。
5. 定义视频生成路径：`internal-api`、`manual-external-prompt`、`manual-video-import`。

验收：

- 文档成套存在。
- 类型能被 main / renderer 引用。
- 不破坏 v1 类型。

### P1：输入源登记和 DOCX / Markdown 导入

写集：

- `src/main/services/inputSourceStore.ts`
- `src/main/services/documentTextExtractor.ts`
- `src/main/services/knowledgeBaseStore.ts`
- `src/main/services/agentPromptSessionStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/components/modules/InputSourcesModule.tsx`
- `src/renderer/src/components/modules/KnowledgeModule.tsx`

任务：

1. 保存 `workflow-input-sources.json`。
2. 输入源按品牌 / 产品知识库、IP 知识库素材、普通参考素材分流。
3. 品牌 / 产品知识库生成 `BrandKnowledgeBase`，不只包装为泛化输入源。
4. IP 素材生成 `IpKnowledgeBase` 六层草案，不和品牌资料混用。
5. 支持参考图、产品资料、手填文本先进入输入源列表。
6. DOCX / Markdown 保留原文路径、转换稿路径和来源 metadata。
7. 产品资料 / SKU 表在普通用户页生成变量表，明示卖点、规格、场景和禁用表达缺口，并生成主图、卖点图和详情页模块 Prompt 交付。
8. 评论 / 差评 / 客服问题进入用户反馈输入源，并生成痛点矩阵、选题方向、客服异议话术和标签。

验收：

- 能导入品牌 / 产品知识库并生成可读文本和 Markdown 转换稿。
- 能导入 IP 知识库素材并生成可读文本和 Markdown 转换稿。
- 能上传参考图并生成输入源记录。
- 能把产品 brief / SKU 表整理为产品变量表和三类图片 Prompt；缺字段时标记待补，不编造。
- 能把评论、差评和客服问题整理为用户痛点矩阵、标题方向和客服异议话术；聚类和话术必须保留原声证据。
- 输入源可被后续 Prompt 会话选择。

当前落地状态：

- 已支持 DOCX / Markdown / TXT / JSON / CSV / TSV 的可读文本抽取；DOCX 通过 ZIP + XML 抽取正文，不额外引入解析依赖。
- 已支持导入文件后写入 `extractedText`、`markdownPath`、`artifactRefs`；图片 / 视频 / 表格理解未接入时保留 blocked 原因。
- 已支持从已解析输入源生成默认 `KnowledgeCitation`，作为提示词包的兜底事实来源。
- 已支持 Agent 会话：`startAgentPromptSession` 会创建会话和首版草稿，`continueAgentPromptSession` 会基于本轮调整写入新版本并保留消息流。
- 已新增 `src/shared/productBrief.ts` 和输入源页“产品资料结构化”面板，把 `product-brief` / `sku-table` 输入源整理成产品名称、卖点、规格、适用场景、禁用表达、SKU 行、待补字段和主图 / 卖点图 / 详情页模块 Prompt，作为图片 / 详情页 / Prompt 生产前的普通用户检查点。
- 已新增 `src/shared/userFeedbackInsights.ts` 和输入源页“评论痛点聚类”面板，把 `user-feedback` 输入源整理成痛点分类、用户原声、推荐标签、选题方向和客服异议话术，并纳入 Prompt 工作台和 SOP 输入源事实链。
- 品牌 / 产品知识库和 IP 知识库已经有结构化专用 store，可从知识引用沉淀结构化记录；后续重点是增强真实模型抽取质量和 GUI 补齐缺口，而不是再新增并行 store。

### P1.5：场景库和提示词组

写集：

- `src/main/services/brandKnowledgeBaseStore.ts`
- `src/main/services/ipKnowledgeBaseStore.ts`
- `src/main/services/sceneLibraryStore.ts`
- `src/main/services/promptPackService.ts`
- `src/main/services/promptDraftStore.ts`
- `src/shared/types.ts`
- `src/renderer/src/components/modules/KnowledgeModule.tsx`

任务：

1. 从品牌 / 产品知识库抽取 `SceneLibrary` 和 `SceneCard`。
2. 场景卡包含人群、问题、季节、空间、动作、情绪、镜头、合规边界和输出用途。
3. 从场景卡生成 `PromptGroup`，每条提示词可直接复制到图片 / 图生视频生成工具。
4. IP 知识库展示六层完整度，并能生成口播、文案、私域、产品化等场景延伸库。

验收：

- 能从唯他瑞知识库生成夏季儿童免疫相关场景库。
- 能从场景库生成 10 组 UGC 手机实拍提示词。
- 能从嘉文老师 IP 知识库展示六层完整度和场景延伸入口。

当前落地状态：

- `BrandKnowledgeBaseStore` 已能从 `KnowledgeCitation` 生成品牌 / 产品知识库，保留产品事实、卖点、合规边界、场景种子和来源引用。
- `PromptPackService` 已能从同一批知识引用生成品牌提示词包，供场景库复用。
- `SceneLibraryStore` 已能基于提示词包生成结构化场景卡。
- `ReferenceReverseService` 已接入真实视觉理解 endpoint，未配置时 blocked，不伪造对标图反推结果；成功后会生成 `PromptDraft` 和 `generation-log:reference-reverse`。
- `ReferenceReverseModule` 已在工作台落地，可以把参考图 / 产品源 / 用户意图直接送入 PromptDraft。
- `WorkflowEngine` 已通过品牌场景 SOP 把 `BrandKnowledgeBaseRecord -> PromptPack -> SceneCard[] -> PromptDraft` 串成同一条可追溯运行记录。

### P2：Prompt 工作台和 Agent 会话

写集：

- `src/main/services/agentPromptSessionStore.ts`
- `src/main/services/promptDraftStore.ts`
- `src/main/services/textGenerationService.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/modules/PromptWorkbenchModule.tsx`

任务：

1. 保存 `agent-prompt-sessions.json` 和 `prompt-drafts.json`。
2. 支持选择品牌场景库、IP 知识库、普通输入源，填写用户意图，发起 Claude SDK Agent 会话。
3. 支持多轮调整 Prompt 草稿。
4. 支持从 `PromptGroup` 进入图片、视频 Prompt、文案或绿幕图任务。
5. 支持确认 Prompt，并标记用途：文案、图片、视频 Prompt、绿幕图、SOP、Skill。

验收：

- 能用品牌场景库 + 用户意图生成 Prompt 草稿。
- 能用 IP 知识库 + 用户意图生成文案 / 脚本 Prompt 草稿。
- Prompt 草稿能保存版本并被确认。
- 未配置文字模型时 blocked，不伪造 Prompt。

当前落地状态：

- `PromptDraftStore` 已能选择输入源和用户意图生成草稿，优先调用 `TextGenerationService.generateJson`。
- 文字模型未配置时返回 `blocked:text-provider`，模型失败时返回 `fallback:local-rule`，草稿正文保留来源摘要和降级原因。
- Renderer 已展示已解析输入源数量、模型状态、Markdown 转换稿路径、版本列表和确认入口。
- `AgentPromptSessionStore` 已把“用户意图 + 输入源快照 + 会话消息 + 草稿版本”串成一条可追溯链路。

### P3：对标图反推 Prompt

写集：

- `src/main/services/referenceReverseService.ts`
- `src/main/services/promptDraftStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/modules/ReferenceReverseModule.tsx`
- `src/renderer/src/components/modules/ImageModule.tsx`

任务：

1. 支持参考图输入源进入多模态分析。
2. 输出构图、光线、文字区域、画幅、风格、负面约束。
3. 反推图片 Prompt 草稿。
4. 支持用户多轮调整后调用现有图片 provider 生成同风格图。
5. 保存来源引用和生成日志。

验收：

- 无知识库路径能完成 `参考图 -> Prompt 草稿 -> 图片生成 -> 审核入库`。
- 未配置多模态模型时 blocked。
- 生成图片能追溯参考图和 Prompt 版本。

### P4：工作流定义和内置 SOP

写集：

- `src/main/services/workflowStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`
- `src/renderer/src/app/useContentStudioApp.ts`

任务：

1. 在工作区保存 `workflow-definitions.json`。
2. 提供内置 SOP：
   - 无知识库小红书扒图。
   - 品牌知识库场景提示词。
   - IP 知识库公众号 / 口播内容。
   - 产品商业素材。
   - 评论痛点选题。
   - 绿幕文案图。
   - 视频素材包。
3. Renderer 能列出 SOP 模板。
4. 支持安装内置 SOP 到工作区。

验收：

- 无工作区时展示内置只读 SOP。
- 有工作区时可安装并读取工作区 SOP。
- Definition 使用版本号和 `inputSourceRequirements`。

当前落地状态：

- `WorkflowStore` 已内置品牌知识库场景提示词、小红书种草图、产品商业素材、评论痛点选题、绿幕文案图、公众号 IP 内容、视频素材包 7 条定义。
- 已有工作区会自动补齐缺失的内置定义，不覆盖用户已有定义或草案。
- `WorkflowFeatureModule` 已可以列出定义、查看输入字段、审核规则和运行历史，不依赖 canvas 作为唯一执行入口。
- SOP 执行页和运行 hook 共用 `src/shared/inputSourcePolicy.ts` 的输入源匹配策略，避免 UI 看不到或运行时暗中改用另一批资料。

### P5：工作流运行记录和最小执行器

写集：

- `src/main/services/workflowStore.ts`
- `src/main/services/assetReviewStore.ts`
- `src/main/services/workflowEngine.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/shared/types.ts`

任务：

1. 保存 `workflow-runs.json` 和 `workflow-artifacts.json`。
2. 实现顺序执行，不先做复杂 DAG。
3. 支持步骤：
   - `collect-input`
   - `agent-read-knowledge`
   - `build-brand-knowledge-base`
   - `build-ip-knowledge-base`
   - `generate-scene-library`
   - `generate-prompt-group`
   - `structure-product-brief`
   - `cluster-user-feedback`
   - `analyze-reference-image`
   - `reverse-engineer-prompt`
   - `refine-prompt`
   - `confirm-prompt`
   - `generate-copy`
   - `generate-image`
   - `create-video-prompt`
   - `mark-video-prompt-copied`
   - `import-video-file`
   - `quality-check`
   - `review`
   - `tag-assets`
   - `export-package`
4. 遇到 `review` 停止并进入 `waiting-review`。
5. 遇到 provider 未配置时写 blocked；第三方生成路径只记录 Prompt 和复制动作。

验收：

- 能跑通无知识库小红书扒图 SOP。
- 能跑通品牌知识库 -> 场景库 -> 提示词组 SOP。
- 能跑通 IP 知识库 -> 口播 / 文章内容 SOP。
- artifact 能追溯到 runId、stepId、sourceRefs、promptDraftId 和 logId。

当前落地状态：

- `WorkflowStore` 已能保存 `workflow-runs.json`，并为每次运行记录步骤输入、步骤输出、summary、错误、artifactRefs 和运行时间。
- `WorkflowStore.startRun` 会把 `source` 和 `intent` 作为事实级必填输入校验；即使旧版内置定义缺少 `required` 标记，也不会让 SOP 缺输入后继续进入后续步骤。
- `WorkflowEngine` 已接入 IPC `workflow:startRun`，先做顺序执行：登记输入源 -> Agent 会话 / PromptDraft -> 图片生成 / 视频 Prompt -> 人工审核停顿。
- `StartWorkflowRunInput` 和 `WorkflowRunRecord` 已支持携带 `KnowledgeCitation[]`，运行详情页可查看本次 SOP 使用的知识引用。
- 品牌场景 SOP 已能执行：登记输入源 -> 抽取品牌知识库 -> 生成提示词包 -> 生成场景库 -> 生成 Prompt 组 -> 人工审核停顿。
- 产品商业素材 SOP 已能执行：登记产品资料 -> 结构化产品 brief / SKU -> 生成主图、卖点图和详情页模块 Prompt -> 图片 provider；字段缺失会 blocked 并要求补齐，不进入下游编造。
- 评论痛点选题 SOP 已能执行：登记评论 / 差评 / 客服问题 -> 聚类真实用户痛点 -> 生成选题方向、客服异议话术和文案 Prompt -> 人工审核停顿。
- 绿幕文案图 SOP 已能执行：登记口播脚本 / 卖点 / CTA -> 生成绿幕文案 Prompt -> 本地生成 9:16 绿幕 SVG 卡片 -> 自动创建 pending 审核记录 -> 人工审核停顿。
- `--workspace` 业务验收已覆盖真实服务写出的工作区产物：产品资料、评论原声、绿幕卡、混剪包、平台草稿包、成功素材沉淀和跨产物 runId 均能从 `.content-studio` 文件事实源自动提取。
- `BrandKnowledgeBaseStore` 的默认合规边界已补齐“治疗 / 专业建议”和“绝对化收益”两类硬限制，防止品牌场景 Prompt 在无模型或模型漏字段时丢关键边界。
- IP 内容 SOP 已能从输入源生成 `AgentPromptSession` 和 `PromptDraft`，并在 `review` 步骤以 queued 状态等待人工确认。
- 图片步骤已串到真实 `MediaProvider`：未配置图片 provider 时 blocked；真实生成成功时写入 `GenerationLogStore`，并自动创建 `AssetReviewStore` 的 pending 审核记录。
- `WorkflowFeatureModule` 已能在 SOP 历史里查看单条运行的输入、步骤轨迹、artifact refs 和步骤级 JSON 快照。
- `WorkflowEngine` 还可执行 `build-brand-knowledge-base`、`generate-prompt-pack`、`generate-scene-library`、`generate-prompt-group`、`reference-reverse`、`asset-store`、`export` 等步骤，参考图反推和品牌场景 SOP 已打通。
- `AssetReviewStore` 与 `MixPackageStore` 已形成图片 / 视频 / 绿幕图到混剪包的审核门禁。

### P6：SOP 执行页和审核台

写集：

- `src/renderer/src/components/modules/WorkflowFeatureModule.tsx`
- `src/renderer/src/components/ModuleOutlet.tsx`
- `src/renderer/src/app/constants.ts`
- `src/renderer/src/styles/modules.css`

任务：

1. SOP 列表。
2. 输入源选择摘要。
3. SOP 输入表单。
4. 运行步骤进度。
5. 产物预览。
6. 质检结果和审核操作。

验收：

- 普通用户不打开 canvas 也能运行 SOP。
- 缺少资料选择或用户意图时，执行页必须在运行前提示缺口并禁用“运行 SOP”，不能让普通用户通过一条 blocked 运行记录才发现问题。
- 当前输入源、Prompt 版本、步骤和状态清晰。
- 产物可以进入素材库。

当前落地状态：

- `WorkflowFeatureModule` 已把 `intent` 作为表单化 SOP 执行的固定必填字段，并把资料来源改为显式输入源选择；缺用户意图或缺资料选择时会禁用运行按钮。
- `WorkflowFeatureModule` 已在执行页显示“本次使用资料”，按当前 SOP 默认勾选匹配的输入源；普通用户可取消或重新选择，运行时把显式选择的 `inputSourceIds` 写入 `WorkflowRun`。
- 执行页没有可用资料或用户取消全部资料时，会禁用“运行 SOP”，并给出“去输入源 / 文档转换”的恢复路径，避免用户创建一条缺资料的 blocked 运行后才发现问题。
- 原 `source` 文本字段在执行页显示为“补充资料说明”，有已选择资料时不再必填；普通用户只需选择资料并填写用户意图即可运行，补充说明只记录本次口径、平台或限制。
- `WorkflowStore.startRun` 与前端校验保持一致：有 `inputSourceIds` 时允许 `source` 为空；没有资料选择且没有补充说明时才返回“资料来源”缺口。
- 运行详情已新增“本次资料来源”，用中文业务字段展示输入源标题、用途、状态和摘要，并把系统生成的运行补充记录单独标注，避免审核人员只看到 `input-source:*` 或空 `source` 字段。
- 新增 SOP 的运行后下一步动作已补齐：产品商业素材会按状态进入输入源、图片工作台或素材审核；评论痛点选题会进入输入源或 Prompt 工作台；绿幕文案图会进入输入源、绿幕工作台、素材审核或混剪包导出，普通用户不用从运行历史里猜下游入口。

### P7：视频 Prompt 复制、成品导入和绿幕图

写集：

- `src/main/services/overlayCardStore.ts`
- `src/main/providers/mediaProvider.ts`
- `src/shared/types.ts`
- `src/shared/imageTemplates.ts`
- `src/main/providers/imageGenerationProvider.ts`
- `src/renderer/src/components/modules/WorkflowFeatureModule.tsx`
- `src/renderer/src/components/modules/AssetsModule.tsx`
- `src/renderer/src/components/modules/ImageModule.tsx`

任务：

1. 生成视频 Prompt artifact。
2. 支持复制 Prompt 到 RunningHub / 第三方平台。
3. 记录复制时间和原 Prompt，不创建外部任务。
4. 支持拖入第三方生成后的成品视频文件并关联原 Prompt。
5. 导入后生成 `video-clip` artifact。
6. 新增绿幕文案图模板，支持绿色 / 透明 / 纯色背景。

验收：

- 不配置视频 API 也能生成并复制视频 Prompt。
- 手动导入视频能追溯原提示词和参考图。
- 绿幕文案图输出带 metadata，并可进入混剪包。
- 不伪造视频生成成功。

### P8：混剪素材包导出

写集：

- `src/main/services/mixPackageStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- `src/renderer/src/components/modules/AssetsModule.tsx`

任务：

1. 选择通过审核的素材。
2. 复制文件到导出目录。
3. 输出 `manifest.json`。
4. 输出 `manifest.csv`，方便第三方混剪软件或表格工具读取。
5. 输出 `import-guide.md`，给剪辑人员说明素材目录、CSV 用法、绿幕叠加和人工审核边界。
6. 记录 artifact 状态为 `exported`。

验收：

- 导出包可被第三方混剪软件读取。
- manifest 包含素材用途、顺序建议、平台、画幅、时长、文案。
- 导入说明能让普通剪辑人员不读 JSON 也知道如何把 `videos/`、`overlays/` 和 `manifest.csv` 交给第三方混剪软件。

当前落地状态：

- `MixPackageStore` 已复制通过审核的图片 / 视频 / 绿幕图到本地包目录，并写入 `manifest.json`、`manifest.csv` 和 `import-guide.md`。
- `AssetsModule` 已能按审核状态选择素材，未通过审核的素材不能进入混剪包。
- `WorkflowStore.recordManualEvent` 已支持把 `mix-package:*`、`manifestPath`、`manifestCsvPath`、`importGuidePath` 和 `packageDir` 回写到视频素材包 SOP 运行记录。
- `MixExportModule` 可打开本地包目录、JSON manifest、CSV manifest 和导入说明。

### P9：Canvas 视图

写集：

- `src/renderer/src/components/workflow/WorkflowCanvas.tsx`
- `src/renderer/src/components/workflow/WorkflowNodeInspector.tsx`
- `src/renderer/src/styles/modules.css`

任务：

1. 只做定义可视化和轻编辑。
2. 节点和连线读写同一份 `WorkflowDefinition`。
3. 提供属性面板。
4. 不做复杂插件系统。

验收：

- 能查看 SOP 的步骤依赖。
- 能修改节点名称和基础配置。
- 普通执行流不依赖 canvas。

当前落地状态：

- Canvas 已作为 `WorkflowFeatureModule` 内部 tab 落地，不新增一级导航。
- 节点标题、说明、依赖、输出键和 blocked 原因会回写同一份 `WorkflowDefinition`。
- 已发布定义需要先复制草案再编辑，避免直接修改已发布 SOP。
- 普通 SOP 表单运行不依赖 Canvas。

## 3. 迁移策略

1. 现有 `PromptPack`、`SceneCard` 保持不变。
2. 旧知识库文档保留兼容读取；新建或新导入知识库必须分流为品牌 / 产品知识库或 IP 知识库，不再只包装成泛化输入源。
3. 现有文章 / 图片 / 视频生成服务先作为 workflow step 被调用。
4. 现有 `GenerationLogEntry` 继续保留，新增 `WorkflowRun` 只做上层聚合。
5. 素材库逐步从 log 输出升级到 artifact 输出。
6. 成功素材逐步回流为 PromptDraft / PromptPack / Skill。
7. 旧日志仍可查看，不强制迁移。

## 4. 验证要求

普通文档 / 类型改动：

```bash
npm run typecheck
```

主工作台和 IPC 改动：

```bash
npm run typecheck
npm run smoke:electron
```

可交付功能改动：

```bash
npm run build
```

发布前：

```bash
npm run verify:v2
npm run verify:v2:acceptance
npm run verify:v2:acceptance -- --input docs/roadmap/v2/business-acceptance-input.example.json
npm run verify:v2:acceptance -- --workspace <工作区路径>
npm run verify:v2:acceptance -- --workspace <工作区路径> --require-external-mix-evidence
npm run verify:v2:acceptance -- --workspace <工作区路径> --require-real-workspace-evidence --require-external-mix-evidence
npm run verify:v2:acceptance -- --workspace <工作区路径> --output docs/dev/v2-acceptance/<日期>/business-acceptance.json
npm run verify:v2:evidence -- --output-dir docs/dev/v2-acceptance/<日期>
npm run verify:v2:evidence -- --workspace <工作区路径> --output-dir docs/dev/v2-acceptance/<日期>
npm run verify:v2:evidence -- --workspace <工作区路径> --require-external-mix-evidence --output-dir docs/dev/v2-acceptance/<日期>
npm run verify:v2:evidence -- --provider-strict --workspace <工作区路径> --require-real-workspace-evidence --require-external-mix-evidence --output-dir docs/dev/v2-acceptance/<日期>
npm run verify:v2:release -- --workspace <工作区路径> --output-dir docs/dev/v2-acceptance/<日期>
npm run verify:local
```

真实业务验收输入要求：

- `brand.compliance` 必须证明医疗化和绝对化表达边界；默认至少检查 `治疗` 和 `绝对化` 两类风险词，不接受只有“人工复核 / 表达克制”这类泛化说明。
- `brand.scenes` 会进入生产 `buildScenePromptGroupContent` 组合器，验收脚本会检查 10 组图片 Prompt、10 组视频 Prompt 和可执行结构字段；真实输入不要只写空场景标题。
- `productBrief.sources` 必须提供产品资料 / SKU 表原文，并能整理出产品名称、卖点、规格或 SKU、适用场景和禁用表达；字段缺失会失败，同时在 `missingFields` 中保留待补项，禁止编造。
- `productBrief.sources` 中至少需要一行可解析 SKU / 规格表，证明 US-04 的主图、卖点图和详情页变体链路有真实变量，不接受只有泛化产品描述。
- `productBrief.expectedPromptTypes` 默认要求 `main-image`、`selling-point-image` 和 `detail-page-section` 三类 Prompt；每类 Prompt 必须保留输入源、SKU / 规格、产品名称、卖点、场景和禁用表达追溯。
- `feedback.sources` 必须提供评论、差评、客服问题或私信原声，并能覆盖价格信任、使用门槛、人群边界和场景需求等关键聚类；痛点矩阵必须包含痛点、人群、场景和内容角度。
- `feedback.sources` 的聚类示例必须来自输入原文，验收脚本会拒绝无法追溯到原声的痛点证据。
- `feedback.sources` 必须能生成标题方向和客服异议处理话术；默认至少各 2 条，话术必须包含原声证据和回复边界，不接受凭空编造客服结论。
- `reference.sources` 或 `reference.actualSourceKinds` 必须同时证明参考图和参考视频来源，`reference.actualPromptFields` 必须覆盖构图、光线、负面约束、风险和质检清单；`reference.actualBoundaryTerms` 或 workspace 反推日志内容还必须证明保留了竞品复制和素材授权风险边界。
- `videoBreakdown.sources` 必须证明参考视频来源，`videoBreakdown.actual.segments[]` 必须包含时间段、钩子、画面、口播、节奏和可复用点；拆解风险必须证明不照搬原视频、复核授权和合规表达。
- `videoBreakdown.script` 必须包含新视频标题、正文、分镜、视频 Prompt、发布检查和拆解来源，证明 UC-04 已从参考视频结构进入本方脚本，而不是停在拆解报告。
- `greenScreen.actualCards` 必须证明口播脚本或卖点已拆成标题卡、卖点卡和 CTA 卡；每张卡必须包含 `durationSeconds`、`assetPath`、`background=green-screen`、`aspectRatio=9:16` 和 `promptDraftId`，并保留 `type`、`title`、`text` 供剪辑人员识别。
- `greenScreen.actualCards[].text` 必须保持可读；文案过长应拆成多张卡，验收脚本会拒绝把长句强行塞进单张绿幕图。
- `greenScreen.actualReviewStatuses`、绿幕卡关联审核记录或 `.content-studio/asset-reviews.json` 必须证明绿幕图已通过审核，不接受未过审 overlay 进入混剪包。
- `videoPackage.actualAssetKinds` 或混剪 manifest `assets[].kind` 必须同时证明混剪包里有视频素材和绿幕图素材，不接受只有目录和 manifest 的空壳包。
- 通过 `videoPackage.packageDir`、`videoPackage.manifestPath` 或 `--workspace` 提供真实目录证据时，混剪 manifest 的 `assets[].packagedPath` 必须指向本地真实存在的素材文件；只写 manifest 但文件不存在会失败。
- `videoPackage.actualReviewStatuses`、混剪 manifest `assets[].reviewStatus` 或 `.content-studio/asset-reviews.json` 必须证明混剪包素材已通过审核，不接受未过审素材进入混剪交付包。
- `videoPackage.actualGuideTerms` 或混剪包目录中的 `import-guide.md` 必须证明剪辑人员可读导入说明覆盖第三方混剪软件、`manifest.csv`、`videos/`、`overlays/` 和人工审核边界。
- 如使用 `--require-external-mix-evidence`，`videoPackage.externalImportEvidence` 或混剪包目录 `import-evidence.json` 必须证明真实第三方混剪工具已导入素材；至少包含 `toolName`、`importedAt`、`importedAssetKinds`、`manifestImported=true` 和真实存在的 `evidenceFiles`。示例见 `docs/roadmap/v2/mix-import-evidence.example.json`。
- 如使用 `--require-real-workspace-evidence --require-external-mix-evidence`，验收必须来自 `--workspace` 真实 App 工作区，并同时证明真实产品资料 / SKU、评论或客服语料、参考图和参考视频、视频拆解和脚本、绿幕图审核、成功素材沉淀、混剪包真实素材文件、真实第三方混剪导入证据、平台草稿包、关键产物 runId 一致性和 provider strict 均成立；该门槛会拒绝 local-sample、外部手填清单、`sample-*` / “示例”占位内容和 provider dry-run。
- `platformDraft.actualTraceFields` 或平台草稿 manifest 必须证明 `workflowRunId`、`promptDraftId` 和 `sourceLogId`，草稿包需要能回到 SOP、PromptDraft 和来源文章日志。
- `platformDraft.actualContentFields` 或平台草稿包文件内容必须证明正文、复制稿、格式指南、发布检查清单和 `publishBoundary` 都有可复核内容；`publishBoundary` 要能证明本地草稿包不自动发布且发布前需要人工确认。使用 `--workspace` 时脚本会读取 `draft.md`、`platform-copy.txt`、`format-guide.md` 和 `publish-checklist.md`。
- `mediaCost.actual` 必须证明视频模型、时长、币种、单价、总成本和可信成本来源；成本来源只接受 `provider-response`、`env` 或 `default-internal-api`，不接受 `manual` 等手填来源伪过。使用 `--workspace` 时脚本会从最新视频 generation log 的 `output.costEstimate` 自动提取。
- `successfulAsset.actual` 必须证明素材先通过审核，再沉淀为 `successful-asset` 输入源和确认态图片 / 视频 `PromptDraft`；输入源必须带 `prompt-distilled` 标签、原素材路径、原 Prompt 关联和不复制竞品 / 人工确认边界。使用 `--workspace` 时脚本会从 `.content-studio/input-sources.json`、`prompt-drafts.json`、`asset-reviews.json` 和 `workflow-runs.json` 自动提取。
- `trace.requiredSources` 必须覆盖 `reference-log`、`video-breakdown-log`、`video-script-log`、`video-generation-log`、`mix-package` 和 `platform-draft`；`trace.actualWorkflowRunRefs` 必须能证明这些关键产物没有缺证据，也没有分叉到不同 `workflowRunId`。
- 使用 `--workspace` 时脚本会优先从 `.content-studio/input-sources.json`、`prompt-drafts.json`、`generation-logs.json`、`overlay-cards.json`、`mix-packages.json`、`platform-drafts.json`、`asset-reviews.json`、`workflow-runs.json`、manifest、`import-guide.md`、可选 `import-evidence.json` 和交付包文件自动提取产品资料、评论反馈、视频拆解、脚本、视频生成、绿幕文案图、成功素材沉淀、`workflowRunId`、审核状态和交付证据；视频拆解、视频脚本和视频生成分别映射到 `video-breakdown-log`、`video-script-log` 和 `video-generation-log`。
- 如果使用 `--input` 手工提供验收输入，参考 `business-acceptance-input.example.json` 补齐 `productBrief.sources`、`productBrief.expectedPromptTypes`、`feedback.sources`、`feedback.expectedTitleMinimum`、`feedback.expectedObjectionMinimum`、`videoBreakdown.actual`、`videoBreakdown.script`、`greenScreen.actualCards`、`greenScreen.actualReviewStatuses`、`successfulAsset.actual`、`trace.expectedWorkflowRunId`、`trace.requiredSources`、`trace.actualWorkflowRunRefs`、`reference.actualSourceKinds`、`reference.actualBoundaryTerms`、`videoPackage.actualAssetKinds`、`videoPackage.actualReviewStatuses`、`videoPackage.actualGuideTerms`、`platformDraft.actualTraceFields` 和 `platformDraft.actualContentFields`。

真实 provider 联调：

```bash
npm run verify:v2:providers
CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1 CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1 npm run verify:v2:providers:strict -- --output docs/dev/v2-acceptance/<日期>/provider-check.json
CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1 CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1 npm run verify:v2:evidence -- --provider-strict --require-real-workspace-evidence --require-external-mix-evidence --workspace <工作区路径> --output-dir docs/dev/v2-acceptance/<日期>
npm run verify:v2:release -- --workspace <工作区路径> --output-dir docs/dev/v2-acceptance/<日期>
CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1 npm run verify:v2:providers:strict
CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1 CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1 npm run verify:v2:providers:strict
CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1 npm run verify:v2:providers
CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1 CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1 npm run verify:v2:providers
```

Provider 报告要求：

- `checks[].requiredEnv` 必须列出当前 provider 恢复所需的环境变量组合，不输出密钥值。
- `checks[].configured` 只允许输出布尔状态，证明 endpoint / key / OAuth 是否存在，避免泄漏凭证。
- `checks[].nextAction` 和 `strictGate.nextActions` 必须给出可执行恢复路径，不能只返回 blocked / failed 状态码。
- `strictGate.passed` 只有在显式开启网络和媒体联调、且没有 failed / blocked provider 时才允许为 true。

成套证据目录要求：

- `manifest.json` 的 `schema` 必须是 `buguai.v2-acceptance-evidence.v1`，并记录验收模式、输入路径、输出文件和建议重跑命令。
- `provider-check.json`、`business-acceptance.json` 和 `SUMMARY.md` 必须在同一目录内，便于真实 provider 联调和真实业务素材验收一起归档。
- 默认模式只作为本地诊断和业务结构验收；发布门槛必须显式加 `--provider-strict` 并开启网络 / 媒体联调。

## 5. 风险

| 风险 | 缓解 |
| --- | --- |
| 工作流模型过度设计 | P5 先做顺序执行，DAG 后置。 |
| 先做引擎但玩法没跑通 | P1-P3 先交付输入源、Prompt 工作台和对标图反推。 |
| canvas 拖慢核心开发 | canvas 放到 P9，不影响 SOP 执行。 |
| 视频 API 成本高 | 人工复制视频 Prompt 到第三方平台优先。 |
| 素材库结构膨胀 | Artifact 只存 metadata 和 refs，不复制无关数据。 |
| 旧功能被打断 | 先让 workflow 调用旧服务，不重写旧服务。 |
