import { randomUUID } from 'node:crypto';
import type {
  AssetReviewRecord,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentMaterialCoverageUpdate,
  ContentReviewTask,
} from '../../shared/types';

function rowMap(map: ContentKnowledgeMapRecord): Map<string, ContentKnowledgeMapMatrixRow> {
  return new Map(
    [...map.sellingPoints, ...map.painPoints, ...map.scenarios].map((row) => [row.id, row]),
  );
}

function targetLabel(targetType: ContentMaterialCoverageUpdate['targetType']): string {
  if (targetType === 'selling-point') return '卖点';
  if (targetType === 'pain-point') return '痛点';
  return '场景';
}

function sourceRefForAsset(asset: AssetReviewRecord): string {
  if (asset.sourceId) return `${asset.sourceType}:${asset.sourceId}`;
  return `asset-review:${asset.id}`;
}

function summarizeAssets(assets: AssetReviewRecord[]): string {
  return assets
    .slice(0, 3)
    .map((asset) => {
      const note = asset.note?.trim();
      return note ? `${asset.title}（${note}）` : asset.title;
    })
    .join('、');
}

export function buildMaterialSupplementReviewTasks(input: {
  workspacePath: string;
  map: ContentKnowledgeMapRecord;
  updates: ContentMaterialCoverageUpdate[];
  approvedAssets: AssetReviewRecord[];
}): ContentReviewTask[] {
  const now = new Date().toISOString();
  const rows = rowMap(input.map);
  const assetsById = new Map(input.approvedAssets.map((asset) => [asset.id, asset]));
  return input.updates.flatMap((update) => {
    const row = rows.get(update.rowId);
    const matchedAssets = update.assetReviewIds
      .map((assetId) => assetsById.get(assetId))
      .filter((asset): asset is AssetReviewRecord => Boolean(asset));
    if (!row || !matchedAssets.length) return [];
    const sourceRefs = Array.from(new Set(matchedAssets.map(sourceRefForAsset)));
    const evidenceRefs = matchedAssets.map((asset) => `asset-review:${asset.id}`);
    const label = targetLabel(update.targetType);
    const assetSummary = summarizeAssets(matchedAssets);
    return [{
      id: randomUUID(),
      workspacePath: input.workspacePath,
      sourceKnowledgeMapId: input.map.id,
      sourceKnowledgeMapTitle: input.map.title,
      targetType: 'evidence',
      targetId: `material-supplement:${input.map.id}:${update.targetType}:${update.rowId}`,
      title: `补充素材证据：${row.title}`,
      summary: `已通过素材「${assetSummary}」可作为${label}「${row.title}」的补充依据，请确认是否纳入证据、规则或素材标签；不会自动改写主文案。`,
      evidenceRefs,
      sourceRefs,
      risk: 'low',
      status: 'open',
      suggestedAction: 'approve',
      issueLabels: ['素材补充', '待确认', '不改主文案'],
      decisions: [],
      createdAt: now,
      updatedAt: now,
    }];
  });
}
