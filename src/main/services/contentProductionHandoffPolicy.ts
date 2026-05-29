import type {
  ContentKnowledgeMapEvidence,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentReviewTask,
} from '../../shared/types';

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

export interface ContentProductionHandoffCandidate {
  task: ContentReviewTask;
  map?: ContentKnowledgeMapRecord;
  row?: ContentKnowledgeMapMatrixRow;
  readyEvidence: ContentKnowledgeMapEvidence[];
}

export interface ContentProductionHandoffPolicyResult {
  allowed: boolean;
  issues: string[];
}

function rowText(row?: ContentKnowledgeMapMatrixRow): string {
  if (!row) return '';
  return [row.title, row.summary, ...row.tags].filter(Boolean).join(' ');
}

function rowMatches(row: ContentKnowledgeMapMatrixRow | undefined, patterns: RegExp[]): boolean {
  const text = rowText(row);
  return patterns.some((pattern) => pattern.test(text));
}

function hasForbiddenMarker(row?: ContentKnowledgeMapMatrixRow): boolean {
  if (!row) return false;
  return /禁用|禁止使用|禁止发布|不可使用|高风险|forbidden|deprecated/i.test(rowText(row));
}

function isCompetitorRow(row?: ContentKnowledgeMapMatrixRow): boolean {
  if (!row) return false;
  return row.tags.some((tag) => /竞品|竞对|对标|不可搬运/.test(tag)) ||
    row.sourceRefs.some((ref) => /competitor|竞品|竞对/.test(ref)) ||
    /竞品|竞对|对标/.test(row.title);
}

function isIpRow(row?: ContentKnowledgeMapMatrixRow): boolean {
  if (!row) return false;
  return row.sourceRefs.some((ref) => ref.startsWith('ip-knowledge-base:')) ||
    row.tags.some((tag) => /IP|口播|私域|语言/.test(tag)) ||
    /IP|创始人|人设/.test(row.title);
}

function hasIpBoundary(map?: ContentKnowledgeMapRecord): boolean {
  return Boolean(map?.constraints.some((item) => /IP|立场|语言规则|漂移/.test(item)));
}

export function checkContentProductionHandoff(
  candidate: ContentProductionHandoffCandidate,
): ContentProductionHandoffPolicyResult {
  const issues = [
    candidate.task.status === 'approved' ? '' : '审核任务尚未通过，不能交给下游生产。',
    candidate.map ? '' : '找不到对应内容知识地图。',
    candidate.row ? '' : '找不到对应矩阵组合。',
    candidate.task.targetType === 'gap' ? '缺口任务需要先补资料，不能直接进入确定性生产。' : '',
    candidate.task.targetType === 'constraint' ? '规则任务需要先固化为边界，不能直接进入确定性生产。' : '',
    candidate.readyEvidence.length ? '' : '缺少已通过证据，不能生成确定性 Prompt。',
    isCompetitorRow(candidate.row) ? '竞品观察只能用于结构、模式和差异化机会判断，不能直接交给 Prompt 工作台；请先转写为本品牌已审核卖点或场景。' : '',
    hasForbiddenMarker(candidate.row) ? '矩阵组合已标记为禁用或高风险，不能进入提示词依据。' : '',
    rowMatches(candidate.row, FORBIDDEN_EXPRESSION_PATTERNS) ? '矩阵组合包含禁用或绝对化表达，必须改写或标记禁用后才能交接。' : '',
    isIpRow(candidate.row) && !hasIpBoundary(candidate.map) ? 'IP 内容缺少核心立场或语言规则边界，不能交给下游生产。' : '',
    isIpRow(candidate.row) && rowMatches(candidate.row, IP_DRIFT_PATTERNS) ? 'IP 表达疑似偏离核心立场或语言边界，需要先人工改写。' : '',
  ].filter(Boolean);
  return { allowed: issues.length === 0, issues };
}
