import type { ReactNode } from 'react';
import type { AgentPromptExecutionEvent, AgentPromptSession } from '../../../../shared/types';
import type { StatusPillTone } from '../WorkbenchPrimitives';
import { StatusPill } from '../WorkbenchPrimitives';
import { AgentUiProjectionSurface } from './AgentUiProjectionSurface';
import { projectAgentRuntimeReadModel } from './agentRuntimeProjection';

export type AgentExecutionStepState = 'done' | 'active' | 'idle' | 'blocked';

export interface AgentExecutionStep {
  key: string;
  title: string;
  detail?: string;
  state: AgentExecutionStepState;
}

export type AgentActionResolver = (event: AgentPromptExecutionEvent) => void;

interface AgentSessionPanelProps {
  variant?: 'default' | 'claw';
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

function AgentBusinessObjectBar({
  label,
  session,
  statusLabel,
}: {
  label?: ReactNode;
  session?: AgentPromptSession;
  statusLabel?: ReactNode;
}) {
  if (!label && !session) return null;
  const sourceCount = session?.sourceSnapshots.length ?? session?.inputSourceIds.length ?? 0;
  const draftCount = session?.promptDraftIds.length ?? 0;
  return (
    <div className="agent-business-object-bar" aria-label="当前业务对象">
      <div>
        <span>{label ?? session?.title}</span>
        <strong>{session?.title ?? label}</strong>
      </div>
      <dl>
        <div>
          <dt>输入</dt>
          <dd>{sourceCount}</dd>
        </div>
        <div>
          <dt>草稿</dt>
          <dd>{draftCount}</dd>
        </div>
        {statusLabel ? (
          <div>
            <dt>状态</dt>
            <dd>{statusLabel}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function AgentSessionPanel({
  variant = 'default',
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
  if (variant !== 'claw') {
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
          <AgentBusinessObjectBar label={displayTranscriptLabel} session={session} statusLabel={statusLabel} />

          {context ? <div className="agent-session-context">{context}</div> : null}

          <div className="agent-session-workbench">
            <div className="agent-session-flow" aria-label="Claw 会话流">
              <AgentExecutionTimeline steps={steps} />

              <AgentUiProjectionSurface
                mode="conversation"
                readModel={runtimeReadModel}
                messages={session?.messages}
                empty={empty}
                messageTitle={messageTitle}
                messageMeta={messageMeta}
                messagePreview={messagePreview}
              />
            </div>

            <aside className="agent-session-sidecar" aria-label="运行事实">
              <AgentUiProjectionSurface
                mode="runtime"
                readModel={runtimeReadModel}
                onResolveAction={onResolveAction ? (event) => onResolveAction(event) : undefined}
              />

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
            </aside>
          </div>

          {artifact ? <div className="agent-session-artifact">{artifact}</div> : null}
        </div>

        {footer ? <div className="agent-session-footer">{footer}</div> : null}
      </section>
    );
  }

  return (
    <section className="agent-session-panel agent-session-claw-shell">
      <div className="agent-session-head agent-claw-navbar">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h3>{displayTitle}</h3>
        </div>
        {statusLabel ? <StatusPill tone={statusTone}>{statusLabel}</StatusPill> : null}
      </div>

      <div className="agent-session-workbench agent-claw-workspace">
        <aside className="agent-claw-context" aria-label="当前任务上下文">
          <AgentBusinessObjectBar label={displayTranscriptLabel} session={session} statusLabel={statusLabel} />
          {context ? <div className="agent-session-context">{context}</div> : null}
          <AgentExecutionTimeline steps={steps} />
        </aside>

        <main className="agent-claw-chat" aria-label="对话工作区">
          <div className="agent-session-flow agent-claw-message-viewport" aria-label="Claw 会话流">
            {!steps.length ? null : (
              <div className="agent-claw-inline-progress">
                <span>执行进度</span>
                <AgentExecutionTimeline steps={steps} />
              </div>
            )}

            <AgentUiProjectionSurface
              mode="conversation"
              readModel={runtimeReadModel}
              messages={session?.messages}
              empty={empty}
              messageTitle={messageTitle}
              messageMeta={messageMeta}
              messagePreview={messagePreview}
            />
          </div>
          {footer ? <div className="agent-session-footer agent-claw-input-slot">{footer}</div> : null}
        </main>

        <aside className="agent-session-sidecar agent-claw-sidecar" aria-label="运行事实">
          <AgentUiProjectionSurface
            mode="runtime"
            readModel={runtimeReadModel}
            artifact={artifact}
            onResolveAction={onResolveAction ? (event) => onResolveAction(event) : undefined}
          />

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
        </aside>
      </div>
    </section>
  );
}
