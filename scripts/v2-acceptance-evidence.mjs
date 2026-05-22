import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { buildBusinessAcceptanceReport, loadAcceptanceInput, loadWorkspaceAcceptanceInput } from './v2-business-acceptance.mjs';
import { buildProviderCheckReport, hasProviderStrictFailure } from './v2-provider-check.mjs';

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(...names) {
  return names.some((name) => process.argv.includes(name));
}

function evidenceTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function defaultOutputDir() {
  return join('docs', 'dev', 'v2-acceptance', evidenceTimestamp());
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
}

function modeLabel(mode) {
  if (mode === 'workspace') return '真实工作区';
  if (mode === 'external-input') return '外部验收输入';
  return '本地样例';
}

function shellQuote(value) {
  return `"${String(value).replace(/(["\\$`])/g, '\\$1')}"`;
}

function envPrefix({ allowNetwork, allowMedia }) {
  return [
    allowNetwork ? 'CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1' : '',
    allowMedia ? 'CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1' : '',
  ].filter(Boolean).join(' ');
}

function providerCommand({ providerStrictRequired, networkAllowed, mediaAllowed }) {
  const needsStrictProvider = providerStrictRequired || networkAllowed || mediaAllowed;
  const command = needsStrictProvider ? 'npm run verify:v2:providers:strict' : 'npm run verify:v2:providers';
  const prefix = envPrefix({
    allowNetwork: needsStrictProvider ? true : networkAllowed,
    allowMedia: needsStrictProvider ? true : mediaAllowed,
  });
  return prefix ? `${prefix} ${command}` : command;
}

function businessCommand(acceptance, requireExternalMixEvidence = false, requireRealWorkspaceEvidence = false) {
  const suffix = [
    requireExternalMixEvidence ? '--require-external-mix-evidence' : '',
    requireRealWorkspaceEvidence ? '--require-real-workspace-evidence' : '',
  ].filter(Boolean).join(' ');
  const suffixWithSpace = suffix ? ` ${suffix}` : '';
  if (acceptance.workspacePath) {
    return `npm run verify:v2:acceptance -- --workspace ${shellQuote(acceptance.workspacePath)}${suffixWithSpace}`;
  }
  if (acceptance.inputPath) {
    return `npm run verify:v2:acceptance -- --input ${shellQuote(acceptance.inputPath)}${suffixWithSpace}`;
  }
  return suffix ? `npm run verify:v2:acceptance -- ${suffix}` : 'npm run verify:v2:acceptance';
}

function evidenceCommand({ providerStrictRequired, requireExternalMixEvidence, requireRealWorkspaceEvidence, acceptance, outputDir, allowNetwork, allowMedia }) {
  const args = ['npm run verify:v2:evidence --'];
  if (providerStrictRequired) args.push('--provider-strict');
  if (requireExternalMixEvidence) args.push('--require-external-mix-evidence');
  if (requireRealWorkspaceEvidence) args.push('--require-real-workspace-evidence');
  if (acceptance.workspacePath) args.push('--workspace', shellQuote(acceptance.workspacePath));
  if (acceptance.inputPath) args.push('--input', shellQuote(acceptance.inputPath));
  if (allowNetwork || providerStrictRequired) args.push('--allow-network');
  if (allowMedia || providerStrictRequired) args.push('--allow-media');
  args.push('--output-dir', shellQuote(outputDir));
  return args.join(' ');
}

function providerRows(providerReport) {
  return providerReport.checks.map((check) => (
    `| ${check.name} | ${check.status} | ${check.severity} | ${(check.requiredEnv ?? []).join('<br>') || '-'} | ${check.nextAction || '-'} |`
  )).join('\n');
}

function tableCell(value) {
  return String(value || '-').replace(/\|/g, '\\|').replace(/\n/g, '<br>');
}

function businessFailureChecks(businessReport) {
  return Object.entries(businessReport.sections)
    .filter(([section]) => section !== 'provider')
    .flatMap(([section, value]) => (value?.checks ?? [])
      .filter((check) => check.status !== 'pass')
      .map((check) => ({ section, ...check })));
}

function businessFailureRows(failures) {
  if (!failures.length) return '| - | - | - | - |';
  return failures.map((check) => {
    const missing = [
      ...(check.missing ?? []),
      ...(check.missingFields ?? []),
      ...(check.missingSources ?? []),
      ...(check.missingFiles ?? []),
      ...(check.missingAssetKinds ?? []),
      ...(check.missingEvidenceFiles ?? []),
    ].filter(Boolean);
    return `| ${tableCell(check.section)} | ${tableCell(check.title)} | ${tableCell(check.evidence)} | ${tableCell(missing.join('<br>'))} |`;
  }).join('\n');
}

function businessNextActions(failures) {
  return Array.from(new Set(failures
    .flatMap((check) => check.nextActions ?? [])
    .map(String)
    .filter(Boolean)));
}

