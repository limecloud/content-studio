import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const limePackagesRoot = resolve(
  process.env.CONTENT_STUDIO_LIME_PACKAGES_ROOT
    ?? resolve(projectRoot, '../../aiclientproxy/lime/packages'),
);

const PACKAGE_REQUIREMENTS = [
  {
    packageName: '@limecloud/agent-ui-contracts',
    localDir: 'agent-ui-contracts',
    exports: [],
  },
  {
    packageName: '@limecloud/agent-runtime-projection',
    localDir: 'agent-runtime-projection',
    exports: ['projectAgentUiState', 'projectAgentRuntimeReadModel'],
  },
  {
    packageName: '@limecloud/agent-runtime-ui',
    localDir: 'agent-runtime-ui',
    exports: ['AgentUiProjectionView', 'ProcessTimelineView', 'ExecutionGraphView', 'SubagentsView'],
  },
];

function command(name) {
  return process.platform === 'win32' ? `${name}.cmd` : name;
}

function run(cmd, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(cmd, args, {
      cwd: options.cwd ?? projectRoot,
      env: options.env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', rejectRun);
    child.on('close', (code) => resolveRun({ code: code ?? 1, stdout, stderr }));
  });
}

function parseNpmPackJson(output, packageName) {
  for (let index = output.lastIndexOf('['); index >= 0; index = output.lastIndexOf('[', index - 1)) {
    try {
      const parsed = JSON.parse(output.slice(index));
      if (Array.isArray(parsed) && parsed[0]?.filename) return parsed[0];
    } catch {
      // Continue scanning; npm may print lifecycle logs before the JSON payload.
    }
  }
  throw new Error(`${packageName}: cannot parse npm pack --json output`);
}

async function packPackage(requirement, packDir) {
  const packageDir = resolve(limePackagesRoot, requirement.localDir);
  if (!existsSync(join(packageDir, 'package.json'))) {
    throw new Error(`${requirement.packageName}: missing local package at ${packageDir}`);
  }
  const result = await run(command('npm'), ['pack', '--json', '--pack-destination', packDir], { cwd: packageDir });
  if (result.code !== 0) {
    throw new Error([
      `${requirement.packageName}: npm pack failed`,
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join('\n'));
  }
  const packInfo = parseNpmPackJson(result.stdout, requirement.packageName);
  const tarballPath = join(packDir, packInfo.filename);
  if (!existsSync(tarballPath)) {
    throw new Error(`${requirement.packageName}: npm pack did not create ${tarballPath}`);
  }
  return { ...packInfo, tarballPath };
}

async function linkPeerDependency(packageName, installRoot) {
  const source = join(projectRoot, 'node_modules', packageName);
  if (!existsSync(source)) return;
  const target = join(installRoot, 'node_modules', packageName);
  if (existsSync(target)) return;
  await symlink(source, target, process.platform === 'win32' ? 'junction' : 'dir');
}

async function installTarballs(packed, installRoot) {
  await writeFile(
    join(installRoot, 'package.json'),
    `${JSON.stringify({ private: true, type: 'module' }, null, 2)}\n`,
    'utf8',
  );
  const result = await run(
    command('npm'),
    [
      'install',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
      '--package-lock=false',
      '--legacy-peer-deps',
      ...packed.map(({ packInfo }) => packInfo.tarballPath),
    ],
    { cwd: installRoot },
  );
  if (result.code !== 0) {
    throw new Error([
      '[local-lime-agent-runtime-tarballs] npm install local tarballs failed',
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join('\n'));
  }
}

async function verifyInstalledExports(installRoot) {
  const checkerPath = join(installRoot, 'check-standard-agentui-exports.mjs');
  await writeFile(checkerPath, `
const requirements = ${JSON.stringify(PACKAGE_REQUIREMENTS)};
const failures = [];
for (const requirement of requirements) {
  let module;
  try {
    module = await import(requirement.packageName);
  } catch (error) {
    failures.push(\`\${requirement.packageName}: cannot import package (\${error instanceof Error ? error.message : String(error)})\`);
    continue;
  }
  for (const exportName of requirement.exports) {
    if (!(exportName in module)) {
      failures.push(\`\${requirement.packageName}: missing export \${exportName}\`);
    }
  }
}
if (failures.length > 0) {
  console.error(failures.join('\\n'));
  process.exit(1);
}
console.log(JSON.stringify({ ok: true, packages: requirements.map((item) => item.packageName) }));
`, 'utf8');

  const result = await run(process.execPath, [checkerPath], { cwd: installRoot });
  if (result.code !== 0) {
    throw new Error([
      '[local-lime-agent-runtime-tarballs] export verification failed',
      result.stdout.trim(),
      result.stderr.trim(),
    ].filter(Boolean).join('\n'));
  }
}

const tempRoot = await mkdtemp(join(tmpdir(), 'content-studio-lime-agent-tarballs-'));
const packDir = join(tempRoot, 'packs');
const installRoot = join(tempRoot, 'install');
await mkdir(packDir, { recursive: true });
await mkdir(join(installRoot, 'node_modules', '@limecloud'), { recursive: true });

const packed = [];
for (const requirement of PACKAGE_REQUIREMENTS) {
  const packInfo = await packPackage(requirement, packDir);
  packed.push({ requirement, packInfo });
}

await installTarballs(packed, installRoot);
await linkPeerDependency('react', installRoot);
await linkPeerDependency('react-dom', installRoot);
await verifyInstalledExports(installRoot);

console.log([
  '[local-lime-agent-runtime-tarballs] ok local npm pack artifacts expose required AgentUI runtime exports.',
  `limePackagesRoot=${limePackagesRoot}`,
  `evidenceDir=${tempRoot}`,
  ...packed.map(({ requirement, packInfo }) => `${requirement.packageName}@${packInfo.version} ${packInfo.filename} entries=${packInfo.entryCount}`),
].join('\n'));
