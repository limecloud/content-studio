import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';

import { ArticleGenerationService } from '../../src/main/services/articleGenerationService.ts';
import { AgentPromptSessionStore } from '../../src/main/services/agentPromptSessionStore.ts';
import { AssetReviewStore } from '../../src/main/services/assetReviewStore.ts';
import { AutoUpdateService } from '../../src/main/services/autoUpdateService.ts';
import { BrandKnowledgeBaseStore } from '../../src/main/services/brandKnowledgeBaseStore.ts';
import { ClaudePromptAgentService } from '../../src/main/services/claudePromptAgentService.ts';
import { GenerationLogStore } from '../../src/main/services/generationLogStore.ts';
import { ImageSkillGenerationService } from '../../src/main/services/imageSkillGenerationService.ts';
import { InputSourceStore } from '../../src/main/services/inputSourceStore.ts';
import { IpKnowledgeBaseStore } from '../../src/main/services/ipKnowledgeBaseStore.ts';
import { KnowledgeBaseStore } from '../../src/main/services/knowledgeBaseStore.ts';
import { MixPackageStore } from '../../src/main/services/mixPackageStore.ts';
import { OverlayCardStore } from '../../src/main/services/overlayCardStore.ts';
import { PlatformDraftStore } from '../../src/main/services/platformDraftStore.ts';
import { PromptPackService } from '../../src/main/services/promptPackService.ts';
import { PromptDraftStore } from '../../src/main/services/promptDraftStore.ts';
import { ReferenceReverseService } from '../../src/main/services/referenceReverseService.ts';
import { SceneLibraryStore } from '../../src/main/services/sceneLibraryStore.ts';
import { TextGenerationService } from '../../src/main/services/textGenerationService.ts';
import { VideoWorkflowService } from '../../src/main/services/videoWorkflowService.ts';
import { WorkflowEngine } from '../../src/main/services/workflowEngine.ts';
import { WorkflowStore } from '../../src/main/services/workflowStore.ts';
import { buildClaudeSubprocessEnv, resolveAsarUnpackedPath } from '../../src/main/services/claudeSdkRuntime.ts';
import { getOemRuntimeConfig } from '../../src/main/services/oemRuntimeConfig.ts';
import { MediaProvider } from '../../src/main/providers/mediaProvider.ts';
import { formatImageTemplateInputs, formatImageTemplatePromptContext } from '../../src/shared/imageTemplates.ts';
import { isReusablePromptInputSource, isReusableWorkflowInputSource } from '../../src/shared/inputSourcePolicy.ts';
import { buildProductBriefPromptPlan, structureProductBriefSources } from '../../src/shared/productBrief.ts';
import { clusterUserFeedbackSources } from '../../src/shared/userFeedbackInsights.ts';
import { buildScenePromptGroupContent } from '../../src/shared/scenePromptComposer.ts';
import { extractGeneratedAssetRefsFromLog, extractLocalRefsFromLog } from '../../src/renderer/src/app/formatters.ts';
import { SkillManager } from '../../src/main/services/skillManager.ts';
import { buildBusinessAcceptanceReport, loadWorkspaceAcceptanceInput } from '../../scripts/v2-business-acceptance.mjs';
import { buildProviderCheckReport, hasProviderStrictFailure } from '../../scripts/v2-provider-check.mjs';
import { buildV2UxCopyAudit } from '../../scripts/v2-ux-copy-audit.mjs';

const execFileAsync = promisify(execFile);
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const TEST_VIDEO = Buffer.from('content-studio-test-video');
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

async function withWorkspace(run) {
  const workspacePath = await mkdtemp(join(tmpdir(), 'content-studio-functional-'));
  try {
    await mkdir(workspacePath, { recursive: true });
    await run(workspacePath);
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
}

test('skill 安装包支持根目录直接包含 SKILL.md', async () => {
  await withWorkspace(async (workspacePath) => {
    const packagePath = join(workspacePath, 'flat-skill.skill');
    await writeFile(packagePath, createStoredZip([
      {
        name: 'SKILL.md',
        data: [
          '---',
          'name: Flat Skill',
          'description: 根目录直接包含 SKILL.md 的安装包。',
          '---',
          '',
          '# Flat Skill',
          '',
          '用于验证平铺安装包兼容。',
          '',
        ].join('\n'),
      },
      {
        name: 'references/example.md',
        data: '# Example\n',
      },
      {
        name: '__MACOSX/._SKILL.md',
        data: '',
      },
    ]));

    const manager = new SkillManager();
    const preview = await manager.previewPackage(packagePath, workspacePath);
    assert.equal(preview.slug, 'flat-skill');
    assert.equal(preview.rootDir, '');
    assert.equal(preview.selectedPath, 'SKILL.md');
    assert.equal(await manager.readPackageFile(packagePath, 'references/example.md'), '# Example\n');

    const result = await manager.installPackage(packagePath, workspacePath);
    assert.equal(result.skill.slug, 'flat-skill');
    assert.equal(result.skill.metadata.name, 'Flat Skill');
    assert.ok(existsSync(join(workspacePath, '.bugu', 'skills', 'flat-skill', 'SKILL.md')));
    assert.ok(existsSync(join(workspacePath, '.bugu', 'skills', 'flat-skill', 'references', 'example.md')));
  });
});

test('Prompt 草案物化 Skill 时可以写入真实执行规范', async () => {
  await withWorkspace(async (workspacePath) => {
    const manager = new SkillManager();
    const result = await manager.createProjectSkill({
      workspacePath,
      slug: 'prompt-materialized-skill',
      name: 'Prompt 物化 Skill',
      description: '由 PromptDraft 物化的本地 skill。',
      instructions: [
        '### 执行规范',
        '根据品牌知识库和用户意图生成可追溯 Prompt。',
        '',
        '### 输出约束',
        '- 不编造功效和案例。',
      ].join('\n'),
    });

    assert.equal(result.skill.slug, 'prompt-materialized-skill');
    assert.equal(result.skill.metadata.name, 'Prompt 物化 Skill');
    const content = await readFile(join(workspacePath, '.bugu', 'skills', 'prompt-materialized-skill', 'SKILL.md'), 'utf-8');
    assert.match(content, /根据品牌知识库和用户意图生成可追溯 Prompt/);
    assert.match(content, /不编造功效和案例/);
  });
});

class FakeTextGenerationService {
  calls = [];

  async generateJson(input) {
    this.calls.push(input);
    let task;
    try {
      task = JSON.parse(input.prompt).task;
    } catch {
      task = undefined;
    }
    if (!task && typeof input.prompt === 'string' && input.prompt.includes('下游用途：')) {
      return {
        model: input.model || 'fake-claude-sonnet',
        rawText: '{}',
        value: {
          title: '多轮 Prompt 草稿',
          prompt: '围绕用户意图与输入源生成可执行 Prompt。',
          followUpQuestions: ['请补充平台和画幅。'],
          sourceWarnings: ['仅基于输入源摘录，不扩写功效。'],
          qualityChecklist: ['人物、场景、动作、镜头清楚'],
        },
      };
    }
    if (task === 'generate_prompt_pack') {
      return {
        model: input.model || 'fake-claude-sonnet',
        rawText: '{}',
        value: {
          name: '功能测试品牌提示词包',
          brandVoice: '真实、克制、可追溯，不夸大效果。',
          visualStyle: '干净电商质感，产品主体清晰，保留生活化场景。',
          sellingPointRules: ['先讲场景再讲卖点', '所有收益回到知识引用', '避免绝对化表达'],
          complianceBoundaries: ['不承诺疗效', '不做无依据对比'],
          platformConstraints: ['公众号完整论证', '小红书真实体验', '详情页强调视觉证据'],
          imagePromptFragments: ['自然光厨房场景', '产品主体清晰', '少字高可信'],
          videoPromptFragments: ['开头痛点', '中段展示使用', '结尾给行动提示'],
        },
      };
    }
    if (task === 'generate_brand_knowledge_base') {
      return {
        model: input.model || 'fake-claude-sonnet',
        rawText: '{}',
        value: {
          title: '便携条包品牌知识库',
          brandVoice: '真实、克制、可追溯，不夸大效果。',
          audience: '早餐后和办公室用户',
          productFacts: ['便携条包', '早餐后或办公室抽屉'],
          coreSellingPoints: ['降低坚持门槛', '随手可放'],
          complianceBoundaries: ['不承诺治疗', '不写绝对化收益', '不做无依据背书'],
          sceneSeeds: ['早餐后', '办公室抽屉'],
          promptFragments: ['真实生活场景', '自然光', '少字高可信'],
        },
      };
    }
    if (task === 'generate_ip_knowledge_base') {
      return {
        model: input.model || 'fake-claude-sonnet',
        rawText: '{}',
        value: {
          title: '嘉文老师 IP 知识库',
          layers: {
            identity: '身份锚定',
            values: '价值观立场',
            language: '语言风格',
            methodology: '判断方法',
            materials: '内容素材',
            engine: '创作引擎',
          },
          extensionScenes: ['口播', '朋友圈', '私域回复'],
          missingLayers: [],
        },
      };
    }
    if (task === 'generate_scene_cards') {
      return {
        model: input.model || 'fake-claude-sonnet',
        rawText: '{}',
        value: {
          cards: [1, 2, 3].map((index) => ({
            title: `办公室早餐场景 ${index}`,
            audience: '忙碌上班族',
            painPoint: '早餐后健康管理难坚持',
            usageScene: '办公室抽屉和早餐桌',
            visualComposition: '产品居中，真实台面，自然光',
            sellingPoint: '便携条包，降低坚持门槛',
            voiceoverDirection: '像真实使用者解释，不夸张',
            imageMaterialSuggestion: '生成办公室早餐电商场景图',
            videoMaterialSuggestion: '生成 15 秒早餐后使用短视频',
          })),
        },
      };
    }
    if (task === 'generate_article') {
      return {
        model: input.model || 'fake-claude-sonnet',
        rawText: '{}',
        value: {
          titleCandidates: ['把产品讲成人话', '从使用场景开始做内容', '知识库驱动的内容草稿'],
          outline: ['痛点', '事实引用', '场景', '合规边界', '行动建议'],
          summary: '基于知识库引用生成可复核文章。',
          markdown: '# 把产品讲成人话\n\n引用知识库事实 [1]，再进入场景化表达。',
          publishCheck: [
            { level: 'info', message: '已包含事实引用。' },
            { level: 'warning', message: '发布前复核合规边界。' },
          ],
        },
      };
    }
    if (task === 'generate_video_script') {
      return {
        model: input.model || 'fake-claude-sonnet',
        rawText: '{}',
        value: {
          title: '早餐后场景短视频脚本',
          script: '镜头 1：痛点。\n镜头 2：使用。\n镜头 3：行动提示。',
          storyboard: [1, 2, 3].map((shot) => ({
            shot,
            duration: '5s',
            visual: `镜头 ${shot} 的真实使用画面`,
            voiceover: `镜头 ${shot} 的自然口播`,
            subtitle: `字幕 ${shot}`,
            rhythm: shot === 1 ? '快节奏钩子' : '中速解释',
          })),
          videoPrompt: '4:5，15 秒，真实产品使用画面。',
          publishCheck: [
            { level: 'info', message: '脚本已绑定知识引用。' },
            { level: 'warning', message: '上线前复核素材授权。' },
          ],
        },
      };
    }
    if (task === 'generate_image_skill') {
      return {
        model: input.model || 'fake-claude-sonnet',
        rawText: '{}',
        value: {
          id: 'xiaohongshu-skincare-cover',
          name: '小红书护肤封面',
          version: '1.0.0',
          icon: '🧴',
          category: '社媒',
          description: '生成高端护肤品小红书封面图。',
          config: { defaultRatio: '3:4', defaultCount: 1 },
          prompts: {
            system: '你是专业的小红书护肤品封面图片提示词专家。请根据产品名称、卖点、目标人群和风格偏好，生成适合真实商业投放的图片提示词。要求画面主体清晰、包装可辨识、背景与护肤场景一致，避免夸大功效、医疗暗示和不可读文字。输出时要把构图、光线、材质、颜色、镜头语言和合规边界写清楚。',
            enhance: 'premium skincare, clean composition, soft daylight, commercial photography',
            negative: 'medical claims, messy text, watermark, distorted packaging',
          },
          variables: [
            { key: 'productName', label: '产品名称', type: 'text', required: true, placeholder: '例如：多肽精华' },
            { key: 'style', label: '风格', type: 'select', options: ['清透', '高级'], default: '高级' },
          ],
        },
      };
    }
    throw new Error(`未覆盖的测试任务：${task}`);
  }
}

class FakeClaudePromptAgentService {
  draftCalls = [];
  refineCalls = [];

  async generatePromptDraft(input) {
    this.draftCalls.push(input);
    return {
      title: 'Claude 会话草稿',
      content: [
        'Claude 会话草稿',
        '',
        `模型：${input.textModel || 'claude-sonnet-4-5'}`,
        '',
        'Prompt 正文：',
        '围绕用户意图与输入源生成可执行 Prompt。',
      ].join('\n'),
      note: `Claude SDK 会话草稿：${input.textModel || 'claude-sonnet-4-5'}`,
      model: input.textModel || 'claude-sonnet-4-5',
      protocol: 'claude-sdk',
    };
  }

  async generateRefinedPrompt(input) {
    this.refineCalls.push(input);
    return {
      content: [
        input.previousContent,
        '',
        '本轮调整：',
        input.adjustment,
      ].join('\n'),
      note: `Claude SDK 多轮调整：${input.textModel || 'claude-sonnet-4-5'}`,
      model: input.textModel || 'claude-sonnet-4-5',
      protocol: 'claude-sdk',
    };
  }
}

const citation = {
  knowledgeBaseId: 'product-demo',
  sectionId: 'product-1',
  title: '示例产品 / 产品',
  sectionType: 'product',
  excerpt: '示例产品主打清晰成分、便携条包、适合早餐后或办公场景使用。',
};


test('图片模板参数会格式化为可读中文字段', () => {
  const formatted = formatImageTemplateInputs('场景图', {
    productName: '测试产品',
    sceneType: '厨房餐厅',
  });
  assert.match(formatted, /产品名称: 测试产品/);
  assert.match(formatted, /场景选择: 厨房餐厅/);

  const promptContext = formatImageTemplatePromptContext('美食摄影');
  assert.match(promptContext, /Skill System Prompt/);
  assert.match(promptContext, /SMART INGREDIENT MATCHING TABLE/);
  assert.doesNotMatch(promptContext, new RegExp(`${['光', '核'].join('')}|${['g', 'uanghe'].join('')}`, 'i'));
});

test('生成素材引用只取输出产物，不把输入参考图当成素材库资产', () => {
  const log = {
    kind: 'image',
    status: 'succeeded',
    input: {
      productImageRefs: ['/tmp/product.png'],
      referenceImageRefs: ['/tmp/reference.png'],
    },
    output: {
      assetRefs: ['/tmp/generated-1.png', 'https://cdn.example.com/generated-remote.png'],
    },
    artifactRefs: ['/tmp/generated-1.png', '/tmp/generated-2.png'],
  };

  assert.deepEqual(extractGeneratedAssetRefsFromLog(log), ['/tmp/generated-1.png', '/tmp/generated-2.png']);
  assert.deepEqual(extractLocalRefsFromLog(log), ['/tmp/product.png', '/tmp/reference.png', '/tmp/generated-1.png', '/tmp/generated-2.png']);
});

test('AI 创建图片技能会生成当前内容工厂可用的模板配置', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const imageSkills = new ImageSkillGenerationService(text);
    const result = await imageSkills.generate({
      workspacePath,
      description: '创建一个小红书护肤品封面技能，适合高端护肤品牌种草。',
    });

    assert.equal(result.model, 'fake-claude-sonnet');
    assert.equal(result.template.id, 'xiaohongshu-skincare-cover');
    assert.equal(result.template.name, '小红书护肤封面');
    assert.equal(result.template.author, getOemRuntimeConfig().shortName);
    assert.equal(result.template.defaultRatio, '3:4');
    assert.equal(result.template.defaultCount, 1);
    assert.equal(result.template.fields.length, 2);
    assert.deepEqual(result.template.fields.map((field) => field.key), ['productName', 'style']);
    assert.equal(result.template.fields[1].kind, 'single');
    assert.match(result.template.prompts.system, /护肤品封面图片提示词专家/);
    assert.doesNotMatch(JSON.stringify(result.template), new RegExp(`${['光', '核'].join('')}|${['g', 'uanghe'].join('')}`, 'i'));
    assert.equal(JSON.parse(text.calls.at(-1).prompt).task, 'generate_image_skill');
  });
});

test('本地图片技能 JSON 可以导入并归一化为模板配置', async () => {
  await withWorkspace(async (workspacePath) => {
    const skillPath = join(workspacePath, 'imported-image.skill.json');
    await writeFile(skillPath, JSON.stringify({
      id: 'imported-food-cover',
      name: '导入美食封面',
      version: '2.0.0',
      author: '第三方',
      icon: '🍜',
      category: '美食',
      description: '生成餐饮品牌社媒封面。',
      config: { defaultRatio: '4:5', defaultCount: 2 },
      prompts: {
        system: '你是专业餐饮摄影图片提示词专家。请根据菜品名称、餐厅定位和用户补充需求生成适合社媒封面的图片提示词，突出真实食材、自然光、热气、餐具、背景氛围和商业可用性，避免夸张文字、低清晰度、水印和不真实摆盘。',
        enhance: 'food photography, warm light, appetizing, commercial cover',
        negative: 'watermark, low quality, messy plate',
      },
      variables: [
        { key: 'foodName', label: '菜品名称', type: 'text', required: true, placeholder: '例如：牛肉面' },
        { key: 'scene', label: '拍摄场景', type: 'select', options: ['餐桌', '外卖包装'] },
      ],
    }), 'utf-8');

    const imageSkills = new ImageSkillGenerationService(new FakeTextGenerationService());
    const result = await imageSkills.importFromFile(skillPath);

    assert.equal(result.model, 'local-json');
    assert.equal(result.template.name, '导入美食封面');
    assert.equal(result.template.author, getOemRuntimeConfig().shortName);
    assert.equal(result.template.defaultRatio, '4:5');
    assert.equal(result.template.defaultCount, 2);
    assert.deepEqual(result.template.fields.map((field) => field.kind), ['text', 'single']);
    assert.match(result.rawText, /imported-food-cover/);
  });
});

test('更新检查在品牌 API 和静态清单 404 时回退到 GitHub Release', async () => {
  const previousApiUrl = process.env.CONTENT_STUDIO_UPDATE_API_URL;
  const previousManifestUrl = process.env.CONTENT_STUDIO_UPDATE_MANIFEST_URL;
  const previousReleaseApiUrl = process.env.CONTENT_STUDIO_GITHUB_RELEASE_API_URL;
  const previousBrandId = process.env.CONTENT_STUDIO_BRAND_ID;
  const requests = [];
  const server = createServer((request, response) => {
    requests.push(request.url);
    if (request.url === '/api/latest' || request.url === '/static/latest.json') {
      response.statusCode = 404;
      response.end('not found');
      return;
    }
    if (request.url === '/github/latest') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({
        tag_name: 'v0.10.0',
        html_url: 'https://github.com/limecloud/content-studio/releases/tag/v0.10.0',
        published_at: '2026-05-22T11:30:27Z',
        assets: [
          {
            name: 'bugu-0.10.0-linux-x86_64.AppImage',
            size: 266502323,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/bugu-0.10.0-linux-x86_64.AppImage',
          },
          {
            name: 'bugu-0.10.0-mac-arm64.dmg',
            size: 182018032,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/bugu-0.10.0-mac-arm64.dmg',
          },
          {
            name: 'bugu-0.10.0-win-x64.exe',
            size: 151754456,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/bugu-0.10.0-win-x64.exe',
          },
          {
            name: 'seenx-0.10.0-linux-x86_64.AppImage',
            size: 265497525,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/seenx-0.10.0-linux-x86_64.AppImage',
          },
          {
            name: 'seenx-0.10.0-mac-arm64.dmg',
            size: 179065910,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/seenx-0.10.0-mac-arm64.dmg',
          },
          {
            name: 'seenx-0.10.0-win-x64.exe',
            size: 151036537,
            browser_download_url: 'https://github.com/limecloud/content-studio/releases/download/v0.10.0/seenx-0.10.0-win-x64.exe',
          },
        ],
      }));
      return;
    }
    response.statusCode = 500;
    response.end('unexpected request');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    process.env.CONTENT_STUDIO_UPDATE_API_URL = `${baseUrl}/api/latest`;
    process.env.CONTENT_STUDIO_UPDATE_MANIFEST_URL = `${baseUrl}/static/latest.json`;
    process.env.CONTENT_STUDIO_GITHUB_RELEASE_API_URL = `${baseUrl}/github/latest`;
    process.env.CONTENT_STUDIO_BRAND_ID = 'bugu';

    const settings = {
      async readView() {
        return {
          hasAnthropicApiKey: false,
          apiKeyStorage: 'none',
          autoUpdateEnabled: true,
        };
      },
      async setAutoUpdateEnabled() { return this.readView(); },
      async setLastUpdateCheckAt() { return this.readView(); },
    };
    const mainWindow = {
      isDestroyed: () => false,
      webContents: {
        isDestroyed: () => false,
        send: () => undefined,
      },
    };

    const updates = new AutoUpdateService(settings, mainWindow);
    const state = await updates.checkForUpdates({ manual: true });

    assert.deepEqual(requests, ['/api/latest', '/static/latest.json', '/github/latest']);
    assert.equal(state.status, 'update-available');
    assert.equal(state.latestVersion, '0.10.0');
    assert.equal(state.sourceLabel, 'GitHub Release');
    assert.match(state.asset?.fileName ?? '', /^bugu-0\.10\.0-/);
    assert.doesNotMatch(state.asset?.fileName ?? '', /^seenx-/);
    assert.match(state.downloadUrl ?? '', /\/bugu-0\.10\.0-/);

    process.env.CONTENT_STUDIO_BRAND_ID = 'seenx';
    const seenxState = await new AutoUpdateService(settings, mainWindow).checkForUpdates({ manual: true });
    assert.equal(seenxState.sourceLabel, 'GitHub Release');
    assert.match(seenxState.asset?.fileName ?? '', /^seenx-0\.10\.0-/);
    assert.doesNotMatch(seenxState.asset?.fileName ?? '', /^bugu-/);
    assert.match(seenxState.downloadUrl ?? '', /\/seenx-0\.10\.0-/);
  } finally {
    if (previousApiUrl === undefined) delete process.env.CONTENT_STUDIO_UPDATE_API_URL;
    else process.env.CONTENT_STUDIO_UPDATE_API_URL = previousApiUrl;
    if (previousManifestUrl === undefined) delete process.env.CONTENT_STUDIO_UPDATE_MANIFEST_URL;
    else process.env.CONTENT_STUDIO_UPDATE_MANIFEST_URL = previousManifestUrl;
    if (previousReleaseApiUrl === undefined) delete process.env.CONTENT_STUDIO_GITHUB_RELEASE_API_URL;
    else process.env.CONTENT_STUDIO_GITHUB_RELEASE_API_URL = previousReleaseApiUrl;
    if (previousBrandId === undefined) delete process.env.CONTENT_STUDIO_BRAND_ID;
    else process.env.CONTENT_STUDIO_BRAND_ID = previousBrandId;
    await new Promise((resolve) => server.close(resolve));
  }
});

test('内容工厂文字主链可以生成提示词包、场景卡、文章和视频脚本', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const promptPacks = new PromptPackService(logs, text);
    const scenes = new SceneLibraryStore(logs, promptPacks, text);
    const articles = new ArticleGenerationService(logs, text);
    const videos = new VideoWorkflowService(logs, text);

    const pack = await promptPacks.generate({
      workspacePath,
      citations: [citation],
      inputSourceIds: ['input-source-brand-001'],
      name: '测试提示词包',
    });
    assert.equal(pack.brandVoice.includes('克制'), true);

    const cards = await scenes.generate({ workspacePath, promptPackId: pack.id, citations: [citation], count: 3 });
    assert.equal(cards.length, 3);
    assert.equal(cards[0].promptPackId, pack.id);
    assert.deepEqual(cards[0].inputSourceIds, ['input-source-brand-001']);

    const article = await articles.generate({
      workspacePath,
      articleType: 'wechat-longform',
      platform: '公众号',
      audience: '真实用户',
      topic: '产品内容工程化',
      tone: '自然可信',
      length: 'medium',
      citations: [citation],
      promptPackId: pack.id,
      sceneCardIds: cards.map((card) => card.id),
      assetRefs: [],
      selectedSkillSlugs: ['article-drafter'],
      params: { textModel: 'fake-claude-sonnet' },
    });
    assert.match(article.markdown, /# 把产品讲成人话/);

    const script = await videos.generateScript({
      workspacePath,
      productName: '示例产品',
      sceneBackground: '早餐后办公室场景',
      subtitleMode: 'burned-subtitle',
      voiceStyle: '自然可信',
      ratio: '4:5',
      shotCount: 3,
      durationSeconds: 15,
      promptPackId: pack.id,
      sceneCardIds: cards.map((card) => card.id),
      citations: [citation],
      assetRefs: [],
      selectedSkillSlugs: ['video-script-writer'],
      params: { textModel: 'fake-claude-sonnet' },
    });
    assert.equal(script.storyboard.length, 3);

    const storedLogs = await logs.list(workspacePath);
    assert.deepEqual(new Set(storedLogs.map((log) => log.kind)), new Set(['prompt-pack', 'scene-card', 'article', 'video-script']));
    assert.equal(storedLogs.every((log) => log.status === 'succeeded'), true);
  });
});

