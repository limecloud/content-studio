import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ArticleGenerationService } from '../../src/main/services/articleGenerationService.ts';
import { AgentPromptSessionStore } from '../../src/main/services/agentPromptSessionStore.ts';
import { AssetReviewStore } from '../../src/main/services/assetReviewStore.ts';
import { BrandKnowledgeBaseStore } from '../../src/main/services/brandKnowledgeBaseStore.ts';
import { GenerationLogStore } from '../../src/main/services/generationLogStore.ts';
import { ImageSkillGenerationService } from '../../src/main/services/imageSkillGenerationService.ts';
import { InputSourceStore } from '../../src/main/services/inputSourceStore.ts';
import { IpKnowledgeBaseStore } from '../../src/main/services/ipKnowledgeBaseStore.ts';
import { KnowledgeBaseStore } from '../../src/main/services/knowledgeBaseStore.ts';
import { MixPackageStore } from '../../src/main/services/mixPackageStore.ts';
import { OverlayCardStore } from '../../src/main/services/overlayCardStore.ts';
import { PromptPackService } from '../../src/main/services/promptPackService.ts';
import { PromptDraftStore } from '../../src/main/services/promptDraftStore.ts';
import { ReferenceReverseService } from '../../src/main/services/referenceReverseService.ts';
import { SceneLibraryStore } from '../../src/main/services/sceneLibraryStore.ts';
import { TextGenerationService } from '../../src/main/services/textGenerationService.ts';
import { VideoWorkflowService } from '../../src/main/services/videoWorkflowService.ts';
import { WorkflowEngine } from '../../src/main/services/workflowEngine.ts';
import { WorkflowStore } from '../../src/main/services/workflowStore.ts';
import { MediaProvider } from '../../src/main/providers/mediaProvider.ts';
import { formatImageTemplateInputs, formatImageTemplatePromptContext } from '../../src/shared/imageTemplates.ts';
import { extractGeneratedAssetRefsFromLog, extractLocalRefsFromLog } from '../../src/renderer/src/app/formatters.ts';
import { SkillManager } from '../../src/main/services/skillManager.ts';

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
          complianceBoundaries: ['不承诺治疗', '不做无依据背书'],
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
    assert.equal(result.template.author, '布谷AI');
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
    assert.equal(result.template.author, '布谷AI');
    assert.equal(result.template.defaultRatio, '4:5');
    assert.equal(result.template.defaultCount, 2);
    assert.deepEqual(result.template.fields.map((field) => field.kind), ['text', 'single']);
    assert.match(result.rawText, /imported-food-cover/);
  });
});

