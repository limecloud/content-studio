import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { ImageGenerationRequest, MediaGenerationResult, VideoGenerationRequest } from '../../shared/types';
import { GenerationLogStore } from '../services/generationLogStore';
import { ModelConfigStore } from '../services/modelConfigStore';
import { getWorkspaceAssetDir } from '../services/paths';

const MAX_REAL_IMAGE_COUNT = 4;

function clampCount(count: number): number {
  return Math.min(Math.max(Math.trunc(count) || 1, 1), MAX_REAL_IMAGE_COUNT);
}

function nowSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function compact(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > length ? `${normalized.slice(0, length)}...` : normalized;
}

function resolveResponsesEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1/responses';
  return trimmed.endsWith('/responses') ? trimmed : `${trimmed}/responses`;
}

function sanitizeProviderError(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

function imageMimeType(path: string): string | null {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  return null;
}

async function buildImageContentBlocks(input: ImageGenerationRequest): Promise<Array<Record<string, unknown>>> {
  const blocks: Array<Record<string, unknown>> = [{ type: 'input_text', text: buildImagePrompt(input) }];
  const refs = [...input.productImageRefs, ...input.referenceImageRefs].slice(0, 6);
  for (const ref of refs) {
    const mimeType = imageMimeType(ref);
    if (!mimeType) continue;
    try {
      const payload = await readFile(ref);
      blocks.push({ type: 'input_image', image_url: `data:${mimeType};base64,${payload.toString('base64')}` });
    } catch {
      blocks.push({ type: 'input_text', text: `本地参考图读取失败：${ref}` });
    }
  }
  return blocks;
}

function buildImagePrompt(input: ImageGenerationRequest): string {
  const citationText = input.citations.length
    ? input.citations.map((item, index) => `${index + 1}. ${item.title}：${compact(item.excerpt, 220)}`).join('\n')
    : '未绑定知识引用。';
  return [
    '你是电商内容工厂的图片生成器。请生成真实可用的中文电商图片素材，不要输出解释文字。',
    `模板：${input.template}`,
    `提示词模式：${input.promptMode}；生成模式：${input.generationMode}；${input.watermark ? '允许轻量水印。' : '不要添加水印。'}`,
    `画幅：${input.params.aspectRatio}；分辨率：${input.params.resolution}；质量：${input.params.quality}。`,
    `产品图数量：${input.productImageRefs.length}；参考图数量：${input.referenceImageRefs.length}。如果附带了图片，请保持产品主体一致，并参考风格而不是复制版式。`,
    `核心提示词：${input.prompt || '根据知识库生成一张电商场景图，突出产品主体和真实使用场景。'}`,
    `知识引用：\n${citationText}`,
    '约束：中文文字必须清晰且尽量少；不要英文乱码；不要医疗化、治愈化、绝对化承诺；不要虚构品牌 Logo。',
  ].join('\n');
}

function collectImagesFromResponseJson(payload: unknown): string[] {
  const images: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    if (record.type === 'image_generation_call' && typeof record.result === 'string') {
      images.push(record.result);
    }
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return images;
}

function collectStringFields(payload: unknown, fieldNames: string[]): string[] {
  const values: string[] = [];
  const keys = new Set(fieldNames);
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (keys.has(key) && typeof child === 'string' && child.trim()) values.push(child.trim());
      else visit(child);
    }
  };
  visit(payload);
  return Array.from(new Set(values));
}

function parseSseChunk(chunk: string): unknown[] {
  return chunk
    .split('\n\n')
    .map((eventText) => eventText.split('\n').filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trim()).join('\n'))
    .filter((data) => data && data !== '[DONE]')
    .map((data) => {
      try {
        return JSON.parse(data) as unknown;
      } catch {
        return null;
      }
    })
    .filter((value): value is unknown => value !== null);
}

