import { useEffect, useMemo, useState } from 'react';
import type {
  AgentPromptSession,
  BrandCommandActionRecord,
  BrandCommandCenterRecord,
  BrandCommandDecisionCheck,
  BrandCommandObjective,
  BrandCommandQueueItem,
  BrandCommandResourceBundle,
  BrandCommandSignal,
  ContentKnowledgeMapEvidence,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentTeamRole,
  PromptDraftPurpose,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import type { ModuleKey } from '../../app/types';
import { clip } from '../../app/formatters';
import { AgentSessionPanel, type AgentActionResolver, type AgentExecutionStep } from '../agent/AgentSessionPanel';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { ActionGroup, SelectableRecordCard, StatusPill } from '../WorkbenchPrimitives';

type CommandTab = 'signals' | 'objectives' | 'bundles' | 'queue' | 'logs';
type BrandCommandFeatureKey =
  | 'brand-command-center'
  | 'brand-command-objectives'
  | 'brand-command-bundles'
  | 'brand-command-queue'
  | 'brand-command-logs';

interface CommandViewConfig {
  featureKey: BrandCommandFeatureKey;
  title: string;
  detailEyebrow: string;
  detailTitle: string;
  transcriptLabel: string;
  composerLabel: string;
  primaryAgentAction: string;
  continueAgentAction: string;
  defaultMessage: string;
  businessObject: string;
  decisionPoint: string;
  mainAction: string;
  deliveryTarget: string;
}

interface BrandCommandCenterModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  contentKnowledgeMaps: ContentKnowledgeMapRecord[];
  activeContentKnowledgeMap?: ContentKnowledgeMapRecord;
  brandCommandCenters: BrandCommandCenterRecord[];
  activeBrandCommandCenter?: BrandCommandCenterRecord;
  activeBrandCommandCenterId: string;
  setActiveBrandCommandCenterId: (recordId: string) => void;
  agentPromptSessions: AgentPromptSession[];
  activeAgentPromptSessionId: string;
  textModel?: string;
  initialTab?: CommandTab;
  onBuildBrandCommandCenter: () => void;
  onRecordBrandCommandAction: (queueItemId: string) => void;
  onRefreshBrandCommandActions: () => void;
  onSelectAgentSession: (sessionId: string) => void;
  onResolveAgentAction?: AgentActionResolver;
  onStartAgentSession: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    sceneCardIds?: string[];
    textModel?: string;
  }) => void;
  onContinueAgentSession: (input: { sessionId: string; message: string; textModel?: string }) => void;
  onSelectModule: (module: ModuleKey) => void;
}

const CENTER_STATUS_LABELS: Record<BrandCommandCenterRecord['status'], string> = {
  draft: '草稿',
  active: '进行中',
  'needs-review': '待审核',
  blocked: '待处理',
  archived: '已归档',
};

const QUEUE_STATUS_LABELS: Record<BrandCommandQueueItem['status'], string> = {
  ready: '可执行',
  'needs-review': '待审核',
  'needs-resource': '待补资源',
  blocked: '已拦截',
  'handed-off': '已交接',
  'written-back': '已回写',
};

const SYNC_STATUS_LABELS: Record<BrandCommandCenterRecord['syncStatus'], string> = {
  'local-only': '本机记录',
  'pending-sync': '待同步',
  synced: '团队已同步',
  conflict: '有冲突',
  blocked: '待配置',
};

const CHECK_STATUS_LABELS: Record<BrandCommandDecisionCheck['status'], string> = {
  passed: '通过',
  'needs-review': '待审核',
  'needs-resource': '待补资源',
  blocked: '拦截',
};

const ACTION_TYPE_LABELS: Record<BrandCommandQueueItem['actionType'], string> = {
  'generate-prompt-draft': '生成 Prompt 草稿',
  'create-scene-card': '创建场景卡',
  'request-review': '发起审核',
  'request-evidence': '补证据',
  'launch-sop-run': '启动 SOP',
  'create-material-gap-list': '创建补素材清单',
  'write-back-material-coverage': '回写素材覆盖',
  'content-production-blocked': '记录发布检查未通过',
};

const SIGNAL_TYPE_LABELS: Record<BrandCommandSignal['type'], string> = {
  'feedback-pain': '评论痛点',
  'competitor-action': '竞品动作',
  trend: '热点趋势',
  'ad-performance': '投放表现',
  'material-performance': '素材表现',
  'brand-risk': '品牌风险',
  manual: '人工信号',
};

const ACTION_OUTCOME_LABELS: Record<BrandCommandActionRecord['outcome'], string> = {
  recorded: '已记录',
  blocked: '已拦截',
  handoff: '已交接',
  'needs-review': '待审核',
  'needs-resource': '待补资源',
  'written-back': '已回写',
};

const OUTPUT_TARGET_LABELS: Record<BrandCommandQueueItem['outputTarget'], string> = {
  'prompt-draft': 'Prompt 草稿',
  'scene-card': '场景卡',
  'review-task': '审核任务',
  'evidence-task': '补证据任务',
  'sop-run': 'SOP 运行',
  'material-gap': '补素材清单',
  'material-coverage': '素材覆盖表',
};

const TEAM_ROLE_LABELS: Record<ContentTeamRole, string> = {
  owner: '负责人',
  'content-engineer': '内容工程师',
  reviewer: '审核员',
  operator: '运营',
  viewer: '只读成员',
};

const OBJECTIVE_TYPE_LABELS: Record<BrandCommandObjective['type'], string> = {
  acquisition: '拉新',
  conversion: '转化',
  'objection-handling': '异议解释',
  'trust-building': '建立信任',
  'price-defense': '价格防守',
  'risk-control': '风险控制',
  'evidence-gap': '补证据',
  'material-gap': '补素材',
  retention: '复购',
};

const TAB_LABELS: Array<{ key: CommandTab; label: string }> = [
  { key: 'signals', label: '信号雷达' },
  { key: 'objectives', label: '目标树' },
  { key: 'bundles', label: '作战编组' },
  { key: 'queue', label: '执行队列' },
  { key: 'logs', label: '行动记录' },
];

