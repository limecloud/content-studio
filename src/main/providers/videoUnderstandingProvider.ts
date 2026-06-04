import { readFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type {
  VideoBreakdownHook,
  VideoBreakdownNarrative,
  VideoBreakdownPacing,
  VideoBreakdownResourceFramework,
  VideoBreakdownResult,
  VideoBreakdownScene,
  VideoBreakdownTimelineEvent,
  VideoBreakdownTranscriptSegment,
  VideoBreakdownViralScores,
} from '../../shared/types';
import { readJsonOrText, resolveAuthorizationHeader, resolveOpenAIChatEndpoint, sanitizeProviderError } from './multimodalProviderUtils';

const HOOK_TYPES = [
  'pain_point_question',
  'bold_counter_statement',
  'proof_first',
  'fear_data',
  'challenge',
  'authority',
] as const;

const NARRATIVE_FRAMEWORKS = ['PSP', 'AIDA', 'three_act', 'testimonial', 'tutorial'] as const;

const EMOTION_LABELS = [
  'curiosity',
  'anxiety',
  'fear',
  'surprise',
  'trust',
  'desire',
  'satisfaction',
  'urgency',
] as const;

const SHOT_TYPES = [
  'close_up',
  'medium',
  'wide',
  'product_demo',
  'comparison',
  'text_overlay',
  'transition',
  'talking_head',
] as const;

type HookType = typeof HOOK_TYPES[number];
type NarrativeFramework = typeof NARRATIVE_FRAMEWORKS[number];
type EmotionLabel = typeof EMOTION_LABELS[number];
type ShotType = typeof SHOT_TYPES[number];

interface VideoUnderstandingConfig {
  endpoint: string;
  apiKey: string;
  model: string;
  classificationModel: string;
}

interface GeminiScene {
  timestampSec: number;
  startSec: number;
  endSec: number;
  shotType: string;
  character: string;
  characterAction: string;
  scene: string;
  cameraMovement: string;
  description: string;
  objects: string[];
  voiceover: string;
}

interface GeminiResourceFramework {
  characters: { id: string; voiceTraits: string; threeViewPrompt: string }[];
  scenes: { id: string; environment: string; lighting: string }[];
}

interface GPTRawOutput {
  contentTitle?: string;
  hookType?: { value?: string; confidence?: number; reasoning?: string };
  hookElements?: Array<{ name?: string; description?: string; timestampRange?: string }>;
  emotionCurve?: Array<{ timestampSec?: number; emotion?: string; intensity?: number }>;
  narrativeFramework?: { value?: string; confidence?: number; reasoning?: string };
  narrativeStages?: Array<{ name?: string; description?: string; timeRange?: string; emotionShift?: string }>;
  pacing?: { avgCutsPerSecond?: number; avgShotDurationSec?: number; wordsPerMinute?: number };
  timeline?: Array<{ timestampSec?: number; label?: string; emotionLabel?: string; intensity?: number }>;
  viralScores?: VideoBreakdownViralScores;
}

interface ConfidenceResult {
  hookScore: number;
  narrativeScore: number;
  overall: number;
  details: string[];
  warnings: string[];
}

export interface NativeVideoBreakdownOutput extends Omit<VideoBreakdownResult, 'logId' | 'dimensions'> {
  dimensions?: string[];
}

const ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  properties: {
    contentTitle: { type: 'string' },
    hookType: {
      type: 'object',
      properties: {
        value: { type: 'string', enum: [...HOOK_TYPES] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reasoning: { type: 'string' },
      },
      required: ['value', 'confidence', 'reasoning'],
    },
    hookElements: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          timestampRange: { type: 'string' },
        },
        required: ['name', 'description', 'timestampRange'],
      },
    },
    emotionCurve: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestampSec: { type: 'number' },
          emotion: { type: 'string', enum: [...EMOTION_LABELS] },
          intensity: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['timestampSec', 'emotion', 'intensity'],
      },
    },
    narrativeFramework: {
      type: 'object',
      properties: {
        value: { type: 'string', enum: [...NARRATIVE_FRAMEWORKS] },
        confidence: { type: 'number', minimum: 0, maximum: 1 },
        reasoning: { type: 'string' },
      },
      required: ['value', 'confidence', 'reasoning'],
    },
    narrativeStages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          timeRange: { type: 'string' },
          emotionShift: { type: 'string' },
        },
        required: ['name', 'description', 'timeRange'],
      },
    },
    pacing: {
      type: 'object',
      properties: {
        avgCutsPerSecond: { type: 'number' },
        avgShotDurationSec: { type: 'number' },
        wordsPerMinute: { type: 'number' },
      },
    },
    timeline: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          timestampSec: { type: 'number' },
          label: { type: 'string' },
          emotionLabel: { type: 'string', enum: [...EMOTION_LABELS] },
          intensity: { type: 'number', minimum: 0, maximum: 10 },
        },
        required: ['timestampSec', 'label', 'emotionLabel', 'intensity'],
      },
    },
    viralScores: {
      type: 'object',
      properties: {
        hookStrength: scoreSchema(),
        narrativeTension: scoreSchema(),
        pacingQuality: scoreSchema(),
        emotionDesign: scoreSchema(),
        ctaEffectiveness: scoreSchema(),
      },
    },
  },
};