async function readImageResults(response: Response): Promise<string[]> {
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.body || contentType.includes('application/json')) {
    return collectImagesFromResponseJson(await response.json());
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const images: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const boundary = buffer.lastIndexOf('\n\n');
    if (boundary < 0) continue;
    const complete = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    for (const event of parseSseChunk(complete)) {
      images.push(...collectImagesFromResponseJson(event));
    }
  }
  if (buffer.trim()) {
    for (const event of parseSseChunk(buffer)) images.push(...collectImagesFromResponseJson(event));
  }
  return images;
}

async function postResponsesImage(input: {
  endpoint: string;
  apiKey: string;
  outerModel: string;
  imageModel: string;
  bodyInput: string | Array<Record<string, unknown>>;
}): Promise<string[]> {
  const body = {
    model: input.outerModel,
    input: input.bodyInput,
    tools: [{ type: 'image_generation', model: input.imageModel }],
    stream: true,
  };
  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = sanitizeProviderError(await response.text());
    throw new Error(`图片 provider 返回 ${response.status}：${text.slice(0, 1000)}`);
  }
  return readImageResults(response);
}

async function writeBase64Images(input: ImageGenerationRequest, images: string[]): Promise<string[]> {
  const operationId = randomUUID().slice(0, 8);
  const outputDir = join(getWorkspaceAssetDir(input.workspacePath), 'images');
  await mkdir(outputDir, { recursive: true });
  const paths: string[] = [];
  for (const [index, image] of images.entries()) {
    const payload = image.includes(',') ? image.slice(image.indexOf(',') + 1) : image;
    const filePath = join(outputDir, `${nowSlug()}-image-${operationId}-${index + 1}.png`);
    await writeFile(filePath, Buffer.from(payload, 'base64'));
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
    '> 真实视频 provider 尚未配置，本文件只保存可追溯的视频生成请求，不代表视频已生成。',
    '',
    '- 状态：blocked',
    '- 原因：VIDEO_PROVIDER_NOT_CONFIGURED',
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

function resolveGenericEndpoint(endpoint: string): string {
  return endpoint.trim();
}

function videoExtension(contentType: string | null, url: string): string {
  if (contentType?.includes('quicktime')) return '.mov';
  if (contentType?.includes('webm')) return '.webm';
  if (contentType?.includes('mpegurl')) return '.m3u8';
  const match = /\.(mp4|mov|webm|m4v)(?:[?#]|$)/i.exec(url);
  return match ? `.${match[1].toLowerCase()}` : '.mp4';
}

async function writeVideoBase64(input: VideoGenerationRequest, encoded: string, index: number): Promise<string> {
  const outputDir = join(getWorkspaceAssetDir(input.workspacePath), 'videos');
  await mkdir(outputDir, { recursive: true });
  const payload = encoded.includes(',') ? encoded.slice(encoded.indexOf(',') + 1) : encoded;
  const filePath = join(outputDir, `${nowSlug()}-video-provider-${randomUUID().slice(0, 8)}-${index + 1}.mp4`);
  await writeFile(filePath, Buffer.from(payload, 'base64'));
  return filePath;
}

async function downloadVideoAsset(input: VideoGenerationRequest, url: string, index: number): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`视频素材下载失败 ${response.status}：${url}`);
  const outputDir = join(getWorkspaceAssetDir(input.workspacePath), 'videos');
  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, `${nowSlug()}-video-provider-${randomUUID().slice(0, 8)}-${index + 1}${videoExtension(response.headers.get('content-type'), url)}`);
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

async function writeProviderJobArtifact(input: VideoGenerationRequest, model: string, payload: unknown): Promise<string> {
  const outputDir = join(getWorkspaceAssetDir(input.workspacePath), 'videos');
  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, `${nowSlug()}-video-provider-job-${randomUUID().slice(0, 8)}.json`);
  await writeFile(filePath, `${JSON.stringify({ model, request: input, providerResponse: payload, createdAt: new Date().toISOString() }, null, 2)}\n`, 'utf-8');
  return filePath;
}

async function postGenericVideo(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  request: VideoGenerationRequest;
}): Promise<unknown> {
  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.model,
      prompt: input.request.prompt,
      script: input.request.script,
      aspect_ratio: input.request.params.aspectRatio,
      duration_seconds: input.request.params.durationSeconds,
      image_asset_refs: input.request.imageAssetRefs,
      video_asset_refs: input.request.videoAssetRefs,
      prompt_pack_id: input.request.promptPackId,
      scene_card_ids: input.request.sceneCardIds,
      selected_skill_slugs: input.request.selectedSkillSlugs,
      citations: input.request.citations,
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`视频 provider 返回 ${response.status}：${sanitizeProviderError(text).slice(0, 1000)}`);
  }
  const payload = text.trim() ? JSON.parse(text) as unknown : {};
  return payload;
}

