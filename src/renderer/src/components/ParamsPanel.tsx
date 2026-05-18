import type { GlobalGenerationParams, KnowledgeCitation, SkillSelectionView } from '../../../shared/types';
import { sectionLabel, skillKey } from '../app/formatters';
import type { SetGlobalParams } from '../app/types';

interface ParamsPanelProps {
  params: GlobalGenerationParams;
  citations: KnowledgeCitation[];
  skillSelection: SkillSelectionView | null;
  onOpenModelSettings: () => void;
  setParams: SetGlobalParams;
}

export function ParamsPanel({ params, citations, skillSelection, onOpenModelSettings, setParams }: ParamsPanelProps) {
  return (
    <aside className="params-panel">
      <section className="panel compact">
        <div className="panel-title"><div><p className="eyebrow">Global Params</p><h3>全局参数</h3></div><button className="ghost small" onClick={onOpenModelSettings}>设置</button></div>
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
          {citations.map((citation) => <article key={`${citation.knowledgeBaseId}:${citation.sectionId}`}><strong>{sectionLabel(citation.sectionType)}</strong><p>{citation.excerpt}</p></article>)}
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
  );
}
