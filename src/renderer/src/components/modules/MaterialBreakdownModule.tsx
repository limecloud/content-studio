import { useEffect, useMemo, useState } from 'react';
import type {
  GlobalGenerationParams,
  InputSourcePurpose,
  InputSourceRecord,
  InputSourceStatus,
  MediaGenerationResult,
  MixPackageAssetKind,
  PromptDraft,
  ReferenceReverseAnalysis,
  ReferenceReverseResult,
} from '../../../../shared/types';
import { fileNameFromPath, inputSourceKindLabel, localAssetUrl } from '../../app/formatters';

interface MaterialBreakdownModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  inputSources: InputSourceRecord[];
  productImageRefs: string[];
  referenceImageRefs: string[];
  mediaResult: MediaGenerationResult | null;
  reverseResult: ReferenceReverseResult | null;
  activePromptDraft?: PromptDraft;
  onSelectProductImages: () => void;
  onSelectReferenceImages: () => void;
  onImportInputSource: (purpose: InputSourcePurpose) => void;
  onRegisterManualInputSource: (input: {
    title: string;
    purpose: InputSourcePurpose;
    text: string;
    tags?: string[];
  }) => void;
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
  onUsePromptInImage: (input: {
    prompt: string;
    productImageRefs?: string[];
    referenceImageRefs?: string[];
    productImageLabel?: string;
    referenceImageLabel?: string;
    featureId?: string;
    featureTitle?: string;
  }) => void;
  onGenerateImage: (input: {
    prompt: string;
    productImageRefs?: string[];
    referenceImageRefs?: string[];
    productImageLabel?: string;
    referenceImageLabel?: string;
    featureId?: string;
    featureTitle?: string;
  }) => void;
  onReviewAsset: (input: {
    assetKey: string;
    kind: MixPackageAssetKind;
    sourceType: 'generation-log' | 'manual';
    sourceId?: string;
    path: string;
    title: string;
    status: 'approved' | 'rejected';
    note?: string;
    tags?: string[];
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

function generatedImageRefs(result: MediaGenerationResult | null): string[] {
  if (result?.status !== 'succeeded') return [];
  return result.assetRefs.filter((r) => /\.(png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(r));
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
  inputSources,
  productImageRefs,
  referenceImageRefs,
  mediaResult,
  reverseResult,
  activePromptDraft,
  onSelectProductImages,
  onSelectReferenceImages,
  onImportInputSource,
  onRegisterManualInputSource,
  onGenerateReversePrompt,
  onUpdatePromptDraft,
  onUsePromptInImage,
  onGenerateImage,
  onReviewAsset,
}: MaterialBreakdownModuleProps) {
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [platform, setPlatform] = useState(PLATFORM_OPTIONS[0]);
  const [targetFormat, setTargetFormat] = useState<GlobalGenerationParams['aspectRatio']>('4:5');
  const [productBrief, setProductBrief] = useState('');
  const [userIntent, setUserIntent] = useState('拆解参考图的构图、光线和留白，保留真实感，替换为本方产品。');
  const [promptText, setPromptText] = useState('');
  const [copied, setCopied] = useState(false);

  const referenceSources = useMemo(
    () => inputSources.filter((s) => s.purpose === 'reference' || s.kind === 'image' || s.kind === 'video'),
    [inputSources],
  );
  const productSources = useMemo(
    () => inputSources.filter((s) => s.purpose === 'product-brief' || s.purpose === 'sop-input' || s.purpose === 'brand-kb'),
    [inputSources],
  );
  const selectedReferenceSources = useMemo(() => selectedSources(referenceSources, referenceIds), [referenceIds, referenceSources]);
  const selectedProductSources = useMemo(() => selectedSources(productSources, productIds), [productIds, productSources]);
  const selectedReferenceRefs = useMemo(
    () => imageSourcesFromRefs([...referenceImageRefs, ...sourceAssetRefs(selectedReferenceSources)]),
    [referenceImageRefs, selectedReferenceSources],
  );
  const selectedProductRefs = useMemo(
    () => imageSourcesFromRefs([...productImageRefs, ...sourceAssetRefs(selectedProductSources)]),
    [productImageRefs, selectedProductSources],
  );
  const outputRefs = useMemo(() => generatedImageRefs(mediaResult), [mediaResult]);
  const analysis = reverseResult?.analysis;
  const draftForResult = reverseResult?.promptDraft;
  const draftContent = activeDraftContent(draftForResult);
  const canBreakdown = workspaceReady && !busy && referenceIds.length > 0 && userIntent.trim().length > 0;
  const canUsePrompt = promptText.trim().length > 0;


  useEffect(() => {
    if (referenceIds.length || referenceSources.length === 0) return;
    setReferenceIds(referenceSources.slice(0, 2).map((s) => s.id));
  }, [referenceIds.length, referenceSources]);

  useEffect(() => {
    if (productIds.length || productSources.length === 0) return;
    setProductIds(productSources.slice(0, 2).map((s) => s.id));
  }, [productIds.length, productSources]);

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
  }

  function runBreakdown(): void {
    onGenerateReversePrompt({
      referenceSourceIds: referenceIds,
      productSourceIds: productIds,
      userIntent: [
        userIntent,
        `平台：${platform}`,
        `目标画幅：${targetFormat}`,
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
      note: confirm ? '素材拆解确认版本' : '素材拆解编辑版本',
      confirm,
    });
  }

  async function copyPrompt(): Promise<void> {
    if (!promptText.trim()) return;
    await navigator.clipboard.writeText(promptText);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  }

  function handoffToImage(generate: boolean): void {
    const input = {
      prompt: promptText,
      productImageRefs: selectedProductRefs,
      referenceImageRefs: selectedReferenceRefs,
      productImageLabel: '产品图',
      referenceImageLabel: '参考素材',
      featureId: 'material-breakdown',
      featureTitle: '拆解素材',
    };
    if (generate) onGenerateImage(input);
    else onUsePromptInImage(input);
  }

  function reviewOutput(ref: string, status: 'approved' | 'rejected'): void {
    onReviewAsset({
      assetKey: `material-breakdown:${mediaResult?.logId ?? 'manual'}:${ref}`,
      kind: 'image',
      sourceType: mediaResult?.logId ? 'generation-log' : 'manual',
      sourceId: mediaResult?.logId,
      path: ref,
      title: fileNameFromPath(ref),
      status,
      note: status === 'approved' ? '素材拆解审核通过，入库。' : '素材拆解审核驳回，需调整。',
      tags: ['素材拆解', platform, targetFormat],
    });
  }


  return (
    <section className="ai-breakdown-shell">
      <aside className="ai-breakdown-sidebar">
        <div className="ai-breakdown-upload-zone">
          <button className="ai-breakdown-upload-btn" disabled={!workspaceReady || busy} onClick={() => onImportInputSource('reference')}>
            <span className="ai-breakdown-upload-icon">+</span>
            <span>上传参考素材</span>
            <small>支持图片，拖拽或点击上传</small>
          </button>
        </div>

        {selectedReferenceRefs.length > 0 && (
          <div className="ai-breakdown-thumb-strip">
            {selectedReferenceRefs.map((ref) => (
              <figure key={ref} className="ai-breakdown-thumb">
                <img src={localAssetUrl(ref)} alt="" />
              </figure>
            ))}
          </div>
        )}

        <div className="ai-breakdown-section">
          <h4>产品图</h4>
          <div className="ai-breakdown-upload-row">
            <button className="ai-breakdown-btn-ghost" disabled={!workspaceReady || busy} onClick={onSelectProductImages}>
              选择产品图
            </button>
          </div>
          {selectedProductRefs.length > 0 && (
            <div className="ai-breakdown-thumb-strip">
              {selectedProductRefs.map((ref) => (
                <figure key={ref} className="ai-breakdown-thumb">
                  <img src={localAssetUrl(ref)} alt="" />
                </figure>
              ))}
            </div>
          )}
        </div>

        <div className="ai-breakdown-section">
          <h4>产品资料</h4>
          <textarea
            className="ai-breakdown-brief"
            value={productBrief}
            placeholder="简要描述产品特点、使用场景..."
            onChange={(e) => setProductBrief(e.target.value)}
          />
          {productBrief.trim() && (
            <button className="ai-breakdown-btn-ghost small" disabled={!workspaceReady || busy} onClick={registerBrief}>
              登记资料
            </button>
          )}
        </div>

        <div className="ai-breakdown-section">
          <h4>拆解意图</h4>
          <textarea
            className="ai-breakdown-intent"
            value={userIntent}
            placeholder="描述你想从参考素材中学习什么..."
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

        {referenceSources.length > 0 && (
          <div className="ai-breakdown-source-list">
            <h4>参考源 <small>{referenceIds.length}/{referenceSources.length}</small></h4>
            {referenceSources.map((s) => (
              <label key={s.id} className="ai-breakdown-source-row">
                <input
                  type="checkbox"
                  checked={referenceIds.includes(s.id)}
                  onChange={(e) => setReferenceIds(
                    e.target.checked ? [...referenceIds, s.id].slice(0, 8) : referenceIds.filter((id) => id !== s.id),
                  )}
                />
                <span>{s.title}</span>
                <small>{inputSourceKindLabel(s.kind)} · {INPUT_SOURCE_STATUS_LABELS[s.status]}</small>
              </label>
            ))}
          </div>
        )}

        <button className="ai-breakdown-primary-btn" disabled={!canBreakdown} onClick={runBreakdown}>
          {analysis ? '重新拆解' : '开始拆解'}
        </button>
      </aside>

      <main className="ai-breakdown-canvas">
        {!analysis && !outputRefs.length && (
          <div className="ai-breakdown-empty-state">
            <span className="ai-breakdown-empty-icon">✦</span>
            <h3>上传参考素材，AI 帮你拆解</h3>
            <p>分析构图、光线、风格和留白，生成可编辑 Prompt</p>
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
                  {copied ? '已复制' : '复制'}
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
              placeholder="拆解后会生成可编辑 Prompt..."
              onChange={(e) => setPromptText(e.target.value)}
            />
            <div className="ai-breakdown-prompt-footer">
              <button className="ai-breakdown-primary-btn" disabled={!canUsePrompt || busy} onClick={() => handoffToImage(true)}>
                生成图片
              </button>
              <button className="ai-breakdown-btn-ghost" disabled={!canUsePrompt} onClick={() => handoffToImage(false)}>
                发送到图片生成
              </button>
            </div>
          </section>
        )}

        {outputRefs.length > 0 && (
          <section className="ai-breakdown-output">
            <header className="ai-breakdown-section-header">
              <h3>生成结果</h3>
              {mediaResult && (
                <span className={`ai-breakdown-badge ${mediaResult.status === 'succeeded' ? 'ready' : ''}`}>
                  {mediaResult.status === 'succeeded' ? '生成完成' : mediaResult.message}
                </span>
              )}
            </header>
            <div className="ai-breakdown-output-grid">
              {outputRefs.map((ref) => (
                <article key={ref} className="ai-breakdown-output-card">
                  <img src={localAssetUrl(ref)} alt="" />
                  <div className="ai-breakdown-output-actions">
                    <button className="approve" onClick={() => reviewOutput(ref, 'approved')}>通过</button>
                    <button className="reject" onClick={() => reviewOutput(ref, 'rejected')}>驳回</button>
                  </div>
                  <span className="ai-breakdown-output-name">{fileNameFromPath(ref)}</span>
                </article>
              ))}
            </div>
          </section>
        )}
      </main>
    </section>
  );
}
