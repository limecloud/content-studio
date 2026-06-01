# Ontology v1 数据模型

更新时间：2026-06-01
状态：Local Verified / Production Evidence Pending

## 1. 设计结论

v1 采用业务服务端事实源优先：Bugu 保存团队工作区、权限、审核、冲突、行动记录、素材覆盖和知识包 release；LimeCore 只提供 OEM 云服务端能力；Content Studio 的本地 JSON 只作为缓存、离线草稿和运行临时产物。RDF / OWL 不作为 v1 前置依赖，后续只作为互操作导出。

事实源分类：

| 分类 | 位置 | 作用 |
| --- | --- | --- |
| 业务事实源 | Bugu `api.bugu.run` / 业务 API | 内容工作区、版本、审核、执行队列、行动记录、素材覆盖和知识包 release。 |
| OEM 云底座 | LimeCore control-plane / gateway | 租户、账号、权益、模型策略、Gateway、计费、发布中心和 Agent App enablement。 |
| 本地缓存 | `.content-studio/` | 最近打开项目、矩阵摘要、运行日志、离线草稿、待同步变更和本地导出预览。 |
| 发布包 | Agent Knowledge v0.7.2 | 审核后的稳定知识版本，给 Prompt、SOP 和 Agent 客户端消费。 |

## 2. 运行时数据位置

### 2.1 Bugu 业务服务端对象

| 对象 | 归属 | 作用 |
| --- | --- | --- |
| `ContentWorkspace` | Bugu business backend | 团队内容工程项目。 |
| `KnowledgeMap` | Bugu business backend | 知识地图、概念、关系、证据、约束和覆盖矩阵的团队版本。 |
| `BuildRun` | Bugu business backend + LimeCore Gateway trace | 构建运行、模型配置、步骤日志、blocked 原因和质量摘要。 |
| `ReviewTask` / `ReviewDecision` | Bugu business backend | 审核任务、审核决策、修改前后快照和操作者记录。 |
| `ExecutionQueueItem` | Bugu business backend | 作战目标下的可执行、待审核、待补资源、已拦截和已交接动作项。 |
| `ActionRecord` | Bugu business backend | Signal、Objective、ResourceBundle、ActionType 执行和行动记录。 |
| `MaterialCoverage` | Bugu business backend | 素材文件引用、审核标签和覆盖回写。 |
| `KnowledgeRelease` | Bugu business backend | 团队知识包版本、发布说明、对象存储地址和消费状态。 |

### 2.2 Content Studio 本地缓存

| 文件 | 定位 |
| --- | --- |
| `.content-studio/content-knowledge-maps.json` | 最近打开工作区的知识地图缓存副本和离线草稿，不是团队事实源。 |
| `.content-studio/content-knowledge-map-build-runs.json` | 本机生成流程、步骤日志、待配置原因、模型失败原因和质量摘要。 |
| `.content-studio/content-review-tasks.json` | 本机待提交审核草稿、服务端审核摘要缓存和审核决策历史。 |
| `.content-studio/content-production-handoffs.json` | Prompt、场景卡和 SOP 交接记录，以及发布检查通过 / 未通过的行动记录。 |
| `.content-studio/brand-command-centers.json` | 品牌战情室、目标树、资源包、执行队列和行动记录缓存。 |
| `.content-studio/scene-cards.json` | 下游场景卡缓存，复用现有 store。 |
| `.content-studio/prompt-drafts.json` | 下游 PromptDraft 缓存，复用现有 store。 |
| `.content-studio/workflow-runs.json` | SOP 运行记录缓存，复用现有 workflow store。 |
| `.content-studio/assets/` | 本地素材文件、预览、临时导入和待上传登记。 |
| `.content-studio/team-sync.json` | 租户、工作区、服务端 revision、未同步草稿和最近同步状态。 |
| `.content-studio/content-draft-changes.json` | 本地待提交、已导入和已合并的离线变更。 |
| `.content-studio/content-knowledge-releases.json` | 团队知识包 release 元数据、本机预览路径和服务端包地址缓存。 |
| `.content-studio/exports/agentknowledge/<contentKnowledgeMapId>/` | Agent Knowledge v0.7.2 本地导出预览，正式 release 由服务端记录。 |

保留策略：

- 生成流程、审核任务、生产交接、离线变更、品牌战情室和知识地图版本属于可审计事实，本地 Store 不按展示阈值截断。
- UI 可以按“最近 N 条”分页或折叠展示，但不能通过 Store save / append 删除历史记录。
- `ReviewDecision`、品牌战情室 `ActionRecord` 和已发布团队知识包 release 是追加 / 不可变事实，普通本机更新不能删除、覆盖或篡改。
- 生成日志、Prompt 草稿、SOP 运行等非 v1 审计主线对象可继续采用模块自己的展示缓存策略，后续按具体业务风险再收敛。