function scoreSchema() {
  return {
    type: 'object',
    properties: {
      score: { type: 'number', minimum: 0, maximum: 10 },
      reasoning: { type: 'string' },
    },
    required: ['score', 'reasoning'],
  };
}

function buildGeminiVisualPrompt(videoDurationSec?: number): string {
  const durationHint = videoDurationSec && videoDurationSec > 0
    ? `此视频总时长为 **${videoDurationSec} 秒**。最后一个镜头的 endSec 应接近 ${videoDurationSec}。`
    : '请覆盖视频全部时长，不要遗漏。';
  const minShots = videoDurationSec && videoDurationSec > 0
    ? Math.max(5, Math.ceil(videoDurationSec / 6))
    : 10;

  return `你是一位专业的短视频分镜分析师 + AI 生图提示词专家。

所有输出内容必须使用中文。

分析视频，输出一个 JSON 对象，包含 characters、scenes、shots 三部分：

1. characters：识别视频中的独立角色。一个人就是一个角色，不要合并。每个角色要输出 voiceTraits 和 threeViewPrompt。
2. scenes：识别全部拍摄场景/环境，包含 environment 和 lighting。
3. shots：按视频实际镜头切换点逐个拆解，不要按固定时间间隔切分。镜头切换依据包括场景变化、机位变化、转场、主体变化、同场景角度变化。

约束：
- 前一个镜头的 endSec 应等于下一个镜头的 startSec。
- ${durationHint}
- shotType 只能从以下选择：${SHOT_TYPES.join(', ')}
- voiceover 忠实保留原始语音和语气词；没有口播时返回空字符串。
- 每个镜头时长不得超过 8 秒；如果超过，说明遗漏了镜头切换，需要拆分。
- 整个视频应至少拆出 ${minShots} 个镜头。
- 视频后半段必须和前半段一样仔细，不允许偷懒合并。

输出格式：
{
  "characters": [
    {
      "id": "宝妈",
      "voiceTraits": "亲切女声",
      "threeViewPrompt": "照片级写实角色三视图提示词"
    }
  ],
  "scenes": [
    {
      "id": "厨房",
      "environment": "现代厨房整体空间，台面、灶台、水池和生活物件",
      "lighting": "暖色柔光，自然窗光"
    }
  ],
  "shots": [
    {
      "startSec": 0,
      "endSec": 3,
      "shotType": "close_up",
      "characterId": "宝妈",
      "characterAction": "手指台面油污，表情疑惑",
      "sceneId": "厨房",
      "cameraMovement": "固定机位",
      "description": "厨房台面特写，宝妈手指油污处，面露疑惑",
      "objects": ["厨房台面", "油污", "手指"],
      "voiceover": "你家厨房的台面真的干净吗？"
    }
  ]
}

请严格只返回 JSON 对象。`;
}

const GPT_CLASSIFICATION_PROMPT = `你是一位专业的电商短视频结构分析师，专注于日化、家清、洗护、个人护理、衣物清洁、厨房清洁、家居清洁、清洁工具、除螨除菌。

你的任务是基于已经预处理好的视觉场景描述和语音转写文本，对视频进行结构化分类分析。

防幻觉规则：
1. hookType 只能是：${HOOK_TYPES.join(' | ')}
2. narrativeFramework 只能是：${NARRATIVE_FRAMEWORKS.join(' | ')}
3. emotionCurve / timeline 的情绪只能是：${EMOTION_LABELS.join(' | ')}
4. 必须给出 confidence 置信度和 reasoning 判断依据，reasoning 要引用实际转写文本或场景描述。
5. 如果数据不足，置信度设为 0.3 以下，reasoning 写明数据不足，不要编造。
6. emotionCurve 必须覆盖完整视频，至少每 10 秒一个数据点。
7. contentTitle 必须是 10-25 字中文标题，体现具体产品/场景和策略。
8. viralScores 必须输出 hookStrength、narrativeTension、pacingQuality、emotionDesign、ctaEffectiveness 五维 0-10 分和理由。

五维评分权重：钩子 30%，叙事 25%，节奏 15%，情绪 15%，CTA 15%。

输出 JSON Schema：
${JSON.stringify(ANALYSIS_JSON_SCHEMA, null, 2)}

严格只返回 JSON 对象，不要解释。`;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function textValue(value: unknown, fallback = ''): string {
  return String(value ?? '').trim() || fallback;
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  const text = typeof value === 'string' ? value.trim() : '';
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const source = fenced?.[1] ?? text;
  const firstObject = source.indexOf('{');
  const lastObject = source.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) {
    return JSON.parse(source.slice(firstObject, lastObject + 1)) as Record<string, unknown>;
  }
  return JSON.parse(source) as Record<string, unknown>;
}

