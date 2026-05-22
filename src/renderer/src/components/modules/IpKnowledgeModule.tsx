import type {
  InputSourceRecord,
  IpKnowledgeBaseRecord,
  KnowledgeBaseView,
  KnowledgeCitation,
  PromptDraft,
} from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { clip, knowledgeBaseKey, sectionLabel } from '../../app/formatters';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { UserJourneyGuide } from '../UserJourneyGuide';
import { SelectableRecordCard, StatusPill } from '../WorkbenchPrimitives';

interface IpKnowledgeModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  activeKnowledgeBase?: KnowledgeBaseView;
  selectedCitations: KnowledgeCitation[];
  citationCount: number;
  inputSources: InputSourceRecord[];
  ipKnowledgeBases: IpKnowledgeBaseRecord[];
  promptDrafts: PromptDraft[];
  activeIpKnowledgeBase?: IpKnowledgeBaseRecord;
  activeIpKnowledgeBaseId: string;
  setActiveIpKnowledgeBaseId: (recordId: string) => void;
  onGenerateIpKnowledgeBase: () => void;
  onCreateScenarioPrompt: (scene: string) => void;
  onOpenPromptDraft: (draftId: string) => void;
  onOpenKnowledgeScenes: () => void;
  onOpenPromptWorkbench: () => void;
}

const IP_LAYER_LABELS: Record<string, string> = {
  identity: '身份锚定层',
  values: '价值观与立场层',
  language: '声音与语言质感层',
  methodology: '判断力与决策逻辑层',
  materials: '内容素材库层',
  engine: '内容创作引擎层',
};

function shortId(value?: string): string {
  if (!value) return '';
  return value.length > 12 ? value.slice(0, 8) : value;
}

function sceneUsageLabel(scene: string): string {
  if (/口播|视频|抖音|视频号/.test(scene)) return '口播脚本';
  if (/朋友圈|私域|社群|回复/.test(scene)) return '私域内容';
  if (/产品|付费|转化|销售/.test(scene)) return '产品化转化';
  if (/咨询|问答|回复/.test(scene)) return '咨询回复';
  return '内容场景';
}

function draftStatusLabel(draft?: PromptDraft): string {
  if (!draft) return '未生成';
  if (draft.status === 'confirmed') return '已确认';
  if (draft.status === 'materialized') return '已沉淀';
  if (draft.status === 'archived') return '已归档';
  return '草稿';
}

function draftStatusTone(draft?: PromptDraft): 'ready' | 'idle' | 'blocked' {
  if (!draft) return 'idle';
  if (draft.status === 'confirmed' || draft.status === 'materialized') return 'ready';
  if (draft.status === 'archived') return 'blocked';
  return 'idle';
}

function sourceMatchesScene(source: InputSourceRecord, record: IpKnowledgeBaseRecord, scene: string): boolean {
  return source.purpose === 'ip-scenario-kb'
    && source.tags.includes(record.id)
    && (
      source.tags.includes(scene) ||
      source.title.includes(scene) ||
      source.summary?.includes(scene) ||
      false
    );
}

function draftMatchesScene(draft: PromptDraft, record: IpKnowledgeBaseRecord, scene: string, source?: InputSourceRecord): boolean {
  if (source && draft.inputSourceIds.includes(source.id)) return true;
  return draft.title.startsWith(`${record.title} / ${scene}`)
    || (draft.userIntent.includes(record.title) && draft.userIntent.includes(scene));
}

