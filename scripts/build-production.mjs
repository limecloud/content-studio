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
        CONTENT_STUDIO_USE_NPM_DESKTOP_PLATFORM: '1',
      },
      stdio: 'inherit',
    });
    child.on('error', rejectRun);
    child.on('close', (code) => resolveRun(code ?? 1));
  });
}

const steps = [
  [command('npm'), ['run', 'assert:agent-runtime-packages']],
  [command('npm'), ['run', 'assert:desktop-platform-packages']],
  [command('tsc'), ['--noEmit']],
  [command('electron-vite'), ['build']],
];

for (const [cmd, args] of steps) {
  const code = await run(cmd, args);
  if (code !== 0) process.exit(code);
}
