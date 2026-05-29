import { join } from 'node:path';
import type { BrandCommandCenterRecord } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'brand-command-centers.json');
}

export class BrandCommandCenterStore {
  async list(workspacePath: string): Promise<BrandCommandCenterRecord[]> {
    const records = await readJsonFile<BrandCommandCenterRecord[]>(filePathFor(workspacePath), []);
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(record: BrandCommandCenterRecord): Promise<BrandCommandCenterRecord> {
    const existing = await this.list(record.workspacePath);
    await writeJsonFile(filePathFor(record.workspacePath), [record, ...existing].slice(0, 60));
    return record;
  }

  async update(input: BrandCommandCenterRecord): Promise<BrandCommandCenterRecord> {
    const records = await this.list(input.workspacePath);
    if (!records.some((record) => record.id === input.id)) throw new Error(`品牌战情室不存在: ${input.id}`);
    const updated: BrandCommandCenterRecord = { ...input, updatedAt: new Date().toISOString() };
    await writeJsonFile(filePathFor(input.workspacePath), records.map((record) => (record.id === input.id ? updated : record)));
    return updated;
  }
}
