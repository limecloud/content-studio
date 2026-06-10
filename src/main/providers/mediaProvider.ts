import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { isImageGenerationProtocol, type GenerationStatus, type ImageGenerationProtocol, type ImageGenerationRequest, type MediaGenerationResult, type VideoCostEstimate, type VideoGenerationRequest } from '../../shared/types';
import { buildImagePrompt, generateImageAssets } from './imageGenerationProvider';
import type { AppServerCapabilityTurnResult, AppServerSidecarService, AppServerTurnArtifact } from '../services/appServerSidecarService';
import { GenerationLogStore, type CreateLogInput } from '../services/generationLogStore';
import { ModelConfigStore } from '../services/modelConfigStore';
import { getOemRuntimeConfig } from '../services/oemRuntimeConfig';
import { getWorkspaceAssetDir } from '../services/paths';

type MediaModelConfigStore = Pick<ModelConfigStore, 'readView'> & Partial<Pick<ModelConfigStore, 'getImageApiKey' | 'getVideoApiKey'>>;
type MediaAppServerRuntime = Pick<AppServerSidecarService, 'runCapabilityTurn'>;

const APP_SERVER_IMAGE_CAPABILITY_ID = 'content.image.generate';
const APP_SERVER_VIDEO_CAPABILITY_ID = 'content.video.generate';

function nowSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sanitizeProviderError(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/Lime App Server/gi, '生成服务')
    .replace(/Lime Agent Server/gi, '生成服务')
    .replace(/App Server/gi, '生成服务')
    .replace(/backend/gi, '生成服务')
    .replace(/capability/gi, '能力')
    .replace(/session/gi, '任务')
    .replace(/artifact/gi, '交付物')
    .replace(/API/gi, '生成服务')
    .replace(/接口/g, '连接');
}

function protocolOverride(value: string | undefined, fallback: ImageGenerationProtocol): ImageGenerationProtocol {
  if (isImageGenerationProtocol(value)) return value;
  return fallback;
}

function envImageApiKey(protocol: ImageGenerationProtocol): string | undefined {
  const genericKey = process.env.CONTENT_STUDIO_IMAGE_API_KEY || process.env.IMAGE_API_KEY;
  if (genericKey) return genericKey;
  if (protocol === 'gemini-generate-content') return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return process.env.OPENAI_API_KEY;
}

function resolvePlatformModel(requestedModel: string | undefined, configuredModel: string, models: string[] | undefined): string {
  const availableModels = models ?? [];
  const requested = requestedModel?.trim();
  if (requested && availableModels.includes(requested)) return requested;
  if (configuredModel && availableModels.includes(configuredModel)) return configuredModel;
  return availableModels[0] || '';
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

function collectNumberFields(payload: unknown, fieldNames: string[]): number[] {
  const values: number[] = [];
  const keys = new Set(fieldNames);
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    for (const [key, child] of Object.entries(record)) {
      if (keys.has(key)) {
        const parsed = typeof child === 'number' ? child : typeof child === 'string' ? Number(child) : Number.NaN;
        if (Number.isFinite(parsed) && parsed >= 0) values.push(parsed);
      } else {
        visit(child);
      }
    }
  };
  visit(payload);
  return values;
}

