import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { GeneratePromptPackInput, KnowledgeBaseType, KnowledgeCitation, PromptPack } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { GenerationLogStore } from './generationLogStore';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'prompt-packs.json');
}

function inferBaseType(citations: KnowledgeCitation[]): KnowledgeBaseType {
  return citations.some((item) => ['profile', 'timeline', 'story', 'methodology', 'quote', 'voice-style', 'boundary'].includes(item.sectionType))
    ? 'personal-ip-kb'
    : 'product-kb';
}

function excerpts(citations: KnowledgeCitation[], types: string[]): string[] {
  return citations.filter((item) => types.includes(item.sectionType)).map((item) => item.excerpt).filter(Boolean);
}

function compactList(values: string[], fallback: string[]): string[] {
  const normalized = values.map((value) => value.replace(/\s+/g, ' ').trim()).filter(Boolean);
  return (normalized.length ? normalized : fallback).slice(0, 6);
}

export class PromptPackService {
  constructor(private readonly logs: GenerationLogStore) {}

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

  async generate(input: GeneratePromptPackInput): Promise<PromptPack> {
    const startedAt = Date.now();
    if (input.citations.length === 0) throw new Error('生成提示词包至少需要 1 条知识引用');
    const now = new Date().toISOString();
    const baseType = inferBaseType(input.citations);
    const brandRefs = excerpts(input.citations, ['brand', 'profile', 'voice-style', 'quote']);
    const productRefs = excerpts(input.citations, ['product', 'selling-point', 'science', 'methodology']);
    const complianceRefs = excerpts(input.citations, ['compliance', 'boundary']);
    const sceneRefs = excerpts(input.citations, ['scenario-script', 'story', 'qa', 'objection-handling']);
    const pack: PromptPack = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      name: input.name?.trim() || (baseType === 'personal-ip-kb' ? '个人 IP 品牌提示词包' : '产品品牌提示词包'),
      baseType,
      citations: input.citations,
      brandVoice: compactList(brandRefs, ['表达要克制、可信、像真实经营者在解释，不夸大效果。']).join('；'),
      visualStyle: baseType === 'personal-ip-kb'
        ? '真实人物感、专业但不端着、弱滤镜、保留生活化细节。'
        : '干净商业质感、突出产品主体、自然光、高可信度电商画面。',
      sellingPointRules: compactList(productRefs, ['先讲使用场景，再讲产品卖点；避免无来源的绝对化承诺。']),
      complianceBoundaries: compactList(complianceRefs, ['不使用医疗化、治愈化、绝对化表达；所有功效都要回到知识库原文。']),
      platformConstraints: ['公众号强调完整论证和转化闭环', '小红书强调真实体验和可保存信息密度', '电商详情页强调卖点层级和视觉证据', '短视频脚本强调 3 秒钩子和镜头可执行'],
      imagePromptFragments: compactList(sceneRefs.concat(productRefs), ['产品居中，背景服务卖点，画面不要堆字，保留可用于电商详情页的留白。']),
      videoPromptFragments: compactList(sceneRefs.concat(brandRefs), ['开头先抛痛点，中段展示产品/人物可信证据，结尾给明确行动提示。']),
      createdAt: now,
      updatedAt: now,
    };
    const packs = await this.list(input.workspacePath);
    await writeJsonFile(filePathFor(input.workspacePath), [pack, ...packs].slice(0, 80));
    await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'prompt-pack',
      status: 'succeeded',
      title: pack.name,
      summary: `基于 ${input.citations.length} 条知识引用生成提示词包`,
      citations: input.citations,
      input,
      output: pack,
      durationMs: Date.now() - startedAt,
    });
    return pack;
  }
}
