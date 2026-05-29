import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type { AgentPromptSession, PromptDraft, PromptDraftPurpose, PromptPack, SceneCard } from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { VIDEO_PROMPT_TARGET_OPTIONS, targetLabel as videoPromptTargetLabel } from '../../app/videoPromptFlow';
import { AgentSessionPanel, type AgentActionResolver, type AgentExecutionStep } from '../agent/AgentSessionPanel';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface ScenePromptModuleProps {
  module: 'knowledge-scenes' | 'image-scene-prompts';
  workspaceReady: boolean;
  busy: boolean;
  sceneCards: SceneCard[];
  promptDrafts: PromptDraft[];
  agentPromptSessions: AgentPromptSession[];
  activePromptPack?: PromptPack;
  activeAgentPromptSessionId: string;
  currentActionLabel?: string | null;
  textModel?: string;
  citationCount: number;
  selectedSceneIds: string[];
  onSelectSceneIds: (sceneIds: string[]) => void;
  onSelectAgentSession: (sessionId: string) => void;
  onResolveAgentAction?: AgentActionResolver;
  onGenerateSceneCards: () => void;
  onGenerateScenePromptDraft: (input: {
    sceneCardIds: string[];
    purpose: PromptDraftPurpose;
    userIntent: string;
  }) => void;
  onStartAgentSession: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    sceneCardIds?: string[];
    textModel?: string;
  }) => void;
  onContinueAgentSession: (input: {
    sessionId: string;
    message: string;
    textModel?: string;
  }) => void;
  onUpdateSceneCard: (scene: SceneCard) => void;
  onUsePromptInImage: (prompt: string, sceneCardIds?: string[]) => void;
  onUsePromptInVideo: (draftId: string) => void;
  onUsePromptInArticle: (draftId: string, prompt: string) => void;
  onUsePromptInGreenScreen: (draftId: string) => void;
  onRecordPromptDraftCopy: (input: { draftId: string; target?: string }) => Promise<void> | void;
  onSelectModule: (module: ModuleKey) => void;
}

const PURPOSE_OPTIONS: Array<{ value: PromptDraftPurpose; label: string; result: string }> = [
  { value: 'image', label: '图片', result: '10 组 UGC 图片 Prompt' },
  { value: 'video', label: '视频', result: '10 组 15 秒视频 Prompt' },
  { value: 'article', label: '文案', result: '5 组文案 Prompt' },
  { value: 'green-screen', label: '绿幕图', result: '8 组绿幕文案图 Prompt' },
];

const IMAGE_EXTERNAL_TARGET_OPTIONS = [
  { value: 'external-image-tool', label: '外部图片工具' },
  { value: 'designer-handoff', label: '交给设计同事' },
  { value: 'other-image-platform', label: '其他图片平台' },
];

type ScenePromptHandoffMode = 'internal' | 'external';

const AGENT_SESSION_STATUS_LABELS: Record<AgentPromptSession['status'], string> = {
  active: '会话中',
  'waiting-user': '待补充',
  'draft-created': '已生成草稿',
  blocked: '待配置',
  closed: '已关闭',
};

const AGENT_MESSAGE_KIND_LABELS: Record<AgentPromptSession['messages'][number]['kind'], string> = {
  intent: '意图',
  draft: '草稿',
  adjustment: '调整',
  note: '记录',
};

function HelpHint({ text }: { text: string }) {
  return (
    <span className="scene-prompt-help" title={text} aria-label={text} tabIndex={0}>
      ?
    </span>
  );
}

function activeContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function isScenePromptDraft(draft: PromptDraft, sceneIds: string[], purpose: PromptDraftPurpose): boolean {
  if (draft.purpose !== purpose) return false;
  if (sceneIds.length === 0) return draft.userIntent.includes('基于已确认场景卡生成下游 Prompt');
  if (draft.sceneCardIds?.length) return draft.sceneCardIds.some((id) => sceneIds.includes(id));
  return draft.userIntent.includes('基于已确认场景卡生成下游 Prompt');
}

function statusText(draft?: PromptDraft): string {
  if (!draft) return '待生成';
  if (draft.status === 'confirmed') return '已确认';
  if (draft.status === 'materialized') return '已物化';
  if (draft.status === 'archived') return '归档';
  return '草稿';
}

function statusClass(draft?: PromptDraft): string {
  if (!draft) return 'idle';
  if (draft.status === 'confirmed' || draft.status === 'materialized') return 'ready';
  if (draft.status === 'archived') return 'blocked';
  return 'idle';
}

function sessionStatusClass(session?: AgentPromptSession): 'idle' | 'ready' | 'blocked' {
  if (!session) return 'idle';
  if (session.status === 'blocked') return 'blocked';
  if (session.status === 'waiting-user') return 'idle';
  return 'ready';
}

function promptPurposeLabel(purpose: PromptDraftPurpose): string {
  return PURPOSE_OPTIONS.find((option) => option.value === purpose)?.label ?? '提示词';
}

