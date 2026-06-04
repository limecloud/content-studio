import type {
  ContentBatchArtifactRef,
  ContentBatchGateStatus,
  ContentBatchRecord,
  ContentBatchRunStatus,
  ContentBatchStageId,
  ContentBatchStageRun,
  ManufacturingTier,
} from './types';

export type OntologyV2RunStatus = 'draft' | 'ready' | 'running' | 'blocked' | 'needs_human' | 'approved' | 'rejected';
export type OntologyV2IssueSeverity = 'error' | 'warning' | 'info';

export type SourceConnectorKind =
  | 'shop_api'
  | 'erp_sync'
  | 'file_upload'
  | 'asset_library'
  | 'platform_search'
  | 'comment_stream'
  | 'customer_service'
  | 'ad_report'
  | 'policy_feed'
  | 'manual_entry';

export type ConnectorStatus = 'connected' | 'partial' | 'pending' | 'stale' | 'blocked';
export type OntologyV2IntakeLevel = 'L0' | 'L1' | 'L2';
export type OntologyV2Responsibility = 'self_serve' | 'implementation' | 'system_auto';
export type OntologyV2IntakeHealth = 'ok' | 'warn' | 'bad' | 'info';
export type OntologyV2IntakeConfidence = 'high' | 'mid' | 'low' | 'none';

export interface OntologyV2ArtifactRef {
  kind: string;
  id: string;
  path?: string;
  summary: string;
  targetModule?: string;
}

export interface OntologyV2ContentBatch {
  id: string;
  title: string;
  objective: string;
  ownerIds: string[];
  stageRuns: OntologyV2StageRun[];
  createdAt: string;
  updatedAt: string;
}

export interface OntologyV2StageRun {
  id: string;
  batchId: string;
  stageId: ContentBatchStageId;
  status: OntologyV2RunStatus;
  inputRefs: OntologyV2ArtifactRef[];
  outputRefs: OntologyV2ArtifactRef[];
  gateResults: OntologyV2GateResult[];
  agentRuns: OntologyV2ArtifactRef[];
  recoveryTasks: OntologyV2RecoveryTask[];
}

export interface OntologyV2GateResult {
  gateId: string;
  status: 'passed' | 'failed' | 'needs_human';
  message: string;
  evidenceRefs: OntologyV2ArtifactRef[];
}

export interface OntologyV2RecoveryTask {
  id: string;
  taskType:
    | 'rewrite'
    | 'missing_evidence'
    | 'material_gap'
    | 'offer_confirm'
    | 'rule_patch'
    | 'missing_input'
    | 'human_approval';
  targetStage: ContentBatchStageId;
  message: string;
  status: OntologyV2RunStatus;
}

export interface SourceConnectorV2 {
  id: string;
  kind: SourceConnectorKind;
  title: string;
  level: OntologyV2IntakeLevel;
  responsibility: OntologyV2Responsibility;
  adapterId: string;
  coverage: number;
  freshness: string;
  confidence: OntologyV2IntakeConfidence;
  outputKinds: string[];
  health: OntologyV2IntakeHealth;
  upgrade?: {
    nextLevel: OntologyV2IntakeLevel;
    direction: string;
    blocker: string;
  };
  legacyStatus?: ConnectorStatus;
}

export interface SourceAdapter {
  id: string;
  name: string;
  platform: string;
  coverFields: string[];
  reuseCount: number;
  responsibility: OntologyV2Responsibility;
  version: string;
}

export interface FieldMapping {
  connectorId: string;
  sourceField: string;
  ontologyField: string;
  status: 'mapped' | 'ai_inferred' | 'ocr_pending' | 'missing';
}

export interface IntakeImpact {
  connectorId: string;
  coverage: number;
  blocksTier: Array<'premium' | 'standard' | 'template' | 'ai_quick'>;
  note: string;
}

export interface SourceConnector {
  id: string;
  kind: SourceConnectorKind;
  title: string;
  status: ConnectorStatus;
  ownerId: string;
  freshnessMinutes?: number;
  outputKinds: string[];
  blockedReason?: string;
}

export interface IntakePacket {
  id: string;
  batchId: string;
  connectorId: string;
  packetType: 'product' | 'asset' | 'evidence' | 'intent' | 'delivery_metric' | 'rule' | 'human_approval';
  rawRef: OntologyV2ArtifactRef;
  normalizedRefs: OntologyV2ArtifactRef[];
  targetStages: ContentBatchStageId[];
  status: 'raw' | 'parsed' | 'normalized' | 'blocked' | 'needs_human';
  lineageIds: string[];
}

