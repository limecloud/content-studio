import { randomUUID } from 'node:crypto';
import type {
  BuildContentKnowledgeMapInput,
  ContentKnowledgeMapBuildRunRecord,
  ContentKnowledgeMapBuildRunStep,
  ContentKnowledgeMapBuildRunStepStatus,
  ContentKnowledgeMapRecord,
  InputSourceRecord,
} from '../../shared/types';
import { BrandKnowledgeBaseStore } from './brandKnowledgeBaseStore';
import {
  buildContentKnowledgeMapDraft,
  buildContentKnowledgeMapFromModelOutput,
  buildContentKnowledgeMapModelPrompt,
  contentKnowledgeMapModelSchema,
  type ContentKnowledgeMapBuildResult,
  type ContentKnowledgeMapBuildSources,
  type ContentKnowledgeMapModelOutput,
} from './contentKnowledgeMapBuilder';
import { AssetReviewStore } from './assetReviewStore';
import { ContentKnowledgeMapBuildRunStore } from './contentKnowledgeMapBuildRunStore';
import {
  contentKnowledgeMapSensitiveIssues,
  summarizeInputSourceSensitivity,
} from './contentKnowledgeMapSensitivityPolicy';
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
  generateJson?<T>(input: {
    workspacePath: string;
    model?: string;
    systemPrompt: string;
    prompt: string;
    schema: Record<string, unknown>;
    maxTurns?: number;
  }): Promise<{ value: T; model: string }>;
}

type ContentKnowledgeMapModelRuntime = ContentKnowledgeMapBuildRuntime & {
  generateJson<T>(input: {
    workspacePath: string;
    model?: string;
    systemPrompt: string;
    prompt: string;
    schema: Record<string, unknown>;
    maxTurns?: number;
  }): Promise<{ value: T; model: string }>;
};

function hasModelGeneration(runtime: ContentKnowledgeMapBuildRuntime | undefined): runtime is ContentKnowledgeMapModelRuntime {
  return typeof runtime?.generateJson === 'function';
}

function isContentKnowledgeMapRecord(
  value: ContentKnowledgeMapBuildResult | ContentKnowledgeMapRecord,
): value is ContentKnowledgeMapRecord {
  return 'coverage' in value && 'createdAt' in value;
}

function selectedIds<T extends { id: string }>(items: T[], ids: string[] | undefined): string[] {
  if (!ids?.length) return items.map((item) => item.id);
  const allowed = new Set(ids);
  return items.filter((item) => allowed.has(item.id)).map((item) => item.id);
}

function selectedItems<T extends { id: string }>(items: T[], ids: string[] | undefined): T[] {
  if (!ids?.length) return items;
  const allowed = new Set(ids);
  return items.filter((item) => allowed.has(item.id));
}

function blockedBuildRecord(input: {
  buildInput: BuildContentKnowledgeMapInput;
  now: string;
  teamSync: ContentKnowledgeMapRecord['teamSync'];
  inputSources: InputSourceRecord[];
  brandKnowledgeBases: Array<{ id: string; title?: string }>;
  ipKnowledgeBases: Array<{ id: string }>;
  sceneCards: Array<{ id: string }>;
  promptDrafts: Array<{ id: string }>;
  assetReviews?: Array<{ id: string }>;
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
      assetReviewCount: input.assetReviews?.length ?? 0,
      sceneCardCount: 0,
      promptDraftCount: 0,
      evidenceCount: 0,
      gapCount: 1,
      readyPercent: 0,
    },
    sourceSensitivity: summarizeInputSourceSensitivity(selectedItems(input.inputSources, input.buildInput.inputSourceIds)),
    model: 'blocked:text-provider',
    createdAt: input.now,
    updatedAt: input.now,
  };
}

function sanitizedFailureReason(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = message
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .trim();
  return sanitized || '内容知识地图生成失败，请检查生成服务配置或缩小输入后重试。';
}

function buildStep(input: {
  key: string;
  title: string;
  status: ContentKnowledgeMapBuildRunStepStatus;
  message: string;
  startedAt: string;
  completedAt?: string;
}): ContentKnowledgeMapBuildRunStep {
  return {
    key: input.key,
    title: input.title,
    status: input.status,
    message: input.message,
    startedAt: input.startedAt,
    completedAt: input.completedAt ?? new Date().toISOString(),
  };
}