test('内容工厂文字主链可以生成提示词包、场景卡、文章和视频脚本', async () => {
  await withWorkspace(async (workspacePath) => {
    const logs = new GenerationLogStore();
    const text = new FakeTextGenerationService();
    const promptPacks = new PromptPackService(logs, text);
    const scenes = new SceneLibraryStore(logs, promptPacks, text);
    const articles = new ArticleGenerationService(logs, text);
    const videos = new VideoWorkflowService(logs, text);

    const pack = await promptPacks.generate({ workspacePath, citations: [citation], name: '测试提示词包' });
    assert.equal(pack.brandVoice.includes('克制'), true);

    const cards = await scenes.generate({ workspacePath, promptPackId: pack.id, citations: [citation], count: 3 });
    assert.equal(cards.length, 3);
    assert.equal(cards[0].promptPackId, pack.id);

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

    assert.equal(run.status, 'blocked');
    assert.ok(run.artifactRefs.length > 0);
    assert.match(run.artifactRefs[0], /^workflow-run:/);
    assert.equal(run.steps[0].status, 'succeeded');
    assert.match(JSON.stringify(run.steps[0].input), /source/);
    assert.match(JSON.stringify(run.steps[0].output), /已登记输入/);
    const blockedStep = run.steps.find((step) => step.status === 'blocked');
    assert.ok(blockedStep);
    assert.match(JSON.stringify(blockedStep?.output ?? {}), /blockedReason|当前步骤阻塞/);
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
      description: '由 SOP PromptDraft 物化，应该保持通用步骤而不是小红书图片模板。',
    });

    assert.match(draft.key, /^custom-sop-draft-/);
    assert.equal(draft.title, 'Prompt 工作台沉淀 SOP 草案');
    assert.equal(draft.status, 'draft');
    assert.equal(draft.steps.some((step) => step.id === 'agent_read'), true);
    assert.equal(draft.steps.some((step) => step.id === 'image_generate'), false);
    assert.equal(draft.reviewRules.some((rule) => rule.includes('真实 provider')), true);
    assert.deepEqual(draft.tags, ['自定义', 'PromptDraft', 'SOP']);
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
        source: '唯他瑞品牌知识库',
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
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('brand-knowledge-base:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-pack:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('scene-card:')));
    assert.ok(run.artifactRefs.some((ref) => ref.startsWith('prompt-draft:')));
    assert.equal((await brandKnowledgeBases.list(workspacePath)).length, 1);
    const storedPacks = await promptPacks.list(workspacePath);
    assert.equal(storedPacks.length, 1);
    assert.equal(storedPacks[0].workflowRunId, run.id);
    assert.ok(storedPacks[0].inputSourceIds.length >= 1);
    assert.ok(storedPacks[0].citations.some((item) => item.knowledgeBaseId.startsWith('brand-kb:')));
    const storedSceneCards = await sceneCards.list(workspacePath);
    assert.equal(storedSceneCards.length, 3);
    assert.equal(storedSceneCards.every((card) => card.workflowRunId === run.id), true);
    assert.equal(storedSceneCards.every((card) => card.inputSourceIds.length >= 1), true);
    const storedDrafts = await promptDrafts.list(workspacePath);
    assert.equal(storedDrafts.length, 1);
    assert.equal(storedDrafts[0].workflowRunId, run.id);
    assert.ok(storedDrafts[0].inputSourceIds.length >= 1);
    assert.equal(storedDrafts[0].sceneCardIds.length, 3);
    assert.match(storedDrafts[0].versions[0].content, /办公室早餐场景/);
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

test('视频素材包 SOP 可以通过手工事件推进到混剪 manifest', async () => {
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
        intent: '生成 15 秒视频素材 Prompt、绿幕文案图和混剪 manifest。',
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
      packageDir: pack.packageDir,
    });

    assert.equal(completed.status, 'succeeded');
    assert.equal(completed.steps.every((step) => step.status === 'succeeded'), true);
    assert.ok(completed.artifactRefs.includes(`input-source:${imported.id}`));
    assert.ok(completed.artifactRefs.includes(`overlay-card:${overlays[0].id}`));
    assert.ok(completed.artifactRefs.includes(`asset-review:${earlyVideoReview.id}`));
    assert.ok(completed.artifactRefs.includes(`mix-package:${pack.id}`));
    assert.ok(existsSync(pack.manifestPath));
    assert.equal(pack.workflowRunId, reviewedRun.id);
    const manifest = JSON.parse(await readFile(pack.manifestPath, 'utf-8'));
    assert.equal(manifest.workflowRunId, reviewedRun.id);
    assert.equal(pack.assets.find((asset) => asset.kind === 'video')?.promptDraftId, promptDraftId);
    assert.equal(pack.assets.find((asset) => asset.kind === 'video')?.sourceId, imported.id);
    assert.match(pack.assets.find((asset) => asset.kind === 'video')?.promptText ?? '', /视频 Prompt|任务/);
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
      assert.equal(capturedRequest.generationConfig.responseMimeType, 'application/json');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});

test('媒体 Provider 可以调用真实 HTTP 适配器并沉淀图片/视频产物', async () => {
  await withWorkspace(async (workspacePath) => {
    const server = createServer((request, response) => {
      if (request.url === '/v1/responses') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] }));
        return;
      }
      if (request.url === '/video') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ video_url: `http://127.0.0.1:${server.address().port}/video-file.mp4` }));
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
