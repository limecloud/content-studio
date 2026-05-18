import type {
  VideoBreakdownRequest,
  VideoBreakdownResult,
  VideoScriptGenerationRequest,
  VideoScriptGenerationResult,
  VideoStoryboardShot,
} from '../../shared/types';
import { GenerationLogStore } from './generationLogStore';

const DEFAULT_DIMENSIONS = [
  '开头钩子',
  '钩子评分',
  '语气风格',
  '卖点逻辑',
  '镜头运镜',
  '画面构图',
  '关键词视觉元素',
  '字幕口播',
  '情绪曲线',
  '节奏密度',
  '视觉风格',
  '转化设计',
  '爆点因素',
  '内容公式',
  '转场方式',
  '用户停留点',
];

function citationSummary(input: { citations: Array<{ title: string; excerpt: string }> }): string {
  if (input.citations.length === 0) return '未使用知识库引用，结果只作为结构草稿。';
  return input.citations.slice(0, 3).map((item, index) => `${index + 1}. ${item.title}：${item.excerpt}`).join('\n');
}

export class VideoWorkflowService {
  constructor(private readonly logs: GenerationLogStore) {}

  async analyze(input: VideoBreakdownRequest): Promise<VideoBreakdownResult> {
    const startedAt = Date.now();
    const dimensions = input.dimensions.length ? input.dimensions : DEFAULT_DIMENSIONS;
    const summary = `围绕 ${dimensions.length} 个维度拆解参考${input.sourceType === 'url' ? '链接' : '视频'}，重点提取可复刻的钩子、镜头节奏、字幕口播和转化结构。`;
    const segments = [
      {
        timeRange: '00:00-00:03',
        hook: '用一个具体痛点开场，先让用户确认“这说的是我”。',
        visual: '产品或人物快速入画，背景信息少，主体明确。',
        voiceover: '第一句话必须抛出问题或反常识判断。',
        subtitle: '短句大字，保留一个关键词高亮。',
        rhythm: '快切，1 秒内给出视觉变化。',
        reusablePoint: '适合复用为产品痛点钩子或个人 IP 观点钩子。',
      },
      {
        timeRange: '00:03-00:10',
        hook: '解释为什么这个问题值得现在解决。',
        visual: '展示使用前后场景、清单、桌面或真实动作。',
        voiceover: '把卖点放进场景，不直接喊口号。',
        subtitle: '每行不超过 14 个字，跟随口播推进。',
        rhythm: '中速推进，留出用户理解时间。',
        reusablePoint: '适合承接知识库里的卖点、方法论或人物可信证据。',
      },
      {
        timeRange: '00:10-00:18',
        hook: '给出明确行动和风险边界。',
        visual: '产品 close-up、操作细节、结尾 CTA 画面。',
        voiceover: '提醒适用前提，避免绝对承诺。',
        subtitle: 'CTA 明确，但不要制造焦虑。',
        rhythm: '收束节奏，最后 2 秒保留品牌或行动提示。',
        reusablePoint: '适合转成视频生成提示词和分镜脚本。',
      },
    ];
    const reusableFormula = [
      '痛点确认 -> 场景证据 -> 卖点解释 -> 合规边界 -> 行动提示',
      '镜头优先展示真实动作，再展示产品或人物可信依据',
      `知识库引用：\n${citationSummary(input)}`,
    ];
    const risks = [
      { level: 'warning' as const, message: '当前为结构化文本拆解，尚未做真实视频视觉识别；上线前需要接入视频理解模型或人工校验。' },
      { level: input.citations.length ? 'info' as const : 'risk' as const, message: input.citations.length ? `已携带 ${input.citations.length} 条知识引用。` : '未携带知识引用，复刻脚本不能直接发布。' },
    ];
    const log = await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'video-breakdown',
      status: 'succeeded',
      title: '爆款视频拆解结果',
      summary,
      model: input.params.textModel,
      promptPackId: input.promptPackId,
      citations: input.citations,
      input,
      output: { summary, dimensions, segments, reusableFormula, risks },
      durationMs: Date.now() - startedAt,
    });
    return { logId: log.id, summary, dimensions, segments, reusableFormula, risks };
  }

  async generateScript(input: VideoScriptGenerationRequest): Promise<VideoScriptGenerationResult> {
    const startedAt = Date.now();
    const shotCount = Math.min(Math.max(input.shotCount || 4, 3), 8);
    const title = `${input.productName || '新产品'}复刻脚本`;
    const storyboard: VideoStoryboardShot[] = Array.from({ length: shotCount }, (_, index) => {
      const shot = index + 1;
      const isFirst = shot === 1;
      const isLast = shot === shotCount;
      return {
        shot,
        duration: `${Math.max(2, Math.round(input.durationSeconds / shotCount))}s`,
        visual: isFirst
          ? `${input.sceneBackground || '真实使用场景'}中快速出现痛点和产品主体。`
          : isLast
            ? '产品细节或人物可信动作收束，画面保留 CTA 留白。'
            : '展示使用动作、场景证据和知识库支持点。',
        voiceover: isFirst
          ? `如果你也在纠结${input.productName || '这个问题'}，先别急着看参数。`
          : isLast
            ? '先对照自己的场景判断，再决定是否进入下一步。'
            : '把卖点放回真实场景里讲，用事实而不是夸张承诺说服用户。',
        subtitle: input.subtitleMode === 'no-subtitle' ? '' : isFirst ? '先看场景，再看卖点' : '事实源驱动，不夸大承诺',
        rhythm: isFirst ? '快节奏钩子' : isLast ? '放慢收束' : '中速解释',
      };
    });
    const script = storyboard.map((item) => `镜头 ${item.shot}（${item.duration}）\n画面：${item.visual}\n口播：${item.voiceover}\n字幕：${item.subtitle || '无字幕'}\n节奏：${item.rhythm}`).join('\n\n');
    const videoPrompt = [
      `比例 ${input.ratio}，总时长 ${input.durationSeconds}s，${input.voiceStyle || '自然可信'}口吻。`,
      `场景：${input.sceneBackground || '真实电商内容场景'}。`,
      `产品：${input.productName || '新产品'}。`,
      `要求：${input.customRequirement || '画面真实，节奏清晰，遵守知识库合规边界。'}`,
      `分镜：\n${script}`,
      `知识引用：\n${citationSummary(input)}`,
    ].join('\n');
    const publishCheck = [
      { level: input.citations.length ? 'info' as const : 'warning' as const, message: input.citations.length ? `脚本已携带 ${input.citations.length} 条知识引用。` : '脚本未绑定知识引用，发布前需要补充事实源。' },
      { level: 'risk' as const, message: '涉及功效、收益、健康、身份背书时必须人工复核，不能直接发布。' },
    ];
    const log = await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'video-script',
      status: 'succeeded',
      title,
      summary: `生成 ${shotCount} 镜头、${input.durationSeconds}s 的视频复刻脚本`,
      model: input.params.textModel,
      promptPackId: input.promptPackId,
      sceneCardIds: input.sceneCardIds,
      citations: input.citations,
      input,
      output: { title, script, storyboard, videoPrompt, publishCheck },
      durationMs: Date.now() - startedAt,
    });
    return { logId: log.id, title, script, storyboard, videoPrompt, publishCheck };
  }
}
