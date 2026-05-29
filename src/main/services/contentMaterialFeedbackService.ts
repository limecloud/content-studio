import { randomUUID } from 'node:crypto';
import type {
  AssetReviewRecord,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentKnowledgeMapTeamSyncSummary,
  ContentMaterialCoverageResult,
  ContentMaterialCoverageUpdate,
  ContentReviewTask,
  WriteBackContentMaterialCoverageInput,
} from '../../shared/types';
import { AssetReviewStore } from './assetReviewStore';
import type { ContentMaterialCoverageSyncAdapter, ContentReviewTaskSyncAdapter } from './buguContentWorkspaceSyncAdapter';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import { buildMaterialSupplementReviewTasks } from './contentMaterialSupplementPolicy';
import { ContentReviewTaskStore } from './contentReviewTaskStore';
import {
  matchedAssetsForRow,
  materialStatusForAssets,
  performanceTagsForAssets,
} from './materialCoverageAssembler';
import { validateMaterialFeedbackInput } from './materialFeedbackPolicy';

function updateRows(input: {
  map: ContentKnowledgeMapRecord;
  approvedAssets: AssetReviewRecord[];
}): { map: ContentKnowledgeMapRecord; updates: ContentMaterialCoverageUpdate[] } {
  const updates: ContentMaterialCoverageUpdate[] = [];
  const nextMap: ContentKnowledgeMapRecord = {
    ...input.map,
    sellingPoints: input.map.sellingPoints.map((row) => updateRow('selling-point', row, input.approvedAssets, updates)),
    painPoints: input.map.painPoints.map((row) => updateRow('pain-point', row, input.approvedAssets, updates)),
    scenarios: input.map.scenarios.map((row) => updateRow('scenario', row, input.approvedAssets, updates)),
    updatedAt: new Date().toISOString(),
  };
  return { map: nextMap, updates };
}

function updateRow(
  targetType: ContentMaterialCoverageUpdate['targetType'],
  row: ContentKnowledgeMapMatrixRow,
  approvedAssets: AssetReviewRecord[],
  updates: ContentMaterialCoverageUpdate[],
): ContentKnowledgeMapMatrixRow {
  const matchedAssets = matchedAssetsForRow(row, approvedAssets);
  if (!matchedAssets.length) return { ...row, materialStatus: row.materialStatus ?? 'missing' };
  const materialRefs = Array.from(new Set([...(row.materialRefs ?? []), ...matchedAssets.map((asset) => asset.id)]));
  const performanceTags = Array.from(new Set([...(row.performanceTags ?? []), ...performanceTagsForAssets(matchedAssets)]));
  const materialStatus = materialStatusForAssets(matchedAssets);
  updates.push({
    rowId: row.id,
    rowTitle: row.title,
    targetType,
    assetReviewIds: matchedAssets.map((asset) => asset.id),
    materialStatus,
    performanceTags,
  });
  return {
    ...row,
    materialStatus,
    materialRefs,
    performanceTags,
  };
}

export class ContentMaterialFeedbackService {
  constructor(
    private readonly maps: ContentKnowledgeMapStore,
    private readonly assets: AssetReviewStore,
    private readonly sync?: ContentMaterialCoverageSyncAdapter,
    private readonly reviewTasks?: ContentReviewTaskStore,
    private readonly reviewSync?: ContentReviewTaskSyncAdapter,
  ) {}

