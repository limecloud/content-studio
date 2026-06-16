import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mainEntry = join(projectRoot, 'out/main/index.js');
const resourcesDir = join(projectRoot, 'resources');
const electronArgs = process.env.CI === 'true' && process.platform === 'linux' ? ['--no-sandbox'] : [];
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const realModelConfigPath = process.env.CONTENT_STUDIO_E2E_MODEL_CONFIG
  || join(homedir(), 'Library', 'Application Support', 'content-studio', 'model-config.json');
const liveGeminiEnabled = process.env.CONTENT_STUDIO_E2E_LIVE_GEMINI === '1';
const liveGeminiProviderId = process.env.CONTENT_STUDIO_E2E_LIVE_PROVIDER
  || 'custom-e8e8f6b8-460b-4e74-9421-db92a177c8bf';
const liveGeminiModelId = process.env.CONTENT_STUDIO_E2E_LIVE_MODEL || 'gemini-2.5-flash';
const liveGeminiAppServerDataDir = process.env.CONTENT_STUDIO_E2E_APP_SERVER_DATA_DIR
  || join(homedir(), 'Library', 'Application Support', 'content-studio', 'app-server');
const appServerBinaryName = process.platform === 'win32' ? 'app-server.exe' : 'app-server';
const platformKey = `${process.platform}-${process.arch}`;
const COMMAND_CENTER_MAX_HEIGHT = {
  compact: 120,
  managed: 195,
  flow: 220,
};
const NAV_BUTTON_LABELS = new Set([
  'agents',
  '图片生成',
  'AI 生图',
  '拆解素材',
  '绿幕文案图',
  '视频生成',
  'AI 视频',
  '视频脚本',
  '视频 Prompt',
  '成品视频导入',
  '混剪包导出',
  '成型知识库',
  '品牌 / 产品知识库',
  '素材库',
  'skills 管理',
]);
const AGENTS_FORBIDDEN_TERMS = [
  '本地输入源：',
  '输出要求：',
  '团队知识包：',
  '输入源快照：',
  '内容工厂的 Prompt 生成 Agent',
  '本轮 skill 执行规范',
  'Skills',
  'Lime App Server',
  'Lime Agent Server',
  'App Server',
  'Provider Store',
  'Provider projection',
  'runtime bridge',
  'Product App',
  'API Key',
  'credential',
  'secret',
  'token',
  'backend',
  'artifact',
  'session',
  'blocked:',
];
const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data, 'utf8');
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createSkillPackageBuffer(slug) {
  return createStoredZip([
    {
      name: `${slug}/SKILL.md`,
      data: [
        '---',
        'name: Drag Install Skill',
        'description: 用于验证拖拽安装的本地 skill。',
        '---',
        '',
        '# Drag Install Skill',
        '',
        '拖拽安装后应该进入当前工作区 .bugu/skills。',
        '',
      ].join('\n'),
    },
  ]);
}

async function launchContentStudio(testInfo, options = {}) {
  if (!existsSync(mainEntry)) {
    throw new Error(`缺少 ${mainEntry}，请先运行 npm run build。`);
  }

  const userDataDir = await mkdtemp(join(tmpdir(), 'content-studio-playwright-user-'));
  const workspaceDir = await mkdtemp(join(tmpdir(), 'content-studio-playwright-workspace-'));
  const e2eProductAssetPath = join(workspaceDir, 'hero-product.png');
  const e2eVideoAssetPath = join(workspaceDir, 'third-party-finished-video.mp4');
  const e2eAudioAssetPath = join(workspaceDir, 'voiceover-reference.mp3');
  await writeFile(e2eProductAssetPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
  await writeFile(e2eVideoAssetPath, 'content-studio-e2e-video');
  await writeFile(e2eAudioAssetPath, 'content-studio-e2e-audio');
  if (options.modelConfigPath) {
    if (!existsSync(options.modelConfigPath)) {
      throw new Error(`缺少真实模型配置：${options.modelConfigPath}`);
    }
    await copyFile(options.modelConfigPath, join(userDataDir, 'model-config.json'));
  }
  if (options.platformModelSettings) {
    await mkdir(join(userDataDir, 'state'), { recursive: true });
    await writeFile(
      join(userDataDir, 'state', 'model-settings.json'),
      `${JSON.stringify(options.platformModelSettings, null, 2)}\n`,
      'utf8',
    );
  }
  const diagnostics = [];

  const electronApp = await electron.launch({
    executablePath: electronExecutable,
    args: [projectRoot, `--user-data-dir=${userDataDir}`, ...electronArgs],
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
      CONTENT_STUDIO_E2E: '1',
      CONTENT_STUDIO_TEST_SILENT: process.env.CONTENT_STUDIO_TEST_SILENT ?? '1',
      CONTENT_STUDIO_E2E_ASSET_SELECTIONS: JSON.stringify({
        'product-image': [e2eProductAssetPath],
        'reference-image': [e2eProductAssetPath],
        'image-material': [e2eProductAssetPath],
        video: [e2eVideoAssetPath],
        audio: [e2eAudioAssetPath],
      }),
      CONTENT_STUDIO_USER_DATA_DIR: userDataDir,
      CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY: options.requireExplicitTextKey === false ? '0' : '1',
      CONTENT_STUDIO_RESOURCES_DIR: resourcesDir,
      CONTENT_STUDIO_DISABLE_EMBEDDED_PLATFORM_HOST: options.useEmbeddedPlatformHost ? '0' : '1',
      ...(options.env ?? {}),
    },
  });

  electronApp.on('console', (message) => {
    diagnostics.push(`[main:${message.type()}] ${message.text()}`);
  });

  const page = await electronApp.firstWindow();
  page.on('console', (message) => {
    diagnostics.push(`[renderer:${message.type()}] ${message.text()}`);
  });
  page.on('pageerror', (error) => {
    diagnostics.push(`[renderer:pageerror] ${error.message}`);
  });

  const expectedShellSelector = options.expectAuthGate ? '.bugu-auth-shell' : '.app-shell';
  await expect.poll(
    async () => page.evaluate((selector) => Boolean(window.contentStudio) && Boolean(document.querySelector(selector)), expectedShellSelector),
    { message: options.expectAuthGate ? '等待 Electron preload bridge 和登录页加载完成' : '等待 Electron preload bridge 和主工作台加载完成', timeout: 30_000 },
  ).toBe(true);

  return { electronApp, page, userDataDir, workspaceDir, e2eProductAssetPath, e2eVideoAssetPath, diagnostics, testInfo };
}

async function closeContentStudio(app) {
  await app.electronApp.close().catch(() => undefined);
  await Promise.all([
    rm(app.userDataDir, { recursive: true, force: true }),
    rm(app.workspaceDir, { recursive: true, force: true }),
  ]);
}

async function attachDiagnostics(app, testInfo) {
  const bodyText = await app.page.locator('body').innerText().catch((error) => `无法读取 body：${error.message}`);
  const screenshot = await app.page.screenshot({ fullPage: true }).catch(() => null);
  if (screenshot) {
    await testInfo.attach('electron-window.png', { body: screenshot, contentType: 'image/png' });
  }
  await testInfo.attach('body-text.txt', { body: bodyText, contentType: 'text/plain' });
  await testInfo.attach('console.txt', { body: app.diagnostics.join('\n'), contentType: 'text/plain' });
}

async function withContentStudio(testInfo, callback, options) {
  const app = await launchContentStudio(testInfo, options);
  try {
    await callback(app);
  } catch (error) {
    await attachDiagnostics(app, testInfo);
    throw error;
  } finally {
    await closeContentStudio(app);
  }
}

async function closeHttpServer(server) {
  server.closeAllConnections?.();
  server.closeIdleConnections?.();
  await new Promise((resolveClose) => server.close(resolveClose));
}

function createAppServerRpcClient(dataDir) {
  const binaryPath = resolveE2eAppServerBinary();
  const child = spawn(binaryPath, ['--stdio', '--backend', 'runtime', '--data-dir', dataDir], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: {
      PATH: process.env.PATH || '',
      HOME: process.env.HOME || '',
      TMPDIR: process.env.TMPDIR || '',
      ELECTRON_RUN_AS_NODE: '1',
    },
  });
  const pending = new Map();
  let nextId = 1;
  let stderr = '';
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  createInterface({ input: child.stdout }).on('line', (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message.id || !pending.has(message.id)) return;
    const handler = pending.get(message.id);
    pending.delete(message.id);
    handler(message);
  });
  child.once('exit', (code, signal) => {
    const error = new Error(`app-server exited: code=${code ?? 'null'} signal=${signal ?? 'null'} stderr=${stderr.trim()}`);
    for (const handler of pending.values()) handler({ error });
    pending.clear();
  });
  return {
    request(method, params = {}, timeoutMs = 30_000) {
      const id = nextId++;
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
      return new Promise((resolveRequest, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs}ms stderr=${stderr.trim()}`));
        }, timeoutMs);
        pending.set(id, (message) => {
          clearTimeout(timer);
          if (message.error) reject(new Error(message.error.message || JSON.stringify(message.error)));
          else resolveRequest(message.result);
        });
      });
    },
    notify(method, params = {}) {
      child.stdin.write(`${JSON.stringify({ method, params })}\n`);
    },
    close() {
      child.kill('SIGTERM');
    },
  };
}

function resolveE2eAppServerBinary() {
  const candidates = [
    process.env.APP_SERVER_BIN,
    join(resourcesDir, 'app-server', 'current', appServerBinaryName),
    join(resourcesDir, 'app-server', platformKey, appServerBinaryName),
    join(projectRoot, '..', '..', 'aiclientproxy', 'lime', 'dist-electron', 'app-server', platformKey, appServerBinaryName),
    join(projectRoot, '..', '..', 'aiclientproxy', 'lime', 'lime-rs', 'target', 'debug', appServerBinaryName),
  ].filter(Boolean);
  const binaryPath = candidates.find((candidate) => existsSync(candidate));
  if (!binaryPath) {
    throw new Error(`缺少 E2E App Server binary，已检查：${candidates.join(', ')}`);
  }
  return binaryPath;
}

async function seedOpenAIProviderStore({ dataDir, baseUrl, model = 'test-text-model', apiKey = 'test-text-key' }) {
  const rpc = createAppServerRpcClient(dataDir);
  try {
    await rpc.request('initialize', {
      clientInfo: { name: 'content-studio-e2e-provider-seed', version: '0.0.0' },
      capabilities: { experimentalApi: false, optOutNotificationMethods: [] },
    });
    rpc.notify('initialized');
    const listed = await rpc.request('modelProvider/list', {});
    const providers = Array.isArray(listed?.providers) ? listed.providers : [];
    const provider = providers.find((item) => item.id === 'openai') || providers.find((item) => item.type === 'openai-response');
    if (!provider?.id) throw new Error('App Server provider store 缺少 OpenAI provider。');
    await rpc.request('modelProvider/update', {
      providerId: provider.id,
      patch: {
        enabled: true,
        apiHost: baseUrl.replace(/\/+$/, ''),
        customModels: [model],
      },
    });
    await rpc.request('modelProviderKey/create', {
      providerId: provider.id,
      apiKey,
      alias: 'Content Studio E2E text model',
      replaceExisting: true,
    });
  } finally {
    rpc.close();
  }
}

async function clickButton(page, label) {
  if (NAV_BUTTON_LABELS.has(label)) {
    await clickNavItem(page, label);
    return;
  }

  if (label === '设置') {
    const settingsButton = page.locator('.content-studio-platform-account-entry .lime-account-entry-settings').first();
    if (await settingsButton.isVisible().catch(() => false)) {
      await settingsButton.click();
      return;
    }
  }

  const scopes = [
    page.locator('.lime-settings-dialog'),
    page.locator('.detail-dialog-card'),
    page.locator('body'),
  ];
  for (const scope of scopes) {
    const textButtons = scope.locator('button').filter({ hasText: label });
    for (let index = 0; index < await textButtons.count(); index += 1) {
      const candidate = textButtons.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        return;
      }
    }
    const namedButtons = scope.locator(`button[aria-label="${label}"], button[title="${label}"]`);
    for (let index = 0; index < await namedButtons.count(); index += 1) {
      const candidate = namedButtons.nth(index);
      if (await candidate.isVisible().catch(() => false)) {
        await candidate.click();
        return;
      }
    }
  }
  throw new Error(`未找到可点击按钮：${label}`);
}

async function clickNavItem(page, label) {
  await ensureSidebarExpanded(page);
  await expandAllNavGroups(page);
  if (label === 'agents' || label === 'skills 管理') {
    const actionTitle = label === 'agents' ? '新对话' : 'skills 管理';
    const agentItem = page.locator(`.nav-stack button.agent-nav-action[title="${actionTitle}"]`).first();
    await expect(agentItem, `${label} 入口应存在`).toBeVisible();
    await agentItem.click();
    return;
  }

  const escapedLabel = label.replace(/"/g, '\\"');
  const semanticItem = page.locator(
    `.nav-stack button.nav-item[aria-label="${escapedLabel}"], .nav-stack button.nav-item[title="${escapedLabel}"]`,
  ).first();
  const item = await semanticItem.count() > 0
    ? semanticItem
    : page.locator('.nav-stack button.nav-item').filter({ hasText: label }).first();
  await expect(item, `导航项应存在：${label}`).toBeVisible();
  await item.click();
}

async function openArticleWorkbenchFromAgents(page) {
  await clickNavItem(page, 'agents');
  await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
  await clickButton(page, '打开文案工作台');
  await expect(page.locator('.article-module-workbench')).toBeVisible({ timeout: 20_000 });
}

async function addAgentsProductImage(page) {
  await page.locator('.agents-entry-composer button[aria-label="添加输入"]').first().click();
  const addMenu = page.locator('.agents-entry .agents-add-menu');
  await expect(addMenu).toBeVisible({ timeout: 20_000 });
  await addMenu.locator('button').filter({ hasText: '添加照片和文件' }).first().click();
}

async function expectAgentsProductImageCount(page, count) {
  const addButton = page.locator('.agents-entry-composer button[aria-label="添加输入"]').first();
  await addButton.click();
  const addMenu = page.locator('.agents-entry .agents-add-menu');
  await expect(addMenu).toContainText(`产品图 ${count}`, { timeout: 20_000 });
  await addButton.click();
  await expect(addMenu).toHaveCount(0);
}

async function expectNavLabelAbsent(page, label) {
  await expect.poll(
    async () => page.locator('.nav-stack .nav-label').evaluateAll(
      (items, expected) => items.filter((item) => item.textContent?.trim() === expected).length,
      label,
    ),
    { message: `导航项不应作为一级入口出现：${label}` },
  ).toBe(0);
}

async function expectNavLabelVisible(page, label) {
  if (label === 'agents') {
    await expect(page.locator('.nav-stack .agent-nav-root'), 'agents 一级入口应存在').toBeVisible();
    return;
  }
  if (label === 'skills 管理') {
    await expect(
      page.locator('.nav-stack button.agent-nav-action[title="skills 管理"]').first(),
      'skills 管理入口应存在',
    ).toBeVisible();
    return;
  }
  await expect.poll(
    async () => page.locator('.nav-stack .nav-label').evaluateAll(
      (items, expected) => items.filter((item) => item.textContent?.trim() === expected).length,
      label,
    ),
    { message: `导航项应作为普通用户入口出现：${label}` },
  ).toBeGreaterThan(0);
}

async function expandAllNavGroups(page) {
  await ensureSidebarExpanded(page);
  const collapsedGroupToggles = page.locator('.nav-group-toggle[aria-expanded="false"], .agent-nav-root[aria-expanded="false"]');
  while (await collapsedGroupToggles.count()) {
    await collapsedGroupToggles.first().click();
  }
}

async function expectDefaultNavGroupCollapse(page) {
  const groups = await page.locator('.nav-group-toggle').evaluateAll((buttons) =>
    buttons.map((button) => ({
      label: button.textContent?.replace(/[+−-]/g, '').trim(),
      expanded: button.getAttribute('aria-expanded'),
    })),
  );
  expect(groups.length, JSON.stringify(groups)).toBeGreaterThanOrEqual(2);
  for (const group of groups) {
    expect(group.expanded, JSON.stringify(groups)).toBe('false');
  }
}

async function expectNotStaticV2Page(page) {
  await expect(page.locator('.v2-feature-workbench')).toHaveCount(0);
  await expect(page.getByText('实现边界')).toHaveCount(0);
  await expect(page.getByText('PRD 映射')).toHaveCount(0);
  await expect(page.getByText(/US-\d{2}|UC-\d{2}/)).toHaveCount(0);
}

async function expectCommandCenter(page, selector, density) {
  const center = page.locator(selector).first();
  await expect(center).toBeVisible();
  await expect(center).toHaveAttribute('data-density', density);
  const height = await center.evaluate((element) => Math.round(element.getBoundingClientRect().height));
  expect(
    height,
    `${selector} 顶部高度 ${height}px 超过 ${density} 上限 ${COMMAND_CENTER_MAX_HEIGHT[density]}px`,
  ).toBeLessThanOrEqual(COMMAND_CENTER_MAX_HEIGHT[density]);
  if (density === 'compact') {
    await expect(center.locator('.module-command-top p:not(.eyebrow)')).toHaveCount(0);
  }
}

async function expectRectNear(locator, expected, tolerance = 3) {
  const rect = await locator.first().boundingBox();
  expect(rect, `${locator} 应该有可测量尺寸`).not.toBeNull();
  if (typeof expected.width === 'number') {
    expect(Math.abs(rect.width - expected.width), `宽度 ${rect.width}px 应接近 ${expected.width}px`).toBeLessThanOrEqual(tolerance);
  }
  if (typeof expected.height === 'number') {
    expect(Math.abs(rect.height - expected.height), `高度 ${rect.height}px 应接近 ${expected.height}px`).toBeLessThanOrEqual(tolerance);
  }
}

async function expectOverlayCoversSidebar(page, overlaySelector) {
  const hitTest = await page.evaluate((selector) => {
    const points = [
      { name: 'brand', x: 40, y: 40 },
      { name: 'collapse', x: 64, y: Math.round(window.innerHeight / 2) },
      { name: 'nav', x: 40, y: 220 },
    ];
    return points.map((point) => {
      const element = document.elementFromPoint(point.x, point.y);
      return {
        ...point,
        coveredByOverlay: Boolean(element?.closest(selector)),
        topClassName: element instanceof HTMLElement ? element.className : '',
        topText: element instanceof HTMLElement ? element.textContent?.trim().slice(0, 40) : '',
      };
    });
  }, overlaySelector);
  expect(
    hitTest.every((item) => item.coveredByOverlay),
    JSON.stringify(hitTest),
  ).toBe(true);
}

async function expectOverlayAboveFloatingControl(page, overlaySelector, floatingSelector) {
  const hitTest = await page.evaluate(({ overlaySelector: overlay, floatingSelector: floating }) => {
    const floatingElement = document.querySelector(floating);
    const overlayElement = document.querySelector(overlay);
    if (!(floatingElement instanceof HTMLElement) || !(overlayElement instanceof HTMLElement)) {
      return { ok: false, reason: 'missing overlay or floating control' };
    }
    const rect = floatingElement.getBoundingClientRect();
    const x = Math.round(rect.left + rect.width / 2);
    const y = Math.round(rect.top + rect.height / 2);
    const topElement = document.elementFromPoint(x, y);
    return {
      ok: Boolean(topElement?.closest(overlay)),
      x,
      y,
      overlayZ: Number(getComputedStyle(overlayElement).zIndex),
      floatingZ: Number(getComputedStyle(floatingElement).zIndex),
      topClassName: topElement instanceof HTMLElement ? topElement.className : '',
      topText: topElement instanceof HTMLElement ? topElement.textContent?.trim().slice(0, 40) : '',
    };
  }, { overlaySelector, floatingSelector });
  expect(hitTest.ok, JSON.stringify(hitTest)).toBe(true);
  expect(hitTest.overlayZ, JSON.stringify(hitTest)).toBeGreaterThan(hitTest.floatingZ);
}

async function ensureSidebarExpanded(page) {
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 1440) {
    await page.setViewportSize({ width: 1600, height: viewport.height });
  }
  if (await page.locator('.app-shell').getAttribute('data-sidebar') === 'expanded') return;
  await page.getByRole('button', { name: '展开侧边栏' }).first().click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-sidebar', 'expanded');
}

async function ensureParamsPanelExpanded(page) {
  if (await page.locator('.app-shell').getAttribute('data-params') === 'expanded') return;
  await page.getByRole('button', { name: '展开右侧参数栏' }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-params', 'expanded');
}

async function clickVideoStageTab(page, label) {
  const tab = page.locator('.video-stage-tabs button').filter({ hasText: label }).first();
  await expect(tab, `视频步骤页签应存在：${label}`).toBeVisible();
  await tab.click();
}

async function clickVideoAction(page, label) {
  const action = page.locator('.video-replica-workbench button.primary, .video-replica-workbench button.ghost').filter({ hasText: label }).first();
  await expect(action, `视频动作按钮应存在：${label}`).toBeVisible();
  await expect(action, `视频动作按钮应可点击：${label}`).toBeEnabled();
  await action.click();
}

async function assertVideoWorkbenchLayout(page) {
  const layout = await page.evaluate(() => {
    const workbench = document.querySelector('.video-replica-workbench');
    const activeLayout = document.querySelector('.video-stage-layout');
    const tabs = document.querySelector('.video-stage-tabs');
    const measured = Array.from(document.querySelectorAll(
      '.video-replica-workbench, .video-stage-tabs button, .video-card, .video-dimension-grid button, .video-summary-row span',
    )).map((element) => {
      const rect = element.getBoundingClientRect();
      return {
        selector: element.className || element.tagName,
        text: (element.textContent || '').trim().slice(0, 40),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        overflowX: element.scrollWidth > element.clientWidth + 1,
      };
    });
    return {
      hasWorkbench: Boolean(workbench),
      activeLayoutClass: activeLayout?.className ?? '',
      tabCount: tabs?.querySelectorAll('button').length ?? 0,
      workbenchOverflow: workbench ? window.getComputedStyle(workbench).overflow : '',
      activeLayoutOverflowY: activeLayout ? window.getComputedStyle(activeLayout).overflowY : '',
      badOverflows: measured.filter((item) => item.overflowX),
      measured,
    };
  });
  expect(layout.hasWorkbench, JSON.stringify(layout)).toBe(true);
  expect(layout.tabCount, JSON.stringify(layout)).toBe(5);
  expect(layout.workbenchOverflow, JSON.stringify(layout)).toBe('hidden');
  expect(layout.activeLayoutOverflowY, JSON.stringify(layout)).toMatch(/auto|scroll/);
  expect(layout.badOverflows, JSON.stringify(layout.badOverflows)).toEqual([]);
}

async function startFakeOpenAITextServer(onPrompt) {
  const requests = [];
  const server = createServer((request, response) => {
    if (request.url === '/v1/responses') {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => {
        const payload = JSON.parse(body);
        const input = Array.isArray(payload.input) ? payload.input : [];
        const userMessage = input
          .flatMap((item) => Array.isArray(item.content) ? item.content : [item.content])
          .map((item) => typeof item === 'string' ? item : item?.text)
          .filter((item) => typeof item === 'string')
          .join('\n');
        requests.push({ body, userMessage: String(userMessage) });
        const content = JSON.stringify(onPrompt(String(userMessage)));
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          output_text: content,
          output: [{
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: content }],
          }],
        }));
      });
      return;
    }
    if (request.url === '/v1/chat/completions') {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => {
        const payload = JSON.parse(body);
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const userMessage = messages.find((message) => message.role === 'user')?.content ?? '';
        requests.push({ body, userMessage: String(userMessage) });
        const content = JSON.stringify(onPrompt(String(userMessage)));
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ choices: [{ message: { content } }] }));
      });
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
  const baseUrl = await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('无法启动本地文字生成服务。');
      resolveListen(`http://127.0.0.1:${address.port}/v1`);
    });
  });
  return { server, baseUrl, requests };
}

async function startFakePlatformRuntimeBridge(options = {}) {
  const requests = [];
  const token = options.token ?? 'platform-runtime-e2e-token';
  const defaultAppearance = {
    colorTheme: 'emerald',
    fontScale: 1,
    serifEnabled: false,
  };
  const snapshot = options.snapshot ?? {
    hostKind: 'electron',
    hostVersion: 'e2e',
    appId: 'content-studio',
    entryKey: 'content-studio-agents-e2e',
    locale: 'zh-CN',
    theme: 'light',
    appearance: defaultAppearance,
    modelSettingsVersion: 'e2e-model-settings',
  };
  const modelSettings = options.modelSettings ?? {
    version: 'e2e-model-settings',
    updatedAt: '2026-06-09T00:00:00.000Z',
    defaultAgentProviderId: 'platform-openai',
    defaultTextModelId: 'test-text-model',
    providers: [{
      id: 'platform-openai',
      displayName: 'Platform OpenAI',
      protocol: 'openai-compatible',
      capabilityKinds: ['text'],
      enabled: true,
      apiKeyConfigured: true,
      authType: 'api-key',
      baseUrl: 'https://api.openai.example/v1',
      useResponsesApi: true,
      models: ['test-text-model'],
    }, {
      id: 'platform-anthropic',
      displayName: 'Platform Anthropic',
      protocol: 'anthropic-compatible',
      capabilityKinds: ['text'],
      enabled: true,
      apiKeyConfigured: true,
      authType: 'api-key',
      baseUrl: 'https://api.anthropic.example/v1',
      models: ['other-provider-text-model'],
    }],
  };

  const writeJson = (response, statusCode, payload) => {
    response.statusCode = statusCode;
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify(payload));
  };

  const server = createServer((request, response) => {
    if (request.method !== 'POST') {
      writeJson(response, 405, { ok: false, error: { code: 'method_not_allowed', message: 'method not allowed' } });
      return;
    }
    if (request.headers.authorization !== `Bearer ${token}`) {
      writeJson(response, 401, { ok: false, error: { code: 'unauthorized', message: 'unauthorized' } });
      return;
    }

    let body = '';
    request.on('data', (chunk) => { body += chunk.toString(); });
    request.on('end', () => {
      const payload = body ? JSON.parse(body) : {};
      requests.push({ url: request.url, body: payload });

      if (request.url === '/snapshot') {
        writeJson(response, 200, { ok: true, snapshot });
        return;
      }

      if (request.url === '/capability/invoke') {
        if (payload.capability === 'lime.modelSettings') {
          if (payload.operation === 'model-settings/read' || payload.operation === 'model-settings/save') {
            writeJson(response, 200, {
              ok: true,
              result: {
                ok: true,
                requestId: `model-settings-${payload.operation}`,
                output: payload.operation === 'model-settings/save'
                  ? payload.input?.settings ?? modelSettings
                  : modelSettings,
                event: {},
              },
            });
            return;
          }
        }

        if (payload.capability === 'lime.agent' && payload.operation === 'agentSession/turn/start') {
          const input = payload.input ?? {};
          const prompt = typeof input.prompt === 'string' ? input.prompt : '';
          const userIntent = prompt.match(/用户意图：([\s\S]*?)(\n场景卡：|\n团队知识包：|$)/)?.[1]?.trim() || prompt;
          const defaultDraftContent = [
            '# 真实生活场景图片 Prompt',
            '',
            '目标：基于产品图生成自然生活化的图片候选。',
            '',
            `用户意图：${userIntent}`,
            '',
            '画面：保留产品主体，使用手机实拍视角，背景为日常桌面或办公室抽屉。',
            '',
            '负面约束：避免棚拍感、夸张光效和不可追溯功效表达。',
          ].join('\n');
          const draftContent = typeof options.agentDraftContent === 'string'
            ? options.agentDraftContent
            : defaultDraftContent;
          const artifactTitle = typeof options.agentArtifactTitle === 'string'
            ? options.agentArtifactTitle
            : 'E2E agents Prompt Draft';
          const modelId = input.runtimeOptions?.modelId || input.modelPolicy?.preferredModelId || 'test-text-model';
          const baseRuntimeEvent = (event, sequence) => ({
            sessionId: 'platform-session-e2e',
            threadId: 'platform-thread-e2e',
            turnId: 'platform-turn-e2e',
            ...event,
            sequence,
            payload: event.payload ?? {},
          });
          const extraRuntimeEvents = Array.isArray(options.agentRuntimeEvents)
            ? options.agentRuntimeEvents.map((event, index) => baseRuntimeEvent(event, index + 2))
            : [];
          const agentEvents = [
            baseRuntimeEvent({
              type: 'message.delta',
              payload: {
                text: draftContent,
                model: modelId,
                title: options.agentMessageTitle,
              },
            }, 1),
            ...extraRuntimeEvents,
          ];
          if (!options.omitAgentArtifact) {
            agentEvents.push(baseRuntimeEvent({
              type: 'artifact.snapshot',
              payload: {
                artifactId: 'e2e-agents-artifact',
                artifactRef: 'e2e-agents-artifact',
                title: artifactTitle,
                kind: 'markdown',
                content: draftContent,
                model: modelId,
              },
            }, extraRuntimeEvents.length + 2));
          }
          writeJson(response, 200, {
            ok: true,
            result: {
              ok: true,
              requestId: 'agent-turn',
              output: {
                ok: true,
                state: 'started',
                sessionId: 'platform-session-e2e',
                threadId: 'platform-thread-e2e',
                turnId: 'platform-turn-e2e',
                bridge: 'app-server-json-rpc',
                message: 'platform runtime started',
                readiness: { state: 'ready', reasons: [], setupActions: [] },
                runtimeContext: { modelProfile: { modelId } },
                events: agentEvents,
                bridgeProfile: { mode: 'fake-host-bridge' },
              },
              event: {},
            },
          });
          return;
        }

        if (payload.capability === 'lime.agent' && payload.operation === 'agentSession/action/respond') {
          const input = payload.input ?? {};
          const actionId = input.actionId || input.requestId || 'runtime-action-add-source';
          writeJson(response, 200, {
            ok: true,
            result: {
              ok: true,
              requestId: 'agent-action-respond',
              output: {
                ok: true,
                state: 'completed',
                sessionId: input.sessionId || 'platform-session-e2e',
                threadId: 'platform-thread-e2e',
                turnId: 'platform-turn-e2e',
                bridge: 'app-server-json-rpc',
                message: 'platform action responded',
                readiness: { state: 'ready', reasons: [], setupActions: [] },
                runtimeContext: { modelProfile: { modelId: 'test-text-model' } },
                events: [{
                  sessionId: input.sessionId || 'platform-session-e2e',
                  threadId: 'platform-thread-e2e',
                  turnId: 'platform-turn-e2e',
                  sequence: 100,
                  type: 'action.resolved',
                  payload: {
                    actionId,
                    decision: input.decision,
                    message: '平台已确认人工处理结果',
                  },
                }],
                bridgeProfile: { mode: 'fake-host-bridge' },
              },
              event: {},
            },
          });
          return;
        }
      }

      writeJson(response, 404, { ok: false, error: { code: 'not_found', message: 'not found' } });
    });
  });

  const endpoint = await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('无法启动本地平台 Host Bridge。');
      resolveListen(`http://127.0.0.1:${address.port}`);
    });
  });
  const descriptor = {
    protocol: 'lime.runtimeBridge',
    version: 1,
    endpoint,
    token,
    appId: snapshot.appId,
    entryKey: snapshot.entryKey,
    expiresAt: '2099-01-01T00:00:00.000Z',
  };
  return {
    server,
    endpoint,
    descriptor,
    snapshot,
    modelSettings,
    requests,
    close: () => closeHttpServer(server),
  };
}

async function expectModelSettingsVisible(page) {
  await expect(page.locator('.lime-settings-dialog')).toBeVisible();
  const modelSettings = page.locator('.lime-model-settings');
  await expect(modelSettings).toBeVisible();
  await expect(modelSettings).toContainText('启用的模型');
  await expect(modelSettings).toContainText('添加模型');
  await expect(modelSettings).not.toContainText('Content Studio 文案生成');
  await expect(modelSettings).not.toContainText('Content Studio 图片生成');
  await expect(modelSettings).not.toContainText('Content Studio 视频生成');
  await expect(modelSettings).not.toContainText('provider 设置由平台统一保存');
  await expect(modelSettings).not.toContainText('打开完整模型设置');
  await page.locator('[data-testid="add-model-button"]').click();
  await expect(modelSettings).toContainText('推荐服务');
  await expect(modelSettings).toContainText('自定义供应商');
}

async function expectAgentBusinessReply(locator, expected) {
  const page = locator.page();
  const readRuntimeText = async () =>
    page.evaluate(() => {
      const documentText = document.body?.innerText || '';
      const navText = document.querySelector('.nav-stack')?.innerText || '';
      const threadText = document.querySelector('.agents-thread')?.innerText || '';
      return [documentText, navText, threadText].join('\n');
    }).catch(() => '')
      .then(async (pageText) => {
        const localText = await locator.innerText().catch(() => '');
        return [localText, pageText].join('\n');
      });
  const readPanelText = async () =>
    locator.evaluate((element) => element.closest('.agent-session-panel, .agents-workbench')?.innerText || element.innerText || '')
      .catch(() => '');
  await expect.poll(
    async () => {
      const texts = [await readPanelText(), await readRuntimeText()].join('\n');
      return texts.includes(expected.primary);
    },
    { message: `等待 Agent 业务回复出现：${expected.primary}`, timeout: 20_000 },
  ).toBe(true);
  if (expected.secondary) {
    await expect.poll(
      async () => {
        const texts = await readRuntimeText();
        return texts.includes(expected.secondary);
      },
      { message: `等待 Agent 业务回复出现：${expected.secondary}`, timeout: 20_000 },
    ).toBe(true);
  }
  await expect.poll(
    async () => {
      const texts = [await readPanelText(), await readRuntimeText()].join('\n');
      return /blocked:text-provider|Prompt 草稿|可执行 Prompt|交付草稿已更新|交付物线索/.test(texts);
    },
    { message: '等待 Agent 交付或 blocked 事实出现', timeout: 20_000 },
  ).toBe(true);
}

async function expectAgentsUiHidesInternalTerms(page, selector = '.agents-workbench') {
  const target = page.locator(selector);
  for (const term of AGENTS_FORBIDDEN_TERMS) {
    await expect(target, `agents UI 不应展示内部词：${term}`).not.toContainText(term);
  }
}

