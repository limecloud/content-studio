import { useMemo, useState } from 'react';
import type {
  AgentPromptSession,
  BrandKnowledgeBaseRecord,
  KnowledgeBaseView,
  KnowledgeCitation,
  PromptDraftPurpose,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { baseLabel, clip, sectionLabel } from '../../app/formatters';
import { AgentSessionPanel, type AgentActionResolver, type AgentExecutionStep } from '../agent/AgentSessionPanel';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { ActionGroup, SelectableRecordCard, StatusPill } from '../WorkbenchPrimitives';

interface BrandKnowledgeModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  activeKnowledgeBase?: KnowledgeBaseView;
  selectedCitations: KnowledgeCitation[];
  citationCount: number;
  brandKnowledgeBases: BrandKnowledgeBaseRecord[];
  activeBrandKnowledgeBase?: BrandKnowledgeBaseRecord;
  activeBrandKnowledgeBaseId: string;
  setActiveBrandKnowledgeBaseId: (recordId: string) => void;
  inputSourceIds: string[];
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
  onGenerateBrandKnowledgeBase: () => void;
  onOpenKnowledgeScenes: () => void;
  onOpenInputSources: () => void;
}

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

function agentSessionTone(status?: AgentPromptSession['status']) {
  if (status === 'blocked' || status === 'closed') return 'blocked';
  if (status === 'draft-created' || status === 'active') return 'ready';
  return 'idle';
}

function agentMessageTitle(message: AgentPromptSession['messages'][number]): string {
  if (message.role === 'user') return message.kind === 'adjustment' ? '你的补充' : '你的任务';
  if (message.role === 'assistant') return '知识判断';
  return '系统记录';
}

function compactAgentMessage(message: AgentPromptSession['messages'][number]): string {
  const content = message.content.trim();
  const userIntent = content.match(/用户意图：\n([\s\S]*?)(\n\n输入源快照：|\n\n本轮 skills：|$)/)?.[1]?.trim();
  if (message.role === 'user' && userIntent) return userIntent.split('\n').filter(Boolean).slice(0, 6).join('\n');
  const promptDraft = content.match(/Prompt 草稿：\n([\s\S]*?)(\n\n需要追问|\n\n仍需追问|\n\n来源与合规提醒|\n\n下游检查清单|\n\n本轮调整：|$)/)?.[1]?.trim();
  if (message.role === 'assistant' && promptDraft) return promptDraft.split('\n').filter(Boolean).slice(0, 8).join('\n');
  return content.split('\n').filter(Boolean).slice(0, 8).join('\n');
}

