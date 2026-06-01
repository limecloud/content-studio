import { randomUUID } from 'node:crypto';
import type {
  ContentKnowledgeMapRecord,
  ContentKnowledgeMapMatrixRow,
  ContentReviewTask,
  ContentReviewTaskPurpose,
  ContentReviewTaskRisk,
} from '../../shared/types';
import { contentMatrixRiskIssues } from './contentMatrixRiskPolicy';

type ContentReviewMatrixTargetType = Extract<ContentReviewTask['targetType'], 'selling-point' | 'pain-point' | 'scenario'>;

interface BuildContentReviewTasksFromMapOptions {
  targetRowIds?: string[];
  targetTypes?: ContentReviewMatrixTargetType[];
  taskPurpose?: ContentReviewTaskPurpose;
  includeGaps?: boolean;
  limitRows?: number;
  limitGaps?: number;
}

function rowRisk(row: ContentKnowledgeMapMatrixRow): ContentReviewTaskRisk {
  if (contentMatrixRiskIssues(row).length) return 'high';
  if (row.status !== 'ready' || row.evidenceRefs.length === 0) return 'high';
  if (row.confidence < 65) return 'medium';
  return 'low';
}

function rowIssueLabels(row: ContentKnowledgeMapMatrixRow): string[] {
  const riskLabels = contentMatrixRiskIssues(row).map((issue) => issue.label);
  const labels = [
    ...riskLabels,
    row.evidenceRefs.length ? '' : '缺证据',
    row.status === 'needs-review' ? '待人工确认' : '',
    row.status === 'needs-evidence' ? '待补证据' : '',
    row.confidence < 65 ? '置信度偏低' : '',
  ].filter(Boolean);
  return labels.length ? Array.from(new Set(labels)) : ['本批送审'];
}

function materialIssueLabels(row: ContentKnowledgeMapMatrixRow): string[] {
  return [
    '补素材',
    row.materialStatus === 'missing' ? '缺素材' : '',
    row.status === 'ready' ? '可先交接图文' : '需先确认内容',
  ].filter(Boolean);
}

function taskFromRow(
  workspacePath: string,
  map: ContentKnowledgeMapRecord,
  targetType: ContentReviewTask['targetType'],
  row: ContentKnowledgeMapMatrixRow,
  taskPurpose: ContentReviewTaskPurpose = 'review',
): ContentReviewTask {
  const now = new Date().toISOString();
  const risk = rowRisk(row);
  if (taskPurpose === 'material-supplement') {
    return {
      id: randomUUID(),
      workspacePath,
      sourceKnowledgeMapId: map.id,
      sourceKnowledgeMapTitle: map.title,
      targetType,
      targetId: row.id,
      title: `补素材：${row.title}`,
      summary: [
        `当前组合需要补充可用图片、视频、案例或客服截图后再进入对应内容生产。`,
        row.summary,
        row.materialRefs?.length ? `已有关联素材：${row.materialRefs.join('、')}` : '暂无可用素材覆盖。',
      ].join('\n'),
      taskPurpose,
      evidenceRefs: row.evidenceRefs,
      sourceRefs: row.sourceRefs,
      risk: row.status === 'ready' ? 'medium' : risk,
      status: 'needs-material',
      suggestedAction: 'request-material',
      issueLabels: materialIssueLabels(row),
      decisions: [],
      createdAt: now,
      updatedAt: now,
    };
  }
  return {
    id: randomUUID(),
    workspacePath,
    sourceKnowledgeMapId: map.id,
    sourceKnowledgeMapTitle: map.title,
    targetType,
    targetId: row.id,
    title: row.title,
    summary: row.summary,
    taskPurpose,
    evidenceRefs: row.evidenceRefs,
    sourceRefs: row.sourceRefs,
    risk,
    status: row.evidenceRefs.length ? 'open' : 'needs-evidence',
    suggestedAction: row.evidenceRefs.length ? (risk === 'high' ? 'downgrade-to-needs-verification' : 'approve') : 'request-evidence',
    issueLabels: rowIssueLabels(row),
    decisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function taskFromGap(
  workspacePath: string,
  map: ContentKnowledgeMapRecord,
  gap: string,
): ContentReviewTask {
  const now = new Date().toISOString();
  const forbidden = /禁用|禁止|风险|拦截/.test(gap);
  return {
    id: randomUUID(),
    workspacePath,
    sourceKnowledgeMapId: map.id,
    sourceKnowledgeMapTitle: map.title,
    targetType: 'gap',
    title: forbidden ? '风险缺口处理' : '知识地图缺口处理',
    summary: gap,
    evidenceRefs: [],
    sourceRefs: [],
    risk: forbidden ? 'high' : 'medium',
    status: forbidden ? 'open' : 'needs-evidence',
    suggestedAction: forbidden ? 'mark-forbidden' : 'request-evidence',
    taskPurpose: forbidden ? 'review' : 'evidence-supplement',
    issueLabels: [forbidden ? '风险边界' : '缺口', '待处理'],
    decisions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function dedupeTasks(tasks: ContentReviewTask[]): ContentReviewTask[] {
  const seen = new Set<string>();
  const result: ContentReviewTask[] = [];
  for (const task of tasks) {
    const key = `${task.sourceKnowledgeMapId}:${task.targetType}:${task.taskPurpose ?? 'review'}:${task.targetId ?? task.summary}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(task);
  }
  return result;
}

export function buildContentReviewTasksFromMap(
  workspacePath: string,
  map: ContentKnowledgeMapRecord,
  options: BuildContentReviewTasksFromMapOptions = {},
): ContentReviewTask[] {
  const targetRowIds = new Set(options.targetRowIds?.filter(Boolean) ?? []);
  const targetTypes = new Set<ContentReviewMatrixTargetType>(options.targetTypes ?? ['selling-point', 'pain-point', 'scenario']);
  const taskPurpose = options.taskPurpose ?? 'review';
  const hasTargetRows = targetRowIds.size > 0;
  const candidateRows = [
    ...map.sellingPoints.map((row) => ({ type: 'selling-point' as const, row })),
    ...map.painPoints.map((row) => ({ type: 'pain-point' as const, row })),
    ...map.scenarios.map((row) => ({ type: 'scenario' as const, row })),
  ].filter(({ type, row }) => (
    targetTypes.has(type) &&
    (hasTargetRows
      ? targetRowIds.has(row.id)
      : taskPurpose === 'material-supplement'
        ? row.materialStatus === 'missing' || !row.materialRefs?.length
        : row.status !== 'ready' || row.evidenceRefs.length === 0 || row.confidence < 65 || contentMatrixRiskIssues(row).length > 0)
  ));
  const rowLimit = options.limitRows ?? (hasTargetRows ? candidateRows.length : 30);
  const gapLimit = options.limitGaps ?? 20;
  const includeGaps = options.includeGaps ?? (!hasTargetRows && taskPurpose !== 'material-supplement');
  return dedupeTasks([
    ...candidateRows.slice(0, rowLimit).map(({ type, row }) => taskFromRow(workspacePath, map, type, row, taskPurpose)),
    ...(includeGaps ? map.gaps.slice(0, gapLimit).map((gap) => taskFromGap(workspacePath, map, gap)) : []),
  ]);
}
