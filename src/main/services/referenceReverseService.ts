import { randomUUID } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type {
  InputSourceRecord,
  ReferenceReverseAnalysis,
  ReferenceReverseRequest,
  ReferenceReverseResult,
} from '../../shared/types';
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

function sanitizeProviderError(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

function imageMimeType(path: string): string | null {
  const ext = extname(path).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.avif') return 'image/avif';
  return null;
}

async function sourcePayload(
  sources: InputSourceRecord[],
  options: { includeImages?: boolean } = {},
): Promise<Array<Record<string, unknown>>> {
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

async function imagePayload(source: InputSourceRecord): Promise<Array<Record<string, string>>> {
  const refs = Array.from(new Set([source.sourcePath, ...source.artifactRefs].filter((ref): ref is string => Boolean(ref))));
  const images: Array<Record<string, string>> = [];
  for (const ref of refs) {
    const mimeType = imageMimeType(ref);
    if (!mimeType) continue;
    const data = await readFile(ref).then((payload) => payload.toString('base64'));
    images.push({
      fileName: basename(ref),
      mimeType,
      dataUrl: `data:${mimeType};base64,${data}`,
    });
  }
  return images.slice(0, 4);
}

async function countImagePayloads(sources: InputSourceRecord[]): Promise<number> {
  const payloads = await Promise.all(sources.map(imagePayload));
  return payloads.reduce((count, images) => count + images.length, 0);
}

function normalizeAnalysis(output: ReferenceReverseProviderOutput): ReferenceReverseAnalysis {
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
    replacementRules: requiredList(output, 'replacementRules', '产品替换规则'),
    generationControls: requiredList(output, 'generationControls', '生成建议'),
    risks: requiredList(output, 'risks', '风险边界'),
    prompt: requiredText(output, 'prompt', '可执行 Prompt'),
    negativePrompt: requiredText(output, 'negativePrompt', '负面约束'),
    qualityChecklist: requiredList(output, 'qualityChecklist', '质量检查项'),
  };
  return analysis;
}

function formatPromptContent(input: ReferenceReverseRequest, analysis: ReferenceReverseAnalysis): string {
  return [
    '任务：无知识库对标图反推图片 Prompt',
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

async function postVisionReverse(input: {
  endpoint: string;
  apiKey?: string;
  model: string;
  request: ReferenceReverseRequest;
  referenceSources: InputSourceRecord[];
  productSources: InputSourceRecord[];
}): Promise<ReferenceReverseProviderOutput> {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (input.apiKey) headers.authorization = `Bearer ${input.apiKey}`;
  const referencePayload = await sourcePayload(input.referenceSources, { includeImages: true });
  const productPayload = await sourcePayload(input.productSources, { includeImages: true });
  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operation: 'reference-reverse',
      model: input.model,
      user_intent: input.request.userIntent,
      platform: input.request.platform,
      target_format: input.request.targetFormat,
      output_usage: input.request.outputUsage,
      reference_sources: referencePayload,
      product_sources: productPayload,
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
    throw new Error(`视觉理解服务返回 ${response.status}：${sanitizeProviderError(text).slice(0, 1000)}`);
  }
  return text.trim() ? JSON.parse(text) as ReferenceReverseProviderOutput : {};
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
    if (!input.userIntent.trim()) throw new Error('对标图反推需要先填写用户意图。');
    if (input.referenceSourceIds.length === 0) throw new Error('对标图反推至少需要 1 个参考图 / 参考视频输入源。');

    const allSources = await this.inputSources.list(input.workspacePath);
    const referenceSources = allSources.filter((source) => input.referenceSourceIds.includes(source.id));
    const productSources = allSources.filter((source) => input.productSourceIds.includes(source.id));
    if (referenceSources.length === 0) throw new Error('未找到可用参考输入源。');
    if (productSources.length === 0) throw new Error('对标图反推需要至少 1 个产品资料或产品图输入源。');
    const referenceLogPayload = await sourcePayload(referenceSources);
    const productLogPayload = await sourcePayload(productSources);

    const config = await this.modelConfig?.readView();
    const endpoint = (process.env.CONTENT_STUDIO_VISION_ENDPOINT || process.env.CONTENT_STUDIO_IMAGE_UNDERSTANDING_ENDPOINT || '').trim();
    const apiKey = process.env.CONTENT_STUDIO_VISION_API_KEY
      || process.env.CONTENT_STUDIO_IMAGE_UNDERSTANDING_API_KEY
      || await this.modelConfig?.getImageApiKey();
    const model = process.env.CONTENT_STUDIO_VISION_MODEL || config?.imageOuterModel || config?.textModel || 'vision-provider';

    if (!endpoint) {
      const message = '真实视觉理解服务未配置：对标图反推不会用普通文字模板伪造结果。请配置 CONTENT_STUDIO_VISION_ENDPOINT 后重试。';
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'reference-reverse',
        status: 'blocked',
        title: '对标图反推未完成',
        summary: message,
        model,
        input: {
          ...input,
          referenceSources: referenceLogPayload,
          productSources: productLogPayload,
        },
        error: 'VISION_PROVIDER_NOT_CONFIGURED',
        durationMs: Date.now() - startedAt,
      });
      throw new TextProviderBlockedError(message);
    }

    try {
      const referenceImageCount = await countImagePayloads(referenceSources);
      const productContextCount = productSources.filter((source) => source.extractedText?.trim()).length + await countImagePayloads(productSources);
      if (referenceImageCount === 0) throw new Error('参考输入源里没有可读取的图片文件，无法进行真实视觉反推。');
      if (productContextCount === 0) throw new Error('产品输入源里没有可读取的图片或文本，无法替换为本方产品事实。');
      const providerOutput = await postVisionReverse({
        endpoint,
        apiKey,
        model,
        request: input,
        referenceSources,
        productSources,
      });
      const analysis = normalizeAnalysis(providerOutput);
      const artifactPath = await writeAnalysisArtifact(input, analysis);
      const draft = await this.promptDrafts.createFromContent({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        title: '对标图反推 Prompt 草稿',
        purpose: 'image',
        userIntent: input.userIntent,
        inputSourceIds: Array.from(new Set([...input.referenceSourceIds, ...input.productSourceIds])),
        content: formatPromptContent(input, analysis),
        note: '由真实视觉理解服务生成的对标图反推结果。',
        model,
        status: 'draft',
      });
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'reference-reverse',
        status: 'succeeded',
        title: '对标图反推结果',
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
      const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'reference-reverse',
        status: 'failed',
        title: '对标图反推失败',
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