test('平台草稿包导出只生成本地交付文件并回写文章日志', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const articleLog = await logs.append({
      workspacePath,
      kind: 'article',
      status: 'succeeded',
      title: '真实使用场景长文',
      summary: '测试文章草稿',
      input: { platform: '公众号' },
      output: { markdown: '# 真实使用场景长文' },
    });
    const drafts = new PlatformDraftStore(logs);

    const result = await drafts.exportDraft({
      workspacePath,
      sourceLogId: articleLog.id,
      promptDraftId: 'prompt-draft-article-001',
      platform: '公众号',
      title: '真实使用场景长文',
      topic: '便携营养补充产品如何讲清真实使用场景',
      audience: '关注健康管理但讨厌夸张营销的办公人群',
      tone: '专业、自然、克制',
      markdown: '# 真实使用场景长文\n\n正文内容。',
      publishCheck: [
        { level: 'warning', message: '需要人工确认产品事实引用。' },
        { level: 'risk', message: '避免医疗化承诺。' },
      ],
    });

    assert.equal(existsSync(result.packageDir), true);
    assert.equal(existsSync(result.markdownPath), true);
    assert.equal(existsSync(result.platformCopyPath), true);
    assert.equal(existsSync(result.formatGuidePath), true);
    assert.equal(existsSync(result.metadataPath), true);
    assert.equal(existsSync(result.checklistPath), true);
    assert.equal(existsSync(result.manifestPath), true);
    assert.match(await readFile(result.markdownPath, 'utf-8'), /# 真实使用场景长文/);
    assert.match(await readFile(result.platformCopyPath, 'utf-8'), /发布前补充：封面图、摘要/);
    assert.match(await readFile(result.formatGuidePath, 'utf-8'), /公众号 格式指南/);
    assert.match(await readFile(result.checklistPath, 'utf-8'), /避免医疗化承诺/);
    const manifest = JSON.parse(await readFile(result.manifestPath, 'utf-8'));
    assert.equal(manifest.schema, 'buguai.platform-draft.v1');
    assert.equal(manifest.platform, '公众号');
    assert.equal(manifest.sourceLogId, articleLog.id);
    assert.equal(manifest.files.platformCopy, 'platform-copy.txt');
    assert.equal(manifest.files.formatGuide, 'format-guide.md');

    const [storedLog] = await logs.list(workspacePath);
    assert.ok(storedLog.artifactRefs.includes(result.manifestPath));
    assert.ok(storedLog.artifactRefs.includes(result.markdownPath));
    assert.ok(storedLog.artifactRefs.includes(result.platformCopyPath));
    const [record] = await drafts.list(workspacePath);
    assert.equal(record.title, '真实使用场景长文');
    assert.equal(record.platform, '公众号');
    assert.equal(record.sourceLogId, articleLog.id);
    assert.equal(record.promptDraftId, 'prompt-draft-article-001');
    assert.equal(record.platformCopyPath, result.platformCopyPath);
    const copyText = await drafts.readCopyText({ workspacePath, draftId: record.id });
    assert.match(copyText, /标题：真实使用场景长文/);
    assert.match(copyText, /发布前补充：封面图、摘要/);
  });
});

test('Agent 会话可以记录首版草稿和多轮调整', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '便携条包知识库',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
      tags: ['brand-kb'],
    });

    const started = await sessions.start({
      workspacePath,
      title: '便携条包 Prompt 会话',
      purpose: 'image',
      userIntent: '生成小红书真实生活场景图片 Prompt。',
      inputSourceIds: [source.id],
    });

    assert.equal(started.session.promptDraftIds.length, 1);
    assert.equal(started.session.messages.length, 2);
    assert.match(started.draft.versions[0].content, /Prompt 草稿/);

    const continued = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '把平台改成小红书，镜头更自然，不要广告棚拍感。',
    });

    assert.equal(continued.session.messages.length, 4);
    assert.equal(continued.draft.versions.length, 2);
    assert.match(continued.draft.versions.at(-1).content, /本轮调整/);
  });
});

test('Agent 会话启动会显式使用当前选中的 Claude 模型', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const promptAgent = new FakeClaudePromptAgentService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text, promptAgent);

    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '便携条包知识库',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。合规：不承诺治疗。',
      tags: ['brand-kb'],
    });

    const started = await sessions.start({
      workspacePath,
      title: '便携条包 Prompt 会话',
      purpose: 'image',
      userIntent: '生成小红书真实生活场景图片 Prompt。',
      inputSourceIds: [source.id],
      textModel: 'claude-opus-4-1',
    });

    assert.equal(promptAgent.draftCalls.length, 1);
    assert.equal(promptAgent.draftCalls[0].textModel, 'claude-opus-4-1');
    assert.equal(started.draft.model, 'claude-opus-4-1');
    assert.equal(started.session.model, 'claude-opus-4-1');
    assert.equal(started.session.textProtocol, 'claude-sdk');

    const continued = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '把平台改成小红书，镜头更自然，不要广告棚拍感。',
    });

    assert.equal(promptAgent.refineCalls.length, 1);
    assert.equal(promptAgent.refineCalls[0].textModel, 'claude-opus-4-1');
    assert.equal(continued.draft.model, 'claude-opus-4-1');
    assert.equal(continued.session.model, 'claude-opus-4-1');

    const switched = await sessions.continue({
      workspacePath,
      sessionId: started.session.id,
      message: '这一轮换成更快模型，保留同样结构。',
      textModel: 'claude-haiku-4-5',
    });

    assert.equal(promptAgent.refineCalls.length, 2);
    assert.equal(promptAgent.refineCalls[1].textModel, 'claude-haiku-4-5');
    assert.equal(switched.draft.model, 'claude-haiku-4-5');
    assert.equal(switched.session.model, 'claude-haiku-4-5');
  });
});

test('Prompt 生成服务不会把成功素材沉淀追溯源作为新输入源', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);

    const realSource = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '真实产品资料',
      text: '产品事实：便携条包。场景：早餐后、办公室抽屉。',
      tags: ['product'],
    });
    const traceSource = await inputSources.register({
      workspacePath,
      kind: 'video',
      purpose: 'successful-asset',
      title: '成功素材沉淀 / third-party-finished-video.mp4',
      sourcePath: join(workspacePath, 'third-party-finished-video.mp4'),
      summary: '已通过素材反向沉淀 Prompt。',
      text: '任务：成功素材反向沉淀 Prompt',
      tags: ['successful-asset', 'prompt-distilled', 'video'],
    });

    const generated = await promptDrafts.generate({
      workspacePath,
      title: '追溯源服务层过滤',
      purpose: 'video',
      userIntent: '生成新的 15 秒视频 Prompt。',
      inputSourceIds: [traceSource.id, realSource.id],
    });
    assert.deepEqual(generated.inputSourceIds, [realSource.id]);

    const started = await sessions.start({
      workspacePath,
      title: '追溯源 Agent 过滤',
      purpose: 'video',
      userIntent: '启动视频 Prompt Agent 会话。',
      inputSourceIds: [traceSource.id, realSource.id],
    });
    assert.deepEqual(started.draft.inputSourceIds, [realSource.id]);
    assert.deepEqual(started.session.inputSourceIds, [realSource.id]);
    assert.equal(started.session.sourceSnapshots.some((source) => source.sourceId === traceSource.id), false);
  });
});

test('输入源复用策略区分 Prompt 追溯和 SOP 自动输入', () => {
  const importedSuccessfulAsset = {
    purpose: 'successful-asset',
    tags: ['第三方生成', '成品视频'],
  };
  const distilledTraceSource = {
    purpose: 'successful-asset',
    tags: ['successful-asset', 'prompt-distilled', 'video'],
  };
  const productBrief = {
    purpose: 'product-brief',
    tags: ['product'],
  };

  assert.equal(isReusablePromptInputSource(importedSuccessfulAsset), true);
  assert.equal(isReusablePromptInputSource(distilledTraceSource), false);
  assert.equal(isReusableWorkflowInputSource(importedSuccessfulAsset), false);
  assert.equal(isReusableWorkflowInputSource(distilledTraceSource), false);
  assert.equal(isReusableWorkflowInputSource(productBrief), true);
});

test('产品资料输入源会结构化为变量表且不编造缺失字段', () => {
  const fullBrief = structureProductBriefSources([
    {
      id: 'product-brief-1',
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '便携条包产品资料',
      tags: ['产品资料'],
      extractedText: [
        '产品名称：便携营养条包',
        '卖点：早餐后、办公室抽屉和通勤包里都能顺手取用',
        '规格：15g * 20 条',
        '适用场景：早餐后、通勤、办公室加班',
        '禁用表达：不得承诺治疗、见效或替代专业建议',
      ].join('\n'),
    },
    {
      id: 'sku-1',
      kind: 'sku-table',
      purpose: 'product-brief',
      title: 'SKU 表',
      tags: ['sku'],
      extractedText: 'SKU,规格,价格\nA01,15g*20条,99\nA02,15g*40条,169',
    },
  ]);

  assert.equal(fullBrief.productName, '便携营养条包');
  assert.deepEqual(fullBrief.sellingPoints, ['早餐后、办公室抽屉和通勤包里都能顺手取用']);
  assert.equal(fullBrief.skuRows.length, 2);
  assert.equal(fullBrief.skuRows[0].SKU, 'A01');
  assert.equal(fullBrief.missingFields.length, 0);
  assert.match(fullBrief.variableTable, /禁用表达：不得承诺治疗/);
  const promptPlan = buildProductBriefPromptPlan(fullBrief);
  assert.deepEqual(promptPlan.map((item) => item.type), ['main-image', 'selling-point-image', 'detail-page-section']);
  assert.ok(promptPlan.every((item) => item.sourceIds.includes('product-brief-1')));
  assert.ok(promptPlan.every((item) => item.skuTrace.includes('A01')));
  assert.ok(promptPlan.every((item) => item.sourceTrace === '已关联 2 份产品资料 / SKU 表'));
  assert.ok(promptPlan.every((item) => item.prompt.includes('追溯资料：已关联 2 份产品资料 / SKU 表')));
  assert.ok(promptPlan.every((item) => !item.prompt.includes('追溯输入源')));
  assert.ok(promptPlan.every((item) => !item.prompt.includes('product-brief-1')));
  assert.ok(promptPlan.every((item) => !item.prompt.includes('sku-1')));
  assert.ok(promptPlan.some((item) => item.prompt.includes('详情页模块')));

  const partialBrief = structureProductBriefSources([
    {
      id: 'product-brief-2',
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '只有一句话的产品资料',
      tags: ['产品资料'],
      extractedText: '卖点：放在包里不占地方',
    },
  ]);
  assert.equal(partialBrief.productName, '');
  assert.deepEqual(partialBrief.missingFields, ['产品名称', '规格 / SKU', '适用场景 / 人群', '禁用表达 / 合规边界']);
  assert.match(partialBrief.variableTable, /产品名称：待补充/);
});

test('用户反馈输入源会聚类痛点和选题方向', () => {
  const insight = clusterUserFeedbackSources([
    {
      id: 'feedback-1',
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '评论和客服问题',
      tags: ['评论', '客服问题'],
      extractedText: [
        '用户：价格有点贵，值不值这个钱？',
        '差评：早上总是忘记吃，坚持不下来。',
        '客服：孩子能不能吃？有没有禁忌？',
        '评论：办公室加班时能不能放抽屉里？',
      ].join('\n'),
    },
  ]);

  assert.deepEqual(insight.sourceIds, ['feedback-1']);
  assert.equal(insight.totalLines, 4);
  assert.ok(insight.clusters.some((cluster) => cluster.key === 'price-trust'));
  assert.ok(insight.clusters.some((cluster) => cluster.key === 'usage-friction'));
  assert.ok(insight.clusters.some((cluster) => cluster.key === 'audience-fit'));
  assert.ok(insight.recommendedTags.includes('价格顾虑'));
  assert.ok(insight.titleDirections.some((item) => item.includes('价格有点贵')));
  assert.ok(insight.objectionResponses.some((item) => item.objection.includes('价格有点贵') && item.boundary.includes('不承诺效果')));
  assert.ok(insight.objectionResponses.some((item) => item.response.includes('人工复核')));
  assert.ok(insight.matrix.some((row) => row.audience.includes('办公和通勤人群') || row.scenario.includes('办公室')));
});

test('v2 provider 验收脚本默认只做 dry-run 配置诊断', async () => {
  const report = await buildProviderCheckReport({
    CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
    CONTENT_STUDIO_TEXT_API_KEY: 'test-text-key',
    CONTENT_STUDIO_TEXT_MODEL: 'gpt-test',
    CONTENT_STUDIO_VISION_ENDPOINT: 'https://vision.example.test/analyze',
    CONTENT_STUDIO_IMAGE_API_KEY: 'test-image-key',
    CONTENT_STUDIO_VIDEO_ENDPOINT: 'https://video.example.test/generate',
    CONTENT_STUDIO_VIDEO_API_KEY: 'test-video-key',
    CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK: '0',
  }, { allowNetwork: false, allowMedia: false });

  assert.equal(report.schema, 'buguai.v2-provider-check.v1');
  assert.equal(report.networkAllowed, false);
  assert.equal(report.mediaAllowed, false);
  assert.equal(report.summary.ready, 4);
  assert.equal(report.summary.blocked, 0);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.checks.every((item) => item.status === 'ready'), true);
  assert.equal(report.checks.every((item) => Array.isArray(item.requiredEnv)), true);
  assert.equal(report.checks.every((item) => typeof item.nextAction === 'string'), true);
  assert.ok(report.checks.find((item) => item.name === 'text')?.configured.apiKey);
  assert.equal(report.strictGate.passed, false);
  assert.ok(report.strictGate.reasons.includes('NETWORK_CHECK_NOT_ENABLED'));
  assert.ok(report.strictGate.reasons.includes('MEDIA_CHECK_NOT_ENABLED'));
  assert.ok(report.strictGate.nextActions.some((item) => item.includes('CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1')));
  assert.ok(report.strictGate.nextActions.some((item) => item.includes('CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1')));
  assert.equal(hasProviderStrictFailure(report), true);

  const blocked = await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false });
  assert.equal(blocked.summary.blocked >= 3, true);
  assert.equal(blocked.checks.some((item) => item.name === 'video' && item.status === 'blocked'), true);
  const blockedText = blocked.checks.find((item) => item.name === 'text');
  assert.ok(blockedText.requiredEnv.includes('CONTENT_STUDIO_TEXT_API_KEY or ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN'));
  assert.equal(blockedText.configured.apiKey, false);
  assert.equal(blockedText.configured.oauthToken, false);
  assert.equal(blockedText.severity, 'blocking');
  assert.match(blockedText.nextAction, /配置文字模型 Key/);
  assert.ok(blocked.strictGate.reasons.includes('PROVIDER_CHECK_BLOCKED'));
  assert.ok(blocked.strictGate.nextActions.some((item) => item.includes('text: 配置文字模型 Key')));
  assert.equal(hasProviderStrictFailure(blocked), true);
});

test('本地总闸包含 v2 provider dry-run 和业务验收入口', async () => {
  const packageJson = JSON.parse(await readFile(join(process.cwd(), 'package.json'), 'utf-8'));

  assert.equal(packageJson.scripts['verify:v2'], 'npm run verify:v2:providers && npm run verify:v2:acceptance && npm run verify:v2:ux-copy');
  assert.equal(packageJson.scripts['verify:v2:evidence'], 'node scripts/run-v2-acceptance-evidence.mjs');
  assert.equal(packageJson.scripts['verify:v2:ux-copy'], 'node scripts/v2-ux-copy-audit.mjs');
  assert.equal(packageJson.scripts['verify:v2:release'], 'node scripts/run-v2-acceptance-evidence.mjs --provider-strict --require-real-workspace-evidence --require-external-mix-evidence --allow-network --allow-media');
  assert.match(packageJson.scripts['verify:local'], /npm run verify:v2/);
});

test('v2 UX 文案审计会阻断普通用户可见工程词回退', async () => {
  const report = await buildV2UxCopyAudit();
  assert.equal(report.schema, 'buguai.v2-ux-copy-audit.v1');
  assert.equal(report.summary.passed, true, JSON.stringify(report.checks.flatMap((item) => item.failures), null, 2));
  assert.equal(report.summary.failed, 0);
  assert.ok(report.summary.files >= 8);
  assert.ok(report.summary.rules >= 10);

  const tmpRoot = await mkdtemp(join(tmpdir(), 'content-studio-ux-copy-'));
  try {
    await writeFile(join(tmpRoot, 'bad.md'), '用户主路径：导出 manifest 后查看 blocked 状态。', 'utf-8');
    const failed = await buildV2UxCopyAudit({
      projectRoot: tmpRoot,
      audits: [{
        path: 'bad.md',
        rules: [
          { id: 'mix-manifest-main-task', pattern: /导出\s+manifest/, message: '应使用“混剪清单”。' },
          { id: 'visible-blocked-status', pattern: /\bblocked\b/, message: '应使用“待配置”。' },
        ],
      }],
    });
    assert.equal(failed.summary.passed, false);
    assert.equal(failed.summary.failed, 2);
    assert.deepEqual(failed.checks[0].failures.map((item) => item.ruleId), ['mix-manifest-main-task', 'visible-blocked-status']);
  } finally {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

test('v2 验收 CLI 可以把 provider 和业务报告写入文件', async () => {
  await withWorkspace(async (workspacePath) => {
    const providerReportPath = join(workspacePath, 'reports', 'provider.json');
    const acceptanceReportPath = join(workspacePath, 'reports', 'acceptance.json');

    await execFileAsync(process.execPath, [
      'scripts/v2-provider-check.mjs',
      '--output',
      providerReportPath,
    ], { cwd: process.cwd() });
    await execFileAsync(process.execPath, [
      'scripts/run-v2-business-acceptance.mjs',
      '--output',
      acceptanceReportPath,
    ], { cwd: process.cwd() });

    const providerReport = JSON.parse(await readFile(providerReportPath, 'utf-8'));
    const acceptanceReport = JSON.parse(await readFile(acceptanceReportPath, 'utf-8'));
    assert.equal(providerReport.schema, 'buguai.v2-provider-check.v1');
    assert.equal(providerReport.summary.blocked >= 3, true);
    assert.ok(providerReport.strictGate.nextActions.length >= 1);
    assert.ok(providerReport.checks.every((item) => Array.isArray(item.requiredEnv)));
    assert.equal(acceptanceReport.schema, 'buguai.v2-business-acceptance.v1');
    assert.equal(acceptanceReport.summary.failed, 0);
    assert.equal(acceptanceReport.sections.provider.summary.blocked >= 3, true);
  });
});

test('v2 验收证据 CLI 默认生成成套目录且无 Key 不失败', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence');

    await execFileAsync(process.execPath, [
      'scripts/run-v2-acceptance-evidence.mjs',
      '--output-dir',
      evidenceDir,
    ], { cwd: process.cwd() });

    const manifestPath = join(evidenceDir, 'manifest.json');
    const providerPath = join(evidenceDir, 'provider-check.json');
    const businessPath = join(evidenceDir, 'business-acceptance.json');
    const summaryPath = join(evidenceDir, 'SUMMARY.md');
    const missingEvidencePath = join(evidenceDir, 'MISSING_EVIDENCE.md');
    assert.equal(existsSync(manifestPath), true);
    assert.equal(existsSync(providerPath), true);
    assert.equal(existsSync(businessPath), true);
    assert.equal(existsSync(summaryPath), true);
    assert.equal(existsSync(missingEvidencePath), true);

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
    const providerReport = JSON.parse(await readFile(providerPath, 'utf-8'));
    const businessReport = JSON.parse(await readFile(businessPath, 'utf-8'));
    const summary = await readFile(summaryPath, 'utf-8');
    const missingEvidence = await readFile(missingEvidencePath, 'utf-8');

    assert.equal(manifest.schema, 'buguai.v2-acceptance-evidence.v1');
    assert.equal(manifest.files.missingEvidence, 'MISSING_EVIDENCE.md');
    assert.equal(manifest.providerStrictRequired, false);
    assert.equal(manifest.providerStrictPassed, false);
    assert.equal(manifest.businessAcceptancePassed, true);
    assert.equal(manifest.exitCode, 0);
    assert.equal(providerReport.schema, 'buguai.v2-provider-check.v1');
    assert.equal(providerReport.summary.blocked >= 3, true);
    assert.equal(businessReport.schema, 'buguai.v2-business-acceptance.v1');
    assert.equal(businessReport.summary.failed, 0);
    assert.match(summary, /Provider 报告/);
    assert.match(summary, /业务验收报告/);
    assert.match(summary, /缺口清单/);
    assert.match(summary, /Strict 恢复动作/);
    assert.match(summary, /CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1/);
    assert.match(missingEvidence, /v2 缺口补齐清单/);
    assert.match(missingEvidence, /Provider 待补/);
  });
});

test('v2 验收证据 CLI strict 失败时仍保留证据目录', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence-strict');
    let failed = false;

    try {
      await execFileAsync(process.execPath, [
        'scripts/run-v2-acceptance-evidence.mjs',
        '--provider-strict',
        '--output-dir',
        evidenceDir,
      ], { cwd: process.cwd() });
    } catch (error) {
      failed = true;
      assert.equal(error.code, 1);
    }

    assert.equal(failed, true);
    assert.equal(existsSync(join(evidenceDir, 'provider-check.json')), true);
    assert.equal(existsSync(join(evidenceDir, 'business-acceptance.json')), true);
    assert.equal(existsSync(join(evidenceDir, 'manifest.json')), true);
    assert.equal(existsSync(join(evidenceDir, 'SUMMARY.md')), true);
    assert.equal(existsSync(join(evidenceDir, 'MISSING_EVIDENCE.md')), true);

    const manifest = JSON.parse(await readFile(join(evidenceDir, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.providerStrictRequired, true);
    assert.equal(manifest.providerStrictPassed, false);
    assert.equal(manifest.businessAcceptancePassed, true);
    assert.equal(manifest.exitCode, 1);
    assert.match(manifest.commands.provider, /CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1/);
    assert.match(manifest.commands.provider, /CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1/);
    assert.match(manifest.commands.provider, /verify:v2:providers:strict/);
    assert.match(manifest.commands.evidence, /--provider-strict/);
    assert.match(manifest.commands.evidence, /--allow-network/);
    assert.match(manifest.commands.evidence, /--allow-media/);
    assert.ok(manifest.nextActions.some((item) => item.includes('CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1')));
  });
});

test('v2 验收证据 CLI 真实工作区门槛会阻断本地样例', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence-real-workspace');
    let failed = false;

    try {
      await execFileAsync(process.execPath, [
        'scripts/run-v2-acceptance-evidence.mjs',
        '--require-real-workspace-evidence',
        '--output-dir',
        evidenceDir,
      ], { cwd: process.cwd() });
    } catch (error) {
      failed = true;
      assert.equal(error.code, 1);
    }

    assert.equal(failed, true);
    const manifest = JSON.parse(await readFile(join(evidenceDir, 'manifest.json'), 'utf-8'));
    const businessReport = JSON.parse(await readFile(join(evidenceDir, 'business-acceptance.json'), 'utf-8'));
    const summary = await readFile(join(evidenceDir, 'SUMMARY.md'), 'utf-8');
    const missingEvidence = await readFile(join(evidenceDir, 'MISSING_EVIDENCE.md'), 'utf-8');
    const realWorkspaceCheck = businessReport.sections.realEvidence.checks.find((check) => check.id === 'real-workspace-evidence');

    assert.equal(manifest.requireRealWorkspaceEvidence, true);
    assert.equal(manifest.requireExternalMixEvidence, true);
    assert.equal(manifest.businessAcceptancePassed, false);
    assert.equal(manifest.exitCode, 1);
    assert.ok(manifest.businessFailures.some((check) => check.id === 'real-workspace-evidence'));
    assert.ok(manifest.businessFailures.some((check) => check.id === 'mix-package-external-import'));
    assert.ok(manifest.businessNextActions.some((item) => item.includes('--workspace')));
    assert.match(manifest.commands.business, /verify:v2:acceptance --/);
    assert.match(manifest.commands.business, /--require-external-mix-evidence/);
    assert.match(manifest.commands.business, /--require-real-workspace-evidence/);
    assert.match(manifest.commands.evidence, /--require-external-mix-evidence/);
    assert.match(manifest.commands.evidence, /--require-real-workspace-evidence/);
    assert.match(summary, /真实混剪导入证据要求：是/);
    assert.match(summary, /真实工作区闭环要求：是/);
    assert.match(summary, /业务失败项/);
    assert.match(summary, /必须使用 --workspace 从真实工作区读取产物/);
    assert.match(summary, /真实混剪工具导入证据/);
    assert.match(missingEvidence, /v2 缺口补齐清单/);
    assert.match(missingEvidence, /真实工作区验收门槛/);
    assert.match(missingEvidence, /真实混剪工具导入证据/);
    assert.match(missingEvidence, /- \[ \] 必须使用 --workspace 从真实工作区读取产物/);
    assert.equal(realWorkspaceCheck.status, 'fail');
    assert.ok(realWorkspaceCheck.missing.includes('必须使用 --workspace 从真实工作区读取产物'));
  });
});

