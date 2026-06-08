import type {
  AgentPromptMessage,
  AgentPromptSourceSnapshot,
  AppServerBusinessObjectRef,
  AppServerRuntimeEvent,
  ContentKnowledgeReleaseReference,
  GeneratePromptDraftInput,
  InputSourceRecord,
  PromptDraftPurpose,
} from '../../shared/types';
import type { TextProviderRuntimeEvent } from '../providers/textGenerationProvider';
import {
  AppServerSidecarService,
  type AppServerPromptTurnResult,
  type AppServerTurnArtifact,
} from './appServerSidecarService';
import type { ModelConfigStore } from './modelConfigStore';
import { getOemRuntimeConfig } from './oemRuntimeConfig';
import type { SkillRuntimeContext } from './skillRuntimeContext';

const LIME_AGENT_SERVER_MODEL = 'lime-agent-server';

function purposeLabel(purpose: PromptDraftPurpose): string {
  if (purpose === 'image') return '图片生成';
  if (purpose === 'video') return '视频 Prompt';
  if (purpose === 'article') return '文案生成';
  if (purpose === 'green-screen') return '绿幕文案图';
  if (purpose === 'content-task') return '内容任务';
  if (purpose === 'sop') return '流程草案';
  return 'Skill';
}

function sourceKindLabel(kind: InputSourceRecord['kind'] | AgentPromptSourceSnapshot['kind']): string {
  if (kind === 'docx' || kind === 'markdown') return '文档';
  if (kind === 'image') return '图片';
  if (kind === 'video') return '视频';
  if (kind === 'sku-table') return 'SKU 表';
  if (kind === 'url') return '网页';
  if (kind === 'manual-note') return '手动记录';
  return '文本';
}

function sourcePurposeLabel(purpose: InputSourceRecord['purpose'] | AgentPromptSourceSnapshot['purpose']): string {
  const labels: Record<InputSourceRecord['purpose'], string> = {
    'brand-kb': '品牌 / 产品知识库',
    'ip-kb': 'IP 知识库',
    'ip-scenario-kb': 'IP 场景库',
    'competitor-observation': '竞品观察',
    reference: '参考素材',
    'product-brief': '产品资料',
    'user-feedback': '评论 / 客服问题',
    'task-input': '任务输入',
    'sop-input': '任务输入',
    'successful-asset': '成功素材',
  };
  return labels[purpose] ?? '输入资料';
}

function sourceStatusLabel(status: InputSourceRecord['status'] | AgentPromptSourceSnapshot['status']): string {
  if (status === 'converted') return '已生成可追溯转换稿';
  if (status === 'blocked') return '待补齐';
  if (status === 'failed') return '解析失败';
  return '已登记';
}

