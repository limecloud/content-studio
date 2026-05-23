import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = join(rootDir, 'oem', 'brands');
const GITHUB_RELEASE_API_BASE = 'https://api.github.com/repos/limecloud/content-studio/releases/tags';
const GITHUB_RELEASE_PAGE_URL = 'https://github.com/limecloud/content-studio/releases/latest';
const CONTROL_PLANE_FALLBACK_BASE_URL = 'https://lime-api.limeai.run';
const REQUIRED_KINDS = ['mac-dmg', 'mac-zip', 'win-nsis', 'linux-appimage'];

function cliValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

function cliFlag(name) {
  return process.argv.includes(`--${name}`);
}

function requiredCliValue(name) {
  const value = cliValue(name);
  if (!value) throw new Error(`缺少参数 --${name}`);
  return value;
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function normalizeTag(value) {
  const tag = normalizeText(value);
  if (!/^v\d+\.\d+\.\d+/.test(tag)) {
    throw new Error(`tag 必须使用 vX.Y.Z 格式：${tag}`);
  }
  return tag;
}

function normalizeChannel(value) {
  const channel = normalizeText(value) || 'stable';
  if (!/^[a-z][a-z0-9-]*$/i.test(channel)) {
    throw new Error(`channel 只能包含字母、数字和短横线：${channel}`);
  }
  return channel;
}

function appIdForBrand(brandId) {
  return brandId === 'bugu' ? 'buguai' : brandId;
}

function assetKind(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.dmg')) return 'mac-dmg';
  if (lower.endsWith('.zip')) return 'mac-zip';
  if (lower.endsWith('.exe')) return 'win-nsis';
  if (lower.endsWith('.appimage')) return 'linux-appimage';
  return '';
}

function platformFromFile(fileName, platform) {
  const lower = fileName.toLowerCase();
  const normalizedPlatform = normalizeText(platform).toLowerCase();
  if (lower.endsWith('.exe') || normalizedPlatform.includes('win')) {
    return lower.includes('arm64') ? 'windows-arm64' : 'windows-x64';
  }
  if (
    lower.endsWith('.dmg') ||
    lower.endsWith('.zip') ||
    normalizedPlatform.includes('mac')
  ) {
    return lower.includes('x64') || lower.includes('x86_64')
      ? 'macos-x64'
      : 'macos-arm64';
  }
  if (lower.endsWith('.appimage') || normalizedPlatform.includes('linux')) {
    return lower.includes('arm64') ? 'linux-arm64' : 'linux-x64';
  }
  return normalizedPlatform || 'generic';
}

function kindFromFile(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.exe')) return 'nsis';
  if (lower.endsWith('.dmg')) return 'dmg';
  if (lower.endsWith('.zip')) return 'zip';
  if (lower.endsWith('.appimage')) return 'appimage';
  return '';
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

async function fetchJson(url, init = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  }

  return payload;
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function unwrapDataEnvelope(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    return payload.data;
  }
  return payload;
}

async function requestJson(baseUrl, path, init = {}) {
  const response = await fetch(`${baseUrl.replace(/\/+$/, '')}${path}`, init);
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  }

  return unwrapDataEnvelope(payload);
}

function listResponseItems(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value && Array.isArray(value.items)) {
    return value.items;
  }
  return [];
}

function sortAssets(items) {
  const order = {
    'windows-x64:nsis': 10,
    'windows-arm64:nsis': 20,
    'macos-arm64:dmg': 30,
    'macos-arm64:zip': 40,
    'macos-x64:dmg': 50,
    'linux-x64:appimage': 60,
  };
  return [...(items || [])].sort((left, right) => {
    if (Boolean(left.primary) !== Boolean(right.primary)) {
      return left.primary ? -1 : 1;
    }
    const leftKey = `${normalizeText(left.platform)}:${normalizeText(left.kind)}`;
    const rightKey = `${normalizeText(right.platform)}:${normalizeText(right.kind)}`;
    return (order[leftKey] || 100) - (order[rightKey] || 100);
  });
}

function collectGithubReleaseAssets({ brand, tag, release }) {
  const version = tag.replace(/^v/i, '');
  const prefix = `${brand.artifactName}-${version}-`;
  return sortAssets(
    (release.assets || [])
      .filter((asset) => normalizeText(asset.name).startsWith(prefix))
      .filter((asset) => assetKind(asset.name))
      .map((asset) => {
        const fileName = normalizeText(asset.name);
        const platform = platformFromFile(fileName);
        const kind = kindFromFile(fileName);
        return {
          name: fileName,
          platform,
          kind,
          requiredKind: assetKind(fileName),
          label: fileName,
          fileName,
          url: normalizeText(asset.browser_download_url),
          sha256: normalizeText(asset.digest).replace(/^sha256:/, ''),
          size: asset.size,
          primary: platform === 'windows-x64' && kind === 'nsis',
        };
      })
  ).filter((asset) => asset.url);
}

