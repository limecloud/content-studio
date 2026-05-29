import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { statSync } from 'node:fs';
import type {
  AgentPromptExecutionEventKind,
  AgentPromptExecutionEventStatus,
  AgentRuntimeEventClass,
  AgentRuntimePhase,
  ModelConfigView,
} from '../../shared/types';
import { buildClaudeSubprocessEnv, ensureClaudeConfig, resolveClaudeCodeExecutable } from '../services/claudeSdkRuntime';

export class TextProviderBlockedError extends Error {
  readonly code = 'TEXT_PROVIDER_NOT_CONFIGURED';
  readonly runtimeEvents?: TextProviderRuntimeEvent[];

  constructor(
    message = '文字模型未配置：请在设置中保存文字模型 API Key 后再生成。',
    runtimeEvents?: TextProviderRuntimeEvent[],
  ) {
    super(message);
    this.name = 'TextProviderBlockedError';
    this.runtimeEvents = runtimeEvents;
  }
}

export class TextProviderFailedError extends Error {
  readonly code = 'TEXT_PROVIDER_FAILED';
  readonly runtimeEvents?: TextProviderRuntimeEvent[];

  constructor(message: string, runtimeEvents?: TextProviderRuntimeEvent[]) {
    super(message);
    this.name = 'TextProviderFailedError';
    this.runtimeEvents = runtimeEvents;
  }
}

export interface GenerateJsonInput {
  workspacePath: string;
  model?: string;
  systemPrompt: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTurns?: number;
}

export interface TextRuntimeConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
  protocol: ModelConfigView['textProtocol'];
}

export interface TextProviderRuntimeEvent {
  eventClass: AgentRuntimeEventClass;
  kind: AgentPromptExecutionEventKind;
  status: AgentPromptExecutionEventStatus;
  phase?: AgentRuntimePhase;
  title: string;
  detail?: string;
  model?: string;
  payload?: Record<string, unknown>;
}

export interface TextGenerationOutput<T> {
  value: T;
  model: string;
  rawText: string;
  protocol: TextRuntimeConfig['protocol'];
  providerEvents?: TextProviderRuntimeEvent[];
}

interface JsonTextProvider {
  generateJson<T>(input: GenerateJsonInput, runtime: TextRuntimeConfig): Promise<TextGenerationOutput<T>>;
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      if (typeof block === 'string') return block;
      const value = block as Record<string, unknown>;
      if (typeof value.text === 'string') return value.text;
      if (typeof value.content === 'string') return value.content;
      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function extractJsonText(text: string): string {
  const trimmed = text.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  if (fenced?.[1]) return fenced[1].trim();
  const firstObject = trimmed.indexOf('{');
  const lastObject = trimmed.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) return trimmed.slice(firstObject, lastObject + 1);
  const firstArray = trimmed.indexOf('[');
  const lastArray = trimmed.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) return trimmed.slice(firstArray, lastArray + 1);
  return trimmed;
}

function parseJsonObject<T>(value: unknown, fallbackText: string): T {
  if (value && typeof value === 'object') return value as T;
  const text = typeof value === 'string' && value.trim() ? value : fallbackText;
  try {
    return JSON.parse(extractJsonText(text)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TextProviderFailedError(`文字模型返回了无法解析的 JSON：${message}`);
  }
}

function sanitizeProviderError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***').replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

function isAuthError(message: string): boolean {
  return /api\s*key|anthropic_api_key|oauth|login|auth|credential|unauthorized|401|403/i.test(message);
}

function textMaxTokens(): number {
  const value = Number(process.env.CONTENT_STUDIO_TEXT_MAX_TOKENS ?? 8192);
  return Number.isFinite(value) && value > 0 ? Math.trunc(value) : 8192;
}

function ensureWorkspaceDirectory(workspacePath: string): void {
  const normalized = workspacePath.trim();
  if (!normalized) throw new TextProviderBlockedError('工作区路径为空：请先在设置中选择有效的工作区目录。');
  try {
    if (statSync(normalized).isDirectory()) return;
  } catch {
    // 下面统一给出用户可读错误，避免 SDK 子进程暴露 spawn ENOENT/ENOTDIR。
  }
  throw new TextProviderBlockedError('工作区路径不是可访问目录：请在设置中重新选择工作区后再生成。');
}

function buildJsonSystemPrompt(input: GenerateJsonInput, includeSchema: boolean): string {
  return [
    input.systemPrompt,
    '必须只返回符合 JSON Schema 的 JSON，不要解释，不要 Markdown，不要代码围栏。',
    '如果资料不足，也要在 JSON 字段里明确写出缺口，不要编造事实。',
    includeSchema ? `JSON Schema:\n${JSON.stringify(input.schema)}` : '',
  ].filter(Boolean).join('\n');
}

function resolveAnthropicMessagesEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.anthropic.com/v1/messages';
  if (trimmed.endsWith('/messages')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

function resolveOpenAIChatEndpoint(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1/chat/completions';
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function resolveGeminiGenerateContentEndpoint(baseUrl: string, model: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith(':generateContent')) return trimmed;
  const root = trimmed || 'https://generativelanguage.googleapis.com/v1beta';
  const base = /\/v\d(?:beta)?$/i.test(root) ? root : `${root}/v1beta`;
  return `${base}/models/${encodeURIComponent(model)}:generateContent`;
}

async function readJsonResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { rawText: text };
  }
}