## 3. 核心对象

### 3.1 `OntologyWorkspace`

一个品牌、产品、IP、活动或混合项目的 Ontology 根对象。

建议字段：

- `id`
- `title`
- `scope`
- `schemaVersion`
- `status`
- `sourceInputSourceIds`
- `knowledgeBaseIds`
- `concepts`
- `relations`
- `evidenceItems`
- `constraints`
- `coverageMatrices`
- `quality`
- `createdAt`
- `updatedAt`

当前 Content Studio 落地字段：

| 字段 | 说明 |
| --- | --- |
| `sourceInputSourceIds` | 产品资料、SKU 表、评论、竞品观察、素材记录等输入源引用。 |
| `brandKnowledgeBaseIds` | 品牌 / 产品知识库版本引用。 |
| `ipKnowledgeBaseIds` | IP 六层知识库版本引用；用于保证口播、私域和文章引用同一 IP 版本。 |
| `sellingPoints` | 卖点、SKU 组合、IP 核心立场、IP 语言规则、差异化机会等矩阵行。 |
| `painPoints` | 用户反馈痛点、竞品反馈模式和购买异议。 |
| `scenarios` | 场景卡、SKU 场景、IP 延伸场景和竞品内容结构参考。 |
| `evidence` | 输入源、品牌知识库、IP 知识库和场景卡产生的来源证据。 |
| `constraints` | 品牌合规、IP 立场、禁用表达和竞品不可搬运边界。 |
| `sourceSensitivity` | 输入源共享范围摘要；普通用户界面显示为“共享范围”，用于阻断仅本机资料进入团队同步和知识包发布。 |
| `coverage.skuRowCount` | SKU 表解析出的 SKU 行数。 |
| `coverage.ipKnowledgeBaseCount` | 接入的 IP 知识库版本数。 |
| `coverage.competitorObservationCount` | 接入的竞品观察输入数。 |

当前矩阵展示层不直接暴露内部 `CoverageMatrix` 对象。Content Studio 用 `src/shared/contentMatrixPlanning.ts` 将 `sellingPoints`、`painPoints` 和 `scenarios` 规划为可筛选、可排序、可分页和可本批送审的视图数据；审核任务生成接口通过 `targetRowIds` 只处理用户当前选择的矩阵行。

关键约束：

- SKU 表可以作为产品规格证据，但缺证据或解析失败的组合不能进入 ready。
- IP 知识库可生成场景和表达规则，但不同渠道只能改形式，不能改身份、观点和语言边界。
- 竞品观察只能生成待审核机会和结构参考，不能作为本品牌事实证据，也不能进入可直接发布的 PromptDraft。

输入源共享范围：

```ts
export type InputSourceSensitivity =
  | 'public'
  | 'internal'
  | 'confidential'
  | 'restricted';

export interface ContentKnowledgeMapSourceSensitivitySummary {
  highest: InputSourceSensitivity;
  counts: Record<InputSourceSensitivity, number>;
  restrictedSourceTitles: string[];
  confidentialSourceTitles: string[];
}
```

落地规则：

- `public`：公开资料，可进入团队事实源和发布包。
- `internal`：团队内部资料，默认可进入团队资料流。
- `confidential`：客户资料、未公开产品或投放数据，需要负责人确认后进入团队资料流；当前不会静默公开。
- `restricted`：仅本机资料，构建可生成本机草稿，但 `ContentKnowledgeMapApplicationService` 不会同步到 Bugu，`ContentWorkspaceSyncService` 也会阻止变更包提交和团队知识包发布。

`scope`：

```ts
export type OntologyScope =
  | 'brand-product'
  | 'ip'
  | 'user-feedback'
  | 'competitor'
  | 'material'
  | 'campaign'
  | 'mixed';
```

### 3.2 `Concept`

内容工程里的可复用概念节点。

```ts
export type OntologyConceptType =
  | 'brand'
  | 'product'
  | 'sku'
  | 'feature'
  | 'attribute'
  | 'selling-point'
  | 'benefit'
  | 'claim'
  | 'pain-point'
  | 'objection'
  | 'audience'
  | 'persona'
  | 'scenario'
  | 'moment'
  | 'space'
  | 'action'
  | 'emotion'
  | 'channel'
  | 'content-angle'
  | 'proof'
  | 'constraint'
  | 'material'
  | 'ip-position'
  | 'ip-voice-rule'
  | 'methodology'
  | 'topic'
  | 'competitor'
  | 'signal'
  | 'objective'
  | 'campaign-cell'
  | 'resource-bundle'
  | 'decision-gate'
  | 'feedback-loop';
```

