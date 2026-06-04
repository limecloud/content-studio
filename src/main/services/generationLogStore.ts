import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AssetReworkSource, GenerationKind, GenerationLogEntry, GenerationLogReview, GenerationStatus, KnowledgeCitation } from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

export interface CreateLogInput {
  workspacePath: string;
  workflowRunId?: string;
  reworkSource?: AssetReworkSource;
  kind: GenerationKind;
  status: GenerationStatus;
  title: string;
  summary?: string;
  model?: string;
  promptPackId?: string;
  sceneCardIds?: string[];
  citations?: KnowledgeCitation[];
  artifactRefs?: string[];
  input?: unknown;
  output?: unknown;
  error?: string;
  durationMs?: number;
  review?: GenerationLogReview;
}

export type UpdateLogInput = Partial<Omit<GenerationLogEntry, 'id' | 'workspacePath' | 'createdAt' | 'updatedAt'>>;

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'generation-logs.json');
}

function sortLogs(logs: GenerationLogEntry[]): GenerationLogEntry[] {
  return [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export class GenerationLogStore {
  async list(workspacePath: string): Promise<GenerationLogEntry[]> {
    const logs = await readJsonFile<GenerationLogEntry[]>(filePathFor(workspacePath), []);
    return sortLogs(logs);
  }

  async get(workspacePath: string, logId: string): Promise<GenerationLogEntry | null> {
    const normalizedId = logId.trim();
    if (!normalizedId) return null;
    const logs = await readJsonFile<GenerationLogEntry[]>(filePathFor(workspacePath), []);
    return logs.find((log) => log.id === normalizedId) ?? null;
  }

  async append(input: CreateLogInput): Promise<GenerationLogEntry> {
    const now = new Date().toISOString();
    const entry: GenerationLogEntry = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      workflowRunId: input.workflowRunId?.trim() || undefined,
      reworkSource: input.reworkSource,
      kind: input.kind,
      status: input.status,
      title: input.title,
      summary: input.summary,
      model: input.model,
      promptPackId: input.promptPackId,
      sceneCardIds: input.sceneCardIds,
      citations: input.citations,
      artifactRefs: input.artifactRefs,
      input: input.input,
      output: input.output,
      error: input.error,
      durationMs: input.durationMs,
      review: input.review,
      createdAt: now,
      updatedAt: now,
    };
    return updateJsonFile<GenerationLogEntry[], GenerationLogEntry>(
      filePathFor(input.workspacePath),
      [],
      (logs) => ({
        value: [entry, ...sortLogs(logs)].slice(0, 200),
        result: entry,
      }),
    );
  }

  async addArtifactRef(workspacePath: string, logId: string, path: string): Promise<GenerationLogEntry | null> {
    return updateJsonFile<GenerationLogEntry[], GenerationLogEntry | null>(
      filePathFor(workspacePath),
      [],
      (current) => {
        let updated: GenerationLogEntry | null = null;
        const nextLogs = sortLogs(current).map((log) => {
          if (log.id !== logId) return log;
          const artifactRefs = Array.from(new Set([...(log.artifactRefs ?? []), path]));
          const nextLog = { ...log, artifactRefs, updatedAt: new Date().toISOString() };
          updated = nextLog;
          return nextLog;
        });
        return {
          value: nextLogs,
          result: updated,
        };
      },
    );
  }

  async update(workspacePath: string, logId: string, input: UpdateLogInput): Promise<GenerationLogEntry | null> {
    return updateJsonFile<GenerationLogEntry[], GenerationLogEntry | null>(
      filePathFor(workspacePath),
      [],
      (current) => {
        let updated: GenerationLogEntry | null = null;
        const nextLogs = sortLogs(current).map((log) => {
          if (log.id !== logId) return log;
          const nextLog = {
            ...log,
            ...input,
            id: log.id,
            workspacePath: log.workspacePath,
            createdAt: log.createdAt,
            updatedAt: new Date().toISOString(),
          };
          updated = nextLog;
          return nextLog;
        });
        return {
          value: updated ? nextLogs : current,
          result: updated,
        };
      },
    );
  }
}
