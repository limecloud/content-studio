import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, relative } from 'node:path';
import type {
  BrandCommandActionRecord,
  BrandCommandCenterRecord,
  BrandCommandQueueItem,
  ContentProductionHandoffActionRecord,
  ContentDraftChange,
  ContentKnowledgeMapBuildRunRecord,
  ContentKnowledgeMapRecord,
  ContentKnowledgeRelease,
  ContentKnowledgeReleaseReference,
  ContentKnowledgeMapTeamSyncSummary,
  ContentMaterialCoverageResult,
  ContentKnowledgeMapSourceSensitivitySummary,
  ContentReviewDecision,
  ContentReviewTask,
  ContentSyncConflictAffectedObject,
  ContentSyncConflict,
} from '../../shared/types';
import { getOemRuntimeConfig } from './oemRuntimeConfig';
import type { ContentKnowledgeMapSyncPort } from './contentKnowledgeMapSyncPort';

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

export interface BrandCommandCenterSyncAdapter {
  upsertCommandCenterSnapshot(input: {
    record: BrandCommandCenterRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary>;
  listCommandCenters?(input: {
    workspacePath: string;
    workspaceId?: string;
    sourceKnowledgeMapId?: string;
  }): Promise<BrandCommandCenterRecord[]>;
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

interface BuguContentKnowledgeMapResult {
  workspace?: BuguContentWorkspace | null;
  knowledgeMap?: {
    id?: string;
    serverRevision?: string;
    baseRevision?: string;
  } | null;
}

interface BuguContentBuildRunResult {
  workspace?: BuguContentWorkspace | null;
  buildRun?: {
    id?: string;
    serverRevision?: string;
    baseRevision?: string;
  } | null;
}

interface BuguContentCommandCenterResult {
  workspace?: BuguContentWorkspace | null;
  commandCenter?: {
    id?: string;
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

interface BuguContentKnowledgeMap {
  id?: string;
  workspaceId?: string;
  title?: string;
  status?: string;
  model?: string;
  sourceInputSourceIds?: unknown;
  brandKnowledgeBaseIds?: unknown;
  ipKnowledgeBaseIds?: unknown;
  sceneCardIds?: unknown;
  promptDraftIds?: unknown;
  evidenceCount?: number;
  gapCount?: number;
  readyPercent?: number;
  coverage?: unknown;
  sourceSensitivity?: unknown;
  qualityIssues?: unknown;
  snapshot?: unknown;
  baseRevision?: string;
  serverRevision?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BuguContentKnowledgeMapListResult {
  items?: BuguContentKnowledgeMap[];
  total?: number;
  limit?: number;
  offset?: number;
  revision?: string | number;
}

interface BuguContentBuildRun {
  id?: string;
  workspaceId?: string;
  title?: string;
  status?: string;
  contentKnowledgeMapId?: string;
  contentKnowledgeMapTitle?: string;
  model?: string;
  inputSourceIds?: unknown;
  brandKnowledgeBaseIds?: unknown;
  ipKnowledgeBaseIds?: unknown;
  sceneCardIds?: unknown;
  promptDraftIds?: unknown;
  readyPercent?: number;
  evidenceCount?: number;
  gapCount?: number;
  issues?: unknown;
  steps?: unknown;
  baseRevision?: string;
  serverRevision?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BuguContentBuildRunListResult {
  items?: BuguContentBuildRun[];
  total?: number;
  limit?: number;
  offset?: number;
  revision?: string | number;
}

interface BuguContentCommandCenter {
  id?: string;
  workspaceId?: string;
  title?: string;
  status?: string;
  sourceKnowledgeMapId?: string;
  sourceKnowledgeMapTitle?: string;
  signals?: unknown;
  objectives?: unknown;
  resourceBundles?: unknown;
  campaignCells?: unknown;
  queueSummary?: unknown;
  actionSummary?: unknown;
  constraints?: unknown;
  gaps?: unknown;
  baseRevision?: string;
  serverRevision?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface BuguContentCommandCenterListResult {
  items?: BuguContentCommandCenter[];
  total?: number;
  limit?: number;
  offset?: number;
  revision?: string | number;
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
    teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
    materialCoverageChangeId?: string;
    reviewTaskId?: string;
    artifactRefs?: string[];
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
  const normalizedInput = filePath.replace(/\\/g, '/');
  if (!packageDir) return basename(filePath);
  if (!isAbsolute(filePath) && !/^[A-Za-z]:[\\/]/.test(filePath)) {
    if (!normalizedInput || normalizedInput.startsWith('../') || normalizedInput === '..' || normalizedInput.includes(':/')) {
      return basename(filePath);
    }
    return normalizedInput;
  }
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

function redactedLocalRefs(refs: string[] | undefined, workspacePath: string): string[] | undefined {
  if (!refs?.length) return undefined;
  return refs.map((ref) => {
    if (ref.startsWith(workspacePath)) return `[本机工作区]${ref.slice(workspacePath.length).replace(/\\/g, '/')}`;
    return ref.replace(/(?:\/Users|\/private\/var|\/tmp\/content-studio|\/home)\/[^\s"'，。)]+|[A-Za-z]:\\[^\s"'，。)]+/g, '[本机路径已隐藏]');
  });
}

function redactedLocalText(value: string | undefined, workspacePath: string): string | undefined {
  if (!value) return value;
  return redactedLocalRefs([value], workspacePath)?.[0];
}

function countByStatus<T extends { status?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const status = item.status || 'unknown';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {});
}

function countByOutcome<T extends { outcome?: string }>(items: T[]): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    const outcome = item.outcome || 'recorded';
    counts[outcome] = (counts[outcome] || 0) + 1;
    return counts;
  }, {});
}

function knowledgeMapSnapshot(record: ContentKnowledgeMapRecord): Record<string, unknown> {
  return {
    title: record.title,
    status: record.status,
    sellingPoints: record.sellingPoints.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      tags: row.tags,
      dimensions: row.dimensions,
      sourceRefs: row.sourceRefs,
      evidenceRefs: row.evidenceRefs,
      materialStatus: row.materialStatus,
      materialRefs: row.materialRefs,
      performanceTags: row.performanceTags,
      confidence: row.confidence,
      status: row.status,
    })),
    painPoints: record.painPoints.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      tags: row.tags,
      dimensions: row.dimensions,
      sourceRefs: row.sourceRefs,
      evidenceRefs: row.evidenceRefs,
      materialStatus: row.materialStatus,
      materialRefs: row.materialRefs,
      performanceTags: row.performanceTags,
      confidence: row.confidence,
      status: row.status,
    })),
    scenarios: record.scenarios.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      tags: row.tags,
      dimensions: row.dimensions,
      sourceRefs: row.sourceRefs,
      evidenceRefs: row.evidenceRefs,
      materialStatus: row.materialStatus,
      materialRefs: row.materialRefs,
      performanceTags: row.performanceTags,
      confidence: row.confidence,
      status: row.status,
    })),
    evidence: record.evidence.map((item) => ({
      id: item.id,
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      sourceTitle: item.sourceTitle,
      claim: item.claim,
      excerpt: item.excerpt,
      status: item.status,
    })),
    constraints: record.constraints,
    gaps: record.gaps,
    coverage: record.coverage,
    sourceSensitivity: record.sourceSensitivity,
    updatedAt: record.updatedAt,
  };
}

