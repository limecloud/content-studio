import type {
  BrandKnowledgeBaseRecord,
  KnowledgeBaseView,
  KnowledgeCitation,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { clip, knowledgeBaseKey, sectionLabel } from '../../app/formatters';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { UserJourneyGuide } from '../UserJourneyGuide';
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
  const hasSource = citationCount > 0;
  const hasBrandKnowledge = Boolean(activeBrandKnowledgeBase);

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

      <UserJourneyGuide
        title="品牌 / 产品资料先变成场景库"
        description="品牌运营和短视频运营不应该从知识库直接跳到提示词。先抽取产品事实、卖点、人群和合规边界，再生成可生产的场景卡。"
        steps={[
          {
            key: 'source',
            title: '选择品牌资料',
            description: 'DOCX、Markdown、产品资料或已转换输入源都可以作为来源。',
            state: hasSource ? 'done' : 'active',
          },
          {
            key: 'extract',
            title: '抽取品牌事实',
            description: '确认口吻、受众、产品事实、核心卖点和合规边界。',
            state: hasBrandKnowledge ? 'done' : hasSource ? 'active' : 'blocked',
          },
          {
            key: 'scene',
            title: '生成场景库',
            description: '把事实拆成具体人群、问题、空间、动作、情绪和镜头。',
            state: hasBrandKnowledge ? 'active' : 'next',
          },
          {
            key: 'prompt',
            title: '生产提示词组',
            description: '场景确认后再生成图片、图生视频、文案和绿幕图提示词。',
            state: 'next',
          },
        ]}
        actions={[
          { label: '补充输入源', onClick: onOpenInputSources, disabled: !workspaceReady || busy },
          { label: '抽取品牌知识库', primary: true, onClick: onGenerateBrandKnowledgeBase, disabled: !workspaceReady || busy || !hasSource },
          { label: '生成场景库', onClick: onOpenKnowledgeScenes, disabled: !workspaceReady || busy },
        ]}
        aside={<StatusPill tone={hasBrandKnowledge ? 'ready' : 'idle'}>{hasBrandKnowledge ? '已抽取' : '待抽取'}</StatusPill>}
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
              <label><span>提示词片段</span><textarea readOnly value={activeBrandKnowledgeBase.promptFragments.join('\n')} /></label>
            </div>
          ) : (
            <div className="empty-state">选择知识引用后，生成品牌 / 产品知识库记录。</div>
          )}
        </section>

        <aside className="panel prompt-draft-list-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">版本</p>
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
