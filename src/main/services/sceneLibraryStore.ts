import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { GenerateSceneCardsInput, KnowledgeCitation, SceneCard } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { GenerationLogStore } from './generationLogStore';
import { PromptPackService } from './promptPackService';

const DEFAULT_SCENES = [
  { title: '痛点对比开场', audience: '正在比较同类产品的潜在用户', painPoint: '不知道卖点差异，害怕踩坑', usageScene: '购买前的搜索和收藏阶段' },
  { title: '真实使用瞬间', audience: '已经有明确需求但缺少行动理由的用户', painPoint: '担心买回去用不上', usageScene: '家庭、办公室或日常随身场景' },
  { title: '专家背书解释', audience: '重视依据和安全边界的理性用户', painPoint: '担心内容只是营销话术', usageScene: '长文、详情页或直播讲解' },
  { title: '差评反向回应', audience: '看过差评后犹豫的用户', painPoint: '对价格、效果、使用门槛有顾虑', usageScene: '评论区答疑和短视频口播' },
  { title: '礼赠 / 复购理由', audience: '需要送礼或复购理由的老用户', painPoint: '不知道如何判断适不适合', usageScene: '节日节点、会员复购、私域推荐' },
  { title: '人物故事切入', audience: '被个人 IP 信任感吸引的用户', painPoint: '想知道这个人为什么可信', usageScene: '公众号开篇、访谈短视频、品牌故事页' },
];

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'scene-cards.json');
}

function pickCitation(citations: KnowledgeCitation[], index: number): KnowledgeCitation[] {
  if (citations.length === 0) return [];
  return [citations[index % citations.length], citations[(index + 1) % citations.length]].filter((item, itemIndex, arr) => arr.findIndex((other) => other.sectionId === item.sectionId && other.knowledgeBaseId === item.knowledgeBaseId) === itemIndex);
}

export class SceneLibraryStore {
  constructor(private readonly logs: GenerationLogStore, private readonly promptPacks: PromptPackService) {}

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

  async generate(input: GenerateSceneCardsInput): Promise<SceneCard[]> {
    const startedAt = Date.now();
    const promptPack = await this.promptPacks.find(input.workspacePath, input.promptPackId);
    if (!promptPack) throw new Error(`提示词包不存在: ${input.promptPackId}`);
    const citations = input.citations?.length ? input.citations : promptPack.citations;
    const count = Math.min(Math.max(input.count ?? 4, 1), 8);
    const now = new Date().toISOString();
    const cards: SceneCard[] = DEFAULT_SCENES.slice(0, count).map((preset, index) => {
      const cardCitations = pickCitation(citations, index);
      const sourceHint = cardCitations.map((item) => item.excerpt).join(' ');
      return {
        id: randomUUID(),
        workspacePath: input.workspacePath,
        promptPackId: input.promptPackId,
        title: preset.title,
        audience: preset.audience,
        painPoint: preset.painPoint,
        usageScene: preset.usageScene,
        visualComposition: `${promptPack.visualStyle} 画面重点：${sourceHint.slice(0, 80) || '产品主体、人物动作和场景证据'}。`,
        sellingPoint: promptPack.sellingPointRules[index % promptPack.sellingPointRules.length] ?? '围绕知识库事实表达卖点。',
        voiceoverDirection: `${promptPack.brandVoice} 口播先说人话，再补证据。`,
        imageMaterialSuggestion: promptPack.imagePromptFragments[index % promptPack.imagePromptFragments.length] ?? '生成一张可用于电商图的场景素材。',
        videoMaterialSuggestion: promptPack.videoPromptFragments[index % promptPack.videoPromptFragments.length] ?? '生成一段可用于图生视频的提示词。',
        citations: cardCitations,
        createdAt: now,
        updatedAt: now,
      };
    });
    const existing = await this.list(input.workspacePath);
    await writeJsonFile(filePathFor(input.workspacePath), [...cards, ...existing].slice(0, 120));
    await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'scene-card',
      status: 'succeeded',
      title: '产品场景库',
      summary: `基于提示词包生成 ${cards.length} 张场景卡`,
      promptPackId: input.promptPackId,
      citations,
      input,
      output: cards,
      durationMs: Date.now() - startedAt,
    });
    return cards;
  }
}
