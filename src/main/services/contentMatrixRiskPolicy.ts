import type { ContentKnowledgeMapMatrixRow, InputSourceRecord } from '../../shared/types';

export type ContentMatrixRiskKind =
  | 'forbidden-expression'
  | 'forbidden-marker'
  | 'competitor-direct-use'
  | 'ip-voice-drift';

export interface ContentMatrixRiskIssue {
  kind: ContentMatrixRiskKind;
  label: string;
  message: string;
}

const FORBIDDEN_EXPRESSION_PATTERNS = [
  /绝对安全/,
  /绝对有效/,
  /全网最/,
  /最安全/,
  /最有效/,
  /唯一/,
  /100%/,
  /百分百/,
  /保证/,
  /包治/,
  /治疗/,
  /见效/,
  /替代专业/,
  /官方认证/,
  /专家认证/,
];

const IP_DRIFT_PATTERNS = [
  /官方认证/,
  /专家认证/,
  /权威认证/,
  /唯一/,
  /绝对/,
  /100%/,
  /保证/,
];

function rowText(row?: ContentKnowledgeMapMatrixRow): string {
  if (!row) return '';
  return [row.title, row.summary, ...row.tags].filter(Boolean).join(' ');
}

function rowMatches(row: ContentKnowledgeMapMatrixRow | undefined, patterns: RegExp[]): boolean {
  const text = rowText(row);
  return patterns.some((pattern) => pattern.test(text));
}

export function isIpMatrixRow(row?: ContentKnowledgeMapMatrixRow): boolean {
  if (!row) return false;
  return row.sourceRefs.some((ref) => ref.startsWith('ip-knowledge-base:')) ||
    row.tags.some((tag) => /IP|口播|私域|语言/.test(tag)) ||
    /IP|创始人|人设/.test(row.title);
}

export function isCompetitorMatrixRow(
  row: ContentKnowledgeMapMatrixRow | undefined,
  competitorInputSourceIds = new Set<string>(),
): boolean {
  if (!row) return false;
  return row.sourceRefs.some((ref) => {
    if (!ref.startsWith('input-source:')) return /competitor|竞品|竞对/.test(ref);
    return competitorInputSourceIds.has(ref.slice('input-source:'.length));
  }) ||
    row.tags.some((tag) => /竞品|竞对|对标|不可搬运/.test(tag)) ||
    /竞品|竞对|对标/.test(row.title);
}

export function competitorInputSourceIds(inputSources: InputSourceRecord[]): Set<string> {
  return new Set(inputSources
    .filter((source) => source.purpose === 'competitor-observation')
    .map((source) => source.id));
}

export function contentMatrixRiskIssues(
  row: ContentKnowledgeMapMatrixRow | undefined,
  options: {
    competitorInputSourceIds?: Set<string>;
  } = {},
): ContentMatrixRiskIssue[] {
  if (!row) return [];
  const issues: ContentMatrixRiskIssue[] = [];
  if (/禁用|禁止使用|禁止发布|不可使用|高风险|forbidden|deprecated/i.test(rowText(row))) {
    issues.push({
      kind: 'forbidden-marker',
      label: '禁用标记',
      message: `矩阵组合已标记为禁用或高风险，并包含禁用或绝对化表达风险，不能进入提示词依据：${row.title}`,
    });
  }
  if (rowMatches(row, FORBIDDEN_EXPRESSION_PATTERNS)) {
    issues.push({
      kind: 'forbidden-expression',
      label: '禁用表达',
      message: `矩阵行包含禁用或绝对化表达，需要改写或标记禁用：${row.title}`,
    });
  }
  if (isCompetitorMatrixRow(row, options.competitorInputSourceIds) && row.status === 'ready') {
    issues.push({
      kind: 'competitor-direct-use',
      label: '竞品边界',
      message: `竞品观察不能直接作为可发布内容，需要先人工审核并转写为本品牌差异化机会：${row.title}`,
    });
  }
  if (isIpMatrixRow(row) && rowMatches(row, IP_DRIFT_PATTERNS)) {
    issues.push({
      kind: 'ip-voice-drift',
      label: 'IP 口径漂移',
      message: `IP 表达疑似偏离核心立场或语言边界，需要人工确认：${row.title}`,
    });
  }
  return issues;
}
