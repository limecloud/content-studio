import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type { PromptDraft, PromptDraftPurpose, PromptPack, SceneCard } from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface ScenePromptModuleProps {
  module: 'knowledge-scenes' | 'image-scene-prompts';
  workspaceReady: boolean;
  busy: boolean;
  sceneCards: SceneCard[];
  promptDrafts: PromptDraft[];
  activePromptPack?: PromptPack;
  citationCount: number;
  selectedSceneIds: string[];
  onSelectSceneIds: (sceneIds: string[]) => void;
  onGenerateSceneCards: () => void;
  onGenerateScenePromptDraft: (input: {
    sceneCardIds: string[];
    purpose: PromptDraftPurpose;
    userIntent: string;
  }) => void;
  onUsePromptInImage: (prompt: string, sceneCardIds?: string[]) => void;
  onSelectModule: (module: ModuleKey) => void;
}

const PURPOSE_OPTIONS: Array<{ value: PromptDraftPurpose; label: string; result: string }> = [
  { value: 'image', label: '图片', result: '10 组 UGC 图片 Prompt' },
  { value: 'video', label: '视频', result: '6 组 15 秒视频 Prompt' },
  { value: 'article', label: '文案', result: '5 组文案 Prompt' },
  { value: 'green-screen', label: '绿幕图', result: '8 组绿幕文案图 Prompt' },
];

function activeContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function isScenePromptDraft(draft: PromptDraft, sceneIds: string[], purpose: PromptDraftPurpose): boolean {
  if (draft.purpose !== purpose) return false;
  if (sceneIds.length === 0) return draft.userIntent.includes('基于已确认场景卡生成下游 Prompt');
  if (draft.sceneCardIds?.length) return draft.sceneCardIds.some((id) => sceneIds.includes(id));
  return draft.userIntent.includes('基于已确认场景卡生成下游 Prompt');
}

function statusText(draft?: PromptDraft): string {
  if (!draft) return '待生成';
  if (draft.status === 'confirmed') return '已确认';
  if (draft.status === 'materialized') return '已物化';
  if (draft.status === 'archived') return '归档';
  return '草稿';
}

function statusClass(draft?: PromptDraft): string {
  if (!draft) return 'idle';
  if (draft.status === 'confirmed' || draft.status === 'materialized') return 'ready';
  if (draft.status === 'archived') return 'blocked';
  return 'idle';
}

function shortId(value?: string): string {
  if (!value) return '';
  return value.length > 12 ? value.slice(0, 8) : value;
}