test('v2 验收证据 CLI 复跑命令保留外部输入', async () => {
  await withWorkspace(async (workspacePath) => {
    const evidenceDir = join(workspacePath, 'evidence-input');
    const inputPath = join(process.cwd(), 'docs/roadmap/v2/business-acceptance-input.example.json');

    await execFileAsync(process.execPath, [
      'scripts/run-v2-acceptance-evidence.mjs',
      '--input',
      inputPath,
      '--output-dir',
      evidenceDir,
    ], { cwd: process.cwd() });

    const manifest = JSON.parse(await readFile(join(evidenceDir, 'manifest.json'), 'utf-8'));
    assert.equal(manifest.mode, 'external-input');
    assert.equal(manifest.inputs.inputPath, inputPath);
    assert.match(manifest.commands.business, /--input/);
    assert.match(manifest.commands.business, /business-acceptance-input\.example\.json/);
    assert.match(manifest.commands.evidence, /--input/);
    assert.match(manifest.commands.evidence, /business-acceptance-input\.example\.json/);
  });
});

test('v2 业务验收脚本覆盖本地 sample 主链口径', async () => {
  const report = await buildBusinessAcceptanceReport({}, {
    providerReport: await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false }),
  });

  assert.equal(report.schema, 'buguai.v2-business-acceptance.v1');
  assert.equal(report.mode, 'local-sample');
  assert.equal(report.summary.total, 50);
  assert.equal(report.summary.failed, 0);
  assert.equal(report.sections.realEvidence.checks.length, 0);
  assert.equal(report.sections.brand.imagePrompts.length, 10);
  assert.equal(report.sections.brand.videoPrompts.length, 10);
  assert.equal(report.sections.brand.promptGroupEvidence.imagePromptCount, 10);
  assert.equal(report.sections.brand.promptGroupEvidence.videoPromptCount, 10);
  assert.ok(report.sections.brand.checks.some((check) => check.id === 'scene-prompt-structure' && check.status === 'pass'));
  assert.equal(report.sections.ip.completeness, 100);
  assert.ok(report.sections.productBrief.checks.some((check) => check.id === 'product-brief-downstream-ready' && check.status === 'pass'));
  assert.ok(report.sections.productBrief.checks.some((check) => check.id === 'product-brief-prompt-plan' && check.status === 'pass'));
  assert.ok(report.sections.productBrief.checks.some((check) => check.id === 'product-brief-prompt-trace' && check.status === 'pass'));
  assert.deepEqual(report.sections.productBrief.promptPlan.map((item) => item.type), ['main-image', 'selling-point-image', 'detail-page-section']);
  assert.ok(report.sections.productBrief.promptPlan.every((item) => item.sourceTrace === '已关联 2 份产品资料 / SKU 表'));
  assert.ok(report.sections.productBrief.promptPlan.every((item) => item.prompt.includes('追溯资料：已关联 2 份产品资料 / SKU 表')));
  assert.ok(report.sections.productBrief.promptPlan.every((item) => !item.prompt.includes('追溯输入源')));
  assert.ok(report.sections.productBrief.promptPlan.every((item) => !item.prompt.includes('sample-product-brief')));
  assert.ok(report.sections.productBrief.promptPlan.every((item) => !item.prompt.includes('sample-sku-table')));
  assert.equal(report.sections.productBrief.skuRows.length, 2);
  assert.ok(report.sections.feedback.checks.some((check) => check.id === 'feedback-clusters' && check.status === 'pass'));
  assert.ok(report.sections.feedback.checks.some((check) => check.id === 'feedback-title-directions' && check.status === 'pass'));
  assert.ok(report.sections.feedback.checks.some((check) => check.id === 'feedback-objection-responses' && check.status === 'pass'));
  assert.ok(report.sections.feedback.matrix.length >= 4);
  assert.ok(report.sections.reference.checks.some((check) => check.id === 'reference-source-kinds' && check.status === 'pass'));
  assert.ok(report.sections.videoBreakdown.checks.some((check) => check.id === 'video-breakdown-segments' && check.status === 'pass'));
  assert.ok(report.sections.videoBreakdown.checks.some((check) => check.id === 'video-script-structure' && check.status === 'pass'));
  assert.ok(report.sections.greenScreen.checks.some((check) => check.id === 'green-screen-card-types' && check.status === 'pass'));
  assert.ok(report.sections.successfulAsset.checks.some((check) => check.id === 'successful-asset-prompt-draft' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.details?.expectedFiles?.includes('manifest.csv') || check.expectedFiles?.includes('manifest.csv')));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'mix-package-assets' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'mix-package-approved-assets' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'mix-package-import-guide' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'platform-draft-trace' && check.status === 'pass'));
  assert.ok(report.sections.delivery.checks.some((check) => check.id === 'platform-draft-content' && check.status === 'pass'));
  assert.ok(report.sections.trace.checks.some((check) => check.id === 'workflow-run-trace-coverage' && check.status === 'pass'));
  assert.equal(report.summary.providerBlocked >= 3, true);
});

test('v2 业务验收脚本支持外部真实素材输入并暴露缺口', async () => {
  const providerReport = await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false });
  const externalInput = {
    brand: {
      title: '真实验收品牌',
      facts: ['产品事实 A。', '场景事实 B。'],
      compliance: ['不承诺治疗。', '不写绝对化收益。'],
      scenes: [
        {
          title: '通勤包侧袋备用',
          audience: '通勤用户',
          painPoint: '出门后容易忘记准备。',
          usageScene: '通勤包侧袋',
          visualComposition: '真实包内俯拍，自然光，产品只占画面三分之一。',
          sellingPoint: '便携条包方便随手取用。',
          imageMaterialSuggestion: '生成手机实拍包内场景图。',
          videoMaterialSuggestion: '生成 15 秒手部取用动作素材。',
        },
        '办公室抽屉里备用',
      ],
    },
    ip: {
      title: '真实验收 IP',
      layers: {
        identity: '身份',
        values: '价值观',
        language: '语言',
        methodology: '方法论',
        materials: '素材',
        engine: '创作引擎',
      },
    },
    productBrief: {
      sources: [{
        id: 'product-brief-real',
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '真实产品 brief',
        tags: ['产品资料', 'brief'],
        extractedText: [
          '产品名称：每日轻补便携条包',
          '卖点：小条包装，早餐后、办公室和通勤包里都能随手取用',
          '规格：每盒 20 条，每条独立包装',
          '适用场景：早餐后、办公室抽屉、通勤包侧袋、出差洗漱包',
          '禁用表达：不承诺治疗、见效、改善疾病或替代专业建议',
          'SKU,规格,价格,适用场景',
          'trial-10,10 条装,49,首次尝试',
        ].join('\n'),
      }],
    },
    feedback: {
      sources: [{
        id: 'feedback-real',
        kind: 'manual-note',
        purpose: 'user-feedback',
        title: '真实评论和客服问题',
        tags: ['评论', '客服问题'],
        extractedText: [
          '用户：价格有点贵，值不值，怕是智商税。',
          '差评：买了以后不知道怎么用，步骤太复杂，坚持几天就忘记。',
          '客服：孩子和老人能不能吃，敏感人群有没有禁忌？',
          '评论：早餐后放办公室抽屉和通勤包里会不会更方便？',
        ].join('\n'),
      }],
    },
    reference: {
      sources: ['reference-a.png', 'reference-video-a.mp4'],
      actualPromptFields: ['composition', 'lighting', 'negativePrompt', 'risks', 'qualityChecklist'],
      actualBoundaryTerms: [
        '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
        '需要人工复核素材授权、商标和肖像风险。',
      ],
    },
    videoBreakdown: {
      sources: ['reference-video-a.mp4'],
      actual: {
        summary: '已拆解参考视频的钩子、镜头、字幕、节奏和可复用结构。',
        dimensions: ['开头钩子', '字幕口播', '镜头运镜'],
        segments: [{
          timeRange: '0-3s',
          hook: '先抛早餐后难坚持的真实痛点',
          visual: '早餐桌自然光，手把便携条包放进通勤包侧袋',
          voiceover: '很多人不是不知道要坚持，而是每天准备太麻烦。',
          subtitle: '早餐后顺手放进包里',
          rhythm: '快节奏钩子',
          reusablePoint: '用具体生活动作降低坚持门槛',
        }],
        reusableFormula: ['痛点 -> 顺手使用 -> 事实边界'],
        risks: [{ level: 'warning', message: '新脚本只能复用结构，不照搬原视频画面；发布前复核素材授权和合规表达。' }],
      },
      script: {
        title: '便携条包 15 秒新视频脚本',
        script: '镜头 1：早餐后顺手放进包里。',
        storyboard: [{
          shot: 1,
          duration: '0-3s',
          visual: '自然光早餐桌，手拿起条包。',
          voiceover: '每天坚持，难的不是知道，而是顺手。',
          subtitle: '早餐后顺手完成',
          rhythm: '快速钩子',
        }],
        videoPrompt: '15 秒 9:16 手机实拍视频，自然光，不复制原视频构图和品牌元素。',
        publishCheck: [
          { level: 'warning', message: '复核素材授权，避免照搬参考视频画面。' },
          { level: 'risk', message: '不要承诺治疗、见效或替代专业建议。' },
        ],
        breakdownLogId: 'video-breakdown-real',
      },
    },
    videoPackage: {
      actualFiles: ['videos/', 'overlays/', 'manifest.json', 'manifest.csv', 'import-guide.md'],
      actualTraceFields: ['workflowRunId', 'promptDraftId', 'sourceId', 'packagedPath'],
      actualAssetKinds: ['video', 'overlay'],
      actualReviewStatuses: ['approved'],
      actualGuideTerms: ['第三方混剪软件', 'manifest.csv', 'overlays/', 'videos/', '人工审核'],
    },
    greenScreen: {
      actualCards: [{
        id: 'overlay-title-real',
        type: 'title',
        title: '标题卡',
        text: '早餐后顺手一次',
        durationSeconds: 3,
        assetPath: 'overlays/001-overlay-title.svg',
        background: 'green-screen',
        aspectRatio: '9:16',
        promptDraftId: 'video-prompt-real',
        tags: ['绿幕文案图', '标题卡'],
      }, {
        id: 'overlay-selling-point-real',
        type: 'selling-point',
        title: '卖点卡',
        text: '抽屉包里都能放',
        durationSeconds: 4,
        assetPath: 'overlays/002-overlay-selling-point.svg',
        background: 'green-screen',
        aspectRatio: '9:16',
        promptDraftId: 'video-prompt-real',
        tags: ['绿幕文案图', '卖点卡'],
      }, {
        id: 'overlay-cta-real',
        type: 'cta',
        title: '行动卡',
        text: '先从顺手一次开始',
        durationSeconds: 4,
        assetPath: 'overlays/003-overlay-cta.svg',
        background: 'green-screen',
        aspectRatio: '9:16',
        promptDraftId: 'video-prompt-real',
        tags: ['绿幕文案图', '行动卡'],
      }],
      actualReviewStatuses: ['approved'],
    },
    platformDraft: {
      actualFiles: ['draft.md', 'platform-copy.txt', 'format-guide.md', 'publish-checklist.md', 'manifest.json'],
      actualTraceFields: ['workflowRunId', 'promptDraftId', 'sourceLogId'],
      actualContentFields: ['draft', 'platformCopy', 'formatGuide', 'publishChecklist', 'publishBoundary'],
    },
    mediaCost: {
      actual: {
        model: 'test-video-model',
        status: 'succeeded',
        durationSeconds: 10,
        currency: 'CNY',
        unitPrice: 1.5,
        estimatedCost: 15,
        source: 'provider-response',
      },
    },
    successfulAsset: {
      actual: {
        assetKey: 'generated:real-image-log:0:approved-breakfast.png',
        kind: 'image',
        path: 'approved-breakfast.png',
        title: '已通过早餐桌素材',
        reviewStatus: 'approved',
        workflowRunId: 'workflow-run-real',
        originalPromptDraftId: 'image-prompt-real',
        workflowArtifactRefs: [
          'generated:real-image-log:0:approved-breakfast.png',
          'input-source:successful-asset-real',
          'prompt-draft:successful-asset-draft-real',
        ],
        distilledInputSource: {
          id: 'successful-asset-real',
          kind: 'image',
          purpose: 'successful-asset',
          title: '成功素材沉淀 / 已通过早餐桌素材',
          sourcePath: 'approved-breakfast.png',
          tags: ['successful-asset', 'prompt-distilled', 'image', 'workflow-run'],
          relatedPromptDraftId: 'image-prompt-real',
          relatedSceneCardIds: ['scene-real-001'],
          extractedText: [
            '素材状态：已通过审核。',
            '质量原因：真实早餐桌自然光，产品清楚但不过度硬广。',
            '复用 Prompt 草稿：早餐桌自然光，手部自然拿起便携条包。',
            '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
            '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
          ].join('\n'),
        },
        distilledPromptDraft: {
          id: 'successful-asset-draft-real',
          title: '成功素材 Prompt：已通过早餐桌素材',
          purpose: 'image',
          status: 'confirmed',
          workflowRunId: 'workflow-run-real',
          inputSourceIds: ['successful-asset-real'],
          sceneCardIds: ['scene-real-001'],
          model: 'local-successful-asset-distiller',
          content: [
            '素材状态：已通过审核。',
            '质量原因：真实早餐桌自然光，产品清楚但不过度硬广。',
            '复用 Prompt 草稿：早餐桌自然光，手部自然拿起便携条包。',
            '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
            '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
          ].join('\n'),
        },
      },
    },
    trace: {
      expectedWorkflowRunId: 'workflow-run-real',
      actualWorkflowRunRefs: [
        { source: 'reference-log', workflowRunId: 'workflow-run-real' },
        { source: 'video-breakdown-log', workflowRunId: 'workflow-run-real' },
        { source: 'video-script-log', workflowRunId: 'workflow-run-real' },
        { source: 'video-generation-log', workflowRunId: 'workflow-run-real' },
        { source: 'mix-package', workflowRunId: 'workflow-run-real' },
        { source: 'platform-draft', workflowRunId: 'workflow-run-real' },
      ],
    },
  };

  const passed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: externalInput,
    mode: 'external-input',
  });
  assert.equal(passed.mode, 'external-input');
  assert.equal(passed.summary.failed, 0);
  assert.equal(passed.sections.brand.sample, '真实验收品牌');
  assert.equal(passed.sections.brand.promptGroupEvidence.imagePromptCount, 10);
  assert.ok(passed.sections.productBrief.checks.some((check) => check.id === 'product-brief-fields' && check.status === 'pass'));
  assert.ok(passed.sections.productBrief.checks.some((check) => check.id === 'product-brief-prompt-plan' && check.status === 'pass'));
  assert.ok(passed.sections.productBrief.promptPlan.some((item) => item.type === 'detail-page-section' && item.prompt.includes('SKU')));
  assert.ok(passed.sections.feedback.checks.some((check) => check.id === 'feedback-evidence' && check.status === 'pass'));
  assert.ok(passed.sections.feedback.checks.some((check) => check.id === 'feedback-title-directions' && check.status === 'pass'));
  assert.ok(passed.sections.feedback.checks.some((check) => check.id === 'feedback-objection-responses' && check.status === 'pass'));
  assert.ok(passed.sections.videoBreakdown.checks.some((check) => check.id === 'video-breakdown-boundary' && check.status === 'pass'));
  assert.ok(passed.sections.greenScreen.checks.some((check) => check.id === 'green-screen-card-approved' && check.status === 'pass'));
  assert.ok(passed.sections.successfulAsset.checks.some((check) => check.id === 'successful-asset-workflow-trace' && check.status === 'pass'));
  assert.equal(passed.sections.mediaCost.actual.estimatedCost, 15);
  assert.equal(passed.sections.trace.uniqueWorkflowRunIds[0], 'workflow-run-real');
  assert.ok(passed.sections.trace.checks.some((check) => check.id === 'workflow-run-trace-coverage' && check.status === 'pass'));

  const missingRealWorkspaceEvidence = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: externalInput,
    mode: 'external-input',
    requireRealWorkspaceEvidence: true,
  });
  const realWorkspaceCheck = missingRealWorkspaceEvidence.sections.realEvidence.checks.find((check) => check.id === 'real-workspace-evidence');
  assert.ok(missingRealWorkspaceEvidence.summary.failed >= 2);
  assert.equal(realWorkspaceCheck.status, 'fail');
  assert.ok(realWorkspaceCheck.missing.includes('必须使用 --workspace 从真实工作区读取产物'));
  assert.ok(realWorkspaceCheck.missing.includes('真实 provider strict 未通过；请用 verify:v2:evidence --provider-strict 联调'));
  assert.equal(
    missingRealWorkspaceEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import').status,
    'fail',
  );

  const missingMixImportEvidence = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: externalInput,
    mode: 'external-input',
    requireExternalMixEvidence: true,
  });
  const missingMixImportCheck = missingMixImportEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import');
  assert.equal(missingMixImportCheck.status, 'fail');
  assert.ok(missingMixImportCheck.missingFields.includes('toolName'));
  assert.ok(missingMixImportCheck.missingFields.includes('evidenceFiles'));

  await withWorkspace(async (workspacePath) => {
    const evidencePath = join(workspacePath, 'capcut-import-evidence.md');
    await writeFile(evidencePath, '# 剪映导入验收\n\n已导入 videos/ 和 overlays/，manifest.csv 已核对。', 'utf-8');
    const passedWithMixImportEvidence = await buildBusinessAcceptanceReport({}, {
      providerReport,
      acceptanceInput: {
        ...externalInput,
        videoPackage: {
          ...externalInput.videoPackage,
          requireExternalImportEvidence: true,
          externalImportEvidence: {
            toolName: '剪映专业版',
            importedAt: '2026-05-22T16:30:00+08:00',
            operator: '剪辑验收',
            importedAssetKinds: ['video', 'overlay'],
            importedFileCount: 2,
            manifestImported: true,
            timelineCreated: true,
            result: 'verified',
            evidenceFiles: [evidencePath],
          },
        },
      },
      mode: 'external-input',
    });
    const mixImportCheck = passedWithMixImportEvidence.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import');
    assert.equal(mixImportCheck.status, 'pass');
    assert.equal(mixImportCheck.toolName, '剪映专业版');
    assert.ok(mixImportCheck.evidenceFiles.some((filePath) => filePath.endsWith('capcut-import-evidence.md')));
  });

  const complianceFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      brand: {
        ...externalInput.brand,
        compliance: ['表达保持克制。', '上线前人工复核。'],
      },
    },
    mode: 'external-input',
  });
  const complianceCheck = complianceFailed.sections.brand.checks.find((check) => check.id === 'brand-compliance');
  assert.equal(complianceCheck.status, 'fail');
  assert.ok(complianceCheck.missingTerms.includes('治疗'));
  assert.ok(complianceCheck.missingTerms.includes('绝对化'));

  const failed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      ip: { title: '缺层 IP', layers: { identity: '身份' } },
      productBrief: {
        sources: [{
          id: 'product-brief-missing',
          kind: 'manual-note',
          purpose: 'product-brief',
          title: '缺字段产品资料',
          tags: ['产品资料'],
          extractedText: '卖点：便携好带。\n适用场景：办公室抽屉。',
        }],
      },
      feedback: {
        sources: [],
      },
      videoBreakdown: {
        sources: ['reference-video-a.mp4'],
        actual: {
          segments: [{ timeRange: '0-3s', hook: '只返回钩子' }],
          reusableFormula: [],
          risks: [{ level: 'warning', message: '仅人工复核。' }],
        },
        script: {
          title: '',
          storyboard: [],
          videoPrompt: '',
          publishCheck: [],
        },
      },
      videoPackage: { actualFiles: ['videos/', 'manifest.json'], actualTraceFields: ['workflowRunId'], actualAssetKinds: ['video'] },
      greenScreen: {
        actualCards: [{
          id: 'overlay-bad',
          type: 'title',
          title: '标题卡',
          text: '这是一段过长的绿幕文案，会让第三方混剪叠加时不可读，需要拆成多张卡片',
          durationSeconds: 0,
          assetPath: 'overlays/overlay-bad.txt',
          background: 'plain',
          aspectRatio: '16:9',
          promptDraftId: '',
        }],
        actualReviewStatuses: ['rejected'],
      },
      platformDraft: { actualFiles: ['draft.md'] },
      mediaCost: { actual: { durationSeconds: 0, estimatedCost: 0, currency: '' } },
      successfulAsset: {
        actual: {
          ...externalInput.successfulAsset.actual,
          reviewStatus: 'pending',
          distilledInputSource: {
            ...externalInput.successfulAsset.actual.distilledInputSource,
            tags: ['successful-asset'],
            relatedPromptDraftId: '',
          },
        },
      },
    },
    mode: 'external-input',
  });
  assert.ok(failed.summary.failed >= 3);
  assert.deepEqual(failed.sections.ip.missingLayers, ['values', 'language', 'methodology', 'materials', 'engine']);
  assert.ok(failed.sections.productBrief.checks.some((check) => check.status === 'fail' && check.id === 'product-brief-fields'));
  assert.ok(failed.sections.productBrief.checks.some((check) => check.status === 'fail' && check.id === 'product-brief-sku'));
  assert.ok(failed.sections.productBrief.checks.some((check) => check.status === 'fail' && check.id === 'product-brief-prompt-trace'));
  assert.ok(failed.sections.feedback.checks.some((check) => check.status === 'fail' && check.id === 'feedback-clusters'));
  assert.ok(failed.sections.feedback.checks.some((check) => check.status === 'fail' && check.id === 'feedback-title-directions'));
  assert.ok(failed.sections.feedback.checks.some((check) => check.status === 'fail' && check.id === 'feedback-objection-responses'));
  assert.ok(failed.sections.videoBreakdown.checks.some((check) => check.status === 'fail' && check.id === 'video-breakdown-segments'));
  assert.ok(failed.sections.videoBreakdown.checks.some((check) => check.status === 'fail' && check.id === 'video-script-structure'));
  assert.ok(failed.sections.greenScreen.checks.some((check) => check.status === 'fail' && check.id === 'green-screen-card-types'));
  assert.ok(failed.sections.greenScreen.checks.some((check) => check.status === 'fail' && check.id === 'green-screen-card-approved'));
  assert.ok(failed.sections.successfulAsset.checks.some((check) => check.status === 'fail' && check.id === 'successful-asset-approved'));
  assert.ok(failed.sections.successfulAsset.checks.some((check) => check.status === 'fail' && check.id === 'successful-asset-source-trace'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'mix-package-files'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'mix-package-assets'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'mix-package-approved-assets'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'platform-draft-files'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'platform-draft-trace'));
  assert.ok(failed.sections.delivery.checks.some((check) => check.status === 'fail' && check.id === 'platform-draft-content'));
  assert.ok(failed.sections.mediaCost.checks.some((check) => check.status === 'fail' && check.id === 'video-cost-present'));

  const manualCostFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      mediaCost: {
        actual: {
          model: 'test-video-model',
          status: 'succeeded',
          durationSeconds: 10,
          currency: 'CNY',
          unitPrice: 1.5,
          estimatedCost: 15,
          source: 'manual',
        },
      },
    },
    mode: 'external-input',
  });
  assert.ok(manualCostFailed.sections.mediaCost.checks.some((check) => check.status === 'fail' && check.id === 'video-cost-total'));

  const referenceBoundaryFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      reference: {
        ...externalInput.reference,
        actualBoundaryTerms: ['只描述画面构图和自然光。'],
      },
    },
    mode: 'external-input',
  });
  const referenceBoundaryCheck = referenceBoundaryFailed.sections.reference.checks.find((check) => check.id === 'reference-boundary');
  assert.equal(referenceBoundaryCheck.status, 'fail');
  assert.ok(referenceBoundaryCheck.missingBoundaryTerms.includes('复制竞品'));
  assert.ok(referenceBoundaryCheck.missingBoundaryTerms.includes('授权'));

  const publishBoundaryFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      platformDraft: {
        ...externalInput.platformDraft,
        actualContentFields: ['draft', 'platformCopy', 'formatGuide', 'publishChecklist'],
      },
    },
    mode: 'external-input',
  });
  const publishBoundaryCheck = publishBoundaryFailed.sections.delivery.checks.find((check) => check.id === 'platform-draft-content');
  assert.equal(publishBoundaryCheck.status, 'fail');
  assert.ok(publishBoundaryCheck.missingFields.includes('publishBoundary'));

  const traceFailed = await buildBusinessAcceptanceReport({}, {
    providerReport,
    acceptanceInput: {
      ...externalInput,
      trace: {
        actualWorkflowRunRefs: [
          { source: 'reference-log', workflowRunId: 'workflow-run-a' },
          { source: 'mix-package', workflowRunId: 'workflow-run-b' },
        ],
      },
    },
    mode: 'external-input',
  });
  assert.ok(traceFailed.sections.trace.checks.some((check) => check.status === 'fail' && check.id === 'workflow-run-trace-consistent'));
  assert.ok(traceFailed.sections.trace.checks.some((check) => check.status === 'fail' && check.id === 'workflow-run-trace-coverage'));
});

