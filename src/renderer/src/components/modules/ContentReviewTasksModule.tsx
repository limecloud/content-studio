import { useEffect, useMemo, useState } from 'react';
import type {
  AgentPromptSession,
  ContentKnowledgeMapEvidence,
  ContentKnowledgeMapRecord,
  ContentKnowledgeMapMatrixRow,
  ContentProductionHandoffResult,
  ContentProductionHandoffTarget,
  ContentReviewDecisionAction,
  ContentReviewDecisionPayload,
  ContentReviewTask,
  PromptDraftPurpose,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import type { ModuleKey } from '../../app/types';
import { clip } from '../../app/formatters';
import { AgentSessionPanel, type AgentActionResolver, type AgentExecutionStep } from '../agent/AgentSessionPanel';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { ActionGroup, SelectableRecordCard, StatusPill } from '../WorkbenchPrimitives';

interface ContentReviewTasksModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  contentKnowledgeMaps: ContentKnowledgeMapRecord[];
  activeContentKnowledgeMap?: ContentKnowledgeMapRecord;
  contentReviewTasks: ContentReviewTask[];
  activeContentReviewTask?: ContentReviewTask;
  activeContentReviewTaskId: string;
  setActiveContentReviewTaskId: (taskId: string) => void;
  onGenerateContentReviewTasks: () => void;
  onSubmitContentReviewDecision: (taskId: string, action: ContentReviewDecisionAction, payload?: ContentReviewDecisionPayload) => void;
  onCreateContentProductionHandoff: (taskId: string, target?: ContentProductionHandoffTarget) => void;
  contentProductionHandoff: ContentProductionHandoffResult | null;
  agentPromptSessions: AgentPromptSession[];
  activeAgentPromptSessionId: string;
  textModel?: string;
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

const TASK_STATUS_LABELS: Record<ContentReviewTask['status'], string> = {
  open: '待审核',
  approved: '已通过',
  rejected: '已驳回',
  'needs-evidence': '待补证据',
  'needs-material': '待补素材',
  forbidden: '已禁用',
};

const TASK_PURPOSE_LABELS: Record<NonNullable<ContentReviewTask['taskPurpose']>, string> = {
  review: '发布审核',
  'evidence-supplement': '补证据',
  'material-supplement': '补素材',
};

const TASK_TARGET_LABELS: Record<ContentReviewTask['targetType'], string> = {
  'selling-point': '卖点',
  'pain-point': '痛点',
  scenario: '场景',
  evidence: '证据',
  constraint: '规则',
  gap: '缺口',
};

const DECISION_LABELS: Record<ContentReviewDecisionAction, string> = {
  approve: '通过',
  reject: '驳回',
  'request-evidence': '补证据',
  'request-material': '补素材',
  'mark-forbidden': '标记禁用',
  'downgrade-to-needs-verification': '降级待确认',
  'rename-target': '改名',
  'merge-related': '合并',
  'split-target': '拆分',
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

function statusTone(status?: ContentReviewTask['status']) {
  if (status === 'approved') return 'ready';
  if (status === 'rejected' || status === 'forbidden' || status === 'needs-evidence' || status === 'needs-material') return 'blocked';
  return 'idle';
}

function agentSessionTone(status?: AgentPromptSession['status']) {
  if (status === 'blocked' || status === 'closed') return 'blocked';
  if (status === 'draft-created' || status === 'active') return 'ready';
  return 'idle';
}

function agentMessageTitle(message: AgentPromptSession['messages'][number]): string {
  if (message.role === 'user') return message.kind === 'adjustment' ? '你的补充' : '你的任务';
  if (message.role === 'assistant') return '审核建议';
  return '系统记录';
}

function compactAgentMessage(message: AgentPromptSession['messages'][number]): string {
  const content = message.content.trim();
  if (!content) return '无内容';
  const userIntent = content.match(/用户意图：\n([\s\S]*?)(\n\n输入源快照：|\n\n本轮 skills：|$)/)?.[1]?.trim();
  if (message.role === 'user' && userIntent) return userIntent.split('\n').filter(Boolean).slice(0, 6).join('\n');
  const promptDraft = content.match(/Prompt 草稿：\n([\s\S]*?)(\n\n需要追问|\n\n仍需追问|\n\n来源与合规提醒|\n\n下游检查清单|\n\n本轮调整：|$)/)?.[1]?.trim();
  if (message.role === 'assistant' && promptDraft) return promptDraft.split('\n').filter(Boolean).slice(0, 8).join('\n');
  return content.split('\n').filter(Boolean).slice(0, 8).join('\n');
}

function riskLabel(risk: ContentReviewTask['risk']) {
  if (risk === 'high') return '高风险';
  if (risk === 'medium') return '中风险';
  return '低风险';
}

function taskSyncLabel(task?: ContentReviewTask): string {
  if (!task?.syncStatus) return '待同步';
  if (task.syncStatus === 'synced') return '团队已同步';
  if (task.syncStatus === 'conflict') return '有冲突';
  if (task.syncStatus === 'blocked') return '未同步到团队';
  if (task.syncStatus === 'pending-sync') return '待同步';
  return '本机草稿';
}

function rowsForReviewTarget(
  map: ContentKnowledgeMapRecord | undefined,
  targetType: ContentReviewTask['targetType'] | undefined,
): ContentKnowledgeMapMatrixRow[] {
  if (!map || !targetType) return [];
  if (targetType === 'selling-point') return map.sellingPoints;
  if (targetType === 'pain-point') return map.painPoints;
  if (targetType === 'scenario') return map.scenarios;
  return [];
}

function evidenceSourceLabel(sourceType: ContentKnowledgeMapEvidence['sourceType']): string {
  if (sourceType === 'user-quote') return '用户原声';
  if (sourceType === 'customer-service-log') return '客服记录';
  if (sourceType === 'brand-knowledge-base') return '品牌资料';
  if (sourceType === 'ip-knowledge-base') return 'IP 资料';
  if (sourceType === 'scene-card') return '场景卡';
  if (sourceType === 'prompt-draft') return '提示词草稿';
  if (sourceType === 'asset-review') return '素材审核';
  if (sourceType === 'generated-inference') return '推理结果';
  if (sourceType === 'manual') return '人工补充';
  return '输入资料';
}

function evidenceStatusLabel(status: ContentKnowledgeMapEvidence['status']): string {
  if (status === 'ready') return '可用';
  if (status === 'needs-review') return '待审核';
  return '缺证据';
}

function renderTaskEvidence(
  task: ContentReviewTask,
  evidenceById: Map<string, ContentKnowledgeMapEvidence>,
) {
  const evidence = task.evidenceRefs.map((id) => evidenceById.get(id)).filter((item): item is ContentKnowledgeMapEvidence => Boolean(item));
  return (
    <div>
      <strong>证据详情</strong>
      <div className="content-review-evidence-list">
        {evidence.map((item) => (
          <article key={item.id}>
            <div>
              <strong>{evidenceSourceLabel(item.sourceType)}</strong>
              <StatusPill tone={item.status === 'ready' ? 'ready' : 'blocked'}>{evidenceStatusLabel(item.status)}</StatusPill>
            </div>
            <p>{item.excerpt || item.claim}</p>
            <small>{item.sourceTitle}</small>
          </article>
        ))}
        {evidence.length === 0 ? (
          <span className="content-review-empty-detail">当前任务没有可展开证据，需要补充用户原声、产品资料、品牌口径或人工说明。</span>
        ) : null}
      </div>
    </div>
  );
}

function renderTaskSources(task: ContentReviewTask) {
  return (
    <div>
      <strong>来源引用</strong>
      <div className="content-review-source-list">
        {task.sourceRefs.slice(0, 8).map((ref) => <span key={ref}>{ref}</span>)}
        {task.sourceRefs.length > 8 ? <small>另有 {task.sourceRefs.length - 8} 个来源未展开</small> : null}
        {task.sourceRefs.length === 0 ? (
          <span className="warn">暂无来源引用，审核通过前应补充来源或降级为待确认。</span>
        ) : null}
      </div>
    </div>
  );
}

function parseSplitItems(value: string): NonNullable<ContentReviewDecisionPayload['splitItems']> {
  return value
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const delimiter = line.includes('｜') ? '｜' : line.includes('|') ? '|' : line.includes('：') ? '：' : ':';
      const [title, ...summaryParts] = line.split(delimiter);
      return {
        title: title.trim(),
        summary: summaryParts.join(delimiter).trim(),
      };
    })
    .filter((item) => item.title);
}

