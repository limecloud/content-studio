import type {
  ContentKnowledgeMapEvidence,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentReviewTask,
} from '../../shared/types';
import { contentMatrixRiskIssues, isCompetitorMatrixRow, isIpMatrixRow } from './contentMatrixRiskPolicy';

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

function hasIpBoundary(map?: ContentKnowledgeMapRecord): boolean {
  return Boolean(map?.constraints.some((item) => /IP|立场|语言规则|漂移/.test(item)));
}

export function checkContentProductionHandoff(
  candidate: ContentProductionHandoffCandidate,
): ContentProductionHandoffPolicyResult {
  const riskIssues = contentMatrixRiskIssues(candidate.row);
  const issues = [
    candidate.task.status === 'approved' ? '' : '审核任务尚未通过，不能交给下游生产。',
    candidate.map ? '' : '找不到对应内容知识地图。',
    candidate.row ? '' : '找不到对应矩阵组合。',
    candidate.task.targetType === 'gap' ? '缺口任务需要先补资料，不能直接进入确定性生产。' : '',
    candidate.task.targetType === 'constraint' ? '规则任务需要先固化为边界，不能直接进入确定性生产。' : '',
    candidate.readyEvidence.length ? '' : '缺少已通过证据，不能生成确定性 Prompt。',
    isCompetitorMatrixRow(candidate.row) ? '竞品观察只能用于结构、模式和差异化机会判断，不能直接生成确定性 Prompt；请先转写为本品牌已审核卖点或场景。' : '',
    isIpMatrixRow(candidate.row) && !hasIpBoundary(candidate.map) ? 'IP 内容缺少核心立场或语言规则边界，不能交给下游生产。' : '',
    ...riskIssues.map((issue) => issue.message),
  ].filter(Boolean);
  return { allowed: issues.length === 0, issues };
}
