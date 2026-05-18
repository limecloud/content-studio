import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentFile = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(currentFile), '../../..');

export function getResourcesRoot(): string {
  return process.env.CONTENT_STUDIO_RESOURCES_DIR ?? join(projectRoot, 'resources');
}

export function getWorkspaceDataDir(workspacePath: string): string {
  return join(workspacePath, '.content-studio');
}

export function getWorkspaceKnowledgeDir(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'knowledge-bases');
}
