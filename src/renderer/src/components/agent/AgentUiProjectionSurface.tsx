import { useState, type ReactNode } from 'react';
import { AgentTimeline, AgentUiProjectionView } from '@limecloud/agent-runtime-ui';
import type { AgentTimelineMessage } from '@limecloud/agent-runtime-ui';
import { projectAgentUiState } from '@limecloud/agent-runtime-projection';
import type { AgentPromptExecutionEvent } from '../../../../shared/types';
import { AgentRuntimeRefLists } from './AgentRuntimeRefLists';
import type { AgentRuntimeEventProjection, AgentRuntimeReadModel } from './agentRuntimeProjection';

type AgentUiProjectionSurfaceMode = 'combined' | 'conversation' | 'runtime';

interface AgentUiProjectionSurfaceProps<TMessage extends AgentTimelineMessage = AgentTimelineMessage> {
  mode?: AgentUiProjectionSurfaceMode;
  className?: string;
  readModel: AgentRuntimeReadModel;
  messages?: readonly TMessage[];
  empty?: ReactNode;
  artifact?: ReactNode;
  showRuntimeWhenEmpty?: boolean;
  messageTitle?: (message: TMessage) => ReactNode;
  messageMeta?: (message: TMessage) => ReactNode;
  messagePreview?: (message: TMessage) => ReactNode;
  onResolveAction?: (event: AgentPromptExecutionEvent) => void;
}

function hasRuntimeFacts(readModel: AgentRuntimeReadModel): boolean {
  return Boolean(
    readModel.events.length ||
    readModel.pendingActions.length ||
    readModel.artifactRefs.length ||
    readModel.evidenceRefs.length ||
    readModel.taskRefs.length,
  );
}

