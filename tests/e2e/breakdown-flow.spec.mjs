import { test, expect, _electron as electron } from '@playwright/test';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const electronExecutable = require('electron');
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const mainEntry = join(projectRoot, 'out/main/index.js');
const resourcesDir = join(projectRoot, 'resources');
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

function startVisionServer() {
  const server = createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk.toString(); });
    request.on('end', () => {
      const analysis = {
        composition: '竖版 4:5，三分法构图，产品位于右下三分之一区域',
        lighting: '早餐桌自然光，暖色调侧光，柔和阴影',
        textArea: '左上角 1/4 区域留白，适合放标题文字',
        style: '手机实拍感，浅景深，细节真实，无过度后期',
        subjectLayout: '产品为视觉焦点，占画面 30%，周围有生活道具',
        background: '木质桌面 + 绿植 + 咖啡杯，营造早餐场景氛围',
        camera: '45度俯拍，f/2.8 浅景深，焦点在产品标签',
        platformFit: '小红书竖版种草图，符合平台 4:5 推荐比例',
        reusableElements: ['三分法构图', '自然光侧光', '生活道具搭配', '浅景深'],
        replacementRules: ['替换竞品为本方产品', '保留构图和光线方案', '更换背景道具为品牌调性'],
        generationControls: ['画幅保持 4:5', '生成 2 张候选图', '写实强度 80%', '产品清晰度优先'],
        risks: ['避免复制竞品包装设计', '不使用竞品 Logo 或可识别元素'],
        prompt: '竖版 4:5，植物星球燕麦奶位于画面右下三分之一，早餐桌自然光暖色调，木质桌面搭配绿植和咖啡杯，左上角留白放标题，手机实拍感，浅景深 f/2.8，焦点在产品标签，细节真实无过度后期。',
        negativePrompt: '竞品 Logo、过度饱和、棚拍感、广角畸变、文字水印',
        qualityChecklist: ['产品清晰可辨', '光线自然', '构图平衡', '留白充足'],
      };
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(analysis));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${addr.port}/v1` });
    });
  });
}

test('拆解素材完整流程 e2e', async ({}, testInfo) => {
  test.setTimeout(120_000);
  if (!existsSync(mainEntry)) throw new Error('请先 npm run build');

  const { server, baseUrl } = await startVisionServer();

  const userDataDir = await mkdtemp(join(tmpdir(), 'cs-breakdown-e2e-'));
  const workspaceDir = await mkdtemp(join(tmpdir(), 'cs-breakdown-ws-'));
  const refImagePath = join(workspaceDir, 'reference-sample.png');
  const productImagePath = join(workspaceDir, 'product-sample.png');
  await writeFile(refImagePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
  await writeFile(productImagePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
  await writeFile(join(userDataDir, 'model-config.json'), JSON.stringify({
    imageApiKeyPlain: 'test-vision-key',
    imageOuterModel: 'test-vision-model',
    imageProvider: 'openai-responses',
    imageProtocol: 'openai-responses',
    updatedAt: new Date().toISOString(),
  }, null, 2));

  const electronApp = await electron.launch({
    executablePath: electronExecutable,
    args: [projectRoot, `--user-data-dir=${userDataDir}`],
    cwd: projectRoot,
    env: {
      ...process.env,
      CONTENT_STUDIO_E2E: '1',
      CONTENT_STUDIO_TEST_SILENT: '1',
      CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY: '0',
      CONTENT_STUDIO_VISION_ENDPOINT: `${baseUrl}/chat/completions`,
      CONTENT_STUDIO_VISION_API_KEY: 'test-vision-key',
      CONTENT_STUDIO_VISION_MODEL: 'test-vision-model',
      CONTENT_STUDIO_RESOURCES_DIR: resourcesDir,
      CONTENT_STUDIO_E2E_ASSET_SELECTIONS: JSON.stringify({
        'product-image': [productImagePath],
        'reference-image': [refImagePath],
      }),
    },
  });

  const page = await electronApp.firstWindow();
  await expect.poll(
    async () => page.evaluate(() =>
      Boolean(window.contentStudio) && Boolean(document.querySelector('.app-shell'))
    ),
    { timeout: 30_000 },
  ).toBe(true);

  // Step 1: 直接导航到拆解素材
  await page.locator('nav button').filter({ hasText: '✂️' }).click();
  await expect(page.locator('.ai-breakdown-shell')).toBeVisible({ timeout: 5000 });

  // 验证空态
  await expect(page.locator('.ai-breakdown-empty-state')).toBeVisible();

  // Step 2: 上传参考素材（e2e 环境自动选择预设图片）
  await page.locator('.ai-breakdown-upload-btn').click();
  await expect(page.locator('.ai-breakdown-source-list')).toBeVisible({ timeout: 10_000 });

  // 填写产品资料并登记
  await page.locator('.ai-breakdown-brief').fill([
    '产品名称：植物星球燕麦奶',
    '卖点：0 蔗糖、膳食纤维丰富',
    '规格：250ml * 12 盒',
  ].join('\n'));
  const registerBtn = page.locator('button').filter({ hasText: '登记资料' });
  await expect(registerBtn).toBeVisible({ timeout: 3000 });
  await registerBtn.click();

  // 确认拆解意图已有默认值
  const intentTextarea = page.locator('.ai-breakdown-intent');
  await expect(intentTextarea).toHaveValue(/拆解参考图/);

  // Step 3: 点击开始拆解（等待按钮 enabled 表示所有条件满足）
  const breakdownBtn = page.locator('button').filter({ hasText: /开始拆解/ }).first();
  await expect(breakdownBtn).toBeEnabled({ timeout: 10_000 });
  await breakdownBtn.click();

  // Step 4: 等待拆解结果
  await expect(page.locator('.ai-breakdown-analysis')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.ai-breakdown-card-grid')).toBeVisible();

  // 验证分析卡片出现（至少有构图和光线）
  const cards = page.locator('.ai-breakdown-card');
  await expect(cards.first()).toBeVisible();
  const cardCount = await cards.count();
  expect(cardCount).toBeGreaterThanOrEqual(2);

  // 验证 Prompt 区域出现
  await expect(page.locator('.ai-breakdown-prompt-textarea')).toBeVisible();
  const promptValue = await page.locator('.ai-breakdown-prompt-textarea').inputValue();
  expect(promptValue.length).toBeGreaterThan(20);

  // 验证生成图片按钮可用
  await expect(page.locator('.ai-breakdown-prompt-footer .ai-breakdown-primary-btn')).toBeEnabled();

  await electronApp.close();
  await new Promise((resolve) => server.close(resolve));
});
