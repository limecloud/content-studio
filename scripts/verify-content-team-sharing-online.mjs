import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_BASE_URL = 'https://api.bugu.run';
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_LIST_ITEMS = 5_000;

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function cliValue(argv, name) {
  const prefix = `--${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

function cliFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function contentApiPath(baseUrl, route) {
  const base = normalizeBaseUrl(baseUrl || DEFAULT_API_BASE_URL);
  if (base.endsWith('/api/v1')) return `${base}/oem/${route}`;
  if (base.endsWith('/api')) return `${base}/v1/oem/${route}`;
  return `${base}/api/v1/oem/${route}`;
}

function unwrapData(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data;
  return payload;
}

function authHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    'cache-control': 'no-cache',
  };
}

async function fetchWithTimeout(fetchImpl, url, init = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(fetchImpl, url, init, timeoutMs) {
  const response = await fetchWithTimeout(fetchImpl, url, init, timeoutMs);
  const text = await response.text();
  let payload;
  try {
    payload = text.trim() ? JSON.parse(text) : {};
  } catch {
    throw new Error(`${url} 返回的不是 JSON：${text.slice(0, 300)}`);
  }
  if (!response.ok || payload?.code) {
    throw new Error(`${url} -> HTTP ${response.status}: ${normalizeText(payload?.message || text).slice(0, 500)}`);
  }
  return unwrapData(payload);
}

function normalizePositiveInteger(value, fallback, max = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeNonNegativeInteger(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return Math.floor(parsed);
}

async function listContentPage(fetchImpl, options, route, token, query = {}) {
  const url = new URL(contentApiPath(options.apiBaseUrl, route));
  if (options.tenant) url.searchParams.set('tenant', options.tenant);
  if (options.workspaceId) url.searchParams.set('workspaceId', options.workspaceId);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && String(value) !== '') {
      url.searchParams.set(key, String(value));
    }
  }
  return fetchJson(fetchImpl, url, {
    method: 'GET',
    headers: authHeaders(token),
  }, options.timeoutMs);
}

async function listContent(fetchImpl, options, route, token) {
  const limit = normalizePositiveInteger(options.pageSize, DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE);
  const maxItems = normalizePositiveInteger(options.maxListItems, DEFAULT_MAX_LIST_ITEMS);
  let offset = 0;
  let total = null;
  let firstPayload = null;
  const items = [];

  while (items.length < maxItems) {
    const payload = await listContentPage(fetchImpl, options, route, token, { limit, offset });
    if (!firstPayload) firstPayload = payload && typeof payload === 'object' ? payload : {};
    const pageItems = Array.isArray(payload?.items) ? payload.items : [];
    items.push(...pageItems);

    const payloadTotal = Number(payload?.total);
    if (Number.isFinite(payloadTotal) && payloadTotal >= 0) total = Math.floor(payloadTotal);
    if (pageItems.length === 0) break;
    if (total !== null && items.length >= total) break;
    if (pageItems.length < limit) break;

    offset += limit;
  }

  const expectedTotal = total ?? items.length;
  const slicedItems = items.slice(0, maxItems);
  const truncated = slicedItems.length < expectedTotal;
  return {
    ...firstPayload,
    items: slicedItems,
    total: expectedTotal,
    fetched: slicedItems.length,
    limit,
    offset: 0,
    truncated,
  };
}

function normalizeWorkspace(raw = {}) {
  return {
    id: normalizeText(raw.id || raw.workspaceId),
    name: normalizeText(raw.name || '团队内容工作区'),
    currentRevision: normalizeText(raw.currentRevision || raw.revision),
    defaultKnowledgeReleaseId: normalizeText(raw.defaultKnowledgeReleaseId),
    updatedAt: normalizeText(raw.updatedAt),
  };
}

function normalizeRelease(raw = {}) {
  return {
    id: normalizeText(raw.id || raw.releaseId),
    title: normalizeText(raw.title || raw.contentKnowledgeMapTitle || '团队知识包'),
    version: normalizeText(raw.version || raw.serverRevision || 'team-version'),
    status: normalizeText(raw.status || 'published'),
    approvalStatus: normalizeText(raw.approvalStatus || 'approved'),
    packagePublicUrl: normalizeText(raw.packagePublicUrl || raw.publicUrl),
    packageUploadStatus: normalizeText(raw.packageUploadStatus),
    updatedAt: normalizeText(raw.updatedAt || raw.createdAt),
  };
}

function selectCommonWorkspace(actorAWorkspaces, actorBWorkspaces, workspaceId) {
  const aItems = actorAWorkspaces.map(normalizeWorkspace).filter((item) => item.id);
  const bItems = actorBWorkspaces.map(normalizeWorkspace).filter((item) => item.id);
  const bIds = new Set(bItems.map((item) => item.id));
  if (workspaceId) {
    const aMatch = aItems.find((item) => item.id === workspaceId);
    const bMatch = bItems.find((item) => item.id === workspaceId);
    return { actorA: aMatch || null, actorB: bMatch || null };
  }
  const aMatch = aItems.find((item) => bIds.has(item.id));
  return { actorA: aMatch || null, actorB: aMatch ? bItems.find((item) => item.id === aMatch.id) || null : null };
}

function selectRelease(releases, releaseId, defaultReleaseId) {
  const items = releases.map(normalizeRelease).filter((item) => item.id);
  if (releaseId) return items.find((item) => item.id === releaseId) || null;
  if (defaultReleaseId) return items.find((item) => item.id === defaultReleaseId) || null;
  return items.find((item) => item.status === 'published' && item.approvalStatus === 'approved') || items[0] || null;
}

function addCheck(checks, id, passed, message, extra = {}) {
  checks.push({
    id,
    status: passed ? 'passed' : 'failed',
    message,
    ...extra,
  });
}

function stableItemId(item) {
  return normalizeText(item?.id || item?.taskId || item?.queueItemId || item?.releaseId);
}

function normalizeStringList(value) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean).sort() : [];
}

function isUnsafeArtifactRef(value) {
  const text = normalizeText(value);
  if (!text) return true;
  if (/^file:\/\//i.test(text)) return true;
  if (/^(?:\/Users|\/private\/var|\/tmp|\/home)\//.test(text)) return true;
  if (/^[A-Za-z]:[\\/]/.test(text)) return true;
  if (/(?:api[_-]?key|secret|token|password)=/i.test(text)) return true;
  return false;
}

function artifactRefsContain(refsByRecordId, pattern) {
  return Object.values(refsByRecordId).some((refs) => refs.some((ref) => pattern.test(ref)));
}

function summarizeItems(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const ids = items.map(stableItemId).filter(Boolean).sort();
  const count = Number.isFinite(Number(payload.total)) ? Number(payload.total) : items.length;
  const listComplete = !payload.truncated && items.length >= count && ids.length === count;
  return {
    count,
    ids,
    fetchedCount: items.length,
    missingIdCount: Math.max(0, items.length - ids.length),
    listComplete,
    truncated: Boolean(payload.truncated),
  };
}

function summarizeActionArtifacts(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const refsByRecordId = {};
  for (const item of items) {
    const id = stableItemId(item);
    const refs = normalizeStringList(item?.artifactRefs);
    if (id && refs.length) refsByRecordId[id] = refs;
  }
  const recordIds = Object.keys(refsByRecordId).sort();
  return {
    recordCount: recordIds.length,
    recordIds,
    refsByRecordId,
    unsafeRefs: Object.entries(refsByRecordId)
      .flatMap(([recordId, refs]) => refs.filter(isUnsafeArtifactRef).map((ref) => ({ recordId, ref }))),
  };
}

function sameSummary(left, right) {
  if (!left.listComplete || !right.listComplete) return false;
  if (left.count !== right.count) return false;
  if (left.ids.length !== right.ids.length) return false;
  return left.ids.every((id, index) => id === right.ids[index]);
}

function sameActionArtifactSummary(left, right) {
  if (left.recordIds.length !== right.recordIds.length) return false;
  return left.recordIds.every((id, index) => {
    if (id !== right.recordIds[index]) return false;
    const leftRefs = left.refsByRecordId[id] ?? [];
    const rightRefs = right.refsByRecordId[id] ?? [];
    if (leftRefs.length !== rightRefs.length) return false;
    return leftRefs.every((ref, refIndex) => ref === rightRefs[refIndex]);
  });
}

export async function verifyContentTeamSharingOnline(options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const actorAToken = normalizeText(options.actorAToken || options.tokenA);
  const actorBToken = normalizeText(options.actorBToken || options.tokenB);
  if (!actorAToken || !actorBToken) {
    throw new Error('缺少两组账号 token：请提供 actorAToken 和 actorBToken，或 CLI 参数 --actor-a-token / --actor-b-token。');
  }
  if (!options.allowSameToken && actorAToken === actorBToken) {
    throw new Error('两账号验收需要不同 token；如只做连通性预检，请显式传入 allowSameToken。');
  }

  const baseOptions = {
    apiBaseUrl: options.apiBaseUrl || DEFAULT_API_BASE_URL,
    tenant: options.tenant || '',
    workspaceId: options.workspaceId || '',
    timeoutMs: options.timeoutMs || DEFAULT_TIMEOUT_MS,
    pageSize: normalizePositiveInteger(options.pageSize, DEFAULT_PAGE_SIZE, DEFAULT_PAGE_SIZE),
    maxListItems: normalizePositiveInteger(options.maxListItems, DEFAULT_MAX_LIST_ITEMS),
  };

  const [actorAWorkspaces, actorBWorkspaces] = await Promise.all([
    listContent(fetchImpl, baseOptions, 'content-workspaces', actorAToken),
    listContent(fetchImpl, baseOptions, 'content-workspaces', actorBToken),
  ]);
  const workspace = selectCommonWorkspace(actorAWorkspaces.items || [], actorBWorkspaces.items || [], baseOptions.workspaceId);
  const checks = [];
  addCheck(checks, 'actor-a-workspace-visible', Boolean(workspace.actorA), '账号 A 可以看到团队内容工作区。');
  addCheck(checks, 'actor-b-workspace-visible', Boolean(workspace.actorB), '账号 B 可以看到同一个团队内容工作区。');
  if (!workspace.actorA || !workspace.actorB) {
    return { ok: false, workspace, release: null, checks };
  }

  addCheck(
    checks,
    'workspace-revision-match',
    workspace.actorA.currentRevision === workspace.actorB.currentRevision,
    `两个账号看到的团队版本一致：A=${workspace.actorA.currentRevision || '空'} B=${workspace.actorB.currentRevision || '空'}`,
  );

  const workspaceOptions = { ...baseOptions, workspaceId: workspace.actorA.id };
  const [
    actorAReleases,
    actorBReleases,
    actorAKnowledgeMaps,
    actorBKnowledgeMaps,
    actorABuildRuns,
    actorBBuildRuns,
    actorAReviews,
    actorBReviews,
    actorAActions,
    actorBActions,
  ] = await Promise.all([
    listContent(fetchImpl, workspaceOptions, 'content-knowledge-releases', actorAToken),
    listContent(fetchImpl, workspaceOptions, 'content-knowledge-releases', actorBToken),
    listContent(fetchImpl, workspaceOptions, 'content-knowledge-maps', actorAToken),
    listContent(fetchImpl, workspaceOptions, 'content-knowledge-maps', actorBToken),
    listContent(fetchImpl, workspaceOptions, 'content-build-runs', actorAToken),
    listContent(fetchImpl, workspaceOptions, 'content-build-runs', actorBToken),
    listContent(fetchImpl, workspaceOptions, 'content-review-tasks', actorAToken),
    listContent(fetchImpl, workspaceOptions, 'content-review-tasks', actorBToken),
    listContent(fetchImpl, workspaceOptions, 'content-action-records', actorAToken),
    listContent(fetchImpl, workspaceOptions, 'content-action-records', actorBToken),
  ]);

  const defaultReleaseId = workspace.actorA.defaultKnowledgeReleaseId || workspace.actorB.defaultKnowledgeReleaseId;
  const actorARelease = selectRelease(actorAReleases.items || [], options.releaseId || '', defaultReleaseId);
  const actorBRelease = selectRelease(actorBReleases.items || [], options.releaseId || '', defaultReleaseId);
  addCheck(checks, 'actor-a-release-visible', Boolean(actorARelease), '账号 A 可以看到团队默认知识包。');
  addCheck(checks, 'actor-b-release-visible', Boolean(actorBRelease), '账号 B 可以看到同一个团队默认知识包。');
  if (actorARelease && actorBRelease) {
    addCheck(
      checks,
      'release-version-match',
      actorARelease.id === actorBRelease.id && actorARelease.version === actorBRelease.version,
      `两个账号看到的团队知识包一致：A=${actorARelease.version} B=${actorBRelease.version}`,
    );
    addCheck(
      checks,
      'release-approved',
      options.allowPendingApproval || actorARelease.approvalStatus === 'approved',
      `团队知识包确认状态：${actorARelease.approvalStatus || 'approved'}`,
    );
    if (options.requirePublicPackage) {
      addCheck(
        checks,
        'release-public-url-present',
        Boolean(actorARelease.packagePublicUrl),
        actorARelease.packagePublicUrl ? '团队知识包有公开下载地址。' : '团队知识包缺少公开下载地址。',
      );
    }
  }

  addCheck(
    checks,
    'knowledge-map-list-reachable',
    Array.isArray(actorAKnowledgeMaps.items) && Array.isArray(actorBKnowledgeMaps.items),
    `知识地图列表可读取：A=${actorAKnowledgeMaps.items?.length ?? 0} B=${actorBKnowledgeMaps.items?.length ?? 0}`,
  );
  addCheck(
    checks,
    'build-run-list-reachable',
    Array.isArray(actorABuildRuns.items) && Array.isArray(actorBBuildRuns.items),
    `构建运行列表可读取：A=${actorABuildRuns.items?.length ?? 0} B=${actorBBuildRuns.items?.length ?? 0}`,
  );
  addCheck(
    checks,
    'review-task-list-reachable',
    Array.isArray(actorAReviews.items) && Array.isArray(actorBReviews.items),
    `审核任务列表可读取：A=${actorAReviews.items?.length ?? 0} B=${actorBReviews.items?.length ?? 0}`,
  );
  addCheck(
    checks,
    'action-record-list-reachable',
    Array.isArray(actorAActions.items) && Array.isArray(actorBActions.items),
    `行动记录可读取：A=${actorAActions.items?.length ?? 0} B=${actorBActions.items?.length ?? 0}`,
  );

  const knowledgeMapSummaryA = summarizeItems(actorAKnowledgeMaps);
  const knowledgeMapSummaryB = summarizeItems(actorBKnowledgeMaps);
  const buildRunSummaryA = summarizeItems(actorABuildRuns);
  const buildRunSummaryB = summarizeItems(actorBBuildRuns);
  const reviewSummaryA = summarizeItems(actorAReviews);
  const reviewSummaryB = summarizeItems(actorBReviews);
  const releaseSummaryA = summarizeItems(actorAReleases);
  const releaseSummaryB = summarizeItems(actorBReleases);
  const actionSummaryA = summarizeItems(actorAActions);
  const actionSummaryB = summarizeItems(actorBActions);
  const actionArtifactsA = summarizeActionArtifacts(actorAActions);
  const actionArtifactsB = summarizeActionArtifacts(actorBActions);
  addCheck(
    checks,
    'knowledge-map-list-complete',
    knowledgeMapSummaryA.listComplete && knowledgeMapSummaryB.listComplete,
    `知识地图已完整拉取并具备 ID 清单：A=${knowledgeMapSummaryA.fetchedCount}/${knowledgeMapSummaryA.count} B=${knowledgeMapSummaryB.fetchedCount}/${knowledgeMapSummaryB.count}`,
    { actorA: knowledgeMapSummaryA, actorB: knowledgeMapSummaryB },
  );
  addCheck(
    checks,
    'build-run-list-complete',
    buildRunSummaryA.listComplete && buildRunSummaryB.listComplete,
    `构建运行已完整拉取并具备 ID 清单：A=${buildRunSummaryA.fetchedCount}/${buildRunSummaryA.count} B=${buildRunSummaryB.fetchedCount}/${buildRunSummaryB.count}`,
    { actorA: buildRunSummaryA, actorB: buildRunSummaryB },
  );
  addCheck(
    checks,
    'knowledge-map-list-present',
    knowledgeMapSummaryA.count > 0 && knowledgeMapSummaryB.count > 0,
    `团队知识地图快照非空：A=${knowledgeMapSummaryA.count} B=${knowledgeMapSummaryB.count}`,
    { actorA: knowledgeMapSummaryA, actorB: knowledgeMapSummaryB },
  );
  addCheck(
    checks,
    'build-run-list-present',
    buildRunSummaryA.count > 0 && buildRunSummaryB.count > 0,
    `团队生成流程记录非空：A=${buildRunSummaryA.count} B=${buildRunSummaryB.count}`,
    { actorA: buildRunSummaryA, actorB: buildRunSummaryB },
  );
  addCheck(
    checks,
    'review-task-list-present',
    reviewSummaryA.count > 0 && reviewSummaryB.count > 0,
    `团队审核任务非空：A=${reviewSummaryA.count} B=${reviewSummaryB.count}`,
    { actorA: reviewSummaryA, actorB: reviewSummaryB },
  );
  addCheck(
    checks,
    'action-record-list-present',
    actionSummaryA.count > 0 && actionSummaryB.count > 0,
    `团队行动记录非空：A=${actionSummaryA.count} B=${actionSummaryB.count}`,
    { actorA: actionSummaryA, actorB: actionSummaryB },
  );
  addCheck(
    checks,
    'review-task-list-complete',
    reviewSummaryA.listComplete && reviewSummaryB.listComplete,
    `审核任务已完整拉取并具备 ID 清单：A=${reviewSummaryA.fetchedCount}/${reviewSummaryA.count} B=${reviewSummaryB.fetchedCount}/${reviewSummaryB.count}`,
    { actorA: reviewSummaryA, actorB: reviewSummaryB },
  );
  addCheck(
    checks,
    'release-list-present',
    releaseSummaryA.count > 0 && releaseSummaryB.count > 0,
    `团队知识包版本清单非空：A=${releaseSummaryA.count} B=${releaseSummaryB.count}`,
    { actorA: releaseSummaryA, actorB: releaseSummaryB },
  );
  addCheck(
    checks,
    'release-list-complete',
    releaseSummaryA.listComplete && releaseSummaryB.listComplete,
    `团队知识包版本已完整拉取并具备 ID 清单：A=${releaseSummaryA.fetchedCount}/${releaseSummaryA.count} B=${releaseSummaryB.fetchedCount}/${releaseSummaryB.count}`,
    { actorA: releaseSummaryA, actorB: releaseSummaryB },
  );
  addCheck(
    checks,
    'action-record-list-complete',
    actionSummaryA.listComplete && actionSummaryB.listComplete,
    `行动记录已完整拉取并具备 ID 清单：A=${actionSummaryA.fetchedCount}/${actionSummaryA.count} B=${actionSummaryB.fetchedCount}/${actionSummaryB.count}`,
    { actorA: actionSummaryA, actorB: actionSummaryB },
  );
  addCheck(
    checks,
    'action-record-artifacts-present',
    actionArtifactsA.recordCount > 0 && actionArtifactsB.recordCount > 0,
    `带交付物引用的行动记录可见：A=${actionArtifactsA.recordCount} B=${actionArtifactsB.recordCount}`,
    { actorA: actionArtifactsA, actorB: actionArtifactsB },
  );
  addCheck(
    checks,
    'action-record-artifacts-match',
    sameActionArtifactSummary(actionArtifactsA, actionArtifactsB),
    `两个账号看到的行动记录交付物引用一致：A=${actionArtifactsA.recordCount} B=${actionArtifactsB.recordCount}`,
    { actorA: actionArtifactsA, actorB: actionArtifactsB },
  );
  addCheck(
    checks,
    'action-record-artifacts-safe',
    actionArtifactsA.unsafeRefs.length === 0 && actionArtifactsB.unsafeRefs.length === 0,
    `行动记录交付物引用未包含本机绝对路径、file URL 或疑似凭证：A=${actionArtifactsA.unsafeRefs.length} B=${actionArtifactsB.unsafeRefs.length}`,
    { actorA: actionArtifactsA.unsafeRefs, actorB: actionArtifactsB.unsafeRefs },
  );
  addCheck(
    checks,
    'material-gap-artifact-present',
    artifactRefsContain(actionArtifactsA.refsByRecordId, /material-gap-list\.json$/) &&
      artifactRefsContain(actionArtifactsB.refsByRecordId, /material-gap-list\.json$/),
    '两账号都能看到补素材清单交付文件引用 material-gap-list.json。',
    { actorA: actionArtifactsA.refsByRecordId, actorB: actionArtifactsB.refsByRecordId },
  );
  addCheck(
    checks,
    'knowledge-map-list-match',
    sameSummary(knowledgeMapSummaryA, knowledgeMapSummaryB),
    `两个账号看到的知识地图清单一致：A=${knowledgeMapSummaryA.count} B=${knowledgeMapSummaryB.count}`,
    { actorA: knowledgeMapSummaryA, actorB: knowledgeMapSummaryB },
  );
  addCheck(
    checks,
    'build-run-list-match',
    sameSummary(buildRunSummaryA, buildRunSummaryB),
    `两个账号看到的构建运行清单一致：A=${buildRunSummaryA.count} B=${buildRunSummaryB.count}`,
    { actorA: buildRunSummaryA, actorB: buildRunSummaryB },
  );
  addCheck(
    checks,
    'review-task-list-match',
    sameSummary(reviewSummaryA, reviewSummaryB),
    `两个账号看到的审核任务清单一致：A=${reviewSummaryA.count} B=${reviewSummaryB.count}`,
    { actorA: reviewSummaryA, actorB: reviewSummaryB },
  );
  addCheck(
    checks,
    'release-list-match',
    sameSummary(releaseSummaryA, releaseSummaryB),
    `两个账号看到的团队知识包版本清单一致：A=${releaseSummaryA.count} B=${releaseSummaryB.count}`,
    { actorA: releaseSummaryA, actorB: releaseSummaryB },
  );
  addCheck(
    checks,
    'action-record-list-match',
    sameSummary(actionSummaryA, actionSummaryB),
    `两个账号看到的行动记录清单一致：A=${actionSummaryA.count} B=${actionSummaryB.count}`,
    { actorA: actionSummaryA, actorB: actionSummaryB },
  );

  return {
    ok: !checks.some((check) => check.status === 'failed'),
    workspace,
    release: actorARelease,
    summaries: {
      actorA: {
        reviewTaskCount: reviewSummaryA.count,
        knowledgeMapCount: knowledgeMapSummaryA.count,
        buildRunCount: buildRunSummaryA.count,
        actionRecordCount: actionSummaryA.count,
        releaseCount: releaseSummaryA.count,
        knowledgeMapIds: knowledgeMapSummaryA.ids,
        buildRunIds: buildRunSummaryA.ids,
        reviewTaskIds: reviewSummaryA.ids,
        actionRecordIds: actionSummaryA.ids,
        knowledgeMapListComplete: knowledgeMapSummaryA.listComplete,
        buildRunListComplete: buildRunSummaryA.listComplete,
        actionArtifactRecordCount: actionArtifactsA.recordCount,
        actionArtifactRecordIds: actionArtifactsA.recordIds,
        actionArtifactRefsByRecordId: actionArtifactsA.refsByRecordId,
        reviewTaskListComplete: reviewSummaryA.listComplete,
        actionRecordListComplete: actionSummaryA.listComplete,
        releaseIds: releaseSummaryA.ids,
        releaseListComplete: releaseSummaryA.listComplete,
      },
      actorB: {
        reviewTaskCount: reviewSummaryB.count,
        knowledgeMapCount: knowledgeMapSummaryB.count,
        buildRunCount: buildRunSummaryB.count,
        actionRecordCount: actionSummaryB.count,
        releaseCount: releaseSummaryB.count,
        knowledgeMapIds: knowledgeMapSummaryB.ids,
        buildRunIds: buildRunSummaryB.ids,
        reviewTaskIds: reviewSummaryB.ids,
        actionRecordIds: actionSummaryB.ids,
        knowledgeMapListComplete: knowledgeMapSummaryB.listComplete,
        buildRunListComplete: buildRunSummaryB.listComplete,
        actionArtifactRecordCount: actionArtifactsB.recordCount,
        actionArtifactRecordIds: actionArtifactsB.recordIds,
        actionArtifactRefsByRecordId: actionArtifactsB.refsByRecordId,
        reviewTaskListComplete: reviewSummaryB.listComplete,
        actionRecordListComplete: actionSummaryB.listComplete,
        releaseIds: releaseSummaryB.ids,
        releaseListComplete: releaseSummaryB.listComplete,
      },
    },
    checks,
  };
}

function parseCliOptions(argv) {
  return {
    apiBaseUrl: cliValue(argv, 'api-base-url') || process.env.CONTENT_STUDIO_BUGU_CONTENT_API_BASE_URL || DEFAULT_API_BASE_URL,
    tenant: cliValue(argv, 'tenant') || process.env.CONTENT_STUDIO_BUGU_TENANT_ID || process.env.BUGU_TENANT_ID || '',
    workspaceId: cliValue(argv, 'workspace-id') || process.env.CONTENT_STUDIO_BUGU_WORKSPACE_ID || '',
    releaseId: cliValue(argv, 'release-id') || '',
    actorAToken: cliValue(argv, 'actor-a-token') || process.env.CONTENT_STUDIO_BUGU_ACTOR_A_TOKEN || process.env.BUGU_ACTOR_A_TOKEN || '',
    actorBToken: cliValue(argv, 'actor-b-token') || process.env.CONTENT_STUDIO_BUGU_ACTOR_B_TOKEN || process.env.BUGU_ACTOR_B_TOKEN || '',
    allowSameToken: cliFlag(argv, 'allow-same-token'),
    allowPendingApproval: cliFlag(argv, 'allow-pending-approval'),
    requirePublicPackage: cliFlag(argv, 'require-public-package'),
    pageSize: cliValue(argv, 'page-size') || process.env.CONTENT_STUDIO_BUGU_LIST_PAGE_SIZE || DEFAULT_PAGE_SIZE,
    maxListItems: cliValue(argv, 'max-list-items') || process.env.CONTENT_STUDIO_BUGU_MAX_LIST_ITEMS || DEFAULT_MAX_LIST_ITEMS,
    output: cliValue(argv, 'output') || '',
    json: cliFlag(argv, 'json'),
  };
}

function printHumanResult(result) {
  console.log(`团队共享在线验收：${result.ok ? '通过' : '未通过'}`);
  if (result.workspace.actorA) {
    console.log(`工作区：${result.workspace.actorA.name} (${result.workspace.actorA.id})`);
    console.log(`团队版本：${result.workspace.actorA.currentRevision || '空'}`);
  }
  if (result.release) {
    console.log(`团队知识包：${result.release.title} ${result.release.version} (${result.release.id})`);
  }
  for (const check of result.checks) {
    const prefix = check.status === 'passed' ? '[通过]' : '[失败]';
    console.log(`${prefix} ${check.message}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliOptions(argv);
  const result = await verifyContentTeamSharingOnline(options);
  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
  }
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHumanResult(result);
  if (!result.ok) process.exitCode = 1;
  return result;
}

const cliEntry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (cliEntry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
