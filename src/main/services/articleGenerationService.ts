import type { ArticleGenerationRequest, ArticleGenerationResult } from '../../shared/types';
import { GenerationLogStore } from './generationLogStore';

function lengthLabel(length: ArticleGenerationRequest['length']): string {
  return {
    short: '短内容',
    medium: '中等篇幅',
    long: '长文',
    custom: '自定义篇幅',
  }[length];
}

function formatCitationBullets(input: ArticleGenerationRequest): string {
  if (input.citations.length === 0) return '- 当前未选择知识引用，需要补充事实源。';
  return input.citations.map((citation, index) => `- [${index + 1}] ${citation.title}：${citation.excerpt}`).join('\n');
}

export class ArticleGenerationService {
  constructor(private readonly logs: GenerationLogStore) {}

  async generate(input: ArticleGenerationRequest): Promise<ArticleGenerationResult> {
    const titleSeed = input.topic || '产品内容选题';
    const titleCandidates = [
      `${titleSeed}：先把真实问题讲清楚`,
      `为什么现在要重新理解 ${titleSeed}`,
      `${titleSeed} 的 3 个使用场景和 1 条合规边界`,
      `从用户顾虑出发，讲清 ${titleSeed}`,
    ];
    const outline = [
      '开头：用目标读者正在遇到的具体问题切入',
      '事实源：引用知识库中的产品 / 人物 / 合规资料',
      '场景化：把卖点放进真实使用场景，而不是堆参数',
      '风险边界：明确哪些话不能说、哪些承诺需要依据',
      '行动闭环：给读者下一步动作和素材承接方式',
    ];
    const markdown = `# ${titleCandidates[0]}\n\n` +
      `> 类型：${input.articleType}｜平台：${input.platform}｜受众：${input.audience}｜语气：${input.tone}｜篇幅：${lengthLabel(input.length)}\n\n` +
      `## 选题判断\n\n${input.customRequirement || '围绕知识库事实生成一篇可编辑的内容草稿。'}\n\n` +
      `## 知识引用\n\n${formatCitationBullets(input)}\n\n` +
      `## 正文草稿\n\n` +
      `真正有效的内容不是先喊卖点，而是先让读者确认：这说的是我。围绕「${titleSeed}」，第一段应该用一个具体场景建立共鸣，然后再把产品或人物的可信依据放出来。\n\n` +
      `接下来需要把知识库里的事实拆成三层：第一层是读者能听懂的场景，第二层是可以被引用的证据，第三层是不能越过的合规边界。这样文章、图片提示词和短视频脚本才能共享同一套事实源。\n\n` +
      `最后用一个明确行动收束：保存这份清单、对照自己的需求检查，或进入下一步素材生成。\n`;
    const publishCheck: ArticleGenerationResult['publishCheck'] = [
      { level: input.citations.length ? 'info' : 'warning', message: input.citations.length ? `已注入 ${input.citations.length} 条知识引用。` : '缺少知识引用，发布前需要补充事实源。' },
      { level: 'warning', message: '当前是本地初始化草稿，真实上线前建议接入 Claude Agent SDK 生成与人工复核。' },
      { level: 'risk', message: '涉及功效、收益、医疗或绝对化表述时，必须回到知识库合规红线。' },
    ];
    const log = await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'article',
      status: 'succeeded',
      title: titleCandidates[0],
      summary: `生成 ${input.platform} ${input.articleType} 草稿`,
      model: input.params.textModel,
      promptPackId: input.promptPackId,
      sceneCardIds: input.sceneCardIds,
      citations: input.citations,
      input,
      output: { titleCandidates, outline, markdown, publishCheck },
    });
    return { logId: log.id, titleCandidates, outline, markdown, publishCheck };
  }
}
