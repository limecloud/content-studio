import { access, readFile, readdir } from 'node:fs/promises';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateContentOntologyV1Report } from './verify-content-ontology-v1-report.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, '..');

const REQUIRED_DOCS = [
  'docs/roadmap/ontology/v1/README.md',
  'docs/roadmap/ontology/v1/acceptance-plan.md',
  'docs/roadmap/ontology/v1/business-ui-contract.md',
  'docs/roadmap/ontology/v1/module-design.md',
  'docs/roadmap/ontology/v1/data-model.md',
  'docs/roadmap/ontology/v1/implementation-plan.md',
  'docs/roadmap/ontology/v1/workflow-integration.md',
  'docs/roadmap/ontology/v1/brand-content-command-system.md',
  'docs/roadmap/ontology/v1/brand-content-command-diagrams.md',
  'docs/roadmap/ontology/v1/server-integration-plan.md',
  'docs/roadmap/ontology/v1/team-sharing-plan.md',
  'docs/roadmap/ontology/v1/user-facing-language.md',
  'docs/roadmap/ontology/v1/completion-audit.md',
  'docs/roadmap/ontology/v1/prototype/README.md',
  'docs/roadmap/ontology/v1/prototype/index.html',
  'docs/roadmap/ontology/v1/reports/README.md',
  'docs/roadmap/ontology/v1/reports/v1-online-acceptance.schema.json',
];

const REQUIRED_SCRIPTS = [
  'scripts/verify-content-knowledge-release-online.mjs',
  'scripts/verify-content-team-sharing-online.mjs',
  'scripts/verify-content-ontology-v1-online.mjs',
  'scripts/verify-content-ontology-v1-report.mjs',
  'scripts/verify-content-ontology-v1-readiness.mjs',
];

const REQUIRED_IMPLEMENTATION_FILES = [
  'src/main/services/contentKnowledgeMapApplicationService.ts',
  'src/main/services/contentKnowledgeMapBuilder.ts',
  'src/main/services/contentKnowledgeMapValidator.ts',
  'src/main/services/contentReviewTaskApplicationService.ts',
  'src/main/services/contentProductionHandoffService.ts',
  'src/main/services/contentMaterialFeedbackService.ts',
  'src/main/services/brandCommandCenterApplicationService.ts',
  'src/main/services/brandCommandExecutionPolicy.ts',
  'src/main/services/contentWorkspaceSyncService.ts',
  'src/main/services/agentKnowledgeContentExportService.ts',
  'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx',
  'src/renderer/src/components/modules/ContentReviewTasksModule.tsx',
  'src/renderer/src/components/modules/BrandCommandCenterModule.tsx',
  'tests/functional/content-flow.test.mjs',
];

const REQUIRED_PACKAGE_SCRIPTS = [
  'content:release:verify-online',
  'content:team:verify-online',
  'content:v1:verify-online',
  'content:v1:verify-report',
  'content:v1:verify-readiness',
];

const FORBIDDEN_PROTOTYPE_PATTERNS = [
  ['static-feedback', /静态原型反馈/],
  ['todo', /\bTODO\b|未实现|placeholder|lorem|coming soon/i],
  ['ontology-term', /\bOntology\b|\bConcept\b|\bRelation\b|\bCoverageMatrix\b|\bPromptGroundingContext\b|\bDecisionGate\b|\bActionLog\b|\bDraftChange\b/],
  ['runtime-term', /\bblocked\b|\bProvider\b|\bmanifest\b/],
];

