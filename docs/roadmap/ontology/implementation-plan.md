# 布谷AI内容工厂 Ontology 实施计划

更新时间：2026-05-28  
状态：Draft
技术栈：Electron + React + TypeScript + 本地工作区文件 + 协议化模型 provider

## 0. 当前基线

当前项目已经具备 Ontology 的上游和下游基础：

- 本地工作区 `.content-studio/`。
- 知识库、输入源和来源引用。
- `BrandKnowledgeBaseStore`、`IpKnowledgeBaseStore`、`SceneLibraryStore`、`PromptDraftStore`。
- 产品资料结构化、评论痛点聚类、参考图 / 视频反推。
- SOP 工作流、运行记录、素材审核和混剪包导出。
- 文字 / 视觉 / 图片 / 视频 provider 的显式协议路由。
- Agent Knowledge v0.7.2 已定义 ontology-aware 知识包标准：`KNOWLEDGE.md`、`ontology/`、`metadata.primaryOntology`、`type: content-ontology` 和 `runtime.mode: data`。

Ontology 不需要推翻这些模块。实施重点是补一个“内容生产知识地图”层：将输入源抽取成概念、关系、证据、约束和覆盖矩阵，再把审核通过的结构交给现有场景库、Prompt 工作台、SOP 和素材库。

基于 Palantir Operational Ontology 的启发，本路线图再增加一层“内容作战操作层”：把 Signal、Objective、ResourceBundle、ActionType、DecisionGate 和 ActionLog 建成轻量对象，让品牌获客、舆论响应和素材生产可以动态组合、执行和复盘。MVP 只实现最小 ActionLog，不把系统扩成复杂项目管理或自动发布平台。

## 1. 阶段划分

### P0：文档和模型定版

目标：

- 固化 Ontology PRD、模型、工作流和实施计划。
- 明确 MVP、v1 和远景边界。
- 明确轻量 JSON 事实源优先，RDF / OWL 只作为后续导出。
- 明确 Content Studio 内部事实源和 Agent Knowledge v0.7.2 发布包之间的边界。
- 明确 Operational Ontology 的边界：内容行动可调度、可审计、可复盘，但不做虚假舆论操控或自动刷量。

写集：

- `docs/roadmap/ontology/*`

验收：

- 文档成套存在。
- 角色、用例、端到端路径和验收标准清晰。
- 不和 v2 知识库 / 场景库模型冲突。
- 不和 Agent Knowledge v0.7.2 ontology-aware 知识包标准冲突。
- Signal、Objective、CampaignCell、ResourceBundle、ActionType、ActionLog 和 DecisionGate 的范围清晰。

### P1：轻量 Ontology 类型和本地 Store

目标：

- 在共享类型中定义 Ontology 核心对象。
- 在 main 进程新增本地 store，保存 Ontology、运行记录和审核记录。

写集：

- `src/shared/types.ts`
- `src/main/services/ontologyStore.ts`
- `src/main/services/ontologyRunStore.ts`
- `src/main/services/ontologyReviewStore.ts`
- `src/main/services/ontologyActionLogStore.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`

任务：

1. 定义 `OntologyWorkspace`、`Concept`、`Relation`、`Evidence`、`Constraint`、`CoverageMatrix`。
2. 定义 `OntologyBuildRun`、`OntologyBuildStep`、`ValidationIssue`、`ReviewDecision`。
3. 定义最小 `ActionLog`，记录 coverage row 发布到 PromptDraft / WorkflowRun 的行动链路。
4. 保存 `.content-studio/ontologies/*.json`、`ontology-runs.json`、`ontology-reviews.json`、`ontology-actions.json`。
5. 提供 list / get / create / update / validate 基础 IPC。

验收：

- 能创建空 Ontology 工作区。
- 能读取和保存概念、关系、证据、约束和矩阵。
- 能记录最小 ActionLog。
- 类型能被 main / renderer 引用。
- 不破坏 v2 现有类型。

### P2：候选概念抽取和卖点矩阵

目标：

- 从产品资料、SKU 和品牌知识库抽取候选概念。
- 生成卖点拆解矩阵。

写集：

- `src/main/services/ontologyExtractionService.ts`
- `src/main/services/ontologyValidationService.ts`
- `src/main/services/productBriefOntologyAdapter.ts`
- `src/renderer/src/components/modules/OntologyModule.tsx`
- `src/renderer/src/components/ModuleOutlet.tsx`

