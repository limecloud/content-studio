import type {
  ContentKnowledgeMapMaterialStatus,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRowStatus,
} from './types';

export type ContentMatrixStatusFilter = 'all' | ContentKnowledgeMapRowStatus;
export type ContentMatrixMaterialFilter = 'all' | 'available' | ContentKnowledgeMapMaterialStatus;
export type ContentMatrixSortKey = 'priority' | 'confidence-desc' | 'evidence-desc' | 'material-gap';

export interface ContentMatrixFilterState {
  status: ContentMatrixStatusFilter;
  material: ContentMatrixMaterialFilter;
  audience: string;
  channel: string;
  contentFormat: string;
  query: string;
}

export interface ContentMatrixPlanningInput {
  rows: ContentKnowledgeMapMatrixRow[];
  filter?: Partial<ContentMatrixFilterState>;
  sortKey?: ContentMatrixSortKey;
  pageIndex?: number;
  pageSize?: number;
  batchSize?: number;
}

export interface ContentMatrixRowSummary {
  total: number;
  readyCount: number;
  needsReviewCount: number;
  needsEvidenceCount: number;
  evidenceCount: number;
  materialReadyCount: number;
  materialMissingCount: number;
  competitorRiskCount: number;
  ipLinkedCount: number;
  audienceCount: number;
  channelCount: number;
  contentFormatCount: number;
  useCaseCount: number;
}

export interface ContentMatrixPlan {
  filter: ContentMatrixFilterState;
  sortKey: ContentMatrixSortKey;
  filteredRows: ContentKnowledgeMapMatrixRow[];
  pageRows: ContentKnowledgeMapMatrixRow[];
  batchRows: ContentKnowledgeMapMatrixRow[];
  summary: ContentMatrixRowSummary;
  pageSummary: ContentMatrixRowSummary;
  batchSummary: ContentMatrixRowSummary;
  pageIndex: number;
  pageSize: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

const DEFAULT_FILTER: ContentMatrixFilterState = {
  status: 'all',
  material: 'all',
  audience: 'all',
  channel: 'all',
  contentFormat: 'all',
  query: '',
};

function clampNumber(value: number | undefined, min: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(min, Math.floor(value ?? fallback));
}

function isMaterialReady(row: ContentKnowledgeMapMatrixRow): boolean {
  return row.materialStatus === 'approved' || row.materialStatus === 'covered';
}

function rowText(row: ContentKnowledgeMapMatrixRow): string {
  return [
    row.title,
    row.summary,
    row.tags.join(' '),
    row.dimensions?.audiences?.join(' ') ?? '',
    row.dimensions?.channels?.join(' ') ?? '',
    row.dimensions?.stages?.join(' ') ?? '',
    row.dimensions?.contentFormats?.join(' ') ?? '',
    row.dimensions?.useCases?.join(' ') ?? '',
    row.sourceRefs.join(' '),
    row.performanceTags?.join(' ') ?? '',
  ].join(' ').toLowerCase();
}

function hasCompetitorRisk(row: ContentKnowledgeMapMatrixRow): boolean {
  const text = rowText(row);
  return text.includes('竞品') || text.includes('对标') || text.includes('competitor');
}

function hasIpLink(row: ContentKnowledgeMapMatrixRow): boolean {
  const text = rowText(row);
  return row.sourceRefs.some((ref) => ref.startsWith('ip-knowledge-base:')) || /\bip\b|个人ip|人设|口吻/.test(text);
}

function materialMatches(row: ContentKnowledgeMapMatrixRow, filter: ContentMatrixMaterialFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'available') return isMaterialReady(row);
  if (filter === 'missing') return !isMaterialReady(row);
  return row.materialStatus === filter;
}

function dimensionMatches(values: string[] | undefined, filter: string): boolean {
  if (filter === 'all') return true;
  return Boolean(values?.some((value) => value === filter));
}

function priorityScore(row: ContentKnowledgeMapMatrixRow): number {
  const statusScore = row.status === 'needs-evidence' ? 400 : row.status === 'needs-review' ? 300 : 100;
  const evidenceScore = row.evidenceRefs.length ? 0 : 80;
  const confidenceScore = row.confidence < 65 ? 70 - row.confidence : 0;
  const materialScore = isMaterialReady(row) ? 0 : 24;
  const competitorScore = hasCompetitorRisk(row) ? 18 : 0;
  return statusScore + evidenceScore + confidenceScore + materialScore + competitorScore;
}

function titleCompare(a: ContentKnowledgeMapMatrixRow, b: ContentKnowledgeMapMatrixRow): number {
  return a.title.localeCompare(b.title, 'zh-CN');
}

