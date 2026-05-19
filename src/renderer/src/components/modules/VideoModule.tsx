import type { Dispatch, SetStateAction } from 'react';
import type { MediaGenerationResult, SceneCard, VideoBreakdownResult, VideoScriptGenerationResult } from '../../../../shared/types';
import { VIDEO_DIMENSIONS } from '../../app/constants';
import { fileNameFromPath, statusLabel } from '../../app/formatters';

interface VideoModuleProps {
  busy: boolean;
  workspaceReady: boolean;
  videoUrl: string;
  setVideoUrl: Dispatch<SetStateAction<string>>;
  videoProductName: string;
  setVideoProductName: Dispatch<SetStateAction<string>>;
  videoSceneBackground: string;
  setVideoSceneBackground: Dispatch<SetStateAction<string>>;
  videoSubtitleMode: string;
  setVideoSubtitleMode: Dispatch<SetStateAction<string>>;
  videoVoiceStyle: string;
  setVideoVoiceStyle: Dispatch<SetStateAction<string>>;
  videoShotCount: number;
  setVideoShotCount: Dispatch<SetStateAction<number>>;
  videoDurationSeconds: number;
  setVideoDurationSeconds: Dispatch<SetStateAction<number>>;
  videoCustomRequirement: string;
  setVideoCustomRequirement: Dispatch<SetStateAction<string>>;
  videoAssetRefs: string[];
  selectedVideoDimensions: string[];
  toggleVideoDimension: (dimension: string) => void;
  videoBreakdown: VideoBreakdownResult | null;
  videoScript: VideoScriptGenerationResult | null;
  activeScenes: SceneCard[];
  suggestedVideoPrompt: string;
  mediaResult: MediaGenerationResult | null;
  onRevealPath: (path: string) => void;
  onExportAsset: (path: string) => void;
  onSelectVideo: () => void;
  onAnalyzeReferenceVideo: () => void;
  onGenerateVideoScript: () => void;
  onGenerateVideo: () => void;
}

export function VideoModule({
  busy,
  workspaceReady,
  videoUrl,
  setVideoUrl,
  videoProductName,
  setVideoProductName,
  videoSceneBackground,
  setVideoSceneBackground,
  videoSubtitleMode,
  setVideoSubtitleMode,
  videoVoiceStyle,
  setVideoVoiceStyle,
  videoShotCount,
  setVideoShotCount,
  videoDurationSeconds,
  setVideoDurationSeconds,
  videoCustomRequirement,
  setVideoCustomRequirement,
  videoAssetRefs,
  selectedVideoDimensions,
  toggleVideoDimension,
  videoBreakdown,
  videoScript,
  activeScenes,
  suggestedVideoPrompt,
  mediaResult,
  onRevealPath,
  onExportAsset,
  onSelectVideo,
  onAnalyzeReferenceVideo,
  onGenerateVideoScript,
  onGenerateVideo,
}: VideoModuleProps) {
  return (
    <section className="module-grid two-col">
      <article className="panel">
        <div className="panel-title"><div><p className="eyebrow">Video Engine</p><h3>视频复刻引擎</h3></div><span className="status-pill">三步流</span></div>
        <div className="form-grid">
          <label><span>参考视频链接</span><input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="可粘贴视频链接，或选择本地视频" /></label>
          <label><span>新产品名称</span><input value={videoProductName} onChange={(event) => setVideoProductName(event.target.value)} /></label>
          <label><span>场景背景</span><input value={videoSceneBackground} onChange={(event) => setVideoSceneBackground(event.target.value)} /></label>
          <label>
            <span>字幕选择</span>
            <select value={videoSubtitleMode} onChange={(event) => setVideoSubtitleMode(event.target.value)}>
              <option value="burned-subtitle">内嵌字幕</option>
              <option value="caption-file">输出字幕文件</option>
              <option value="no-subtitle">无字幕</option>
            </select>
          </label>
          <label><span>视频语音</span><input value={videoVoiceStyle} onChange={(event) => setVideoVoiceStyle(event.target.value)} placeholder="自然可信 / 种草感 / 专业讲解" /></label>
          <label><span>镜头数</span><input type="number" min={1} max={12} value={videoShotCount} onChange={(event) => setVideoShotCount(Math.min(12, Math.max(1, Number(event.target.value) || 1)))} /></label>
          <label><span>视频时长（秒）</span><input type="number" min={5} max={90} value={videoDurationSeconds} onChange={(event) => setVideoDurationSeconds(Math.min(90, Math.max(5, Number(event.target.value) || 5)))} /></label>
          <label><span>自定义需求</span><input value={videoCustomRequirement} onChange={(event) => setVideoCustomRequirement(event.target.value)} /></label>
        </div>
        <div className="header-actions inline-actions">
          <button className="ghost small" onClick={onSelectVideo}>选择本地视频 · {videoAssetRefs.length}</button>
          <button className="primary small" disabled={busy || !workspaceReady} onClick={onAnalyzeReferenceVideo}>真实拆解</button>
          <button className="primary small" disabled={busy || !workspaceReady} onClick={onGenerateVideoScript}>生成脚本</button>
        </div>
        <p className="helper-text">真实拆解需要视频理解 Provider；视频生成可走 Generic HTTP Provider，未配置时只保存 blocked 队列文件。</p>
        <div className="chip-row dimension-row">
          {VIDEO_DIMENSIONS.map((dimension) => (
            <button key={dimension} className={`chip-button ${selectedVideoDimensions.includes(dimension) ? 'active' : ''}`} onClick={() => toggleVideoDimension(dimension)}>
              {dimension}
            </button>
          ))}
        </div>
        <div className="step-list">
          <article><span>01</span><strong>视频拆解</strong><p>{videoBreakdown?.summary || '导入参考视频，拆解钩子、节奏、字幕和镜头。'}</p></article>
          <article><span>02</span><strong>脚本生成</strong><p>{videoScript?.title || activeScenes[0]?.voiceoverDirection || '基于场景卡和知识引用生成新产品脚本。'}</p></article>
          <article><span>03</span><strong>视频生成</strong><p>{videoScript?.videoPrompt || activeScenes[0]?.videoMaterialSuggestion || '图片素材 + 视频提示词进入生成队列。'}</p></article>
        </div>
        <button className="primary wide" disabled={busy || !workspaceReady} onClick={onGenerateVideo}>生成视频队列</button>
      </article>
      <article className="panel terminal-panel">
        <p className="eyebrow">Video Prompt</p>
        <pre>{suggestedVideoPrompt}</pre>
        {videoBreakdown ? <div className="script-block"><strong>拆解片段</strong>{videoBreakdown.segments.map((segment) => <p key={segment.timeRange}>{segment.timeRange} · {segment.hook} · {segment.reusablePoint}</p>)}</div> : null}
        {videoScript ? <div className="script-block"><strong>分镜脚本</strong><pre>{videoScript.script}</pre></div> : null}
        {mediaResult ? (
          <div className={`result-card ${mediaResult.status}`}>
            <strong>{statusLabel(mediaResult.status)}</strong>
            <p>{mediaResult.message}</p>
            {mediaResult.assetRefs.length ? (
              <div className="asset-output-grid">
                {mediaResult.assetRefs.map((assetRef) => (
                  <article key={assetRef} className="asset-output-card">
                    <span>队列产物</span>
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
