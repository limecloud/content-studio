import { useEffect, useMemo, useRef, useState } from 'react';
import type { ModuleKey, V2ModuleKey } from '../../app/types';
import type {
  ContentKnowledgeRelease,
  ContentKnowledgeReleaseReference,
  InputSourceRecord,
  InputSourcePurpose,
  PlatformDraftRecord,
  PromptDraft,
  PromptDraftPurpose,
  PromptDraftStatus,
  LoadedSkill,
  SkillRef,
  TextGenerationProtocol,
} from '../../../../shared/types';
import { isPromptDistilledSource, isReusablePromptInputSource } from '../../../../shared/inputSourcePolicy';
import { skillKey, textProtocolLabel } from '../../app/formatters';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { PlatformDraftTraceList } from '../PlatformDraftTraceList';
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
  platformDrafts: PlatformDraftRecord[];
  teamKnowledgePackageVersions: ContentKnowledgeRelease[];
  copiedPlatformDraftId: string | null;
  skills: LoadedSkill[];
  enabledSkillKeys: Set<string>;
  textProtocol?: TextGenerationProtocol;
  activeDraftId: string;
  onSelectDraft: (draftId: string) => void;
  onGenerateDraft: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
    selectedSkills?: SkillRef[];
    selectedSkillSlugs?: string[];
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
  onMaterializeDraftToSkill: (input: { draftId: string; content: string }) => void;
  onRevealPath: (path: string) => void;
  onCopyPlatformDraft: (draftId: string) => void;
  onOpenRunTrace: (runTraceId: string) => void;
  onOpenSourceLog: (sourceLogId: string) => void;
  onSelectModule: (module: ModuleKey) => void;
}

interface PromptDownstreamAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

const PURPOSE_OPTIONS: Array<{ value: PromptDraftPurpose; label: string }> = [
  { value: 'image', label: '图片 Prompt' },
  { value: 'video', label: '视频 Prompt' },
  { value: 'article', label: '文案 Prompt' },
  { value: 'green-screen', label: '绿幕文案图' },
  { value: 'content-task', label: '内容任务' },
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
  'content-task': {
    title: '内容任务草稿',
    userIntent: '把已跑通的方法整理为可复用内容任务，保留输入、输出和事实边界。',
  },
  sop: {
    title: '方法草稿',
    userIntent: '把已跑通的方法整理为可复用 Prompt 或 Skill 草稿，保留输入、输出和事实边界。',
  },
  skill: {
    title: 'Skill 草案',
    userIntent: '把稳定的 Prompt 编排方法沉淀为本地 skill，写清输入、输出、事实边界和执行规范。',
  },
};

