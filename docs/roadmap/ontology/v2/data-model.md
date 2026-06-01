# Ontology v2 本地数据模型草案

状态：Prototype Draft  
更新时间：2026-06-01

## 建模原则

本阶段不是先做复杂推理引擎，而是先把电商短视频制造过程里的事实、规则、任务和交付物落成稳定的本地数据结构。

核心原则：

- 输入先于阶段：所有阶段的 `inputRefs` 必须来自 `IntakePacket` 或人工确认记录。
- 批次是入口：所有对象都必须挂到 `ContentBatch`。
- 阶段是轨道：每个阶段都有 `StageRun`、输入、输出、门禁和恢复动作。
- 意图是流量入口：搜索词、评论和投放词只能解释用户任务，不能直接变成产品事实。
- 商品事实不能被表现数据污染：转化表现只能更新变量权重和规则，不能替代产品证据。
- Agent 只能生成阶段产物：不能绕过素材账本、审核结论、预算阈值和人工确认。
- 视频制造单是交付物：系统不伪造成片成功，真实生成能力未接入时保留 blocked 任务。

## 顶层对象

```ts
type StageId =
  | "selection"
  | "intent"
  | "modeling"
  | "selling"
  | "matrix"
  | "manufacturing"
  | "review"
  | "optimization"
  | "feedback";

type RunStatus =
  | "draft"
  | "ready"
  | "running"
  | "blocked"
  | "needs_human"
  | "approved"
  | "rejected";

interface ContentBatch {
  id: string;
  title: string;
  objective: string;
  ownerIds: string[];
  stageRuns: StageRun[];
  createdAt: string;
  updatedAt: string;
}

interface StageRun {
  id: string;
  batchId: string;
  stageId: StageId;
  status: RunStatus;
  inputRefs: ArtifactRef[];
  outputRefs: ArtifactRef[];
  gateResults: GateResult[];
  agentRuns: AgentRunRef[];
  recoveryTasks: RecoveryTask[];
}

interface ArtifactRef {
  kind: string;
  id: string;
  path?: string;
  summary: string;
}
```

## 输入层

```ts
type SourceConnectorKind =
  | "shop_api"
  | "erp_sync"
  | "file_upload"
  | "asset_library"
  | "platform_search"
  | "comment_stream"
  | "customer_service"
  | "ad_report"
  | "policy_feed"
  | "manual_entry";

type ConnectorStatus =
  | "connected"
  | "partial"
  | "pending"
  | "stale"
  | "blocked";

interface SourceConnector {
  id: string;
  kind: SourceConnectorKind;
  title: string;
  status: ConnectorStatus;
  ownerId: string;
  freshnessMinutes?: number;
  outputKinds: string[];
  blockedReason?: string;
}

interface IntakePacket {
  id: string;
  batchId: string;
  connectorId: string;
  packetType:
    | "product"
    | "asset"
    | "evidence"
    | "intent"
    | "delivery_metric"
    | "rule"
    | "human_approval";
  rawRef: ArtifactRef;
  normalizedRefs: ArtifactRef[];
  targetStages: StageId[];
  status: "raw" | "parsed" | "normalized" | "blocked" | "needs_human";
  lineageIds: string[];
}

interface InputBundle {
  id: string;
  batchId: string;
  packetIds: string[];
  readyForStages: StageId[];
  missingInputs: MissingInputTask[];
  createdAt: string;
}

interface InputLineage {
  id: string;
  packetId: string;
  sourceConnectorId: string;
  transformedBy: "parser" | "normalizer" | "agent" | "human";
  outputRef: ArtifactRef;
  createdAt: string;
}

interface MissingInputTask {
  id: string;
  batchId: string;
  targetStage: StageId;
  missingKind: "connector" | "file" | "evidence" | "asset" | "metric" | "human_approval";
  message: string;
  recoveryAction: string;
  status: RunStatus;
}

interface FillActionRequest {
  id: string;
  batchId: string;
  actionType:
    | "connect_system"
    | "upload_file"
    | "paste_text"
    | "manual_entry"
    | "import_history"
    | "create_missing_task";
  targetMissingInputId?: string;
  expectedOutputKind: string;
  targetStage: StageId;
  ownerId: string;
  status: RunStatus;
}
```

