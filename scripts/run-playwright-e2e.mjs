import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function command(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(cmd, args) {
  return new Promise((resolveRun, rejectRun) => {
    const headed = args.includes('--headed') || process.env.CONTENT_STUDIO_TEST_SILENT === '0';
    const child = spawn(cmd, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        CONTENT_STUDIO_TEST_SILENT: headed ? '0' : '1',
      },
      stdio: 'inherit',
    });
    child.on('error', rejectRun);
    child.on('close', (code) => resolveRun(code ?? 1));
  });
}

try {
  require.resolve('@playwright/test');
} catch {
  console.error('缺少 @playwright/test，请先运行 npm ci 或 npm install。');
  process.exit(1);
}

const playwrightBin = join(projectRoot, 'node_modules', '.bin', command('playwright'));
if (!existsSync(playwrightBin)) {
  console.error(`缺少 Playwright 可执行文件：${playwrightBin}`);
  process.exit(1);
}

const code = await run(playwrightBin, ['test', '--config', 'playwright.config.mjs', ...process.argv.slice(2)]);
process.exit(code);
