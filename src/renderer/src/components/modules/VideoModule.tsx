import { useEffect, useMemo, useState, type Dispatch, type SetStateAction } from 'react';
import { AgentTimeline } from '@limecloud/agent-runtime-ui';
import type {
  GenerationLogEntry,
  MediaGenerationResult,
  SceneCard,
  UpdateGenerationLogReviewInput,
  VideoBreakdownResult,
  VideoScriptGenerationResult,
  VideoStoryboardShot,
} from '../../../../shared/types';
import { VIDEO_DIMENSIONS } from '../../app/constants';
import { fileNameFromPath, statusLabel } from '../../app/formatters';
import {
  buildCharacterPromptItems,
  buildScenePromptItems,
  buildVideoProductionDeliveryItems,
  buildVideoProductionReviewItems,
} from '../../app/videoProductionPrompts';
import { buildProductionSegments, shotTimeSeconds, type VideoProductionSegment } from '../../app/videoProductionSegments';

type VideoStage = 'breakdown' | 'library' | 'script' | 'history' | 'generate';
type FeatureStatusFilter = 'active' | 'featured' | 'archived' | 'all';

const FEATURE_TYPE_OPTIONS = ['全部', '钩子策略', '叙事框架', '节奏模式', 'CTA策略', '完整模板'] as const;
const HOOK_TYPE_OPTIONS = ['全部', '痛点提问', '反常识断言', '结果前置', '数字恐惧', '挑战互动', '权威背书'] as const;
const FEATURE_STATUS_OPTIONS: Array<{ key: FeatureStatusFilter; label: string }> = [
  { key: 'active', label: '可用' },
  { key: 'featured', label: '精选' },
  { key: 'archived', label: '已归档' },
  { key: 'all', label: '全部' },
];
const SCRIPT_HISTORY_PAGE_SIZE = 15;

const HOOK_TYPE_LABELS: Record<string, string> = {
  pain_point_question: '痛点提问',
  bold_counter_statement: '反常识断言',
  proof_first: '结果前置',
  fear_data: '数字恐惧',
  challenge: '挑战互动',
  authority: '权威背书',
  authority_endorsement: '权威背书',
};

const NARRATIVE_LABELS: Record<string, string> = {
  PSP: 'PSP',
  AIDA: 'AIDA',
  PAS: 'PAS',
  BAB: 'BAB',
  three_act: '三幕式',
  testimonial: '用户证言',
  tutorial: '教程干货',
  problem_solution: '问题解决',
  storytelling: '故事型',
  listicle: '清单型',
};

const SHOT_LABELS: Record<string, string> = {
  close_up: '特写',
  medium: '中景',
  wide: '远景',
  product_demo: '演示',
  comparison: '对比',
  text_overlay: '字幕',
  talking_head: '口播',
  transition: '转场',
  reaction: '反应',
  pov: '主观',
  unboxing: '开箱',
};

const EMOTION_LABELS: Record<string, string> = {
  curiosity: '好奇',
  anxiety: '焦虑',
  fear: '恐惧',
  surprise: '惊讶',
  trust: '信任',
  desire: '渴望',
  satisfaction: '满足',
  urgency: '紧迫',
};

function percentLabel(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '未返回';
  return `${Math.round(value * 100)}%`;
}

function scoreLabel(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '未返回';
  return value.toFixed(1);
}

function secondLabel(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '0.0s';
  return `${value.toFixed(1)}s`;
}

function clockLabel(value?: number): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '00:00';
  const minutes = Math.floor(value / 60).toString().padStart(2, '0');
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function dateLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}

function dateGroupLabel(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未记录日期';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86_400_000);
  const itemDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (itemDate.getTime() === today.getTime()) return '今天';
  if (itemDate.getTime() === yesterday.getTime()) return '昨天';
  if (now.getTime() - itemDate.getTime() < 7 * 86_400_000) return '近7天';
  return `${date.getMonth() + 1}月`;
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

function isBreakdownOutput(value: unknown): value is Omit<VideoBreakdownResult, 'logId'> {
  return Boolean(
    value
      && typeof value === 'object'
      && Array.isArray(recordValue(value, 'segments'))
      && Array.isArray(recordValue(value, 'reusableFormula'))
      && Array.isArray(recordValue(value, 'risks')),
  );
}

function breakdownFromLog(log: GenerationLogEntry): VideoBreakdownResult | null {
  if (log.kind !== 'video-breakdown' || log.status !== 'succeeded' || !isBreakdownOutput(log.output)) return null;
  return { logId: log.id, ...log.output };
}

function isScriptOutput(value: unknown): value is Omit<VideoScriptGenerationResult, 'logId'> {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof recordValue(value, 'title') === 'string'
      && typeof recordValue(value, 'script') === 'string'
      && Array.isArray(recordValue(value, 'storyboard')),
  );
}

function scriptFromLog(log: GenerationLogEntry): VideoScriptGenerationResult | null {
  if (log.kind !== 'video-script' || log.status !== 'succeeded' || !isScriptOutput(log.output)) return null;
  const output = log.output;
  return {
    logId: log.id,
    status: output.status,
    title: output.title,
    script: output.script,
    storyboard: output.storyboard,
    videoPrompt: output.videoPrompt ?? '',
    resourceFramework: output.resourceFramework,
    evaluation: output.evaluation,
    publishCheck: output.publishCheck ?? [],
    error: output.error,
  };
}

function isScriptReady(script: VideoScriptGenerationResult | null | undefined): boolean {
  return Boolean(script && script.status !== 'blocked' && script.status !== 'failed' && script.storyboard.length > 0);
}

function inputString(log: GenerationLogEntry, key: string): string {
  const value = recordValue(log.input, key);
  return typeof value === 'string' ? value : '';
}

function linkedBreakdownLogId(log: GenerationLogEntry): string {
  const inputId = inputString(log, 'breakdownLogId');
  if (inputId) return inputId;
  const artifactRef = log.artifactRefs?.find((ref) => ref.startsWith('generation-log:'));
  return artifactRef?.replace('generation-log:', '') ?? '';
}

function featureTypeForBreakdown(breakdown: VideoBreakdownResult): 'hook' | 'narrative' | 'pacing' | 'cta' | 'full' {
  if (breakdown.hook && breakdown.narrative && breakdown.pacing && breakdown.resourceFramework) return 'full';
  if (breakdown.hook?.elements?.length) return 'hook';
  if (breakdown.narrative?.stages?.length) return 'narrative';
  if (breakdown.pacing?.rhythm?.length) return 'pacing';
  return 'full';
}

function featureTypeLabel(type: string): string {
  return {
    hook: '钩子策略',
    narrative: '叙事框架',
    pacing: '节奏模式',
    cta: 'CTA策略',
    full: '完整模板',
  }[type] ?? '完整模板';
}

function hookLabel(value?: string): string {
  if (!value) return 'Hook 未分类';
  return HOOK_TYPE_LABELS[value] ?? value;
}

function narrativeLabel(value?: string): string {
  if (!value) return '框架未分类';
  return NARRATIVE_LABELS[value] ?? value;
}

function sourceTitle(log: GenerationLogEntry): string {
  const source = recordValue(log.input, 'source');
  if (typeof source === 'string' && source.trim()) return fileNameFromPath(source);
  return log.artifactRefs?.[0] ? fileNameFromPath(log.artifactRefs[0]) : '本地拆解日志';
}

function isFeaturedFeature(log: GenerationLogEntry): boolean {
  return log.review?.rating === 'useful';
}

function isArchivedFeature(log: GenerationLogEntry): boolean {
  return log.review?.rating === 'needs-rework';
}

function featureReviewRank(log: GenerationLogEntry): number {
  if (isFeaturedFeature(log)) return 0;
  if (isArchivedFeature(log)) return 2;
  return 1;
}

function scoreRows(breakdown: VideoBreakdownResult): Array<{ key: string; label: string; value?: number; reason?: string }> {
  return [
    { key: 'hookStrength', label: '钩子', value: breakdown.viralScores?.hookStrength?.score, reason: breakdown.viralScores?.hookStrength?.reasoning },
    { key: 'narrativeTension', label: '叙事', value: breakdown.viralScores?.narrativeTension?.score, reason: breakdown.viralScores?.narrativeTension?.reasoning },
    { key: 'pacingQuality', label: '节奏', value: breakdown.viralScores?.pacingQuality?.score, reason: breakdown.viralScores?.pacingQuality?.reasoning },
    { key: 'emotionDesign', label: '情绪', value: breakdown.viralScores?.emotionDesign?.score, reason: breakdown.viralScores?.emotionDesign?.reasoning },
    { key: 'ctaEffectiveness', label: '转化', value: breakdown.viralScores?.ctaEffectiveness?.score, reason: breakdown.viralScores?.ctaEffectiveness?.reasoning },
  ];
}

function resolvedReferenceScore(breakdown?: VideoBreakdownResult | null): number | undefined {
  if (!breakdown) return undefined;
  if (typeof breakdown.referenceScore === 'number' && Number.isFinite(breakdown.referenceScore)) {
    return Number(breakdown.referenceScore.toFixed(1));
  }
  const scores = scoreRows(breakdown)
    .map((row) => row.value)
    .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!scores.length) return undefined;
  return Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1));
}

const SCRIPT_SCORE_LABELS = {
  hookScore: '开头',
  structureScore: '结构',
  sellingPointScore: '卖点',
  voiceoverScore: '口播',
  pacingScore: '节奏',
} as const;

