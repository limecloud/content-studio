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
  onOpenVideoPromptHandoff: () => void;
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
  onOpenVideoPromptHandoff,
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
          <h3>参考视频拆解工作台</h3>
          <p>导入已授权参考视频并拆解结构，再替换为本方产品脚本、分镜和可追溯视频 Prompt。</p>
        </div>
        <span className="status-pill">三步流</span>
      </header>

      <nav className="video-stage-tabs" aria-label="参考视频拆解步骤">
        {[
          { key: 'breakdown' as const, title: '视频拆解', text: '导入已授权视频并解析结构' },
          { key: 'script' as const, title: '脚本生成', text: '替换为本方产品并生成新脚本' },
          { key: 'generate' as const, title: 'Prompt 交接', text: '复制外部平台并手动导入成品' },
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
                <h4>参考视频导入</h4>
                <p>仅处理用户有权使用的参考视频；真实拆解由后端视频理解服务完成。</p>
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
                <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="粘贴已授权视频链接，仅作为来源记录" />
                <button className="ghost small" disabled>不下载</button>
              </div>
            </label>
            <div className="video-mode-card">
              <strong>处理边界</strong>
              <p>软件不下载平台视频、不复制竞品元素，只保存参考来源、拆解结果和可复用结构。</p>
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
                <p>基于拆解结构生成本方产品脚本，避免照搬参考视频画面。</p>
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
            <button className="primary wide" disabled={busy || !workspaceReady} onClick={onGenerateVideoScript}>生成新视频脚本</button>
          </article>
        </div>
      ) : null}

      {activeStage === 'generate' ? (
        <div className="video-stage-layout generate">
          <article className="video-card video-material-card">
            <div className="video-card-title">
              <div>
                <h4>视频 Prompt 使用的素材</h4>
                <p>分镜图、上传图片、参考视频都会随视频 Prompt 一起进入交接资料。</p>
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
                  <p>可先上传产品图、参考图或视频；也可以直接用脚本生成 Prompt。</p>
                </div>
              )}
            </div>
          </article>

          <article className="video-card video-history-card">
            <div className="video-card-title">
              <div>
                <h4>可选内部视频生成</h4>
                <p>这是高成本备选能力。普通用户主路径是复制视频 Prompt 到第三方平台，再手动导入成品。</p>
              </div>
            </div>
            {mediaResult ? (
              <div className={`result-card ${mediaResult.status}`}>
                <strong>{statusLabel(mediaResult.status)}</strong>
                <p>{mediaResult.message}</p>
                {mediaResult.billing ? (
                  <div className="video-cost-estimate">
                    <span>内部 API 成本估算</span>
                    <strong>{mediaResult.billing.currency === 'CNY' ? '¥' : `${mediaResult.billing.currency} `}{mediaResult.billing.estimatedCost.toFixed(2)}</strong>
                    <small>
                      {mediaResult.billing.durationSeconds}s × {mediaResult.billing.currency === 'CNY' ? '¥' : `${mediaResult.billing.currency} `}
                      {mediaResult.billing.unitPrice.toFixed(2)}/秒
                    </small>
                  </div>
                ) : null}
                {mediaResult.assetRefs.length ? (
                  <div className="asset-output-grid">
                    {mediaResult.assetRefs.map((assetRef) => (
                      <article key={assetRef} className="asset-output-card">
                        <span>内部生成产物</span>
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
              <div className="video-placeholder tall">暂无内部生成记录</div>
            )}
          </article>

          <article className="video-card video-prompt-card">
            <div className="video-card-title">
              <div>
                <h4>视频 Prompt 交接</h4>
                <p>打开交接后可复制到第三方视频平台；软件只记录 Prompt、复制动作和手动导入的成品视频。</p>
              </div>
            </div>
            <pre>{suggestedVideoPrompt}</pre>
            {videoBreakdown ? <div className="script-block"><strong>拆解片段</strong>{videoBreakdown.segments.map((segment) => <p key={segment.timeRange}>{segment.timeRange} · {segment.hook} · {segment.reusablePoint}</p>)}</div> : null}
            {videoScript ? <div className="script-block"><strong>分镜脚本</strong><pre>{videoScript.script}</pre></div> : null}
            <div className="video-handoff-actions">
              <button className="primary wide" disabled={busy || !workspaceReady} onClick={onOpenVideoPromptHandoff}>打开视频 Prompt 交接</button>
              <button className="ghost wide" disabled={busy || !workspaceReady} onClick={onGenerateVideo}>可选：内部视频生成</button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
