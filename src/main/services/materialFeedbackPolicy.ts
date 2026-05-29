import type { AssetReviewRecord, ContentKnowledgeMapRecord } from '../../shared/types';

export function validateMaterialFeedbackInput(input: {
  map?: ContentKnowledgeMapRecord;
  reviewedAssets: AssetReviewRecord[];
  approvedAssets: AssetReviewRecord[];
}): string[] {
  return [
    input.map ? '' : '缺少内容知识地图，不能回写素材覆盖。',
    input.reviewedAssets.length ? '' : '还没有素材审核记录。',
    input.approvedAssets.length ? '' : '没有已通过审核的素材，不能回写覆盖。',
  ].filter(Boolean);
}