function sortRows(rows: ContentKnowledgeMapMatrixRow[], sortKey: ContentMatrixSortKey): ContentKnowledgeMapMatrixRow[] {
  return [...rows].sort((a, b) => {
    if (sortKey === 'confidence-desc') {
      return b.confidence - a.confidence || b.evidenceRefs.length - a.evidenceRefs.length || titleCompare(a, b);
    }
    if (sortKey === 'evidence-desc') {
      return b.evidenceRefs.length - a.evidenceRefs.length || b.confidence - a.confidence || titleCompare(a, b);
    }
    if (sortKey === 'material-gap') {
      return Number(isMaterialReady(a)) - Number(isMaterialReady(b)) || priorityScore(b) - priorityScore(a) || titleCompare(a, b);
    }
    return priorityScore(b) - priorityScore(a) || titleCompare(a, b);
  });
}

export function summarizeContentMatrixRows(rows: ContentKnowledgeMapMatrixRow[]): ContentMatrixRowSummary {
  return rows.reduce<ContentMatrixRowSummary>(
    (summary, row) => ({
      total: summary.total + 1,
      readyCount: summary.readyCount + (row.status === 'ready' ? 1 : 0),
      needsReviewCount: summary.needsReviewCount + (row.status === 'needs-review' ? 1 : 0),
      needsEvidenceCount: summary.needsEvidenceCount + (row.status === 'needs-evidence' ? 1 : 0),
      evidenceCount: summary.evidenceCount + row.evidenceRefs.length,
      materialReadyCount: summary.materialReadyCount + (isMaterialReady(row) ? 1 : 0),
      materialMissingCount: summary.materialMissingCount + (isMaterialReady(row) ? 0 : 1),
      competitorRiskCount: summary.competitorRiskCount + (hasCompetitorRisk(row) ? 1 : 0),
      ipLinkedCount: summary.ipLinkedCount + (hasIpLink(row) ? 1 : 0),
      audienceCount: summary.audienceCount + (row.dimensions?.audiences?.length ? 1 : 0),
      channelCount: summary.channelCount + (row.dimensions?.channels?.length ? 1 : 0),
      contentFormatCount: summary.contentFormatCount + (row.dimensions?.contentFormats?.length ? 1 : 0),
      useCaseCount: summary.useCaseCount + (row.dimensions?.useCases?.length ? 1 : 0),
    }),
    {
      total: 0,
      readyCount: 0,
      needsReviewCount: 0,
      needsEvidenceCount: 0,
      evidenceCount: 0,
      materialReadyCount: 0,
      materialMissingCount: 0,
      competitorRiskCount: 0,
      ipLinkedCount: 0,
      audienceCount: 0,
      channelCount: 0,
      contentFormatCount: 0,
      useCaseCount: 0,
    },
  );
}

export function planContentMatrixRows(input: ContentMatrixPlanningInput): ContentMatrixPlan {
  const filter: ContentMatrixFilterState = {
    ...DEFAULT_FILTER,
    ...input.filter,
    query: input.filter?.query?.trim() ?? DEFAULT_FILTER.query,
  };
  const sortKey = input.sortKey ?? 'priority';
  const pageSize = clampNumber(input.pageSize, 1, 12);
  const batchSize = clampNumber(input.batchSize, 1, 8);
  const query = filter.query.toLowerCase();
  const filteredRows = sortRows(
    input.rows.filter((row) => (
      (filter.status === 'all' || row.status === filter.status) &&
      materialMatches(row, filter.material) &&
      dimensionMatches(row.dimensions?.audiences, filter.audience) &&
      dimensionMatches(row.dimensions?.channels, filter.channel) &&
      dimensionMatches(row.dimensions?.contentFormats, filter.contentFormat) &&
      (!query || rowText(row).includes(query))
    )),
    sortKey,
  );
  const pageCount = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const requestedPageIndex = clampNumber(input.pageIndex, 0, 0);
  const pageIndex = Math.min(requestedPageIndex, pageCount - 1);
  const pageRows = filteredRows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize);
  const batchRows = pageRows.slice(0, batchSize);

  return {
    filter,
    sortKey,
    filteredRows,
    pageRows,
    batchRows,
    summary: summarizeContentMatrixRows(filteredRows),
    pageSummary: summarizeContentMatrixRows(pageRows),
    batchSummary: summarizeContentMatrixRows(batchRows),
    pageIndex,
    pageSize,
    pageCount,
    hasPreviousPage: pageIndex > 0,
    hasNextPage: pageIndex < pageCount - 1,
  };
}
