import { createHash, createHmac } from 'node:crypto';
import { existsSync, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const brandDir = join(rootDir, 'oem', 'brands');
const defaultBasePrefix = 'desktop/content-studio';
const defaultBucket = 'bugu-releases';
const defaultGlobalDownloadBaseUrl = 'https://downloads.bugu.run';
const githubReleaseApiBase = 'https://api.github.com/repos';
const requiredAssetKinds = [
  'linux-appimage',
  'mac-dmg',
  'mac-dmg-blockmap',
  'mac-zip',
  'mac-zip-blockmap',
  'win-exe',
  'win-exe-blockmap',
];
const platformOrder = ['linux', 'mac', 'win'];
const multipartThreshold = 64 * 1024 * 1024;
const partSize = 64 * 1024 * 1024;

function cliValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

function cliBoolean(name, defaultValue = false) {
  const value = cliValue(name);
  if (!value) return process.argv.includes(`--${name}`) || defaultValue;
  return !['0', 'false', 'no'].includes(value.toLowerCase());
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

function encodePathSegment(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function canonicalPath(bucket, key) {
  return `/${bucket}/${key.split('/').map(encodePathSegment).join('/')}`;
}

function canonicalQuery(params) {
  return [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
}

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key, value, encoding) {
  return createHmac('sha256', key).update(value).digest(encoding);
}

async function sha256File(filePath) {
  const hash = createHash('sha256');
  const file = await open(filePath, 'r');
  try {
    for await (const chunk of file.createReadStream()) {
      hash.update(chunk);
    }
  } finally {
    await file.close();
  }
  return hash.digest('hex');
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
  if (brand.brandId !== brandId) {
    throw new Error(`品牌 manifest 不一致：${brandId} -> ${brand.brandId}`);
  }
  if (!brand.artifactName) throw new Error(`品牌缺少 artifactName：${brandId}`);
  if (!brand.downloadBaseUrl) throw new Error(`品牌缺少 downloadBaseUrl：${brandId}`);
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

function githubHeaders(extra = {}) {
  const token = normalizeText(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  return {
    accept: 'application/vnd.github+json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
    'user-agent': 'content-studio-oem-r2-publish',
    'x-github-api-version': '2022-11-28',
    ...extra,
  };
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

async function fetchGithubRelease(tag) {
  const repo = normalizeText(process.env.GITHUB_REPOSITORY) || 'limecloud/content-studio';
  const url = `${githubReleaseApiBase}/${repo}/releases/tags/${encodeURIComponent(tag)}`;
  return fetchJson(url, { headers: githubHeaders() });
}

function platformForFile(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.appimage')) return 'linux';
  if (lower.endsWith('.exe') || lower.endsWith('.exe.blockmap')) return 'win';
  if (
    lower.endsWith('.dmg') ||
    lower.endsWith('.dmg.blockmap') ||
    lower.endsWith('.zip') ||
    lower.endsWith('.zip.blockmap')
  ) {
    return 'mac';
  }
  return '';
}

function assetKind(fileName) {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.appimage')) return 'linux-appimage';
  if (lower.endsWith('.dmg')) return 'mac-dmg';
  if (lower.endsWith('.dmg.blockmap')) return 'mac-dmg-blockmap';
  if (lower.endsWith('.zip')) return 'mac-zip';
  if (lower.endsWith('.zip.blockmap')) return 'mac-zip-blockmap';
  if (lower.endsWith('.exe')) return 'win-exe';
  if (lower.endsWith('.exe.blockmap')) return 'win-exe-blockmap';
  return '';
}

function isReleaseFile(fileName) {
  return Boolean(assetKind(fileName));
}

function contentTypeFor(filePath) {
  if (filePath.endsWith('.json')) return 'application/json; charset=utf-8';
  if (filePath.endsWith('.dmg')) return 'application/x-apple-diskimage';
  if (filePath.endsWith('.zip')) return 'application/zip';
  if (filePath.endsWith('.exe')) return 'application/vnd.microsoft.portable-executable';
  return 'application/octet-stream';
}

function cacheControlForKey(key) {
  if (key.endsWith('/latest.json') || key.endsWith('/_manifests/latest.json')) {
    return 'no-cache, max-age=0, must-revalidate';
  }
  return 'public, max-age=31536000, immutable';
}

function collectBrandAssets({ release, brand, tag }) {
  const version = tag.replace(/^v/i, '');
  const prefix = `${brand.artifactName}-${version}-`;
  const assets = (release.assets || [])
    .map((asset) => ({
      fileName: normalizeText(asset.name),
      size: Number(asset.size || 0),
      apiUrl: normalizeText(asset.url),
      browserUrl: normalizeText(asset.browser_download_url),
      digest: normalizeText(asset.digest).replace(/^sha256:/, ''),
    }))
    .filter((asset) => asset.fileName.startsWith(prefix))
    .filter((asset) => isReleaseFile(asset.fileName))
    .map((asset) => ({
      ...asset,
      brandId: brand.brandId,
      platform: platformForFile(asset.fileName),
      kind: assetKind(asset.fileName),
    }))
    .filter((asset) => asset.platform && asset.apiUrl);

  const present = new Set(assets.map((asset) => asset.kind));
  const missing = requiredAssetKinds.filter((kind) => !present.has(kind));
  if (missing.length) {
    throw new Error(`${brand.brandId} ${tag} 缺少 GitHub Release 产物：${missing.join(', ')}`);
  }

  return assets.sort((left, right) => {
    const leftPlatform = platformOrder.indexOf(left.platform);
    const rightPlatform = platformOrder.indexOf(right.platform);
    if (leftPlatform !== rightPlatform) return leftPlatform - rightPlatform;
    return left.fileName.localeCompare(right.fileName);
  });
}

function printPlan({ tag, brands, assetsByBrand, dryRun }) {
  console.log(`OEM R2 release plan: tag=${tag} brands=${brands.map((brand) => brand.brandId).join(',')} dryRun=${dryRun}`);
  for (const brand of brands) {
    const assets = assetsByBrand.get(brand.brandId) || [];
    console.log(`${brand.brandId}: ${assets.length} release files`);
    for (const platform of platformOrder) {
      const files = assets.filter((asset) => asset.platform === platform);
      console.log(`  ${platform}: ${files.map((file) => `${file.fileName} (${file.size} bytes)`).join(', ')}`);
    }
  }
}

async function downloadReleaseAsset(asset, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const filePath = join(targetDir, asset.fileName);
  if (existsSync(filePath)) {
    const fileStat = await stat(filePath);
    if (fileStat.size === asset.size) {
      return filePath;
    }
  }

  const response = await fetch(asset.apiUrl, {
    headers: githubHeaders({ accept: 'application/octet-stream' }),
  });
  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => '');
    throw new Error(`下载 GitHub Release 产物失败：${asset.fileName} HTTP ${response.status} ${text.slice(0, 300)}`);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(filePath));
  const fileStat = await stat(filePath);
  if (fileStat.size !== asset.size) {
    throw new Error(`下载产物大小不一致：${asset.fileName} expected=${asset.size} actual=${fileStat.size}`);
  }
  return filePath;
}

async function downloadAssets({ assetsByBrand, workDir }) {
  const downloaded = [];
  for (const [brandId, assets] of assetsByBrand) {
    for (const asset of assets) {
      const targetDir = join(workDir, 'release-assets', `${brandId}__${asset.platform}`);
      console.log(`download ${asset.fileName}`);
      const filePath = await downloadReleaseAsset(asset, targetDir);
      downloaded.push({ ...asset, filePath, sha256: await sha256File(filePath) });
    }
  }
  return downloaded;
}

async function buildUploadPlan({ brands, downloadedAssets, tag, basePrefix, workDir, globalDownloadBaseUrl }) {
  const generatedAt = new Date().toISOString();
  const uploadItems = [];
  const builds = [];
  const uploadRoot = join(workDir, 'upload');

  for (const brand of brands) {
    for (const platform of platformOrder) {
      const assets = downloadedAssets
        .filter((asset) => asset.brandId === brand.brandId && asset.platform === platform)
        .sort((left, right) => left.fileName.localeCompare(right.fileName));
      if (!assets.length) continue;

      const r2Prefix = `${basePrefix}/${brand.brandId}/${platform}/${tag}`;
      const files = assets.map((asset) => ({
        name: asset.fileName,
        size: asset.size,
        sha256: asset.sha256,
        r2Key: `${r2Prefix}/${asset.fileName}`,
        url: `${normalizeBaseUrl(brand.downloadBaseUrl)}/${r2Prefix}/${asset.fileName}`,
      }));
      const manifest = {
        schemaVersion: 1,
        app: 'content-studio',
        brand: brand.brandId,
        platform,
        tag,
        r2Prefix,
        files,
        generatedAt,
      };

      builds.push(manifest);

      for (const asset of assets) {
        uploadItems.push({
          key: `${r2Prefix}/${asset.fileName}`,
          filePath: asset.filePath,
          publicBaseUrl: normalizeBaseUrl(brand.downloadBaseUrl),
          expectedSize: asset.size,
        });
      }

      const versionManifestPath = join(uploadRoot, r2Prefix, 'manifest.json');
      const latestManifestPath = join(uploadRoot, basePrefix, brand.brandId, platform, 'latest.json');
      await mkdir(dirname(versionManifestPath), { recursive: true });
      await mkdir(dirname(latestManifestPath), { recursive: true });
      await writeFile(versionManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
      await writeFile(latestManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
      uploadItems.push({
        key: `${r2Prefix}/manifest.json`,
        filePath: versionManifestPath,
        publicBaseUrl: normalizeBaseUrl(brand.downloadBaseUrl),
        expectedSize: Buffer.byteLength(`${JSON.stringify(manifest, null, 2)}\n`),
      });
      uploadItems.push({
        key: `${basePrefix}/${brand.brandId}/${platform}/latest.json`,
        filePath: latestManifestPath,
        publicBaseUrl: normalizeBaseUrl(brand.downloadBaseUrl),
        expectedSize: Buffer.byteLength(`${JSON.stringify(manifest, null, 2)}\n`),
      });
    }
  }

  const existingGlobal = await fetchExistingGlobalManifest({ basePrefix, globalDownloadBaseUrl });
  const targetBrandIds = new Set(brands.map((brand) => brand.brandId));
  const mergedBuilds = [
    ...((existingGlobal?.builds || []).filter((build) => !targetBrandIds.has(build.brand))),
    ...builds,
  ].sort((left, right) => `${left.brand}/${left.platform}`.localeCompare(`${right.brand}/${right.platform}`));
  const globalManifest = {
    schemaVersion: 1,
    app: 'content-studio',
    tag,
    basePrefix,
    builds: mergedBuilds,
    generatedAt,
  };
  const globalManifestDir = join(uploadRoot, basePrefix, '_manifests');
  await mkdir(globalManifestDir, { recursive: true });

  const globalLatestPath = join(globalManifestDir, 'latest.json');
  await writeFile(globalLatestPath, `${JSON.stringify(globalManifest, null, 2)}\n`, 'utf-8');

  const allBuildsMatchTag = mergedBuilds.every((build) => build.tag === tag);
  if (allBuildsMatchTag) {
    const globalVersionPath = join(globalManifestDir, `${tag}.json`);
    await writeFile(globalVersionPath, `${JSON.stringify(globalManifest, null, 2)}\n`, 'utf-8');
    uploadItems.push({
      key: `${basePrefix}/_manifests/${tag}.json`,
      filePath: globalVersionPath,
      publicBaseUrl: globalDownloadBaseUrl,
      expectedSize: Buffer.byteLength(`${JSON.stringify(globalManifest, null, 2)}\n`),
    });
  } else {
    console.warn(`skip ${basePrefix}/_manifests/${tag}.json because merged latest contains older brand builds`);
  }

  uploadItems.push({
    key: `${basePrefix}/_manifests/latest.json`,
    filePath: globalLatestPath,
    publicBaseUrl: globalDownloadBaseUrl,
    expectedSize: Buffer.byteLength(`${JSON.stringify(globalManifest, null, 2)}\n`),
  });

  return { builds, globalManifest, uploadItems };
}

async function fetchExistingGlobalManifest({ basePrefix, globalDownloadBaseUrl }) {
  const url = new URL(`${normalizeBaseUrl(globalDownloadBaseUrl)}/${basePrefix}/_manifests/latest.json`);
  url.searchParams.set('publishVerify', String(Date.now()));
  try {
    const response = await fetch(url, { headers: { 'cache-control': 'no-cache' } });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function readR2Credentials() {
  const accountId = normalizeText(
    process.env.R2_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || process.env.CF_ACCOUNT_ID
  );
  const accessKeyId = normalizeText(process.env.R2_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID);
  const secretAccessKey = normalizeText(
    process.env.R2_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY
  );
  if (!accountId) throw new Error('缺少 R2_ACCOUNT_ID / CLOUDFLARE_ACCOUNT_ID');
  if (!accessKeyId) throw new Error('缺少 R2_ACCESS_KEY_ID');
  if (!secretAccessKey) throw new Error('缺少 R2_SECRET_ACCESS_KEY');
  return { accountId, accessKeyId, secretAccessKey };
}

function signRequest({ method, bucket, key, query = new URLSearchParams(), headers, bodyHash, credentials }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = `${credentials.accountId}.r2.cloudflarestorage.com`;
  const signedHeadersMap = {
    ...headers,
    host,
    'x-amz-content-sha256': bodyHash,
    'x-amz-date': amzDate,
  };
  const headerNames = Object.keys(signedHeadersMap).map((name) => name.toLowerCase()).sort();
  const canonicalHeaders = headerNames
    .map((name) => `${name}:${String(signedHeadersMap[name]).trim().replace(/\s+/g, ' ')}\n`)
    .join('');
  const signedHeaders = headerNames.join(';');
  const canonicalRequest = [
    method,
    canonicalPath(bucket, key),
    canonicalQuery(query),
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');
  const region = 'auto';
  const service = 's3';
  const scope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${credentials.secretAccessKey}`, dateStamp), region), service),
    'aws4_request'
  );
  const signature = hmac(signingKey, stringToSign, 'hex');
  return {
    ...signedHeadersMap,
    Authorization: `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

async function s3Request({ method, bucket, key, query = new URLSearchParams(), headers = {}, body, bodyHash, credentials }) {
  const signedHeaders = signRequest({ method, bucket, key, query, headers, bodyHash, credentials });
  const url = new URL(`https://${credentials.accountId}.r2.cloudflarestorage.com${canonicalPath(bucket, key)}`);
  for (const [name, value] of query.entries()) url.searchParams.append(name, value);
  const response = await fetch(url, { method, headers: signedHeaders, body });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`${method} ${key} failed: HTTP ${response.status} ${text.slice(0, 600)}`);
  }
  return response;
}

function xmlText(name, text) {
  return `<${name}>${String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')}</${name}>`;
}

async function putObject({ item, bucket, credentials }) {
  const body = await readFile(item.filePath);
  await s3Request({
    method: 'PUT',
    bucket,
    key: item.key,
    headers: {
      'cache-control': cacheControlForKey(item.key),
      'content-length': String(body.length),
      'content-type': contentTypeFor(item.filePath),
    },
    body,
    bodyHash: sha256Hex(body),
    credentials,
  });
}

async function createMultipartUpload({ item, bucket, credentials }) {
  const query = new URLSearchParams([['uploads', '']]);
  const response = await s3Request({
    method: 'POST',
    bucket,
    key: item.key,
    query,
    headers: {
      'cache-control': cacheControlForKey(item.key),
      'content-type': contentTypeFor(item.filePath),
    },
    body: '',
    bodyHash: sha256Hex(''),
    credentials,
  });
  const text = await response.text();
  const match = text.match(/<UploadId>([^<]+)<\/UploadId>/);
  if (!match) throw new Error(`无法解析 UploadId: ${text.slice(0, 600)}`);
  return match[1];
}

async function uploadPart({ item, bucket, credentials, file, uploadId, partNumber, offset, length }) {
  const buffer = Buffer.alloc(length);
  await file.read(buffer, 0, length, offset);
  const query = new URLSearchParams([
    ['partNumber', String(partNumber)],
    ['uploadId', uploadId],
  ]);
  const response = await s3Request({
    method: 'PUT',
    bucket,
    key: item.key,
    query,
    headers: { 'content-length': String(length) },
    body: buffer,
    bodyHash: sha256Hex(buffer),
    credentials,
  });
  const etag = response.headers.get('etag');
  if (!etag) throw new Error(`part ${partNumber} 缺少 ETag: ${item.key}`);
  return { partNumber, etag };
}

async function completeMultipartUpload({ item, bucket, credentials, uploadId, parts }) {
  const body = `<CompleteMultipartUpload>${parts
    .map((part) => `<Part>${xmlText('ETag', part.etag)}${xmlText('PartNumber', part.partNumber)}</Part>`)
    .join('')}</CompleteMultipartUpload>`;
  const query = new URLSearchParams([['uploadId', uploadId]]);
  await s3Request({
    method: 'POST',
    bucket,
    key: item.key,
    query,
    headers: {
      'content-length': String(Buffer.byteLength(body)),
      'content-type': 'application/xml',
    },
    body,
    bodyHash: sha256Hex(body),
    credentials,
  });
}

async function abortMultipartUpload({ item, bucket, credentials, uploadId }) {
  const query = new URLSearchParams([['uploadId', uploadId]]);
  await s3Request({
    method: 'DELETE',
    bucket,
    key: item.key,
    query,
    body: '',
    bodyHash: sha256Hex(''),
    credentials,
  });
}

async function multipartUpload({ item, bucket, credentials, size }) {
  const uploadId = await createMultipartUpload({ item, bucket, credentials });
  const file = await open(item.filePath, 'r');
  const parts = [];
  try {
    let partNumber = 1;
    for (let offset = 0; offset < size; offset += partSize) {
      const length = Math.min(partSize, size - offset);
      parts.push(await uploadPart({ item, bucket, credentials, file, uploadId, partNumber, offset, length }));
      console.log(`    part ${partNumber}/${Math.ceil(size / partSize)} ok`);
      partNumber += 1;
    }
  } catch (error) {
    await file.close();
    await abortMultipartUpload({ item, bucket, credentials, uploadId }).catch(() => {});
    throw error;
  }
  await file.close();
  await completeMultipartUpload({ item, bucket, credentials, uploadId, parts });
}

async function verifyPublicHead(item) {
  const url = new URL(`${normalizeBaseUrl(item.publicBaseUrl)}/${item.key}`);
  url.searchParams.set('publishVerify', String(Date.now()));
  const response = await fetch(url, { method: 'HEAD', headers: { 'cache-control': 'no-cache' } });
  if (!response.ok) throw new Error(`公开对象不可访问：${url} HTTP ${response.status}`);
  const length = Number(response.headers.get('content-length') || '0');
  if (length > 0 && item.expectedSize > 0 && length !== item.expectedSize) {
    throw new Error(`公开对象大小不一致：${item.key} expected=${item.expectedSize} actual=${length}`);
  }
  return {
    length: response.headers.get('content-length') || '',
    cacheControl: response.headers.get('cache-control') || '',
    cacheStatus: response.headers.get('cf-cache-status') || '',
  };
}

async function uploadItems({ uploadItems, bucket, credentials }) {
  const latestItems = uploadItems.filter((item) => item.key.endsWith('/latest.json'));
  const normalItems = uploadItems.filter((item) => !item.key.endsWith('/latest.json'));
  for (const item of [...normalItems, ...latestItems]) {
    const fileStat = await stat(item.filePath);
    console.log(`upload ${relative(rootDir, item.filePath)} -> ${item.key} (${fileStat.size} bytes)`);
    if (fileStat.size >= multipartThreshold) {
      await multipartUpload({ item, bucket, credentials, size: fileStat.size });
    } else {
      await putObject({ item, bucket, credentials });
    }
    const head = await verifyPublicHead({ ...item, expectedSize: fileStat.size });
    console.log(`  public HEAD length=${head.length} cache="${head.cacheControl}" cf=${head.cacheStatus}`);
  }
}

async function verifyLatestJson({ brands, tag, basePrefix, globalDownloadBaseUrl }) {
  for (const brand of brands) {
    for (const platform of platformOrder) {
      const url = new URL(`${normalizeBaseUrl(brand.downloadBaseUrl)}/${basePrefix}/${brand.brandId}/${platform}/latest.json`);
      url.searchParams.set('publishVerify', String(Date.now()));
      const latest = await fetchJson(url, { headers: { 'cache-control': 'no-cache' } });
      if (latest.tag !== tag) throw new Error(`${brand.brandId}/${platform} latest tag mismatch: ${latest.tag}`);
      console.log(`latest ok: ${brand.brandId}/${platform} ${latest.tag}`);
    }
  }
  const globalUrl = new URL(`${normalizeBaseUrl(globalDownloadBaseUrl)}/${basePrefix}/_manifests/latest.json`);
  globalUrl.searchParams.set('publishVerify', String(Date.now()));
  const globalManifest = await fetchJson(globalUrl, { headers: { 'cache-control': 'no-cache' } });
  for (const brand of brands) {
    const builds = (globalManifest.builds || []).filter((build) => build.brand === brand.brandId);
    if (!builds.length) throw new Error(`全局 manifest 缺少品牌：${brand.brandId}`);
    const wrong = builds.filter((build) => build.tag !== tag);
    if (wrong.length) throw new Error(`全局 manifest ${brand.brandId} tag 不一致：${wrong.map((build) => `${build.platform}:${build.tag}`).join(', ')}`);
  }
  console.log(`global latest ok: ${globalManifest.tag}`);
}

async function main() {
  const tag = normalizeTag(requiredCliValue('tag'));
  const dryRun = cliBoolean('dry-run', false);
  const brands = await resolveBrands(cliValue('brands') || cliValue('brand') || 'all');
  const release = await fetchGithubRelease(tag);
  const assetsByBrand = new Map();
  for (const brand of brands) {
    assetsByBrand.set(brand.brandId, collectBrandAssets({ release, brand, tag }));
  }
  printPlan({ tag, brands, assetsByBrand, dryRun });
  if (dryRun) return;

  const bucket = normalizeText(cliValue('bucket') || process.env.R2_BUCKET || defaultBucket);
  const basePrefix = normalizeText(cliValue('base-prefix') || defaultBasePrefix).replace(/^\/+|\/+$/g, '');
  const globalDownloadBaseUrl = normalizeBaseUrl(
    cliValue('global-download-base-url') || process.env.GLOBAL_DOWNLOAD_BASE_URL || defaultGlobalDownloadBaseUrl
  );
  const workDir = resolve(rootDir, cliValue('work-dir') || `.tmp/oem-r2-release/${tag}`);
  await rm(join(workDir, 'upload'), { recursive: true, force: true });
  await mkdir(workDir, { recursive: true });

  const credentials = readR2Credentials();
  const downloadedAssets = await downloadAssets({ assetsByBrand, workDir });
  const { globalManifest, uploadItems: items } = await buildUploadPlan({
    brands,
    downloadedAssets,
    tag,
    basePrefix,
    workDir,
    globalDownloadBaseUrl,
  });
  console.log(
    `prepared upload: ${items.length} objects, global builds=${globalManifest.builds
      .map((build) => `${build.brand}/${build.platform}:${build.tag}`)
      .join(', ')}`
  );
  await uploadItems({ uploadItems: items, bucket, credentials });
  await verifyLatestJson({ brands, tag, basePrefix, globalDownloadBaseUrl });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