function scriptQualityRows(script: VideoScriptGenerationResult | null): Array<{ key: string; label: string; score: number; reason: string }> {
  if (!script) return [];
  if (script.evaluation) {
    return (Object.keys(SCRIPT_SCORE_LABELS) as Array<keyof typeof SCRIPT_SCORE_LABELS>).map((key) => ({
      key,
      label: SCRIPT_SCORE_LABELS[key],
      score: script.evaluation?.scores[key].score ?? 0,
      reason: script.evaluation?.scores[key].reasoning ?? 'AI 质检未返回说明。',
    }));
  }
  const shots = script.storyboard ?? [];
  const nonEmptyVoice = shots.filter((shot) => shot.voiceover?.trim()).length;
  const promptReady = shots.filter((shot) => shot.videoPrompt?.trim() || shot.imagePrompt?.trim()).length;
  const timeReady = shots.filter((shot) => shot.timeRange?.trim() || shot.duration?.trim()).length;
  const shortShots = shots.filter((shot) => {
    const seconds = shotTimeSeconds(shot);
    return seconds === 0 || seconds <= 8;
  }).length;
  const riskCount = script.publishCheck.filter((item) => item.level === 'risk').length;
  const warningCount = script.publishCheck.filter((item) => item.level === 'warning').length;
  const baseCompliance = Math.max(3, 9 - riskCount * 1.4 - warningCount * 0.45);
  return [
    {
      key: 'hookScore',
      label: '开头',
      score: Math.min(10, Math.max(4, shots[0]?.voiceover || shots[0]?.visual ? 8 : 5)),
      reason: shots[0] ? `首镜头：${shots[0].visual || shots[0].voiceover || '未返回'}` : '脚本没有返回分镜。',
    },
    {
      key: 'structureScore',
      label: '结构',
      score: Math.min(10, Math.max(4, 5 + Math.min(5, shots.length / 3))),
      reason: `共 ${shots.length} 个镜头，${timeReady} 个镜头包含时间信息。`,
    },
    {
      key: 'sellingPointScore',
      label: '卖点',
      score: Math.min(10, Math.max(4, promptReady ? 7 + promptReady / Math.max(1, shots.length) * 2 : 5)),
      reason: `${promptReady}/${shots.length || 1} 个镜头含 AI 图像或视频 Prompt。`,
    },
    {
      key: 'voiceoverScore',
      label: '口播',
      score: Math.min(10, Math.max(4, nonEmptyVoice / Math.max(1, shots.length) * 10)),
      reason: `${nonEmptyVoice}/${shots.length || 1} 个镜头含口播。`,
    },
    {
      key: 'pacingScore',
      label: '节奏',
      score: Math.min(10, Math.max(4, shortShots / Math.max(1, shots.length) * 10)),
      reason: `${shortShots}/${shots.length || 1} 个镜头控制在 8 秒以内或未返回明确时长。`,
    },
    {
      key: 'complianceScore',
      label: '合规',
      score: Number(baseCompliance.toFixed(1)),
      reason: `发布检查：${riskCount} 个风险，${warningCount} 个提醒。`,
    },
  ];
}

function averageScore(rows: Array<{ score: number }>): number {
  if (!rows.length) return 0;
  return rows.reduce((sum, row) => sum + row.score, 0) / rows.length;
}

function scriptTotalScore(script: VideoScriptGenerationResult | null): number {
  if (!script) return 0;
  return script.evaluation?.scores.totalScore ?? averageScore(scriptQualityRows(script));
}

function scriptQualitySourceLabel(script: VideoScriptGenerationResult | null): string {
  return script?.evaluation ? 'AI 质检' : '本地规则';
}

interface VideoFeatureDetailPanelProps {
  item?: { log: GenerationLogEntry; breakdown: VideoBreakdownResult };
  onOpenLog: (log: GenerationLogEntry) => void;
  onUseTemplate: (log: GenerationLogEntry) => void;
  onUpdateReview: (input: Omit<UpdateGenerationLogReviewInput, 'workspacePath'>) => void;
}