export class MediaProvider {
  constructor(private readonly modelConfig: ModelConfigStore, private readonly logs: GenerationLogStore) {}

  async generateImage(input: ImageGenerationRequest): Promise<MediaGenerationResult> {
    const startedAt = Date.now();
    const config = await this.modelConfig.readView();
    const model = input.params.imageModel || config.imageModels[0];
    const apiKey = await this.modelConfig.getImageApiKey() || process.env.CONTENT_STUDIO_IMAGE_API_KEY || process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY;

    const imageProviderEnabled = config.imageProvider === 'openai-responses' || Boolean(apiKey);
    if (!imageProviderEnabled || !apiKey) {
      const log = await this.logs.append({
        workspacePath: input.workspacePath,
        kind: 'image',
        status: 'blocked',
        title: '图片素材生成未完成',
        summary: '图片 provider 未配置，未生成 SVG 占位或伪素材。',
        model,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        output: { assetRefs: [] },
        error: 'IMAGE_PROVIDER_NOT_CONFIGURED',
        durationMs: Date.now() - startedAt,
      });
      return {
        logId: log.id,
        status: 'blocked',
        message: '图片 provider 未配置：请在设置中配置 OpenAI Responses 兼容图片端点和图片 API Key。未生成占位素材。',
        assetRefs: [],
      };
    }

    try {
      const endpoint = resolveResponsesEndpoint(process.env.CONTENT_STUDIO_IMAGE_BASE_URL || config.imageApiEndpoint);
      const count = clampCount(input.params.count);
      const assetRefs: string[] = [];
      const contentBlocks = await buildImageContentBlocks(input);
      for (let index = 0; index < count; index += 1) {
        const bodyInput = contentBlocks.length > 1
          ? [{ role: 'user', content: contentBlocks }]
          : index === 0
            ? buildImagePrompt(input)
            : `${buildImagePrompt(input)}\n生成第 ${index + 1} 张变体，保持同一产品与风格但改变构图。`;
        let images: string[];
        try {
          images = await postResponsesImage({ endpoint, apiKey, outerModel: config.imageOuterModel, imageModel: model, bodyInput });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (typeof bodyInput === 'string' && /input must be a list/i.test(message)) {
            images = await postResponsesImage({ endpoint, apiKey, outerModel: config.imageOuterModel, imageModel: model, bodyInput: [{ role: 'user', content: [{ type: 'input_text', text: bodyInput }] }] });
          } else {
            throw error;
          }
        }
        assetRefs.push(...await writeBase64Images(input, images));
      }
      if (assetRefs.length === 0) throw new Error('图片 provider 未返回 image_generation_call.result。');

      const log = await this.logs.append({
        workspacePath: input.workspacePath,
        kind: 'image',
        status: 'succeeded',
        title: '图片素材生成结果',
        summary: `真实图片 provider 生成 ${assetRefs.length} 张 PNG 素材。`,
        model,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        artifactRefs: assetRefs,
        input,
        output: { assetRefs, provider: config.imageProvider, endpoint: 'responses' },
        durationMs: Date.now() - startedAt,
      });
      return {
        logId: log.id,
        status: 'succeeded',
        message: `已通过真实图片 provider 生成 ${assetRefs.length} 张 PNG 素材。`,
        assetRefs,
      };
    } catch (error) {
      const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
      const log = await this.logs.append({
        workspacePath: input.workspacePath,
        kind: 'image',
        status: 'failed',
        title: '图片素材生成失败',
        summary: '真实图片 provider 调用失败，未生成占位素材。',
        model,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        output: { assetRefs: [] },
        error: message,
        durationMs: Date.now() - startedAt,
      });
      return { logId: log.id, status: 'failed', message, assetRefs: [] };
    }
  }