function classNames(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

function payloadText(event: AgentRuntimeEventProjection, ...keys: string[]): string {
  for (const key of keys) {
    const value = event.source.payload?.[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function payloadStringArray(event: AgentRuntimeEventProjection, ...keys: string[]): string[] {
  return uniqueStrings(keys.flatMap((key) => {
    const value = event.source.payload?.[key];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : [];
  }));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function eventClassLabel(eventClass?: string): string {
  if (eventClass === 'tool.started') return '开始';
  if (eventClass === 'tool.args') return '参数';
  if (eventClass === 'tool.args.delta') return '参数更新';
  if (eventClass === 'tool.progress') return '进度';
  if (eventClass === 'tool.output.delta') return '输出更新';
  if (eventClass === 'tool.result') return '完成';
  if (eventClass === 'tool.failed') return '失败';
  if (eventClass === 'task.created' || eventClass === 'task.started') return '子任务';
  if (eventClass === 'task.completed') return '子任务完成';
  if (eventClass === 'task.failed') return '子任务失败';
  if (eventClass === 'subagent.started') return '协作代理';
  if (eventClass === 'subagent.completed') return '代理完成';
  if (eventClass === 'subagent.failed') return '代理失败';
  if (eventClass === 'handoff.requested') return '移交';
  if (eventClass === 'handoff.completed') return '移交完成';
  if (eventClass === 'handoff.failed') return '移交失败';
  if (eventClass === 'review.verdict') return '审核';
  return eventClass ?? '运行';
}

function eventDisplayStatus(event: AgentRuntimeEventProjection): string {
  const projection = event as AgentRuntimeEventProjection & { displayStatusKey?: string };
  return projection.displayStatus ?? projection.displayStatusKey ?? projection.status;
}

function toolFamily(event: AgentRuntimeEventProjection): string {
  const family = payloadText(event, 'toolFamily', 'tool_family');
  if (family) return family;
  if (event.source.kind === 'skill') return 'skill';
  const toolName = payloadText(event, 'toolName', 'tool_name', 'name', 'tool');
  if (toolName.startsWith('mcp__')) return 'mcp';
  if (event.surface === 'tool') return 'tool';
  return '';
}

function toolFamilyLabel(family: string): string {
  if (family === 'webSearch') return '网页搜索';
  if (family === 'webFetch') return '网页读取';
  if (family === 'mcp') return 'MCP';
  if (family === 'skill') return 'Skill';
  if (family === 'tool') return '工具';
  return '';
}

interface ToolCallView {
  id: string;
  toolCallId?: string;
  toolName: string;
  family: string;
  mcpServer: string;
  skillSlug: string;
  latestEvent: AgentRuntimeEventProjection;
  events: AgentRuntimeEventProjection[];
  artifactRefs: string[];
  evidenceRefs: string[];
  detail: string;
  lifecycle: string;
}

function toolCallKey(event: AgentRuntimeEventProjection, index: number): string {
  return event.source.toolCallId
    || payloadText(event, 'toolCallId')
    || payloadText(event, 'tool_call_id')
    || payloadText(event, 'callId')
    || payloadText(event, 'call_id')
    || payloadText(event, 'id')
    || `${payloadText(event, 'toolName', 'tool_name', 'name', 'tool') || event.title}:${event.source.turnId || 'turn'}:${index}`;
}

function toolEventRefs(event: AgentRuntimeEventProjection, kind: 'artifact' | 'evidence'): string[] {
  if (kind === 'artifact') {
    return uniqueStrings([
      ...(event.source.artifactRefs ?? []),
      ...payloadStringArray(event, 'artifactRefs', 'artifact_refs'),
      payloadText(event, 'artifactRef', 'artifact_ref'),
      payloadText(event, 'artifactId', 'artifact_id'),
    ]);
  }
  return uniqueStrings([
    ...(event.source.evidenceRefs ?? []),
    ...payloadStringArray(event, 'evidenceRefs', 'evidence_refs'),
    payloadText(event, 'evidenceRef', 'evidence_ref'),
    payloadText(event, 'evidenceId', 'evidence_id'),
  ]);
}

function toolCallViews(readModel: AgentRuntimeReadModel): ToolCallView[] {
  const byCallId = new Map<string, ToolCallView>();
  readModel.events.forEach((event, index) => {
    if (event.surface !== 'tool') return;
    const key = toolCallKey(event, index);
    const existing = byCallId.get(key);
    const family = toolFamily(event);
    const toolName = payloadText(event, 'toolName', 'tool_name', 'name', 'tool') || event.title;
    const mcpServer = payloadText(event, 'mcpServer', 'mcp_server');
    const skillSlug = payloadText(event, 'skillSlug', 'skill_slug', 'slug');
    const detail = event.detail && event.detail !== event.title ? event.detail : payloadText(event, 'message');
    const artifactRefs = toolEventRefs(event, 'artifact');
    const evidenceRefs = toolEventRefs(event, 'evidence');

    if (!existing) {
      byCallId.set(key, {
        id: key,
        toolCallId: event.source.toolCallId || key,
        toolName,
        family,
        mcpServer,
        skillSlug,
        latestEvent: event,
        events: [event],
        artifactRefs,
        evidenceRefs,
        detail,
        lifecycle: eventClassLabel(event.source.eventClass),
      });
      return;
    }

    existing.latestEvent = event;
    existing.events.push(event);
    existing.toolName = toolName || existing.toolName;
    existing.family = family || existing.family;
    existing.mcpServer = mcpServer || existing.mcpServer;
    existing.skillSlug = skillSlug || existing.skillSlug;
    existing.detail = detail || existing.detail;
    existing.artifactRefs = uniqueStrings([...existing.artifactRefs, ...artifactRefs]);
    existing.evidenceRefs = uniqueStrings([...existing.evidenceRefs, ...evidenceRefs]);
    existing.lifecycle = uniqueStrings([
      ...existing.lifecycle.split(' / ').filter(Boolean),
      eventClassLabel(event.source.eventClass),
    ]).join(' / ');
  });
  return Array.from(byCallId.values()).slice(-12);
}

function isCollaborationEvent(event: AgentRuntimeEventProjection): boolean {
  const eventClass = event.source.eventClass ?? '';
  return (
    eventClass.startsWith('task.') ||
    eventClass.startsWith('subagent.') ||
    eventClass.startsWith('handoff.') ||
    eventClass.startsWith('review.') ||
    event.source.kind === 'task' ||
    event.source.kind === 'subagent' ||
    event.source.kind === 'handoff' ||
    event.source.kind === 'review'
  );
}

function isDiagnosticEvent(event: AgentRuntimeEventProjection): boolean {
  const eventClass = event.source.eventClass ?? '';
  return (
    eventClass.startsWith('permission.') ||
    eventClass.startsWith('sandbox.') ||
    eventClass.startsWith('runtime.') ||
    event.source.kind === 'permission' ||
    event.source.kind === 'sandbox' ||
    event.source.kind === 'diagnostic' ||
    event.status === 'blocked' ||
    event.status === 'failed'
  );
}

function collaborationFactEvents(readModel: AgentRuntimeReadModel): AgentRuntimeEventProjection[] {
  const seen = new Set<string>();
  return readModel.events.filter((event) => {
    if (!isCollaborationEvent(event)) return false;
    const key = [
      event.source.eventClass,
      event.source.taskId,
      payloadText(event, 'subagentId', 'subagent_id'),
      payloadText(event, 'handoffId', 'handoff_id'),
      payloadText(event, 'reviewId', 'review_id'),
      payloadText(event, 'eventId'),
      event.detail,
    ].filter(Boolean).join(':');
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  }).slice(-12);
}

function diagnosticFactEvents(readModel: AgentRuntimeReadModel): AgentRuntimeEventProjection[] {
  const seen = new Set<string>();
  return readModel.events.filter((event) => {
    if (!isDiagnosticEvent(event)) return false;
    if (event.surface === 'tool' || event.surface === 'human-action' || isCollaborationEvent(event)) return false;
    const key = [
      event.source.eventClass,
      event.source.actionId,
      payloadText(event, 'eventId'),
      payloadText(event, 'permissionId', 'permission_id'),
      payloadText(event, 'policyId', 'policy_id'),
      event.detail,
    ].filter(Boolean).join(':');
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  }).slice(-8);
}

function eventMetaParts(event: AgentRuntimeEventProjection, extra?: string[]): string {
  return [
    ...(extra ?? []),
    event.source.toolCallId ? `调用 ${event.source.toolCallId}` : '',
    event.source.taskId ? `任务 ${event.source.taskId}` : '',
    event.displayStatus,
  ].filter(Boolean).join(' · ');
}

function actionFactEvents(readModel: AgentRuntimeReadModel): AgentRuntimeEventProjection[] {
  const byActionId = new Map<string, AgentRuntimeEventProjection>();
  readModel.events.forEach((event) => {
    const eventClass = event.source.eventClass ?? '';
    if (!eventClass.startsWith('action.') && event.surface !== 'human-action') return;
    const key = event.actionId || event.source.actionId || event.id;
    byActionId.set(key, event);
  });
  readModel.pendingActions.forEach((event) => {
    const key = event.actionId || event.source.actionId || event.id;
    if (!byActionId.has(key)) byActionId.set(key, event);
  });
  return Array.from(byActionId.values()).slice(-8);
}

function isResolvedActionProjection(event: AgentRuntimeEventProjection): boolean {
  return Boolean(
    event.resolved ||
    event.source.eventClass === 'action.resolved' ||
    event.source.eventClass === 'action.denied' ||
    event.source.eventClass === 'action.cancelled' ||
    event.source.eventClass === 'action.canceled' ||
    event.source.eventClass === 'action.expired',
  );
}

function actionStateLabel(event: AgentRuntimeEventProjection): string {
  if (event.source.eventClass === 'action.resolved') return '已处理';
  if (event.source.eventClass === 'action.denied') return '已拒绝';
  if (event.source.eventClass === 'action.cancelled' || event.source.eventClass === 'action.canceled') return '已取消';
  if (event.source.eventClass === 'action.expired') return '已过期';
  return eventDisplayStatus(event);
}

function actionKindLabel(event: AgentRuntimeEventProjection): string {
  const actionKind = event.actionKind || payloadText(event, 'actionKind', 'action_kind');
  const targetModule = event.targetModule || payloadText(event, 'targetModule', 'target_module');
  if (actionKind === 'configure-text-model') return '模型设置';
  if (actionKind === 'add-input-source' || targetModule === 'knowledge-inputs') return '补输入源';
  if (actionKind === 'approve' || actionKind === 'permission') return '权限确认';
  if (actionKind === 'plan-review') return '计划审核';
  return actionKind || '人工确认';
}

function statusLabel(status: string): string {
  if (status === 'completed') return '已完成';
  if (status === 'running') return '执行中';
  if (status === 'blocked') return '已阻断';
  if (status === 'failed') return '失败';
  if (status === 'canceled' || status === 'cancelled') return '已取消';
  if (status === 'waiting' || status === 'pending') return '待处理';
  return status || '待处理';
}

type RuntimeRefKind = 'artifact' | 'evidence';

function runtimeRefDetailKey(kind: RuntimeRefKind, id: string): string {
  return `${kind}:${id}`;
}

function cloneRuntimeReadModel(readModel: AgentRuntimeReadModel): AgentRuntimeReadModel {
  return {
    ...readModel,
    events: [...readModel.events],
    visibleEvents: [...readModel.visibleEvents],
    pendingActions: [...readModel.pendingActions],
    artifactRefs: [...readModel.artifactRefs],
    evidenceRefs: [...readModel.evidenceRefs],
    taskRefs: [...readModel.taskRefs],
  };
}

function standardRuntimeState(readModel: AgentRuntimeReadModel) {
  const state = projectAgentUiState<AgentPromptExecutionEvent>({
    executionEvents: readModel.events.map((event) => event.source),
    sourceCount: readModel.sourceCount,
  });
  return {
    ...state,
    messages: [],
    readModel: cloneRuntimeReadModel(readModel),
  };
}

function actionButtonLabel(event: AgentRuntimeEventProjection): string {
  const decision = String(event.action?.decision ?? '');
  const actionKind = event.actionKind || payloadText(event, 'actionKind', 'action_kind');
  const targetModule = event.targetModule || payloadText(event, 'targetModule', 'target_module');
  if (decision === 'open-model-settings' || actionKind === 'configure-text-model') return '打开模型设置';
  if (decision === 'open-input-source' || actionKind === 'add-input-source' || targetModule === 'knowledge-inputs') return '补输入源';
  if (decision === 'approve') return '批准';
  if (decision === 'reject') return '拒绝';
  if (decision === 'retry') return '重试';
  if (decision === 'stop') return '停止';
  if (decision === 'answer') return '回复';
  return '处理';
}

function RuntimeFactGroup({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  if (!count) return null;
  return (
    <section className="agent-runtime-fact-group" aria-label={title}>
      <header>
        <strong>{title}</strong>
        <span>{count}</span>
      </header>
      {children}
    </section>
  );
}

function ToolFactStrip({ readModel }: { readModel: AgentRuntimeReadModel }) {
  const tools = toolCallViews(readModel);
  if (!tools.length) return null;

  return (
    <RuntimeFactGroup title="工具 / MCP / Skill" count={tools.length}>
      <div className="agent-tool-facts">
        {tools.map((tool) => {
          const latest = tool.latestEvent;
          const failureCategory = payloadText(latest, 'failureCategory', 'failure_category');
          return (
            <article
              key={tool.id}
              className={`agent-tool-fact ${latest.status}`}
              data-event-class={latest.source.eventClass}
              data-tool-family={tool.family || undefined}
              data-tool-name={tool.toolName || undefined}
              data-tool-call-id={tool.toolCallId || undefined}
              data-mcp-server={tool.mcpServer || undefined}
              data-skill-slug={tool.skillSlug || undefined}
              data-failure-category={failureCategory || undefined}
              data-artifact-count={tool.artifactRefs.length || undefined}
              data-evidence-count={tool.evidenceRefs.length || undefined}
            >
              <span>{toolFamilyLabel(tool.family) || '工具'}</span>
              <em>{eventClassLabel(latest.source.eventClass)}</em>
              <strong>{tool.toolName || latest.title}</strong>
              <small>
                {eventMetaParts(latest, [
                  tool.mcpServer || tool.skillSlug,
                  failureCategory ? `失败 ${failureCategory}` : '',
                  tool.lifecycle,
                  tool.artifactRefs.length ? `交付 ${tool.artifactRefs.length}` : '',
                  tool.evidenceRefs.length ? `依据 ${tool.evidenceRefs.length}` : '',
                ])}
              </small>
              {tool.detail ? <p>{tool.detail}</p> : null}
            </article>
          );
        })}
      </div>
    </RuntimeFactGroup>
  );
}

function ActionFactStrip({
  readModel,
  onResolveAction,
}: {
  readModel: AgentRuntimeReadModel;
  onResolveAction?: (event: AgentPromptExecutionEvent) => void;
}) {
  const actions = actionFactEvents(readModel);
  if (!actions.length) return null;

  return (
    <RuntimeFactGroup title="人工确认" count={actions.length}>
      <div className="agent-action-facts">
        {actions.map((event) => {
          const resolved = isResolvedActionProjection(event);
          return (
            <article
              key={event.id}
              className={`agent-action-fact ${event.status}`}
              data-event-class={event.source.eventClass}
              data-action-id={event.actionId || undefined}
              data-action-kind={event.actionKind || payloadText(event, 'actionKind', 'action_kind') || undefined}
              data-action-resolved={resolved ? 'true' : undefined}
            >
              <span>{actionKindLabel(event)}</span>
              <strong>{event.title}</strong>
              {event.detail ? <small>{event.detail}</small> : null}
              <em>{actionStateLabel(event)}</em>
              {!resolved && onResolveAction ? (
                <button type="button" className="agent-event-action" onClick={() => onResolveAction(event.source)}>
                  {actionButtonLabel(event)}
                </button>
              ) : null}
            </article>
          );
        })}
      </div>
    </RuntimeFactGroup>
  );
}

function CollaborationFactStrip({ readModel }: { readModel: AgentRuntimeReadModel }) {
  const events = collaborationFactEvents(readModel);
  if (!events.length) return null;

  return (
    <RuntimeFactGroup title="协作任务" count={events.length}>
      <div className="agent-collaboration-facts">
        {events.map((event) => (
          <article
            key={event.id}
            className={`agent-collaboration-fact ${event.status}`}
            data-event-class={event.source.eventClass}
            data-task-id={event.source.taskId}
            data-subagent-id={payloadText(event, 'subagentId', 'subagent_id') || undefined}
            data-handoff-id={payloadText(event, 'handoffId', 'handoff_id') || undefined}
            data-review-id={payloadText(event, 'reviewId', 'review_id') || undefined}
          >
            <span>{eventClassLabel(event.source.eventClass)}</span>
            <strong>{event.title}</strong>
            {event.detail ? <small>{event.detail}</small> : null}
            <em>{eventMetaParts(event)}</em>
          </article>
        ))}
      </div>
    </RuntimeFactGroup>
  );
}

function DiagnosticFactStrip({ readModel }: { readModel: AgentRuntimeReadModel }) {
  const events = diagnosticFactEvents(readModel);
  if (!events.length) return null;

  return (
    <RuntimeFactGroup title="权限 / 沙箱 / 诊断" count={events.length}>
      <div className="agent-diagnostic-facts">
        {events.map((event) => (
          <article
            key={event.id}
            className={`agent-diagnostic-fact ${event.status}`}
            data-event-class={event.source.eventClass}
            data-event-status={event.status}
            data-event-kind={event.source.kind}
          >
            <span>{eventClassLabel(event.source.eventClass)}</span>
            <strong>{event.title}</strong>
            {event.detail ? <small>{event.detail}</small> : null}
            <em>{eventMetaParts(event)}</em>
          </article>
        ))}
      </div>
    </RuntimeFactGroup>
  );
}

function ConversationSurface<TMessage extends AgentTimelineMessage>({
  messages,
  empty,
  messageTitle,
  messageMeta,
  messagePreview,
}: Pick<
  AgentUiProjectionSurfaceProps<TMessage>,
  'messages' | 'empty' | 'messageTitle' | 'messageMeta' | 'messagePreview'
>) {
  return (
    <div className="agent-ui-main" data-agent-ui-surface="conversation">
      <AgentTimeline
        messages={messages}
        empty={empty}
        messageTitle={messageTitle}
        messageMeta={messageMeta}
        messagePreview={messagePreview}
      />
    </div>
  );
}

function RuntimeSurface({
  readModel,
  artifact,
  onResolveAction,
}: Pick<AgentUiProjectionSurfaceProps, 'readModel' | 'artifact' | 'onResolveAction'>) {
  const standardState = standardRuntimeState(readModel);
  const [selectedRefKey, setSelectedRefKey] = useState<string | undefined>(() => {
    const firstArtifactRef = readModel.artifactRefs[0];
    if (firstArtifactRef) return runtimeRefDetailKey('artifact', firstArtifactRef);
    const firstEvidenceRef = readModel.evidenceRefs[0];
    if (firstEvidenceRef) return runtimeRefDetailKey('evidence', firstEvidenceRef);
    return undefined;
  });
  const handleSelectRuntimeRef = (kind: RuntimeRefKind, id: string) => {
    setSelectedRefKey(runtimeRefDetailKey(kind, id));
  };

  return (
    <div className="agent-ui-sidecar" data-agent-ui-surface="runtime">
      <AgentUiProjectionView
        state={standardState}
        emptyMessages={null}
        labels={{
          messagePartsAriaLabel: '消息部件',
          processTimelineAriaLabel: '执行过程',
          runtimeSummaryAriaLabel: '运行事实摘要',
          actionRequiredAriaLabel: '人工确认',
          toolGroupAriaLabel: '工具调用',
          executionEventsAriaLabel: '运行事件',
          artifactRefsAriaLabel: '交付物线索',
          evidenceRefsAriaLabel: '依据线索',
          subagentsAriaLabel: '协作代理',
          subagentThreadsAriaLabel: '协作代理线程',
          subagentDelegationsAriaLabel: '代理移交',
          subagentActivitiesAriaLabel: '代理活动',
          executionGraphAriaLabel: '执行图',
          summaryLabels: {
            sources: '来源',
            actions: '待处理',
            artifacts: '交付物',
            evidence: '依据',
          },
          eventStatusLabel: (event) => statusLabel(event.status),
          messagePartTitle: (part) => {
            if (part.type === 'tool-preview') return '工具结果';
            if (part.type === 'artifact-card') return '交付物';
            if (part.type === 'evidence-citation') return '依据';
            if (part.type === 'diagnostic-ref') return '诊断';
            if (part.type === 'reasoning') return '推理';
            return '消息';
          },
          messagePartMeta: (part) => [part.state, part.createdAt ? new Date(part.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '']
            .filter(Boolean)
            .join(' · '),
          messagePartPreview: (part) => part.text,
          timelineEntryMeta: (entry) => [entry.kind, statusLabel(entry.status)].filter(Boolean).join(' · '),
          graphNodeMeta: (node) => [node.nodeType, statusLabel(node.status)].filter(Boolean).join(' · '),
          subagentThreadMeta: (thread) => [statusLabel(thread.status), thread.taskPath ?? thread.threadId].filter(Boolean).join(' · '),
          subagentDelegationTitle: (delegation) => `${delegation.action} · ${delegation.title}`,
          subagentActivityMeta: (activity) => `${activity.kind} · ${statusLabel(activity.status)}`,
          actionButtonLabel: (action) => {
            if (action.decision === 'open-model-settings') return '打开模型设置';
            if (action.decision === 'open-input-source') return '补输入源';
            if (action.decision === 'approve') return '批准';
            if (action.decision === 'reject') return '拒绝';
            if (action.decision === 'retry') return '重试';
            if (action.decision === 'stop') return '停止';
            if (action.decision === 'answer') return '回复';
            return '处理';
          },
          artifactRefActionLabel: () => '打开交付物',
          evidenceRefActionLabel: () => '打开依据',
        }}
        onResolveAction={onResolveAction ? (event) => onResolveAction(event) : undefined}
        onSelectArtifactRef={(ref) => handleSelectRuntimeRef('artifact', ref.id)}
        onSelectEvidenceRef={(ref) => handleSelectRuntimeRef('evidence', ref.id)}
      />
      <ToolFactStrip readModel={readModel} />
      <ActionFactStrip readModel={readModel} onResolveAction={onResolveAction} />
      <CollaborationFactStrip readModel={readModel} />
      <DiagnosticFactStrip readModel={readModel} />
      {artifact ? <div className="agent-session-artifact">{artifact}</div> : null}
      <AgentRuntimeRefLists
        readModel={readModel}
        selectedKey={selectedRefKey}
        onSelectRef={handleSelectRuntimeRef}
      />
    </div>
  );
}

export function AgentUiProjectionSurface<TMessage extends AgentTimelineMessage = AgentTimelineMessage>({
  mode = 'combined',
  className,
  readModel,
  messages,
  empty,
  artifact,
  showRuntimeWhenEmpty = true,
  messageTitle,
  messageMeta,
  messagePreview,
  onResolveAction,
}: AgentUiProjectionSurfaceProps<TMessage>) {
  const shouldRenderRuntime = showRuntimeWhenEmpty || hasRuntimeFacts(readModel);
  const rootClassName = classNames(
    'agent-ui-projection',
    mode === 'combined' && 'agent-ui-combined',
    mode === 'conversation' && 'agent-ui-conversation-only',
    mode === 'runtime' && 'agent-ui-runtime-only',
    className,
  );

  if (mode === 'conversation') {
    return (
      <section className={rootClassName} aria-label="AgentUI 对话投影">
        <ConversationSurface
          messages={messages}
          empty={empty}
          messageTitle={messageTitle}
          messageMeta={messageMeta}
          messagePreview={messagePreview}
        />
      </section>
    );
  }

  if (mode === 'runtime') {
    if (!shouldRenderRuntime) return null;
    return (
      <section className={rootClassName} aria-label="运行事实">
        <RuntimeSurface readModel={readModel} artifact={artifact} onResolveAction={onResolveAction} />
      </section>
    );
  }

  return (
    <section className={rootClassName} aria-label="AgentUI 投影">
      <ConversationSurface
        messages={messages}
        empty={empty}
        messageTitle={messageTitle}
        messageMeta={messageMeta}
        messagePreview={messagePreview}
      />
      {shouldRenderRuntime ? (
        <RuntimeSurface readModel={readModel} artifact={artifact} onResolveAction={onResolveAction} />
      ) : null}
    </section>
  );
}