建议字段：

- `id`
- `type`
- `name`
- `description`
- `aliases`
- `status`
- `granularity`
- `sourceRefs`
- `evidenceIds`
- `riskLevel`
- `tags`
- `createdAt`
- `updatedAt`

### 3.3 `Relation`

概念之间的有向关系。

```ts
export type OntologyRelationType =
  | 'has-feature'
  | 'has-attribute'
  | 'supports-selling-point'
  | 'expresses-benefit'
  | 'solves-pain-point'
  | 'targets-audience'
  | 'fits-scenario'
  | 'happens-in-moment'
  | 'happens-in-space'
  | 'uses-action'
  | 'evokes-emotion'
  | 'supported-by'
  | 'challenged-by-objection'
  | 'restricted-by'
  | 'suitable-for-channel'
  | 'generates-content-angle'
  | 'covered-by-material'
  | 'derived-from-competitor-observation'
  | 'triggered-by-signal'
  | 'pursues-objective'
  | 'uses-resource-bundle'
  | 'requires-decision-gate'
  | 'executed-by'
  | 'logs-action'
  | 'feeds-back-to'
  | 'same-as'
  | 'broader-than'
  | 'narrower-than'
  | 'related-to';
```

建议字段：

- `id`
- `type`
- `sourceConceptId`
- `targetConceptId`
- `confidence`
- `status`
- `sourceRefs`
- `evidenceIds`
- `createdAt`
- `updatedAt`

### 3.4 `Evidence`

证据决定主张能否进入生产链路。

```ts
export type EvidenceKind =
  | 'source-document'
  | 'product-spec'
  | 'sku-row'
  | 'user-quote'
  | 'customer-service-log'
  | 'case-study'
  | 'manual-note'
  | 'material-reference'
  | 'competitor-observation'
  | 'generated-inference';

export type EvidenceStrength =
  | 'verified'
  | 'weak'
  | 'needs-verification'
  | 'forbidden';
```

建议字段：

- `id`
- `kind`
- `title`
- `excerpt`
- `sourceRef`
- `strength`
- `riskLevel`
- `verifiedBy`
- `verifiedAt`

规则：

- `generated-inference` 只能作为线索，不能直接批准高风险主张。
- 用户原声必须保留来源和原文片段。
- 竞品观察只能作为结构参考，不作为品牌事实证据。

### 3.5 `Constraint`

约束用于控制生成、审核和发布。

建议类型：

- `forbidden-claim`
- `forbidden-wording`
- `requires-evidence`
- `channel-policy`
- `brand-voice`
- `ip-voice-rule`
- `competitor-boundary`
- `legal-risk`
- `manual-review-required`

建议字段：

- `id`
- `type`
- `title`
- `description`
- `severity`
- `appliesToConceptIds`
- `sourceRefs`
- `createdAt`
- `updatedAt`

## 4. 覆盖矩阵

`CoverageMatrix` 是 v1 的核心生产结构，用于把穷举变量转成可筛选、可审核、可发布的组合。

建议字段：

- `id`
- `type`
- `dimensions`
- `rows`
- `quality`
- `createdAt`
- `updatedAt`

矩阵类型：

```ts
export type CoverageMatrixType =
  | 'selling-point'
  | 'pain-point'
  | 'audience-scenario'
  | 'ip-content'
  | 'competitor-opportunity'
  | 'material-coverage'
  | 'campaign-resource';
```

行字段：

- `id`
- `conceptIds`
- `audienceId`
- `painPointId`
- `sellingPointId`
- `scenarioId`
- `channelId`
- `materialIds`
- `evidenceIds`
- `status`
- `priority`
- `riskLevel`
- `reviewDecisionId`
- `publishedArtifactRefs`
- `performanceTags`

当前 Content Studio 的 `ContentKnowledgeMapMatrixRow` 对应更轻量的行结构：`id`、`title`、`summary`、`tags`、`sourceRefs`、`evidenceRefs`、`materialStatus`、`materialRefs`、`performanceTags`、`confidence` 和 `status`。分页、排序和本批摘要是展示计划，不写回为领域事实；审核任务只保存被送审行的 `targetId` 和来源引用。

行状态：

