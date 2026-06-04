import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, relative } from 'node:path';
import type {
  ContentProductionHandoffActionRecord,
  ContentDraftChange,
  ContentKnowledgeMapBuildRunRecord,
  ContentKnowledgeMapRecord,
  ContentKnowledgeRelease,
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

export class BuguContentWorkspaceSyncAdapter implements ContentWorkspaceSyncAdapter, ContentKnowledgeMapSyncPort, ContentReviewTaskSyncAdapter, ContentMaterialCoverageSyncAdapter, ContentProductionHandoffActionSyncAdapter {
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
          queueItemId: action.batchId,
          campaignCellId: action.batchId,
          actionType: action.actionType === 'create-prompt-draft'
            ? 'generate-prompt-draft'
            : action.actionType === 'create-scene-card'
              ? 'create-scene-card'
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
