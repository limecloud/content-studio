import type {
  BrandKnowledgeBaseRecord,
  KnowledgeBaseView,
  KnowledgeCitation,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { baseLabel, clip, sectionLabel } from '../../app/formatters';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { ActionGroup, SelectableRecordCard, StatusPill } from '../WorkbenchPrimitives';

interface BrandKnowledgeModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  activeKnowledgeBase?: KnowledgeBaseView;
  selectedCitations: KnowledgeCitation[];
  citationCount: number;
  brandKnowledgeBases: BrandKnowledgeBaseRecord[];
  activeBrandKnowledgeBase?: BrandKnowledgeBaseRecord;
  activeBrandKnowledgeBaseId: string;
  setActiveBrandKnowledgeBaseId: (recordId: string) => void;
  onGenerateBrandKnowledgeBase: () => void;
  onOpenKnowledgeScenes: () => void;
  onOpenInputSources: () => void;
}

export function BrandKnowledgeModule({
  workspaceReady,
  busy,
  activeKnowledgeBase,
  selectedCitations,
  citationCount,
  brandKnowledgeBases,
  activeBrandKnowledgeBase,
  activeBrandKnowledgeBaseId,
  setActiveBrandKnowledgeBaseId,
  onGenerateBrandKnowledgeBase,
  onOpenKnowledgeScenes,
  onOpenInputSources,
}: BrandKnowledgeModuleProps) {
  const feature = V2_FEATURES['knowledge-brand'];
  const activeSourceLabel = activeKnowledgeBase ? `${activeKnowledgeBase.title} · ${baseLabel(activeKnowledgeBase.baseType)}` : '当前未选知识库';
  const hasSource = citationCount > 0;
  const hasBrandKnowledge = activeBrandKnowledgeBase?.status === 'ready';

  const agentContext = (
    <div className="knowledge-agent-context-grid">
      <article>
        <span>当前输入</span>
        <strong>{activeSourceLabel}</strong>
        <small>{hasSource ? `${citationCount} 条来源可用于抽取` : '没有可用来源，系统不会编造品牌事实'}</small>
      </article>
      <article>
        <span>业务对象</span>
        <strong>{activeBrandKnowledgeBase?.title ?? '品牌 / 产品知识库'}</strong>
        <small>{hasBrandKnowledge ? '已形成可审核的知识库版本' : '等待从真实资料中抽取'}</small>
      </article>
      <article>
        <span>交付去向</span>
        <strong>{'场景库 -> Prompt 组'}</strong>
        <small>不从知识库直接跳图片生成，先沉淀可复用场景</small>
      </article>
    </div>
  );

  const sourceArtifact = (
    <section className="panel prompt-source-panel knowledge-agent-source">
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">来源</p>
          <h4>资料追溯</h4>
        </div>
        <StatusPill tone={hasSource ? 'ready' : 'blocked'}>{hasSource ? `${citationCount} 条` : '待补'}</StatusPill>
      </div>
      <div className="workflow-run-steps">
        {selectedCitations.map((citation) => (
          <span key={`${citation.knowledgeBaseId}:${citation.sectionId}`}>
            {sectionLabel(citation.sectionType)} · {citation.title}
          </span>
        ))}
        {selectedCitations.length === 0 && citationCount > 0 ? (
          <span className="ready">将使用当前成型知识库 / 输入源的默认引用 {citationCount} 条</span>
        ) : null}
        {!hasSource ? <span className="blocked">请先补充品牌资料或产品输入源</span> : null}
      </div>
    </section>
  );

  const brandArtifact = (
    <section className="panel prompt-editor-panel knowledge-agent-main">
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">产物</p>
          <h4>{activeBrandKnowledgeBase?.title ?? '尚未生成品牌知识库'}</h4>
        </div>
        {activeBrandKnowledgeBase ? <StatusPill tone="ready">已抽取</StatusPill> : <StatusPill tone="idle">待抽取</StatusPill>}
      </div>
      {activeBrandKnowledgeBase ? (
        <div className="brand-kb-detail">
          <label><span>品牌口吻</span><textarea readOnly value={activeBrandKnowledgeBase.brandVoice} /></label>
          <label><span>受众</span><textarea readOnly value={activeBrandKnowledgeBase.audience} /></label>
          <label><span>产品事实</span><textarea readOnly value={activeBrandKnowledgeBase.productFacts.join('\n')} /></label>
          <label><span>核心卖点</span><textarea readOnly value={activeBrandKnowledgeBase.coreSellingPoints.join('\n')} /></label>
          <label><span>合规边界</span><textarea readOnly value={activeBrandKnowledgeBase.complianceBoundaries.join('\n')} /></label>
          <label><span>场景种子</span><textarea readOnly value={activeBrandKnowledgeBase.sceneSeeds.join('\n')} /></label>
          <label><span>提示词片段</span><textarea readOnly value={activeBrandKnowledgeBase.promptFragments.join('\n')} /></label>
        </div>
      ) : (
        <div className="empty-state">选择知识引用后，点击下方主动作生成品牌 / 产品知识库记录。</div>
      )}
    </section>
  );

  const versionArtifact = (
    <aside className="panel prompt-draft-list-panel knowledge-agent-versions">
      <div className="panel-title compact">
        <div>
          <p className="eyebrow">版本</p>
          <h4>品牌知识库版本</h4>
        </div>
      </div>
      <div className="prompt-draft-list">
        {brandKnowledgeBases.map((record) => (
          <SelectableRecordCard
            key={record.id}
            className="prompt-draft-card"
            active={record.id === activeBrandKnowledgeBaseId}
            status={record.status === 'ready' ? '已抽取' : record.status === 'blocked' ? '待配置' : '待确认'}
            statusTone={record.status === 'ready' ? 'ready' : record.status === 'blocked' ? 'blocked' : 'idle'}
            title={record.title}
            meta={record.brandVoice}
            onClick={() => setActiveBrandKnowledgeBaseId(record.id)}
          >
            <small>{clip(record.sceneSeeds.join(' / '), 90)}</small>
          </SelectableRecordCard>
        ))}
        {brandKnowledgeBases.length === 0 ? <div className="empty-state">暂无品牌知识库记录。</div> : null}
      </div>
    </aside>
  );
  return (
    <section className="knowledge-brand-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="compact"
        actions={(
          <div className="v2-feature-actions">
            <StatusPill tone={brandKnowledgeBases.length ? 'ready' : 'idle'}>{brandKnowledgeBases.length} 条记录</StatusPill>
            <StatusPill tone={hasSource ? 'ready' : 'blocked'}>{hasSource ? '来源可用' : '缺少来源'}</StatusPill>
          </div>
        )}
      />

      <div className="panel knowledge-agent-panel">
        <div className="panel-title compact">
          <div>
            <p className="eyebrow">品牌知识库</p>
            <h4>{activeBrandKnowledgeBase?.title ?? '等待抽取品牌 / 产品知识库'}</h4>
          </div>
          <StatusPill tone={hasBrandKnowledge ? 'ready' : hasSource ? 'idle' : 'blocked'}>
            {hasBrandKnowledge ? '已抽取' : hasSource ? '待抽取' : '缺少来源'}
          </StatusPill>
        </div>
        {agentContext}
        <div className="workflow-run-steps">
          <span className={hasSource ? 'ready' : 'active'}>{hasSource ? `已选 ${citationCount} 条可追溯来源` : '先补充产品资料、评论或知识库章节'}</span>
          <span className={hasBrandKnowledge ? 'ready' : hasSource ? 'active' : 'blocked'}>抽取品牌口吻、受众、卖点和合规边界</span>
          <span className={hasBrandKnowledge ? 'active' : 'idle'}>确认知识库后生成可生产的场景卡</span>
        </div>
        <div className="knowledge-agent-artifact">
          {sourceArtifact}
          {brandArtifact}
          {versionArtifact}
        </div>
        <ActionGroup align="left" className="knowledge-agent-actions">
          <button className="ghost small" disabled={!workspaceReady || busy} onClick={onOpenInputSources}>补充输入源</button>
          <button className={hasBrandKnowledge ? 'ghost small' : 'primary small'} disabled={!workspaceReady || busy || !hasSource} onClick={onGenerateBrandKnowledgeBase}>
            抽取品牌知识库
          </button>
          <button className={hasBrandKnowledge ? 'primary small' : 'ghost small'} disabled={!workspaceReady || busy || !hasBrandKnowledge} onClick={onOpenKnowledgeScenes}>
            生成场景库
          </button>
        </ActionGroup>
        {!hasSource ? (
          <div className="empty-state">补充输入源后，将基于来源抽取品牌事实和合规边界。</div>
        ) : null}
      </div>
    </section>
  );
}