const COMMAND_VIEW_CONFIGS: Record<CommandTab, CommandViewConfig> = {
  signals: {
    featureKey: 'brand-command-center',
    title: '品牌战情室',
    detailEyebrow: '信号雷达',
    detailTitle: '品牌内容信号',
    transcriptLabel: '品牌战情室执行状态',
    composerLabel: '战情要求',
    primaryAgentAction: '开始研判',
    continueAgentAction: '继续研判',
    defaultMessage: '请基于当前战情室信号，判断哪些机会应该转成作战目标，哪些风险需要先送审或补证据。',
    businessObject: '内容信号',
    decisionPoint: '先看评论、竞品、热点、投放、素材表现和品牌风险是否能转成目标。',
    mainAction: '生成或刷新战情室',
    deliveryTarget: '进入目标树、资源包和执行队列。',
  },
  objectives: {
    featureKey: 'brand-command-objectives',
    title: '目标树',
    detailEyebrow: '目标树',
    detailTitle: '目标拆解与成功标准',
    transcriptLabel: '目标树执行状态',
    composerLabel: '目标判断要求',
    primaryAgentAction: '研判目标',
    continueAgentAction: '继续研判',
    defaultMessage: '请检查当前目标树，指出每个目标的成功标准、渠道、人群和下游队列动作是否足够明确。',
    businessObject: '作战目标',
    decisionPoint: '判断信号是否已转成拉新、转化、信任、风险控制、补证据或补素材目标。',
    mainAction: '确认目标优先级',
    deliveryTarget: '绑定资源包并进入作战编组。',
  },
  bundles: {
    featureKey: 'brand-command-bundles',
    title: '作战编组',
    detailEyebrow: '作战编组',
    detailTitle: '资源包与发布检查',
    transcriptLabel: '作战编组执行状态',
    composerLabel: '编组检查要求',
    primaryAgentAction: '检查编组',
    continueAgentAction: '继续检查',
    defaultMessage: '请检查当前资源包是否包含卖点、证据、场景、素材、禁用边界和恢复路径，缺口不要伪装成可交付。',
    businessObject: '资源包',
    decisionPoint: '判断每个目标是否已有可交接资源包，以及缺证据、缺素材、待审核项如何恢复。',
    mainAction: '完成资源包检查',
    deliveryTarget: '通过发布检查后排入执行队列。',
  },
  queue: {
    featureKey: 'brand-command-queue',
    title: '执行队列',
    detailEyebrow: '执行队列',
    detailTitle: '可处理动作与恢复路径',
    transcriptLabel: '执行队列处理状态',
    composerLabel: '队列处理要求',
    primaryAgentAction: '处理队列',
    continueAgentAction: '继续处理',
    defaultMessage: '请逐条判断当前队列哪些可以交接，哪些需要送审、补证据、补素材或保持拦截。',
    businessObject: '队列动作',
    decisionPoint: '按可执行、待审核、待补资源和已拦截分流，逐条记录处理结果。',
    mainAction: '记录当前队列动作',
    deliveryTarget: '生成 Prompt、场景卡、SOP、审核任务、补资源任务或行动记录。',
  },
  logs: {
    featureKey: 'brand-command-logs',
    title: '行动记录',
    detailEyebrow: '行动记录',
    detailTitle: '交接、拦截与回写追溯',
    transcriptLabel: '行动记录复盘状态',
    composerLabel: '复盘要求',
    primaryAgentAction: '复盘记录',
    continueAgentAction: '继续复盘',
    defaultMessage: '请复盘当前行动记录，指出已交接产物、被拦截原因、素材回写结果和下一轮应该补的信号。',
    businessObject: '行动记录',
    decisionPoint: '追溯谁基于哪些资源做了什么，结果交付到哪里，哪些表现可以回写。',
    mainAction: '同步团队记录',
    deliveryTarget: '回到团队工作区、素材覆盖表和下一轮信号。',
  },
};

const AGENT_SESSION_STATUS_LABELS: Record<AgentPromptSession['status'], string> = {
  active: '会话中',
  'waiting-user': '等你补充',
  'draft-created': '已输出',
  blocked: '待配置',
  closed: '已关闭',
};

const AGENT_MESSAGE_KIND_LABELS: Record<AgentPromptSession['messages'][number]['kind'], string> = {
  intent: '任务',
  draft: '输出',
  adjustment: '追问',
  note: '记录',
};

function centerTone(status?: BrandCommandCenterRecord['status']) {
  if (status === 'active') return 'ready';
  if (status === 'blocked' || status === 'needs-review') return 'blocked';
  return 'idle';
}

function agentSessionTone(status?: AgentPromptSession['status']) {
  if (status === 'blocked' || status === 'closed') return 'blocked';
  if (status === 'draft-created' || status === 'active') return 'ready';
  return 'idle';
}

function agentMessageTitle(message: AgentPromptSession['messages'][number]): string {
  if (message.role === 'user') return message.kind === 'adjustment' ? '你的补充' : '你的任务';
  if (message.role === 'assistant') return '战情建议';
  return '系统记录';
}

function compactAgentMessage(message: AgentPromptSession['messages'][number]): string {
  const content = message.content.trim();
  const userIntent = content.match(/用户意图：\n([\s\S]*?)(\n\n输入源快照：|\n\n本轮 skills：|$)/)?.[1]?.trim();
  if (message.role === 'user' && userIntent) return userIntent.split('\n').filter(Boolean).slice(0, 6).join('\n');
  const promptDraft = content.match(/Prompt 草稿：\n([\s\S]*?)(\n\n需要追问|\n\n仍需追问|\n\n来源与合规提醒|\n\n下游检查清单|\n\n本轮调整：|$)/)?.[1]?.trim();
  if (message.role === 'assistant' && promptDraft) return promptDraft.split('\n').filter(Boolean).slice(0, 8).join('\n');
  return content.split('\n').filter(Boolean).slice(0, 8).join('\n');
}