function collectProviderText(payload: unknown): string {
  const texts: string[] = [];
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === 'string') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value !== 'object') return;
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') texts.push(record.text);
    if (typeof record.content === 'string') texts.push(record.content);
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return Array.from(new Set(texts)).join('\n');
}

function validateEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

function videoMimeType(filePath: string): string {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.mov' || ext === '.qt') return 'video/quicktime';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.m4v') return 'video/x-m4v';
  return 'video/mp4';
}

function maxOutputTokens(): number {
  const configured = Number(process.env.CONTENT_STUDIO_VIDEO_MAX_TOKENS ?? process.env.LLM_MAX_TOKENS);
  const value = Number.isFinite(configured) && configured > 0 ? configured : 16384;
  return Math.round(clamp(value, 256, 32768));
}

function formatSeconds(value: number): string {
  const safe = Math.max(0, Math.round(value));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseTimeRangeEnd(value: string | undefined): number {
  if (!value) return 0;
  const parts = value.split('-');
  const endPart = (parts[1] || parts[0]).trim();
  const match = /(\d+):(\d+)/.exec(endPart);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

async function readVideoSource(input: {
  sourceType: 'file' | 'url';
  source: string;
}): Promise<{ mimeType: string; base64: string; fileName: string }> {
  if (input.sourceType !== 'file') {
    throw new Error('原生视频拆解当前只处理本地上传视频；平台链接只作为来源记录，不会自动下载。');
  }
  const payload = await readFile(input.source);
  return {
    mimeType: videoMimeType(input.source),
    base64: payload.toString('base64'),
    fileName: basename(input.source),
  };
}

async function postVisualAnalysis(input: {
  config: VideoUnderstandingConfig;
  base64: string;
  mimeType: string;
  durationSec?: number;
}): Promise<{ scenes: GeminiScene[]; resourceFramework: GeminiResourceFramework }> {
  const endpoint = resolveOpenAIChatEndpoint(input.config.endpoint);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: resolveAuthorizationHeader(input.config.apiKey, endpoint),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.config.model,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: { url: `data:${input.mimeType};base64,${input.base64}` },
          },
          {
            type: 'text',
            text: buildGeminiVisualPrompt(input.durationSec),
          },
        ],
      }],
      temperature: 0,
      max_tokens: maxOutputTokens(),
      response_format: { type: 'json_object' },
    }),
  });
  const payload = await readJsonOrText(response);
  if (!response.ok) {
    throw new Error(`视频视觉拆解服务返回 ${response.status}：${sanitizeProviderError(JSON.stringify(payload)).slice(0, 1000)}`);
  }
  const parsed = parseJsonObject(collectProviderText(payload) || payload);
  const rawShots = Array.isArray(parsed) ? parsed : arrayValue(parsed.shots);
  const resourceFramework = {
    characters: arrayValue(parsed.characters).map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: textValue(record.id),
        voiceTraits: textValue(record.voiceTraits),
        threeViewPrompt: textValue(record.threeViewPrompt),
      };
    }).filter((item) => item.id),
    scenes: arrayValue(parsed.scenes).map((item) => {
      const record = item as Record<string, unknown>;
      return {
        id: textValue(record.id),
        environment: textValue(record.environment),
        lighting: textValue(record.lighting),
      };
    }).filter((item) => item.id),
  };
  const scenes = rawShots.map((item, index) => {
    const record = item as Record<string, unknown>;
    const startSec = numberValue(record.startSec ?? record.timestampSec, index * 3);
    return {
      timestampSec: startSec,
      startSec,
      endSec: numberValue(record.endSec, startSec + 3),
      shotType: validateEnum(record.shotType, SHOT_TYPES, 'medium'),
      character: textValue(record.characterId ?? record.character),
      characterAction: textValue(record.characterAction),
      scene: textValue(record.sceneId ?? record.scene),
      cameraMovement: textValue(record.cameraMovement),
      description: textValue(record.description),
      objects: arrayValue(record.objects).map((value) => textValue(value)).filter(Boolean),
      voiceover: textValue(record.voiceover),
    };
  }).filter((item) => item.description || item.voiceover || item.objects.length);
  if (!scenes.length) throw new Error('视频视觉拆解服务未返回 shots，无法形成真实拆解结果。');
  return { scenes, resourceFramework };
}

