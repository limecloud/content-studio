import { useEffect, useMemo, useState } from 'react';
import logoUrl from './logo.png';
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

type ModuleKey = 'image' | 'video' | 'article' | 'knowledge' | 'assets' | 'skills';
type NavItem = { key?: ModuleKey; label: string; badge?: string; disabled?: boolean };

type ModelDraft = {
  apiEndpoint: string;
  apiKey: string;
  textModel: string;
  imageModels: string;
  videoModel: string;
};

const DEFAULT_PARAMS: GlobalGenerationParams = {
  textModel: 'claude-sonnet-4-5',
  imageModel: 'gpt-image-2',
  videoModel: 'veo-3.1',
  runMode: 'single',
  count: 1,
  aspectRatio: '4:5',
  resolution: '2k',
  quality: 'medium',
};

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  { title: '图片', items: [{ key: 'image', label: '图片引擎', badge: 'current' }, { label: '合规检测', disabled: true, badge: '后续接入' }, { label: 'AI 对话', disabled: true, badge: '后续接入' }, { label: '图片精修', disabled: true, badge: '后续接入' }] },
  { title: '视频', items: [{ key: 'video', label: '视频引擎', badge: '爆款拆解' }, { label: '创意视频', disabled: true, badge: '后续接入' }, { label: '自定义视频', disabled: true, badge: '后续接入' }] },
  { title: '文案', items: [{ key: 'article', label: '文章生成', badge: 'Claude' }] },
  { title: '知识库', items: [{ key: 'knowledge', label: '成型知识库' }] },
  { title: '资产', items: [{ key: 'assets', label: '素材库 / 历史' }] },
  { title: '管理', items: [{ key: 'skills', label: 'Skills 管理' }] },
];

const VIDEO_DIMENSIONS = ['开头钩子', '钩子评分', '语气风格', '卖点逻辑', '镜头运镜', '画面构图', '关键词视觉元素', '字幕口播', '情绪曲线', '节奏密度', '视觉风格', '转化设计', '爆点因素', '内容公式', '转场方式', '用户停留点'];

const HISTORY_FILTERS: Array<{ value: GenerationLogEntry['kind'] | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'article', label: '文章' },
  { value: 'image', label: '图片' },
  { value: 'video-breakdown', label: '拆解' },
  { value: 'video-script', label: '脚本' },
  { value: 'video', label: '视频队列' },
];

const KNOWLEDGE_BASE_FILTERS: Array<{ value: KnowledgeBaseType | 'all'; label: string }> = [
  { value: 'all', label: '全部知识库' },
  { value: 'product-kb', label: '产品型' },
  { value: 'personal-ip-kb', label: '个人 IP 型' },
];

const KNOWLEDGE_SECTION_FILTERS: Array<{ value: KnowledgeSectionType | 'all'; label: string }> = [
  { value: 'all', label: '全部章节' },
  { value: 'product', label: '产品' },
  { value: 'selling-point', label: '卖点' },
  { value: 'scenario-script', label: '场景脚本' },
  { value: 'compliance', label: '合规' },
  { value: 'profile', label: '人物档案' },
  { value: 'methodology', label: '方法论' },
  { value: 'voice-style', label: '写作风格' },
  { value: 'boundary', label: '边界' },
];

const ARTICLE_TYPE_OPTIONS: Array<{ value: ArticleGenerationRequest['articleType']; label: string }> = [
  { value: 'wechat-longform', label: '公众号长文' },
  { value: 'xiaohongshu-note', label: '小红书笔记' },
  { value: 'product-seeding', label: '商品种草文' },
  { value: 'detail-page-copy', label: '详情页文案' },
  { value: 'short-video-script', label: '短视频口播稿' },
];

const ARTICLE_LENGTH_OPTIONS: Array<{ value: ArticleGenerationRequest['length']; label: string }> = [
  { value: 'short', label: '短内容' },
  { value: 'medium', label: '中等篇幅' },
  { value: 'long', label: '长文' },
  { value: 'custom', label: '自定义' },
];

const COLOR_THEME_OPTIONS = [
  { value: 'emerald', label: '森绿', description: '克制专业的绿色主调', color: '#395745' },
  { value: 'ocean', label: '海洋', description: '清爽可信的蓝绿色', color: '#0E7490' },
  { value: 'vintage', label: '复古', description: '温和纸感的暖色调', color: '#92400E' },
  { value: 'neon', label: '霓虹', description: '高识别度的现代强调色', color: '#0891B2' },
  { value: 'lime', label: '青柠', description: '活力清新的黄绿配色', color: '#65A30D' },
  { value: 'dusk', label: '黄昏', description: '柔和温暖的暮色调', color: '#9A3412' },
  { value: 'minimal', label: '极简', description: '清晰专业的深蓝商务风', color: '#1D4ED8' },
  { value: 'vibrant', label: '活力', description: '时尚有冲击力的科技风', color: '#0D9488' },
  { value: 'nature', label: '自然', description: '舒适放松的自然风', color: '#15803D' },
  { value: 'arts', label: '文艺', description: '宁静高雅的灰蓝文艺风', color: '#475569' },
  { value: 'luxury', label: '奢华', description: '尊贵权威的黑金商务风', color: '#B45309' },
] as const;

type ColorTheme = (typeof COLOR_THEME_OPTIONS)[number]['value'];

function sourceLabel(source: LoadedSkill['source']): string {
  return {
    builtin: '内置',
    project: '项目',
    'project-compat': '项目兼容',
    user: '用户',
    'user-compat': '用户兼容',
  }[source];
}

function baseLabel(base: KnowledgeBaseView['baseType']): string {
  return base === 'personal-ip-kb' ? '个人 IP 型' : '产品型';
}

function sectionLabel(type: KnowledgeCitation['sectionType']): string {
  const labels: Record<KnowledgeCitation['sectionType'], string> = {
    science: '科学基础',
    brand: '品牌',
    product: '产品',
    'selling-point': '卖点',
    'scenario-script': '场景脚本',
    'objection-handling': '异议处理',
    compliance: '合规',
    qa: '问答',
    spec: '规格',
    profile: '人物档案',
    timeline: '履历',
    story: '故事',
    methodology: '方法论',
    quote: '金句',
    'voice-style': '写作风格',
    boundary: '边界',
  };
  return labels[type];
}

