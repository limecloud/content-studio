import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const projectRoot = resolve(new URL('..', import.meta.url).pathname);
const mainEntry = join(projectRoot, 'out/main/index.js');
const remoteDebuggingPort = 9333 + Math.floor(Math.random() * 400);
const userDataDir = mkdtempSync(join(tmpdir(), `content-studio-smoke-${randomUUID()}-`));
const workspaceDir = mkdtempSync(join(tmpdir(), `content-studio-workspace-${randomUUID()}-`));

if (!existsSync(mainEntry)) {
  console.error(`缺少 ${mainEntry}，请先运行 npm run build。`);
  process.exit(1);
}

function wait(ms) {
  return new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
}

async function waitForDebugTarget(timeoutMs = 20_000) {
  const started = Date.now();
  let lastError;
  while (Date.now() - started < timeoutMs) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${remoteDebuggingPort}/json`);
      const page = targets.find((target) => target.type === 'page' && target.webSocketDebuggerUrl);
      if (page) return page;
    } catch (error) {
      lastError = error;
    }
    await wait(250);
  }
  throw new Error(`等待 Electron 调试目标超时：${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function createCdpClient(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl);
  let nextId = 1;
  const pending = new Map();
  const exceptions = [];

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve: resolvePending, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolvePending(message.result);
      return;
    }
    if (message.method === 'Runtime.exceptionThrown') {
      exceptions.push(message.params?.exceptionDetails?.text ?? 'Runtime exception');
    }
  };

  const opened = new Promise((resolveOpen, rejectOpen) => {
    ws.onopen = resolveOpen;
    ws.onerror = () => rejectOpen(new Error('无法连接 CDP WebSocket'));
  });

  return {
    exceptions,
    async send(method, params = {}) {
      await opened;
      const id = nextId++;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((resolveSend, rejectSend) => {
        pending.set(id, { resolve: resolveSend, reject: rejectSend });
      });
    },
    close() {
      ws.close();
    },
  };
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

async function waitForRendererReady(cdp, timeoutMs = 20_000) {
  const started = Date.now();
  let lastState;
  while (Date.now() - started < timeoutMs) {
    const state = await evaluate(cdp, `(() => ({
      url: location.href,
      title: document.title,
      readyState: document.readyState,
      hasBridge: Boolean(window.contentStudio),
      text: document.body?.innerText?.slice(0, 1000) ?? ''
    }))()`);
    lastState = state;
    if (state?.readyState === 'complete' && state.hasBridge && state.text.toLowerCase().includes('content studio pipeline')) return state;
    await wait(250);
  }
  throw new Error(`Renderer 未在超时时间内完成加载或 preload bridge 缺失：${JSON.stringify(lastState)}`);
}

