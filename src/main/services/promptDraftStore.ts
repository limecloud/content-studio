import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  CreatePromptDraftFromContentInput,
  GeneratePromptDraftInput,
  InputSourceRecord,
  PromptDraft,
  PromptDraftPurpose,
  PromptDraftVersion,
  RecordPromptDraftCopyInput,
  UpdatePromptDraftInput,
} from '../../shared/types';
import { isReusablePromptInputSource } from '../../shared/inputSourcePolicy';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { InputSourceStore } from './inputSourceStore';
import { getOemRuntimeConfig } from './oemRuntimeConfig';
import { SkillManager } from './skillManager';
import { buildSkillRuntimeContext, type SkillRuntimeContext } from './skillRuntimeContext';
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

function sourceKindLabel(kind: InputSourceRecord['kind']): string {
  if (kind === 'docx' || kind === 'markdown') return '文档';
  if (kind === 'image') return '图片';
  if (kind === 'video') return '视频';
  if (kind === 'sku-table') return 'SKU 表';
  if (kind === 'url') return '网页';
  if (kind === 'manual-note') return '手动记录';
  return '文本';
}

function sourcePurposeLabel(purpose: InputSourceRecord['purpose']): string {
  const labels: Record<InputSourceRecord['purpose'], string> = {
    'brand-kb': '品牌 / 产品知识库',
    'ip-kb': 'IP 知识库',
    'ip-scenario-kb': 'IP 场景库',
    reference: '参考素材',
    'product-brief': '产品资料',
    'user-feedback': '评论 / 客服问题',
    'sop-input': '任务输入',
    'successful-asset': '成功素材',
  };
  return labels[purpose] ?? '输入资料';
}

function sourceStatusLabel(status: InputSourceRecord['status']): string {
  if (status === 'converted') return '已生成可追溯转换稿';
  if (status === 'blocked') return '待补齐';
  if (status === 'failed') return '解析失败';
  return '已登记';
}