function teamKnowledgeReleaseDigest(release?: ContentKnowledgeReleaseReference): string {
  if (!release?.id) return '未选择团队知识包，本草稿只使用本轮输入源和用户意图。';
  return [
    `${release.title} ${release.version}`,
    release.contentKnowledgeMapTitle ? `内容知识地图：${release.contentKnowledgeMapTitle}` : '',
    release.packageUploadStatus ? `发布包状态：${release.packageUploadStatus}` : '',
    release.packagePublicUrl ? '发布包：已登记公开地址' : '',
  ].filter(Boolean).join('；');
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

function markdownContent(result: AppServerPromptTurnResult): string {
  const artifactContent = [...result.artifacts, ...result.evidenceArtifacts]
    .map((artifact) => artifact.content?.trim())
    .find((content): content is string => Boolean(content));
  if (artifactContent) return artifactContent;
  const messageContent = result.events
    .filter((event) => event.type === 'message.delta')
    .map((event) => textFromPayload(event.payload))
    .filter(Boolean)
    .join('\n')
    .trim();
  if (messageContent) return messageContent;
  throw new Error('Lime Agent Server 未返回 Prompt artifact。');
}

function formatDraftContent(input: GenerateAgentPromptDraftInput, content: string): string {
  return [
    `任务：${input.title?.trim() || `${purposeLabel(input.purpose)} Prompt 草稿`}`,
    '',
    '用户意图：',
    input.userIntent.trim(),
    '',
    '团队知识包：',
    teamKnowledgeReleaseDigest(input.teamKnowledgeRelease),
    '',
    'Prompt 草稿：',
    content.trim(),
  ].join('\n');
}

function formatRefinedContent(input: GenerateAgentPromptRefinementInput, content: string): string {
  return [
    content.trim(),
    '',
    '本轮调整：',
    input.adjustment.trim(),
  ].join('\n');
}

function titleFromArtifact(result: AppServerPromptTurnResult): string | undefined {
  return [...result.artifacts, ...result.evidenceArtifacts]
    .map((artifact) => artifact.title?.trim())
    .find((title): title is string => Boolean(title));
}

function modelFromResult(result: AppServerPromptTurnResult): string {
  const candidates = [
    ...result.artifacts.map((artifact) => payloadField(artifact, 'model')),
    ...result.evidenceArtifacts.map((artifact) => payloadField(artifact, 'model')),
    ...result.events.map((event) => payloadField(event, 'model')),
    ...result.evidenceEvents.map((event) => payloadField(event, 'model')),
  ].filter((value): value is string => Boolean(value));
  return candidates[0] ?? LIME_AGENT_SERVER_MODEL;
}

function payloadField(value: AppServerTurnArtifact | AppServerRuntimeEvent, field: string): string | undefined {
  const payload = 'payload' in value ? value.payload : undefined;
  if (!payload || typeof payload !== 'object') return undefined;
  const candidate = (payload as Record<string, unknown>)[field];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function textFromPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  return [record.text, record.summary, record.message]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';
}

function isFailedRuntimeEvent(event: AppServerRuntimeEvent): boolean {
  return event.type === 'turn.failed' || event.type.endsWith('.failed');
}

function providerEventClass(event: AppServerRuntimeEvent): TextProviderRuntimeEvent['eventClass'] {
  if (event.type === 'turn.completed') return 'model.completed';
  if (isFailedRuntimeEvent(event)) return 'model.failed';
  if (event.type === 'message.delta') return 'model.delta';
  if (event.type === 'artifact.snapshot') return 'artifact.changed';
  if (event.type === 'action.required') return 'action.required';
  if (event.type === 'action.resolved') return 'action.resolved';
  if (event.type === 'evidence.changed') return 'evidence.changed';
  if (event.type.startsWith('tool.')) return event.type === 'tool.failed' ? 'tool.failed' : event.type === 'tool.result' ? 'tool.result' : 'tool.started';
  return 'run.status';
}

function providerEventKind(event: AppServerRuntimeEvent): TextProviderRuntimeEvent['kind'] {
  if (event.type === 'artifact.snapshot') return 'draft';
  if (event.type === 'action.required' || event.type === 'action.resolved') return 'action';
  if (event.type === 'evidence.changed') return 'evidence';
  if (event.type.startsWith('tool.')) return 'tool';
  return 'model';
}

function providerEventStatus(event: AppServerRuntimeEvent): TextProviderRuntimeEvent['status'] {
  if (event.type === 'action.required') return 'pending';
  if (isFailedRuntimeEvent(event)) return 'failed';
  return 'completed';
}

function providerEventPhase(event: AppServerRuntimeEvent): TextProviderRuntimeEvent['phase'] {
  if (event.type === 'action.required') return 'action_required';
  if (event.type === 'message.delta') return 'streaming';
  if (isFailedRuntimeEvent(event)) return 'failed';
  if (event.type.startsWith('tool.')) return 'tool_running';
  return 'completed';
}

function providerEventsFromResult(result: AppServerPromptTurnResult, model: string): TextProviderRuntimeEvent[] {
  return [
    {
      eventClass: 'model.requested',
      kind: 'model',
      status: 'completed',
      phase: 'waiting_provider',
      title: 'Lime Agent Server requested',
      detail: model,
      model,
      payload: {
        runtime: 'lime-agent-server',
        sessionId: result.sessionId,
        turnId: result.turnId,
      },
    },
    ...result.events.map((event): TextProviderRuntimeEvent => ({
      eventClass: providerEventClass(event),
      kind: providerEventKind(event),
      status: providerEventStatus(event),
      phase: providerEventPhase(event),
      title: `Lime Agent Server ${event.type}`,
      detail: textFromPayload(event.payload) || event.type,
      model,
      payload: {
        runtime: 'lime-agent-server',
        sessionId: event.sessionId ?? result.sessionId,
        turnId: event.turnId ?? result.turnId,
        eventType: event.type,
        eventId: event.eventId,
        rawPayload: event.payload,
      },
    })),
  ];
}

function selectedSkillSlugs(input: { selectedSkillSlugs?: string[]; skillContext: SkillRuntimeContext }): string[] {
  return input.selectedSkillSlugs?.length
    ? input.selectedSkillSlugs
    : input.skillContext.skillRefs.map((skill) => skill.slug);
}

function promptDraftBusinessObjectRef(input: GenerateAgentPromptDraftInput): AppServerBusinessObjectRef {
  return {
    kind: 'promptDraft',
    id: input.workflowRunId ?? input.teamKnowledgeRelease?.id ?? input.inputSourceIds[0] ?? `prompt-draft:${input.purpose}`,
    title: input.title?.trim() || `${purposeLabel(input.purpose)} Prompt 草稿`,
    metadata: {
      operation: 'draft',
      purpose: input.purpose,
      workflowRunId: input.workflowRunId,
      teamKnowledgeReleaseId: input.teamKnowledgeRelease?.id,
      inputSourceIds: input.inputSourceIds,
      sceneCardIds: input.sceneCardIds ?? [],
    },
  };
}

function promptRefinementBusinessObjectRef(input: GenerateAgentPromptRefinementInput): AppServerBusinessObjectRef {
  return {
    kind: 'promptDraft',
    id: input.promptDraftId ?? input.sessionId ?? `prompt-refine:${input.purpose}`,
    title: `${purposeLabel(input.purpose)} Prompt 续写`,
    metadata: {
      operation: 'refine',
      purpose: input.purpose,
      sessionId: input.sessionId,
      promptDraftId: input.promptDraftId,
      sourceCount: input.sourceSnapshots.length,
    },
  };
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
  protocol?: undefined;
  providerEvents?: TextProviderRuntimeEvent[];
}

export interface GenerateAgentPromptRefinementInput {
  workspacePath: string;
  sessionId?: string;
  promptDraftId?: string;
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
  protocol?: undefined;
  providerEvents?: TextProviderRuntimeEvent[];
}

export class AppServerPromptAgentService {
  constructor(
    private readonly appServer: AppServerSidecarService,
    private readonly modelConfig: ModelConfigStore,
  ) {}

  async generatePromptDraft(input: GenerateAgentPromptDraftInput): Promise<GenerateAgentPromptDraftResult> {
    const blockedSources = input.selectedSources.filter((source) => source.status === 'blocked' || source.status === 'failed');
    const backendConfig = await this.resolveBackendConfig(input.textModel);
    const prompt = [
      `你是${getOemRuntimeConfig().productName}内容工厂的 Prompt 生成 Agent。`,
      '请基于用户意图、输入源、团队知识包和 skill 约束生成可直接复制到下游的 Markdown Prompt 草稿。',
      '只使用输入源中可追溯的信息，不编造功效、背书、品牌数据或用户案例。',
      '',
      `下游用途：${purposeLabel(input.purpose)}`,
      `用户意图：${input.userIntent.trim()}`,
      input.sceneCardIds?.length ? `场景卡：已选择 ${input.sceneCardIds.length} 张` : '未选择场景卡。',
      `团队知识包：${teamKnowledgeReleaseDigest(input.teamKnowledgeRelease)}`,
      '',
      input.skillContext.promptText ? '本轮 skill 执行规范：' : '',
      input.skillContext.promptText,
      input.skillContext.promptText ? '' : '',
      '本地输入源：',
      sourceMaterialForModel(input.selectedSources),
      '',
      '输出要求：',
      '- 直接输出完整 Markdown，不要解释生成过程。',
      '- 必须包含目标、事实来源约束、主体/场景/动作/文案结构、风格、负面约束、需要人工确认的缺口。',
      '- 如果输入源存在 blocked 或 failed，必须在“需要人工确认”中保留提醒。',
    ].filter(Boolean).join('\n');
    const result = await this.appServer.runPromptTurn({
      workspacePath: input.workspacePath,
      prompt,
      permissionMode: 'ask',
      selectedSkillSlugs: selectedSkillSlugs(input),
      metadata: {
        purpose: input.purpose,
        workflowRunId: input.workflowRunId,
        textModel: backendConfig.model,
        textProtocol: backendConfig.protocol,
        agentSurface: 'prompt-workbench',
        operation: 'draft',
      },
      businessObjectRef: promptDraftBusinessObjectRef(input),
      backendEnv: backendConfig.env,
    });
    const model = modelFromResult(result);
    return {
      title: titleFromArtifact(result),
      content: formatDraftContent(input, markdownContent(result)),
      note: [
        `Lime Agent Server 完成：${model}`,
        input.skillContext.skillRefs.length ? `已应用 ${input.skillContext.skillRefs.length} 个 skill：${input.skillContext.summaryText}` : '',
        blockedSources.length ? `包含 ${blockedSources.length} 个未解析输入源，已在提醒中保留人工确认。` : '',
      ].filter(Boolean).join('；'),
      model,
      protocol: undefined,
      providerEvents: providerEventsFromResult(result, model),
    };
  }

  async generateRefinedPrompt(input: GenerateAgentPromptRefinementInput): Promise<GenerateAgentPromptRefinementResult> {
    const backendConfig = await this.resolveBackendConfig(input.textModel);
    const prompt = [
      `你是${getOemRuntimeConfig().productName}内容工厂的 Prompt 多轮调整 Agent。`,
      '请基于会话输入源、已有 Prompt 草稿和用户本轮调整要求改写完整 Markdown Prompt。',
      '必须保留来源约束，不编造输入源没有的卖点、功效、背书或用户案例。',
      '',
      `下游用途：${purposeLabel(input.purpose)}`,
      '',
      input.skillContext.promptText ? '本轮 skill 执行规范：' : '',
      input.skillContext.promptText,
      input.skillContext.promptText ? '' : '',
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
      '输出要求：',
      '- 直接输出改写后的完整 Markdown，不要解释生成过程。',
      '- 如果仍需追问或来源存在风险，必须保留在 Markdown 的“仍需追问 / 人工确认”或“来源与合规提醒”段落。',
    ].filter(Boolean).join('\n');
    const result = await this.appServer.runPromptTurn({
      workspacePath: input.workspacePath,
      prompt,
      permissionMode: 'ask',
      selectedSkillSlugs: input.skillContext.skillRefs.map((skill) => skill.slug),
      metadata: {
        purpose: input.purpose,
        textModel: backendConfig.model,
        textProtocol: backendConfig.protocol,
        agentSurface: 'prompt-workbench',
        operation: 'refine',
      },
      businessObjectRef: promptRefinementBusinessObjectRef(input),
      backendEnv: backendConfig.env,
    });
    const model = modelFromResult(result);
    return {
      content: formatRefinedContent(input, markdownContent(result)),
      note: [
        `Lime Agent Server 调整完成：${model}`,
        input.skillContext.skillRefs.length ? `已应用 ${input.skillContext.skillRefs.length} 个 skill：${input.skillContext.summaryText}` : '',
      ].filter(Boolean).join('；'),
      model,
      protocol: undefined,
      providerEvents: providerEventsFromResult(result, model),
    };
  }

  private async resolveBackendConfig(textModel?: string): Promise<{
    protocol: string;
    model: string;
    env: NodeJS.ProcessEnv;
  }> {
    const view = await this.modelConfig.readView();
    const apiKey = await this.modelConfig.getTextApiKey();
    const model = textModel?.trim() || view.textModel;
    return {
      protocol: view.textProtocol,
      model,
      env: {
        CONTENT_STUDIO_TEXT_PROTOCOL: view.textProtocol,
        CONTENT_STUDIO_TEXT_MODEL: model,
        CONTENT_STUDIO_TEXT_BASE_URL: view.textApiEndpoint,
        CONTENT_STUDIO_TEXT_API_KEY: apiKey ?? '',
        LLM_PROTOCOL: view.textProtocol,
        LLM_MODEL: model,
        LLM_BASE_URL: view.textApiEndpoint,
      },
    };
  }
}