function kindLabel(kind: GenerationLogEntry['kind']): string {
  return {
    article: '文章',
    image: '图片',
    video: '视频',
    'video-breakdown': '视频拆解',
    'video-script': '视频脚本',
    'prompt-pack': '提示词包',
    'scene-card': '场景卡',
  }[kind];
}

function statusLabel(status: GenerationLogEntry['status']): string {
  return {
    queued: '排队中',
    running: '生成中',
    succeeded: '成功',
    failed: '失败',
    blocked: '已阻塞',
    cancelled: '已取消',
  }[status];
}

function skillKey(skill: SkillRef): string {
  return `${skill.source}:${skill.slug}`;
}

function clip(value: string, length = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > length ? `${normalized.slice(0, length)}...` : normalized;
}

function citationFromResult(result: KnowledgeSearchResult): KnowledgeCitation {
  return {
    knowledgeBaseId: result.knowledgeBaseId,
    sectionId: result.section.id,
    title: `${result.baseTitle} / ${result.section.title}`,
    sectionType: result.section.sectionType,
    excerpt: clip(result.section.content || result.section.summary || result.section.title, 220),
  };
}

function isSameCitation(a: KnowledgeCitation, b: KnowledgeCitation): boolean {
  return a.knowledgeBaseId === b.knowledgeBaseId && a.sectionId === b.sectionId;
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function extractPromptFromLog(log: GenerationLogEntry): string {
  const directPrompt = recordValue(log.input, 'prompt');
  if (typeof directPrompt === 'string' && directPrompt.trim()) return directPrompt;
  const videoPrompt = recordValue(log.output, 'videoPrompt');
  if (typeof videoPrompt === 'string' && videoPrompt.trim()) return videoPrompt;
  const markdown = recordValue(log.output, 'markdown');
  if (typeof markdown === 'string' && markdown.trim()) return markdown;
  return JSON.stringify({ input: log.input, output: log.output }, null, 2);
}

function collectStringArray(value: unknown, key: string): string[] {
  const field = recordValue(value, key);
  return Array.isArray(field) ? field.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function extractLocalRefsFromLog(log: GenerationLogEntry): string[] {
  const refs = [
    ...collectStringArray(log.input, 'productImageRefs'),
    ...collectStringArray(log.input, 'referenceImageRefs'),
    ...collectStringArray(log.input, 'imageAssetRefs'),
    ...collectStringArray(log.input, 'videoAssetRefs'),
    ...collectStringArray(log.input, 'assetRefs'),
    ...collectStringArray(log.output, 'assetRefs'),
    ...(log.artifactRefs ?? []),
  ];
  return Array.from(new Set(refs.filter((item) => !/^https?:\/\//i.test(item))));
}

function extractSkillSlugsFromLog(log: GenerationLogEntry): string[] {
  const selected = collectStringArray(log.input, 'selectedSkillSlugs');
  if (selected.length > 0) return Array.from(new Set(selected));
  if (log.kind === 'prompt-pack') return ['knowledge-citation-picker', 'prompt-pack-builder', 'brand-voice-keeper'];
  if (log.kind === 'scene-card') return ['scene-library-builder'];
  if (log.kind === 'article') return ['article-drafter', 'publish-checker'];
  if (log.kind === 'video-breakdown') return ['video-breakdown'];
  if (log.kind === 'video-script') return ['video-script-writer', 'compliance-reviewer'];
  if (log.kind === 'image') return ['ecommerce-image-prompt'];
  if (log.kind === 'video') return ['video-script-writer'];
  return [];
}

export function App() {
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'system'>('light');
  const [colorTheme, setColorTheme] = useState<ColorTheme>('emerald');
  const [effectiveTheme, setEffectiveTheme] = useState<'light' | 'dark'>('light');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [modelSettingView, setModelSettingView] = useState<'provider_list' | 'edit_claude' | 'edit_deepseek' | 'edit_custom'>('edit_claude');
  const [providerTab, setProviderTab] = useState<'recommended' | 'domestic' | 'aggregate' | 'overseas' | 'local'>('recommended');
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
      <aside className="sidebar">
        <section className="brand-card">
          <img src={logoUrl} alt="Logo" className="brand-logo-img" />
          <div>
            <p className="eyebrow">布谷AI</p>
            <h1>内容工厂</h1>
          </div>
        </section>

        <section className="workspace-card">
          <p className="eyebrow">Workspace</p>
          <strong>{workspacePath ? workspacePath.split('/').slice(-2).join('/') : '尚未选择工作区'}</strong>
          <button className="primary small" onClick={() => runAction(chooseWorkspace)}>选择 Workspace</button>
          <button className="ghost small" onClick={() => runAction(() => refresh(workspacePath))}>刷新本地事实源</button>
        </section>

        <nav className="nav-stack">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="nav-group">
              <p>{group.title}</p>
              {group.items.map((item) => (
                <button
                  key={`${group.title}:${item.label}`}
                  className={`nav-item ${item.key && activeModule === item.key ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
                  onClick={() => item.key && !item.disabled && setActiveModule(item.key)}
                >
                  <span>{item.label}</span>
                  {item.badge ? <em>{item.badge}</em> : null}
                </button>
              ))}
            </div>
          ))}
        </nav>

        <section className="mode-card">
          <p className="eyebrow">处理模式</p>
          <div className="mode-grid">
            <button className="active">单次</button>
            <button disabled>批量</button>
            <button disabled>定时</button>
          </div>
        </section>

        <div className="sidebar-bottom" style={{ marginTop: 'auto', paddingTop: '20px' }}>
          <div className="account-card" style={{ cursor: 'pointer' }} onClick={() => setShowSettingsDialog(true)}>
            <div className="avatar">C</div>
            <span className="email">coso@gmail.com</span>
            <button className="settings-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
            </button>
          </div>
        </div>
      </aside>

      <section className="stage">
        <header className="stage-header">
          <div>
            <p className="eyebrow">Content Studio Pipeline</p>
            <div className="pipeline-breadcrumbs">
              {['知识库', '提示词包', '场景库', '图片素材', '视频队列', '文章生成'].map((item, idx) => (
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
          <section className="module-grid two-col">
            <article className="panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Image Engine</p>
                  <h3>图片引擎</h3>
                </div>
                <span className="status-pill">智能生成</span>
              </div>
              <div className="upload-grid">
                <button className="upload-card" onClick={() => runAction(() => selectAssetFiles('product-image'))}>
                  <span>+</span><strong>产品图上传</strong><p>{productImageRefs.length}/10，参与生成 payload</p>
                </button>
                <button className="upload-card" onClick={() => runAction(() => selectAssetFiles('reference-image'))}>
                  <span>↗</span><strong>参考图上传</strong><p>{referenceImageRefs.length}/6，参与风格迁移</p>
                </button>
              </div>
              <div className="chip-row">
                {['自由模式', '预设提示词', '电商白底主图', '海报图', '场景图', '买家秀图'].map((item) => <span key={item} className="chip">{item}</span>)}
              </div>
              <label className="field-label">图片提示词</label>
              <textarea value={suggestedImagePrompt} onChange={(event) => setImagePromptDraft(event.target.value)} />
              <div className="asset-ref-row">
                {[...productImageRefs, ...referenceImageRefs].slice(0, 4).map((ref) => <span key={ref}>{ref.split('/').pop()}</span>)}
              </div>
              <button className="primary wide" disabled={busy || !workspacePath} onClick={() => runAction(generateImage)}>启动渲染引擎</button>
            </article>

            <article className="panel preview-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Preview</p>
                  <h3>素材预览 / 生成日志</h3>
                </div>
                <button className="ghost small" onClick={() => runAction(generateSceneCards)} disabled={!activePromptPack || busy}>生成场景库</button>
              </div>
              <div className="preview-grid">
                {sceneCards.slice(0, 4).map((scene) => (
                  <button key={scene.id} className={`scene-tile ${selectedSceneIds.includes(scene.id) ? 'active' : ''}`} onClick={() => setSelectedSceneIds((current) => current.includes(scene.id) ? current.filter((id) => id !== scene.id) : [...current, scene.id])}>
                    <strong>{scene.title}</strong>
                    <p>{scene.visualComposition}</p>
                  </button>
                ))}
                {sceneCards.length === 0 ? <div className="empty-state">生成场景库后，这里会显示可用于图片和视频的场景卡。</div> : null}
              </div>
              {mediaResult ? <div className={`result-card ${mediaResult.status}`}><strong>{statusLabel(mediaResult.status)}</strong><p>{mediaResult.message}</p><small>logId: {mediaResult.logId}</small></div> : null}
            </article>
          </section>
        ) : null}

        {activeModule === 'video' ? (
          <section className="module-grid two-col">
            <article className="panel">
              <div className="panel-title"><div><p className="eyebrow">Video Engine</p><h3>视频复刻引擎</h3></div><span className="status-pill">三步流</span></div>
              <div className="form-grid">
                <label><span>参考视频链接</span><input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="可粘贴视频链接，或选择本地视频" /></label>
                <label><span>新产品名称</span><input value={videoProductName} onChange={(event) => setVideoProductName(event.target.value)} /></label>
                <label><span>场景背景</span><input value={videoSceneBackground} onChange={(event) => setVideoSceneBackground(event.target.value)} /></label>
                <label><span>自定义需求</span><input value={videoCustomRequirement} onChange={(event) => setVideoCustomRequirement(event.target.value)} /></label>
              </div>
              <div className="header-actions inline-actions">
                <button className="ghost small" onClick={() => runAction(() => selectAssetFiles('video'))}>选择本地视频 · {videoAssetRefs.length}</button>
                <button className="primary small" disabled={busy || !workspacePath} onClick={() => runAction(analyzeReferenceVideo)}>开始拆解</button>
                <button className="primary small" disabled={busy || !workspacePath} onClick={() => runAction(generateVideoScript)}>生成脚本</button>
              </div>
              <div className="chip-row dimension-row">
                {VIDEO_DIMENSIONS.map((dimension) => (
                  <button key={dimension} className={`chip-button ${selectedVideoDimensions.includes(dimension) ? 'active' : ''}`} onClick={() => toggleVideoDimension(dimension)}>
                    {dimension}
                  </button>
                ))}
              </div>
              <div className="step-list">
                <article><span>01</span><strong>视频拆解</strong><p>{videoBreakdown?.summary || '导入参考视频，拆解钩子、节奏、字幕和镜头。'}</p></article>
                <article><span>02</span><strong>脚本生成</strong><p>{videoScript?.title || activeScenes[0]?.voiceoverDirection || '基于场景卡和知识引用生成新产品脚本。'}</p></article>
                <article><span>03</span><strong>视频生成</strong><p>{videoScript?.videoPrompt || activeScenes[0]?.videoMaterialSuggestion || '图片素材 + 视频提示词进入生成队列。'}</p></article>
              </div>
              <button className="primary wide" disabled={busy || !workspacePath} onClick={() => runAction(generateVideo)}>生成视频队列</button>
            </article>
            <article className="panel terminal-panel">
              <p className="eyebrow">Video Prompt</p>
              <pre>{suggestedVideoPrompt}</pre>
              {videoBreakdown ? <div className="script-block"><strong>拆解片段</strong>{videoBreakdown.segments.map((segment) => <p key={segment.timeRange}>{segment.timeRange} · {segment.hook} · {segment.reusablePoint}</p>)}</div> : null}
              {videoScript ? <div className="script-block"><strong>分镜脚本</strong><pre>{videoScript.script}</pre></div> : null}
              {mediaResult ? <div className={`result-card ${mediaResult.status}`}><strong>{statusLabel(mediaResult.status)}</strong><p>{mediaResult.message}</p></div> : null}
            </article>
          </section>
        ) : null}

        {activeModule === 'article' ? (
          <section className="module-grid two-col">
            <article className="panel">
              <div className="panel-title"><div><p className="eyebrow">Article</p><h3>文章生成</h3></div><span className="status-pill">公众号 / 小红书</span></div>
              <div className="form-grid">
                <label>
                  <span>文章类型</span>
                  <select value={articleType} onChange={(event) => setArticleType(event.target.value as ArticleGenerationRequest['articleType'])}>
                    {ARTICLE_TYPE_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <label><span>平台</span><input value={articlePlatform} onChange={(event) => setArticlePlatform(event.target.value)} /></label>
                <label><span>目标读者</span><input value={articleAudience} onChange={(event) => setArticleAudience(event.target.value)} /></label>
                <label><span>主题</span><input value={articleTopic} onChange={(event) => setArticleTopic(event.target.value)} /></label>
                <label><span>口吻</span><input value={articleTone} onChange={(event) => setArticleTone(event.target.value)} /></label>
              </div>
              <div className="filter-block">
                <span>字数范围</span>
                <div className="chip-row tight">
                  {ARTICLE_LENGTH_OPTIONS.map((option) => (
                    <button key={option.value} className={`chip-button ${articleLength === option.value ? 'active' : ''}`} onClick={() => setArticleLength(option.value)}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <label className="field-label">自定义要求</label>
              <textarea value={articleRequirement} onChange={(event) => setArticleRequirement(event.target.value)} />
              <button className="primary wide" disabled={busy || !workspacePath} onClick={() => runAction(generateArticle)}>生成大纲 / 正文 / 发布检查</button>
            </article>
            <article className="panel article-preview">
              <div className="panel-title">
                <div><p className="eyebrow">Draft</p><h3>正文 / 发布检查</h3></div>
                <button className="ghost small" disabled={!articleResult || busy} onClick={() => runAction(exportArticleMarkdown)}>导出 Markdown</button>
              </div>
              {articleResult ? (
                <>
                  <div className="chip-row">{articleResult.titleCandidates.map((title) => <span key={title} className="chip">{title}</span>)}</div>
                  <p className="article-summary">{articleResult.summary}</p>
                  <pre>{articleResult.markdown}</pre>
                  <div className="check-list">{articleResult.publishCheck.map((item) => <p key={item.message} className={item.level}>{item.message}</p>)}</div>
                  {articleExportPath ? <div className="result-card succeeded"><strong>已导出</strong><p>{articleExportPath}</p></div> : null}
                </>
              ) : <div className="empty-state">点击生成后会出现标题候选、正文草稿和发布检查。</div>}
            </article>
          </section>
        ) : null}

        {activeModule === 'knowledge' ? (
          <section className="module-grid knowledge-layout">
            <article className="panel">
              <div className="panel-title">
                <div><p className="eyebrow">Knowledge</p><h3>已成型知识库</h3></div>
                <button className="ghost small" onClick={() => runAction(importKnowledgeBase)} disabled={!workspacePath}>导入 DOCX / MD / JSON</button>
              </div>
              <div className="knowledge-list">
                {knowledgeBases.map((base) => (
                  <article key={`${base.source}:${base.id}`} className="kb-card">
                    <div><strong>{base.title}</strong><p>{base.description}</p><small>{baseLabel(base.baseType)} · {base.source === 'builtin' ? '内置样例' : 'Workspace'} · {base.sections.length} 章节</small></div>
                    {base.source === 'builtin' ? <button className="ghost small" disabled={!workspacePath} onClick={() => runAction(() => installBuiltinKnowledgeBase(base.id))}>安装</button> : null}
                  </article>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-title"><div><p className="eyebrow">Citation</p><h3>引用检索</h3></div><button className="primary small" onClick={() => runAction(searchKnowledge)}>搜索</button></div>
              <input value={knowledgeQuery} onChange={(event) => setKnowledgeQuery(event.target.value)} placeholder="输入卖点、合规、场景、口吻等关键词" />
              <div className="filter-block">
                <span>知识库类型</span>
                <div className="chip-row tight">
                  {KNOWLEDGE_BASE_FILTERS.map((filter) => (
                    <button key={filter.value} className={`chip-button ${knowledgeBaseFilter === filter.value ? 'active' : ''}`} onClick={() => setKnowledgeBaseFilter(filter.value)}>
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="filter-block">
                <span>章节类型</span>
                <div className="chip-row tight">
                  {KNOWLEDGE_SECTION_FILTERS.map((filter) => (
                    <button key={filter.value} className={`chip-button ${knowledgeSectionFilter === filter.value ? 'active' : ''}`} onClick={() => setKnowledgeSectionFilter(filter.value)}>
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="search-results">
                {searchResults.map((result) => (
                  <button key={`${result.knowledgeBaseId}:${result.section.id}`} onClick={() => addCitation(result)}>
                    <strong>{result.section.title}</strong>
                    <small>{result.baseTitle} · {sectionLabel(result.section.sectionType)}</small>
                    <p>{clip(result.section.content, 150)}</p>
                  </button>
                ))}
              </div>
            </article>

            <article className="panel">
              <div className="panel-title"><div><p className="eyebrow">Prompt Pack</p><h3>提示词包 / 场景库</h3></div><button className="ghost small" disabled={!activePromptPack || busy} onClick={() => runAction(generateSceneCards)}>生成场景</button></div>
              <div className="selected-citations">
                {selectedCitations.map((citation) => <span key={`${citation.knowledgeBaseId}:${citation.sectionId}`}>{sectionLabel(citation.sectionType)} · {citation.title}</span>)}
                {selectedCitations.length === 0 ? <p>未手动选择引用时，会默认使用检索结果前三条。</p> : null}
              </div>
              {activePromptPack ? (
                <div className="prompt-pack edit-stack">
                  <strong>{activePromptPack.name}</strong>
                  <label><span>品牌口吻</span><textarea value={promptPackDraft.brandVoice} onChange={(event) => setPromptPackDraft((current) => ({ ...current, brandVoice: event.target.value }))} /></label>
                  <label><span>视觉风格</span><textarea value={promptPackDraft.visualStyle} onChange={(event) => setPromptPackDraft((current) => ({ ...current, visualStyle: event.target.value }))} /></label>
                  <button className="primary small" onClick={() => runAction(savePromptPackDraft)}>保存提示词包</button>
                </div>
              ) : <div className="empty-state">先生成品牌 / 产品提示词包。</div>}
              {activeEditableScene ? (
                <div className="prompt-pack edit-stack">
                  <strong>编辑场景卡</strong>
                  <label><span>场景标题</span><input value={sceneCardDraft.title} onChange={(event) => setSceneCardDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                  <label><span>图片素材建议</span><textarea value={sceneCardDraft.imageMaterialSuggestion} onChange={(event) => setSceneCardDraft((current) => ({ ...current, imageMaterialSuggestion: event.target.value }))} /></label>
                  <label><span>视频素材建议</span><textarea value={sceneCardDraft.videoMaterialSuggestion} onChange={(event) => setSceneCardDraft((current) => ({ ...current, videoMaterialSuggestion: event.target.value }))} /></label>
                  <button className="primary small" onClick={() => runAction(saveSceneCardDraft)}>保存场景卡</button>
                </div>
              ) : null}
            </article>
          </section>
        ) : null}

        {activeModule === 'assets' ? (
          <section className="panel full-panel">
            <div className="panel-title"><div><p className="eyebrow">Assets</p><h3>生成历史 / 素材库</h3></div><span className="status-pill">{logs.length} 条记录</span></div>
            <div className="chip-row">
              {HISTORY_FILTERS.map((filter) => (
                <button key={filter.value} className={`chip-button ${historyFilter === filter.value ? 'active' : ''}`} onClick={() => setHistoryFilter(filter.value)}>
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="log-list">
              {filteredLogs.map((log) => {
                const localRefs = extractLocalRefsFromLog(log);
                const skillSlugs = extractSkillSlugsFromLog(log);
                return (
                  <article key={log.id} className={`log-card ${log.status}`}>
                    <span>{kindLabel(log.kind)}</span>
                    <strong>{log.title}</strong>
                    <p>{log.summary ?? log.error ?? '无摘要'}</p>
                    <small>{statusLabel(log.status)} · {log.model ?? 'local'} · 引用 {log.citations?.length ?? 0} · Skills {skillSlugs.length} · 素材 {localRefs.length} · {new Date(log.createdAt).toLocaleString()}</small>
                    {skillSlugs.length ? (
                      <div className="skill-chip-row">
                        {skillSlugs.map((slug) => <span key={slug}>{slug}</span>)}
                      </div>
                    ) : null}
                    <div className="log-actions">
                      <button className="ghost small" onClick={() => runAction(() => copyLogPrompt(log))}>{copiedLogId === log.id ? '已复制' : '复制提示词'}</button>
                      <button className="ghost small" disabled={localRefs.length === 0} onClick={() => runAction(() => revealLogPath(log))}>打开素材位置</button>
                    </div>
                    <details>
                      <summary>查看输入 / 输出摘要</summary>
                      <pre>{JSON.stringify({ input: log.input, output: log.output, error: log.error }, null, 2).slice(0, 2200)}</pre>
                    </details>
                  </article>
                );
              })}
              {filteredLogs.length === 0 ? <div className="empty-state">生成提示词包、场景卡、文章、图片或视频后会在这里沉淀历史。</div> : null}
            </div>
          </section>
        ) : null}

        {activeModule === 'skills' ? (
          <section className="panel full-panel">
            <div className="panel-title"><div><p className="eyebrow">Skills</p><h3>高级能力库</h3></div><span className="status-pill">{skillSelection?.enabledSkills.length ?? 0} 已启用</span></div>
            <div className="skills-grid">
              {skills.map((skill) => {
                const enabled = enabledSkillKeys.has(skillKey(skill));
                return (
                  <article key={`${skill.source}:${skill.slug}`} className={`skill-card ${enabled ? 'enabled' : ''} ${skill.valid ? '' : 'invalid'}`}>
                    <div>
                      <strong>{skill.metadata.icon ?? '◇'} {skill.metadata.name}</strong>
                      <p>{skill.metadata.description}</p>
                      <small>{sourceLabel(skill.source)} · {skill.slug}</small>
                      {skill.error ? <em>{skill.error}</em> : null}
                    </div>
                    <div className="skill-actions">
                      {skill.source === 'builtin' ? <button className="ghost small" disabled={!workspacePath} onClick={() => runAction(() => installSkill(skill.slug))}>安装</button> : null}
                      <button className="primary small" disabled={!workspacePath || !skill.valid} onClick={() => runAction(() => toggleSkill(skill))}>{enabled ? '停用' : '启用'}</button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </section>

      <aside className="params-panel">
        <section className="panel compact">
          <div className="panel-title"><div><p className="eyebrow">Global Params</p><h3>全局参数</h3></div></div>
          <label><span>文字模型</span><input readOnly value={params.textModel} /></label>
          <label><span>图片模型</span><input readOnly value={params.imageModel} /></label>
          <label><span>视频模型</span><input readOnly value={params.videoModel} /></label>
          <div className="param-block"><span>生成数量</span><input type="range" min="1" max="4" value={params.count} onChange={(event) => setParams((current) => ({ ...current, count: Number(event.target.value) }))} /><strong>{params.count}</strong></div>
          <div className="chip-row tight">{(['1:1', '4:5', '3:4', '9:16', '16:9'] as GlobalGenerationParams['aspectRatio'][]).map((ratio) => <button key={ratio} className={`chip-button ${params.aspectRatio === ratio ? 'active' : ''}`} onClick={() => setParams((current) => ({ ...current, aspectRatio: ratio }))}>{ratio}</button>)}</div>
          <div className="chip-row tight">{(['1k', '2k', '4k'] as GlobalGenerationParams['resolution'][]).map((resolution) => <button key={resolution} className={`chip-button ${params.resolution === resolution ? 'active' : ''}`} onClick={() => setParams((current) => ({ ...current, resolution }))}>{resolution.toUpperCase()}</button>)}</div>
          <div className="chip-row tight">{(['low', 'medium', 'high'] as GlobalGenerationParams['quality'][]).map((quality) => <button key={quality} className={`chip-button ${params.quality === quality ? 'active' : ''}`} onClick={() => setParams((current) => ({ ...current, quality }))}>{quality}</button>)}</div>
        </section>

        <section className="panel compact">
          <p className="eyebrow">已选知识引用</p>
          <div className="citation-stack">
            {citationsForRequest.map((citation) => <article key={`${citation.knowledgeBaseId}:${citation.sectionId}`}><strong>{sectionLabel(citation.sectionType)}</strong><p>{citation.excerpt}</p></article>)}
          </div>
        </section>

        <section className="panel compact">
          <p className="eyebrow">当前启用 Skills</p>
          <div className="selected-citations">
            {(skillSelection?.enabledSkills ?? []).map((skill) => <span key={skillKey(skill)}>{skill.slug}</span>)}
            {!skillSelection?.enabledSkills.length ? <p>选择 workspace 后可启用生成链路使用的 Skills。</p> : null}
          </div>
        </section>
      </aside>

      {showSettingsDialog ? (
        <div className="modal-backdrop" onClick={() => setShowSettingsDialog(false)}>
          <div className="modal-card settings-modal" onClick={(event) => event.stopPropagation()}>
            <div className="settings-layout">
              <aside className="settings-sidebar">
                <div className="settings-header">
                  <h3>设置 <span className="shortcut">⌘,</span></h3>
                </div>
                <nav className="settings-nav">
                  <button className={`nav-item ${settingsTab === 'general' ? 'active' : ''}`} onClick={() => setSettingsTab('general')}>
                    <span className="icon">⚙️</span> 通用
                  </button>
                  <button className={`nav-item ${settingsTab === 'theme' ? 'active' : ''}`} onClick={() => setSettingsTab('theme')}>
                    <span className="icon">🖌️</span> 主题
                  </button>
                  <button className={`nav-item ${settingsTab === 'model' ? 'active' : ''}`} onClick={() => setSettingsTab('model')}>
                    <span className="icon">🧠</span> 模型
                  </button>
                  <button className={`nav-item ${settingsTab === 'account' ? 'active' : ''}`} onClick={() => setSettingsTab('account')}>
                    <span className="icon">👤</span> 账号
                  </button>
                  <button className={`nav-item ${settingsTab === 'about' ? 'active' : ''}`} onClick={() => setSettingsTab('about')}>
                    <span className="icon">ℹ️</span> 关于
                  </button>
                </nav>
              </aside>

              <main className="settings-content">
                {settingsTab === 'general' ? (
                  <div className="general-settings">
                    <div className="panel-title" style={{ marginBottom: '24px' }}>
                      <h3>通用</h3>
                    </div>

                    <div className="settings-list">
                      <div className="settings-row-item">
                        <div className="item-info">
                          <strong>菜单栏</strong>
                          <span>在菜单栏中显示 布谷AI</span>
                        </div>
                        <div className={`switch ${menubarShow ? 'active' : ''}`} onClick={() => setMenubarShow(!menubarShow)}></div>
                      </div>

                      <div className="settings-row-item">
                        <div className="item-info">
                          <strong>开机自动</strong>
                          <span>登录计算机时自动启动 布谷AI</span>
                        </div>
                        <div className={`switch ${autoStart ? 'active' : ''}`} onClick={() => setAutoStart(!autoStart)}></div>
                      </div>

                      <div className="settings-row-item">
                        <div className="item-info">
                          <strong>通知</strong>
                          <span>在 布谷AI 完成响应时接收通知。适用于长线程任务。</span>
                        </div>
                        <div className={`switch ${notificationsEnabled ? 'active' : ''}`} onClick={() => setNotificationsEnabled(!notificationsEnabled)}></div>
                      </div>

                      <div className="settings-row-item">
                        <div className="item-info">
                          <strong>减少动画</strong>
                          <span>关闭界面过渡动画，降低 GPU 功耗</span>
                        </div>
                        <div className={`switch ${reduceAnimation ? 'active' : ''}`} onClick={() => setReduceAnimation(!reduceAnimation)}></div>
                      </div>

                      <div className="settings-row-item">
                        <div className="item-info">
                          <strong>同步 Claude Code 历史</strong>
                          <span>将本地 Claude Code 终端对话同步到当前工作区</span>
                        </div>
                        <div className={`switch ${syncClaudeHistory ? 'active' : ''}`} onClick={() => setSyncClaudeHistory(!syncClaudeHistory)}></div>
                      </div>

                      <div className="settings-row-item">
                        <div className="item-info">
                          <strong>快捷键唤起小窗</strong>
                          <span>在桌面任意位置唤起 布谷AI</span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span className="hotkey-capsule">⌥ ␣</span>
                          <div className={`switch ${shortcutActive ? 'active' : ''}`} onClick={() => setShortcutActive(!shortcutActive)}></div>
                        </div>
                      </div>

                      <div className="settings-row-item">
                        <div className="item-info">
                          <strong>命令白名单</strong>
                          <span>允许自动运行的命令</span>
                        </div>
                        <div className={`switch ${commandWhitelist ? 'active' : ''}`} onClick={() => setCommandWhitelist(!commandWhitelist)}></div>
                      </div>
                    </div>
                  </div>
                ) : settingsTab === 'theme' ? (
                  <>
                    <div className="panel-title"><h3>主题外观</h3></div>
                    <div className="theme-section">
                      <label className="field-label">外观模式</label>
                      <div className="chip-row">
                        <button className={`chip-button ${themeMode === 'light' ? 'active' : ''}`} onClick={() => setThemeMode('light')}>浅色</button>
                        <button className={`chip-button ${themeMode === 'dark' ? 'active' : ''}`} onClick={() => setThemeMode('dark')}>深色</button>
                        <button className={`chip-button ${themeMode === 'system' ? 'active' : ''}`} onClick={() => setThemeMode('system')}>跟随系统</button>
                      </div>
                    </div>
                    <div className="theme-section">
                      <label className="field-label">颜色主题</label>
                      <div className="color-grid">
                        <button
                          className="color-card"
                          onClick={() => {
                            const randomTheme = COLOR_THEME_OPTIONS[Math.floor(Math.random() * COLOR_THEME_OPTIONS.length)]?.value ?? 'emerald';
                            setColorTheme(randomTheme);
                          }}
                        >
                          <span className="color-swatch" style={{ background: 'linear-gradient(135deg, #395745 50%, #F3F7F4 50%)' }}></span>
                          <div><strong>随机</strong><p>每次点击随机生成配色</p></div>
                        </button>
                        {COLOR_THEME_OPTIONS.map((option) => (
                          <button key={option.value} className={`color-card ${colorTheme === option.value ? 'active' : ''}`} onClick={() => setColorTheme(option.value)}>
                            <span className="color-swatch" style={{ background: option.color }}></span>
                            <div><strong>{option.label}</strong><p>{option.description}</p></div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : settingsTab === 'model' ? (
                  <div className="model-settings-layout">
                    <aside className="model-sidebar">
                      <div className="model-sidebar-header">
                        <h2>模型</h2>
                        <p>如果配置遇到问题，可以查阅<a href="#">配置指南</a>。</p>
                      </div>
                      <div className="model-list-header">
                        <div>
                          <strong>启用的模型</strong>
                          <span>拖拽排序，首位为默认</span>
                        </div>
                        <button className="add-btn">+</button>
                      </div>
                      <div className="model-list">
                        <div className={`model-list-item ${modelSettingView === 'edit_claude' ? 'active' : ''}`} onClick={() => setModelSettingView('edit_claude')}>
                          <span className="drag-handle">⋮⋮</span>
                          <span className="icon" style={{ color: '#E05A47' }}>✹</span>
                          <div className="item-text">
                            <strong>默认 (Claude) <em className="tag-green">默认</em></strong>
                            <span>Use the default model (curre...</span>
                          </div>
                        </div>
                        <div className={`model-list-item ${modelSettingView === 'edit_deepseek' ? 'active' : ''}`} onClick={() => setModelSettingView('edit_deepseek')}>
                          <span className="drag-handle">⋮⋮</span>
                          <span className="icon blue">🐳</span>
                          <div className="item-text">
                            <strong>DeepSeek</strong>
                            <span>deepseek-v4-pro</span>
                          </div>
                        </div>
                        <button className="add-model-btn" onClick={() => setModelSettingView('provider_list')}>+ 添加模型</button>
                      </div>
                    </aside>
                    <main className="model-content">
                      {modelSettingView === 'edit_claude' ? (
                        <div className="model-edit-card custom-provider">
                          <div className="card-title" style={{ fontSize: '18px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                            <span className="icon" style={{ color: '#E05A47' }}>✹</span> 默认 (Claude)
                          </div>

                          <div className="ready-banner">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="20 6 9 17 4 12"></polyline>
                            </svg>
                            <span>已就绪 — 使用 Claude 原生 OAuth 认证，无需配置 API Key</span>
                          </div>

                          <label className="field-label" style={{ fontWeight: 500, fontSize: '13px' }}>模型优先级</label>
                          <div className="priority-list">
                            <div className="priority-item">
                              <span className="drag-handle">⋮⋮</span>
                              <span className="tag tag-main">主模型</span>
                              <span className="model-name">Use the default model (currently Sonnet 4.6)</span>
                            </div>
                            <div className="priority-item">
                              <span className="drag-handle">⋮⋮</span>
                              <span className="tag tag-backup">备份 1</span>
                              <span className="model-name">Haiku 4.5</span>
                            </div>
                            <div className="priority-item">
                              <span className="drag-handle">⋮⋮</span>
                              <span className="tag tag-backup">备份 2</span>
                              <span className="model-name">Sonnet 4.6 for long sessions</span>
                            </div>
                            <div className="priority-item">
                              <span className="drag-handle">⋮⋮</span>
                              <span className="tag tag-backup">备份 3</span>
                              <span className="model-name">Opus 4.7 (1M)</span>
                            </div>
                          </div>
                          <p style={{ fontSize: '11px', color: 'var(--muted)', marginTop: '8px', paddingLeft: '4px' }}>
                            拖拽调整优先级，首位为新对话默认
                          </p>
                        </div>
                      ) : modelSettingView === 'edit_deepseek' ? (
                        <div className="model-edit-card">
                          <div className="card-header">
                            <div className="title"><span className="icon blue">🐳</span> DeepSeek</div>
                            <a href="#" className="link">去获取 API 密钥 ↗</a>
                          </div>
                          <div className="card-body">
                            <label className="field-label">API 密钥</label>
                            <div className="input-with-icon">
                              <input type="password" value="********************************" readOnly />
                              <button className="icon-btn">👁</button>
                            </div>

                            <label className="field-label" style={{ marginTop: '20px' }}>模型优先级（至少添加一个）</label>
                            <div className="priority-box">
                              <div className="priority-item-inline">
                                <span className="drag-handle">⋮⋮</span>
                                <em className="tag-orange">主模型</em>
                                <span>deepseek-v4-pro</span>
                              </div>
                              <button className="add-model-inline">+ 添加模型</button>
                            </div>

                            <button className="test-conn-btn">🔌 测试连接</button>
                          </div>
                        </div>
                      ) : modelSettingView === 'provider_list' ? (
                        <div className="provider-list-view">
                          <div className="provider-tabs">
                            <button className={providerTab === 'recommended' ? 'active' : ''} onClick={() => setProviderTab('recommended')}>推荐服务</button>
                            <button className={providerTab === 'domestic' ? 'active' : ''} onClick={() => setProviderTab('domestic')}>国内服务</button>
                            <button className={providerTab === 'aggregate' ? 'active' : ''} onClick={() => setProviderTab('aggregate')}>聚合平台</button>
                            <button className={providerTab === 'overseas' ? 'active' : ''} onClick={() => setProviderTab('overseas')}>海外平台</button>
                            <button className={providerTab === 'local' ? 'active' : ''} onClick={() => setProviderTab('local')}>本地模型</button>
                          </div>

                          {providerTab === 'recommended' ? (
                            <div className="provider-grid">
                              <div className="provider-card">
                                <div className="title"><span className="icon">K</span> Kimi Coding Plan <em className="tag-orange">推荐</em></div>
                                <p>Kimi 智能助手的编程版，月之暗面出品</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon red">S</span> GPTNB <em className="tag-orange">推荐</em></div>
                                <p>可用Claude，最全模型聚合服务</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon dark">✒</span> PipeIlm (Claude) <em className="tag-orange">推荐</em></div>
                                <p>推特大佬 Cydia 官方 Claude 渠道</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon dark">✒</span> PipeIlm (聚合) <em className="tag-orange">推荐</em></div>
                                <p>推特大佬 Cydia 模型聚合服务</p>
                              </div>
                              <div className="provider-card" onClick={() => setModelSettingView('edit_custom')}>
                                <div className="title"><span className="icon grey">⚙</span> 自定义供应商</div>
                                <p>配置自定义 API 兼容的供应商</p>
                              </div>
                            </div>
                          ) : providerTab === 'domestic' ? (
                            <div className="provider-grid">
                              <div className="provider-card">
                                <div className="title"><span className="icon">K</span> Kimi Coding Plan <em className="tag-orange">推荐</em></div>
                                <p>Kimi 智能助手的编程版，月之暗面出品</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon pink">〰</span> MiniMax</div>
                                <p>国产领先的 AI 编程模型，性价比高，新手...</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon dark">🌙</span> Moonshot</div>
                                <p>月之暗面开放平台，按量计费</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon blue">Z</span> 智谱</div>
                                <p>智谱 GLM 大模型，国内老牌 AI 厂商</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon blue">🐳</span> DeepSeek <em className="tag-green">已激活</em></div>
                                <p>DeepSeek 深度求索，按量计费</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon grey">⚙</span> 百炼 Coding Plan</div>
                                <p>阿里云百炼，通义千问系列模型</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon blue">↱</span> 阶跃星辰</div>
                                <p>阶跃星辰，Step 系列模型</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon blue">◯</span> 百灵 (BaiLing)</div>
                                <p>支付宝百灵，Ling 系列模型</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon green">🐱</span> Longcat</div>
                                <p>长上下文优化服务</p>
                              </div>
                              <div className="provider-card">
                                <div className="title"><span className="icon dark">☵</span> 小米 MiMo</div>
                                <p>小米 MiMo 开放平台</p>
                              </div>
                              <div className="provider-card" onClick={() => setModelSettingView('edit_custom')}>
                                <div className="title"><span className="icon grey">⚙</span> 自定义供应商</div>
                                <p>配置自定义 API 兼容的供应商</p>
                              </div>
                            </div>
                          ) : (
                            <div className="empty-state">暂无该分类的推荐服务。</div>
                          )}
                        </div>
                      ) : (
                        <div className="model-edit-card custom-provider">
                          <button className="back-btn" onClick={() => setModelSettingView('provider_list')}>&lt; 返回列表</button>
                          <div className="card-body">
                            <div className="card-title"><span className="icon grey">⚙</span> 自定义供应商</div>

                            <label className="field-label">供应商名称</label>
                            <input type="text" placeholder="例如: My API Provider" />

                            <label className="field-label" style={{ marginTop: '16px' }}>API Base URL</label>
                            <input type="text" placeholder="https://api.example.com/v1" />

                            <label className="field-label" style={{ marginTop: '16px' }}>API 格式</label>
                            <div className="toggle-group">
                              <button className="active">OpenAI 格式</button>
                              <button>Anthropic 格式</button>
                            </div>

                            <div className="switch-row" style={{ marginTop: '24px' }}>
                              <div>
                                <strong>使用 Responses API</strong>
                                <p>强制走 /v1/responses，中转站 prompt cache 命中率更高。仅当供应商支持 Responses 端点时开启，否则会 404。</p>
                              </div>
                              <div className={`switch ${responsesApiActive ? 'active' : ''}`} onClick={() => setResponsesApiActive(!responsesApiActive)}></div>
                            </div>

                            <label className="field-label" style={{ marginTop: '24px' }}>API 密钥</label>
                            <div className="input-with-icon">
                              <input type="password" placeholder="输入 API 密钥" />
                              <button className="icon-btn">👁</button>
                            </div>

                            <label className="field-label" style={{ marginTop: '20px' }}>模型优先级（至少添加一个）</label>
                            <div className="priority-box">
                              <button className="add-model-inline">+ 添加模型</button>
                            </div>

                            <button className="test-conn-btn" disabled>🔌 测试连接并激活</button>
                          </div>
                        </div>
                      )}
                    </main>
                  </div>
                ) : settingsTab === 'account' ? (
                  <div className="account-settings">
                    <div className="panel-title" style={{ marginBottom: '24px' }}>
                      <h3>账号</h3>
                    </div>

                    <div className="account-section">
                      <span className="section-label">头像</span>
                      <div className="avatar-row">
                        <div className="avatar-circle">C</div>
                        <span className="change-avatar-text">点击更换头像</span>
                      </div>
                    </div>

                    <div className="account-section">
                      <span className="section-label">昵称</span>
                      <div className="nickname-row">
                        <span className="nickname-value">未设置</span>
                        <button className="modify-btn">修改</button>
                      </div>
                    </div>

                    <div className="account-section">
                      <span className="section-label">邮箱</span>
                      <div className="email-row">
                        <span className="email-value">coso@gmail.com</span>
                      </div>
                    </div>

                    <div className="account-actions">
                      <button className="logout-btn">
                        <span className="logout-icon">↪</span> 退出登录
                      </button>
                    </div>
                  </div>
                ) : settingsTab === 'about' ? (
                  <div className="about-settings">
                    <div className="panel-title" style={{ marginBottom: '24px' }}>
                      <h3>关于</h3>
                    </div>

                    <div className="about-brand-section">
                      <img src={logoUrl} alt="Logo" className="about-logo" />
                      <h4 className="about-app-name">布谷AI</h4>
                      <span className="about-version">版本 0.2.0 (Build 2026.05.19)</span>
                      <p className="about-copyright">© 2026 Limecloud. All rights reserved.</p>
                    </div>

                    <div className="about-links-section">
                      <button className="about-link-btn" onClick={() => alert('当前已是最新版本')}>检查更新</button>
                      <button className="about-link-btn" onClick={() => window.open('https://limecloud.ai/terms', '_blank')}>服务条款</button>
                      <button className="about-link-btn" onClick={() => window.open('https://limecloud.ai/privacy', '_blank')}>隐私政策</button>
                      <button className="about-link-btn" onClick={() => window.open('https://limecloud.ai', '_blank')}>官方网站</button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="panel-title"><h3>{settingsTab}</h3></div>
                    <div className="empty-state">该设置项已预留，后续版本会接入真实配置。</div>
                  </>
                )}
              </main>
            </div>
            <div className="modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', alignItems: 'center' }}>
              {settingsTab === 'general' && (
                <button className="restore-default-btn" onClick={() => {
                  setMenubarShow(true);
                  setAutoStart(true);
                  setNotificationsEnabled(true);
                  setReduceAnimation(false);
                  setSyncClaudeHistory(false);
                  setShortcutActive(true);
                  setCommandWhitelist(false);
                }}>恢复默认</button>
              )}
              <button className="primary" onClick={() => setShowSettingsDialog(false)}>完成</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