function checkMissingItems(check) {
  return [
    ...(check.missing ?? []),
    ...(check.missingFields ?? []),
    ...(check.missingSources ?? []),
    ...(check.missingFiles ?? []),
    ...(check.missingAssetKinds ?? []),
    ...(check.missingEvidenceFiles ?? []),
  ].filter(Boolean).map(String);
}

function checklistItems(items) {
  return items.length ? items.map((item) => `- [ ] ${item}`).join('\n') : '- [x] 无';
}

function missingEvidenceChecklist({ manifest, providerReport, businessReport }) {
  const providerPassed = !hasProviderStrictFailure(providerReport);
  const businessFailures = businessFailureChecks(businessReport);
  const providerTasks = [];
  if (!providerReport.networkAllowed) providerTasks.push('开启网络联调：CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1');
  if (!providerReport.mediaAllowed) providerTasks.push('开启媒体联调：CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1');
  for (const check of providerReport.checks) {
    if (check.status === 'blocked' || check.status === 'failed') {
      providerTasks.push(`${check.name}: ${check.nextAction || check.reason || check.status}`);
    }
  }
  const businessSections = businessFailures.length
    ? businessFailures.flatMap((check) => [
        `### ${check.title}`,
        '',
        `区域：${check.section}`,
        '',
        `说明：${check.evidence}`,
        '',
        '缺口：',
        '',
        checklistItems(checkMissingItems(check)),
        '',
        ...(check.nextActions?.length ? ['恢复动作：', '', checklistItems(check.nextActions), ''] : []),
      ])
    : ['### 业务验收', '', '- [x] 当前业务验收无失败项。', ''];
  return [
    '# v2 缺口补齐清单',
    '',
    `生成时间：${manifest.generatedAt}`,
    `验收模式：${modeLabel(manifest.mode)} (${manifest.mode})`,
    `Provider strict：${providerPassed ? '通过' : '未通过'}`,
    `业务验收：${businessReport.summary.failed === 0 ? '通过' : '未通过'}`,
    '',
    '## Provider 待补',
    '',
    checklistItems(providerTasks),
    '',
    '## 业务待补',
    '',
    ...businessSections,
    '## 重跑命令',
    '',
    '```bash',
    manifest.commands.provider,
    manifest.commands.business,
    manifest.commands.evidence,
    '```',
    '',
  ].join('\n');
}

function markdownSummary({ manifest, providerReport, businessReport }) {
  const providerPassed = !hasProviderStrictFailure(providerReport);
  const businessPassed = businessReport.summary.failed === 0;
  const failures = businessFailureChecks(businessReport);
  const nextActions = providerReport.strictGate.nextActions.length
    ? providerReport.strictGate.nextActions.map((item) => `- ${item}`).join('\n')
    : '- 无';
  const businessActions = manifest.businessNextActions.length
    ? manifest.businessNextActions.map((item) => `- ${item}`).join('\n')
    : '- 无';
  return [
    '# 布谷AI v2 验收证据',
    '',
    `生成时间：${manifest.generatedAt}`,
    `验收模式：${modeLabel(manifest.mode)} (${manifest.mode})`,
    `Provider strict 要求：${manifest.providerStrictRequired ? '是' : '否'}`,
    `真实混剪导入证据要求：${manifest.requireExternalMixEvidence ? '是' : '否'}`,
    `真实工作区闭环要求：${manifest.requireRealWorkspaceEvidence ? '是' : '否'}`,
    `Provider strict 结果：${providerPassed ? '通过' : '未通过'}`,
    `业务验收结果：${businessPassed ? '通过' : '未通过'}`,
    '',
    '## 文件',
    '',
    `- Provider 报告：\`${manifest.files.providerReport}\``,
    `- 业务验收报告：\`${manifest.files.businessReport}\``,
    `- 证据 manifest：\`${manifest.files.manifest}\``,
    `- 摘要：\`${manifest.files.summary}\``,
    `- 缺口清单：\`${manifest.files.missingEvidence}\``,
    '',
    '## Provider 摘要',
    '',
    `总数：${providerReport.summary.total}；succeeded：${providerReport.summary.succeeded}；ready：${providerReport.summary.ready}；blocked：${providerReport.summary.blocked}；failed：${providerReport.summary.failed}`,
    '',
    '| Provider | 状态 | 严重度 | 需要配置 | 下一步 |',
    '| --- | --- | --- | --- | --- |',
    providerRows(providerReport),
    '',
    '## Strict 恢复动作',
    '',
    nextActions,
    '',
    '## 业务验收摘要',
    '',
    `总检查：${businessReport.summary.total}；通过：${businessReport.summary.passed}；失败：${businessReport.summary.failed}`,
    '',
    '## 业务失败项',
    '',
    '| 区域 | 检查 | 说明 | 缺口 |',
    '| --- | --- | --- | --- |',
    businessFailureRows(failures),
    '',
    '## 业务恢复动作',
    '',
    businessActions,
    '',
    '## 建议重跑命令',
    '',
    '```bash',
    manifest.commands.provider,
    manifest.commands.business,
    manifest.commands.evidence,
    '```',
    '',
  ].join('\n');
}

