import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const REQUIRED_EXPORTS = [
  {
    packageName: '@limecloud/agent-runtime-ui',
    exports: ['AgentUiProjectionView', 'ProcessTimelineView', 'ExecutionGraphView', 'SubagentsView'],
  },
  {
    packageName: '@limecloud/agent-runtime-projection',
    exports: ['projectAgentUiState', 'projectAgentRuntimeReadModel'],
  },
];

const failures = [];

for (const requirement of REQUIRED_EXPORTS) {
  try {
    require.resolve(`${requirement.packageName}/package.json`);
  } catch {
    try {
      await import(requirement.packageName);
    } catch {
      failures.push(`${requirement.packageName}: package not installed`);
      continue;
    }
  }

  let module;
  try {
    module = await import(requirement.packageName);
  } catch (error) {
    failures.push(`${requirement.packageName}: cannot import package (${error instanceof Error ? error.message : String(error)})`);
    continue;
  }

  for (const exportName of requirement.exports) {
    if (!(exportName in module)) {
      failures.push(`${requirement.packageName}: missing export ${exportName}`);
    }
  }
}

if (failures.length > 0) {
  console.error([
    '[agent-runtime-packages] production npm packages do not expose required AgentUI runtime exports:',
    ...failures.map((failure) => `- ${failure}`),
    '',
    '生产 build/dist 不允许使用本地 Lime packages alias。',
    '请先将 /Users/coso/Documents/dev/ai/aiclientproxy/lime/packages 中的 @limecloud/agent-runtime-* 标准 surface 发布到 npmjs，并更新 package.json / package-lock.json。',
  ].join('\n'));
  process.exit(1);
}

console.log('[agent-runtime-packages] ok packages expose standard AgentUI runtime exports.');