async function postClassification(input: {
  config: VideoUnderstandingConfig;
  scenes: GeminiScene[];
  transcript: string;
}): Promise<GPTRawOutput> {
  const endpoint = resolveOpenAIChatEndpoint(input.config.endpoint);
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      authorization: resolveAuthorizationHeader(input.config.apiKey, endpoint),
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: input.config.classificationModel,
      temperature: 0,
      max_tokens: maxOutputTokens(),
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: GPT_CLASSIFICATION_PROMPT },
        {
          role: 'user',
          content: [
            '## 视觉场景数据',
            JSON.stringify(input.scenes, null, 2),
            '',
            '## 语音转写文本',
            input.transcript || '（暂无转写文本，请完全基于视觉场景数据进行分析。不要使用示例内容。）',
            '',
            '请基于以上实际数据进行结构化分析，严格按照要求的 JSON 格式输出。',
          ].join('\n'),
        },
      ],
    }),
  });
  const payload = await readJsonOrText(response);
  if (!response.ok) {
    throw new Error(`视频结构分类服务返回 ${response.status}：${sanitizeProviderError(JSON.stringify(payload)).slice(0, 1000)}`);
  }
  return parseJsonObject(collectProviderText(payload) || payload) as GPTRawOutput;
}

function transcriptFromScenes(scenes: GeminiScene[], durationSec?: number): {
  transcript: string;
  transcriptSegments: VideoBreakdownTranscriptSegment[];
} {
  const sortedScenes = [...scenes].sort((a, b) => a.timestampSec - b.timestampSec);
  const transcriptSegments = sortedScenes
    .filter((scene) => scene.voiceover.trim())
    .map((scene, index) => {
      const nextScene = sortedScenes.find((candidate) => candidate.timestampSec > scene.timestampSec);
      return {
        startSec: scene.timestampSec,
        endSec: Math.round(nextScene?.timestampSec ?? durationSec ?? scene.endSec ?? scene.timestampSec + 5),
        text: scene.voiceover,
      };
    });
  return {
    transcript: transcriptSegments.map((segment) => segment.text).join(''),
    transcriptSegments,
  };
}

