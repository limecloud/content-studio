import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { WebSocket as UndiciWebSocket } from 'undici';

const require = createRequire(import.meta.url);
const electronPath = require('electron');
const WebSocketClient = globalThis.WebSocket ?? UndiciWebSocket;
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
  const ws = new WebSocketClient(webSocketDebuggerUrl);
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
    const text = state?.text ?? '';
    if (
      state?.readyState === 'complete'
      && state.hasBridge
      && (text.includes('布谷AI 内容工厂') || text.toLowerCase().includes('content studio pipeline'))
      && (text.includes('图片生成') || text.includes('图片引擎') || text.includes('图片素材') || text.includes('启动渲染引擎'))
    ) return state;
    await wait(250);
  }
  throw new Error(`Renderer 未在超时时间内完成加载或 preload bridge 缺失：${JSON.stringify(lastState)}`);
}

const electronArgs = [projectRoot, `--remote-debugging-port=${remoteDebuggingPort}`, `--user-data-dir=${userDataDir}`];
if (process.env.CI === 'true' && process.platform === 'linux') {
  electronArgs.push('--no-sandbox');
}

const child = spawn(electronPath, electronArgs, {
  cwd: projectRoot,
  env: {
    ...process.env,
    ELECTRON_ENABLE_LOGGING: '1',
    CONTENT_STUDIO_SMOKE: '1',
    CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY: '1',
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
    const bodyText = document.body.innerText;
    const bodyTextLower = bodyText.toLowerCase();
    return {
      title: document.title,
      hasBridge: Boolean(window.contentStudio),
      hasPipeline: bodyText.includes('布谷AI 内容工厂') || bodyTextLower.includes('content studio pipeline'),
      hasImageEngine: bodyText.includes('图片生成') || bodyText.includes('图片引擎') || bodyText.includes('图片素材') || bodyText.includes('启动渲染引擎'),
      hasKnowledgeEntry: bodyText.includes('成型知识库') || bodyText.includes('知识库'),
      hasSkillsEntry: bodyText.includes('能力管理') || bodyText.includes('Skills 管理') || bodyText.includes('SKILLS') || skills.length > 0,
      hasRedundantWorkbenchHint: document.body.innerText.includes('列表页留在主工作台') || document.body.innerText.includes('Main Workbench'),
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
    let promptPackError = '';
    try {
      await window.contentStudio.generatePromptPack({ workspacePath, citations, name: 'Smoke 提示词包' });
    } catch (error) {
      promptPackError = error instanceof Error ? error.message : String(error);
    }
    const image = await window.contentStudio.generateImage({
      workspacePath,
      productImageRefs: [],
      referenceImageRefs: [],
      prompt: '生成一张 smoke 场景图',
      promptMode: 'preset',
      generationMode: 'smart',
      template: '场景图',
      watermark: false,
      promptPackId: undefined,
      sceneCardIds: [],
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
    let breakdownError = '';
    try {
      await window.contentStudio.analyzeVideo({
        workspacePath,
        sourceType: 'url',
        source: 'https://example.com/smoke-video.mp4',
        dimensions: ['开头钩子', '字幕口播'],
        promptPackId: undefined,
        citations,
        selectedSkillSlugs: [],
        params: { textModel: 'claude-sonnet-4-5' },
      });
    } catch (error) {
      breakdownError = error instanceof Error ? error.message : String(error);
    }
    const video = await window.contentStudio.generateVideo({
      workspacePath,
      imageAssetRefs: [],
      videoAssetRefs: [],
      prompt: 'Smoke 视频队列提示词',
      script: 'Smoke 脚本',
      promptPackId: undefined,
      sceneCardIds: [],
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
      promptPackBlocked: promptPackError.includes('文字模型未配置'),
      imageStatus: image.status,
      imageAssetCount: image.assetRefs.length,
      breakdownBlocked: breakdownError.includes('视频理解模型未配置') || breakdownError.includes('真实视频理解模型未配置'),
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
      const scopes = [document.querySelector('.settings-modal'), document.querySelector('.detail-dialog-card'), document].filter(Boolean);
      const button = scopes.flatMap((scope) => Array.from(scope.querySelectorAll('button'))).find((item) => {
        const accessibleText = [item.innerText, item.getAttribute('aria-label'), item.getAttribute('title')].filter(Boolean).join(' ');
        return accessibleText.includes(label) && !item.disabled;
      });
      if (!button) return false;
      button.click();
      await wait(80);
      return true;
    };
    const clickAnyButton = async (labels) => {
      for (const label of labels) {
        if (await clickButton(label)) return true;
      }
      return false;
    };
    const checks = [];
    checks.push({ action: 'click video nav', clicked: await clickAnyButton(['视频生成', '视频引擎']), hasText: document.body.innerText.includes('视频复刻引擎') || document.body.innerText.includes('视频生成') });
    checks.push({ action: 'click article nav', clicked: await clickButton('文章生成'), hasText: document.body.innerText.includes('文章生成') && document.body.innerText.includes('正文 / 发布检查') });
    checks.push({ action: 'click knowledge nav', clicked: await clickButton('成型知识库'), hasText: document.body.innerText.includes('引用检索') && document.body.innerText.includes('提示词包 / 场景库') });
    checks.push({ action: 'click assets nav', clicked: await clickButton('素材库 / 历史'), hasText: document.body.innerText.includes('生成历史 / 素材库') });
    checks.push({ action: 'click skills nav', clicked: await clickAnyButton(['能力管理', 'Skills 管理']), hasText: (document.body.innerText.includes('内容生成能力') || document.body.innerText.includes('高级能力库')) && document.body.innerText.includes('已启用') });
    const skillDetailClicked = await clickButton('详情');
    const detailBackdrop = document.querySelector('.detail-dialog-backdrop');
    const detailCard = document.querySelector('.detail-dialog-card');
    checks.push({
      action: 'open skill detail dialog',
      clicked: skillDetailClicked,
      hasText: Boolean(detailBackdrop && detailCard) && (document.body.innerText.includes('能力详情') || document.body.innerText.toLowerCase().includes('skill detail')) && window.getComputedStyle(detailBackdrop).position === 'fixed',
    });
    checks.push({ action: 'close skill detail dialog', clicked: await clickButton('关闭'), hasText: !document.querySelector('.detail-dialog-card') });
    checks.push({ action: 'open settings', clicked: await clickButton('设置'), hasText: document.body.innerText.includes('设置') && document.body.innerText.includes('通用') });
    checks.push({ action: 'click model settings', clicked: await clickButton('模型'), hasText: (document.body.innerText.includes('生成服务连接配置') && document.body.innerText.includes('文字生成')) || (document.body.innerText.includes('Provider 连接配置') && document.body.innerText.includes('文字端点')) });
    checks.push({ action: 'close settings', clicked: await clickButton('完成'), hasText: !document.body.innerText.includes('生成服务连接配置') && !document.body.innerText.includes('文字端点') });
    return {
      checks,
      failed: checks.filter((check) => !check.clicked || !check.hasText),
      finalText: document.body.innerText.slice(0, 1000),
    };
  })()`, true);
  const uiWorkflowState = await evaluate(cdp, `(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const bodyText = () => document.body.innerText;
    const waitFor = async (label, predicate, timeoutMs = 8000) => {
      const started = Date.now();
      let lastText = '';
      while (Date.now() - started < timeoutMs) {
        lastText = bodyText();
        if (predicate()) return true;
        await wait(120);
      }
      throw new Error('UI workflow timeout: ' + label + '\\n' + lastText.slice(0, 1200));
    };
    const clickButton = async (label) => {
      const findButton = () => {
        const scopes = [document.querySelector('.settings-modal'), document.querySelector('.detail-dialog-card'), document].filter(Boolean);
        return scopes.flatMap((scope) => Array.from(scope.querySelectorAll('button'))).find((item) => {
          const accessibleText = [item.innerText, item.getAttribute('aria-label'), item.getAttribute('title')].filter(Boolean).join(' ');
          return accessibleText.includes(label) && !item.disabled;
        });
      };
      await waitFor('button ' + label, () => Boolean(findButton()), 6000);
      const button = findButton();
      if (!button) throw new Error('按钮不可点击：' + label);
      button.click();
      await wait(120);
    };
    const clickAnyButton = async (labels) => {
      let lastLabel = labels[labels.length - 1];
      for (const label of labels) {
        try {
          await clickButton(label);
          return;
        } catch {
          lastLabel = label;
        }
      }
      throw new Error('按钮不可点击：' + lastLabel);
    };
    const checks = [];

    await waitFor('default workspace ready', () => !bodyText().includes('尚未选择工作区') && !bodyText().includes('请先选择工作区'));
    checks.push({ step: 'default workspace ready', ok: true });

    await clickButton('生成提示词包');
    await waitFor('prompt pack blocked', () => bodyText().includes('文字模型未配置'));
    checks.push({ step: 'prompt pack blocked without provider', ok: true });

    await clickButton('文章生成');
    await clickButton('生成大纲 / 正文 / 发布检查');
    await waitFor('article blocked', () => bodyText().includes('文字模型未配置'));
    checks.push({ step: 'article blocked without provider', ok: true });

    await clickAnyButton(['图片生成', '图片引擎']);
    await clickButton('启动渲染引擎');
    await waitFor('image blocked', () => (bodyText().includes('图片生成服务未配置') || bodyText().includes('图片 provider 未配置')) && bodyText().includes('未生成占位素材'));
    checks.push({ step: 'image blocked without provider', ok: true });

    await clickAnyButton(['视频生成', '视频引擎']);
    await clickButton('真实拆解');
    await waitFor('video breakdown blocked', () => bodyText().includes('请先选择本地视频') || bodyText().includes('真实视频理解模型未配置'));
    checks.push({ step: 'video breakdown blocked without provider', ok: true });
    await clickButton('生成脚本');
    await waitFor('video script blocked', () => bodyText().includes('文字模型未配置'));
    checks.push({ step: 'video script blocked without provider', ok: true });
    await clickButton('生成视频队列');
    await waitFor('video queue blocked', () => (bodyText().includes('视频生成服务未配置') || bodyText().includes('视频 provider 未配置')) && bodyText().includes('队列产物'));
    checks.push({ step: 'video queue blocked', ok: true });

    await clickButton('素材库 / 历史');
    await waitFor('history hydrated', () => bodyText().includes('生成历史 / 素材库') && bodyText().includes('图片素材生成未完成') && bodyText().includes('视频生成队列请求'));
    checks.push({ step: 'history hydrated', ok: true });

    await clickAnyButton(['能力管理', 'Skills 管理']);
    await waitFor('skills usable', () => (bodyText().includes('内容生成能力') || bodyText().includes('高级能力库')) && bodyText().includes('已启用') && !bodyText().includes('选择工作区后可启用') && !bodyText().includes('选择 workspace 后可启用'));
    checks.push({ step: 'skills usable', ok: true });

    return {
      checks,
      workspaceLabel: Array.from(document.querySelectorAll('.workspace-card strong')).map((item) => item.innerText).join(' '),
      finalText: bodyText().slice(0, 1400),
    };
  })()`, true);
  const scrollState = await evaluate(cdp, `(() => {
    const stage = document.querySelector('.stage');
    const params = document.querySelector('.params-panel');
    if (!stage || !params) return { ok: false, reason: 'missing stage or params scroll container' };
    stage.scrollTop = 0;
    params.scrollTop = 0;
    const stageScrollable = stage.scrollHeight > stage.clientHeight;
    const paramsScrollable = params.scrollHeight > params.clientHeight;
    stage.scrollTop = stage.scrollHeight;
    params.scrollTop = params.scrollHeight;
    return {
      ok: stageScrollable && stage.scrollTop > 0 && (!paramsScrollable || params.scrollTop > 0),
      stage: { scrollHeight: stage.scrollHeight, clientHeight: stage.clientHeight, scrollTop: stage.scrollTop },
      params: { scrollHeight: params.scrollHeight, clientHeight: params.clientHeight, scrollTop: params.scrollTop },
    };
  })()`);

  const failedChecks = [
    ['preload bridge', bridgeState.hasBridge],
    ['pipeline text', bridgeState.hasPipeline],
    ['image engine text', bridgeState.hasImageEngine],
    ['knowledge entry text', bridgeState.hasKnowledgeEntry],
    ['skills entry text', bridgeState.hasSkillsEntry],
    ['redundant workbench hint removed', !bridgeState.hasRedundantWorkbenchHint],
    ['builtin skills >= 4', bridgeState.builtinSkillsCount >= 4],
    ['bridge methods >= 20', bridgeState.bridgeMethodCount >= 20],
    ['core flow citations >= 1', coreFlowState.citationCount >= 1],
    ['core flow prompt pack blocked', coreFlowState.promptPackBlocked],
    ['core flow image blocked without asset', coreFlowState.imageStatus === 'blocked' && coreFlowState.imageAssetCount === 0],
    ['core flow video breakdown blocked', coreFlowState.breakdownBlocked],
    ['core flow video assets', coreFlowState.videoAssetCount >= 2],
    ['core flow logs >= 4', coreFlowState.logCount >= 4],
    ['core flow duration logs >= 4', coreFlowState.logsWithDuration >= 4],
    ['click flow all checks', clickFlowState.failed.length === 0],
    ['ui workflow all checks', uiWorkflowState.checks.length >= 8],
    ['stage and params scrollable', scrollState.ok],
  ].filter(([, ok]) => !ok).map(([name]) => name);

  if (cdp.exceptions.length) {
    throw new Error(`Renderer runtime exception: ${cdp.exceptions.join('; ')}`);
  }
  if (failedChecks.length) {
    throw new Error(`GUI smoke 检查失败：${failedChecks.join(', ')}`);
  }

  console.log(JSON.stringify({ ok: true, target: { title: target.title, url: target.url }, rendererState, bridgeState, coreFlowState, clickFlowState, uiWorkflowState, scrollState }, null, 2));
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
