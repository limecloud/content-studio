import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
const COMMAND_CENTER_MAX_HEIGHT = {
  compact: 120,
  managed: 195,
  flow: 220,
};
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
      CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY: options.requireExplicitTextKey === false ? '0' : '1',
      CONTENT_STUDIO_RESOURCES_DIR: resourcesDir,
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

async function clickButton(page, label) {
  const scopes = [
    page.locator('.settings-modal'),
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

async function openPromptSupportDrawer(page) {
  const drawer = page.locator('.prompt-workbench:visible .prompt-support-drawer').first();
  await expect(drawer).toBeVisible({ timeout: 20_000 });
  await drawer.evaluate((element) => {
    if (element instanceof HTMLDetailsElement) {
      element.open = true;
    }
  });
  const layout = drawer.locator('.prompt-workbench-layout').first();
  await expect(layout).toBeAttached({ timeout: 20_000 });
  await layout.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = 0;
  });
  const panel = drawer.locator('.prompt-source-panel').first();
  const titleInput = promptSourceTitleInput(panel);
  await titleInput.scrollIntoViewIfNeeded();
  await expect(titleInput).toBeEditable({ timeout: 20_000 });
  return panel;
}

function promptSourcePurposeSelect(panel) {
  return panel.locator('.workflow-form-grid label').filter({ hasText: '用途' }).locator('select').first();
}

function promptSourceTitleInput(panel) {
  return panel.locator('.workflow-form-grid label').filter({ hasText: '标题' }).locator('input').first();
}

function promptSourceIntentInput(panel) {
  return panel.locator('.workflow-form-grid label').filter({ hasText: '用户意图' }).locator('textarea').first();
}

