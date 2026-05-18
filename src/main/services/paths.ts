import { app } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(currentFile), '../../..');

export function getResourcesRoot(): string {
  if (process.env.CONTENT_STUDIO_RESOURCES_DIR) return process.env.CONTENT_STUDIO_RESOURCES_DIR;
  const candidates = [
    join(app.getAppPath(), 'resources'),
    join(projectRoot, 'resources'),
    join(process.resourcesPath, 'resources'),
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
