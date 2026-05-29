import { join } from 'node:path';
import type { ContentDraftChange } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-draft-changes.json');
}

export class ContentDraftChangeStore {
  async list(workspacePath: string): Promise<ContentDraftChange[]> {
    const records = await readJsonFile<ContentDraftChange[]>(filePathFor(workspacePath), []);
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(record: ContentDraftChange): Promise<ContentDraftChange> {
    const records = await this.list(record.workspacePath);
    const next = [record, ...records.filter((item) => item.id !== record.id)].slice(0, 240);
    await writeJsonFile(filePathFor(record.workspacePath), next);
    return record;
  }

  async update(record: ContentDraftChange): Promise<ContentDraftChange> {
    const records = await this.list(record.workspacePath);
    if (!records.some((item) => item.id === record.id)) throw new Error(`变更包不存在: ${record.id}`);
    const updated: ContentDraftChange = { ...record, updatedAt: new Date().toISOString() };
    await writeJsonFile(filePathFor(record.workspacePath), records.map((item) => (item.id === record.id ? updated : item)));
    return updated;
  }
}
