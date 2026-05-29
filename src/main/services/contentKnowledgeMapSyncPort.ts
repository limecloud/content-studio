import type { ContentKnowledgeMapTeamSyncSummary } from '../../shared/types';

export interface ContentKnowledgeMapSyncPort {
  draftStatus(workspacePath: string): Promise<ContentKnowledgeMapTeamSyncSummary>;
}

export class LocalOnlyContentKnowledgeMapSyncAdapter implements ContentKnowledgeMapSyncPort {
  async draftStatus(_workspacePath: string): Promise<ContentKnowledgeMapTeamSyncSummary> {
    return {
      backend: 'bugu',
      status: 'local-only',
      message: '已保存为本机草稿；团队共享和发布需要接入 Bugu 业务后端。',
    };
  }
}