```ts
export type CoverageRowStatus =
  | 'candidate'
  | 'missing-evidence'
  | 'missing-material'
  | 'needs-review'
  | 'ready'
  | 'published'
  | 'blocked'
  | 'deprecated';
```

## 5. 审核和校验

### 5.1 `ValidationIssue`

校验问题建议类型：

- `missing-source`
- `missing-evidence`
- `forbidden-claim`
- `forbidden-wording`
- `duplicate-concept`
- `orphan-concept`
- `too-broad`
- `too-specific`
- `competitor-copy-risk`
- `ip-voice-drift`
- `channel-policy-risk`

### 5.2 `ReviewDecision`

审核动作：

```ts
export type ReviewAction =
  | 'approve'
  | 'reject'
  | 'merge'
  | 'split'
  | 'rename'
  | 'downgrade-to-needs-verification'
  | 'mark-forbidden'
  | 'request-evidence';
```

审核记录必须保存：

- 审核人。
- 审核时间。
- 目标对象。
- 修改前快照。
- 修改后快照。
- 原因。
- 关联 validation issues。

## 6. Prompt Grounding

`PromptGroundingContext` 是给 Prompt 工作台和 SOP 的最小相关子图，不是完整文档拼接。

建议字段：

- `ontologyId`
- `coverageRowIds`
- `concepts`
- `claims`
- `evidence`
- `constraints`
- `forbiddenExpressions`
- `sourceRefs`
- `reviewSummary`

规则：

- 只包含目标任务相关子图。
- 不包含 rejected、forbidden、deprecated 概念。
- `needs-verification` 主张只能作为待确认信息，不能写成确定表达。
- 必须包含禁用表达和品牌 / IP 约束。

## 7. 品牌内容作战系统

操作层对象只负责品牌内容作战编组、执行队列、行动记录和复盘，不负责自动发布。

| 对象 | 字段重点 | 说明 |
| --- | --- | --- |
| `Signal` | `source`、`summary`、`urgency`、`businessValue`、`riskLevel`、`relatedConceptIds` | 来自评论、竞品、热点、投放、素材表现、品牌风险和人工观察。 |
| `Objective` | `type`、`targetAudienceIds`、`channelIds`、`successCriteria` | 拉新、转化、解释异议、信任建设、价格防守、风险拦截、补证据、补素材。 |
| `CampaignCell` | `members`、`agentRefs`、`objectiveIds`、`resourceBundleIds` | 临时内容作战单元。 |
| `ResourceBundle` | `coverageRowIds`、`sceneCardIds`、`promptDraftIds`、`materialIds`、`sopIds`、`forbiddenExpressions`、`gaps` | 可快速组合的资源包，必须说明可用依据、可产物和不能说什么。 |
| `DecisionGate` | `requiredEvidence`、`reviewStatus`、`constraints`、`permissions`、`platformRules`、`materialStatus` | 执行前发布检查。 |
| `ExecutionQueueItem` | `campaignCellId`、`actionType`、`status`、`blockedReason`、`recoveryAction` | 可执行、待审核、待补资源、已拦截、已交接和已回写的动作项。 |
| `ActionLog` | `actor`、`actionType`、`inputs`、`outputs`、`decision`、`blockedReason`、`artifactRefs` | 行动、结果和本机交付文件记录。 |

标准 `ActionType`：

- `generate-prompt-draft`
- `create-scene-card`
- `request-review`
- `request-evidence`
- `launch-sop-run`
- `create-material-gap-list`
- `export-agent-knowledge-pack`
- `write-back-material-coverage`

`create-material-gap-list` 的标准交付包：

```text
.content-studio/exports/brand-command-material-gaps/<动作标题>-<时间>/
  manifest.json
  material-gap-list.md
  material-gap-list.json
```

约束：

- `material-gap-list.json` 使用 `buguai.brand-command.material-gap-list.v1` schema。
- 清单必须包含资源包、目标人群、渠道、内容形式、使用场景、证据线索、禁用边界、缺口行、素材状态和审核任务 ID。
- 本机行动记录保留完整文件路径用于打开交付物；同步到 Bugu 的行动记录只保留脱敏后的交付物线索。
- 清单不得包含账号凭证、API Key、自动发布指令或本机绝对路径。

## 8. Agent Knowledge v0.7.2 映射

导出包结构：

```text
KNOWLEDGE.md
ontology/
  ontology.json
  concepts.json
  relations.json
  claims.json
  evidence.json
  constraints.json
  coverage.json
answers/
  questions.json
  answer-blocks.json
  citation-targets.json
assets/
  material-coverage.json
interop/
  ontology.jsonld
  ontology.ttl
  ontology.rdf
compiled/
  prompt-grounding.md
```

