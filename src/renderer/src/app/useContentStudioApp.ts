import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ArticleGenerationResult,
  ArticleGenerationRequest,
  AppSettingsView,
  GenerationLogEntry,
  GeneratePromptPackInput,
  GenerateSceneCardsInput,
  GlobalGenerationParams,
  ImageGenerationRequest,
  KnowledgeBaseType,
  KnowledgeBaseView,
  KnowledgeCitation,
  KnowledgeSearchResult,
  KnowledgeSection,
  KnowledgeSectionType,
  LoadedSkill,
  MediaGenerationResult,
  ModelConfigView,
  PromptPack,
  SceneCard,
  SkillRef,
  SkillSelectionView,
  VideoBreakdownResult,
  VideoBreakdownRequest,
  VideoGenerationRequest,
  VideoScriptGenerationResult,
  VideoScriptGenerationRequest,
} from '../../../shared/types';
import { DEFAULT_PARAMS, VIDEO_DIMENSIONS } from './constants';
import {
  citationFromResult,
  citationFromSection,
  extractLocalRefsFromLog,
  extractPromptFromLog,
  fileNameFromPath,
  isSameCitation,
  knowledgeBaseKey,
  skillKey,
} from './formatters';
import type { ColorTheme, ModelDraft, ModelSettingView, ModuleKey, ProviderTab, SettingsTab } from './types';

class ActionCancelledError extends Error {
  constructor() {
    super('ACTION_CANCELLED');
  }
}

interface ActionContext {
  isCancelled: () => boolean;
  throwIfCancelled: () => void;
}

