import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { copyFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
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
  await writeFile(e2eProductAssetPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
  await writeFile(e2eVideoAssetPath, 'content-studio-e2e-video');
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
        video: [e2eVideoAssetPath],
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

  await page.waitForLoadState('domcontentloaded');
  await expect.poll(
    async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
    { message: '等待 Electron preload bridge 和主工作台加载完成', timeout: 20_000 },
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

async function clickNavItem(page, label) {
  const item = page.locator('.nav-stack button.nav-item').filter({ hasText: label }).first();
  await expect(item, `导航项应存在：${label}`).toBeVisible();
  await item.click();
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
  const server = createServer((request, response) => {
    if (request.url === '/v1/chat/completions') {
      let body = '';
      request.on('data', (chunk) => { body += chunk.toString(); });
      request.on('end', () => {
        const payload = JSON.parse(body);
        const messages = Array.isArray(payload.messages) ? payload.messages : [];
        const userMessage = messages.find((message) => message.role === 'user')?.content ?? '';
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
  return { server, baseUrl };
}

function fakeBusinessChainTextOutput(prompt) {
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
    await expect(page.getByRole('button', { name: '导入' })).toBeEnabled();
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
    await expect(page.getByRole('button', { name: '直接编辑' })).toBeVisible();
    await expect(page.getByRole('button', { name: '系统提示词' })).toBeVisible();
    await expect(page.locator('.json-editor')).toContainText('电商白底主图');
    await expect(page.locator('.json-editor')).toContainText('prompts');
    await expect(page.locator('.json-editor')).not.toContainText(['光', '核'].join(''));
    await clickButton(page, '系统提示词');
    await expect(page.locator('.template-prompt-summary')).toContainText('System Prompt');
    await expect(page.getByText('系统提示词是图片技能的核心')).toBeVisible();
    await expect(page.getByText('系统提示词 prompts.system')).toBeVisible();
    await expect(page.locator('.template-prompt-editor textarea').first()).toHaveValue(/professional/);
    await expect(page.getByText('英文增强关键词 prompts.enhance')).toBeVisible();
    await expect(page.getByText('负面关键词 prompts.negative')).toBeVisible();
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
    await expect(page.getByRole('heading', { name: '视频复刻引擎' })).toBeVisible();
    await clickButton(page, '文章生成');
    await expectCommandCenter(page, '.article-module-workbench > .module-command-center', 'compact');
    await expect(page.locator('.article-module-workbench > .v2-feature-hero')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '正文 / 发布检查' })).toBeVisible();
    await clickButton(page, '成型知识库');
    await expect(page.locator('.knowledge-tab-bar button').filter({ hasText: /^知识库/ })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: '导入 DOCX / MD / JSON' })).toBeVisible();
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

test('v2 新增入口能落到真实工作流动作，不再只是静态说明页', async ({}, testInfo) => {
  test.setTimeout(120_000);

  await withContentStudio(testInfo, async ({ page }) => {
    for (const label of [
      '合规检测',
      '图片精修',
      '视频脚本',
      '成品视频入库',
      '创意视频',
      '自定义视频',
      '标题生成',
      '脚本生成',
      '输入源 / 文档转换',
      '场景库',
      '运行历史',
      '工作流定义',
      'Canvas 编排',
    ]) {
      await expectNavLabelAbsent(page, label);
    }

    await clickNavItem(page, 'Prompt 工作台');
    await expect(page.locator('.prompt-workbench')).toBeVisible();
    await expectCommandCenter(page, '.prompt-workbench > .module-command-center', 'compact');
    await expect(page.locator('.prompt-workbench > .v2-feature-hero')).toHaveCount(0);
    await expect(page.locator('.prompt-workbench > .prompt-session-panel')).toHaveCount(0);
    await expectNotStaticV2Page(page);
    await clickButton(page, '补输入源');
    await expect(page.locator('.input-sources-workbench')).toBeVisible();
    await expectCommandCenter(page, '.input-sources-workbench > .module-command-center', 'compact');
    await expect(page.locator('.input-sources-workbench > .v2-feature-hero')).toHaveCount(0);
    await expectNotStaticV2Page(page);
    await page.locator('.input-source-register-panel input').first().fill('便携条包产品资料');
    await page.locator('.input-source-register-panel textarea').fill('产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗，不做无依据背书。');
    await clickButton(page, '登记文本输入源');
    await expect(page.locator('.input-source-list')).toContainText('便携条包产品资料');

    await clickNavItem(page, '对标图反推');
    await expect(page.locator('.reference-reverse-workbench')).toBeVisible();
    await expectCommandCenter(page, '.reference-reverse-workbench > .module-command-center', 'compact');
    await expect(page.locator('.reference-reverse-workbench > .v2-feature-hero')).toHaveCount(0);
    await expectNotStaticV2Page(page);

    await clickNavItem(page, 'Prompt 工作台');
    await expect(page.locator('.prompt-workbench')).toBeVisible();
    await expectCommandCenter(page, '.prompt-workbench > .module-command-center', 'compact');
    await expect(page.locator('.prompt-workbench > .prompt-session-panel')).toHaveCount(0);
    await expectNotStaticV2Page(page);
    await clickButton(page, '仅生成草稿');
    await expect(page.locator('.prompt-draft-editor')).toHaveValue(/Prompt 草稿|任务：/, { timeout: 20_000 });
    await expect(page.locator('.prompt-draft-list .record-card').first()).toBeVisible();

    await clickNavItem(page, '场景提示词');
    await expect(page.locator('.scene-prompt-workbench')).toBeVisible();
    await expectCommandCenter(page, '.scene-prompt-workbench > .module-command-center', 'flow');
    await expect(page.locator('.scene-prompt-workbench > .v2-feature-flow')).toHaveCount(0);
    await expect(page.locator('.module-command-center .module-command-flow')).toBeVisible();
    await expectNotStaticV2Page(page);

    await clickNavItem(page, '视频 Prompt');
    await expect(page.locator('.video-prompt-workbench')).toBeVisible();
    await expectCommandCenter(page, '.video-prompt-workbench > .module-command-center', 'flow');
    await expect(page.locator('.video-prompt-workbench > .v2-feature-flow')).toHaveCount(0);
    await expectNotStaticV2Page(page);
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
    await expect(page.locator('.knowledge-brand-workbench > .v2-feature-hero')).toHaveCount(0);
    await clickNavItem(page, 'IP 知识库');
    await expectCommandCenter(page, '.knowledge-brand-workbench > .module-command-center', 'compact');
    await expect(page.locator('.knowledge-brand-workbench > .v2-feature-hero')).toHaveCount(0);

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
    await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
    await expect(page.locator('.workflow-history-panel')).toBeVisible();
    await page.locator('.workflow-view-tabs button').filter({ hasText: '定义管理' }).click();
    await expect(page.locator('.workflow-detail-panel')).toBeVisible();
    await page.locator('.workflow-view-tabs button').filter({ hasText: 'Canvas' }).click();
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
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'Skill 输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '品牌知识库输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '产品资料输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'IP 知识库输入源' }).locator('input')).not.toBeChecked();
    await page.locator('.prompt-source-panel select').first().selectOption('skill');
    await expect(page.locator('.prompt-source-panel input').first()).toHaveValue('Skill 草案');
    await expect(page.locator('.prompt-source-panel textarea')).toHaveValue(/本地 skill/);
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'Skill 输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '品牌知识库输入源' }).locator('input')).not.toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'IP 知识库输入源' }).locator('input')).not.toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '产品资料输入源' }).locator('input')).not.toBeChecked();
    const editor = page.locator('.prompt-editor-panel');
    await expect(editor).toContainText('Product Prompt Skill', { timeout: 20_000 });
    await expect(editor.locator('button').filter({ hasText: '物化为 Skill' })).toBeVisible();
    await expect(editor.locator('button').filter({ hasText: '发送到图片' })).toHaveCount(0);
    await expect(editor.locator('button').filter({ hasText: '打开视频 Prompt' })).toHaveCount(0);
    await expect(editor.locator('button').filter({ hasText: '物化为 SOP' })).toHaveCount(0);

    await editor.locator('button').filter({ hasText: '物化为 Skill' }).click();
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
    expect(persisted.skillContent).toContain('来源 PromptDraft：Product Prompt Skill');
    expect(persisted.skillContent).toContain('只使用用户提供的知识库');

    await clickNavItem(page, 'Prompt 工作台');
    await page.locator('.prompt-source-panel select').first().selectOption('sop');
    await expect(page.locator('.prompt-source-panel input').first()).toHaveValue('SOP 草案');
    await expect(page.locator('.prompt-source-panel textarea')).toHaveValue(/发布运行的 SOP 草案/);
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'Skill 输入源' }).locator('input')).toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '品牌知识库输入源' }).locator('input')).not.toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: 'IP 知识库输入源' }).locator('input')).not.toBeChecked();
    await expect(page.locator('.prompt-source-option').filter({ hasText: '产品资料输入源' }).locator('input')).not.toBeChecked();
    await expect(editor).toContainText('Reusable SOP Method', { timeout: 20_000 });
    await expect(editor.locator('button').filter({ hasText: '物化为 SOP' })).toBeVisible();
    await expect(editor.locator('button').filter({ hasText: '发送到图片' })).toHaveCount(0);
    await expect(editor.locator('button').filter({ hasText: '物化为 Skill' })).toHaveCount(0);

    await editor.locator('button').filter({ hasText: '物化为 SOP' }).click();
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
    await page.locator('.workflow-runner-panel textarea').nth(1).fill('生成 15 秒视频素材 Prompt，第三方生成后手动导入，再生成绿幕图和混剪 manifest。');
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

    await clickNavItem(page, 'SOP 工作流');
    const latestNextAction = page.locator('.workflow-latest-run-next');
    await expect(latestNextAction).toContainText('导入成品视频', { timeout: 20_000 });
    await latestNextAction.locator('button').filter({ hasText: '继续下一步' }).click();
    await expect(latestNextAction).toContainText('编辑并生成绿幕图', { timeout: 20_000 });
    await expect(page.locator('.workflow-latest-run')).toContainText('third-party-finished-video.mp4');
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
    await expect(importedVideoCard.getByRole('button', { name: 'Prompt', exact: true })).toBeVisible();
    await expect(importedVideoCard.getByRole('button', { name: 'SOP', exact: true })).toBeVisible();
    await importedVideoCard.getByRole('button', { name: '通过', exact: true }).click();
    await expect(importedVideoCard).toContainText('已通过');
    await expect(importedVideoCard.getByRole('button', { name: '沉淀 Prompt', exact: true })).toBeVisible();
    await importedVideoCard.getByRole('button', { name: '沉淀 Prompt', exact: true }).click();
    await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.prompt-draft-editor')).toHaveValue(/成功素材反向沉淀 Prompt|third-party-finished-video\.mp4|视频 Prompt/, { timeout: 20_000 });

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
      return {
        runId: run?.id,
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
    expect(distilledVideoTrace.sourcePurpose, JSON.stringify(distilledVideoTrace)).toBe('successful-asset');
    expect(distilledVideoTrace.sourceKind, JSON.stringify(distilledVideoTrace)).toBe('video');
    expect(distilledVideoTrace.sourcePath, JSON.stringify(distilledVideoTrace)).toContain('third-party-finished-video.mp4');
    expect(distilledVideoTrace.draftPurpose, JSON.stringify(distilledVideoTrace)).toBe('video');
    expect(distilledVideoTrace.draftModel, JSON.stringify(distilledVideoTrace)).toBe('local-successful-asset-distiller');
    expect(distilledVideoTrace.draftWorkflowRunId, JSON.stringify(distilledVideoTrace)).toBe(distilledVideoTrace.runId);
    expect(distilledVideoTrace.runHasDistilledSourceRef, JSON.stringify(distilledVideoTrace)).toBe(true);
    expect(distilledVideoTrace.runHasDistilledDraftRef, JSON.stringify(distilledVideoTrace)).toBe(true);

    await clickNavItem(page, 'Prompt 工作台');
    await expect(page.locator('.prompt-source-option').filter({ hasText: '追溯源' }).locator('input')).toBeDisabled();
    await page.getByRole('button', { name: '补输入源', exact: true }).click();
    await expect(page.locator('.input-sources-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.input-source-list .input-source-card').first()).toContainText('Prompt 溯源', { timeout: 20_000 });
    await expect(page.locator('.input-source-list .input-source-card').first()).toContainText('成功素材沉淀 / third-party-finished-video.mp4', { timeout: 20_000 });

    await clickNavItem(page, '混剪包导出');
    await expect(page.locator('.mix-export-workbench')).toBeVisible({ timeout: 20_000 });
    await expect(importedVideoCard).toContainText('已通过', { timeout: 20_000 });
    const overlayCard = page.locator('.mix-asset-card').filter({ hasText: /标题卡|早餐后顺手一次/ }).first();
    await expect(overlayCard).toBeVisible();
    await expect(overlayCard).toContainText('SOP 已关联');
    await expect(overlayCard.getByRole('button', { name: 'Prompt', exact: true })).toBeVisible();
    await overlayCard.getByRole('button', { name: '通过', exact: true }).click();
    await expect(overlayCard).toContainText('已通过');
    await expect(page.locator('.mix-export-config-panel button').filter({ hasText: '导出混剪包' })).toBeEnabled();
    await page.locator('.mix-export-config-panel button').filter({ hasText: '导出混剪包' }).click();
    await expect(page.locator('.mix-package-card').first()).toContainText('短视频混剪素材包', { timeout: 20_000 });
    await expect(page.locator('.mix-package-card').first()).toContainText('SOP 已关联');
    await expect(page.locator('.mix-package-card').first().getByRole('button', { name: '打开 SOP' })).toBeVisible();

    await clickNavItem(page, 'SOP 工作流');
    await expect(page.locator('.workflow-latest-run')).toContainText('完成', { timeout: 20_000 });
    await expect(latestNextAction).toContainText('查看混剪包');
    await page.locator('.workflow-latest-run button').filter({ hasText: '查看运行详情' }).click();
    await expect(runDetail.locator('.workflow-run-action-panel')).toContainText('查看混剪包');

    const exportedTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const [pack] = await api.listMixPackages(workspacePath);
      const relatedRun = (await api.listWorkflowRuns(workspacePath))
        .find((run) => run.id === pack?.workflowRunId);
      return {
        workflowRunId: pack?.workflowRunId,
        runStatus: relatedRun?.status,
        runRefs: relatedRun?.artifactRefs ?? [],
      };
    }, workspaceDir);
    expect(exportedTrace.workflowRunId, JSON.stringify(exportedTrace)).toBeTruthy();
    expect(exportedTrace.runStatus, JSON.stringify(exportedTrace)).toBe('succeeded');
    expect(exportedTrace.runRefs.some((ref) => ref.startsWith('mix-package:')), JSON.stringify(exportedTrace)).toBe(true);

    await clickNavItem(page, 'SOP 工作流');
    await page.locator('.workflow-view-tabs button').filter({ hasText: '执行表单' }).click();
    await expect(page.locator('.workflow-view-tabs button[aria-selected="true"]')).toContainText('执行表单');
    const repeatedVideoSopCard = page.locator('.workflow-definition-list .record-card').filter({ hasText: '视频素材包 SOP' }).first();
    await expect(repeatedVideoSopCard).toBeVisible();
    await repeatedVideoSopCard.click();
    await expect(page.locator('.workflow-runner-panel')).toContainText('视频素材包 SOP');
    await page.locator('.workflow-runner-panel textarea').nth(0).fill('品牌场景库、脚本和产品素材。');
    await page.locator('.workflow-runner-panel textarea').nth(1).fill('生成 15 秒视频素材 Prompt，第三方生成后手动导入，再生成绿幕图和混剪 manifest。');
    await page.locator('.workflow-runner-panel input[type="number"]').fill('15');
    await page.locator('.workflow-runner-panel button').filter({ hasText: '运行 SOP' }).click();

    const repeatedRunTrace = await page.evaluate(async (workspacePath) => {
      const api = window.contentStudio;
      const runs = await api.listWorkflowRuns(workspacePath);
      const sources = await api.listInputSources(workspacePath);
      const latestRun = runs
        .filter((item) => item.workflowKey === 'video-material-package')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      return {
        runId: latestRun?.id,
        inputSourceIds: latestRun?.inputSourceIds ?? [],
        promptDistilledSourceIds: sources
          .filter((source) => source.tags.includes('prompt-distilled'))
          .map((source) => source.id),
      };
    }, workspaceDir);
    expect(repeatedRunTrace.promptDistilledSourceIds.length, JSON.stringify(repeatedRunTrace)).toBeGreaterThan(0);
    expect(
      repeatedRunTrace.promptDistilledSourceIds.some((id) => repeatedRunTrace.inputSourceIds.includes(id)),
      JSON.stringify(repeatedRunTrace),
    ).toBe(false);
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
    await expect(promptPanel.locator('.panel-title')).toContainText('独立视频 Prompt', { timeout: 20_000 });
    await promptPanel.locator('button').filter({ hasText: '复制到第三方平台' }).click();
    await expect(promptPanel.locator('button').filter({ hasText: '已复制' })).toBeVisible();

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

