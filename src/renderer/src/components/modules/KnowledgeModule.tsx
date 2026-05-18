import type { Dispatch, SetStateAction } from 'react';
import type {
  KnowledgeBaseType,
  KnowledgeBaseView,
  KnowledgeCitation,
  KnowledgeSearchResult,
  KnowledgeSectionType,
  PromptPack,
  SceneCard,
} from '../../../../shared/types';
import { KNOWLEDGE_BASE_FILTERS, KNOWLEDGE_SECTION_FILTERS } from '../../app/constants';
import { baseLabel, clip, sectionLabel } from '../../app/formatters';

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
  searchResults: KnowledgeSearchResult[];
  selectedCitations: KnowledgeCitation[];
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
  onGenerateSceneCards: () => void;
  onSavePromptPackDraft: () => void;
  onSaveSceneCardDraft: () => void;
}

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
  searchResults,
  selectedCitations,
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
  onGenerateSceneCards,
  onSavePromptPackDraft,
  onSaveSceneCardDraft,
}: KnowledgeModuleProps) {
  return (
    <section className="module-grid knowledge-layout">
      <article className="panel">
        <div className="panel-title">
          <div><p className="eyebrow">Knowledge</p><h3>已成型知识库</h3></div>
          <button className="ghost small" onClick={onImportKnowledgeBase} disabled={!workspaceReady}>导入 DOCX / MD / JSON</button>
        </div>
        <div className="knowledge-list">
          {knowledgeBases.map((base) => (
            <article key={`${base.source}:${base.id}`} className="kb-card">
              <div><strong>{base.title}</strong><p>{base.description}</p><small>{baseLabel(base.baseType)} · {base.source === 'builtin' ? '内置样例' : 'Workspace'} · {base.sections.length} 章节</small></div>
              {base.source === 'builtin' ? <button className="ghost small" disabled={!workspaceReady} onClick={() => onInstallBuiltinKnowledgeBase(base.id)}>安装</button> : null}
            </article>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-title"><div><p className="eyebrow">Citation</p><h3>引用检索</h3></div><button className="primary small" onClick={onSearchKnowledge}>搜索</button></div>
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
            <button key={`${result.knowledgeBaseId}:${result.section.id}`} onClick={() => onAddCitation(result)}>
              <strong>{result.section.title}</strong>
              <small>{result.baseTitle} · {sectionLabel(result.section.sectionType)}</small>
              <p>{clip(result.section.content, 150)}</p>
            </button>
          ))}
        </div>
      </article>

      <article className="panel">
        <div className="panel-title"><div><p className="eyebrow">Prompt Pack</p><h3>提示词包 / 场景库</h3></div><button className="ghost small" disabled={!activePromptPack || busy} onClick={onGenerateSceneCards}>生成场景</button></div>
        <div className="selected-citations">
          {selectedCitations.map((citation) => <span key={`${citation.knowledgeBaseId}:${citation.sectionId}`}>{sectionLabel(citation.sectionType)} · {citation.title}</span>)}
          {selectedCitations.length === 0 ? <p>未手动选择引用时，会默认使用检索结果前三条。</p> : null}
        </div>
        {activePromptPack ? (
          <div className="prompt-pack edit-stack">
            <strong>{activePromptPack.name}</strong>
            <label><span>品牌口吻</span><textarea value={promptPackDraft.brandVoice} onChange={(event) => setPromptPackDraft((current) => ({ ...current, brandVoice: event.target.value }))} /></label>
            <label><span>视觉风格</span><textarea value={promptPackDraft.visualStyle} onChange={(event) => setPromptPackDraft((current) => ({ ...current, visualStyle: event.target.value }))} /></label>
            <button className="primary small" onClick={onSavePromptPackDraft}>保存提示词包</button>
          </div>
        ) : <div className="empty-state">先生成品牌 / 产品提示词包。</div>}
        {activeEditableScene ? (
          <div className="prompt-pack edit-stack">
            <strong>编辑场景卡</strong>
            <label><span>场景标题</span><input value={sceneCardDraft.title} onChange={(event) => setSceneCardDraft((current) => ({ ...current, title: event.target.value }))} /></label>
            <label><span>图片素材建议</span><textarea value={sceneCardDraft.imageMaterialSuggestion} onChange={(event) => setSceneCardDraft((current) => ({ ...current, imageMaterialSuggestion: event.target.value }))} /></label>
            <label><span>视频素材建议</span><textarea value={sceneCardDraft.videoMaterialSuggestion} onChange={(event) => setSceneCardDraft((current) => ({ ...current, videoMaterialSuggestion: event.target.value }))} /></label>
            <button className="primary small" onClick={onSaveSceneCardDraft}>保存场景卡</button>
          </div>
        ) : null}
      </article>
    </section>
  );
}
