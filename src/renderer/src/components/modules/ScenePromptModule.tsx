import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type { PromptDraft, PromptDraftPurpose, PromptPack, SceneCard } from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { VIDEO_PROMPT_TARGET_OPTIONS, targetLabel as videoPromptTargetLabel } from '../../app/videoPromptFlow';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { UserJourneyGuide } from '../UserJourneyGuide';

interface ScenePromptModuleProps {
  module: 'knowledge-scenes' | 'image-scene-prompts';
  workspaceReady: boolean;
  busy: boolean;
  sceneCards: SceneCard[];
  promptDrafts: PromptDraft[];
  activePromptPack?: PromptPack;
  citationCount: number;
  selectedSceneIds: string[];
  onSelectSceneIds: (sceneIds: string[]) => void;
  onGenerateSceneCards: () => void;
  onGenerateScenePromptDraft: (input: {
    sceneCardIds: string[];
    purpose: PromptDraftPurpose;
    userIntent: string;
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
  activePromptPack,
  citationCount,
  selectedSceneIds,
  onSelectSceneIds,
  onGenerateSceneCards,
  onGenerateScenePromptDraft,
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
  const activeDraft =
    relatedDrafts[0] ??
    promptDrafts.find((draft) => draft.purpose === purpose && draft.userIntent.includes('基于已确认场景卡'));
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

  return (
    <section className="scene-prompt-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="flow"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{sceneCards.length} 张场景卡</span>
            <span className={`status-pill ${confirmedSceneCount ? 'ready' : 'idle'}`}>
              已确认 {confirmedSceneCount}
            </span>
            <span className={`status-pill ${activePromptPack ? 'ready' : 'blocked'}`}>
              {activePromptPack ? '提示词包已连接' : citationCount > 0 ? '可自动生成提示词包' : '先导入知识'}
            </span>
            <span className={`status-pill ${statusClass(activeDraft)}`}>{statusText(activeDraft)}</span>
          </div>
        )}
      >
        <div className="module-command-flow">
          <div>
            <p className="eyebrow">主链路</p>
            <h3>品牌 / 产品知识库 → 场景库 → Prompt 组 → 图片 / 视频素材</h3>
          </div>
          <div className="workflow-actions">
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge')}>
              回到知识库
            </button>
            <button className="ghost small" disabled={!canGenerateScenes} onClick={onGenerateSceneCards}>
              生成场景卡
            </button>
          </div>
        </div>
        <div className="v2-flow-steps module-command-steps">
          {feature.flow.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
        {!activePromptPack ? (
          <div className="inline-warning">
            需要知识引用才能生成场景库；当前会优先使用已选引用，其次使用成型知识库或已转换输入源的默认引用，并自动补一份提示词包。
          </div>
        ) : null}
      </ModuleCommandCenter>

      <UserJourneyGuide
        title={module === 'knowledge-scenes' ? '场景库到素材生产' : '场景提示词到图片生产'}
        description="场景卡是提示词前的中间层。用户先确认场景是否真实，再一次生成多组可复制的图片、视频、文案或绿幕图提示词。"
        steps={[
          {
            key: 'knowledge',
            title: '连接知识来源',
            description: '品牌 / 产品知识库或 IP 场景资料提供事实和合规边界。',
            state: activePromptPack || citationCount > 0 ? 'done' : 'blocked',
            module: 'knowledge-brand',
          },
          {
            key: 'scene',
            title: '生成并确认场景卡',
            description: '确认人群、问题、空间、动作、情绪、镜头和输出用途。',
            state: hasScenes ? (confirmedSceneCount ? 'done' : 'active') : canGenerateScenes ? 'active' : 'next',
          },
          {
            key: 'prompt',
            title: '生成提示词组',
            description: '每条提示词都能直接发送到图片、视频 Prompt、文案或绿幕图。',
            state: hasPromptGroup ? 'done' : hasScenes ? 'active' : 'idle',
          },
          {
            key: 'deliver',
            title: '进入下游生产',
            description: '图片走生成和审核；视频只复制到第三方，成品手动导入。',
            state: hasPromptGroup ? 'next' : 'idle',
          },
        ]}
        actions={[
          { label: '生成场景卡', onClick: onGenerateSceneCards, disabled: !canGenerateScenes },
          { label: `生成${purposeResult(purpose)}`, primary: true, onClick: generatePromptGroup, disabled: !canGeneratePrompt },
          { label: copiedPromptIndex === selectedPromptIndex ? '已复制选中提示词' : '复制选中提示词', onClick: () => void copyPromptItem(), disabled: !selectedPrompt },
          { label: '发送到图片生成', onClick: () => selectedPrompt && onUsePromptInImage(selectedPrompt.content, effectiveSceneIds), disabled: !selectedPrompt || purpose !== 'image' },
          { label: '打开视频 Prompt', onClick: openVideoPromptDraft, disabled: !activeDraft || purpose !== 'video' },
        ]}
        onSelectModule={onSelectModule}
      />

      <div className="scene-prompt-layout">
        <aside className="panel scene-prompt-scenes-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">场景库</p>
              <h3>选择本次要生产的场景</h3>
            </div>
            <span className="status-pill">{selectedScenes.length} 已选</span>
          </div>
          <div className="scene-prompt-scene-list">
            {sceneCards.map((scene) => (
              <label key={scene.id} className={`scene-prompt-card ${effectiveSceneIds.includes(scene.id) ? 'active' : ''}`}>
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
                  <small>{scene.audience} · {scene.usageScene}</small>
                  <small>{isSceneConfirmed(scene) ? '已确认' : '待确认'} · 更新于 {formatTime(scene.updatedAt)}</small>
                  <small>
                    已关联提示词包
                    {scene.workflowRunId ? ' · 已关联 SOP' : ''}
                    {scene.inputSourceIds?.length ? ` · 资料 ${scene.inputSourceIds.length} 份` : ''}
                    {scene.citations.length ? ` · 引用 ${scene.citations.length}` : ''}
                  </small>
                  <em>{scene.painPoint}</em>
                  <button
                    type="button"
                    className="ghost small"
                    onClick={(event) => {
                      event.preventDefault();
                      setEditingSceneId(scene.id);
                    }}
                  >
                    编辑确认
                  </button>
                </span>
              </label>
            ))}
            {sceneCards.length === 0 ? (
              <div className="empty-state">
                还没有场景卡。可直接点击“生成场景卡”，系统会基于当前知识引用自动补提示词包；未配置文字模型时会保留待配置状态，不伪造场景。
              </div>
            ) : null}
          </div>
        </aside>

        <main className="panel scene-prompt-builder-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">提示词生产</p>
              <h3>{purposeResult(purpose)}</h3>
            </div>
            <span className="status-pill">{promptItems.length} 条</span>
          </div>

          <div className="purpose-tabs" role="tablist" aria-label="下游用途">
            {PURPOSE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={purpose === option.value ? 'active' : ''}
                onClick={() => setPurpose(option.value)}
              >
                <strong>{option.label}</strong>
                <small>{option.result}</small>
              </button>
            ))}
          </div>

