import { mkdir, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { verifyContentKnowledgeReleaseOnline } from './verify-content-knowledge-release-online.mjs';
import { verifyContentTeamSharingOnline } from './verify-content-team-sharing-online.mjs';

const DEFAULT_API_BASE_URL = 'https://api.bugu.run';

function normalizeText(value) {
  return String(value ?? '').trim();
}

function cliValue(argv, name) {
  const prefix = `--${name}=`;
  const match = argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length).trim() : '';
}

function cliFlag(argv, name) {
  return argv.includes(`--${name}`);
}

function sectionChecks(section) {
  if (!section) return [];
  return Array.isArray(section.checks) ? section.checks : [];
}

function failedChecks(section) {
  return sectionChecks(section).filter((check) => check.status === 'failed');
}

export async function verifyContentOntologyV1Online(options = {}) {
  const sections = {};
  if (!options.skipRelease) {
    sections.release = await verifyContentKnowledgeReleaseOnline({
      apiBaseUrl: options.apiBaseUrl,
      tenant: options.tenant,
      workspaceId: options.workspaceId,
      releaseId: options.releaseId,
      version: options.version,
      token: options.token || options.actorAToken,
      publicUrl: options.publicUrl,
      expectedSize: options.expectedSize,
      expectedSha256: options.expectedSha256,
      maxDownloadBytes: options.maxDownloadBytes,
      verifySha256: options.verifySha256,
      allowMetadataOnly: options.allowMetadataOnly,
      allowNonPublished: options.allowNonPublished,
      allowPendingApproval: options.allowPendingApproval,
      fetchImpl: options.fetchImpl,
      release: options.release,
    });
  }
  if (!options.skipTeam) {
    sections.team = await verifyContentTeamSharingOnline({
      apiBaseUrl: options.apiBaseUrl,
      tenant: options.tenant,
      workspaceId: options.workspaceId,
      releaseId: options.releaseId,
      actorAToken: options.actorAToken,
      actorBToken: options.actorBToken,
      allowSameToken: options.allowSameToken,
      allowPendingApproval: options.allowPendingApproval,
      requirePublicPackage: options.requirePublicPackage,
      fetchImpl: options.fetchImpl,
    });
  }
  const releaseFailures = failedChecks(sections.release);
  const teamFailures = failedChecks(sections.team);
  const checks = [
    {
      id: 'release-online-report',
      status: sections.release ? (releaseFailures.length ? 'failed' : 'passed') : 'skipped',
      message: sections.release
        ? `团队知识包在线验收${releaseFailures.length ? '未通过' : '通过'}。`
        : '已跳过团队知识包在线验收。',
      failedCount: releaseFailures.length,
    },
    {
      id: 'team-sharing-online-report',
      status: sections.team ? (teamFailures.length ? 'failed' : 'passed') : 'skipped',
      message: sections.team
        ? `团队共享在线验收${teamFailures.length ? '未通过' : '通过'}。`
        : '已跳过团队共享在线验收。',
      failedCount: teamFailures.length,
    },
  ];
  return {
    ok: !checks.some((check) => check.status === 'failed'),
    generatedAt: new Date().toISOString(),
    target: {
      apiBaseUrl: normalizeText(options.apiBaseUrl || DEFAULT_API_BASE_URL),
      tenant: normalizeText(options.tenant),
      workspaceId: normalizeText(options.workspaceId),
      releaseId: normalizeText(options.releaseId),
    },
    checks,
    sections,
  };
}

function parseCliOptions(argv) {
  const maxDownloadMb = Number(cliValue(argv, 'max-download-mb') || '128');
  return {
    apiBaseUrl: cliValue(argv, 'api-base-url') || process.env.CONTENT_STUDIO_BUGU_CONTENT_API_BASE_URL || DEFAULT_API_BASE_URL,
    tenant: cliValue(argv, 'tenant') || process.env.CONTENT_STUDIO_BUGU_TENANT_ID || process.env.BUGU_TENANT_ID || '',
    workspaceId: cliValue(argv, 'workspace-id') || process.env.CONTENT_STUDIO_BUGU_WORKSPACE_ID || '',
    releaseId: cliValue(argv, 'release-id') || '',
    version: cliValue(argv, 'version') || '',
    token: cliValue(argv, 'token') || process.env.CONTENT_STUDIO_BUGU_API_TOKEN || process.env.BUGU_API_TOKEN || process.env.BUGU_ADMIN_TOKEN || '',
    actorAToken: cliValue(argv, 'actor-a-token') || process.env.CONTENT_STUDIO_BUGU_ACTOR_A_TOKEN || process.env.BUGU_ACTOR_A_TOKEN || '',
    actorBToken: cliValue(argv, 'actor-b-token') || process.env.CONTENT_STUDIO_BUGU_ACTOR_B_TOKEN || process.env.BUGU_ACTOR_B_TOKEN || '',
    publicUrl: cliValue(argv, 'public-url') || '',
    expectedSize: Number(cliValue(argv, 'expected-size') || '0'),
    expectedSha256: cliValue(argv, 'expected-sha256') || '',
    maxDownloadBytes: Number.isFinite(maxDownloadMb) && maxDownloadMb > 0 ? maxDownloadMb * 1024 * 1024 : undefined,
    verifySha256: !cliFlag(argv, 'skip-sha256'),
    allowMetadataOnly: cliFlag(argv, 'allow-metadata-only'),
    allowNonPublished: cliFlag(argv, 'allow-non-published'),
    allowPendingApproval: cliFlag(argv, 'allow-pending-approval'),
    allowSameToken: cliFlag(argv, 'allow-same-token'),
    requirePublicPackage: cliFlag(argv, 'require-public-package'),
    skipRelease: cliFlag(argv, 'skip-release'),
    skipTeam: cliFlag(argv, 'skip-team'),
    output: cliValue(argv, 'output') || '',
    json: cliFlag(argv, 'json'),
  };
}

function printHumanResult(result) {
  console.log(`Ontology v1 在线验收总报告：${result.ok ? '通过' : '未通过'}`);
  if (result.target.workspaceId) console.log(`工作区：${result.target.workspaceId}`);
  if (result.target.releaseId) console.log(`团队知识包：${result.target.releaseId}`);
  for (const check of result.checks) {
    const prefix = check.status === 'passed' ? '[通过]' : check.status === 'skipped' ? '[跳过]' : '[失败]';
    console.log(`${prefix} ${check.message}`);
  }
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseCliOptions(argv);
  if (!options.skipRelease && !options.publicUrl && !options.workspaceId) {
    throw new Error('缺少参数：release 验收需要 --workspace-id=... 或 --public-url=...；如只验收团队共享可传 --skip-release。');
  }
  if (!options.skipTeam && (!options.actorAToken || !options.actorBToken)) {
    throw new Error('缺少参数：团队共享验收需要 --actor-a-token 和 --actor-b-token；如只验收知识包可传 --skip-team。');
  }
  const result = await verifyContentOntologyV1Online(options);
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