function cliValue(argv, name) {
  const prefix = `--${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

function cliFlag(argv, name) {
  return argv.includes(`--${name}`);
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function addCheck(checks, id, status, message, extra = {}) {
  checks.push({ id, status, message, ...extra });
}

async function checkRequiredPaths(repoRoot, checks, paths, id, label) {
  const missing = [];
  for (const relativePath of paths) {
    if (!(await fileExists(resolve(repoRoot, relativePath)))) missing.push(relativePath);
  }
  addCheck(
    checks,
    id,
    missing.length ? 'failed' : 'passed',
    missing.length ? `${label} 缺失 ${missing.length} 个文件。` : `${label} 已齐全。`,
    missing.length ? { missing } : {},
  );
}

async function checkPackageScripts(repoRoot, checks) {
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf-8'));
  const missing = REQUIRED_PACKAGE_SCRIPTS.filter((name) => !packageJson.scripts?.[name]);
  addCheck(
    checks,
    'package-scripts',
    missing.length ? 'failed' : 'passed',
    missing.length ? `package.json 缺少 ${missing.length} 个 v1 脚本。` : 'package.json v1 脚本已齐全。',
    missing.length ? { missing } : {},
  );
  const verifyLocal = String(packageJson.scripts?.['verify:local'] || '');
  addCheck(
    checks,
    'verify-local-includes-readiness',
    verifyLocal.includes('content:v1:verify-readiness') ? 'passed' : 'failed',
    verifyLocal.includes('content:v1:verify-readiness')
      ? 'verify:local 已接入 v1 readiness gate。'
      : 'verify:local 未接入 v1 readiness gate。',
    { verifyLocal },
  );
}

async function checkPrototypeCopy(repoRoot, checks) {
  const prototypePath = resolve(repoRoot, 'docs/roadmap/ontology/v1/prototype/index.html');
  const html = await readFile(prototypePath, 'utf-8');
  const issues = [];
  for (const [id, pattern] of FORBIDDEN_PROTOTYPE_PATTERNS) {
    if (pattern.test(html)) issues.push(id);
  }
  addCheck(
    checks,
    'prototype-copy',
    issues.length ? 'failed' : 'passed',
    issues.length ? 'v1 HTML 原型仍包含普通用户禁用工程词或占位文案。' : 'v1 HTML 原型未命中普通用户禁用工程词和占位文案。',
    issues.length ? { issues } : {},
  );
}

async function checkCompletionAudit(repoRoot, checks) {
  const audit = await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8');
  const requiredTexts = [
    'Local Verified / Production Evidence Pending',
    '不能标记为生产完成',
    'content:v1:verify-online',
    'content:v1:verify-report',
    'AC-12',
    'Production Pending',
  ];
  const missing = requiredTexts.filter((text) => !audit.includes(text));
  addCheck(
    checks,
    'completion-audit',
    missing.length ? 'failed' : 'passed',
    missing.length ? '完成度审计缺少关键完成门槛。' : '完成度审计已声明本地 / 生产证据边界。',
    missing.length ? { missing } : {},
  );
}

async function checkReportArchive(repoRoot, checks, options) {
  const reportsDir = resolve(repoRoot, 'docs/roadmap/ontology/v1/reports');
  const files = (await readdir(reportsDir)).filter((file) => /^\d{4}-\d{2}-\d{2}.*online-acceptance.*\.json$/.test(file));
  if (!files.length) {
    addCheck(
      checks,
      'production-report',
      options.requireProductionReport ? 'failed' : 'warning',
      options.requireProductionReport
        ? '缺少真实线上 v1 验收报告。'
        : '未发现真实线上 v1 验收报告；本地 readiness 允许继续，但不能宣称生产完成。',
    );
    return;
  }
  const reportPath = resolve(reportsDir, files.sort().at(-1));
  const report = JSON.parse(await readFile(reportPath, 'utf-8'));
  const validation = validateContentOntologyV1Report(report, {
    production: true,
    requireApiBaseUrl: options.requireApiBaseUrl,
  });
  addCheck(
    checks,
    'production-report',
    validation.ok ? 'passed' : 'failed',
    validation.ok ? '最新线上 v1 验收报告通过生产归档校验。' : '最新线上 v1 验收报告未通过生产归档校验。',
    { reportPath, issues: validation.issues, warnings: validation.warnings },
  );
}

export async function verifyContentOntologyV1Readiness(options = {}) {
  const repoRoot = resolve(options.repoRoot || defaultRepoRoot);
  const checks = [];
  await checkRequiredPaths(repoRoot, checks, REQUIRED_DOCS, 'required-docs', 'v1 文档');
  await checkRequiredPaths(repoRoot, checks, REQUIRED_SCRIPTS, 'required-scripts', 'v1 验证脚本');
  await checkRequiredPaths(repoRoot, checks, REQUIRED_IMPLEMENTATION_FILES, 'required-implementation-files', 'v1 实现文件');
  await checkPackageScripts(repoRoot, checks);
  await checkPrototypeCopy(repoRoot, checks);
  await checkCompletionAudit(repoRoot, checks);
  await checkReportArchive(repoRoot, checks, {
    requireProductionReport: Boolean(options.requireProductionReport),
    requireApiBaseUrl: options.requireApiBaseUrl || 'https://api.bugu.run',
  });
  return {
    ok: !checks.some((check) => check.status === 'failed'),
    checkedAt: new Date().toISOString(),
    mode: options.requireProductionReport ? 'production-required' : 'local-readiness',
    repoRoot,
    checks,
  };
}

function printHumanResult(result) {
  console.log(`Ontology v1 readiness：${result.ok ? '通过' : '未通过'}`);
  console.log(`模式：${result.mode}`);
  for (const check of result.checks) {
    const prefix = check.status === 'passed' ? '[通过]' : check.status === 'warning' ? '[注意]' : '[失败]';
    console.log(`${prefix} ${check.message}`);
  }
}

function parseCliOptions(argv) {
  return {
    repoRoot: cliValue(argv, 'repo-root') || defaultRepoRoot,
    requireProductionReport: cliFlag(argv, 'require-production-report'),
    requireApiBaseUrl: cliValue(argv, 'require-api-base-url') || 'https://api.bugu.run',
    json: cliFlag(argv, 'json'),
  };
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliOptions(argv);
  const result = await verifyContentOntologyV1Readiness(options);
  if (options.json) console.log(JSON.stringify(result, null, 2));
  else printHumanResult(result);
  if (!result.ok) process.exitCode = 1;
  return result;
}

const cliEntry = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (cliEntry === import.meta.url) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