function roundCost(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizedVideoDurationSeconds(value: unknown): number {
  const duration = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(duration) && duration >= 5
    ? Math.min(300, Math.round(duration))
    : 18;
}

function videoCostEstimate(input: VideoGenerationRequest, providerResponse?: unknown): VideoCostEstimate {
  const durationSeconds = normalizedVideoDurationSeconds(input.params.durationSeconds);
  const providerCost = collectNumberFields(providerResponse, [
    'cost',
    'total_cost',
    'totalCost',
    'estimated_cost',
    'estimatedCost',
    'amount',
  ])[0];
  if (providerCost !== undefined) {
    const currency = collectStringFields(providerResponse, ['currency'])[0]?.toUpperCase() || 'CNY';
    return {
      currency,
      durationSeconds,
      unit: 'second',
      unitPrice: roundCost(providerCost / durationSeconds),
      estimatedCost: roundCost(providerCost),
      source: 'provider-response',
    };
  }

  const envUnitPrice = Number(process.env.CONTENT_STUDIO_VIDEO_CNY_PER_SECOND);
  const unitPrice = Number.isFinite(envUnitPrice) && envUnitPrice > 0 ? envUnitPrice : 2;
  return {
    currency: 'CNY',
    durationSeconds,
    unit: 'second',
    unitPrice: roundCost(unitPrice),
    estimatedCost: roundCost(unitPrice * durationSeconds),
    source: Number.isFinite(envUnitPrice) && envUnitPrice > 0 ? 'env' : 'default-internal-api',
  };
}

function videoGenerationMeta(
  input: VideoGenerationRequest,
  model: string,
  provider: string,
  providerResponse?: unknown,
) {
  return {
    provider,
    model,
    aspectRatio: input.params.aspectRatio,
    durationSeconds: input.params.durationSeconds,
    costEstimate: videoCostEstimate(input, providerResponse),
  };
}

function formatVideoCost(cost: VideoCostEstimate): string {
  const symbol = cost.currency === 'CNY' ? '¥' : `${cost.currency} `;
  return `${symbol}${cost.estimatedCost.toFixed(2)}（${cost.durationSeconds}s × ${symbol}${cost.unitPrice.toFixed(2)}/秒）`;
}

function isGenerationStatus(value: unknown): value is GenerationStatus {
  return value === 'queued' ||
    value === 'running' ||
    value === 'succeeded' ||
    value === 'failed' ||
    value === 'blocked' ||
    value === 'cancelled';
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function stringField(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function stringArrayField(record: Record<string, unknown> | undefined, field: string): string[] {
  const value = record?.[field];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function parseJsonRecord(value: string | undefined): Record<string, unknown> | undefined {
  if (!value?.trim()) return undefined;
  try {
    return recordValue(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function artifactPayloadRecord(artifact: AppServerTurnArtifact): Record<string, unknown> | undefined {
  return recordValue(artifact.payload) ?? parseJsonRecord(artifact.content);
}

function runtimePayloadRecords(result: AppServerCapabilityTurnResult): Record<string, unknown>[] {
  return [
    ...result.artifacts.map(artifactPayloadRecord),
    ...result.evidenceArtifacts.map(artifactPayloadRecord),
    ...result.events.map((event) => recordValue(event.payload)),
    ...result.evidenceEvents.map((event) => recordValue(event.payload)),
  ].filter((record): record is Record<string, unknown> => Boolean(record));
}

function resultArtifactPaths(result: AppServerCapabilityTurnResult): string[] {
  return Array.from(new Set([...result.artifacts, ...result.evidenceArtifacts]
    .map((artifact) => artifact.path)
    .filter((path): path is string => Boolean(path))));
}

function findMediaPayload(result: AppServerCapabilityTurnResult): Record<string, unknown> {
  return runtimePayloadRecords(result).find((record) => (
    isGenerationStatus(record.status) ||
    Array.isArray(record.assetRefs) ||
    typeof record.message === 'string' ||
    record.billing ||
    record.costEstimate
  )) ?? {};
}

function isVideoCostEstimate(value: unknown): value is VideoCostEstimate {
  const record = recordValue(value);
  return Boolean(record &&
    typeof record.currency === 'string' &&
    record.unit === 'second' &&
    typeof record.durationSeconds === 'number' &&
    typeof record.unitPrice === 'number' &&
    typeof record.estimatedCost === 'number' &&
    (record.source === 'provider-response' || record.source === 'env' || record.source === 'default-internal-api'));
}

function mediaResultPayload(
  result: AppServerCapabilityTurnResult,
  fallbackMessage: string,
): {
  status: GenerationStatus;
  message: string;
  assetRefs: string[];
  billing?: VideoCostEstimate;
  error?: string;
  payload: Record<string, unknown>;
} {
  const payload = findMediaPayload(result);
  const assetRefs = Array.from(new Set([
    ...stringArrayField(payload, 'assetRefs'),
    ...stringArrayField(payload, 'artifactRefs'),
    ...resultArtifactPaths(result),
  ]));
  const billing = isVideoCostEstimate(payload.billing)
    ? payload.billing
    : isVideoCostEstimate(payload.costEstimate)
      ? payload.costEstimate
      : undefined;
  return {
    status: isGenerationStatus(payload.status) ? payload.status : 'failed',
    message: stringField(payload, 'message') ?? stringField(payload, 'summary') ?? fallbackMessage,
    assetRefs,
    billing,
    error: stringField(payload, 'error') ?? stringField(payload, 'reason'),
    payload,
  };
}

async function writeVideoQueueArtifacts(input: VideoGenerationRequest, model: string, costEstimate: VideoCostEstimate): Promise<string[]> {
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
    durationSeconds: costEstimate.durationSeconds,
    costEstimate,
    prompt: input.prompt,
    script: input.script,
    featureId: input.featureId,
    featureTitle: input.featureTitle,
    selectedCaseTitle: input.selectedCaseTitle,
    imageAssetRefs: input.imageAssetRefs,
    videoAssetRefs: input.videoAssetRefs,
    audioAssetRefs: input.audioAssetRefs ?? [],
    selectedSkillSlugs: input.selectedSkillSlugs,
    citations: input.citations,
    createdAt: new Date().toISOString(),
  };
  const productName = getOemRuntimeConfig().productName;
  const markdown = [
    `# ${productName} 视频生成队列`,
    '',
    '> 真实视频生成服务尚未配置，本文件只保存可追溯的视频生成请求，不代表视频已生成。',
    '',
    '- 状态：blocked',
    '- 原因：VIDEO_PROVIDER_NOT_CONFIGURED',
    `- 模型：${model}`,
    input.featureTitle ? `- 功能：${input.featureTitle}` : '',
    input.selectedCaseTitle ? `- 示例：${input.selectedCaseTitle}` : '',
    `- 比例：${input.params.aspectRatio}`,
    `- 时长：${costEstimate.durationSeconds}s`,
    `- 内部 API 成本估算：${formatVideoCost(costEstimate)}`,
    `- 图片素材：${input.imageAssetRefs.length} 个`,
    `- 参考视频：${input.videoAssetRefs.length} 个`,
    `- 参考音频：${input.audioAssetRefs?.length ?? 0} 个`,
    `- 内容能力：${input.selectedSkillSlugs.join(', ') || '未选择'}`,
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
      audio_asset_refs: input.request.audioAssetRefs ?? [],
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
  constructor(
    private readonly modelConfig: MediaModelConfigStore,
    private readonly logs: GenerationLogStore,
    private readonly appServer?: MediaAppServerRuntime,
  ) {}

  private async persistLog(workspacePath: string, logId: string | undefined, input: CreateLogInput) {
    if (logId) {
      const updated = await this.logs.update(workspacePath, logId, input);
      if (updated) return updated;
    }
    return this.logs.append(input);
  }

  private async generateImageWithAppServer(
    input: ImageGenerationRequest,
    options: { logId?: string } | undefined,
    runtime: {
      startedAt: number;
      model: string;
      protocol: ImageGenerationProtocol;
      apiKey?: string;
      provider: string;
      endpoint: string;
      outerModel: string;
      platformManaged: boolean;
      providerPreference?: string;
    },
  ): Promise<MediaGenerationResult> {
    try {
      const imagePrompt = buildImagePrompt(input);
      const result = await this.appServer!.runCapabilityTurn({
        workspacePath: input.workspacePath,
        capabilityId: APP_SERVER_IMAGE_CAPABILITY_ID,
        input: {
          text: imagePrompt,
          compiledImagePrompt: imagePrompt,
          request: input,
          model: runtime.model,
          protocol: runtime.protocol,
          provider: runtime.provider,
          endpoint: runtime.endpoint,
          outerModel: runtime.outerModel,
        },
        selectedSkillSlugs: input.selectedSkillSlugs,
        metadata: {
          operation: 'generateImage',
          imageModel: runtime.model,
          imageProtocol: runtime.protocol,
          imageProvider: runtime.provider,
        },
        businessObjectRef: {
          kind: 'imageGeneration',
          id: input.workflowRunId ?? input.productionTaskId ?? `${APP_SERVER_IMAGE_CAPABILITY_ID}:${runtime.model}`,
          title: input.featureTitle ?? input.template,
          metadata: {
            promptPackId: input.promptPackId,
            sceneCardIds: input.sceneCardIds ?? [],
            generationMode: input.generationMode,
            promptMode: input.promptMode,
          },
        },
        backendEnv: runtime.platformManaged
          ? undefined
          : {
            CONTENT_STUDIO_IMAGE_PROTOCOL: runtime.protocol,
            CONTENT_STUDIO_IMAGE_MODEL: runtime.model,
            CONTENT_STUDIO_IMAGE_OUTER_MODEL: runtime.outerModel,
            CONTENT_STUDIO_IMAGE_BASE_URL: runtime.endpoint,
            CONTENT_STUDIO_IMAGE_API_KEY: runtime.apiKey ?? '',
          },
        providerPreference: runtime.providerPreference,
        modelPreference: runtime.model,
        backendMode: runtime.platformManaged ? 'runtime' : undefined,
      });
      const payload = mediaResultPayload(result, 'Lime App Server 未返回图片生成结果。');
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'image',
        status: payload.status,
        title: payload.status === 'succeeded' ? '图片素材生成结果' : payload.status === 'blocked' ? '图片素材生成未完成' : '图片素材生成失败',
        summary: payload.message,
        model: runtime.model,
        workflowRunId: input.workflowRunId,
        reworkSource: input.reworkSource,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        artifactRefs: payload.assetRefs,
        input,
        output: {
          assetRefs: payload.assetRefs,
          provider: runtime.provider,
          endpoint: runtime.protocol,
          runtime: 'lime-agent-server',
          capabilityId: APP_SERVER_IMAGE_CAPABILITY_ID,
          sessionId: result.sessionId,
          turnId: result.turnId,
          payload: payload.payload,
        },
        error: payload.status === 'succeeded' ? undefined : payload.error,
        durationMs: Date.now() - runtime.startedAt,
      });
      return {
        logId: log.id,
        status: payload.status,
        message: payload.message,
        assetRefs: payload.assetRefs,
      };
    } catch (error) {
      const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'image',
        status: 'failed',
        title: '图片素材生成失败',
        summary: 'Lime App Server 图片生成 capability 调用失败，未生成占位素材。',
        model: runtime.model,
        workflowRunId: input.workflowRunId,
        reworkSource: input.reworkSource,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        output: {
          assetRefs: [],
          provider: runtime.provider,
          endpoint: runtime.protocol,
          runtime: 'lime-agent-server',
          capabilityId: APP_SERVER_IMAGE_CAPABILITY_ID,
        },
        error: message,
        durationMs: Date.now() - runtime.startedAt,
      });
      return { logId: log.id, status: 'failed', message, assetRefs: [] };
    }
  }

  private async generateVideoWithAppServer(
    input: VideoGenerationRequest,
    options: { logId?: string } | undefined,
    runtime: {
      startedAt: number;
      model: string;
      apiKey?: string;
      endpoint: string;
      provider: string;
      platformManaged: boolean;
      providerPreference?: string;
    },
  ): Promise<MediaGenerationResult> {
    const fallbackMeta = videoGenerationMeta(input, runtime.model, runtime.provider);
    try {
      const result = await this.appServer!.runCapabilityTurn({
        workspacePath: input.workspacePath,
        capabilityId: APP_SERVER_VIDEO_CAPABILITY_ID,
        input: {
          text: input.prompt || input.script || input.selectedCaseTitle || '生成视频素材。',
          request: input,
          model: runtime.model,
          provider: runtime.provider,
          endpoint: runtime.endpoint,
        },
        selectedSkillSlugs: input.selectedSkillSlugs,
        metadata: {
          operation: 'generateVideo',
          videoModel: runtime.model,
          videoProvider: runtime.provider,
        },
        businessObjectRef: {
          kind: 'videoGeneration',
          id: input.featureId ?? `${APP_SERVER_VIDEO_CAPABILITY_ID}:${runtime.model}`,
          title: input.featureTitle ?? input.selectedCaseTitle ?? input.prompt.slice(0, 80),
          metadata: {
            promptPackId: input.promptPackId,
            sceneCardIds: input.sceneCardIds ?? [],
            aspectRatio: input.params.aspectRatio,
            durationSeconds: input.params.durationSeconds,
          },
        },
        backendEnv: runtime.platformManaged
          ? undefined
          : {
            CONTENT_STUDIO_VIDEO_MODEL: runtime.model,
            CONTENT_STUDIO_VIDEO_PROVIDER: runtime.provider,
            CONTENT_STUDIO_VIDEO_ENDPOINT: runtime.endpoint,
            CONTENT_STUDIO_VIDEO_API_KEY: runtime.apiKey ?? '',
            VIDEO_API_KEY: runtime.apiKey ?? '',
          },
        providerPreference: runtime.providerPreference,
        modelPreference: runtime.model,
        backendMode: runtime.platformManaged ? 'runtime' : undefined,
      });
      const payload = mediaResultPayload(result, 'Lime App Server 未返回视频生成结果。');
      const costEstimate = payload.billing ?? fallbackMeta.costEstimate;
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video',
        status: payload.status,
        title: payload.status === 'succeeded' ? '视频生成结果' : payload.status === 'queued' ? '视频生成服务已提交' : payload.status === 'blocked' ? '视频生成队列请求' : '视频生成失败',
        summary: payload.message,
        model: runtime.model,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        artifactRefs: payload.assetRefs,
        input,
        output: {
          assetRefs: payload.assetRefs,
          provider: runtime.provider,
          model: runtime.model,
          aspectRatio: input.params.aspectRatio,
          durationSeconds: input.params.durationSeconds,
          costEstimate,
          runtime: 'lime-agent-server',
          capabilityId: APP_SERVER_VIDEO_CAPABILITY_ID,
          sessionId: result.sessionId,
          turnId: result.turnId,
          payload: payload.payload,
        },
        error: payload.status === 'succeeded' || payload.status === 'queued' ? undefined : payload.error,
        durationMs: Date.now() - runtime.startedAt,
      });
      return {
        logId: log.id,
        status: payload.status,
        message: payload.message,
        assetRefs: payload.assetRefs,
        billing: costEstimate,
      };
    } catch (error) {
      const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video',
        status: 'failed',
        title: '视频生成失败',
        summary: 'Lime App Server 视频生成 capability 调用失败，未伪造视频素材。',
        model: runtime.model,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        output: {
          assetRefs: [],
          ...fallbackMeta,
          runtime: 'lime-agent-server',
          capabilityId: APP_SERVER_VIDEO_CAPABILITY_ID,
        },
        error: message,
        durationMs: Date.now() - runtime.startedAt,
      });
      return { logId: log.id, status: 'failed', message, assetRefs: [], billing: fallbackMeta.costEstimate };
    }
  }

  async generateImage(input: ImageGenerationRequest, options?: { logId?: string }): Promise<MediaGenerationResult> {
    const startedAt = Date.now();
    const config = await this.modelConfig.readView();
    const platformManaged = Boolean(config.platformManaged);
    const model = platformManaged
      ? resolvePlatformModel(input.params.imageModel, config.imageOuterModel, config.imageModels)
      : input.params.imageModel || config.imageModels[0];
    const protocol = platformManaged ? config.imageProtocol : protocolOverride(process.env.CONTENT_STUDIO_IMAGE_PROTOCOL, config.imageProtocol);
    const apiKey = platformManaged ? undefined : await this.modelConfig.getImageApiKey?.() || envImageApiKey(protocol);

    if (platformManaged && !model) {
      const message = '平台图片模型未配置：请在平台模型设置中为图片 Provider 添加显式模型 ID 后再生成。';
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'image',
        status: 'blocked',
        title: '图片生成需要配置模型',
        summary: message,
        model: 'blocked:image-model',
        workflowRunId: input.workflowRunId,
        reworkSource: input.reworkSource,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        output: { assetRefs: [] },
        error: 'PLATFORM_IMAGE_MODEL_NOT_CONFIGURED',
        durationMs: Date.now() - startedAt,
      });
      return {
        logId: log.id,
        status: 'blocked',
        message,
        assetRefs: [],
      };
    }

    if (!apiKey && config.imageApiKeyStatus === 'requires-reauthorization') {
      const message = '图片 API Key 已保存，但当前系统无法解密。请在设置 - 模型中重新保存图片 API Key 后再生成。';
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'image',
        status: 'blocked',
        title: '图片生成需要重新授权',
        summary: message,
        model,
        workflowRunId: input.workflowRunId,
        reworkSource: input.reworkSource,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        output: { assetRefs: [] },
        error: 'IMAGE_API_KEY_REAUTH_REQUIRED',
        durationMs: Date.now() - startedAt,
      });
      return {
        logId: log.id,
        status: 'blocked',
        message,
        assetRefs: [],
      };
    }

    if (this.appServer) {
      return this.generateImageWithAppServer(input, options, {
        startedAt,
        model,
        protocol,
        apiKey,
        provider: config.imageProvider,
        endpoint: platformManaged ? config.imageApiEndpoint : process.env.CONTENT_STUDIO_IMAGE_BASE_URL || config.imageApiEndpoint,
        outerModel: config.imageOuterModel,
        platformManaged,
        providerPreference: config.imageProviderPreference,
      });
    }

    const imageProviderEnabled = config.imageProvider === 'openai-responses' || Boolean(apiKey);
    if (!imageProviderEnabled || !apiKey) {
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'image',
        status: 'blocked',
        title: '图片素材生成未完成',
        summary: '图片生成服务未配置，未生成 SVG 占位或伪素材。',
        model,
        workflowRunId: input.workflowRunId,
        reworkSource: input.reworkSource,
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
        message: '图片生成服务未配置：请在设置中配置真实图片端点和图片 API Key。未生成占位素材。',
        assetRefs: [],
      };
    }

    try {
      const result = await generateImageAssets(input, {
        apiKey,
        endpoint: process.env.CONTENT_STUDIO_IMAGE_BASE_URL || config.imageApiEndpoint,
        protocol,
        outerModel: config.imageOuterModel,
        imageModel: model,
      });
      if (result.assetRefs.length === 0) throw new Error(`图片生成服务未按 ${protocol} 协议返回可用图片。`);

      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'image',
        status: 'succeeded',
        title: '图片素材生成结果',
        summary: `真实图片生成服务已生成 ${result.assetRefs.length} 个素材文件。`,
        model,
        workflowRunId: input.workflowRunId,
        reworkSource: input.reworkSource,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        artifactRefs: result.assetRefs,
        input,
        output: { assetRefs: result.assetRefs, provider: config.imageProvider, endpoint: result.transport },
        durationMs: Date.now() - startedAt,
      });
      return {
        logId: log.id,
        status: 'succeeded',
        message: `已通过 ${result.transport} 真实图片生成服务生成 ${result.assetRefs.length} 个素材文件。`,
        assetRefs: result.assetRefs,
      };
    } catch (error) {
      const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'image',
        status: 'failed',
        title: '图片素材生成失败',
        summary: '真实图片生成服务调用失败，未生成占位素材。',
        model,
        workflowRunId: input.workflowRunId,
        reworkSource: input.reworkSource,
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

  async generateVideo(input: VideoGenerationRequest, options?: { logId?: string }): Promise<MediaGenerationResult> {
    const startedAt = Date.now();
    const config = await this.modelConfig.readView();
    const platformManaged = Boolean(config.platformManaged);
    const model = platformManaged
      ? resolvePlatformModel(input.params.videoModel, config.videoModel, config.videoModels)
      : input.params.videoModel || config.videoModel;
    const apiKey = platformManaged
      ? undefined
      : await this.modelConfig.getVideoApiKey?.() || process.env.CONTENT_STUDIO_VIDEO_API_KEY || process.env.VIDEO_API_KEY;
    const endpoint = resolveGenericEndpoint(platformManaged ? config.videoApiEndpoint : process.env.CONTENT_STUDIO_VIDEO_ENDPOINT || config.videoApiEndpoint);

    if (platformManaged && !model) {
      const message = '平台视频模型未配置：请在平台模型设置中为视频 Provider 添加显式模型 ID 后再生成。';
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video',
        status: 'blocked',
        title: '视频生成需要配置模型',
        summary: message,
        model: 'blocked:video-model',
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        output: { assetRefs: [] },
        error: 'PLATFORM_VIDEO_MODEL_NOT_CONFIGURED',
        durationMs: Date.now() - startedAt,
      });
      return {
        logId: log.id,
        status: 'blocked',
        message,
        assetRefs: [],
      };
    }

    if (!apiKey && config.videoApiKeyStatus === 'requires-reauthorization') {
      const message = '视频 API Key 已保存，但当前系统无法解密。请在设置 - 模型中重新保存视频 API Key 后再生成。';
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video',
        status: 'blocked',
        title: '视频生成需要重新授权',
        summary: message,
        model,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        output: { assetRefs: [] },
        error: 'VIDEO_API_KEY_REAUTH_REQUIRED',
        durationMs: Date.now() - startedAt,
      });
      return {
        logId: log.id,
        status: 'blocked',
        message,
        assetRefs: [],
      };
    }

    if (this.appServer) {
      return this.generateVideoWithAppServer(input, options, {
        startedAt,
        model,
        apiKey,
        endpoint,
        provider: config.videoProvider,
        platformManaged,
        providerPreference: config.videoProviderPreference,
      });
    }

    if (config.videoProvider === 'generic-http' && apiKey && endpoint) {
      try {
        const providerResponse = await postGenericVideo({ endpoint, apiKey, model, request: input });
        const meta = videoGenerationMeta(input, model, config.videoProvider, providerResponse);
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
          const log = await this.persistLog(input.workspacePath, options?.logId, {
            workspacePath: input.workspacePath,
            kind: 'video',
            status: 'succeeded',
            title: '视频生成结果',
            summary: `真实视频生成服务返回 ${assetRefs.length} 个视频素材。`,
            model,
            promptPackId: input.promptPackId,
            sceneCardIds: input.sceneCardIds,
            citations: input.citations,
            artifactRefs: assetRefs,
            input,
            output: { assetRefs, ...meta },
            durationMs: Date.now() - startedAt,
          });
          return {
            logId: log.id,
            status: 'succeeded',
            message: `已通过真实视频生成服务生成 ${assetRefs.length} 个视频素材。内部 API 成本估算 ${formatVideoCost(meta.costEstimate)}。`,
            assetRefs,
            billing: meta.costEstimate,
          };
        }

        const jobArtifact = await writeProviderJobArtifact(input, model, providerResponse);
        const log = await this.persistLog(input.workspacePath, options?.logId, {
          workspacePath: input.workspacePath,
          kind: 'video',
          status: 'queued',
          title: '视频生成服务已提交',
          summary: '真实视频生成服务已接收请求，当前响应未直接返回可下载视频，已保存任务响应。',
          model,
          promptPackId: input.promptPackId,
          sceneCardIds: input.sceneCardIds,
          citations: input.citations,
          artifactRefs: [jobArtifact],
          input,
          output: { assetRefs: [jobArtifact], ...meta, providerResponse },
          durationMs: Date.now() - startedAt,
        });
        return {
          logId: log.id,
          status: 'queued',
          message: `已提交真实视频生成服务；未直接返回视频文件，已保存任务响应。内部 API 成本估算 ${formatVideoCost(meta.costEstimate)}。`,
          assetRefs: [jobArtifact],
          billing: meta.costEstimate,
        };
      } catch (error) {
        const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
        const meta = videoGenerationMeta(input, model, config.videoProvider);
        const log = await this.persistLog(input.workspacePath, options?.logId, {
          workspacePath: input.workspacePath,
          kind: 'video',
          status: 'failed',
          title: '视频生成失败',
          summary: '真实视频生成服务调用失败，未伪造视频素材。',
          model,
          promptPackId: input.promptPackId,
          sceneCardIds: input.sceneCardIds,
          citations: input.citations,
          input,
          output: { assetRefs: [], ...meta },
          error: message,
          durationMs: Date.now() - startedAt,
        });
        return { logId: log.id, status: 'failed', message, assetRefs: [], billing: meta.costEstimate };
      }
    }

    const meta = videoGenerationMeta(input, model, config.videoProvider);
    const assetRefs = await writeVideoQueueArtifacts(input, model, meta.costEstimate);
    const log = await this.persistLog(input.workspacePath, options?.logId, {
      workspacePath: input.workspacePath,
      kind: 'video',
      status: 'blocked',
      title: '视频生成队列请求',
      summary: '真实视频生成服务未配置，只生成可追溯队列文件，不伪造视频素材。',
      model,
      promptPackId: input.promptPackId,
      sceneCardIds: input.sceneCardIds,
      citations: input.citations,
      artifactRefs: assetRefs,
      input,
      output: { assetRefs, placeholderType: 'video-queue', ...meta },
      error: 'VIDEO_PROVIDER_NOT_CONFIGURED',
      durationMs: Date.now() - startedAt,
    });
    return {
      logId: log.id,
      status: 'blocked',
      message: `视频生成服务未配置：已保存可追溯队列文件，未伪造视频生成成功。内部 API 成本估算 ${formatVideoCost(meta.costEstimate)}。`,
      assetRefs,
      billing: meta.costEstimate,
    };
  }
}
