import type { PlatformDraftRecord } from '../../../shared/types';

interface PlatformDraftTraceListProps {
  drafts: PlatformDraftRecord[];
  busy: boolean;
  workspaceReady: boolean;
  copiedDraftId?: string | null;
  onRevealPath: (path: string) => void;
  onCopyPlatformDraft?: (draftId: string) => void;
  onOpenWorkflowRun?: (workflowRunId: string) => void;
  onOpenPromptDraft?: (promptDraftId: string) => void;
  onOpenSourceLog?: (sourceLogId: string) => void;
}

export function PlatformDraftTraceList({
  drafts,
  busy,
  workspaceReady,
  copiedDraftId,
  onRevealPath,
  onCopyPlatformDraft,
  onOpenWorkflowRun,
  onOpenPromptDraft,
  onOpenSourceLog,
}: PlatformDraftTraceListProps) {
  if (!drafts.length) return null;

  return (
    <div className="platform-draft-trace-list">
      {drafts.map((draft) => (
        <article key={draft.id} className="platform-draft-trace-card">
          <div>
            <strong>{draft.title}</strong>
            <p>{draft.platform}{draft.topic ? ` / ${draft.topic}` : ''}</p>
            <small>{new Date(draft.createdAt).toLocaleString()} · {draft.publishCheck.length} 条发布检查 · 本地交付，不自动发布</small>
          </div>
          <div className="platform-draft-trace-actions">
            <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onRevealPath(draft.packageDir)}>打开草稿包</button>
            <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onCopyPlatformDraft ? onCopyPlatformDraft(draft.id) : onRevealPath(draft.platformCopyPath)}>
              {copiedDraftId === draft.id ? '已复制' : onCopyPlatformDraft ? '复制发布文案' : '打开发布文案'}
            </button>
            {draft.promptDraftId && onOpenPromptDraft ? (
              <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onOpenPromptDraft(draft.promptDraftId as string)}>提示词</button>
            ) : null}
            {draft.workflowRunId && onOpenWorkflowRun ? (
              <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onOpenWorkflowRun(draft.workflowRunId as string)}>回到 SOP</button>
            ) : null}
            {draft.sourceLogId && onOpenSourceLog ? (
              <button className="ghost small" disabled={busy || !workspaceReady} onClick={() => onOpenSourceLog(draft.sourceLogId as string)}>来源记录</button>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