function queueTone(status: BrandCommandQueueItem['status']) {
  if (status === 'ready' || status === 'handed-off' || status === 'written-back') return 'ready';
  if (status === 'blocked' || status === 'needs-resource' || status === 'needs-review') return 'blocked';
  return 'idle';
}

function actionButtonLabel(status: BrandCommandQueueItem['status']) {
  if (status === 'ready') return '记录交接';
  if (status === 'needs-review') return '记录送审';
  if (status === 'needs-resource') return '记录补资源';
  if (status === 'blocked') return '查看拦截';
  return '已处理';
}

interface CommandChartItem {
  label: string;
  value: number;
  detail?: string;
}

function renderCommandChart(title: string, items: CommandChartItem[], empty: string, maxValue?: number) {
  const max = maxValue ?? Math.max(...items.map((item) => item.value), 1);
  return (
    <div className="brand-command-view-chart" aria-label={title}>
      <strong>{title}</strong>
      {items.length ? (
        items.slice(0, 6).map((item) => (
          <div key={`${title}-${item.label}`} className="brand-command-chart-row">
            <span>{item.label}</span>
            <div aria-hidden="true"><i style={{ width: `${Math.max(6, Math.min(100, Math.round((item.value / max) * 100)))}%` }} /></div>
            <em>{item.detail ?? item.value}</em>
          </div>
        ))
      ) : (
        <span className="brand-command-chart-empty">{empty}</span>
      )}
    </div>
  );
}

function countChartItems<T extends string>(
  values: T[],
  labels: Record<T, string>,
): CommandChartItem[] {
  const counts = values.reduce<Partial<Record<T, number>>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
  return Object.entries(counts)
    .map(([key, value]) => ({
      label: labels[key as T] ?? key,
      value: Number(value),
    }))
    .sort((a, b) => b.value - a.value);
}

interface BrandCommandKnowledgeLookup {
  rowsById: Map<string, ContentKnowledgeMapMatrixRow>;
  evidenceById: Map<string, ContentKnowledgeMapEvidence>;
}

function buildKnowledgeLookup(map?: ContentKnowledgeMapRecord): BrandCommandKnowledgeLookup {
  return {
    rowsById: new Map([
      ...(map?.sellingPoints ?? []),
      ...(map?.painPoints ?? []),
      ...(map?.scenarios ?? []),
    ].map((row) => [row.id, row])),
    evidenceById: new Map((map?.evidence ?? []).map((item) => [item.id, item])),
  };
}

function evidenceSourceLabel(sourceType: ContentKnowledgeMapEvidence['sourceType']): string {
  if (sourceType === 'user-quote') return '用户原声';
  if (sourceType === 'customer-service-log') return '客服记录';
  if (sourceType === 'brand-knowledge-base') return '品牌资料';
  if (sourceType === 'ip-knowledge-base') return 'IP 资料';
  if (sourceType === 'scene-card') return '场景卡';
  if (sourceType === 'prompt-draft') return '提示词草稿';
  if (sourceType === 'generated-inference') return '推理结果';
  if (sourceType === 'manual') return '人工补充';
  return '输入资料';
}

function rowRefLabel(rowId: string, lookup: BrandCommandKnowledgeLookup): string {
  const row = lookup.rowsById.get(rowId);
  if (!row) return rowId;
  const status = row.status === 'ready' ? '可交接' : row.status === 'needs-evidence' ? '缺证据' : '待审核';
  return `${row.title} · ${status}`;
}

function evidenceRefLabel(evidenceId: string, lookup: BrandCommandKnowledgeLookup): string {
  const evidence = lookup.evidenceById.get(evidenceId);
  if (!evidence) return evidenceId;
  return `${evidenceSourceLabel(evidence.sourceType)}：${clip(evidence.excerpt || evidence.claim, 88)}`;
}

function renderDetailList(
  title: string,
  values: string[],
  empty: string,
  className = '',
) {
  return (
    <div className={`brand-command-detail-list ${className}`}>
      <strong>{title}</strong>
      {values.length ? (
        values.slice(0, 6).map((value, index) => <span key={`${title}-${index}`}>{value}</span>)
      ) : (
        <span className="warn">{empty}</span>
      )}
      {values.length > 6 ? <small>另有 {values.length - 6} 项未展开</small> : null}
    </div>
  );
}

function dimensionValues(
  bundle: BrandCommandResourceBundle | undefined,
  cell: BrandCommandCenterRecord['campaignCells'][number] | undefined,
  item: BrandCommandQueueItem | undefined,
  key: keyof NonNullable<BrandCommandResourceBundle['dimensions']>,
): string[] {
  return Array.from(new Set([
    ...(bundle?.dimensions?.[key] ?? []),
    ...(cell?.dimensions?.[key] ?? []),
    ...(item?.dimensions?.[key] ?? []),
    ...(key === 'channels' ? cell?.channels ?? [] : []),
  ].filter(Boolean)));
}

function renderCommandViewChart(tab: CommandTab, record?: BrandCommandCenterRecord) {
  if (!record) {
    return renderCommandChart('当前分布', [], '生成战情室后显示信号、目标、资源和队列分布。');
  }
  if (tab === 'signals') {
    return renderCommandChart(
      '信号来源分布',
      countChartItems(record.signals.map((signal) => signal.type), SIGNAL_TYPE_LABELS),
      '暂无信号。',
    );
  }
  if (tab === 'objectives') {
    return renderCommandChart(
      '目标类型分布',
      countChartItems(record.objectives.map((objective) => objective.type), OBJECTIVE_TYPE_LABELS),
      '暂无目标。',
    );
  }
  if (tab === 'bundles') {
    return renderCommandChart(
      '资源包完整度',
      record.resourceBundles
        .map((bundle) => ({
          label: bundle.title,
          value: bundle.readyPercent,
          detail: `${bundle.readyPercent}%`,
        }))
        .sort((a, b) => b.value - a.value),
      '暂无资源包。',
      100,
    );
  }
  if (tab === 'queue') {
    return renderCommandChart(
      '队列状态分布',
      countChartItems(record.queueItems.map((item) => item.status), QUEUE_STATUS_LABELS),
      '暂无队列动作。',
    );
  }
  return renderCommandChart(
    '行动结果分布',
    countChartItems(record.actionRecords.map((item) => item.outcome), ACTION_OUTCOME_LABELS),
    '暂无行动记录。',
  );
}

