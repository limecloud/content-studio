import { join } from 'node:path';
import type { ContentKnowledgeMapRecord } from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-knowledge-maps.json');
}

function sortRecords(records: ContentKnowledgeMapRecord[]): ContentKnowledgeMapRecord[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class ContentKnowledgeMapStore {
  async list(workspacePath: string): Promise<ContentKnowledgeMapRecord[]> {
    const records = await readJsonFile<ContentKnowledgeMapRecord[]>(filePathFor(workspacePath), []);
    return sortRecords(records);
  }

  async save(record: ContentKnowledgeMapRecord): Promise<ContentKnowledgeMapRecord> {
    return updateJsonFile<ContentKnowledgeMapRecord[], ContentKnowledgeMapRecord>(
      filePathFor(record.workspacePath),
      [],
      (records) => ({
        value: [record, ...sortRecords(records).filter((item) => item.id !== record.id)],
        result: record,
      }),
    );
  }

  async update(input: ContentKnowledgeMapRecord): Promise<ContentKnowledgeMapRecord> {
    return updateJsonFile<ContentKnowledgeMapRecord[], ContentKnowledgeMapRecord>(
      filePathFor(input.workspacePath),
      [],
      (current) => {
        const records = sortRecords(current);
        if (!records.some((record) => record.id === input.id)) throw new Error(`内容知识地图不存在: ${input.id}`);
        const updated: ContentKnowledgeMapRecord = { ...input, updatedAt: new Date().toISOString() };
        return {
          value: records.map((record) => (record.id === input.id ? updated : record)),
          result: updated,
        };
      },
    );
  }
}