function assertReleaseAssets({ brand, tag, release }) {
  const matchingAssets = collectGithubReleaseAssets({ brand, tag, release });
  const presentKinds = new Set(
    matchingAssets.map((asset) => asset.requiredKind).filter(Boolean)
  );
  const missingKinds = REQUIRED_KINDS.filter((kind) => !presentKinds.has(kind));

  if (missingKinds.length > 0) {
    throw new Error(
      `GitHub Release ${tag} 缺少 ${brand.brandId} 产物：${missingKinds.join(', ')}`
    );
  }

  return matchingAssets;
}

function runtimeTargetsFromAssets(items) {
  const targets = new Set();
  for (const asset of items || []) {
    const platform = normalizeText(asset.platform).toLowerCase();
    if (platform.includes('win')) targets.add('windows');
    if (platform.includes('mac')) targets.add('macos');
    if (platform.includes('linux')) targets.add('linux');
  }
  return targets.size > 0 ? [...targets] : ['windows', 'macos', 'linux'];
}

function buildReleaseManifestSummary({ brand, tag, version, channel, releasePageUrl, assets }) {
  const promotedAt = new Date().toISOString();
  return {
    version,
    publishedAt: promotedAt,
    releaseTag: tag,
    releasePageUrl,
    releaseNotesUrl: releasePageUrl,
    sourceRepo: 'limecloud/content-studio',
    generated: {
      source: 'promote-oem-release',
      brandId: brand.brandId,
      artifactName: brand.artifactName,
      tag,
      promotedAt,
    },
    distribution: {
      channel,
      downloads: sortAssets(assets).map((asset) => ({
        platform: asset.platform,
        kind: asset.kind,
        label: asset.label,
        fileName: asset.fileName,
        url: asset.url,
        sha256: asset.sha256,
        size: asset.size,
        primary: asset.primary,
      })),
    },
  };
}

function buildCatalogCreatePayload({ brand, appId, version, releasePageUrl, assets }) {
  return {
    appId,
    name: appId,
    displayName: normalizeText(brand.productName) || normalizeText(brand.shortName) || appId,
    description: `${normalizeText(brand.productName) || appId} 的 OEM 桌面客户端发布事实源。`,
    latestVersion: '',
    appType: 'desktop-app',
    status: 'active',
    categories: ['content', 'marketing'],
    sourceRepo: 'limecloud/content-studio',
    runtimeTargets: runtimeTargetsFromAssets(assets),
    capabilityRequirements: {},
    manifestSummary: {
      version,
      releasePageUrl,
    },
    sort: brand.brandId === 'bugu' ? 20 : 30,
  };
}

function buildCatalogUpdatePayload({ version }) {
  return {
    latestVersion: version,
    status: 'active',
  };
}

function buildReleaseCreatePayload({ brand, tag, version, channel, releasePageUrl, assets }) {
  const sortedAssets = sortAssets(assets);
  const primaryAsset = sortedAssets.find((asset) => asset.primary) || sortedAssets[0];
  if (!primaryAsset || !normalizeText(primaryAsset.url)) {
    throw new Error('GitHub Release 缺少可用主安装包');
  }
  if (!normalizeText(primaryAsset.sha256)) {
    throw new Error('GitHub Release 主安装包缺少 sha256 digest');
  }

  const manifestSummary = buildReleaseManifestSummary({
    brand,
    tag,
    version,
    channel,
    releasePageUrl,
    assets: sortedAssets,
  });

  return {
    version,
    manifestVersion: version,
    channel,
    packageUrl: primaryAsset.url,
    packageHash: `sha256:${primaryAsset.sha256}`,
    manifestHash: `sha256:${sha256Hex(JSON.stringify(manifestSummary))}`,
    releaseNotesUrl: releasePageUrl,
    status: 'ready',
    compatibility: {
      runtimeTargets: runtimeTargetsFromAssets(sortedAssets),
    },
    capabilityRequirements: {},
    manifestSummary,
    toolRequirements: [],
  };
}

function withoutVersion(payload) {
  const { version, ...rest } = payload;
  return rest;
}

const brandId = requiredCliValue('brand');
const tag = normalizeTag(requiredCliValue('tag'));
const channel = normalizeChannel(cliValue('channel') || 'stable');
const dryRun = cliFlag('dry-run') || cliValue('dry-run') === 'true';
const baseUrl =
  normalizeBaseUrl(
    cliValue('endpoint') ||
      process.env.RELEASE_PROMOTE_API_URL ||
      process.env.LIMECORE_CONTROL_PLANE_BASE_URL ||
      ''
  ) || CONTROL_PLANE_FALLBACK_BASE_URL;
const token =
  process.env.RELEASE_PROMOTE_API_TOKEN ||
  process.env.LIMECORE_CONTROL_PLANE_TOKEN ||
  '';
const brandPath = join(brandDir, `${brandId}.json`);

