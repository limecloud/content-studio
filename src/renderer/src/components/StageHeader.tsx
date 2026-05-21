interface StageHeaderProps {
  busy: boolean;
  currentActionLabel: string | null;
  workspaceReady: boolean;
  onGeneratePromptPack: () => void;
  onCancelAction: () => void;
}

export function StageHeader({ busy, currentActionLabel, workspaceReady, onGeneratePromptPack, onCancelAction }: StageHeaderProps) {
  return (
    <header className="stage-header">
      <div>
        <p className="eyebrow">内容工厂</p>
      </div>
      <div className="header-actions">
        {busy ? <span className="action-status">{currentActionLabel ?? '正在处理当前任务'}</span> : null}
        {busy ? <button className="ghost small" onClick={onCancelAction}>取消当前任务</button> : null}
        <button className="primary" disabled={busy || !workspaceReady} onClick={onGeneratePromptPack}>
          生成提示词包
        </button>
      </div>
    </header>
  );
}