test('v2 业务验收脚本可从真实交付包目录自动提取证据', async () => {
  await withWorkspace(async (workspacePath) => {
    const mixDir = join(workspacePath, 'mix-package');
    const platformDir = join(workspacePath, 'platform-draft');
    await mkdir(join(mixDir, 'videos'), { recursive: true });
    await mkdir(join(mixDir, 'overlays'), { recursive: true });
    await mkdir(platformDir, { recursive: true });
    await writeFile(join(mixDir, 'videos', '001-video.mp4'), 'fake video fixture', 'utf-8');
    await writeFile(join(mixDir, 'overlays', '001-overlay-title.svg'), '<svg></svg>', 'utf-8');
    await writeFile(join(mixDir, 'manifest.csv'), '"kind","title","packagedPath"\n"video","成品视频","videos/001-video.mp4"\n"overlay","标题卡","overlays/001-overlay-title.svg"\n', 'utf-8');
    await writeFile(join(mixDir, 'import-guide.md'), [
      '# 真实混剪包导入说明',
      '第三方混剪软件中先导入 videos/ 主体素材，再导入 overlays/ 绿幕文案图。',
      '使用 manifest.csv 对照素材用途、提示词来源和人工审核状态。',
    ].join('\n'), 'utf-8');
    await writeFile(join(mixDir, 'capcut-import-screenshot.txt'), '剪映专业版导入截图占位：视频轨和绿幕叠加轨均已导入。', 'utf-8');
    await writeFile(join(mixDir, 'import-evidence.json'), JSON.stringify({
      toolName: '剪映专业版',
      importedAt: '2026-05-22T16:30:00+08:00',
      operator: '剪辑验收',
      importedAssetKinds: ['video', 'overlay'],
      importedFileCount: 2,
      manifestImported: true,
      timelineCreated: true,
      result: 'verified',
      evidenceFiles: ['capcut-import-screenshot.txt'],
    }, null, 2), 'utf-8');
    await writeFile(join(mixDir, 'manifest.json'), JSON.stringify({
      schema: 'buguai.mix-package.v1',
      workflowRunId: 'workflow-run-real',
      assets: [{
        id: 'imported:real-video:0',
        kind: 'video',
        title: '成品视频',
        reviewStatus: 'approved',
        reviewId: 'asset-review-real-video',
        sourceId: 'input-source-real-video',
        promptDraftId: 'prompt-draft-real-video',
        packagedPath: join(mixDir, 'videos', '001-video.mp4'),
      }, {
        id: 'overlay:overlay-title-real',
        kind: 'overlay',
        title: '标题卡',
        reviewStatus: 'approved',
        reviewId: 'asset-review-real-overlay',
        sourceType: 'overlay-card',
        sourceId: 'overlay-title-real',
        promptDraftId: 'video-prompt-real',
        durationSeconds: 3,
        packagedPath: join(mixDir, 'overlays', '001-overlay-title.svg'),
      }],
    }, null, 2), 'utf-8');
    await writeFile(join(platformDir, 'draft.md'), '# 真实平台草稿\n\n这是一份用于验收的真实正文草稿，包含可人工复核的业务内容。', 'utf-8');
    await writeFile(join(platformDir, 'platform-copy.txt'), '标题：真实平台草稿\n\n正文复制稿。\n\n发布前补充：封面图、摘要和配图位置需要人工确认。', 'utf-8');
    await writeFile(join(platformDir, 'format-guide.md'), '# 公众号 格式指南\n\n- 发布前复核事实引用、功效表达、绝对化词和医疗化暗示。', 'utf-8');
    await writeFile(join(platformDir, 'publish-checklist.md'), '# 真实平台草稿 发布前检查\n\n## 检查项\n\n- [ ] WARNING：确认事实来源。\n\n## 交付边界\n\n- 本包只用于人工复制到目标平台前检查，不包含平台账号、授权或自动发布任务。\n- 发布前需要人工确认平台格式、封面、配图、引用事实和高风险表达。', 'utf-8');
    await writeFile(join(platformDir, 'manifest.json'), JSON.stringify({
      schema: 'buguai.platform-draft.v1',
      workflowRunId: 'workflow-run-real',
      promptDraftId: 'prompt-draft-real-article',
      sourceLogId: 'article-log-real',
      files: {
        markdown: 'draft.md',
        platformCopy: 'platform-copy.txt',
        formatGuide: 'format-guide.md',
        checklist: 'publish-checklist.md',
        metadata: 'metadata.json',
      },
    }, null, 2), 'utf-8');

    const report = await buildBusinessAcceptanceReport({}, {
      providerReport: await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false }),
      mode: 'external-input',
      acceptanceInput: {
        brand: {
          title: '目录证据品牌',
          facts: ['产品事实 A。', '场景事实 B。'],
          compliance: ['不承诺治疗。', '不写绝对化收益。'],
          scenes: ['办公室抽屉里备用', '通勤包侧袋备用'],
        },
        ip: {
          title: '目录证据 IP',
          layers: {
            identity: '身份',
            values: '价值观',
            language: '语言',
            methodology: '方法论',
            materials: '素材',
            engine: '创作引擎',
          },
        },
        productBrief: {
          sources: [{
            id: 'directory-product-brief',
            kind: 'manual-note',
            purpose: 'product-brief',
            title: '目录证据产品资料',
            tags: ['产品资料'],
            extractedText: [
              '产品名称：目录证据便携条包',
              '卖点：小条包装，适合真实生活场景。',
              '规格：每盒 20 条。',
              '适用场景：办公室抽屉、通勤包侧袋。',
              '禁用表达：不承诺治疗，不写绝对化收益。',
              'SKU,规格,价格',
              'trial-10,10 条装,49',
            ].join('\n'),
          }],
        },
        feedback: {
          sources: [{
            id: 'directory-feedback',
            kind: 'manual-note',
            purpose: 'user-feedback',
            title: '目录证据评论',
            tags: ['评论'],
            extractedText: [
              '用户：价格有点贵，值不值？',
              '用户：怎么用，步骤会不会麻烦，坚持会忘记。',
              '客服：孩子和老人能不能用，有没有禁忌？',
              '评论：办公室和通勤包里更方便。',
            ].join('\n'),
          }],
        },
        reference: {
          sources: ['reference-a.png', 'reference-video-a.mp4'],
          actualPromptFields: ['composition', 'lighting', 'negativePrompt', 'risks', 'qualityChecklist'],
          actualBoundaryTerms: [
            '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
            '需要人工复核素材授权、商标和肖像风险。',
          ],
        },
        videoBreakdown: {
          sources: ['reference-video-a.mp4'],
          actual: {
            summary: '目录证据视频拆解',
            dimensions: ['开头钩子', '字幕口播'],
            segments: [{
              timeRange: '0-3s',
              hook: '先抛真实痛点',
              visual: '早餐桌自然光',
              voiceover: '坚持难在每天顺手。',
              subtitle: '顺手完成',
              rhythm: '快速钩子',
              reusablePoint: '痛点后接低门槛动作',
            }],
            reusableFormula: ['痛点 -> 低门槛动作 -> 合规边界'],
            risks: [{ level: 'warning', message: '不照搬原视频画面，复核授权和合规表达。' }],
          },
          script: {
            title: '目录证据视频脚本',
            script: '镜头 1：真实痛点。\n镜头 2：低门槛动作。',
            storyboard: [{
              shot: 1,
              duration: '0-3s',
              visual: '自然光早餐桌。',
              voiceover: '先讲真实痛点。',
              subtitle: '顺手完成',
              rhythm: '快速钩子',
            }],
            videoPrompt: '15 秒 9:16 手机实拍视频，不复制原视频。',
            publishCheck: [
              { level: 'warning', message: '复核素材授权。' },
              { level: 'risk', message: '避免照搬参考视频。' },
            ],
            breakdownLogId: 'directory-video-breakdown',
          },
        },
        greenScreen: {
          actualCards: [{
            id: 'overlay-title-real',
            type: 'title',
            title: '标题卡',
            text: '早餐后顺手一次',
            durationSeconds: 3,
            assetPath: join(mixDir, 'overlays', '001-overlay-title.svg'),
            background: 'green-screen',
            aspectRatio: '9:16',
            promptDraftId: 'video-prompt-real',
            tags: ['绿幕文案图', '标题卡'],
          }, {
            id: 'overlay-selling-point-real',
            type: 'selling-point',
            title: '卖点卡',
            text: '抽屉包里都能放',
            durationSeconds: 4,
            assetPath: 'overlays/002-overlay-selling-point.svg',
            background: 'green-screen',
            aspectRatio: '9:16',
            promptDraftId: 'video-prompt-real',
            tags: ['绿幕文案图', '卖点卡'],
          }, {
            id: 'overlay-cta-real',
            type: 'cta',
            title: '行动卡',
            text: '先从顺手一次开始',
            durationSeconds: 4,
            assetPath: 'overlays/003-overlay-cta.svg',
            background: 'green-screen',
            aspectRatio: '9:16',
            promptDraftId: 'video-prompt-real',
            tags: ['绿幕文案图', '行动卡'],
          }],
          actualReviewStatuses: ['approved'],
        },
        videoPackage: { packageDir: mixDir },
        platformDraft: { packageDir: platformDir },
        mediaCost: {
          actual: {
            model: 'test-video-model',
            status: 'succeeded',
            durationSeconds: 10,
            currency: 'CNY',
            unitPrice: 1.5,
            estimatedCost: 15,
            source: 'provider-response',
          },
        },
        successfulAsset: {
          actual: {
            assetKey: 'imported:real-video:0',
            kind: 'video',
            path: join(mixDir, 'videos', '001-video.mp4'),
            title: '成品视频',
            reviewStatus: 'approved',
            workflowRunId: 'workflow-run-real',
            originalPromptDraftId: 'prompt-draft-real-video',
            workflowArtifactRefs: [
              'imported:real-video:0',
              'input-source:successful-asset-directory',
              'prompt-draft:successful-asset-directory-draft',
            ],
            distilledInputSource: {
              id: 'successful-asset-directory',
              kind: 'video',
              purpose: 'successful-asset',
              title: '成功素材沉淀 / 成品视频',
              sourcePath: join(mixDir, 'videos', '001-video.mp4'),
              tags: ['successful-asset', 'prompt-distilled', 'video', 'workflow-run'],
              relatedPromptDraftId: 'prompt-draft-real-video',
              relatedSceneCardIds: ['scene-directory-001'],
              extractedText: [
                '素材状态：已通过审核。',
                '质量原因：真实早餐桌自然光，动作节奏清楚。',
                '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
                '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
                '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
              ].join('\n'),
            },
            distilledPromptDraft: {
              id: 'successful-asset-directory-draft',
              title: '成功素材 Prompt：成品视频',
              purpose: 'video',
              status: 'confirmed',
              workflowRunId: 'workflow-run-real',
              inputSourceIds: ['successful-asset-directory'],
              sceneCardIds: ['scene-directory-001'],
              model: 'local-successful-asset-distiller',
              content: [
                '素材状态：已通过审核。',
                '质量原因：真实早餐桌自然光，动作节奏清楚。',
                '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
                '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
                '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
              ].join('\n'),
            },
          },
        },
        trace: {
          expectedWorkflowRunId: 'workflow-run-real',
          actualWorkflowRunRefs: [
            { source: 'reference-log', workflowRunId: 'workflow-run-real' },
            { source: 'video-breakdown-log', workflowRunId: 'workflow-run-real' },
            { source: 'video-script-log', workflowRunId: 'workflow-run-real' },
            { source: 'video-generation-log', workflowRunId: 'workflow-run-real' },
            { source: 'mix-package', workflowRunId: 'workflow-run-real' },
            { source: 'platform-draft', workflowRunId: 'workflow-run-real' },
          ],
        },
      },
    });

    assert.equal(report.summary.failed, 0);
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-files')?.actualFiles.includes('manifest.csv'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-trace')?.actualTraceFields.includes('promptDraftId'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualAssetKinds.includes('video'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualAssetKinds.includes('overlay'));
    assert.ok(report.sections.greenScreen.checks.find((check) => check.id === 'green-screen-card-fields')?.status === 'pass');
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.some((filePath) => filePath.endsWith('001-video.mp4')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.some((filePath) => filePath.endsWith('001-overlay-title.svg')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-approved-assets')?.actualReviewStatuses.includes('approved'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-import-guide')?.actualGuideTerms.includes('第三方混剪软件'));
    assert.equal(report.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import')?.status, 'pass');
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-external-import')?.evidenceFiles.some((filePath) => filePath.endsWith('capcut-import-screenshot.txt')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-files')?.actualFiles.includes('platform-copy.txt'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-trace')?.actualTraceFields.includes('sourceLogId'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('publishChecklist'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('publishBoundary'));
    assert.equal(report.sections.mediaCost.actual.estimatedCost, 15);
    assert.deepEqual(report.sections.trace.uniqueWorkflowRunIds, ['workflow-run-real']);
  });
});