const child = spawn(electronPath, [projectRoot, `--remote-debugging-port=${remoteDebuggingPort}`, `--user-data-dir=${userDataDir}`], {
  cwd: projectRoot,
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1',
    CONTENT_STUDIO_SMOKE: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

const output = [];
child.stdout.on('data', (chunk) => output.push(chunk.toString()));
child.stderr.on('data', (chunk) => output.push(chunk.toString()));

let cdp;
try {
  const target = await waitForDebugTarget();
  cdp = createCdpClient(target.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  const rendererState = await waitForRendererReady(cdp);
  const bridgeState = await evaluate(cdp, `(async () => {
    const [settings, modelConfig, skills] = await Promise.all([
      window.contentStudio.getSettings(),
      window.contentStudio.getModelConfig(),
      window.contentStudio.scanSkills(),
    ]);
    const apiKeys = Object.keys(window.contentStudio).sort();
    return {
      title: document.title,
      hasBridge: Boolean(window.contentStudio),
      hasPipeline: document.body.innerText.toLowerCase().includes('content studio pipeline'),
      hasImageEngine: document.body.innerText.includes('图片引擎'),
      hasKnowledgeEntry: document.body.innerText.includes('成型知识库'),
      hasSkillsEntry: document.body.innerText.includes('Skills 管理'),
      bridgeMethodCount: apiKeys.length,
      skillsCount: skills.length,
      builtinSkillsCount: skills.filter((skill) => skill.source === 'builtin').length,
      modelConfig: {
        hasApiKey: modelConfig.hasApiKey,
        textModel: modelConfig.textModel,
        imageModels: modelConfig.imageModels,
        videoModel: modelConfig.videoModel,
      },
      settings: {
        hasAnthropicApiKey: settings.hasAnthropicApiKey,
        apiKeyStorage: settings.apiKeyStorage,
      },
    };
  })()`, true);
  const coreFlowState = await evaluate(cdp, `(async () => {
    const workspacePath = ${JSON.stringify(workspaceDir)};
    await window.contentStudio.saveSettings({ workspacePath });
    await window.contentStudio.installBuiltinKnowledgeBase('product-demo', workspacePath);
    const knowledgeBases = await window.contentStudio.listKnowledgeBases(workspacePath);
    const searchResults = await window.contentStudio.searchKnowledge({ workspacePath, query: '卖点 场景', baseType: 'product-kb', sectionType: 'all' });
    const citations = searchResults.slice(0, 3).map((result) => ({
      knowledgeBaseId: result.knowledgeBaseId,
      sectionId: result.section.id,
      title: result.baseTitle + ' / ' + result.section.title,
      sectionType: result.section.sectionType,
      excerpt: (result.section.content || result.section.summary || result.section.title).slice(0, 220),
    }));
    const promptPack = await window.contentStudio.generatePromptPack({ workspacePath, citations, name: 'Smoke 提示词包' });
    const sceneCards = await window.contentStudio.generateSceneCards({ workspacePath, promptPackId: promptPack.id, citations, count: 3 });
    const article = await window.contentStudio.generateArticle({
      workspacePath,
      articleType: 'wechat-longform',
      platform: '公众号',
      audience: '内部 smoke 测试用户',
      topic: '内容工厂 GUI smoke',
      tone: '专业、克制',
      length: 'short',
      customRequirement: '验证主链可运行。',
      citations,
      promptPackId: promptPack.id,
      sceneCardIds: sceneCards.map((card) => card.id),
      assetRefs: [],
      selectedSkillSlugs: [],
      params: { textModel: 'claude-sonnet-4-5' },
    });
    const image = await window.contentStudio.generateImage({
      workspacePath,
      productImageRefs: [],
      referenceImageRefs: [],
      prompt: sceneCards[0]?.imageMaterialSuggestion || '生成一张 smoke 场景图',
      promptMode: 'preset',
      generationMode: 'smart',
      template: '场景图',
      watermark: false,
      promptPackId: promptPack.id,
      sceneCardIds: sceneCards.map((card) => card.id),
      citations,
      selectedSkillSlugs: [],
      params: {
        textModel: 'claude-sonnet-4-5',
        imageModel: 'gpt-image-2',
        videoModel: 'veo-3.1',
        runMode: 'single',
        count: 1,
        aspectRatio: '4:5',
        resolution: '2k',
        quality: 'medium',
      },
    });
    const breakdown = await window.contentStudio.analyzeVideo({
      workspacePath,
      sourceType: 'url',
      source: 'https://example.com/smoke-video.mp4',
      dimensions: ['开头钩子', '字幕口播'],
      promptPackId: promptPack.id,
      citations,
      selectedSkillSlugs: [],
      params: { textModel: 'claude-sonnet-4-5' },
    });
    const videoScript = await window.contentStudio.generateVideoScript({
      workspacePath,
      productName: 'Smoke 产品',
      sceneBackground: '内部测试场景',
      subtitleMode: 'burned-subtitle',
      voiceStyle: '自然可信',
      customRequirement: '验证视频脚本主链。',
      ratio: '4:5',
      shotCount: 3,
      durationSeconds: 12,
      breakdownLogId: breakdown.logId,
      promptPackId: promptPack.id,
      sceneCardIds: sceneCards.map((card) => card.id),
      citations,
      assetRefs: image.assetRefs,
      selectedSkillSlugs: [],
      params: { textModel: 'claude-sonnet-4-5' },
    });
    const video = await window.contentStudio.generateVideo({
      workspacePath,
      imageAssetRefs: image.assetRefs,
      videoAssetRefs: [],
      prompt: videoScript.videoPrompt,
      script: videoScript.script,
      promptPackId: promptPack.id,
      sceneCardIds: sceneCards.map((card) => card.id),
      citations,
      selectedSkillSlugs: [],
      params: { videoModel: 'veo-3.1', aspectRatio: '4:5', durationSeconds: 12 },
    });
    const logs = await window.contentStudio.listGenerationLogs(workspacePath);
    return {
      workspacePath,
      knowledgeBaseCount: knowledgeBases.length,
      searchResultCount: searchResults.length,
      citationCount: citations.length,
      promptPackId: promptPack.id,
      sceneCardCount: sceneCards.length,
      articleLogId: article.logId,
      imageStatus: image.status,
      imageAssetCount: image.assetRefs.length,
      breakdownSegments: breakdown.segments.length,
      videoScriptShots: videoScript.storyboard.length,
      videoStatus: video.status,
      videoAssetCount: video.assetRefs.length,
      logCount: logs.length,
      logKinds: Array.from(new Set(logs.map((log) => log.kind))).sort(),
      logsWithDuration: logs.filter((log) => typeof log.durationMs === 'number').length,
    };
  })()`, true);
  const clickFlowState = await evaluate(cdp, `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const clickButton = async (label) => {
      const button = Array.from(document.querySelectorAll('button')).find((item) => item.innerText.includes(label));
      if (!button) return false;
      button.click();
      await wait(80);
      return true;
    };
    const checks = [];
    checks.push({ action: 'click video nav', clicked: await clickButton('视频引擎'), hasText: document.body.innerText.includes('视频复刻引擎') });
    checks.push({ action: 'click article nav', clicked: await clickButton('文章生成'), hasText: document.body.innerText.includes('文章生成') && document.body.innerText.includes('正文 / 发布检查') });
    checks.push({ action: 'click knowledge nav', clicked: await clickButton('成型知识库'), hasText: document.body.innerText.includes('引用检索') && document.body.innerText.includes('提示词包 / 场景库') });
    checks.push({ action: 'click assets nav', clicked: await clickButton('素材库 / 历史'), hasText: document.body.innerText.includes('生成历史 / 素材库') });
    checks.push({ action: 'click skills nav', clicked: await clickButton('Skills 管理'), hasText: document.body.innerText.includes('高级能力库') && document.body.innerText.includes('能力详情') });
    checks.push({ action: 'open settings', clicked: await clickButton('设置'), hasText: document.body.innerText.includes('设置') && document.body.innerText.includes('通用') });
    checks.push({ action: 'click model settings', clicked: await clickButton('模型'), hasText: document.body.innerText.includes('统一模型配置') && document.body.innerText.includes('API 端点') });
    checks.push({ action: 'close settings', clicked: await clickButton('完成'), hasText: !document.body.innerText.includes('API 端点') });
    return {
      checks,
      failed: checks.filter((check) => !check.clicked || !check.hasText),
      finalText: document.body.innerText.slice(0, 1000),
    };
  })()`, true);

  const failedChecks = [
    ['preload bridge', bridgeState.hasBridge],
    ['pipeline text', bridgeState.hasPipeline],
    ['image engine text', bridgeState.hasImageEngine],
    ['knowledge entry text', bridgeState.hasKnowledgeEntry],
    ['skills entry text', bridgeState.hasSkillsEntry],
    ['builtin skills >= 4', bridgeState.builtinSkillsCount >= 4],
    ['bridge methods >= 20', bridgeState.bridgeMethodCount >= 20],
    ['core flow citations >= 1', coreFlowState.citationCount >= 1],
    ['core flow scene cards >= 3', coreFlowState.sceneCardCount >= 3],
    ['core flow image asset', coreFlowState.imageAssetCount >= 1],
    ['core flow video assets', coreFlowState.videoAssetCount >= 2],
    ['core flow logs >= 7', coreFlowState.logCount >= 7],
    ['core flow duration logs >= 7', coreFlowState.logsWithDuration >= 7],
    ['click flow all checks', clickFlowState.failed.length === 0],
  ].filter(([, ok]) => !ok).map(([name]) => name);

  if (cdp.exceptions.length) {
    throw new Error(`Renderer runtime exception: ${cdp.exceptions.join('; ')}`);
  }
  if (failedChecks.length) {
    throw new Error(`GUI smoke 检查失败：${failedChecks.join(', ')}`);
  }

  console.log(JSON.stringify({ ok: true, target: { title: target.title, url: target.url }, rendererState, bridgeState, coreFlowState, clickFlowState }, null, 2));
} catch (error) {
  if (output.length) console.error(output.join('').slice(-4000));
  throw error;
} finally {
  cdp?.close();
  child.kill('SIGTERM');
  await wait(500);
  if (!child.killed) child.kill('SIGKILL');
  rmSync(userDataDir, { recursive: true, force: true });
  rmSync(workspaceDir, { recursive: true, force: true });
}