async function startFakeBuguContentWorkspaceServer() {
  let requestCount = 0;
  const requests = [];
  const listRequests = [];
  const releases = [];
  const syncConflicts = [];
  const knowledgeMaps = [];
  const buildRuns = [];
  const paginateItems = (items, url) => {
    const limit = Number(url.searchParams.get('limit') || 100);
    const offset = Number(url.searchParams.get('offset') || 0);
    return {
      items: items.slice(offset, offset + limit),
      total: items.length,
      limit,
      offset,
      revision: 'rev-e2e-content-list',
    };
  };
  const server = createServer((request, response) => {
    if (!request.url?.startsWith('/api/v1/oem/')) {
      response.statusCode = 404;
      response.end('not found');
      return;
    }
    if (request.method === 'GET') {
      const url = new URL(request.url, 'http://127.0.0.1');
      const route = url.pathname.split('/').pop();
      listRequests.push({
        route,
        workspaceId: url.searchParams.get('workspaceId') || '',
        contentKnowledgeMapId: url.searchParams.get('contentKnowledgeMapId') || '',
        sourceKnowledgeMapId: url.searchParams.get('sourceKnowledgeMapId') || '',
        limit: url.searchParams.get('limit') || '',
        offset: url.searchParams.get('offset') || '',
      });
      response.setHeader('content-type', 'application/json');
      if (route === 'content-knowledge-releases') {
        response.end(JSON.stringify({ data: { items: releases } }));
        return;
      }
      if (route === 'content-knowledge-maps') {
        const workspaceId = url.searchParams.get('workspaceId') || '';
        response.end(JSON.stringify({
          data: paginateItems(knowledgeMaps.filter((item) => !workspaceId || item.workspaceId === workspaceId), url),
        }));
        return;
      }
      if (route === 'content-build-runs') {
        const workspaceId = url.searchParams.get('workspaceId') || '';
        const contentKnowledgeMapId = url.searchParams.get('contentKnowledgeMapId') || '';
        response.end(JSON.stringify({
          data: paginateItems(buildRuns
            .filter((item) => !workspaceId || item.workspaceId === workspaceId)
            .filter((item) => !contentKnowledgeMapId || item.contentKnowledgeMapId === contentKnowledgeMapId), url),
        }));
        return;
      }
      if (route === 'content-sync-conflicts') {
        response.end(JSON.stringify({ data: { items: syncConflicts.filter((conflict) => conflict.status !== 'resolved') } }));
        return;
      }
      response.end(JSON.stringify({ data: {} }));
      return;
    }
    if (request.method !== 'POST') {
      response.statusCode = 405;
      response.end('method not allowed');
      return;
    }
    let body = '';
    request.on('data', (chunk) => { body += chunk.toString(); });
    request.on('end', () => {
      requestCount += 1;
      const route = request.url.split('?')[0].split('/').pop();
      const payload = body ? JSON.parse(body) : {};
      requests.push({ route, payload });
      const revision = `rev-e2e-content-${requestCount}`;
      response.setHeader('content-type', 'application/json');
      if (route === 'content-draft-changes') {
        response.end(JSON.stringify({
          data: {
            workspace: { id: payload.workspaceId || 'workspace-e2e-content', currentRevision: revision },
            draftChange: { serverRevision: revision, baseRevision: payload.baseRevision },
          },
        }));
        return;
      }
      if (route === 'content-knowledge-releases') {
        const releaseId = payload.id || `release-e2e-${requestCount}`;
        const release = {
          id: releaseId,
          workspaceId: payload.workspaceId || 'workspace-e2e-content',
          contentKnowledgeMapId: payload.contentKnowledgeMapId,
          contentKnowledgeMapTitle: payload.contentKnowledgeMapTitle,
          title: payload.title,
          version: payload.version,
          status: 'published',
          baseRevision: payload.baseRevision,
          serverRevision: revision,
          packageManifest: { files: payload.packageManifest?.files ?? [] },
          packageObjectKey: `content-workspaces/workspace-e2e-content/agentknowledge/${releaseId}.zip`,
          packagePublicUrl: `https://downloads.bugu.run/content-workspaces/workspace-e2e-content/agentknowledge/${releaseId}.zip`,
          packageStorageProvider: 'r2',
          packageUploadStatus: 'registered',
          packageSha256: payload.packageArchive?.sha256,
          packageSize: payload.packageArchive?.size,
          approvalStatus: 'approved',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        releases.unshift(release);
        response.end(JSON.stringify({
          data: {
            workspace: { id: release.workspaceId, currentRevision: revision },
            release: {
              id: release.id,
              serverRevision: revision,
              baseRevision: payload.baseRevision,
              packageObjectKey: release.packageObjectKey,
              packagePublicUrl: release.packagePublicUrl,
              packageStorageProvider: release.packageStorageProvider,
              packageUploadStatus: release.packageUploadStatus,
            },
          },
        }));
        return;
      }
      if (route === 'content-knowledge-maps') {
        const knowledgeMap = {
          id: payload.id,
          workspaceId: payload.workspaceId || 'workspace-e2e-content',
          title: payload.title,
          status: payload.status,
          model: payload.model,
          sourceInputSourceIds: payload.sourceInputSourceIds ?? [],
          brandKnowledgeBaseIds: payload.brandKnowledgeBaseIds ?? [],
          ipKnowledgeBaseIds: payload.ipKnowledgeBaseIds ?? [],
          sceneCardIds: payload.sceneCardIds ?? [],
          promptDraftIds: payload.promptDraftIds ?? [],
          evidenceCount: payload.evidenceCount,
          gapCount: payload.gapCount,
          readyPercent: payload.readyPercent,
          coverage: payload.coverage,
          qualityIssues: payload.qualityIssues ?? [],
          snapshot: payload.snapshot,
          baseRevision: payload.baseRevision,
          serverRevision: revision,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const existing = knowledgeMaps.findIndex((item) => item.id === knowledgeMap.id);
        if (existing >= 0) knowledgeMaps[existing] = knowledgeMap;
        else knowledgeMaps.unshift(knowledgeMap);
        response.end(JSON.stringify({
          data: {
            workspace: { id: knowledgeMap.workspaceId, currentRevision: revision },
            knowledgeMap: { id: payload.id, serverRevision: revision, baseRevision: payload.baseRevision },
          },
        }));
        return;
      }
      if (route === 'content-build-runs') {
        const buildRun = {
          id: payload.id,
          workspaceId: payload.workspaceId || 'workspace-e2e-content',
          title: payload.title,
          status: payload.status,
          contentKnowledgeMapId: payload.contentKnowledgeMapId,
          contentKnowledgeMapTitle: payload.contentKnowledgeMapTitle,
          model: payload.model,
          inputSourceIds: payload.inputSourceIds ?? [],
          brandKnowledgeBaseIds: payload.brandKnowledgeBaseIds ?? [],
          ipKnowledgeBaseIds: payload.ipKnowledgeBaseIds ?? [],
          sceneCardIds: payload.sceneCardIds ?? [],
          promptDraftIds: payload.promptDraftIds ?? [],
          readyPercent: payload.readyPercent,
          evidenceCount: payload.evidenceCount,
          gapCount: payload.gapCount,
          issues: payload.issues ?? [],
          steps: payload.steps ?? [],
          baseRevision: payload.baseRevision,
          serverRevision: revision,
          startedAt: payload.startedAt || new Date().toISOString(),
          completedAt: payload.completedAt || new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const existing = buildRuns.findIndex((item) => item.id === buildRun.id);
        if (existing >= 0) buildRuns[existing] = buildRun;
        else buildRuns.unshift(buildRun);
        response.end(JSON.stringify({
          data: {
            workspace: { id: buildRun.workspaceId, currentRevision: revision },
            buildRun: { id: payload.id, serverRevision: revision, baseRevision: payload.baseRevision },
          },
        }));
        return;
      }
      if (route === 'content-review-decisions') {
        response.end(JSON.stringify({
          data: {
            workspace: { id: 'workspace-e2e-content', currentRevision: revision },
            reviewTask: { serverRevision: revision, baseRevision: payload.baseRevision },
          },
        }));
        return;
      }
      if (route === 'content-sync-conflicts') {
        const conflictIndex = syncConflicts.findIndex((conflict) => conflict.id === payload.conflictId);
        const existing = conflictIndex >= 0 ? syncConflicts[conflictIndex] : {
          id: payload.conflictId,
          workspaceId: payload.workspaceId || 'workspace-e2e-content',
          title: '团队同步冲突',
          summary: '旧版本提交需要人工处理。',
          status: 'open',
          affectedObjectIds: [],
          affectedObjects: [],
          createdAt: new Date().toISOString(),
        };
        const resolved = {
          ...existing,
          status: payload.status || 'resolved',
          resolutionAction: payload.resolutionAction || 'manual-review-recorded',
          resolutionNote: payload.resolutionNote,
          resolutionMergeDraft: payload.mergeDraft,
          resolvedBy: payload.resolvedBy || 'E2E 用户',
          resolvedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        if (conflictIndex >= 0) syncConflicts[conflictIndex] = resolved;
        else syncConflicts.push(resolved);
        response.end(JSON.stringify({
          data: {
            workspace: { id: resolved.workspaceId, currentRevision: revision },
            conflict: resolved,
          },
        }));
        return;
      }
      response.end(JSON.stringify({ data: { workspace: { id: 'workspace-e2e-content', currentRevision: revision } } }));
    });
  });
  const baseUrl = await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('无法启动本地 Bugu 内容同步服务。');
      resolveListen(`http://127.0.0.1:${address.port}`);
    });
  });
  return {
    server,
    baseUrl,
    requests,
    listRequests,
    addRelease: (release) => releases.unshift(release),
    addKnowledgeMap: (record) => {
      const index = knowledgeMaps.findIndex((item) => item.id === record.id);
      if (index >= 0) knowledgeMaps[index] = record;
      else knowledgeMaps.unshift(record);
    },
    addBuildRun: (record) => {
      const index = buildRuns.findIndex((item) => item.id === record.id);
      if (index >= 0) buildRuns[index] = record;
      else buildRuns.unshift(record);
    },
    addSyncConflict: (conflict) => syncConflicts.unshift(conflict),
    getRequestCount: () => requestCount,
    close: () => new Promise((resolveClose) => server.close(resolveClose)),
  };
}

function fakeBusinessChainTextOutput(prompt) {
  const parsedPrompt = (() => {
    try {
      return JSON.parse(prompt);
    } catch {
      return undefined;
    }
  })();
  if (parsedPrompt?.task === 'generate_content_knowledge_map' || prompt.includes('"task":"generate_content_knowledge_map"') || prompt.includes('"task": "generate_content_knowledge_map"')) {
    const evidence = Array.isArray(parsedPrompt?.seed?.evidence) ? parsedPrompt.seed.evidence : [];
    const firstEvidence = evidence[0];
    const sourceRef = typeof firstEvidence?.sourceRef === 'string' ? firstEvidence.sourceRef : undefined;
    const evidenceRef = typeof firstEvidence?.id === 'string' ? firstEvidence.id : undefined;
    return {
      title: '模型生成内容知识地图',
      sellingPoints: [{
        title: '模型生成卖点：通勤清爽补涂',
        summary: '基于产品资料归纳为适合通勤补涂的清爽肤感表达。',
        tags: ['卖点', '模型生成', '通勤'],
        dimensions: {
          audiences: ['通勤人群'],
          channels: ['抖音'],
          stages: ['种草'],
          contentFormats: ['短视频'],
          useCases: ['通勤补涂'],
        },
        sourceRefs: sourceRef ? [sourceRef] : [],
        evidenceRefs: evidenceRef ? [evidenceRef] : [],
        confidence: 88,
        status: 'needs-review',
        materialStatus: 'missing',
      }],
      painPoints: [{
        title: '模型生成痛点：担心补涂厚重',
        summary: '从输入资料的清爽肤感反推用户对厚重和黏腻的购买顾虑。',
        tags: ['痛点', '模型生成'],
        dimensions: {
          audiences: ['通勤人群'],
          channels: ['抖音'],
          stages: ['转化'],
          contentFormats: ['口播'],
          useCases: ['午后补涂'],
        },
        sourceRefs: sourceRef ? [sourceRef] : [],
        evidenceRefs: evidenceRef ? [evidenceRef] : [],
        confidence: 82,
        status: 'needs-review',
        materialStatus: 'missing',
      }],
      scenarios: [{
        title: '模型生成场景：通勤包内补涂',
        summary: '把产品资料转成可拍摄场景：通勤包内携带，午后快速补涂。',
        tags: ['场景', '模型生成', '通勤'],
        dimensions: {
          audiences: ['通勤人群'],
          channels: ['抖音'],
          stages: ['种草'],
          contentFormats: ['短视频'],
          useCases: ['包内携带'],
        },
        sourceRefs: sourceRef ? [sourceRef] : [],
        evidenceRefs: evidenceRef ? [evidenceRef] : [],
        confidence: 84,
        status: 'needs-review',
        materialStatus: 'missing',
      }],
      constraints: ['不能承诺治疗、绝对防护或无依据背书。'],
      gaps: ['模型识别缺口：缺少真实用户评论和已审核 Prompt 草稿。'],
    };
  }
  if (parsedPrompt?.task === 'generate_brand_knowledge_base' || prompt.includes('"task":"generate_brand_knowledge_base"') || prompt.includes('"task": "generate_brand_knowledge_base"')) {
    return {
      title: '便携条包品牌知识库',
      brandVoice: '真实、克制、先场景后卖点，不承诺治疗。',
      audience: '早餐后和办公室场景下想降低坚持门槛的用户',
      productFacts: ['便携条包', '适合早餐后或办公室抽屉备用'],
      coreSellingPoints: ['随手可放', '降低坚持门槛'],
      complianceBoundaries: ['不承诺治疗', '不做无依据背书'],
      sceneSeeds: ['早餐后', '办公室抽屉'],
      promptFragments: ['UGC 手机实拍', '自然光', '真实手部动作'],
    };
  }
  if (parsedPrompt?.task === 'generate_ip_knowledge_base' || prompt.includes('"task":"generate_ip_knowledge_base"') || prompt.includes('"task": "generate_ip_knowledge_base"')) {
    return {
      title: '嘉文老师 IP 知识库',
      layers: {
        identity: '内容工程顾问，擅长把知识库、提示词、场景库和素材生成串成流程。',
        values: '先判断再解释，不包装万能专家，不制造焦虑。',
        language: '短句、直接、少形容词，落到具体流程和交付。',
        methodology: '内容工程四段法：事实源、提示词包、场景库、内容生产。',
        materials: '团队从临时写提示词转向维护知识库和场景库的项目故事。',
        engine: '把观点拆成判断、证据、边界和可执行步骤。',
      },
      extensionScenes: ['口播', '公众号长文', '私域回复'],
      missingLayers: [],
    };
  }
  if (parsedPrompt?.task === 'generate_prompt_pack' || prompt.includes('"task":"generate_prompt_pack"') || prompt.includes('"task": "generate_prompt_pack"')) {
    return {
      name: '便携条包品牌提示词包',
      brandVoice: '像真实使用者说明场景，克制可信。',
      visualStyle: '自然光 UGC 手机实拍，真实桌面和手部动作。',
      sellingPointRules: ['先讲早餐后场景', '再讲便携条包', '避免疗效承诺'],
      complianceBoundaries: ['不承诺治疗', '不做无依据背书'],
      platformConstraints: ['小红书强调真实体验', '公众号强调事实引用', '电商图强调产品清晰'],
      imagePromptFragments: ['早餐桌自然光，手拿便携条包', '办公室抽屉备用场景', '产品主体清晰少字'],
      videoPromptFragments: ['15 秒早餐后使用镜头', '办公室抽屉拿取镜头', '手部动作真实可信'],
    };
  }
  if (parsedPrompt?.task === 'generate_scene_cards' || prompt.includes('"task":"generate_scene_cards"') || prompt.includes('"task": "generate_scene_cards"')) {
    return {
      cards: [
        {
          title: '早餐后便携场景',
          audience: '早餐后准备出门的上班族',
          painPoint: '想坚持但不想增加复杂动作',
          usageScene: '早餐桌旁把便携条包放进包里',
          visualComposition: '自然光桌面，产品在手边，手机实拍质感',
          sellingPoint: '便携条包，随手可放',
          voiceoverDirection: '像真实用户解释，不夸张',
          imageMaterialSuggestion: '图片 Prompt：早餐桌自然光，手拿便携条包，产品清晰，UGC 手机实拍。',
          videoMaterialSuggestion: '15 秒视频 Prompt：早餐后拿起条包放进通勤包，手持镜头，自然光。',
        },
      ],
    };
  }
  if (prompt.includes('下游用途：视频 Prompt')) {
    return {
      title: '场景视频 Prompt 草稿',
      prompt: '视频 Prompt：15 秒，早餐后拿起便携条包放进通勤包，手持镜头，自然光，不出现疗效承诺。',
      followUpQuestions: [],
      sourceWarnings: ['第三方生成后需要手动导入成品视频。'],
      qualityChecklist: ['15 秒素材', '动作清晰', '无外部任务状态'],
    };
  }
  return {
    title: '场景图片 Prompt 草稿',
    prompt: '图片 Prompt：早餐桌自然光，手拿便携条包，产品主体清晰，UGC 手机实拍，不出现疗效承诺。',
    followUpQuestions: [],
    sourceWarnings: ['发布前复核合规边界。'],
    qualityChecklist: ['产品清晰', '场景真实', '无绝对化表达'],
  };
}

test('OEM 登录页会读取品牌 runtime 配置而不是写死 Bugu 官网', async ({}, testInfo) => {
  await withContentStudio(
    testInfo,
    async ({ page }) => {
      await expect(page.locator('.bugu-auth-brand strong')).toHaveText('seenx');
      await expect(page.getByRole('link', { name: '去官网验证邮箱 / 设置密码' })).toHaveAttribute(
        'href',
        'https://seenx.run/login/?mode=verify',
      );
      await expect(page.locator('.bugu-auth-verify-card')).toContainText('去官网验证邮箱 / 设置密码');
    },
    {
      env: {
        CONTENT_STUDIO_E2E: '0',
        CONTENT_STUDIO_OEM_RUNTIME_CONFIG: join(projectRoot, 'oem/brands/seenx.json'),
      },
      expectAuthGate: true,
    },
  );
});

test('真实 Electron 壳层、preload bridge、导航和详情弹窗可用', async ({}, testInfo) => {
  test.setTimeout(120_000);

  await withContentStudio(testInfo, async ({ electronApp, page }) => {
    await expect(page).toHaveTitle(/布谷AI/);
    await ensureSidebarExpanded(page);
    await expect(page.locator('.brand-card .eyebrow').filter({ hasText: '布谷AI' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '内容工厂' })).toBeVisible();
    await expect(page.getByText('AI 对话')).toHaveCount(0);
    await clickButton(page, '图片生成');
    await expect(page.locator('.image-workbench-layout')).toBeVisible();
    await expect(page.locator('.image-workbench-layout > .v2-feature-hero')).toHaveCount(0);
    await expect(page.locator('.image-workbench-layout > .module-command-center')).toHaveCount(0);
    await expect(page.locator('.image-input-mode-tabs')).toHaveCount(0);
    await expect(page.locator('.image-input-rail')).toBeVisible();
    await expect(page.locator('.image-canvas-stage')).toBeVisible();
    await expect(page.getByText('图片预览大盘区 - 待命')).toBeVisible();
    await expect(page.locator('.image-prompt-panel')).toBeVisible();
    await expect(page.getByText('>> 提示词输入')).toBeVisible();
    await expect(page.locator('.image-prompt-panel textarea')).toBeVisible();
    await expect(page.locator('.image-prompt-panel textarea')).toHaveValue('');
    await expect(page.locator('.image-mention-trigger')).toContainText('引用图片 0 张');
    await page.locator('.image-prompt-panel textarea').fill('@图片');
    await expect(page.locator('.image-mention-menu')).toBeVisible();
    await expect(page.locator('.image-mention-empty')).toContainText('还没有可引用的图片');
    await expect(page.locator('.image-mention-empty')).toContainText('上传产品图');
    await page.locator('.image-prompt-panel textarea').fill('');
    await page.locator('.image-upload-panel.product').click();
    await expect(page.locator('.image-upload-files')).toContainText('hero-product.png');
    await expect(page.locator('.image-mention-trigger')).toBeEnabled();
    await page.locator('.image-prompt-panel textarea').fill('参考 @');
    await expect(page.locator('.image-mention-menu')).toBeVisible();
    await expect(page.locator('.image-mention-option')).toContainText('hero-product.png');
    await page.locator('.image-mention-option').first().click();
    await expect(page.locator('.image-prompt-panel textarea')).toHaveValue('参考 @hero-product.png ');
    await page.locator('.image-prompt-panel textarea').fill('');
    await expect(page.getByText('内容助手')).toHaveCount(0);
    await expect(page.locator('.image-preview-tabs')).toBeVisible();
    await page.locator('.image-preview-tabs button').filter({ hasText: '生成日志' }).click();
    await expect(page.getByText('暂无图片生成日志')).toBeVisible();
    await page.locator('.image-preview-tabs button').filter({ hasText: '预览图' }).click();
    await expect(page.getByRole('tab', { name: /自由模式/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('自由模式：直接输入提示词生成')).toBeVisible();
    await expect(page.locator('.image-template-config-card')).toHaveCount(0);
    await expect(page.locator('.image-canvas-stage')).not.toContainText('场景库 / 生成日志');
    await clickButton(page, '自定义提示词管理');
    await expect(page.getByRole('dialog', { name: '自定义提示词管理' })).toBeVisible();
    await expect(page.getByText('暂无自定义提示词')).toBeVisible();
    await clickButton(page, '+ 新增');
    await expect(page.getByText('提示词名称')).toBeVisible();
    await expect(page.getByText('共 1 条提示词')).toBeVisible();
    await clickButton(page, '确认保存');
    await ensureParamsPanelExpanded(page);
    await page.locator('.params-panel-tabs button').filter({ hasText: '日志' }).click();
    await expect(page.getByRole('heading', { name: '最近生成日志' })).toBeVisible();
    await expect(page.getByText('生成图片、文章或视频后，最近记录会在这里显示。')).toBeVisible();
    await page.locator('.params-panel-tabs button').filter({ hasText: '参数' }).click();
    const expandedParamsLayout = await page.evaluate(() => {
      const panel = document.querySelector('.params-panel');
      const tabs = document.querySelector('.params-panel-tabs');
      const toolbarButton = document.querySelector('.params-panel-toolbar .params-panel-collapse-btn');
      if (!panel || !tabs || !toolbarButton) {
        return { ok: false, topOffset: -1, collapseButtonPosition: '' };
      }
      return {
        ok: true,
        topOffset: Math.round(tabs.getBoundingClientRect().top - panel.getBoundingClientRect().top),
        collapseButtonPosition: window.getComputedStyle(toolbarButton).position,
      };
    });
    expect(expandedParamsLayout.ok).toBe(true);
    expect(expandedParamsLayout.topOffset).toBeLessThan(16);
    expect(expandedParamsLayout.collapseButtonPosition).toBe('static');
    await page.getByRole('button', { name: '折叠右侧参数栏' }).click();
    await expect(page.locator('.params-panel')).toHaveClass(/collapsed/);
    await expect(page.getByRole('heading', { name: '全局参数' })).toHaveCount(0);
    const collapsedParamsLayout = await page.evaluate(() => ({
      paramsState: document.querySelector('.app-shell')?.getAttribute('data-params'),
      columns: window.getComputedStyle(document.querySelector('.app-shell')).gridTemplateColumns,
    }));
    expect(collapsedParamsLayout.paramsState).toBe('collapsed');
    const collapsedParamsWidth = Number.parseFloat(collapsedParamsLayout.columns.split(' ').at(-1) ?? '0');
    expect(collapsedParamsWidth).toBeGreaterThanOrEqual(44);
    await page.getByRole('button', { name: '展开右侧参数栏' }).click();
    await expect(page.locator('.params-panel')).not.toHaveClass(/collapsed/);
    await expect(page.getByRole('heading', { name: '全局参数' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /电商白底主图/ })).toBeVisible();
    await clickButton(page, '电商白底主图');
    await expect(page.locator('.image-template-config-card')).toBeVisible();
    await expect(page.locator('.template-params-title')).toContainText('技能参数');
    await expect(page.getByRole('button', { name: '导入', exact: true })).toBeEnabled();
    const imagePreviewLayout = await page.evaluate(() => {
      const stage = document.querySelector('.image-canvas-stage');
      const preview = document.querySelector('.image-preview-canvas');
      const parameterDock = document.querySelector('.image-template-parameter-dock');
      if (!stage || !preview || !parameterDock) {
        return { ok: false, reason: 'missing image preview layout nodes' };
      }
      const stageStyle = window.getComputedStyle(stage);
      const dockStyle = window.getComputedStyle(parameterDock);
      const stageChildren = Array.from(stage.children);
      const previewRect = preview.getBoundingClientRect();
      const dockRect = parameterDock.getBoundingClientRect();
      const stageRect = stage.getBoundingClientRect();
      return {
        ok: true,
        stageDisplay: stageStyle.display,
        stageOverflowY: stageStyle.overflowY,
        dockOverflowY: dockStyle.overflowY,
        previewAfterDock: stageChildren.indexOf(parameterDock) < stageChildren.indexOf(preview),
        previewTopBelowDock: previewRect.top >= dockRect.top,
        parameterHeight: Math.round(dockRect.height),
        previewShare: Number((previewRect.height / stageRect.height).toFixed(2)),
        previewHeight: Math.round(previewRect.height),
      };
    });
    expect(imagePreviewLayout.ok, JSON.stringify(imagePreviewLayout)).toBe(true);
    expect(imagePreviewLayout.stageDisplay).toBe('grid');
    expect(imagePreviewLayout.stageOverflowY).toBe('hidden');
    expect(imagePreviewLayout.dockOverflowY).toMatch(/auto|scroll/);
    expect(imagePreviewLayout.previewAfterDock).toBe(true);
    expect(imagePreviewLayout.previewTopBelowDock).toBe(true);
    expect(imagePreviewLayout.parameterHeight, JSON.stringify(imagePreviewLayout)).toBeGreaterThanOrEqual(170);
    expect(imagePreviewLayout.previewShare, JSON.stringify(imagePreviewLayout)).toBeGreaterThanOrEqual(0.36);
    expect(imagePreviewLayout.previewHeight, JSON.stringify(imagePreviewLayout)).toBeGreaterThanOrEqual(240);
    await clickButton(page, '美食摄影');
    await expect(page.getByRole('tab', { name: /美食摄影/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('美食名称 *')).toBeVisible();
    await expect(page.getByText('美食品类')).toBeVisible();
    await clickButton(page, '详情页分区图');
    const detailField = page.locator('.template-field').filter({ hasText: '分区类型（多选 = 多张图）' });
    await expect(detailField).toBeVisible();
    await expect(detailField.getByRole('button', { name: '全选' })).toBeVisible();
    await detailField.getByRole('button', { name: '全选' }).click();
    await expect(detailField.getByRole('button', { name: /☑\s*产品特写/ })).toBeVisible();
    await expect(detailField.getByRole('button', { name: /☑\s*首屏海报/ })).toBeVisible();
    await clickButton(page, '电商白底主图');

    await clickButton(page, 'AI 创建');
    await expect(page.getByRole('dialog', { name: 'AI 创建新技能' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'AI 生成技能' })).toBeDisabled();
    await page.getByLabel('用自然语言描述你想要的技能').fill('创建一个小红书护肤品封面技能，适合高端护肤品牌种草。');
    await expect(page.getByRole('button', { name: 'AI 生成技能' })).toBeEnabled();
    await clickButton(page, 'AI 生成技能');
    await expect(page.locator('.error-banner')).toContainText('文字模型未配置');
    await clickButton(page, '关闭');

    await clickButton(page, '导出 / 编辑');
    await expect(page.getByRole('dialog', { name: /编辑技能/ })).toBeVisible();
    await expect(page.getByRole('button', { name: '高级配置' })).toBeVisible();
    await expect(page.getByRole('button', { name: '系统提示词' })).toBeVisible();
    await expect(page.locator('.template-prompt-summary')).toContainText('系统提示词');
    await expect(page.getByText('系统提示词是图片技能的核心')).toBeVisible();
    await expect(page.locator('.template-prompt-editor label').filter({ hasText: '系统提示词' })).toBeVisible();
    await expect(page.locator('.template-prompt-editor textarea').first()).toHaveValue(/professional/);
    await expect(page.getByText('英文增强关键词')).toBeVisible();
    await expect(page.getByText('负面关键词')).toBeVisible();
    await clickButton(page, '高级配置');
    await expect(page.locator('.json-editor')).toContainText('电商白底主图');
    await expect(page.locator('.json-editor')).toContainText('prompts');
    await expect(page.locator('.json-editor')).not.toContainText(['光', '核'].join(''));
    await clickButton(page, '系统提示词');
    await clickButton(page, 'AI 辅助修改');
    await expect(page.getByText('AI 辅助修改等待本地服务接入')).toBeVisible();
    await clickButton(page, '关闭');

    const appState = await electronApp.evaluate(({ app }) => ({
      appPath: app.getAppPath(),
      isPackaged: app.isPackaged,
    }));
    expect(appState.isPackaged).toBe(false);
    expect(appState.appPath).toContain('content-studio');

    const bridgeKeys = await page.evaluate(() => Object.keys(window.contentStudio).sort());
    expect(bridgeKeys.length).toBeGreaterThanOrEqual(20);
    expect(bridgeKeys).toEqual(expect.arrayContaining([
      'getModelConfig',
      'generateArticle',
      'generateImage',
      'generateImageSkill',
      'importImageSkillFromFile',
      'generateVideo',
      'installBuiltinKnowledgeBase',
      'scanSkills',
    ]));

    await clickButton(page, '视频生成');
    await expect(page.getByRole('heading', { name: '爆款视频拆解与脚本工厂' })).toBeVisible();
    await openArticleWorkbenchFromAgents(page);
    await expectCommandCenter(page, '.article-module-workbench > .module-command-center', 'compact');
    await expect(page.locator('.article-module-workbench > .v2-feature-hero')).toHaveCount(0);
    await expect(page.locator('.article-agent-canvas')).toBeVisible();
    await expect(page.locator('.article-agent-thread .agent-turn.user')).toContainText('平台：公众号');
    await expect(page.locator('.article-agent-stage-list')).toContainText('生成草稿');
    await expect(page.getByRole('heading', { name: '正文 / 发布检查' })).toBeVisible();
    await clickButton(page, '成型知识库');
    await expect(page.locator('.knowledge-tab-bar button').filter({ hasText: /^知识库/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: '导入知识库文档' })).toBeVisible();
    await expect(page.locator('.knowledge-list .kb-card')).toHaveCount(2);
    await expect(page.locator('.knowledge-list .kb-detail')).toHaveCount(0);
    const selectedKnowledgeTitle = await page.locator('.knowledge-list .kb-card').nth(1).locator('strong').first().innerText();
    await page.locator('.knowledge-list .kb-card').nth(1).locator('.kb-card-main').click();
    await expect(page.locator('.knowledge-list .kb-card').nth(1)).toHaveClass(/active/);
    await expect(page.locator('.knowledge-detail-panel')).toContainText(selectedKnowledgeTitle);
    await expect(page.locator('.knowledge-detail-panel .kb-detail')).toBeVisible();
    await expect(page.locator('.knowledge-detail-panel .section-card')).toHaveCount(5);
    await page.locator('.knowledge-tab-bar button').filter({ hasText: /^引用检索/ }).click();
    await expect(page.locator('.knowledge-search-panel')).toBeVisible();
    await expect(page.getByRole('button', { name: '搜索' })).toBeVisible();
    await page.locator('.knowledge-tab-bar button').filter({ hasText: /^提示词包/ }).click();
    await expect(page.locator('.knowledge-pack-panel')).toBeVisible();
    await expect(page.getByRole('button', { name: '生成场景卡' })).toBeVisible();
    await page.locator('.knowledge-tab-bar button').filter({ hasText: /^场景卡/ }).click();
    await expect(page.locator('.knowledge-scene-panel')).toBeVisible();
    await expect(page.getByRole('heading', { name: '编辑场景卡' })).toBeVisible();
    await clickButton(page, '素材库');
    await expect(page.getByRole('heading', { name: '素材库' })).toBeVisible();
    await clickButton(page, 'skills 管理');
    await expect(page.getByRole('heading', { name: 'skills 管理' })).toBeVisible();
    const skillPackageBytes = Array.from(createSkillPackageBuffer('drag-install-skill'));
    const dataTransfer = await page.evaluateHandle((bytes) => {
      const transfer = new DataTransfer();
      transfer.items.add(new File(
        [new Uint8Array(bytes)],
        'drag-install-skill.skill',
        { type: 'application/octet-stream' },
      ));
      return transfer;
    }, skillPackageBytes);
    await page.dispatchEvent('[data-skill-drop-target="true"]', 'drop', { dataTransfer });
    await expect(page.locator('.skill-package-dialog')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.skill-package-dialog')).toContainText('drag-install-skill');
    await page.locator('.skill-package-footer button').filter({ hasText: '安装到技能库' }).click();
    await expect(page.locator('.skill-package-dialog')).toHaveCount(0, { timeout: 20_000 });
    await expect(page.locator('.skills-manager-list')).toContainText('drag-install-skill');
    await expect(page.locator('.skills-drop-error')).toHaveCount(0);

    await page.locator('button').filter({ hasText: '详情' }).first().click();
    await expect(page.locator('.detail-dialog-card')).toBeVisible();
    await expect(page.locator('.detail-dialog-backdrop')).toHaveCSS('position', 'fixed');
    await page.locator('.detail-dialog-card button').filter({ hasText: '关闭' }).first().click();
    await expect(page.locator('.detail-dialog-card')).toHaveCount(0);

    await clickButton(page, '设置');
    await expect(page.locator('.lime-settings-dialog')).toBeVisible();
    await clickButton(page, '模型');
    await expectModelSettingsVisible(page);
    await clickButton(page, '关闭设置');
    await expect(page.locator('.lime-settings-dialog')).toHaveCount(0);

    const scrollState = await page.evaluate(() => {
      const viewport = document.scrollingElement || document.documentElement;
      const params = document.querySelector('.params-panel');
      if (!viewport || !params) return { ok: false, reason: 'missing scroll containers' };
      viewport.scrollTop = viewport.scrollHeight;
      params.scrollTop = params.scrollHeight;
      return {
        ok: viewport.scrollHeight > viewport.clientHeight && viewport.scrollTop > 0,
        viewport: { scrollHeight: viewport.scrollHeight, clientHeight: viewport.clientHeight, scrollTop: viewport.scrollTop },
        params: { scrollHeight: params.scrollHeight, clientHeight: params.clientHeight, scrollTop: params.scrollTop },
      };
    });
    expect(scrollState.ok, JSON.stringify(scrollState)).toBe(true);
  });
});

test('AI 生图页复刻关键选项并消费 OEM 素材清单', async ({}, testInfo) => {
  test.setTimeout(180_000);

  const aiImageFixturePath = resolve(projectRoot, '../../bugu/bugu/.tmp/ai-image-showcase/resolved-manifest.v2.ui.json');
  const aiImageFixtureEnabled = existsSync(aiImageFixturePath);

  await withContentStudio(
    testInfo,
    async ({ page }) => {
      await page.setViewportSize({ width: 2048, height: 1152 });
      await expect(page.locator('.app-shell')).toHaveAttribute('data-sidebar', 'expanded');
      await clickNavItem(page, 'AI 生图');
      await expect(page.locator('.app-shell')).toHaveAttribute('data-sidebar', 'expanded');
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.getByRole('button', { name: '折叠侧边栏' }).first()).toBeVisible();
      await expect(page.locator('.ai-showcase-shell')).toBeVisible();
      await expect(page.locator('.ai-showcase-left')).toContainText('选择场景');
    await expect(page.locator('.ai-showcase-left')).toContainText('模特产品展示');
    await expect(page.locator('.scene-panel')).toContainText('选择场景 （模特产品展示）');
    await expect(page.locator('.scene-panel')).not.toContainText('服装上身与商拍展示');
    await expect(page.locator('.ai-showcase-left')).toContainText('上传素材');
    await expect(page.locator('.ai-showcase-left')).toContainText('素材库');
    await expect(page.locator('.ai-showcase-left')).toContainText('正面视角');
    await expect(page.locator('.ai-showcase-left')).toContainText('背面视角');
    await expect(page.locator('.ai-showcase-left')).toContainText('侧面视角');
    await expect(page.locator('.ai-upload-tabs button')).toHaveCount(1);
    await expect(page.locator('.ai-workspace-nav')).toHaveCount(0);
    await expect(page.locator('.ai-category-tabs')).toContainText('Ai营销');
    await expect(page.locator('.ai-category-tabs')).toContainText('Ai产品设计');
    await expect(page.locator('.ai-category-tabs')).toContainText('Ai生产');
    await expect(page.locator('.ai-feature-grid button')).toHaveCount(14);
    await expectRectNear(page.locator('.ai-feature-grid .ai-feature-button'), { width: 114, height: 104 });
    await expectRectNear(page.locator('.ai-feature-grid .ai-feature-icon-wrap'), { width: 46, height: 46 });
    await expectRectNear(page.locator('.ai-feature-grid .ai-feature-icon'), { width: 30, height: 30 });
    await expect(page.locator('.ai-feature-grid svg.ai-feature-icon')).toHaveCount(14);
    await expect(page.locator('.ai-feature-grid img[src*="oss.dressingkit.com"]')).toHaveCount(0);
    await expect(page.locator('.ai-feature-grid')).toContainText('模特产品展示');
    await expect(page.locator('.ai-feature-grid')).toContainText('多人场景展示');
    await expect(page.locator('.ai-feature-grid')).toContainText('批量产品展示');
    await page.locator('.ai-prompt-assistant-fab').click();
    const imageAssistantDialog = page.getByRole('dialog', { name: '提示词助手' });
    await expect(imageAssistantDialog).toBeVisible();
    await expect(imageAssistantDialog.locator('.agent-session-claw-shell')).toBeVisible();
    await expect(imageAssistantDialog.locator('.agent-claw-chat')).toBeVisible();
    await expect(imageAssistantDialog.locator('.agent-claw-sidecar')).toBeVisible();
    await expectOverlayCoversSidebar(page, '.ai-assistant-overlay');
    await page.getByLabel('关闭提示词助手').click();
    await expect(page.locator('.ai-assistant-overlay')).toHaveCount(0);
    await page.locator('.ai-category-tabs button').filter({ hasText: 'Ai产品设计' }).click();
    await expect(page.locator('.ai-feature-grid button')).toHaveCount(17);
    await expect(page.locator('.ai-feature-grid')).toContainText('文生图');
    await page.locator('.ai-feature-grid button').filter({ hasText: '局部精修' }).click();
    await expect(page.locator('.ai-refinement-shell')).toBeVisible();
    await expect(page.locator('.ai-refinement-sidebar')).toContainText('案例库');
    await expect(page.locator('.ai-refinement-canvas')).toContainText('请先上传至少一张图片');
    await expect(page.locator('.ai-refinement-toolbar button')).toHaveCount(6);
    await page.getByLabel('返回首页').click();
    await page.locator('.ai-category-tabs button').filter({ hasText: 'Ai产品设计' }).click();
    await page.locator('.ai-feature-grid button').filter({ hasText: '产品改色' }).click();
    await expect(page.locator('.ai-showcase-left')).toContainText('选择色号');
    await expect(page.locator('.ai-showcase-left')).toContainText('#CD5C5C');
    await expect(page.locator('.ai-color-row input[type="color"]')).toHaveValue('#cd5c5c');
    await page.locator('.ai-category-tabs button').filter({ hasText: 'Ai营销' }).click();
    await expect(page.locator('.ai-industry-filter')).toContainText('服饰类');
    await expect(page.locator('.ai-industry-filter')).toContainText('运动户外类');
    const caseBoardLayout = await page.evaluate(() => {
      const board = document.querySelector('.ai-case-board');
      const filter = document.querySelector('.ai-industry-filter');
      const grid = document.querySelector('.ai-case-grid');
      if (!(board instanceof HTMLElement) || !(filter instanceof HTMLElement) || !(grid instanceof HTMLElement)) {
        return { ok: false, reason: 'missing case board parts' };
      }
      const boardRect = board.getBoundingClientRect();
      const filterRect = filter.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      return {
        ok: filterRect.height >= 32 && boardRect.height >= gridRect.height + filterRect.height + 48,
        boardHeight: Math.round(boardRect.height),
        filterHeight: Math.round(filterRect.height),
        gridHeight: Math.round(gridRect.height),
      };
    });
    expect(caseBoardLayout.ok, JSON.stringify(caseBoardLayout)).toBe(true);
    await page.locator('.ai-industry-filter button').filter({ hasText: '珠宝首饰类' }).click();
    const sparseImageCaseBoardLayout = await page.evaluate(() => {
      const main = document.querySelector('.ai-showcase-main');
      const board = document.querySelector('.ai-case-board');
      const filter = document.querySelector('.ai-industry-filter');
      const grid = document.querySelector('.ai-case-grid');
      if (
        !(main instanceof HTMLElement)
        || !(board instanceof HTMLElement)
        || !(filter instanceof HTMLElement)
        || !(grid instanceof HTMLElement)
      ) {
        return { ok: false, reason: 'missing sparse image case board parts' };
      }
      const mainRect = main.getBoundingClientRect();
      const boardRect = board.getBoundingClientRect();
      const filterRect = filter.getBoundingClientRect();
      const gridRect = grid.getBoundingClientRect();
      return {
        ok: Math.abs(boardRect.bottom - mainRect.bottom) <= 3
          && Math.abs(gridRect.top - filterRect.bottom - 12) <= 3,
        mainBottom: Math.round(mainRect.bottom),
        boardBottom: Math.round(boardRect.bottom),
        boardHeight: Math.round(boardRect.height),
        gridTop: Math.round(gridRect.top),
        filterBottom: Math.round(filterRect.bottom),
      };
    });
    expect(sparseImageCaseBoardLayout.ok, JSON.stringify(sparseImageCaseBoardLayout)).toBe(true);
    await page.locator('.ai-industry-filter button').filter({ hasText: '全部' }).click();
    await expect(page.locator('.scene-panel')).toContainText('选择功能');
    await expectRectNear(page.locator('.ai-feature-entry-card'), { width: 376, height: 96 }, 4);
    await expectRectNear(page.locator('.ai-feature-entry-icon'), { width: 64, height: 64 }, 3);
    await expectRectNear(page.locator('.ai-feature-entry-icon .ai-feature-icon'), { width: 30, height: 30 }, 2);
    await page.locator('.ai-feature-entry-card').click();
    await expect(page.locator('.detail-dialog-card')).toHaveCount(0);
    await expect(page.locator('.ai-function-board')).toBeVisible();
    await page.locator('.ai-material-entry-card').filter({ hasText: '素材库' }).click();
    await expect(page.locator('.ai-material-library')).toBeVisible();
    await expect(page.locator('.ai-function-board')).toHaveCount(0);
    await expect(page.locator('.ai-case-board')).toHaveCount(0);
    await expect(page.locator('.ai-material-library')).toContainText('系统模特为AI合成数字人');
    await expect(page.locator('.ai-material-library')).toContainText('模特');
    await expect(page.locator('.ai-material-library')).toContainText('姿势');
    await expect(page.locator('.ai-material-library')).toContainText('我的模特');
    await expect(page.locator('.ai-material-library')).toContainText('系统模特');
    await expect(page.locator('.ai-material-library')).toContainText('真人模特');
    await expect(page.locator('.ai-material-library')).toContainText('性别');
    await expect(page.locator('.ai-material-library')).toContainText('年龄');
    await expect(page.locator('.ai-material-library')).toContainText('区域');
    await expect(page.locator('.ai-material-library')).toContainText('东亚裔');
    await expect(page.locator('.ai-material-library')).toContainText('非洲裔');
    await expect(page.locator('.ai-material-library')).not.toContainText('案例参考素材');
    await expect(page.locator('.ai-material-library img[src*="oss.dressingkit.com"]')).toHaveCount(0);
    await expect(page.locator('.ai-source-material-card')).toHaveCount(36);
    await expectRectNear(page.locator('.ai-source-material-card'), { width: 140, height: 147 }, 3);
    await page.locator('.ai-source-material-card').filter({ hasText: '非洲女性' }).click();
    await expect(page.locator('.ai-material-library')).toBeVisible();
    await expect(page.locator('.ai-source-material-card.active')).toContainText('非洲女性');
    await expect(page.locator('.ai-showcase-left')).toContainText('清理参考素材');
    await page.locator('.ai-selected-material-clear').click();
    await expect(page.locator('.ai-selected-material-clear')).toHaveCount(0);
    await expect(page.locator('.ai-material-back-button')).toHaveCount(0);
    await page.locator('.ai-feature-entry-card').click();
    await expect(page.locator('.ai-case-board')).toBeVisible();
    const promptTextarea = page.locator('.ai-showcase-left textarea');
    await page.evaluate(() => window.localStorage.removeItem('buguai:dressingkit-image-prompt-templates'));
    await page.locator('.ai-prompt-actions button').filter({ hasText: '提示词列表' }).click();
    const promptListDialog = page.getByRole('dialog', { name: '提示词列表' });
    await expect(promptListDialog).toBeVisible();
    await expectOverlayCoversSidebar(page, '.detail-dialog-backdrop');
    await expectOverlayAboveFloatingControl(page, '.detail-dialog-backdrop', '.ai-floating-history');
    await expect(promptListDialog.getByLabel('提示词类型')).toBeVisible();
    await expect(promptListDialog.getByRole('button', { name: '查询' })).toBeVisible();
    await expect(promptListDialog.getByRole('button', { name: '新增' })).toBeVisible();
    await expect(promptListDialog.getByRole('button', { name: '编辑' })).toBeDisabled();
    await expect(promptListDialog.getByRole('button', { name: '删除' })).toBeDisabled();
    await expect(promptListDialog).toContainText('正面视角');
    await expect(promptListDialog).toContainText('‹');
    await expect(promptListDialog).toContainText('›');
    const promptListDialogRect = await promptListDialog.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        height: rect.height,
        minWidth: Math.min(1792, Math.max(960, window.innerWidth * 0.66)),
        maxWidth: Math.min(1792, Math.max(960, window.innerWidth * 0.72)),
      };
    });
    expect(promptListDialogRect.width, JSON.stringify(promptListDialogRect)).toBeGreaterThanOrEqual(promptListDialogRect.minWidth);
    expect(promptListDialogRect.width, JSON.stringify(promptListDialogRect)).toBeLessThanOrEqual(promptListDialogRect.maxWidth);
    expect(Math.abs(promptListDialogRect.height - 370), JSON.stringify(promptListDialogRect)).toBeLessThanOrEqual(12);
    await promptListDialog.getByRole('button', { name: '新增' }).click();
    const createPromptDialog = page.getByRole('dialog', { name: '新增' });
    await expect(createPromptDialog).toBeVisible();
    await expect(createPromptDialog.getByText('上传图片')).toBeVisible();
    await createPromptDialog.locator('.ai-prompt-template-upload-card').first().click();
    await expect(createPromptDialog.locator('.ai-prompt-template-upload-card.has-image img')).toHaveCount(1);
    await createPromptDialog.getByLabel('模板名称').fill('Playwright 模板');
    await createPromptDialog.getByLabel('模板提示词').fill('Playwright 生成提示词：白底女装商拍，产品细节清晰。');
    await createPromptDialog.getByRole('button', { name: '确定' }).click();
    await expect(createPromptDialog).toHaveCount(0);
    await expect(promptListDialog).toContainText('Playwright 模板');
    await expect(promptListDialog).toContainText('Playwright 生成提示词');
    await expect.poll(
      async () => page.evaluate(() => {
        const templates = JSON.parse(window.localStorage.getItem('buguai:dressingkit-image-prompt-templates') || '[]');
        return {
          count: templates.length,
          title: templates[0]?.title,
          prompt: templates[0]?.prompt,
          imageCount: templates[0]?.imageRefs?.length || 0,
        };
      }),
    ).toEqual({
      count: 1,
      title: 'Playwright 模板',
      prompt: 'Playwright 生成提示词：白底女装商拍，产品细节清晰。',
      imageCount: 1,
    });
    await promptListDialog.getByRole('button', { name: /Playwright 模板/ }).click();
    await expect(promptListDialog.getByRole('button', { name: '编辑' })).toBeEnabled();
    await promptListDialog.getByRole('button', { name: '编辑' }).click();
    const editPromptDialog = page.getByRole('dialog', { name: '编辑' });
    await expect(editPromptDialog).toBeVisible();
    await editPromptDialog.getByLabel('模板名称').fill('Playwright 模板 已编辑');
    await editPromptDialog.getByLabel('模板提示词').fill('Playwright 编辑提示词：蓝色背景，女装细节清晰。');
    await editPromptDialog.getByRole('button', { name: '确定' }).click();
    await expect(promptListDialog).toContainText('Playwright 模板 已编辑');
    await promptListDialog.getByLabel('提示词关键词').fill('已编辑');
    await promptListDialog.getByRole('button', { name: '查询' }).click();
    await expect(promptListDialog).toContainText('Playwright 模板 已编辑');
    await promptListDialog.getByRole('button', { name: '确定' }).click();
    await expect(promptTextarea).toHaveValue('Playwright 编辑提示词：蓝色背景，女装细节清晰。');
    await page.locator('.ai-prompt-actions button').filter({ hasText: '提示词列表' }).click();
    await promptListDialog.getByLabel('提示词类型').selectOption('saved');
    await promptListDialog.getByRole('button', { name: /Playwright 模板 已编辑/ }).click();
    await promptListDialog.getByRole('button', { name: '删除' }).click();
    await expect(promptListDialog).toContainText('暂无匹配数据');
    await expect.poll(
      async () => page.evaluate(() => JSON.parse(window.localStorage.getItem('buguai:dressingkit-image-prompt-templates') || '[]').length),
    ).toBe(0);
    await clickButton(page, '关闭');
    await page.locator('.ai-prompt-actions button').filter({ hasText: '提示词列表' }).click();
    await promptListDialog.getByRole('button', { name: /背面视角/ }).click();
    await promptListDialog.getByRole('button', { name: '确定' }).click();
    await expect(promptTextarea).toContainText('背面');
    await page.evaluate(() => window.localStorage.removeItem('buguai:dressingkit-image-prompt-templates'));
    await page.locator('.ai-prompt-actions button').filter({ hasText: '智能扩写' }).click();
    await expect(page.locator('.ai-showcase-left textarea')).toContainText('补充生成约束');
    await page.locator('.ai-prompt-actions button').filter({ hasText: '保存到模板' }).click();
    await expect(page.locator('.detail-dialog-card')).toContainText('已保存模板');
    await expect(page.locator('.detail-dialog-card .ai-prompt-list-row').filter({ hasText: '模板' })).toHaveCount(1);
    await clickButton(page, '关闭');
    await expect(page.locator('.ai-history-pill')).toHaveCount(0);
    await expect(page.locator('.ai-floating-history')).toBeVisible();
    await expectRectNear(page.locator('.ai-floating-history'), { width: 70, height: 246 }, 4);
    await page.locator('.ai-floating-history').click();
    await expect(page.locator('.ai-history-drawer')).toContainText('历史记录');
    await expect(page.locator('.ai-history-drawer')).toContainText('全部');
    await expect(page.locator('.ai-history-drawer')).toContainText('查询');
    await expect(page.locator('.ai-history-drawer')).toContainText('批量下载');
    await expect(page.locator('.ai-history-drawer[data-empty="true"]')).not.toContainText('发送到素材库');
    await expect(page.locator('.ai-history-drawer[data-empty="true"]')).not.toContainText('局部精修');
    await expect(page.locator('.ai-history-drawer')).toContainText('输入文件');
    await expect(page.locator('.ai-history-drawer')).toContainText('生成结果');
    await expect(page.locator('.ai-history-drawer')).toContainText('提示词');
    await expectRectNear(page.locator('.ai-history-drawer'), { width: 1102, height: 762 }, 5);
    await expectRectNear(page.locator('.ai-history-record-list'), { width: 108 }, 5);
    await expect(page.locator('.ai-history-record-thumb').first().locator('strong')).toHaveCount(0);
    await page.getByRole('button', { name: '关闭历史记录' }).click();
    if (aiImageFixtureEnabled) {
      await expect(page.locator('.ai-case-board')).toContainText('公共素材 228 组 · 577 张资产');
      await expect(page.locator('.ai-case-board')).toContainText('当前功能 33 组');
      await expect(page.locator('.ai-case-card')).toHaveCount(33);
    } else {
      await expect.poll(async () => page.locator('.ai-case-card').count()).toBeGreaterThan(10);
    }
    await expect(page.locator('.ai-case-board')).not.toContainText('Error invoking remote method');
    await expect(page.locator('.ai-case-board')).not.toContainText('oem:getSiteConfig');
    await expect(page.locator('.ai-case-board')).not.toContainText('OEM site config request failed');
    await expect(page.locator('.ai-case-board')).not.toContainText('后端读取失败');
    const splitScrollState = await page.evaluate(() => {
      const viewport = document.scrollingElement || document.documentElement;
      const left = document.querySelector('.ai-showcase-left');
      const main = document.querySelector('.ai-showcase-main');
      if (!viewport || !(left instanceof HTMLElement) || !(main instanceof HTMLElement)) {
        return { ok: false, reason: 'missing split panes' };
      }
      viewport.scrollTop = 0;
      main.scrollTop = 0;
      const leftTopBefore = Math.round(left.getBoundingClientRect().top);
      main.scrollTop = main.scrollHeight;
      const leftTopAfter = Math.round(left.getBoundingClientRect().top);
      const mainRight = Math.round(main.getBoundingClientRect().right);
      const expectedRight = window.innerWidth - 20;
      const state = {
        ok: main.scrollHeight > main.clientHeight
          && main.scrollTop > 0
          && viewport.scrollTop === 0
          && leftTopBefore === leftTopAfter
          && Math.abs(mainRight - expectedRight) <= 4,
        viewportScrollTop: viewport.scrollTop,
        leftTopBefore,
        leftTopAfter,
        mainScrollTop: main.scrollTop,
        mainClientHeight: main.clientHeight,
        mainScrollHeight: main.scrollHeight,
        mainRight,
        expectedRight,
      };
      main.scrollTop = 0;
      return state;
    });
    expect(splitScrollState.ok, JSON.stringify(splitScrollState)).toBe(true);
    const firstRowCaseTops = await page.locator('.ai-case-card').evaluateAll((cards) => {
      const firstTop = Math.round(cards[0]?.getBoundingClientRect().top ?? -1);
      return cards
        .map((card) => Math.round(card.getBoundingClientRect().top))
        .filter((top) => top === firstTop).length;
    });
    expect(firstRowCaseTops).toBeGreaterThanOrEqual(2);
    await expectRectNear(page.locator('.ai-case-card'), { width: 279, height: 366 }, 4);
    await expectRectNear(page.locator('.ai-case-compare'), { width: 241, height: 271 }, 4);
    await expectRectNear(page.locator('.ai-case-compare > .ai-image-stack').first(), { width: 102, height: 247 }, 4);
    const caseImageFit = await page.locator('.ai-case-card').first().evaluate((card) => {
      const inputImage = card.querySelector('.ai-image-stack-grid[data-role="input"] img');
      const outputImage = card.querySelector('.ai-image-stack-grid[data-role="output"] img');
      return {
        input: inputImage ? getComputedStyle(inputImage).objectFit : null,
        output: outputImage ? getComputedStyle(outputImage).objectFit : null,
      };
    });
    expect(caseImageFit).toEqual({ input: 'contain', output: 'contain' });
    if (aiImageFixtureEnabled) {
      const multiOutputCase = await page.locator('.ai-case-card').filter({ hasText: '男装' }).first().evaluate((card) => ({
        outputImages: card.querySelectorAll('.role-output img').length,
        hiddenBadges: card.querySelectorAll('.role-output .ai-image-more').length,
      }));
      expect(multiOutputCase).toEqual({ outputImages: 4, hiddenBadges: 0 });
    }
    await expect(page.locator('.ai-case-card-meta')).toHaveCount(0);
    await expect(page.locator('.ai-case-card').first().locator('.ai-case-card-name')).toHaveText('-');
    await expect(page.locator('.ai-case-card').nth(3).locator('.ai-case-card-name')).toHaveText('白色西装');
    await expectRectNear(page.locator('.ai-case-card-footer').first(), { width: 241, height: 58 }, 3);
    await expectRectNear(page.locator('.ai-case-card-actions').first(), { width: 156, height: 32 }, 3);
    await expectRectNear(page.locator('.ai-case-action-icon').first(), { width: 12, height: 12 }, 2);
    await expectRectNear(page.locator('.ai-case-card-footer button').filter({ hasText: '预览' }), { width: 62, height: 32 }, 3);
    await expectRectNear(page.locator('.ai-case-card-footer button').filter({ hasText: '尝试示例' }), { width: 86, height: 32 }, 3);
    await page.locator('.ai-control-stack .ai-chip-group button').filter({ hasText: '背面视角' }).click();
    await expect(page.locator('.ai-upload-tabs button')).toHaveCount(2);
    await expect(page.locator('.ai-prompt-tabs button').filter({ hasText: '背面视角' })).toHaveClass(/active/);
    const promptBeforeExample = (await promptTextarea.inputValue()).trim();
    const firstCaseInputImages = await page.locator('.ai-case-card').first().locator('.role-input img').count();
    expect(firstCaseInputImages).toBeGreaterThan(1);
    const generationLogCountBeforeExample = await page.evaluate(async () => {
      const settings = await window.contentStudio.getSettings();
      const logs = await window.contentStudio.listGenerationLogs(settings.workspacePath);
      return logs.length;
    });
    await page.locator('.ai-case-card-footer button').filter({ hasText: '尝试示例' }).first().click();
    await expect(page.locator('.ai-showcase-shell')).toBeVisible();
    await expect(page.locator('.ai-refinement-shell')).toHaveCount(0);
    await expect(page.locator('.image-workbench-layout')).toHaveCount(0);
    await expect(page.locator('.ai-showcase-left')).toContainText('图1');
    await expect(page.locator('.ai-upload-source-card.has-image img')).toHaveCount(firstCaseInputImages);
    await page.locator('.ai-floating-history').click();
    await expect(page.locator('.ai-history-drawer')).not.toContainText('已套用案例');
    await page.getByRole('button', { name: '关闭历史记录' }).click();
    await expect.poll(async () => page.evaluate(async () => {
      const settings = await window.contentStudio.getSettings();
      const logs = await window.contentStudio.listGenerationLogs(settings.workspacePath);
      return logs.length;
    })).toBe(generationLogCountBeforeExample);
    const appliedPrompt = (await promptTextarea.inputValue()).trim();
    expect(appliedPrompt).not.toBe(promptBeforeExample);
    expect(appliedPrompt.length).toBeGreaterThan(20);
    await page.locator('.ai-generate-button').click();
    await expect(page.locator('.ai-showcase-shell')).toBeVisible();
    await expect(page.locator('.ai-refinement-shell')).toHaveCount(0);
    await expect(page.locator('.image-workbench-layout')).toHaveCount(0);
    await expect(page.locator('.ai-showcase-left')).toContainText('图1');
    await expect(page.locator('.ai-upload-source-card.has-image img')).toHaveCount(firstCaseInputImages);
    await expect.poll(async () => page.evaluate(async () => {
      const settings = await window.contentStudio.getSettings();
      const logs = await window.contentStudio.listGenerationLogs(settings.workspacePath);
      const imageLog = logs.find((log) => log.kind === 'image');
      const input = imageLog?.input && typeof imageLog.input === 'object' ? imageLog.input : {};
      return {
        productCount: Array.isArray(input.productImageRefs) ? input.productImageRefs.length : -1,
        referenceCount: Array.isArray(input.referenceImageRefs) ? input.referenceImageRefs.length : -1,
      };
    })).toEqual({ productCount: 0, referenceCount: firstCaseInputImages });
    await page.locator('.ai-floating-history').click();
    await expect(page.locator('.ai-history-drawer')).toContainText('模特产品展示');
    await expect(page.locator('.ai-history-drawer')).toContainText('待配置');
    await expect(page.locator('.ai-history-drawer')).toContainText('输入文件');
    await expect(page.locator('.ai-history-drawer')).toContainText('生成结果');
    await expect(page.locator('.ai-history-drawer')).toContainText('提示词');
    await expect(page.locator('.ai-history-drawer')).toContainText(appliedPrompt.slice(0, 18));
    await page.getByRole('button', { name: '关闭历史记录' }).click();
    await page.locator('.ai-category-tabs button').filter({ hasText: 'Ai产品设计' }).click();
    await page.locator('.ai-feature-grid button').filter({ hasText: '产品详情页' }).click();
    await expect(page.locator('.ai-refinement-shell')).toHaveCount(0);
    await expect(page.locator('.ai-showcase-left')).toContainText('产品详情页');
    await expect(page.locator('.ai-case-card')).toHaveCount(0);
    await expect(page.locator('.ai-case-empty')).toContainText('暂无数据');
    await page.locator('.ai-category-tabs button').filter({ hasText: 'Ai营销' }).click();
    await page.locator('.ai-feature-grid button').filter({ hasText: '多人场景展示' }).click();
    await expect(page.locator('.ai-showcase-left')).not.toContainText('素材库');
    await expect(page.locator('.ai-showcase-left')).not.toContainText('视角');
    await expect(page.locator('.ai-prompt-tabs')).toHaveCount(0);
    await page.locator('.ai-feature-grid button').filter({ hasText: '模特换产品' }).click();
    if (aiImageFixtureEnabled) {
      const fourInputCase = await page.locator('.ai-case-card').filter({ hasText: '模特换衣01' }).first().evaluate((card) => ({
        inputImages: card.querySelectorAll('.role-input img').length,
        outputImages: card.querySelectorAll('.role-output img').length,
        hiddenBadges: card.querySelectorAll('.ai-image-more').length,
      }));
      expect(fourInputCase).toEqual({ inputImages: 4, outputImages: 3, hiddenBadges: 0 });
    }
    await page.locator('.ai-feature-grid button').filter({ hasText: 'Ai换脸' }).click();
    await expect(page.locator('.ai-showcase-left')).toContainText('模特图片');
    await expect(page.locator('.ai-showcase-left')).toContainText('人脸图片');
    await expect(page.locator('.ai-showcase-left')).toContainText('素材库');
    await expect(page.locator('.ai-showcase-left')).not.toContainText('图片质量');
    await expect(page.locator('.ai-showcase-left')).not.toContainText('提示词');
    await page.locator('.ai-feature-grid button').filter({ hasText: '换模特' }).click();
    await expect(page.locator('.ai-showcase-left')).toContainText('素材库');
    await expect(page.locator('.ai-showcase-left')).toContainText('图片质量');
    await expect(page.locator('.ai-showcase-left')).toContainText('提示词');
    await page.locator('.ai-category-tabs button').filter({ hasText: 'Ai产品设计' }).click();
    await page.locator('.ai-feature-grid button').filter({ hasText: '文生图' }).click();
    await expect(page.locator('.ai-showcase-left .ai-upload-grid')).toHaveCount(0);
    await expect(page.locator('.ai-showcase-left')).toContainText('提示词');
    await page.locator('.ai-feature-grid button').filter({ hasText: '图案应用' }).click();
    await expect(page.locator('.ai-showcase-left')).toContainText('上传素材');
    await expect(page.locator('.ai-showcase-left')).not.toContainText('上传参考');
    await page.locator('.ai-category-tabs button').filter({ hasText: 'Ai营销' }).click();
    await page.locator('.ai-feature-grid button').filter({ hasText: '换背景' }).click();
    await expect(page.locator('.ai-showcase-left')).not.toContainText('黑白阈值');
    await expect(page.locator('.ai-showcase-left input[type="color"]')).toHaveCount(0);
    await page.locator('.ai-category-tabs button').filter({ hasText: 'Ai生产' }).click();
    await expect(page.locator('.ai-feature-grid button')).toHaveCount(8);
    await expect(page.locator('.ai-feature-grid')).toContainText('平铺图');
    await page.locator('.ai-feature-grid button').filter({ hasText: '矢量图生成' }).click();
    await expect(page.locator('.ai-showcase-left')).toContainText('上传素材图片');
    await expect(page.locator('.ai-showcase-left')).toContainText('黑白阈值：65');
    await expect(page.locator('.ai-showcase-left')).not.toContainText('生图比例');
    await expect(page.locator('.ai-showcase-left')).not.toContainText('图片质量');
    await expect(page.locator('.ai-showcase-left')).not.toContainText('提示词');
    await page.locator('.ai-feature-grid button').filter({ hasText: 'Ai去水印' }).click();
    await expect(page.locator('.ai-showcase-left')).toContainText('素材图片');
    await expect(page.locator('.ai-showcase-left')).not.toContainText('图片质量');
    await expect(page.locator('.ai-showcase-left')).not.toContainText('提示词');
    if (aiImageFixtureEnabled) {
      await expect(page.locator('.ai-case-board')).toContainText('当前功能 4 组');
      await expect(page.locator('.ai-case-card')).toHaveCount(4);
    }
    await page.locator('.ai-case-card button').filter({ hasText: '预览' }).first().click();
    const imagePreviewDialog = page.getByRole('dialog', { name: '预览' });
    await expect(imagePreviewDialog).toBeVisible();
    await expectOverlayCoversSidebar(page, '.ai-preview-modal');
    await expectOverlayAboveFloatingControl(page, '.ai-preview-modal', '.ai-floating-history');
    await expect(imagePreviewDialog).toContainText('输入图');
    await expect(imagePreviewDialog).toContainText('输出图');
    await expect(imagePreviewDialog).toContainText('提示词');
    await expect(imagePreviewDialog.getByRole('button', { name: '复制' })).toBeVisible();
    await expect(imagePreviewDialog.getByRole('button', { name: '取消' })).toBeVisible();
    await expect(imagePreviewDialog.getByRole('button', { name: '确定' })).toBeVisible();
    const imagePreviewDialogRect = await imagePreviewDialog.locator('.ai-preview-card').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        width: rect.width,
        minWidth: Math.min(2304, window.innerWidth - 300),
      };
    });
    expect(imagePreviewDialogRect.width, JSON.stringify(imagePreviewDialogRect)).toBeGreaterThanOrEqual(imagePreviewDialogRect.minWidth);
    const previewImageCounts = await imagePreviewDialog.evaluate((dialog) => ({
      input: dialog.querySelectorAll('.role-input img').length,
      output: dialog.querySelectorAll('.role-output img').length,
      visibleOpenButtons: dialog.querySelectorAll('.ai-image-open-button').length,
    }));
    expect(previewImageCounts.input, JSON.stringify(previewImageCounts)).toBeGreaterThanOrEqual(1);
    expect(previewImageCounts.output, JSON.stringify(previewImageCounts)).toBeGreaterThanOrEqual(1);
    expect(previewImageCounts.visibleOpenButtons, JSON.stringify(previewImageCounts)).toBe(previewImageCounts.input + previewImageCounts.output);
    await imagePreviewDialog.locator('.role-input .ai-image-open-button').first().click();
    await expect(page.locator('.ai-image-preview-modal')).toBeVisible();
    await expectOverlayCoversSidebar(page, '.ai-image-preview-modal');
    await expectOverlayAboveFloatingControl(page, '.ai-image-preview-modal', '.ai-floating-history');
    await expect(page.locator('.ai-image-preview-modal img')).toBeVisible();
    await page.locator('.ai-image-preview-close').click();
    await expect(page.locator('.ai-image-preview-modal')).toHaveCount(0);
    await imagePreviewDialog.getByRole('button', { name: '确定' }).click();
    await expect(imagePreviewDialog).toHaveCount(0);
    await expect(page.locator('.ai-showcase-left')).toContainText('图1');
    },
    aiImageFixtureEnabled
      ? { env: { CONTENT_STUDIO_OEM_SITE_CONFIG_FIXTURE_PATH: aiImageFixturePath } }
      : undefined,
  );
	});
	
