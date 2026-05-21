import type {
  IpKnowledgeBaseRecord,
  KnowledgeBaseView,
  KnowledgeCitation,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { clip, knowledgeBaseKey, sectionLabel } from '../../app/formatters';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { SelectableRecordCard, StatusPill } from '../WorkbenchPrimitives';

interface IpKnowledgeModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  activeKnowledgeBase?: KnowledgeBaseView;
  selectedCitations: KnowledgeCitation[];
  citationCount: number;
  ipKnowledgeBases: IpKnowledgeBaseRecord[];
  activeIpKnowledgeBase?: IpKnowledgeBaseRecord;
  activeIpKnowledgeBaseId: string;
  setActiveIpKnowledgeBaseId: (recordId: string) => void;
  onGenerateIpKnowledgeBase: () => void;
  onCreateScenarioPrompt: (scene: string) => void;
  onOpenKnowledgeScenes: () => void;
  onOpenPromptWorkbench: () => void;
}

export function IpKnowledgeModule({
  workspaceReady,
  busy,
  activeKnowledgeBase,
  selectedCitations,
  citationCount,
  ipKnowledgeBases,
  activeIpKnowledgeBase,
  activeIpKnowledgeBaseId,
  setActiveIpKnowledgeBaseId,
  onGenerateIpKnowledgeBase,
  onCreateScenarioPrompt,
  onOpenKnowledgeScenes,
  onOpenPromptWorkbench,
}: IpKnowledgeModuleProps) {
  const feature = V2_FEATURES['knowledge-ip'];
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
            <StatusPill tone={ipKnowledgeBases.length ? 'ready' : 'idle'}>{ipKnowledgeBases.length} 条记录</StatusPill>
            <button className="primary small" disabled={!workspaceReady || busy || citationCount === 0} onClick={onGenerateIpKnowledgeBase}>
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
          <button className="ghost small" disabled={!workspaceReady || busy} onClick={onOpenPromptWorkbench}>回到 Prompt 工作台</button>
        </section>

        <section className="panel prompt-editor-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">IP 知识库</p>
              <h3>{activeIpKnowledgeBase?.title ?? '尚未生成 IP 知识库'}</h3>
            </div>
            {activeIpKnowledgeBase ? (
              <StatusPill tone="ready">{activeIpKnowledgeBase.status} · {activeIpKnowledgeBase.completeness}%</StatusPill>
            ) : null}
          </div>
          {activeIpKnowledgeBase ? (
            <div className="brand-kb-detail">
              {Object.entries(activeIpKnowledgeBase.layers).map(([key, value]) => (
                <label key={key}>
                  <span>{key}</span>
                  <textarea readOnly value={value} />
                </label>
              ))}
              <label><span>缺口</span><textarea readOnly value={activeIpKnowledgeBase.missingLayers.join('\n') || '无'} /></label>
              <label><span>场景延伸</span><textarea readOnly value={activeIpKnowledgeBase.extensionScenes.join('\n')} /></label>
              <div className="workflow-run-artifact-actions">
                {activeIpKnowledgeBase.extensionScenes.map((scene) => (
                  <button
                    key={scene}
                    className="primary small"
                    disabled={!workspaceReady || busy}
                    onClick={() => onCreateScenarioPrompt(scene)}
                  >
                    生成{scene} Prompt
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state">选择知识引用后，生成 IP 六层知识库记录。</div>
          )}
        </section>

        <aside className="panel prompt-draft-list-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">记录</p>
              <h3>IP 知识库版本</h3>
            </div>
          </div>
          <div className="prompt-draft-list">
            {ipKnowledgeBases.map((record) => (
              <SelectableRecordCard
                key={record.id}
                className="prompt-draft-card"
                active={record.id === activeIpKnowledgeBaseId}
                status={record.status}
                statusTone={record.status === 'ready' ? 'ready' : 'idle'}
                title={record.title}
                meta={`完整度 ${record.completeness}%`}
                onClick={() => setActiveIpKnowledgeBaseId(record.id)}
              >
                <small>{clip(record.extensionScenes.join(' / '), 90)}</small>
              </SelectableRecordCard>
            ))}
            {ipKnowledgeBases.length === 0 ? <div className="empty-state">暂无 IP 知识库记录。</div> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