任务：

1. 复用 `WorkflowInputSourceStore` 读取产品 brief、SKU 表和知识库文本。
2. 调用 `TextGenerationService.generateJson` 抽取功能、属性、卖点、收益、主张、痛点、人群、证据和禁用表达。
3. 将模型输出转换为候选 `Concept`、`Relation` 和 `Evidence`。
4. 生成 `SellingPointMatrix` 类型的覆盖矩阵。
5. 未配置模型时返回 blocked，不生成伪数据。

验收：

- 能从产品 brief 生成卖点矩阵。
- 每条卖点有 sourceRefs 和 evidence status。
- 无证据主张标记 `needs-verification`。
- 禁止表达进入 validation issue，而不是被吞掉。

### P3：评论痛点聚类和场景覆盖矩阵

目标：

- 从用户评论、差评和客服问题中提取真实痛点、异议和用户原声。
- 生成人群 x 痛点 x 卖点 x 场景 x 渠道覆盖矩阵。

写集：

- `src/main/services/feedbackOntologyAdapter.ts`
- `src/main/services/ontologyCoverageService.ts`
- `src/renderer/src/components/modules/OntologyModule.tsx`

任务：

1. 复用现有用户反馈洞察能力。
2. 将痛点聚类转换为 `pain-point`、`objection`、`topic` 和 `EvidenceKind=user-quote`。
3. 将卖点和痛点建立 `solves-pain-point` 关系。
4. 生成覆盖矩阵，标记 `ready`、`missing-evidence`、`missing-material`、`needs-review`。
5. 支持按渠道和目标人群筛选。

验收：

- 每个痛点至少保留一条用户原声。
- 覆盖矩阵能展示缺证据、缺素材和待审核组合。
- 组合过多时有优先级排序，不一次性淹没 UI。

### P4：规则校验和人工审核

目标：

- 为生产级 Ontology 增加质量闸口。
- 人工审核后才允许发布到场景库和 PromptDraft。

写集：

- `src/main/services/ontologyValidationService.ts`
- `src/main/services/ontologyReviewStore.ts`
- `src/renderer/src/components/modules/OntologyModule.tsx`
- `src/renderer/src/styles/modules-ontology.css`

任务：

1. 内置校验：无证据主张、禁止表达、重复概念、孤立概念、粒度过粗 / 过细、来源缺失。
2. 生成审核任务列表。
3. 支持通过、驳回、合并、拆分、改名、降级待验证和标记禁止使用。
4. 更新质量指标：证据覆盖率、审核覆盖率、矩阵可生产率。

验收：

- 未审核项不能发布。
- `forbidden` 和 `needs-verification` 主张不能进入可发布 Prompt。
- 审核记录可追溯到操作者、时间和修改前后快照。

### P5：发布到场景库、Prompt 工作台和 SOP

目标：

- Ontology 不停留在结构化列表，而是驱动现有内容生产链路。

写集：

- `src/main/services/ontologyPublishService.ts`
- `src/main/services/sceneLibraryStore.ts`
- `src/main/services/promptDraftStore.ts`
- `src/main/services/workflowEngine.ts`
- `src/renderer/src/components/modules/OntologyModule.tsx`

任务：

1. 将审核通过的 coverage row 转换为 `SceneCard`。
2. 生成 `PromptGroundingContext`，只注入相关子图。
3. 从 ready rows 批量生成 PromptDraft。
4. 支持把 coverage rows 作为 SOP 输入。
5. 产物完成后回写 coverage 状态。
6. 写入 ActionLog，记录目标、coverageRowIds、输出产物和 blocked 原因。

验收：

- 能从卖点 / 场景矩阵生成 SceneCard。
- 能从审核通过组合生成图片 Prompt / 视频 Prompt / 文案 Prompt。
- Prompt 不包含禁止表达和未验证主张。
- SOP 运行记录保留 ontologyId、coverageRowIds 和 sourceRefs。
- PromptDraft / WorkflowRun 的生成动作可追溯到 ActionLog。

### P5.5：发布 Agent Knowledge v0.7.2 ontology-aware 知识包

目标：

- 将审核通过的 Ontology 序列化为 Agent Knowledge 标准知识包，供知识库、Prompt 工作台和后续 Agent 客户端消费。

写集：

- `src/main/services/agentKnowledgeOntologyExportService.ts`
- `src/main/services/ontologyPublishService.ts`
- `src/renderer/src/components/modules/OntologyModule.tsx`
- `docs/roadmap/ontology/*`

