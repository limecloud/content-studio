import type {
  AgentPromptMessage,
  AgentPromptSourceSnapshot,
  AppServerBusinessObjectRef,
  AppServerRuntimeEvent,
  ContentKnowledgeReleaseReference,
  GeneratePromptDraftInput,
  InputSourceRecord,
  ModelConfigView,
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
import type { PlatformHostBridgeClient } from './platformHostBridgeClient';
import type { SkillRuntimeContext } from './skillRuntimeContext';
import type { PlatformAgentRuntimeResult, PlatformRuntimeEvent } from '../../shared/types';

const LIME_AGENT_SERVER_MODEL = 'lime-agent-server';
const PLATFORM_AGENT_EVENT_POLL_MS = 300;

function appServerProviderPreference(view: ModelConfigView): string {
  if (view.platformManaged && view.agentProviderPreference) return view.agentProviderPreference;
  if (view.textProtocol === 'anthropic-messages') return 'anthropic-compatible';
  if (view.textProtocol === 'gemini-generate-content') return 'gemini';
  return 'openai';
}

function resolvePromptAgentModel(view: ModelConfigView, textModel?: string): string {
  const requestedModel = textModel?.trim();
  if (view.platformManaged) {
    const textModels = view.textModels ?? [];
    if (requestedModel && textModels.includes(requestedModel)) return requestedModel;
    if (view.textModel && textModels.includes(view.textModel)) return view.textModel;
    return textModels[0] || '';
  }
  return requestedModel || view.textModel;
}

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
  if (artifactContent) return verifiedArtifactContent(artifactContent);
  const messageContent = finalMessageContent(result.events);
  if (messageContent) return verifiedArtifactContent(messageContent);
  throw new Error('协作生成服务未返回可交付 Prompt。');
}

function finalMessageContent(events: AppServerRuntimeEvent[]): string {
  const deltas = events
    .filter((event) => event.type === 'message.delta_batch' || event.type === 'message.delta')
    .map((event) => textFromPayload(event.payload))
    .filter(Boolean);
  if (deltas.length) return deltas.join('').trim();
  return events
    .filter((event) => event.type === 'message')
    .map((event) => textFromMessagePayload(event.payload))
    .filter(Boolean)
    .join('')
    .trim();
}

function textFromMessagePayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  const message = record.message;
  if (!message || typeof message !== 'object') return textFromPayload(payload);
  const content = (message as Record<string, unknown>).content;
  if (typeof content === 'string') return content.trim();
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => part && typeof part === 'object' ? (part as Record<string, unknown>).text : undefined)
    .filter((text): text is string => typeof text === 'string' && text.length > 0)
    .join('')
    .trim();
}

