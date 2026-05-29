import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { CreateSceneCardFromContentInput, GenerateSceneCardsInput, KnowledgeCitation, SceneCard } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { GenerationLogStore, type CreateLogInput } from './generationLogStore';
import { PromptPackService } from './promptPackService';
import { TextGenerationService, TextProviderBlockedError } from './textGenerationService';

interface SceneCardModelOutput {
  cards?: Array<Partial<Omit<SceneCard, 'id' | 'workspacePath' | 'promptPackId' | 'citations' | 'createdAt' | 'updatedAt'>>>;
}

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'scene-cards.json');
}

function pickCitation(citations: KnowledgeCitation[], index: number): KnowledgeCitation[] {
  if (citations.length === 0) return [];
  return [citations[index % citations.length], citations[(index + 1) % citations.length]].filter((item, itemIndex, arr) => arr.findIndex((other) => other.sectionId === item.sectionId && other.knowledgeBaseId === item.knowledgeBaseId) === itemIndex);
}

function compactText(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function citationPayload(citations: KnowledgeCitation[]): Array<Record<string, string>> {
  return citations.map((item, index) => ({
    index: String(index + 1),
    title: item.title,
    sectionType: item.sectionType,
    excerpt: item.excerpt.slice(0, 800),
  }));
}

const SCENE_CARD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['cards'],
  properties: {
    cards: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'audience', 'painPoint', 'usageScene', 'visualComposition', 'sellingPoint', 'voiceoverDirection', 'imageMaterialSuggestion', 'videoMaterialSuggestion'],
        properties: {
          title: { type: 'string' },
          audience: { type: 'string' },
          painPoint: { type: 'string' },
          usageScene: { type: 'string' },
          visualComposition: { type: 'string' },
          sellingPoint: { type: 'string' },
          voiceoverDirection: { type: 'string' },
          imageMaterialSuggestion: { type: 'string' },
          videoMaterialSuggestion: { type: 'string' },
        },
      },
    },
  },
};

export class SceneLibraryStore {
  constructor(
    private readonly logs: GenerationLogStore,
    private readonly promptPacks: PromptPackService,
    private readonly text: TextGenerationService,
  ) {}

  private async persistLog(workspacePath: string, logId: string | undefined, input: CreateLogInput) {
    if (logId) {
      const updated = await this.logs.update(workspacePath, logId, input);
      if (updated) return updated;
    }
    return this.logs.append(input);
  }

  async list(workspacePath: string): Promise<SceneCard[]> {
    const cards = await readJsonFile<SceneCard[]>(filePathFor(workspacePath), []);
    return cards.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async update(input: SceneCard): Promise<SceneCard> {
    const cards = await this.list(input.workspacePath);
    if (!cards.some((card) => card.id === input.id)) throw new Error(`场景卡不存在: ${input.id}`);
    const updated: SceneCard = { ...input, updatedAt: new Date().toISOString() };
    await writeJsonFile(filePathFor(input.workspacePath), cards.map((card) => (card.id === input.id ? updated : card)));
    return updated;
  }

  async createFromContent(input: CreateSceneCardFromContentInput): Promise<SceneCard> {
    if (!input.title.trim()) throw new Error('创建场景卡需要标题。');
    const now = new Date().toISOString();
    const card: SceneCard = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      workflowRunId: input.workflowRunId,
      promptPackId: input.promptPackId,
      inputSourceIds: input.inputSourceIds ?? [],
      contentKnowledgeMapId: input.contentKnowledgeMapId,
      contentKnowledgeMapTitle: input.contentKnowledgeMapTitle,
      coverageRowIds: input.coverageRowIds ?? [],
      sourceRefs: input.sourceRefs ?? [],
      title: compactText(input.title, '内容知识地图场景卡'),
      audience: compactText(input.audience, '待细分目标人群'),
      painPoint: compactText(input.painPoint, '待确认用户痛点'),
      usageScene: compactText(input.usageScene, '待确认使用场景'),
      visualComposition: compactText(input.visualComposition, '围绕可追溯卖点组织画面。'),
      sellingPoint: compactText(input.sellingPoint, '围绕已审核卖点表达。'),
      voiceoverDirection: compactText(input.voiceoverDirection, '保持品牌口径，避免夸大。'),
      imageMaterialSuggestion: compactText(input.imageMaterialSuggestion, '生成一张可用于内容生产的场景图。'),
      videoMaterialSuggestion: compactText(input.videoMaterialSuggestion, '生成一段 15-30 秒短视频分镜提示词。'),
      citations: input.citations ?? [],
      createdAt: now,
      updatedAt: now,
    };
    const existing = await this.list(input.workspacePath);
    await writeJsonFile(filePathFor(input.workspacePath), [card, ...existing].slice(0, 120));
    return card;
  }

