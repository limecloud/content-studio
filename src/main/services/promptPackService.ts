import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { GeneratePromptPackInput, KnowledgeBaseType, KnowledgeCitation, PromptPack } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { GenerationLogStore, type CreateLogInput } from './generationLogStore';
import { TextGenerationService, TextProviderBlockedError } from './textGenerationService';

interface PromptPackModelOutput {
  name?: string;
  brandVoice?: string;
  visualStyle?: string;
  sellingPointRules?: string[];
  complianceBoundaries?: string[];
  platformConstraints?: string[];
  imagePromptFragments?: string[];
  videoPromptFragments?: string[];
}

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'prompt-packs.json');
}

function inferBaseType(citations: KnowledgeCitation[]): KnowledgeBaseType {
  return citations.some((item) => ['profile', 'timeline', 'story', 'methodology', 'quote', 'voice-style', 'boundary'].includes(item.sectionType))
    ? 'personal-ip-kb'
    : 'product-kb';
}

function compactList(values: string[] | undefined, fallback: string[]): string[] {
  const normalized = (values ?? []).map((value) => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean);
  return (normalized.length ? normalized : fallback).slice(0, 8);
}

function compactText(value: string | undefined, fallback: string): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function citationPayload(citations: KnowledgeCitation[]): Array<Record<string, string>> {
  return citations.map((item, index) => ({
    index: String(index + 1),
    knowledgeBaseId: item.knowledgeBaseId,
    sectionId: item.sectionId,
    title: item.title,
    sectionType: item.sectionType,
    excerpt: item.excerpt.slice(0, 900),
  }));
}

const PROMPT_PACK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['name', 'brandVoice', 'visualStyle', 'sellingPointRules', 'complianceBoundaries', 'platformConstraints', 'imagePromptFragments', 'videoPromptFragments'],
  properties: {
    name: { type: 'string' },
    brandVoice: { type: 'string' },
    visualStyle: { type: 'string' },
    sellingPointRules: { type: 'array', minItems: 3, items: { type: 'string' } },
    complianceBoundaries: { type: 'array', minItems: 2, items: { type: 'string' } },
    platformConstraints: { type: 'array', minItems: 3, items: { type: 'string' } },
    imagePromptFragments: { type: 'array', minItems: 3, items: { type: 'string' } },
    videoPromptFragments: { type: 'array', minItems: 3, items: { type: 'string' } },
  },
};

export class PromptPackService {
  constructor(private readonly logs: GenerationLogStore, private readonly text: TextGenerationService) {}

  private async persistLog(workspacePath: string, logId: string | undefined, input: CreateLogInput) {
    if (logId) {
      const updated = await this.logs.update(workspacePath, logId, input);
      if (updated) return updated;
    }
    return this.logs.append(input);
  }

  async list(workspacePath: string): Promise<PromptPack[]> {
    const packs = await readJsonFile<PromptPack[]>(filePathFor(workspacePath), []);
    return packs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async find(workspacePath: string, id: string): Promise<PromptPack | undefined> {
    return (await this.list(workspacePath)).find((pack) => pack.id === id);
  }

  async update(input: PromptPack): Promise<PromptPack> {
    const packs = await this.list(input.workspacePath);
    if (!packs.some((pack) => pack.id === input.id)) throw new Error(`提示词包不存在: ${input.id}`);
    const updated: PromptPack = { ...input, updatedAt: new Date().toISOString() };
    await writeJsonFile(filePathFor(input.workspacePath), packs.map((pack) => (pack.id === input.id ? updated : pack)));
    return updated;
  }

  async generate(input: GeneratePromptPackInput, options?: { logId?: string }): Promise<PromptPack> {
    const startedAt = Date.now();
    if (input.citations.length === 0) throw new Error('生成提示词包至少需要 1 条知识引用');
    const now = new Date().toISOString();
    const baseType = inferBaseType(input.citations);
    try {
      const { value, model } = await this.text.generateJson<PromptPackModelOutput>({
        workspacePath: input.workspacePath,
        systemPrompt: '你是电商与个人 IP 内容工程化策略师。你只能基于用户提供的知识引用，生成可复用的品牌提示词包。',
        schema: PROMPT_PACK_SCHEMA,
        prompt: JSON.stringify({
          task: 'generate_prompt_pack',
          baseType,
          requestedName: input.name ?? '',
          requirements: [
            '输出必须能驱动文章、图片素材和视频脚本。',
            '卖点、合规边界和素材提示词都必须可追溯到 citations。',
            '禁止医疗化、绝对化、虚假背书；不确定处写成审稿风险。',
          ],
          citations: citationPayload(input.citations),
        }, null, 2),
      });

      const pack: PromptPack = {
        id: randomUUID(),
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        name: compactText(value.name || input.name, baseType === 'personal-ip-kb' ? '个人 IP 品牌提示词包' : '产品品牌提示词包'),
        baseType,
        citations: input.citations,
        inputSourceIds: input.inputSourceIds ?? [],
        brandVoice: compactText(value.brandVoice, '表达要克制、可信、像真实经营者在解释，不夸大效果。'),
        visualStyle: compactText(value.visualStyle, baseType === 'personal-ip-kb' ? '真实人物感、专业但不端着、弱滤镜、保留生活化细节。' : '干净商业质感、突出产品主体、自然光、高可信度电商画面。'),
        sellingPointRules: compactList(value.sellingPointRules, ['先讲使用场景，再讲产品卖点；避免无来源的绝对化承诺。']),
        complianceBoundaries: compactList(value.complianceBoundaries, ['不使用医疗化、治愈化、绝对化表达；所有功效都要回到知识库原文。']),
        platformConstraints: compactList(value.platformConstraints, ['公众号强调完整论证和转化闭环', '小红书强调真实体验和可保存信息密度', '电商详情页强调卖点层级和视觉证据']),
        imagePromptFragments: compactList(value.imagePromptFragments, ['产品居中，背景服务卖点，画面不要堆字，保留可用于电商详情页的留白。']),
        videoPromptFragments: compactList(value.videoPromptFragments, ['开头先抛痛点，中段展示产品/人物可信证据，结尾给明确行动提示。']),
        createdAt: now,
        updatedAt: now,
      };
      const packs = await this.list(input.workspacePath);
      await writeJsonFile(filePathFor(input.workspacePath), [pack, ...packs].slice(0, 80));
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'prompt-pack',
        status: 'succeeded',
        title: pack.name,
        summary: `文字模型基于 ${input.citations.length} 条知识引用生成提示词包`,
        model,
        citations: input.citations,
        input,
        output: pack,
        durationMs: Date.now() - startedAt,
      });
      return pack;
    } catch (error) {
      const status = error instanceof TextProviderBlockedError ? 'blocked' : 'failed';
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'prompt-pack',
        status,
        title: input.name?.trim() || '提示词包生成未完成',
        summary: status === 'blocked' ? '文字模型未配置，未生成本地模板。' : '文字模型调用失败，未写入提示词包。',
        citations: input.citations,
        input,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}