async function acceptanceInputFromArgs() {
  const inputPath = argValue('--input') || process.env.CONTENT_STUDIO_V2_ACCEPTANCE_INPUT;
  const workspacePath = argValue('--workspace') || process.env.CONTENT_STUDIO_V2_ACCEPTANCE_WORKSPACE;
  if (inputPath) {
    return {
      mode: 'external-input',
      inputPath,
      workspacePath: '',
      value: await loadAcceptanceInput(inputPath),
    };
  }
  if (workspacePath) {
    return {
      mode: 'workspace',
      inputPath: '',
      workspacePath,
      value: await loadWorkspaceAcceptanceInput(workspacePath),
    };
  }
  return {
    mode: 'local-sample',
    inputPath: '',
    workspacePath: '',
    value: undefined,
  };
}

async function main() {
  const outputDir = resolve(argValue('--output-dir') || process.env.CONTENT_STUDIO_V2_EVIDENCE_DIR || defaultOutputDir());
  const providerStrictRequired = hasFlag('--provider-strict', '--strict-provider', '--strict');
  const requireExternalMixEvidence = hasFlag('--require-external-mix-evidence', '--require-mix-import-evidence') ||
    process.env.CONTENT_STUDIO_REQUIRE_MIX_IMPORT_EVIDENCE === '1';
  const requireRealWorkspaceEvidence = hasFlag('--require-real-workspace-evidence', '--require-real-business-evidence') ||
    process.env.CONTENT_STUDIO_REQUIRE_REAL_WORKSPACE_EVIDENCE === '1';
  const allowNetwork = hasFlag('--allow-network') ? true : undefined;
  const allowMedia = hasFlag('--allow-media') ? true : undefined;
  const acceptance = await acceptanceInputFromArgs();

  await mkdir(outputDir, { recursive: true });

  const providerReport = await buildProviderCheckReport(process.env, { allowNetwork, allowMedia });
  const businessReport = await buildBusinessAcceptanceReport(process.env, {
    providerReport,
    acceptanceInput: acceptance.value,
    mode: acceptance.mode,
    requireExternalMixEvidence,
    requireRealWorkspaceEvidence,
  });
  const providerStrictFailed = providerStrictRequired && hasProviderStrictFailure(providerReport);
  const businessFailed = businessReport.summary.failed > 0;
  const exitCode = providerStrictFailed || businessFailed ? 1 : 0;
  const businessFailures = businessFailureChecks(businessReport);

  const manifest = {
    schema: 'buguai.v2-acceptance-evidence.v1',
    generatedAt: new Date().toISOString(),
    mode: acceptance.mode,
    outputDir,
    providerStrictRequired,
    requireExternalMixEvidence,
    requireRealWorkspaceEvidence,
    providerStrictPassed: !hasProviderStrictFailure(providerReport),
    businessAcceptancePassed: !businessFailed,
    exitCode,
    inputs: {
      workspacePath: acceptance.workspacePath,
      inputPath: acceptance.inputPath,
      networkAllowed: providerReport.networkAllowed,
      mediaAllowed: providerReport.mediaAllowed,
    },
    files: {
      providerReport: 'provider-check.json',
      businessReport: 'business-acceptance.json',
      manifest: 'manifest.json',
      summary: 'SUMMARY.md',
      missingEvidence: 'MISSING_EVIDENCE.md',
    },
    commands: {
      provider: providerCommand({
        providerStrictRequired,
        networkAllowed: providerReport.networkAllowed,
        mediaAllowed: providerReport.mediaAllowed,
      }),
      business: businessCommand(acceptance, requireExternalMixEvidence, requireRealWorkspaceEvidence),
      evidence: evidenceCommand({ providerStrictRequired, requireExternalMixEvidence, requireRealWorkspaceEvidence, acceptance, outputDir, allowNetwork, allowMedia }),
    },
    summary: {
      provider: providerReport.summary,
      business: businessReport.summary,
    },
    businessFailures: businessFailures.map((check) => ({
      section: check.section,
      id: check.id,
      title: check.title,
      evidence: check.evidence,
      missing: [
        ...(check.missing ?? []),
        ...(check.missingFields ?? []),
        ...(check.missingSources ?? []),
        ...(check.missingFiles ?? []),
        ...(check.missingAssetKinds ?? []),
        ...(check.missingEvidenceFiles ?? []),
      ].filter(Boolean),
    })),
    businessNextActions: businessNextActions(businessFailures),
    nextActions: providerReport.strictGate.nextActions,
  };

  await writeJson(join(outputDir, manifest.files.providerReport), providerReport);
  await writeJson(join(outputDir, manifest.files.businessReport), businessReport);
  await writeFile(join(outputDir, manifest.files.summary), markdownSummary({ manifest, providerReport, businessReport }), 'utf-8');
  await writeFile(join(outputDir, manifest.files.missingEvidence), missingEvidenceChecklist({ manifest, providerReport, businessReport }), 'utf-8');
  await writeJson(join(outputDir, manifest.files.manifest), manifest);
  console.log(JSON.stringify(manifest, null, 2));
  process.exit(exitCode);
}

await main();
