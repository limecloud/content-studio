import type {
  VideoBreakdownRequest,
  VideoBreakdownResult,
  VideoScriptGenerationRequest,
  VideoScriptGenerationResult,
  VideoStoryboardShot,
} from '../../shared/types';
import { GenerationLogStore } from './generationLogStore';
import { ModelConfigStore } from './modelConfigStore';
import { TextGenerationService, TextProviderBlockedError } from './textGenerationService';

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

interface VideoScriptModelOutput {
  title?: string;
  script?: string;
  storyboard?: Array<Partial<VideoStoryboardShot>>;
  videoPrompt?: string;
  publishCheck?: Array<{ level?: 'info' | 'warning' | 'risk'; message?: string }>;
}

interface VideoBreakdownProviderOutput {
  summary?: string;
  dimensions?: string[];
  segments?: Array<Partial<VideoBreakdownResult['segments'][number]>>;
  reusableFormula?: string[];
  risks?: Array<{ level?: 'info' | 'warning' | 'risk'; message?: string }>;
}

function compactText(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function citationPayload(input: { citations: Array<{ title: string; sectionType?: string; excerpt: string }> }): Array<Record<string, string>> {
  return input.citations.map((item, index) => ({
    index: String(index + 1),
    title: item.title,
    sectionType: item.sectionType ?? '',
    excerpt: item.excerpt.slice(0, 800),
  }));
}

function sanitizeProviderError(value: string): string {
  return value.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

function normalizeRiskLevel(value: unknown): 'info' | 'warning' | 'risk' {
  return value === 'info' || value === 'warning' || value === 'risk' ? value : 'warning';
}

function normalizeBreakdownOutput(value: VideoBreakdownProviderOutput, input: VideoBreakdownRequest, dimensions: string[]): Omit<VideoBreakdownResult, 'logId'> {
  const segments = (Array.isArray(value.segments) ? value.segments : []).map((segment, index) => ({
    timeRange: compactText(segment.timeRange, `${index * 3}s-${(index + 1) * 3}s`),
    hook: compactText(segment.hook, 'Provider 未返回钩子说明'),
    visual: compactText(segment.visual, 'Provider 未返回画面说明'),
    voiceover: compactText(segment.voiceover, 'Provider 未返回口播说明'),
    subtitle: compactText(segment.subtitle, ''),
    rhythm: compactText(segment.rhythm, 'Provider 未返回节奏说明'),
    reusablePoint: compactText(segment.reusablePoint, 'Provider 未返回可复用点'),
  })).filter((segment) => segment.hook || segment.visual || segment.voiceover || segment.reusablePoint);
  if (segments.length === 0) throw new Error('视频理解 Provider 未返回 segments，无法形成真实拆解结果。');

  const reusableFormula = (Array.isArray(value.reusableFormula) ? value.reusableFormula : [])
    .map((item) => compactText(item, ''))
    .filter(Boolean)
    .slice(0, 8);
  const risks = (Array.isArray(value.risks) ? value.risks : [])
    .map((item) => ({ level: normalizeRiskLevel(item.level), message: compactText(item.message, '需要人工复核。') }))
    .filter((item) => item.message)
    .slice(0, 8);

  return {
    summary: compactText(value.summary, `已通过真实视频理解 Provider 拆解 ${input.sourceType === 'file' ? '本地视频' : '视频链接'}。`),
    dimensions: Array.isArray(value.dimensions) && value.dimensions.length ? value.dimensions.map((item) => compactText(item, '')).filter(Boolean) : dimensions,
    segments,
    reusableFormula: reusableFormula.length ? reusableFormula : ['基于 Provider 返回的镜头片段提炼复用结构，请人工复核后用于新产品脚本。'],
    risks: risks.length ? risks : [{ level: 'warning', message: 'Provider 未返回风险检查，请人工复核素材授权、事实引用和合规表达。' }],
  };
}

async function postGenericVideoUnderstanding(input: {
  endpoint: string;
  apiKey: string;
  model: string;
  request: VideoBreakdownRequest;
  dimensions: string[];
}): Promise<VideoBreakdownProviderOutput> {
  const response = await fetch(input.endpoint, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${input.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      operation: 'analyze',
      model: input.model,
      source_type: input.request.sourceType,
      source: input.request.source,
      dimensions: input.dimensions,
      prompt_pack_id: input.request.promptPackId,
      selected_skill_slugs: input.request.selectedSkillSlugs,
      citations: citationPayload(input.request),
      requirements: [
        '返回真实视频拆解结果，不要用模板补齐未分析到的画面。',
        'segments 至少包含 timeRange、hook、visual、voiceover、subtitle、rhythm、reusablePoint。',
        'risks 需要指出素材授权、事实引用、合规表达或复刻相似度风险。',
      ],
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`视频理解 Provider 返回 ${response.status}：${sanitizeProviderError(text).slice(0, 1000)}`);
  }
  return text.trim() ? JSON.parse(text) as VideoBreakdownProviderOutput : {};
}

const VIDEO_SCRIPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'script', 'storyboard', 'videoPrompt', 'publishCheck'],
  properties: {
    title: { type: 'string' },
    script: { type: 'string' },
    storyboard: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['shot', 'duration', 'visual', 'voiceover', 'subtitle', 'rhythm'],
        properties: {
          shot: { type: 'number' },
          duration: { type: 'string' },
          visual: { type: 'string' },
          voiceover: { type: 'string' },
          subtitle: { type: 'string' },
          rhythm: { type: 'string' },
        },
      },
    },
    videoPrompt: { type: 'string' },
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

