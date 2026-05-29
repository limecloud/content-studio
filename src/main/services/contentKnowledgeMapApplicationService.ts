import { randomUUID } from 'node:crypto';
import type {
  BuildContentKnowledgeMapInput,
  ContentKnowledgeMapRecord,
} from '../../shared/types';
import { BrandKnowledgeBaseStore } from './brandKnowledgeBaseStore';
import { buildContentKnowledgeMapDraft } from './contentKnowledgeMapBuilder';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import type { ContentKnowledgeMapSyncPort } from './contentKnowledgeMapSyncPort';
import { validateContentKnowledgeMapBuild } from './contentKnowledgeMapValidator';
import { InputSourceStore } from './inputSourceStore';
import { IpKnowledgeBaseStore } from './ipKnowledgeBaseStore';
import { PromptDraftStore } from './promptDraftStore';
import { SceneLibraryStore } from './sceneLibraryStore';
import { TextProviderBlockedError } from './textGenerationService';

interface ContentKnowledgeMapBuildRuntime {
  getRuntimeConfig(modelOverride?: string): Promise<{ model: string }>;
}

function selectedIds<T extends { id: string }>(items: T[], ids: string[] | undefined): string[] {
  if (!ids?.length) return items.map((item) => item.id);
  const allowed = new Set(ids);
  return items.filter((item) => allowed.has(item.id)).map((item) => item.id);
}

function blockedBuildRecord(input: {
  buildInput: BuildContentKnowledgeMapInput;
  now: string;
  teamSync: ContentKnowledgeMapRecord['teamSync'];
  inputSources: Array<{ id: string; title?: string }>;
  brandKnowledgeBases: Array<{ id: string; title?: string }>;
  ipKnowledgeBases: Array<{ id: string }>;
  sceneCards: Array<{ id: string }>;
  promptDrafts: Array<{ id: string }>;
  reason: string;
}): ContentKnowledgeMapRecord {
  const title = input.buildInput.title?.trim()
    || `${input.brandKnowledgeBases[0]?.title ?? input.inputSources[0]?.title ?? '内容项目'} 内容知识地图`;
  return {
    id: randomUUID(),
    workspacePath: input.buildInput.workspacePath,
    title,
    status: 'blocked',
    syncStatus: input.teamSync.status,
    teamSync: input.teamSync,
    sourceInputSourceIds: selectedIds(input.inputSources, input.buildInput.inputSourceIds),
    brandKnowledgeBaseIds: selectedIds(input.brandKnowledgeBases, input.buildInput.brandKnowledgeBaseIds),
    ipKnowledgeBaseIds: selectedIds(input.ipKnowledgeBases, input.buildInput.ipKnowledgeBaseIds),
    sceneCardIds: selectedIds(input.sceneCards, input.buildInput.sceneCardIds),
    promptDraftIds: selectedIds(input.promptDrafts, input.buildInput.promptDraftIds),
    sellingPoints: [],
    painPoints: [],
    scenarios: [],
    evidence: [],
    constraints: [],
    gaps: [input.reason],
    coverage: {
      inputSourceCount: 0,
      brandKnowledgeBaseCount: 0,
      ipKnowledgeBaseCount: 0,
      skuRowCount: 0,
      competitorObservationCount: 0,
      sceneCardCount: 0,
      promptDraftCount: 0,
      evidenceCount: 0,
      gapCount: 1,
      readyPercent: 0,
    },
    model: 'blocked:text-provider',
    createdAt: input.now,
    updatedAt: input.now,
  };
}

export class ContentKnowledgeMapApplicationService {
  constructor(
    private readonly store: ContentKnowledgeMapStore,
    private readonly inputSources: InputSourceStore,
    private readonly brandKnowledgeBases: BrandKnowledgeBaseStore,
    private readonly ipKnowledgeBases: IpKnowledgeBaseStore,
    private readonly sceneCards: SceneLibraryStore,
    private readonly promptDrafts: PromptDraftStore,
    private readonly sync: ContentKnowledgeMapSyncPort,
    private readonly buildRuntime?: ContentKnowledgeMapBuildRuntime,
  ) {}

  list(workspacePath: string): Promise<ContentKnowledgeMapRecord[]> {
    return this.store.list(workspacePath);
  }

  async build(input: BuildContentKnowledgeMapInput): Promise<ContentKnowledgeMapRecord> {
    const now = new Date().toISOString();
    const [inputSources, brandKnowledgeBases, ipKnowledgeBases, sceneCards, promptDrafts, teamSync] = await Promise.all([
      this.inputSources.list(input.workspacePath),
      this.brandKnowledgeBases.list(input.workspacePath),
      this.ipKnowledgeBases.list(input.workspacePath),
      this.sceneCards.list(input.workspacePath),
      this.promptDrafts.list(input.workspacePath),
      this.sync.draftStatus(input.workspacePath),
    ]);
    if (this.buildRuntime) {
      try {
        await this.buildRuntime.getRuntimeConfig();
      } catch (error) {
        if (!(error instanceof TextProviderBlockedError)) throw error;
        return this.store.save(blockedBuildRecord({
          buildInput: input,
          now,
          teamSync,
          inputSources,
          brandKnowledgeBases,
          ipKnowledgeBases,
          sceneCards,
          promptDrafts,
          reason: error.message || '生成服务待配置：请先在模型设置中配置文字生成服务，再构建内容知识地图。',
        }));
      }
    }
    const build = buildContentKnowledgeMapDraft(input, {
      inputSources,
      brandKnowledgeBases,
      ipKnowledgeBases,
      sceneCards,
      promptDrafts,
    });
    const validation = validateContentKnowledgeMapBuild(
      build,
      inputSources.filter((source) => build.sourceInputSourceIds.includes(source.id)),
    );
    const record: ContentKnowledgeMapRecord = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      title: build.title,
      status: validation.status,
      syncStatus: teamSync.status,
      teamSync,
      sourceInputSourceIds: build.sourceInputSourceIds,
      brandKnowledgeBaseIds: build.brandKnowledgeBaseIds,
      ipKnowledgeBaseIds: build.ipKnowledgeBaseIds,
      sceneCardIds: build.sceneCardIds,
      promptDraftIds: build.promptDraftIds,
      sellingPoints: build.sellingPoints,
      painPoints: build.painPoints,
      scenarios: build.scenarios,
      evidence: build.evidence,
      constraints: build.constraints,
      gaps: validation.gaps,
      coverage: {
        inputSourceCount: build.sourceInputSourceIds.length,
        brandKnowledgeBaseCount: build.brandKnowledgeBaseIds.length,
        ipKnowledgeBaseCount: build.ipKnowledgeBaseIds.length,
        skuRowCount: build.skuRowCount,
        competitorObservationCount: build.competitorObservationCount,
        sceneCardCount: build.sceneCardIds.length,
        promptDraftCount: build.promptDraftIds.length,
        evidenceCount: build.evidence.length,
        gapCount: validation.gaps.length,
        readyPercent: validation.readyPercent,
      },
      model: build.model,
      createdAt: now,
      updatedAt: now,
    };
    return this.store.save(record);
  }

  update(input: ContentKnowledgeMapRecord): Promise<ContentKnowledgeMapRecord> {
    return this.store.update(input);
  }
}