          <label className="scene-prompt-intent">
            <span>本次生成意图</span>
            <textarea value={userIntent} onChange={(event) => setUserIntent(event.target.value)} />
          </label>

          <div className="workflow-actions left">
            <button
              className="primary small"
              disabled={!canGeneratePrompt}
              onClick={generatePromptGroup}
            >
              生成{purposeResult(purpose)}
            </button>
            <button
              className="ghost small"
              disabled={!selectedPrompt}
              onClick={() => void copyPromptItem()}
            >
              {copiedPromptIndex === selectedPromptIndex ? '已复制选中提示词' : '复制选中提示词'}
            </button>
            <button
              className="ghost small"
              disabled={!selectedPrompt || purpose !== 'image'}
              onClick={() => selectedPrompt && onUsePromptInImage(selectedPrompt.content, effectiveSceneIds)}
            >
              发送选中 Prompt 到图片生成
            </button>
            <button
              className="ghost small"
              disabled={!activeDraft || purpose !== 'video'}
              onClick={() => activeDraft && onUsePromptInVideo(activeDraft.id)}
            >
              打开视频 Prompt
            </button>
            <button
              className="ghost small"
              disabled={!activeDraft || purpose !== 'green-screen'}
              onClick={() => activeDraft && onUsePromptInGreenScreen(activeDraft.id)}
            >
              打开绿幕文案图
            </button>
          </div>

          <section className="scene-prompt-handoff-panel" aria-label="下游交接">
            <div className="scene-prompt-handoff-head">
              <div>
                <p className="eyebrow">下游交接</p>
                <h4>{handoffMode === 'external' ? externalCopyLabel(purpose) : internalDestinationLabel(purpose)}</h4>
              </div>
              <span className={`status-pill ${handoffStatusClass}`}>{handoffStatusLabel}</span>
            </div>
            <div className="scene-prompt-handoff-modes" role="tablist" aria-label="交接方式">
              <button
                type="button"
                className={handoffMode === 'internal' ? 'active' : ''}
                onClick={() => setHandoffMode('internal')}
              >
                内部下游
              </button>
              <button
                type="button"
                className={handoffMode === 'external' ? 'active' : ''}
                disabled={purpose === 'article' || purpose === 'green-screen'}
                onClick={() => setHandoffMode('external')}
              >
                外部工具
              </button>
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
            <div className="scene-prompt-handoff-actions">
              {handoffMode === 'internal' ? (
                <button className="primary small" disabled={!canUseInternalDownstream} onClick={useInternalDownstream}>
                  {internalDestinationLabel(purpose)}
                </button>
              ) : (
                <button className="primary small" disabled={!canCopyExternal} onClick={() => void copyPromptItem()}>
                  {copiedPromptIndex === selectedPromptIndex ? '已复制' : externalCopyLabel(purpose)}
                </button>
              )}
              {purpose === 'video' ? (
                <button className="ghost small" disabled={!activeDraft} onClick={openVideoImportForDraft}>
                  去导入成品
                </button>
              ) : null}
            </div>
            <p>
              {handoffMode === 'external'
                ? '外部生成过程不进入软件任务；成品回来后再手动导入并关联原 Prompt。'
                : internalDestinationDescription(purpose)}
            </p>
          </section>