function commandCenterSnapshot(record: BrandCommandCenterRecord): Record<string, unknown> {
  const workspacePath = record.workspacePath;
  const queueItems = record.queueItems.map((item) => ({
    id: item.id,
    campaignCellId: item.campaignCellId,
    actionType: item.actionType,
    title: redactedLocalText(item.title, workspacePath),
    summary: redactedLocalText(item.summary, workspacePath),
    status: item.status,
    blockedReason: redactedLocalText(item.blockedReason, workspacePath),
    recoveryAction: redactedLocalText(item.recoveryAction, workspacePath),
    outputTarget: item.outputTarget,
    resourceBundleId: item.resourceBundleId,
    dimensions: item.dimensions,
    syncStatus: item.syncStatus,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }));
  const actionRecords = record.actionRecords.map((item) => ({
    id: item.id,
    queueItemId: item.queueItemId,
    campaignCellId: item.campaignCellId,
    actionType: item.actionType,
    title: redactedLocalText(item.title, workspacePath),
    outcome: item.outcome,
    actorLabel: redactedLocalText(item.actorLabel, workspacePath),
    actorRole: item.actorRole,
    inputSummary: redactedLocalText(item.inputSummary, workspacePath),
    outputSummary: redactedLocalText(item.outputSummary, workspacePath),
    blockedReason: redactedLocalText(item.blockedReason, workspacePath),
    writeBackSummary: redactedLocalText(item.writeBackSummary, workspacePath),
    promptDraftId: item.promptDraftId,
    sceneCardId: item.sceneCardId,
    workflowRunId: item.workflowRunId,
    teamKnowledgeRelease: item.teamKnowledgeRelease,
    materialCoverageChangeId: item.materialCoverageChangeId,
    reviewTaskId: item.reviewTaskId,
    artifactRefs: redactedLocalRefs(item.artifactRefs, workspacePath),
    syncStatus: item.syncStatus,
    createdAt: item.createdAt,
  }));
  return {
    signals: record.signals.map((item) => ({
      id: item.id,
      type: item.type,
      title: redactedLocalText(item.title, workspacePath),
      summary: redactedLocalText(item.summary, workspacePath),
      sourceLabel: redactedLocalText(item.sourceLabel, workspacePath),
      businessValue: item.businessValue,
      evidenceReadiness: item.evidenceReadiness,
      urgency: item.urgency,
      riskLevel: item.riskLevel,
      productionCost: item.productionCost,
      recommendedObjectiveType: item.recommendedObjectiveType,
      riskBoundary: redactedLocalText(item.riskBoundary, workspacePath),
      relatedMapRowIds: item.relatedMapRowIds,
    })),
    objectives: record.objectives.map((item) => ({
      id: item.id,
      type: item.type,
      title: redactedLocalText(item.title, workspacePath),
      summary: redactedLocalText(item.summary, workspacePath),
      priority: item.priority,
      channels: item.channels,
      dimensions: item.dimensions,
      successCriteria: item.successCriteria.map((criterion) => redactedLocalText(criterion, workspacePath) || criterion),
      signalIds: item.signalIds,
    })),
    resourceBundles: record.resourceBundles.map((item) => ({
      id: item.id,
      title: redactedLocalText(item.title, workspacePath),
      objectiveId: item.objectiveId,
      sourceKnowledgeMapId: item.sourceKnowledgeMapId,
      coverageRowIds: item.coverageRowIds,
      approvedCoverageRowIds: item.approvedCoverageRowIds,
      sellingPointRefs: item.sellingPointRefs.map((ref) => redactedLocalText(ref, workspacePath) || ref),
      evidenceRefs: item.evidenceRefs,
      sceneRefs: item.sceneRefs.map((ref) => redactedLocalText(ref, workspacePath) || ref),
      sceneCardIds: item.sceneCardIds,
      promptDraftIds: item.promptDraftIds,
      materialRefs: redactedLocalRefs(item.materialRefs, workspacePath),
      sopRefs: item.sopRefs,
      dimensions: item.dimensions,
      constraints: item.constraints.map((constraint) => redactedLocalText(constraint, workspacePath) || constraint),
      gaps: item.gaps.map((gap) => redactedLocalText(gap, workspacePath) || gap),
      handoffStatus: item.handoffStatus,
      handoffRefs: redactedLocalRefs(item.handoffRefs, workspacePath),
      lastHandoffSummary: redactedLocalText(item.lastHandoffSummary, workspacePath),
      lastBlockedReason: redactedLocalText(item.lastBlockedReason, workspacePath),
      readyPercent: item.readyPercent,
    })),
    campaignCells: record.campaignCells.map((item) => ({
      id: item.id,
      title: redactedLocalText(item.title, workspacePath),
      objectiveId: item.objectiveId,
      ownerRole: redactedLocalText(item.ownerRole, workspacePath),
      agentRole: redactedLocalText(item.agentRole, workspacePath),
      channels: item.channels,
      dimensions: item.dimensions,
      timeWindow: item.timeWindow,
      resourceBundleId: item.resourceBundleId,
      decisionChecks: item.decisionChecks.map((check) => ({
        key: check.key,
        label: redactedLocalText(check.label, workspacePath),
        status: check.status,
        message: redactedLocalText(check.message, workspacePath),
        recoveryAction: redactedLocalText(check.recoveryAction, workspacePath),
      })),
      queueItemIds: item.queueItemIds,
    })),
    queueSummary: {
      total: queueItems.length,
      statusCounts: countByStatus(queueItems),
      items: queueItems,
    },
    actionSummary: {
      total: actionRecords.length,
      outcomeCounts: countByOutcome(actionRecords),
      records: actionRecords,
    },
    constraints: record.constraints.map((constraint) => redactedLocalText(constraint, workspacePath) || constraint),
    gaps: record.gaps.map((gap) => redactedLocalText(gap, workspacePath) || gap),
  };
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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textValue(value: unknown, fallback = ''): string {
  const text = typeof value === 'string' ? value : value == null ? '' : String(value);
  return text.trim() || fallback;
}

function optionalTextValue(value: unknown): string | undefined {
  const text = textValue(value);
  return text || undefined;
}

function stringArrayValue(value: unknown, limit = 500): string[] {
  return arrayValue(value)
    .map((item) => textValue(item))
    .filter(Boolean)
    .slice(0, limit);
}

function numberValue(value: unknown, fallback = 0): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function teamSyncFromListItem(input: {
  message: string;
  workspaceId?: string;
  serverRevision?: string;
  baseRevision?: string;
  listRevision?: string | number;
}): ContentKnowledgeMapTeamSyncSummary {
  return {
    backend: 'bugu',
    status: 'synced',
    message: input.message,
    workspaceId: input.workspaceId,
    revision: input.serverRevision || (input.listRevision == null ? undefined : String(input.listRevision)),
    baseRevision: input.baseRevision,
    lastSyncedAt: new Date().toISOString(),
  };
}

function knowledgeMapStatusFromResult(value: unknown): ContentKnowledgeMapRecord['status'] {
  const status = textValue(value);
  if (status === 'ready' || status === 'needs-review' || status === 'blocked' || status === 'published') return status;
  return 'draft';
}

function mapRowStatusFromResult(value: unknown): ContentKnowledgeMapRecord['sellingPoints'][number]['status'] {
  const status = textValue(value);
  if (status === 'needs-evidence' || status === 'needs-review') return status;
  return 'ready';
}

function materialStatusFromResult(value: unknown): ContentKnowledgeMapRecord['sellingPoints'][number]['materialStatus'] {
  const status = textValue(value);
  if (status === 'missing' || status === 'covered' || status === 'approved' || status === 'rejected') return status;
  return undefined;
}

function evidenceSourceTypeFromResult(value: unknown): ContentKnowledgeMapRecord['evidence'][number]['sourceType'] {
  const sourceType = textValue(value);
  if (
    sourceType === 'input-source' ||
    sourceType === 'user-quote' ||
    sourceType === 'customer-service-log' ||
    sourceType === 'generated-inference' ||
    sourceType === 'brand-knowledge-base' ||
    sourceType === 'ip-knowledge-base' ||
    sourceType === 'scene-card' ||
    sourceType === 'prompt-draft' ||
    sourceType === 'asset-review'
  ) {
    return sourceType;
  }
  return 'manual';
}

function evidenceStatusFromResult(value: unknown): ContentKnowledgeMapRecord['evidence'][number]['status'] {
  const status = textValue(value);
  if (status === 'missing' || status === 'needs-review') return status;
  return 'ready';
}

function coverageDimensionsFromResult(value: unknown): ContentKnowledgeMapRecord['sellingPoints'][number]['dimensions'] {
  const item = objectValue(value);
  const dimensions = {
    audiences: stringArrayValue(item.audiences, 30),
    channels: stringArrayValue(item.channels, 30),
    stages: stringArrayValue(item.stages, 30),
    contentFormats: stringArrayValue(item.contentFormats, 30),
    useCases: stringArrayValue(item.useCases, 30),
  };
  return Object.values(dimensions).some((items) => items.length) ? dimensions : undefined;
}

function matrixRowFromResult(value: unknown, fallbackId: string): ContentKnowledgeMapRecord['sellingPoints'][number] {
  const item = objectValue(value);
  return {
    id: textValue(item.id, fallbackId),
    title: textValue(item.title, '团队同步内容组合'),
    summary: textValue(item.summary, '从 Bugu 团队事实源同步的内容组合。'),
    tags: stringArrayValue(item.tags, 60),
    dimensions: coverageDimensionsFromResult(item.dimensions),
    sourceRefs: stringArrayValue(item.sourceRefs, 120),
    evidenceRefs: stringArrayValue(item.evidenceRefs, 120),
    materialStatus: materialStatusFromResult(item.materialStatus),
    materialRefs: stringArrayValue(item.materialRefs, 120),
    performanceTags: stringArrayValue(item.performanceTags, 80),
    confidence: numberValue(item.confidence),
    status: mapRowStatusFromResult(item.status),
  };
}

function evidenceFromResult(value: unknown, fallbackId: string): ContentKnowledgeMapRecord['evidence'][number] {
  const item = objectValue(value);
  return {
    id: textValue(item.id, fallbackId),
    sourceType: evidenceSourceTypeFromResult(item.sourceType),
    sourceId: optionalTextValue(item.sourceId),
    sourceTitle: textValue(item.sourceTitle, '团队证据'),
    claim: textValue(item.claim, '团队同步证据。'),
    excerpt: textValue(item.excerpt, '团队同步证据原文。'),
    status: evidenceStatusFromResult(item.status),
  };
}

function coverageFromResult(input: {
  coverage: unknown;
  item: BuguContentKnowledgeMap;
  sourceInputSourceIds: string[];
  brandKnowledgeBaseIds: string[];
  ipKnowledgeBaseIds: string[];
  sceneCardIds: string[];
  promptDraftIds: string[];
  evidenceCount: number;
  gapCount: number;
}): ContentKnowledgeMapRecord['coverage'] {
  const coverage = objectValue(input.coverage);
  return {
    inputSourceCount: numberValue(coverage.inputSourceCount, input.sourceInputSourceIds.length),
    brandKnowledgeBaseCount: numberValue(coverage.brandKnowledgeBaseCount, input.brandKnowledgeBaseIds.length),
    ipKnowledgeBaseCount: numberValue(coverage.ipKnowledgeBaseCount, input.ipKnowledgeBaseIds.length),
    skuRowCount: numberValue(coverage.skuRowCount),
    competitorObservationCount: numberValue(coverage.competitorObservationCount),
    assetReviewCount: numberValue(coverage.assetReviewCount),
    sceneCardCount: numberValue(coverage.sceneCardCount, input.sceneCardIds.length),
    promptDraftCount: numberValue(coverage.promptDraftCount, input.promptDraftIds.length),
    evidenceCount: numberValue(coverage.evidenceCount, numberValue(input.item.evidenceCount, input.evidenceCount)),
    gapCount: numberValue(coverage.gapCount, numberValue(input.item.gapCount, input.gapCount)),
    readyPercent: numberValue(coverage.readyPercent, numberValue(input.item.readyPercent)),
  };
}

function sourceSensitivityFromResult(value: unknown): ContentKnowledgeMapSourceSensitivitySummary | undefined {
  const item = objectValue(value);
  const highest = textValue(item.highest);
  if (highest !== 'public' && highest !== 'internal' && highest !== 'confidential' && highest !== 'restricted') return undefined;
  const counts = objectValue(item.counts);
  return {
    highest,
    counts: {
      public: numberValue(counts.public),
      internal: numberValue(counts.internal),
      confidential: numberValue(counts.confidential),
      restricted: numberValue(counts.restricted),
    },
    restrictedSourceTitles: stringArrayValue(item.restrictedSourceTitles, 20),
    confidentialSourceTitles: stringArrayValue(item.confidentialSourceTitles, 20),
  };
}

function knowledgeMapFromResult(input: {
  workspacePath: string;
  item: BuguContentKnowledgeMap;
  listRevision?: string | number;
  fallbackWorkspaceId?: string;
}): ContentKnowledgeMapRecord | null {
  if (!input.item.id) return null;
  const now = new Date().toISOString();
  const snapshot = objectValue(input.item.snapshot);
  const sellingPoints = arrayValue(snapshot.sellingPoints).map((row, index) => matrixRowFromResult(row, `selling-${index + 1}`));
  const painPoints = arrayValue(snapshot.painPoints).map((row, index) => matrixRowFromResult(row, `pain-${index + 1}`));
  const scenarios = arrayValue(snapshot.scenarios).map((row, index) => matrixRowFromResult(row, `scenario-${index + 1}`));
  const evidence = arrayValue(snapshot.evidence).map((item, index) => evidenceFromResult(item, `evidence-${index + 1}`));
  const constraints = stringArrayValue(snapshot.constraints, 200);
  const snapshotGaps = stringArrayValue(snapshot.gaps, 200);
  const gaps = snapshotGaps.length ? snapshotGaps : stringArrayValue(input.item.qualityIssues, 200);
  const sourceInputSourceIds = stringArrayValue(input.item.sourceInputSourceIds);
  const brandKnowledgeBaseIds = stringArrayValue(input.item.brandKnowledgeBaseIds);
  const ipKnowledgeBaseIds = stringArrayValue(input.item.ipKnowledgeBaseIds);
  const sceneCardIds = stringArrayValue(input.item.sceneCardIds);
  const promptDraftIds = stringArrayValue(input.item.promptDraftIds);
  const teamSync = teamSyncFromListItem({
    message: '已从 Bugu 团队事实源拉取内容知识地图。',
    workspaceId: input.item.workspaceId || input.fallbackWorkspaceId,
    serverRevision: input.item.serverRevision,
    baseRevision: input.item.baseRevision,
    listRevision: input.listRevision,
  });
  return {
    id: input.item.id,
    workspacePath: input.workspacePath,
    title: textValue(input.item.title || snapshot.title, '团队内容知识地图'),
    status: knowledgeMapStatusFromResult(input.item.status || snapshot.status),
    syncStatus: 'synced',
    teamSync,
    sourceInputSourceIds,
    brandKnowledgeBaseIds,
    ipKnowledgeBaseIds,
    sceneCardIds,
    promptDraftIds,
    sellingPoints,
    painPoints,
    scenarios,
    evidence,
    constraints,
    gaps,
    coverage: coverageFromResult({
      coverage: input.item.coverage || snapshot.coverage,
      item: input.item,
      sourceInputSourceIds,
      brandKnowledgeBaseIds,
      ipKnowledgeBaseIds,
      sceneCardIds,
      promptDraftIds,
      evidenceCount: evidence.length,
      gapCount: gaps.length,
    }),
    sourceSensitivity: sourceSensitivityFromResult(input.item.sourceSensitivity || snapshot.sourceSensitivity),
    model: optionalTextValue(input.item.model),
    createdAt: input.item.createdAt || now,
    updatedAt: input.item.updatedAt || textValue(snapshot.updatedAt) || now,
  };
}

function buildRunStatusFromResult(value: unknown): ContentKnowledgeMapBuildRunRecord['status'] {
  const status = textValue(value);
  if (status === 'blocked' || status === 'failed') return status;
  return 'completed';
}

function buildRunStepStatusFromResult(value: unknown): ContentKnowledgeMapBuildRunRecord['steps'][number]['status'] {
  const status = textValue(value);
  if (status === 'blocked' || status === 'failed' || status === 'skipped') return status;
  return 'completed';
}

function buildRunStepFromResult(value: unknown, fallbackIndex: number): ContentKnowledgeMapBuildRunRecord['steps'][number] {
  const item = objectValue(value);
  const now = new Date().toISOString();
  return {
    key: textValue(item.key, `step-${fallbackIndex + 1}`),
    title: textValue(item.title, '团队生成步骤'),
    status: buildRunStepStatusFromResult(item.status),
    message: textValue(item.message, '从 Bugu 团队事实源同步的生成步骤。'),
    startedAt: textValue(item.startedAt, now),
    completedAt: textValue(item.completedAt, textValue(item.startedAt, now)),
  };
}

function buildRunFromResult(input: {
  workspacePath: string;
  item: BuguContentBuildRun;
  listRevision?: string | number;
  fallbackWorkspaceId?: string;
}): ContentKnowledgeMapBuildRunRecord | null {
  if (!input.item.id) return null;
  const now = new Date().toISOString();
  const teamSync = teamSyncFromListItem({
    message: '已从 Bugu 团队事实源拉取生成流程。',
    workspaceId: input.item.workspaceId || input.fallbackWorkspaceId,
    serverRevision: input.item.serverRevision,
    baseRevision: input.item.baseRevision,
    listRevision: input.listRevision,
  });
  return {
    id: input.item.id,
    workspacePath: input.workspacePath,
    title: textValue(input.item.title, '团队生成流程'),
    status: buildRunStatusFromResult(input.item.status),
    contentKnowledgeMapId: optionalTextValue(input.item.contentKnowledgeMapId),
    contentKnowledgeMapTitle: optionalTextValue(input.item.contentKnowledgeMapTitle),
    model: optionalTextValue(input.item.model),
    inputSourceIds: stringArrayValue(input.item.inputSourceIds),
    brandKnowledgeBaseIds: stringArrayValue(input.item.brandKnowledgeBaseIds),
    ipKnowledgeBaseIds: stringArrayValue(input.item.ipKnowledgeBaseIds),
    sceneCardIds: stringArrayValue(input.item.sceneCardIds),
    promptDraftIds: stringArrayValue(input.item.promptDraftIds),
    readyPercent: numberValue(input.item.readyPercent),
    evidenceCount: numberValue(input.item.evidenceCount),
    gapCount: numberValue(input.item.gapCount),
    issues: stringArrayValue(input.item.issues, 200),
    steps: arrayValue(input.item.steps).map(buildRunStepFromResult),
    teamSync,
    startedAt: input.item.startedAt || input.item.createdAt || now,
    completedAt: input.item.completedAt || input.item.updatedAt || input.item.startedAt || now,
    updatedAt: input.item.updatedAt || input.item.completedAt || now,
  };
}

function brandSignalTypeFromResult(value: unknown): BrandCommandCenterRecord['signals'][number]['type'] {
  const type = textValue(value);
  if (
    type === 'feedback-pain' ||
    type === 'competitor-action' ||
    type === 'trend' ||
    type === 'ad-performance' ||
    type === 'material-performance' ||
    type === 'brand-risk'
  ) {
    return type;
  }
  return 'manual';
}

function brandObjectiveTypeFromResult(value: unknown): BrandCommandCenterRecord['objectives'][number]['type'] {
  const type = textValue(value);
  if (
    type === 'acquisition' ||
    type === 'conversion' ||
    type === 'objection-handling' ||
    type === 'trust-building' ||
    type === 'price-defense' ||
    type === 'risk-control' ||
    type === 'evidence-gap' ||
    type === 'material-gap' ||
    type === 'retention'
  ) {
    return type;
  }
  return 'conversion';
}

function objectivePriorityFromResult(value: unknown): BrandCommandCenterRecord['objectives'][number]['priority'] {
  const priority = textValue(value);
  if (priority === 'P0' || priority === 'P2') return priority;
  return 'P1';
}

function queueStatusFromResult(value: unknown): BrandCommandQueueItem['status'] {
  const status = textValue(value);
  if (
    status === 'ready' ||
    status === 'needs-review' ||
    status === 'needs-resource' ||
    status === 'handed-off' ||
    status === 'written-back'
  ) {
    return status;
  }
  return 'blocked';
}

function outputTargetFromResult(value: unknown): BrandCommandQueueItem['outputTarget'] {
  const target = textValue(value);
  if (
    target === 'prompt-draft' ||
    target === 'scene-card' ||
    target === 'review-task' ||
    target === 'evidence-task' ||
    target === 'sop-run' ||
    target === 'material-gap' ||
    target === 'material-coverage'
  ) {
    return target;
  }
  return 'prompt-draft';
}

function decisionCheckStatusFromResult(value: unknown): BrandCommandCenterRecord['campaignCells'][number]['decisionChecks'][number]['status'] {
  const status = textValue(value);
  if (status === 'needs-review' || status === 'needs-resource' || status === 'blocked') return status;
  return 'passed';
}

function handoffStatusFromResult(value: unknown): BrandCommandCenterRecord['resourceBundles'][number]['handoffStatus'] {
  const status = textValue(value);
  if (status === 'handed-off' || status === 'blocked') return status;
  if (status === 'none') return status;
  return undefined;
}

function actorRoleFromResult(value: unknown): BrandCommandActionRecord['actorRole'] | undefined {
  const role = textValue(value);
  if (role === 'owner' || role === 'content-engineer' || role === 'reviewer' || role === 'operator' || role === 'viewer') return role;
  return undefined;
}

function teamKnowledgeReleaseFromResult(value: unknown): ContentKnowledgeReleaseReference | undefined {
  const item = objectValue(value);
  const id = textValue(item.id);
  const title = textValue(item.title);
  const version = textValue(item.version);
  if (!id || !title || !version) return undefined;
  return {
    id,
    title,
    version,
    contentKnowledgeMapId: optionalTextValue(item.contentKnowledgeMapId),
    contentKnowledgeMapTitle: optionalTextValue(item.contentKnowledgeMapTitle),
    packageObjectKey: optionalTextValue(item.packageObjectKey),
    packagePublicUrl: optionalTextValue(item.packagePublicUrl),
    packageUploadStatus: optionalTextValue(item.packageUploadStatus),
    approvalStatus: item.approvalStatus === 'pending' || item.approvalStatus === 'rejected' ? item.approvalStatus : 'approved',
  };
}

function signalFromResult(value: unknown, fallbackIndex: number): BrandCommandCenterRecord['signals'][number] {
  const item = objectValue(value);
  return {
    id: textValue(item.id, `signal-${fallbackIndex + 1}`),
    type: brandSignalTypeFromResult(item.type),
    title: textValue(item.title, '团队信号'),
    summary: textValue(item.summary, '从 Bugu 团队事实源同步的信号。'),
    sourceLabel: textValue(item.sourceLabel, '团队工作区'),
    businessValue: numberValue(item.businessValue),
    evidenceReadiness: numberValue(item.evidenceReadiness),
    urgency: numberValue(item.urgency),
    riskLevel: numberValue(item.riskLevel),
    productionCost: numberValue(item.productionCost),
    recommendedObjectiveType: brandObjectiveTypeFromResult(item.recommendedObjectiveType),
    riskBoundary: textValue(item.riskBoundary),
    relatedMapRowIds: stringArrayValue(item.relatedMapRowIds, 120),
  };
}

function objectiveFromResult(value: unknown, fallbackIndex: number): BrandCommandCenterRecord['objectives'][number] {
  const item = objectValue(value);
  return {
    id: textValue(item.id, `objective-${fallbackIndex + 1}`),
    type: brandObjectiveTypeFromResult(item.type),
    title: textValue(item.title, '团队目标'),
    summary: textValue(item.summary, '从 Bugu 团队事实源同步的目标。'),
    priority: objectivePriorityFromResult(item.priority),
    channels: stringArrayValue(item.channels, 60),
    dimensions: coverageDimensionsFromResult(item.dimensions),
    successCriteria: stringArrayValue(item.successCriteria, 80),
    signalIds: stringArrayValue(item.signalIds, 120),
  };
}

function resourceBundleFromResult(value: unknown, fallbackIndex: number): BrandCommandCenterRecord['resourceBundles'][number] {
  const item = objectValue(value);
  return {
    id: textValue(item.id, `bundle-${fallbackIndex + 1}`),
    title: textValue(item.title, '团队资源包'),
    objectiveId: textValue(item.objectiveId),
    sourceKnowledgeMapId: optionalTextValue(item.sourceKnowledgeMapId),
    coverageRowIds: stringArrayValue(item.coverageRowIds, 160),
    approvedCoverageRowIds: stringArrayValue(item.approvedCoverageRowIds, 160),
    sellingPointRefs: stringArrayValue(item.sellingPointRefs, 160),
    evidenceRefs: stringArrayValue(item.evidenceRefs, 160),
    sceneRefs: stringArrayValue(item.sceneRefs, 160),
    sceneCardIds: stringArrayValue(item.sceneCardIds, 160),
    promptDraftIds: stringArrayValue(item.promptDraftIds, 160),
    materialRefs: stringArrayValue(item.materialRefs, 160),
    sopRefs: stringArrayValue(item.sopRefs, 160),
    dimensions: coverageDimensionsFromResult(item.dimensions),
    constraints: stringArrayValue(item.constraints, 120),
    gaps: stringArrayValue(item.gaps, 120),
    handoffStatus: handoffStatusFromResult(item.handoffStatus),
    handoffRefs: stringArrayValue(item.handoffRefs, 120),
    lastHandoffSummary: optionalTextValue(item.lastHandoffSummary),
    lastBlockedReason: optionalTextValue(item.lastBlockedReason),
    readyPercent: numberValue(item.readyPercent),
  };
}

function decisionCheckFromResult(value: unknown, fallbackIndex: number): BrandCommandCenterRecord['campaignCells'][number]['decisionChecks'][number] {
  const item = objectValue(value);
  return {
    key: textValue(item.key, `check-${fallbackIndex + 1}`),
    label: textValue(item.label, '团队检查项'),
    status: decisionCheckStatusFromResult(item.status),
    message: textValue(item.message, '从 Bugu 团队事实源同步的检查项。'),
    recoveryAction: optionalTextValue(item.recoveryAction),
  };
}

function campaignCellFromResult(value: unknown, fallbackIndex: number): BrandCommandCenterRecord['campaignCells'][number] {
  const item = objectValue(value);
  return {
    id: textValue(item.id, `cell-${fallbackIndex + 1}`),
    title: textValue(item.title, '团队作战单元'),
    objectiveId: textValue(item.objectiveId),
    ownerRole: textValue(item.ownerRole, '内容负责人'),
    agentRole: textValue(item.agentRole, '内容工程 Agent'),
    channels: stringArrayValue(item.channels, 60),
    dimensions: coverageDimensionsFromResult(item.dimensions),
    timeWindow: textValue(item.timeWindow, '本轮'),
    resourceBundleId: textValue(item.resourceBundleId),
    decisionChecks: arrayValue(item.decisionChecks).map(decisionCheckFromResult),
    queueItemIds: stringArrayValue(item.queueItemIds, 160),
  };
}

function queueItemFromResult(input: {
  value: unknown;
  fallbackIndex: number;
  teamSync: ContentKnowledgeMapTeamSyncSummary;
}): BrandCommandQueueItem {
  const item = objectValue(input.value);
  const now = new Date().toISOString();
  return {
    id: textValue(item.id, `queue-${input.fallbackIndex + 1}`),
    campaignCellId: textValue(item.campaignCellId),
    actionType: brandActionTypeFromResult(textValue(item.actionType)),
    title: textValue(item.title, '团队队列动作'),
    summary: textValue(item.summary, '从 Bugu 团队事实源同步的队列动作。'),
    status: queueStatusFromResult(item.status),
    blockedReason: optionalTextValue(item.blockedReason),
    recoveryAction: optionalTextValue(item.recoveryAction),
    outputTarget: outputTargetFromResult(item.outputTarget),
    resourceBundleId: textValue(item.resourceBundleId),
    dimensions: coverageDimensionsFromResult(item.dimensions),
    syncStatus: 'synced',
    teamSync: input.teamSync,
    createdAt: textValue(item.createdAt, now),
    updatedAt: textValue(item.updatedAt, textValue(item.createdAt, now)),
  };
}

function actionRecordFromSnapshot(input: {
  value: unknown;
  fallbackIndex: number;
  teamSync: ContentKnowledgeMapTeamSyncSummary;
}): BrandCommandActionRecord {
  const item = objectValue(input.value);
  return {
    id: textValue(item.id, `action-${input.fallbackIndex + 1}`),
    queueItemId: optionalTextValue(item.queueItemId),
    campaignCellId: optionalTextValue(item.campaignCellId),
    actionType: brandActionTypeFromResult(textValue(item.actionType)),
    title: textValue(item.title, '团队行动记录'),
    outcome: brandActionOutcomeFromResult(textValue(item.outcome)),
    actorLabel: textValue(item.actorLabel, '团队成员'),
    actorRole: actorRoleFromResult(item.actorRole),
    inputSummary: textValue(item.inputSummary),
    outputSummary: textValue(item.outputSummary),
    blockedReason: optionalTextValue(item.blockedReason),
    writeBackSummary: optionalTextValue(item.writeBackSummary),
    promptDraftId: optionalTextValue(item.promptDraftId),
    sceneCardId: optionalTextValue(item.sceneCardId),
    workflowRunId: optionalTextValue(item.workflowRunId),
    teamKnowledgeRelease: teamKnowledgeReleaseFromResult(item.teamKnowledgeRelease),
    materialCoverageChangeId: optionalTextValue(item.materialCoverageChangeId),
    reviewTaskId: optionalTextValue(item.reviewTaskId),
    artifactRefs: stringArrayValue(item.artifactRefs, 80),
    syncStatus: 'synced',
    teamSync: input.teamSync,
    createdAt: textValue(item.createdAt, new Date().toISOString()),
  };
}

function commandCenterFromResult(input: {
  workspacePath: string;
  item: BuguContentCommandCenter;
  listRevision?: string | number;
  fallbackWorkspaceId?: string;
}): BrandCommandCenterRecord | null {
  if (!input.item.id) return null;
  const now = new Date().toISOString();
  const teamSync = teamSyncFromListItem({
    message: '已从 Bugu 团队事实源拉取品牌内容作战系统。',
    workspaceId: input.item.workspaceId || input.fallbackWorkspaceId,
    serverRevision: input.item.serverRevision,
    baseRevision: input.item.baseRevision,
    listRevision: input.listRevision,
  });
  const queueSummary = objectValue(input.item.queueSummary);
  const actionSummary = objectValue(input.item.actionSummary);
  return {
    id: input.item.id,
    workspacePath: input.workspacePath,
    title: textValue(input.item.title, '团队品牌内容作战系统'),
    status: input.item.status === 'draft' ||
      input.item.status === 'needs-review' ||
      input.item.status === 'blocked' ||
      input.item.status === 'archived'
      ? input.item.status
      : 'active',
    syncStatus: 'synced',
    sourceKnowledgeMapId: optionalTextValue(input.item.sourceKnowledgeMapId),
    sourceKnowledgeMapTitle: optionalTextValue(input.item.sourceKnowledgeMapTitle),
    signals: arrayValue(input.item.signals).map(signalFromResult),
    objectives: arrayValue(input.item.objectives).map(objectiveFromResult),
    resourceBundles: arrayValue(input.item.resourceBundles).map(resourceBundleFromResult),
    campaignCells: arrayValue(input.item.campaignCells).map(campaignCellFromResult),
    queueItems: arrayValue(queueSummary.items).map((value, index) => queueItemFromResult({ value, fallbackIndex: index, teamSync })),
    actionRecords: arrayValue(actionSummary.records).map((value, index) => actionRecordFromSnapshot({ value, fallbackIndex: index, teamSync })),
    constraints: stringArrayValue(input.item.constraints, 200),
    gaps: stringArrayValue(input.item.gaps, 200),
    teamSync,
    createdAt: input.item.createdAt || now,
    updatedAt: input.item.updatedAt || now,
  };
}

function brandActionTypeFromResult(value: string | undefined): BrandCommandActionRecord['actionType'] {
  if (value === 'create-scene-card') return 'create-scene-card';
  if (value === 'request-review') return 'request-review';
  if (value === 'request-evidence') return 'request-evidence';
  if (value === 'launch-sop-run') return 'launch-sop-run';
  if (value === 'create-material-gap-list') return 'create-material-gap-list';
  if (value === 'write-back-material-coverage') return 'write-back-material-coverage';
  if (value === 'confirm-objectives') return 'confirm-objectives';
  if (value === 'confirm-resource-bundles') return 'confirm-resource-bundles';
  if (value === 'sync-execution-queue') return 'sync-execution-queue';
  if (value === 'review-action-records') return 'review-action-records';
  if (value === 'export-action-records') return 'export-action-records';
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
    teamKnowledgeRelease: input.item.teamKnowledgeRelease,
    materialCoverageChangeId: input.item.materialCoverageChangeId || undefined,
    reviewTaskId: input.item.reviewTaskId || undefined,
    artifactRefs: Array.isArray(input.item.artifactRefs) ? input.item.artifactRefs.filter((ref): ref is string => typeof ref === 'string') : undefined,
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

export class BuguContentWorkspaceSyncAdapter implements ContentWorkspaceSyncAdapter, ContentKnowledgeMapSyncPort, ContentReviewTaskSyncAdapter, BrandCommandActionSyncAdapter, ContentMaterialCoverageSyncAdapter, BrandCommandExecutionQueueSyncAdapter, BrandCommandCenterSyncAdapter {
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

  async draftStatus(_workspacePath: string): Promise<ContentKnowledgeMapTeamSyncSummary> {
    const token = await this.tokenProvider?.().catch(() => undefined);
    if (!token) {
      return {
        backend: 'bugu',
        status: 'local-only',
        message: '已保存为本机草稿；登录 Bugu 后会同步到团队内容工作区。',
      };
    }
    return {
      backend: 'bugu',
      status: 'pending-sync',
      message: '将同步到 Bugu 团队内容工作区。',
    };
  }

  async upsertKnowledgeMapSnapshot(input: {
    record: ContentKnowledgeMapRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    try {
      const result = await this.post<BuguContentKnowledgeMapResult>('content-knowledge-maps', {
        tenantId: this.tenantId,
        workspaceId: input.record.teamSync.workspaceId,
        workspaceKey: contentWorkspaceKey(input.record.workspacePath),
        id: input.record.id,
        idempotencyKey: input.record.id,
        title: input.record.title,
        status: input.record.status,
        model: input.record.model,
        sourceInputSourceIds: input.record.sourceInputSourceIds,
        brandKnowledgeBaseIds: input.record.brandKnowledgeBaseIds,
        ipKnowledgeBaseIds: input.record.ipKnowledgeBaseIds,
        sceneCardIds: input.record.sceneCardIds,
        promptDraftIds: input.record.promptDraftIds,
        sellingPointCount: input.record.sellingPoints.length,
        painPointCount: input.record.painPoints.length,
        scenarioCount: input.record.scenarios.length,
        evidenceCount: input.record.coverage.evidenceCount,
        gapCount: input.record.coverage.gapCount,
        readyPercent: input.record.coverage.readyPercent,
        coverage: input.record.coverage,
        sourceSensitivity: input.record.sourceSensitivity,
        qualityIssues: input.record.gaps,
        snapshot: knowledgeMapSnapshot(input.record),
        baseRevision: input.record.teamSync.revision || input.record.teamSync.baseRevision,
        authorLabel: input.authorLabel,
        createdAt: input.record.createdAt,
      });
      return teamSyncFromResult({
        message: '内容知识地图已同步到 Bugu 团队事实源。',
        workspace: result.workspace,
        serverRevision: result.knowledgeMap?.serverRevision,
        baseRevision: result.knowledgeMap?.baseRevision || input.record.teamSync.revision,
      });
    } catch (error) {
      return this.errorSync(error, '内容知识地图已保存在本机，但未同步到 Bugu 团队事实源。');
    }
  }

  async appendBuildRun(input: {
    buildRun: ContentKnowledgeMapBuildRunRecord;
    sourceKnowledgeMap?: ContentKnowledgeMapRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    try {
      const teamSync = input.sourceKnowledgeMap?.teamSync || input.buildRun.teamSync;
      const result = await this.post<BuguContentBuildRunResult>('content-build-runs', {
        tenantId: this.tenantId,
        workspaceId: teamSync?.workspaceId,
        workspaceKey: contentWorkspaceKey(input.buildRun.workspacePath),
        id: input.buildRun.id,
        idempotencyKey: input.buildRun.id,
        title: input.buildRun.title,
        status: input.buildRun.status,
        contentKnowledgeMapId: input.buildRun.contentKnowledgeMapId,
        contentKnowledgeMapTitle: input.buildRun.contentKnowledgeMapTitle,
        model: input.buildRun.model,
        inputSourceIds: input.buildRun.inputSourceIds,
        brandKnowledgeBaseIds: input.buildRun.brandKnowledgeBaseIds,
        ipKnowledgeBaseIds: input.buildRun.ipKnowledgeBaseIds,
        sceneCardIds: input.buildRun.sceneCardIds,
        promptDraftIds: input.buildRun.promptDraftIds,
        readyPercent: input.buildRun.readyPercent,
        evidenceCount: input.buildRun.evidenceCount,
        gapCount: input.buildRun.gapCount,
        issues: input.buildRun.issues,
        steps: input.buildRun.steps,
        baseRevision: teamSync?.revision || teamSync?.baseRevision || input.buildRun.teamSync?.revision,
        authorLabel: input.authorLabel,
        startedAt: input.buildRun.startedAt,
        completedAt: input.buildRun.completedAt,
      });
      return teamSyncFromResult({
        message: '生成流程已同步到 Bugu 团队事实源。',
        workspace: result.workspace,
        serverRevision: result.buildRun?.serverRevision,
        baseRevision: result.buildRun?.baseRevision || teamSync?.revision,
      });
    } catch (error) {
      return this.errorSync(error, '生成流程已保存在本机，但未同步到 Bugu 团队事实源。');
    }
  }

  async upsertCommandCenterSnapshot(input: {
    record: BrandCommandCenterRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    try {
      const readyQueueItemCount = input.record.queueItems.filter((item) => item.status === 'ready').length;
      const blockedQueueItemCount = input.record.queueItems.filter((item) => item.status === 'blocked').length;
      const handedOffQueueItemCount = input.record.queueItems.filter((item) => item.status === 'handed-off').length;
      const result = await this.post<BuguContentCommandCenterResult>('content-command-centers', {
        tenantId: this.tenantId,
        workspaceId: input.record.teamSync.workspaceId,
        workspaceKey: contentWorkspaceKey(input.record.workspacePath),
        id: input.record.id,
        idempotencyKey: input.record.id,
        title: input.record.title,
        status: input.record.status,
        sourceKnowledgeMapId: input.record.sourceKnowledgeMapId,
        sourceKnowledgeMapTitle: input.record.sourceKnowledgeMapTitle,
        signalCount: input.record.signals.length,
        objectiveCount: input.record.objectives.length,
        resourceBundleCount: input.record.resourceBundles.length,
        campaignCellCount: input.record.campaignCells.length,
        queueItemCount: input.record.queueItems.length,
        actionRecordCount: input.record.actionRecords.length,
        readyQueueItemCount,
        blockedQueueItemCount,
        handedOffQueueItemCount,
        snapshot: commandCenterSnapshot(input.record),
        baseRevision: input.record.teamSync.revision || input.record.teamSync.baseRevision,
        authorLabel: input.authorLabel,
        createdAt: input.record.createdAt,
      });
      return teamSyncFromResult({
        message: '品牌内容作战系统已同步到 Bugu 团队事实源。',
        workspace: result.workspace,
        serverRevision: result.commandCenter?.serverRevision,
        baseRevision: result.commandCenter?.baseRevision || input.record.teamSync.revision,
      });
    } catch (error) {
      return this.errorSync(error, '品牌内容作战系统已保存在本机，但未同步到 Bugu 团队事实源。');
    }
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

  async listKnowledgeMaps(input: {
    workspacePath: string;
    workspaceId?: string;
  }): Promise<ContentKnowledgeMapRecord[]> {
    if (!input.workspaceId) return [];
    const result = await this.listItems<BuguContentKnowledgeMap>('content-knowledge-maps', {
      workspaceId: input.workspaceId,
    });
    return result.items
      .map((item) => knowledgeMapFromResult({
        workspacePath: input.workspacePath,
        item,
        listRevision: result.revision,
        fallbackWorkspaceId: input.workspaceId,
      }))
      .filter((record): record is ContentKnowledgeMapRecord => Boolean(record));
  }

  async listBuildRuns(input: {
    workspacePath: string;
    workspaceId?: string;
    contentKnowledgeMapId?: string;
  }): Promise<ContentKnowledgeMapBuildRunRecord[]> {
    if (!input.workspaceId) return [];
    const result = await this.listItems<BuguContentBuildRun>('content-build-runs', {
      workspaceId: input.workspaceId,
      contentKnowledgeMapId: input.contentKnowledgeMapId,
    });
    return result.items
      .map((item) => buildRunFromResult({
        workspacePath: input.workspacePath,
        item,
        listRevision: result.revision,
        fallbackWorkspaceId: input.workspaceId,
      }))
      .filter((record): record is ContentKnowledgeMapBuildRunRecord => Boolean(record));
  }

  async listCommandCenters(input: {
    workspacePath: string;
    workspaceId?: string;
    sourceKnowledgeMapId?: string;
  }): Promise<BrandCommandCenterRecord[]> {
    if (!input.workspaceId) return [];
    const result = await this.listItems<BuguContentCommandCenter>('content-command-centers', {
      workspaceId: input.workspaceId,
      sourceKnowledgeMapId: input.sourceKnowledgeMapId,
    });
    return result.items
      .map((item) => commandCenterFromResult({
        workspacePath: input.workspacePath,
        item,
        listRevision: result.revision,
        fallbackWorkspaceId: input.workspaceId,
      }))
      .filter((record): record is BrandCommandCenterRecord => Boolean(record));
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
          teamKnowledgeRelease: input.record.teamKnowledgeRelease,
          materialCoverageChangeId: input.record.materialCoverageChangeId,
          reviewTaskId: input.record.reviewTaskId,
          artifactRefs: redactedLocalRefs(input.record.artifactRefs, input.workspacePath),
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

  private async listItems<TItem>(
    route: string,
    params: Record<string, string | undefined>,
  ): Promise<{ items: TItem[]; revision?: string | number }> {
    const items: TItem[] = [];
    let offset = 0;
    let revision: string | number | undefined;
    const limit = 100;
    for (let page = 0; page < 50; page += 1) {
      const result = await this.get<{
        items?: TItem[];
        total?: number;
        limit?: number;
        offset?: number;
        revision?: string | number;
      }>(route, {
        ...params,
        limit: String(limit),
        offset: String(offset),
      });
      const pageItems = Array.isArray(result.items) ? result.items : [];
      items.push(...pageItems);
      revision = result.revision ?? revision;
      const total = Number(result.total);
      const responseLimit = Number(result.limit) || limit;
      const responseOffset = Number(result.offset) || offset;
      if (!pageItems.length) break;
      if (Number.isFinite(total) && responseOffset + pageItems.length >= total) break;
      if (pageItems.length < responseLimit) break;
      offset = responseOffset + pageItems.length;
    }
    return { items, revision };
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
