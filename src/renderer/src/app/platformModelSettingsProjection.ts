import type { PlatformModelProviderProjection, PlatformModelSettingsProjection } from '@limecloud/desktop-platform-react';
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

export function createAgentModelSettingsProjection(app: ContentStudioAppController): PlatformModelSettingsProjection {
  const config = app.modelConfig;
  const settings = createModelSettingsProjection(app);
  if (!config?.platformManaged) {
    const textProviders = settings.providers
      .filter((provider) => provider.enabled !== false)
      .filter((provider) => provider.models.length > 0);
    const selectedProvider =
      textProviders.find((provider) => provider.id === config?.agentProviderPreference)
      ?? textProviders[0];
    const agentModels = uniqueModels([
      ...(config?.textModels ?? []),
      ...(selectedProvider?.models ?? []),
    ]);
    const provider: PlatformModelProviderProjection | undefined = agentModels.length
      ? {
        id: selectedProvider?.id ?? config?.agentProviderPreference ?? 'content-studio-app-server-runtime',
        displayName: selectedProvider?.displayName ?? 'Content Studio App Server Runtime',
        description: selectedProvider?.description ?? '由 Content Studio Electron 启动的 Lime App Server provider store 提供。',
        protocol: selectedProvider?.protocol ?? 'openai-compatible',
        capabilityKinds: ['text'],
        enabled: selectedProvider?.enabled ?? true,
        apiKeyConfigured: selectedProvider?.apiKeyConfigured ?? true,
        authType: selectedProvider?.authType ?? 'api-key',
        baseUrl: selectedProvider?.baseUrl,
        useResponsesApi: selectedProvider?.useResponsesApi,
        models: agentModels,
      }
      : undefined;
    const defaultTextModelId = selectModel(
      provider,
      app.params.textModel,
      config?.textModel,
      settings.defaultTextModelId,
    );
    return {
      ...settings,
      defaultAgentProviderId: provider?.id,
      defaultTextModelId,
      providers: provider ? [provider] : [],
    };
  }

  const textProviders = settings.providers
    .filter((provider) => provider.enabled !== false)
    .filter((provider) => !provider.capabilityKinds || provider.capabilityKinds.includes('text'))
    .filter((provider) => provider.models.length > 0);
  if (!textProviders.length) {
    const agentModels = uniqueModels([
      ...(config?.textModels ?? []),
      config?.textModel,
      app.params.textModel,
    ]);
    const provider: PlatformModelProviderProjection | undefined = agentModels.length
      ? {
        id: config?.agentProviderPreference ?? 'lime-platform-agent-text',
        displayName: '平台模型设置 / Agent Runtime',
        description: '由 lime-desktop-platform 模型设置中心提供的 Agent 可用文字模型。',
        protocol: config?.textProtocol ?? 'openai-compatible',
        capabilityKinds: ['text'],
        enabled: true,
        apiKeyConfigured: Boolean(config?.hasTextApiKey),
        authType: 'api-key',
        baseUrl: config?.textApiEndpoint,
        models: agentModels,
      }
      : undefined;
    const defaultTextModelId = selectModel(
      provider,
      app.params.textModel,
      config?.textModel,
      settings.defaultTextModelId,
    );
    return {
      ...settings,
      defaultAgentProviderId: provider?.id ?? settings.defaultAgentProviderId,
      defaultTextModelId,
      providers: provider ? [provider] : [],
    };
  }
  const selectedProvider =
    textProviders.find((provider) => provider.id === config?.agentProviderPreference)
    ?? textProviders.find((provider) => provider.id === settings.defaultAgentProviderId)
    ?? textProviders[0];
  const agentModels = uniqueModels(textProviders.flatMap((provider) => provider.models));
  const provider: PlatformModelProviderProjection | undefined = agentModels.length
    ? {
      id: 'lime-platform-agent-text',
      displayName: selectedProvider?.displayName ?? '平台模型设置 / Agent Runtime',
      description: selectedProvider?.description ?? '由 lime-desktop-platform 模型设置中心提供的 Agent 可用文字模型。',
      protocol: selectedProvider?.protocol ?? 'openai-compatible',
      capabilityKinds: ['text'],
      enabled: textProviders.some((item) => item.enabled !== false),
      apiKeyConfigured: textProviders.some((item) => item.apiKeyConfigured || item.authType === 'none'),
      authType: selectedProvider?.authType ?? 'api-key',
      baseUrl: selectedProvider?.baseUrl,
      useResponsesApi: selectedProvider?.useResponsesApi,
      models: agentModels,
    }
    : undefined;
  const defaultTextModelId = selectModel(
    provider,
    app.params.textModel,
    config?.textModel,
    settings.defaultTextModelId,
  );

  return {
    ...settings,
    defaultAgentProviderId: provider?.id ?? selectedProvider?.id ?? settings.defaultAgentProviderId,
    defaultTextModelId,
    providers: provider ? [provider] : [],
  };
}

function projectProvider(provider: PlatformModelProviderProjection & { apiKey?: string }): PlatformModelProviderProjection {
  const { apiKey: _apiKey, ...projection } = provider;
  return {
    ...projection,
    models: uniqueModels(projection.models),
  };
}

function uniqueModels(models: string[] | undefined): string[] {
  return Array.from(new Set((models ?? []).map((model) => model.trim()).filter(Boolean)));
}

function selectModel(
  provider: PlatformModelProviderProjection | undefined,
  ...candidates: Array<string | undefined>
): string | undefined {
  const models = provider?.models ?? [];
  return candidates.find((model): model is string => Boolean(model && models.includes(model))) ?? models[0];
}
