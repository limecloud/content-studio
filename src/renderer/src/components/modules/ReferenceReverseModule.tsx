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
import { ModuleCommandCenter } from '../ModuleCommandCenter';

type ReverseStage = 'input' | 'analysis' | 'image' | 'review';

interface ReferenceReverseModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  inputSources: InputSourceRecord[];
  mediaResult: MediaGenerationResult | null;
  reverseResult: ReferenceReverseResult | null;
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

const STAGE_ITEMS: Array<{ key: ReverseStage; title: string }> = [
  { key: 'input', title: '输入' },
  { key: 'analysis', title: '反推' },
  { key: 'image', title: '生成' },
  { key: 'review', title: '入库' },
];

const PLATFORM_OPTIONS = ['小红书', '抖音图文', '详情页'];
const FORMAT_OPTIONS: Array<GlobalGenerationParams['aspectRatio']> = ['4:5', '1:1', '3:4', '9:16'];

function sourceSummary(source: InputSourceRecord): string {
  return source.summary ?? source.extractedText ?? source.blockedReason ?? source.title;
}

function activeDraftContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function sourceAssetRefs(sources: InputSourceRecord[]): string[] {
  const refs = sources.flatMap((source) => [source.sourcePath, ...source.artifactRefs]);
  return Array.from(new Set(refs.filter((ref): ref is string => Boolean(ref))));
}

