import { join } from 'node:path';
import type { BrandCommandCenterRecord } from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'brand-command-centers.json');
}

function sortRecords(records: BrandCommandCenterRecord[]): BrandCommandCenterRecord[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function assertActionRecordsAppendOnly(existing: BrandCommandCenterRecord, next: BrandCommandCenterRecord): void {
  const nextActionIds = new Set(next.actionRecords.map((record) => record.id));
  const missingAction = existing.actionRecords.find((record) => !nextActionIds.has(record.id));
  if (missingAction) throw new Error(`品牌战情室行动记录只能追加，不能删除已有记录: ${missingAction.id}`);
}

export class BrandCommandCenterStore {
  async list(workspacePath: string): Promise<BrandCommandCenterRecord[]> {
    const records = await readJsonFile<BrandCommandCenterRecord[]>(filePathFor(workspacePath), []);
    return sortRecords(records);
  }

  async save(record: BrandCommandCenterRecord): Promise<BrandCommandCenterRecord> {
    return updateJsonFile<BrandCommandCenterRecord[], BrandCommandCenterRecord>(
      filePathFor(record.workspacePath),
      [],
      (records) => ({
        value: [record, ...sortRecords(records).filter((item) => item.id !== record.id)],
        result: record,
      }),
    );
  }

  async update(input: BrandCommandCenterRecord): Promise<BrandCommandCenterRecord> {
    return updateJsonFile<BrandCommandCenterRecord[], BrandCommandCenterRecord>(
      filePathFor(input.workspacePath),
      [],
      (current) => {
        const records = sortRecords(current);
        const existing = records.find((record) => record.id === input.id);
        if (!existing) throw new Error(`品牌战情室不存在: ${input.id}`);
        assertActionRecordsAppendOnly(existing, input);
        const updated: BrandCommandCenterRecord = { ...input, updatedAt: new Date().toISOString() };
        return {
          value: records.map((record) => (record.id === input.id ? updated : record)),
          result: updated,
        };
      },
    );
  }
}
