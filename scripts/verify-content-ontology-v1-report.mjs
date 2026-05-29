import { readFile, mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeBaseUrl(value) {
  return normalizeText(value).replace(/\/+$/, '');
}

function cliValue(argv, name) {
  const prefix = `--${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

function cliFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function firstPositional(argv) {
  return argv.find((arg) => !arg.startsWith('--')) || '';
}

function isPlainObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isLocalUrl(value) {
  const text = normalizeText(value);
  if (!text) return false;
  try {
    const url = new URL(text);
    const host = url.hostname.toLowerCase();
    return host === 'localhost' || host === '0.0.0.0' || host === '::1' || host.startsWith('127.');
  } catch {
    return false;
  }
}

function isSha256(value) {
  return /^[a-fA-F0-9]{64}$/.test(normalizeText(value));
}

function sectionChecks(section) {
  return Array.isArray(section?.checks) ? section.checks : [];
}

function topCheckStatus(report, id) {
  return Array.isArray(report?.checks) ? report.checks.find((check) => check?.id === id)?.status || '' : '';
}

function hasFailedChecks(section) {
  return sectionChecks(section).some((check) => check?.status === 'failed');
}

function normalizeIdList(value) {
  return Array.isArray(value) ? value.map(normalizeText).filter(Boolean).sort() : [];
}

function sameIdList(left, right) {
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

function addIssue(issues, id, message, extra = {}) {
  issues.push({ id, message, ...extra });
}

function addWarning(warnings, id, message, extra = {}) {
  warnings.push({ id, message, ...extra });
}

function validateCommonShape(report, issues, warnings) {
  if (!isPlainObject(report)) {
    addIssue(issues, 'report-object', '报告必须是 JSON object。');
    return;
  }
  if (report.ok !== true) {
    addIssue(issues, 'report-ok', 'v1 在线验收总报告未通过，不能归档为通过记录。');
  }
  if (!Number.isFinite(Date.parse(report.generatedAt))) {
    addIssue(issues, 'generated-at', '报告缺少有效 generatedAt。');
  }
  if (!isPlainObject(report.target)) {
    addIssue(issues, 'target-object', '报告缺少 target 对象。');
  }
  if (!Array.isArray(report.checks) || !report.checks.length) {
    addIssue(issues, 'top-checks', '报告缺少顶层 checks。');
  }
  if (topCheckStatus(report, 'release-online-report') === 'skipped') {
    addWarning(warnings, 'release-skipped', '团队知识包在线验收被跳过。');
  }
  if (topCheckStatus(report, 'team-sharing-online-report') === 'skipped') {
    addWarning(warnings, 'team-skipped', '团队共享在线验收被跳过。');
  }
  if (hasFailedChecks(report.sections?.release)) {
    addIssue(issues, 'release-checks', '团队知识包在线验收包含失败检查。');
  }
  if (hasFailedChecks(report.sections?.team)) {
    addIssue(issues, 'team-checks', '团队共享在线验收包含失败检查。');
  }
}

function validateProductionReport(report, issues, warnings, options) {
  const target = report.target || {};
  const release = report.sections?.release || {};
  const team = report.sections?.team || {};
  const releasePackage = release.package || {};
  const teamWorkspace = team.workspace || {};
  const teamRelease = team.release || {};

  if (normalizeText(target.tenant) === '') {
    addIssue(issues, 'target-tenant', '生产归档报告必须包含 tenant。');
  }
  if (normalizeText(target.workspaceId) === '') {
    addIssue(issues, 'target-workspace', '生产归档报告必须包含 workspaceId。');
  }
  if (normalizeText(target.releaseId) === '') {
    addIssue(issues, 'target-release', '生产归档报告必须包含 releaseId。');
  }
  if (normalizeText(target.apiBaseUrl) === '' || isLocalUrl(target.apiBaseUrl)) {
    addIssue(issues, 'target-api-base-url', '生产归档报告不能使用 localhost / 127.0.0.1 API 地址。', {
      apiBaseUrl: target.apiBaseUrl,
    });
  }
  if (options.requireApiBaseUrl && normalizeBaseUrl(target.apiBaseUrl) !== normalizeBaseUrl(options.requireApiBaseUrl)) {
    addIssue(issues, 'target-api-base-url-match', `生产归档报告 API 地址必须是 ${options.requireApiBaseUrl}。`, {
      actual: target.apiBaseUrl,
    });
  }

  if (topCheckStatus(report, 'release-online-report') !== 'passed') {
    addIssue(issues, 'release-top-check', '生产归档必须通过团队知识包在线验收。');
  }
  if (topCheckStatus(report, 'team-sharing-online-report') !== 'passed') {
    addIssue(issues, 'team-top-check', '生产归档必须通过团队共享在线验收。');
  }
  if (release.ok !== true) {
    addIssue(issues, 'release-section-ok', '团队知识包在线验收 section 未通过。');
  }
  if (team.ok !== true) {
    addIssue(issues, 'team-section-ok', '团队共享在线验收 section 未通过。');
  }

  if (release.release?.id && normalizeText(target.releaseId) && release.release.id !== target.releaseId) {
    addIssue(issues, 'release-target-match', '团队知识包 release 与 target.releaseId 不一致。', {
      targetReleaseId: target.releaseId,
      releaseId: release.release.id,
    });
  }
  if (release.release?.status && release.release.status !== 'published') {
    addIssue(issues, 'release-status', `团队知识包状态不是 published：${release.release.status}`);
  }
  if (release.release?.approvalStatus && release.release.approvalStatus !== 'approved') {
    addIssue(issues, 'release-approval', `团队知识包确认状态不是 approved：${release.release.approvalStatus}`);
  }
  if (releasePackage.reachable !== true) {
    addIssue(issues, 'package-reachable', '团队知识包公开包未被证明可访问。');
  }
  if (!releasePackage.publicUrl || isLocalUrl(releasePackage.publicUrl)) {
    addIssue(issues, 'package-public-url', '生产归档报告必须包含非本地公开包地址。', {
      publicUrl: releasePackage.publicUrl,
    });
  }
  if (!isSha256(releasePackage.sha256)) {
    addIssue(issues, 'package-sha256', '生产归档报告必须包含 64 位十六进制团队知识包 sha256。');
  }
  if (!(Number(releasePackage.size) > 0)) {
    addIssue(issues, 'package-size', '生产归档报告必须包含大于 0 的团队知识包大小。');
  }

  if (!teamWorkspace.actorA?.id || !teamWorkspace.actorB?.id) {
    addIssue(issues, 'team-workspace-visible', '生产归档报告必须证明两个账号都能看到同一个工作区。');
  } else if (teamWorkspace.actorA.id !== teamWorkspace.actorB.id) {
    addIssue(issues, 'team-workspace-match', '两个账号看到的工作区 ID 不一致。', {
      actorA: teamWorkspace.actorA.id,
      actorB: teamWorkspace.actorB.id,
    });
  }
  if (!teamWorkspace.actorA?.currentRevision || !teamWorkspace.actorB?.currentRevision) {
    addIssue(issues, 'team-revision-present', '生产归档报告必须包含两账号看到的团队 revision。');
  }
  if (teamWorkspace.actorA?.currentRevision !== teamWorkspace.actorB?.currentRevision) {
    addIssue(issues, 'team-revision-match', '两个账号看到的团队版本不一致。', {
      actorA: teamWorkspace.actorA?.currentRevision,
      actorB: teamWorkspace.actorB?.currentRevision,
    });
  }
  if (!teamRelease.id) {
    addIssue(issues, 'team-release-visible', '生产归档报告必须证明团队默认知识包对团队账号可见。');
  } else if (normalizeText(target.releaseId) && teamRelease.id !== target.releaseId) {
    addIssue(issues, 'team-release-target-match', '团队共享 section 的默认知识包与 target.releaseId 不一致。', {
      targetReleaseId: target.releaseId,
      teamReleaseId: teamRelease.id,
    });
  }
  if (!isPlainObject(team.summaries?.actorA) || !isPlainObject(team.summaries?.actorB)) {
    addIssue(issues, 'team-summaries', '生产归档报告必须包含两账号审核任务和执行队列摘要。');
  } else {
    const summaryA = team.summaries.actorA;
    const summaryB = team.summaries.actorB;
    if (Number(summaryA.reviewTaskCount) !== Number(summaryB.reviewTaskCount)) {
      addIssue(issues, 'team-review-count-match', '两个账号看到的审核任务数量不一致。', {
        actorA: summaryA.reviewTaskCount,
        actorB: summaryB.reviewTaskCount,
      });
    }
    if (Number(summaryA.executionQueueCount) !== Number(summaryB.executionQueueCount)) {
      addIssue(issues, 'team-queue-count-match', '两个账号看到的执行队列数量不一致。', {
        actorA: summaryA.executionQueueCount,
        actorB: summaryB.executionQueueCount,
      });
    }
    const reviewIdsA = normalizeIdList(summaryA.reviewTaskIds);
    const reviewIdsB = normalizeIdList(summaryB.reviewTaskIds);
    const queueIdsA = normalizeIdList(summaryA.executionQueueIds);
    const queueIdsB = normalizeIdList(summaryB.executionQueueIds);
    if (!reviewIdsA.length && Number(summaryA.reviewTaskCount) > 0) {
      addIssue(issues, 'team-review-ids-present', '生产归档报告有审核任务数量，但缺少审核任务 ID 清单。');
    }
    if (!queueIdsA.length && Number(summaryA.executionQueueCount) > 0) {
      addIssue(issues, 'team-queue-ids-present', '生产归档报告有执行队列数量，但缺少执行队列 ID 清单。');
    }
    if (reviewIdsA.length || reviewIdsB.length) {
      if (!sameIdList(reviewIdsA, reviewIdsB)) {
        addIssue(issues, 'team-review-ids-match', '两个账号看到的审核任务 ID 清单不一致。', {
          actorA: reviewIdsA,
          actorB: reviewIdsB,
        });
      }
    }
    if (queueIdsA.length || queueIdsB.length) {
      if (!sameIdList(queueIdsA, queueIdsB)) {
        addIssue(issues, 'team-queue-ids-match', '两个账号看到的执行队列 ID 清单不一致。', {
          actorA: queueIdsA,
          actorB: queueIdsB,
        });
      }
    }
  }

  if (warnings.some((warning) => warning.id === 'release-skipped' || warning.id === 'team-skipped')) {
    addIssue(issues, 'skipped-section', '生产归档报告不能跳过 release 或 team 任一验收段。');
  }
}

export function validateContentOntologyV1Report(report, options = {}) {
  const issues = [];
  const warnings = [];
  validateCommonShape(report, issues, warnings);
  if (options.production) validateProductionReport(report, issues, warnings, options);
  return {
    ok: issues.length === 0,
    checkedAt: new Date().toISOString(),
    mode: options.production ? 'production' : 'shape',
    reportGeneratedAt: normalizeText(report?.generatedAt),
    target: report?.target || null,
    issues,
    warnings,
  };
}

function parseCliOptions(argv) {
  return {
    reportPath: cliValue(argv, 'report') || firstPositional(argv),
    production: cliFlag(argv, 'production'),
    requireApiBaseUrl: cliValue(argv, 'require-api-base-url') || '',
    output: cliValue(argv, 'output') || '',
    json: cliFlag(argv, 'json'),
  };
}

function printHumanResult(result) {
  console.log(`v1 验收报告校验：${result.ok ? '通过' : '未通过'}`);
  console.log(`模式：${result.mode}`);
  if (result.target?.workspaceId) console.log(`工作区：${result.target.workspaceId}`);
  if (result.target?.releaseId) console.log(`团队知识包：${result.target.releaseId}`);
  for (const issue of result.issues) console.log(`[失败] ${issue.message}`);
  for (const warning of result.warnings) console.log(`[注意] ${warning.message}`);
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliOptions(argv);
  if (!options.reportPath) {
    throw new Error('缺少参数：请提供 --report=docs/roadmap/ontology/v1/reports/<date>-online-acceptance.json。');
  }
  const reportPath = resolve(options.reportPath);
  const report = JSON.parse(await readFile(reportPath, 'utf-8'));
  const result = validateContentOntologyV1Report(report, options);
  if (options.output) {
    const outputPath = resolve(options.output);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
  }
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
