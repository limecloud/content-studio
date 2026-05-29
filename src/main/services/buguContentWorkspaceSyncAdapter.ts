import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, relative } from 'node:path';
import type {
  BrandCommandActionRecord,
  BrandCommandQueueItem,
  ContentProductionHandoffActionRecord,
  ContentDraftChange,
  ContentKnowledgeRelease,
  ContentKnowledgeMapTeamSyncSummary,
  ContentMaterialCoverageResult,
  ContentReviewDecision,
  ContentReviewTask,
  ContentSyncConflictAffectedObject,
  ContentSyncConflict,
} from '../../shared/types';
import { getOemRuntimeConfig } from './oemRuntimeConfig';

export interface ContentWorkspaceSyncAdapter {
  submitDraftChange(input: ContentDraftChange): Promise<ContentKnowledgeMapTeamSyncSummary>;
  publishRelease(input: ContentKnowledgeRelease): Promise<ContentKnowledgeMapTeamSyncSummary>;
  listReleases?(input: {
    workspacePath: string;
    workspaceId?: string;
  }): Promise<ContentKnowledgeRelease[]>;
  listSyncConflicts(input: {
    workspacePath: string;
    workspaceId?: string;
  }): Promise<ContentSyncConflict[]>;
  resolveSyncConflict(input: {
    workspacePath: string;
    conflictId: string;
    resolutionAction?: string;
    resolutionNote?: string;
    mergeDraft?: unknown;
    resolvedBy?: string;
  }): Promise<ContentSyncConflict | null>;
}

