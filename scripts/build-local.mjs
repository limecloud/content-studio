import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');

function command(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(cmd, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, {
      cwd: projectRoot,
      env: {
        ...process.env,
        CONTENT_STUDIO_LOCAL_BUILD: '1',
      },
      stdio: 'inherit',
    });
    child.on('error', rejectRun);
    child.on('close', (code) => resolveRun(code ?? 1));
  });
}

for (const [cmd, args] of [
  [command('tsc'), ['--noEmit', '--project', 'tsconfig.lime-packages.json']],
  [command('electron-vite'), ['build']],
]) {
  const code = await run(cmd, args);
  if (code !== 0) process.exit(code);
}