function splitPromptItems(content: string): Array<{ title: string; content: string }> {
  const trimmed = content.trim();
  if (!trimmed) return [];
  const chunks = trimmed
    .split(/\n(?=### )/g)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.startsWith('### '));
  if (!chunks.length) return [{ title: '完整 Prompt', content: trimmed }];
  return chunks.map((chunk, index) => {
    const [firstLine] = chunk.split('\n');
    return {
      title: firstLine?.replace(/^###\s*/, '').trim() || `Prompt ${index + 1}`,
      content: chunk,
    };
  });
}

function purposeResult(purpose: PromptDraftPurpose): string {
  return PURPOSE_OPTIONS.find((option) => option.value === purpose)?.result ?? 'Prompt 组';
}

function formatTime(value?: string): string {
  return value ? new Date(value).toLocaleString() : '未记录';
}

export function ScenePromptModule({
  module,
  workspaceReady,
  busy,
  sceneCards,
  promptDrafts,
  activePromptPack,
  citationCount,
  selectedSceneIds,
  onSelectSceneIds,
  onGenerateSceneCards,
  onGenerateScenePromptDraft,
  onUsePromptInImage,
  onSelectModule,
}: ScenePromptModuleProps) {
  const feature = V2_FEATURES[module];
  const [purpose, setPurpose] = useState<PromptDraftPurpose>(module === 'image-scene-prompts' ? 'image' : 'video');
  const [userIntent, setUserIntent] = useState(
    '基于场景卡生成能直接下游使用的真实内容素材 Prompt，画面要自然、可信、可追溯，不编造知识库外卖点。',
  );
  const [selectedPromptIndex, setSelectedPromptIndex] = useState(0);
  const effectiveSceneIds = selectedSceneIds.length
    ? selectedSceneIds
    : sceneCards.slice(0, 2).map((scene) => scene.id);
  const selectedScenes = useMemo(
    () => sceneCards.filter((scene) => effectiveSceneIds.includes(scene.id)),
    [effectiveSceneIds, sceneCards],
  );
  const relatedDrafts = useMemo(
    () => promptDrafts.filter((draft) => isScenePromptDraft(draft, effectiveSceneIds, purpose)),
    [effectiveSceneIds, promptDrafts, purpose],
  );
  const activeDraft =
    relatedDrafts[0] ??
    promptDrafts.find((draft) => draft.purpose === purpose && draft.userIntent.includes('基于已确认场景卡'));
  const activePrompt = activeContent(activeDraft);
  const promptItems = useMemo(() => splitPromptItems(activePrompt), [activePrompt]);
  const selectedPrompt = promptItems[Math.min(selectedPromptIndex, Math.max(promptItems.length - 1, 0))];
  const canGenerateScenes = workspaceReady && !busy && (Boolean(activePromptPack) || citationCount > 0);
  const canGeneratePrompt = workspaceReady && !busy && selectedScenes.length > 0 && userIntent.trim().length > 0;

  useEffect(() => {
    if (selectedSceneIds.length || sceneCards.length === 0) return;
    onSelectSceneIds(sceneCards.slice(0, 2).map((scene) => scene.id));
  }, [onSelectSceneIds, sceneCards, selectedSceneIds.length]);

  useEffect(() => {
    setSelectedPromptIndex(0);
  }, [activeDraft?.id, purpose]);

  return (
    <section className="scene-prompt-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="flow"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{sceneCards.length} 张场景卡</span>
            <span className={`status-pill ${activePromptPack ? 'ready' : 'blocked'}`}>
              {activePromptPack ? '提示词包已连接' : citationCount > 0 ? '可自动生成提示词包' : '先导入知识'}
            </span>
            <span className={`status-pill ${statusClass(activeDraft)}`}>{statusText(activeDraft)}</span>
          </div>
        )}
      >
        <div className="module-command-flow">
          <div>
            <p className="eyebrow">主链路</p>
            <h3>品牌 / 产品知识库 → 场景库 → Prompt 组 → 图片 / 视频素材</h3>
          </div>
          <div className="workflow-actions">
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge')}>
              回到知识库
            </button>
            <button className="ghost small" disabled={!canGenerateScenes} onClick={onGenerateSceneCards}>
              生成场景卡
            </button>
          </div>
        </div>
        <div className="v2-flow-steps module-command-steps">
          {feature.flow.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
        {!activePromptPack ? (
          <div className="inline-warning">
            需要知识引用才能生成场景库；当前会优先使用已选引用，其次使用成型知识库或已转换输入源的默认引用，并自动补一份提示词包。
          </div>
        ) : null}
      </ModuleCommandCenter>

      <div className="scene-prompt-layout">
        <aside className="panel scene-prompt-scenes-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">场景库</p>
              <h3>选择本次要生产的场景</h3>
            </div>
            <span className="status-pill">{selectedScenes.length} 已选</span>
          </div>
          <div className="scene-prompt-scene-list">
            {sceneCards.map((scene) => (
              <label key={scene.id} className={`scene-prompt-card ${effectiveSceneIds.includes(scene.id) ? 'active' : ''}`}>
                <input
                  type="checkbox"
                  checked={effectiveSceneIds.includes(scene.id)}
                  onChange={(event) => {
                    onSelectSceneIds(
                      event.target.checked
                        ? [...effectiveSceneIds, scene.id].slice(0, 6)
                        : effectiveSceneIds.filter((id) => id !== scene.id),
                    );
                  }}
                />
                <span>
                  <strong>{scene.title}</strong>
                  <small>{scene.audience} · {scene.usageScene}</small>
                  <small>
                    提示词包 {shortId(scene.promptPackId)}
                    {scene.workflowRunId ? ` · SOP ${shortId(scene.workflowRunId)}` : ''}
                    {scene.inputSourceIds?.length ? ` · 输入源 ${scene.inputSourceIds.length}` : ''}
                    {scene.citations.length ? ` · 引用 ${scene.citations.length}` : ''}
                  </small>
                  <em>{scene.painPoint}</em>
                </span>
              </label>
            ))}
            {sceneCards.length === 0 ? (
              <div className="empty-state">
                还没有场景卡。可直接点击“生成场景卡”，系统会基于当前知识引用自动补提示词包；未配置文字模型时会保留 blocked 状态，不伪造场景。
              </div>
            ) : null}
          </div>
        </aside>

        <main className="panel scene-prompt-builder-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">Prompt 生产</p>
              <h3>{purposeResult(purpose)}</h3>
            </div>
            <span className="status-pill">{promptItems.length} 条</span>
          </div>

          <div className="purpose-tabs" role="tablist" aria-label="下游用途">
            {PURPOSE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={purpose === option.value ? 'active' : ''}
                onClick={() => setPurpose(option.value)}
              >
                <strong>{option.label}</strong>
                <small>{option.result}</small>
              </button>
            ))}
          </div>

          <label className="scene-prompt-intent">
            <span>本次生成意图</span>
            <textarea value={userIntent} onChange={(event) => setUserIntent(event.target.value)} />
          </label>

          <div className="workflow-actions left">
            <button
              className="primary small"
              disabled={!canGeneratePrompt}
              onClick={() => onGenerateScenePromptDraft({ sceneCardIds: effectiveSceneIds, purpose, userIntent })}
            >
              生成{purposeResult(purpose)}
            </button>
            <button
              className="ghost small"
              disabled={!selectedPrompt || purpose !== 'image'}
              onClick={() => selectedPrompt && onUsePromptInImage(selectedPrompt.content, effectiveSceneIds)}
            >
              发送选中 Prompt 到图片生成
            </button>
            <button
              className="ghost small"
              disabled={!activeDraft || purpose !== 'video'}
              onClick={() => onSelectModule('video-prompt')}
            >
              打开视频 Prompt
            </button>
            <button
              className="ghost small"
              disabled={!activeDraft || purpose !== 'green-screen'}
              onClick={() => onSelectModule('image-green-screen')}
            >
              打开绿幕文案图
            </button>
          </div>

          <div className="scene-prompt-result-grid">
            <div className="scene-prompt-item-list">
              {promptItems.map((item, index) => (
                <button
                  key={`${item.title}:${index}`}
                  type="button"
                  className={index === selectedPromptIndex ? 'active' : ''}
                  onClick={() => setSelectedPromptIndex(index)}
                >
                  <strong>{item.title}</strong>
                  <small>{item.content.split('\n').slice(1, 3).join(' / ')}</small>
                </button>
              ))}
              {promptItems.length === 0 ? (
                <div className="empty-state">选择场景卡并生成 Prompt 组后，这里会出现可单条发送或复制的下游 Prompt。</div>
              ) : null}
            </div>
            <div className="scene-prompt-preview">
              <p className="eyebrow">选中 Prompt</p>
              <pre>{selectedPrompt?.content || '暂无可预览 Prompt。'}</pre>
            </div>
          </div>
        </main>

        <aside className="panel scene-prompt-facts-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">下游与追溯</p>
              <h3>不要丢失业务边界</h3>
            </div>
          </div>
          <div className="downstream-action-list">
            <button type="button" disabled={!selectedPrompt} onClick={() => selectedPrompt && onUsePromptInImage(selectedPrompt.content, effectiveSceneIds)}>
              <strong>图片生成</strong>
              <small>把选中图片 Prompt 放入现有图片模块，继续走真实图片 provider / blocked 结果。</small>
            </button>
            <button type="button" disabled={!activeDraft} onClick={() => onSelectModule('video-prompt')}>
              <strong>视频 Prompt</strong>
              <small>复制 15 秒视频 Prompt 到第三方平台，软件只记录复制动作。</small>
            </button>
            <button type="button" disabled={!activeDraft} onClick={() => onSelectModule('video-import')}>
              <strong>成品导入</strong>
              <small>第三方生成后只允许用户手动导入视频文件，并关联原 Prompt。</small>
            </button>
            <button type="button" onClick={() => onSelectModule('assets-prompt-workbench')}>
              <strong>Prompt 工作台</strong>
              <small>继续人工改写、确认版本，或沉淀为 SOP。</small>
            </button>
          </div>
          <div className="scene-prompt-fact-list">
            {selectedScenes.map((scene) => (
              <article key={scene.id}>
                <strong>{scene.title}</strong>
                <span>画面：{scene.visualComposition}</span>
                <span>图片：{scene.imageMaterialSuggestion}</span>
                <span>视频：{scene.videoMaterialSuggestion}</span>
                <span>
                  来源：提示词包 {shortId(scene.promptPackId)}
                  {scene.workflowRunId ? ` · SOP ${shortId(scene.workflowRunId)}` : ''}
                  {scene.inputSourceIds?.length ? ` · 输入源 ${scene.inputSourceIds.length} 个` : ''}
                </span>
              </article>
            ))}
          </div>
        </aside>
      </div>

      <section className="panel scene-prompt-draft-strip">
        <div className="panel-title">
          <div>
            <p className="eyebrow">PromptDraft</p>
            <h3>当前用途的场景草稿</h3>
          </div>
        </div>
        <div className="prompt-version-list">
          {relatedDrafts.map((draft) => (
            <article key={draft.id} className={draft.id === activeDraft?.id ? 'active' : ''}>
              <strong>{draft.title}</strong>
              <span>{draft.purpose} · {draft.versions.length} 个版本 · {statusText(draft)}</span>
              <small>
                来源：{draft.inputSourceIds.length} 个输入源
                {draft.sceneCardIds?.length ? ` · ${draft.sceneCardIds.length} 张场景卡` : ''}
                {draft.workflowRunId ? ` · SOP ${shortId(draft.workflowRunId)}` : ''}
              </small>
              <small>更新于 {formatTime(draft.updatedAt)}</small>
            </article>
          ))}
          {relatedDrafts.length === 0 ? <div className="empty-state">暂无关联 PromptDraft。</div> : null}
        </div>
      </section>
    </section>
  );
}