const PURPOSE_SOURCE_PRIORITIES: Record<PromptDraftPurpose, InputSourcePurpose[]> = {
  image: ['ip-scenario-kb', 'brand-kb', 'product-brief', 'user-feedback', 'competitor-observation', 'reference', 'successful-asset', 'task-input', 'sop-input'],
  video: ['ip-scenario-kb', 'brand-kb', 'product-brief', 'user-feedback', 'competitor-observation', 'reference', 'successful-asset', 'task-input', 'sop-input'],
  article: ['user-feedback', 'ip-scenario-kb', 'ip-kb', 'brand-kb', 'product-brief', 'competitor-observation', 'task-input', 'sop-input', 'successful-asset', 'reference'],
  'green-screen': ['user-feedback', 'ip-scenario-kb', 'brand-kb', 'product-brief', 'competitor-observation', 'task-input', 'sop-input', 'successful-asset'],
  'content-task': ['task-input', 'sop-input', 'user-feedback', 'brand-kb', 'ip-kb', 'ip-scenario-kb', 'product-brief', 'competitor-observation', 'successful-asset', 'reference'],
  sop: ['sop-input', 'task-input', 'user-feedback', 'brand-kb', 'ip-kb', 'ip-scenario-kb', 'product-brief', 'competitor-observation', 'successful-asset', 'reference'],
  skill: ['task-input', 'sop-input', 'user-feedback', 'brand-kb', 'ip-kb', 'ip-scenario-kb', 'product-brief', 'competitor-observation', 'successful-asset', 'reference'],
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
  'competitor-observation': '竞品观察',
  reference: '参考素材',
  'product-brief': '产品资料',
  'user-feedback': '评论 / 客服问题',
  'task-input': '任务输入',
  'sop-input': '任务输入',
  'successful-asset': '成功素材',
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

function teamKnowledgeReleaseReference(release?: ContentKnowledgeRelease): ContentKnowledgeReleaseReference | undefined {
  if (!release) return undefined;
  return {
    id: release.serverReleaseId || release.id,
    title: release.title,
    version: release.version,
    contentKnowledgeMapId: release.contentKnowledgeMapId,
    contentKnowledgeMapTitle: release.contentKnowledgeMapTitle,
    packageObjectKey: release.packageObjectKey,
    packagePublicUrl: release.packagePublicUrl,
    packageUploadStatus: release.packageUploadStatus,
    approvalStatus: release.approvalStatus,
  };
}

function teamKnowledgeReleaseLabel(release: ContentKnowledgeRelease): string {
  const status = release.packageUploadStatus ? ` · ${release.packageUploadStatus}` : '';
  return `${release.title} ${release.version}${status}`;
}

export function PromptWorkbenchModule({
  featureKey = 'video-creative',
  initialPurpose = 'video',
  initialTitle = '创意视频 Prompt 草稿',
  initialUserIntent = '基于品牌 / IP 资产生成 15 秒创意视频方向和可复制视频 Prompt。',
  workspaceReady,
  busy,
  inputSources,
  promptDrafts,
  platformDrafts,
  teamKnowledgePackageVersions,
  copiedPlatformDraftId,
  skills,
  enabledSkillKeys,
  textProtocol,
  activeDraftId,
  onSelectDraft,
  onGenerateDraft,
  onUpdateDraft,
  onUsePromptInImage,
  onOpenVideoPrompt,
  onUsePromptInArticle,
  onOpenGreenScreen,
  onMaterializeDraftToSkill,
  onRevealPath,
  onCopyPlatformDraft,
  onOpenRunTrace,
  onOpenSourceLog,
  onSelectModule,
}: PromptWorkbenchModuleProps) {
  const feature = V2_FEATURES[featureKey];
  const [purpose, setPurpose] = useState<PromptDraftPurpose>(initialPurpose);
  const [title, setTitle] = useState(initialTitle);
  const [userIntent, setUserIntent] = useState(initialUserIntent);
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [selectedSkillKeys, setSelectedSkillKeys] = useState<string[]>([]);
  const [selectedTeamReleaseId, setSelectedTeamReleaseId] = useState('');
  const sourceSelectionModeRef = useRef<'auto' | 'manual'>('auto');
  const teamReleaseSelectionModeRef = useRef<'auto' | 'manual'>('auto');
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
  const publishedTeamKnowledgeReleases = useMemo(
    () => teamKnowledgePackageVersions
      .filter((release) => release.status === 'published')
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [teamKnowledgePackageVersions],
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
  const [draftContent, setDraftContent] = useState(activeContent(activeDraft));
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
  const selectedTeamRelease = useMemo(
    () => publishedTeamKnowledgeReleases.find((release) => (
      release.id === selectedTeamReleaseId ||
      release.serverReleaseId === selectedTeamReleaseId
    )),
    [publishedTeamKnowledgeReleases, selectedTeamReleaseId],
  );
  const selectedTeamReleaseRef = useMemo(
    () => teamKnowledgeReleaseReference(selectedTeamRelease),
    [selectedTeamRelease],
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

  useEffect(() => {
    if (teamReleaseSelectionModeRef.current === 'manual') return;
    const draftReleaseId = activeDraft?.teamKnowledgeRelease?.id;
    const preferredId = draftReleaseId || publishedTeamKnowledgeReleases[0]?.serverReleaseId || publishedTeamKnowledgeReleases[0]?.id || '';
    setSelectedTeamReleaseId(preferredId);
  }, [
    activeDraft?.id,
    activeDraft?.teamKnowledgeRelease?.id,
    publishedTeamKnowledgeReleases,
  ]);

  const canGenerate = workspaceReady && !busy && userIntent.trim().length > 0;
  const canSave = workspaceReady && !busy && Boolean(activeDraft) && draftContent.trim().length > 0;
  const canUseCurrentDraft = canSave && Boolean(activeDraft);
  const activePurpose = activeDraft?.purpose ?? purpose;
  const activeDraftTextProtocol = activeDraft?.textProtocol ?? textProtocol;
  const downstreamAction: PromptDownstreamAction | undefined =
    activePurpose === 'image'
      ? { label: '发送到图片生成', disabled: !canUseCurrentDraft, onClick: () => activeDraft && onUsePromptInImage(draftContent, activeDraft.sceneCardIds) }
      : activePurpose === 'video'
        ? { label: '打开视频 Prompt', disabled: !canUseCurrentDraft, onClick: () => activeDraft && onOpenVideoPrompt(activeDraft.id) }
        : activePurpose === 'article'
          ? { label: '进入文章生成', disabled: !canUseCurrentDraft, onClick: () => activeDraft && onUsePromptInArticle(activeDraft.id, draftContent) }
          : activePurpose === 'green-screen'
            ? { label: '生成绿幕图', disabled: !canUseCurrentDraft, onClick: () => activeDraft && onOpenGreenScreen(activeDraft.id) }
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

      <details className="prompt-support-drawer" open>
        <summary>
          <span>支撑资料</span>
          <strong>{activeDraft ? '输入源 / 草稿 / 版本库' : '输入源和草稿编辑'}</strong>
        </summary>
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
              <span>团队知识包</span>
              <select
                value={selectedTeamReleaseId}
                onChange={(event) => {
                  teamReleaseSelectionModeRef.current = 'manual';
                  setSelectedTeamReleaseId(event.target.value);
                }}
              >
                <option value="">不绑定</option>
                {publishedTeamKnowledgeReleases.map((release) => (
                  <option key={release.serverReleaseId || release.id} value={release.serverReleaseId || release.id}>
                    {teamKnowledgeReleaseLabel(release)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>用户意图</span>
              <textarea value={userIntent} onChange={(event) => setUserIntent(event.target.value)} />
            </label>
          </div>
          <div className="prompt-team-release-hint">
            {selectedTeamReleaseRef
              ? `本轮会绑定「${selectedTeamReleaseRef.title} ${selectedTeamReleaseRef.version}」，草稿和协作记录会沿用同一套已审核口径。`
              : '没有已发布团队知识包时，草稿仍可生成，但只使用当前输入源和用户意图。'}
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
              <div className="empty-state">还没有输入源。先在成型知识库选择来源，或在当前任务中粘贴产品资料和参考素材。</div>
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
              disabled={!canGenerate}
              onClick={() => onGenerateDraft({ title, purpose, userIntent, inputSourceIds: reusableSelectedSourceIds, teamKnowledgeRelease: selectedTeamReleaseRef, selectedSkills: selectedSkillRefs, selectedSkillSlugs: selectedSkillRefs.map((skill) => skill.slug) })}
            >
              生成草稿
            </button>
            <button className="ghost small" onClick={() => onSelectModule('knowledge')}>补知识来源</button>
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
                  <StatusPill tone="ready">已关联历史</StatusPill>
                ) : null}
                {activeDraft.teamKnowledgeRelease ? (
                  <StatusPill tone="ready">团队知识包</StatusPill>
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
              {activeDraft.teamKnowledgeRelease ? (
                <div className="inline-warning subtle">
                  当前草稿使用团队知识包「{activeDraft.teamKnowledgeRelease.title} {activeDraft.teamKnowledgeRelease.version}」，下游生产会沿用同一套已审核口径。
                </div>
              ) : null}
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
                    onOpenRunTrace={onOpenRunTrace}
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
                meta={`${PURPOSE_LABELS[draft.purpose]} · ${draft.versions.length} 个版本 · ${draft.inputSourceIds.length} 个输入源${draft.sceneCardIds?.length ? ` · ${draft.sceneCardIds.length} 张场景卡` : ''}${draft.teamKnowledgeRelease ? ` · ${draft.teamKnowledgeRelease.version}` : ''}${draft.workflowRunId ? ' · 已关联历史' : ''} · ${modelLabel(draft.model)} · ${textProtocolLabel(draft.textProtocol)}`}
                onClick={() => onSelectDraft(draft.id)}
              />
            ))}
            {visibleDrafts.length === 0 ? <div className="empty-state">暂无{PURPOSE_LABELS[purpose]}草稿。</div> : null}
          </div>
          </aside>
        </div>
        {selectedSources.length ? (
          <section className="panel prompt-source-footprint">
            <p className="eyebrow">来源追溯</p>
            <div className="workflow-run-steps">
              {activeDraft?.workflowRunId ? <span>已关联历史</span> : null}
              {activeDraft?.sceneCardIds?.length ? <span>场景卡：{activeDraft.sceneCardIds.length} 张</span> : null}
              {selectedSources.map((source) => (
                <span key={source.id}>{source.title}</span>
              ))}
            </div>
          </section>
        ) : null}
      </details>
    </section>
  );
}
