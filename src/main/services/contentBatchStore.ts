import { join } from 'node:path';
import type { ContentBatchRecord } from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-batches.json');
}

function sortRecords(records: ContentBatchRecord[]): ContentBatchRecord[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export class ContentBatchStore {
  async list(workspacePath: string): Promise<ContentBatchRecord[]> {
    const records = await readJsonFile<ContentBatchRecord[]>(filePathFor(workspacePath), []);
    return sortRecords(records);
  }

  async save(record: ContentBatchRecord): Promise<ContentBatchRecord> {
    return updateJsonFile<ContentBatchRecord[], ContentBatchRecord>(
      filePathFor(record.workspacePath),
      [],
      (records) => ({
        value: [record, ...sortRecords(records).filter((item) => item.id !== record.id)],
        result: record,
      }),
    );
  }
}
