import type {
  ContentSyncConflict,
  ContentSyncConflictAffectedObject,
  ContentSyncConflictImpact,
} from './types';

export type ContentSyncConflictMergeDecision =
  | 'keep-team'
  | 'resubmit-local'
  | 'append-local'
  | 'manual-review';

export interface ContentSyncConflictMergeDraftRow {
  id: string;
  objectId?: string;
  objectTitle: string;
  objectTypeLabel: string;
  fieldLabel: string;
  localValue: string;
  teamValue: string;
  suggestedDecision: ContentSyncConflictMergeDecision;
  suggestedDecisionLabel: string;
  reason: string;
  nextStep: string;
  canApplyAutomatically: boolean;
  impact: ContentSyncConflictImpact;
}

export interface ContentSyncConflictMergeDraft {
  id: string;
  conflictId: string;
  title: string;
  summary: string;
  rows: ContentSyncConflictMergeDraftRow[];
  autoAppendCount: number;
  manualReviewCount: number;
  resubmitCount: number;
  keepTeamCount: number;
}

function objectTypeLabel(objectType?: ContentSyncConflictAffectedObject['objectType']): string {
  if (objectType === 'content-map') return '内容地图';
  if (objectType === 'selling-point') return '卖点';
  if (objectType === 'pain-point') return '痛点';
  if (objectType === 'scenario') return '场景';
  if (objectType === 'evidence') return '证据';
  if (objectType === 'constraint') return '规则边界';
  if (objectType === 'gap') return '资料缺口';
  if (objectType === 'release') return '团队版本';
  if (objectType === 'review-task') return '审核项';
  if (objectType === 'action') return '行动记录';
  return '影响内容';
}

function fieldLabel(objectType?: ContentSyncConflictAffectedObject['objectType']): string {
  if (objectType === 'content-map') return '矩阵摘要';
  if (objectType === 'selling-point') return '卖点表达';
  if (objectType === 'pain-point') return '痛点表达';
  if (objectType === 'scenario') return '场景表达';
  if (objectType === 'evidence') return '证据引用';
  if (objectType === 'constraint') return '规则边界';
  if (objectType === 'gap') return '待补资料';
  if (objectType === 'release') return '发布版本';
  if (objectType === 'review-task') return '审核结论';
  if (objectType === 'action') return '行动记录';
  return '内容项';
}

function fallbackAffectedObjects(conflict: ContentSyncConflict): ContentSyncConflictAffectedObject[] {
  if (conflict.affectedObjects?.length) return conflict.affectedObjects;
  return conflict.affectedObjectIds.slice(0, 12).map((objectId, index) => ({
    id: objectId || `affected-${index + 1}`,
    objectId,
    objectType: 'unknown',
    title: objectId || `影响内容 ${index + 1}`,
    summary: '本机提交影响该内容项，团队当前版本已更新。',
    impact: 'medium',
    recommendation: '重新同步团队当前版本后，再由内容负责人判断是否保留本机修改。',
  }));
}

function decisionFor(item: ContentSyncConflictAffectedObject): ContentSyncConflictMergeDecision {
  if (item.impact === 'high') return 'manual-review';
  if (item.objectType === 'gap' || item.objectType === 'constraint' || item.objectType === 'evidence') return 'append-local';
  if (item.objectType === 'unknown') return 'manual-review';
  if (!item.localValue && !item.teamValue) return 'manual-review';
  if (!item.localValue) return 'keep-team';
  return 'resubmit-local';
}

function decisionLabel(decision: ContentSyncConflictMergeDecision): string {
  if (decision === 'append-local') return '补充到处理清单';
  if (decision === 'resubmit-local') return '重新提交本机修改';
  if (decision === 'keep-team') return '保留团队内容';
  return '人工确认';
}

function decisionReason(item: ContentSyncConflictAffectedObject, decision: ContentSyncConflictMergeDecision): string {
  if (decision === 'append-local') return '该内容更适合作为补证据、补规则或待办补充，不应覆盖团队当前版本。';
  if (decision === 'resubmit-local') return '本机内容可保留，但需要基于团队当前版本拆成新的变更包重新提交。';
  if (decision === 'keep-team') return '本机没有可比较的新内容，先以团队当前版本继续生产。';
  if (item.impact === 'high') return '该项影响下游卖点、场景或证据，需要内容负责人确认后再处理。';
  return '当前差异信息不足，需要人工判断。';
}

function nextStep(decision: ContentSyncConflictMergeDecision): string {
  if (decision === 'append-local') return '先同步团队当前版本，再把该项作为补充内容提交。';
  if (decision === 'resubmit-local') return '同步团队当前版本后，重新生成变更包。';
  if (decision === 'keep-team') return '刷新团队工作区后继续生产。';
  return '转给内容负责人确认，不自动覆盖。';
}

export function buildContentSyncConflictMergeDraft(conflict: ContentSyncConflict): ContentSyncConflictMergeDraft {
  const rows = fallbackAffectedObjects(conflict).slice(0, 30).map((item, index) => {
    const suggestedDecision = decisionFor(item);
    const localValue = item.localValue?.trim() || '本机提交影响该内容，但没有提供可直接合并的字段值。';
    const teamValue = item.teamValue?.trim() || '团队当前版本已更新，需要先同步后再比较。';
    return {
      id: item.id || `${conflict.id}:row-${index + 1}`,
      objectId: item.objectId,
      objectTitle: item.title,
      objectTypeLabel: objectTypeLabel(item.objectType),
      fieldLabel: fieldLabel(item.objectType),
      localValue,
      teamValue,
      suggestedDecision,
      suggestedDecisionLabel: decisionLabel(suggestedDecision),
      reason: decisionReason(item, suggestedDecision),
      nextStep: nextStep(suggestedDecision),
      canApplyAutomatically: suggestedDecision === 'append-local',
      impact: item.impact,
    };
  });
  return {
    id: `merge-draft:${conflict.id}`,
    conflictId: conflict.id,
    title: `${conflict.title} 合并处理清单`,
    summary: `共 ${rows.length} 个内容项，${rows.filter((row) => row.canApplyAutomatically).length} 个可作为补充清单，${rows.filter((row) => row.suggestedDecision === 'manual-review').length} 个需要人工确认。`,
    rows,
    autoAppendCount: rows.filter((row) => row.suggestedDecision === 'append-local').length,
    manualReviewCount: rows.filter((row) => row.suggestedDecision === 'manual-review').length,
    resubmitCount: rows.filter((row) => row.suggestedDecision === 'resubmit-local').length,
    keepTeamCount: rows.filter((row) => row.suggestedDecision === 'keep-team').length,
  };
}
