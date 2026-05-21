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
import { buildScenePromptGroupContent } from '../../shared/scenePromptComposer';
import { basename } from 'node:path';
import { existsSync } from 'node:fs';
import { MediaProvider } from '../providers/mediaProvider';
import { BrandKnowledgeBaseStore } from './brandKnowledgeBaseStore';
import { AgentPromptSessionStore } from './agentPromptSessionStore';
import { AssetReviewStore } from './assetReviewStore';
import { InputSourceStore } from './inputSourceStore';
import { IpKnowledgeBaseStore } from './ipKnowledgeBaseStore';
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
  if (definition.key.includes('image') || definition.key.includes('seeding')) return 'product-brief';
  return 'sop-input';
}

function promptPurposeFor(definition: WorkflowDefinition, step?: WorkflowStepDefinition): PromptDraftPurpose {
  if (step?.kind === 'video-prompt' || definition.key.includes('video')) return 'video';
  if (step?.kind === 'generate-prompt-group' && definition.key.includes('article')) return 'article';
  if (step?.kind === 'generate-prompt-group' && definition.key.includes('video')) return 'video';
  if (step?.kind === 'generate-prompt-group') return 'image';
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
  if (source.purpose === 'ip-kb' || definition.key.includes('ip') || definition.key.includes('longform')) return 'profile';
  if (source.purpose === 'brand-kb') return 'brand';
  if (source.purpose === 'product-brief') return 'product';
  if (source.purpose === 'reference') return 'scenario-script';
  return definition.key.includes('video') ? 'scenario-script' : 'product';
}

