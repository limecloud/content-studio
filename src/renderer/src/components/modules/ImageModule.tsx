import type { Dispatch, SetStateAction } from 'react';
import type { ImageGenerationRequest, MediaGenerationResult, PromptPack, SceneCard } from '../../../../shared/types';
import { IMAGE_GENERATION_MODE_OPTIONS, IMAGE_PROMPT_MODE_OPTIONS, IMAGE_TEMPLATE_OPTIONS } from '../../app/constants';
import { fileNameFromPath, statusLabel } from '../../app/formatters';

interface ImageModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  productImageRefs: string[];
  referenceImageRefs: string[];
  suggestedImagePrompt: string;
  setImagePromptDraft: Dispatch<SetStateAction<string>>;
  imagePromptMode: ImageGenerationRequest['promptMode'];
  setImagePromptMode: Dispatch<SetStateAction<ImageGenerationRequest['promptMode']>>;
  imageGenerationMode: ImageGenerationRequest['generationMode'];
  setImageGenerationMode: Dispatch<SetStateAction<ImageGenerationRequest['generationMode']>>;
  imageTemplate: string;
  setImageTemplate: Dispatch<SetStateAction<string>>;
  imageWatermark: boolean;
  setImageWatermark: Dispatch<SetStateAction<boolean>>;
  sceneCards: SceneCard[];
  selectedSceneIds: string[];
  setSelectedSceneIds: Dispatch<SetStateAction<string[]>>;
  activePromptPack?: PromptPack;
  mediaResult: MediaGenerationResult | null;
  onRevealPath: (path: string) => void;
  onExportAsset: (path: string) => void;
  onSelectProductImages: () => void;
  onSelectReferenceImages: () => void;
  onGenerateImage: () => void;
  onGenerateSceneCards: () => void;
}

export function ImageModule({
  busy,
  workspaceReady,
  productImageRefs,
  referenceImageRefs,
  suggestedImagePrompt,
  setImagePromptDraft,
  imagePromptMode,
  setImagePromptMode,
  imageGenerationMode,
  setImageGenerationMode,
  imageTemplate,
  setImageTemplate,
  imageWatermark,
  setImageWatermark,
  sceneCards,
  selectedSceneIds,
  setSelectedSceneIds,
  activePromptPack,
  mediaResult,
  onRevealPath,
  onExportAsset,
  onSelectProductImages,
  onSelectReferenceImages,
  onGenerateImage,
  onGenerateSceneCards,
}: ImageModuleProps) {
  return (
    <section className="module-grid two-col">
      <article className="panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Image Engine</p>
            <h3>图片引擎</h3>
          </div>
          <span className="status-pill">{IMAGE_GENERATION_MODE_OPTIONS.find((option) => option.value === imageGenerationMode)?.label ?? '智能生成'}</span>
        </div>
        <div className="upload-grid">
          <button className="upload-card" onClick={onSelectProductImages}>
            <span>+</span><strong>产品图上传</strong><p>{productImageRefs.length}/10，参与生成 payload</p>
          </button>
          <button className="upload-card" onClick={onSelectReferenceImages}>
            <span>↗</span><strong>参考图上传</strong><p>{referenceImageRefs.length}/6，参与风格迁移</p>
          </button>
        </div>
        <div className="filter-block">
          <span>提示词模式</span>
          <div className="chip-row tight">
            {IMAGE_PROMPT_MODE_OPTIONS.map((option) => (
              <button key={option.value} className={`chip-button ${imagePromptMode === option.value ? 'active' : ''}`} onClick={() => setImagePromptMode(option.value)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-block">
          <span>生成模式</span>
          <div className="chip-row tight">
            {IMAGE_GENERATION_MODE_OPTIONS.map((option) => (
              <button key={option.value} className={`chip-button ${imageGenerationMode === option.value ? 'active' : ''}`} onClick={() => setImageGenerationMode(option.value)}>
                {option.label}
              </button>
            ))}
            <button className={`chip-button ${imageWatermark ? 'active' : ''}`} onClick={() => setImageWatermark((current) => !current)}>水印</button>
          </div>
        </div>
        <div className="filter-block">
          <span>图片模板</span>
          <div className="chip-row tight">
            {IMAGE_TEMPLATE_OPTIONS.map((template) => (
              <button key={template} className={`chip-button ${imageTemplate === template ? 'active' : ''}`} onClick={() => setImageTemplate(template)}>
                {template}
              </button>
            ))}
          </div>
        </div>
        <label className="field-label">图片提示词</label>
        <textarea value={suggestedImagePrompt} onChange={(event) => setImagePromptDraft(event.target.value)} />
        <div className="asset-ref-row">
          {[...productImageRefs, ...referenceImageRefs].slice(0, 4).map((ref) => <span key={ref}>{ref.split('/').pop()}</span>)}
        </div>
        <button className="primary wide" disabled={busy || !workspaceReady} onClick={onGenerateImage}>启动渲染引擎</button>
      </article>

      <article className="panel preview-panel">
        <div className="panel-title">
          <div>
            <p className="eyebrow">Preview</p>
            <h3>素材预览 / 生成日志</h3>
          </div>
          <button className="ghost small" onClick={onGenerateSceneCards} disabled={!activePromptPack || busy}>生成场景库</button>
        </div>
        <div className="preview-grid">
          {sceneCards.slice(0, 4).map((scene) => (
            <button key={scene.id} className={`scene-tile ${selectedSceneIds.includes(scene.id) ? 'active' : ''}`} onClick={() => setSelectedSceneIds((current) => current.includes(scene.id) ? current.filter((id) => id !== scene.id) : [...current, scene.id])}>
              <strong>{scene.title}</strong>
              <p>{scene.visualComposition}</p>
            </button>
          ))}
          {sceneCards.length === 0 ? <div className="empty-state">生成场景库后，这里会显示可用于图片和视频的场景卡。</div> : null}
        </div>
        {mediaResult ? (
          <div className={`result-card ${mediaResult.status}`}>
            <strong>{statusLabel(mediaResult.status)}</strong>
            <p>{mediaResult.message}</p>
            <small>logId: {mediaResult.logId}</small>
            {mediaResult.assetRefs.length ? (
              <div className="asset-output-grid">
                {mediaResult.assetRefs.map((assetRef) => (
                  <article key={assetRef} className="asset-output-card">
                    <span>本地产物</span>
                    <strong>{fileNameFromPath(assetRef)}</strong>
                    <small>可打开位置或导出副本</small>
                    <div className="log-actions">
                      <button className="ghost small" onClick={() => onRevealPath(assetRef)}>打开位置</button>
                      <button className="primary small" onClick={() => onExportAsset(assetRef)}>导出</button>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </article>
    </section>
  );
}