function computeConfidence(gptResult: GPTRawOutput, scenes: GeminiScene[], videoDuration?: number): ConfidenceResult {
  const details: string[] = [];
  const warnings: string[] = [];
  let enumScore = 0;
  let enumChecks = 0;
  const hookValid = HOOK_TYPES.includes(gptResult.hookType?.value as HookType);
  enumChecks += 1;
  if (hookValid) enumScore += 1;
  else warnings.push(`Hook 类型 "${gptResult.hookType?.value || '未返回'}" 不在预定义列表中，已回退。`);

  const narrativeValid = NARRATIVE_FRAMEWORKS.includes(gptResult.narrativeFramework?.value as NarrativeFramework);
  enumChecks += 1;
  if (narrativeValid) enumScore += 1;
  else warnings.push(`叙事框架 "${gptResult.narrativeFramework?.value || '未返回'}" 不在预定义列表中，已回退。`);

  const emotions = (gptResult.emotionCurve ?? []).map((item) => item.emotion);
  enumChecks += emotions.length;
  enumScore += emotions.filter((emotion) => EMOTION_LABELS.includes(emotion as EmotionLabel)).length;
  const enumRate = enumChecks > 0 ? enumScore / enumChecks : 0;
  details.push(`枚举有效性 ${(enumRate * 100).toFixed(0)}%`);

  const completenessChecks = [
    (gptResult.hookElements ?? []).length >= 1,
    (gptResult.narrativeStages ?? []).length >= 2,
    (gptResult.emotionCurve ?? []).length >= 3,
    (gptResult.timeline ?? []).length >= 3,
    textValue(gptResult.hookType?.reasoning).length > 10,
  ];
  const completenessRate = completenessChecks.filter(Boolean).length / completenessChecks.length;
  details.push(`数据完整性 ${(completenessRate * 100).toFixed(0)}%`);

  let coverageRate = 0.5;
  if (videoDuration && videoDuration > 0) {
    const stageEnds = (gptResult.narrativeStages ?? []).map((item) => parseTimeRangeEnd(item.timeRange)).filter((item) => item > 0);
    const curveEnds = (gptResult.emotionCurve ?? []).map((item) => numberValue(item.timestampSec)).filter((item) => item > 0);
    const maxCovered = Math.max(0, ...stageEnds, ...curveEnds);
    coverageRate = clamp(maxCovered / videoDuration, 0, 1);
  }
  details.push(`时间覆盖度 ${(coverageRate * 100).toFixed(0)}%`);

  let consistencyScore = 1;
  const stageStarts = (gptResult.narrativeStages ?? []).map((item) => {
    const startPart = item.timeRange?.split('-')[0] ?? '';
    return parseTimeRangeEnd(startPart);
  });
  for (let i = 1; i < stageStarts.length; i += 1) {
    if (stageStarts[i] < stageStarts[i - 1] - 2) consistencyScore -= 0.2;
  }
  const curveTimes = (gptResult.emotionCurve ?? []).map((item) => numberValue(item.timestampSec));
  for (let i = 1; i < curveTimes.length; i += 1) {
    if (curveTimes[i] <= curveTimes[i - 1]) consistencyScore -= 0.15;
  }
  consistencyScore = clamp(consistencyScore, 0, 1);
  details.push(`内部一致性 ${(consistencyScore * 100).toFixed(0)}%`);

  const hookReasoning = textValue(gptResult.hookType?.reasoning);
  const narrativeReasoning = textValue(gptResult.narrativeFramework?.reasoning);
  const sceneKeywords = scenes.slice(0, 10).map((scene) => scene.description.slice(0, 8)).filter((keyword) => keyword.length > 3);
  let evidenceScore = 0;
  if (sceneKeywords.some((keyword) => hookReasoning.includes(keyword)) || /\d+[秒s]|[0-9]{2}:[0-9]{2}/.test(hookReasoning)) evidenceScore += 0.5;
  if (sceneKeywords.some((keyword) => narrativeReasoning.includes(keyword)) || /\d+[秒s]|[0-9]{2}:[0-9]{2}/.test(narrativeReasoning)) evidenceScore += 0.5;
  if (hookReasoning.length > 20) evidenceScore = Math.min(1, evidenceScore + 0.15);
  if (narrativeReasoning.length > 20) evidenceScore = Math.min(1, evidenceScore + 0.15);
  details.push(`证据质量 ${(evidenceScore * 100).toFixed(0)}%`);

  let structureScore = 1;
  if (gptResult.pacing) {
    const cuts = numberValue(gptResult.pacing.avgCutsPerSecond);
    const shotDuration = numberValue(gptResult.pacing.avgShotDurationSec);
    const wpm = numberValue(gptResult.pacing.wordsPerMinute);
    if (cuts < 0.1 || cuts > 10) structureScore -= 0.3;
    if (shotDuration < 0.1 || shotDuration > 30) structureScore -= 0.3;
    if (wpm < 50 || wpm > 500) structureScore -= 0.2;
  } else {
    structureScore = 0.3;
  }
  structureScore = clamp(structureScore, 0, 1);
  details.push(`结构合理性 ${(structureScore * 100).toFixed(0)}%`);

  const overall = enumRate * 0.25
    + completenessRate * 0.2
    + coverageRate * 0.2
    + consistencyScore * 0.15
    + evidenceScore * 0.1
    + structureScore * 0.1;
  const hookScore = hookValid
    ? Math.min(1, enumRate * 0.4 + completenessRate * 0.3 + evidenceScore * 0.3)
    : Math.min(0.5, completenessRate * 0.5 + evidenceScore * 0.5);
  const narrativeScore = narrativeValid
    ? Math.min(1, enumRate * 0.3 + coverageRate * 0.35 + consistencyScore * 0.35)
    : Math.min(0.5, coverageRate * 0.5 + consistencyScore * 0.5);
  return {
    hookScore: Number(hookScore.toFixed(2)),
    narrativeScore: Number(narrativeScore.toFixed(2)),
    overall: Number(overall.toFixed(2)),
    details,
    warnings,
  };
}

