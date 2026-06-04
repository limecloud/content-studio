import type {
  GenerationLogEntry,
  ModelConfigView,
  VideoBreakdownRequest,
  VideoBreakdownResult,
  VideoScriptEvaluationRequest,
  VideoScriptEvaluationResult,
  VideoScriptGenerationRequest,
  VideoScriptGenerationResult,
  VideoScriptShotRewriteRequest,
  VideoScriptShotRewriteResult,
  VideoStoryboardShot,
} from '../../shared/types';
import { analyzeVideoWithNativeProvider } from '../providers/videoUnderstandingProvider';
import { resolveAuthorizationHeader } from '../providers/multimodalProviderUtils';
import { VIDEO_ANALYSIS_DIMENSIONS } from '../../shared/videoDimensions';
import { GenerationLogStore, type CreateLogInput } from './generationLogStore';
import { ModelConfigStore } from './modelConfigStore';
import { TextGenerationService, TextProviderBlockedError } from './textGenerationService';

const DEFAULT_DIMENSIONS = [...VIDEO_ANALYSIS_DIMENSIONS];

interface VideoScriptModelOutput {
  title?: string;
  script?: string;
  storyboard?: Array<Partial<VideoStoryboardShot>>;
  rhythm?: Array<Partial<VideoStoryboardShot> & { description?: string }>;
  resourceFramework?: VideoBreakdownResult['resourceFramework'];
  videoPrompt?: string;
  publishCheck?: Array<{ level?: 'info' | 'warning' | 'risk'; message?: string }>;
}

interface VideoScriptEvaluationModelOutput {
  hookScore?: Partial<VideoScriptEvaluationResult['scores']['hookScore']>;
  structureScore?: Partial<VideoScriptEvaluationResult['scores']['structureScore']>;
  sellingPointScore?: Partial<VideoScriptEvaluationResult['scores']['sellingPointScore']>;
  voiceoverScore?: Partial<VideoScriptEvaluationResult['scores']['voiceoverScore']>;
  pacingScore?: Partial<VideoScriptEvaluationResult['scores']['pacingScore']>;
  suggestions?: unknown[];
}

interface VideoScriptShotRewriteModelOutput {
  timestamp?: string;
  timeRange?: string;
  duration?: string;
  visual?: string;
  voiceover?: string;
  overlay?: string;
  subtitle?: string;
  rhythm?: string;
  shotType?: string;
  character?: string;
  characterAction?: string;
  scene?: string;
  cameraMovement?: string;
  imagePrompt?: string;
  videoPrompt?: string;
  transitionHint?: string;
  voiceStyle?: string;
  reasoning?: string;
  publishCheck?: Array<{ level?: 'info' | 'warning' | 'risk'; message?: string }>;
}

interface ScriptBreakdownContext {
  logId: string;
  summary: string;
  contentTitle?: string;
  durationSec?: number;
  confidenceRate?: number;
  richnessRate?: number;
  referenceScore?: number;
  hook?: {
    hookType?: NonNullable<VideoBreakdownResult['hook']>['hookType'];
    elements: NonNullable<VideoBreakdownResult['hook']>['elements'];
    emotionCurve: NonNullable<VideoBreakdownResult['hook']>['emotionCurve'];
  };
  narrative?: {
    framework?: NonNullable<VideoBreakdownResult['narrative']>['framework'];
    stages: NonNullable<VideoBreakdownResult['narrative']>['stages'];
  };
  pacing?: {
    avgCutsPerSecond?: number;
    avgShotDurationSec?: number;
    wordsPerMinute?: number;
    rhythm: VideoBreakdownPacingRhythmItem[];
  };
  transcriptSegments: NonNullable<VideoBreakdownResult['transcriptSegments']>;
  reusableFormula: string[];
  segments: Array<{
    timeRange: string;
    hook: string;
    visual: string;
    voiceover: string;
    rhythm: string;
    reusablePoint: string;
    shotType?: string;
    character?: string;
    characterAction?: string;
    scene?: string;
    cameraMovement?: string;
  }>;
  resourceFramework?: VideoBreakdownResult['resourceFramework'];
  risks: VideoBreakdownResult['risks'];
  warnings: string[];
}

type VideoBreakdownPacingRhythmItem = NonNullable<VideoBreakdownResult['pacing']>['rhythm'][number];

interface VideoBreakdownProviderOutput {
  summary?: string;
  dimensions?: string[];
  segments?: Array<Partial<VideoBreakdownResult['segments'][number]>>;
  contentTitle?: string;
  platform?: string;
  durationSec?: number;
  transcript?: string;
  transcriptSegments?: VideoBreakdownResult['transcriptSegments'];
  scenes?: VideoBreakdownResult['scenes'];
  hook?: VideoBreakdownResult['hook'];
  narrative?: VideoBreakdownResult['narrative'];
  pacing?: VideoBreakdownResult['pacing'];
  timeline?: VideoBreakdownResult['timeline'];
  viralScores?: VideoBreakdownResult['viralScores'];
  resourceFramework?: VideoBreakdownResult['resourceFramework'];
  overallConfidence?: number;
  confidenceRate?: number;
  richnessRate?: number;
  referenceScore?: number;
  reusableFormula?: string[];
  risks?: Array<{ level?: 'info' | 'warning' | 'risk'; message?: string }>;
  warnings?: string[];
}

const VIRAL_SCORE_WEIGHTS = {
  hookStrength: 0.3,
  narrativeTension: 0.25,
  pacingQuality: 0.15,
  emotionDesign: 0.15,
  ctaEffectiveness: 0.15,
} as const;

const VIDEO_BREAKDOWN_REQUIREMENTS = [
  '你是一位专业短视频分镜分析师和电商短视频结构分析师。',
  '必须基于真实视频画面和口播返回结果，不要用模板或示例补齐未分析到的内容。',
  '按实际镜头切换拆解，不要按固定时间间隔切分；明显的场景、机位、主体、转场变化都要拆成独立镜头。',
  '每个镜头尽量不超过 8 秒；如果服务无法确定准确时长，需要在 warnings 中说明。',
  'voiceover 需要忠实保留原始口播语气；没有口播的镜头返回空字符串。',
  '输出 transcript / transcriptSegments 时，只能来自视频实际口播或服务真实转写。',
  '输出 scenes 时包含 startSec、endSec、shotType、character、characterAction、scene、cameraMovement、description、objects、voiceover。',
  '输出 hook、narrative、pacing、timeline、viralScores、resourceFramework，用于后续生成新产品脚本；不允许照搬示例。',
  'viralScores 按 hookStrength、narrativeTension、pacingQuality、emotionDesign、ctaEffectiveness 五维 0-10 分评价，并给 reasoning。',
  'segments 至少包含 timeRange、hook、visual、voiceover、subtitle、rhythm、reusablePoint。',
  'risks 必须指出素材授权、事实引用、合规表达、复刻相似度或可识别人物/品牌风险。',
  '所有内容默认使用中文，返回 JSON 对象。',
];