function verifiedArtifactContent(content: string): string {
  const internalPromptMarkers = [
    '内容工厂的 Prompt 生成 Agent',
    '请基于用户意图、输入源、团队知识包和 skill 约束',
    '输入源快照：',
    '本轮 skill 执行规范',
    '团队知识包：',
    '本地输入源：',
    '输出要求：',
  ];
  if (internalPromptMarkers.some((marker) => content.includes(marker))) {
    throw new Error('协作生成服务返回了请求上下文回显，未返回可交付 Prompt。');
  }
  return content;
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

function modelFromPlatformResult(result: PlatformAgentRuntimeResult): string {
  const runtimeContext = result.runtimeContext;
  if (runtimeContext && typeof runtimeContext === 'object') {
    const modelProfile = (runtimeContext as Record<string, unknown>).modelProfile;
    if (modelProfile && typeof modelProfile === 'object') {
      const modelId = (modelProfile as Record<string, unknown>).modelId;
      if (typeof modelId === 'string' && modelId.trim()) return modelId.trim();
    }
  }
  const eventModel = (result.events ?? [])
    .map((event) => payloadField(event, 'model'))
    .find((model): model is string => Boolean(model));
  return eventModel ?? LIME_AGENT_SERVER_MODEL;
}

function payloadField(value: AppServerTurnArtifact | AppServerRuntimeEvent | PlatformRuntimeEvent, field: string): string | undefined {
  const payload = 'payload' in value ? value.payload : undefined;
  if (!payload || typeof payload !== 'object') return undefined;
  const candidate = (payload as Record<string, unknown>)[field];
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : undefined;
}

function artifactFromPlatformEvent(event: PlatformRuntimeEvent): AppServerTurnArtifact | undefined {
  if (event.type !== 'artifact.snapshot') return undefined;
  const payload = event.payload;
  if (!payload || typeof payload !== 'object') return undefined;
  const record = payload as Record<string, unknown>;
  const artifactId = [record.artifactId, record.artifactRef, record.id]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const content = [record.content, record.text, record.markdown]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  if (!artifactId && !content) return undefined;
  return {
    artifactId,
    artifactRef: typeof record.artifactRef === 'string' ? record.artifactRef : artifactId,
    title: typeof record.title === 'string' ? record.title : undefined,
    kind: typeof record.kind === 'string' ? record.kind : undefined,
    path: typeof record.path === 'string' ? record.path : undefined,
    content,
    payload,
  };
}

function appServerEventFromPlatformEvent(event: PlatformRuntimeEvent): AppServerRuntimeEvent {
  return {
    eventId: `${event.sessionId}:${event.turnId ?? 'turn'}:${event.sequence ?? 0}:${event.type}`,
    sequence: event.sequence,
    sessionId: event.sessionId,
    threadId: event.threadId,
    turnId: event.turnId,
    type: event.type,
    payload: event.payload,
  };
}

async function promptTurnResultFromPlatform(
  result: PlatformAgentRuntimeResult,
  onRuntimeEvent?: (event: AppServerRuntimeEvent) => void | Promise<void>,
): Promise<AppServerPromptTurnResult> {
  if (!result.ok) {
    throw new Error(result.message || result.readiness?.reasons[0]?.message || '平台 lime.agent runtime 当前不可用。');
  }
  const sessionId = result.sessionId ?? result.appServer?.session?.sessionId;
  const turnId = result.turnId ?? result.appServer?.turn?.turnId;
  if (!sessionId || !turnId) {
    throw new Error('平台协作运行未返回完整会话事实，未生成可交付 Prompt。');
  }
  if (!result.events?.length) {
    throw new Error('平台协作运行未返回运行事件，未生成可交付 Prompt。');
  }
  const events = (result.events ?? []).map(appServerEventFromPlatformEvent);
  await emitRuntimeEvents(events, onRuntimeEvent);
  const artifacts = (result.events ?? [])
    .map(artifactFromPlatformEvent)
    .filter((artifact): artifact is AppServerTurnArtifact => Boolean(artifact));
  return {
    sessionId,
    turnId,
    events,
    artifacts,
    evidenceEvents: [],
    evidenceArtifacts: [],
  };
}

function textFromPayload(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  return [record.text, record.summary, record.message]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';
}

function nestedPayloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
}

function firstPayloadString(...values: unknown[]): string | undefined {
  return values
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim();
}

function classifyToolEvent(event: AppServerRuntimeEvent): Record<string, unknown> {
  if (!event.type.startsWith('tool.')) return {};
  const payload = nestedPayloadRecord(event.payload);
  const metadata = nestedPayloadRecord(payload.metadata);
  const rawToolName = firstPayloadString(
    payload.toolName,
    payload.tool_name,
    payload.name,
    payload.tool,
    payload.functionName,
    payload.function_name,
    metadata.toolName,
    metadata.tool_name,
  );
  const toolName = rawToolName ?? 'unknown-tool';
  const normalized = toolName.toLowerCase();
  const explicitFamily = firstPayloadString(payload.toolFamily, payload.tool_family, metadata.toolFamily, metadata.tool_family);
  const isWebSearchTool = /(^|[._-])web[._-]?search($|[._-])/.test(normalized) || normalized === 'websearch';
  const isWebFetchTool = /(^|[._-])web[._-]?fetch($|[._-])/.test(normalized) || normalized === 'webfetch';
  const family = explicitFamily
    ?? (isWebSearchTool ? 'webSearch'
      : isWebFetchTool ? 'webFetch'
        : normalized.startsWith('mcp__') ? 'mcp'
          : normalized.includes('skill') || normalized.includes('loadskill') || normalized.includes('listskills') ? 'skill'
            : 'tool');
  const parts = toolName.split('__');
  const mcpServer = normalized.startsWith('mcp__') && parts.length >= 3 ? parts[1] : undefined;
  const skillSlug = family === 'skill'
    ? firstPayloadString(payload.skillSlug, payload.skill_slug, metadata.skillSlug, metadata.skill_slug, payload.slug)
    : undefined;
  return {
    toolName,
    toolFamily: family,
    ...(mcpServer ? { mcpServer } : {}),
    ...(skillSlug ? { skillSlug } : {}),
  };
}

