import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ImageGenerationRequest, MediaGenerationResult, VideoGenerationRequest } from '../../shared/types';
import { GenerationLogStore } from '../services/generationLogStore';
import { ModelConfigStore } from '../services/modelConfigStore';
import { getWorkspaceAssetDir } from '../services/paths';

const MAX_PLACEHOLDER_COUNT = 8;

function clampCount(count: number): number {
  return Math.min(Math.max(Math.trunc(count) || 1, 1), MAX_PLACEHOLDER_COUNT);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function compact(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > length ? `${normalized.slice(0, length)}...` : normalized;
}

function nowSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function writeImagePlaceholders(input: ImageGenerationRequest, model: string): Promise<string[]> {
  const operationId = randomUUID().slice(0, 8);
  const outputDir = join(getWorkspaceAssetDir(input.workspacePath), 'images');
  await mkdir(outputDir, { recursive: true });
  const count = clampCount(input.params.count);
  const paths: string[] = [];

  for (let index = 0; index < count; index += 1) {
    const filePath = join(outputDir, `${nowSlug()}-image-${operationId}-${index + 1}.svg`);
    const title = `Content Studio 图片占位预览 ${index + 1}/${count}`;
    const prompt = compact(input.prompt || '未填写图片提示词', 220);
    const sceneText = input.sceneCardIds?.length ? `${input.sceneCardIds.length} 张场景卡` : '未绑定场景卡';
    const citationText = input.citations.length ? `${input.citations.length} 条知识引用` : '未绑定知识引用';
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900" role="img" aria-label="${escapeXml(title)}">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#ecfeff"/>
      <stop offset="58%" stop-color="#f8fafc"/>
      <stop offset="100%" stop-color="#fff7ed"/>
    </linearGradient>
    <linearGradient id="card" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#e0f2fe"/>
    </linearGradient>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="24" stdDeviation="28" flood-color="#0f172a" flood-opacity="0.14"/>
    </filter>
  </defs>
  <rect width="1200" height="900" rx="84" fill="url(#bg)"/>
  <circle cx="995" cy="150" r="130" fill="#bae6fd" opacity="0.45"/>
  <circle cx="180" cy="760" r="180" fill="#ccfbf1" opacity="0.5"/>
  <g filter="url(#shadow)">
    <rect x="170" y="150" width="860" height="600" rx="54" fill="url(#card)" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="240" y="230" width="320" height="260" rx="36" fill="#0f172a" opacity="0.9"/>
    <path d="M280 430 L375 330 L455 430 Z" fill="#67e8f9" opacity="0.9"/>
    <circle cx="470" cy="295" r="34" fill="#fbbf24"/>
    <rect x="620" y="238" width="330" height="32" rx="16" fill="#0f766e" opacity="0.85"/>
    <rect x="620" y="306" width="260" height="24" rx="12" fill="#38bdf8" opacity="0.75"/>
    <rect x="620" y="352" width="300" height="24" rx="12" fill="#94a3b8" opacity="0.8"/>
    <rect x="620" y="398" width="225" height="24" rx="12" fill="#94a3b8" opacity="0.65"/>
    <rect x="620" y="520" width="150" height="48" rx="24" fill="#0f172a"/>
    <rect x="792" y="520" width="150" height="48" rx="24" fill="#ccfbf1" stroke="#5eead4"/>
  </g>
  <text x="170" y="820" fill="#0f172a" font-size="32" font-family="PingFang SC, Microsoft YaHei, sans-serif" font-weight="700">${escapeXml(title)}</text>
  <text x="170" y="858" fill="#475569" font-size="22" font-family="PingFang SC, Microsoft YaHei, sans-serif">真实图片 provider 未接入，已保存可追溯占位素材。</text>
  <text x="620" y="638" fill="#334155" font-size="24" font-family="PingFang SC, Microsoft YaHei, sans-serif">模型：${escapeXml(model)}</text>
  <text x="620" y="676" fill="#334155" font-size="24" font-family="PingFang SC, Microsoft YaHei, sans-serif">比例：${escapeXml(input.params.aspectRatio)} · 质量：${escapeXml(input.params.quality)} · ${escapeXml(sceneText)} · ${escapeXml(citationText)}</text>
  <foreignObject x="240" y="590" width="320" height="96">
    <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: PingFang SC, Microsoft YaHei, sans-serif; color: #334155; font-size: 20px; line-height: 1.45;">${escapeXml(prompt)}</div>
  </foreignObject>
</svg>
`;
    await writeFile(filePath, svg, 'utf-8');
    paths.push(filePath);
  }

  return paths;
}

async function writeVideoQueueArtifacts(input: VideoGenerationRequest, model: string): Promise<string[]> {
  const operationId = randomUUID().slice(0, 8);
  const outputDir = join(getWorkspaceAssetDir(input.workspacePath), 'videos');
  await mkdir(outputDir, { recursive: true });
  const baseName = `${nowSlug()}-video-queue-${operationId}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.md`);
  const payload = {
    status: 'blocked',
    reason: 'VIDEO_PROVIDER_NOT_CONFIGURED',
    model,
    aspectRatio: input.params.aspectRatio,
    durationSeconds: input.params.durationSeconds,
    prompt: input.prompt,
    script: input.script,
    imageAssetRefs: input.imageAssetRefs,
    videoAssetRefs: input.videoAssetRefs,
    selectedSkillSlugs: input.selectedSkillSlugs,
    citations: input.citations,
    createdAt: new Date().toISOString(),
  };
  const markdown = [
    '# Content Studio 视频生成队列',
    '',
    '> 真实视频 provider 尚未接入，本文件用于保存可追溯的视频生成请求。',
    '',
    `- 状态：blocked`,
    `- 原因：VIDEO_PROVIDER_NOT_CONFIGURED`,
    `- 模型：${model}`,
    `- 比例：${input.params.aspectRatio}`,
    `- 时长：${input.params.durationSeconds}s`,
    `- 图片素材：${input.imageAssetRefs.length} 个`,
    `- 参考视频：${input.videoAssetRefs.length} 个`,
    `- Skills：${input.selectedSkillSlugs.join(', ') || '未选择'}`,
    '',
    '## 视频提示词',
    '',
    input.prompt || '未填写视频提示词。',
    '',
    '## 脚本',
    '',
    input.script || '未填写脚本。',
    '',
    '## 知识引用',
    '',
    input.citations.length
      ? input.citations.map((item, index) => `${index + 1}. ${item.title}：${item.excerpt}`).join('\n')
      : '未绑定知识引用。',
    '',
  ].join('\n');

  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await writeFile(markdownPath, markdown, 'utf-8');
  return [jsonPath, markdownPath];
}

export class MediaProvider {
  constructor(private readonly modelConfig: ModelConfigStore, private readonly logs: GenerationLogStore) {}

  async generateImage(input: ImageGenerationRequest): Promise<MediaGenerationResult> {
    const startedAt = Date.now();
    const config = await this.modelConfig.readView();
    const model = input.params.imageModel || config.imageModels[0];
    const assetRefs = await writeImagePlaceholders(input, model);
    const log = await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'image',
      status: 'blocked',
      title: '图片素材生成请求',
      summary: '图片 provider 尚未接入真实生成，已生成本地 SVG 占位预览并记录完整请求。',
      model,
      promptPackId: input.promptPackId,
      sceneCardIds: input.sceneCardIds,
      citations: input.citations,
      artifactRefs: assetRefs,
      input,
      output: { assetRefs, placeholderType: 'svg' },
      error: 'IMAGE_PROVIDER_NOT_CONFIGURED',
      durationMs: Date.now() - startedAt,
    });
    return {
      logId: log.id,
      status: 'blocked',
      message: `图片 provider 尚未接入：已生成 ${assetRefs.length} 个本地占位预览，可在生成历史中打开位置。`,
      assetRefs,
    };
  }

  async generateVideo(input: VideoGenerationRequest): Promise<MediaGenerationResult> {
    const startedAt = Date.now();
    const config = await this.modelConfig.readView();
    const model = input.params.videoModel || config.videoModel;
    const assetRefs = await writeVideoQueueArtifacts(input, model);
    const log = await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'video',
      status: 'blocked',
      title: '视频生成队列请求',
      summary: '视频 provider 尚未接入真实生成，已生成本地 JSON / Markdown 队列文件。',
      model,
      promptPackId: input.promptPackId,
      sceneCardIds: input.sceneCardIds,
      citations: input.citations,
      artifactRefs: assetRefs,
      input,
      output: { assetRefs, placeholderType: 'video-queue' },
      error: 'VIDEO_PROVIDER_NOT_CONFIGURED',
      durationMs: Date.now() - startedAt,
    });
    return {
      logId: log.id,
      status: 'blocked',
      message: '视频 provider 尚未接入：已生成本地队列文件，避免伪造成功素材。',
      assetRefs,
    };
  }
}
