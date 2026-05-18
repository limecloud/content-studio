import type { ImageGenerationRequest, MediaGenerationResult, VideoGenerationRequest } from '../../shared/types';
import { GenerationLogStore } from '../services/generationLogStore';
import { ModelConfigStore } from '../services/modelConfigStore';

export class MediaProvider {
  constructor(private readonly modelConfig: ModelConfigStore, private readonly logs: GenerationLogStore) {}

  async generateImage(input: ImageGenerationRequest): Promise<MediaGenerationResult> {
    const config = await this.modelConfig.readView();
    const log = await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'image',
      status: 'blocked',
      title: '图片素材生成请求',
      summary: '图片 provider 尚未接入真实生成，本次仅记录提示词、知识引用和全局参数。',
      model: input.params.imageModel || config.imageModels[0],
      promptPackId: input.promptPackId,
      sceneCardIds: input.sceneCardIds,
      citations: input.citations,
      input,
      error: 'IMAGE_PROVIDER_NOT_CONFIGURED',
    });
    return {
      logId: log.id,
      status: 'blocked',
      message: '图片 provider 尚未接入：已记录为可追溯生成请求，后续接入模型网关即可复用。',
      assetRefs: [],
    };
  }

  async generateVideo(input: VideoGenerationRequest): Promise<MediaGenerationResult> {
    const config = await this.modelConfig.readView();
    const log = await this.logs.append({
      workspacePath: input.workspacePath,
      kind: 'video',
      status: 'blocked',
      title: '视频生成队列请求',
      summary: '视频 provider 尚未接入真实生成，本次仅记录视频提示词、脚本和素材引用。',
      model: input.params.videoModel || config.videoModel,
      promptPackId: input.promptPackId,
      sceneCardIds: input.sceneCardIds,
      citations: input.citations,
      input,
      error: 'VIDEO_PROVIDER_NOT_CONFIGURED',
    });
    return {
      logId: log.id,
      status: 'blocked',
      message: '视频 provider 尚未接入：已进入 blocked 队列，避免伪造成功素材。',
      assetRefs: [],
    };
  }
}
