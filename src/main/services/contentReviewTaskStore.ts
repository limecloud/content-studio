import { join } from 'node:path';
import type { ContentReviewTask } from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-review-tasks.json');
}

function sortTasks(tasks: ContentReviewTask[]): ContentReviewTask[] {
  return [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function assertDecisionsAppendOnly(existing: ContentReviewTask, next: ContentReviewTask): void {
  const nextDecisionIds = new Set(next.decisions.map((decision) => decision.id));
  const missingDecision = existing.decisions.find((decision) => !nextDecisionIds.has(decision.id));
  if (missingDecision) throw new Error(`审核决策只能追加，不能删除已有决策: ${missingDecision.id}`);
}

function taskDedupKey(task: ContentReviewTask): string {
  return `${task.sourceKnowledgeMapId}:${task.targetType}:${task.taskPurpose ?? 'review'}:${task.targetId ?? task.summary}`;
}

export class ContentReviewTaskStore {
  async list(workspacePath: string): Promise<ContentReviewTask[]> {
    const records = await readJsonFile<ContentReviewTask[]>(filePathFor(workspacePath), []);
    return sortTasks(records);
  }

  async saveMany(workspacePath: string, tasks: ContentReviewTask[]): Promise<ContentReviewTask[]> {
    return updateJsonFile<ContentReviewTask[], ContentReviewTask[]>(
      filePathFor(workspacePath),
      [],
      (current) => {
        const existing = sortTasks(current);
        const existingKeys = new Set(existing.map(taskDedupKey));
        const nextTasks = tasks.filter((task) => !existingKeys.has(taskDedupKey(task)));
        const next = [...nextTasks, ...existing];
        return {
          value: next,
          result: sortTasks(next),
        };
      },
    );
  }

  async update(input: ContentReviewTask): Promise<ContentReviewTask> {
    return updateJsonFile<ContentReviewTask[], ContentReviewTask>(
      filePathFor(input.workspacePath),
      [],
      (current) => {
        const records = sortTasks(current);
        const existing = records.find((record) => record.id === input.id);
        if (!existing) throw new Error(`审核任务不存在: ${input.id}`);
        assertDecisionsAppendOnly(existing, input);
        const updated: ContentReviewTask = { ...input, updatedAt: new Date().toISOString() };
        return {
          value: records.map((record) => (record.id === input.id ? updated : record)),
          result: updated,
        };
      },
    );
  }

  async updateMany(workspacePath: string, inputs: ContentReviewTask[]): Promise<ContentReviewTask[]> {
    if (!inputs.length) return this.list(workspacePath);
    return updateJsonFile<ContentReviewTask[], ContentReviewTask[]>(
      filePathFor(workspacePath),
      [],
      (current) => {
        const records = sortTasks(current);
        const updates = new Map(inputs.map((task) => [task.id, task]));
        const now = new Date().toISOString();
        const next = records.map((record) => {
          const update = updates.get(record.id);
          if (!update) return record;
          assertDecisionsAppendOnly(record, update);
          return { ...update, updatedAt: now };
        });
        return {
          value: next,
          result: sortTasks(next),
        };
      },
    );
  }
}
