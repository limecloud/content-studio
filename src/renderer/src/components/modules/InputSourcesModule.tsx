import { useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type {
  AgentPromptSession,
  InputSourcePurpose,
  InputSourceRecord,
  InputSourceStatus,
  PromptDraftPurpose,
} from '../../../../shared/types';
import { isPromptDistilledSource } from '../../../../shared/inputSourcePolicy';
import {
  buildProductBriefPromptPlan,
  structureProductBriefSources,
  type StructuredProductBrief,
} from '../../../../shared/productBrief';
import { clusterUserFeedbackSources, type FeedbackPainPointInsight } from '../../../../shared/userFeedbackInsights';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { AgentSessionPanel, type AgentActionResolver, type AgentExecutionStep } from '../agent/AgentSessionPanel';
import { isAgentInputSourceRecoverySession } from '../agent/agentRuntimeProjection';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { ActionGroup, StatusPill } from '../WorkbenchPrimitives';

interface InputSourcesModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  inputSources: InputSourceRecord[];
  onImportInputSource: (purpose: InputSourcePurpose, agentSessionId?: string) => void;
  onRegisterManualInputSource: (input: {
    title: string;
    purpose: InputSourcePurpose;
    text: string;
    tags?: string[];
    agentSessionId?: string;
  }) => void;
  agentPromptSessions: AgentPromptSession[];
  activeAgentPromptSessionId: string;
  textModel?: string;
  onSelectAgentSession: (sessionId: string) => void;
  onResolveAgentAction?: AgentActionResolver;
  onStartAgentSession: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    sceneCardIds?: string[];
    textModel?: string;
  }) => void;
  onContinueAgentSession: (input: { sessionId: string; message: string; textModel?: string }) => void;
  onSelectModule: (module: ModuleKey) => void;
}

