import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(process.cwd());

const TARGET_FILES = [
  'package.json',
  'package-lock.json',
  'src/shared/types.ts',
  'src/preload/index.ts',
  'src/main/ipc.ts',
  'src/main/services/appServerAgentRuntimeGateway.ts',
  'src/main/services/appServerSidecarService.ts',
  'src/main/services/appServerPromptAgentService.ts',
  'src/main/services/platformHostBridgeClient.ts',
  'src/main/services/agentPromptSessionStore.ts',
  'src/main/services/modelConfigStore.ts',
  'src/renderer/src/devContentStudioBridge.ts',
  'src/renderer/src/components/agents/AgentsWorkbench.tsx',
  'src/renderer/src/components/ModuleOutlet.tsx',
  'src/renderer/src/components/agent/AgentSessionPanel.tsx',
  'src/renderer/src/components/agent/AgentUiProjectionSurface.tsx',
  'src/renderer/src/components/agent/AgentRuntimeRefLists.tsx',
  'src/renderer/src/components/agent/agentRuntimeProjection.ts',
  'src/renderer/src/app/platformModelSettingsProjection.ts',
  'src/renderer/src/components/SettingsDialogOutlet.tsx',
  'src/renderer/src/styles/modules.css',
  'src/renderer/src/styles/shell.css',
  'scripts/platform-host-runtime-live-check.mjs',
];

function lineNumberForIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function lineExcerpt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const nextBreak = text.indexOf('\n', index);
  const end = nextBreak === -1 ? text.length : nextBreak;
  return text.slice(start, end).trim();
}

function failure(path, ruleId, message, text, index = 0, match = '') {
  return {
    path,
    ruleId,
    message,
    line: lineNumberForIndex(text, index),
    match,
    excerpt: lineExcerpt(text, index),
  };
}

function assertIncludes({ files, failures, path, needle, ruleId, message }) {
  const text = files[path] ?? '';
  const index = text.indexOf(needle);
  if (index < 0) {
    failures.push(failure(path, ruleId, message, text, 0, needle));
  }
}

function assertNotIncludes({ files, failures, path, needle, ruleId, message }) {
  const text = files[path] ?? '';
  const index = text.indexOf(needle);
  if (index >= 0) {
    failures.push(failure(path, ruleId, message, text, index, needle));
  }
}

function assertMatches({ files, failures, path, pattern, ruleId, message }) {
  const text = files[path] ?? '';
  const match = text.match(pattern);
  if (!match) {
    failures.push(failure(path, ruleId, message, text, 0, pattern.toString()));
  }
}

function assertNotMatches({ files, failures, path, pattern, ruleId, message }) {
  const text = files[path] ?? '';
  const regex = pattern.global ? pattern : new RegExp(pattern.source, `${pattern.flags}g`);
  for (const match of text.matchAll(regex)) {
    failures.push(failure(path, ruleId, message, text, match.index ?? 0, match[0]));
  }
}

function interfaceBody(text, interfaceName) {
  const header = new RegExp(`export\\s+interface\\s+${interfaceName}\\s*\\{`, 'm').exec(text);
  if (!header) return '';
  let depth = 0;
  for (let index = header.index + header[0].length - 1; index < text.length; index += 1) {
    const char = text[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(header.index, index + 1);
    }
  }
  return '';
}

