import { useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type { InputSourcePurpose, InputSourceRecord, InputSourceStatus } from '../../../../shared/types';
import { isPromptDistilledSource } from '../../../../shared/inputSourcePolicy';
import {
  buildProductBriefPromptPlan,
  structureProductBriefSources,
  type StructuredProductBrief,
} from '../../../../shared/productBrief';
import { clusterUserFeedbackSources, type FeedbackPainPointInsight } from '../../../../shared/userFeedbackInsights';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { UserJourneyGuide } from '../UserJourneyGuide';

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
  onSelectModule: (module: ModuleKey) => void;
}

const PURPOSE_OPTIONS: Array<{ value: InputSourcePurpose; label: string }> = [
  { value: 'brand-kb', label: '品牌 / 产品知识库' },
  { value: 'ip-kb', label: 'IP 知识库' },
  { value: 'ip-scenario-kb', label: 'IP 场景延伸库' },
  { value: 'reference', label: '参考素材' },
  { value: 'product-brief', label: '产品资料' },
  { value: 'user-feedback', label: '评论 / 客服问题' },
  { value: 'sop-input', label: '任务输入' },
  { value: 'successful-asset', label: '成功素材' },
];

const STATUS_LABELS: Record<InputSourceStatus, string> = {
  registered: '已登记',
  converted: '已转换',
  blocked: '待解析',
  failed: '失败',
};

const KIND_LABELS: Record<InputSourceRecord['kind'], string> = {
  docx: '文档',
  markdown: '文档',
  text: '文本',
  image: '图片',
  video: '视频',
  'sku-table': 'SKU 表',
  url: '网页',
  'manual-note': '手动记录',
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

function kindLabel(value: InputSourceRecord['kind']): string {
  return KIND_LABELS[value] ?? value;
}

function ProductBriefList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="product-brief-field">
      <strong>{title}</strong>
      {items.length ? (
        <ul>
          {items.map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p>{empty}</p>
      )}
    </div>
  );
}