function resourceFrameworkWithCounts(
  framework: GeminiResourceFramework,
  scenes: GeminiScene[],
): VideoBreakdownResourceFramework {
  const characterCounts = new Map<string, number>();
  const sceneCounts = new Map<string, number>();
  const knownCharacters = framework.characters.map((item) => item.id.trim()).filter(Boolean);
  const knownScenes = framework.scenes.map((item) => item.id.trim()).filter(Boolean);
  for (const scene of scenes) {
    const allText = [scene.character, scene.characterAction, scene.description, scene.voiceover].filter(Boolean).join(' ');
    const characters = new Set(scene.character.split(/[,、，]/).map((item) => item.trim()).filter(Boolean));
    for (const name of knownCharacters) if (allText.includes(name)) characters.add(name);
    characters.forEach((name) => characterCounts.set(name, (characterCounts.get(name) ?? 0) + 1));

    const sceneNames = new Set(scene.scene.split(/[,、，]/).map((item) => item.trim()).filter(Boolean));
    for (const name of knownScenes) if (allText.includes(name)) sceneNames.add(name);
    sceneNames.forEach((name) => sceneCounts.set(name, (sceneCounts.get(name) ?? 0) + 1));
  }
  return {
    characters: framework.characters.map((item) => ({
      name: item.id,
      shotCount: characterCounts.get(item.id) ?? 0,
      voiceTraits: item.voiceTraits,
      threeViewPrompt: item.threeViewPrompt,
    })).sort((a, b) => b.shotCount - a.shotCount),
    scenes: framework.scenes.map((item) => ({
      name: item.id,
      shotCount: sceneCounts.get(item.id) ?? 0,
      environment: item.environment,
      lighting: item.lighting,
    })).sort((a, b) => b.shotCount - a.shotCount),
  };
}

function splitLongScenes(scenes: GeminiScene[], maxTs: number): GeminiScene[] {
  const output: GeminiScene[] = [];
  for (const scene of scenes.filter((item) => item.timestampSec <= maxTs).sort((a, b) => a.timestampSec - b.timestampSec)) {
    const duration = scene.endSec - scene.startSec;
    if (duration <= 8) {
      output.push(scene);
      continue;
    }
    const chunkCount = Math.ceil(duration / 5);
    const chunkLength = duration / chunkCount;
    for (let index = 0; index < chunkCount; index += 1) {
      const startSec = Math.round(scene.startSec + index * chunkLength);
      const endSec = Math.round(scene.startSec + (index + 1) * chunkLength);
      output.push({
        ...scene,
        timestampSec: startSec,
        startSec,
        endSec,
        description: index === 0 ? scene.description : `${scene.description}（续${index + 1}/${chunkCount}）`,
      });
    }
  }
  return output;
}

function rhythmFromScenes(scenes: GeminiScene[], durationSec?: number): NonNullable<VideoBreakdownPacing['rhythm']> {
  const timestamps = scenes.map((scene) => scene.timestampSec).sort((a, b) => a - b);
  const percentileCap = timestamps.length > 2 ? timestamps[Math.floor(timestamps.length * 0.95)] : timestamps[timestamps.length - 1] || 120;
  const maxTs = durationSec || percentileCap;
  return splitLongScenes(scenes, maxTs).map((scene) => ({
    timeRange: `${formatSeconds(scene.startSec)}-${formatSeconds(scene.endSec)}`,
    shotType: validateEnum(scene.shotType, SHOT_TYPES, 'medium'),
    intensity: 5,
    description: scene.description,
    voiceover: scene.voiceover,
    character: scene.character,
    characterAction: scene.characterAction,
    scene: scene.scene,
    cameraMovement: scene.cameraMovement,
  }));
}

function buildTimelineFromScenes(scenes: GeminiScene[], gptResult: GPTRawOutput): VideoBreakdownTimelineEvent[] {
  if (gptResult.timeline?.length) {
    return gptResult.timeline.map((item) => ({
      timestampSec: numberValue(item.timestampSec),
      label: textValue(item.label, '关键节点'),
      emotionLabel: validateEnum(item.emotionLabel, EMOTION_LABELS, 'curiosity'),
      intensity: clamp(numberValue(item.intensity, 5), 0, 10),
    }));
  }
  const sorted = [...scenes].sort((a, b) => a.timestampSec - b.timestampSec);
  const step = Math.max(1, Math.floor(sorted.length / 5));
  return sorted.filter((_, index) => index % step === 0).slice(0, 6).map((scene) => ({
    timestampSec: scene.timestampSec,
    label: scene.description.slice(0, 18) || scene.shotType,
    emotionLabel: 'curiosity',
    intensity: 5,
  }));
}