输入门禁：

- `StageRun.inputRefs` 必须能追溯到 `IntakePacket`、`InputLineage` 或 `HumanApproval`。
- `SourceConnector.status === "blocked"` 时不得生成下游事实。
- 文件输入必须同时保留 `rawRef` 和 `normalizedRefs`。
- 缺证据、缺素材、缺投放指标和缺人工确认必须生成 `MissingInputTask`。
- 每个补齐动作必须生成 `FillActionRequest`，并声明补完后的 `expectedOutputKind`。
- 输入层只负责接入、解析、清洗、归一和血缘，不负责生成营销结论。

### 数据接入工作台扩展

对应 PRD：[`data-intake-workbench-prd.md`](./data-intake-workbench-prd.md)。

接入不是二元门槛，而是渐进供给曲线。`SourceConnector` 从二元 `ConnectorStatus` 升级为**成熟度阶梯 L0/L1/L2**，并补充三方责任、适配器、覆盖率、新鲜度、置信度和升级路径。新增 `SourceAdapter`（可复用映射模板）、`FieldMapping`（甲方字段 → 本体字段）、`IntakeImpact`（数据 → 制造档位因果）。

```ts
type IntakeLevel = "L0" | "L1" | "L2"; // 手动 / 半自动 / 直连
type Responsibility = "self_serve" | "implementation" | "system_auto"; // 自助 / 实施顾问 / 系统自动
type IntakeHealth = "ok" | "warn" | "bad" | "info";
type IntakeConfidence = "high" | "mid" | "low" | "none";

// 扩展后的 SourceConnector（取代二元 ConnectorStatus，旧 status 字段保留兼容）
interface SourceConnectorV2 {
  id: string;
  kind: SourceConnectorKind;
  title: string;
  level: IntakeLevel;            // 成熟度阶梯，取代二元状态
  responsibility: Responsibility;
  adapterId: string;            // 使用的适配器
  coverage: number;             // 0-100 覆盖率
  freshness: string;            // "realtime" | "T+1" | "manual" | "none"
  confidence: IntakeConfidence;
  outputKinds: string[];        // 产出的本体对象
  health: IntakeHealth;
  upgrade?: {
    nextLevel: IntakeLevel;     // 下一步升级目标
    direction: string;          // 升级方向说明
    blocker: string;            // 升级门槛（含人日成本）
  };
  legacyStatus?: ConnectorStatus; // 向后兼容旧字段，可由 level 推导
}

interface SourceAdapter {
  id: string;
  name: string;
  platform: string;             // "taobao" | "douyin" | "yonyou" | "excel" | "feishu" | "oceanengine" | ...
  coverFields: string[];        // 覆盖的甲方字段
  reuseCount: number;           // 复用次数，越高边际接入成本越低
  responsibility: Responsibility;
  version: string;              // 适配器版本，支持平滑迁移
}

interface FieldMapping {
  connectorId: string;
  sourceField: string;          // 甲方字段（可能脏，如"规格写在标题里"）
  ontologyField: string;        // 本体字段，"—" 表示暂无映射
  status: "mapped" | "ai_inferred" | "ocr_pending" | "missing";
}

interface IntakeImpact {
  connectorId: string;
  coverage: number;
  blocksTier: Array<"premium" | "standard" | "template" | "ai_quick">; // 因覆盖不足被压低的档位
  note: string;                 // 数据 → 内容质量因果说明
}
```

接入工作台门禁：

