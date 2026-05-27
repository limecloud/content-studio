import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModuleKey, V2ModuleKey } from '../../app/types';
import type {
  AgentPromptSession,
  InputSourceRecord,
  InputSourcePurpose,
  PlatformDraftRecord,
  PromptDraft,
  PromptDraftPurpose,
  PromptDraftStatus,
  LoadedSkill,
  SkillRef,
} from '../../../../shared/types';
import { isClaudeModelName } from '../../../../shared/types';
import { isPromptDistilledSource, isReusablePromptInputSource } from '../../../../shared/inputSourcePolicy';
import { skillKey, textProtocolLabel } from '../../app/formatters';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { PlatformDraftTraceList } from '../PlatformDraftTraceList';
import { UserJourneyGuide, type JourneyAction } from '../UserJourneyGuide';
import { ActionGroup, SelectableRecordCard, StatusPill, type StatusPillTone } from '../WorkbenchPrimitives';

interface PromptWorkbenchModuleProps {
  featureKey?: V2ModuleKey;
  initialPurpose?: PromptDraftPurpose;
  initialTitle?: string;
  initialUserIntent?: string;
  workspaceReady: boolean;
  busy: boolean;
  currentActionLabel?: string | null;
  inputSources: InputSourceRecord[];
  promptDrafts: PromptDraft[];
  platformDrafts: PlatformDraftRecord[];
  copiedPlatformDraftId: string | null;
  agentPromptSessions: AgentPromptSession[];
  skills: LoadedSkill[];
  enabledSkillKeys: Set<string>;
  textModel?: string;
  textModels?: string[];
  activeDraftId: string;
  activeSessionId: string;
  onSelectDraft: (draftId: string) => void;
  onSelectSession: (sessionId: string) => void;
  onGenerateDraft: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    selectedSkills?: SkillRef[];
    selectedSkillSlugs?: string[];
  }) => void;
  onStartSession: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    sceneCardIds?: string[];
    selectedSkills?: SkillRef[];
    selectedSkillSlugs?: string[];
    textModel?: string;
  }) => void;
  onContinueSession: (input: {
    sessionId: string;
    message: string;
    textModel?: string;
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
  onRevealPath: (path: string) => void;
  onCopyPlatformDraft: (draftId: string) => void;
  onOpenWorkflowRun: (workflowRunId: string) => void;
  onOpenSourceLog: (sourceLogId: string) => void;
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

const PURPOSE_SOURCE_PRIORITIES: Record<PromptDraftPurpose, InputSourcePurpose[]> = {
  image: ['ip-scenario-kb', 'brand-kb', 'product-brief', 'user-feedback', 'reference', 'successful-asset', 'sop-input'],
  video: ['ip-scenario-kb', 'brand-kb', 'product-brief', 'user-feedback', 'reference', 'successful-asset', 'sop-input'],
  article: ['user-feedback', 'ip-scenario-kb', 'ip-kb', 'brand-kb', 'product-brief', 'sop-input', 'successful-asset', 'reference'],
  'green-screen': ['user-feedback', 'ip-scenario-kb', 'brand-kb', 'product-brief', 'sop-input', 'successful-asset'],
  sop: ['sop-input', 'user-feedback', 'brand-kb', 'ip-kb', 'ip-scenario-kb', 'product-brief', 'successful-asset', 'reference'],
  skill: ['sop-input', 'user-feedback', 'brand-kb', 'ip-kb', 'ip-scenario-kb', 'product-brief', 'successful-asset', 'reference'],
};

const STATUS_LABELS: Record<PromptDraftStatus, string> = {
  draft: '草稿',
  confirmed: '已确认',
  materialized: '已物化',
  archived: '归档',
};

const INPUT_SOURCE_STATUS_LABELS: Record<InputSourceRecord['status'], string> = {
  registered: '已登记',
  converted: '已解析',
  blocked: '待解析',
  failed: '解析失败',
};

const INPUT_SOURCE_KIND_LABELS: Record<InputSourceRecord['kind'], string> = {
  docx: '文档',
  markdown: '文档',
  text: '文本',
  image: '图片',
  video: '视频',
  'sku-table': 'SKU 表',
  url: '网页',
  'manual-note': '手动记录',
};

const INPUT_SOURCE_PURPOSE_LABELS: Record<InputSourcePurpose, string> = {
  'brand-kb': '品牌 / 产品知识库',
  'ip-kb': 'IP 知识库',
  'ip-scenario-kb': 'IP 场景延伸库',
  reference: '参考素材',
  'product-brief': '产品资料',
  'user-feedback': '评论 / 客服问题',
  'sop-input': '任务输入',
  'successful-asset': '成功素材',
};

const SESSION_STATUS_LABELS: Record<AgentPromptSession['status'], string> = {
  active: '会话中',
  'waiting-user': '待补充',
  'draft-created': '已生成草稿',
  blocked: '待配置',
  closed: '已关闭',
};

type AgentProcessStepState = 'done' | 'active' | 'idle' | 'blocked';

interface AgentProcessStep {
  key: string;
  title: string;
  detail: string;
  state: AgentProcessStepState;
}

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

function uniqueNonEmptyModels(models: Array<string | undefined>): string[] {
  return Array.from(new Set(models.map((model) => model?.trim()).filter((model): model is string => Boolean(model))));
}

function resolveDefaultSessionTextModel(textModel: string | undefined, textModels: string[]): string {
  const configuredModel = textModel?.trim();
  if (isClaudeModelName(configuredModel)) return configuredModel;
  return textModels.find(isClaudeModelName) ?? configuredModel ?? '';
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
  return `${source.title} · ${INPUT_SOURCE_KIND_LABELS[source.kind]} / ${INPUT_SOURCE_STATUS_LABELS[source.status]}`;
}

function isTraceSource(source: InputSourceRecord): boolean {
  return isPromptDistilledSource(source);
}

function sourcePurposeRank(source: InputSourceRecord, purpose: PromptDraftPurpose): number {
  const index = PURPOSE_SOURCE_PRIORITIES[purpose].indexOf(source.purpose);
  return index === -1 ? 99 : index;
}

function isRecommendedSource(source: InputSourceRecord, purpose: PromptDraftPurpose): boolean {
  return sourcePurposeRank(source, purpose) < 99;
}

function isReadyForDefaultSelection(source: InputSourceRecord): boolean {
  return source.status === 'converted' || source.status === 'registered';
}

function defaultSourceIdsForPurpose(
  purpose: PromptDraftPurpose,
  sources: InputSourceRecord[],
  activeDraft?: PromptDraft,
): string[] {
  if (activeDraft) {
    const reusableSourceIds = new Set(
      sources
        .filter(isReusablePromptInputSource)
        .map((source) => source.id),
    );
    return activeDraft.inputSourceIds.filter((sourceId) => reusableSourceIds.has(sourceId)).slice(0, 8);
  }
  return [...sources]
    .filter((source) => isRecommendedSource(source, purpose) && isReadyForDefaultSelection(source) && isReusablePromptInputSource(source))
    .sort((a, b) => sourcePurposeRank(a, purpose) - sourcePurposeRank(b, purpose) || b.createdAt.localeCompare(a.createdAt))
    .slice(0, 3)
    .map((source) => source.id);
}

function sourceFitLabel(source: InputSourceRecord, purpose: PromptDraftPurpose): string {
  if (isTraceSource(source)) return '追溯源';
  if (!isRecommendedSource(source, purpose)) return '其他输入源';
  if (!isReadyForDefaultSelection(source)) return '推荐但待解析';
  return '推荐输入源';
}

function defaultSkillKeys(skills: LoadedSkill[], enabledSkillKeys: Set<string>): string[] {
  return skills
    .filter((skill) => skill.valid && enabledSkillKeys.has(skillKey(skill)))
    .map(skillKey)
    .slice(0, 6);
}

function skillRefFromLoaded(skill: LoadedSkill): SkillRef {
  return { slug: skill.slug, source: skill.source };
}

function skillLabel(ref: SkillRef, skills: LoadedSkill[]): string {
  return skills.find((skill) => skill.slug === ref.slug && skill.source === ref.source)?.metadata.name ?? ref.slug;
}

function compactLabels(labels: string[]): string {
  if (!labels.length) return '未选择';
  if (labels.length <= 3) return labels.join('、');
  return `${labels.slice(0, 3).join('、')} 等 ${labels.length} 个`;
}

export function PromptWorkbenchModule({
  featureKey = 'assets-prompt-workbench',
  initialPurpose = 'image',
  initialTitle = '图片 Prompt 草稿',
  initialUserIntent = '根据产品资料和参考图，生成自然真实的小红书种草图 Prompt。',
  workspaceReady,
  busy,
  currentActionLabel,
  inputSources,
  promptDrafts,
  platformDrafts,
  copiedPlatformDraftId,
  agentPromptSessions,
  skills,
  enabledSkillKeys,
  textModel,
  textModels = [],
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
  onRevealPath,
  onCopyPlatformDraft,
  onOpenWorkflowRun,
  onOpenSourceLog,
  onSelectModule,
}: PromptWorkbenchModuleProps) {
  const feature = V2_FEATURES[featureKey];
  const defaultSessionTextModel = useMemo(
    () => resolveDefaultSessionTextModel(textModel, textModels),
    [textModel, textModels],
  );
  const [purpose, setPurpose] = useState<PromptDraftPurpose>(initialPurpose);
  const [title, setTitle] = useState(initialTitle);
  const [userIntent, setUserIntent] = useState(initialUserIntent);
  const [sessionTextModel, setSessionTextModel] = useState(defaultSessionTextModel);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<string[]>([]);
  const sourceSelectionModeRef = useRef<'auto' | 'manual'>('auto');
  const skillSelectionModeRef = useRef<'auto' | 'manual'>('auto');
  const lastAutoSelectionContextRef = useRef<string>('');
  const visibleSkills = useMemo(
    () => [...skills]
      .filter((skill) => skill.valid)
      .sort((a, b) => Number(!enabledSkillKeys.has(skillKey(a))) - Number(!enabledSkillKeys.has(skillKey(b))) || a.slug.localeCompare(b.slug, 'zh-Hans-CN'))
      .slice(0, 10),
    [enabledSkillKeys, skills],
  );
  const selectedSkills = useMemo(
    () => visibleSkills.filter((skill) => selectedSkillKeys.includes(skillKey(skill))),
    [selectedSkillKeys, visibleSkills],
  );
  const selectedSkillRefs = useMemo(
    () => selectedSkills.map(skillRefFromLoaded),
    [selectedSkills],
  );
  const availableSkillKeys = useMemo(
    () => new Set(skills.filter((skill) => skill.valid).map(skillKey)),
    [skills],
  );
  const visibleDrafts = useMemo(
    () => promptDrafts.filter((draft) => draft.purpose === purpose),
    [promptDrafts, purpose],
  );
  const activeDraft =
    visibleDrafts.find((draft) => draft.id === activeDraftId) ??
    visibleDrafts[0];
  const activeDraftPlatformDrafts = useMemo(
    () => platformDrafts.filter((draft) => draft.promptDraftId === activeDraft?.id).slice(0, 6),
    [activeDraft?.id, platformDrafts],
  );
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
  const sessionModelOptions = useMemo(() => {
    const models = uniqueNonEmptyModels([sessionTextModel, textModel, ...textModels]);
    const claudeModels = models.filter(isClaudeModelName);
    return claudeModels.length ? claudeModels : models;
  }, [sessionTextModel, textModel, textModels]);
  const [draftContent, setDraftContent] = useState(activeContent(activeDraft));
  const [sessionAdjustment, setSessionAdjustment] = useState('请结合用户意图继续收紧文案结构，并补充合规提醒。');
  const selectedSources = useMemo(
    () => inputSources.filter((source) => selectedSourceIds.includes(source.id)),
    [inputSources, selectedSourceIds],
  );
  const reusableSelectedSourceIds = useMemo(
    () => selectedSources.filter(isReusablePromptInputSource).map((source) => source.id),
    [selectedSources],
  );
  const activeDraftTraceSources = useMemo(
    () => inputSources.filter((source) => activeDraft?.inputSourceIds.includes(source.id) && isTraceSource(source)),
    [activeDraft?.inputSourceIds, inputSources],
  );
  const orderedInputSources = useMemo(
    () => [...inputSources].sort((a, b) => {
      const rankDiff = sourcePurposeRank(a, purpose) - sourcePurposeRank(b, purpose);
      if (rankDiff !== 0) return rankDiff;
      const statusDiff = Number(!isReadyForDefaultSelection(a)) - Number(!isReadyForDefaultSelection(b));
      if (statusDiff !== 0) return statusDiff;
      return b.createdAt.localeCompare(a.createdAt);
    }),
    [inputSources, purpose],
  );

  useEffect(() => {
    setDraftContent(activeContent(activeDraft));
  }, [activeDraft?.id, activeDraft?.activeVersionId]);

  useEffect(() => {
    if (isClaudeModelName(activeSession?.model)) {
      setSessionTextModel(activeSession.model);
      return;
    }
    setSessionTextModel(defaultSessionTextModel);
  }, [activeSession?.id, activeSession?.model, defaultSessionTextModel]);

  useEffect(() => {
    setPurpose(initialPurpose);
    setTitle(initialTitle);
    setUserIntent(initialUserIntent);
  }, [featureKey, initialPurpose, initialTitle, initialUserIntent]);

  useEffect(() => {
    if (skillSelectionModeRef.current === 'manual') return;
    const draftSkillKeys = (activeDraft?.selectedSkills ?? [])
      .map(skillKey)
      .filter((key) => availableSkillKeys.has(key));
    setSelectedSkillKeys(draftSkillKeys.length ? draftSkillKeys : defaultSkillKeys(skills, enabledSkillKeys));
  }, [activeDraft?.id, availableSkillKeys, enabledSkillKeys, skills]);

  useEffect(() => {
    const selectionContext = `${purpose}:${activeDraft?.id ?? 'none'}`;
    const nextSelectedIds = defaultSourceIdsForPurpose(purpose, inputSources, activeDraft);
    if (sourceSelectionModeRef.current === 'manual' && lastAutoSelectionContextRef.current === selectionContext) return;
    setSelectedSourceIds(nextSelectedIds);
    sourceSelectionModeRef.current = 'auto';
    lastAutoSelectionContextRef.current = selectionContext;
  }, [activeDraft?.id, inputSources, purpose]);

  const canGenerate = workspaceReady && !busy && userIntent.trim().length > 0;
  const sessionModelReady = !sessionTextModel || isClaudeModelName(sessionTextModel);
  const canStartSession = canGenerate && sessionModelReady;
  const canSave = workspaceReady && !busy && Boolean(activeDraft) && draftContent.trim().length > 0;
  const canUseCurrentDraft = canSave && Boolean(activeDraft);
  const hasAgentSessionPanel = visibleSessions.length > 0 || Boolean(activeSession);
  const activePurpose = activeDraft?.purpose ?? purpose;
  const activeDraftTextProtocol = activeDraft?.textProtocol ?? activeSession?.textProtocol;
  const activeProcessSkillRefs = activeSession?.selectedSkills?.length
    ? activeSession.selectedSkills
    : activeDraft?.selectedSkills?.length
      ? activeDraft.selectedSkills
      : selectedSkillRefs;
  const activeProcessSkillLabels = activeProcessSkillRefs.map((ref) => skillLabel(ref, skills));
  const activeProcessSourceCount = activeSession?.sourceSnapshots.length ?? reusableSelectedSourceIds.length;
  const isPromptActionRunning = busy && Boolean(currentActionLabel?.includes('Prompt') || currentActionLabel?.includes('Agent'));
  const agentProcessSteps: AgentProcessStep[] = [
    {
      key: 'skills',
      title: '选取 skills',
      detail: compactLabels(activeProcessSkillLabels),
      state: activeProcessSkillRefs.length ? 'done' : 'idle',
    },
    {
      key: 'sources',
      title: '读取输入源',
      detail: activeProcessSourceCount ? `${activeProcessSourceCount} 个输入源` : '未选择输入源',
      state: activeProcessSourceCount ? 'done' : inputSources.length ? 'idle' : 'blocked',
    },
    {
      key: 'draft',
      title: '生成草稿',
      detail: activeDraft ? modelLabel(activeDraft.model) : currentActionLabel ?? '等待启动',
      state: isPromptActionRunning ? 'active' : activeDraft ? 'done' : canGenerate ? 'idle' : 'blocked',
    },
    {
      key: 'refine',
      title: '多轮调整',
      detail: activeSession ? `${activeSession.messages.length} 条消息` : '未启动会话',
      state: activeSession?.messages.length && activeSession.messages.length > 2 ? 'done' : activeSession ? 'active' : 'idle',
    },
  ];
  const shouldShowAgentProcess = hasAgentSessionPanel || isPromptActionRunning || Boolean(activeDraft);
  const downstreamAction: JourneyAction | undefined =
    activePurpose === 'image'
      ? { label: '发送到图片生成', module: 'image', disabled: !canUseCurrentDraft, onClick: () => activeDraft && onUsePromptInImage(draftContent, activeDraft.sceneCardIds) }
      : activePurpose === 'video'
        ? { label: '打开视频 Prompt', module: 'video-prompt', disabled: !canUseCurrentDraft, onClick: () => activeDraft && onOpenVideoPrompt(activeDraft.id) }
        : activePurpose === 'article'
          ? { label: '进入文章生成', module: 'article', disabled: !canUseCurrentDraft, onClick: () => activeDraft && onUsePromptInArticle(activeDraft.id, draftContent) }
          : activePurpose === 'green-screen'
            ? { label: '生成绿幕图', module: 'image-green-screen', disabled: !canUseCurrentDraft, onClick: () => activeDraft && onOpenGreenScreen(activeDraft.id) }
            : undefined;

  function changePurpose(nextPurpose: PromptDraftPurpose): void {
    setPurpose(nextPurpose);
    setTitle(PURPOSE_DEFAULTS[nextPurpose].title);
    setUserIntent(PURPOSE_DEFAULTS[nextPurpose].userIntent);
    sourceSelectionModeRef.current = 'auto';
    setSelectedSourceIds(defaultSourceIdsForPurpose(nextPurpose, inputSources));
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

      <UserJourneyGuide
        title="先跑通玩法，再沉淀成可复用任务"
        description="Prompt 工作台服务还没固定下来的玩法：普通用户选择资料、说清目标，让 AI 多轮调整，确认后再进入图片、视频、文案或绿幕图。"
        steps={[
          {
            key: 'source',
            title: '选择输入资料',
            description: '自动优先选择和当前用途匹配的品牌、IP、产品、参考素材或成功素材。',
            state: reusableSelectedSourceIds.length ? 'done' : inputSources.length ? 'active' : 'blocked',
          },
          {
            key: 'intent',
            title: '说清楚这次要做什么',
            description: '平台、目标人群、画面风格、禁用表达和输出格式都放在这里。',
            state: userIntent.trim() ? 'done' : 'active',
          },
          {
            key: 'draft',
            title: '生成并调整提示词',
            description: '可以直接生成草稿，也可以启动 AI 会话反复追问和改写。',
            state: activeDraft ? 'done' : canGenerate ? 'active' : 'idle',
          },
          {
            key: 'deliver',
            title: '确认后进入下游',
            description: '图片去生成，视频去复制，文案去文章，绿幕图去导出卡片。',
            state: activeDraft?.status === 'confirmed' || activeDraft?.status === 'materialized' ? 'next' : activeDraft ? 'active' : 'idle',
          },
          {
            key: 'materialize',
            title: '沉淀为可复用方法',
            description: '跑通多次后再沉淀成 SOP 或 Skill，不让普通用户先维护复杂流程。',
            state: activeDraft?.status === 'materialized' ? 'done' : activeDraft ? 'next' : 'idle',
          },
        ]}
        actions={[
          { label: '补输入源', module: 'knowledge-inputs' },
          { label: '启动 AI 会话', primary: true, onClick: () => onStartSession({ title, purpose, userIntent, inputSourceIds: reusableSelectedSourceIds, selectedSkills: selectedSkillRefs, selectedSkillSlugs: selectedSkillRefs.map((skill) => skill.slug), textModel: sessionTextModel }), disabled: !canStartSession },
          { label: '仅生成草稿', onClick: () => onGenerateDraft({ title, purpose, userIntent, inputSourceIds: reusableSelectedSourceIds, selectedSkills: selectedSkillRefs, selectedSkillSlugs: selectedSkillRefs.map((skill) => skill.slug) }), disabled: !canGenerate },
          ...(downstreamAction ? [downstreamAction] : []),
        ]}
        onSelectModule={onSelectModule}
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
              <span>会话模型</span>
              <select value={sessionTextModel} onChange={(event) => setSessionTextModel(event.target.value)}>
                {sessionModelOptions.map((model) => (
                  <option key={model} value={model}>{model === textModel ? `${model}（全局）` : model}</option>
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
          <div className="prompt-skill-picker">
            <div>
              <span>本轮 skills</span>
              {selectedSkills.length ? <small>{selectedSkills.length} 个</small> : <small>未选择</small>}
            </div>
            <div className="prompt-skill-chip-row">
              {visibleSkills.map((skill) => {
                const key = skillKey(skill);
                const selected = selectedSkillKeys.includes(key);
                return (
                  <button
                    key={key}
                    type="button"
                    className={selected ? 'active' : ''}
                    onClick={() => {
                      skillSelectionModeRef.current = 'manual';
                      setSelectedSkillKeys((current) =>
                        selected
                          ? current.filter((item) => item !== key)
                          : [...current, key].slice(0, 6),
                      );
                    }}
                    title={skill.metadata.description}
                  >
                    <strong>{skill.metadata.name}</strong>
                    <small>{enabledSkillKeys.has(key) ? '已启用' : skill.source}</small>
                  </button>
                );
              })}
              {visibleSkills.length === 0 ? <span className="prompt-skill-empty">暂无可用 skill</span> : null}
            </div>
          </div>
          {!sessionModelReady ? (
            <div className="inline-warning subtle">
              Claude SDK Agent 只能使用 Claude 系列模型，请在会话模型中选择 Claude 模型后再启动。
            </div>
          ) : null}
          <div className="prompt-source-list">
            {orderedInputSources.map((source) => (
              <label key={source.id} className="prompt-source-option">
                <input
                  type="checkbox"
                  checked={selectedSourceIds.includes(source.id)}
                  disabled={isTraceSource(source)}
                  title={isTraceSource(source) ? '追溯源，仅供查看' : undefined}
                  onChange={(event) => {
                    sourceSelectionModeRef.current = 'manual';
                    setSelectedSourceIds((current) =>
                      event.target.checked
                        ? [...current, source.id].slice(0, 8)
                        : current.filter((id) => id !== source.id),
                    );
                  }}
                />
                <span>
                  <strong>{sourceTitle(source)}</strong>
                  <small>{sourceFitLabel(source, purpose)} · {INPUT_SOURCE_PURPOSE_LABELS[source.purpose]}</small>
                  <small>{source.summary ?? source.blockedReason ?? '未记录摘要'}</small>
                  {source.markdownPath ? <small>已生成可追溯转换稿</small> : null}
                </span>
              </label>
            ))}
            {inputSources.length === 0 ? (
              <div className="empty-state">还没有输入源。先到“输入源 / 文档转换”登记用户意图、产品资料或参考素材。</div>
            ) : null}
            {activeDraftTraceSources.length ? (
              <div className="inline-warning subtle">
                当前草稿关联 {activeDraftTraceSources.length} 个成功素材追溯源，仅用于查看来源，不会作为新 Prompt 输入。
              </div>
            ) : null}
          </div>
          <ActionGroup align="left">
            <button
              className="primary small"
              disabled={!canStartSession}
              onClick={() => onStartSession({ title, purpose, userIntent, inputSourceIds: reusableSelectedSourceIds, selectedSkills: selectedSkillRefs, selectedSkillSlugs: selectedSkillRefs.map((skill) => skill.slug), textModel: sessionTextModel })}
            >
              启动 Agent 会话
            </button>
            <button
              className="ghost small"
              disabled={!canGenerate}
              onClick={() => onGenerateDraft({ title, purpose, userIntent, inputSourceIds: reusableSelectedSourceIds, selectedSkills: selectedSkillRefs, selectedSkillSlugs: selectedSkillRefs.map((skill) => skill.slug) })}
            >
              仅生成草稿
            </button>
            <button className="ghost small" onClick={() => onSelectModule('knowledge-inputs')}>补输入源</button>
          </ActionGroup>
        </aside>

        <main className="panel prompt-editor-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">提示词草稿</p>
              <h3>{activeDraft?.title ?? '尚未生成草稿'}</h3>
            </div>
            {activeDraft ? (
              <div className="workflow-summary-stack compact">
                <StatusPill tone={statusClass(activeDraft.status)}>{STATUS_LABELS[activeDraft.status]}</StatusPill>
                <StatusPill tone={modelStatusClass(activeDraft.model)}>{modelLabel(activeDraft.model)}</StatusPill>
                <StatusPill tone={activeDraftTextProtocol ? 'ready' : 'idle'}>{textProtocolLabel(activeDraftTextProtocol)}</StatusPill>
                {activeDraft.workflowRunId ? (
                  <StatusPill tone="ready">已关联 SOP</StatusPill>
                ) : null}
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
                    沉淀为 SOP
                  </button>
                ) : null}
                {activePurpose === 'skill' ? (
                  <button
                    className="ghost small"
                    disabled={!canUseCurrentDraft}
                    onClick={() => activeDraft && onMaterializeDraftToSkill({ draftId: activeDraft.id, content: draftContent })}
                  >
                    沉淀为 Skill
                  </button>
                ) : null}
              </ActionGroup>
              <div className="inline-warning subtle">
                当前只显示「{PURPOSE_LABELS[activePurpose]}」可执行动作，避免草稿被送到不匹配的下游。
              </div>
              {activeDraftPlatformDrafts.length ? (
                <section className="prompt-derived-delivery">
                  <div className="panel-title compact">
                    <div>
                      <p className="eyebrow">派生交付物</p>
                      <h4>平台草稿包</h4>
                    </div>
                    <StatusPill>{activeDraftPlatformDrafts.length} 个</StatusPill>
                  </div>
                  <PlatformDraftTraceList
                    drafts={activeDraftPlatformDrafts}
                    busy={busy}
                    workspaceReady={workspaceReady}
                    copiedDraftId={copiedPlatformDraftId}
                    onRevealPath={onRevealPath}
                    onCopyPlatformDraft={onCopyPlatformDraft}
                    onOpenWorkflowRun={onOpenWorkflowRun}
                    onOpenSourceLog={onOpenSourceLog}
                  />
                </section>
              ) : null}
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
                meta={`${PURPOSE_LABELS[draft.purpose]} · ${draft.versions.length} 个版本 · ${draft.inputSourceIds.length} 个输入源${draft.sceneCardIds?.length ? ` · ${draft.sceneCardIds.length} 张场景卡` : ''}${draft.workflowRunId ? ' · 已关联 SOP' : ''} · ${modelLabel(draft.model)} · ${textProtocolLabel(draft.textProtocol)}`}
                onClick={() => onSelectDraft(draft.id)}
              />
            ))}
            {visibleDrafts.length === 0 ? <div className="empty-state">暂无{PURPOSE_LABELS[purpose]}草稿。</div> : null}
          </div>
        </aside>
      </div>
      {shouldShowAgentProcess ? (
        <section className="panel prompt-session-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Agent 过程</p>
              <h3>{activeSession?.title ?? activeDraft?.title ?? '等待启动'}</h3>
            </div>
            <div className="workflow-summary-stack compact">
              {isPromptActionRunning ? <StatusPill tone="idle">{currentActionLabel}</StatusPill> : null}
              {activeSession ? (
                <>
                  <StatusPill tone={sessionStatusClass(activeSession.status)}>
                    {SESSION_STATUS_LABELS[activeSession.status]}
                  </StatusPill>
                  <StatusPill tone={activeSession.textProtocol ? 'ready' : 'idle'}>
                    {textProtocolLabel(activeSession.textProtocol)}
                  </StatusPill>
                  <StatusPill tone={modelStatusClass(activeSession.model ?? textModel)}>
                    {modelLabel(activeSession.model ?? textModel)}
                  </StatusPill>
                </>
              ) : activeDraft ? (
                <>
                  <StatusPill tone={modelStatusClass(activeDraft.model)}>{modelLabel(activeDraft.model)}</StatusPill>
                  <StatusPill tone={activeDraft.textProtocol ? 'ready' : 'idle'}>{textProtocolLabel(activeDraft.textProtocol)}</StatusPill>
                </>
              ) : null}
            </div>
          </div>
          <div className="prompt-agent-process">
            {agentProcessSteps.map((step) => (
              <article key={step.key} className={`prompt-agent-step ${step.state}`}>
                <span />
                <div>
                  <strong>{step.title}</strong>
                  <small>{step.detail}</small>
                </div>
              </article>
            ))}
          </div>
          {hasAgentSessionPanel ? (
            <div className="prompt-session-layout">
              <div className="prompt-session-list">
                {visibleSessions.map((session) => (
                  <SelectableRecordCard
                    key={session.id}
                    className="prompt-session-card"
                    active={session.id === activeSession?.id}
                    title={session.title}
                    meta={`${PURPOSE_LABELS[session.purpose]} · ${session.messages.length} 条消息 · ${session.promptDraftIds.length} 个草稿${session.selectedSkills?.length ? ` · ${session.selectedSkills.length} 个 skill` : ''}${session.workflowRunId ? ' · 已关联 SOP' : ''} · ${textProtocolLabel(session.textProtocol)}`}
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
                            <strong>{message.role === 'user' ? '输入' : 'Agent'}</strong>
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
                        disabled={!workspaceReady || busy || !sessionAdjustment.trim() || !activeSession || !sessionModelReady}
                        onClick={() => activeSession && onContinueSession({ sessionId: activeSession.id, message: sessionAdjustment, textModel: sessionTextModel })}
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
          ) : null}
        </section>
      ) : null}
      {selectedSources.length ? (
        <section className="panel prompt-source-footprint">
          <p className="eyebrow">来源追溯</p>
          <div className="workflow-run-steps">
            {activeDraft?.workflowRunId ? <span>已关联 SOP</span> : null}
            {activeDraft?.sceneCardIds?.length ? <span>场景卡：{activeDraft.sceneCardIds.length} 张</span> : null}
            {selectedSources.map((source) => (
              <span key={source.id}>{source.title}</span>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
