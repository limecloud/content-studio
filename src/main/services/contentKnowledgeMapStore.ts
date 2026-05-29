import { join } from 'node:path';
import type { ContentKnowledgeMapRecord } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-knowledge-maps.json');
}

export class ContentKnowledgeMapStore {
  async list(workspacePath: string): Promise<ContentKnowledgeMapRecord[]> {
    const records = await readJsonFile<ContentKnowledgeMapRecord[]>(filePathFor(workspacePath), []);
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(record: ContentKnowledgeMapRecord): Promise<ContentKnowledgeMapRecord> {
    const existing = await this.list(record.workspacePath);
    await writeJsonFile(filePathFor(record.workspacePath), [record, ...existing].slice(0, 60));
    return record;
  }

  async update(input: ContentKnowledgeMapRecord): Promise<ContentKnowledgeMapRecord> {
    const records = await this.list(input.workspacePath);
    if (!records.some((record) => record.id === input.id)) throw new Error(`内容知识地图不存在: ${input.id}`);
    const updated: ContentKnowledgeMapRecord = { ...input, updatedAt: new Date().toISOString() };
    await writeJsonFile(filePathFor(input.workspacePath), records.map((record) => (record.id === input.id ? updated : record)));
    return updated;
  }
}