function splitPromptItems(content: string): Array<{ title: string; content: string }> {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const chunks = trimmed
    .split(/\n(?=### )/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('### '));
  if (!chunks.length) return [{ title: '完整 Prompt', content: trimmed }];
  return chunks.map((chunk, index) => {
    const [firstLine] = chunk.split('\n');
    return {
      title: firstLine?.replace(/^###\s*/, '').trim() || `Prompt ${index + 1}`,
      content: chunk,
    };
  });
}

function purposeResult(purpose: PromptDraftPurpose): string {
  return PURPOSE_OPTIONS.find((option) => option.value === purpose)?.result ?? 'Prompt 组';
}

function formatTime(value?: string): string {
  return value ? new Date(value).toLocaleString() : '未记录';
}

function defaultHandoffMode(purpose: PromptDraftPurpose): ScenePromptHandoffMode {
  return purpose === 'video' ? 'external' : 'internal';
}

function internalDestinationLabel(purpose: PromptDraftPurpose): string {
  if (purpose === 'video') return '打开视频 Prompt 工作台';
  if (purpose === 'article') return '发送到文章生成';
  if (purpose === 'green-screen') return '打开绿幕文案图';
  return '发送到图片生成';
}

function internalDestinationDescription(purpose: PromptDraftPurpose): string {
  if (purpose === 'video') return '进入视频 Prompt 页继续复制到第三方平台，不创建外部任务。';
  if (purpose === 'article') return '把选中提示词作为文章生成要求，继续做正文和发布检查。';
  if (purpose === 'green-screen') return '用当前 Prompt 草稿生成标题卡、卖点卡和 CTA 卡。';
  return '把选中图片提示词放进图片生成页，继续走真实图片生成服务或待配置结果。';
}

function externalCopyLabel(purpose: PromptDraftPurpose): string {
  if (purpose === 'video') return '复制到第三方视频平台';
  if (purpose === 'image') return '复制到外部图片工具';
  return '复制到剪贴板';
}

function imageTargetLabel(value: string): string {
  return IMAGE_EXTERNAL_TARGET_OPTIONS.find((option) => option.value === value)?.label ?? '外部图片工具';
}

function isSceneConfirmed(scene: SceneCard): boolean {
  return scene.updatedAt !== scene.createdAt;
}

function sceneFieldCompleteness(scene?: SceneCard): { completed: number; total: number; missing: string[] } {
  const fields = [
    ['人群', scene?.audience],
    ['痛点', scene?.painPoint],
    ['使用场景', scene?.usageScene],
    ['画面构图', scene?.visualComposition],
    ['卖点表达', scene?.sellingPoint],
    ['图片建议', scene?.imageMaterialSuggestion],
    ['视频建议', scene?.videoMaterialSuggestion],
  ] as const;
  const missing = fields.filter(([, value]) => !value?.trim()).map(([label]) => label);
  return {
    completed: fields.length - missing.length,
    total: fields.length,
    missing,
  };
}

function sourceSummary(scene?: SceneCard): string {
  if (!scene) return '等待场景卡';
  const parts = ['已关联提示词包'];
  if (scene.inputSourceIds?.length) parts.push(`输入资料 ${scene.inputSourceIds.length} 份`);
  if (scene.citations.length) parts.push(`知识引用 ${scene.citations.length} 条`);
  if (scene.workflowRunId) parts.push('已关联 SOP');
  return parts.join(' · ');
}

function sceneContextText(scenes: SceneCard[]): string {
  if (!scenes.length) return '';
  return scenes.map((scene, index) => [
    `${index + 1}. ${scene.title}`,
    `人群：${scene.audience || '待补'}`,
    `痛点：${scene.painPoint || '待补'}`,
    `场景：${scene.usageScene || '待补'}`,
    `画面：${scene.visualComposition || '待补'}`,
    `卖点：${scene.sellingPoint || '待补'}`,
    `图片建议：${scene.imageMaterialSuggestion || '待补'}`,
    `视频建议：${scene.videoMaterialSuggestion || '待补'}`,
  ].join('\n')).join('\n\n');
}

function sectionText(content: string, startLabel: string, endLabels: string[]): string {
  const startIndex = content.indexOf(startLabel);
  if (startIndex < 0) return '';
  const afterStart = content.slice(startIndex + startLabel.length).trim();
  const endIndexes = endLabels
    .map((label) => afterStart.indexOf(`\n\n${label}`))
    .filter((index) => index >= 0);
  const endIndex = endIndexes.length ? Math.min(...endIndexes) : -1;
  return (endIndex >= 0 ? afterStart.slice(0, endIndex) : afterStart).trim();
}

function compactLines(value: string, limit: number): string {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, limit)
    .join('\n');
}

function compactAgentMessage(message: AgentPromptSession['messages'][number]): string {
  const content = message.content.trim();
  if (!content) return '无内容';
  if (message.role === 'user') {
    return compactLines(
      sectionText(content, '用户本轮要求：', ['页面生成意图：', '选中场景卡：', '输出要求：'])
        || sectionText(content, '本轮用户调整要求：', ['当前仍以这些场景卡为边界：'])
        || sectionText(content, '用户意图：', ['输入源快照：', '本轮 skills：'])
        || content,
      5,
    );
  }
  if (message.kind === 'draft') {
    return compactLines(
      sectionText(content, 'Prompt 草稿：', ['需要追问 / 人工确认：', '仍需追问 / 人工确认：', '来源与合规提醒：', '下游检查清单：', '本轮调整：'])
        || content,
      8,
    );
  }
  return compactLines(content, 6);
}

function agentMessageTitle(message: AgentPromptSession['messages'][number]): string {
  if (message.role === 'user') return message.kind === 'adjustment' ? '你的追问' : '你的判断要求';
  if (message.kind === 'draft') return '执行输出';
  return message.role === 'system' ? '系统记录' : '助手';
}

function agentMessageDetailLabel(message: AgentPromptSession['messages'][number]): string {
  if (message.role === 'user') return '查看上下文';
  return message.kind === 'draft' ? '查看完整输出' : '查看完整记录';
}

function emptySceneDraft(scene?: SceneCard): Pick<
  SceneCard,
  | 'title'
  | 'audience'
  | 'painPoint'
  | 'usageScene'
  | 'visualComposition'
  | 'sellingPoint'
  | 'voiceoverDirection'
  | 'imageMaterialSuggestion'
  | 'videoMaterialSuggestion'
> {
  return {
    title: scene?.title ?? '',
    audience: scene?.audience ?? '',
    painPoint: scene?.painPoint ?? '',
    usageScene: scene?.usageScene ?? '',
    visualComposition: scene?.visualComposition ?? '',
    sellingPoint: scene?.sellingPoint ?? '',
    voiceoverDirection: scene?.voiceoverDirection ?? '',
    imageMaterialSuggestion: scene?.imageMaterialSuggestion ?? '',
    videoMaterialSuggestion: scene?.videoMaterialSuggestion ?? '',
  };
}

export function ScenePromptModule({
  module,
  workspaceReady,
  busy,
  sceneCards,
  promptDrafts,
  agentPromptSessions,
  activePromptPack,
  activeAgentPromptSessionId,
  currentActionLabel,
  textModel,
  citationCount,
  selectedSceneIds,
  onSelectSceneIds,
  onSelectAgentSession,
  onResolveAgentAction,
  onGenerateSceneCards,
  onGenerateScenePromptDraft,
  onStartAgentSession,
  onContinueAgentSession,
  onUpdateSceneCard,
  onUsePromptInImage,
  onUsePromptInVideo,
  onUsePromptInArticle,
  onUsePromptInGreenScreen,
  onRecordPromptDraftCopy,
  onSelectModule,
}: ScenePromptModuleProps) {
  const feature = V2_FEATURES[module];
  const [purpose, setPurpose] = useState<PromptDraftPurpose>(module === 'image-scene-prompts' ? 'image' : 'video');
  const [userIntent, setUserIntent] = useState(
    '基于场景卡生成能直接下游使用的真实内容素材 Prompt，画面要自然、可信、可追溯，不编造知识库外卖点。',
  );
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const [copiedPromptIndex, setCopiedPromptIndex] = useState<number | null>(null);
  const [handoffMode, setHandoffMode] = useState<ScenePromptHandoffMode>(defaultHandoffMode(purpose));
  const [videoTarget, setVideoTarget] = useState(VIDEO_PROMPT_TARGET_OPTIONS[0].value);
  const [imageExternalTarget, setImageExternalTarget] = useState(IMAGE_EXTERNAL_TARGET_OPTIONS[0].value);
  const [lastCopiedTarget, setLastCopiedTarget] = useState('');
  const [editingSceneId, setEditingSceneId] = useState('');
  const [agentMessage, setAgentMessage] = useState('先判断选中场景是否真实，再生成自然可信、可直接交付的 Prompt。');
  const effectiveSceneIds = selectedSceneIds.length
    ? selectedSceneIds
    : sceneCards.slice(0, 2).map((scene) => scene.id);
  const editingScene =
    sceneCards.find((scene) => scene.id === editingSceneId) ??
    sceneCards.find((scene) => effectiveSceneIds.includes(scene.id)) ??
    sceneCards[0];
  const [sceneDraft, setSceneDraft] = useState(emptySceneDraft(editingScene));
  const selectedScenes = useMemo(
    () => sceneCards.filter((scene) => effectiveSceneIds.includes(scene.id)),
    [effectiveSceneIds, sceneCards],
  );
  const relatedDrafts = useMemo(
    () => promptDrafts.filter((draft) => isScenePromptDraft(draft, effectiveSceneIds, purpose)),
    [effectiveSceneIds, promptDrafts, purpose],
  );
  const relatedAgentSessions = useMemo(
    () => agentPromptSessions.filter((session) => {
      if (session.purpose !== purpose) return false;
      if (!effectiveSceneIds.length) return false;
      return session.sceneCardIds?.some((id) => effectiveSceneIds.includes(id));
    }),
    [agentPromptSessions, effectiveSceneIds, purpose],
  );
  const activeDraft =
    relatedDrafts[0] ??
    promptDrafts.find((draft) => draft.purpose === purpose && draft.userIntent.includes('基于已确认场景卡'));
  const activeAgentSession =
    relatedAgentSessions.find((session) => session.id === activeAgentPromptSessionId) ??
    relatedAgentSessions.find((session) => activeDraft?.id && session.promptDraftIds.includes(activeDraft.id)) ??
    relatedAgentSessions[0];
  const activePrompt = activeContent(activeDraft);
  const promptItems = useMemo(() => splitPromptItems(activePrompt), [activePrompt]);
  const selectedPrompt = promptItems[Math.min(selectedPromptIndex, Math.max(promptItems.length - 1, 0))];
  const canGenerateScenes = workspaceReady && !busy && (Boolean(activePromptPack) || citationCount > 0);
  const canGeneratePrompt = workspaceReady && !busy && selectedScenes.length > 0 && userIntent.trim().length > 0;
  const hasScenes = sceneCards.length > 0;
  const hasPromptGroup = Boolean(activeDraft && promptItems.length > 0);
  const confirmedSceneCount = sceneCards.filter(isSceneConfirmed).length;
  const canUseInternalDownstream = Boolean(selectedPrompt && (purpose === 'image' || activeDraft));
  const canCopyExternal = Boolean(selectedPrompt && (purpose === 'image' || purpose === 'video'));
  const canOpenKnowledge = workspaceReady && !busy;
  const sceneInputSourceIds = Array.from(
    new Set(selectedScenes.flatMap((scene) => scene.inputSourceIds ?? [])),
  ).slice(0, 12);
  const canStartAgentSession = workspaceReady && !busy && selectedScenes.length > 0 && agentMessage.trim().length > 0;
  const canContinueAgentSession = canStartAgentSession && Boolean(activeAgentSession);
  const isAgentRunning = busy && Boolean(
    currentActionLabel?.includes('协作') ||
    currentActionLabel?.includes('对话') ||
    currentActionLabel?.includes('Prompt 打磨'),
  );
  const currentExternalTargetLabel = purpose === 'video'
    ? videoPromptTargetLabel(videoTarget)
    : imageTargetLabel(imageExternalTarget);
  const hasPersistentVideoCopy = purpose === 'video' && Boolean(activeDraft?.copyCount || activeDraft?.lastCopiedAt);
  const handoffStatusLabel = hasPersistentVideoCopy
    ? `已复制到${videoPromptTargetLabel(activeDraft?.lastCopiedTarget)}，待导入成品`
    : copiedPromptIndex === selectedPromptIndex && lastCopiedTarget
      ? `已复制到${lastCopiedTarget}`
      : handoffMode === 'external'
        ? `准备${externalCopyLabel(purpose)}`
        : `准备${internalDestinationLabel(purpose)}`;
  const handoffStatusClass = hasPersistentVideoCopy || copiedPromptIndex === selectedPromptIndex ? 'warning' : 'idle';
  const generatePromptGroup = () => onGenerateScenePromptDraft({ sceneCardIds: effectiveSceneIds, purpose, userIntent });
  const editingSceneCompleteness = sceneFieldCompleteness(editingScene);
  const selectedSceneCompleteness = selectedScenes.reduce(
    (summary, scene) => {
      const completeness = sceneFieldCompleteness(scene);
      return {
        completed: summary.completed + completeness.completed,
        total: summary.total + completeness.total,
        missing: [...summary.missing, ...completeness.missing],
      };
    },
    { completed: 0, total: 0, missing: [] as string[] },
  );
  const uniqueMissingFields = Array.from(new Set(selectedSceneCompleteness.missing)).slice(0, 4);
  const primaryActionLabel = !hasScenes
    ? canGenerateScenes ? '生成场景卡' : '补知识来源'
    : !hasPromptGroup
      ? `生成${purposeResult(purpose)}`
      : purpose === 'video'
        ? externalCopyLabel(purpose)
        : internalDestinationLabel(purpose);
  const primaryActionDisabled = !hasScenes
    ? canGenerateScenes ? false : !canOpenKnowledge
    : !hasPromptGroup
      ? !canGeneratePrompt
      : purpose === 'video'
        ? !canCopyExternal
        : !canUseInternalDownstream;
  const canUseExternalHandoff = purpose === 'image' || purpose === 'video';
  const agentSteps: AgentExecutionStep[] = [
    {
      key: 'scene',
      title: '读取场景卡',
      detail: selectedScenes.length ? `${selectedScenes.length} 张场景，${sceneInputSourceIds.length} 份输入源` : '待选择场景',
      state: selectedScenes.length ? 'done' : 'blocked',
    },
    {
      key: 'chat',
      title: '人机对话',
      detail: activeAgentSession ? `${activeAgentSession.messages.length} 条消息` : '待发送',
      state: isAgentRunning ? 'active' : activeAgentSession ? 'done' : selectedScenes.length ? 'idle' : 'blocked',
    },
    {
      key: 'draft',
      title: '生成草稿',
      detail: activeAgentSession ? AGENT_SESSION_STATUS_LABELS[activeAgentSession.status] : '未生成',
      state: activeAgentSession?.status === 'blocked' ? 'blocked' : activeAgentSession ? 'done' : 'idle',
    },
    {
      key: 'handoff',
      title: '人工确认交付',
      detail: hasPromptGroup ? `${promptItems.length} 条可交付 Prompt` : '待确认 Prompt 组',
      state: hasPromptGroup ? 'active' : 'idle',
    },
  ];
  const agentQuickMessages = useMemo(() => {
    if (!hasScenes || selectedScenes.length === 0) return [];
    const sceneTitle = selectedScenes[0]?.title || '选中场景';
    const missingText = uniqueMissingFields.length ? uniqueMissingFields.join('、') : '来源边界';
    return [
      uniqueMissingFields.length
        ? `先判断「${sceneTitle}」缺少的${missingText}会影响哪些输出。`
        : `先判断「${sceneTitle}」是否真实可信，并指出来源风险。`,
      hasPromptGroup && selectedPrompt
        ? `基于当前选中 Prompt 继续改写，保留来源边界和下游用途。`
        : `基于已选 ${selectedScenes.length} 张场景卡生成${purposeResult(purpose)}，先列风险再输出。`,
      sceneInputSourceIds.length
        ? `检查本轮输出是否越过 ${sceneInputSourceIds.length} 份输入源的事实边界。`
        : `先追问需要补充的来源，不要生成没有证据的卖点。`,
    ];
  }, [hasPromptGroup, hasScenes, purpose, sceneInputSourceIds.length, selectedPrompt, selectedScenes, uniqueMissingFields]);
  const agentSourceCount = activeAgentSession?.sourceSnapshots.length ?? sceneInputSourceIds.length;
  const composerStatus = !hasScenes
    ? canGenerateScenes ? '可生成场景卡' : workspaceReady ? '缺少来源' : '未选择工作区'
    : !hasPromptGroup
      ? canGeneratePrompt ? `可生成${purposeResult(purpose)}` : '待选择场景'
      : handoffStatusLabel;

  function runPrimaryAction(): void {
    if (!hasScenes) {
      if (canGenerateScenes) onGenerateSceneCards();
      else onSelectModule('knowledge-inputs');
      return;
    }
    if (!hasPromptGroup) {
      generatePromptGroup();
      return;
    }
    if (purpose === 'video') {
      void copyPromptItem();
      return;
    }
    useInternalDownstream();
  }

  function buildAgentUserIntent(message: string): string {
    return [
      '任务：围绕已确认场景卡进行人机协作，生成可交付 Prompt。',
      '',
      '用户本轮要求：',
      message.trim(),
      '',
      '页面生成意图：',
      userIntent.trim(),
      '',
      '选中场景卡：',
      sceneContextText(selectedScenes),
      '',
      '输出要求：如果资料不足，先明确追问；如果可以生成，输出可直接用于下游的完整 Prompt，并保留来源和合规边界。',
    ].join('\n');
  }

  function startAgentSession(message = agentMessage): void {
    if (!canStartAgentSession || !message.trim()) return;
    onStartAgentSession({
      title: `${purposeResult(purpose)}打磨`,
      purpose,
      userIntent: buildAgentUserIntent(message),
      inputSourceIds: sceneInputSourceIds,
      sceneCardIds: effectiveSceneIds,
      textModel,
    });
  }

  function continueAgentSession(message = agentMessage): void {
    if (!activeAgentSession || !message.trim() || busy) return;
    onContinueAgentSession({
      sessionId: activeAgentSession.id,
      message: [
        message.trim(),
        '',
        '当前仍以这些场景卡为边界：',
        sceneContextText(selectedScenes),
      ].join('\n'),
      textModel,
    });
  }

  function submitAgentMessage(): void {
    if (activeAgentSession) continueAgentSession();
    else startAgentSession();
  }

  async function copyPromptItem(
    item = selectedPrompt,
    index = selectedPromptIndex,
    target?: string,
  ): Promise<void> {
    if (!item?.content.trim()) return;
    const copyTarget = target ?? (handoffMode === 'external' ? currentExternalTargetLabel : '剪贴板');
    await navigator.clipboard.writeText(item.content);
    setLastCopiedTarget(copyTarget);
    setCopiedPromptIndex(index);
    if (purpose === 'video' && activeDraft) {
      await onRecordPromptDraftCopy({ draftId: activeDraft.id, target: copyTarget });
    }
    window.setTimeout(() => setCopiedPromptIndex((current) => (current === index ? null : current)), 1400);
  }

  function useInternalDownstream(): void {
    if (!selectedPrompt) return;
    if (purpose === 'image') {
      onUsePromptInImage(selectedPrompt.content, effectiveSceneIds);
      return;
    }
    if (!activeDraft) return;
    if (purpose === 'video') {
      onUsePromptInVideo(activeDraft.id);
      return;
    }
    if (purpose === 'article') {
      onUsePromptInArticle(activeDraft.id, selectedPrompt.content);
      return;
    }
    onUsePromptInGreenScreen(activeDraft.id);
  }

  function openVideoPromptDraft(): void {
    if (!activeDraft) return;
    onUsePromptInVideo(activeDraft.id);
  }

  function openVideoImportForDraft(): void {
    if (!activeDraft) return;
    onUsePromptInVideo(activeDraft.id);
    onSelectModule('video-import');
  }

  useEffect(() => {
    if (selectedSceneIds.length || sceneCards.length === 0) return;
    onSelectSceneIds(sceneCards.slice(0, 2).map((scene) => scene.id));
  }, [onSelectSceneIds, sceneCards, selectedSceneIds.length]);

  useEffect(() => {
    if (editingSceneId || sceneCards.length === 0) return;
    setEditingSceneId(effectiveSceneIds[0] ?? sceneCards[0].id);
  }, [editingSceneId, effectiveSceneIds, sceneCards]);

  useEffect(() => {
    setSelectedPromptIndex(0);
    setCopiedPromptIndex(null);
    setLastCopiedTarget('');
    setHandoffMode(defaultHandoffMode(purpose));
  }, [activeDraft?.id, purpose]);

  useEffect(() => {
    setSceneDraft(emptySceneDraft(editingScene));
  }, [editingScene?.id]);

  function updateSceneDraft<K extends keyof ReturnType<typeof emptySceneDraft>>(key: K, value: ReturnType<typeof emptySceneDraft>[K]): void {
    setSceneDraft((current) => ({ ...current, [key]: value }));
  }

  function confirmEditingScene(): void {
    if (!editingScene) return;
    onUpdateSceneCard({
      ...editingScene,
      ...sceneDraft,
    });
  }

  const agentContext = (
    hasScenes ? (
      <>
        <div className="agent-context-chip-row" aria-label="本轮上下文">
          <span>{selectedScenes.length} 张场景</span>
          <span>{agentSourceCount} 份来源</span>
          <span>{purposeResult(purpose)}</span>
          {uniqueMissingFields.length ? <span className="blocked">待补 {uniqueMissingFields.length} 项</span> : <span className="ready">可生成</span>}
        </div>
        <div className="scene-agent-attachment-list">
          {sceneCards.map((scene) => (
            <label key={scene.id} className={`scene-agent-scene-chip ${effectiveSceneIds.includes(scene.id) ? 'active' : ''}`}>
              <input
                type="checkbox"
                checked={effectiveSceneIds.includes(scene.id)}
                onChange={(event) => {
                  onSelectSceneIds(
                    event.target.checked
                      ? [...effectiveSceneIds, scene.id].slice(0, 6)
                      : effectiveSceneIds.filter((id) => id !== scene.id),
                  );
                }}
              />
              <span>
                <strong>{scene.title}</strong>
                <small>{scene.audience || '待补人群'} · {isSceneConfirmed(scene) ? '已确认' : '待确认'}</small>
              </span>
              <button
                type="button"
                className="ghost small"
                onClick={(event) => {
                  event.preventDefault();
                  setEditingSceneId(scene.id);
                }}
              >
                编辑
              </button>
            </label>
          ))}
        </div>
        {editingScene ? (
          <details className="scene-agent-form-drawer">
            <summary>
              <span>人工确认：{editingScene.title}</span>
              <strong>{editingSceneCompleteness.completed}/{editingSceneCompleteness.total}</strong>
            </summary>
            <div className="scene-card-editor conversation">
              <label>
                <span>场景标题</span>
                <input value={sceneDraft.title} onChange={(event) => updateSceneDraft('title', event.target.value)} />
              </label>
              <label>
                <span>目标人群</span>
                <input value={sceneDraft.audience} onChange={(event) => updateSceneDraft('audience', event.target.value)} />
              </label>
              <label>
                <span>问题 / 痛点</span>
                <textarea value={sceneDraft.painPoint} onChange={(event) => updateSceneDraft('painPoint', event.target.value)} />
              </label>
              <label>
                <span>使用场景</span>
                <textarea value={sceneDraft.usageScene} onChange={(event) => updateSceneDraft('usageScene', event.target.value)} />
              </label>
              <label>
                <span>画面构图</span>
                <textarea value={sceneDraft.visualComposition} onChange={(event) => updateSceneDraft('visualComposition', event.target.value)} />
              </label>
              <label>
                <span>卖点表达</span>
                <textarea value={sceneDraft.sellingPoint} onChange={(event) => updateSceneDraft('sellingPoint', event.target.value)} />
              </label>
              <label>
                <span>口播方向</span>
                <textarea value={sceneDraft.voiceoverDirection} onChange={(event) => updateSceneDraft('voiceoverDirection', event.target.value)} />
              </label>
              <label>
                <span>图片素材建议</span>
                <textarea value={sceneDraft.imageMaterialSuggestion} onChange={(event) => updateSceneDraft('imageMaterialSuggestion', event.target.value)} />
              </label>
              <label>
                <span>视频素材建议</span>
                <textarea value={sceneDraft.videoMaterialSuggestion} onChange={(event) => updateSceneDraft('videoMaterialSuggestion', event.target.value)} />
              </label>
              <div className="scene-agent-turn-actions">
                {workspaceReady && !busy ? (
                  <button type="button" className="primary small" onClick={confirmEditingScene}>
                    确认场景卡
                  </button>
                ) : <span className="scene-prompt-inline-recovery">{busy ? '处理中' : '待选择工作区'}</span>}
              </div>
            </div>
          </details>
        ) : null}
      </>
    ) : null
  );

  const agentArtifact = !hasScenes ? null : !hasPromptGroup ? (
    null
  ) : (
    <>
      <div className="scene-agent-turn-head">
        <strong>已生成 {promptItems.length} 条 Prompt</strong>
        <small>{handoffStatusLabel}</small>
      </div>
      <div className="scene-prompt-item-list conversation">
        {promptItems.map((item, index) => (
          <button
            key={`${item.title}:${index}`}
            type="button"
            className={index === selectedPromptIndex ? 'active' : ''}
            onClick={() => setSelectedPromptIndex(index)}
          >
            <strong>{item.title}</strong>
            <small>{item.content.split('\n').slice(1, 3).join(' / ')}</small>
            {copiedPromptIndex === index ? <small>{`已复制到${lastCopiedTarget || '剪贴板'}。`}</small> : null}
          </button>
        ))}
      </div>
      <details className="agent-turn-details">
        <summary>查看选中 Prompt</summary>
        <pre>{selectedPrompt?.content || '暂无可预览 Prompt。'}</pre>
      </details>
      <div className="scene-prompt-handoff-modes" role="tablist" aria-label="交接方式">
        <button type="button" className={handoffMode === 'internal' ? 'active' : ''} onClick={() => setHandoffMode('internal')}>
          内部下游
        </button>
        {canUseExternalHandoff ? (
          <button type="button" className={handoffMode === 'external' ? 'active' : ''} onClick={() => setHandoffMode('external')}>
            外部工具
          </button>
        ) : null}
      </div>
      {handoffMode === 'external' && purpose === 'video' ? (
        <label className="scene-prompt-target-select">
          <span>第三方视频平台</span>
          <select value={videoTarget} onChange={(event) => setVideoTarget(event.target.value)}>
            {VIDEO_PROMPT_TARGET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}
      {handoffMode === 'external' && purpose === 'image' ? (
        <label className="scene-prompt-target-select">
          <span>外部图片去向</span>
          <select value={imageExternalTarget} onChange={(event) => setImageExternalTarget(event.target.value)}>
            {IMAGE_EXTERNAL_TARGET_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="scene-agent-turn-actions">
        {handoffMode === 'internal' ? (
          canUseInternalDownstream ? (
            <button type="button" className="primary small" onClick={useInternalDownstream}>
              {internalDestinationLabel(purpose)}
            </button>
          ) : <span className="scene-prompt-inline-recovery">待选择可交付 Prompt</span>
        ) : (
          canCopyExternal ? (
            <button type="button" className="primary small" onClick={() => void copyPromptItem()}>
              {copiedPromptIndex === selectedPromptIndex ? '已复制' : externalCopyLabel(purpose)}
            </button>
          ) : <span className="scene-prompt-inline-recovery">待选择可复制 Prompt</span>
        )}
        {selectedPrompt && purpose === 'image' ? (
          <button type="button" className="ghost small" onClick={() => onUsePromptInImage(selectedPrompt.content, effectiveSceneIds)}>
            图片生成
          </button>
        ) : null}
        {activeDraft && purpose === 'video' ? (
          <>
            <button type="button" className="ghost small" onClick={openVideoPromptDraft}>
              视频 Prompt
            </button>
            <button type="button" className="ghost small" onClick={openVideoImportForDraft}>
              成品导入
            </button>
          </>
        ) : null}
        {activeDraft && purpose === 'green-screen' ? (
          <button type="button" className="ghost small" onClick={() => onUsePromptInGreenScreen(activeDraft.id)}>
            绿幕文案图
          </button>
        ) : null}
        <button type="button" className="ghost small" onClick={() => onSelectModule('assets-prompt-workbench')}>
          Prompt 工作台
        </button>
      </div>
      {relatedDrafts.length ? (
        <details className="scene-agent-history-drawer">
          <summary>
            <span>提示词草稿</span>
            <strong>{relatedDrafts.length} 个版本</strong>
          </summary>
          <div className="prompt-version-list conversation">
            {relatedDrafts.map((draft) => (
              <article key={draft.id} className={draft.id === activeDraft?.id ? 'active' : ''}>
                <strong>{draft.title}</strong>
                <span>{promptPurposeLabel(draft.purpose)} · {draft.versions.length} 个版本 · {statusText(draft)}</span>
                <small>
                  来源：{draft.inputSourceIds.length} 份资料
                  {draft.sceneCardIds?.length ? ` · ${draft.sceneCardIds.length} 张场景卡` : ''}
                  {draft.workflowRunId ? ' · 已关联 SOP' : ''}
                </small>
                <small>更新于 {formatTime(draft.updatedAt)}</small>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </>
  );

  const agentFooter = (
    <>
      <div className="agent-composer-meta">
        <label>
          <span>输出</span>
          <select value={purpose} onChange={(event) => setPurpose(event.target.value as PromptDraftPurpose)}>
            {PURPOSE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.result}</option>
            ))}
          </select>
        </label>
        <label>
          <span>交付</span>
          <select
            value={handoffMode}
            disabled={!hasPromptGroup || !canUseExternalHandoff}
            onChange={(event) => setHandoffMode(event.target.value as ScenePromptHandoffMode)}
          >
            <option value="internal">{internalDestinationLabel(purpose)}</option>
            {canUseExternalHandoff ? <option value="external">{externalCopyLabel(purpose)}</option> : null}
          </select>
        </label>
        {handoffMode === 'external' && purpose === 'video' ? (
          <label>
            <span>平台</span>
            <select value={videoTarget} onChange={(event) => setVideoTarget(event.target.value)}>
              {VIDEO_PROMPT_TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        {handoffMode === 'external' && purpose === 'image' ? (
          <label>
            <span>去向</span>
            <select value={imageExternalTarget} onChange={(event) => setImageExternalTarget(event.target.value)}>
              {IMAGE_EXTERNAL_TARGET_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        ) : null}
        <div>
          <span>状态</span>
          <strong>{composerStatus}</strong>
        </div>
      </div>
      {agentQuickMessages.length && hasScenes ? (
        <div className="scene-agent-quick-actions">
          {agentQuickMessages.map((message) => (
            <button key={message} type="button" onClick={() => setAgentMessage(message)}>
              {message}
            </button>
          ))}
        </div>
      ) : null}
      <div className="scene-agent-composer">
        <textarea
          value={agentMessage}
          onChange={(event) => setAgentMessage(event.target.value)}
          placeholder={hasScenes ? '输入判断、追问或改写要求。' : '先生成场景卡，或说明你要补的输入源。'}
        />
        <div className="agent-composer-actions">
          {!hasScenes ? (
            <>
              <button type="button" className="primary small" disabled={primaryActionDisabled} onClick={runPrimaryAction}>
                {primaryActionLabel}
              </button>
              <button type="button" className="ghost small" disabled={!canOpenKnowledge} onClick={() => onSelectModule('knowledge-inputs')}>
                输入源
              </button>
            </>
          ) : !hasPromptGroup ? (
            <>
              <button type="button" className="primary small" disabled={!canGeneratePrompt} onClick={generatePromptGroup}>
                生成 Prompt
              </button>
              {activeAgentSession ? (
                <button type="button" className="ghost small" disabled={!canContinueAgentSession} onClick={submitAgentMessage}>发送</button>
              ) : (
                <button type="button" className="ghost small" disabled={!canStartAgentSession} onClick={submitAgentMessage}>启动对话</button>
              )}
            </>
          ) : (
            <>
              {handoffMode === 'external' ? (
                <button type="button" className="primary small" disabled={!canCopyExternal} onClick={() => void copyPromptItem()}>
                  {copiedPromptIndex === selectedPromptIndex ? '已复制' : externalCopyLabel(purpose)}
                </button>
              ) : (
                <button type="button" className="primary small" disabled={!canUseInternalDownstream} onClick={useInternalDownstream}>
                  {internalDestinationLabel(purpose)}
                </button>
              )}
              <button type="button" className="ghost small" disabled={activeAgentSession ? !canContinueAgentSession : !canStartAgentSession} onClick={submitAgentMessage}>
                {activeAgentSession ? '发送' : '启动对话'}
              </button>
            </>
          )}
        </div>
      </div>
      <details className="agent-composer-drawer">
        <summary>
          <span>生成约束</span>
          <HelpHint text="仅用于本次输出的边界要求，默认保留来源追溯和合规限制。" />
        </summary>
        <textarea value={userIntent} onChange={(event) => setUserIntent(event.target.value)} />
      </details>
    </>
  );

  return (
    <section className="scene-prompt-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={activeDraft?.title ?? feature.title}
        density="compact"
        actions={(
          <div className="workflow-summary-stack scene-prompt-header-actions">
            <span className="status-pill">{selectedScenes.length || sceneCards.length} 张场景</span>
            <span className={`status-pill ${confirmedSceneCount ? 'ready' : 'idle'}`}>
              确认 {confirmedSceneCount}/{sceneCards.length}
            </span>
            <span className={`status-pill ${statusClass(activeDraft)}`}>{statusText(activeDraft)}</span>
          </div>
        )}
      />

      <AgentSessionPanel
        eyebrow="场景 Prompt"
        title={activeAgentSession?.title ?? activeDraft?.title ?? '场景卡到可交付 Prompt'}
        session={activeAgentSession}
        sessions={relatedAgentSessions}
        transcriptLabel={null}
        statusLabel={activeAgentSession ? AGENT_SESSION_STATUS_LABELS[activeAgentSession.status] : undefined}
        statusTone={sessionStatusClass(activeAgentSession)}
        steps={activeAgentSession || isAgentRunning ? agentSteps : []}
        runningLabel={isAgentRunning ? currentActionLabel ?? '正在处理选中场景。' : undefined}
        context={agentContext}
        artifact={agentArtifact}
        footer={agentFooter}
        empty={null}
        onSelectSession={onSelectAgentSession}
        onResolveAction={onResolveAgentAction}
        messageTitle={agentMessageTitle}
        messageMeta={(message) => `${AGENT_MESSAGE_KIND_LABELS[message.kind]} · ${formatTime(message.createdAt)}`}
        messagePreview={compactAgentMessage}
      />
    </section>
  );
}
