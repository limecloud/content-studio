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
const electronArgs = process.env.CI === 'true' && process.platform === 'linux' ? ['--no-sandbox'] : [];
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

async function launchContentStudio(testInfo) {
  if (!existsSync(mainEntry)) {
    throw new Error(`缺少 ${mainEntry}，请先运行 npm run build。`);
  }

  const userDataDir = await mkdtemp(join(tmpdir(), 'content-studio-playwright-user-'));
  const workspaceDir = await mkdtemp(join(tmpdir(), 'content-studio-playwright-workspace-'));
  const e2eProductAssetPath = join(workspaceDir, 'hero-product.png');
  await writeFile(e2eProductAssetPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
  const diagnostics = [];

  const electronApp = await electron.launch({
    executablePath: electronExecutable,
    args: [projectRoot, `--user-data-dir=${userDataDir}`, ...electronArgs],
    cwd: projectRoot,
    env: {
      ...process.env,
      ELECTRON_ENABLE_LOGGING: '1',
      CONTENT_STUDIO_E2E: '1',
      CONTENT_STUDIO_E2E_ASSET_SELECTIONS: JSON.stringify({ 'product-image': [e2eProductAssetPath] }),
      CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY: '1',
      CONTENT_STUDIO_RESOURCES_DIR: resourcesDir,
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
    async () => page.evaluate(() => Boolean(window.contentStudio) && document.body.innerText.includes('布谷AI 内容工厂')),
    { message: '等待 Electron preload bridge 和主工作台加载完成', timeout: 20_000 },
  ).toBe(true);

  return { electronApp, page, userDataDir, workspaceDir, e2eProductAssetPath, diagnostics, testInfo };
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

async function withContentStudio(testInfo, callback) {
  const app = await launchContentStudio(testInfo);
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

test('真实 Electron 壳层、preload bridge、导航和详情弹窗可用', async ({}, testInfo) => {
  await withContentStudio(testInfo, async ({ electronApp, page }) => {
    await expect(page).toHaveTitle(/布谷AI/);
    await expect(page.getByText(/布谷AI 内容工厂/i)).toBeVisible();
    await expect(page.getByText('AI 对话')).toHaveCount(0);
    await clickButton(page, '图片生成');
    await expect(page.locator('.image-workbench-layout')).toBeVisible();
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
    await clickButton(page, '内容助手');
    await expect(page.getByRole('heading', { name: '内容工厂助手' })).toBeVisible();
    await expect(page.locator('.ai-command-grid article').filter({ hasText: '@图片' })).toBeVisible();
    await page.locator('.ai-chat-shell textarea').fill('@图片 生成一张白底护肤品主图，产品居中，干净高级。');
    await clickButton(page, '发送到图片生成');
    await expect(page.locator('.image-workbench-layout')).toBeVisible();
    await expect(page.locator('.image-prompt-panel textarea')).toHaveValue('生成一张白底护肤品主图，产品居中，干净高级。');
    await page.locator('.image-prompt-panel textarea').fill('');
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
    await page.locator('.params-panel-tabs button').filter({ hasText: '日志' }).click();
    await expect(page.getByRole('heading', { name: '最近生成日志' })).toBeVisible();
    await expect(page.getByText('生成图片、文章或视频后，最近记录会在这里显示。')).toBeVisible();
    await page.locator('.params-panel-tabs button').filter({ hasText: '参数' }).click();
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

    await expect(page.locator('.mode-card')).toBeVisible();
    await page.locator('.mode-card button').filter({ hasText: '批量' }).click();
    await expect(page.getByText('批量处理 Shell')).toBeVisible();
    await expect(page.getByRole('button', { name: '批量队列后续接入' })).toBeDisabled();
    await page.locator('.mode-card button').filter({ hasText: '单次' }).click();

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
    await expect(page.getByRole('heading', { name: '正文 / 发布检查' })).toBeVisible();
    await clickButton(page, '成型知识库');
    await expect(page.getByRole('heading', { name: '引用检索' })).toBeVisible();
    await clickButton(page, '素材库 / 历史');
    await expect(page.getByRole('heading', { name: '生成历史 / 素材库' })).toBeVisible();
    await clickButton(page, '能力管理');
    await expect(page.getByRole('heading', { name: '内容生成能力' })).toBeVisible();

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
      const stage = document.querySelector('.stage');
      const params = document.querySelector('.params-panel');
      if (!stage || !params) return { ok: false, reason: 'missing scroll containers' };
      stage.scrollTop = stage.scrollHeight;
      params.scrollTop = params.scrollHeight;
      return {
        ok: stage.scrollHeight > stage.clientHeight && stage.scrollTop > 0,
        stage: { scrollHeight: stage.scrollHeight, clientHeight: stage.clientHeight, scrollTop: stage.scrollTop },
        params: { scrollHeight: params.scrollHeight, clientHeight: params.clientHeight, scrollTop: params.scrollTop },
      };
    });
    expect(scrollState.ok, JSON.stringify(scrollState)).toBe(true);
  });
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
        async () => page.evaluate(() => Boolean(window.contentStudio) && document.body.innerText.includes('布谷AI 内容工厂')),
        { message: '等待设置写入后重新加载工作台', timeout: 20_000 },
      ).toBe(true);

      await clickButton(page, '图片生成');
      await expect(page.getByText('图片预览大盘区 - 待命')).toBeVisible();
      await page.locator('.image-prompt-panel textarea').fill('生成一张白底护肤品主图，产品居中，干净高级。');
      await clickButton(page, '启动渲染引擎');
      await expect(page.locator('.image-preview-loading')).toBeVisible();
      await expect(page.locator('.image-generated-card')).toHaveCount(1, { timeout: 20_000 });
      await expect(page.locator('.image-generated-frame img')).toBeVisible();
      await expect(page.locator('.asset-output-card')).toHaveCount(0);
      await expect(page.getByText('单击全屏放大')).toBeVisible();
      await page.locator('.image-prompt-panel textarea').fill('@图片');
      await expect(page.locator('.image-mention-menu')).toBeVisible();
      await expect(page.locator('.image-mention-option')).toContainText('生成图 1');
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

      await page.locator('.image-generated-card').first().hover();
      await page.locator('.image-generated-actions button').filter({ hasText: '详情' }).click();
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
      await expect(page.locator('.image-preview-log')).toContainText('图片素材生成结果');
      await page.locator('.image-preview-log-actions button').filter({ hasText: '详情' }).first().click();
      await expect(page.getByRole('dialog', { name: '生成日志详情' })).toBeVisible();
      await expect(page.locator('.image-log-detail-grid')).toContainText('test-image-model');
      await expect(page.locator('.image-result-prompt textarea')).toHaveValue(/护肤品主图/);
      await expect(page.locator('.image-result-param-grid')).toContainText('模板：电商白底主图');
      await clickButton(page, '复用参数');
      await expect(page.getByRole('dialog', { name: '生成日志详情' })).toHaveCount(0);
      await expect(page.locator('.image-prompt-panel textarea')).toHaveValue(/护肤品主图/);

      await page.locator('.image-prompt-panel textarea').fill('');
      await clickButton(page, '素材库 / 历史');
      await expect(page.getByRole('heading', { name: '生成历史 / 素材库' })).toBeVisible();
      const imageHistoryCard = page.locator('.log-card').filter({ hasText: '图片素材生成结果' }).first();
      await expect(imageHistoryCard).toContainText('test-image-model');
      await imageHistoryCard.getByRole('button', { name: '详情' }).click();
      await expect(page.getByRole('dialog', { name: '生成历史详情' })).toBeVisible();
      await expect(page.locator('.asset-log-detail-grid')).toContainText('图片');
      await expect(page.locator('.asset-log-detail-grid')).toContainText('test-image-model');
      await expect(page.locator('.asset-log-detail-grid')).toContainText('电商白底主图');
      await expect(page.locator('.image-result-prompt textarea')).toHaveValue(/护肤品主图/);
      await expect(page.locator('.asset-log-json-card').first()).toContainText('generationMode');
      await clickButton(page, '复用图片参数');
      await expect(page.getByRole('dialog', { name: '生成历史详情' })).toHaveCount(0);
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