test('v2 业务验收脚本可从工作区数据自动生成验收输入', async () => {
  await withWorkspace(async (workspacePath) => {
    const dataDir = join(workspacePath, '.content-studio');
    const mixDir = join(dataDir, 'assets', 'mix-packages', '真实混剪包');
    const platformDir = join(dataDir, 'assets', 'platform-drafts', '真实平台草稿包');
    await mkdir(join(mixDir, 'videos'), { recursive: true });
    await mkdir(join(mixDir, 'overlays'), { recursive: true });
    await mkdir(platformDir, { recursive: true });
    await writeFile(join(mixDir, 'videos', '001-video.mp4'), 'fake video fixture', 'utf-8');
    await writeFile(join(mixDir, 'overlays', '001-overlay-title.svg'), '<svg></svg>', 'utf-8');
    await writeFile(join(mixDir, 'manifest.csv'), '"kind","title","packagedPath"\n"video","成品视频","videos/001-video.mp4"\n"overlay","标题卡","overlays/001-overlay-title.svg"\n', 'utf-8');
    await writeFile(join(mixDir, 'import-guide.md'), [
      '# 工作区混剪包导入说明',
      '第三方混剪软件中先导入 videos/ 主体素材，再导入 overlays/ 绿幕文案图。',
      '使用 manifest.csv 对照素材用途、提示词来源和人工审核状态。',
    ].join('\n'), 'utf-8');
    await writeFile(join(mixDir, 'manifest.json'), JSON.stringify({
      schema: 'buguai.mix-package.v1',
      workflowRunId: 'workflow-run-workspace',
      assets: [{
        id: 'imported:workspace-video:0',
        kind: 'video',
        title: '成品视频',
        sourceId: 'input-source-workspace-video',
        promptDraftId: 'prompt-draft-workspace-video',
        packagedPath: join(mixDir, 'videos', '001-video.mp4'),
      }, {
        id: 'overlay:overlay-card-workspace-title',
        kind: 'overlay',
        title: '标题卡',
        reviewStatus: 'approved',
        reviewId: 'asset-review-workspace-overlay',
        sourceType: 'overlay-card',
        sourceId: 'overlay-card-workspace-title',
        promptDraftId: 'prompt-draft-workspace-video',
        durationSeconds: 3,
        packagedPath: join(mixDir, 'overlays', '001-overlay-title.svg'),
      }],
    }, null, 2), 'utf-8');
    await writeFile(join(platformDir, 'draft.md'), '# 工作区平台草稿\n\n这是一份从真实工作区读取的正文草稿，包含足够内容供发布前复核。', 'utf-8');
    await writeFile(join(platformDir, 'platform-copy.txt'), '标题：工作区平台草稿\n\n正文复制稿。\n\n发布前补充：封面图、摘要和配图位置需要人工确认。', 'utf-8');
    await writeFile(join(platformDir, 'format-guide.md'), '# 公众号 格式指南\n\n- 发布前复核事实引用、功效表达、绝对化词和医疗化暗示。', 'utf-8');
    await writeFile(join(platformDir, 'publish-checklist.md'), '# 工作区平台草稿 发布前检查\n\n## 检查项\n\n- [ ] WARNING：确认事实来源。\n\n## 交付边界\n\n- 本包只用于人工复制到目标平台前检查，不包含平台账号、授权或自动发布任务。\n- 发布前需要人工确认平台格式、封面、配图、引用事实和高风险表达。', 'utf-8');
    await writeFile(join(platformDir, 'manifest.json'), JSON.stringify({
      schema: 'buguai.platform-draft.v1',
      workflowRunId: 'workflow-run-workspace',
      promptDraftId: 'prompt-draft-workspace-article',
      sourceLogId: 'article-log-workspace',
      files: {
        markdown: 'draft.md',
        platformCopy: 'platform-copy.txt',
        formatGuide: 'format-guide.md',
        checklist: 'publish-checklist.md',
        metadata: 'metadata.json',
      },
    }, null, 2), 'utf-8');
    await writeFile(join(dataDir, 'brand-knowledge-bases.json'), JSON.stringify([{
      id: 'brand-kb-workspace',
      title: '工作区品牌知识库',
      productFacts: ['便携条包。', '办公室抽屉备用。'],
      coreSellingPoints: ['降低准备门槛。'],
      complianceBoundaries: ['不承诺治疗。', '不写绝对化收益。'],
      sceneSeeds: ['办公室抽屉里备用'],
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'ip-knowledge-bases.json'), JSON.stringify([{
      id: 'ip-kb-workspace',
      title: '工作区 IP 知识库',
      layers: {
        identity: '身份',
        values: '价值观',
        language: '语言',
        methodology: '方法论',
        materials: '素材',
        engine: '创作引擎',
      },
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'scene-cards.json'), JSON.stringify([{
      id: 'scene-workspace-1',
      title: '通勤包侧袋备用',
      audience: '通勤用户',
      painPoint: '出门后容易忘记准备。',
      usageScene: '通勤包侧袋',
      visualComposition: '真实包内俯拍，自然光。',
      sellingPoint: '便携条包方便随手取用。',
      imageMaterialSuggestion: '生成手机实拍包内场景图。',
      videoMaterialSuggestion: '生成 15 秒手部取用动作素材。',
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'input-sources.json'), JSON.stringify([{
      id: 'input-source-product-brief-workspace',
      workspacePath,
      kind: 'manual-note',
      status: 'converted',
      purpose: 'product-brief',
      title: '工作区产品资料',
      tags: ['产品资料', 'brief'],
      summary: '工作区产品资料',
      extractedText: [
        '产品名称：工作区便携条包',
        '卖点：小条包装，适合早餐后和办公室抽屉备用。',
        '规格：每盒 20 条，每条独立包装。',
        '适用场景：早餐后、办公室抽屉、通勤包侧袋。',
        '禁用表达：不承诺治疗，不写绝对化收益。',
      ].join('\n'),
      artifactRefs: [],
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'input-source-sku-workspace',
      workspacePath,
      kind: 'sku-table',
      status: 'converted',
      purpose: 'product-brief',
      title: '工作区 SKU 表',
      tags: ['SKU', '规格'],
      summary: '工作区 SKU 表',
      extractedText: [
        'SKU,规格,价格,适用场景',
        'trial-10,10 条装,49,首次尝试',
        'family-30,30 条装,129,家庭常备',
      ].join('\n'),
      artifactRefs: [],
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'input-source-feedback-workspace',
      workspacePath,
      kind: 'manual-note',
      status: 'converted',
      purpose: 'user-feedback',
      title: '工作区评论和客服问题',
      tags: ['评论', '客服问题'],
      summary: '工作区评论和客服问题',
      extractedText: [
        '用户：价格有点贵，值不值，怕是智商税。',
        '差评：买了以后不知道怎么用，步骤太复杂，坚持几天就忘记。',
        '客服：孩子和老人能不能吃，敏感人群有没有禁忌？',
        '评论：早餐后放办公室抽屉和通勤包里会不会更方便？',
      ].join('\n'),
      artifactRefs: [],
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'successful-asset-source-workspace',
      workspacePath,
      workflowRunId: 'workflow-run-workspace',
      kind: 'video',
      status: 'converted',
      purpose: 'successful-asset',
      title: '成功素材沉淀 / 成品视频',
      sourcePath: join(mixDir, 'videos', '001-video.mp4'),
      tags: ['successful-asset', 'prompt-distilled', 'video', 'workflow-run'],
      summary: '已通过素材反向沉淀 Prompt：成品视频',
      extractedText: [
        '素材状态：已通过审核。',
        '质量原因：真实早餐桌自然光，动作节奏清楚。',
        '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
        '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
        '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
      ].join('\n'),
      artifactRefs: [],
      relatedPromptDraftId: 'video-prompt-original-workspace',
      relatedSceneCardIds: ['scene-workspace-001'],
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'generation-logs.json'), JSON.stringify([{
      id: 'reference-log-workspace',
      workflowRunId: 'workflow-run-workspace',
      kind: 'reference-reverse',
      status: 'succeeded',
      input: {
        referenceSources: [
          { id: 'reference-a', title: '素材 A', kind: 'image', purpose: 'reference', sourcePath: 'asset-a' },
          { id: 'reference-video-a', title: '素材 B', kind: 'video', purpose: 'reference', sourcePath: 'asset-b' },
        ],
      },
      output: {
        analysis: {
          composition: '构图',
          lighting: '光线',
          negativePrompt: '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
          risks: ['需要人工复核素材授权、商标和肖像风险。'],
          qualityChecklist: ['主体一致', '来源可追溯', '无竞品可识别元素'],
        },
      },
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'video-breakdown-workspace',
      workflowRunId: 'workflow-run-workspace',
      kind: 'video-breakdown',
      status: 'succeeded',
      input: {
        sourceType: 'file',
        source: 'reference-video-a.mp4',
        dimensions: ['开头钩子', '字幕口播'],
      },
      output: {
        summary: '工作区视频拆解',
        dimensions: ['开头钩子', '字幕口播'],
        segments: [{
          timeRange: '0-3s',
          hook: '先抛真实痛点',
          visual: '早餐桌自然光',
          voiceover: '坚持难在每天顺手。',
          subtitle: '顺手完成',
          rhythm: '快速钩子',
          reusablePoint: '痛点后接低门槛动作',
        }],
        reusableFormula: ['痛点 -> 低门槛动作 -> 合规边界'],
        risks: [{ level: 'warning', message: '不照搬原视频画面，复核授权和合规表达。' }],
      },
      updatedAt: '2026-05-22T01:00:01.000Z',
    }, {
      id: 'video-script-workspace',
      workflowRunId: 'workflow-run-workspace',
      kind: 'video-script',
      status: 'succeeded',
      input: {
        breakdownLogId: 'video-breakdown-workspace',
      },
      output: {
        title: '工作区视频脚本',
        script: '镜头 1：真实痛点。\n镜头 2：低门槛动作。',
        storyboard: [{
          shot: 1,
          duration: '0-3s',
          visual: '自然光早餐桌。',
          voiceover: '先讲真实痛点。',
          subtitle: '顺手完成',
          rhythm: '快速钩子',
        }],
        videoPrompt: '15 秒 9:16 手机实拍视频，不复制原视频。',
        publishCheck: [
          { level: 'warning', message: '复核素材授权。' },
          { level: 'risk', message: '避免照搬参考视频。' },
        ],
      },
      updatedAt: '2026-05-22T01:00:02.000Z',
    }, {
      id: 'video-log-workspace',
      workflowRunId: 'workflow-run-workspace',
      kind: 'video',
      status: 'succeeded',
      model: 'test-video-model',
      output: {
        model: 'test-video-model',
        durationSeconds: 10,
        costEstimate: {
          currency: 'CNY',
          durationSeconds: 10,
          source: 'provider-response',
          unitPrice: 1.5,
          estimatedCost: 15,
        },
      },
      updatedAt: '2026-05-22T01:00:03.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'mix-packages.json'), JSON.stringify([{
      id: 'mix-package-workspace',
      packageDir: mixDir,
      manifestPath: join(mixDir, 'manifest.json'),
      manifestCsvPath: join(mixDir, 'manifest.csv'),
      importGuidePath: join(mixDir, 'import-guide.md'),
      workflowRunId: 'workflow-run-workspace',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'asset-reviews.json'), JSON.stringify([{
      id: 'asset-review-workspace-video',
      assetKey: 'imported:workspace-video:0',
      kind: 'video',
      sourceType: 'input-source',
      sourceId: 'input-source-workspace-video',
      path: join(mixDir, 'videos', '001-video.mp4'),
      title: '成品视频',
      status: 'approved',
      tags: ['第三方生成', '成品视频'],
      reviewedAt: '2026-05-22T01:00:00.000Z',
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }, {
      id: 'asset-review-workspace-overlay',
      assetKey: 'overlay:overlay-card-workspace-title',
      kind: 'overlay',
      sourceType: 'overlay-card',
      sourceId: 'overlay-card-workspace-title',
      path: join(mixDir, 'overlays', '001-overlay-title.svg'),
      title: '标题卡',
      status: 'approved',
      tags: ['绿幕文案图', '标题卡'],
      reviewedAt: '2026-05-22T01:00:04.000Z',
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'overlay-cards.json'), JSON.stringify([{
      id: 'overlay-card-workspace-title',
      workspacePath,
      promptDraftId: 'prompt-draft-workspace-video',
      type: 'title',
      title: '标题卡',
      text: '早餐后顺手一次',
      durationSeconds: 3,
      status: 'exported',
      assetPath: join(mixDir, 'overlays', '001-overlay-title.svg'),
      background: 'green-screen',
      aspectRatio: '9:16',
      tags: ['绿幕文案图', '标题卡'],
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }, {
      id: 'overlay-card-workspace-selling-point',
      workspacePath,
      promptDraftId: 'prompt-draft-workspace-video',
      type: 'selling-point',
      title: '卖点卡',
      text: '抽屉包里都能放',
      durationSeconds: 4,
      status: 'exported',
      assetPath: join(mixDir, 'overlays', '002-overlay-selling-point.svg'),
      background: 'green-screen',
      aspectRatio: '9:16',
      tags: ['绿幕文案图', '卖点卡'],
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }, {
      id: 'overlay-card-workspace-cta',
      workspacePath,
      promptDraftId: 'prompt-draft-workspace-video',
      type: 'cta',
      title: '行动卡',
      text: '先从顺手一次开始',
      durationSeconds: 4,
      status: 'exported',
      assetPath: join(mixDir, 'overlays', '003-overlay-cta.svg'),
      background: 'green-screen',
      aspectRatio: '9:16',
      tags: ['绿幕文案图', '行动卡'],
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'prompt-drafts.json'), JSON.stringify([{
      id: 'successful-asset-draft-workspace',
      workspacePath,
      workflowRunId: 'workflow-run-workspace',
      title: '成功素材 Prompt：成品视频',
      purpose: 'video',
      status: 'confirmed',
      userIntent: '复用通过审核素材「成品视频」的成功经验。',
      inputSourceIds: ['successful-asset-source-workspace'],
      sceneCardIds: ['scene-workspace-001'],
      copyCount: 0,
      model: 'local-successful-asset-distiller',
      versions: [{
        id: 'successful-asset-version-workspace',
        version: 1,
        content: [
          '素材状态：已通过审核。',
          '质量原因：真实早餐桌自然光，动作节奏清楚。',
          '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
          '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
          '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
        ].join('\n'),
        createdAt: '2026-05-22T01:00:04.000Z',
      }],
      activeVersionId: 'successful-asset-version-workspace',
      createdAt: '2026-05-22T01:00:04.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'workflow-runs.json'), JSON.stringify([{
      id: 'workflow-run-workspace',
      workspacePath,
      workflowDefinitionId: 'video-material-package',
      workflowKey: 'video-material-package',
      workflowVersion: '1.0.0',
      title: '工作区视频素材包 SOP',
      status: 'succeeded',
      summary: '已从通过素材沉淀 Prompt 草稿。',
      inputs: {},
      steps: [],
      artifactRefs: [
        'imported:workspace-video:0',
        'input-source:successful-asset-source-workspace',
        'prompt-draft:successful-asset-draft-workspace',
      ],
      createdAt: '2026-05-22T01:00:00.000Z',
      updatedAt: '2026-05-22T01:00:04.000Z',
    }], null, 2), 'utf-8');
    await writeFile(join(dataDir, 'platform-drafts.json'), JSON.stringify([{
      id: 'platform-draft-workspace',
      packageDir: platformDir,
      manifestPath: join(platformDir, 'manifest.json'),
      workflowRunId: 'workflow-run-workspace',
      updatedAt: '2026-05-22T01:00:00.000Z',
    }], null, 2), 'utf-8');

    const acceptanceInput = await loadWorkspaceAcceptanceInput(workspacePath);
    const report = await buildBusinessAcceptanceReport({}, {
      providerReport: await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false }),
      acceptanceInput,
      mode: 'workspace',
    });

    assert.equal(report.mode, 'workspace');
    assert.equal(report.summary.failed, 0, JSON.stringify(
      Object.values(report.sections)
        .flatMap((section) => section.checks ?? [])
        .filter((check) => check.status === 'fail')
        .map((check) => ({ id: check.id, title: check.title, details: check.details })),
      null,
      2,
    ));
    assert.equal(report.sections.brand.sample, '工作区品牌知识库');
    assert.equal(report.sections.productBrief.productName, '工作区便携条包');
    assert.ok(report.sections.productBrief.checks.find((check) => check.id === 'product-brief-downstream-ready')?.status === 'pass');
    assert.ok(report.sections.productBrief.checks.find((check) => check.id === 'product-brief-prompt-plan')?.status === 'pass');
    assert.ok(report.sections.productBrief.checks.find((check) => check.id === 'product-brief-prompt-trace')?.status === 'pass');
    assert.ok(report.sections.productBrief.promptPlan.some((item) => item.type === 'main-image' && item.skuTrace.includes('trial-10')));
    assert.ok(report.sections.feedback.clusters.some((cluster) => cluster.key === 'price-trust'));
    assert.ok(report.sections.feedback.checks.find((check) => check.id === 'feedback-matrix')?.status === 'pass');
    assert.ok(report.sections.feedback.checks.find((check) => check.id === 'feedback-title-directions')?.status === 'pass');
    assert.ok(report.sections.feedback.checks.find((check) => check.id === 'feedback-objection-responses')?.status === 'pass');
    assert.ok(report.sections.feedback.objectionResponses.some((item) => item.boundary.includes('人工复核')));
    assert.equal(report.sections.videoBreakdown.sources[0], 'reference-video-a.mp4');
    assert.ok(report.sections.videoBreakdown.checks.find((check) => check.id === 'video-breakdown-boundary')?.status === 'pass');
    assert.ok(report.sections.videoBreakdown.checks.find((check) => check.id === 'video-script-trace')?.status === 'pass');
    assert.deepEqual(report.sections.greenScreen.actualTypes.sort(), ['cta', 'selling-point', 'title']);
    assert.ok(report.sections.greenScreen.checks.find((check) => check.id === 'green-screen-card-approved')?.status === 'pass');
    assert.equal(report.sections.successfulAsset.asset.reviewStatus, 'approved');
    assert.ok(report.sections.successfulAsset.checks.find((check) => check.id === 'successful-asset-prompt-draft')?.status === 'pass');
    assert.ok(report.sections.successfulAsset.checks.find((check) => check.id === 'successful-asset-workflow-trace')?.status === 'pass');
    assert.equal(report.sections.reference.sampleSources[0], '素材 A');
    assert.deepEqual(report.sections.reference.sourceKinds.sort(), ['image', 'video']);
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-trace')?.actualTraceFields.includes('workflowRunId'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualAssetKinds.includes('video'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualAssetKinds.includes('overlay'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.some((filePath) => filePath.endsWith('001-video.mp4')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.some((filePath) => filePath.endsWith('001-overlay-title.svg')));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-approved-assets')?.actualReviewStatuses.includes('approved'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-import-guide')?.actualGuideTerms.includes('manifest.csv'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-trace')?.actualTraceFields.includes('promptDraftId'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('platformCopy'));
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('publishBoundary'));
    assert.equal(report.sections.mediaCost.actual.estimatedCost, 15);
    assert.ok(report.sections.trace.checks.find((check) => check.id === 'workflow-run-trace-coverage')?.status === 'pass');
    assert.deepEqual(report.sections.trace.uniqueWorkflowRunIds, ['workflow-run-workspace']);
  });
});

test('v2 业务验收脚本可读取真实服务写入的工作区 SOP 产物', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const assetReviews = new AssetReviewStore();
    const promptPacks = new PromptPackService(logs, text);
    const brandKnowledgeBases = new BrandKnowledgeBaseStore(text);
    const ipKnowledgeBases = new IpKnowledgeBaseStore(text);
    const sceneCards = new SceneLibraryStore(logs, promptPacks, text);
    const overlayCards = new OverlayCardStore();
    const mixPackages = new MixPackageStore(assetReviews);
    const platformDrafts = new PlatformDraftStore(logs);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      assetReviews,
      brandKnowledgeBases,
      promptPacks,
      sceneCards,
      undefined,
      ipKnowledgeBases,
      overlayCards,
    );
    const definitions = await workflows.listDefinitions(workspacePath);
    const brandDefinition = definitions.find((item) => item.key === 'brand-scene-prompts');
    const ipDefinition = definitions.find((item) => item.key === 'ip-longform');
    const productDefinition = definitions.find((item) => item.key === 'product-commercial-assets');
    const feedbackDefinition = definitions.find((item) => item.key === 'feedback-topic-matrix');
    const greenDefinition = definitions.find((item) => item.key === 'green-screen-card-package');
    const videoDefinition = definitions.find((item) => item.key === 'video-material-package');
    assert.ok(brandDefinition, '应存在品牌场景 SOP');
    assert.ok(ipDefinition, '应存在 IP 内容 SOP');
    assert.ok(productDefinition, '应存在产品商业素材 SOP');
    assert.ok(feedbackDefinition, '应存在评论痛点选题 SOP');
    assert.ok(greenDefinition, '应存在绿幕文案图 SOP');
    assert.ok(videoDefinition, '应存在视频素材包 SOP');

    const brandRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: brandDefinition.id,
      inputs: {
        source: [
          '产品名称：真实工作区便携条包',
          '产品事实：便携条包，适合早餐后、办公室抽屉和通勤包中随手取用。',
          '核心卖点：降低准备门槛，适合忙碌办公人群。',
          '场景：早餐后、办公室抽屉、通勤包侧袋。',
          '合规边界：不承诺治疗，不写绝对化收益。',
        ].join('\n'),
        intent: '生成真实生活场景库和 10 组 UGC 图片 / 视频 Prompt。',
        reviewOwner: '品牌运营',
      },
    });
    assert.equal(brandRun.status, 'queued');

    const ipRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: ipDefinition.id,
      inputs: {
        source: [
          '身份：嘉文老师，长期讲普通人可执行的内容方法。',
          '价值观：先讲事实和边界，再讲行动建议。',
          '语言：自然、克制、像一对一解释。',
          '方法论：用真实案例、反常识切入和发布前检查做内容。',
          '素材：课程大纲、工作坊记录、咨询问答。',
          '创作引擎：口播、朋友圈、私域回复和产品化咨询。',
        ].join('\n'),
        intent: '构建六层 IP 知识库并生成口播内容 Prompt。',
        reviewOwner: 'IP 主理人',
      },
    });
    assert.equal(ipRun.status, 'queued');

    const productBrief = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '真实工作区产品资料',
      tags: ['产品资料', 'brief'],
      text: [
        '产品名称：真实工作区便携条包',
        '卖点：早餐后、办公室抽屉和通勤包里都能顺手取用。',
        '规格：每盒 20 条，每条独立包装。',
        '适用场景：早餐后、办公室抽屉、通勤包侧袋。',
        '禁用表达：不承诺治疗，不写绝对化收益。',
      ].join('\n'),
    });
    const skuTable = await inputSources.register({
      workspacePath,
      kind: 'sku-table',
      purpose: 'product-brief',
      title: '真实工作区 SKU 表',
      tags: ['SKU', '规格'],
      text: [
        'SKU,规格,价格,适用场景',
        'trial-10,10 条装,49,首次尝试',
        'family-30,30 条装,129,家庭常备',
      ].join('\n'),
    });
    const productRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: productDefinition.id,
      inputSourceIds: [productBrief.id, skuTable.id],
      inputs: {
        source: '真实工作区产品资料和 SKU 表',
        intent: '生成主图、卖点图和详情页局部图 Prompt。',
        reviewOwner: '电商运营',
        platform: '通用电商',
      },
    });
    assert.equal(productRun.status, 'blocked');
    assert.equal(productRun.steps.find((step) => step.stepId === 'product_brief_structure')?.status, 'succeeded');

    const feedback = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '真实工作区评论和客服问题',
      tags: ['评论', '差评', '客服问题'],
      text: [
        '评论：价格有点贵，想知道到底值不值。',
        '差评：早上总是忘记吃，坚持不下来。',
        '客服：孩子和老人能不能吃，有没有禁忌？',
        '私信：办公室抽屉里放一盒会不会方便一点？',
      ].join('\n'),
    });
    const feedbackRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: feedbackDefinition.id,
      inputSourceIds: [feedback.id],
      inputs: {
        source: '真实工作区评论、差评和客服问题',
        intent: '生成标题方向、内容角度和客服异议话术。',
        reviewOwner: '运营负责人',
        platform: '小红书',
      },
    });
    assert.equal(feedbackRun.status, 'queued');
    assert.equal(feedbackRun.steps.find((step) => step.stepId === 'feedback_cluster')?.status, 'succeeded');

    const greenRun = await engine.startRun({
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
    assert.equal(greenRun.status, 'queued');
    assert.equal(greenRun.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'succeeded');
    const generatedOverlayCards = await overlayCards.list(workspacePath);
    assert.equal(generatedOverlayCards.length, 3);
    for (const card of generatedOverlayCards) {
      await assetReviews.review({
        workspacePath,
        workflowRunId: greenRun.id,
        assetKey: `overlay:${card.id}`,
        kind: 'overlay',
        sourceType: 'overlay-card',
        sourceId: card.id,
        path: card.assetPath,
        title: card.title,
        status: 'approved',
        tags: card.tags,
      });
    }

    const videoRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: videoDefinition.id,
      inputs: {
        source: '真实工作区视频素材包：已通过图片、口播脚本和绿幕卡。',
        intent: '生成 15 秒视频 Prompt，手动复制到第三方平台，并导入成品视频后导出混剪包。',
        reviewOwner: '短视频运营',
        duration: '15',
      },
    });
    const videoPromptDraftId = videoRun.steps.find((step) => step.stepId === 'prompt_generate')?.output?.promptDraftId;
    assert.equal(videoRun.status, 'queued');
    assert.equal(typeof videoPromptDraftId, 'string');
    await promptDrafts.recordCopy({
      workspacePath,
      draftId: videoPromptDraftId,
      target: 'RunningHub',
    });
    const copiedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: videoRun.id,
      event: 'video-prompt-copied',
      promptDraftId: videoPromptDraftId,
      summary: '已复制到第三方视频平台。',
    });

    const finishedVideoPath = join(workspacePath, '真实第三方成品视频.mp4');
    await writeFile(finishedVideoPath, TEST_VIDEO);
    const importedVideo = await inputSources.importFile(workspacePath, finishedVideoPath, 'successful-asset', {
      workflowRunId: copiedRun.id,
      relatedPromptDraftId: videoPromptDraftId,
      tags: ['第三方生成', '成品视频'],
    });
    const importedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: copiedRun.id,
      event: 'finished-video-imported',
      inputSourceId: importedVideo.id,
      promptDraftId: videoPromptDraftId,
    });
    const importedAssetKey = `imported:${importedVideo.id}:0:${importedVideo.sourcePath}`;
    const videoReview = await assetReviews.review({
      workspacePath,
      workflowRunId: importedRun.id,
      assetKey: importedAssetKey,
      kind: 'video',
      sourceType: 'input-source',
      sourceId: importedVideo.id,
      path: importedVideo.sourcePath,
      title: importedVideo.title,
      status: 'approved',
      tags: importedVideo.tags,
    });
    const overlayCard = generatedOverlayCards.find((card) => card.type === 'title') ?? generatedOverlayCards[0];
    const overlayAssetKey = `overlay:${overlayCard.id}`;
    const overlayRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: importedRun.id,
      event: 'overlay-cards-generated',
      promptDraftId: videoPromptDraftId,
      overlayCardIds: generatedOverlayCards.map((card) => card.id),
    });
    const reviewedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: overlayRun.id,
      event: 'asset-reviewed',
      assetReviewId: videoReview.id,
      assetKey: videoReview.assetKey,
    });

    const promptDraft = (await promptDrafts.list(workspacePath)).find((draft) => draft.id === videoPromptDraftId);
    const promptText = promptDraft?.versions.find((version) => version.id === promptDraft.activeVersionId)?.content
      ?? promptDraft?.versions[0]?.content
      ?? '';
    const mixPackage = await mixPackages.exportPackage({
      workspacePath,
      workflowRunId: reviewedRun.id,
      title: '真实工作区混剪包',
      platform: 'third-party-mix-tool',
      assets: [
        {
          id: importedAssetKey,
          kind: 'video',
          title: importedVideo.title,
          path: importedVideo.sourcePath,
          sourceType: 'input-source',
          sourceId: importedVideo.id,
          promptDraftId: videoPromptDraftId,
          promptText,
          tags: importedVideo.tags,
        },
        {
          id: overlayAssetKey,
          kind: 'overlay',
          title: overlayCard.title,
          path: overlayCard.assetPath,
          sourceType: 'overlay-card',
          sourceId: overlayCard.id,
          promptDraftId: videoPromptDraftId,
          promptText: overlayCard.text,
          tags: overlayCard.tags,
        },
      ],
    });
    const completedVideoRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: reviewedRun.id,
      event: 'mix-package-exported',
      mixPackageId: mixPackage.id,
      manifestPath: mixPackage.manifestPath,
      manifestCsvPath: mixPackage.manifestCsvPath,
      importGuidePath: mixPackage.importGuidePath,
      packageDir: mixPackage.packageDir,
    });
    assert.equal(completedVideoRun.status, 'succeeded');

    const referenceLog = await logs.append({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'reference-reverse',
      status: 'succeeded',
      title: '真实工作区对标反推',
      input: {
        referenceSources: [
          { id: 'reference-image-real', title: '真实参考图', kind: 'image', purpose: 'reference', sourcePath: 'reference-image.png' },
          { id: 'reference-video-real', title: '真实参考视频', kind: 'video', purpose: 'reference', sourcePath: 'reference-video.mp4' },
        ],
      },
      output: {
        analysis: {
          composition: '手机竖图，产品在真实桌面中自然出现。',
          lighting: '自然光。',
          textArea: '上方留出短标题区。',
          style: 'UGC 手机实拍感。',
          reusableElements: ['自然光', '桌面动作'],
          prompt: '真实手机实拍产品使用场景。',
          negativePrompt: '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
          risks: ['需要人工复核素材授权、商标和肖像风险。'],
          qualityChecklist: ['主体一致', '来源可追溯', '无竞品可识别元素'],
        },
      },
    });
    const videoBreakdownLog = await logs.append({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'video-breakdown',
      status: 'succeeded',
      title: '真实工作区参考视频拆解',
      input: {
        sourceType: 'file',
        source: 'reference-video.mp4',
      },
      output: {
        summary: '真实工作区参考视频拆解。',
        dimensions: ['开头钩子', '字幕口播'],
        segments: [{
          timeRange: '0-3s',
          hook: '先抛真实痛点',
          visual: '早餐桌自然光',
          voiceover: '坚持难在每天顺手。',
          subtitle: '顺手完成',
          rhythm: '快速钩子',
          reusablePoint: '痛点后接低门槛动作',
        }],
        reusableFormula: ['痛点 -> 低门槛动作 -> 合规边界'],
        risks: [{ level: 'warning', message: '不照搬原视频画面，复核授权和合规表达。' }],
      },
    });
    const videoScriptLog = await logs.append({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'video-script',
      status: 'succeeded',
      title: '真实工作区视频脚本',
      input: {
        breakdownLogId: videoBreakdownLog.id,
      },
      output: {
        title: '真实工作区视频脚本',
        script: '镜头 1：真实痛点。\n镜头 2：低门槛动作。',
        storyboard: [{
          shot: 1,
          duration: '0-3s',
          visual: '自然光早餐桌。',
          voiceover: '先讲真实痛点。',
          subtitle: '顺手完成',
          rhythm: '快速钩子',
        }],
        videoPrompt: '15 秒 9:16 手机实拍视频，不复制原视频。',
        publishCheck: [
          { level: 'warning', message: '复核素材授权。' },
          { level: 'risk', message: '避免照搬参考视频。' },
        ],
      },
    });
    await logs.append({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'video',
      status: 'succeeded',
      title: '真实工作区视频生成成本',
      model: 'test-video-model',
      output: {
        model: 'test-video-model',
        durationSeconds: 10,
        costEstimate: {
          currency: 'CNY',
          durationSeconds: 10,
          source: 'provider-response',
          unitPrice: 1.5,
          estimatedCost: 15,
        },
      },
    });
    await platformDrafts.exportDraft({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      promptDraftId: videoPromptDraftId,
      sourceLogId: videoScriptLog.id,
      platform: '公众号',
      title: '真实工作区平台草稿',
      topic: '便携条包真实使用场景',
      audience: '通勤和办公用户',
      tone: '真实、克制、可复核',
      markdown: '# 真实工作区平台草稿\n\n这是一份由真实工作区服务导出的正文草稿，保留发布前复核边界。',
      publishCheck: [
        { level: 'warning', message: '发布前复核产品事实。' },
        { level: 'risk', message: '避免医疗化承诺。' },
      ],
    });

    const distilledSource = await inputSources.register({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      kind: 'video',
      purpose: 'successful-asset',
      title: '成功素材沉淀 / 真实第三方成品视频',
      sourcePath: importedVideo.sourcePath,
      tags: ['successful-asset', 'prompt-distilled', 'video', 'workflow-run'],
      relatedPromptDraftId: videoPromptDraftId,
      relatedSceneCardIds: ['scene-card-real-video'],
      text: [
        '素材状态：已通过审核。',
        '质量原因：真实早餐桌自然光，动作节奏清楚。',
        '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
        '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
        '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
      ].join('\n'),
    });
    const distilledDraft = await promptDrafts.createFromContent({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      title: '成功素材 Prompt：真实第三方成品视频',
      purpose: 'video',
      userIntent: '复用通过审核素材的成功经验。',
      inputSourceIds: [distilledSource.id],
      content: [
        '素材状态：已通过审核。',
        '质量原因：真实早餐桌自然光，动作节奏清楚。',
        '复用 Prompt 草稿：15 秒手机实拍视频，早餐桌自然光，不复制竞品元素。',
        '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
        '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
      ].join('\n'),
      note: '由成功素材回炉生成',
      model: 'local-successful-asset-distiller',
      status: 'confirmed',
    });
    await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: completedVideoRun.id,
      event: 'asset-prompt-distilled',
      inputSourceId: distilledSource.id,
      promptDraftId: distilledDraft.id,
      assetKey: importedAssetKey,
    });

    const acceptanceInput = await loadWorkspaceAcceptanceInput(workspacePath);
    const report = await buildBusinessAcceptanceReport({}, {
      providerReport: await buildProviderCheckReport({}, { allowNetwork: false, allowMedia: false }),
      acceptanceInput,
      mode: 'workspace',
    });

    assert.equal(report.mode, 'workspace');
    assert.equal(report.summary.failed, 0, JSON.stringify(
      Object.values(report.sections)
        .flatMap((section) => section.checks ?? [])
        .filter((check) => check.status === 'fail')
        .map((check) => ({ id: check.id, title: check.title, details: check.details })),
      null,
      2,
    ));
    assert.equal(report.sections.productBrief.productName, '真实工作区便携条包');
    assert.ok(report.sections.productBrief.checks.find((check) => check.id === 'product-brief-prompt-trace')?.status === 'pass');
    assert.ok(report.sections.feedback.checks.find((check) => check.id === 'feedback-objection-responses')?.status === 'pass');
    assert.deepEqual(report.sections.greenScreen.actualTypes.sort(), ['cta', 'selling-point', 'title']);
    assert.ok(report.sections.greenScreen.checks.find((check) => check.id === 'green-screen-card-approved')?.status === 'pass');
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'mix-package-assets')?.actualPackagedFilePaths.length >= 2);
    assert.ok(report.sections.delivery.checks.find((check) => check.id === 'platform-draft-content')?.actualContentFields.includes('publishBoundary'));
    assert.equal(report.sections.successfulAsset.asset.reviewStatus, 'approved');
    assert.ok(report.sections.successfulAsset.checks.find((check) => check.id === 'successful-asset-workflow-trace')?.status === 'pass');
    assert.ok(report.sections.reference.sampleSources.includes('真实参考图'));
    assert.equal(report.sections.mediaCost.actual.estimatedCost, 15);
    assert.deepEqual(report.sections.trace.uniqueWorkflowRunIds, [completedVideoRun.id]);
    assert.equal(referenceLog.workflowRunId, completedVideoRun.id);
  });
});

