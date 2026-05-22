import type { PromptDraftPurpose, SceneCard } from './types';

function compactText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function numberedTitle(index: number, title: string): string {
  return `${String(index + 1).padStart(2, '0')}｜${title}`;
}

function sceneLine(scene: SceneCard): string {
  return [
    scene.title,
    `人群：${scene.audience}`,
    `场景：${scene.usageScene}`,
    `痛点：${scene.painPoint}`,
    `卖点：${scene.sellingPoint}`,
  ].map(compactText).join(' / ');
}

function buildImageScenePrompt(scene: SceneCard, index: number, userIntent: string): string {
  const shotVariants = [
    '手机手持平视，轻微生活化构图',
    '近景手部动作，产品自然入镜',
    '中景真实空间，人物只露局部动作',
    '俯拍桌面关系，保留自然杂物',
    '侧逆光生活抓拍，背景轻微虚化',
  ];
  return [
    `### 图片 Prompt ${numberedTitle(index, scene.title)}`,
    `目标：${compactText(userIntent)}`,
    `主体：${compactText(scene.audience)}在${compactText(scene.usageScene)}中自然使用产品，动作围绕“${compactText(scene.sellingPoint)}”。`,
    `画面：${compactText(scene.visualComposition)}；${shotVariants[index % shotVariants.length]}。`,
    '情绪与质感：真实、克制、日常，不摆拍，不像广告棚拍，保留轻微生活痕迹。',
    `图片建议：${compactText(scene.imageMaterialSuggestion)}`,
    '画幅与风格：4:5，小红书 / 电商 UGC 手机实拍，自然光，真实皮肤和材质，产品清晰但不过度硬广。',
    '负面约束：不要 AI 感、不要夸张表情、不要虚假功效、不要竞品 Logo、不要复杂文字、不要医疗化承诺。',
  ].join('\n');
}

function buildVideoScenePrompt(scene: SceneCard, index: number, userIntent: string): string {
  const cameraVariants = [
    '轻微手持推进',
    '从产品近景切到动作中景',
    '先环境后产品，最后回到人物动作',
    '手部动作连贯跟拍',
    '自然生活流转场',
    '稳定手机竖拍',
  ];
  return [
    `### 视频 Prompt ${numberedTitle(index, scene.title)}`,
    `目标：${compactText(userIntent)}`,
    '生成 15 秒 9:16 图生视频素材，不是成片，不加字幕，不加口播，不加片尾 CTA。',
    `0-3s：建立${compactText(scene.usageScene)}真实环境，${cameraVariants[index % cameraVariants.length]}，产品自然出现。`,
    `3-9s：表现${compactText(scene.audience)}的具体动作和痛点“${compactText(scene.painPoint)}”，突出${compactText(scene.sellingPoint)}，动作要可信。`,
    `9-15s：收束到${compactText(scene.videoMaterialSuggestion)}，保留可混剪的干净尾帧。`,
    `画面：${compactText(scene.visualComposition)}。`,
    '质感：真实手机实拍、自然光、轻微手持、生活化空间、产品清楚但不过度广告化。',
    '负面约束：不要成片字幕、不要口播文案、不要夸张转场、不要虚假功效、不要竞品元素、不要 AI 变形。',
  ].join('\n');
}

function buildArticleScenePrompt(scene: SceneCard, index: number, userIntent: string): string {
  return [
    `### 文案 Prompt ${numberedTitle(index, scene.title)}`,
    `目标：${compactText(userIntent)}`,
    `围绕${compactText(scene.audience)}在${compactText(scene.usageScene)}中的真实问题展开，不直接硬卖。`,
    `开头先写痛点：${compactText(scene.painPoint)}。`,
    `中段用场景动作承接卖点：${compactText(scene.sellingPoint)}。`,
    `语气：${compactText(scene.voiceoverDirection)}。`,
    '边界：不写无法追溯的功效、背书和绝对化表达，保留可人工审核的事实口径。',
  ].join('\n');
}

function buildGreenScreenScenePrompt(scene: SceneCard, index: number, userIntent: string): string {
  return [
    `### 绿幕文案图 Prompt ${numberedTitle(index, scene.title)}`,
    `目标：${compactText(userIntent)}`,
    `标题卡：${compactText(scene.painPoint)}`,
    `卖点卡：${compactText(scene.sellingPoint)}`,
    `场景卡：${compactText(scene.usageScene)}`,
    '设计要求：9:16，透明或纯绿色背景，高对比大字，单卡不超过两行，方便第三方混剪软件叠加。',
    '边界：不塞长文案，不写医疗化承诺，不伪造用户评价。',
  ].join('\n');
}

export function buildScenePromptGroupContent(
  purpose: PromptDraftPurpose,
  userIntent: string,
  scenes: SceneCard[],
): string {
  if (scenes.length === 0) {
    return [
      '# 场景 Prompt 组',
      '',
      `用户意图：${compactText(userIntent)}`,
      '',
      '生成状态：缺少已确认场景卡，无法生成可追溯 Prompt 组。',
    ].join('\n');
  }
  const count =
    purpose === 'video' ? 10 :
    purpose === 'image' ? 10 :
    purpose === 'green-screen' ? 8 :
    5;
  const title =
    purpose === 'video' ? '场景视频 Prompt 组' :
    purpose === 'image' ? '场景图片 Prompt 组' :
    purpose === 'green-screen' ? '绿幕文案图 Prompt 组' :
    '场景文案 Prompt 组';
  const buildItem = (scene: SceneCard, index: number) => {
    if (purpose === 'video') return buildVideoScenePrompt(scene, index, userIntent);
    if (purpose === 'image') return buildImageScenePrompt(scene, index, userIntent);
    if (purpose === 'green-screen') return buildGreenScreenScenePrompt(scene, index, userIntent);
    return buildArticleScenePrompt(scene, index, userIntent);
  };
  const prompts = Array.from({ length: count }, (_, index) =>
    buildItem(scenes[index % scenes.length], index),
  );
  return [
    `# ${title}`,
    '',
    `用户意图：${compactText(userIntent)}`,
    `来源场景：${scenes.map(sceneLine).join('；')}`,
    '',
    '使用边界：仅使用场景卡和用户意图中的可追溯信息；任何功效、背书、平台数据都需要人工确认。',
    '',
    prompts.join('\n\n---\n\n'),
  ].join('\n');
}
