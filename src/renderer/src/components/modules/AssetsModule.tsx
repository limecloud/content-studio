import type { Dispatch, SetStateAction } from 'react';
import type { GenerationLogEntry } from '../../../../shared/types';
import { HISTORY_FILTERS } from '../../app/constants';
import { extractLocalRefsFromLog, extractSkillSlugsFromLog, formatDuration, kindLabel, statusLabel } from '../../app/formatters';

interface AssetsModuleProps {
  logsCount: number;
  filteredLogs: GenerationLogEntry[];
  historyFilter: GenerationLogEntry['kind'] | 'all';
  setHistoryFilter: Dispatch<SetStateAction<GenerationLogEntry['kind'] | 'all'>>;
  copiedLogId: string | null;
  onCopyLogPrompt: (log: GenerationLogEntry) => void;
  onRevealLogPath: (log: GenerationLogEntry) => void;
  onRetryLog: (log: GenerationLogEntry) => void;
}

export function AssetsModule({
  logsCount,
  filteredLogs,
  historyFilter,
  setHistoryFilter,
  copiedLogId,
  onCopyLogPrompt,
  onRevealLogPath,
  onRetryLog,
}: AssetsModuleProps) {
  return (
    <section className="panel full-panel">
      <div className="panel-title"><div><p className="eyebrow">Assets</p><h3>生成历史 / 素材库</h3></div><span className="status-pill">{logsCount} 条记录</span></div>
      <div className="chip-row">
        {HISTORY_FILTERS.map((filter) => (
          <button key={filter.value} className={`chip-button ${historyFilter === filter.value ? 'active' : ''}`} onClick={() => setHistoryFilter(filter.value)}>
            {filter.label}
          </button>
        ))}
      </div>
      <div className="log-list">
        {filteredLogs.map((log) => {
          const localRefs = extractLocalRefsFromLog(log);
          const skillSlugs = extractSkillSlugsFromLog(log);
          return (
            <article key={log.id} className={`log-card ${log.status}`}>
              <span>{kindLabel(log.kind)}</span>
              <strong>{log.title}</strong>
              <p>{log.summary ?? log.error ?? '无摘要'}</p>
              <small>{statusLabel(log.status)} · {formatDuration(log.durationMs)} · {log.model ?? 'local'} · 引用 {log.citations?.length ?? 0} · Skills {skillSlugs.length} · 素材 {localRefs.length} · {new Date(log.createdAt).toLocaleString()}</small>
              {skillSlugs.length ? (
                <div className="skill-chip-row">
                  {skillSlugs.map((slug) => <span key={slug}>{slug}</span>)}
                </div>
              ) : null}
              <div className="log-actions">
                <button className="ghost small" onClick={() => onCopyLogPrompt(log)}>{copiedLogId === log.id ? '已复制' : '复制提示词'}</button>
                <button className="ghost small" disabled={localRefs.length === 0} onClick={() => onRevealLogPath(log)}>打开素材位置</button>
                <button className="primary small" disabled={!log.input} onClick={() => onRetryLog(log)}>重试本次请求</button>
              </div>
              <details>
                <summary>查看输入 / 输出摘要</summary>
                <pre>{JSON.stringify({ input: log.input, output: log.output, error: log.error }, null, 2).slice(0, 2200)}</pre>
              </details>
            </article>
          );
        })}
        {filteredLogs.length === 0 ? <div className="empty-state">生成提示词包、场景卡、文章、图片或视频后会在这里沉淀历史。</div> : null}
      </div>
    </section>
  );
}
