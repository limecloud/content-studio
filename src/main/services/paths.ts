import { app } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(currentFile), '../../..');

function appPathFallback(): string {
  const electronApp = app as unknown as { getAppPath?: () => string };
  return electronApp?.getAppPath?.() ?? projectRoot;
}

export function getResourcesRoot(): string {
  if (process.env.CONTENT_STUDIO_RESOURCES_DIR) return process.env.CONTENT_STUDIO_RESOURCES_DIR;
  const candidates = [
    join(appPathFallback(), 'resources'),
    join(projectRoot, 'resources'),
    process.resourcesPath ? join(process.resourcesPath, 'resources') : join(projectRoot, 'resources'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? candidates[0];
}

export function getWorkspaceDataDir(workspacePath: string): string {
  return join(workspacePath, '.content-studio');
}

export function getWorkspaceKnowledgeDir(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'knowledge-bases');
}

export function getWorkspaceAssetDir(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'assets');
}