async function clickNavItem(page, label) {
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

async function appendE2EBrandCommandQueueDeliverables(workspaceDir) {
  const commandCenterStorePath = join(workspaceDir, '.content-studio', 'brand-command-centers.json');
  const commandCenters = JSON.parse(await readFile(commandCenterStorePath, 'utf-8'));
  const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
  if (!center) throw new Error('E2E 品牌战情室种子不存在。');
  const sourceQueueItem = center.queueItems.find((item) => item.actionType === 'generate-prompt-draft' && item.status === 'ready')
    ?? center.queueItems.find((item) => item.status === 'ready')
    ?? center.queueItems[0];
  if (!sourceQueueItem) throw new Error('E2E 品牌战情室缺少可复用的队列动作。');
  const baseBundle = center.resourceBundles.find((item) => item.id === sourceQueueItem.resourceBundleId);
  const baseCell = center.campaignCells.find((item) => item.id === sourceQueueItem.campaignCellId);
  if (!baseBundle || !baseCell) throw new Error('E2E 品牌战情室缺少可复用的资源包或作战单元。');

  const now = new Date().toISOString();
  const coverageRowIds = Array.from(new Set([
    'selling-v1-light',
    'pain-v1-bag',
    'scenario-v1-commute',
  ]));
  const fallbackDimensions = {
    audiences: ['通勤轻装人群'],
    channels: ['抖音'],
    contentFormats: ['短视频'],
    useCases: ['早高峰通勤包内展示'],
  };
  const existingDimensions = baseBundle.dimensions ?? baseCell.dimensions ?? {};
  const dimensions = {
    ...existingDimensions,
    audiences: existingDimensions.audiences?.length ? existingDimensions.audiences : fallbackDimensions.audiences,
    channels: existingDimensions.channels?.length
      ? existingDimensions.channels
      : baseCell.channels.length
        ? baseCell.channels
        : fallbackDimensions.channels,
    contentFormats: existingDimensions.contentFormats?.length ? existingDimensions.contentFormats : fallbackDimensions.contentFormats,
    useCases: existingDimensions.useCases?.length ? existingDimensions.useCases : fallbackDimensions.useCases,
  };
  Object.assign(baseBundle, {
    coverageRowIds,
    approvedCoverageRowIds: Array.from(new Set([...(baseBundle.approvedCoverageRowIds ?? []), ...coverageRowIds])),
    sopRefs: Array.from(new Set([...(baseBundle.sopRefs ?? []), 'workflow-xiaohongshu-seeding-image'])),
    dimensions,
    gaps: [],
    readyPercent: Math.max(baseBundle.readyPercent ?? 0, 100),
  });
  Object.assign(baseCell, {
    channels: baseCell.channels.length ? baseCell.channels : dimensions.channels ?? ['抖音'],
    dimensions,
  });

  const queueItems = [{
    id: 'queue-e2e-create-scene-card',
    campaignCellId: baseCell.id,
    actionType: 'create-scene-card',
    title: '创建通勤场景卡',
    summary: '把轻量通勤资源包转成场景库卡片，供图片和短视频 Prompt 复用。',
    status: 'ready',
    outputTarget: 'scene-card',
    resourceBundleId: baseBundle.id,
    dimensions,
    createdAt: now,
    updatedAt: now,
  }, {
    id: 'queue-e2e-launch-sop-run',
    campaignCellId: baseCell.id,
    actionType: 'launch-sop-run',
    title: '启动小红书种草图 SOP',
    summary: '把资源包交给小红书种草图 SOP，形成可追溯运行记录。',
    status: 'ready',
    outputTarget: 'sop-run',
    resourceBundleId: baseBundle.id,
    dimensions,
    createdAt: now,
    updatedAt: now,
  }, {
    id: 'queue-e2e-write-back-material-coverage',
    campaignCellId: baseCell.id,
    actionType: 'write-back-material-coverage',
    title: '回写通勤素材覆盖',
    summary: '把已通过的通勤实拍素材回写到内容组合，更新素材覆盖和表现标签。',
    status: 'ready',
    outputTarget: 'material-coverage',
    resourceBundleId: baseBundle.id,
    dimensions,
    createdAt: now,
    updatedAt: now,
  }];
  const existingQueueItemIds = new Set(center.queueItems.map((item) => item.id));
  const newQueueItems = queueItems.filter((item) => !existingQueueItemIds.has(item.id));
  baseCell.queueItemIds = Array.from(new Set([...baseCell.queueItemIds, ...newQueueItems.map((item) => item.id)]));
  center.queueItems = [...center.queueItems, ...newQueueItems];
  center.updatedAt = now;
  await writeFile(commandCenterStorePath, `${JSON.stringify(commandCenters, null, 2)}\n`, 'utf-8');
  return {
    centerId: center.id,
    queueItemIds: queueItems.map((item) => item.id),
    actionTypes: queueItems.map((item) => item.actionType),
  };
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
  await expect.poll(
    async () => page.locator('.nav-stack .nav-label').evaluateAll(
      (items, expected) => items.filter((item) => item.textContent?.trim() === expected).length,
      label,
    ),
    { message: `导航项应作为普通用户入口出现：${label}` },
  ).toBeGreaterThan(0);
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
  expect(layout.tabCount, JSON.stringify(layout)).toBe(3);
  expect(layout.workbenchOverflow, JSON.stringify(layout)).toBe('hidden');
  expect(layout.activeLayoutOverflowY, JSON.stringify(layout)).toMatch(/auto|scroll/);
  expect(layout.badOverflows, JSON.stringify(layout.badOverflows)).toEqual([]);
}

async function startFakeOpenAITextServer(onPrompt) {
  const requests = [];
  const server = createServer((request, response) => {
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

async function startFakeBuguContentWorkspaceServer() {
  let requestCount = 0;
  const requests = [];
  const listRequests = [];
  const releases = [];
  const syncConflicts = [];
  const knowledgeMaps = [];
  const buildRuns = [];
  const commandCenters = [];
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
      if (route === 'content-command-centers') {
        const workspaceId = url.searchParams.get('workspaceId') || '';
        const sourceKnowledgeMapId = url.searchParams.get('sourceKnowledgeMapId') || '';
        response.end(JSON.stringify({
          data: paginateItems(commandCenters
            .filter((item) => !workspaceId || item.workspaceId === workspaceId)
            .filter((item) => !sourceKnowledgeMapId || item.sourceKnowledgeMapId === sourceKnowledgeMapId), url),
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
      if (route === 'content-command-centers') {
        const snapshot = payload.snapshot ?? {};
        const commandCenter = {
          id: payload.id,
          workspaceId: payload.workspaceId || 'workspace-e2e-content',
          title: payload.title,
          status: payload.status,
          sourceKnowledgeMapId: payload.sourceKnowledgeMapId,
          sourceKnowledgeMapTitle: payload.sourceKnowledgeMapTitle,
          signalCount: payload.signalCount,
          objectiveCount: payload.objectiveCount,
          resourceBundleCount: payload.resourceBundleCount,
          campaignCellCount: payload.campaignCellCount,
          queueItemCount: payload.queueItemCount,
          actionRecordCount: payload.actionRecordCount,
          readyQueueItemCount: payload.readyQueueItemCount,
          blockedQueueItemCount: payload.blockedQueueItemCount,
          handedOffQueueItemCount: payload.handedOffQueueItemCount,
          signals: snapshot.signals ?? [],
          objectives: snapshot.objectives ?? [],
          resourceBundles: snapshot.resourceBundles ?? [],
          campaignCells: snapshot.campaignCells ?? [],
          queueSummary: snapshot.queueSummary ?? { items: [] },
          actionSummary: snapshot.actionSummary ?? { records: [] },
          constraints: snapshot.constraints ?? [],
          gaps: snapshot.gaps ?? [],
          baseRevision: payload.baseRevision,
          serverRevision: revision,
          createdAt: payload.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        const existing = commandCenters.findIndex((item) => item.id === commandCenter.id);
        if (existing >= 0) commandCenters[existing] = commandCenter;
        else commandCenters.unshift(commandCenter);
        response.end(JSON.stringify({
          data: {
            workspace: { id: commandCenter.workspaceId, currentRevision: revision },
            commandCenter: { id: payload.id, serverRevision: revision, baseRevision: payload.baseRevision },
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
    addCommandCenter: (record) => {
      const index = commandCenters.findIndex((item) => item.id === record.id);
      if (index >= 0) commandCenters[index] = record;
      else commandCenters.unshift(record);
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
  if (prompt.includes('"task": "generate_brand_knowledge_base"')) {
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
  if (prompt.includes('"task": "generate_ip_knowledge_base"')) {
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
  if (prompt.includes('"task": "generate_prompt_pack"')) {
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
  if (prompt.includes('"task": "generate_scene_cards"')) {
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
    await expect(page.getByText('文字模型未配置')).toBeVisible();
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
    await expect(page.getByRole('heading', { name: '参考视频拆解工作台' })).toBeVisible();
    await clickButton(page, '文章生成');
    await expectCommandCenter(page, '.article-module-workbench > .module-command-center', 'compact');
    await expect(page.locator('.article-module-workbench > .v2-feature-hero')).toHaveCount(0);
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
    await expect(page.locator('.settings-modal')).toBeVisible();
    await clickButton(page, '模型');
    await expect(page.getByText('生成服务连接配置')).toBeVisible();
    await clickButton(page, '完成');
    await expect(page.locator('.settings-modal')).toHaveCount(0);

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
    await clickNavItem(page, 'AI 生图');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-sidebar', 'collapsed');
    await expect(page.locator('.sidebar')).toBeVisible();
    await expect(page.getByRole('button', { name: '展开侧边栏' }).first()).toBeVisible();
    await expect(page.locator('.ai-showcase-shell')).toBeVisible();
    await page.setViewportSize({ width: 2048, height: 1152 });
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
    await expect(page.getByRole('dialog', { name: '提示词助手' })).toBeVisible();
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
      await expect(page.locator('.ai-case-board')).toContainText('后端素材 228 组 · 577 张资产');
      await expect(page.locator('.ai-case-board')).toContainText('当前功能 33 组');
      await expect(page.locator('.ai-case-card')).toHaveCount(33);
    } else {
      await expect.poll(async () => page.locator('.ai-case-card').count()).toBeGreaterThan(10);
    }
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
      await expect(page.locator('.model-reauthorization-banner')).toContainText('文字、图片、视频 API Key');
      await expect(page.locator('.settings-modal')).toBeVisible();
      await expect(page.getByText('生成服务连接配置')).toBeVisible();
      await expect(page.locator('.model-auth-warning')).toContainText('文字、图片、视频 API Key 需要重新授权');

      await clickButton(page, '完成');
      await expect(page.locator('.settings-modal')).toHaveCount(0);
      await page.locator('.model-reauthorization-banner button').click();
      await expect(page.locator('.settings-modal')).toBeVisible();
      await expect(page.locator('.model-auth-warning')).toContainText('当前系统无法读取已保存的加密密钥');
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
      await clickNavItem(page, 'AI 视频');
      await expect(page.locator('.app-shell')).toHaveAttribute('data-sidebar', 'collapsed');
      await expect(page.locator('.sidebar')).toBeVisible();
      await expect(page.getByRole('button', { name: '展开侧边栏' }).first()).toBeVisible();
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
      expect(videoSplitLayout.collapseDisplay, JSON.stringify(videoSplitLayout)).toBe('none');
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
      await videoAssistantDialog.getByRole('button', { name: '开始生成' }).click();
      await expect(videoAssistantDialog.locator('textarea').nth(1)).toContainText('补充生成约束');
      await videoAssistantDialog.getByRole('button', { name: '提示词模板' }).click();
      await videoAssistantDialog.locator('.ai-assistant-toolbar button.primary').click();
      await expect(videoAssistantDialog.locator('.ai-assistant-template-list')).not.toContainText('暂无模板');
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
      await expect(page.locator('.ai-video-case-board')).toContainText('后端素材 51 组 · 111 个资产 · 当前功能 9 组');
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

test('v2 新增入口能落到真实工作流动作，不再只是静态说明页', async ({}, testInfo) => {
  test.setTimeout(120_000);

  await withContentStudio(testInfo, async ({ page }) => {
    for (const label of [
      '合规检测',
      '图片精修',
      '视频脚本',
      '成品视频导入',
      '标题生成',
      '脚本生成',
      '内容知识地图',
      '审核任务',
      '输入源 / 文档转换',
      '场景库',
      '品牌战情室',
      '运行历史',
    ]) {
      await expectNavLabelVisible(page, label);
    }

    for (const label of [
      '创意视频',
      '自定义视频',
      '工作流定义',
      'Canvas 编排',
    ]) {
      await expectNavLabelAbsent(page, label);
    }
    await clickNavItem(page, '高级维护');
    await expectNavLabelVisible(page, '工作流定义');
    await expectNavLabelVisible(page, 'Canvas 编排');

    await clickNavItem(page, '审核任务');
    await expect(page.locator('.content-review-workbench')).toBeVisible();
    await expectCommandCenter(page, '.content-review-workbench > .module-command-center', 'compact');
    await expect(page.locator('.content-review-workbench > .user-journey-guide')).toHaveCount(0);
    await expect(page.locator('.content-review-workbench > .agent-session-panel')).toBeVisible();
    await expect(page.locator('.content-review-workbench > .agent-session-panel .agent-session-footer')).toContainText('生成审核任务');
    const reviewAgentLayout = await page.evaluate(() => {
      const workbench = document.querySelector('.content-review-workbench');
      const panel = document.querySelector('.content-review-workbench > .agent-session-panel');
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
    expect(reviewAgentLayout?.paramsDisplay, JSON.stringify(reviewAgentLayout)).toBe('none');
    expect(reviewAgentLayout?.panelWidth ?? 0, JSON.stringify(reviewAgentLayout)).toBeGreaterThanOrEqual((reviewAgentLayout?.surfaceWidth ?? 0) - 40);
    expect(reviewAgentLayout?.panelHeight ?? 0, JSON.stringify(reviewAgentLayout)).toBeGreaterThanOrEqual((reviewAgentLayout?.workbenchHeight ?? 0) * 0.58);
    await expectNotStaticV2Page(page);

    await clickNavItem(page, 'Prompt 工作台');
    await expect(page.locator('.prompt-workbench')).toBeVisible();
    await expectCommandCenter(page, '.prompt-workbench > .module-command-center', 'compact');
    await expect(page.locator('.prompt-workbench > .v2-feature-hero')).toHaveCount(0);
    await expect(page.locator('.prompt-workbench > .prompt-session-panel')).toHaveCount(0);
    await expect(page.locator('.prompt-workbench > .agent-session-panel')).toBeVisible();
    await expect(page.locator('.prompt-workbench > .agent-session-panel .agent-session-footer')).toContainText('这次任务');
    await expect(page.locator('.prompt-workbench > .agent-session-panel .agent-session-footer textarea')).toBeVisible();
    const promptAgentLayout = await page.evaluate(() => {
      const workbench = document.querySelector('.prompt-workbench');
      const panel = document.querySelector('.prompt-workbench > .agent-session-panel');
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
    expect(promptAgentLayout?.paramsDisplay, JSON.stringify(promptAgentLayout)).toBe('none');
    expect(promptAgentLayout?.panelWidth ?? 0, JSON.stringify(promptAgentLayout)).toBeGreaterThanOrEqual((promptAgentLayout?.surfaceWidth ?? 0) - 40);
    expect(promptAgentLayout?.panelHeight ?? 0, JSON.stringify(promptAgentLayout)).toBeGreaterThanOrEqual((promptAgentLayout?.workbenchHeight ?? 0) * 0.45);
    await expectNotStaticV2Page(page);
    await clickButton(page, '补输入源');
    await expect(page.locator('.input-sources-workbench')).toBeVisible();
    await expectCommandCenter(page, '.input-sources-workbench > .module-command-center', 'compact');
    await expect(page.locator('.input-sources-workbench > .v2-feature-hero')).toHaveCount(0);
    await expect(page.locator('.input-sources-workbench > .user-journey-guide')).toHaveCount(0);
    await expect(page.locator('.input-sources-workbench > .agent-session-panel')).toBeVisible();
    await expect(page.locator('.input-sources-workbench > .agent-session-panel .agent-session-footer')).toContainText('登记文本输入源');
    const inputSourceAgentLayout = await page.evaluate(() => {
      const workbench = document.querySelector('.input-sources-workbench');
      const panel = document.querySelector('.input-sources-workbench > .agent-session-panel');
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
    expect(inputSourceAgentLayout?.paramsDisplay, JSON.stringify(inputSourceAgentLayout)).toBe('none');
    expect(inputSourceAgentLayout?.panelWidth ?? 0, JSON.stringify(inputSourceAgentLayout)).toBeGreaterThanOrEqual((inputSourceAgentLayout?.surfaceWidth ?? 0) - 40);
    expect(inputSourceAgentLayout?.panelHeight ?? 0, JSON.stringify(inputSourceAgentLayout)).toBeGreaterThanOrEqual((inputSourceAgentLayout?.workbenchHeight ?? 0) * 0.58);
    await expectNotStaticV2Page(page);
    await page.locator('.input-source-register-panel select').first().selectOption('product-brief');
    await page.locator('.input-source-register-panel input').first().fill('便携条包产品资料');
    await page.locator('.input-source-register-panel textarea').fill([
      '产品名称：便携营养条包',
      '卖点：早餐后和办公室抽屉随手取用',
      '规格：15g * 20 条',
      '适用场景：早餐后、办公室抽屉、通勤包',
      '禁用表达：不得承诺治疗、见效或替代专业建议',
    ].join('\n'));
    await clickButton(page, '登记文本输入源');
    await expect(page.locator('.input-source-list')).toContainText('便携条包产品资料');
    const productBriefPanel = page.locator('.product-brief-structure-panel');
    await expect(productBriefPanel).toContainText('产品变量表');
    await expect(productBriefPanel).toContainText('便携营养条包');
    await expect(productBriefPanel).toContainText('早餐后和办公室抽屉随手取用');
    await expect(productBriefPanel).toContainText('不得承诺治疗');
    await expect(productBriefPanel).toContainText('可进入生产');
    await expect(productBriefPanel).toContainText('下游 Prompt 交付');
    await expect(productBriefPanel).toContainText('主图 Prompt');
    await expect(productBriefPanel).toContainText('卖点图 Prompt');
    await expect(productBriefPanel).toContainText('详情页模块 Prompt');
    await expect(productBriefPanel.locator('button').filter({ hasText: '去图片生成' })).toBeEnabled();
    await page.locator('.input-source-register-panel select').first().selectOption('user-feedback');
    await page.locator('.input-source-register-panel input').first().fill('评论和客服问题');
    await page.locator('.input-source-register-panel input').nth(1).fill('评论, 客服问题');
    await page.locator('.input-source-register-panel textarea').fill([
      '用户：价格有点贵，值不值这个钱？',
      '差评：早上总是忘记吃，坚持不下来。',
      '客服：孩子能不能吃？有没有禁忌？',
      '评论：办公室加班时能不能放抽屉里？',
    ].join('\n'));
    await clickButton(page, '登记文本输入源');
    const feedbackPanel = page.locator('.feedback-insight-panel');
    await expect(feedbackPanel).toContainText('用户问题矩阵');
    await expect(feedbackPanel).toContainText('价格和信任顾虑');
    await expect(feedbackPanel).toContainText('使用门槛和坚持成本');
    await expect(feedbackPanel).toContainText('适用人群和禁忌边界');
    await expect(feedbackPanel).toContainText('客服异议处理');
    await expect(feedbackPanel).toContainText('人工复核');
    await expect(feedbackPanel.locator('button').filter({ hasText: '去标题生成' })).toBeEnabled();

    await clickNavItem(page, '拆解素材');
    await expect(page.locator('.ai-breakdown-shell')).toBeVisible();
    await expectNotStaticV2Page(page);

    await clickNavItem(page, 'Prompt 工作台');
    await expect(page.locator('.prompt-workbench')).toBeVisible();
    await expectCommandCenter(page, '.prompt-workbench > .module-command-center', 'compact');
    await expect(page.locator('.prompt-workbench > .prompt-session-panel')).toHaveCount(0);
    await expectNotStaticV2Page(page);
    await page.locator('.prompt-workbench > .agent-session-panel .agent-session-footer textarea').fill('基于已解析产品资料，生成小红书种草图 Prompt，强调真实生活场景。');
    await clickButton(page, '仅生成草稿');
    await expect(page.locator('.prompt-draft-editor')).toHaveValue(/Prompt 草稿|任务：/, { timeout: 20_000 });
    await expect(page.locator('.prompt-draft-list .record-card').first()).toBeVisible();

    await clickNavItem(page, '场景提示词');
    await expect(page.locator('.scene-prompt-workbench')).toBeVisible();
    await expectCommandCenter(page, '.scene-prompt-workbench > .module-command-center', 'compact');
    await expect(page.locator('.scene-prompt-workbench > .v2-feature-flow')).toHaveCount(0);
    await expect(page.locator('.scene-prompt-workbench .agent-session-footer')).toBeVisible();
    await expect(page.locator('.scene-prompt-workbench .agent-session-panel')).toBeVisible();
    const sceneAgentLayout = await page.evaluate(() => {
      const workbench = document.querySelector('.scene-prompt-workbench');
      const panel = document.querySelector('.scene-prompt-workbench .agent-session-panel');
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
    expect(sceneAgentLayout?.paramsDisplay, JSON.stringify(sceneAgentLayout)).toBe('none');
    expect(sceneAgentLayout?.panelWidth ?? 0, JSON.stringify(sceneAgentLayout)).toBeGreaterThanOrEqual((sceneAgentLayout?.surfaceWidth ?? 0) - 40);
    expect(sceneAgentLayout?.panelHeight ?? 0, JSON.stringify(sceneAgentLayout)).toBeGreaterThanOrEqual((sceneAgentLayout?.workbenchHeight ?? 0) * 0.72);
    await expectNotStaticV2Page(page);

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
    await clickNavItem(page, 'IP 知识库');
    await expectCommandCenter(page, '.knowledge-brand-workbench > .module-command-center', 'compact');
    await expect(page.locator('.knowledge-brand-workbench > .agent-session-panel')).toBeVisible();
    await expect(page.locator('.knowledge-brand-workbench > .agent-session-panel .agent-session-footer textarea')).toBeVisible();
    await expect(page.locator('.knowledge-brand-workbench > .agent-session-panel .agent-session-footer')).toContainText('开始判断');
    await expect(page.locator('.knowledge-brand-workbench > .agent-session-panel .agent-session-footer')).toContainText('构建 IP 知识库');
    await expect(page.locator('.knowledge-brand-workbench > .user-journey-guide')).toHaveCount(0);
    await expect(page.locator('.knowledge-brand-workbench > .v2-feature-hero')).toHaveCount(0);

    await clickNavItem(page, '内容知识地图');
    await expectCommandCenter(page, '.content-map-workbench > .module-command-center', 'compact');
    await expect(page.locator('.content-map-workbench > .agent-session-panel')).toBeVisible();
    await expect(page.locator('.content-map-workbench > .agent-session-panel .agent-session-footer textarea')).toBeVisible();
    await expect(page.locator('.content-map-workbench > .agent-session-panel .agent-session-footer')).toContainText('开始生成');
    await expect(page.locator('.content-map-workbench > .agent-session-panel .agent-session-footer')).toContainText('生成内容知识地图');
    await expect(page.locator('.content-map-workbench > .user-journey-guide')).toHaveCount(0);

    await clickNavItem(page, '品牌战情室');
    await expectCommandCenter(page, '.brand-command-workbench > .module-command-center', 'compact');
    await expect(page.locator('.brand-command-workbench > .agent-session-panel')).toBeVisible();
    await expect(page.locator('.brand-command-workbench > .agent-session-panel .agent-session-footer textarea')).toBeVisible();
    await expect(page.locator('.brand-command-workbench > .agent-session-panel .agent-session-footer')).toContainText('开始研判');
    await expect(page.locator('.brand-command-workbench > .agent-session-panel .agent-session-footer')).toContainText('生成战情室');
    await expect(page.locator('.brand-command-workbench > .user-journey-guide')).toHaveCount(0);

    await clickNavItem(page, '成型知识库');
    await expectCommandCenter(page, '.knowledge-workbench > .module-command-center', 'managed');
    await expect(page.locator('.module-command-center .knowledge-tab-bar')).toBeVisible();
    await expect(page.locator('.knowledge-workbench > .knowledge-tab-bar')).toHaveCount(0);

    await clickNavItem(page, 'SOP 工作流');
    await expect(page.locator('.workflow-feature-workbench')).toBeVisible();
    await expectCommandCenter(page, '.workflow-feature-workbench > .module-command-center', 'managed');
    await expect(page.locator('.module-command-center .workflow-view-tabs')).toBeVisible();
    await expect(page.locator('.workflow-feature-workbench > .workflow-view-tabs')).toHaveCount(0);
    await expect(page.locator('.workflow-definition-list .record-card').first()).toBeVisible();
    await expect(page.locator('.workflow-view-tabs')).toContainText('运行记录');
    const sopRunner = page.locator('.workflow-runner-panel');
    await sopRunner.locator('textarea').first().fill('');
    await sopRunner.locator('textarea').nth(1).fill('');
    await expect(sopRunner).toContainText('请先补齐必填字段');
    await expect(sopRunner).toContainText('补充资料说明');
    await expect(sopRunner).toContainText('用户意图');
    await expect(sopRunner.locator('button').filter({ hasText: '运行 SOP' })).toBeDisabled();
    await sopRunner.locator('textarea').nth(1).fill('生成 10 组小红书真实场景 Prompt。');
    await expect(sopRunner).toContainText('本次使用资料');
    await expect(sopRunner).toContainText('便携条包产品资料');
    const productSourceOption = sopRunner.locator('.workflow-input-source-option').filter({ hasText: '便携条包产品资料' });
    await expect(productSourceOption.locator('input')).toBeChecked();
    await productSourceOption.locator('input').uncheck();
    await expect(sopRunner.locator('button').filter({ hasText: '运行 SOP' })).toBeDisabled();
    await expect(sopRunner).toContainText('请至少选择一个资料来源');
    await productSourceOption.locator('input').check();
    await expect(sopRunner.locator('button').filter({ hasText: '运行 SOP' })).toBeEnabled();
    await expect(page.locator('.workflow-view-tabs button[role="tab"]').filter({ hasText: '定义管理' })).toHaveCount(0);
    await expect(page.locator('.workflow-view-tabs button[role="tab"]').filter({ hasText: 'Canvas' })).toHaveCount(0);
    await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
    await expect(page.locator('.workflow-history-panel')).toBeVisible();
    await page.locator('.workflow-view-tabs button').filter({ hasText: '高级维护' }).click();
    await page.locator('.workflow-view-tabs button[role="tab"]').filter({ hasText: '定义管理' }).click();
    await expect(page.locator('.workflow-detail-panel')).toBeVisible();
    await page.locator('.workflow-view-tabs button[role="tab"]').filter({ hasText: 'Canvas' }).click();
    await expect(page.locator('.workflow-canvas-panel')).toBeVisible();
    const workflowDensity = await page.evaluate(() => {
      const layout = document.querySelector('.workflow-feature-layout');
      const sidebar = document.querySelector('.workflow-definition-list');
      const node = document.querySelector('.workflow-canvas-node');
      if (!layout || !sidebar || !node) return { ok: false };
      const style = window.getComputedStyle(layout);
      return {
        ok: true,
        gap: Number.parseFloat(style.columnGap),
        sidebarWidth: Math.round(sidebar.getBoundingClientRect().width),
        nodeHeight: Math.round(node.getBoundingClientRect().height),
      };
    });
    expect(workflowDensity.ok, JSON.stringify(workflowDensity)).toBe(true);
    expect(workflowDensity.gap, JSON.stringify(workflowDensity)).toBeLessThanOrEqual(10);
    expect(workflowDensity.sidebarWidth, JSON.stringify(workflowDensity)).toBeLessThanOrEqual(300);
    expect(workflowDensity.nodeHeight, JSON.stringify(workflowDensity)).toBeLessThanOrEqual(150);
    await expectNotStaticV2Page(page);
  });
});

test('审核任务 Agent 支持人工决策并交接 Prompt 工作台', async ({}, testInfo) => {
  test.setTimeout(90_000);

  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    await page.evaluate(async (workspacePath) => {
      const now = new Date().toISOString();
      await window.contentStudio.saveSettings({ workspacePath });
      const source = await window.contentStudio.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '防晒产品审核资料',
        text: '敏感肌表达只能基于斑贴测试摘要，不得承诺适合所有敏感肌。',
        summary: '防晒产品审核资料',
        tags: ['review-agent'],
      });
      const baseMap = await window.contentStudio.buildContentKnowledgeMap({
        workspacePath,
        title: '防晒产品审核地图',
        inputSourceIds: [source.id],
      });
      await window.contentStudio.updateContentKnowledgeMap({
        ...baseMap,
        workspacePath,
        title: '防晒产品审核地图',
        status: 'needs-review',
        syncStatus: 'local-only',
        teamSync: {
          backend: 'bugu',
          status: 'local-only',
          message: '本机审核验证。',
        },
        sourceInputSourceIds: [source.id],
        brandKnowledgeBaseIds: [],
        sceneCardIds: [],
        promptDraftIds: [],
        sellingPoints: [{
          id: 'selling-sensitive-skin',
          title: '敏感肌安心可用',
          summary: '需要确认敏感肌表达是否有测试证据支撑。',
          tags: ['卖点', '审核'],
          sourceRefs: ['manual:review-agent'],
          evidenceRefs: ['evidence-sensitive-skin'],
          confidence: 58,
          status: 'needs-review',
        }],
        painPoints: [],
        scenarios: [],
        evidence: [{
          id: 'evidence-sensitive-skin',
          sourceType: 'manual',
          sourceTitle: '人工上传检测摘要',
          claim: '敏感肌安心可用',
          excerpt: '斑贴测试摘要显示目标样本未见明显刺激反馈，仅可表达为测试场景下温和。',
          status: 'ready',
        }],
        constraints: ['不得承诺适合所有敏感肌。'],
        gaps: [],
        coverage: {
          inputSourceCount: 0,
          brandKnowledgeBaseCount: 0,
          sceneCardCount: 0,
          promptDraftCount: 0,
          evidenceCount: 1,
          gapCount: 0,
          readyPercent: 68,
        },
        model: 'e2e-review-agent',
        createdAt: now,
        updatedAt: now,
      });
    }, workspaceDir);

    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待审核任务 Agent 测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, '审核任务');
    await expect(page.locator('.content-review-workbench > .agent-session-panel')).toBeVisible();
    await page.locator('.content-review-workbench .agent-session-panel button').filter({ hasText: '生成审核任务' }).first().click();
    const taskCard = page.locator('.content-review-agent-queue .record-card').filter({ hasText: '敏感肌安心可用' }).first();
    await expect(taskCard).toBeVisible({ timeout: 20_000 });
    await taskCard.click();
    await expect(page.locator('.content-review-workbench .agent-session-artifact')).toContainText('敏感肌安心可用');
    await expect(page.locator('.content-review-workbench .agent-session-footer button').filter({ hasText: '交给 Prompt 工作台' })).toBeDisabled();

    await page.locator('.content-review-workbench .agent-session-footer button').filter({ hasText: '通过' }).click();
    await expect(page.locator('.content-review-workbench .agent-session-panel')).toContainText('已通过', { timeout: 20_000 });
    const approvedTask = await page.evaluate(async (workspacePath) => {
      const tasks = await window.contentStudio.listContentReviewTasks(workspacePath);
      return tasks.find((task) => task.title === '敏感肌安心可用');
    }, workspaceDir);
    expect(approvedTask?.status).toBe('approved');
    expect(approvedTask?.decisions?.[0]?.action).toBe('approve');

    await page.locator('.content-review-workbench .agent-session-footer button').filter({ hasText: '交给 Prompt 工作台' }).click();
    await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.prompt-workbench')).toContainText('敏感肌安心可用', { timeout: 20_000 });
    await expect(page.locator('.prompt-workbench > .agent-session-panel')).toBeVisible();
  });
});

test('审核任务调整动作会真实改写内容知识地图', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const bugu = await startFakeBuguContentWorkspaceServer();
  try {
    await withContentStudio(testInfo, async ({ electronApp, page, workspaceDir }) => {
      await page.evaluate(async (workspacePath) => {
      const now = new Date().toISOString();
      await window.contentStudio.saveSettings({ workspacePath });
      const source = await window.contentStudio.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '通勤背包审核资料',
        text: '通勤背包重量控制、肩带缓压和小雨防泼资料，防泼不等于完全防水。',
        summary: '通勤背包审核资料',
        tags: ['review-mutation-ui'],
      });
      const baseMap = await window.contentStudio.buildContentKnowledgeMap({
        workspacePath,
        title: '通勤背包审核调整地图',
        inputSourceIds: [source.id],
      });
      await window.contentStudio.updateContentKnowledgeMap({
        ...baseMap,
        workspacePath,
        title: '通勤背包审核调整地图',
        status: 'needs-review',
        syncStatus: 'synced',
        teamSync: {
          backend: 'bugu',
          status: 'synced',
          message: 'E2E 本机团队版本。',
          workspaceId: 'workspace-review-mutation-ui',
          revision: 'rev-review-mutation-ui-1',
        },
        sourceInputSourceIds: [source.id],
        brandKnowledgeBaseIds: [],
        ipKnowledgeBaseIds: [],
        sceneCardIds: [],
        promptDraftIds: [],
        sellingPoints: [{
          id: 'sp-ui-light',
          title: '轻便通勤',
          summary: '适合每天背电脑和文件。',
          tags: ['卖点', '通勤'],
          sourceRefs: [`input-source:${source.id}`],
          evidenceRefs: ['evidence-ui-weight'],
          materialStatus: 'covered',
          materialRefs: ['asset-ui-light'],
          confidence: 72,
          status: 'ready',
        }, {
          id: 'sp-ui-strap',
          title: '背起来不累',
          summary: '肩带和重量控制降低通勤负担。',
          tags: ['卖点', '轻便'],
          sourceRefs: [`input-source:${source.id}`],
          evidenceRefs: ['evidence-ui-strap'],
          materialStatus: 'approved',
          materialRefs: ['asset-ui-strap'],
          performanceTags: ['高点击'],
          confidence: 68,
          status: 'needs-review',
        }, {
          id: 'sp-ui-rain',
          title: '小雨防泼',
          summary: '短途通勤遇到小雨时保护随身物品。',
          tags: ['卖点', '雨天'],
          sourceRefs: [`input-source:${source.id}`],
          evidenceRefs: ['evidence-ui-fabric'],
          materialStatus: 'missing',
          materialRefs: [],
          confidence: 70,
          status: 'ready',
        }],
        painPoints: [],
        scenarios: [],
        evidence: [{
          id: 'evidence-ui-weight',
          sourceType: 'input-source',
          sourceId: source.id,
          sourceTitle: '产品参数',
          claim: '重量控制',
          excerpt: '整包重量适合日常通勤。',
          status: 'ready',
        }, {
          id: 'evidence-ui-strap',
          sourceType: 'input-source',
          sourceId: source.id,
          sourceTitle: '肩带说明',
          claim: '肩带缓压',
          excerpt: '肩带加宽并有缓冲层。',
          status: 'ready',
        }, {
          id: 'evidence-ui-fabric',
          sourceType: 'input-source',
          sourceId: source.id,
          sourceTitle: '面料说明',
          claim: '防泼面料',
          excerpt: '表面面料可应对短时间小雨。',
          status: 'ready',
        }],
        constraints: ['防泼不等于完全防水。'],
        gaps: [],
        coverage: {
          inputSourceCount: 1,
          brandKnowledgeBaseCount: 0,
          ipKnowledgeBaseCount: 0,
          sceneCardCount: 0,
          promptDraftCount: 0,
          evidenceCount: 3,
          gapCount: 0,
          readyPercent: 67,
        },
        model: 'e2e-review-mutation-ui',
        createdAt: now,
        updatedAt: now,
      });
      }, workspaceDir);

      await page.reload();
      await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待审核调整测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, '审核任务');
      const reviewWorkbench = page.locator('.content-review-workbench');
      await reviewWorkbench.locator('.agent-session-panel button').filter({ hasText: '生成审核任务' }).first().click();
      const taskCard = reviewWorkbench.locator('.content-review-agent-queue .record-card').filter({ hasText: '背起来不累' }).first();
      await expect(taskCard).toBeVisible({ timeout: 20_000 });
      await taskCard.click();

      const artifact = reviewWorkbench.locator('.agent-session-artifact');
      await expect(artifact).toContainText('调整当前条目');
      await artifact.locator('label').filter({ hasText: '条目名称' }).locator('input').fill('通勤轻便不压肩');
      await artifact.locator('label').filter({ hasText: '摘要' }).locator('textarea').fill('把重量控制和肩带缓压合并成通勤人群能理解的表达。');
      await artifact.getByRole('button', { name: '保存改名' }).click();
      await expect(reviewWorkbench).toContainText('通勤轻便不压肩', { timeout: 20_000 });
      await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const [map] = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
        const task = (await window.contentStudio.listContentReviewTasks(workspacePath))
          .find((item) => item.targetId === 'sp-ui-strap');
        return {
          rowTitle: map?.sellingPoints.find((row) => row.id === 'sp-ui-strap')?.title,
          syncStatus: map?.syncStatus,
          decision: task?.decisions?.[0]?.action,
        };
      }, workspaceDir),
      { message: '等待改名写入内容知识地图', timeout: 20_000 },
      ).toEqual({
      rowTitle: '通勤轻便不压肩',
      syncStatus: 'synced',
      decision: 'rename-target',
      });

      await artifact.locator('.content-review-merge-option').filter({ hasText: '轻便通勤' }).locator('input').check();
      await artifact.getByRole('button', { name: '合并所选' }).click();
      await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const [map] = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
        const row = map?.sellingPoints.find((item) => item.id === 'sp-ui-strap');
        const task = (await window.contentStudio.listContentReviewTasks(workspacePath))
          .find((item) => item.targetId === 'sp-ui-strap');
        return {
          rowTitle: row?.title,
          removedDuplicate: map?.sellingPoints.some((item) => item.id === 'sp-ui-light') === false,
          evidenceRefs: row?.evidenceRefs ?? [],
          materialStatus: row?.materialStatus,
          performanceTags: row?.performanceTags ?? [],
          decision: task?.decisions?.[0]?.action,
        };
      }, workspaceDir),
      { message: '等待合并写入内容知识地图', timeout: 20_000 },
      ).toEqual({
      rowTitle: '通勤轻便不压肩',
      removedDuplicate: true,
      evidenceRefs: expect.arrayContaining(['evidence-ui-weight', 'evidence-ui-strap']),
      materialStatus: 'approved',
      performanceTags: expect.arrayContaining(['高点击']),
      decision: 'merge-related',
      });

      const splitEditor = artifact.locator('.content-review-split-editor textarea');
      const splitText = [
        '通勤轻便｜用于日常通勤背负。',
        '肩带缓压｜用于长时间背负不勒肩。',
      ].join('\n');
      await splitEditor.click();
      await splitEditor.press('ControlOrMeta+A');
      await page.keyboard.insertText(splitText);
      await expect(splitEditor).toHaveValue(splitText);
      await expect(artifact.getByRole('button', { name: /拆分成 2 条/ })).toBeEnabled({ timeout: 20_000 });
      await artifact.getByRole('button', { name: /拆分成 2 条/ }).click();
      await expect(reviewWorkbench).toContainText('通勤轻便', { timeout: 20_000 });
      await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const tasks = await window.contentStudio.listContentReviewTasks(workspacePath);
        const draftChanges = await window.contentStudio.listContentDraftChanges(workspacePath);
        const task = tasks.find((item) => item.targetId === 'sp-ui-strap');
        return {
          latestDecision: task?.decisions?.[0]?.action,
          decisionCount: task?.decisions?.length ?? 0,
          draftChangeCount: draftChanges.length,
        };
      }, workspaceDir),
      { message: '等待拆分审核调整写入本机事实源', timeout: 20_000 },
      ).toEqual({
      latestDecision: 'split-target',
      decisionCount: 3,
      draftChangeCount: 3,
      });
      const mutationTrace = await page.evaluate(async (workspacePath) => {
      const [map] = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
      const tasks = await window.contentStudio.listContentReviewTasks(workspacePath);
      const draftChanges = await window.contentStudio.listContentDraftChanges(workspacePath);
      const splitRows = map.sellingPoints.filter((row) => row.title === '通勤轻便' || row.title === '肩带缓压');
      const task = tasks.find((item) => item.targetId === 'sp-ui-strap');
      return {
        splitRows: splitRows.map((row) => ({
          title: row.title,
          status: row.status,
          materialStatus: row.materialStatus,
          materialRefs: row.materialRefs ?? [],
        })).sort((a, b) => a.title.localeCompare(b.title, 'zh-CN')),
        latestDecision: task?.decisions?.[0]?.action,
        decisionCount: task?.decisions?.length ?? 0,
        draftChangeCount: draftChanges.length,
        draftChangeTitles: draftChanges.map((change) => change.title),
      };
      }, workspaceDir);
      expect(mutationTrace.splitRows, JSON.stringify(mutationTrace)).toEqual([
      { title: '肩带缓压', status: 'needs-review', materialStatus: 'missing', materialRefs: [] },
      { title: '通勤轻便', status: 'needs-review', materialStatus: 'missing', materialRefs: [] },
      ]);
      expect(mutationTrace.latestDecision, JSON.stringify(mutationTrace)).toBe('split-target');
      expect(mutationTrace.decisionCount, JSON.stringify(mutationTrace)).toBeGreaterThanOrEqual(3);
      expect(mutationTrace.draftChangeCount, JSON.stringify(mutationTrace)).toBeGreaterThanOrEqual(3);
      expect(mutationTrace.draftChangeTitles, JSON.stringify(mutationTrace)).toEqual(expect.arrayContaining(['通勤背包审核调整地图 变更包']));
      await expect.poll(
        () => bugu.requests
          .filter((request) => request.route === 'content-review-decisions')
          .map((request) => request.payload.action),
        { message: '等待审核调整结论同步到 Bugu', timeout: 20_000 },
      ).toEqual(expect.arrayContaining(['rename-target', 'merge-related', 'split-target']));
      await expect.poll(
        () => bugu.requests.filter((request) => request.route === 'content-draft-changes').length,
        { message: '等待审核调整变更包同步到 Bugu', timeout: 20_000 },
      ).toBeGreaterThanOrEqual(3);
      const reviewTaskRequests = bugu.requests.filter((request) => request.route === 'content-review-tasks');
      const reviewDecisionRequests = bugu.requests.filter((request) => request.route === 'content-review-decisions');
      const draftChangeRequests = bugu.requests.filter((request) => request.route === 'content-draft-changes');
      const reviewDecisionActions = reviewDecisionRequests.map((request) => request.payload.action);
      expect(reviewTaskRequests.length, JSON.stringify(bugu.requests)).toBeGreaterThanOrEqual(1);
      expect(reviewTaskRequests[0]?.payload.tasks?.[0]?.targetId, JSON.stringify(bugu.requests)).toBe('sp-ui-strap');
      expect(reviewDecisionActions, JSON.stringify(bugu.requests)).toEqual(expect.arrayContaining(['rename-target', 'merge-related', 'split-target']));
      expect(draftChangeRequests.length, JSON.stringify(bugu.requests)).toBeGreaterThanOrEqual(3);
      expect(draftChangeRequests.every((request) => request.payload.contentKnowledgeMapId), JSON.stringify(bugu.requests)).toBe(true);

      await clickNavItem(page, '内容知识地图');
      await expect(page.locator('.content-map-workbench')).toContainText('通勤轻便', { timeout: 20_000 });
      await expect(page.locator('.content-map-workbench')).toContainText('肩带缓压');
    }, {
      env: {
        CONTENT_STUDIO_BUGU_CONTENT_API_BASE_URL: bugu.baseUrl,
        CONTENT_STUDIO_BUGU_CONTENT_API_TOKEN: 'e2e-content-token',
      },
    });
  } finally {
    await bugu.close();
  }
});

test('内容知识地图团队共享按钮会真实生成变更包和知识包版本', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const bugu = await startFakeBuguContentWorkspaceServer();
  try {
    await withContentStudio(testInfo, async ({ electronApp, page, workspaceDir }) => {
      await page.evaluate(async (workspacePath) => {
        const api = window.contentStudio;
        const now = new Date().toISOString();
        await api.saveSettings({ workspacePath });
        const source = await api.registerInputSource({
          workspacePath,
          kind: 'manual-note',
          purpose: 'product-brief',
          title: '防晒团队包资料',
          text: '清爽肤感、通勤补涂、不搓泥。涉及防晒效果时必须引用备案或检测信息。',
          summary: '防晒团队包资料',
          tags: ['team-package-ui'],
        });
        const baseMap = await api.buildContentKnowledgeMap({
          workspacePath,
          title: '防晒团队知识地图',
          inputSourceIds: [source.id],
        });
        await api.updateContentKnowledgeMap({
          ...baseMap,
          workspacePath,
          title: '防晒团队知识地图',
          status: 'ready',
          syncStatus: 'local-only',
          teamSync: {
            backend: 'bugu',
            status: 'local-only',
            message: '本机团队共享验证。',
            workspaceId: 'workspace-e2e-content',
            revision: 'rev-team-ui-1',
          },
          sourceInputSourceIds: [source.id],
          brandKnowledgeBaseIds: ['brand-team-ui'],
          ipKnowledgeBaseIds: [],
          sceneCardIds: ['scene-team-ui'],
          promptDraftIds: ['prompt-team-ui'],
          sellingPoints: [{
            id: 'sp-team-light',
            title: '清爽不搓泥',
            summary: '适合通勤补涂，强调清爽肤感和不搓泥体验。',
            tags: ['卖点', '防晒'],
            sourceRefs: [`input-source:${source.id}`],
            evidenceRefs: ['evidence-team-light'],
            materialStatus: 'approved',
            materialRefs: ['asset-team-light'],
            confidence: 90,
            status: 'ready',
          }],
          painPoints: [{
            id: 'pain-team-oily',
            title: '怕油腻搓泥',
            summary: '评论中反复出现的购买异议。',
            tags: ['痛点', '评论'],
            sourceRefs: [`input-source:${source.id}`],
            evidenceRefs: ['evidence-team-light'],
            confidence: 84,
            status: 'ready',
          }],
          scenarios: [{
            id: 'scenario-team-commute',
            title: '通勤包补涂',
            summary: '地铁、办公室和户外切换时的快速补涂。',
            tags: ['场景', '通勤'],
            sourceRefs: [`input-source:${source.id}`],
            evidenceRefs: ['evidence-team-light'],
            materialStatus: 'approved',
            materialRefs: ['asset-team-light'],
            confidence: 86,
            status: 'ready',
          }],
          evidence: [{
            id: 'evidence-team-light',
            sourceType: 'manual',
            sourceTitle: '产品卖点确认表',
            claim: '用户关注清爽肤感和补涂便利性。',
            excerpt: '调研记录显示，清爽、便携和不搓泥是主要决策点。',
            status: 'ready',
          }],
          constraints: ['涉及防晒效果时必须引用检测或备案信息。'],
          gaps: [],
          coverage: {
            inputSourceCount: 1,
            brandKnowledgeBaseCount: 1,
            ipKnowledgeBaseCount: 0,
            skuRowCount: 1,
            competitorObservationCount: 0,
            sceneCardCount: 1,
            promptDraftCount: 1,
            evidenceCount: 1,
            gapCount: 0,
            readyPercent: 100,
          },
          model: 'e2e-team-package-ui',
          createdAt: now,
          updatedAt: now,
        });
      }, workspaceDir);

      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待团队共享测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, '内容知识地图');
      const mapWorkbench = page.locator('.content-map-workbench');
      const footer = mapWorkbench.locator('.agent-session-footer');
      await expect(mapWorkbench).toContainText('防晒团队知识地图', { timeout: 20_000 });

      const createChangeButton = footer.getByRole('button', { name: '生成变更包', exact: true });
      if (await createChangeButton.isVisible().catch(() => false)) {
        await createChangeButton.click();
        await expect.poll(
          async () => page.evaluate(async (workspacePath) => (await window.contentStudio.listContentDraftChanges(workspacePath)).length, workspaceDir),
          { message: '等待真实变更包写入本机事实源', timeout: 20_000 },
        ).toBeGreaterThanOrEqual(1);
      }
      await expect(footer.getByRole('button', { name: '提交团队工作区', exact: true })).toBeEnabled({ timeout: 20_000 });
      await footer.getByRole('button', { name: '提交团队工作区', exact: true }).click();
      await expect.poll(
        async () => page.evaluate(async (workspacePath) => {
          const [map] = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
          const [draft] = await window.contentStudio.listContentDraftChanges(workspacePath);
          return { mapSyncStatus: map?.syncStatus, draftSyncStatus: draft?.syncStatus };
        }, workspaceDir),
        { message: '等待变更包提交团队工作区', timeout: 20_000 },
      ).toEqual({ mapSyncStatus: 'synced', draftSyncStatus: 'synced' });

      await expect(footer.getByRole('button', { name: '导出变更包', exact: true })).toBeEnabled({ timeout: 20_000 });
      await footer.getByRole('button', { name: '导出变更包', exact: true }).click();
      await expect(mapWorkbench).toContainText('离线变更包已导出', { timeout: 20_000 });
      const exportedChange = await page.evaluate(async (workspacePath) => {
        const [draftChange] = await window.contentStudio.listContentDraftChanges(workspacePath);
        const exported = await window.contentStudio.exportContentDraftChange({
          workspacePath,
          draftChangeId: draftChange.id,
        });
        return {
          exportedStatus: exported.status,
          exportedFiles: exported.files ?? [],
          packageDir: exported.packageDir,
          exportedMapId: draftChange.contentKnowledgeMapId,
        };
      }, workspaceDir);
      expect(exportedChange.exportedStatus, JSON.stringify(exportedChange)).toBe('exported');
      expect(exportedChange.exportedFiles, JSON.stringify(exportedChange)).toEqual(expect.arrayContaining(['manifest.json', 'draft-change.json', 'import-guide.md']));
      expect(exportedChange.packageDir, JSON.stringify(exportedChange)).toBeTruthy();
      await electronApp.evaluate(({ dialog }, packageDir) => {
        const originalShowOpenDialog = dialog.showOpenDialog;
        globalThis.__contentStudioE2EImportDialogCalls = [];
        dialog.showOpenDialog = async (...args) => {
          const options = args.length > 1 ? args[1] : args[0];
          const title = typeof options?.title === 'string' ? options.title : '';
          if (title === '选择内容变更包') {
            globalThis.__contentStudioE2EImportDialogCalls.push({ title, filePath: packageDir });
            dialog.showOpenDialog = originalShowOpenDialog;
            return { canceled: false, filePaths: [packageDir] };
          }
          return Reflect.apply(originalShowOpenDialog, dialog, args);
        };
      }, exportedChange.packageDir);
      await expect(footer.getByRole('button', { name: '导入变更包', exact: true })).toBeEnabled({ timeout: 20_000 });
      await footer.getByRole('button', { name: '导入变更包', exact: true }).click();
      await expect(mapWorkbench).toContainText('离线变更包已导入', { timeout: 20_000 });
      const importDialogCalls = await electronApp.evaluate(() => globalThis.__contentStudioE2EImportDialogCalls ?? []);
      expect(importDialogCalls, JSON.stringify(importDialogCalls)).toEqual([{
        title: '选择内容变更包',
        filePath: exportedChange.packageDir,
      }]);
      const importTrace = await page.evaluate(async ({ workspacePath, exportedMapId }) => {
        const allDraftChanges = await window.contentStudio.listContentDraftChanges(workspacePath);
        const imported = allDraftChanges.find((item) => item.syncStatus === 'local-draft' && item.contentKnowledgeMapId === exportedMapId);
        return {
          importedAuthor: imported?.authorLabel,
          importedMapId: imported?.contentKnowledgeMapId,
          draftChangeCount: allDraftChanges.length,
          importedExists: Boolean(imported),
        };
      }, { workspacePath: workspaceDir, exportedMapId: exportedChange.exportedMapId });
      expect(importTrace.importedAuthor, JSON.stringify(importTrace)).toBeTruthy();
      expect(importTrace.importedMapId, JSON.stringify(importTrace)).toBe(exportedChange.exportedMapId);
      expect(importTrace.draftChangeCount, JSON.stringify(importTrace)).toBeGreaterThanOrEqual(2);
      expect(importTrace.importedExists, JSON.stringify(importTrace)).toBe(true);

      await expect(footer.getByRole('button', { name: '创建知识包版本', exact: true })).toBeEnabled({ timeout: 20_000 });
      await footer.getByRole('button', { name: '创建知识包版本', exact: true }).click();
      await expect.poll(
        async () => page.evaluate(async (workspacePath) => (await window.contentStudio.listContentKnowledgeReleases(workspacePath))[0]?.status, workspaceDir),
        { message: '等待团队知识包版本发布', timeout: 20_000 },
      ).toBe('published');
      await page.locator('.content-map-tabs button').filter({ hasText: '团队知识包' }).click();
      await expect(mapWorkbench.locator('.content-map-package-content')).toContainText('防晒团队知识地图 团队知识包');
      await page.locator('.content-map-tabs button').filter({ hasText: '高级导出' }).click();
      await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('团队知识包可下载');
      await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('KNOWLEDGE.md');

      const trace = await page.evaluate(async (workspacePath) => {
        const [map] = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
        const draftChanges = await window.contentStudio.listContentDraftChanges(workspacePath);
        const releases = await window.contentStudio.listContentKnowledgeReleases(workspacePath);
        const latestDraft = draftChanges[0];
        const latestRelease = releases[0];
        return {
          mapSyncStatus: map?.syncStatus,
          mapRevision: map?.teamSync?.revision,
          draftCount: draftChanges.length,
          hasSyncedDraft: draftChanges.some((change) => change.syncStatus === 'synced'),
          hasImportedDraft: draftChanges.some((change) => change.syncStatus === 'local-draft' && Boolean(change.authorLabel)),
          draftIssueCount: draftChanges.reduce((sum, change) => sum + (change.issues?.length ?? 0), 0),
          releaseStatus: latestRelease?.status,
          releasePublicUrl: latestRelease?.packagePublicUrl,
          releaseObjectKey: latestRelease?.packageObjectKey,
          releaseFileNames: latestRelease?.files ?? [],
          releaseSha256: latestRelease?.packageArchiveSha256,
          releaseSize: latestRelease?.packageArchiveSize ?? 0,
        };
      }, workspaceDir);
      expect(trace.mapSyncStatus, JSON.stringify(trace)).toBe('synced');
      expect(trace.mapRevision, JSON.stringify(trace)).toMatch(/^rev-e2e-content-/);
      expect(trace.draftCount, JSON.stringify(trace)).toBeGreaterThanOrEqual(1);
      expect(trace.hasSyncedDraft, JSON.stringify(trace)).toBe(true);
      expect(trace.hasImportedDraft, JSON.stringify(trace)).toBe(true);
      expect(trace.draftIssueCount, JSON.stringify(trace)).toBe(0);
      expect(trace.releaseStatus, JSON.stringify(trace)).toBe('published');
      expect(trace.releasePublicUrl, JSON.stringify(trace)).toMatch(/^https:\/\/downloads\.bugu\.run\/content-workspaces\//);
      expect(trace.releaseObjectKey, JSON.stringify(trace)).toContain('agentknowledge');
      expect(trace.releaseFileNames, JSON.stringify(trace)).toEqual(expect.arrayContaining([
        'KNOWLEDGE.md',
        'manifest.json',
        'ontology/ontology.json',
        'assets/material-coverage.json',
        'interop/ontology.jsonld',
        'interop/ontology.ttl',
        'interop/ontology.rdf',
      ]));
      expect(trace.releaseSha256, JSON.stringify(trace)).toMatch(/^[a-f0-9]{64}$/);
      expect(trace.releaseSize, JSON.stringify(trace)).toBeGreaterThan(0);

      const draftRequest = bugu.requests.find((request) => request.route === 'content-draft-changes');
      const releaseRequest = bugu.requests.find((request) => request.route === 'content-knowledge-releases');
      expect(draftRequest?.payload.title, JSON.stringify(bugu.requests)).toBe('防晒团队知识地图 变更包');
      expect(releaseRequest?.payload.packageArchive?.contentBase64, JSON.stringify(bugu.requests)).toBeTruthy();
      expect(releaseRequest?.payload.packageArchive?.sha256, JSON.stringify(bugu.requests)).toMatch(/^[a-f0-9]{64}$/);
      expect(releaseRequest?.payload.packageManifest?.files, JSON.stringify(bugu.requests)).toEqual(expect.arrayContaining([
        'KNOWLEDGE.md',
        'manifest.json',
        'ontology/ontology.json',
        'assets/material-coverage.json',
        'interop/ontology.jsonld',
        'interop/ontology.ttl',
        'interop/ontology.rdf',
      ]));

      const remoteReleaseMapId = await page.evaluate(async (workspacePath) => {
        const maps = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
        return maps.find((map) => map.title === '防晒团队知识地图')?.id;
      }, workspaceDir);
      expect(remoteReleaseMapId).toBeTruthy();

      bugu.addKnowledgeMap({
        id: 'map-e2e-remote-current',
        workspaceId: 'workspace-e2e-content',
        title: '远端团队内容地图',
        status: 'ready',
        model: 'remote-team-model',
        sourceInputSourceIds: ['remote-input-1'],
        brandKnowledgeBaseIds: ['remote-brand-1'],
        ipKnowledgeBaseIds: [],
        sceneCardIds: ['remote-scene-1'],
        promptDraftIds: ['remote-prompt-1'],
        evidenceCount: 1,
        gapCount: 0,
        readyPercent: 96,
        coverage: {
          inputSourceCount: 1,
          brandKnowledgeBaseCount: 1,
          ipKnowledgeBaseCount: 0,
          skuRowCount: 1,
          competitorObservationCount: 0,
          sceneCardCount: 1,
          promptDraftCount: 1,
          evidenceCount: 1,
          gapCount: 0,
          readyPercent: 96,
        },
        qualityIssues: [],
        snapshot: {
          title: '远端团队内容地图',
          status: 'ready',
          sellingPoints: [{
            id: 'selling-e2e-remote-light',
            title: '远端团队清爽补涂',
            summary: '团队另一账号补充的远端卖点。',
            tags: ['远端团队', '防晒'],
            dimensions: {
              audiences: ['通勤人群'],
              channels: ['抖音'],
              stages: ['转化'],
              contentFormats: ['短视频'],
              useCases: ['午后补涂'],
            },
            sourceRefs: ['input-source:remote-input-1'],
            evidenceRefs: ['evidence-e2e-remote-light'],
            materialStatus: 'approved',
            materialRefs: ['asset-e2e-remote-light'],
            performanceTags: ['高转化'],
            confidence: 96,
            status: 'ready',
          }],
          painPoints: [],
          scenarios: [{
            id: 'scenario-e2e-remote-commute',
            title: '远端团队午后补涂场景',
            summary: '办公室午后补涂，不厚重。',
            tags: ['远端团队', '场景'],
            sourceRefs: ['input-source:remote-input-1'],
            evidenceRefs: ['evidence-e2e-remote-light'],
            confidence: 90,
            status: 'ready',
          }],
          evidence: [{
            id: 'evidence-e2e-remote-light',
            sourceType: 'manual',
            sourceTitle: '远端团队资料',
            claim: '远端团队确认午后补涂场景。',
            excerpt: '远端团队资料显示午后补涂需要强调清爽和不厚重。',
            status: 'ready',
          }],
          constraints: ['远端团队边界：不能承诺绝对防护。'],
          gaps: [],
          updatedAt: new Date().toISOString(),
        },
        baseRevision: 'rev-remote-current-base',
        serverRevision: 'rev-remote-current-map',
        createdAt: new Date().toISOString(),
        updatedAt: new Date(Date.now() + 1500).toISOString(),
      });
      bugu.addBuildRun({
        id: 'build-run-e2e-remote-current',
        workspaceId: 'workspace-e2e-content',
        title: '远端团队生成流程',
        status: 'completed',
        contentKnowledgeMapId: 'map-e2e-remote-current',
        contentKnowledgeMapTitle: '远端团队内容地图',
        model: 'remote-team-model',
        inputSourceIds: ['remote-input-1'],
        brandKnowledgeBaseIds: ['remote-brand-1'],
        ipKnowledgeBaseIds: [],
        sceneCardIds: ['remote-scene-1'],
        promptDraftIds: ['remote-prompt-1'],
        readyPercent: 96,
        evidenceCount: 1,
        gapCount: 0,
        issues: [],
        steps: [{
          key: 'remote-team-quality-check',
          title: '远端团队质量检查',
          status: 'completed',
          message: '96% 内容可用。',
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
        }],
        baseRevision: 'rev-remote-current-map',
        serverRevision: 'rev-remote-current-build',
        startedAt: new Date().toISOString(),
        completedAt: new Date(Date.now() + 500).toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date(Date.now() + 500).toISOString(),
      });
      bugu.addCommandCenter({
        id: 'command-center-e2e-remote-current',
        workspaceId: 'workspace-e2e-content',
        title: '远端团队品牌作战系统',
        status: 'active',
        sourceKnowledgeMapId: 'map-e2e-remote-current',
        sourceKnowledgeMapTitle: '远端团队内容地图',
        signals: [{
          id: 'signal-e2e-remote-current',
          type: 'feedback-pain',
          title: '远端团队反馈信号',
          summary: '远端团队记录了午后补涂疑虑。',
          sourceLabel: '远端团队评论',
          businessValue: 93,
          evidenceReadiness: 90,
          urgency: 84,
          riskLevel: 12,
          productionCost: 25,
          recommendedObjectiveType: 'conversion',
          riskBoundary: '不能绝对化表达。',
          relatedMapRowIds: ['selling-e2e-remote-light'],
        }],
        objectives: [],
        resourceBundles: [{
          id: 'bundle-e2e-remote-current',
          title: '远端团队清爽补涂资源包',
          objectiveId: 'objective-e2e-remote-current',
          sourceKnowledgeMapId: 'map-e2e-remote-current',
          coverageRowIds: ['selling-e2e-remote-light'],
          sellingPointRefs: ['远端团队清爽补涂'],
          evidenceRefs: ['evidence-e2e-remote-light'],
          sceneRefs: ['远端团队午后补涂场景'],
          promptDraftIds: ['remote-prompt-1'],
          materialRefs: ['asset-e2e-remote-light'],
          sopRefs: [],
          constraints: ['不能绝对化表达。'],
          gaps: [],
          handoffRefs: ['prompt-draft:remote-prompt-1'],
          readyPercent: 96,
        }],
        campaignCells: [],
        queueSummary: {
          items: [{
            id: 'queue-e2e-remote-current',
            campaignCellId: 'cell-e2e-remote-current',
            actionType: 'generate-prompt-draft',
            title: '远端团队生成 Prompt',
            summary: '团队另一账号已交接 Prompt 草稿。',
            status: 'handed-off',
            outputTarget: 'prompt-draft',
            resourceBundleId: 'bundle-e2e-remote-current',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }],
        },
        actionSummary: {
          records: [{
            id: 'action-e2e-remote-current',
            queueItemId: 'queue-e2e-remote-current',
            campaignCellId: 'cell-e2e-remote-current',
            actionType: 'generate-prompt-draft',
            title: '远端团队已生成 Prompt',
            outcome: 'handoff',
            actorLabel: '远端团队成员',
            actorRole: 'operator',
            inputSummary: '远端团队资源包。',
            outputSummary: '已交接 Prompt 工作台。',
            promptDraftId: 'remote-prompt-1',
            artifactRefs: ['prompt-draft:remote-prompt-1'],
            createdAt: new Date().toISOString(),
          }],
        },
        constraints: ['远端团队边界：不能绝对化表达。'],
        gaps: [],
        baseRevision: 'rev-remote-current-build',
        serverRevision: 'rev-remote-current-command',
        createdAt: new Date().toISOString(),
        updatedAt: new Date(Date.now() + 2000).toISOString(),
      });
      bugu.addRelease({
        id: 'release-e2e-remote-refresh',
        workspaceId: 'workspace-e2e-content',
        contentKnowledgeMapId: remoteReleaseMapId,
        contentKnowledgeMapTitle: '远端已确认内容地图',
        title: '远端团队更新包',
        version: 'v9.9',
        status: 'published',
        baseRevision: 'rev-remote-refresh-base',
        serverRevision: 'rev-remote-refresh',
        packageManifest: { files: ['KNOWLEDGE.md', 'manifest.json', 'ontology/ontology.json'] },
        packageObjectKey: 'content-workspaces/workspace-e2e-content/agentknowledge/release-e2e-remote-refresh.zip',
        packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-e2e-content/agentknowledge/release-e2e-remote-refresh.zip',
        packageStorageProvider: 'r2',
        packageUploadStatus: 'stored',
        packageSha256: 'f'.repeat(64),
        packageSize: 4096,
        approvalStatus: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date(Date.now() + 1000).toISOString(),
      });
      await page.locator('.content-map-tabs button').filter({ hasText: '团队知识包' }).click();
      await page.locator('.content-map-package-primary-actions button').filter({ hasText: '拉取团队更新' }).click();
      await expect(mapWorkbench.locator('.content-map-package-content')).toContainText('远端团队更新包 v9.9', { timeout: 20_000 });
      await expect(mapWorkbench.locator('.content-map-release-history')).toContainText('v9.9');
      await expect.poll(
        () => bugu.listRequests.filter((request) => (
          request.route === 'content-knowledge-maps' ||
          request.route === 'content-build-runs' ||
          request.route === 'content-command-centers'
        )).length,
        { message: `等待三类 Bugu current GET 请求，当前请求：${JSON.stringify(bugu.listRequests)}`, timeout: 20_000 },
      ).toBeGreaterThanOrEqual(3);
      let refreshTrace;
      await expect.poll(
        async () => {
          refreshTrace = await page.evaluate(async (workspacePath) => {
          const [maps, buildRuns, commandCenters, releases] = await Promise.all([
            window.contentStudio.listContentKnowledgeMaps(workspacePath),
            window.contentStudio.listContentKnowledgeMapBuildRuns(workspacePath),
            window.contentStudio.listBrandCommandCenters(workspacePath),
            window.contentStudio.listContentKnowledgeReleases(workspacePath),
          ]);
          const remote = releases.find((release) => release.id === 'release-e2e-remote-refresh');
          const remoteMap = maps.find((map) => map.id === 'map-e2e-remote-current');
          const remoteBuildRun = buildRuns.find((run) => run.id === 'build-run-e2e-remote-current');
          const remoteCommandCenter = commandCenters.find((record) => record.id === 'command-center-e2e-remote-current');
          return {
            mapTitles: maps.map((map) => map.title),
            buildRunTitles: buildRuns.map((run) => run.title),
            commandCenterTitles: commandCenters.map((record) => record.title),
            hasRemoteMap: Boolean(remoteMap),
            remoteMapTitle: remoteMap?.title,
            remoteSellingTitle: remoteMap?.sellingPoints[0]?.title,
            remoteMapRevision: remoteMap?.teamSync?.revision,
            hasRemoteBuildRun: Boolean(remoteBuildRun),
            remoteBuildRunStep: remoteBuildRun?.steps[0]?.key,
            remoteBuildRunRevision: remoteBuildRun?.teamSync?.revision,
            hasRemoteCommandCenter: Boolean(remoteCommandCenter),
            remoteCommandCenterTitle: remoteCommandCenter?.title,
            remoteCommandCenterAction: remoteCommandCenter?.actionRecords[0]?.promptDraftId,
            remoteCommandCenterRevision: remoteCommandCenter?.teamSync?.revision,
            hasRemote: Boolean(remote),
            remoteStatus: remote?.status,
            remotePublicUrl: remote?.packagePublicUrl,
            remoteFiles: remote?.files ?? [],
          };
          }, workspaceDir);
          return refreshTrace;
        },
        { message: '等待三类 Bugu current 事实源读回本机缓存', timeout: 20_000 },
      ).toMatchObject({
        hasRemoteMap: true,
        hasRemoteBuildRun: true,
        hasRemoteCommandCenter: true,
        hasRemote: true,
      });
      await expect(mapWorkbench.locator('.prompt-draft-list')).toContainText('远端团队内容地图');
      await mapWorkbench.locator('.prompt-draft-list .prompt-draft-card').filter({ hasText: '远端团队内容地图' }).click();
      await expect(mapWorkbench).toContainText('远端团队清爽补涂');
      await page.locator('.content-map-tabs button').filter({ hasText: '生成流程' }).click();
      await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('远端团队生成流程');
      await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('远端团队质量检查');
      expect(refreshTrace.hasRemoteMap, JSON.stringify(refreshTrace)).toBe(true);
      expect(refreshTrace.remoteMapTitle, JSON.stringify(refreshTrace)).toBe('远端团队内容地图');
      expect(refreshTrace.remoteSellingTitle, JSON.stringify(refreshTrace)).toBe('远端团队清爽补涂');
      expect(refreshTrace.remoteMapRevision, JSON.stringify(refreshTrace)).toBe('rev-remote-current-map');
      expect(refreshTrace.hasRemoteBuildRun, JSON.stringify(refreshTrace)).toBe(true);
      expect(refreshTrace.remoteBuildRunStep, JSON.stringify(refreshTrace)).toBe('remote-team-quality-check');
      expect(refreshTrace.remoteBuildRunRevision, JSON.stringify(refreshTrace)).toBe('rev-remote-current-build');
      expect(refreshTrace.hasRemoteCommandCenter, JSON.stringify(refreshTrace)).toBe(true);
      expect(refreshTrace.remoteCommandCenterTitle, JSON.stringify(refreshTrace)).toBe('远端团队品牌作战系统');
      expect(refreshTrace.remoteCommandCenterAction, JSON.stringify(refreshTrace)).toBe('remote-prompt-1');
      expect(refreshTrace.remoteCommandCenterRevision, JSON.stringify(refreshTrace)).toBe('rev-remote-current-command');
      expect(refreshTrace.hasRemote, JSON.stringify(refreshTrace)).toBe(true);
      expect(refreshTrace.remoteStatus, JSON.stringify(refreshTrace)).toBe('published');
      expect(refreshTrace.remotePublicUrl, JSON.stringify(refreshTrace)).toMatch(/^https:\/\/downloads\.bugu\.run\/content-workspaces\//);
      expect(refreshTrace.remoteFiles, JSON.stringify(refreshTrace)).toEqual(expect.arrayContaining(['KNOWLEDGE.md', 'manifest.json']));
      expect(bugu.listRequests.some((request) => request.route === 'content-knowledge-maps' && request.workspaceId === 'workspace-e2e-content' && request.limit === '100'), JSON.stringify(bugu.listRequests)).toBe(true);
      expect(bugu.listRequests.some((request) => request.route === 'content-build-runs' && request.workspaceId === 'workspace-e2e-content' && request.limit === '100'), JSON.stringify(bugu.listRequests)).toBe(true);
      expect(bugu.listRequests.some((request) => request.route === 'content-command-centers' && request.workspaceId === 'workspace-e2e-content' && request.limit === '100'), JSON.stringify(bugu.listRequests)).toBe(true);

      await clickNavItem(page, '品牌战情室');
      await expect(page.locator('.brand-command-workbench .prompt-draft-list')).toContainText('远端团队品牌作战系统', { timeout: 20_000 });
      await page.locator('.brand-command-workbench .prompt-draft-card').filter({ hasText: '远端团队品牌作战系统' }).click();
      await expect(page.locator('.brand-command-workbench')).toContainText('远端团队反馈信号');
      await page.locator('.brand-command-workbench .content-map-tabs button').filter({ hasText: '行动记录' }).click();
      await expect(page.locator('.brand-command-workbench')).toContainText('remote-prompt-1');

      bugu.addSyncConflict({
        id: 'conflict-e2e-team-merge',
        workspaceId: 'workspace-e2e-content',
        sourceType: 'draft-change',
        sourceId: 'draft-change-e2e-old-revision',
        title: '清爽命名团队冲突',
        summary: '本机提交把“清爽不搓泥”改成“轻薄不搓泥”，但团队当前版本已补充防晒备案边界。',
        status: 'open',
        baseRevision: 'rev-team-ui-1',
        serverRevision: 'rev-remote-conflict',
        affectedObjectIds: [`content-map:${remoteReleaseMapId}`, 'selling-point:sp-team-light'],
        affectedObjects: [{
          id: `content-map:${remoteReleaseMapId}`,
          objectId: remoteReleaseMapId,
          objectType: 'content-map',
          title: '防晒团队知识地图',
          summary: '本机变更包基于旧团队版本，影响当前内容地图。',
          localValue: '本机提交：轻薄不搓泥',
          teamValue: '团队当前：清爽不搓泥 + 防晒备案边界',
          impact: 'high',
          recommendation: '先转人工确认，避免覆盖团队新增备案边界。',
        }, {
          id: 'selling-point:sp-team-light',
          objectId: 'sp-team-light',
          objectType: 'selling-point',
          title: '清爽不搓泥',
          summary: '卖点命名与团队当前版本存在差异。',
          localValue: '轻薄不搓泥',
          teamValue: '清爽不搓泥',
          impact: 'medium',
          recommendation: '保留团队表达，把轻薄作为别名或新变更包提交。',
        }],
        authorLabel: 'E2E 旧版本用户',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      await clickNavItem(page, '内容知识地图');
      await mapWorkbench.locator('.prompt-draft-list .prompt-draft-card').filter({ hasText: '防晒团队知识地图' }).click();
      await page.locator('.content-map-tabs button').filter({ hasText: '团队知识包' }).click();
      await page.locator('.content-map-package-primary-actions button').filter({ hasText: '拉取团队更新' }).click();
      const conflictList = mapWorkbench.locator('.content-map-conflict-list');
      await expect(conflictList).toContainText('清爽命名团队冲突', { timeout: 20_000 });
      await expect(conflictList).toContainText('轻薄不搓泥');
      await conflictList.getByRole('button', { name: '查看清单' }).click();
      await expect(mapWorkbench.locator('.content-map-merge-draft')).toContainText('防晒团队知识地图');
      await expect(mapWorkbench.locator('.content-map-merge-draft')).toContainText('本机提交');
      await expect(mapWorkbench.locator('.content-map-merge-draft')).toContainText('团队当前');
      await conflictList.getByRole('button', { name: '按清单转人工确认' }).click();
      await expect.poll(
        async () => page.evaluate(async ({ workspacePath, contentKnowledgeMapId }) => {
          const maps = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
          const map = maps.find((item) => item.id === contentKnowledgeMapId);
          const conflicts = await window.contentStudio.listContentSyncConflicts(workspacePath);
          return {
            syncStatus: map?.syncStatus,
            syncMessage: map?.teamSync?.message,
            openConflictCount: conflicts.filter((conflict) => conflict.status === 'open').length,
          };
        }, { workspacePath: workspaceDir, contentKnowledgeMapId: remoteReleaseMapId }),
        { message: '等待同步冲突处理回写本机地图状态', timeout: 20_000 },
      ).toEqual({
        syncStatus: 'pending-sync',
        syncMessage: '冲突处理已记录，请重新生成变更包并提交团队工作区。',
        openConflictCount: 0,
      });
      const conflictResolveRequest = bugu.requests.find((request) => (
        request.route === 'content-sync-conflicts' &&
        request.payload.conflictId === 'conflict-e2e-team-merge'
      ));
      expect(conflictResolveRequest?.payload.resolutionAction, JSON.stringify(bugu.requests)).toBe('manual-review-recorded');
      expect(conflictResolveRequest?.payload.mergeDraft?.rows?.length, JSON.stringify(conflictResolveRequest)).toBeGreaterThanOrEqual(2);
    }, { env: { CONTENT_STUDIO_BUGU_CONTENT_API_BASE_URL: bugu.baseUrl } });
  } finally {
    await bugu.close();
  }
});

test('内容知识地图会把仅本机资料阻断展示为共享范围处理任务', async ({}, testInfo) => {
  test.setTimeout(90_000);

  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    const seedTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      await api.saveSettings({ workspacePath });
      const restrictedSource = await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'sop-input',
        title: '仅本机投放复盘',
        text: '内部投放数据：仅本机使用，禁止共享到团队。',
        summary: '仅本机投放复盘，不应进入团队知识包。',
        sensitivity: 'restricted',
        tags: ['投放数据', '禁止共享'],
      });
      const internalSource = await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '团队内部产品资料',
        text: '产品资料：轻便、低噪、适合通勤办公室。',
        summary: '团队内部产品资料。',
        sensitivity: 'internal',
        tags: ['产品资料'],
      });
      const baseMap = await api.buildContentKnowledgeMap({
        workspacePath,
        title: '仅本机共享检查地图',
        inputSourceIds: [restrictedSource.id, internalSource.id],
      });
      const now = new Date().toISOString();
      const map = await api.updateContentKnowledgeMap({
        ...baseMap,
        workspacePath,
        title: '仅本机共享检查地图',
        status: 'ready',
        syncStatus: 'blocked',
        teamSync: {
          backend: 'bugu',
          status: 'blocked',
          message: '包含仅本机资料：仅本机投放复盘。处理共享范围后才能同步或发布团队知识包。',
          workspaceId: 'workspace-sharing-gate-e2e',
        },
        sourceInputSourceIds: [restrictedSource.id, internalSource.id],
        brandKnowledgeBaseIds: [],
        ipKnowledgeBaseIds: [],
        sceneCardIds: [],
        promptDraftIds: [],
        sellingPoints: [{
          id: 'selling-sharing-gate',
          title: '内部复盘卖点',
          summary: '这条卖点引用了仅本机投放复盘，不能进入团队发布。',
          tags: ['卖点', '仅本机'],
          sourceRefs: [`input-source:${restrictedSource.id}`],
          evidenceRefs: ['evidence-sharing-gate'],
          materialStatus: 'missing',
          materialRefs: [],
          confidence: 91,
          status: 'ready',
        }],
        painPoints: [],
        scenarios: [],
        evidence: [{
          id: 'evidence-sharing-gate',
          sourceType: 'manual',
          sourceTitle: '仅本机投放复盘',
          claim: '内部复盘只允许本机使用。',
          excerpt: '内部投放数据：仅本机使用，禁止共享到团队。',
          status: 'ready',
        }],
        constraints: ['仅本机资料不能进入团队知识包。'],
        gaps: [],
        coverage: {
          inputSourceCount: 2,
          brandKnowledgeBaseCount: 0,
          ipKnowledgeBaseCount: 0,
          skuRowCount: 0,
          competitorObservationCount: 0,
          sceneCardCount: 0,
          promptDraftCount: 0,
          evidenceCount: 1,
          gapCount: 0,
          readyPercent: 88,
        },
        sourceSensitivity: {
          highest: 'restricted',
          counts: {
            public: 0,
            internal: 1,
            confidential: 0,
            restricted: 1,
          },
          restrictedSourceTitles: [restrictedSource.title],
          confidentialSourceTitles: [],
        },
        model: 'e2e-sharing-gate',
        createdAt: baseMap.createdAt || now,
        updatedAt: now,
      });
      return {
        mapTitle: map.title,
        restrictedSensitivity: restrictedSource.sensitivity,
        internalSensitivity: internalSource.sensitivity,
        syncStatus: map.syncStatus,
        restrictedCount: map.sourceSensitivity?.counts.restricted,
      };
    }, workspaceDir);
    expect(seedTrace).toMatchObject({
      mapTitle: '仅本机共享检查地图',
      restrictedSensitivity: 'restricted',
      internalSensitivity: 'internal',
      syncStatus: 'blocked',
      restrictedCount: 1,
    });

    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待共享范围测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, '内容知识地图');
    const mapWorkbench = page.locator('.content-map-workbench');
    const footer = mapWorkbench.locator('.agent-session-footer');
    await expect(mapWorkbench).toContainText('仅本机共享检查地图', { timeout: 20_000 });
    await expect(mapWorkbench.locator('.content-map-sharing-card')).toContainText('资料共享检查');
    await expect(mapWorkbench.locator('.content-map-sharing-card')).toContainText('包含不能同步或发布的资料');
    await expect(mapWorkbench.locator('.content-map-sharing-card')).toContainText('仅本机投放复盘');
    await expect(mapWorkbench.locator('.content-map-check-list')).toContainText('1 个仅本机资料');
    await expect(footer.getByRole('button', { name: '生成变更包', exact: true })).toHaveCount(0);
    await expect(footer.getByRole('button', { name: '处理共享范围', exact: true })).toBeEnabled();
    await footer.getByRole('button', { name: '处理共享范围', exact: true }).click();
    await expect(page.locator('.input-sources-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.input-sources-workbench')).toContainText('共享范围');
    await expect(page.locator('.input-sources-workbench')).toContainText('仅本机投放复盘');
    await expect(page.locator('.input-sources-workbench')).toContainText('仅本机');
  });
});

test('内容知识地图和品牌战情室能开始真实对话', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const { server, baseUrl } = await startFakeOpenAITextServer(fakeBusinessChainTextOutput);
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath, endpoint }) => {
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
          title: '地图测试产品资料',
          text: [
            '产品名称：便携条包',
            '卖点：早餐后和办公室抽屉随手取用，降低坚持门槛。',
            '禁用表达：不得承诺治疗、见效或替代专业建议。',
          ].join('\n'),
          summary: '地图测试产品资料',
          tags: ['agent-session'],
        });
        const map = await api.buildContentKnowledgeMap({
          workspacePath,
          title: '地图测试内容知识地图',
          inputSourceIds: [source.id],
        });
        await api.buildBrandCommandCenter({
          workspacePath,
          title: '地图测试品牌战情室',
          contentKnowledgeMapId: map.id,
        });
      }, { workspacePath: workspaceDir, endpoint: baseUrl });

      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待知识地图测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, '内容知识地图');
      await expect(page.locator('.content-map-workbench > .agent-session-panel')).toBeVisible({ timeout: 20_000 });
      await page.locator('.content-map-workbench .agent-session-footer textarea').fill('请给出证据缺口和下一步交付建议。');
      await page.locator('.content-map-workbench .agent-session-footer button').filter({ hasText: '开始生成' }).click();
      await expect(page.locator('.content-map-workbench .agent-turn.user')).toContainText('证据缺口', { timeout: 20_000 });
      await expect(page.locator('.content-map-workbench .agent-turn.assistant')).toContainText('图片 Prompt', { timeout: 20_000 });
      await expect(page.locator('.content-map-workbench .agent-execution-events [data-event-class="artifact.changed"][data-owner="artifact"]')).toHaveCount(1);

      await clickNavItem(page, '品牌战情室');
      await expect(page.locator('.brand-command-workbench > .agent-session-panel')).toBeVisible({ timeout: 20_000 });
      await page.locator('.brand-command-workbench .agent-session-footer textarea').fill('请判断当前队列哪些可以交接，哪些需要补资源。');
      await page.locator('.brand-command-workbench .agent-session-footer button').filter({ hasText: '开始研判' }).click();
      await expect(page.locator('.brand-command-workbench .agent-turn.user')).toContainText('当前队列', { timeout: 20_000 });
      await expect(page.locator('.brand-command-workbench .agent-turn.assistant')).toContainText('图片 Prompt', { timeout: 20_000 });

      const sessions = await page.evaluate(async (workspacePath) => {
        const all = await window.contentStudio.listAgentPromptSessions(workspacePath);
        return all.map((session) => ({ title: session.title, messageCount: session.messages.length }));
      }, workspaceDir);
      expect(sessions.some((session) => session.title.includes('内容知识地图协作') && session.messageCount >= 2)).toBe(true);
      expect(sessions.some((session) => session.title.includes('品牌战情室协作') && session.messageCount >= 2)).toBe(true);
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('内容知识地图 v1 真实工作台支持下钻、素材回写和作战入口', async ({}, testInfo) => {
  test.setTimeout(120_000);

  const bugu = await startFakeBuguContentWorkspaceServer();
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir, e2eProductAssetPath }) => {
    const latestCommandCenterRequest = () => [...bugu.requests]
      .reverse()
      .find((request) => request.route === 'content-command-centers');

    const seedTrace = await page.evaluate(async ({ workspacePath, assetPath }) => {
      const api = window.contentStudio;
      await api.saveSettings({ workspacePath });

      const productSource = await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: 'BreezeGo Air 产品资料',
        text: [
          '产品：BreezeGo Air 便携风扇',
          'SKU：Air Mini 218g；Air Pro 低档 9-14h；Air Clip 可夹桌边和通勤包。',
          '禁用表达：不得使用全网最轻、绝对安全、3 秒降温。',
        ].join('\n'),
        summary: 'BreezeGo Air 便携风扇产品资料',
        tags: ['v1-ui', 'product'],
      });
      const feedbackSource = await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'user-feedback',
        title: 'BreezeGo Air 评论原声',
        text: [
          '用户：包里东西已经很多，不想再多带很重的风扇。',
          '客服：低档能撑多久？办公室会不会吵？',
        ].join('\n'),
        summary: '评论和客服异议',
        tags: ['v1-ui', 'feedback'],
      });
      const assetSource = await api.registerInputSource({
        workspacePath,
        kind: 'image',
        purpose: 'successful-asset',
        title: '通勤包内实拍图',
        sourcePath: assetPath,
        summary: '已通过审核的通勤包内实拍素材。',
        tags: ['v1-ui', 'coverage:selling-v1-light', '高收藏'],
      });
      const assetReview = await api.reviewAsset({
        workspacePath,
        assetKey: `imported:${assetSource.id}:0:${assetPath}`,
        kind: 'image',
        sourceType: 'input-source',
        sourceId: assetSource.id,
        path: assetPath,
        title: '通勤包内实拍图',
        status: 'approved',
        note: 'E2E 通过素材，用于验证覆盖关系。',
        tags: ['通勤包内', '高收藏'],
      });

      const baseMap = await api.buildContentKnowledgeMap({
        workspacePath,
        title: 'BreezeGo Air v1 真实工作台地图',
        inputSourceIds: [productSource.id, feedbackSource.id],
      });
      const now = new Date().toISOString();
      const readyMap = await api.updateContentKnowledgeMap({
        ...baseMap,
        workspacePath,
        title: 'BreezeGo Air v1 真实工作台地图',
        status: 'ready',
        syncStatus: 'synced',
        teamSync: {
          backend: 'bugu',
          status: 'synced',
          message: '已同步到测试团队工作区。',
          workspaceId: 'workspace-v1-e2e',
          revision: 'rev-v1-e2e-1',
        },
        sourceInputSourceIds: [productSource.id, feedbackSource.id],
        brandKnowledgeBaseIds: [],
        ipKnowledgeBaseIds: ['ip-v1-e2e'],
        sceneCardIds: ['scene-v1-e2e'],
        promptDraftIds: ['prompt-v1-e2e'],
        sellingPoints: [{
          id: 'selling-v1-light',
          title: '轻量便携不压包',
          summary: 'Air Mini 218g，适合通勤包、办公室抽屉和随身携带场景。',
          tags: ['卖点', '通勤', 'SKU: Air Mini'],
          sourceRefs: [`input-source:${productSource.id}`],
          evidenceRefs: ['evidence-v1-weight'],
          materialStatus: 'approved',
          materialRefs: [assetReview.id],
          performanceTags: ['高收藏', '通勤包内'],
          confidence: 92,
          status: 'ready',
        }, {
          id: 'selling-v1-video-material',
          title: '续航竖版视频素材缺口',
          summary: 'Air Pro 低档 9-14h 可以回答办公室续航异议，但短视频生产还缺竖版实拍素材。',
          tags: ['卖点', '续航', 'SKU: Air Pro', '补素材'],
          sourceRefs: [`input-source:${productSource.id}`, `input-source:${feedbackSource.id}`],
          evidenceRefs: ['evidence-v1-battery'],
          materialStatus: 'missing',
          materialRefs: [],
          performanceTags: ['高咨询'],
          confidence: 82,
          status: 'ready',
        }, {
          id: 'selling-v1-ip',
          title: '轻量生活方法口播',
          summary: 'IP 口径强调少带负担、真实体验和轻量生活方法，不夸大降温。',
          tags: ['IP', '口播', '语言规则'],
          sourceRefs: ['ip-knowledge-base:ip-v1-e2e'],
          evidenceRefs: ['evidence-v1-ip'],
          materialStatus: 'covered',
          materialRefs: [assetReview.id],
          confidence: 84,
          status: 'ready',
        }],
        painPoints: [{
          id: 'pain-v1-bag',
          title: '包里东西太多',
          summary: '评论集中担心多带一个风扇会增加通勤负担。',
          tags: ['痛点', '评论原声'],
          sourceRefs: [`input-source:${feedbackSource.id}`],
          evidenceRefs: ['evidence-v1-quote'],
          materialStatus: 'covered',
          materialRefs: [assetReview.id],
          performanceTags: ['收藏率高于均值'],
          confidence: 86,
          status: 'ready',
        }],
        scenarios: [{
          id: 'scenario-v1-commute',
          title: '早高峰轻装通勤',
          summary: '手持包内实拍图，表达 218g 轻量和低负担携带。',
          tags: ['场景', '小红书', '通勤'],
          sourceRefs: [`input-source:${productSource.id}`],
          evidenceRefs: ['evidence-v1-weight', 'evidence-v1-quote'],
          materialStatus: 'approved',
          materialRefs: [assetReview.id],
          confidence: 88,
          status: 'ready',
        }, {
          id: 'scenario-v1-competitor',
          title: '竞品超小随身差异化机会',
          summary: '竞品强调超小随身，本品牌只能用于结构参考，转写为通勤低负担机会。',
          tags: ['竞品', '差异化机会', '不可搬运'],
          sourceRefs: ['competitor-observation:v1-e2e'],
          evidenceRefs: ['evidence-v1-competitor'],
          materialStatus: 'covered',
          materialRefs: [assetReview.id],
          confidence: 78,
          status: 'ready',
        }],
        evidence: [{
          id: 'evidence-v1-weight',
          sourceType: 'manual',
          sourceTitle: '产品 SKU 表',
          claim: 'Air Mini 218g 净重',
          excerpt: 'SKU 表记录 Air Mini 净重 218g，可用于轻量便携表达。',
          status: 'ready',
        }, {
          id: 'evidence-v1-battery',
          sourceType: 'manual',
          sourceTitle: 'Air Pro 续航记录',
          claim: 'Air Pro 低档 9-14h',
          excerpt: '产品资料记录 Air Pro 低档续航 9-14h，可用于办公室续航异议回答。',
          status: 'ready',
        }, {
          id: 'evidence-v1-quote',
          sourceType: 'user-quote',
          sourceTitle: '评论样本',
          claim: '用户担心包里负担',
          excerpt: '用户原声：包里东西已经很多，不想再多带很重的风扇。',
          status: 'ready',
        }, {
          id: 'evidence-v1-ip',
          sourceType: 'ip-knowledge-base',
          sourceTitle: '林小北 IP 六层资料',
          claim: '轻量生活方法',
          excerpt: 'IP 口径强调减负、真实体验和轻量生活方法，不使用夸大承诺。',
          status: 'ready',
        }, {
          id: 'evidence-v1-competitor',
          sourceType: 'manual',
          sourceTitle: '竞品公开内容摘要',
          claim: '竞品强调超小随身',
          excerpt: '只允许用于内容结构和差异机会参考，不能复制竞品文案或视觉元素。',
          status: 'ready',
        }],
        constraints: [
          '平台规则：小红书和抖音发布前必须复核禁用表达。',
          '竞品观察只做差异化结构参考，禁止复制竞品文案或视觉元素。',
          '不得使用全网最轻、绝对安全、3 秒降温。',
        ],
        gaps: [],
        coverage: {
          inputSourceCount: 2,
          brandKnowledgeBaseCount: 0,
          ipKnowledgeBaseCount: 1,
          skuRowCount: 3,
          competitorObservationCount: 1,
          sceneCardCount: 1,
          promptDraftCount: 1,
          evidenceCount: 5,
          gapCount: 0,
          readyPercent: 92,
        },
        model: 'e2e-v1-ui',
        createdAt: baseMap.createdAt || now,
        updatedAt: now,
      });

      await api.createContentKnowledgeRelease({
        workspacePath,
        contentKnowledgeMapId: readyMap.id,
        title: 'BreezeGo Air 团队知识包',
        version: 'v1.4',
      });
      const reviewTasks = await api.generateContentReviewTasks({
        workspacePath,
        contentKnowledgeMapId: readyMap.id,
        targetRowIds: [
          'selling-v1-light',
          'selling-v1-video-material',
          'selling-v1-ip',
          'pain-v1-bag',
          'scenario-v1-commute',
          'scenario-v1-competitor',
        ],
      });
      for (const task of reviewTasks) {
        await api.submitContentReviewDecision({
          workspacePath,
          taskId: task.id,
          action: 'approve',
          reviewerLabel: 'E2E 审核员',
          reason: 'E2E 种子内容已完成证据、素材和平台边界校验。',
        });
      }
      const commandCenter = await api.buildBrandCommandCenter({
        workspacePath,
        contentKnowledgeMapId: readyMap.id,
        title: 'BreezeGo Air 品牌战情室',
      });
      const [settings, maps, buildRuns, sources, releases, commandCenters, assetReviews] = await Promise.all([
        api.getSettings(),
        api.listContentKnowledgeMaps(workspacePath),
        api.listContentKnowledgeMapBuildRuns(workspacePath),
        api.listInputSources(workspacePath),
        api.listContentKnowledgeReleases(workspacePath),
        api.listBrandCommandCenters(workspacePath),
        api.listAssetReviews(workspacePath),
      ]);
      return {
        savedWorkspacePath: settings.workspacePath,
        mapId: readyMap.id,
        mapCount: maps.length,
        mapTitles: maps.map((item) => item.title),
        buildRunCount: buildRuns.length,
        buildRunStepTitles: buildRuns.flatMap((run) => run.steps.map((step) => step.title)),
        buildRunMessages: buildRuns.flatMap((run) => run.steps.map((step) => step.message)),
        sourceCount: sources.length,
        sourceTitles: sources.map((item) => item.title),
        releaseCount: releases.length,
        releaseTitles: releases.map((item) => `${item.title} ${item.version}`),
        commandCenterCount: commandCenters.length,
        commandCenterTitles: commandCenters.map((item) => item.title),
        assetReviewCount: assetReviews.length,
        approvedReviewCount: reviewTasks.length,
      };
    }, { workspacePath: workspaceDir, assetPath: e2eProductAssetPath });
    expect(seedTrace.savedWorkspacePath, JSON.stringify(seedTrace)).toBe(workspaceDir);
    expect(seedTrace.mapTitles, JSON.stringify(seedTrace)).toContain('BreezeGo Air v1 真实工作台地图');
    expect(seedTrace.buildRunCount, JSON.stringify(seedTrace)).toBeGreaterThanOrEqual(1);
    expect(seedTrace.buildRunStepTitles, JSON.stringify(seedTrace)).toEqual(expect.arrayContaining(['检查生成服务', '生成结构化矩阵']));
    expect(seedTrace.buildRunMessages.join('\n'), JSON.stringify(seedTrace)).toContain('生成服务');
    expect(seedTrace.sourceCount, JSON.stringify(seedTrace)).toBeGreaterThanOrEqual(3);
    expect(seedTrace.releaseTitles, JSON.stringify(seedTrace)).toContain('BreezeGo Air 团队知识包 v1.4');
    expect(seedTrace.commandCenterTitles, JSON.stringify(seedTrace)).toContain('BreezeGo Air 品牌战情室');
    expect(seedTrace.assetReviewCount, JSON.stringify(seedTrace)).toBeGreaterThanOrEqual(1);
    expect(seedTrace.approvedReviewCount, JSON.stringify(seedTrace)).toBe(6);
    const queueSeedTrace = await appendE2EBrandCommandQueueDeliverables(workspaceDir);
    expect(queueSeedTrace.centerId, JSON.stringify(queueSeedTrace)).toBeTruthy();
    expect(queueSeedTrace.actionTypes, JSON.stringify(queueSeedTrace)).toEqual(expect.arrayContaining([
      'create-scene-card',
      'launch-sop-run',
      'write-back-material-coverage',
    ]));
    const initialCommandCenterRequest = latestCommandCenterRequest();
    expect(initialCommandCenterRequest?.route, JSON.stringify(bugu.requests)).toBe('content-command-centers');
    expect(initialCommandCenterRequest?.payload.title, JSON.stringify(bugu.requests)).toBe('BreezeGo Air 品牌战情室');
    expect(initialCommandCenterRequest?.payload.sourceKnowledgeMapId, JSON.stringify(bugu.requests)).toBe(seedTrace.mapId);
    expect(initialCommandCenterRequest?.payload.snapshot?.signals?.length, JSON.stringify(bugu.requests)).toBeGreaterThan(0);
    expect(initialCommandCenterRequest?.payload.snapshot?.resourceBundles?.length, JSON.stringify(bugu.requests)).toBeGreaterThan(0);
    expect(initialCommandCenterRequest?.payload.snapshot?.queueSummary?.items?.length, JSON.stringify(bugu.requests)).toBeGreaterThan(0);

    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待 v1 工作台测试数据重新加载', timeout: 20_000 },
    ).toBe(true);
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const api = window.contentStudio;
        const [settings, maps, sources] = await Promise.all([
          api.getSettings(),
          api.listContentKnowledgeMaps(workspacePath),
          api.listInputSources(workspacePath),
        ]);
        return {
          workspaceReady: settings.workspacePath === workspacePath,
          mapTitles: maps.map((item) => item.title),
          sourceCount: sources.length,
        };
      }, workspaceDir),
      { message: '等待 v1 工作台读取种子数据', timeout: 20_000 },
    ).toEqual({
      workspaceReady: true,
      mapTitles: expect.arrayContaining(['BreezeGo Air v1 真实工作台地图']),
      sourceCount: 3,
    });
    const refreshLoadTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const calls = [
        ['scanSkills', () => api.scanSkills(workspacePath)],
        ['listKnowledgeBases', () => api.listKnowledgeBases(workspacePath)],
        ['searchKnowledge', () => api.searchKnowledge({ workspacePath, query: '', baseType: 'all', sectionType: 'all', tag: '' })],
        ['getSkillSelection', () => api.getSkillSelection(workspacePath)],
        ['listPromptPacks', () => api.listPromptPacks(workspacePath)],
        ['listSceneCards', () => api.listSceneCards(workspacePath)],
        ['listGenerationLogs', () => api.listGenerationLogs(workspacePath)],
        ['listGenerationTasks', () => api.listGenerationTasks(workspacePath)],
        ['listInputSources', () => api.listInputSources(workspacePath)],
        ['listPromptDrafts', () => api.listPromptDrafts(workspacePath)],
        ['listAgentPromptSessions', () => api.listAgentPromptSessions(workspacePath)],
        ['listBrandKnowledgeBases', () => api.listBrandKnowledgeBases(workspacePath)],
        ['listIpKnowledgeBases', () => api.listIpKnowledgeBases(workspacePath)],
        ['listContentKnowledgeMaps', () => api.listContentKnowledgeMaps(workspacePath)],
        ['listContentDraftChanges', () => api.listContentDraftChanges(workspacePath)],
        ['listContentKnowledgeReleases', () => api.listContentKnowledgeReleases(workspacePath)],
        ['listContentSyncConflicts', () => api.listContentSyncConflicts(workspacePath)],
        ['listBrandCommandCenters', () => api.listBrandCommandCenters(workspacePath)],
        ['listContentReviewTasks', () => api.listContentReviewTasks(workspacePath)],
        ['listOverlayCards', () => api.listOverlayCards(workspacePath)],
        ['listAssetReviews', () => api.listAssetReviews(workspacePath)],
        ['listMixPackages', () => api.listMixPackages(workspacePath)],
        ['listPlatformDrafts', () => api.listPlatformDrafts(workspacePath)],
        ['listWorkflowDefinitions', () => api.listWorkflowDefinitions(workspacePath)],
        ['listWorkflowRuns', () => api.listWorkflowRuns(workspacePath)],
      ];
      const results = [];
      for (const [name, load] of calls) {
        try {
          const value = await load();
          results.push({
            name,
            status: 'fulfilled',
            count: Array.isArray(value) ? value.length : undefined,
          });
        } catch (error) {
          results.push({
            name,
            status: 'rejected',
            reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
      return results;
    }, workspaceDir);
    expect(
      refreshLoadTrace.filter((item) => item.status === 'rejected'),
      JSON.stringify(refreshLoadTrace),
    ).toEqual([]);
    expect(
      refreshLoadTrace.find((item) => item.name === 'listContentKnowledgeMaps')?.count,
      JSON.stringify(refreshLoadTrace),
    ).toBeGreaterThanOrEqual(1);

    await clickNavItem(page, '内容知识地图');
    const mapWorkbench = page.locator('.content-map-workbench');
    await expect(mapWorkbench).toContainText('BreezeGo Air v1 真实工作台地图');
    await page.locator('.content-map-tabs button').filter({ hasText: '生成流程' }).click();
    await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('生成流程');
    await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('检查生成服务');
    await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('生成结构化矩阵');
    await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('补输入源');
    await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('重新生成地图');
    await page.locator('.content-map-tabs button').filter({ hasText: '卖点矩阵' }).click();
    await mapWorkbench.locator('.content-map-table tbody tr').filter({ hasText: '轻量便携不压包' }).click();
    await expect(mapWorkbench.locator('.content-map-row-detail')).toContainText('当前组合');
    await expect(mapWorkbench.locator('.content-map-row-detail')).toContainText('218g');
    await expect(mapWorkbench.locator('.content-map-row-detail')).toContainText('恢复路径');
    await expect(mapWorkbench.locator('.content-map-row-detail')).toContainText('生成 Prompt 草稿');
    await expect(mapWorkbench.locator('.content-map-row-detail')).toContainText('生成场景卡');
    await expect(mapWorkbench.locator('.content-map-row-detail')).toContainText('启动 SOP');
    await mapWorkbench.locator('.content-map-row-detail-actions button').filter({ hasText: '生成 Prompt 草稿' }).click();
    await expect(page.locator('.prompt-workbench')).toBeVisible();
    await expect(page.locator('.prompt-workbench')).toContainText('轻量便携不压包 生产提示词');
    await clickNavItem(page, '内容知识地图');
    await mapWorkbench.locator('.content-map-table tbody tr').filter({ hasText: '轻量便携不压包' }).click();
    await mapWorkbench.locator('.content-map-row-detail-actions button').filter({ hasText: '生成场景卡' }).click();
    await expect(page.locator('.scene-prompt-workbench')).toBeVisible();
    await expect(page.locator('.scene-prompt-workbench')).toContainText('轻量便携不压包');
    await clickNavItem(page, '内容知识地图');
    await mapWorkbench.locator('.content-map-table tbody tr').filter({ hasText: '轻量便携不压包' }).click();
    await mapWorkbench.locator('.content-map-row-detail-actions button').filter({ hasText: '启动 SOP' }).click();
    await expect(page.locator('.workflow-feature-workbench')).toBeVisible();
    await expect(page.locator('.workflow-feature-workbench')).toContainText('轻量便携不压包', { timeout: 20_000 });
    const rowHandoffRun = await page.evaluate(async (workspacePath) => {
      const runs = await window.contentStudio.listWorkflowRuns(workspacePath);
      return runs.find((run) => String(run.inputs?.intent || '').includes('轻量便携不压包'));
    }, workspaceDir);
    expect(rowHandoffRun?.title, JSON.stringify(rowHandoffRun)).toBe('品牌知识库场景提示词 SOP');
    expect(rowHandoffRun?.inputs?.source, JSON.stringify(rowHandoffRun)).toContain('审核任务：轻量便携不压包');
    expect(rowHandoffRun?.artifactRefs?.some((ref) => ref.startsWith('workflow-run:')), JSON.stringify(rowHandoffRun)).toBe(true);

    await clickNavItem(page, '内容知识地图');
    await page.locator('.content-map-tabs button').filter({ hasText: '卖点矩阵' }).click();
    await page.locator('.content-map-tabs button').filter({ hasText: 'IP 口径' }).click();
    await expect(mapWorkbench.locator('.content-map-table')).toContainText('轻量生活方法口播');
    await page.locator('.content-map-tabs button').filter({ hasText: '竞品观察' }).click();
    await expect(mapWorkbench.locator('.content-map-table')).toContainText('竞品超小随身差异化机会');
    await page.locator('.content-map-tabs button').filter({ hasText: '团队知识包' }).click();
    await expect(mapWorkbench.locator('.content-map-package-content')).toContainText('BreezeGo Air 团队知识包 v1.4');
    await expect(mapWorkbench.locator('.content-map-package-content')).toContainText('产品事实 / 证据');
    await expect(mapWorkbench.locator('.content-map-package-primary-actions .primary')).toHaveCount(1);
    await expect(mapWorkbench.locator('.content-map-delivery-actions .primary')).toHaveCount(0);
    await mapWorkbench.locator('.content-map-package-content button').filter({ hasText: '生成 Prompt 草稿' }).click();
    await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.prompt-workbench')).toContainText('BreezeGo Air 团队知识包 v1.4 / Prompt 依据');
    await expect(page.locator('.prompt-draft-editor')).toHaveValue(/团队知识包：BreezeGo Air 团队知识包 v1\.4/);
    await expect(page.locator('.prompt-draft-editor')).toHaveValue(/可复用卖点/);
    await expect(page.locator('.prompt-draft-editor')).toHaveValue(/禁用边界/);
    const teamKnowledgeDraft = await page.evaluate(async (workspacePath) => {
      const drafts = await window.contentStudio.listPromptDrafts(workspacePath);
      const draft = drafts.find((item) => item.title === 'BreezeGo Air 团队知识包 v1.4 / Prompt 依据');
      return {
        title: draft?.title,
        status: draft?.status,
        purpose: draft?.purpose,
        mapId: draft?.contentKnowledgeMapId,
        mapTitle: draft?.contentKnowledgeMapTitle,
        teamReleaseTitle: draft?.teamKnowledgeRelease?.title,
        teamReleaseVersion: draft?.teamKnowledgeRelease?.version,
        coverageRowIds: draft?.coverageRowIds ?? [],
        sourceRefs: draft?.sourceRefs ?? [],
        content: draft?.versions.find((version) => version.id === draft.activeVersionId)?.content ?? '',
      };
    }, workspaceDir);
    expect(teamKnowledgeDraft.title, JSON.stringify(teamKnowledgeDraft)).toBe('BreezeGo Air 团队知识包 v1.4 / Prompt 依据');
    expect(teamKnowledgeDraft.status, JSON.stringify(teamKnowledgeDraft)).toBe('draft');
    expect(teamKnowledgeDraft.purpose, JSON.stringify(teamKnowledgeDraft)).toBe('image');
    expect(teamKnowledgeDraft.mapTitle, JSON.stringify(teamKnowledgeDraft)).toBe('BreezeGo Air v1 真实工作台地图');
    expect(teamKnowledgeDraft.teamReleaseTitle, JSON.stringify(teamKnowledgeDraft)).toBe('BreezeGo Air 团队知识包');
    expect(teamKnowledgeDraft.teamReleaseVersion, JSON.stringify(teamKnowledgeDraft)).toBe('v1.4');
    expect(teamKnowledgeDraft.coverageRowIds, JSON.stringify(teamKnowledgeDraft)).toEqual(
      expect.arrayContaining(['selling-v1-light', 'pain-v1-bag', 'scenario-v1-commute']),
    );
    expect(teamKnowledgeDraft.sourceRefs, JSON.stringify(teamKnowledgeDraft)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^content-knowledge-map:/),
        expect.stringMatching(/^content-knowledge-release:/),
        expect.stringMatching(/^input-source:/),
      ]),
    );
    expect(teamKnowledgeDraft.content, JSON.stringify(teamKnowledgeDraft)).toContain('不能把知识包标题、版本号或文件地址当成产品事实');
    expect(teamKnowledgeDraft.content, JSON.stringify(teamKnowledgeDraft)).toContain('节奏');
    await clickNavItem(page, '内容知识地图');
    await page.locator('.content-map-tabs button').filter({ hasText: '素材回写' }).click();
    await expect(mapWorkbench.locator('.content-map-material-panel')).toContainText('轻量便携不压包');
    await expect(mapWorkbench.locator('.content-map-material-panel')).toContainText('高收藏');
    await expect(mapWorkbench.locator('.content-map-material-panel')).toContainText('续航竖版视频素材缺口');
    await mapWorkbench.locator('.content-map-material-panel button').filter({ hasText: '创建补素材任务' }).click();
    await expect(page.locator('.content-review-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.content-review-workbench')).toContainText('补素材：续航竖版视频素材缺口');
    await expect(page.locator('.content-review-workbench')).toContainText('待补素材');
    const materialSupplementTask = await page.evaluate(async (workspacePath) => {
      const tasks = await window.contentStudio.listContentReviewTasks(workspacePath);
      return tasks.find((task) => (
        task.targetId === 'selling-v1-video-material' &&
        task.taskPurpose === 'material-supplement'
      ));
    }, workspaceDir);
    expect(materialSupplementTask?.status, JSON.stringify(materialSupplementTask)).toBe('needs-material');
    expect(materialSupplementTask?.suggestedAction, JSON.stringify(materialSupplementTask)).toBe('request-material');
    expect(materialSupplementTask?.title, JSON.stringify(materialSupplementTask)).toContain('补素材：续航竖版视频素材缺口');

    await clickNavItem(page, '素材库');
    await expect(page.getByRole('heading', { name: '素材库' })).toBeVisible();
    await page.locator('.asset-tile').filter({ hasText: '通勤包内实拍图' }).locator('button').filter({ hasText: '详情' }).click();
    await expect(page.locator('.asset-detail-dialog')).toContainText('覆盖内容组合');
    await expect(page.locator('.asset-detail-dialog')).toContainText('轻量便携不压包');
    await expect(page.locator('.asset-detail-dialog')).toContainText('早高峰轻装通勤');
    await page.locator('.asset-coverage-item').filter({ hasText: '轻量便携不压包' }).locator('button').filter({ hasText: '补这个组合' }).click();
    await expect(page.locator('.content-review-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.content-review-workbench')).toContainText('补素材：轻量便携不压包');
    const assetLibraryMaterialTask = await page.evaluate(async ({ workspacePath, mapId }) => {
      const tasks = await window.contentStudio.listContentReviewTasks(workspacePath);
      return tasks.find((task) => (
        task.sourceKnowledgeMapId === mapId &&
        task.targetId === 'selling-v1-light' &&
        task.taskPurpose === 'material-supplement'
      ));
    }, { workspacePath: workspaceDir, mapId: seedTrace.mapId });
    expect(assetLibraryMaterialTask?.status, JSON.stringify(assetLibraryMaterialTask)).toBe('needs-material');
    expect(assetLibraryMaterialTask?.suggestedAction, JSON.stringify(assetLibraryMaterialTask)).toBe('request-material');
    expect(assetLibraryMaterialTask?.title, JSON.stringify(assetLibraryMaterialTask)).toContain('补素材：轻量便携不压包');

    await clickNavItem(page, '内容知识地图');
    await page.locator('.content-map-tabs button').filter({ hasText: '高级导出' }).click();
    await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('包文件');
    await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('KNOWLEDGE.md');
    await mapWorkbench.locator('.content-map-export-panel button').filter({ hasText: '生成本机预览' }).click();
    await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('本机预览已生成', { timeout: 20_000 });
    await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('Agent Knowledge v0.7.2');
    await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('素材覆盖');
    await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('JSON-LD / Turtle / RDF/XML');
    await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('compiled/prompt-grounding.md');
    await expect(mapWorkbench.locator('.content-map-export-panel')).toContainText('sha256');
    await mapWorkbench.locator('.content-map-package-file-list button').filter({ hasText: 'compiled/prompt-grounding.md' }).click();
    await expect(mapWorkbench.locator('.content-map-package-file-preview')).toContainText('包内容详情');
    await expect(mapWorkbench.locator('.content-map-package-file-preview')).toContainText('BreezeGo Air v1 真实工作台地图 提示词依据');
    await expect(mapWorkbench.locator('.content-map-package-file-preview')).toContainText('轻量便携不压包');
    await mapWorkbench.locator('.content-map-package-file-list button').filter({ hasText: 'assets/material-coverage.json' }).click();
    await expect(mapWorkbench.locator('.content-map-package-file-preview')).toContainText('"rowId"');
    await expect(mapWorkbench.locator('.content-map-package-file-preview')).toContainText('"materialRefs"');
    const localPreviewTrace = await page.evaluate(async (workspacePath) => {
      const [map] = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
      const exported = await window.contentStudio.exportContentKnowledgePack({
        workspacePath,
        contentKnowledgeMapId: map.id,
      });
      return exported.preview;
    }, workspaceDir);
    expect(localPreviewTrace?.agentKnowledgeVersion, JSON.stringify(localPreviewTrace)).toBe('0.7.2');
    expect(localPreviewTrace?.materialCoverageCount, JSON.stringify(localPreviewTrace)).toBeGreaterThanOrEqual(1);
    expect(localPreviewTrace?.interopFormats, JSON.stringify(localPreviewTrace)).toEqual(['JSON-LD', 'Turtle', 'RDF/XML']);

    await clickNavItem(page, '目标树');
    await expect(page.locator('.brand-command-workbench > .module-command-center h2')).toHaveText('目标树');
    await expect(page.locator('.brand-command-view-brief')).toContainText('作战目标');
    await expect(page.locator('.brand-command-view-brief')).toContainText('目标类型分布');
    await expect(page.locator('.brand-command-workbench')).toContainText('成功标准');
    await expect(page.locator('.brand-command-workbench')).toContainText('资源包');
    await page.locator('.brand-command-view-brief button').filter({ hasText: '确认目标优先级' }).click();
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const commandCenters = await window.contentStudio.listBrandCommandCenters(workspacePath);
        const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
        return center?.actionRecords.some((record) => record.actionType === 'confirm-objectives' && record.outcome === 'recorded') ?? false;
      }, workspaceDir),
      { message: '等待目标树主动作写入行动记录', timeout: 20_000 },
    ).toBe(true);
    await clickNavItem(page, '作战编组');
    await expect(page.locator('.brand-command-workbench > .module-command-center h2')).toHaveText('作战编组');
    await expect(page.locator('.brand-command-view-brief')).toContainText('资源包');
    await expect(page.locator('.brand-command-view-brief')).toContainText('资源包完整度');
    await expect(page.locator('.brand-command-bundle-list')).toContainText('证据摘录');
    await expect(page.locator('.brand-command-bundle-list')).toContainText('禁用边界');
    await page.locator('.brand-command-view-brief button').filter({ hasText: '保存作战单元' }).click();
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const commandCenters = await window.contentStudio.listBrandCommandCenters(workspacePath);
        const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
        return center?.actionRecords.some((record) => record.actionType === 'confirm-resource-bundles' && record.outcome === 'recorded') ?? false;
      }, workspaceDir),
      { message: '等待作战编组主动作写入行动记录', timeout: 20_000 },
    ).toBe(true);
    await clickNavItem(page, '执行队列');
    await expect(page.locator('.brand-command-workbench > .module-command-center h2')).toHaveText('执行队列');
    await expect(page.locator('.brand-command-view-brief')).toContainText('队列动作');
    await expect(page.locator('.brand-command-view-brief')).toContainText('队列状态分布');
    await expect(page.locator('.brand-command-queue-board')).toContainText('动作：生成 Prompt 草稿');
    await expect(page.locator('.brand-command-queue-board')).toContainText('交付：Prompt 草稿');
    await expect(page.locator('.brand-command-queue-board')).toContainText('动作：创建场景卡');
    await expect(page.locator('.brand-command-queue-board')).toContainText('交付：场景卡');
    await expect(page.locator('.brand-command-queue-board')).toContainText('动作：启动 SOP');
    await expect(page.locator('.brand-command-queue-board')).toContainText('交付：SOP 运行');
    await expect(page.locator('.brand-command-queue-board')).toContainText('动作：回写素材覆盖');
    await expect(page.locator('.brand-command-queue-board')).toContainText('交付：素材覆盖表');
    await page.locator('.brand-command-view-brief button').filter({ hasText: '同步执行队列' }).click();
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const commandCenters = await window.contentStudio.listBrandCommandCenters(workspacePath);
        const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
        return Boolean(
          center?.actionRecords.some((record) => record.actionType === 'sync-execution-queue' && record.outcome === 'recorded') &&
          center.queueItems.some((item) => Boolean(item.syncStatus)),
        );
      }, workspaceDir),
      { message: '等待执行队列主动作同步到事实源', timeout: 20_000 },
    ).toBe(true);
    await expect.poll(
      async () => {
        const request = latestCommandCenterRequest();
        const payload = request?.payload;
        const actionTypes = payload?.snapshot?.actionSummary?.records?.map((record) => record.actionType) ?? [];
        const queueItems = payload?.snapshot?.queueSummary?.items ?? [];
        return {
          route: request?.route,
          title: payload?.title,
          hasObjectives: actionTypes.includes('confirm-objectives'),
          hasBundles: actionTypes.includes('confirm-resource-bundles'),
          hasQueue: actionTypes.includes('sync-execution-queue'),
          queueSynced: queueItems.some((item) => Boolean(item.syncStatus)),
          queueItemCount: payload?.queueItemCount,
          actionRecordCount: payload?.actionRecordCount,
        };
      },
      { message: '等待 Bugu 品牌作战系统快照包含三类主动作', timeout: 20_000 },
    ).toEqual({
      route: 'content-command-centers',
      title: 'BreezeGo Air 品牌战情室',
      hasObjectives: true,
      hasBundles: true,
      hasQueue: true,
      queueSynced: true,
      queueItemCount: expect.any(Number),
      actionRecordCount: expect.any(Number),
    });
    const readyQueueCard = page.locator('.brand-command-queue-board article')
      .filter({ hasText: '动作：生成 Prompt 草稿' })
      .filter({ hasText: '可执行' })
      .first();
    await expect(readyQueueCard).toContainText('记录交接');
    await readyQueueCard.locator('button').filter({ hasText: '记录交接' }).click();
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const [drafts, commandCenters] = await Promise.all([
          window.contentStudio.listPromptDrafts(workspacePath),
          window.contentStudio.listBrandCommandCenters(workspacePath),
        ]);
        const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
        const handoffRecord = center?.actionRecords.find((record) => (
          record.actionType === 'generate-prompt-draft' &&
          Boolean(record.promptDraftId) &&
          Boolean(record.queueItemId) &&
          !record.queueItemId.startsWith('handoff:')
        ));
        const draft = drafts.find((item) => item.id === handoffRecord?.promptDraftId);
        return Boolean(center && handoffRecord && draft);
      }, workspaceDir),
      { message: '等待执行队列写入真实 Prompt 草稿和行动记录', timeout: 20_000 },
    ).toBe(true);
    const commandQueueHandoff = await page.evaluate(async (workspacePath) => {
      const [drafts, commandCenters] = await Promise.all([
        window.contentStudio.listPromptDrafts(workspacePath),
        window.contentStudio.listBrandCommandCenters(workspacePath),
      ]);
      const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
      const handoffRecord = center?.actionRecords.find((record) => (
        record.actionType === 'generate-prompt-draft' &&
        Boolean(record.promptDraftId) &&
        Boolean(record.queueItemId) &&
        !record.queueItemId.startsWith('handoff:')
      ));
      const draft = drafts.find((item) => item.id === handoffRecord?.promptDraftId);
      return {
        queueStatus: center?.queueItems.find((item) => item.id === handoffRecord?.queueItemId)?.status,
        actionType: handoffRecord?.actionType,
        outcome: handoffRecord?.outcome,
        promptDraftId: handoffRecord?.promptDraftId,
        draftTitle: draft?.title,
        draftMapId: draft?.contentKnowledgeMapId,
        draftCoverageRowCount: draft?.coverageRowIds?.length ?? 0,
        draftSourceRefs: draft?.sourceRefs ?? [],
      };
    }, workspaceDir);
    expect(commandQueueHandoff.queueStatus, JSON.stringify(commandQueueHandoff)).toBe('handed-off');
    expect(commandQueueHandoff.actionType, JSON.stringify(commandQueueHandoff)).toBe('generate-prompt-draft');
    expect(commandQueueHandoff.outcome, JSON.stringify(commandQueueHandoff)).toBe('handoff');
    expect(commandQueueHandoff.promptDraftId, JSON.stringify(commandQueueHandoff)).toBeTruthy();
    expect(commandQueueHandoff.draftTitle, JSON.stringify(commandQueueHandoff)).toContain('Prompt 草稿');
    expect(commandQueueHandoff.draftMapId, JSON.stringify(commandQueueHandoff)).toBeTruthy();
    expect(commandQueueHandoff.draftCoverageRowCount, JSON.stringify(commandQueueHandoff)).toBeGreaterThan(0);
    expect(commandQueueHandoff.draftSourceRefs, JSON.stringify(commandQueueHandoff)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^content-knowledge-map:/)]),
    );
    const sceneQueueCard = page.locator('.brand-command-queue-board article')
      .filter({ hasText: '创建通勤场景卡' })
      .filter({ hasText: '动作：创建场景卡' });
    await expect(sceneQueueCard).toContainText('记录交接');
    await sceneQueueCard.locator('button').filter({ hasText: '记录交接' }).click();
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const [sceneCards, commandCenters] = await Promise.all([
          window.contentStudio.listSceneCards(workspacePath),
          window.contentStudio.listBrandCommandCenters(workspacePath),
        ]);
        const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
        const handoffRecord = center?.actionRecords.find((record) => (
          record.actionType === 'create-scene-card' &&
          record.queueItemId === 'queue-e2e-create-scene-card' &&
          Boolean(record.sceneCardId)
        ));
        const sceneCard = sceneCards.find((item) => item.id === handoffRecord?.sceneCardId);
        return Boolean(center && handoffRecord && sceneCard);
      }, workspaceDir),
      { message: '等待执行队列创建真实场景卡', timeout: 20_000 },
    ).toBe(true);
    const sopQueueCard = page.locator('.brand-command-queue-board article')
      .filter({ hasText: '启动小红书种草图 SOP' })
      .filter({ hasText: '动作：启动 SOP' });
    await expect(sopQueueCard).toContainText('记录交接');
    await sopQueueCard.locator('button').filter({ hasText: '记录交接' }).click();
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const [runs, commandCenters] = await Promise.all([
          window.contentStudio.listWorkflowRuns(workspacePath),
          window.contentStudio.listBrandCommandCenters(workspacePath),
        ]);
        const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
        const handoffRecord = center?.actionRecords.find((record) => (
          record.actionType === 'launch-sop-run' &&
          record.queueItemId === 'queue-e2e-launch-sop-run' &&
          Boolean(record.workflowRunId)
        ));
        const workflowRun = runs.find((item) => item.id === handoffRecord?.workflowRunId);
        return Boolean(center && handoffRecord && workflowRun);
      }, workspaceDir),
      { message: '等待执行队列启动真实 SOP 运行', timeout: 20_000 },
    ).toBe(true);
    const materialCoverageQueueCard = page.locator('.brand-command-queue-board article')
      .filter({ hasText: '回写通勤素材覆盖' })
      .filter({ hasText: '动作：回写素材覆盖' });
    await expect(materialCoverageQueueCard).toContainText('记录交接');
    await materialCoverageQueueCard.locator('button').filter({ hasText: '记录交接' }).click();
    await expect.poll(
      async () => page.evaluate(async ({ workspacePath, mapId }) => {
        const [maps, commandCenters] = await Promise.all([
          window.contentStudio.listContentKnowledgeMaps(workspacePath),
          window.contentStudio.listBrandCommandCenters(workspacePath),
        ]);
        const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
        const row = maps.find((item) => item.id === mapId)?.sellingPoints.find((item) => item.id === 'selling-v1-light');
        const handoffRecord = center?.actionRecords.find((record) => (
          record.actionType === 'write-back-material-coverage' &&
          record.queueItemId === 'queue-e2e-write-back-material-coverage' &&
          Boolean(record.materialCoverageChangeId)
        ));
        const queueStatus = center?.queueItems.find((item) => item.id === 'queue-e2e-write-back-material-coverage')?.status;
        return {
          hasRecord: Boolean(handoffRecord),
          queueStatus,
          rowMaterialStatus: row?.materialStatus,
          rowMaterialRefCount: row?.materialRefs?.length ?? 0,
          performanceTags: row?.performanceTags ?? [],
        };
      }, { workspacePath: workspaceDir, mapId: seedTrace.mapId }),
      { message: '等待执行队列回写素材覆盖', timeout: 20_000 },
    ).toEqual({
      hasRecord: true,
      queueStatus: 'written-back',
      rowMaterialStatus: 'approved',
      rowMaterialRefCount: expect.any(Number),
      performanceTags: expect.arrayContaining(['高收藏']),
    });
    const commandQueueDeliverables = await page.evaluate(async ({ workspacePath, mapId }) => {
      const [sceneCards, runs, maps, commandCenters] = await Promise.all([
        window.contentStudio.listSceneCards(workspacePath),
        window.contentStudio.listWorkflowRuns(workspacePath),
        window.contentStudio.listContentKnowledgeMaps(workspacePath),
        window.contentStudio.listBrandCommandCenters(workspacePath),
      ]);
      const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
      const sceneRecord = center?.actionRecords.find((record) => record.queueItemId === 'queue-e2e-create-scene-card');
      const sopRecord = center?.actionRecords.find((record) => record.queueItemId === 'queue-e2e-launch-sop-run');
      const coverageRecord = center?.actionRecords.find((record) => record.queueItemId === 'queue-e2e-write-back-material-coverage');
      const sceneCard = sceneCards.find((item) => item.id === sceneRecord?.sceneCardId);
      const workflowRun = runs.find((item) => item.id === sopRecord?.workflowRunId);
      const map = maps.find((item) => item.id === mapId);
      const sellingRow = map?.sellingPoints.find((item) => item.id === 'selling-v1-light');
      const bundle = center?.resourceBundles.find((item) => (
        item.handoffRefs?.includes(`scene-card:${sceneRecord?.sceneCardId}`) ||
        item.handoffRefs?.includes(`workflow-run:${sopRecord?.workflowRunId}`) ||
        item.handoffRefs?.includes(`material-coverage:${coverageRecord?.materialCoverageChangeId}`)
      ));
      return {
        scene: {
          queueStatus: center?.queueItems.find((item) => item.id === 'queue-e2e-create-scene-card')?.status,
          actionType: sceneRecord?.actionType,
          outcome: sceneRecord?.outcome,
          sceneCardId: sceneRecord?.sceneCardId,
          cardMapId: sceneCard?.contentKnowledgeMapId,
          cardCoverageRowIds: sceneCard?.coverageRowIds ?? [],
          cardSourceRefs: sceneCard?.sourceRefs ?? [],
          audience: sceneCard?.audience,
          usageScene: sceneCard?.usageScene,
        },
        sop: {
          queueStatus: center?.queueItems.find((item) => item.id === 'queue-e2e-launch-sop-run')?.status,
          actionType: sopRecord?.actionType,
          outcome: sopRecord?.outcome,
          workflowRunId: sopRecord?.workflowRunId,
          workflowDefinitionId: workflowRun?.workflowDefinitionId,
          runStatus: workflowRun?.status,
          runPlatform: workflowRun?.inputs?.platform,
          runIntent: workflowRun?.inputs?.intent,
          teamReleaseVersion: workflowRun?.teamKnowledgeRelease?.version,
          artifactRefs: workflowRun?.artifactRefs ?? [],
        },
        materialCoverage: {
          queueStatus: center?.queueItems.find((item) => item.id === 'queue-e2e-write-back-material-coverage')?.status,
          actionType: coverageRecord?.actionType,
          outcome: coverageRecord?.outcome,
          materialCoverageChangeId: coverageRecord?.materialCoverageChangeId,
          rowMaterialStatus: sellingRow?.materialStatus,
          rowMaterialRefs: sellingRow?.materialRefs ?? [],
          rowPerformanceTags: sellingRow?.performanceTags ?? [],
        },
        bundleHandoffRefs: bundle?.handoffRefs ?? [],
      };
    }, { workspacePath: workspaceDir, mapId: seedTrace.mapId });
    expect(commandQueueDeliverables.scene.queueStatus, JSON.stringify(commandQueueDeliverables)).toBe('handed-off');
    expect(commandQueueDeliverables.scene.actionType, JSON.stringify(commandQueueDeliverables)).toBe('create-scene-card');
    expect(commandQueueDeliverables.scene.outcome, JSON.stringify(commandQueueDeliverables)).toBe('handoff');
    expect(commandQueueDeliverables.scene.sceneCardId, JSON.stringify(commandQueueDeliverables)).toBeTruthy();
    expect(commandQueueDeliverables.scene.cardMapId, JSON.stringify(commandQueueDeliverables)).toBe(seedTrace.mapId);
    expect(commandQueueDeliverables.scene.cardCoverageRowIds, JSON.stringify(commandQueueDeliverables)).toEqual(expect.arrayContaining(['selling-v1-light']));
    expect(commandQueueDeliverables.scene.cardSourceRefs, JSON.stringify(commandQueueDeliverables)).toEqual(expect.arrayContaining([
      `content-knowledge-map:${seedTrace.mapId}`,
      expect.stringMatching(/^asset-review:/),
    ]));
    expect(commandQueueDeliverables.scene.audience, JSON.stringify(commandQueueDeliverables)).toContain('通勤');
    expect(commandQueueDeliverables.scene.usageScene, JSON.stringify(commandQueueDeliverables)).toContain('通勤');
    expect(commandQueueDeliverables.sop.queueStatus, JSON.stringify(commandQueueDeliverables)).toBe('handed-off');
    expect(commandQueueDeliverables.sop.actionType, JSON.stringify(commandQueueDeliverables)).toBe('launch-sop-run');
    expect(commandQueueDeliverables.sop.outcome, JSON.stringify(commandQueueDeliverables)).toBe('handoff');
    expect(commandQueueDeliverables.sop.workflowDefinitionId, JSON.stringify(commandQueueDeliverables)).toBe('workflow-xiaohongshu-seeding-image');
    expect(commandQueueDeliverables.sop.runStatus, JSON.stringify(commandQueueDeliverables)).toBeTruthy();
    expect(commandQueueDeliverables.sop.runPlatform, JSON.stringify(commandQueueDeliverables)).toBeTruthy();
    expect(commandQueueDeliverables.sop.runIntent, JSON.stringify(commandQueueDeliverables)).toContain('目标人群');
    expect(commandQueueDeliverables.sop.runIntent, JSON.stringify(commandQueueDeliverables)).toContain('使用场景');
    expect(commandQueueDeliverables.sop.teamReleaseVersion, JSON.stringify(commandQueueDeliverables)).toBe('v1.4');
    expect(commandQueueDeliverables.sop.artifactRefs, JSON.stringify(commandQueueDeliverables)).toEqual(
      expect.arrayContaining([expect.stringMatching(/^team-knowledge-release:/)]),
    );
    expect(commandQueueDeliverables.materialCoverage.queueStatus, JSON.stringify(commandQueueDeliverables)).toBe('written-back');
    expect(commandQueueDeliverables.materialCoverage.actionType, JSON.stringify(commandQueueDeliverables)).toBe('write-back-material-coverage');
    expect(commandQueueDeliverables.materialCoverage.outcome, JSON.stringify(commandQueueDeliverables)).toBe('written-back');
    expect(commandQueueDeliverables.materialCoverage.materialCoverageChangeId, JSON.stringify(commandQueueDeliverables)).toBeTruthy();
    expect(commandQueueDeliverables.materialCoverage.rowMaterialStatus, JSON.stringify(commandQueueDeliverables)).toBe('approved');
    expect(commandQueueDeliverables.materialCoverage.rowMaterialRefs.length, JSON.stringify(commandQueueDeliverables)).toBeGreaterThan(0);
    expect(commandQueueDeliverables.materialCoverage.rowPerformanceTags, JSON.stringify(commandQueueDeliverables)).toEqual(expect.arrayContaining(['高收藏']));
    expect(commandQueueDeliverables.bundleHandoffRefs, JSON.stringify(commandQueueDeliverables)).toEqual(expect.arrayContaining([
      `scene-card:${commandQueueDeliverables.scene.sceneCardId}`,
      `workflow-run:${commandQueueDeliverables.sop.workflowRunId}`,
      `material-coverage:${commandQueueDeliverables.materialCoverage.materialCoverageChangeId}`,
    ]));
    await expect.poll(
      async () => {
        const payload = latestCommandCenterRequest()?.payload;
        const actionRecords = payload?.snapshot?.actionSummary?.records ?? [];
        const queueItems = payload?.snapshot?.queueSummary?.items ?? [];
        return {
          hasSceneCard: actionRecords.some((record) => record.actionType === 'create-scene-card' && Boolean(record.sceneCardId)),
          hasSopRun: actionRecords.some((record) => record.actionType === 'launch-sop-run' && Boolean(record.workflowRunId)),
          hasMaterialCoverage: actionRecords.some((record) => record.actionType === 'write-back-material-coverage' && Boolean(record.materialCoverageChangeId)),
          sceneQueueStatus: queueItems.find((item) => item.id === 'queue-e2e-create-scene-card')?.status,
          sopQueueStatus: queueItems.find((item) => item.id === 'queue-e2e-launch-sop-run')?.status,
          materialQueueStatus: queueItems.find((item) => item.id === 'queue-e2e-write-back-material-coverage')?.status,
          handedOffCount: payload?.snapshot?.queueSummary?.statusCounts?.['handed-off'] ?? 0,
          writtenBackCount: payload?.snapshot?.queueSummary?.statusCounts?.['written-back'] ?? 0,
        };
      },
      { message: '等待 Bugu 品牌作战系统快照包含三类真实队列交付', timeout: 20_000 },
    ).toEqual({
      hasSceneCard: true,
      hasSopRun: true,
      hasMaterialCoverage: true,
      sceneQueueStatus: 'handed-off',
      sopQueueStatus: 'handed-off',
      materialQueueStatus: 'written-back',
      handedOffCount: expect.any(Number),
      writtenBackCount: expect.any(Number),
    });
    await clickNavItem(page, '行动记录');
    await expect(page.locator('.brand-command-workbench > .module-command-center h2')).toHaveText('行动记录');
    await expect(page.locator('.brand-command-view-brief')).toContainText('行动记录');
    await expect(page.locator('.brand-command-view-brief')).toContainText('行动结果分布');
    await expect(page.locator('.brand-command-log-list')).toContainText('已生成 Prompt 草稿');
    await expect(page.locator('.brand-command-log-list')).toContainText('已生成场景卡');
    await expect(page.locator('.brand-command-log-list')).toContainText('已启动 SOP 运行');
    await expect(page.locator('.brand-command-log-list')).toContainText('已回写素材覆盖');
    await page.locator('.brand-command-review-box textarea').fill('抖音图文 Prompt 已交接，下一轮优先补拍午后补涂 9:16 素材。');
    await page.locator('.brand-command-review-box button').filter({ hasText: '写入复盘记录' }).click();
    await expect(page.locator('.brand-command-log-list')).toContainText('午后补涂 9:16 素材', { timeout: 20_000 });
    const reviewActionRecord = await page.evaluate(async (workspacePath) => {
      const commandCenters = await window.contentStudio.listBrandCommandCenters(workspacePath);
      const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
      return center?.actionRecords.find((record) => record.actionType === 'review-action-records');
    }, workspaceDir);
    expect(reviewActionRecord?.outcome, JSON.stringify(reviewActionRecord)).toBe('recorded');
    expect(reviewActionRecord?.outputSummary, JSON.stringify(reviewActionRecord)).toContain('午后补涂 9:16 素材');
    const reviewActionSyncRequest = [...bugu.requests]
      .reverse()
      .find((request) => request.route === 'content-action-records' && request.payload.records?.some((record) => record.actionType === 'review-action-records'));
    expect(reviewActionSyncRequest?.payload.records?.[0]?.outputSummary, JSON.stringify(bugu.requests)).toContain('午后补涂 9:16 素材');
    const reviewFeedbackTrace = await page.evaluate(async (workspacePath) => {
      const commandCenters = await window.contentStudio.listBrandCommandCenters(workspacePath);
      const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
      return {
        signal: center?.signals.find((signal) => signal.sourceLabel === '行动记录复盘' && signal.summary.includes('午后补涂 9:16 素材')),
        objective: center?.objectives.find((objective) => objective.type === 'material-gap' && objective.summary.includes('午后补涂 9:16 素材')),
        resourceBundle: center?.resourceBundles.find((bundle) => bundle.gaps?.some((gap) => gap.includes('午后补涂 9:16 素材'))),
        campaignCell: center?.campaignCells.find((cell) => cell.title.includes('补素材') && cell.queueItemIds.length > 0),
        queueItem: center?.queueItems.find((item) => item.actionType === 'create-material-gap-list' && item.status === 'needs-resource' && item.summary.includes('午后补涂 9:16 素材')),
        actionRecord: center?.actionRecords.find((record) => record.actionType === 'review-action-records' && record.writeBackSummary?.includes('下一轮信号')),
      };
    }, workspaceDir);
    expect(reviewFeedbackTrace.signal?.riskBoundary, JSON.stringify(reviewFeedbackTrace)).toContain('不能自动改写产品事实');
    expect(reviewFeedbackTrace.objective?.priority, JSON.stringify(reviewFeedbackTrace)).toBe('P0');
    expect(reviewFeedbackTrace.resourceBundle?.readyPercent, JSON.stringify(reviewFeedbackTrace)).toBeLessThanOrEqual(64);
    expect(reviewFeedbackTrace.campaignCell?.queueItemIds, JSON.stringify(reviewFeedbackTrace)).toContain(reviewFeedbackTrace.queueItem?.id);
    expect(reviewFeedbackTrace.queueItem?.outputTarget, JSON.stringify(reviewFeedbackTrace)).toBe('material-gap');
    expect(reviewFeedbackTrace.actionRecord?.writeBackSummary, JSON.stringify(reviewFeedbackTrace)).toContain('执行队列动作');
    await expect.poll(
      async () => {
        const payload = latestCommandCenterRequest()?.payload;
        const signals = payload?.snapshot?.signals ?? [];
        const objectives = payload?.snapshot?.objectives ?? [];
        const resourceBundles = payload?.snapshot?.resourceBundles ?? [];
        const campaignCells = payload?.snapshot?.campaignCells ?? [];
        const queueItems = payload?.snapshot?.queueSummary?.items ?? [];
        return {
          hasReviewSignal: signals.some((signal) => signal.sourceLabel === '行动记录复盘' && /午后补涂 9:16 素材/.test(signal.summary ?? '')),
          hasMaterialObjective: objectives.some((objective) => objective.type === 'material-gap' && /午后补涂 9:16 素材/.test(objective.summary ?? '')),
          hasReviewBundle: resourceBundles.some((bundle) => (bundle.gaps ?? []).some((gap) => /午后补涂 9:16 素材/.test(gap))),
          hasReviewCell: campaignCells.some((cell) => /补素材/.test(cell.title ?? '') && (cell.queueItemIds ?? []).length > 0),
          hasMaterialQueue: queueItems.some((item) => (
            item.actionType === 'create-material-gap-list' &&
            item.status === 'needs-resource' &&
            item.outputTarget === 'material-gap' &&
            /午后补涂 9:16 素材/.test(item.summary ?? '')
          )),
        };
      },
      { message: '等待 Bugu 品牌作战系统快照包含复盘反馈信号和补素材队列', timeout: 20_000 },
    ).toEqual({
      hasReviewSignal: true,
      hasMaterialObjective: true,
      hasReviewBundle: true,
      hasReviewCell: true,
      hasMaterialQueue: true,
    });
    await page.locator('.brand-command-workbench .content-map-tabs button').filter({ hasText: '信号雷达' }).click();
    await expect(page.locator('.brand-command-signal-grid')).toContainText('复盘信号');
    await expect(page.locator('.brand-command-signal-grid')).toContainText('午后补涂 9:16 素材');
    await expect(page.locator('.brand-command-signal-grid')).toContainText('行动记录复盘');
    await page.locator('.brand-command-workbench .content-map-tabs button').filter({ hasText: '执行队列' }).click();
    await expect(page.locator('.brand-command-queue-board')).toContainText('复盘创建补素材清单');
    await expect(page.locator('.brand-command-queue-board')).toContainText('待补资源');
    await expect(page.locator('.brand-command-queue-board')).toContainText('午后补涂 9:16 素材');
    await page.locator('.brand-command-workbench .content-map-tabs button').filter({ hasText: '行动记录' }).click();
    await expect(page.locator('.brand-command-log-list')).toContainText('午后补涂 9:16 素材', { timeout: 20_000 });
    await page.locator('.brand-command-review-box button').filter({ hasText: '导出行动记录' }).click();
    await expect(page.locator('.brand-command-log-list')).toContainText('行动记录导出', { timeout: 20_000 });
    const exportedActionRecord = await page.evaluate(async (workspacePath) => {
      const commandCenters = await window.contentStudio.listBrandCommandCenters(workspacePath);
      const center = commandCenters.find((item) => item.title === 'BreezeGo Air 品牌战情室');
      return center?.actionRecords.find((record) => record.actionType === 'export-action-records');
    }, workspaceDir);
    expect(exportedActionRecord?.outcome, JSON.stringify(exportedActionRecord)).toBe('recorded');
    expect(exportedActionRecord?.outputSummary, JSON.stringify(exportedActionRecord)).toContain('action-records.md');
    const commandCenterSyncRequest = latestCommandCenterRequest();
    const commandCenterSyncPayload = commandCenterSyncRequest?.payload;
    const commandCenterActionTypes = commandCenterSyncPayload?.snapshot?.actionSummary?.records?.map((record) => record.actionType) ?? [];
    const commandCenterSignals = commandCenterSyncPayload?.snapshot?.signals ?? [];
    const commandCenterObjectives = commandCenterSyncPayload?.snapshot?.objectives ?? [];
    const commandCenterResourceBundles = commandCenterSyncPayload?.snapshot?.resourceBundles ?? [];
    const commandCenterQueueItems = commandCenterSyncPayload?.snapshot?.queueSummary?.items ?? [];
    expect(commandCenterSyncRequest?.route, JSON.stringify(commandCenterSyncRequest)).toBe('content-command-centers');
    expect(commandCenterSyncPayload?.title, JSON.stringify(commandCenterSyncPayload)).toBe('BreezeGo Air 品牌战情室');
    expect(commandCenterSyncPayload?.snapshot?.queueSummary?.statusCounts?.['handed-off'], JSON.stringify(commandCenterSyncPayload)).toBeGreaterThanOrEqual(3);
    expect(commandCenterSyncPayload?.snapshot?.queueSummary?.statusCounts?.['written-back'], JSON.stringify(commandCenterSyncPayload)).toBeGreaterThanOrEqual(1);
    expect(commandCenterQueueItems.find((item) => item.id === 'queue-e2e-create-scene-card')?.status, JSON.stringify(commandCenterSyncPayload)).toBe('handed-off');
    expect(commandCenterQueueItems.find((item) => item.id === 'queue-e2e-launch-sop-run')?.status, JSON.stringify(commandCenterSyncPayload)).toBe('handed-off');
    expect(commandCenterQueueItems.find((item) => item.id === 'queue-e2e-write-back-material-coverage')?.status, JSON.stringify(commandCenterSyncPayload)).toBe('written-back');
    expect(commandCenterSignals.some((signal) => signal.sourceLabel === '行动记录复盘' && /午后补涂 9:16 素材/.test(signal.summary ?? '')), JSON.stringify(commandCenterSyncPayload)).toBe(true);
    expect(commandCenterObjectives.some((objective) => objective.type === 'material-gap' && /午后补涂 9:16 素材/.test(objective.summary ?? '')), JSON.stringify(commandCenterSyncPayload)).toBe(true);
    expect(commandCenterResourceBundles.some((bundle) => (bundle.gaps ?? []).some((gap) => /午后补涂 9:16 素材/.test(gap))), JSON.stringify(commandCenterSyncPayload)).toBe(true);
    expect(commandCenterQueueItems.some((item) => (
      item.actionType === 'create-material-gap-list' &&
      item.status === 'needs-resource' &&
      item.outputTarget === 'material-gap' &&
      /午后补涂 9:16 素材/.test(item.summary ?? '')
    )), JSON.stringify(commandCenterSyncPayload)).toBe(true);
    expect(commandCenterActionTypes, JSON.stringify(commandCenterSyncPayload)).toEqual(expect.arrayContaining([
      'confirm-objectives',
      'confirm-resource-bundles',
      'sync-execution-queue',
      'generate-prompt-draft',
      'create-scene-card',
      'launch-sop-run',
      'write-back-material-coverage',
      'review-action-records',
      'export-action-records',
    ]));
    expect(
      commandCenterSyncPayload?.snapshot?.actionSummary?.records?.some((record) => record.actionType === 'create-scene-card' && Boolean(record.sceneCardId)),
      JSON.stringify(commandCenterSyncPayload),
    ).toBe(true);
    expect(
      commandCenterSyncPayload?.snapshot?.actionSummary?.records?.some((record) => record.actionType === 'launch-sop-run' && Boolean(record.workflowRunId)),
      JSON.stringify(commandCenterSyncPayload),
    ).toBe(true);
    expect(
      commandCenterSyncPayload?.snapshot?.actionSummary?.records?.some((record) => record.actionType === 'write-back-material-coverage' && Boolean(record.materialCoverageChangeId)),
      JSON.stringify(commandCenterSyncPayload),
    ).toBe(true);
    expect(
      commandCenterSyncPayload?.snapshot?.actionSummary?.records?.some((record) => (
        record.actionType === 'export-action-records' &&
        record.artifactRefs?.some((ref) => (
          ref.startsWith('[本机工作区]/') &&
          ref.endsWith('/action-records.json') &&
          !ref.includes(workspaceDir)
        ))
      )),
      JSON.stringify(commandCenterSyncPayload),
    ).toBe(true);

    const needsEvidenceTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const maps = await api.listContentKnowledgeMaps(workspacePath);
      const map = maps.find((item) => item.title === 'BreezeGo Air v1 真实工作台地图');
      const sources = await api.listInputSources(workspacePath);
      const feedbackSource = sources.find((item) => item.title === 'BreezeGo Air 评论原声');
      if (!map || !feedbackSource) {
        return {
          status: 'missing-seed-data',
          hasMap: Boolean(map),
          hasFeedbackSource: Boolean(feedbackSource),
        };
      }
      const hasNeedsEvidenceRow = map.sellingPoints.some((row) => row.id === 'selling-v1-noise-evidence');
      const sellingPoints = hasNeedsEvidenceRow ? map.sellingPoints : [
        ...map.sellingPoints,
        {
          id: 'selling-v1-noise-evidence',
          title: '办公室静音证据缺口',
          summary: '办公室低档噪音表达缺少测试报告，补齐前不能写成确定性主张。',
          tags: ['卖点', '办公室', '待补证据'],
          sourceRefs: [`input-source:${feedbackSource.id}`],
          evidenceRefs: [],
          materialStatus: 'missing',
          materialRefs: [],
          performanceTags: [],
          confidence: 54,
          status: 'needs-evidence',
        },
      ];
      const updated = await api.updateContentKnowledgeMap({
        ...map,
        sellingPoints,
        coverage: {
          ...map.coverage,
          gapCount: Math.max(map.coverage.gapCount ?? 0, 1),
          readyPercent: Math.min(map.coverage.readyPercent ?? 84, 84),
        },
        updatedAt: new Date().toISOString(),
      });
      return {
        status: updated.sellingPoints.some((row) => row.id === 'selling-v1-noise-evidence') ? 'updated' : 'missing-row',
        gapCount: updated.coverage.gapCount,
        readyPercent: updated.coverage.readyPercent,
      };
    }, workspaceDir);
    expect(needsEvidenceTrace.status, JSON.stringify(needsEvidenceTrace)).toBe('updated');
    expect(needsEvidenceTrace.gapCount, JSON.stringify(needsEvidenceTrace)).toBeGreaterThanOrEqual(1);
    expect(needsEvidenceTrace.readyPercent, JSON.stringify(needsEvidenceTrace)).toBeLessThanOrEqual(84);

    await page.reload();
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        if (!window.contentStudio) {
          return false;
        }
        const maps = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
        const map = maps.find((item) => item.title === 'BreezeGo Air v1 真实工作台地图');
        return Boolean(map?.sellingPoints.some((row) => row.id === 'selling-v1-noise-evidence'));
      }, workspaceDir),
      { message: '等待缺证据行刷新到内容知识地图 UI 状态', timeout: 20_000 },
    ).toBe(true);
    await clickNavItem(page, '内容知识地图');
    await page.locator('.content-map-tabs button').filter({ hasText: '卖点矩阵' }).click();
    await mapWorkbench.locator('.content-map-table tbody tr').filter({ hasText: '办公室静音证据缺口' }).click();
    await expect(mapWorkbench.locator('.content-map-row-detail')).toContainText('补齐前不能写成确定性主张');
    await expect(mapWorkbench.locator('.content-map-row-detail-actions .primary')).toContainText('创建补证据任务');
    await expect(mapWorkbench.locator('.content-map-row-detail-actions button').filter({ hasText: '生成 Prompt 草稿' })).toBeDisabled();
    await mapWorkbench.locator('.content-map-row-detail-actions .primary').click();
    await expect(page.locator('.content-review-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.content-review-workbench')).toContainText('办公室静音证据缺口');
    await expect(page.locator('.content-review-workbench')).toContainText('待补证据');
    }, {
      env: {
        CONTENT_STUDIO_BUGU_CONTENT_API_BASE_URL: bugu.baseUrl,
        CONTENT_STUDIO_BUGU_CONTENT_API_TOKEN: 'e2e-content-token',
      },
    });
  } finally {
    await bugu.close();
  }
});

