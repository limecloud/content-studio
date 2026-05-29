# 布谷AI内容工厂 Ontology 模型

更新时间：2026-05-28  
状态：Draft

## 1. 设计结论

Ontology 的运行时模型先采用本地 JSON 事实源，而不是直接引入 RDF / OWL 运行时。原因是当前产品的核心需求是内容生产、证据追溯和矩阵覆盖，不是通用语义推理平台。

对外发布和知识库互操作对齐 Agent Knowledge v0.7.2 ontology-aware 知识包：Content Studio 内部继续维护可编辑事实源，发布时序列化为 `KNOWLEDGE.md` + `ontology/` 的目录包。

```text
OntologyWorkspace
-> Concept
-> Relation
-> Evidence
-> Constraint
-> CoverageMatrix
-> OperationalAction
-> ActionLog
-> ValidationIssue
-> ReviewDecision
-> SceneCard / PromptDraft / SOP
```

后续需要互操作时，再从同一份事实源导出 JSON-LD / RDF / Turtle。这样既能保持 KISS，也给远景留出标准化出口。

## 2. 单一事实源

| 事实域 | 事实源 |
| --- | --- |
| Ontology 草稿、概念、关系、证据、约束 | `.content-studio/ontologies/*.json` |
| 构建运行记录 | `.content-studio/ontology-runs.json` |
| 审核记录 | `.content-studio/ontology-reviews.json` |
| 内容行动、资源编组和复盘记录 | `.content-studio/ontology-actions.json` |
| 输入源原文和转换稿 | 复用 `WorkflowInputSourceStore` / `KnowledgeBaseStore` |
| 场景卡和提示词 | 复用 `SceneLibraryStore` / `PromptDraftStore` |
| 素材覆盖回写 | 复用素材库、审核记录和 Ontology coverage update |
| Agent Knowledge 发布包 | `exports/agentknowledge/<ontologyId>/` |
| 互操作导出 | `exports/ontology/<ontologyId>/` |

## 3. 核心实体

### 3.1 `OntologyWorkspace`

一个品牌、产品、IP 或项目的 Ontology 根记录。

字段建议：

- `id`
- `workspacePath`
- `title`
- `scope`
- `sourceInputSourceIds`
- `knowledgeBaseIds`
- `schemaVersion`
- `status`
- `concepts`
- `relations`
- `evidenceItems`
- `constraints`
- `coverageMatrices`
- `quality`
- `createdAt`
- `updatedAt`

`scope` 建议：

```ts
export type OntologyScope =
  | 'brand-product'
  | 'ip'
  | 'user-feedback'
  | 'competitor'
  | 'campaign'
  | 'mixed';
```

### 3.2 `Concept`

内容生产里的概念节点，不要求用户理解图数据库术语。

核心类型：

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
  | 'signal'
  | 'objective'
  | 'campaign-cell'
  | 'resource-bundle'
  | 'decision-gate'
  | 'feedback-loop'
  | 'ip-position'
  | 'ip-voice-rule'
  | 'methodology'
  | 'topic';
```

字段建议：

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
- `createdBy`
- `createdAt`
- `updatedAt`

状态建议：

```ts
export type OntologyItemStatus =
  | 'candidate'
  | 'reviewed'
  | 'approved'
  | 'rejected'
  | 'deprecated';
```

粒度建议：

```ts
export type ConceptGranularity =
  | 'too-broad'
  | 'usable'
  | 'too-specific'
  | 'duplicate';
```

### 3.3 `Relation`

概念之间的有向关系。

核心关系：

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
  | 'triggered-by-signal'
  | 'pursues-objective'
  | 'uses-resource-bundle'
  | 'requires-decision-gate'
  | 'executed-by'
  | 'logs-action'
  | 'feeds-back-to'
  | 'derived-from'
  | 'same-as'
  | 'broader-than'
  | 'narrower-than'
  | 'related-to';
```

字段建议：

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

证据是内容主张能否进入生产链路的关键。

字段建议：

- `id`
- `kind`
- `title`
- `excerpt`
- `sourceRef`
- `strength`
- `riskLevel`
- `verifiedBy`
- `verifiedAt`

