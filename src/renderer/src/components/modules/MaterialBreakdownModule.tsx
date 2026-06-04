import { useEffect, useMemo, useState } from 'react';
import type {
  GlobalGenerationParams,
  InputSourcePurpose,
  InputSourceRecord,
  InputSourceStatus,
  PromptDraft,
  ReferenceReverseAnalysis,
  ReferenceReverseResult,
} from '../../../../shared/types';
import { inputSourceKindLabel, localAssetUrl } from '../../app/formatters';

interface MaterialBreakdownModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  error?: string | null;
  inputSources: InputSourceRecord[];
  reverseResult: ReferenceReverseResult | null;
  activePromptDraft?: PromptDraft;
  onImportInputSource: (purpose: InputSourcePurpose) => void;
  onRegisterManualInputSource: (input: {
    title: string;
    purpose: InputSourcePurpose;
    text: string;
    tags?: string[];
  }) => void;
  onRemoveInputSource: (sourceId: string) => void;
  onGenerateReversePrompt: (input: {
    referenceSourceIds: string[];
    productSourceIds: string[];
    userIntent: string;
    platform?: string;
    targetFormat?: GlobalGenerationParams['aspectRatio'];
    outputUsage?: 'xiaohongshu-seeding' | 'ecommerce-detail' | 'social-post' | 'generic';
  }) => void;
  onUpdatePromptDraft: (input: {
    draftId: string;
    content: string;
    note?: string;
    confirm?: boolean;
  }) => void;
}

const INPUT_SOURCE_STATUS_LABELS: Record<InputSourceStatus, string> = {
  registered: '已登记',
  converted: '已解析',
  blocked: '待解析',
  failed: '解析失败',
};

const PLATFORM_OPTIONS = ['小红书', '抖音图文', '详情页'];
const FORMAT_OPTIONS: Array<GlobalGenerationParams['aspectRatio']> = ['4:5', '1:1', '3:4', '9:16'];


function activeDraftContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((v) => v.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function sourceAssetRefs(sources: InputSourceRecord[]): string[] {
  const refs = sources.flatMap((s) => [s.sourcePath, ...s.artifactRefs]);
  return Array.from(new Set(refs.filter((r): r is string => Boolean(r))));
}

function imageSourcesFromRefs(refs: string[]): string[] {
  return refs.filter((r) => /\.(png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(r)).slice(0, 6);
}

function selectedSources(sources: InputSourceRecord[], ids: string[]): InputSourceRecord[] {
  const selected = new Set(ids);
  return sources.filter((s) => selected.has(s.id));
}

function analysisCards(analysis?: ReferenceReverseAnalysis | null) {
  return [
    { title: '构图', value: analysis?.composition, icon: '◧' },
    { title: '主体', value: analysis?.subjectLayout, icon: '◉' },
    { title: '光线', value: analysis?.lighting, icon: '☀' },
    { title: '背景', value: analysis?.background, icon: '▦' },
    { title: '镜头', value: analysis?.camera, icon: '◎' },
    { title: '留白', value: analysis?.textArea, icon: '▯' },
    { title: '风格', value: analysis?.style, icon: '✦' },
    { title: '平台', value: analysis?.platformFit, icon: '◈' },
  ].filter((item) => item.value?.trim());
}

function promptFromAnalysis(analysis?: ReferenceReverseAnalysis | null): string {
  if (!analysis) return '';
  return [analysis.prompt, analysis.negativePrompt ? `\n负面约束：${analysis.negativePrompt}` : ''].join('').trim();
}


export function MaterialBreakdownModule({
  workspaceReady,
  busy,
  error,
  inputSources,
  reverseResult,
  activePromptDraft,
  onImportInputSource,
  onRegisterManualInputSource,
  onRemoveInputSource,
  onGenerateReversePrompt,
  onUpdatePromptDraft,
}: MaterialBreakdownModuleProps) {
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [platform, setPlatform] = useState(PLATFORM_OPTIONS[0]);
  const [targetFormat, setTargetFormat] = useState<GlobalGenerationParams['aspectRatio']>('4:5');
  const [productBrief, setProductBrief] = useState('');
  const [userIntent, setUserIntent] = useState('参考示例图生成同类小红书种草图 Prompt：学习构图、光线、文字排版和留白，替换为本方产品，不直接生成图片。');
  const [promptText, setPromptText] = useState('');
  const [copied, setCopied] = useState(false);

  const referenceSources = useMemo(
    () => inputSources.filter((s) => s.purpose === 'reference' || s.kind === 'image' || s.kind === 'video'),
    [inputSources],
  );
  const productSources = useMemo(
    () => inputSources.filter((s) => s.purpose === 'product-brief' || s.purpose === 'task-input' || s.purpose === 'sop-input' || s.purpose === 'brand-kb'),
    [inputSources],
  );
  const selectedReferenceSources = useMemo(() => selectedSources(referenceSources, referenceIds), [referenceIds, referenceSources]);
  const selectedProductSources = useMemo(() => selectedSources(productSources, productIds), [productIds, productSources]);
  const selectedReferenceRefs = useMemo(
    () => imageSourcesFromRefs(sourceAssetRefs(selectedReferenceSources)),
    [selectedReferenceSources],
  );
  const selectedProductRefs = useMemo(
    () => imageSourcesFromRefs(sourceAssetRefs(selectedProductSources)),
    [selectedProductSources],
  );
  const analysis = reverseResult?.analysis;
  const draftForResult = reverseResult?.promptDraft;
  const activeDraftFallback = activePromptDraft?.purpose === 'image' ? activeDraftContent(activePromptDraft) : '';
  const draftContent = activeDraftContent(draftForResult) || activeDraftFallback;
  const missingItems = [
    selectedReferenceRefs.length === 0 ? '参考素材' : '',
    productIds.length === 0 ? '产品图或已登记产品资料' : '',
    userIntent.trim().length === 0 ? '拆解目标' : '',
  ].filter(Boolean);
  const canBreakdown = workspaceReady && !busy && referenceIds.length > 0 && productIds.length > 0 && userIntent.trim().length > 0;
  const canUsePrompt = promptText.trim().length > 0;
  const showRetry = Boolean(error) && canBreakdown;


  useEffect(() => {
    if (referenceIds.length || referenceSources.length === 0) return;
    setReferenceIds(referenceSources.slice(0, 4).map((s) => s.id));
  }, [referenceIds.length, referenceSources]);

  useEffect(() => {
    if (productIds.length || productSources.length === 0) return;
    setProductIds(productSources.slice(0, 2).map((s) => s.id));
  }, [productIds.length, productSources]);

  useEffect(() => {
    const availableIds = new Set(referenceSources.map((source) => source.id));
    setReferenceIds((current) => current.filter((id) => availableIds.has(id)));
  }, [referenceSources]);

  useEffect(() => {
    const availableIds = new Set(productSources.map((source) => source.id));
    setProductIds((current) => current.filter((id) => availableIds.has(id)));
  }, [productSources]);

  useEffect(() => {
    const nextPrompt = draftContent || promptFromAnalysis(analysis);
    if (nextPrompt) setPromptText(nextPrompt);
  }, [analysis, draftContent]);

  function registerBrief(): void {
    onRegisterManualInputSource({
      title: '素材拆解产品资料',
      purpose: 'product-brief',
      text: productBrief,
      tags: ['素材拆解', platform],
    });
    setProductBrief('');
  }

  function removeSource(source: InputSourceRecord): void {
    const confirmed = window.confirm(`从当前工作区移除「${source.title}」？原始文件不会从磁盘删除。`);
    if (!confirmed) return;
    onRemoveInputSource(source.id);
  }

  function runBreakdown(): void {
    onGenerateReversePrompt({
      referenceSourceIds: referenceIds,
      productSourceIds: productIds,
      userIntent: [
        userIntent,
        `平台：${platform}`,
        `目标画幅：${targetFormat}`,
        '输出要求：只生成可复制到外部生图工具的图片 Prompt，不创建图片生成任务。',
        '提示词数量：围绕参考素材输出 3-4 个同风格变体方向。',
        productBrief.trim() ? `补充产品资料：${productBrief.trim()}` : '',
      ].filter(Boolean).join('\n'),
      platform,
      targetFormat,
      outputUsage: platform === '详情页' ? 'ecommerce-detail' : platform === '小红书' ? 'xiaohongshu-seeding' : 'social-post',
    });
  }

  async function savePrompt(confirm = false): Promise<void> {
    if (!draftForResult?.id || !promptText.trim()) return;
    onUpdatePromptDraft({
      draftId: draftForResult.id,
      content: promptText,
      note: confirm ? '素材拆解 Prompt 确认版本' : '素材拆解 Prompt 编辑版本',
      confirm,
    });
  }

  async function copyPrompt(): Promise<void> {
    if (!promptText.trim()) return;
    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  return (
    <section className="ai-breakdown-shell">
      <aside className="ai-breakdown-sidebar">
        <header className="ai-breakdown-header">
          <p className="eyebrow">图片提示词 / 素材拆解</p>
          <h2>拆解素材</h2>
          <span>用参考素材学习画面结构，用本方产品替换主体，只生成可复制 Prompt。</span>
        </header>

        <div className="ai-breakdown-input-card">
          <div className="ai-breakdown-input-title">
            <div>
              <strong>参考素材</strong>
              <small>学习构图、光线、文字排版和留白，不作为产品主体。</small>
            </div>
            <button className="ai-breakdown-btn-ghost small" disabled={!workspaceReady || busy} onClick={() => onImportInputSource('reference')}>
              上传参考
            </button>
          </div>
          <ImageStrip refs={selectedReferenceRefs} emptyText="还没有参考图" />
          <SourcePicker
            title="参考源"
            sources={referenceSources}
            selectedIds={referenceIds}
            onChange={setReferenceIds}
            onRemove={removeSource}
            busy={busy}
          />
        </div>

        <div className="ai-breakdown-input-card">
          <div className="ai-breakdown-input-title">
            <div>
              <strong>本方产品</strong>
              <small>作为图片主体和卖点事实来源。</small>
            </div>
            <button className="ai-breakdown-btn-ghost small" disabled={!workspaceReady || busy} onClick={() => onImportInputSource('product-brief')}>
              上传产品图
            </button>
          </div>
          <ImageStrip refs={selectedProductRefs} emptyText="还没有产品图" />
          <SourcePicker
            title="产品源"
            sources={productSources}
            selectedIds={productIds}
            onChange={setProductIds}
            onRemove={removeSource}
            busy={busy}
          />
          <textarea
            className="ai-breakdown-brief"
            value={productBrief}
            placeholder="补充产品名称、卖点、适用场景、禁用词..."
            onChange={(e) => setProductBrief(e.target.value)}
          />
          <button className="ai-breakdown-btn-ghost small" disabled={!workspaceReady || busy || !productBrief.trim()} onClick={registerBrief}>
            登记产品资料
          </button>
        </div>

        <div className="ai-breakdown-section">
          <h4>拆解目标</h4>
          <textarea
            className="ai-breakdown-intent"
            value={userIntent}
            placeholder="描述这次要生成什么类型的提示词..."
            onChange={(e) => setUserIntent(e.target.value)}
          />
        </div>

        <div className="ai-breakdown-controls">
          <label className="ai-breakdown-select-row">
            <span>平台</span>
            <select value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {PLATFORM_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </label>
          <label className="ai-breakdown-select-row">
            <span>画幅</span>
            <select value={targetFormat} onChange={(e) => setTargetFormat(e.target.value as GlobalGenerationParams['aspectRatio'])}>
              {FORMAT_OPTIONS.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </label>
        </div>

        {missingItems.length > 0 && (
          <div className="ai-breakdown-inline-note">
            还需：{missingItems.join('、')}
          </div>
        )}

        <button className="ai-breakdown-primary-btn" disabled={!canBreakdown} onClick={runBreakdown}>
          {analysis ? '重新生成提示词' : '生成提示词'}
        </button>
      </aside>

      <main className="ai-breakdown-canvas">
        {error && (
          <section className="ai-breakdown-error-state" role="alert">
            <span className="ai-breakdown-badge warning">未完成</span>
            <div>
              <h3>素材拆解没有生成</h3>
              <p>{error}</p>
            </div>
            {showRetry ? (
              <button className="ai-breakdown-btn-ghost small" disabled={busy} onClick={runBreakdown}>
                重试生成
              </button>
            ) : null}
          </section>
        )}

        {!analysis && (
          <div className="ai-breakdown-empty-state">
            <span className="ai-breakdown-empty-icon">✦</span>
            <h3>按任务上传参考素材和产品资料</h3>
            <p>系统只生成提示词，不在本页创建图片生成任务。</p>
          </div>
        )}

        {analysis && (
          <section className="ai-breakdown-analysis">
            <header className="ai-breakdown-section-header">
              <h3>拆解结果</h3>
              <span className="ai-breakdown-badge ready">已完成</span>
            </header>
            <div className="ai-breakdown-card-grid">
              {analysisCards(analysis).map((card) => (
                <article key={card.title} className="ai-breakdown-card">
                  <span className="ai-breakdown-card-icon">{card.icon}</span>
                  <div>
                    <strong>{card.title}</strong>
                    <p>{card.value}</p>
                  </div>
                </article>
              ))}
            </div>

            {(analysis.reusableElements?.length || analysis.replacementRules?.length || analysis.risks?.length) && (
              <div className="ai-breakdown-tags-section">
                {analysis.reusableElements?.length ? (
                  <div className="ai-breakdown-tag-group">
                    <strong>可复用</strong>
                    <div className="ai-breakdown-tags">
                      {analysis.reusableElements.map((item) => <span key={item} className="ai-breakdown-tag">{item}</span>)}
                    </div>
                  </div>
                ) : null}
                {analysis.replacementRules?.length ? (
                  <div className="ai-breakdown-tag-group">
                    <strong>替换规则</strong>
                    <div className="ai-breakdown-tags">
                      {analysis.replacementRules.map((item) => <span key={item} className="ai-breakdown-tag">{item}</span>)}
                    </div>
                  </div>
                ) : null}
                {analysis.risks?.length ? (
                  <div className="ai-breakdown-tag-group warning">
                    <strong>风险提示</strong>
                    <div className="ai-breakdown-tags">
                      {analysis.risks.map((item) => <span key={item} className="ai-breakdown-tag warning">{item}</span>)}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </section>
        )}

        {analysis && (
          <section className="ai-breakdown-prompt">
            <header className="ai-breakdown-section-header">
              <h3>Prompt</h3>
              <div className="ai-breakdown-prompt-actions">
                <button className="ai-breakdown-btn-ghost small" disabled={!canUsePrompt} onClick={copyPrompt}>
                  {copied ? '已复制' : '复制 Prompt'}
                </button>
                <button className="ai-breakdown-btn-ghost small" disabled={!draftForResult?.id || !canUsePrompt} onClick={() => savePrompt(false)}>
                  保存
                </button>
                <button className="ai-breakdown-btn-ghost small" disabled={!draftForResult?.id || !canUsePrompt} onClick={() => savePrompt(true)}>
                  确认版本
                </button>
              </div>
            </header>
            <textarea
              className="ai-breakdown-prompt-textarea"
              value={promptText}
              placeholder="生成后会出现可编辑、可复制的 Prompt..."
              onChange={(e) => setPromptText(e.target.value)}
            />
            <div className="ai-breakdown-prompt-footer">
              <button className="ai-breakdown-primary-btn" disabled={!canUsePrompt} onClick={copyPrompt}>
                {copied ? '已复制' : '复制到外部工具'}
              </button>
            </div>
          </section>
        )}

        <aside className="ai-breakdown-boundary">
          <strong>生成边界</strong>
          <span>只复用参考素材的风格结构，不复制可识别品牌元素。</span>
          <span>产品卖点以本方产品资料为准，不编造功效承诺。</span>
          <span>本页只交付 Prompt，图片生成在外部工具或其他工作台完成。</span>
        </aside>
      </main>
    </section>
  );
}

function ImageStrip({ refs, emptyText }: { refs: string[]; emptyText: string }) {
  if (!refs.length) {
    return <div className="ai-breakdown-image-empty">{emptyText}</div>;
  }
  return (
    <div className="ai-breakdown-thumb-strip">
      {refs.map((ref) => (
        <figure key={ref} className="ai-breakdown-thumb">
          <img src={localAssetUrl(ref)} alt="" />
        </figure>
      ))}
    </div>
  );
}

function SourcePicker({
  title,
  sources,
  selectedIds,
  onChange,
  onRemove,
  busy,
}: {
  title: string;
  sources: InputSourceRecord[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onRemove: (source: InputSourceRecord) => void;
  busy: boolean;
}) {
  if (!sources.length) return null;
  return (
    <div className="ai-breakdown-source-list">
      <h4>{title} <small>{selectedIds.length}/{sources.length}</small></h4>
      {sources.map((source) => (
        <div key={source.id} className="ai-breakdown-source-row">
          <input
            type="checkbox"
            checked={selectedIds.includes(source.id)}
            disabled={busy}
            onChange={(event) => onChange(
              event.target.checked
                ? [...selectedIds, source.id].slice(0, 8)
                : selectedIds.filter((id) => id !== source.id),
            )}
          />
          <span className="ai-breakdown-source-title">{source.title}</span>
          <button
            type="button"
            className="ai-breakdown-source-remove"
            disabled={busy}
            title="从当前工作区移除"
            aria-label={`移除 ${source.title}`}
            onClick={() => onRemove(source)}
          >
            删除
          </button>
          <small>{inputSourceKindLabel(source.kind)} · {INPUT_SOURCE_STATUS_LABELS[source.status]}</small>
        </div>
      ))}
    </div>
  );
}
