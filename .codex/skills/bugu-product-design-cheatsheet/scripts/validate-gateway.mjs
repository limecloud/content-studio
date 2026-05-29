#!/usr/bin/env node
import { validateGatewayOnce } from "./gateway-validation.mjs";
import { resolveImageGatewayConfig } from "./codex-config.mjs";

function parseArgs(argv) {
  const args = new Map();
  const booleanFlags = new Set(["force", "print-config"]);
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (booleanFlags.has(token.slice(2))) {
      args.set(token.slice(2), "true");
      continue;
    }
    if (!token.startsWith("--")) {
      throw new Error(`Unexpected argument: ${token}`);
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Missing value for --${key}`);
    }
    args.set(key, value);
    index += 1;
  }
  return args;
}

function usage() {
  return [
    "用法：",
    "  node validate-gateway.mjs",
    "",
    "默认读取当前 Codex 配置：$CODEX_HOME/config.toml、$CODEX_HOME/auth.json；未设置 CODEX_HOME 时读取 ~/.codex。",
    "也兼容环境变量：IMAGE_API_KEY / OPENAI_API_KEY、IMAGE_BASE_URL / OPENAI_BASE_URL / OPENAI_API_BASE。",
    "",
    "可选参数：",
    "  --base-url <responses 网关基址>",
    "  --outer-model gpt-5.5",
    "  --image-model gpt-image-2",
    "  --codex-config-dir <Codex 配置目录>",
    "  --codex-config-file <config.toml 路径>",
    "  --codex-auth-file <auth.json 路径>",
    "  --print-config",
    "  --force",
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { apiKey, baseUrl, outerModel, imageModel, source } =
    await resolveImageGatewayConfig(args);
  if (args.get("print-config") === "true") {
    console.error(
      JSON.stringify(
        {
          baseUrl,
          outerModel,
          imageModel,
          source,
          hasApiKey: Boolean(apiKey),
        },
        null,
        2,
      ),
    );
  }

  const result = await validateGatewayOnce({
    apiKey,
    baseUrl,
    outerModel,
    imageModel,
    force: args.get("force") === "true",
  });
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
