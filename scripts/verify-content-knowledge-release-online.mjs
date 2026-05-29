import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_BASE_URL = 'https://api.bugu.run';
const DEFAULT_MAX_DOWNLOAD_BYTES = 128 * 1024 * 1024;
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

function normalizeRelease(raw = {}) {
  return {
    id: normalizeText(raw.id || raw.serverReleaseId || raw.releaseId),
    workspaceId: normalizeText(raw.workspaceId),
    title: normalizeText(raw.title || raw.contentKnowledgeMapTitle || '团队知识包'),
    version: normalizeText(raw.version || raw.serverRevision || 'team-version'),
    status: normalizeText(raw.status || 'published'),
    approvalStatus: normalizeText(raw.approvalStatus || 'approved'),
    packageObjectKey: normalizeText(raw.packageObjectKey),
    packagePublicUrl: normalizeText(raw.packagePublicUrl || raw.publicUrl),
    packageUploadStatus: normalizeText(raw.packageUploadStatus),
    packageStorageProvider: normalizeText(raw.packageStorageProvider),
    packageSha256: normalizeText(raw.packageSha256 || raw.packageArchiveSha256 || raw.sha256),
    packageSize: Number(raw.packageSize || raw.packageArchiveSize || raw.size || 0),
    createdAt: normalizeText(raw.createdAt),
    updatedAt: normalizeText(raw.updatedAt),
  };
}

function selectRelease(items, { releaseId, version }) {
  const releases = items.map(normalizeRelease).filter((item) => item.id);
  if (!releases.length) throw new Error('Bugu release 列表为空，无法验收团队知识包。');
  if (releaseId) {
    const match = releases.find((item) => item.id === releaseId || item.id === normalizeText(releaseId));
    if (!match) throw new Error(`未找到团队知识包版本：${releaseId}`);
    return match;
  }
  if (version) {
    const match = releases.find((item) => item.version === version);
    if (!match) throw new Error(`未找到团队知识包版本号：${version}`);
    return match;
  }
  return releases.find((item) => item.packagePublicUrl) || releases[0];
}

function authHeaders(token) {
  const headers = { 'cache-control': 'no-cache' };
  if (token) headers.authorization = `Bearer ${token}`;
  return headers;
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

async function fetchReleaseFromBugu(options) {
  const apiBaseUrl = normalizeBaseUrl(options.apiBaseUrl || DEFAULT_API_BASE_URL);
  const url = new URL(contentApiPath(apiBaseUrl, 'content-knowledge-releases'));
  if (options.tenant) url.searchParams.set('tenant', options.tenant);
  if (options.workspaceId) url.searchParams.set('workspaceId', options.workspaceId);
  const payload = await fetchJson(options.fetchImpl || fetch, url, {
    method: 'GET',
    headers: authHeaders(options.token),
  }, options.timeoutMs);
  return selectRelease(payload.items || payload.releases || [], options);
}

async function readStreamForHash(response, maxBytes) {
  const hash = createHash('sha256');
  const reader = response.body?.getReader();
  if (!reader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error(`下载体超过上限：${buffer.length} > ${maxBytes}`);
    hash.update(buffer);
    return { bytes: buffer.length, sha256: hash.digest('hex') };
  }
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error(`下载体超过上限：${bytes} > ${maxBytes}`);
    }
    hash.update(value);
  }
  return { bytes, sha256: hash.digest('hex') };
}

async function readSmallReachabilityBody(response, maxBytes = 64 * 1024) {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer()).length;
  let bytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes >= maxBytes) {
      await reader.cancel();
      break;
    }
  }
  return bytes;
}