function isFailedRuntimeEvent(event: AppServerRuntimeEvent): boolean {
  return event.type === 'turn.failed' || event.type.endsWith('.failed');
}

function providerEventClass(event: AppServerRuntimeEvent): TextProviderRuntimeEvent['eventClass'] {
  if (event.type === 'turn.final_done' || event.type === 'turn.completed') return 'model.completed';
  if (event.type === 'message.delta' || event.type === 'message.delta_batch') return 'model.delta';
  if (event.type === 'artifact.snapshot') return 'artifact.changed';
  if (event.type === 'action.required') return 'action.required';
  if (event.type === 'action.resolved') return 'action.resolved';
  if (event.type === 'evidence.changed') return 'evidence.changed';
  if (event.type.startsWith('tool.')) return event.type === 'tool.failed' ? 'tool.failed' : event.type === 'tool.result' ? 'tool.result' : 'tool.started';
  if (isFailedRuntimeEvent(event)) return 'model.failed';
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
  if (event.type === 'message.delta' || event.type === 'message.delta_batch') return 'streaming';
  if (isFailedRuntimeEvent(event)) return 'failed';
  if (event.type.startsWith('tool.')) return 'tool_running';
  return 'completed';
}

function providerEventTitle(event: AppServerRuntimeEvent): string {
  const eventClass = providerEventClass(event);
  const tool = classifyToolEvent(event);
  const toolName = typeof tool.toolName === 'string' ? tool.toolName : '';
  const toolFamily = typeof tool.toolFamily === 'string' ? tool.toolFamily : '';
  if (eventClass === 'model.delta') return '生成内容返回中';
  if (eventClass === 'model.completed') return '模型生成完成';
  if (eventClass === 'model.failed') return '模型生成失败';
  if (eventClass === 'artifact.changed') return '交付草稿已更新';
  if (eventClass === 'action.required') return '需要人工处理';
  if (eventClass === 'action.resolved') return '人工处理完成';
  if (eventClass === 'evidence.changed') return '来源证据已更新';
  if (eventClass === 'tool.started') return `${toolFamilyLabel(toolFamily)}开始处理${toolName ? `：${toolName}` : ''}`;
  if (eventClass === 'tool.result') return `${toolFamilyLabel(toolFamily)}处理完成${toolName ? `：${toolName}` : ''}`;
  if (eventClass === 'tool.failed') return `${toolFamilyLabel(toolFamily)}处理失败${toolName ? `：${toolName}` : ''}`;
  return '协作状态已更新';
}

function toolFamilyLabel(family: string): string {
  if (family === 'webSearch') return '网页搜索';
  if (family === 'webFetch') return '网页读取';
  if (family === 'mcp') return 'MCP 工具';
  if (family === 'skill') return 'Skill';
  return '工具';
}

function providerEventDetail(event: AppServerRuntimeEvent): string {
  const text = textFromPayload(event.payload);
  if (text) return text;
  const eventClass = providerEventClass(event);
  if (eventClass === 'action.required') return '请按提示补齐资料或配置后继续。';
  if (eventClass === 'artifact.changed') return '新的交付草稿已写入记录。';
  if (eventClass === 'evidence.changed') return '来源追溯记录已更新。';
  return providerEventTitle(event);
}