function normalizeViralScores(value: VideoBreakdownViralScores | undefined): VideoBreakdownViralScores | undefined {
  if (!value) return undefined;
  return {
    hookStrength: value.hookStrength ? { score: clamp(numberValue(value.hookStrength.score, 5), 0, 10), reasoning: textValue(value.hookStrength.reasoning) } : undefined,
    narrativeTension: value.narrativeTension ? { score: clamp(numberValue(value.narrativeTension.score, 5), 0, 10), reasoning: textValue(value.narrativeTension.reasoning) } : undefined,
    pacingQuality: value.pacingQuality ? { score: clamp(numberValue(value.pacingQuality.score, 5), 0, 10), reasoning: textValue(value.pacingQuality.reasoning) } : undefined,
    emotionDesign: value.emotionDesign ? { score: clamp(numberValue(value.emotionDesign.score, 5), 0, 10), reasoning: textValue(value.emotionDesign.reasoning) } : undefined,
    ctaEffectiveness: value.ctaEffectiveness ? { score: clamp(numberValue(value.ctaEffectiveness.score, 5), 0, 10), reasoning: textValue(value.ctaEffectiveness.reasoning) } : undefined,
  };
}

function richnessRate(input: {
  hook: VideoBreakdownHook;
  narrative: VideoBreakdownNarrative;
  transcript: string;
}): number {
  let score = 0;
  if (input.hook.hookType?.value) score += 0.25;
  score += Math.min(0.25, (input.narrative.stages.length / 3) * 0.25);
  const emotionSet = new Set(input.hook.emotionCurve.map((item) => item.emotion));
  score += Math.min(0.25, (emotionSet.size / 3) * 0.25);
  if (input.transcript.length > 20) score += 0.25;
  else if (input.transcript.length > 0) score += 0.12;
  return Number(clamp(score, 0, 1).toFixed(2));
}

function referenceScore(viralScores: VideoBreakdownViralScores | undefined, confidenceRate: number, richness: number): number {
  if (viralScores) {
    const weighted = (viralScores.hookStrength?.score ?? 5) * 0.3
      + (viralScores.narrativeTension?.score ?? 5) * 0.25
      + (viralScores.pacingQuality?.score ?? 5) * 0.15
      + (viralScores.emotionDesign?.score ?? 5) * 0.15
      + (viralScores.ctaEffectiveness?.score ?? 5) * 0.15;
    return Number(clamp(weighted, 0, 10).toFixed(1));
  }
  return Number(clamp((confidenceRate * 0.4 + richness * 0.6) * 10, 0, 10).toFixed(1));
}

function buildSegments(input: {
  hook: VideoBreakdownHook;
  pacing: VideoBreakdownPacing;
  scenes: GeminiScene[];
}): VideoBreakdownResult['segments'] {
  const hookElements = input.hook.elements;
  return input.pacing.rhythm.map((item, index) => ({
    timeRange: item.timeRange,
    hook: hookElements[index]?.name ?? (index === 0 ? '开头钩子' : '镜头承接'),
    visual: item.description,
    voiceover: item.voiceover ?? '',
    subtitle: item.voiceover ?? '',
    rhythm: `${item.shotType} / 强度 ${item.intensity}`,
    reusablePoint: hookElements[index]?.description || '复用该镜头的结构功能和节奏，不复刻原人物、品牌或画面。',
    shotType: item.shotType,
    character: item.character,
    characterAction: item.characterAction,
    scene: item.scene,
    cameraMovement: item.cameraMovement,
    intensity: item.intensity,
    objects: input.scenes[index]?.objects ?? [],
  }));
}

