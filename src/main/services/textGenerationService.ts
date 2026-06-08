import { isTextGenerationProtocol, type ModelConfigView, type TextGenerationProtocol } from '../../shared/types';
import { ModelConfigStore } from './modelConfigStore';
import type { AppServerCapabilityTurnResult, AppServerSidecarService, AppServerTurnArtifact } from './appServerSidecarService';
import {
  createTextProvider,
  TextProviderBlockedError,
  TextProviderFailedError,
  type GenerateJsonInput,
  type TextGenerationOutput,
  type TextProviderRuntimeEvent,
  type TextRuntimeConfig,
} from '../providers/textGenerationProvider';

export { TextProviderBlockedError, TextProviderFailedError };

interface RuntimeConfig extends TextRuntimeConfig {}

type TextModelConfigStore = Pick<ModelConfigStore, 'readView' | 'getTextApiKey'>;
type TextAppServerRuntime = Pick<AppServerSidecarService, 'runCapabilityTurn'>;

const APP_SERVER_TEXT_CAPABILITY_ID = 'content.text.generate';

function requiresExplicitTextKey(): boolean {
  return process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY === '1';
}

function protocolOverride(value: string | undefined, fallback: TextGenerationProtocol): TextGenerationProtocol {
  if (isTextGenerationProtocol(value)) return value;
  return fallback;
}