- `SourceConnector` 必须有 `level`，最低 L0；任何源都能以 L0 方式提供数据，不得因未达 L1/L2 而阻塞流水线。
- 数据缺口不阻塞制造：覆盖不足时用基线 / AI / 默认兜底先跑，标记 `confidence: "low"`，补齐后回填升级。
- `IntakeImpact.blocksTier` 必须显式声明覆盖率对制造档位的限制，与商品规划阶段的 `tier` 强一致（见选品/商品规划模型）。
- 每个 `SourceConnector` 与 `SourceAdapter` 必须标注 `responsibility`，自助比例可被统计。
- `FieldMapping.status === "missing"` 的字段进入 `MissingInputTask`，补齐回填后状态转 `mapped`。
- `SourceAdapter` 升级版本时，存量 `FieldMapping` 必须可平滑迁移，不丢失甲方已确认的映射。


## 选品模型

```ts
interface RawProductCandidate {
  id: string;
  source: "shop" | "erp" | "ad" | "comment" | "creator_feedback";
  rawTitle: string;
  skuHints: string[];
  inventory?: number;
  price?: number;
}

interface NormalizedSku {
  id: string;
  candidateId: string;
  title: string;
  category: string;
  specs: Record<string, string>;
  inventory: number;
  priceRange: [number, number];
  offerBoundary?: string;
}

interface SkuCluster {
  id: string;
  title: string;
  skuIds: string[];
  primarySkuId: string;
  variantVariables: string[];
}

interface SelectionScore {
  skuId: string;
  opportunity: number;
  margin: number;
  inventory: number;
  evidence: number;
  asset: number;
  risk: number;
  total: number;
  decision: "deep_modeling" | "defer" | "blocked";
  reasons: string[];
}
```

门禁：

- `inventory <= 0` 必须 blocked。
- `margin` 低于阈值时不得进入视频制造。
- 商品簇只允许一个 `primarySkuId` 进入深建模，其他规格作为变量。

## 意图模型

```ts
interface SearchSignal {
  id: string;
  source: "platform_search" | "shop_search" | "ad_keyword" | "comment" | "customer_service" | "creator_script";
  text: string;
  volume?: number;
  competition?: number;
  conversionHint?: number;
  capturedAt: string;
}

interface IntentCluster {
  id: string;
  sourceSignalIds: string[];
  audience?: string;
  jobToBeDone: string;
  scenario: string;
  hiddenConcern: string;
  confidence: number;
  cannotBecomeFact: true;
}

interface TrafficIntent {
  id: string;
  intentClusterId: string;
  purchaseStage: "awareness" | "comparison" | "decision" | "repurchase";
  trafficValue: number;
  contentUse: Array<"hook" | "selling_point" | "first_shot" | "offer" | "delivery_keyword">;
}

interface KeywordSignal {
  id: string;
  intentClusterId: string;
  keyword: string;
  keywordType: "new_customer" | "long_tail" | "conversion" | "negative";
  allowedUse: Array<"hook" | "matrix" | "delivery" | "feedback">;
}

interface IntentNoise {
  id: string;
  sourceSignalId: string;
  reason: "irrelevant" | "sensitive_inference" | "competitor_misleading" | "no_purchase_intent";
  blockedFrom: Array<"selling" | "matrix" | "delivery">;
}
```

门禁：

- `IntentCluster` 必须有 `sourceSignalIds`。
- 意图只能解释用户任务和场景，不能写入 `ProductFact`。
- 涉及敏感属性推断的搜索词必须进入 `IntentNoise`。
- 新客词包必须标注 `allowedUse`，避免被直接写成主张。

## 商品事实与证据

