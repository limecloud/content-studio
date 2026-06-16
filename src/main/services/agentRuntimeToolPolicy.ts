import type { PermissionMode } from '../../shared/types';
import {
  buildAgentCapabilityPolicy,
  type AgentCapabilityPolicy,
} from '@limecloud/agent-capability-catalog';

export type AgentRuntimeToolPolicy = AgentCapabilityPolicy;
export type AgentRuntimeSearchMode = 'allowed' | 'required' | 'disabled';

export interface AgentRuntimeHostOptions {
  asterChatRequest: {
    web_search?: boolean;
    search_mode?: AgentRuntimeSearchMode;
    turn_config?: {
      web_search?: boolean;
      search_mode?: AgentRuntimeSearchMode;
      provider_preference?: string;
      model_preference?: string;
      working_dir?: string;
      project_root?: string;
      metadata?: Record<string, unknown>;
    };
  };
}

export function buildAgentRuntimeToolPolicy(input: {
  selectedSkillSlugs?: readonly string[];
  permissionMode?: PermissionMode;
  requiredCapabilities?: readonly string[];
  capabilityHints?: readonly string[];
  tools?: readonly string[];
  metadata?: Record<string, unknown>;
}): AgentRuntimeToolPolicy {
  return buildAgentCapabilityPolicy({
    selectedSkillSlugs: input.selectedSkillSlugs,
    permissionMode: input.permissionMode ?? 'ask',
    requiredCapabilities: input.requiredCapabilities,
    capabilityHints: input.capabilityHints,
    tools: input.tools,
    metadata: input.metadata,
  }) as AgentRuntimeToolPolicy;
}

export function shouldRequireAgentWebSearch(input: {
  prompt?: string;
  requiredCapabilities?: readonly string[];
  capabilityHints?: readonly string[];
  tools?: readonly string[];
}): boolean {
  const prompt = input.prompt?.trim() ?? '';
  const requested = [
    ...(input.requiredCapabilities ?? []),
    ...(input.capabilityHints ?? []),
    ...(input.tools ?? []),
  ].some((value) => /research|search|web[_-]?search|deep[_-]?research/i.test(value));
  if (requested) return true;
  return /今天|今日|最新|实时|近期|新闻|资讯|舆情|趋势|联网|搜索|检索|查一下|帮我查|分析.*新闻|新闻.*分析/i.test(prompt);
}

export function buildAgentRuntimeHostOptions(input: {
  prompt?: string;
  workspacePath?: string;
  providerPreference?: string;
  modelPreference?: string;
  metadata?: Record<string, unknown>;
  requiredCapabilities?: readonly string[];
  capabilityHints?: readonly string[];
  tools?: readonly string[];
}): AgentRuntimeHostOptions {
  const requireWebSearch = shouldRequireAgentWebSearch(input);
  const searchMode: AgentRuntimeSearchMode = requireWebSearch ? 'required' : 'allowed';
  return {
    asterChatRequest: {
      web_search: true,
      search_mode: searchMode,
      turn_config: {
        web_search: true,
        search_mode: searchMode,
        provider_preference: input.providerPreference,
        model_preference: input.modelPreference,
        working_dir: input.workspacePath,
        project_root: input.workspacePath,
        metadata: {
          ...(input.metadata ?? {}),
          contentStudioToolPolicy: {
            webSearch: true,
            searchMode,
            required: requireWebSearch,
          },
        },
      },
    },
  };
}
