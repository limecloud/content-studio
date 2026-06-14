import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const limePackagesRoot = resolve(
  process.env.CONTENT_STUDIO_LIME_PACKAGES_ROOT
    ?? resolve(projectRoot, '../../aiclientproxy/lime/packages'),
);

const PACKAGE_SPECS = [
  { name: '@limecloud/agent-ui-contracts', localDir: 'agent-ui-contracts' },
  { name: '@limecloud/agent-runtime-projection', localDir: 'agent-runtime-projection' },
  { name: '@limecloud/agent-runtime-ui', localDir: 'agent-runtime-ui' },
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

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function registryHasExactVersion(packageName, version) {
  const result = await run(command('npm'), ['view', `${packageName}@${version}`, 'version', '--json']);
  if (result.code === 0) return { exists: true, detail: result.stdout.trim() };

  const output = `${result.stdout}\n${result.stderr}`;
  if (/E404|404|not in this registry|No match found/i.test(output)) {
    return { exists: false, detail: 'not published' };
  }

  throw new Error([
    `${packageName}@${version}: npm registry lookup failed`,
    result.stdout.trim(),
    result.stderr.trim(),
  ].filter(Boolean).join('\n'));
}

const packages = [];
for (const spec of PACKAGE_SPECS) {
  const manifestPath = resolve(limePackagesRoot, spec.localDir, 'package.json');
  const manifest = await readJson(manifestPath);
  if (manifest.name !== spec.name) {
    throw new Error(`${manifestPath}: expected ${spec.name}, got ${manifest.name}`);
  }
  packages.push({
    dir: spec.localDir,
    manifestPath,
    name: manifest.name,
    version: manifest.version,
    dependencies: {
      ...(manifest.dependencies ?? {}),
      ...(manifest.devDependencies ?? {}),
      ...(manifest.peerDependencies ?? {}),
    },
  });
}

const byName = new Map(packages.map((item) => [item.name, item]));
const issues = [];
const rows = [];
const dependencyRows = [];

for (const item of packages) {
  const exact = await registryHasExactVersion(item.name, item.version);
  rows.push(`${item.name}@${item.version}: ${exact.exists ? 'version already exists on npmjs' : 'version is free on npmjs'}`);
  if (exact.exists) {
    issues.push(`${item.name}@${item.version} 已存在于 npmjs；必须升版本后才能发布包含新标准 exports 的包。`);
  }

  for (const [dependencyName, dependencyVersion] of Object.entries(item.dependencies)) {
    const localDependency = byName.get(dependencyName);
    if (!localDependency) continue;
    dependencyRows.push(`${item.name} -> ${dependencyName}@${dependencyVersion}`);
    if (dependencyVersion !== localDependency.version) {
      issues.push(`${item.name} 依赖 ${dependencyName}@${dependencyVersion}，但本地待发布版本是 ${localDependency.version}。`);
    }
  }
}

if (issues.length > 0) {
  console.error([
    '[lime-agent-runtime-npm-publish-readiness] blocked',
    `limePackagesRoot=${limePackagesRoot}`,
    `plannedPublishOrder=${packages.map((item) => `${item.name}@${item.version}`).join(' -> ')}`,
    ...rows.map((row) => `- ${row}`),
    ...dependencyRows.map((row) => `- ${row}`),
    '',
    ...issues.map((issue) => `- ${issue}`),
    '',
    '本脚本只做只读 npmjs 预检，不执行 npm publish。',
  ].join('\n'));
  process.exit(1);
}

console.log([
  '[lime-agent-runtime-npm-publish-readiness] ok package versions are publishable on npmjs.',
  `limePackagesRoot=${limePackagesRoot}`,
  `plannedPublishOrder=${packages.map((item) => `${item.name}@${item.version}`).join(' -> ')}`,
  ...rows.map((row) => `- ${row}`),
  ...dependencyRows.map((row) => `- ${row}`),
].join('\n'));
