import type { ReactNode } from 'react';
import type { AgentPromptExecutionEvent, AgentPromptSession } from '../../../../shared/types';
import type { StatusPillTone } from '../WorkbenchPrimitives';
import { StatusPill } from '../WorkbenchPrimitives';
import {
  projectAgentRuntimeReadModel,
  type AgentRuntimeReadModel,
  type AgentRuntimeEventProjection,
} from './agentRuntimeProjection';

export type AgentExecutionStepState = 'done' | 'active' | 'idle' | 'blocked';

export interface AgentExecutionStep {
  key: string;
  title: string;
  detail?: string;
  state: AgentExecutionStepState;
}

export type AgentActionResolver = (event: AgentPromptExecutionEvent) => void;

interface AgentSessionPanelProps {
  eyebrow?: string;
  title: ReactNode;
  session?: AgentPromptSession;
  sessions?: AgentPromptSession[];
  statusLabel?: ReactNode;
  statusTone?: StatusPillTone;
  steps?: AgentExecutionStep[];
  runningLabel?: ReactNode;
  transcriptLabel?: ReactNode;
  context?: ReactNode;
  artifact?: ReactNode;
  footer?: ReactNode;
  empty?: ReactNode;
  onSelectSession?: (sessionId: string) => void;
  onResolveAction?: AgentActionResolver;
  messageTitle?: (message: AgentPromptSession['messages'][number]) => ReactNode;
  messageMeta?: (message: AgentPromptSession['messages'][number]) => ReactNode;
  messagePreview?: (message: AgentPromptSession['messages'][number]) => ReactNode;
}

function defaultMessageTitle(message: AgentPromptSession['messages'][number]): ReactNode {
  if (message.role === 'user') return '用户';
  if (message.role === 'assistant') return '助手';
  return '系统';
}

function defaultMessageMeta(message: AgentPromptSession['messages'][number]): ReactNode {
  return new Date(message.createdAt).toLocaleString();
}

function defaultMessagePreview(message: AgentPromptSession['messages'][number]): ReactNode {
  return message.content.trim();
}