  async generateVideo(input: VideoGenerationRequest): Promise<MediaGenerationResult> {
    const startedAt = Date.now();
    const config = await this.modelConfig.readView();
    const model = input.params.videoModel || config.videoModel;
    const apiKey = await this.modelConfig.getVideoApiKey() || process.env.CONTENT_STUDIO_VIDEO_API_KEY || process.env.VIDEO_API_KEY;
    const endpoint = resolveGenericEndpoint(process.env.CONTENT_STUDIO_VIDEO_ENDPOINT || config.videoApiEndpoint);

    if (config.videoProvider === 'generic-http' && apiKey && endpoint) {
      try {
        const providerResponse = await postGenericVideo({ endpoint, apiKey, model, request: input });
        const urls = collectStringFields(providerResponse, ['url', 'video_url', 'videoUrl', 'download_url', 'downloadUrl']);
        const base64Videos = collectStringFields(providerResponse, ['b64_json', 'base64', 'video_base64', 'videoBase64']);
        const assetRefs: string[] = [];
        for (const [index, encoded] of base64Videos.entries()) {
          assetRefs.push(await writeVideoBase64(input, encoded, index));
        }
        for (const [index, url] of urls.entries()) {
          if (/^https?:\/\//i.test(url)) assetRefs.push(await downloadVideoAsset(input, url, index));
        }
        if (assetRefs.length > 0) {
          const log = await this.logs.append({
            workspacePath: input.workspacePath,
            kind: 'video',
            status: 'succeeded',
            title: '视频生成结果',
            summary: `真实视频 provider 返回 ${assetRefs.length} 个视频素材。`,
            model,
            promptPackId: input.promptPackId,
            sceneCardIds: input.sceneCardIds,
            citations: input.citations,
            artifactRefs: assetRefs,
            input,
            output: { assetRefs, provider: config.videoProvider },
            durationMs: Date.now() - startedAt,
          });
          return { logId: log.id, status: 'succeeded', message: `已通过真实视频 provider 生成 ${assetRefs.length} 个视频素材。`, assetRefs };
        }

        const jobArtifact = await writeProviderJobArtifact(input, model, providerResponse);
        const log = await this.logs.append({
          workspacePath: input.workspacePath,
          kind: 'video',
          status: 'queued',
          title: '视频 Provider 已提交',
          summary: '真实视频 provider 已接收请求，当前响应未直接返回可下载视频，已保存任务响应。',
          model,
          promptPackId: input.promptPackId,
          sceneCardIds: input.sceneCardIds,
          citations: input.citations,
          artifactRefs: [jobArtifact],
          input,
          output: { assetRefs: [jobArtifact], provider: config.videoProvider, providerResponse },
          durationMs: Date.now() - startedAt,
        });
        return { logId: log.id, status: 'queued', message: '已提交真实视频 provider；未直接返回视频文件，已保存 provider 任务响应。', assetRefs: [jobArtifact] };
      } catch (error) {
        const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
        const log = await this.logs.append({
          workspacePath: input.workspacePath,
          kind: 'video',
          status: 'failed',
          title: '视频生成失败',
          summary: '真实视频 provider 调用失败，未伪造视频素材。',
          model,
          promptPackId: input.promptPackId,
          sceneCardIds: input.sceneCardIds,
          citations: input.citations,
          input,
          output: { assetRefs: [] },
          error: message,
          durationMs: Date.now() - startedAt,
        });
        return { logId: log.id, status: 'failed', message, assetRefs: [] };
      }
    }

    const assetRefs = await writeVideoQueueArtifacts(input, model);
    const log = await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'video',
      status: 'blocked',
      title: '视频生成队列请求',
      summary: '真实视频 provider 未配置，只生成可追溯队列文件，不伪造视频素材。',
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
      message: '视频 provider 未配置：已保存可追溯队列文件，未伪造视频生成成功。',
      assetRefs,
    };
  }
}
