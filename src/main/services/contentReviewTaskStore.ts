import { join } from 'node:path';
import type { ContentReviewTask } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-review-tasks.json');
}

export class ContentReviewTaskStore {
  async list(workspacePath: string): Promise<ContentReviewTask[]> {
    const records = await readJsonFile<ContentReviewTask[]>(filePathFor(workspacePath), []);
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async saveMany(workspacePath: string, tasks: ContentReviewTask[]): Promise<ContentReviewTask[]> {
    const existing = await this.list(workspacePath);
    const existingKeys = new Set(existing.map((task) => `${task.sourceKnowledgeMapId}:${task.targetType}:${task.targetId ?? task.summary}`));
    const nextTasks = tasks.filter((task) => !existingKeys.has(`${task.sourceKnowledgeMapId}:${task.targetType}:${task.targetId ?? task.summary}`));
    const next = [...nextTasks, ...existing].slice(0, 240);
    await writeJsonFile(filePathFor(workspacePath), next);
    return next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async update(input: ContentReviewTask): Promise<ContentReviewTask> {
    const records = await this.list(input.workspacePath);
    if (!records.some((record) => record.id === input.id)) throw new Error(`审核任务不存在: ${input.id}`);
    const updated: ContentReviewTask = { ...input, updatedAt: new Date().toISOString() };
    await writeJsonFile(filePathFor(input.workspacePath), records.map((record) => (record.id === input.id ? updated : record)));
    return updated;
  }

  async updateMany(workspacePath: string, inputs: ContentReviewTask[]): Promise<ContentReviewTask[]> {
    if (!inputs.length) return this.list(workspacePath);
    const records = await this.list(workspacePath);
    const updates = new Map(inputs.map((task) => [task.id, task]));
    const now = new Date().toISOString();
    await writeJsonFile(
      filePathFor(workspacePath),
      records.map((record) => (updates.has(record.id) ? { ...updates.get(record.id)!, updatedAt: now } : record)),
    );
    return this.list(workspacePath);
  }
}
