import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  AppendShotGenerationLogInput,
  CreateImageProductionTaskInput,
  ImageProductionTask,
  ImageProductionTaskStatus,
  ShotPrompt,
  ShotPromptStatus,
  UpdateImageProductionTaskInput,
  UpdateShotPromptInput,
} from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'image-production-tasks.json');
}

function normalizeText(value?: string): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function compactList(values?: string[]): string[] {
  return Array.from(new Set((values ?? []).map((value) => normalizeText(value)).filter(Boolean))).slice(0, 40);
}

function sortedTasks(tasks: ImageProductionTask[]): ImageProductionTask[] {
  return [...tasks].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function taskStatusFromShots(shots: ShotPrompt[], fallback: ImageProductionTaskStatus): ImageProductionTaskStatus {
  if (shots.length === 0) return fallback;
  if (shots.some((shot) => shot.status === 'blocked')) return 'blocked';
  if (shots.some((shot) => shot.status === 'needs-rework' || shot.status === 'rejected')) return 'needs-rework';
  if (shots.some((shot) => shot.status === 'batching')) return 'batching';
  if (shots.some((shot) => shot.status === 'batch-review')) return 'batch-review';
  if (shots.every((shot) => shot.status === 'approved')) return 'completed';
  if (shots.some((shot) => shot.status === 'test-approved')) return 'test-approved';
  if (shots.some((shot) => shot.status === 'test-review')) return 'test-review';
  if (shots.some((shot) => shot.status === 'testing')) return 'testing';
  return fallback;
}

function ensureActiveShotId(task: ImageProductionTask, nextActiveShotId?: string): string | undefined {
  const normalized = normalizeText(nextActiveShotId);
  if (!normalized) return undefined;
  if (!task.shotPrompts.some((shot) => shot.id === normalized)) {
    throw new Error(`图片生产任务中不存在镜头: ${normalized}`);
  }
  return normalized;
}

function normalizeShot(input: Partial<Omit<ShotPrompt, 'id' | 'createdAt' | 'updatedAt'>> & { id?: string }, now: string): ShotPrompt {
  const title = normalizeText(input.title) || '镜头 Prompt';
  const prompt = normalizeText(input.prompt);
  return {
    id: normalizeText(input.id) || randomUUID(),
    title,
    scene: normalizeText(input.scene) || title,
    prompt,
    negativePrompt: normalizeText(input.negativePrompt) || undefined,
    productAction: normalizeText(input.productAction) || undefined,
    camera: normalizeText(input.camera) || undefined,
    lighting: normalizeText(input.lighting) || undefined,
    referenceImageRefs: compactList(input.referenceImageRefs),
    status: input.status ?? (prompt ? 'ready' : 'draft'),
    testLogIds: compactList(input.testLogIds),
    batchLogIds: compactList(input.batchLogIds),
    reviewIds: compactList(input.reviewIds),
    createdAt: now,
    updatedAt: now,
  };
}

function patchShot(shot: ShotPrompt, patch: UpdateShotPromptInput['patch'], now: string): ShotPrompt {
  const next: ShotPrompt = {
    ...shot,
    ...patch,
    title: patch.title === undefined ? shot.title : normalizeText(patch.title) || shot.title,
    scene: patch.scene === undefined ? shot.scene : normalizeText(patch.scene),
    prompt: patch.prompt === undefined ? shot.prompt : patch.prompt,
    negativePrompt: patch.negativePrompt === undefined ? shot.negativePrompt : normalizeText(patch.negativePrompt) || undefined,
    productAction: patch.productAction === undefined ? shot.productAction : normalizeText(patch.productAction) || undefined,
    camera: patch.camera === undefined ? shot.camera : normalizeText(patch.camera) || undefined,
    lighting: patch.lighting === undefined ? shot.lighting : normalizeText(patch.lighting) || undefined,
    referenceImageRefs: patch.referenceImageRefs === undefined ? shot.referenceImageRefs : compactList(patch.referenceImageRefs),
    testLogIds: patch.testLogIds === undefined ? shot.testLogIds : compactList(patch.testLogIds),
    batchLogIds: patch.batchLogIds === undefined ? shot.batchLogIds : compactList(patch.batchLogIds),
    reviewIds: patch.reviewIds === undefined ? shot.reviewIds : compactList(patch.reviewIds),
    status: patch.status ?? shot.status,
    createdAt: shot.createdAt,
    updatedAt: now,
  };
  if (!next.prompt.trim() && next.status === 'ready') return { ...next, status: 'draft' };
  return next;
}

function defaultShot(input: CreateImageProductionTaskInput, now: string): ShotPrompt {
  return normalizeShot({
    title: '镜头 01',
    scene: normalizeText(input.sourceSummary) || '当前画面需求',
    prompt: normalizeText(input.sourceSummary) || '',
    referenceImageRefs: input.referenceImageRefs,
    status: normalizeText(input.sourceSummary) ? 'ready' : 'draft',
  }, now);
}

export class ImageProductionTaskStore {
  async list(workspacePath: string): Promise<ImageProductionTask[]> {
    const tasks = await readJsonFile<ImageProductionTask[]>(filePathFor(workspacePath), []);
    return sortedTasks(tasks);
  }

  async create(input: CreateImageProductionTaskInput): Promise<ImageProductionTask> {
    return updateJsonFile<ImageProductionTask[], ImageProductionTask>(
      filePathFor(input.workspacePath),
      [],
      (current) => {
        const now = new Date().toISOString();
        const shots = input.shotPrompts?.length
          ? input.shotPrompts.map((shot) => normalizeShot(shot, now))
          : [defaultShot(input, now)];
        const title = normalizeText(input.title) || '图片素材生产任务';
        const task: ImageProductionTask = {
          id: randomUUID(),
          workspacePath: input.workspacePath,
          title,
          status: taskStatusFromShots(shots, 'draft'),
          sourceSummary: normalizeText(input.sourceSummary),
          productImageRefs: compactList(input.productImageRefs),
          referenceImageRefs: compactList(input.referenceImageRefs),
          consistencyRules: compactList(input.consistencyRules),
          negativeConstraints: compactList(input.negativeConstraints),
          shotPrompts: shots,
          activeShotPromptId: shots[0]?.id,
          createdAt: now,
          updatedAt: now,
        };
        return {
          value: [task, ...sortedTasks(current)].slice(0, 80),
          result: task,
        };
      },
    );
  }

  async update(input: UpdateImageProductionTaskInput): Promise<ImageProductionTask> {
    return updateJsonFile<ImageProductionTask[], ImageProductionTask>(
      filePathFor(input.workspacePath),
      [],
      (current) => {
        const now = new Date().toISOString();
        let updated: ImageProductionTask | undefined;
        const next = sortedTasks(current).map((task) => {
          if (task.id !== input.taskId) return task;
          updated = {
            ...task,
            title: input.title === undefined ? task.title : normalizeText(input.title) || task.title,
            status: input.status ?? task.status,
            sourceSummary: input.sourceSummary === undefined ? task.sourceSummary : normalizeText(input.sourceSummary),
            productImageRefs: input.productImageRefs === undefined ? task.productImageRefs : compactList(input.productImageRefs),
            referenceImageRefs: input.referenceImageRefs === undefined ? task.referenceImageRefs : compactList(input.referenceImageRefs),
            consistencyRules: input.consistencyRules === undefined ? task.consistencyRules : compactList(input.consistencyRules),
            negativeConstraints: input.negativeConstraints === undefined ? task.negativeConstraints : compactList(input.negativeConstraints),
            activeShotPromptId: input.activeShotPromptId === undefined
              ? task.activeShotPromptId
              : ensureActiveShotId(task, input.activeShotPromptId),
            updatedAt: now,
          };
          return updated;
        });
        if (!updated) throw new Error(`图片生产任务不存在: ${input.taskId}`);
        return {
          value: sortedTasks(next),
          result: updated,
        };
      },
    );
  }

  async updateShot(input: UpdateShotPromptInput): Promise<ImageProductionTask> {
    return updateJsonFile<ImageProductionTask[], ImageProductionTask>(
      filePathFor(input.workspacePath),
      [],
      (current) => {
        const now = new Date().toISOString();
        let updated: ImageProductionTask | undefined;
        const next = sortedTasks(current).map((task) => {
          if (task.id !== input.taskId) return task;
          const existing = input.shotPromptId
            ? task.shotPrompts.find((shot) => shot.id === input.shotPromptId)
            : undefined;
          if (input.shotPromptId && !existing) {
            throw new Error(`图片生产任务中不存在镜头: ${input.shotPromptId}`);
          }
          const shot = existing
            ? patchShot(existing, input.patch, now)
            : normalizeShot(input.patch, now);
          const shotPrompts = existing
            ? task.shotPrompts.map((item) => (item.id === shot.id ? shot : item))
            : [...task.shotPrompts, shot];
          updated = {
            ...task,
            shotPrompts,
            status: taskStatusFromShots(shotPrompts, task.status),
            activeShotPromptId: shot.id,
            updatedAt: now,
          };
          return updated;
        });
        if (!updated) throw new Error(`图片生产任务不存在: ${input.taskId}`);
        return {
          value: sortedTasks(next),
          result: updated,
        };
      },
    );
  }

  async appendGenerationLog(input: AppendShotGenerationLogInput): Promise<ImageProductionTask> {
    return updateJsonFile<ImageProductionTask[], ImageProductionTask>(
      filePathFor(input.workspacePath),
      [],
      (current) => {
        const now = new Date().toISOString();
        let updated: ImageProductionTask | undefined;
        const next = sortedTasks(current).map((task) => {
          if (task.id !== input.taskId) return task;
          const targetShot = task.shotPrompts.find((shot) => shot.id === input.shotPromptId);
          if (!targetShot) throw new Error(`图片生产任务中不存在镜头: ${input.shotPromptId}`);
          const shotPrompts = task.shotPrompts.map((shot) => {
            if (shot.id !== input.shotPromptId) return shot;
            const logIds = input.generationStage === 'test'
              ? { testLogIds: compactList([...shot.testLogIds, input.logId]), batchLogIds: shot.batchLogIds }
              : { testLogIds: shot.testLogIds, batchLogIds: compactList([...shot.batchLogIds, input.logId]) };
            const status: ShotPromptStatus = input.generationStage === 'test' ? 'testing' : 'batching';
            return {
              ...shot,
              ...logIds,
              status,
              updatedAt: now,
            };
          });
          updated = {
            ...task,
            status: input.generationStage === 'test' ? 'testing' : 'batching',
            shotPrompts,
            activeShotPromptId: input.shotPromptId,
            updatedAt: now,
          };
          return updated;
        });
        if (!updated) throw new Error(`图片生产任务不存在: ${input.taskId}`);
        return {
          value: sortedTasks(next),
          result: updated,
        };
      },
    );
  }
}