export interface ContentReviewTaskSyncAdapter {
  syncReviewTasks(input: {
    workspacePath: string;
    tasks: ContentReviewTask[];
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary>;
  submitReviewDecision(input: {
    workspacePath: string;
    task: ContentReviewTask;
    decision: ContentReviewDecision;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary>;
}

export interface BrandCommandActionSyncAdapter {
  appendActionRecord(input: {
    workspacePath: string;
    commandCenterId: string;
    record: BrandCommandActionRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary>;
  listActionRecords?(input: {
    workspacePath: string;
    workspaceId?: string;
    commandCenterId?: string;
    limit?: number;
  }): Promise<{
    records: BrandCommandActionRecord[];
    teamSync: ContentKnowledgeMapTeamSyncSummary;
  }>;
}

export interface ContentProductionHandoffActionSyncAdapter {
  syncProductionHandoffActions(input: {
    workspacePath: string;
    sourceKnowledgeMapId?: string;
    actions: ContentProductionHandoffActionRecord[];
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary>;
}

export interface ContentMaterialCoverageSyncAdapter {
  appendMaterialCoverage(input: {
    workspacePath: string;
    contentKnowledgeMapId: string;
    contentKnowledgeMapTitle: string;
    result: ContentMaterialCoverageResult;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary>;
}

export interface BrandCommandExecutionQueueSyncAdapter {
  syncExecutionQueue(input: {
    workspacePath: string;
    commandCenterId: string;
    items: BrandCommandQueueItem[];
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary>;
}

interface BuguEnvelope<T> {
  code?: number;
  message?: string;
  data?: T;
}

interface BuguContentWorkspace {
  id?: string;
  currentRevision?: string;
}

interface BuguContentDraftChangeResult {
  workspace?: BuguContentWorkspace | null;
  draftChange?: {
    serverRevision?: string;
    baseRevision?: string;
  } | null;
}

interface BuguContentReleaseResult {
  workspace?: BuguContentWorkspace | null;
  release?: {
    id?: string;
    serverRevision?: string;
    baseRevision?: string;
    packageObjectKey?: string;
    packagePublicUrl?: string;
    packageStorageProvider?: string;
    packageUploadStatus?: string;
  } | null;
}

interface BuguContentRelease {
  id?: string;
  workspaceId?: string;
  contentKnowledgeMapId?: string;
  contentKnowledgeMapTitle?: string;
  title?: string;
  version?: string;
  status?: string;
  baseRevision?: string;
  serverRevision?: string;
  packageManifest?: {
    files?: string[];
  };
  packageObjectKey?: string;
  packagePublicUrl?: string;
  packageStorageProvider?: string;
  packageUploadStatus?: string;
  packageSha256?: string;
  packageSize?: number;
  approvalStatus?: string;
  approvalRequestedBy?: string;
  approvalRequestedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  approvalNote?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BuguContentReleaseListResult {
  items?: BuguContentRelease[];
}

interface BuguContentReviewTasksResult {
  workspace?: BuguContentWorkspace | null;
  items?: Array<{
    id?: string;
    serverRevision?: string;
    baseRevision?: string;
  }>;
}

interface BuguContentReviewDecisionResult {
  workspace?: BuguContentWorkspace | null;
  reviewTask?: {
    id?: string;
    serverRevision?: string;
    baseRevision?: string;
  } | null;
}

interface BuguContentActionRecordsResult {
  workspace?: BuguContentWorkspace | null;
  items?: Array<{
    id?: string;
    commandCenterId?: string;
    queueItemId?: string;
    campaignCellId?: string;
    actionType?: string;
    title?: string;
    outcome?: string;
    actorLabel?: string;
    actorRole?: string;
    inputSummary?: string;
    outputSummary?: string;
    blockedReason?: string;
    writeBackSummary?: string;
    promptDraftId?: string;
    sceneCardId?: string;
    workflowRunId?: string;
    materialCoverageChangeId?: string;
    reviewTaskId?: string;
    serverRevision?: string;
    baseRevision?: string;
    createdAt?: string;
  }>;
  revision?: string | number;
}

interface BuguContentMaterialCoverageResult {
  workspace?: BuguContentWorkspace | null;
  materialCoverage?: {
    id?: string;
    serverRevision?: string;
    baseRevision?: string;
  } | null;
}

interface BuguContentExecutionQueueResult {
  workspace?: BuguContentWorkspace | null;
  items?: Array<{
    id?: string;
    serverRevision?: string;
    baseRevision?: string;
  }>;
}

interface BuguContentSyncConflict {
  id?: string;
  workspaceId?: string;
  sourceType?: string;
  sourceId?: string;
  title?: string;
  summary?: string;
  status?: string;
  baseRevision?: string;
  serverRevision?: string;
  affectedObjectIds?: string[];
  affectedObjects?: ContentSyncConflictAffectedObject[];
  authorLabel?: string;
  resolutionAction?: string;
  resolutionNote?: string;
  resolvedBy?: string;
  resolvedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BuguContentSyncConflictListResult {
  items?: BuguContentSyncConflict[];
}

interface BuguContentSyncConflictResolveResult {
  conflict?: BuguContentSyncConflict | null;
}

interface BuguContentWorkspaceSyncAdapterOptions {
  apiBaseUrl?: string;
  tenantId?: string;
  tokenProvider?: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function contentWorkspaceKey(workspacePath: string): string {
  const hash = createHash('sha256').update(workspacePath).digest('hex').slice(0, 24);
  return `content-studio:${hash}`;
}

function contentApiPath(baseUrl: string, route: string): string {
  if (baseUrl.endsWith('/api/v1')) return `${baseUrl}/oem/${route}`;
  if (baseUrl.endsWith('/api')) return `${baseUrl}/v1/oem/${route}`;
  return `${baseUrl}/api/v1/oem/${route}`;
}

function packageFileRef(packageDir: string | undefined, filePath: string): string {
  if (!packageDir) return basename(filePath);
  const relativePath = relative(packageDir, filePath).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('../') || relativePath === '..' || relativePath.includes(':/')) {
    return basename(filePath);
  }
  return relativePath;
}

function contentPackageObjectKey(workspacePath: string, releaseId: string): string {
  const workspaceKey = contentWorkspaceKey(workspacePath).replace(/[^a-zA-Z0-9_-]+/g, '-');
  const safeReleaseId = releaseId.replace(/[^a-zA-Z0-9_-]+/g, '-');
  return `content-workspaces/${workspaceKey}/agentknowledge/${safeReleaseId}.zip`;
}

function teamSyncFromResult(input: {
  message: string;
  workspace?: BuguContentWorkspace | null;
  serverRevision?: string;
  baseRevision?: string;
  releaseId?: string;
  packageObjectKey?: string;
  packagePublicUrl?: string;
  packageStorageProvider?: string;
  packageUploadStatus?: string;
}): ContentKnowledgeMapTeamSyncSummary {
  return {
    backend: 'bugu',
    status: 'synced',
    message: input.message,
    workspaceId: input.workspace?.id,
    revision: input.serverRevision || input.workspace?.currentRevision,
    baseRevision: input.baseRevision,
    releaseId: input.releaseId,
    packageObjectKey: input.packageObjectKey,
    packagePublicUrl: input.packagePublicUrl,
    packageStorageProvider: input.packageStorageProvider,
    packageUploadStatus: input.packageUploadStatus,
    lastSyncedAt: new Date().toISOString(),
  };
}

function normalizeConflictAffectedObjects(items?: ContentSyncConflictAffectedObject[]): ContentSyncConflictAffectedObject[] {
  if (!Array.isArray(items)) return [];
  const normalized: ContentSyncConflictAffectedObject[] = [];
  items.forEach((item, index) => {
    const title = String(item?.title || '').trim();
    if (!title) return;
    const objectId = item.objectId ? String(item.objectId).trim() : undefined;
    const impact = item.impact === 'high' || item.impact === 'low' ? item.impact : 'medium';
    normalized.push({
      id: String(item.id || objectId || `affected-${index}`).trim(),
      ...(objectId ? { objectId } : {}),
      objectType: item.objectType || 'unknown',
      title,
      summary: String(item.summary || '本机提交影响该内容项。').trim(),
      localValue: item.localValue ? String(item.localValue).trim() : undefined,
      teamValue: item.teamValue ? String(item.teamValue).trim() : undefined,
      impact,
      recommendation: String(item.recommendation || '重新同步团队当前版本后再处理本机变更。').trim(),
    });
  });
  return normalized.slice(0, 30);
}

function syncConflictFromResult(workspacePath: string, item: BuguContentSyncConflict): ContentSyncConflict {
  return {
    id: item.id || '',
    workspacePath,
    workspaceId: item.workspaceId,
    sourceType: item.sourceType === 'review-task' ||
      item.sourceType === 'review-decision' ||
      item.sourceType === 'knowledge-release' ||
      item.sourceType === 'draft-change'
      ? item.sourceType
      : 'team-sync',
    sourceId: item.sourceId,
    title: item.title || '团队同步冲突',
    summary: item.summary || '提交内容基于旧团队版本，需要重新同步后再处理。',
    status: item.status === 'resolved' || item.status === 'dismissed' ? item.status : 'open',
    baseRevision: item.baseRevision,
    serverRevision: item.serverRevision,
    affectedObjectIds: Array.isArray(item.affectedObjectIds) ? item.affectedObjectIds : [],
    affectedObjects: normalizeConflictAffectedObjects(item.affectedObjects),
    authorLabel: item.authorLabel,
    resolutionAction: item.resolutionAction,
    resolutionNote: item.resolutionNote,
    resolvedBy: item.resolvedBy,
    resolvedAt: item.resolvedAt,
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: item.updatedAt || item.createdAt || new Date().toISOString(),
  };
}

function releaseFromResult(workspacePath: string, item: BuguContentRelease): ContentKnowledgeRelease {
  const now = new Date().toISOString();
  return {
    id: item.id || randomUUID(),
    workspacePath,
    workspaceId: item.workspaceId,
    contentKnowledgeMapId: item.contentKnowledgeMapId || '',
    contentKnowledgeMapTitle: item.contentKnowledgeMapTitle || '团队知识包',
    title: item.title || item.contentKnowledgeMapTitle || '团队知识包',
    version: item.version || item.serverRevision || 'team-version',
    status: item.status === 'published' ? 'published' : 'local-preview',
    packageObjectKey: item.packageObjectKey,
    packagePublicUrl: item.packagePublicUrl,
    packageStorageProvider: item.packageStorageProvider,
    packageUploadStatus: item.packageUploadStatus,
    packageArchiveSha256: item.packageSha256,
    packageArchiveSize: item.packageSize,
    approvalStatus: item.approvalStatus === 'pending' || item.approvalStatus === 'rejected' ? item.approvalStatus : 'approved',
    approvalRequestedBy: item.approvalRequestedBy,
    approvalRequestedAt: item.approvalRequestedAt,
    approvedBy: item.approvedBy,
    approvedAt: item.approvedAt,
    rejectedBy: item.rejectedBy,
    rejectedAt: item.rejectedAt,
    approvalNote: item.approvalNote,
    files: Array.isArray(item.packageManifest?.files)
      ? item.packageManifest.files.filter((file): file is string => typeof file === 'string' && file.length > 0)
      : [],
    issues: [],
    baseRevision: item.baseRevision,
    serverReleaseId: item.id,
    createdAt: item.createdAt || now,
    updatedAt: item.updatedAt || item.createdAt || now,
  };
}

function brandActionTypeFromResult(value: string | undefined): BrandCommandActionRecord['actionType'] {
  if (value === 'create-scene-card') return 'create-scene-card';
  if (value === 'request-review') return 'request-review';
  if (value === 'request-evidence') return 'request-evidence';
  if (value === 'launch-sop-run') return 'launch-sop-run';
  if (value === 'create-material-gap-list') return 'create-material-gap-list';
  if (value === 'write-back-material-coverage') return 'write-back-material-coverage';
  if (value === 'content-production-blocked') return 'content-production-blocked';
  return 'generate-prompt-draft';
}

function brandActionOutcomeFromResult(value: string | undefined): BrandCommandActionRecord['outcome'] {
  if (value === 'blocked') return 'blocked';
  if (value === 'handoff') return 'handoff';
  if (value === 'needs-review') return 'needs-review';
  if (value === 'needs-resource') return 'needs-resource';
  if (value === 'written-back') return 'written-back';
  return 'recorded';
}

function actionRecordFromResult(input: {
  item: NonNullable<BuguContentActionRecordsResult['items']>[number];
  teamSync: ContentKnowledgeMapTeamSyncSummary;
}): BrandCommandActionRecord | null {
  if (!input.item.id) return null;
  return {
    id: input.item.id,
    queueItemId: input.item.queueItemId,
    campaignCellId: input.item.campaignCellId,
    actionType: brandActionTypeFromResult(input.item.actionType),
    title: input.item.title || '团队行动记录',
    outcome: brandActionOutcomeFromResult(input.item.outcome),
    actorLabel: input.item.actorLabel || '团队成员',
    actorRole: input.item.actorRole as BrandCommandActionRecord['actorRole'] | undefined,
    inputSummary: input.item.inputSummary || '',
    outputSummary: input.item.outputSummary || '',
    blockedReason: input.item.blockedReason || undefined,
    writeBackSummary: input.item.writeBackSummary || undefined,
    promptDraftId: input.item.promptDraftId || undefined,
    sceneCardId: input.item.sceneCardId || undefined,
    workflowRunId: input.item.workflowRunId || undefined,
    materialCoverageChangeId: input.item.materialCoverageChangeId || undefined,
    reviewTaskId: input.item.reviewTaskId || undefined,
    syncStatus: 'synced',
    teamSync: {
      ...input.teamSync,
      revision: input.item.serverRevision || input.teamSync.revision,
      baseRevision: input.item.baseRevision || input.teamSync.baseRevision,
    },
    createdAt: input.item.createdAt || new Date().toISOString(),
  };
}

function localOnlyMessage(action: 'draft' | 'release'): string {
  return action === 'draft'
    ? 'Bugu 团队内容工作区 API 尚未接入；变更包已保存在本机，未同步为团队事实源。'
    : 'Bugu 团队 release API 尚未接入；当前只生成本地知识包预览，未发布为团队版本。';
}

export class LocalOnlyContentWorkspaceSyncAdapter implements ContentWorkspaceSyncAdapter {
  async submitDraftChange(_input: ContentDraftChange): Promise<ContentKnowledgeMapTeamSyncSummary> {
    return {
      backend: 'bugu',
      status: 'blocked',
      message: localOnlyMessage('draft'),
    };
  }

  async publishRelease(_input: ContentKnowledgeRelease): Promise<ContentKnowledgeMapTeamSyncSummary> {
    return {
      backend: 'bugu',
      status: 'blocked',
      message: localOnlyMessage('release'),
    };
  }

  async listReleases(_input: { workspacePath: string; workspaceId?: string }): Promise<ContentKnowledgeRelease[]> {
    return [];
  }

  async listSyncConflicts(_input: { workspacePath: string; workspaceId?: string }): Promise<ContentSyncConflict[]> {
    return [];
  }

  async resolveSyncConflict(_input: {
    workspacePath: string;
    conflictId: string;
    resolutionAction?: string;
    resolutionNote?: string;
    mergeDraft?: unknown;
    resolvedBy?: string;
  }): Promise<ContentSyncConflict | null> {
    return null;
  }
}

export class BuguContentWorkspaceSyncAdapter implements ContentWorkspaceSyncAdapter, ContentReviewTaskSyncAdapter, BrandCommandActionSyncAdapter, ContentMaterialCoverageSyncAdapter, BrandCommandExecutionQueueSyncAdapter {
  private readonly apiBaseUrl: string;
  private readonly tenantId: string;
  private readonly tokenProvider?: () => Promise<string | undefined>;
  private readonly fetchImpl: typeof fetch;

  constructor(options: BuguContentWorkspaceSyncAdapterOptions = {}) {
    const runtime = getOemRuntimeConfig();
    this.apiBaseUrl = normalizeBaseUrl(
      options.apiBaseUrl ||
      process.env.CONTENT_STUDIO_BUGU_CONTENT_API_BASE_URL ||
      runtime.oemPublicApiBaseUrl ||
      'https://api.bugu.run',
    );
    this.tenantId = options.tenantId || runtime.tenantId || 'tenant-2230';
    this.tokenProvider = options.tokenProvider;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async submitDraftChange(input: ContentDraftChange): Promise<ContentKnowledgeMapTeamSyncSummary> {
    try {
      const result = await this.post<BuguContentDraftChangeResult>('content-draft-changes', {
        tenantId: this.tenantId,
        workspaceId: input.workspaceId,
        workspaceKey: contentWorkspaceKey(input.workspacePath),
        id: input.id,
        idempotencyKey: input.id,
        contentKnowledgeMapId: input.contentKnowledgeMapId,
        contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
        title: input.title,
        summary: input.summary,
        kind: input.kind,
        affectedObjectIds: input.affectedObjectIds,
        affectedObjects: input.affectedObjects || [],
        baseRevision: input.baseRevision,
        authorLabel: input.authorLabel,
      });
      return teamSyncFromResult({
        message: '已同步到 Bugu 团队内容工作区。',
        workspace: result.workspace,
        serverRevision: result.draftChange?.serverRevision,
        baseRevision: result.draftChange?.baseRevision || input.baseRevision,
      });
    } catch (error) {
      return this.errorSync(error, '变更包已保存在本机，但未同步到 Bugu 团队内容工作区。');
    }
  }

  async publishRelease(input: ContentKnowledgeRelease): Promise<ContentKnowledgeMapTeamSyncSummary> {
    try {
      const packageArchive = await this.packageArchivePayload(input);
      const result = await this.post<BuguContentReleaseResult>('content-knowledge-releases', {
        tenantId: this.tenantId,
        workspaceId: input.workspaceId,
        workspaceKey: contentWorkspaceKey(input.workspacePath),
        id: input.id,
        idempotencyKey: input.id,
        contentKnowledgeMapId: input.contentKnowledgeMapId,
        contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
        title: input.title,
        version: input.version,
        baseRevision: input.baseRevision,
        packageManifest: {
          schemaVersion: 1,
          files: input.files.map((file) => packageFileRef(input.packageDir, file)),
          hasKnowledgeFile: Boolean(input.knowledgePath),
          hasManifestFile: Boolean(input.manifestPath),
        },
        packageArchive,
      });
      return teamSyncFromResult({
        message: '已发布为 Bugu 团队知识包版本。',
        workspace: result.workspace,
        serverRevision: result.release?.serverRevision,
        baseRevision: result.release?.baseRevision || input.baseRevision,
        releaseId: result.release?.id,
        packageObjectKey: result.release?.packageObjectKey,
        packagePublicUrl: result.release?.packagePublicUrl,
        packageStorageProvider: result.release?.packageStorageProvider,
        packageUploadStatus: result.release?.packageUploadStatus,
      });
    } catch (error) {
      return this.errorSync(error, '知识包已生成本机预览，但未发布到 Bugu 团队内容工作区。');
    }
  }

  async listSyncConflicts(input: {
    workspacePath: string;
    workspaceId?: string;
  }): Promise<ContentSyncConflict[]> {
    if (!input.workspaceId) return [];
    const result = await this.get<BuguContentSyncConflictListResult>('content-sync-conflicts', {
      workspaceId: input.workspaceId,
      status: 'open',
    });
    return (result.items || [])
      .filter((item) => item.id)
      .map((item) => syncConflictFromResult(input.workspacePath, item));
  }

  async listReleases(input: {
    workspacePath: string;
    workspaceId?: string;
  }): Promise<ContentKnowledgeRelease[]> {
    if (!input.workspaceId) return [];
    const result = await this.get<BuguContentReleaseListResult>('content-knowledge-releases', {
      workspaceId: input.workspaceId,
    });
    return (result.items || [])
      .filter((item) => item.id)
      .map((item) => releaseFromResult(input.workspacePath, item));
  }

  async resolveSyncConflict(input: {
    workspacePath: string;
    conflictId: string;
    resolutionAction?: string;
    resolutionNote?: string;
    mergeDraft?: unknown;
    resolvedBy?: string;
  }): Promise<ContentSyncConflict | null> {
    const result = await this.post<BuguContentSyncConflictResolveResult>('content-sync-conflicts', {
      tenantId: this.tenantId,
      conflictId: input.conflictId,
      status: 'resolved',
      resolutionAction: input.resolutionAction || 'manual-review-recorded',
      resolutionNote: input.resolutionNote,
      mergeDraft: input.mergeDraft,
      resolvedBy: input.resolvedBy,
    });
    return result.conflict ? syncConflictFromResult(input.workspacePath, result.conflict) : null;
  }

  async syncReviewTasks(input: {
    workspacePath: string;
    tasks: ContentReviewTask[];
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    if (!input.tasks.length) {
      return {
        backend: 'bugu',
        status: 'synced',
        message: '没有新的审核任务需要同步。',
      };
    }
    try {
      const result = await this.post<BuguContentReviewTasksResult>('content-review-tasks', {
        tenantId: this.tenantId,
        workspaceKey: contentWorkspaceKey(input.workspacePath),
        authorLabel: input.authorLabel,
        tasks: input.tasks.map((task) => ({
          id: task.id,
          sourceKnowledgeMapId: task.sourceKnowledgeMapId,
          sourceKnowledgeMapTitle: task.sourceKnowledgeMapTitle,
          targetType: task.targetType,
          targetId: task.targetId,
          taskPurpose: task.taskPurpose,
          title: task.title,
          summary: task.summary,
          evidenceRefs: task.evidenceRefs,
          sourceRefs: task.sourceRefs,
          risk: task.risk,
          status: task.status,
          suggestedAction: task.suggestedAction,
          issueLabels: task.issueLabels,
          decisions: task.decisions,
        })),
      });
      const firstItem = result.items?.[0];
      return teamSyncFromResult({
        message: '审核任务已同步到 Bugu 团队内容工作区。',
        workspace: result.workspace,
        serverRevision: firstItem?.serverRevision,
        baseRevision: firstItem?.baseRevision,
      });
    } catch (error) {
      return this.errorSync(error, '审核任务已保存在本机，但未同步到 Bugu 团队内容工作区。');
    }
  }

  async submitReviewDecision(input: {
    workspacePath: string;
    task: ContentReviewTask;
    decision: ContentReviewDecision;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    try {
      const result = await this.post<BuguContentReviewDecisionResult>('content-review-decisions', {
        tenantId: this.tenantId,
        workspaceKey: contentWorkspaceKey(input.workspacePath),
        taskId: input.task.id,
        id: input.decision.id,
        idempotencyKey: input.decision.id,
        action: input.decision.action,
        status: input.task.status,
        reason: input.decision.reason,
        reviewerLabel: input.authorLabel || input.decision.reviewerLabel,
        baseRevision: input.task.teamSync?.revision || input.task.teamSync?.baseRevision,
        payload: input.decision.payload,
        beforeSnapshot: input.decision.beforeSnapshot,
        afterSnapshot: input.decision.afterSnapshot,
      });
      return teamSyncFromResult({
        message: '审核结论已同步到 Bugu 团队内容工作区。',
        workspace: result.workspace,
        serverRevision: result.reviewTask?.serverRevision,
        baseRevision: result.reviewTask?.baseRevision || input.task.teamSync?.revision,
      });
    } catch (error) {
      return this.errorSync(error, '审核结论已保存在本机，但未同步到 Bugu 团队内容工作区。');
    }
  }

  async appendActionRecord(input: {
    workspacePath: string;
    commandCenterId: string;
    record: BrandCommandActionRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    try {
      const result = await this.post<BuguContentActionRecordsResult>('content-action-records', {
        tenantId: this.tenantId,
        workspaceKey: contentWorkspaceKey(input.workspacePath),
        authorLabel: input.authorLabel || input.record.actorLabel,
        baseRevision: input.record.teamSync?.revision || input.record.teamSync?.baseRevision,
        records: [{
          id: input.record.id,
          commandCenterId: input.commandCenterId,
          queueItemId: input.record.queueItemId,
          campaignCellId: input.record.campaignCellId,
          actionType: input.record.actionType,
          title: input.record.title,
          outcome: input.record.outcome,
          actorLabel: input.record.actorLabel,
          actorRole: input.record.actorRole,
          inputSummary: input.record.inputSummary,
          outputSummary: input.record.outputSummary,
          blockedReason: input.record.blockedReason,
          writeBackSummary: input.record.writeBackSummary,
          promptDraftId: input.record.promptDraftId,
          sceneCardId: input.record.sceneCardId,
          workflowRunId: input.record.workflowRunId,
          materialCoverageChangeId: input.record.materialCoverageChangeId,
          reviewTaskId: input.record.reviewTaskId,
          createdAt: input.record.createdAt,
        }],
      });
      const firstItem = result.items?.[0];
      return teamSyncFromResult({
        message: '行动记录已同步到 Bugu 团队内容工作区。',
        workspace: result.workspace,
        serverRevision: firstItem?.serverRevision,
        baseRevision: firstItem?.baseRevision || input.record.teamSync?.revision,
      });
    } catch (error) {
      return this.errorSync(error, '行动记录已保存在本机，但未同步到 Bugu 团队内容工作区。');
    }
  }

  async listActionRecords(input: {
    workspacePath: string;
    workspaceId?: string;
    commandCenterId?: string;
    limit?: number;
  }): Promise<{
    records: BrandCommandActionRecord[];
    teamSync: ContentKnowledgeMapTeamSyncSummary;
  }> {
    if (!input.workspaceId) {
      return {
        records: [],
        teamSync: {
          backend: 'bugu',
          status: 'blocked',
          message: '当前内容工作区尚未绑定团队工作区，无法刷新团队行动记录。',
        },
      };
    }
    const result = await this.get<BuguContentActionRecordsResult>('content-action-records', {
      workspaceId: input.workspaceId,
      commandCenterId: input.commandCenterId,
      limit: String(input.limit ?? 80),
    });
    const baseTeamSync: ContentKnowledgeMapTeamSyncSummary = {
      backend: 'bugu',
      status: 'synced',
      message: '已从 Bugu 团队内容工作区刷新行动记录。',
      workspaceId: input.workspaceId,
      revision: result.workspace?.currentRevision || String(result.revision || ''),
      lastSyncedAt: new Date().toISOString(),
    };
    const records = (result.items || [])
      .filter((item) => !input.commandCenterId || item.commandCenterId === input.commandCenterId)
      .map((item) => actionRecordFromResult({ item, teamSync: baseTeamSync }))
      .filter((record): record is BrandCommandActionRecord => Boolean(record));
    return { records, teamSync: baseTeamSync };
  }

  async syncProductionHandoffActions(input: {
    workspacePath: string;
    sourceKnowledgeMapId?: string;
    actions: ContentProductionHandoffActionRecord[];
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    if (!input.actions.length) {
      return {
        backend: 'bugu',
        status: 'local-only',
        message: '没有需要同步的生产交接行动记录。',
      };
    }
    try {
      const result = await this.post<BuguContentActionRecordsResult>('content-action-records', {
        tenantId: this.tenantId,
        workspaceKey: contentWorkspaceKey(input.workspacePath),
        authorLabel: input.authorLabel || input.actions[0]?.actorLabel,
        records: input.actions.map((action) => ({
          id: action.id,
          commandCenterId: input.sourceKnowledgeMapId ? `content-production:${input.sourceKnowledgeMapId}` : 'content-production',
          queueItemId: action.batchId,
          campaignCellId: action.batchId,
          actionType: action.actionType === 'create-prompt-draft'
            ? 'generate-prompt-draft'
            : action.actionType === 'create-scene-card'
              ? 'create-scene-card'
              : action.actionType === 'launch-sop-run'
                ? 'launch-sop-run'
                : 'content-production-blocked',
          title: action.title,
          outcome: action.outcome,
          actorLabel: action.actorLabel,
          inputSummary: action.inputSummary,
          outputSummary: action.outputSummary,
          blockedReason: action.outcome === 'blocked'
            ? action.outputSummary
            : undefined,
          writeBackSummary: action.nextStep,
          promptDraftId: action.promptDraftId,
          sceneCardId: action.sceneCardId,
          workflowRunId: action.workflowRunId,
          createdAt: action.createdAt,
        })),
      });
      const firstItem = result.items?.[0];
      return teamSyncFromResult({
        message: '生产交接行动记录已同步到 Bugu 团队内容工作区。',
        workspace: result.workspace,
        serverRevision: firstItem?.serverRevision,
        baseRevision: firstItem?.baseRevision,
      });
    } catch (error) {
      return this.errorSync(error, '生产交接行动记录已保存在本机，但未同步到 Bugu 团队内容工作区。');
    }
  }

  async appendMaterialCoverage(input: {
    workspacePath: string;
    contentKnowledgeMapId: string;
    contentKnowledgeMapTitle: string;
    result: ContentMaterialCoverageResult;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    try {
      const result = await this.post<BuguContentMaterialCoverageResult>('content-material-coverage', {
        tenantId: this.tenantId,
        workspaceKey: contentWorkspaceKey(input.workspacePath),
        id: input.result.coverageChangeId,
        idempotencyKey: input.result.coverageChangeId,
        contentKnowledgeMapId: input.contentKnowledgeMapId,
        contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
        updatedRowCount: input.result.updatedRowCount,
        reviewedAssetCount: input.result.reviewedAssetCount,
        approvedAssetCount: input.result.approvedAssetCount,
        updates: input.result.updates,
        authorLabel: input.authorLabel,
      });
      return teamSyncFromResult({
        message: '素材覆盖已同步到 Bugu 团队内容工作区。',
        workspace: result.workspace,
        serverRevision: result.materialCoverage?.serverRevision,
        baseRevision: result.materialCoverage?.baseRevision,
      });
    } catch (error) {
      return this.errorSync(error, '素材覆盖已回写到本机，但未同步到 Bugu 团队内容工作区。');
    }
  }

  async syncExecutionQueue(input: {
    workspacePath: string;
    commandCenterId: string;
    items: BrandCommandQueueItem[];
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    if (!input.items.length) {
      return {
        backend: 'bugu',
        status: 'synced',
        message: '没有新的执行队列需要同步。',
      };
    }
    try {
      const result = await this.post<BuguContentExecutionQueueResult>('content-execution-queue', {
        tenantId: this.tenantId,
        workspaceKey: contentWorkspaceKey(input.workspacePath),
        commandCenterId: input.commandCenterId,
        authorLabel: input.authorLabel,
        items: input.items.map((item) => ({
          id: item.id,
          campaignCellId: item.campaignCellId,
          actionType: item.actionType,
          title: item.title,
          summary: item.summary,
          status: item.status,
          blockedReason: item.blockedReason,
          recoveryAction: item.recoveryAction,
          outputTarget: item.outputTarget,
          resourceBundleId: item.resourceBundleId,
          dimensions: item.dimensions,
          createdAt: item.createdAt,
        })),
      });
      const firstItem = result.items?.[0];
      return teamSyncFromResult({
        message: '执行队列已同步到 Bugu 团队内容工作区。',
        workspace: result.workspace,
        serverRevision: firstItem?.serverRevision,
        baseRevision: firstItem?.baseRevision,
      });
    } catch (error) {
      return this.errorSync(error, '执行队列已保存在本机，但未同步到 Bugu 团队内容工作区。');
    }
  }

  private async post<T>(route: string, body: Record<string, unknown>): Promise<T> {
    const headers = new Headers({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
    const token = await this.tokenProvider?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await this.fetchImpl(contentApiPath(this.apiBaseUrl, route), {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as BuguEnvelope<T>;
    if (!response.ok || payload.code) {
      const error = new Error(payload.message || `${response.status} ${response.statusText}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    if (!payload.data) throw new Error('Bugu 团队内容工作区未返回数据。');
    return payload.data;
  }

  private async get<T>(route: string, params: Record<string, string | undefined> = {}): Promise<T> {
    const headers = new Headers({ Accept: 'application/json' });
    const token = await this.tokenProvider?.();
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const searchParams = new URLSearchParams();
    searchParams.set('tenant', this.tenantId);
    Object.entries(params).forEach(([key, value]) => {
      if (value) searchParams.set(key, value);
    });
    const response = await this.fetchImpl(`${contentApiPath(this.apiBaseUrl, route)}?${searchParams.toString()}`, {
      method: 'GET',
      headers,
    });
    const payload = await response.json().catch(() => ({})) as BuguEnvelope<T>;
    if (!response.ok || payload.code) {
      const error = new Error(payload.message || `${response.status} ${response.statusText}`);
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }
    if (!payload.data) throw new Error('Bugu 团队内容工作区未返回数据。');
    return payload.data;
  }

  private async packageArchivePayload(input: ContentKnowledgeRelease): Promise<Record<string, unknown> | undefined> {
    if (!input.packageArchivePath) return undefined;
    const archive = await readFile(input.packageArchivePath);
    return {
      fileName: input.packageArchiveFileName || basename(input.packageArchivePath),
      objectKey: contentPackageObjectKey(input.workspacePath, input.id),
      mimeType: 'application/zip',
      contentBase64: archive.toString('base64'),
      sha256: input.packageArchiveSha256 || createHash('sha256').update(archive).digest('hex'),
      size: input.packageArchiveSize || archive.length,
    };
  }

  private errorSync(error: unknown, fallback: string): ContentKnowledgeMapTeamSyncSummary {
    const status = (error as Error & { status?: number })?.status;
    return {
      backend: 'bugu',
      status: status === 409 ? 'conflict' : 'blocked',
      message: error instanceof Error ? `${fallback}${error.message ? `原因：${error.message}` : ''}` : fallback,
    };
  }
}
