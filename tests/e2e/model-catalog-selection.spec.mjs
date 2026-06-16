import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mainEntry = join(projectRoot, 'out/main/index.js');
const resourcesDir = join(projectRoot, 'resources');

async function launchWithModelConfig(userDataDir) {
  await writeFile(join(userDataDir, 'model-config.json'), JSON.stringify({
    textProtocol: 'openai-chat',
    textApiEndpoint: 'https://text-provider.example.test/v1',
    textApiKeyPlain: 'test-text-key',
    textModel: 'saved-text-model',
    textModels: ['saved-text-model', 'saved-text-backup'],
    imageProvider: 'openai-responses',
    imageProtocol: 'openai-responses',
    imageApiEndpoint: 'https://image-provider.example.test/v1',
    imageApiKeyPlain: 'test-image-key',
    imageModels: ['saved-image-model', 'saved-image-backup'],
    videoProvider: 'video-understanding-openai-compatible',
    videoApiEndpoint: 'https://video-provider.example.test/v1',
    videoApiKeyPlain: 'test-video-key',
    videoModel: 'saved-video-model',
    videoModels: ['saved-video-model', 'saved-video-backup'],
    updatedAt: new Date().toISOString(),
  }, null, 2));

  const electronApp = await electron.launch({
    executablePath: electronExecutable,
    args: [projectRoot, `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
      CONTENT_STUDIO_E2E: '1',
      CONTENT_STUDIO_TEST_SILENT: '1',
      CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY: '1',
      CONTENT_STUDIO_RESOURCES_DIR: resourcesDir,
    },
  });
  const page = await electronApp.firstWindow();
  await expect.poll(
    async () => page.evaluate(() => Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))),
    { message: '等待 Electron preload bridge 和主工作台加载完成', timeout: 30_000 },
  ).toBe(true);
  return { electronApp, page };
}

async function openPlatformSettings(page) {
  const accountEntry = page.locator('.content-studio-platform-account-entry');
  const settingsButton = accountEntry.getByLabel('打开设置');
  await expect(accountEntry).toBeVisible();
  await expect(settingsButton).toBeVisible();
  await settingsButton.click();
  await expect(page.locator('.lime-settings-dialog')).toBeVisible();
}

async function expectPlatformModelCatalogVisible(page) {
  const modelSettings = page.locator('.lime-model-settings');
  await expect(modelSettings).toBeVisible();
  await expect(modelSettings).toContainText('启用的模型');
  await expect(modelSettings).toContainText('添加模型');
  await expect(modelSettings).toContainText('Content Studio 文字');
  await expect(modelSettings).toContainText('Content Studio 图片');
  await expect(modelSettings).toContainText('Content Studio 视频');
  await page.locator('[data-testid="add-model-button"]').click();
  await expect(modelSettings).toContainText('推荐服务');
  await expect(modelSettings).toContainText('自定义供应商');
}

async function expectModelCatalogTabsSingleRow(page) {
  const tabMetrics = await page.locator('.lime-model-tabs').evaluate((tabs) => {
    const tabRect = tabs.getBoundingClientRect();
    const buttonRects = Array.from(tabs.querySelectorAll('button')).map((button) => button.getBoundingClientRect());
    return {
      tabHeight: tabRect.height,
      buttonCount: buttonRects.length,
      rowTops: Array.from(new Set(buttonRects.map((rect) => Math.round(rect.top)))),
    };
  });
  expect(tabMetrics.buttonCount).toBe(5);
  expect(tabMetrics.rowTops).toHaveLength(1);
  expect(tabMetrics.tabHeight).toBeLessThanOrEqual(48);
}

async function openAgentsEntry(page) {
  if (await page.locator('.app-shell').getAttribute('data-sidebar') !== 'expanded') {
    await page.getByRole('button', { name: '展开侧边栏' }).first().click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-sidebar', 'expanded');
  }
  const collapsedAgents = page.locator('.agent-nav-root[aria-expanded="false"]');
  if (await collapsedAgents.count()) {
    await collapsedAgents.first().click();
  }
  const newDialogButton = page.locator('.nav-stack button.agent-nav-action[title="新对话"]').first();
  await expect(newDialogButton, 'agents 新对话入口应存在').toBeVisible();
  await newDialogButton.click();
}

test('模型设置入口使用 lime-desktop-platform 公共 Provider 设置页', async () => {
  test.setTimeout(90_000);
  if (!existsSync(mainEntry)) throw new Error('请先运行 npm run build。');

  const userDataDir = await mkdtemp(join(tmpdir(), 'content-studio-platform-settings-'));
  let electronApp;
  try {
    const launched = await launchWithModelConfig(userDataDir);
    electronApp = launched.electronApp;
    const page = launched.page;

    await openPlatformSettings(page);
    await expect(page.getByRole('button', { name: '内容工厂', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '内容工厂主题', exact: true })).toHaveCount(0);
    await expect(page.locator('.lime-settings-content h1')).toHaveText('通用');
    const settingsFontFamily = await page.evaluate(() => {
      const accountEntry = document.querySelector('.content-studio-platform-account-entry');
      const dialog = document.querySelector('.lime-settings-dialog');
      const navItem = document.querySelector('.lime-settings-nav-item');
      return {
        account: accountEntry ? window.getComputedStyle(accountEntry).fontFamily : '',
        body: window.getComputedStyle(document.body).fontFamily,
        dialog: dialog ? window.getComputedStyle(dialog).fontFamily : '',
        nav: navItem ? window.getComputedStyle(navItem).fontFamily : '',
      };
    });
    expect(settingsFontFamily.account).toContain('Inter');
    expect(settingsFontFamily.dialog).toContain('Inter');
    expect(settingsFontFamily.nav).toBe(settingsFontFamily.dialog);

    const settingsLayout = await page.evaluate(() => {
      const dialog = document.querySelector('.lime-settings-dialog');
      const body = document.querySelector('.lime-settings-body');
      const footer = document.querySelector('.lime-settings-footer');
      if (!dialog || !body || !footer) return null;
      const dialogRect = dialog.getBoundingClientRect();
      const footerRect = footer.getBoundingClientRect();
      const bodyStyle = window.getComputedStyle(body);
      return {
        bodyOverflowY: bodyStyle.overflowY,
        footerBottom: footerRect.bottom,
        dialogBottom: dialogRect.bottom,
        footerVisible: footerRect.bottom <= dialogRect.bottom && footerRect.top >= dialogRect.top,
      };
    });
    expect(settingsLayout).not.toBeNull();
    expect(settingsLayout.bodyOverflowY).toBe('auto');
    expect(settingsLayout.footerVisible).toBe(true);

    const reduceMotionRow = page.locator('.lime-setting-row').filter({ hasText: '减少动画' });
    await reduceMotionRow.locator('.lime-toggle').click();
    await expect(reduceMotionRow.locator('.lime-toggle')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.app-error-banner')).toHaveCount(0);

    await page.getByRole('button', { name: '个性化', exact: true }).click();
    await expect(page.locator('.lime-settings-content h1')).toHaveText('个性化');
    await expect(page.locator('.lime-settings-content')).toContainText('头像与昵称');

    await page.getByRole('button', { name: '主题', exact: true }).click();
    await expect(page.locator('.lime-settings-content h1')).toHaveText('主题');
    await expect(page.locator('.lime-theme-settings')).toContainText('外观模式');
    await page.getByRole('button', { name: '深色' }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
    await page.getByRole('button', { name: /海洋/ }).click();
    await expect(page.locator('.app-shell')).toHaveAttribute('data-color', 'ocean');
    await expect(page.locator('.lime-theme-palette.active')).toContainText('海洋');

    await page.getByRole('button', { name: '关闭设置' }).click();
    await expect(page.locator('.lime-settings-dialog')).toHaveCount(0);

    await openAgentsEntry(page);
    await expect(page.locator('.agents-entry')).toBeVisible();
    await expect(page.locator('.agents-entry .lime-runtime-model-trigger')).toContainText(/saved-text-model|未配置可用模型|未连接 Lime Desktop Platform/);
    await expect(page.locator('.agents-entry .lime-runtime-model-popover')).toHaveCount(0);
    await expect(page.locator('.agents-entry')).not.toContainText('图片生成模型');
    await expect(page.locator('.agents-entry')).not.toContainText('saved-image-model');
    await expect(page.locator('.agents-entry')).not.toContainText('saved-image-backup');

    await openPlatformSettings(page);
    await page.getByRole('button', { name: '模型', exact: true }).click();
    await expect(page.locator('.lime-settings-content h1')).toHaveText('模型');
    await expectPlatformModelCatalogVisible(page);
    await expectModelCatalogTabsSingleRow(page);
    const providerRows = await page.locator('.lime-model-provider-row').allTextContents();
    expect(providerRows.join('\n')).not.toContain('OpenAI Compatible');
    expect(providerRows.join('\n')).not.toContain('Anthropic Compatible');
    expect(providerRows.join('\n')).not.toContain('Local Runtime');
    await page.locator('.lime-model-provider-row').filter({ hasText: 'Content Studio 图片' }).first().click();
    const imageProviderCard = page.locator('[data-testid="provider-setting"]');
    await expect(imageProviderCard).toBeVisible();
    await expect(imageProviderCard.getByRole('button', { name: '删除', exact: true })).toBeVisible();
    const providerTitleMetrics = await imageProviderCard.locator('.lime-model-card-title h2').evaluate((title) => {
      const rect = title.getBoundingClientRect();
      const style = window.getComputedStyle(title);
      return {
        fontSize: Number.parseFloat(style.fontSize),
        titleBottom: rect.bottom,
        cardBottom: title.closest('[data-testid="provider-setting"]')?.getBoundingClientRect().bottom ?? 0,
      };
    });
    expect(providerTitleMetrics.fontSize).toBeLessThanOrEqual(17);
    expect(providerTitleMetrics.titleBottom).toBeLessThan(providerTitleMetrics.cardBottom);
    const baseUrlInput = imageProviderCard.getByLabel('API Base URL');
    await expect(baseUrlInput).toHaveValue('https://image-provider.example.test/v1');
    await baseUrlInput.fill('https://image-provider-edit.example.test/v1');
    await expect(baseUrlInput).toHaveValue('https://image-provider-edit.example.test/v1');
    await page.getByLabel('API 密钥').fill('new-product-app-key');
    await page.locator('.lime-model-add-priority input').fill('new-product-app-model');
    await page.locator('.lime-model-add-priority button').click();
    await page.locator('.lime-model-save-button').click();
    await expect(page.locator('.lime-model-status')).toContainText('当前宿主未接入 settings.saveModel');

    const persisted = await page.evaluate(() => window.contentStudio.getModelConfig());
    expect(persisted.imageModels[0]).toBe('saved-image-model');
    expect(persisted.imageModels).not.toContain('new-product-app-model');

    await page.locator('[data-testid="add-model-button"]').click();
    await page.locator('[data-testid="custom-provider-template-card"], .lime-model-catalog-card.muted').click();
    await expect(page.locator('[data-testid="provider-setting-custom"]')).toBeVisible();
    await expect(page.locator('.app-error-banner')).toHaveCount(0);

    await page.getByRole('button', { name: '账号', exact: true }).click();
    await expect(page.locator('.lime-settings-content h1')).toHaveText('账号');
    await expect(page.locator('.lime-settings-content')).toContainText('smoke@bugu.run');
    await expect(page.locator('.lime-settings-dialog')).not.toContainText('业务设置');

    await page.getByRole('button', { name: '关闭设置' }).click();
    await expect(page.locator('.lime-settings-dialog')).toHaveCount(0);
  } finally {
    await electronApp?.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
  }
});
