import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  AgentPromptMessage,
  AgentPromptSession,
  AgentPromptSessionResult,
  AgentPromptSourceSnapshot,
  ContinueAgentPromptSessionInput,
  InputSourceRecord,
  PromptDraft,
  PromptDraftVersion,
  StartAgentPromptSessionInput,
} from '../../shared/types';
import { isClaudeModelName } from '../../shared/types';
import { isReusablePromptInputSource } from '../../shared/inputSourcePolicy';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { InputSourceStore } from './inputSourceStore';
import { getOemRuntimeConfig } from './oemRuntimeConfig';
import { PromptDraftStore } from './promptDraftStore';
import { TextGenerationService, TextProviderBlockedError, TextProviderFailedError } from './textGenerationService';
import type {
  GenerateAgentPromptDraftInput,
  GenerateAgentPromptDraftResult,
  GenerateAgentPromptRefinementInput,
  GenerateAgentPromptRefinementResult,
} from './claudePromptAgentService';

function sessionsFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'agent-prompt-sessions.json');
}

function activeVersion(draft: PromptDraft): PromptDraftVersion {
  return draft.versions.find((version) => version.id === draft.activeVersionId) ?? draft.versions[draft.versions.length - 1];
}

function snapshotSource(source: InputSourceRecord): AgentPromptSourceSnapshot {
  return {
    sourceId: source.id,
    title: source.title,
    kind: source.kind,
    purpose: source.purpose,
    status: source.status,
    summary: source.summary,
    markdownPath: source.markdownPath,
    blockedReason: source.blockedReason,
  };
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

interface AgentPromptModelService {
  generatePromptDraft(input: GenerateAgentPromptDraftInput): Promise<GenerateAgentPromptDraftResult>;
  generateRefinedPrompt(input: GenerateAgentPromptRefinementInput): Promise<GenerateAgentPromptRefinementResult>;
}

export class AgentPromptSessionStore {
  constructor(
    private readonly inputSources: InputSourceStore,
    private readonly promptDrafts: PromptDraftStore,
    private readonly textGeneration: TextGenerationService,
    private readonly promptAgent?: AgentPromptModelService,
  ) {}

  async list(workspacePath: string): Promise<AgentPromptSession[]> {
    const sessions = await readJsonFile<AgentPromptSession[]>(sessionsFilePath(workspacePath), []);
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async start(input: StartAgentPromptSessionInput): Promise<AgentPromptSessionResult> {
    if (!input.userIntent.trim()) throw new Error('启动 Agent 会话需要先填写用户意图。');
    const allSources = await this.inputSources.list(input.workspacePath);
    const selectedSources = allSources.filter((source) => input.inputSourceIds.includes(source.id) && isReusablePromptInputSource(source));
    const inputSourceIds = selectedSources.map((source) => source.id);
    let draft: PromptDraft;
    if (this.promptAgent) {
      const generated = await this.promptAgent.generatePromptDraft({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        title: input.title,
        purpose: input.purpose,
        userIntent: input.userIntent,
        inputSourceIds,
        sceneCardIds: input.sceneCardIds,
        selectedSources,
        textModel: input.textModel,
      });
      draft = await this.promptDrafts.createFromContent({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        title: input.title?.trim() || generated.title || '模型生成 Prompt 草稿',
        purpose: input.purpose,
        userIntent: input.userIntent.trim(),
        inputSourceIds,
        sceneCardIds: input.sceneCardIds ?? [],
        content: generated.content,
        note: generated.note,
        model: generated.model,
        textProtocol: generated.protocol,
      });
    } else {
      draft = await this.promptDrafts.generate({
        workspacePath: input.workspacePath,
        workflowRunId: input.workflowRunId,
        title: input.title,
        purpose: input.purpose,
        userIntent: input.userIntent,
        inputSourceIds,
        sceneCardIds: input.sceneCardIds,
      });
    }
    const now = new Date().toISOString();
    const firstVersion = activeVersion(draft);
    const sourceSnapshots = selectedSources.map(snapshotSource);
    const messages: AgentPromptMessage[] = [
      {
        id: randomUUID(),
        role: 'user',
        kind: 'intent',
        content: [
          '用户意图：',
          input.userIntent.trim(),
          '',
          '输入源快照：',
          sourceSnapshotText(sourceSnapshots),
        ].join('\n'),
        createdAt: now,
      },
      {
        id: randomUUID(),
        role: 'assistant',
        kind: 'draft',
        content: firstVersion.content,
        model: draft.model,
        promptDraftId: draft.id,
        createdAt: now,
      },
    ];
    const session: AgentPromptSession = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      workflowRunId: input.workflowRunId,
      title: input.title?.trim() || draft.title,
      purpose: input.purpose,
      status: draft.model?.startsWith('blocked:') ? 'blocked' : 'draft-created',
      userIntent: input.userIntent.trim(),
      inputSourceIds,
      sceneCardIds: input.sceneCardIds ?? [],
      promptDraftIds: [draft.id],
      sourceSnapshots,
      messages,
      model: draft.model,
      textProtocol: draft.textProtocol,
      createdAt: now,
      updatedAt: now,
    };
    const existing = await this.list(input.workspacePath);
    await writeJsonFile(sessionsFilePath(input.workspacePath), [session, ...existing].slice(0, 120));
    return { session, draft };
  }

  async continue(input: ContinueAgentPromptSessionInput): Promise<AgentPromptSessionResult> {
    const adjustment = input.message.trim();
    if (!adjustment) throw new Error('继续 Agent 会话需要填写调整要求。');
    const sessions = await this.list(input.workspacePath);
    const session = sessions.find((item) => item.id === input.sessionId);
    if (!session) throw new Error(`Agent 会话不存在: ${input.sessionId}`);
    const draftId = session.promptDraftIds[session.promptDraftIds.length - 1];
    const draft = (await this.promptDrafts.list(input.workspacePath)).find((item) => item.id === draftId);
    if (!draft) throw new Error(`Agent 会话关联的 Prompt 草稿不存在: ${draftId}`);

    const previousContent = activeVersion(draft).content;
    const generated = this.promptAgent
      ? await this.promptAgent.generateRefinedPrompt({
        workspacePath: input.workspacePath,
        purpose: session.purpose,
        previousContent,
        adjustment,
        sourceSnapshots: session.sourceSnapshots,
        messages: session.messages,
        textModel: input.textModel ?? (isClaudeModelName(session.model) ? session.model : undefined),
      })
      : await this.generateRefinedContent(session, previousContent, adjustment);
    const updatedDraft = await this.promptDrafts.update({
      workspacePath: input.workspacePath,
      draftId: draft.id,
      content: generated.content,
      note: generated.note,
      model: generated.model,
      textProtocol: generated.protocol,
    });
    const now = new Date().toISOString();
    const updatedSession: AgentPromptSession = {
      ...session,
      status: generated.model.startsWith('blocked:') ? 'blocked' : 'draft-created',
      promptDraftIds: session.promptDraftIds.includes(updatedDraft.id)
        ? session.promptDraftIds
        : [...session.promptDraftIds, updatedDraft.id],
      messages: [
        ...session.messages,
        {
          id: randomUUID(),
          role: 'user' as const,
          kind: 'adjustment' as const,
          content: adjustment,
          promptDraftId: updatedDraft.id,
          createdAt: now,
        },
        {
          id: randomUUID(),
          role: 'assistant' as const,
          kind: 'draft' as const,
          content: generated.content,
          model: generated.model,
          promptDraftId: updatedDraft.id,
          createdAt: now,
        },
      ].slice(-80),
      model: generated.model,
      textProtocol: updatedDraft.textProtocol ?? session.textProtocol,
      updatedAt: now,
    };
    await writeJsonFile(
      sessionsFilePath(input.workspacePath),
      sessions.map((item) => (item.id === session.id ? updatedSession : item)),
    );
    return { session: updatedSession, draft: updatedDraft };
  }

  private async generateRefinedContent(
    session: AgentPromptSession,
    previousContent: string,
    adjustment: string,
  ): Promise<{ content: string; note: string; model: string; protocol?: AgentPromptSession['textProtocol'] }> {
    try {
      const result = await this.textGeneration.generateJson<RefinePromptOutput>({
        workspacePath: session.workspacePath,
        systemPrompt: [
          `你是${getOemRuntimeConfig().productName}内容工厂的 Prompt 多轮调整 Agent。`,
          '你必须基于会话输入源、已有 Prompt 草稿和用户本轮调整要求改写 Prompt。',
          '必须保留来源约束，不编造输入源没有的卖点、功效、背书或用户案例。',
          '如果调整要求缺少必要信息，要给出追问；如果来源存在 blocked，要提醒人工确认。',
        ].join('\n'),
        prompt: [
          `下游用途：${session.purpose}`,
          '',
          '输入源快照：',
          sourceSnapshotText(session.sourceSnapshots),
          '',
          '会话记录：',
          compactMessages(session.messages),
          '',
          '当前 Prompt 草稿：',
          previousContent,
          '',
          '本轮用户调整要求：',
          adjustment,
          '',
          '请返回改写后的完整 Prompt 正文，并列出仍需追问和来源风险。',
        ].join('\n'),
        schema: REFINE_PROMPT_SCHEMA,
        maxTurns: 2,
      });
      return {
        content: formatRefinedContent(previousContent, adjustment, result.value),
        note: `Agent 多轮调整：${result.model}`,
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
        content: fallbackRefinedContent(previousContent, adjustment, reason),
        note: `Agent 多轮调整未完成，已记录本轮要求：${reason}`,
        model: error instanceof TextProviderBlockedError ? 'blocked:text-provider' : 'fallback:local-rule',
        protocol: undefined,
      };
    }
  }
}
