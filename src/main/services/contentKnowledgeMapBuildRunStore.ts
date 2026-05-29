import { join } from 'node:path';
import type { ContentKnowledgeMapBuildRunRecord } from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-knowledge-map-build-runs.json');
}

function sortRecords(records: ContentKnowledgeMapBuildRunRecord[]): ContentKnowledgeMapBuildRunRecord[] {
  return [...records].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export class ContentKnowledgeMapBuildRunStore {
  async list(workspacePath: string): Promise<ContentKnowledgeMapBuildRunRecord[]> {
    const records = await readJsonFile<ContentKnowledgeMapBuildRunRecord[]>(filePathFor(workspacePath), []);
    return sortRecords(records);
  }

  async save(record: ContentKnowledgeMapBuildRunRecord): Promise<ContentKnowledgeMapBuildRunRecord> {
    return updateJsonFile<ContentKnowledgeMapBuildRunRecord[], ContentKnowledgeMapBuildRunRecord>(
      filePathFor(record.workspacePath),
      [],
      (current) => ({
        value: [record, ...sortRecords(current).filter((item) => item.id !== record.id)],
        result: record,
      }),
    );
  }
}
