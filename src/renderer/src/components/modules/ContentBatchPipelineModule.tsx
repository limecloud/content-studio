import { useMemo, useState } from 'react';
import type {
  ContentBatchArtifactRef,
  ContentBatchRecord,
  ContentBatchRunStatus,
  ContentBatchStageId,
  ContentBatchStageRun,
  ManufacturingCapabilityProjection,
  ManufacturingPlanProjection,
  ProductPlanItemProjection,
  ProductPlanProjection,
} from '../../../../shared/types';
import {
  buildOntologyV2BatchContractReport,
  type OntologyV2BatchContractReport,
} from '../../../../shared/ontologyV2';
import type { ModuleKey } from '../../app/types';
import { ActionGroup, StatusPill, type StatusPillTone } from '../WorkbenchPrimitives';

interface ContentBatchPipelineModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  batch?: ContentBatchRecord;
  onBuildContentBatch: () => void;
  onAdvanceStage: () => void;
  onRunStagePrimaryAction: (stageId: ContentBatchStageId) => void;
  onSelectModule: (module: ModuleKey) => void;
}

const STAGE_LABELS: Record<ContentBatchStageId, string> = {
  selection: '选品',
  intent: '意图',
  modeling: '建模',
  selling: '卖点',
  matrix: '矩阵',
  manufacturing: '制造',
  review: '审核',
  optimization: '调优',
  feedback: '复盘',
};

const STATUS_LABELS: Record<ContentBatchRunStatus, string> = {
  draft: '草稿',
  ready: '可推进',
  running: '执行中',
  blocked: '已拦截',
  'needs-human': '待处理',
  approved: '已完成',
  rejected: '已驳回',
};

const STATUS_TONES: Record<ContentBatchRunStatus, StatusPillTone> = {
  draft: 'idle',
  ready: 'ready',
  running: 'ready',
  blocked: 'blocked',
  'needs-human': 'blocked',
  approved: 'ready',
  rejected: 'blocked',
};

const CAPABILITY_STATUS_LABELS: Record<ManufacturingCapabilityProjection['status'], string> = {
  ready: '可执行',
  'needs-input': '待补输入',
  blocked: '已拦截',
  done: '已有产物',
};

const CAPABILITY_STATUS_TONES: Record<ManufacturingCapabilityProjection['status'], StatusPillTone> = {
  ready: 'ready',
  'needs-input': 'blocked',
  blocked: 'blocked',
  done: 'ready',
};

const PRODUCT_TIER_LABELS: Record<ProductPlanItemProjection['manufacturingTier'], string> = {
  premium: '精品定制',
  standard: '标准产出',
  template: '批量模板',
  'ai-quick': 'AI 快产',
};

const STAGE_PRIMARY_MODULE: Record<ContentBatchStageId, ModuleKey> = {
  selection: 'knowledge-inputs',
  intent: 'knowledge-inputs',
  modeling: 'knowledge-map',
  selling: 'knowledge-map',
  matrix: 'assets-prompt-workbench',
  manufacturing: 'video-prompt',
  review: 'knowledge-review',
  optimization: 'assets-history',
  feedback: 'assets-history',
};

