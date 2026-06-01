import type {
  BrandKnowledgeBaseRecord,
  AssetReviewRecord,
  AgentPromptSessionResult,
  ImageGenerationRequest,
  InputSourceRecord,
  InputSourcePurpose,
  IpKnowledgeBaseRecord,
  KnowledgeCitation,
  KnowledgeSectionType,
  MediaGenerationResult,
  OverlayCardDraft,
  OverlayCardRecord,
  PromptPack,
  PromptDraft,
  PromptDraftPurpose,
  StartWorkflowRunInput,
  SceneCard,
  WorkflowDefinition,
  WorkflowRunRecord,
  WorkflowRunStatus,
  WorkflowRunStep,
  WorkflowStepDefinition,
} from '../../shared/types';
import { isReusableWorkflowInputSource } from '../../shared/inputSourcePolicy';
import { buildProductBriefPromptPlan, structureProductBriefSources } from '../../shared/productBrief';
import { buildScenePromptGroupContent } from '../../shared/scenePromptComposer';
import { clusterUserFeedbackSources } from '../../shared/userFeedbackInsights';
import { basename } from 'node:path';
import { existsSync } from 'node:fs';
import { MediaProvider } from '../providers/mediaProvider';
import { BrandKnowledgeBaseStore } from './brandKnowledgeBaseStore';
import { AgentPromptSessionStore } from './agentPromptSessionStore';
import { AssetReviewStore } from './assetReviewStore';
import { InputSourceStore } from './inputSourceStore';
import { IpKnowledgeBaseStore } from './ipKnowledgeBaseStore';
import { OverlayCardStore } from './overlayCardStore';
import { PromptPackService } from './promptPackService';
import { PromptDraftStore } from './promptDraftStore';
import { ReferenceReverseService } from './referenceReverseService';
import { SceneLibraryStore } from './sceneLibraryStore';
import { TextProviderBlockedError } from './textGenerationService';
import { WorkflowStore } from './workflowStore';

interface WorkflowExecutionContext {
  inputSourceIds: string[];
  brandKnowledgeBase?: BrandKnowledgeBaseRecord;
  ipKnowledgeBase?: IpKnowledgeBaseRecord;
  promptPack?: PromptPack;
  sceneCards?: SceneCard[];
  promptDraft?: PromptDraft;
  agentSession?: AgentPromptSessionResult['session'];
  promptContent?: string;
}

function activeDraftContent(draft?: PromptDraft): string {
  if (!draft) return '';
  return draft.versions.find((version) => version.id === draft.activeVersionId)?.content
    ?? draft.versions[draft.versions.length - 1]?.content
    ?? '';
}

