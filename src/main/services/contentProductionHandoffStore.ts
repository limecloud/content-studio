import { join } from 'node:path';
import type { ContentProductionHandoffRecord } from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-production-handoffs.json');
}

function sortRecords(records: ContentProductionHandoffRecord[]): ContentProductionHandoffRecord[] {
  return [...records].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export class ContentProductionHandoffStore {
  async list(workspacePath: string): Promise<ContentProductionHandoffRecord[]> {
    const records = await readJsonFile<ContentProductionHandoffRecord[]>(filePathFor(workspacePath), []);
    return sortRecords(records);
  }

  async append(record: ContentProductionHandoffRecord): Promise<ContentProductionHandoffRecord> {
    return updateJsonFile<ContentProductionHandoffRecord[], ContentProductionHandoffRecord>(
      filePathFor(record.workspacePath),
      [],
      (records) => ({
        value: [record, ...sortRecords(records).filter((item) => item.id !== record.id)],
        result: record,
      }),
    );
  }
}
