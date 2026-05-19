import { useMemo, useState } from 'react';
import type { GenerationLogEntry } from '../../../../shared/types';
import {
  extractLocalRefsFromLog,
  extractPromptFromLog,
  fileNameFromPath,
  formatDuration,
  kindLabel,
} from '../../app/formatters';

interface AssetsModuleProps {
  logsCount: number;
  logs: GenerationLogEntry[];
  copiedLogId: string | null;
  onCopyLogPrompt: (log: GenerationLogEntry) => void;
  onRevealLogPath: (log: GenerationLogEntry) => void;
  onReuseImageLogInput: (log: GenerationLogEntry) => void;
}

type AssetKind = 'image' | 'video';

interface AssetItem {
  id: string;
  kind: AssetKind;
  path: string;
  log: GenerationLogEntry;
}

function isImagePath(path: string): boolean {
  return /\.(png|jpe?g|webp|gif|avif)$/i.test(path);
}

function isVideoPath(path: string): boolean {
  return /\.(mp4|mov|webm|m4v)$/i.test(path);
}

function localAssetSource(assetRef: string): string {
  if (/^(https?:|data:image\/|blob:|local-asset:)/i.test(assetRef)) return assetRef;
  const normalized = assetRef.replace(/\\/g, '/');
  let absolutePath = normalized;
  if (/^[A-Za-z]:\//.test(normalized)) absolutePath = `/${normalized}`;
  else if (!normalized.startsWith('/')) absolutePath = `/${normalized}`;
  return `local-asset://${encodeURI(absolutePath).replace(/#/g, '%23')}`;
}

function collectAssets(logs: GenerationLogEntry[]): AssetItem[] {
  return logs.flatMap((log) => {
    if (log.status !== 'succeeded' || (log.kind !== 'image' && log.kind !== 'video')) return [];
    return extractLocalRefsFromLog(log)
      .filter((path) => isImagePath(path) || isVideoPath(path))
      .map((path, index) => ({
        id: `${log.id}:${index}:${path}`,
        kind: isVideoPath(path) ? 'video' : 'image',
        path,
        log,
      }));
  });
}

export function AssetsModule({
  logsCount,
  logs,
  copiedLogId,
  onCopyLogPrompt,
  onRevealLogPath,
  onReuseImageLogInput,
}: AssetsModuleProps) {
  const [assetFilter, setAssetFilter] = useState<AssetKind | 'all'>('all');
  const [selectedAsset, setSelectedAsset] = useState<AssetItem | null>(null);
  const assets = useMemo(() => collectAssets(logs), [logs]);
  const visibleAssets = useMemo(
    () => assets.filter((asset) => assetFilter === 'all' || asset.kind === assetFilter),
    [assetFilter, assets],
  );
  const imageCount = assets.filter((asset) => asset.kind === 'image').length;
  const videoCount = assets.filter((asset) => asset.kind === 'video').length;

  return (
    <section className="panel full-panel asset-library-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">素材沉淀</p>
          <h3>素材库</h3>
        </div>
        <span className="status-pill">{assets.length} 个素材</span>
      </div>
      <div className="chip-row">
        {[
          { value: 'all' as const, label: `全部 ${assets.length}` },
          { value: 'image' as const, label: `图片 ${imageCount}` },
          { value: 'video' as const, label: `视频 ${videoCount}` },
        ].map((filter) => (
          <button
            key={filter.value}
            className={`chip-button ${assetFilter === filter.value ? 'active' : ''}`}
            onClick={() => setAssetFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>
      <div className="asset-gallery">
        {visibleAssets.map((asset) => (
          <article key={asset.id} className="asset-tile">
            <button className="asset-preview-button" onClick={() => setSelectedAsset(asset)}>
              {asset.kind === 'image'
                ? <img src={localAssetSource(asset.path)} alt={fileNameFromPath(asset.path)} />
                : <video src={localAssetSource(asset.path)} muted playsInline preload="metadata" />}
            </button>
            <div className="asset-tile-meta">
              <strong>{fileNameFromPath(asset.path)}</strong>
              <small>{kindLabel(asset.log.kind)} · {asset.log.model ?? 'local'} · {formatDuration(asset.log.durationMs)}</small>
            </div>
            <div className="log-actions">
              <button className="ghost small" onClick={() => setSelectedAsset(asset)}>详情</button>
              <button className="ghost small" onClick={() => onRevealLogPath(asset.log)}>打开位置</button>
              {asset.log.kind === 'image' ? (
                <button className="primary small" onClick={() => onReuseImageLogInput(asset.log)}>复用参数</button>
              ) : null}
            </div>
          </article>
        ))}
        {visibleAssets.length === 0 ? (
          <div className="empty-state">
            还没有可展示的成功图片或视频素材。失败、阻塞和纯日志不会进入素材库。
            {logsCount > 0 ? ` 当前已有 ${logsCount} 条生成记录。` : ''}
          </div>
        ) : null}
      </div>

      {selectedAsset ? (
        <div
          className="detail-dialog-backdrop"
          role="presentation"
          onClick={() => setSelectedAsset(null)}
        >
          <article
            className="detail-dialog-card asset-detail-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="素材详情"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="detail-dialog-header">
              <div>
                <p className="eyebrow">{selectedAsset.kind === 'image' ? '图片素材' : '视频素材'}</p>
                <h3>{fileNameFromPath(selectedAsset.path)}</h3>
              </div>
              <button className="ghost small" onClick={() => setSelectedAsset(null)}>关闭</button>
            </div>
            <div className="detail-dialog-body asset-detail-body">
              <div className="asset-detail-preview">
                {selectedAsset.kind === 'image'
                  ? <img src={localAssetSource(selectedAsset.path)} alt={fileNameFromPath(selectedAsset.path)} />
                  : <video src={localAssetSource(selectedAsset.path)} controls />}
              </div>
              <div className="asset-log-detail-grid">
                <span>
                  <strong>来源</strong>
                  <em>{selectedAsset.log.title}</em>
                </span>
                <span>
                  <strong>模型</strong>
                  <em>{selectedAsset.log.model ?? '未记录'}</em>
                </span>
                <span>
                  <strong>耗时</strong>
                  <em>{formatDuration(selectedAsset.log.durationMs)}</em>
                </span>
                <span>
                  <strong>生成时间</strong>
                  <em>{new Date(selectedAsset.log.createdAt).toLocaleString()}</em>
                </span>
                <span className="wide">
                  <strong>路径</strong>
                  <em>{selectedAsset.path}</em>
                </span>
              </div>
              <label className="image-result-prompt">
                <span>提示词</span>
                <textarea readOnly value={extractPromptFromLog(selectedAsset.log)} />
              </label>
              <div className="modal-actions">
                <button className="ghost" onClick={() => onCopyLogPrompt(selectedAsset.log)}>
                  {copiedLogId === selectedAsset.log.id ? '已复制' : '复制提示词'}
                </button>
                <button className="ghost" onClick={() => onRevealLogPath(selectedAsset.log)}>
                  打开位置
                </button>
                {selectedAsset.log.kind === 'image' ? (
                  <button
                    className="primary"
                    onClick={() => {
                      setSelectedAsset(null);
                      onReuseImageLogInput(selectedAsset.log);
                    }}
                  >
                    复用图片参数
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