test('内容知识地图页点击生成会调用真实结构化文字服务并显示模型矩阵', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const { server, baseUrl, requests } = await startFakeOpenAITextServer(fakeBusinessChainTextOutput);
  const bugu = await startFakeBuguContentWorkspaceServer();
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath, endpoint }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.saveModelConfig({
          textProtocol: 'openai-chat',
          textApiEndpoint: endpoint,
          textApiKey: 'test-text-key',
          textModel: 'test-text-model',
        });
      }, { workspacePath: workspaceDir, endpoint: baseUrl });

      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待结构化生成测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      async function registerTextInput(purpose, title, tags, lines) {
        await page.locator('.input-source-register-panel select').first().selectOption(purpose);
        await page.locator('.input-source-register-panel input').first().fill(title);
        await page.locator('.input-source-register-panel input').nth(1).fill(tags);
        await page.locator('.input-source-register-panel textarea').fill(lines.join('\n'));
        await clickButton(page, '登记文本输入源');
        await expect(page.locator('.input-source-list')).toContainText(title);
      }

      await clickNavItem(page, '输入源 / 文档转换');
      await registerTextInput('product-brief', '通勤防晒产品资料', '产品资料, 抖音, 通勤', [
        '产品名称：通勤防晒乳',
        '卖点：清爽肤感，午后补涂不厚重，通勤包内可携带。',
        '禁用表达：不得承诺治疗、绝对防护或替代专业建议。',
      ]);
      await registerTextInput('product-brief', '通勤防晒 SKU 表', 'SKU, 价格, 抖音, 短视频, 通勤', [
        'SKU,规格,价格,适用场景,人群,内容形式',
        'commute-mini,30ml,89,通勤包内补涂,通勤人群,短视频',
        'office-pro,50ml,129,办公室午后补涂,办公室白领,口播',
      ]);
      await registerTextInput('user-feedback', '通勤防晒评论原声', '评论, 客服问题, 通勤', [
        '评论：下午补涂会不会很厚重？',
        '客服：可以放通勤包里随身带吗？',
      ]);
      await registerTextInput('competitor-observation', '竞品防晒观察摘要', '竞品观察, 差异化机会, 抖音', [
        '竞品强调无感补涂和包内携带，但画面结构不能复制。',
        '对标账号常用午后办公室补涂场景，需要转写成本品牌机会。',
      ]);
      await expect(page.locator('.product-brief-sku-table')).toContainText('commute-mini');
      await expect(page.locator('.feedback-insight-panel')).toContainText('下午补涂会不会很厚重');

      await clickNavItem(page, '内容知识地图');
      const mapWorkbench = page.locator('.content-map-workbench');
      await expect(mapWorkbench.locator('.agent-session-footer button').filter({ hasText: '生成内容知识地图' })).toBeEnabled({ timeout: 20_000 });
      await mapWorkbench.locator('.agent-session-footer button').filter({ hasText: '生成内容知识地图' }).click();
      await expect(mapWorkbench).toContainText('模型生成卖点：通勤清爽补涂', { timeout: 20_000 });
      await page.locator('.content-map-tabs button').filter({ hasText: '痛点矩阵' }).click();
      await expect(mapWorkbench).toContainText('模型生成痛点：担心补涂厚重');
      await page.locator('.content-map-tabs button').filter({ hasText: '场景矩阵' }).click();
      await expect(mapWorkbench).toContainText('模型生成场景：通勤包内补涂');
      await page.locator('.content-map-tabs button').filter({ hasText: '生成流程' }).click();
      await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('生成结构化矩阵');
      await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('test-text-model');
      await expect(mapWorkbench.locator('.content-map-build-detail')).toContainText('待处理');
      await expect(mapWorkbench).toContainText('已同步到 Bugu 团队工作区', { timeout: 20_000 });

      const generationTrace = await page.evaluate(async (workspacePath) => {
        const [map] = await window.contentStudio.listContentKnowledgeMaps(workspacePath);
        const [run] = await window.contentStudio.listContentKnowledgeMapBuildRuns(workspacePath);
        return {
          mapTitle: map?.title,
          mapModel: map?.model,
          sellingTitle: map?.sellingPoints[0]?.title,
          painTitle: map?.painPoints[0]?.title,
          scenarioTitle: map?.scenarios[0]?.title,
          gaps: map?.gaps ?? [],
          readyPercent: map?.coverage.readyPercent,
          skuRowCount: map?.coverage.skuRowCount,
          competitorObservationCount: map?.coverage.competitorObservationCount,
          inputSourceCount: map?.coverage.inputSourceCount,
          skuScenarioTitles: map?.scenarios.filter((row) => row.title.includes('SKU 场景')).map((row) => row.title) ?? [],
          feedbackPainTitles: map?.painPoints.filter((row) => row.title.includes('补涂') || row.title.includes('通勤包')).map((row) => row.title) ?? [],
          competitorTitles: [
            ...(map?.sellingPoints ?? []),
            ...(map?.painPoints ?? []),
            ...(map?.scenarios ?? []),
          ].filter((row) => row.title.includes('竞品') || row.title.includes('差异化机会')).map((row) => row.title),
          buildRunModel: run?.model,
          buildRunStatus: run?.status,
          buildRunSteps: run?.steps.map((step) => step.key) ?? [],
          syncStatus: map?.syncStatus,
          teamRevision: map?.teamSync.revision,
          buildRunRevision: run?.teamSync?.revision,
        };
      }, workspaceDir);
      expect(generationTrace.mapModel, JSON.stringify(generationTrace)).toBe('test-text-model');
      expect(generationTrace.sellingTitle, JSON.stringify(generationTrace)).toBe('模型生成卖点：通勤清爽补涂');
      expect(generationTrace.painTitle, JSON.stringify(generationTrace)).toBe('模型生成痛点：担心补涂厚重');
      expect(generationTrace.scenarioTitle, JSON.stringify(generationTrace)).toBe('模型生成场景：通勤包内补涂');
      expect(generationTrace.gaps.join('\n'), JSON.stringify(generationTrace)).toContain('模型识别缺口');
      expect(generationTrace.inputSourceCount, JSON.stringify(generationTrace)).toBe(4);
      expect(generationTrace.skuRowCount, JSON.stringify(generationTrace)).toBe(2);
      expect(generationTrace.competitorObservationCount, JSON.stringify(generationTrace)).toBe(1);
      expect(generationTrace.skuScenarioTitles.join('\n'), JSON.stringify(generationTrace)).toContain('commute-mini');
      expect(generationTrace.feedbackPainTitles.join('\n'), JSON.stringify(generationTrace)).toContain('下午补涂会不会很厚重');
      expect(generationTrace.competitorTitles.join('\n'), JSON.stringify(generationTrace)).toContain('竞品');
      expect(generationTrace.buildRunModel, JSON.stringify(generationTrace)).toBe('test-text-model');
      expect(generationTrace.buildRunSteps, JSON.stringify(generationTrace)).toEqual(expect.arrayContaining(['prepare-seed', 'structure-output', 'quality-check']));
      expect(generationTrace.syncStatus, JSON.stringify(generationTrace)).toBe('synced');
      expect(generationTrace.teamRevision, JSON.stringify(generationTrace)).toBe('rev-e2e-content-2');
      expect(generationTrace.buildRunRevision, JSON.stringify(generationTrace)).toBe('rev-e2e-content-2');
      expect(requests.some((request) => request.userMessage.includes('"task":"generate_content_knowledge_map"') || request.userMessage.includes('"task": "generate_content_knowledge_map"'))).toBe(true);
      const knowledgeMapRequest = bugu.requests.find((request) => request.route === 'content-knowledge-maps');
      const buildRunRequest = bugu.requests.find((request) => request.route === 'content-build-runs');
      expect(knowledgeMapRequest?.payload.title, JSON.stringify(bugu.requests)).toBe('模型生成内容知识地图');
      expect(knowledgeMapRequest?.payload.model, JSON.stringify(bugu.requests)).toBe('test-text-model');
      expect(knowledgeMapRequest?.payload.sourceInputSourceIds?.length, JSON.stringify(bugu.requests)).toBe(4);
      expect(knowledgeMapRequest?.payload.coverage?.skuRowCount, JSON.stringify(bugu.requests)).toBe(2);
      expect(knowledgeMapRequest?.payload.coverage?.competitorObservationCount, JSON.stringify(bugu.requests)).toBe(1);
      expect(knowledgeMapRequest?.payload.snapshot?.sellingPoints?.some((row) => row.title === '模型生成卖点：通勤清爽补涂'), JSON.stringify(bugu.requests)).toBe(true);
      expect(knowledgeMapRequest?.payload.snapshot?.painPoints?.some((row) => row.title.includes('下午补涂会不会很厚重')), JSON.stringify(bugu.requests)).toBe(true);
      expect(knowledgeMapRequest?.payload.snapshot?.scenarios?.some((row) => row.title.includes('commute-mini')), JSON.stringify(bugu.requests)).toBe(true);
      expect(buildRunRequest?.payload.model, JSON.stringify(bugu.requests)).toBe('test-text-model');
      expect(buildRunRequest?.payload.inputSourceIds?.length, JSON.stringify(bugu.requests)).toBe(4);
      expect(buildRunRequest?.payload.steps?.some((step) => step.key === 'structure-output' && step.status === 'completed'), JSON.stringify(bugu.requests)).toBe(true);
      expect(buildRunRequest?.payload.baseRevision, JSON.stringify(bugu.requests)).toBe('rev-e2e-content-1');
    }, {
      requireExplicitTextKey: false,
      env: {
        CONTENT_STUDIO_BUGU_CONTENT_API_BASE_URL: bugu.baseUrl,
        CONTENT_STUDIO_BUGU_CONTENT_API_TOKEN: 'e2e-content-token',
      },
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await bugu.close();
  }
});

