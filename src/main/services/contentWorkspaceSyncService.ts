import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type {
  ContentDraftChange,
  ContentKnowledgeRelease,
  ContentKnowledgeMapRecord,
  ContentKnowledgeMapMatrixRow,
  ContentSyncConflictAffectedObject,
  ContentSyncConflict,
  ContentSyncConflictResolutionAction,
  ContentWorkspaceSyncResult,
  CreateContentDraftChangeInput,
  CreateContentKnowledgeReleaseInput,
  ExportContentDraftChangeInput,
  ImportContentDraftChangeInput,
  ResolveContentSyncConflictInput,
  SubmitContentDraftChangeInput,
} from '../../shared/types';
import { AgentKnowledgeContentExportService } from './agentKnowledgeContentExportService';
import type { ContentWorkspaceSyncAdapter } from './buguContentWorkspaceSyncAdapter';
import { ContentDraftChangeStore } from './contentDraftChangeStore';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import { ContentKnowledgeReleaseStore } from './contentKnowledgeReleaseStore';
import { contentKnowledgeMapSensitiveIssues } from './contentKnowledgeMapSensitivityPolicy';
import { writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function affectedObjectIds(map: ContentKnowledgeMapRecord): string[] {
  return Array.from(new Set([
    map.id,
    ...map.sellingPoints.map((row) => row.id),
    ...map.painPoints.map((row) => row.id),
    ...map.scenarios.map((row) => row.id),
    ...map.evidence.map((item) => item.id),
  ])).slice(0, 500);
}

function compactText(value: string | undefined, fallback: string, maxLength = 120): string {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return fallback;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function matrixRowAffectedObject(
  objectType: ContentSyncConflictAffectedObject['objectType'],
  row: ContentKnowledgeMapMatrixRow,
): ContentSyncConflictAffectedObject {
  return {
    id: `${objectType}:${row.id}`,
    objectId: row.id,
    objectType,
    title: row.title,
    summary: compactText(row.summary, '本机变更影响该内容项。'),
    localValue: [
      row.status === 'ready' ? '可交付' : row.status === 'needs-review' ? '待审核' : '缺证据',
      row.evidenceRefs.length ? `${row.evidenceRefs.length} 条证据` : '缺少证据',
      row.sourceRefs.length ? `${row.sourceRefs.length} 个来源` : '缺少来源',
    ].join(' / '),
    teamValue: '团队工作区已有更新，需要拉取当前团队版本后再判断是否保留本机修改。',
    impact: row.status === 'ready' ? 'high' : 'medium',
    recommendation: '先保留团队当前版本，重新同步后把本机修改拆成新的变更包提交。',
  };
}

function affectedObjects(map: ContentKnowledgeMapRecord): ContentSyncConflictAffectedObject[] {
  const details: ContentSyncConflictAffectedObject[] = [{
    id: `content-map:${map.id}`,
    objectId: map.id,
    objectType: 'content-map',
    title: map.title,
    summary: '本机变更包会影响这张内容知识地图的矩阵、证据和资料缺口。',
    localValue: [
      `${map.sellingPoints.length} 个卖点`,
      `${map.painPoints.length} 个痛点`,
      `${map.scenarios.length} 个场景`,
      `${map.evidence.length} 条证据`,
      `${map.gaps.length} 个缺口`,
    ].join(' / '),
    teamValue: '团队工作区当前版本已前进，本机提交不是基于最新版本。',
    impact: 'high',
    recommendation: '先同步团队当前版本，再由内容负责人决定保留、改写或重新提交本机变更。',
  }];

  details.push(...map.sellingPoints.slice(0, 4).map((row) => matrixRowAffectedObject('selling-point', row)));
  details.push(...map.painPoints.slice(0, 3).map((row) => matrixRowAffectedObject('pain-point', row)));
  details.push(...map.scenarios.slice(0, 3).map((row) => matrixRowAffectedObject('scenario', row)));
  details.push(...map.evidence.slice(0, 3).map((item) => ({
    id: `evidence:${item.id}`,
    objectId: item.id,
    objectType: 'evidence' as const,
    title: item.sourceTitle,
    summary: compactText(item.excerpt, '本机变更影响该证据引用。', 100),
    localValue: item.status === 'ready' ? '可引用证据' : item.status === 'missing' ? '缺证据' : '待确认',
    teamValue: '团队工作区已有更新，证据是否仍适用需要重新确认。',
    impact: item.status === 'ready' ? 'medium' as const : 'high' as const,
    recommendation: '重新同步后检查证据引用，避免把已过期或待确认材料带入生产。',
  })));
  details.push(...map.gaps.slice(0, 3).map((gap, index) => ({
    id: `gap:${map.id}:${index}`,
    objectId: map.id,
    objectType: 'gap' as const,
    title: `资料缺口 ${index + 1}`,
    summary: compactText(gap, '本机变更记录了待补资料。'),
    localValue: '本机仍有资料缺口',
    teamValue: '团队工作区可能已有其他成员补充，需要重新同步确认。',
    impact: 'medium' as const,
    recommendation: '先确认团队是否已补齐，再决定是否保留这条待补资料。',
  })));

  return details.slice(0, 16);
}

function releaseVersion(): string {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('.');
  return `v${date}.${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

function safePackageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 96) || randomUUID();
}

function portableDraftChange(change: ContentDraftChange): Omit<ContentDraftChange, 'workspacePath' | 'syncStatus' | 'issues' | 'createdAt' | 'updatedAt'> {
  return {
    id: change.id,
    workspaceId: change.workspaceId,
    contentKnowledgeMapId: change.contentKnowledgeMapId,
    contentKnowledgeMapTitle: change.contentKnowledgeMapTitle,
    title: change.title,
    summary: change.summary,
    kind: change.kind,
    affectedObjectIds: change.affectedObjectIds,
    affectedObjects: change.affectedObjects,
    baseRevision: change.baseRevision,
    authorLabel: change.authorLabel,
  };
}

function portablePackageIssues(value: unknown): string[] {
  const text = JSON.stringify(value);
  return [
    /api[_-]?key|secret|token|password|sk-[A-Za-z0-9]/i.test(text)
      ? '离线变更包包含疑似密钥或凭证，不能导出或导入。'
      : '',
    /\/Users\/|C:\\\\|\/home\//.test(text)
      ? '离线变更包包含本机绝对路径，不能导出或导入。'
      : '',
  ].filter(Boolean);
}

async function readJsonPayload<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf-8')) as T;
}

export class ContentWorkspaceSyncService {
  constructor(
    private readonly maps: ContentKnowledgeMapStore,
    private readonly draftChanges: ContentDraftChangeStore,
    private readonly releases: ContentKnowledgeReleaseStore,
    private readonly exporter: AgentKnowledgeContentExportService,
    private readonly adapter: ContentWorkspaceSyncAdapter,
  ) {}

  listDraftChanges(workspacePath: string): Promise<ContentDraftChange[]> {
    return this.draftChanges.list(workspacePath);
  }

  async listReleases(workspacePath: string): Promise<ContentKnowledgeRelease[]> {
    const localReleases = await this.releases.list(workspacePath);
    const map = await this.findMap(workspacePath);
    if (!this.adapter.listReleases || !map?.teamSync.workspaceId) return localReleases;
    try {
      const remoteReleases = await this.adapter.listReleases({
        workspacePath,
        workspaceId: map.teamSync.workspaceId,
      });
      for (const release of remoteReleases) {
        const existing = localReleases.find((item) => item.id === release.id || item.serverReleaseId === release.serverReleaseId);
        await this.releases.syncFromTeam({
          ...(existing ?? {}),
          ...release,
          packageObjectKey: release.packageObjectKey || existing?.packageObjectKey,
          packagePublicUrl: release.packagePublicUrl || existing?.packagePublicUrl,
          packageStorageProvider: release.packageStorageProvider || existing?.packageStorageProvider,
          packageUploadStatus: release.packageUploadStatus || existing?.packageUploadStatus,
          packageArchiveSha256: release.packageArchiveSha256 || existing?.packageArchiveSha256,
          packageArchiveSize: release.packageArchiveSize || existing?.packageArchiveSize,
          packageDir: existing?.packageDir,
          knowledgePath: existing?.knowledgePath,
          manifestPath: existing?.manifestPath,
          packageArchivePath: existing?.packageArchivePath,
          packageArchiveFileName: existing?.packageArchiveFileName,
          files: release.files.length ? release.files : existing?.files || [],
          issues: release.issues.length ? release.issues : existing?.issues || [],
        });
      }
      return this.releases.list(workspacePath);
    } catch {
      return localReleases;
    }
  }

  async listSyncConflicts(workspacePath: string): Promise<ContentSyncConflict[]> {
    const map = await this.findMap(workspacePath);
    try {
      return await this.adapter.listSyncConflicts({
        workspacePath,
        workspaceId: map?.teamSync.workspaceId,
      });
    } catch {
      return [];
    }
  }

  async resolveSyncConflict(input: ResolveContentSyncConflictInput): Promise<ContentSyncConflict | null> {
    const resolved = await this.adapter.resolveSyncConflict(input);
    if (resolved?.status === 'resolved') {
      await this.markResolvedSyncConflict(input.workspacePath, resolved);
    }
    return resolved;
  }

  async createDraftChange(input: CreateContentDraftChangeInput): Promise<ContentWorkspaceSyncResult> {
    const map = await this.findMap(input.workspacePath, input.contentKnowledgeMapId);
    if (!map) return { status: 'blocked', issues: ['请先生成内容知识地图。'] };
    const issues = contentKnowledgeMapSensitiveIssues(map);
    const now = new Date().toISOString();
    const draftChange: ContentDraftChange = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      workspaceId: map.teamSync.workspaceId,
      contentKnowledgeMapId: map.id,
      contentKnowledgeMapTitle: map.title,
      title: `${map.title} 变更包`,
      summary: [
        `${map.sellingPoints.length} 个卖点`,
        `${map.painPoints.length} 个痛点`,
        `${map.scenarios.length} 个场景`,
        `${map.evidence.length} 条证据`,
        `${map.gaps.length} 个缺口`,
      ].join(' / '),
      kind: 'knowledge-map-updated',
      affectedObjectIds: affectedObjectIds(map),
      affectedObjects: affectedObjects(map),
      baseRevision: map.teamSync.revision ?? map.teamSync.baseRevision,
      syncStatus: issues.length ? 'blocked' : 'local-draft',
      authorLabel: input.authorLabel?.trim() || '本机工作台',
      issues,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.draftChanges.save(draftChange);
    return { status: issues.length ? 'blocked' : 'created', issues, draftChange: saved, teamSync: map.teamSync };
  }

  async submitDraftChange(input: SubmitContentDraftChangeInput): Promise<ContentWorkspaceSyncResult> {
    const changes = await this.draftChanges.list(input.workspacePath);
    const draftChange = changes.find((item) => item.id === input.draftChangeId);
    if (!draftChange) return { status: 'blocked', issues: ['变更包不存在。'] };
    if (draftChange.issues.length) return { status: 'blocked', issues: draftChange.issues, draftChange };
    const pending: ContentDraftChange = {
      ...draftChange,
      syncStatus: 'pending-sync',
      authorLabel: input.authorLabel?.trim() || draftChange.authorLabel,
      updatedAt: new Date().toISOString(),
    };
    await this.draftChanges.update(pending);
    const teamSync = await this.adapter.submitDraftChange(pending);
    const synced: ContentDraftChange = {
      ...pending,
      syncStatus: teamSync.status === 'synced' ? 'synced' : teamSync.status === 'conflict' ? 'conflict' : 'blocked',
      issues: teamSync.status === 'synced' ? [] : [teamSync.message],
      updatedAt: new Date().toISOString(),
    };
    const saved = await this.draftChanges.update(synced);
    if (teamSync.status === 'synced') {
      await this.updateMapSync(input.workspacePath, draftChange.contentKnowledgeMapId, teamSync);
    } else if (teamSync.status === 'conflict') {
      await this.markMapSyncConflict(input.workspacePath, draftChange.contentKnowledgeMapId, teamSync);
    }
    return {
      status: teamSync.status === 'synced' ? 'submitted' : teamSync.status === 'conflict' ? 'conflict' : 'blocked',
      issues: saved.issues,
      teamSync,
      draftChange: saved,
    };
  }

  async exportDraftChange(input: ExportContentDraftChangeInput): Promise<ContentWorkspaceSyncResult> {
    const changes = await this.draftChanges.list(input.workspacePath);
    const draftChange = changes.find((item) => item.id === input.draftChangeId);
    if (!draftChange) return { status: 'blocked', issues: ['变更包不存在。'] };
    const portable = portableDraftChange(draftChange);
    const manifest = {
      schema: 'buguai.content-draft-change.v1',
      exportedAt: new Date().toISOString(),
      contentKnowledgeMapId: portable.contentKnowledgeMapId,
      contentKnowledgeMapTitle: portable.contentKnowledgeMapTitle,
      title: portable.title,
      baseRevision: portable.baseRevision,
      files: {
        draftChange: 'draft-change.json',
        importGuide: 'import-guide.md',
      },
    };
    const issues = portablePackageIssues({ manifest, draftChange: portable });
    if (issues.length) return { status: 'blocked', issues, draftChange };
    const packageDir = join(
      getWorkspaceDataDir(input.workspacePath),
      'exports',
      'content-draft-changes',
      safePackageSegment(`${draftChange.contentKnowledgeMapTitle}-${draftChange.id}`),
    );
    await mkdir(packageDir, { recursive: true });
    const manifestPath = join(packageDir, 'manifest.json');
    const draftChangePath = join(packageDir, 'draft-change.json');
    const importGuidePath = join(packageDir, 'import-guide.md');
    await writeJsonFile(manifestPath, manifest);
    await writeJsonFile(draftChangePath, portable);
    await writeFile(importGuidePath, [
      '# 内容变更包导入说明',
      '',
      '这个包用于离线交付或审计归档。导入后会成为当前工作区的本机变更包，需要人工提交到团队工作区。',
      '',
      '- `manifest.json`：包结构和来源摘要。',
      '- `draft-change.json`：变更摘要、影响对象和团队版本基线。',
      '',
    ].join('\n'), 'utf-8');
    return {
      status: 'exported',
      issues: [],
      draftChange,
      packageDir,
      manifestPath,
      draftChangePath,
      files: ['manifest.json', 'draft-change.json', 'import-guide.md'],
    };
  }

  async importDraftChange(input: ImportContentDraftChangeInput): Promise<ContentWorkspaceSyncResult> {
    const rawPackagePath = input.packagePath?.trim();
    if (!rawPackagePath) return { status: 'blocked', issues: ['请选择要导入的变更包。'] };
    const packageDir = rawPackagePath.endsWith('.json') ? dirname(rawPackagePath) : rawPackagePath;
    const manifestPath = rawPackagePath.endsWith('manifest.json') ? rawPackagePath : join(packageDir, 'manifest.json');
    if (!existsSync(manifestPath)) return { status: 'blocked', issues: ['没有找到变更包 manifest.json。'] };
    try {
      const manifest = await readJsonPayload<{
        schema?: string;
        files?: { draftChange?: string };
      }>(manifestPath);
      if (manifest.schema !== 'buguai.content-draft-change.v1') {
        return { status: 'blocked', issues: ['变更包格式不匹配。'] };
      }
      const draftChangeFile = manifest.files?.draftChange || 'draft-change.json';
      const draftChangePath = join(packageDir, draftChangeFile);
      if (!existsSync(draftChangePath)) return { status: 'blocked', issues: ['没有找到变更内容文件。'] };
      const portable = await readJsonPayload<Partial<ContentDraftChange>>(draftChangePath);
      const issues = portablePackageIssues({ manifest, draftChange: portable });
      if (issues.length) return { status: 'blocked', issues, packageDir, manifestPath, draftChangePath };
      const now = new Date().toISOString();
      const draftChange: ContentDraftChange = {
        id: randomUUID(),
        workspacePath: input.workspacePath,
        workspaceId: typeof portable.workspaceId === 'string' ? portable.workspaceId : undefined,
        contentKnowledgeMapId: typeof portable.contentKnowledgeMapId === 'string' && portable.contentKnowledgeMapId.trim()
          ? portable.contentKnowledgeMapId
          : `imported-map-${Date.now()}`,
        contentKnowledgeMapTitle: typeof portable.contentKnowledgeMapTitle === 'string' && portable.contentKnowledgeMapTitle.trim()
          ? portable.contentKnowledgeMapTitle
          : '导入内容知识地图',
        title: typeof portable.title === 'string' && portable.title.trim() ? portable.title : `导入变更包 ${basename(packageDir)}`,
        summary: typeof portable.summary === 'string' && portable.summary.trim() ? portable.summary : '离线导入的内容变更包。',
        kind: portable.kind === 'review-decision-appended' ||
          portable.kind === 'action-record-appended' ||
          portable.kind === 'material-coverage-updated' ||
          portable.kind === 'knowledge-release-created'
          ? portable.kind
          : 'knowledge-map-updated',
        affectedObjectIds: Array.isArray(portable.affectedObjectIds)
          ? portable.affectedObjectIds.filter((item): item is string => typeof item === 'string')
          : [],
        affectedObjects: Array.isArray(portable.affectedObjects) ? portable.affectedObjects : undefined,
        baseRevision: typeof portable.baseRevision === 'string' ? portable.baseRevision : undefined,
        syncStatus: 'local-draft',
        authorLabel: input.authorLabel?.trim() || (typeof portable.authorLabel === 'string' ? portable.authorLabel : '') || '离线导入',
        issues: [],
        createdAt: now,
        updatedAt: now,
      };
      const saved = await this.draftChanges.save(draftChange);
      return {
        status: 'imported',
        issues: [],
        draftChange: saved,
        packageDir,
        manifestPath,
        draftChangePath,
        files: ['manifest.json', draftChangeFile],
      };
    } catch {
      return { status: 'blocked', issues: ['变更包无法读取，请确认文件完整。'], packageDir, manifestPath };
    }
  }

  async createKnowledgeRelease(input: CreateContentKnowledgeReleaseInput): Promise<ContentWorkspaceSyncResult> {
    const map = await this.findMap(input.workspacePath, input.contentKnowledgeMapId);
    if (!map) return { status: 'blocked', issues: ['请先生成内容知识地图。'] };
    const issues = contentKnowledgeMapSensitiveIssues(map);
    if (issues.length) return { status: 'blocked', issues };
    const exported = await this.exporter.exportPack({ workspacePath: input.workspacePath, contentKnowledgeMapId: map.id });
    const now = new Date().toISOString();
    const release: ContentKnowledgeRelease = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      workspaceId: map.teamSync.workspaceId,
      contentKnowledgeMapId: map.id,
      contentKnowledgeMapTitle: map.title,
      title: input.title?.trim() || `${map.title} 团队知识包`,
      version: input.version?.trim() || releaseVersion(),
      status: exported.status === 'exported' ? 'local-preview' : 'blocked',
      packageDir: exported.packageDir,
      knowledgePath: exported.knowledgePath,
      manifestPath: exported.manifestPath,
      packageArchivePath: exported.packageArchivePath,
      packageArchiveFileName: exported.packageArchiveFileName,
      packageArchiveSha256: exported.packageArchiveSha256,
      packageArchiveSize: exported.packageArchiveSize,
      files: exported.files,
      issues: exported.issues,
      baseRevision: map.teamSync.revision ?? map.teamSync.baseRevision,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.releases.save(release);
    if (saved.status === 'blocked') return { status: 'blocked', issues: saved.issues, release: saved };
    const teamSync = await this.adapter.publishRelease(saved);
    const nextRelease: ContentKnowledgeRelease = {
      ...saved,
      status: teamSync.status === 'synced' ? 'published' : 'local-preview',
      issues: teamSync.status === 'synced' ? [] : [teamSync.message],
      serverReleaseId: teamSync.releaseId || saved.serverReleaseId,
      workspaceId: teamSync.workspaceId || saved.workspaceId,
      packageObjectKey: teamSync.packageObjectKey || saved.packageObjectKey,
      packagePublicUrl: teamSync.packagePublicUrl || saved.packagePublicUrl,
      packageStorageProvider: teamSync.packageStorageProvider || saved.packageStorageProvider,
      packageUploadStatus: teamSync.packageUploadStatus || saved.packageUploadStatus,
      updatedAt: new Date().toISOString(),
    };
    const persisted = await this.releases.update(nextRelease);
    if (teamSync.status === 'synced') {
      await this.updateMapSync(input.workspacePath, map.id, teamSync);
    } else if (teamSync.status === 'conflict') {
      await this.markMapSyncConflict(input.workspacePath, map.id, teamSync);
    }
    return {
      status: teamSync.status === 'synced' ? 'released' : teamSync.status === 'conflict' ? 'conflict' : 'blocked',
      issues: persisted.issues,
      teamSync,
      release: persisted,
    };
  }

  private async findMap(workspacePath: string, mapId?: string): Promise<ContentKnowledgeMapRecord | undefined> {
    const maps = await this.maps.list(workspacePath);
    return mapId ? maps.find((item) => item.id === mapId) : maps[0];
  }

  private async updateMapSync(
    workspacePath: string,
    mapId: string,
    teamSync: ContentKnowledgeMapRecord['teamSync'],
  ): Promise<void> {
    const map = await this.findMap(workspacePath, mapId);
    if (!map) return;
    await this.maps.update({
      ...map,
      syncStatus: teamSync.status,
      teamSync,
    });
  }

  private async markMapSyncConflict(
    workspacePath: string,
    mapId: string,
    teamSync: ContentKnowledgeMapRecord['teamSync'],
  ): Promise<void> {
    const map = await this.findMap(workspacePath, mapId);
    if (!map) return;
    await this.maps.update({
      ...map,
      syncStatus: 'conflict',
      teamSync: {
        ...map.teamSync,
        ...teamSync,
        status: 'conflict',
      },
    });
  }

  private async markResolvedSyncConflict(workspacePath: string, conflict: ContentSyncConflict): Promise<void> {
    const maps = await this.maps.list(workspacePath);
    const affectedObjectIds = new Set(conflict.affectedObjectIds);
    const mapAffectedByConflict = (map: ContentKnowledgeMapRecord): boolean => {
      const rowIds = [
        ...map.sellingPoints.map((row) => row.id),
        ...map.painPoints.map((row) => row.id),
        ...map.scenarios.map((row) => row.id),
      ];
      const candidateIds = new Set([
        map.id,
        `content-map:${map.id}`,
        ...rowIds,
        ...map.sellingPoints.map((row) => `selling-point:${row.id}`),
        ...map.painPoints.map((row) => `pain-point:${row.id}`),
        ...map.scenarios.map((row) => `scenario:${row.id}`),
        ...map.evidence.flatMap((item) => [item.id, `evidence:${item.id}`]),
      ]);
      if ([...affectedObjectIds].some((id) => candidateIds.has(id))) return true;
      return affectedObjectIds.size === 0 && Boolean(conflict.workspaceId && map.teamSync.workspaceId === conflict.workspaceId);
    };
    const action = conflict.resolutionAction as ContentSyncConflictResolutionAction | undefined;
    const message = action === 'keep-team-version'
      ? '已选择以团队版本为准，请刷新团队工作区后再继续生产。'
      : action === 'keep-local-change'
        ? '已选择保留本机修改，请重新生成变更包并提交团队工作区。'
        : '冲突处理已记录，请重新生成变更包并提交团队工作区。';
    await Promise.all(maps
      .filter(mapAffectedByConflict)
      .map((map) => this.maps.update({
        ...map,
        syncStatus: 'pending-sync',
        teamSync: {
          ...map.teamSync,
          status: 'pending-sync',
          message,
        },
      })));
  }
}
