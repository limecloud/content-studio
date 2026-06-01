import { readFile, mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isPublicHttpUrl } from './content-public-url-policy.mjs';

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

function normalizeRefsByRecordId(value) {
  if (!isPlainObject(value)) return {};
  const normalized = {};
  for (const [recordId, refs] of Object.entries(value)) {
    const id = normalizeText(recordId);
    const refList = normalizeIdList(refs);
    if (id && refList.length) normalized[id] = refList;
  }
  return normalized;
}

function sameIdList(left, right) {
  if (left.length !== right.length) return false;
  return left.every((id, index) => id === right[index]);
}

function sameRefsByRecordId(left, right) {
  const leftIds = Object.keys(left).sort();
  const rightIds = Object.keys(right).sort();
  if (!sameIdList(leftIds, rightIds)) return false;
  return leftIds.every((id) => sameIdList(left[id] ?? [], right[id] ?? []));
}

function isUnsafeArtifactRef(value) {
  const text = normalizeText(value);
  if (!text) return true;
  if (/^file:\/\//i.test(text)) return true;
  if (/^(?:\/Users|\/private\/var|\/tmp|\/home)\//.test(text)) return true;
  if (/^[A-Za-z]:[\\/]/.test(text)) return true;
  if (/(?:api[_-]?key|secret|token|password)=/i.test(text)) return true;
  return false;
}

function unsafeArtifactRefs(refsByRecordId) {
  return Object.entries(refsByRecordId)
    .flatMap(([recordId, refs]) => refs.filter(isUnsafeArtifactRef).map((ref) => ({ recordId, ref })));
}

function artifactRefsContain(refsByRecordId, pattern) {
  return Object.values(refsByRecordId).some((refs) => refs.some((ref) => pattern.test(ref)));
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
  if (!isPublicHttpUrl(target.apiBaseUrl)) {
    addIssue(issues, 'target-api-base-url', '生产归档报告 API 地址必须是 http/https 公网地址，不能使用本机或内网地址。', {
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
  if (!isPublicHttpUrl(releasePackage.publicUrl)) {
    addIssue(issues, 'package-public-url', '生产归档报告必须包含 http/https 公网公开包地址，不能使用本机或内网地址。', {
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
    if (Number(summaryA.reviewTaskCount) <= 0 || Number(summaryB.reviewTaskCount) <= 0) {
      addIssue(issues, 'team-review-present', '生产归档报告必须证明至少一条团队审核任务对两账号可见。', {
        actorA: summaryA.reviewTaskCount,
        actorB: summaryB.reviewTaskCount,
      });
    }
    if (Number(summaryA.knowledgeMapCount) !== Number(summaryB.knowledgeMapCount)) {
      addIssue(issues, 'team-knowledge-map-count-match', '两个账号看到的知识地图数量不一致。', {
        actorA: summaryA.knowledgeMapCount,
        actorB: summaryB.knowledgeMapCount,
      });
    }
    if (Number(summaryA.knowledgeMapCount) <= 0 || Number(summaryB.knowledgeMapCount) <= 0) {
      addIssue(issues, 'team-knowledge-map-present', '生产归档报告必须证明至少一份团队知识地图快照对两账号可见。', {
        actorA: summaryA.knowledgeMapCount,
        actorB: summaryB.knowledgeMapCount,
      });
    }
    if (Number(summaryA.buildRunCount) !== Number(summaryB.buildRunCount)) {
      addIssue(issues, 'team-build-run-count-match', '两个账号看到的构建运行数量不一致。', {
        actorA: summaryA.buildRunCount,
        actorB: summaryB.buildRunCount,
      });
    }
    if (Number(summaryA.buildRunCount) <= 0 || Number(summaryB.buildRunCount) <= 0) {
      addIssue(issues, 'team-build-run-present', '生产归档报告必须证明至少一条团队构建运行对两账号可见。', {
        actorA: summaryA.buildRunCount,
        actorB: summaryB.buildRunCount,
      });
    }
    if (Number(summaryA.commandCenterCount) !== Number(summaryB.commandCenterCount)) {
      addIssue(issues, 'team-command-center-count-match', '两个账号看到的品牌作战系统数量不一致。', {
        actorA: summaryA.commandCenterCount,
        actorB: summaryB.commandCenterCount,
      });
    }
    if (Number(summaryA.commandCenterCount) <= 0 || Number(summaryB.commandCenterCount) <= 0) {
      addIssue(issues, 'team-command-center-present', '生产归档报告必须证明至少一个品牌作战系统快照对两账号可见。', {
        actorA: summaryA.commandCenterCount,
        actorB: summaryB.commandCenterCount,
      });
    }
    if (Number(summaryA.executionQueueCount) !== Number(summaryB.executionQueueCount)) {
      addIssue(issues, 'team-queue-count-match', '两个账号看到的执行队列数量不一致。', {
        actorA: summaryA.executionQueueCount,
        actorB: summaryB.executionQueueCount,
      });
    }
    if (Number(summaryA.executionQueueCount) <= 0 || Number(summaryB.executionQueueCount) <= 0) {
      addIssue(issues, 'team-queue-present', '生产归档报告必须证明至少一条团队执行队列对两账号可见。', {
        actorA: summaryA.executionQueueCount,
        actorB: summaryB.executionQueueCount,
      });
    }
    if (Number(summaryA.actionRecordCount) !== Number(summaryB.actionRecordCount)) {
      addIssue(issues, 'team-action-count-match', '两个账号看到的行动记录数量不一致。', {
        actorA: summaryA.actionRecordCount,
        actorB: summaryB.actionRecordCount,
      });
    }
    if (Number(summaryA.actionRecordCount) <= 0 || Number(summaryB.actionRecordCount) <= 0) {
      addIssue(issues, 'team-action-present', '生产归档报告必须证明至少一条团队行动记录对两账号可见。', {
        actorA: summaryA.actionRecordCount,
        actorB: summaryB.actionRecordCount,
      });
    }
    if (Number(summaryA.releaseCount) !== Number(summaryB.releaseCount)) {
      addIssue(issues, 'team-release-count-match', '两个账号看到的团队知识包版本数量不一致。', {
        actorA: summaryA.releaseCount,
        actorB: summaryB.releaseCount,
      });
    }
    if (Number(summaryA.releaseCount) <= 0 || Number(summaryB.releaseCount) <= 0) {
      addIssue(issues, 'team-release-present', '生产归档报告必须证明至少一个团队知识包版本对两账号可见。', {
        actorA: summaryA.releaseCount,
        actorB: summaryB.releaseCount,
      });
    }
    if (summaryA.reviewTaskListComplete !== true || summaryB.reviewTaskListComplete !== true) {
      addIssue(issues, 'team-review-list-complete', '生产归档报告必须证明两账号审核任务已完整拉取，并包含完整 ID 清单。', {
        actorA: summaryA.reviewTaskListComplete,
        actorB: summaryB.reviewTaskListComplete,
      });
    }
    if (summaryA.knowledgeMapListComplete !== true || summaryB.knowledgeMapListComplete !== true) {
      addIssue(issues, 'team-knowledge-map-list-complete', '生产归档报告必须证明两账号知识地图已完整拉取，并包含完整 ID 清单。', {
        actorA: summaryA.knowledgeMapListComplete,
        actorB: summaryB.knowledgeMapListComplete,
      });
    }
    if (summaryA.buildRunListComplete !== true || summaryB.buildRunListComplete !== true) {
      addIssue(issues, 'team-build-run-list-complete', '生产归档报告必须证明两账号构建运行已完整拉取，并包含完整 ID 清单。', {
        actorA: summaryA.buildRunListComplete,
        actorB: summaryB.buildRunListComplete,
      });
    }
    if (summaryA.commandCenterListComplete !== true || summaryB.commandCenterListComplete !== true) {
      addIssue(issues, 'team-command-center-list-complete', '生产归档报告必须证明两账号品牌作战系统已完整拉取，并包含完整 ID 清单。', {
        actorA: summaryA.commandCenterListComplete,
        actorB: summaryB.commandCenterListComplete,
      });
    }
    if (summaryA.executionQueueListComplete !== true || summaryB.executionQueueListComplete !== true) {
      addIssue(issues, 'team-queue-list-complete', '生产归档报告必须证明两账号执行队列已完整拉取，并包含完整 ID 清单。', {
        actorA: summaryA.executionQueueListComplete,
        actorB: summaryB.executionQueueListComplete,
      });
    }
    if (summaryA.actionRecordListComplete !== true || summaryB.actionRecordListComplete !== true) {
      addIssue(issues, 'team-action-list-complete', '生产归档报告必须证明两账号行动记录已完整拉取，并包含完整 ID 清单。', {
        actorA: summaryA.actionRecordListComplete,
        actorB: summaryB.actionRecordListComplete,
      });
    }
    if (summaryA.releaseListComplete !== true || summaryB.releaseListComplete !== true) {
      addIssue(issues, 'team-release-list-complete', '生产归档报告必须证明两账号团队知识包版本已完整拉取，并包含完整 ID 清单。', {
        actorA: summaryA.releaseListComplete,
        actorB: summaryB.releaseListComplete,
      });
    }
    const reviewIdsA = normalizeIdList(summaryA.reviewTaskIds);
    const reviewIdsB = normalizeIdList(summaryB.reviewTaskIds);
    const knowledgeMapIdsA = normalizeIdList(summaryA.knowledgeMapIds);
    const knowledgeMapIdsB = normalizeIdList(summaryB.knowledgeMapIds);
    const buildRunIdsA = normalizeIdList(summaryA.buildRunIds);
    const buildRunIdsB = normalizeIdList(summaryB.buildRunIds);
    const commandCenterIdsA = normalizeIdList(summaryA.commandCenterIds);
    const commandCenterIdsB = normalizeIdList(summaryB.commandCenterIds);
    const queueIdsA = normalizeIdList(summaryA.executionQueueIds);
    const queueIdsB = normalizeIdList(summaryB.executionQueueIds);
    const actionIdsA = normalizeIdList(summaryA.actionRecordIds);
    const actionIdsB = normalizeIdList(summaryB.actionRecordIds);
    const actionArtifactIdsA = normalizeIdList(summaryA.actionArtifactRecordIds);
    const actionArtifactIdsB = normalizeIdList(summaryB.actionArtifactRecordIds);
    const actionArtifactRefsA = normalizeRefsByRecordId(summaryA.actionArtifactRefsByRecordId);
    const actionArtifactRefsB = normalizeRefsByRecordId(summaryB.actionArtifactRefsByRecordId);
    const releaseIdsA = normalizeIdList(summaryA.releaseIds);
    const releaseIdsB = normalizeIdList(summaryB.releaseIds);
    if (!reviewIdsA.length && Number(summaryA.reviewTaskCount) > 0) {
      addIssue(issues, 'team-review-ids-present', '生产归档报告有审核任务数量，但缺少审核任务 ID 清单。');
    }
    if (!knowledgeMapIdsA.length && Number(summaryA.knowledgeMapCount) > 0) {
      addIssue(issues, 'team-knowledge-map-ids-present', '生产归档报告有知识地图数量，但缺少知识地图 ID 清单。');
    }
    if (!buildRunIdsA.length && Number(summaryA.buildRunCount) > 0) {
      addIssue(issues, 'team-build-run-ids-present', '生产归档报告有构建运行数量，但缺少构建运行 ID 清单。');
    }
    if (!commandCenterIdsA.length && Number(summaryA.commandCenterCount) > 0) {
      addIssue(issues, 'team-command-center-ids-present', '生产归档报告有品牌作战系统数量，但缺少品牌作战系统 ID 清单。');
    }
    if (!queueIdsA.length && Number(summaryA.executionQueueCount) > 0) {
      addIssue(issues, 'team-queue-ids-present', '生产归档报告有执行队列数量，但缺少执行队列 ID 清单。');
    }
    if (!actionIdsA.length && Number(summaryA.actionRecordCount) > 0) {
      addIssue(issues, 'team-action-ids-present', '生产归档报告有行动记录数量，但缺少行动记录 ID 清单。');
    }
    if (!releaseIdsA.length && Number(summaryA.releaseCount) > 0) {
      addIssue(issues, 'team-release-ids-present', '生产归档报告有团队知识包版本数量，但缺少团队知识包版本 ID 清单。');
    }
    if (reviewIdsA.length !== Number(summaryA.reviewTaskCount) || reviewIdsB.length !== Number(summaryB.reviewTaskCount)) {
      addIssue(issues, 'team-review-ids-complete', '生产归档报告的审核任务 ID 清单数量必须等于审核任务数量。', {
        actorA: { count: summaryA.reviewTaskCount, ids: reviewIdsA.length },
        actorB: { count: summaryB.reviewTaskCount, ids: reviewIdsB.length },
      });
    }
    if (knowledgeMapIdsA.length !== Number(summaryA.knowledgeMapCount) || knowledgeMapIdsB.length !== Number(summaryB.knowledgeMapCount)) {
      addIssue(issues, 'team-knowledge-map-ids-complete', '生产归档报告的知识地图 ID 清单数量必须等于知识地图数量。', {
        actorA: { count: summaryA.knowledgeMapCount, ids: knowledgeMapIdsA.length },
        actorB: { count: summaryB.knowledgeMapCount, ids: knowledgeMapIdsB.length },
      });
    }
    if (buildRunIdsA.length !== Number(summaryA.buildRunCount) || buildRunIdsB.length !== Number(summaryB.buildRunCount)) {
      addIssue(issues, 'team-build-run-ids-complete', '生产归档报告的构建运行 ID 清单数量必须等于构建运行数量。', {
        actorA: { count: summaryA.buildRunCount, ids: buildRunIdsA.length },
        actorB: { count: summaryB.buildRunCount, ids: buildRunIdsB.length },
      });
    }
    if (commandCenterIdsA.length !== Number(summaryA.commandCenterCount) || commandCenterIdsB.length !== Number(summaryB.commandCenterCount)) {
      addIssue(issues, 'team-command-center-ids-complete', '生产归档报告的品牌作战系统 ID 清单数量必须等于品牌作战系统数量。', {
        actorA: { count: summaryA.commandCenterCount, ids: commandCenterIdsA.length },
        actorB: { count: summaryB.commandCenterCount, ids: commandCenterIdsB.length },
      });
    }
    if (queueIdsA.length !== Number(summaryA.executionQueueCount) || queueIdsB.length !== Number(summaryB.executionQueueCount)) {
      addIssue(issues, 'team-queue-ids-complete', '生产归档报告的执行队列 ID 清单数量必须等于执行队列数量。', {
        actorA: { count: summaryA.executionQueueCount, ids: queueIdsA.length },
        actorB: { count: summaryB.executionQueueCount, ids: queueIdsB.length },
      });
    }
    if (actionIdsA.length !== Number(summaryA.actionRecordCount) || actionIdsB.length !== Number(summaryB.actionRecordCount)) {
      addIssue(issues, 'team-action-ids-complete', '生产归档报告的行动记录 ID 清单数量必须等于行动记录数量。', {
        actorA: { count: summaryA.actionRecordCount, ids: actionIdsA.length },
        actorB: { count: summaryB.actionRecordCount, ids: actionIdsB.length },
      });
    }
    if (releaseIdsA.length !== Number(summaryA.releaseCount) || releaseIdsB.length !== Number(summaryB.releaseCount)) {
      addIssue(issues, 'team-release-ids-complete', '生产归档报告的团队知识包版本 ID 清单数量必须等于版本数量。', {
        actorA: { count: summaryA.releaseCount, ids: releaseIdsA.length },
        actorB: { count: summaryB.releaseCount, ids: releaseIdsB.length },
      });
    }
    if (reviewIdsA.length || reviewIdsB.length) {
      if (!sameIdList(reviewIdsA, reviewIdsB)) {
        addIssue(issues, 'team-review-ids-match', '两个账号看到的审核任务 ID 清单不一致。', {
          actorA: reviewIdsA,
          actorB: reviewIdsB,
        });
      }
    }
    if (knowledgeMapIdsA.length || knowledgeMapIdsB.length) {
      if (!sameIdList(knowledgeMapIdsA, knowledgeMapIdsB)) {
        addIssue(issues, 'team-knowledge-map-ids-match', '两个账号看到的知识地图 ID 清单不一致。', {
          actorA: knowledgeMapIdsA,
          actorB: knowledgeMapIdsB,
        });
      }
    }
    if (buildRunIdsA.length || buildRunIdsB.length) {
      if (!sameIdList(buildRunIdsA, buildRunIdsB)) {
        addIssue(issues, 'team-build-run-ids-match', '两个账号看到的构建运行 ID 清单不一致。', {
          actorA: buildRunIdsA,
          actorB: buildRunIdsB,
        });
      }
    }
    if (commandCenterIdsA.length || commandCenterIdsB.length) {
      if (!sameIdList(commandCenterIdsA, commandCenterIdsB)) {
        addIssue(issues, 'team-command-center-ids-match', '两个账号看到的品牌作战系统 ID 清单不一致。', {
          actorA: commandCenterIdsA,
          actorB: commandCenterIdsB,
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
    if (actionIdsA.length || actionIdsB.length) {
      if (!sameIdList(actionIdsA, actionIdsB)) {
        addIssue(issues, 'team-action-ids-match', '两个账号看到的行动记录 ID 清单不一致。', {
          actorA: actionIdsA,
          actorB: actionIdsB,
        });
      }
    }
    if (releaseIdsA.length || releaseIdsB.length) {
      if (!sameIdList(releaseIdsA, releaseIdsB)) {
        addIssue(issues, 'team-release-ids-match', '两个账号看到的团队知识包版本 ID 清单不一致。', {
          actorA: releaseIdsA,
          actorB: releaseIdsB,
        });
      }
    }
    if (Number(summaryA.actionArtifactRecordCount) <= 0 || Number(summaryB.actionArtifactRecordCount) <= 0) {
      addIssue(issues, 'team-action-artifacts-present', '生产归档报告必须证明至少一条行动记录带交付物引用。', {
        actorA: summaryA.actionArtifactRecordCount,
        actorB: summaryB.actionArtifactRecordCount,
      });
    }
    if (!actionArtifactIdsA.length || !actionArtifactIdsB.length) {
      addIssue(issues, 'team-action-artifact-ids-present', '生产归档报告必须包含带交付物引用的行动记录 ID 清单。');
    } else if (!sameIdList(actionArtifactIdsA, actionArtifactIdsB)) {
      addIssue(issues, 'team-action-artifact-ids-match', '两个账号看到的带交付物行动记录 ID 清单不一致。', {
        actorA: actionArtifactIdsA,
        actorB: actionArtifactIdsB,
      });
    }
    if (!Object.keys(actionArtifactRefsA).length || !Object.keys(actionArtifactRefsB).length) {
      addIssue(issues, 'team-action-artifact-refs-present', '生产归档报告必须包含行动记录交付物引用明细。');
    } else if (!sameRefsByRecordId(actionArtifactRefsA, actionArtifactRefsB)) {
      addIssue(issues, 'team-action-artifact-refs-match', '两个账号看到的行动记录交付物引用不一致。', {
        actorA: actionArtifactRefsA,
        actorB: actionArtifactRefsB,
      });
    }
    const unsafeRefsA = unsafeArtifactRefs(actionArtifactRefsA);
    const unsafeRefsB = unsafeArtifactRefs(actionArtifactRefsB);
    if (unsafeRefsA.length || unsafeRefsB.length) {
      addIssue(issues, 'team-action-artifact-refs-safe', '生产归档报告中的交付物引用不能包含本机绝对路径、file URL 或疑似凭证。', {
        actorA: unsafeRefsA,
        actorB: unsafeRefsB,
      });
    }
    if (
      !artifactRefsContain(actionArtifactRefsA, /material-gap-list\.json$/) ||
      !artifactRefsContain(actionArtifactRefsB, /material-gap-list\.json$/)
    ) {
      addIssue(issues, 'team-material-gap-artifact-present', '生产归档报告必须证明两账号都能看到补素材清单交付文件 material-gap-list.json。', {
        actorA: actionArtifactRefsA,
        actorB: actionArtifactRefsB,
      });
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
