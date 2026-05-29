import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const DEFAULT_OUTER_MODEL = "gpt-5.5";
const DEFAULT_IMAGE_MODEL = "gpt-image-2";
const DEFAULT_ENV_KEY = "OPENAI_API_KEY";

export function resolveCodexConfigDir(explicitDir = "") {
  const raw = explicitDir.trim() || process.env.CODEX_HOME?.trim() || "~/.codex";
  return path.resolve(expandHome(raw));
}

export async function resolveImageGatewayConfig(args) {
  const codexConfigDir = resolveCodexConfigDir(args.get("codex-config-dir") ?? "");
  const configPath = args.get("codex-config-file") ?? path.join(codexConfigDir, "config.toml");
  const authPath = args.get("codex-auth-file") ?? path.join(codexConfigDir, "auth.json");
  const configText = await readTextIfExists(configPath);
  const auth = await readJsonIfExists(authPath);
  const codex = parseCodexConfig(configText);

  const explicitBaseUrl =
    args.get("base-url") ??
    process.env.IMAGE_BASE_URL?.trim() ??
    process.env.OPENAI_BASE_URL?.trim() ??
    process.env.OPENAI_API_BASE?.trim() ??
    "";
  const baseUrl = explicitBaseUrl || codex.baseUrl || defaultBaseUrlForProvider(codex.modelProvider);
  const outerModel =
    args.get("outer-model") ??
    process.env.IMAGE_OUTER_MODEL?.trim() ??
    codex.model ??
    DEFAULT_OUTER_MODEL;
  const imageModel =
    args.get("image-model") ?? process.env.IMAGE_MODEL?.trim() ?? DEFAULT_IMAGE_MODEL;

  const envKey = codex.envKey || DEFAULT_ENV_KEY;
  const explicitApiKey = process.env.IMAGE_API_KEY?.trim() ?? "";
  const envApiKey = envKey ? process.env[envKey]?.trim() ?? "" : "";
  const authApiKey = readAuthApiKey(auth);
  const configBackedApiKey =
    codex.requiresOpenaiAuth === false ? envApiKey || authApiKey : authApiKey || envApiKey;
  const apiKey = explicitApiKey || configBackedApiKey || "";

  if (!baseUrl) {
    throw new Error(
      [
        "缺少 base URL：请传 --base-url、设置 IMAGE_BASE_URL / OPENAI_BASE_URL / OPENAI_API_BASE，或在当前 Codex config.toml 里配置活动 model provider 的 base_url。",
        `已检查 Codex config: ${configPath}`,
      ].join("\n"),
    );
  }

  if (!apiKey) {
    throw new Error(
      [
        `缺少 API Key：请设置 IMAGE_API_KEY、${envKey}，或在当前 Codex auth.json 中配置 OPENAI_API_KEY。`,
        `已检查 Codex auth: ${authPath}`,
      ].join("\n"),
    );
  }

  if (!explicitBaseUrl && codex.wireApi && codex.wireApi !== "responses") {
    throw new Error(
      `当前 Codex provider 的 wire_api 是 ${codex.wireApi}，图片生成脚本需要 responses；请切到 Responses provider，或显式传 --base-url。`,
    );
  }

  return {
    apiKey,
    baseUrl,
    outerModel,
    imageModel,
    source: {
      authPath,
      configPath,
      codexConfigDir,
      baseUrl: explicitBaseUrl ? "explicit" : "codex-config",
      apiKey: explicitApiKey
        ? "IMAGE_API_KEY"
        : configBackedApiKey === authApiKey
          ? "codex-auth"
          : envKey,
      outerModel: args.has("outer-model")
        ? "argument"
        : process.env.IMAGE_OUTER_MODEL?.trim()
          ? "IMAGE_OUTER_MODEL"
          : codex.model
            ? "codex-config"
            : "default",
      imageModel: args.has("image-model")
        ? "argument"
        : process.env.IMAGE_MODEL?.trim()
          ? "IMAGE_MODEL"
          : "default",
      modelProvider: codex.modelProvider,
    },
  };
}

export function parseCodexConfig(configText) {
  const root = {};
  const sections = new Map();
  let currentPath = [];

  for (const rawLine of configText.split(/\r?\n/)) {
    const line = stripInlineComment(rawLine).trim();
    if (!line) continue;

    const section = parseTomlSection(line);
    if (section) {
      currentPath = section;
      const key = section.join(".");
      if (!sections.has(key)) {
        sections.set(key, {});
      }
      continue;
    }

    const assignment = parseTomlAssignment(line);
    if (!assignment) continue;

    const target = currentPath.length === 0 ? root : sections.get(currentPath.join("."));
    if (target) {
      target[assignment.key] = assignment.value;
    }
  }

  const modelProvider = typeof root.model_provider === "string" ? root.model_provider.trim() : "";
  const provider = modelProvider ? sections.get(["model_providers", modelProvider].join(".")) : null;

  return {
    model: typeof root.model === "string" ? root.model.trim() : "",
    modelProvider,
    openaiBaseUrl: typeof root.openai_base_url === "string" ? root.openai_base_url.trim() : "",
    baseUrl: pickString(provider?.base_url) || pickString(root.openai_base_url),
    envKey: pickString(provider?.env_key),
    wireApi: pickString(provider?.wire_api),
    requiresOpenaiAuth:
      typeof provider?.requires_openai_auth === "boolean" ? provider.requires_openai_auth : undefined,
  };
}

function readAuthApiKey(auth) {
  if (!auth || typeof auth !== "object" || Array.isArray(auth)) return "";
  return typeof auth.OPENAI_API_KEY === "string" ? auth.OPENAI_API_KEY.trim() : "";
}

function defaultBaseUrlForProvider(modelProvider) {
  if (!modelProvider || modelProvider === "openai") {
    return "https://api.openai.com/v1";
  }
  return "";
}

async function readTextIfExists(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function readJsonIfExists(filePath) {
  const text = await readTextIfExists(filePath);
  if (!text.trim()) return null;
  return JSON.parse(text);
}

function expandHome(value) {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function pickString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseTomlSection(line) {
  const match = line.match(/^\[([^\]]+)\]$/);
  if (!match) return null;
  return parseTomlPath(match[1]);
}

function parseTomlAssignment(line) {
  const index = findUnquotedChar(line, "=");
  if (index === -1) return null;
  const key = line.slice(0, index).trim();
  const value = parseTomlValue(line.slice(index + 1).trim());
  if (!key || value === undefined) return null;
  return { key: unquoteTomlString(key), value };
}

function parseTomlPath(rawPath) {
  const parts = [];
  let current = "";
  let quote = "";
  let escaped = false;

  for (const char of rawPath.trim()) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (quote === '"' && char === "\\") {
      current += char;
      escaped = true;
      continue;
    }
    if (quote) {
      current += char;
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      current += char;
      quote = char;
      continue;
    }
    if (char === ".") {
      parts.push(unquoteTomlString(current.trim()));
      current = "";
      continue;
    }
    current += char;
  }

  if (current.trim()) {
    parts.push(unquoteTomlString(current.trim()));
  }
  return parts;
}

function parseTomlValue(rawValue) {
  if (!rawValue) return "";
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    return unquoteTomlString(rawValue);
  }
  return undefined;
}

function unquoteTomlString(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1);
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function stripInlineComment(line) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === "#") {
      return line.slice(0, index);
    }
  }

  return line;
}

function findUnquotedChar(line, target) {
  let quote = "";
  let escaped = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote === '"' && char === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = "";
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === target) {
      return index;
    }
  }

  return -1;
}