          <div className="scene-prompt-result-grid">
            <div className="scene-prompt-item-list">
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
              {promptItems.length === 0 ? (
                <div className="empty-state">选择场景卡并生成 Prompt 组后，这里会出现可单条发送或复制的下游 Prompt。</div>
              ) : null}
            </div>
            <div className="scene-prompt-preview">
              <div className="scene-prompt-preview-head">
                <p className="eyebrow">选中提示词</p>
                <button className="ghost small" disabled={!selectedPrompt} onClick={() => void copyPromptItem()}>
                  {copiedPromptIndex === selectedPromptIndex ? '已复制' : '复制'}
                </button>
              </div>
              <pre>{selectedPrompt?.content || '暂无可预览 Prompt。'}</pre>
            </div>
          </div>
        </main>

        <aside className="panel scene-prompt-facts-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">场景确认</p>
              <h3>{editingScene?.title ?? '选择场景卡'}</h3>
            </div>
            {editingScene ? (
              <span className={`status-pill ${isSceneConfirmed(editingScene) ? 'ready' : 'idle'}`}>
                {isSceneConfirmed(editingScene) ? '已确认' : '待确认'}
              </span>
            ) : null}
          </div>
          {editingScene ? (
            <div className="scene-card-editor">
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
              <div className="workflow-actions">
                <button className="primary small" disabled={!workspaceReady || busy} onClick={confirmEditingScene}>
                  确认场景卡
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-state">选择一张场景卡后，可以在这里确认字段再进入下游生产。</div>
          )}
          <div className="scene-facts-divider" />
          <div className="panel-title compact">
            <div>
              <p className="eyebrow">下游与追溯</p>
              <h3>不要丢失业务边界</h3>
            </div>
          </div>
          <div className="downstream-action-list">
            <button type="button" disabled={!selectedPrompt} onClick={() => selectedPrompt && onUsePromptInImage(selectedPrompt.content, effectiveSceneIds)}>
              <strong>图片生成</strong>
              <small>把选中图片提示词放入现有图片模块，继续走真实图片生成服务或待配置结果。</small>
            </button>
            <button type="button" disabled={!activeDraft} onClick={openVideoPromptDraft}>
              <strong>视频 Prompt</strong>
              <small>复制 15 秒视频 Prompt 到第三方平台，软件只记录复制动作。</small>
            </button>
            <button type="button" disabled={!activeDraft} onClick={openVideoImportForDraft}>
              <strong>成品导入</strong>
              <small>第三方生成后只允许用户手动导入视频文件，并关联原 Prompt。</small>
            </button>
            <button type="button" onClick={() => onSelectModule('assets-prompt-workbench')}>
              <strong>Prompt 工作台</strong>
              <small>继续人工改写、确认版本，或沉淀为可复用任务。</small>
            </button>
          </div>
          <div className="scene-prompt-fact-list">
            {selectedScenes.map((scene) => (
              <article key={scene.id}>
                <strong>{scene.title}</strong>
                <span>画面：{scene.visualComposition}</span>
                <span>图片：{scene.imageMaterialSuggestion}</span>
                <span>视频：{scene.videoMaterialSuggestion}</span>
                <span>
                  来源：已关联提示词包
                  {scene.workflowRunId ? ' · 已关联 SOP' : ''}
                  {scene.inputSourceIds?.length ? ` · 资料 ${scene.inputSourceIds.length} 份` : ''}
                </span>
              </article>
            ))}
          </div>
        </aside>
      </div>

      <section className="panel scene-prompt-draft-strip">
        <div className="panel-title">
          <div>
            <p className="eyebrow">提示词草稿</p>
            <h3>当前用途的场景提示词版本</h3>
          </div>
        </div>
        <div className="prompt-version-list">
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
          {relatedDrafts.length === 0 ? <div className="empty-state">暂无关联提示词草稿。</div> : null}
        </div>
      </section>
    </section>
  );
}
