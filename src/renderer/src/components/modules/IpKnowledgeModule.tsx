import { useMemo, useState } from 'react';
import type {
  AgentPromptSession,
  InputSourceRecord,
  IpKnowledgeBaseRecord,
  KnowledgeBaseView,
  KnowledgeCitation,
  PromptDraft,
  PromptDraftPurpose,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { baseLabel, clip, sectionLabel } from '../../app/formatters';
import { AgentSessionPanel, type AgentActionResolver, type AgentExecutionStep } from '../agent/AgentSessionPanel';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { ActionGroup, SelectableRecordCard, StatusPill } from '../WorkbenchPrimitives';

interface IpKnowledgeModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  activeKnowledgeBase?: KnowledgeBaseView;
  selectedCitations: KnowledgeCitation[];
  citationCount: number;
  inputSources: InputSourceRecord[];
  ipKnowledgeBases: IpKnowledgeBaseRecord[];
  promptDrafts: PromptDraft[];
  activeIpKnowledgeBase?: IpKnowledgeBaseRecord;
  activeIpKnowledgeBaseId: string;
  setActiveIpKnowledgeBaseId: (recordId: string) => void;
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
  onGenerateIpKnowledgeBase: () => void;
  onCreateScenarioPrompt: (scene: string) => void;
  onOpenPromptDraft: (draftId: string) => void;
  onOpenKnowledgeScenes: () => void;
  onOpenPromptWorkbench: () => void;
}

