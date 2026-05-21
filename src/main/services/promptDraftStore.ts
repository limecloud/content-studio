import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  GeneratePromptDraftInput,
  InputSourceRecord,
  PromptDraft,
  PromptDraftPurpose,
  PromptDraftStatus,
  PromptDraftVersion,
  RecordPromptDraftCopyInput,
  UpdatePromptDraftInput,
} from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { InputSourceStore } from './inputSourceStore';
import { TextGenerationService, TextProviderBlockedError, TextProviderFailedError } from './textGenerationService';

function promptDraftsFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'prompt-drafts.json');
}

function purposeLabel(purpose: PromptDraftPurpose): string {
  if (purpose === 'image') return '图片生成';
  if (purpose === 'video') return '视频 Prompt';
  if (purpose === 'article') return '文案生成';
  if (purpose === 'green-screen') return '绿幕文案图';
  if (purpose === 'sop') return 'SOP';
  return 'Skill';
}

function sourceDigest(sources: InputSourceRecord[]): string {
  if (sources.length === 0) return '当前没有选择输入源，只能基于用户意图生成草稿。';
  return sources.map((source, index) => {
    const content = source.extractedText || source.summary || source.blockedReason || source.title;
    return `${index + 1}. ${source.title}（${source.kind}/${source.status}）：${content.slice(0, 280)}`;
  }).join('\n');
}

