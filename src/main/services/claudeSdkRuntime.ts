import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

let claudeConfigChecked = false;
const UTF8_BOM = '\uFEFF';

function writeConfigSafe(configPath: string, content: string): void {
  try {
    writeFileSync(configPath, content, 'utf-8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (process.platform === 'win32' && (code === 'EBUSY' || code === 'EPERM')) {
      const startedAt = Date.now();
      while (Date.now() - startedAt < 100) {
        // Windows 上安全软件偶发锁文件，短暂同步等待后重试一次。
      }
      try {
        writeFileSync(configPath, content, 'utf-8');
      } catch {
        // 修复 Claude 配置是 best-effort，真正失败交给 SDK 报错。
      }
    }
  }
}

export function ensureClaudeConfig(): void {
  if (claudeConfigChecked) return;
  claudeConfigChecked = true;
  const configPath = join(homedir(), '.claude.json');
  const backupPath = `${configPath}.backup`;

  if (existsSync(backupPath)) {
    try {
      unlinkSync(backupPath);
    } catch {
      // best-effort
    }
  }

  try {
    for (const file of readdirSync(homedir())) {
      if (file.startsWith('.claude.json.corrupted.')) {
        try {
          unlinkSync(join(homedir(), file));
        } catch {
          // best-effort
        }
      }
    }
  } catch {
    // best-effort
  }

  if (!existsSync(configPath)) {
    writeConfigSafe(configPath, '{}');
    return;
  }

  try {
    const raw = readFileSync(configPath, 'utf-8');
    const content = raw.startsWith(UTF8_BOM) ? raw.slice(1) : raw;
    if (!content.trim()) {
      writeConfigSafe(configPath, '{}');
      return;
    }
    JSON.parse(content);
    if (content !== raw) writeConfigSafe(configPath, content);
  } catch {
    writeConfigSafe(configPath, '{}');
  }
}

export function buildClaudeSubprocessEnv(input: {
  apiKey?: string;
  baseUrl?: string;
  extra?: Record<string, string | undefined>;
} = {}): Options['env'] {
  const env: Record<string, string | undefined> = {
    ...process.env,
    ...input.extra,
    CLAUDE_AGENT_SDK_CLIENT_APP: 'content-studio/0.3.0',
  };

  if (input.apiKey) env.ANTHROPIC_API_KEY = input.apiKey;
  const baseUrl = input.baseUrl?.trim();
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;

  delete env.CLAUDE_CODE_USE_BEDROCK;
  delete env.AWS_BEARER_TOKEN_BEDROCK;
  delete env.ANTHROPIC_BEDROCK_BASE_URL;
  return env;
}