const IP_LAYER_LABELS: Record<string, string> = {
  identity: '身份锚定层',
  values: '价值观与立场层',
  language: '声音与语言质感层',
  methodology: '判断力与决策逻辑层',
  materials: '内容素材库层',
  engine: '内容创作引擎层',
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

function sceneUsageLabel(scene: string): string {
  if (/口播|视频|抖音|视频号/.test(scene)) return '口播脚本';
  if (/朋友圈|私域|社群|回复/.test(scene)) return '私域内容';
  if (/产品|付费|转化|销售/.test(scene)) return '产品化转化';
  if (/咨询|问答|回复/.test(scene)) return '咨询回复';
  return '内容场景';
}

function draftStatusLabel(draft?: PromptDraft): string {
  if (!draft) return '未生成';
  if (draft.status === 'confirmed') return '已确认';
  if (draft.status === 'materialized') return '已沉淀';
  if (draft.status === 'archived') return '已归档';
  return '草稿';
}

function draftStatusTone(draft?: PromptDraft): 'ready' | 'idle' | 'blocked' {
  if (!draft) return 'idle';
  if (draft.status === 'confirmed' || draft.status === 'materialized') return 'ready';
  if (draft.status === 'archived') return 'blocked';
  return 'idle';
}

function promptPurposeLabel(purpose: PromptDraft['purpose']): string {
  const labels: Record<PromptDraft['purpose'], string> = {
    image: '图片提示词',
    video: '视频提示词',
    article: '文案提示词',
    'green-screen': '绿幕文案图提示词',
    'content-task': '内容任务',
    skill: '技能提示词',
    sop: '流程提示词',
  };
  return labels[purpose] ?? '提示词';
}

function sourceMatchesScene(source: InputSourceRecord, record: IpKnowledgeBaseRecord, scene: string): boolean {
  return source.purpose === 'ip-scenario-kb'
    && source.tags.includes(record.id)
    && (
      source.tags.includes(scene) ||
      source.title.includes(scene) ||
      source.summary?.includes(scene) ||
      false
    );
}

function draftMatchesScene(draft: PromptDraft, record: IpKnowledgeBaseRecord, scene: string, source?: InputSourceRecord): boolean {
  if (source && draft.inputSourceIds.includes(source.id)) return true;
  return draft.title.startsWith(`${record.title} / ${scene}`);
}

export function IpKnowledgeModule({
  workspaceReady,
  busy,
  activeKnowledgeBase,
  selectedCitations,
  citationCount,
  inputSources,
  ipKnowledgeBases,
  promptDrafts,
  activeIpKnowledgeBase,
  activeIpKnowledgeBaseId,
  setActiveIpKnowledgeBaseId,
  agentPromptSessions,
  activeAgentPromptSessionId,
  textModel,
  onSelectAgentSession,
  onResolveAgentAction,
  onStartAgentSession,
  onContinueAgentSession,
  onGenerateIpKnowledgeBase,
  onCreateScenarioPrompt,
  onOpenPromptDraft,
  onOpenKnowledgeScenes,
  onOpenPromptWorkbench,
}: IpKnowledgeModuleProps) {
  const feature = V2_FEATURES['knowledge-ip'];
  const [agentMessage, setAgentMessage] = useState('请检查当前 IP 六层知识库的缺口、语气一致性和场景延伸优先级。');
  const activeSourceLabel = activeKnowledgeBase ? `${activeKnowledgeBase.title} · ${baseLabel(activeKnowledgeBase.baseType)}` : '当前未选知识库';
  const hasSource = citationCount > 0;
  const hasIpKnowledge = Boolean(activeIpKnowledgeBase);
  const hasMissingLayers = Boolean(activeIpKnowledgeBase?.missingLayers.length);
  const scenarioExtensions = activeIpKnowledgeBase
    ? activeIpKnowledgeBase.extensionScenes.map((scene) => {
      const source = inputSources.find((item) => sourceMatchesScene(item, activeIpKnowledgeBase, scene));
      const draft = promptDrafts.find((item) => draftMatchesScene(item, activeIpKnowledgeBase, scene, source));
      return { scene, source, draft };
    })
    : [];
  const generatedScenarioCount = scenarioExtensions.filter((item) => item.source || item.draft).length;
  const extensionDrafts = activeIpKnowledgeBase
    ? promptDrafts
      .filter((draft) =>
        activeIpKnowledgeBase.extensionScenes.some((scene) =>
          draft.title.startsWith(`${activeIpKnowledgeBase.title} / ${scene}`),
        ),
      )
      .slice(0, 8)
    : [];
  const relatedAgentSessions = useMemo(
    () => agentPromptSessions.filter((session) => (
      session.title.includes('IP 知识库 Agent') ||
      session.title.includes('IP 知识库协作') ||
      session.userIntent.includes('IP 知识库 Agent') ||
      session.userIntent.includes('IP 知识库协作') ||
      (activeIpKnowledgeBase ? session.userIntent.includes(activeIpKnowledgeBase.id) || session.userIntent.includes(activeIpKnowledgeBase.title) : false)
    )),
    [activeIpKnowledgeBase, agentPromptSessions],
  );
  const activeAgentSession =
    relatedAgentSessions.find((session) => session.id === activeAgentPromptSessionId) ??
    relatedAgentSessions[0];
  const agentInputSourceIds = activeIpKnowledgeBase
    ? Array.from(new Set([
      ...inputSources
        .filter((source) => source.tags.includes(activeIpKnowledgeBase.id) || source.title.includes(activeIpKnowledgeBase.title))
        .map((source) => source.id),
      ...scenarioExtensions.flatMap((item) => item.source ? [item.source.id] : []),
    ])).slice(0, 8)
    : inputSources
      .filter((source) => source.purpose === 'ip-kb' || source.purpose === 'ip-scenario-kb')
      .slice(0, 8)
      .map((source) => source.id);
  const agentSteps: AgentExecutionStep[] = [
    {
      key: 'materials',
      title: '导入素材',
      detail: hasSource ? `已选 ${citationCount} 条 IP 来源` : '先导入访谈、旧文案、课程大纲或产品资料',
      state: hasSource ? 'done' : 'active',
    },
    {
      key: 'layers',
      title: '构建六层',
      detail: '身份、价值观、语言、方法论、素材和创作引擎',
      state: hasIpKnowledge ? 'done' : hasSource ? 'active' : 'blocked',
    },
    {
      key: 'gaps',
      title: '补缺口',
      detail: hasMissingLayers ? activeIpKnowledgeBase?.missingLayers.join('、') : '缺口会在产物中明确标出',
      state: hasIpKnowledge ? (hasMissingLayers ? 'active' : 'done') : 'idle',
    },
    {
      key: 'extend',
      title: '场景延伸',
      detail: `${generatedScenarioCount}/${scenarioExtensions.length} 个场景已生成`,
      state: hasIpKnowledge ? (generatedScenarioCount ? 'done' : 'active') : 'idle',
    },
  ];

  const agentContext = (
    <div className="knowledge-agent-context-grid">
      <article>
        <span>当前输入</span>
        <strong>{activeSourceLabel}</strong>
        <small>{hasSource ? `${citationCount} 条来源可用于构建 IP 底座` : '没有真实来源，Agent 不会编造人设'}</small>
      </article>
      <article>
        <span>业务对象</span>
        <strong>{activeIpKnowledgeBase?.title ?? '个人 IP 六层知识库'}</strong>
        <small>{activeIpKnowledgeBase ? `完整度 ${activeIpKnowledgeBase.completeness}%` : '等待从原始素材构建'}</small>
      </article>
      <article>
        <span>交付去向</span>
        <strong>{'场景延伸库 -> agents'}</strong>
        <small>口播、私域、产品化和咨询回复引用同一 IP 版本</small>
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
        {!hasSource ? <span className="blocked">请先补充 IP 原始素材或知识库章节</span> : null}
      </div>
    </section>
  );

  const ipArtifact = (
    <section className="panel prompt-editor-panel knowledge-agent-main">
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">产物</p>
          <h4>{activeIpKnowledgeBase?.title ?? '尚未生成 IP 知识库'}</h4>
        </div>
        {activeIpKnowledgeBase ? (
          <StatusPill tone="ready">已构建 · {activeIpKnowledgeBase.completeness}%</StatusPill>
        ) : (
          <StatusPill tone="idle">待构建</StatusPill>
        )}
      </div>
      {activeIpKnowledgeBase ? (
        <div className="brand-kb-detail">
          {Object.entries(activeIpKnowledgeBase.layers).map(([key, value]) => (
            <label key={key}>
              <span>{IP_LAYER_LABELS[key] ?? key}</span>
              <textarea readOnly value={value} />
            </label>
          ))}
          <label><span>缺口</span><textarea readOnly value={activeIpKnowledgeBase.missingLayers.join('\n') || '无'} /></label>
          <label><span>场景延伸</span><textarea readOnly value={activeIpKnowledgeBase.extensionScenes.join('\n')} /></label>
          <div className="ip-scenario-library-panel">
            <div className="panel-title compact">
              <div>
                <p className="eyebrow">场景延伸库</p>
                <h4>IP 运营场景库</h4>
              </div>
              <StatusPill tone={generatedScenarioCount ? 'ready' : 'idle'}>
                {generatedScenarioCount}/{scenarioExtensions.length} 已生成
              </StatusPill>
            </div>
            <div className="ip-scenario-library-grid">
              {scenarioExtensions.map(({ scene, source, draft }) => (
                <article key={scene} className={`ip-scenario-card ${source || draft ? 'ready' : 'idle'}`}>
                  <div className="ip-scenario-card-head">
                    <div>
                      <span>{sceneUsageLabel(scene)}</span>
                      <strong>{scene}</strong>
                    </div>
                    <StatusPill tone={draftStatusTone(draft)}>{draftStatusLabel(draft)}</StatusPill>
                  </div>
                  <p>{source?.summary ?? `基于「${activeIpKnowledgeBase.title}」六层知识库延伸，不允许改写成人设漂移。`}</p>
                  <div className="ip-scenario-lineage">
                    <span>已关联同一 IP 知识库版本</span>
                    <span>{source ? '延伸知识库已生成' : '待生成延伸知识库'}</span>
                    <span>{draft ? `提示词 ${draft.versions.length} 个版本` : '待生成提示词'}</span>
                  </div>
                  <div className="ip-scenario-actions">
                    <button
                      className={draft ? 'ghost small' : 'primary small'}
                      disabled={!workspaceReady || busy}
                      onClick={() => onCreateScenarioPrompt(scene)}
                    >
                      {draft ? '重新生成' : '生成延伸库'}
                    </button>
                    {draft ? (
                      <button className="primary small" onClick={() => onOpenPromptDraft(draft.id)}>
                        打开提示词
                      </button>
                    ) : null}
                  </div>
                </article>
              ))}
              {scenarioExtensions.length === 0 ? (
                <div className="empty-state">当前 IP 知识库没有可延伸场景。请先补充 IP 运营场景。</div>
              ) : null}
            </div>
          </div>
          <div className="ip-extension-draft-panel">
            <div className="panel-title compact">
              <div>
                <p className="eyebrow">场景延伸结果</p>
                <h4>已生成的 IP 场景提示词</h4>
              </div>
              <StatusPill tone={extensionDrafts.length ? 'ready' : 'idle'}>{extensionDrafts.length} 个</StatusPill>
            </div>
            <div className="ip-extension-draft-list">
              {extensionDrafts.map((draft) => (
                <button
                  key={draft.id}
                  type="button"
                  className="record-card prompt-draft-card"
                  onClick={() => onOpenPromptDraft(draft.id)}
                >
                  <StatusPill tone={draft.status === 'confirmed' || draft.status === 'materialized' ? 'ready' : 'idle'}>
                    {draft.status === 'confirmed' ? '已确认' : draft.status === 'materialized' ? '已沉淀' : '草稿'}
                  </StatusPill>
                  <strong>{draft.title}</strong>
                  <small>
                    {promptPurposeLabel(draft.purpose)} · {draft.versions.length} 个版本
                    {draft.workflowRunId ? ' · 已关联历史' : ''}
                  </small>
                </button>
              ))}
              {extensionDrafts.length === 0 ? (
                <div className="empty-state">还没有场景延伸提示词。先点击上方口播、私域、产品化等场景按钮生成。</div>
              ) : null}
            </div>
          </div>
        </div>
      ) : (
        <div className="empty-state">选择知识引用后，点击下方主动作生成 IP 六层知识库记录。</div>
      )}
    </section>
  );

  const versionArtifact = (
    <aside className="panel prompt-draft-list-panel knowledge-agent-versions">
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">版本</p>
          <h4>IP 知识库版本</h4>
        </div>
      </div>
      <div className="prompt-draft-list">
        {ipKnowledgeBases.map((record) => (
          <SelectableRecordCard
            key={record.id}
            className="prompt-draft-card"
            active={record.id === activeIpKnowledgeBaseId}
            status={record.status === 'ready' ? '已构建' : '待确认'}
            statusTone={record.status === 'ready' ? 'ready' : 'idle'}
            title={record.title}
            meta={`完整度 ${record.completeness}%`}
            onClick={() => setActiveIpKnowledgeBaseId(record.id)}
          >
            <small>{clip(record.extensionScenes.join(' / '), 90)}</small>
          </SelectableRecordCard>
        ))}
        {ipKnowledgeBases.length === 0 ? <div className="empty-state">暂无 IP 知识库记录。</div> : null}
      </div>
    </aside>
  );
  const startIpAgent = () => {
    const trimmed = agentMessage.trim();
    if (!trimmed) return;
    onStartAgentSession({
      title: `${activeIpKnowledgeBase?.title ?? 'IP 知识库'} / IP 知识库协作`,
      purpose: 'content-task',
      userIntent: [
        'IP 知识库协作',
        activeIpKnowledgeBase ? `当前 IP 知识库：${activeIpKnowledgeBase.title}（${activeIpKnowledgeBase.id}）` : '当前还没有 IP 知识库。',
        activeIpKnowledgeBase ? `完整度：${activeIpKnowledgeBase.completeness}%；缺口：${activeIpKnowledgeBase.missingLayers.join('、') || '无'}。` : '',
        `当前来源：${activeSourceLabel}；可追溯引用 ${citationCount} 条。`,
        `用户请求：${trimmed}`,
        '请只基于真实 IP 原始素材、六层知识库和场景延伸记录判断；需要补素材时明确追问，不要改写成人设漂移。',
      ].filter(Boolean).join('\n'),
      inputSourceIds: agentInputSourceIds,
      textModel,
    });
  };
  const continueIpAgent = () => {
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
            <StatusPill tone={ipKnowledgeBases.length ? 'ready' : 'idle'}>{ipKnowledgeBases.length} 条记录</StatusPill>
            <StatusPill tone={hasSource ? 'ready' : 'blocked'}>{hasSource ? '来源可用' : '缺少来源'}</StatusPill>
          </div>
        )}
      />

      <AgentSessionPanel
        eyebrow="IP 助手"
        title={activeIpKnowledgeBase?.title ?? 'IP 知识库协作'}
        session={activeAgentSession}
        sessions={relatedAgentSessions}
        transcriptLabel={activeAgentSession ? activeAgentSession.title : hasIpKnowledge ? 'IP 知识库构建结果' : '等待构建 IP 知识库'}
        statusLabel={activeAgentSession ? AGENT_SESSION_STATUS_LABELS[activeAgentSession.status] : hasIpKnowledge ? `完整度 ${activeIpKnowledgeBase?.completeness ?? 0}%` : hasSource ? '待构建' : '缺少来源'}
        statusTone={activeAgentSession ? agentSessionTone(activeAgentSession.status) : hasIpKnowledge ? 'ready' : hasSource ? 'idle' : 'blocked'}
        steps={agentSteps}
        runningLabel={busy ? '正在处理当前 IP 知识库任务' : undefined}
        context={agentContext}
        artifact={(
          <div className="knowledge-agent-artifact">
            {sourceArtifact}
            {ipArtifact}
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
                <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim()} onClick={continueIpAgent}>
                  继续会话
                </button>
              ) : (
                <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim()} onClick={startIpAgent}>
                  开始判断
                </button>
              )}
              <button className={hasIpKnowledge ? 'ghost small' : 'primary small'} disabled={!workspaceReady || busy || !hasSource} onClick={onGenerateIpKnowledgeBase}>
                构建 IP 知识库
              </button>
              <button className={hasIpKnowledge ? 'primary small' : 'ghost small'} disabled={!workspaceReady || busy || !hasIpKnowledge} onClick={onOpenKnowledgeScenes}>
                生成场景延伸库
              </button>
              <button className="ghost small" disabled={!workspaceReady || busy} onClick={onOpenPromptWorkbench}>
                {generatedScenarioCount ? '查看场景延伸库' : '进入 agents'}
              </button>
            </ActionGroup>
          </>
        )}
        empty={(
          <>
            <strong>等待真实素材</strong>
            <span>导入 IP 原始素材后，Agent 会构建六层知识库并标出缺口。</span>
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
