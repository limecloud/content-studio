import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = join(rootDir, 'oem', 'brands');
const GITHUB_RELEASE_API_BASE = 'https://api.github.com/repos/limecloud/content-studio/releases/tags';
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

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function buildPromotePayload({ brand, tag, channel, release }) {
  const version = tag.replace(/^v/i, '');
  const assets = release.assets
    .filter((asset) => asset.name?.startsWith(`${brand.artifactName}-${version}-`))
    .filter((asset) => assetKind(asset.name))
    .map((asset) => ({
      fileName: asset.name,
      url: asset.browser_download_url,
      size: asset.size,
      sha256: normalizeText(asset.digest).replace(/^sha256:/, ''),
    }))
    .sort((left, right) => left.fileName.localeCompare(right.fileName));

  return {
    appId: appIdForBrand(brand.brandId),
    brandId: brand.brandId,
    channel,
    version,
    tag,
    releasePageUrl: release.html_url,
    releaseNotesUrl: release.html_url,
    assets,
    promotedAt: new Date().toISOString(),
  };
}

function assertReleaseAssets({ brand, tag, release }) {
  const version = tag.replace(/^v/i, '');
  const prefix = `${brand.artifactName}-${version}-`;
  const matchingAssets = (release.assets || []).filter((asset) =>
    normalizeText(asset.name).startsWith(prefix)
  );
  const presentKinds = new Set(matchingAssets.map((asset) => assetKind(asset.name)).filter(Boolean));
  const missingKinds = REQUIRED_KINDS.filter((kind) => !presentKinds.has(kind));

  if (missingKinds.length > 0) {
    throw new Error(
      `GitHub Release ${tag} 缺少 ${brand.brandId} 产物：${missingKinds.join(', ')}`
    );
  }

  return matchingAssets;
}

async function promoteRelease({ endpoint, token, payload }) {
  if (!endpoint) {
    throw new Error('缺少 RELEASE_PROMOTE_API_URL，不能执行真实 promote');
  }
  if (!token) {
    throw new Error('缺少 RELEASE_PROMOTE_API_TOKEN，不能执行真实 promote');
  }

  const body = JSON.stringify(payload);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'idempotency-key': sha256(`${payload.appId}:${payload.channel}:${payload.tag}`),
    },
    body,
  });
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  }

  return text;
}

const brandId = requiredCliValue('brand');
const tag = normalizeTag(requiredCliValue('tag'));
const channel = normalizeChannel(cliValue('channel') || 'stable');
const dryRun = cliFlag('dry-run') || cliValue('dry-run') === 'true';
const endpoint = cliValue('endpoint') || process.env.RELEASE_PROMOTE_API_URL || '';
const token = process.env.RELEASE_PROMOTE_API_TOKEN || '';
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
const release = await fetchJson(releaseApiUrl, {
  headers: {
    accept: 'application/vnd.github+json',
    ...(githubToken ? { authorization: `Bearer ${githubToken}` } : {}),
    'user-agent': 'content-studio-oem-promote',
    'x-github-api-version': '2022-11-28',
  },
});

const matchingAssets = assertReleaseAssets({ brand, tag, release });
const payload = buildPromotePayload({ brand, tag, channel, release });

console.log(`OEM release verified: ${brand.brandId} ${tag} ${channel}`);
for (const asset of matchingAssets.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`- ${asset.name}`);
}

if (dryRun) {
  console.log('Dry run only. Promote payload:');
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}

const result = await promoteRelease({ endpoint, token, payload });
console.log(`Promoted ${brand.brandId} ${tag} to ${channel}`);
if (result) console.log(result);