test('模型密钥不可解密时进入统一授权处理', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const configDir = await mkdtemp(join(tmpdir(), 'content-studio-reauthorize-model-'));
  const modelConfigPath = join(configDir, 'model-config.json');
  await writeFile(modelConfigPath, JSON.stringify({
    textApiKeyEncrypted: 'invalid-text-key',
    imageApiKeyEncrypted: 'invalid-image-key',
    videoApiKeyEncrypted: 'invalid-video-key',
    videoApiEndpoint: 'https://video.example.test/generate',
    videoProvider: 'generic-http',
  }, null, 2));

  try {
    await withContentStudio(testInfo, async ({ page }) => {
      await expect(page.locator('.model-reauthorization-banner')).toContainText('文字、图片、视频访问凭据');
      await expect(page.locator('.lime-settings-dialog')).toBeVisible();
      await expectModelSettingsVisible(page);
      await expect(page.locator('.lime-model-status')).toContainText('选择服务商，填写密钥和模型后完成配置。');

      await clickButton(page, '关闭设置');
      await expect(page.locator('.lime-settings-dialog')).toHaveCount(0);
      await page.locator('.model-reauthorization-banner button').click();
      await expect(page.locator('.lime-settings-dialog')).toBeVisible();
      await expectModelSettingsVisible(page);
    }, { modelConfigPath });
  } finally {
    await rm(configDir, { recursive: true, force: true });
  }
});