任务：

1. 生成 `KNOWLEDGE.md`，写入 `type: content-ontology`、`runtime.mode: data` 和 `metadata.primaryOntology`。
2. 生成 `ontology/ontology.json`、`concepts.json`、`relations.json`、`claims.json`、`evidence.json`、`constraints.json` 和 `coverage.json`。
3. 生成 `compiled/prompt-grounding.md`，只包含运行时可注入的摘要，不包含构建 prompt。
4. 写入 `metadata.producedBy` 和构建运行 provenance。
5. 增加包校验：缺少 `primaryOntology`、`ontology/` 包含可执行指令、未审核主张进入 ready 包时必须失败。

验收：

- 能从审核通过的 Ontology 导出一个 Agent Knowledge v0.7.2 兼容目录包。
- 包内 `ontology/` 是数据层，不是 Skill、workflow 或 prompt 指令通道。
- 包校验失败时不覆盖已有发布包。
- Prompt 工作台消费包时只加载相关子图。

## 2. MVP 完成标准

MVP 范围对应 P1-P5 的最小闭环：

```text
产品资料 / SKU / 评论 / 知识库
-> Ontology draft
-> 卖点和痛点矩阵
-> 证据与规则校验
-> 人工审核
-> 场景卡 / PromptDraft
-> ActionLog
```

完成标准：

- 至少支持 `brand-product` 和 `user-feedback` 两种 scope。
- 能从至少 3 类输入源抽取候选概念：产品 brief、SKU / 表格文本、用户评论 / 客服问题。
- 能生成卖点矩阵和场景覆盖矩阵。
- 能执行规则校验并生成审核任务。
- 能人工审核并阻止未审核 / 禁止项进入下游。
- 能发布到 SceneCard 或 PromptDraft。
- 能导出 Agent Knowledge v0.7.2 ontology-aware 知识包。
- 能记录构建运行、模型配置、来源引用和审核结果。
- 能记录从 ready coverage row 到 PromptDraft / WorkflowRun 的 ActionLog。
- `npm run typecheck` 通过。

## 3. v1 阶段

### P6：IP Ontology

目标：

- 将 IP 知识库六层体系映射为 Ontology。

任务：

1. 抽取身份、观点、语言规则、方法论、故事、创作规则。
2. 建立 IP 观点、平台场景和内容角度关系。
3. 阻止 IP 人设漂移。
4. 生成口播、文案、私域和产品化 Prompt Grounding Context。

验收：

- IP 内容必须引用同一 IP 知识库版本。
- 平台内容不会互相冲突或改写核心立场。

### P7：成功素材回写

目标：

- 让审核通过和表现好的素材反哺 Ontology。

任务：

1. 素材关联 Prompt、卖点、场景、渠道和审核标签。
2. 更新 coverage row 的 `covered` 状态。
3. 标记高表现组合和质量原因。
4. 为后续批量生成排序。

验收：

- 素材库能展示覆盖组合。
- 覆盖矩阵能看到已有素材和缺口。

### P8：审核台和 Prompt 工作台深度集成

目标：

- 让 Ontology 成为内容审核和 Prompt 注入的默认事实层。

任务：

1. 审核台展示证据、风险、禁用表达和来源。
2. Prompt 工作台按目标渠道自动选择相关子图。
3. 支持对待验证主张发起补证据任务。

验收：

- 审核人员能解释素材为什么可用或不可用。
- Prompt 上下文更短且更稳定，不需要塞完整文档。

### P8.5：Operational Ontology 最小操作层

目标：

- 支持把市场信号、获客目标和已审核资源组合成轻量 CampaignCell，并通过标准 ActionType 触发内容行动。

任务：

1. 定义 `Signal`、`Objective`、`CampaignCell`、`ResourceBundle`、`ActionType`、`DecisionGate` 和 `FeedbackLoop`。
2. 从评论痛点、竞品观察、素材表现和人工记录创建 `Signal`。
3. 允许用户选择目标、渠道、ready coverage rows、PromptDraft、SceneCard、素材和 SOP 组成 `ResourceBundle`。
4. 执行 `generate-prompt-draft`、`request-review`、`request-evidence`、`launch-sop-run` 等标准动作。
5. 每次执行前检查证据、审核状态、禁用表达和操作者权限。
6. 每次执行后写入 ActionLog，并将结果回写覆盖矩阵。

