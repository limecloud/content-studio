import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ImageGenerationProtocol,
  InputSourceRecord,
  ModelConfigView,
  ReferenceReverseAnalysis,
  ReferenceReverseRequest,
  ReferenceReverseResult,
} from '../../shared/types';
import {
  imageMimeType,
  imageReferenceFileName,
  readImageReference,
  readJsonOrText,
  resolveGeminiGenerateContentEndpoint,
  resolveOpenAIChatEndpoint,
  resolveResponsesEndpoint,
  sanitizeProviderError,
} from '../providers/multimodalProviderUtils';
import { GenerationLogStore, type CreateLogInput } from './generationLogStore';
import { InputSourceStore } from './inputSourceStore';
import { ModelConfigStore } from './modelConfigStore';
import { getWorkspaceAssetDir } from './paths';
import { PromptDraftStore } from './promptDraftStore';
import { TextProviderBlockedError } from './textGenerationService';

interface ReferenceReverseProviderOutput {
  composition?: string;
  lighting?: string;
  textArea?: string;
  style?: string;
  subjectLayout?: string;
  background?: string;
  camera?: string;
  platformFit?: string;
  reusableElements?: string[];
  replacementRules?: string[];
  generationControls?: string[];
  risks?: string[];
  prompt?: string;
  negativePrompt?: string;
  qualityChecklist?: string[];
}

interface ReferenceReverseProviderConfig {
  endpoint: string;
  apiKey?: string;
  model: string;
  protocol: ImageGenerationProtocol | 'generic-json';
  source: 'env' | 'model-config';
}

interface ReferenceReverseSourcePayload {
  id: string;
  title: string;
  kind: string;
  status: string;
  purpose?: string;
  sourcePath?: string;
  markdownPath?: string;
  summary?: string;
  extractedText?: string;
  blockedReason?: string;
  tags?: string[];
  images?: Array<{ fileName: string; mimeType: string; dataUrl: string }>;
}

class ReferenceReverseProviderError extends Error {
  constructor(
    readonly status: number,
    readonly providerLabel: string,
    message: string,
  ) {
    super(message);
    this.name = 'ReferenceReverseProviderError';
  }
}

function compactText(value: unknown): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized;
}

function compactList(values: unknown): string[] {
  const source = Array.isArray(values) ? values : [];
  const normalized = source.map((item) => compactText(item)).filter(Boolean);
  return normalized.slice(0, 10);
}

function requiredText(output: ReferenceReverseProviderOutput, key: keyof ReferenceReverseProviderOutput, label: string): string {
  const value = compactText(output[key]);
  if (!value) throw new Error(`视觉理解服务未返回 ${label}，已拒绝生成假结果。`);
  return value;
}

function requiredList(output: ReferenceReverseProviderOutput, key: keyof ReferenceReverseProviderOutput, label: string): string[] {
  const values = compactList(output[key]);
  if (values.length === 0) throw new Error(`视觉理解服务未返回 ${label}，已拒绝生成假结果。`);
  return values;
}

async function sourcePayload(
  sources: InputSourceRecord[],
  options: { includeImages?: boolean } = {},
): Promise<ReferenceReverseSourcePayload[]> {
  return Promise.all(sources.map(async (source) => ({
    id: source.id,
    title: source.title,
    kind: source.kind,
    status: source.status,
    purpose: source.purpose,
    sourcePath: source.sourcePath,
    markdownPath: source.markdownPath,
    summary: source.summary,
    extractedText: source.extractedText?.slice(0, 4_000),
    blockedReason: source.blockedReason,
    tags: source.tags,
    ...(options.includeImages ? { images: await imagePayload(source) } : {}),
  })));
}

