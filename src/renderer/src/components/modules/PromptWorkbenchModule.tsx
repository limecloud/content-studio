import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey, V2ModuleKey } from '../../app/types';
import type {
  AgentPromptSession,
  InputSourceRecord,
  PromptDraft,
  PromptDraftPurpose,
  PromptDraftStatus,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { ActionGroup, SelectableRecordCard, StatusPill, type StatusPillTone } from '../WorkbenchPrimitives';

interface PromptWorkbenchModuleProps {
  featureKey?: V2ModuleKey;
  initialPurpose?: PromptDraftPurpose;
  initialTitle?: string;
  initialUserIntent?: string;
  workspaceReady: boolean;
  busy: boolean;
  inputSources: InputSourceRecord[];
  promptDrafts: PromptDraft[];
  agentPromptSessions: AgentPromptSession[];
  activeDraftId: string;
  activeSessionId: string;
  onSelectDraft: (draftId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onGenerateDraft: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
  }) => void;
  onStartSession: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    sceneCardIds?: string[];
  }) => void;
  onContinueSession: (input: {
    sessionId: string;
    message: string;
  }) => void;
  onUpdateDraft: (input: {
    draftId: string;
    content: string;
    note?: string;
    confirm?: boolean;
  }) => void;
  onUsePromptInImage: (prompt: string, sceneCardIds?: string[]) => void;
  onOpenVideoPrompt: (draftId: string) => void;
  onUsePromptInArticle: (draftId: string, prompt: string) => void;
  onOpenGreenScreen: (draftId: string) => void;
  onMaterializeDraftToSop: (input: { draftId: string; content: string }) => void;
  onMaterializeDraftToSkill: (input: { draftId: string; content: string }) => void;
  onSelectModule: (module: ModuleKey) => void;
}

const PURPOSE_OPTIONS: Array<{ value: PromptDraftPurpose; label: string }> = [
  { value: 'image', label: '图片 Prompt' },
  { value: 'video', label: '视频 Prompt' },
  { value: 'article', label: '文案 Prompt' },
  { value: 'green-screen', label: '绿幕文案图' },
  { value: 'sop', label: 'SOP 草案' },
  { value: 'skill', label: 'Skill 草案' },
];

