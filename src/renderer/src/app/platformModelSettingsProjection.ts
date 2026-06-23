import type { PlatformModelProviderProjection, PlatformModelSettingsProjection } from '@limecloud/desktop-platform-react';
import { compactUsableModelIds } from '../../../shared/modelIds';
import type { ContentStudioAppController } from './useContentStudioApp';

export function createModelSettingsProjection(app: ContentStudioAppController): PlatformModelSettingsProjection {
  const config = app.modelConfig;
  if (config?.platformManaged && config.platformModelSettings) {
    return {
      ...config.platformModelSettings,
      providers: config.platformModelSettings.providers.map((provider) => projectProvider(provider)),
    };
  }

  if (!config?.platformManaged) {
    const textModels = config?.textModels.length ? config.textModels : [config?.textModel || app.params.textModel].filter(Boolean);
    const imageModels = config?.imageModels.length ? config.imageModels : [app.params.imageModel].filter(Boolean);
    const videoModels = config?.videoModels.length ? config.videoModels : [config?.videoModel || app.params.videoModel].filter(Boolean);
    return {
      version: config?.updatedAt,
      updatedAt: config?.updatedAt,
      providers: [
        {
          id: 'content-studio-standalone-text',
          displayName: '未连接平台设置 / 文案生成',
          description: config?.platformReadiness?.reasons[0]?.message ?? '当前未连接平台设置中心，模型访问凭据不会保存到平台。',
          protocol: config?.textProtocol ?? 'openai-compatible',
          capabilityKinds: ['text' as const],
          enabled: Boolean(config?.hasTextApiKey && textModels.length),
          apiKeyConfigured: Boolean(config?.hasTextApiKey),
          authType: 'api-key' as const,
          baseUrl: config?.textApiEndpoint,
          models: textModels,
        },
        {
          id: 'content-studio-standalone-image',
          displayName: '未连接平台设置 / 图片生成',
          description: '当前独立运行时只读取本地模型列表；接入平台宿主后由平台模型设置中心接管。',
          protocol: config?.imageProtocol ?? 'openai-compatible',
          capabilityKinds: ['image' as const],
          enabled: Boolean(config?.hasImageApiKey && imageModels.length),
          apiKeyConfigured: Boolean(config?.hasImageApiKey),
          authType: 'api-key' as const,
          baseUrl: config?.imageApiEndpoint,
          useResponsesApi: config?.imageProtocol === 'openai-responses',
          models: imageModels,
        },
        {
          id: 'content-studio-standalone-video',
          displayName: '未连接平台设置 / 视频生成',
          description: '当前独立运行时只读取本地视频模型列表；接入平台宿主后由平台模型设置中心接管。',
          protocol: 'openai-compatible',
          capabilityKinds: ['video' as const],
          enabled: Boolean(config?.hasVideoApiKey && videoModels.length),
          apiKeyConfigured: Boolean(config?.hasVideoApiKey),
          authType: 'api-key' as const,
          baseUrl: config?.videoApiEndpoint,
          models: videoModels,
        },
      ],
    };
  }

  return {
    version: config.platformHost?.modelSettingsVersion ?? config.updatedAt,
    updatedAt: config.updatedAt,
    defaultAgentProviderId: config.agentProviderPreference,
    defaultTextModelId: config.textModel,
    defaultImageModelId: app.params.imageModel || config.imageOuterModel,
    defaultVideoModelId: config.videoModel,
    providers: [],
  };
}

export function selectUsableTextModel(
  settings: PlatformModelSettingsProjection,
  requestedModel?: string,
): string | undefined {
  const textProviders = settings.providers
    .filter((provider) => provider.enabled !== false)
    .filter((provider) => !provider.capabilityKinds || provider.capabilityKinds.includes('text'));
  const selectedProvider =
    textProviders.find((provider) => provider.id === settings.defaultAgentProviderId)
    ?? textProviders[0];
  const selectedModels = compactUsableModelIds(selectedProvider?.models ?? []);
  const allModels = compactUsableModelIds(textProviders.flatMap((provider) => provider.models));
  const candidates = [requestedModel, settings.defaultTextModelId].map((model) => model?.trim()).filter(Boolean) as string[];
  return candidates.find((model) => selectedModels.includes(model))
    ?? selectedModels[0]
    ?? candidates.find((model) => allModels.includes(model))
    ?? allModels[0];
}

function projectProvider(provider: PlatformModelProviderProjection & { apiKey?: string }): PlatformModelProviderProjection {
  const { apiKey: _apiKey, ...projection } = provider;
  return {
    ...projection,
    models: compactUsableModelIds(projection.models),
  };
}