function normalizeAgentDisplayText(value: string): string {
  return value
    .replace(/AI Agent/g, '助手')
    .replace(/Agent 会话/g, '对话')
    .replace(/\s+Agent$/g, '协作')
    .replace(/Agent$/g, '协作')
    .replace(/\s*Agent\s*/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function displayNode(value: ReactNode): ReactNode {
  return typeof value === 'string' ? normalizeAgentDisplayText(value) : value;
}

export function AgentExecutionTimeline({ steps }: { steps: AgentExecutionStep[] }) {
  if (!steps.length) return null;
  return (
    <div className="agent-execution-timeline" aria-label="执行过程">
      {steps.map((step) => (
        <span key={step.key} className={step.state} title={step.detail}>
          {step.title}
        </span>
      ))}
    </div>
  );
}

export function AgentExecutionEvents({
  events,
  onResolveAction,
}: {
  events: AgentRuntimeEventProjection[];
  onResolveAction?: AgentActionResolver;
}) {
  if (!events.length) return null;
  return (
    <div className="agent-execution-events" aria-label="执行事件">
      {events.map((event) => (
        <article
          key={event.id}
          className={event.status}
          data-event-class={event.source.eventClass}
          data-owner={event.source.owner}
          data-phase={event.source.phase}
          data-surface={event.surface}
          data-action-kind={event.actionKind || undefined}
        >
          <span />
          <div>
            <strong>{event.title}</strong>
            {event.detail ? <small>{event.detail}</small> : null}
          </div>
          {event.action && onResolveAction ? (
            <button type="button" className="agent-event-action" onClick={() => onResolveAction(event.source)}>
              {event.action.buttonLabel}
            </button>
          ) : (
            <em>{event.displayStatus}</em>
          )}
        </article>
      ))}
    </div>
  );
}

export function AgentRuntimeSummary({ readModel }: { readModel: AgentRuntimeReadModel }) {
  const items = [
    { key: 'sources', label: '输入源', value: readModel.sourceCount },
    { key: 'actions', label: '待处理', value: readModel.pendingActions.length },
    { key: 'artifacts', label: '产物', value: readModel.artifactRefs.length },
    { key: 'evidence', label: '证据', value: readModel.evidenceRefs.length },
  ];
  if (!readModel.events.length) return null;
  return (
    <div className="agent-runtime-summary" aria-label="协作事实摘要">
      {items.map((item) => (
        <span key={item.key} data-summary-kind={item.key} className={item.value > 0 ? 'ready' : 'idle'}>
          <strong>{item.value}</strong>
          <em>{item.label}</em>
        </span>
      ))}
    </div>
  );
}

export function AgentSessionPanel({
  eyebrow = '助手',
  title,
  session,
  sessions = [],
  statusLabel,
  statusTone = 'idle',
  steps = [],
  runningLabel,
  transcriptLabel,
  context,
  artifact,
  footer,
  empty,
  onSelectSession,
  onResolveAction,
  messageTitle = defaultMessageTitle,
  messageMeta = defaultMessageMeta,
  messagePreview = defaultMessagePreview,
}: AgentSessionPanelProps) {
  const runtimeReadModel = projectAgentRuntimeReadModel(session);
  const resolvedTranscriptLabel =
    transcriptLabel === undefined
      ? session ? session.title : '对话'
      : transcriptLabel;
  const displayTitle = displayNode(title);
  const displayTranscriptLabel = displayNode(resolvedTranscriptLabel);
  return (
    <section className="agent-session-panel">
      <div className="agent-session-head">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{displayTitle}</h3>
        </div>
        {statusLabel ? <StatusPill tone={statusTone}>{statusLabel}</StatusPill> : null}
      </div>

      <div className="agent-session-transcript" aria-label="对话转录">
        {displayTranscriptLabel ? (
          <div className="agent-session-divider">
            {displayTranscriptLabel}
          </div>
        ) : null}

        {context ? <div className="agent-session-context">{context}</div> : null}

        <AgentRuntimeSummary readModel={runtimeReadModel} />
        <AgentExecutionTimeline steps={steps} />
        <AgentExecutionEvents events={runtimeReadModel.visibleEvents} onResolveAction={onResolveAction} />

        {sessions.length > 1 && onSelectSession ? (
          <div className="agent-session-switcher" aria-label="对话列表">
            {sessions.slice(0, 6).map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === session?.id ? 'active' : ''}
                onClick={() => onSelectSession(item.id)}
              >
                <strong>{normalizeAgentDisplayText(item.title)}</strong>
                <small>{item.messages.length} 条消息</small>
              </button>
            ))}
          </div>
        ) : null}

        {session ? session.messages.map((message) => {
          const preview = messagePreview(message);
          const rawContent = message.content.trim();
          const canExpand = typeof preview === 'string' && preview !== rawContent;
          return (
            <article key={message.id} className={`agent-turn ${message.role}`}>
              <div className="agent-turn-head">
                <strong>{messageTitle(message)}</strong>
                <small>{messageMeta(message)}</small>
              </div>
              <p>{preview}</p>
              {message.model ? <small className="agent-turn-model">{message.model}</small> : null}
              {canExpand ? (
                <details className="agent-turn-details">
                  <summary>{message.role === 'user' ? '查看上下文' : '查看完整输出'}</summary>
                  <pre>{rawContent}</pre>
                </details>
              ) : null}
            </article>
          );
        }) : empty === null ? null : (
          <div className="agent-empty-session">
            {empty === undefined ? (
              <>
                <strong>还没有消息</strong>
                <span>发送后开始记录本次对话。</span>
              </>
            ) : empty}
          </div>
        )}

        {runningLabel ? (
          <div className="agent-runtime-event">
            <strong>执行中</strong>
            <span>{runningLabel}</span>
          </div>
        ) : null}

        {artifact ? <div className="agent-session-artifact">{artifact}</div> : null}
      </div>

      {footer ? <div className="agent-session-footer">{footer}</div> : null}
    </section>
  );
}