if (!existsSync(brandPath)) {
  throw new Error(`未找到品牌配置：oem/brands/${brandId}.json`);
}

const brand = await readJson(brandPath);
brand.brandId = normalizeText(brand.brandId);
brand.artifactName = normalizeText(brand.artifactName);
if (!brand.brandId || !brand.artifactName) {
  throw new Error(`品牌配置缺少 brandId 或 artifactName：${brandPath}`);
}

const releaseApiUrl = `${GITHUB_RELEASE_API_BASE}/${encodeURIComponent(tag)}`;
const githubToken = process.env.GITHUB_TOKEN || '';
const githubRelease = await fetchJson(releaseApiUrl, {
  headers: {
    accept: 'application/vnd.github+json',
    ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
    'user-agent': 'content-studio-oem-promote',
    'x-github-api-version': '2022-11-28',
  },
});

const matchingAssets = assertReleaseAssets({ brand, tag, release: githubRelease });
const version = tag.replace(/^v/i, '');
const appId = appIdForBrand(brand.brandId);
const releasePageUrl = normalizeText(githubRelease.html_url) || GITHUB_RELEASE_PAGE_URL;
const catalogCreatePayload = buildCatalogCreatePayload({
  brand,
  appId,
  version,
  releasePageUrl,
  assets: matchingAssets,
});
const releaseCreatePayload = buildReleaseCreatePayload({
  brand,
  tag,
  version,
  channel,
  releasePageUrl,
  assets: matchingAssets,
});

console.log(`OEM release verified: ${brand.brandId} ${tag} ${channel}`);
for (const asset of matchingAssets.sort((left, right) => left.name.localeCompare(right.name))) {
  console.log(`- ${asset.name}`);
}

if (dryRun) {
  console.log('Dry run only. Control-plane payload preview:');
  console.log(
    JSON.stringify(
      {
        baseUrl,
        appId,
        catalogCreatePayload,
        releaseCreatePayload,
        catalogUpdatePayload: buildCatalogUpdatePayload({ version }),
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (!baseUrl) {
  throw new Error('缺少 LimeCore control-plane base URL');
}
if (!token) {
  throw new Error('缺少 LimeCore control-plane Bearer token');
}

const headers = {
  authorization: `Bearer ${token}`,
  'content-type': 'application/json',
};
const request = (path, init = {}) =>
  requestJson(baseUrl, path, {
    ...init,
    headers: { ...headers, ...(init.headers || {}) },
  });

const catalogList = listResponseItems(
  await request('/api/v1/platform/agent-apps', {
    headers: { accept: 'application/json' },
  })
);
const existingCatalog = catalogList.find((item) => normalizeText(item.appId) === appId);
if (!existingCatalog) {
  await request('/api/v1/platform/agent-apps', {
    method: 'POST',
    body: JSON.stringify(catalogCreatePayload),
  });
}

const releaseList = listResponseItems(
  await request(`/api/v1/platform/agent-apps/${encodeURIComponent(appId)}/releases`, {
    headers: { accept: 'application/json' },
  })
);
const existingRelease = releaseList.find(
  (item) => normalizeText(item.version).replace(/^v/i, '') === version
);
const releasePath = existingRelease
  ? `/api/v1/platform/agent-apps/${encodeURIComponent(appId)}/releases/${encodeURIComponent(
      existingRelease.releaseId
    )}`
  : `/api/v1/platform/agent-apps/${encodeURIComponent(appId)}/releases`;
const releaseResult = await request(releasePath, {
  method: existingRelease ? 'PUT' : 'POST',
  body: JSON.stringify(existingRelease ? withoutVersion(releaseCreatePayload) : releaseCreatePayload),
});

await request(`/api/v1/platform/agent-apps/${encodeURIComponent(appId)}`, {
  method: 'PUT',
  body: JSON.stringify(buildCatalogUpdatePayload({ version })),
});

const publicDownload = await request(
  `/api/v1/public/agent-apps/${encodeURIComponent(appId)}/downloads/latest?channel=${encodeURIComponent(
    channel
  )}`,
  {
    headers: { accept: 'application/json' },
  }
);

console.log(`Promoted ${brand.brandId} ${tag} to ${channel}`);
console.log(
  JSON.stringify(
    {
      baseUrl,
      catalog: {
        action: existingCatalog ? 'updated' : 'created',
        appId,
        latestVersion: version,
      },
      release: {
        action: existingRelease ? 'updated' : 'created',
        releaseId: releaseResult.releaseId,
        version: releaseResult.version,
        status: releaseResult.status,
        packageUrl: releaseResult.packageUrl,
        packageHash: releaseResult.packageHash,
        manifestHash: releaseResult.manifestHash,
      },
      publicDownload: {
        appId: publicDownload.appId,
        version: publicDownload.version,
        releaseId: publicDownload.releaseId,
        assets: Array.isArray(publicDownload.assets) ? publicDownload.assets.length : 0,
      },
    },
    null,
    2
  )
);
