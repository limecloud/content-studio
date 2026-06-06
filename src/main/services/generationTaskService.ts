import { randomUUID } from 'node:crypto';
import type {
  ArticleGenerationRequest,
  GenerationLogEntry,
  GenerationStatus,
  GenerationTaskEvent,
  GenerationTaskKind,
  GenerationTaskRecord,
  GeneratePromptPackInput,
  GenerateSceneCardsInput,
  MediaGenerationResult,
  ImageGenerationRequest,
  ReferenceReverseRequest,
  ShotPromptStatus,
  SubmitGenerationTaskInput,
  VideoBreakdownRequest,
  VideoScriptGenerationRequest,
} from '../../shared/types';
import { MediaProvider } from '../providers/mediaProvider';
import { ArticleGenerationService } from './articleGenerationService';
import { GenerationLogStore, type CreateLogInput } from './generationLogStore';
import { ImageProductionTaskStore } from './imageProductionTaskStore';
import { PromptPackService } from './promptPackService';
import { ReferenceReverseService } from './referenceReverseService';
import { SceneLibraryStore } from './sceneLibraryStore';
import { VideoWorkflowService } from './videoWorkflowService';

type TaskEventPublisher = (event: GenerationTaskEvent) => void;

function inputWorkspace(input: SubmitGenerationTaskInput): string {
  return input.input.workspacePath;
}