test('SOP 定义草案可以编辑、发布并从表单运行', async ({}, testInfo) => {
  test.setTimeout(120_000);

  await withContentStudio(testInfo, async ({ page }) => {
    await clickNavItem(page, 'SOP 工作流');
    await page.locator('.workflow-view-tabs button').filter({ hasText: '定义管理' }).click();
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
    await editor.locator('label').filter({ hasText: '输入字段 JSON' }).locator('textarea').fill(JSON.stringify([
      { key: 'source', label: '资料来源', type: 'textarea', required: true },
      { key: 'intent', label: '执行目标', type: 'textarea', required: true },
    ], null, 2));
    await editor.locator('label').filter({ hasText: '执行步骤 JSON' }).locator('textarea').fill(JSON.stringify([
      { id: 'input_register', title: '登记输入源', kind: 'input', description: '登记资料和目标。', dependsOn: [], outputKeys: ['InputSource'] },
      { id: 'human_review', title: '人工审核', kind: 'review', description: '确认输入和执行目标。', dependsOn: ['input_register'], outputKeys: ['ReviewResult'] },
      { id: 'asset_store', title: '入历史', kind: 'asset-store', description: '归档本次 SOP 运行。', dependsOn: ['human_review'], outputKeys: ['RunArchive'] },
    ], null, 2));
    await editor.getByRole('button', { name: '保存 SOP 定义' }).click();
    await expect(page.locator('.workflow-definition-list')).toContainText('功能测试 UI 可运行 SOP', { timeout: 20_000 });

    await page.locator('.workflow-detail-panel button').filter({ hasText: '发布为可运行' }).click();
    await expect(page.locator('.workflow-detail-panel .workflow-meta-grid')).toContainText('published', { timeout: 20_000 });

    await page.locator('.workflow-view-tabs button').filter({ hasText: '执行表单' }).click();
    const runner = page.locator('.workflow-runner-panel');
    await expect(runner).toContainText('功能测试 UI 可运行 SOP');
    await runner.locator('label').filter({ hasText: '资料来源' }).locator('textarea').fill('UI 测试输入资料');
    await runner.locator('label').filter({ hasText: '执行目标' }).locator('textarea').fill('验证编辑发布后的 SOP 可以运行。');
    await runner.getByRole('button', { name: '运行 SOP' }).click();
    await expect(page.locator('.workflow-history-panel')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.workflow-run-detail-panel')).toContainText('功能测试 UI 可运行 SOP');
    await expect(page.locator('.workflow-run-detail-panel')).toContainText('排队');
    await expect(page.locator('.workflow-run-detail-panel')).toContainText('人工审核');
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
      await expect(artifactPanel).toContainText('打开 Prompt 草稿');

      await artifactPanel.locator('button').filter({ hasText: '打开品牌知识库' }).click();
      await expect(page.locator('.knowledge-brand-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.brand-kb-detail')).toContainText('便携条包', { timeout: 20_000 });

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await artifactPanel.locator('button').filter({ hasText: '打开场景库' }).click();
      await expect(page.locator('.scene-prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.scene-prompt-scene-list')).toContainText('早餐后便携场景');
      await expect(page.locator('.scene-prompt-scenes-panel')).toContainText('1 已选');

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await artifactPanel.locator('button').filter({ hasText: '打开 Prompt 草稿' }).click();
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
    await withContentStudio(testInfo, async ({ page, workspaceDir }) => {
      const setup = await page.evaluate(async ({ workspacePath, endpoint }) => {
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
          kind: 'manual-note',
          purpose: 'reference',
          title: '小红书对标图描述',
          text: '参考图：早餐桌自然光，手拿条包，左上留白，手机实拍。',
          summary: '小红书对标图描述',
          tags: ['参考图'],
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
      }, { workspacePath: workspaceDir, endpoint: baseUrl });

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
      await expect(artifactPanel).toContainText('打开 Prompt 草稿');
      await expect(artifactPanel).toContainText('打开素材审核');

      await artifactPanel.locator('button').filter({ hasText: '打开 Prompt 草稿' }).click();
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
      await generatedAsset.locator('button').filter({ hasText: '驳回' }).click();
      await expect(generatedAsset).toContainText('已驳回', { timeout: 20_000 });

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await expect(runDetail).toContainText(/已驳回素材并等待回炉|驳回|回炉/, { timeout: 20_000 });
      await expect(runDetail.locator('.workflow-summary-stack')).toContainText('阻塞');
      await expect(runDetail).toContainText('原驳回素材', { timeout: 20_000 });

      await artifactPanel.locator('button').filter({ hasText: '打开素材审核' }).click();
      await expect(page.locator('.asset-library-workbench')).toBeVisible({ timeout: 20_000 });
      await generatedAsset.getByRole('button', { name: '回炉', exact: true }).click();
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
      await reworkedAsset.getByRole('button', { name: '通过', exact: true }).click();
      await expect(reworkedAsset).toContainText('已通过', { timeout: 20_000 });

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await expect(runDetail).toContainText('小红书种草图 SOP 已完成', { timeout: 20_000 });
      await expect(runDetail.locator('.workflow-summary-stack')).toContainText('完成');
      await expect(runDetail).toContainText('新通过素材', { timeout: 20_000 });

      await artifactPanel.locator('button').filter({ hasText: '打开素材审核' }).click();
      await expect(page.locator('.asset-library-workbench')).toBeVisible({ timeout: 20_000 });
      const approvedReworkedAsset = page.locator('.asset-tile').filter({ hasText: '回炉生成' }).first();
      await approvedReworkedAsset.getByRole('button', { name: '沉淀 Prompt', exact: true }).click();
      await expect(page.locator('.prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.prompt-draft-editor')).toHaveValue(/成功素材反向沉淀 Prompt|复用 Prompt 草稿|真实手机实拍/, { timeout: 20_000 });

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

test('IP 长文 SOP 运行详情可以打开 Agent Prompt 并进入文章生成', async ({}, testInfo) => {
  test.setTimeout(180_000);

  const { server, baseUrl } = await startFakeOpenAITextServer((prompt) => {
    if (prompt.includes('"task": "generate_article"')) {
      return {
        titleCandidates: ['IP 内容工程方法论', '从知识库到内容生产', '把个人 IP 写作变成流程'],
        outline: ['IP 定位', '知识库事实', '方法论展开', '场景案例', '发布检查'],
        summary: '基于 IP 知识库和 Agent Prompt 生成长文。',
        markdown: [
          '# IP 内容工程方法论',
          '',
          '个人 IP 内容不是临场发挥，而是从身份、价值观、语言和方法论中抽取稳定表达。',
          '',
          '这次 SOP 已经先构建 IP 知识库，再让 Agent 读取输入源和用户意图，最后进入文章生成。',
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
      await expect(artifactPanel).toContainText('打开 Prompt 草稿');

      await artifactPanel.locator('button').filter({ hasText: '打开 IP 知识库' }).click();
      await expect(page.locator('.knowledge-brand-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.brand-kb-detail')).toContainText('内容工程顾问');
      await page.getByRole('button', { name: '生成口播 Prompt' }).click();
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

      await clickNavItem(page, 'SOP 工作流');
      await page.locator('.workflow-view-tabs button').filter({ hasText: '运行记录' }).click();
      await artifactPanel.locator('button').filter({ hasText: '打开 Prompt 草稿' }).click();
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

      const completedRun = await page.evaluate(async ({ workspacePath, runId }) => {
        const [currentRun] = (await window.contentStudio.listWorkflowRuns(workspacePath))
          .filter((item) => item.id === runId);
        const outputs = (currentRun?.steps ?? [])
          .map((step) => step.output)
          .filter((output) => output && typeof output === 'object' && !Array.isArray(output));
        const promptDraftId = outputs.find((output) => typeof output.promptDraftId === 'string')?.promptDraftId;
        const generationLogId = outputs.find((output) => typeof output.generationLogId === 'string')?.generationLogId;
        const run = await window.contentStudio.recordWorkflowManualEvent({
          workspacePath,
          workflowRunId: runId,
          event: 'article-markdown-exported',
          promptDraftId,
          generationLogId,
          exportPath: `${workspacePath}/ip-sop.md`,
          summary: 'Playwright 已确认文章草稿并导出 Markdown。',
        });
        const assetStore = run.steps.find((step) => step.stepId === 'asset_store');
        return {
          status: run.status,
          summary: run.summary,
          assetStoreStatus: assetStore?.status ?? '',
          artifactRefs: run.artifactRefs,
        };
      }, { workspacePath: workspaceDir, runId: draftRun.runId });
      expect(completedRun.status).toBe('succeeded');
      expect(completedRun.assetStoreStatus).toBe('succeeded');
      expect(completedRun.summary).toContain('公众号 IP 内容 SOP 已完成');
      expect(completedRun.artifactRefs).toEqual(expect.arrayContaining([`${workspaceDir}/ip-sop.md`]));
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

      const sceneButton = page.locator('.knowledge-brand-workbench button').filter({ hasText: '生成场景库' }).first();
      await expect(sceneButton).toBeEnabled();
      await sceneButton.click();
      await expect(page.locator('.scene-prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.scene-prompt-scene-list')).toContainText('早餐后便携场景');

      await clickNavItem(page, '视频 Prompt');
      await expect(page.locator('.video-prompt-workbench')).toBeVisible();
      await page.locator('.video-prompt-builder-panel button').filter({ hasText: '生成视频 Prompt 组' }).click();
      await expect(page.locator('.video-prompt-preview pre')).toContainText(/视频 Prompt|15 秒/, { timeout: 20_000 });
      await page.locator('.video-prompt-builder-panel button').filter({ hasText: '复制到第三方平台' }).click();
      await expect(page.locator('.video-prompt-history-panel')).toContainText('RunningHub', { timeout: 20_000 });
      await expect(page.locator('.video-prompt-history-panel')).toContainText('1');
      await page.locator('.video-prompt-builder-panel button').filter({ hasText: '导入成品视频' }).click();
      await expect(page.locator('.video-import-workbench')).toBeVisible({ timeout: 20_000 });
      await page.locator('.video-import-workbench .module-command-center button').filter({ hasText: '导入并关联 Prompt' }).click();
      await expect(page.locator('.video-import-list')).toContainText('third-party-finished-video.mp4');
      await expect(page.locator('.video-import-list')).toContainText('Prompt 已关联');

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

      await page.locator('.purpose-tabs button').filter({ hasText: '图片' }).click();
      await page.locator('.scene-prompt-builder-panel button').filter({ hasText: '生成10 组 UGC 图片 Prompt' }).click();
      await expect(page.locator('.scene-prompt-preview pre')).toContainText('图片 Prompt', { timeout: 20_000 });
      await page.locator('.scene-prompt-builder-panel button').filter({ hasText: '发送选中 Prompt 到图片生成' }).click();
      await expect(page.locator('.image-workbench-layout')).toBeVisible();
      await expect(page.locator('.image-prompt-panel textarea')).toHaveValue(/早餐桌自然光|便携条包/);

      const persisted = await page.evaluate(async (workspacePath) => {
        const api = window.contentStudio;
        const [packs, scenes, drafts] = await Promise.all([
          api.listPromptPacks(workspacePath),
          api.listSceneCards(workspacePath),
          api.listPromptDrafts(workspacePath),
        ]);
        return {
          packCount: packs.length,
          firstPackCitationIds: packs[0]?.citations.map((citation) => citation.knowledgeBaseId) ?? [],
          sceneCount: scenes.length,
          firstSceneCitationIds: scenes[0]?.citations.map((citation) => citation.knowledgeBaseId) ?? [],
          imageDraftCount: drafts.filter((draft) => draft.purpose === 'image').length,
          firstImageDraftSceneIds: drafts.find((draft) => draft.purpose === 'image')?.sceneCardIds ?? [],
          copiedVideoDraft: drafts.find((draft) => draft.purpose === 'video' && (draft.copyCount ?? 0) > 0),
          importedVideo: (await api.listInputSources(workspacePath)).find((source) => source.purpose === 'successful-asset' && source.kind === 'video'),
          mixPackage: (await api.listMixPackages(workspacePath))[0],
        };
      }, workspaceDir);

      expect(persisted.packCount).toBeGreaterThanOrEqual(1);
      expect(persisted.firstPackCitationIds.some((id) => id.startsWith('brand-kb:')), JSON.stringify(persisted)).toBe(true);
      expect(persisted.sceneCount).toBeGreaterThanOrEqual(1);
      expect(persisted.firstSceneCitationIds.some((id) => id.startsWith('brand-kb:')), JSON.stringify(persisted)).toBe(true);
      expect(persisted.copiedVideoDraft?.copyCount, JSON.stringify(persisted)).toBeGreaterThanOrEqual(1);
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

      const sceneButton = page.locator('.knowledge-brand-workbench button').filter({ hasText: '生成场景延伸库' }).first();
      await expect(sceneButton).toBeEnabled();
      await sceneButton.click();
      await expect(page.locator('.scene-prompt-workbench')).toBeVisible({ timeout: 20_000 });
      await expect(page.locator('.scene-prompt-scene-list')).toContainText('早餐后便携场景');

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
    await clickButton(page, '复制正文');
    await expect(page.getByRole('button', { name: '已复制' })).toBeVisible();
    });
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});

test('视频复刻三步工作台使用真实 blocked 分支，不伪造视频结果', async ({}, testInfo) => {
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
    await expect(page.getByRole('heading', { name: '视频复刻引擎' })).toBeVisible();
    await expect(page.locator('.video-stage-tabs button')).toHaveCount(3);
    await expect(page.locator('.video-stage-tabs button').nth(0)).toContainText('视频拆解');
    await expect(page.locator('.video-stage-tabs button').nth(1)).toContainText('脚本生成');
    await expect(page.locator('.video-stage-tabs button').nth(2)).toContainText('视频生成');

    await expect(page.getByRole('heading', { name: '原视频导入' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '片段拆解结果' })).toBeVisible();
    await expect(page.locator('.video-dimension-grid button')).toHaveCount(16);
    await expect(page.locator('.video-summary-row')).toContainText('智能拆解');
    await assertVideoWorkbenchLayout(page);

    await clickVideoAction(page, '智能拆解');
    await expect(page.getByText('请先选择本地视频或粘贴参考视频链接')).toBeVisible();
    await expect(page.locator('.video-dimension-grid button.active')).toHaveCount(16);

    await clickVideoStageTab(page, '脚本生成');
    await expect(page.getByRole('heading', { name: '新产品信息' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '新视频脚本' })).toBeVisible();
    await expect(page.locator('.video-product-card input').first()).toHaveValue('新产品');
    await expect(page.locator('.video-upload-callout')).toContainText('上传产品图');
    await clickVideoAction(page, '选择图片');
    await expect(page.locator('.video-upload-callout input[type="checkbox"]')).toBeChecked();
    await assertVideoWorkbenchLayout(page);

    await clickVideoAction(page, '生成复刻脚本');
    await expect(page.getByText('文字模型未配置')).toBeVisible();
    await expect(page.locator('.video-script-card')).toContainText('等待生成新视频脚本');

    await clickVideoStageTab(page, '视频生成');
    await expect(page.getByRole('heading', { name: '生成视频使用的图片' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '生成视频历史' })).toBeVisible();
    await expect(page.locator('.video-material-list')).toContainText('hero-product.png');
    await expect(page.locator('.video-prompt-card')).toContainText('视频提示词');
    await assertVideoWorkbenchLayout(page);

    await clickVideoAction(page, '生成视频队列');
    await expect(page.locator('.result-card.blocked')).toBeVisible();
    await expect(page.locator('.result-card.blocked')).toContainText(/视频生成服务未配置|视频 provider 未配置/);
    await expect(page.locator('.asset-output-card')).toHaveCount(2);
    await expect(page.locator('.asset-output-card').first()).toContainText('队列产物');

    const logs = await page.evaluate(async (workspacePath) => {
      const entries = await window.contentStudio.listGenerationLogs(workspacePath);
      return entries.map((entry) => ({
        kind: entry.kind,
        status: entry.status,
        error: entry.error ?? '',
        assetRefs: Array.isArray(entry.output?.assetRefs) ? entry.output.assetRefs : [],
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