async function verifyPublicPackage(release, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const maxDownloadBytes = Number(options.maxDownloadBytes || DEFAULT_MAX_DOWNLOAD_BYTES);
  const checks = [];
  const packageUrl = release.packagePublicUrl;
  if (!packageUrl) {
    checks.push({
      id: 'public-url-present',
      status: options.allowMetadataOnly ? 'warning' : 'failed',
      message: options.allowMetadataOnly
        ? '该版本只登记了发布包元数据，没有公开下载地址。'
        : '缺少公开下载地址，不能证明团队知识包可分发。',
    });
    return { checks, reachable: false };
  }

  let headResponse;
  try {
    headResponse = await fetchWithTimeout(fetchImpl, packageUrl, {
      method: 'HEAD',
      headers: { 'cache-control': 'no-cache' },
    }, options.timeoutMs);
  } catch (error) {
    checks.push({
      id: 'public-head',
      status: 'warning',
      message: `HEAD 请求失败，将尝试 Range GET：${error instanceof Error ? error.message : String(error)}`,
    });
  }

  let length = 0;
  if (headResponse?.ok) {
    length = Number(headResponse.headers.get('content-length') || '0');
    checks.push({
      id: 'public-head',
      status: 'passed',
      message: `公开下载地址可访问，HTTP ${headResponse.status}。`,
      length,
      contentType: headResponse.headers.get('content-type') || '',
      cacheControl: headResponse.headers.get('cache-control') || '',
      cacheStatus: headResponse.headers.get('cf-cache-status') || '',
    });
  } else if (headResponse) {
    checks.push({
      id: 'public-head',
      status: 'warning',
      message: `HEAD 返回 HTTP ${headResponse.status}，将尝试 Range GET。`,
    });
  }

  if (!headResponse?.ok) {
    const rangeResponse = await fetchWithTimeout(fetchImpl, packageUrl, {
      method: 'GET',
      headers: { range: 'bytes=0-0', 'cache-control': 'no-cache' },
    }, options.timeoutMs);
    if (!rangeResponse.ok && rangeResponse.status !== 206) {
      checks.push({
        id: 'public-range-get',
        status: 'failed',
        message: `公开下载地址不可访问，HTTP ${rangeResponse.status}。`,
      });
      return { checks, reachable: false };
    }
    const bytes = await readSmallReachabilityBody(rangeResponse);
    const contentRange = rangeResponse.headers.get('content-range') || '';
    length = Number(rangeResponse.headers.get('content-length') || '0');
    checks.push({
      id: 'public-range-get',
      status: 'passed',
      message: `公开下载地址可通过 GET 访问，HTTP ${rangeResponse.status}。`,
      sampledBytes: bytes,
      contentRange,
      length,
    });
  }

  if (release.packageSize > 0 && length > 0 && length !== release.packageSize) {
    checks.push({
      id: 'package-size',
      status: 'failed',
      message: `发布包大小不一致：expected=${release.packageSize} actual=${length}`,
    });
  } else if (release.packageSize > 0) {
    checks.push({
      id: 'package-size',
      status: length > 0 ? 'passed' : 'warning',
      message: length > 0 ? '发布包大小匹配。' : '公开地址未返回 content-length，无法只用 HEAD 校验大小。',
      expected: release.packageSize,
      actual: length,
    });
  }

  const shouldVerifySha256 = Boolean(release.packageSha256) && options.verifySha256 !== false;
  if (shouldVerifySha256) {
    if (release.packageSize > maxDownloadBytes) {
      checks.push({
        id: 'package-sha256',
        status: 'warning',
        message: `发布包大小超过本次下载上限，跳过 sha256：${release.packageSize} > ${maxDownloadBytes}`,
      });
    } else {
      const response = await fetchWithTimeout(fetchImpl, packageUrl, {
        method: 'GET',
        headers: { 'cache-control': 'no-cache' },
      }, options.timeoutMs);
      if (!response.ok) {
        checks.push({
          id: 'package-sha256',
          status: 'failed',
          message: `下载发布包校验 sha256 失败，HTTP ${response.status}。`,
        });
      } else {
        const downloaded = await readStreamForHash(response, maxDownloadBytes);
        const matched = downloaded.sha256.toLowerCase() === release.packageSha256.toLowerCase();
        checks.push({
          id: 'package-sha256',
          status: matched ? 'passed' : 'failed',
          message: matched ? '发布包 sha256 匹配。' : `发布包 sha256 不一致：expected=${release.packageSha256} actual=${downloaded.sha256}`,
          bytes: downloaded.bytes,
          expected: release.packageSha256,
          actual: downloaded.sha256,
        });
      }
    }
  }

  return { checks, reachable: !checks.some((check) => check.status === 'failed') };
}

