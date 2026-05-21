import type {
  BrandKnowledgeBaseRecord,
  KnowledgeBaseView,
  KnowledgeCitation,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { clip, knowledgeBaseKey, sectionLabel } from '../../app/formatters';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { SelectableRecordCard, StatusPill } from '../WorkbenchPrimitives';

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
  const activeSourceLabel = activeKnowledgeBase ? `${activeKnowledgeBase.title} · ${knowledgeBaseKey(activeKnowledgeBase)}` : '当前未选知识库';

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
            <button className="primary small" disabled={!workspaceReady || busy || citationCount === 0} onClick={onGenerateBrandKnowledgeBase}>
              {feature.primaryAction}
            </button>
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={onOpenKnowledgeScenes}>
              {feature.secondaryAction}
            </button>
          </div>
        )}
      />

      <div className="prompt-workbench-layout">
        <section className="panel prompt-source-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">来源</p>
              <h3>当前知识库</h3>
            </div>
          </div>
          <p>{activeSourceLabel}</p>
          <div className="workflow-run-steps">
            {selectedCitations.map((citation) => (
              <span key={`${citation.knowledgeBaseId}:${citation.sectionId}`}>
                {sectionLabel(citation.sectionType)} · {citation.title}
              </span>
            ))}
            {selectedCitations.length === 0 && citationCount > 0 ? (
              <span className="ready">将使用当前成型知识库 / 输入源的默认引用 {citationCount} 条</span>
            ) : null}
          </div>
          <button className="ghost small" disabled={!workspaceReady || busy} onClick={onOpenInputSources}>补充输入源</button>
        </section>

        <section className="panel prompt-editor-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">品牌知识库</p>
              <h3>{activeBrandKnowledgeBase?.title ?? '尚未生成品牌知识库'}</h3>
            </div>
            {activeBrandKnowledgeBase ? <StatusPill tone="ready">{activeBrandKnowledgeBase.status}</StatusPill> : null}
          </div>
          {activeBrandKnowledgeBase ? (
            <div className="brand-kb-detail">
              <label><span>品牌口吻</span><textarea readOnly value={activeBrandKnowledgeBase.brandVoice} /></label>
              <label><span>受众</span><textarea readOnly value={activeBrandKnowledgeBase.audience} /></label>
              <label><span>产品事实</span><textarea readOnly value={activeBrandKnowledgeBase.productFacts.join('\n')} /></label>
              <label><span>核心卖点</span><textarea readOnly value={activeBrandKnowledgeBase.coreSellingPoints.join('\n')} /></label>
              <label><span>合规边界</span><textarea readOnly value={activeBrandKnowledgeBase.complianceBoundaries.join('\n')} /></label>
              <label><span>场景种子</span><textarea readOnly value={activeBrandKnowledgeBase.sceneSeeds.join('\n')} /></label>
              <label><span>Prompt 片段</span><textarea readOnly value={activeBrandKnowledgeBase.promptFragments.join('\n')} /></label>
            </div>
          ) : (
            <div className="empty-state">选择知识引用后，生成品牌 / 产品知识库记录。</div>
          )}
        </section>

        <aside className="panel prompt-draft-list-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">记录</p>
              <h3>品牌知识库版本</h3>
            </div>
          </div>
          <div className="prompt-draft-list">
            {brandKnowledgeBases.map((record) => (
              <SelectableRecordCard
                key={record.id}
                className="prompt-draft-card"
                active={record.id === activeBrandKnowledgeBaseId}
                status={record.status}
                statusTone={record.status === 'ready' ? 'ready' : 'idle'}
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
      </div>
    </section>
  );
}
