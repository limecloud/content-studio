import { isTextGenerationProtocol, type ModelConfigView, type TextGenerationProtocol } from '../../shared/types';
import { ModelConfigStore } from './modelConfigStore';
import {
  createTextProvider,
  TextProviderBlockedError,
  TextProviderFailedError,
  type GenerateJsonInput,
  type TextRuntimeConfig,
} from '../providers/textGenerationProvider';

export { TextProviderBlockedError, TextProviderFailedError };

interface RuntimeConfig extends TextRuntimeConfig {}

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

export class TextGenerationService {
  constructor(private readonly modelConfig: ModelConfigStore) {}

  async getRuntimeConfig(modelOverride?: string): Promise<RuntimeConfig> {
    const view = await this.modelConfig.readView();
    const protocol = protocolOverride(process.env.CONTENT_STUDIO_TEXT_PROTOCOL, view.textProtocol);
    const storedKey = await this.modelConfig.getTextApiKey();
    const apiKey = storedKey || envTextApiKey(protocol);
    const oauthToken = protocol === 'claude-sdk' ? process.env.CLAUDE_CODE_OAUTH_TOKEN : undefined;
    if (!apiKey && !oauthToken && requiresExplicitTextKey()) throw new TextProviderBlockedError();
    return {
      apiKey,
      baseUrl: process.env.CONTENT_STUDIO_TEXT_BASE_URL || view.textApiEndpoint,
      model: modelOverride || view.textModel,
      protocol,
    };
  }

  async generateJson<T>(input: GenerateJsonInput): Promise<{ value: T; model: string; rawText: string }> {
    const runtime = await this.getRuntimeConfig(input.model);
    return createTextProvider(runtime.protocol).generateJson<T>(input, runtime);
  }
}