test('对话里的待处理动作可以恢复到真实输入源页面', async ({}, testInfo) => {
  test.setTimeout(90_000);

  const { server, baseUrl } = await startFakeOpenAITextServer(fakeBusinessChainTextOutput);
  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    await page.evaluate(async ({ workspacePath, endpoint }) => {
      const api = window.contentStudio;
      await api.saveSettings({ workspacePath });
      await api.saveModelConfig({
        textProtocol: 'openai-chat',
        textApiEndpoint: endpoint,
        textApiKey: 'test-text-key',
        textModel: 'test-text-model',
      });
    }, { workspacePath: workspaceDir, endpoint: baseUrl });

    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待待处理动作测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, 'Prompt 工作台');
    const promptPanel = page.locator('.prompt-workbench > .agent-session-panel');
    await expect(promptPanel).toBeVisible({ timeout: 20_000 });
    await promptPanel.locator('.agent-session-footer textarea').fill('请先判断需要补哪些产品资料和参考素材。');
    await promptPanel.locator('.agent-session-footer button').filter({ hasText: '开始协作' }).click();

    const actionButton = promptPanel.locator(
      '.agent-execution-events [data-event-class="action.required"][data-action-kind="add-input-source"] .agent-event-action',
    );
    await expect(actionButton).toHaveText('补输入源', { timeout: 20_000 });
    await actionButton.click();

    await expect(page.locator('.input-sources-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.input-sources-workbench > .agent-session-panel .agent-session-footer')).toContainText('登记文本输入源');
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
        const session = sessions.find((item) => item.userIntent === '请先判断需要补哪些产品资料和参考素材。');
        return Boolean(session?.executionEvents?.some((event) => (
          event.eventClass === 'action.resolved' &&
          event.payload?.decision === 'open-input-source' &&
          event.payload?.resolvedFromEventId
        )));
      }, workspaceDir),
      { message: '等待补输入源动作写入运行事实', timeout: 20_000 },
    ).toBe(true);
    const resolvedActionEvent = page.locator(
      '.input-sources-workbench > .agent-session-panel .agent-execution-events [data-event-class="action.required"][data-action-kind="add-input-source"]',
    ).first();
    await expect(resolvedActionEvent).toContainText('已处理', { timeout: 20_000 });
    await expect(resolvedActionEvent.locator('.agent-event-action')).toHaveCount(0);
    const inputRuntimeSummary = page.locator('.input-sources-workbench > .agent-session-panel .agent-runtime-summary');
    await expect(inputRuntimeSummary.locator('[data-summary-kind="sources"]')).toContainText('0');
    await expect(inputRuntimeSummary.locator('[data-summary-kind="actions"]')).toContainText('0');

    const registerPanel = page.locator('.input-source-register-panel');
    await registerPanel.locator('label').filter({ hasText: '标题' }).locator('input').fill('Playwright 补充产品资料');
    await registerPanel.locator('label').filter({ hasText: '文本 / 用户意图' }).locator('textarea').fill('产品事实：便携条包。使用场景：早餐后、办公室抽屉。合规边界：不承诺治疗。');
    await page.locator('.input-sources-workbench > .agent-session-panel .agent-session-footer button').filter({ hasText: '登记文本输入源' }).click();
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
        const session = sessions.find((item) => item.userIntent === '请先判断需要补哪些产品资料和参考素材。');
        const sources = await window.contentStudio.listInputSources(workspacePath);
        const source = sources.find((item) => item.title === 'Playwright 补充产品资料');
        return {
          linked: Boolean(source && session?.inputSourceIds.includes(source.id)),
          evidenceChanged: Boolean(source && session?.executionEvents?.some((event) => (
            event.eventClass === 'evidence.changed' &&
            event.evidenceRefs?.includes(`input-source:${source.id}`)
          ))),
          noteVisible: Boolean(session?.messages?.some((message) => (
            message.kind === 'note' &&
            message.content.includes('Playwright 补充产品资料')
          ))),
        };
      }, workspaceDir),
      { message: '等待补充输入源绑定回原对话', timeout: 20_000 },
    ).toEqual({ linked: true, evidenceChanged: true, noteVisible: true });
    await expect(inputRuntimeSummary.locator('[data-summary-kind="sources"]')).toContainText('1', { timeout: 20_000 });
    await expect(inputRuntimeSummary.locator('[data-summary-kind="evidence"]')).toContainText('1');

    const inputAgentFooter = page.locator('.input-sources-workbench > .agent-session-panel .agent-session-footer');
    await inputAgentFooter.locator('textarea').fill('资料已补齐，请基于新资料重新生成图片 Prompt。');
    await inputAgentFooter.locator('button').filter({ hasText: '继续会话' }).click();
    await expect.poll(
      async () => page.evaluate(async (workspacePath) => {
        const sessions = await window.contentStudio.listAgentPromptSessions(workspacePath);
        const session = sessions.find((item) => item.userIntent === '请先判断需要补哪些产品资料和参考素材。');
        return {
          hasAdjustment: Boolean(session?.messages?.some((message) => (
            message.kind === 'adjustment' &&
            message.content.includes('资料已补齐')
          ))),
          hasDraft: Boolean(session?.messages?.some((message) => (
            message.kind === 'draft' &&
            message.content.includes('便携条包')
          ))),
          modelCompleted: Boolean(session?.executionEvents?.some((event) => event.eventClass === 'model.completed')),
        };
      }, workspaceDir),
      { message: '等待补资料后继续生成草稿', timeout: 20_000 },
    ).toEqual({ hasAdjustment: true, hasDraft: true, modelCompleted: true });
    await expect(inputRuntimeSummary.locator('[data-summary-kind="artifacts"]')).toContainText('1', { timeout: 20_000 });
    }, { requireExplicitTextKey: false });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('SOP 执行页显式选择资料并写入运行记录', async ({}, testInfo) => {
  test.setTimeout(120_000);

  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    const setup = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      await api.saveSettings({ workspacePath });
      const productSource = await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '显式选择产品资料',
        text: [
          '产品名称：便携营养条包',
          '卖点：早餐后和办公室抽屉随手取用',
          '规格：15g * 20 条',
          '适用场景：早餐后、通勤包、办公室抽屉',
          '禁用表达：不得承诺治疗、见效或替代专业建议',
        ].join('\n'),
        summary: '显式选择产品资料',
        tags: ['product'],
      });
      const feedbackSource = await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'user-feedback',
        title: '不应误选的评论资料',
        text: '用户：价格有点贵，值不值这个钱？',
        summary: '不应误选的评论资料',
        tags: ['feedback'],
      });
      return { productSourceId: productSource.id, feedbackSourceId: feedbackSource.id };
    }, workspaceDir);
    await mkdir(join(workspaceDir, '.content-studio'), { recursive: true });
    await writeFile(join(workspaceDir, '.content-studio', 'content-knowledge-releases.json'), JSON.stringify([{
      id: 'release-e2e-sop-selected',
      workspacePath: workspaceDir,
      workspaceId: 'workspace-e2e-sop-selected',
      contentKnowledgeMapId: 'map-e2e-sop-selected',
      contentKnowledgeMapTitle: 'E2E SOP 团队内容地图',
      title: 'E2E SOP 团队知识包',
      version: 'v1.6',
      status: 'published',
      packageObjectKey: 'content-workspaces/workspace-e2e-sop-selected/agentknowledge/release-e2e-sop-selected.zip',
      packagePublicUrl: 'https://downloads.bugu.run/content-workspaces/workspace-e2e-sop-selected/agentknowledge/release-e2e-sop-selected.zip',
      packageUploadStatus: 'stored',
      approvalStatus: 'approved',
      files: ['KNOWLEDGE.md', 'ontology/ontology.json'],
      issues: [],
      baseRevision: 'rev-e2e-sop-selected',
      serverReleaseId: 'release-e2e-sop-selected',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }], null, 2));

    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待 SOP 输入源选择测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, 'SOP 工作流');
    await page.locator('.workflow-definition-list .record-card').filter({ hasText: '产品商业素材 SOP' }).first().click();
    const runner = page.locator('.workflow-runner-panel');
    await expect(runner).toContainText('产品商业素材 SOP');
    await expect(runner).toContainText('E2E SOP 团队知识包 v1.6');
    const productOption = runner.locator('.workflow-input-source-option').filter({ hasText: '显式选择产品资料' });
    await expect(productOption).toBeVisible();
    await expect(productOption.locator('input')).toBeChecked();
    await expect(runner.locator('.workflow-input-source-option').filter({ hasText: '不应误选的评论资料' })).toHaveCount(0);

    await runner.locator('textarea').nth(1).fill('生成主图、卖点图和详情页模块三类素材 Prompt。');
    await runner.locator('label').filter({ hasText: '电商平台' }).locator('select').selectOption('通用电商');
    await productOption.locator('input').uncheck();
    await expect(runner.getByRole('button', { name: '运行 SOP' })).toBeDisabled();
    await expect(runner).toContainText('请至少选择一个资料来源');
    await runner.locator('label').filter({ hasText: '补充资料说明' }).locator('textarea').fill([
      '产品名称：便携营养条包',
      '卖点：早餐后和办公室抽屉随手取用',
      '规格：15g * 20 条',
      '禁用表达：不得承诺治疗。',
    ].join('\n'));
    await expect(runner.getByRole('button', { name: '运行 SOP' })).toBeEnabled();
    await expect(runner).toContainText('已粘贴临时资料，将自动留痕');
    await runner.locator('label').filter({ hasText: '补充资料说明' }).locator('textarea').fill('');
    await expect(runner.getByRole('button', { name: '运行 SOP' })).toBeDisabled();
    await productOption.locator('input').check();
    await expect(runner.getByRole('button', { name: '运行 SOP' })).toBeEnabled();
    await runner.locator('.workflow-team-release-picker select').selectOption('release-e2e-sop-selected');
    await expect(runner.locator('.workflow-team-release-picker')).toContainText('E2E SOP 团队知识包 v1.6');
    await runner.getByRole('button', { name: '运行 SOP' }).click();

    await expect(page.locator('.workflow-history-panel')).toBeVisible({ timeout: 20_000 });
    const runDetail = page.locator('.workflow-run-detail-panel');
    await expect(runDetail).toContainText('本次资料来源');
    await expect(runDetail).toContainText('显式选择产品资料');
    await expect(runDetail).toContainText('产品资料');
    await expect(runDetail).toContainText('补充资料说明');
    await expect(runDetail).not.toContainText('不应误选的评论资料');
    const actionPanel = runDetail.locator('.workflow-run-action-panel');
    await expect(actionPanel).toContainText('打开图片工作台');
    await expect(actionPanel).toContainText('商业图片提示词');
    const trace = await page.evaluate(async ({ workspacePath, productSourceId, feedbackSourceId }) => {
      const runs = await window.contentStudio.listWorkflowRuns(workspacePath);
      const run = runs.find((item) => item.workflowKey === 'product-commercial-assets');
      return {
        runId: run?.id,
        status: run?.status,
        inputSourceIds: run?.inputSourceIds ?? [],
        hasProductSource: Boolean(run?.inputSourceIds?.includes(productSourceId)),
        hasFeedbackSource: Boolean(run?.inputSourceIds?.includes(feedbackSourceId)),
        productStepStatus: run?.steps.find((step) => step.stepId === 'product_brief_structure')?.status,
        teamReleaseId: run?.teamKnowledgeRelease?.id,
        teamReleaseVersion: run?.teamKnowledgeRelease?.version,
        hasTeamReleaseArtifact: Boolean(run?.artifactRefs.includes('team-knowledge-release:release-e2e-sop-selected')),
      };
    }, { workspacePath: workspaceDir, ...setup });
    expect(trace.runId, JSON.stringify(trace)).toBeTruthy();
    expect(trace.hasProductSource, JSON.stringify(trace)).toBe(true);
    expect(trace.hasFeedbackSource, JSON.stringify(trace)).toBe(false);
    expect(trace.productStepStatus, JSON.stringify(trace)).toBe('succeeded');
    expect(trace.teamReleaseId, JSON.stringify(trace)).toBe('release-e2e-sop-selected');
    expect(trace.teamReleaseVersion, JSON.stringify(trace)).toBe('v1.6');
    expect(trace.hasTeamReleaseArtifact, JSON.stringify(trace)).toBe(true);

    await actionPanel.locator('button').filter({ hasText: '打开图片工作台' }).click();
    await expect(page.locator('.image-workbench-layout')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.image-prompt-panel textarea')).toHaveValue(/主图 Prompt|卖点图 Prompt|详情页模块 Prompt/);
    const promptValue = await page.locator('.image-prompt-panel textarea').inputValue();
    expect(promptValue).toContain('追溯资料：已关联 1 份产品资料 / SKU 表');
    expect(promptValue).not.toContain(setup.productSourceId);
    expect(promptValue).not.toContain('追溯输入源');
    expect(promptValue).not.toContain('类型：main-image');
  });
});

