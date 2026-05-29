import { join } from 'node:path';
import type { ContentKnowledgeRelease } from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'content-knowledge-releases.json');
}

function sortRecords(records: ContentKnowledgeRelease[]): ContentKnowledgeRelease[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function sameRelease(left: ContentKnowledgeRelease, right: ContentKnowledgeRelease): boolean {
  return left.id === right.id ||
    (Boolean(left.serverReleaseId) && left.serverReleaseId === right.serverReleaseId) ||
    (Boolean(left.serverReleaseId) && left.serverReleaseId === right.id) ||
    (Boolean(right.serverReleaseId) && left.id === right.serverReleaseId);
}

function arrayEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function changedPublishedFields(
  existing: ContentKnowledgeRelease,
  next: ContentKnowledgeRelease,
): string[] {
  if (existing.status !== 'published') return [];
  const changed: string[] = [];
  const compare = <K extends keyof ContentKnowledgeRelease>(key: K, label: string) => {
    if ((existing[key] ?? undefined) !== (next[key] ?? undefined)) changed.push(label);
  };
  compare('workspaceId', '团队工作区');
  compare('contentKnowledgeMapId', '来源内容知识地图');
  compare('contentKnowledgeMapTitle', '来源内容知识地图标题');
  compare('title', '版本标题');
  compare('version', '版本号');
  compare('status', '发布状态');
  compare('packageDir', '本机包目录');
  compare('knowledgePath', '知识文件路径');
  compare('manifestPath', '清单文件路径');
  compare('packageArchivePath', '发布包路径');
  compare('packageArchiveFileName', '发布包文件名');
  compare('packageArchiveSha256', '发布包 sha256');
  compare('packageArchiveSize', '发布包大小');
  compare('packageObjectKey', '对象存储 key');
  compare('packagePublicUrl', '公开包地址');
  compare('packageStorageProvider', '对象存储服务');
  compare('packageUploadStatus', '上传状态');
  compare('baseRevision', '来源版本基线');
  compare('serverReleaseId', '服务端版本 ID');
  if (!arrayEqual(existing.files, next.files)) changed.push('包文件清单');
  return changed;
}

function assertCanOverwriteLocally(existing: ContentKnowledgeRelease | undefined, next: ContentKnowledgeRelease): void {
  if (!existing) return;
  const changed = changedPublishedFields(existing, next);
  if (!changed.length) return;
  throw new Error(`已发布团队知识包版本不能原地修改：${changed.join('、')}。请创建新版本或从 Bugu 团队工作区同步。`);
}

function mergeTeamRelease(
  existing: ContentKnowledgeRelease | undefined,
  next: ContentKnowledgeRelease,
): ContentKnowledgeRelease {
  if (!existing) return next;
  return {
    ...existing,
    ...next,
    packageDir: existing.packageDir,
    knowledgePath: existing.knowledgePath,
    manifestPath: existing.manifestPath,
    packageArchivePath: existing.packageArchivePath,
    packageArchiveFileName: existing.packageArchiveFileName,
  };
}

export class ContentKnowledgeReleaseStore {
  async list(workspacePath: string): Promise<ContentKnowledgeRelease[]> {
    const records = await readJsonFile<ContentKnowledgeRelease[]>(filePathFor(workspacePath), []);
    return sortRecords(records);
  }

  async save(record: ContentKnowledgeRelease): Promise<ContentKnowledgeRelease> {
    return updateJsonFile<ContentKnowledgeRelease[], ContentKnowledgeRelease>(
      filePathFor(record.workspacePath),
      [],
      (current) => {
        const records = sortRecords(current);
        const existing = records.find((item) => sameRelease(item, record));
        assertCanOverwriteLocally(existing, record);
        return {
          value: [record, ...records.filter((item) => !sameRelease(item, record))],
          result: record,
        };
      },
    );
  }

  async syncFromTeam(record: ContentKnowledgeRelease): Promise<ContentKnowledgeRelease> {
    return updateJsonFile<ContentKnowledgeRelease[], ContentKnowledgeRelease>(
      filePathFor(record.workspacePath),
      [],
      (current) => {
        const records = sortRecords(current);
        const existing = records.find((item) => sameRelease(item, record));
        const synced = mergeTeamRelease(existing, record);
        return {
          value: [synced, ...records.filter((item) => !sameRelease(item, synced))],
          result: synced,
        };
      },
    );
  }

  async update(record: ContentKnowledgeRelease): Promise<ContentKnowledgeRelease> {
    return updateJsonFile<ContentKnowledgeRelease[], ContentKnowledgeRelease>(
      filePathFor(record.workspacePath),
      [],
      (current) => {
        const records = sortRecords(current);
        const existing = records.find((item) => sameRelease(item, record));
        if (!existing) throw new Error(`团队知识包版本不存在: ${record.id}`);
        const updated: ContentKnowledgeRelease = { ...record, updatedAt: new Date().toISOString() };
        assertCanOverwriteLocally(existing, updated);
        return {
          value: records.map((item) => (sameRelease(item, updated) ? updated : item)),
          result: updated,
        };
      },
    );
  }
}