验收：

- 一个 Signal 能转成 Objective 和 CampaignCell。
- CampaignCell 能组合已审核资源并触发标准 ActionType。
- DecisionGate 未通过时不执行动作，并写入 blocked 原因。
- ActionLog 能串起目标、资源、产物、审核和回写。

### P9：互操作导出

目标：

- 在不改变运行时事实源的前提下，提供标准导出。Agent Knowledge 知识包是内容工厂优先发布格式，JSON-LD / RDF / Turtle 是图谱工具互操作格式。

任务：

1. 定义命名空间。
2. 保持 Agent Knowledge 发布包与内部事实源版本一致。
3. 导出 JSON-LD / RDF / Turtle 之一。
4. 导出 sourceRefs、evidence、relations 和 constraints。

验收：

- 导出文件可被标准 RDF 工具读取。
- 导出失败不影响本地 Ontology。

## 4. 远景阶段

远景目标不是把客户端做成庞大的知识图谱平台，而是形成内容工程能力：

- 行业模板库：美妆、食品、教育、母婴、B2B SaaS、电商详情页。
- 品牌 Ontology 版本：支持 diff、merge、变更说明和回滚。
- 跨项目概念映射：同义卖点、相似痛点、复用场景。
- 规则包市场：合规、品牌语气、平台风格、禁用表达。
- 外部图谱互操作：SPARQL、企业知识库、标准行业词表。
- 自动补证据任务：发现无证据主张后回到输入源或要求用户补材料。
- 生成质量学习：基于审核结果和素材表现调整矩阵排序。
- 多 CampaignCell 协同：围绕同一品牌目标组织多组内容行动。
- 资源调度推荐：根据目标、渠道、证据强度和历史表现推荐 ResourceBundle。
- 行动复盘看板：按 Signal、Objective、ActionType 和渠道查看效果。

## 5. 验证计划

MVP 开发至少执行：

```bash
npm run typecheck
```

涉及发布到场景库、PromptDraft、SOP 或 IPC 主链时，补充：

```bash
npm run build
npm run smoke:electron
```

功能验收建议新增：

```bash
npm run test:functional -- ontology
```

验收样例至少覆盖：

- 产品 brief 卖点拆解。
- SKU 表卖点矩阵。
- 评论痛点聚类。
- 无证据主张拦截。
- 审核通过后发布到 PromptDraft。
- ready coverage row 生成 PromptDraft 后写入 ActionLog。
- DecisionGate 阻断未审核 / 禁用表达的 ActionType。
- 未配置模型 blocked 分支。

## 6. 风险控制

| 风险 | 控制方式 |
| --- | --- |
| 过度建模 | MVP 只覆盖内容生产高频概念和关系。 |
| LLM 幻觉 | sourceRefs、evidence 和人工审核作为硬门槛。 |
| 组合爆炸 | 覆盖矩阵必须支持排序、筛选和分批发布。 |
| UI 复杂 | 普通用户看矩阵和审核任务，不直接编辑图。 |
| 与 v2 模型重复 | Ontology 只做关系和约束层，下游复用现有 SceneCard / PromptDraft / SOP。 |
| 标准化过早 | JSON 运行时优先，RDF / OWL 后置导出。 |
| 与 Agent Knowledge 标准分裂 | Content Studio 只维护内部编辑态，对外发布统一走 v0.7.2 ontology-aware 知识包。 |
| Operational Ontology 过度扩张 | MVP 只做 ActionLog，v1 只做内容行动相关的 CampaignCell 和 DecisionGate。 |
| 舆论获客滥用风险 | 禁止虚假互动、自动刷量和绕过审核；所有行动必须过证据、权限和平台规则闸口。 |

## 7. 里程碑定义

| 里程碑 | 完成内容 | 主线完成度 |
| --- | --- | --- |
| MVP | brand-product / user-feedback Ontology、卖点矩阵、覆盖矩阵、审核、发布到 PromptDraft、最小 ActionLog、导出 Agent Knowledge 知识包。 | 35% |
| v1 | IP Ontology、素材回写、审核台和 Prompt 工作台深度集成、Operational Ontology 最小操作层、Agent Knowledge 包消费、互操作导出。 | 70% |
| 远景 | 行业模板、版本 diff、跨项目映射、规则包、多 CampaignCell 协同、资源调度推荐和外部图谱互操作。 | 100% |
