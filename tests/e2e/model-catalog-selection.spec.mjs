import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
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

function startModelCatalogServer() {
  const requests = [];
  const models = [
    'claude-remote-text',
    'gpt-remote-text',
    'gpt-remote-text-03',
    'gpt-remote-text-04',
    'gpt-remote-text-05',
    'gpt-remote-text-06',
    'gpt-remote-text-07',
    'gpt-remote-text-08',
    'gpt-remote-text-09',
    'gpt-remote-text-hidden',
    'gpt-image-remote',
    'imagen-remote',
    'veo-remote-video',
    'kling-remote-video',
  ];
  const server = createServer((request, response) => {
    requests.push({
      method: request.method,
      url: request.url,
      authorization: request.headers.authorization ?? '',
    });
    if (request.method !== 'GET' || request.url !== '/v1/models') {
      response.statusCode = 404;
      response.end('not found');
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(JSON.stringify({ data: models.map((id) => ({ id })) }));
  });
  return new Promise((resolveListen) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('无法启动本地模型目录服务。');
      resolveListen({
        server,
        baseUrl: `http://127.0.0.1:${address.port}/v1`,
        requests,
      });
    });
  });
}

async function launchWithModelConfig(userDataDir, endpoint) {
  await writeFile(join(userDataDir, 'model-config.json'), JSON.stringify({
    textProtocol: 'openai-chat',
    textApiEndpoint: endpoint,
    textApiKeyPlain: 'test-text-key',
    textModel: 'saved-text-model',
    textModels: ['saved-text-model'],
    imageProvider: 'openai-responses',
    imageProtocol: 'openai-responses',
    imageApiEndpoint: endpoint,
    imageApiKeyPlain: 'test-image-key',
    imageModels: ['saved-image-model'],
    videoProvider: 'video-understanding-openai-compatible',
    videoApiEndpoint: endpoint,
    videoApiKeyPlain: 'test-video-key',
    videoModel: 'saved-video-model',
    videoModels: ['saved-video-model'],
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

test('远程模型目录分流到文字、图片、视频模型池并支持切换', async () => {
  test.setTimeout(90_000);
  if (!existsSync(mainEntry)) throw new Error('请先运行 npm run build。');

  const { server, baseUrl, requests } = await startModelCatalogServer();
  const userDataDir = await mkdtemp(join(tmpdir(), 'content-studio-model-catalog-'));
  let electronApp;
  try {
    const launched = await launchWithModelConfig(userDataDir, baseUrl);
    electronApp = launched.electronApp;
    const page = launched.page;

    await page.getByLabel('设置').click();
    await expect(page.locator('.settings-modal')).toBeVisible();
    await page.locator('.settings-nav button').filter({ hasText: '模型' }).click();
    await expect(page.locator('.model-config-hero')).toContainText('文字生成');
    await expect(page.locator('.model-config-section')).toHaveCount(1);
    await expect(page.locator('.model-config-section')).toContainText('文字生成');
    await expect(page.locator('.model-config-section')).not.toContainText('图片生成');
    await expect(page.locator('.model-config-section')).not.toContainText('视频理解 / 生成');

    await expect(page.locator('.model-preset-row button').filter({ hasText: 'claude-remote-text' })).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.model-preset-row button').filter({ hasText: 'gpt-image-remote' })).toHaveCount(0);
    await expect(page.locator('.model-preset-row button').filter({ hasText: 'veo-remote-video' })).toHaveCount(0);

    const textSection = page.locator('.model-config-section').filter({ hasText: '文字生成' });
    const hiddenTextPreset = textSection.locator('.model-preset-row button').filter({ hasText: 'gpt-remote-text-hidden' });
    await expect(hiddenTextPreset).toHaveCount(0);
    const expandTextPresetsButton = textSection.getByRole('button', { name: /^显示全部 \d+ 个$/ });
    await expect(expandTextPresetsButton).toBeVisible();
    await expandTextPresetsButton.click();
    await expect(hiddenTextPreset).toBeVisible();
    await textSection.getByRole('button', { name: '收起' }).click();
    await expect(hiddenTextPreset).toHaveCount(0);

    await page.locator('.model-config-section').filter({ hasText: '文字生成' }).locator('select').filter({ hasText: 'claude-remote-text' }).selectOption('gpt-remote-text');
    await expect(page.locator('.model-config-section').filter({ hasText: '文字生成' }).locator('.image-model-priority-item').first()).toContainText('gpt-remote-text');

    await page.locator('.model-list-item').filter({ hasText: '图片生成' }).click();
    await expect(page.locator('.model-config-hero')).toContainText('图片生成');
    await expect(page.locator('.model-list-item').filter({ hasText: '图片生成' })).toHaveClass(/active/);
    await expect(page.locator('.model-config-section')).toHaveCount(1);
    await expect(page.locator('.model-config-section')).toContainText('图片生成');
    await expect(page.locator('.model-config-section')).not.toContainText('文字模型池');
    await expect(page.locator('.model-preset-row button').filter({ hasText: 'gpt-image-remote' })).toBeVisible();

    await page.locator('.model-config-section').filter({ hasText: '图片生成' }).locator('select').filter({ hasText: 'gpt-image-remote' }).selectOption('imagen-remote');
    await expect(page.locator('.model-config-section').filter({ hasText: '图片生成' }).locator('.image-model-priority-item').first()).toContainText('imagen-remote');

    await page.locator('.model-list-item').filter({ hasText: '视频生成' }).click();
    await expect(page.locator('.model-config-hero')).toContainText('视频理解 / 生成');
    await expect(page.locator('.model-list-item').filter({ hasText: '视频生成' })).toHaveClass(/active/);
    await expect(page.locator('.model-config-section')).toHaveCount(1);
    await expect(page.locator('.model-config-section')).toContainText('视频理解 / 生成');
    await expect(page.locator('.model-config-section')).not.toContainText('图片模型优先级');
    await expect(page.locator('.model-preset-row button').filter({ hasText: 'veo-remote-video' })).toBeVisible();

    await page.locator('.model-config-section').filter({ hasText: '视频理解 / 生成' }).locator('select').filter({ hasText: 'veo-remote-video' }).selectOption('kling-remote-video');
    await expect(page.locator('.model-config-section').filter({ hasText: '视频理解 / 生成' }).locator('.image-model-priority-item').first()).toContainText('kling-remote-video');

    await page.locator('.model-list-item').filter({ hasText: '图片生成' }).click();
    await page.locator('.model-config-section').filter({ hasText: '图片生成' }).locator('.model-preset-row button').filter({ hasText: 'gpt-image-remote' }).click();
    await expect(page.locator('.model-config-section').filter({ hasText: '图片生成' }).locator('.image-model-priority-item').first()).toContainText('gpt-image-remote');

    await page.getByRole('button', { name: '保存配置' }).click();
    await expect.poll(
      async () => page.evaluate(() => window.contentStudio.getModelConfig().then((config) => config.imageModels[0])),
      { message: '等待模型配置保存完成', timeout: 20_000 },
    ).toBe('gpt-image-remote');
    await page.getByRole('button', { name: '完成' }).click();
    await expect(page.locator('.settings-modal')).toHaveCount(0);

    const showcaseImageModelSelect = page.locator('.showcase-page-frame select').filter({ hasText: 'gpt-image-remote' }).first();
    await expect(showcaseImageModelSelect).toHaveValue('gpt-image-remote');
    await showcaseImageModelSelect.selectOption('imagen-remote');
    await expect(showcaseImageModelSelect).toHaveValue('imagen-remote');

    await page.getByRole('button', { name: '图片生成' }).click();
    await expect(page.locator('.params-panel')).toBeVisible();
    if (await page.locator('.params-panel.collapsed').count()) {
      await page.getByRole('button', { name: '展开右侧参数栏' }).click();
    }
    await expect(page.locator('.params-panel')).not.toHaveClass(/collapsed/);
    const paramsPanelValues = await page.evaluate(() => {
      const values = {};
      document.querySelectorAll('.params-panel label').forEach((label) => {
        const name = label.querySelector('span')?.textContent?.trim();
        const select = label.querySelector('select');
        if (name && select instanceof HTMLSelectElement) values[name] = select.value;
      });
      return values;
    });
    expect(paramsPanelValues).toMatchObject({
      文字模型: 'gpt-remote-text',
      图片模型: 'imagen-remote',
      视频模型: 'kling-remote-video',
    });

    const persisted = await page.evaluate(() => window.contentStudio.getModelConfig());
    expect(persisted.textModel).toBe('gpt-remote-text');
    expect(persisted.textModels[0]).toBe('gpt-remote-text');
    expect(persisted.imageModels[0]).toBe('gpt-image-remote');
    expect(persisted.videoModel).toBe('kling-remote-video');
    expect(persisted.videoModels[0]).toBe('kling-remote-video');
    expect(requests.some((request) => request.url === '/v1/models')).toBe(true);
  } finally {
    await electronApp?.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
