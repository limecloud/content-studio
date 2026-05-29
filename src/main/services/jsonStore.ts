import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

class JsonFileQueue {
  private tail: Promise<void> = Promise.resolve();

  run<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }
}

const queues = new Map<string, JsonFileQueue>();

function queueFor(filePath: string): JsonFileQueue {
  const existing = queues.get(filePath);
  if (existing) return existing;
  const queue = new JsonFileQueue();
  queues.set(filePath, queue);
  return queue;
}

async function writeJsonFileUnlocked<T>(filePath: string, value: T): Promise<void> {
  const dir = dirname(filePath);
  await mkdir(dir, { recursive: true });
  const tempPath = join(dir, `.${basename(filePath)}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`);
  try {
    await writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf-8');
    await rename(tempPath, filePath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  if (!existsSync(filePath)) return fallback;
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile<T>(filePath: string, value: T): Promise<void> {
  return queueFor(filePath).run(() => writeJsonFileUnlocked(filePath, value));
}

export async function updateJsonFile<T, TResult>(
  filePath: string,
  fallback: T,
  updater: (current: T) => Promise<{ value: T; result: TResult }> | { value: T; result: TResult },
): Promise<TResult> {
  return queueFor(filePath).run(async () => {
    const current = await readJsonFile(filePath, fallback);
    const updated = await updater(current);
    await writeJsonFileUnlocked(filePath, updated.value);
    return updated.result;
  });
}