`KNOWLEDGE.md` frontmatter：

```yaml
type: content-ontology
runtime:
  mode: data
metadata:
  primaryOntology: ontology/ontology.json
  primaryAnswers: answers/questions.json
  producedBy: content-studio
```

映射规则：

| Content Studio 对象 | Agent Knowledge 文件 |
| --- | --- |
| `OntologyWorkspace` | `ontology/ontology.json` |
| `Concept[]` | `ontology/concepts.json` |
| `Relation[]` | `ontology/relations.json` |
| `claim` 类型概念 | `ontology/claims.json` |
| `Evidence[]` | `ontology/evidence.json` |
| `Constraint[]` | `ontology/constraints.json` |
| `CoverageMatrix[]` | `ontology/coverage.json` |
| 高价值 FAQ / 购买问题 | `answers/questions.json` |
| 已审核回答块 | `answers/answer-blocks.json` |
| 可引用来源 | `answers/citation-targets.json` |
| 素材覆盖关系、表现标签和素材引用 | `assets/material-coverage.json` |
| 外部图谱分析 | `interop/ontology.jsonld`、`interop/ontology.ttl`、`interop/ontology.rdf` |
| 子图摘要 | `compiled/prompt-grounding.md` |

约束：

- `ontology/` 是数据，不是脚本、workflow 或 prompt 指令。
- `answers/` 是可选 answer-ready 层，不是 GEO 排名操控层。
- `assets/` 只保存素材覆盖引用、覆盖维度和表现标签，不保存本机素材路径。
- `interop/` 只服务外部图谱工具分析，不替代 Bugu 团队事实源，也不是 v1 运行时依赖。
- 包校验失败时不能覆盖已有导出。

## 9. 团队共享模型

团队共享模型用于服务端异步协作，不等同于实时多人编辑。

### 9.1 `ContentTeamWorkspace`

建议字段：

- `id`
- `tenantId`
- `name`
- `ownerUserId`
- `currentRevision`
- `publishedReleaseIds`
- `defaultKnowledgeReleaseId`
- `roleBindings`
- `syncPolicy`
- `createdAt`
- `updatedAt`

```ts
export type ContentWorkspaceSyncPolicy =
  | 'server-authoritative'
  | 'offline-draft-allowed'
  | 'read-only-release';
```

### 9.2 `DraftChange`

本地离线草稿或一次服务端提交的最小变更单位。

建议字段：

- `id`
- `tenantId`
- `workspaceId`
- `ontologyId`
- `baseRevision`
- `targetRevision`
- `authorUserId`
- `summary`
- `changes`
- `affectedObjectIds`
- `reviewRequirement`
- `syncStatus`
- `createdAt`

规则：

- `ReviewDecision` 和 `ActionRecord` 只能追加，不能被普通草稿删除。
- Bugu 合并必须检查 `baseRevision`、对象 hash、业务角色和发布检查；涉及租户权益、模型策略和发布中心时再调用 LimeCore。
- 冲突不能静默覆盖，必须进入冲突队列。
- 已发布 release 不能原地修改，只能创建新 release。
- Content Studio 本地 Store 只允许通过 Bugu 团队同步入口刷新已发布 release 元数据；普通本机 `save/update` 不能改写版本号、包文件、sha256、对象存储地址或来源 revision。

### 9.3 `KnowledgeRelease`

团队可消费的稳定版本。

建议字段：

- `id`
- `tenantId`
- `workspaceId`
- `ontologyId`
- `version`
- `sourceRevision`
- `agentKnowledgePackUrl`
- `packageObjectKey`
- `packagePublicUrl`
- `packageUploadStatus`
- `packageSha256`
- `packageSize`
- `releaseNotes`
- `approvedBy`
- `createdAt`

`KnowledgeRelease` 和 Agent Knowledge v0.7.2 包一一对应。Prompt 工作台、SOP 和 Agent 客户端默认消费 release，而不是消费某个人的本地 draft。

当前实现中，Content Studio 生成 Agent Knowledge zip、sha256 和 size；Bugu release 记录对象存储 key、公开 URL 和上传状态。Content Studio 可按已同步工作区拉取团队 release 列表，并将服务端包地址与本机预览路径合并到本地缓存。拉取时按 `serverReleaseId` 收敛到同一记录，不生成重复版本；本地发布历史不因展示阈值截断。未配置公开对象存储时只能显示“发布包已登记”，不能显示“可下载”。