export function ContentReviewTasksModule({
  workspaceReady,
  busy,
  contentKnowledgeMaps,
  activeContentKnowledgeMap,
  contentReviewTasks,
  activeContentReviewTask,
  activeContentReviewTaskId,
  setActiveContentReviewTaskId,
  onGenerateContentReviewTasks,
  onSubmitContentReviewDecision,
  onCreateContentProductionHandoff,
  contentProductionHandoff,
  agentPromptSessions,
  activeAgentPromptSessionId,
  textModel,
  onSelectAgentSession,
  onResolveAgentAction,
  onStartAgentSession,
  onContinueAgentSession,
  onSelectModule,
}: ContentReviewTasksModuleProps) {
  const feature = V2_FEATURES['knowledge-review'];
  const [agentMessage, setAgentMessage] = useState('请基于当前审核任务，说明是否可以通过、需要补哪些证据，或者应该驳回。');
  const [reviewTitleDraft, setReviewTitleDraft] = useState('');
  const [reviewSummaryDraft, setReviewSummaryDraft] = useState('');
  const [splitDraft, setSplitDraft] = useState('');
  const [mergeTargetIds, setMergeTargetIds] = useState<string[]>([]);
  const task = activeContentReviewTask ?? contentReviewTasks[0];
  const openCount = contentReviewTasks.filter((item) => item.status === 'open' || item.status === 'needs-evidence' || item.status === 'needs-material').length;
  const approvedCount = contentReviewTasks.filter((item) => item.status === 'approved').length;
  const sourceMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
  const adjustableRows = useMemo(() => rowsForReviewTarget(sourceMap, task?.targetType), [sourceMap, task?.targetType]);
  const evidenceById = useMemo(
    () => new Map((sourceMap?.evidence ?? []).map((item) => [item.id, item])),
    [sourceMap],
  );
  const mergeCandidates = useMemo(
    () => adjustableRows.filter((row) => row.id !== task?.targetId).slice(0, 8),
    [adjustableRows, task?.targetId],
  );
  const splitItems = useMemo(() => parseSplitItems(splitDraft), [splitDraft]);
  useEffect(() => {
    setReviewTitleDraft(task?.title ?? '');
    setReviewSummaryDraft(task?.summary ?? '');
    setSplitDraft(task ? `${task.title}｜${task.summary}\n` : '');
    setMergeTargetIds([]);
  }, [task?.id, task?.summary, task?.title]);
  const relatedAgentSessions = useMemo(
    () => agentPromptSessions.filter((session) => (
      session.title.includes('内容审核 Agent') ||
      session.title.includes('内容审核协作') ||
      session.userIntent.includes('内容审核 Agent') ||
      session.userIntent.includes('内容审核协作') ||
      (task ? session.userIntent.includes(task.id) || session.userIntent.includes(task.title) : false) ||
      (sourceMap ? session.userIntent.includes(sourceMap.id) || session.userIntent.includes(sourceMap.title) : false)
    )),
    [agentPromptSessions, sourceMap, task],
  );
  const activeAgentSession =
    relatedAgentSessions.find((session) => session.id === activeAgentPromptSessionId) ??
    relatedAgentSessions[0];
  const agentInputSourceIds = sourceMap?.sourceInputSourceIds ?? [];
  const agentSceneCardIds = sourceMap?.sceneCardIds ?? [];
  const canAdjustTask = Boolean(task && ['selling-point', 'pain-point', 'scenario'].includes(task.targetType));
  const submitRename = () => {
    const title = reviewTitleDraft.trim();
    if (!task || !title) return;
    onSubmitContentReviewDecision(task.id, 'rename-target', {
      title,
      summary: reviewSummaryDraft.trim() || undefined,
    });
  };
  const submitMerge = () => {
    if (!task || !mergeTargetIds.length) return;
    onSubmitContentReviewDecision(task.id, 'merge-related', {
      title: reviewTitleDraft.trim() || task.title,
      summary: reviewSummaryDraft.trim() || task.summary,
      mergeTargetIds,
    });
  };
  const submitSplit = () => {
    if (!task || splitItems.length < 2) return;
    onSubmitContentReviewDecision(task.id, 'split-target', { splitItems });
  };
  const toggleMergeTarget = (rowId: string) => {
    setMergeTargetIds((current) => current.includes(rowId)
      ? current.filter((id) => id !== rowId)
      : [...current, rowId]);
  };
  const agentSteps: AgentExecutionStep[] = [
    {
      key: 'map',
      title: '读取知识地图',
      detail: sourceMap ? sourceMap.title : '缺少内容知识地图',
      state: sourceMap ? 'done' : 'blocked',
    },
    {
      key: 'tasks',
      title: '生成审核任务',
      detail: `${contentReviewTasks.length} 个任务`,
      state: contentReviewTasks.length ? 'done' : sourceMap ? 'idle' : 'blocked',
    },
    {
      key: 'decision',
      title: '人工决策',
      detail: task ? TASK_STATUS_LABELS[task.status] : '未选择任务',
      state: task?.status === 'approved' ? 'done' : task ? 'active' : 'idle',
    },
    {
      key: 'handoff',
      title: '生产交接',
      detail: contentProductionHandoff?.status === 'created' ? '已交接' : '等待通过审核',
      state: contentProductionHandoff?.status === 'created' ? 'done' : task?.status === 'approved' ? 'active' : 'idle',
    },
  ];
  const reviewAgentContext = (
    <>
      <div className="agent-turn-head">
        <strong>审核队列</strong>
        <small>{openCount} 个待处理 / {approvedCount} 个已通过</small>
      </div>
      <div className="content-review-source-strip">
        <StatusPill tone={sourceMap ? 'ready' : 'blocked'}>{sourceMap ? clip(sourceMap.title, 28) : '缺少知识地图'}</StatusPill>
        <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge-map')}>
          打开知识地图
        </button>
        <button className="primary small" disabled={!workspaceReady || busy} onClick={onGenerateContentReviewTasks}>
          生成审核任务
        </button>
      </div>
      <div className="content-review-agent-queue">
        {contentReviewTasks.map((item) => (
          <SelectableRecordCard
            key={item.id}
            className="prompt-draft-card"
            active={item.id === activeContentReviewTaskId}
            status={TASK_STATUS_LABELS[item.status]}
            statusTone={statusTone(item.status)}
            title={item.title}
            meta={`${TASK_TARGET_LABELS[item.targetType]} · ${riskLabel(item.risk)}`}
            description={clip(item.summary, 88)}
            onClick={() => setActiveContentReviewTaskId(item.id)}
          />
        ))}
        {contentReviewTasks.length === 0 ? <div className="empty-state">暂无审核任务。</div> : null}
      </div>
    </>
  );
  const reviewAgentArtifact = task ? (
    <>
      <div className="agent-turn-head">
        <strong>{task.title}</strong>
        <small>{TASK_TARGET_LABELS[task.targetType]} · {riskLabel(task.risk)} · {taskSyncLabel(task)}</small>
      </div>
      <div className="content-review-summary">
        <article>
          <strong>审核对象</strong>
          <span>{TASK_TARGET_LABELS[task.targetType]}</span>
        </article>
        <article>
          <strong>任务类型</strong>
          <span>{TASK_PURPOSE_LABELS[task.taskPurpose ?? 'review']}</span>
        </article>
        <article>
          <strong>风险等级</strong>
          <span>{riskLabel(task.risk)}</span>
        </article>
        <article>
          <strong>证据数量</strong>
          <span>{task.evidenceRefs.length} 条</span>
        </article>
        <article>
          <strong>建议处理</strong>
          <span>{DECISION_LABELS[task.suggestedAction]}</span>
        </article>
        <article>
          <strong>团队状态</strong>
          <span>{taskSyncLabel(task)}</span>
        </article>
      </div>
      <div className="content-review-body">
        <div>
          <strong>内容摘要</strong>
          <p>{task.summary}</p>
        </div>
        <div>
          <strong>问题标签</strong>
          <div className="content-review-chip-list">
            {task.issueLabels.map((label) => <span key={label} className={task.risk === 'low' ? 'ready' : 'warn'}>{label}</span>)}
            {task.issueLabels.length === 0 ? <span className="ready">无明显问题</span> : null}
          </div>
        </div>
        <div>
          <strong>来源</strong>
          <p>{task.sourceKnowledgeMapTitle ?? '本机内容知识地图'} · {task.sourceRefs.length ? `${task.sourceRefs.length} 个来源引用` : '暂无来源引用'}</p>
        </div>
        {renderTaskEvidence(task, evidenceById)}
        {renderTaskSources(task)}
        <div>
          <strong>恢复路径</strong>
          <p>
            {task.suggestedAction === 'approve'
              ? '证据和风险可接受，可通过后生成 Prompt 草稿或场景卡。'
              : task.suggestedAction === 'request-evidence'
                ? '先补用户原声、产品资料、测试数据或客服记录，再重新审核。'
                : task.suggestedAction === 'request-material'
                  ? '先补充可用图片、视频、案例或客服截图；素材通过审核后再回写覆盖矩阵。'
                : task.suggestedAction === 'mark-forbidden'
                  ? '标记禁用后该表达不能进入提示词依据或生产交接。'
                  : task.suggestedAction === 'downgrade-to-needs-verification'
                    ? '降级为待确认后只能作为弱表达或补充任务，不能写成确定性主张。'
                    : '驳回后保留审核记录，并回到内容知识地图改写或合并。'}
          </p>
        </div>
      </div>
      {canAdjustTask ? (
        <div className="content-review-adjustment">
          <div className="agent-turn-head">
            <strong>调整当前条目</strong>
            <small>{mergeCandidates.length} 个同类条目可对齐</small>
          </div>
          <div className="content-review-adjustment-grid">
            <label>
              <span>条目名称</span>
              <input value={reviewTitleDraft} onChange={(event) => setReviewTitleDraft(event.target.value)} />
            </label>
            <label>
              <span>摘要</span>
              <textarea value={reviewSummaryDraft} onChange={(event) => setReviewSummaryDraft(event.target.value)} />
            </label>
          </div>
          <ActionGroup align="left">
            <button className="ghost small" disabled={busy || !reviewTitleDraft.trim()} onClick={submitRename}>保存改名</button>
          </ActionGroup>
          <div className="content-review-merge-list">
            {mergeCandidates.map((row) => (
              <label key={row.id} className="content-review-merge-option">
                <input
                  type="checkbox"
                  checked={mergeTargetIds.includes(row.id)}
                  onChange={() => toggleMergeTarget(row.id)}
                />
                <span>
                  <strong>{row.title}</strong>
                  <small>{clip(row.summary, 64)}</small>
                </span>
              </label>
            ))}
            {mergeCandidates.length === 0 ? <div className="empty-state">没有可合并的同类条目。</div> : null}
          </div>
          <ActionGroup align="left">
            <button className="ghost small" disabled={busy || mergeTargetIds.length === 0} onClick={submitMerge}>合并所选</button>
          </ActionGroup>
          <label className="content-review-split-editor">
            <span>拆分条目</span>
            <textarea value={splitDraft} onChange={(event) => setSplitDraft(event.target.value)} />
          </label>
          <ActionGroup align="left">
            <button className="ghost small" disabled={busy || splitItems.length < 2} onClick={submitSplit}>拆分成 {Math.max(splitItems.length, 0)} 条</button>
          </ActionGroup>
        </div>
      ) : null}
      {contentProductionHandoff ? (
        <div className="content-review-handoff-summary">
          <StatusPill tone={contentProductionHandoff.status === 'created' ? 'ready' : 'blocked'}>
            {contentProductionHandoff.status === 'created' ? '已交接' : '未通过检查'}
          </StatusPill>
          <div>
            <strong>{contentProductionHandoff.grounding?.title ?? '生产交接检查'}</strong>
            <p>
              {contentProductionHandoff.status === 'created'
                ? `${contentProductionHandoff.record?.actionRecords[0]?.outputSummary ?? `已生成 ${contentProductionHandoff.promptDraft ? 'Prompt 草稿' : ''}${contentProductionHandoff.promptDraft && contentProductionHandoff.sceneCard ? '和' : ''}${contentProductionHandoff.sceneCard ? '场景卡' : ''}`}，可在下游工作台继续确认。`
                : contentProductionHandoff.issues[0] ?? '发布检查未通过。'}
            </p>
            {contentProductionHandoff.record ? (
              <div className="content-review-handoff-checks">
                {contentProductionHandoff.record.actionRecords[0]?.checks.map((check) => (
                  <span key={check.label} className={check.status === 'passed' ? 'ready' : 'blocked'}>
                    {check.label}：{check.message}
                  </span>
                ))}
                <span className={contentProductionHandoff.record.syncStatus === 'synced' ? 'ready' : 'blocked'}>
                  团队记录：{contentProductionHandoff.record.teamSync?.message ?? '已保存在本机'}
                </span>
              </div>
            ) : null}
          </div>
          {contentProductionHandoff.status === 'created' ? (
            <button className="primary small" onClick={() => onSelectModule('agents')}>
              打开 agents
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="content-review-decision-list">
        {task.decisions.map((decision) => (
          <article key={decision.id}>
            <time>{new Date(decision.createdAt).toLocaleString()}</time>
            <div>
              <strong>{DECISION_LABELS[decision.action]}</strong>
              <p>{decision.reason}</p>
              <small>{decision.reviewerLabel}</small>
            </div>
            <StatusPill tone={decision.action === 'approve' ? 'ready' : 'blocked'}>{DECISION_LABELS[decision.action]}</StatusPill>
          </article>
        ))}
        {task.decisions.length === 0 ? <div className="empty-state">暂无审核决策。</div> : null}
      </div>
    </>
  ) : null;
  const startReviewAgent = () => {
    const trimmed = agentMessage.trim();
    if (!trimmed) return;
    onStartAgentSession({
      title: `${task?.title ?? '内容审核'} / 内容审核协作`,
      purpose: 'content-task',
      userIntent: [
        '内容审核协作',
        task ? `当前审核任务：${task.title}（${task.id}）` : '当前还没有选中的审核任务。',
        task ? `任务类型：${TASK_TARGET_LABELS[task.targetType]}；风险：${riskLabel(task.risk)}；状态：${TASK_STATUS_LABELS[task.status]}。` : '',
        task ? `业务类型：${TASK_PURPOSE_LABELS[task.taskPurpose ?? 'review']}。` : '',
        task ? `证据：${task.evidenceRefs.length} 条；来源引用：${task.sourceRefs.length} 条；建议动作：${DECISION_LABELS[task.suggestedAction]}。` : '',
        sourceMap ? `来源知识地图：${sourceMap.title}（${sourceMap.id}），输入源 ${sourceMap.sourceInputSourceIds.length} 个，场景卡 ${sourceMap.sceneCardIds.length} 张。` : '没有可用内容知识地图。',
        contentProductionHandoff ? `最近生产交接状态：${contentProductionHandoff.status}。` : '还没有生产交接记录。',
        `用户请求：${trimmed}`,
        '请基于真实审核任务、证据、来源和已记录决策给出判断；需要人工通过、驳回、补证据或交接时必须明确说明，不要伪造已审核或已交接结果。',
      ].filter(Boolean).join('\n'),
      inputSourceIds: agentInputSourceIds,
      sceneCardIds: agentSceneCardIds,
      textModel,
    });
  };
  const continueReviewAgent = () => {
    const trimmed = agentMessage.trim();
    if (!activeAgentSession || !trimmed) return;
    onContinueAgentSession({ sessionId: activeAgentSession.id, message: trimmed, textModel });
  };
  const reviewAgentFooter = (
    <>
      <label className="prompt-session-adjustment knowledge-agent-composer">
        <span>{activeAgentSession ? '继续对话' : '审核要求'}</span>
        <textarea value={agentMessage} onChange={(event) => setAgentMessage(event.target.value)} />
      </label>
      <ActionGroup align="left">
        {activeAgentSession ? (
          <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim()} onClick={continueReviewAgent}>
            继续会话
          </button>
        ) : (
          <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim() || (!task && !sourceMap)} onClick={startReviewAgent}>
            开始审核
          </button>
        )}
        {task ? (
          <>
            <button className="ghost small" disabled={busy || task.status === 'approved'} onClick={() => onSubmitContentReviewDecision(task.id, 'approve')}>通过</button>
            <button className="ghost small" disabled={busy || task.status === 'rejected'} onClick={() => onSubmitContentReviewDecision(task.id, 'reject')}>驳回</button>
            <button className="ghost small" disabled={busy} onClick={() => onSubmitContentReviewDecision(task.id, 'request-evidence')}>补证据</button>
            <button className="ghost small" disabled={busy} onClick={() => onSubmitContentReviewDecision(task.id, 'request-material')}>补素材</button>
            <button className="ghost small" disabled={busy} onClick={() => onSubmitContentReviewDecision(task.id, 'mark-forbidden')}>标记禁用</button>
            <button className="ghost small" disabled={busy} onClick={() => onSubmitContentReviewDecision(task.id, 'downgrade-to-needs-verification')}>降级待确认</button>
            <button className="ghost small" disabled={busy || task.status !== 'approved'} onClick={() => onCreateContentProductionHandoff(task.id)}>生成 Prompt 草稿</button>
          </>
        ) : (
          <>
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={onGenerateContentReviewTasks}>
              生成审核任务
            </button>
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge-map')}>
              打开知识地图
            </button>
          </>
        )}
      </ActionGroup>
    </>
  );

  return (
    <section className="knowledge-brand-workbench content-review-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="compact"
        actions={(
          <div className="v2-feature-actions">
            <StatusPill tone={openCount ? 'blocked' : contentReviewTasks.length ? 'ready' : 'idle'}>{openCount} 个待处理</StatusPill>
            <StatusPill tone={approvedCount ? 'ready' : 'idle'}>{approvedCount} 个已通过</StatusPill>
          </div>
        )}
      />

      <AgentSessionPanel
        eyebrow="审核助手"
        title={task?.title ?? '内容审核协作'}
        session={activeAgentSession}
        sessions={relatedAgentSessions}
        transcriptLabel={activeAgentSession ? activeAgentSession.title : task ? '审核任务决策' : '等待生成审核任务'}
        statusLabel={activeAgentSession ? AGENT_SESSION_STATUS_LABELS[activeAgentSession.status] : task ? TASK_STATUS_LABELS[task.status] : '未生成'}
        statusTone={activeAgentSession ? agentSessionTone(activeAgentSession.status) : statusTone(task?.status)}
        steps={agentSteps}
        runningLabel={busy ? '正在处理内容审核任务' : undefined}
        context={reviewAgentContext}
        artifact={reviewAgentArtifact}
        footer={reviewAgentFooter}
        empty={(
          <>
            <strong>等待审核任务</strong>
            <span>生成任务后，在这里逐条查看证据、风险和建议处理，再做人工决策。</span>
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