function ProductBriefStructurePanel({
  brief,
  workspaceReady,
  onSelectModule,
}: {
  brief: StructuredProductBrief;
  workspaceReady: boolean;
  onSelectModule: (module: ModuleKey) => void;
}) {
  const hasProductSources = brief.sourceIds.length > 0;
  const promptPlan = useMemo(() => buildProductBriefPromptPlan(brief), [brief]);
  return (
    <section className="panel product-brief-structure-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">产品资料结构化</p>
          <h3>产品变量表</h3>
        </div>
        <div className="workflow-summary-stack">
          <span className="status-pill">{brief.sourceIds.length} 个产品输入</span>
          <span className={`status-pill ${brief.missingFields.length ? 'blocked' : 'ready'}`}>
            {brief.missingFields.length ? `${brief.missingFields.length} 项待补` : '可进入生产'}
          </span>
          <span className="status-pill">{brief.skuRows.length} 行 SKU</span>
        </div>
      </div>
      {hasProductSources ? (
        <>
          <div className="product-brief-source-row">
            {brief.sourceTitles.map((title) => <span key={title}>{title}</span>)}
          </div>
          <div className="product-brief-grid">
            <div className="product-brief-field primary">
              <strong>产品名称</strong>
              <p>{brief.productName || '待补充。系统不会替用户编造产品名称。'}</p>
            </div>
            <ProductBriefList title="卖点" items={brief.sellingPoints} empty="待补充卖点。" />
            <ProductBriefList title="规格 / 参数" items={brief.specs} empty="待补充规格、成分、容量、价格或 SKU 字段。" />
            <ProductBriefList title="适用场景 / 人群" items={brief.scenarios} empty="待补充使用场景、目标人群或痛点。" />
            <ProductBriefList title="禁用表达 / 合规边界" items={brief.restrictions} empty="待补充禁用表达；生成前需要人工确认边界。" />
            <div className="product-brief-field">
              <strong>变量表</strong>
              <pre>{brief.variableTable}</pre>
            </div>
          </div>
          {brief.skuRows.length ? (
            <div className="product-brief-sku-table">
              <strong>SKU 表预览</strong>
              <div>
                <table>
                  <thead>
                    <tr>
                      {Object.keys(brief.skuRows[0] ?? {}).map((key) => <th key={key}>{key}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {brief.skuRows.slice(0, 6).map((row, index) => (
                      <tr key={index}>
                        {Object.keys(brief.skuRows[0] ?? {}).map((key) => <td key={key}>{row[key]}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
          {brief.missingFields.length ? (
            <div className="inline-warning">待补：{brief.missingFields.join('、')}。补齐后再进入图片、详情页或 Prompt 生产。</div>
          ) : null}
          <div className="product-brief-prompt-plan">
            <div className="panel-subtitle">
              <strong>下游 Prompt 交付</strong>
              <span>{promptPlan.length} 个任务</span>
            </div>
            <div>
              {promptPlan.map((item) => (
                <article key={item.type}>
                  <strong>{item.label}</strong>
                  <p>{item.prompt}</p>
                  <small>资料来源：{brief.sourceTitles.join('、') || '待补充'} · {item.skuTrace}</small>
                </article>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="empty-state">还没有产品资料。登记时选择“产品资料”，或导入 SKU / 卖点表后，这里会自动整理变量表。</div>
      )}
      <div className="workflow-actions left">
        <button className="ghost small" disabled={!workspaceReady} onClick={() => onSelectModule('assets-prompt-workbench')}>
          去 Prompt 工作台
        </button>
        <button className="ghost small" disabled={!workspaceReady} onClick={() => onSelectModule('material-breakdown')}>
          去拆解素材
        </button>
        <button className="ghost small" disabled={!workspaceReady} onClick={() => onSelectModule('image')}>
          去图片生成
        </button>
      </div>
    </section>
  );
}

function FeedbackInsightPanel({
  insight,
  workspaceReady,
  onSelectModule,
}: {
  insight: FeedbackPainPointInsight;
  workspaceReady: boolean;
  onSelectModule: (module: ModuleKey) => void;
}) {
  const hasFeedback = insight.sourceIds.length > 0;
  return (
    <section className="panel feedback-insight-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">评论痛点聚类</p>
          <h3>用户问题矩阵</h3>
        </div>
        <div className="workflow-summary-stack">
          <span className="status-pill">{insight.sourceIds.length} 个反馈输入</span>
          <span className={`status-pill ${insight.clusters.length ? 'ready' : 'blocked'}`}>{insight.clusters.length} 类痛点</span>
          <span className="status-pill">{insight.totalLines} 条原声</span>
        </div>
      </div>
      {hasFeedback ? (
        <>
          <div className="product-brief-source-row">
            {insight.sourceTitles.map((title) => <span key={title}>{title}</span>)}
          </div>
          {insight.clusters.length ? (
            <>
              <div className="feedback-cluster-grid">
                {insight.clusters.map((cluster) => (
                  <article key={cluster.key} className="feedback-cluster-card">
                    <div>
                      <strong>{cluster.label}</strong>
                      <span>{cluster.count} 条证据</span>
                    </div>
                    <p>{cluster.examples[0]}</p>
                    <div className="workflow-run-steps">
                      {cluster.tags.map((tag) => <span key={tag}>{tag}</span>)}
                    </div>
                  </article>
                ))}
              </div>
              <div className="feedback-matrix-table">
                <strong>痛点 x 人群 x 场景 x 内容角度</strong>
                <div>
                  <table>
                    <thead>
                      <tr>
                        <th>痛点</th>
                        <th>人群</th>
                        <th>场景</th>
                        <th>内容角度</th>
                      </tr>
                    </thead>
                    <tbody>
                      {insight.matrix.map((row) => (
                        <tr key={`${row.painPoint}:${row.evidence}`}>
                          <td>{row.painPoint}</td>
                          <td>{row.audience}</td>
                          <td>{row.scenario}</td>
                          <td>{row.contentAngle}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="feedback-title-list">
                <strong>选题方向</strong>
                <ul>
                  {insight.titleDirections.slice(0, 6).map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="feedback-objection-list">
                <strong>客服异议处理</strong>
                <div>
                  {insight.objectionResponses.slice(0, 6).map((item) => (
                    <article key={`${item.painPoint}:${item.evidence}`}>
                      <span>{item.painPoint}</span>
                      <p>{item.response}</p>
                      <small>{item.boundary}</small>
                    </article>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="inline-warning">已登记反馈，但还没有可归类的评论行。请粘贴每行一个评论、差评或客服问题。</div>
          )}
        </>
      ) : (
        <div className="empty-state">还没有评论 / 客服问题。登记时选择该用途，粘贴真实用户评论、差评、私信或客服问答后，这里会生成痛点矩阵和选题方向。</div>
      )}
      <div className="workflow-actions left">
        <button className="ghost small" disabled={!workspaceReady || !insight.clusters.length} onClick={() => onSelectModule('article-title')}>
          去标题生成
        </button>
        <button className="ghost small" disabled={!workspaceReady || !insight.clusters.length} onClick={() => onSelectModule('assets-prompt-workbench')}>
          去 Prompt 工作台
        </button>
        <button className="ghost small" disabled={!workspaceReady || !insight.clusters.length} onClick={() => onSelectModule('knowledge-scenes')}>
          去场景库
        </button>
      </div>
    </section>
  );
}

export function InputSourcesModule({
  workspaceReady,
  busy,
  inputSources,
  onImportInputSource,
  onRegisterManualInputSource,
  onSelectModule,
}: InputSourcesModuleProps) {
  const feature = V2_FEATURES['knowledge-inputs'];
  const [purpose, setPurpose] = useState<InputSourcePurpose>('sop-input');
  const [title, setTitle] = useState('手动输入源');
  const [text, setText] = useState('');
  const [tags, setTags] = useState('用户意图, SOP');
  const productBrief = useMemo(() => structureProductBriefSources(inputSources), [inputSources]);
  const feedbackInsight = useMemo(() => clusterUserFeedbackSources(inputSources), [inputSources]);
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

      <UserJourneyGuide
        title="先把资料登记清楚，再进入对应任务"
        description="普通用户不用先理解工作流。把 DOCX、Markdown、参考图、参考视频、产品资料或用户意图登记成可追溯输入，后续页面会自动拿这些资料继续生产。"
        steps={[
          {
            key: 'register',
            title: '登记资料',
            description: '上传文件或粘贴文本，选择它属于品牌、IP、参考素材、产品资料还是用户反馈。',
            state: stats.total ? 'done' : 'active',
          },
          {
            key: 'convert',
            title: '确认可读',
            description: '文档转成可读文本；图片、视频和失败项保留原文件与原因。',
            state: stats.converted ? 'done' : stats.blocked ? 'blocked' : 'next',
          },
          {
            key: 'route',
            title: '进入任务',
            description: '品牌资料去知识库，参考图和产品资料去图片链路，评论问题去标题或选题生产。',
            state: stats.total ? 'next' : 'idle',
          },
        ]}
        actions={[
          { label: '去品牌知识库', module: 'knowledge-brand', disabled: !workspaceReady },
          { label: '去 IP 知识库', module: 'knowledge-ip', disabled: !workspaceReady },
          { label: '去拆解素材', module: 'material-breakdown', disabled: !workspaceReady },
          { label: '去 Prompt 工作台', module: 'assets-prompt-workbench', disabled: !workspaceReady },
          { label: '去图片生成', module: 'image', disabled: !workspaceReady },
        ]}
        onSelectModule={onSelectModule}
      />

      <ProductBriefStructurePanel
        brief={productBrief}
        workspaceReady={workspaceReady}
        onSelectModule={onSelectModule}
      />

      <FeedbackInsightPanel
        insight={feedbackInsight}
        workspaceReady={workspaceReady}
        onSelectModule={onSelectModule}
      />

      <div className="input-sources-layout">
        <section className="panel input-source-register-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">登记输入</p>
              <h3>登记素材和资料</h3>
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
                placeholder="输入用户意图、产品资料摘要、知识库补充说明；保存后会生成可追溯转换稿。"
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
              <h3>已登记资料</h3>
            </div>
          </div>
          <div className="input-source-list">
            {inputSources.map((source) => (
              <article key={source.id} className="input-source-card">
                <div className="workflow-run-head">
                  <span className={`status-pill ${statusClass(source.status)}`}>{STATUS_LABELS[source.status]}</span>
                  {isPromptDistilledSource(source) ? (
                    <span className="status-pill ready">成功素材追溯</span>
                  ) : null}
                  <div>
                    <strong>{source.title}</strong>
                    <small>{kindLabel(source.kind)} · {purposeLabel(source.purpose)} · {formatTime(source.createdAt)}</small>
                  </div>
                </div>
                <p>{source.summary ?? source.blockedReason ?? '未记录摘要。'}</p>
                {source.blockedReason ? <em>{source.blockedReason}</em> : null}
                <div className="workflow-run-steps">
                  {source.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                  {source.markdownPath ? <span className="ready">已生成转换稿</span> : null}
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
