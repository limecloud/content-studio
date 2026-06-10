import type { ReactNode } from 'react';
import { AgentTimeline, RuntimeFactsPanel } from '@limecloud/agent-runtime-ui';
import type { AgentTimelineMessage } from '@limecloud/agent-runtime-ui';
import type { AgentPromptExecutionEvent } from '../../../../shared/types';
import { AgentRuntimeRefLists } from './AgentRuntimeRefLists';
import type { AgentRuntimeReadModel } from './agentRuntimeProjection';

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

function ConversationSurface<TMessage extends AgentTimelineMessage>({
  messages,
  empty,
  runningLabel,
  messageTitle,
  messageMeta,
  messagePreview,
}: Pick<
  AgentUiProjectionSurfaceProps<TMessage>,
  'messages' | 'empty' | 'runningLabel' | 'messageTitle' | 'messageMeta' | 'messagePreview'
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