function providerEventsFromResult(result: AppServerPromptTurnResult, model: string): TextProviderRuntimeEvent[] {
  return [
    {
      eventClass: 'model.requested',
      kind: 'model',
      status: 'completed',
      phase: 'waiting_provider',
      title: '协作生成服务已接收任务',
      detail: model,
      model,
      payload: {
        runtime: 'lime-agent-server',
        sessionId: result.sessionId,
        turnId: result.turnId,
      },
    },
    ...result.events.map((event): TextProviderRuntimeEvent => {
      const eventPayload = event.payload && typeof event.payload === 'object'
        ? event.payload as Record<string, unknown>
        : {};
      const artifactRef = [eventPayload.artifactRef, eventPayload.artifactId, eventPayload.id, eventPayload.path]
        .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
      return {
        eventClass: providerEventClass(event),
        kind: providerEventKind(event),
        status: providerEventStatus(event),
        phase: providerEventPhase(event),
        title: providerEventTitle(event),
        detail: providerEventDetail(event),
        model,
        payload: {
          runtime: 'lime-agent-server',
          sessionId: event.sessionId ?? result.sessionId,
          turnId: event.turnId ?? result.turnId,
          eventType: event.type,
          eventId: event.eventId,
          ...classifyToolEvent(event),
          ...(artifactRef ? { artifactRef } : {}),
          rawPayload: event.payload,
        },
      };
    }),
  ];
}

function providerEventFromRuntimeEvent(event: AppServerRuntimeEvent, model: string): TextProviderRuntimeEvent {
  const eventPayload = event.payload && typeof event.payload === 'object'
    ? event.payload as Record<string, unknown>
    : {};
  const artifactRef = [eventPayload.artifactRef, eventPayload.artifactId, eventPayload.id, eventPayload.path]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0);
  return {
    eventClass: providerEventClass(event),
    kind: providerEventKind(event),
    status: providerEventStatus(event),
    phase: providerEventPhase(event),
    title: providerEventTitle(event),
    detail: providerEventDetail(event),
    model,
    payload: {
      runtime: 'lime-agent-server',
      sessionId: event.sessionId,
      turnId: event.turnId,
      eventType: event.type,
      eventId: event.eventId,
      ...classifyToolEvent(event),
      ...(artifactRef ? { artifactRef } : {}),
      rawPayload: event.payload,
    },
  };
}

