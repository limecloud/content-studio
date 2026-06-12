import type { ReactNode } from 'react';
import { AgentTimeline, RuntimeFactsPanel } from '@limecloud/agent-runtime-ui';
import type { AgentTimelineMessage } from '@limecloud/agent-runtime-ui';
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
  runningLabel?: ReactNode;
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
    readModel.sourceCount ||
    readModel.pendingActions.length ||
    readModel.artifactRefs.length ||
    readModel.evidenceRefs.length ||
    readModel.taskRefs.length,
  );
}

function classNames(...values: Array<string | undefined | false>): string {
  return values.filter(Boolean).join(' ');
}

function payloadText(event: AgentRuntimeEventProjection, key: string): string {
  const value = event.source.payload?.[key];
  return typeof value === 'string' ? value : '';
}

function toolFamily(event: AgentRuntimeEventProjection): string {
  const family = payloadText(event, 'toolFamily');
  if (family) return family;
  if (event.source.kind === 'skill') return 'skill';
  if (event.surface === 'tool') return 'tool';
  return '';
}

function toolFamilyLabel(family: string): string {
  if (family === 'webSearch') return 'Web Search';
  if (family === 'webFetch') return 'Web Fetch';
  if (family === 'mcp') return 'MCP';
  if (family === 'skill') return 'Skill';
  if (family === 'tool') return 'Tool';
  return '';
}

function toolFactEvents(readModel: AgentRuntimeReadModel): AgentRuntimeEventProjection[] {
  const seen = new Set<string>();
  return readModel.events.filter((event) => {
    if (event.surface !== 'tool') return false;
    const key = [
      event.source.eventClass,
      event.source.toolCallId,
      payloadText(event, 'toolName'),
      payloadText(event, 'eventId'),
      event.detail,
    ].filter(Boolean).join(':');
    if (key && seen.has(key)) return false;
    if (key) seen.add(key);
    return true;
  }).slice(-8);
}

function ToolFactStrip({ readModel }: { readModel: AgentRuntimeReadModel }) {
  const toolEvents = toolFactEvents(readModel);
  if (!toolEvents.length) return null;

  return (
    <div className="agent-tool-facts" aria-label="工具调用">
      {toolEvents.map((event) => {
        const family = toolFamily(event);
        const toolName = payloadText(event, 'toolName');
        const mcpServer = payloadText(event, 'mcpServer');
        const skillSlug = payloadText(event, 'skillSlug');
        return (
          <article
            key={event.id}
            className={`agent-tool-fact ${event.status}`}
            data-event-class={event.source.eventClass}
            data-tool-family={family || undefined}
            data-tool-name={toolName || undefined}
            data-mcp-server={mcpServer || undefined}
            data-skill-slug={skillSlug || undefined}
          >
            <span>{toolFamilyLabel(family) || 'Tool'}</span>
            <strong>{toolName || event.title}</strong>
            {mcpServer || skillSlug ? <small>{mcpServer || skillSlug}</small> : null}
            <em>{event.displayStatus}</em>
          </article>
        );
      })}
    </div>
  );
}

function InlineRuntimeFacts({ readModel }: { readModel: AgentRuntimeReadModel }) {
  const toolEvents = toolFactEvents(readModel);
  if (!toolEvents.length) return null;

  return (
    <div className="agent-inline-runtime-facts" aria-label="工具运行过程">
      {toolEvents.map((event) => {
        const family = toolFamily(event);
        const familyLabel = toolFamilyLabel(family) || 'Tool';
        const toolName = payloadText(event, 'toolName');
        const mcpServer = payloadText(event, 'mcpServer');
        const skillSlug = payloadText(event, 'skillSlug');
        const meta = [mcpServer || skillSlug, event.displayStatus].filter(Boolean).join(' · ');
        const detail = event.detail && event.detail !== event.title ? event.detail : '';

        return (
          <details
            key={event.id}
            className={`agent-inline-tool-fact ${event.status}`}
            data-event-class={event.source.eventClass}
            data-tool-family={family || undefined}
            data-tool-name={toolName || undefined}
            data-mcp-server={mcpServer || undefined}
            data-skill-slug={skillSlug || undefined}
          >
            <summary>
              <span aria-hidden="true" />
              <strong>{toolName || event.title}</strong>
              <small>{meta ? `${familyLabel} · ${meta}` : familyLabel}</small>
            </summary>
            {detail ? <p>{detail}</p> : null}
          </details>
        );
      })}
    </div>
  );
}

function ConversationSurface<TMessage extends AgentTimelineMessage>({
  readModel,
  messages,
  empty,
  runningLabel,
  messageTitle,
  messageMeta,
  messagePreview,
}: Pick<
  AgentUiProjectionSurfaceProps<TMessage>,
  'readModel' | 'messages' | 'empty' | 'runningLabel' | 'messageTitle' | 'messageMeta' | 'messagePreview'
>) {
  return (
    <div className="agent-ui-main" data-agent-ui-surface="conversation">
      <AgentTimeline
        messages={messages}
        empty={empty}
        runningLabel={runningLabel}
        messageTitle={messageTitle}
        messageMeta={messageMeta}
        messagePreview={messagePreview}
      />
      <InlineRuntimeFacts readModel={readModel} />
    </div>
  );
}

function RuntimeSurface({
  readModel,
  artifact,
  onResolveAction,
}: Pick<AgentUiProjectionSurfaceProps, 'readModel' | 'artifact' | 'onResolveAction'>) {
  return (
    <div className="agent-ui-sidecar" data-agent-ui-surface="runtime">
      <ToolFactStrip readModel={readModel} />
      <RuntimeFactsPanel
        readModel={readModel}
        artifact={artifact}
        onResolveAction={onResolveAction ? (event) => onResolveAction(event) : undefined}
      />
      <AgentRuntimeRefLists readModel={readModel} />
    </div>
  );
}

export function AgentUiProjectionSurface<TMessage extends AgentTimelineMessage = AgentTimelineMessage>({
  mode = 'combined',
  className,
  readModel,
  messages,
  empty,
  runningLabel,
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
          readModel={readModel}
          messages={messages}
          empty={empty}
          runningLabel={runningLabel}
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
        readModel={readModel}
        messages={messages}
        empty={empty}
        runningLabel={runningLabel}
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
