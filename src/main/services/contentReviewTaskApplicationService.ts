import { randomUUID } from 'node:crypto';
import type {
  ContentReviewDecision,
  ContentReviewDecisionAction,
  ContentReviewDecisionPayload,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentReviewTask,
  ContentReviewTaskStatus,
  ContentWorkspaceSyncResult,
  GenerateContentReviewTasksInput,
  SubmitContentReviewDecisionInput,
} from '../../shared/types';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import { buildContentReviewTasksFromMap } from './contentReviewTaskBuilder';
import { ContentReviewTaskStore } from './contentReviewTaskStore';
import type { ContentReviewTaskSyncAdapter } from './buguContentWorkspaceSyncAdapter';

type ContentMatrixCollectionKey = 'sellingPoints' | 'painPoints' | 'scenarios';

interface ReviewAdjustmentDraftSync {
  createDraftChange(input: {
    workspacePath: string;
    contentKnowledgeMapId?: string;
    authorLabel?: string;
  }): Promise<ContentWorkspaceSyncResult>;
  submitDraftChange(input: {
    workspacePath: string;
    draftChangeId: string;
    authorLabel?: string;
  }): Promise<ContentWorkspaceSyncResult>;
}

function statusForAction(
  action: ContentReviewDecisionAction,
  currentStatus: ContentReviewTaskStatus,
  mutationStatus?: ContentReviewTaskStatus,
): ContentReviewTaskStatus {
  if (action === 'approve') return 'approved';
  if (action === 'reject') return 'rejected';
  if (action === 'mark-forbidden') return 'forbidden';
  if (action === 'request-evidence') return 'needs-evidence';
  if (action === 'request-material') return 'needs-material';
  if (action === 'rename-target' || action === 'merge-related' || action === 'split-target') {
    return mutationStatus ?? (currentStatus === 'approved' ? 'open' : currentStatus);
  }
  return 'open';
}

function defaultReason(action: ContentReviewDecisionAction): string {
  const reasons: Record<ContentReviewDecisionAction, string> = {
    approve: '证据和表达边界通过审核。',
    reject: '审核驳回，不进入下游生产。',
    'request-evidence': '需要补充可追溯证据。',
    'request-material': '需要补充可用素材后再进入对应内容生产。',
    'mark-forbidden': '标记为禁用表达或高风险主张。',
    'downgrade-to-needs-verification': '降级为待确认，不进入确定性发布交接。',
    'rename-target': '已调整条目名称，仍需继续审核。',
    'merge-related': '已合并重复或近似条目，保留来源、证据和素材线索。',
    'split-target': '已拆分过粗条目，生成可单独审核的子条目。',
  };
  return reasons[action];
}

function uniqueTexts(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter((value): value is string => Boolean(value))));
}

function matrixCollectionKey(targetType: ContentReviewTask['targetType']): ContentMatrixCollectionKey | null {
  if (targetType === 'selling-point') return 'sellingPoints';
  if (targetType === 'pain-point') return 'painPoints';
  if (targetType === 'scenario') return 'scenarios';
  return null;
}

function readyPercent(map: ContentKnowledgeMapRecord): number {
  const rows = [...map.sellingPoints, ...map.painPoints, ...map.scenarios];
  if (!rows.length) return 0;
  return Math.round((rows.filter((row) => row.status === 'ready').length / rows.length) * 100);
}

function mergedMaterialStatus(rows: ContentKnowledgeMapMatrixRow[]): ContentKnowledgeMapMatrixRow['materialStatus'] {
  if (rows.some((row) => row.materialStatus === 'approved')) return 'approved';
  if (rows.some((row) => row.materialStatus === 'covered')) return 'covered';
  if (rows.every((row) => row.materialStatus === 'rejected')) return 'rejected';
  return 'missing';
}

function mergedRowStatus(rows: ContentKnowledgeMapMatrixRow[], evidenceRefs: string[]): ContentKnowledgeMapMatrixRow['status'] {
  if (!evidenceRefs.length) return 'needs-evidence';
  return rows.every((row) => row.status === 'ready') ? 'ready' : 'needs-review';
}