  async generate(input: GenerateSceneCardsInput, options?: { logId?: string }): Promise<SceneCard[]> {
    const startedAt = Date.now();
    const promptPack = await this.promptPacks.find(input.workspacePath, input.promptPackId);
    if (!promptPack) throw new Error(`提示词包不存在: ${input.promptPackId}`);
    const citations = input.citations?.length ? input.citations : promptPack.citations;
    const inputSourceIds = input.inputSourceIds?.length ? input.inputSourceIds : promptPack.inputSourceIds ?? [];
    const count = Math.min(Math.max(input.count ?? 4, 1), 8);
    const now = new Date().toISOString();

    try {
      const { value, model } = await this.text.generateJson<SceneCardModelOutput>({
        workspacePath: input.workspacePath,
        systemPrompt: '你是电商内容场景策划。你需要把品牌提示词包和知识引用转成可执行的场景卡，供文章、图片和视频共用。',
        schema: SCENE_CARD_SCHEMA,
        prompt: JSON.stringify({
          task: 'generate_scene_cards',
          count,
          promptPack: {
            name: promptPack.name,
            baseType: promptPack.baseType,
            brandVoice: promptPack.brandVoice,
            visualStyle: promptPack.visualStyle,
            sellingPointRules: promptPack.sellingPointRules,
            complianceBoundaries: promptPack.complianceBoundaries,
            imagePromptFragments: promptPack.imagePromptFragments,
            videoPromptFragments: promptPack.videoPromptFragments,
          },
          citations: citationPayload(citations),
          requirements: [
            '每张场景卡要对应一个明确人群、痛点和使用场景。',
            '图片素材建议必须可直接进入图片生成模型。',
            '视频素材建议必须能转成 15-30 秒短视频分镜。',
            '不要编造知识库外的功效和背书。',
          ],
        }, null, 2),
      });

      const sourceCards = (value.cards ?? []).slice(0, count);
      if (sourceCards.length === 0) throw new Error('文字模型没有返回场景卡');
      const cards: SceneCard[] = sourceCards.map((card, index) => ({
        id: randomUUID(),
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        promptPackId: input.promptPackId,
        inputSourceIds,
        title: compactText(card.title, `场景卡 ${index + 1}`),
        audience: compactText(card.audience, '需要更明确的目标人群'),
        painPoint: compactText(card.painPoint, '需要更明确的用户痛点'),
        usageScene: compactText(card.usageScene, '真实使用场景'),
        visualComposition: compactText(card.visualComposition, promptPack.visualStyle),
        sellingPoint: compactText(card.sellingPoint, promptPack.sellingPointRules[index % promptPack.sellingPointRules.length] ?? '围绕知识库事实表达卖点。'),
        voiceoverDirection: compactText(card.voiceoverDirection, promptPack.brandVoice),
        imageMaterialSuggestion: compactText(card.imageMaterialSuggestion, promptPack.imagePromptFragments[index % promptPack.imagePromptFragments.length] ?? '生成一张可用于电商图的场景素材。'),
        videoMaterialSuggestion: compactText(card.videoMaterialSuggestion, promptPack.videoPromptFragments[index % promptPack.videoPromptFragments.length] ?? '生成一段可用于图生视频的提示词。'),
        citations: pickCitation(citations, index),
        createdAt: now,
        updatedAt: now,
      }));
      const existing = await this.list(input.workspacePath);
      await writeJsonFile(filePathFor(input.workspacePath), [...cards, ...existing].slice(0, 120));
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'scene-card',
        status: 'succeeded',
        title: '产品场景库',
        summary: `文字模型基于提示词包生成 ${cards.length} 张场景卡`,
        model,
        promptPackId: input.promptPackId,
        sceneCardIds: cards.map((card) => card.id),
        citations,
        input,
        output: cards,
        durationMs: Date.now() - startedAt,
      });
      return cards;
    } catch (error) {
      const status = error instanceof TextProviderBlockedError ? 'blocked' : 'failed';
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        kind: 'scene-card',
        status,
        title: '场景库生成未完成',
        summary: status === 'blocked' ? '文字模型未配置，未生成本地模板。' : '文字模型调用失败，未写入场景卡。',
        promptPackId: input.promptPackId,
        citations,
        input,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}
