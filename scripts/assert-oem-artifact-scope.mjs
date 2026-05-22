import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function cliValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf-8'));
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

const brandId = cliValue('brand') || process.env.OEM_BRAND || 'bugu';
const brandRoot = join(rootDir, 'oem', 'brands');
const current = await readJson(join(brandRoot, `${brandId}.json`));
const releaseDir = join(rootDir, 'release', brandId);

if (!existsSync(releaseDir)) {
  throw new Error(`未找到当前品牌产物目录：release/${brandId}`);
}

const files = await walk(releaseDir);
let runtimeConfigCount = 0;
for (const file of files) {
  const rel = relative(releaseDir, file).split(sep).join('/');
  if (rel.includes('oem/brands')) {
    throw new Error(`产物中不应包含品牌清单目录：${rel}`);
  }
  if (!rel.endsWith('resources/oem-runtime-config.json')) {
    continue;
  }
  runtimeConfigCount += 1;
  const runtimeConfig = JSON.parse(await readFile(file, 'utf-8'));
  if (runtimeConfig.brandId !== current.brandId || runtimeConfig.tenantId !== current.tenantId || runtimeConfig.appId !== current.appId) {
    throw new Error(`产物 ${rel} 的 runtime config 与当前品牌不一致`);
  }
}

if (runtimeConfigCount === 0) {
  throw new Error(`产物中缺少当前品牌 runtime config：${brandId}`);
}

if (runtimeConfigCount > 1) {
  throw new Error(`产物中存在多个 runtime config：${runtimeConfigCount}`);
}

console.log(`OEM 产物范围检查通过：${brandId}`);
