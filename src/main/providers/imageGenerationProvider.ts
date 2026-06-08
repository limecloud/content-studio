import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  formatImageTemplateInputs,
  formatImageTemplatePromptContext,
} from "../../shared/imageTemplates";
import type {
  ImageGenerationRequest,
  ModelConfigView,
} from "../../shared/types";
import { getWorkspaceAssetDir } from "../services/paths";
import {
  imageReferenceFileName,
  readImageReference,
  readJsonOrText,
  resolveGeminiGenerateContentEndpoint,
  resolveOpenAIChatEndpoint,
  resolveResponsesEndpoint,
  sanitizeProviderError,
} from "./multimodalProviderUtils";

const MAX_REAL_IMAGE_COUNT = 4;

export interface ImageGenerationConfig {
  apiKey: string;
  endpoint: string;
  protocol: ModelConfigView["imageProtocol"];
  outerModel: string;
  imageModel: string;
}

export interface ImageGenerationOutput {
  assetRefs: string[];
  transport: ModelConfigView["imageProtocol"];
}

function clampCount(count: number): number {
  return Math.min(Math.max(Math.trunc(count) || 1, 1), MAX_REAL_IMAGE_COUNT);
}

function nowSlug(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function compact(value: string, length: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > length
    ? `${normalized.slice(0, length)}...`
    : normalized;
}

function imageExtensionFromPayload(image: string): string {
  const match = /^data:image\/([^;]+);base64,/i.exec(image.trim());
  const mime = match?.[1]?.toLowerCase();
  if (mime === "jpeg" || mime === "jpg") return ".jpg";
  if (mime === "webp") return ".webp";
  return ".png";
}

function imageReferenceRows(input: ImageGenerationRequest): Array<{
  ref: string;
  label: string;
  fileName: string;
  mentioned: boolean;
}> {
  const prompt = input.prompt.toLowerCase();
  return [
    ...input.productImageRefs.map((ref, index) => ({
      ref,
      label: `产品图 ${index + 1}`,
      fileName: imageReferenceFileName(ref),
    })),
    ...input.referenceImageRefs.map((ref, index) => ({
      ref,
      label: `参考图 ${index + 1}`,
      fileName: imageReferenceFileName(ref),
    })),
  ].map((item) => {
    const fileName = item.fileName.toLowerCase();
    return {
      ...item,
      mentioned:
        Boolean(fileName) &&
        (prompt.includes(`@${fileName}`) || prompt.includes(fileName)),
    };
  });
}

function formatImageReferenceRows(input: ImageGenerationRequest): string {
  const rows = imageReferenceRows(input);
  if (rows.length === 0) return "未上传产品图或参考图。";
  return rows
    .map(
      (row) =>
        `${row.label}：${row.fileName}${row.mentioned ? "（用户 @ 点名重点参考）" : ""}`,
    )
    .join("\n");
}

function formatOptionalRows(title: string, rows?: string[]): string {
  const normalized = (rows ?? []).map((row) => row.trim()).filter(Boolean);
  if (normalized.length === 0) return "";
  return `${title}：\n${normalized.map((row, index) => `${index + 1}. ${row}`).join("\n")}`;
}

export function buildImagePrompt(input: ImageGenerationRequest): string {
  const citationText = input.citations.length
    ? input.citations
        .map(
          (item, index) =>
            `${index + 1}. ${item.title}：${compact(item.excerpt, 220)}`,
        )
        .join("\n")
    : "未绑定知识引用。";
  const useTemplateSkill = input.promptMode !== "free";
  const templateInputText = useTemplateSkill
    ? formatImageTemplateInputs(input.template, input.templateInputs)
    : "";
  const templatePromptContext = useTemplateSkill
    ? formatImageTemplatePromptContext(input.template)
    : "";
  const consistencyRules = formatOptionalRows("产品一致性规则", input.consistencyRules);
  const negativeConstraints = formatOptionalRows("负面约束", input.negativeConstraints);
  return [
    "你是电商内容工厂的图片生成器。请生成真实可用的中文电商图片素材，不要输出解释文字。",
    useTemplateSkill
      ? `模板：${input.template}`
      : "模板：自由模式（不使用预设技能）。",
    templateInputText ? `模板参数：\n${templateInputText}` : "",
    templatePromptContext
      ? `上一代图片技能配置（作为图片生成约束，不要原样输出文字）：\n${templatePromptContext}`
      : "",
    `提示词模式：${input.promptMode}；生成模式：${input.generationMode}；${input.watermark ? "允许轻量水印。" : "不要添加水印。"}`,
    `画幅：${input.params.aspectRatio}；分辨率：${input.params.resolution}；质量：${input.params.quality}。`,
    `产品图数量：${input.productImageRefs.length}；参考图数量：${input.referenceImageRefs.length}。如果附带了图片，请保持产品主体一致，并参考风格而不是复制版式。`,
    `图片引用清单：\n${formatImageReferenceRows(input)}`,
    consistencyRules,
    negativeConstraints,
    `核心提示词：${input.prompt || "根据知识库生成一张电商场景图，突出产品主体和真实使用场景。"}`,
    `知识引用：\n${citationText}`,
    "约束：中文文字必须清晰且尽量少；不要英文乱码；不要医疗化、治愈化、绝对化承诺；不要虚构品牌 Logo。",
  ].join("\n");
}

async function buildResponsesContent(
  input: ImageGenerationRequest,
): Promise<string | Array<Record<string, unknown>>> {
  const blocks: Array<Record<string, unknown>> = [
    { type: "input_text", text: buildImagePrompt(input) },
  ];
  const refs = [...input.productImageRefs, ...input.referenceImageRefs].slice(
    0,
    6,
  );
  const referenceRows = imageReferenceRows(input);
  for (const ref of refs) {
    const row = referenceRows.find((item) => item.ref === ref);
    try {
      const payload = await readImageReference(ref);
      if (!payload) continue;
      blocks.push({
        type: "input_text",
        text: `${row?.label ?? "输入图片"}：${row?.fileName ?? imageReferenceFileName(ref)}${row?.mentioned ? "。用户在提示词中 @ 点名这张图片，请优先参考。" : "。"} `,
      });
      blocks.push({
        type: "input_image",
        image_url: `data:${payload.mimeType};base64,${payload.data}`,
      });
    } catch (error) {
      blocks.push({
        type: "input_text",
        text: `参考图读取失败：${imageReferenceFileName(ref)}（${error instanceof Error ? error.message : "未知错误"}）`,
      });
    }
  }
  return blocks.length > 1
    ? [{ role: "user", content: blocks }]
    : buildImagePrompt(input);
}

async function buildChatContent(
  input: ImageGenerationRequest,
): Promise<string | Array<Record<string, unknown>>> {
  const blocks: Array<Record<string, unknown>> = [
    { type: "text", text: buildImagePrompt(input) },
  ];
  const refs = [...input.productImageRefs, ...input.referenceImageRefs].slice(
    0,
    6,
  );
  const referenceRows = imageReferenceRows(input);
  for (const ref of refs) {
    const row = referenceRows.find((item) => item.ref === ref);
    try {
      const payload = await readImageReference(ref);
      if (!payload) continue;
      blocks.push({
        type: "text",
        text: `${row?.label ?? "输入图片"}：${row?.fileName ?? imageReferenceFileName(ref)}${row?.mentioned ? "。用户在提示词中 @ 点名这张图片，请优先参考。" : "。"} `,
      });
      blocks.push({
        type: "image_url",
        image_url: {
          url: `data:${payload.mimeType};base64,${payload.data}`,
        },
      });
    } catch (error) {
      blocks.push({
        type: "text",
        text: `参考图读取失败：${imageReferenceFileName(ref)}（${error instanceof Error ? error.message : "未知错误"}）`,
      });
    }
  }
  return blocks.length > 1 ? blocks : buildImagePrompt(input);
}

async function buildGeminiParts(
  input: ImageGenerationRequest,
): Promise<Array<Record<string, unknown>>> {
  const parts: Array<Record<string, unknown>> = [
    { text: buildImagePrompt(input) },
  ];
  const refs = [...input.productImageRefs, ...input.referenceImageRefs].slice(
    0,
    6,
  );
  const referenceRows = imageReferenceRows(input);
  for (const ref of refs) {
    const row = referenceRows.find((item) => item.ref === ref);
    try {
      const payload = await readImageReference(ref);
      if (!payload) continue;
      parts.push({
        text: `${row?.label ?? "输入图片"}：${row?.fileName ?? imageReferenceFileName(ref)}${row?.mentioned ? "。用户在提示词中 @ 点名这张图片，请优先参考。" : "。"} `,
      });
      parts.push({
        inlineData: { mimeType: payload.mimeType, data: payload.data },
      });
    } catch (error) {
      parts.push({
        text: `参考图读取失败：${imageReferenceFileName(ref)}（${error instanceof Error ? error.message : "未知错误"}）`,
      });
    }
  }
  return parts;
}

function collectImagesFromResponses(payload: unknown): string[] {
  const images: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    if (
      record.type === "image_generation_call" &&
      typeof record.result === "string"
    )
      images.push(record.result);
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return images;
}

function collectDataUriImages(payload: unknown): string[] {
  const images: string[] = [];
  const visit = (value: unknown) => {
    if (!value) return;
    if (typeof value === "string") {
      const pattern = /data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+/gi;
      for (const match of value.matchAll(pattern)) images.push(match[0]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === "object")
      Object.values(value as Record<string, unknown>).forEach(visit);
  };
  visit(payload);
  return Array.from(new Set(images));
}

function collectGeminiInlineImages(payload: unknown): string[] {
  const images: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value as Record<string, unknown>;
    const inlineDataValue = record.inlineData ?? record.inline_data;
    const inlineData =
      inlineDataValue && typeof inlineDataValue === "object"
        ? (inlineDataValue as Record<string, unknown>)
        : undefined;
    const data = inlineData?.data;
    if (typeof data === "string" && data.trim()) {
      const mimeType = String(
        inlineData?.mimeType ?? inlineData?.mime_type ?? "image/png",
      );
      images.push(`data:${mimeType};base64,${data}`);
    }
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return images;
}

function parseSseChunk(chunk: string): unknown[] {
  return chunk
    .split("\n\n")
    .map((eventText) =>
      eventText
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("\n"),
    )
    .filter((data) => data && data !== "[DONE]")
    .map((data) => {
      try {
        return JSON.parse(data) as unknown;
      } catch {
        return null;
      }
    })
    .filter((value): value is unknown => value !== null);
}

async function readResponsesImages(response: Response): Promise<string[]> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.body || contentType.includes("application/json"))
    return collectImagesFromResponses(await response.json());

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const images: string[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const boundary = buffer.lastIndexOf("\n\n");
    if (boundary < 0) continue;
    const complete = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    for (const event of parseSseChunk(complete))
      images.push(...collectImagesFromResponses(event));
  }
  if (buffer.trim()) {
    for (const event of parseSseChunk(buffer))
      images.push(...collectImagesFromResponses(event));
  }
  return images;
}