function providerError(payload: unknown, fallback: string): string {
  const record = payload as Record<string, unknown>;
  const error = record?.error as Record<string, unknown> | undefined;
  return sanitizeProviderError(error?.message ?? record?.message ?? record?.rawText ?? fallback);
}

function modelRequestedEvent(runtime: TextRuntimeConfig, transport: string, endpoint?: string): TextProviderRuntimeEvent {
  return {
    eventClass: 'model.requested',
    kind: 'model',
    status: 'completed',
    phase: 'waiting_provider',
    title: 'Provider request',
    detail: `${runtime.protocol} / ${runtime.model}`,
    model: runtime.model,
    payload: {
      transport,
      protocol: runtime.protocol,
      model: runtime.model,
      endpoint,
    },
  };
}

function modelCompletedEvent(
  runtime: TextRuntimeConfig,
  payload: Record<string, unknown>,
  detail = `${runtime.protocol} / ${runtime.model}`,
): TextProviderRuntimeEvent {
  return {
    eventClass: 'model.completed',
    kind: 'model',
    status: 'completed',
    phase: 'completed',
    title: 'Provider completed',
    detail,
    model: runtime.model,
    payload: {
      protocol: runtime.protocol,
      model: runtime.model,
      ...payload,
    },
  };
}

function modelFailedEvent(
  runtime: TextRuntimeConfig,
  message: string,
  payload: Record<string, unknown> = {},
): TextProviderRuntimeEvent {
  return {
    eventClass: 'model.failed',
    kind: 'model',
    status: 'failed',
    phase: 'failed',
    title: 'Provider failed',
    detail: message,
    model: runtime.model,
    payload: {
      protocol: runtime.protocol,
      model: runtime.model,
      error: message,
      ...payload,
    },
  };
}

class ClaudeSdkTextProvider implements JsonTextProvider {
  async generateJson<T>(input: GenerateJsonInput, runtime: TextRuntimeConfig): Promise<TextGenerationOutput<T>> {
    ensureWorkspaceDirectory(input.workspacePath);
    ensureClaudeConfig();
    const pathToClaudeCodeExecutable = resolveClaudeCodeExecutable();
    const providerEvents: TextProviderRuntimeEvent[] = [
      modelRequestedEvent(runtime, 'claude-agent-sdk', runtime.baseUrl),
    ];
    const options: Options = {
      cwd: input.workspacePath,
      model: runtime.model,
      maxTurns: input.maxTurns ?? 2,
      tools: [],
      allowedTools: [],
      persistSession: false,
      systemPrompt: buildJsonSystemPrompt(input, false),
      thinking: { type: 'disabled' },
      env: buildClaudeSubprocessEnv({ apiKey: runtime.apiKey, baseUrl: runtime.baseUrl }),
      settingSources: ['user', 'project'],
      outputFormat: { type: 'json_schema', schema: input.schema },
    };
    if (pathToClaudeCodeExecutable) options.pathToClaudeCodeExecutable = pathToClaudeCodeExecutable;

    let assistantText = '';
    let resultText = '';
    let structuredOutput: unknown;
    try {
      for await (const message of query({ prompt: input.prompt, options })) {
        providerEvents.push({
          eventClass: message.type === 'assistant' ? 'model.delta' : 'run.status',
          kind: 'model',
          status: 'completed',
          phase: message.type === 'assistant' ? 'streaming' : 'waiting_provider',
          title: 'Claude SDK message',
          detail: message.type,
          model: runtime.model,
          payload: { providerMessageType: message.type },
        });
        if (message.type === 'assistant') assistantText += contentText(message.message.content);
        if (message.type === 'result') {
          const payload = message as Record<string, unknown>;
          if (payload.subtype === 'success') {
            resultText = typeof payload.result === 'string' ? payload.result : '';
            structuredOutput = payload.structured_output;
          }
          if (payload.subtype && payload.subtype !== 'success') {
            const errors = Array.isArray(payload.errors) ? payload.errors.join('; ') : String(payload.subtype);
            throw new TextProviderFailedError(errors, [
              ...providerEvents,
              modelFailedEvent(runtime, errors, { subtype: payload.subtype }),
            ]);
          }
        }
      }
    } catch (error) {
      if (error instanceof TextProviderFailedError) throw error;
      const message = sanitizeProviderError(error);
      if (isAuthError(message)) {
        throw new TextProviderBlockedError(
          '文字模型无法启动：请先登录 Claude Code，或在设置中保存 Anthropic / Claude API Key 后再生成。',
          [...providerEvents, modelFailedEvent(runtime, message, { auth: true })],
        );
      }
      throw new TextProviderFailedError(message, [...providerEvents, modelFailedEvent(runtime, message)]);
    }

    const rawText = resultText || assistantText;
    return {
      value: parseJsonObject<T>(structuredOutput, rawText),
      model: runtime.model,
      rawText,
      protocol: runtime.protocol,
      providerEvents: [
        ...providerEvents,
        modelCompletedEvent(runtime, {
          transport: 'claude-agent-sdk',
          resultTextLength: resultText.length,
          assistantTextLength: assistantText.length,
          hasStructuredOutput: Boolean(structuredOutput),
        }),
      ],
    };
  }
}