证据类型：

```ts
export type EvidenceKind =
  | 'source-document'
  | 'product-spec'
  | 'sku-row'
  | 'user-quote'
  | 'customer-service-log'
  | 'case-study'
  | 'manual-note'
  | 'generated-inference';
```

证据强度：

```ts
export type EvidenceStrength =
  | 'verified'
  | 'weak'
  | 'needs-verification'
  | 'forbidden';
```

`generated-inference` 只能作为推断线索，不能直接让高风险主张进入可发布状态。

### 3.5 `Constraint`

约束用于控制生成和审核。

字段建议：

- `id`
- `type`
- `name`
- `description`
- `severity`
- `appliesToConceptTypes`
- `appliesToChannelIds`
- `rule`
- `sourceRefs`
- `status`

约束类型：

```ts
export type OntologyConstraintType =
  | 'forbidden-claim'
  | 'requires-evidence'
  | 'tone-rule'
  | 'channel-rule'
  | 'compliance-rule'
  | 'brand-wording-rule'
  | 'prompt-negative-rule';
```

### 3.6 `CoverageMatrix`

覆盖矩阵解决“各种穷举”问题。矩阵不是无限列列表，而是围绕一个业务目标生成可审核组合。

字段建议：

- `id`
- `title`
- `purpose`
- `dimensions`
- `rows`
- `summary`
- `createdAt`
- `updatedAt`

维度示例：

```text
人群 x 痛点 x 卖点 x 证据 x 场景 x 渠道 x 内容角度 x 素材类型
```

行字段建议：

- `id`
- `conceptIds`
- `status`
- `evidenceStatus`
- `materialCoverage`
- `priority`
- `riskLevel`
- `recommendedAction`
- `lastArtifactIds`

状态建议：

```ts
export type CoverageStatus =
  | 'ready'
  | 'missing-evidence'
  | 'missing-material'
  | 'needs-review'
  | 'blocked'
  | 'covered';
```

### 3.7 `OperationalAction`

`OperationalAction` 把 Ontology 从知识地图推进到操作地图。它不直接代表“自动发布”，而是代表一个受证据、权限和审核约束的标准内容行动。

核心对象：

```ts
export type OperationalObjectType =
  | 'signal'
  | 'objective'
  | 'campaign-cell'
  | 'resource-bundle'
  | 'action-type'
  | 'action-log'
  | 'decision-gate'
  | 'feedback-loop';
```

`Signal` 字段建议：

- `id`
- `kind`
- `title`
- `summary`
- `sourceRefs`
- `detectedAt`
- `priority`
- `riskLevel`
- `relatedConceptIds`

信号类型：

```ts
export type SignalKind =
  | 'hot-topic'
  | 'customer-feedback'
  | 'competitor-move'
  | 'campaign-performance'
  | 'platform-rule-change'
  | 'manual-observation';
```

`Objective` 字段建议：

- `id`
- `title`
- `goalType`
- `targetAudienceIds`
- `channelIds`
- `successMetric`
- `deadline`
- `riskLevel`
- `status`

目标类型：

```ts
export type ObjectiveGoalType =
  | 'awareness'
  | 'lead-generation'
  | 'conversion'
  | 'objection-handling'
  | 'brand-trust'
  | 'retention';
```

`CampaignCell` 字段建议：

- `id`
- `title`
- `signalIds`
- `objectiveIds`
- `operatorIds`
- `agentIds`
- `resourceBundleIds`
- `decisionGateIds`
- `actionTypeIds`
- `status`
- `createdAt`
- `updatedAt`

`ResourceBundle` 字段建议：

- `id`
- `title`
- `conceptIds`
- `coverageRowIds`
- `promptDraftIds`
- `sceneCardIds`
- `materialIds`
- `sopIds`
- `evidenceIds`
- `constraintIds`

`ActionType` 字段建议：

- `id`
- `name`
- `description`
- `requiredEvidenceStrength`
- `requiredReviewStatus`
- `allowedRoles`
- `inputSchema`
- `outputKind`
- `blockedByConstraintIds`