function sourceMaterialForModel(sources: InputSourceRecord[]): string {
  if (sources.length === 0) return '未选择输入源。';
  let remaining = 18_000;
  return sources.map((source, index) => {
    const rawContent = source.extractedText || source.summary || source.blockedReason || source.title;
    const content = rawContent.slice(0, Math.max(600, Math.min(4_000, remaining)));
    remaining -= content.length;
    return [
      `### 输入源 ${index + 1}: ${source.title}`,
      `id: ${source.id}`,
      `kind/status/purpose: ${source.kind}/${source.status}/${source.purpose}`,
      source.markdownPath ? `markdownPath: ${source.markdownPath}` : '',
      source.sourcePath ? `sourcePath: ${source.sourcePath}` : '',
      source.blockedReason ? `blockedReason: ${source.blockedReason}` : '',
      'content:',
      content,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function buildLocalPromptContent(input: GeneratePromptDraftInput, sources: InputSourceRecord[], reason?: string): string {
    const sourceText = sourceDigest(sources);
    const purpose = purposeLabel(input.purpose);
    const sceneContext = input.sceneCardIds?.length
      ? `已选择场景卡：${input.sceneCardIds.join(', ')}`
      : '未选择场景卡。';
    return [
      `任务：生成${purpose}可执行 Prompt。`,
      '',
      '用户意图：',
      input.userIntent.trim(),
      '',
      '场景引用：',
      sceneContext,
      '',
      '可用输入源：',
      sourceText,
    '',
    '输出要求：',
    '- 只使用输入源和用户意图中能追溯的信息，不编造卖点、功效、背书或平台数据。',
    '- 先给主体、场景、动作、镜头 / 文案结构，再给风格和质量约束。',
    '- 如输入源包含 blocked 项，保留“需要人工确认 / 需要模型解析”的标记，不把 blocked 信息当成已解析事实。',
    '- 输出可以直接复制到下游生成模块，但仍允许人工继续改写。',
    reason ? `- 本草稿为本地降级生成，原因：${reason}` : '',
    '',
    'Prompt 草稿：',
    `${purpose}。围绕「${input.userIntent.trim()}」组织内容，参考上述输入源，保持真实、克制、可追溯。`,
  ].filter(Boolean).join('\n');
}

const PROMPT_DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'prompt', 'followUpQuestions', 'sourceWarnings', 'qualityChecklist'],
  properties: {
    title: { type: 'string' },
    prompt: { type: 'string' },
    followUpQuestions: { type: 'array', items: { type: 'string' } },
    sourceWarnings: { type: 'array', items: { type: 'string' } },
    qualityChecklist: { type: 'array', items: { type: 'string' } },
  },
};

interface PromptDraftModelOutput {
  title: string;
  prompt: string;
  followUpQuestions: string[];
  sourceWarnings: string[];
  qualityChecklist: string[];
}

function normalizeModelOutput(value: PromptDraftModelOutput): PromptDraftModelOutput {
  return {
    title: value.title?.trim() || '模型生成 Prompt 草稿',
    prompt: value.prompt?.trim() || '',
    followUpQuestions: (value.followUpQuestions ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    sourceWarnings: (value.sourceWarnings ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8),
    qualityChecklist: (value.qualityChecklist ?? []).map((item) => item.trim()).filter(Boolean).slice(0, 8),
  };
}

function formatModelPromptContent(input: GeneratePromptDraftInput, output: PromptDraftModelOutput): string {
  const purpose = purposeLabel(input.purpose);
  return [
    `任务：${purpose} Prompt 草稿`,
    '',
    '用户意图：',
    input.userIntent.trim(),
    '',
    'Prompt 草稿：',
    output.prompt,
    '',
    output.followUpQuestions.length ? '需要追问 / 人工确认：' : '',
    ...output.followUpQuestions.map((item, index) => `${index + 1}. ${item}`),
    '',
    output.sourceWarnings.length ? '来源与合规提醒：' : '',
    ...output.sourceWarnings.map((item, index) => `${index + 1}. ${item}`),
    '',
    output.qualityChecklist.length ? '下游检查清单：' : '',
    ...output.qualityChecklist.map((item, index) => `${index + 1}. ${item}`),
  ].filter((line) => line !== '').join('\n');
}

function activeVersion(draft: PromptDraft): PromptDraftVersion {
  return draft.versions.find((version) => version.id === draft.activeVersionId) ?? draft.versions[draft.versions.length - 1];
}

export class PromptDraftStore {
  constructor(
    private readonly inputSources: InputSourceStore,
    private readonly textGeneration: TextGenerationService,
  ) {}

  async list(workspacePath: string): Promise<PromptDraft[]> {
    const drafts = await readJsonFile<PromptDraft[]>(promptDraftsFilePath(workspacePath), []);
    return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async generate(input: GeneratePromptDraftInput): Promise<PromptDraft> {
    if (!input.userIntent.trim()) throw new Error('生成 Prompt 草稿需要先填写用户意图。');
    const allSources = await this.inputSources.list(input.workspacePath);
    const selectedSources = allSources.filter((source) => input.inputSourceIds.includes(source.id));
    const now = new Date().toISOString();
    const generated = await this.generateDraftContent(input, selectedSources);
    const firstVersion: PromptDraftVersion = {
      id: randomUUID(),
      version: 1,
      content: generated.content,
      note: generated.note,
      createdAt: now,
    };
    const draft: PromptDraft = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      title: input.title?.trim() || generated.title || `${purposeLabel(input.purpose)} Prompt 草稿`,
      purpose: input.purpose,
      status: 'draft',
      userIntent: input.userIntent.trim(),
      inputSourceIds: input.inputSourceIds,
      sceneCardIds: input.sceneCardIds ?? [],
      copyCount: 0,
      model: generated.model,
      versions: [firstVersion],
      activeVersionId: firstVersion.id,
      createdAt: now,
      updatedAt: now,
    };
    const existing = await this.list(input.workspacePath);
    await writeJsonFile(promptDraftsFilePath(input.workspacePath), [draft, ...existing].slice(0, 200));
    return draft;
  }

  async createFromContent(input: {
    workspacePath: string;
    title: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    sceneCardIds?: string[];
    content: string;
    note?: string;
    model?: string;
    status?: PromptDraftStatus;
  }): Promise<PromptDraft> {
    if (!input.userIntent.trim()) throw new Error('创建 Prompt 草稿需要先填写用户意图。');
    if (!input.content.trim()) throw new Error('Prompt 草稿内容不能为空。');
    const now = new Date().toISOString();
    const firstVersion: PromptDraftVersion = {
      id: randomUUID(),
      version: 1,
      content: input.content.trim(),
      note: input.note?.trim() || '由执行器生成首版草稿',
      createdAt: now,
    };
    const draft: PromptDraft = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      title: input.title.trim() || `${purposeLabel(input.purpose)} Prompt 草稿`,
      purpose: input.purpose,
      status: input.status ?? 'draft',
      userIntent: input.userIntent.trim(),
      inputSourceIds: input.inputSourceIds,
      sceneCardIds: input.sceneCardIds ?? [],
      copyCount: 0,
      model: input.model,
      versions: [firstVersion],
      activeVersionId: firstVersion.id,
      createdAt: now,
      updatedAt: now,
    };
    const existing = await this.list(input.workspacePath);
    await writeJsonFile(promptDraftsFilePath(input.workspacePath), [draft, ...existing].slice(0, 200));
    return draft;
  }

  private async generateDraftContent(
    input: GeneratePromptDraftInput,
    selectedSources: InputSourceRecord[],
  ): Promise<{ title?: string; content: string; note: string; model: string }> {
    const blockedSources = selectedSources.filter((source) => source.status === 'blocked' || source.status === 'failed');
    try {
      const result = await this.textGeneration.generateJson<PromptDraftModelOutput>({
        workspacePath: input.workspacePath,
        systemPrompt: [
          '你是布谷AI内容工厂的 Prompt 生成 Agent。',
          '你会读取用户选择的本地输入源文本，结合用户意图生成可执行 Prompt 草稿。',
          '必须把知识库当事实源：只使用输入源中可追溯的信息，不编造功效、背书、品牌数据或用户案例。',
          '如果资料缺失，要输出需要追问的问题；如果输入源被 blocked，要明确提醒人工确认。',
          '输出的 prompt 要可直接进入图片、视频 Prompt、文案、绿幕文案图、SOP 或 Skill 下游，但仍允许用户多轮调整。',
        ].join('\n'),
        prompt: [
          `下游用途：${purposeLabel(input.purpose)}`,
          `用户意图：${input.userIntent.trim()}`,
          input.sceneCardIds?.length ? `场景卡 ID：${input.sceneCardIds.join(', ')}` : '未选择场景卡。',
          '',
          '本地输入源：',
          sourceMaterialForModel(selectedSources),
          '',
          '请生成结构化 Prompt 草稿。Prompt 正文必须包含：目标、事实来源约束、主体/场景/动作/文案结构、风格、负面约束、需要人工确认的缺口。',
        ].join('\n'),
        schema: PROMPT_DRAFT_SCHEMA,
        maxTurns: 2,
      });
      const output = normalizeModelOutput(result.value);
      if (!output.prompt) throw new TextProviderFailedError('文字模型没有返回 Prompt 正文。');
      return {
        title: output.title,
        content: formatModelPromptContent(input, output),
        note: [
          `由文字模型生成：${result.model}`,
          blockedSources.length ? `包含 ${blockedSources.length} 个未解析输入源，已在提醒中保留人工确认。` : '',
        ].filter(Boolean).join('；'),
        model: result.model,
      };
    } catch (error) {
      const reason = error instanceof TextProviderBlockedError
        ? error.message
        : error instanceof TextProviderFailedError
          ? `文字模型生成失败：${error.message}`
          : `文字模型生成异常：${error instanceof Error ? error.message : String(error)}`;
      return {
        content: buildLocalPromptContent(input, selectedSources, reason),
        note: `文字模型未完成，已生成本地可追溯草稿：${reason}`,
        model: error instanceof TextProviderBlockedError ? 'blocked:text-provider' : 'fallback:local-rule',
      };
    }
  }

  async update(input: UpdatePromptDraftInput): Promise<PromptDraft> {
    const drafts = await this.list(input.workspacePath);
    const draft = drafts.find((item) => item.id === input.draftId);
    if (!draft) throw new Error(`Prompt 草稿不存在: ${input.draftId}`);
    if (!input.content.trim()) throw new Error('Prompt 草稿内容不能为空。');
    const now = new Date().toISOString();
    const latest = activeVersion(draft);
    const nextVersion: PromptDraftVersion = {
      id: randomUUID(),
      version: latest.version + 1,
      content: input.content.trim(),
      note: input.note?.trim() || '人工调整版本',
      createdAt: now,
    };
    const updated: PromptDraft = {
      ...draft,
      status: input.status ?? draft.status,
      model: input.model ?? draft.model,
      materializedTarget: input.materializedTarget ?? draft.materializedTarget,
      versions: [...draft.versions, nextVersion].slice(-40),
      activeVersionId: nextVersion.id,
      updatedAt: now,
    };
    await writeJsonFile(
      promptDraftsFilePath(input.workspacePath),
      drafts.map((item) => (item.id === input.draftId ? updated : item)),
    );
    return updated;
  }

  async recordCopy(input: RecordPromptDraftCopyInput): Promise<PromptDraft> {
    const drafts = await this.list(input.workspacePath);
    const draft = drafts.find((item) => item.id === input.draftId);
    if (!draft) throw new Error(`Prompt 草稿不存在: ${input.draftId}`);
    const updated: PromptDraft = {
      ...draft,
      copyCount: (draft.copyCount ?? 0) + 1,
      lastCopiedAt: new Date().toISOString(),
      lastCopiedTarget: input.target?.trim() || 'external-video-platform',
      updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(
      promptDraftsFilePath(input.workspacePath),
      drafts.map((item) => (item.id === input.draftId ? updated : item)),
    );
    return updated;
  }
}
