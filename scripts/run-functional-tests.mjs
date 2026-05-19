import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import * as esbuild from 'esbuild';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(projectRoot, '.tmp', 'functional-tests');
const outFile = join(outDir, 'content-flow.test.mjs');

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await esbuild.build({
  entryPoints: [join(projectRoot, 'tests/functional/content-flow.test.mjs')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  sourcemap: 'inline',
  external: ['@anthropic-ai/claude-agent-sdk', 'fast-xml-parser', 'gray-matter', 'yauzl'],
  plugins: [{
    name: 'electron-test-shim',
    setup(build) {
      build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron-test-shim', namespace: 'content-studio-test' }));
      build.onLoad({ filter: /.*/, namespace: 'content-studio-test' }, () => ({
        loader: 'js',
        contents: `
          import { join } from 'node:path';
          import { tmpdir } from 'node:os';
          export const app = {
            getAppPath: () => process.cwd(),
            getPath: (name) => name === 'userData' ? join(tmpdir(), 'content-studio-functional-user-data') : tmpdir(),
          };
          export const safeStorage = {
            isEncryptionAvailable: () => false,
            encryptString: (value) => Buffer.from(String(value), 'utf-8'),
            decryptString: (value) => Buffer.from(value).toString('utf-8'),
          };
        `,
      }));
    },
  }],
  logLevel: 'silent',
});

const child = spawn(process.execPath, ['--test', outFile], {
  cwd: projectRoot,
  stdio: 'inherit',
  env: { ...process.env, CONTENT_STUDIO_RESOURCES_DIR: join(projectRoot, 'resources') },
});
const code = await new Promise((resolve) => child.on('exit', resolve));
await rm(outDir, { recursive: true, force: true });
process.exit(code ?? 1);