标准动作建议：

```ts
export type OntologyActionType =
  | 'generate-prompt-draft'
  | 'generate-scene-cards'
  | 'launch-sop-run'
  | 'request-evidence'
  | 'request-review'
  | 'publish-agent-knowledge-pack'
  | 'write-back-material-coverage'
  | 'create-follow-up-objective';
```

### 3.8 `ActionLog`

`ActionLog` 是内容行动的审计和学习入口。它记录谁基于什么目标、资源和证据做了什么，产物是什么，结果如何回写 Ontology。

字段建议：

- `id`
- `campaignCellId`
- `actionType`
- `actorType`
- `actorId`
- `objectiveIds`
- `signalIds`
- `resourceBundleIds`
- `inputRefs`
- `outputRefs`
- `decisionGateResult`
- `status`
- `blockedReason`
- `createdAt`
- `completedAt`
- `feedback`

状态建议：

```ts
export type ActionLogStatus =
  | 'planned'
  | 'running'
  | 'blocked'
  | 'completed'
  | 'review-required'
  | 'failed';
```

设计要求：

- ActionLog 可以证明“某次内容行动发生过并产生了结果”，不能证明产品事实本身。
- 任何会进入可发布内容的动作都必须经过 evidence、constraint 和 review gate。
- Agent 可以建议和执行低风险动作，但不能把 `needs-verification` 或 `forbidden` 主张绕过审核注入 Prompt。

## 4. 质量和校验模型

### 4.1 `ValidationIssue`

字段建议：

- `id`
- `severity`
- `issueType`
- `message`
- `conceptIds`
- `relationIds`
- `suggestedAction`
- `status`

问题类型：

```ts
export type OntologyValidationIssueType =
  | 'missing-evidence'
  | 'forbidden-claim'
  | 'duplicate-concept'
  | 'orphan-concept'
  | 'granularity-too-broad'
  | 'granularity-too-specific'
  | 'missing-source-ref'
  | 'conflicting-relation'
  | 'unsafe-channel-expression';
```

### 4.2 质量指标

| 指标 | 含义 |
| --- | --- |
| `evidenceCoverage` | 有证据支撑的主张占比。 |
| `reviewCoverage` | 已人工审核的概念和关系占比。 |
| `orphanConceptRate` | 没有有效关系的概念占比。 |
| `duplicateRate` | 疑似重复概念占比。 |
| `matrixReadiness` | 覆盖矩阵里可直接生产组合占比。 |
| `riskBlockedCount` | 因风险或禁用表达阻塞的组合数量。 |

## 5. 与现有 v2 模型的映射

| Ontology 对象 | 现有对象 | 映射方式 |
| --- | --- | --- |
| `sourceRefs` | `WorkflowSourceRef` | 直接复用来源引用结构。 |
| `brand-product` scope | `BrandKnowledgeBase` | 品牌事实、卖点和合规边界进入概念和约束。 |
| `ip` scope | `IpKnowledgeBase` | IP 六层进入 `ip-position`、`ip-voice-rule`、`methodology` 等概念。 |
| `scenario` | `SceneCard` | 审核通过后可生成或更新场景卡。 |
| `content-angle` | `PromptDraft` | 作为 Prompt 生成的结构化来源。 |
| `material` | `WorkflowArtifact` / 素材库 | 成功素材回写覆盖矩阵。 |
| `coverage row` | `WorkflowRun` 输入 | 可批量驱动 SOP 运行。 |
| `signal` | 用户评论 / 竞品观察 / 表现数据 | 作为创建 CampaignCell 的触发来源。 |
| `resource-bundle` | PromptDraft / SceneCard / SOP / 素材 | 把可用内容资源组合成一次行动输入。 |
| `action-log` | `WorkflowRun` / `PromptDraft` / 审核结果 | 记录目标、资源、产物、阻断原因和复盘。 |

## 6. Prompt Grounding Context

Prompt 不应注入完整 Ontology，而应注入与本次任务相关的子图。

字段建议：