class AnthropicMessagesTextProvider implements JsonTextProvider {
  async generateJson<T>(input: GenerateJsonInput, runtime: TextRuntimeConfig): Promise<TextGenerationOutput<T>> {
    const endpoint = resolveAnthropicMessagesEndpoint(runtime.baseUrl);
    const providerEvents: TextProviderRuntimeEvent[] = [modelRequestedEvent(runtime, 'http', endpoint)];
    if (!runtime.apiKey) {
      throw new TextProviderBlockedError(undefined, [
        ...providerEvents,
        modelFailedEvent(runtime, 'missing api key', { auth: true, endpoint }),
      ]);
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${runtime.apiKey}`,
          'x-api-key': runtime.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: runtime.model,
          max_tokens: textMaxTokens(),
          system: buildJsonSystemPrompt(input, true),
          messages: [{ role: 'user', content: input.prompt }],
        }),
      });
      const payload = await readJsonResponse(response) as Record<string, unknown>;
      if (!response.ok) {
        const message = providerError(payload, `HTTP ${response.status}`);
        throw new TextProviderFailedError(message, [
          ...providerEvents,
          modelFailedEvent(runtime, message, { status: response.status, endpoint }),
        ]);
      }
      const rawText = contentText(payload.content);
      return {
        value: parseJsonObject<T>(undefined, rawText),
        model: runtime.model,
        rawText,
        protocol: runtime.protocol,
        providerEvents: [
          ...providerEvents,
          modelCompletedEvent(runtime, {
            transport: 'http',
            endpoint,
            status: response.status,
            stopReason: payload.stop_reason,
            usage: payload.usage,
            rawTextLength: rawText.length,
          }),
        ],
      };
    } catch (error) {
      if (error instanceof TextProviderFailedError || error instanceof TextProviderBlockedError) throw error;
      const message = sanitizeProviderError(error);
      if (isAuthError(message)) throw new TextProviderBlockedError(undefined, [...providerEvents, modelFailedEvent(runtime, message, { auth: true, endpoint })]);
      throw new TextProviderFailedError(message, [...providerEvents, modelFailedEvent(runtime, message, { endpoint })]);
    }
  }
}

class OpenAIChatTextProvider implements JsonTextProvider {
  async generateJson<T>(input: GenerateJsonInput, runtime: TextRuntimeConfig): Promise<TextGenerationOutput<T>> {
    const endpoint = resolveOpenAIChatEndpoint(runtime.baseUrl);
    const providerEvents: TextProviderRuntimeEvent[] = [modelRequestedEvent(runtime, 'http', endpoint)];
    if (!runtime.apiKey) {
      throw new TextProviderBlockedError(undefined, [
        ...providerEvents,
        modelFailedEvent(runtime, 'missing api key', { auth: true, endpoint }),
      ]);
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${runtime.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: runtime.model,
          messages: [
            { role: 'system', content: buildJsonSystemPrompt(input, true) },
            { role: 'user', content: input.prompt },
          ],
          temperature: 0,
          response_format: { type: 'json_object' },
        }),
      });
      const payload = await readJsonResponse(response) as Record<string, unknown>;
      if (!response.ok) {
        const message = providerError(payload, `HTTP ${response.status}`);
        throw new TextProviderFailedError(message, [
          ...providerEvents,
          modelFailedEvent(runtime, message, { status: response.status, endpoint }),
        ]);
      }
      const choices = Array.isArray(payload.choices) ? payload.choices : [];
      const first = choices[0] as Record<string, unknown> | undefined;
      const message = first?.message as Record<string, unknown> | undefined;
      const rawText = contentText(message?.content);
      return {
        value: parseJsonObject<T>(undefined, rawText),
        model: runtime.model,
        rawText,
        protocol: runtime.protocol,
        providerEvents: [
          ...providerEvents,
          modelCompletedEvent(runtime, {
            transport: 'http',
            endpoint,
            status: response.status,
            finishReason: first?.finish_reason,
            usage: payload.usage,
            rawTextLength: rawText.length,
          }),
        ],
      };
    } catch (error) {
      if (error instanceof TextProviderFailedError || error instanceof TextProviderBlockedError) throw error;
      const message = sanitizeProviderError(error);
      if (isAuthError(message)) throw new TextProviderBlockedError(undefined, [...providerEvents, modelFailedEvent(runtime, message, { auth: true, endpoint })]);
      throw new TextProviderFailedError(message, [...providerEvents, modelFailedEvent(runtime, message, { endpoint })]);
    }
  }
}

class GeminiGenerateContentTextProvider implements JsonTextProvider {
  async generateJson<T>(input: GenerateJsonInput, runtime: TextRuntimeConfig): Promise<TextGenerationOutput<T>> {
    const endpoint = resolveGeminiGenerateContentEndpoint(runtime.baseUrl, runtime.model);
    const providerEvents: TextProviderRuntimeEvent[] = [modelRequestedEvent(runtime, 'http', endpoint)];
    if (!runtime.apiKey) {
      throw new TextProviderBlockedError(undefined, [
        ...providerEvents,
        modelFailedEvent(runtime, 'missing api key', { auth: true, endpoint }),
      ]);
    }
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'x-goog-api-key': runtime.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: buildJsonSystemPrompt(input, true) }] },
          contents: [{ role: 'user', parts: [{ text: input.prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
      });
      const payload = await readJsonResponse(response) as Record<string, unknown>;
      if (!response.ok) {
        const message = providerError(payload, `HTTP ${response.status}`);
        throw new TextProviderFailedError(message, [
          ...providerEvents,
          modelFailedEvent(runtime, message, { status: response.status, endpoint }),
        ]);
      }
      const rawText = collectGeminiText(payload);
      return {
        value: parseJsonObject<T>(undefined, rawText),
        model: runtime.model,
        rawText,
        protocol: runtime.protocol,
        providerEvents: [
          ...providerEvents,
          modelCompletedEvent(runtime, {
            transport: 'http',
            endpoint,
            status: response.status,
            finishReason: (payload.candidates as Array<Record<string, unknown>> | undefined)?.[0]?.finishReason,
            usage: payload.usageMetadata,
            rawTextLength: rawText.length,
          }),
        ],
      };
    } catch (error) {
      if (error instanceof TextProviderFailedError || error instanceof TextProviderBlockedError) throw error;
      const message = sanitizeProviderError(error);
      if (isAuthError(message)) throw new TextProviderBlockedError(undefined, [...providerEvents, modelFailedEvent(runtime, message, { auth: true, endpoint })]);
      throw new TextProviderFailedError(message, [...providerEvents, modelFailedEvent(runtime, message, { endpoint })]);
    }
  }
}

function collectGeminiText(payload: unknown): string {
  const texts: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    if (typeof record.text === 'string') texts.push(record.text);
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return texts.join('\n');
}

export function createTextProvider(protocol: ModelConfigView['textProtocol']): JsonTextProvider {
  if (protocol === 'anthropic-messages') return new AnthropicMessagesTextProvider();
  if (protocol === 'openai-chat') return new OpenAIChatTextProvider();
  if (protocol === 'gemini-generate-content') return new GeminiGenerateContentTextProvider();
  return new ClaudeSdkTextProvider();
}
