import { access, readFile, readdir } from 'node:fs/promises';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateContentOntologyV1Report } from './verify-content-ontology-v1-report.mjs';
import { V2_UX_COPY_AUDITS, buildV2UxCopyAudit } from './v2-ux-copy-audit.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(process.env.CONTENT_STUDIO_REPO_ROOT || resolve(scriptDir, '..'));
const defaultBuguRepoRoot = resolve(defaultRepoRoot, '..', '..', 'bugu', 'bugu');

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
  'scripts/content-public-url-policy.mjs',
  'scripts/verify-content-knowledge-release-online.mjs',
  'scripts/verify-content-team-sharing-online.mjs',
  'scripts/verify-content-ontology-v1-online.mjs',
  'scripts/verify-content-ontology-v1-report.mjs',
  'scripts/verify-content-ontology-v1-readiness.mjs',
];

const REQUIRED_IMPLEMENTATION_FILES = [
  'src/main/services/contentKnowledgeMapApplicationService.ts',
  'src/main/services/contentKnowledgeMapBuildRunStore.ts',
  'src/main/services/contentKnowledgeMapBuilder.ts',
  'src/main/services/contentMatrixRiskPolicy.ts',
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

const V1_USER_FACING_COPY_AUDIT_PATHS = [
  'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx',
  'src/renderer/src/components/modules/ContentReviewTasksModule.tsx',
  'src/renderer/src/components/modules/BrandCommandCenterModule.tsx',
  'src/renderer/src/components/modules/PromptWorkbenchModule.tsx',
  'src/renderer/src/components/modules/WorkflowFeatureModule.tsx',
];

const V1_DOCUMENT_STATUS_EXPECTATIONS = [
  ['docs/roadmap/ontology/v1/README.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/acceptance-plan.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/business-ui-contract.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/module-design.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/data-model.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/implementation-plan.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/workflow-integration.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/brand-content-command-system.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/brand-content-command-diagrams.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/server-integration-plan.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/team-sharing-plan.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/user-facing-language.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/completion-audit.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/prototype/README.md', 'Local Verified / Production Evidence Pending'],
  ['docs/roadmap/ontology/v1/reports/README.md', 'Archive Gate / Production Evidence Pending'],
];

const V1_DEPRECATED_STATUS_LANGUAGE = [
  ['first-cut', /第一刀/],
  ['unfinished', /仍未完成|尚未完成|尚未落地|未完成[:：]/],
  ['draft-first-status', /状态：.*(?:Draft|First)/],
  ['first-implementation', /First Implementation|First Team|First Field|First Prototype/i],
  ['continue-fill-production', /继续补齐/],
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

async function checkV1DocumentStatusGate(repoRoot, checks) {
  const mismatches = [];
  for (const [relativePath, expectedStatus] of V1_DOCUMENT_STATUS_EXPECTATIONS) {
    const content = await readFile(resolve(repoRoot, relativePath), 'utf-8');
    const actualStatus = content.match(/^状态：(.+)$/m)?.[1]?.trim() || '';
    if (actualStatus !== expectedStatus) {
      mismatches.push({ path: relativePath, expected: expectedStatus, actual: actualStatus || '(missing)' });
    }
  }
  addCheck(
    checks,
    'v1-document-status-gate',
    mismatches.length ? 'failed' : 'passed',
    mismatches.length
      ? 'v1 文档状态口径存在回退，必须保持本地已验证 / 生产证据待补边界。'
      : 'v1 文档状态口径已统一为本地已验证 / 生产证据待补。',
    mismatches.length ? { mismatches } : {},
  );
}

async function checkV1DocumentStatusLanguageGate(repoRoot, checks) {
  const issues = [];
  for (const relativePath of REQUIRED_DOCS.filter((path) => path.endsWith('.md'))) {
    const content = await readFile(resolve(repoRoot, relativePath), 'utf-8');
    for (const [id, pattern] of V1_DEPRECATED_STATUS_LANGUAGE) {
      const match = content.match(pattern);
      if (match) {
        issues.push({ path: relativePath, rule: id, text: match[0] });
      }
    }
  }
  addCheck(
    checks,
    'v1-document-status-language-gate',
    issues.length ? 'failed' : 'passed',
    issues.length
      ? 'v1 文档仍包含会把本地已验证误读为试点或未完成的历史状态措辞。'
      : 'v1 文档未出现试点式或未完成式历史状态措辞。',
    issues.length ? { issues } : {},
  );
}

async function checkV1FactSourceDocsGate(repoRoot, checks) {
  const files = {
    serverPlan: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/server-integration-plan.md'), 'utf-8'),
    teamSharing: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/team-sharing-plan.md'), 'utf-8'),
    acceptance: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
    implementation: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/implementation-plan.md'), 'utf-8'),
  };
  const required = [
    ['server-current-knowledge-maps', files.serverPlan.includes('content-knowledge-maps` 是团队版内容知识地图 current 服务端事实源')],
    ['server-current-build-runs', files.serverPlan.includes('content-build-runs` 是生成流程 current 服务端事实源')],
    ['server-current-command-centers', files.serverPlan.includes('content-command-centers` 是品牌内容作战系统 current 服务端事实源')],
    ['server-compat-queue-actions', files.serverPlan.includes('content-execution-queue') && files.serverPlan.includes('content-action-records') && files.serverPlan.includes('队列 / 行动旁路事实')],
    ['team-sharing-current-sources', files.teamSharing.includes('content-knowledge-maps') && files.teamSharing.includes('content-build-runs') && files.teamSharing.includes('content-command-centers') && files.teamSharing.includes('current 主事实源')],
    ['team-sharing-compat-boundary', files.teamSharing.includes('compat 旁路事实源') && files.teamSharing.includes('不能替代 `content-command-centers`')],
    ['acceptance-rejects-non-current-substitutes', files.acceptance.includes('不能只用本机 JSON、变更包、执行队列、行动记录或 release 元数据替代团队主事实源')],
    ['acceptance-command-center-compat-boundary', files.acceptance.includes('`content-execution-queue` 和 `content-action-records` 只作为队列 / 行动旁路事实') && files.acceptance.includes('不能替代完整作战系统快照')],
    ['audit-current-readback-boundary', files.audit.includes('不把 release、执行队列或行动记录旁路当作完整团队事实源')],
    ['implementation-report-gate-current-sources', files.implementation.includes('`content-knowledge-maps` 同清单') && files.implementation.includes('`content-build-runs` 同清单') && files.implementation.includes('`content-command-centers` 同清单')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'v1-fact-source-docs-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? 'v1 文档事实源口径缺少 current 主事实源或 compat 旁路边界。'
      : 'v1 文档已声明三类 current 主事实源和 compat 旁路边界。',
    missing.length ? { missing } : {},
  );
}

async function checkV1UserFacingCopyGate(repoRoot, checks) {
  const auditScript = await readFile(resolve(repoRoot, 'scripts/v2-ux-copy-audit.mjs'), 'utf-8');
  const functional = await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8');
  const acceptancePlan = await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8');
  const completionAudit = await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8');
  const v1CopyAudits = V2_UX_COPY_AUDITS.filter((audit) => V1_USER_FACING_COPY_AUDIT_PATHS.includes(audit.path));
  const copyAuditReport = await buildV2UxCopyAudit({ projectRoot: repoRoot, audits: v1CopyAudits });
  const required = [
    ['copy-audit-content-map', auditScript.includes("path: 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'")],
    ['copy-audit-review-tasks', auditScript.includes("path: 'src/renderer/src/components/modules/ContentReviewTasksModule.tsx'")],
    ['copy-audit-brand-command', auditScript.includes("path: 'src/renderer/src/components/modules/BrandCommandCenterModule.tsx'")],
    ['copy-audit-prompt-workbench', auditScript.includes("path: 'src/renderer/src/components/modules/PromptWorkbenchModule.tsx'")],
    ['copy-audit-workflow-runner', auditScript.includes("path: 'src/renderer/src/components/modules/WorkflowFeatureModule.tsx'") && auditScript.includes('...v1BusinessModuleRules()')],
    ['copy-audit-engineering-terms', auditScript.includes('visible-ontology-engineering-term') && auditScript.includes('PromptGroundingContext') && auditScript.includes('DecisionGate')],
    ['functional-runs-copy-audit', functional.includes('v2 UX 文案审计会阻断普通用户可见工程词回退') && functional.includes('buildV2UxCopyAudit()')],
    ['docs-ac13-copy-scope', acceptancePlan.includes('Prompt 工作台') && acceptancePlan.includes('SOP 执行页') && completionAudit.includes('Prompt 工作台和 SOP 执行页')],
    ['copy-audit-runs-v1-modules', copyAuditReport.summary.passed && copyAuditReport.summary.files === V1_USER_FACING_COPY_AUDIT_PATHS.length],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  const failures = copyAuditReport.checks.flatMap((check) => check.failures);
  addCheck(
    checks,
    'v1-user-facing-copy-gate',
    missing.length || failures.length ? 'failed' : 'passed',
    missing.length || failures.length
      ? 'v1 普通用户主路径文案门禁缺少模块覆盖、工程词规则、功能测试或文档证据。'
      : 'v1 普通用户主路径文案门禁已覆盖知识地图、审核台、品牌战情室、Prompt 工作台和 SOP 执行页。',
    {
      files: copyAuditReport.summary.files,
      rules: copyAuditReport.summary.rules,
      ...(missing.length ? { missing } : {}),
      ...(failures.length ? { failures } : {}),
    },
  );
}

async function checkTeamKnowledgePromptHandoff(repoRoot, checks) {
  const servicePath = resolve(repoRoot, 'src/main/services/contentTeamKnowledgePromptDraftService.ts');
  const rendererPath = resolve(repoRoot, 'src/renderer/src/app/useContentStudioApp.ts');
  const workflowRendererPath = resolve(repoRoot, 'src/renderer/src/components/modules/WorkflowFeatureModule.tsx');
  const moduleOutletPath = resolve(repoRoot, 'src/renderer/src/components/ModuleOutlet.tsx');
  const e2ePath = resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs');
  const functionalPath = resolve(repoRoot, 'tests/functional/content-flow.test.mjs');
  const files = {
    service: await readFile(servicePath, 'utf-8'),
    renderer: await readFile(rendererPath, 'utf-8'),
    workflowRenderer: await readFile(workflowRendererPath, 'utf-8'),
    moduleOutlet: await readFile(moduleOutletPath, 'utf-8'),
    e2e: await readFile(e2ePath, 'utf-8'),
    functional: await readFile(functionalPath, 'utf-8'),
  };
  const required = [
    ['service-main-action', files.service.includes('ContentTeamKnowledgePromptDraftService') && files.service.includes('local-team-knowledge-package-handoff')],
    ['service-published-release-gate', files.service.includes("release.status === 'published'")],
    ['service-map-release-scope', files.service.includes('belongsToMap')],
    ['service-boundary-copy', files.service.includes('不能把知识包标题、版本号或文件地址当成产品事实')],
    ['renderer-uses-main-action', files.renderer.includes('createTeamKnowledgePromptDraft({') && !files.renderer.includes('buildTeamKnowledgePromptContent')],
    ['e2e-clicks-package-action', files.e2e.includes('content-map-package-content button') && files.e2e.includes('BreezeGo Air 团队知识包 v1.4 / Prompt 依据')],
    ['functional-covers-main-service', files.functional.includes('团队知识包详情页交接会在主进程生成带版本依据的 Prompt 草稿')],
    ['sop-runner-release-picker', files.workflowRenderer.includes('workflow-team-release-picker') && files.workflowRenderer.includes('本次 SOP 口径版本') && files.workflowRenderer.includes('selectedTeamReleaseRef')],
    ['sop-controller-explicit-release', files.renderer.includes('teamKnowledgeRelease?: ContentKnowledgeReleaseReference | null') && files.renderer.includes('teamKnowledgeRelease === undefined')],
    ['sop-module-passes-releases', files.moduleOutlet.includes('teamKnowledgePackageVersions={app.contentKnowledgeReleases}') && files.moduleOutlet.includes('app.startWorkflowRun(definitionId, inputs, inputSourceIds, teamKnowledgeRelease)')],
    ['functional-covers-sop-explicit-release', files.functional.includes('SOP 执行可以显式选择团队知识包版本') && files.functional.includes('release-sop-selected-1')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'team-knowledge-prompt-handoff',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '团队知识包详情页到 Prompt 工作台的真实交接缺少主进程服务、门禁或回归证据。'
      : '团队知识包详情页到 Prompt 工作台的真实交接已有主进程服务和回归证据。',
    missing.length ? { missing } : {},
  );
}

async function checkTeamKnowledgeRefreshGate(repoRoot, checks) {
  const files = {
    module: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'), 'utf-8'),
    moduleOutlet: await readFile(resolve(repoRoot, 'src/renderer/src/components/ModuleOutlet.tsx'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    teamSharing: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/team-sharing-plan.md'), 'utf-8'),
    acceptance: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['module-exposes-refresh-action', files.module.includes('onRefreshTeamKnowledgeUpdates') && files.module.includes('拉取团队更新')],
    ['module-outlet-runs-refresh', files.moduleOutlet.includes('onRefreshTeamKnowledgeUpdates') && files.moduleOutlet.includes('app.refresh()') && files.moduleOutlet.includes('正在拉取团队更新')],
    ['e2e-injects-remote-release', files.e2e.includes('release-e2e-remote-refresh') && files.e2e.includes('远端团队更新包')],
    ['e2e-clicks-refresh-action', files.e2e.includes("filter({ hasText: '拉取团队更新' }).click()") && files.e2e.includes("remoteFiles")],
    ['docs-describe-refresh-gate', files.teamSharing.includes('拉取团队更新') && files.acceptance.includes('拉取团队更新') && files.audit.includes('拉取团队更新')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'team-knowledge-refresh-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '团队知识包远端更新拉取缺少真实按钮、刷新链路、点击级回归或文档证据。'
      : '团队知识包远端更新拉取已接入真实工作台刷新链路，并有点击级回归和文档证据。',
    missing.length ? { missing } : {},
  );
}

async function checkBuildRunDetailGate(repoRoot, checks) {
  const files = {
    module: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'), 'utf-8'),
    style: await readFile(resolve(repoRoot, 'src/renderer/src/styles/modules-command.css'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    acceptance: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['module-has-build-tab', files.module.includes("{ key: 'build', label: '生成流程' }") && files.module.includes('renderBuildRunDetailContent')],
    ['module-shows-step-recovery', files.module.includes('input.run.steps.map') && files.module.includes('step.title') && files.module.includes('step.message') && files.module.includes('补输入源') && files.module.includes('重新生成地图') && files.module.includes('生成审核任务')],
    ['style-has-build-detail', files.style.includes('.content-map-build-detail') && files.style.includes('.content-map-build-detail-steps')],
    ['e2e-clicks-build-tab', files.e2e.includes("filter({ hasText: '生成流程' }).click()") && files.e2e.includes("content-map-build-detail")],
    ['docs-describe-build-detail', files.acceptance.includes('生成流程') && files.audit.includes('生成流程')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'build-run-detail-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '内容知识地图生成流程详情缺少真实页签、步骤恢复路径、样式、点击级回归或文档证据。'
      : '内容知识地图生成流程详情已在真实工作台可见，并有步骤恢复路径和点击级回归。',
    missing.length ? { missing } : {},
  );
}

async function checkMatrixRowPrimaryActionGate(repoRoot, checks) {
  const files = {
    module: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'), 'utf-8'),
    appHook: await readFile(resolve(repoRoot, 'src/renderer/src/app/useContentStudioApp.ts'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    acceptance: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['renderer-status-driven-primary-action', files.module.includes('const primaryAction = rowReady') && files.module.includes("label: '生成 Prompt 草稿'") && files.module.includes("label: row.status === 'needs-evidence' ? '创建补证据任务' : '生成审核任务'")],
    ['renderer-blocks-non-ready-production-actions', files.module.includes('productionActionDisabled') && files.module.includes('先补证据或完成审核后再交给生产') && files.module.includes('!rowReady ? (')],
    ['review-task-action-enters-review-workbench', files.appHook.includes('async function generateContentReviewTasksForRows') && files.appHook.includes("setActiveModule('knowledge-review')")],
    ['e2e-covers-evidence-gap-primary-action', files.e2e.includes('办公室静音证据缺口') && files.e2e.includes('创建补证据任务') && files.e2e.includes('toBeDisabled()') && files.e2e.includes("'.content-review-workbench'") && files.e2e.includes('待补证据')],
    ['docs-describe-matrix-row-primary-action', files.acceptance.includes('矩阵行主动作已按当前状态收敛') && files.audit.includes('矩阵行状态化主动作')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'matrix-row-primary-action-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '矩阵行详情缺少状态化主动作、非 ready 生产动作拦截、审核台跳转、点击级回归或文档证据。'
      : '矩阵行详情已按状态提供唯一主动作，缺证据行进入审核台，非 ready 行不能直接交给生产。',
    missing.length ? { missing } : {},
  );
}

async function checkContentKnowledgeMapModelClickGate(repoRoot, checks) {
  const files = {
    appService: await readFile(resolve(repoRoot, 'src/main/services/contentKnowledgeMapApplicationService.ts'), 'utf-8'),
    builder: await readFile(resolve(repoRoot, 'src/main/services/contentKnowledgeMapBuilder.ts'), 'utf-8'),
    renderer: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    acceptance: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['service-calls-structured-task', files.appService.includes('generateJson') && files.appService.includes('buildContentKnowledgeMapModelPrompt') && files.appService.includes('contentKnowledgeMapModelSchema()') && files.builder.includes('generate_content_knowledge_map')],
    ['renderer-has-build-action', files.renderer.includes('生成内容知识地图') && files.renderer.includes('onBuildContentKnowledgeMap')],
    ['e2e-clicks-build-action', files.e2e.includes('内容知识地图页点击生成会调用真实结构化文字服务并显示模型矩阵') && files.e2e.includes("filter({ hasText: '生成内容知识地图' }).click()")],
    ['e2e-verifies-model-output', files.e2e.includes('模型生成卖点：通勤清爽补涂') && files.e2e.includes('模型生成痛点：担心补涂厚重') && files.e2e.includes('模型生成场景：通勤包内补涂')],
    ['e2e-verifies-business-inputs', files.e2e.includes('通勤防晒 SKU 表') && files.e2e.includes('通勤防晒评论原声') && files.e2e.includes('竞品防晒观察摘要') && files.e2e.includes('skuRowCount') && files.e2e.includes('competitorObservationCount')],
    ['e2e-verifies-build-run-and-request', files.e2e.includes('test-text-model') && files.e2e.includes('generate_content_knowledge_map') && files.e2e.includes('content-map-build-detail')],
    ['docs-describe-real-click-model-build', files.acceptance.includes('真实客户端已覆盖结构化模型生成点击链路') && files.acceptance.includes('手动粘贴 SKU 表') && files.audit.includes('结构化模型生成真实点击回归')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'content-knowledge-map-model-click-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '内容知识地图结构化模型生成缺少真实按钮、模型任务、生成流程、点击级回归或文档证据。'
      : '内容知识地图结构化模型生成已覆盖真实按钮、模型任务、生成流程、点击级回归和文档证据。',
    missing.length ? { missing } : {},
  );
}

async function checkAssetLibraryMaterialTaskGate(repoRoot, checks) {
  const files = {
    assetsModule: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/AssetsModule.tsx'), 'utf-8'),
    moduleOutlet: await readFile(resolve(repoRoot, 'src/renderer/src/components/ModuleOutlet.tsx'), 'utf-8'),
    appHook: await readFile(resolve(repoRoot, 'src/renderer/src/app/useContentStudioApp.ts'), 'utf-8'),
    style: await readFile(resolve(repoRoot, 'src/renderer/src/styles/modules-common.css'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    acceptance: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8'),
    workflow: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/workflow-integration.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['assets-module-exposes-coverage-task-action', files.assetsModule.includes('onGenerateContentMaterialTasksForCoverageRows') && files.assetsModule.includes('createMaterialTasksForCoverageLinks') && files.assetsModule.includes('创建补素材任务') && files.assetsModule.includes('补这个组合')],
    ['module-outlet-routes-coverage-targets', files.moduleOutlet.includes('onGenerateContentMaterialTasksForCoverageRows') && files.moduleOutlet.includes('app.generateContentMaterialTasksForCoverageRows') && files.moduleOutlet.includes('正在创建补素材任务')],
    ['app-hook-groups-by-map', files.appHook.includes('generateContentMaterialTasksForCoverageRows') && files.appHook.includes('groupedTargets') && files.appHook.includes("taskPurpose: 'material-supplement'") && files.appHook.includes("setActiveModule('knowledge-review')")],
    ['style-has-coverage-actions', files.style.includes('.asset-coverage-actions') && files.style.includes('.asset-coverage-section-head > div')],
    ['e2e-clicks-asset-library-material-task', files.e2e.includes("clickNavItem(page, '素材库')") && files.e2e.includes("filter({ hasText: '补这个组合' }).click()") && files.e2e.includes('assetLibraryMaterialTask')],
    ['docs-describe-asset-library-task', files.acceptance.includes('素材库详情') && files.workflow.includes('素材库详情') && files.audit.includes('素材库详情') && files.audit.includes('asset-library-material-task-gate')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'asset-library-material-task-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '素材库侧补素材任务缺少真实按钮、服务调用、审核台跳转、点击级回归或文档证据。'
      : '素材库详情页已能从真实覆盖组合创建补素材任务，并进入审核台形成可追溯任务。',
    missing.length ? { missing } : {},
  );
}

async function checkTeamSyncConflictResolutionGate(repoRoot, checks) {
  const files = {
    syncService: await readFile(resolve(repoRoot, 'src/main/services/contentWorkspaceSyncService.ts'), 'utf-8'),
    mergeHelper: await readFile(resolve(repoRoot, 'src/shared/contentSyncConflictMerge.ts'), 'utf-8'),
    renderer: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    functional: await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8'),
    acceptance: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8'),
    teamSharing: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/team-sharing-plan.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['service-matches-prefixed-affected-objects', files.syncService.includes('mapAffectedByConflict') && files.syncService.includes('`content-map:${map.id}`') && files.syncService.includes('`selling-point:${row.id}`') && files.syncService.includes('`scenario:${row.id}`')],
    ['merge-helper-produces-row-draft', files.mergeHelper.includes('buildContentSyncConflictMergeDraft') && files.mergeHelper.includes('manualReviewCount') && files.mergeHelper.includes('autoAppendCount')],
    ['renderer-shows-merge-draft-actions', files.renderer.includes('合并处理清单') && files.renderer.includes('保留团队内容') && files.renderer.includes('重新提交本机修改') && files.renderer.includes('按清单转人工确认')],
    ['e2e-clicks-conflict-resolution', files.e2e.includes('conflict-e2e-team-merge') && files.e2e.includes("getByRole('button', { name: '查看清单' }).click()") && files.e2e.includes("getByRole('button', { name: '按清单转人工确认' }).click()")],
    ['e2e-verifies-pending-sync-and-payload', files.e2e.includes("syncStatus: 'pending-sync'") && files.e2e.includes("payload.resolutionAction") && files.e2e.includes("payload.mergeDraft?.rows?.length")],
    ['functional-covers-conflict-merge-draft', files.functional.includes('同步冲突可以生成逐项合并处理清单') && files.functional.includes('resolveSyncConflict')],
    ['docs-describe-click-resolution', files.acceptance.includes('点击“查看清单”') && files.teamSharing.includes('真实客户端点击') && files.audit.includes('同步冲突真实客户端回归')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'team-sync-conflict-resolution-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '团队同步冲突处理缺少前缀对象匹配、合并清单、真实点击、服务端 payload 或文档证据。'
      : '团队同步冲突处理已覆盖合并清单真实点击、服务端处理 payload 和本机地图待同步回写。',
    missing.length ? { missing } : {},
  );
}

async function checkTeamOfflineChangeImportGate(repoRoot, checks) {
  const files = {
    renderer: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'), 'utf-8'),
    moduleOutlet: await readFile(resolve(repoRoot, 'src/renderer/src/components/ModuleOutlet.tsx'), 'utf-8'),
    appHook: await readFile(resolve(repoRoot, 'src/renderer/src/app/useContentStudioApp.ts'), 'utf-8'),
    ipc: await readFile(resolve(repoRoot, 'src/main/ipc.ts'), 'utf-8'),
    syncService: await readFile(resolve(repoRoot, 'src/main/services/contentWorkspaceSyncService.ts'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    acceptance: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8'),
    teamSharing: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/team-sharing-plan.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['renderer-exposes-import-action', files.renderer.includes('onImportTeamChangePackage') && files.renderer.includes('导入变更包')],
    ['module-outlet-routes-import-action', files.moduleOutlet.includes('onImportTeamChangePackage') && files.moduleOutlet.includes('app.importContentDraftChange') && files.moduleOutlet.includes('正在导入变更包')],
    ['app-hook-updates-local-draft', files.appHook.includes('async function importContentDraftChange') && files.appHook.includes('setContentDraftChanges') && files.appHook.includes("result.status !== 'imported'")],
    ['ipc-opens-real-package-picker', files.ipc.includes("ipcMain.handle('contentDraftChanges:import'") && files.ipc.includes("title: '选择内容变更包'") && files.ipc.includes("properties: ['openFile', 'openDirectory']")],
    ['service-validates-portable-package', files.syncService.includes("manifest.schema !== 'buguai.content-draft-change.v1'") && files.syncService.includes("syncStatus: 'local-draft'")],
    ['e2e-clicks-import-button', files.e2e.includes("getByRole('button', { name: '导入变更包', exact: true }).click()") && files.e2e.includes('__contentStudioE2EImportDialogCalls') && files.e2e.includes("离线变更包已导入")],
    ['docs-describe-real-import-click', files.acceptance.includes('点击“导入变更包”') && files.teamSharing.includes('点击“导入变更包”') && files.audit.includes('真实点击“导入变更包”')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'team-offline-change-import-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '离线变更包导入缺少真实按钮、IPC 文件选择、包校验、点击级回归或文档证据。'
      : '离线变更包导入已覆盖真实按钮、IPC 文件选择、包校验、点击级回归和文档证据。',
    missing.length ? { missing } : {},
  );
}

async function checkProductionHandoffGate(repoRoot, checks) {
  const files = {
    service: await readFile(resolve(repoRoot, 'src/main/services/contentProductionHandoffService.ts'), 'utf-8'),
    policy: await readFile(resolve(repoRoot, 'src/main/services/contentProductionHandoffPolicy.ts'), 'utf-8'),
    grounding: await readFile(resolve(repoRoot, 'src/main/services/promptGroundingAssembler.ts'), 'utf-8'),
    commandService: await readFile(resolve(repoRoot, 'src/main/services/brandCommandCenterApplicationService.ts'), 'utf-8'),
    renderer: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'), 'utf-8'),
    commandRenderer: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/BrandCommandCenterModule.tsx'), 'utf-8'),
    functional: await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    workflowDocs: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/workflow-integration.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['service-creates-three-targets', files.service.includes('promptDrafts.createFromContent') && files.service.includes('sceneCards.createFromContent') && files.service.includes('workflows.startRun')],
    ['service-map-scoped-release', files.service.includes("published.find((release) => release.contentKnowledgeMapId === map.id)") && !files.service.includes('|| published[0]')],
    ['service-blocked-action-record', files.service.includes("actionType: 'blocked'") && files.service.includes('appendToBrandCommandCenter')],
    ['policy-review-evidence-boundary', files.policy.includes("candidate.task.status === 'approved'") && files.policy.includes('candidate.readyEvidence.length') && files.policy.includes('isCompetitorMatrixRow') && files.policy.includes('contentMatrixRiskIssues')],
    ['grounding-minimal-context', files.grounding.includes('readyEvidence') && files.grounding.includes('clip(') && files.grounding.includes('sourceRefs')],
    ['renderer-row-actions', files.renderer.includes("onCreateHandoff(row.id, 'prompt-draft')") && files.renderer.includes("onCreateHandoff(row.id, 'scene-card')") && files.renderer.includes("onCreateHandoff(row.id, 'sop-run')")],
    ['brand-command-real-targets', files.commandService.includes("effectiveQueueItem.actionType === 'generate-prompt-draft'") && files.commandService.includes("effectiveQueueItem.actionType === 'create-scene-card'") && files.commandService.includes("effectiveQueueItem.actionType === 'launch-sop-run'")],
    ['brand-command-team-release-binding', (files.commandService.includes('selectTeamRelease(await this.releases.list(input.workspacePath), sourceMap)') || files.commandService.includes('selectTeamRelease(await releases.list(input.workspacePath), sourceMap)')) && files.commandService.includes('teamKnowledgeRelease: promptDraft?.teamKnowledgeRelease ?? workflowRun?.teamKnowledgeRelease ?? teamKnowledgeRelease') && files.commandService.includes("published.find((release) => release.contentKnowledgeMapId === map.id)")],
    ['renderer-shows-brand-command-team-release', files.commandRenderer.includes('record.teamKnowledgeRelease') && files.commandRenderer.includes('团队知识包：')],
    ['functional-covers-prompt-release', files.functional.includes('生产交接会把团队知识包版本绑定到 Prompt 草稿')],
    ['functional-covers-map-scoped-release', files.functional.includes('生产交接不会把其他内容知识地图的团队知识包误绑定到本机草稿')],
    ['functional-covers-sop-run', files.functional.includes('生产交接能把审核通过组合创建为 SOP 运行记录') && files.functional.includes('生产交接启动 SOP 会经过真实 WorkflowEngine 并生成步骤产物')],
    ['functional-covers-blocked-record', files.functional.includes('生产交接被发布检查拦截时也会写入行动记录')],
    ['functional-covers-brand-command-targets', files.functional.includes('品牌作战 create-scene-card 动作会生成真实场景卡并回填资源包') && files.functional.includes('品牌作战 launch-sop-run 动作会创建真实 SOP 运行并回填资源包')],
    ['functional-covers-brand-command-release-scope', files.functional.includes('品牌作战行动记录能追加到团队工作区') && files.functional.includes('品牌作战不会把其他内容知识地图的团队知识包误绑定到队列产物')],
    ['e2e-clicks-row-handoff', files.e2e.includes("filter({ hasText: '生成 Prompt 草稿' }).click()") && files.e2e.includes("filter({ hasText: '生成场景卡' }).click()") && files.e2e.includes("filter({ hasText: '启动 SOP' }).click()")],
    ['docs-audit-production-handoff', files.workflowDocs.includes('每次生产交接必须写行动记录') && files.audit.includes('生产交接闭环门禁')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'production-handoff-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '生产交接闭环缺少地图行交接、发布检查、团队知识包版本边界、真实下游产物、行动记录或回归证据。'
      : '生产交接闭环已覆盖地图行交接、发布检查、团队知识包版本边界、真实下游产物、行动记录和回归证据。',
    missing.length ? { missing } : {},
  );
}

async function checkContentMatrixRiskPolicy(repoRoot, checks) {
  const policy = await readFile(resolve(repoRoot, 'src/main/services/contentMatrixRiskPolicy.ts'), 'utf-8');
  const validator = await readFile(resolve(repoRoot, 'src/main/services/contentKnowledgeMapValidator.ts'), 'utf-8');
  const reviewBuilder = await readFile(resolve(repoRoot, 'src/main/services/contentReviewTaskBuilder.ts'), 'utf-8');
  const handoffPolicy = await readFile(resolve(repoRoot, 'src/main/services/contentProductionHandoffPolicy.ts'), 'utf-8');
  const functional = await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8');
  const required = [
    ['policy-ip-voice-drift', policy.includes('ip-voice-drift') && policy.includes('IP 口径漂移')],
    ['validator-uses-policy', validator.includes('contentMatrixRiskIssues')],
    ['review-builder-uses-policy', reviewBuilder.includes('contentMatrixRiskIssues')],
    ['handoff-uses-policy', handoffPolicy.includes('contentMatrixRiskIssues')],
    ['functional-covers-review-label', functional.includes("issueLabels.includes('IP 口径漂移')")],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'content-matrix-risk-policy',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '内容矩阵风险策略缺少共享实现或 IP 口径漂移回归证据。'
      : '内容矩阵风险策略已共享到校验、审核任务和生产交接，并覆盖 IP 口径漂移。',
    missing.length ? { missing } : {},
  );
}

async function checkAgentKnowledgeExportInterop(repoRoot, checks) {
  const exporter = await readFile(resolve(repoRoot, 'src/main/services/agentKnowledgeContentExportService.ts'), 'utf-8');
  const policy = await readFile(resolve(repoRoot, 'src/main/services/knowledgePackExportPolicy.ts'), 'utf-8');
  const renderer = await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'), 'utf-8');
  const e2e = await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8');
  const functional = await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8');
  const required = [
    ['export-material-coverage', exporter.includes('assets/material-coverage.json')],
    ['export-jsonld', exporter.includes('interop/ontology.jsonld')],
    ['export-turtle', exporter.includes('interop/ontology.ttl')],
    ['export-rdf', exporter.includes('interop/ontology.rdf')],
    ['export-preview-summary', exporter.includes('buildExportPreview') && exporter.includes('materialCoverageCount') && exporter.includes('interopFormats')],
    ['policy-checks-assets', policy.includes("entry.name.startsWith('assets/')")],
    ['policy-checks-interop', policy.includes("entry.name.startsWith('interop/')")],
    ['renderer-shows-export-preview', renderer.includes('本机预览内容') && renderer.includes('Agent Knowledge v') && renderer.includes('interopFormats.join')],
    ['functional-covers-material', functional.includes("exported.files.includes('assets/material-coverage.json')")],
    ['functional-covers-interop', functional.includes("exported.files.includes('interop/ontology.jsonld')") && functional.includes("exported.files.includes('interop/ontology.ttl')") && functional.includes("exported.files.includes('interop/ontology.rdf')")],
    ['e2e-covers-export-preview', e2e.includes('Agent Knowledge v0.7.2') && e2e.includes('JSON-LD / Turtle / RDF/XML') && e2e.includes('localPreviewTrace?.materialCoverageCount')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'agent-knowledge-export-interop',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? 'Agent Knowledge 高级导出缺少素材覆盖、互操作文件、客户端预览或回归证据。'
      : 'Agent Knowledge 高级导出已包含素材覆盖、JSON-LD / Turtle / RDF 互操作文件和客户端预览，并有回归证据。',
    missing.length ? { missing } : {},
  );
}

async function checkAgentKnowledgePackFilePreviewGate(repoRoot, checks) {
  const files = {
    exporter: await readFile(resolve(repoRoot, 'src/main/services/agentKnowledgeContentExportService.ts'), 'utf-8'),
    ipc: await readFile(resolve(repoRoot, 'src/main/ipc.ts'), 'utf-8'),
    preload: await readFile(resolve(repoRoot, 'src/preload/index.ts'), 'utf-8'),
    shared: await readFile(resolve(repoRoot, 'src/shared/types.ts'), 'utf-8'),
    appHook: await readFile(resolve(repoRoot, 'src/renderer/src/app/useContentStudioApp.ts'), 'utf-8'),
    moduleOutlet: await readFile(resolve(repoRoot, 'src/renderer/src/components/ModuleOutlet.tsx'), 'utf-8'),
    renderer: await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx'), 'utf-8'),
    style: await readFile(resolve(repoRoot, 'src/renderer/src/styles/modules-command.css'), 'utf-8'),
    functional: await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    acceptance: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/acceptance-plan.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['shared-api-contract', files.shared.includes('ReadContentKnowledgePackFileInput') && files.shared.includes('ContentKnowledgePackFilePreview') && files.shared.includes('readContentKnowledgePackFile(input: ReadContentKnowledgePackFileInput)')],
    ['exporter-read-service', files.exporter.includes('async readPackFile') && files.exporter.includes('normalizePackageRelativePath') && files.exporter.includes('getWorkspaceDataDir') && files.exporter.includes('pathInside') && files.exporter.includes('realpath') && files.exporter.includes('maxBytes') && files.exporter.includes('truncated')],
    ['exporter-blocks-unsafe-paths', files.exporter.includes('只能读取当前工作区生成的知识包预览文件') && files.exporter.includes('知识包文件路径越界') && files.exporter.includes('fileStat.isFile()')],
    ['ipc-read-file-handler', files.ipc.includes("ipcMain.handle('contentKnowledgePack:readFile'") && files.ipc.includes('agentKnowledgeContentExport.readPackFile(input)')],
    ['preload-exposes-read-file', files.preload.includes('readContentKnowledgePackFile') && files.preload.includes("ipcRenderer.invoke('contentKnowledgePack:readFile'")],
    ['app-hook-state-and-action', files.appHook.includes('contentKnowledgePackFilePreview') && files.appHook.includes('async function readContentKnowledgePackFile') && files.appHook.includes('setContentKnowledgePackFilePreview(result)')],
    ['module-outlet-routes-preview', files.moduleOutlet.includes('contentKnowledgePackFilePreview={app.contentKnowledgePackFilePreview}') && files.moduleOutlet.includes('onReadContentKnowledgePackFile') && files.moduleOutlet.includes('app.readContentKnowledgePackFile(input)')],
    ['renderer-file-list-and-preview', files.renderer.includes('orderPackagePreviewFiles') && files.renderer.includes('content-map-package-file-list') && files.renderer.includes('content-map-package-file-preview') && files.renderer.includes('compiled/prompt-grounding.md') && files.renderer.includes('assets/material-coverage.json') && files.renderer.includes('包内容详情')],
    ['style-scrolls-file-list-and-preview', files.style.includes('.content-map-package-file-list') && files.style.includes('max-height: 240px') && files.style.includes('.content-map-package-file-preview pre') && files.style.includes('max-height: 320px') && files.style.includes('overflow: auto')],
    ['functional-covers-real-file-read', files.functional.includes('exporter.readPackFile') && files.functional.includes("relativePath: 'compiled/prompt-grounding.md'") && files.functional.includes('轻薄不闷肤') && files.functional.includes('涉及防晒效果时必须引用检测或备案信息')],
    ['functional-covers-read-boundaries', files.functional.includes('../content-knowledge-maps.json') && files.functional.includes('packageDir: tmpdir()') && files.functional.includes('linked-secret.txt')],
    ['e2e-covers-file-switching', files.e2e.includes('content-map-package-file-list button') && files.e2e.includes('compiled/prompt-grounding.md') && files.e2e.includes('BreezeGo Air v1 真实工作台地图 提示词依据') && files.e2e.includes('assets/material-coverage.json') && files.e2e.includes('"materialRefs"')],
    ['docs-describe-file-preview-gate', files.acceptance.includes('高级导出页已支持真实包文件下钻') && files.acceptance.includes('contentKnowledgePack:readFile') && files.acceptance.includes('agent-knowledge-pack-file-preview-gate') && files.audit.includes('Agent Knowledge 包文件下钻门禁')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'agent-knowledge-pack-file-preview-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? 'Agent Knowledge 包文件真实下钻缺少安全读取 IPC、UI 切换、滚动预览、回归测试或文档门禁。'
      : 'Agent Knowledge 包文件真实下钻已覆盖安全读取 IPC、UI 切换、滚动预览、回归测试和文档门禁。',
    missing.length ? { missing } : {},
  );
}

async function checkBrandCommandMaterialGapList(repoRoot, checks) {
  const service = await readFile(resolve(repoRoot, 'src/main/services/brandCommandCenterApplicationService.ts'), 'utf-8');
  const shared = await readFile(resolve(repoRoot, 'src/shared/types.ts'), 'utf-8');
  const renderer = await readFile(resolve(repoRoot, 'src/renderer/src/components/modules/BrandCommandCenterModule.tsx'), 'utf-8');
  const adapter = await readFile(resolve(repoRoot, 'src/main/services/buguContentWorkspaceSyncAdapter.ts'), 'utf-8');
  const functional = await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8');
  const required = [
    ['service-writes-material-gap-package', service.includes('brand-command-material-gaps') && service.includes('material-gap-list.md') && service.includes('material-gap-list.json')],
    ['service-material-gap-schema', service.includes('buguai.brand-command.material-gap-list.v1')],
    ['shared-action-artifacts', shared.includes('artifactRefs?: string[]')],
    ['renderer-shows-artifacts', renderer.includes('交付物：') && renderer.includes('artifactRefs')],
    ['adapter-redacts-local-artifacts', adapter.includes('redactedLocalRefs') && adapter.includes('[本机工作区]')],
    ['functional-covers-material-gap-files', functional.includes('material-gap-list.json') && functional.includes('buguai.brand-command.material-gap-list.v1')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'brand-command-material-gap-list',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '品牌战情室补素材动作缺少真实交付文件、路径脱敏、UI 展示或回归证据。'
      : '品牌战情室补素材动作会生成真实补素材清单文件，行动记录可追溯且同步 payload 已脱敏。',
    missing.length ? { missing } : {},
  );
}

async function checkServerArtifactRefSafety(repoRoot, checks) {
  const serverPlan = await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/server-integration-plan.md'), 'utf-8');
  const audit = await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8');
  const reportVerifier = await readFile(resolve(repoRoot, 'scripts/verify-content-ontology-v1-report.mjs'), 'utf-8');
  const onlineVerifier = await readFile(resolve(repoRoot, 'scripts/verify-content-team-sharing-online.mjs'), 'utf-8');
  const functional = await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8');
  const required = [
    ['server-plan-docs-service-rejection', serverPlan.includes('content-action-records') && serverPlan.includes('artifactRefs') && serverPlan.includes('返回 `400`')],
    ['server-plan-docs-unsafe-patterns', serverPlan.includes('file://') && serverPlan.includes('api_key') && serverPlan.includes('token')],
    ['audit-records-service-evidence', audit.includes('Bugu 行动记录交付物服务端安全') && audit.includes('不可共享路径或凭证线索')],
    ['online-verifier-checks-unsafe-artifacts', onlineVerifier.includes('action-record-artifacts-safe') && onlineVerifier.includes('isUnsafeArtifactRef')],
    ['report-verifier-checks-unsafe-artifacts', reportVerifier.includes('team-action-artifact-refs-safe') && reportVerifier.includes('isUnsafeArtifactRef')],
    ['functional-covers-unsafe-artifacts', functional.includes('/Users/coso/private/material-gap-list.json') && functional.includes('material-gap-artifact-present')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'bugu-action-artifact-ref-safety',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? 'Bugu 行动记录交付物引用安全边界缺少服务端结论、在线验收或报告门禁证据。'
      : 'Bugu 行动记录交付物引用安全边界已有服务端结论、在线验收和报告门禁证据。',
    missing.length ? { missing } : {},
  );
}

async function checkBuguServerPolicyGate(repoRoot, checks, options = {}) {
  const buguRepoRoot = resolve(options.buguRepoRoot || defaultBuguRepoRoot);
  const servicePath = resolve(buguRepoRoot, 'workers/api-proxy/src/oem/content-workspace-service.mjs');
  if (!(await fileExists(servicePath))) {
    addCheck(
      checks,
      'bugu-server-policy-gate',
      'warning',
      '未找到本机 Bugu 仓库，跳过服务端策略代码校验。',
      { buguRepoRoot },
    );
    return;
  }
  const files = {
    service: await readFile(servicePath, 'utf-8'),
    route: await readFile(resolve(buguRepoRoot, 'workers/api-proxy/src/oem/service.mjs'), 'utf-8'),
    smoke: await readFile(resolve(buguRepoRoot, 'scripts/smoke-oem-service.mjs'), 'utf-8'),
    serverPlan: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/server-integration-plan.md'), 'utf-8'),
    teamSharing: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/team-sharing-plan.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
  };
  const required = [
    ['service-revision-policy', files.service.includes('baseRevisionConflict') && files.service.includes('ensureRevisionConflict') && files.service.includes('content workspace revision conflict')],
    ['service-release-idempotency', files.service.includes('contentKnowledgeReleases.find') && files.service.includes('if (existing) return draft')],
    ['service-release-role-policy', files.service.includes('RELEASE_REQUEST_ROLES') && files.service.includes('assertReleaseRole') && files.service.includes('content knowledge release publish permission required')],
    ['service-release-approval-role-policy', files.service.includes('RELEASE_APPROVER_ROLES') && files.service.includes('canApproveReleaseStep') && files.service.includes('content knowledge release approval permission required')],
    ['service-action-role-policy', files.service.includes('canAppendContentActionRecord') && files.service.includes('CONTENT_ACTION_ADMIN_ROLES') && files.service.includes('operator') && files.service.includes('viewer')],
    ['service-security-policy', files.service.includes('assertSafePayload(body)') && files.service.includes('normalizeArtifactRefs') && files.service.includes('content action artifact refs contain credentials or local absolute paths')],
    ['service-release-public-url-policy', files.service.includes('assertSafeReleasePackageStorage') && files.service.includes('content knowledge release package public url must be http/https public address')],
    ['route-passes-roles', files.route.includes("url.pathname === \"/api/v1/oem/content-knowledge-releases\"") && files.route.includes('roles: authorization.roles || []') && files.route.includes("url.pathname === \"/api/v1/oem/content-action-records\"")],
    ['smoke-release-idempotency', files.smoke.includes('content knowledge release idempotency changed revision')],
    ['smoke-release-revision-conflict', files.smoke.includes('content knowledge release revision conflict was accepted') && files.smoke.includes('content-release-smoke-conflict')],
    ['smoke-release-unsafe-payload', files.smoke.includes('unsafe content knowledge release payload was accepted') && files.smoke.includes('file:///Users/coso/private/agentknowledge.zip')],
    ['smoke-release-private-public-url', files.smoke.includes('private content knowledge release public URL was accepted') && files.smoke.includes('http://192.168.1.10/oem/content/private-url.zip')],
    ['smoke-release-viewer-denied', files.smoke.includes('viewer published content knowledge release') && files.smoke.includes('content-release-smoke-viewer-denied')],
    ['smoke-release-approval-roles', files.smoke.includes('viewer approved content knowledge release') && files.smoke.includes('reviewer approved content-lead release step')],
    ['smoke-action-role-and-security', files.smoke.includes('viewer appended content action record') && files.smoke.includes('unsafe content action artifact refs were accepted')],
    ['docs-server-policy-gate', files.serverPlan.includes('RevisionPolicy') && files.serverPlan.includes('IdempotencyPolicy') && files.serverPlan.includes('SecurityPolicy') && files.serverPlan.includes('RolePolicy') && files.serverPlan.includes('内网公开包地址')],
    ['docs-team-policy-boundary', files.teamSharing.includes('服务端 revision') && files.teamSharing.includes('业务角色') && files.teamSharing.includes('已发布 release 不能原地修改') && files.teamSharing.includes('内网公开包地址')],
    ['audit-policy-evidence', files.audit.includes('Bugu 服务端策略门禁') && files.audit.includes('release 创建权限、幂等、revision 冲突、安全 payload 和内网公开包地址')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'bugu-server-policy-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? 'Bugu 服务端策略缺少 revision、幂等、角色权限、安全边界、smoke 或文档证据。'
      : 'Bugu 服务端策略已覆盖 revision、幂等、角色权限、发布审批和安全边界，并有 smoke 与文档证据。',
    { buguRepoRoot, ...(missing.length ? { missing } : {}) },
  );
}

async function checkTeamReleaseListGate(repoRoot, checks) {
  const files = {
    releaseVerifier: await readFile(resolve(repoRoot, 'scripts/verify-content-knowledge-release-online.mjs'), 'utf-8'),
    ontologyOnlineVerifier: await readFile(resolve(repoRoot, 'scripts/verify-content-ontology-v1-online.mjs'), 'utf-8'),
    onlineVerifier: await readFile(resolve(repoRoot, 'scripts/verify-content-team-sharing-online.mjs'), 'utf-8'),
    reportVerifier: await readFile(resolve(repoRoot, 'scripts/verify-content-ontology-v1-report.mjs'), 'utf-8'),
    reportSchema: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/reports/v1-online-acceptance.schema.json'), 'utf-8'),
    reportReadme: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/reports/README.md'), 'utf-8'),
    publicUrlPolicy: await readFile(resolve(repoRoot, 'scripts/content-public-url-policy.mjs'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
    functional: await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8'),
  };
  const required = [
    ['public-url-policy-rejects-private-networks', files.publicUrlPolicy.includes('isNonPublicHostname') && files.publicUrlPolicy.includes('169 && second === 254') && files.publicUrlPolicy.includes('172 && second >= 16') && files.publicUrlPolicy.includes('192 && second === 168') && files.publicUrlPolicy.includes('0xfe00') && files.publicUrlPolicy.includes('0xffc0')],
    ['release-verifier-paginates-release-list', files.releaseVerifier.includes('fetchReleaseListFromBugu') && files.releaseVerifier.includes('limit, offset') && files.functional.includes('团队知识包在线验收脚本会分页查找指定 release')],
    ['release-verifier-requires-public-package-evidence', files.releaseVerifier.includes('requirePublicPackage') && files.releaseVerifier.includes('public-url-format') && files.releaseVerifier.includes('package-size-required') && files.releaseVerifier.includes('package-sha256-format') && files.ontologyOnlineVerifier.includes('requirePublicPackage: options.requirePublicPackage') && files.functional.includes('团队知识包在线验收要求生产公开包具备大小和 sha256') && files.functional.includes('团队知识包在线验收会拒绝非公网公开包地址') && files.functional.includes('http://192.168.1.10/packages/release.zip')],
    ['report-verifier-requires-public-package-http-url', files.reportVerifier.includes('isPublicHttpUrl') && files.reportVerifier.includes('http/https 公网公开包地址') && files.reportSchema.includes('"pattern": "^https?://') && files.reportSchema.includes('192\\\\.168') && files.functional.includes('file:///Users/coso/private/release-v1-online.zip') && files.functional.includes('http://10.0.0.8/packages/release-v1-online.zip')],
    ['report-schema-requires-public-api-url', /"apiBaseUrl"[\s\S]*?"pattern": "\^https\?:\/\//.test(files.reportSchema) && files.functional.includes('http://192.168.1.10:8787')],
    ['online-verifier-checks-release-list', files.onlineVerifier.includes('release-list-present') && files.onlineVerifier.includes('release-list-complete') && files.onlineVerifier.includes('release-list-match')],
    ['online-verifier-summarizes-release-list', files.onlineVerifier.includes('releaseSummaryA.listComplete') && files.onlineVerifier.includes('releaseIds: releaseSummaryA.ids')],
    ['report-verifier-checks-release-list', files.reportVerifier.includes('team-release-present') && files.reportVerifier.includes('team-release-list-complete') && files.reportVerifier.includes('team-release-ids-complete') && files.reportVerifier.includes('team-release-ids-match')],
    ['report-schema-requires-release-list', /"releaseCount"\s*:\s*\{\s*"type"\s*:\s*"number",\s*"exclusiveMinimum"\s*:\s*0/s.test(files.reportSchema) && files.reportSchema.includes('"releaseListComplete"') && files.reportSchema.includes('"releaseIds"')],
    ['report-readme-docs-release-list', files.reportReadme.includes('releaseListComplete') && files.reportReadme.includes('releaseIds') && files.reportReadme.includes('releaseCount') && files.reportReadme.includes('releaseCount` 必须一致且大于 0')],
    ['audit-docs-release-list-gate', files.audit.includes('releaseCount') && files.audit.includes('releaseListComplete') && files.audit.includes('team-release-present')],
    ['functional-covers-release-list', files.functional.includes('missingReleaseReport') && files.functional.includes('team-release-present') && files.functional.includes('mismatchedReleaseReport') && files.functional.includes('team-release-ids-match') && files.functional.includes('team-release-list-complete')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'team-release-list-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '团队知识包版本清单缺少 release 分页查找、公开包证据、在线验收、生产报告、schema、审计或回归门禁。'
      : '团队知识包版本清单已纳入 release 分页查找、公开包证据、在线验收、生产报告、schema、审计和回归门禁。',
    missing.length ? { missing } : {},
  );
}

async function checkTeamWorkflowPresenceGate(repoRoot, checks) {
  const files = {
    onlineVerifier: await readFile(resolve(repoRoot, 'scripts/verify-content-team-sharing-online.mjs'), 'utf-8'),
    reportVerifier: await readFile(resolve(repoRoot, 'scripts/verify-content-ontology-v1-report.mjs'), 'utf-8'),
    reportSchema: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/reports/v1-online-acceptance.schema.json'), 'utf-8'),
    reportReadme: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/reports/README.md'), 'utf-8'),
    audit: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/completion-audit.md'), 'utf-8'),
    functional: await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8'),
  };
  const required = [
    ['online-verifier-checks-team-workflow-presence', files.onlineVerifier.includes('review-task-list-present') && files.onlineVerifier.includes('execution-queue-list-present') && files.onlineVerifier.includes('action-record-list-present')],
    ['report-verifier-checks-team-workflow-presence', files.reportVerifier.includes('team-review-present') && files.reportVerifier.includes('team-queue-present') && files.reportVerifier.includes('team-action-present')],
    ['report-schema-requires-team-workflow-presence', /"reviewTaskCount"\s*:\s*\{\s*"type"\s*:\s*"number",\s*"exclusiveMinimum"\s*:\s*0/s.test(files.reportSchema) && /"executionQueueCount"\s*:\s*\{\s*"type"\s*:\s*"number",\s*"exclusiveMinimum"\s*:\s*0/s.test(files.reportSchema) && /"actionRecordCount"\s*:\s*\{\s*"type"\s*:\s*"number",\s*"exclusiveMinimum"\s*:\s*0/s.test(files.reportSchema)],
    ['report-readme-docs-team-workflow-presence', files.reportReadme.includes('reviewTaskCount') && files.reportReadme.includes('executionQueueCount') && files.reportReadme.includes('actionRecordCount') && files.reportReadme.includes('都必须大于 0')],
    ['audit-docs-team-workflow-gate', files.audit.includes('团队共享在线验收会拒绝空的团队审核任务和执行队列') && files.audit.includes('team-review-present') && files.audit.includes('team-queue-present') && files.audit.includes('team-action-present')],
    ['functional-covers-empty-team-workflow-online-gate', files.functional.includes('团队共享在线验收会拒绝空的团队审核任务和执行队列') && files.functional.includes('review-task-list-present') && files.functional.includes('execution-queue-list-present') && files.functional.includes('action-record-list-present')],
    ['functional-covers-team-workflow-report-gate', files.functional.includes('missingReviewReport') && files.functional.includes('team-review-present') && files.functional.includes('missingQueueReport') && files.functional.includes('team-queue-present') && files.functional.includes('team-action-present')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'team-workflow-presence-gate',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? '团队审核任务、执行队列和行动记录缺少非空在线验收、生产报告、schema、文档或回归门禁。'
      : '团队审核任务、执行队列和行动记录已作为 v1 必备团队业务事实纳入在线验收、生产报告、schema、文档和回归门禁。',
    missing.length ? { missing } : {},
  );
}

async function checkBuguKnowledgeMapFactSource(repoRoot, checks, options = {}) {
  const buguRepoRoot = resolve(options.buguRepoRoot || defaultBuguRepoRoot);
  const servicePath = resolve(buguRepoRoot, 'workers/api-proxy/src/oem/content-workspace-service.mjs');
  if (!(await fileExists(servicePath))) {
    addCheck(
      checks,
      'bugu-knowledge-map-fact-source',
      'warning',
      '未找到本机 Bugu 仓库，跳过知识地图 / 构建运行服务端事实源代码校验。',
      { buguRepoRoot },
    );
    return;
  }
  const files = {
    store: await readFile(resolve(buguRepoRoot, 'workers/api-proxy/src/oem/store.mjs'), 'utf-8'),
    service: await readFile(servicePath, 'utf-8'),
    route: await readFile(resolve(buguRepoRoot, 'workers/api-proxy/src/oem/service.mjs'), 'utf-8'),
    smoke: await readFile(resolve(buguRepoRoot, 'scripts/smoke-oem-service.mjs'), 'utf-8'),
    adapter: await readFile(resolve(repoRoot, 'src/main/services/buguContentWorkspaceSyncAdapter.ts'), 'utf-8'),
    appService: await readFile(resolve(repoRoot, 'src/main/services/contentKnowledgeMapApplicationService.ts'), 'utf-8'),
    onlineVerifier: await readFile(resolve(repoRoot, 'scripts/verify-content-team-sharing-online.mjs'), 'utf-8'),
    functional: await readFile(resolve(repoRoot, 'tests/functional/content-flow.test.mjs'), 'utf-8'),
    e2e: await readFile(resolve(repoRoot, 'tests/e2e/electron-app.spec.mjs'), 'utf-8'),
    commandService: await readFile(resolve(repoRoot, 'src/main/services/brandCommandCenterApplicationService.ts'), 'utf-8'),
    serverPlan: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/server-integration-plan.md'), 'utf-8'),
    moduleDesign: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/module-design.md'), 'utf-8'),
    teamSharingPlan: await readFile(resolve(repoRoot, 'docs/roadmap/ontology/v1/team-sharing-plan.md'), 'utf-8'),
  };
  const required = [
    ['bugu-store-arrays', files.store.includes('contentKnowledgeMaps') && files.store.includes('contentBuildRuns') && files.store.includes('contentCommandCenters')],
    ['bugu-service-serializers', files.service.includes('serializeKnowledgeMap') && files.service.includes('serializeBuildRun') && files.service.includes('serializeCommandCenter')],
    ['bugu-service-methods', files.service.includes('upsertKnowledgeMap') && files.service.includes('appendBuildRun') && files.service.includes('upsertCommandCenter')],
    ['bugu-routes', files.route.includes('/api/v1/oem/content-knowledge-maps') && files.route.includes('/api/v1/oem/content-build-runs') && files.route.includes('/api/v1/oem/content-command-centers')],
    ['bugu-smoke-covers-routes', files.smoke.includes('/api/v1/oem/content-knowledge-maps') && files.smoke.includes('/api/v1/oem/content-build-runs') && files.smoke.includes('/api/v1/oem/content-command-centers')],
    ['desktop-adapter-covers-routes', files.adapter.includes("post<BuguContentKnowledgeMapResult>('content-knowledge-maps'") && files.adapter.includes("post<BuguContentBuildRunResult>('content-build-runs'") && files.adapter.includes("post<BuguContentCommandCenterResult>('content-command-centers'")],
    ['desktop-adapter-pulls-current-sources', files.adapter.includes('async listKnowledgeMaps') && files.adapter.includes('async listBuildRuns') && files.adapter.includes('async listCommandCenters') && files.adapter.includes("this.listItems<BuguContentKnowledgeMap>('content-knowledge-maps'") && files.adapter.includes("this.listItems<BuguContentBuildRun>('content-build-runs'") && files.adapter.includes("this.listItems<BuguContentCommandCenter>('content-command-centers'")],
    ['desktop-app-service-syncs', files.appService.includes('upsertKnowledgeMapSnapshot') && files.appService.includes('appendBuildRun') && files.commandService.includes('upsertCommandCenterSnapshot')],
    ['desktop-list-refreshes-current-sources', files.appService.includes('refreshTeamKnowledgeMaps') && files.appService.includes('refreshTeamBuildRuns') && files.commandService.includes('refreshTeamCommandCenters')],
    ['online-verifier-requires-current-source-presence', files.onlineVerifier.includes('knowledge-map-list-present') && files.onlineVerifier.includes('build-run-list-present') && files.onlineVerifier.includes('command-center-list-present')],
    ['functional-covers-sync', files.functional.includes('内容知识地图构建会同步地图快照和生成流程到团队事实源')],
    ['functional-covers-current-source-pull', files.functional.includes('内容知识地图列表会从 Bugu current 事实源刷新团队地图和生成流程') && files.functional.includes('品牌战情室列表会从 Bugu current 事实源刷新完整作战系统快照')],
    ['functional-covers-empty-current-source-online-gate', files.functional.includes('团队共享在线验收会拒绝空的团队主事实源清单') && files.functional.includes('knowledge-map-list-present') && files.functional.includes('build-run-list-present') && files.functional.includes('command-center-list-present')],
    ['e2e-covers-click-sync-routes', files.e2e.includes('content-knowledge-maps') && files.e2e.includes('content-build-runs') && files.e2e.includes('content-command-centers') && files.e2e.includes('CONTENT_STUDIO_BUGU_CONTENT_API_TOKEN') && files.e2e.includes("request.route === 'content-knowledge-maps'") && files.e2e.includes("request.route === 'content-build-runs'") && files.e2e.includes("request.route === 'content-command-centers'")],
    ['e2e-covers-click-current-source-pull', files.e2e.includes('远端团队内容地图') && files.e2e.includes('远端团队生成流程') && files.e2e.includes('远端团队品牌作战系统') && files.e2e.includes("route === 'content-knowledge-maps' && request.workspaceId === 'workspace-e2e-content' && request.limit === '100'") && files.e2e.includes("route === 'content-build-runs' && request.workspaceId === 'workspace-e2e-content' && request.limit === '100'") && files.e2e.includes("route === 'content-command-centers' && request.workspaceId === 'workspace-e2e-content' && request.limit === '100'")],
    ['e2e-covers-command-center-snapshot-actions', files.e2e.includes('等待 Bugu 品牌作战系统快照包含三类主动作') && files.e2e.includes('等待 Bugu 品牌作战系统快照包含三类真实队列交付') && files.e2e.includes('confirm-objectives') && files.e2e.includes('confirm-resource-bundles') && files.e2e.includes('sync-execution-queue') && files.e2e.includes('generate-prompt-draft') && files.e2e.includes('create-scene-card') && files.e2e.includes('launch-sop-run') && files.e2e.includes('write-back-material-coverage') && files.e2e.includes('sceneCardId') && files.e2e.includes('workflowRunId') && files.e2e.includes('materialCoverageChangeId') && files.e2e.includes('review-action-records') && files.e2e.includes('export-action-records')],
    ['review-feedback-not-only-action-record', files.commandService.includes('buildReviewFeedbackDraft') && files.commandService.includes('行动记录复盘') && files.commandService.includes('syncExecutionQueue') && files.functional.includes('品牌战情室行动记录复盘会写入本机并同步团队记录') && files.functional.includes('复盘补资源队列已同步') && files.e2e.includes('等待 Bugu 品牌作战系统快照包含复盘反馈信号和补素材队列') && files.e2e.includes('复盘创建补素材清单') && files.e2e.includes('待补资源')],
    ['command-center-current-local-newer-guard', files.commandService.includes('useLocalCommandSnapshot') && files.functional.includes('品牌战情室团队事实源刷新不会覆盖本机已同步的更新快照')],
    ['functional-covers-command-center-sync', files.functional.includes('品牌战情室生成后能同步执行队列到团队工作区') && files.functional.includes('品牌内容作战系统已同步到测试团队事实源')],
    ['docs-state-current-source', files.serverPlan.includes('content-knowledge-maps') && files.serverPlan.includes('content-build-runs') && files.serverPlan.includes('content-command-centers') && files.moduleDesign.includes('current 服务端事实源')],
    ['docs-team-sharing-current-sources', files.teamSharingPlan.includes('content-knowledge-maps') && files.teamSharingPlan.includes('content-build-runs') && files.teamSharingPlan.includes('content-command-centers') && files.teamSharingPlan.includes('两账号必须分页完整看到非空且同一批知识地图、构建运行、品牌作战系统')],
  ];
  const missing = required.filter(([, ok]) => !ok).map(([id]) => id);
  addCheck(
    checks,
    'bugu-knowledge-map-fact-source',
    missing.length ? 'failed' : 'passed',
    missing.length
      ? 'Bugu 知识地图 / 构建运行 / 品牌作战系统服务端事实源缺少路由、存储、适配器、回归或文档证据。'
      : 'Bugu 知识地图 / 构建运行 / 品牌作战系统已成为 current 服务端事实源，并有桌面适配器和回归证据。',
    { buguRepoRoot, ...(missing.length ? { missing } : {}) },
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
  await checkV1DocumentStatusGate(repoRoot, checks);
  await checkV1DocumentStatusLanguageGate(repoRoot, checks);
  await checkV1FactSourceDocsGate(repoRoot, checks);
  await checkV1UserFacingCopyGate(repoRoot, checks);
  await checkTeamKnowledgePromptHandoff(repoRoot, checks);
  await checkTeamKnowledgeRefreshGate(repoRoot, checks);
  await checkBuildRunDetailGate(repoRoot, checks);
  await checkMatrixRowPrimaryActionGate(repoRoot, checks);
  await checkContentKnowledgeMapModelClickGate(repoRoot, checks);
  await checkAssetLibraryMaterialTaskGate(repoRoot, checks);
  await checkTeamSyncConflictResolutionGate(repoRoot, checks);
  await checkTeamOfflineChangeImportGate(repoRoot, checks);
  await checkProductionHandoffGate(repoRoot, checks);
  await checkContentMatrixRiskPolicy(repoRoot, checks);
  await checkAgentKnowledgeExportInterop(repoRoot, checks);
  await checkAgentKnowledgePackFilePreviewGate(repoRoot, checks);
  await checkBrandCommandMaterialGapList(repoRoot, checks);
  await checkServerArtifactRefSafety(repoRoot, checks);
  await checkBuguServerPolicyGate(repoRoot, checks, {
    buguRepoRoot: options.buguRepoRoot,
  });
  await checkTeamReleaseListGate(repoRoot, checks);
  await checkTeamWorkflowPresenceGate(repoRoot, checks);
  await checkBuguKnowledgeMapFactSource(repoRoot, checks, {
    buguRepoRoot: options.buguRepoRoot,
  });
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
    buguRepoRoot: cliValue(argv, 'bugu-repo-root') || defaultBuguRepoRoot,
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
