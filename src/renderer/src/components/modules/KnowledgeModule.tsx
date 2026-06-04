import { useState, type Dispatch, type SetStateAction } from 'react';
import type {
  KnowledgeBaseType,
  KnowledgeBaseView,
  KnowledgeCitation,
  KnowledgeSearchResult,
  KnowledgeSection,
  KnowledgeSectionType,
  PromptPack,
  SceneCard,
} from '../../../../shared/types';
import { KNOWLEDGE_BASE_FILTERS, KNOWLEDGE_SECTION_FILTERS } from '../../app/constants';
import { baseLabel, clip, knowledgeBaseKey, sectionLabel } from '../../app/formatters';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

type KnowledgeTab = 'library' | 'search' | 'pack' | 'scene';

interface SceneCardDraft {
  title: string;
  imageMaterialSuggestion: string;
  videoMaterialSuggestion: string;
}

interface KnowledgeModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  knowledgeBases: KnowledgeBaseView[];
  knowledgeQuery: string;
  setKnowledgeQuery: Dispatch<SetStateAction<string>>;
  knowledgeBaseFilter: KnowledgeBaseType | 'all';
  setKnowledgeBaseFilter: Dispatch<SetStateAction<KnowledgeBaseType | 'all'>>;
  knowledgeSectionFilter: KnowledgeSectionType | 'all';
  setKnowledgeSectionFilter: Dispatch<SetStateAction<KnowledgeSectionType | 'all'>>;
  knowledgeTagFilter: string;
  setKnowledgeTagFilter: Dispatch<SetStateAction<string>>;
  availableKnowledgeTags: string[];
  activeKnowledgeBase?: KnowledgeBaseView;
  activeKnowledgeBaseKey: string;
  setActiveKnowledgeBaseKey: (key: string) => void;
  searchResults: KnowledgeSearchResult[];
  selectedCitations: KnowledgeCitation[];
  effectiveCitationCount: number;
  activePromptPack?: PromptPack;
  promptPackDraft: { brandVoice: string; visualStyle: string };
  setPromptPackDraft: Dispatch<SetStateAction<{ brandVoice: string; visualStyle: string }>>;
  activeEditableScene?: SceneCard;
  sceneCardDraft: SceneCardDraft;
  setSceneCardDraft: Dispatch<SetStateAction<SceneCardDraft>>;
  onImportKnowledgeBase: () => void;
  onInstallBuiltinKnowledgeBase: (id: string) => void;
  onSearchKnowledge: () => void;
  onAddCitation: (result: KnowledgeSearchResult) => void;
  onAddKnowledgeSectionCitation: (base: KnowledgeBaseView, section: KnowledgeSection) => void;
  onGenerateSceneCards: () => void;
  onSavePromptPackDraft: () => void;
  onSaveSceneCardDraft: () => void;
}

const KNOWLEDGE_TABS: Array<{ key: KnowledgeTab; label: string }> = [
  { key: 'library', label: '知识库' },
  { key: 'search', label: '引用检索' },
  { key: 'pack', label: '提示词包' },
  { key: 'scene', label: '场景卡' },
];