```ts
type EvidenceLevel = "verified" | "weak" | "pending" | "forbidden";

interface ProductFact {
  id: string;
  skuId: string;
  factType: "spec" | "feature" | "usage_boundary" | "offer" | "risk";
  value: string;
  sourceGraphId: string;
  evidenceIds: string[];
  evidenceLevel: EvidenceLevel;
}

interface Evidence {
  id: string;
  sourceGraphId: string;
  sourceType: "manual" | "detail_page" | "test" | "image" | "video" | "human_approval";
  claimScope: string;
  level: EvidenceLevel;
  note: string;
}

interface PainPoint {
  id: string;
  sourceType: "comment" | "customer_service" | "creator_feedback" | "review";
  text: string;
  cluster: string;
  cannotBecomeFact: true;
}

interface ForbiddenExpression {
  id: string;
  text: string;
  reason: string;
  appliesTo: Array<"hook" | "script" | "subtitle" | "cover" | "cta">;
}
```

门禁：

- `ProductFact` 必须有 `sourceGraphId`。
- 评论只能进入 `PainPoint` 或 `Objection`，不能写成 `ProductFact`。
- `forbidden` 证据不得进入卖点、Hook、字幕、封面或口播。

## 卖点与 Hook 供料

```ts
type ClaimLevel = "strong" | "weak" | "blocked";

interface SellingPoint {
  id: string;
  skuId: string;
  painPointId: string;
  factIds: string[];
  evidenceIds: string[];
  scenarioIds: string[];
  value: string;
  claimLevel: ClaimLevel;
  boundaries: string[];
}

interface Claim {
  id: string;
  sellingPointId: string;
  text: string;
  level: ClaimLevel;
  evidenceLevel: EvidenceLevel;
  blockedReason?: string;
}

interface HookInput {
  id: string;
  audience: string;
  painPointId: string;
  sellingPointId: string;
  productCue: string;
  firstShotRequirement: string;
  forbiddenExpressionIds: string[];
}

interface HookCandidate {
  id: string;
  hookInputId: string;
  pattern: HookPattern;
  firstThreeSeconds: string;
  firstShotAssetRequirement: string;
  tone: string;
  riskFlags: string[];
  decision: "usable" | "needs_rewrite" | "blocked";
}

type HookPattern =
  | "pain_direct"
  | "scene_entry"
  | "anti_common_sense"
  | "question"
  | "number_claim"
  | "risk_reminder"
  | "offer_trigger";
```

LLM 罗列约束：

- 先穷举 `ProductFact + PainPoint + Scenario`，再过滤证据和禁用表达。
- 强主张必须绑定 `verified` 证据。
- `pending` 证据只能生成弱表达或补证据任务。
- 每个 Hook 必须包含商品线索，不能只有情绪或纯字幕。

## 矩阵行

```ts
interface VariableDictionary {
  audiences: string[];
  painPoints: string[];
  sellingPoints: string[];
  hookPatterns: HookPattern[];
  firstShotTypes: string[];
  tones: string[];
  offers: string[];
  ctas: string[];
}

interface MatrixRow {
  id: string;
  batchId: string;
  skuId: string;
  audience: string;
  painPointId: string;
  sellingPointId: string;
  hookCandidateId: string;
  firstShotAssetId?: string;
  tone: string;
  offerId?: string;
  scores: MatrixScore;
  decision: "manufacturing_seed" | "needs_asset" | "needs_evidence" | "blocked";
  blockedReasons: string[];
}

interface MatrixScore {
  manufacturable: number;
  evidence: number;
  assetFreshness: number;
  historicalPerformance: number;
  risk: number;
}
```

门禁：

- 单个实验最多改 1-3 个关键变量。
- `MatrixRow` 不能引用 `blocked` Hook。
- 首镜素材超过复用上限时必须 `needs_asset`。

## 视频制造单