export interface InputBundle {
  id: string;
  batchId: string;
  packetIds: string[];
  readyForStages: ContentBatchStageId[];
  missingInputs: MissingInputTask[];
  createdAt: string;
}

export interface InputLineage {
  id: string;
  packetId: string;
  sourceConnectorId: string;
  transformedBy: 'parser' | 'normalizer' | 'agent' | 'human';
  outputRef: OntologyV2ArtifactRef;
  createdAt: string;
}

export interface MissingInputTask {
  id: string;
  batchId: string;
  targetStage: ContentBatchStageId;
  missingKind: 'connector' | 'file' | 'evidence' | 'asset' | 'metric' | 'human_approval';
  message: string;
  recoveryAction: string;
  status: OntologyV2RunStatus;
}

export interface FillActionRequest {
  id: string;
  batchId: string;
  actionType: 'connect_system' | 'upload_file' | 'paste_text' | 'manual_entry' | 'import_history' | 'create_missing_task';
  targetMissingInputId?: string;
  expectedOutputKind: string;
  targetStage: ContentBatchStageId;
  ownerId: string;
  status: OntologyV2RunStatus;
}

export interface SelectionScore {
  skuId: string;
  opportunity: number;
  margin: number;
  inventory: number;
  evidence: number;
  asset: number;
  risk: number;
  total: number;
  decision: 'deep_modeling' | 'defer' | 'blocked';
  reasons: string[];
}

export interface IntentCluster {
  id: string;
  sourceSignalIds: string[];
  audience?: string;
  jobToBeDone: string;
  scenario: string;
  hiddenConcern: string;
  confidence: number;
  cannotBecomeFact: true;
}

export type EvidenceLevel = 'verified' | 'weak' | 'pending' | 'forbidden';
export type ClaimLevel = 'strong' | 'weak' | 'blocked';