test('品牌和 IP 知识库可以从知识引用生成并落盘', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new FakeTextGenerationService();
    const brandStore = new BrandKnowledgeBaseStore(text);
    const ipStore = new IpKnowledgeBaseStore(text);

    const brand = await brandStore.generate({
      workspacePath,
      title: '唯他瑞品牌知识库',
      citations: [citation],
    });
    const ip = await ipStore.generate({
      workspacePath,
      title: '嘉文老师 IP 知识库',
      citations: [{
        knowledgeBaseId: 'ip-demo',
        sectionId: 'profile-1',
        title: '嘉文老师 / 人物档案',
        sectionType: 'profile',
        excerpt: '身份锚定、价值观立场、语言风格、判断方法、内容素材、创作引擎。',
      }],
    });

    assert.equal(brand.status, 'ready');
    assert.equal(ip.status, 'ready');
    assert.equal(brand.brandVoice.includes('真实'), true);
    assert.equal(ip.layers.identity.includes('身份'), true);
    assert.ok((await brandStore.list(workspacePath)).length >= 1);
    assert.ok((await ipStore.list(workspacePath)).length >= 1);
  });
});

test('工作流运行会记录步骤输入、输出和 artifact 引用', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const definitions = await workflows.listDefinitions(workspacePath);
    const definition = definitions.find((item) => item.key === 'xiaohongshu-seeding-image');
    assert.ok(definition, '应存在内置小红书种草图 SOP');

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '产品图 / 参考图 / 产品资料',
        intent: '生成小红书真实种草图 SOP 运行记录',
        reviewOwner: '审核人 A',
        platform: '小红书',
      },
    });

    assert.equal(run.status, 'queued');
    assert.ok(run.artifactRefs.length > 0);
    assert.match(run.artifactRefs[0], /^workflow-run:/);
    assert.equal(run.steps[0].status, 'succeeded');
    assert.match(JSON.stringify(run.steps[0].input), /source/);
    assert.match(JSON.stringify(run.steps[0].output), /已登记输入/);
    assert.equal(run.steps.find((step) => step.status === 'blocked'), undefined);
    assert.equal(run.steps.find((step) => step.stepId === 'reference_reverse')?.status, 'queued');
    assert.match(run.summary, /等待后续步骤执行/);
  });
});

test('SOP 缺少必填输入时不会进入后续执行步骤', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌场景提示词 SOP');

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '',
        intent: '',
      },
    });

    assert.equal(run.status, 'blocked');
    assert.match(run.summary, /缺少必填字段：资料来源、用户意图/);
    assert.equal(run.steps[0].status, 'blocked');
    assert.equal(run.steps[0].error, 'WORKFLOW_REQUIRED_INPUT_MISSING');
    assert.deepEqual(run.steps[0].output.missingRequired, ['资料来源', '用户意图']);
    assert.equal(run.steps.find((step) => step.stepId === 'brand_extract')?.status, 'queued');
  });
});

test('SOP 已选择输入源时补充资料说明可以为空', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const inputSources = new InputSourceStore();
    const source = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'brand-kb',
      title: '已登记品牌资料',
      text: '品牌事实：真实场景、合规边界和产品卖点。',
      summary: '已登记品牌资料',
    });
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌场景提示词 SOP');

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [source.id],
      inputs: {
        source: '',
        intent: '从已选择资料生成真实生活场景 Prompt。',
      },
    });

    assert.equal(run.status, 'queued');
    assert.deepEqual(run.inputSourceIds, [source.id]);
    assert.equal(run.steps[0].status, 'succeeded');
    assert.equal(run.steps[0].output.missingRequired, undefined);
  });
});

test('SOP 已选择知识引用时补充资料说明可以为空', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌场景提示词 SOP');

    const citations = [
      {
        knowledgeBaseId: 'brand-kb-selected',
        sectionId: 'facts',
        title: '产品知识库 / 产品事实',
        sectionType: 'product',
        excerpt: '便携条包适合早餐后和办公室抽屉场景。',
      },
    ];
    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      citations,
      inputs: {
        source: '',
        intent: '从已选择知识引用生成真实生活场景 Prompt。',
      },
    });

    assert.equal(run.status, 'queued');
    assert.deepEqual(run.citations, citations);
    assert.equal(run.steps[0].status, 'succeeded');
    assert.equal(run.steps[0].output.missingRequired, undefined);
    assert.match(JSON.stringify(run.steps[0].input), /selectedCitations/);
  });
});

test('SOP 草案可以编辑、发布并运行', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const draft = await workflows.createDraft({
      workspacePath,
      templateKey: 'brand-scene-prompts',
      title: '功能测试自定义 SOP 草案',
    });
    const edited = await workflows.updateDefinition({
      ...draft,
      title: '功能测试可运行 SOP',
      description: '验证草案编辑后可以发布并创建运行记录。',
      version: 'v0.2',
      priority: 'P1',
      tags: ['功能测试', '自定义 SOP'],
      inputSchema: [
        { key: 'source', label: '资料来源', type: 'textarea', required: true },
        { key: 'intent', label: '执行目标', type: 'textarea', required: true },
      ],
      steps: [
        { id: 'input_register', title: '登记输入源', kind: 'input', description: '登记资料和目标。', dependsOn: [], outputKeys: ['InputSource'] },
        { id: 'human_review', title: '人工审核', kind: 'review', description: '确认输入和执行目标。', dependsOn: ['input_register'], outputKeys: ['ReviewResult'] },
        { id: 'asset_store', title: '入历史', kind: 'asset-store', description: '归档本次 SOP 运行。', dependsOn: ['human_review'], outputKeys: ['RunArchive'] },
      ],
      reviewRules: ['必须确认资料来源清楚。'],
      outputSpec: ['RunArchive'],
    });
    assert.equal(edited.title, '功能测试可运行 SOP');
    assert.equal(edited.status, 'draft');
    assert.equal(edited.steps.length, 3);

    const published = await workflows.updateDefinition({ ...edited, status: 'published' });
    assert.equal(published.status, 'published');

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: published.id,
      inputs: {
        source: '一份本地 SOP 输入资料',
        intent: '验证定义编辑发布后可以运行。',
      },
    });
    assert.equal(run.title, '功能测试可运行 SOP');
    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.match(JSON.stringify(run.steps[0].input), /一份本地 SOP 输入资料/);
  });
});

test('无模板 SOP 草案使用通用方法论脚手架，不误套图片 SOP', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const draft = await workflows.createDraft({
      workspacePath,
      title: 'Prompt 工作台沉淀 SOP 草案',
      description: '由 SOP 提示词草稿物化，应该保持通用步骤而不是小红书图片模板。',
    });

    assert.match(draft.key, /^custom-sop-draft-/);
    assert.equal(draft.title, 'Prompt 工作台沉淀 SOP 草案');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.steps.some((step) => step.id === 'agent_read'), true);
    assert.equal(draft.steps.some((step) => step.id === 'image_generate'), false);
    assert.equal(draft.reviewRules.some((rule) => rule.includes('真实 provider')), true);
    assert.deepEqual(draft.tags, ['自定义', '提示词草稿', 'SOP']);
  });
});

test('从内置视频 SOP 复制出的草案发布后仍可推进手工事件', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const draft = await workflows.createDraft({
      workspacePath,
      templateKey: 'video-material-package',
      title: '客户自定义视频素材包 SOP',
    });
    const published = await workflows.updateDefinition({
      ...draft,
      status: 'published',
    });
    assert.match(published.key, /^video-material-package-draft-/);

    const started = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: published.id,
      inputs: {
        source: '客户自定义素材库和脚本。',
        intent: '生成 15 秒素材 Prompt，第三方生成后导入并交付混剪包。',
        duration: '15',
      },
    });
    assert.equal(started.workflowKey, published.key);

    const copied = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: started.id,
      event: 'video-prompt-copied',
      promptDraftId: 'prompt-draft-custom-video',
    });
    assert.equal(copied.steps.find((step) => step.stepId === 'prompt_copy')?.status, 'succeeded');

    const imported = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: copied.id,
      event: 'finished-video-imported',
      inputSourceId: 'input-source-custom-video',
      promptDraftId: 'prompt-draft-custom-video',
    });
    assert.equal(imported.steps.find((step) => step.stepId === 'finished_video_import')?.status, 'succeeded');

    const overlay = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: imported.id,
      event: 'overlay-cards-generated',
      promptDraftId: 'prompt-draft-custom-video',
      overlayCardIds: ['overlay-card-custom-title'],
    });
    assert.equal(overlay.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'succeeded');

    const reviewed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: overlay.id,
      event: 'asset-reviewed',
      assetReviewId: 'asset-review-custom-video',
      assetKey: 'imported:input-source-custom-video:0:/tmp/custom-video.mp4',
    });
    assert.equal(reviewed.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');

    const completed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: reviewed.id,
      event: 'mix-package-exported',
      mixPackageId: 'mix-package-custom-video',
      manifestPath: '/tmp/custom-manifest.json',
      packageDir: '/tmp/custom-mix-package',
    });
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.steps.every((step) => step.status === 'succeeded'), true);
    assert.ok(completed.artifactRefs.includes('mix-package:mix-package-custom-video'));
    assert.ok(completed.artifactRefs.includes('overlay-card:overlay-card-custom-title'));
  });
});

test('WorkflowEngine 可以执行 IP SOP 到 PromptDraft 并停在人工审核', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const ipKnowledgeBases = new IpKnowledgeBaseStore(text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      ipKnowledgeBases,
    );
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'ip-longform');
    assert.ok(definition, '应存在内置 IP 长文 SOP');
    const citations = [{
      knowledgeBaseId: 'ip-demo',
      sectionId: 'profile-1',
      title: '嘉文老师 IP 知识库 / 人物定位',
      sectionType: 'profile',
      excerpt: '身份锚定、价值观立场、语言风格、判断方法、内容素材和创作引擎。',
    }];

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      citations,
      inputs: {
        source: '嘉文老师 IP 知识库：身份、价值观、语言风格、判断方法和内容素材。',
        intent: '生成公众号长文 Prompt，主题是个人 IP 内容资产化。',
        reviewOwner: '内容负责人',
      },
    });

    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'ip_extract')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'agent_read')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('input-source:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('ip-knowledge-base:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('agent-session:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
    assert.ok((await inputSources.list(workspacePath)).length >= 1);
    assert.equal((await ipKnowledgeBases.list(workspacePath)).length, 1);
    const storedSessions = await sessions.list(workspacePath);
    assert.ok(storedSessions.length >= 1);
    assert.equal(storedSessions[0].workflowRunId, run.id);
    const storedDrafts = await promptDrafts.list(workspacePath);
    assert.ok(storedDrafts.length >= 1);
    assert.equal(storedDrafts[0].workflowRunId, run.id);
    const [storedRun] = await workflows.listRuns(workspacePath);
    assert.equal(storedRun.id, run.id);
    assert.equal(storedRun.status, 'queued');

    const promptDraftId = run.steps.find((step) => step.stepId === 'prompt_generate')?.output?.promptDraftId;
    assert.equal(typeof promptDraftId, 'string');
    const draftRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'article-draft-generated',
      promptDraftId,
      generationLogId: 'article-log-functional',
    });
    assert.equal(draftRun.status, 'queued');
    assert.equal(draftRun.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.match(JSON.stringify(draftRun.steps.find((step) => step.stepId === 'human_review')?.output ?? {}), /article-log-functional/);

    const exportPath = join(workspacePath, 'ip-longform.md');
    const completedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'article-markdown-exported',
      promptDraftId,
      generationLogId: 'article-log-functional',
      exportPath,
    });
    assert.equal(completedRun.status, 'succeeded');
    assert.equal(completedRun.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');
    assert.equal(completedRun.steps.find((step) => step.stepId === 'asset_store')?.status, 'succeeded');
    assert.ok(completedRun.artifactRefs.includes(`generation-log:article-log-functional`));
    assert.ok(completedRun.artifactRefs.includes(exportPath));

    const platformDraftRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'article-platform-draft-exported',
      promptDraftId,
      generationLogId: 'article-log-functional',
      exportPath: join(workspacePath, 'platform-draft', 'draft.md'),
      manifestPath: join(workspacePath, 'platform-draft', 'manifest.json'),
      packageDir: join(workspacePath, 'platform-draft'),
    });
    assert.equal(platformDraftRun.status, 'succeeded');
    assert.ok(platformDraftRun.artifactRefs.includes(join(workspacePath, 'platform-draft', 'manifest.json')));
    assert.ok(platformDraftRun.artifactRefs.includes(join(workspacePath, 'platform-draft')));
  });
});

test('WorkflowEngine 可以执行品牌知识库到场景库和 Prompt 组 SOP', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const brandKnowledgeBases = new BrandKnowledgeBaseStore(text);
    const promptPacks = new PromptPackService(logs, text);
    const sceneCards = new SceneLibraryStore(logs, promptPacks, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      undefined,
      brandKnowledgeBases,
      promptPacks,
      sceneCards,
    );
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌知识库场景提示词 SOP');

    const citations = [
      {
        knowledgeBaseId: 'kb-brand',
        sectionId: 'facts',
        title: '产品知识库 / 产品事实',
        sectionType: 'product',
        excerpt: '便携条包，适合早餐后和办公室抽屉场景，强调降低坚持门槛。',
      },
      {
        knowledgeBaseId: 'kb-brand',
        sectionId: 'boundary',
        title: '产品知识库 / 合规边界',
        sectionType: 'compliance',
        excerpt: '不得承诺治疗、见效或绝对化收益，只能围绕使用场景和产品事实表达。',
      },
      {
        knowledgeBaseId: 'kb-brand',
        sectionId: 'scenario',
        title: '产品知识库 / 场景素材',
        sectionType: 'scenario-script',
        excerpt: '早餐桌、办公室抽屉、妈妈给孩子书包侧袋放入条包。',
      },
    ];

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      citations,
      inputs: {
        source: '',
        intent: '生成小红书 UGC 手机实拍图片 Prompt 组。',
        reviewOwner: '场景负责人',
      },
    });

    assert.equal(run.status, 'queued');
    assert.equal(run.citations.length, citations.length);
    assert.equal(run.steps.find((step) => step.stepId === 'brand_extract')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_pack')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'scene_library')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_group')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.ok(JSON.stringify(run.steps[0].input).includes('selectedCitations'));
    assert.match(run.steps[0].summary, /已选择知识引用/);
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('brand-knowledge-base:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-pack:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('scene-card:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
    assert.equal((await brandKnowledgeBases.list(workspacePath)).length, 1);
    const storedPacks = await promptPacks.list(workspacePath);
    assert.equal(storedPacks.length, 1);
    assert.equal(storedPacks[0].workflowRunId, run.id);
    assert.equal(storedPacks[0].inputSourceIds.length, 0);
    assert.ok(storedPacks[0].citations.some((item) => item.knowledgeBaseId.startsWith('brand-kb:')));
    const storedSceneCards = await sceneCards.list(workspacePath);
    assert.equal(storedSceneCards.length, 3);
    assert.equal(storedSceneCards.every((card) => card.workflowRunId === run.id), true);
    assert.equal(storedSceneCards.every((card) => card.inputSourceIds.length === 0), true);
    assert.equal(storedSceneCards.every((card) => card.citations.length >= 1), true);
    const storedDrafts = await promptDrafts.list(workspacePath);
    assert.equal(storedDrafts.length, 1);
    assert.equal(storedDrafts[0].workflowRunId, run.id);
    assert.equal(storedDrafts[0].inputSourceIds.length, 0);
    assert.equal(storedDrafts[0].sceneCardIds.length, 3);
    assert.match(storedDrafts[0].versions[0].content, /办公室早餐场景/);
    assert.equal(storedDrafts[0].versions[0].content.match(/### 图片 Prompt/g)?.length, 10);
    const videoPromptGroup = buildScenePromptGroupContent(
      'video',
      '生成可复制到图生视频工具的 15 秒素材 Prompt。',
      storedSceneCards,
    );
    assert.equal(videoPromptGroup.match(/### 视频 Prompt/g)?.length, 10);
    const storedLogs = await logs.list(workspacePath);
    assert.equal(storedLogs.filter((log) => log.kind === 'prompt-pack').every((log) => log.workflowRunId === run.id), true);
    assert.equal(storedLogs.filter((log) => log.kind === 'scene-card').every((log) => log.workflowRunId === run.id), true);
    const [storedRun] = await workflows.listRuns(workspacePath);
    assert.equal(storedRun.id, run.id);
    assert.equal(storedRun.citations.length, citations.length);

    const reviewed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'workflow-review-approved',
    });
    assert.equal(reviewed.status, 'queued');
    assert.equal(reviewed.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');
    assert.equal(reviewed.steps.find((step) => step.stepId === 'asset_store')?.status, 'queued');

    const archived = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'workflow-asset-archived',
    });
    assert.equal(archived.status, 'succeeded');
    assert.equal(archived.steps.find((step) => step.stepId === 'asset_store')?.status, 'succeeded');
    assert.match(archived.summary, /品牌知识库场景提示词 SOP 已完成/);
  });
});

test('WorkflowEngine 可以执行产品商业素材 SOP 到三类图片 Prompt', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'product-commercial-assets');
    assert.ok(definition, '应存在产品商业素材 SOP');

    const productBrief = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '工作区便携条包产品资料',
      tags: ['产品资料', 'brief'],
      text: [
        '产品名称：工作区便携条包',
        '卖点：早餐后、办公室抽屉和通勤包里都能顺手取用',
        '规格：15g * 20 条',
        '适用场景：早餐后、通勤、办公室加班',
        '禁用表达：不得承诺治疗、见效或替代专业建议',
      ].join('\n'),
    });
    const skuTable = await inputSources.register({
      workspacePath,
      kind: 'sku-table',
      purpose: 'product-brief',
      title: '工作区 SKU 表',
      tags: ['sku'],
      text: 'SKU,规格,价格\ntrial-10,15g*10条,59\nfamily-40,15g*40条,169',
    });

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [productBrief.id, skuTable.id],
      inputs: {
        source: '产品资料和 SKU 表',
        intent: '生成主图、卖点图和详情页局部图 Prompt。',
        reviewOwner: '电商运营',
        platform: '天猫 / 淘宝',
      },
    });

    assert.equal(run.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'succeeded');
    const productStep = run.steps.find((step) => step.stepId === 'product_brief_structure');
    assert.equal(productStep?.status, 'succeeded');
    assert.deepEqual(productStep?.output.promptTypes, ['main-image', 'selling-point-image', 'detail-page-section']);
    assert.equal(productStep?.output.skuRows.length, 2);
    assert.equal(productStep?.output.skuRows[0].SKU, 'trial-10');
    assert.match(productStep?.output.variableTable, /工作区便携条包/);
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'image_generate')?.status, 'blocked');
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
    assert.ok(run.artifactRefs.includes(`input-source:${productBrief.id}`));
    assert.ok(run.artifactRefs.includes(`input-source:${skuTable.id}`));

    const [draft] = await promptDrafts.list(workspacePath);
    assert.equal(draft.workflowRunId, run.id);
    assert.equal(draft.status, 'confirmed');
    assert.equal(draft.purpose, 'image');
    assert.ok(draft.inputSourceIds.includes(productBrief.id));
    assert.ok(draft.inputSourceIds.includes(skuTable.id));
    assert.match(draft.versions[0].content, /主图 Prompt/);
    assert.match(draft.versions[0].content, /卖点图 Prompt/);
    assert.match(draft.versions[0].content, /详情页模块 Prompt/);
    assert.match(draft.versions[0].content, /trial-10/);
  });
});

test('WorkflowEngine 产品商业素材 SOP 缺字段时阻断下游', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'product-commercial-assets');
    assert.ok(definition, '应存在产品商业素材 SOP');

    const incompleteBrief = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'product-brief',
      title: '缺字段产品资料',
      tags: ['产品资料'],
      text: '产品名称：缺字段条包\n卖点：放在包里不占地方',
    });

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [incompleteBrief.id],
      inputs: {
        source: '缺字段产品资料',
        intent: '生成详情页素材 Prompt。',
        reviewOwner: '电商运营',
        platform: '通用电商',
      },
    });

    const productStep = run.steps.find((step) => step.stepId === 'product_brief_structure');
    assert.equal(run.status, 'blocked');
    assert.equal(productStep?.status, 'blocked');
    assert.equal(productStep?.error, 'WORKFLOW_PRODUCT_BRIEF_FIELDS_MISSING');
    assert.deepEqual(productStep?.output.missingFields, ['规格 / SKU', '适用场景 / 人群', '禁用表达 / 合规边界']);
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'queued');
    assert.equal((await promptDrafts.list(workspacePath)).length, 0);
  });
});

test('WorkflowEngine 可以执行评论痛点选题 SOP 到文案 Prompt', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'feedback-topic-matrix');
    assert.ok(definition, '应存在评论痛点选题 SOP');

    const feedback = await inputSources.register({
      workspacePath,
      kind: 'manual-note',
      purpose: 'user-feedback',
      title: '评论和客服问题',
      tags: ['评论', '差评', '客服问题'],
      text: [
        '评论：价格有点贵，想知道到底值不值。',
        '差评：早上总是忘记吃，坚持不下来。',
        '客服：孩子和老人能不能吃，有没有禁忌？',
        '私信：办公室抽屉里放一盒会不会方便一点？',
      ].join('\n'),
    });

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [feedback.id],
      inputs: {
        source: '评论、差评和客服问题',
        intent: '生成下周小红书选题、标题方向和客服异议话术。',
        reviewOwner: '运营负责人',
        platform: '小红书',
      },
    });

    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'succeeded');
    const feedbackStep = run.steps.find((step) => step.stepId === 'feedback_cluster');
    assert.equal(feedbackStep?.status, 'succeeded');
    assert.equal(feedbackStep?.output.totalLines, 4);
    assert.ok(feedbackStep?.output.clusters.some((cluster) => cluster.key === 'price-trust'));
    assert.ok(feedbackStep?.output.clusters.some((cluster) => cluster.key === 'usage-friction'));
    assert.ok(feedbackStep?.output.clusters.some((cluster) => cluster.key === 'audience-fit'));
    assert.ok(feedbackStep?.output.titleDirections.length >= 3);
    assert.ok(feedbackStep?.output.objectionResponses.some((item) => item.boundary.includes('人工复核')));
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.ok(run.artifactRefs.includes(`input-source:${feedback.id}`));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));

    const [draft] = await promptDrafts.list(workspacePath);
    assert.equal(draft.workflowRunId, run.id);
    assert.equal(draft.status, 'confirmed');
    assert.equal(draft.purpose, 'article');
    assert.ok(draft.inputSourceIds.includes(feedback.id));
    assert.match(draft.versions[0].content, /价格和信任顾虑/);
    assert.match(draft.versions[0].content, /使用门槛和坚持成本/);
    assert.match(draft.versions[0].content, /适用人群和禁忌边界/);
    assert.match(draft.versions[0].content, /客服异议处理/);
    assert.match(draft.versions[0].content, /价格有点贵/);
  });
});

test('WorkflowEngine 评论痛点选题 SOP 缺少反馈时阻断下游', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'feedback-topic-matrix');
    assert.ok(definition, '应存在评论痛点选题 SOP');

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '',
        intent: '生成选题方向。',
        reviewOwner: '运营负责人',
        platform: '小红书',
      },
    });

    assert.equal(run.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'feedback_cluster')?.status, 'queued');
    assert.equal((await promptDrafts.list(workspacePath)).length, 0);
  });
});

test('WorkflowEngine 可以执行绿幕文案图 SOP 并自动送审', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const assetReviews = new AssetReviewStore();
    const overlayCards = new OverlayCardStore();
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      assetReviews,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      overlayCards,
    );
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'green-screen-card-package');
    assert.ok(definition, '应存在绿幕文案图 SOP');

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
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

    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
    const overlayStep = run.steps.find((step) => step.stepId === 'overlay_cards');
    assert.equal(overlayStep?.status, 'succeeded');
    assert.deepEqual(overlayStep?.output.cardTypes, ['title', 'selling-point', 'cta']);
    assert.equal(overlayStep?.output.overlayCardIds.length, 3);
    assert.equal(overlayStep?.output.assetReviewIds.length, 3);
    assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');

    const cards = await overlayCards.list(workspacePath);
    assert.equal(cards.length, 3);
    assert.equal(cards.every((card) => card.background === 'green-screen'), true);
    assert.equal(cards.every((card) => card.aspectRatio === '9:16'), true);
    assert.equal(cards.every((card) => existsSync(card.assetPath)), true);
    assert.ok(cards.some((card) => card.type === 'title' && card.text.includes('早餐后')));
    assert.ok(cards.some((card) => card.type === 'selling-point' && card.text.includes('便携条包')));
    assert.ok(cards.some((card) => card.type === 'cta' && card.text.includes('顺手一次')));
    const reviews = await assetReviews.list(workspacePath);
    assert.equal(reviews.length, 3);
    assert.equal(reviews.every((review) => review.status === 'pending'), true);
    assert.equal(reviews.every((review) => review.kind === 'overlay'), true);
    assert.equal(reviews.every((review) => review.workflowRunId === run.id), true);
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('overlay-card:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('asset-review:')));
  });
});

