import { query } from '@anthropic-ai/claude-agent-sdk';
import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { ModelConfigStore } from './modelConfigStore';
import { buildClaudeSubprocessEnv, ensureClaudeConfig } from './claudeSdkRuntime';

export class TextProviderBlockedError extends Error {
  readonly code = 'TEXT_PROVIDER_NOT_CONFIGURED';

  constructor(message = '文字模型未配置：请在设置中保存 Anthropic / Claude API Key 后再生成。') {
    super(message);
    this.name = 'TextProviderBlockedError';
  }
}

export class TextProviderFailedError extends Error {
  readonly code = 'TEXT_PROVIDER_FAILED';

  constructor(message: string) {
    super(message);
    this.name = 'TextProviderFailedError';
  }
}

interface GenerateJsonInput {
  workspacePath: string;
  model?: string;
  systemPrompt: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTurns?: number;
}

interface RuntimeConfig {
  apiKey?: string;
  baseUrl: string;
  model: string;
}

function requiresExplicitTextKey(): boolean {
  return process.env.CONTENT_STUDIO_REQUIRE_EXPLICIT_TEXT_KEY === '1';
}

function contentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      const value = block as Record<string, unknown>;
      return typeof value.text === 'string' ? value.text : '';
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

export class TextGenerationService {
  constructor(private readonly modelConfig: ModelConfigStore) {}

  async getRuntimeConfig(modelOverride?: string): Promise<RuntimeConfig> {
    const view = await this.modelConfig.readView();
    const storedKey = await this.modelConfig.getTextApiKey();
    const apiKey = storedKey || process.env.CONTENT_STUDIO_TEXT_API_KEY || process.env.ANTHROPIC_API_KEY;
    const oauthToken = process.env.CLAUDE_CODE_OAUTH_TOKEN;
    if (!apiKey && !oauthToken && requiresExplicitTextKey()) throw new TextProviderBlockedError();
    return {
      apiKey,
      baseUrl: process.env.CONTENT_STUDIO_TEXT_BASE_URL || view.textApiEndpoint,
      model: modelOverride || view.textModel,
    };
  }

  async generateJson<T>(input: GenerateJsonInput): Promise<{ value: T; model: string; rawText: string }> {
    const runtime = await this.getRuntimeConfig(input.model);
    ensureClaudeConfig();

    const systemPrompt = [
      input.systemPrompt,
      '必须只返回符合 JSON Schema 的 JSON，不要解释，不要 Markdown，不要代码围栏。',
      '如果资料不足，也要在 JSON 字段里明确写出缺口，不要编造事实。',
    ].join('\n');

    const options: Options = {
      cwd: input.workspacePath,
      model: runtime.model,
      maxTurns: input.maxTurns ?? 2,
      tools: [],
      allowedTools: [],
      persistSession: false,
      systemPrompt,
      thinking: { type: 'disabled' },
      env: buildClaudeSubprocessEnv({ apiKey: runtime.apiKey, baseUrl: runtime.baseUrl }),
      settingSources: ['user', 'project'],
      outputFormat: { type: 'json_schema', schema: input.schema },
    };

    let assistantText = '';
    let resultText = '';
    let structuredOutput: unknown;
    try {
      for await (const message of query({ prompt: input.prompt, options })) {
        if (message.type === 'assistant') {
          assistantText += contentText(message.message.content);
        }
        if (message.type === 'result') {
          const payload = message as Record<string, unknown>;
          if (payload.subtype === 'success') {
            resultText = typeof payload.result === 'string' ? payload.result : '';
            structuredOutput = payload.structured_output;
          }
          if (payload.subtype && payload.subtype !== 'success') {
            const errors = Array.isArray(payload.errors) ? payload.errors.join('; ') : String(payload.subtype);
            throw new TextProviderFailedError(errors);
          }
        }
      }
    } catch (error) {
      if (error instanceof TextProviderFailedError) throw error;
      const message = sanitizeProviderError(error);
      if (isAuthError(message)) {
        throw new TextProviderBlockedError('文字模型无法启动：请先登录 Claude Code，或在设置中保存 Anthropic / Claude API Key 后再生成。');
      }
      throw new TextProviderFailedError(message);
    }

    const rawText = resultText || assistantText;
    return { value: parseJsonObject<T>(structuredOutput, rawText), model: runtime.model, rawText };
  }
}