const STAGE_GUIDES: Record<ContentBatchStageId, {
  decision: string;
  delivery: string;
  primaryAction: string;
  actions: Array<{ label: string; module: ModuleKey; hint: string }>;
}> = {
  selection: {
    decision: '确认本批商品、SKU、价格、库存和禁用表达是否足够支撑后续内容生产。',
    delivery: '形成可被建模阶段引用的商品资料和 SKU 变量。',
    primaryAction: '补齐商品资料',
    actions: [
      { label: '登记商品资料', module: 'knowledge-inputs', hint: '补产品 brief、SKU 表或详情页资料' },
      { label: '整理产品变量', module: 'knowledge-inputs', hint: '把卖点、规格、场景和禁用表达结构化' },
    ],
  },
  intent: {
    decision: '确认本批内容要回应哪些真实评论、搜索词、客服问题或投放反馈。',
    delivery: '形成痛点矩阵、标题方向和客服异议话术。',
    primaryAction: '生成痛点选题',
    actions: [
      { label: '登记评论原声', module: 'knowledge-inputs', hint: '导入评论、差评、客服问答或私信' },
      { label: '打开 Prompt 工作台', module: 'assets-prompt-workbench', hint: '把用户语言转成选题和话术' },
    ],
  },
  modeling: {
    decision: '判断输入源是否已经沉淀成卖点、痛点、场景和证据矩阵。',
    delivery: '生成内容知识地图，作为卖点和矩阵阶段的事实层。',
    primaryAction: '生成知识地图',
    actions: [
      { label: '打开内容知识地图', module: 'knowledge-map', hint: '整理卖点、痛点、证据和素材覆盖' },
      { label: '补品牌 / 产品知识库', module: 'knowledge-brand', hint: '把品牌事实和合规边界补进事实层' },
    ],
  },
  selling: {
    decision: '确认卖点是否有证据支撑，是否存在合规、竞品或素材缺口。',
    delivery: '生成可交给矩阵阶段的卖点包、证据包和场景候选。',
    primaryAction: '处理卖点缺口',
    actions: [
      { label: '处理卖点缺口', module: 'knowledge-map', hint: '补证据、补素材或送审核任务' },
      { label: '生成场景提示词', module: 'image-scene-prompts', hint: '把场景卡转成图片 / 视频 Prompt' },
    ],
  },
  matrix: {
    decision: '确认哪些卖点、场景、素材和审核边界要进入本批 Prompt 和素材制造。',
    delivery: '形成可执行的 Prompt 草稿、场景卡和补资源任务。',
    primaryAction: '生成矩阵交接',
    actions: [
      { label: '打开 Prompt 工作台', module: 'assets-prompt-workbench', hint: '逐条处理 Prompt、审核和补资源动作' },
      { label: '打开场景库', module: 'knowledge-scenes', hint: '确认场景卡和素材方向' },
    ],
  },
  manufacturing: {
    decision: '选择本批先制造哪些交付物：图片素材、15 秒视频 Prompt、绿幕文案图或混剪素材包。',
    delivery: '产物进入审核台、素材库或混剪包，不在软件内伪造第三方视频任务。',
    primaryAction: '生成视频制造单',
    actions: [
      { label: '生成图片素材', module: 'image', hint: '用已确认 Prompt 和素材生成图片候选' },
      { label: '打开视频 Prompt', module: 'video-prompt', hint: '生成并复制到第三方视频平台' },
      { label: '生成绿幕文案图', module: 'image-green-screen', hint: '拆标题卡、卖点卡和 CTA 卡' },
      { label: '导出混剪包', module: 'video-mix-export', hint: '把通过素材交给第三方混剪软件' },
    ],
  },
  review: {
    decision: '人工判断候选素材是否通过、驳回、回炉或补证据。',
    delivery: '通过并入库，或生成清晰的回炉 / 补证据任务。',
    primaryAction: '处理素材审核',
    actions: [
      { label: '打开审核任务', module: 'knowledge-review', hint: '处理补证据、补素材和人工确认' },
      { label: '打开素材库', module: 'assets', hint: '通过并入库、回炉或沉淀成功 Prompt' },
    ],
  },
  optimization: {
    decision: '确认投放表现、复制记录和素材反馈是否能指导下一轮调优。',
    delivery: '形成下一轮补素材、补证据或调整 Prompt 的运行记录。',
    primaryAction: '写入运行复盘',
    actions: [
      { label: '查看运行历史', module: 'assets-history', hint: '追溯 Prompt 和素材表现' },
      { label: '打开输入源', module: 'knowledge-inputs', hint: '补充投放表现、复制记录和素材反馈' },
    ],
  },
  feedback: {
    decision: '判断通过素材、失败原因和投放反馈是否应该回炉到知识库或 Prompt。',
    delivery: '沉淀可复用的知识更新、成功素材模板和下一批输入。',
    primaryAction: '回写素材覆盖',
    actions: [
      { label: '打开运行历史', module: 'assets-history', hint: '复盘本批输入、运行和交付物' },
      { label: '沉淀 Prompt', module: 'assets-prompt-workbench', hint: '把成功素材回炉成可复用提示词' },
    ],
  },
};

