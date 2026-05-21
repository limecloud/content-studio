import { useMemo, useState } from 'react';
import type { InputSourcePurpose, InputSourceRecord, InputSourceStatus } from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface InputSourcesModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  inputSources: InputSourceRecord[];
  onImportInputSource: (purpose: InputSourcePurpose) => void;
  onRegisterManualInputSource: (input: {
    title: string;
    purpose: InputSourcePurpose;
    text: string;
    tags?: string[];
  }) => void;
}

const PURPOSE_OPTIONS: Array<{ value: InputSourcePurpose; label: string }> = [
  { value: 'brand-kb', label: '品牌 / 产品知识库' },
  { value: 'ip-kb', label: 'IP 知识库' },
  { value: 'reference', label: '参考素材' },
  { value: 'product-brief', label: '产品资料' },
  { value: 'sop-input', label: 'SOP 输入' },
  { value: 'successful-asset', label: '成功素材' },
];

const STATUS_LABELS: Record<InputSourceStatus, string> = {
  registered: '已登记',
  converted: '已转换',
  blocked: '阻塞',
  failed: '失败',
};

function statusClass(status: InputSourceStatus): string {
  if (status === 'converted') return 'ready';
  if (status === 'blocked' || status === 'failed') return 'blocked';
  return 'idle';
}

function formatTime(value: string): string {
  return new Date(value).toLocaleString();
}

function purposeLabel(value: InputSourcePurpose): string {
  return PURPOSE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function InputSourcesModule({
  workspaceReady,
  busy,
  inputSources,
  onImportInputSource,
  onRegisterManualInputSource,
}: InputSourcesModuleProps) {
  const feature = V2_FEATURES['knowledge-inputs'];
  const [purpose, setPurpose] = useState<InputSourcePurpose>('sop-input');
  const [title, setTitle] = useState('手动输入源');
  const [text, setText] = useState('');
  const [tags, setTags] = useState('用户意图, SOP');
  const stats = useMemo(
    () => ({
      total: inputSources.length,
      converted: inputSources.filter((source) => source.status === 'converted').length,
      blocked: inputSources.filter((source) => source.status === 'blocked').length,
    }),
    [inputSources],
  );

  return (
    <section className="input-sources-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="compact"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{stats.total} 个输入源</span>
            <span className="status-pill ready">{stats.converted} 个可读文本</span>
            <span className="status-pill blocked">{stats.blocked} 个待解析</span>
          </div>
        )}
      />

      <div className="input-sources-layout">
        <section className="panel input-source-register-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">登记输入</p>
              <h3>输入源事实源</h3>
            </div>
          </div>
          <div className="workflow-form-grid">
            <label>
              <span>用途</span>
              <select value={purpose} onChange={(event) => setPurpose(event.target.value as InputSourcePurpose)}>
                {PURPOSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>标题</span>
              <input value={title} onChange={(event) => setTitle(event.target.value)} />
            </label>
            <label>
              <span>标签</span>
              <input value={tags} onChange={(event) => setTags(event.target.value)} />
            </label>
            <label>
              <span>文本 / 用户意图</span>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="输入用户意图、产品资料摘要、知识库补充说明；保存后会生成可追溯 Markdown。"
              />
            </label>
          </div>
          <div className="workflow-actions left">
            <button
              className="primary small"
              disabled={!workspaceReady || busy || !text.trim()}
              onClick={() => {
                onRegisterManualInputSource({
                  title,
                  purpose,
                  text,
                  tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
                });
                setText('');
              }}
            >
              登记文本输入源
            </button>
            <button
              className="ghost small"
              disabled={!workspaceReady || busy}
              onClick={() => onImportInputSource(purpose)}
            >
              导入文件输入源
            </button>
          </div>
        </section>

        <section className="panel input-source-list-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">输入源列表</p>
              <h3>Source Registry</h3>
            </div>
          </div>
          <div className="input-source-list">
            {inputSources.map((source) => (
              <article key={source.id} className="input-source-card">
                <div className="workflow-run-head">
                  <span className={`status-pill ${statusClass(source.status)}`}>{STATUS_LABELS[source.status]}</span>
                  <div>
                    <strong>{source.title}</strong>
                    <small>{source.kind} · {purposeLabel(source.purpose)} · {formatTime(source.createdAt)}</small>
                  </div>
                </div>
                <p>{source.summary ?? source.blockedReason ?? '未记录摘要。'}</p>
                {source.blockedReason ? <em>{source.blockedReason}</em> : null}
                <div className="workflow-run-steps">
                  {source.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                  {source.markdownPath ? <span className="ready">Markdown</span> : null}
                </div>
              </article>
            ))}
            {inputSources.length === 0 ? (
              <div className="empty-state">还没有输入源。先登记 DOCX、参考图、参考视频、SKU 或用户意图，再分流到知识库、SOP 和 Prompt 工作台。</div>
            ) : null}
          </div>
        </section>
      </div>
    </section>
  );
}
