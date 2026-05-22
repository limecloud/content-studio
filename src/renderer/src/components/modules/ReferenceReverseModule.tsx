import { useEffect, useMemo, useState } from 'react';
import type { ModuleKey } from '../../app/types';
import type { InputSourcePurpose, InputSourceRecord, InputSourceStatus } from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { UserJourneyGuide } from '../UserJourneyGuide';

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
  onSelectModule: (module: ModuleKey) => void;
}

const INPUT_SOURCE_STATUS_LABELS: Record<InputSourceStatus, string> = {
  registered: '已登记',
  converted: '已解析',
  blocked: '待解析',
  failed: '解析失败',
};

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
              <small>{source.kind} / {INPUT_SOURCE_STATUS_LABELS[source.status]} · {sourceSummary(source)}</small>
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
  onSelectModule,
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
  const hasReference = referenceIds.length > 0;
  const hasProductContext = productIds.length > 0 || productBrief.trim().length > 0;

  const runReverse = () => onGenerateReversePrompt({
    referenceSourceIds: referenceIds,
    productSourceIds: productIds,
    userIntent,
  });

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

      <UserJourneyGuide
        title="无知识库小红书扒图"
        description="这条路径服务新媒体和电商运营：先给参考图和自己的产品资料，再反推可编辑提示词，确认后进入图片生成和人工审核。"
        steps={[
          {
            key: 'reference',
            title: '放入参考图',
            description: '只学习构图、光线、镜头和留白，不复制竞品元素。',
            state: hasReference ? 'done' : 'active',
          },
          {
            key: 'product',
            title: '补自己的产品资料',
            description: '卖点、禁用表达和目标人群必须来自用户资料。',
            state: hasProductContext ? 'done' : hasReference ? 'active' : 'idle',
          },
          {
            key: 'reverse',
            title: '反推图片提示词',
            description: '生成后自动进入工作台继续编辑和确认版本。',
            state: canGenerate ? 'active' : 'next',
          },
          {
            key: 'image',
            title: '图片生成和审核',
            description: '确认提示词后发送图片生成，再进入素材审核和入库。',
            state: 'next',
            module: 'image',
          },
        ]}
        actions={[
          { label: '导入参考图 / 视频', onClick: () => onImportInputSource('reference'), disabled: !workspaceReady || busy },
          { label: '登记产品资料', onClick: () => onRegisterManualInputSource({
            title: '对标图反推产品资料',
            purpose: 'product-brief',
            text: productBrief,
            tags: ['对标图反推', '产品资料'],
          }), disabled: !workspaceReady || busy || !productBrief.trim() },
          { label: '反推图片提示词', primary: true, onClick: runReverse, disabled: !canGenerate },
          { label: '继续修改提示词', onClick: onOpenPromptWorkbench },
        ]}
        onSelectModule={onSelectModule}
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
              <h3>生成图片提示词草稿</h3>
            </div>
          </div>
          <label className="reference-brief-field">
            <span>反推意图</span>
            <textarea value={userIntent} onChange={(event) => setUserIntent(event.target.value)} />
          </label>
          <div className="reference-boundary-box">
            <strong>边界</strong>
            <p>这里必须走真实视觉理解服务；未配置时显示待配置，不用普通文字模板伪造“看过图”。参考图只复用构图、光线、镜头和留白，不复制竞品 Logo、包装、文案或可识别元素。</p>
          </div>
          <div className="workflow-actions left">
            <button
              className="primary small"
              disabled={!canGenerate}
              onClick={runReverse}
            >
              反推图片 Prompt
            </button>
            <button className="ghost small" onClick={onOpenPromptWorkbench}>
              继续修改提示词
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}
