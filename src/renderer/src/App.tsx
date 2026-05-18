import { useEffect, useMemo, useState } from 'react';
import type {
  ArticleGenerationResult,
  ArticleGenerationRequest,
  AppSettingsView,
  GenerationLogEntry,
  GlobalGenerationParams,
  KnowledgeBaseType,
  KnowledgeBaseView,
  KnowledgeCitation,
  KnowledgeSearchResult,
  KnowledgeSectionType,
  LoadedSkill,
  MediaGenerationResult,
  ModelConfigView,
  PromptPack,
  SceneCard,
  SkillRef,
  SkillSelectionView,
  VideoBreakdownResult,
  VideoScriptGenerationResult,
} from '../../shared/types';

import { DEFAULT_PARAMS, PIPELINE_STEPS, VIDEO_DIMENSIONS } from './app/constants';
import { citationFromResult, extractLocalRefsFromLog, extractPromptFromLog, isSameCitation, skillKey } from './app/formatters';
import { AppSidebar } from './components/AppSidebar';
import { ParamsPanel } from './components/ParamsPanel';
import { SettingsDialog } from './components/SettingsDialog';
import { ArticleModule } from './components/modules/ArticleModule';
import { AssetsModule } from './components/modules/AssetsModule';
import { ImageModule } from './components/modules/ImageModule';
import { KnowledgeModule } from './components/modules/KnowledgeModule';
import { SkillsModule } from './components/modules/SkillsModule';
import { VideoModule } from './components/modules/VideoModule';
import type { ColorTheme, ModelDraft, ModelSettingView, ModuleKey, ProviderTab, SettingsTab } from './app/types';

