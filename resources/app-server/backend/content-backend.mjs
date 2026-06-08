#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const DEFAULT_PROTOCOL = 'openai-chat';
const DEFAULT_MODEL = 'gpt-4o-mini';

function readInput() {
  return JSON.parse(readFileSync(0, 'utf8'));
}

function textInput(request) {
  const value = request?.input?.text;
  return typeof value === 'string' && value.trim() ? value.trim() : '请生成一篇内容草稿。';
}

function optionalTextInput(request) {
  const value = request?.input?.text;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function compiledImagePromptInput(request) {
  const value = request?.input?.compiledImagePrompt;
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function systemPromptInput(request) {
  const value = request?.input?.systemPrompt;
  return typeof value === 'string' && value.trim()
    ? value.trim()
    : '你是中文内容主编。直接输出可发布的 Markdown 草稿，不要解释生成过程。';
}

function responseKind(request) {
  const value = request?.input?.responseKind || request?.runtimeOptions?.metadata?.responseKind;
  return value === 'json' ? 'json' : 'markdown';
}

function capabilityId(request) {
  const value = request?.runtimeOptions?.capabilityId;
  return typeof value === 'string' && value.trim() ? value.trim() : 'content.draft.generate';
}

function schemaInstruction(request) {
  const schema = request?.input?.schema;
  return schema && typeof schema === 'object'
    ? `\n\n必须只返回符合 JSON Schema 的 JSON，不要解释，不要 Markdown，不要代码围栏。\nJSON Schema:\n${JSON.stringify(schema)}`
    : '';
}

function runtimeConfig() {
  const protocol = process.env.CONTENT_STUDIO_TEXT_PROTOCOL || process.env.LLM_PROTOCOL || DEFAULT_PROTOCOL;
  const model = process.env.CONTENT_STUDIO_TEXT_MODEL || process.env.LLM_MODEL || DEFAULT_MODEL;
  const apiKey =
    process.env.CONTENT_STUDIO_TEXT_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    '';
  return {
    protocol,
    model,
    apiKey,
    baseUrl: process.env.CONTENT_STUDIO_TEXT_BASE_URL || process.env.LLM_BASE_URL || '',
    maxTokens: Number(process.env.CONTENT_STUDIO_TEXT_MAX_TOKENS || process.env.LLM_MAX_TOKENS || 1800),
  };
}

function resolveOpenAIEndpoint(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1/chat/completions';
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function resolveAnthropicEndpoint(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.anthropic.com/v1/messages';
  if (trimmed.endsWith('/messages')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

function resolveGeminiEndpoint(baseUrl, model) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith(':generateContent')) return trimmed;
  const root = trimmed || 'https://generativelanguage.googleapis.com/v1beta';
  const base = /\/v\d(?:beta)?$/i.test(root) ? root : `${root}/v1beta`;
  return `${base}/models/${encodeURIComponent(model)}:generateContent`;
}

function collectText(value) {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return '';
  if (Array.isArray(value)) return value.map(collectText).filter(Boolean).join('\n');
  const record = value;
  if (typeof record.text === 'string') return record.text;
  if (typeof record.content === 'string') return record.content;
  return Object.values(record).map(collectText).filter(Boolean).join('\n');
}

function markdownFromText(rawText, prompt) {
  const text = rawText.trim();
  if (!text) return `# 内容草稿\n\n${prompt}`;
  return /^\s*#/m.test(text) ? text : `# 内容草稿\n\n${text}`;
}

function normalizeJsonText(rawText, prompt) {
  const text = rawText.trim();
  if (text) return text;
  return JSON.stringify({ ok: true, prompt });
}

function artifactEvent(content, prompt, config, kind = 'markdown') {
  const isJson = kind === 'json';
  return {
    type: 'artifact.snapshot',
    payload: {
      artifactId: isJson ? 'content-studio-text-json' : 'content-studio-draft',
      title: isJson ? 'Content Studio Text JSON' : 'Content Studio Draft',
      kind,
      path: isJson
        ? '.content-studio/app-server/content-studio-text.json'
        : '.content-studio/app-server/content-studio-draft.md',
      content,
      prompt,
      model: config.model,
      protocol: config.protocol,
    },
  };
}

function failedEvent(message, config) {
  return {
    type: 'turn.failed',
    payload: {
      message,
      protocol: config?.protocol,
      model: config?.model,
    },
  };
}

function completedEvent(content, config, kind = 'markdown') {
  return {
    type: 'turn.completed',
    payload: {
      summary: kind === 'json'
        ? '文字 JSON 已生成'
        : content.split('\n').find((line) => line.trim())?.replace(/^#+\s*/, '') || '内容草稿已生成',
      protocol: config.protocol,
      model: config.model,
    },
  };
}

function mediaRequest(request) {
  if (request?.input?.request && typeof request.input.request === 'object') return request.input.request;
  if (request?.request && typeof request.request === 'object') return request.request;
  return request && typeof request === 'object' ? request : {};
}

function workspaceAssetDir(workspacePath) {
  return join(workspacePath || process.cwd(), '.content-studio', 'assets');
}

function nowSlug() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function sanitizeProviderError(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***');
}

function jsonArtifactEvent(payload, title = 'Content Studio Media Result') {
  return {
    type: 'artifact.snapshot',
    payload: {
      artifactId: `content-studio-media-${randomUUID().slice(0, 8)}`,
      title,
      kind: 'json',
      content: JSON.stringify(payload),
      ...payload,
    },
  };
}

function mediaMessageEvent(payload) {
  return {
    type: 'message.delta',
    payload: {
      text: payload.message,
      status: payload.status,
      assetRefs: payload.assetRefs ?? [],
      billing: payload.billing,
      capabilityId: payload.capabilityId,
      model: payload.model,
    },
  };
}

function mediaCompletedEvent(payload) {
  return {
    type: 'turn.completed',
    payload: {
      summary: payload.message,
      status: payload.status,
      assetRefs: payload.assetRefs ?? [],
      billing: payload.billing,
      capabilityId: payload.capabilityId,
      model: payload.model,
    },
  };
}

function mediaEvents(payload, title) {
  return [mediaMessageEvent(payload), jsonArtifactEvent(payload, title), mediaCompletedEvent(payload)];
}

function resolveResponsesEndpoint(baseUrl) {
  const trimmed = (baseUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1/responses';
  if (trimmed.endsWith('/responses')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/responses`;
  return `${trimmed}/v1/responses`;
}

function collectStringFields(payload, fieldNames) {
  const values = [];
  const keys = new Set(fieldNames);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (keys.has(key) && typeof child === 'string' && child.trim()) values.push(child.trim());
      else visit(child);
    }
  };
  visit(payload);
  return Array.from(new Set(values));
}

function collectNumberFields(payload, fieldNames) {
  const values = [];
  const keys = new Set(fieldNames);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (keys.has(key)) {
        const parsed = typeof child === 'number' ? child : typeof child === 'string' ? Number(child) : Number.NaN;
        if (Number.isFinite(parsed) && parsed >= 0) values.push(parsed);
      } else {
        visit(child);
      }
    }
  };
  visit(payload);
  return values;
}

function collectImagesFromResponses(payload) {
  const images = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value.type === 'image_generation_call' && typeof value.result === 'string') images.push(value.result);
    Object.values(value).forEach(visit);
  };
  visit(payload);
  return images;
}

function collectDataUriImages(payload) {
  const images = [];
  const visit = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      const pattern = /data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+/gi;
      for (const match of value.matchAll(pattern)) images.push(match[0]);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') Object.values(value).forEach(visit);
  };
  visit(payload);
  return Array.from(new Set(images));
}

function collectGeminiInlineImages(payload) {
  const images = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const inlineData = value.inlineData || value.inline_data;
    const data = inlineData && typeof inlineData === 'object' ? inlineData.data : undefined;
    if (typeof data === 'string' && data.trim()) {
      images.push(`data:${inlineData.mimeType || inlineData.mime_type || 'image/png'};base64,${data}`);
    }
    Object.values(value).forEach(visit);
  };
  visit(payload);
  return images;
}

function imageExtension(image) {
  const mime = /^data:image\/([^;]+);base64,/i.exec(String(image).trim())?.[1]?.toLowerCase();
  if (mime === 'jpeg' || mime === 'jpg') return '.jpg';
  if (mime === 'webp') return '.webp';
  return '.png';
}

function videoExtension(contentType, url) {
  if (contentType?.includes('quicktime')) return '.mov';
  if (contentType?.includes('webm')) return '.webm';
  const match = /\.(mp4|mov|webm|m4v)(?:[?#]|$)/i.exec(url);
  return match ? `.${match[1].toLowerCase()}` : '.mp4';
}

async function writeBase64Assets({ workspacePath, folder, prefix, values, extension }) {
  const outputDir = join(workspaceAssetDir(workspacePath), folder);
  await mkdir(outputDir, { recursive: true });
  const operationId = randomUUID().slice(0, 8);
  const paths = [];
  for (const [index, value] of values.entries()) {
    const raw = String(value);
    const payload = raw.includes(',') ? raw.slice(raw.indexOf(',') + 1) : raw;
    const filePath = join(outputDir, `${nowSlug()}-${prefix}-${operationId}-${index + 1}${extension(raw)}`);
    await writeFile(filePath, Buffer.from(payload, 'base64'));
    paths.push(filePath);
  }
  return paths;
}

function roundCost(value) {
  return Math.round(value * 100) / 100;
}

function normalizedVideoDurationSeconds(value) {
  const duration = Number(value);
  return Number.isFinite(duration) && duration >= 5
    ? Math.min(300, Math.round(duration))
    : 18;
}

function videoCostEstimate(request, providerResponse) {
  const durationSeconds = normalizedVideoDurationSeconds(request?.params?.durationSeconds);
  const providerCost = collectNumberFields(providerResponse, ['cost', 'total_cost', 'totalCost', 'estimated_cost', 'estimatedCost', 'amount'])[0];
  if (providerCost !== undefined) {
    const currency = collectStringFields(providerResponse, ['currency'])[0]?.toUpperCase() || 'CNY';
    return {
      currency,
      durationSeconds,
      unit: 'second',
      unitPrice: roundCost(providerCost / durationSeconds),
      estimatedCost: roundCost(providerCost),
      source: 'provider-response',
    };
  }
  const envUnitPrice = Number(process.env.CONTENT_STUDIO_VIDEO_CNY_PER_SECOND);
  const unitPrice = Number.isFinite(envUnitPrice) && envUnitPrice > 0 ? envUnitPrice : 2;
  return {
    currency: 'CNY',
    durationSeconds,
    unit: 'second',
    unitPrice: roundCost(unitPrice),
    estimatedCost: roundCost(unitPrice * durationSeconds),
    source: Number.isFinite(envUnitPrice) && envUnitPrice > 0 ? 'env' : 'default-internal-api',
  };
}

async function readJsonOrText(response) {
  const text = await response.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function handleImageTurn(request) {
  const businessRequest = mediaRequest(request);
  const input = request?.input || {};
  const protocol = process.env.CONTENT_STUDIO_IMAGE_PROTOCOL || input.protocol || 'openai-responses';
  const model = process.env.CONTENT_STUDIO_IMAGE_MODEL || input.model || businessRequest?.params?.imageModel || 'image-model';
  const outerModel = process.env.CONTENT_STUDIO_IMAGE_OUTER_MODEL || input.outerModel || model;
  const endpoint = process.env.CONTENT_STUDIO_IMAGE_BASE_URL || input.endpoint || '';
  const apiKey = process.env.CONTENT_STUDIO_IMAGE_API_KEY || process.env.IMAGE_API_KEY || process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
  const capability = capabilityId(request);

  if (!apiKey) {
    return {
      status: 'blocked',
      message: '图片生成服务未配置：请在设置中配置真实图片端点和图片 API Key。未生成占位素材。',
      assetRefs: [],
      error: 'IMAGE_PROVIDER_NOT_CONFIGURED',
      model,
      protocol,
      capabilityId: capability,
    };
  }

  const prompt = compiledImagePromptInput(request) || optionalTextInput(request) || businessRequest.prompt || '根据业务输入生成图片素材。';
  let payload;
  if (protocol === 'gemini-generate-content') {
    const response = await fetch(resolveGeminiEndpoint(endpoint, model), {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['TEXT', 'IMAGE'] },
      }),
    });
    payload = await readJsonOrText(response);
    if (!response.ok) throw new Error(`Gemini 图片生成服务返回 ${response.status}：${sanitizeProviderError(JSON.stringify(payload)).slice(0, 1000)}`);
    const images = collectGeminiInlineImages(payload);
    const assetRefs = await writeBase64Assets({ workspacePath: businessRequest.workspacePath, folder: 'images', prefix: 'image-app-server', values: images, extension: imageExtension });
    return {
      status: assetRefs.length ? 'succeeded' : 'failed',
      message: assetRefs.length ? `已通过 Lime App Server 生成 ${assetRefs.length} 个图片素材。` : '图片生成服务未返回可用图片。',
      assetRefs,
      model,
      protocol,
      capabilityId: capability,
      providerResponse: payload,
    };
  }

  if (protocol === 'openai-chat-data-uri') {
    const response = await fetch(resolveOpenAIEndpoint(endpoint), {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], stream: false }),
    });
    payload = await readJsonOrText(response);
    if (!response.ok) throw new Error(`图片 Chat Completions 生成服务返回 ${response.status}：${sanitizeProviderError(JSON.stringify(payload)).slice(0, 1000)}`);
    const images = collectDataUriImages(payload);
    const assetRefs = await writeBase64Assets({ workspacePath: businessRequest.workspacePath, folder: 'images', prefix: 'image-app-server', values: images, extension: imageExtension });
    return {
      status: assetRefs.length ? 'succeeded' : 'failed',
      message: assetRefs.length ? `已通过 Lime App Server 生成 ${assetRefs.length} 个图片素材。` : '图片生成服务未返回可用图片。',
      assetRefs,
      model,
      protocol,
      capabilityId: capability,
      providerResponse: payload,
    };
  }

  const response = await fetch(resolveResponsesEndpoint(endpoint), {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: outerModel,
      input: prompt,
      tools: [{ type: 'image_generation', model }],
      stream: false,
    }),
  });
  payload = await readJsonOrText(response);
  if (!response.ok) throw new Error(`图片 Responses 生成服务返回 ${response.status}：${sanitizeProviderError(JSON.stringify(payload)).slice(0, 1000)}`);
  const images = collectImagesFromResponses(payload);
  const assetRefs = await writeBase64Assets({ workspacePath: businessRequest.workspacePath, folder: 'images', prefix: 'image-app-server', values: images, extension: imageExtension });
  return {
    status: assetRefs.length ? 'succeeded' : 'failed',
    message: assetRefs.length ? `已通过 Lime App Server 生成 ${assetRefs.length} 个图片素材。` : '图片生成服务未返回可用图片。',
    assetRefs,
    model,
    protocol,
    capabilityId: capability,
    providerResponse: payload,
  };
}

async function downloadVideoAsset(workspacePath, url, index) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`视频素材下载失败 ${response.status}：${url}`);
  const outputDir = join(workspaceAssetDir(workspacePath), 'videos');
  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, `${nowSlug()}-video-app-server-${randomUUID().slice(0, 8)}-${index + 1}${videoExtension(response.headers.get('content-type'), url)}`);
  await writeFile(filePath, Buffer.from(await response.arrayBuffer()));
  return filePath;
}

async function writeVideoJobArtifact(request, model, providerResponse) {
  const outputDir = join(workspaceAssetDir(request.workspacePath), 'videos');
  await mkdir(outputDir, { recursive: true });
  const filePath = join(outputDir, `${nowSlug()}-video-provider-job-${randomUUID().slice(0, 8)}.json`);
  await writeFile(filePath, `${JSON.stringify({ model, request, providerResponse, createdAt: new Date().toISOString() }, null, 2)}\n`, 'utf-8');
  return filePath;
}

async function writeVideoQueueArtifacts(request, model, costEstimate) {
  const outputDir = join(workspaceAssetDir(request.workspacePath), 'videos');
  await mkdir(outputDir, { recursive: true });
  const baseName = `${nowSlug()}-video-queue-${randomUUID().slice(0, 8)}`;
  const jsonPath = join(outputDir, `${baseName}.json`);
  const markdownPath = join(outputDir, `${baseName}.md`);
  const payload = {
    status: 'blocked',
    reason: 'VIDEO_PROVIDER_NOT_CONFIGURED',
    model,
    aspectRatio: request.params?.aspectRatio,
    durationSeconds: costEstimate.durationSeconds,
    costEstimate,
    prompt: request.prompt,
    script: request.script,
    imageAssetRefs: request.imageAssetRefs ?? [],
    videoAssetRefs: request.videoAssetRefs ?? [],
    audioAssetRefs: request.audioAssetRefs ?? [],
    selectedSkillSlugs: request.selectedSkillSlugs ?? [],
    citations: request.citations ?? [],
    createdAt: new Date().toISOString(),
  };
  await writeFile(jsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
  await writeFile(markdownPath, [
    '# 视频生成队列',
    '',
    '> 真实视频生成服务尚未配置，本文件只保存可追溯的视频生成请求，不代表视频已生成。',
    '',
    `- 模型：${model}`,
    `- 比例：${request.params?.aspectRatio ?? ''}`,
    `- 时长：${costEstimate.durationSeconds}s`,
    '',
    '## 视频提示词',
    '',
    request.prompt || '未填写视频提示词。',
    '',
    '## 脚本',
    '',
    request.script || '未填写脚本。',
    '',
  ].join('\n'), 'utf-8');
  return [jsonPath, markdownPath];
}

async function handleVideoTurn(request) {
  const businessRequest = mediaRequest(request);
  const input = request?.input || {};
  const provider = process.env.CONTENT_STUDIO_VIDEO_PROVIDER || input.provider || 'disabled';
  const model = process.env.CONTENT_STUDIO_VIDEO_MODEL || input.model || businessRequest?.params?.videoModel || 'video-model';
  const endpoint = process.env.CONTENT_STUDIO_VIDEO_ENDPOINT || input.endpoint || '';
  const apiKey = process.env.CONTENT_STUDIO_VIDEO_API_KEY || process.env.VIDEO_API_KEY || '';
  const capability = capabilityId(request);
  const billing = videoCostEstimate(businessRequest);
  const prompt = optionalTextInput(request) || businessRequest.prompt || '';

  if (provider !== 'generic-http' || !apiKey || !endpoint) {
    const assetRefs = await writeVideoQueueArtifacts(businessRequest, model, billing);
    return {
      status: 'blocked',
      message: '视频生成服务未配置：已保存可追溯队列文件，未伪造视频生成成功。',
      assetRefs,
      billing,
      error: 'VIDEO_PROVIDER_NOT_CONFIGURED',
      model,
      provider,
      capabilityId: capability,
    };
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt,
      script: businessRequest.script,
      aspect_ratio: businessRequest.params?.aspectRatio,
      duration_seconds: businessRequest.params?.durationSeconds,
      image_asset_refs: businessRequest.imageAssetRefs ?? [],
      video_asset_refs: businessRequest.videoAssetRefs ?? [],
      audio_asset_refs: businessRequest.audioAssetRefs ?? [],
      prompt_pack_id: businessRequest.promptPackId,
      scene_card_ids: businessRequest.sceneCardIds,
      selected_skill_slugs: businessRequest.selectedSkillSlugs ?? [],
      citations: businessRequest.citations ?? [],
    }),
  });
  const providerResponse = await readJsonOrText(response);
  if (!response.ok) throw new Error(`视频 provider 返回 ${response.status}：${sanitizeProviderError(JSON.stringify(providerResponse)).slice(0, 1000)}`);
  const assetRefs = [];
  const base64Videos = collectStringFields(providerResponse, ['b64_json', 'base64', 'video_base64', 'videoBase64']);
  for (const [index, encoded] of base64Videos.entries()) {
    assetRefs.push(...await writeBase64Assets({ workspacePath: businessRequest.workspacePath, folder: 'videos', prefix: 'video-app-server', values: [encoded], extension: () => '.mp4' }));
  }
  const urls = collectStringFields(providerResponse, ['url', 'video_url', 'videoUrl', 'download_url', 'downloadUrl']);
  for (const [index, url] of urls.entries()) {
    if (/^https?:\/\//i.test(url)) assetRefs.push(await downloadVideoAsset(businessRequest.workspacePath, url, index));
  }
  const providerBilling = videoCostEstimate(businessRequest, providerResponse);
  if (assetRefs.length > 0) {
    return {
      status: 'succeeded',
      message: `已通过 Lime App Server 生成 ${assetRefs.length} 个视频素材。`,
      assetRefs,
      billing: providerBilling,
      model,
      provider,
      capabilityId: capability,
      providerResponse,
    };
  }
  const jobArtifact = await writeVideoJobArtifact(businessRequest, model, providerResponse);
  return {
    status: 'queued',
    message: '已提交真实视频生成服务；未直接返回视频文件，已保存任务响应。',
    assetRefs: [jobArtifact],
    billing: providerBilling,
    model,
    provider,
    capabilityId: capability,
    providerResponse,
  };
}

async function generateWithOpenAI(prompt, request, config) {
  const kind = responseKind(request);
  const response = await fetch(resolveOpenAIEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: `${systemPromptInput(request)}${kind === 'json' ? schemaInstruction(request) : ''}` },
        { role: 'user', content: prompt },
      ],
      temperature: kind === 'json' ? 0 : 0.4,
      max_tokens: config.maxTokens,
      ...(kind === 'json' ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
  return collectText(payload?.choices?.[0]?.message?.content);
}

async function generateWithAnthropic(prompt, request, config) {
  const kind = responseKind(request);
  const response = await fetch(resolveAnthropicEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'x-api-key': config.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: config.maxTokens,
      system: `${systemPromptInput(request)}${kind === 'json' ? schemaInstruction(request) : ''}`,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Anthropic HTTP ${response.status}`);
  return collectText(payload?.content);
}

async function generateWithGemini(prompt, request, config) {
  const kind = responseKind(request);
  const response = await fetch(resolveGeminiEndpoint(config.baseUrl, config.model), {
    method: 'POST',
    headers: {
      'x-goog-api-key': config.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: `${systemPromptInput(request)}${kind === 'json' ? schemaInstruction(request) : ''}` }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: config.maxTokens,
        ...(kind === 'json' ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  return collectText(payload?.candidates?.[0]?.content?.parts);
}

async function generateContent(prompt, request, config) {
  const kind = responseKind(request);
  if (process.env.CONTENT_STUDIO_APP_SERVER_BACKEND_ECHO === '1') {
    return kind === 'json'
      ? normalizeJsonText(prompt, prompt)
      : `# App Server 内容草稿\n\n${prompt}`;
  }
  if (!config.apiKey) {
    throw new Error('文字模型未配置：请设置 CONTENT_STUDIO_TEXT_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY。');
  }
  if (config.protocol === 'anthropic-messages') {
    const rawText = await generateWithAnthropic(prompt, request, config);
    return kind === 'json' ? normalizeJsonText(rawText, prompt) : markdownFromText(rawText, prompt);
  }
  if (config.protocol === 'gemini-generate-content') {
    const rawText = await generateWithGemini(prompt, request, config);
    return kind === 'json' ? normalizeJsonText(rawText, prompt) : markdownFromText(rawText, prompt);
  }
  if (config.protocol === 'openai-chat') {
    const rawText = await generateWithOpenAI(prompt, request, config);
    return kind === 'json' ? normalizeJsonText(rawText, prompt) : markdownFromText(rawText, prompt);
  }
  throw new Error(`不支持的 App Server backend 文本协议：${config.protocol}`);
}

async function handle(input) {
  const config = runtimeConfig();
  if (input.kind === 'turnCancel') {
    return { events: [{ type: 'turn.canceled', payload: { ok: true } }] };
  }
  if (input.kind !== 'turnStart') return { events: [] };

  try {
    const capability = capabilityId(input.request);
    if (capability === 'content.image.generate') {
      const payload = await handleImageTurn(input.request);
      return { events: mediaEvents(payload, 'Content Studio Image Result') };
    }
    if (capability === 'content.video.generate') {
      const payload = await handleVideoTurn(input.request);
      return { events: mediaEvents(payload, 'Content Studio Video Result') };
    }

    const prompt = textInput(input.request);
    const kind = responseKind(input.request);
    const content = await generateContent(prompt, input.request, config);
    return {
      events: [
        {
          type: 'message.delta',
          payload: {
            text: content.slice(0, 800),
            protocol: config.protocol,
            model: config.model,
            capabilityId: capabilityId(input.request),
            responseKind: kind,
          },
        },
        artifactEvent(content, prompt, config, kind),
        completedEvent(content, config, kind),
      ],
    };
  } catch (error) {
    return {
      events: [failedEvent(error instanceof Error ? error.message : String(error), config)],
    };
  }
}

handle(readInput())
  .then((response) => {
    const failure = response.events?.find((event) => event?.type === 'turn.failed');
    console.log(JSON.stringify(response));
    if (failure) {
      console.error(failure.payload?.message || 'App Server backend turn failed');
      process.exitCode = 2;
    }
  })
  .catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({
      events: [failedEvent(message, runtimeConfig())],
    }));
    console.error(message);
    process.exitCode = 2;
  });