const PURPOSE_LABELS = Object.fromEntries(
  PURPOSE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<PromptDraftPurpose, string>;

const PURPOSE_DEFAULTS: Record<PromptDraftPurpose, { title: string; userIntent: string }> = {
  image: {
    title: '图片 Prompt 草稿',
    userIntent: '根据产品资料和参考图，生成自然真实的小红书种草图 Prompt。',
  },
  video: {
    title: '视频 Prompt 草稿',
    userIntent: '生成可复制到第三方视频平台的 15 秒素材 Prompt，只记录 Prompt，不创建外部任务。',
  },
  article: {
    title: '文案 Prompt 草稿',
    userIntent: '基于知识库、用户意图和平台要求生成可追溯的文案 Prompt。',
  },
  'green-screen': {
    title: '绿幕文案图 Prompt 草稿',
    userIntent: '生成适合拆成标题卡、卖点卡、金句卡和 CTA 卡的绿幕文案图 Prompt。',
  },
  sop: {
    title: 'SOP 草案',
    userIntent: '把已跑通的方法整理为可发布运行的 SOP 草案，补齐输入、步骤、审核和导出规则。',
  },
  skill: {
    title: 'Skill 草案',
    userIntent: '把稳定的 Prompt 编排方法沉淀为本地 skill，写清输入、输出、事实边界和执行规范。',
  },
};

const STATUS_LABELS: Record<PromptDraftStatus, string> = {
  draft: '草稿',
  confirmed: '已确认',
  materialized: '已物化',
  archived: '归档',
};

function statusClass(status: PromptDraftStatus): StatusPillTone {
  if (status === 'confirmed' || status === 'materialized') return 'ready';
  if (status === 'archived') return 'blocked';
  return 'idle';
}

function modelStatusClass(model?: string): StatusPillTone {
  if (!model) return 'idle';
  if (model.startsWith('blocked:') || model.startsWith('fallback:')) return 'blocked';
  return 'ready';
}

function modelLabel(model?: string): string {
  if (!model) return '模型未记录';
  if (model === 'blocked:text-provider') return '文字模型未配置';
  if (model === 'fallback:local-rule') return '本地降级草稿';
  return model;
}

function sessionStatusClass(status: AgentPromptSession['status']): StatusPillTone {
  if (status === 'blocked') return 'blocked';
  if (status === 'draft-created' || status === 'active') return 'ready';
  if (status === 'waiting-user') return 'idle';
  return 'blocked';
}

function activeContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function sourceTitle(source: InputSourceRecord): string {
  return `${source.title} · ${source.kind}/${source.status}`;
}

export function PromptWorkbenchModule({
  featureKey = 'assets-prompt-workbench',
  initialPurpose = 'image',
  initialTitle = '图片 Prompt 草稿',
  initialUserIntent = '根据产品资料和参考图，生成自然真实的小红书种草图 Prompt。',
  workspaceReady,
  busy,
  inputSources,
  promptDrafts,
  agentPromptSessions,
  activeDraftId,
  activeSessionId,
  onSelectDraft,
  onSelectSession,
  onGenerateDraft,
  onStartSession,
  onContinueSession,
  onUpdateDraft,
  onUsePromptInImage,
  onOpenVideoPrompt,
  onUsePromptInArticle,
  onOpenGreenScreen,
  onMaterializeDraftToSop,
  onMaterializeDraftToSkill,
  onSelectModule,
}: PromptWorkbenchModuleProps) {
  const feature = V2_FEATURES[featureKey];
  const [purpose, setPurpose] = useState<PromptDraftPurpose>(initialPurpose);
  const [title, setTitle] = useState(initialTitle);
  const [userIntent, setUserIntent] = useState(initialUserIntent);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const visibleDrafts = useMemo(
    () => promptDrafts.filter((draft) => draft.purpose === purpose),
    [promptDrafts, purpose],
  );
  const activeDraft =
    visibleDrafts.find((draft) => draft.id === activeDraftId) ??
    visibleDrafts[0];
  const visibleSessions = useMemo(
    () => agentPromptSessions.filter((session) =>
      session.purpose === purpose ||
      (activeDraft ? session.promptDraftIds.includes(activeDraft.id) : false),
    ),
    [activeDraft, agentPromptSessions, purpose],
  );
  const activeSession =
    visibleSessions.find((session) => session.id === activeSessionId) ??
    visibleSessions.find((session) => activeDraft?.id && session.promptDraftIds.includes(activeDraft.id)) ??
    visibleSessions[0];
  const [draftContent, setDraftContent] = useState(activeContent(activeDraft));
  const [sessionAdjustment, setSessionAdjustment] = useState('请结合用户意图继续收紧文案结构，并补充合规提醒。');
  const selectedSources = useMemo(
    () => inputSources.filter((source) => selectedSourceIds.includes(source.id)),
    [inputSources, selectedSourceIds],
  );

  useEffect(() => {
    setDraftContent(activeContent(activeDraft));
  }, [activeDraft?.id, activeDraft?.activeVersionId]);

  useEffect(() => {
    setPurpose(initialPurpose);
    setTitle(initialTitle);
    setUserIntent(initialUserIntent);
  }, [featureKey, initialPurpose, initialTitle, initialUserIntent]);

  useEffect(() => {
    if (selectedSourceIds.length || inputSources.length === 0) return;
    setSelectedSourceIds(inputSources.slice(0, 3).map((source) => source.id));
  }, [inputSources, selectedSourceIds.length]);

  const canGenerate = workspaceReady && !busy && userIntent.trim().length > 0;
  const canStartSession = canGenerate;
  const canSave = workspaceReady && !busy && Boolean(activeDraft) && draftContent.trim().length > 0;
  const canUseCurrentDraft = canSave && Boolean(activeDraft);
  const hasAgentSessionPanel = visibleSessions.length > 0 || Boolean(activeSession);
  const activePurpose = activeDraft?.purpose ?? purpose;

  function changePurpose(nextPurpose: PromptDraftPurpose): void {
    setPurpose(nextPurpose);
    setTitle(PURPOSE_DEFAULTS[nextPurpose].title);
    setUserIntent(PURPOSE_DEFAULTS[nextPurpose].userIntent);
  }

  return (
    <section className="prompt-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="compact"
        actions={(
          <div className="workflow-summary-stack">
            <StatusPill>{visibleDrafts.length} 个{PURPOSE_LABELS[purpose]}草稿</StatusPill>
            <StatusPill tone="ready">{visibleDrafts.filter((draft) => draft.status === 'confirmed').length} 个已确认</StatusPill>
            <StatusPill tone="ready">{inputSources.filter((source) => source.status === 'converted').length} 个已解析输入源</StatusPill>
          </div>
        )}
      />

      <div className="prompt-workbench-layout">
        <aside className="panel prompt-source-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">输入</p>
              <h3>输入源 + 用户意图</h3>
            </div>
          </div>
          <div className="workflow-form-grid">
            <label>
              <span>用途</span>
              <select value={purpose} onChange={(event) => changePurpose(event.target.value as PromptDraftPurpose)}>
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
              <span>用户意图</span>
              <textarea value={userIntent} onChange={(event) => setUserIntent(event.target.value)} />
            </label>
          </div>
          <div className="prompt-source-list">
            {inputSources.map((source) => (
              <label key={source.id} className="prompt-source-option">
                <input
                  type="checkbox"
                  checked={selectedSourceIds.includes(source.id)}
                  onChange={(event) => {
                    setSelectedSourceIds((current) =>
                      event.target.checked
                        ? [...current, source.id].slice(0, 8)
                        : current.filter((id) => id !== source.id),
                    );
                  }}
                />
                <span>
                  <strong>{sourceTitle(source)}</strong>
                  <small>{source.summary ?? source.blockedReason ?? '未记录摘要'}</small>
                  {source.markdownPath ? <small>Markdown：{source.markdownPath}</small> : null}
                </span>
              </label>
            ))}
            {inputSources.length === 0 ? (
              <div className="empty-state">还没有输入源。先到“输入源 / 文档转换”登记用户意图、产品资料或参考素材。</div>
            ) : null}
          </div>
          <ActionGroup align="left">
            <button
              className="primary small"
              disabled={!canStartSession}
              onClick={() => onStartSession({ title, purpose, userIntent, inputSourceIds: selectedSourceIds })}
            >
              启动 Agent 会话
            </button>
            <button
              className="ghost small"
              disabled={!canGenerate}
              onClick={() => onGenerateDraft({ title, purpose, userIntent, inputSourceIds: selectedSourceIds })}
            >
              仅生成草稿
            </button>
            <button className="ghost small" onClick={() => onSelectModule('knowledge-inputs')}>补输入源</button>
          </ActionGroup>
        </aside>

        <main className="panel prompt-editor-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">PromptDraft</p>
              <h3>{activeDraft?.title ?? '尚未生成草稿'}</h3>
            </div>
            {activeDraft ? (
              <div className="workflow-summary-stack compact">
                <StatusPill tone={statusClass(activeDraft.status)}>{STATUS_LABELS[activeDraft.status]}</StatusPill>
                <StatusPill tone={modelStatusClass(activeDraft.model)}>{modelLabel(activeDraft.model)}</StatusPill>
              </div>
            ) : null}
          </div>
          {activeDraft ? (
            <>
              <textarea
                className="prompt-draft-editor"
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
              />
              <ActionGroup align="left">
                <button
                  className="ghost small"
                  disabled={!canSave}
                  onClick={() => onUpdateDraft({ draftId: activeDraft.id, content: draftContent, note: '人工保存版本' })}
                >
                  保存新版本
                </button>
                <button
                  className="primary small"
                  disabled={!canSave}
                  onClick={() => onUpdateDraft({ draftId: activeDraft.id, content: draftContent, note: '确认可下游使用', confirm: true })}
                >
                  确认 Prompt
                </button>
                {activePurpose === 'image' ? (
                  <button
                    className="ghost small"
                    disabled={!canUseCurrentDraft}
                    onClick={() => activeDraft && onUsePromptInImage(draftContent, activeDraft.sceneCardIds)}
                  >
                    发送到图片
                  </button>
                ) : null}
                {activePurpose === 'video' ? (
                  <button
                    className="ghost small"
                    disabled={!canUseCurrentDraft}
                    onClick={() => activeDraft && onOpenVideoPrompt(activeDraft.id)}
                  >
                    打开视频 Prompt
                  </button>
                ) : null}
                {activePurpose === 'article' ? (
                  <button
                    className="ghost small"
                    disabled={!canUseCurrentDraft}
                    onClick={() => activeDraft && onUsePromptInArticle(activeDraft.id, draftContent)}
                  >
                    进入文章生成
                  </button>
                ) : null}
                {activePurpose === 'green-screen' ? (
                  <button
                    className="ghost small"
                    disabled={!canUseCurrentDraft}
                    onClick={() => activeDraft && onOpenGreenScreen(activeDraft.id)}
                  >
                    生成绿幕图
                  </button>
                ) : null}
                {activePurpose !== 'skill' ? (
                  <button
                    className="ghost small"
                    disabled={!canUseCurrentDraft}
                    onClick={() => activeDraft && onMaterializeDraftToSop({ draftId: activeDraft.id, content: draftContent })}
                  >
                    物化为 SOP
                  </button>
                ) : null}
                {activePurpose === 'skill' ? (
                  <button
                    className="ghost small"
                    disabled={!canUseCurrentDraft}
                    onClick={() => activeDraft && onMaterializeDraftToSkill({ draftId: activeDraft.id, content: draftContent })}
                  >
                    物化为 Skill
                  </button>
                ) : null}
              </ActionGroup>
              <div className="inline-warning subtle">
                当前只显示「{PURPOSE_LABELS[activePurpose]}」可执行动作，避免草稿被送到不匹配的下游。
              </div>
              <div className="prompt-version-list">
                {activeDraft.versions.map((version) => (
                  <article key={version.id} className={version.id === activeDraft.activeVersionId ? 'active' : ''}>
                    <strong>v{version.version}</strong>
                    <span>{new Date(version.createdAt).toLocaleString()}</span>
                    <small>{version.note ?? '未记录说明'}</small>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">选择输入源并填写用户意图后，生成第一个 Prompt 草稿。</div>
          )}
        </main>

        <aside className="panel prompt-draft-list-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">版本库</p>
              <h3>草稿列表</h3>
            </div>
          </div>
          <div className="prompt-draft-list">
            {visibleDrafts.map((draft) => (
              <SelectableRecordCard
                key={draft.id}
                className="prompt-draft-card"
                active={draft.id === activeDraft?.id}
                status={STATUS_LABELS[draft.status]}
                statusTone={statusClass(draft.status)}
                title={draft.title}
                meta={`${draft.purpose} · ${draft.versions.length} 个版本 · ${modelLabel(draft.model)}`}
                onClick={() => onSelectDraft(draft.id)}
              />
            ))}
            {visibleDrafts.length === 0 ? <div className="empty-state">暂无{PURPOSE_LABELS[purpose]}草稿。</div> : null}
          </div>
        </aside>
      </div>
      {hasAgentSessionPanel ? (
        <section className="panel prompt-session-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Agent 会话</p>
              <h3>{activeSession?.title ?? '尚未启动会话'}</h3>
            </div>
            {activeSession ? (
              <StatusPill tone={sessionStatusClass(activeSession.status)}>
                {activeSession.status}
              </StatusPill>
            ) : null}
          </div>
          <div className="prompt-session-layout">
            <div className="prompt-session-list">
              {visibleSessions.map((session) => (
                <SelectableRecordCard
                  key={session.id}
                  className="prompt-session-card"
                  active={session.id === activeSession?.id}
                  title={session.title}
                  meta={`${session.purpose} · ${session.messages.length} 条消息 · ${session.promptDraftIds.length} 个草稿`}
                  onClick={() => onSelectSession(session.id)}
                />
              ))}
            </div>
            <div className="prompt-session-detail">
              {activeSession ? (
                <>
                  <div className="prompt-session-messages">
                    {activeSession.messages.map((message) => (
                      <article key={message.id} className={`prompt-session-message ${message.role}`}>
                        <div>
                          <strong>{message.role === 'user' ? '用户' : '模型'}</strong>
                          <small>{message.kind} · {new Date(message.createdAt).toLocaleString()}</small>
                        </div>
                        <p>{message.content}</p>
                        {message.model ? (
                          <StatusPill tone={modelStatusClass(message.model)}>
                            {modelLabel(message.model)}
                          </StatusPill>
                        ) : null}
                      </article>
                    ))}
                  </div>
                  <label className="prompt-session-adjustment">
                    <span>继续调整</span>
                    <textarea value={sessionAdjustment} onChange={(event) => setSessionAdjustment(event.target.value)} />
                  </label>
                  <ActionGroup align="left">
                    <button
                      className="primary small"
                      disabled={!workspaceReady || busy || !sessionAdjustment.trim() || !activeSession}
                      onClick={() => activeSession && onContinueSession({ sessionId: activeSession.id, message: sessionAdjustment })}
                    >
                      继续会话
                    </button>
                    <button className="ghost small" disabled={!activeDraft} onClick={() => activeDraft && onSelectDraft(activeDraft.id)}>
                      对齐当前草稿
                    </button>
                  </ActionGroup>
                </>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}
      {selectedSources.length ? (
        <section className="panel prompt-source-footprint">
          <p className="eyebrow">来源追溯</p>
          <div className="workflow-run-steps">
            {selectedSources.map((source) => (
              <span key={source.id}>{source.title}</span>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