function currentStage(batch: ContentBatchRecord): ContentBatchStageRun {
  return batch.stageRuns.find((stage) => stage.stageId === batch.currentStageId) ?? batch.stageRuns[0];
}

function artifactLabel(ref: ContentBatchArtifactRef): string {
  return ref.summary || `${ref.kind}:${ref.id}`;
}

function uniqueArtifacts(refs: ContentBatchArtifactRef[]): ContentBatchArtifactRef[] {
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ManufacturingPlanPanel({
  plan,
  onSelectModule,
}: {
  plan?: ManufacturingPlanProjection;
  onSelectModule: (module: ModuleKey) => void;
}) {
  if (!plan) return null;
  return (
    <section className="content-batch-manufacturing-plan">
      <div className="content-batch-manufacturing-head">
        <div>
          <p className="eyebrow">制造档位</p>
          <h4>{plan.tierLabel}</h4>
          <p>{plan.tierReason}</p>
        </div>
        <div className="content-batch-manufacturing-metrics" aria-label="制造阶段指标">
          <span><b>{plan.materialCoveragePercent}%</b>素材覆盖</span>
          <span><b>{plan.evidenceCoveragePercent}%</b>证据覆盖</span>
          <span><b>{plan.readyPromptCount}</b>Prompt</span>
          <span><b>{plan.approvedAssetCount}</b>通过素材</span>
        </div>
      </div>

      <div className="content-batch-capability-grid">
        {plan.capabilities.map((capability) => (
          <button
            key={capability.id}
            type="button"
            className={`content-batch-capability ${capability.id === plan.primaryCapabilityId ? 'primary-capability' : ''}`}
            onClick={() => onSelectModule(capability.targetModule as ModuleKey)}
          >
            <span>
              <strong>{capability.title}</strong>
              <StatusPill tone={CAPABILITY_STATUS_TONES[capability.status]}>{CAPABILITY_STATUS_LABELS[capability.status]}</StatusPill>
            </span>
            <p>{capability.reason}</p>
            {capability.blockedReason ? <small>{capability.blockedReason}</small> : <small>交付：{capability.output}</small>}
          </button>
        ))}
      </div>
    </section>
  );
}

function ProductPlanPanel({ plan }: { plan?: ProductPlanProjection }) {
  if (!plan) return null;
  const visibleItems = plan.items.slice(0, 5);
  return (
    <section className="content-batch-product-plan">
      <div className="content-batch-product-plan-head">
        <div>
          <p className="eyebrow">商品规划</p>
          <h4>{plan.modeLabel}</h4>
          <p>{plan.summary}</p>
        </div>
        <div className="content-batch-product-plan-metrics" aria-label="商品规划指标">
          <span><b>{plan.plannedCount}/{plan.candidateCount}</b>已分档</span>
          <span><b>{plan.topTierCount}</b>高投入</span>
          <span><b>{plan.bottleneckCount}</b>待补条件</span>
          <span><b>{plan.inputCoveragePercent}%</b>输入覆盖</span>
        </div>
      </div>

      <div className="content-batch-product-plan-distribution" aria-label="制造档位和推广波次">
        <section>
          <h5>制造档位</h5>
          <div>
            {(Object.keys(PRODUCT_TIER_LABELS) as ProductPlanItemProjection['manufacturingTier'][]).map((tier) => (
              <span key={tier}>
                <strong>{PRODUCT_TIER_LABELS[tier]}</strong>
                <b>{plan.distribution[tier]}</b>
              </span>
            ))}
          </div>
        </section>
        <section>
          <h5>推广波次</h5>
          <div>
            {(['W1', 'W2', 'W3'] as const).map((wave) => (
              <span key={wave}>
                <strong>{wave}</strong>
                <b>{plan.waves[wave]}</b>
              </span>
            ))}
          </div>
        </section>
      </div>

      <div className="content-batch-product-plan-list">
        {visibleItems.length ? visibleItems.map((item) => (
          <article key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <span>{item.skuId}</span>
            </div>
            <div>
              <StatusPill tone={item.recoveryActions.length ? 'blocked' : 'ready'}>{item.tierLabel}</StatusPill>
              <StatusPill tone="idle">{item.wave}</StatusPill>
              <b>{item.totalScore}</b>
            </div>
            <p>{item.recoveryActions[0] ?? item.reasons[0] ?? '已进入当前批次排产。'}</p>
          </article>
        )) : (
          <p>尚未接入 SKU 表或产品 Brief，补齐后会为全部商品生成制造档位和推广波次。</p>
        )}
      </div>
    </section>
  );
}

function OntologyContractPanel({ report }: { report: OntologyV2BatchContractReport }) {
  const currentIssues = report.issues.slice(0, 4);
  return (
    <section>
      <h3>本体契约</h3>
      <div className={`content-batch-contract ${report.ok ? 'ready' : 'blocked'}`}>
        <div>
          <strong>{report.statusLabel}</strong>
          <span>{report.stageReports.length} 个阶段 · {report.issueCount} 个错误 · {report.warningCount} 个提醒</span>
        </div>
        <p>批次、阶段、门禁、恢复任务和制造计划已按 ontology v2 本地模型做 shape 校验。</p>
      </div>
      <div className="content-batch-contract-stage-list">
        {report.stageReports.map((stage) => (
          <span key={stage.stageId} className={stage.ok ? 'ready' : 'blocked'}>
            {stage.title}
          </span>
        ))}
      </div>
      {currentIssues.length ? (
        <div className="content-batch-contract-issues">
          {currentIssues.map((item) => (
            <span key={item.id}>{item.message}</span>
          ))}
        </div>
      ) : null}
    </section>
  );
}

export function ContentBatchPipelineModule({
  workspaceReady,
  busy,
  batch,
  onBuildContentBatch,
  onAdvanceStage,
  onRunStagePrimaryAction,
  onSelectModule,
}: ContentBatchPipelineModuleProps) {
  const [selectedStageId, setSelectedStageId] = useState<ContentBatchStageId | null>(null);
  const selectedStage = useMemo(() => {
    if (!batch) return undefined;
    return batch.stageRuns.find((stage) => stage.stageId === (selectedStageId ?? batch.currentStageId)) ?? currentStage(batch);
  }, [batch, selectedStageId]);
  const activeStage = batch && selectedStage ? selectedStage : undefined;
  const visibleArtifacts = activeStage
    ? uniqueArtifacts([...activeStage.inputRefs, ...activeStage.outputRefs, ...activeStage.agentRunRefs]).slice(0, 10)
    : [];
  const nextModule = activeStage ? STAGE_PRIMARY_MODULE[activeStage.stageId] : 'knowledge-inputs';
  const stageGuide = activeStage ? STAGE_GUIDES[activeStage.stageId] : undefined;
  const primaryActionLabel = stageGuide?.primaryAction ?? '处理当前阶段';
  const manufacturingPlan = batch?.intakeSummary.manufacturing;
  const productPlan = batch?.intakeSummary.productPlan;
  const ontologyReport = useMemo(() => (batch ? buildOntologyV2BatchContractReport(batch) : undefined), [batch]);
  const projectedActions = activeStage?.stageId === 'manufacturing' && manufacturingPlan
    ? manufacturingPlan.capabilities.map((capability) => ({
      label: capability.title,
      module: capability.targetModule as ModuleKey,
      hint: capability.blockedReason ?? capability.output,
    }))
    : stageGuide?.actions;
  const blockedByStage = activeStage?.status === 'blocked';

  if (!workspaceReady) {
    return (
      <section className="content-batch-empty">
        <p className="eyebrow">内容制造批次</p>
        <h2>先选择工作区</h2>
        <p>批次会绑定当前工作区里的输入源、知识地图、审核任务、Prompt、生成记录和素材记录。</p>
      </section>
    );
  }

  if (!batch) {
    return (
      <section className="content-batch-empty">
        <p className="eyebrow">内容制造批次</p>
        <h2>创建第一个批次</h2>
        <p>批次会把现有客户端能力组织成选品、意图、建模、卖点、矩阵、制造、审核、调优和复盘九个阶段。</p>
        <button type="button" className="primary" disabled={busy} onClick={onBuildContentBatch}>
          生成内容制造批次
        </button>
      </section>
    );
  }

  return (
    <section className="content-batch-workbench">
      <header className="content-batch-header">
        <div>
          <p className="eyebrow">内容制造批次</p>
          <h2>{batch.title}</h2>
          <p>{batch.objective}</p>
        </div>
        <ActionGroup>
          <button type="button" className="ghost" disabled={busy} onClick={onBuildContentBatch}>
            重建批次投影
          </button>
          <button
            type="button"
            className="primary"
            disabled={busy || blockedByStage}
            onClick={onAdvanceStage}
          >
            推进当前阶段
          </button>
        </ActionGroup>
      </header>

      <div className="content-batch-summary">
        <article>
          <span>{batch.intakeSummary.coveragePercent}%</span>
          <strong>接入覆盖率</strong>
          <p>{batch.intakeSummary.maturity ? `${batch.intakeSummary.maturity.sourceCount} 类源成熟度投影` : `${batch.intakeSummary.convertedCount} / ${batch.intakeSummary.inputSourceCount} 份资料可用`}</p>
        </article>
        <article>
          <span>{batch.intakeSummary.maturity?.bottleneckCount ?? batch.intakeSummary.blockedCount}</span>
          <strong>接入瓶颈</strong>
          <p>{batch.intakeSummary.maturity ? `${batch.intakeSummary.maturity.selfServeSourceCount} 类可自助补齐` : '来自文件解析、视觉理解或人工确认缺失'}</p>
        </article>
        <article>
          <span>{batch.intakeSummary.maturity?.l2SourceCount ?? batch.stageRuns.filter((stage) => stage.status === 'approved').length}</span>
          <strong>自动接入源</strong>
          <p>{batch.intakeSummary.maturity ? '其余源可用手动补齐或文件映射渐进完善' : '阶段产物会继续进入下游工具和审核'}</p>
        </article>
        <article>
          <span>{batch.stageRuns.filter((stage) => stage.recoveryTasks.length > 0).length}</span>
          <strong>恢复任务</strong>
          <p>待补资料、待送审或待回炉</p>
        </article>
      </div>

      <div className="content-batch-layout">
        <section className="content-batch-main">
          <div className="content-batch-stage-rail" aria-label="批次阶段">
            {batch.stageRuns.map((stage, index) => (
              <button
                key={stage.stageId}
                type="button"
                className={`content-batch-stage ${stage.stageId === activeStage?.stageId ? 'active' : ''}`}
                onClick={() => setSelectedStageId(stage.stageId)}
              >
                <em>{String(index + 1).padStart(2, '0')}</em>
                <strong>{STAGE_LABELS[stage.stageId]}</strong>
                <StatusPill tone={STATUS_TONES[stage.status]}>{STATUS_LABELS[stage.status]}</StatusPill>
              </button>
            ))}
          </div>

          {activeStage ? (
            <article className="content-batch-stage-panel">
              <div className="content-batch-stage-title">
                <div>
                  <p className="eyebrow">当前阶段</p>
                  <h3>{STAGE_LABELS[activeStage.stageId]}</h3>
                </div>
                <StatusPill tone={STATUS_TONES[activeStage.status]}>{STATUS_LABELS[activeStage.status]}</StatusPill>
              </div>

              <div className="content-batch-gate-list">
                {activeStage.gateResults.map((gate) => (
                  <div key={gate.id} className={`content-batch-gate ${gate.status}`}>
                    <strong>{gate.title}</strong>
                    <p>{gate.message}</p>
                    {gate.recoveryAction ? <small>{gate.recoveryAction}</small> : null}
                  </div>
                ))}
              </div>

              {stageGuide ? (
                <div className="content-batch-stage-guide">
                  <section>
                    <h4>用户判断</h4>
                    <p>{stageGuide.decision}</p>
                  </section>
                  <section>
                    <h4>完成交付</h4>
                    <p>{stageGuide.delivery}</p>
                  </section>
                </div>
              ) : null}

              <div className="content-batch-artifact-grid">
                <section>
                  <h4>阶段输入</h4>
                  {activeStage.inputRefs.length ? activeStage.inputRefs.slice(0, 6).map((ref) => (
                    <button key={`${ref.kind}:${ref.id}`} type="button" onClick={() => ref.targetModule && onSelectModule(ref.targetModule as ModuleKey)}>
                      {artifactLabel(ref)}
                    </button>
                  )) : <p>没有可用输入，需先补齐资料。</p>}
                </section>
                <section>
                  <h4>阶段产物</h4>
                  {activeStage.outputRefs.length ? activeStage.outputRefs.slice(0, 6).map((ref) => (
                    <button key={`${ref.kind}:${ref.id}`} type="button" onClick={() => ref.targetModule && onSelectModule(ref.targetModule as ModuleKey)}>
                      {artifactLabel(ref)}
                    </button>
                  )) : <p>本阶段还没有产物。</p>}
                </section>
              </div>

              {activeStage.stageId === 'manufacturing' ? (
                <ManufacturingPlanPanel plan={batch.intakeSummary.manufacturing} onSelectModule={onSelectModule} />
              ) : null}

              {activeStage.stageId === 'selection' ? (
                <ProductPlanPanel plan={productPlan} />
              ) : null}
            </article>
          ) : null}
        </section>

        <aside className="content-batch-side">
          <section>
            <h3>下一步</h3>
            <p>{activeStage ? `处理 ${STAGE_LABELS[activeStage.stageId]} 阶段的输入、门禁和恢复任务。` : '选择一个阶段查看。'}</p>
            <button
              type="button"
              className="primary"
              disabled={!activeStage || busy}
              onClick={() => activeStage && onRunStagePrimaryAction(activeStage.stageId)}
            >
              {primaryActionLabel}
            </button>
            <button type="button" className="ghost" onClick={() => onSelectModule(nextModule)}>
              打开处理入口
            </button>
          </section>

          {projectedActions?.length ? (
            <section>
              <h3>{activeStage?.stageId === 'manufacturing' ? '批次工具池' : '阶段工具'}</h3>
              <div className="content-batch-tool-list">
                {projectedActions.map((action) => (
                  <button key={`${activeStage?.stageId}:${action.module}:${action.label}`} type="button" onClick={() => onSelectModule(action.module)}>
                    <strong>{action.label}</strong>
                    <span>{action.hint}</span>
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          {ontologyReport ? <OntologyContractPanel report={ontologyReport} /> : null}

          <section>
            <h3>恢复任务</h3>
            {activeStage?.recoveryTasks.length ? activeStage.recoveryTasks.map((task) => (
              <button key={task.id} type="button" className="content-batch-recovery" onClick={() => onSelectModule(task.targetModule as ModuleKey)}>
                <strong>{task.title}</strong>
                <span>{task.message}</span>
              </button>
            )) : <p>当前阶段没有恢复任务。</p>}
          </section>

          <section>
            <h3>追溯对象</h3>
            {visibleArtifacts.length ? visibleArtifacts.map((ref) => (
              <button key={`${ref.kind}:${ref.id}:trace`} type="button" className="content-batch-trace" onClick={() => ref.targetModule && onSelectModule(ref.targetModule as ModuleKey)}>
                {artifactLabel(ref)}
              </button>
            )) : <p>暂无可追溯对象。</p>}
          </section>
        </aside>
      </div>
    </section>
  );
}
