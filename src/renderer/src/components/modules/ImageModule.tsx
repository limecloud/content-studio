import type { Dispatch, SetStateAction } from 'react';
import type { MediaGenerationResult, PromptPack, SceneCard } from '../../../../shared/types';
import { statusLabel } from '../../app/formatters';

interface ImageModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  productImageRefs: string[];
  referenceImageRefs: string[];
  suggestedImagePrompt: string;
  setImagePromptDraft: Dispatch<SetStateAction<string>>;
  sceneCards: SceneCard[];
  selectedSceneIds: string[];
  setSelectedSceneIds: Dispatch<SetStateAction<string[]>>;
  activePromptPack?: PromptPack;
  mediaResult: MediaGenerationResult | null;
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
  sceneCards,
  selectedSceneIds,
  setSelectedSceneIds,
  activePromptPack,
  mediaResult,
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
          <span className="status-pill">智能生成</span>
        </div>
        <div className="upload-grid">
          <button className="upload-card" onClick={onSelectProductImages}>
            <span>+</span><strong>产品图上传</strong><p>{productImageRefs.length}/10，参与生成 payload</p>
          </button>
          <button className="upload-card" onClick={onSelectReferenceImages}>
            <span>↗</span><strong>参考图上传</strong><p>{referenceImageRefs.length}/6，参与风格迁移</p>
          </button>
        </div>
        <div className="chip-row">
          {['自由模式', '预设提示词', '电商白底主图', '海报图', '场景图', '买家秀图'].map((item) => <span key={item} className="chip">{item}</span>)}
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
        {mediaResult ? <div className={`result-card ${mediaResult.status}`}><strong>{statusLabel(mediaResult.status)}</strong><p>{mediaResult.message}</p><small>logId: {mediaResult.logId}</small></div> : null}
      </article>
    </section>
  );
}