test('新增 SOP 下一步动作能进入普通用户业务工作台', async ({}, testInfo) => {
  test.setTimeout(120_000);

  const { server, baseUrl } = await startFakeOpenAITextServer(fakeBusinessChainTextOutput);

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
        const definitions = await api.listWorkflowDefinitions(workspacePath);
        const feedbackDefinition = definitions.find((item) => item.key === 'feedback-topic-matrix');
        const greenDefinition = definitions.find((item) => item.key === 'green-screen-card-package');
        if (!feedbackDefinition) throw new Error('缺少评论痛点选题 SOP');
        if (!greenDefinition) throw new Error('缺少绿幕文案图 SOP');

        const feedbackSource = await api.registerInputSource({
          workspacePath,
          kind: 'manual-note',
          purpose: 'user-feedback',
          title: '下一步测试评论原声',
          text: [
            '评论：价格有点贵，想知道到底值不值。',
            '差评：早上总是忘记吃，坚持不下来。',
            '客服：孩子和老人能不能吃，有没有禁忌？',
            '私信：办公室抽屉里放一盒会不会方便一点？',
          ].join('\n'),
          summary: '下一步测试评论原声',
          tags: ['feedback'],
        });
        const feedbackRun = await api.startWorkflowRun({
          workspacePath,
          workflowDefinitionId: feedbackDefinition.id,
          inputSourceIds: [feedbackSource.id],
          inputs: {
            source: '评论、差评、客服问题和私信原声',
            intent: '生成下周小红书选题、标题方向和客服异议话术。',
            reviewOwner: '运营负责人',
            platform: '小红书',
          },
        });

        const greenRun = await api.startWorkflowRun({
          workspacePath,
          workflowDefinitionId: greenDefinition.id,
          inputs: {
            source: [
              '标题卡：早餐后顺手一次',
              '卖点卡：便携条包，包里抽屉都能放',
              'CTA：先从每天顺手一次开始',
            ].join('\n'),
            intent: '拆成第三方混剪可叠加的绿幕文案图。',
            reviewOwner: '短视频运营',
            duration: '4',
          },
        });
        return {
          feedbackRunId: feedbackRun.id,
          feedbackStatus: feedbackRun.status,
          greenRunId: greenRun.id,
          greenStatus: greenRun.status,
        };
      }, { workspacePath: workspaceDir, endpoint: baseUrl });

      expect(setup.feedbackStatus, JSON.stringify(setup)).toBe('queued');
      expect(setup.greenStatus, JSON.stringify(setup)).toBe('queued');
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待新增 SOP 下一步测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      const runDetail = page.locator('.workflow-run-detail-panel');
      const runList = page.locator('.workflow-run-list');

      await runList.locator('.workflow-run-card').filter({ hasText: '评论痛点选题 SOP' }).first().click();
      await expect(runDetail).toContainText('评论痛点选题 SOP');
      await expect(runDetail.locator('.workflow-run-action-panel')).toContainText('审核选题提示词');
      await runDetail.locator('.workflow-run-action-panel button').filter({ hasText: '审核选题提示词' }).click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-draft-editor')).toHaveValue(/价格和信任顾虑|客服异议处理|真实用户原声/);

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await runList.locator('.workflow-run-card').filter({ hasText: '绿幕文案图 SOP' }).first().click();
      await expect(runDetail).toContainText('绿幕文案图 SOP');
      await expect(runDetail.locator('.workflow-run-action-panel')).toContainText('审核绿幕图');
      await runDetail.locator('.workflow-run-action-panel button').filter({ hasText: '审核绿幕图' }).click();
      await expect(page.locator('.asset-library-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.asset-library-workbench')).toContainText('合规检测 / 人工审核台');
      await expect(page.locator('.asset-library-workbench')).toContainText('绿幕图 3', { timeout: 20_000 });
      await expect(page.locator('.asset-tile').filter({ hasText: '绿幕文案图' }).first()).toContainText('待审核');

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await runList.locator('.workflow-run-card').filter({ hasText: '绿幕文案图 SOP' }).first().click();
      const artifactPanel = runDetail.locator('.workflow-run-artifact-panel');
      await expect(artifactPanel).toContainText('打开绿幕文案图');
      await artifactPanel.locator('button').filter({ hasText: '打开绿幕文案图' }).click();
      await expect(page.locator('.green-screen-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.green-screen-editor-panel')).toContainText('标题卡', { timeout: 20_000 });
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('Prompt 工作台按用途收敛动作并能物化 Skill / SOP 草案', async ({}, testInfo) => {
  test.setTimeout(90_000);

  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    const setup = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      await api.saveSettings({ workspacePath });
      const source = await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'sop-input',
        title: 'Skill 输入源',
        text: '围绕品牌知识库和用户意图生成可复用 Prompt，不编造功效和案例。',
        summary: 'Skill 输入源',
        tags: ['skill'],
      });
      await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'brand-kb',
        title: '品牌知识库输入源',
        text: '品牌调性：专业、克制、真实。合规：不夸大效果，不做无依据承诺。',
        summary: '品牌知识库输入源',
        tags: ['brand'],
      });
      await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'ip-kb',
        title: 'IP 知识库输入源',
        text: 'IP 体系：身份、价值观、语言、判断方法、素材、创作引擎。',
        summary: 'IP 知识库输入源',
        tags: ['ip'],
      });
      await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '产品资料输入源',
        text: '产品事实：便携条包。场景：早餐后、办公室抽屉。',
        summary: '产品资料输入源',
        tags: ['product'],
      });
      const skillDraft = await api.generatePromptDraft({
        workspacePath,
        title: 'Product Prompt Skill',
        purpose: 'skill',
        userIntent: '沉淀为一个可复用的 Prompt 编排 skill。',
        inputSourceIds: [source.id],
      });
      const sopDraft = await api.generatePromptDraft({
        workspacePath,
        title: 'Reusable SOP Method',
        purpose: 'sop',
        userIntent: '沉淀为一个通用 SOP，不应误套图片生成模板。',
        inputSourceIds: [source.id],
      });
      return { skillDraftId: skillDraft.id, sopDraftId: sopDraft.id };
    }, workspaceDir);

    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待 Prompt Skill 草案测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, 'Prompt 工作台');
    let promptSourcePanel = await openPromptSupportDrawer(page);
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'Skill 输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '品牌知识库输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '产品资料输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'IP 知识库输入源' }).locator('input')).not.toBeChecked();
    await promptSourcePurposeSelect(promptSourcePanel).selectOption('skill');
    await expect(promptSourceTitleInput(promptSourcePanel)).toHaveValue('Skill 草案');
    await expect(promptSourceIntentInput(promptSourcePanel)).toHaveValue(/本地 skill/);
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'Skill 输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '品牌知识库输入源' }).locator('input')).not.toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'IP 知识库输入源' }).locator('input')).not.toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '产品资料输入源' }).locator('input')).not.toBeChecked();
    const editor = page.locator('.prompt-editor-panel');
    await expect(editor).toContainText('Product Prompt Skill', { timeout: 20_000 });
    await expect(editor.locator('button').filter({ hasText: '沉淀为 Skill' })).toBeVisible();
    await expect(editor.locator('button').filter({ hasText: '发送到图片' })).toHaveCount(0);
    await expect(editor.locator('button').filter({ hasText: '打开视频 Prompt' })).toHaveCount(0);
    await expect(editor.locator('button').filter({ hasText: '沉淀为 SOP' })).toHaveCount(0);

    await editor.locator('button').filter({ hasText: '沉淀为 Skill' }).click();
    await expect(page.locator('.skills-manager-shell')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.skills-manager-list')).toContainText('product-prompt-skill', { timeout: 20_000 });

    const persisted = await page.evaluate(async ({ workspacePath, draftId: id }) => {
      const api = window.contentStudio;
      const draft = (await api.listPromptDrafts(workspacePath)).find((item) => item.id === id);
      const skill = (await api.scanSkills(workspacePath)).find((item) => item.slug === 'product-prompt-skill');
      return {
        draftStatus: draft?.status,
        materializedTarget: draft?.materializedTarget,
        skillContent: skill?.content ?? '',
      };
    }, { workspacePath: workspaceDir, draftId: setup.skillDraftId });

    expect(persisted.draftStatus).toBe('materialized');
    expect(persisted.materializedTarget).toBe('skill');
    expect(persisted.skillContent).toContain('来源提示词草稿：Product Prompt Skill');
    expect(persisted.skillContent).toContain('只使用用户提供的知识库');

    await clickNavItem(page, 'Prompt 工作台');
    promptSourcePanel = await openPromptSupportDrawer(page);
    await promptSourcePurposeSelect(promptSourcePanel).selectOption('sop');
    await expect(promptSourceTitleInput(promptSourcePanel)).toHaveValue('SOP 草案');
    await expect(promptSourceIntentInput(promptSourcePanel)).toHaveValue(/发布运行的 SOP 草案/);
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'Skill 输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '品牌知识库输入源' }).locator('input')).not.toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'IP 知识库输入源' }).locator('input')).not.toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '产品资料输入源' }).locator('input')).not.toBeChecked();
    await expect(editor).toContainText('Reusable SOP Method', { timeout: 20_000 });
    await expect(editor.locator('button').filter({ hasText: '沉淀为 SOP' })).toBeVisible();
    await expect(editor.locator('button').filter({ hasText: '发送到图片' })).toHaveCount(0);
    await expect(editor.locator('button').filter({ hasText: '沉淀为 Skill' })).toHaveCount(0);

    await editor.locator('button').filter({ hasText: '沉淀为 SOP' }).click();
    await expect(page.locator('.workflow-feature-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.workflow-detail-panel')).toContainText('Reusable SOP Method SOP 草案', { timeout: 20_000 });

    const workflowPersisted = await page.evaluate(async ({ workspacePath, draftId: id }) => {
      const api = window.contentStudio;
      const draft = (await api.listPromptDrafts(workspacePath)).find((item) => item.id === id);
      const workflow = (await api.listWorkflowDefinitions(workspacePath)).find((item) => item.title === 'Reusable SOP Method SOP 草案');
      return {
        draftStatus: draft?.status,
        materializedTarget: draft?.materializedTarget,
        workflowKey: workflow?.key,
        stepIds: workflow?.steps.map((step) => step.id) ?? [],
      };
    }, { workspacePath: workspaceDir, draftId: setup.sopDraftId });

    expect(workflowPersisted.draftStatus).toBe('materialized');
    expect(workflowPersisted.materializedTarget).toBe('workflow');
    expect(workflowPersisted.workflowKey).toMatch(/^custom-sop-draft-/);
    expect(workflowPersisted.stepIds).toContain('agent_read');
    expect(workflowPersisted.stepIds).not.toContain('image_generate');
  });
});

