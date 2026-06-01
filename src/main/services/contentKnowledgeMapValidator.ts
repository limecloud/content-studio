import type {
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapStatus,
  InputSourceRecord,
} from '../../shared/types';
import type { ContentKnowledgeMapBuildResult } from './contentKnowledgeMapBuilder';
import { competitorInputSourceIds, contentMatrixRiskIssues } from './contentMatrixRiskPolicy';

function compactText(value: string | undefined): string {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function uniqueStrings(values: Array<string | undefined>, limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = compactText(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function rowLabel(type: string): string {
  if (type === 'selling-point') return '卖点';
  if (type === 'pain-point') return '痛点';
  if (type === 'scenario') return '场景';
  return '条目';
}

function normalizeConceptKey(value: string): string {
  return compactText(value)
    .toLowerCase()
    .replace(/^(sku|SKU|差异化机会|痛点|卖点|场景)[:：]/i, '')
    .replace(/[^\p{Script=Han}a-z0-9]+/gu, '')
    .replace(/(升级版|加强版|新版|推荐|方案|方向|内容|表达|口径|场景)$/g, '');
}

function characterBigrams(value: string): Set<string> {
  const text = normalizeConceptKey(value);
  if (text.length <= 1) return new Set(text ? [text] : []);
  const grams = new Set<string>();
  for (let index = 0; index < text.length - 1; index += 1) {
    grams.add(text.slice(index, index + 2));
  }
  return grams;
}

function conceptSimilarity(left: string, right: string): number {
  const leftKey = normalizeConceptKey(left);
  const rightKey = normalizeConceptKey(right);
  if (!leftKey || !rightKey) return 0;
  if (leftKey === rightKey) return 1;
  if (leftKey.length >= 4 && rightKey.includes(leftKey)) return 0.92;
  if (rightKey.length >= 4 && leftKey.includes(rightKey)) return 0.92;
  const leftGrams = characterBigrams(leftKey);
  const rightGrams = characterBigrams(rightKey);
  const intersection = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
  const union = new Set([...leftGrams, ...rightGrams]).size;
  return union ? intersection / union : 0;
}

function validationIssuesForRows(
  build: ContentKnowledgeMapBuildResult,
  inputSources: InputSourceRecord[],
): string[] {
  const competitorIds = competitorInputSourceIds(inputSources);
  const rows = [...build.sellingPoints, ...build.painPoints, ...build.scenarios];
  const readyRowsWithoutEvidence = rows.filter((row) => row.status === 'ready' && row.evidenceRefs.length === 0);
  const riskIssues = rows.flatMap((row) => contentMatrixRiskIssues(row, { competitorInputSourceIds: competitorIds }));
  return uniqueStrings([
    ...riskIssues.slice(0, 8).map((issue) => issue.message),
    ...readyRowsWithoutEvidence.slice(0, 4).map((row) => `可交付条目缺少证据引用，需要降级或补证据：${row.title}`),
    ...duplicateConceptIssues(build),
    ...isolatedConceptIssues(build),
    ...granularityIssues(build),
  ], 12);
}

function rowsByType(build: ContentKnowledgeMapBuildResult): Array<{
  type: 'selling-point' | 'pain-point' | 'scenario';
  row: ContentKnowledgeMapMatrixRow;
}> {
  return [
    ...build.sellingPoints.map((row) => ({ type: 'selling-point' as const, row })),
    ...build.painPoints.map((row) => ({ type: 'pain-point' as const, row })),
    ...build.scenarios.map((row) => ({ type: 'scenario' as const, row })),
  ];
}

function duplicateConceptIssues(build: ContentKnowledgeMapBuildResult): string[] {
  const issues: string[] = [];
  const groups = [
    { type: 'selling-point', rows: build.sellingPoints },
    { type: 'pain-point', rows: build.painPoints },
    { type: 'scenario', rows: build.scenarios },
  ];
  for (const group of groups) {
    for (let leftIndex = 0; leftIndex < group.rows.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.rows.length; rightIndex += 1) {
        const left = group.rows[leftIndex];
        const right = group.rows[rightIndex];
        if (conceptSimilarity(left.title, right.title) < 0.82) continue;
        issues.push(`发现重复或近似${rowLabel(group.type)}条目，需要合并或改名：${left.title} / ${right.title}`);
      }
    }
  }
  return issues.slice(0, 4);
}

function isolatedConceptIssues(build: ContentKnowledgeMapBuildResult): string[] {
  return rowsByType(build)
    .filter(({ row }) => row.sourceRefs.length === 0 || row.evidenceRefs.length === 0)
    .map(({ type, row }) => `发现孤立${rowLabel(type)}条目，缺少来源或证据引用：${row.title}`)
    .slice(0, 4);
}

function granularityIssues(build: ContentKnowledgeMapBuildResult): string[] {
  return rowsByType(build).flatMap(({ type, row }) => {
    const title = compactText(row.title);
    const summary = compactText(row.summary);
    const rowIssues = [
      title.length <= 2 ? `发现粒度过粗的${rowLabel(type)}条目，需要拆成可审核表达：${row.title}` : '',
      title.length >= 46 ? `发现粒度过细的${rowLabel(type)}条目，标题过长，需要改名或拆分：${row.title}` : '',
      summary.length >= 170 && /[、,，；;\/]/.test(summary)
        ? `发现粒度混杂的${rowLabel(type)}条目，摘要包含多个并列点，需要拆分：${row.title}`
        : '',
      row.tags.length >= 6 ? `发现标签过多的${rowLabel(type)}条目，可能混入多个概念，需要拆分：${row.title}` : '',
    ].filter(Boolean);
    return rowIssues;
  }).slice(0, 4);
}

export interface ContentKnowledgeMapValidationResult {
  status: ContentKnowledgeMapStatus;
  gaps: string[];
  readyPercent: number;
}

export function validateContentKnowledgeMapBuild(
  build: ContentKnowledgeMapBuildResult,
  inputSources: InputSourceRecord[],
): ContentKnowledgeMapValidationResult {
  const hasConvertedInput = inputSources.some((source) => source.status === 'converted');
  const gaps = uniqueStrings([
    build.sourceInputSourceIds.length ? '' : '缺少输入源，无法形成可追溯来源。',
    hasConvertedInput ? '' : '输入源尚未转换成可读文本。',
    build.brandKnowledgeBaseIds.length ? '' : '缺少品牌 / 产品知识库，卖点和口径需要补齐。',
    build.sellingPoints.length ? '' : '缺少可用卖点矩阵。',
    build.painPoints.length ? '' : '缺少评论痛点或购买异议。',
    build.scenarios.length ? '' : '缺少可生产场景。',
    build.promptDraftIds.length ? '' : '尚未关联 Prompt 草稿，下游生产交接不足。',
    build.constraints.length ? '' : '缺少合规边界和禁用表达。',
    ...(build.gaps ?? []),
    ...validationIssuesForRows(build, inputSources),
  ]);
  const readinessChecks = [
    build.sourceInputSourceIds.length > 0,
    hasConvertedInput,
    build.brandKnowledgeBaseIds.length > 0,
    build.sellingPoints.length > 0,
    build.painPoints.length > 0,
    build.scenarios.length > 0,
    build.constraints.length > 0,
  ];
  const readyPercent = Math.round((readinessChecks.filter(Boolean).length / readinessChecks.length) * 100);
  const status = build.sourceInputSourceIds.length === 0 && build.brandKnowledgeBaseIds.length === 0 && build.sceneCardIds.length === 0
    ? 'blocked'
    : gaps.length
      ? 'needs-review'
      : 'ready';
  return { status, gaps, readyPercent };
}
