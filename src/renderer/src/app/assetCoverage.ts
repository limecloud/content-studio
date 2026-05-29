import type {
  ContentKnowledgeMapMaterialStatus,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentKnowledgeMapRowStatus,
} from '../../../shared/types';

export type AssetCoverageTargetType = 'selling-point' | 'pain-point' | 'scenario';

export interface AssetCoverageLink {
  id: string;
  contentKnowledgeMapId: string;
  contentKnowledgeMapTitle: string;
  rowId: string;
  rowTitle: string;
  rowSummary: string;
  targetType: AssetCoverageTargetType;
  targetLabel: string;
  rowStatus: ContentKnowledgeMapRowStatus;
  materialStatus?: ContentKnowledgeMapMaterialStatus;
  evidenceCount: number;
  sourceCount: number;
  performanceTags: string[];
}

const TARGET_LABELS: Record<AssetCoverageTargetType, string> = {
  'selling-point': '卖点组合',
  'pain-point': '痛点组合',
  scenario: '场景组合',
};

const MATERIAL_STATUS_LABELS: Record<ContentKnowledgeMapMaterialStatus, string> = {
  missing: '缺素材',
  covered: '已覆盖',
  approved: '素材已通过',
  rejected: '素材已驳回',
};

const ROW_STATUS_LABELS: Record<ContentKnowledgeMapRowStatus, string> = {
  ready: '可交接',
  'needs-evidence': '缺证据',
  'needs-review': '待审核',
};

function addCoverageRows(input: {
  index: Map<string, AssetCoverageLink[]>;
  map: ContentKnowledgeMapRecord;
  targetType: AssetCoverageTargetType;
  rows: ContentKnowledgeMapMatrixRow[];
}): void {
  input.rows.forEach((row) => {
    if (!row.materialRefs?.length) return;
    const link: AssetCoverageLink = {
      id: `${input.map.id}:${input.targetType}:${row.id}`,
      contentKnowledgeMapId: input.map.id,
      contentKnowledgeMapTitle: input.map.title,
      rowId: row.id,
      rowTitle: row.title,
      rowSummary: row.summary,
      targetType: input.targetType,
      targetLabel: TARGET_LABELS[input.targetType],
      rowStatus: row.status,
      materialStatus: row.materialStatus,
      evidenceCount: row.evidenceRefs.length,
      sourceCount: row.sourceRefs.length,
      performanceTags: row.performanceTags ?? [],
    };
    row.materialRefs.forEach((assetReviewId) => {
      const existing = input.index.get(assetReviewId) ?? [];
      if (existing.some((item) => item.id === link.id)) return;
      input.index.set(assetReviewId, [...existing, link]);
    });
  });
}

export function buildAssetCoverageByReviewId(
  contentKnowledgeMaps: ContentKnowledgeMapRecord[],
): Map<string, AssetCoverageLink[]> {
  const index = new Map<string, AssetCoverageLink[]>();
  contentKnowledgeMaps.forEach((map) => {
    addCoverageRows({
      index,
      map,
      targetType: 'selling-point',
      rows: map.sellingPoints,
    });
    addCoverageRows({
      index,
      map,
      targetType: 'pain-point',
      rows: map.painPoints,
    });
    addCoverageRows({
      index,
      map,
      targetType: 'scenario',
      rows: map.scenarios,
    });
  });
  return index;
}

export function assetCoverageMaterialStatusLabel(status?: ContentKnowledgeMapMaterialStatus): string {
  return status ? MATERIAL_STATUS_LABELS[status] : '未回写';
}

export function assetCoverageRowStatusLabel(status: ContentKnowledgeMapRowStatus): string {
  return ROW_STATUS_LABELS[status];
}