- `ontologyId`
- `goal`
- `channel`
- `selectedConceptIds`
- `selectedRelationIds`
- `allowedClaims`
- `pendingClaims`
- `forbiddenClaims`
- `evidenceSnippets`
- `toneRules`
- `negativePromptRules`
- `coverageRowIds`
- `signalIds`
- `objectiveIds`
- `resourceBundleIds`
- `decisionGateIds`

示例：

```text
目标：生成小红书种草图 Prompt
子图：3 个目标人群、2 个痛点、4 个卖点、6 条证据、5 个场景、禁用医疗化表达
输出：10 条 UGC 手机实拍图片 Prompt
```

## 7. Agent Knowledge v0.7.2 发布包模型

Agent Knowledge 包是审核后 Ontology 的发布形态，不是内部编辑态。Content Studio 可以重新生成包，但不能把包内数据反向当成可执行流程。

推荐结构：

```text
<slug>-ontology/
├── KNOWLEDGE.md
├── documents/
│   └── product-brief.md
├── sources/
│   └── customer-feedback.md
├── ontology/
│   ├── ontology.json
│   ├── concepts.json
│   ├── relations.json
│   ├── claims.json
│   ├── evidence.json
│   ├── constraints.json
│   └── coverage.json
└── compiled/
    └── prompt-grounding.md
```

`KNOWLEDGE.md` frontmatter 示例：

```yaml
name: acme-content-ontology
description: Acme 产品的卖点、证据、人群、痛点、场景覆盖和内容约束。
type: content-ontology
profile: hybrid
status: ready
version: 1.0.0
language: zh-CN
grounding: required
runtime:
  mode: data
metadata:
  primaryDocument: documents/product-brief.md
  primaryOntology: ontology/ontology.json
  producedBy:
    kind: application
    name: content-studio
```

结构映射：

| Content Studio 对象 | Agent Knowledge 文件 |
| --- | --- |
| `OntologyWorkspace` | `ontology/ontology.json` |
| `Concept[]` | `ontology/concepts.json` |
| `Relation[]` | `ontology/relations.json` |
| `Concept(type='claim')` 或 Claim view | `ontology/claims.json` |
| `Evidence[]` | `ontology/evidence.json` |
| `Constraint[]` | `ontology/constraints.json` |
| `CoverageMatrix[]` | `ontology/coverage.json` |
| `PromptGroundingContext` 摘要 | `compiled/prompt-grounding.md` |

发布规则：

- `metadata.primaryOntology` 必须指向 `ontology/ontology.json`。
- `runtime.mode` 必须是 `data`，表示该包是知识数据，不是执行环境。
- `ontology/` 目录不得包含脚本、工具调用、workflow 指令或 prompt 注入指令。
- `metadata.producedBy` 和运行记录必须保存 provenance；如果后续使用 Builder Skill 构建，也只记录来源，不在运行时执行该 Skill。
- 运行时消费时只选择任务相关子图：选中概念、已批准主张、证据摘录、约束、禁用表达和覆盖矩阵行。

## 8. 文件布局草案

```text
.content-studio/
├── ontologies/
│   ├── ontology_<id>.json
│   └── ontology_<id>.issues.json
├── ontology-runs.json
├── ontology-reviews.json
├── ontology-actions.json
└── exports/
    ├── agentknowledge/
    │   └── <ontologyId>/
    │       ├── KNOWLEDGE.md
    │       ├── ontology/
    │       └── compiled/
    └── ontology/
        └── <ontologyId>/
            ├── ontology.json
            ├── ontology.jsonld
            └── ontology.ttl
```

## 9. 设计边界

- 不把所有概念预设成固定枚举；类型体系固定，概念实例由输入源和人工审核产生。
- 不把 LLM 生成的候选概念直接设为 approved。
- 不把没有证据的功效、结果和承诺注入可发布 Prompt。
- 不强制普通用户编辑关系图；UI 应以矩阵、列表、审核任务和场景卡为主。
- 不在 MVP 依赖 SPARQL 查询；常规筛选和矩阵查询用本地结构化数据即可。
- 不把 Agent Knowledge 的 `ontology/` 目录当作 Skill、workflow 或 prompt 指令通道。
