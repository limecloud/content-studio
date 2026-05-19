import { useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { GenerationLogEntry } from '../../../../shared/types';
import { HISTORY_FILTERS } from '../../app/constants';
import {
  extractLocalRefsFromLog,
  extractPromptFromLog,
  extractSkillSlugsFromLog,
  formatDuration,
  imageRequestFromLog,
  kindLabel,
  statusLabel,
} from '../../app/formatters';

interface AssetsModuleProps {
  logsCount: number;
  filteredLogs: GenerationLogEntry[];
  historyFilter: GenerationLogEntry['kind'] | 'all';
  setHistoryFilter: Dispatch<SetStateAction<GenerationLogEntry['kind'] | 'all'>>;
  copiedLogId: string | null;
  onCopyLogPrompt: (log: GenerationLogEntry) => void;
  onRevealLogPath: (log: GenerationLogEntry) => void;
  onReuseImageLogInput: (log: GenerationLogEntry) => void;
  onRetryLog: (log: GenerationLogEntry) => void;
}

function jsonPreview(value: unknown): string {
  if (value === undefined || value === null) return '未记录';
  return JSON.stringify(value, null, 2).slice(0, 3600);
}

export function AssetsModule({
  logsCount,
  filteredLogs,
  historyFilter,
  setHistoryFilter,
  copiedLogId,
  onCopyLogPrompt,
  onRevealLogPath,
  onReuseImageLogInput,
  onRetryLog,
}: AssetsModuleProps) {
  const [selectedLog, setSelectedLog] = useState<GenerationLogEntry | null>(null);
  const selectedImageInput = imageRequestFromLog(selectedLog ?? undefined);
  const selectedLocalRefs = useMemo(
    () => (selectedLog ? extractLocalRefsFromLog(selectedLog) : []),
    [selectedLog],
  );
  const selectedSkillSlugs = useMemo(
    () => (selectedLog ? extractSkillSlugsFromLog(selectedLog) : []),
    [selectedLog],
  );

  return (
    <section className="panel full-panel">
      <div className="panel-title"><div><p className="eyebrow">素材沉淀</p><h3>生成历史 / 素材库</h3></div><span className="status-pill">{logsCount} 条记录</span></div>
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
              <small>{statusLabel(log.status)} · {formatDuration(log.durationMs)} · {log.model ?? 'local'} · 引用 {log.citations?.length ?? 0} · 能力 {skillSlugs.length} · 素材 {localRefs.length} · {new Date(log.createdAt).toLocaleString()}</small>
              {skillSlugs.length ? (
                <div className="skill-chip-row">
                  {skillSlugs.map((slug) => <span key={slug}>{slug}</span>)}
                </div>
              ) : null}
              <div className="log-actions">
                <button className="ghost small" onClick={() => setSelectedLog(log)}>详情</button>
                <button className="ghost small" onClick={() => onCopyLogPrompt(log)}>{copiedLogId === log.id ? '已复制' : '复制提示词'}</button>
                <button className="ghost small" disabled={localRefs.length === 0} onClick={() => onRevealLogPath(log)}>打开素材位置</button>
                <button className="primary small" disabled={!log.input} onClick={() => onRetryLog(log)}>重试本次请求</button>
              </div>
            </article>
          );
        })}
        {filteredLogs.length === 0 ? <div className="empty-state">生成提示词包、场景卡、文章、图片或视频后会在这里沉淀历史。</div> : null}
      </div>
      {selectedLog ? (
        <div
          className="detail-dialog-backdrop"
          role="presentation"
          onClick={() => setSelectedLog(null)}
        >
          <article
            className="detail-dialog-card asset-log-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="生成历史详情"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="detail-dialog-header">
              <div>
                <p className="eyebrow">生成历史</p>
                <h3>{selectedLog.title}</h3>
              </div>
              <button className="ghost small" onClick={() => setSelectedLog(null)}>
                关闭
              </button>
            </div>
            <div className="detail-dialog-body asset-log-detail-body">
              <div className="asset-log-detail-grid">
                <span>
                  <strong>类型</strong>
                  <em>{kindLabel(selectedLog.kind)}</em>
                </span>
                <span>
                  <strong>状态</strong>
                  <em>{statusLabel(selectedLog.status)}</em>
                </span>
                <span>
                  <strong>模型</strong>
                  <em>{selectedLog.model ?? '未记录'}</em>
                </span>
                <span>
                  <strong>模板</strong>
                  <em>{selectedImageInput?.template ?? '未记录'}</em>
                </span>
                <span>
                  <strong>耗时</strong>
                  <em>{formatDuration(selectedLog.durationMs)}</em>
                </span>
                <span>
                  <strong>引用</strong>
                  <em>{selectedLog.citations?.length ?? 0} 条</em>
                </span>
                <span>
                  <strong>能力</strong>
                  <em>{selectedSkillSlugs.length} 个</em>
                </span>
                <span>
                  <strong>素材</strong>
                  <em>{selectedLocalRefs.length} 个</em>
                </span>
                <span className="wide">
                  <strong>生成时间</strong>
                  <em>{new Date(selectedLog.createdAt).toLocaleString()}</em>
                </span>
                <span className="wide">
                  <strong>日志编号</strong>
                  <em>{selectedLog.id}</em>
                </span>
              </div>
              <label className="image-result-prompt">
                <span>历史提示词</span>
                <textarea readOnly value={extractPromptFromLog(selectedLog)} />
              </label>
              {selectedLocalRefs.length ? (
                <div className="asset-log-path-list">
                  <strong>素材路径</strong>
                  {selectedLocalRefs.map((path) => (
                    <code key={path} className="path-code">{path}</code>
                  ))}
                </div>
              ) : null}
              <div className="asset-log-json-grid">
                <div className="asset-log-json-card">
                  <strong>输入</strong>
                  <pre>{jsonPreview(selectedLog.input)}</pre>
                </div>
                <div className="asset-log-json-card">
                  <strong>输出</strong>
                  <pre>{jsonPreview(selectedLog.output ?? selectedLog.error)}</pre>
                </div>
              </div>
              {selectedLog.error ? (
                <div className="error-banner">{selectedLog.error}</div>
              ) : null}
              <div className="modal-actions">
                <button className="ghost" onClick={() => onCopyLogPrompt(selectedLog)}>
                  {copiedLogId === selectedLog.id ? '已复制' : '复制提示词'}
                </button>
                <button
                  className="ghost"
                  disabled={selectedLocalRefs.length === 0}
                  onClick={() => onRevealLogPath(selectedLog)}
                >
                  打开素材位置
                </button>
                <button
                  className="ghost"
                  disabled={!selectedImageInput}
                  onClick={() => {
                    setSelectedLog(null);
                    onReuseImageLogInput(selectedLog);
                  }}
                >
                  复用图片参数
                </button>
                <button
                  className="primary"
                  disabled={!selectedLog.input}
                  onClick={() => onRetryLog(selectedLog)}
                >
                  重试本次请求
                </button>
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
