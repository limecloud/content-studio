import { rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import process from 'node:process';

const rootDir = resolve(new URL('..', import.meta.url).pathname);

function cliValue(name) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

const brand = cliValue('brand') || process.env.OEM_BRAND || '';
const targets = [join(rootDir, '.tmp', 'oem')];

if (brand) {
  targets.push(join(rootDir, 'release', brand));
}

for (const target of targets) {
  await rm(target, { recursive: true, force: true });
}

console.log(brand ? `已清理 OEM 构建临时目录：${brand}` : '已清理 OEM 构建临时目录');