function renderCommandViewBrief(
  tab: CommandTab,
  record: BrandCommandCenterRecord | undefined,
  latestMap: ContentKnowledgeMapRecord | undefined,
  readyQueueCount: number,
) {
  const view = COMMAND_VIEW_CONFIGS[tab];
  const objectSummary = record
    ? `${record.title} · ${record.sourceKnowledgeMapTitle ?? latestMap?.title ?? '未绑定知识地图'}`
    : latestMap
      ? `${latestMap.title} · 等待生成战情室`
      : '缺少内容知识地图';
  const statusSummary = record
    ? `${record.signals.length} 个信号 / ${record.objectives.length} 个目标 / ${readyQueueCount} 个可执行`
    : latestMap
      ? `${latestMap.coverage.readyPercent}% 可用 · ${latestMap.coverage.evidenceCount} 条证据`
      : '先生成内容知识地图再进入作战';
  return (
    <section className="brand-command-view-brief" aria-label={`${view.title}业务摘要`}>
      <div className="brand-command-view-brief-main">
        <div>
          <p className="eyebrow">当前业务对象</p>
          <h4>{view.businessObject}</h4>
          <span>{objectSummary}</span>
        </div>
        <div>
          <p className="eyebrow">当前判断</p>
          <strong>{statusSummary}</strong>
          <span>{view.decisionPoint}</span>
        </div>
        <div>
          <p className="eyebrow">主动作</p>
          <strong>{view.mainAction}</strong>
          <span>{view.deliveryTarget}</span>
        </div>
      </div>
      {renderCommandViewChart(tab, record)}
    </section>
  );
}

function renderSignals(signals: BrandCommandSignal[]) {
  if (!signals.length) return <div className="empty-state">暂无信号。先生成内容知识地图，再从痛点、场景和缺口创建战情室。</div>;
  return (
    <div className="brand-command-signal-grid">
      {signals.map((signal) => (
        <article key={signal.id}>
          <div>
            <strong>{signal.title}</strong>
            <StatusPill tone={signal.riskLevel >= 70 ? 'blocked' : 'idle'}>风险 {signal.riskLevel}</StatusPill>
          </div>
          <p>{signal.summary}</p>
          <div className="brand-command-score-row">
            <span>价值 {signal.businessValue}</span>
            <span>证据 {signal.evidenceReadiness}</span>
            <span>时效 {signal.urgency}</span>
          </div>
          <small>{signal.sourceLabel} · {signal.riskBoundary}</small>
        </article>
      ))}
    </div>
  );
}