function citationFromInputSource(source: InputSourceRecord, definition: WorkflowDefinition): KnowledgeCitation | null {
  const excerpt = clipCitationExcerpt(source.extractedText || source.summary);
  if (!excerpt) return null;
  return {
    knowledgeBaseId: `input-source:${source.id}`,
    sectionId: source.markdownPath ? 'markdown' : 'summary',
    title: `${source.title} / ${source.purpose}`,
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
  prompt: string;
}): ImageGenerationRequest {
  return {
    workspacePath: input.run.workspacePath,
    productImageRefs: [],
    referenceImageRefs: [],
    prompt: input.prompt,
    promptMode: 'free',
    generationMode: 'smart',
    template: '场景图',
    watermark: false,
    citations: [],
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
  ) {}

  async startRun(input: StartWorkflowRunInput): Promise<WorkflowRunRecord> {
    const definitions = await this.workflows.listDefinitions(input.workspacePath);
    const definition = definitions.find((item) => item.id === input.workflowDefinitionId);
    if (!definition) throw new Error(`工作流定义不存在: ${input.workflowDefinitionId}`);

    let run = await this.workflows.startRun(input);
    if (run.steps[0]?.error === 'WORKFLOW_REQUIRED_INPUT_MISSING') return run;

    const context: WorkflowExecutionContext = { inputSourceIds: input.inputSourceIds ?? [] };
    for (const step of definition.steps) {
      const result = await this.executeStep(definition, run, step, context);
      run = result.run;
      if (result.stop) break;
    }

    return this.workflows.updateRun(this.finalizeRun(run));
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
        return this.executeBrandKnowledgeStep(definition, run, step, context);
      }
      if (step.kind === 'build-ip-knowledge-base') {
        return this.executeIpKnowledgeStep(definition, run, step, context);
      }
      if (step.kind === 'generate-prompt-pack') {
        return this.executePromptPackStep(definition, run, step, context);
      }
      if (step.kind === 'generate-scene-library') {
        return this.executeSceneLibraryStep(definition, run, step, context);
      }
      if (step.kind === 'generate-prompt-group') {
        return this.executePromptGroupStep(definition, run, step, context);
      }
      if (step.kind === 'agent-read') {
        return this.executeAgentReadStep(definition, run, step, context);
      }
      if (step.kind === 'reference-reverse') {
        return this.executeReferenceReverseStep(definition, run, step, context);
      }
      if (step.kind === 'prompt-generate' || step.kind === 'video-prompt') {
        return this.executePromptStep(definition, run, step, context);
      }
      if (step.kind === 'image-generate') {
        return this.executeImageStep(definition, run, step, context);
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
      if (step.kind === 'overlay-generate') {
        return {
          run: this.patchStep(run, step, 'queued', '等待生成本地绿幕文案图。', {
            action: 'waiting-overlay-card-generation',
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
    const text = [
      `# ${definition.title}`,
      '',
      '## 输入源',
      compactText(run.inputs.source),
      '',
      '## 用户意图',
      compactText(run.inputs.intent),
      '',
      '## 审核人',
      compactText(run.inputs.reviewOwner),
    ].join('\n');
    const source = await this.inputSources.register({
      workspacePath: run.workspacePath,
      kind: 'manual-note',
      purpose,
      title: `${definition.title} / ${new Date(run.createdAt).toLocaleString()}`,
      text,
      summary: compactText(run.inputs.intent, definition.description),
      tags: ['workflow-run', definition.key, run.id],
    });

    const importedSources: InputSourceRecord[] = [];
    for (const filePath of extractLocalFilePaths(run.inputs.source)) {
      importedSources.push(await this.inputSources.importFile(run.workspacePath, filePath, purpose, {
        tags: ['workflow-run', definition.key, 'auto-import'],
      }));
    }

    context.inputSourceIds = uniqueRefs([
      ...context.inputSourceIds,
      source.id,
      ...importedSources.map((item) => item.id),
    ]);
    const sourceRecords = (await this.inputSources.list(run.workspacePath))
      .filter((item) => context.inputSourceIds.includes(item.id));
    const explicitCitations = run.citations ?? [];
    const importedSourceIds = new Set(importedSources.map((item) => item.id));
    const citationSourceRecords = explicitCitations.length > 0
      ? sourceRecords.filter((item) => importedSourceIds.has(item.id))
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

    return this.patchStep(nextRun, step, 'succeeded', '已登记 SOP 输入源，并生成可追溯 Markdown。', {
      inputSourceId: source.id,
      importedInputSourceIds: importedSources.map((item) => item.id),
      sourceStatus: source.status,
      markdownPath: source.markdownPath,
      citationCount: nextCitations.length,
      artifactRefs: uniqueRefs([
        ...source.artifactRefs,
        ...importedSources.flatMap((item) => item.artifactRefs),
      ]),
    }, uniqueRefs([
      `input-source:${source.id}`,
      ...importedSources.map((item) => `input-source:${item.id}`),
      ...source.artifactRefs,
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
      name: `${run.inputs.source?.trim() || definition.title} 提示词包`,
      citations,
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
      promptPackId: promptPack.id,
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
        run: this.patchStep(run, step, 'blocked', '缺少参考图 / 参考视频输入源，无法进行对标图反推。', {
          action: 'missing-reference-source',
          inputSourceIds: context.inputSourceIds,
        }, [], 'WORKFLOW_REFERENCE_SOURCE_MISSING'),
        stop: true,
      };
    }

    const result = await this.referenceReverse.generate({
      workspacePath: run.workspacePath,
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
        '已通过真实视觉理解服务完成对标图反推，并生成图片 PromptDraft。',
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

  private async executeAgentReadStep(
    definition: WorkflowDefinition,
    run: WorkflowRunRecord,
    step: WorkflowStepDefinition,
    context: WorkflowExecutionContext,
  ): Promise<{ run: WorkflowRunRecord; stop: boolean }> {
    if (context.inputSourceIds.length === 0) {
      return {
        run: this.patchStep(run, step, 'blocked', '缺少可读输入源，无法启动 Agent 会话。', {
          action: 'missing-input-source',
        }, [], 'WORKFLOW_INPUT_SOURCE_MISSING'),
        stop: true,
      };
    }

    const result = await this.agentSessions.start({
      workspacePath: run.workspacePath,
      title: `${definition.title} Agent 会话`,
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
        blocked ? 'Agent 会话已保存，但文字模型未配置，等待配置后继续。' : 'Agent 会话已读取输入源并生成首版 PromptDraft。',
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
        blocked ? 'PromptDraft 已保存，但文字模型未配置，等待配置后继续。' : '已生成可下游使用的 PromptDraft。',
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
