import { isClaudeModelName, type AgentPromptMessage, type AgentPromptSourceSnapshot, type GeneratePromptDraftInput, type InputSourceRecord, type PromptDraftPurpose, type TextGenerationProtocol } from '../../shared/types';
import {
  createTextProvider,
  TextProviderBlockedError,
  TextProviderFailedError,
  type GenerateJsonInput,
  type TextGenerationOutput,
  type TextRuntimeConfig,
} from '../providers/textGenerationProvider';
import { getOemRuntimeConfig } from './oemRuntimeConfig';
import { ModelConfigStore } from './modelConfigStore';
import { SettingsStore } from './settingsStore';
import { TextGenerationService } from './textGenerationService';
import type { SkillRuntimeContext } from './skillRuntimeContext';

const DEFAULT_CLAUDE_AGENT_MODEL = 'claude-sonnet-4-5';

function requiresExplicitTextKey(): boolean {
  return process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY === '1';
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

const REFINE_PROMPT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['prompt', 'followUpQuestions', 'sourceWarnings'],
  properties: {
    prompt: { type: 'string' },
    followUpQuestions: { type: 'array', items: { type: 'string' } },
    sourceWarnings: { type: 'array', items: { type: 'string' } },
  },
};

interface RefinePromptOutput {
  prompt: string;
  followUpQuestions: string[];
  sourceWarnings: string[];
}

function normalizeList(values: string[] | undefined): string[] {
  return (values ?? []).map((value) => String(value).trim()).filter(Boolean).slice(0, 8);
}

function sourceSnapshotText(sources: AgentPromptSourceSnapshot[]): string {
  if (sources.length === 0) return '未选择输入源。';
  return sources.map((source, index) => [
    `${index + 1}. ${source.title}`,
    `资料类型：${sourcePurposeLabel(source.purpose)} / ${sourceKindLabel(source.kind)} / ${sourceStatusLabel(source.status)}`,
    source.markdownPath ? '转换稿：已生成可追溯转换稿' : '',
    source.summary ? `摘要：${source.summary}` : '',
    source.blockedReason ? `待补齐原因：${source.blockedReason}` : '',
  ].filter(Boolean).join('\n')).join('\n\n');
}

function compactMessages(messages: AgentPromptMessage[]): string {
  return messages.slice(-12).map((message) => [
    `${message.role}/${message.kind}`,
    message.model ? `model: ${message.model}` : '',
    message.content.slice(0, 2400),
  ].filter(Boolean).join('\n')).join('\n\n');
}

function formatRefinedContent(previousContent: string, adjustment: string, output: RefinePromptOutput): string {
  const prompt = String(output.prompt ?? '').trim();
  return [
    prompt || previousContent,
    '',
    '本轮调整：',
    adjustment.trim(),
    '',
    normalizeList(output.followUpQuestions).length ? '仍需追问 / 人工确认：' : '',
    ...normalizeList(output.followUpQuestions).map((item, index) => `${index + 1}. ${item}`),
    '',
    normalizeList(output.sourceWarnings).length ? '来源与合规提醒：' : '',
    ...normalizeList(output.sourceWarnings).map((item, index) => `${index + 1}. ${item}`),
  ].filter((line) => line !== '').join('\n');
}

function fallbackRefinedContent(previousContent: string, adjustment: string, reason: string): string {
  return [
    previousContent,
    '',
    '本轮调整要求：',
    adjustment.trim(),
    '',
    '处理状态：',
    `文字模型未完成，本轮只记录调整意图，原因：${reason}`,
  ].join('\n');
}

export interface GenerateAgentPromptDraftInput extends GeneratePromptDraftInput {
  selectedSources: InputSourceRecord[];
  skillContext: SkillRuntimeContext;
  textModel?: string;
}

export interface GenerateAgentPromptDraftResult {
  title?: string;
  content: string;
  note: string;
  model: string;
  protocol?: TextGenerationProtocol;
}

export interface GenerateAgentPromptRefinementInput {
  workspacePath: string;
  purpose: PromptDraftPurpose;
  previousContent: string;
  adjustment: string;
  sourceSnapshots: AgentPromptSourceSnapshot[];
  messages: AgentPromptMessage[];
  skillContext: SkillRuntimeContext;
  textModel?: string;
}

export interface GenerateAgentPromptRefinementResult {
  content: string;
  note: string;
  model: string;
  protocol?: TextGenerationProtocol;
}

export class ClaudePromptAgentService {
  private readonly textGeneration: TextGenerationService;

  constructor(
    private readonly settings: SettingsStore,
    private readonly modelConfig: ModelConfigStore,
    textGeneration?: TextGenerationService,
  ) {
    this.textGeneration = textGeneration ?? new TextGenerationService(modelConfig);
  }

  async generateJson<T>(input: GenerateJsonInput): Promise<TextGenerationOutput<T>> {
    if (!(await this.shouldUseClaudeSdk(input.model))) {
      return this.textGeneration.generateJson<T>(input);
    }
    const runtime = await this.getRuntimeConfig(input.model);
    return createTextProvider('claude-sdk').generateJson<T>(input, runtime);
  }