export interface SellingPoint {
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

export type HookPattern =
  | 'pain_direct'
  | 'scene_entry'
  | 'anti_common_sense'
  | 'question'
  | 'number_claim'
  | 'risk_reminder'
  | 'offer_trigger';

export interface HookCandidate {
  id: string;
  hookInputId: string;
  pattern: HookPattern;
  firstThreeSeconds: string;
  firstShotAssetRequirement: string;
  tone: string;
  riskFlags: string[];
  decision: 'usable' | 'needs_rewrite' | 'blocked';
}

export interface MatrixRow {
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
  decision: 'manufacturing_seed' | 'needs_asset' | 'needs_evidence' | 'blocked';
  blockedReasons: string[];
}

export interface MatrixScore {
  manufacturable: number;
  evidence: number;
  assetFreshness: number;
  historicalPerformance: number;
  risk: number;
}

export type SegmentType = 'Hook' | 'Pain' | 'Proof' | 'Scenario' | 'Offer' | 'CTA';

export interface VideoManufacturingJob {
  id: string;
  matrixRowId: string;
  status: OntologyV2RunStatus;
  durationSec: number;
  blueprint: VideoBlueprint;
  segmentPlans: SegmentPlan[];
  shotPlans: ShotPlan[];
  voiceDirection: VoiceDirection;
  assetIssues: AssetIssue[];
}

export interface VideoBlueprint {
  structure: SegmentType[];
  sellingPointOrder: string[];
  pacing: 'fast' | 'medium' | 'slow';
  riskNotes: string[];
}

export interface SegmentPlan {
  id: string;
  type: SegmentType;
  startSec: number;
  endSec: number;
  goal: string;
  requiredClaims: string[];
}

export interface ShotPlan {
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

export interface VoiceDirection {
  tone: string;
  speed: 'slow' | 'medium' | 'fast';
  pauseNotes: string[];
  posture: string;
  gesture: string;
  facialExpression: string;
}

export interface ClipAsset {
  id: string;
  type: 'raw_video' | 'generated_video' | 'image' | 'audio';
  tags: string[];
  fingerprint: string;
  source: string;
  rightsStatus: 'owned' | 'licensed' | 'pending' | 'blocked';
}

export interface AssetUsageLedger {
  assetId: string;
  usageLimit: number;
  usageCount: number;
  usedByVideoJobIds: string[];
  fatigueScore: number;
}

export interface AssetIssue {
  assetId: string;
  issueType: 'usage_limit' | 'missing_rights' | 'missing_asset' | 'fatigue';
  message: string;
  nextTask: 'replace_asset' | 'shoot_more' | 'human_approval';
}

export interface ReviewDecision {
  id: string;
  videoJobId: string;
  status: 'approved' | 'rewrite' | 'blocked' | 'needs_human';
  gateResults: OntologyV2GateResult[];
  rewriteTasks: OntologyV2RecoveryTask[];
  requiredHumanApprovals: HumanApproval[];
}

export interface HumanApproval {
  id: string;
  approvalType: 'offer' | 'evidence' | 'asset_rights' | 'risk_exception';
  prompt: string;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
}

export interface BudgetPlan {
  id: string;
  batchId: string;
  objective: 'new_customer' | 'roi' | 'gmv' | 'test';
  dailyBudget: number;
  maxAutoIncreasePct: number;
  roiFloor: number;
  keywordSignalIds: string[];
  audienceTargets: string[];
}

export interface DeliveryMetric {
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

export interface OptimizationAction {
  id: string;
  actionType:
    | 'increase_budget'
    | 'decrease_budget'
    | 'pause_delivery'
    | 'rewrite_hook'
    | 'replace_first_shot'
    | 'shoot_more'
    | 'expand_keyword'
    | 'missing_evidence'
    | 'human_approval';
  targetId: string;
  reason: string;
  metricIds: string[];
  targetStage: ContentBatchStageId;
  requiresHuman: boolean;
  status: OntologyV2RunStatus;
}

export interface KnowledgeUpdate {
  id: string;
  batchId: string;
  updateType: 'variable_weight' | 'asset_fatigue' | 'pain_point' | 'rule_patch';
  sourceMetricIds: string[];
  targetRef: OntologyV2ArtifactRef;
  note: string;
  factBoundary: 'does_not_update_product_fact';
}

export interface OntologyV2StageContract {
  stageId: ContentBatchStageId;
  title: string;
  primaryObject: string;
  inputContract: string;
  outputContract: string;
  requiredOutputKinds: string[];
  recoveryKinds: Array<OntologyV2RecoveryTask['taskType']>;
}

export interface OntologyV2ContractIssue {
  id: string;
  severity: OntologyV2IssueSeverity;
  stageId?: ContentBatchStageId;
  message: string;
  recoveryAction?: string;
}

export interface OntologyV2StageContractReport {
  stageId: ContentBatchStageId;
  title: string;
  status: OntologyV2RunStatus;
  primaryObject: string;
  inputContract: string;
  outputContract: string;
  ok: boolean;
  requiredOutputKinds: string[];
  outputCoverage: number;
  issues: OntologyV2ContractIssue[];
}

export interface OntologyV2BatchContractReport {
  ok: boolean;
  title: string;
  statusLabel: string;
  issueCount: number;
  warningCount: number;
  stageReports: OntologyV2StageContractReport[];
  issues: OntologyV2ContractIssue[];
}

export interface OntologyV2HarnessCase {
  id: string;
  kind: 'positive' | 'boundary' | 'negative' | 'exception';
  title: string;
  batch: ContentBatchRecord;
  expectedOk: boolean;
}

export interface OntologyV2HarnessResult {
  id: string;
  kind: OntologyV2HarnessCase['kind'];
  title: string;
  expectedOk: boolean;
  actualOk: boolean;
  passed: boolean;
  issues: OntologyV2ContractIssue[];
}

export const ONTOLOGY_V2_STAGE_IDS: ContentBatchStageId[] = [
  'selection',
  'intent',
  'modeling',
  'selling',
  'matrix',
  'manufacturing',
  'review',
  'optimization',
  'feedback',
];

export const ONTOLOGY_V2_STAGE_CONTRACTS: Record<ContentBatchStageId, OntologyV2StageContract> = {
  selection: {
    stageId: 'selection',
    title: '商品规划',
    primaryObject: 'ProductPlan / SelectionScore',
    inputContract: 'InputBundle.product + IntakeImpact',
    outputContract: '全量商品获得制造档位、推广波次和补条件任务。',
    requiredOutputKinds: ['product-plan'],
    recoveryKinds: ['missing_input', 'human_approval'],
  },
  intent: {
    stageId: 'intent',
    title: '意图',
    primaryObject: 'IntentCluster / TrafficIntent',
    inputContract: 'SearchSignal / comment_stream / delivery keyword',
    outputContract: '意图只能解释用户任务，不能升级为产品事实。',
    requiredOutputKinds: ['run-trace', 'input-source'],
    recoveryKinds: ['missing_input'],
  },
  modeling: {
    stageId: 'modeling',
    title: '建模',
    primaryObject: 'ProductFact / Evidence',
    inputContract: 'InputBundle.product + rule + evidence',
    outputContract: '内容知识地图、证据包、素材覆盖和禁用边界。',
    requiredOutputKinds: ['content-knowledge-map'],
    recoveryKinds: ['missing_evidence', 'missing_input'],
  },
  selling: {
    stageId: 'selling',
    title: '卖点',
    primaryObject: 'SellingPoint / Claim / HookInput',
    inputContract: 'ProductFact + PainPoint + Evidence + Scenario',
    outputContract: '强弱主张分级、补证据任务和 Hook 供料。',
    requiredOutputKinds: ['selling-point', 'evidence'],
    recoveryKinds: ['missing_evidence', 'rule_patch'],
  },
  matrix: {
    stageId: 'matrix',
    title: '矩阵',
    primaryObject: 'MatrixRow / VideoSeed',
    inputContract: 'SellingPoint + HookCandidate + AssetUsageLedger',
    outputContract: '矩阵行、实验变量、制造种子和阻塞原因。',
    requiredOutputKinds: ['manufacturing-plan'],
    recoveryKinds: ['material_gap', 'missing_evidence'],
  },
  manufacturing: {
    stageId: 'manufacturing',
    title: '制造',
    primaryObject: 'VideoManufacturingJob',
    inputContract: 'MatrixRow + ClipAsset + VoiceDirection + ReviewGate',
    outputContract: '视频制造单、分镜、素材缺口和可审核交接，不伪造成片。',
    requiredOutputKinds: ['manufacturing-plan', 'prompt-draft', 'generation-log'],
    recoveryKinds: ['material_gap', 'missing_evidence', 'human_approval'],
  },
  review: {
    stageId: 'review',
    title: '审核',
    primaryObject: 'ReviewDecision / HumanApproval',
    inputContract: 'VideoManufacturingJob + Claim + Evidence + AssetUsageLedger',
    outputContract: '审核结论、改写任务、补证据任务和可交付包。',
    requiredOutputKinds: ['review-task', 'asset-review'],
    recoveryKinds: ['rewrite', 'missing_evidence', 'material_gap', 'offer_confirm'],
  },
  optimization: {
    stageId: 'optimization',
    title: '调优',
    primaryObject: 'OptimizationAction / DeliveryMetric',
    inputContract: 'ApprovedReviewPackage + DeliveryMetric + BudgetPlan',
    outputContract: '预算动作、词包反馈、创意调优动作和人工确认。',
    requiredOutputKinds: ['action-record', 'input-source'],
    recoveryKinds: ['missing_input', 'offer_confirm'],
  },
  feedback: {
    stageId: 'feedback',
    title: '复盘',
    primaryObject: 'KnowledgeUpdate',
    inputContract: 'PerformanceFeedback + ReviewDecision + AssetUsageLedger',
    outputContract: '变量权重、素材疲劳、痛点异议和规则更新；不污染产品事实。',
    requiredOutputKinds: ['prompt-draft', 'asset-review', 'run-trace'],
    recoveryKinds: ['rule_patch', 'material_gap'],
  },
};

function compactText(value: unknown): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function issue(input: Omit<OntologyV2ContractIssue, 'id'>): OntologyV2ContractIssue {
  return {
    id: `${input.stageId ?? 'batch'}:${input.severity}:${compactText(input.message).slice(0, 80)}`,
    ...input,
  };
}

function mapRunStatus(status: ContentBatchRunStatus): OntologyV2RunStatus {
  if (status === 'needs-human') return 'needs_human';
  return status;
}

function mapGateStatus(status: ContentBatchGateStatus): OntologyV2GateResult['status'] {
  if (status === 'passed') return 'passed';
  if (status === 'blocked') return 'failed';
  return 'needs_human';
}

function mapArtifactRef(ref: ContentBatchArtifactRef): OntologyV2ArtifactRef {
  return {
    kind: ref.kind,
    id: ref.id,
    path: ref.path,
    summary: ref.summary,
    targetModule: ref.targetModule,
  };
}

function mapRecoveryStatus(status: ContentBatchRunStatus | 'open' | 'resolved'): OntologyV2RunStatus {
  if (status === 'open') return 'ready';
  if (status === 'resolved') return 'approved';
  if (status === 'needs-human') return 'needs_human';
  return status;
}

function normalizeOutputKind(kind: string): string {
  return kind === 'workflow-run' ? 'run-trace' : kind;
}

function outputCoverage(stage: ContentBatchStageRun, contract: OntologyV2StageContract): number {
  if (!contract.requiredOutputKinds.length) return 100;
  const outputKinds = new Set(stage.outputRefs.map((ref) => normalizeOutputKind(ref.kind)));
  const matched = contract.requiredOutputKinds.filter((kind) => outputKinds.has(kind)).length;
  return Math.round((matched / contract.requiredOutputKinds.length) * 100);
}

function stageHasAnyExpectedOutput(stage: ContentBatchStageRun, contract: OntologyV2StageContract): boolean {
  const kinds = new Set(stage.outputRefs.map((ref) => normalizeOutputKind(ref.kind)));
  return contract.requiredOutputKinds.some((kind) => kinds.has(kind));
}

function tierToImpactTier(tier: ManufacturingTier): IntakeImpact['blocksTier'][number] {
  return tier === 'ai-quick' ? 'ai_quick' : tier;
}

export function projectContentBatchToOntologyV2(batch: ContentBatchRecord): OntologyV2ContentBatch {
  return {
    id: batch.id,
    title: batch.title,
    objective: batch.objective,
    ownerIds: batch.ownerIds,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt,
    stageRuns: batch.stageRuns.map((stage) => ({
      id: stage.id,
      batchId: stage.batchId,
      stageId: stage.stageId,
      status: mapRunStatus(stage.status),
      inputRefs: stage.inputRefs.map(mapArtifactRef),
      outputRefs: stage.outputRefs.map(mapArtifactRef),
      gateResults: stage.gateResults.map((gate) => ({
        gateId: gate.id,
        status: mapGateStatus(gate.status),
        message: gate.message,
        evidenceRefs: gate.sourceRef ? [mapArtifactRef(gate.sourceRef)] : [],
      })),
      agentRuns: stage.agentRunRefs.map(mapArtifactRef),
      recoveryTasks: stage.recoveryTasks.map((task) => ({
        id: task.id,
        taskType: task.stageId === 'review'
          ? 'missing_evidence'
          : task.stageId === 'manufacturing'
            ? 'material_gap'
            : 'missing_input',
        targetStage: task.stageId,
        message: task.message,
        status: mapRecoveryStatus(task.status),
      })),
    })),
  };
}

export function buildSourceConnectorsFromBatch(batch: ContentBatchRecord): SourceConnectorV2[] {
  return (batch.intakeSummary.maturity?.projections ?? []).map((projection) => ({
    id: projection.id,
    kind: projection.id === 'delivery-traffic'
      ? 'ad_report'
      : projection.id === 'material-evidence'
        ? 'asset_library'
        : projection.id === 'search-feedback'
          ? 'comment_stream'
          : projection.id === 'platform-brand-rules'
            ? 'policy_feed'
            : projection.id === 'human-approval'
              ? 'manual_entry'
              : 'file_upload',
    title: projection.name,
    level: projection.level,
    responsibility: projection.responsibility === 'self-serve'
      ? 'self_serve'
      : projection.responsibility === 'system-auto'
        ? 'system_auto'
        : 'implementation',
    adapterId: projection.adapterName,
    coverage: projection.coverage,
    freshness: projection.freshness,
    confidence: projection.confidence === '高' ? 'high' : projection.confidence === '中' ? 'mid' : projection.confidence === '低' ? 'low' : 'none',
    outputKinds: projection.outputObjects,
    health: projection.health,
    upgrade: projection.upgrade ? {
      nextLevel: projection.upgrade.next,
      direction: projection.upgrade.action,
      blocker: projection.upgrade.blocker,
    } : undefined,
    legacyStatus: projection.coverage >= 80 ? 'connected' : projection.coverage > 0 ? 'partial' : 'pending',
  }));
}

export function buildIntakeImpactsFromBatch(batch: ContentBatchRecord): IntakeImpact[] {
  return (batch.intakeSummary.maturity?.projections ?? []).map((projection) => ({
    connectorId: projection.id,
    coverage: projection.coverage,
    blocksTier: projection.impact.blocksTier.map(tierToImpactTier),
    note: projection.impact.note,
  }));
}

function validateBatchHeader(batch: ContentBatchRecord): OntologyV2ContractIssue[] {
  const stageIds = new Set(batch.stageRuns.map((stage) => stage.stageId));
  return [
    compactText(batch.id) ? undefined : issue({ severity: 'error', message: 'ContentBatch 缺少 id。' }),
    compactText(batch.title) ? undefined : issue({ severity: 'error', message: 'ContentBatch 缺少 title。' }),
    compactText(batch.objective) ? undefined : issue({ severity: 'warning', message: 'ContentBatch 缺少 objective，批次目标不可追溯。' }),
    batch.intakeSummary.maturity ? undefined : issue({ severity: 'warning', message: '缺少数据接入成熟度投影，无法解释 L0/L1/L2 与自助比例。' }),
    batch.intakeSummary.manufacturing ? undefined : issue({ severity: 'error', message: '缺少制造能力投影，制造阶段无法按档位调度工具池。' }),
    ...ONTOLOGY_V2_STAGE_IDS
      .filter((stageId) => !stageIds.has(stageId))
      .map((stageId) => issue({ severity: 'error', stageId, message: `缺少 ${ONTOLOGY_V2_STAGE_CONTRACTS[stageId].title} 阶段。` })),
  ].filter((item): item is OntologyV2ContractIssue => Boolean(item));
}

function validateStageShape(stage: ContentBatchStageRun, contract: OntologyV2StageContract): OntologyV2ContractIssue[] {
  const issues: OntologyV2ContractIssue[] = [];
  if (!compactText(stage.id)) issues.push(issue({ severity: 'error', stageId: stage.stageId, message: 'StageRun 缺少 id。' }));
  if (!compactText(stage.batchId)) issues.push(issue({ severity: 'error', stageId: stage.stageId, message: 'StageRun 缺少 batchId。' }));
  if (!stage.gateResults.length) {
    issues.push(issue({ severity: 'error', stageId: stage.stageId, message: `${contract.title} 阶段缺少门禁结果。` }));
  }
  if ((stage.status === 'blocked' || stage.status === 'needs-human') && !stage.recoveryTasks.length) {
    issues.push(issue({
      severity: 'error',
      stageId: stage.stageId,
      message: `${contract.title} 阶段已阻塞或待人工处理，但没有恢复任务。`,
      recoveryAction: '为阻塞门禁创建 MissingInputTask / RecoveryTask。',
    }));
  }
  for (const task of stage.recoveryTasks) {
    if (!compactText(task.recoveryAction) || !compactText(task.targetModule)) {
      issues.push(issue({
        severity: 'error',
        stageId: stage.stageId,
        message: `恢复任务缺少补齐方式或处理入口：${task.title}`,
        recoveryAction: '补齐 recoveryAction 和 targetModule。',
      }));
    }
  }
  if (stage.status === 'approved' && !stage.outputRefs.length) {
    issues.push(issue({
      severity: 'warning',
      stageId: stage.stageId,
      message: `${contract.title} 阶段已完成，但没有结构化阶段产物引用。`,
      recoveryAction: `补写 ${contract.outputContract}`,
    }));
  }
  if (stage.status === 'approved' && contract.requiredOutputKinds.length && !stageHasAnyExpectedOutput(stage, contract)) {
    issues.push(issue({
      severity: stage.stageId === 'manufacturing' ? 'error' : 'warning',
      stageId: stage.stageId,
      message: `${contract.title} 阶段产物没有命中 v2 输出契约：${contract.requiredOutputKinds.join(' / ')}。`,
      recoveryAction: `至少交付一个 ${contract.primaryObject} 相关引用。`,
    }));
  }
  if (stage.stageId === 'manufacturing') {
    const outputKinds = new Set(stage.outputRefs.map((ref) => ref.kind));
    if (!outputKinds.has('manufacturing-plan')) {
      issues.push(issue({
        severity: 'error',
        stageId: stage.stageId,
        message: '制造阶段缺少 manufacturing-plan，无法解释制造档位和工具池。',
        recoveryAction: '调用 buildManufacturingPlanProjection 并写入阶段产物。',
      }));
    }
    if (stage.outputRefs.some((ref) => ref.kind === 'generation-log' && /已生成|succeeded/i.test(ref.summary)) && !stage.gateResults.length) {
      issues.push(issue({
        severity: 'error',
        stageId: stage.stageId,
        message: '制造产物缺少门禁，不得直接伪造成片成功。',
      }));
    }
  }
  if (stage.stageId === 'feedback' && stage.outputRefs.some((ref) => /投放|ROI|CTR/i.test(ref.summary) && ref.kind !== 'action-record')) {
    issues.push(issue({
      severity: 'warning',
      stageId: stage.stageId,
      message: '复盘阶段发现投放表现产物，需确认只回写变量权重或规则，不污染产品事实。',
      recoveryAction: '将表现数据写入 KnowledgeUpdate，而不是 ProductFact。',
    }));
  }
  return issues;
}

export function buildOntologyV2StageContractReport(stage: ContentBatchStageRun): OntologyV2StageContractReport {
  const contract = ONTOLOGY_V2_STAGE_CONTRACTS[stage.stageId];
  const issues = validateStageShape(stage, contract);
  return {
    stageId: stage.stageId,
    title: contract.title,
    status: mapRunStatus(stage.status),
    primaryObject: contract.primaryObject,
    inputContract: contract.inputContract,
    outputContract: contract.outputContract,
    ok: !issues.some((item) => item.severity === 'error'),
    requiredOutputKinds: contract.requiredOutputKinds,
    outputCoverage: outputCoverage(stage, contract),
    issues,
  };
}

export function buildOntologyV2BatchContractReport(batch: ContentBatchRecord): OntologyV2BatchContractReport {
  const batchIssues = validateBatchHeader(batch);
  const stageReports = batch.stageRuns.map(buildOntologyV2StageContractReport);
  const issues = [...batchIssues, ...stageReports.flatMap((stage) => stage.issues)];
  const issueCount = issues.filter((item) => item.severity === 'error').length;
  const warningCount = issues.filter((item) => item.severity === 'warning').length;
  return {
    ok: issueCount === 0,
    title: batch.title,
    statusLabel: issueCount ? '待修正' : warningCount ? '可运行有提醒' : '契约通过',
    issueCount,
    warningCount,
    stageReports,
    issues,
  };
}

function artifact(kind: string, id: string, summary: string, targetModule?: string): ContentBatchArtifactRef {
  return { kind, id, summary, targetModule };
}

function passedGate(stageId: ContentBatchStageId) {
  return {
    id: `${stageId}:passed`,
    stageId,
    status: 'passed' as const,
    title: `${ONTOLOGY_V2_STAGE_CONTRACTS[stageId].title}门禁`,
    message: '当前阶段没有阻断项。',
  };
}

function stage(input: {
  batchId: string;
  stageId: ContentBatchStageId;
  status?: ContentBatchRunStatus;
  inputRefs?: ContentBatchArtifactRef[];
  outputRefs?: ContentBatchArtifactRef[];
  recoveryTasks?: ContentBatchStageRun['recoveryTasks'];
}): ContentBatchStageRun {
  return {
    id: `${input.batchId}:${input.stageId}`,
    batchId: input.batchId,
    stageId: input.stageId,
    status: input.status ?? 'approved',
    inputRefs: input.inputRefs ?? [artifact('input-source', `${input.stageId}:source`, '可追溯输入源', 'knowledge-inputs')],
    outputRefs: input.outputRefs ?? [artifact(ONTOLOGY_V2_STAGE_CONTRACTS[input.stageId].requiredOutputKinds[0] ?? 'run-trace', `${input.stageId}:output`, '阶段产物')],
    gateResults: [passedGate(input.stageId)],
    recoveryTasks: input.recoveryTasks ?? [],
    agentRunRefs: [],
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function harnessBatch(input: {
  id: string;
  title: string;
  currentStageId?: ContentBatchStageId;
  overrides?: Partial<Record<ContentBatchStageId, Partial<ContentBatchStageRun>>>;
  manufacturing?: ContentBatchRecord['intakeSummary']['manufacturing'];
}): ContentBatchRecord {
  const batchId = input.id;
  const stageRuns = ONTOLOGY_V2_STAGE_IDS.map((stageId) => ({
    ...stage({ batchId, stageId }),
    ...(input.overrides?.[stageId] ?? {}),
  }));
  return {
    id: batchId,
    workspacePath: '/tmp/ontology-v2-harness',
    title: input.title,
    objective: '验证 ontology v2 本地模型契约。',
    ownerIds: ['harness'],
    status: 'active',
    currentStageId: input.currentStageId ?? 'manufacturing',
    intakeSummary: {
      inputSourceCount: 3,
      convertedCount: 3,
      blockedCount: 0,
      coveragePercent: 72,
      maturity: {
        averageCoverage: 72,
        selfServeSourceCount: 4,
        l2SourceCount: 1,
        bottleneckCount: 1,
        sourceCount: 6,
        projections: [],
      },
      manufacturing: input.manufacturing ?? {
        recommendedTier: 'standard',
        tierLabel: '标准产出',
        tierReason: 'Harness 标准档。',
        blockedTiers: ['premium'],
        capabilities: [],
        materialCoveragePercent: 70,
        evidenceCoveragePercent: 80,
        readyPromptCount: 1,
        approvedAssetCount: 1,
        manufacturingArtifactCount: 1,
      },
      missingInputs: [],
    },
    stageRuns,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

export function ontologyV2HarnessCases(): OntologyV2HarnessCase[] {
  return [
    {
      id: 'positive-full-batch',
      kind: 'positive',
      title: '完整批次契约正例',
      expectedOk: true,
      batch: harnessBatch({
        id: 'ontology-v2-positive',
        title: '完整短视频制造批次',
        overrides: {
          manufacturing: {
            outputRefs: [
              artifact('manufacturing-plan', 'current', '标准产出制造计划', 'content-batch'),
              artifact('prompt-draft', 'video-job-1', '视频制造单', 'video-prompt'),
            ],
          },
          review: {
            outputRefs: [artifact('asset-review', 'review-1', '素材已通过并入库', 'assets')],
          },
          optimization: {
            outputRefs: [artifact('action-record', 'action-1', '投放调优动作已记录', 'assets-history')],
          },
          feedback: {
            outputRefs: [artifact('prompt-draft', 'success-prompt-1', '成功素材 Prompt 已沉淀', 'assets-prompt-workbench')],
          },
        },
      }),
    },
    {
      id: 'boundary-low-intake',
      kind: 'boundary',
      title: '低覆盖率边界但不阻塞',
      expectedOk: true,
      batch: harnessBatch({
        id: 'ontology-v2-boundary',
        title: '低覆盖率 AI 快产批次',
        currentStageId: 'selection',
        manufacturing: {
          recommendedTier: 'ai-quick',
          tierLabel: 'AI 快产',
          tierReason: '低覆盖率兜底先跑。',
          blockedTiers: ['premium', 'standard', 'template'],
          capabilities: [],
          materialCoveragePercent: 0,
          evidenceCoveragePercent: 0,
          readyPromptCount: 0,
          approvedAssetCount: 0,
          manufacturingArtifactCount: 0,
        },
        overrides: {
          selection: {
            status: 'needs-human',
            recoveryTasks: [{
              id: 'selection:补商品资料',
              stageId: 'selection',
              status: 'open',
              title: '补商品资料',
              message: '缺 SKU 表，先按默认库存假设生成低置信批次。',
              recoveryAction: '登记商品与库存输入源。',
              targetModule: 'knowledge-inputs',
              createdAt: '2026-06-01T00:00:00.000Z',
            }],
          },
        },
      }),
    },
    {
      id: 'negative-missing-manufacturing-plan',
      kind: 'negative',
      title: '制造阶段缺少制造计划负例',
      expectedOk: false,
      batch: harnessBatch({
        id: 'ontology-v2-negative',
        title: '缺制造计划批次',
        overrides: {
          manufacturing: {
            outputRefs: [artifact('prompt-draft', 'video-job-1', '视频制造单', 'video-prompt')],
          },
        },
      }),
    },
    {
      id: 'exception-human-approval',
      kind: 'exception',
      title: '人工确认例外可恢复',
      expectedOk: true,
      batch: harnessBatch({
        id: 'ontology-v2-exception',
        title: '预算提升人工确认批次',
        currentStageId: 'optimization',
        overrides: {
          optimization: {
            status: 'needs-human',
            recoveryTasks: [{
              id: 'optimization:预算提升人工确认',
              stageId: 'optimization',
              status: 'open',
              title: '预算提升人工确认',
              message: '自动加预算超过阈值，必须由运营确认。',
              recoveryAction: '打开运行复盘并记录人工确认。',
              targetModule: 'assets-history',
              createdAt: '2026-06-01T00:00:00.000Z',
            }],
          },
        },
      }),
    },
  ];
}

export function runOntologyV2HarnessCases(cases: OntologyV2HarnessCase[] = ontologyV2HarnessCases()): OntologyV2HarnessResult[] {
  return cases.map((item) => {
    const report = buildOntologyV2BatchContractReport(item.batch);
    return {
      id: item.id,
      kind: item.kind,
      title: item.title,
      expectedOk: item.expectedOk,
      actualOk: report.ok,
      passed: report.ok === item.expectedOk,
      issues: report.issues,
    };
  });
}