function renderObjectives(record: BrandCommandCenterRecord) {
  const { objectives, signals } = record;
  if (!objectives.length) return <div className="empty-state">暂无作战目标。先从高价值信号创建拉新、转化、信任、风险或补资源目标。</div>;
  const signalsById = new Map(signals.map((signal) => [signal.id, signal]));
  return (
    <div className="brand-command-objective-list">
      {objectives.map((objective) => {
        const linkedSignals = objective.signalIds.map((id) => signalsById.get(id)).filter((item): item is BrandCommandSignal => Boolean(item));
        const bundles = record.resourceBundles.filter((bundle) => bundle.objectiveId === objective.id);
        const bundleIds = new Set(bundles.map((bundle) => bundle.id));
        const queueItems = record.queueItems.filter((item) => {
          if (bundleIds.has(item.resourceBundleId)) return true;
          return record.campaignCells.some((cell) => cell.id === item.campaignCellId && cell.objectiveId === objective.id);
        });
        return (
          <article key={objective.id}>
            <div className="brand-command-objective-head">
              <div>
                <p className="eyebrow">{OBJECTIVE_TYPE_LABELS[objective.type]} · {objective.channels.join(' / ') || '待定渠道'}</p>
                <h3>{objective.title}</h3>
              </div>
              <StatusPill tone={objective.priority === 'P0' ? 'blocked' : objective.priority === 'P1' ? 'ready' : 'idle'}>
                {objective.priority}
              </StatusPill>
            </div>
            <p>{objective.summary}</p>
            <div className="brand-command-objective-grid">
              {renderDetailList('成功标准', objective.successCriteria, '待补成功标准', 'wide')}
              {renderDetailList('信号来源', linkedSignals.map((signal) => `${signal.title} · 价值 ${signal.businessValue} / 风险 ${signal.riskLevel}`), '待绑定信号')}
              {renderDetailList('渠道', objective.channels, '待定渠道')}
              {renderDetailList('目标人群', objective.dimensions?.audiences ?? [], '待细分目标人群')}
              {renderDetailList('内容形式', objective.dimensions?.contentFormats ?? [], '待定内容形式')}
              {renderDetailList('使用场景', objective.dimensions?.useCases ?? [], '待定使用场景')}
              {renderDetailList('资源包', bundles.map((bundle) => `${bundle.title} · ${bundle.readyPercent}% 完整`), '待组合资源包')}
              {renderDetailList('队列动作', queueItems.map((item) => `${item.title} · ${QUEUE_STATUS_LABELS[item.status]}`), '待生成执行动作', 'wide')}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function renderBundles(
  record: BrandCommandCenterRecord,
  bundles: BrandCommandResourceBundle[],
  lookup: BrandCommandKnowledgeLookup,
) {
  if (!bundles.length) return <div className="empty-state">暂无资源包。内容知识地图需要先生成卖点、证据和场景。</div>;
  return (
    <div className="brand-command-bundle-list">
      {bundles.map((bundle) => {
        const cell = record.campaignCells.find((item) => item.resourceBundleId === bundle.id);
        const audiences = dimensionValues(bundle, cell, undefined, 'audiences');
        const channels = dimensionValues(bundle, cell, undefined, 'channels');
        const formats = dimensionValues(bundle, cell, undefined, 'contentFormats');
        const useCases = dimensionValues(bundle, cell, undefined, 'useCases');
        return (
          <article key={bundle.id}>
            <div className="panel-title">
              <div>
                <p className="eyebrow">{cell?.ownerRole ?? '内容运营'} · {cell?.channels.join(' / ') ?? '待定渠道'}</p>
                <h3>{bundle.title}</h3>
              </div>
              <StatusPill tone={bundle.readyPercent >= 70 ? 'ready' : 'blocked'}>{bundle.readyPercent}% 完整</StatusPill>
            </div>
            <div className="brand-command-bundle-grid">
              <div><strong>负责席位</strong><span>{cell ? `${cell.ownerRole} / ${cell.agentRole}` : '待分配'}</span></div>
              <div><strong>目标人群</strong><span>{audiences.join(' / ') || '待细分目标人群'}</span></div>
              <div><strong>渠道</strong><span>{channels.join(' / ') || '待定渠道'}</span></div>
              <div><strong>内容形式</strong><span>{formats.join(' / ') || '待定内容形式'}</span></div>
              <div><strong>使用场景</strong><span>{useCases.join(' / ') || '待定使用场景'}</span></div>
              <div><strong>证据</strong><span>{bundle.evidenceRefs.length ? `${bundle.evidenceRefs.length} 条` : '缺证据'}</span></div>
              <div><strong>素材</strong><span>{bundle.materialRefs.length ? `${bundle.materialRefs.length} 个素材` : '缺素材'}</span></div>
              <div>
                <strong>交接产物</strong>
                <span>
                  {bundle.handoffStatus === 'blocked'
                    ? bundle.lastBlockedReason ?? '发布检查未通过'
                    : bundle.handoffStatus === 'handed-off'
                      ? `${bundle.promptDraftIds.length} 个 Prompt / ${bundle.sceneCardIds?.length ?? 0} 张场景卡`
                      : '待交接'}
                </span>
              </div>
            </div>
            <div className="brand-command-bundle-details">
              {renderDetailList('卖点 / 痛点', bundle.sellingPointRefs.map((ref) => rowRefLabel(ref, lookup)), '待补卖点或痛点')}
              {renderDetailList('场景', bundle.sceneRefs.map((ref) => rowRefLabel(ref, lookup)), '待补场景')}
              {renderDetailList('投放组合', [
                audiences.length ? `人群：${audiences.join(' / ')}` : '',
                channels.length ? `渠道：${channels.join(' / ')}` : '',
                formats.length ? `形式：${formats.join(' / ')}` : '',
                useCases.length ? `场景：${useCases.join(' / ')}` : '',
              ].filter(Boolean), '待补生产变量', 'wide')}
              {renderDetailList('证据摘录', bundle.evidenceRefs.map((ref) => evidenceRefLabel(ref, lookup)), '缺少可用证据', 'wide')}
              {renderDetailList('禁用边界', bundle.constraints, '待补发布边界')}
              {renderDetailList('资源缺口', bundle.gaps, '资源已满足', bundle.gaps.length ? 'warn' : '')}
              {renderDetailList('交接引用', [
                ...bundle.promptDraftIds.map((id) => `Prompt：${id}`),
                ...(bundle.sceneCardIds ?? []).map((id) => `场景卡：${id}`),
                ...bundle.sopRefs.map((id) => `SOP：${id}`),
                ...bundle.materialRefs.map((id) => `素材：${id}`),
              ], '尚未交接')}
            </div>
            {cell ? (
              <div className="brand-command-checks">
                {cell.decisionChecks.map((check) => (
                  <span key={check.key} className={check.status === 'passed' ? 'ready' : 'warn'}>
                    {check.label}：{CHECK_STATUS_LABELS[check.status]}
                  </span>
                ))}
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

function renderQueue(
  record: BrandCommandCenterRecord,
  items: BrandCommandQueueItem[],
  lookup: BrandCommandKnowledgeLookup,
  busy: boolean,
  onRecordBrandCommandAction: (queueItemId: string) => void,
) {
  if (!items.length) return <div className="empty-state">暂无执行动作。生成战情室后会自动创建队列。</div>;
  return (
    <div className="brand-command-queue-board">
      {items.map((item) => {
        const bundle = record.resourceBundles.find((entry) => entry.id === item.resourceBundleId);
        const cell = record.campaignCells.find((entry) => entry.id === item.campaignCellId);
        const audiences = dimensionValues(bundle, cell, item, 'audiences');
        const formats = dimensionValues(bundle, cell, item, 'contentFormats');
        const useCases = dimensionValues(bundle, cell, item, 'useCases');
        return (
          <article key={item.id}>
            <div>
              <strong>{item.title}</strong>
              <StatusPill tone={queueTone(item.status)}>{QUEUE_STATUS_LABELS[item.status]}</StatusPill>
            </div>
            <p>{item.summary}</p>
            <div className="brand-command-queue-meta">
              <span>动作：{ACTION_TYPE_LABELS[item.actionType]}</span>
              <span>交付：{OUTPUT_TARGET_LABELS[item.outputTarget]}</span>
              <span>席位：{cell ? `${cell.ownerRole} / ${cell.agentRole}` : '待分配'}</span>
              <span>渠道：{cell?.channels.join(' / ') || '待定'}</span>
              <span>人群：{audiences.join(' / ') || '待细分'}</span>
              <span>形式：{formats.join(' / ') || '待定'}</span>
              <span>场景：{useCases.join(' / ') || '待定'}</span>
              <span>窗口：{cell?.timeWindow ?? '待定'}</span>
              <span>团队：{item.teamSync?.message ?? (item.syncStatus ? SYNC_STATUS_LABELS[item.syncStatus] : '本机记录')}</span>
            </div>
            {bundle ? (
              <div className="brand-command-queue-resources">
                {renderDetailList('资源包', [bundle.title], '未绑定资源包')}
                {renderDetailList('生产变量', [
                  audiences.length ? `目标人群：${audiences.join(' / ')}` : '',
                  formats.length ? `内容形式：${formats.join(' / ')}` : '',
                  useCases.length ? `使用场景：${useCases.join(' / ')}` : '',
                ].filter(Boolean), '待补生产变量')}
                {renderDetailList('可用证据', bundle.evidenceRefs.map((ref) => evidenceRefLabel(ref, lookup)), '缺证据', 'wide')}
                {renderDetailList('缺口 / 恢复', [
                  ...(item.blockedReason ? [`原因：${item.blockedReason}`] : []),
                  ...(item.recoveryAction ? [`下一步：${item.recoveryAction}`] : []),
                  ...bundle.gaps,
                ], '无需补资源', item.status === 'ready' ? '' : 'warn wide')}
              </div>
            ) : null}
            {cell ? (
              <div className="brand-command-check-details">
                {cell.decisionChecks.map((check) => (
                  <span key={`${item.id}-${check.key}`} className={check.status === 'passed' ? 'ready' : 'warn'}>
                    <strong>{check.label}：{CHECK_STATUS_LABELS[check.status]}</strong>
                    <small>{check.message}{check.recoveryAction ? `；${check.recoveryAction}` : ''}</small>
                  </span>
                ))}
              </div>
            ) : null}
            <button
              className="ghost small"
              disabled={busy || item.status === 'handed-off' || item.status === 'written-back'}
              onClick={() => onRecordBrandCommandAction(item.id)}
            >
              {actionButtonLabel(item.status)}
            </button>
          </article>
        );
      })}
    </div>
  );
}

function renderLogs(records: BrandCommandActionRecord[]) {
  if (!records.length) return <div className="empty-state">暂无行动记录。处理队列动作后会追加记录。</div>;
  return (
    <div className="brand-command-log-list">
      {records.map((record) => (
        <article key={record.id}>
          <time>{new Date(record.createdAt).toLocaleString()}</time>
          <div>
            <strong>{record.title}</strong>
            <p>{record.outputSummary}</p>
            <small>
              {record.actorLabel}
              {record.actorRole ? ` / ${TEAM_ROLE_LABELS[record.actorRole]}` : ''}
              {' · '}
              {record.inputSummary}
            </small>
            <div className="brand-command-log-detail">
              <span>动作：{ACTION_TYPE_LABELS[record.actionType]}</span>
              {record.promptDraftId ? <span>Prompt：{record.promptDraftId}</span> : null}
              {record.sceneCardId ? <span>场景卡：{record.sceneCardId}</span> : null}
              {record.workflowRunId ? <span>SOP：{record.workflowRunId}</span> : null}
              {record.reviewTaskId ? <span>审核任务：{record.reviewTaskId}</span> : null}
              {record.materialCoverageChangeId ? <span>素材回写：{record.materialCoverageChangeId}</span> : null}
              {record.writeBackSummary ? <span>回写：{record.writeBackSummary}</span> : null}
              {record.blockedReason ? <span className="warn">原因：{record.blockedReason}</span> : null}
              <span>团队：{record.teamSync?.message ?? (record.syncStatus ? SYNC_STATUS_LABELS[record.syncStatus] : '本机记录')}</span>
            </div>
          </div>
          <StatusPill tone={record.outcome === 'handoff' || record.outcome === 'recorded' ? 'ready' : 'blocked'}>
            {record.outcome === 'handoff' ? '已交接' : record.outcome === 'recorded' ? '已记录' : record.outcome === 'needs-review' ? '待审核' : record.outcome === 'needs-resource' ? '待补资源' : record.outcome === 'written-back' ? '已回写' : '待处理'}
          </StatusPill>
        </article>
      ))}
    </div>
  );
}

export function BrandCommandCenterModule({
  workspaceReady,
  busy,
  contentKnowledgeMaps,
  activeContentKnowledgeMap,
  brandCommandCenters,
  activeBrandCommandCenter,
  activeBrandCommandCenterId,
  setActiveBrandCommandCenterId,
  agentPromptSessions,
  activeAgentPromptSessionId,
  textModel,
  initialTab = 'signals',
  onBuildBrandCommandCenter,
  onRecordBrandCommandAction,
  onRefreshBrandCommandActions,
  onSelectAgentSession,
  onResolveAgentAction,
  onStartAgentSession,
  onContinueAgentSession,
  onSelectModule,
}: BrandCommandCenterModuleProps) {
  const [activeTab, setActiveTab] = useState<CommandTab>(initialTab);
  const [agentMessage, setAgentMessage] = useState(() => COMMAND_VIEW_CONFIGS[initialTab].defaultMessage);
  const currentView = COMMAND_VIEW_CONFIGS[activeTab];
  const feature = V2_FEATURES[currentView.featureKey];
  const activeRecord = activeBrandCommandCenter ?? brandCommandCenters[0];
  const latestMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
  const readyQueueCount = useMemo(
    () => activeRecord?.queueItems.filter((item) => item.status === 'ready').length ?? 0,
    [activeRecord],
  );
  const knowledgeLookup = useMemo(() => buildKnowledgeLookup(latestMap), [latestMap]);
  const hasMap = Boolean(latestMap);
  const hasRecord = Boolean(activeRecord);
  useEffect(() => {
    setActiveTab(initialTab);
    setAgentMessage(COMMAND_VIEW_CONFIGS[initialTab].defaultMessage);
  }, [initialTab]);
  const relatedAgentSessions = useMemo(
    () => agentPromptSessions.filter((session) => (
      session.title.includes('品牌战情室 Agent') ||
      session.title.includes('品牌战情室协作') ||
      session.title.includes(`${currentView.title}协作`) ||
      session.userIntent.includes('品牌战情室 Agent') ||
      session.userIntent.includes('品牌战情室协作') ||
      session.userIntent.includes(`当前视图：${currentView.title}`) ||
      (activeRecord ? session.userIntent.includes(activeRecord.id) || session.userIntent.includes(activeRecord.title) : false)
    )),
    [activeRecord, agentPromptSessions, currentView.title],
  );
  const activeAgentSession =
    relatedAgentSessions.find((session) => session.id === activeAgentPromptSessionId) ??
    relatedAgentSessions[0];
  const agentInputSourceIds = latestMap?.sourceInputSourceIds ?? [];
  const agentSceneCardIds = latestMap?.sceneCardIds ?? [];
  const agentSteps: AgentExecutionStep[] = [
    {
      key: 'map',
      title: '知识地图',
      detail: latestMap ? latestMap.title : '先生成内容知识地图',
      state: hasMap ? 'done' : 'active',
    },
    {
      key: 'signals',
      title: '信号',
      detail: activeRecord ? `${activeRecord.signals.length} 个信号` : '等待从痛点、场景和缺口识别机会',
      state: activeRecord?.signals.length ? 'done' : hasMap ? 'active' : 'blocked',
    },
    {
      key: 'objectives',
      title: '作战目标',
      detail: activeRecord ? `${activeRecord.objectives.length} 个目标` : '等待把信号转成拉新、转化、信任或风险目标',
      state: activeRecord?.objectives.length ? 'done' : activeRecord?.signals.length ? 'active' : 'idle',
    },
    {
      key: 'bundles',
      title: '资源包',
      detail: activeRecord ? `${activeRecord.resourceBundles.length} 个资源包` : '等待组合卖点、证据、场景和边界',
      state: activeRecord?.resourceBundles.length ? 'done' : hasRecord ? 'active' : 'idle',
    },
    {
      key: 'queue',
      title: '执行队列',
      detail: activeRecord ? `${readyQueueCount}/${activeRecord.queueItems.length} 个可执行` : '等待生成执行动作',
      state: activeRecord?.queueItems.length ? 'active' : 'idle',
    },
    {
      key: 'logs',
      title: '行动记录',
      detail: activeRecord ? `${activeRecord.actionRecords.length} 条记录` : '交接、送审和补资源都会留痕',
      state: activeRecord?.actionRecords.length ? 'done' : 'idle',
    },
  ];
  const agentContext = (
    <div className="knowledge-agent-context-grid">
      <article>
        <span>输入底座</span>
        <strong>{latestMap?.title ?? '缺少内容知识地图'}</strong>
        <small>{latestMap ? `${latestMap.coverage.readyPercent}% 可用 · ${latestMap.coverage.evidenceCount} 条证据` : '先把资料整理成内容知识地图'}</small>
      </article>
      <article>
        <span>当前{currentView.title}</span>
        <strong>{activeRecord?.title ?? '尚未生成品牌战情室'}</strong>
        <small>{activeRecord ? `${CENTER_STATUS_LABELS[activeRecord.status]} · ${readyQueueCount} 个可执行动作` : '等待从知识地图生成信号和队列'}</small>
      </article>
      <article>
        <span>人工介入</span>
        <strong>队列动作逐条处理</strong>
        <small>记录交接、送审、补资源和拦截，不伪造自动完成结果</small>
      </article>
    </div>
  );
  const startBrandCommandAgent = () => {
    const trimmed = agentMessage.trim();
    if (!trimmed) return;
    onStartAgentSession({
      title: `${activeRecord?.title ?? currentView.title} / ${currentView.title}协作`,
      purpose: 'sop',
      userIntent: [
        `${currentView.title}协作`,
        `当前视图：${currentView.title}`,
        `用户任务：${currentView.decisionPoint}`,
        activeRecord ? `当前战情室：${activeRecord.title}（${activeRecord.id}）` : '当前还没有品牌战情室。',
        latestMap ? `来源知识地图：${latestMap.title}（${latestMap.id}）` : '没有可用内容知识地图。',
        activeRecord ? `队列状态：${readyQueueCount}/${activeRecord.queueItems.length} 个可执行，${activeRecord.actionRecords.length} 条行动记录。` : '',
        `用户请求：${trimmed}`,
        '请基于真实信号、资源包、决策检查、执行队列和行动记录判断下一步；需要人工审核或补资源时必须明确标出，不要伪造已交接结果。',
      ].filter(Boolean).join('\n'),
      inputSourceIds: agentInputSourceIds,
      sceneCardIds: agentSceneCardIds,
      textModel,
    });
  };
  const continueBrandCommandAgent = () => {
    const trimmed = agentMessage.trim();
    if (!activeAgentSession || !trimmed) return;
    onContinueAgentSession({ sessionId: activeAgentSession.id, message: trimmed, textModel });
  };

  return (
    <section className="knowledge-brand-workbench brand-command-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="compact"
        actions={(
          <div className="v2-feature-actions">
            <StatusPill tone={centerTone(activeRecord?.status)}>{activeRecord ? CENTER_STATUS_LABELS[activeRecord.status] : '待生成'}</StatusPill>
            <StatusPill tone={readyQueueCount ? 'ready' : 'idle'}>{readyQueueCount} 个可执行</StatusPill>
            <StatusPill tone={latestMap ? 'ready' : 'blocked'}>{latestMap ? '已绑定知识地图' : '缺少知识地图'}</StatusPill>
            {activeRecord ? <StatusPill tone={activeRecord.syncStatus === 'synced' ? 'ready' : 'idle'}>{SYNC_STATUS_LABELS[activeRecord.syncStatus]}</StatusPill> : null}
          </div>
        )}
      />

      <AgentSessionPanel
        eyebrow="战情助手"
        title={`${currentView.title} / ${activeRecord?.title ?? '等待生成战情室'}`}
        session={activeAgentSession}
        sessions={relatedAgentSessions}
        transcriptLabel={activeAgentSession ? activeAgentSession.title : hasRecord ? currentView.transcriptLabel : `等待生成${currentView.title}`}
        statusLabel={activeAgentSession ? AGENT_SESSION_STATUS_LABELS[activeAgentSession.status] : activeRecord ? CENTER_STATUS_LABELS[activeRecord.status] : '待生成'}
        statusTone={activeAgentSession ? agentSessionTone(activeAgentSession.status) : centerTone(activeRecord?.status)}
        steps={agentSteps}
        runningLabel={busy ? `正在处理${currentView.title}任务` : undefined}
        context={agentContext}
        artifact={(
          <div className="brand-command-layout">
        <aside className="panel prompt-draft-list-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">版本</p>
              <h3>战情室记录</h3>
            </div>
            <StatusPill tone="idle">{brandCommandCenters.length} 版</StatusPill>
          </div>
          <div className="prompt-draft-list">
            {brandCommandCenters.map((record) => (
              <SelectableRecordCard
                key={record.id}
                className="prompt-draft-card"
                active={record.id === activeBrandCommandCenterId}
                status={CENTER_STATUS_LABELS[record.status]}
                statusTone={centerTone(record.status)}
                title={record.title}
                meta={`${record.signals.length} 个信号 · ${record.queueItems.length} 个动作`}
                description={record.gaps[0] ? clip(record.gaps[0], 72) : '可进入执行队列。'}
                onClick={() => setActiveBrandCommandCenterId(record.id)}
              />
            ))}
            {brandCommandCenters.length === 0 ? <div className="empty-state">暂无战情室记录。</div> : null}
          </div>
        </aside>

        <section className="panel brand-command-detail-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">{currentView.detailEyebrow}</p>
              <h3>{activeRecord ? `${currentView.detailTitle} · ${activeRecord.title}` : `尚未生成${currentView.title}`}</h3>
            </div>
            {activeRecord ? <StatusPill tone={centerTone(activeRecord.status)}>{CENTER_STATUS_LABELS[activeRecord.status]}</StatusPill> : null}
          </div>
          {activeRecord ? (
            <div className="brand-command-sync-row">
              <span>{activeRecord.teamSync.message}</span>
              <button className="ghost small" disabled={!workspaceReady || busy} onClick={onRefreshBrandCommandActions}>
                同步团队记录
              </button>
            </div>
          ) : null}

          {activeRecord ? (
            <>
              {renderCommandViewBrief(activeTab, activeRecord, latestMap, readyQueueCount)}
              <div className="content-map-stat-grid">
                <article><strong>{activeRecord.signals.length}</strong><span>信号</span></article>
                <article><strong>{activeRecord.objectives.length}</strong><span>目标</span></article>
                <article><strong>{activeRecord.resourceBundles.length}</strong><span>资源包</span></article>
                <article><strong>{activeRecord.queueItems.length}</strong><span>队列动作</span></article>
                <article><strong>{readyQueueCount}</strong><span>可执行</span></article>
                <article><strong>{activeRecord.actionRecords.length}</strong><span>行动记录</span></article>
              </div>
              <div className="content-map-tabs" role="tablist" aria-label="品牌战情室详情">
                {TAB_LABELS.map((tab) => (
                  <button
                    key={tab.key}
                    className={activeTab === tab.key ? 'active' : ''}
                    onClick={() => {
                      setActiveTab(tab.key);
                      setAgentMessage(COMMAND_VIEW_CONFIGS[tab.key].defaultMessage);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              {activeTab === 'signals' ? renderSignals(activeRecord.signals) : null}
              {activeTab === 'objectives' ? renderObjectives(activeRecord) : null}
              {activeTab === 'bundles' ? renderBundles(activeRecord, activeRecord.resourceBundles, knowledgeLookup) : null}
              {activeTab === 'queue' ? renderQueue(activeRecord, activeRecord.queueItems, knowledgeLookup, busy, onRecordBrandCommandAction) : null}
              {activeTab === 'logs' ? renderLogs(activeRecord.actionRecords) : null}
            </>
          ) : (
            <>
              {renderCommandViewBrief(activeTab, activeRecord, latestMap, readyQueueCount)}
              <div className="empty-state">先生成内容知识地图，再创建{currentView.title}。</div>
            </>
          )}
        </section>
          </div>
        )}
        footer={(
          <>
            <label className="prompt-session-adjustment knowledge-agent-composer">
              <span>{activeAgentSession ? '继续对话' : currentView.composerLabel}</span>
              <textarea value={agentMessage} onChange={(event) => setAgentMessage(event.target.value)} />
            </label>
            <ActionGroup align="left" className="knowledge-agent-actions">
              {activeAgentSession ? (
                <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim()} onClick={continueBrandCommandAgent}>
                  {currentView.continueAgentAction}
                </button>
              ) : (
                <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim() || !latestMap} onClick={startBrandCommandAgent}>
                  {currentView.primaryAgentAction}
                </button>
              )}
              <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge-map')}>
                打开知识地图
              </button>
              <button className="ghost small" disabled={!workspaceReady || busy || !latestMap} onClick={onBuildBrandCommandCenter}>
                生成战情室
              </button>
              <button className="ghost small" disabled={!workspaceReady || busy || !activeRecord} onClick={() => onSelectModule('assets-prompt-workbench')}>
                去 Prompt 工作台
              </button>
            </ActionGroup>
          </>
        )}
        empty={(
          <>
            <strong>等待内容知识地图</strong>
            <span>生成知识地图后，Agent 会识别信号、组合资源包并创建可人工处理的执行队列。</span>
          </>
        )}
        onSelectSession={onSelectAgentSession}
        onResolveAction={onResolveAgentAction}
        messageTitle={agentMessageTitle}
        messageMeta={(message) => `${AGENT_MESSAGE_KIND_LABELS[message.kind]} · ${new Date(message.createdAt).toLocaleString()}`}
        messagePreview={compactAgentMessage}
      />
    </section>
  );
}
