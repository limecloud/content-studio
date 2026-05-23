import type { Options } from '@anthropic-ai/claude-agent-sdk';
import { existsSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

let claudeConfigChecked = false;
const UTF8_BOM = '\uFEFF';
const require = createRequire(import.meta.url);
const DEFAULT_POSIX_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];

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

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

export function resolveAsarUnpackedPath(path: string): string {
  return path.replace(/([/\\])app\.asar([/\\])/, '$1app.asar.unpacked$2');
}

function executablePath(path: string): string | undefined {
  const hostPath = resolveAsarUnpackedPath(path);
  if (hostPath !== path) return isFile(hostPath) ? hostPath : undefined;
  return isFile(path) ? path : undefined;
}

function nativeClaudeCodePackages(): string[] {
  if (process.arch !== 'arm64' && process.arch !== 'x64') return [];
  if (process.platform === 'darwin') return [`@anthropic-ai/claude-agent-sdk-darwin-${process.arch}`];
  if (process.platform === 'win32') return [`@anthropic-ai/claude-agent-sdk-win32-${process.arch}`];
  if (process.platform === 'linux') {
    return [
      `@anthropic-ai/claude-agent-sdk-linux-${process.arch}`,
      `@anthropic-ai/claude-agent-sdk-linux-${process.arch}-musl`,
    ];
  }
  return [];
}

export function resolveClaudeCodeExecutable(): string | undefined {
  const binaryName = process.platform === 'win32' ? 'claude.exe' : 'claude';
  const override = process.env.CONTENT_STUDIO_CLAUDE_CODE_EXECUTABLE?.trim();
  if (override) {
    const resolved = executablePath(override);
    if (resolved) return resolved;
  }

  for (const packageName of nativeClaudeCodePackages()) {
    try {
      const resolved = executablePath(require.resolve(`${packageName}/${binaryName}`));
      if (resolved) return resolved;
    } catch {
      // 可选原生包可能未安装，继续尝试下一个候选。
    }

    if (process.resourcesPath) {
      const unpacked = executablePath(join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', packageName, binaryName));
      if (unpacked) return unpacked;
    }
  }

  return undefined;
}

function envPathKey(env: Record<string, string | undefined>): string {
  return Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'PATH';
}

function defaultPathEntries(): string[] {
  if (process.platform !== 'win32') return DEFAULT_POSIX_PATHS;
  const root = process.env.SystemRoot || process.env.windir;
  return [
    root ? join(root, 'System32') : '',
    root ?? '',
    root ? join(root, 'System32', 'Wbem') : '',
  ].filter(Boolean);
}

function sanitizePath(value: string | undefined): string | undefined {
  const seen = new Set<string>();
  const entries = [...(value?.split(delimiter) ?? []), ...defaultPathEntries()]
    .map((entry) => resolveAsarUnpackedPath(entry.trim()))
    .filter((entry) => entry && isDirectory(entry))
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });
  return entries.length > 0 ? entries.join(delimiter) : undefined;
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

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }

  const pathKey = envPathKey(env);
  const sanitizedPath = sanitizePath(env[pathKey]);
  if (sanitizedPath) env[pathKey] = sanitizedPath;
  else delete env[pathKey];

  if (!env.npm_config_prefix?.trim()) delete env.npm_config_prefix;
  const claudeConfigDir = env.CLAUDE_CONFIG_DIR?.trim();
  if (claudeConfigDir && isDirectory(resolveAsarUnpackedPath(claudeConfigDir))) {
    env.CLAUDE_CONFIG_DIR = resolveAsarUnpackedPath(claudeConfigDir);
  } else {
    delete env.CLAUDE_CONFIG_DIR;
  }

  if (input.apiKey) env.ANTHROPIC_API_KEY = input.apiKey;
  const baseUrl = input.baseUrl?.trim();
  if (baseUrl) env.ANTHROPIC_BASE_URL = baseUrl;

  delete env.CLAUDE_CODE_USE_BEDROCK;
  delete env.AWS_BEARER_TOKEN_BEDROCK;
  delete env.ANTHROPIC_BEDROCK_BASE_URL;
  return env;
}