function VideoFeatureDetailPanel({ item, onOpenLog, onUseTemplate, onUpdateReview }: VideoFeatureDetailPanelProps) {
  if (!item) {
    return <div className="video-placeholder tall">选择左侧特征查看详情</div>;
  }

  const { log, breakdown } = item;
  const referenceScore = resolvedReferenceScore(breakdown);
  const hookElements = breakdown.hook?.elements ?? [];
  const emotionCurve = breakdown.hook?.emotionCurve ?? [];
  const narrativeStages = breakdown.narrative?.stages ?? [];
  const rhythm = breakdown.pacing?.rhythm ?? [];
  const transcriptSegments = breakdown.transcriptSegments ?? [];
  const timeline = breakdown.timeline ?? [];
  const scenes = breakdown.scenes ?? [];
  const warnings = breakdown.warnings ?? [];

  return (
    <div className="video-feature-detail-stack">
      <section className="video-template-summary feature-detail-hero">
        <strong>{breakdown.contentTitle || log.title}</strong>
        <span>{scoreLabel(referenceScore)} 爆款指数 · {sourceTitle(log)}</span>
        <p>{breakdown.summary}</p>
        <dl>
          <div><dt>Hook</dt><dd>{hookLabel(breakdown.hook?.hookType?.value)}</dd></div>
          <div><dt>叙事</dt><dd>{narrativeLabel(breakdown.narrative?.framework?.value)}</dd></div>
          <div><dt>平台</dt><dd>{breakdown.platform || '未返回'}</dd></div>
          <div><dt>镜头</dt><dd>{rhythm.length || breakdown.segments.length} 个</dd></div>
        </dl>
        <div className="video-feature-detail-actions">
          <button className="ghost small" onClick={() => onOpenLog(log)}>查看追溯</button>
          <button className="primary small" onClick={() => onUseTemplate(log)}>改写脚本</button>
        </div>
        <div className="video-feature-curation-actions">
          <button
            className={isFeaturedFeature(log) ? 'active' : ''}
            onClick={() => onUpdateReview({
              logId: log.id,
              rating: isFeaturedFeature(log) ? null : 'useful',
              note: log.review?.note ?? '',
            })}
          >
            {isFeaturedFeature(log) ? '取消精选' : '设为精选'}
          </button>
          <button
            className={isArchivedFeature(log) ? 'active warning' : 'warning'}
            onClick={() => onUpdateReview({
              logId: log.id,
              rating: isArchivedFeature(log) ? null : 'needs-rework',
              note: log.review?.note ?? '',
            })}
          >
            {isArchivedFeature(log) ? '恢复可用' : '归档'}
          </button>
        </div>
      </section>

      <section className="video-feature-detail-metrics">
        <span><strong>{scoreLabel(referenceScore)}</strong>爆款指数</span>
        <span><strong>{percentLabel(breakdown.confidenceRate ?? breakdown.overallConfidence)}</strong>可信度</span>
        <span><strong>{percentLabel(breakdown.richnessRate)}</strong>丰富度</span>
        <span><strong>{breakdown.durationSec ? secondLabel(breakdown.durationSec) : '未返回'}</strong>原片时长</span>
      </section>

      {breakdown.viralScores ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>五维评分依据</strong>
            <span>{scoreRows(breakdown).filter((row) => typeof row.value === 'number').length} 项</span>
          </div>
          <div className="video-sub-score-list">
            {scoreRows(breakdown).map((row) => (
              <div key={row.key} className="video-sub-score-row detail" title={row.reason}>
                <span>{row.label}</span>
                <i><b style={{ width: `${Math.min(100, Math.max(0, row.value ?? 0) * 10)}%` }} /></i>
                <em>{typeof row.value === 'number' ? row.value.toFixed(1) : '-'}</em>
                <p>{row.reason || '模型未返回评分依据。'}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {breakdown.hook ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>Hook 分析</strong>
            <span>{percentLabel(breakdown.hook.hookType?.confidence)}</span>
          </div>
          <div className="video-feature-proof">
            <b>{hookLabel(breakdown.hook.hookType?.value)}</b>
            <p>{breakdown.hook.hookType?.reasoning || '模型未返回 Hook 判断依据。'}</p>
          </div>
          {hookElements.length ? (
            <div className="video-breakdown-list">
              {hookElements.map((element, index) => (
                <article key={`${element.timestampRange}-${element.name}-${index}`}>
                  <b>{element.timestampRange || '未标注时间'} · {element.name}</b>
                  <p>{element.description}</p>
                </article>
              ))}
            </div>
          ) : null}
          {emotionCurve.length ? (
            <div className="video-emotion-curve">
              {emotionCurve.map((point, index) => (
                <span
                  key={`${point.timestampSec}-${point.emotion}-${index}`}
                  style={{ height: `${Math.max(12, Math.min(100, point.intensity))}%` }}
                  title={`${clockLabel(point.timestampSec)} · ${EMOTION_LABELS[point.emotion] ?? point.emotion} · ${point.intensity}%`}
                >
                  <b>{EMOTION_LABELS[point.emotion] ?? point.emotion}</b>
                  <small>{clockLabel(point.timestampSec)}</small>
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {breakdown.narrative ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>叙事结构</strong>
            <span>{percentLabel(breakdown.narrative.framework?.confidence)}</span>
          </div>
          <div className="video-feature-proof">
            <b>{narrativeLabel(breakdown.narrative.framework?.value)}</b>
            <p>{breakdown.narrative.framework?.reasoning || '模型未返回叙事判断依据。'}</p>
          </div>
          {narrativeStages.length ? (
            <div className="video-detail-stage-flow">
              {narrativeStages.map((stage, index) => (
                <article key={`${stage.timeRange}-${stage.name}-${index}`}>
                  <b>{stage.name}</b>
                  <span>{stage.timeRange || '未标注时间'}</span>
                  <p>{stage.description}</p>
                  {stage.emotionShift ? <small>{stage.emotionShift}</small> : null}
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {rhythm.length ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>镜头拆解</strong>
            <span>{rhythm.length} 镜</span>
          </div>
          <div className="video-feature-detail-metrics compact">
            <span><strong>{typeof breakdown.pacing?.avgShotDurationSec === 'number' ? secondLabel(breakdown.pacing.avgShotDurationSec) : '未返回'}</strong>平均镜头</span>
            <span><strong>{typeof breakdown.pacing?.avgCutsPerSecond === 'number' ? breakdown.pacing.avgCutsPerSecond.toFixed(2) : '未返回'}</strong>切换频率</span>
            <span><strong>{typeof breakdown.pacing?.wordsPerMinute === 'number' ? Math.round(breakdown.pacing.wordsPerMinute) : '未返回'}</strong>口播字/分</span>
          </div>
          <div className="video-shot-table detail">
            {rhythm.map((shot, index) => (
              <article key={`${shot.timeRange}-${index}`}>
                <b>{shot.timeRange || `镜头 ${index + 1}`}</b>
                <span>{SHOT_LABELS[shot.shotType] || shot.shotType} / 强度 {shot.intensity}</span>
                <p>{shot.description}</p>
                <small>{[shot.character, shot.scene, shot.cameraMovement, shot.voiceover].filter(Boolean).join(' · ') || '无补充信息'}</small>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {breakdown.resourceFramework ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>总资源框架</strong>
            <span>{breakdown.resourceFramework.characters.length} 角色 / {breakdown.resourceFramework.scenes.length} 场景</span>
          </div>
          <div className="video-resource-framework-list">
            {breakdown.resourceFramework.characters.map((character) => (
              <article key={`detail-character-${character.name}`}>
                <b>角色：{character.name} · {character.shotCount} 镜</b>
                <p>{character.voiceTraits || '未返回音色'}{character.threeViewPrompt ? `；${character.threeViewPrompt}` : ''}</p>
              </article>
            ))}
            {breakdown.resourceFramework.scenes.map((scene) => (
              <article key={`detail-scene-${scene.name}`}>
                <b>场景：{scene.name} · {scene.shotCount} 镜</b>
                <p>{scene.environment || '未返回环境'}{scene.lighting ? `；${scene.lighting}` : ''}{scene.sceneImagePrompt ? `；${scene.sceneImagePrompt}` : ''}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {timeline.length || scenes.length ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>时间线证据</strong>
            <span>{timeline.length || scenes.length} 项</span>
          </div>
          <div className="video-detail-timeline">
            {timeline.length ? timeline.map((event, index) => (
              <article key={`${event.timestampSec}-${event.label}-${index}`}>
                <b>{clockLabel(event.timestampSec)}</b>
                <span>{event.label}</span>
                <p>{event.emotionLabel} · 强度 {event.intensity}</p>
              </article>
            )) : scenes.map((scene, index) => (
              <article key={`${scene.timestampSec}-${index}`}>
                <b>{clockLabel(scene.timestampSec)}</b>
                <span>{SHOT_LABELS[scene.shotType] || scene.shotType}</span>
                <p>{scene.description}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {transcriptSegments.length ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>语音转写</strong>
            <span>{transcriptSegments.length} 段</span>
          </div>
          <div className="video-transcript-list">
            {transcriptSegments.map((segment, index) => (
              <p key={`${segment.startSec}-${segment.endSec}-${index}`}>
                <b>{clockLabel(segment.startSec)}-{clockLabel(segment.endSec)}</b>
                {segment.text}
              </p>
            ))}
          </div>
        </section>
      ) : breakdown.transcript ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>语音转写</strong>
            <span>全文</span>
          </div>
          <p>{breakdown.transcript}</p>
        </section>
      ) : null}

      {breakdown.reusableFormula.length ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>可复用公式</strong>
            <span>{breakdown.reusableFormula.length} 条</span>
          </div>
          <div className="video-detail-formula-list">
            {breakdown.reusableFormula.map((formula, index) => (
              <p key={`${formula}-${index}`}>{formula}</p>
            ))}
          </div>
        </section>
      ) : null}

      {breakdown.risks.length || warnings.length ? (
        <section className="video-feature-detail-section">
          <div className="video-breakdown-heading">
            <strong>风险与提醒</strong>
            <span>{breakdown.risks.length + warnings.length} 项</span>
          </div>
          <div className="video-risk-list">
            {breakdown.risks.map((risk, index) => (
              <p key={`${risk.level}-${risk.message}-${index}`} className={`risk-${risk.level}`}>
                <b>{risk.level}</b>{risk.message}
              </p>
            ))}
            {warnings.map((warning, index) => (
              <p key={`${warning}-${index}`} className="risk-warning">
                <b>warning</b>{warning}
              </p>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

interface VideoModuleProps {
  initialStage?: VideoStage;
  busy: boolean;
  workspaceReady: boolean;
  productImageRefs: string[];
  referenceImageRefs: string[];
  videoUrl: string;
  setVideoUrl: Dispatch<SetStateAction<string>>;
  videoProductName: string;
  setVideoProductName: Dispatch<SetStateAction<string>>;
  videoSceneBackground: string;
  setVideoSceneBackground: Dispatch<SetStateAction<string>>;
  videoSubtitleMode: string;
  setVideoSubtitleMode: Dispatch<SetStateAction<string>>;
  videoVoiceStyle: string;
  setVideoVoiceStyle: Dispatch<SetStateAction<string>>;
  videoShotCount: number;
  setVideoShotCount: Dispatch<SetStateAction<number>>;
  videoDurationSeconds: number;
  setVideoDurationSeconds: Dispatch<SetStateAction<number>>;
  videoCustomRequirement: string;
  setVideoCustomRequirement: Dispatch<SetStateAction<string>>;
  videoAssetRefs: string[];
  selectedVideoDimensions: string[];
  toggleVideoDimension: (dimension: string) => void;
  videoBreakdown: VideoBreakdownResult | null;
  videoScript: VideoScriptGenerationResult | null;
  videoBreakdownLogs: GenerationLogEntry[];
  videoScriptLogs: GenerationLogEntry[];
  activeScenes: SceneCard[];
  suggestedVideoPrompt: string;
  mediaResult: MediaGenerationResult | null;
  onRevealPath: (path: string) => void;
  onExportAsset: (path: string) => void;
  onSelectProductImages: () => void;
  onSelectReferenceImages: () => void;
  onSelectVideo: () => void;
  onAnalyzeReferenceVideo: () => void;
  onUseVideoBreakdownLog: (log: GenerationLogEntry) => void;
  onUseVideoScriptLog: (log: GenerationLogEntry) => void;
  onOpenVideoLog: (log: GenerationLogEntry) => void;
  onUpdateVideoScriptReview: (input: Omit<UpdateGenerationLogReviewInput, 'workspacePath'>) => void | Promise<void>;
  onGenerateVideoScript: () => void;
  onEvaluateVideoScript: (script: VideoScriptGenerationResult, log?: GenerationLogEntry) => void | Promise<void>;
  onRewriteVideoScriptShot: (script: VideoScriptGenerationResult, rowIndex: number, log?: GenerationLogEntry) => void | Promise<void>;
  onOpenVideoPromptHandoff: () => void;
  onOpenVideoImport: () => void;
  onGenerateVideo: () => void;
}

export function VideoModule({
  initialStage = 'breakdown',
  busy,
  workspaceReady,
  productImageRefs,
  referenceImageRefs,
  videoUrl,
  setVideoUrl,
  videoProductName,
  setVideoProductName,
  videoSceneBackground,
  setVideoSceneBackground,
  videoSubtitleMode,
  setVideoSubtitleMode,
  videoVoiceStyle,
  setVideoVoiceStyle,
  videoShotCount,
  setVideoShotCount,
  videoDurationSeconds,
  setVideoDurationSeconds,
  videoCustomRequirement,
  setVideoCustomRequirement,
  videoAssetRefs,
  selectedVideoDimensions,
  toggleVideoDimension,
  videoBreakdown,
  videoScript,
  videoBreakdownLogs,
  videoScriptLogs,
  activeScenes,
  suggestedVideoPrompt,
  mediaResult,
  onRevealPath,
  onExportAsset,
  onSelectProductImages,
  onSelectReferenceImages,
  onSelectVideo,
  onAnalyzeReferenceVideo,
  onUseVideoBreakdownLog,
  onUseVideoScriptLog,
  onOpenVideoLog,
  onUpdateVideoScriptReview,
  onGenerateVideoScript,
  onEvaluateVideoScript,
  onRewriteVideoScriptShot,
  onOpenVideoPromptHandoff,
  onOpenVideoImport,
  onGenerateVideo,
}: VideoModuleProps) {
  const [activeStage, setActiveStage] = useState<VideoStage>(initialStage);
  const [featureSearch, setFeatureSearch] = useState('');
  const [featureTypeFilter, setFeatureTypeFilter] = useState<(typeof FEATURE_TYPE_OPTIONS)[number]>('全部');
  const [hookTypeFilter, setHookTypeFilter] = useState<(typeof HOOK_TYPE_OPTIONS)[number]>('全部');
  const [featureStatusFilter, setFeatureStatusFilter] = useState<FeatureStatusFilter>('active');
  const [selectedFeatureLogId, setSelectedFeatureLogId] = useState('');
  const [scriptSearch, setScriptSearch] = useState('');
  const [scriptScoreFilter, setScriptScoreFilter] = useState<'all' | 'excellent' | 'medium' | 'weak'>('all');
  const [selectedScriptLogId, setSelectedScriptLogId] = useState('');
  const [scriptHistoryPage, setScriptHistoryPage] = useState(1);
  const [scriptFeedbackDrafts, setScriptFeedbackDrafts] = useState<Record<string, string>>({});
  const [copiedShotKey, setCopiedShotKey] = useState('');
  const [copiedSegmentKey, setCopiedSegmentKey] = useState('');
  const [copiedAssetPromptKey, setCopiedAssetPromptKey] = useState('');

  const sourceCount = videoAssetRefs.length + (videoUrl.trim() ? 1 : 0);
  const imageMaterialRefs = useMemo(
    () => [...productImageRefs, ...referenceImageRefs],
    [productImageRefs, referenceImageRefs],
  );
  const featureItems = useMemo(
    () => videoBreakdownLogs.map((log) => ({ log, breakdown: breakdownFromLog(log) })).filter((item): item is { log: GenerationLogEntry; breakdown: VideoBreakdownResult } => Boolean(item.breakdown)),
    [videoBreakdownLogs],
  );
  const scriptItems = useMemo(
    () => videoScriptLogs.map((log) => ({ log, script: scriptFromLog(log) })).filter((item): item is { log: GenerationLogEntry; script: VideoScriptGenerationResult } => Boolean(item.script)),
    [videoScriptLogs],
  );
  const featureTitleByLogId = useMemo(() => new Map(featureItems.map(({ log, breakdown }) => [
    log.id,
    breakdown.contentTitle || log.title,
  ])), [featureItems]);
  const scriptReady = isScriptReady(videoScript);
  const readyScript = scriptReady ? videoScript : null;
  const storyboardShots = readyScript ? readyScript.storyboard : [];
  const productionSegments = useMemo(
    () => buildProductionSegments(storyboardShots, readyScript?.resourceFramework),
    [readyScript, storyboardShots],
  );
  const characterPromptItems = useMemo(
    () => buildCharacterPromptItems(readyScript?.resourceFramework),
    [readyScript],
  );
  const scenePromptItems = useMemo(
    () => buildScenePromptItems(readyScript?.resourceFramework),
    [readyScript],
  );
  const productionReviewItems = useMemo(
    () => buildVideoProductionReviewItems(readyScript),
    [readyScript],
  );
  const productionDeliveryItems = useMemo(
    () => buildVideoProductionDeliveryItems({
      characterPromptCount: characterPromptItems.length,
      scenePromptCount: scenePromptItems.length,
      segmentCount: productionSegments.length,
      hasScript: scriptReady,
    }),
    [characterPromptItems.length, scenePromptItems.length, productionSegments.length, scriptReady],
  );
  const hasVideoMaterial = imageMaterialRefs.length > 0 || videoAssetRefs.length > 0;
  const breakdownHookElements = videoBreakdown?.hook?.elements ?? [];
  const breakdownStages = videoBreakdown?.narrative?.stages ?? [];
  const breakdownRhythm = videoBreakdown?.pacing?.rhythm ?? [];
  const breakdownTranscriptSegments = videoBreakdown?.transcriptSegments ?? [];
  const breakdownWarnings = videoBreakdown?.warnings ?? [];
  const activeFeatureItem = featureItems.find((item) => item.log.id === selectedFeatureLogId)
    ?? featureItems.find((item) => item.breakdown.logId === videoBreakdown?.logId)
    ?? featureItems[0];
  const selectedScriptItem = scriptItems.find((item) => item.log.id === selectedScriptLogId) ?? scriptItems[0];
  const currentScriptQualityRows = readyScript ? scriptQualityRows(readyScript) : [];
  const currentBreakdownReferenceScore = resolvedReferenceScore(videoBreakdown);
  const selectedScriptReviewNote = selectedScriptItem
    ? scriptFeedbackDrafts[selectedScriptItem.log.id] ?? selectedScriptItem.log.review?.note ?? ''
    : '';
  const scriptAgentMessages = useMemo(() => {
    const templateLabel = videoBreakdown
      ? `${videoBreakdown.contentTitle || '当前爆款模板'} / ${hookLabel(videoBreakdown.hook?.hookType?.value)} / ${narrativeLabel(videoBreakdown.narrative?.framework?.value)}`
      : '未选择爆款模板';
    const brief = [
      `产品：${videoProductName || '未填写'}`,
      `模板：${templateLabel}`,
      `场景：${videoSceneBackground || '未填写'}`,
      `字幕：${videoSubtitleMode}`,
      `语音：${videoVoiceStyle || '未填写'}`,
      `镜头：${videoShotCount} 个 / ${videoDurationSeconds} 秒`,
      `素材：${imageMaterialRefs.length} 张图片`,
      videoCustomRequirement ? `改写要求：${videoCustomRequirement}` : '',
    ].filter(Boolean).join('\n');
    const messages = [{
      id: 'video-script-brief',
      role: 'user',
      content: brief,
      createdAt: new Date(0).toISOString(),
    }];
    if (readyScript) {
      messages.push({
        id: `video-script-result:${readyScript.logId}`,
        role: 'assistant',
        content: [
          `已生成 ${storyboardShots.length} 个镜头，质量评分 ${scriptTotalScore(readyScript).toFixed(1)}/10。`,
          '',
          readyScript.title,
          '',
          readyScript.script,
        ].join('\n'),
        createdAt: new Date().toISOString(),
      });
    } else if (videoScript) {
      messages.push({
        id: `video-script-blocked:${videoScript.logId}`,
        role: 'assistant',
        content: [
          videoScript.title,
          '',
          videoScript.script || videoScript.error || '文字模型未配置，未生成本地模板。',
        ].join('\n'),
        createdAt: new Date().toISOString(),
      });
    }
    return messages;
  }, [imageMaterialRefs.length, readyScript, storyboardShots.length, videoBreakdown, videoCustomRequirement, videoDurationSeconds, videoProductName, videoSceneBackground, videoScript, videoShotCount, videoSubtitleMode, videoVoiceStyle]);
  const handoffAgentMessages = useMemo(() => {
    const brief = [
      `脚本：${readyScript ? readyScript.title : '未生成'}`,
      `素材：${imageMaterialRefs.length + videoAssetRefs.length} 个`,
      `角色参考图：${characterPromptItems.length} 个`,
      `场景背景图：${scenePromptItems.length} 个`,
      `外部生成段落：${readyScript ? productionSegments.length || readyScript.storyboard.length : 0} 段`,
      `审核项：${productionReviewItems.length} 项`,
    ].join('\n');
    const messages = [{
      id: 'video-handoff-brief',
      role: 'user',
      content: brief,
      createdAt: new Date(0).toISOString(),
    }];
    if (readyScript) {
      messages.push({
        id: `video-handoff-result:${readyScript.logId}`,
        role: 'assistant',
        content: [
          '已整理视频 Prompt 交接包。',
          '',
          `下一步复制 ${productionSegments.length || readyScript.storyboard.length} 段镜头 Prompt 到外部视频平台，生成后手动导入成品视频。`,
          productionDeliveryItems.map((item) => `- ${item.title}：${item.detail}`).join('\n'),
        ].join('\n'),
        createdAt: new Date().toISOString(),
      });
    }
    return messages;
  }, [characterPromptItems.length, imageMaterialRefs.length, productionDeliveryItems, productionReviewItems.length, productionSegments.length, readyScript, scenePromptItems.length, videoAssetRefs.length]);

  const filteredFeatures = featureItems.filter(({ log, breakdown }) => {
    const query = featureSearch.trim().toLowerCase();
    const title = `${breakdown.contentTitle || log.title} ${log.summary || ''} ${sourceTitle(log)} ${breakdown.summary}`.toLowerCase();
    const featureType = featureTypeForBreakdown(breakdown);
    const hook = hookLabel(breakdown.hook?.hookType?.value);
    const matchesSearch = !query || title.includes(query);
    const matchesFeatureType = featureTypeFilter === '全部' || featureTypeLabel(featureType) === featureTypeFilter;
    const matchesHook = hookTypeFilter === '全部' || hook.includes(hookTypeFilter);
    const matchesStatus =
      featureStatusFilter === 'all'
      || (featureStatusFilter === 'active' && !isArchivedFeature(log))
      || (featureStatusFilter === 'featured' && isFeaturedFeature(log))
      || (featureStatusFilter === 'archived' && isArchivedFeature(log));
    return matchesSearch && matchesFeatureType && matchesHook && matchesStatus;
  }).sort((a, b) => {
    const rankDelta = featureReviewRank(a.log) - featureReviewRank(b.log);
    if (rankDelta !== 0) return rankDelta;
    return b.log.createdAt.localeCompare(a.log.createdAt);
  });

  const filteredScripts = scriptItems.filter(({ log, script }) => {
    const query = scriptSearch.trim().toLowerCase();
    const product = inputString(log, 'productName') || inputString(log, 'productDesc');
    const templateTitle = featureTitleByLogId.get(linkedBreakdownLogId(log)) ?? '';
    const haystack = `${script.title} ${product} ${templateTitle} ${log.summary || ''} ${script.script}`.toLowerCase();
    const totalScore = scriptTotalScore(script);
    const matchesSearch = !query || haystack.includes(query);
    const matchesScore =
      scriptScoreFilter === 'all'
      || (scriptScoreFilter === 'excellent' && totalScore >= 7)
      || (scriptScoreFilter === 'medium' && totalScore >= 5 && totalScore < 7)
      || (scriptScoreFilter === 'weak' && totalScore < 5);
    return matchesSearch && matchesScore;
  });
  const visibleScripts = filteredScripts.slice(0, scriptHistoryPage * SCRIPT_HISTORY_PAGE_SIZE);
  const hasMoreScripts = visibleScripts.length < filteredScripts.length;
  const groupedVisibleScripts = visibleScripts.reduce<Array<{ label: string; items: typeof visibleScripts }>>((groups, item) => {
    const label = dateGroupLabel(item.log.createdAt);
    const lastGroup = groups[groups.length - 1];
    if (lastGroup?.label === label) {
      lastGroup.items.push(item);
    } else {
      groups.push({ label, items: [item] });
    }
    return groups;
  }, []);

  useEffect(() => {
    setActiveStage(initialStage);
  }, [initialStage]);

  useEffect(() => {
    if (!selectedFeatureLogId && featureItems.length) setSelectedFeatureLogId(featureItems[0].log.id);
  }, [featureItems, selectedFeatureLogId]);

  useEffect(() => {
    if (!selectedScriptLogId && scriptItems.length) setSelectedScriptLogId(scriptItems[0].log.id);
  }, [scriptItems, selectedScriptLogId]);

  useEffect(() => {
    setScriptHistoryPage(1);
  }, [scriptSearch, scriptScoreFilter]);

  const stageTabs: Array<{ key: VideoStage; title: string; text: string }> = [
    { key: 'breakdown', title: '分析控制台', text: '导入已授权视频并解析结构' },
    { key: 'library', title: '爆款特征库', text: '沉淀可复用结构资产' },
    { key: 'script', title: '脚本改写', text: '选择模板并生成新脚本' },
    { key: 'history', title: '脚本历史', text: '检索已生成脚本和评分' },
    { key: 'generate', title: 'Prompt 交接', text: '复制外部平台并手动导入成品' },
  ];

  async function copyStoryboardPrompt(logId: string, shot: VideoStoryboardShot): Promise<void> {
    const promptText = [
      `镜头 ${shot.shot} · ${shot.timeRange || shot.duration || '未标注时间'}`,
      shot.visual ? `画面：${shot.visual}` : '',
      shot.voiceover ? `口播：${shot.voiceover}` : '',
      shot.subtitle ? `字幕：${shot.subtitle}` : '',
      shot.imagePrompt ? `图片 Prompt：${shot.imagePrompt}` : '',
      shot.videoPrompt ? `视频 Prompt：${shot.videoPrompt}` : '',
    ].filter(Boolean).join('\n');
    await navigator.clipboard.writeText(promptText);
    const key = `${logId}-${shot.shot}`;
    setCopiedShotKey(key);
    window.setTimeout(() => setCopiedShotKey((current) => (current === key ? '' : current)), 1400);
  }

  async function copyProductionSegmentPrompt(segment: VideoProductionSegment): Promise<void> {
    await navigator.clipboard.writeText(segment.prompt);
    setCopiedSegmentKey(segment.id);
    window.setTimeout(() => setCopiedSegmentKey((current) => (current === segment.id ? '' : current)), 1400);
  }

  async function copyAssetPrompt(key: string, prompt: string): Promise<void> {
    await navigator.clipboard.writeText(prompt);
    setCopiedAssetPromptKey(key);
    window.setTimeout(() => setCopiedAssetPromptKey((current) => (current === key ? '' : current)), 1400);
  }

  return (
    <section className="video-replica-workbench">
      <header className="video-replica-header">
        <div>
          <p className="eyebrow">视频素材</p>
          <h3>爆款视频拆解与脚本工厂</h3>
          <p>导入已授权参考视频，沉淀爆款特征，再跨品类改写为本方产品脚本、分镜和可追溯视频 Prompt。</p>
        </div>
        <span className="status-pill">{featureItems.length} 个特征 / {scriptItems.length} 条脚本</span>
      </header>

      <nav className="video-stage-tabs" aria-label="爆款视频工作流">
        {stageTabs.map((stage) => (
          <button
            key={stage.key}
            className={activeStage === stage.key ? 'active' : ''}
            onClick={() => setActiveStage(stage.key)}
          >
            <strong>{stage.title}</strong>
            <span>{stage.text}</span>
          </button>
        ))}
      </nav>

      {activeStage === 'breakdown' ? (
        <div className="video-stage-layout breakdown">
          <article className="video-card video-source-card">
            <div className="video-card-title">
              <div>
                <h4>参考视频导入</h4>
                <p>仅处理用户有权使用的参考视频；真实拆解由视频理解服务完成。</p>
              </div>
              <span>{sourceCount} 个来源</span>
            </div>
            <button className="video-drop-zone" onClick={onSelectVideo}>
              <span>⇧</span>
              <strong>上传本地视频</strong>
              <small>MP4 / MOV / WEBM，直接交给多模态模型拆解</small>
            </button>
            {videoAssetRefs.length ? (
              <div className="video-file-list">
                {videoAssetRefs.map((ref) => (
                  <b key={ref}>{fileNameFromPath(ref)}</b>
                ))}
              </div>
            ) : null}
            <label>
              <span>视频链接</span>
              <div className="video-inline-field">
                <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="粘贴已授权视频链接，仅作为来源记录" />
                <span className="video-inline-status">不下载</span>
              </div>
            </label>
            <div className="video-mode-card">
              <strong>自动沉淀</strong>
              <p>拆解成功后会写入本地运行日志，并在“爆款特征库”中成为可复用模板。</p>
            </div>
          </article>

          <article className="video-card video-breakdown-card">
            <div className="video-card-title">
              <div>
                <h4>片段拆解结果</h4>
                <p>返回 Hook、叙事、节奏、资源框架、转写和五维爆款评分。</p>
              </div>
              <div className="video-card-actions">
                <span>{selectedVideoDimensions.length}/{VIDEO_DIMENSIONS.length}</span>
                <button
                  className="ghost small"
                  onClick={() => VIDEO_DIMENSIONS.forEach((dimension) => {
                    if (!selectedVideoDimensions.includes(dimension)) toggleVideoDimension(dimension);
                  })}
                >
                  全选
                </button>
              </div>
            </div>
            <div className="video-dimension-grid">
              {VIDEO_DIMENSIONS.map((dimension) => (
                <button
                  key={dimension}
                  className={selectedVideoDimensions.includes(dimension) ? 'active' : ''}
                  onClick={() => toggleVideoDimension(dimension)}
                >
                  <strong>{dimension}</strong>
                  <span>{dimension.slice(0, 4)}...</span>
                  <em />
                </button>
              ))}
            </div>
            <div className="video-summary-row">
              <span><strong>当前拆解模式</strong>{selectedVideoDimensions.length ? '智能拆解' : '未选择维度'}</span>
              <span><strong>参考指数</strong>{scoreLabel(currentBreakdownReferenceScore)}</span>
              <span><strong>返回片段数</strong>{videoBreakdown?.segments.length ?? 0} 个片段</span>
            </div>
            <button className="primary wide" disabled={busy || !workspaceReady} onClick={onAnalyzeReferenceVideo}>智能拆解</button>

            {videoBreakdown ? (
              <div className="video-breakdown-report">
                <section className="video-score-strip">
                  <span><strong>分析可信度</strong>{percentLabel(videoBreakdown.confidenceRate)}</span>
                  <span><strong>策略丰富度</strong>{percentLabel(videoBreakdown.richnessRate)}</span>
                  <span><strong>原片时长</strong>{videoBreakdown.durationSec ? secondLabel(videoBreakdown.durationSec) : '未返回'}</span>
                  <span><strong>转写片段</strong>{breakdownTranscriptSegments.length} 条</span>
                </section>

                {videoBreakdown.viralScores ? (
                  <section className="video-breakdown-section">
                    <div className="video-breakdown-heading">
                      <strong>爆款五维评分</strong>
                      <span>{scoreLabel(currentBreakdownReferenceScore)} / 10</span>
                    </div>
                    <div className="video-sub-score-list">
                      {scoreRows(videoBreakdown).map((row) => (
                        <div key={row.key} className="video-sub-score-row" title={row.reason}>
                          <span>{row.label}</span>
                          <i><b style={{ width: `${Math.min(100, Math.max(0, row.value ?? 0) * 10)}%` }} /></i>
                          <em>{typeof row.value === 'number' ? row.value.toFixed(1) : '-'}</em>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                <section className="video-breakdown-section">
                  <div className="video-breakdown-heading">
                    <strong>{videoBreakdown.contentTitle || '拆解结构报告'}</strong>
                    <span>{hookLabel(videoBreakdown.hook?.hookType?.value)}</span>
                  </div>
                  <p>{videoBreakdown.summary}</p>
                  {videoBreakdown.narrative?.framework ? (
                    <p>
                      叙事框架：{narrativeLabel(videoBreakdown.narrative.framework.value)}
                      （{percentLabel(videoBreakdown.narrative.framework.confidence)}）
                    </p>
                  ) : null}
                </section>

                {breakdownHookElements.length ? (
                  <section className="video-breakdown-section">
                    <div className="video-breakdown-heading">
                      <strong>Hook 构成</strong>
                      <span>{breakdownHookElements.length} 项</span>
                    </div>
                    <div className="video-breakdown-list">
                      {breakdownHookElements.slice(0, 4).map((element, index) => (
                        <article key={`${element.timestampRange}-${element.name}-${index}`}>
                          <b>{element.timestampRange || '未标注时间'} · {element.name}</b>
                          <p>{element.description}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {breakdownStages.length ? (
                  <section className="video-breakdown-section">
                    <div className="video-breakdown-heading">
                      <strong>叙事阶段</strong>
                      <span>{breakdownStages.length} 段</span>
                    </div>
                    <div className="video-breakdown-list">
                      {breakdownStages.slice(0, 5).map((stage, index) => (
                        <article key={`${stage.timeRange}-${stage.name}-${index}`}>
                          <b>{stage.timeRange || '未标注时间'} · {stage.name}</b>
                          <p>{stage.description}{stage.emotionShift ? `；${stage.emotionShift}` : ''}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {breakdownRhythm.length ? (
                  <section className="video-breakdown-section">
                    <div className="video-breakdown-heading">
                      <strong>节奏与镜头</strong>
                      <span>{breakdownRhythm.length} 镜头</span>
                    </div>
                    <div className="video-shot-table">
                      {breakdownRhythm.slice(0, 10).map((item, index) => (
                        <article key={`${item.timeRange}-${index}`}>
                          <b>{item.timeRange || `镜头 ${index + 1}`}</b>
                          <span>{SHOT_LABELS[item.shotType] || item.shotType} / 强度 {item.intensity}</span>
                          <p>{item.description}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : (
                  <section className="video-breakdown-section">
                    <div className="video-breakdown-heading">
                      <strong>片段拆解</strong>
                      <span>{videoBreakdown.segments.length} 段</span>
                    </div>
                    <div className="video-shot-table">
                      {videoBreakdown.segments.slice(0, 10).map((segment, index) => (
                        <article key={`${segment.timeRange}-${index}`}>
                          <b>{segment.timeRange}</b>
                          <span>{segment.hook}</span>
                          <p>{segment.visual}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                )}

                {breakdownTranscriptSegments.length ? (
                  <section className="video-breakdown-section">
                    <div className="video-breakdown-heading">
                      <strong>口播转写摘录</strong>
                      <span>{breakdownTranscriptSegments.length} 条</span>
                    </div>
                    <div className="video-transcript-list">
                      {breakdownTranscriptSegments.slice(0, 6).map((segment, index) => (
                        <p key={`${segment.startSec}-${index}`}>
                          <b>{secondLabel(segment.startSec)}-{secondLabel(segment.endSec)}</b>
                          {segment.text}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : null}

                {videoBreakdown.resourceFramework ? (
                  <section className="video-breakdown-section">
                    <div className="video-breakdown-heading">
                      <strong>资源框架</strong>
                      <span>
                        {videoBreakdown.resourceFramework.characters.length} 角色 / {videoBreakdown.resourceFramework.scenes.length} 场景
                      </span>
                    </div>
                    <div className="video-resource-framework-list">
                      {videoBreakdown.resourceFramework.characters.slice(0, 4).map((character) => (
                        <article key={`character-${character.name}`}>
                          <b>角色：{character.name} · {character.shotCount} 镜</b>
                          <p>{character.voiceTraits || '未返回音色'}{character.threeViewPrompt ? `；${character.threeViewPrompt}` : ''}</p>
                        </article>
                      ))}
                      {videoBreakdown.resourceFramework.scenes.slice(0, 4).map((scene) => (
                        <article key={`scene-${scene.name}`}>
                          <b>场景：{scene.name} · {scene.shotCount} 镜</b>
                          <p>{scene.environment || '未返回环境'}{scene.lighting ? `；${scene.lighting}` : ''}</p>
                        </article>
                      ))}
                    </div>
                  </section>
                ) : null}

                {videoBreakdown.risks.length || breakdownWarnings.length ? (
                  <section className="video-breakdown-section">
                    <div className="video-breakdown-heading">
                      <strong>风险与恢复路径</strong>
                      <span>{videoBreakdown.risks.length + breakdownWarnings.length} 项</span>
                    </div>
                    <div className="video-risk-list">
                      {videoBreakdown.risks.map((risk, index) => (
                        <p key={`${risk.level}-${index}`} className={`risk-${risk.level}`}>
                          <b>{risk.level}</b>{risk.message}
                        </p>
                      ))}
                      {breakdownWarnings.map((warning, index) => (
                        <p key={`warning-${index}`} className="risk-warning">
                          <b>warning</b>{warning}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : null}
              </div>
            ) : null}
          </article>
        </div>
      ) : null}

      {activeStage === 'library' ? (
        <div className="video-stage-layout library">
          <aside className="video-card video-library-filter">
            <div className="video-card-title">
              <div>
                <h4>筛选条件</h4>
                <p>成功拆解日志会自动进入特征库，不需要另存数据库。</p>
              </div>
              <span>{filteredFeatures.length}/{featureItems.length}</span>
            </div>
            <label>
              <span>自然语言搜索</span>
              <input value={featureSearch} onChange={(event) => setFeatureSearch(event.target.value)} placeholder="例如：快节奏提问式开场" />
            </label>
            <div className="video-filter-group">
              <strong>特征类型</strong>
              <div>
                {FEATURE_TYPE_OPTIONS.map((item) => (
                  <button key={item} className={featureTypeFilter === item ? 'active' : ''} onClick={() => setFeatureTypeFilter(item)}>{item}</button>
                ))}
              </div>
            </div>
            <div className="video-filter-group">
              <strong>钩子类型</strong>
              <div>
                {HOOK_TYPE_OPTIONS.map((item) => (
                  <button key={item} className={hookTypeFilter === item ? 'active' : ''} onClick={() => setHookTypeFilter(item)}>{item}</button>
                ))}
              </div>
            </div>
            <div className="video-filter-group">
              <strong>特征状态</strong>
              <div>
                {FEATURE_STATUS_OPTIONS.map((item) => (
                  <button key={item.key} className={featureStatusFilter === item.key ? 'active' : ''} onClick={() => setFeatureStatusFilter(item.key)}>{item.label}</button>
                ))}
              </div>
            </div>
          </aside>

          <section className="video-feature-grid">
            {filteredFeatures.length ? filteredFeatures.map(({ log, breakdown }) => {
              const featureType = featureTypeForBreakdown(breakdown);
              const referenceScore = resolvedReferenceScore(breakdown);
              return (
                <article key={log.id} className={`video-feature-card ${activeFeatureItem?.log.id === log.id ? 'active' : ''}`} onClick={() => setSelectedFeatureLogId(log.id)}>
                  <div className="video-feature-card-head">
                    <span>{featureTypeLabel(featureType)}</span>
                    <small>{dateLabel(log.createdAt)}</small>
                  </div>
                  <h4>{breakdown.contentTitle || log.title}</h4>
                  <p>{breakdown.summary}</p>
                  <div className="video-feature-tags">
                    {isFeaturedFeature(log) ? <span className="featured">精选</span> : null}
                    {isArchivedFeature(log) ? <span className="archived">已归档</span> : null}
                    <span>{hookLabel(breakdown.hook?.hookType?.value)}</span>
                    <span>{narrativeLabel(breakdown.narrative?.framework?.value)}</span>
                    <span>{breakdown.pacing?.rhythm.length || breakdown.segments.length} 镜</span>
                    <span>{sourceTitle(log)}</span>
                  </div>
                  <div className={`video-feature-score ${typeof referenceScore === 'number' ? '' : 'empty'}`}>
                    <strong>{scoreLabel(referenceScore)}</strong>
                    <span>爆款指数</span>
                  </div>
                  <div className="video-sub-score-list compact">
                    {scoreRows(breakdown).map((row) => (
                      <div key={row.key} className="video-sub-score-row" title={row.reason}>
                        <span>{row.label}</span>
                        <i><b style={{ width: `${Math.min(100, Math.max(0, row.value ?? 0) * 10)}%` }} /></i>
                        <em>{typeof row.value === 'number' ? row.value.toFixed(1) : '-'}</em>
                      </div>
                    ))}
                  </div>
                  <div className="video-feature-actions">
                    <button
                      className="ghost small"
                      onClick={(event) => {
                        event.stopPropagation();
                        onOpenVideoLog(log);
                      }}
                    >
                      查看追溯
                    </button>
                    <button
                      className="primary small"
                      onClick={(event) => {
                        event.stopPropagation();
                        onUseVideoBreakdownLog(log);
                        setSelectedFeatureLogId(log.id);
                        setActiveStage('script');
                      }}
                    >
                      用作脚本模板
                    </button>
                  </div>
                </article>
              );
            }) : (
              <div className="video-placeholder tall">
                <strong>还没有爆款特征</strong>
                <p>先在分析控制台上传参考视频并完成真实拆解，成功日志会自动沉淀为可复用特征。</p>
              </div>
            )}
          </section>

          <aside className="video-card video-feature-detail">
            <div className="video-card-title">
              <div>
                <h4>特征详情</h4>
                <p>对应 ScriptAI 的特征详情页，数据来自本地拆解日志。</p>
              </div>
            </div>
            {activeFeatureItem ? (
              <VideoFeatureDetailPanel
                item={activeFeatureItem}
                onOpenLog={onOpenVideoLog}
                onUseTemplate={(log) => {
                  onUseVideoBreakdownLog(log);
                  setActiveStage('script');
                }}
                onUpdateReview={(input) => void onUpdateVideoScriptReview(input)}
              />
            ) : (
              <VideoFeatureDetailPanel
                onOpenLog={onOpenVideoLog}
                onUseTemplate={(log) => {
                  onUseVideoBreakdownLog(log);
                  setActiveStage('script');
                }}
                onUpdateReview={(input) => void onUpdateVideoScriptReview(input)}
              />
            )}
          </aside>
        </div>
      ) : null}

      {activeStage === 'script' ? (
        <div className="video-stage-layout script">
          <article className="video-card video-product-card">
            <div className="video-card-title">
              <div>
                <h4>脚本改写参数</h4>
                <p>选择爆款模板并输入新商品信息，模型会跨品类迁移结构，不照搬原视频。</p>
              </div>
            </div>
            <div className="video-template-summary compact">
              {videoBreakdown ? (
                <>
                  <strong>{videoBreakdown.contentTitle || '当前爆款模板'}</strong>
                  <span>{hookLabel(videoBreakdown.hook?.hookType?.value)} · {narrativeLabel(videoBreakdown.narrative?.framework?.value)}</span>
                  <p>{videoBreakdown.summary}</p>
                  <button className="ghost small" onClick={() => setActiveStage('library')}>重新选择模板</button>
                </>
              ) : (
                <>
                  <strong>未选择爆款模板</strong>
                  <p>可以先去特征库选择模板；未选择时只基于产品信息和知识库生成，不伪装复刻参考视频。</p>
                  <button className="ghost small" onClick={() => setActiveStage('library')}>打开爆款特征库</button>
                </>
              )}
            </div>
            <div className="video-form-grid">
              <label><span>产品名称</span><input value={videoProductName} onChange={(event) => setVideoProductName(event.target.value)} placeholder="填写产品名称" /></label>
              <label>
                <span>场景背景</span>
                <select value={videoSceneBackground} onChange={(event) => setVideoSceneBackground(event.target.value)}>
                  <option value="智能场景">智能场景</option>
                  <option value="居家场景">居家场景</option>
                  <option value="户外场景">户外场景</option>
                  <option value="电商直播">电商直播</option>
                </select>
              </label>
              <label>
                <span>字幕选择</span>
                <select value={videoSubtitleMode} onChange={(event) => setVideoSubtitleMode(event.target.value)}>
                  <option value="burned-subtitle">内嵌字幕</option>
                  <option value="caption-file">输出字幕文件</option>
                  <option value="no-subtitle">无字幕</option>
                </select>
              </label>
              <label><span>视频语音</span><input value={videoVoiceStyle} onChange={(event) => setVideoVoiceStyle(event.target.value)} placeholder="自然可信 / 种草感 / 专业讲解" /></label>
            </div>
            <label><span>目标商品信息与改写要求</span><textarea value={videoCustomRequirement} onChange={(event) => setVideoCustomRequirement(event.target.value)} placeholder="填写商品卖点、价格、使用场景、禁用表述和额外要求" /></label>
            <div className="video-upload-callout">
              <div>
                <strong>上传产品图</strong>
                <label className="video-check"><input type="checkbox" readOnly checked={imageMaterialRefs.length > 0} /> 参考产品图背景</label>
              </div>
              <button className="ghost small" onClick={onSelectProductImages}>选择图片</button>
            </div>
            <button className="primary wide" disabled={busy || !workspaceReady} onClick={onGenerateVideoScript}>生成分镜脚本</button>
          </article>

          <article className="video-card video-script-agent-card">
            <div className="video-card-title">
              <div>
                <h4>脚本协作</h4>
                <p>把模板、商品、素材和分镜约束整理成可执行的生成任务。</p>
              </div>
              <span className={`status-pill ${busy ? 'warning' : scriptReady ? 'ready' : videoScript ? 'blocked' : 'idle'}`}>
                {busy ? '生成中' : scriptReady ? '已产出' : videoScript ? '待配置' : '待开始'}
              </span>
            </div>
            <div className="video-script-agent-strip">
              <div>
                <span>模板</span>
                <strong>{videoBreakdown ? '已关联' : '未选择'}</strong>
              </div>
              <div>
                <span>素材</span>
                <strong>{imageMaterialRefs.length}</strong>
              </div>
              <div>
                <span>镜头</span>
                <strong>{storyboardShots.length || videoShotCount}</strong>
              </div>
              <div>
                <span>评分</span>
                <strong>{scriptReady ? scriptTotalScore(videoScript).toFixed(1) : '-'}</strong>
              </div>
            </div>
            <div className="video-script-agent-thread" aria-label="视频脚本协作记录">
              <AgentTimeline
                messages={scriptAgentMessages}
                runningLabel={busy ? '正在整理商品脚本、镜头和生产 Prompt。' : undefined}
                messageMeta={() => null}
                messageTitle={(message) => message.role === 'assistant' ? '脚本结果' : '任务简报'}
                messagePreview={(message) => message.content}
              />
            </div>
            <div className="video-script-agent-next-action">
              <strong>{scriptReady ? '下一步：质检脚本或进入 Prompt 交接' : videoScript ? '下一步：配置文字模型后重试' : '下一步：生成分镜脚本'}</strong>
              <p>{scriptReady ? '复核质量评分、镜头 Prompt 和禁用表达，再把素材清单交接给外部生成平台。' : videoScript ? '当前未生成本地模板；请进入模型设置补齐文字模型后重新生成。' : '先确认左侧模板、商品信息和素材，再生成可追溯的新视频脚本。'}</p>
              <button className="primary small" disabled={busy || !workspaceReady} onClick={onGenerateVideoScript}>
                {scriptReady || videoScript ? '重新生成脚本' : '按当前参数生成'}
              </button>
            </div>
          </article>

          <article className="video-card video-script-card">
            <div className="video-script-toolbar">
              <h4>新视频脚本</h4>
              <label><span>镜头</span><input type="number" min={1} max={80} value={videoShotCount} onChange={(event) => setVideoShotCount(Math.min(80, Math.max(1, Number(event.target.value) || 1)))} /></label>
              <label><span>时间</span><input type="number" min={5} max={300} value={videoDurationSeconds} onChange={(event) => setVideoDurationSeconds(Math.min(300, Math.max(5, Number(event.target.value) || 5)))} /></label>
            </div>
            {videoBreakdown ? (
              <div className="video-sync-note">
                已关联参考视频时间轴：{breakdownRhythm.length || videoBreakdown.segments.length} 镜 / {videoBreakdown.durationSec ? secondLabel(videoBreakdown.durationSec) : `${videoDurationSeconds}s`}
              </div>
            ) : null}
            <div className="video-script-preview">
              <article>
                <strong>{videoScript?.title || '新视频脚本内容'}</strong>
                <span>{scriptReady ? '已生成' : videoScript ? '未完成' : '待生成'}</span>
                <p>{videoScript?.script || '等待生成新视频脚本'}</p>
              </article>
              {currentScriptQualityRows.length ? (
                <div className="video-eval-panel">
                  <div className="video-eval-title">
                    <strong>脚本质量检查 · {scriptQualitySourceLabel(readyScript)}</strong>
                    <span>{scriptTotalScore(readyScript).toFixed(1)}/10</span>
                    {readyScript ? (
                      <button className="ghost tiny" disabled={busy} onClick={() => void onEvaluateVideoScript(readyScript)}>AI 质检</button>
                    ) : null}
                  </div>
                  {currentScriptQualityRows.map((row) => (
                    <div key={row.key} className="video-sub-score-row" title={row.reason}>
                      <span>{row.label}</span>
                      <i><b style={{ width: `${Math.min(100, Math.max(0, row.score) * 10)}%` }} /></i>
                      <em>{row.score.toFixed(1)}</em>
                    </div>
                  ))}
                  {videoScript?.evaluation?.suggestions.length ? (
                    <div className="video-eval-suggestions">
                      {videoScript.evaluation.suggestions.map((suggestion) => <small key={suggestion}>{suggestion}</small>)}
                    </div>
                  ) : null}
                </div>
              ) : null}
              {readyScript?.resourceFramework ? (
                <div className="video-script-framework">
                  <strong>新脚本资源框架</strong>
                  <div>
                    {readyScript.resourceFramework.characters.map((character) => (
                      <span key={`script-character-${character.name}`}>角色：{character.name} · {character.shotCount} 镜</span>
                    ))}
                    {readyScript.resourceFramework.scenes.map((scene) => (
                      <span key={`script-scene-${scene.name}`}>场景：{scene.name} · {scene.shotCount} 镜{scene.sceneImagePrompt ? ' · 含场景图 Prompt' : ''}</span>
                    ))}
                  </div>
                </div>
              ) : null}
              {storyboardShots.length ? (
                <div className="video-storyboard-list expanded">
                  {storyboardShots.map((shot, index) => (
                    <article key={`shot-${shot.shot}`}>
                      <b>镜头 {shot.shot} · {shot.timeRange || shot.duration}</b>
                      <span>{SHOT_LABELS[shot.shotType || ''] || shot.shotType || '镜头'}{shot.cameraMovement ? ` / ${shot.cameraMovement}` : ''}</span>
                      <p>{shot.visual}</p>
                      <small>{shot.videoPrompt || shot.voiceover}</small>
                      <div className="video-shot-actions">
                        <button
                          className="ghost tiny"
                          onClick={() => void copyStoryboardPrompt(videoScript?.logId ?? 'current-script', shot)}
                        >
                          {copiedShotKey === `${videoScript?.logId ?? 'current-script'}-${shot.shot}` ? '已复制' : '复制 Prompt'}
                        </button>
                        {readyScript ? (
                          <button
                            className="ghost tiny"
                            disabled={busy}
                            onClick={() => void onRewriteVideoScriptShot(readyScript, index)}
                          >
                            AI 重写
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="video-placeholder">
                  <strong>等待分镜脚本</strong>
                  <p>生成后会展示角色、场景、镜头、口播、图片 Prompt 和视频 Prompt。</p>
                </div>
              )}
            </div>
          </article>
        </div>
      ) : null}

      {activeStage === 'history' ? (
        <div className="video-stage-layout history">
          <aside className="video-card video-history-list-panel">
            <div className="video-card-title">
              <div>
                <h4>脚本生成历史</h4>
                <p>对应 ScriptAI 的脚本历史，来自本地 video-script 运行日志。</p>
              </div>
              <span>{filteredScripts.length}/{scriptItems.length}</span>
            </div>
            <label>
              <span>搜索商品或脚本</span>
              <input value={scriptSearch} onChange={(event) => setScriptSearch(event.target.value)} placeholder="搜索商品、模板、口播内容" />
            </label>
            <div className="video-history-filters">
              {[
                { key: 'all' as const, label: '全部' },
                { key: 'excellent' as const, label: '优秀 ≥7' },
                { key: 'medium' as const, label: '中等 5-7' },
                { key: 'weak' as const, label: '待改进 <5' },
              ].map((filter) => (
                <button key={filter.key} className={scriptScoreFilter === filter.key ? 'active' : ''} onClick={() => setScriptScoreFilter(filter.key)}>{filter.label}</button>
              ))}
            </div>
            <div className="video-script-history-list">
              {groupedVisibleScripts.length ? groupedVisibleScripts.map((group) => (
                <section key={group.label} className="video-script-history-group">
                  <div className="video-script-history-date">{group.label}</div>
                  {group.items.map(({ log, script }) => {
                    const total = scriptTotalScore(script);
                    const templateTitle = featureTitleByLogId.get(linkedBreakdownLogId(log));
                    return (
                      <button key={log.id} className={selectedScriptItem?.log.id === log.id ? 'active' : ''} onClick={() => setSelectedScriptLogId(log.id)}>
                        <strong>{script.title}</strong>
                        <span>{inputString(log, 'productName') || '未记录商品'} · {dateLabel(log.createdAt)}</span>
                        <small>{templateTitle ? `模板：${templateTitle}` : '独立生成脚本'}</small>
                        <em>{total ? total.toFixed(1) : '-'} / {script.storyboard.length} 镜</em>
                      </button>
                    );
                  })}
                </section>
              )) : (
                <div className="video-placeholder tall">还没有匹配的脚本历史</div>
              )}
            </div>
            {filteredScripts.length ? (
              <div className="video-history-pagination">
                <span>已显示 {visibleScripts.length}/{filteredScripts.length}</span>
                {hasMoreScripts ? (
                  <button className="ghost small" onClick={() => setScriptHistoryPage((page) => page + 1)}>
                    加载更多
                  </button>
                ) : null}
              </div>
            ) : null}
          </aside>

          <section className="video-card video-script-history-detail">
            {selectedScriptItem ? (
              <>
                <div className="video-card-title">
                  <div>
                    <h4>{selectedScriptItem.script.title}</h4>
                    <p>{inputString(selectedScriptItem.log, 'productName') || selectedScriptItem.log.summary || '脚本生成记录'}</p>
                    <span className="video-linked-template">
                      爆款模板：{featureTitleByLogId.get(linkedBreakdownLogId(selectedScriptItem.log)) ?? '未关联拆解模板'}
                    </span>
                  </div>
                  <div className="video-card-actions">
                    <button className="ghost small" onClick={() => onOpenVideoLog(selectedScriptItem.log)}>查看追溯</button>
                    <button className="ghost small" disabled={busy} onClick={() => void onEvaluateVideoScript(selectedScriptItem.script, selectedScriptItem.log)}>AI 质检</button>
                    <button
                      className="ghost small"
                      onClick={() => {
                        onUseVideoScriptLog(selectedScriptItem.log);
                        setActiveStage('generate');
                      }}
                    >
                      用于 Prompt 交接
                    </button>
                    <button className="primary small" onClick={() => window.print()}>打印导出</button>
                  </div>
                </div>
                <div className="video-eval-panel">
                  <div className="video-eval-title">
                    <strong>脚本质量评分 · {scriptQualitySourceLabel(selectedScriptItem.script)}</strong>
                    <span>{scriptTotalScore(selectedScriptItem.script).toFixed(1)}/10</span>
                  </div>
                  {scriptQualityRows(selectedScriptItem.script).map((row) => (
                    <div key={row.key} className="video-sub-score-row" title={row.reason}>
                      <span>{row.label}</span>
                      <i><b style={{ width: `${Math.min(100, Math.max(0, row.score) * 10)}%` }} /></i>
                      <em>{row.score.toFixed(1)}</em>
                    </div>
                  ))}
                  {selectedScriptItem.script.evaluation?.suggestions.length ? (
                    <div className="video-eval-suggestions">
                      {selectedScriptItem.script.evaluation.suggestions.map((suggestion) => <small key={suggestion}>{suggestion}</small>)}
                    </div>
                  ) : null}
                </div>
                <div className="video-feedback-panel">
                  <div>
                    <strong>脚本反馈</strong>
                    <span>{selectedScriptItem.log.review?.rating === 'useful' ? '已标记有用' : selectedScriptItem.log.review?.rating === 'needs-rework' ? '已标记待改' : '未反馈'}</span>
                  </div>
                  <div className="video-feedback-actions">
                    <button
                      className={selectedScriptItem.log.review?.rating === 'useful' ? 'active' : ''}
                      onClick={() => void onUpdateVideoScriptReview({
                        logId: selectedScriptItem.log.id,
                        rating: 'useful',
                        note: selectedScriptReviewNote,
                      })}
                    >
                      有用
                    </button>
                    <button
                      className={selectedScriptItem.log.review?.rating === 'needs-rework' ? 'active warning' : ''}
                      onClick={() => void onUpdateVideoScriptReview({
                        logId: selectedScriptItem.log.id,
                        rating: 'needs-rework',
                        note: selectedScriptReviewNote,
                      })}
                    >
                      待改
                    </button>
                  </div>
                  <label>
                    <span>备注</span>
                    <textarea
                      value={selectedScriptReviewNote}
                      onChange={(event) => setScriptFeedbackDrafts((current) => ({
                        ...current,
                        [selectedScriptItem.log.id]: event.target.value,
                      }))}
                      placeholder="记录要保留或需要重写的镜头、卖点、口播问题"
                    />
                  </label>
                  <button
                    className="ghost small"
                    onClick={() => void onUpdateVideoScriptReview({
                      logId: selectedScriptItem.log.id,
                      rating: selectedScriptItem.log.review?.rating ?? null,
                      note: selectedScriptReviewNote,
                    })}
                  >
                    保存备注
                  </button>
                </div>
                {selectedScriptItem.script.resourceFramework ? (
                  <div className="video-script-framework">
                    <strong>资源框架</strong>
                    <div>
                      {selectedScriptItem.script.resourceFramework.characters.map((character) => (
                        <span key={`history-character-${character.name}`}>角色：{character.name} · {character.shotCount} 镜</span>
                      ))}
                      {selectedScriptItem.script.resourceFramework.scenes.map((scene) => (
                        <span key={`history-scene-${scene.name}`}>场景：{scene.name} · {scene.shotCount} 镜</span>
                      ))}
                    </div>
                  </div>
                ) : null}
                <div className="video-storyboard-list expanded">
                  {selectedScriptItem.script.storyboard.map((shot, index) => (
                    <article key={`history-shot-${shot.shot}`}>
                      <b>镜头 {shot.shot} · {shot.timeRange || shot.duration}</b>
                      <span>{SHOT_LABELS[shot.shotType || ''] || shot.shotType || '镜头'}{shot.cameraMovement ? ` / ${shot.cameraMovement}` : ''}</span>
                      <p>{shot.visual}</p>
                      <small>{shot.videoPrompt || shot.voiceover}</small>
                      <div className="video-shot-actions">
                        <button
                          className="ghost tiny"
                          onClick={() => void copyStoryboardPrompt(selectedScriptItem.log.id, shot)}
                        >
                          {copiedShotKey === `${selectedScriptItem.log.id}-${shot.shot}` ? '已复制' : '复制 Prompt'}
                        </button>
                        <button
                          className="ghost tiny"
                          disabled={busy}
                          onClick={() => {
                            void Promise.resolve(onRewriteVideoScriptShot(selectedScriptItem.script, index, selectedScriptItem.log))
                              .then(() => setActiveStage('script'));
                          }}
                        >
                          AI 重写
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </>
            ) : (
              <div className="video-placeholder tall">点击左侧记录查看脚本详情</div>
            )}
          </section>
        </div>
      ) : null}

      {activeStage === 'generate' ? (
        <div className="video-stage-layout generate">
          <article className="video-card video-material-card">
            <div className="video-card-title">
              <div>
                <h4>视频 Prompt 使用的素材</h4>
                <p>分镜图、上传图片、参考视频都会随视频 Prompt 一起进入交接资料。</p>
              </div>
              <div className="video-card-actions">
                <button className="ghost small" onClick={onSelectReferenceImages}>上传图片</button>
                <button className="ghost small" onClick={onSelectVideo}>上传视频</button>
              </div>
            </div>
            <div className="video-material-list">
              {hasVideoMaterial ? (
                [...imageMaterialRefs, ...videoAssetRefs].map((ref) => (
                  <span key={ref}>{fileNameFromPath(ref)}</span>
                ))
              ) : (
                <div className="video-placeholder">
                  <strong>暂无参考素材</strong>
                  <p>可先上传产品图、参考图或视频；也可以直接用脚本生成 Prompt。</p>
                </div>
              )}
            </div>
          </article>

          <article className="video-card video-history-card">
            <div className="video-card-title">
              <div>
                <h4>内容生产交接</h4>
                <p>角色图、场景图、镜头视频、审核预览和合成导出在此转为 Prompt 清单；第三方任务由用户在外部平台执行。</p>
              </div>
            </div>
            <div className="video-handoff-agent-panel" aria-label="视频 Prompt 交接协作记录">
              <AgentTimeline
                messages={handoffAgentMessages}
                runningLabel={busy ? '正在整理视频 Prompt 交接资料。' : undefined}
                messageMeta={() => null}
                messageTitle={(message) => message.role === 'assistant' ? '交接包' : '任务简报'}
                messagePreview={(message) => message.content}
              />
            </div>
            {readyScript ? (
              <div className="video-production-checklist">
                {[
                  { title: '角色参考图', count: readyScript.resourceFramework?.characters.length ?? 0, status: '复制角色图 Prompt 到外部平台' },
                  { title: '场景背景图', count: readyScript.resourceFramework?.scenes.length ?? 0, status: '复制场景图 Prompt 到外部平台' },
                  { title: '镜头视频 Prompt', count: productionSegments.length || readyScript.storyboard.length, status: '逐镜头复制，不创建外部任务；可按 5/10 秒段落合并' },
                  { title: '审核预览', count: readyScript.publishCheck.length, status: '按发布检查逐项复核' },
                  { title: '合成导出', count: 1, status: '成品视频手动导入并关联 Prompt' },
                ].map((item) => (
                  <span key={item.title}><strong>{item.title}</strong>{item.count} 项<small>{item.status}</small></span>
                ))}
              </div>
            ) : (
              <div className="video-placeholder tall">先生成脚本后，再整理生产交接清单</div>
            )}
            {mediaResult ? (
              <div className={`result-card ${mediaResult.status}`}>
                <strong>{statusLabel(mediaResult.status)}</strong>
                <p>{mediaResult.message}</p>
                {mediaResult.billing ? (
                  <div className="video-cost-estimate">
                    <span>内部 API 成本估算</span>
                    <strong>{mediaResult.billing.currency === 'CNY' ? '¥' : `${mediaResult.billing.currency} `}{mediaResult.billing.estimatedCost.toFixed(2)}</strong>
                    <small>
                      {mediaResult.billing.durationSeconds}s × {mediaResult.billing.currency === 'CNY' ? '¥' : `${mediaResult.billing.currency} `}
                      {mediaResult.billing.unitPrice.toFixed(2)}/秒
                    </small>
                  </div>
                ) : null}
              </div>
            ) : null}
            {characterPromptItems.length || scenePromptItems.length ? (
              <div className="video-production-assets">
                {characterPromptItems.length ? (
                  <section>
                    <div className="video-card-title compact">
                      <div>
                        <h4>角色参考图 Prompt</h4>
                        <p>来自新脚本资源框架，可复制到外部生图平台生成角色三视图。</p>
                      </div>
                      <span className="status-pill">{characterPromptItems.length} 个</span>
                    </div>
                    {characterPromptItems.map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.meta}</small>
                        </div>
                        <p>{item.prompt}</p>
                        <button className="ghost tiny" onClick={() => void copyAssetPrompt(item.id, item.prompt)}>
                          {copiedAssetPromptKey === item.id ? '已复制' : '复制角色 Prompt'}
                        </button>
                      </article>
                    ))}
                  </section>
                ) : null}
                {scenePromptItems.length ? (
                  <section>
                    <div className="video-card-title compact">
                      <div>
                        <h4>场景背景图 Prompt</h4>
                        <p>来自新脚本资源框架，可复制到外部生图平台生成干净背景图。</p>
                      </div>
                      <span className="status-pill">{scenePromptItems.length} 个</span>
                    </div>
                    {scenePromptItems.map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.meta}</small>
                        </div>
                        <p>{item.prompt}</p>
                        <button className="ghost tiny" onClick={() => void copyAssetPrompt(item.id, item.prompt)}>
                          {copiedAssetPromptKey === item.id ? '已复制' : '复制场景 Prompt'}
                        </button>
                      </article>
                    ))}
                  </section>
                ) : null}
              </div>
            ) : null}
            {productionSegments.length ? (
              <div className="video-production-segments">
                <div className="video-card-title compact">
                  <div>
                    <h4>外部生成段落</h4>
                    <p>按源项目内容生产规则把分镜合并为 5/10 秒片段，逐段复制到外部视频平台。</p>
                  </div>
                  <span className="status-pill">{productionSegments.length} 段</span>
                </div>
                {productionSegments.map((segment) => (
                  <article key={segment.id}>
                    <div>
                      <strong>镜头 {segment.shotNumbers}</strong>
                      <small>{segment.externalDurationSeconds}s 外部段 / 估算 {segment.totalDurationSeconds.toFixed(1)}s</small>
                    </div>
                    <p>{segment.character} · {segment.scene}</p>
                    <button className="ghost tiny" onClick={() => void copyProductionSegmentPrompt(segment)}>
                      {copiedSegmentKey === segment.id ? '已复制' : '复制段落 Prompt'}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
            {productionReviewItems.length || productionDeliveryItems.length ? (
              <div className="video-production-delivery">
                <section>
                  <div className="video-card-title compact">
                    <div>
                      <h4>审核预览</h4>
                      <p>发布检查只记录脚本风险和人工复核项，不伪造成品预览。</p>
                    </div>
                    <span className="status-pill">{productionReviewItems.length} 项</span>
                  </div>
                  {productionReviewItems.map((item) => (
                    <article key={item.id} className={item.status}>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </section>
                <section>
                  <div className="video-card-title compact">
                    <div>
                      <h4>合成导出交付</h4>
                      <p>外部平台生成、剪辑和合成完成后，回到内容工厂导入成品视频。</p>
                    </div>
                    <span className="status-pill">{productionDeliveryItems.length} 项</span>
                  </div>
                  {productionDeliveryItems.map((item) => (
                    <article key={item.id} className={item.status}>
                      <strong>{item.title}</strong>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </section>
              </div>
            ) : null}
          </article>

          <article className="video-card video-prompt-card">
            <div className="video-card-title">
              <div>
                <h4>视频 Prompt 交接</h4>
                <p>打开交接后可复制到第三方视频平台；软件只记录 Prompt、复制动作和手动导入的成品视频。</p>
              </div>
            </div>
            <pre>{suggestedVideoPrompt}</pre>
            {videoBreakdown ? <div className="script-block"><strong>拆解片段</strong>{videoBreakdown.segments.map((segment) => <p key={segment.timeRange}>{segment.timeRange} · {segment.hook} · {segment.reusablePoint}</p>)}</div> : null}
            {readyScript ? <div className="script-block"><strong>分镜脚本</strong><p>{readyScript.title}</p><pre>{readyScript.script}</pre></div> : null}
            <div className="video-handoff-actions">
              <button className="primary wide" disabled={busy || !workspaceReady} onClick={onOpenVideoPromptHandoff}>打开视频 Prompt 交接</button>
              <button className="ghost wide" disabled={busy || !workspaceReady} onClick={onOpenVideoImport}>导入成品视频</button>
            </div>
            <div className="video-internal-provider-callout">
              <div>
                <strong>内部视频生成服务</strong>
                <p>只在已配置内容工厂视频 Provider 时使用；第三方平台任务仍由用户在外部执行并手动导入成品。</p>
              </div>
              <button className="ghost small" disabled={busy || !workspaceReady} onClick={onGenerateVideo}>内部生成</button>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
