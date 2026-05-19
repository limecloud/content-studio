import type { ArticleGenerationRequest, ArticleGenerationResult } from '../../shared/types';
import { GenerationLogStore } from './generationLogStore';
import { TextGenerationService, TextProviderBlockedError } from './textGenerationService';

interface ArticleModelOutput {
  titleCandidates?: string[];
  outline?: string[];
  summary?: string;
  markdown?: string;
  publishCheck?: Array<{ level?: 'info' | 'warning' | 'risk'; message?: string }>;
}

function lengthLabel(length: ArticleGenerationRequest['length']): string {
  return {
    short: '短内容',
    medium: '中等篇幅',
    long: '长文',
    custom: '自定义篇幅',
  }[length];
}

function compactText(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function compactList(values: unknown, fallback: string[], max = 8): string[] {
  if (!Array.isArray(values)) return fallback;
  const normalized = values.map((item) => String(item ?? '').trim()).filter(Boolean);
  return (normalized.length ? normalized : fallback).slice(0, max);
}

function citationPayload(input: ArticleGenerationRequest): Array<Record<string, string>> {
  return input.citations.map((citation, index) => ({
    index: String(index + 1),
    title: citation.title,
    sectionType: citation.sectionType,
    excerpt: citation.excerpt.slice(0, 900),
  }));
}

const ARTICLE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['titleCandidates', 'outline', 'summary', 'markdown', 'publishCheck'],
  properties: {
    titleCandidates: { type: 'array', minItems: 3, items: { type: 'string' } },
    outline: { type: 'array', minItems: 4, items: { type: 'string' } },
    summary: { type: 'string' },
    markdown: { type: 'string' },
    publishCheck: {
      type: 'array',
      minItems: 2,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['level', 'message'],
        properties: {
          level: { type: 'string', enum: ['info', 'warning', 'risk'] },
          message: { type: 'string' },
        },
      },
    },
  },
};

export class ArticleGenerationService {
  constructor(private readonly logs: GenerationLogStore, private readonly text: TextGenerationService) {}

  async generate(input: ArticleGenerationRequest): Promise<ArticleGenerationResult> {
    const startedAt = Date.now();
    const titleSeed = input.topic || '产品内容选题';
    try {
      const { value, model } = await this.text.generateJson<ArticleModelOutput>({
        workspacePath: input.workspacePath,
        model: input.params.textModel,
        systemPrompt: '你是中文内容主编，擅长把成型知识库转成可发布但仍需人工复核的公众号、小红书和电商内容草稿。',
        schema: ARTICLE_SCHEMA,
        maxTurns: 3,
        prompt: JSON.stringify({
          task: 'generate_article',
          articleType: input.articleType,
          platform: input.platform,
          audience: input.audience,
          topic: titleSeed,
          tone: input.tone,
          length: lengthLabel(input.length),
          customRequirement: input.customRequirement ?? '',
          promptPackId: input.promptPackId ?? '',
          sceneCardIds: input.sceneCardIds ?? [],
          assetRefs: input.assetRefs,
          selectedSkillSlugs: input.selectedSkillSlugs,
          citations: citationPayload(input),
          requirements: [
            '正文必须用 Markdown 输出。',
            '引用事实时用 [1] [2] 这类编号回指 citations。',
            '不得把未在知识库出现的功效、收益、身份背书写成事实。',
            'publishCheck 需要指出缺少资料、合规风险和人工复核点。',
          ],
        }, null, 2),
      });

      const titleCandidates = compactList(value.titleCandidates, [`${titleSeed}：先把真实问题讲清楚`, `为什么现在要重新理解 ${titleSeed}`, `从用户顾虑出发，讲清 ${titleSeed}`], 6);
      const outline = compactList(value.outline, ['开头：用目标读者正在遇到的具体问题切入', '事实源：引用知识库资料', '场景化：把卖点放进真实使用场景', '风险边界：明确不能越过的表达', '行动闭环：给读者下一步动作'], 10);
      const summary = compactText(value.summary, `围绕「${titleSeed}」生成一篇 ${input.platform} 草稿。`);
      const markdown = compactText(value.markdown, `# ${titleCandidates[0]}\n\n> 文字模型未返回正文，请重试。`);
      const publishCheck = (Array.isArray(value.publishCheck) ? value.publishCheck : [])
        .map((item) => ({ level: item.level ?? 'warning', message: compactText(item.message, '需要人工复核。') }))
        .filter((item) => item.message)
        .slice(0, 8);
      const result: Omit<ArticleGenerationResult, 'logId'> = {
        titleCandidates,
        outline,
        summary,
        markdown,
        publishCheck: publishCheck.length ? publishCheck : [{ level: 'warning', message: '模型未返回发布检查，请人工复核知识引用和合规表达。' }],
      };
      const log = await this.logs.append({
        workspacePath: input.workspacePath,
        kind: 'article',
        status: 'succeeded',
        title: titleCandidates[0],
        summary: `文字模型生成 ${input.platform} ${input.articleType} 草稿`,
        model,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        output: result,
        durationMs: Date.now() - startedAt,
      });
      return { logId: log.id, ...result };
    } catch (error) {
      const status = error instanceof TextProviderBlockedError ? 'blocked' : 'failed';
      await this.logs.append({
        workspacePath: input.workspacePath,
        kind: 'article',
        status,
        title: `${titleSeed} 生成未完成`,
        summary: status === 'blocked' ? '文字模型未配置，未生成本地模板。' : '文字模型调用失败，未生成文章草稿。',
        model: input.params.textModel,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        input,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}