async function imagePayload(source: InputSourceRecord): Promise<Array<{ fileName: string; mimeType: string; dataUrl: string }>> {
  const refs = Array.from(new Set([source.sourcePath, ...source.artifactRefs].filter((ref): ref is string => Boolean(ref))));
  const images: Array<{ fileName: string; mimeType: string; dataUrl: string }> = [];
  for (const ref of refs) {
    const mimeType = imageMimeType(ref);
    if (!mimeType) continue;
    const payload = await readImageReference(ref);
    if (!payload) continue;
    images.push({
      fileName: imageReferenceFileName(ref),
      mimeType: payload.mimeType,
      dataUrl: `data:${payload.mimeType};base64,${payload.data}`,
    });
  }
  return images.slice(0, 4);
}

async function countImagePayloads(sources: InputSourceRecord[]): Promise<number> {
  const payloads = await Promise.all(sources.map(imagePayload));
  return payloads.reduce((count, images) => count + images.length, 0);
}

function normalizeAnalysis(output: ReferenceReverseProviderOutput): ReferenceReverseAnalysis {
  const replacementRules = compactList(output.replacementRules);
  const generationControls = compactList(output.generationControls);
  const analysis: ReferenceReverseAnalysis = {
    composition: requiredText(output, 'composition', '构图说明'),
    lighting: requiredText(output, 'lighting', '光线说明'),
    textArea: requiredText(output, 'textArea', '文字留白区说明'),
    style: requiredText(output, 'style', '风格说明'),
    subjectLayout: compactText(output.subjectLayout),
    background: compactText(output.background),
    camera: compactText(output.camera),
    platformFit: compactText(output.platformFit),
    reusableElements: requiredList(output, 'reusableElements', '可复用元素'),
    replacementRules: replacementRules.length
      ? replacementRules
      : ['将参考图中的品牌、包装、文字、人物肖像和可识别创意元素替换为本方产品事实。'],
    generationControls: generationControls.length
      ? generationControls
      : ['按用户目标保持平台画幅、主体位置、留白区域和自然光风格，生成前人工复核素材授权。'],
    risks: requiredList(output, 'risks', '风险边界'),
    prompt: requiredText(output, 'prompt', '可执行 Prompt'),
    negativePrompt: requiredText(output, 'negativePrompt', '负面约束'),
    qualityChecklist: requiredList(output, 'qualityChecklist', '质量检查项'),
  };
  return analysis;
}

function formatPromptContent(input: ReferenceReverseRequest, analysis: ReferenceReverseAnalysis): string {
  return [
    '任务：素材拆解生成图片 Prompt',
    '',
    '用户意图：',
    input.userIntent,
    '',
    '视觉反推结果：',
    `- 构图：${analysis.composition}`,
    analysis.subjectLayout ? `- 主体：${analysis.subjectLayout}` : '',
    `- 光线：${analysis.lighting}`,
    analysis.background ? `- 背景：${analysis.background}` : '',
    analysis.camera ? `- 镜头：${analysis.camera}` : '',
    `- 文字区域：${analysis.textArea}`,
    `- 风格：${analysis.style}`,
    analysis.platformFit ? `- 平台适配：${analysis.platformFit}` : '',
    '',
    '可复用元素：',
    ...analysis.reusableElements.map((item) => `- ${item}`),
    '',
    '产品替换规则：',
    ...(analysis.replacementRules ?? []).map((item) => `- ${item}`),
    '',
    '生成建议：',
    ...(analysis.generationControls ?? []).map((item) => `- ${item}`),
    '',
    '风险与边界：',
    ...analysis.risks.map((item) => `- ${item}`),
    '',
    '图片 Prompt：',
    analysis.prompt,
    '',
    '负面约束：',
    analysis.negativePrompt,
    '',
    '质量检查：',
    ...analysis.qualityChecklist.map((item) => `- ${item}`),
  ].filter((line) => line !== '').join('\n');
}

