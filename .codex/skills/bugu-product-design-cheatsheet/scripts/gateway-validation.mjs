import { mkdir, readFile, writeFile } from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";

export function defaultValidationCacheDir() {
  if (process.env.BUGU_PRODUCT_DESIGN_VALIDATION_CACHE_DIR?.trim()) {
    return process.env.BUGU_PRODUCT_DESIGN_VALIDATION_CACHE_DIR.trim();
  }
  if (process.env.IMAGE_VALIDATION_CACHE_DIR?.trim()) {
    return process.env.IMAGE_VALIDATION_CACHE_DIR.trim();
  }
  return path.join(os.tmpdir(), "bugu-product-design-cheatsheet-validation");
}

function validationCacheKey({ baseUrl, outerModel, imageModel }) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify({ baseUrl, outerModel, imageModel }))
    .digest("hex")
    .slice(0, 24);
}

async function readCachedValidation(cacheFile) {
  try {
    const data = JSON.parse(await readFile(cacheFile, "utf8"));
    if (data?.ok === true) {
      return data;
    }
  } catch {
    return null;
  }
  return null;
}

async function writeCachedValidation(cacheFile, data) {
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, `${JSON.stringify(data, null, 2)}\n`);
}

async function runStreamValidation({ apiKey, baseUrl, outerModel, imageModel }) {
  const response = await fetchResponses({
    apiKey,
    baseUrl,
    outerModel,
    imageModel,
    input: "请只回复 OK，用于校验 Responses 流式接口；不要调用图片工具。",
  });

  if (!response.ok || !response.body) {
    const text = await response.text().catch(() => "");
    if (shouldRetryWithInputList(response.status, text)) {
      const retry = await fetchResponses({
        apiKey,
        baseUrl,
        outerModel,
        imageModel,
        input: [
          {
            role: "user",
            content: [
              {
                type: "input_text",
                text: "请只回复 OK，用于校验 Responses 流式接口；不要调用图片工具。",
              },
            ],
          },
        ],
      });
      if (!retry.ok || !retry.body) {
        const retryText = await retry.text().catch(() => "");
        throw new Error(`校验失败 ${retry.status}: ${retryText.slice(0, 1000)}`);
      }
      return readValidationStream(retry);
    }
    throw new Error(`校验失败 ${response.status}: ${text.slice(0, 1000)}`);
  }

  return readValidationStream(response);
}

function fetchResponses({ apiKey, baseUrl, outerModel, imageModel, input }) {
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

function shouldRetryWithInputList(status, text) {
  return status === 400 && /input must be a list/i.test(text);
}

async function readValidationStream(response) {
  const decoder = new TextDecoder();
  let sawEvent = false;
  let sawDone = false;
  for await (const chunk of response.body) {
    const text = decoder.decode(chunk, { stream: true });
    if (text.includes("event:")) {
      sawEvent = true;
    }
    if (text.includes("response.completed") || text.includes("response.output_item.done")) {
      sawDone = true;
    }
  }

  if (!sawEvent) {
    throw new Error("校验失败：响应不是预期的 SSE 事件流");
  }

  return { sawEvent, sawDone };
}

export async function validateGatewayOnce({
  apiKey,
  baseUrl,
  outerModel,
  imageModel,
  cacheDir = defaultValidationCacheDir(),
  force = false,
}) {
  if (!apiKey) {
    throw new Error("缺少 API Key");
  }
  if (!baseUrl) {
    throw new Error("缺少 base URL");
  }

  const cacheKey = validationCacheKey({ baseUrl, outerModel, imageModel });
  const cacheFile = path.join(cacheDir, `${cacheKey}.json`);
  if (!force) {
    const cached = await readCachedValidation(cacheFile);
    if (cached) {
      return { status: "cached", cacheFile, ...cached };
    }
  }

  const startedAt = new Date().toISOString();
  const stream = await runStreamValidation({ apiKey, baseUrl, outerModel, imageModel });
  const result = {
    ok: true,
    status: "validated",
    baseUrl,
    outerModel,
    imageModel,
    startedAt,
    validatedAt: new Date().toISOString(),
    stream,
  };
  await writeCachedValidation(cacheFile, result);
  return { ...result, cacheFile };
}