export function App() {
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
  const [videoUrl, setVideoUrl] = useState('');
  const [selectedVideoDimensions, setSelectedVideoDimensions] = useState<string[]>(VIDEO_DIMENSIONS);
  const [videoBreakdown, setVideoBreakdown] = useState<VideoBreakdownResult | null>(null);
  const [videoScript, setVideoScript] = useState<VideoScriptGenerationResult | null>(null);
  const [videoProductName, setVideoProductName] = useState('新产品');
  const [videoSceneBackground, setVideoSceneBackground] = useState('电商真实使用场景');
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspacePath = settings?.workspacePath;
  const enabledSkillKeys = useMemo(() => new Set((skillSelection?.enabledSkills ?? []).map(skillKey)), [skillSelection]);
  const activePromptPack = useMemo(() => promptPacks.find((pack) => pack.id === activePromptPackId) ?? promptPacks[0], [activePromptPackId, promptPacks]);
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
      window.contentStudio.searchKnowledge({ workspacePath: workspace, query: knowledgeQuery, baseType: knowledgeBaseFilter, sectionType: knowledgeSectionFilter }),
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

  function runAction(action: () => Promise<void>): void {
    setBusy(true);
    setError(null);
    void action()
      .catch((nextError) => setError(nextError instanceof Error ? nextError.message : String(nextError)))
      .finally(() => setBusy(false));
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
    const results = await window.contentStudio.searchKnowledge({ workspacePath, query: knowledgeQuery, baseType: knowledgeBaseFilter, sectionType: knowledgeSectionFilter });
    setSearchResults(results);
  }

  function addCitation(result: KnowledgeSearchResult): void {
    const citation = citationFromResult(result);
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

  async function generatePromptPack(): Promise<void> {
    const workspace = requireWorkspace();
    const citations = citationsForRequest;
    if (citations.length === 0) throw new Error('请先选择至少一条知识引用。');
    const pack = await window.contentStudio.generatePromptPack({ workspacePath: workspace, citations, name: 'v1 内容工厂提示词包' });
    setPromptPacks((current) => [pack, ...current]);
    setActivePromptPackId(pack.id);
    setActiveModule('knowledge');
    await refresh(workspace);
  }

  async function generateSceneCards(): Promise<void> {
    const workspace = requireWorkspace();
    const promptPackId = activePromptPack?.id;
    if (!promptPackId) throw new Error('请先生成提示词包，再生成产品场景库。');
    const cards = await window.contentStudio.generateSceneCards({ workspacePath: workspace, promptPackId, citations: citationsForRequest, count: 5 });
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

  async function generateArticle(): Promise<void> {
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
    const result = await window.contentStudio.revealPath(firstPath);
    if (!result.ok) throw new Error(result.error ?? '无法打开本地位置。');
  }

  async function generateImage(): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateImage({
      workspacePath: workspace,
      productImageRefs,
      referenceImageRefs,
      prompt: suggestedImagePrompt,
      promptMode: 'preset',
      generationMode: 'smart',
      template: '电商场景图',
      watermark: false,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      selectedSkillSlugs: skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params,
    });
    setMediaResult(result);
    await refresh(workspace);
  }

  async function generateVideo(): Promise<void> {
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
      params: { videoModel: params.videoModel, aspectRatio: params.aspectRatio, durationSeconds: 8 },
    });
    setMediaResult(result);
    await refresh(workspace);
  }

  async function analyzeReferenceVideo(): Promise<void> {
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
    setVideoBreakdown(result);
    await refresh(workspace);
  }

  async function generateVideoScript(): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateVideoScript({
      workspacePath: workspace,
      productName: videoProductName,
      sceneBackground: videoSceneBackground,
      subtitleMode: 'burned-subtitle',
      voiceStyle: activePromptPack?.brandVoice || '自然可信',
      customRequirement: videoCustomRequirement,
      ratio: params.aspectRatio,
      shotCount: 5,
      durationSeconds: 18,
      breakdownLogId: videoBreakdown?.logId,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      assetRefs: [...productImageRefs, ...referenceImageRefs, ...videoAssetRefs],
      selectedSkillSlugs: skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: { textModel: params.textModel },
    });
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

  return (
    <main className="app-shell" data-theme={effectiveTheme} data-color={colorTheme}>
      <AppSidebar
        activeModule={activeModule}
        workspacePath={workspacePath}
        onSelectModule={setActiveModule}
        onChooseWorkspace={() => runAction(chooseWorkspace)}
        onRefreshWorkspace={() => runAction(() => refresh(workspacePath))}
        onOpenSettings={() => setShowSettingsDialog(true)}
      />

      <section className="stage">
        <header className="stage-header">
          <div>
            <p className="eyebrow">Content Studio Pipeline</p>
            <div className="pipeline-breadcrumbs">
              {PIPELINE_STEPS.map((item, idx) => (
                <span key={item} className="breadcrumb-item">
                  <em>0{idx + 1}</em> {item}
                </span>
              ))}
            </div>
          </div>
          <div className="header-actions">
            <button className="primary" disabled={busy || !workspacePath} onClick={() => runAction(generatePromptPack)}>生成提示词包</button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        {activeModule === 'image' ? (
          <ImageModule
            busy={busy}
            workspaceReady={Boolean(workspacePath)}
            productImageRefs={productImageRefs}
            referenceImageRefs={referenceImageRefs}
            suggestedImagePrompt={suggestedImagePrompt}
            setImagePromptDraft={setImagePromptDraft}
            sceneCards={sceneCards}
            selectedSceneIds={selectedSceneIds}
            setSelectedSceneIds={setSelectedSceneIds}
            activePromptPack={activePromptPack}
            mediaResult={mediaResult}
            onSelectProductImages={() => runAction(() => selectAssetFiles('product-image'))}
            onSelectReferenceImages={() => runAction(() => selectAssetFiles('reference-image'))}
            onGenerateImage={() => runAction(generateImage)}
            onGenerateSceneCards={() => runAction(generateSceneCards)}
          />
        ) : null}

        {activeModule === 'video' ? (
          <VideoModule
            busy={busy}
            workspaceReady={Boolean(workspacePath)}
            videoUrl={videoUrl}
            setVideoUrl={setVideoUrl}
            videoProductName={videoProductName}
            setVideoProductName={setVideoProductName}
            videoSceneBackground={videoSceneBackground}
            setVideoSceneBackground={setVideoSceneBackground}
            videoCustomRequirement={videoCustomRequirement}
            setVideoCustomRequirement={setVideoCustomRequirement}
            videoAssetRefs={videoAssetRefs}
            selectedVideoDimensions={selectedVideoDimensions}
            toggleVideoDimension={toggleVideoDimension}
            videoBreakdown={videoBreakdown}
            videoScript={videoScript}
            activeScenes={activeScenes}
            suggestedVideoPrompt={suggestedVideoPrompt}
            mediaResult={mediaResult}
            onSelectVideo={() => runAction(() => selectAssetFiles('video'))}
            onAnalyzeReferenceVideo={() => runAction(analyzeReferenceVideo)}
            onGenerateVideoScript={() => runAction(generateVideoScript)}
            onGenerateVideo={() => runAction(generateVideo)}
          />
        ) : null}

        {activeModule === 'article' ? (
          <ArticleModule
            busy={busy}
            workspaceReady={Boolean(workspacePath)}
            articleType={articleType}
            setArticleType={setArticleType}
            articlePlatform={articlePlatform}
            setArticlePlatform={setArticlePlatform}
            articleAudience={articleAudience}
            setArticleAudience={setArticleAudience}
            articleTopic={articleTopic}
            setArticleTopic={setArticleTopic}
            articleTone={articleTone}
            setArticleTone={setArticleTone}
            articleLength={articleLength}
            setArticleLength={setArticleLength}
            articleRequirement={articleRequirement}
            setArticleRequirement={setArticleRequirement}
            articleResult={articleResult}
            articleExportPath={articleExportPath}
            onGenerateArticle={() => runAction(generateArticle)}
            onExportMarkdown={() => runAction(exportArticleMarkdown)}
          />
        ) : null}

        {activeModule === 'knowledge' ? (
          <KnowledgeModule
            busy={busy}
            workspaceReady={Boolean(workspacePath)}
            knowledgeBases={knowledgeBases}
            knowledgeQuery={knowledgeQuery}
            setKnowledgeQuery={setKnowledgeQuery}
            knowledgeBaseFilter={knowledgeBaseFilter}
            setKnowledgeBaseFilter={setKnowledgeBaseFilter}
            knowledgeSectionFilter={knowledgeSectionFilter}
            setKnowledgeSectionFilter={setKnowledgeSectionFilter}
            searchResults={searchResults}
            selectedCitations={selectedCitations}
            activePromptPack={activePromptPack}
            promptPackDraft={promptPackDraft}
            setPromptPackDraft={setPromptPackDraft}
            activeEditableScene={activeEditableScene}
            sceneCardDraft={sceneCardDraft}
            setSceneCardDraft={setSceneCardDraft}
            onImportKnowledgeBase={() => runAction(importKnowledgeBase)}
            onInstallBuiltinKnowledgeBase={(id) => runAction(() => installBuiltinKnowledgeBase(id))}
            onSearchKnowledge={() => runAction(searchKnowledge)}
            onAddCitation={addCitation}
            onGenerateSceneCards={() => runAction(generateSceneCards)}
            onSavePromptPackDraft={() => runAction(savePromptPackDraft)}
            onSaveSceneCardDraft={() => runAction(saveSceneCardDraft)}
          />
        ) : null}

        {activeModule === 'assets' ? (
          <AssetsModule
            logsCount={logs.length}
            filteredLogs={filteredLogs}
            historyFilter={historyFilter}
            setHistoryFilter={setHistoryFilter}
            copiedLogId={copiedLogId}
            onCopyLogPrompt={(log) => runAction(() => copyLogPrompt(log))}
            onRevealLogPath={(log) => runAction(() => revealLogPath(log))}
          />
        ) : null}

        {activeModule === 'skills' ? (
          <SkillsModule
            skills={skills}
            enabledSkillKeys={enabledSkillKeys}
            skillSelection={skillSelection}
            workspaceReady={Boolean(workspacePath)}
            onInstallSkill={(slug) => runAction(() => installSkill(slug))}
            onToggleSkill={(skill) => runAction(() => toggleSkill(skill))}
          />
        ) : null}
      </section>

      <ParamsPanel
        params={params}
        citations={citationsForRequest}
        skillSelection={skillSelection}
        setParams={setParams}
        onOpenModelSettings={() => { setShowSettingsDialog(true); setSettingsTab('model'); }}
      />

      {showSettingsDialog ? (
        <SettingsDialog
          settingsTab={settingsTab}
          setSettingsTab={setSettingsTab}
          themeMode={themeMode}
          setThemeMode={setThemeMode}
          colorTheme={colorTheme}
          setColorTheme={setColorTheme}
          modelSettingView={modelSettingView}
          setModelSettingView={setModelSettingView}
          providerTab={providerTab}
          setProviderTab={setProviderTab}
          responsesApiActive={responsesApiActive}
          setResponsesApiActive={setResponsesApiActive}
          menubarShow={menubarShow}
          setMenubarShow={setMenubarShow}
          autoStart={autoStart}
          setAutoStart={setAutoStart}
          notificationsEnabled={notificationsEnabled}
          setNotificationsEnabled={setNotificationsEnabled}
          reduceAnimation={reduceAnimation}
          setReduceAnimation={setReduceAnimation}
          syncClaudeHistory={syncClaudeHistory}
          setSyncClaudeHistory={setSyncClaudeHistory}
          shortcutActive={shortcutActive}
          setShortcutActive={setShortcutActive}
          commandWhitelist={commandWhitelist}
          setCommandWhitelist={setCommandWhitelist}
          onClose={() => setShowSettingsDialog(false)}
        />
      ) : null}
    </main>
  );
}