function buildRunTitle(input: {
  buildInput: BuildContentKnowledgeMapInput;
  inputSources: Array<{ title?: string }>;
  brandKnowledgeBases: Array<{ title?: string }>;
}): string {
  return input.buildInput.title?.trim()
    || `${input.brandKnowledgeBases[0]?.title ?? input.inputSources[0]?.title ?? '内容项目'} 生成流程`;
}

export class ContentKnowledgeMapApplicationService {
  constructor(
    private readonly store: ContentKnowledgeMapStore,
    private readonly buildRuns: ContentKnowledgeMapBuildRunStore,
    private readonly inputSources: InputSourceStore,
    private readonly brandKnowledgeBases: BrandKnowledgeBaseStore,
    private readonly ipKnowledgeBases: IpKnowledgeBaseStore,
    private readonly sceneCards: SceneLibraryStore,
    private readonly promptDrafts: PromptDraftStore,
    private readonly assetReviews: AssetReviewStore,
    private readonly sync: ContentKnowledgeMapSyncPort,
    private readonly buildRuntime?: ContentKnowledgeMapBuildRuntime,
  ) {}

  async list(workspacePath: string): Promise<ContentKnowledgeMapRecord[]> {
    await this.refreshTeamKnowledgeMaps(workspacePath);
    return this.store.list(workspacePath);
  }

  async listBuildRuns(workspacePath: string): Promise<ContentKnowledgeMapBuildRunRecord[]> {
    await this.refreshTeamBuildRuns(workspacePath);
    return this.buildRuns.list(workspacePath);
  }

