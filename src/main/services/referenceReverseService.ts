import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
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
  reusableElements?: string[];
  risks?: string[];
  prompt?: string;
  negativePrompt?: string;
  qualityChecklist?: string[];
}

function compactText(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function compactList(values: unknown, fallback: string[]): string[] {
  const source = Array.isArray(values) ? values : [];
  const normalized = source.map((item) => compactText(item, '')).filter(Boolean);
  return (normalized.length ? normalized : fallback).slice(0, 10);
}

function sanitizeProviderError(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

function sourcePayload(sources: InputSourceRecord[]): Array<Record<string, unknown>> {
  return sources.map((source) => ({
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
  }));
}

function normalizeAnalysis(output: ReferenceReverseProviderOutput): ReferenceReverseAnalysis {
  const analysis: ReferenceReverseAnalysis = {
    composition: compactText(output.composition, '视觉理解服务未返回构图说明。'),
    lighting: compactText(output.lighting, '视觉理解服务未返回光线说明。'),
    textArea: compactText(output.textArea, '视觉理解服务未返回文字留白区说明。'),
    style: compactText(output.style, '视觉理解服务未返回风格说明。'),
    reusableElements: compactList(output.reusableElements, ['构图、光线、镜头语言和真实感需要人工复核后复用。']),
    risks: compactList(output.risks, ['需要人工复核竞品元素、Logo、包装、文案和素材授权风险。']),
    prompt: compactText(output.prompt, ''),
    negativePrompt: compactText(output.negativePrompt, '不要复制竞品 Logo、包装、可识别文案、医疗化承诺、绝对化表达。'),
    qualityChecklist: compactList(output.qualityChecklist, ['主体一致', '来源可追溯', '无竞品可识别元素', '文字区域可读']),
  };
  if (!analysis.prompt) throw new Error('视觉理解服务未返回可执行 Prompt。');
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
    `- 光线：${analysis.lighting}`,
    `- 文字区域：${analysis.textArea}`,
    `- 风格：${analysis.style}`,
    '',
    '可复用元素：',
    ...analysis.reusableElements.map((item) => `- ${item}`),
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
  ].join('\n');
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
  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      operation: 'reference-reverse',
      model: input.model,
      user_intent: input.request.userIntent,
      reference_sources: sourcePayload(input.referenceSources),
      product_sources: sourcePayload(input.productSources),
      requirements: [
        '必须真实分析参考图或参考视频，不要用模板补齐未看见的画面。',
        '只复用构图、光线、镜头、文字留白区、真实感和平台风格。',
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
          referenceSources: sourcePayload(referenceSources),
          productSources: sourcePayload(productSources),
        },
        error: 'VISION_PROVIDER_NOT_CONFIGURED',
        durationMs: Date.now() - startedAt,
      });
      throw new TextProviderBlockedError(message);
    }

    try {
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
          referenceSources: sourcePayload(referenceSources),
          productSources: sourcePayload(productSources),
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
          referenceSources: sourcePayload(referenceSources),
          productSources: sourcePayload(productSources),
        },
        error: message,
        durationMs: Date.now() - startedAt,
      });
      throw new Error(message);
    }
  }
}
