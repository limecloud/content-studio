import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as esbuild from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tmpRoot = join(projectRoot, '.tmp', 'v2-acceptance-evidence');
await mkdir(tmpRoot, { recursive: true });
const outDir = await mkdtemp(join(tmpRoot, 'run-'));
const outFile = join(outDir, 'v2-acceptance-evidence.mjs');

await esbuild.build({
  entryPoints: [join(projectRoot, 'scripts/v2-acceptance-evidence.mjs')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  logLevel: 'silent',
});

const child = spawn(process.execPath, [outFile, ...process.argv.slice(2)], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: process.env,
});
const code = await new Promise((resolve) => child.on('exit', resolve));
await rm(outDir, { recursive: true, force: true });
process.exit(code ?? 1);