async function writeAnalysisArtifact(input: ReferenceReverseRequest, analysis: ReferenceReverseAnalysis): Promise<string> {
  const outputDir = join(getWorkspaceAssetDir(input.workspacePath), 'reference-reverse');
  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.md`);
  await writeFile(filePath, `${formatPromptContent(input, analysis)}\n`, 'utf-8');
  return filePath;
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();
  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) return trimmed.slice(firstObject, lastObject + 1);
  return trimmed;
}

function parseProviderOutput(value: unknown): ReferenceReverseProviderOutput {
  if (value && typeof value === 'object') return value as ReferenceReverseProviderOutput;
  const text = typeof value === 'string' ? value : '';
  if (!text.trim()) return {};
  try {
    return JSON.parse(extractJsonText(text)) as ReferenceReverseProviderOutput;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`视觉理解服务返回了无法解析的 JSON：${message}`);
  }
}

function collectProviderText(payload: unknown): string {
  const chunks: string[] = [];
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') {
      if (value.trim()) chunks.push(value.trim());
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (record.type === 'output_text' && typeof record.text === 'string') chunks.push(record.text);
    else if (record.type === 'text' && typeof record.text === 'string') chunks.push(record.text);
    else if (typeof record.output_text === 'string') chunks.push(record.output_text);
    else if (typeof record.content === 'string') chunks.push(record.content);
    else Object.values(record).forEach(visit);
  };
  visit(payload);
  return chunks.join('\n').trim();
}

function providerError(payload: unknown, fallback: string): string {
  const record = payload as Record<string, unknown>;
  const error = record?.error as Record<string, unknown> | undefined;
  return sanitizeProviderError(String(error?.message ?? record?.message ?? record?.rawText ?? fallback));
}

function throwProviderHttpError(providerLabel: string, status: number, payload: unknown, fallback: string): never {
  throw new ReferenceReverseProviderError(status, providerLabel, providerError(payload, fallback));
}

function userFacingProviderError(error: ReferenceReverseProviderError): string {
  if (error.status === 429) {
    return `${error.providerLabel} 上游当前繁忙或限流，素材拆解未生成，未自动重试以避免重复消耗模型额度。请稍后点击“重试生成”，或在设置 - 模型中切换到其他可看图模型 / 网关。`;
  }
  if (error.status >= 500) {
    return `${error.providerLabel} 上游服务暂时不可用，素材拆解未生成，未自动重试。请稍后点击“重试生成”，或切换到其他可看图模型 / 网关。`;
  }
  return `${error.providerLabel} 视觉服务返回 ${error.status}：${error.message}`;
}

function outputSchema(): Record<string, unknown> {
  const stringArray = { type: 'array', items: { type: 'string' }, minItems: 1 };
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'composition',
      'lighting',
      'textArea',
      'style',
      'reusableElements',
      'replacementRules',
      'generationControls',
      'risks',
      'prompt',
      'negativePrompt',
      'qualityChecklist',
    ],
    properties: {
      composition: { type: 'string' },
      lighting: { type: 'string' },
      textArea: { type: 'string' },
      style: { type: 'string' },
      subjectLayout: { type: 'string' },
      background: { type: 'string' },
      camera: { type: 'string' },
      platformFit: { type: 'string' },
      reusableElements: stringArray,
      replacementRules: stringArray,
      generationControls: stringArray,
      risks: stringArray,
      prompt: { type: 'string' },
      negativePrompt: { type: 'string' },
      qualityChecklist: stringArray,
    },
  };
}

function buildVisionPrompt(input: ReferenceReverseRequest, referencePayload: ReferenceReverseSourcePayload[], productPayload: ReferenceReverseSourcePayload[]): string {
  return [
    '你是电商内容工厂的素材拆解专家。请真实观察参考图，并结合本方产品资料，生成可直接复制到图片生成器的中文 Prompt。',
    '',
    '用户目标：',
    input.userIntent,
    '',
    `平台：${input.platform || '未指定'}`,
    `目标规格：${input.targetFormat || '未指定'}`,
    `输出用途：${input.outputUsage || '未指定'}`,
    '',
    '参考输入源元数据：',
    JSON.stringify(referencePayload.map((source) => ({ ...source, images: source.images?.map((image) => ({ fileName: image.fileName, mimeType: image.mimeType })) })), null, 2),
    '',
    '产品输入源元数据：',
    JSON.stringify(productPayload.map((source) => ({ ...source, images: source.images?.map((image) => ({ fileName: image.fileName, mimeType: image.mimeType })) })), null, 2),
    '',
    '要求：',
    '- 必须真实分析参考图，不要用模板补齐未看见的画面。',
    '- 只复用构图、光线、镜头、文字留白区、真实感和平台风格。',
    '- 必须说明哪些元素要替换为本方产品事实。',
    '- 不得复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
    '- 只返回 JSON，不要解释，不要 Markdown，不要代码围栏。',
    `JSON Schema:\n${JSON.stringify(outputSchema())}`,
  ].join('\n');
}

function appendImageBlocks(
  blocks: Array<Record<string, unknown>>,
  sources: ReferenceReverseSourcePayload[],
  format: 'responses' | 'chat',
): void {
  for (const source of sources) {
    for (const image of source.images ?? []) {
      const label = `${source.purpose === 'reference' ? '参考图' : '产品图'}：${source.title} / ${image.fileName}`;
      if (format === 'responses') {
        blocks.push({ type: 'input_text', text: label });
        blocks.push({ type: 'input_image', image_url: image.dataUrl });
      } else {
        blocks.push({ type: 'text', text: label });
        blocks.push({ type: 'image_url', image_url: { url: image.dataUrl } });
      }
    }
  }
}

function buildResponsesInput(
  input: ReferenceReverseRequest,
  referencePayload: ReferenceReverseSourcePayload[],
  productPayload: ReferenceReverseSourcePayload[],
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [
    { type: 'input_text', text: buildVisionPrompt(input, referencePayload, productPayload) },
  ];
  appendImageBlocks(blocks, referencePayload, 'responses');
  appendImageBlocks(blocks, productPayload, 'responses');
  return [{ role: 'user', content: blocks }];
}

function buildChatContent(
  input: ReferenceReverseRequest,
  referencePayload: ReferenceReverseSourcePayload[],
  productPayload: ReferenceReverseSourcePayload[],
): Array<Record<string, unknown>> {
  const blocks: Array<Record<string, unknown>> = [
    { type: 'text', text: buildVisionPrompt(input, referencePayload, productPayload) },
  ];
  appendImageBlocks(blocks, referencePayload, 'chat');
  appendImageBlocks(blocks, productPayload, 'chat');
  return blocks;
}

function buildGeminiParts(
  input: ReferenceReverseRequest,
  referencePayload: ReferenceReverseSourcePayload[],
  productPayload: ReferenceReverseSourcePayload[],
): Array<Record<string, unknown>> {
  const parts: Array<Record<string, unknown>> = [
    { text: buildVisionPrompt(input, referencePayload, productPayload) },
  ];
  for (const source of [...referencePayload, ...productPayload]) {
    for (const image of source.images ?? []) {
      parts.push({ text: `${source.purpose === 'reference' ? '参考图' : '产品图'}：${source.title} / ${image.fileName}` });
      const data = image.dataUrl.slice(image.dataUrl.indexOf(',') + 1);
      parts.push({ inlineData: { mimeType: image.mimeType, data } });
    }
  }
  return parts;
}

async function postResponsesVisionReverse(input: {
  config: ReferenceReverseProviderConfig;
  request: ReferenceReverseRequest;
  referencePayload: ReferenceReverseSourcePayload[];
  productPayload: ReferenceReverseSourcePayload[];
}): Promise<ReferenceReverseProviderOutput> {
  const response = await fetch(resolveResponsesEndpoint(input.config.endpoint), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.config.model,
      input: buildResponsesInput(input.request, input.referencePayload, input.productPayload),
      text: {
        format: {
          type: 'json_schema',
          name: 'reference_reverse_analysis',
          strict: true,
          schema: outputSchema(),
        },
      },
    }),
  });
  const payload = await readJsonOrText(response);
  if (!response.ok) throwProviderHttpError('Responses 素材拆解视觉服务', response.status, payload, '请求失败');
  return parseProviderOutput(collectProviderText(payload) || payload);
}

async function postOpenAIChatVisionReverse(input: {
  config: ReferenceReverseProviderConfig;
  request: ReferenceReverseRequest;
  referencePayload: ReferenceReverseSourcePayload[];
  productPayload: ReferenceReverseSourcePayload[];
}): Promise<ReferenceReverseProviderOutput> {
  const response = await fetch(resolveOpenAIChatEndpoint(input.config.endpoint), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.config.model,
      messages: [{ role: 'user', content: buildChatContent(input.request, input.referencePayload, input.productPayload) }],
      response_format: { type: 'json_object' },
      stream: false,
    }),
  });
  const payload = await readJsonOrText(response);
  if (!response.ok) throwProviderHttpError('Chat Completions 素材拆解视觉服务', response.status, payload, '请求失败');
  return parseProviderOutput(collectProviderText(payload));
}

async function postGeminiVisionReverse(input: {
  config: ReferenceReverseProviderConfig;
  request: ReferenceReverseRequest;
  referencePayload: ReferenceReverseSourcePayload[];
  productPayload: ReferenceReverseSourcePayload[];
}): Promise<ReferenceReverseProviderOutput> {
  const response = await fetch(resolveGeminiGenerateContentEndpoint(input.config.endpoint, input.config.model), {
    method: 'POST',
    headers: {
      'x-goog-api-key': input.config.apiKey ?? '',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: buildGeminiParts(input.request, input.referencePayload, input.productPayload) }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });
  const payload = await readJsonOrText(response);
  if (!response.ok) throwProviderHttpError('Gemini 素材拆解视觉服务', response.status, payload, '请求失败');
  return parseProviderOutput(collectProviderText(payload));
}

async function postVisionReverse(input: {
  config: ReferenceReverseProviderConfig;
  request: ReferenceReverseRequest;
  referencePayload: ReferenceReverseSourcePayload[];
  productPayload: ReferenceReverseSourcePayload[];
}): Promise<ReferenceReverseProviderOutput> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (input.config.apiKey) headers.authorization = `Bearer ${input.config.apiKey}`;
  const response = await fetch(input.config.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operation: 'reference-reverse',
      model: input.config.model,
      user_intent: input.request.userIntent,
      platform: input.request.platform,
      target_format: input.request.targetFormat,
      output_usage: input.request.outputUsage,
      reference_sources: input.referencePayload,
      product_sources: input.productPayload,
      requirements: [
        '必须真实分析参考图或参考视频，不要用模板补齐未看见的画面。',
        '输出 composition、subjectLayout、lighting、background、camera、textArea、style、platformFit。',
        '只复用构图、光线、镜头、文字留白区、真实感和平台风格。',
        '输出 replacementRules，说明哪些必须替换为本方产品事实。',
        '输出 generationControls，给出画幅、清晰度、数量和风格强度建议。',
        '不得复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
        '必须输出 prompt、negativePrompt、risks 和 qualityChecklist。',
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new ReferenceReverseProviderError(response.status, '视觉理解服务', sanitizeProviderError(text).slice(0, 1000));
  }
  return parseProviderOutput(text);
}

async function generateVisionReverse(input: {
  config: ReferenceReverseProviderConfig;
  request: ReferenceReverseRequest;
  referencePayload: ReferenceReverseSourcePayload[];
  productPayload: ReferenceReverseSourcePayload[];
}): Promise<ReferenceReverseProviderOutput> {
  if (input.config.protocol === 'openai-responses') return postResponsesVisionReverse(input);
  if (input.config.protocol === 'openai-chat-data-uri') return postOpenAIChatVisionReverse(input);
  if (input.config.protocol === 'gemini-generate-content') return postGeminiVisionReverse(input);
  return postVisionReverse(input);
}

function envImageApiKey(protocol: ImageGenerationProtocol): string | undefined {
  const genericKey = process.env.CONTENT_STUDIO_IMAGE_API_KEY || process.env.IMAGE_API_KEY;
  if (genericKey) return genericKey;
  if (protocol === 'gemini-generate-content') return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return process.env.OPENAI_API_KEY;
}

function platformVisionModel(config: ModelConfigView): string {
  const models = config.imageModels ?? [];
  if (config.imageOuterModel && models.includes(config.imageOuterModel)) return config.imageOuterModel;
  return models[0] ?? '';
}

function resolveProviderConfig(config: ModelConfigView | undefined, apiKey: string | undefined): ReferenceReverseProviderConfig {
  if (config?.platformManaged) {
    return {
      endpoint: config.imageApiEndpoint ?? '',
      apiKey: undefined,
      model: platformVisionModel(config),
      protocol: config.imageProtocol ?? 'openai-responses',
      source: 'model-config',
    };
  }
  const envEndpoint = (process.env.CONTENT_STUDIO_VISION_ENDPOINT || process.env.CONTENT_STUDIO_IMAGE_UNDERSTANDING_ENDPOINT || '').trim();
  const envApiKey = process.env.CONTENT_STUDIO_VISION_API_KEY || process.env.CONTENT_STUDIO_IMAGE_UNDERSTANDING_API_KEY;
  const envModel = process.env.CONTENT_STUDIO_VISION_MODEL;
  if (envEndpoint) {
    return {
      endpoint: envEndpoint,
      apiKey: envApiKey || apiKey,
      model: envModel || config?.imageOuterModel || config?.imageModels?.[0] || config?.textModel || '',
      protocol: 'generic-json',
      source: 'env',
    };
  }
  const protocol = config?.imageProtocol ?? 'openai-responses';
  return {
    endpoint: config?.imageApiEndpoint ?? '',
    apiKey: apiKey || envImageApiKey(protocol),
    model: config?.imageOuterModel || config?.imageModels?.[0] || config?.textModel || '',
    protocol,
    source: 'model-config',
  };
}

function visionConfigBlockedMessage(config: ModelConfigView | undefined, provider: ReferenceReverseProviderConfig): { message: string; error: string } | null {
  if (config?.platformManaged) {
    return {
      message: '素材拆解暂未接入平台 lime.agent 视觉理解 runtime。平台托管模式下不会读取 Product App 本地或环境变量 API Key，请到平台模型设置确认 Provider 后再通过已接入的 Agent 工作台执行。',
      error: 'VISION_PLATFORM_AGENT_RUNTIME_REQUIRED',
    };
  }
  if (config?.imageApiKeyStatus === 'requires-reauthorization' && !provider.apiKey) {
    return {
      message: '素材拆解需要可看图的图片/多模态模型：图片 API Key 已保存但当前系统无法解密，请在设置 - 模型中重新保存图片 API Key 后重试。',
      error: 'VISION_API_KEY_REAUTH_REQUIRED',
    };
  }
  if (!provider.endpoint.trim() || !provider.model.trim() || (provider.source === 'model-config' && !provider.apiKey)) {
    return {
      message: '素材拆解需要可看图的图片/多模态模型：请在设置 - 模型中保存图片 API Key、端点和模型后重试。',
      error: 'VISION_PROVIDER_NOT_CONFIGURED',
    };
  }
  return null;
}

export class ReferenceReverseService {
  constructor(
    private readonly logs: GenerationLogStore,
    private readonly inputSources: InputSourceStore,
    private readonly promptDrafts: PromptDraftStore,
    private readonly modelConfig?: ModelConfigStore,
  ) {}

  private async persistLog(workspacePath: string, logId: string | undefined, input: CreateLogInput) {
    if (logId) {
      const updated = await this.logs.update(workspacePath, logId, input);
      if (updated) return updated;
    }
    return this.logs.append(input);
  }

  async generate(input: ReferenceReverseRequest, options?: { logId?: string }): Promise<ReferenceReverseResult> {
    const startedAt = Date.now();
    if (!input.userIntent.trim()) throw new Error('素材拆解需要先填写拆解目标。');
    if (input.referenceSourceIds.length === 0) throw new Error('素材拆解至少需要 1 个参考图 / 参考视频输入源。');

    const allSources = await this.inputSources.list(input.workspacePath);
    const referenceSources = allSources.filter((source) => input.referenceSourceIds.includes(source.id));
    const productSources = allSources.filter((source) => input.productSourceIds.includes(source.id));
    if (referenceSources.length === 0) throw new Error('未找到可用参考输入源。');
    if (productSources.length === 0) throw new Error('素材拆解需要至少 1 个产品资料或产品图输入源。');
    const referenceLogPayload = await sourcePayload(referenceSources);
    const productLogPayload = await sourcePayload(productSources);

    const config = await this.modelConfig?.readView();
    const providerConfig = resolveProviderConfig(
      config,
      config?.platformManaged ? undefined : await this.modelConfig?.getImageApiKey(),
    );
    const model = providerConfig.model;
    const blocked = visionConfigBlockedMessage(config, providerConfig);

    if (blocked) {
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'reference-reverse',
        status: 'blocked',
        title: '素材拆解未完成',
        summary: blocked.message,
        model,
        input: {
          ...input,
          referenceSources: referenceLogPayload,
          productSources: productLogPayload,
        },
        error: blocked.error,
        durationMs: Date.now() - startedAt,
      });
      throw new TextProviderBlockedError(blocked.message);
    }

    try {
      const referenceImageCount = await countImagePayloads(referenceSources);
      const productContextCount = productSources.filter((source) => source.extractedText?.trim()).length + await countImagePayloads(productSources);
      if (referenceImageCount === 0) throw new Error('参考输入源里没有可读取的图片文件，无法进行真实视觉反推。');
      if (productContextCount === 0) throw new Error('产品输入源里没有可读取的图片或文本，无法替换为本方产品事实。');
      const referenceProviderPayload = await sourcePayload(referenceSources, { includeImages: true });
      const productProviderPayload = await sourcePayload(productSources, { includeImages: true });
      const providerOutput = await generateVisionReverse({
        config: providerConfig,
        request: input,
        referencePayload: referenceProviderPayload,
        productPayload: productProviderPayload,
      });
      const analysis = normalizeAnalysis(providerOutput);
      const artifactPath = await writeAnalysisArtifact(input, analysis);
      const draft = await this.promptDrafts.createFromContent({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        title: '素材拆解 Prompt 草稿',
        purpose: 'image',
        userIntent: input.userIntent,
        inputSourceIds: Array.from(new Set([...input.referenceSourceIds, ...input.productSourceIds])),
        content: formatPromptContent(input, analysis),
        note: '由真实视觉理解服务生成的素材拆解结果。',
        model,
        status: 'draft',
      });
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'reference-reverse',
        status: 'succeeded',
        title: '素材拆解结果',
        summary: `已基于 ${referenceSources.length} 个参考源生成可追溯图片 Prompt 草稿。`,
        model,
        artifactRefs: [artifactPath],
        input: {
          ...input,
          referenceSources: referenceLogPayload,
          productSources: productLogPayload,
        },
        output: {
          analysis,
          promptDraftId: draft.id,
        },
        durationMs: Date.now() - startedAt,
      });
      return { logId: log.id, analysis, promptDraft: draft };
    } catch (error) {
      if (error instanceof TextProviderBlockedError) throw error;
      const message = error instanceof ReferenceReverseProviderError
        ? userFacingProviderError(error)
        : sanitizeProviderError(error instanceof Error ? error.message : String(error));
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'reference-reverse',
        status: 'failed',
        title: '素材拆解失败',
        summary: '真实视觉理解服务调用失败，未伪造反推结果。',
        model,
        input: {
          ...input,
          referenceSources: referenceLogPayload,
          productSources: productLogPayload,
        },
        error: message,
        durationMs: Date.now() - startedAt,
      });
      throw new Error(message);
    }
  }
}
