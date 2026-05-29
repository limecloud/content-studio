#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateGatewayOnce } from "./gateway-validation.mjs";
import { resolveImageGatewayConfig } from "./codex-config.mjs";

function parseArgs(argv) {
  const args = new Map();
  const booleanFlags = new Set(["skip-validation", "print-config"]);
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
    "  node generate-image.mjs --prompt-file /tmp/bugu-product-design-prompt.txt --output docs/roadmap/v2/prototype/images/example.png",
    "",
    "默认读取当前 Codex 配置：$CODEX_HOME/config.toml、$CODEX_HOME/auth.json；未设置 CODEX_HOME 时读取 ~/.codex。",
    "也兼容环境变量：IMAGE_API_KEY / OPENAI_API_KEY、IMAGE_BASE_URL / OPENAI_BASE_URL / OPENAI_API_BASE。",
    "",
    "可选参数：",
    "  --base-url <responses 网关基址>",
    "  --style-file /tmp/style.txt",
    "  --outer-model gpt-5.5",
    "  --image-model gpt-image-2",
    "  --codex-config-dir <Codex 配置目录>",
    "  --codex-config-file <config.toml 路径>",
    "  --codex-auth-file <auth.json 路径>",
    "  --print-config",
    "  --skip-validation",
  ].join("\n");
}

function extractImageFromEvent(eventName, dataText) {
  if (eventName !== "response.output_item.done" || !dataText || dataText === "[DONE]") {
    return null;
  }
  let data;
  try {
    data = JSON.parse(dataText);
  } catch {
    return null;
  }
  const item = data.item;
  if (item?.type === "image_generation_call" && item.result) {
    return item.result;
  }
  return null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const promptFile = args.get("prompt-file");
  const output = args.get("output");
  if (!promptFile || !output) {
    throw new Error(`${usage()}\n\nMissing --prompt-file or --output`);
  }

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
  if (!args.has("skip-validation")) {
    await validateGatewayOnce({ apiKey, baseUrl, outerModel, imageModel });
  }
  const prompt = await readFile(promptFile, "utf8");
  const styleFile = args.get("style-file");
  const stylePrompt = styleFile ? await readFile(styleFile, "utf8") : "";
  const input = stylePrompt.trim()
    ? `${prompt.trim()}\n\n统一风格要求：\n${stylePrompt.trim()}\n`
    : prompt;

  const response = await fetchImageResponse({
    apiKey,
    baseUrl,
    outerModel,
    imageModel,
    input,
  });

  const finalResponse = await retryWithInputListIfNeeded({
    response,
    apiKey,
    baseUrl,
    outerModel,
    imageModel,
    input,
  });

  if (!finalResponse.ok || !finalResponse.body) {
    const text = await finalResponse.text().catch(() => "");
    throw new Error(`请求失败 ${finalResponse.status}: ${text.slice(0, 1000)}`);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let imageBase64 = null;

  for await (const chunk of finalResponse.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const lines = rawEvent.split(/\r?\n/);
      const eventName = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
      const dataText = lines
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      imageBase64 = extractImageFromEvent(eventName, dataText) ?? imageBase64;
    }
  }

  if (!imageBase64) {
    throw new Error("SSE 流里没有找到 image_generation_call.result");
  }

  const outputPath = path.resolve(output);
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, Buffer.from(imageBase64, "base64"));
  console.log(JSON.stringify({ outputPath, bytes: Buffer.byteLength(imageBase64, "base64") }));
}

function fetchImageResponse({ apiKey, baseUrl, outerModel, imageModel, input }) {
  return fetch(`${baseUrl.replace(/\/$/, "")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: outerModel,
      input,
      tools: [{ type: "image_generation", model: imageModel }],
      stream: true,
    }),
  });
}

async function retryWithInputListIfNeeded({ response, apiKey, baseUrl, outerModel, imageModel, input }) {
  if (response.ok && response.body) return response;

  const text = await response.text().catch(() => "");
  if (!shouldRetryWithInputList(response.status, text)) {
    return new Response(text, { status: response.status, statusText: response.statusText });
  }

  return fetchImageResponse({
    apiKey,
    baseUrl,
    outerModel,
    imageModel,
    input: [
      {
        role: "user",
        content: [{ type: "input_text", text: input }],
      },
    ],
  });
}

function shouldRetryWithInputList(status, text) {
  return status === 400 && /input must be a list/i.test(text);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
