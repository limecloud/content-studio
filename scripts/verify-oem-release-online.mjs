import { readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = join(rootDir, 'oem', 'brands');
const platformOrder = ['mac', 'win', 'linux'];
const defaultBasePrefix = 'desktop/content-studio';
const defaultManifestApiUrl = 'https://api.bugu.run/api/v1/public/download-manifest';
const defaultControlApiBaseUrl = 'https://lime-api.limeai.run/api';

function cliValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
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

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function appIdForBrand(brandId) {
  return brandId === 'bugu' ? 'buguai' : brandId;
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf-8'));
}

async function listBrandIds() {
  const entries = await readdir(brandDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name.replace(/\.json$/, ''))
    .sort();
}

async function readBrand(brandId) {
  const brand = await readJson(join(brandDir, `${brandId}.json`));
  if (brand.brandId !== brandId) throw new Error(`品牌 manifest 不一致：${brandId}`);
  return brand;
}

async function resolveBrands(input) {
  const allBrandIds = await listBrandIds();
  const requested = normalizeText(input || 'all');
  const brandIds =
    requested === 'all'
      ? allBrandIds
      : requested
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
  const unknown = brandIds.filter((brandId) => !allBrandIds.includes(brandId));
  if (unknown.length) throw new Error(`未知品牌：${unknown.join(', ')}`);
  return Promise.all(brandIds.map(readBrand));
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
    throw new Error(`${url} -> HTTP ${response.status}: ${text.slice(0, 500)}`);
  }
  return payload;
}

function unwrapData(payload) {
  if (payload && typeof payload === 'object' && 'data' in payload) return payload.data;
  return payload;
}

async function verifyHead(url, expectedSize) {
  const target = new URL(url);
  target.searchParams.set('verify', String(Date.now()));
  const response = await fetch(target, { method: 'HEAD', headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || '0');
  if (length > 0 && expectedSize > 0 && length !== expectedSize) {
    throw new Error(`${url} size mismatch: expected=${expectedSize} actual=${length}`);
  }
  return {
    length: response.headers.get('content-length') || '',
    cacheControl: response.headers.get('cache-control') || '',
    cacheStatus: response.headers.get('cf-cache-status') || '',
  };
}

async function verifyBrandLatest({ brand, tag, basePrefix }) {
  for (const platform of platformOrder) {
    const latestUrl = new URL(`${normalizeBaseUrl(brand.downloadBaseUrl)}/${basePrefix}/${brand.brandId}/${platform}/latest.json`);
    latestUrl.searchParams.set('verify', String(Date.now()));
    const latest = await fetchJson(latestUrl, { headers: { 'cache-control': 'no-cache' } });
    if (latest.tag !== tag) throw new Error(`${brand.brandId}/${platform} latest tag mismatch: ${latest.tag}`);
    console.log(`latest ok: ${brand.brandId}/${platform} ${latest.tag}`);
    for (const file of latest.files || []) {
      const href = file.url || `${normalizeBaseUrl(brand.downloadBaseUrl)}/${file.r2Key || file.key}`;
      const head = await verifyHead(href, Number(file.size || 0));
      console.log(`  file ok: ${file.name} length=${head.length} cache="${head.cacheControl}" cf=${head.cacheStatus}`);
    }
  }
}

async function verifyGlobalManifest({ brands, tag, manifestApiUrl }) {
  const url = new URL(manifestApiUrl);
  url.searchParams.set('verify', String(Date.now()));
  const payload = await fetchJson(url, { headers: { 'cache-control': 'no-cache' } });
  const manifest = unwrapData(payload);
  for (const brand of brands) {
    const builds = (manifest.builds || []).filter((build) => build.brand === brand.brandId);
    if (!builds.length) throw new Error(`全局 manifest 缺少品牌：${brand.brandId}`);
    const wrong = builds.filter((build) => build.tag !== tag);
    if (wrong.length) {
      throw new Error(`全局 manifest ${brand.brandId} tag 不一致：${wrong.map((build) => `${build.platform}:${build.tag}`).join(', ')}`);
    }
  }
  console.log(`manifest api ok: ${manifest.tag}`);
}

async function verifyControlPlane({ brands, tag, channel, controlApiBaseUrl }) {
  const version = tag.replace(/^v/i, '');
  for (const brand of brands) {
    const appId = appIdForBrand(brand.brandId);
    const url = new URL(`${normalizeBaseUrl(controlApiBaseUrl)}/v1/public/agent-apps/${encodeURIComponent(appId)}/downloads/latest`);
    url.searchParams.set('channel', channel);
    url.searchParams.set('verify', String(Date.now()));
    const payload = await fetchJson(url, { headers: { 'cache-control': 'no-cache' } });
    const latest = unwrapData(payload);
    if (latest.version !== version && latest.tag !== tag) {
      throw new Error(`${brand.brandId} control-plane version mismatch: version=${latest.version} tag=${latest.tag}`);
    }
    console.log(`control-plane ok: ${brand.brandId} ${latest.version || latest.tag}`);
  }
}

async function main() {
  const tag = normalizeTag(requiredCliValue('tag'));
  const brands = await resolveBrands(cliValue('brands') || cliValue('brand') || 'all');
  const channel = normalizeText(cliValue('channel') || 'stable');
  const basePrefix = normalizeText(cliValue('base-prefix') || defaultBasePrefix).replace(/^\/+|\/+$/g, '');
  const manifestApiUrl = normalizeText(cliValue('manifest-api-url') || process.env.DOWNLOAD_MANIFEST_API_URL || defaultManifestApiUrl);
  const controlApiBaseUrl = normalizeText(cliValue('control-api-base-url') || process.env.CONTROL_PLANE_PUBLIC_API_BASE_URL || defaultControlApiBaseUrl);

  for (const brand of brands) {
    await verifyBrandLatest({ brand, tag, basePrefix });
  }
  await verifyGlobalManifest({ brands, tag, manifestApiUrl });
  await verifyControlPlane({ brands, tag, channel, controlApiBaseUrl });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