function mergedDimensions(rows: ContentKnowledgeMapMatrixRow[]): ContentKnowledgeMapMatrixRow['dimensions'] {
  const audiences = uniqueTexts(rows.flatMap((row) => row.dimensions?.audiences ?? []));
  const channels = uniqueTexts(rows.flatMap((row) => row.dimensions?.channels ?? []));
  const stages = uniqueTexts(rows.flatMap((row) => row.dimensions?.stages ?? []));
  const contentFormats = uniqueTexts(rows.flatMap((row) => row.dimensions?.contentFormats ?? []));
  const useCases = uniqueTexts(rows.flatMap((row) => row.dimensions?.useCases ?? []));
  const dimensions = {
    ...(audiences.length ? { audiences } : {}),
    ...(channels.length ? { channels } : {}),
    ...(stages.length ? { stages } : {}),
    ...(contentFormats.length ? { contentFormats } : {}),
    ...(useCases.length ? { useCases } : {}),
  };
  return Object.keys(dimensions).length ? dimensions : undefined;
}

function normalizeSplitItems(payload?: ContentReviewDecisionPayload): NonNullable<ContentReviewDecisionPayload['splitItems']> {
  return (payload?.splitItems ?? [])
    .map((item) => ({
      title: item.title.trim(),
      summary: item.summary?.trim(),
      tags: uniqueTexts(item.tags ?? []),
    }))
    .filter((item) => item.title);
}

function withPendingTeamSync(map: ContentKnowledgeMapRecord): ContentKnowledgeMapRecord {
  return {
    ...map,
    status: map.status === 'blocked' ? map.status : 'needs-review',
    syncStatus: 'pending-sync',
    teamSync: {
      ...map.teamSync,
      status: 'pending-sync',
      message: '审核调整已保存在本机，待同步到团队工作区。',
    },
    coverage: {
      ...map.coverage,
      readyPercent: readyPercent(map),
    },
  };
}

const localOnlyReviewSync: ContentReviewTaskSyncAdapter = {
  async syncReviewTasks() {
    return {
      backend: 'bugu',
      status: 'blocked',
      message: '审核任务已保存在本机，尚未同步到团队工作区。',
    };
  },
  async submitReviewDecision() {
    return {
      backend: 'bugu',
      status: 'blocked',
      message: '审核结论已保存在本机，尚未同步到团队工作区。',
    };
  },
};

export class ContentReviewTaskApplicationService {
  constructor(
    private readonly store: ContentReviewTaskStore,
    private readonly maps: ContentKnowledgeMapStore,
    private readonly sync: ContentReviewTaskSyncAdapter = localOnlyReviewSync,
    private readonly draftSync?: ReviewAdjustmentDraftSync,
  ) {}

  list(workspacePath: string): Promise<ContentReviewTask[]> {
    return this.store.list(workspacePath);
  }

  async generate(input: GenerateContentReviewTasksInput): Promise<ContentReviewTask[]> {
    const maps = await this.maps.list(input.workspacePath);
    const map = input.contentKnowledgeMapId
      ? maps.find((item) => item.id === input.contentKnowledgeMapId)
      : maps[0];
    if (!map) return this.store.list(input.workspacePath);
    const tasks = buildContentReviewTasksFromMap(input.workspacePath, map, {
      targetRowIds: input.targetRowIds,
      targetTypes: input.targetTypes,
      taskPurpose: input.taskPurpose,
    });
    const saved = await this.store.saveMany(input.workspacePath, tasks);
    const mapTasks = saved.filter((task) => task.sourceKnowledgeMapId === map.id);
    if (!mapTasks.length) return saved;
    const teamSync = await this.sync.syncReviewTasks({
      workspacePath: input.workspacePath,
      tasks: mapTasks,
    });
    return this.store.updateMany(
      input.workspacePath,
      mapTasks.map((task) => ({ ...task, syncStatus: teamSync.status, teamSync })),
    );
  }