function envTextApiKey(protocol: TextGenerationProtocol): string | undefined {
  const genericKey = process.env.CONTENT_STUDIO_TEXT_API_KEY;
  if (genericKey) return genericKey;
  if (protocol === 'openai-chat') return process.env.OPENAI_API_KEY;
  if (protocol === 'gemini-generate-content') return process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  return process.env.ANTHROPIC_API_KEY;
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

function parseJsonObject<T>(text: string): T {
  try {
    return JSON.parse(extractJsonText(text)) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new TextProviderFailedError(`Lime App Server 返回了无法解析的 JSON：${message}`);
  }
}

function runtimePayloadText(payload: unknown): string {
  if (typeof payload === 'string') return payload;
  if (!payload || typeof payload !== 'object') return '';
  const record = payload as Record<string, unknown>;
  return [record.text, record.content, record.markdown, record.summary, record.message]
    .find((value): value is string => typeof value === 'string' && value.trim().length > 0)
    ?.trim() ?? '';
}

function artifactPayloadField(artifact: AppServerTurnArtifact, field: string): string | undefined {
  const payload = artifact.payload;
  if (!payload || typeof payload !== 'object') return undefined;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function resultModel(result: AppServerCapabilityTurnResult, fallback: string): string {
  const candidates = [
    ...result.artifacts.map((artifact) => artifactPayloadField(artifact, 'model')),
    ...result.evidenceArtifacts.map((artifact) => artifactPayloadField(artifact, 'model')),
    ...result.events.map((event) => runtimeEventPayloadField(event.payload, 'model')),
    ...result.evidenceEvents.map((event) => runtimeEventPayloadField(event.payload, 'model')),
  ].filter((value): value is string => Boolean(value));
  return candidates[0] ?? fallback;
}

function runtimeEventPayloadField(payload: unknown, field: string): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const value = (payload as Record<string, unknown>)[field];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function rawTextFromResult(result: AppServerCapabilityTurnResult): string {
  const artifactText = [...result.artifacts, ...result.evidenceArtifacts]
    .map((artifact) => artifact.content?.trim() || artifactPayloadField(artifact, 'rawText') || artifactPayloadField(artifact, 'text'))
    .find((content): content is string => Boolean(content));
  if (artifactText) return artifactText;
  const messageText = result.events
    .filter((event) => event.type === 'message.delta')
    .map((event) => runtimePayloadText(event.payload))
    .filter(Boolean)
    .join('\n')
    .trim();
  if (messageText) return messageText;
  throw new TextProviderFailedError('Lime App Server 未返回文字生成 artifact。');
}

function providerEventClass(type: string): TextProviderRuntimeEvent['eventClass'] {
  if (type === 'turn.completed') return 'model.completed';
  if (type === 'turn.failed' || type.endsWith('.failed')) return 'model.failed';
  if (type === 'message.delta') return 'model.delta';
  return 'run.status';
}

function providerEventsFromResult(
  result: AppServerCapabilityTurnResult,
  runtime: RuntimeConfig,
  model: string,
): TextProviderRuntimeEvent[] {
  return [
    {
      eventClass: 'model.requested',
      kind: 'model',
      status: 'completed',
      phase: 'waiting_provider',
      title: 'Lime App Server requested',
      detail: `${runtime.protocol} / ${model}`,
      model,
      payload: {
        runtime: 'lime-agent-server',
        capabilityId: APP_SERVER_TEXT_CAPABILITY_ID,
        sessionId: result.sessionId,
        turnId: result.turnId,
        protocol: runtime.protocol,
      },
    },
    ...result.events.map((event): TextProviderRuntimeEvent => ({
      eventClass: providerEventClass(event.type),
      kind: 'model',
      status: event.type === 'turn.failed' || event.type.endsWith('.failed') ? 'failed' : 'completed',
      phase: event.type === 'message.delta' ? 'streaming' : event.type.includes('failed') ? 'failed' : 'completed',
      title: `Lime App Server ${event.type}`,
      detail: runtimePayloadText(event.payload) || event.type,
      model,
      payload: {
        runtime: 'lime-agent-server',
        capabilityId: APP_SERVER_TEXT_CAPABILITY_ID,
        sessionId: event.sessionId ?? result.sessionId,
        turnId: event.turnId ?? result.turnId,
        eventType: event.type,
        eventId: event.eventId,
        rawPayload: event.payload,
      },
    })),
  ];
}

function failedProviderEvent(runtime: RuntimeConfig, message: string): TextProviderRuntimeEvent {
  return {
    eventClass: 'model.failed',
    kind: 'model',
    status: 'failed',
    phase: 'failed',
    title: 'Lime App Server failed',
    detail: message,
    model: runtime.model,
    payload: {
      runtime: 'lime-agent-server',
      capabilityId: APP_SERVER_TEXT_CAPABILITY_ID,
      protocol: runtime.protocol,
      error: message,
    },
  };
}

function isBlockedTextError(message: string): boolean {
  return /未配置|API Key|api\s*key|credential|unauthorized|401|403|无法解密|requires-reauthorization/i.test(message);
}

export class TextGenerationService {
  constructor(
    private readonly modelConfig: TextModelConfigStore,
    private readonly appServer?: TextAppServerRuntime,
  ) {}

  async getRuntimeConfig(modelOverride?: string): Promise<RuntimeConfig> {
    const view = await this.modelConfig.readView();
    const protocol = protocolOverride(process.env.CONTENT_STUDIO_TEXT_PROTOCOL, view.textProtocol);
    const storedKey = await this.modelConfig.getTextApiKey();
    const apiKey = storedKey || envTextApiKey(protocol);
    if (!apiKey && view.textApiKeyStatus === 'requires-reauthorization') {
      throw new TextProviderBlockedError('文字 API Key 已保存，但当前系统无法解密。请在设置 - 模型中重新保存文字 API Key 后再生成。');
    }
    if (!apiKey && requiresExplicitTextKey()) {
      throw new TextProviderBlockedError();
    }
    return {
      apiKey,
      baseUrl: process.env.CONTENT_STUDIO_TEXT_BASE_URL || view.textApiEndpoint,
      model: modelOverride || view.textModel,
      protocol,
    };
  }

  async generateJson<T>(input: GenerateJsonInput): Promise<TextGenerationOutput<T>> {
    const runtime = await this.getRuntimeConfig(input.model);
    if (this.appServer) return this.generateJsonWithAppServer<T>(input, runtime);
    return createTextProvider(runtime.protocol).generateJson<T>(input, runtime);
  }

  private async generateJsonWithAppServer<T>(
    input: GenerateJsonInput,
    runtime: RuntimeConfig,
  ): Promise<TextGenerationOutput<T>> {
    try {
      const result = await this.appServer!.runCapabilityTurn({
        workspacePath: input.workspacePath,
        capabilityId: APP_SERVER_TEXT_CAPABILITY_ID,
        input: {
          text: input.prompt,
          systemPrompt: input.systemPrompt,
          schema: input.schema,
          responseKind: 'json',
          maxTurns: input.maxTurns,
        },
        metadata: {
          operation: 'generateJson',
          textModel: runtime.model,
          textProtocol: runtime.protocol,
        },
        businessObjectRef: {
          kind: 'textGeneration',
          id: `${APP_SERVER_TEXT_CAPABILITY_ID}:${runtime.model}`,
          title: '文字 JSON 生成',
          metadata: {
            protocol: runtime.protocol,
            model: runtime.model,
          },
        },
        backendEnv: {
          CONTENT_STUDIO_TEXT_PROTOCOL: runtime.protocol,
          CONTENT_STUDIO_TEXT_MODEL: runtime.model,
          CONTENT_STUDIO_TEXT_BASE_URL: runtime.baseUrl,
          CONTENT_STUDIO_TEXT_API_KEY: runtime.apiKey ?? '',
          LLM_PROTOCOL: runtime.protocol,
          LLM_MODEL: runtime.model,
          LLM_BASE_URL: runtime.baseUrl,
        },
      });
      const rawText = rawTextFromResult(result);
      const model = resultModel(result, runtime.model);
      return {
        value: parseJsonObject<T>(rawText),
        model,
        rawText,
        protocol: runtime.protocol,
        providerEvents: providerEventsFromResult(result, runtime, model),
      };
    } catch (error) {
      if (error instanceof TextProviderBlockedError || error instanceof TextProviderFailedError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const event = failedProviderEvent(runtime, message);
      if (isBlockedTextError(message)) throw new TextProviderBlockedError(message, [event]);
      throw new TextProviderFailedError(message, [event]);
    }
  }
}