test('视频素材包 SOP 运行详情可以推进 Prompt、导入、绿幕和混剪交接', async ({}, testInfo) => {
  test.setTimeout(180_000);

    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async (workspacePath) => {
        await window.contentStudio.saveSettings({ workspacePath });
        await window.contentStudio.registerInputSource({
          workspacePath,
          kind: 'manual-note',
          purpose: 'product-brief',
          title: '视频 SOP 产品资料',
          text: [
            '产品名称：便携营养条包',
            '卖点：早餐后和办公室抽屉随手取用',
            '规格：15g * 20 条',
            '适用场景：早餐后、通勤、办公室',
            '禁用表达：不得承诺治疗、见效或替代专业建议',
          ].join('\n'),
          summary: '视频 SOP 产品资料',
          tags: ['video-sop'],
        });
      }, workspaceDir);
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待 SOP 业务链测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, 'SOP 工作流');
    const videoSopCard = page.locator('.workflow-definition-list .record-card').filter({ hasText: '视频素材包 SOP' }).first();
    await expect(videoSopCard).toBeVisible();
    await videoSopCard.click();
    await expect(page.locator('.workflow-runner-panel')).toContainText('视频素材包 SOP');
    await page.locator('.workflow-runner-panel textarea').nth(0).fill('品牌场景库、脚本和产品素材。');
    await page.locator('.workflow-runner-panel textarea').nth(1).fill('生成 15 秒视频素材 Prompt，第三方生成后手动导入，再生成绿幕图和混剪清单。');
    await page.locator('.workflow-runner-panel input[type="number"]').fill('15');
    await page.locator('.workflow-runner-panel button').filter({ hasText: '运行 SOP' }).click();

    const runDetail = page.locator('.workflow-run-detail-panel');
    await expect(page.locator('.workflow-history-panel')).toBeVisible({ timeout: 20_000 });
    await expect(runDetail).toContainText('视频素材包 SOP');
    await expect(runDetail.locator('.workflow-run-action-panel')).toContainText(/打开视频 Prompt|进入视频 Prompt/);
    await runDetail.locator('.workflow-run-action-panel button').click();

    await expect(page.locator('.video-prompt-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.video-prompt-preview pre')).toContainText(/视频 Prompt|任务：/, { timeout: 20_000 });
    await page.locator('.video-prompt-builder-panel button').filter({ hasText: '复制到第三方平台' }).click();
    await expect(page.locator('.video-prompt-history-panel')).toContainText(/RunningHub|1/, { timeout: 20_000 });
    await expect(page.locator('.video-prompt-handoff-card')).toContainText('已复制待导入', { timeout: 20_000 });
    await page.locator('.video-prompt-handoff-card button').filter({ hasText: '去导入' }).click();
    await expect(page.locator('.video-import-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.video-import-filter-row')).toContainText('已复制待导入 1');
    await expect(page.locator('.video-import-draft-panel')).toContainText('已复制待导入');
    await expect(page.locator('.video-import-handoff-note')).toContainText('Prompt 已复制到第三方平台');

    await clickNavItem(page, 'SOP 工作流');
    const latestNextAction = page.locator('.workflow-latest-run-next');
    await expect(latestNextAction).toContainText('导入成品视频', { timeout: 20_000 });
    await latestNextAction.locator('button').filter({ hasText: '继续下一步' }).click();
    await expect(latestNextAction).toContainText('编辑并生成绿幕图', { timeout: 20_000 });
    await expect(page.locator('.workflow-latest-run')).toContainText('third-party-finished-video.mp4');
    await clickNavItem(page, '成品视频导入');
    await expect(page.locator('.video-import-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.video-import-draft-panel')).toContainText('已导入成品');
    await expect(page.locator('.video-import-card').filter({ hasText: 'third-party-finished-video.mp4' })).toContainText('提示词已关联');
    await clickNavItem(page, 'SOP 工作流');
    await latestNextAction.locator('button').filter({ hasText: '继续下一步' }).click();

    await expect(page.locator('.green-screen-workbench')).toBeVisible({ timeout: 20_000 });
    await page.locator('.green-screen-editor-panel button').filter({ hasText: '生成绿幕文案图' }).click();
    await expect(page.locator('.overlay-card-tile').first()).toBeVisible({ timeout: 20_000 });

    await clickNavItem(page, 'SOP 工作流');
    await expect(latestNextAction).toContainText('审核混剪素材', { timeout: 20_000 });
    await latestNextAction.locator('button').filter({ hasText: '继续下一步' }).click();

    await expect(page.locator('.mix-export-workbench')).toBeVisible({ timeout: 20_000 });
    const importedVideoCard = page.locator('.mix-asset-card').filter({ hasText: 'third-party-finished-video.mp4' }).first();
    await expect(importedVideoCard).toBeVisible();
    await expect(importedVideoCard).toContainText('SOP 已关联');
    await expect(importedVideoCard.getByRole('button', { name: '提示词', exact: true })).toBeVisible();
    await expect(importedVideoCard.getByRole('button', { name: 'SOP', exact: true })).toBeVisible();
    await importedVideoCard.getByRole('button', { name: '通过', exact: true }).click();
    await expect(importedVideoCard).toContainText('已通过');
    await expect(importedVideoCard.getByRole('button', { name: '沉淀提示词', exact: true })).toBeVisible();
    await importedVideoCard.getByRole('button', { name: '沉淀提示词', exact: true }).click();
    await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.prompt-draft-editor')).toHaveValue(/成功素材反向沉淀 Prompt|third-party-finished-video\.mp4|视频 Prompt/, { timeout: 20_000 });
    await expect(page.locator('.prompt-draft-editor')).not.toHaveValue(/原素材 Key|SOP Run|generation-log|input-source/);

    const distilledVideoTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const runs = await api.listWorkflowRuns(workspacePath);
      const sources = await api.listInputSources(workspacePath);
      const drafts = await api.listPromptDrafts(workspacePath);
      const run = runs.find((item) => item.workflowKey === 'video-material-package');
      const distilledSource = sources.find((item) =>
        item.workflowRunId === run?.id
        && item.purpose === 'successful-asset'
        && item.kind === 'video'
        && item.tags.includes('prompt-distilled'),
      );
      const distilledDraft = drafts.find((item) =>
        Boolean(distilledSource?.id && item.inputSourceIds.includes(distilledSource.id)),
      );
      const importedAssetSource = sources.find((item) =>
        item.workflowRunId === run?.id
        && item.purpose === 'successful-asset'
        && item.kind === 'video'
        && !item.tags.includes('prompt-distilled'),
      );
      return {
        runId: run?.id,
        importedAssetSourceId: importedAssetSource?.id,
        sourceId: distilledSource?.id,
        sourcePurpose: distilledSource?.purpose,
        sourceKind: distilledSource?.kind,
        sourcePath: distilledSource?.sourcePath,
        draftPurpose: distilledDraft?.purpose,
        draftModel: distilledDraft?.model,
        draftWorkflowRunId: distilledDraft?.workflowRunId,
        runHasDistilledSourceRef: distilledSource ? run?.artifactRefs.includes(`input-source:${distilledSource.id}`) : false,
        runHasDistilledDraftRef: distilledDraft ? run?.artifactRefs.includes(`prompt-draft:${distilledDraft.id}`) : false,
      };
    }, workspaceDir);
    expect(distilledVideoTrace.importedAssetSourceId, JSON.stringify(distilledVideoTrace)).toBeTruthy();
    expect(distilledVideoTrace.sourcePurpose, JSON.stringify(distilledVideoTrace)).toBe('successful-asset');
    expect(distilledVideoTrace.sourceKind, JSON.stringify(distilledVideoTrace)).toBe('video');
    expect(distilledVideoTrace.sourcePath, JSON.stringify(distilledVideoTrace)).toContain('third-party-finished-video.mp4');
    expect(distilledVideoTrace.draftPurpose, JSON.stringify(distilledVideoTrace)).toBe('video');
    expect(distilledVideoTrace.draftModel, JSON.stringify(distilledVideoTrace)).toBe('local-successful-asset-distiller');
    expect(distilledVideoTrace.draftWorkflowRunId, JSON.stringify(distilledVideoTrace)).toBe(distilledVideoTrace.runId);
    expect(distilledVideoTrace.runHasDistilledSourceRef, JSON.stringify(distilledVideoTrace)).toBe(true);
    expect(distilledVideoTrace.runHasDistilledDraftRef, JSON.stringify(distilledVideoTrace)).toBe(true);

    await clickNavItem(page, 'Prompt 工作台');
    const promptSourcePanel = await openPromptSupportDrawer(page);
    const traceSourceInput = page.locator('.prompt-source-option').filter({ hasText: '追溯源' }).locator('input').first();
    await expect(traceSourceInput).toBeDisabled();
    await expect(traceSourceInput).not.toBeChecked();
    await promptSourceTitleInput(promptSourcePanel).fill('追溯源隔离验证');
    await promptSourceIntentInput(promptSourcePanel).fill('基于当前页面生成一个新视频 Prompt，但不要把成功素材反向沉淀的追溯源作为新输入源。');
    await promptSourcePanel.locator('button').filter({ hasText: '仅生成草稿' }).click();
    await expect(page.locator('.prompt-draft-editor')).toHaveValue(/Prompt 草稿|任务：/, { timeout: 20_000 });
    const promptIsolationTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const sources = await api.listInputSources(workspacePath);
      const drafts = await api.listPromptDrafts(workspacePath);
      const traceSourceIds = sources
        .filter((source) => source.tags.includes('prompt-distilled'))
        .map((source) => source.id);
      const generatedDraft = drafts.find((draft) => draft.title === '追溯源隔离验证');
      return {
        traceSourceIds,
        draftInputSourceIds: generatedDraft?.inputSourceIds ?? [],
      };
    }, workspaceDir);
    expect(promptIsolationTrace.traceSourceIds.length, JSON.stringify(promptIsolationTrace)).toBeGreaterThan(0);
    expect(
      promptIsolationTrace.traceSourceIds.some((id) => promptIsolationTrace.draftInputSourceIds.includes(id)),
      JSON.stringify(promptIsolationTrace),
    ).toBe(false);
    await promptSourcePanel.locator('button').filter({ hasText: '补输入源' }).click();
    await expect(page.locator('.input-sources-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.input-source-list .input-source-card').first()).toContainText('成功素材追溯', { timeout: 20_000 });
    await expect(page.locator('.input-source-list .input-source-card').first()).toContainText('成功素材沉淀 / third-party-finished-video.mp4', { timeout: 20_000 });

    await clickNavItem(page, '混剪包导出');
    await expect(page.locator('.mix-export-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(importedVideoCard).toContainText('已通过', { timeout: 20_000 });
    const overlayCard = page.locator('.mix-asset-card').filter({ hasText: /标题卡|早餐后顺手一次/ }).first();
    await expect(overlayCard).toBeVisible();
    await expect(overlayCard).toContainText('SOP 已关联');
    await expect(overlayCard.getByRole('button', { name: '提示词', exact: true })).toBeVisible();
    await overlayCard.getByRole('button', { name: '通过', exact: true }).click();
    await expect(overlayCard).toContainText('已通过');
    await expect(page.locator('.mix-export-config-panel button').filter({ hasText: '导出混剪包' })).toBeEnabled();
    await page.locator('.mix-export-config-panel button').filter({ hasText: '导出混剪包' }).click();
    await expect(page.locator('.mix-package-card').first()).toContainText('短视频混剪素材包', { timeout: 20_000 });
    await expect(page.locator('.mix-package-card').first()).toContainText('SOP 已关联');
    await expect(page.locator('.mix-package-card').first().getByRole('button', { name: '打开 SOP' })).toBeVisible();
    const exportedPackageCard = page.locator('.mix-package-card').first();
    await expect(exportedPackageCard).toContainText('待登记导入证据');
    await exportedPackageCard.getByRole('button', { name: '登记导入证据' }).click();
    const importEvidenceForm = exportedPackageCard.locator('.mix-import-evidence-form');
    await expect(importEvidenceForm).toBeVisible();
    await expect(importEvidenceForm.locator('label').filter({ hasText: '第三方工具' }).locator('input')).toHaveValue('剪映专业版');
    await expect(importEvidenceForm.locator('label').filter({ hasText: '导入文件数' }).locator('input')).toHaveValue('2');
    await expect(importEvidenceForm.locator('label').filter({ hasText: '清单文件已导入或已核对' }).locator('input')).toBeChecked();
    await expect(importEvidenceForm.locator('label').filter({ hasText: '已在混剪工具创建时间线 / 工程' }).locator('input')).toBeChecked();
    await importEvidenceForm.locator('label').filter({ hasText: '导入备注' }).locator('textarea').fill('E2E 验收：已按导入说明核对清单文件、成品视频和绿幕文案图。');
    await importEvidenceForm.getByRole('button', { name: '保存导入证据' }).click();
    await expect(exportedPackageCard).toContainText('导入证据已登记', { timeout: 20_000 });
    await expect(exportedPackageCard.getByRole('button', { name: '打开导入证据' })).toBeVisible();

    await clickNavItem(page, 'SOP 工作流');
    await expect(page.locator('.workflow-latest-run')).toContainText('完成', { timeout: 20_000 });
    await expect(latestNextAction).toContainText('查看混剪包');
    await page.locator('.workflow-latest-run button').filter({ hasText: '查看运行详情' }).click();
    await expect(runDetail.locator('.workflow-run-action-panel')).toContainText('查看混剪包');
    const artifactPanel = runDetail.locator('.workflow-run-artifact-panel');
    await expect(artifactPanel).toContainText('打开提示词草稿');
    await expect(artifactPanel).toContainText('打开绿幕文案图');
    await expect(artifactPanel).toContainText('打开混剪包');
    await expect(runDetail.locator('.workflow-run-steps')).toContainText('混剪包');
    await expect(runDetail.locator('.workflow-run-steps')).toContainText('绿幕文案图');

    await artifactPanel.locator('button').filter({ hasText: '打开绿幕文案图' }).click();
    await expect(page.locator('.green-screen-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.overlay-card-tile').first()).toBeVisible({ timeout: 20_000 });

    await clickNavItem(page, 'SOP 工作流');
    await page.locator('.workflow-latest-run button').filter({ hasText: '查看运行详情' }).click();
    await artifactPanel.locator('button').filter({ hasText: '打开混剪包' }).click();
    await expect(page.locator('.mix-export-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.mix-package-card').first()).toContainText('短视频混剪素材包', { timeout: 20_000 });

    const exportedTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const [pack] = await api.listMixPackages(workspacePath);
      const relatedRun = (await api.listWorkflowRuns(workspacePath))
        .find((run) => run.id === pack?.workflowRunId);
      return {
        workflowRunId: pack?.workflowRunId,
        runStatus: relatedRun?.status,
        runRefs: relatedRun?.artifactRefs ?? [],
        packageDir: pack?.packageDir,
        externalImportEvidencePath: pack?.externalImportEvidencePath,
        externalImportEvidence: pack?.externalImportEvidence,
      };
    }, workspaceDir);
    expect(exportedTrace.workflowRunId, JSON.stringify(exportedTrace)).toBeTruthy();
    expect(exportedTrace.runStatus, JSON.stringify(exportedTrace)).toBe('succeeded');
    expect(exportedTrace.runRefs.some((ref) => ref.startsWith('mix-package:')), JSON.stringify(exportedTrace)).toBe(true);
    expect(exportedTrace.externalImportEvidencePath, JSON.stringify(exportedTrace)).toContain('import-evidence.json');
    expect(existsSync(exportedTrace.externalImportEvidencePath), JSON.stringify(exportedTrace)).toBe(true);
    expect(existsSync(join(exportedTrace.packageDir, 'import-check.md')), JSON.stringify(exportedTrace)).toBe(true);
    expect(exportedTrace.externalImportEvidence.toolName, JSON.stringify(exportedTrace)).toBe('剪映专业版');
    expect(exportedTrace.externalImportEvidence.importedFileCount, JSON.stringify(exportedTrace)).toBe(2);
    expect(exportedTrace.externalImportEvidence.importedAssetKinds.sort(), JSON.stringify(exportedTrace)).toEqual(['overlay', 'video']);
    expect(exportedTrace.externalImportEvidence.manifestImported, JSON.stringify(exportedTrace)).toBe(true);
    expect(exportedTrace.externalImportEvidence.timelineCreated, JSON.stringify(exportedTrace)).toBe(true);
    expect(exportedTrace.externalImportEvidence.evidenceFiles, JSON.stringify(exportedTrace)).toContain('import-check.md');
    expect(exportedTrace.runRefs.includes(exportedTrace.externalImportEvidencePath), JSON.stringify(exportedTrace)).toBe(true);

    await clickNavItem(page, 'SOP 工作流');
    await page.locator('.workflow-view-tabs button').filter({ hasText: '执行表单' }).click();
    await expect(page.locator('.workflow-view-tabs button[aria-selected="true"]')).toContainText('执行表单');
    const repeatedVideoSopCard = page.locator('.workflow-definition-list .record-card').filter({ hasText: '视频素材包 SOP' }).first();
    await expect(repeatedVideoSopCard).toBeVisible();
    await repeatedVideoSopCard.click();
    await expect(page.locator('.workflow-runner-panel')).toContainText('视频素材包 SOP');
    await page.locator('.workflow-runner-panel textarea').nth(0).fill('品牌场景库、脚本和产品素材。');
    await page.locator('.workflow-runner-panel textarea').nth(1).fill('生成 15 秒视频素材 Prompt，第三方生成后手动导入，再生成绿幕图和混剪清单。');
    await page.locator('.workflow-runner-panel input[type="number"]').fill('15');
    await page.locator('.workflow-runner-panel button').filter({ hasText: '运行 SOP' }).click();

    const repeatedRunTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const runs = await api.listWorkflowRuns(workspacePath);
      const latestRun = runs
        .filter((item) => item.workflowKey === 'video-material-package')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return {
        runId: latestRun?.id,
        inputSourceIds: latestRun?.inputSourceIds ?? [],
      };
    }, workspaceDir);
    expect(repeatedRunTrace.runId, JSON.stringify(repeatedRunTrace)).toBeTruthy();
    expect(repeatedRunTrace.inputSourceIds, JSON.stringify(repeatedRunTrace)).not.toContain(distilledVideoTrace.sourceId);
    expect(repeatedRunTrace.inputSourceIds, JSON.stringify(repeatedRunTrace)).not.toContain(distilledVideoTrace.importedAssetSourceId);
  });
});