test('WorkflowEngine 绿幕文案图 SOP 缺少脚本时阻断下游', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      new OverlayCardStore(),
    );
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'green-screen-card-package');
    assert.ok(definition, '应存在绿幕文案图 SOP');

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '',
        intent: '',
        duration: '4',
      },
    });

    assert.equal(run.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'input_register')?.status, 'blocked');
    assert.equal(run.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'queued');
    assert.equal((await new OverlayCardStore().list(workspacePath)).length, 0);
  });
});

test('WorkflowEngine 会从 SOP 输入源路径自动导入文件并生成知识引用', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const brandKnowledgeBases = new BrandKnowledgeBaseStore(text);
    const promptPacks = new PromptPackService(logs, text);
    const sceneCards = new SceneLibraryStore(logs, promptPacks, text);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(
      workflows,
      inputSources,
      promptDrafts,
      sessions,
      media,
      undefined,
      brandKnowledgeBases,
      promptPacks,
      sceneCards,
    );
    const knowledgePath = join(workspacePath, '唯他瑞葡聚糖知识库.md');
    await writeFile(knowledgePath, [
      '# 唯他瑞葡聚糖知识库',
      '',
      '产品事实：便携条包，适合早餐后和办公室抽屉场景。',
      '核心卖点：降低坚持门槛，先讲使用场景，再讲卖点。',
      '合规边界：不得承诺治疗、见效或绝对化收益。',
    ].join('\n'), 'utf-8');
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(definition, '应存在品牌知识库场景提示词 SOP');

    const run = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: knowledgePath,
        intent: '生成品牌知识库、场景库和小红书图片 Prompt 组。',
        reviewOwner: '品牌负责人',
      },
    });

    assert.equal(run.status, 'queued');
    assert.ok(run.citations.some((citation) => citation.knowledgeBaseId.startsWith('input-source:') && /便携条包/.test(citation.excerpt)));
    assert.equal(run.steps.find((step) => step.stepId === 'brand_extract')?.status, 'succeeded');
    assert.equal(run.steps.find((step) => step.stepId === 'prompt_group')?.status, 'succeeded');
    const importedSources = await inputSources.list(workspacePath);
    const importedKnowledgeSource = importedSources.find((source) => source.title === '唯他瑞葡聚糖知识库.md' && source.status === 'converted');
    assert.ok(importedKnowledgeSource);
    assert.equal(importedKnowledgeSource.workflowRunId, run.id);
    assert.equal(importedSources.every((source) => source.workflowRunId === run.id), true);
    const inputStep = run.steps.find((step) => step.stepId === 'input_register');
    assert.match(JSON.stringify(inputStep?.output ?? {}), /importedInputSourceIds/);
    assert.ok(run.artifactRefs.some((ref) => ref.endsWith('唯他瑞葡聚糖知识库.md')));
  });
});

test('WorkflowEngine 图片步骤成功后会自动进入素材审核台', async () => {
  await withWorkspace(async (workspacePath) => {
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const logs = new GenerationLogStore();
      const text = new FakeTextGenerationService();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, text);
      const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
      const assetReviews = new AssetReviewStore();
      const media = new MediaProvider({
        async readView() {
          return {
            apiEndpoint: 'https://api.anthropic.com',
            hasApiKey: false,
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textModel: 'claude-sonnet-4-5',
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: true,
            imageModels: ['test-image-model'],
            videoProvider: 'disabled',
            videoApiEndpoint: '',
            hasVideoApiKey: false,
            videoModel: 'test-video-model',
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
        async getVideoApiKey() { return undefined; },
      }, logs);
      const workflows = new WorkflowStore();
      const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media, assetReviews);
      const baseDefinition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'ip-longform');
      assert.ok(baseDefinition, '应存在可复用的内置 SOP 定义');
      const definition = await workflows.updateDefinition({
        ...baseDefinition,
        key: 'image-review-smoke',
        title: '图片生成审核 SOP',
        description: '登记输入源后生成图片 Prompt，真实生成图片并自动送审。',
        tags: ['图片', '审核', 'SOP'],
        outputSpec: ['PromptVersion', 'ImageArtifact', 'ReviewResult'],
        steps: [
          { id: 'input_register', title: '登记输入源', kind: 'input', description: '记录产品和场景输入。', dependsOn: [], outputKeys: ['InputSource'] },
          { id: 'prompt_generate', title: '生成图片 Prompt', kind: 'prompt-generate', description: '生成图片生成可用 Prompt。', dependsOn: ['input_register'], outputKeys: ['PromptVersion'] },
          { id: 'image_generate', title: '图片生成', kind: 'image-generate', description: '调用真实图片 provider 生成候选图。', dependsOn: ['prompt_generate'], outputKeys: ['ImageArtifact'] },
          { id: 'human_review', title: '人工审核', kind: 'review', description: '确认图片是否可入素材库。', dependsOn: ['image_generate'], outputKeys: ['ReviewResult'] },
          { id: 'asset_store', title: '入素材库', kind: 'asset-store', description: '保存通过审核的图片和来源追溯。', dependsOn: ['human_review'], outputKeys: ['AssetRecord'] },
        ],
      });

      const run = await engine.startRun({
        workspacePath,
        workflowDefinitionId: definition.id,
        inputs: {
          source: '产品：便携条包；场景：早餐后自然光桌面。',
          intent: '生成一张小红书种草图，产品主体清晰。',
          reviewOwner: '素材审核人',
        },
      });

      assert.equal(run.status, 'queued');
      assert.equal(run.steps.find((step) => step.stepId === 'image_generate')?.status, 'succeeded');
      assert.equal(run.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs.length, 1);
      assert.equal(storedLogs[0].status, 'succeeded');
      assert.equal(storedLogs[0].workflowRunId, run.id);
      assert.equal(existsSync(storedLogs[0].artifactRefs[0]), true);
      const reviews = await assetReviews.list(workspacePath);
      assert.equal(reviews.length, 1);
      assert.equal(reviews[0].status, 'pending');
      assert.equal(reviews[0].workflowRunId, run.id);
      assert.equal(reviews[0].sourceType, 'generation-log');
      assert.equal(reviews[0].sourceId, storedLogs[0].id);
      assert.equal(reviews[0].assetKey, `generated:${storedLogs[0].id}:0:${storedLogs[0].artifactRefs[0]}`);
      assert.ok(run.artifactRefs.includes(`asset-review:${reviews[0].id}`));

      const rejected = await workflows.recordManualEvent({
        workspacePath,
        workflowRunId: run.id,
        event: 'asset-review-rejected',
        assetReviewId: reviews[0].id,
        assetKey: reviews[0].assetKey,
      });
      assert.equal(rejected.status, 'blocked');
      assert.equal(rejected.steps.find((step) => step.stepId === 'human_review')?.status, 'blocked');
      assert.match(rejected.summary, /驳回|回炉/);

      const completed = await workflows.recordManualEvent({
        workspacePath,
        workflowRunId: run.id,
        event: 'asset-reviewed',
        assetReviewId: reviews[0].id,
        assetKey: reviews[0].assetKey,
      });
      assert.equal(completed.status, 'succeeded');
      assert.equal(completed.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');
      assert.equal(completed.steps.find((step) => step.stepId === 'asset_store')?.status, 'succeeded');
      assert.ok(completed.artifactRefs.includes(`asset-review:${reviews[0].id}`));
      assert.ok(completed.artifactRefs.includes(reviews[0].assetKey));
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('图片素材回炉会生成 PromptDraft 新版本并让新日志关联原审核记录', async () => {
  await withWorkspace(async (workspacePath) => {
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const oldAssetPath = join(workspacePath, 'old-rejected.png');
      await writeFile(oldAssetPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const logs = new GenerationLogStore();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
      const assetReviews = new AssetReviewStore();
      const source = await inputSources.register({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '回炉产品资料',
        text: '产品事实：便携条包。回炉要求：保持真实早餐桌自然光。',
      });
      const draft = await promptDrafts.createFromContent({
        workspacePath,
        title: '回炉图片 Prompt',
        purpose: 'image',
        userIntent: '重做一张更真实的小红书图片。',
        inputSourceIds: [source.id],
        sceneCardIds: ['scene-rework-001'],
        workflowRunId: 'workflow-run-rework',
        content: '原始 Prompt：早餐桌自然光，产品主体清晰。',
        status: 'confirmed',
      });
      const review = await assetReviews.review({
        workspacePath,
        workflowRunId: 'workflow-run-rework',
        assetKey: `generated:old-log:0:${oldAssetPath}`,
        kind: 'image',
        sourceType: 'generation-log',
        sourceId: 'old-log',
        path: oldAssetPath,
        title: 'old-rejected.png',
        status: 'rejected',
        note: '构图太像广告棚拍，回炉为真实手机实拍。',
        tags: ['回炉'],
      });
      const updatedDraft = await promptDrafts.update({
        workspacePath,
        draftId: draft.id,
        content: [
          '基于驳回素材回炉重做，保留事实来源。',
          `回炉原因：${review.note}`,
          '原始 Prompt：早餐桌自然光，产品主体清晰。',
        ].join('\n'),
        note: `素材回炉：${review.note}`,
        status: 'draft',
      });
      const provider = new MediaProvider({
        async readView() {
          return {
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: true,
            imageModels: ['test-image-model'],
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      }, logs);
      const result = await provider.generateImage({
        workspacePath,
        workflowRunId: 'workflow-run-rework',
        reworkSource: {
          assetKey: review.assetKey,
          kind: 'image',
          sourceType: 'generation-log',
          sourceId: 'old-log',
          path: oldAssetPath,
          title: review.title,
          reviewId: review.id,
          reviewNote: review.note,
          promptDraftId: draft.id,
          workflowRunId: 'workflow-run-rework',
        },
        productImageRefs: [],
        referenceImageRefs: [oldAssetPath],
        prompt: updatedDraft.versions.at(-1).content,
        promptMode: 'free',
        generationMode: 'smart',
        template: '回炉图',
        watermark: false,
        promptPackId: 'prompt-pack-rework',
        sceneCardIds: ['scene-rework-001'],
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'test-image-model', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      });

      assert.equal(result.status, 'succeeded');
      const [storedDraft] = await promptDrafts.list(workspacePath);
      assert.equal(storedDraft.versions.length, 2);
      assert.match(storedDraft.versions.at(-1).content, /回炉原因/);
      const [storedLog] = await logs.list(workspacePath);
      assert.equal(storedLog.id, result.logId);
      assert.equal(storedLog.workflowRunId, 'workflow-run-rework');
      assert.equal(storedLog.reworkSource.reviewId, review.id);
      assert.equal(storedLog.reworkSource.assetKey, review.assetKey);
      assert.equal(storedLog.reworkSource.promptDraftId, draft.id);
      assert.equal(storedLog.sceneCardIds[0], 'scene-rework-001');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('图片工作台生成候选图后可以回写图片 SOP 并继续审核', async () => {
  await withWorkspace(async (workspacePath) => {
    const workflows = new WorkflowStore();
    const baseDefinition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'brand-scene-prompts');
    assert.ok(baseDefinition, '应存在可复用的内置 SOP 定义');
    const definition = await workflows.updateDefinition({
      ...baseDefinition,
      key: 'manual-image-workbench-sop',
      title: '图片工作台回写 SOP',
      description: '从 SOP 打开图片工作台生成候选图后，应回写 image_generate 并进入人工审核。',
      tags: ['图片', '工作台回写'],
      outputSpec: ['ImageArtifact', 'ReviewResult', 'AssetRecord'],
      steps: [
        { id: 'input_register', title: '登记输入源', kind: 'input', description: '记录产品和场景输入。', dependsOn: [], outputKeys: ['InputSource'] },
        { id: 'prompt_generate', title: '生成图片 Prompt', kind: 'prompt-generate', description: '生成图片工作台可用 Prompt。', dependsOn: ['input_register'], outputKeys: ['PromptVersion'] },
        { id: 'image_generate', title: '图片生成', kind: 'image-generate', description: '用户在图片工作台生成候选图后回写。', dependsOn: ['prompt_generate'], outputKeys: ['ImageArtifact'] },
        { id: 'human_review', title: '人工审核', kind: 'review', description: '确认图片是否可入素材库。', dependsOn: ['image_generate'], outputKeys: ['ReviewResult'] },
        { id: 'asset_store', title: '入素材库', kind: 'asset-store', description: '保存通过审核的图片和来源追溯。', dependsOn: ['human_review'], outputKeys: ['AssetRecord'] },
      ],
    });

    const run = await workflows.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '产品资料和参考图',
        intent: '生成一张小红书种草图。',
        reviewOwner: '素材审核人',
      },
    });
    assert.equal(run.status, 'queued');
    assert.equal(run.steps.find((step) => step.stepId === 'image_generate')?.status, 'queued');

    const generated = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'image-candidates-generated',
      generationLogId: 'log-image-001',
      assetRefs: ['/tmp/bugu-image-001.png'],
      summary: '功能测试图片工作台已生成候选图。',
    });
    assert.equal(generated.status, 'queued');
    assert.equal(generated.steps.find((step) => step.stepId === 'image_generate')?.status, 'succeeded');
    assert.equal(generated.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.ok(generated.artifactRefs.includes('generation-log:log-image-001'));
    assert.ok(generated.artifactRefs.includes('/tmp/bugu-image-001.png'));

    const completed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: run.id,
      event: 'asset-reviewed',
      assetReviewId: 'review-image-001',
      assetKey: 'generated:log-image-001:0:/tmp/bugu-image-001.png',
    });
    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.steps.find((step) => step.stepId === 'asset_store')?.status, 'succeeded');
    assert.ok(completed.artifactRefs.includes('asset-review:review-image-001'));
  });
});

test('视频素材包 SOP 可以通过手工事件推进到混剪清单', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const inputSources = new InputSourceStore();
    const promptDrafts = new PromptDraftStore(inputSources, text);
    const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
    const assetReviews = new AssetReviewStore();
    const overlayCards = new OverlayCardStore();
    const mixPackages = new MixPackageStore(assetReviews);
    const media = new MediaProvider({
      async readView() {
        return {
          imageProvider: 'disabled',
          imageProtocol: 'openai-responses',
          imageApiEndpoint: '',
          imageOuterModel: 'test-image-model',
          imageModels: ['test-image-model'],
          videoProvider: 'disabled',
          videoApiEndpoint: '',
          videoModel: 'test-video-model',
        };
      },
      async getImageApiKey() { return undefined; },
      async getVideoApiKey() { return undefined; },
    }, logs);
    const workflows = new WorkflowStore();
    const engine = new WorkflowEngine(workflows, inputSources, promptDrafts, sessions, media, assetReviews);
    const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'video-material-package');
    assert.ok(definition, '应存在视频素材包 SOP');
    assert.equal(definition.status, 'published');

    const started = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputs: {
        source: '品牌场景库和视频素材需求',
        intent: '生成 15 秒视频素材 Prompt、绿幕文案图和混剪清单。',
        reviewOwner: '视频负责人',
        duration: '15',
      },
    });

    const promptStep = started.steps.find((step) => step.stepId === 'prompt_generate');
    const promptDraftId = promptStep?.output?.promptDraftId;
    assert.equal(started.status, 'queued');
    assert.equal(promptStep?.status, 'succeeded');
    assert.equal(started.steps.find((step) => step.stepId === 'prompt_copy')?.status, 'queued');
    assert.equal(typeof promptDraftId, 'string');

    await promptDrafts.recordCopy({
      workspacePath,
      draftId: promptDraftId,
      target: 'RunningHub',
    });
    const copied = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: started.id,
      event: 'video-prompt-copied',
      promptDraftId,
      summary: '已复制到 RunningHub。',
    });
    assert.equal(copied.steps.find((step) => step.stepId === 'prompt_copy')?.status, 'succeeded');
    assert.equal(copied.steps.find((step) => step.stepId === 'finished_video_import')?.status, 'queued');

    const videoPath = join(workspacePath, 'third-party-finished-video.mp4');
    await writeFile(videoPath, TEST_VIDEO);
    const imported = await inputSources.importFile(workspacePath, videoPath, 'successful-asset', {
      workflowRunId: copied.id,
      relatedPromptDraftId: promptDraftId,
      relatedSceneCardIds: ['scene-card-video-001'],
      tags: ['第三方生成', '成品视频'],
    });
    assert.equal(imported.workflowRunId, copied.id);
    assert.equal(imported.relatedPromptDraftId, promptDraftId);
    assert.deepEqual(imported.relatedSceneCardIds, ['scene-card-video-001']);
    const importedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: copied.id,
      event: 'finished-video-imported',
      inputSourceId: imported.id,
      promptDraftId,
    });
    assert.equal(importedRun.steps.find((step) => step.stepId === 'finished_video_import')?.status, 'succeeded');
    assert.equal(importedRun.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'queued');

    const repeatedRun = await engine.startRun({
      workspacePath,
      workflowDefinitionId: definition.id,
      inputSourceIds: [imported.id],
      inputs: {
        source: '新的品牌场景库和视频素材需求',
        intent: '验证历史成品视频不会自动成为新 SOP 输入。',
        reviewOwner: '视频负责人',
        duration: '15',
      },
    });
    assert.equal(repeatedRun.inputSourceIds.includes(imported.id), false);

    const importedAssetKey = `imported:${imported.id}:0:${imported.sourcePath}`;
    const earlyVideoReview = await assetReviews.review({
      workspacePath,
      assetKey: importedAssetKey,
      kind: 'video',
      sourceType: 'input-source',
      sourceId: imported.id,
      path: imported.sourcePath,
      title: imported.title,
      status: 'approved',
      tags: imported.tags,
    });
    const earlyReviewedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: importedRun.id,
      event: 'asset-reviewed',
      assetReviewId: earlyVideoReview.id,
      assetKey: earlyVideoReview.assetKey,
    });
    assert.equal(earlyReviewedRun.status, 'queued');
    assert.equal(earlyReviewedRun.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'queued');
    assert.equal(earlyReviewedRun.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');
    assert.equal(earlyReviewedRun.steps.find((step) => step.stepId === 'export_manifest')?.status, 'queued');
    assert.ok(earlyReviewedRun.artifactRefs.includes(`asset-review:${earlyVideoReview.id}`));
    assert.ok(earlyReviewedRun.artifactRefs.includes(importedAssetKey));

    const overlays = await overlayCards.generate({
      workspacePath,
      promptDraftId,
      cards: [
        { type: 'title', title: '标题卡', text: '早餐后顺手一次', durationSeconds: 3 },
        { type: 'selling-point', title: '卖点卡', text: '便携条包，包里抽屉都能放', durationSeconds: 4 },
      ],
    });
    const overlayRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: importedRun.id,
      event: 'overlay-cards-generated',
      promptDraftId,
      overlayCardIds: overlays.map((card) => card.id),
    });
    assert.equal(overlayRun.steps.find((step) => step.stepId === 'overlay_cards')?.status, 'succeeded');
    assert.equal(overlayRun.steps.find((step) => step.stepId === 'human_review')?.status, 'queued');

    const overlayAssetKey = `overlay:${overlays[0].id}`;
    await assetReviews.review({
      workspacePath,
      assetKey: overlayAssetKey,
      kind: 'overlay',
      sourceType: 'overlay-card',
      sourceId: overlays[0].id,
      path: overlays[0].assetPath,
      title: overlays[0].title,
      status: 'approved',
      tags: overlays[0].tags,
    });
    const reviewedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: overlayRun.id,
      event: 'asset-reviewed',
      assetReviewId: earlyVideoReview.id,
      assetKey: earlyVideoReview.assetKey,
    });
    assert.equal(reviewedRun.steps.find((step) => step.stepId === 'human_review')?.status, 'succeeded');
    assert.equal(reviewedRun.steps.find((step) => step.stepId === 'export_manifest')?.status, 'queued');

    const [draft] = await promptDrafts.list(workspacePath);
    const promptText = draft.versions.find((version) => version.id === draft.activeVersionId)?.content ?? draft.versions[0].content;
    const pack = await mixPackages.exportPackage({
      workspacePath,
      workflowRunId: reviewedRun.id,
      title: '视频素材包 SOP 功能测试',
      platform: 'third-party-mix-tool',
      assets: [
        {
          id: importedAssetKey,
          kind: 'video',
          title: imported.title,
          path: imported.sourcePath,
          sourceType: 'input-source',
          sourceId: imported.id,
          promptDraftId,
          promptText,
          tags: imported.tags,
        },
        {
          id: overlayAssetKey,
          kind: 'overlay',
          title: overlays[0].title,
          path: overlays[0].assetPath,
          sourceType: 'overlay-card',
          sourceId: overlays[0].id,
          promptDraftId,
          promptText: overlays[0].text,
          tags: overlays[0].tags,
        },
      ],
    });
    const completed = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: reviewedRun.id,
      event: 'mix-package-exported',
      mixPackageId: pack.id,
      manifestPath: pack.manifestPath,
      manifestCsvPath: pack.manifestCsvPath,
      importGuidePath: pack.importGuidePath,
      packageDir: pack.packageDir,
    });

    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.steps.every((step) => step.status === 'succeeded'), true);
    assert.ok(completed.artifactRefs.includes(`input-source:${imported.id}`));
    assert.ok(completed.artifactRefs.includes(`overlay-card:${overlays[0].id}`));
    assert.ok(completed.artifactRefs.includes(`asset-review:${earlyVideoReview.id}`));
    assert.ok(completed.artifactRefs.includes(`mix-package:${pack.id}`));
    assert.ok(existsSync(pack.manifestPath));
    assert.ok(existsSync(pack.manifestCsvPath));
    assert.ok(existsSync(pack.importGuidePath));
    assert.ok(completed.artifactRefs.includes(pack.manifestCsvPath));
    assert.ok(completed.artifactRefs.includes(pack.importGuidePath));
    assert.equal(pack.workflowRunId, reviewedRun.id);
    const manifest = JSON.parse(await readFile(pack.manifestPath, 'utf-8'));
    const manifestCsv = await readFile(pack.manifestCsvPath, 'utf-8');
    const importGuide = await readFile(pack.importGuidePath, 'utf-8');
    assert.equal(manifest.workflowRunId, reviewedRun.id);
    assert.equal(manifest.files.importGuide, 'import-guide.md');
    assert.match(manifestCsv, /"kind","title","packagedPath"/);
    assert.match(manifestCsv, /"reviewId","reviewStatus"/);
    assert.match(manifestCsv, /"video"/);
    assert.match(manifestCsv, /"overlay"/);
    assert.match(importGuide, /第三方混剪软件/);
    assert.match(importGuide, /manifest\.csv/);
    assert.match(importGuide, /人工审核/);
    assert.equal(manifest.assets.find((asset) => asset.kind === 'video')?.reviewStatus, 'approved');
    assert.equal(manifest.assets.find((asset) => asset.kind === 'video')?.reviewId, earlyVideoReview.id);
    assert.equal(pack.assets.find((asset) => asset.kind === 'video')?.promptDraftId, promptDraftId);
    assert.equal(pack.assets.find((asset) => asset.kind === 'video')?.sourceId, imported.id);
    assert.match(pack.assets.find((asset) => asset.kind === 'video')?.promptText ?? '', /视频 Prompt|任务/);

    const recordedEvidence = await mixPackages.recordImportEvidence({
      workspacePath,
      mixPackageId: pack.id,
      toolName: '剪映专业版',
      importedAt: '2026-05-22T16:30:00+08:00',
      operator: '剪辑验收',
      importedAssetKinds: ['video', 'overlay'],
      importedFileCount: pack.assets.length,
      manifestImported: true,
      timelineCreated: true,
      result: 'verified',
      notes: '已按导入说明核对成品视频、绿幕文案图和清单文件。',
    });
    assert.ok(recordedEvidence.externalImportEvidencePath);
    assert.ok(recordedEvidence.externalImportEvidence);
    assert.ok(existsSync(recordedEvidence.externalImportEvidencePath));
    assert.ok(existsSync(join(recordedEvidence.packageDir, 'import-check.md')));
    assert.equal(recordedEvidence.externalImportEvidence.toolName, '剪映专业版');
    assert.deepEqual(recordedEvidence.externalImportEvidence.importedAssetKinds.sort(), ['overlay', 'video']);
    assert.equal(recordedEvidence.externalImportEvidence.importedFileCount, 2);
    assert.equal(recordedEvidence.externalImportEvidence.manifestImported, true);
    assert.equal(recordedEvidence.externalImportEvidence.timelineCreated, true);
    assert.ok(recordedEvidence.externalImportEvidence.evidenceFiles.includes('import-check.md'));
    const evidenceJson = JSON.parse(await readFile(recordedEvidence.externalImportEvidencePath, 'utf-8'));
    const importCheck = await readFile(join(recordedEvidence.packageDir, 'import-check.md'), 'utf-8');
    assert.equal(evidenceJson.toolName, '剪映专业版');
    assert.deepEqual(evidenceJson.importedAssetKinds.sort(), ['overlay', 'video']);
    assert.match(importCheck, /第三方导入验收/);
    assert.match(importCheck, /清单文件已导入或已核对：是/);

    const importVerifiedRun = await workflows.recordManualEvent({
      workspacePath,
      workflowRunId: completed.id,
      event: 'mix-package-import-verified',
      mixPackageId: recordedEvidence.id,
      externalImportEvidencePath: recordedEvidence.externalImportEvidencePath,
      packageDir: recordedEvidence.packageDir,
    });
    assert.equal(importVerifiedRun.status, 'succeeded');
    assert.ok(importVerifiedRun.artifactRefs.includes(recordedEvidence.externalImportEvidencePath));
    assert.ok(importVerifiedRun.artifactRefs.includes(recordedEvidence.packageDir));
    assert.equal(
      importVerifiedRun.steps.find((step) => step.stepId === 'export_manifest')?.output?.externalImportEvidencePath,
      recordedEvidence.externalImportEvidencePath,
    );
  });
});