function numericValue(value: unknown): number | undefined {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatSeconds(value: number): string {
  const safe = Math.max(0, Math.round(value));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function parseTimeRangeEnd(value: string | undefined): number {
  if (!value) return 0;
  const endPart = value.includes('-') ? value.split('-').at(-1)?.trim() ?? value : value.trim();
  const match = /(\d+):(\d+)/.exec(endPart);
  if (!match) return 0;
  return Number(match[1]) * 60 + Number(match[2]);
}

function timeRangeFrom(start: unknown, end: unknown, index: number): string {
  const startSec = numericValue(start) ?? index * 3;
  const endSec = numericValue(end) ?? startSec + 3;
  return `${formatSeconds(startSec)}-${formatSeconds(endSec)}`;
}

function compactList(value: unknown, limit: number): string[] {
  return Array.isArray(value)
    ? value.map((item) => compactText(item, '')).filter(Boolean).slice(0, limit)
    : [];
}

function boundedRate(value: unknown): number | undefined {
  const rate = numericValue(value);
  return rate === undefined ? undefined : Number(clamp(rate, 0, 1).toFixed(2));
}

function boundedScore(value: unknown): number | undefined {
  const score = numericValue(value);
  return score === undefined ? undefined : Number(clamp(score, 0, 10).toFixed(1));
}

function breakdownArtifactRefs(input: VideoBreakdownRequest): string[] {
  return Array.from(new Set([input.source].filter((item) => item.trim().length > 0)));
}

function scriptArtifactRefs(input: VideoScriptGenerationRequest): string[] {
  return Array.from(new Set([
    input.breakdownLogId ? `generation-log:${input.breakdownLogId}` : '',
    ...input.assetRefs,
  ].filter((item) => item.trim().length > 0)));
}

function normalizeTranscriptSegments(value: VideoBreakdownProviderOutput): NonNullable<VideoBreakdownResult['transcriptSegments']> {
  const segments = Array.isArray(value.transcriptSegments) ? value.transcriptSegments : [];
  return segments
    .map((segment, index) => {
      const startSec = numericValue(segment.startSec) ?? index * 3;
      const endSec = numericValue(segment.endSec) ?? startSec + 3;
      return {
        startSec,
        endSec: Math.max(endSec, startSec),
        text: compactText(segment.text, ''),
      };
    })
    .filter((segment) => segment.text.length > 0)
    .slice(0, 80);
}

function normalizeScenes(value: VideoBreakdownProviderOutput): NonNullable<VideoBreakdownResult['scenes']> {
  const scenes = Array.isArray(value.scenes) ? value.scenes : [];
  return scenes
    .map((scene, index) => {
      const startSec = numericValue(scene.startSec) ?? numericValue(scene.timestampSec) ?? index * 3;
      const endSec = numericValue(scene.endSec);
      return {
        timestampSec: numericValue(scene.timestampSec) ?? startSec,
        startSec,
        endSec,
        shotType: compactText(scene.shotType, 'medium'),
        character: compactText(scene.character, ''),
        characterAction: compactText(scene.characterAction, ''),
        scene: compactText(scene.scene, ''),
        cameraMovement: compactText(scene.cameraMovement, ''),
        description: compactText(scene.description, '视频理解服务未返回画面描述'),
        objects: Array.isArray(scene.objects) ? scene.objects.map((item) => compactText(item, '')).filter(Boolean).slice(0, 12) : [],
        voiceover: compactText(scene.voiceover, ''),
      };
    })
    .filter((scene) => scene.description || scene.voiceover || scene.objects.length)
    .slice(0, 120);
}

function normalizeSegments(
  value: VideoBreakdownProviderOutput,
  scenes: NonNullable<VideoBreakdownResult['scenes']>,
): VideoBreakdownResult['segments'] {
  const directSegments = (Array.isArray(value.segments) ? value.segments : [])
    .map((segment, index) => ({
      timeRange: compactText(segment.timeRange, timeRangeFrom(segment.startSec, segment.endSec, index)),
      hook: compactText(segment.hook, '视频理解服务未返回钩子说明'),
      visual: compactText(segment.visual, '视频理解服务未返回画面说明'),
      voiceover: compactText(segment.voiceover, ''),
      subtitle: compactText(segment.subtitle, ''),
      rhythm: compactText(segment.rhythm, '视频理解服务未返回节奏说明'),
      reusablePoint: compactText(segment.reusablePoint, '视频理解服务未返回可复用点'),
      startSec: numericValue(segment.startSec),
      endSec: numericValue(segment.endSec),
      shotType: compactText(segment.shotType, ''),
      character: compactText(segment.character, ''),
      characterAction: compactText(segment.characterAction, ''),
      scene: compactText(segment.scene, ''),
      cameraMovement: compactText(segment.cameraMovement, ''),
      objects: Array.isArray(segment.objects) ? segment.objects.map((item) => compactText(item, '')).filter(Boolean).slice(0, 12) : undefined,
      intensity: numericValue(segment.intensity),
    }))
    .filter((segment) => segment.hook || segment.visual || segment.voiceover || segment.reusablePoint);
  if (directSegments.length > 0) return directSegments.slice(0, 80);

  const rhythm = Array.isArray(value.pacing?.rhythm) ? value.pacing.rhythm : [];
  const rhythmSegments = rhythm.map((item) => ({
    timeRange: compactText(item.timeRange, ''),
    hook: '镜头节奏片段',
    visual: compactText(item.description, '视频理解服务未返回画面说明'),
    voiceover: compactText(item.voiceover, ''),
    subtitle: '',
    rhythm: `${compactText(item.shotType, 'medium')} / 强度 ${numericValue(item.intensity) ?? 5}`,
    reusablePoint: compactText(item.description, '复用该镜头节奏和画面功能。'),
    shotType: compactText(item.shotType, ''),
    character: compactText(item.character, ''),
    characterAction: compactText(item.characterAction, ''),
    scene: compactText(item.scene, ''),
    cameraMovement: compactText(item.cameraMovement, ''),
    intensity: numericValue(item.intensity),
  })).filter((segment) => segment.timeRange || segment.visual || segment.voiceover);
  if (rhythmSegments.length > 0) return rhythmSegments.slice(0, 80);

  return scenes.map((scene, index) => ({
    timeRange: timeRangeFrom(scene.startSec ?? scene.timestampSec, scene.endSec, index),
    hook: index === 0 ? '开头镜头' : '承接镜头',
    visual: scene.description,
    voiceover: scene.voiceover ?? '',
    subtitle: '',
    rhythm: `${scene.shotType}${scene.cameraMovement ? ` / ${scene.cameraMovement}` : ''}`,
    reusablePoint: '复用镜头功能和节奏，不复刻原画面、人物或品牌元素。',
    startSec: scene.startSec ?? scene.timestampSec,
    endSec: scene.endSec,
    shotType: scene.shotType,
    character: scene.character,
    characterAction: scene.characterAction,
    scene: scene.scene,
    cameraMovement: scene.cameraMovement,
    objects: scene.objects,
  })).slice(0, 80);
}

function normalizeHook(value: VideoBreakdownProviderOutput): VideoBreakdownResult['hook'] | undefined {
  const hook = value.hook;
  if (!hook) return undefined;
  return {
    hookType: hook.hookType ? {
      value: compactText(hook.hookType.value, 'unknown'),
      confidence: boundedRate(hook.hookType.confidence) ?? 0,
      reasoning: compactText(hook.hookType.reasoning, ''),
    } : undefined,
    elements: (Array.isArray(hook.elements) ? hook.elements : [])
      .map((item) => ({
        name: compactText(item.name, ''),
        description: compactText(item.description, ''),
        timestampRange: compactText(item.timestampRange, ''),
      }))
      .filter((item) => item.name || item.description)
      .slice(0, 12),
    emotionCurve: (Array.isArray(hook.emotionCurve) ? hook.emotionCurve : [])
      .map((item) => ({
        timestampSec: numericValue(item.timestampSec) ?? 0,
        emotion: compactText(item.emotion, 'curiosity'),
        intensity: Math.round(clamp(numericValue(item.intensity) ?? 0, 0, 100)),
      }))
      .slice(0, 30),
  };
}

function normalizeNarrative(value: VideoBreakdownProviderOutput): VideoBreakdownResult['narrative'] | undefined {
  const narrative = value.narrative;
  if (!narrative) return undefined;
  return {
    framework: narrative.framework ? {
      value: compactText(narrative.framework.value, 'unknown'),
      confidence: boundedRate(narrative.framework.confidence) ?? 0,
      reasoning: compactText(narrative.framework.reasoning, ''),
    } : undefined,
    stages: (Array.isArray(narrative.stages) ? narrative.stages : [])
      .map((item) => ({
        name: compactText(item.name, ''),
        description: compactText(item.description, ''),
        timeRange: compactText(item.timeRange, ''),
        emotionShift: compactText(item.emotionShift, ''),
      }))
      .filter((item) => item.name || item.description)
      .slice(0, 12),
  };
}

function normalizePacing(value: VideoBreakdownProviderOutput, segments: VideoBreakdownResult['segments']): VideoBreakdownResult['pacing'] | undefined {
  if (!value.pacing && segments.length === 0) return undefined;
  return {
    avgCutsPerSecond: numericValue(value.pacing?.avgCutsPerSecond),
    avgShotDurationSec: numericValue(value.pacing?.avgShotDurationSec),
    wordsPerMinute: numericValue(value.pacing?.wordsPerMinute),
    rhythm: (Array.isArray(value.pacing?.rhythm) ? value.pacing?.rhythm : segments).map((item) => ({
      timeRange: compactText(item.timeRange, ''),
      shotType: compactText(item.shotType, 'medium'),
      intensity: Math.round(clamp(numericValue(item.intensity) ?? 5, 0, 10)),
      description: compactText('description' in item ? item.description : item.visual, ''),
      voiceover: compactText(item.voiceover, ''),
      character: compactText(item.character, ''),
      characterAction: compactText(item.characterAction, ''),
      scene: compactText(item.scene, ''),
      cameraMovement: compactText(item.cameraMovement, ''),
    })).filter((item) => item.timeRange || item.description).slice(0, 80),
  };
}

function normalizeTimeline(value: VideoBreakdownProviderOutput): VideoBreakdownResult['timeline'] | undefined {
  if (!Array.isArray(value.timeline)) return undefined;
  const timeline = value.timeline
    .map((item) => ({
      timestampSec: numericValue(item.timestampSec) ?? 0,
      label: compactText(item.label, ''),
      emotionLabel: compactText(item.emotionLabel, 'curiosity'),
      intensity: Math.round(clamp(numericValue(item.intensity) ?? 0, 0, 10)),
    }))
    .filter((item) => item.label)
    .slice(0, 40);
  return timeline.length ? timeline : undefined;
}

function normalizeViralScores(value: VideoBreakdownProviderOutput): VideoBreakdownResult['viralScores'] | undefined {
  const scores = value.viralScores;
  if (!scores) return undefined;
  return {
    hookStrength: scores.hookStrength ? { score: boundedScore(scores.hookStrength.score) ?? 0, reasoning: compactText(scores.hookStrength.reasoning, '') } : undefined,
    narrativeTension: scores.narrativeTension ? { score: boundedScore(scores.narrativeTension.score) ?? 0, reasoning: compactText(scores.narrativeTension.reasoning, '') } : undefined,
    pacingQuality: scores.pacingQuality ? { score: boundedScore(scores.pacingQuality.score) ?? 0, reasoning: compactText(scores.pacingQuality.reasoning, '') } : undefined,
    emotionDesign: scores.emotionDesign ? { score: boundedScore(scores.emotionDesign.score) ?? 0, reasoning: compactText(scores.emotionDesign.reasoning, '') } : undefined,
    ctaEffectiveness: scores.ctaEffectiveness ? { score: boundedScore(scores.ctaEffectiveness.score) ?? 0, reasoning: compactText(scores.ctaEffectiveness.reasoning, '') } : undefined,
  };
}

function normalizeResourceFramework(value: VideoBreakdownProviderOutput): VideoBreakdownResult['resourceFramework'] | undefined {
  const framework = value.resourceFramework;
  if (!framework) return undefined;
  const characters = (Array.isArray(framework.characters) ? framework.characters : [])
    .map((item) => ({
      name: compactText(item.name, ''),
      shotCount: Math.max(0, Math.round(numericValue(item.shotCount) ?? 0)),
      voiceTraits: compactText(item.voiceTraits, ''),
      threeViewPrompt: compactText(item.threeViewPrompt, ''),
    }))
    .filter((item) => item.name)
    .slice(0, 20);
  const scenes = (Array.isArray(framework.scenes) ? framework.scenes : [])
    .map((item) => ({
      name: compactText(item.name, ''),
      shotCount: Math.max(0, Math.round(numericValue(item.shotCount) ?? 0)),
      environment: compactText(item.environment, ''),
      lighting: compactText(item.lighting, ''),
    }))
    .filter((item) => item.name)
    .slice(0, 20);
  return characters.length || scenes.length ? { characters, scenes } : undefined;
}

function computeRichnessRate(input: {
  hook?: VideoBreakdownResult['hook'];
  narrative?: VideoBreakdownResult['narrative'];
  transcript: string;
}): number {
  let score = 0;
  if (input.hook?.hookType?.value) score += 0.25;
  score += Math.min(0.25, ((input.narrative?.stages.length ?? 0) / 3) * 0.25);
  const emotionSet = new Set(input.hook?.emotionCurve.map((item) => item.emotion).filter(Boolean) ?? []);
  score += Math.min(0.25, (emotionSet.size / 3) * 0.25);
  if (input.transcript.length > 20) score += 0.25;
  else if (input.transcript.length > 0) score += 0.12;
  return Number(clamp(score, 0, 1).toFixed(2));
}

function computeConfidenceRate(input: {
  segments: VideoBreakdownResult['segments'];
  scenes: NonNullable<VideoBreakdownResult['scenes']>;
  hook?: VideoBreakdownResult['hook'];
  narrative?: VideoBreakdownResult['narrative'];
  transcriptSegments: NonNullable<VideoBreakdownResult['transcriptSegments']>;
  risks: VideoBreakdownResult['risks'];
}): number {
  const checks = [
    input.segments.length > 0,
    input.scenes.length > 0,
    Boolean(input.hook?.hookType?.value || input.hook?.elements.length),
    Boolean(input.narrative?.framework?.value || input.narrative?.stages.length),
    input.transcriptSegments.length > 0,
    input.risks.length > 0,
  ];
  return Number((checks.filter(Boolean).length / checks.length).toFixed(2));
}

function computeReferenceScore(viralScores: VideoBreakdownResult['viralScores'] | undefined, confidenceRate: number, richnessRate: number): number {
  if (viralScores) {
    const weighted = Object.entries(VIRAL_SCORE_WEIGHTS).reduce((total, [key, weight]) => {
      const item = viralScores[key as keyof typeof VIRAL_SCORE_WEIGHTS];
      return total + ((item?.score ?? 5) * weight);
    }, 0);
    return Number(clamp(weighted, 0, 10).toFixed(1));
  }
  return Number(clamp((confidenceRate * 0.4 + richnessRate * 0.6) * 10, 0, 10).toFixed(1));
}

function compactText(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
}

function firstNonEmpty(...values: Array<string | undefined | null>): string {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) ?? '';
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
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .replace(/(authorization["']?\s*[:=]\s*["']?)[^"',}\s]+/gi, '$1***');
}

function textModelForVideoClassification(config: ModelConfigView | undefined, input: VideoBreakdownRequest): string {
  return process.env.CONTENT_STUDIO_VIDEO_CLASSIFICATION_MODEL
    || process.env.LLM_MODEL
    || (/^gpt-|^o\d|^deepseek|^qwen|^glm/i.test(input.params.textModel) ? input.params.textModel : '')
    || (/^gpt-|^o\d|^deepseek|^qwen|^glm/i.test(config?.textModel ?? '') ? config?.textModel : '')
    || 'gpt-4o';
}

function videoApiKeyFor(storedApiKey: string | undefined): string {
  return firstNonEmpty(
    storedApiKey,
    process.env.CONTENT_STUDIO_VIDEO_API_KEY,
    process.env.VIDEO_API_KEY,
    process.env.LLM_API_KEY,
  );
}

function videoEndpointFor(config: ModelConfigView | undefined): string {
  return firstNonEmpty(
    process.env.CONTENT_STUDIO_VIDEO_UNDERSTANDING_ENDPOINT,
    process.env.CONTENT_STUDIO_VIDEO_ENDPOINT,
    config?.videoApiEndpoint,
    process.env.LLM_BASE_URL,
  );
}

function visualModelForVideoUnderstanding(config: ModelConfigView | undefined): string {
  return firstNonEmpty(
    process.env.CONTENT_STUDIO_VIDEO_MODEL,
    process.env.VISUAL_MODEL,
    process.env.GEMINI_MODEL,
    config?.videoModel,
    'gemini-2.5-flash',
  );
}

function hasRuntimeVideoConfig(): boolean {
  return Boolean(firstNonEmpty(
    process.env.CONTENT_STUDIO_VIDEO_API_KEY,
    process.env.VIDEO_API_KEY,
    process.env.LLM_API_KEY,
    process.env.CONTENT_STUDIO_VIDEO_UNDERSTANDING_ENDPOINT,
    process.env.CONTENT_STUDIO_VIDEO_ENDPOINT,
    process.env.LLM_BASE_URL,
  ));
}

function videoProviderFor(config: ModelConfigView | undefined, apiKey: string, endpoint: string): ModelConfigView['videoProvider'] {
  if (config?.videoProvider === 'generic-http') return 'generic-http';
  if (config?.videoProvider === 'video-understanding-openai-compatible') return 'video-understanding-openai-compatible';
  if (apiKey && endpoint && hasRuntimeVideoConfig()) return 'video-understanding-openai-compatible';
  return 'disabled';
}

function normalizeRiskLevel(value: unknown): 'info' | 'warning' | 'risk' {
  return value === 'info' || value === 'warning' || value === 'risk' ? value : 'warning';
}

function normalizeBreakdownOutput(value: VideoBreakdownProviderOutput, input: VideoBreakdownRequest, dimensions: string[]): Omit<VideoBreakdownResult, 'logId'> {
  const transcriptSegments = normalizeTranscriptSegments(value);
  const scenes = normalizeScenes(value);
  const segments = normalizeSegments(value, scenes);
  if (segments.length === 0) throw new Error('视频理解服务未返回 segments，无法形成真实拆解结果。');

  const reusableFormula = (Array.isArray(value.reusableFormula) ? value.reusableFormula : [])
    .map((item) => compactText(item, ''))
    .filter(Boolean)
    .slice(0, 8);
  const risks = (Array.isArray(value.risks) ? value.risks : [])
    .map((item) => ({ level: normalizeRiskLevel(item.level), message: compactText(item.message, '需要人工复核。') }))
    .filter((item) => item.message)
    .slice(0, 8);
  const hook = normalizeHook(value);
  const narrative = normalizeNarrative(value);
  const pacing = normalizePacing(value, segments);
  const viralScores = normalizeViralScores(value);
  const transcript = compactText(value.transcript, transcriptSegments.map((segment) => segment.text).join(''));
  const confidenceRate = boundedRate(value.confidenceRate) ?? boundedRate(value.overallConfidence) ?? computeConfidenceRate({
    segments,
    scenes,
    hook,
    narrative,
    transcriptSegments,
    risks,
  });
  const richnessRate = boundedRate(value.richnessRate) ?? computeRichnessRate({ hook, narrative, transcript });
  const referenceScore = boundedScore(value.referenceScore) ?? computeReferenceScore(viralScores, confidenceRate, richnessRate);
  const warnings = compactList(value.warnings, 12);

  return {
    summary: compactText(value.summary, `已通过真实视频理解服务拆解 ${input.sourceType === 'file' ? '本地视频' : '视频链接'}。`),
    dimensions: Array.isArray(value.dimensions) && value.dimensions.length ? value.dimensions.map((item) => compactText(item, '')).filter(Boolean) : dimensions,
    segments,
    contentTitle: compactText(value.contentTitle, ''),
    platform: compactText(value.platform, input.sourceType),
    durationSec: numericValue(value.durationSec),
    transcript,
    transcriptSegments,
    scenes,
    hook,
    narrative,
    pacing,
    timeline: normalizeTimeline(value),
    viralScores,
    resourceFramework: normalizeResourceFramework(value),
    overallConfidence: boundedRate(value.overallConfidence) ?? confidenceRate,
    confidenceRate,
    richnessRate,
    referenceScore,
    reusableFormula: reusableFormula.length ? reusableFormula : ['基于视频理解服务返回的镜头片段提炼复用结构，请人工复核后用于新产品脚本。'],
    risks: risks.length ? risks : [{ level: 'warning', message: '视频理解服务未返回风险检查，请人工复核素材授权、事实引用和合规表达。' }],
    warnings,
  };
}

function logOutputAsBreakdown(log: GenerationLogEntry | null): (Omit<VideoBreakdownResult, 'logId'> & { logId: string }) | null {
  if (!log || log.kind !== 'video-breakdown' || log.status !== 'succeeded') return null;
  if (!log.output || typeof log.output !== 'object') return null;
  return { logId: log.id, ...(log.output as Omit<VideoBreakdownResult, 'logId'>) };
}

function summarizeBreakdownForScript(breakdown: (Omit<VideoBreakdownResult, 'logId'> & { logId: string }) | null): ScriptBreakdownContext | undefined {
  if (!breakdown) return undefined;
  const rhythm = breakdown.pacing?.rhythm.length
    ? breakdown.pacing.rhythm
    : breakdown.segments.map((segment) => ({
      timeRange: segment.timeRange,
      shotType: compactText(segment.shotType, 'medium'),
      intensity: Math.round(clamp(numericValue(segment.intensity) ?? 5, 0, 10)),
      description: compactText(segment.visual, ''),
      voiceover: compactText(segment.voiceover, ''),
      character: compactText(segment.character, ''),
      characterAction: compactText(segment.characterAction, ''),
      scene: compactText(segment.scene, ''),
      cameraMovement: compactText(segment.cameraMovement, ''),
    }));
  return {
    logId: breakdown.logId,
    summary: breakdown.summary,
    contentTitle: breakdown.contentTitle,
    durationSec: breakdown.durationSec,
    confidenceRate: breakdown.confidenceRate,
    richnessRate: breakdown.richnessRate,
    referenceScore: breakdown.referenceScore,
    hook: breakdown.hook ? {
      hookType: breakdown.hook.hookType,
      elements: breakdown.hook.elements.slice(0, 6),
      emotionCurve: breakdown.hook.emotionCurve.slice(0, 10),
    } : undefined,
    narrative: breakdown.narrative ? {
      framework: breakdown.narrative.framework,
      stages: breakdown.narrative.stages.slice(0, 8),
    } : undefined,
    pacing: breakdown.pacing ? {
      avgCutsPerSecond: breakdown.pacing.avgCutsPerSecond,
      avgShotDurationSec: breakdown.pacing.avgShotDurationSec,
      wordsPerMinute: breakdown.pacing.wordsPerMinute,
      rhythm,
    } : {
      rhythm,
    },
    transcriptSegments: breakdown.transcriptSegments ?? [],
    reusableFormula: breakdown.reusableFormula.slice(0, 8),
    segments: breakdown.segments.map((segment) => ({
      timeRange: segment.timeRange,
      hook: segment.hook,
      visual: segment.visual,
      voiceover: segment.voiceover,
      rhythm: segment.rhythm,
      reusablePoint: segment.reusablePoint,
      shotType: segment.shotType,
      character: segment.character,
      characterAction: segment.characterAction,
      scene: segment.scene,
      cameraMovement: segment.cameraMovement,
    })),
    resourceFramework: breakdown.resourceFramework,
    risks: breakdown.risks,
    warnings: breakdown.warnings ?? [],
  };
}

function breakdownUsedSummary(breakdown: ReturnType<typeof summarizeBreakdownForScript>): string {
  if (!breakdown) return '未关联真实视频拆解，仅基于知识库和用户输入生成。';
  const title = typeof breakdown.contentTitle === 'string' && breakdown.contentTitle ? breakdown.contentTitle : '参考视频拆解';
  const score = typeof breakdown.referenceScore === 'number' ? `，参考指数 ${breakdown.referenceScore.toFixed(1)}` : '';
  return `已关联 ${title}${score}，用于复用结构但不复刻原画面。`;
}

function normalizeScriptResourceFramework(
  value: VideoScriptModelOutput['resourceFramework'],
): VideoBreakdownResult['resourceFramework'] | undefined {
  if (!value) return undefined;
  const characters = (Array.isArray(value.characters) ? value.characters : [])
    .map((item) => ({
      name: compactText(item.name, ''),
      shotCount: Math.max(0, Math.round(numericValue(item.shotCount) ?? 0)),
      voiceTraits: compactText(item.voiceTraits, ''),
      threeViewPrompt: compactText(item.threeViewPrompt, ''),
    }))
    .filter((item) => item.name)
    .slice(0, 20);
  const scenes = (Array.isArray(value.scenes) ? value.scenes : [])
    .map((item) => ({
      name: compactText(item.name, ''),
      shotCount: Math.max(0, Math.round(numericValue(item.shotCount) ?? 0)),
      environment: compactText(item.environment, ''),
      lighting: compactText(item.lighting, ''),
      sceneImagePrompt: compactText(item.sceneImagePrompt, ''),
    }))
    .filter((item) => item.name)
    .slice(0, 20);
  return characters.length || scenes.length ? { characters, scenes } : undefined;
}

function fallbackShotDuration(input: VideoScriptGenerationRequest, shotCount: number): string {
  return `${Math.max(2, Math.round(input.durationSeconds / shotCount))}s`;
}

function timeRangeDurationSeconds(timeRange: string): number | undefined {
  const parts = timeRange.split('-');
  if (parts.length < 2) return undefined;
  const start = parseTimeRangeEnd(parts[0]);
  const end = parseTimeRangeEnd(parts[1]);
  if (end <= start) return undefined;
  return end - start;
}

function targetRhythmForScript(breakdown: ScriptBreakdownContext | undefined): VideoBreakdownPacingRhythmItem[] {
  return breakdown?.pacing?.rhythm ?? [];
}

function targetShotCountForScript(input: VideoScriptGenerationRequest, breakdown: ScriptBreakdownContext | undefined): number {
  const rhythmCount = targetRhythmForScript(breakdown).length;
  if (rhythmCount > 0) return Math.min(Math.max(rhythmCount, 1), 80);
  return Math.min(Math.max(input.shotCount || 4, 3), 12);
}

function targetDurationForScript(input: VideoScriptGenerationRequest, breakdown: ScriptBreakdownContext | undefined): number {
  const rhythm = targetRhythmForScript(breakdown);
  const lastEnd = rhythm.length ? parseTimeRangeEnd(rhythm[rhythm.length - 1]?.timeRange) : 0;
  const duration = breakdown?.durationSec ?? lastEnd ?? input.durationSeconds;
  return Math.min(300, Math.max(5, Math.round(duration || input.durationSeconds || 18)));
}

function enrichResourceFrameworkCounts(
  framework: VideoBreakdownResult['resourceFramework'] | undefined,
  storyboard: VideoStoryboardShot[],
): VideoBreakdownResult['resourceFramework'] | undefined {
  if (!framework) return undefined;
  const characterCounts = new Map<string, number>();
  const sceneCounts = new Map<string, number>();
  for (const shot of storyboard) {
    if (shot.character?.trim()) characterCounts.set(shot.character.trim(), (characterCounts.get(shot.character.trim()) ?? 0) + 1);
    if (shot.scene?.trim()) sceneCounts.set(shot.scene.trim(), (sceneCounts.get(shot.scene.trim()) ?? 0) + 1);
  }
  return {
    characters: framework.characters.map((character) => ({
      ...character,
      shotCount: characterCounts.get(character.name) ?? character.shotCount,
    })),
    scenes: framework.scenes.map((scene) => ({
      ...scene,
      shotCount: sceneCounts.get(scene.name) ?? scene.shotCount,
    })),
  };
}

function scriptContextForPrompt(input: VideoScriptGenerationRequest, breakdown: ScriptBreakdownContext | undefined): Record<string, unknown> {
  const targetShotCount = targetShotCountForScript(input, breakdown);
  const targetDurationSeconds = targetDurationForScript(input, breakdown);
  const rhythm = targetRhythmForScript(breakdown);
  return {
    targetShotCount,
    targetDurationSeconds,
    sourceBreakdown: breakdown ? {
      ...breakdown,
      pacing: breakdown.pacing ? {
        ...breakdown.pacing,
        rhythm,
      } : undefined,
    } : undefined,
    referenceRhythm: rhythm.map((item, index) => ({
      shot: index + 1,
      timeRange: item.timeRange,
      shotType: item.shotType,
      intensity: item.intensity,
      character: item.character,
      characterAction: item.characterAction,
      scene: item.scene,
      cameraMovement: item.cameraMovement,
      visualFunction: item.description,
      voiceover: item.voiceover ?? '',
    })),
    referenceResourceFramework: breakdown?.resourceFramework,
    exactMappingRequired: Boolean(breakdown && rhythm.length > 0),
  };
}

function normalizeStoryboard(
  value: VideoScriptModelOutput,
  input: VideoScriptGenerationRequest,
  shotCount: number,
  breakdown?: ScriptBreakdownContext,
): VideoStoryboardShot[] {
  const targetRhythm = targetRhythmForScript(breakdown);
  const raw = Array.isArray(value.storyboard) && value.storyboard.length
    ? value.storyboard
    : Array.isArray(value.rhythm)
      ? value.rhythm.map((item) => ({
        ...item,
        visual: item.visual ?? item.description,
        rhythm: item.rhythm ?? `${item.shotType ?? 'medium'}${item.cameraMovement ? ` / ${item.cameraMovement}` : ''}`,
        subtitle: item.subtitle ?? item.voiceover,
      }))
      : [];
  return raw.slice(0, shotCount).map((item, index) => {
    const reference = targetRhythm[index];
    const timeRange = compactText(item.timeRange, reference?.timeRange ?? '');
    const durationFromTimeRange = timeRangeDurationSeconds(timeRange);
    const visual = compactText(item.visual, '');
    const voiceover = compactText(item.voiceover, '');
    const subtitle = input.subtitleMode === 'no-subtitle' ? compactText(item.subtitle, '') : compactText(item.subtitle, '');
    const rhythm = compactText(item.rhythm, '');
    const shotType = compactText(item.shotType, '');
    const imagePrompt = compactText(item.imagePrompt, '');
    const videoPrompt = compactText(item.videoPrompt, '');
    const missingFields = [
      visual ? '' : 'visual',
      voiceover ? '' : 'voiceover',
      input.subtitleMode === 'no-subtitle' || subtitle ? '' : 'subtitle',
      rhythm ? '' : 'rhythm',
      shotType ? '' : 'shotType',
      imagePrompt ? '' : 'imagePrompt',
      videoPrompt ? '' : 'videoPrompt',
    ].filter(Boolean);
    if (missingFields.length) {
      throw new Error(`文字模型返回的第 ${index + 1} 个镜头缺少必要字段：${missingFields.join(', ')}；未生成不完整脚本。`);
    }
    return {
    shot: Number(item.shot || index + 1),
    duration: compactText(
      item.duration,
      durationFromTimeRange ? `${durationFromTimeRange}s` : timeRange || fallbackShotDuration(input, shotCount),
    ),
    visual,
    voiceover,
    subtitle,
    rhythm,
    timeRange,
    shotType,
    character: compactText(item.character, ''),
    characterAction: compactText(item.characterAction, ''),
    scene: compactText(item.scene, ''),
    cameraMovement: compactText(item.cameraMovement, reference?.cameraMovement ?? ''),
    imagePrompt,
    videoPrompt,
    transitionHint: compactText(item.transitionHint, ''),
    voiceStyle: compactText(item.voiceStyle, ''),
    };
  });
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
      authorization: resolveAuthorizationHeader(input.apiKey, input.endpoint),
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
      requirements: VIDEO_BREAKDOWN_REQUIREMENTS,
      output_schema: {
        type: 'object',
        required: ['summary', 'segments', 'reusableFormula', 'risks'],
        optional: [
          'contentTitle',
          'durationSec',
          'transcript',
          'transcriptSegments',
          'scenes',
          'hook',
          'narrative',
          'pacing',
          'timeline',
          'viralScores',
          'resourceFramework',
          'overallConfidence',
          'confidenceRate',
          'richnessRate',
          'referenceScore',
          'warnings',
        ],
      },
    }),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`视频理解服务返回 ${response.status}：${sanitizeProviderError(text).slice(0, 1000)}`);
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
    resourceFramework: {
      type: 'object',
      additionalProperties: false,
      properties: {
        characters: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'shotCount'],
            properties: {
              name: { type: 'string' },
              shotCount: { type: 'number' },
              voiceTraits: { type: 'string' },
              threeViewPrompt: { type: 'string' },
            },
          },
        },
        scenes: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['name', 'shotCount'],
            properties: {
              name: { type: 'string' },
              shotCount: { type: 'number' },
              environment: { type: 'string' },
              lighting: { type: 'string' },
              sceneImagePrompt: { type: 'string' },
            },
          },
        },
      },
    },
    storyboard: {
      type: 'array',
      minItems: 1,
      maxItems: 80,
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
          timeRange: { type: 'string' },
          shotType: { type: 'string' },
          character: { type: 'string' },
          characterAction: { type: 'string' },
          scene: { type: 'string' },
          cameraMovement: { type: 'string' },
          imagePrompt: { type: 'string' },
          videoPrompt: { type: 'string' },
          transitionHint: { type: 'string' },
          voiceStyle: { type: 'string' },
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

const VIDEO_SCRIPT_EVALUATION_SYSTEM_PROMPT = `你是一位资深的日化/家清行业短视频质检专家，擅长评估 AI 生成的分镜脚本质量。

## 你的任务
基于提供的生成分镜脚本、原始商品描述和参考爆款模板信息，对脚本进行五维评分并给出改进建议。

## 评分维度（每项 1-10 分）
1. hookScore：开头吸引力，评估前 3 秒是否能打断用户滑动。
2. structureScore：结构完整度，评估脚本是否有完整的引入、递进、转化弧线。
3. sellingPointScore：卖点融合度，评估商品卖点是否自然嵌入脚本，而非硬塞。
4. voiceoverScore：口播自然度，评估旁白是否口语化、符合带货短视频风格。
5. pacingScore：节奏合理性，评估时长分配是否紧凑，是否存在冗余镜头。

## 评分锚点
- 1-3 分：没有明确钩子、结构混乱、卖点与剧情割裂、口播像书面稿或节奏拖沓。
- 4-6 分：有基本结构和卖点，但钩子套路化、转折生硬、部分镜头冗余。
- 7-8 分：钩子有视觉或情绪冲击，结构清晰，卖点自然，口播像真人带货，节奏紧凑。
- 9-10 分：头部爆款级别，每一拍服务转化，情绪曲线精准且无废镜头。

## 评分原则
1. 严格打分：普通脚本集中在 4-6 分，不要通胀。
2. 引用原文：reasoning 必须引用脚本中的具体镜头或口播。
3. 对比标杆：以日化/家清行业头部品牌的爆款脚本为标杆。
4. suggestions 限 3 条：只给最关键的改进点，每条不超过 30 字。`;

const VIDEO_SCRIPT_EVALUATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['hookScore', 'structureScore', 'sellingPointScore', 'voiceoverScore', 'pacingScore', 'suggestions'],
  properties: {
    hookScore: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'reasoning'],
      properties: { score: { type: 'number' }, reasoning: { type: 'string' } },
    },
    structureScore: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'reasoning'],
      properties: { score: { type: 'number' }, reasoning: { type: 'string' } },
    },
    sellingPointScore: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'reasoning'],
      properties: { score: { type: 'number' }, reasoning: { type: 'string' } },
    },
    voiceoverScore: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'reasoning'],
      properties: { score: { type: 'number' }, reasoning: { type: 'string' } },
    },
    pacingScore: {
      type: 'object',
      additionalProperties: false,
      required: ['score', 'reasoning'],
      properties: { score: { type: 'number' }, reasoning: { type: 'string' } },
    },
    suggestions: { type: 'array', maxItems: 3, items: { type: 'string' } },
  },
};