test('独立视频 Prompt 复制不会误推进无关联 SOP', async ({}, testInfo) => {
  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    const setup = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      await api.saveSettings({ workspacePath });
      const definitions = await api.listWorkflowDefinitions(workspacePath);
      const definition = definitions.find((item) => item.key === 'video-material-package');
      if (!definition) throw new Error('缺少视频素材包 SOP');
      const run = await api.startWorkflowRun({
        workspacePath,
        workflowDefinitionId: definition.id,
        inputs: {
          source: '一个未完成的视频素材包 SOP',
          intent: '用于验证无关联 Prompt 不能误推进 SOP。',
          reviewOwner: '视频负责人',
          duration: '15',
        },
      });
      const source = await api.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '独立视频产品资料',
        text: '这是一个独立视频 Prompt 的输入源，不属于上面的 SOP run。',
        summary: '独立视频产品资料',
        tags: ['独立 Prompt'],
      });
      const draft = await api.generatePromptDraft({
        workspacePath,
        title: '独立视频 Prompt',
        purpose: 'video',
        userIntent: '生成一个独立复制到 RunningHub 的视频 Prompt。',
        inputSourceIds: [source.id],
      });
      return {
        runId: run.id,
        draftId: draft.id,
        promptGenerateStatus: run.steps.find((step) => step.stepId === 'prompt_generate')?.status ?? '',
      };
    }, workspaceDir);

    expect(setup.promptGenerateStatus).toBe('blocked');
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待独立视频 Prompt 测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, '视频 Prompt');
    const promptPanel = page.locator('.video-prompt-builder-panel');
    await page.locator('.video-prompt-draft').filter({ hasText: '独立视频 Prompt' }).click();
    await expect(promptPanel.locator('.agent-session-head h3')).toContainText('独立视频 Prompt', { timeout: 20_000 });
    await promptPanel.locator('button').filter({ hasText: '复制到第三方平台' }).click();
    await expect(promptPanel.getByRole('button', { name: '已复制', exact: true })).toBeVisible();

    const result = await page.evaluate(async ({ workspacePath, runId, draftId }) => {
      const [run] = (await window.contentStudio.listWorkflowRuns(workspacePath)).filter((item) => item.id === runId);
      const draft = (await window.contentStudio.listPromptDrafts(workspacePath)).find((item) => item.id === draftId);
      return {
        promptGenerateStatus: run?.steps.find((step) => step.stepId === 'prompt_generate')?.status ?? '',
        promptCopyStatus: run?.steps.find((step) => step.stepId === 'prompt_copy')?.status ?? '',
        runArtifactRefs: run?.artifactRefs ?? [],
        copyCount: draft?.copyCount ?? 0,
        lastCopiedTarget: draft?.lastCopiedTarget ?? '',
      };
    }, { workspacePath: workspaceDir, runId: setup.runId, draftId: setup.draftId });

    expect(result.copyCount).toBe(1);
    expect(result.lastCopiedTarget).toBe('runninghub');
    expect(result.promptGenerateStatus).toBe('blocked');
    expect(result.promptCopyStatus).toBe('queued');
    expect(result.runArtifactRefs).not.toEqual(expect.arrayContaining([`prompt-draft:${setup.draftId}`]));
  });
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
    expect(trace.sourcePurpose, JSON.stringify(trace)).toBe('sop-input');
    expect(trace.sourceTags, JSON.stringify(trace)).toEqual(expect.arrayContaining(['video-prompt', '临时资料']));
    expect(trace.sourceText, JSON.stringify(trace)).toContain('便携营养条包');
    expect(trace.draftPurpose, JSON.stringify(trace)).toBe('video');
    expect(trace.draftInputSourceIds, JSON.stringify(trace)).toContain(trace.sourceId);
  });
});

test('SOP 定义草案可以编辑、发布并从表单运行', async ({}, testInfo) => {
  test.setTimeout(120_000);

  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    await page.evaluate(async (workspacePath) => {
      await window.contentStudio.saveSettings({ workspacePath });
      await window.contentStudio.registerInputSource({
        workspacePath,
        kind: 'manual-note',
        purpose: 'sop-input',
        title: 'UI SOP 测试资料',
        text: '用于验证自定义 SOP 发布后，普通用户需要显式选择资料再运行。',
        summary: 'UI SOP 测试资料',
        tags: ['ui-sop'],
      });
    }, workspaceDir);
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待 UI SOP 测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    await clickNavItem(page, 'SOP 工作流');
    await page.locator('.workflow-view-tabs button').filter({ hasText: '高级维护' }).click();
    await page.locator('.workflow-view-tabs button[role="tab"]').filter({ hasText: '定义管理' }).click();
    await expect(page.locator('.workflow-detail-panel')).toBeVisible();
    await page.locator('.workflow-detail-panel button').filter({ hasText: '生成 SOP 草案' }).click();

    const editor = page.locator('.workflow-definition-editor');
    await expect(editor).toBeVisible({ timeout: 20_000 });
    await editor.locator('label').filter({ hasText: 'SOP 名称' }).locator('input').fill('功能测试 UI 可运行 SOP');
    await editor.locator('label').filter({ hasText: '版本' }).locator('input').fill('v0.3');
    await editor.locator('label').filter({ hasText: '描述' }).locator('textarea').fill('通过 UI 编辑、发布并运行的 SOP 定义。');
    await editor.locator('label').filter({ hasText: '标签' }).locator('textarea').fill('UI 验证\n自定义 SOP');
    await editor.locator('label').filter({ hasText: '审核规则' }).locator('textarea').fill('资料来源必须清楚\n执行目标必须明确');
    await editor.locator('label').filter({ hasText: '输出规格' }).locator('textarea').fill('RunArchive');
    await editor.locator('label').filter({ hasText: '输入字段（高级配置）' }).locator('textarea').fill(JSON.stringify([
      { key: 'source', label: '资料来源', type: 'textarea', required: true },
      { key: 'intent', label: '执行目标', type: 'textarea', required: true },
    ], null, 2));
    await editor.locator('label').filter({ hasText: '执行步骤（高级配置）' }).locator('textarea').fill(JSON.stringify([
      { id: 'input_register', title: '登记输入源', kind: 'input', description: '登记资料和目标。', dependsOn: [], outputKeys: ['InputSource'] },
      { id: 'human_review', title: '人工审核', kind: 'review', description: '确认输入和执行目标。', dependsOn: ['input_register'], outputKeys: ['ReviewResult'] },
      { id: 'asset_store', title: '入历史', kind: 'asset-store', description: '归档本次 SOP 运行。', dependsOn: ['human_review'], outputKeys: ['RunArchive'] },
    ], null, 2));
    await editor.getByRole('button', { name: '保存 SOP 定义' }).click();
    await expect(page.locator('.workflow-definition-list')).toContainText('功能测试 UI 可运行 SOP', { timeout: 20_000 });

    await page.locator('.workflow-view-tabs button[role="tab"]').filter({ hasText: 'Canvas' }).click();
    const canvas = page.locator('.workflow-canvas-panel');
    await expect(canvas).toContainText('节点轻编辑');
    await canvas.locator('.workflow-canvas-node').filter({ hasText: '登记输入源' }).click();
    const canvasEditor = canvas.locator('.workflow-canvas-editor');
    await canvasEditor.locator('label').filter({ hasText: '节点标题' }).locator('input').fill('登记事实源');
    await canvasEditor.locator('label').filter({ hasText: '节点说明' }).locator('textarea').fill('从 Canvas 轻编辑输入源节点。');
    await canvasEditor.getByRole('button', { name: '保存节点到定义' }).click();
    await expect(canvas.locator('.workflow-canvas-node').filter({ hasText: '登记事实源' })).toBeVisible({ timeout: 20_000 });

    await page.locator('.workflow-view-tabs button[role="tab"]').filter({ hasText: '定义管理' }).click();
    await expect(editor.locator('label').filter({ hasText: '执行步骤（高级配置）' }).locator('textarea')).toHaveValue(/登记事实源/);
    await expect(editor.locator('label').filter({ hasText: '执行步骤（高级配置）' }).locator('textarea')).toHaveValue(/从 Canvas 轻编辑输入源节点/);

    await page.locator('.workflow-detail-panel button').filter({ hasText: '发布为可运行' }).click();
    await expect(page.locator('.workflow-detail-panel .workflow-meta-grid')).toContainText('已发布', { timeout: 20_000 });

    await page.locator('.workflow-view-tabs button').filter({ hasText: '执行表单' }).click();
    const runner = page.locator('.workflow-runner-panel');
    await expect(runner).toContainText('功能测试 UI 可运行 SOP');
    await runner.locator('label').filter({ hasText: '补充资料说明' }).locator('textarea').fill('UI 测试输入资料');
    await runner.locator('label').filter({ hasText: '执行目标' }).locator('textarea').fill('验证编辑发布后的 SOP 可以运行。');
    await runner.getByRole('button', { name: '运行 SOP' }).click();
    await expect(page.locator('.workflow-history-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.workflow-run-detail-panel')).toContainText('功能测试 UI 可运行 SOP');
    await expect(page.locator('.workflow-run-detail-panel')).toContainText('排队');
    await expect(page.locator('.workflow-run-detail-panel')).toContainText('登记事实源');
    const artifactTracePanel = page.locator('.workflow-run-detail-panel article').filter({ hasText: '产物线索' }).last();
    await expect(artifactTracePanel).toContainText('步骤快照');
    await expect(artifactTracePanel).toContainText('输入源转换稿');
    await expect(artifactTracePanel).not.toContainText('workflow-run:');
    await expect(artifactTracePanel).not.toContainText('input_register');
    await expect(artifactTracePanel).not.toContainText(/[0-9a-f-]{36}\.md/i);
    const artifactLabels = await artifactTracePanel.locator('span').evaluateAll((items) =>
      items.map((item) => ({
        text: item.textContent ?? '',
        title: item.getAttribute('title') ?? '',
      })),
    );
    expect(JSON.stringify(artifactLabels)).not.toContain('workflow-run:');
    expect(JSON.stringify(artifactLabels)).not.toContain('input_register');
    expect(JSON.stringify(artifactLabels)).not.toMatch(/[0-9a-f-]{36}\.md/i);
  });
});

test('视频 SOP 草案发布运行后执行页仍显示下一步动作', async ({}, testInfo) => {
  test.setTimeout(120_000);

  await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
    await page.evaluate(async (workspacePath) => {
      await window.contentStudio.saveSettings({ workspacePath });
    }, workspaceDir);
    await page.reload();
    await expect.poll(
      async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
      { message: '等待视频 SOP 草案测试工作区重新加载', timeout: 20_000 },
    ).toBe(true);

    const setup = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const definitions = await api.listWorkflowDefinitions(workspacePath);
      const base = definitions.find((item) => item.key === 'video-material-package');
      if (!base) throw new Error('缺少视频素材包 SOP');
      const draft = await api.createWorkflowDraft({
        workspacePath,
        templateKey: base.key,
        title: '客户自定义视频素材 SOP',
      });
      const published = await api.updateWorkflowDefinition({
        ...draft,
        status: 'published',
      });
      const run = await api.startWorkflowRun({
        workspacePath,
        workflowDefinitionId: published.id,
        inputs: {
          source: '客户自定义脚本和素材。',
          intent: '生成 15 秒视频 Prompt 并交给第三方生成。',
          duration: '15',
        },
      });
      return { workflowKey: run.workflowKey, runId: run.id };
    }, workspaceDir);
    expect(setup.workflowKey).toMatch(/^video-material-package-draft-/);

    await page.reload();
    await clickNavItem(page, 'SOP 工作流');
    const latestRun = page.locator('.workflow-latest-run');
    await expect(latestRun).toContainText('客户自定义视频素材 SOP', { timeout: 20_000 });
    await expect(latestRun.locator('.workflow-latest-run-next')).toContainText(/打开视频 Prompt|进入视频 Prompt/);
    await latestRun.locator('button').filter({ hasText: '继续下一步' }).click();
    await expect(page.locator('.video-prompt-workbench')).toBeVisible({ timeout: 20_000 });
  });
});

test('品牌 SOP 运行详情可以打开知识库、场景库和 Prompt 产物', async ({}, testInfo) => {
  test.setTimeout(180_000);

  const { server, baseUrl } = await startFakeOpenAITextServer(fakeBusinessChainTextOutput);

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
        const definitions = await api.listWorkflowDefinitions(workspacePath);
        const definition = definitions.find((item) => item.key === 'brand-scene-prompts');
        if (!definition) throw new Error('缺少品牌知识库场景提示词 SOP');
        const run = await api.startWorkflowRun({
          workspacePath,
          workflowDefinitionId: definition.id,
          inputs: {
            source: '便携条包品牌知识库',
            intent: '生成品牌知识库、提示词包、场景库和可继续审核的 Prompt 草稿。',
            reviewOwner: '品牌负责人',
          },
          citations,
        });
        return { runId: run.id, status: run.status, summary: run.summary };
      }, { workspacePath: workspaceDir, endpoint: baseUrl });

      expect(setup.status, JSON.stringify(setup)).toBe('queued');
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待品牌 SOP 产物入口测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      const runDetail = page.locator('.workflow-run-detail-panel');
      const actionPanel = runDetail.locator('.workflow-run-action-panel');
      const artifactPanel = runDetail.locator('.workflow-run-artifact-panel');
      await expect(runDetail).toContainText('品牌知识库场景提示词 SOP');
      await expect(actionPanel).toContainText('确认审核通过');
      await expect(artifactPanel).toContainText('打开品牌知识库');
      await expect(artifactPanel).toContainText('打开场景库');
      await expect(artifactPanel).toContainText('打开提示词草稿');

      await artifactPanel.locator('button').filter({ hasText: '打开品牌知识库' }).click();
      await expect(page.locator('.knowledge-brand-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.brand-kb-detail')).toContainText('便携条包', { timeout: 20_000 });

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await artifactPanel.locator('button').filter({ hasText: '打开场景库' }).click();
      await expect(page.locator('.scene-prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agent-session-panel')).toBeVisible();
      await expect(page.locator('.scene-agent-attachment-list')).toContainText('早餐后便携场景');
      await expect(page.locator('.scene-prompt-workbench .workflow-summary-stack')).toContainText('已确认');

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await artifactPanel.locator('button').filter({ hasText: '打开提示词草稿' }).click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-editor-panel')).toContainText('品牌知识库场景提示词 SOP Prompt 组');
      await expect(page.locator('.prompt-draft-editor')).toHaveValue(/早餐后便携场景|图片 Prompt|场景/);

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await actionPanel.locator('button').filter({ hasText: '确认审核通过' }).click();
      await expect(actionPanel).toContainText('入历史留痕', { timeout: 20_000 });
      await actionPanel.locator('button').filter({ hasText: '入历史留痕' }).click();
      await expect(runDetail).toContainText('品牌知识库场景提示词 SOP 已完成', { timeout: 20_000 });
      await expect(runDetail.locator('.workflow-summary-stack')).toContainText('完成');
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('小红书图片 SOP 运行详情可以进入图片工作台和素材审核', async ({}, testInfo) => {
  test.setTimeout(180_000);

  let capturedVisionRequest;
  let capturedImageRequest;
  const server = createServer((request, response) => {
    if (request.url === '/vision') {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => {
        capturedVisionRequest = JSON.parse(body);
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({
          composition: '4:5 竖版，产品在右下三分之一，左上保留标题区。',
          lighting: '早餐桌自然光，手机实拍质感。',
          textArea: '左上角留白适合标题，底部不放大段文字。',
          style: '小红书 UGC，真实手部动作，避免棚拍广告感。',
          reusableElements: ['三分法构图', '自然光', '真实手部动作'],
          replacementRules: ['竞品包装替换为本方便携条包', '只使用产品资料里的便携场景和合规事实'],
          generationControls: ['保持 4:5 竖版', '产品主体清晰但不夸张放大', '标题区留白稳定'],
          risks: ['不能复制竞品包装和可识别文案'],
          prompt: '图片 Prompt：早餐桌自然光，手拿便携条包，产品主体清晰，4:5，小红书 UGC 手机实拍，不出现疗效承诺。',
          negativePrompt: '不要竞品 Logo，不要医疗化承诺，不要夸张疗效。',
          qualityChecklist: ['产品清晰', '标题区留白', '无竞品元素'],
        }));
      });
      return;
    }
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
      if (!address || typeof address === 'string') throw new Error('无法启动本地图片 SOP 服务。');
      resolveListen(`http://127.0.0.1:${address.port}`);
    });
  });

  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir, e2eProductAssetPath }) => {
      const setup = await page.evaluate(async ({ workspacePath, endpoint, referenceImagePath }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.saveModelConfig({
          imageProvider: 'openai-responses',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: endpoint,
          imageApiKey: 'test-image-key',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
        });
        const reference = await api.registerInputSource({
          workspacePath,
          kind: 'image',
          purpose: 'reference',
          title: '小红书对标图',
          sourcePath: referenceImagePath,
          text: '参考图：早餐桌自然光，手拿条包，左上留白，手机实拍。',
          summary: '小红书对标图描述',
          tags: ['参考图', '测试图片'],
        });
        const product = await api.registerInputSource({
          workspacePath,
          kind: 'manual-note',
          purpose: 'product-brief',
          title: '便携条包产品资料',
          text: '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
          summary: '便携条包产品资料',
          tags: ['产品资料'],
        });
        const definitions = await api.listWorkflowDefinitions(workspacePath);
        const definition = definitions.find((item) => item.key === 'xiaohongshu-seeding-image');
        if (!definition) throw new Error('缺少小红书种草图 SOP');
        const run = await api.startWorkflowRun({
          workspacePath,
          workflowDefinitionId: definition.id,
          inputs: {
            source: '小红书对标图和便携条包产品资料',
            intent: '生成早餐后场景的小红书真实种草图。',
            reviewOwner: '图片负责人',
            platform: '小红书',
          },
          inputSourceIds: [reference.id, product.id],
        });
        return { runId: run.id, status: run.status, summary: run.summary };
      }, { workspacePath: workspaceDir, endpoint: baseUrl, referenceImagePath: e2eProductAssetPath });

      expect(setup.status, JSON.stringify(setup)).toBe('queued');
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待图片 SOP 测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      const runDetail = page.locator('.workflow-run-detail-panel');
      const actionPanel = runDetail.locator('.workflow-run-action-panel');
      const artifactPanel = runDetail.locator('.workflow-run-artifact-panel');
      await expect(runDetail).toContainText('小红书种草图 SOP');
      await expect(actionPanel).toContainText('打开素材审核');
      await expect(artifactPanel).toContainText('打开提示词草稿');
      await expect(artifactPanel).toContainText('打开素材审核');

      await artifactPanel.locator('button').filter({ hasText: '打开提示词草稿' }).click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-draft-editor')).toHaveValue(/早餐桌自然光|小红书 UGC|图片 Prompt/);

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await artifactPanel.locator('button').filter({ hasText: '打开素材审核' }).click();
      await expect(page.locator('.asset-library-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.asset-library-workbench')).toContainText('合规检测 / 人工审核台');
      const generatedAsset = page.locator('.asset-tile').filter({ hasText: 'test-image-model' }).first();
      await expect(generatedAsset).toBeVisible();
      await expect(generatedAsset).toContainText('待审核');
      await generatedAsset.getByRole('button', { name: '详情', exact: true }).click();
      const reviewDialog = page.locator('.asset-detail-dialog');
      await expect(reviewDialog).toContainText('审核决策');
      await expect(reviewDialog).toContainText('质检结果');
      await expect(reviewDialog).toContainText('产品清晰');
      await expect(reviewDialog).toContainText('标题区留白');
      await expect(reviewDialog).toContainText('无竞品元素');
      await expect(reviewDialog).toContainText('不能复制竞品包装和可识别文案');
      await expect(reviewDialog).toContainText('来源可追溯');
      await expect(reviewDialog).toContainText('建议下一步');
      await expect(reviewDialog).toContainText('任务可追溯');
      await reviewDialog.getByRole('button', { name: '关闭', exact: true }).click();
      await generatedAsset.getByRole('button', { name: '驳回素材', exact: true }).click();
      const rejectDialog = page.locator('.asset-reject-dialog');
      await expect(rejectDialog).toContainText('填写驳回原因');
      await rejectDialog.locator('.asset-reject-reasons button').filter({ hasText: '画面构图不可用' }).click();
      await rejectDialog.locator('textarea').fill('主体位置偏移，标题区不稳定。');
      await rejectDialog.getByRole('button', { name: '确认驳回', exact: true }).click();
      await expect(generatedAsset).toContainText('已驳回', { timeout: 20_000 });

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await expect(runDetail).toContainText(/已驳回素材并等待回炉|驳回|回炉/, { timeout: 20_000 });
      await expect(runDetail.locator('.workflow-summary-stack')).toContainText('待配置');
      await expect(runDetail).toContainText('原驳回素材', { timeout: 20_000 });
      await expect(runDetail).toContainText('画面构图不可用', { timeout: 20_000 });

      await artifactPanel.locator('button').filter({ hasText: '打开素材审核' }).click();
      await expect(page.locator('.asset-library-workbench')).toBeVisible({ timeout: 20_000 });
      await generatedAsset.getByRole('button', { name: '回炉重做', exact: true }).click();
      await expect(page.locator('.image-workbench-layout')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.image-prompt-composer textarea')).toHaveValue(/回炉原因|驳回素材|真实手机实拍/, { timeout: 20_000 });
      await page.locator('.image-render-button').click();
      await expect(page.locator('.image-generated-grid')).toBeVisible({ timeout: 20_000 });
      await expect.poll(
        async () => page.locator('.image-generated-card').count(),
        { message: '等待回炉图片进入预览大盘', timeout: 20_000 },
      ).toBeGreaterThanOrEqual(2);
      await page.getByRole('tab', { name: '生成日志' }).click();
      await expect(page.locator('.image-preview-log-list')).toContainText('test-image-model', { timeout: 20_000 });

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await expect(runDetail.locator('.workflow-summary-stack')).toContainText('排队', { timeout: 20_000 });
      await expect(runDetail).toContainText('回炉生成', { timeout: 20_000 });

      await actionPanel.locator('button').filter({ hasText: '打开素材审核' }).click();
      await expect(page.locator('.asset-library-workbench')).toBeVisible({ timeout: 20_000 });
      const reworkedAsset = page.locator('.asset-tile').filter({ hasText: '回炉生成' }).first();
      await expect(reworkedAsset).toBeVisible({ timeout: 20_000 });
      await reworkedAsset.getByRole('button', { name: '通过并入库', exact: true }).click();
      await expect(reworkedAsset).toContainText('已通过', { timeout: 20_000 });

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await expect(runDetail).toContainText('小红书种草图 SOP 已完成', { timeout: 20_000 });
      await expect(runDetail.locator('.workflow-summary-stack')).toContainText('完成');
      await expect(runDetail).toContainText('新通过素材', { timeout: 20_000 });

      await artifactPanel.locator('button').filter({ hasText: '打开素材审核' }).click();
      await expect(page.locator('.asset-library-workbench')).toBeVisible({ timeout: 20_000 });
      const approvedReworkedAsset = page.locator('.asset-tile').filter({ hasText: '回炉生成' }).first();
      await approvedReworkedAsset.getByRole('button', { name: '沉淀提示词', exact: true }).click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-draft-editor')).toHaveValue(/成功素材反向沉淀 Prompt|复用 Prompt 草稿|真实手机实拍/, { timeout: 20_000 });
      await expect(page.locator('.prompt-draft-editor')).not.toHaveValue(/原素材 Key|SOP Run|generation-log|input-source/);

      const persistedTrace = await page.evaluate(async ({ workspacePath, runId }) => {
        const api = window.contentStudio;
        const logs = await api.listGenerationLogs(workspacePath);
        const reviews = await api.listAssetReviews(workspacePath);
        const sources = await api.listInputSources(workspacePath);
        const drafts = await api.listPromptDrafts(workspacePath);
        const runs = await api.listWorkflowRuns(workspacePath);
        const imageLogs = logs.filter((log) => log.workflowRunId === runId && log.kind === 'image');
        const reworkLog = imageLogs.find((log) => log.reworkSource);
        const review = reviews.find((item) => item.workflowRunId === runId && item.sourceId === reworkLog?.id);
        const rejected = reviews.find((item) => item.workflowRunId === runId && item.status === 'rejected');
        const distilledSource = sources.find((item) => item.workflowRunId === runId && item.purpose === 'successful-asset');
        const distilledDraft = drafts.find((item) => distilledSource?.id && item.inputSourceIds.includes(distilledSource.id));
        const run = runs.find((item) => item.id === runId);
        return {
          imageLogWorkflowRunId: reworkLog?.workflowRunId,
          reworkSourceAssetKey: reworkLog?.reworkSource?.assetKey,
          rejectedAssetKey: rejected?.assetKey,
          reviewWorkflowRunId: review?.workflowRunId,
          reviewStatus: review?.status,
          distilledSourcePurpose: distilledSource?.purpose,
          distilledSourcePromptDraftId: distilledSource?.relatedPromptDraftId,
          distilledDraftWorkflowRunId: distilledDraft?.workflowRunId,
          distilledDraftModel: distilledDraft?.model,
          distilledDraftStatus: distilledDraft?.status,
          runHasDistilledSourceRef: distilledSource ? run?.artifactRefs.includes(`input-source:${distilledSource.id}`) : false,
          runHasDistilledDraftRef: distilledDraft ? run?.artifactRefs.includes(`prompt-draft:${distilledDraft.id}`) : false,
        };
      }, { workspacePath: workspaceDir, runId: setup.runId });
      expect(persistedTrace.imageLogWorkflowRunId, JSON.stringify(persistedTrace)).toBe(setup.runId);
      expect(persistedTrace.reworkSourceAssetKey, JSON.stringify(persistedTrace)).toBe(persistedTrace.rejectedAssetKey);
      expect(persistedTrace.reviewWorkflowRunId, JSON.stringify(persistedTrace)).toBe(setup.runId);
      expect(persistedTrace.reviewStatus, JSON.stringify(persistedTrace)).toBe('approved');
      expect(persistedTrace.distilledSourcePurpose, JSON.stringify(persistedTrace)).toBe('successful-asset');
      expect(persistedTrace.distilledSourcePromptDraftId, JSON.stringify(persistedTrace)).toBeTruthy();
      expect(persistedTrace.distilledDraftWorkflowRunId, JSON.stringify(persistedTrace)).toBe(setup.runId);
      expect(persistedTrace.distilledDraftModel, JSON.stringify(persistedTrace)).toBe('local-successful-asset-distiller');
      expect(persistedTrace.distilledDraftStatus, JSON.stringify(persistedTrace)).toBe('confirmed');
      expect(persistedTrace.runHasDistilledSourceRef, JSON.stringify(persistedTrace)).toBe(true);
      expect(persistedTrace.runHasDistilledDraftRef, JSON.stringify(persistedTrace)).toBe(true);
    }, {
      env: {
        CONTENT_STUDIO_VISION_ENDPOINT: `${baseUrl}/vision`,
        CONTENT_STUDIO_VISION_MODEL: 'test-vision-model',
        CONTENT_STUDIO_VISION_API_KEY: 'test-vision-key',
      },
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  expect(capturedVisionRequest?.operation).toBe('reference-reverse');
  expect(capturedImageRequest?.tools?.[0]?.model).toBe('test-image-model');
});

