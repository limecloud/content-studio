import { useEffect, useMemo, useState } from 'react';
import type {
  ArticleGenerationResult,
  AppSettingsView,
  GenerationLogEntry,
  GlobalGenerationParams,
  KnowledgeBaseView,
  KnowledgeCitation,
  KnowledgeSearchResult,
  LoadedSkill,
  MediaGenerationResult,
  ModelConfigView,
  PromptPack,
  SceneCard,
  SkillRef,
  SkillSelectionView,
} from '../../shared/types';

type ModuleKey = 'image' | 'video' | 'article' | 'knowledge' | 'assets' | 'skills';

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

const NAV_GROUPS: Array<{ title: string; items: Array<{ key: ModuleKey; label: string; badge?: string; disabled?: boolean }> }> = [
  { title: '图片', items: [{ key: 'image', label: '图片引擎', badge: 'current' }] },
  { title: '视频', items: [{ key: 'video', label: '视频引擎', badge: '爆款拆解' }] },
  { title: '文案', items: [{ key: 'article', label: '文章生成', badge: 'Claude' }] },
  { title: '知识库', items: [{ key: 'knowledge', label: '成型知识库' }] },
  { title: '资产', items: [{ key: 'assets', label: '素材库 / 历史' }] },
  { title: '管理', items: [{ key: 'skills', label: 'Skills 管理' }] },
];

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

