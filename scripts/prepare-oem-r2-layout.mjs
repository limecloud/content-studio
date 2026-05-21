import { copyFile, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { basename, join, relative } from 'node:path';
import process from 'node:process';

const DISTRIBUTABLE_FILE_PATTERN = /(\.dmg|\.zip|\.exe|\.AppImage|\.blockmap|^latest.*\.ya?ml)$/i;

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

function normalizePrefix(value) {
  return String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
}

async function listFiles(rootDir, dir = rootDir) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(rootDir, fullPath));
      continue;
    }
    if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function isDistributableFile(filePath) {
  return DISTRIBUTABLE_FILE_PATTERN.test(basename(filePath));
}

async function sha256(filePath) {
  const hash = createHash('sha256');
  hash.update(await readFile(filePath));
  return hash.digest('hex');
}

const tag = requiredCliValue('tag');
const artifactRoot = cliValue('artifact-root') || 'release-artifacts';
const outputRoot = cliValue('out') || '.tmp/r2-upload';
const basePrefix = normalizePrefix(cliValue('base-prefix') || 'desktop/content-studio');

if (!existsSync(artifactRoot)) {
  throw new Error(`未找到构建产物目录：${artifactRoot}`);
}

await rm(outputRoot, { recursive: true, force: true });

const artifacts = await (await import('node:fs/promises')).readdir(artifactRoot, { withFileTypes: true });
const builds = [];

for (const entry of artifacts) {
  if (!entry.isDirectory() || !entry.name.includes('__')) continue;
  const [brand, platform] = entry.name.split('__');
  if (!brand || !platform) throw new Error(`产物目录名必须为 brand__platform：${entry.name}`);

  const sourceDir = join(artifactRoot, entry.name);
  const sourceFiles = (await listFiles(sourceDir)).filter(isDistributableFile);
  if (!sourceFiles.length) throw new Error(`产物目录为空：${entry.name}`);

  const r2Prefix = `${basePrefix}/${brand}/${platform}/${tag}`;
  const targetDir = join(outputRoot, r2Prefix);
  await mkdir(targetDir, { recursive: true });

  const files = [];
  for (const filePath of sourceFiles) {
    const targetName = basename(filePath);
    const targetPath = join(targetDir, targetName);
    await copyFile(filePath, targetPath);
    const fileStat = await stat(filePath);
    files.push({
      name: targetName,
      size: fileStat.size,
      sha256: await sha256(filePath),
      r2Key: `${r2Prefix}/${targetName}`,
    });
  }

  const manifest = {
    schemaVersion: 1,
    app: 'content-studio',
    brand,
    platform,
    tag,
    r2Prefix,
    files: files.sort((a, b) => a.name.localeCompare(b.name)),
    generatedAt: new Date().toISOString(),
  };

  await writeFile(join(targetDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  const latestPath = join(outputRoot, basePrefix, brand, platform, 'latest.json');
  await mkdir(join(outputRoot, basePrefix, brand, platform), { recursive: true });
  await writeFile(latestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

  builds.push(manifest);
}

if (!builds.length) {
  throw new Error(`未找到 brand__platform 格式的构建产物目录：${artifactRoot}`);
}

const index = {
  schemaVersion: 1,
  app: 'content-studio',
  tag,
  basePrefix,
  builds: builds.sort((a, b) => `${a.brand}/${a.platform}`.localeCompare(`${b.brand}/${b.platform}`)),
  generatedAt: new Date().toISOString(),
};

const manifestDir = join(outputRoot, basePrefix, '_manifests');
await mkdir(manifestDir, { recursive: true });
await writeFile(join(manifestDir, `${tag}.json`), `${JSON.stringify(index, null, 2)}\n`, 'utf-8');
await writeFile(join(manifestDir, 'latest.json'), `${JSON.stringify(index, null, 2)}\n`, 'utf-8');

for (const build of index.builds) {
  console.log(`${build.brand}/${build.platform} -> ${build.r2Prefix}`);
}
console.log(`R2 upload layout prepared: ${relative(process.cwd(), outputRoot)}`);
