import type {
  ContentKnowledgeMapBuildRunRecord,
  ContentKnowledgeMapRecord,
  ContentKnowledgeMapTeamSyncSummary,
} from '../../shared/types';

export interface ContentKnowledgeMapSyncPort {
  draftStatus(workspacePath: string): Promise<ContentKnowledgeMapTeamSyncSummary>;
  listKnowledgeMaps?(input: {
    workspacePath: string;
    workspaceId?: string;
  }): Promise<ContentKnowledgeMapRecord[]>;
  listBuildRuns?(input: {
    workspacePath: string;
    workspaceId?: string;
    contentKnowledgeMapId?: string;
  }): Promise<ContentKnowledgeMapBuildRunRecord[]>;
  upsertKnowledgeMapSnapshot?(input: {
    record: ContentKnowledgeMapRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary>;
  appendBuildRun?(input: {
    buildRun: ContentKnowledgeMapBuildRunRecord;
    sourceKnowledgeMap?: ContentKnowledgeMapRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary>;
}

export class LocalOnlyContentKnowledgeMapSyncAdapter implements ContentKnowledgeMapSyncPort {
  async draftStatus(_workspacePath: string): Promise<ContentKnowledgeMapTeamSyncSummary> {
    return {
      backend: 'bugu',
      status: 'local-only',
      message: '已保存为本机草稿；团队共享和发布需要接入 Bugu 业务后端。',
    };
  }

  async upsertKnowledgeMapSnapshot(_input: {
    record: ContentKnowledgeMapRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    return {
      backend: 'bugu',
      status: 'local-only',
      message: '内容知识地图已保存为本机草稿，尚未同步到 Bugu 团队事实源。',
    };
  }

  async appendBuildRun(_input: {
    buildRun: ContentKnowledgeMapBuildRunRecord;
    sourceKnowledgeMap?: ContentKnowledgeMapRecord;
    authorLabel?: string;
  }): Promise<ContentKnowledgeMapTeamSyncSummary> {
    return {
      backend: 'bugu',
      status: 'local-only',
      message: '生成流程已保存在本机，尚未同步到 Bugu 团队事实源。',
    };
  }
}