```ts
type SegmentType = "Hook" | "Pain" | "Proof" | "Scenario" | "Offer" | "CTA";

interface VideoManufacturingJob {
  id: string;
  matrixRowId: string;
  status: RunStatus;
  durationSec: number;
  blueprint: VideoBlueprint;
  segmentPlans: SegmentPlan[];
  shotPlans: ShotPlan[];
  voiceDirection: VoiceDirection;
  assetIssues: AssetIssue[];
}

interface VideoBlueprint {
  structure: SegmentType[];
  sellingPointOrder: string[];
  pacing: "fast" | "medium" | "slow";
  riskNotes: string[];
}

interface SegmentPlan {
  id: string;
  type: SegmentType;
  startSec: number;
  endSec: number;
  goal: string;
  requiredClaims: string[];
}

interface ShotPlan {
  id: string;
  segmentId: string;
  startSec: number;
  endSec: number;
  visualSubject: string;
  camera: string;
  action: string;
  assetId?: string;
  evidenceId?: string;
  subtitle: string;
  voiceLine: string;
}

interface VoiceDirection {
  tone: string;
  speed: "slow" | "medium" | "fast";
  pauseNotes: string[];
  posture: string;
  gesture: string;
  facialExpression: string;
}
```

门禁：

- `durationSec` 必须在 60-75 秒内。
- 视频必须有 4-5 个 `SegmentPlan`。
- 0-3 秒必须包含 Hook、商品线索和可执行首镜。
- 证明镜头必须引用 `Evidence`。

## 素材账本

```ts
interface ClipAsset {
  id: string;
  type: "raw_video" | "generated_video" | "image" | "audio";
  tags: string[];
  fingerprint: string;
  source: string;
  rightsStatus: "owned" | "licensed" | "pending" | "blocked";
}

interface AssetUsageLedger {
  assetId: string;
  usageLimit: number;
  usageCount: number;
  usedByVideoJobIds: string[];
  fatigueScore: number;
}

interface AssetIssue {
  assetId: string;
  issueType: "usage_limit" | "missing_rights" | "missing_asset" | "fatigue";
  message: string;
  nextTask: "replace_asset" | "shoot_more" | "human_approval";
}
```

门禁：

- 同一素材默认最多进入 4 条混剪。
- `rightsStatus !== "owned" | "licensed"` 时不得进入可交付包。
- 疲劳分过高时矩阵阶段降权。

## 审核与人工确认

```ts
interface GateResult {
  gateId: string;
  status: "passed" | "failed" | "needs_human";
  message: string;
  evidenceRefs: ArtifactRef[];
}

interface ReviewDecision {
  id: string;
  videoJobId: string;
  status: "approved" | "rewrite" | "blocked" | "needs_human";
  gateResults: GateResult[];
  rewriteTasks: RecoveryTask[];
  requiredHumanApprovals: HumanApproval[];
}

interface HumanApproval {
  id: string;
  approvalType: "offer" | "evidence" | "asset_rights" | "risk_exception";
  prompt: string;
  status: "pending" | "approved" | "rejected";
  approvedBy?: string;
}

interface RecoveryTask {
  id: string;
  taskType: "rewrite" | "missing_evidence" | "material_gap" | "offer_confirm" | "rule_patch";
  targetStage: StageId;
  message: string;
  status: RunStatus;
}
```

门禁：

- 审核失败必须生成 `RecoveryTask`。
- 人工确认未完成时不得生成 `ApprovedReviewPackage`。
- 审核结论必须引用具体门禁和证据。

## 投放调优

```ts
interface BudgetPlan {
  id: string;
  batchId: string;
  objective: "new_customer" | "roi" | "gmv" | "test";
  dailyBudget: number;
  maxAutoIncreasePct: number;
  roiFloor: number;
  keywordSignalIds: string[];
  audienceTargets: string[];
}

interface DeliveryMetric {
  id: string;
  videoJobId: string;
  budgetPlanId: string;
  keywordSignalId?: string;
  audience?: string;
  spend: number;
  threeSecondRetention?: number;
  completionRate?: number;
  clickRate?: number;
  conversionRate?: number;
  roi?: number;
  violationCount?: number;
  capturedAt: string;
}

interface OptimizationAction {
  id: string;
  actionType:
    | "increase_budget"
    | "decrease_budget"
    | "pause_delivery"
    | "rewrite_hook"
    | "replace_first_shot"
    | "shoot_more"
    | "expand_keyword"
    | "missing_evidence"
    | "human_approval";
  targetId: string;
  reason: string;
  metricIds: string[];
  targetStage: StageId;
  requiresHuman: boolean;
  status: RunStatus;
}

interface KeywordFeedback {
  id: string;
  keywordSignalId: string;
  metricIds: string[];
  decision: "expand" | "keep" | "lower_bid" | "negative";
  note: string;
}

interface AudienceFeedback {
  id: string;
  audience: string;
  intentClusterId: string;
  metricIds: string[];
  matrixWeightDelta: number;
}
```