test('AI 视频页复刻关键选项并消费 OEM 视频素材清单', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const aiVideoFixturePath = resolve(projectRoot, '../../bugu/bugu/.tmp/ai-video-showcase/resolved-manifest.v1.ui.json');
  test.skip(!existsSync(aiVideoFixturePath), `缺少 AI 视频 fixture：${aiVideoFixturePath}`);

  await withContentStudio(
    testInfo,
    async ({ page }) => {
      await page.setViewportSize({ width: 2048, height: 1152 });
      await expect(page.locator('.app-shell')).toHaveAttribute('data-sidebar', 'expanded');
      await clickNavItem(page, 'AI 视频');
      await expect(page.locator('.app-shell')).toHaveAttribute('data-sidebar', 'expanded');
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.getByRole('button', { name: '折叠侧边栏' }).first()).toBeVisible();
      await expect(page.locator('.ai-video-showcase-shell')).toBeVisible();
      await page.setViewportSize({ width: 2048, height: 1152 });
      const videoSplitLayout = await page.evaluate(() => {
        const shell = document.querySelector('.ai-video-showcase-shell');
        const left = document.querySelector('.ai-video-left');
        const main = document.querySelector('.ai-video-main');
        const stage = document.querySelector('.stage');
        const sidebarCollapse = document.querySelector('.sidebar-collapse-btn');
        const shellRect = shell instanceof HTMLElement ? shell.getBoundingClientRect() : null;
        const mainRect = main instanceof HTMLElement ? main.getBoundingClientRect() : null;
        const leftStyle = left instanceof HTMLElement ? getComputedStyle(left) : null;
        const mainStyle = main instanceof HTMLElement ? getComputedStyle(main) : null;
        return {
          shell: shellRect ? Math.round(shellRect.width) : 0,
          shellHeight: shellRect ? Math.round(shellRect.height) : 0,
          left: left instanceof HTMLElement ? Math.round(left.getBoundingClientRect().width) : 0,
          leftHeight: left instanceof HTMLElement ? Math.round(left.getBoundingClientRect().height) : 0,
          leftOverflowY: leftStyle?.overflowY,
          main: mainRect ? Math.round(mainRect.width) : 0,
          mainHeight: mainRect ? Math.round(mainRect.height) : 0,
          mainOverflowY: mainStyle?.overflowY,
          rightGap: shellRect && mainRect ? Math.round(shellRect.right - mainRect.right) : 0,
          bodyHeight: Math.round(document.body.scrollHeight),
          documentHeight: Math.round(document.documentElement.scrollHeight),
          viewportHeight: Math.round(window.innerHeight),
          stageHeight: stage instanceof HTMLElement ? Math.round(stage.getBoundingClientRect().height) : 0,
          collapseDisplay: sidebarCollapse instanceof HTMLElement ? getComputedStyle(sidebarCollapse).display : null,
        };
      });
      expect(Math.abs(videoSplitLayout.left - 416), JSON.stringify(videoSplitLayout)).toBeLessThanOrEqual(3);
      expect(Math.abs(videoSplitLayout.shell - videoSplitLayout.left - 44 - videoSplitLayout.main), JSON.stringify(videoSplitLayout)).toBeLessThanOrEqual(3);
      expect(Math.abs(videoSplitLayout.rightGap), JSON.stringify(videoSplitLayout)).toBeLessThanOrEqual(3);
      expect(Math.abs(videoSplitLayout.shellHeight - (videoSplitLayout.viewportHeight - 40)), JSON.stringify(videoSplitLayout)).toBeLessThanOrEqual(3);
      expect(Math.abs(videoSplitLayout.leftHeight - videoSplitLayout.shellHeight), JSON.stringify(videoSplitLayout)).toBeLessThanOrEqual(3);
      expect(Math.abs(videoSplitLayout.mainHeight - videoSplitLayout.shellHeight), JSON.stringify(videoSplitLayout)).toBeLessThanOrEqual(3);
      expect(videoSplitLayout.bodyHeight, JSON.stringify(videoSplitLayout)).toBe(videoSplitLayout.viewportHeight);
      expect(videoSplitLayout.documentHeight, JSON.stringify(videoSplitLayout)).toBe(videoSplitLayout.viewportHeight);
      expect(videoSplitLayout.leftOverflowY, JSON.stringify(videoSplitLayout)).toBe('auto');
      expect(videoSplitLayout.mainOverflowY, JSON.stringify(videoSplitLayout)).toBe('hidden');
      expect(videoSplitLayout.collapseDisplay, JSON.stringify(videoSplitLayout)).not.toBe('none');
      await expect(page.locator('.ai-video-scene-heading')).toContainText('选择场景');
      await expect(page.locator('.ai-video-scene-heading')).toContainText('分镜图');
      await expect(page.locator('.ai-video-scene-selector')).toContainText('选择功能');
      await expect(page.locator('.ai-video-left')).toContainText('上传图片');
      await expect(page.locator('.ai-video-left')).not.toContainText('上传音频');
      await expect(page.locator('.ai-video-upload-grid')).not.toContainText('上传视频');
      await expectRectNear(page.locator('.ai-video-upload-panel .ai-video-upload-grid'), { width: 376, height: 104 }, 4);
      await expectRectNear(page.locator('.ai-video-upload-panel .ai-video-upload-card'), { width: 376, height: 104 }, 4);
      await expect(page.locator('.ai-video-left')).not.toContainText('图片可以上传 1-7 张');
      await expect(page.locator('.ai-video-left')).toContainText('生图数量');
      await expect(page.locator('.ai-video-left')).toContainText('生图比例');
      await expect(page.locator('.ai-video-left')).toContainText('图片质量');
      await expect(page.locator('.ai-video-left')).not.toContainText('模型版本');
      await expect(page.locator('.ai-video-left')).not.toContainText('视频时长');
      await expect(page.locator('.ai-video-left')).not.toContainText('分辨率');
      await expect(page.locator('.ai-video-left')).not.toContainText('视频大小（宽*高）');
      await expect(page.locator('.ai-video-main-tabs')).toContainText('选择功能');
      await expect(page.locator('.ai-video-main-tabs')).toContainText('生成结果');
      const videoPromptTextarea = page.locator('.ai-video-left textarea');
      await page.evaluate(() => window.localStorage.removeItem('buguai:dressingkit-video-prompt-templates'));
      await expect(page.locator('.ai-video-prompt-actions button')).toHaveCount(3);
      await page.locator('.ai-video-prompt-actions button').filter({ hasText: '智能扩写' }).click();
      await expect(videoPromptTextarea).toContainText('补充生成约束');
      await page.locator('.ai-video-prompt-actions button').filter({ hasText: '提示词列表' }).click();
      const videoPromptListDialog = page.getByRole('dialog', { name: '提示词列表' });
      await expect(videoPromptListDialog).toBeVisible();
      await expectOverlayCoversSidebar(page, '.detail-dialog-backdrop');
      await expectOverlayAboveFloatingControl(page, '.detail-dialog-backdrop', '.ai-video-floating-history');
      await expect(videoPromptListDialog.getByLabel('提示词类型')).toBeVisible();
      await expect(videoPromptListDialog.getByRole('button', { name: '新增' })).toBeVisible();
      await expect(videoPromptListDialog.getByRole('button', { name: '编辑' })).toBeDisabled();
      await expect(videoPromptListDialog.getByRole('button', { name: '删除' })).toBeDisabled();
      await expect(videoPromptListDialog).toContainText('分镜图');
      await videoPromptListDialog.getByRole('button', { name: '新增' }).click();
      const createVideoPromptDialog = page.getByRole('dialog', { name: '新增' });
      await expect(createVideoPromptDialog).toBeVisible();
      await createVideoPromptDialog.getByLabel('模板名称').fill('Playwright 视频模板');
      await createVideoPromptDialog.getByLabel('模板提示词').fill('Playwright 视频提示词：模特走位自然，镜头围绕产品卖点推进。');
      await createVideoPromptDialog.getByRole('button', { name: '确定' }).click();
      await expect(createVideoPromptDialog).toHaveCount(0);
      await expect(videoPromptListDialog).toContainText('Playwright 视频模板');
      await expect.poll(
        async () => page.evaluate(() => {
          const templates = JSON.parse(window.localStorage.getItem('buguai:dressingkit-video-prompt-templates') || '[]');
          return {
            count: templates.length,
            title: templates[0]?.title,
            prompt: templates[0]?.prompt,
          };
        }),
      ).toEqual({
        count: 1,
        title: 'Playwright 视频模板',
        prompt: 'Playwright 视频提示词：模特走位自然，镜头围绕产品卖点推进。',
      });
      await videoPromptListDialog.getByRole('button', { name: /Playwright 视频模板/ }).click();
      await expect(videoPromptListDialog.getByRole('button', { name: '编辑' })).toBeEnabled();
      await videoPromptListDialog.getByRole('button', { name: '编辑' }).click();
      const editVideoPromptDialog = page.getByRole('dialog', { name: '编辑' });
      await expect(editVideoPromptDialog).toBeVisible();
      await editVideoPromptDialog.getByLabel('模板名称').fill('Playwright 视频模板 已编辑');
      await editVideoPromptDialog.getByLabel('模板提示词').fill('Playwright 视频提示词已编辑：镜头从产品特写切到人物使用场景。');
      await editVideoPromptDialog.getByRole('button', { name: '确定' }).click();
      await expect(videoPromptListDialog).toContainText('Playwright 视频模板 已编辑');
      await videoPromptListDialog.getByLabel('提示词关键词').fill('已编辑');
      await videoPromptListDialog.getByRole('button', { name: '查询' }).click();
      await expect(videoPromptListDialog).toContainText('Playwright 视频模板 已编辑');
      await videoPromptListDialog.getByRole('button', { name: '确定' }).click();
      await expect(videoPromptTextarea).toHaveValue('Playwright 视频提示词已编辑：镜头从产品特写切到人物使用场景。');
      await page.locator('.ai-video-prompt-actions button').filter({ hasText: '提示词列表' }).click();
      await videoPromptListDialog.getByLabel('提示词类型').selectOption('saved');
      await videoPromptListDialog.getByRole('button', { name: /Playwright 视频模板 已编辑/ }).click();
      await videoPromptListDialog.getByRole('button', { name: '删除' }).click();
      await expect(videoPromptListDialog).not.toContainText('Playwright 视频模板 已编辑');
      await expect.poll(
        async () => page.evaluate(() => JSON.parse(window.localStorage.getItem('buguai:dressingkit-video-prompt-templates') || '[]').length),
      ).toBe(0);
      await clickButton(page, '关闭');
      await page.locator('.ai-video-prompt-assistant-fab').click();
      const videoAssistantDialog = page.getByRole('dialog', { name: '提示词助手' });
      await expect(videoAssistantDialog).toBeVisible();
      await expectOverlayCoversSidebar(page, '.ai-assistant-overlay');
      await expect(videoAssistantDialog.locator('.agent-session-claw-shell')).toBeVisible();
      await expect(videoAssistantDialog.locator('.agent-claw-chat')).toBeVisible();
      await expect(videoAssistantDialog.locator('.agent-claw-sidecar')).toBeVisible();
      await videoAssistantDialog.getByRole('button', { name: '本地扩写' }).click();
      await expect(videoAssistantDialog.locator('.agent-claw-draft-editor textarea').nth(1)).toHaveValue(/补充生成约束/);
      await videoAssistantDialog.getByRole('button', { name: '保存模板' }).click();
      await videoAssistantDialog.getByRole('button', { name: '确定' }).click();
      await expect(videoPromptTextarea).toContainText('补充生成约束');
      await expect.poll(
        async () => page.evaluate(() => JSON.parse(window.localStorage.getItem('buguai:dressingkit-video-prompt-templates') || '[]').length),
      ).toBe(1);
      const videoFloatingControlsLayout = await page.evaluate(() => {
        const history = document.querySelector('.ai-video-floating-history');
        const assistant = document.querySelector('.ai-video-prompt-assistant-fab');
        if (!(history instanceof HTMLElement) || !(assistant instanceof HTMLElement)) {
          return { ok: false, reason: 'missing floating controls' };
        }
        const historyRect = history.getBoundingClientRect();
        const assistantRect = assistant.getBoundingClientRect();
        return {
          ok: assistantRect.top > historyRect.bottom + 12 && assistantRect.right <= window.innerWidth - 8,
          historyBottom: Math.round(historyRect.bottom),
          assistantTop: Math.round(assistantRect.top),
          assistantRight: Math.round(assistantRect.right),
          viewportWidth: window.innerWidth,
        };
      });
      expect(videoFloatingControlsLayout.ok, JSON.stringify(videoFloatingControlsLayout)).toBe(true);
      await page.locator('.ai-video-generate-button').click();
      await expect(page.locator('.ai-video-validation-message')).toHaveText('请先上传图片');
      await expect(page.locator('.ai-video-main-tabs button').filter({ hasText: '选择功能' })).toHaveClass(/active/);
      await expect(page.locator('.ai-video-result-board')).toHaveCount(0);
      await expect(page.locator('.ai-video-feature-grid .ai-video-feature-button')).toHaveCount(3);
      await expect(page.locator('.ai-video-feature-grid')).toContainText('分镜图');
      await expect(page.locator('.ai-video-feature-grid')).toContainText('智能视频');
      await expect(page.locator('.ai-video-feature-grid')).toContainText('全能视频');
      await expect(page.locator('.ai-video-feature-grid button').filter({ hasText: '分镜图' })).toHaveClass(/active/);
      await expectRectNear(page.locator('.ai-video-feature-grid .ai-video-feature-button'), { width: 130, height: 120 }, 3);
      await expectRectNear(page.locator('.ai-video-feature-grid .ai-video-feature-icon-wrap'), { width: 46, height: 46 }, 3);
      await expectRectNear(page.locator('.ai-video-feature-grid .ai-video-feature-icon'), { width: 36, height: 36 }, 3);
      await expect(page.locator('.ai-video-feature-grid svg.ai-video-feature-icon')).toHaveCount(3);
      await expect(page.locator('.ai-video-feature-grid img[src*="oss.dressingkit.com"]')).toHaveCount(0);
      await expect(page.locator('img[src*="oss.dressingkit.com"], video[src*="oss.dressingkit.com"]')).toHaveCount(0);
      await expect(page.locator('.ai-video-industry-filter')).toContainText('服饰类');
      await expect(page.locator('.ai-video-industry-filter')).toContainText('运动户外类');
      await expect(page.locator('.ai-video-case-board')).toContainText('公共视频案例 51 组 · 111 个资产 · 当前功能 9 组');
      await expect(page.locator('.ai-video-case-board')).not.toContainText('Error invoking remote method');
      await expect(page.locator('.ai-video-case-board')).not.toContainText('oem:getSiteConfig');
      await expect(page.locator('.ai-video-case-board')).not.toContainText('OEM site config request failed');
      await expect(page.locator('.ai-video-case-board')).not.toContainText('后端读取失败');
      await expect(page.locator('.ai-video-case-card')).toHaveCount(9);
      await expect(page.locator('.ai-video-case-card img')).not.toHaveCount(0);
      await expect(page.locator('.ai-video-case-card video')).toHaveCount(0);
      await expect(page.locator('.ai-video-case-media.output-only')).toHaveCount(0);
      await expect(page.locator('.ai-video-case-card').first().locator('.ai-video-case-meta')).toHaveText('分镜图');
      await expect(page.locator('.ai-video-case-card').first().locator('.ai-video-case-meta')).not.toContainText('服饰类');
      await expect(page.locator('.ai-video-case-card').first().locator('.ai-video-case-meta')).not.toContainText('个素材');
      await expectRectNear(page.locator('.ai-video-case-card'), { width: 374, height: 359 }, 4);
      await expectRectNear(page.locator('.ai-video-case-media'), { width: 340, height: 271 }, 4);
      await expectRectNear(page.locator('.ai-video-case-bottom').first(), { width: 340, height: 58 }, 3);
      await expectRectNear(page.locator('.ai-video-case-meta strong').first(), { width: 42, height: 23 }, 3);
      await expectRectNear(page.locator('.ai-video-case-actions').first(), { width: 156, height: 32 }, 3);
      await expectRectNear(page.locator('.ai-video-case-action-icon').first(), { width: 12, height: 12 }, 2);
      await expectRectNear(page.locator('.ai-video-case-media > .ai-video-media-stack').first(), { width: 152, height: 247 }, 4);
      await expectRectNear(page.locator('.ai-video-media-stack[data-role="input"] .ai-video-media-grid').first(), { width: 152, height: 220 }, 4);
      await expectRectNear(page.locator('.ai-video-media-stack[data-role="input"] .ai-video-media-frame').first(), { width: 152, height: 220 }, 4);
      await expect(page.locator('.ai-video-case-card').first().locator('.ai-video-input-section-title')).toHaveCount(0);
      const mediaLabelOrder = await page.evaluate(() => {
        const grid = document.querySelector('.ai-video-media-stack[data-role="input"] .ai-video-media-grid');
        const label = document.querySelector('.ai-video-media-stack[data-role="input"] .ai-video-media-label');
        if (!(grid instanceof HTMLElement) || !(label instanceof HTMLElement)) return null;
        return {
          gridTop: Math.round(grid.getBoundingClientRect().top),
          gridBottom: Math.round(grid.getBoundingClientRect().bottom),
          labelTop: Math.round(label.getBoundingClientRect().top),
        };
      });
      expect(mediaLabelOrder, '视频案例媒体和标签应该可测量').not.toBeNull();
      expect(
        mediaLabelOrder.labelTop > mediaLabelOrder.gridBottom,
        JSON.stringify(mediaLabelOrder),
      ).toBe(true);
      await expectRectNear(page.locator('.ai-video-case-actions button').filter({ hasText: '预览' }), { width: 62, height: 32 }, 3);
      await expectRectNear(page.locator('.ai-video-case-actions button').filter({ hasText: '尝试示例' }), { width: 86, height: 32 }, 3);
      await page.locator('.ai-video-industry-filter button').filter({ hasText: '珠宝首饰类' }).click();
      const sparseVideoCaseBoardLayout = await page.evaluate(() => {
        const main = document.querySelector('.ai-video-main');
        const board = document.querySelector('.ai-video-case-board');
        const filter = document.querySelector('.ai-video-industry-filter');
        const grid = document.querySelector('.ai-video-case-grid');
        if (
          !(main instanceof HTMLElement)
          || !(board instanceof HTMLElement)
          || !(filter instanceof HTMLElement)
          || !(grid instanceof HTMLElement)
        ) {
          return { ok: false, reason: 'missing sparse video case board parts' };
        }
        const mainRect = main.getBoundingClientRect();
        const boardRect = board.getBoundingClientRect();
        const filterRect = filter.getBoundingClientRect();
        const gridRect = grid.getBoundingClientRect();
        const gridStyle = getComputedStyle(grid);
        return {
          ok: Math.abs(boardRect.bottom - mainRect.bottom) <= 3
            && Math.abs(gridRect.top - filterRect.bottom - 12) <= 3,
          mainBottom: Math.round(mainRect.bottom),
          boardBottom: Math.round(boardRect.bottom),
          boardHeight: Math.round(boardRect.height),
          gridTop: Math.round(gridRect.top),
          filterBottom: Math.round(filterRect.bottom),
          gridOverflowY: gridStyle.overflowY,
          bodyHeight: Math.round(document.body.scrollHeight),
          viewportHeight: Math.round(window.innerHeight),
        };
      });
      expect(sparseVideoCaseBoardLayout.ok, JSON.stringify(sparseVideoCaseBoardLayout)).toBe(true);
      expect(sparseVideoCaseBoardLayout.gridOverflowY, JSON.stringify(sparseVideoCaseBoardLayout)).toBe('auto');
      expect(sparseVideoCaseBoardLayout.bodyHeight, JSON.stringify(sparseVideoCaseBoardLayout)).toBe(sparseVideoCaseBoardLayout.viewportHeight);
      await page.locator('.ai-video-industry-filter button').filter({ hasText: '全部' }).click();
      await page.locator('.ai-video-case-card .ai-video-media-open').first().click();
      await expect(page.locator('.ai-video-media-preview-modal')).toBeVisible();
      await expectOverlayCoversSidebar(page, '.ai-video-media-preview-modal');
      await expectOverlayAboveFloatingControl(page, '.ai-video-media-preview-modal', '.ai-video-floating-history');
      await page.locator('.ai-video-media-preview-close').click();
      await expect(page.locator('.ai-video-media-preview-modal')).toHaveCount(0);
      const videoGenerationLogCountBeforeExample = await page.evaluate(async () => {
        const settings = await window.contentStudio.getSettings();
        const logs = await window.contentStudio.listGenerationLogs(settings.workspacePath);
        return logs.length;
      });
      await page.locator('.ai-video-case-actions button').filter({ hasText: '尝试示例' }).first().click();
      await expect(page.locator('.ai-video-main-tabs button').filter({ hasText: '选择功能' })).toHaveClass(/active/);
      await expect(page.locator('.ai-video-result-board')).toHaveCount(0);
      await expect(page.locator('.video-replica-workbench')).toHaveCount(0);
      await expect(page.locator('.ai-video-upload-preview-card img')).not.toHaveCount(0);
      await page.locator('.ai-video-floating-history').click();
      await expect(page.locator('.ai-video-history-drawer')).not.toContainText('已套用视频案例');
      await page.getByLabel('关闭历史记录').click();
      await expect.poll(async () => page.evaluate(async () => {
        const settings = await window.contentStudio.getSettings();
        const logs = await window.contentStudio.listGenerationLogs(settings.workspacePath);
        return logs.length;
      })).toBe(videoGenerationLogCountBeforeExample);
      await expect(page.locator('.ai-video-industry-filter button.active')).toHaveText('全部');
      await expect(page.locator('.ai-video-case-card')).toHaveCount(9);
      await expect(page.locator('.ai-video-left textarea')).toHaveValue(/生成图片的6宫格分镜图|服装视觉大片/);
      await page.locator('.ai-video-upload-remove').first().click();
      await expect(page.locator('.ai-video-upload-preview-card')).toHaveCount(0);
      await page.locator('.ai-video-upload-card').filter({ hasText: '上传图片' }).click();
      await expect(page.locator('.ai-video-upload-preview-card img')).toHaveCount(1);
      await expect(page.locator('.ai-video-validation-message')).toHaveCount(0);

      await page.locator('.ai-video-feature-grid button').filter({ hasText: '智能视频' }).click();
      await expect(page.locator('.ai-video-left')).toContainText('上传图片');
      await expect(page.locator('.ai-video-left')).toContainText('上传音频');
      await expect(page.locator('.ai-video-upload-grid')).not.toContainText('上传视频');
      await expectRectNear(page.locator('.ai-video-upload-panel .ai-video-upload-grid'), { width: 376, height: 160 }, 4);
      await expectRectNear(page.locator('.ai-video-upload-panel .ai-video-upload-card'), { width: 376, height: 74 }, 4);
      const smartUploadPanelHeight = await page.locator('.ai-video-upload-panel').evaluate((element) =>
        Math.round(element.getBoundingClientRect().height),
      );
      expect(smartUploadPanelHeight).toBeLessThanOrEqual(340);
      await expect(page.locator('.ai-video-left')).toContainText('视频素材库');
      await expect(page.locator('.ai-video-left')).toContainText('上传视频中的人脸素材进行报备');
      await expect(page.locator('.ai-video-left')).toContainText('模型版本');
      await expect(page.locator('.ai-video-left')).toContainText('视频时长');
      await expect(page.locator('.ai-video-left')).toContainText('分辨率');
      await expect(page.locator('.ai-video-left')).toContainText('视频大小（宽*高）');
      await page.locator('.ai-video-library-entry button').click();
      await expect(page.locator('.ai-video-material-library')).toBeVisible();
      await expect(page.locator('.ai-video-material-header')).toContainText('视频素材库');
      await expect(page.locator('.ai-video-material-back')).toBeVisible();
      await expectRectNear(page.locator('.ai-video-material-library'), { height: videoSplitLayout.shellHeight }, 4);
      await expectRectNear(page.locator('.ai-video-material-header'), { height: 71 }, 3);
      await expect(page.locator('.ai-video-material-kind-tabs')).toContainText('图片');
      await expect(page.locator('.ai-video-material-kind-tabs')).toContainText('视频');
      await expect(page.locator('.ai-video-material-kind-tabs')).toContainText('音频');
      await expectRectNear(page.locator('.ai-video-material-kind-tabs'), { height: 53 }, 3);
      await expect(page.locator('.ai-video-material-actor-tabs')).toContainText('虚拟人');
      await expectRectNear(page.locator('.ai-video-material-actor-tabs'), { height: 51 }, 3);
      await expect(page.locator('.ai-video-material-status-tabs')).toContainText('已报备');
      await expectRectNear(page.locator('.ai-video-material-toolbar'), { height: 71 }, 3);
      await expectRectNear(page.locator('.ai-video-material-action').filter({ hasText: '刷新' }), { width: 64, height: 32 }, 3);
      await expectRectNear(page.locator('.ai-video-material-action').filter({ hasText: '新增素材' }), { width: 88, height: 32 }, 3);
      await expect(page.locator('.ai-video-material-empty')).toContainText('当前筛选下暂无素材');
      await page.locator('.ai-video-material-action').filter({ hasText: '新增素材' }).click();
      await expect(page.locator('.ai-video-material-upload-card[data-kind="image"]')).toContainText('上传图片');
      await expectOverlayCoversSidebar(page, '.ai-video-material-upload-modal');
      await expectOverlayAboveFloatingControl(page, '.ai-video-material-upload-modal', '.ai-video-floating-history');
      await expectRectNear(page.locator('.ai-video-material-upload-card[data-kind="image"]'), { width: 1000, height: 445 }, 5);
      await expectRectNear(page.locator('.ai-video-material-upload-row'), { height: 34 }, 4);
      await expect(page.locator('.ai-video-material-upload-row')).toContainText('AI 视频图片类型：支持 jpeg/png/webp/bmp/tiff/gif/heic/heif，单张小于 30MB。');
      await expectRectNear(page.locator('.ai-video-material-upload-drop'), { width: 581, height: 232 }, 5);
      await expect(page.locator('.ai-video-material-upload-drop')).toContainText('点击上方“上传”或拖拽到此区域');
      await expect(page.locator('.ai-video-material-upload-note')).toContainText('注：宽高需在 300-6000px，宽高比需大于 0.4 且小于 2.5。');
      await page.locator('.ai-video-material-upload-button').click();
      await expect(page.locator('.ai-video-material-card')).toHaveCount(1);
      await expect(page.locator('.ai-video-material-card')).toContainText('已报备');
      await page.locator('.ai-video-material-kind-tabs button').filter({ hasText: '视频' }).click();
      await expect(page.locator('.ai-video-material-actor-tabs')).toHaveCount(0);
      await expectRectNear(page.locator('.ai-video-material-toolbar'), { height: 71 }, 3);
      await page.locator('.ai-video-material-action').filter({ hasText: '新增素材' }).click();
      await expect(page.locator('.ai-video-material-upload-card[data-kind="video"]')).toContainText('新增素材');
      await expectRectNear(page.locator('.ai-video-material-upload-card[data-kind="video"]'), { width: 820, height: 628 }, 5);
      await expectRectNear(page.locator('.ai-video-material-upload-drop'), { width: 732, height: 320 }, 5);
      await expect(page.locator('.ai-video-material-upload-drop')).toContainText('点击上传或拖拽上传视频素材');
      await expect(page.locator('.ai-video-material-upload-drop')).toContainText('支持常见视频格式；单条时长 <= 15.1 秒。');
      await page.locator('.ai-video-material-upload-drop').click();
      await page.locator('.ai-video-material-name-field input[name="material-title"]').fill('本地报备视频素材');
      await page.locator('.ai-video-material-upload-card footer button.primary').click();
      await expect(page.locator('.ai-video-material-card')).toHaveCount(1);
      await expect(page.locator('.ai-video-material-card')).toContainText('审核中');
      await page.locator('.ai-video-material-kind-tabs button').filter({ hasText: '音频' }).click();
      await page.locator('.ai-video-material-action').filter({ hasText: '新增素材' }).click();
      await expect(page.locator('.ai-video-material-upload-card[data-kind="audio"]')).toContainText('新增音频');
      await expectRectNear(page.locator('.ai-video-material-upload-card[data-kind="audio"]'), { width: 820, height: 628 }, 5);
      await expectRectNear(page.locator('.ai-video-material-upload-drop'), { width: 732, height: 320 }, 5);
      await expect(page.locator('.ai-video-material-upload-drop')).toContainText('点击上传或拖拽上传音频素材');
      await expect(page.locator('.ai-video-material-upload-drop')).toContainText('支持常见音频格式；时长 <= 15.1 秒。');
      await page.locator('.ai-video-material-upload-drop').click();
      await page.locator('.ai-video-material-name-field input[name="material-title"]').fill('本地报备音频素材');
      await page.locator('.ai-video-material-upload-card footer button.primary').click();
      await expect(page.locator('.ai-video-material-card')).toHaveCount(1);
      await page.locator('.ai-video-material-kind-tabs button').filter({ hasText: '视频' }).click();
      await page.locator('.ai-video-material-card-actions button').filter({ hasText: '使用' }).click();
      await expect(page.locator('.ai-video-feature-content')).toBeVisible();
      await expect(page.locator('.ai-video-feature-grid button').filter({ hasText: '全能视频' })).toHaveClass(/active/);
      await expect(page.locator('.ai-video-upload-preview-strip[data-kind="video"] .ai-video-upload-preview-card')).toHaveCount(1);
      await page.locator('.ai-video-feature-grid button').filter({ hasText: '智能视频' }).click();
      await page.locator('.ai-video-upload-card').filter({ hasText: '上传音频' }).click();
      await expect(page.locator('.ai-video-upload-preview-strip[data-kind="audio"] .ai-video-upload-preview-card')).toHaveCount(1);
      await page.locator('.ai-video-generate-button').click();
      await expect.poll(async () => page.evaluate(async () => {
        const settings = await window.contentStudio.getSettings();
        const logs = await window.contentStudio.listGenerationLogs(settings.workspacePath);
        const videoLog = logs.find((log) => {
          if (log.kind !== 'video') return false;
          const input = log.input && typeof log.input === 'object' ? log.input : {};
          return input.featureTitle === '智能视频';
        });
        const input = videoLog?.input && typeof videoLog.input === 'object' ? videoLog.input : {};
        const output = videoLog?.output && typeof videoLog.output === 'object' ? videoLog.output : {};
        const outputRefs = Array.isArray(output.assetRefs) ? output.assetRefs : [];
        return {
          status: videoLog?.status,
          featureTitle: input.featureTitle,
          outputCount: outputRefs.length,
        };
      })).toEqual({ status: 'blocked', featureTitle: '智能视频', outputCount: 2 });
      await page.locator('.ai-video-floating-history').click();
      await expect(page.locator('.ai-video-history-operation-row button').filter({ hasText: '发送到素材库' })).toBeDisabled();
      await expect(page.locator('.ai-video-history-operation-row button').filter({ hasText: '局部精修' })).toBeDisabled();
      await page.getByLabel('关闭历史记录').click();
      await page.locator('.ai-video-main-tabs button').filter({ hasText: '选择功能' }).click();
      await expect(page.locator('.ai-video-case-board')).toContainText('当前功能 39 组');
      await expect(page.locator('.ai-video-case-card')).toHaveCount(39);
      await expect(page.locator('.ai-video-case-card img')).not.toHaveCount(0);
      await expect(page.locator('.ai-video-case-card video')).not.toHaveCount(0);
      await expect(page.locator('.ai-video-case-media.output-only')).toHaveCount(3);
      const promptOnlyVideoLogCountBeforeExample = await page.evaluate(async () => {
        const settings = await window.contentStudio.getSettings();
        const logs = await window.contentStudio.listGenerationLogs(settings.workspacePath);
        return logs.length;
      });
      await page.locator('.ai-video-case-card').filter({ hasText: '男士香薰' }).locator('.ai-video-case-actions button').filter({ hasText: '尝试示例' }).click();
      await expect(page.locator('.ai-video-upload-preview-card')).toHaveCount(0);
      await expect(page.locator('.ai-video-left textarea')).toHaveValue(/男士香薰|香薰/);
      await page.locator('.ai-video-generate-button').click();
      await expect(page.locator('.ai-video-validation-message')).toHaveCount(0);
      await expect(page.locator('.ai-video-main-tabs button').filter({ hasText: '生成结果' })).toHaveClass(/active/);
      await expect.poll(async () => page.evaluate(async (baselineCount) => {
        const settings = await window.contentStudio.getSettings();
        const logs = await window.contentStudio.listGenerationLogs(settings.workspacePath);
        const newLogs = logs.slice(0, Math.max(0, logs.length - baselineCount));
        const log = newLogs.find((item) => item.kind === 'video');
        const input = log?.input && typeof log.input === 'object' ? log.input : {};
        return {
          status: log?.status,
          featureTitle: input.featureTitle,
          selectedCaseTitle: input.selectedCaseTitle,
          imageCount: Array.isArray(input.imageAssetRefs) ? input.imageAssetRefs.length : -1,
        };
      }, promptOnlyVideoLogCountBeforeExample)).toEqual({
        status: 'blocked',
        featureTitle: '智能视频',
        selectedCaseTitle: '男士香薰',
        imageCount: 0,
      });
      await page.locator('.ai-video-main-tabs button').filter({ hasText: '选择功能' }).click();
      await page.locator('.ai-video-case-actions button').filter({ hasText: '尝试示例' }).first().click();
      await expect(page.locator('.ai-video-main-tabs button').filter({ hasText: '选择功能' })).toHaveClass(/active/);
      await expect(page.locator('.ai-video-result-board')).toHaveCount(0);
      await expect(page.locator('.ai-video-left textarea')).toHaveValue(/直播带货|小黄车|动态视频/);
      await page.locator('.ai-video-feature-grid button').filter({ hasText: '分镜图' }).click();
      await expect(page.locator('.ai-video-left')).toContainText('生图数量');
      await expect(page.locator('.ai-video-left textarea')).toHaveValue(/直播带货|小黄车|动态视频/);

      await page.locator('.ai-video-feature-grid button').filter({ hasText: '全能视频' }).click();
      await expect(page.locator('.ai-video-left')).toContainText('上传图片');
      await expect(page.locator('.ai-video-left')).toContainText('上传视频');
      await expect(page.locator('.ai-video-left')).toContainText('上传音频');
      await expect(page.locator('.ai-video-left')).toContainText('上传视频中的人脸素材进行报备');
      await page.locator('.ai-video-library-entry button').click();
      await expect(page.locator('.ai-video-material-actor-tabs')).toContainText('虚拟人');
      await page.locator('.ai-video-material-card-actions button').filter({ hasText: '使用' }).first().click();
      await page.locator('.ai-video-upload-card').filter({ hasText: '上传视频' }).click();
      await expect(page.locator('.ai-video-upload-preview-strip[data-kind="video"] .ai-video-upload-preview-card')).toHaveCount(1);
      await expect(page.locator('.ai-video-case-board')).toContainText('当前功能 3 组');
      await expect(page.locator('.ai-video-case-card')).toHaveCount(3);
      await expectRectNear(page.locator('.ai-video-case-card.is-wide'), { width: 633.33, height: 359 }, 4);
      await expectRectNear(page.locator('.ai-video-case-media.is-wide'), { width: 599.33, height: 271 }, 4);
      await expectRectNear(page.locator('.ai-video-case-media.is-wide > .ai-video-media-stack').first(), { width: 281.66, height: 247 }, 4);
      await expectRectNear(page.locator('.ai-video-case-card.is-wide .ai-video-input-files').first(), { width: 281.66, height: 220 }, 4);
      await expect(page.locator('.ai-video-case-card.is-wide').first().locator('.ai-video-input-section-title')).toHaveText(['图片', '视频']);
      await page.locator('.ai-video-case-actions button').filter({ hasText: '尝试示例' }).first().click();
      await expect(page.locator('.ai-video-left textarea')).toHaveValue(/爆款复刻|拖把|负面提示词/);
      await expect(page.locator('.ai-video-main-tabs button').filter({ hasText: '选择功能' })).toHaveClass(/active/);
      await expect(page.locator('.ai-video-result-board')).toHaveCount(0);

      await page.locator('.ai-video-scene-selector').click();
      await expect(page.locator('.detail-dialog-card')).toHaveCount(0);
      await expect(page.locator('.ai-video-feature-content')).toBeVisible();
      await page.locator('.ai-video-case-actions button').filter({ hasText: '预览' }).first().click();
      await expect(page.locator('.ai-video-preview-modal')).toBeVisible();
      await expectOverlayCoversSidebar(page, '.ai-video-preview-modal');
      await expectOverlayAboveFloatingControl(page, '.ai-video-preview-modal', '.ai-video-floating-history');
      await expect(page.locator('.ai-video-preview-head button[aria-label="关闭预览"]')).toBeVisible();
      await expect(page.locator('.ai-video-preview-card')).toContainText('输入文件');
      await expect(page.locator('.ai-video-preview-card')).toContainText('输出图');
      await expect(page.locator('.ai-video-preview-card')).toContainText('提示词');
      await expect(page.locator('.ai-video-preview-prompt button').filter({ hasText: '复制' })).toBeVisible();
      await expect(page.locator('.ai-video-preview-footer button').filter({ hasText: '取消' })).toBeVisible();
      await expect(page.locator('.ai-video-preview-footer button').filter({ hasText: '尝试示例' })).toBeVisible();
      await expect(page.locator('.ai-video-preview-footer button').filter({ hasText: '确定' })).toBeVisible();
      const videoPreviewDialogLayout = await page.locator('.ai-video-preview-card').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const overlay = document.querySelector('.ai-video-preview-modal');
        const compare = element.querySelector('.ai-video-preview-compare');
        const firstStack = element.querySelector('.ai-video-media-stack.is-preview');
        const firstGrid = element.querySelector('.ai-video-media-stack.is-preview .ai-video-media-grid');
        const firstFrame = element.querySelector('.ai-video-media-stack.is-preview .ai-video-media-frame');
        const prompt = element.querySelector('.ai-video-preview-prompt textarea');
        const history = document.querySelector('.ai-video-floating-history');
        const bounds = (node) => {
          if (!(node instanceof HTMLElement)) return null;
          const next = node.getBoundingClientRect();
          return {
            width: Math.round(next.width),
            height: Math.round(next.height),
            right: Math.round(next.right),
            bottom: Math.round(next.bottom),
          };
        };
        return {
          width: Math.round(rect.width),
          minWidth: Math.min(2304, window.innerWidth - 300),
          maxWidth: Math.min(2304, window.innerWidth - 220),
          overlayZ: overlay instanceof HTMLElement ? Number(getComputedStyle(overlay).zIndex) : 0,
          historyZ: history instanceof HTMLElement ? Number(getComputedStyle(history).zIndex) : 0,
          compare: bounds(compare),
          firstStack: bounds(firstStack),
          firstGrid: bounds(firstGrid),
          firstFrame: bounds(firstFrame),
          prompt: bounds(prompt),
          openButtons: element.querySelectorAll('.ai-video-media-open').length,
          mediaCount: element.querySelectorAll('.ai-video-media-frame img, .ai-video-media-frame video').length,
        };
      });
      expect(videoPreviewDialogLayout.width, JSON.stringify(videoPreviewDialogLayout)).toBeGreaterThanOrEqual(videoPreviewDialogLayout.minWidth);
      expect(videoPreviewDialogLayout.width, JSON.stringify(videoPreviewDialogLayout)).toBeLessThanOrEqual(videoPreviewDialogLayout.maxWidth);
      expect(videoPreviewDialogLayout.compare.height, JSON.stringify(videoPreviewDialogLayout)).toBe(296);
      expect(videoPreviewDialogLayout.firstStack.height, JSON.stringify(videoPreviewDialogLayout)).toBe(296);
      expect(videoPreviewDialogLayout.firstGrid.height, JSON.stringify(videoPreviewDialogLayout)).toBe(267);
      expect(videoPreviewDialogLayout.firstFrame.height, JSON.stringify(videoPreviewDialogLayout)).toBe(220);
      expect(videoPreviewDialogLayout.prompt.height, JSON.stringify(videoPreviewDialogLayout)).toBeGreaterThanOrEqual(80);
      expect(videoPreviewDialogLayout.overlayZ, JSON.stringify(videoPreviewDialogLayout)).toBeGreaterThan(videoPreviewDialogLayout.historyZ);
      expect(videoPreviewDialogLayout.openButtons, JSON.stringify(videoPreviewDialogLayout)).toBe(videoPreviewDialogLayout.mediaCount);
      await page.locator('.ai-video-preview-card .ai-video-media-open').first().click();
      await expect(page.locator('.ai-video-media-preview-modal')).toBeVisible();
      await expectOverlayCoversSidebar(page, '.ai-video-media-preview-modal');
      await expectOverlayAboveFloatingControl(page, '.ai-video-media-preview-modal', '.ai-video-floating-history');
      await expect(page.locator('.ai-video-media-preview-modal img, .ai-video-media-preview-modal video')).toBeVisible();
      await page.locator('.ai-video-media-preview-close').click();
      await expect(page.locator('.ai-video-media-preview-modal')).toHaveCount(0);
      await page.locator('.ai-video-preview-head button[aria-label="关闭预览"]').click();
      await expect(page.locator('.ai-video-preview-modal')).toHaveCount(0);
      await page.locator('.ai-video-generate-button').click();
      await expect(page.locator('.ai-video-result-board')).toBeVisible();
      await expect(page.locator('.video-replica-workbench')).toHaveCount(0);
      await expect(page.locator('.ai-video-result-board')).toContainText(/无生成结果|正在生成中|视频生成/);
      await expect.poll(async () => page.evaluate(async () => {
        const settings = await window.contentStudio.getSettings();
        const logs = await window.contentStudio.listGenerationLogs(settings.workspacePath);
        const videoLog = logs.find((log) => log.kind === 'video');
        const input = videoLog?.input && typeof videoLog.input === 'object' ? videoLog.input : {};
        const output = videoLog?.output && typeof videoLog.output === 'object' ? videoLog.output : {};
        const outputRefs = Array.isArray(output.assetRefs) ? output.assetRefs : [];
        return {
          status: videoLog?.status,
          featureTitle: typeof input.featureTitle === 'string' ? input.featureTitle : '',
          selectedCaseTitle: typeof input.selectedCaseTitle === 'string' ? input.selectedCaseTitle : '',
          imageCount: Array.isArray(input.imageAssetRefs) ? input.imageAssetRefs.length : -1,
          videoCount: Array.isArray(input.videoAssetRefs) ? input.videoAssetRefs.length : -1,
          outputCount: outputRefs.length,
          hasTraceArtifact: outputRefs.some((ref) => /\.(json|md)$/i.test(ref)),
        };
      })).toEqual({
        status: 'blocked',
        featureTitle: '全能视频',
        selectedCaseTitle: '爆款复刻-拖把',
        imageCount: 2,
        videoCount: 1,
        outputCount: 2,
        hasTraceArtifact: true,
      });
      await expect(page.locator('.ai-video-result-asset.is-artifact')).toHaveCount(2);
      await expect(page.locator('.ai-video-floating-history')).toBeVisible();
      await page.locator('.ai-video-floating-history').click();
      await expect(page.locator('.ai-video-history-drawer')).toContainText('历史记录');
      await expect(page.locator('.ai-video-history-drawer')).toContainText('全部');
      await expect(page.locator('.ai-video-history-drawer')).toContainText('查询');
      await expect(page.locator('.ai-video-history-drawer')).toContainText('批量下载');
      await expect(page.locator('.ai-video-history-drawer')).toContainText('发送到素材库');
      await expect(page.locator('.ai-video-history-drawer')).toContainText('局部精修');
      await expect(page.locator('.ai-video-history-drawer')).toContainText('3 个输入素材');
      await expect(page.locator('.ai-video-history-operation-row button').filter({ hasText: '发送到素材库' })).toBeDisabled();
      await expect(page.locator('.ai-video-history-operation-row button').filter({ hasText: '局部精修' })).toBeDisabled();
      await expectRectNear(page.locator('.ai-video-history-drawer'), { width: 1102, height: 762 }, 5);
      await expectRectNear(page.locator('.ai-video-history-record-list'), { width: 108 }, 5);
      await expect(page.locator('.ai-video-history-record-thumb').first().locator('span').filter({ hasText: /\\d{2}:\\d{2}/ })).toHaveCount(0);
      const videoHistoryRecordCount = await page.locator('.ai-video-history-record-thumb').count();
      for (let index = 0; index < videoHistoryRecordCount; index += 1) {
        await page.locator('.ai-video-history-record-thumb').nth(index).click();
        if (await page.locator('.ai-video-history-asset-actions').count()) break;
      }
      await expect(page.locator('.ai-video-history-asset-actions').first()).toContainText('预览');
      await expect(page.locator('.ai-video-history-asset-actions').first()).toContainText('下载');
      await expect(page.locator('.ai-video-history-asset-actions a').first()).toHaveAttribute('download', /bugu-生成结果/);
      await page.locator('.ai-video-history-asset-actions button').first().click();
      await expect(page.locator('.ai-video-media-preview-modal')).toBeVisible();
      await expect(page.locator('.ai-video-media-preview-modal img, .ai-video-media-preview-modal video, .ai-video-media-preview-artifact')).toBeVisible();
      await expectOverlayCoversSidebar(page, '.ai-video-media-preview-modal');
      await expectOverlayAboveFloatingControl(page, '.ai-video-media-preview-modal', '.ai-video-floating-history');
      await page.locator('.ai-video-media-preview-close').click();
      await expect(page.locator('.ai-video-media-preview-modal')).toHaveCount(0);
      await expect(page.locator('.ai-video-history-drawer')).not.toContainText('生成爆款视频');
      await page.getByLabel('关闭历史记录').click();
      await clickNavItem(page, 'AI 生图');
      await clickNavItem(page, 'AI 视频');
      await page.locator('.ai-video-floating-history').click();
      await expect(page.locator('.ai-video-history-drawer')).toContainText('爆款复刻-拖把');
      await expect(page.locator('.ai-video-history-drawer')).toContainText('全能视频');
      await expect(page.locator('.ai-video-history-drawer')).toContainText('3 个输入素材');
      await expect(page.locator('.ai-video-history-drawer')).toContainText('队列文件');
    },
    { env: { CONTENT_STUDIO_OEM_SITE_CONFIG_FIXTURE_PATH: aiVideoFixturePath } },
  );
});

test('当前入口能落到真实工作流动作，已删除入口不会回流', async ({}, testInfo) => {
  test.setTimeout(120_000);

  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    const seedTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      await api.saveSettings({ workspacePath });
      const source = await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '便携条包产品资料',
        text: [
          '产品名称：便携营养条包',
          '卖点：早餐后和办公室抽屉随手取用',
          '规格：15g * 20 条',
          '适用场景：早餐后、办公室抽屉、通勤包',
          '禁用表达：不得承诺治疗、见效或替代专业建议',
        ].join('\n'),
        summary: '便携营养条包产品资料',
        tags: ['v2-current-nav', '产品资料'],
      });
      return { sourceId: source.id };
    }, workspaceDir);
    expect(seedTrace.sourceId).toBeTruthy();

    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待当前入口测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await expectDefaultNavGroupCollapse(page);
    await expandAllNavGroups(page);

    for (const label of [
      'agents',
      '图片生成',
      'AI 生图',
      '拆解素材',
      '绿幕文案图',
      '视频生成',
      'AI 视频',
      '视频 Prompt',
      '视频脚本',
      '成品视频导入',
      '混剪包导出',
      '成型知识库',
      '品牌 / 产品知识库',
      '素材库',
      'skills 管理',
    ]) {
      await expectNavLabelVisible(page, label);
    }

    for (const label of [
      '场景提示词',
      '合规检测',
      '图片精修',
      '内容制造',
      '内容知识地图',
      '审核任务',
      '输入源 / 文档转换',
      '场景库',
      'IP 知识库',
      '创意视频',
      '自定义视频',
      '批次工作台',
      '目标树',
      '作战编组',
      '执行队列',
      '行动记录',
      '文章生成',
      '标题生成',
      '脚本生成',
      'Prompt 工作台',
      '运行历史',
    ]) {
      await expectNavLabelAbsent(page, label);
    }

    await clickNavItem(page, 'agents');
    await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.agents-entry-board')).toContainText('文章生成');
    await expect(page.locator('.agents-entry-board')).toContainText('标题生成');
    await expect(page.locator('.agents-entry-board')).toContainText('脚本生成');

    await clickNavItem(page, '拆解素材');
    await expect(page.locator('.ai-breakdown-shell')).toBeVisible();
    await expectNotStaticV2Page(page);

    await clickNavItem(page, 'agents');
    await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
    const agentsIntent = '基于已解析产品资料，生成小红书种草图 Prompt，强调真实生活场景。';
    await page.locator('.agents-entry-composer textarea').fill(agentsIntent);
    await page.locator('.agents-entry-composer textarea').press('Enter');
    await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.agents-thread')).toContainText(agentsIntent, { timeout: 20_000 });
    await expect(page.locator('.agents-thread')).toContainText(/Prompt 草稿|交付草稿已更新|交付物线索/, { timeout: 20_000 });

    await clickNavItem(page, '视频 Prompt');
    await expect(page.locator('.video-prompt-workbench')).toBeVisible();
    await expectCommandCenter(page, '.video-prompt-workbench > .module-command-center', 'compact');
    await expect(page.locator('.video-prompt-workbench > .v2-feature-flow')).toHaveCount(0);
    await expect(page.locator('.video-prompt-workbench .agent-session-panel')).toBeVisible();
    const videoPromptAgentLayout = await page.evaluate(() => {
      const workbench = document.querySelector('.video-prompt-workbench');
      const panel = document.querySelector('.video-prompt-builder-panel > .agent-session-panel');
      const surface = document.querySelector('.stage-module-surface');
      const params = document.querySelector('.params-panel');
      if (!workbench || !panel || !surface || !params) return null;
      const workbenchRect = workbench.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const surfaceRect = surface.getBoundingClientRect();
      return {
        panelHeight: Math.round(panelRect.height),
        panelWidth: Math.round(panelRect.width),
        paramsDisplay: window.getComputedStyle(params).display,
        surfaceWidth: Math.round(surfaceRect.width),
        workbenchHeight: Math.round(workbenchRect.height),
      };
    });
    expect(videoPromptAgentLayout?.paramsDisplay, JSON.stringify(videoPromptAgentLayout)).toBe('none');
    expect(videoPromptAgentLayout?.panelWidth ?? 0, JSON.stringify(videoPromptAgentLayout)).toBeGreaterThanOrEqual((videoPromptAgentLayout?.surfaceWidth ?? 0) - 40);
    expect(videoPromptAgentLayout?.panelHeight ?? 0, JSON.stringify(videoPromptAgentLayout)).toBeGreaterThanOrEqual((videoPromptAgentLayout?.workbenchHeight ?? 0) * 0.58);
    await expectNotStaticV2Page(page);
    await page.locator('.video-prompt-scenes-panel .prompt-source-option').filter({ hasText: '便携条包产品资料' }).locator('input').check();
    await clickButton(page, '生成视频 Prompt 组');
    await expect(page.locator('.video-prompt-preview pre')).toContainText(/视频 Prompt|任务：/, { timeout: 20_000 });
    await expect(page.locator('.video-prompt-builder-panel button').filter({ hasText: '复制到第三方平台' })).toBeEnabled();

    await clickNavItem(page, '绿幕文案图');
    await expect(page.locator('.green-screen-workbench')).toBeVisible();
    await expectCommandCenter(page, '.green-screen-workbench > .module-command-center', 'flow');
    await expect(page.locator('.green-screen-workbench > .v2-feature-flow')).toHaveCount(0);
    await expectNotStaticV2Page(page);
    await clickButton(page, '生成绿幕文案图');
    await expect(page.locator('.overlay-card-tile').first()).toBeVisible({ timeout: 20_000 });

    await clickNavItem(page, '混剪包导出');
    await expect(page.locator('.mix-export-workbench')).toBeVisible();
    await expectCommandCenter(page, '.mix-export-workbench > .module-command-center', 'flow');
    await expect(page.locator('.mix-export-workbench > .v2-feature-flow')).toHaveCount(0);
    await expectNotStaticV2Page(page);
    const firstMixAsset = page.locator('.mix-asset-card').first();
    await expect(firstMixAsset).toBeVisible();
    await firstMixAsset.getByRole('button', { name: '通过', exact: true }).click();
    await expect(firstMixAsset).toContainText('已通过');
    await expect(page.locator('.mix-export-config-panel button').filter({ hasText: '导出混剪包' })).toBeEnabled();
    await clickButton(page, '导出混剪包');
    await expect(page.locator('.mix-package-card').first()).toContainText('短视频混剪素材包', { timeout: 20_000 });
    await page.locator('.mix-export-workbench .module-command-center button').filter({ hasText: '导入成品视频' }).click();
    await expect(page.locator('.video-import-workbench')).toBeVisible();
    await expectCommandCenter(page, '.video-import-workbench > .module-command-center', 'flow');
    await expect(page.locator('.video-import-workbench > .v2-feature-flow')).toHaveCount(0);
    await expectNotStaticV2Page(page);

    await clickNavItem(page, '素材库');
    await expect(page.locator('.asset-library-panel')).toBeVisible();
    await expectCommandCenter(page, '.asset-library-workbench > .module-command-center', 'managed');
    await expect(page.locator('.module-command-center .module-command-filters')).toBeVisible();
    await expect(page.locator('.asset-library-panel > .chip-row')).toHaveCount(0);
    const assetDensity = await page.evaluate(() => {
      const gallery = document.querySelector('.asset-gallery');
      if (!gallery) return { ok: false };
      const style = window.getComputedStyle(gallery);
      return {
        ok: true,
        columnGap: Number.parseFloat(style.columnGap),
        rowGap: Number.parseFloat(style.rowGap),
      };
    });
    expect(assetDensity.ok, JSON.stringify(assetDensity)).toBe(true);
    expect(assetDensity.columnGap, JSON.stringify(assetDensity)).toBeLessThanOrEqual(10);
    expect(assetDensity.rowGap, JSON.stringify(assetDensity)).toBeLessThanOrEqual(10);
    await expectNotStaticV2Page(page);

    await clickNavItem(page, '品牌 / 产品知识库');
    await expectCommandCenter(page, '.knowledge-brand-workbench > .module-command-center', 'compact');
    await expect(page.locator('.knowledge-brand-workbench > .agent-session-panel')).toBeVisible();
    await expect(page.locator('.knowledge-brand-workbench > .agent-session-panel .agent-session-footer textarea')).toBeVisible();
    await expect(page.locator('.knowledge-brand-workbench > .agent-session-panel .agent-session-footer')).toContainText('开始判断');
    await expect(page.locator('.knowledge-brand-workbench > .agent-session-panel .agent-session-footer')).toContainText('抽取品牌知识库');
    await expect(page.locator('.knowledge-brand-workbench > .user-journey-guide')).toHaveCount(0);
    await expect(page.locator('.knowledge-brand-workbench > .v2-feature-hero')).toHaveCount(0);

    await clickNavItem(page, '成型知识库');
    await expectCommandCenter(page, '.knowledge-workbench > .module-command-center', 'managed');
    await expect(page.locator('.module-command-center .knowledge-tab-bar')).toBeVisible();
    await expect(page.locator('.knowledge-workbench > .knowledge-tab-bar')).toHaveCount(0);
  });
});

