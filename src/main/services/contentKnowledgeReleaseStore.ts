import { join } from 'node:path';
import type { ContentKnowledgeRelease } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-knowledge-releases.json');
}

export class ContentKnowledgeReleaseStore {
  async list(workspacePath: string): Promise<ContentKnowledgeRelease[]> {
    const records = await readJsonFile<ContentKnowledgeRelease[]>(filePathFor(workspacePath), []);
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async save(record: ContentKnowledgeRelease): Promise<ContentKnowledgeRelease> {
    const records = await this.list(record.workspacePath);
    const next = [record, ...records.filter((item) => item.id !== record.id)].slice(0, 120);
    await writeJsonFile(filePathFor(record.workspacePath), next);
    return record;
  }

  async update(record: ContentKnowledgeRelease): Promise<ContentKnowledgeRelease> {
    const records = await this.list(record.workspacePath);
    if (!records.some((item) => item.id === record.id)) throw new Error(`团队知识包版本不存在: ${record.id}`);
    const updated: ContentKnowledgeRelease = { ...record, updatedAt: new Date().toISOString() };
    await writeJsonFile(filePathFor(record.workspacePath), records.map((item) => (item.id === record.id ? updated : item)));
    return updated;
  }
}
