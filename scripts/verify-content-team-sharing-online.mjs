import process from 'node:process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_BASE_URL = 'https://api.bugu.run';
const DEFAULT_TIMEOUT_MS = 30_000;

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

async function listContent(fetchImpl, options, route, token) {
  const url = new URL(contentApiPath(options.apiBaseUrl, route));
  if (options.tenant) url.searchParams.set('tenant', options.tenant);
  if (options.workspaceId) url.searchParams.set('workspaceId', options.workspaceId);
  return fetchJson(fetchImpl, url, {
    method: 'GET',
    headers: authHeaders(token),
  }, options.timeoutMs);
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

function summarizeItems(items = []) {
  const ids = items.map(stableItemId).filter(Boolean).sort();
  return {
    count: Array.isArray(items) ? items.length : 0,
    ids: ids.slice(0, 50),
  };
}

function sameSummary(left, right) {
  if (left.count !== right.count) return false;
  if (left.ids.length !== right.ids.length) return false;
  return left.ids.every((id, index) => id === right.ids[index]);
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
    actorAReviews,
    actorBReviews,
    actorAQueue,
    actorBQueue,
  ] = await Promise.all([
    listContent(fetchImpl, workspaceOptions, 'content-knowledge-releases', actorAToken),
    listContent(fetchImpl, workspaceOptions, 'content-knowledge-releases', actorBToken),
    listContent(fetchImpl, workspaceOptions, 'content-review-tasks', actorAToken),
    listContent(fetchImpl, workspaceOptions, 'content-review-tasks', actorBToken),
    listContent(fetchImpl, workspaceOptions, 'content-execution-queue', actorAToken),
    listContent(fetchImpl, workspaceOptions, 'content-execution-queue', actorBToken),
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
    'review-task-list-reachable',
    Array.isArray(actorAReviews.items) && Array.isArray(actorBReviews.items),
    `审核任务列表可读取：A=${actorAReviews.items?.length ?? 0} B=${actorBReviews.items?.length ?? 0}`,
  );
  addCheck(
    checks,
    'execution-queue-list-reachable',
    Array.isArray(actorAQueue.items) && Array.isArray(actorBQueue.items),
    `执行队列可读取：A=${actorAQueue.items?.length ?? 0} B=${actorBQueue.items?.length ?? 0}`,
  );

  const reviewSummaryA = summarizeItems(actorAReviews.items || []);
  const reviewSummaryB = summarizeItems(actorBReviews.items || []);
  const queueSummaryA = summarizeItems(actorAQueue.items || []);
  const queueSummaryB = summarizeItems(actorBQueue.items || []);
  addCheck(
    checks,
    'review-task-list-match',
    sameSummary(reviewSummaryA, reviewSummaryB),
    `两个账号看到的审核任务清单一致：A=${reviewSummaryA.count} B=${reviewSummaryB.count}`,
    { actorA: reviewSummaryA, actorB: reviewSummaryB },
  );
  addCheck(
    checks,
    'execution-queue-list-match',
    sameSummary(queueSummaryA, queueSummaryB),
    `两个账号看到的执行队列清单一致：A=${queueSummaryA.count} B=${queueSummaryB.count}`,
    { actorA: queueSummaryA, actorB: queueSummaryB },
  );

  return {
    ok: !checks.some((check) => check.status === 'failed'),
    workspace,
    release: actorARelease,
    summaries: {
      actorA: {
        reviewTaskCount: actorAReviews.items?.length ?? 0,
        executionQueueCount: actorAQueue.items?.length ?? 0,
        releaseCount: actorAReleases.items?.length ?? 0,
        reviewTaskIds: reviewSummaryA.ids,
        executionQueueIds: queueSummaryA.ids,
        releaseIds: summarizeItems(actorAReleases.items || []).ids,
      },
      actorB: {
        reviewTaskCount: actorBReviews.items?.length ?? 0,
        executionQueueCount: actorBQueue.items?.length ?? 0,
        releaseCount: actorBReleases.items?.length ?? 0,
        reviewTaskIds: reviewSummaryB.ids,
        executionQueueIds: queueSummaryB.ids,
        releaseIds: summarizeItems(actorBReleases.items || []).ids,
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