function inputPrompt(input: SubmitGenerationTaskInput): string {
  const payload = input.input as unknown as Record<string, unknown>;
  for (const key of ['prompt', 'userIntent', 'customRequirement', 'topic', 'source']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function queuedTitle(kind: GenerationTaskKind): string {
  return {
    image: '图片生成任务已提交',
    video: '视频生成任务已提交',
    article: '文章生成任务已提交',
    'video-script': '视频脚本任务已提交',
    'video-breakdown': '视频拆解任务已提交',
    'prompt-pack': '提示词包任务已提交',
    'scene-card': '场景库任务已提交',
    'reference-reverse': '素材拆解任务已提交',
  }[kind];
}

function queuedSummary(kind: GenerationTaskKind): string {
  return {
    image: '已进入后台生成队列，离开当前界面不会中断；完成后会同步到历史记录。',
    video: '已进入后台生成队列，离开当前界面不会中断；完成后会同步到历史记录。',
    article: '已进入后台生成队列，离开当前界面不会中断；完成后会同步到历史记录。',
    'video-script': '已进入后台生成队列，完成后会同步到历史记录。',
    'video-breakdown': '已进入后台拆解队列，完成后会同步到历史记录。',
    'prompt-pack': '已进入后台提示词包队列，完成后会同步到历史记录。',
    'scene-card': '已进入后台场景库队列，完成后会同步到历史记录。',
    'reference-reverse': '已进入后台素材拆解队列，完成后会同步到历史记录。',
  }[kind];
}

function taskModel(input: SubmitGenerationTaskInput): string | undefined {
  const payload = input.input as unknown as Record<string, unknown>;
  const params = payload.params && typeof payload.params === 'object'
    ? payload.params as Record<string, unknown>
    : {};
  const model =
    input.kind === 'image' ? params.imageModel :
    input.kind === 'video' ? params.videoModel :
    params.textModel;
  return typeof model === 'string' ? model : undefined;
}

function initialLogInput(input: SubmitGenerationTaskInput): CreateLogInput {
  const payload = input.input as unknown as Record<string, unknown>;
  const prompt = inputPrompt(input);
  return {
    workspacePath: inputWorkspace(input),
    workflowRunId: typeof payload.workflowRunId === 'string' ? payload.workflowRunId : undefined,
    reworkSource: payload.reworkSource as CreateLogInput['reworkSource'],
    kind: input.kind,
    status: 'queued',
    title: queuedTitle(input.kind),
    summary: queuedSummary(input.kind),
    model: taskModel(input),
    promptPackId: typeof payload.promptPackId === 'string' ? payload.promptPackId : undefined,
    sceneCardIds: Array.isArray(payload.sceneCardIds) ? payload.sceneCardIds.filter((item): item is string => typeof item === 'string') : undefined,
    citations: Array.isArray(payload.citations) ? payload.citations as CreateLogInput['citations'] : undefined,
    input: input.input,
    output: input.kind === 'image' || input.kind === 'video' ? { assetRefs: [] } : undefined,
    artifactRefs: [],
    durationMs: 0,
    ...(prompt ? { summary: `${queuedSummary(input.kind)}\n${prompt.slice(0, 160)}` } : {}),
  };
}

function logToMediaMessage(log: GenerationLogEntry): string {
  return log.summary || log.error || log.title;
}

function mediaResultFromLog(log: GenerationLogEntry): MediaGenerationResult {
  const output = log.output && typeof log.output === 'object'
    ? log.output as Record<string, unknown>
    : {};
  const outputRefs = Array.isArray(output.assetRefs)
    ? output.assetRefs.filter((item): item is string => typeof item === 'string')
    : [];
  return {
    logId: log.id,
    status: log.status,
    message: logToMediaMessage(log),
    assetRefs: outputRefs.length ? outputRefs : log.artifactRefs ?? [],
  };
}

function taskMessage(status: GenerationStatus, log: GenerationLogEntry): string {
  if (status === 'queued') return queuedSummary(log.kind as GenerationTaskKind);
  if (status === 'running') return '后台任务正在生成中。';
  if (status === 'succeeded') return log.summary || '后台任务已完成，结果已写入历史记录。';
  if (status === 'blocked') return log.summary || log.error || '后台任务被阻止，请检查配置。';
  if (status === 'failed') return log.error || log.summary || '后台任务失败。';
  return logToMediaMessage(log);
}

function imageProductionShotStatus(input: SubmitGenerationTaskInput, log: GenerationLogEntry): ShotPromptStatus | undefined {
  if (input.kind !== 'image') return undefined;
  const payload = input.input as ImageGenerationRequest;
  if (!payload.generationStage) return undefined;
  if (log.status === 'succeeded') return payload.generationStage === 'test' ? 'test-review' : 'batch-review';
  if (log.status === 'blocked') return 'blocked';
  if (log.status === 'failed') return 'needs-rework';
  return undefined;
}

export class GenerationTaskService {
  private readonly tasks = new Map<string, GenerationTaskRecord>();

  constructor(
    private readonly logs: GenerationLogStore,
    private readonly media: MediaProvider,
    private readonly articles: ArticleGenerationService,
    private readonly promptPacks: PromptPackService,
    private readonly sceneCards: SceneLibraryStore,
    private readonly videoWorkflow: VideoWorkflowService,
    private readonly referenceReverse: ReferenceReverseService,
    private readonly imageProductionTasks?: ImageProductionTaskStore,
    private readonly publish?: TaskEventPublisher,
  ) {}

  list(workspacePath: string): GenerationTaskRecord[] {
    return [...this.tasks.values()]
      .filter((task) => task.workspacePath === workspacePath)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async submit(input: SubmitGenerationTaskInput): Promise<GenerationTaskRecord> {
    const now = new Date().toISOString();
    const log = await this.logs.append(initialLogInput(input));
    await this.bindImageProductionLog(input, log.id);
    const task: GenerationTaskRecord = {
      id: randomUUID(),
      workspacePath: inputWorkspace(input),
      logId: log.id,
      kind: input.kind,
      status: 'queued',
      title: log.title,
      message: queuedSummary(input.kind),
      createdAt: now,
      updatedAt: now,
    };
    this.tasks.set(task.id, task);
    this.emit(task, log);
    void this.run(input, task.id, log.id);
    return task;
  }

  private async bindImageProductionLog(input: SubmitGenerationTaskInput, logId: string): Promise<void> {
    if (input.kind !== 'image' || !this.imageProductionTasks) return;
    const payload = input.input as ImageGenerationRequest;
    if (!payload.productionTaskId || !payload.shotPromptId || !payload.generationStage) return;
    await this.imageProductionTasks.appendGenerationLog({
      workspacePath: payload.workspacePath,
      taskId: payload.productionTaskId,
      shotPromptId: payload.shotPromptId,
      generationStage: payload.generationStage,
      logId,
    });
  }

  private async run(input: SubmitGenerationTaskInput, taskId: string, logId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;
    await this.logs.update(inputWorkspace(input), logId, {
      status: 'running',
      summary: '后台任务正在生成中。',
    });
    await this.updateTask(taskId, { status: 'running', message: '后台任务正在生成中。', startedAt: new Date().toISOString() }, inputWorkspace(input), logId);
    try {
      await this.runByKind(input, logId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const logs = await this.logs.list(inputWorkspace(input));
      const currentLog = logs.find((item) => item.id === logId);
      if (!currentLog || currentLog.status === 'queued' || currentLog.status === 'running') {
        await this.logs.update(inputWorkspace(input), logId, {
          status: 'failed',
          title: `${queuedTitle(input.kind).replace('已提交', '失败')}`,
          summary: '后台生成任务失败。',
          error: message,
        });
      }
    } finally {
      const logs = await this.logs.list(inputWorkspace(input));
      const log = logs.find((item) => item.id === logId);
      if (!log) return;
      try {
        await this.syncImageProductionStatus(input, log);
      } catch {
        // SOP 任务同步失败不能阻断后台生成任务自身的完成事件。
      }
      await this.updateTask(taskId, {
        status: log.status,
        message: taskMessage(log.status, log),
        completedAt: ['queued', 'running'].includes(log.status) ? undefined : new Date().toISOString(),
        error: log.error,
      }, inputWorkspace(input), logId);
    }
  }

  private async runByKind(input: SubmitGenerationTaskInput, logId: string): Promise<void> {
    if (input.kind === 'image') {
      await this.media.generateImage(input.input, { logId });
      return;
    }
    if (input.kind === 'video') {
      await this.media.generateVideo(input.input, { logId });
      return;
    }
    if (input.kind === 'article') {
      await this.articles.generate(input.input as ArticleGenerationRequest, { logId });
      return;
    }
    if (input.kind === 'prompt-pack') {
      await this.promptPacks.generate(input.input as GeneratePromptPackInput, { logId });
      return;
    }
    if (input.kind === 'scene-card') {
      await this.sceneCards.generate(input.input as GenerateSceneCardsInput, { logId });
      return;
    }
    if (input.kind === 'video-script') {
      await this.videoWorkflow.generateScript(input.input as VideoScriptGenerationRequest, { logId });
      return;
    }
    if (input.kind === 'video-breakdown') {
      await this.videoWorkflow.analyze(input.input as VideoBreakdownRequest, { logId });
      return;
    }
    await this.referenceReverse.generate(input.input as ReferenceReverseRequest, { logId });
  }

  private async syncImageProductionStatus(input: SubmitGenerationTaskInput, log: GenerationLogEntry): Promise<void> {
    if (input.kind !== 'image' || !this.imageProductionTasks) return;
    const payload = input.input as ImageGenerationRequest;
    const status = imageProductionShotStatus(input, log);
    if (!payload.productionTaskId || !payload.shotPromptId || !status) return;
    await this.imageProductionTasks.updateShot({
      workspacePath: payload.workspacePath,
      taskId: payload.productionTaskId,
      shotPromptId: payload.shotPromptId,
      patch: { status },
    });
  }

  async resultForTask(task: GenerationTaskRecord): Promise<MediaGenerationResult | null> {
    if (task.kind !== 'image' && task.kind !== 'video') return null;
    const logs = await this.logs.list(task.workspacePath);
    const log = logs.find((item) => item.id === task.logId);
    return log ? mediaResultFromLog(log) : null;
  }

  private async updateTask(
    taskId: string,
    patch: Partial<GenerationTaskRecord>,
    workspacePath: string,
    logId: string,
  ): Promise<void> {
    const current = this.tasks.get(taskId);
    if (!current) return;
    const next: GenerationTaskRecord = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.tasks.set(taskId, next);
    const logs = await this.logs.list(workspacePath);
    const log = logs.find((item) => item.id === logId);
    if (log) this.emit(next, log);
  }

  private emit(task: GenerationTaskRecord, log: GenerationLogEntry): void {
    this.publish?.({ task, log });
  }
}