export function IpKnowledgeModule({
  workspaceReady,
  busy,
  activeKnowledgeBase,
  selectedCitations,
  citationCount,
  inputSources,
  ipKnowledgeBases,
  promptDrafts,
  activeIpKnowledgeBase,
  activeIpKnowledgeBaseId,
  setActiveIpKnowledgeBaseId,
  onGenerateIpKnowledgeBase,
  onCreateScenarioPrompt,
  onOpenPromptDraft,
  onOpenKnowledgeScenes,
  onOpenPromptWorkbench,
}: IpKnowledgeModuleProps) {
  const feature = V2_FEATURES['knowledge-ip'];
  const activeSourceLabel = activeKnowledgeBase ? `${activeKnowledgeBase.title} · ${knowledgeBaseKey(activeKnowledgeBase)}` : '当前未选知识库';
  const hasSource = citationCount > 0;
  const hasIpKnowledge = Boolean(activeIpKnowledgeBase);
  const hasMissingLayers = Boolean(activeIpKnowledgeBase?.missingLayers.length);
  const scenarioExtensions = activeIpKnowledgeBase
    ? activeIpKnowledgeBase.extensionScenes.map((scene) => {
      const source = inputSources.find((item) => sourceMatchesScene(item, activeIpKnowledgeBase, scene));
      const draft = promptDrafts.find((item) => draftMatchesScene(item, activeIpKnowledgeBase, scene, source));
      return { scene, source, draft };
    })
    : [];
  const generatedScenarioCount = scenarioExtensions.filter((item) => item.source || item.draft).length;
  const extensionDrafts = activeIpKnowledgeBase
    ? promptDrafts
      .filter((draft) =>
        draft.title.startsWith(`${activeIpKnowledgeBase.title} /`) ||
        draft.userIntent.includes(activeIpKnowledgeBase.title),
      )
      .slice(0, 8)
    : [];

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

      <UserJourneyGuide
        title="个人 IP 六层知识库"
        description="IP 主理人和运营需要的是同一套人设、观点、语言和素材底座，而不是一次性生成几段文案。先构建六层，再延伸到口播、私域、产品化和咨询回复。"
        steps={[
          {
            key: 'materials',
            title: '导入 IP 原始素材',
            description: '访谈稿、课程大纲、工作坊记录、旧文案和产品资料都可以进入。',
            state: hasSource ? 'done' : 'active',
          },
          {
            key: 'layers',
            title: '构建六层知识库',
            description: '身份、价值观、语言、判断方法、内容素材和创作引擎分层保存。',
            state: hasIpKnowledge ? 'done' : hasSource ? 'active' : 'blocked',
          },
          {
            key: 'gaps',
            title: '补齐缺口',
            description: '缺失层级必须标出来，让用户补材料，不靠模型编故事。',
            state: hasIpKnowledge ? (hasMissingLayers ? 'active' : 'done') : 'next',
          },
          {
            key: 'extend',
            title: '生成场景延伸',
            description: '口播、朋友圈、私域、产品化和咨询回复都引用同一 IP 版本。',
            state: hasIpKnowledge ? (generatedScenarioCount ? 'done' : 'next') : 'idle',
          },
        ]}
        actions={[
          { label: '构建 IP 知识库', primary: true, onClick: onGenerateIpKnowledgeBase, disabled: !workspaceReady || busy || !hasSource },
          { label: '生成场景延伸库', onClick: onOpenKnowledgeScenes, disabled: !workspaceReady || busy },
          { label: generatedScenarioCount ? '查看场景延伸库' : '进入 Prompt 工作台', onClick: onOpenPromptWorkbench, disabled: !workspaceReady || busy },
        ]}
        aside={activeIpKnowledgeBase ? <StatusPill tone="ready">完整度 {activeIpKnowledgeBase.completeness}%</StatusPill> : null}
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
                  <span>{IP_LAYER_LABELS[key] ?? key}</span>
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
                    生成{scene}延伸库
                  </button>
                ))}
              </div>
              <div className="ip-scenario-library-panel">
                <div className="panel-title compact">
                  <div>
                    <p className="eyebrow">场景延伸库</p>
                    <h4>IP 运营场景库</h4>
                  </div>
                  <StatusPill tone={generatedScenarioCount ? 'ready' : 'idle'}>
                    {generatedScenarioCount}/{scenarioExtensions.length} 已生成
                  </StatusPill>
                </div>
                <div className="ip-scenario-library-grid">
                  {scenarioExtensions.map(({ scene, source, draft }) => (
                    <article key={scene} className={`ip-scenario-card ${source || draft ? 'ready' : 'idle'}`}>
                      <div className="ip-scenario-card-head">
                        <div>
                          <span>{sceneUsageLabel(scene)}</span>
                          <strong>{scene}</strong>
                        </div>
                        <StatusPill tone={draftStatusTone(draft)}>{draftStatusLabel(draft)}</StatusPill>
                      </div>
                      <p>{source?.summary ?? `基于「${activeIpKnowledgeBase.title}」六层知识库延伸，不允许改写成人设漂移。`}</p>
                      <div className="ip-scenario-lineage">
                        <span>IP 版本 {shortId(activeIpKnowledgeBase.id)}</span>
                        <span>{source ? '延伸知识库已生成' : '待生成延伸知识库'}</span>
                        <span>{draft ? `提示词 ${draft.versions.length} 个版本` : '待生成提示词'}</span>
                      </div>
                      <div className="ip-scenario-actions">
                        <button
                          className={draft ? 'ghost small' : 'primary small'}
                          disabled={!workspaceReady || busy}
                          onClick={() => onCreateScenarioPrompt(scene)}
                        >
                          {draft ? '重新生成' : '生成延伸库'}
                        </button>
                        {draft ? (
                          <button className="primary small" onClick={() => onOpenPromptDraft(draft.id)}>
                            打开提示词
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                  {scenarioExtensions.length === 0 ? (
                    <div className="empty-state">当前 IP 知识库没有可延伸场景。请先补充 IP 运营场景。</div>
                  ) : null}
                </div>
              </div>
              <div className="ip-extension-draft-panel">
                <div className="panel-title compact">
                  <div>
                    <p className="eyebrow">场景延伸结果</p>
                    <h4>已生成的 IP 场景提示词</h4>
                  </div>
                  <StatusPill tone={extensionDrafts.length ? 'ready' : 'idle'}>{extensionDrafts.length} 个</StatusPill>
                </div>
                <div className="ip-extension-draft-list">
                  {extensionDrafts.map((draft) => (
                    <button
                      key={draft.id}
                      type="button"
                      className="record-card prompt-draft-card"
                      onClick={() => onOpenPromptDraft(draft.id)}
                    >
                      <StatusPill tone={draft.status === 'confirmed' || draft.status === 'materialized' ? 'ready' : 'idle'}>
                        {draft.status === 'confirmed' ? '已确认' : draft.status === 'materialized' ? '已沉淀' : '草稿'}
                      </StatusPill>
                      <strong>{draft.title}</strong>
                      <small>
                        {draft.purpose} · {draft.versions.length} 个版本
                        {draft.workflowRunId ? ` · 关联任务 ${shortId(draft.workflowRunId)}` : ''}
                      </small>
                    </button>
                  ))}
                  {extensionDrafts.length === 0 ? (
                    <div className="empty-state">还没有场景延伸提示词。先点击上方口播、私域、产品化等场景按钮生成。</div>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="empty-state">选择知识引用后，生成 IP 六层知识库记录。</div>
          )}
        </section>

        <aside className="panel prompt-draft-list-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">版本</p>
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