  async build(input: BuildContentKnowledgeMapInput): Promise<ContentKnowledgeMapRecord> {
    const now = new Date().toISOString();
    const [inputSources, brandKnowledgeBases, ipKnowledgeBases, sceneCards, promptDrafts, assetReviews, teamSync] = await Promise.all([
      this.inputSources.list(input.workspacePath),
      this.brandKnowledgeBases.list(input.workspacePath),
      this.ipKnowledgeBases.list(input.workspacePath),
      this.sceneCards.list(input.workspacePath),
      this.promptDrafts.list(input.workspacePath),
      this.assetReviews.list(input.workspacePath),
      this.sync.draftStatus(input.workspacePath),
    ]);
    const sources = {
      inputSources,
      brandKnowledgeBases,
      ipKnowledgeBases,
      sceneCards,
      promptDrafts,
      assetReviews,
    };
    const baseSteps = [
      buildStep({
        key: 'collect-inputs',
        title: '收集输入',
        status: 'completed',
        message: [
          `${selectedIds(inputSources, input.inputSourceIds).length} 个输入源`,
          `${selectedIds(brandKnowledgeBases, input.brandKnowledgeBaseIds).length} 个品牌知识库`,
          `${selectedIds(ipKnowledgeBases, input.ipKnowledgeBaseIds).length} 个 IP 版本`,
          `${assetReviews.length} 条素材审核`,
        ].join(' / '),
        startedAt: now,
        completedAt: now,
      }),
      buildStep({
        key: 'team-status',
        title: '团队状态',
        status: teamSync.status === 'blocked' || teamSync.status === 'conflict' ? 'blocked' : 'completed',
        message: teamSync.message,
        startedAt: now,
        completedAt: now,
      }),
    ];
    const saveBuildRun = async (record: ContentKnowledgeMapRecord, extraSteps: ContentKnowledgeMapBuildRunStep[]) => {
      const buildRun: ContentKnowledgeMapBuildRunRecord = {
        id: randomUUID(),
        workspacePath: input.workspacePath,
        title: buildRunTitle({ buildInput: input, inputSources, brandKnowledgeBases }),
        status: record.status === 'blocked' ? 'blocked' : 'completed',
        contentKnowledgeMapId: record.id,
        contentKnowledgeMapTitle: record.title,
        model: record.model,
        inputSourceIds: record.sourceInputSourceIds,
        brandKnowledgeBaseIds: record.brandKnowledgeBaseIds,
        ipKnowledgeBaseIds: record.ipKnowledgeBaseIds ?? [],
        sceneCardIds: record.sceneCardIds,
        promptDraftIds: record.promptDraftIds,
        readyPercent: record.coverage.readyPercent,
        evidenceCount: record.coverage.evidenceCount,
        gapCount: record.coverage.gapCount,
        issues: record.gaps,
        steps: [...baseSteps, ...extraSteps],
        teamSync,
        startedAt: now,
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const savedBuildRun = await this.buildRuns.save(buildRun);
      if (teamSync.status === 'local-only') return record;
      const safetyIssues = contentKnowledgeMapSensitiveIssues(record);
      if (safetyIssues.length) {
        const blockedTeamSync: ContentKnowledgeMapRecord['teamSync'] = {
          ...teamSync,
          status: 'blocked',
          message: safetyIssues.join(' '),
          lastSyncedAt: new Date().toISOString(),
        };
        const blockedRecord = await this.store.save({
          ...record,
          syncStatus: 'blocked',
          teamSync: blockedTeamSync,
          updatedAt: new Date().toISOString(),
        });
        await this.buildRuns.save({
          ...savedBuildRun,
          status: 'blocked',
          issues: Array.from(new Set([...savedBuildRun.issues, ...safetyIssues])),
          teamSync: blockedTeamSync,
          updatedAt: new Date().toISOString(),
        });
        return blockedRecord;
      }

      const mapSync = this.sync.upsertKnowledgeMapSnapshot
        ? await this.sync.upsertKnowledgeMapSnapshot({ record, authorLabel: 'Content Studio' })
        : undefined;
      const syncedRecord = mapSync
        ? await this.store.save({
          ...record,
          syncStatus: mapSync.status,
          teamSync: mapSync,
          updatedAt: new Date().toISOString(),
        })
        : record;
      const buildRunWithMapSync = mapSync
        ? await this.buildRuns.save({
          ...savedBuildRun,
          teamSync: mapSync,
          updatedAt: new Date().toISOString(),
        })
        : savedBuildRun;
      if (mapSync && mapSync.status !== 'synced') return syncedRecord;
      const runSync = this.sync.appendBuildRun
        ? await this.sync.appendBuildRun({
          buildRun: buildRunWithMapSync,
          sourceKnowledgeMap: syncedRecord,
          authorLabel: 'Content Studio',
        })
        : undefined;
      if (!runSync || runSync.status === 'local-only') return syncedRecord;
      const finalRecord = await this.store.save({
        ...syncedRecord,
        syncStatus: runSync.status,
        teamSync: runSync,
        updatedAt: new Date().toISOString(),
      });
      await this.buildRuns.save({
        ...buildRunWithMapSync,
        teamSync: runSync,
        updatedAt: new Date().toISOString(),
      });
      return finalRecord;
    };
    if (!this.buildRuntime) {
      const record = await this.store.save(blockedBuildRecord({
        buildInput: input,
        now,
        teamSync,
        inputSources,
        brandKnowledgeBases,
        ipKnowledgeBases,
        sceneCards,
        promptDrafts,
        assetReviews,
        reason: '生成服务未接入：请先接入文字生成服务，再构建内容知识地图。',
      }));
      return saveBuildRun(record, [
        buildStep({
          key: 'model-config',
          title: '检查生成服务',
          status: 'blocked',
          message: '生成服务未接入：请先接入文字生成服务，再构建内容知识地图。',
          startedAt: now,
        }),
        buildStep({
          key: 'structure-output',
          title: '生成结构化矩阵',
          status: 'skipped',
          message: '生成服务未接入，本次未调用模型。',
          startedAt: now,
        }),
      ]);
    }
    try {
      await this.buildRuntime.getRuntimeConfig();
    } catch (error) {
      if (!(error instanceof TextProviderBlockedError)) throw error;
      const reason = error.message || '生成服务待配置：请先在模型设置中配置文字生成服务，再构建内容知识地图。';
      const record = await this.store.save(blockedBuildRecord({
        buildInput: input,
        now,
        teamSync,
        inputSources,
        brandKnowledgeBases,
        ipKnowledgeBases,
        sceneCards,
        promptDrafts,
        assetReviews,
        reason,
      }));
      return saveBuildRun(record, [
        buildStep({
          key: 'model-config',
          title: '检查生成服务',
          status: 'blocked',
          message: reason,
          startedAt: now,
        }),
        buildStep({
          key: 'structure-output',
          title: '生成结构化矩阵',
          status: 'skipped',
          message: '生成服务待配置，本次未调用模型。',
          startedAt: now,
        }),
      ]);
    }
    if (!hasModelGeneration(this.buildRuntime)) {
      const reason = '生成服务未接入结构化输出：请升级文字生成服务后再构建内容知识地图。';
      const record = await this.store.save(blockedBuildRecord({
        buildInput: input,
        now,
        teamSync,
        inputSources,
        brandKnowledgeBases,
        ipKnowledgeBases,
        sceneCards,
        promptDrafts,
        assetReviews,
        reason,
      }));
      return saveBuildRun(record, [
        buildStep({
          key: 'model-config',
          title: '检查生成服务',
          status: 'completed',
          message: '文字生成服务可读取运行配置。',
          startedAt: now,
        }),
        buildStep({
          key: 'structure-output',
          title: '生成结构化矩阵',
          status: 'blocked',
          message: reason,
          startedAt: now,
        }),
      ]);
    }
    const seed = buildContentKnowledgeMapDraft(input, sources);
    const seedStep = buildStep({
      key: 'prepare-seed',
      title: '整理来源证据',
      status: 'completed',
      message: `${seed.evidence.length} 条候选证据 / ${seed.sellingPoints.length + seed.painPoints.length + seed.scenarios.length} 个候选组合`,
      startedAt: now,
    });
    const buildResult = await this.buildWithTextModel(input, sources, seed, now, teamSync, this.buildRuntime);
    if (isContentKnowledgeMapRecord(buildResult)) {
      const record = await this.store.save(buildResult);
      return saveBuildRun(record, [
        buildStep({
          key: 'model-config',
          title: '检查生成服务',
          status: 'completed',
          message: '文字生成服务可用。',
          startedAt: now,
        }),
        seedStep,
        buildStep({
          key: 'structure-output',
          title: '生成结构化矩阵',
          status: 'blocked',
          message: record.gaps[0] || '内容知识地图生成失败。',
          startedAt: now,
        }),
      ]);
    }
    const build = buildResult;
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
        assetReviewCount: build.assetReviewCount,
        sceneCardCount: build.sceneCardIds.length,
        promptDraftCount: build.promptDraftIds.length,
        evidenceCount: build.evidence.length,
        gapCount: validation.gaps.length,
        readyPercent: validation.readyPercent,
      },
      sourceSensitivity: summarizeInputSourceSensitivity(inputSources.filter((source) => build.sourceInputSourceIds.includes(source.id))),
      model: build.model,
      createdAt: now,
      updatedAt: now,
    };
    const saved = await this.store.save(record);
    return saveBuildRun(saved, [
      buildStep({
        key: 'model-config',
        title: '检查生成服务',
        status: 'completed',
        message: '文字生成服务可用。',
        startedAt: now,
      }),
      seedStep,
      buildStep({
        key: 'structure-output',
        title: '生成结构化矩阵',
        status: 'completed',
        message: `${build.sellingPoints.length} 个卖点 / ${build.painPoints.length} 个痛点 / ${build.scenarios.length} 个场景`,
        startedAt: now,
      }),
      buildStep({
        key: 'quality-check',
        title: '质量检查',
        status: validation.status === 'blocked' ? 'blocked' : 'completed',
        message: validation.gaps.length ? validation.gaps[0] : `${validation.readyPercent}% 内容可用`,
        startedAt: now,
      }),
    ]);
  }

  update(input: ContentKnowledgeMapRecord): Promise<ContentKnowledgeMapRecord> {
    return this.store.update(input);
  }

  private async refreshTeamKnowledgeMaps(workspacePath: string): Promise<void> {
    if (!this.sync.listKnowledgeMaps) return;
    const localRecords = await this.store.list(workspacePath);
    const localById = new Map(localRecords.map((record) => [record.id, record]));
    const workspaceIds = await this.teamWorkspaceIds(workspacePath);
    await Promise.all(workspaceIds.map(async (workspaceId) => {
      try {
        const records = await this.sync.listKnowledgeMaps?.({ workspacePath, workspaceId });
        await Promise.all((records ?? []).map((record) => this.store.save(this.mergeTeamKnowledgeMap(record, localById.get(record.id)))));
      } catch {
        // 团队刷新失败时保留本机缓存，不把失败伪装成已同步。
      }
    }));
  }

  private async refreshTeamBuildRuns(workspacePath: string): Promise<void> {
    if (!this.sync.listBuildRuns) return;
    const localMaps = await this.store.list(workspacePath);
    const workspaceIds = this.workspaceIdsFromMaps(localMaps);
    await Promise.all(workspaceIds.map(async (workspaceId) => {
      try {
        const records = await this.sync.listBuildRuns?.({ workspacePath, workspaceId });
        await Promise.all((records ?? []).map((record) => this.buildRuns.save(record)));
      } catch {
        // 团队刷新失败时保留本机缓存，不把失败伪装成已同步。
      }
    }));
  }

  private async teamWorkspaceIds(workspacePath: string): Promise<string[]> {
    return this.workspaceIdsFromMaps(await this.store.list(workspacePath));
  }

  private workspaceIdsFromMaps(maps: ContentKnowledgeMapRecord[]): string[] {
    return Array.from(new Set(maps
      .map((map) => map.teamSync.workspaceId)
      .filter((workspaceId): workspaceId is string => Boolean(workspaceId))));
  }

  private mergeTeamKnowledgeMap(
    teamRecord: ContentKnowledgeMapRecord,
    localRecord: ContentKnowledgeMapRecord | undefined,
  ): ContentKnowledgeMapRecord {
    if (!localRecord) return teamRecord;
    if (localRecord.syncStatus === 'pending-sync' || localRecord.syncStatus === 'conflict') {
      return localRecord;
    }
    if (
      localRecord.syncStatus === 'synced' &&
      localRecord.teamSync.revision &&
      localRecord.updatedAt.localeCompare(teamRecord.updatedAt) >= 0
    ) {
      return {
        ...localRecord,
        syncStatus: localRecord.syncStatus,
        teamSync: {
          ...teamRecord.teamSync,
          ...localRecord.teamSync,
          status: localRecord.teamSync.status,
        },
      };
    }
    return teamRecord;
  }

  private async buildWithTextModel(
    input: BuildContentKnowledgeMapInput,
    sources: ContentKnowledgeMapBuildSources,
    seed: ContentKnowledgeMapBuildResult,
    now: string,
    teamSync: ContentKnowledgeMapRecord['teamSync'],
    runtime: ContentKnowledgeMapModelRuntime,
  ): Promise<ContentKnowledgeMapBuildResult | ContentKnowledgeMapRecord> {
    try {
      const result = await runtime.generateJson<ContentKnowledgeMapModelOutput>({
        workspacePath: input.workspacePath,
        systemPrompt: [
          '你是布谷AI内容工厂的内容知识地图构建器。',
          '你需要把产品资料、评论、SKU、品牌规则、IP 资料、场景卡和提示词草稿整理成可审核、可交付的业务矩阵。',
          '只能使用用户提供的资料和 seed.evidence，不得编造事实、功效、价格、测试、用户原声或案例。',
          '普通用户不需要理解 Ontology；输出必须是卖点、痛点、场景、证据、缺口和发布边界。',
        ].join('\n'),
        prompt: buildContentKnowledgeMapModelPrompt({ buildInput: input, sources, seed }),
        schema: contentKnowledgeMapModelSchema(),
        maxTurns: 2,
      });
      if (!result) throw new Error('文字模型未返回内容知识地图。');
      const build = buildContentKnowledgeMapFromModelOutput({
        buildInput: input,
        sources,
        seed,
        output: result.value,
        model: result.model,
      });
      if (!build.sellingPoints.length && !build.painPoints.length && !build.scenarios.length) {
        throw new Error('文字模型未产出可审核矩阵。');
      }
      return build;
    } catch (error) {
      if (error instanceof TextProviderBlockedError) {
        return blockedBuildRecord({
          buildInput: input,
          now,
          teamSync,
          inputSources: sources.inputSources,
          brandKnowledgeBases: sources.brandKnowledgeBases,
          ipKnowledgeBases: sources.ipKnowledgeBases,
          sceneCards: sources.sceneCards,
          promptDrafts: sources.promptDrafts,
          assetReviews: sources.assetReviews,
          reason: error.message || '生成服务待配置：请先在模型设置中配置文字生成服务，再构建内容知识地图。',
        });
      }
      return blockedBuildRecord({
        buildInput: input,
        now,
        teamSync,
        inputSources: sources.inputSources,
        brandKnowledgeBases: sources.brandKnowledgeBases,
        ipKnowledgeBases: sources.ipKnowledgeBases,
        sceneCards: sources.sceneCards,
        promptDrafts: sources.promptDrafts,
        assetReviews: sources.assetReviews,
        reason: `内容知识地图生成失败：${sanitizedFailureReason(error)}`,
      });
    }
  }
}