async function emitProviderEvents(
  events: TextProviderRuntimeEvent[],
  onProviderEvent?: (event: TextProviderRuntimeEvent) => void | Promise<void>,
): Promise<void> {
  if (!onProviderEvent) return;
  for (const event of events) {
    await onProviderEvent(event);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function emitRuntimeEvents(
  events: AppServerRuntimeEvent[],
  onRuntimeEvent?: (event: AppServerRuntimeEvent) => void | Promise<void>,
): Promise<void> {
  if (!onRuntimeEvent) return;
  for (const event of events) {
    await onRuntimeEvent(event);
  }
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
  onProviderEvent?: (event: TextProviderRuntimeEvent) => void | Promise<void>;
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
  onProviderEvent?: (event: TextProviderRuntimeEvent) => void | Promise<void>;
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
    private readonly platformHost?: PlatformHostBridgeClient,
  ) {}

  async generatePromptDraft(input: GenerateAgentPromptDraftInput): Promise<GenerateAgentPromptDraftResult> {
    const blockedSources = input.selectedSources.filter((source) => source.status === 'blocked' || source.status === 'failed');
    const backendConfig = await this.resolveBackendConfig(input.textModel);
    const prompt = [
      `你是${getOemRuntimeConfig().productName}内容工厂的 AI Agent。`,
      '你负责先判断用户本轮输入是否足以形成内容工厂交付物，再决定回复形态。',
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
      '- 如果用户只是寒暄、测试连通性，或只输入“你好 / hi / hello / 在吗”等内容：只用一句自然语言回应，并追问用户要处理的内容对象或目标；不要输出 Markdown；不要创建、命名或描述 Prompt 草稿。',
      '- 如果用户意图不足以生成可交付内容，例如缺少明确的内容对象、主题或交付物类型：只说明还缺什么并提出 1 到 3 个追问；不要输出 Markdown；不要创建、命名或描述 Prompt 草稿。',
      '- 如果用户已经给出明确的内容对象和交付物类型，只是缺少平台、风格、受众或素材细节，可以生成 Markdown Prompt 草稿，并把这些缺口放入“需要人工确认”。',
      '- 只有当用户明确要求生成或改写内容工厂交付物，并且输入源 / 用户意图足够支撑结果时，才输出完整 Markdown Prompt 草稿。',
      '- 生成 Markdown Prompt 草稿时必须包含目标、事实来源约束、主体/场景/动作/文案结构、风格、负面约束、需要人工确认的缺口。',
      '- 如果输入源存在 blocked 或 failed，且本轮确实生成草稿，必须在“需要人工确认”中保留提醒。',
    ].filter(Boolean).join('\n');
    const result = await this.runPromptTurn({
      workspacePath: input.workspacePath,
      prompt,
      permissionMode: 'ask',
      selectedSkillSlugs: selectedSkillSlugs(input),
      metadata: {
        purpose: input.purpose,
        workflowRunId: input.workflowRunId,
        textModel: backendConfig.model,
        textProtocol: backendConfig.protocol,
        providerPreference: backendConfig.providerPreference,
        modelPreference: backendConfig.modelPreference,
        agentSurface: 'agents',
        operation: 'draft',
      },
      businessObjectRef: promptDraftBusinessObjectRef(input),
      providerPreference: backendConfig.providerPreference,
      modelPreference: backendConfig.modelPreference,
      platformManaged: backendConfig.platformManaged,
      onRuntimeEvent: input.onProviderEvent
        ? (event) => input.onProviderEvent?.(providerEventFromRuntimeEvent(event, backendConfig.model))
        : undefined,
    });
    const model = modelFromResult(result);
    const providerEvents = providerEventsFromResult(result, model);
    await emitProviderEvents(providerEvents, input.onProviderEvent);
    return {
      title: titleFromArtifact(result),
      content: formatDraftContent(input, markdownContent(result)),
      note: [
        `协作生成服务完成：${model}`,
        input.skillContext.skillRefs.length ? `已应用 ${input.skillContext.skillRefs.length} 个 skill：${input.skillContext.summaryText}` : '',
        blockedSources.length ? `包含 ${blockedSources.length} 个未解析输入源，已在提醒中保留人工确认。` : '',
      ].filter(Boolean).join('；'),
      model,
      protocol: undefined,
      providerEvents,
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
    const result = await this.runPromptTurn({
      workspacePath: input.workspacePath,
      prompt,
      permissionMode: 'ask',
      selectedSkillSlugs: input.skillContext.skillRefs.map((skill) => skill.slug),
      metadata: {
        purpose: input.purpose,
        textModel: backendConfig.model,
        textProtocol: backendConfig.protocol,
        providerPreference: backendConfig.providerPreference,
        modelPreference: backendConfig.modelPreference,
        agentSurface: 'agents',
        operation: 'refine',
      },
      businessObjectRef: promptRefinementBusinessObjectRef(input),
      providerPreference: backendConfig.providerPreference,
      modelPreference: backendConfig.modelPreference,
      platformManaged: backendConfig.platformManaged,
      onRuntimeEvent: input.onProviderEvent
        ? (event) => input.onProviderEvent?.(providerEventFromRuntimeEvent(event, backendConfig.model))
        : undefined,
    });
    const model = modelFromResult(result);
    const providerEvents = providerEventsFromResult(result, model);
    await emitProviderEvents(providerEvents, input.onProviderEvent);
    return {
      content: formatRefinedContent(input, markdownContent(result)),
      note: [
        `协作生成服务调整完成：${model}`,
        input.skillContext.skillRefs.length ? `已应用 ${input.skillContext.skillRefs.length} 个 skill：${input.skillContext.summaryText}` : '',
      ].filter(Boolean).join('；'),
      model,
      protocol: undefined,
      providerEvents,
    };
  }

  private async resolveBackendConfig(textModel?: string): Promise<{
    protocol: string;
    model: string;
    providerPreference: string;
    modelPreference: string;
    platformManaged: boolean;
  }> {
    const view = await this.modelConfig.readView();
    const model = resolvePromptAgentModel(view, textModel);
    if (!view.platformManaged) {
      throw new Error('AI Agent 对话必须先连接 lime-desktop-platform 模型设置 projection；已阻断 Content Studio 本地模型配置作为 Agent runtime 偏好。');
    }
    if (view.platformManaged && !model) {
      throw new Error('平台文字模型未配置：请在平台模型设置中为文字 Provider 添加显式模型 ID 后再生成。');
    }
    return {
      protocol: view.textProtocol,
      model,
      providerPreference: appServerProviderPreference(view),
      modelPreference: model,
      platformManaged: Boolean(view.platformManaged),
    };
  }

  private async runPromptTurn(input: {
    workspacePath: string;
    prompt: string;
    permissionMode?: 'safe' | 'ask' | 'allow-all';
    selectedSkillSlugs?: string[];
    metadata?: Record<string, unknown>;
    capabilityId?: string;
    providerPreference?: string;
    modelPreference?: string;
    platformManaged?: boolean;
    businessObjectRef?: AppServerBusinessObjectRef;
    timeoutMs?: number;
    onRuntimeEvent?: (event: AppServerRuntimeEvent) => void | Promise<void>;
  }): Promise<AppServerPromptTurnResult> {
    const platformHost = this.platformHost;
    const connectedPlatformHost = platformHost && await platformHost.ensureConnected() ? platformHost : undefined;
    if (connectedPlatformHost) {
      const invokePromise = connectedPlatformHost.invokeAgent({
        prompt: input.prompt,
        workspacePath: input.workspacePath,
        capabilityId: input.capabilityId ?? 'content.draft.generate',
        workflowId: typeof input.metadata?.workflowRunId === 'string' ? input.metadata.workflowRunId : undefined,
        modelId: input.modelPreference,
        modelPreference: input.modelPreference,
        providerPreference: input.providerPreference,
        permissionMode: input.permissionMode,
        metadata: {
          ...input.metadata,
          agentSurface: input.metadata?.agentSurface ?? 'agents',
          runtimeOwner: 'lime-desktop-platform',
        },
        selectedSkillSlugs: input.selectedSkillSlugs,
        businessObjectRef: input.businessObjectRef,
      });
      const result = input.onRuntimeEvent
        ? await this.waitForPlatformAgentResultWithEvents(connectedPlatformHost, invokePromise, input.onRuntimeEvent)
        : await invokePromise;
      const projected = await promptTurnResultFromPlatform(result, input.onRuntimeEvent);
      return projected;
    }
    throw new Error('AI Agent 对话必须通过 lime-desktop-platform runtime bridge 调用 lime.agent；已阻断 Content Studio 本地 sidecar / provider store 凭证回退。');
  }

  private async waitForPlatformAgentResultWithEvents(
    platformHost: PlatformHostBridgeClient,
    invokePromise: Promise<PlatformAgentRuntimeResult>,
    onRuntimeEvent: (event: AppServerRuntimeEvent) => void | Promise<void>,
  ): Promise<PlatformAgentRuntimeResult> {
    let settled = false;
    let canReadEvents = true;
    let sessionId: string | undefined;
    let turnId: string | undefined;
    let afterSequence: number | undefined;
    const seen = new Set<string>();
    const guardedInvoke = invokePromise.finally(() => {
      settled = true;
    });

    while (!settled && canReadEvents) {
      await delay(PLATFORM_AGENT_EVENT_POLL_MS);
      try {
        const events = await platformHost.readAgentEvents({ sessionId, turnId, afterSequence });
        for (const event of events.sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0))) {
          const key = `${event.sessionId}:${event.turnId ?? ''}:${event.sequence ?? ''}:${event.type}`;
          if (seen.has(key)) continue;
          seen.add(key);
          sessionId ??= event.sessionId;
          turnId ??= event.turnId;
          if (typeof event.sequence === 'number') {
            afterSequence = Math.max(afterSequence ?? event.sequence, event.sequence);
          }
          await onRuntimeEvent(appServerEventFromPlatformEvent(event));
        }
      } catch {
        canReadEvents = false;
      }
    }

    return guardedInvoke;
  }
}
