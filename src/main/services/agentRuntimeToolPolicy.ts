import type { PermissionMode } from '../../shared/types';

export interface AgentRuntimeToolPolicy {
  selectedSkillSlugs: string[];
  permissionMode: PermissionMode;
}

export function buildAgentRuntimeToolPolicy(input: {
  selectedSkillSlugs?: string[];
  permissionMode?: PermissionMode;
}): AgentRuntimeToolPolicy {
  return {
    selectedSkillSlugs: input.selectedSkillSlugs ?? [],
    permissionMode: input.permissionMode ?? 'ask',
  };
}