test('agents 平台默认 Gemini 时不会把旧 Claude 参数传给 lime.agent', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const geminiModel = 'gemini-2.5-flash';
  const legacyClaudeModel = 'claude-sonnet-4-5';
  const bridge = await startFakePlatformRuntimeBridge({
    modelSettings: {
      version: 'e2e-platform-default-gemini',
      updatedAt: '2026-06-13T00:00:00.000Z',
      defaultAgentProviderId: 'platform-gemini',
      defaultTextModelId: geminiModel,
      providers: [{
        id: 'platform-legacy-anthropic',
        displayName: 'Platform Legacy Anthropic',
        protocol: 'anthropic-compatible',
        capabilityKinds: ['text'],
        enabled: true,
        apiKeyConfigured: true,
        authType: 'api-key',
        baseUrl: 'https://api.anthropic.example/v1',
        models: [legacyClaudeModel],
      }, {
        id: 'platform-gemini',
        displayName: 'Platform Gemini',
        protocol: 'gemini-native',
        capabilityKinds: ['text'],
        enabled: true,
        apiKeyConfigured: true,
        authType: 'api-key',
        baseUrl: 'https://generativelanguage.googleapis.com',
        models: [geminiModel],
      }],
    },
  });
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath }) => {
        await window.contentStudio.saveSettings({ workspacePath });
      }, { workspacePath: workspaceDir });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 agents 平台 Gemini 模型回归测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'agents');
      await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-entry .lime-runtime-model-trigger')).toContainText(geminiModel);
      await expect(page.locator('.agents-entry .lime-runtime-model-trigger')).not.toContainText(legacyClaudeModel);

      const userIntent = 'E2E agents 平台默认模型回归：基于产品图生成真实生活场景图片 Prompt。';
      await page.locator('.agents-entry-composer textarea').fill(userIntent);
      await page.locator('.agents-entry-composer textarea').press('Enter');
      await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-thread')).toContainText(userIntent, { timeout: 20_000 });

      await expect.poll(
        async () => {
          const request = bridge.requests.find((item) =>
            item.body.capability === 'lime.agent' && item.body.operation === 'agentSession/turn/start'
          );
          return request?.body.input?.runtimeOptions?.modelId ?? '';
        },
        { message: '等待 lime.agent 使用平台默认 Gemini 模型', timeout: 20_000 },
      ).toBe(geminiModel);

      const agentRequest = bridge.requests.find((item) =>
        item.body.capability === 'lime.agent' && item.body.operation === 'agentSession/turn/start'
      );
      expect(agentRequest, JSON.stringify(bridge.requests)).toBeTruthy();
      expect(agentRequest.body.input.runtimeOptions.providerPreference).toBe('platform-gemini');
      expect(agentRequest.body.input.runtimeOptions.modelPreference).toBe(geminiModel);
      expect(agentRequest.body.input.modelPolicy.preferredModelId).toBe(geminiModel);
      expect(JSON.stringify(agentRequest.body)).not.toContain(legacyClaudeModel);
      expect(JSON.stringify(agentRequest.body)).not.toMatch(/apiKey|api_key|token|secret|password|credential|authorization|cookie/i);

      const persistedTrace = await page.evaluate(async ({ workspacePath, intent }) => {
        const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
        const session = sessions.find((item) => item.userIntent === intent);
        return {
          found: Boolean(session),
          model: session?.model ?? '',
          serialized: JSON.stringify(session ?? {}),
        };
      }, { workspacePath: workspaceDir, intent: userIntent });
      expect(persistedTrace.found, JSON.stringify(persistedTrace)).toBe(true);
      expect(persistedTrace.model, JSON.stringify(persistedTrace)).toContain(geminiModel);
      expect(persistedTrace.model, JSON.stringify(persistedTrace)).not.toContain(legacyClaudeModel);
      expect(persistedTrace.serialized).not.toMatch(/apiKey|api_key|token|secret|password|credential|authorization|cookie/i);
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
  }
});

test('agents 平台模型未授权时不显示 Gemini 且不调用 lime.agent', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const geminiModel = 'gemini-2.5-flash';
  const legacyClaudeModel = 'claude-sonnet-4-5';
  const bridge = await startFakePlatformRuntimeBridge({
    modelSettings: {
      version: 'e2e-platform-unauthorized-models',
      updatedAt: '2026-06-13T00:00:00.000Z',
      defaultAgentProviderId: 'platform-gemini',
      defaultTextModelId: geminiModel,
      providers: [{
        id: 'platform-openai',
        displayName: 'Platform OpenAI',
        protocol: 'openai-compatible',
        capabilityKinds: ['text'],
        enabled: true,
        apiKeyConfigured: false,
        authType: 'api-key',
        baseUrl: 'https://api.openai.example/v1',
        models: [legacyClaudeModel],
      }, {
        id: 'platform-gemini',
        displayName: 'Platform Gemini',
        protocol: 'gemini-native',
        capabilityKinds: ['text'],
        enabled: true,
        apiKeyConfigured: false,
        authType: 'api-key',
        baseUrl: 'https://generativelanguage.googleapis.com',
        models: [geminiModel],
      }],
    },
  });
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath }) => {
        await window.contentStudio.saveSettings({ workspacePath });
      }, { workspacePath: workspaceDir });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 agents 未授权模型测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'agents');
      await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-entry .lime-runtime-model-trigger')).not.toContainText(geminiModel);
      await expect(page.locator('.agents-entry .lime-runtime-model-trigger')).not.toContainText(legacyClaudeModel);
      await page.locator('.agents-entry .lime-runtime-model-trigger').click();
      await expect(page.locator('.agents-entry .lime-runtime-model-popover')).toContainText(/未配置可用模型|未连接 Lime Desktop Platform/);
      await page.locator('.agents-entry .lime-runtime-model-trigger').click();

      const userIntent = 'E2E agents 未授权模型回归：不要调用平台 Agent。';
      await page.locator('.agents-entry-composer textarea').fill(userIntent);
      await page.locator('.agents-entry-composer textarea').press('Enter');
      await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-thread')).toContainText('平台文字模型未配置或未授权', { timeout: 20_000 });
      expect(bridge.requests.some((item) => item.body.capability === 'lime.agent'), JSON.stringify(bridge.requests)).toBe(false);
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
  }
});

test('agents 入口页启动后会绑定真实图片输入源并进入线程', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const bridge = await startFakePlatformRuntimeBridge();
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir, e2eProductAssetPath }) => {
      await page.evaluate(async ({ workspacePath }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
      }, { workspacePath: workspaceDir });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 agents 测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'agents');
      await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-workbench')).toHaveCount(0);
      await expect(page.locator('.params-panel')).toHaveCount(0);
      await expect(page.locator('[aria-label="语音输入"]')).toHaveCount(0);
      await expect(page.locator('.agents-entry')).toContainText('今天要完成什么内容任务？');
      await expect(page.locator('.agents-entry-composer textarea')).toHaveAttribute('placeholder', '说明要检查的产品、平台、资料缺口和交付物');
      await expectAgentsProductImageCount(page, 0);
      await expect(page.locator('.agents-entry')).toContainText('完全访问');
      await expect(page.locator('.agents-entry .lime-runtime-model-trigger')).toContainText('test-text-model');
      await expect(page.locator('.agents-entry')).not.toContainText('5.5 超高');
      await expect(page.locator('.agents-entry .agent-turn')).toHaveCount(0);
      await expect(page.locator('.agents-entry')).not.toContainText('Skills');
      await expect(page.locator('.agents-entry')).not.toContainText('skill');
      await expect(page.locator('.agents-entry')).not.toContainText('图片生成模型');
      await expect(page.locator('.agents-entry')).not.toContainText(/gemini|根据已选产品图和参考图/i);
      await expect(page.locator('.agents-entry .lime-runtime-model-popover')).toHaveCount(0);
      await page.setViewportSize({ width: 1024, height: 768 });
      const compactEntryLayout = await page.evaluate(() => {
        const entry = document.querySelector('.agents-entry')?.getBoundingClientRect();
        const composer = document.querySelector('.agents-entry-composer')?.getBoundingClientRect();
        const board = document.querySelector('.agents-entry .agents-entry-board')?.getBoundingClientRect();
        const controls = document.querySelector('.agents-entry .agents-composer-controls')?.getBoundingClientRect();
        return {
          entryOverflowX: Boolean(entry && document.querySelector('.agents-entry')?.scrollWidth > entry.width + 1),
          composerFits: Boolean(entry && composer && composer.left >= entry.left - 1 && composer.right <= entry.right + 1),
          boardFits: Boolean(entry && board && board.left >= entry.left - 1 && board.right <= entry.right + 1),
          controlsFit: Boolean(entry && controls && controls.left >= entry.left - 1 && controls.right <= entry.right + 1),
        };
      });
      expect(compactEntryLayout, JSON.stringify(compactEntryLayout)).toMatchObject({
        entryOverflowX: false,
        composerFits: true,
        boardFits: true,
        controlsFit: true,
      });
      await page.setViewportSize({ width: 1280, height: 720 });
      const shellLayout = await page.evaluate(() => {
        const shell = document.querySelector('.app-shell');
        const style = shell ? getComputedStyle(shell) : null;
        return {
          dataParams: shell?.getAttribute('data-params'),
          columnCount: style?.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length ?? 0,
        };
      });
      expect(shellLayout, JSON.stringify(shellLayout)).toMatchObject({
        dataParams: 'hidden',
        columnCount: 2,
      });
      const entryLayout = await page.evaluate(() => {
        const composer = document.querySelector('.agents-entry-composer')?.getBoundingClientRect();
        const entry = document.querySelector('.agents-entry')?.getBoundingClientRect();
        return {
          hasComposer: Boolean(composer),
          hasStaticContextCards: Boolean(document.querySelector('.agents-entry-context')),
          composerInsideEntry: Boolean(composer && entry && composer.top >= entry.top && composer.bottom <= entry.bottom),
          entryOverflowX: Boolean(entry && document.querySelector('.agents-entry')?.scrollWidth > entry.width + 1),
        };
      });
      expect(entryLayout, JSON.stringify(entryLayout)).toMatchObject({
        hasComposer: true,
        hasStaticContextCards: false,
        composerInsideEntry: true,
        entryOverflowX: false,
      });

      const addButton = page.locator('.agents-entry-composer button[aria-label="添加输入"]').first();
      await addButton.click();
      await expect(page.locator('.agents-entry .agents-add-menu')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-entry .agents-add-menu')).toContainText('添加照片和文件');
      await expect(page.locator('.agents-entry .agents-add-menu')).toContainText('添加参考图');
      await expect(page.locator('.agents-entry .agents-add-menu')).toContainText('skills 管理');
      await expect(page.locator('.agents-entry .agents-add-menu')).not.toContainText('计划模式');
      await expect(page.locator('.agents-entry .agents-add-menu')).not.toContainText('追求目标');
      const addMenuLayout = await page.evaluate(() => {
        const menu = document.querySelector('.agents-entry .agents-add-menu')?.getBoundingClientRect();
        const composer = document.querySelector('.agents-entry-composer')?.getBoundingClientRect();
        const entry = document.querySelector('.agents-entry')?.getBoundingClientRect();
        return {
          visible: Boolean(menu),
          top: Math.round(menu?.top ?? -1),
          bottom: Math.round(menu?.bottom ?? -1),
          withinViewport: Boolean(menu && menu.top >= 0 && menu.bottom <= window.innerHeight),
          noHorizontalOverflow: Boolean(menu && entry && menu.left >= entry.left - 1 && menu.right <= entry.right + 1),
          anchoredToComposer: Boolean(menu && composer && menu.top >= composer.top - 1 && menu.top <= composer.bottom + 16),
        };
      });
      expect(addMenuLayout.visible, JSON.stringify(addMenuLayout)).toBe(true);
      expect(addMenuLayout.withinViewport, JSON.stringify(addMenuLayout)).toBe(true);
      expect(addMenuLayout.noHorizontalOverflow, JSON.stringify(addMenuLayout)).toBe(true);
      expect(addMenuLayout.anchoredToComposer, JSON.stringify(addMenuLayout)).toBe(true);
      await addButton.click();

      await page.locator('.agents-entry-composer button[aria-label="权限设置"]').click();
      await expect(page.locator('.agents-entry .agents-access-menu')).toContainText('请求批准');
      await expect(page.locator('.agents-entry .agents-access-menu')).toContainText('替我审批');
      await expect(page.locator('.agents-entry .agents-access-menu')).toContainText('完全访问权限');
      await page.locator('.agents-entry-composer button[aria-label="权限设置"]').click();

      await page.locator('.agents-entry .lime-runtime-model-trigger').click();
      await expect(page.locator('.agents-entry .lime-runtime-model-popover')).toContainText('模型设置');
      await expect(page.locator('.agents-entry .lime-runtime-model-popover')).toContainText('test-text-model');
      await expect(page.locator('.agents-entry .lime-runtime-model-popover')).toContainText('other-provider-text-model');
      const platformModelMenuTheme = await page.evaluate(() => {
        const resolveColor = (value, scope = document.body) => {
          const probe = document.createElement('span');
          probe.style.color = value;
          scope.appendChild(probe);
          const resolved = window.getComputedStyle(probe).color;
          probe.remove();
          return resolved;
        };
        const bodyStyle = window.getComputedStyle(document.body);
        const menu = document.querySelector('.agents-entry .lime-runtime-model-menu');
        const trigger = document.querySelector('.agents-entry .lime-runtime-model-trigger');
        const activeModel = document.querySelector('.agents-entry .lime-runtime-model-list button.active');
        const triggerStyle = trigger ? window.getComputedStyle(trigger) : null;
        const activeStyle = activeModel ? window.getComputedStyle(activeModel) : null;
        return {
          bodyFont: bodyStyle.fontFamily,
          triggerFont: triggerStyle?.fontFamily ?? '',
          bodyColor: bodyStyle.color,
          triggerColor: triggerStyle?.color ?? '',
          activeColor: activeStyle?.color ?? '',
          menuAccent: menu ? resolveColor('var(--lime-runtime-model-accent)', menu) : '',
          oldPlatformText: resolveColor('#31423a'),
        };
      });
      expect(platformModelMenuTheme.triggerFont).toBe(platformModelMenuTheme.bodyFont);
      expect(platformModelMenuTheme.triggerColor).toBe(platformModelMenuTheme.bodyColor);
      expect(platformModelMenuTheme.activeColor).toBe(platformModelMenuTheme.menuAccent);
      expect(platformModelMenuTheme.triggerColor).not.toBe(platformModelMenuTheme.oldPlatformText);
      await page.locator('.agents-entry .lime-runtime-model-trigger').click();

      await addAgentsProductImage(page);
      await expectAgentsProductImageCount(page, 1);

      const firstPromptLine = 'E2E agents 入口协作：基于产品图生成真实生活场景图片 Prompt。';
      const secondPromptLine = '补充要求：真实生活场景，避免棚拍感。';
      const promptText = `${firstPromptLine}\n${secondPromptLine}`;
      const entryTextarea = page.locator('.agents-entry-composer textarea');
      await expect(entryTextarea).toHaveValue('');
      const videoPromptTask = page.locator('.agents-entry-board button').filter({ hasText: '视频 Prompt' }).first();
      await videoPromptTask.click();
      await expect(videoPromptTask).toHaveClass(/active/);
      await expect(entryTextarea).toHaveValue('');
      await entryTextarea.fill(firstPromptLine);
      await entryTextarea.press('Shift+Enter');
      await entryTextarea.pressSequentially(secondPromptLine);
      await expect(entryTextarea).toHaveValue(promptText);
      await expect(page.locator('.agents-entry')).toBeVisible();
      await entryTextarea.press('Enter');

      await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-entry')).toHaveCount(0);
      await expect(page.locator('.agents-side-panel')).toHaveCount(0);
      await expect(page.locator('.params-panel')).toHaveCount(0);
      const threadShellLayout = await page.evaluate(() => {
        const shell = document.querySelector('.app-shell');
        const style = shell ? getComputedStyle(shell) : null;
        const workbench = document.querySelector('.agents-workbench');
        const stage = document.querySelector('.stage');
        const shellRect = shell?.getBoundingClientRect();
        const workbenchRect = workbench?.getBoundingClientRect();
        const stageRect = stage?.getBoundingClientRect();
        return {
          dataParams: shell?.getAttribute('data-params'),
          shellColumnCount: style?.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length ?? 0,
          fillsStageRight: Boolean(workbenchRect && stageRect && Math.abs(workbenchRect.right - stageRect.right) < 2),
          noDetachedRightColumn: Boolean(shellRect && stageRect && shellRect.right - stageRect.right < 64),
        };
      });
      expect(threadShellLayout, JSON.stringify(threadShellLayout)).toMatchObject({
        dataParams: 'hidden',
        shellColumnCount: 2,
        fillsStageRight: true,
        noDetachedRightColumn: true,
      });
      await expect(page.locator('.agents-workbench')).not.toContainText('后端接口');
      await expect(page.locator('.agents-workbench')).not.toContainText('等待启动协作');
      await expect(page.locator('.agents-workbench')).not.toContainText('进行中的目标');
      await expectAgentsUiHidesInternalTerms(page);
      if (await page.locator('.agents-draft-inline').count()) {
        await expectAgentsUiHidesInternalTerms(page, '.agents-draft-inline');
      }
      await expect(page.locator('.nav-stack')).toContainText('图生视频 Prompt 协作');
      await expect(page.locator('.agents-thread')).toContainText(promptText);
      const threadMessageLayout = await page.evaluate(() => {
        const userTurn = document.querySelector('.agents-thread-scroll .agent-turn.user')?.getBoundingClientRect();
        const userBody = document.querySelector('.agents-thread-scroll .agent-turn.user .agent-turn-body')?.getBoundingClientRect();
        const userText = document.querySelector('.agents-thread-scroll .agent-turn.user p')?.getBoundingClientRect();
        return {
          turnWidth: Math.round(userTurn?.width ?? 0),
          bodyWidth: Math.round(userBody?.width ?? 0),
          textWidth: Math.round(userText?.width ?? 0),
        };
      });
      expect(threadMessageLayout.turnWidth, JSON.stringify(threadMessageLayout)).toBeGreaterThan(360);
      expect(threadMessageLayout.bodyWidth, JSON.stringify(threadMessageLayout)).toBeGreaterThan(320);
      expect(threadMessageLayout.textWidth, JSON.stringify(threadMessageLayout)).toBeGreaterThan(300);
      await expect(page.locator('.agents-thread')).toContainText(/Prompt 草稿|交付草稿已更新|交付物线索/, { timeout: 20_000 });
      await expect(page.locator('.agents-dialog-composer textarea')).toHaveValue('');

      await expect.poll(async () => page.evaluate(async ({ workspacePath, assetPath, userIntent }) => {
        const api = window.contentStudio;
        const sessions = await api.listAgentPromptSessions(workspacePath);
        const sources = await api.listInputSources(workspacePath);
        const session = sessions.find((item) => item.userIntent === userIntent);
        const productSource = sources.find((source) => source.sourcePath === assetPath && source.tags.includes('产品图'));
        return {
          sessionFound: Boolean(session),
          sessionStatus: session?.status,
          sessionInputSourceIds: session?.inputSourceIds ?? [],
          snapshotCount: session?.sourceSnapshots.length ?? 0,
          productSourceId: productSource?.id ?? '',
          productSourceKind: productSource?.kind,
          productSourceStatus: productSource?.status,
          linked: Boolean(productSource && session?.inputSourceIds.includes(productSource.id)),
          snapshotLinked: Boolean(productSource && session?.sourceSnapshots.some((snapshot) => snapshot.sourceId === productSource.id && snapshot.kind === 'image')),
          hasLocalAssetId: Boolean(session?.inputSourceIds.some((id) => id.startsWith('local-asset:'))),
          messageHasSnapshot: Boolean(session?.messages.some((message) => message.content.includes('输入源快照：') && message.content.includes('图片 / 待补齐'))),
        };
      }, { workspacePath: workspaceDir, assetPath: e2eProductAssetPath, userIntent: promptText }), {
        message: '等待 agents session 写入真实图片输入源和快照',
        timeout: 30_000,
      }).toMatchObject({
        sessionFound: true,
        sessionInputSourceIds: [expect.any(String)],
        snapshotCount: 1,
        productSourceKind: 'image',
        productSourceStatus: 'blocked',
        linked: true,
        snapshotLinked: true,
        hasLocalAssetId: false,
        messageHasSnapshot: true,
      });

      const trace = await page.evaluate(async ({ workspacePath, assetPath, userIntent }) => {
        const api = window.contentStudio;
        const sessions = await api.listAgentPromptSessions(workspacePath);
        const sources = await api.listInputSources(workspacePath);
        const session = sessions.find((item) => item.userIntent === userIntent);
        const productSource = sources.find((source) => source.sourcePath === assetPath && source.tags.includes('产品图'));
        return {
          sessionFound: Boolean(session),
          sessionStatus: session?.status,
          sessionInputSourceIds: session?.inputSourceIds ?? [],
          snapshotCount: session?.sourceSnapshots.length ?? 0,
          productSourceId: productSource?.id ?? '',
          productSourceKind: productSource?.kind,
          productSourceStatus: productSource?.status,
          linked: Boolean(productSource && session?.inputSourceIds.includes(productSource.id)),
          snapshotLinked: Boolean(productSource && session?.sourceSnapshots.some((snapshot) => snapshot.sourceId === productSource.id && snapshot.kind === 'image')),
          hasLocalAssetId: Boolean(session?.inputSourceIds.some((id) => id.startsWith('local-asset:'))),
          messageHasSnapshot: Boolean(session?.messages.some((message) => message.content.includes('输入源快照：') && message.content.includes('图片 / 待补齐'))),
        };
      }, { workspacePath: workspaceDir, assetPath: e2eProductAssetPath, userIntent: promptText });
      expect(trace.sessionFound, JSON.stringify(trace)).toBe(true);
      expect(trace.sessionStatus, JSON.stringify(trace)).toMatch(/draft-created|blocked|waiting-user|active/);
      expect(trace.sessionInputSourceIds.length, JSON.stringify(trace)).toBe(1);
      expect(trace.snapshotCount, JSON.stringify(trace)).toBe(1);
      expect(trace.productSourceId, JSON.stringify(trace)).toBeTruthy();
      expect(trace.productSourceKind, JSON.stringify(trace)).toBe('image');
      expect(trace.productSourceStatus, JSON.stringify(trace)).toBe('blocked');
      expect(trace.linked, JSON.stringify(trace)).toBe(true);
      expect(trace.snapshotLinked, JSON.stringify(trace)).toBe(true);
      expect(trace.hasLocalAssetId, JSON.stringify(trace)).toBe(false);
      expect(trace.messageHasSnapshot, JSON.stringify(trace)).toBe(true);

      const agentRequest = bridge.requests.find((request) => request.body.capability === 'lime.agent');
      expect(agentRequest, JSON.stringify(bridge.requests)).toBeTruthy();
      const agentPayload = JSON.stringify(agentRequest.body);
      expect(agentRequest.body.operation).toBe('agentSession/turn/start');
      expect(agentPayload).toContain('"providerPreference":"platform-openai"');
      expect(agentPayload).toContain('"modelId":"test-text-model"');
      expect(agentPayload).not.toMatch(/apiKey|api_key|token|secret|password|credential|authorization|cookie/i);
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
  }
});

test('agents 寒暄对话保持普通回复且不显示 Prompt 交付面板', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const bridge = await startFakePlatformRuntimeBridge({
    agentDraftContent: '你好！我可以帮你处理内容任务。请告诉我你要处理的对象和目标。',
    agentMessageTitle: 'AI Agent',
    omitAgentArtifact: true,
  });
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath }) => {
        await window.contentStudio.saveSettings({ workspacePath });
      }, { workspacePath: workspaceDir });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 agents 寒暄测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'agents');
      await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
      const entryTextarea = page.locator('.agents-entry-composer textarea');
      await entryTextarea.fill('你好');
      await entryTextarea.press('Enter');

      await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-thread')).toContainText('你好！我可以帮你处理内容任务', { timeout: 20_000 });
      await expect(page.locator('.agents-thread-summary')).toHaveCount(0);
      await expect(page.locator('.agents-artifact-panel')).toHaveCount(0);
      await expect(page.locator('.agents-thread-scroll .agent-runtime-event')).toHaveCount(0);
      await expect(page.locator('.agents-runtime-inline')).toHaveCount(0);
      const threadLayout = await page.evaluate(() => {
        const thread = document.querySelector('.agents-thread');
        const main = document.querySelector('.agents-thread-main');
        const runtime = document.querySelector('.agents-runtime-panel');
        const composer = document.querySelector('.agents-dialog-composer .agents-thread-composer-frame');
        const threadStyle = thread ? getComputedStyle(thread) : null;
        const runtimeStyle = runtime ? getComputedStyle(runtime) : null;
        const threadRect = thread?.getBoundingClientRect();
        const mainRect = main?.getBoundingClientRect();
        const composerRect = composer?.getBoundingClientRect();
        return {
          gridColumns: threadStyle?.gridTemplateColumns ?? '',
          runtimeHidden: !runtime || runtimeStyle?.display === 'none',
          mainCentered: Boolean(threadRect && mainRect && mainRect.left > threadRect.left && mainRect.right < threadRect.right),
          composerInside: Boolean(threadRect && composerRect && composerRect.left >= threadRect.left && composerRect.right <= threadRect.right),
          overflowX: Boolean(thread && thread.scrollWidth > thread.clientWidth + 1),
        };
      });
      expect(threadLayout.runtimeHidden, JSON.stringify(threadLayout)).toBe(true);
      expect(threadLayout.gridColumns.trim().split(/\s+/).filter(Boolean).length, JSON.stringify(threadLayout)).toBe(1);
      expect(threadLayout.mainCentered, JSON.stringify(threadLayout)).toBe(true);
      expect(threadLayout.composerInside, JSON.stringify(threadLayout)).toBe(true);
      expect(threadLayout.overflowX, JSON.stringify(threadLayout)).toBe(false);

      const threadTextarea = page.locator('.agents-thread-composer-frame textarea');
      await threadTextarea.fill('你好');
      await threadTextarea.press('Enter');
      await expect(page.locator('.agents-thread')).toContainText('你好！我可以帮你处理内容任务', { timeout: 20_000 });
      await expect(page.locator('.agents-thread')).not.toContainText('AI Agent 对话未启动');
      await expect(page.locator('.agents-thread')).not.toContainText('不能用本地草稿继续');

      const readTrace = () => page.evaluate(async ({ workspacePath }) => {
        const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
        const session = sessions.find((item) => item.userIntent === '你好');
        return {
          found: Boolean(session),
          title: session?.title,
          purpose: session?.purpose,
          status: session?.status,
          promptDraftIds: session?.promptDraftIds ?? [],
          content: session?.messages.map((message) => message.content).join('\n') ?? '',
        };
      }, { workspacePath: workspaceDir });
      await expect.poll(readTrace, {
        message: '等待 agents 寒暄第二轮完成并回到 waiting-user',
        timeout: 20_000,
      }).toMatchObject({
        found: true,
        title: '内容协作',
        purpose: 'content-task',
        status: 'waiting-user',
        promptDraftIds: [],
      });
      const trace = await readTrace();
      expect(trace.content, JSON.stringify(trace)).not.toContain('AI Agent 对话未启动');
      expect(trace.content, JSON.stringify(trace)).not.toContain('不能用本地草稿继续');
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
  }
});

test('agents 今日新闻请求会要求平台 Web Search 工具', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const bridge = await startFakePlatformRuntimeBridge({
    agentDraftContent: '我会先联网检索今天德国相关新闻，再按要点、背景和影响给出分析。',
    agentMessageTitle: 'AI Agent',
    omitAgentArtifact: true,
  });
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath }) => {
        await window.contentStudio.saveSettings({ workspacePath });
      }, { workspacePath: workspaceDir });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 agents 今日新闻测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'agents');
      await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
      await page.locator('.agents-entry-composer textarea').fill('你帮我分析一下今天的德国新闻');
      await page.locator('.agents-entry-composer textarea').press('Enter');
      await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-thread')).toContainText('联网检索今天德国相关新闻', { timeout: 20_000 });

      await expect.poll(
        async () => {
          const request = bridge.requests.find((item) =>
            item.body.capability === 'lime.agent' && item.body.operation === 'agentSession/turn/start'
          );
          return request?.body.input?.runtimeOptions?.hostOptions?.asterChatRequest?.turn_config?.search_mode ?? '';
        },
        { message: '等待 agents 今日新闻请求带上 required web search', timeout: 20_000 },
      ).toBe('required');

      const agentRequest = bridge.requests.find((item) =>
        item.body.capability === 'lime.agent' && item.body.operation === 'agentSession/turn/start'
      );
      expect(agentRequest, JSON.stringify(bridge.requests)).toBeTruthy();
      const asterRequest = agentRequest.body.input.runtimeOptions.hostOptions.asterChatRequest;
      expect(asterRequest.web_search).toBe(true);
      expect(asterRequest.search_mode).toBe('required');
      expect(asterRequest.turn_config.web_search).toBe(true);
      expect(asterRequest.turn_config.search_mode).toBe('required');
      expect(JSON.stringify(agentRequest.body)).not.toMatch(/apiKey|api_key|token|secret|password|credential|authorization|cookie/i);
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
  }
});

test('agents 默认不自动打开历史会话或显示模型选择', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const bridge = await startFakePlatformRuntimeBridge({
    agentDraftContent: [
      '# 历史协作草稿',
      '',
      '这是一条不应该自动出现在入口页的历史会话内容。',
    ].join('\n'),
  });
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      const historicalIntent = 'E2E 历史 agents 会话：根据已选产品图和参考图生成旧草稿。';
      await page.evaluate(async ({ workspacePath, intent }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.startAgentPromptSession({
          workspacePath,
          title: '历史 agents 会话',
          purpose: 'image',
          userIntent: intent,
          inputSourceIds: [],
          selectedSkillSlugs: [],
          textModel: 'test-text-model',
        });
      }, { workspacePath: workspaceDir, intent: historicalIntent });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 agents 历史会话隔离测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'agents');
      await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-workbench')).toHaveCount(0);
      await expect(page.locator('.agents-entry-composer textarea')).toHaveValue('');
      await expect(page.locator('.agents-entry')).not.toContainText(historicalIntent);
      await expect(page.locator('.agents-entry')).not.toContainText('历史协作草稿');
      await expect(page.locator('.agents-entry')).not.toContainText('图片生成模型');
      await expect(page.locator('.agents-entry')).not.toContainText(/gemini|根据已选产品图和参考图/i);
      await expect(page.locator('.agents-entry .lime-runtime-model-trigger')).toContainText('test-text-model');
      await expect(page.locator('.agents-entry .lime-runtime-model-popover')).toHaveCount(0);

      await page.locator('.agents-entry-sessions button').filter({ hasText: '历史 agents 会话' }).first().click();
      await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-thread')).toContainText(historicalIntent, { timeout: 20_000 });
      await expect(page.locator('.agents-thread')).toContainText(/历史协作草稿|交付草稿已更新|交付物线索/, { timeout: 20_000 });
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
  }
});

test('agents 文案能力能发起文章、标题和脚本协作会话', async ({}, testInfo) => {
  test.setTimeout(120_000);

  const bridge = await startFakePlatformRuntimeBridge({
    agentDraftContent: [
      '# 文案协作草稿',
      '',
      '已根据当前文案任务生成可编辑草稿，并保留来源与交付提醒。',
      '',
      '## 文案 Prompt',
      '',
      '### 目标',
      '生成可直接进入内容工厂下游的文案交付物。',
      '',
      '负面约束：不编造功效、不混入未选择场景卡。',
    ].join('\n'),
    agentArtifactTitle: 'E2E 文案协作交付物',
  });
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath }) => {
        await window.contentStudio.saveSettings({ workspacePath });
      }, { workspacePath: workspaceDir });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 agents 文案能力测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'agents');
      await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
      await expectNavLabelAbsent(page, '文章生成');
      await expectNavLabelAbsent(page, '标题生成');
      await expectNavLabelAbsent(page, '脚本生成');

      const tasks = [
        {
          label: '文章生成',
          title: '文章生成协作',
          intent: 'E2E agents 文章生成：基于产品资料写一篇公众号正文。',
          expectedSkills: ['copywriting-master', 'article-typesetting-master'],
        },
        {
          label: '标题生成',
          title: '标题矩阵协作',
          intent: 'E2E agents 标题生成：为早餐后便携条包场景生成小红书标题矩阵。',
          expectedSkills: ['copywriting-master', 'moments-copywriter'],
        },
        {
          label: '脚本生成',
          title: '脚本生成协作',
          intent: 'E2E agents 脚本生成：生成 30 秒口播脚本和分镜结构。',
          expectedSkills: ['copywriting-master', 'moments-copywriter', 'ip-knowledge-base-builder'],
        },
      ];

      for (const task of tasks) {
        await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
        const taskCard = page.locator('.agents-entry-board button').filter({ hasText: task.label }).first();
        await expect(taskCard).toBeVisible({ timeout: 20_000 });
        await taskCard.click();
        await expect(taskCard).toHaveClass(/active/);

        const textarea = page.locator('.agents-entry-composer textarea');
        await textarea.fill(task.intent);
        await textarea.press('Enter');
        await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
        await expect(page.locator('.nav-stack')).toContainText(task.title, { timeout: 20_000 });
        await expect(page.locator('.agents-thread')).toContainText(task.intent, { timeout: 20_000 });
        await expect(page.locator('.agents-thread')).toContainText(/文案协作草稿|交付草稿已更新|交付物线索/, { timeout: 20_000 });

        const trace = await page.evaluate(async ({ workspacePath, intent, title }) => {
          const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
          const session = sessions.find((item) => item.userIntent === intent && item.title === title);
          return {
            found: Boolean(session),
            title: session?.title,
            purpose: session?.purpose,
            status: session?.status,
            selectedSkillSlugs: session?.selectedSkillSlugs ?? [],
            promptDraftIds: session?.promptDraftIds ?? [],
          };
        }, { workspacePath: workspaceDir, intent: task.intent, title: task.title });
        expect(trace.found, JSON.stringify(trace)).toBe(true);
        expect(trace.purpose, JSON.stringify(trace)).toBe('article');
        expect(trace.status, JSON.stringify(trace)).toMatch(/draft-created|waiting-user|active/);
        expect(trace.promptDraftIds.length, JSON.stringify(trace)).toBeGreaterThanOrEqual(1);
        for (const slug of task.expectedSkills) {
          expect(trace.selectedSkillSlugs, JSON.stringify(trace)).toContain(slug);
        }

        await clickNavItem(page, 'agents');
      }

      const agentRequests = bridge.requests.filter((request) =>
        request.body.capability === 'lime.agent' && request.body.operation === 'agentSession/turn/start',
      );
      expect(agentRequests.length, JSON.stringify(bridge.requests)).toBeGreaterThanOrEqual(3);
      for (const task of tasks) {
        const matchedRequest = agentRequests.find((request) => JSON.stringify(request.body).includes(task.intent));
        expect(matchedRequest, `缺少 ${task.label} 的 agents 请求`).toBeTruthy();
        const payload = JSON.stringify(matchedRequest.body);
        for (const slug of task.expectedSkills) {
          expect(payload).toContain(slug);
        }
        expect(payload).not.toMatch(/apiKey|api_key|token|secret|password|credential|authorization|cookie/i);
      }
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
  }
});

