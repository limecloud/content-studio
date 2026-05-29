import { join } from 'node:path';
import type { ContentProductionHandoffRecord } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-production-handoffs.json');
}

export class ContentProductionHandoffStore {
  async list(workspacePath: string): Promise<ContentProductionHandoffRecord[]> {
    const records = await readJsonFile<ContentProductionHandoffRecord[]>(filePathFor(workspacePath), []);
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async append(record: ContentProductionHandoffRecord): Promise<ContentProductionHandoffRecord> {
    const existing = await this.list(record.workspacePath);
    await writeJsonFile(filePathFor(record.workspacePath), [record, ...existing].slice(0, 240));
    return record;
  }
}