门禁：

- 未通过审核的视频制造单不得进入 `BudgetPlan`。
- 自动加预算不得超过 `maxAutoIncreasePct`，超过必须生成 `HumanApproval`。
- `OptimizationAction` 必须引用 `DeliveryMetric`，不能凭主观判断调预算。
- 投放表现只能写 `KeywordFeedback`、`AudienceFeedback`、变量权重和素材疲劳，不能写 `ProductFact`。

## 复盘回写

```ts
interface ExperimentPlan {
  id: string;
  matrixRowIds: string[];
  changedVariables: string[];
  observationWindow: string;
  metrics: string[];
}

interface PerformanceFeedback {
  id: string;
  experimentId: string;
  metrics: {
    threeSecondRetention?: number;
    completionRate?: number;
    clickRate?: number;
    conversionRate?: number;
    violationCount?: number;
  };
  commentSignals: string[];
}

interface KnowledgeUpdate {
  id: string;
  sourceFeedbackId: string;
  updateType: "variable_weight" | "asset_fatigue" | "pain_point" | "objection" | "rule_patch";
  targetId: string;
  delta: number | string;
  factWrites: never[];
}
```

门禁：

- 复盘不得写 `ProductFact`。
- 多变量同时变化时不得生成确定归因。
- 违规反馈必须生成 `RulePatch` 并前置到审核或卖点阶段。

## 本地文件建议

```text
.content-studio/ontology-v2/batches.json
.content-studio/ontology-v2/stage-runs.json
.content-studio/ontology-v2/source-connectors.json
.content-studio/ontology-v2/intake-packets.json
.content-studio/ontology-v2/input-bundles.json
.content-studio/ontology-v2/input-lineage.json
.content-studio/ontology-v2/missing-input-tasks.json
.content-studio/ontology-v2/fill-action-requests.json
.content-studio/ontology-v2/product-selection.json
.content-studio/ontology-v2/search-signals.json
.content-studio/ontology-v2/intent-clusters.json
.content-studio/ontology-v2/product-facts.json
.content-studio/ontology-v2/evidence.json
.content-studio/ontology-v2/selling-points.json
.content-studio/ontology-v2/hook-candidates.json
.content-studio/ontology-v2/matrix-rows.json
.content-studio/ontology-v2/video-jobs.json
.content-studio/ontology-v2/asset-ledger.json
.content-studio/ontology-v2/review-decisions.json
.content-studio/ontology-v2/budget-plans.json
.content-studio/ontology-v2/delivery-metrics.json
.content-studio/ontology-v2/optimization-actions.json
.content-studio/ontology-v2/feedback-updates.json
.content-studio/ontology-v2/rules.json
```

## 后续落地顺序

1. 先实现 `SourceConnector`、`IntakePacket`、`InputBundle`、`ContentBatch`、`StageRun`、`ArtifactRef` 和 `GateResult`。
2. 再实现选品、意图、卖点、矩阵、制造、审核、调优七个高价值对象。
3. 为每个对象补轻量 validator，不先引入复杂运行时。
4. 用 Harness 样例覆盖正例、边界、阻塞和人工确认。
5. 最后再考虑是否需要 RDF / JSON-LD / SHACL 等互操作导出。