export function KnowledgeModule({
  busy,
  workspaceReady,
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
  activeKnowledgeBase,
  activeKnowledgeBaseKey,
  setActiveKnowledgeBaseKey,
  searchResults,
  selectedCitations,
  effectiveCitationCount,
  activePromptPack,
  promptPackDraft,
  setPromptPackDraft,
  activeEditableScene,
  sceneCardDraft,
  setSceneCardDraft,
  onImportKnowledgeBase,
  onInstallBuiltinKnowledgeBase,
  onSearchKnowledge,
  onAddCitation,
  onAddKnowledgeSectionCitation,
  onGenerateSceneCards,
  onSavePromptPackDraft,
  onSaveSceneCardDraft,
}: KnowledgeModuleProps) {
  const [activeTab, setActiveTab] = useState<KnowledgeTab>('library');

  const selectKnowledgeBase = (base: KnowledgeBaseView) => {
    setActiveKnowledgeBaseKey(knowledgeBaseKey(base));
  };

  const renderKnowledgeBaseDetail = (base: KnowledgeBaseView) => (
    <div className="kb-detail">
      <div className="kb-detail-summary">
        <div className="metadata-grid">
          <span>{baseLabel(base.baseType)}</span>
          <span>{base.source === 'builtin' ? '内置样例' : '工作区'}</span>
          <span>{base.sections.length} 章节</span>
        </div>
        {base.tags.length ? (
          <div className="tag-row">
            {base.tags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>
        ) : null}
        <p>{base.description ?? '暂无摘要'}</p>
      </div>
      <div className="kb-detail-scroll">
        <div className="section-list">
          {base.sections.map((section) => (
            <article key={section.id} className="section-card">
              <div>
                <strong>{section.title}</strong>
                <small>{sectionLabel(section.sectionType)} · {section.tags.join(' / ') || '无标签'}</small>
              </div>
              <p>{clip(section.summary || section.content, 180)}</p>
              <button className="ghost small" onClick={() => onAddKnowledgeSectionCitation(base, section)}>引用本章节</button>
            </article>
          ))}
        </div>
      </div>
    </div>
  );

  const knowledgeTabHint = (tab: KnowledgeTab): string => {
    if (tab === 'library') return `${knowledgeBases.length} 个`;
    if (tab === 'search') return `${searchResults.length} 条`;
    if (tab === 'pack') return `${effectiveCitationCount} 条`;
    return activeEditableScene ? '已选中' : '待生成';
  };

  return (
    <section className="knowledge-workbench">
      <ModuleCommandCenter
        eyebrow="知识库 / 主流程"
        title="成型知识库"
        description="导入 DOCX / Markdown 等知识库文档，检索并引用知识章节，继续生成提示词包、场景卡和下游内容。"
        density="managed"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{knowledgeBases.length} 个知识库</span>
            <span className="status-pill">{selectedCitations.length} 条已选引用</span>
            <span className={`status-pill ${activePromptPack ? 'ready' : 'idle'}`}>
              {activePromptPack ? '提示词包已连接' : '待生成提示词包'}
            </span>
          </div>
        )}
      >
        <div className="knowledge-tab-bar module-command-tabs" role="tablist" aria-label="知识工作台标签">
          {KNOWLEDGE_TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              className={activeTab === tab.key ? 'active' : ''}
              onClick={() => setActiveTab(tab.key)}
            >
              <strong>{tab.label}</strong>
              <span>{knowledgeTabHint(tab.key)}</span>
            </button>
          ))}
        </div>
      </ModuleCommandCenter>

      <div className="knowledge-tab-panel">
        {activeTab === 'library' ? (
          <div className="knowledge-tab-layout knowledge-library-layout">
            <article className="panel knowledge-list-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">知识库目录</p>
                  <h3>列表</h3>
                </div>
                <div className="knowledge-panel-actions">
                  <button className="ghost small" onClick={onImportKnowledgeBase} disabled={!workspaceReady}>导入知识库文档</button>
                  <span className="status-pill">{knowledgeBases.length} 个</span>
                </div>
              </div>
              <div className="knowledge-list">
                {knowledgeBases.map((base) => {
                  const key = knowledgeBaseKey(base);
                  const active = key === activeKnowledgeBaseKey;
                  return (
                    <article key={key} className={`kb-card ${active ? 'active' : ''}`}>
                      <button className="kb-card-main" onClick={() => selectKnowledgeBase(base)} aria-expanded={active}>
                        <div>
                          <strong>{base.title}</strong>
                        </div>
                        <p>{base.description}</p>
                        <small>{baseLabel(base.baseType)} · {base.source === 'builtin' ? '内置样例' : '工作区'} · {base.sections.length} 章节</small>
                      </button>
                      <div className="kb-card-actions">
                        {base.source === 'builtin' ? <button className="ghost small" disabled={!workspaceReady} onClick={() => onInstallBuiltinKnowledgeBase(base.id)}>安装</button> : null}
                        <button className="ghost small" onClick={() => selectKnowledgeBase(base)}>
                          {active ? '查看中' : '查看章节'}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
              {knowledgeBases.length === 0 ? <div className="empty-state">安装或导入知识库后，这里会显示知识库目录。</div> : null}
            </article>

            <article className="panel knowledge-detail-panel">
              <div className="panel-title">
                <div>
                  <p className="eyebrow">知识详情</p>
                  <h3>{activeKnowledgeBase ? activeKnowledgeBase.title : '请选择左侧知识库'}</h3>
                </div>
                {activeKnowledgeBase ? <span className="status-pill">{activeKnowledgeBase.sections.length} 章节</span> : null}
              </div>
              {activeKnowledgeBase ? renderKnowledgeBaseDetail(activeKnowledgeBase) : <div className="empty-state">点击左侧知识库卡片，右侧会展示章节、标签和引用入口。</div>}
            </article>
          </div>
        ) : null}

        {activeTab === 'search' ? (
          <article className="panel knowledge-single-panel knowledge-search-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">知识引用</p>
                <h3>引用检索</h3>
              </div>
              <button className="primary small" onClick={onSearchKnowledge}>搜索</button>
            </div>
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
            <div className="filter-block">
              <span>标签</span>
              <div className="chip-row tight">
                <button className={`chip-button ${knowledgeTagFilter === '' ? 'active' : ''}`} onClick={() => setKnowledgeTagFilter('')}>全部标签</button>
                {availableKnowledgeTags.slice(0, 14).map((tag) => (
                  <button key={tag} className={`chip-button ${knowledgeTagFilter === tag ? 'active' : ''}`} onClick={() => setKnowledgeTagFilter(tag)}>
                    {tag}
                  </button>
                ))}
              </div>
            </div>
            <div className="search-results">
              {searchResults.map((result) => (
                <button key={`${result.knowledgeBaseId}:${result.section.id}`} onClick={() => onAddCitation(result)}>
                  <strong>{result.section.title}</strong>
                  <small>{result.baseTitle} · {sectionLabel(result.section.sectionType)}</small>
                  <p>{clip(result.section.content, 150)}</p>
                </button>
              ))}
            </div>
          </article>
        ) : null}

        {activeTab === 'pack' ? (
          <article className="panel knowledge-single-panel knowledge-pack-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">提示词包</p>
                <h3>提示词包</h3>
              </div>
              <div className="knowledge-panel-actions">
                <span className="status-pill">{effectiveCitationCount} 个有效引用</span>
                <button
                  className="primary small"
                  disabled={!workspaceReady || busy || effectiveCitationCount === 0}
                  onClick={onGenerateSceneCards}
                >
                  {activePromptPack ? '生成场景卡' : '生成场景卡并补提示词包'}
                </button>
              </div>
            </div>
            <div className="knowledge-pack-grid">
              <div className="knowledge-pack-column">
                <div className="selected-citations">
                  {selectedCitations.map((citation) => <span key={`${citation.knowledgeBaseId}:${citation.sectionId}`}>{sectionLabel(citation.sectionType)} · {citation.title}</span>)}
                  {selectedCitations.length === 0 ? <p>未手动选择引用时，会默认使用检索结果、当前知识库重点章节或已解析输入源。</p> : null}
                </div>
                {activePromptPack ? (
                  <div className="prompt-pack edit-stack">
                    <strong>{activePromptPack.name}</strong>
                    <small>
                      引用 {activePromptPack.citations.length} 条
                      {activePromptPack.inputSourceIds?.length ? ` · 资料 ${activePromptPack.inputSourceIds.length} 份` : ''}
                      {activePromptPack.workflowRunId ? ' · 已关联历史' : ''}
                    </small>
                    <label><span>品牌口吻</span><textarea value={promptPackDraft.brandVoice} onChange={(event) => setPromptPackDraft((current) => ({ ...current, brandVoice: event.target.value }))} /></label>
                    <label><span>视觉风格</span><textarea value={promptPackDraft.visualStyle} onChange={(event) => setPromptPackDraft((current) => ({ ...current, visualStyle: event.target.value }))} /></label>
                    <button className="primary small" onClick={onSavePromptPackDraft}>保存提示词包</button>
                  </div>
                ) : <div className="empty-state">当前还没有提示词包。点击“生成场景卡并补提示词包”会先生成提示词包，再生成场景卡。</div>}
              </div>
              <div className="knowledge-pack-column">
                <div className="prompt-pack edit-stack">
                  <strong>生成场景</strong>
                  <p>场景卡从这里进入下一步，生成后再切到「场景卡」标签进行编辑。</p>
                </div>
              </div>
            </div>
          </article>
        ) : null}

        {activeTab === 'scene' ? (
          <article className="panel knowledge-single-panel knowledge-scene-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">场景卡</p>
                <h3>编辑场景卡</h3>
              </div>
              <span className="status-pill">{activeEditableScene ? '可编辑' : '待生成'}</span>
            </div>
            {activeEditableScene ? (
              <div className="prompt-pack edit-stack">
                <strong>{activeEditableScene.title}</strong>
                <small>
                  已关联提示词包
                  {activeEditableScene.inputSourceIds?.length ? ` · 资料 ${activeEditableScene.inputSourceIds.length} 份` : ''}
                  {activeEditableScene.citations.length ? ` · 引用 ${activeEditableScene.citations.length} 条` : ''}
                  {activeEditableScene.workflowRunId ? ' · 已关联历史' : ''}
                </small>
                <label><span>场景标题</span><input value={sceneCardDraft.title} onChange={(event) => setSceneCardDraft((current) => ({ ...current, title: event.target.value }))} /></label>
                <label><span>图片素材建议</span><textarea value={sceneCardDraft.imageMaterialSuggestion} onChange={(event) => setSceneCardDraft((current) => ({ ...current, imageMaterialSuggestion: event.target.value }))} /></label>
                <label><span>视频素材建议</span><textarea value={sceneCardDraft.videoMaterialSuggestion} onChange={(event) => setSceneCardDraft((current) => ({ ...current, videoMaterialSuggestion: event.target.value }))} /></label>
                <button className="primary small" onClick={onSaveSceneCardDraft}>保存场景卡</button>
              </div>
            ) : (
              <div className="empty-state">先生成场景卡，再在这里编辑标题和素材建议。</div>
            )}
          </article>
        ) : null}
      </div>
    </section>
  );
}