async function postResponsesImage(
  config: ImageGenerationConfig,
  bodyInput: string | Array<Record<string, unknown>>,
): Promise<string[]> {
  const response = await fetch(resolveResponsesEndpoint(config.endpoint), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.outerModel,
      input: bodyInput,
      tools: [{ type: "image_generation", model: config.imageModel }],
      stream: true,
    }),
  });
  if (!response.ok) {
    const text = sanitizeProviderError(await response.text());
    throw new Error(
      `图片 Responses 生成服务返回 ${response.status}：${text.slice(0, 1000)}`,
    );
  }
  return readResponsesImages(response);
}

async function postOpenAIChatImage(
  config: ImageGenerationConfig,
  bodyInput: string | Array<Record<string, unknown>>,
): Promise<string[]> {
  const response = await fetch(resolveOpenAIChatEndpoint(config.endpoint), {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: config.imageModel,
      messages: [{ role: "user", content: bodyInput }],
      stream: false,
    }),
  });
  const payload = await readJsonOrText(response);
  if (!response.ok)
    throw new Error(
      `图片 Chat Completions 生成服务返回 ${response.status}：${sanitizeProviderError(JSON.stringify(payload)).slice(0, 1000)}`,
    );
  return collectDataUriImages(payload);
}

async function postGeminiImage(
  config: ImageGenerationConfig,
  parts: Array<Record<string, unknown>>,
  aspectRatio: string,
): Promise<string[]> {
  const response = await fetch(
    resolveGeminiGenerateContentEndpoint(config.endpoint, config.imageModel),
    {
      method: "POST",
      headers: {
        "x-goog-api-key": config.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: {
          responseModalities: ["TEXT", "IMAGE"],
        },
      }),
    },
  );
  const payload = await readJsonOrText(response);
  if (!response.ok)
    throw new Error(
      `Gemini 图片生成服务返回 ${response.status}：${sanitizeProviderError(JSON.stringify(payload)).slice(0, 1000)}`,
    );
  return collectGeminiInlineImages(payload);
}