const PURPOSE_OPTIONS: Array<{ value: InputSourcePurpose; label: string }> = [
  { value: 'brand-kb', label: '品牌 / 产品知识库' },
  { value: 'ip-kb', label: 'IP 知识库' },
  { value: 'ip-scenario-kb', label: 'IP 场景延伸库' },
  { value: 'competitor-observation', label: '竞品观察' },
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

const AGENT_SESSION_STATUS_LABELS: Record<AgentPromptSession['status'], string> = {
  active: '会话中',
  'waiting-user': '等你补充',
  'draft-created': '已输出',
  blocked: '待配置',
  closed: '已关闭',
};

const AGENT_MESSAGE_KIND_LABELS: Record<AgentPromptSession['messages'][number]['kind'], string> = {
  intent: '任务',
  draft: '输出',
  adjustment: '追问',
  note: '记录',
};

function statusClass(status: InputSourceStatus): string {
  if (status === 'converted') return 'ready';
  if (status === 'blocked' || status === 'failed') return 'blocked';
  return 'idle';
}

function agentSessionTone(status?: AgentPromptSession['status']) {
  if (status === 'blocked' || status === 'closed') return 'blocked';
  if (status === 'draft-created' || status === 'active') return 'ready';
  return 'idle';
}

function agentMessageTitle(message: AgentPromptSession['messages'][number]): string {
  if (message.role === 'user') return message.kind === 'adjustment' ? '你的补充' : '你的任务';
  if (message.role === 'assistant') return '分流建议';
  return '系统记录';
}

function compactAgentMessage(message: AgentPromptSession['messages'][number]): string {
  const content = message.content.trim();
  if (!content) return '无内容';
  const userIntent = content.match(/用户意图：\n([\s\S]*?)(\n\n输入源快照：|\n\n本轮 skills：|$)/)?.[1]?.trim();
  if (message.role === 'user' && userIntent) return userIntent.split('\n').filter(Boolean).slice(0, 6).join('\n');
  const promptDraft = content.match(/Prompt 草稿：\n([\s\S]*?)(\n\n需要追问|\n\n仍需追问|\n\n来源与合规提醒|\n\n下游检查清单|\n\n本轮调整：|$)/)?.[1]?.trim();
  if (message.role === 'assistant' && promptDraft) return promptDraft.split('\n').filter(Boolean).slice(0, 8).join('\n');
  return content.split('\n').filter(Boolean).slice(0, 8).join('\n');
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
  agentPromptSessions,
  activeAgentPromptSessionId,
  textModel,
  onSelectAgentSession,
  onResolveAgentAction,
  onStartAgentSession,
  onContinueAgentSession,
  onSelectModule,
}: InputSourcesModuleProps) {
  const feature = V2_FEATURES['knowledge-inputs'];
  const [purpose, setPurpose] = useState<InputSourcePurpose>('sop-input');
  const [title, setTitle] = useState('手动输入源');
  const [text, setText] = useState('');
  const [tags, setTags] = useState('用户意图, SOP');
  const [agentMessage, setAgentMessage] = useState('请基于当前输入源，判断哪些资料适合进品牌知识库、IP 知识库、产品变量表、评论痛点矩阵或 Prompt 工作台，并列出缺口。');
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
  const relatedAgentSessions = useMemo(
    () => {
      const inputSourceIds = new Set(inputSources.map((source) => source.id));
      return agentPromptSessions.filter((session) => (
        session.id === activeAgentPromptSessionId ||
        isAgentInputSourceRecoverySession(session) ||
        session.title.includes('输入源分流') ||
        session.userIntent.includes('输入源分流') ||
        session.inputSourceIds.some((sourceId) => inputSourceIds.has(sourceId))
      ));
    },
    [activeAgentPromptSessionId, agentPromptSessions, inputSources],
  );
  const activeAgentSession =
    relatedAgentSessions.find((session) => session.id === activeAgentPromptSessionId) ??
    relatedAgentSessions[0];
  const reusableInputSourceIds = useMemo(
    () => inputSources.filter((source) => !isPromptDistilledSource(source)).map((source) => source.id),
    [inputSources],
  );
  const agentSteps: AgentExecutionStep[] = [
    {
      key: 'register',
      title: '登记资料',
      detail: `${stats.total} 个输入源`,
      state: stats.total ? 'done' : 'active',
    },
    {
      key: 'convert',
      title: '确认可读',
      detail: `${stats.converted} 个可读文本`,
      state: stats.converted ? 'done' : stats.blocked ? 'blocked' : 'idle',
    },
    {
      key: 'product',
      title: '产品变量',
      detail: productBrief.sourceIds.length ? `${productBrief.sourceIds.length} 个产品输入` : '待登记产品资料',
      state: productBrief.sourceIds.length ? (productBrief.missingFields.length ? 'active' : 'done') : 'idle',
    },
    {
      key: 'feedback',
      title: '用户反馈',
      detail: feedbackInsight.sourceIds.length ? `${feedbackInsight.clusters.length} 类痛点` : '待登记评论',
      state: feedbackInsight.sourceIds.length ? (feedbackInsight.clusters.length ? 'done' : 'active') : 'idle',
    },
  ];
  const registerInputSource = () => {
    onRegisterManualInputSource({
      title,
      purpose,
      text,
      tags: tags.split(',').map((item) => item.trim()).filter(Boolean),
      agentSessionId: activeAgentSession?.id,
    });
    setText('');
  };
  const startInputAgent = () => {
    const trimmed = agentMessage.trim();
    if (!trimmed) return;
    onStartAgentSession({
      title: '输入源分流',
      purpose: 'sop',
      userIntent: [
        '输入源分流',
        `当前已登记输入源：${stats.total} 个；可读文本 ${stats.converted} 个；待解析 ${stats.blocked} 个。`,
        `产品资料：${productBrief.sourceIds.length} 个输入；待补字段：${productBrief.missingFields.join('、') || '无'}；SKU 行：${productBrief.skuRows.length}。`,
        `评论 / 客服问题：${feedbackInsight.sourceIds.length} 个输入；痛点分类：${feedbackInsight.clusters.length} 类；原声 ${feedbackInsight.totalLines} 条。`,
        text.trim() ? `当前表单还有未登记文本：标题 ${title}；用途 ${purposeLabel(purpose)}。请提醒用户先登记后再进入下游追溯。` : '',
        `用户请求：${trimmed}`,
        '请只基于真实已登记输入源和当前表单状态给出分流建议；缺资料时列出需要补充的文件、字段或评论证据，不要编造产品卖点、用户评论或解析结果。',
      ].filter(Boolean).join('\n'),
      inputSourceIds: reusableInputSourceIds,
      textModel,
    });
  };
  const continueInputAgent = () => {
    const trimmed = agentMessage.trim();
    if (!activeAgentSession || !trimmed) return;
    onContinueAgentSession({ sessionId: activeAgentSession.id, message: trimmed, textModel });
  };
  const inputAgentContext = (
    <>
      <div className="agent-turn-head">
        <strong>登记输入源</strong>
        <small>{purposeLabel(purpose)} · {stats.total} 个已登记</small>
      </div>
      <section className="input-source-register-panel">
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
      </section>
    </>
  );
  const inputAgentArtifact = (
    <>
      <div className="input-agent-artifact-grid">
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
      </div>

      <section className="panel input-source-list-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">输入源列表</p>
            <h3>已登记资料</h3>
          </div>
          <StatusPill>{stats.total} 个</StatusPill>
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
    </>
  );
  const inputAgentFooter = (
    <>
      <label className="prompt-session-adjustment knowledge-agent-composer">
        <span>{activeAgentSession ? '继续对话' : '分流要求'}</span>
        <textarea value={agentMessage} onChange={(event) => setAgentMessage(event.target.value)} />
      </label>
      <ActionGroup align="left">
        {activeAgentSession ? (
          <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim()} onClick={continueInputAgent}>
            继续会话
          </button>
        ) : (
          <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim() || (!inputSources.length && !text.trim())} onClick={startInputAgent}>
            开始分流
          </button>
        )}
        <button
          className="ghost small"
          disabled={!workspaceReady || busy || !text.trim()}
          onClick={registerInputSource}
        >
          登记文本输入源
        </button>
        <button
          className="ghost small"
          disabled={!workspaceReady || busy}
          onClick={() => onImportInputSource(purpose, activeAgentSession?.id)}
        >
          导入文件输入源
        </button>
        <button className="ghost small" disabled={!workspaceReady} onClick={() => onSelectModule('knowledge-brand')}>
          去品牌知识库
        </button>
        <button className="ghost small" disabled={!workspaceReady} onClick={() => onSelectModule('assets-prompt-workbench')}>
          去 Prompt 工作台
        </button>
        <button className="ghost small" disabled={!workspaceReady} onClick={() => onSelectModule('image')}>
          去图片生成
        </button>
      </ActionGroup>
    </>
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

      <AgentSessionPanel
        eyebrow="输入源助手"
        title={activeAgentSession?.title ?? '输入源分流'}
        session={activeAgentSession}
        sessions={relatedAgentSessions}
        transcriptLabel={activeAgentSession ? activeAgentSession.title : stats.total ? '输入源追溯与分流' : '等待登记第一条输入源'}
        statusLabel={activeAgentSession ? AGENT_SESSION_STATUS_LABELS[activeAgentSession.status] : `${stats.total} 个输入源`}
        statusTone={activeAgentSession ? agentSessionTone(activeAgentSession.status) : stats.blocked ? 'blocked' : stats.total ? 'ready' : 'idle'}
        steps={agentSteps}
        runningLabel={busy ? '正在处理输入源任务' : undefined}
        context={inputAgentContext}
        artifact={inputAgentArtifact}
        footer={inputAgentFooter}
        empty={(
          <>
            <strong>等待登记输入源</strong>
            <span>粘贴文本或导入文件后，系统会把资料转成可追溯输入，再分流到知识库、Prompt、图片和 SOP。</span>
          </>
        )}
        onSelectSession={onSelectAgentSession}
        onResolveAction={onResolveAgentAction}
        messageTitle={agentMessageTitle}
        messageMeta={(message) => `${AGENT_MESSAGE_KIND_LABELS[message.kind]} · ${new Date(message.createdAt).toLocaleString()}`}
        messagePreview={compactAgentMessage}
      />
    </section>
  );
}