test('agents 会阻断 Lime 回显内部 Prompt 片段且不展示内部事实', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const internalEchoDraft = [
    '# 真实生活场景图片 Prompt',
    '',
    '目标：基于产品图生成自然生活化的图片候选。',
    'Lime App Server Provider Store runtime bridge token API Key secret artifact session',
    '',
    '本地输入源：',
    '产品图 / 待补齐',
    '',
    '输出要求：',
    '- 直接输出完整 Markdown',
  ].join('\n');
  const bridge = await startFakePlatformRuntimeBridge({
    agentDraftContent: internalEchoDraft,
    agentArtifactTitle: 'Lime Agent Server Provider artifact session token',
    agentMessageTitle: 'runtime bridge Provider Store',
  });
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
      }, { workspacePath: workspaceDir });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 agents 内部回显测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'agents');
      await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
      await addAgentsProductImage(page);
      await expectAgentsProductImageCount(page, 1);

      const userIntent = 'E2E agents 内部回显防护：生成真实生活场景图片 Prompt。';
      const entryTextarea = page.locator('.agents-entry-composer textarea');
      await entryTextarea.fill(userIntent);
      await entryTextarea.press('Enter');

      await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agents-entry')).toHaveCount(0);
      await expect(page.locator('.agents-thread')).toContainText(/AI Agent 运行被阻断|未返回可展示交付物|未产生可展示回复|交付物线索/, { timeout: 20_000 });
      await expect(page.locator('.agents-thread')).not.toContainText('AI Agent 对话未启动');
      const runtimePanel = page.locator('.agents-runtime-inline');
      await expect(runtimePanel).toBeVisible({ timeout: 20_000 });

      await expectAgentsUiHidesInternalTerms(page);

      const trace = await page.evaluate(async ({ workspacePath, userIntent: expectedIntent }) => {
        const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
        const session = sessions.find((item) => item.userIntent === expectedIntent);
        const messageText = session?.messages.map((message) => message.content).join('\n') ?? '';
        return {
          found: Boolean(session),
          status: session?.status,
          model: session?.model,
          content: messageText,
        };
      }, { workspacePath: workspaceDir, userIntent });
      expect(trace.found, JSON.stringify(trace)).toBe(true);
      expect(trace.status, JSON.stringify(trace)).toBe('blocked');
      expect(trace.model, JSON.stringify(trace)).toBe('blocked:lime-agent-server');
      expect(trace.content, JSON.stringify(trace)).toMatch(/AI Agent 已连接平台|运行被安全校验阻断|未返回可展示交付物/);
      expect(trace.content, JSON.stringify(trace)).not.toContain('AI Agent 对话未启动');
      expect(trace.content, JSON.stringify(trace)).not.toContain('本地输入源：');
      expect(trace.content, JSON.stringify(trace)).not.toContain('输出要求：');
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
  }
});

test('agents 将平台运行事实投影到 AgentUI 面板而不是普通正文', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const userIntent = 'E2E agents 运行事实投影：请判断还缺哪些输入源。';
  const bridge = await startFakePlatformRuntimeBridge({
    agentDraftContent: [
      '# 输入源补齐 Prompt',
      '',
      '目标：先判断产品资料和参考素材缺口，再生成可追溯的内容任务。',
      '',
      `用户意图：${userIntent}`,
      '',
      '下一步：补齐产品事实、使用场景和合规边界后继续。',
    ].join('\n'),
    agentArtifactTitle: 'E2E agents runtime facts draft',
    agentRuntimeEvents: [
      {
        type: 'tool.started',
        payload: {
          toolCallId: 'tool-input-read',
          toolName: 'input-source.read',
          message: '准备读取输入源',
        },
      },
      {
        type: 'tool.failed',
        payload: {
          toolCallId: 'tool-input-read',
          toolName: 'input-source.read',
          message: '资料读取工具需要人工补源',
          evidenceRefs: ['evidence-runtime-input'],
        },
      },
      {
        type: 'tool.started',
        payload: {
          toolCallId: 'tool-web-search',
          toolName: 'web.search',
          toolFamily: 'webSearch',
          message: '准备执行网页搜索',
        },
      },
      {
        type: 'tool.result',
        payload: {
          toolCallId: 'tool-web-search',
          toolName: 'web.search',
          toolFamily: 'webSearch',
          message: '网页搜索已返回可追溯线索',
        },
      },
      {
        type: 'tool.started',
        payload: {
          toolCallId: 'tool-mcp-workspace-read',
          toolName: 'mcp__workspace__read_file',
          message: '准备读取 MCP 工作区文件',
        },
      },
      {
        type: 'tool.result',
        payload: {
          toolCallId: 'tool-mcp-workspace-read',
          toolName: 'mcp__workspace__read_file',
          message: 'MCP 工作区读取完成',
        },
      },
      {
        type: 'tool.started',
        payload: {
          toolCallId: 'tool-mcp-failed-result',
          toolName: 'mcp__github__search_code',
          message: '准备执行 GitHub MCP 搜索',
        },
      },
      {
        type: 'tool.result',
        payload: {
          toolCallId: 'tool-mcp-failed-result',
          toolName: 'mcp__github__search_code',
          success: false,
          failureCategory: 'tool_error',
          error: 'GitHub MCP 搜索失败',
          output: 'partial search output',
          evidenceRefs: ['evidence-runtime-mcp-failure'],
          message: 'MCP success=false 工具失败',
        },
      },
      {
        type: 'tool.started',
        payload: {
          tool_call_id: 'tool-mcp-snake-case',
          tool_name: 'mcp__github__search_code',
          message: '准备执行 snake_case MCP 搜索',
        },
      },
      {
        type: 'tool.result',
        payload: {
          tool_call_id: 'tool-mcp-snake-case',
          tool_name: 'mcp__github__search_code',
          mcp_server: 'github',
          evidence_refs: ['evidence-runtime-snake-mcp'],
          message: 'MCP snake_case 搜索完成',
        },
      },
      {
        type: 'tool.started',
        payload: {
          toolCallId: 'tool-skill-load',
          toolName: 'skill.load',
          toolFamily: 'skill',
          skillSlug: 'copywriting-master',
          message: '准备加载 Skill 上下文',
        },
      },
      {
        type: 'tool.result',
        payload: {
          toolCallId: 'tool-skill-load',
          toolName: 'skill.load',
          toolFamily: 'skill',
          skillSlug: 'copywriting-master',
          message: 'Skill 上下文加载完成',
        },
      },
      {
        type: 'tool.started',
        payload: {
          tool_call_id: 'tool-skill-snake-case',
          tool_name: 'lime_run_service_skill',
          tool_family: 'skill',
          skill_slug: 'snake-case-skill',
          message: '准备执行 snake_case Skill',
        },
      },
      {
        type: 'tool.result',
        payload: {
          tool_call_id: 'tool-skill-snake-case',
          tool_name: 'lime_run_service_skill',
          tool_family: 'skill',
          skill_slug: 'snake-case-skill',
          artifact_refs: ['artifact-runtime-snake-skill'],
          message: 'Skill snake_case 输出完成',
        },
      },
      {
        type: 'tool.result',
        payload: {
          toolCallId: 'tool-orphan-result',
          toolName: 'mcp__workspace__read_file',
          message: '孤立工具结果不能进入成功工具事实',
        },
      },
      {
        type: 'tool.started',
        payload: {
          toolCallId: 'tool-approval-write',
          toolName: 'workspace.write_file',
          message: '准备写入文件',
        },
      },
      {
        type: 'action.required',
        payload: {
          actionId: 'runtime-action-approval-write',
          toolCallId: 'tool-approval-write',
          actionKind: 'approve',
          message: '需要批准写入文件',
        },
      },
      {
        type: 'tool.result',
        payload: {
          toolCallId: 'tool-approval-write',
          toolName: 'workspace.write_file',
          message: '未批准时不允许成功结果',
        },
      },
      {
        type: 'evidence.changed',
        payload: {
          evidenceRef: 'evidence-runtime-input',
          evidenceRefs: ['evidence-runtime-input'],
          message: '平台返回来源证据已更新',
        },
      },
      {
        type: 'action.required',
        payload: {
          actionId: 'runtime-action-add-source',
          actionKind: 'add-input-source',
          targetModule: 'knowledge',
          message: '需要补充输入源后继续',
          evidenceRefs: ['evidence-runtime-input'],
        },
      },
      {
        type: 'action.required',
        payload: {
          action_id: 'runtime-action-snake-input-source',
          action_kind: 'add-input-source',
          target_module: 'knowledge',
          message: 'snake_case 动作需要补输入源',
          evidence_refs: ['evidence-runtime-snake-mcp'],
        },
      },
      {
        type: 'action.required',
        payload: {
          actionId: 'runtime-action-approval-cancelled',
          actionKind: 'approve',
          message: '需要确认高风险工具批准',
        },
      },
      {
        type: 'action.cancelled',
        payload: {
          actionId: 'runtime-action-approval-cancelled',
          actionKind: 'approve',
          message: '用户取消了高风险工具批准',
        },
      },
      {
        type: 'action.required',
        payload: {
          actionId: 'runtime-action-plan-expired',
          actionKind: 'plan-review',
          message: '需要审核执行计划',
        },
      },
      {
        type: 'action.expired',
        payload: {
          actionId: 'runtime-action-plan-expired',
          actionKind: 'plan-review',
          message: '计划审核等待超时',
        },
      },
      {
        type: 'task.started',
        payload: {
          taskId: 'runtime-task-source-audit',
          message: '输入源审计子任务已启动',
        },
      },
      {
        type: 'task.completed',
        payload: {
          taskId: 'runtime-task-source-audit',
          message: '输入源审计子任务已完成',
        },
      },
      {
        type: 'subagent.started',
        payload: {
          subagentId: 'runtime-subagent-copywriter',
          message: '文案协作代理已加入',
        },
      },
      {
        type: 'subagent.started',
        payload: {
          subagent_id: 'runtime-subagent-snake-researcher',
          message: 'snake_case 研究代理已加入',
        },
      },
      {
        type: 'subagent.completed',
        payload: {
          subagentId: 'runtime-subagent-copywriter',
          message: '文案协作代理已完成',
        },
      },
      {
        type: 'subagent.failed',
        payload: {
          subagentId: 'runtime-subagent-reviewer',
          message: '审核协作代理执行失败',
        },
      },
      {
        type: 'handoff.requested',
        payload: {
          handoffId: 'runtime-handoff-review',
          message: '已请求转交审核代理',
        },
      },
      {
        type: 'handoff.requested',
        payload: {
          handoff_id: 'runtime-handoff-snake-research',
          message: 'snake_case 已请求转交研究代理',
        },
      },
      {
        type: 'handoff.completed',
        payload: {
          handoffId: 'runtime-handoff-review',
          message: '审核代理移交已完成',
        },
      },
      {
        type: 'handoff.failed',
        payload: {
          handoffId: 'runtime-handoff-video',
          message: '视频代理移交失败',
        },
      },
      {
        type: 'review.verdict',
        payload: {
          reviewId: 'runtime-review-sources',
          message: '审核结论：需要补充产品事实来源',
        },
      },
      {
        type: 'review.verdict',
        payload: {
          review_id: 'runtime-review-snake-sources',
          message: 'snake_case 审核结论：输入源可继续',
        },
      },
      {
        type: 'permission.requested',
        payload: {
          permissionId: 'runtime-permission-read',
          message: '需要确认读取当前工作区素材',
        },
      },
      {
        type: 'permission.denied',
        payload: {
          permissionId: 'runtime-permission-network',
          message: '网络访问未获授权',
        },
      },
      {
        type: 'sandbox.blocked',
        payload: {
          policyId: 'workspace-write-policy',
          message: '沙箱策略阻断了越界写入',
        },
      },
      {
        type: 'runtime.warning',
        payload: {
          message: '运行时降级为只读资料检查',
        },
      },
      {
        type: 'runtime.error',
        payload: {
          message: '运行时诊断错误已记录',
        },
      },
    ],
  });
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath }) => {
        await window.contentStudio.saveSettings({ workspacePath });
      }, { workspacePath: workspaceDir });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 agents 运行事实测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'agents');
      await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
      await page.locator('.agents-entry-composer textarea').fill(userIntent);
      await page.locator('.agents-entry-composer textarea').press('Enter');

      await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 20_000 });
      const agentUiConversation = page.locator('.agents-workbench .agent-ui-projection.agent-ui-conversation-only');
      await expect(agentUiConversation).toBeVisible({ timeout: 20_000 });
      await expect(agentUiConversation.locator('.agent-ui-main[data-agent-ui-surface="conversation"]')).toBeVisible();
      await expect(agentUiConversation.locator('.agent-ui-sidecar[data-agent-ui-surface="runtime"]')).toHaveCount(0);
      const inlineFacts = page.locator('.agents-thread-scroll .agent-inline-runtime-facts');
      await expect(inlineFacts).toHaveCount(0);
      const runtimePanel = page.locator('.agents-runtime-inline');
      await expect(runtimePanel).toBeVisible({ timeout: 20_000 });
      await expect(runtimePanel).toHaveClass(/agent-ui-projection/);
      await expect(runtimePanel).toHaveClass(/agent-ui-runtime-only/);
      await expect(runtimePanel.locator('.agent-ui-sidecar[data-agent-ui-surface="runtime"]')).toBeVisible();
      await expect(runtimePanel.locator('.agent-ui-main[data-agent-ui-surface="conversation"]')).toHaveCount(0);
      const runtimeLayout = await page.evaluate(() => {
        const thread = document.querySelector('.agents-thread');
        const main = document.querySelector('.agents-thread-main');
        const runtime = document.querySelector('.agents-runtime-panel');
        const threadRect = thread?.getBoundingClientRect();
        const mainRect = main?.getBoundingClientRect();
        const runtimeRect = runtime?.getBoundingClientRect();
        const style = thread ? getComputedStyle(thread) : null;
        const runtimeStyle = runtime ? getComputedStyle(runtime) : null;
        return {
          dataRuntime: thread?.getAttribute('data-runtime'),
          gridColumnCount: style?.gridTemplateColumns.trim().split(/\s+/).filter(Boolean).length ?? 0,
          runtimeVisible: runtimeStyle?.display !== 'none',
          runtimeRightOfMain: Boolean(mainRect && runtimeRect && runtimeRect.left > mainRect.right),
          noHorizontalOverflow: Boolean(thread && thread.scrollWidth <= thread.clientWidth + 1),
          mainInsideThread: Boolean(threadRect && mainRect && mainRect.left >= threadRect.left && mainRect.right <= threadRect.right),
        };
      });
      expect(runtimeLayout, JSON.stringify(runtimeLayout)).toMatchObject({
        dataRuntime: 'open',
        gridColumnCount: 2,
        runtimeVisible: true,
        runtimeRightOfMain: true,
        noHorizontalOverflow: true,
        mainInsideThread: true,
      });
      await expect(runtimePanel.locator('.agent-runtime-summary [data-summary-kind="actions"] strong')).not.toHaveText('0');
      await expect(runtimePanel.locator('.agent-runtime-summary [data-summary-kind="artifacts"] strong')).not.toHaveText('0');
      await expect(runtimePanel.locator('.agent-runtime-summary [data-summary-kind="evidence"] strong')).not.toHaveText('0');
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-family="tool"][data-tool-name="input-source.read"]').first()).toContainText('input-source.read');
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-family="webSearch"][data-tool-name="web.search"]').first()).toContainText('web.search');
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-family="mcp"][data-tool-name="mcp__workspace__read_file"]').first()).toContainText('mcp__workspace__read_file');
      await expect(runtimePanel.locator('.agent-tool-facts [data-event-class="tool.failed"][data-tool-name="mcp__github__search_code"][data-tool-call-id="tool-mcp-failed-result"][data-failure-category="tool_error"]').first()).toContainText('MCP success=false 工具失败');
      await expect(runtimePanel.locator('.agent-tool-facts [data-event-class="tool.failed"][data-tool-name="mcp__github__search_code"][data-tool-call-id="tool-mcp-failed-result"]').first()).toContainText('失败');
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-family="mcp"][data-tool-name="mcp__github__search_code"][data-tool-call-id="tool-mcp-snake-case"][data-mcp-server="github"]').first()).toContainText('MCP snake_case 搜索完成');
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-family="skill"][data-tool-name="skill.load"][data-skill-slug="copywriting-master"]').first()).toContainText('skill.load');
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-family="skill"][data-tool-name="lime_run_service_skill"][data-skill-slug="snake-case-skill"]').first()).toContainText('snake_case 输出完成');
      await expect(runtimePanel.locator('.agent-tool-facts [data-event-class="tool.failed"][data-tool-name="input-source.read"]').first()).toContainText('资料读取工具需要人工补源');
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-name="input-source.read"][data-evidence-count="1"]').first()).toBeVisible();
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-name="mcp__github__search_code"][data-evidence-count="1"]').first()).toBeVisible();
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-name="lime_run_service_skill"][data-artifact-count="1"]').first()).toBeVisible();
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-call-id="tool-orphan-result"][data-event-class="tool.result"]')).toHaveCount(0);
      await expect(runtimePanel.locator('.agent-tool-facts [data-tool-call-id="tool-approval-write"][data-event-class="tool.result"]')).toHaveCount(0);
      const evidenceRefCard = runtimePanel.locator('.agent-evidence-refs [data-ref-kind="evidence"][data-ref-id="evidence-runtime-input"]').first();
      const artifactRefCard = runtimePanel.locator('.agent-artifact-refs [data-ref-kind="artifact"][data-ref-id="e2e-agents-artifact"]').first();
      await expect(evidenceRefCard).toBeVisible();
      await expect(artifactRefCard).toBeVisible();
      await evidenceRefCard.click();
      const evidenceDetail = runtimePanel.locator('.agent-runtime-ref-detail[data-ref-kind="evidence"][data-ref-id="evidence-runtime-input"]');
      await expect(evidenceDetail).toBeVisible({ timeout: 20_000 });
      await expect(evidenceDetail).toContainText('依据详情');
      await expect(evidenceDetail).toContainText('evidence-runtime-input');
      await expect(evidenceDetail.locator('.agent-runtime-ref-events [data-event-class="evidence.changed"]').first()).toContainText('平台返回来源证据已更新');
      await artifactRefCard.click();
      const artifactDetail = runtimePanel.locator('.agent-runtime-ref-detail[data-ref-kind="artifact"][data-ref-id="e2e-agents-artifact"]');
      await expect(artifactDetail).toBeVisible({ timeout: 20_000 });
      await expect(artifactDetail).toContainText('交付物详情');
      await expect(artifactDetail).toContainText('e2e-agents-artifact');
      await expect(artifactDetail.locator('.agent-runtime-ref-events [data-event-class="artifact.changed"]').first()).toContainText('交付草稿已更新');
      const platformAction = runtimePanel
        .locator('.agent-action-facts [data-event-class="action.required"][data-action-kind="add-input-source"]')
        .filter({ hasText: '需要补充输入源后继续' })
        .first();
      await expect(platformAction).toBeVisible({ timeout: 20_000 });
      await expect(platformAction.locator('.agent-event-action')).toHaveText('补输入源');
      const snakeCaseAction = runtimePanel
        .locator('.agent-action-facts [data-event-class="action.required"][data-action-kind="add-input-source"]')
        .filter({ hasText: 'snake_case 动作需要补输入源' })
        .first();
      await expect(snakeCaseAction).toBeVisible({ timeout: 20_000 });
      await expect(snakeCaseAction.locator('.agent-event-action')).toHaveText('补输入源');
      await expect(runtimePanel.locator('.agent-action-facts [data-event-class="action.cancelled"][data-action-resolved="true"]').first()).toContainText('用户取消了高风险工具批准');
      await expect(runtimePanel.locator('.agent-action-facts [data-event-class="action.expired"][data-action-resolved="true"]').first()).toContainText('计划审核等待超时');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="task.started"][data-task-id="runtime-task-source-audit"]').first()).toContainText('输入源审计子任务已启动');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="task.completed"][data-task-id="runtime-task-source-audit"]').first()).toContainText('输入源审计子任务已完成');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="subagent.started"][data-subagent-id="runtime-subagent-copywriter"]').first()).toContainText('文案协作代理已加入');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="subagent.started"][data-subagent-id="runtime-subagent-snake-researcher"]').first()).toContainText('snake_case 研究代理已加入');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="subagent.completed"][data-subagent-id="runtime-subagent-copywriter"]').first()).toContainText('文案协作代理已完成');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="subagent.failed"][data-subagent-id="runtime-subagent-reviewer"]').first()).toContainText('审核协作代理执行失败');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="handoff.requested"][data-handoff-id="runtime-handoff-review"]').first()).toContainText('已请求转交审核代理');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="handoff.requested"][data-handoff-id="runtime-handoff-snake-research"]').first()).toContainText('snake_case 已请求转交研究代理');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="handoff.completed"][data-handoff-id="runtime-handoff-review"]').first()).toContainText('审核代理移交已完成');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="handoff.failed"][data-handoff-id="runtime-handoff-video"]').first()).toContainText('视频代理移交失败');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="review.verdict"][data-review-id="runtime-review-sources"]').first()).toContainText('审核结论：需要补充产品事实来源');
      await expect(runtimePanel.locator('.agent-collaboration-facts [data-event-class="review.verdict"][data-review-id="runtime-review-snake-sources"]').first()).toContainText('snake_case 审核结论：输入源可继续');
      await expect(runtimePanel.locator('.agent-diagnostic-facts [data-event-class="permission.requested"]').first()).toContainText('需要确认读取当前工作区素材');
      await expect(runtimePanel.locator('.agent-diagnostic-facts [data-event-class="permission.denied"]').first()).toContainText('网络访问未获授权');
      await expect(runtimePanel.locator('.agent-diagnostic-facts [data-event-class="sandbox.blocked"]').first()).toContainText('沙箱策略阻断了越界写入');
      await expect(runtimePanel.locator('.agent-diagnostic-facts [data-event-class="runtime.warning"]').first()).toContainText('运行时降级为只读资料检查');
      await expect(runtimePanel.locator('.agent-diagnostic-facts [data-event-class="runtime.error"]').filter({ hasText: '运行时诊断错误已记录' }).first()).toContainText('运行时诊断错误已记录');
      await expect(runtimePanel.locator('.agent-diagnostic-facts [data-event-class="runtime.error"]').filter({ hasText: '工具事件缺少匹配的 tool.started' }).first()).toContainText('工具事件缺少匹配的 tool.started');
      await expect(runtimePanel.locator('.agent-diagnostic-facts [data-event-class="runtime.error"]').filter({ hasText: '工具仍在等待人工处理' }).first()).toContainText('工具仍在等待人工处理');
      await expect(runtimePanel.locator('.agent-execution-events [data-event-class="task.started"]')).toHaveCount(0);
      await expect(runtimePanel.locator('.agent-execution-events [data-event-class="subagent.started"]')).toHaveCount(0);
      await expect(runtimePanel.locator('.agent-execution-events [data-event-class="handoff.requested"]')).toHaveCount(0);
      await expect(runtimePanel.locator('.agent-execution-events [data-event-class="review.verdict"]')).toHaveCount(0);

      await expect(page.locator('.agents-thread-scroll .agent-turn').filter({ hasText: '资料读取工具需要人工补源' })).toHaveCount(0);
      await expect(page.locator('.agents-thread-scroll .agent-turn').filter({ hasText: 'MCP 工作区读取完成' })).toHaveCount(0);
      await expect(page.locator('.agents-thread-scroll .agent-turn').filter({ hasText: 'MCP success=false 工具失败' })).toHaveCount(0);
      await expect(page.locator('.agents-thread-scroll .agent-turn').filter({ hasText: '孤立工具结果不能进入成功工具事实' })).toHaveCount(0);
      await expect(page.locator('.agents-thread-scroll .agent-turn').filter({ hasText: '未批准时不允许成功结果' })).toHaveCount(0);
      await expect(page.locator('.agents-thread-scroll .agent-turn').filter({ hasText: '沙箱策略阻断了越界写入' })).toHaveCount(0);
      await expect(page.locator('.agents-thread-scroll .agent-turn').filter({ hasText: '审核协作代理执行失败' })).toHaveCount(0);
      await expect(page.locator('.agents-thread-scroll .agent-turn').filter({ hasText: '视频代理移交失败' })).toHaveCount(0);

      const runtimeTrace = await page.evaluate(async ({ workspacePath, intent }) => {
        const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
        const session = sessions.find((item) => item.userIntent === intent);
        return {
          found: Boolean(session),
          hasToolFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'tool.failed' &&
            event.detail?.includes('资料读取工具需要人工补源')
          ))),
          hasActionFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'action.required' &&
            event.actionId === 'runtime-action-add-source' &&
            event.payload?.actionKind === 'add-input-source'
          ))),
          hasEvidenceFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'evidence.changed' &&
            event.evidenceRefs?.includes('evidence-runtime-input')
          ))),
          hasSubagentFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'subagent.completed' &&
            event.payload?.subagentId === 'runtime-subagent-copywriter'
          ))),
          hasSnakeCaseToolFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'tool.result' &&
            event.toolCallId === 'tool-mcp-snake-case' &&
            event.payload?.toolName === 'mcp__github__search_code' &&
            event.payload?.mcpServer === 'github' &&
            event.evidenceRefs?.includes('evidence-runtime-snake-mcp')
          ))),
          hasFailedToolResultFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'tool.failed' &&
            event.status === 'failed' &&
            event.toolCallId === 'tool-mcp-failed-result' &&
            event.payload?.eventType === 'tool.failed' &&
            event.payload?.rawEventType === 'tool.result' &&
            event.payload?.success === false &&
            event.payload?.failureCategory === 'tool_error' &&
            event.payload?.error === 'GitHub MCP 搜索失败' &&
            event.payload?.output === 'partial search output' &&
            event.evidenceRefs?.includes('evidence-runtime-mcp-failure')
          ))),
          hasFailedToolResultAsSuccess: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'tool.result' &&
            event.toolCallId === 'tool-mcp-failed-result'
          ))),
          hasSequenceGateDiagnostic: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'runtime.error' &&
            event.kind === 'diagnostic' &&
            (
              event.payload?.violationCode === 'tool_result_without_start' ||
              event.payload?.violationCode === 'tool_event_while_action_pending'
            )
          ))),
          hasOrphanResultAsSuccess: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'tool.result' &&
            event.toolCallId === 'tool-orphan-result'
          ))),
          hasPendingActionResultAsSuccess: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'tool.result' &&
            event.toolCallId === 'tool-approval-write'
          ))),
          hasSnakeCaseActionFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'action.required' &&
            event.actionId === 'runtime-action-snake-input-source'
          ))),
          hasSnakeCaseSubagentFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'subagent.started' &&
            event.payload?.subagentId === 'runtime-subagent-snake-researcher'
          ))),
          hasHandoffFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'handoff.failed' &&
            event.payload?.handoffId === 'runtime-handoff-video'
          ))),
          hasSnakeCaseHandoffFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'handoff.requested' &&
            event.payload?.handoffId === 'runtime-handoff-snake-research'
          ))),
          hasReviewFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'review.verdict' &&
            event.payload?.reviewId === 'runtime-review-sources'
          ))),
          hasSnakeCaseReviewFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'review.verdict' &&
            event.payload?.reviewId === 'runtime-review-snake-sources'
          ))),
          hasArtifactFact: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'artifact.changed' &&
            event.artifactRefs?.includes('e2e-agents-artifact')
          ))),
          messageLeaksRuntimeFact: Boolean(session?.messages.some((message) => (
            message.content.includes('资料读取工具需要人工补源') ||
            message.content.includes('runtime-action-add-source') ||
            message.content.includes('evidence-runtime-input') ||
            message.content.includes('沙箱策略阻断了越界写入') ||
            message.content.includes('运行时诊断错误已记录') ||
            message.content.includes('MCP success=false 工具失败') ||
            message.content.includes('孤立工具结果不能进入成功工具事实') ||
            message.content.includes('未批准时不允许成功结果') ||
            message.content.includes('文案协作代理已完成') ||
            message.content.includes('视频代理移交失败') ||
            message.content.includes('审核结论：需要补充产品事实来源') ||
            message.content.includes('MCP snake_case 搜索完成') ||
            message.content.includes('Skill snake_case 输出完成') ||
            message.content.includes('snake_case 研究代理已加入')
          ))),
        };
      }, { workspacePath: workspaceDir, intent: userIntent });
      expect(runtimeTrace, JSON.stringify(runtimeTrace)).toMatchObject({
        found: true,
        hasToolFact: true,
        hasActionFact: true,
        hasEvidenceFact: true,
        hasSubagentFact: true,
        hasSnakeCaseToolFact: true,
        hasFailedToolResultFact: true,
        hasFailedToolResultAsSuccess: false,
        hasSequenceGateDiagnostic: true,
        hasOrphanResultAsSuccess: false,
        hasPendingActionResultAsSuccess: false,
        hasSnakeCaseActionFact: true,
        hasSnakeCaseSubagentFact: true,
        hasHandoffFact: true,
        hasSnakeCaseHandoffFact: true,
        hasReviewFact: true,
        hasSnakeCaseReviewFact: true,
        hasArtifactFact: true,
        messageLeaksRuntimeFact: false,
      });

      await platformAction.locator('.agent-event-action').click();
      await expect(page.locator('.agents-runtime-inline')).toBeVisible({ timeout: 20_000 });
      await expect.poll(
        async () => page.evaluate(async ({ workspacePath, intent }) => {
          const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
          const session = sessions.find((item) => item.userIntent === intent);
          return {
            hasRequired: Boolean(session?.executionEvents?.some((event) => (
              event.eventClass === 'action.required' &&
              event.actionId === 'runtime-action-add-source'
            ))),
            hasPlatformResolved: Boolean(session?.executionEvents?.some((event) => (
              event.eventClass === 'action.resolved' &&
              event.actionId === 'runtime-action-add-source' &&
              event.detail?.includes('平台已确认人工处理结果')
            ))),
            hasLocalOnlyResolved: Boolean(session?.executionEvents?.some((event) => (
              event.eventClass === 'action.resolved' &&
              event.actionId === 'runtime-action-add-source' &&
              event.payload?.responseScope === 'local-navigation'
            ))),
          };
        }, { workspacePath: workspaceDir, intent: userIntent }),
        { message: '等待平台运行事实待办动作回写到 runtime', timeout: 20_000 },
      ).toMatchObject({ hasRequired: true, hasPlatformResolved: true, hasLocalOnlyResolved: false });
      const actionRespondRequest = bridge.requests.find((request) => (
        request.body.capability === 'lime.agent' &&
        request.body.operation === 'agentSession/action/respond'
      ));
      expect(actionRespondRequest, JSON.stringify(bridge.requests)).toBeTruthy();
      expect(actionRespondRequest.body.input).toMatchObject({
        sessionId: 'platform-session-e2e',
        actionId: 'runtime-action-add-source',
        decision: 'open-input-source',
      });
      await expect(page.locator('.knowledge-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.knowledge-workbench')).toContainText('成型知识库');
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
  }
});

test('agents 通过 embedded 平台宿主真实调用 Gemini provider store 并投影到 UI', async ({}, testInfo) => {
  test.skip(!liveGeminiEnabled, '需要 CONTENT_STUDIO_E2E_LIVE_GEMINI=1 才调用真实 Gemini provider store。');
  test.setTimeout(180_000);

  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    await page.evaluate(async ({ workspacePath }) => {
      await window.contentStudio.saveSettings({ workspacePath });
    }, { workspacePath: workspaceDir });
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待 embedded 平台宿主工作区重新加载', timeout: 30_000 },
    ).toBe(true);

    const modelProjection = await page.evaluate(async () => {
      const config = await window.contentStudio.getModelConfig();
      return {
        platformManaged: config.platformManaged,
        source: config.source,
        providerId: config.agentProviderPreference,
        textModel: config.textModel,
        textModels: config.textModels,
        providers: config.platformModelSettings?.providers.map((provider) => ({
          id: provider.id,
          apiKeyConfigured: provider.apiKeyConfigured,
          models: provider.models,
        })) ?? [],
        sensitiveLeak: JSON.stringify(config).match(/"apiKey"\s*:|"api_key"\s*:|"secret"\s*:|"token"\s*:|"authorization"\s*:|"credential"\s*:/i)?.[0] ?? '',
      };
    });
    expect(modelProjection, JSON.stringify(modelProjection)).toMatchObject({
      platformManaged: true,
      source: 'lime-desktop-platform',
      providerId: liveGeminiProviderId,
      textModel: liveGeminiModelId,
    });
    expect(modelProjection.textModels, JSON.stringify(modelProjection)).toContain(liveGeminiModelId);
    expect(modelProjection.providers, JSON.stringify(modelProjection)).toContainEqual(expect.objectContaining({
      id: liveGeminiProviderId,
      apiKeyConfigured: true,
      models: expect.arrayContaining([liveGeminiModelId]),
    }));
    expect(modelProjection.sensitiveLeak, JSON.stringify(modelProjection)).toBe('');
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待 embedded 平台模型 projection 刷新到 React 状态', timeout: 30_000 },
    ).toBe(true);

    await clickNavItem(page, 'agents');
    await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.agents-entry .lime-runtime-model-trigger')).toContainText(liveGeminiModelId);
    const userIntent = [
      '真实 Gemini UI 验收：请用三句话生成布谷AI内容工厂 Agents provider store 验收回复。',
      '必须明确说明这是一次真实模型调用，并保留可追溯运行事实。',
    ].join('\n');
    await page.locator('.agents-entry-composer textarea').fill(userIntent);
    await page.locator('.agents-entry-composer textarea').press('Enter');

    await expect(page.locator('.agents-workbench')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.agents-thread')).toContainText('真实 Gemini UI 验收', { timeout: 20_000 });
    await expect(page.locator('.agents-thread')).toContainText(/真实模型调用|Gemini|provider store|验收/, { timeout: 120_000 });
    await expect(page.locator('.agents-thread-summary')).toHaveCount(0);
    await expectAgentsUiHidesInternalTerms(page);

    const readLiveTrace = () => page.evaluate(async ({ workspacePath, intent }) => {
      const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
      const session = sessions.find((item) => item.userIntent === intent);
      const messages = session?.messages.map((message) => message.content).join('\n') ?? '';
      const events = session?.executionEvents ?? [];
      return {
        found: Boolean(session),
        status: session?.status,
        model: session?.model,
        turnIds: [...new Set(events.map((event) => event.turnId).filter(Boolean))],
        runtimeSessionIds: [...new Set(events
          .map((event) => typeof event.payload?.sessionId === 'string' ? event.payload.sessionId : undefined)
          .filter(Boolean))],
        eventClasses: events.map((event) => event.eventClass),
        hasArtifactFact: events.some((event) => event.eventClass === 'artifact.changed'),
        hasMessageFact: events.some((event) => event.eventClass === 'model.delta' || event.eventClass === 'model.completed'),
        hasGeminiReply: /真实模型调用|Gemini|provider store|验收/.test(messages),
        messageLeakedRuntimeFact: /artifact\.snapshot|turn\.started|turn\.completed|routing\.decision/.test(messages),
        sensitiveLeak:
          JSON.stringify(session).match(/"apiKey"\s*:|"api_key"\s*:|"secret"\s*:|"token"\s*:|"authorization"\s*:|"credential"\s*:/i)?.[0] ?? '',
      };
    }, { workspacePath: workspaceDir, intent: userIntent });
    await expect.poll(readLiveTrace, {
      message: '等待真实 Gemini 运行结果写回 Agent session store',
      timeout: 60_000,
    }).toMatchObject({
      found: true,
      model: expect.stringContaining(liveGeminiModelId),
      hasGeminiReply: true,
    });
    const liveTrace = await readLiveTrace();
    expect(liveTrace.found, JSON.stringify(liveTrace)).toBe(true);
    expect(liveTrace.turnIds.length, JSON.stringify(liveTrace)).toBeGreaterThan(0);
    expect(liveTrace.model, JSON.stringify(liveTrace)).toContain(liveGeminiModelId);
    expect(liveTrace.hasGeminiReply, JSON.stringify(liveTrace)).toBe(true);
    expect(
      liveTrace.hasArtifactFact || liveTrace.hasMessageFact || liveTrace.eventClasses.includes('turn.submitted'),
      JSON.stringify(liveTrace),
    ).toBe(true);
    expect(liveTrace.messageLeakedRuntimeFact, JSON.stringify(liveTrace)).toBe(false);
    expect(liveTrace.sensitiveLeak, JSON.stringify(liveTrace)).toBe('');
    const runtimePanel = page.locator('.agents-runtime-inline');
    if (liveTrace.hasArtifactFact) {
      await expect(runtimePanel).toBeVisible({ timeout: 20_000 });
      await expect(runtimePanel).toHaveClass(/agent-ui-runtime-only/);
      await expect(runtimePanel.locator('.agent-ui-sidecar[data-agent-ui-surface="runtime"]')).toBeVisible();
      await expect(runtimePanel.locator('.agent-runtime-summary [data-summary-kind="artifacts"] strong')).not.toHaveText('0');
    } else {
      await expect(runtimePanel).toHaveCount(0);
    }

    await page.screenshot({
      path: join(projectRoot, '.playwright-real-agent-gemini.png'),
      fullPage: true,
    });
  }, {
    useEmbeddedPlatformHost: true,
    requireExplicitTextKey: false,
    env: {
      CONTENT_STUDIO_APP_SERVER_DATA_DIR: liveGeminiAppServerDataDir,
      CONTENT_STUDIO_RUNTIME_LIVE_TIMEOUT_MS: '180000',
    },
    platformModelSettings: {
      version: '1',
      updatedAt: new Date().toISOString(),
      defaultAgentProviderId: liveGeminiProviderId,
      defaultTextModelId: liveGeminiModelId,
      providers: [{
        id: liveGeminiProviderId,
        displayName: 'Content Studio Gemini Live Stale Cache',
        protocol: 'gemini-native',
        capabilityKinds: ['text'],
        enabled: true,
        apiKeyConfigured: false,
        authType: 'api-key',
        models: [liveGeminiModelId],
      }],
    },
  });
});

test('对话里的待处理动作可以恢复到成型知识库页面', async ({}, testInfo) => {
  test.setTimeout(120_000);

  const bridge = await startFakePlatformRuntimeBridge({
    agentRuntimeEvents: [
      {
        type: 'action.required',
        payload: {
          actionId: 'runtime-action-add-source',
          actionKind: 'add-input-source',
          targetModule: 'knowledge',
          message: '需要补充输入源后继续',
        },
      },
    ],
  });
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    await page.evaluate(async ({ workspacePath }) => {
      const api = window.contentStudio;
      await api.saveSettings({ workspacePath });
    }, { workspacePath: workspaceDir });

    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待待处理动作测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, 'agents');
    await expect(page.locator('.agents-entry')).toBeVisible({ timeout: 20_000 });
    await page.locator('.agents-entry-composer textarea').fill('请先判断需要补哪些产品资料和参考素材。');
    await page.locator('.agents-entry-composer textarea').press('Enter');
    const agentPanel = page.locator('.agents-workbench');
    await expect(agentPanel).toBeVisible({ timeout: 20_000 });
    let promptSessionId = '';
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
        return sessions.find((session) => session.userIntent === '请先判断需要补哪些产品资料和参考素材。')?.id ?? '';
      }, workspaceDir),
      { message: '等待 agents 会话写入', timeout: 20_000 },
    ).not.toBe('');
    promptSessionId = await page.evaluate(async (workspacePath) => {
      const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
      return sessions.find((session) => session.userIntent === '请先判断需要补哪些产品资料和参考素材。')?.id ?? '';
    }, workspaceDir);
    expect(promptSessionId).toBeTruthy();

    const actionButton = agentPanel.locator(
      '.agent-action-facts [data-event-class="action.required"][data-action-kind="add-input-source"] .agent-event-action',
    );
    const runtimePanel = agentPanel.locator('.agents-runtime-inline');
    await expect(runtimePanel).toBeVisible({ timeout: 20_000 });
    await expect(actionButton).toHaveText('补输入源', { timeout: 20_000 });
    await expect(actionButton).toBeVisible({ timeout: 20_000 });
    await actionButton.click();
    await expect.poll(
      async () => page.evaluate(async ({ workspacePath, sessionId }) => {
        const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
        const session = sessions.find((item) => item.id === sessionId);
        return {
          hasRequired: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'action.required' &&
            event.actionId === 'runtime-action-add-source'
          ))),
          hasPlatformResolved: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'action.resolved' &&
            event.actionId === 'runtime-action-add-source' &&
            event.detail?.includes('平台已确认人工处理结果')
          ))),
          hasLocalOnlyResolved: Boolean(session?.executionEvents?.some((event) => (
            event.eventClass === 'action.resolved' &&
            event.actionId === 'runtime-action-add-source' &&
            event.payload?.responseScope === 'local-navigation'
          ))),
        };
      }, { workspacePath: workspaceDir, sessionId: promptSessionId }),
      { message: '等待平台 action fact 回写 runtime', timeout: 20_000 },
    ).toEqual({ hasRequired: true, hasPlatformResolved: true, hasLocalOnlyResolved: false });
    const actionRespondRequest = bridge.requests.find((request) => (
      request.body.capability === 'lime.agent' &&
      request.body.operation === 'agentSession/action/respond'
    ));
    expect(actionRespondRequest, JSON.stringify(bridge.requests)).toBeTruthy();
    expect(actionRespondRequest.body.input).toMatchObject({
      sessionId: 'platform-session-e2e',
      actionId: 'runtime-action-add-source',
      decision: 'open-input-source',
    });
    await expect(page.locator('.knowledge-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.knowledge-workbench')).toContainText('成型知识库');
    }, {
      requireExplicitTextKey: false,
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
      },
    });
  } finally {
    await bridge.close();
  }
});