async function writeBase64Images(
  input: ImageGenerationRequest,
  images: string[],
): Promise<string[]> {
  const operationId = randomUUID().slice(0, 8);
  const outputDir = join(getWorkspaceAssetDir(input.workspacePath), "images");
  await mkdir(outputDir, { recursive: true });
  const paths: string[] = [];
  for (const [index, image] of images.entries()) {
    const payload = image.includes(",")
      ? image.slice(image.indexOf(",") + 1)
      : image;
    const filePath = join(
      outputDir,
      `${nowSlug()}-image-${operationId}-${index + 1}${imageExtensionFromPayload(image)}`,
    );
    await writeFile(filePath, Buffer.from(payload, "base64"));
    paths.push(filePath);
  }
  return paths;
}

export async function generateImageAssets(
  input: ImageGenerationRequest,
  config: ImageGenerationConfig,
): Promise<ImageGenerationOutput> {
  const count = clampCount(input.params.count);
  const assetRefs: string[] = [];
  for (let index = 0; index < count; index += 1) {
    let images: string[];
    if (config.protocol === "openai-chat-data-uri") {
      const bodyInput =
        index === 0
          ? await buildChatContent(input)
          : `${buildImagePrompt(input)}\n生成第 ${index + 1} 张变体，保持同一产品与风格但改变构图。`;
      images = await postOpenAIChatImage(config, bodyInput);
    } else if (config.protocol === "gemini-generate-content") {
      const parts =
        index === 0
          ? await buildGeminiParts(input)
          : [
              {
                text: `${buildImagePrompt(input)}\n生成第 ${index + 1} 张变体，保持同一产品与风格但改变构图。`,
              },
            ];
      images = await postGeminiImage(config, parts, input.params.aspectRatio);
    } else {
      const bodyInput =
        index === 0
          ? await buildResponsesContent(input)
          : `${buildImagePrompt(input)}\n生成第 ${index + 1} 张变体，保持同一产品与风格但改变构图。`;
      images = await postResponsesImage(config, bodyInput);
    }
    if (images.length === 0)
      throw new Error(
        `图片生成服务未按 ${config.protocol} 协议返回可用图片。`,
      );
    assetRefs.push(...(await writeBase64Images(input, images)));
  }
  return { assetRefs, transport: config.protocol };
}