test('对标图反推会调用真实视觉端点并生成 PromptDraft', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/vision') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            composition: '4:5 竖版，产品位于右下三分之一，左上保留标题区。',
            lighting: '早餐桌自然光，轻微手持感。',
            textArea: '左上角留白用于短标题，底部不放大段文字。',
            style: '小红书 UGC 手机实拍，真实台面和手部动作。',
            reusableElements: ['三分构图', '自然光', '标题留白'],
            risks: ['不要复制竞品包装和 Logo'],
            prompt: '4:5，小红书 UGC 手机实拍，早餐桌自然光，手拿便携条包，产品在右下三分之一，左上留白。',
            negativePrompt: '竞品 Logo、医疗化承诺、广告棚拍、过度磨皮。',
            qualityChecklist: ['主体一致', '左上留白', '无竞品元素'],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const previousEndpoint = process.env.CONTENT_STUDIO_VISION_ENDPOINT;
    try {
      process.env.CONTENT_STUDIO_VISION_ENDPOINT = `http://127.0.0.1:${server.address().port}/vision`;
      const referencePath = join(workspacePath, 'reference.png');
      await writeFile(referencePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const logs = new GenerationLogStore();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, new FakeTextGenerationService());
      const service = new ReferenceReverseService(logs, inputSources, promptDrafts);
      const reference = await inputSources.register({
        workspacePath,
        kind: 'image',
        purpose: 'reference',
        title: '小红书参考图',
        sourcePath: referencePath,
        summary: '参考图：早餐桌自然光。',
      });
      const product = await inputSources.register({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '产品资料',
        text: '便携条包，早餐后使用，表达降低坚持门槛。',
      });

      const result = await service.generate({
        workspacePath,
        referenceSourceIds: [reference.id],
        productSourceIds: [product.id],
        userIntent: '反推小红书种草图 Prompt。',
      });

      assert.equal(capturedRequest.operation, 'reference-reverse');
      assert.equal(capturedRequest.reference_sources[0].id, reference.id);
      assert.equal(result.analysis.composition.includes('右下三分之一'), true);
      assert.equal(result.promptDraft.purpose, 'image');
      assert.match(result.promptDraft.versions[0].content, /小红书 UGC 手机实拍/);
      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs[0].kind, 'reference-reverse');
      assert.equal(storedLogs[0].status, 'succeeded');
      assert.equal(existsSync(storedLogs[0].artifactRefs[0]), true);
    } finally {
      if (previousEndpoint === undefined) delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      else process.env.CONTENT_STUDIO_VISION_ENDPOINT = previousEndpoint;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('小红书种草图 SOP 可以携带参考图输入并通过视觉反推进入后续步骤', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/vision') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            composition: '4:5，右下角产品主体，左上留白。',
            lighting: '自然光，真实桌面。',
            textArea: '左上标题区。',
            style: 'UGC 手机实拍。',
            reusableElements: ['自然光', '留白', '手持感'],
            risks: ['不要复制竞品包装'],
            prompt: '4:5，早餐桌自然光，右下产品主体，左上留白，UGC 手机实拍。',
            negativePrompt: '竞品包装、Logo、医疗化承诺。',
            qualityChecklist: ['主体一致', '留白明确', '无竞品元素'],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const previousEndpoint = process.env.CONTENT_STUDIO_VISION_ENDPOINT;
    try {
      process.env.CONTENT_STUDIO_VISION_ENDPOINT = `http://127.0.0.1:${server.address().port}/vision`;
      const referencePath = join(workspacePath, 'reference.png');
      await writeFile(referencePath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const logs = new GenerationLogStore();
      const text = new FakeTextGenerationService();
      const inputSources = new InputSourceStore();
      const promptDrafts = new PromptDraftStore(inputSources, text);
      const sessions = new AgentPromptSessionStore(inputSources, promptDrafts, text);
      const brandKnowledgeBases = new BrandKnowledgeBaseStore(text);
      const promptPacks = new PromptPackService(logs, text);
      const sceneCards = new SceneLibraryStore(logs, promptPacks, text);
      const media = new MediaProvider({
        async readView() {
          return {
            apiEndpoint: 'https://api.anthropic.com',
            hasApiKey: false,
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textModel: 'claude-sonnet-4-5',
            imageProvider: 'disabled',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: '',
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: false,
            imageModels: ['test-image-model'],
            videoProvider: 'disabled',
            videoApiEndpoint: '',
            hasVideoApiKey: false,
            videoModel: 'test-video-model',
          };
        },
        async getImageApiKey() { return undefined; },
        async getVideoApiKey() { return undefined; },
      }, logs);
      const workflows = new WorkflowStore();
      const reference = await inputSources.register({
        workspacePath,
        kind: 'image',
        purpose: 'reference',
        title: '参考图',
        sourcePath: referencePath,
        summary: '早餐桌参考图。',
      });
      const product = await inputSources.register({
        workspacePath,
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '产品资料',
        text: '便携条包，早餐后使用。',
      });
      const engine = new WorkflowEngine(
        workflows,
        inputSources,
        promptDrafts,
        sessions,
        media,
        undefined,
        brandKnowledgeBases,
        promptPacks,
        sceneCards,
        new ReferenceReverseService(logs, inputSources, promptDrafts, new (await import('../../src/main/services/modelConfigStore.ts')).ModelConfigStore()),
      );
      const definition = (await workflows.listDefinitions(workspacePath)).find((item) => item.key === 'xiaohongshu-seeding-image');
      assert.ok(definition, '应存在小红书种草图 SOP');

      const run = await engine.startRun({
        workspacePath,
        workflowDefinitionId: definition.id,
        inputSourceIds: [reference.id, product.id],
        inputs: {
          source: '参考图与产品资料',
          intent: '生成小红书种草图 SOP。',
          reviewOwner: '内容负责人',
          platform: '小红书',
        },
      });

      assert.equal(capturedRequest.operation, 'reference-reverse');
      assert.equal(run.steps.find((step) => step.stepId === 'reference_reverse')?.status, 'succeeded');
      assert.equal(run.steps.find((step) => step.stepId === 'prompt_generate')?.status, 'succeeded');
      assert.equal(run.steps.find((step) => step.stepId === 'image_generate')?.status, 'blocked');
      assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
      assert.ok(run.artifactRefs.some((ref) => ref.startsWith('generation-log:')));
      const referenceLog = (await logs.list(workspacePath)).find((log) => log.kind === 'reference-reverse');
      assert.equal(referenceLog?.workflowRunId, run.id);
      const [storedDraft] = await promptDrafts.list(workspacePath);
      assert.equal(storedDraft.workflowRunId, run.id);
    } finally {
      if (previousEndpoint === undefined) delete process.env.CONTENT_STUDIO_VISION_ENDPOINT;
      else process.env.CONTENT_STUDIO_VISION_ENDPOINT = previousEndpoint;
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('知识库可以导入、结构化并参与搜索引用', async () => {
  await withWorkspace(async (workspacePath) => {
    const source = join(workspacePath, '产品知识库.md');
    await writeFile(source, ['# 产品', '清晰成分，便携条包，适合早餐后使用。', '# 异议处理', '回应价格时强调配方、规格和使用场景。'].join('\n'), 'utf-8');
    const store = new KnowledgeBaseStore();
    const imported = await store.importFile(workspacePath, source);
    assert.equal(imported.source, 'workspace');
    assert.ok(imported.sections.length >= 2);

    const results = await store.search({ workspacePath, query: '价格 使用场景', baseType: 'product-kb', sectionType: 'all' });
    assert.ok(results.length >= 1);
    assert.ok(results.some((result) => result.section.content.includes('价格')));
  });
});

test('Claude SDK 子进程环境会过滤非法路径并定位 asar 解包路径', async () => {
  await withWorkspace(async (workspacePath) => {
    const notDirectory = join(workspacePath, 'not-a-directory');
    await writeFile(notDirectory, 'not a directory', 'utf-8');
    const previousPath = process.env.PATH;
    const previousConfigDir = process.env.CLAUDE_CONFIG_DIR;
    const previousNpmPrefix = process.env.npm_config_prefix;

    try {
      process.env.PATH = [notDirectory, workspacePath, previousPath].filter(Boolean).join(delimiter);
      process.env.CLAUDE_CONFIG_DIR = notDirectory;
      process.env.npm_config_prefix = '';

      const env = buildClaudeSubprocessEnv({ extra: { EXTRA_EMPTY_VALUE: undefined } });
      const pathEntries = env?.PATH?.split(delimiter) ?? [];

      assert.ok(pathEntries.includes(workspacePath));
      assert.ok(!pathEntries.includes(notDirectory));
      assert.equal(env?.CLAUDE_CONFIG_DIR, undefined);
      assert.equal(env?.npm_config_prefix, undefined);
      assert.equal(env?.EXTRA_EMPTY_VALUE, undefined);
      assert.ok(resolveAsarUnpackedPath('/Applications/Bugu.app/Contents/Resources/app.asar/node_modules/native/claude').includes('/app.asar.unpacked/'));
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      if (previousConfigDir === undefined) delete process.env.CLAUDE_CONFIG_DIR;
      else process.env.CLAUDE_CONFIG_DIR = previousConfigDir;
      if (previousNpmPrefix === undefined) delete process.env.npm_config_prefix;
      else process.env.npm_config_prefix = previousNpmPrefix;
    }
  });
});

test('Claude SDK 文字模型在工作区不是目录时返回可读错误', async () => {
  await withWorkspace(async (workspacePath) => {
    const notDirectory = join(workspacePath, 'workspace-file');
    await writeFile(notDirectory, 'not a directory', 'utf-8');
    const previousRequireExplicitKey = process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY;
    delete process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY;

    try {
      const text = new TextGenerationService({
        async readView() {
          return {
            textProtocol: 'claude-sdk',
            textApiEndpoint: '',
            textModel: 'claude-sonnet-4-5',
          };
        },
        async getTextApiKey() { return undefined; },
      });

      await assert.rejects(() => text.generateJson({
        workspacePath: notDirectory,
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"invalid_workspace"}',
        schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
      }), /工作区路径不是可访问目录/);
    } finally {
      if (previousRequireExplicitKey === undefined) delete process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY;
      else process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY = previousRequireExplicitKey;
    }
  });
});

test('Claude SDK 文字协议拒绝非 Claude 模型', async () => {
  await withWorkspace(async (workspacePath) => {
    const text = new TextGenerationService({
      async readView() {
        return {
          textProtocol: 'claude-sdk',
          textApiEndpoint: 'https://api.anthropic.com',
          textModel: 'gemini-3-pro-preview',
        };
      },
      async getTextApiKey() { return 'test-text-key'; },
    });

    await assert.rejects(() => text.generateJson({
      workspacePath,
      systemPrompt: '只输出 JSON。',
      prompt: '{"task":"model_mismatch"}',
      schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
    }), /Claude SDK 只支持 Claude 系列模型/);
  });
});

test('Claude Prompt Agent 会拒绝非 Claude 模型选择', async () => {
  await withWorkspace(async (workspacePath) => {
    const agent = new ClaudePromptAgentService(
      {
        async getAnthropicApiKey() {
          return 'test-anthropic-key';
        },
      },
      {
        async readView() {
          return {
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            textModel: 'claude-sonnet-4-5',
          };
        },
        async getTextApiKey() {
          return 'test-text-key';
        },
      },
    );

    await assert.rejects(
      () => agent.generateJson({
        workspacePath,
        model: 'gemini-3-pro-preview',
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"model_mismatch"}',
        schema: { type: 'object', required: ['ok'], properties: { ok: { type: 'boolean' } } },
      }),
      /Claude SDK 只支持 Claude 系列模型/,
    );
  });
});

test('文字模型支持 Anthropic 兼容 HTTP 网关生成 JSON', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/messages') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            type: 'message',
            role: 'assistant',
            model: capturedRequest.model,
            content: [{ type: 'text', text: '{"ok":true,"name":"兼容网关"}' }],
            stop_reason: 'end_turn',
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const modelConfig = {
        async readView() {
          return {
            apiEndpoint: baseUrl,
            hasApiKey: true,
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'anthropic-messages',
            textApiEndpoint: baseUrl,
            hasTextApiKey: true,
            textModel: 'gemini-3-pro-preview',
          };
        },
        async getTextApiKey() { return 'test-text-key'; },
      };
      const text = new TextGenerationService(modelConfig);
      const result = await text.generateJson({
        workspacePath,
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"compat_test"}',
        schema: {
          type: 'object',
          required: ['ok', 'name'],
          properties: { ok: { type: 'boolean' }, name: { type: 'string' } },
        },
      });

      assert.deepEqual(result.value, { ok: true, name: '兼容网关' });
      assert.equal(result.model, 'gemini-3-pro-preview');
      assert.equal(result.protocol, 'anthropic-messages');
      assert.equal(capturedRequest.model, 'gemini-3-pro-preview');
      assert.match(capturedRequest.system, /JSON Schema/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('文字模型支持 OpenAI Chat Completions 兼容协议生成 JSON', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/chat/completions') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            choices: [{ message: { role: 'assistant', content: '{"ok":true,"name":"OpenAI 兼容"}' }, finish_reason: 'stop' }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const text = new TextGenerationService({
        async readView() {
          return {
            textProtocol: 'openai-chat',
            textApiEndpoint: baseUrl,
            textModel: 'gpt-compatible',
          };
        },
        async getTextApiKey() { return 'test-text-key'; },
      });
      const result = await text.generateJson({
        workspacePath,
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"compat_test"}',
        schema: { type: 'object', required: ['ok', 'name'], properties: { ok: { type: 'boolean' }, name: { type: 'string' } } },
      });
      assert.deepEqual(result.value, { ok: true, name: 'OpenAI 兼容' });
      assert.equal(result.protocol, 'openai-chat');
      assert.equal(capturedRequest.model, 'gpt-compatible');
      assert.equal(capturedRequest.response_format.type, 'json_object');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('文字模型支持 Gemini GenerateContent 原生协议生成 JSON', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1beta/models/gemini-test:generateContent') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            candidates: [{ content: { parts: [{ text: '{"ok":true,"name":"Gemini 原生"}' }] } }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const text = new TextGenerationService({
        async readView() {
          return {
            textProtocol: 'gemini-generate-content',
            textApiEndpoint: baseUrl,
            textModel: 'gemini-test',
          };
        },
        async getTextApiKey() { return 'test-text-key'; },
      });
      const result = await text.generateJson({
        workspacePath,
        systemPrompt: '只输出 JSON。',
        prompt: '{"task":"compat_test"}',
        schema: { type: 'object', required: ['ok', 'name'], properties: { ok: { type: 'boolean' }, name: { type: 'string' } } },
      });
      assert.deepEqual(result.value, { ok: true, name: 'Gemini 原生' });
      assert.equal(result.protocol, 'gemini-generate-content');
      assert.equal(capturedRequest.generationConfig.responseMimeType, 'application/json');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('媒体 Provider 可以调用真实 HTTP 适配器并沉淀图片/视频产物', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedVideoRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
        return;
      }
      if (request.url === '/video') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedVideoRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            video_url: `http://127.0.0.1:${server.address().port}/video-file.mp4`,
            cost: 15,
            currency: 'CNY',
          }));
        });
        return;
      }
      if (request.url === '/video-file.mp4') {
        response.setHeader('content-type', 'video/mp4');
        response.end(TEST_VIDEO);
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            apiEndpoint: 'https://api.anthropic.com',
            hasApiKey: false,
            textProvider: 'anthropic-claude-sdk',
            textProtocol: 'claude-sdk',
            textApiEndpoint: 'https://api.anthropic.com',
            hasTextApiKey: false,
            textModel: 'claude-sonnet-4-5',
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: true,
            imageModels: ['test-image-model'],
            videoProvider: 'generic-http',
            videoApiEndpoint: `${baseUrl}/video`,
            hasVideoApiKey: true,
            videoModel: 'test-video-model',
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
        async getVideoApiKey() { return 'test-video-key'; },
      };
      const provider = new MediaProvider(modelConfig, logs);
      const image = await provider.generateImage({
        workspacePath,
        productImageRefs: [],
        referenceImageRefs: [],
        prompt: '生成测试图片',
        promptMode: 'preset',
        generationMode: 'smart',
        template: '场景图',
        watermark: false,
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'test-image-model', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      });
      assert.equal(image.status, 'succeeded');
      assert.equal(image.assetRefs.length, 1);
      assert.equal(existsSync(image.assetRefs[0]), true);

      const video = await provider.generateVideo({
        workspacePath,
        imageAssetRefs: image.assetRefs,
        videoAssetRefs: [],
        prompt: '生成测试视频',
        script: '测试脚本',
        citations: [citation],
        selectedSkillSlugs: ['video-script-writer'],
        params: { videoModel: 'test-video-model', aspectRatio: '4:5', durationSeconds: 10 },
      });
      assert.equal(video.status, 'succeeded');
      assert.equal(video.assetRefs.length, 1);
      assert.equal(existsSync(video.assetRefs[0]), true);
      assert.equal(capturedVideoRequest.duration_seconds, 10);
      assert.equal(video.billing.estimatedCost, 15);
      assert.equal(video.billing.unitPrice, 1.5);
      assert.equal(video.billing.source, 'provider-response');
      const videoLog = (await logs.list(workspacePath)).find((entry) => entry.kind === 'video');
      assert.equal(videoLog.output.model, 'test-video-model');
      assert.equal(videoLog.output.durationSeconds, 10);
      assert.equal(videoLog.output.costEstimate.estimatedCost, 15);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('媒体 Provider 支持 Chat Completions 图片 data URI 协议', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: { message: 'not implemented' } }));
        return;
      }
      if (request.url === '/v1/chat/completions') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
          choices: [{
            message: {
              role: 'assistant',
              content: `![image](data:image/png;base64,${ONE_PIXEL_PNG})`,
            },
            finish_reason: 'stop',
          }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-chat-data-uri',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'gemini-3-pro-preview',
            hasImageApiKey: true,
            imageModels: ['gemini-3-pro-image-preview'],
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      };
      const provider = new MediaProvider(modelConfig, logs);
      const image = await provider.generateImage({
        workspacePath,
        productImageRefs: [],
        referenceImageRefs: [],
        prompt: '生成一张兜底测试图',
        promptMode: 'preset',
        generationMode: 'smart',
        template: '场景图',
        templateInputs: { productName: '测试产品', sceneType: '厨房餐厅' },
        watermark: false,
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'gemini-3-pro-image-preview', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      });

      assert.equal(image.status, 'succeeded');
      assert.equal(image.assetRefs.length, 1);
      assert.equal(existsSync(image.assetRefs[0]), true);
      assert.match(capturedRequest.messages[0].content, /模板参数/);
      assert.match(capturedRequest.messages[0].content, /产品名称: 测试产品/);
      assert.match(capturedRequest.messages[0].content, /场景选择: 厨房餐厅/);
      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs[0].output.endpoint, 'openai-chat-data-uri');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('图片提示词支持 @ 点名某张输入图片作为重点参考', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const heroPath = join(workspacePath, 'hero.png');
      await writeFile(heroPath, Buffer.from(ONE_PIXEL_PNG, 'base64'));
      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            imageProvider: 'openai-responses',
            imageProtocol: 'openai-responses',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'test-outer-model',
            hasImageApiKey: true,
            imageModels: ['test-image-model'],
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      };
      const provider = new MediaProvider(modelConfig, logs);
      const image = await provider.generateImage({
        workspacePath,
        productImageRefs: [heroPath],
        referenceImageRefs: [],
        prompt: '重点参考 @hero.png 的构图，生成一张白底主图',
        promptMode: 'free',
        generationMode: 'smart',
        template: '自由模式',
        watermark: false,
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'test-image-model', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '1:1', resolution: '1k', quality: 'low' },
      });

      assert.equal(image.status, 'succeeded');
      const content = capturedRequest.input[0].content;
      assert.equal(content.some((part) => part.type === 'input_image'), true);
      assert.equal(content.some((part) => part.type === 'input_text' && part.text.includes('hero.png') && part.text.includes('用户 @ 点名重点参考')), true);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('媒体 Provider 支持 Gemini GenerateContent 图片 inlineData 协议', async () => {
  await withWorkspace(async (workspacePath) => {
    let capturedRequest;
    const server = createServer((request, response) => {
      if (request.url === '/v1beta/models/gemini-image-test:generateContent') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          capturedRequest = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            candidates: [{ content: { parts: [{ inlineData: { mimeType: 'image/png', data: ONE_PIXEL_PNG } }] } }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}`;
      const logs = new GenerationLogStore();
      const modelConfig = {
        async readView() {
          return {
            imageProvider: 'openai-responses',
            imageProtocol: 'gemini-generate-content',
            imageApiEndpoint: baseUrl,
            imageOuterModel: 'unused',
            hasImageApiKey: true,
            imageModels: ['gemini-image-test'],
          };
        },
        async getImageApiKey() { return 'test-image-key'; },
      };
      const provider = new MediaProvider(modelConfig, logs);
      const image = await provider.generateImage({
        workspacePath,
        productImageRefs: [],
        referenceImageRefs: [],
        prompt: '生成一张 Gemini 协议测试图',
        promptMode: 'preset',
        generationMode: 'smart',
        template: '场景图',
        watermark: false,
        citations: [citation],
        selectedSkillSlugs: ['ecommerce-image-prompt'],
        params: { textModel: 'fake', imageModel: 'gemini-image-test', videoModel: 'test-video-model', runMode: 'single', count: 1, aspectRatio: '4:5', resolution: '1k', quality: 'low' },
      });

      assert.equal(image.status, 'succeeded');
      assert.equal(image.assetRefs.length, 1);
      assert.equal(existsSync(image.assetRefs[0]), true);
      assert.deepEqual(capturedRequest.generationConfig.responseModalities, ['TEXT', 'IMAGE']);
      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs[0].output.endpoint, 'gemini-generate-content');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('视频拆解可以调用真实 Generic HTTP 理解 Provider 并写入日志', async () => {
  await withWorkspace(async (workspacePath) => {
    const server = createServer((request, response) => {
      if (request.url === '/understand') {
        let body = '';
        request.on('data', (chunk) => { body += chunk.toString(); });
        request.on('end', () => {
          const payload = JSON.parse(body);
          response.setHeader('content-type', 'application/json');
          response.end(JSON.stringify({
            summary: `已拆解 ${payload.source_type} 参考视频`,
            dimensions: payload.dimensions,
            segments: [
              {
                timeRange: '0-3s',
                hook: '先抛早餐后难坚持的痛点',
                visual: '桌面上出现产品和早餐',
                voiceover: '很多人不是不知道要坚持，而是场景太麻烦',
                subtitle: '早餐后也能顺手完成',
                rhythm: '快速钩子',
                reusablePoint: '先讲坚持门槛，再展示解决方式',
              },
            ],
            reusableFormula: ['痛点 -> 顺手使用 -> 事实边界'],
            risks: [{ level: 'warning', message: '复刻时避免照搬原视频画面。' }],
          }));
        });
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const logs = new GenerationLogStore();
      const endpoint = `http://127.0.0.1:${server.address().port}/understand`;
      const modelConfig = {
        async readView() {
          return {
            videoProvider: 'generic-http',
            videoApiEndpoint: endpoint,
            videoModel: 'test-video-understanding',
          };
        },
        async getVideoApiKey() { return 'test-video-key'; },
      };
      const videos = new VideoWorkflowService(logs, new FakeTextGenerationService(), modelConfig);
      const breakdown = await videos.analyze({
        workspacePath,
        sourceType: 'url',
        source: 'https://example.com/reference.mp4',
        dimensions: ['开头钩子', '字幕口播'],
        citations: [citation],
        selectedSkillSlugs: ['video-breakdown'],
        params: { textModel: 'fake-claude-sonnet' },
      });
      assert.equal(breakdown.segments.length, 1);
      assert.equal(breakdown.reusableFormula[0], '痛点 -> 顺手使用 -> 事实边界');

      const storedLogs = await logs.list(workspacePath);
      assert.equal(storedLogs[0].kind, 'video-breakdown');
      assert.equal(storedLogs[0].status, 'succeeded');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
