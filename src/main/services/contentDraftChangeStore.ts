import { join } from 'node:path';
import type { ContentDraftChange } from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-draft-changes.json');
}

function sortRecords(records: ContentDraftChange[]): ContentDraftChange[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class ContentDraftChangeStore {
  async list(workspacePath: string): Promise<ContentDraftChange[]> {
    const records = await readJsonFile<ContentDraftChange[]>(filePathFor(workspacePath), []);
    return sortRecords(records);
  }

  async save(record: ContentDraftChange): Promise<ContentDraftChange> {
    return updateJsonFile<ContentDraftChange[], ContentDraftChange>(
      filePathFor(record.workspacePath),
      [],
      (current) => {
        const records = sortRecords(current);
        return {
          value: [record, ...records.filter((item) => item.id !== record.id)],
          result: record,
        };
      },
    );
  }

  async update(record: ContentDraftChange): Promise<ContentDraftChange> {
    return updateJsonFile<ContentDraftChange[], ContentDraftChange>(
      filePathFor(record.workspacePath),
      [],
      (current) => {
        const records = sortRecords(current);
        if (!records.some((item) => item.id === record.id)) throw new Error(`变更包不存在: ${record.id}`);
        const updated: ContentDraftChange = { ...record, updatedAt: new Date().toISOString() };
        return {
          value: records.map((item) => (item.id === record.id ? updated : item)),
          result: updated,
        };
      },
    );
  }
}