export function useContentStudioApp() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light');
  const [colorTheme, setColorTheme] = useState<ColorTheme>('emerald');
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general');
  const [modelSettingView, setModelSettingView] = useState<ModelSettingView>('edit_claude');
  const [providerTab, setProviderTab] = useState<ProviderTab>('recommended');
  const [responsesApiActive, setResponsesApiActive] = useState(false);

  // 通用设置 Switch States
  const [menubarShow, setMenubarShow] = useState(true);
  const [autoStart, setAutoStart] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [reduceAnimation, setReduceAnimation] = useState(false);
  const [syncClaudeHistory, setSyncClaudeHistory] = useState(false);
  const [shortcutActive, setShortcutActive] = useState(true);
  const [commandWhitelist, setCommandWhitelist] = useState(false);



  const [activeModule, setActiveModule] = useState<ModuleKey>('image');
  const [settings, setSettings] = useState<AppSettingsView | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfigView | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelDraft>({ apiEndpoint: '', apiKey: '', textModel: '', imageModels: '', videoModel: '' });
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [skills, setSkills] = useState<LoadedSkill[]>([]);
  const [skillSelection, setSkillSelection] = useState<SkillSelectionView | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseView[]>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState('卖点 合规 场景');
  const [knowledgeBaseFilter, setKnowledgeBaseFilter] = useState<KnowledgeBaseType | 'all'>('all');
  const [knowledgeSectionFilter, setKnowledgeSectionFilter] = useState<KnowledgeSectionType | 'all'>('all');
  const [knowledgeTagFilter, setKnowledgeTagFilter] = useState('');
  const [activeKnowledgeBaseKey, setActiveKnowledgeBaseKey] = useState('');
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [selectedCitations, setSelectedCitations] = useState<KnowledgeCitation[]>([]);
  const [promptPacks, setPromptPacks] = useState<PromptPack[]>([]);
  const [activePromptPackId, setActivePromptPackId] = useState('');
  const [promptPackDraft, setPromptPackDraft] = useState({ brandVoice: '', visualStyle: '' });
  const [sceneCards, setSceneCards] = useState<SceneCard[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [sceneCardDraft, setSceneCardDraft] = useState({ title: '', imageMaterialSuggestion: '', videoMaterialSuggestion: '' });
  const [logs, setLogs] = useState<GenerationLogEntry[]>([]);
  const [params, setParams] = useState<GlobalGenerationParams>(DEFAULT_PARAMS);
  const [productImageRefs, setProductImageRefs] = useState<string[]>([]);
  const [referenceImageRefs, setReferenceImageRefs] = useState<string[]>([]);
  const [videoAssetRefs, setVideoAssetRefs] = useState<string[]>([]);
  const [imagePromptDraft, setImagePromptDraft] = useState('');
  const [imagePromptMode, setImagePromptMode] = useState<ImageGenerationRequest['promptMode']>('preset');
  const [imageGenerationMode, setImageGenerationMode] = useState<ImageGenerationRequest['generationMode']>('smart');
  const [imageTemplate, setImageTemplate] = useState('电商场景图');
  const [imageWatermark, setImageWatermark] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedVideoDimensions, setSelectedVideoDimensions] = useState<string[]>(VIDEO_DIMENSIONS);
  const [videoBreakdown, setVideoBreakdown] = useState<VideoBreakdownResult | null>(null);
  const [videoScript, setVideoScript] = useState<VideoScriptGenerationResult | null>(null);
  const [videoProductName, setVideoProductName] = useState('新产品');
  const [videoSceneBackground, setVideoSceneBackground] = useState('电商真实使用场景');
  const [videoSubtitleMode, setVideoSubtitleMode] = useState('burned-subtitle');
  const [videoVoiceStyle, setVideoVoiceStyle] = useState('自然可信');
  const [videoShotCount, setVideoShotCount] = useState(5);
  const [videoDurationSeconds, setVideoDurationSeconds] = useState(18);
  const [videoCustomRequirement, setVideoCustomRequirement] = useState('保留爆款结构，但所有卖点回到知识库事实源。');
  const [articleType, setArticleType] = useState<ArticleGenerationRequest['articleType']>('wechat-longform');
  const [articlePlatform, setArticlePlatform] = useState('公众号');
  const [articleLength, setArticleLength] = useState<ArticleGenerationRequest['length']>('medium');
  const [articleTopic, setArticleTopic] = useState('成型知识库驱动的内容工程');
  const [articleAudience, setArticleAudience] = useState('关注产品真实价值和使用场景的用户');
  const [articleTone, setArticleTone] = useState('专业、自然、克制');
  const [articleRequirement, setArticleRequirement] = useState('先做人话策略，再给事实引用，最后承接图片和视频素材生成。');
  const [articleResult, setArticleResult] = useState<ArticleGenerationResult | null>(null);
  const [articleExportPath, setArticleExportPath] = useState<string | null>(null);
  const [mediaResult, setMediaResult] = useState<MediaGenerationResult | null>(null);
  const [historyFilter, setHistoryFilter] = useState<GenerationLogEntry['kind'] | 'all'>('all');
  const [copiedLogId, setCopiedLogId] = useState<string | null>(null);
  const [activeSkillKey, setActiveSkillKey] = useState('');
  const [copiedSkillKey, setCopiedSkillKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentActionLabel, setCurrentActionLabel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const actionRunIdRef = useRef(0);
  const cancelledRunIdsRef = useRef(new Set<number>());

  const workspacePath = settings?.workspacePath;
  const enabledSkillKeys = useMemo(() => new Set((skillSelection?.enabledSkills ?? []).map(skillKey)), [skillSelection]);
  const activePromptPack = useMemo(() => promptPacks.find((pack) => pack.id === activePromptPackId) ?? promptPacks[0], [activePromptPackId, promptPacks]);
  const activeKnowledgeBase = useMemo(
    () => knowledgeBases.find((base) => knowledgeBaseKey(base) === activeKnowledgeBaseKey) ?? knowledgeBases[0],
    [activeKnowledgeBaseKey, knowledgeBases],
  );
  const availableKnowledgeTags = useMemo(
    () => Array.from(new Set(knowledgeBases.flatMap((base) => [...base.tags, ...base.sections.flatMap((section) => section.tags)]))).slice(0, 24),
    [knowledgeBases],
  );
  const activeSkill = useMemo(
    () => skills.find((skill) => skillKey(skill) === activeSkillKey) ?? skills[0],
    [activeSkillKey, skills],
  );
  const activeScenes = useMemo(() => sceneCards.filter((card) => selectedSceneIds.includes(card.id)), [sceneCards, selectedSceneIds]);
  const activeEditableScene = activeScenes[0] ?? sceneCards[0];
  const selectedSceneIdsForRequest = activeScenes.length ? activeScenes.map((scene) => scene.id) : sceneCards.slice(0, 1).map((scene) => scene.id);
  const citationsForRequest = selectedCitations.length ? selectedCitations : searchResults.slice(0, 3).map(citationFromResult);
  const filteredLogs = useMemo(() => historyFilter === 'all' ? logs : logs.filter((log) => log.kind === historyFilter), [historyFilter, logs]);
  const suggestedImagePrompt = imagePromptDraft || activeScenes[0]?.imageMaterialSuggestion || activePromptPack?.imagePromptFragments[0] || '根据知识库生成一张电商场景图，突出产品主体和真实使用场景。';
  const suggestedVideoPrompt = videoScript?.videoPrompt || activeScenes[0]?.videoMaterialSuggestion || activePromptPack?.videoPromptFragments.join('\n') || '根据知识库和场景卡生成短视频镜头提示词。';

  async function refresh(nextWorkspace?: string): Promise<void> {
    const [nextSettings, nextModelConfig] = await Promise.all([
      window.contentStudio.getSettings(),
      window.contentStudio.getModelConfig(),
    ]);
    const workspace = nextWorkspace ?? nextSettings.workspacePath;
    const [nextSkills, nextKnowledgeBases, nextSearchResults] = await Promise.all([
      window.contentStudio.scanSkills(workspace),
      window.contentStudio.listKnowledgeBases(workspace),
      window.contentStudio.searchKnowledge({ workspacePath: workspace, query: knowledgeQuery, baseType: knowledgeBaseFilter, sectionType: knowledgeSectionFilter, tag: knowledgeTagFilter }),
    ]);
    setSettings(nextSettings);
    setModelConfig(nextModelConfig);
    setSkills(nextSkills);
    setKnowledgeBases(nextKnowledgeBases);
    setSearchResults(nextSearchResults);
    setParams((current) => ({
      ...current,
      textModel: nextModelConfig.textModel,
      imageModel: nextModelConfig.imageModels[0] ?? current.imageModel,
      videoModel: nextModelConfig.videoModel,
    }));

    if (!workspace) {
      setSkillSelection(null);
      setPromptPacks([]);
      setSceneCards([]);
      setLogs([]);
      return;
    }

    const [nextSelection, nextPromptPacks, nextSceneCards, nextLogs] = await Promise.all([
      window.contentStudio.getSkillSelection(workspace),
      window.contentStudio.listPromptPacks(workspace),
      window.contentStudio.listSceneCards(workspace),
      window.contentStudio.listGenerationLogs(workspace),
    ]);
    setSkillSelection(nextSelection);
    setPromptPacks(nextPromptPacks);
    setSceneCards(nextSceneCards);
    setLogs(nextLogs);
    setActivePromptPackId((current) => current || nextPromptPacks[0]?.id || '');
    setSelectedSceneIds((current) => (current.length ? current : nextSceneCards.slice(0, 2).map((scene) => scene.id)));
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!activePromptPack) return;
    setPromptPackDraft({ brandVoice: activePromptPack.brandVoice, visualStyle: activePromptPack.visualStyle });
  }, [activePromptPack?.id, activePromptPack?.brandVoice, activePromptPack?.visualStyle]);

  useEffect(() => {
    if (!modelConfig) return;
    setModelDraft({
      apiEndpoint: modelConfig.apiEndpoint,
      apiKey: '',
      textModel: modelConfig.textModel,
      imageModels: modelConfig.imageModels.join(', '),
      videoModel: modelConfig.videoModel,
    });
  }, [modelConfig?.apiEndpoint, modelConfig?.textModel, modelConfig?.imageModels, modelConfig?.videoModel]);

  useEffect(() => {
    if (!activeEditableScene) return;
    setSceneCardDraft({
      title: activeEditableScene.title,
      imageMaterialSuggestion: activeEditableScene.imageMaterialSuggestion,
      videoMaterialSuggestion: activeEditableScene.videoMaterialSuggestion,
    });
  }, [activeEditableScene?.id, activeEditableScene?.title, activeEditableScene?.imageMaterialSuggestion, activeEditableScene?.videoMaterialSuggestion]);

  useEffect(() => {
    if (themeMode !== 'system') {
      setEffectiveTheme(themeMode);
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    setEffectiveTheme(media.matches ? 'dark' : 'light');
    const listener = (e: MediaQueryListEvent) => setEffectiveTheme(e.matches ? 'dark' : 'light');
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [themeMode]);

  function runAction(action: (context: ActionContext) => Promise<void>, label = '正在处理当前任务'): void {
    const runId = actionRunIdRef.current + 1;
    actionRunIdRef.current = runId;
    cancelledRunIdsRef.current.delete(runId);
    const context: ActionContext = {
      isCancelled: () => cancelledRunIdsRef.current.has(runId),
      throwIfCancelled: () => {
        if (cancelledRunIdsRef.current.has(runId)) throw new ActionCancelledError();
      },
    };
    setBusy(true);
    setCurrentActionLabel(label);
    setError(null);
    void action(context)
      .catch((nextError) => {
        if (nextError instanceof ActionCancelledError) return;
        setError(nextError instanceof Error ? nextError.message : String(nextError));
      })
      .finally(() => {
        cancelledRunIdsRef.current.delete(runId);
        if (actionRunIdRef.current === runId) {
          setBusy(false);
          setCurrentActionLabel(null);
        }
      });
  }

  function cancelCurrentAction(): void {
    if (!busy) return;
    cancelledRunIdsRef.current.add(actionRunIdRef.current);
    setBusy(false);
    setCurrentActionLabel(null);
    setError('已取消当前本地任务；如果底层操作已完成，迟到结果会被忽略。');
  }

  function requireWorkspace(): string {
    if (!workspacePath) throw new Error('请先选择 Workspace，生成结果和配置会写入本地 .content-studio 目录。');
    return workspacePath;
  }

  function openModelDialog(): void {
    setModelDraft({
      apiEndpoint: modelConfig?.apiEndpoint ?? '',
      apiKey: '',
      textModel: modelConfig?.textModel ?? params.textModel,
      imageModels: modelConfig?.imageModels.join(', ') ?? params.imageModel,
      videoModel: modelConfig?.videoModel ?? params.videoModel,
    });
    setShowModelDialog(true);
  }

  async function chooseWorkspace(): Promise<void> {
    const selected = await window.contentStudio.selectWorkspace();
    if (!selected) return;
    const nextSettings = await window.contentStudio.saveSettings({ workspacePath: selected });
    setSettings(nextSettings);
    await refresh(selected);
  }

  async function saveModelConfig(): Promise<void> {
    const next = await window.contentStudio.saveModelConfig({
      apiEndpoint: modelDraft.apiEndpoint,
      apiKey: modelDraft.apiKey || undefined,
      textModel: modelDraft.textModel,
      imageModels: modelDraft.imageModels.split(',').map((item) => item.trim()).filter(Boolean),
      videoModel: modelDraft.videoModel,
    });
    setModelConfig(next);
    setParams((current) => ({ ...current, textModel: next.textModel, imageModel: next.imageModels[0] ?? current.imageModel, videoModel: next.videoModel }));
    setShowModelDialog(false);
  }

  async function loadModelCatalog(): Promise<void> {
    const catalog = await window.contentStudio.getModelCatalog();
    setModelDraft((current) => ({
      ...current,
      textModel: current.textModel || catalog.textModels[0] || params.textModel,
      imageModels: catalog.imageModels.join(', '),
      videoModel: current.videoModel || catalog.videoModels[0] || params.videoModel,
    }));
  }

  async function searchKnowledge(): Promise<void> {
    const results = await window.contentStudio.searchKnowledge({ workspacePath, query: knowledgeQuery, baseType: knowledgeBaseFilter, sectionType: knowledgeSectionFilter, tag: knowledgeTagFilter });
    setSearchResults(results);
  }

  function addCitation(result: KnowledgeSearchResult): void {
    const citation = citationFromResult(result);
    setSelectedCitations((current) => (current.some((item) => isSameCitation(item, citation)) ? current : [...current, citation].slice(0, 8)));
  }

  function addKnowledgeSectionCitation(base: KnowledgeBaseView, section: KnowledgeSection): void {
    const citation = citationFromSection(base, section);
    setSelectedCitations((current) => (current.some((item) => isSameCitation(item, citation)) ? current : [...current, citation].slice(0, 8)));
  }

  function toggleVideoDimension(dimension: string): void {
    setSelectedVideoDimensions((current) => (
      current.includes(dimension) ? current.filter((item) => item !== dimension) : [...current, dimension]
    ));
  }

  async function selectAssetFiles(kind: 'product-image' | 'reference-image' | 'video'): Promise<void> {
    const paths = await window.contentStudio.selectAssetFiles(kind);
    if (paths.length === 0) return;
    if (kind === 'product-image') setProductImageRefs((current) => [...current, ...paths].slice(0, 10));
    if (kind === 'reference-image') setReferenceImageRefs((current) => [...current, ...paths].slice(0, 6));
    if (kind === 'video') setVideoAssetRefs((current) => [...current, ...paths].slice(0, 3));
  }

  async function installBuiltinKnowledgeBase(id: string): Promise<void> {
    const workspace = requireWorkspace();
    await window.contentStudio.installBuiltinKnowledgeBase(id, workspace);
    await refresh(workspace);
  }

  async function importKnowledgeBase(): Promise<void> {
    const workspace = requireWorkspace();
    const imported = await window.contentStudio.importKnowledgeBaseFromFile(workspace);
    if (imported) await refresh(workspace);
  }

  async function generatePromptPack(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const citations = citationsForRequest;
    if (citations.length === 0) throw new Error('请先选择至少一条知识引用。');
    const pack = await window.contentStudio.generatePromptPack({ workspacePath: workspace, citations, name: 'v1 内容工厂提示词包' });
    context?.throwIfCancelled();
    setPromptPacks((current) => [pack, ...current]);
    setActivePromptPackId(pack.id);
    setActiveModule('knowledge');
    await refresh(workspace);
  }

  async function generateSceneCards(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const promptPackId = activePromptPack?.id;
    if (!promptPackId) throw new Error('请先生成提示词包，再生成产品场景库。');
    const cards = await window.contentStudio.generateSceneCards({ workspacePath: workspace, promptPackId, citations: citationsForRequest, count: 5 });
    context?.throwIfCancelled();
    setSceneCards((current) => [...cards, ...current]);
    setSelectedSceneIds(cards.slice(0, 2).map((card) => card.id));
    setActiveModule('image');
    await refresh(workspace);
  }

  async function savePromptPackDraft(): Promise<void> {
    const workspace = requireWorkspace();
    if (!activePromptPack) throw new Error('请先生成提示词包。');
    const updated = await window.contentStudio.updatePromptPack({
      ...activePromptPack,
      brandVoice: promptPackDraft.brandVoice,
      visualStyle: promptPackDraft.visualStyle,
    });
    setPromptPacks((current) => current.map((pack) => (pack.id === updated.id ? updated : pack)));
    await refresh(workspace);
  }

  async function saveSceneCardDraft(): Promise<void> {
    const workspace = requireWorkspace();
    if (!activeEditableScene) throw new Error('请先生成场景卡。');
    const updated = await window.contentStudio.updateSceneCard({
      ...activeEditableScene,
      title: sceneCardDraft.title,
      imageMaterialSuggestion: sceneCardDraft.imageMaterialSuggestion,
      videoMaterialSuggestion: sceneCardDraft.videoMaterialSuggestion,
    });
    setSceneCards((current) => current.map((card) => (card.id === updated.id ? updated : card)));
    await refresh(workspace);
  }

  async function generateArticle(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateArticle({
      workspacePath: workspace,
      articleType,
      platform: articlePlatform,
      audience: articleAudience,
      topic: articleTopic || activePromptPack?.name || '成型知识库驱动的内容工程',
      tone: articleTone || activePromptPack?.brandVoice || '专业、自然、克制',
      length: articleLength,
      customRequirement: articleRequirement,
      citations: citationsForRequest,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      assetRefs: [...productImageRefs, ...referenceImageRefs],
      selectedSkillSlugs: skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: { textModel: params.textModel },
    });
    context?.throwIfCancelled();
    setArticleResult(result);
    setArticleExportPath(null);
    setActiveModule('article');
    await refresh(workspace);
  }

  async function exportArticleMarkdown(): Promise<void> {
    const workspace = requireWorkspace();
    if (!articleResult) throw new Error('请先生成文章草稿，再导出 Markdown。');
    const exported = await window.contentStudio.exportMarkdown({
      workspacePath: workspace,
      sourceLogId: articleResult.logId,
      suggestedName: `${articleResult.titleCandidates[0] || 'content-studio-draft'}.md`,
      markdown: articleResult.markdown,
    });
    setArticleExportPath(exported);
    await refresh(workspace);
  }

  async function copyLogPrompt(log: GenerationLogEntry): Promise<void> {
    await navigator.clipboard.writeText(extractPromptFromLog(log));
    setCopiedLogId(log.id);
    window.setTimeout(() => setCopiedLogId((current) => (current === log.id ? null : current)), 1400);
  }

  async function revealLogPath(log: GenerationLogEntry): Promise<void> {
    const [firstPath] = extractLocalRefsFromLog(log);
    if (!firstPath) throw new Error('这条历史没有可打开的本地素材路径。');
    await revealPath(firstPath);
  }

  async function revealPath(path: string): Promise<void> {
    const result = await window.contentStudio.revealPath(path);
    if (!result.ok) throw new Error(result.error ?? '无法打开本地位置。');
  }

  async function exportAsset(path: string): Promise<void> {
    const exported = await window.contentStudio.exportAsset({ sourcePath: path, suggestedName: fileNameFromPath(path) });
    if (!exported) return;
    await revealPath(exported);
  }

  async function retryLog(log: GenerationLogEntry, context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    if (!log.input || typeof log.input !== 'object') throw new Error('这条历史缺少可重试的输入 payload。');

    if (log.kind === 'article') {
      const result = await window.contentStudio.generateArticle(log.input as ArticleGenerationRequest);
      context?.throwIfCancelled();
      setArticleResult(result);
      setArticleExportPath(null);
      setActiveModule('article');
    } else if (log.kind === 'image') {
      const result = await window.contentStudio.generateImage(log.input as ImageGenerationRequest);
      context?.throwIfCancelled();
      setMediaResult(result);
      setActiveModule('image');
    } else if (log.kind === 'video') {
      const result = await window.contentStudio.generateVideo(log.input as VideoGenerationRequest);
      context?.throwIfCancelled();
      setMediaResult(result);
      setActiveModule('video');
    } else if (log.kind === 'video-breakdown') {
      const result = await window.contentStudio.analyzeVideo(log.input as VideoBreakdownRequest);
      context?.throwIfCancelled();
      setVideoBreakdown(result);
      setActiveModule('video');
    } else if (log.kind === 'video-script') {
      const result = await window.contentStudio.generateVideoScript(log.input as VideoScriptGenerationRequest);
      context?.throwIfCancelled();
      setVideoScript(result);
      setActiveModule('video');
    } else if (log.kind === 'prompt-pack') {
      const pack = await window.contentStudio.generatePromptPack(log.input as GeneratePromptPackInput);
      context?.throwIfCancelled();
      setPromptPacks((current) => [pack, ...current]);
      setActivePromptPackId(pack.id);
      setActiveModule('knowledge');
    } else if (log.kind === 'scene-card') {
      const cards = await window.contentStudio.generateSceneCards(log.input as GenerateSceneCardsInput);
      context?.throwIfCancelled();
      setSceneCards((current) => [...cards, ...current]);
      setSelectedSceneIds(cards.slice(0, 2).map((card) => card.id));
      setActiveModule('image');
    } else {
      throw new Error(`暂不支持重试该历史类型：${log.kind}`);
    }

    await refresh(workspace);
  }

  async function generateImage(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateImage({
      workspacePath: workspace,
      productImageRefs,
      referenceImageRefs,
      prompt: suggestedImagePrompt,
      promptMode: imagePromptMode,
      generationMode: imageGenerationMode,
      template: imageTemplate,
      watermark: imageWatermark,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      selectedSkillSlugs: skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params,
    });
    context?.throwIfCancelled();
    setMediaResult(result);
    await refresh(workspace);
  }

  async function generateVideo(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateVideo({
      workspacePath: workspace,
      imageAssetRefs: [...productImageRefs, ...referenceImageRefs],
      videoAssetRefs,
      prompt: suggestedVideoPrompt,
      script: videoScript?.script || activeScenes[0]?.voiceoverDirection,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      selectedSkillSlugs: skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: { videoModel: params.videoModel, aspectRatio: params.aspectRatio, durationSeconds: videoDurationSeconds },
    });
    context?.throwIfCancelled();
    setMediaResult(result);
    await refresh(workspace);
  }

  async function analyzeReferenceVideo(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const source = videoAssetRefs[0] || videoUrl.trim();
    if (!source) throw new Error('请先选择参考视频或粘贴视频链接。');
    const result = await window.contentStudio.analyzeVideo({
      workspacePath: workspace,
      sourceType: videoAssetRefs[0] ? 'file' : 'url',
      source,
      dimensions: selectedVideoDimensions,
      promptPackId: activePromptPack?.id,
      citations: citationsForRequest,
      selectedSkillSlugs: skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: { textModel: params.textModel },
    });
    context?.throwIfCancelled();
    setVideoBreakdown(result);
    await refresh(workspace);
  }

  async function generateVideoScript(context?: ActionContext): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateVideoScript({
      workspacePath: workspace,
      productName: videoProductName,
      sceneBackground: videoSceneBackground,
      subtitleMode: videoSubtitleMode,
      voiceStyle: videoVoiceStyle || activePromptPack?.brandVoice || '自然可信',
      customRequirement: videoCustomRequirement,
      ratio: params.aspectRatio,
      shotCount: videoShotCount,
      durationSeconds: videoDurationSeconds,
      breakdownLogId: videoBreakdown?.logId,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      assetRefs: [...productImageRefs, ...referenceImageRefs, ...videoAssetRefs],
      selectedSkillSlugs: skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: { textModel: params.textModel },
    });
    context?.throwIfCancelled();
    setVideoScript(result);
    await refresh(workspace);
  }

  async function installSkill(slug: string): Promise<void> {
    const workspace = requireWorkspace();
    setSkills(await window.contentStudio.installBuiltinSkill(slug, workspace));
  }

  async function toggleSkill(skill: LoadedSkill): Promise<void> {
    const workspace = requireWorkspace();
    if (!skill.valid) throw new Error('无效 Skill 不能启用，请先修复 SKILL.md frontmatter。');
    const ref: SkillRef = { slug: skill.slug, source: skill.source };
    const next = await window.contentStudio.setSkillEnabled(workspace, ref, !enabledSkillKeys.has(skillKey(ref)));
    setSkillSelection(next);
  }

  async function copySkillPath(skill: LoadedSkill): Promise<void> {
    await navigator.clipboard.writeText(skill.path);
    const key = skillKey(skill);
    setCopiedSkillKey(key);
    window.setTimeout(() => setCopiedSkillKey((current) => (current === key ? null : current)), 1400);
  }

  return {
    themeMode,
    setThemeMode,
    colorTheme,
    setColorTheme,
    effectiveTheme,
    showSettingsDialog,
    setShowSettingsDialog,
    settingsTab,
    setSettingsTab,
    modelSettingView,
    setModelSettingView,
    providerTab,
    setProviderTab,
    responsesApiActive,
    setResponsesApiActive,
    menubarShow,
    setMenubarShow,
    autoStart,
    setAutoStart,
    notificationsEnabled,
    setNotificationsEnabled,
    reduceAnimation,
    setReduceAnimation,
    syncClaudeHistory,
    setSyncClaudeHistory,
    shortcutActive,
    setShortcutActive,
    commandWhitelist,
    setCommandWhitelist,
    activeModule,
    setActiveModule,
    settings,
    modelConfig,
    modelDraft,
    setModelDraft,
    showModelDialog,
    setShowModelDialog,
    skills,
    skillSelection,
    knowledgeBases,
    knowledgeQuery,
    setKnowledgeQuery,
    knowledgeBaseFilter,
    setKnowledgeBaseFilter,
    knowledgeSectionFilter,
    setKnowledgeSectionFilter,
    knowledgeTagFilter,
    setKnowledgeTagFilter,
    availableKnowledgeTags,
    activeKnowledgeBaseKey,
    setActiveKnowledgeBaseKey,
    searchResults,
    selectedCitations,
    promptPacks,
    activePromptPackId,
    setActivePromptPackId,
    promptPackDraft,
    setPromptPackDraft,
    sceneCards,
    selectedSceneIds,
    setSelectedSceneIds,
    sceneCardDraft,
    setSceneCardDraft,
    logs,
    params,
    setParams,
    productImageRefs,
    referenceImageRefs,
    videoAssetRefs,
    imagePromptDraft,
    setImagePromptDraft,
    imagePromptMode,
    setImagePromptMode,
    imageGenerationMode,
    setImageGenerationMode,
    imageTemplate,
    setImageTemplate,
    imageWatermark,
    setImageWatermark,
    videoUrl,
    setVideoUrl,
    selectedVideoDimensions,
    videoBreakdown,
    videoScript,
    videoProductName,
    setVideoProductName,
    videoSceneBackground,
    setVideoSceneBackground,
    videoSubtitleMode,
    setVideoSubtitleMode,
    videoVoiceStyle,
    setVideoVoiceStyle,
    videoShotCount,
    setVideoShotCount,
    videoDurationSeconds,
    setVideoDurationSeconds,
    videoCustomRequirement,
    setVideoCustomRequirement,
    articleType,
    setArticleType,
    articlePlatform,
    setArticlePlatform,
    articleLength,
    setArticleLength,
    articleTopic,
    setArticleTopic,
    articleAudience,
    setArticleAudience,
    articleTone,
    setArticleTone,
    articleRequirement,
    setArticleRequirement,
    articleResult,
    articleExportPath,
    mediaResult,
    historyFilter,
    setHistoryFilter,
    copiedLogId,
    activeSkillKey,
    setActiveSkillKey,
    copiedSkillKey,
    busy,
    currentActionLabel,
    error,
    workspacePath,
    enabledSkillKeys,
    activePromptPack,
    activeKnowledgeBase,
    activeSkill,
    activeScenes,
    activeEditableScene,
    selectedSceneIdsForRequest,
    citationsForRequest,
    filteredLogs,
    suggestedImagePrompt,
    suggestedVideoPrompt,
    refresh,
    runAction,
    cancelCurrentAction,
    requireWorkspace,
    openModelDialog,
    chooseWorkspace,
    saveModelConfig,
    loadModelCatalog,
    searchKnowledge,
    addCitation,
    addKnowledgeSectionCitation,
    toggleVideoDimension,
    selectAssetFiles,
    installBuiltinKnowledgeBase,
    importKnowledgeBase,
    generatePromptPack,
    generateSceneCards,
    savePromptPackDraft,
    saveSceneCardDraft,
    generateArticle,
    exportArticleMarkdown,
    copyLogPrompt,
    revealLogPath,
    revealPath,
    exportAsset,
    retryLog,
    generateImage,
    generateVideo,
    analyzeReferenceVideo,
    generateVideoScript,
    installSkill,
    toggleSkill,
    copySkillPath,
  };
}

export type ContentStudioAppController = ReturnType<typeof useContentStudioApp>;
