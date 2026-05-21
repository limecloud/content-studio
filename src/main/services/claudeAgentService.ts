import { query } from '@anthropic-ai/claude-agent-sdk';
import { randomUUID } from 'node:crypto';
import type { AgentEvent, RunTaskInput } from '../../shared/types';
import { buildClaudeSubprocessEnv, ensureClaudeConfig } from './claudeSdkRuntime';
import { ModelConfigStore } from './modelConfigStore';
import { getOemRuntimeConfig } from './oemRuntimeConfig';
import { SettingsStore } from './settingsStore';

export type AgentEventSink = (event: AgentEvent) => void;

const DEFAULT_ALLOWED_TOOLS = ['Read', 'Write', 'Edit', 'MultiEdit', 'Glob', 'Grep', 'Bash', 'WebSearch', 'WebFetch', 'Skill'];

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((block) => {
      const value = block as Record<string, unknown>;
      return typeof value.text === 'string' ? value.text : '';
    })
    .filter(Boolean)
    .join('\n');
}

function mapSdkMessage(taskId: string, message: unknown): AgentEvent | null {
  const payload = message as Record<string, unknown>;
  const type = String(payload.type ?? 'message');
  if (type === 'assistant') {
    const sdkMessage = payload.message as Record<string, unknown> | undefined;
    const text = textFromContent(sdkMessage?.content);
    return text ? { type: 'assistant', taskId, text } : null;
  }
  if (type === 'user') {
    return null;
  }
  if (type === 'result') {
    return { type: 'result', taskId, summary: typeof payload.result === 'string' ? payload.result : undefined, raw: payload };
  }
  if (type.includes('tool')) {
    return { type: 'tool', taskId, name: String(payload.name ?? payload.tool_name ?? type), input: payload.input };
  }
  return { type: 'status', taskId, message: type };
}

export class ClaudeAgentService {
  private readonly controllers = new Map<string, AbortController>();

  constructor(private readonly settings: SettingsStore, private readonly modelConfig: ModelConfigStore) {}

  async run(input: RunTaskInput, sink: AgentEventSink): Promise<string> {
    const taskId = randomUUID();
    const controller = new AbortController();
    this.controllers.set(taskId, controller);
    void this.execute(taskId, input, controller, sink);
    return taskId;
  }

  cancel(taskId: string): boolean {
    const controller = this.controllers.get(taskId);
    if (!controller) return false;
    controller.abort();
    this.controllers.delete(taskId);
    return true;
  }

  private async execute(taskId: string, input: RunTaskInput, controller: AbortController, sink: AgentEventSink): Promise<void> {
    try {
      ensureClaudeConfig();
      const modelView = await this.modelConfig.readView();
      const apiKey = await this.settings.getAnthropicApiKey() || await this.modelConfig.getTextApiKey();
      sink({ type: 'status', taskId, message: '正在启动内容生产底座...' });
      const options = {
        cwd: input.workspacePath,
        model: modelView.textModel,
        maxTurns: 12,
        abortController: controller,
        permissionMode: input.permissionMode === 'allow-all' ? 'bypassPermissions' : 'default',
        allowedTools: DEFAULT_ALLOWED_TOOLS,
        env: buildClaudeSubprocessEnv({ apiKey, baseUrl: modelView.textApiEndpoint }),
        settingSources: ['user', 'project'],
        appendSystemPrompt: [
          `你是${getOemRuntimeConfig().productName}内容工厂里的内容生产助手。`,
          '优先使用当前工作区中的内容生成能力。',
          '输出要清晰标注：资料判断、内容策略、草稿、下一步确认。',
        ].join('\n'),
      };
      for await (const message of query({ prompt: input.prompt, options } as any)) {
        const event = mapSdkMessage(taskId, message);
        if (event) sink(event);
      }
      sink({ type: 'done', taskId });
    } catch (error) {
      sink({ type: 'error', taskId, message: error instanceof Error ? error.message : String(error) });
    } finally {
      this.controllers.delete(taskId);
    }
  }
}