export async function analyzeVideoWithNativeProvider(input: {
  config: VideoUnderstandingConfig;
  sourceType: 'file' | 'url';
  source: string;
  dimensions: string[];
  durationSec?: number;
}): Promise<NativeVideoBreakdownOutput> {
  const video = await readVideoSource(input);
  const visual = await postVisualAnalysis({
    config: input.config,
    base64: video.base64,
    mimeType: video.mimeType,
    durationSec: input.durationSec,
  });
  const durationSec = input.durationSec
    || Math.max(...visual.scenes.map((scene) => scene.endSec), ...visual.scenes.map((scene) => scene.timestampSec), 0);
  const { transcript, transcriptSegments } = transcriptFromScenes(visual.scenes, durationSec);
  const classification = await postClassification({
    config: input.config,
    scenes: visual.scenes,
    transcript,
  });
  const confidence = computeConfidence(classification, visual.scenes, durationSec);
  const hook: VideoBreakdownHook = {
    hookType: {
      value: validateEnum(classification.hookType?.value, HOOK_TYPES, 'pain_point_question'),
      confidence: confidence.hookScore,
      reasoning: textValue(classification.hookType?.reasoning, '模型未返回 Hook 判断依据。'),
    },
    elements: (classification.hookElements ?? []).map((item) => ({
      name: textValue(item.name, 'Hook 要素'),
      description: textValue(item.description, '模型未返回 Hook 要素说明。'),
      timestampRange: textValue(item.timestampRange),
    })),
    emotionCurve: (classification.emotionCurve ?? []).map((item) => ({
      timestampSec: numberValue(item.timestampSec),
      emotion: validateEnum(item.emotion, EMOTION_LABELS, 'curiosity'),
      intensity: Math.round(clamp(numberValue(item.intensity), 0, 100)),
    })),
  };
  const narrative: VideoBreakdownNarrative = {
    framework: {
      value: validateEnum(classification.narrativeFramework?.value, NARRATIVE_FRAMEWORKS, 'PSP'),
      confidence: confidence.narrativeScore,
      reasoning: textValue(classification.narrativeFramework?.reasoning, '模型未返回叙事判断依据。'),
    },
    stages: (classification.narrativeStages ?? []).map((item) => ({
      name: textValue(item.name, '叙事阶段'),
      description: textValue(item.description, '模型未返回阶段说明。'),
      timeRange: textValue(item.timeRange),
      emotionShift: textValue(item.emotionShift),
    })),
  };
  const rhythm = rhythmFromScenes(visual.scenes, durationSec);
  const pacing: VideoBreakdownPacing = {
    avgCutsPerSecond: durationSec > 0 ? Number((visual.scenes.length / durationSec).toFixed(2)) : numberValue(classification.pacing?.avgCutsPerSecond),
    avgShotDurationSec: visual.scenes.length > 0 && durationSec > 0 ? Number((durationSec / visual.scenes.length).toFixed(1)) : numberValue(classification.pacing?.avgShotDurationSec),
    wordsPerMinute: transcript.length > 10 && durationSec > 0 ? Math.round(transcript.length / (durationSec / 60)) : numberValue(classification.pacing?.wordsPerMinute, 0),
    rhythm,
  };
  const viralScores = normalizeViralScores(classification.viralScores);
  const richness = richnessRate({ hook, narrative, transcript });
  const score = referenceScore(viralScores, confidence.overall, richness);
  const scenes: VideoBreakdownScene[] = visual.scenes.map((scene) => ({
    timestampSec: scene.timestampSec,
    startSec: scene.startSec,
    endSec: scene.endSec,
    shotType: validateEnum(scene.shotType, SHOT_TYPES, 'medium'),
    character: scene.character,
    characterAction: scene.characterAction,
    scene: scene.scene,
    cameraMovement: scene.cameraMovement,
    description: scene.description,
    objects: scene.objects,
    voiceover: scene.voiceover,
  }));
  const segments = buildSegments({ hook, pacing, scenes: visual.scenes });
  return {
    summary: `已完成 ${video.fileName} 的爆款结构拆解：${segments.length} 个镜头，参考指数 ${score.toFixed(1)}。`,
    dimensions: input.dimensions,
    contentTitle: textValue(classification.contentTitle, video.fileName.replace(/\.[^.]+$/, '')),
    platform: 'upload',
    durationSec,
    segments,
    transcript,
    transcriptSegments,
    scenes,
    hook,
    narrative,
    pacing,
    timeline: buildTimelineFromScenes(visual.scenes, classification),
    viralScores,
    resourceFramework: resourceFrameworkWithCounts(visual.resourceFramework, visual.scenes),
    overallConfidence: confidence.overall,
    confidenceRate: confidence.overall,
    richnessRate: richness,
    referenceScore: score,
    reusableFormula: [
      `${hook.hookType?.value ?? 'hook'} -> ${narrative.framework?.value ?? 'narrative'} -> 节奏镜头复用`,
      '复用原视频的结构、情绪曲线和镜头功能；替换为本方产品、场景和事实源。',
    ],
    risks: [
      { level: 'warning', message: '只允许复用结构和节奏，不得照搬原视频人物、品牌、口播或可识别画面。' },
      { level: transcript ? 'info' : 'warning', message: transcript ? '口播转写来自视觉模型返回的 voiceover 字段。' : '模型未返回口播转写，后续脚本需降低对原口播风格的复用强度。' },
    ],
    warnings: confidence.warnings,
  };
}