function imageSourcesFromRefs(refs: string[]): string[] {
  return refs.filter((ref) => /\.(png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(ref)).slice(0, 6);
}

function selectedSources(sources: InputSourceRecord[], ids: string[]): InputSourceRecord[] {
  const selected = new Set(ids);
  return sources.filter((source) => selected.has(source.id));
}

function generatedImageRefs(result: MediaGenerationResult | null): string[] {
  if (result?.status !== 'succeeded') return [];
  return result.assetRefs.filter((ref) => /\.(png|jpe?g|webp|gif|avif)(?:[?#].*)?$/i.test(ref));
}

function analysisCards(analysis?: ReferenceReverseAnalysis | null) {
  return [
    { title: '构图', value: analysis?.composition },
    { title: '主体', value: analysis?.subjectLayout },
    { title: '光线', value: analysis?.lighting },
    { title: '背景', value: analysis?.background },
    { title: '镜头', value: analysis?.camera },
    { title: '留白', value: analysis?.textArea },
    { title: '风格', value: analysis?.style },
    { title: '平台', value: analysis?.platformFit },
  ].filter((item) => item.value?.trim());
}

function promptFromAnalysis(analysis?: ReferenceReverseAnalysis | null): string {
  if (!analysis) return '';
  return [
    analysis.prompt,
    analysis.negativePrompt ? `\n负面约束：${analysis.negativePrompt}` : '',
  ].join('').trim();
}

function SourceList({
  title,
  sources,
  selectedIds,
  onChange,
}: {
  title: string;
  sources: InputSourceRecord[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <section className="reference-sop-source-block">
      <header>
        <strong>{title}</strong>
        <span>{selectedIds.length}/{sources.length}</span>
      </header>
      <div className="reference-sop-source-list">
        {sources.length ? sources.map((source) => (
          <label key={source.id} className="reference-sop-source-row">
            <input
              type="checkbox"
              checked={selectedIds.includes(source.id)}
              onChange={(event) => {
                onChange(
                  event.target.checked
                    ? [...selectedIds, source.id].slice(0, 8)
                    : selectedIds.filter((id) => id !== source.id),
                );
              }}
            />
            <span>
              <b>{source.title}</b>
              <small>{inputSourceKindLabel(source.kind)} · {INPUT_SOURCE_STATUS_LABELS[source.status]} · {sourceSummary(source)}</small>
            </span>
          </label>
        )) : <div className="reference-sop-empty">暂无资料</div>}
      </div>
    </section>
  );
}

function ImageStrip({ refs, emptyText }: { refs: string[]; emptyText: string }) {
  if (!refs.length) return <div className="reference-sop-image-empty">{emptyText}</div>;
  return (
    <div className="reference-sop-image-strip">
      {refs.map((ref) => (
        <figure key={ref}>
          <img src={localAssetUrl(ref)} alt="" />
          <figcaption>{fileNameFromPath(ref)}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function ReferenceReverseModule({
  workspaceReady,
  busy,
  inputSources,
  mediaResult,
  reverseResult,
  onImportInputSource,
  onRegisterManualInputSource,
  onGenerateReversePrompt,
  onUpdatePromptDraft,
  onUsePromptInImage,
  onGenerateImage,
  onReviewAsset,
}: ReferenceReverseModuleProps) {
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [platform, setPlatform] = useState(PLATFORM_OPTIONS[0]);
  const [targetFormat, setTargetFormat] = useState<GlobalGenerationParams['aspectRatio']>('4:5');
  const [productBrief, setProductBrief] = useState('');
  const [userIntent, setUserIntent] = useState('');
  const [promptText, setPromptText] = useState('');
  const [copied, setCopied] = useState(false);

  const referenceSources = useMemo(
    () => inputSources.filter((source) => source.purpose === 'reference'),
    [inputSources],
  );
  const productSources = useMemo(
    () => inputSources.filter((source) => source.purpose === 'product-brief' || source.purpose === 'sop-input' || source.purpose === 'brand-kb'),
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
  const outputRefs = useMemo(() => generatedImageRefs(mediaResult), [mediaResult]);
  const analysis = reverseResult?.analysis;
  const draftForResult = reverseResult?.promptDraft;
  const draftContent = activeDraftContent(draftForResult);
  const reverseMissingItems = [
    referenceIds.length === 0 ? '对标图' : '',
    productIds.length === 0 ? '产品资料或产品图' : '',
    userIntent.trim().length === 0 ? '反推意图' : '',
  ].filter(Boolean);
  const canReverse = workspaceReady && !busy && referenceIds.length > 0 && productIds.length > 0 && userIntent.trim().length > 0;
  const canUsePrompt = Boolean(reverseResult) && promptText.trim().length > 0;
  const stage: ReverseStage = outputRefs.length ? 'review' : analysis ? 'image' : referenceIds.length ? 'analysis' : 'input';

  useEffect(() => {
    if (!reverseResult) {
      setPromptText('');
      return;
    }
    const nextPrompt = draftContent || promptFromAnalysis(analysis);
    setPromptText(nextPrompt);
  }, [analysis, draftContent, reverseResult]);

  function registerBrief(): void {
    const text = productBrief.trim();
    if (!text) return;
    onRegisterManualInputSource({
      title: '对标图反推产品资料',
      purpose: 'product-brief',
      text,
      tags: ['对标图反推', platform],
    });
    setProductBrief('');
  }

  function runReverse(): void {
    onGenerateReversePrompt({
      referenceSourceIds: referenceIds,
      productSourceIds: productIds,
      userIntent: [
        userIntent.trim(),
        `平台：${platform}`,
        `目标画幅：${targetFormat}`,
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
      note: confirm ? '对标图反推 SOP 确认版本' : '对标图反推 SOP 编辑版本',
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
      referenceImageLabel: '对标图',
      featureId: 'image-reference-reverse',
      featureTitle: '对标图反推',
    };
    if (generate) onGenerateImage(input);
    else onUsePromptInImage(input);
  }

  function reviewOutput(ref: string, status: 'approved' | 'rejected'): void {
    onReviewAsset({
      assetKey: `reference-reverse:${mediaResult?.logId ?? 'manual'}:${ref}`,
      kind: 'image',
      sourceType: mediaResult?.logId ? 'generation-log' : 'manual',
      sourceId: mediaResult?.logId,
      path: ref,
      title: fileNameFromPath(ref),
      status,
      note: status === 'approved'
        ? '对标图反推 SOP 人工审核通过，可入素材库。'
        : '对标图反推 SOP 人工审核驳回，需要调整 Prompt 后重生成。',
      tags: ['对标图反推', platform, targetFormat],
    });
  }

  return (
    <section className="reference-reverse-workbench reference-sop-workbench">
      <ModuleCommandCenter
        eyebrow="图片 / SOP"
        title="对标图反推"
        density="compact"
        actions={(
          <div className="reference-sop-actions">
            <select value={platform} onChange={(event) => setPlatform(event.target.value)}>
              {PLATFORM_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={targetFormat} onChange={(event) => setTargetFormat(event.target.value as GlobalGenerationParams['aspectRatio'])}>
              {FORMAT_OPTIONS.map((item) => <option key={item} value={item}>{item}</option>)}
            </select>
            <button className="primary small" disabled={!canReverse} onClick={runReverse}>
              {analysis ? '重新反推' : '开始反推'}
            </button>
          </div>
        )}
      />
      <div className="reference-sop-rail" aria-label="对标图反推流程">
        {STAGE_ITEMS.map((item) => (
          <span key={item.key} className={item.key === stage ? 'active' : STAGE_ITEMS.findIndex((stageItem) => stageItem.key === item.key) < STAGE_ITEMS.findIndex((stageItem) => stageItem.key === stage) ? 'done' : ''}>
            {item.title}
          </span>
        ))}
      </div>

      <div className="reference-sop-layout">
        <aside className="panel reference-sop-input-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">输入</p>
              <h3>参考图和产品</h3>
            </div>
          </div>

          <div className="reference-sop-upload-grid">
            <button className="ghost" disabled={!workspaceReady || busy} onClick={() => onImportInputSource('reference')}>
              上传对标图
            </button>
            <button className="ghost" disabled={!workspaceReady || busy} onClick={() => onImportInputSource('product-brief')}>
              上传产品图
            </button>
          </div>

          <ImageStrip refs={selectedReferenceRefs} emptyText="还没有对标图" />
          <ImageStrip refs={selectedProductRefs} emptyText="还没有产品图" />

          <label className="reference-sop-field">
            <span>产品资料</span>
            <textarea
              value={productBrief}
              placeholder="填写真实产品名称、卖点、禁用词；登记后参与反推。"
              onChange={(event) => setProductBrief(event.target.value)}
            />
          </label>
          <div className="reference-sop-upload-grid">
            <button className="primary small" disabled={!workspaceReady || busy || !productBrief.trim()} onClick={registerBrief}>
              登记资料
            </button>
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onImportInputSource('product-brief')}>
              导入资料
            </button>
          </div>

          <SourceList title="参考源" sources={referenceSources} selectedIds={referenceIds} onChange={setReferenceIds} />
          <SourceList title="产品源" sources={productSources} selectedIds={productIds} onChange={setProductIds} />

          <label className="reference-sop-field">
            <span>反推意图</span>
            <textarea
              value={userIntent}
              placeholder="输入这次要生成的图片用途、平台和必须保留的画面特征。"
              onChange={(event) => setUserIntent(event.target.value)}
            />
          </label>
          {reverseMissingItems.length ? (
            <div className="reference-sop-inline-note">
              还需：{reverseMissingItems.join('、')}
            </div>
          ) : null}
        </aside>

        <main className="reference-sop-main">
          <section className="panel reference-sop-analysis-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">反推结果</p>
                <h3>画面拆解</h3>
              </div>
              <span className={`status-pill ${analysis ? 'ready' : ''}`}>{analysis ? '已生成' : '待反推'}</span>
            </div>

            {analysis ? (
              <>
                <div className="reference-sop-analysis-grid">
                  {analysisCards(analysis).map((item) => (
                    <article key={item.title}>
                      <span>{item.title}</span>
                      <p>{item.value}</p>
                    </article>
                  ))}
                </div>
                <div className="reference-sop-list-grid">
                  <section>
                    <strong>可复用</strong>
                    {(analysis.reusableElements ?? []).map((item) => <span key={item}>{item}</span>)}
                  </section>
                  <section>
                    <strong>替换规则</strong>
                    {(analysis.replacementRules ?? []).map((item) => <span key={item}>{item}</span>)}
                  </section>
                  <section className="warning">
                    <strong>风险</strong>
                    {(analysis.risks ?? []).map((item) => <span key={item}>{item}</span>)}
                  </section>
                </div>
              </>
            ) : (
              <div className="reference-sop-placeholder">
                <strong>上传对标图后开始反推</strong>
                <small>只学习构图、光线、镜头和留白，不复制竞品元素。</small>
              </div>
            )}
          </section>

          <section className="panel reference-sop-prompt-panel">
            <div className="panel-title">
              <div>
                <p className="eyebrow">Prompt</p>
                <h3>生成指令</h3>
              </div>
              <div className="workflow-actions left">
                <button className="ghost small" disabled={!canUsePrompt} onClick={copyPrompt}>
                  {copied ? '已复制' : '复制'}
                </button>
                <button className="ghost small" disabled={!draftForResult?.id || !canUsePrompt} onClick={() => savePrompt(false)}>
                  保存
                </button>
              </div>
            </div>
            <textarea
              value={promptText}
              placeholder="反推后会生成可编辑 Prompt。"
              disabled={!reverseResult}
              onChange={(event) => setPromptText(event.target.value)}
            />
            <div className="reference-sop-prompt-actions">
              <button className="primary" disabled={!canUsePrompt || busy} onClick={() => handoffToImage(true)}>
                生成图片候选
              </button>
              <button className="ghost" disabled={!canUsePrompt} onClick={() => handoffToImage(false)}>
                发送到图片生成
              </button>
              <button className="ghost" disabled={!draftForResult?.id || !canUsePrompt} onClick={() => savePrompt(true)}>
                确认版本
              </button>
            </div>
          </section>
        </main>

        <aside className="panel reference-sop-output-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">输出</p>
              <h3>候选图和审核</h3>
            </div>
          </div>
          {mediaResult ? (
            <div className={`reference-sop-result-card ${mediaResult.status}`}>
              <strong>{mediaResult.status === 'succeeded' ? '生成完成' : mediaResult.status === 'blocked' ? '待配置' : mediaResult.status}</strong>
              <small>{mediaResult.message}</small>
            </div>
          ) : null}

          {outputRefs.length ? (
            <div className="reference-sop-output-list">
              {outputRefs.map((ref) => (
                <article key={ref}>
                  <img src={localAssetUrl(ref)} alt="" />
                  <strong>{fileNameFromPath(ref)}</strong>
                  <div>
                    <button className="primary small" onClick={() => reviewOutput(ref, 'approved')}>
                      通过入库
                    </button>
                    <button className="ghost small" onClick={() => reviewOutput(ref, 'rejected')}>
                      驳回
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="reference-sop-placeholder compact">
              <strong>暂无候选图</strong>
              <small>确认 Prompt 后生成图片候选。</small>
            </div>
          )}

          <div className="reference-sop-checklist">
            <strong>质检</strong>
            {analysis?.qualityChecklist?.length ? (
              analysis.qualityChecklist.map((item) => (
                <span key={item}>{item}</span>
              ))
            ) : (
              <small>反推完成后显示真实质检项。</small>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