function runBoundaryChecks(files) {
  const failures = [];
  const sharedPath = 'src/shared/types.ts';
  const preloadPath = 'src/preload/index.ts';
  const ipcPath = 'src/main/ipc.ts';
  const promptAgentPath = 'src/main/services/appServerPromptAgentService.ts';
  const runtimeGatewayPath = 'src/main/services/appServerAgentRuntimeGateway.ts';
  const platformBridgePath = 'src/main/services/platformHostBridgeClient.ts';
  const platformLivePath = 'scripts/platform-host-runtime-live-check.mjs';
  const sessionStorePath = 'src/main/services/agentPromptSessionStore.ts';
  const modelStorePath = 'src/main/services/modelConfigStore.ts';
  const devBridgePath = 'src/renderer/src/devContentStudioBridge.ts';
  const agentsPath = 'src/renderer/src/components/agents/AgentsWorkbench.tsx';
  const agentSessionPanelPath = 'src/renderer/src/components/agent/AgentSessionPanel.tsx';
  const projectionSurfacePath = 'src/renderer/src/components/agent/AgentUiProjectionSurface.tsx';
  const moduleOutletPath = 'src/renderer/src/components/ModuleOutlet.tsx';
  const runtimeRefsPath = 'src/renderer/src/components/agent/AgentRuntimeRefLists.tsx';
  const projectionPath = 'src/renderer/src/components/agent/agentRuntimeProjection.ts';
  const modelProjectionPath = 'src/renderer/src/app/platformModelSettingsProjection.ts';
  const settingsPath = 'src/renderer/src/components/SettingsDialogOutlet.tsx';
  const modulesCssPath = 'src/renderer/src/styles/modules.css';
  const shellCssPath = 'src/renderer/src/styles/shell.css';

  assertMatches({
    files,
    failures,
    path: 'package.json',
    pattern: /"@limecloud\/agent-runtime-client"\s*:\s*"0\.1\.1"/,
    ruleId: 'agent-runtime-client-scoped-dependency',
    message: 'Content Studio 必须通过 limecloud organization scoped 包固定消费 @limecloud/agent-runtime-client@0.1.1。',
  });
  assertNotIncludes({
    files,
    failures,
    path: 'package.json',
    needle: '"app-server-client"',
    ruleId: 'no-bare-app-server-client-dependency',
    message: 'Content Studio 不能依赖无 scope app-server-client；标准 App Server client 必须来自 @limecloud/app-server-client。',
  });
  assertIncludes({
    files,
    failures,
    path: 'package-lock.json',
    needle: 'node_modules/@limecloud/agent-runtime-client',
    ruleId: 'agent-runtime-client-lockfile-registry-package',
    message: 'lockfile 必须解析到 registry 版 @limecloud/agent-runtime-client。',
  });
  assertIncludes({
    files,
    failures,
    path: 'package-lock.json',
    needle: 'https://registry.npmjs.org/@limecloud/agent-runtime-client/-/agent-runtime-client-0.1.1.tgz',
    ruleId: 'agent-runtime-client-lockfile-registry-tarball',
    message: 'lockfile 不能使用 file、tarball 本机路径或个人包；必须消费 registry 版 @limecloud/agent-runtime-client@0.1.1。',
  });
  assertIncludes({
    files,
    failures,
    path: 'package-lock.json',
    needle: '"@limecloud/app-server-client": "1.66.0"',
    ruleId: 'app-server-client-scoped-transitive-dependency',
    message: '@limecloud/agent-runtime-client 必须传递依赖 @limecloud/app-server-client@1.66.0，不能回到无 scope 包。',
  });
  assertNotIncludes({
    files,
    failures,
    path: 'package-lock.json',
    needle: 'node_modules/app-server-client',
    ruleId: 'no-bare-app-server-client-lockfile-package',
    message: 'lockfile 不能解析无 scope app-server-client 包。',
  });
  assertIncludes({
    files,
    failures,
    path: runtimeGatewayPath,
    needle: "from '@limecloud/agent-runtime-client/sessionGateway'",
    ruleId: 'agent-runtime-client-standard-session-gateway-import',
    message: 'Content Studio runtime gateway 必须消费 @limecloud/agent-runtime-client/sessionGateway 标准 adapter。',
  });
  assertIncludes({
    files,
    failures,
    path: runtimeGatewayPath,
    needle: 'createAgentRuntimeClientFromSessionGateway',
    ruleId: 'agent-runtime-client-standard-session-gateway-factory',
    message: 'Content Studio runtime gateway 必须通过 createAgentRuntimeClientFromSessionGateway 接入标准 AgentRuntimeClient。',
  });

  for (const path of [sharedPath, preloadPath, ipcPath, settingsPath]) {
    assertNotIncludes({
      files,
      failures,
      path,
      needle: 'savePlatformModelSettings',
      ruleId: 'no-public-platform-model-save',
      message: '平台模型设置保存不能暴露给 renderer / preload / IPC；Content Studio 只能打开平台设置。',
    });
  }
  assertNotIncludes({
    files,
    failures,
    path: ipcPath,
    needle: 'modelConfig:savePlatformModelSettings',
    ruleId: 'no-platform-save-ipc-channel',
    message: '公开 IPC 不能保留平台模型设置保存通道。',
  });

  const sharedText = files[sharedPath] ?? '';
  const providerConfigBody = interfaceBody(sharedText, 'PlatformModelProviderConfig');
  if (!providerConfigBody) {
    failures.push(failure(sharedPath, 'platform-provider-projection-present', '必须保留平台模型 provider 非敏感 projection 类型。', sharedText));
  } else if (/\bapiKey\??\s*:/.test(providerConfigBody)) {
    failures.push(failure(
      sharedPath,
      'platform-provider-projection-no-api-key',
      'PlatformModelProviderConfig 是 renderer 可见 projection，不能包含明文 apiKey 字段。',
      sharedText,
      sharedText.indexOf(providerConfigBody),
      'apiKey',
    ));
  }

  for (const needle of [
    'getTextApiKey',
    'getApiKey',
    'CONTENT_STUDIO_TEXT_API_KEY',
    'OPENAI_API_KEY',
    'ANTHROPIC_API_KEY',
    'GEMINI_API_KEY',
    'GOOGLE_API_KEY',
    'LLM_API_KEY',
    'backendEnv',
  ]) {
    assertNotIncludes({
      files,
      failures,
      path: promptAgentPath,
      needle,
      ruleId: 'prompt-agent-no-product-app-key',
      message: 'Prompt Agent 主链不能读取或传递 Product App key/env；只能传 provider/model preference。',
    });
  }

  assertIncludes({
    files,
    failures,
    path: promptAgentPath,
    needle: 'providerPreference',
    ruleId: 'prompt-agent-provider-preference',
    message: 'Prompt Agent turn 必须提交 providerPreference。',
  });
  assertIncludes({
    files,
    failures,
    path: promptAgentPath,
    needle: 'modelPreference',
    ruleId: 'prompt-agent-model-preference',
    message: 'Prompt Agent turn 必须提交 modelPreference。',
  });
  assertIncludes({
    files,
    failures,
    path: promptAgentPath,
    needle: 'AI Agent 对话必须通过 lime-desktop-platform runtime bridge 调用 lime.agent',
    ruleId: 'prompt-agent-platform-bridge-required',
    message: 'Prompt Agent 主链必须强制走 lime-desktop-platform runtime bridge，不能在直连启动时回退本地 sidecar/provider store。',
  });
  assertIncludes({
    files,
    failures,
    path: promptAgentPath,
    needle: '已阻断 Content Studio 本地 sidecar / provider store 凭证回退',
    ruleId: 'prompt-agent-no-local-sidecar-credential-fallback',
    message: 'Prompt Agent 必须明确阻断 Content Studio 本地 sidecar/provider store 凭证回退。',
  });
  assertNotIncludes({
    files,
    failures,
    path: promptAgentPath,
    needle: 'return this.appServer.runPromptTurn(input)',
    ruleId: 'prompt-agent-no-product-app-sidecar-return',
    message: 'Product App Prompt Agent 不能直接 return 本地 App Server sidecar 结果。',
  });
  assertIncludes({
    files,
    failures,
    path: platformBridgePath,
    needle: 'modelPreference: input.modelPreference ?? input.modelId',
    ruleId: 'platform-bridge-model-preference',
    message: '平台 Host Bridge 调 lime.agent 时必须显式传 modelPreference，不能只传 modelId。',
  });
  assertIncludes({
    files,
    failures,
    path: platformBridgePath,
    needle: 'BRIDGE_AGENT_FETCH_TIMEOUT_MS',
    ruleId: 'platform-bridge-agent-timeout',
    message: '平台 lime.agent 调用必须使用长超时，不能复用短连接 discovery/settings 超时。',
  });
  assertIncludes({
    files,
    failures,
    path: promptAgentPath,
    needle: "event.type !== 'artifact.snapshot'",
    ruleId: 'platform-artifact-snapshot-required',
    message: '平台 lime.agent 结果只能把 artifact.snapshot 当作交付物。',
  });
  assertIncludes({
    files,
    failures,
    path: promptAgentPath,
    needle: "event.type === 'message.delta'",
    ruleId: 'message-delta-is-runtime-event',
    message: 'message.delta 只能作为运行事件投影，不能作为 Prompt 交付物。',
  });
  assertIncludes({
    files,
    failures,
    path: promptAgentPath,
    needle: '平台协作运行未返回运行事件',
    ruleId: 'platform-runtime-facts-fail-closed',
    message: '平台 runtime 缺少运行事实时必须 fail closed。',
  });
  for (const needle of [
    'ContentStudioAgentRuntimeSessionGateway',
    'runContentStudioAgentRuntimeTurn',
    'startTurn(',
    'readSession(',
    'cancelTurn(',
    'respondAction(',
    'exportEvidence(',
    'nextEvent(timeoutMs?: number): Promise<AppServerAgentSessionEventNotification>',
    'nextRuntimeEvent(timeoutMs?: number): Promise<AppServerRuntimeEvent>',
    'APP_SERVER_AGENT_SESSION_METHODS',
  ]) {
    assertIncludes({
      files,
      failures,
      path: runtimeGatewayPath,
      needle,
      ruleId: 'agent-runtime-session-gateway-contract',
      message: 'Content Studio App Server runtime 必须保持标准 session gateway 形状，并由 @limecloud/agent-runtime-client/sessionGateway 包装成 AgentRuntimeClient。',
    });
  }
  assertIncludes({
    files,
    failures,
    path: runtimeGatewayPath,
    needle: 'APP_SERVER_AGENT_SESSION_METHODS.startTurn',
    ruleId: 'agent-runtime-gateway-start-turn-method',
    message: 'runtime gateway 的 startTurn 必须委托 App Server agentSession/turn/start current method。',
  });
  assertIncludes({
    files,
    failures,
    path: runtimeGatewayPath,
    needle: 'APP_SERVER_AGENT_SESSION_METHODS.readSession',
    ruleId: 'agent-runtime-gateway-read-session-method',
    message: 'runtime gateway 的 readSession 必须委托 App Server agentSession/read current method。',
  });
  assertIncludes({
    files,
    failures,
    path: runtimeGatewayPath,
    needle: 'APP_SERVER_AGENT_SESSION_METHODS.respondAction',
    ruleId: 'agent-runtime-gateway-respond-action-method',
    message: 'runtime gateway 的 respondAction 必须委托 App Server agentSession/action/respond current method。',
  });
  assertIncludes({
    files,
    failures,
    path: runtimeGatewayPath,
    needle: 'APP_SERVER_AGENT_SESSION_METHODS.exportEvidence',
    ruleId: 'agent-runtime-gateway-evidence-method',
    message: 'runtime gateway 的 exportEvidence 必须委托 evidence/export current method。',
  });
  assertIncludes({
    files,
    failures,
    path: runtimeGatewayPath,
    needle: 'message.method === APP_SERVER_AGENT_SESSION_METHODS.events',
    ruleId: 'agent-runtime-gateway-event-notification-method',
    message: 'runtime gateway 的 nextEvent 必须返回标准 agentSession/event notification，不能返回裸 runtime event。',
  });
  assertIncludes({
    files,
    failures,
    path: runtimeGatewayPath,
    needle: 'runtimeClient.nextEvent',
    ruleId: 'agent-runtime-gateway-internal-runtime-event-helper',
    message: '内部 turn drain 必须通过标准 AgentRuntimeClient.nextEvent 消费 notification，再由本地 guard 提取 runtime event。',
  });
  assertIncludes({
    files,
    failures,
    path: 'src/main/services/appServerSidecarService.ts',
    needle: 'runContentStudioAgentRuntimeTurn',
    ruleId: 'sidecar-uses-agent-runtime-session-gateway',
    message: 'AppServerSidecarService 只能拥有 sidecar 生命周期，turn 主链必须委托 runtime session gateway。',
  });
  assertIncludes({
    files,
    failures,
    path: 'src/main/services/appServerSidecarService.ts',
    needle: 'new ContentStudioAgentRuntimeSessionGateway',
    ruleId: 'sidecar-constructs-agent-runtime-session-gateway',
    message: 'AppServerSidecarService 必须通过标准 runtime session gateway 进入 agentSession/* 主链。',
  });

  assertIncludes({
    files,
    failures,
    path: modelStorePath,
    needle: 'type PlatformModelSettingsMigrationPayload',
    ruleId: 'platform-key-migration-private-type',
    message: '旧 key 迁移必须留在 ModelConfigStore 私有迁移类型内，不能进入 shared projection。',
  });
  assertIncludes({
    files,
    failures,
    path: modelStorePath,
    needle: 'writeSanitizedLocalConfig',
    ruleId: 'platform-migration-clears-local-key',
    message: '平台迁移成功后必须清理本地 key 字段。',
  });

  assertIncludes({
    files,
    failures,
    path: 'package.json',
    needle: '@limecloud/agent-runtime-ui',
    ruleId: 'shared-agentui-dependency',
    message: 'agents 工作台必须复用共享 AgentUI 组件依赖。',
  });
  assertIncludes({
    files,
    failures,
    path: 'package.json',
    needle: '@limecloud/agent-runtime-projection',
    ruleId: 'shared-agentui-projection-dependency',
    message: 'agents 工作台必须复用共享 AgentUI projection 依赖。',
  });
  assertIncludes({
    files,
    failures,
    path: agentsPath,
    needle: 'AgentUiProjectionSurface',
    ruleId: 'agents-uses-agentui-projection-surface',
    message: 'agents 工作台必须通过标准 AgentUI projection surface 渲染，不能在页面内散装拼运行事实。',
  });
  assertIncludes({
    files,
    failures,
    path: agentSessionPanelPath,
    needle: 'AgentUiProjectionSurface',
    ruleId: 'agent-session-panel-uses-agentui-projection-surface',
    message: '通用 AgentSessionPanel 必须通过标准 AgentUI projection surface 渲染，不能在模块内分叉过程 UI。',
  });
  for (const needle of [
    '@limecloud/agent-runtime-ui',
    'AgentTimeline',
    'RuntimeFactsPanel',
    'AgentRuntimeRefLists',
    'agent-ui-projection',
    'agent-ui-main',
    'agent-ui-sidecar',
  ]) {
    assertIncludes({
      files,
      failures,
      path: projectionSurfacePath,
      needle,
      ruleId: 'agentui-projection-surface-contract',
      message: 'AgentUI projection surface 必须集中组合共享 UI primitives，并暴露标准 DOM surface。',
    });
  }
  for (const path of [agentsPath, agentSessionPanelPath]) {
    for (const needle of [
      "from '@limecloud/agent-runtime-ui'",
      'AgentRuntimeRefLists',
    ]) {
      assertNotIncludes({
        files,
        failures,
        path,
        needle,
        ruleId: 'no-page-local-agentui-composition',
        message: '产品页面和通用面板不能直接组合共享 AgentUI primitives；必须走 AgentUiProjectionSurface。',
      });
    }
  }
  for (const needle of [
    'readModel.artifactRefs',
    'readModel.evidenceRefs',
    'event.source.artifactRefs',
    'event.source.evidenceRefs',
    'data-ref-kind',
    'data-ref-id',
    'agent-artifact-refs',
    'agent-evidence-refs',
  ]) {
    assertIncludes({
      files,
      failures,
      path: runtimeRefsPath,
      needle,
      ruleId: 'runtime-ref-surface-contract',
      message: 'ArtifactRef / EvidenceRef 过渡 surface 必须消费共享 read model 并暴露稳定 DOM contract。',
    });
  }

  assertIncludes({
    files,
    failures,
    path: 'package.json',
    needle: 'platform-host:runtime:live',
    ruleId: 'platform-host-live-gate-script',
    message: '必须保留真实 lime-desktop-platform 宿主 runtime live gate。',
  });
  assertIncludes({
    files,
    failures,
    path: platformLivePath,
    needle: 'mode=lime-desktop-platform',
    ruleId: 'platform-host-live-mode',
    message: '真实宿主 live gate 必须输出 mode=lime-desktop-platform。',
  });
  assertIncludes({
    files,
    failures,
    path: platformLivePath,
    needle: 'LIME_DESKTOP_PLATFORM_BRIDGE_DISCOVERY_PATH',
    ruleId: 'platform-host-live-discovery-path',
    message: '真实宿主 live gate 必须支持 lime-desktop-platform discovery 文件，不能只依赖 LIME_RUNTIME_BRIDGE env 注入。',
  });
  assertIncludes({
    files,
    failures,
    path: platformLivePath,
    needle: "'/attach'",
    ruleId: 'platform-host-live-discovery-attach',
    message: '真实宿主 live gate 必须通过 discovery /attach 获取 runtime session。',
  });
  assertIncludes({
    files,
    failures,
    path: platformLivePath,
    needle: "capability: 'lime.agent'",
    ruleId: 'platform-host-live-lime-agent',
    message: '真实宿主 live gate 必须调用 lime.agent。',
  });
  assertIncludes({
    files,
    failures,
    path: platformLivePath,
    needle: 'modelPreference',
    ruleId: 'platform-host-live-model-preference',
    message: '真实宿主 live gate 必须传 modelPreference。',
  });
  assertIncludes({
    files,
    failures,
    path: platformLivePath,
    needle: "event?.type === 'artifact.snapshot'",
    ruleId: 'platform-host-live-artifact',
    message: '真实宿主 live gate 必须要求 artifact.snapshot。',
  });
  assertIncludes({
    files,
    failures,
    path: projectionPath,
    needle: '@limecloud/agent-runtime-projection',
    ruleId: 'runtime-projection-shared-package',
    message: 'runtime facts 必须经共享 projection 包投影。',
  });
  assertIncludes({
    files,
    failures,
    path: agentsPath,
    needle: 'projectAgentRuntimeReadModel(activeSession)',
    ruleId: 'agents-runtime-read-model',
    message: 'agents 右侧运行事实必须消费 runtime read model projection。',
  });
  assertIncludes({
    files,
    failures,
    path: moduleOutletPath,
    needle: 'createAgentModelSettingsProjection(app)',
    ruleId: 'agents-model-settings-dedicated-projection',
    message: 'agents 模型菜单必须使用专用平台 projection，不能直接消费全量模型设置。',
  });
  assertIncludes({
    files,
    failures,
    path: modelProjectionPath,
    needle: 'export function createAgentModelSettingsProjection',
    ruleId: 'agents-model-settings-projection-export',
    message: '必须保留 agents 专用模型设置 projection。',
  });
  assertNotIncludes({
    files,
    failures,
    path: modelProjectionPath,
    needle: 'content-studio-standalone-agent',
    ruleId: 'agents-model-settings-no-standalone-agent-provider',
    message: 'standalone 下 agents 不能暴露本地 Agent Runtime provider；Prompt Agent 必须通过 lime-desktop-platform runtime bridge。',
  });
  assertNotIncludes({
    files,
    failures,
    path: modelProjectionPath,
    needle: 'App Server provider store 执行 Agent turn',
    ruleId: 'agents-model-settings-no-provider-store-copy',
    message: 'Agent 模型菜单文案不能暗示 Content Studio 独立运行时可通过本地 provider store 执行 Agent turn。',
  });
  assertIncludes({
    files,
    failures,
    path: modelProjectionPath,
    needle: 'providers: [],',
    ruleId: 'agents-model-settings-empty-standalone',
    message: 'standalone 下 agents 必须返回空 provider，避免把本地模型伪装成可执行 Agent runtime。',
  });
  assertIncludes({
    files,
    failures,
    path: modelProjectionPath,
    needle: 'const agentModels = uniqueModels(textProviders.flatMap((provider) => provider.models))',
    ruleId: 'agents-model-settings-provider-union',
    message: '平台托管 agents 模型菜单必须暴露平台 provider store 投影中的所有可用文字模型。',
  });
  assertIncludes({
    files,
    failures,
    path: modelProjectionPath,
    needle: "id: 'lime-platform-agent-text'",
    ruleId: 'agents-model-settings-synthetic-provider',
    message: '平台托管 agents 必须使用合成只读 provider 承载模型并集，避免 UI 组件隐藏其它 provider 的模型。',
  });

  assertIncludes({
    files,
    failures,
    path: agentsPath,
    needle: 'sanitizeUserFacingMessage',
    ruleId: 'agents-user-facing-sanitizer',
    message: 'agents 用户可见动态内容必须经过净化适配。',
  });
  for (const needle of ['Lime App Server', 'Provider Store', 'runtime bridge', 'API Key', 'token|secret|credential']) {
    assertIncludes({
      files,
      failures,
      path: agentsPath,
      needle,
      ruleId: 'agents-internal-term-sanitized',
      message: 'agents 动态内部词必须有用户可见文案适配。',
    });
  }
  for (const needle of ['后端接口', '等待启动协作', '进行中的目标', 'AI agent 工作台']) {
    assertNotIncludes({
      files,
      failures,
      path: agentsPath,
      needle,
      ruleId: 'agents-no-old-visible-copy',
      message: 'agents 工作台不能回流旧入口页或内部调试文案。',
    });
  }
  for (const needle of [
    'MODEL_OPTIONS',
    'agents-model-menu',
    '模型与推理设置',
    '5.5 超高',
    '5.5 高',
    '图片生成模型',
    '根据已选产品图和参考图',
    'image-chat',
  ]) {
    assertNotIncludes({
      files,
      failures,
      path: agentsPath,
      needle,
      ruleId: 'agents-no-legacy-image-chat-entry',
      message: 'agents 工作台不能回流旧图片聊天首页、模型胶囊或默认 Prompt。',
    });
  }
  assertNotIncludes({
    files,
    failures,
    path: moduleOutletPath,
    needle: 'ImageConversationHomeModule',
    ruleId: 'agents-route-no-legacy-image-chat-module',
    message: 'agents 路由必须指向独立 AgentsWorkbench，不能重新接回旧图片聊天首页。',
  });
  assertNotIncludes({
    files,
    failures,
    path: modulesCssPath,
    needle: 'modules-image-conversation-home',
    ruleId: 'agents-css-no-legacy-image-chat-import',
    message: '全局模块样式不能重新导入旧图片聊天首页样式。',
  });
  assertNotIncludes({
    files,
    failures,
    path: shellCssPath,
    needle: 'image-chat-shell',
    ruleId: 'agents-shell-no-legacy-image-chat-layout',
    message: '应用壳层不能保留旧图片聊天首页专用布局规则。',
  });

  assertIncludes({
    files,
    failures,
    path: sessionStorePath,
    needle: 'function runtimeFactOwner',
    ruleId: 'runtime-artifact-owner-projected',
    message: '上游 artifact runtime fact 必须保留 artifact owner，不能只降成本地 UI 事件。',
  });
  assertIncludes({
    files,
    failures,
    path: sessionStorePath,
    needle: "if (kind === 'draft') return 'artifact';",
    ruleId: 'runtime-draft-kind-maps-artifact-owner',
    message: 'App Server provider event 的 draft kind 必须投影为 artifact owner。',
  });
  assertIncludes({
    files,
    failures,
    path: sessionStorePath,
    needle: "eventClass: 'snapshot.updated'",
    ruleId: 'runtime-snapshot-fact-present',
    message: '会话投影必须包含 snapshot.updated 事实，供共享 AgentUI 汇总。',
  });
  for (const needle of [
    'buildStartExecutionEvents',
    'buildContinueExecutionEvents',
    'blockedProviderEvents',
    'providerRuntimeFactExecutionEvents',
    'compactProviderEvents',
    'resolvedActionTitle',
    'resolvedActionDetail',
    "owner: 'ui'",
    'Prompt 草稿未生成',
    '处理状态：',
    '恢复路径：',
  ]) {
    assertNotIncludes({
      files,
      failures,
      path: sessionStorePath,
      needle,
      ruleId: 'no-local-agent-runtime-facts',
      message: 'Agent runtime facts 只能来自 Lime App Server provider events，不能保留本地合成事件、工具、证据或假草稿。',
    });
  }
  for (const needle of [
    'browser-dev-event',
    'browser-dev-runtime',
    'DEV_RUNTIME_SCHEMA_VERSION',
    'DEV_RUNTIME_ID',
    'devRuntimeEvent',
    'devSnapshotEvent',
    'owner: \'ui\'',
  ]) {
    assertNotIncludes({
      files,
      failures,
      path: devBridgePath,
      needle,
      ruleId: 'no-browser-dev-agent-runtime-mock',
      message: '浏览器开发桥接不能伪造 Agent runtime facts；未接入 App Server 时必须 fail closed。',
    });
  }
  for (const needle of [
    '不能创建 agents 会话',
    '不能继续 agents 会话',
    'Content Studio 不再本地伪造',
  ]) {
    assertIncludes({
      files,
      failures,
      path: devBridgePath,
      needle,
      ruleId: 'browser-dev-agent-runtime-fails-closed',
      message: '浏览器开发桥接未接入 App Server runtime 时必须明确 fail closed。',
    });
  }

  assertNotMatches({
    files,
    failures,
    path: promptAgentPath,
    pattern: /from\s+['"]@anthropic-ai\/sdk['"]|from\s+['"]openai['"]|RuntimeCore|ExecutionBackend|AsterBackend/g,
    ruleId: 'no-second-runtime-or-sdk',
    message: 'Content Studio 不能在 Prompt Agent 内恢复 SDK runtime 或复制 Lime RuntimeCore。',
  });

  return failures;
}

export async function buildLimeAgentBoundaryAudit(options = {}) {
  const root = options.projectRoot ?? projectRoot;
  const targetFiles = options.targetFiles ?? TARGET_FILES;
  const files = {};
  const loadFailures = [];

  for (const path of targetFiles) {
    try {
      files[path] = await readFile(resolve(root, path), 'utf-8');
    } catch (error) {
      files[path] = '';
      loadFailures.push({
        path,
        ruleId: 'file-readable',
        message: `无法读取边界审计文件：${error instanceof Error ? error.message : String(error)}`,
        line: 1,
        match: path,
        excerpt: '',
      });
    }
  }

  const failures = [...loadFailures, ...runBoundaryChecks(files)];
  const ruleIds = new Set(failures.map((item) => item.ruleId));
  return {
    schema: 'buguai.lime-agent-boundary-audit.v1',
    checkedAt: new Date().toISOString(),
    summary: {
      files: targetFiles.length,
      failed: failures.length,
      uniqueFailedRules: ruleIds.size,
      passed: failures.length === 0,
    },
    failures,
  };
}

function printReport(report) {
  if (report.summary.failed === 0) {
    console.log(`lime agent boundary audit passed: ${report.summary.files} files.`);
    return;
  }

  console.error(`lime agent boundary audit failed: ${report.summary.failed} issue(s).`);
  for (const item of report.failures) {
    console.error(`- ${item.path}:${item.line} [${item.ruleId}] ${item.message}`);
    console.error(`  match: ${item.match}`);
    console.error(`  line: ${item.excerpt}`);
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const report = await buildLimeAgentBoundaryAudit();
  printReport(report);
  process.exit(report.summary.failed === 0 ? 0 : 1);
}