  private async applyDecisionMutation(input: SubmitContentReviewDecisionInput, task: ContentReviewTask): Promise<{
    task: ContentReviewTask;
    contentKnowledgeMapId?: string;
    mutation?: unknown;
    mutationStatus?: ContentReviewTaskStatus;
  }> {
    if (!['rename-target', 'merge-related', 'split-target'].includes(input.action)) return { task };
    const collectionKey = matrixCollectionKey(task.targetType);
    if (!collectionKey || !task.targetId) throw new Error('当前审核任务没有可调整的内容条目。');
    const maps = await this.maps.list(input.workspacePath);
    const map = task.sourceKnowledgeMapId
      ? maps.find((item) => item.id === task.sourceKnowledgeMapId)
      : maps[0];
    if (!map) throw new Error('找不到对应内容知识地图。');
    const rows = map[collectionKey];
    const rowIndex = rows.findIndex((row) => row.id === task.targetId);
    if (rowIndex < 0) throw new Error('找不到对应内容条目。');

    if (input.action === 'rename-target') {
      const title = input.payload?.title?.trim();
      const summary = input.payload?.summary?.trim();
      if (!title) throw new Error('请填写新的条目名称。');
      const row = rows[rowIndex];
      const updatedRow: ContentKnowledgeMapMatrixRow = {
        ...row,
        title,
        summary: summary || row.summary,
      };
      const nextRows = rows.map((item, index) => (index === rowIndex ? updatedRow : item));
      await this.maps.update(withPendingTeamSync({ ...map, [collectionKey]: nextRows }));
      return {
        task: {
          ...task,
          title: updatedRow.title,
          summary: updatedRow.summary,
          issueLabels: uniqueTexts([...task.issueLabels, '已改名']),
        },
        contentKnowledgeMapId: map.id,
        mutation: {
          type: 'rename-target',
          contentKnowledgeMapId: map.id,
          targetType: task.targetType,
          targetId: row.id,
          beforeTitle: row.title,
          afterTitle: updatedRow.title,
        },
        mutationStatus: task.status === 'approved' ? 'open' : task.status,
      };
    }

    if (input.action === 'merge-related') {
      const mergeTargetIds = uniqueTexts(input.payload?.mergeTargetIds ?? []).filter((id) => id !== task.targetId);
      if (!mergeTargetIds.length) throw new Error('请选择需要合并的条目。');
      const mergeTargetSet = new Set(mergeTargetIds);
      const primary = rows[rowIndex];
      const relatedRows = rows.filter((row) => mergeTargetSet.has(row.id));
      if (!relatedRows.length) throw new Error('没有找到可合并条目。');
      const mergedRows = [primary, ...relatedRows];
      const evidenceRefs = uniqueTexts(mergedRows.flatMap((row) => row.evidenceRefs));
      const sourceRefs = uniqueTexts(mergedRows.flatMap((row) => row.sourceRefs));
      const materialRefs = uniqueTexts(mergedRows.flatMap((row) => row.materialRefs ?? []));
      const performanceTags = uniqueTexts(mergedRows.flatMap((row) => row.performanceTags ?? []));
      const mergedRow: ContentKnowledgeMapMatrixRow = {
        ...primary,
        title: input.payload?.title?.trim() || primary.title,
        summary: input.payload?.summary?.trim() || uniqueTexts(mergedRows.map((row) => row.summary)).join(' / '),
        tags: uniqueTexts(mergedRows.flatMap((row) => row.tags)),
        dimensions: mergedDimensions(mergedRows),
        sourceRefs,
        evidenceRefs,
        materialStatus: mergedMaterialStatus(mergedRows),
        materialRefs,
        performanceTags,
        confidence: Math.round(mergedRows.reduce((sum, row) => sum + row.confidence, 0) / mergedRows.length),
        status: mergedRowStatus(mergedRows, evidenceRefs),
      };
      const nextRows = rows
        .filter((row) => row.id === primary.id || !mergeTargetSet.has(row.id))
        .map((row) => (row.id === primary.id ? mergedRow : row));
      await this.maps.update(withPendingTeamSync({ ...map, [collectionKey]: nextRows }));
      return {
        task: {
          ...task,
          title: mergedRow.title,
          summary: mergedRow.summary,
          evidenceRefs: mergedRow.evidenceRefs,
          sourceRefs: mergedRow.sourceRefs,
          issueLabels: uniqueTexts([...task.issueLabels, '已合并']),
        },
        contentKnowledgeMapId: map.id,
        mutation: {
          type: 'merge-related',
          contentKnowledgeMapId: map.id,
          targetType: task.targetType,
          targetId: primary.id,
          mergedTargetIds: relatedRows.map((row) => row.id),
          evidenceRefs,
          sourceRefs,
        },
        mutationStatus: mergedRow.evidenceRefs.length ? 'open' : 'needs-evidence',
      };
    }

    const splitItems = normalizeSplitItems(input.payload);
    if (splitItems.length < 2) throw new Error('拆分至少需要两个条目。');
    const sourceRow = rows[rowIndex];
    const splitRows = splitItems.map((item, index): ContentKnowledgeMapMatrixRow => ({
      ...sourceRow,
      id: index === 0 ? sourceRow.id : randomUUID(),
      title: item.title,
      summary: item.summary || sourceRow.summary,
      tags: uniqueTexts([...sourceRow.tags, ...(item.tags ?? [])]),
      materialStatus: 'missing',
      materialRefs: [],
      performanceTags: [],
      confidence: Math.min(sourceRow.confidence, 70),
      status: sourceRow.evidenceRefs.length ? 'needs-review' : 'needs-evidence',
    }));
    const nextRows = [
      ...rows.slice(0, rowIndex),
      ...splitRows,
      ...rows.slice(rowIndex + 1),
    ];
    await this.maps.update(withPendingTeamSync({ ...map, [collectionKey]: nextRows }));
    const firstRow = splitRows[0];
    return {
      task: {
        ...task,
        targetId: firstRow.id,
        title: firstRow.title,
        summary: firstRow.summary,
        evidenceRefs: firstRow.evidenceRefs,
        sourceRefs: firstRow.sourceRefs,
        issueLabels: uniqueTexts([...task.issueLabels, '已拆分']),
      },
      contentKnowledgeMapId: map.id,
      mutation: {
        type: 'split-target',
        contentKnowledgeMapId: map.id,
        targetType: task.targetType,
        originalTargetId: sourceRow.id,
        splitTargetIds: splitRows.map((row) => row.id),
      },
      mutationStatus: firstRow.evidenceRefs.length ? 'open' : 'needs-evidence',
    };
  }