function sourceDigest(sources: InputSourceRecord[]): string {
  if (sources.length === 0) return '当前没有选择输入源，只能基于用户意图生成草稿。';
  return sources.map((source, index) => {
    const content = source.extractedText || source.summary || source.blockedReason || source.title;
    return `${index + 1}. ${source.title}（${sourcePurposeLabel(source.purpose)} / ${sourceStatusLabel(source.status)}）：${content.slice(0, 280)}`;
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
      `### 输入资料 ${index + 1}: ${source.title}`,
      `资料类型：${sourcePurposeLabel(source.purpose)} / ${sourceKindLabel(source.kind)} / ${sourceStatusLabel(source.status)}`,
      source.markdownPath ? '转换稿：已生成可追溯转换稿' : '',
      source.sourcePath ? '原始文件：已导入工作区' : '',
      source.blockedReason ? `待补齐原因：${source.blockedReason}` : '',
      '资料内容：',
      content,
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function buildLocalPromptContent(
  input: GeneratePromptDraftInput,
  sources: InputSourceRecord[],
  skillContext: SkillRuntimeContext,
  reason?: string,
): string {
  const sourceText = sourceDigest(sources);
  const purpose = purposeLabel(input.purpose);
  const sceneContext = input.sceneCardIds?.length
    ? `已选择 ${input.sceneCardIds.length} 张场景卡`
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
    '本轮 skills：',
    skillContext.summaryText,
    '',
    '输出要求：',
    skillContext.promptText ? '- 必须按本轮选择的 skill 执行规范组织输出；不适用时要说明原因。' : '',
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
    private readonly skills = new SkillManager(),
  ) {}

  async list(workspacePath: string): Promise<PromptDraft[]> {
    const drafts = await readJsonFile<PromptDraft[]>(promptDraftsFilePath(workspacePath), []);
    return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async generate(input: GeneratePromptDraftInput): Promise<PromptDraft> {
    if (!input.userIntent.trim()) throw new Error('生成 Prompt 草稿需要先填写用户意图。');
    const allSources = await this.inputSources.list(input.workspacePath);
    const selectedSources = allSources.filter((source) => input.inputSourceIds.includes(source.id) && isReusablePromptInputSource(source));
    const inputSourceIds = selectedSources.map((source) => source.id);
    const skillContext = await buildSkillRuntimeContext(this.skills, input.workspacePath, input);
    const now = new Date().toISOString();
    const generated = await this.generateDraftContent(input, selectedSources, skillContext);
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
      workflowRunId: input.workflowRunId,
      title: input.title?.trim() || generated.title || `${purposeLabel(input.purpose)} Prompt 草稿`,
      purpose: input.purpose,
      status: 'draft',
      userIntent: input.userIntent.trim(),
      inputSourceIds,
      sceneCardIds: input.sceneCardIds ?? [],
      selectedSkills: skillContext.skillRefs,
      copyCount: 0,
      model: generated.model,
      textProtocol: generated.protocol,
      versions: [firstVersion],
      activeVersionId: firstVersion.id,
      createdAt: now,
      updatedAt: now,
    };
    const existing = await this.list(input.workspacePath);
    await writeJsonFile(promptDraftsFilePath(input.workspacePath), [draft, ...existing].slice(0, 200));
    return draft;
  }

  async createFromContent(input: CreatePromptDraftFromContentInput): Promise<PromptDraft> {
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
      workflowRunId: input.workflowRunId,
      title: input.title.trim() || `${purposeLabel(input.purpose)} Prompt 草稿`,
      purpose: input.purpose,
      status: input.status ?? 'draft',
      userIntent: input.userIntent.trim(),
      inputSourceIds: input.inputSourceIds,
      sceneCardIds: input.sceneCardIds ?? [],
      selectedSkills: input.selectedSkills ?? [],
      copyCount: 0,
      model: input.model,
      textProtocol: input.textProtocol,
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
    skillContext: SkillRuntimeContext,
  ): Promise<{ title?: string; content: string; note: string; model: string; protocol?: PromptDraft['textProtocol'] }> {
    const blockedSources = selectedSources.filter((source) => source.status === 'blocked' || source.status === 'failed');
    try {
      const result = await this.textGeneration.generateJson<PromptDraftModelOutput>({
        workspacePath: input.workspacePath,
        systemPrompt: [
          `你是${getOemRuntimeConfig().productName}内容工厂的 Prompt 生成 Agent。`,
          '你会读取用户选择的本地输入源文本，结合用户意图生成可执行 Prompt 草稿。',
          '必须把知识库当事实源：只使用输入源中可追溯的信息，不编造功效、背书、品牌数据或用户案例。',
          '如果资料缺失，要输出需要追问的问题；如果输入源被 blocked，要明确提醒人工确认。',
          '输出的 prompt 要可直接进入图片、视频 Prompt、文案、绿幕文案图、SOP 或 Skill 下游，但仍允许用户多轮调整。',
          skillContext.promptText ? '本轮用户选择了 skills，你必须先学习并遵守这些执行规范。' : '',
        ].join('\n'),
        prompt: [
          `下游用途：${purposeLabel(input.purpose)}`,
          `用户意图：${input.userIntent.trim()}`,
          input.sceneCardIds?.length ? `场景卡：已选择 ${input.sceneCardIds.length} 张` : '未选择场景卡。',
          '',
          skillContext.promptText ? '本轮 skill 执行规范：' : '',
          skillContext.promptText,
          skillContext.promptText ? '' : '',
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
          skillContext.skillRefs.length ? `已应用 ${skillContext.skillRefs.length} 个 skill：${skillContext.summaryText}` : '',
          blockedSources.length ? `包含 ${blockedSources.length} 个未解析输入源，已在提醒中保留人工确认。` : '',
        ].filter(Boolean).join('；'),
        model: result.model,
        protocol: result.protocol,
      };
    } catch (error) {
      const reason = error instanceof TextProviderBlockedError
        ? error.message
        : error instanceof TextProviderFailedError
          ? `文字模型生成失败：${error.message}`
          : `文字模型生成异常：${error instanceof Error ? error.message : String(error)}`;
      return {
        content: buildLocalPromptContent(input, selectedSources, skillContext, reason),
        note: [
          `文字模型未完成，已生成本地可追溯草稿：${reason}`,
          skillContext.skillRefs.length ? `已记录 ${skillContext.skillRefs.length} 个本轮 skill：${skillContext.summaryText}` : '',
        ].filter(Boolean).join('；'),
        model: error instanceof TextProviderBlockedError ? 'blocked:text-provider' : 'fallback:local-rule',
        protocol: undefined,
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
      textProtocol: input.textProtocol ?? draft.textProtocol,
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