test('视频 Prompt 需要可追溯资料并支持临时资料自动留痕', async ({}, testInfo) => {
  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    await page.evaluate(async (workspacePath) => {
      await window.contentStudio.saveSettings({ workspacePath });
    }, workspaceDir);
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待视频 Prompt 临时资料测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, '视频 Prompt');
    const promptPanel = page.locator('.video-prompt-builder-panel');
    const generateButton = promptPanel.locator('button').filter({ hasText: '生成视频 Prompt 组' });
    const checkedInputs = page.locator('.video-prompt-scenes-panel input[type="checkbox"]:checked');
    while (await checkedInputs.count()) {
      await checkedInputs.first().click();
    }
    await expect(generateButton).toBeDisabled();
    await expect(promptPanel).toContainText('请选择场景卡、勾选输入源，或粘贴本次资料后再生成');

    await promptPanel.locator('label').filter({ hasText: '本次资料' }).locator('textarea').fill([
      '产品：便携营养条包。',
      '卖点：早餐后和办公室抽屉随手取用。',
      '参考素材：手持镜头，自然光，通勤包侧袋。',
      '边界：不承诺治疗，不使用外部任务状态。',
    ].join('\n'));
    await expect(promptPanel).toContainText('已粘贴临时资料，生成时会自动登记为本次输入源并进入追溯记录');
    await expect(generateButton).toBeEnabled();
    await generateButton.click();
    await expect(page.locator('.video-prompt-preview pre')).toContainText(/视频 Prompt|任务：|15 秒/, { timeout: 20_000 });

    await promptPanel.locator('button').filter({ hasText: '导入成品视频' }).click();
    await expect(page.locator('.video-import-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.video-import-workbench .inline-warning')).toContainText('请先复制视频 Prompt 到第三方平台');
    await expect(page.locator('.video-import-workbench .module-command-center button').filter({ hasText: '导入并关联提示词' })).toBeDisabled();
    await expect(page.locator('.video-import-main-panel button').filter({ hasText: '选择视频文件' })).toBeDisabled();

    const trace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const sources = await api.listInputSources(workspacePath);
      const source = sources.find((item) => item.tags.includes('video-prompt'))
        ?? sources.find((item) => (item.extractedText ?? '').includes('便携营养条包'));
      const draft = (await api.listPromptDrafts(workspacePath)).find((item) =>
        source?.id ? item.inputSourceIds.includes(source.id) : false,
      );
      return {
        sourceId: source?.id,
        sourcePurpose: source?.purpose,
        sourceTags: source?.tags ?? [],
        sourceText: source?.extractedText ?? '',
        sources: sources.map((item) => ({
          title: item.title,
          purpose: item.purpose,
          tags: item.tags,
          text: item.extractedText,
        })),
        draftPurpose: draft?.purpose,
        draftInputSourceIds: draft?.inputSourceIds ?? [],
      };
    }, workspaceDir);
    expect(trace.sourceId, JSON.stringify(trace)).toBeTruthy();
    expect(trace.sourcePurpose, JSON.stringify(trace)).toBe('task-input');
    expect(trace.sourceTags, JSON.stringify(trace)).toEqual(expect.arrayContaining(['video-prompt', '临时资料']));
    expect(trace.sourceText, JSON.stringify(trace)).toContain('便携营养条包');
    expect(trace.draftPurpose, JSON.stringify(trace)).toBe('video');
    expect(trace.draftInputSourceIds, JSON.stringify(trace)).toContain(trace.sourceId);
  });
});

test('品牌知识库在平台文字 capability 未完成时 blocked，Agent 对话仍走平台', async ({}, testInfo) => {
  test.setTimeout(120_000);

  const capturedPrompts = [];
  const { server, baseUrl } = await startFakeOpenAITextServer((prompt) => {
    capturedPrompts.push(prompt);
    return fakeBusinessChainTextOutput(prompt);
  });
  const appServerDataDir = await mkdtemp(join(tmpdir(), 'content-studio-e2e-app-server-'));
  await seedOpenAIProviderStore({ dataDir: appServerDataDir, baseUrl });
  const bridge = await startFakePlatformRuntimeBridge({
    modelSettings: {
      version: 'e2e-model-settings',
      updatedAt: '2026-06-09T00:00:00.000Z',
      defaultAgentProviderId: 'openai',
      defaultTextModelId: 'test-text-model',
      providers: [{
        id: 'openai',
        displayName: 'OpenAI',
        protocol: 'openai-compatible',
        capabilityKinds: ['text'],
        enabled: true,
        apiKeyConfigured: true,
        authType: 'api-key',
        baseUrl,
        useResponsesApi: false,
        models: ['test-text-model'],
      }],
    },
  });

  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.installBuiltinKnowledgeBase('product-demo', workspacePath);
      }, { workspacePath: workspaceDir });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待品牌链路测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, '品牌 / 产品知识库');
      await expectCommandCenter(page, '.knowledge-brand-workbench > .module-command-center', 'compact');
      const extractButton = page.locator('.knowledge-brand-workbench button').filter({ hasText: '抽取品牌知识库' }).first();
      await expect(extractButton).toBeEnabled();
      await extractButton.click();
      await expect(page.locator('.knowledge-brand-workbench .prompt-draft-list')).toContainText('待配置', { timeout: 20_000 });
      await expect(page.locator('.knowledge-brand-workbench .prompt-draft-list')).toContainText('生成服务未完成');

      await page.locator('.knowledge-brand-workbench .agent-session-footer textarea').fill('请检查品牌事实、合规边界和场景库下一步。');
      await page.locator('.knowledge-brand-workbench .agent-session-footer button').filter({ hasText: '开始判断' }).click();
      await expect(page.locator('.knowledge-brand-workbench .agent-turn.user')).toContainText('品牌事实', { timeout: 20_000 });
      await expectAgentBusinessReply(page.locator('.knowledge-brand-workbench .agent-turn.assistant'), {
        primary: '品牌知识库协作',
        secondary: '品牌事实',
      });
      const agentRequest = bridge.requests.find((request) => request.body.capability === 'lime.agent');
      expect(agentRequest, JSON.stringify(bridge.requests)).toBeTruthy();
      expect(agentRequest.body.operation).toBe('agentSession/turn/start');
      expect(JSON.stringify(agentRequest.body)).not.toMatch(/apiKey|api_key|token|secret|password|credential|authorization|cookie/i);

      const sceneButton = page.locator('.knowledge-brand-workbench button').filter({ hasText: '生成场景库' }).first();
      await expect(sceneButton).toBeDisabled();
    }, {
      env: {
        LIME_RUNTIME_BRIDGE: JSON.stringify(bridge.descriptor),
        LIME_HOST_SNAPSHOT: JSON.stringify(bridge.snapshot),
        CONTENT_STUDIO_APP_SERVER_DATA_DIR: appServerDataDir,
      },
      requireExplicitTextKey: false,
    });
  } finally {
    await bridge.close();
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(appServerDataDir, { recursive: true, force: true });
  }

  expect(capturedPrompts.some((prompt) => prompt.includes('generate_brand_knowledge_base')), capturedPrompts.join('\n---\n')).toBe(true);
});

test('文章生成不会自动混入未显式选择的场景卡', async ({}, testInfo) => {
  test.setTimeout(120_000);

  const { server, baseUrl } = await startFakeOpenAITextServer((prompt) => {
    if (prompt.includes('"task": "generate_article"')) {
      return {
        titleCandidates: ['独立文章不绑定场景卡', '知识引用文章草稿', '不混用场景上下文'],
        outline: ['明确主题', '引用知识库事实', '说明使用边界', '给出人工复核项'],
        summary: '验证文章生成不会自动携带场景卡。',
        markdown: '# 独立文章不绑定场景卡\n\n这是一篇只依赖知识引用和用户要求的文章草稿。',
        publishCheck: [
          { level: 'info', message: '已检查场景卡不应自动注入。' },
          { level: 'warning', message: '发布前仍需人工复核事实引用。' },
        ],
      };
    }
    return fakeBusinessChainTextOutput(prompt);
  });

  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      const setup = await page.evaluate(async ({ workspacePath, endpoint }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.saveModelConfig({
          textProtocol: 'openai-chat',
          textApiEndpoint: endpoint,
          textApiKey: 'test-text-key',
          textModel: 'test-text-model',
        });
        const source = await api.registerInputSource({
          workspacePath,
          kind: 'manual-note',
          purpose: 'product-brief',
          title: '场景隔离产品资料',
          text: '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
          summary: '场景隔离产品资料',
          tags: ['scene-isolation'],
        });
        const citations = [{
          knowledgeBaseId: `input-source:${source.id}`,
          sectionId: 'full-text',
          title: source.title,
          sectionType: 'product',
          excerpt: source.extractedText || '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
        }];
        const pack = await api.generatePromptPack({ workspacePath, citations, inputSourceIds: [source.id], name: '场景隔离提示词包' });
        const cards = await api.generateSceneCards({ workspacePath, promptPackId: pack.id, citations, count: 2 });
        return { sceneIds: cards.map((card) => card.id) };
      }, { workspacePath: workspaceDir, endpoint: baseUrl });
      expect(setup.sceneIds.length).toBeGreaterThan(0);

      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待场景隔离测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await openArticleWorkbenchFromAgents(page);
      await expect(page.locator('.article-module-workbench')).toBeVisible({ timeout: 20_000 });
      await page.locator('.article-editor-panel label').filter({ hasText: '主题' }).locator('input').fill('独立文章不绑定场景卡');
      await page.locator('.article-editor-panel textarea').fill('只根据知识引用生成文章，不应自动携带任何场景卡。');
      await page.locator('.article-editor-panel button').filter({ hasText: '生成大纲 / 正文 / 发布检查' }).click();
      await expect(page.locator('.article-preview')).toContainText('独立文章不绑定场景卡', { timeout: 20_000 });

      const trace = await page.evaluate(async (workspacePath) => {
        const logs = await window.contentStudio.listGenerationLogs(workspacePath);
        const articleLog = logs.find((log) => log.kind === 'article' && log.title === '独立文章不绑定场景卡');
        return {
          sceneCardIds: articleLog?.sceneCardIds ?? null,
          inputSceneCardIds: articleLog?.input?.sceneCardIds ?? null,
        };
      }, workspaceDir);

      expect(trace.sceneCardIds, JSON.stringify(trace)).toEqual([]);
      expect(trace.inputSceneCardIds, JSON.stringify(trace)).toEqual([]);
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('业务主链在无真实 Provider 时 blocked，不伪造成果', async ({}, testInfo) => {
  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    const result = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      await api.installBuiltinKnowledgeBase('product-demo', workspacePath);
      const knowledgeBases = await api.listKnowledgeBases(workspacePath);
      const searchResults = await api.searchKnowledge({ workspacePath, query: '卖点 场景 合规', baseType: 'product-kb', sectionType: 'all' });
      const citations = searchResults.slice(0, 3).map((item) => ({
        knowledgeBaseId: item.knowledgeBaseId,
        sectionId: item.section.id,
        title: `${item.baseTitle} / ${item.section.title}`,
        sectionType: item.section.sectionType,
        excerpt: (item.section.content || item.section.summary || item.section.title).slice(0, 500),
      }));

      let promptPackError = '';
      try {
        await api.generatePromptPack({ workspacePath, citations, name: 'Playwright 提示词包' });
      } catch (error) {
        promptPackError = error instanceof Error ? error.message : String(error);
      }

      let articleError = '';
      try {
        await api.generateArticle({
          workspacePath,
          articleType: 'wechat-longform',
          platform: '公众号',
          audience: '关注真实使用场景的用户',
          topic: 'Playwright 内容工厂测试',
          tone: '专业、自然、克制',
          length: 'short',
          customRequirement: '只验证真实 provider 缺失时不能伪造成果。',
          citations,
          assetRefs: [],
          selectedSkillSlugs: [],
          params: { textModel: 'gpt-4o-mini' },
        });
      } catch (error) {
        articleError = error instanceof Error ? error.message : String(error);
      }

      const image = await api.generateImage({
        workspacePath,
        productImageRefs: [],
        referenceImageRefs: [],
        prompt: '生成一张 Playwright 测试场景图',
        promptMode: 'preset',
        generationMode: 'smart',
        template: '场景图',
        watermark: false,
        citations,
        selectedSkillSlugs: [],
        params: {
          textModel: 'gpt-4o-mini',
          imageModel: 'gpt-image-2',
          videoModel: 'veo-3.1',
          runMode: 'single',
          count: 1,
          aspectRatio: '4:5',
          resolution: '2k',
          quality: 'medium',
        },
      });

      let videoBreakdownError = '';
      try {
        await api.analyzeVideo({
          workspacePath,
          sourceType: 'url',
          source: 'https://example.com/reference.mp4',
          dimensions: ['开头钩子', '视觉节奏'],
          citations,
          selectedSkillSlugs: [],
          params: { textModel: 'gpt-4o-mini' },
        });
      } catch (error) {
        videoBreakdownError = error instanceof Error ? error.message : String(error);
      }

      let videoScriptStatus = '';
      let videoScriptMessage = '';
      try {
        const videoScript = await api.generateVideoScript({
          workspacePath,
          productName: 'Playwright 测试产品',
          sceneBackground: '真实使用场景',
          subtitleMode: 'burned-subtitle',
          voiceStyle: '自然可信',
          customRequirement: '验证未配置文字模型时不能生成本地模板。',
          ratio: '4:5',
          shotCount: 4,
          durationSeconds: 12,
          citations,
          assetRefs: [],
          selectedSkillSlugs: [],
          params: { textModel: 'gpt-4o-mini' },
        });
        videoScriptStatus = videoScript.status || '';
        videoScriptMessage = [videoScript.script, videoScript.error].filter(Boolean).join('\n');
      } catch (error) {
        videoScriptMessage = error instanceof Error ? error.message : String(error);
      }

      const video = await api.generateVideo({
        workspacePath,
        imageAssetRefs: [],
        videoAssetRefs: [],
        prompt: 'Playwright 视频队列提示词',
        script: 'Playwright 视频脚本',
        citations,
        selectedSkillSlugs: [],
        params: { videoModel: 'veo-3.1', aspectRatio: '4:5', durationSeconds: 12 },
      });

      const logs = await api.listGenerationLogs(workspacePath);
      return {
        knowledgeBaseCount: knowledgeBases.length,
        searchResultCount: searchResults.length,
        citationCount: citations.length,
        promptPackBlocked: promptPackError.includes('文字模型未配置'),
        articleBlocked: articleError.includes('文字模型未配置'),
        imageStatus: image.status,
        imageAssetCount: image.assetRefs.length,
        videoBreakdownBlocked: videoBreakdownError.includes('真实视频理解模型未配置'),
        videoScriptBlocked: (videoScriptStatus === 'blocked' || videoScriptStatus === '') && videoScriptMessage.includes('文字模型未配置'),
        videoStatus: video.status,
        videoAssetCount: video.assetRefs.length,
        logsCount: logs.length,
        logStatuses: Array.from(new Set(logs.map((log) => log.status))).sort(),
        logKinds: Array.from(new Set(logs.map((log) => log.kind))).sort(),
      };
    }, workspaceDir);

    expect(result.knowledgeBaseCount).toBeGreaterThanOrEqual(1);
    expect(result.searchResultCount).toBeGreaterThanOrEqual(1);
    expect(result.citationCount).toBeGreaterThanOrEqual(1);
    expect(result.promptPackBlocked).toBe(true);
    expect(result.articleBlocked).toBe(true);
    expect(result.imageStatus).toBe('blocked');
    expect(result.imageAssetCount).toBe(0);
    expect(result.videoBreakdownBlocked).toBe(true);
    expect(result.videoScriptBlocked).toBe(true);
    expect(result.videoStatus).toBe('blocked');
    expect(result.videoAssetCount).toBeGreaterThanOrEqual(1);
    expect(result.logsCount).toBeGreaterThanOrEqual(5);
    expect(result.logStatuses).toEqual(expect.arrayContaining(['blocked']));
    expect(result.logKinds).toEqual(expect.arrayContaining(['article', 'image', 'prompt-pack', 'video', 'video-breakdown', 'video-script']));
  });
});

test('文章生成通过本地文字 Provider mock 生成正文并记录成功日志', async ({}, testInfo) => {
  test.setTimeout(180_000);

  const { server, baseUrl } = await startFakeOpenAITextServer((prompt) => {
    if (prompt.includes('"task": "generate_article"')) {
      return {
        titleCandidates: ['把便携营养讲成人话', '从真实场景讲清营养补充', '办公人群如何理解便携条包'],
        outline: ['先界定用户顾虑', '引用知识库事实', '展开早餐后场景', '展开办公室场景', '说明表达边界', '给出发布检查'],
        summary: '基于产品知识库引用生成克制、可复核的长文草稿。',
        markdown: [
          '# 把便携营养讲成人话',
          '',
          '很多办公人群并不排斥营养补充，真正让他们犹豫的是表达太夸张、使用动作太复杂，以及看不到日常场景里的真实位置。',
          '',
          '这篇文章先从知识库里的事实出发：产品是便携条包，适合早餐后或办公室抽屉备用。这个事实比泛泛说“更健康”更可靠，也更容易被用户理解。',
          '',
          '早餐后的场景不需要被包装成仪式感。更自然的表达是：吃完早餐、准备出门前，把条包放进包里，减少忘记携带的概率。',
          '',
          '办公室场景也一样。抽屉备用、午后查看、需要时取用，这些动作能说明便携价值，但不能扩展成任何医疗化或绝对化承诺。',
          '',
          '内容口吻应当专业、自然、克制。先讲使用阻力，再讲产品形态如何降低阻力，最后提醒读者根据自己的饮食和作息安排做判断。',
          '',
          '如果要继续扩展，可以把用户问题拆成三个层次：为什么会忘、什么场景最容易坚持、哪些表达必须避免越界。这样文章既能提供判断，也不会把产品写成万能答案。',
          '',
          '发布前还要检查引用是否清楚、边界是否明确、是否出现治疗暗示，以及是否把单一场景夸大成普遍结果。',
        ].join('\n'),
        publishCheck: [
          { level: 'info', message: '已基于知识库事实展开早餐后和办公室场景。' },
          { level: 'warning', message: '发布前复核是否存在医疗化或绝对化表达。' },
          { level: 'info', message: '标题和正文保持克制表达。' },
        ],
      };
    }
    return fakeBusinessChainTextOutput(prompt);
  });

  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      const setup = await page.evaluate(async ({ workspacePath, endpoint }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.saveModelConfig({
          textProtocol: 'openai-chat',
          textApiEndpoint: endpoint,
          textApiKey: 'test-text-key',
          textModel: 'test-text-model',
        });
        await api.installBuiltinKnowledgeBase('product-demo', workspacePath);
        const config = await api.getModelConfig();
        const searchResults = await api.searchKnowledge({
          workspacePath,
          query: '早餐 办公 便携 合规',
          baseType: 'product-kb',
          sectionType: 'all',
        });
        const citations = searchResults.slice(0, 4).map((item) => ({
          knowledgeBaseId: item.knowledgeBaseId,
          sectionId: item.section.id,
          title: `${item.baseTitle} / ${item.section.title}`,
          sectionType: item.section.sectionType,
          excerpt: (item.section.content || item.section.summary || item.section.title).slice(0, 650),
        }));
        return {
          provider: {
            textProtocol: config.textProtocol,
            textApiEndpoint: config.textApiEndpoint,
            textModel: config.textModel,
            hasTextApiKey: config.hasTextApiKey,
          },
          citationCount: citations.length,
        };
      }, { workspacePath: workspaceDir, endpoint: baseUrl });

      expect(setup.provider).toMatchObject({
        textProtocol: 'openai-chat',
        textApiEndpoint: baseUrl,
        textModel: 'test-text-model',
        hasTextApiKey: true,
      });
      expect(setup.citationCount).toBeGreaterThanOrEqual(1);
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待文章测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);
      await openArticleWorkbenchFromAgents(page);
    await page.locator('.article-editor-panel input').filter({ hasText: '' }).first().waitFor({ state: 'attached' });
    await page.locator('.article-editor-panel label').filter({ hasText: '目标读者' }).locator('input').fill('关注健康管理但讨厌夸张营销的办公人群');
    await page.locator('.article-editor-panel label').filter({ hasText: '主题' }).locator('input').fill('便携营养补充产品如何讲清真实使用场景');
    await page.locator('.article-editor-panel label').filter({ hasText: '口吻' }).locator('input').fill('专业、自然、克制');
    await page.locator('.article-editor-panel textarea').fill('必须基于引用事实写作，正文不少于 6 个自然段，避免医疗化和绝对化承诺。');
    await clickButton(page, '生成大纲 / 正文 / 发布检查');
    await expect(page.locator('.article-rendered')).toBeVisible({ timeout: 60_000 });
    await expect(page.locator('.article-rendered h2')).toHaveCount(1);
    await expect(page.locator('.article-preview pre')).toHaveCount(0);

    const result = await page.evaluate(async (workspacePath) => {
      const logs = await window.contentStudio.listGenerationLogs(workspacePath);
      const articleLog = logs.find((log) => log.kind === 'article' && log.status === 'succeeded');
      const output = articleLog?.output || {};
      return {
        article: {
          logId: articleLog?.id ?? '',
          titleCandidates: Array.isArray(output.titleCandidates) ? output.titleCandidates : [],
          outline: Array.isArray(output.outline) ? output.outline : [],
          summary: typeof output.summary === 'string' ? output.summary : '',
          markdown: typeof output.markdown === 'string' ? output.markdown : '',
          publishCheck: Array.isArray(output.publishCheck) ? output.publishCheck : [],
        },
        articleLog: articleLog ? {
          kind: articleLog.kind,
          status: articleLog.status,
          model: articleLog.model,
          error: articleLog.error ?? '',
        } : null,
      };
    }, workspaceDir);

    expect(result.article.logId).toBeTruthy();
    expect(result.article.titleCandidates.length).toBeGreaterThanOrEqual(3);
    expect(result.article.outline.length).toBeGreaterThanOrEqual(4);
    expect(result.article.summary.length).toBeGreaterThan(12);
    expect(result.article.markdown).toContain('#');
    expect(result.article.markdown.length).toBeGreaterThan(300);
    expect(result.article.publishCheck.length).toBeGreaterThanOrEqual(2);
    expect(result.article.titleCandidates.length).toBeLessThanOrEqual(3);
    expect(result.article.publishCheck.length).toBeLessThanOrEqual(4);
    expect(result.articleLog).toMatchObject({
      kind: 'article',
      status: 'succeeded',
      error: '',
    });
    expect([setup.provider.textModel, 'gpt-4o-mini']).toContain(result.articleLog.model);

    const articleLayout = await page.evaluate(() => {
      const workbench = document.querySelector('.article-workbench');
      const canvas = document.querySelector('.article-agent-canvas');
      const thread = document.querySelector('.article-agent-thread');
      const stageList = document.querySelector('.article-agent-stage-list');
      const rendered = document.querySelector('.article-rendered');
      if (!workbench || !canvas || !thread || !stageList || !rendered) return { ok: false };
      return {
        ok: true,
        workbenchHeight: Math.round(workbench.getBoundingClientRect().height),
        canvasHeight: Math.round(canvas.getBoundingClientRect().height),
        threadHeight: Math.round(thread.getBoundingClientRect().height),
        stageListHeight: Math.round(stageList.getBoundingClientRect().height),
        renderedHeight: Math.round(rendered.getBoundingClientRect().height),
      };
    });
    expect(articleLayout.ok, JSON.stringify(articleLayout)).toBe(true);
    expect(articleLayout.workbenchHeight, JSON.stringify(articleLayout)).toBeGreaterThan(620);
    expect(articleLayout.canvasHeight, JSON.stringify(articleLayout)).toBeGreaterThan(420);
    expect(articleLayout.threadHeight, JSON.stringify(articleLayout)).toBeGreaterThan(220);
    expect(articleLayout.renderedHeight, JSON.stringify(articleLayout)).toBeGreaterThan(360);
    await clickButton(page, 'Markdown');
    await expect(page.locator('.article-preview pre')).toContainText('#');
    await clickButton(page, '预览');
    await expect(page.locator('.article-rendered')).toBeVisible();
    await clickButton(page, '导出草稿包');
    await expect(page.locator('.article-preview')).toContainText('平台草稿包已导出', { timeout: 20_000 });
    await expect(page.locator('.article-draft-history')).toContainText('把便携营养讲成人话', { timeout: 20_000 });
    await expect(page.locator('.article-draft-history')).toContainText('复制发布文案');
    await page.locator('.article-draft-history button').filter({ hasText: '复制发布文案' }).click();
    await expect(page.locator('.article-draft-history')).toContainText('已复制');
    await expect(page.locator('.article-draft-history')).toContainText('来源记录');
    await page.locator('.article-draft-toolbar input').fill('健康管理');
    await expect(page.locator('.article-draft-history')).toContainText('把便携营养讲成人话');
    await page.locator('.article-draft-toolbar input').fill('完全不存在的草稿');
    await expect(page.locator('.article-draft-history')).toContainText('没有匹配的草稿包');
    await page.locator('.article-draft-toolbar input').fill('');
    await page.locator('.article-draft-toolbar button').filter({ hasText: '公众号' }).click();
    await expect(page.locator('.article-draft-history')).toContainText('把便携营养讲成人话');
    const draftExport = await page.evaluate(async (workspacePath) => {
      const logs = await window.contentStudio.listGenerationLogs(workspacePath);
      const articleLog = logs.find((log) => log.kind === 'article' && log.status === 'succeeded');
      const refs = articleLog?.artifactRefs ?? [];
      const drafts = await window.contentStudio.listPlatformDrafts(workspacePath);
      return {
        manifestPath: refs.find((ref) => /platform-drafts\/.*manifest\.json$/.test(ref)) ?? '',
        markdownPath: refs.find((ref) => /platform-drafts\/.*draft\.md$/.test(ref)) ?? '',
        platformCopyPath: refs.find((ref) => /platform-drafts\/.*platform-copy\.txt$/.test(ref)) ?? '',
        recordCount: drafts.length,
        recordTitle: drafts[0]?.title ?? '',
      };
    }, workspaceDir);
    expect(draftExport.manifestPath, JSON.stringify(draftExport)).toBeTruthy();
    expect(draftExport.markdownPath, JSON.stringify(draftExport)).toBeTruthy();
    expect(draftExport.platformCopyPath, JSON.stringify(draftExport)).toBeTruthy();
    expect(existsSync(draftExport.manifestPath)).toBe(true);
    expect(existsSync(draftExport.markdownPath)).toBe(true);
    expect(existsSync(draftExport.platformCopyPath)).toBe(true);
    expect(draftExport.recordCount).toBeGreaterThanOrEqual(1);
    expect(draftExport.recordTitle).toBe('把便携营养讲成人话');
    await clickButton(page, '复制正文');
    await expect(page.locator('.article-actions button').filter({ hasText: '已复制' })).toBeVisible();
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('爆款视频拆解五阶段工作台使用真实 blocked 分支，不伪造视频结果', async ({}, testInfo) => {
  await withContentStudio(testInfo, async ({ page, workspaceDir, e2eProductAssetPath }) => {
    await page.evaluate(async ({ workspacePath }) => {
      const api = window.contentStudio;
      await api.saveSettings({ workspacePath });
      await api.installBuiltinKnowledgeBase('product-demo', workspacePath);
    }, { workspacePath: workspaceDir, productAssetPath: e2eProductAssetPath });
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待工作区保存后重新加载工作台', timeout: 20_000 },
    ).toBe(true);

    await clickButton(page, '视频生成');
    await expect(page.locator('.video-replica-workbench')).toBeVisible();
    await expect(page.locator('.video-replica-workbench > .v2-feature-hero')).toHaveCount(0);
    await expect(page.locator('.video-replica-workbench > .module-command-center')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '爆款视频拆解与脚本工厂' })).toBeVisible();
    await expect(page.locator('.video-stage-tabs button')).toHaveCount(5);
    await expect(page.locator('.video-stage-tabs button').nth(0)).toContainText('分析控制台');
    await expect(page.locator('.video-stage-tabs button').nth(1)).toContainText('爆款特征库');
    await expect(page.locator('.video-stage-tabs button').nth(2)).toContainText('脚本改写');
    await expect(page.locator('.video-stage-tabs button').nth(3)).toContainText('脚本历史');
    await expect(page.locator('.video-stage-tabs button').nth(4)).toContainText('Prompt 交接');

    await expect(page.getByRole('heading', { name: '参考视频导入' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '片段拆解结果' })).toBeVisible();
    const videoDimensionCount = await page.locator('.video-dimension-grid button').count();
    expect(videoDimensionCount).toBeGreaterThan(0);
    await expect(page.locator('.video-summary-row')).toContainText('智能拆解');
    await assertVideoWorkbenchLayout(page);

    await clickVideoAction(page, '智能拆解');
    await expect(page.getByText('请先选择本地视频或粘贴参考视频链接')).toBeVisible();
    await expect(page.locator('.video-dimension-grid button.active')).toHaveCount(videoDimensionCount);

    await clickVideoStageTab(page, '脚本改写');
    await expect(page.getByRole('heading', { name: '脚本改写参数' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '脚本协作' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '新视频脚本' })).toBeVisible();
    await expect(page.locator('.video-script-agent-card')).toBeVisible();
    await expect(page.locator('.video-script-agent-thread .agent-turn.user')).toContainText('产品：新产品');
    await expect(page.locator('.video-script-agent-strip')).toContainText('镜头');
    await expect(page.locator('.video-product-card input').first()).toHaveValue('新产品');
    await expect(page.locator('.video-upload-callout')).toContainText('上传产品图');
    await clickVideoAction(page, '选择图片');
    await expect(page.locator('.video-upload-callout input[type="checkbox"]')).toBeChecked();
    await assertVideoWorkbenchLayout(page);

    await clickVideoAction(page, '生成分镜脚本');
    await expect(page.getByText('文字模型未配置，未生成本地模板。', { exact: true })).toBeVisible();
    await expect(page.locator('.video-script-card')).toContainText('新产品脚本生成未完成');
    await expect(page.locator('.video-script-card')).toContainText('文字模型未配置，未生成本地模板。');

    await clickVideoStageTab(page, 'Prompt 交接');
    await expect(page.getByRole('heading', { name: '视频 Prompt 使用的素材' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '内容生产交接' })).toBeVisible();
    await expect(page.locator('.video-material-list')).toContainText('hero-product.png');
    await expect(page.locator('.video-prompt-card')).toContainText('视频 Prompt 交接');
    await assertVideoWorkbenchLayout(page);

    await clickVideoAction(page, '打开视频 Prompt 交接');
    const promptPanel = page.locator('.video-prompt-builder-panel');
    await expect(promptPanel).toBeVisible({ timeout: 20_000 });
    await expect(promptPanel.locator('.agent-session-head h3')).toContainText('Prompt 交接');
    await expect(page.locator('.video-prompt-preview pre')).toContainText('软件只生成可复制到第三方视频平台的视频 Prompt');
    await expect(page.locator('.video-prompt-handoff-card')).toContainText('未复制');

    const handoffTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const sources = await api.listInputSources(workspacePath);
      const drafts = await api.listPromptDrafts(workspacePath);
      const draft = drafts.find((item) => item.title.includes('Prompt 交接'));
      const source = sources.find((item) => draft?.inputSourceIds.includes(item.id));
      return {
        draftTitle: draft?.title ?? '',
        draftPurpose: draft?.purpose ?? '',
        draftStatus: draft?.status ?? '',
        sourcePurpose: source?.purpose ?? '',
        sourceTags: source?.tags ?? [],
        sourceText: source?.extractedText ?? '',
      };
    }, workspaceDir);
    expect(handoffTrace.draftTitle, JSON.stringify(handoffTrace)).toContain('Prompt 交接');
    expect(handoffTrace.draftPurpose, JSON.stringify(handoffTrace)).toBe('video');
    expect(handoffTrace.draftStatus, JSON.stringify(handoffTrace)).toBe('confirmed');
    expect(handoffTrace.sourcePurpose, JSON.stringify(handoffTrace)).toBe('task-input');
    expect(handoffTrace.sourceTags, JSON.stringify(handoffTrace)).toEqual(expect.arrayContaining(['video-prompt', '视频交接']));
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('第三方生成后的成品视频需要由用户手动导入');

    await clickButton(page, '视频生成');
    await clickVideoStageTab(page, 'Prompt 交接');
    await clickVideoAction(page, '内部生成');
    await expect(page.locator('.result-card.blocked')).toBeVisible();
    await expect(page.locator('.result-card.blocked')).toContainText(/视频生成服务未配置|视频 provider 未配置/);
    await expect(page.locator('.video-cost-estimate')).toContainText('内部 API 成本估算');
    await expect(page.locator('.video-cost-estimate')).toContainText('18s × ¥2.00/秒');
    await expect(page.locator('.video-history-card')).toContainText('内容生产交接');
    await expect(page.locator('.video-prompt-card')).toContainText('视频 Prompt 交接');

    const logs = await page.evaluate(async (workspacePath) => {
      const entries = await window.contentStudio.listGenerationLogs(workspacePath);
      return entries.map((entry) => ({
        kind: entry.kind,
        status: entry.status,
        error: entry.error ?? '',
        assetRefs: Array.isArray(entry.output?.assetRefs) ? entry.output.assetRefs : [],
        costEstimate: entry.output?.costEstimate ?? null,
      }));
    }, workspaceDir);
    expect(logs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'video-script', status: 'blocked' }),
      expect.objectContaining({ kind: 'video', status: 'blocked' }),
    ]));
    expect(logs.some((entry) => entry.kind === 'video-breakdown')).toBe(false);
    const videoLog = logs.find((entry) => entry.kind === 'video');
    expect(videoLog?.assetRefs.length, JSON.stringify(logs)).toBeGreaterThanOrEqual(1);
    expect(videoLog?.assetRefs.some((assetRef) => assetRef.endsWith('.json')), JSON.stringify(videoLog)).toBe(true);
    expect(videoLog?.costEstimate?.estimatedCost, JSON.stringify(videoLog)).toBe(36);
    expect(videoLog?.costEstimate?.source, JSON.stringify(videoLog)).toBe('default-internal-api');
  });
});

test('爆款视频拆解 UI 成功链路会写入特征库并保留 Provider 协议字段', async ({}, testInfo) => {
  test.setTimeout(90_000);

  let capturedRequest;
  const server = createServer((request, response) => {
    if (request.url === '/understand' && request.method === 'POST') {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => {
        capturedRequest = {
          authorization: request.headers.authorization ?? '',
          body: JSON.parse(body),
        };
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          contentTitle: 'E2E 厨房油污拆解',
          platform: 'local-fixture',
          durationSec: 12,
          summary: '前 3 秒用厨房油污痛点提问，随后用喷雾过程证明效果。',
          dimensions: capturedRequest.body.dimensions,
          segments: [
            {
              timeRange: '00:00-00:03',
              hook: '痛点提问',
              visual: '油污灶台特写。',
              voiceover: '你家灶台是不是也这样？',
              subtitle: '厨房油污',
              rhythm: '强钩子',
              reusablePoint: '用真实污渍特写快速建立问题。',
              shotType: 'close_up',
            },
            {
              timeRange: '00:03-00:07',
              hook: '效果证明',
              visual: '喷雾覆盖油污并溶解。',
              voiceover: '喷一下，等五秒。',
              subtitle: '5 秒起效',
              rhythm: '演示',
              reusablePoint: '用过程镜头证明卖点。',
              shotType: 'product_demo',
            },
          ],
          transcriptSegments: [
            { startSec: 0, endSec: 3, text: '你家灶台是不是也这样？' },
            { startSec: 3, endSec: 7, text: '喷一下，等五秒。' },
          ],
          hook: {
            hookType: { value: 'pain_point_question', confidence: 0.9, reasoning: '开头直接提问厨房油污痛点。' },
            elements: [{ name: '痛点提问', description: '生活化问题唤起代入。', timestampRange: '00:00-00:03' }],
            emotionCurve: [{ timestampSec: 0, emotion: 'anxiety', intensity: 80 }],
          },
          narrative: {
            framework: { value: 'PSP', confidence: 0.86, reasoning: '痛点、方案、证明顺序完整。' },
            stages: [{ name: '痛点', timeRange: '00:00-00:03', description: '展示油污难清理。' }],
          },
          pacing: {
            avgCutsPerSecond: 0.5,
            avgShotDurationSec: 3,
            wordsPerMinute: 160,
            rhythm: [
              { timeRange: '00:00-00:03', shotType: 'close_up', intensity: 8, description: '油污灶台特写。', voiceover: '你家灶台是不是也这样？' },
              { timeRange: '00:03-00:07', shotType: 'product_demo', intensity: 7, description: '喷雾覆盖油污并溶解。', voiceover: '喷一下，等五秒。' },
            ],
          },
          viralScores: {
            hookStrength: { score: 8.4, reasoning: '痛点明确。' },
            narrativeTension: { score: 7.6, reasoning: '问题到证明路径清晰。' },
            pacingQuality: { score: 7.8, reasoning: '镜头节奏适合短视频。' },
            emotionDesign: { score: 7.2, reasoning: '焦虑到信任的转折可见。' },
            ctaEffectiveness: { score: 6.5, reasoning: '转化引导较弱。' },
          },
          resourceFramework: {
            characters: [{ name: '宝妈', shotCount: 1, voiceTraits: '自然可信', threeViewPrompt: '宝妈角色三视图。' }],
            scenes: [{ name: '厨房', shotCount: 2, environment: '现代厨房', lighting: '暖色自然光', sceneImagePrompt: '现代厨房背景图。' }],
          },
          confidenceRate: 0.88,
          richnessRate: 0.9,
          referenceScore: 7.5,
          reusableFormula: ['痛点提问 -> 产品演示 -> 效果证明'],
          risks: [{ level: 'warning', message: '起效时间需要依据。' }],
        }));
      });
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  const configDir = await mkdtemp(join(tmpdir(), 'content-studio-video-understand-model-'));
  const modelConfigPath = join(configDir, 'model-config.json');
  await writeFile(modelConfigPath, JSON.stringify({
    videoProvider: 'generic-http',
    videoApiEndpoint: `http://127.0.0.1:${server.address().port}/understand`,
    videoApiKeyPlain: 'test-video-understanding-key',
    videoModel: 'test-video-understanding-model',
    videoModels: ['test-video-understanding-model'],
    textModel: 'test-text-model',
    textModels: ['test-text-model'],
  }, null, 2));

  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async (workspacePath) => {
        await window.contentStudio.saveSettings({ workspacePath });
      }, workspaceDir);
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待工作区保存后重新加载工作台', timeout: 20_000 },
      ).toBe(true);

      await clickButton(page, '视频生成');
      await page.locator('.video-drop-zone').click();
      await expect(page.locator('.video-file-list')).toContainText('third-party-finished-video.mp4');
      await clickVideoAction(page, '智能拆解');
      await expect(page.locator('.video-breakdown-report')).toContainText('E2E 厨房油污拆解');
      await expect(page.locator('.video-score-strip')).toContainText('2 条');

      await clickVideoStageTab(page, '爆款特征库');
      await expect(page.locator('.video-feature-grid')).toContainText('E2E 厨房油污拆解');
      await expect(page.locator('.video-feature-detail')).toContainText('总资源框架');
      await expect(page.locator('.video-feature-detail')).toContainText('起效时间需要依据');

      const trace = await page.evaluate(async (workspacePath) => {
        const logs = await window.contentStudio.listGenerationLogs(workspacePath);
        const log = logs.find((item) => item.kind === 'video-breakdown' && item.status === 'succeeded');
        return {
          title: log?.title ?? '',
          sourceType: log?.input?.sourceType ?? '',
          dimensions: log?.input?.dimensions ?? [],
          artifactRefs: log?.artifactRefs ?? [],
          outputTitle: log?.output?.contentTitle ?? '',
        };
      }, workspaceDir);
      expect(trace.title, JSON.stringify(trace)).toBe('视频拆解结果');
      expect(trace.sourceType, JSON.stringify(trace)).toBe('file');
      expect(trace.dimensions, JSON.stringify(trace)).toEqual(expect.arrayContaining(['开头钩子', '钩子评分']));
      expect(trace.artifactRefs.join('\n'), JSON.stringify(trace)).toContain('third-party-finished-video.mp4');
      expect(trace.outputTitle, JSON.stringify(trace)).toBe('E2E 厨房油污拆解');

      expect(capturedRequest?.authorization, JSON.stringify(capturedRequest)).toBe('Bearer test-video-understanding-key');
      expect(capturedRequest?.body.operation, JSON.stringify(capturedRequest)).toBe('analyze');
      expect(capturedRequest?.body.source_type, JSON.stringify(capturedRequest)).toBe('file');
      expect(capturedRequest?.body.model, JSON.stringify(capturedRequest)).toBe('test-video-understanding-model');
      expect(capturedRequest?.body.source, JSON.stringify(capturedRequest)).toContain('third-party-finished-video.mp4');
      expect(capturedRequest?.body.dimensions, JSON.stringify(capturedRequest)).toEqual(expect.arrayContaining(['开头钩子', '钩子评分']));
    }, { modelConfigPath });
  } finally {
    await rm(configDir, { recursive: true, force: true });
    await new Promise((resolve) => server.close(resolve));
  }
});