const VIDEO_SCRIPT_SHOT_REWRITE_SYSTEM_PROMPT = `你是一位资深的日化/家清行业短视频编导。你需要重新生成脚本中的一个镜头段落，使其质量更高。

## 约束
1. 必须保持与前后镜头的时间线连贯性。
2. 必须保持与前后镜头的叙事连贯性，不能突然跳转话题。
3. visual 描述要具体到镜头角度、场景、物品摆放。
4. voiceover 必须口语化，符合带货短视频风格。
5. subtitle 不超过 15 字。
6. imagePrompt 用英文，videoPrompt 用中文导演公式。
7. videoPrompt 按导演公式：主体外观（不超过 30 字）+ 一个主要动作 + 场景和灯光 + 景别/运镜 + 写实或半写实风格后缀。
8. 如当前脚本已有 resourceFramework，character 和 scene 必须继续引用已有名称，不要新增不必要角色或场景。
9. 只能基于商品信息、参考模板和当前脚本上下文改写，不能编造无依据功效。`;

const VIDEO_SCRIPT_SHOT_REWRITE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['visual', 'voiceover', 'subtitle', 'rhythm'],
  properties: {
    timestamp: { type: 'string' },
    timeRange: { type: 'string' },
    duration: { type: 'string' },
    visual: { type: 'string' },
    voiceover: { type: 'string' },
    overlay: { type: 'string' },
    subtitle: { type: 'string' },
    rhythm: { type: 'string' },
    shotType: { type: 'string' },
    character: { type: 'string' },
    characterAction: { type: 'string' },
    scene: { type: 'string' },
    cameraMovement: { type: 'string' },
    imagePrompt: { type: 'string' },
    videoPrompt: { type: 'string' },
    transitionHint: { type: 'string' },
    voiceStyle: { type: 'string' },
    reasoning: { type: 'string' },
    publishCheck: {
      type: 'array',
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

function normalizePublishCheck(
  value: Array<{ level?: 'info' | 'warning' | 'risk'; message?: string }> | undefined,
  fallback: Array<{ level: 'info' | 'warning' | 'risk'; message: string }> = [],
): Array<{ level: 'info' | 'warning' | 'risk'; message: string }> {
  const items = (Array.isArray(value) ? value : [])
    .map((item) => ({ level: normalizeRiskLevel(item.level), message: compactText(item.message, '') }))
    .filter((item) => item.message)
    .slice(0, 8);
  return items.length ? items : fallback;
}

function normalizeEvaluationScore(
  value: Partial<VideoScriptEvaluationResult['scores']['hookScore']> | undefined,
  fallbackReason: string,
): VideoScriptEvaluationResult['scores']['hookScore'] {
  return {
    score: Math.max(1, boundedScore(value?.score) ?? 5),
    reasoning: compactText(value?.reasoning, fallbackReason),
  };
}

function normalizeScriptEvaluationOutput(
  value: VideoScriptEvaluationModelOutput,
  sourceScriptLogId: string | undefined,
): Omit<VideoScriptEvaluationResult, 'logId'> {
  const hookScore = normalizeEvaluationScore(value.hookScore, '模型未返回开头吸引力说明。');
  const structureScore = normalizeEvaluationScore(value.structureScore, '模型未返回结构完整度说明。');
  const sellingPointScore = normalizeEvaluationScore(value.sellingPointScore, '模型未返回卖点融合说明。');
  const voiceoverScore = normalizeEvaluationScore(value.voiceoverScore, '模型未返回口播自然度说明。');
  const pacingScore = normalizeEvaluationScore(value.pacingScore, '模型未返回节奏合理性说明。');
  const totalScore = Number((
    hookScore.score * 0.25
    + structureScore.score * 0.2
    + sellingPointScore.score * 0.25
    + voiceoverScore.score * 0.15
    + pacingScore.score * 0.15
  ).toFixed(1));
  const suggestions = (Array.isArray(value.suggestions) ? value.suggestions : [])
    .map((item) => compactText(item, ''))
    .filter(Boolean)
    .slice(0, 3);
  return {
    sourceScriptLogId,
    scores: {
      hookScore,
      structureScore,
      sellingPointScore,
      voiceoverScore,
      pacingScore,
      totalScore,
    },
    suggestions: suggestions.length ? suggestions : ['请人工复核脚本开头、卖点和合规边界。'],
  };
}

function scriptRowsForModel(script: VideoScriptGenerationResult): Array<Record<string, string | number>> {
  return script.storyboard.map((shot) => ({
    shot: shot.shot,
    timestamp: shot.timeRange || shot.duration,
    visual: shot.visual,
    voiceover: shot.voiceover,
    overlay: shot.subtitle,
    rhythm: shot.rhythm,
    shotType: shot.shotType ?? '',
    character: shot.character ?? '',
    scene: shot.scene ?? '',
    imagePrompt: shot.imagePrompt ?? '',
    videoPrompt: shot.videoPrompt ?? '',
  }));
}

function normalizeRewriteShotOutput(
  value: VideoScriptShotRewriteModelOutput,
  currentShot: VideoStoryboardShot,
  rowIndex: number,
): Omit<VideoScriptShotRewriteResult, 'logId' | 'sourceScriptLogId' | 'rowIndex'> {
  const timeRange = compactText(value.timeRange, compactText(value.timestamp, currentShot.timeRange ?? ''));
  const shot: VideoStoryboardShot = {
    ...currentShot,
    shot: currentShot.shot || rowIndex + 1,
    duration: compactText(value.duration, currentShot.duration || timeRange || '5s'),
    timeRange,
    visual: compactText(value.visual, currentShot.visual),
    voiceover: compactText(value.voiceover, currentShot.voiceover),
    subtitle: compactText(value.subtitle, compactText(value.overlay, currentShot.subtitle)),
    rhythm: compactText(value.rhythm, currentShot.rhythm),
    shotType: compactText(value.shotType, currentShot.shotType ?? ''),
    character: compactText(value.character, currentShot.character ?? ''),
    characterAction: compactText(value.characterAction, currentShot.characterAction ?? ''),
    scene: compactText(value.scene, currentShot.scene ?? ''),
    cameraMovement: compactText(value.cameraMovement, currentShot.cameraMovement ?? ''),
    imagePrompt: compactText(value.imagePrompt, currentShot.imagePrompt ?? ''),
    videoPrompt: compactText(value.videoPrompt, currentShot.videoPrompt ?? ''),
    transitionHint: compactText(value.transitionHint, currentShot.transitionHint ?? ''),
    voiceStyle: compactText(value.voiceStyle, currentShot.voiceStyle ?? ''),
  };
  return {
    shot,
    reasoning: compactText(value.reasoning, ''),
    publishCheck: normalizePublishCheck(value.publishCheck, [{ level: 'warning', message: '单镜头重写后需要人工复核前后镜头连贯性。' }]),
  };
}

export class VideoWorkflowService {
  constructor(
    private readonly logs: GenerationLogStore,
    private readonly text: TextGenerationService,
    private readonly modelConfig?: ModelConfigStore,
  ) {}

  private async persistLog(workspacePath: string, logId: string | undefined, input: CreateLogInput) {
    if (logId) {
      const updated = await this.logs.update(workspacePath, logId, input);
      if (updated) return updated;
    }
    return this.logs.append(input);
  }

  async analyze(input: VideoBreakdownRequest, options?: { logId?: string }): Promise<VideoBreakdownResult> {
    const startedAt = Date.now();
    const dimensions = input.dimensions.length ? input.dimensions : DEFAULT_DIMENSIONS;
    const config = await this.modelConfig?.readView();
    const apiKey = videoApiKeyFor(await this.modelConfig?.getVideoApiKey());
    const endpoint = videoEndpointFor(config);
    const videoProvider = videoProviderFor(config, apiKey, endpoint);
    const videoModel = visualModelForVideoUnderstanding(config);
    const classificationModel = textModelForVideoClassification(config, input);

    if (videoProvider === 'video-understanding-openai-compatible' && apiKey && endpoint) {
      try {
        const output = await analyzeVideoWithNativeProvider({
          config: {
            endpoint,
            apiKey,
            model: videoModel,
            classificationModel,
          },
          sourceType: input.sourceType,
          source: input.source,
          dimensions,
        });
        const result = normalizeBreakdownOutput(output, input, dimensions);
        const log = await this.persistLog(input.workspacePath, options?.logId, {
          workspacePath: input.workspacePath,
          kind: 'video-breakdown',
          status: 'succeeded',
          title: result.contentTitle || '视频拆解结果',
          summary: result.summary,
          model: `${videoModel} + ${classificationModel}`,
          promptPackId: input.promptPackId,
          citations: input.citations,
          artifactRefs: breakdownArtifactRefs(input),
          input: { ...input, dimensions },
          output: result,
          durationMs: Date.now() - startedAt,
        });
        return { logId: log.id, ...result };
      } catch (error) {
        const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
        await this.persistLog(input.workspacePath, options?.logId, {
          workspacePath: input.workspacePath,
          kind: 'video-breakdown',
          status: 'failed',
          title: '视频拆解失败',
          summary: '原生爆款视频拆解链路调用失败，未使用模板伪造拆解结果。',
          model: `${videoModel} + ${classificationModel}`,
          promptPackId: input.promptPackId,
          citations: input.citations,
          artifactRefs: breakdownArtifactRefs(input),
          input: { ...input, dimensions },
          error: message,
          durationMs: Date.now() - startedAt,
        });
        throw new Error(message);
      }
    }

    if (videoProvider === 'generic-http' && apiKey && endpoint) {
      try {
        const output = await postGenericVideoUnderstanding({
          endpoint,
          apiKey,
          model: videoModel,
          request: input,
          dimensions,
        });
        const result = normalizeBreakdownOutput(output, input, dimensions);
        const log = await this.persistLog(input.workspacePath, options?.logId, {
          workspacePath: input.workspacePath,
          kind: 'video-breakdown',
          status: 'succeeded',
          title: '视频拆解结果',
          summary: result.summary,
          model: videoModel,
          promptPackId: input.promptPackId,
          citations: input.citations,
          artifactRefs: breakdownArtifactRefs(input),
          input: { ...input, dimensions },
          output: result,
          durationMs: Date.now() - startedAt,
        });
        return { logId: log.id, ...result };
      } catch (error) {
        const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
        await this.persistLog(input.workspacePath, options?.logId, {
          workspacePath: input.workspacePath,
          kind: 'video-breakdown',
          status: 'failed',
          title: '视频拆解失败',
          summary: '真实视频理解服务调用失败，未使用模板伪造拆解结果。',
          model: videoModel,
          promptPackId: input.promptPackId,
          citations: input.citations,
          artifactRefs: breakdownArtifactRefs(input),
          input: { ...input, dimensions },
          error: message,
          durationMs: Date.now() - startedAt,
        });
        throw new Error(message);
      }
    }

    const message = '真实视频理解模型未配置：当前不会用模板伪造拆解结果。请先接入支持视频帧/转写分析的生成服务，或人工提供参考视频结构后再生成脚本。';
    await this.persistLog(input.workspacePath, options?.logId, {
      workspacePath: input.workspacePath,
      kind: 'video-breakdown',
      status: 'blocked',
      title: '视频拆解未完成',
      summary: message,
      model: videoModel || input.params.textModel,
      promptPackId: input.promptPackId,
      citations: input.citations,
      artifactRefs: breakdownArtifactRefs(input),
      input: { ...input, dimensions },
      error: 'VIDEO_UNDERSTANDING_PROVIDER_NOT_CONFIGURED',
      durationMs: Date.now() - startedAt,
    });
    throw new Error(message);
  }

  async generateScript(input: VideoScriptGenerationRequest, options?: { logId?: string }): Promise<VideoScriptGenerationResult> {
    const startedAt = Date.now();
    try {
      const breakdown = logOutputAsBreakdown(input.breakdownLogId ? await this.logs.get(input.workspacePath, input.breakdownLogId) : null);
      const breakdownContext = summarizeBreakdownForScript(breakdown);
      const scriptContext = scriptContextForPrompt(input, breakdownContext);
      const targetShotCount = Number(scriptContext.targetShotCount);
      const targetDurationSeconds = Number(scriptContext.targetDurationSeconds);
      const { value, model } = await this.text.generateJson<VideoScriptModelOutput>({
        workspacePath: input.workspacePath,
        model: input.params.textModel,
        maxTurns: 3,
        systemPrompt: [
          '你是资深短视频脚本导演，擅长日化/家清行业短视频和跨品类爆款结构迁移。',
          '你只能基于用户提供的产品信息、知识引用、素材说明和已记录的视频拆解生成新产品脚本。',
          '必须复用结构、节奏、叙事功能、情绪走向和镜头时间轴；必须替换原视频人物、品牌、画面和未经证实的卖点。',
          '有关联拆解时，输出镜头数必须等于 targetShotCount，timeRange 必须逐条对齐 referenceRhythm。',
          'resourceFramework 必须先把原视频角色/场景映射为目标商品角色/场景，再让 storyboard 中的 character/scene 完全引用这些名称。',
          '每个镜头必须包含完整字段；单镜头时长通常控制在 2-6 秒，严禁把多个叙事功能合并成一个长镜头。',
          'videoPrompt 必须是中文导演级公式：主体外观（不超过 30 字）+ 一个主要动作 + 场景和灯光 + 景别/运镜 + 写实或半写实风格后缀。',
          'threeViewPrompt 用于角色参考图，sceneImagePrompt 用于场景背景图；它们必须能直接复制到外部生图平台。',
        ].join('\n'),
        schema: VIDEO_SCRIPT_SCHEMA,
        prompt: JSON.stringify({
          task: 'generate_video_script',
          productName: input.productName,
          sceneBackground: input.sceneBackground,
          subtitleMode: input.subtitleMode,
          voiceStyle: input.voiceStyle,
          customRequirement: input.customRequirement ?? '',
          ratio: input.ratio,
          targetShotCount,
          targetDurationSeconds,
          breakdownLogId: input.breakdownLogId ?? '',
          scriptContext,
          promptPackId: input.promptPackId ?? '',
          sceneCardIds: input.sceneCardIds ?? [],
          assetRefs: input.assetRefs,
          selectedSkillSlugs: input.selectedSkillSlugs,
          citations: citationPayload(input),
          requirements: [
            '输出可直接用于图生视频或文生视频的分镜脚本。',
            '每个镜头都要有画面、口播、字幕、节奏、shotType、character、scene、cameraMovement、imagePrompt、videoPrompt、transitionHint、voiceStyle。',
            `必须生成恰好 ${targetShotCount} 个镜头，不多不少。`,
            `总时长按 ${targetDurationSeconds} 秒控制，最后一个镜头结束时间应接近 ${formatSeconds(targetDurationSeconds)}。`,
            '每个镜头时长通常控制在 2-6 秒；如 referenceRhythm 中有更长段落，也要保持原 timeRange 但在 visual/rhythm 中说明清楚叙事功能。',
            '如有关联拆解，必须严格匹配原视频的镜头数量、timeRange、shotType、节奏密度和情绪走向。',
            '如有关联拆解，需要输出 resourceFramework，将原视频角色和场景映射为目标产品对应角色和场景。',
            'resourceFramework.characters[].threeViewPrompt 必须描述正面、侧面、背面三视图，包含年龄段、发型、体型、服装、表情、姿态、肤色和配饰。',
            'resourceFramework.scenes[].sceneImagePrompt 必须描述无人物场景背景，包含空间布局、关键物件、材质、光线氛围和镜头角度。',
            'videoPrompt 用中文 50-100 字，按导演公式：主体外观 + 一个主要动作 + 场景环境 + 景别/运镜 + 写实风格。',
            'imagePrompt 用英文，描述构图、主体、动作、环境、光线和机位，可直接给图生视频工具。',
            'sceneImagePrompt 用英文，描述场景空间布局、材质和光线，可直接给场景背景图生成工具。',
            '日化/家清脚本至少包含一个 before-after 或清洁效果证明镜头，除非产品信息明确不适用。',
            '不要编造知识库外的功效和背书。',
            '如有关联拆解，只复用 hook、叙事阶段、节奏密度、情绪曲线和转化结构；必须替换为本方产品、场景和事实源。',
            '不要照搬原视频口播、可识别角色、场景、品牌元素或原始字幕。',
            '如果没有真实视频拆解，明确按知识库和用户输入生成，不要伪装复刻原视频。',
          ],
        }, null, 2),
      });

      const storyboard = normalizeStoryboard(value, input, targetShotCount, breakdownContext);
      if (storyboard.length === 0) throw new Error('文字模型没有返回分镜脚本');
      if (storyboard.length !== targetShotCount) {
        throw new Error(`文字模型返回 ${storyboard.length} 个镜头，目标是 ${targetShotCount} 个；未生成不完整脚本。`);
      }
      const resourceFramework = enrichResourceFrameworkCounts(normalizeScriptResourceFramework(value.resourceFramework), storyboard);
      const title = compactText(value.title, `${input.productName || '新产品'}脚本`);
      const script = compactText(value.script, storyboard.map((item) => `镜头 ${item.shot}（${item.duration}）\n画面：${item.visual}\n口播：${item.voiceover}\n字幕：${item.subtitle || '无字幕'}\n节奏：${item.rhythm}`).join('\n\n'));
      const shotPrompts = storyboard.map((item) => item.videoPrompt).filter(Boolean);
      const videoPrompt = compactText(value.videoPrompt, shotPrompts.length
        ? shotPrompts.join('\n')
        : `比例 ${input.ratio}，总时长 ${input.durationSeconds}s，${input.voiceStyle || '自然可信'}口吻。\n${script}`);
      const publishCheck = (Array.isArray(value.publishCheck) ? value.publishCheck : [])
        .map((item) => ({ level: item.level ?? 'warning', message: compactText(item.message, '需要人工复核。') }))
        .filter((item) => item.message)
        .slice(0, 8);
      const result: Omit<VideoScriptGenerationResult, 'logId'> = {
        title,
        script,
        storyboard,
        videoPrompt,
        resourceFramework,
        publishCheck: publishCheck.length ? publishCheck : [{ level: 'warning', message: '模型未返回发布检查，请人工复核知识引用和合规表达。' }],
      };
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video-script',
        status: 'succeeded',
        title,
        summary: `文字模型生成 ${storyboard.length} 镜头、${targetDurationSeconds}s 的视频脚本。${breakdownUsedSummary(breakdownContext)}`,
        model,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        artifactRefs: scriptArtifactRefs(input),
        input,
        output: result,
        durationMs: Date.now() - startedAt,
      });
      return { logId: log.id, ...result };
    } catch (error) {
      const status = error instanceof TextProviderBlockedError ? 'blocked' : 'failed';
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video-script',
        status,
        title: `${input.productName || '新产品'}脚本生成未完成`,
        summary: status === 'blocked' ? '文字模型未配置，未生成本地模板。' : '文字模型调用失败，未生成视频脚本。',
        model: input.params.textModel,
        promptPackId: input.promptPackId,
        sceneCardIds: input.sceneCardIds,
        citations: input.citations,
        artifactRefs: scriptArtifactRefs(input),
        input,
        error: error instanceof Error ? error.message : String(error),
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  private async attachEvaluationToSourceScript(
    workspacePath: string,
    sourceScriptLogId: string | undefined,
    evaluation: VideoScriptEvaluationResult,
  ): Promise<void> {
    if (!sourceScriptLogId) return;
    const sourceLog = await this.logs.get(workspacePath, sourceScriptLogId);
    if (!sourceLog || sourceLog.kind !== 'video-script' || !sourceLog.output || typeof sourceLog.output !== 'object') return;
    await this.logs.update(workspacePath, sourceScriptLogId, {
      output: {
        ...(sourceLog.output as Record<string, unknown>),
        evaluation,
      },
    });
  }

  async evaluateScript(input: VideoScriptEvaluationRequest, options?: { logId?: string }): Promise<VideoScriptEvaluationResult> {
    const startedAt = Date.now();
    const artifactRefs = Array.from(new Set([
      input.sourceScriptLogId ? `generation-log:${input.sourceScriptLogId}` : '',
    ].filter(Boolean)));
    try {
      const { value, model } = await this.text.generateJson<VideoScriptEvaluationModelOutput>({
        workspacePath: input.workspacePath,
        model: input.params.textModel,
        maxTurns: 2,
        systemPrompt: VIDEO_SCRIPT_EVALUATION_SYSTEM_PROMPT,
        schema: VIDEO_SCRIPT_EVALUATION_SCHEMA,
        prompt: JSON.stringify({
          task: 'evaluate_video_script',
          productName: input.productName,
          productDesc: input.productDesc,
          templateInfo: input.templateInfo ?? {},
          scriptTitle: input.script.title,
          script: scriptRowsForModel(input.script),
          fullScriptText: input.script.script,
          publishCheck: input.script.publishCheck,
          citations: citationPayload(input),
        }, null, 2),
      });
      const normalized = normalizeScriptEvaluationOutput(value, input.sourceScriptLogId);
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video-script-evaluation',
        status: 'succeeded',
        title: `${input.script.title || input.productName || '视频脚本'} AI 质检`,
        summary: `AI 脚本质检总分 ${normalized.scores.totalScore.toFixed(1)}。`,
        model,
        citations: input.citations,
        artifactRefs,
        input,
        output: normalized,
        durationMs: Date.now() - startedAt,
      });
      const result: VideoScriptEvaluationResult = { logId: log.id, ...normalized };
      await this.attachEvaluationToSourceScript(input.workspacePath, input.sourceScriptLogId, result);
      return result;
    } catch (error) {
      const status = error instanceof TextProviderBlockedError ? 'blocked' : 'failed';
      const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video-script-evaluation',
        status,
        title: `${input.script.title || input.productName || '视频脚本'} AI 质检未完成`,
        summary: status === 'blocked' ? '文字模型未配置，未生成脚本质检结果。' : '文字模型调用失败，未生成脚本质检结果。',
        model: input.params.textModel,
        citations: input.citations,
        artifactRefs,
        input,
        error: message,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  async rewriteScriptShot(input: VideoScriptShotRewriteRequest, options?: { logId?: string }): Promise<VideoScriptShotRewriteResult> {
    const startedAt = Date.now();
    const rowIndex = Math.trunc(input.rowIndex);
    const storyboard = input.script.storyboard ?? [];
    if (rowIndex < 0 || rowIndex >= storyboard.length) throw new Error('镜头序号无效，无法重写。');
    const currentShot = storyboard[rowIndex];
    const artifactRefs = Array.from(new Set([
      input.sourceScriptLogId ? `generation-log:${input.sourceScriptLogId}` : '',
    ].filter(Boolean)));
    try {
      const { value, model } = await this.text.generateJson<VideoScriptShotRewriteModelOutput>({
        workspacePath: input.workspacePath,
        model: input.params.textModel,
        maxTurns: 2,
        systemPrompt: VIDEO_SCRIPT_SHOT_REWRITE_SYSTEM_PROMPT,
        schema: VIDEO_SCRIPT_SHOT_REWRITE_SCHEMA,
        prompt: JSON.stringify({
          task: 'rewrite_video_script_shot',
          productName: input.productName,
          productDesc: input.productDesc,
          templateInfo: input.templateInfo ?? {},
          scriptTitle: input.script.title,
          rowIndex,
          prevShot: rowIndex > 0 ? storyboard[rowIndex - 1] : null,
          currentShot,
          nextShot: rowIndex < storyboard.length - 1 ? storyboard[rowIndex + 1] : null,
          fullScript: scriptRowsForModel(input.script),
          citations: citationPayload(input),
          requirements: [
            '只重写 currentShot，不能改动前后镜头。',
            '保持时间线、角色、场景和叙事功能连续。',
            '字幕短，口播自然，画面具体，Prompt 可直接交给外部视频平台。',
            'videoPrompt 必须包含主体外观、一个主要动作、场景灯光、景别/运镜和风格后缀。',
          ],
        }, null, 2),
      });
      const normalized = normalizeRewriteShotOutput(value, currentShot, rowIndex);
      const output: Omit<VideoScriptShotRewriteResult, 'logId'> = {
        sourceScriptLogId: input.sourceScriptLogId,
        rowIndex,
        ...normalized,
      };
      const log = await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video-script-shot-rewrite',
        status: 'succeeded',
        title: `${input.script.title || input.productName || '视频脚本'} 镜头 ${currentShot.shot || rowIndex + 1} 重写`,
        summary: normalized.reasoning || `已重写第 ${currentShot.shot || rowIndex + 1} 个镜头。`,
        model,
        citations: input.citations,
        artifactRefs,
        input,
        output,
        durationMs: Date.now() - startedAt,
      });
      return { logId: log.id, ...output };
    } catch (error) {
      const status = error instanceof TextProviderBlockedError ? 'blocked' : 'failed';
      const message = sanitizeProviderError(error instanceof Error ? error.message : String(error));
      await this.persistLog(input.workspacePath, options?.logId, {
        workspacePath: input.workspacePath,
        kind: 'video-script-shot-rewrite',
        status,
        title: `${input.script.title || input.productName || '视频脚本'} 镜头重写未完成`,
        summary: status === 'blocked' ? '文字模型未配置，未生成镜头重写结果。' : '文字模型调用失败，未生成镜头重写结果。',
        model: input.params.textModel,
        citations: input.citations,
        artifactRefs,
        input,
        error: message,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  }
}