export class VideoWorkflowService {
  constructor(
    private readonly logs: GenerationLogStore,
    private readonly text: TextGenerationService,
    private readonly modelConfig?: ModelConfigStore,
  ) {}

  async analyze(input: VideoBreakdownRequest): Promise<VideoBreakdownResult> {
    const startedAt = Date.now();
    const dimensions = input.dimensions.length ? input.dimensions : DEFAULT_DIMENSIONS;
    const config = await this.modelConfig?.readView();
    const apiKey = await this.modelConfig?.getVideoApiKey() || process.env.CONTENT_STUDIO_VIDEO_API_KEY || process.env.VIDEO_API_KEY;
    const endpoint = (process.env.CONTENT_STUDIO_VIDEO_UNDERSTANDING_ENDPOINT || process.env.CONTENT_STUDIO_VIDEO_ENDPOINT || config?.videoApiEndpoint || '').trim();

    if (config?.videoProvider === 'generic-http' && apiKey && endpoint) {
      try {
        const output = await postGenericVideoUnderstanding({
          endpoint,
          apiKey,
          model: config.videoModel,
          request: input,
          dimensions,
        });
        const result = normalizeBreakdownOutput(output, input, dimensions);
        const log = await this.logs.append({
          workspacePath: input.workspacePath,
          kind: 'video-breakdown',
          status: 'succeeded',
          title: '视频拆解结果',
          summary: result.summary,
          model: config.videoModel,
          promptPackId: input.promptPackId,
          citations: input.citations,
          input: { ...input, dimensions },
          output: result,
          durationMs: Date.now() - startedAt,
        });
        return { logId: log.id, ...result };
      } catch (error) {
        const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
        await this.logs.append({
          workspacePath: input.workspacePath,
          kind: 'video-breakdown',
          status: 'failed',
          title: '视频拆解失败',
          summary: '真实视频理解 Provider 调用失败，未使用模板伪造拆解结果。',
          model: config.videoModel,
          promptPackId: input.promptPackId,
          citations: input.citations,
          input: { ...input, dimensions },
          error: message,
          durationMs: Date.now() - startedAt,
        });
        throw new Error(message);
      }
    }

    const message = '真实视频理解模型未配置：当前不会用模板伪造拆解结果。请先接入支持视频帧/转写分析的 provider，或人工提供参考视频结构后再生成脚本。';
    await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'video-breakdown',
      status: 'blocked',
      title: '视频拆解未完成',
      summary: message,
      model: input.params.textModel,
      promptPackId: input.promptPackId,
      citations: input.citations,
      input: { ...input, dimensions },
      error: 'VIDEO_UNDERSTANDING_PROVIDER_NOT_CONFIGURED',
      durationMs: Date.now() - startedAt,
    });
    throw new Error(message);
  }

  async generateScript(input: VideoScriptGenerationRequest): Promise<VideoScriptGenerationResult> {
    const startedAt = Date.now();
    const shotCount = Math.min(Math.max(input.shotCount || 4, 3), 12);
    try {
      const { value, model } = await this.text.generateJson<VideoScriptModelOutput>({
        workspacePath: input.workspacePath,
        model: input.params.textModel,
        maxTurns: 3,
        systemPrompt: '你是短视频脚本导演。你只能基于用户提供的产品信息、知识引用和素材说明生成新产品脚本，不要声称已经看过未解析的视频画面。',
        schema: VIDEO_SCRIPT_SCHEMA,
        prompt: JSON.stringify({
          task: 'generate_video_script',
          productName: input.productName,
          sceneBackground: input.sceneBackground,
          subtitleMode: input.subtitleMode,
          voiceStyle: input.voiceStyle,
          customRequirement: input.customRequirement ?? '',
          ratio: input.ratio,
          shotCount,
          durationSeconds: input.durationSeconds,
          breakdownLogId: input.breakdownLogId ?? '',
          promptPackId: input.promptPackId ?? '',
          sceneCardIds: input.sceneCardIds ?? [],
          assetRefs: input.assetRefs,
          selectedSkillSlugs: input.selectedSkillSlugs,
          citations: citationPayload(input),
          requirements: [
            '输出可直接用于图生视频或文生视频的分镜脚本。',
            '每个镜头都要有画面、口播、字幕和节奏。',
            '不要编造知识库外的功效和背书。',
            '如果没有真实视频拆解，明确按知识库和用户输入生成，不要伪装复刻原视频。',
          ],
        }, null, 2),
      });

      const storyboard = (Array.isArray(value.storyboard) ? value.storyboard : []).slice(0, shotCount).map((item, index) => ({
        shot: Number(item.shot || index + 1),
        duration: compactText(item.duration, `${Math.max(2, Math.round(input.durationSeconds / shotCount))}s`),
        visual: compactText(item.visual, `${input.sceneBackground || '真实使用场景'}中展示产品和使用动作。`),
        voiceover: compactText(item.voiceover, '把卖点放回真实场景里讲，用事实而不是夸张承诺说服用户。'),
        subtitle: compactText(item.subtitle, input.subtitleMode === 'no-subtitle' ? '' : '事实源驱动，不夸大承诺'),
        rhythm: compactText(item.rhythm, index === 0 ? '快节奏钩子' : '中速解释'),
      }));
      if (storyboard.length === 0) throw new Error('文字模型没有返回分镜脚本');
      const title = compactText(value.title, `${input.productName || '新产品'}脚本`);
      const script = compactText(value.script, storyboard.map((item) => `镜头 ${item.shot}（${item.duration}）\n画面：${item.visual}\n口播：${item.voiceover}\n字幕：${item.subtitle || '无字幕'}\n节奏：${item.rhythm}`).join('\n\n'));
      const videoPrompt = compactText(value.videoPrompt, `比例 ${input.ratio}，总时长 ${input.durationSeconds}s，${input.voiceStyle || '自然可信'}口吻。\n${script}`);
      const publishCheck = (Array.isArray(value.publishCheck) ? value.publishCheck : [])
        .map((item) => ({ level: item.level ?? 'warning', message: compactText(item.message, '需要人工复核。') }))
        .filter((item) => item.message)
        .slice(0, 8);
      const result: Omit<VideoScriptGenerationResult, 'logId'> = {
        title,
        script,
        storyboard,
        videoPrompt,
        publishCheck: publishCheck.length ? publishCheck : [{ level: 'warning', message: '模型未返回发布检查，请人工复核知识引用和合规表达。' }],
      };
      const log = await this.logs.append({
        workspacePath: input.workspacePath,
        kind: 'video-script',
        status: 'succeeded',
        title,
        summary: `Claude 生成 ${storyboard.length} 镜头、${input.durationSeconds}s 的视频脚本`,
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
        kind: 'video-script',
        status,
        title: `${input.productName || '新产品'}脚本生成未完成`,
        summary: status === 'blocked' ? '文字模型未配置，未生成本地模板。' : '文字模型调用失败，未生成视频脚本。',
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
