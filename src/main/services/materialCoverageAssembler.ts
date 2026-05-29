import type {
  AssetReviewRecord,
  ContentKnowledgeMapMaterialStatus,
  ContentKnowledgeMapMatrixRow,
} from '../../shared/types';

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function hasTextMatch(asset: AssetReviewRecord, row: ContentKnowledgeMapMatrixRow): boolean {
  const haystack = normalize([asset.title, asset.note, ...asset.tags].filter(Boolean).join(' '));
  const rowTitle = normalize(row.title);
  if (rowTitle && haystack.includes(rowTitle)) return true;
  return row.tags.some((tag) => {
    const normalizedTag = normalize(tag);
    return normalizedTag.length >= 2 && haystack.includes(normalizedTag);
  });
}

function hasSourceMatch(asset: AssetReviewRecord, row: ContentKnowledgeMapMatrixRow): boolean {
  if (!asset.sourceId) return false;
  return row.sourceRefs.some((ref) => ref.endsWith(`:${asset.sourceId}`) || ref === asset.sourceId);
}

function hasExplicitCoverageTag(asset: AssetReviewRecord, row: ContentKnowledgeMapMatrixRow): boolean {
  return asset.tags.some((tag) => tag === `coverage:${row.id}` || tag === `row:${row.id}`);
}

function performanceTags(asset: AssetReviewRecord): string[] {
  return asset.tags.filter((tag) => /高转化|高收藏|高完播|高复用|表现好|复用/.test(tag));
}

export function matchedAssetsForRow(row: ContentKnowledgeMapMatrixRow, assets: AssetReviewRecord[]): AssetReviewRecord[] {
  return assets.filter((asset) => hasExplicitCoverageTag(asset, row) || hasSourceMatch(asset, row) || hasTextMatch(asset, row));
}

export function materialStatusForAssets(assets: AssetReviewRecord[]): ContentKnowledgeMapMaterialStatus {
  if (assets.some((asset) => asset.status === 'approved')) return 'approved';
  if (assets.some((asset) => asset.status === 'rejected')) return 'rejected';
  return assets.length ? 'covered' : 'missing';
}

export function performanceTagsForAssets(assets: AssetReviewRecord[]): string[] {
  return Array.from(new Set(assets.flatMap(performanceTags))).slice(0, 8);
}
