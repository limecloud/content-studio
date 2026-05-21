import { useEffect, useMemo, useState } from 'react';
import type { InputSourcePurpose, InputSourceRecord } from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface ReferenceReverseModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  inputSources: InputSourceRecord[];
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
  }) => void;
  onOpenPromptWorkbench: () => void;
}

function sourceSummary(source: InputSourceRecord): string {
  return source.summary ?? source.blockedReason ?? source.title;
}

function SourcePicker({
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
    <section className="reference-source-column">
      <h3>{title}</h3>
      <div className="reference-source-list">
        {sources.map((source) => (
          <label key={source.id} className="prompt-source-option">
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
              <strong>{source.title}</strong>
              <small>{source.kind} / {source.status} · {sourceSummary(source)}</small>
            </span>
          </label>
        ))}
        {sources.length === 0 ? (
          <div className="empty-state">暂无可选输入源。</div>
        ) : null}
      </div>
    </section>
  );
}

export function ReferenceReverseModule({
  workspaceReady,
  busy,
  inputSources,
  onImportInputSource,
  onRegisterManualInputSource,
  onGenerateReversePrompt,
  onOpenPromptWorkbench,
}: ReferenceReverseModuleProps) {
  const feature = V2_FEATURES['image-reference-reverse'];
  const [referenceIds, setReferenceIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [productBrief, setProductBrief] = useState('产品资料：便携条包，早餐后 / 办公抽屉场景，画面要像真实用户手机拍摄。');
  const [userIntent, setUserIntent] = useState('反推小红书 4:5 种草图 Prompt，强调自然光、真实手部动作、左上标题留白。');
  const referenceSources = useMemo(
    () => inputSources.filter((source) => source.purpose === 'reference' || source.kind === 'image' || source.kind === 'video'),
    [inputSources],
  );
  const productSources = useMemo(
    () => inputSources.filter((source) => source.purpose === 'product-brief' || source.purpose === 'sop-input' || source.purpose === 'brand-kb'),
    [inputSources],
  );

  useEffect(() => {
    if (referenceIds.length || referenceSources.length === 0) return;
    setReferenceIds(referenceSources.slice(0, 2).map((source) => source.id));
  }, [referenceIds.length, referenceSources]);

  useEffect(() => {
    if (productIds.length || productSources.length === 0) return;
    setProductIds(productSources.slice(0, 2).map((source) => source.id));
  }, [productIds.length, productSources]);

  const canGenerate = workspaceReady && !busy && userIntent.trim().length > 0 && referenceIds.length > 0;

  return (
    <section className="reference-reverse-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="compact"
        actions={(
          <div className="workflow-summary-stack">
            <span className="status-pill">{referenceSources.length} 个参考源</span>
            <span className="status-pill ready">{productSources.length} 个产品源</span>
          </div>
        )}
      />

      <div className="reference-reverse-layout">
        <section className="panel reference-reverse-input-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">输入</p>
              <h3>参考图 / 产品资料</h3>
            </div>
          </div>
          <div className="workflow-actions left">
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onImportInputSource('reference')}>
              导入参考图 / 视频
            </button>
            <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onImportInputSource('product-brief')}>
              导入产品资料
            </button>
          </div>
          <label className="reference-brief-field">
            <span>快速登记产品资料</span>
            <textarea value={productBrief} onChange={(event) => setProductBrief(event.target.value)} />
          </label>
          <button
            className="primary small"
            disabled={!workspaceReady || busy || !productBrief.trim()}
            onClick={() => onRegisterManualInputSource({
              title: '对标图反推产品资料',
              purpose: 'product-brief',
              text: productBrief,
              tags: ['对标图反推', '产品资料'],
            })}
          >
            登记产品资料文本
          </button>
        </section>

        <section className="panel reference-reverse-picker-panel">
          <div className="reference-source-grid">
            <SourcePicker
              title="参考源"
              sources={referenceSources}
              selectedIds={referenceIds}
              onChange={setReferenceIds}
            />
            <SourcePicker
              title="产品源"
              sources={productSources}
              selectedIds={productIds}
              onChange={setProductIds}
            />
          </div>
        </section>

        <section className="panel reference-reverse-output-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">输出</p>
              <h3>生成 PromptDraft</h3>
            </div>
          </div>
          <label className="reference-brief-field">
            <span>反推意图</span>
            <textarea value={userIntent} onChange={(event) => setUserIntent(event.target.value)} />
          </label>
          <div className="reference-boundary-box">
            <strong>边界</strong>
            <p>这里必须走真实视觉理解服务；未配置时保持 blocked，不用普通文字模板伪造“看过图”。参考图只复用构图、光线、镜头和留白，不复制竞品 Logo、包装、文案或可识别元素。</p>
          </div>
          <div className="workflow-actions left">
            <button
              className="primary small"
              disabled={!canGenerate}
              onClick={() => onGenerateReversePrompt({
                referenceSourceIds: referenceIds,
                productSourceIds: productIds,
                userIntent,
              })}
            >
              反推图片 Prompt
            </button>
            <button className="ghost small" onClick={onOpenPromptWorkbench}>
              打开 Prompt 工作台
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