export function App() {
  const [activeModule, setActiveModule] = useState<ModuleKey>('image');
  const [settings, setSettings] = useState<AppSettingsView | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfigView | null>(null);
  const [modelDraft, setModelDraft] = useState<ModelDraft>({ apiEndpoint: '', apiKey: '', textModel: '', imageModels: '', videoModel: '' });
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [skills, setSkills] = useState<LoadedSkill[]>([]);
  const [skillSelection, setSkillSelection] = useState<SkillSelectionView | null>(null);
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBaseView[]>([]);
  const [knowledgeQuery, setKnowledgeQuery] = useState('卖点 合规 场景');
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [selectedCitations, setSelectedCitations] = useState<KnowledgeCitation[]>([]);
  const [promptPacks, setPromptPacks] = useState<PromptPack[]>([]);
  const [activePromptPackId, setActivePromptPackId] = useState('');
  const [sceneCards, setSceneCards] = useState<SceneCard[]>([]);
  const [selectedSceneIds, setSelectedSceneIds] = useState<string[]>([]);
  const [logs, setLogs] = useState<GenerationLogEntry[]>([]);
  const [params, setParams] = useState<GlobalGenerationParams>(DEFAULT_PARAMS);
  const [articleResult, setArticleResult] = useState<ArticleGenerationResult | null>(null);
  const [mediaResult, setMediaResult] = useState<MediaGenerationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workspacePath = settings?.workspacePath;
  const enabledSkillKeys = useMemo(() => new Set((skillSelection?.enabledSkills ?? []).map(skillKey)), [skillSelection]);
  const activePromptPack = useMemo(() => promptPacks.find((pack) => pack.id === activePromptPackId) ?? promptPacks[0], [activePromptPackId, promptPacks]);
  const activeScenes = useMemo(() => sceneCards.filter((card) => selectedSceneIds.includes(card.id)), [sceneCards, selectedSceneIds]);
  const selectedSceneIdsForRequest = activeScenes.length ? activeScenes.map((scene) => scene.id) : sceneCards.slice(0, 1).map((scene) => scene.id);
  const citationsForRequest = selectedCitations.length ? selectedCitations : searchResults.slice(0, 3).map(citationFromResult);

  async function refresh(nextWorkspace?: string): Promise<void> {
    const [nextSettings, nextModelConfig] = await Promise.all([
      window.contentStudio.getSettings(),
      window.contentStudio.getModelConfig(),
    ]);
    const workspace = nextWorkspace ?? nextSettings.workspacePath;
    const [nextSkills, nextKnowledgeBases, nextSearchResults] = await Promise.all([
      window.contentStudio.scanSkills(workspace),
      window.contentStudio.listKnowledgeBases(workspace),
      window.contentStudio.searchKnowledge({ workspacePath: workspace, query: knowledgeQuery, baseType: 'all', sectionType: 'all' }),
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

  async function searchKnowledge(): Promise<void> {
    const results = await window.contentStudio.searchKnowledge({ workspacePath, query: knowledgeQuery, baseType: 'all', sectionType: 'all' });
    setSearchResults(results);
  }

  function addCitation(result: KnowledgeSearchResult): void {
    const citation = citationFromResult(result);
    setSelectedCitations((current) => (current.some((item) => isSameCitation(item, citation)) ? current : [...current, citation].slice(0, 8)));
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

  async function generateArticle(): Promise<void> {
    const workspace = requireWorkspace();
    const result = await window.contentStudio.generateArticle({
      workspacePath: workspace,
      articleType: 'wechat-longform',
      platform: '公众号',
      audience: '关注产品真实价值和使用场景的用户',
      topic: activePromptPack?.name ?? '成型知识库驱动的内容工程',
      tone: activePromptPack?.brandVoice ?? '专业、自然、克制',
      length: 'medium',
      customRequirement: '先做人话策略，再给事实引用，最后承接图片和视频素材生成。',
      citations: citationsForRequest,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      assetRefs: [],
      selectedSkillSlugs: skillSelection?.enabledSkills.map((skill) => skill.slug) ?? [],
      params: { textModel: params.textModel },
    });
    setArticleResult(result);
    setActiveModule('article');
    await refresh(workspace);
  }

  async function generateImage(): Promise<void> {
    const workspace = requireWorkspace();
    const prompt = activeScenes[0]?.imageMaterialSuggestion || activePromptPack?.imagePromptFragments[0] || '根据知识库生成一张电商场景图，突出产品主体和真实使用场景。';
    const result = await window.contentStudio.generateImage({
      workspacePath: workspace,
      productImageRefs: [],
      referenceImageRefs: [],
      prompt,
      promptMode: 'preset',
      generationMode: 'smart',
      template: '电商场景图',
      watermark: false,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      params,
    });
    setMediaResult(result);
    await refresh(workspace);
  }

  async function generateVideo(): Promise<void> {
    const workspace = requireWorkspace();
    const prompt = activeScenes[0]?.videoMaterialSuggestion || activePromptPack?.videoPromptFragments[0] || '根据知识库和场景卡生成短视频镜头提示词。';
    const result = await window.contentStudio.generateVideo({
      workspacePath: workspace,
      imageAssetRefs: [],
      videoAssetRefs: [],
      prompt,
      script: activeScenes[0]?.voiceoverDirection,
      promptPackId: activePromptPack?.id,
      sceneCardIds: selectedSceneIdsForRequest,
      citations: citationsForRequest,
      params: { videoModel: params.videoModel, aspectRatio: params.aspectRatio, durationSeconds: 8 },
    });
    setMediaResult(result);
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
    <main className="app-shell">
      <aside className="sidebar">
        <section className="brand-card">
          <div className="brand-mark">L</div>
          <div>
            <p className="eyebrow">Limecloud</p>
            <h1>内容工坊</h1>
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
                  key={item.key}
                  className={`nav-item ${activeModule === item.key ? 'active' : ''} ${item.disabled ? 'disabled' : ''}`}
                  onClick={() => !item.disabled && setActiveModule(item.key)}
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
      </aside>

      <section className="stage">
        <header className="stage-header">
          <div>
            <p className="eyebrow">v1 主链</p>
            <h2>已成型知识库 → 提示词包 → 场景库 → 图片素材 → 视频队列</h2>
          </div>
          <div className="header-actions">
            <button className="ghost" onClick={openModelDialog}>模型配置</button>
            <button className="primary" disabled={busy || !workspacePath} onClick={() => runAction(generatePromptPack)}>生成提示词包</button>
          </div>
        </header>

        {error ? <div className="error-banner">{error}</div> : null}

        <section className="pipeline-strip">
          {['知识库', '提示词包', '产品场景库', '文章 / 脚本', '图片素材', '视频队列'].map((item, index) => (
            <article key={item}>
              <span>{String(index + 1).padStart(2, '0')}</span>
              <strong>{item}</strong>
            </article>
          ))}
        </section>

        {activeModule === 'image' ? (
          <section className="module-grid two-col">
            <article className="panel neon-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">Image Engine</p>
                  <h3>图片引擎</h3>
                </div>
                <span className="status-pill">智能生成</span>
              </div>
              <div className="upload-grid">
                <div className="upload-card"><span>+</span><strong>产品图上传</strong><p>0/10，可接入真实素材库</p></div>
                <div className="upload-card"><span>↗</span><strong>参考图上传</strong><p>0/6，支持风格迁移</p></div>
              </div>
              <div className="chip-row">
                {['自由模式', '预设提示词', '电商白底主图', '海报图', '场景图', '买家秀图'].map((item) => <span key={item} className="chip">{item}</span>)}
              </div>
              <label className="field-label">图片提示词</label>
              <textarea readOnly value={activeScenes[0]?.imageMaterialSuggestion || activePromptPack?.imagePromptFragments[0] || '先从知识库选择引用，再生成提示词包和产品场景库。'} />
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
              <div className="step-list">
                <article><span>01</span><strong>视频拆解</strong><p>导入参考视频，拆解钩子、节奏、字幕和镜头。v1 先保留结构化入口。</p></article>
                <article><span>02</span><strong>脚本生成</strong><p>{activeScenes[0]?.voiceoverDirection || '基于场景卡和知识引用生成新产品脚本。'}</p></article>
                <article><span>03</span><strong>视频生成</strong><p>{activeScenes[0]?.videoMaterialSuggestion || '图片素材 + 视频提示词进入生成队列。'}</p></article>
              </div>
              <button className="primary wide" disabled={busy || !workspacePath} onClick={() => runAction(generateVideo)}>生成视频队列</button>
            </article>
            <article className="panel terminal-panel">
              <p className="eyebrow">Video Prompt</p>
              <pre>{activeScenes[0]?.videoMaterialSuggestion || activePromptPack?.videoPromptFragments.join('\n') || '等待提示词包和场景库。'}</pre>
              {mediaResult ? <div className={`result-card ${mediaResult.status}`}><strong>{statusLabel(mediaResult.status)}</strong><p>{mediaResult.message}</p></div> : null}
            </article>
          </section>
        ) : null}

        {activeModule === 'article' ? (
          <section className="module-grid two-col">
            <article className="panel">
              <div className="panel-title"><div><p className="eyebrow">Article</p><h3>文章生成</h3></div><span className="status-pill">公众号 / 小红书</span></div>
              <div className="form-grid">
                <label><span>文章类型</span><input readOnly value="公众号长文" /></label>
                <label><span>目标读者</span><input readOnly value="关注产品真实价值和使用场景的用户" /></label>
                <label><span>主题</span><input readOnly value={activePromptPack?.name ?? '成型知识库驱动的内容工程'} /></label>
                <label><span>口吻</span><input readOnly value={activePromptPack?.brandVoice ?? '专业、自然、克制'} /></label>
              </div>
              <button className="primary wide" disabled={busy || !workspacePath} onClick={() => runAction(generateArticle)}>生成大纲 / 正文 / 发布检查</button>
            </article>
            <article className="panel article-preview">
              <p className="eyebrow">Draft</p>
              {articleResult ? (
                <>
                  <div className="chip-row">{articleResult.titleCandidates.map((title) => <span key={title} className="chip">{title}</span>)}</div>
                  <pre>{articleResult.markdown}</pre>
                  <div className="check-list">{articleResult.publishCheck.map((item) => <p key={item.message} className={item.level}>{item.message}</p>)}</div>
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
              {activePromptPack ? <div className="prompt-pack"><strong>{activePromptPack.name}</strong><p>{activePromptPack.brandVoice}</p><p>{activePromptPack.visualStyle}</p></div> : <div className="empty-state">先生成品牌 / 产品提示词包。</div>}
            </article>
          </section>
        ) : null}

        {activeModule === 'assets' ? (
          <section className="panel full-panel">
            <div className="panel-title"><div><p className="eyebrow">Assets</p><h3>生成历史 / 素材库</h3></div><span className="status-pill">{logs.length} 条记录</span></div>
            <div className="log-list">
              {logs.map((log) => (
                <article key={log.id} className={`log-card ${log.status}`}>
                  <span>{kindLabel(log.kind)}</span>
                  <strong>{log.title}</strong>
                  <p>{log.summary ?? log.error ?? '无摘要'}</p>
                  <small>{statusLabel(log.status)} · {log.model ?? 'local'} · {new Date(log.createdAt).toLocaleString()}</small>
                </article>
              ))}
              {logs.length === 0 ? <div className="empty-state">生成提示词包、场景卡、文章、图片或视频后会在这里沉淀历史。</div> : null}
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
          <div className="panel-title"><div><p className="eyebrow">Global Params</p><h3>全局参数</h3></div><button className="ghost small" onClick={openModelDialog}>设置</button></div>
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
      </aside>

      {showModelDialog ? (
        <div className="modal-backdrop">
          <section className="modal-card">
            <div className="panel-title"><div><p className="eyebrow">Model Config</p><h3>模型配置</h3></div><button className="ghost small" onClick={() => setShowModelDialog(false)}>关闭</button></div>
            <div className="form-grid">
              <label><span>API 端点</span><input value={modelDraft.apiEndpoint} onChange={(event) => setModelDraft((current) => ({ ...current, apiEndpoint: event.target.value }))} /></label>
              <label><span>API Key</span><input type="password" placeholder={modelConfig?.hasApiKey ? '已保存，留空不改' : '输入统一模型 Key'} value={modelDraft.apiKey} onChange={(event) => setModelDraft((current) => ({ ...current, apiKey: event.target.value }))} /></label>
              <label><span>文字模型</span><input value={modelDraft.textModel} onChange={(event) => setModelDraft((current) => ({ ...current, textModel: event.target.value }))} /></label>
              <label><span>图片模型，多个用逗号分隔</span><input value={modelDraft.imageModels} onChange={(event) => setModelDraft((current) => ({ ...current, imageModels: event.target.value }))} /></label>
              <label><span>视频模型</span><input value={modelDraft.videoModel} onChange={(event) => setModelDraft((current) => ({ ...current, videoModel: event.target.value }))} /></label>
            </div>
            <div className="modal-actions"><button className="ghost" onClick={() => setShowModelDialog(false)}>取消</button><button className="primary" onClick={() => runAction(saveModelConfig)}>保存</button></div>
          </section>
        </div>
      ) : null}
    </main>
  );
}