test('爆款特征库展示完整拆解详情并可作为脚本模板', async ({}, testInfo) => {
  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    const dataDir = join(workspaceDir, '.content-studio');
    const breakdownOutput = {
      contentTitle: '厨房油污开场分析',
      platform: '抖音',
      durationSec: 18,
      summary: '前 3 秒用重油污特写制造痛点，随后用喷雾溶解过程证明清洁效果。',
      dimensions: ['Hook结构', '叙事结构', '节奏镜头', '资源框架'],
      segments: [
        {
          timeRange: '00:00-00:03',
          hook: '痛点提问',
          visual: '灶台油污特写。',
          voiceover: '你家灶台是不是也这样？',
          subtitle: '厨房油污',
          rhythm: '强钩子',
          reusablePoint: '用真实污渍特写快速建立问题。',
          shotType: 'close_up',
          intensity: 88,
        },
        {
          timeRange: '00:03-00:08',
          hook: '效果证明',
          visual: '喷雾覆盖油污并开始溶解。',
          voiceover: '喷一下，等五秒。',
          subtitle: '5 秒起效',
          rhythm: '演示',
          reusablePoint: '用过程镜头证明卖点。',
          shotType: 'product_demo',
          intensity: 76,
        },
      ],
      transcript: '你家灶台是不是也这样？喷一下，等五秒。',
      transcriptSegments: [
        { startSec: 0, endSec: 3, text: '你家灶台是不是也这样？' },
        { startSec: 3, endSec: 8, text: '喷一下，等五秒。' },
      ],
      hook: {
        hookType: { value: 'pain_point_question', confidence: 0.91, reasoning: '开头直接提出厨房油污痛点问题。' },
        elements: [
          { name: '痛点提问', description: '用生活化问题唤起代入。', timestampRange: '00:00-00:03' },
          { name: '结果承诺', description: '用 5 秒起效承诺引导继续观看。', timestampRange: '00:03-00:05' },
        ],
        emotionCurve: [
          { timestampSec: 0, emotion: 'anxiety', intensity: 82 },
          { timestampSec: 4, emotion: 'curiosity', intensity: 68 },
          { timestampSec: 8, emotion: 'trust', intensity: 74 },
        ],
      },
      narrative: {
        framework: { value: 'PSP', confidence: 0.87, reasoning: '先痛点，再给方案，最后用清洁过程证明。' },
        stages: [
          { name: '痛点', timeRange: '00:00-00:03', description: '展示油污难清理。', emotionShift: '焦虑上升' },
          { name: '方案', timeRange: '00:03-00:08', description: '产品喷雾进入画面。', emotionShift: '好奇转信任' },
        ],
      },
      pacing: {
        avgCutsPerSecond: 0.55,
        avgShotDurationSec: 2.8,
        wordsPerMinute: 180,
        rhythm: [
          {
            timeRange: '00:00-00:03',
            shotType: 'close_up',
            intensity: 88,
            description: '灶台油污特写。',
            voiceover: '你家灶台是不是也这样？',
            character: '宝妈',
            scene: '厨房',
            cameraMovement: '固定特写',
          },
          {
            timeRange: '00:03-00:08',
            shotType: 'product_demo',
            intensity: 76,
            description: '喷雾覆盖油污并溶解。',
            voiceover: '喷一下，等五秒。',
            character: '宝妈',
            scene: '厨房',
            cameraMovement: '俯拍推进',
          },
        ],
      },
      timeline: [
        { timestampSec: 0, label: '油污痛点', emotionLabel: '焦虑', intensity: 82 },
        { timestampSec: 5, label: '溶解证明', emotionLabel: '信任', intensity: 74 },
      ],
      scenes: [
        {
          timestampSec: 0,
          shotType: 'close_up',
          character: '宝妈',
          characterAction: '指向油污',
          scene: '厨房',
          cameraMovement: '固定特写',
          description: '灶台油污特写。',
          objects: ['灶台', '油污'],
          voiceover: '你家灶台是不是也这样？',
        },
      ],
      viralScores: {
        hookStrength: { score: 8.6, reasoning: '痛点明确，前 3 秒冲突清楚。' },
        narrativeTension: { score: 7.8, reasoning: '问题到证明路径完整。' },
        pacingQuality: { score: 8.1, reasoning: '镜头短，演示节奏清晰。' },
        emotionDesign: { score: 7.5, reasoning: '焦虑到信任的情绪转折可追踪。' },
        ctaEffectiveness: { score: 6.9, reasoning: '转化引导偏弱。' },
      },
      resourceFramework: {
        characters: [{ name: '宝妈', shotCount: 2, voiceTraits: '自然可信', threeViewPrompt: '宝妈角色三视图，真实居家风格。' }],
        scenes: [{ name: '厨房', shotCount: 2, environment: '现代厨房', lighting: '暖色自然光', sceneImagePrompt: '现代厨房背景图，灶台区域干净真实。' }],
      },
      overallConfidence: 0.88,
      confidenceRate: 0.88,
      richnessRate: 0.92,
      referenceScore: 8.0,
      reusableFormula: ['痛点特写 -> 产品进入 -> 过程证明 -> 结果承诺'],
      risks: [{ level: 'warning', message: '起效时间需要实验依据。' }],
      warnings: ['不要暗示绝对杀菌效果。'],
    };
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'generation-logs.json'), JSON.stringify([{
      id: 'fixture-video-breakdown-detail',
      workspacePath: workspaceDir,
      workflowRunId: 'fixture-breakdown-detail-run',
      kind: 'video-breakdown',
      title: breakdownOutput.contentTitle,
      summary: breakdownOutput.summary,
      status: 'succeeded',
      model: 'gemini-2.5-flash',
      input: { source: '/tmp/kitchen-cleaning-reference.mp4' },
      output: breakdownOutput,
      artifactRefs: ['/tmp/kitchen-cleaning-reference.mp4'],
      createdAt: '2026-06-04T09:00:00.000Z',
      updatedAt: '2026-06-04T09:00:00.000Z',
    }], null, 2));

    await page.evaluate(async (workspacePath) => {
      await window.contentStudio.saveSettings({ workspacePath });
    }, workspaceDir);
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待爆款特征 fixture 工作区加载', timeout: 20_000 },
    ).toBe(true);

    await clickButton(page, '视频生成');
    await clickVideoStageTab(page, '爆款特征库');
    await expect(page.locator('.video-feature-grid')).toContainText('厨房油污开场分析');
    await expect(page.locator('.video-feature-detail')).toContainText('五维评分依据');
    await expect(page.locator('.video-feature-detail')).toContainText('Hook 分析');
    await expect(page.locator('.video-feature-detail')).toContainText('情绪');
    await expect(page.locator('.video-feature-detail')).toContainText('叙事结构');
    await expect(page.locator('.video-feature-detail')).toContainText('镜头拆解');
    await expect(page.locator('.video-feature-detail')).toContainText('总资源框架');
    await expect(page.locator('.video-feature-detail')).toContainText('时间线证据');
    await expect(page.locator('.video-feature-detail')).toContainText('语音转写');
    await expect(page.locator('.video-feature-detail')).toContainText('可复用公式');
    await expect(page.locator('.video-feature-detail')).toContainText('风险与提醒');
    await expect(page.locator('.video-feature-detail')).toContainText('宝妈角色三视图');
    await expect(page.locator('.video-feature-detail')).toContainText('起效时间需要实验依据');
    await assertVideoWorkbenchLayout(page);

    await page.locator('.video-feature-curation-actions button').filter({ hasText: '设为精选' }).click();
    await expect(page.locator('.video-feature-tags')).toContainText('精选');
    await expect.poll(async () => page.evaluate(async (workspacePath) => {
      const logs = await window.contentStudio.listGenerationLogs(workspacePath);
      return logs.find((item) => item.id === 'fixture-video-breakdown-detail')?.review?.rating ?? '';
    }, workspaceDir), { message: '等待爆款特征精选状态写入本地日志', timeout: 20_000 }).toBe('useful');

    await page.locator('.video-feature-curation-actions button').filter({ hasText: /^归档$/ }).click();
    await expect.poll(async () => page.evaluate(async (workspacePath) => {
      const logs = await window.contentStudio.listGenerationLogs(workspacePath);
      return logs.find((item) => item.id === 'fixture-video-breakdown-detail')?.review?.rating ?? '';
    }, workspaceDir), { message: '等待爆款特征归档状态写入本地日志', timeout: 20_000 }).toBe('needs-rework');
    await expect(page.locator('.video-feature-grid')).toContainText('还没有爆款特征');
    await page.locator('.video-filter-group button').filter({ hasText: '已归档' }).click();
    await expect(page.locator('.video-feature-grid')).toContainText('厨房油污开场分析');
    await page.locator('.video-feature-curation-actions button').filter({ hasText: '恢复可用' }).click();
    await expect.poll(async () => page.evaluate(async (workspacePath) => {
      const logs = await window.contentStudio.listGenerationLogs(workspacePath);
      return logs.find((item) => item.id === 'fixture-video-breakdown-detail')?.review?.rating ?? '';
    }, workspaceDir), { message: '等待爆款特征恢复状态写入本地日志', timeout: 20_000 }).toBe('');
    await page.locator('.video-filter-group button').filter({ hasText: /^可用$/ }).click();
    await expect(page.locator('.video-feature-grid')).toContainText('厨房油污开场分析');

    await page.locator('.video-feature-detail .primary').filter({ hasText: '改写脚本' }).click();
    await expect(page.getByRole('heading', { name: '脚本改写参数' })).toBeVisible();
    await expect(page.locator('.video-product-card')).toContainText('厨房油污开场分析');
    await expect(page.locator('.video-sync-note')).toContainText('2 镜');
  });
});

test('视频脚本历史可保存反馈并进入 Prompt 交接', async ({}, testInfo) => {
  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    const dataDir = join(workspaceDir, '.content-studio');
    const scriptOutput = {
      title: '植物清洁喷雾厨房去油脚本',
      script: '镜头1：油污灶台特写。\n镜头2：喷雾覆盖油污。',
      storyboard: [
        {
          shot: 1,
          timeRange: '00:00-00:03',
          shotType: 'close_up',
          visual: '油污灶台特写。',
          voiceover: '厨房油污不只是脏。',
          subtitle: '油污残留',
          rhythm: '强钩子',
          imagePrompt: '现代厨房灶台油污特写。',
          videoPrompt: '写实厨房灶台油污特写，自然光，固定机位。',
        },
        {
          shot: 2,
          timeRange: '00:03-00:08',
          shotType: 'product_demo',
          visual: '喷雾覆盖油污。',
          voiceover: '喷一下等五秒。',
          subtitle: '5 秒起效',
          rhythm: '演示',
          videoPrompt: '俯拍喷雾覆盖油污，泡沫逐渐溶解。',
        },
      ],
      videoPrompt: '24 秒 9:16 写实厨房清洁短视频。',
      resourceFramework: {
        characters: [{ name: '宝妈', shotCount: 1, voiceTraits: '自然可信' }],
        scenes: [{ name: '厨房', shotCount: 2, environment: '现代厨房', lighting: '暖色自然光', sceneImagePrompt: '现代厨房，真实居家质感。' }],
      },
      publishCheck: [{ level: 'warning', message: '细菌和安全表述需提供依据。' }],
    };
    const todayBase = new Date();
    todayBase.setHours(8, 0, 0, 0);
    const yesterdayBase = new Date(todayBase);
    yesterdayBase.setDate(todayBase.getDate() - 1);
    const isoAt = (base, minutes) => new Date(base.getTime() + minutes * 60_000).toISOString();
    const linkedBreakdownLog = {
      id: 'fixture-linked-breakdown',
      workspacePath: workspaceDir,
      workflowRunId: 'fixture-linked-breakdown-run',
      kind: 'video-breakdown',
      title: '厨房油污爆款模板',
      summary: '前 3 秒痛点提问，随后做清洁效果证明。',
      status: 'succeeded',
      model: 'gemini-2.5-flash',
      input: { source: '/tmp/kitchen-template.mp4' },
      output: {
        contentTitle: '厨房油污爆款模板',
        summary: '前 3 秒痛点提问，随后做清洁效果证明。',
        dimensions: ['Hook结构', '节奏镜头'],
        segments: [
          { timeRange: '00:00-00:03', hook: '痛点提问', visual: '油污灶台特写。', voiceover: '你家灶台是不是也这样？', subtitle: '油污残留', rhythm: '强钩子', reusablePoint: '痛点提问' },
        ],
        reusableFormula: ['痛点提问 -> 产品演示 -> 效果证明'],
        risks: [],
      },
      artifactRefs: ['/tmp/kitchen-template.mp4'],
      createdAt: isoAt(todayBase, 0),
      updatedAt: isoAt(todayBase, 0),
    };
    const extraHistoryLogs = Array.from({ length: 16 }, (_, index) => {
      const createdAt = index < 9
        ? isoAt(todayBase, index)
        : isoAt(yesterdayBase, index);
      return {
        id: `fixture-video-script-extra-${index}`,
        workspacePath: workspaceDir,
        workflowRunId: `fixture-run-extra-${index}`,
        kind: 'video-script',
        title: `历史脚本 ${index + 1}`,
        summary: `历史商品 ${index + 1}`,
        status: 'succeeded',
        model: 'gpt-4o',
        input: { productName: `历史商品 ${index + 1}` },
        output: {
          ...scriptOutput,
          title: `历史脚本 ${index + 1}`,
          script: `历史脚本 ${index + 1} 的口播内容。`,
          evaluation: {
            scores: {
              hookScore: { score: 5 + (index % 5), reasoning: '测试评分。' },
              structureScore: { score: 6, reasoning: '测试评分。' },
              sellingPointScore: { score: 6, reasoning: '测试评分。' },
              voiceoverScore: { score: 6, reasoning: '测试评分。' },
              pacingScore: { score: 6, reasoning: '测试评分。' },
              totalScore: 5 + (index % 5),
            },
            suggestions: [],
          },
        },
        artifactRefs: [],
        createdAt,
        updatedAt: createdAt,
      };
    });
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, 'generation-logs.json'), JSON.stringify([{
      id: 'fixture-video-script-review',
      workspacePath: workspaceDir,
      workflowRunId: 'fixture-run-review',
      kind: 'video-script',
      title: scriptOutput.title,
      summary: '植物清洁喷雾',
      status: 'succeeded',
      model: 'gpt-4o',
      input: { productName: '植物清洁喷雾', breakdownLogId: linkedBreakdownLog.id },
      output: scriptOutput,
      artifactRefs: [`generation-log:${linkedBreakdownLog.id}`],
      createdAt: isoAt(todayBase, 30),
      updatedAt: isoAt(todayBase, 30),
    }, linkedBreakdownLog, ...extraHistoryLogs], null, 2));

    await page.evaluate(async (workspacePath) => {
      await window.contentStudio.saveSettings({ workspacePath });
    }, workspaceDir);
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待脚本历史 fixture 工作区加载', timeout: 20_000 },
    ).toBe(true);

    await clickButton(page, '视频生成');
    await clickVideoStageTab(page, '脚本历史');
    await expect(page.locator('.video-script-history-date').first()).toContainText('今天');
    await expect(page.locator('.video-history-pagination')).toContainText('已显示 15/17');
    await expect(page.locator('.video-script-history-list button')).toHaveCount(15);
    await page.locator('.video-history-pagination button').filter({ hasText: '加载更多' }).click();
    await expect(page.locator('.video-history-pagination')).toContainText('已显示 17/17');
    await expect(page.locator('.video-script-history-date').filter({ hasText: '昨天' })).toBeVisible();
    await expect(page.locator('.video-script-history-list button')).toHaveCount(17);
    await expect(page.locator('.video-script-history-detail')).toContainText('植物清洁喷雾厨房去油脚本');
    await expect(page.locator('.video-script-history-list button').first()).toContainText('模板：厨房油污爆款模板');
    await expect(page.locator('.video-script-history-detail')).toContainText('爆款模板：厨房油污爆款模板');
    await page.locator('.video-feedback-panel textarea').fill('保留开头，第二镜头需要更强前后对比。');
    await page.locator('.video-feedback-actions button').filter({ hasText: '待改' }).click();
    await expect.poll(async () => page.evaluate(async (workspacePath) => {
      const logs = await window.contentStudio.listGenerationLogs(workspacePath);
      const log = logs.find((item) => item.id === 'fixture-video-script-review');
      return {
        rating: log?.review?.rating ?? '',
        note: log?.review?.note ?? '',
      };
    }, workspaceDir), { message: '等待脚本反馈写入 generation log', timeout: 20_000 }).toMatchObject({
      rating: 'needs-rework',
      note: expect.stringContaining('第二镜头'),
    });

    await page.locator('.video-storyboard-list .tiny').first().click();
    await expect(page.locator('.video-storyboard-list .tiny').first()).toContainText('已复制');
    await page.locator('.video-card-actions button').filter({ hasText: '用于 Prompt 交接' }).click();
    await clickVideoStageTab(page, 'Prompt 交接');
    await expect(page.locator('.video-handoff-agent-panel')).toContainText('任务简报');
    await expect(page.locator('.video-handoff-agent-panel')).toContainText('脚本：植物清洁喷雾厨房去油脚本');
    await expect(page.locator('.video-handoff-agent-panel')).toContainText('交接包');
    await expect(page.locator('.video-production-checklist')).toContainText('角色参考图');
    await expect(page.locator('.video-production-checklist')).toContainText('逐镜头复制，不创建外部任务');
    await expect(page.locator('.video-production-assets')).toContainText('角色参考图 Prompt');
    await expect(page.locator('.video-production-assets')).toContainText('场景背景图 Prompt');
    await page.locator('.video-production-assets button').filter({ hasText: '复制角色 Prompt' }).first().click();
    await expect(page.locator('.video-production-assets')).toContainText('已复制');
    await page.locator('.video-production-assets button').filter({ hasText: '复制场景 Prompt' }).first().click();
    await expect(page.locator('.video-production-assets')).toContainText('已复制');
    await expect(page.locator('.video-production-segments')).toContainText('外部生成段落');
    await expect(page.locator('.video-production-segments')).toContainText('镜头 1、2');
    await page.locator('.video-production-segments button').filter({ hasText: '复制段落 Prompt' }).click();
    await expect(page.locator('.video-production-segments')).toContainText('已复制');
    await expect(page.locator('.video-production-delivery')).toContainText('审核预览');
    await expect(page.locator('.video-production-delivery')).toContainText('合成导出交付');
    await expect(page.locator('.video-production-delivery')).toContainText('细菌和安全表述需提供依据');
    await expect(page.locator('.video-production-delivery')).toContainText('手动导入成品视频');
    await expect(page.locator('.video-prompt-card')).toContainText('植物清洁喷雾厨房去油脚本');
    await expect(page.locator('.video-prompt-card')).toContainText('导入成品视频');

    await clickVideoAction(page, '打开视频 Prompt 交接');
    const readHandoffTrace = async () => page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const sources = await api.listInputSources(workspacePath);
      const drafts = await api.listPromptDrafts(workspacePath);
      const draft = drafts.find((item) => item.title.includes('Prompt 交接'));
      const source = sources.find((item) => draft?.inputSourceIds.includes(item.id));
      return {
        draftTitle: draft?.title ?? '',
        sourceId: source?.id ?? '',
        sourceText: source?.extractedText ?? '',
      };
    }, workspaceDir);
    await expect.poll(async () => (await readHandoffTrace()).sourceText, {
      message: '等待视频 Prompt 交接资料写入输入源',
      timeout: 20_000,
    }).toContain('## 外部生成段落');
    const handoffTrace = await readHandoffTrace();
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('## 外部生成段落');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('外部视频生成段落：镜头 1、2');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('导演 Prompt：');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('宝妈');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('## 角色参考图 Prompt');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('## 场景背景图 Prompt');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('现代厨房，真实居家质感。');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('## 审核预览');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('细菌和安全表述需提供依据');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('## 合成导出交付');
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('手动导入成品视频');

    await clickButton(page, '视频生成');
    await clickVideoStageTab(page, 'Prompt 交接');
    await clickVideoAction(page, '导入成品视频');
    await expect(page.locator('.video-import-workbench')).toBeVisible();
  });
});

test('图片生成成功后以预览大盘展示真实图片', async ({}, testInfo) => {
  let capturedImageRequest;
  const server = createServer((request, response) => {
    if (request.url === '/v1/responses') {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => {
        capturedImageRequest = JSON.parse(body);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
      });
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
  const baseUrl = await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('无法启动本地图片生成服务。');
      resolveListen(`http://127.0.0.1:${address.port}`);
    });
  });

  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath, endpoint }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.saveModelConfig({
          imageProvider: 'openai-responses',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: endpoint,
          imageApiKey: 'test-image-key',
          imageOuterModel: 'test-router-model',
          imageModels: ['test-image-model'],
        });
      }, { workspacePath: workspaceDir, endpoint: baseUrl });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待设置写入后重新加载工作台', timeout: 20_000 },
      ).toBe(true);

      await clickButton(page, '图片生成');
      await expect(page.getByText('图片预览大盘区 - 待命')).toBeVisible();
      await page.locator('.image-prompt-panel textarea').fill('生成一张白底护肤品主图，产品居中，干净高级。');
      await clickButton(page, '启动渲染引擎');
      await expect(page.locator('.image-generated-card')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('.image-generated-frame img')).toBeVisible();
      await page.locator('.image-prompt-panel textarea').fill('再生成一张白底护肤品主图，产品仍然居中，构图更紧凑。');
      await clickButton(page, '启动渲染引擎');
      await expect(page.locator('.image-generated-card')).toHaveCount(2, { timeout: 20_000 });
      await expect(page.locator('.asset-output-card')).toHaveCount(0);
      await expect(page.locator('.image-generated-card').first()).toContainText('单击全屏放大');
      await page.locator('.image-prompt-panel textarea').fill('@图片');
      await expect(page.locator('.image-mention-menu')).toBeVisible();
      await expect(page.locator('.image-mention-option').filter({ hasText: '生成图 1' })).toBeVisible();
      await expect(page.locator('.image-mention-option').filter({ hasText: '生成图 2' })).toBeVisible();
      await page.locator('.image-mention-option').filter({ hasText: '生成图 1' }).first().click();
      await expect(page.locator('.image-prompt-panel textarea')).toHaveValue(/@/);
      await expect(page.locator('.image-upload-panel.reference')).toContainText(/1\/6/);
      await page.locator('.image-prompt-panel textarea').fill('');
      await expect.poll(async () => page.evaluate(() => {
        const img = document.querySelector('.image-generated-frame img');
        return img instanceof HTMLImageElement && img.naturalWidth > 0 && img.naturalHeight > 0;
      }), { message: '等待本地生成图片完成解码', timeout: 10_000 }).toBe(true);
      const previewState = await page.evaluate(() => {
        const img = document.querySelector('.image-generated-frame img');
        const grid = document.querySelector('.image-generated-grid');
        const card = document.querySelector('.image-generated-card');
        if (!(img instanceof HTMLImageElement) || !grid || !card) return { ok: false };
        const gridStyle = window.getComputedStyle(grid);
        const cardRect = card.getBoundingClientRect();
        return {
          ok: true,
          naturalWidth: img.naturalWidth,
          naturalHeight: img.naturalHeight,
          gridDisplay: gridStyle.display,
          cardHeight: Math.round(cardRect.height),
        };
      });
      expect(previewState.ok, JSON.stringify(previewState)).toBe(true);
      expect(previewState.naturalWidth, JSON.stringify(previewState)).toBeGreaterThan(0);
      expect(previewState.naturalHeight, JSON.stringify(previewState)).toBeGreaterThan(0);
      expect(previewState.gridDisplay).toBe('grid');
      expect(previewState.cardHeight, JSON.stringify(previewState)).toBeGreaterThan(180);

      const firstGeneratedCard = page.locator('.image-generated-card').first();
      await firstGeneratedCard.hover();
      await firstGeneratedCard.locator('.image-generated-actions button').filter({ hasText: '详情' }).click();
      await expect(page.getByRole('dialog', { name: '生成结果详情' })).toBeVisible();
      await expect(page.getByText('图片 #1 详情')).toBeVisible();
      await expect(page.locator('.image-result-detail-info')).toContainText('test-image-model');
      await expect(page.locator('.image-result-prompt textarea')).toHaveValue(/护肤品主图/);
      await expect(page.locator('.image-result-param-grid')).toContainText('模板：电商白底主图');
      await expect(page.locator('.image-result-param-grid')).toContainText('数量：1');
      await clickButton(page, '关闭');
      await expect(page.getByRole('dialog', { name: '生成结果详情' })).toHaveCount(0);

      await page.locator('.image-prompt-panel textarea').fill('');
      await page.locator('.image-preview-tabs button').filter({ hasText: '生成日志' }).click();
      await expect(page.locator('.image-preview-log')).toHaveCount(2);
      await expect(page.locator('.image-preview-log').first()).toContainText('图片素材生成结果');
      await page.locator('.image-preview-log-actions button').filter({ hasText: '详情' }).first().click();
      await expect(page.getByRole('dialog', { name: '生成日志详情' })).toBeVisible();
      await expect(page.locator('.image-log-detail-grid')).toContainText('test-image-model');
      await expect(page.locator('.image-result-prompt textarea')).toHaveValue(/护肤品主图/);
      await expect(page.locator('.image-result-param-grid')).toContainText('模板：电商白底主图');
      await clickButton(page, '复用参数');
      await expect(page.getByRole('dialog', { name: '生成日志详情' })).toHaveCount(0);
      await expect(page.locator('.image-prompt-panel textarea')).toHaveValue(/护肤品主图/);

      await page.locator('.image-prompt-panel textarea').fill('');
      await clickButton(page, '素材库');
      await expect(page.getByRole('heading', { name: '素材库' })).toBeVisible();
      await expect(page.locator('.log-card')).toHaveCount(0);
      const imageAssetCard = page.locator('.asset-tile').filter({ hasText: 'test-image-model' }).first();
      await expect(imageAssetCard.locator('img')).toBeVisible();
      await imageAssetCard.getByRole('button', { name: '详情' }).click();
      await expect(page.getByRole('dialog', { name: '素材详情' })).toBeVisible();
      const modalLayering = await page.evaluate(() => {
        const stage = document.querySelector('.stage');
        const sidebar = document.querySelector('.sidebar');
        if (!stage || !sidebar) return { ok: false, stageZ: 0, sidebarZ: 0 };
        return {
          ok: true,
          stageZ: Number(window.getComputedStyle(stage).zIndex),
          sidebarZ: Number(window.getComputedStyle(sidebar).zIndex),
        };
      });
      expect(modalLayering.ok, JSON.stringify(modalLayering)).toBe(true);
      expect(modalLayering.stageZ, JSON.stringify(modalLayering)).toBeGreaterThan(modalLayering.sidebarZ);
      await expect(page.locator('.asset-log-detail-grid')).toContainText('test-image-model');
      await expect(page.locator('.image-result-prompt textarea')).toHaveValue(/护肤品主图/);
      await clickButton(page, '复用图片参数');
      await expect(page.getByRole('dialog', { name: '素材详情' })).toHaveCount(0);
      await expect(page.locator('.image-workbench-layout')).toBeVisible();
      await expect(page.locator('.image-prompt-panel textarea')).toHaveValue(/护肤品主图/);

      await page.locator('.image-generated-card').first().click();
      await expect(page.getByRole('dialog', { name: '图片全屏预览' })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('dialog', { name: '图片全屏预览' })).toHaveCount(0);
    });
    expect(capturedImageRequest?.model).toBe('test-router-model');
    expect(capturedImageRequest?.tools?.[0]?.model).toBe('test-image-model');
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('AI 生图 SOP 生产线支持测试图确认、批量生成和审核入库', async ({}, testInfo) => {
  const capturedImageRequests = [];
  const server = createServer((request, response) => {
    if (request.url === '/v1/responses') {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => {
        capturedImageRequests.push(JSON.parse(body));
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
      });
      return;
    }
    response.statusCode = 404;
    response.end('not found');
  });
  const baseUrl = await new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('无法启动本地图片生成服务。');
      resolveListen(`http://127.0.0.1:${address.port}`);
    });
  });

  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath, endpoint }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.saveModelConfig({
          imageProvider: 'openai-responses',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: endpoint,
          imageApiKey: 'test-image-key',
          imageOuterModel: 'test-router-model',
          imageModels: ['test-image-model'],
        });
      }, { workspacePath: workspaceDir, endpoint: baseUrl });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 SOP 生图工作台重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickButton(page, '图片生成');
      await expect(page.locator('.image-production-workbench')).toContainText('SOP 生产线');
      await page.locator('.image-prompt-panel textarea').fill('早餐桌自然光，手拿便携条包，产品主体清晰，UGC 手机实拍。');
      await page.locator('.image-production-card label').filter({ hasText: '任务名称' }).locator('input').fill('SOP 测试图生产任务');
      await page.locator('.image-production-card label').filter({ hasText: '场景 / 脚本摘要' }).locator('textarea').fill([
        '镜头 1：早餐桌自然光，手拿便携条包，产品主体清晰。',
        '镜头 2：办公室抽屉备用场景，产品包装文字保持一致。',
      ].join('\n'));
      await page.locator('.image-production-card label').filter({ hasText: '产品一致性规则' }).locator('textarea').fill([
        'SOP 自定义规则：包装颜色、文字和袋型必须一致。',
        'SOP 自定义规则：参考图只作为构图和光线参考。',
      ].join('\n'));
      await page.locator('.image-production-card label').filter({ hasText: '负面约束' }).locator('textarea').fill([
        'SOP 自定义负面：不要添加无来源 Logo。',
        'SOP 自定义负面：不要生成医疗化承诺。',
      ].join('\n'));
      await page.locator('.image-production-card button').filter({ hasText: '新建' }).click();

      await expect(page.locator('.image-shot-card')).toHaveCount(2, { timeout: 20_000 });
      const firstShot = page.locator('.image-shot-card').first();
      await expect(firstShot.locator('.image-shot-card-head input')).toHaveValue('镜头 01');
      const readShotGenerationTrace = async () => page.evaluate(async (workspacePath) => {
        const tasks = await window.contentStudio.listImageProductionTasks(workspacePath);
        const task = tasks.find((item) => item.title === 'SOP 测试图生产任务');
        const shot = task?.shotPrompts[0];
        const logs = await window.contentStudio.listGenerationLogs(workspacePath);
        const testLog = logs.find((log) => log.id === shot?.testLogIds[0]);
        const batchLog = logs.find((log) => log.id === shot?.batchLogIds[0]);
        return {
          taskId: task?.id ?? '',
          shotId: shot?.id ?? '',
          shotStatus: shot?.status ?? '',
          test: {
            logId: shot?.testLogIds[0] ?? '',
            logStatus: testLog?.status ?? '',
            logStage: testLog?.input?.generationStage ?? '',
            logProductionTaskId: testLog?.input?.productionTaskId ?? '',
            logShotPromptId: testLog?.input?.shotPromptId ?? '',
            assetCount: Array.isArray(testLog?.output?.assetRefs) ? testLog.output.assetRefs.length : 0,
          },
          batch: {
            logId: shot?.batchLogIds[0] ?? '',
            logStatus: batchLog?.status ?? '',
            logStage: batchLog?.input?.generationStage ?? '',
            logProductionTaskId: batchLog?.input?.productionTaskId ?? '',
            logShotPromptId: batchLog?.input?.shotPromptId ?? '',
            assetCount: Array.isArray(batchLog?.output?.assetRefs) ? batchLog.output.assetRefs.length : 0,
          },
        };
      }, workspaceDir);
      const readReviewTrace = async () => page.evaluate(async (workspacePath) => {
        const task = (await window.contentStudio.listImageProductionTasks(workspacePath)).find((item) => item.title === 'SOP 测试图生产任务');
        const shot = task?.shotPrompts[0];
        const reviews = await window.contentStudio.listAssetReviews(workspacePath);
        const review = reviews.find((item) => item.productionTaskId === task?.id && item.shotPromptId === shot?.id);
        return {
          taskId: task?.id ?? '',
          shotId: shot?.id ?? '',
          shotStatus: shot?.status ?? '',
          reviewStatus: review?.status ?? '',
          reviewProductionTaskId: review?.productionTaskId ?? '',
          reviewShotPromptId: review?.shotPromptId ?? '',
          reviewTags: review?.tags ?? [],
          reviewIds: shot?.reviewIds ?? [],
        };
      }, workspaceDir);
      await firstShot.getByRole('button', { name: '测试生成' }).click();

      await expect.poll(readShotGenerationTrace, {
        message: '等待 SOP 测试图生成并绑定镜头日志',
        timeout: 20_000,
      }).toMatchObject({
        shotStatus: 'test-review',
        test: {
          logStatus: 'succeeded',
          logStage: 'test',
          assetCount: 1,
        },
      });
      const testTrace = await readShotGenerationTrace();
      expect(testTrace.test.logProductionTaskId).toBe(testTrace.taskId);
      expect(testTrace.test.logShotPromptId).toBe(testTrace.shotId);

      const testResultSection = firstShot.locator('.image-shot-results > section').first();
      await expect(testResultSection.locator('.image-shot-result img')).toBeVisible({ timeout: 20_000 });
      await expect(testResultSection).toContainText('成功');
      await testResultSection.getByRole('button', { name: '通过测试' }).click();
      await expect.poll(async () => page.evaluate(async (workspacePath) => {
        const task = (await window.contentStudio.listImageProductionTasks(workspacePath)).find((item) => item.title === 'SOP 测试图生产任务');
        return task?.shotPrompts[0]?.status ?? '';
      }, workspaceDir), {
        message: '等待测试图人工确认通过',
        timeout: 20_000,
      }).toBe('test-approved');

      await expect(firstShot.getByRole('button', { name: '批量生成' })).toBeEnabled({ timeout: 20_000 });
      await firstShot.getByRole('button', { name: '批量生成' }).click();
      await expect.poll(readShotGenerationTrace, {
        message: '等待 SOP 批量生成并绑定镜头日志',
        timeout: 20_000,
      }).toMatchObject({
        shotStatus: 'batch-review',
        batch: {
          logStatus: 'succeeded',
          logStage: 'batch',
          assetCount: 1,
        },
      });
      const batchTrace = await readShotGenerationTrace();
      expect(batchTrace.batch.logProductionTaskId).toBe(batchTrace.taskId);
      expect(batchTrace.batch.logShotPromptId).toBe(batchTrace.shotId);

      const batchResultSection = firstShot.locator('.image-shot-results > section').nth(1);
      await expect(batchResultSection.locator('.image-shot-result img')).toBeVisible({ timeout: 20_000 });
      await expect(batchResultSection).toContainText('成功');
      await batchResultSection.getByRole('button', { name: '送审入库' }).click();
      await expect.poll(readReviewTrace, {
        message: '等待 SOP 批量素材审核入库',
        timeout: 20_000,
      }).toMatchObject({
        shotStatus: 'approved',
        reviewStatus: 'approved',
        reviewTags: expect.arrayContaining(['AI生图', 'SOP生产', '批量生成']),
      });
      const reviewTrace = await readReviewTrace();
      expect(reviewTrace.reviewProductionTaskId).toBe(reviewTrace.taskId);
      expect(reviewTrace.reviewShotPromptId).toBe(reviewTrace.shotId);
      expect(reviewTrace.reviewIds.length).toBeGreaterThanOrEqual(1);

      const serializedRequests = JSON.stringify(capturedImageRequests);
      expect(capturedImageRequests.length).toBeGreaterThanOrEqual(2);
      expect(serializedRequests).toContain('产品一致性规则');
      expect(serializedRequests).toContain('负面约束');
      expect(serializedRequests).toContain('SOP 自定义规则：包装颜色、文字和袋型必须一致');
      expect(serializedRequests).toContain('SOP 自定义负面：不要添加无来源 Logo');
    });
  } finally {
    await closeHttpServer(server);
  }
});