export function BrandKnowledgeModule({
  workspaceReady,
  busy,
  activeKnowledgeBase,
  selectedCitations,
  citationCount,
  brandKnowledgeBases,
  activeBrandKnowledgeBase,
  activeBrandKnowledgeBaseId,
  setActiveBrandKnowledgeBaseId,
  inputSourceIds,
  agentPromptSessions,
  activeAgentPromptSessionId,
  textModel,
  onSelectAgentSession,
  onResolveAgentAction,
  onStartAgentSession,
  onContinueAgentSession,
  onGenerateBrandKnowledgeBase,
  onOpenKnowledgeScenes,
  onOpenInputSources,
}: BrandKnowledgeModuleProps) {
  const feature = V2_FEATURES['knowledge-brand'];
  const [agentMessage, setAgentMessage] = useState('请基于当前品牌资料和知识库版本，检查卖点、合规边界和下一步场景库生成建议。');
  const activeSourceLabel = activeKnowledgeBase ? `${activeKnowledgeBase.title} · ${baseLabel(activeKnowledgeBase.baseType)}` : '当前未选知识库';
  const hasSource = citationCount > 0;
  const hasBrandKnowledge = activeBrandKnowledgeBase?.status === 'ready';
  const relatedAgentSessions = useMemo(
    () => agentPromptSessions.filter((session) => (
      session.title.includes('品牌知识库 Agent') ||
      session.title.includes('品牌知识库协作') ||
      session.userIntent.includes('品牌知识库 Agent') ||
      session.userIntent.includes('品牌知识库协作') ||
      (activeBrandKnowledgeBase ? session.userIntent.includes(activeBrandKnowledgeBase.id) || session.userIntent.includes(activeBrandKnowledgeBase.title) : false)
    )),
    [activeBrandKnowledgeBase, agentPromptSessions],
  );
  const activeAgentSession =
    relatedAgentSessions.find((session) => session.id === activeAgentPromptSessionId) ??
    relatedAgentSessions[0];
  const agentSteps: AgentExecutionStep[] = [
    {
      key: 'source',
      title: '选资料',
      detail: hasSource ? `已选 ${citationCount} 条可追溯来源` : '先补充产品资料、评论或知识库章节',
      state: hasSource ? 'done' : 'active',
    },
    {
      key: 'extract',
      title: '抽事实',
      detail: '抽取品牌口吻、受众、卖点和合规边界',
      state: hasBrandKnowledge ? 'done' : hasSource ? 'active' : 'blocked',
    },
    {
      key: 'scene',
      title: '场景库',
      detail: '确认知识库后生成可生产的场景卡',
      state: hasBrandKnowledge ? 'active' : 'idle',
    },
    {
      key: 'handoff',
      title: '提示词组',
      detail: '场景确认后交给图片 / 视频 Prompt',
      state: 'idle',
    },
  ];

  const agentContext = (
    <div className="knowledge-agent-context-grid">
      <article>
        <span>当前输入</span>
        <strong>{activeSourceLabel}</strong>
        <small>{hasSource ? `${citationCount} 条来源可用于抽取` : '没有可用来源，Agent 不会编造品牌事实'}</small>
      </article>
      <article>
        <span>业务对象</span>
        <strong>{activeBrandKnowledgeBase?.title ?? '品牌 / 产品知识库'}</strong>
        <small>{hasBrandKnowledge ? '已形成可审核的知识库版本' : '等待从真实资料中抽取'}</small>
      </article>
      <article>
        <span>交付去向</span>
        <strong>{'场景库 -> Prompt 组'}</strong>
        <small>不从知识库直接跳图片生成，先沉淀可复用场景</small>
      </article>
    </div>
  );

  const sourceArtifact = (
    <section className="panel prompt-source-panel knowledge-agent-source">
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">来源</p>
          <h4>资料追溯</h4>
        </div>
        <StatusPill tone={hasSource ? 'ready' : 'blocked'}>{hasSource ? `${citationCount} 条` : '待补'}</StatusPill>
      </div>
      <div className="workflow-run-steps">
        {selectedCitations.map((citation) => (
          <span key={`${citation.knowledgeBaseId}:${citation.sectionId}`}>
            {sectionLabel(citation.sectionType)} · {citation.title}
          </span>
        ))}
        {selectedCitations.length === 0 && citationCount > 0 ? (
          <span className="ready">将使用当前成型知识库 / 输入源的默认引用 {citationCount} 条</span>
        ) : null}
        {!hasSource ? <span className="blocked">请先补充品牌资料或产品输入源</span> : null}
      </div>
    </section>
  );

  const brandArtifact = (
    <section className="panel prompt-editor-panel knowledge-agent-main">
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">产物</p>
          <h4>{activeBrandKnowledgeBase?.title ?? '尚未生成品牌知识库'}</h4>
        </div>
        {activeBrandKnowledgeBase ? <StatusPill tone="ready">已抽取</StatusPill> : <StatusPill tone="idle">待抽取</StatusPill>}
      </div>
      {activeBrandKnowledgeBase ? (
        <div className="brand-kb-detail">
          <label><span>品牌口吻</span><textarea readOnly value={activeBrandKnowledgeBase.brandVoice} /></label>
          <label><span>受众</span><textarea readOnly value={activeBrandKnowledgeBase.audience} /></label>
          <label><span>产品事实</span><textarea readOnly value={activeBrandKnowledgeBase.productFacts.join('\n')} /></label>
          <label><span>核心卖点</span><textarea readOnly value={activeBrandKnowledgeBase.coreSellingPoints.join('\n')} /></label>
          <label><span>合规边界</span><textarea readOnly value={activeBrandKnowledgeBase.complianceBoundaries.join('\n')} /></label>
          <label><span>场景种子</span><textarea readOnly value={activeBrandKnowledgeBase.sceneSeeds.join('\n')} /></label>
          <label><span>提示词片段</span><textarea readOnly value={activeBrandKnowledgeBase.promptFragments.join('\n')} /></label>
        </div>
      ) : (
        <div className="empty-state">选择知识引用后，点击下方主动作生成品牌 / 产品知识库记录。</div>
      )}
    </section>
  );

  const versionArtifact = (
    <aside className="panel prompt-draft-list-panel knowledge-agent-versions">
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">版本</p>
          <h4>品牌知识库版本</h4>
        </div>
      </div>
      <div className="prompt-draft-list">
        {brandKnowledgeBases.map((record) => (
          <SelectableRecordCard
            key={record.id}
            className="prompt-draft-card"
            active={record.id === activeBrandKnowledgeBaseId}
            status={record.status === 'ready' ? '已抽取' : record.status === 'blocked' ? '待配置' : '待确认'}
            statusTone={record.status === 'ready' ? 'ready' : record.status === 'blocked' ? 'blocked' : 'idle'}
            title={record.title}
            meta={record.brandVoice}
            onClick={() => setActiveBrandKnowledgeBaseId(record.id)}
          >
            <small>{clip(record.sceneSeeds.join(' / '), 90)}</small>
          </SelectableRecordCard>
        ))}
        {brandKnowledgeBases.length === 0 ? <div className="empty-state">暂无品牌知识库记录。</div> : null}
      </div>
    </aside>
  );
  const startBrandAgent = () => {
    const trimmed = agentMessage.trim();
    if (!trimmed) return;
    onStartAgentSession({
      title: `${activeBrandKnowledgeBase?.title ?? '品牌 / 产品知识库'} / 品牌知识库协作`,
      purpose: 'content-task',
      userIntent: [
        '品牌知识库协作',
        activeBrandKnowledgeBase ? `当前品牌知识库：${activeBrandKnowledgeBase.title}（${activeBrandKnowledgeBase.id}）` : '当前还没有品牌 / 产品知识库。',
        `当前来源：${activeSourceLabel}；可追溯引用 ${citationCount} 条。`,
        `用户请求：${trimmed}`,
        '请只基于真实来源和已抽取知识库判断卖点、受众、产品事实、合规边界和场景库下一步；缺资料时明确追问，不要编造品牌事实。',
      ].filter(Boolean).join('\n'),
      inputSourceIds,
      textModel,
    });
  };
  const continueBrandAgent = () => {
    const trimmed = agentMessage.trim();
    if (!activeAgentSession || !trimmed) return;
    onContinueAgentSession({ sessionId: activeAgentSession.id, message: trimmed, textModel });
  };

  return (
    <section className="knowledge-brand-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="compact"
        actions={(
          <div className="v2-feature-actions">
            <StatusPill tone={brandKnowledgeBases.length ? 'ready' : 'idle'}>{brandKnowledgeBases.length} 条记录</StatusPill>
            <StatusPill tone={hasSource ? 'ready' : 'blocked'}>{hasSource ? '来源可用' : '缺少来源'}</StatusPill>
          </div>
        )}
      />

      <AgentSessionPanel
        eyebrow="知识助手"
        title={activeBrandKnowledgeBase?.title ?? '品牌知识库协作'}
        session={activeAgentSession}
        sessions={relatedAgentSessions}
        transcriptLabel={activeAgentSession ? activeAgentSession.title : hasBrandKnowledge ? '品牌知识库抽取结果' : '等待抽取品牌知识库'}
        statusLabel={activeAgentSession ? AGENT_SESSION_STATUS_LABELS[activeAgentSession.status] : hasBrandKnowledge ? '已抽取' : hasSource ? '待抽取' : '缺少来源'}
        statusTone={activeAgentSession ? agentSessionTone(activeAgentSession.status) : hasBrandKnowledge ? 'ready' : hasSource ? 'idle' : 'blocked'}
        steps={agentSteps}
        runningLabel={busy ? '正在处理当前品牌 / 产品知识库任务' : undefined}
        context={agentContext}
        artifact={(
          <div className="knowledge-agent-artifact">
            {sourceArtifact}
            {brandArtifact}
            {versionArtifact}
          </div>
        )}
        footer={(
          <>
            <label className="prompt-session-adjustment knowledge-agent-composer">
              <span>{activeAgentSession ? '继续对话' : '知识库要求'}</span>
              <textarea value={agentMessage} onChange={(event) => setAgentMessage(event.target.value)} />
            </label>
            <ActionGroup align="left" className="knowledge-agent-actions">
              {activeAgentSession ? (
                <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim()} onClick={continueBrandAgent}>
                  继续会话
                </button>
              ) : (
                <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim()} onClick={startBrandAgent}>
                  开始判断
                </button>
              )}
              <button className="ghost small" disabled={!workspaceReady || busy} onClick={onOpenInputSources}>补充输入源</button>
              <button className={hasBrandKnowledge ? 'ghost small' : 'primary small'} disabled={!workspaceReady || busy || !hasSource} onClick={onGenerateBrandKnowledgeBase}>
                抽取品牌知识库
              </button>
              <button className={hasBrandKnowledge ? 'primary small' : 'ghost small'} disabled={!workspaceReady || busy || !hasBrandKnowledge} onClick={onOpenKnowledgeScenes}>
                生成场景库
              </button>
            </ActionGroup>
          </>
        )}
        empty={(
          <>
            <strong>等待真实资料</strong>
            <span>补充输入源后，将基于来源抽取品牌事实和合规边界。</span>
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
