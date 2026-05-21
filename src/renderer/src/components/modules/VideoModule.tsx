import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import type { MediaGenerationResult, SceneCard, VideoBreakdownResult, VideoScriptGenerationResult } from '../../../../shared/types';
import { VIDEO_DIMENSIONS } from '../../app/constants';
import { fileNameFromPath, statusLabel } from '../../app/formatters';

type VideoStage = 'breakdown' | 'script' | 'generate';

interface VideoModuleProps {
  initialStage?: VideoStage;
  busy: boolean;
  workspaceReady: boolean;
  productImageRefs: string[];
  referenceImageRefs: string[];
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
  onSelectProductImages: () => void;
  onSelectReferenceImages: () => void;
  onSelectVideo: () => void;
  onAnalyzeReferenceVideo: () => void;
  onGenerateVideoScript: () => void;
  onGenerateVideo: () => void;
}

export function VideoModule({
  initialStage = 'breakdown',
  busy,
  workspaceReady,
  productImageRefs,
  referenceImageRefs,
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
  onSelectProductImages,
  onSelectReferenceImages,
  onSelectVideo,
  onAnalyzeReferenceVideo,
  onGenerateVideoScript,
  onGenerateVideo,
}: VideoModuleProps) {
  const [activeStage, setActiveStage] = useState<VideoStage>(initialStage);
  const sourceCount = videoAssetRefs.length + (videoUrl.trim() ? 1 : 0);
  const imageMaterialRefs = useMemo(
    () => [...productImageRefs, ...referenceImageRefs],
    [productImageRefs, referenceImageRefs],
  );
  const storyboardShots = videoScript?.storyboard ?? [];
  const hasVideoMaterial = imageMaterialRefs.length > 0 || videoAssetRefs.length > 0;

  useEffect(() => {
    setActiveStage(initialStage);
  }, [initialStage]);

  return (
    <section className="video-replica-workbench">
      <header className="video-replica-header">
        <div>
          <p className="eyebrow">视频素材</p>
          <h3>视频复刻引擎</h3>
          <p>导入高价值视频并逐步解析，替换为新产品后生成脚本、分镜图和视频队列。</p>
        </div>
        <span className="status-pill">三步流</span>
      </header>

      <nav className="video-stage-tabs" aria-label="视频复刻步骤">
        {[
          { key: 'breakdown' as const, title: '视频拆解', text: '导入高价值视频并逐秒解析' },
          { key: 'script' as const, title: '脚本生成', text: '替换为新产品并生成复刻脚本' },
          { key: 'generate' as const, title: '视频生成', text: '分镜图与视频模型生成队列' },
        ].map((stage) => (
          <button
            key={stage.key}
            className={activeStage === stage.key ? 'active' : ''}
            onClick={() => setActiveStage(stage.key)}
          >
            <strong>{stage.title}</strong>
            <span>{stage.text}</span>
          </button>
        ))}
      </nav>

      {activeStage === 'breakdown' ? (
        <div className="video-stage-layout breakdown">
          <article className="video-card video-source-card">
            <div className="video-card-title">
              <div>
                <h4>原视频导入</h4>
                <p>前端只负责配置和展示，真实拆解由后端视频理解服务完成。</p>
              </div>
              <span>{sourceCount} 个来源</span>
            </div>
            <button className="video-drop-zone" onClick={onSelectVideo}>
              <span>⇧</span>
              <strong>上传本地视频</strong>
              <small>MP4 / MOV / WEBM，直接交给多模态模型拆解</small>
            </button>
            {videoAssetRefs.length ? (
              <div className="video-file-list">
                {videoAssetRefs.map((ref) => (
                  <b key={ref}>{fileNameFromPath(ref)}</b>
                ))}
              </div>
            ) : null}
            <label>
              <span>视频链接</span>
              <div className="video-inline-field">
                <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="粘贴抖音链接、点击下载按钮" />
                <button className="ghost small" disabled={!videoUrl.trim()}>下载</button>
              </div>
            </label>
            <div className="video-mode-card">
              <strong>后端任务模式</strong>
              <p>单次生成会提交一个视频拆解任务；批量生成后续按文件夹或多视频创建队列。</p>
            </div>
          </article>

          <article className="video-card video-breakdown-card">
            <div className="video-card-title">
              <div>
                <h4>片段拆解结果</h4>
                <p>默认折叠展示，点击片段可展开查看勾选项分析。</p>
              </div>
              <div className="video-card-actions">
                <span>{selectedVideoDimensions.length}/{VIDEO_DIMENSIONS.length}</span>
                <button
                  className="ghost small"
                  onClick={() => VIDEO_DIMENSIONS.forEach((dimension) => {
                    if (!selectedVideoDimensions.includes(dimension)) toggleVideoDimension(dimension);
                  })}
                >
                  全选
                </button>
              </div>
            </div>
            <div className="video-dimension-grid">
              {VIDEO_DIMENSIONS.map((dimension) => (
                <button
                  key={dimension}
                  className={selectedVideoDimensions.includes(dimension) ? 'active' : ''}
                  onClick={() => toggleVideoDimension(dimension)}
                >
                  <strong>{dimension}</strong>
                  <span>{dimension.slice(0, 4)}...</span>
                  <em />
                </button>
              ))}
            </div>
            <div className="video-summary-row">
              <span><strong>当前拆解模式</strong>{selectedVideoDimensions.length ? '智能拆解' : '未选择维度'}</span>
              <span><strong>抽帧设置</strong>智能抽帧</span>
              <span><strong>返回片段数</strong>{videoBreakdown?.segments.length ?? 0} 个片段</span>
            </div>
            <button className="primary wide" disabled={busy || !workspaceReady} onClick={onAnalyzeReferenceVideo}>智能拆解</button>
          </article>
        </div>
      ) : null}

      {activeStage === 'script' ? (
        <div className="video-stage-layout script">
          <article className="video-card video-product-card">
            <div className="video-card-title">
              <div>
                <h4>新产品信息</h4>
                <p>基于原视频结构生成新脚本。</p>
              </div>
            </div>
            <div className="video-form-grid">
              <label><span>产品名称</span><input value={videoProductName} onChange={(event) => setVideoProductName(event.target.value)} placeholder="填写产品名称" /></label>
              <label>
                <span>场景背景</span>
                <select value={videoSceneBackground} onChange={(event) => setVideoSceneBackground(event.target.value)}>
                  <option value="智能场景">智能场景</option>
                  <option value="居家场景">居家场景</option>
                  <option value="户外场景">户外场景</option>
                  <option value="电商直播">电商直播</option>
                </select>
              </label>
              <label>
                <span>字幕选择</span>
                <select value={videoSubtitleMode} onChange={(event) => setVideoSubtitleMode(event.target.value)}>
                  <option value="burned-subtitle">内嵌字幕</option>
                  <option value="caption-file">输出字幕文件</option>
                  <option value="no-subtitle">无字幕</option>
                </select>
              </label>
              <label><span>视频语音</span><input value={videoVoiceStyle} onChange={(event) => setVideoVoiceStyle(event.target.value)} placeholder="自然可信 / 种草感 / 专业讲解" /></label>
            </div>
            <label><span>自定义需求</span><textarea value={videoCustomRequirement} onChange={(event) => setVideoCustomRequirement(event.target.value)} placeholder="填写额外要求，例如：更偏小红书种草、口播更自然、突出轻奢感、不要强促销" /></label>
            <div className="video-upload-callout">
              <div>
                <strong>上传产品图</strong>
                <label className="video-check"><input type="checkbox" readOnly checked={imageMaterialRefs.length > 0} /> 参考产品图背景</label>
              </div>
              <button className="ghost small" onClick={onSelectProductImages}>选择图片</button>
            </div>
          </article>

          <article className="video-card video-script-card">
            <div className="video-script-toolbar">
              <h4>新视频脚本</h4>
              <label><span>镜头</span><input type="number" min={1} max={12} value={videoShotCount} onChange={(event) => setVideoShotCount(Math.min(12, Math.max(1, Number(event.target.value) || 1)))} /></label>
              <label><span>时间</span><input type="number" min={5} max={90} value={videoDurationSeconds} onChange={(event) => setVideoDurationSeconds(Math.min(90, Math.max(5, Number(event.target.value) || 5)))} /></label>
            </div>
            <div className="video-script-preview">
              <article>
                <strong>{videoScript?.title || '新视频脚本内容'}</strong>
                <span>{videoScript ? '已生成' : '待生成'}</span>
                <p>{videoScript?.script || '等待生成新视频脚本'}</p>
              </article>
              <div className="video-placeholder">
                <strong>{videoScript ? '分镜脚本已生成' : '等待生成新视频脚本'}</strong>
                <p>选择镜头数量和脚本时间后，点击左侧生成脚本。</p>
              </div>
              <div className="video-placeholder">
                <strong>{storyboardShots.length ? `${storyboardShots.length} 个分镜已就绪` : '等待分镜图生成'}</strong>
                <p>生成脚本后，这里会展示分镜预览和镜头节奏。</p>
              </div>
            </div>
            <button className="primary wide" disabled={busy || !workspaceReady} onClick={onGenerateVideoScript}>生成复刻脚本</button>
          </article>
        </div>
      ) : null}

      {activeStage === 'generate' ? (
        <div className="video-stage-layout generate">
          <article className="video-card video-material-card">
            <div className="video-card-title">
              <div>
                <h4>生成视频使用的图片</h4>
                <p>分镜图、上传图片、上传视频都会作为本次视频生成参考素材。</p>
              </div>
              <div className="video-card-actions">
                <button className="ghost small" onClick={onSelectReferenceImages}>上传图片</button>
                <button className="ghost small" onClick={onSelectVideo}>上传视频</button>
              </div>
            </div>
            <div className="video-material-list">
              {hasVideoMaterial ? (
                [...imageMaterialRefs, ...videoAssetRefs].map((ref) => (
                  <span key={ref}>{fileNameFromPath(ref)}</span>
                ))
              ) : (
                <div className="video-placeholder">
                  <strong>暂无参考素材</strong>
                  <p>请先生分镜图，或上传图片/视频。</p>
                </div>
              )}
            </div>
          </article>

          <article className="video-card video-history-card">
            <div className="video-card-title">
              <div>
                <h4>生成视频历史</h4>
                <p>配置真实视频接口后，生成结果会显示在这里；未配置时只保留可追溯的 blocked 记录。</p>
              </div>
            </div>
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
            ) : (
              <div className="video-placeholder tall">暂无视频生成历史</div>
            )}
          </article>

          <article className="video-card video-prompt-card">
            <div className="video-card-title">
              <div>
                <h4>视频提示词</h4>
                <p>生成视频时会使用当前分镜图和这里的视频提示词。</p>
              </div>
            </div>
            <pre>{suggestedVideoPrompt}</pre>
            {videoBreakdown ? <div className="script-block"><strong>拆解片段</strong>{videoBreakdown.segments.map((segment) => <p key={segment.timeRange}>{segment.timeRange} · {segment.hook} · {segment.reusablePoint}</p>)}</div> : null}
            {videoScript ? <div className="script-block"><strong>分镜脚本</strong><pre>{videoScript.script}</pre></div> : null}
            <button className="primary wide" disabled={busy || !workspaceReady} onClick={onGenerateVideo}>生成视频队列</button>
          </article>
        </div>
      ) : null}
    </section>
  );
}
