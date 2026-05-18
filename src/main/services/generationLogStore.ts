import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { GenerationKind, GenerationLogEntry, GenerationStatus, KnowledgeCitation } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

interface CreateLogInput {
  workspacePath: string;
  kind: GenerationKind;
  status: GenerationStatus;
  title: string;
  summary?: string;
  model?: string;
  promptPackId?: string;
  sceneCardIds?: string[];
  citations?: KnowledgeCitation[];
  input?: unknown;
  output?: unknown;
  error?: string;
}

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'generation-logs.json');
}

export class GenerationLogStore {
  async list(workspacePath: string): Promise<GenerationLogEntry[]> {
    const logs = await readJsonFile<GenerationLogEntry[]>(filePathFor(workspacePath), []);
    return logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async append(input: CreateLogInput): Promise<GenerationLogEntry> {
    const now = new Date().toISOString();
    const entry: GenerationLogEntry = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      kind: input.kind,
      status: input.status,
      title: input.title,
      summary: input.summary,
      model: input.model,
      promptPackId: input.promptPackId,
      sceneCardIds: input.sceneCardIds,
      citations: input.citations,
      input: input.input,
      output: input.output,
      error: input.error,
      createdAt: now,
      updatedAt: now,
    };
    const logs = await this.list(input.workspacePath);
    await writeJsonFile(filePathFor(input.workspacePath), [entry, ...logs].slice(0, 200));
    return entry;
  }
}