export async function verifyContentKnowledgeReleaseOnline(options = {}) {
  const release = normalizeRelease(
    options.release ||
      (options.publicUrl
        ? {
            id: options.releaseId || 'direct-public-url',
            title: options.title || '团队知识包',
            version: options.version || 'direct',
            status: 'published',
            approvalStatus: 'approved',
            packagePublicUrl: options.publicUrl,
            packageSize: options.expectedSize,
            packageSha256: options.expectedSha256,
            packageUploadStatus: 'stored',
          }
        : await fetchReleaseFromBugu(options)),
  );

  const checks = [];
  if (!release.id) {
    checks.push({ id: 'release-present', status: 'failed', message: '未找到团队知识包版本。' });
  } else {
    checks.push({ id: 'release-present', status: 'passed', message: `已找到团队知识包版本：${release.title} ${release.version}` });
  }

  if (!options.allowNonPublished && release.status && release.status !== 'published') {
    checks.push({ id: 'release-status', status: 'failed', message: `团队知识包状态不是已发布：${release.status}` });
  } else {
    checks.push({ id: 'release-status', status: 'passed', message: `团队知识包状态：${release.status || 'published'}` });
  }

  if (!options.allowPendingApproval && release.approvalStatus && release.approvalStatus !== 'approved') {
    checks.push({ id: 'release-approval', status: 'failed', message: `团队知识包尚未确认：${release.approvalStatus}` });
  } else {
    checks.push({ id: 'release-approval', status: 'passed', message: `团队知识包确认状态：${release.approvalStatus || 'approved'}` });
  }

  if (release.packageUploadStatus && release.packageUploadStatus !== 'stored') {
    checks.push({
      id: 'package-upload-status',
      status: release.packagePublicUrl || options.allowMetadataOnly ? 'warning' : 'failed',
      message: `发布包登记状态不是 stored：${release.packageUploadStatus}`,
    });
  } else if (release.packageUploadStatus) {
    checks.push({ id: 'package-upload-status', status: 'passed', message: '发布包已登记为可分发。' });
  }

  const packageResult = await verifyPublicPackage(release, options);
  checks.push(...packageResult.checks);

  return {
    ok: !checks.some((check) => check.status === 'failed'),
    release,
    package: {
      reachable: packageResult.reachable,
      publicUrl: release.packagePublicUrl,
      objectKey: release.packageObjectKey,
      storageProvider: release.packageStorageProvider,
      uploadStatus: release.packageUploadStatus,
      size: release.packageSize,
      sha256: release.packageSha256,
    },
    checks,
  };
}

function parseCliOptions(argv) {
  const maxDownloadMb = Number(cliValue(argv, 'max-download-mb') || '128');
  return {
    apiBaseUrl: cliValue(argv, 'api-base-url') || process.env.CONTENT_STUDIO_BUGU_CONTENT_API_BASE_URL || DEFAULT_API_BASE_URL,
    tenant: cliValue(argv, 'tenant') || process.env.CONTENT_STUDIO_BUGU_TENANT_ID || process.env.BUGU_TENANT_ID || '',
    workspaceId: cliValue(argv, 'workspace-id') || process.env.CONTENT_STUDIO_BUGU_WORKSPACE_ID || '',
    releaseId: cliValue(argv, 'release-id') || '',
    version: cliValue(argv, 'version') || '',
    token: cliValue(argv, 'token') || process.env.CONTENT_STUDIO_BUGU_API_TOKEN || process.env.BUGU_API_TOKEN || process.env.BUGU_ADMIN_TOKEN || '',
    publicUrl: cliValue(argv, 'public-url') || '',
    expectedSize: Number(cliValue(argv, 'expected-size') || '0'),
    expectedSha256: cliValue(argv, 'expected-sha256') || '',
    maxDownloadBytes: Number.isFinite(maxDownloadMb) && maxDownloadMb > 0 ? maxDownloadMb * 1024 * 1024 : DEFAULT_MAX_DOWNLOAD_BYTES,
    verifySha256: !cliFlag(argv, 'skip-sha256'),
    allowMetadataOnly: cliFlag(argv, 'allow-metadata-only'),
    allowNonPublished: cliFlag(argv, 'allow-non-published'),
    allowPendingApproval: cliFlag(argv, 'allow-pending-approval'),
    output: cliValue(argv, 'output') || '',
    json: cliFlag(argv, 'json'),
  };
}

function printHumanResult(result) {
  console.log(`团队知识包在线验收：${result.ok ? '通过' : '未通过'}`);
  console.log(`版本：${result.release.title} ${result.release.version} (${result.release.id})`);
  if (result.package.publicUrl) console.log(`公开地址：${result.package.publicUrl}`);
  if (result.package.objectKey) console.log(`对象 key：${result.package.objectKey}`);
  for (const check of result.checks) {
    const prefix = check.status === 'passed' ? '[通过]' : check.status === 'warning' ? '[注意]' : '[失败]';
    console.log(`${prefix} ${check.message}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliOptions(argv);
  if (!options.publicUrl && !options.workspaceId) {
    throw new Error('缺少参数：请提供 --workspace-id=... 通过 Bugu 查询 release，或提供 --public-url=... 直接验收公开包。');
  }
  const result = await verifyContentKnowledgeReleaseOnline(options);
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