  async writeBack(input: WriteBackContentMaterialCoverageInput): Promise<ContentMaterialCoverageResult> {
    const [maps, reviewedAssets] = await Promise.all([
      this.maps.list(input.workspacePath),
      this.assets.list(input.workspacePath),
    ]);
    const map = input.contentKnowledgeMapId
      ? maps.find((item) => item.id === input.contentKnowledgeMapId)
      : maps[0];
    const selectedIds = new Set(input.assetReviewIds ?? []);
    const scopedAssets = selectedIds.size
      ? reviewedAssets.filter((asset) => selectedIds.has(asset.id))
      : reviewedAssets;
    const approvedAssets = scopedAssets.filter((asset) => asset.status === 'approved');
    const validationIssues = validateMaterialFeedbackInput({ map, reviewedAssets: scopedAssets, approvedAssets });
    if (validationIssues.length || !map) {
      return {
        status: 'blocked',
        issues: validationIssues,
        updatedRowCount: 0,
        reviewedAssetCount: scopedAssets.length,
        approvedAssetCount: approvedAssets.length,
        updates: [],
      };
    }
    const { map: nextMap, updates } = updateRows({ map, approvedAssets });
    if (!updates.length) {
      return {
        status: 'blocked',
        issues: ['已通过素材没有匹配到当前知识地图矩阵行，请给素材补充卖点、场景或 coverage 标签。'],
        contentKnowledgeMap: map,
        updatedRowCount: 0,
        reviewedAssetCount: scopedAssets.length,
        approvedAssetCount: approvedAssets.length,
        updates: [],
      };
    }
    let saved = await this.maps.update(nextMap);
    const coverageChangeId = randomUUID();
    let result: ContentMaterialCoverageResult = {
      status: 'updated',
      issues: [],
      coverageChangeId,
      contentKnowledgeMap: saved,
      updatedRowCount: updates.length,
      reviewedAssetCount: scopedAssets.length,
      approvedAssetCount: approvedAssets.length,
      updates,
      pendingSupplementTaskCount: 0,
      pendingSupplementTasks: [],
    };
    let teamSync: ContentKnowledgeMapTeamSyncSummary | undefined;
    if (this.sync) {
      teamSync = await this.sync.appendMaterialCoverage({
        workspacePath: input.workspacePath,
        contentKnowledgeMapId: saved.id,
        contentKnowledgeMapTitle: saved.title,
        result,
      });
    }
    const pendingSupplementTasks = await this.savePendingSupplementTasks({
      workspacePath: input.workspacePath,
      map: saved,
      updates,
      approvedAssets,
      shouldSync: !teamSync || teamSync.status === 'synced',
    });
    if (pendingSupplementTasks.teamSync) teamSync = pendingSupplementTasks.teamSync;
    if (teamSync) {
      saved = await this.maps.update({
        ...saved,
        syncStatus: teamSync.status,
        teamSync,
      });
    }
    result = {
      ...result,
      contentKnowledgeMap: saved,
      pendingSupplementTaskCount: pendingSupplementTasks.tasks.length,
      pendingSupplementTasks: pendingSupplementTasks.tasks,
      syncStatus: teamSync?.status,
      teamSync,
    };
    return {
      ...result,
    };
  }

  private async savePendingSupplementTasks(input: {
    workspacePath: string;
    map: ContentKnowledgeMapRecord;
    updates: ContentMaterialCoverageUpdate[];
    approvedAssets: AssetReviewRecord[];
    shouldSync: boolean;
  }): Promise<{ tasks: ContentReviewTask[]; teamSync?: ContentKnowledgeMapTeamSyncSummary }> {
    if (!this.reviewTasks) return { tasks: [] };
    const candidates = buildMaterialSupplementReviewTasks(input);
    if (!candidates.length) return { tasks: [] };
    const existing = await this.reviewTasks.list(input.workspacePath);
    const existingKeys = new Set(existing.map((task) => `${task.sourceKnowledgeMapId}:${task.targetType}:${task.targetId ?? task.summary}`));
    const newTasks = candidates.filter((task) => (
      !existingKeys.has(`${task.sourceKnowledgeMapId}:${task.targetType}:${task.targetId ?? task.summary}`)
    ));
    if (!newTasks.length) return { tasks: [] };
    await this.reviewTasks.saveMany(input.workspacePath, newTasks);
    if (!this.reviewSync || !input.shouldSync) return { tasks: newTasks };
    const teamSync = await this.reviewSync.syncReviewTasks({
      workspacePath: input.workspacePath,
      tasks: newTasks,
      authorLabel: '本机工作台',
    });
    const syncedTasks = await this.reviewTasks.updateMany(
      input.workspacePath,
      newTasks.map((task) => ({ ...task, syncStatus: teamSync.status, teamSync })),
    );
    const syncedTaskIds = new Set(newTasks.map((task) => task.id));
    return {
      tasks: syncedTasks.filter((task) => syncedTaskIds.has(task.id)),
      teamSync,
    };
  }
}