  async generatePromptDraft(input: GenerateAgentPromptDraftInput): Promise<GenerateAgentPromptDraftResult> {
    const blockedSources = input.selectedSources.filter((source) => source.status === 'blocked' || source.status === 'failed');
    const skillContext = input.skillContext;
    try {
      const result = await this.generateJson<PromptDraftModelOutput>({
        workspacePath: input.workspacePath,
        model: input.textModel,
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
          sourceMaterialForModel(input.selectedSources),
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
          `由 Claude SDK 生成：${result.model}`,
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
        content: buildLocalPromptContent(input, input.selectedSources, skillContext, reason),
        note: [
          `文字模型未完成，已生成本地可追溯草稿：${reason}`,
          skillContext.skillRefs.length ? `已记录 ${skillContext.skillRefs.length} 个本轮 skill：${skillContext.summaryText}` : '',
        ].filter(Boolean).join('；'),
        model: error instanceof TextProviderBlockedError ? 'blocked:text-provider' : 'fallback:local-rule',
        protocol: undefined,
      };
    }
  }

  async generateRefinedPrompt(input: GenerateAgentPromptRefinementInput): Promise<GenerateAgentPromptRefinementResult> {
    const skillContext = input.skillContext;
    try {
      const result = await this.generateJson<RefinePromptOutput>({
        workspacePath: input.workspacePath,
        model: input.textModel,
        systemPrompt: [
          `你是${getOemRuntimeConfig().productName}内容工厂的 Prompt 多轮调整 Agent。`,
          '你必须基于会话输入源、已有 Prompt 草稿和用户本轮调整要求改写 Prompt。',
          '必须保留来源约束，不编造输入源没有的卖点、功效、背书或用户案例。',
          '如果调整要求缺少必要信息，要给出追问；如果来源存在 blocked，要提醒人工确认。',
          skillContext.promptText ? '本轮会话绑定了 skills，你必须持续遵守这些执行规范。' : '',
        ].join('\n'),
        prompt: [
          `下游用途：${input.purpose}`,
          '',
          skillContext.promptText ? '本轮 skill 执行规范：' : '',
          skillContext.promptText,
          skillContext.promptText ? '' : '',
          '输入源快照：',
          sourceSnapshotText(input.sourceSnapshots),
          '',
          '会话记录：',
          compactMessages(input.messages),
          '',
          '当前 Prompt 草稿：',
          input.previousContent,
          '',
          '本轮用户调整要求：',
          input.adjustment,
          '',
          '请返回改写后的完整 Prompt 正文，并列出仍需追问和来源风险。',
        ].join('\n'),
        schema: REFINE_PROMPT_SCHEMA,
        maxTurns: 2,
      });
      return {
        content: formatRefinedContent(input.previousContent, input.adjustment, result.value),
        note: [
          `Agent 多轮调整：${result.model}`,
          skillContext.skillRefs.length ? `已应用 ${skillContext.skillRefs.length} 个 skill：${skillContext.summaryText}` : '',
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
        content: fallbackRefinedContent(input.previousContent, input.adjustment, reason),
        note: `Agent 多轮调整未完成，已记录本轮要求：${reason}`,
        model: error instanceof TextProviderBlockedError ? 'blocked:text-provider' : 'fallback:local-rule',
        protocol: undefined,
      };
    }
  }

  private async shouldUseClaudeSdk(modelOverride?: string): Promise<boolean> {
    const trimmedOverride = modelOverride?.trim();
    if (trimmedOverride) return isClaudeModelName(trimmedOverride);
    const view = await this.modelConfig.readView();
    return view.textProtocol === 'claude-sdk';
  }

  private async getRuntimeConfig(modelOverride?: string): Promise<TextRuntimeConfig> {
    const view = await this.modelConfig.readView();
    const trimmedOverride = modelOverride?.trim();
    if (trimmedOverride && !isClaudeModelName(trimmedOverride)) {
      throw new TextProviderBlockedError('Claude SDK 只支持 Claude 系列模型，请在模型设置中选择 Claude 模型后再启动会话。');
    }
    const configuredClaudeModel = isClaudeModelName(view.textModel) ? view.textModel : DEFAULT_CLAUDE_AGENT_MODEL;
    const model = trimmedOverride || configuredClaudeModel;
    const storedTextKey = view.textProtocol === 'claude-sdk' ? await this.modelConfig.getTextApiKey() : undefined;
    const apiKey = await this.settings.getAnthropicApiKey() || storedTextKey || process.env.ANTHROPIC_API_KEY;
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (!apiKey && !oauthToken && view.textApiKeyStatus === 'requires-reauthorization') {
      throw new TextProviderBlockedError('文字 API Key 已保存，但当前系统无法解密。请在设置 - 模型中重新保存文字 API Key 后再启动会话。');
    }
    if (!apiKey && !oauthToken && requiresExplicitTextKey()) {
      throw new TextProviderBlockedError('Claude SDK Agent 未配置：请先登录 Claude Code，或保存 Anthropic / Claude API Key。');
    }
    return {
      apiKey,
      baseUrl: process.env.CONTENT_STUDIO_CLAUDE_BASE_URL || (view.textProtocol === 'claude-sdk' ? view.textApiEndpoint : 'https://api.anthropic.com'),
      model,
      protocol: 'claude-sdk',
    };
  }
}