  private async syncMutationDraft(input: {
    workspacePath: string;
    contentKnowledgeMapId?: string;
    authorLabel: string;
  }): Promise<ContentWorkspaceSyncResult | undefined> {
    if (!this.draftSync || !input.contentKnowledgeMapId) return undefined;
    const created = await this.draftSync.createDraftChange({
      workspacePath: input.workspacePath,
      contentKnowledgeMapId: input.contentKnowledgeMapId,
      authorLabel: input.authorLabel,
    });
    if (created.status !== 'created' || !created.draftChange) return created;
    return this.draftSync.submitDraftChange({
      workspacePath: input.workspacePath,
      draftChangeId: created.draftChange.id,
      authorLabel: input.authorLabel,
    });
  }

  async submitDecision(input: SubmitContentReviewDecisionInput): Promise<ContentReviewTask> {
    const tasks = await this.store.list(input.workspacePath);
    const task = tasks.find((item) => item.id === input.taskId);
    if (!task) throw new Error(`审核任务不存在: ${input.taskId}`);
    const now = new Date().toISOString();
    const mutation = await this.applyDecisionMutation(input, task);
    const nextStatus = statusForAction(input.action, mutation.task.status, mutation.mutationStatus);
    const decision: ContentReviewDecision = {
      id: randomUUID(),
      taskId: task.id,
      action: input.action,
      reviewerLabel: input.reviewerLabel?.trim() || '本机工作台',
      reason: input.reason?.trim() || defaultReason(input.action),
      payload: input.payload,
      beforeSnapshot: {
        status: task.status,
        title: task.title,
        summary: task.summary,
        evidenceRefs: task.evidenceRefs,
        sourceRefs: task.sourceRefs,
        risk: task.risk,
        suggestedAction: task.suggestedAction,
        issueLabels: task.issueLabels,
      },
      afterSnapshot: {
        status: nextStatus,
        action: input.action,
        title: mutation.task.title,
        summary: mutation.task.summary,
        evidenceRefs: mutation.task.evidenceRefs,
        sourceRefs: mutation.task.sourceRefs,
        mutation: mutation.mutation,
      },
      createdAt: now,
    };
    const updated: ContentReviewTask = {
      ...mutation.task,
      status: nextStatus,
      decisions: [decision, ...mutation.task.decisions],
      updatedAt: now,
    };
    const saved = await this.store.update(updated);
    const draftSyncResult = await this.syncMutationDraft({
      workspacePath: input.workspacePath,
      contentKnowledgeMapId: mutation.contentKnowledgeMapId,
      authorLabel: decision.reviewerLabel,
    });
    const taskForSync = draftSyncResult?.teamSync?.revision
      ? {
          ...saved,
          teamSync: {
            ...saved.teamSync,
            ...draftSyncResult.teamSync,
          },
        }
      : saved;
    const teamSync = await this.sync.submitReviewDecision({
      workspacePath: input.workspacePath,
      task: taskForSync,
      decision,
      authorLabel: decision.reviewerLabel,
    });
    return this.store.update({ ...saved, syncStatus: teamSync.status, teamSync });
  }
}