test('IP 长文 SOP 运行详情可以打开文章 Prompt 并进入文章生成', async ({}, testInfo) => {
  test.setTimeout(180_000);

  const { server, baseUrl } = await startFakeOpenAITextServer((prompt) => {
    if (prompt.includes('"task": "generate_article"')) {
      return {
        titleCandidates: ['IP 内容工程方法论', '从知识库到内容生产', '把个人 IP 写作变成流程'],
        outline: ['IP 定位', '知识库事实', '方法论展开', '场景案例', '发布检查'],
        summary: '基于 IP 知识库和文章 Prompt 生成长文。',
        markdown: [
          '# IP 内容工程方法论',
          '',
          '个人 IP 内容不是临场发挥，而是从身份、价值观、语言和方法论中抽取稳定表达。',
          '',
          '这次 SOP 已经先构建 IP 知识库，再读取输入源和用户意图，最后进入文章生成。',
          '',
          '正文必须保留事实边界，不把缺少资料的案例写成真实经历。',
        ].join('\n'),
        publishCheck: [
          { level: 'info', message: '已使用 IP 知识库作为事实源。' },
          { level: 'warning', message: '发布前复核缺少案例的段落。' },
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
        await api.installBuiltinKnowledgeBase('personal-ip-demo', workspacePath);
        const searchResults = await api.searchKnowledge({
          workspacePath,
          query: '身份 方法论 语言 场景',
          baseType: 'personal-ip-kb',
          sectionType: 'all',
        });
        const citations = searchResults.slice(0, 5).map((item) => ({
          knowledgeBaseId: item.knowledgeBaseId,
          sectionId: item.section.id,
          title: `${item.baseTitle} / ${item.section.title}`,
          sectionType: item.section.sectionType,
          excerpt: (item.section.content || item.section.summary || item.section.title).slice(0, 800),
        }));
        const definitions = await api.listWorkflowDefinitions(workspacePath);
        const definition = definitions.find((item) => item.key === 'ip-longform');
        if (!definition) throw new Error('缺少公众号 IP 内容 SOP');
        const run = await api.startWorkflowRun({
          workspacePath,
          workflowDefinitionId: definition.id,
          inputs: {
            source: '嘉文老师 IP 知识库',
            intent: '写一篇讲清个人 IP 内容工程方法论的公众号长文。',
            reviewOwner: '主编',
          },
          citations,
        });
        return { status: run.status, summary: run.summary };
      }, { workspacePath: workspaceDir, endpoint: baseUrl });

      expect(setup.status, JSON.stringify(setup)).toBe('queued');
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 IP 长文 SOP 测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      const runDetail = page.locator('.workflow-run-detail-panel');
      const actionPanel = runDetail.locator('.workflow-run-action-panel');
      const artifactPanel = runDetail.locator('.workflow-run-artifact-panel');
      await expect(runDetail).toContainText('公众号 IP 内容 SOP');
      await expect(actionPanel).toContainText('进入文章生成');
      await expect(artifactPanel).toContainText('打开 IP 知识库');
      await expect(artifactPanel).toContainText('打开提示词草稿');

      await artifactPanel.locator('button').filter({ hasText: '打开 IP 知识库' }).click();
      await expect(page.locator('.knowledge-brand-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.brand-kb-detail')).toContainText('内容工程顾问');
      await page.locator('.ip-scenario-card').filter({ hasText: /口播/ }).locator('button').filter({ hasText: '生成延伸库' }).click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-draft-editor')).toHaveValue(/IP 场景延伸知识库|延伸场景：口播|内容工程顾问/, { timeout: 20_000 });
      const scenarioTrace = await page.evaluate(async (workspacePath) => {
        const [run] = (await window.contentStudio.listWorkflowRuns(workspacePath))
          .filter((item) => item.workflowKey === 'ip-longform');
        const sources = await window.contentStudio.listInputSources(workspacePath);
        const drafts = await window.contentStudio.listPromptDrafts(workspacePath);
        const scenarioSource = sources.find((source) => source.purpose === 'ip-scenario-kb' && /口播/.test(source.title));
        const scenarioDraft = drafts.find((draft) => scenarioSource?.id && draft.inputSourceIds.includes(scenarioSource.id));
        return {
          runId: run?.id ?? '',
          sourcePurpose: scenarioSource?.purpose,
          sourceWorkflowRunId: scenarioSource?.workflowRunId,
          draftWorkflowRunId: scenarioDraft?.workflowRunId,
          draftPurpose: scenarioDraft?.purpose,
          draftModel: scenarioDraft?.model,
          runHasSourceRef: scenarioSource ? run?.artifactRefs.includes(`input-source:${scenarioSource.id}`) : false,
          runHasDraftRef: scenarioDraft ? run?.artifactRefs.includes(`prompt-draft:${scenarioDraft.id}`) : false,
        };
      }, workspaceDir);
      expect(scenarioTrace.sourcePurpose, JSON.stringify(scenarioTrace)).toBe('ip-scenario-kb');
      expect(scenarioTrace.sourceWorkflowRunId, JSON.stringify(scenarioTrace)).toBe(scenarioTrace.runId);
      expect(scenarioTrace.draftWorkflowRunId, JSON.stringify(scenarioTrace)).toBe(scenarioTrace.runId);
      expect(scenarioTrace.draftPurpose, JSON.stringify(scenarioTrace)).toBe('video');
      expect(scenarioTrace.draftModel, JSON.stringify(scenarioTrace)).toBe('local-ip-scenario-extension');
      expect(scenarioTrace.runHasSourceRef, JSON.stringify(scenarioTrace)).toBe(true);
      expect(scenarioTrace.runHasDraftRef, JSON.stringify(scenarioTrace)).toBe(true);

      await clickNavItem(page, 'IP 知识库');
      const scenarioLibrary = page.locator('.ip-scenario-library-panel');
      await expect(scenarioLibrary).toContainText('IP 运营场景库');
      await expect(scenarioLibrary.locator('.ip-scenario-card').filter({ hasText: '口播' })).toContainText('已确认');
      await expect(scenarioLibrary.locator('.ip-scenario-card').filter({ hasText: '口播' })).toContainText('已关联同一 IP 知识库版本');
      const extensionPanel = page.locator('.ip-extension-draft-panel');
      await expect(extensionPanel).toContainText('已生成的 IP 场景提示词');
      await expect(extensionPanel).toContainText('口播');
      await extensionPanel.locator('button').filter({ hasText: '口播' }).first().click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-draft-editor')).toHaveValue(/延伸场景：口播/);

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await artifactPanel.locator('button').filter({ hasText: '打开提示词草稿' }).click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-workbench')).toContainText('输入源 + 用户意图');
      await expect(page.locator('.prompt-workbench')).toContainText('公众号 IP 内容 SOP');

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await actionPanel.locator('button').filter({ hasText: '进入文章生成' }).click();
      await expect(page.locator('.article-module-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.article-editor-panel label').filter({ hasText: '主题' }).locator('input')).toHaveValue(/个人 IP 内容工程方法论/);
      await expect(page.locator('.article-editor-panel textarea')).toHaveValue(/来自 IP 长文 SOP|Prompt 草稿|个人 IP/);
      await page.locator('.article-editor-panel button').filter({ hasText: '生成大纲 / 正文 / 发布检查' }).click();
      await expect(page.locator('.article-rendered')).toContainText('IP 内容工程方法论', { timeout: 20_000 });
      await expect(page.locator('.article-preview')).toContainText('已使用 IP 知识库作为事实源');

      const draftRun = await page.evaluate(async (workspacePath) => {
        const [run] = (await window.contentStudio.listWorkflowRuns(workspacePath))
          .filter((item) => item.workflowKey === 'ip-longform');
        const humanReview = run?.steps.find((step) => step.stepId === 'human_review');
        return {
          runId: run?.id ?? '',
          status: run?.status ?? '',
          summary: run?.summary ?? '',
          humanReviewStatus: humanReview?.status ?? '',
          humanReviewOutput: humanReview?.output ?? {},
        };
      }, workspaceDir);
      expect(draftRun).toMatchObject({
        status: 'queued',
        humanReviewStatus: 'queued',
      });
      expect(JSON.stringify(draftRun.humanReviewOutput)).toContain('article-draft-generated');

      await clickButton(page, '导出草稿包');
      await expect(page.locator('.article-preview')).toContainText('平台草稿包已导出', { timeout: 20_000 });
      const completedRun = await page.evaluate(async ({ workspacePath, runId }) => {
        const [run] = (await window.contentStudio.listWorkflowRuns(workspacePath))
          .filter((item) => item.id === runId);
        const assetStore = run.steps.find((step) => step.stepId === 'asset_store');
        return {
          status: run.status,
          summary: run.summary,
          assetStoreStatus: assetStore?.status ?? '',
          artifactRefs: run.artifactRefs,
          platformDraftRefs: run.artifactRefs.filter((ref) => ref.includes('/platform-drafts/')),
        };
      }, { workspacePath: workspaceDir, runId: draftRun.runId });
      expect(completedRun.status).toBe('succeeded');
      expect(completedRun.assetStoreStatus).toBe('succeeded');
      expect(completedRun.summary).toContain('公众号 IP 内容 SOP 已完成');
      expect(completedRun.platformDraftRefs.some((ref) => ref.endsWith('/draft.md')), JSON.stringify(completedRun)).toBe(true);
      expect(completedRun.platformDraftRefs.some((ref) => ref.endsWith('/manifest.json')), JSON.stringify(completedRun)).toBe(true);

      await expect(page.locator('.article-draft-history')).toContainText('提示词');
      await page.locator('.article-draft-history button').filter({ hasText: '提示词' }).click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-workbench')).toContainText('公众号 IP 内容 SOP');
      const promptDelivery = page.locator('.prompt-derived-delivery');
      await expect(promptDelivery).toContainText('平台草稿包');
      await expect(promptDelivery).toContainText('IP 内容工程方法论');
      await expect(promptDelivery).toContainText('回到 SOP');
      await clickButton(page, '文章生成');
      await expect(page.locator('.article-draft-history')).toContainText('回到 SOP');
      await page.locator('.article-draft-history button').filter({ hasText: '回到 SOP' }).click();
      await expect(page.locator('.workflow-run-detail-panel')).toContainText('公众号 IP 内容 SOP', { timeout: 20_000 });
      await expect(artifactPanel).toContainText('打开平台草稿包');
      await expect(artifactPanel).not.toContainText('打开素材审核');
      const platformDraftTrace = page.locator('.workflow-platform-draft-panel');
      await expect(platformDraftTrace).toContainText('本次 SOP 已导出的本地交付包');
      await expect(platformDraftTrace).toContainText('复制发布文案');
      await expect(platformDraftTrace).toContainText('提示词');
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('品牌知识库能真实接到场景库、Prompt 组和图片工作台', async ({}, testInfo) => {
  test.setTimeout(120_000);

  const capturedPrompts = [];
  const { server, baseUrl } = await startFakeOpenAITextServer((prompt) => {
    capturedPrompts.push(prompt);
    return fakeBusinessChainTextOutput(prompt);
  });

  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath, endpoint }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.saveModelConfig({
          textProtocol: 'openai-chat',
          textApiEndpoint: endpoint,
          textApiKey: 'test-text-key',
          textModel: 'test-text-model',
        });
        await api.installBuiltinKnowledgeBase('product-demo', workspacePath);
      }, { workspacePath: workspaceDir, endpoint: baseUrl });
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
      await expect(page.locator('.knowledge-brand-workbench .prompt-draft-list')).toContainText('便携条包品牌知识库', { timeout: 20_000 });

      await page.locator('.knowledge-brand-workbench .agent-session-footer textarea').fill('请检查品牌事实、合规边界和场景库下一步。');
      await page.locator('.knowledge-brand-workbench .agent-session-footer button').filter({ hasText: '开始判断' }).click();
      await expect(page.locator('.knowledge-brand-workbench .agent-turn.user')).toContainText('品牌事实', { timeout: 20_000 });
      await expect(page.locator('.knowledge-brand-workbench .agent-turn.assistant')).toContainText('图片 Prompt', { timeout: 20_000 });

      const sceneButton = page.locator('.knowledge-brand-workbench button').filter({ hasText: '生成场景库' }).first();
      await expect(sceneButton).toBeEnabled();
      await sceneButton.click();
      await expect(page.locator('.scene-prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.agent-session-panel')).toBeVisible();
      await expect(page.locator('.scene-agent-attachment-list')).toContainText('早餐后便携场景');
      await page.locator('.scene-agent-form-drawer summary').click();
      const sceneEditor = page.locator('.scene-card-editor');
      await expect(sceneEditor).toBeVisible();
      await expect(sceneEditor).toContainText('使用场景');
      await expect(page.locator('.scene-agent-attachment-list')).toContainText('待确认');
      await sceneEditor.locator('label').filter({ hasText: '使用场景' }).locator('textarea').fill('早餐后准备出门前，家长把便携条包放进孩子书包侧袋。');
      await sceneEditor.locator('label').filter({ hasText: '画面构图' }).locator('textarea').fill('4:5 竖版，书包侧袋在右下三分之一，早餐桌自然光，手部动作真实。');
      await sceneEditor.getByRole('button', { name: '确认场景卡', exact: true }).click();
      await expect(page.locator('.scene-agent-attachment-list')).toContainText('已确认', { timeout: 20_000 });

      await clickNavItem(page, '视频 Prompt');
      await expect(page.locator('.video-prompt-workbench')).toBeVisible();
      await page.locator('.video-prompt-builder-panel button').filter({ hasText: '生成视频 Prompt 组' }).click();
      await expect(page.locator('.video-prompt-preview pre')).toContainText(/视频 Prompt|15 秒/, { timeout: 20_000 });
      await page.locator('.video-prompt-builder-panel button').filter({ hasText: '复制到第三方平台' }).click();
      await expect(page.locator('.video-prompt-history-panel')).toContainText('RunningHub', { timeout: 20_000 });
      await expect(page.locator('.video-prompt-history-panel')).toContainText('1');
      await page.locator('.video-prompt-builder-panel button').filter({ hasText: '导入成品视频' }).click();
      await expect(page.locator('.video-import-workbench')).toBeVisible({ timeout: 20_000 });
      await page.locator('.video-import-workbench .module-command-center button').filter({ hasText: '导入并关联提示词' }).click();
      await expect(page.locator('.video-import-list')).toContainText('third-party-finished-video.mp4');
      await expect(page.locator('.video-import-list')).toContainText('提示词已关联');

      await clickNavItem(page, '混剪包导出');
      await expect(page.locator('.mix-export-workbench')).toBeVisible({ timeout: 20_000 });
      const importedVideoCard = page.locator('.mix-asset-card').filter({ hasText: 'third-party-finished-video.mp4' }).first();
      await expect(importedVideoCard).toBeVisible();
      await importedVideoCard.getByRole('button', { name: '通过', exact: true }).click();
      await expect(importedVideoCard).toContainText('已通过');
      await expect(page.locator('.mix-export-config-panel button').filter({ hasText: '导出混剪包' })).toBeEnabled();
      await page.locator('.mix-export-config-panel button').filter({ hasText: '导出混剪包' }).click();
      await expect(page.locator('.mix-package-card').first()).toContainText('短视频混剪素材包', { timeout: 20_000 });

      await clickNavItem(page, '场景提示词');
      await expect(page.locator('.scene-prompt-workbench')).toBeVisible();

      await page.locator('.agent-composer-meta label').filter({ hasText: '输出' }).locator('select').selectOption('video');
      const generateVideoPromptButton = page.locator('.scene-agent-composer button').filter({ hasText: '生成 Prompt' });
      if (await generateVideoPromptButton.count()) {
        await generateVideoPromptButton.click();
      }
      const sceneAgentArtifact = page.locator('.agent-session-artifact');
      await expect(sceneAgentArtifact.locator('.agent-turn-details pre')).toContainText(/视频 Prompt|15 秒/, { timeout: 20_000 });
      await expect(sceneAgentArtifact).toContainText(/准备复制到第三方视频平台|已复制到/);
      await sceneAgentArtifact.locator('.scene-prompt-target-select select').selectOption('vidu');
      await sceneAgentArtifact.getByRole('button', { name: '复制到第三方视频平台', exact: true }).click();
      await expect(sceneAgentArtifact).toContainText('已复制到Vidu', { timeout: 20_000 });
      await expect(sceneAgentArtifact.getByRole('button', { name: '成品导入', exact: true })).toBeEnabled();
      await sceneAgentArtifact.getByRole('button', { name: '成品导入', exact: true }).click();
      await expect(page.locator('.video-import-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.video-import-handoff-note')).toContainText(/Prompt 已复制到第三方平台|已导入成品/);
      await expect(page.locator('.video-import-draft-panel')).toContainText('最近：Vidu');
      await expect(page.locator('.video-import-workbench .module-command-center button').filter({ hasText: '导入并关联提示词' })).toBeEnabled();

      await clickNavItem(page, '场景提示词');
      await expect(page.locator('.scene-prompt-workbench')).toBeVisible();

      await page.locator('.agent-composer-meta label').filter({ hasText: '输出' }).locator('select').selectOption('image');
      const generateImagePromptButton = page.locator('.scene-agent-composer button').filter({ hasText: '生成 Prompt' });
      if (await generateImagePromptButton.count()) {
        await generateImagePromptButton.click();
      }
      await expect(sceneAgentArtifact.locator('.agent-turn-details pre')).toContainText('图片 Prompt', { timeout: 20_000 });
      await expect(sceneAgentArtifact).toContainText('准备发送到图片生成');
      await sceneAgentArtifact.locator('button').filter({ hasText: '外部工具' }).click();
      await sceneAgentArtifact.getByRole('button', { name: '复制到外部图片工具', exact: true }).click();
      await expect(sceneAgentArtifact).toContainText('已复制到外部图片工具', { timeout: 20_000 });
      await sceneAgentArtifact.locator('button').filter({ hasText: '内部下游' }).click();
      await sceneAgentArtifact.getByRole('button', { name: '发送到图片生成', exact: true }).click();
      await expect(page.locator('.image-workbench-layout')).toBeVisible();
      await expect(page.locator('.image-prompt-panel textarea')).toHaveValue(/早餐桌自然光|便携条包/);

      const persisted = await page.evaluate(async (workspacePath) => {
        const api = window.contentStudio;
        const [packs, scenes, drafts] = await Promise.all([
          api.listPromptPacks(workspacePath),
          api.listSceneCards(workspacePath),
          api.listPromptDrafts(workspacePath),
        ]);
        const importedVideo = (await api.listInputSources(workspacePath)).find((source) => source.purpose === 'successful-asset' && source.kind === 'video');
        return {
          packCount: packs.length,
          firstPackCitationIds: packs[0]?.citations.map((citation) => citation.knowledgeBaseId) ?? [],
          sceneCount: scenes.length,
          firstSceneCitationIds: scenes[0]?.citations.map((citation) => citation.knowledgeBaseId) ?? [],
          imageDraftCount: drafts.filter((draft) => draft.purpose === 'image').length,
          firstImageDraftSceneIds: drafts.find((draft) => draft.purpose === 'image')?.sceneCardIds ?? [],
          importedVideo,
          copiedVideoDraft: drafts.find((draft) => draft.id === importedVideo?.relatedPromptDraftId),
          sceneCopiedVideoDraft: drafts.find((draft) => draft.title === '场景视频 Prompt 草稿' && draft.lastCopiedTarget === 'Vidu'),
          mixPackage: (await api.listMixPackages(workspacePath))[0],
        };
      }, workspaceDir);

      expect(persisted.packCount).toBeGreaterThanOrEqual(1);
      expect(persisted.firstPackCitationIds.some((id) => id.startsWith('brand-kb:')), JSON.stringify(persisted)).toBe(true);
      expect(persisted.sceneCount).toBeGreaterThanOrEqual(1);
      expect(persisted.firstSceneCitationIds.some((id) => id.startsWith('brand-kb:')), JSON.stringify(persisted)).toBe(true);
      expect(persisted.copiedVideoDraft?.copyCount, JSON.stringify(persisted)).toBeGreaterThanOrEqual(1);
      expect(persisted.sceneCopiedVideoDraft?.copyCount, JSON.stringify(persisted)).toBeGreaterThanOrEqual(1);
      expect(persisted.sceneCopiedVideoDraft?.lastCopiedTarget, JSON.stringify(persisted)).toBe('Vidu');
      expect(persisted.importedVideo?.relatedPromptDraftId, JSON.stringify(persisted)).toBe(persisted.copiedVideoDraft?.id);
      expect(persisted.mixPackage?.assets.some((asset) => asset.kind === 'video'), JSON.stringify(persisted)).toBe(true);
      const mixedVideo = persisted.mixPackage?.assets.find((asset) => asset.kind === 'video');
      expect(mixedVideo?.promptDraftId, JSON.stringify(persisted)).toBe(persisted.copiedVideoDraft?.id);
      expect(mixedVideo?.sourceType, JSON.stringify(persisted)).toBe('input-source');
      expect(mixedVideo?.sourceId, JSON.stringify(persisted)).toBe(persisted.importedVideo?.id);
      expect(mixedVideo?.promptText, JSON.stringify(persisted)).toContain('15 秒');
      expect(persisted.imageDraftCount).toBeGreaterThanOrEqual(1);
      expect(persisted.firstImageDraftSceneIds.length, JSON.stringify(persisted)).toBeGreaterThanOrEqual(1);
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  expect(capturedPrompts.some((prompt) => prompt.includes('brand-kb:')), capturedPrompts.join('\n---\n')).toBe(true);
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
        return { sceneIds: cards.map((card) => card.id), sourceId: source.id };
      }, { workspacePath: workspaceDir, endpoint: baseUrl });
      expect(setup.sceneIds.length).toBeGreaterThan(0);

      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待场景隔离测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, '文章生成');
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

      await clickNavItem(page, '场景提示词');
      await expect(page.locator('.scene-prompt-workbench')).toBeVisible({ timeout: 20_000 });
      const sceneAgentArtifact = page.locator('.agent-session-artifact');
      await page.locator('.scene-prompt-workbench .scene-agent-composer button').filter({ hasText: '生成 Prompt' }).click();
      await expect(sceneAgentArtifact.locator('.agent-turn-details pre')).toContainText('图片 Prompt', { timeout: 20_000 });
      await sceneAgentArtifact.locator('button').filter({ hasText: '外部工具' }).click();
      const copyScenePromptButton = sceneAgentArtifact.getByRole('button', { name: '复制到外部图片工具', exact: true });
      await expect(copyScenePromptButton).toBeEnabled();
      await copyScenePromptButton.click();
      await expect(sceneAgentArtifact).toContainText('已复制到外部图片工具', { timeout: 20_000 });
      const scenePromptTrace = await page.evaluate(async (workspacePath) => {
        const drafts = await window.contentStudio.listPromptDrafts(workspacePath);
        const draft = drafts.find((item) => item.title === '场景图片 Prompt 草稿');
        return { inputSourceIds: draft?.inputSourceIds ?? [] };
      }, workspaceDir);
      expect(scenePromptTrace.inputSourceIds, JSON.stringify(scenePromptTrace)).toContain(setup.sourceId);
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('IP 知识库能进入场景延伸库和 PromptPack 引用', async ({}, testInfo) => {
  test.setTimeout(120_000);

  const capturedPrompts = [];
  const { server, baseUrl } = await startFakeOpenAITextServer((prompt) => {
    capturedPrompts.push(prompt);
    return fakeBusinessChainTextOutput(prompt);
  });

  try {
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      await page.evaluate(async ({ workspacePath, endpoint }) => {
        const api = window.contentStudio;
        await api.saveSettings({ workspacePath });
        await api.saveModelConfig({
          textProtocol: 'openai-chat',
          textApiEndpoint: endpoint,
          textApiKey: 'test-text-key',
          textModel: 'test-text-model',
        });
        await api.installBuiltinKnowledgeBase('personal-ip-demo', workspacePath);
      }, { workspacePath: workspaceDir, endpoint: baseUrl });
      await page.reload();
      await expect.poll(
        async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
        { message: '等待 IP 链路测试工作区重新加载', timeout: 20_000 },
      ).toBe(true);

      await clickNavItem(page, '成型知识库');
      const ipCard = page.locator('.kb-card').filter({ hasText: '示例个人 IP 知识库' }).first();
      await expect(ipCard).toBeVisible();
      await ipCard.locator('.kb-card-main').click();
      await expect(page.locator('.knowledge-detail-panel')).toContainText('示例个人 IP 知识库');

      await clickNavItem(page, 'IP 知识库');
      const extractButton = page.locator('.knowledge-brand-workbench button').filter({ hasText: '构建 IP 知识库' }).first();
      await expect(extractButton).toBeEnabled();
      await extractButton.click();
      await expect(page.locator('.knowledge-brand-workbench .prompt-draft-list')).toContainText('嘉文老师 IP 知识库', { timeout: 20_000 });
      await expect(page.locator('.brand-kb-detail')).toContainText('内容工程顾问');
      await page.locator('.knowledge-brand-workbench .agent-session-footer textarea').fill('请检查 IP 六层缺口和口播场景延伸优先级。');
      await page.locator('.knowledge-brand-workbench .agent-session-footer button').filter({ hasText: '开始判断' }).click();
      await expect(page.locator('.knowledge-brand-workbench .agent-turn.user')).toContainText('IP 六层缺口', { timeout: 20_000 });
      await expect(page.locator('.knowledge-brand-workbench .agent-turn.assistant')).toContainText('图片 Prompt', { timeout: 20_000 });
      const scenarioLibrary = page.locator('.ip-scenario-library-panel');
      await expect(scenarioLibrary).toContainText('IP 运营场景库');
      await expect(scenarioLibrary).toContainText('0/3 已生成');
      await expect(scenarioLibrary.locator('.ip-scenario-card').filter({ hasText: '口播' })).toContainText('待生成延伸知识库');
      await scenarioLibrary.locator('.ip-scenario-card').filter({ hasText: '口播' }).getByRole('button', { name: '生成延伸库' }).click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-draft-editor')).toHaveValue(/IP 场景延伸知识库|延伸场景：口播|内容工程顾问/, { timeout: 20_000 });
      await clickNavItem(page, 'IP 知识库');
      await expect(scenarioLibrary.locator('.ip-scenario-card').filter({ hasText: '口播' })).toContainText('已确认');
      await expect(scenarioLibrary.locator('.ip-scenario-card').filter({ hasText: '口播' })).toContainText('延伸知识库已生成');

      const sceneButton = page.locator('.knowledge-brand-workbench button').filter({ hasText: '生成场景延伸库' }).first();
      await expect(sceneButton).toBeEnabled();
      await sceneButton.click();
      await expect(page.locator('.scene-prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.scene-agent-attachment-list')).toContainText('早餐后便携场景');

      const persisted = await page.evaluate(async (workspacePath) => {
        const api = window.contentStudio;
        const [ipRecords, packs, scenes] = await Promise.all([
          api.listIpKnowledgeBases(workspacePath),
          api.listPromptPacks(workspacePath),
          api.listSceneCards(workspacePath),
        ]);
        return {
          ipRecordCount: ipRecords.length,
          firstIpCompleteness: ipRecords[0]?.completeness ?? 0,
          firstPackCitationIds: packs[0]?.citations.map((citation) => citation.knowledgeBaseId) ?? [],
          firstSceneCitationIds: scenes[0]?.citations.map((citation) => citation.knowledgeBaseId) ?? [],
        };
      }, workspaceDir);

      expect(persisted.ipRecordCount, JSON.stringify(persisted)).toBeGreaterThanOrEqual(1);
      expect(persisted.firstIpCompleteness, JSON.stringify(persisted)).toBe(100);
      expect(persisted.firstPackCitationIds.some((id) => id.startsWith('ip-kb:')), JSON.stringify(persisted)).toBe(true);
      expect(persisted.firstSceneCitationIds.some((id) => id.startsWith('ip-kb:')), JSON.stringify(persisted)).toBe(true);
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }

  expect(capturedPrompts.some((prompt) => prompt.includes('ip-kb:')), capturedPrompts.join('\n---\n')).toBe(true);
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
          params: { textModel: 'claude-sonnet-4-5' },
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

      let videoBreakdownError = '';
      try {
        await api.analyzeVideo({
          workspacePath,
          sourceType: 'url',
          source: 'https://example.com/reference.mp4',
          dimensions: ['开头钩子', '视觉节奏'],
          citations,
          selectedSkillSlugs: [],
          params: { textModel: 'claude-sonnet-4-5' },
        });
      } catch (error) {
        videoBreakdownError = error instanceof Error ? error.message : String(error);
      }

      let videoScriptError = '';
      try {
        await api.generateVideoScript({
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
          params: { textModel: 'claude-sonnet-4-5' },
        });
      } catch (error) {
        videoScriptError = error instanceof Error ? error.message : String(error);
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
        videoScriptBlocked: videoScriptError.includes('文字模型未配置'),
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
      await clickButton(page, '文章生成');
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
      model: setup.provider.textModel,
      error: '',
    });

    const articleLayout = await page.evaluate(() => {
      const workbench = document.querySelector('.article-workbench');
      const stage = document.querySelector('.stage');
      const rendered = document.querySelector('.article-rendered');
      if (!workbench || !stage || !rendered) return { ok: false };
      return {
        ok: true,
        workbenchHeight: Math.round(workbench.getBoundingClientRect().height),
        stageHeight: Math.round(stage.getBoundingClientRect().height),
        renderedHeight: Math.round(rendered.getBoundingClientRect().height),
      };
    });
    expect(articleLayout.ok, JSON.stringify(articleLayout)).toBe(true);
    expect(articleLayout.workbenchHeight, JSON.stringify(articleLayout)).toBeGreaterThan(620);
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

test('参考视频拆解三步工作台使用真实 blocked 分支，不伪造视频结果', async ({}, testInfo) => {
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
    await expect(page.getByRole('heading', { name: '参考视频拆解工作台' })).toBeVisible();
    await expect(page.locator('.video-stage-tabs button')).toHaveCount(3);
    await expect(page.locator('.video-stage-tabs button').nth(0)).toContainText('视频拆解');
    await expect(page.locator('.video-stage-tabs button').nth(1)).toContainText('脚本生成');
    await expect(page.locator('.video-stage-tabs button').nth(2)).toContainText('Prompt 交接');

    await expect(page.getByRole('heading', { name: '参考视频导入' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '片段拆解结果' })).toBeVisible();
    const videoDimensionCount = await page.locator('.video-dimension-grid button').count();
    expect(videoDimensionCount).toBeGreaterThan(0);
    await expect(page.locator('.video-summary-row')).toContainText('智能拆解');
    await assertVideoWorkbenchLayout(page);

    await clickVideoAction(page, '智能拆解');
    await expect(page.getByText('请先选择本地视频或粘贴参考视频链接')).toBeVisible();
    await expect(page.locator('.video-dimension-grid button.active')).toHaveCount(videoDimensionCount);

    await clickVideoStageTab(page, '脚本生成');
    await expect(page.getByRole('heading', { name: '新产品信息' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '新视频脚本' })).toBeVisible();
    await expect(page.locator('.video-product-card input').first()).toHaveValue('新产品');
    await expect(page.locator('.video-upload-callout')).toContainText('上传产品图');
    await clickVideoAction(page, '选择图片');
    await expect(page.locator('.video-upload-callout input[type="checkbox"]')).toBeChecked();
    await assertVideoWorkbenchLayout(page);

    await clickVideoAction(page, '生成新视频脚本');
    await expect(page.getByText('文字模型未配置')).toBeVisible();
    await expect(page.locator('.video-script-card')).toContainText('等待生成新视频脚本');

    await clickVideoStageTab(page, 'Prompt 交接');
    await expect(page.getByRole('heading', { name: '视频 Prompt 使用的素材' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '可选内部视频生成' })).toBeVisible();
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
    expect(handoffTrace.sourcePurpose, JSON.stringify(handoffTrace)).toBe('sop-input');
    expect(handoffTrace.sourceTags, JSON.stringify(handoffTrace)).toEqual(expect.arrayContaining(['video-prompt', '视频交接']));
    expect(handoffTrace.sourceText, JSON.stringify(handoffTrace)).toContain('第三方生成后的成品视频需要由用户手动导入');

    await clickButton(page, '视频生成');
    await clickVideoStageTab(page, 'Prompt 交接');
    await clickVideoAction(page, '可选：内部视频生成');
    await expect(page.locator('.result-card.blocked')).toBeVisible();
    await expect(page.locator('.result-card.blocked')).toContainText(/视频生成服务未配置|视频 provider 未配置/);
    await expect(page.locator('.video-cost-estimate')).toContainText('内部 API 成本估算');
    await expect(page.locator('.video-cost-estimate')).toContainText('18s × ¥2.00/秒');
    await expect(page.locator('.asset-output-card')).toHaveCount(2);
    await expect(page.locator('.asset-output-card').first()).toContainText('内部生成产物');

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
