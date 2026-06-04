import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type { OverlayCardDraft, OverlayCardRecord, OverlayCardType, PromptDraft } from '../../../../shared/types';
import { fileNameFromPath, localAssetUrl } from '../../app/formatters';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface GreenScreenModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  promptDrafts: PromptDraft[];
  overlayCards: OverlayCardRecord[];
  activePromptDraftId: string;
  onSelectDraft: (draftId: string) => void;
  onGenerateOverlayCards: (input: { promptDraftId?: string; cards: OverlayCardDraft[] }) => void;
  onRevealPath: (path: string) => void;
  onSelectModule: (module: ModuleKey) => void;
}

const OVERLAY_TYPE_OPTIONS: Array<{ value: OverlayCardType; label: string }> = [
  { value: 'title', label: '标题卡' },
  { value: 'selling-point', label: '卖点卡' },
  { value: 'quote', label: '金句卡' },
  { value: 'subtitle', label: '字幕卡' },
  { value: 'cta', label: 'CTA 卡' },
];

const PROMPT_PURPOSE_LABELS: Record<PromptDraft['purpose'], string> = {
  image: '图片提示词',
  video: '视频提示词',
  article: '文案提示词',
  'green-screen': '绿幕文案图',
  'content-task': '内容任务',
  sop: '流程草案',
  skill: 'Skill 草案',
};

function activeContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function normalizeLine(value: string): string {
  return value.replace(/^[-*#\d.\s]+/, '').replace(/\s+/g, ' ').trim();
}

function overlayTypeForIndex(index: number, total: number): OverlayCardType {
  if (index === 0) return 'title';
  if (index === total - 1) return 'cta';
  if (index % 3 === 0) return 'quote';
  return 'selling-point';
}

function parseCardsFromText(content: string): OverlayCardDraft[] {
  const chunks = content
    .split(/\n(?=### )/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  const source = chunks.length > 1 ? chunks : content.split(/\n+/g);
  const lines = source
    .map((item) => item.split('\n').map(normalizeLine).filter(Boolean))
    .map((parts) => parts.join(' '))
    .map((item) => item.replace(/^(Prompt|文案|字幕|标题|卖点)[:：]\s*/i, '').trim())
    .filter((item) => item.length >= 4)
    .slice(0, 8);
  return lines.map((line, index) => ({
    type: overlayTypeForIndex(index, lines.length),
    title: index === 0 ? line.slice(0, 18) : OVERLAY_TYPE_OPTIONS.find((option) => option.value === overlayTypeForIndex(index, lines.length))?.label ?? '文案卡',
    text: line,
    durationSeconds: index === 0 ? 3 : 4,
    tags: ['绿幕文案图'],
  }));
}

function emptyCard(type: OverlayCardType = 'selling-point'): OverlayCardDraft {
  return {
    type,
    title: type === 'title' ? '标题卡' : type === 'cta' ? '行动卡' : '卖点卡',
    text: '',
    durationSeconds: 4,
    tags: ['绿幕文案图'],
  };
}

function typeLabel(type: OverlayCardType): string {
  return OVERLAY_TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function GreenScreenModule({
  workspaceReady,
  busy,
  promptDrafts,
  overlayCards,
  activePromptDraftId,
  onSelectDraft,
  onGenerateOverlayCards,
  onRevealPath,
  onSelectModule,
}: GreenScreenModuleProps) {
  const feature = V2_FEATURES['image-green-screen'];
  const sourceDrafts = useMemo(
    () => promptDrafts.filter((draft) => ['green-screen', 'article', 'video'].includes(draft.purpose)),
    [promptDrafts],
  );
  const [selectedDraftId, setSelectedDraftId] = useState(activePromptDraftId);
  const selectedDraft =
    sourceDrafts.find((draft) => draft.id === selectedDraftId) ??
    sourceDrafts.find((draft) => draft.id === activePromptDraftId) ??
    sourceDrafts[0];
  const selectedDraftContent = activeContent(selectedDraft);
  const relatedOverlayCards = useMemo(
    () => overlayCards.filter((card) => !selectedDraft?.id || card.promptDraftId === selectedDraft.id),
    [overlayCards, selectedDraft?.id],
  );
  const [cards, setCards] = useState<OverlayCardDraft[]>([
    { type: 'title', title: '标题卡', text: '早餐后 10 秒钟的小习惯', durationSeconds: 3, tags: ['绿幕文案图'] },
    { type: 'selling-point', title: '卖点卡', text: '便携条包，放进包里或抽屉都不占地方', durationSeconds: 4, tags: ['绿幕文案图'] },
    { type: 'cta', title: '行动卡', text: '先从每天顺手一次开始', durationSeconds: 4, tags: ['绿幕文案图'] },
  ]);
  const canGenerate = workspaceReady && !busy && cards.some((card) => card.text.trim());

  useEffect(() => {
    if (selectedDraftId || !selectedDraft) return;
    setSelectedDraftId(selectedDraft.id);
  }, [selectedDraft, selectedDraftId]);

  function updateCard(index: number, patch: Partial<OverlayCardDraft>): void {
    setCards((current) => current.map((card, itemIndex) => (itemIndex === index ? { ...card, ...patch } : card)));
  }

  function removeCard(index: number): void {
    setCards((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }

  function rebuildFromDraft(): void {
    const nextCards = parseCardsFromText(selectedDraftContent);
    setCards(nextCards.length ? nextCards : [emptyCard('title'), emptyCard('selling-point'), emptyCard('cta')]);
  }

  return (
    <section className="green-screen-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="flow"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{overlayCards.length} 张绿幕卡</span>
            <span className="status-pill ready">本地确定性生成</span>
            <span className="status-pill">9:16 本地图片</span>
          </div>
        )}
      >
        <div className="module-command-flow">
          <div>
            <p className="eyebrow">业务边界</p>
            <h3>提示词 / 脚本 → 绿幕文案图 → 混剪清单</h3>
          </div>
          <div className="workflow-actions">
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('assets-prompt-workbench')}>
              Prompt 工作台
            </button>
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('video-mix-export')}>
              混剪包导出
            </button>
          </div>
        </div>
        <div className="v2-flow-steps module-command-steps">
          {feature.flow.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
        <div className="inline-warning">
          这里生成的是可被抠色的本地文案图，不调用图片生成模型，也不把它记为 AI 图片生成成功。
        </div>
      </ModuleCommandCenter>

      <div className="green-screen-layout">
        <aside className="panel green-screen-source-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">来源</p>
              <h3>选择脚本 / 提示词</h3>
            </div>
          </div>
          <div className="video-prompt-draft-list">
            {sourceDrafts.map((draft) => (
              <button
                key={draft.id}
                type="button"
                className={`video-prompt-draft ${draft.id === selectedDraft?.id ? 'active' : ''}`}
                onClick={() => {
                  setSelectedDraftId(draft.id);
                  onSelectDraft(draft.id);
                }}
              >
                <strong>{draft.title}</strong>
                <small>{PROMPT_PURPOSE_LABELS[draft.purpose]} · {draft.versions.length} 个版本</small>
              </button>
            ))}
            {sourceDrafts.length === 0 ? (
              <div className="empty-state">还没有可拆绿幕卡的 Prompt。可以直接在右侧手写文案卡，或先从场景库生成绿幕 / 文案 Prompt。</div>
            ) : null}
          </div>
          <label className="green-screen-source-preview">
            <span>来源内容</span>
            <textarea readOnly value={selectedDraftContent || '选择提示词后可一键拆成文案卡。'} />
          </label>
          <button className="ghost small" disabled={!selectedDraftContent} onClick={rebuildFromDraft}>
            从来源拆卡
          </button>
        </aside>

        <main className="panel green-screen-editor-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">文案卡</p>
              <h3>生成前可人工改写</h3>
            </div>
            <button className="ghost small" onClick={() => setCards((current) => [...current, emptyCard()])}>
              添加卡片
            </button>
          </div>
          <div className="overlay-card-editor-list">
            {cards.map((card, index) => (
              <article key={`${index}:${card.type}`} className="overlay-card-editor">
                <div className="overlay-card-editor-head">
                  <select value={card.type} onChange={(event) => updateCard(index, { type: event.target.value as OverlayCardType })}>
                    {OVERLAY_TYPE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>{option.label}</option>
                    ))}
                  </select>
                  <input
                    value={card.durationSeconds ?? 4}
                    min={1}
                    max={15}
                    type="number"
                    onChange={(event) => updateCard(index, { durationSeconds: Number(event.target.value) })}
                    aria-label="出现秒数"
                  />
                  <button className="ghost small" disabled={cards.length <= 1} onClick={() => removeCard(index)}>
                    删除
                  </button>
                </div>
                <input
                  value={card.title}
                  placeholder="卡片标题"
                  onChange={(event) => updateCard(index, { title: event.target.value })}
                />
                <textarea
                  value={card.text}
                  placeholder="绿幕图正文，建议 8-22 个字，太长就拆成多张。"
                  onChange={(event) => updateCard(index, { text: event.target.value })}
                />
              </article>
            ))}
          </div>
          <div className="workflow-actions left">
            <button
              className="primary"
              disabled={!canGenerate}
              onClick={() => onGenerateOverlayCards({ promptDraftId: selectedDraft?.id, cards })}
            >
              生成绿幕文案图
            </button>
            <button className="ghost" disabled={!overlayCards.length} onClick={() => onSelectModule('video-mix-export')}>
              去导出混剪包
            </button>
          </div>
        </main>

        <aside className="panel green-screen-output-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">已生成</p>
              <h3>绿幕图资产</h3>
            </div>
            <span className="status-pill">{relatedOverlayCards.length} 张</span>
          </div>
          <div className="overlay-card-grid">
            {relatedOverlayCards.map((card) => (
              <article key={card.id} className="overlay-card-tile">
                <img src={localAssetUrl(card.assetPath)} alt={card.title} />
                <div>
                  <strong>{card.title}</strong>
                  <small>{typeLabel(card.type)} · {card.durationSeconds}s · {fileNameFromPath(card.assetPath)}</small>
                  <p>{card.text}</p>
                </div>
                <div className="log-actions">
                  <button className="ghost small" onClick={() => onRevealPath(card.assetPath)}>打开位置</button>
                  <button className="primary small" onClick={() => onSelectModule('video-mix-export')}>加入混剪</button>
                </div>
              </article>
            ))}
            {relatedOverlayCards.length === 0 ? (
              <div className="empty-state">生成后会在这里展示本地 SVG 绿幕卡，并自动进入混剪包可选素材。</div>
            ) : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