function compactText(value?: string, fallback = '未填写'): string {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function sourcePurposeFor(definition: WorkflowDefinition): InputSourcePurpose {
  if (definition.key.includes('brand')) return 'brand-kb';
  if (definition.key.includes('ip')) return 'ip-kb';
  if (definition.key.includes('feedback') || definition.key.includes('topic')) return 'user-feedback';
  if (
    definition.key.includes('image')
    || definition.key.includes('seeding')
    || definition.key.includes('product')
    || definition.key.includes('commercial')
  ) return 'product-brief';
  return 'sop-input';
}

function promptPurposeFor(definition: WorkflowDefinition, step?: WorkflowStepDefinition): PromptDraftPurpose {
  if (step?.kind === 'video-prompt' || definition.key.includes('video')) return 'video';
  if (step?.kind === 'overlay-generate' || definition.key.includes('green-screen') || definition.key.includes('overlay')) return 'green-screen';
  if (step?.kind === 'generate-prompt-group' && definition.key.includes('article')) return 'article';
  if (step?.kind === 'generate-prompt-group' && definition.key.includes('video')) return 'video';
  if (step?.kind === 'generate-prompt-group') return 'image';
  if (definition.key.includes('feedback') || definition.key.includes('topic')) return 'article';
  if (definition.key.includes('product') || definition.key.includes('commercial')) return 'image';
  if (definition.key.includes('ip') || definition.key.includes('article') || definition.key.includes('longform')) return 'article';
  return 'image';
}

function workflowStatusFromMedia(result: MediaGenerationResult): WorkflowRunStatus {
  if (result.status === 'failed') return 'failed';
  if (result.status === 'blocked') return 'blocked';
  if (result.status === 'succeeded') return 'succeeded';
  if (result.status === 'cancelled') return 'cancelled';
  return 'queued';
}

function isBlockedDraft(draft?: PromptDraft): boolean {
  return Boolean(draft?.model?.startsWith('blocked:'));
}

function uniqueRefs(refs: string[]): string[] {
  return Array.from(new Set(refs.filter(Boolean)));
}

function formatProductBriefPromptPlanContent(plan: ReturnType<typeof buildProductBriefPromptPlan>, variableTable: string): string {
  return [
    '任务：产品商业素材图片 Prompt 计划',
    '',
    '产品变量表：',
    variableTable,
    '',
    ...plan.flatMap((item, index) => [
      `## ${index + 1}. ${item.label}`,
      '',
      `素材用途：${item.label.replace(/\s*Prompt$/, '')}`,
      `产品：${item.productName}`,
      `SKU / 规格追溯：${item.skuTrace}`,
      `追溯资料：${item.sourceIds.length ? `已关联 ${item.sourceIds.length} 份产品资料 / SKU 表` : '待补充产品资料 / SKU 表'}`,
      '',
      item.prompt,
      '',
    ]),
    '下游要求：',
    '- 图片生成前必须人工确认 SKU、卖点和禁用表达，不允许补写资料中没有的功效。',
    '- 生成素材入库时必须保留产品资料、SKU 行和 Prompt 版本追溯。',
  ].join('\n').trim();
}

function formatFeedbackPromptContent(insight: ReturnType<typeof clusterUserFeedbackSources>, userIntent: string): string {
  const clusterLines = insight.clusters.map((cluster, index) => [
    `## ${index + 1}. ${cluster.label}`,
    `数量：${cluster.count}`,
    `标签：${cluster.tags.join('、') || '待人工补充'}`,
    `用户原声：${cluster.examples.join(' / ')}`,
    `人群：${cluster.audienceHints.join(' / ') || '相关目标用户'}`,
    `场景：${cluster.scenarioHints.join(' / ') || '用户提问场景'}`,
    `选题方向：${cluster.titleDirections.join(' / ') || '待人工确认'}`,
  ].join('\n'));
  const matrixLines = insight.matrix.map((item, index) => [
    `${index + 1}. 痛点：${item.painPoint}`,
    `   人群：${item.audience}`,
    `   场景：${item.scenario}`,
    `   内容角度：${item.contentAngle}`,
    `   证据：${item.evidence}`,
  ].join('\n'));
  const objectionLines = insight.objectionResponses.map((item, index) => [
    `${index + 1}. ${item.painPoint}`,
    `   原问题：${item.objection}`,
    `   回复方向：${item.response}`,
    `   边界：${item.boundary}`,
  ].join('\n'));
  return [
    '任务：基于真实用户反馈生成选题和文案 Prompt',
    '',
    '用户意图：',
    compactText(userIntent, '从评论、差评和客服问题中生成选题方向。'),
    '',
    '输入源：',
    insight.sourceTitles.join(' / ') || '待补充评论、差评或客服问题',
    '',
    '推荐标签：',
    insight.recommendedTags.join('、') || '待人工补充',
    '',
    '痛点聚类：',
    clusterLines.join('\n\n') || '待补充真实用户原声。',
    '',
    '痛点 x 人群 x 场景 x 内容角度：',
    matrixLines.join('\n') || '待补充真实用户原声。',
    '',
    '选题方向：',
    ...insight.titleDirections.map((item, index) => `${index + 1}. ${item}`),
    '',
    '客服异议处理：',
    objectionLines.join('\n') || '待补充真实客服问题。',
    '',
    '下游写作约束：',
    '- 标题、脚本和正文必须引用上面的用户原声，不把运营猜测写成用户痛点。',
    '- 客服回复必须保留人工复核边界，涉及孩子、老人、孕期、敏感人群或专业建议时不得直接承诺。',
    '- 可以进入标题生成、文章生成、视频脚本和私域话术，但每个产物都要保留输入源和 Prompt 版本追溯。',
  ].join('\n').trim();
}

function normalizeOverlayLine(value: string): string {
  return value
    .replace(/^[-*#\d.\s]+/, '')
    .replace(/^(标题卡|标题|开头|钩子|卖点卡|卖点|金句卡|金句|行动卡|CTA|行动|字幕)[:：]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitOverlayPhrase(value: string): string[] {
  const normalized = normalizeOverlayLine(value);
  if (!normalized) return [];
  if (normalized.length <= 24) return [normalized];
  const chunks = normalized
    .split(/[，。！？、,.!?；;]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3 && item.length <= 28);
  if (chunks.length) return chunks.slice(0, 4);
  return [normalized.slice(0, 24)];
}

function selectOverlayText(lines: string[], pattern: RegExp, fallbackIndex: number): string {
  const matched = lines.find((line) => pattern.test(line));
  return splitOverlayPhrase(matched ?? lines[fallbackIndex] ?? lines[0] ?? '')[0] ?? '';
}

function selectTypedOverlayText(source: string | undefined, pattern: RegExp): string {
  const matched = source
    ?.split('\n')
    .find((line) => pattern.test(line.trim()));
  return splitOverlayPhrase(matched ?? '')[0] ?? '';
}

function buildOverlayCardDrafts(input: {
  source?: string;
  intent?: string;
  promptContent?: string;
}): OverlayCardDraft[] {
  const raw = [input.source, input.intent, input.promptContent].filter(Boolean).join('\n');
  const lines = Array.from(new Set(
    raw
      .split('\n')
      .flatMap((line) => line.split(/(?<=。|！|？|;|；)/))
      .map(normalizeOverlayLine)
      .filter((line) => line.length >= 3 && !/^任务[:：]|^用户意图[:：]|^输出要求[:：]|^Prompt 草稿[:：]/.test(line)),
  )).slice(0, 12);
  if (lines.length < 2) return [];

  const title = selectTypedOverlayText(input.source, /^(标题卡|标题|开头|钩子)[:：]/)
    || selectOverlayText(lines, /标题|开头|钩子|痛点|为什么|别再|先从/, 0);
  const sellingPoint = selectTypedOverlayText(input.source, /^(卖点卡|卖点|亮点)[:：]/)
    || selectOverlayText(lines, /卖点|亮点|方便|顺手|降低|解决|适合|可以|不用/, 1);
  const cta = selectTypedOverlayText(input.source, /^(CTA|行动卡|行动)[:：]/i)
    || selectOverlayText(lines, /CTA|行动|收藏|关注|咨询|试试|开始|先从|立即|下单/, lines.length - 1);
  const drafts: OverlayCardDraft[] = [
    { type: 'title', title: '标题卡', text: title, durationSeconds: 3, tags: ['SOP 生成'] },
    { type: 'selling-point', title: '卖点卡', text: sellingPoint, durationSeconds: 4, tags: ['SOP 生成'] },
    { type: 'cta', title: '行动卡', text: cta, durationSeconds: 4, tags: ['SOP 生成'] },
  ];
  return drafts.filter((card) => card.text.trim());
}

function mergeCitations(citations: KnowledgeCitation[]): KnowledgeCitation[] {
  const seen = new Set<string>();
  const merged: KnowledgeCitation[] = [];
  for (const citation of citations) {
    const key = `${citation.knowledgeBaseId}:${citation.sectionId}`;
    if (seen.has(key)) continue;
    if (!citation.excerpt.trim()) continue;
    seen.add(key);
    merged.push(citation);
  }
  return merged.slice(0, 12);
}

function clipCitationExcerpt(value?: string): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  return normalized.length > 900 ? `${normalized.slice(0, 900)}...` : normalized;
}

function sourceSectionType(source: InputSourceRecord, definition: WorkflowDefinition): KnowledgeSectionType {
  if (source.purpose === 'ip-scenario-kb') return 'scenario-script';
  if (source.purpose === 'ip-kb' || definition.key.includes('ip') || definition.key.includes('longform')) return 'profile';
  if (source.purpose === 'brand-kb') return 'brand';
  if (source.purpose === 'product-brief') return 'product';
  if (source.purpose === 'user-feedback') return 'objection-handling';
  if (source.purpose === 'competitor-observation') return 'scenario-script';
  if (source.purpose === 'reference') return 'scenario-script';
  return definition.key.includes('video') ? 'scenario-script' : 'product';
}

function citationFromInputSource(source: InputSourceRecord, definition: WorkflowDefinition): KnowledgeCitation | null {
  const excerpt = clipCitationExcerpt(source.extractedText || source.summary);
  if (!excerpt) return null;
  const purposeLabels: Record<InputSourcePurpose, string> = {
    'brand-kb': '品牌 / 产品知识库',
    'ip-kb': 'IP 知识库',
    'ip-scenario-kb': 'IP 场景库',
    'competitor-observation': '竞品观察',
    reference: '参考素材',
    'product-brief': '产品资料',
    'user-feedback': '评论 / 客服问题',
    'sop-input': '任务输入',
    'successful-asset': '成功素材',
  };
  return {
    knowledgeBaseId: `input-source:${source.id}`,
    sectionId: source.markdownPath ? 'markdown' : 'summary',
    title: `${source.title} / ${purposeLabels[source.purpose] ?? '输入资料'}`,
    sectionType: sourceSectionType(source, definition),
    excerpt,
  };
}

function extractLocalFilePaths(value?: string): string[] {
  if (!value) return [];
  const candidates = new Set<string>();
  const quotedPattern = /["'](\/[^"']+\.(?:docx|md|markdown|txt|json|csv|tsv|xlsx|xls|png|jpg|jpeg|webp|gif|mp4|mov|webm|m4v))["']/gi;
  const pathPattern = /(?:^|\s)(\/[^\s"'<>]+\.(?:docx|md|markdown|txt|json|csv|tsv|xlsx|xls|png|jpg|jpeg|webp|gif|mp4|mov|webm|m4v))(?=\s|$)/gi;
  for (const pattern of [quotedPattern, pathPattern]) {
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(value))) {
      const filePath = match[1]?.trim();
      if (filePath && existsSync(filePath)) candidates.add(filePath);
    }
  }
  return Array.from(candidates).slice(0, 12);
}

function brandKnowledgeBaseCitations(record?: BrandKnowledgeBaseRecord): KnowledgeCitation[] {
  if (!record) return [];
  const sections: Array<{
    sectionId: string;
    title: string;
    sectionType: KnowledgeCitation['sectionType'];
    excerpt: string;
  }> = [
    {
      sectionId: 'brand-voice',
      title: '品牌口吻',
      sectionType: 'brand',
      excerpt: record.brandVoice,
    },
    {
      sectionId: 'product-facts',
      title: '产品事实',
      sectionType: 'product',
      excerpt: record.productFacts.join('\n'),
    },
    {
      sectionId: 'selling-points',
      title: '核心卖点',
      sectionType: 'selling-point',
      excerpt: record.coreSellingPoints.join('\n'),
    },
    {
      sectionId: 'compliance-boundaries',
      title: '合规边界',
      sectionType: 'compliance',
      excerpt: record.complianceBoundaries.join('\n'),
    },
    {
      sectionId: 'scene-seeds',
      title: '场景种子',
      sectionType: 'scenario-script',
      excerpt: record.sceneSeeds.join('\n'),
    },
    {
      sectionId: 'prompt-fragments',
      title: 'Prompt 片段',
      sectionType: 'brand',
      excerpt: record.promptFragments.join('\n'),
    },
  ];
  return sections
    .filter((section) => section.excerpt.trim())
    .map((section) => ({
      knowledgeBaseId: `brand-kb:${record.id}`,
      sectionId: section.sectionId,
      title: `${record.title} / ${section.title}`,
      sectionType: section.sectionType,
      excerpt: section.excerpt.slice(0, 900),
    }));
}

function ipKnowledgeBaseCitations(record?: IpKnowledgeBaseRecord): KnowledgeCitation[] {
  if (!record) return [];
  const layerLabels: Record<keyof IpKnowledgeBaseRecord['layers'], string> = {
    identity: '身份锚定',
    values: '价值观立场',
    language: '语言风格',
    methodology: '判断方法',
    materials: '内容素材',
    engine: '创作引擎',
  };
  const layerCitations = Object.entries(record.layers).map(([key, value]) => ({
    knowledgeBaseId: `ip-kb:${record.id}`,
    sectionId: `layer-${key}`,
    title: `${record.title} / ${layerLabels[key as keyof IpKnowledgeBaseRecord['layers']]}`,
    sectionType: key === 'language' ? 'voice-style' as const : key === 'methodology' ? 'methodology' as const : 'profile' as const,
    excerpt: value.slice(0, 900),
  }));
  const extensionCitation: KnowledgeCitation = {
    knowledgeBaseId: `ip-kb:${record.id}`,
    sectionId: 'extension-scenes',
    title: `${record.title} / 场景延伸`,
    sectionType: 'scenario-script',
    excerpt: record.extensionScenes.join('\n').slice(0, 900),
  };
  return [...layerCitations, extensionCitation].filter((citation) => citation.excerpt.trim());
}

function citationsForPromptPack(run: WorkflowRunRecord, context: WorkflowExecutionContext): KnowledgeCitation[] {
  const derived = context.brandKnowledgeBase
    ? brandKnowledgeBaseCitations(context.brandKnowledgeBase)
    : ipKnowledgeBaseCitations(context.ipKnowledgeBase);
  return derived.length ? derived : run.citations ?? [];
}

function baseImageRequest(input: {
  run: WorkflowRunRecord;
  context: WorkflowExecutionContext;
  prompt: string;
}): ImageGenerationRequest {
  const sceneCardIds = input.context.sceneCards?.map((card) => card.id)
    ?? input.context.promptDraft?.sceneCardIds
    ?? [];
  return {
    workspacePath: input.run.workspacePath,
    workflowRunId: input.run.id,
    productImageRefs: [],
    referenceImageRefs: [],
    prompt: input.prompt,
    promptMode: 'free',
    generationMode: 'smart',
    template: '场景图',
    watermark: false,
    promptPackId: input.context.promptPack?.id,
    sceneCardIds,
    citations: input.run.citations ?? [],
    selectedSkillSlugs: [],
    params: {
      imageModel: '',
      textModel: '',
      videoModel: '',
      runMode: 'single',
      count: 1,
      aspectRatio: '4:5',
      resolution: '1k',
      quality: 'medium',
    },
  };
}

export class WorkflowEngine {
  constructor(
    private readonly workflows: WorkflowStore,
    private readonly inputSources: InputSourceStore,
    private readonly promptDrafts: PromptDraftStore,
    private readonly agentSessions: AgentPromptSessionStore,
    private readonly media: MediaProvider,
    private readonly assetReviews?: AssetReviewStore,
    private readonly brandKnowledgeBases?: BrandKnowledgeBaseStore,
    private readonly promptPacks?: PromptPackService,
    private readonly sceneCards?: SceneLibraryStore,
    private readonly referenceReverse?: ReferenceReverseService,
    private readonly ipKnowledgeBases?: IpKnowledgeBaseStore,
    private readonly overlayCards?: OverlayCardStore,
  ) {}

  async startRun(input: StartWorkflowRunInput): Promise<WorkflowRunRecord> {
    const definitions = await this.workflows.listDefinitions(input.workspacePath);
    const definition = definitions.find((item) => item.id === input.workflowDefinitionId);
    if (!definition) throw new Error(`工作流定义不存在: ${input.workflowDefinitionId}`);
    const inputSourceIds = await this.reusableInputSourceIds(input.workspacePath, input.inputSourceIds);
    const startInput: StartWorkflowRunInput = {
      ...input,
      inputSourceIds,
    };

    let run = await this.workflows.startRun(startInput);
    if (run.steps[0]?.error === 'WORKFLOW_REQUIRED_INPUT_MISSING') return run;

    const context: WorkflowExecutionContext = { inputSourceIds };
    for (const step of definition.steps) {
      const result = await this.executeStep(definition, run, step, context);
      run = result.run;
      if (result.stop) break;
    }

    return this.workflows.updateRun(this.finalizeRun(run));
  }

  private async reusableInputSourceIds(workspacePath: string, inputSourceIds?: string[]): Promise<string[]> {
    if (!inputSourceIds?.length) return [];
    const requested = new Set(inputSourceIds);
    const sources = await this.inputSources.list(workspacePath);
    return sources
      .filter((source) => requested.has(source.id) && isReusableWorkflowInputSource(source))
      .map((source) => source.id);
  }

  private async executeStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    try {
      if (step.kind === 'input') {
        return { run: await this.executeInputStep(definition, run, step, context), stop: false };
      }
      if (step.kind === 'build-brand-knowledge-base') {
        return await this.executeBrandKnowledgeStep(definition, run, step, context);
      }
      if (step.kind === 'build-ip-knowledge-base') {
        return await this.executeIpKnowledgeStep(definition, run, step, context);
      }
      if (step.kind === 'generate-prompt-pack') {
        return await this.executePromptPackStep(definition, run, step, context);
      }
      if (step.kind === 'generate-scene-library') {
        return await this.executeSceneLibraryStep(definition, run, step, context);
      }
      if (step.kind === 'generate-prompt-group') {
        return await this.executePromptGroupStep(definition, run, step, context);
      }
      if (step.kind === 'agent-read') {
        return await this.executeAgentReadStep(definition, run, step, context);
      }
      if (step.kind === 'reference-reverse') {
        return await this.executeReferenceReverseStep(definition, run, step, context);
      }
      if (step.kind === 'structure-product-brief') {
        return await this.executeProductBriefStep(definition, run, step, context);
      }
      if (step.kind === 'cluster-user-feedback') {
        return await this.executeFeedbackClusterStep(definition, run, step, context);
      }
      if (step.kind === 'prompt-generate' || step.kind === 'video-prompt') {
        return await this.executePromptStep(definition, run, step, context);
      }
      if (step.kind === 'image-generate') {
        return await this.executeImageStep(definition, run, step, context);
      }
      if (step.kind === 'overlay-generate') {
        return await this.executeOverlayStep(definition, run, step, context);
      }
      if (step.kind === 'manual-video-prompt-copy') {
        return {
          run: this.patchStep(run, step, 'queued', '等待人工复制视频 Prompt 到第三方平台。', {
            action: 'waiting-manual-copy',
            promptDraftId: context.promptDraft?.id,
            target: 'third-party-video-platform',
          }, context.promptDraft ? [`prompt-draft:${context.promptDraft.id}`] : []),
          stop: true,
        };
      }
      if (step.kind === 'manual-video-import') {
        return {
          run: this.patchStep(run, step, 'queued', '等待导入第三方平台生成后的本地成品视频。', {
            action: 'waiting-finished-video-import',
            promptDraftId: context.promptDraft?.id,
          }),
          stop: true,
        };
      }
      if (step.kind === 'review') {
        return {
          run: this.patchStep(run, step, 'queued', '等待人工审核通过、驳回或回炉重做。', {
            action: 'waiting-human-review',
            reviewRules: definition.reviewRules,
          }),
          stop: true,
        };
      }
      if (step.kind === 'asset-store' || step.kind === 'export') {
        return {
          run: this.patchStep(run, step, 'queued', '等待前序审核或素材生成完成。', {
            action: 'waiting-upstream',
            outputKeys: step.outputKeys,
          }),
          stop: true,
        };
      }

      return {
        run: this.patchStep(
          run,
          step,
          'blocked',
          step.blockedReason ?? '当前步骤还没有接入真实执行器。',
          {
            action: 'executor-not-connected',
            blockedReason: step.blockedReason ?? 'WORKFLOW_STEP_EXECUTOR_NOT_CONNECTED',
          },
          ['WORKFLOW_STEP_EXECUTOR_NOT_CONNECTED'],
        ),
        stop: true,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const blocked = error instanceof TextProviderBlockedError;
      return {
        run: this.patchStep(run, step, blocked ? 'blocked' : 'failed', blocked ? `步骤阻塞：${message}` : `步骤执行失败：${message}`, {
          action: blocked ? 'step-blocked' : 'step-failed',
          error: message,
        }, [], blocked ? 'TEXT_PROVIDER_NOT_CONFIGURED' : message),
        stop: true,
      };
    }
  }

  private async executeInputStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<WorkflowRunRecord> {
    const purpose = sourcePurposeFor(definition);
    const sourceText = run.inputs.source?.trim() ?? '';
    const localFilePaths = extractLocalFilePaths(sourceText);
    const remainingSourceText = localFilePaths
      .reduce((current, filePath) => current
        .replaceAll(`"${filePath}"`, '')
        .replaceAll(`'${filePath}'`, '')
        .replaceAll(filePath, ''), sourceText)
      .trim();
    const shouldRegisterManualSource = Boolean(remainingSourceText);
    let source: InputSourceRecord | undefined;

    if (shouldRegisterManualSource) {
      const text = [
        `# ${definition.title}`,
        '',
        '## 输入源',
        sourceText,
        '',
        '## 用户意图',
        compactText(run.inputs.intent),
        '',
        '## 审核人',
        compactText(run.inputs.reviewOwner),
      ].join('\n');
      source = await this.inputSources.register({
        workspacePath: run.workspacePath,
        workflowRunId: run.id,
        kind: 'manual-note',
        purpose,
        title: `${definition.title} / ${new Date(run.createdAt).toLocaleString()}`,
        text,
        summary: compactText(run.inputs.intent, definition.description),
        tags: ['workflow-run', definition.key, run.id],
      });
    }

    const importedSources: InputSourceRecord[] = [];
    for (const filePath of localFilePaths) {
      importedSources.push(await this.inputSources.importFile(run.workspacePath, filePath, purpose, {
        workflowRunId: run.id,
        tags: ['workflow-run', definition.key, 'auto-import'],
      }));
    }

    context.inputSourceIds = uniqueRefs([
      ...context.inputSourceIds,
      ...(source ? [source.id] : []),
      ...importedSources.map((item) => item.id),
    ]);
    const sourceRecords = (await this.inputSources.list(run.workspacePath))
      .filter((item) => context.inputSourceIds.includes(item.id));
    const explicitCitations = run.citations ?? [];
    const newSourceIds = new Set([
      ...(source ? [source.id] : []),
      ...importedSources.map((item) => item.id),
    ]);
    const citationSourceRecords = explicitCitations.length > 0
      ? sourceRecords.filter((item) => newSourceIds.has(item.id))
      : sourceRecords;
    const sourceCitations = citationSourceRecords
      .map((item) => citationFromInputSource(item, definition))
      .filter((item): item is KnowledgeCitation => Boolean(item));
    const nextCitations = mergeCitations([...explicitCitations, ...sourceCitations]);
    const nextRun: WorkflowRunRecord = {
      ...run,
      inputSourceIds: context.inputSourceIds,
      citations: nextCitations,
    };

    const summary = source
      ? '已登记本次补充资料，并生成可追溯转换稿。'
      : importedSources.length
        ? `已导入 ${importedSources.length} 个本地文件资料，并写入运行追溯。`
        : context.inputSourceIds.length
          ? `已使用 ${context.inputSourceIds.length} 份已登记资料。`
          : explicitCitations.length
            ? `已使用 ${explicitCitations.length} 条已选择知识引用。`
            : '未选择资料，后续步骤会要求补充可追溯输入。';

    return this.patchStep(nextRun, step, 'succeeded', summary, {
      inputSourceId: source?.id,
      importedInputSourceIds: importedSources.map((item) => item.id),
      selectedInputSourceCount: context.inputSourceIds.length,
      sourceStatus: source?.status,
      markdownPath: source?.markdownPath,
      citationCount: nextCitations.length,
      artifactRefs: uniqueRefs([
        ...(source?.artifactRefs ?? []),
        ...importedSources.flatMap((item) => item.artifactRefs),
      ]),
    }, uniqueRefs([
      ...(source ? [`input-source:${source.id}`] : []),
      ...importedSources.map((item) => `input-source:${item.id}`),
      ...(source?.artifactRefs ?? []),
      ...importedSources.flatMap((item) => item.artifactRefs),
    ]));
  }

  private async executeBrandKnowledgeStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (!this.brandKnowledgeBases) {
      return {
        run: this.patchStep(run, step, 'blocked', '品牌知识库执行器尚未接入。', {
          action: 'executor-not-connected',
        }, [], 'WORKFLOW_BRAND_KB_EXECUTOR_NOT_CONNECTED'),
        stop: true,
      };
    }
    if ((run.citations ?? []).length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少知识引用，无法抽取品牌知识库。', {
          action: 'missing-citations',
        }, [], 'WORKFLOW_CITATIONS_MISSING'),
        stop: true,
      };
    }

    const record = await this.brandKnowledgeBases.generate({
      workspacePath: run.workspacePath,
      title: run.inputs.source?.trim() || definition.title,
      citations: run.citations ?? [],
    });
    context.brandKnowledgeBase = record;
    return {
      run: this.patchStep(
        run,
        step,
        'succeeded',
        record.status === 'ready'
          ? '已抽取品牌知识库六层、卖点和合规边界。'
          : '已生成本地品牌知识库草稿，等待后续补齐或模型配置。',
        {
          brandKnowledgeBaseId: record.id,
          status: record.status,
          model: record.model,
          productFactCount: record.productFacts.length,
          sellingPointCount: record.coreSellingPoints.length,
          complianceBoundaryCount: record.complianceBoundaries.length,
          sourceCitationCount: record.sourceCitationIds.length,
        },
        [`brand-knowledge-base:${record.id}`],
      ),
      stop: false,
    };
  }

  private async executeIpKnowledgeStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (!this.ipKnowledgeBases) {
      return {
        run: this.patchStep(run, step, 'blocked', 'IP 知识库执行器尚未接入。', {
          action: 'executor-not-connected',
        }, [], 'WORKFLOW_IP_KB_EXECUTOR_NOT_CONNECTED'),
        stop: true,
      };
    }
    if ((run.citations ?? []).length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少 IP 知识引用，无法抽取 IP 六层知识库。', {
          action: 'missing-citations',
        }, [], 'WORKFLOW_CITATIONS_MISSING'),
        stop: true,
      };
    }

    const record = await this.ipKnowledgeBases.generate({
      workspacePath: run.workspacePath,
      title: run.inputs.source?.trim() || definition.title,
      citations: run.citations ?? [],
    });
    context.ipKnowledgeBase = record;
    return {
      run: this.patchStep(
        run,
        step,
        'succeeded',
        record.status === 'ready'
          ? '已抽取 IP 六层知识库和场景延伸。'
          : '已生成本地 IP 知识库草稿，等待后续补齐或模型配置。',
        {
          ipKnowledgeBaseId: record.id,
          status: record.status,
          model: record.model,
          completeness: record.completeness,
          missingLayers: record.missingLayers,
          extensionSceneCount: record.extensionScenes.length,
          sourceCitationCount: record.sourceCitationIds.length,
        },
        [`ip-knowledge-base:${record.id}`],
      ),
      stop: false,
    };
  }

  private async executePromptPackStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (!this.promptPacks) {
      return {
        run: this.patchStep(run, step, 'blocked', '提示词包执行器尚未接入。', {
          action: 'executor-not-connected',
        }, [], 'WORKFLOW_PROMPT_PACK_EXECUTOR_NOT_CONNECTED'),
        stop: true,
      };
    }
    const citations = citationsForPromptPack(run, context);
    if (citations.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少知识引用，无法生成提示词包。', {
          action: 'missing-citations',
        }, [], 'WORKFLOW_CITATIONS_MISSING'),
        stop: true,
      };
    }

    const pack = await this.promptPacks.generate({
      workspacePath: run.workspacePath,
      workflowRunId: run.id,
      name: `${run.inputs.source?.trim() || definition.title} 提示词包`,
      citations,
      inputSourceIds: context.inputSourceIds,
    });
    context.promptPack = pack;
    return {
      run: this.patchStep(
        run,
        step,
        'succeeded',
        `已生成提示词包：${pack.name}。`,
        {
          promptPackId: pack.id,
          baseType: pack.baseType,
          citationCount: pack.citations.length,
        },
        [`prompt-pack:${pack.id}`],
      ),
      stop: false,
    };
  }

  private async executeSceneLibraryStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (!this.sceneCards || !this.promptPacks) {
      return {
        run: this.patchStep(run, step, 'blocked', '场景库执行器尚未接入。', {
          action: 'executor-not-connected',
        }, [], 'WORKFLOW_SCENE_LIBRARY_EXECUTOR_NOT_CONNECTED'),
        stop: true,
      };
    }
    const promptPack = context.promptPack;
    if (!promptPack) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少提示词包，无法生成场景库。', {
          action: 'missing-prompt-pack',
        }, [], 'WORKFLOW_PROMPT_PACK_MISSING'),
        stop: true,
      };
    }

    const cards = await this.sceneCards.generate({
      workspacePath: run.workspacePath,
      workflowRunId: run.id,
      promptPackId: promptPack.id,
      inputSourceIds: context.inputSourceIds,
      citations: promptPack.citations,
      count: 5,
    });
    context.sceneCards = cards;
    return {
      run: this.patchStep(
        run,
        step,
        'succeeded',
        `已生成 ${cards.length} 张场景卡。`,
        {
          promptPackId: promptPack.id,
          sceneCardIds: cards.map((card) => card.id),
          firstScene: cards[0]?.title,
        },
        cards.map((card) => `scene-card:${card.id}`),
      ),
      stop: false,
    };
  }

  private async executePromptGroupStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (!context.sceneCards || context.sceneCards.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少场景卡，无法生成 Prompt 组。', {
          action: 'missing-scene-cards',
        }, [], 'WORKFLOW_SCENE_CARDS_MISSING'),
        stop: true,
      };
    }
    if (!this.promptDrafts) {
      return {
        run: this.patchStep(run, step, 'blocked', 'Prompt 草稿执行器尚未接入。', {
          action: 'executor-not-connected',
        }, [], 'WORKFLOW_PROMPT_DRAFT_EXECUTOR_NOT_CONNECTED'),
        stop: true,
      };
    }

    const purpose = promptPurposeFor(definition, step);
    const content = buildScenePromptGroupContent(
      purpose,
      run.inputs.intent?.trim() || definition.description,
      context.sceneCards,
    );
    const draft = await this.promptDrafts.createFromContent({
      workspacePath: run.workspacePath,
      workflowRunId: run.id,
      title: `${definition.title} Prompt 组`,
      purpose,
      userIntent: run.inputs.intent?.trim() || definition.description,
      inputSourceIds: context.inputSourceIds,
      sceneCardIds: context.sceneCards.map((card) => card.id),
      content,
      note: '由 SOP 场景库步骤生成可直接下游使用的 Prompt 组',
      model: 'workflow-scene-composer',
      status: 'confirmed',
    });
    context.promptDraft = draft;
    context.promptContent = activeDraftContent(draft);
    return {
      run: this.patchStep(
        run,
        step,
        'succeeded',
        `已生成 Prompt 组草稿：${draft.title}。`,
        {
          promptDraftId: draft.id,
          sceneCardIds: draft.sceneCardIds,
          model: draft.model,
        },
        [`prompt-draft:${draft.id}`],
      ),
      stop: false,
    };
  }

  private async executeReferenceReverseStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (!this.referenceReverse) {
      return {
        run: this.patchStep(run, step, 'blocked', '视觉反推执行器尚未接入。', {
          action: 'executor-not-connected',
        }, [], 'WORKFLOW_REFERENCE_REVERSE_EXECUTOR_NOT_CONNECTED'),
        stop: true,
      };
    }
    if (context.inputSourceIds.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少可用于反推的输入源。', {
          action: 'missing-input-source',
        }, [], 'WORKFLOW_INPUT_SOURCE_MISSING'),
        stop: true,
      };
    }

    const sources = (await this.inputSources.list(run.workspacePath)).filter((source) => context.inputSourceIds.includes(source.id));
    const referenceSourceIds = sources
      .filter((source) => source.purpose === 'reference' || source.kind === 'image' || source.kind === 'video')
      .map((source) => source.id);
    const productSourceIds = sources
      .filter((source) => !referenceSourceIds.includes(source.id))
      .map((source) => source.id);
    if (referenceSourceIds.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少参考图 / 参考视频输入源，无法进行素材拆解。', {
          action: 'missing-reference-source',
          inputSourceIds: context.inputSourceIds,
        }, [], 'WORKFLOW_REFERENCE_SOURCE_MISSING'),
        stop: true,
      };
    }

    const result = await this.referenceReverse.generate({
      workspacePath: run.workspacePath,
      workflowRunId: run.id,
      referenceSourceIds,
      productSourceIds,
      userIntent: compactText(run.inputs.intent, definition.description),
    });
    context.promptDraft = result.promptDraft;
    context.promptContent = activeDraftContent(result.promptDraft);
    return {
      run: this.patchStep(
        run,
        step,
        'succeeded',
        '已通过真实视觉理解服务完成素材拆解，并生成图片提示词草稿。',
        {
          logId: result.logId,
          promptDraftId: result.promptDraft.id,
          composition: result.analysis.composition,
          style: result.analysis.style,
          riskCount: result.analysis.risks.length,
        },
        [`generation-log:${result.logId}`, `prompt-draft:${result.promptDraft.id}`],
      ),
      stop: false,
    };
  }

  private async executeProductBriefStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (context.inputSourceIds.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少产品资料或 SKU 输入源，无法结构化商业素材变量。', {
          action: 'missing-product-brief-source',
        }, [], 'WORKFLOW_PRODUCT_BRIEF_SOURCE_MISSING'),
        stop: true,
      };
    }

    const sources = (await this.inputSources.list(run.workspacePath)).filter((source) => context.inputSourceIds.includes(source.id));
    const brief = structureProductBriefSources(sources);
    const promptPlan = buildProductBriefPromptPlan(brief);
    const output = {
      productName: brief.productName,
      sourceIds: brief.sourceIds,
      sourceTitles: brief.sourceTitles,
      sellingPoints: brief.sellingPoints,
      specs: brief.specs,
      scenarios: brief.scenarios,
      restrictions: brief.restrictions,
      skuRows: brief.skuRows,
      missingFields: brief.missingFields,
      variableTable: brief.variableTable,
      promptTypes: promptPlan.map((item) => item.type),
      promptPlan: promptPlan.map((item) => ({
        type: item.type,
        label: item.label,
        title: item.title,
        sourceIds: item.sourceIds,
        skuTrace: item.skuTrace,
      })),
    };

    if (brief.sourceIds.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '没有找到可用的产品资料 / SKU 表输入源，请先登记产品 brief 或 SKU 表。', {
          ...output,
          action: 'missing-product-brief-source',
        }, [], 'WORKFLOW_PRODUCT_BRIEF_SOURCE_MISSING'),
        stop: true,
      };
    }

    if (brief.missingFields.length > 0) {
      return {
        run: this.patchStep(run, step, 'blocked', `产品资料缺少：${brief.missingFields.join('、')}，请补齐后再生成商业素材。`, {
          ...output,
          action: 'missing-product-brief-fields',
        }, brief.sourceIds.map((id) => `input-source:${id}`), 'WORKFLOW_PRODUCT_BRIEF_FIELDS_MISSING'),
        stop: true,
      };
    }

    const draft = await this.promptDrafts.createFromContent({
      workspacePath: run.workspacePath,
      workflowRunId: run.id,
      title: `${brief.productName || definition.title} 商业图片 Prompt 计划`,
      purpose: 'image',
      userIntent: compactText(run.inputs.intent, definition.description),
      inputSourceIds: brief.sourceIds,
      content: formatProductBriefPromptPlanContent(promptPlan, brief.variableTable),
      note: '由产品资料结构化步骤生成，保留 SKU / 资料追溯',
      model: 'workflow-product-brief-structurer',
      status: 'confirmed',
    });
    context.promptDraft = draft;
    context.promptContent = activeDraftContent(draft);

    return {
      run: this.patchStep(
        run,
        step,
        'succeeded',
        `已结构化产品资料，生成 ${promptPlan.length} 类商业图片 Prompt 计划。`,
        {
          ...output,
          promptDraftId: draft.id,
          model: draft.model,
          versionCount: draft.versions.length,
        },
        uniqueRefs([
          `prompt-draft:${draft.id}`,
          ...brief.sourceIds.map((id) => `input-source:${id}`),
        ]),
      ),
      stop: false,
    };
  }

  private async executeFeedbackClusterStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (context.inputSourceIds.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少评论、差评、客服问题或私信输入源，无法聚类用户痛点。', {
          action: 'missing-user-feedback-source',
        }, [], 'WORKFLOW_USER_FEEDBACK_SOURCE_MISSING'),
        stop: true,
      };
    }

    const sources = (await this.inputSources.list(run.workspacePath)).filter((source) => context.inputSourceIds.includes(source.id));
    const explicitFeedbackSources = sources.filter((source) => source.purpose === 'user-feedback' && !source.tags.includes('workflow-run'));
    const insightSources = explicitFeedbackSources.length
      ? explicitFeedbackSources
      : sources.map((source) => source.tags.includes('workflow-run')
        ? {
            ...source,
            extractedText: run.inputs.source,
            summary: undefined,
          }
        : source);
    const insight = clusterUserFeedbackSources(insightSources);
    const output = {
      sourceIds: insight.sourceIds,
      sourceTitles: insight.sourceTitles,
      totalLines: insight.totalLines,
      clusterCount: insight.clusters.length,
      clusters: insight.clusters,
      matrix: insight.matrix,
      recommendedTags: insight.recommendedTags,
      titleDirections: insight.titleDirections,
      objectionResponses: insight.objectionResponses,
    };

    if (insight.sourceIds.length === 0 || insight.totalLines === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '没有找到可用的评论 / 客服原声，请先登记每行一条真实反馈。', {
          ...output,
          action: 'missing-user-feedback-source',
        }, [], 'WORKFLOW_USER_FEEDBACK_SOURCE_MISSING'),
        stop: true,
      };
    }

    if (insight.clusters.length === 0 || insight.titleDirections.length === 0 || insight.objectionResponses.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '评论原声不足以生成痛点矩阵、选题方向或客服话术，请补充更多真实反馈。', {
          ...output,
          action: 'insufficient-user-feedback-evidence',
        }, insight.sourceIds.map((id) => `input-source:${id}`), 'WORKFLOW_USER_FEEDBACK_EVIDENCE_INSUFFICIENT'),
        stop: true,
      };
    }

    const draft = await this.promptDrafts.createFromContent({
      workspacePath: run.workspacePath,
      workflowRunId: run.id,
      title: `${definition.title} 选题文案 Prompt`,
      purpose: 'article',
      userIntent: compactText(run.inputs.intent, definition.description),
      inputSourceIds: insight.sourceIds,
      content: formatFeedbackPromptContent(insight, run.inputs.intent),
      note: '由评论痛点聚类步骤生成，保留用户原声和客服边界',
      model: 'workflow-feedback-cluster',
      status: 'confirmed',
    });
    context.promptDraft = draft;
    context.promptContent = activeDraftContent(draft);

    return {
      run: this.patchStep(
        run,
        step,
        'succeeded',
        `已从 ${insight.totalLines} 条用户反馈中整理 ${insight.clusters.length} 类痛点、${insight.titleDirections.length} 个选题方向和 ${insight.objectionResponses.length} 条客服异议话术。`,
        {
          ...output,
          promptDraftId: draft.id,
          model: draft.model,
          versionCount: draft.versions.length,
        },
        uniqueRefs([
          `prompt-draft:${draft.id}`,
          ...insight.sourceIds.map((id) => `input-source:${id}`),
        ]),
      ),
      stop: false,
    };
  }

  private async executeAgentReadStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (context.inputSourceIds.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少可读输入源，无法开始对话。', {
          action: 'missing-input-source',
        }, [], 'WORKFLOW_INPUT_SOURCE_MISSING'),
        stop: true,
      };
    }

    const result = await this.agentSessions.start({
      workspacePath: run.workspacePath,
      workflowRunId: run.id,
      title: `${definition.title}协作`,
      purpose: promptPurposeFor(definition, step),
      userIntent: [
        compactText(run.inputs.intent, definition.description),
        context.ipKnowledgeBase
          ? [
              '',
              '已抽取 IP 知识库：',
              `身份：${context.ipKnowledgeBase.layers.identity}`,
              `价值观：${context.ipKnowledgeBase.layers.values}`,
              `语言：${context.ipKnowledgeBase.layers.language}`,
              `方法论：${context.ipKnowledgeBase.layers.methodology}`,
              `素材：${context.ipKnowledgeBase.layers.materials}`,
              `创作引擎：${context.ipKnowledgeBase.layers.engine}`,
              `场景延伸：${context.ipKnowledgeBase.extensionScenes.join(' / ')}`,
            ].join('\n')
          : '',
      ].filter(Boolean).join('\n'),
      inputSourceIds: context.inputSourceIds,
    });
    context.promptDraft = result.draft;
    context.agentSession = result.session;
    context.promptContent = activeDraftContent(result.draft);

    const blocked = result.session.status === 'blocked' || isBlockedDraft(result.draft);
    return {
      run: this.patchStep(
        run,
        step,
        blocked ? 'blocked' : 'succeeded',
        blocked ? '对话已保存，但文字模型未配置，等待配置后继续。' : '已读取输入源并生成首版提示词草稿。',
        {
          agentSessionId: result.session.id,
          promptDraftId: result.draft.id,
          model: result.draft.model,
          messageCount: result.session.messages.length,
        },
        [`agent-session:${result.session.id}`, `prompt-draft:${result.draft.id}`],
        blocked ? 'TEXT_PROVIDER_NOT_CONFIGURED' : undefined,
      ),
      stop: blocked,
    };
  }

  private async executePromptStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    let draft = context.promptDraft;
    if (!draft || draft.purpose !== promptPurposeFor(definition, step)) {
      draft = await this.promptDrafts.generate({
        workspacePath: run.workspacePath,
        workflowRunId: run.id,
        title: `${definition.title} ${step.kind === 'video-prompt' ? '视频 Prompt' : 'Prompt'} 草稿`,
        purpose: promptPurposeFor(definition, step),
        userIntent: compactText(run.inputs.intent, definition.description),
        inputSourceIds: context.inputSourceIds,
      });
      context.promptDraft = draft;
      context.promptContent = activeDraftContent(draft);
    }

    const blocked = isBlockedDraft(draft);
    return {
      run: this.patchStep(
        run,
        step,
        blocked ? 'blocked' : 'succeeded',
        blocked ? '提示词草稿已保存，但文字模型未配置，等待配置后继续。' : '已生成可下游使用的提示词草稿。',
        {
          promptDraftId: draft.id,
          purpose: draft.purpose,
          model: draft.model,
          versionCount: draft.versions.length,
          activeVersionId: draft.activeVersionId,
        },
        [`prompt-draft:${draft.id}`],
        blocked ? 'TEXT_PROVIDER_NOT_CONFIGURED' : undefined,
      ),
      stop: blocked,
    };
  }

  private async executeImageStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    const prompt = compactText(context.promptContent, run.inputs.intent);
    if (!prompt.trim()) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少可执行图片 Prompt。', {
          action: 'missing-prompt',
        }, [], 'WORKFLOW_PROMPT_MISSING'),
        stop: true,
      };
    }

    const result = await this.media.generateImage(baseImageRequest({
      run,
      context,
      prompt,
    }));
    const status = workflowStatusFromMedia(result);
    const reviews = status === 'succeeded'
      ? await this.createPendingAssetReviews(definition, run, step, result)
      : [];
    return {
      run: this.patchStep(
        run,
        step,
        status,
        result.message,
        {
          logId: result.logId,
          status: result.status,
          assetRefs: result.assetRefs,
          assetReviewIds: reviews.map((review) => review.id),
        },
        [
          `generation-log:${result.logId}`,
          ...result.assetRefs,
          ...reviews.map((review) => `asset-review:${review.id}`),
        ],
        status === 'blocked' || status === 'failed' ? result.message : undefined,
      ),
      stop: status !== 'succeeded',
    };
  }

  private async executeOverlayStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (!this.overlayCards) {
      return {
        run: this.patchStep(run, step, 'queued', '等待生成本地绿幕文案图。', {
          action: 'waiting-overlay-card-generation',
          promptDraftId: context.promptDraft?.id,
        }),
        stop: true,
      };
    }

    const cards = buildOverlayCardDrafts({
      source: run.inputs.source,
      intent: run.inputs.intent,
      promptContent: context.promptContent,
    });
    if (cards.length < 3) {
      return {
        run: this.patchStep(run, step, 'blocked', '脚本或卖点不足，无法拆成标题卡、卖点卡和行动卡。请补充口播脚本、卖点列表或 CTA 文案。', {
          action: 'insufficient-overlay-card-copy',
          promptDraftId: context.promptDraft?.id,
          cardCount: cards.length,
        }, context.promptDraft ? [`prompt-draft:${context.promptDraft.id}`] : [], 'WORKFLOW_OVERLAY_CARD_COPY_INSUFFICIENT'),
        stop: true,
      };
    }

    const generatedCards = await this.overlayCards.generate({
      workspacePath: run.workspacePath,
      promptDraftId: context.promptDraft?.id,
      cards,
    });
    const reviews = await this.createPendingOverlayReviews(definition, run, generatedCards);
    return {
      run: this.patchStep(
        run,
        step,
        'succeeded',
        `已生成 ${generatedCards.length} 张本地 9:16 绿幕文案图，等待人工审核。`,
        {
          promptDraftId: context.promptDraft?.id,
          overlayCardIds: generatedCards.map((card) => card.id),
          assetPaths: generatedCards.map((card) => card.assetPath),
          assetReviewIds: reviews.map((review) => review.id),
          cardTypes: generatedCards.map((card) => card.type),
        },
        uniqueRefs([
          ...generatedCards.map((card) => `overlay-card:${card.id}`),
          ...generatedCards.map((card) => card.assetPath),
          ...reviews.map((review) => `asset-review:${review.id}`),
        ]),
      ),
      stop: false,
    };
  }

  private async createPendingAssetReviews(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    result: MediaGenerationResult,
  ): Promise<AssetReviewRecord[]> {
    if (!this.assetReviews || result.assetRefs.length === 0) return [];

    const records: AssetReviewRecord[] = [];
    for (const [index, assetRef] of result.assetRefs.entries()) {
      records.push(await this.assetReviews.review({
        workspacePath: run.workspacePath,
        workflowRunId: run.id,
        assetKey: `generated:${result.logId}:${index}:${assetRef}`,
        kind: 'image',
        sourceType: 'generation-log',
        sourceId: result.logId,
        path: assetRef,
        title: basename(assetRef),
        status: 'pending',
        note: 'SOP 自动送审，等待人工确认后进入素材库或混剪包。',
        tags: uniqueRefs(['workflow-run', definition.key, step.id, ...definition.tags]),
      }));
    }
    return records;
  }

  private async createPendingOverlayReviews(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    cards: OverlayCardRecord[],
  ): Promise<AssetReviewRecord[]> {
    if (!this.assetReviews || cards.length === 0) return [];

    const records: AssetReviewRecord[] = [];
    for (const card of cards) {
      records.push(await this.assetReviews.review({
        workspacePath: run.workspacePath,
        workflowRunId: run.id,
        assetKey: `overlay:${card.id}`,
        kind: 'overlay',
        sourceType: 'overlay-card',
        sourceId: card.id,
        path: card.assetPath,
        title: card.title,
        status: 'pending',
        note: 'SOP 自动生成绿幕文案图，等待人工确认可读性后进入混剪包。',
        tags: uniqueRefs(['workflow-run', definition.key, ...definition.tags, ...card.tags]),
      }));
    }
    return records;
  }

  private patchStep(
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    status: WorkflowRunStatus,
    summary: string,
    output: unknown,
    refs: string[] = [],
    error?: string,
  ): WorkflowRunRecord {
    const now = new Date().toISOString();
    const completed = status !== 'queued' && status !== 'running';
    return {
      ...run,
      artifactRefs: uniqueRefs([...run.artifactRefs, ...refs]),
      steps: run.steps.map((item) => {
        if (item.stepId !== step.id) return item;
        const next: WorkflowRunStep = {
          ...item,
          status,
          summary,
          output,
          error,
          startedAt: completed ? item.startedAt ?? now : item.startedAt,
          completedAt: completed ? now : undefined,
        };
        return next;
      }),
    };
  }

  private finalizeRun(run: WorkflowRunRecord): WorkflowRunRecord {
    const failed = run.steps.find((step) => step.status === 'failed');
    if (failed) return { ...run, status: 'failed', summary: `执行失败于「${failed.title}」：${failed.summary ?? failed.error ?? '未知错误'}` };
    const blocked = run.steps.find((step) => step.status === 'blocked');
    if (blocked) return { ...run, status: 'blocked', summary: `阻塞于「${blocked.title}」：${blocked.summary ?? blocked.error ?? '等待处理'}` };
    const queued = run.steps.find((step) => step.status === 'queued');
    if (queued) return { ...run, status: 'queued', summary: `已执行到可停顿点，下一步等待「${queued.title}」。` };
    return { ...run, status: 'succeeded', summary: 'SOP 已完成。' };
  }
}
