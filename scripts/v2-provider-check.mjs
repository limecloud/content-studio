import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULTS = {
  textProtocol: 'openai-chat',
  textEndpoint: 'https://api.anthropic.com',
  openaiTextEndpoint: 'https://api.openai.com/v1',
  geminiTextEndpoint: 'https://generativelanguage.googleapis.com/v1beta',
  imageProtocol: 'openai-responses',
  imageEndpoint: 'https://api.openai.com/v1',
};

const TEXT_PROTOCOLS = new Set(['anthropic-messages', 'openai-chat', 'gemini-generate-content']);
const IMAGE_PROTOCOLS = new Set(['openai-responses', 'openai-chat-data-uri', 'gemini-generate-content']);

function textRequiredEnv(protocol) {
  if (protocol === 'openai-chat') return ['CONTENT_STUDIO_TEXT_API_KEY or OPENAI_API_KEY'];
  if (protocol === 'gemini-generate-content') return ['CONTENT_STUDIO_TEXT_API_KEY or GEMINI_API_KEY or GOOGLE_API_KEY'];
  return ['CONTENT_STUDIO_TEXT_API_KEY or ANTHROPIC_API_KEY'];
}

function imageRequiredEnv(protocol) {
  if (protocol === 'gemini-generate-content') {
    return ['CONTENT_STUDIO_IMAGE_API_KEY or IMAGE_API_KEY or GEMINI_API_KEY or GOOGLE_API_KEY'];
  }
  return ['CONTENT_STUDIO_IMAGE_API_KEY or IMAGE_API_KEY or OPENAI_API_KEY'];
}

function configuredFlags(values) {
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [key, Boolean(value)]),
  );
}

function envValue(env, ...keys) {
  for (const key of keys) {
    const value = env[key]?.trim();
    if (value) return value;
  }
  return '';
}

function boolEnv(env, key) {
  return env[key] === '1' || env[key]?.toLowerCase() === 'true';
}

function cleanBaseUrl(value, fallback = '') {
  return (value || fallback).trim().replace(/\/+$/, '');
}

function sanitizeError(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]+/g, 'sk-***')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer ***')
    .slice(0, 1200);
}

function textProtocol(env) {
  const value = envValue(env, 'CONTENT_STUDIO_TEXT_PROTOCOL');
  return TEXT_PROTOCOLS.has(value) ? value : DEFAULTS.textProtocol;
}

function imageProtocol(env) {
  const value = envValue(env, 'CONTENT_STUDIO_IMAGE_PROTOCOL');
  return IMAGE_PROTOCOLS.has(value) ? value : DEFAULTS.imageProtocol;
}

function textKey(env, protocol) {
  return envValue(
    env,
    'CONTENT_STUDIO_TEXT_API_KEY',
    protocol === 'openai-chat' ? 'OPENAI_API_KEY' : '',
    protocol === 'gemini-generate-content' ? 'GEMINI_API_KEY' : '',
    protocol === 'gemini-generate-content' ? 'GOOGLE_API_KEY' : '',
    protocol === 'anthropic-messages' ? 'ANTHROPIC_API_KEY' : '',
  );
}

function imageKey(env, protocol) {
  return envValue(
    env,
    'CONTENT_STUDIO_IMAGE_API_KEY',
    'IMAGE_API_KEY',
    protocol === 'gemini-generate-content' ? 'GEMINI_API_KEY' : '',
    protocol === 'gemini-generate-content' ? 'GOOGLE_API_KEY' : '',
    'OPENAI_API_KEY',
  );
}

function providerCheck(name, status, details = {}) {
  return {
    name,
    status,
    ...details,
  };
}

function defaultTextEndpoint(protocol) {
  if (protocol === 'openai-chat') return DEFAULTS.openaiTextEndpoint;
  if (protocol === 'gemini-generate-content') return DEFAULTS.geminiTextEndpoint;
  return DEFAULTS.textEndpoint;
}

function providerRecovery(check) {
  const reason = check.reason || (check.status === 'failed' ? 'PROVIDER_CHECK_FAILED' : '');
  if (reason === 'TEXT_PROVIDER_KEY_MISSING') {
    return {
      requiredEnv: textRequiredEnv(check.protocol),
      nextAction: '配置文字模型 Key 后重跑 provider 检查；文字生成只走显式 HTTP 协议。',
    };
  }
  if (reason === 'TEXT_PROVIDER_MODEL_MISSING') {
    return {
      requiredEnv: ['CONTENT_STUDIO_TEXT_MODEL'],
      nextAction: '配置文字模型 ID 后重跑；Content Studio 不再内置默认文字模型。',
    };
  }
  if (reason === 'VISION_ENDPOINT_MISSING') {
    return {
      requiredEnv: ['CONTENT_STUDIO_VISION_ENDPOINT or CONTENT_STUDIO_IMAGE_UNDERSTANDING_ENDPOINT'],
      nextAction: '配置视觉理解 endpoint 后重跑；对标图反推必须由真实视觉服务返回结构化结果。',
    };
  }
  if (reason === 'VISION_MODEL_MISSING') {
    return {
      requiredEnv: ['CONTENT_STUDIO_VISION_MODEL'],
      nextAction: '配置视觉理解模型 ID 后重跑；视觉拆解不再回落内置模型名。',
    };
  }
  if (reason === 'IMAGE_PROVIDER_KEY_MISSING') {
    return {
      requiredEnv: imageRequiredEnv(check.protocol),
      nextAction: '配置图片生成 Key 后重跑；图片生成必须走真实 provider，不生成占位图。',
    };
  }
  if (reason === 'IMAGE_MODEL_MISSING') {
    return {
      requiredEnv: ['CONTENT_STUDIO_IMAGE_MODEL'],
      nextAction: '配置图片生成模型 ID 后重跑；图片生成不再内置默认模型。',
    };
  }
  if (reason === 'IMAGE_OUTER_MODEL_MISSING') {
    return {
      requiredEnv: ['CONTENT_STUDIO_IMAGE_OUTER_MODEL or CONTENT_STUDIO_TEXT_MODEL'],
      nextAction: 'OpenAI Responses 图片检查需要显式外层模型 ID；请配置后重跑。',
    };
  }
  if (reason === 'VIDEO_ENDPOINT_MISSING') {
    return {
      requiredEnv: ['CONTENT_STUDIO_VIDEO_ENDPOINT'],
      nextAction: '配置视频 Generic HTTP endpoint 后重跑；未配置时只能保留 blocked 队列。',
    };
  }
  if (reason === 'VIDEO_PROVIDER_KEY_MISSING') {
    return {
      requiredEnv: ['CONTENT_STUDIO_VIDEO_API_KEY or VIDEO_API_KEY'],
      nextAction: '配置视频 provider Key 后重跑；真实视频联调还需要显式开启媒体检查。',
    };
  }
  if (reason === 'VIDEO_MODEL_MISSING') {
    return {
      requiredEnv: ['CONTENT_STUDIO_VIDEO_MODEL'],
      nextAction: '配置视频生成模型 ID 后重跑；视频检查不再内置默认模型。',
    };
  }
  if (reason === 'NETWORK_CHECK_NOT_ENABLED') {
    return {
      requiredEnv: ['CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1'],
      nextAction: '显式开启网络联调后重跑；dry-run 只证明配置形状，不作为发布门槛。',
    };
  }
  if (reason === 'MEDIA_CHECK_NOT_ENABLED') {
    return {
      requiredEnv: ['CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1', 'CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1'],
      nextAction: '显式开启媒体联调后重跑；图片和视频成本/产物风险需要单独确认。',
    };
  }
  if (reason === 'IMAGE_MEDIA_CHECK_USE_APP_WORKFLOW') {
    return {
      requiredEnv: [],
      nextAction: '图片 provider 仍缺少直接联调结果；请用真实 App 图片生成工作流补充 provider 响应、生成资产和审核证据后再作为发布证据。',
    };
  }
  if (check.status === 'failed') {
    return {
      requiredEnv: [],
      nextAction: '检查 provider endpoint、模型名、协议和错误信息后重跑；报告中的 error 已脱敏。',
    };
  }
  return { requiredEnv: [], nextAction: '' };
}

function enrichProviderCheck(check) {
  const recovery = providerRecovery(check);
  return {
    ...check,
    severity: check.status === 'succeeded' ? 'ok'
      : check.status === 'ready' || check.status === 'skipped' ? 'attention'
        : 'blocking',
    ...recovery,
  };
}

async function postJson(url, headers, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${sanitizeError(text)}`);
    }
    return text.trim() ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeout);
  }
}

function resolveResponsesEndpoint(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1/responses';
  if (trimmed.endsWith('/responses')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/responses`;
  return `${trimmed}/v1/responses`;
}

function resolveOpenAIChatEndpoint(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return 'https://api.openai.com/v1/chat/completions';
  if (trimmed.endsWith('/chat/completions')) return trimmed;
  if (trimmed.endsWith('/v1')) return `${trimmed}/chat/completions`;
  return `${trimmed}/v1/chat/completions`;
}

function resolveGeminiGenerateContentEndpoint(baseUrl, model) {
  const trimmed = baseUrl.trim().replace(/\/+$/, '');
  if (trimmed.endsWith(':generateContent')) return trimmed;
  const root = trimmed || 'https://generativelanguage.googleapis.com/v1beta';
  const base = /\/v\d(?:beta)?$/i.test(root) ? root : `${root}/v1beta`;
  return `${base}/models/${encodeURIComponent(model)}:generateContent`;
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

function collectImagesFromResponses(payload) {
  const images = [];
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = value;
    if (record.type === 'image_generation_call' && typeof record.result === 'string' && isImagePayload(record.result)) {
      images.push(record.result);
    }
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return images;
}

function stripDataUriPrefix(value) {
  return String(value || '').replace(/^data:[^;]+;base64,/i, '').trim();
}

function isBase64Payload(value, minLength = 32) {
  const payload = stripDataUriPrefix(value);
  return payload.length >= minLength &&
    payload.length % 4 === 0 &&
    /^[A-Za-z0-9+/]+={0,2}$/.test(payload);
}

function isImageMimeType(mimeType) {
  return /^image\/(?:png|jpe?g|webp)$/i.test(String(mimeType || '').trim());
}

function imageMagicMimeType(value) {
  const payload = stripDataUriPrefix(value);
  if (!isBase64Payload(payload, 32)) return '';
  let bytes;
  try {
    bytes = Buffer.from(payload.slice(0, 128), 'base64');
  } catch {
    return '';
  }
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 12 && bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

function hasImageMagicBytes(value, expectedMimeType = '') {
  const actualMimeType = imageMagicMimeType(value);
  if (!actualMimeType) return false;
  const normalizedExpected = String(expectedMimeType || '').trim().toLowerCase();
  if (!normalizedExpected) return true;
  if (normalizedExpected === 'image/jpg') return actualMimeType === 'image/jpeg';
  return actualMimeType === normalizedExpected;
}

function isImageDataUri(value) {
  const match = String(value || '').trim().match(/^data:(image\/(?:png|jpe?g|webp));base64,([A-Za-z0-9+/=]+)$/i);
  return Boolean(match && hasImageMagicBytes(match[2], match[1]));
}

function isImagePayload(value) {
  const text = String(value || '').trim();
  return isImageDataUri(text) || hasImageMagicBytes(text);
}

function isVideoMimeType(value) {
  return /^video\/(?:mp4|mpeg|quicktime|webm|x-m4v)$/i.test(String(value || '').trim());
}

function hasVideoMagicBytes(value) {
  const payload = stripDataUriPrefix(value);
  if (!isBase64Payload(payload, 64)) return false;
  const sample = payload.slice(0, 512);
  let bytes;
  try {
    bytes = Buffer.from(sample, 'base64');
  } catch {
    return false;
  }
  if (bytes.length < 8) return false;
  const boxType = bytes.length >= 8 ? bytes.toString('ascii', 4, 8) : '';
  return bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3])) ||
    bytes.toString('ascii', 0, 4) === 'OggS' ||
    boxType === 'ftyp' ||
    (bytes.length > 376 && bytes[0] === 0x47 && bytes[188] === 0x47 && bytes[376] === 0x47);
}

function isVideoDataUri(value) {
  const match = String(value || '').trim().match(/^data:([^;]+);base64,([A-Za-z0-9+/=]+)$/i);
  return Boolean(match && isVideoMimeType(match[1]) && hasVideoMagicBytes(match[2]));
}

function isVideoPayload(value) {
  const text = String(value || '').trim();
  return isVideoDataUri(text) || hasVideoMagicBytes(text);
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function hasVideoUrlHint(value) {
  try {
    const url = new URL(value);
    const pathAndQuery = `${url.pathname}${url.search}`;
    if (/\.(?:mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|m3u8)(?:$|[?#&=])/i.test(pathAndQuery)) return true;
    for (const [key, entryValue] of url.searchParams.entries()) {
      const normalizedKey = key.toLowerCase();
      const normalizedValue = entryValue.toLowerCase();
      if ((normalizedKey.includes('mime') || normalizedKey.includes('content-type')) && normalizedValue.startsWith('video/')) return true;
      if ((normalizedKey === 'format' || normalizedKey.endsWith('_format')) && /^(mp4|m4v|mov|webm|m3u8)$/i.test(normalizedValue)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function recordHasVideoMimeMetadata(record) {
  if (!record || typeof record !== 'object') return false;
  return Object.entries(record).some(([key, value]) => {
    const normalizedKey = key.toLowerCase();
    const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
    if ((normalizedKey === 'mimetype' || normalizedKey === 'mime_type' || normalizedKey === 'contenttype' || normalizedKey === 'content_type') && isVideoMimeType(text)) return true;
    return false;
  });
}

function collectVideoAssetUrls(payload) {
  const urls = [];
  const rejectedUrls = [];
  const urlKeys = new Set(['url', 'video_url', 'videoUrl', 'download_url', 'downloadUrl']);
  const visit = (value) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const hasVideoMimeMetadata = recordHasVideoMimeMetadata(value);
    for (const [key, entryValue] of Object.entries(value)) {
      if (typeof entryValue === 'string' && urlKeys.has(key) && isHttpUrl(entryValue)) {
        if (hasVideoUrlHint(entryValue) || hasVideoMimeMetadata) urls.push(entryValue.trim());
        else rejectedUrls.push(entryValue.trim());
      }
    }
    Object.values(value).forEach(visit);
  };
  visit(payload);
  return {
    urls: Array.from(new Set(urls)),
    rejectedUrls: Array.from(new Set(rejectedUrls)),
  };
}

function collectDataUriImages(payload) {
  const images = [];
  const visit = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      const pattern = /data:image\/(?:png|jpe?g|webp);base64,[A-Za-z0-9+/=]+/gi;
      for (const match of value.matchAll(pattern)) {
        if (isImageDataUri(match[0])) images.push(match[0]);
      }
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
    const inlineDataValue = value.inlineData ?? value.inline_data;
    const inlineData = inlineDataValue && typeof inlineDataValue === 'object' ? inlineDataValue : undefined;
    const data = inlineData?.data;
    if (typeof data === 'string') {
      const mimeType = String(inlineData?.mimeType ?? inlineData?.mime_type ?? 'image/png');
      if (isImageMimeType(mimeType) && hasImageMagicBytes(data, mimeType)) images.push(`data:${mimeType};base64,${data}`);
    }
    Object.values(value).forEach(visit);
  };
  visit(payload);
  return images;
}

function collectStringFields(payload, names) {
  const fields = new Set(names);
  const values = [];
  const visit = (value, key = '') => {
    if (value === null || value === undefined) return;
    if (typeof value === 'string') {
      if (!key || fields.has(key)) values.push(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => visit(item, key));
      return;
    }
    if (typeof value === 'object') {
      for (const [entryKey, entryValue] of Object.entries(value)) visit(entryValue, entryKey);
    }
  };
  visit(payload);
  return values.map((value) => value.trim()).filter(Boolean);
}

function hasOkJsonProbe(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  const candidates = [text];
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) candidates.push(jsonMatch[0]);
  return candidates.some((candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      return parsed && typeof parsed === 'object' && parsed.ok === true;
    } catch {
      return /"ok"\s*:\s*true/i.test(candidate);
    }
  });
}

function hasTextProviderOutput(protocol, payload) {
  if (!payload || typeof payload !== 'object') return false;
  if (protocol === 'openai-chat') {
    return collectStringFields(payload, ['content', 'output_text', 'text'])
      .some(hasOkJsonProbe);
  }
  if (protocol === 'gemini-generate-content') {
    return collectStringFields(payload, ['text']).some(hasOkJsonProbe);
  }
  return collectStringFields(payload, ['text']).some(hasOkJsonProbe);
}

function videoProviderEvidence(payload) {
  const { urls, rejectedUrls } = collectVideoAssetUrls(payload);
  const base64Videos = collectStringFields(payload, ['b64_json', 'base64', 'video_base64', 'videoBase64'])
    .filter(isVideoPayload);
  const rejectedBase64Videos = collectStringFields(payload, ['b64_json', 'base64', 'video_base64', 'videoBase64'])
    .filter((value) => isBase64Payload(value, 64) && !isVideoPayload(value));
  const jobIds = collectStringFields(payload, ['id', 'job_id', 'jobId', 'task_id', 'taskId', 'request_id', 'requestId', 'operation_id', 'operationId'])
    .filter((value) => value.length >= 4);
  const statuses = collectStringFields(payload, ['status', 'state'])
    .filter((value) => /queued|submitted|processing|running|pending|succeeded|completed|success/i.test(value));
  return {
    hasVideoAsset: urls.length > 0 || base64Videos.length > 0,
    hasJobEvidence: jobIds.length > 0 && statuses.length > 0,
    urlCount: urls.length,
    base64Count: base64Videos.length,
    rejectedUrlCount: rejectedUrls.length,
    rejectedBase64Count: rejectedBase64Videos.length,
    jobIdCount: jobIds.length,
    statusCount: statuses.length,
  };
}

function visionProviderEvidence(payload) {
  const fields = {
    prompt: collectStringFields(payload, ['prompt']).length > 0,
    composition: collectStringFields(payload, ['composition']).length > 0,
    lighting: collectStringFields(payload, ['lighting']).length > 0,
    negativePrompt: collectStringFields(payload, ['negativePrompt', 'negative_prompt']).length > 0,
    risks: collectStringFields(payload, ['risks']).length > 0,
    qualityChecklist: collectStringFields(payload, ['qualityChecklist', 'quality_checklist']).length > 0,
  };
  const fieldCount = Object.values(fields).filter(Boolean).length;
  const hasVisualDescription = fields.composition || fields.lighting;
  const hasRiskBoundary = fields.risks || fields.qualityChecklist;
  return {
    ...fields,
    fieldCount,
    hasVisualDescription,
    hasRiskBoundary,
    hasStructuredAnalysis: fields.prompt &&
      hasVisualDescription &&
      fields.negativePrompt &&
      hasRiskBoundary &&
      fieldCount >= 4,
  };
}

function parseSseChunk(chunk) {
  return chunk
    .split('\n\n')
    .map((eventText) => eventText
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .join('\n'))
    .filter((data) => data && data !== '[DONE]')
    .map((data) => {
      try {
        return JSON.parse(data);
      } catch {
        return null;
      }
    })
    .filter((value) => value !== null);
}

async function readResponsesImages(response) {
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.body || contentType.includes('application/json')) {
    return collectImagesFromResponses(await response.json());
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const images = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const boundary = buffer.lastIndexOf('\n\n');
    if (boundary < 0) continue;
    const complete = buffer.slice(0, boundary);
    buffer = buffer.slice(boundary + 2);
    for (const event of parseSseChunk(complete)) images.push(...collectImagesFromResponses(event));
  }
  if (buffer.trim()) {
    for (const event of parseSseChunk(buffer)) images.push(...collectImagesFromResponses(event));
  }
  return images;
}

async function fetchWithTimeout(url, headers, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function postImageProbe({ protocol, endpoint, key, model, outerModel }) {
  const prompt = 'Provider validation image. Create one tiny simple product-background test image. No text in image.';
  if (protocol === 'openai-chat-data-uri') {
    const response = await fetchWithTimeout(resolveOpenAIChatEndpoint(endpoint), {
      authorization: `Bearer ${key}`,
    }, {
      model,
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    });
    const payload = await readJsonOrText(response);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${sanitizeError(JSON.stringify(payload))}`);
    return collectDataUriImages(payload);
  }
  if (protocol === 'gemini-generate-content') {
    const response = await fetchWithTimeout(resolveGeminiGenerateContentEndpoint(endpoint, model), {
      'x-goog-api-key': key,
    }, {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseModalities: ['TEXT', 'IMAGE'],
      },
    });
    const payload = await readJsonOrText(response);
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${sanitizeError(JSON.stringify(payload))}`);
    return collectGeminiInlineImages(payload);
  }

  const response = await fetchWithTimeout(resolveResponsesEndpoint(endpoint), {
    authorization: `Bearer ${key}`,
  }, {
    model: outerModel,
    input: prompt,
    tools: [{ type: 'image_generation', model }],
    stream: true,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status}: ${sanitizeError(text)}`);
  }
  return readResponsesImages(response);
}

async function checkTextProvider(env, allowNetwork) {
  const protocol = textProtocol(env);
  const model = envValue(env, 'CONTENT_STUDIO_TEXT_MODEL');
  const endpoint = cleanBaseUrl(envValue(env, 'CONTENT_STUDIO_TEXT_BASE_URL'), defaultTextEndpoint(protocol));
  const key = textKey(env, protocol);
  if (!key) {
    return providerCheck('text', 'blocked', {
      protocol,
      model,
      reason: 'TEXT_PROVIDER_KEY_MISSING',
      configured: configuredFlags({ apiKey: key }),
    });
  }
  if (!model) {
    return providerCheck('text', 'blocked', {
      protocol,
      model,
      reason: 'TEXT_PROVIDER_MODEL_MISSING',
      configured: configuredFlags({ apiKey: key, model }),
    });
  }
  if (!allowNetwork) {
    return providerCheck('text', 'ready', {
      protocol,
      model,
      reason: 'NETWORK_CHECK_NOT_ENABLED',
      configured: configuredFlags({ apiKey: key }),
    });
  }

  try {
    if (protocol === 'openai-chat') {
      const payload = await postJson(resolveOpenAIChatEndpoint(endpoint), {
        authorization: `Bearer ${key}`,
      }, {
        model,
        messages: [{ role: 'user', content: 'Return JSON {"ok":true} only.' }],
        response_format: { type: 'json_object' },
        max_tokens: 32,
      });
      if (!hasTextProviderOutput(protocol, payload)) throw new Error('TEXT_PROVIDER_NO_MODEL_OUTPUT');
    } else if (protocol === 'gemini-generate-content') {
      const payload = await postJson(`${resolveGeminiGenerateContentEndpoint(endpoint, model)}?key=${encodeURIComponent(key)}`, {}, {
        contents: [{ role: 'user', parts: [{ text: 'Return JSON {"ok":true} only.' }] }],
      });
      if (!hasTextProviderOutput(protocol, payload)) throw new Error('TEXT_PROVIDER_NO_MODEL_OUTPUT');
    } else {
      const payload = await postJson(`${endpoint || 'https://api.anthropic.com'}/v1/messages`, {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      }, {
        model,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Return JSON {"ok":true} only.' }],
      });
      if (!hasTextProviderOutput(protocol, payload)) throw new Error('TEXT_PROVIDER_NO_MODEL_OUTPUT');
    }
    return providerCheck('text', 'succeeded', { protocol, model, configured: configuredFlags({ apiKey: key }) });
  } catch (error) {
    return providerCheck('text', 'failed', {
      protocol,
      model,
      configured: configuredFlags({ apiKey: key }),
      error: sanitizeError(error instanceof Error ? error.message : String(error)),
    });
  }
}

async function checkVisionProvider(env, allowNetwork) {
  const endpoint = envValue(env, 'CONTENT_STUDIO_VISION_ENDPOINT', 'CONTENT_STUDIO_IMAGE_UNDERSTANDING_ENDPOINT');
  const key = envValue(env, 'CONTENT_STUDIO_VISION_API_KEY', 'CONTENT_STUDIO_IMAGE_UNDERSTANDING_API_KEY', 'CONTENT_STUDIO_IMAGE_API_KEY', 'IMAGE_API_KEY');
  const model = envValue(env, 'CONTENT_STUDIO_VISION_MODEL');
  if (!endpoint) {
    return providerCheck('vision', 'blocked', {
      model,
      reason: 'VISION_ENDPOINT_MISSING',
      configured: configuredFlags({ endpoint, apiKey: key }),
    });
  }
  if (!model) {
    return providerCheck('vision', 'blocked', {
      model,
      reason: 'VISION_MODEL_MISSING',
      configured: configuredFlags({ endpoint, apiKey: key, model }),
    });
  }
  if (!allowNetwork) {
    return providerCheck('vision', 'ready', {
      model,
      reason: 'NETWORK_CHECK_NOT_ENABLED',
      hasApiKey: Boolean(key),
      configured: configuredFlags({ endpoint, apiKey: key }),
    });
  }
  try {
    const payload = await postJson(endpoint, key ? { authorization: `Bearer ${key}` } : {}, {
      operation: 'reference-reverse',
      model,
      user_intent: 'v2 provider validation',
      reference_sources: [{ id: 'provider-check-reference', title: 'provider check reference', kind: 'image', purpose: 'reference' }],
      product_sources: [],
      requirements: ['Return prompt, negativePrompt, risks and qualityChecklist.'],
    });
    const evidence = visionProviderEvidence(payload);
    if (!evidence.hasStructuredAnalysis) {
      return providerCheck('vision', 'failed', {
        model,
        hasApiKey: Boolean(key),
        configured: configuredFlags({ endpoint, apiKey: key }),
        responseEvidence: evidence,
        error: 'VISION_PROVIDER_NO_STRUCTURED_ANALYSIS',
      });
    }
    return providerCheck('vision', 'succeeded', {
      model,
      hasApiKey: Boolean(key),
      configured: configuredFlags({ endpoint, apiKey: key }),
      responseEvidence: evidence,
    });
  } catch (error) {
    return providerCheck('vision', 'failed', {
      model,
      hasApiKey: Boolean(key),
      configured: configuredFlags({ endpoint, apiKey: key }),
      error: sanitizeError(error instanceof Error ? error.message : String(error)),
    });
  }
}

async function checkImageProvider(env, allowNetwork, allowMedia) {
  const protocol = imageProtocol(env);
  const key = imageKey(env, protocol);
  const model = envValue(env, 'CONTENT_STUDIO_IMAGE_MODEL');
  const outerModel = envValue(env, 'CONTENT_STUDIO_IMAGE_OUTER_MODEL', 'CONTENT_STUDIO_TEXT_MODEL');
  const endpoint = cleanBaseUrl(envValue(env, 'CONTENT_STUDIO_IMAGE_BASE_URL'), DEFAULTS.imageEndpoint);
  if (!key) {
    return providerCheck('image', 'blocked', {
      protocol,
      model,
      outerModel,
      reason: 'IMAGE_PROVIDER_KEY_MISSING',
      configured: configuredFlags({ apiKey: key }),
    });
  }
  if (!model) {
    return providerCheck('image', 'blocked', {
      protocol,
      model,
      outerModel,
      reason: 'IMAGE_MODEL_MISSING',
      configured: configuredFlags({ apiKey: key, model }),
    });
  }
  if (protocol === 'openai-responses' && !outerModel) {
    return providerCheck('image', 'blocked', {
      protocol,
      model,
      outerModel,
      reason: 'IMAGE_OUTER_MODEL_MISSING',
      configured: configuredFlags({ apiKey: key, model, outerModel }),
    });
  }
  if (!allowNetwork || !allowMedia) {
    return providerCheck('image', 'ready', {
      protocol,
      model,
      outerModel,
      reason: !allowNetwork ? 'NETWORK_CHECK_NOT_ENABLED' : 'MEDIA_CHECK_NOT_ENABLED',
      configured: configuredFlags({ apiKey: key }),
    });
  }
  try {
    const images = await postImageProbe({ protocol, endpoint, key, model, outerModel });
    if (!images.length) throw new Error('IMAGE_PROVIDER_NO_IMAGE_RESULT');
    return providerCheck('image', 'succeeded', {
      protocol,
      model,
      outerModel,
      endpoint,
      imageCount: images.length,
      configured: configuredFlags({ apiKey: key }),
    });
  } catch (error) {
    return providerCheck('image', 'failed', {
      protocol,
      model,
      outerModel,
      endpoint,
      configured: configuredFlags({ apiKey: key }),
      error: sanitizeError(error instanceof Error ? error.message : String(error)),
    });
  }
}

async function checkVideoProvider(env, allowNetwork, allowMedia) {
  const endpoint = envValue(env, 'CONTENT_STUDIO_VIDEO_ENDPOINT');
  const key = envValue(env, 'CONTENT_STUDIO_VIDEO_API_KEY', 'VIDEO_API_KEY');
  const model = envValue(env, 'CONTENT_STUDIO_VIDEO_MODEL');
  if (!endpoint || !key) {
    return providerCheck('video', 'blocked', {
      model,
      reason: !endpoint ? 'VIDEO_ENDPOINT_MISSING' : 'VIDEO_PROVIDER_KEY_MISSING',
      configured: configuredFlags({ endpoint, apiKey: key }),
    });
  }
  if (!model) {
    return providerCheck('video', 'blocked', {
      model,
      reason: 'VIDEO_MODEL_MISSING',
      configured: configuredFlags({ endpoint, apiKey: key, model }),
    });
  }
  if (!allowNetwork || !allowMedia) {
    return providerCheck('video', 'ready', {
      model,
      reason: !allowNetwork ? 'NETWORK_CHECK_NOT_ENABLED' : 'MEDIA_CHECK_NOT_ENABLED',
      configured: configuredFlags({ endpoint, apiKey: key }),
    });
  }
  try {
    const payload = await postJson(endpoint, { authorization: `Bearer ${key}` }, {
      model,
      prompt: 'v2 provider validation. Return a queued job or a small test response.',
      script: 'provider validation',
      aspect_ratio: '9:16',
      duration_seconds: 1,
      image_asset_refs: [],
      video_asset_refs: [],
      prompt_pack_id: undefined,
      scene_card_ids: [],
      selected_skill_slugs: [],
      citations: [],
    });
    const evidence = videoProviderEvidence(payload);
    if (!evidence.hasVideoAsset && !evidence.hasJobEvidence) {
      return providerCheck('video', 'failed', {
        model,
        configured: configuredFlags({ endpoint, apiKey: key }),
        responseEvidence: evidence,
        error: 'VIDEO_PROVIDER_NO_JOB_OR_ASSET_RESULT',
      });
    }
    return providerCheck('video', 'succeeded', {
      model,
      configured: configuredFlags({ endpoint, apiKey: key }),
      responseEvidence: evidence,
    });
  } catch (error) {
    return providerCheck('video', 'failed', {
      model,
      configured: configuredFlags({ endpoint, apiKey: key }),
      error: sanitizeError(error instanceof Error ? error.message : String(error)),
    });
  }
}

export async function buildProviderCheckReport(env = process.env, options = {}) {
  const allowNetwork = options.allowNetwork ?? boolEnv(env, 'CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK');
  const allowMedia = options.allowMedia ?? boolEnv(env, 'CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA');
  const checks = [
    await checkTextProvider(env, allowNetwork),
    await checkVisionProvider(env, allowNetwork),
    await checkImageProvider(env, allowNetwork, allowMedia),
    await checkVideoProvider(env, allowNetwork, allowMedia),
  ].map(enrichProviderCheck);
  const summary = {
    total: checks.length,
    succeeded: checks.filter((item) => item.status === 'succeeded').length,
    ready: checks.filter((item) => item.status === 'ready').length,
    blocked: checks.filter((item) => item.status === 'blocked').length,
    skipped: checks.filter((item) => item.status === 'skipped').length,
    failed: checks.filter((item) => item.status === 'failed').length,
  };
  const strictGate = buildStrictGate({ networkAllowed: allowNetwork, mediaAllowed: allowMedia, summary, checks });
  return {
    schema: 'buguai.v2-provider-check.v1',
    checkedAt: new Date().toISOString(),
    networkAllowed: allowNetwork,
    mediaAllowed: allowMedia,
    strictGate,
    summary,
    checks,
  };
}

function buildStrictGate(report) {
  const failedChecks = report.checks.filter((item) => item.status === 'failed').map((item) => item.name);
  const blockedChecks = report.checks.filter((item) => item.status === 'blocked').map((item) => item.name);
  const skippedChecks = report.checks.filter((item) => item.status === 'skipped').map((item) => item.name);
  const reasons = [
    !report.networkAllowed ? 'NETWORK_CHECK_NOT_ENABLED' : '',
    !report.mediaAllowed ? 'MEDIA_CHECK_NOT_ENABLED' : '',
    failedChecks.length ? 'PROVIDER_CHECK_FAILED' : '',
    blockedChecks.length ? 'PROVIDER_CHECK_BLOCKED' : '',
    skippedChecks.length ? 'PROVIDER_CHECK_SKIPPED' : '',
  ].filter(Boolean);
  return {
    passed: reasons.length === 0,
    reasons,
    nextActions: strictNextActions(report, reasons),
    required: {
      networkAllowed: true,
      mediaAllowed: true,
      noFailedChecks: true,
      noBlockedChecks: true,
      noSkippedChecks: true,
    },
    failedChecks,
    blockedChecks,
    skippedChecks,
  };
}

function strictNextActions(report, reasons) {
  const actions = [];
  if (reasons.includes('NETWORK_CHECK_NOT_ENABLED')) {
    actions.push('设置 CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_NETWORK=1 后重跑 strict provider 检查。');
  }
  if (reasons.includes('MEDIA_CHECK_NOT_ENABLED')) {
    actions.push('设置 CONTENT_STUDIO_PROVIDER_CHECK_ALLOW_MEDIA=1 后重跑；媒体联调会触发图片/视频相关 provider 检查。');
  }
  for (const check of report.checks) {
    if ((check.status === 'blocked' || check.status === 'failed' || check.status === 'skipped') && check.nextAction) {
      actions.push(`${check.name}: ${check.nextAction}`);
    }
  }
  return Array.from(new Set(actions));
}

export function hasProviderStrictFailure(report) {
  return report.strictGate ? !report.strictGate.passed : report.summary.failed > 0 || report.summary.blocked > 0 || report.summary.skipped > 0;
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

export async function writeJsonReport(outputPath, report) {
  if (!outputPath) return;
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
}

const isMain = process.argv[1]?.endsWith('/v2-provider-check.mjs') || process.argv[1]?.endsWith('\\v2-provider-check.mjs');
if (isMain) {
  const strict = process.argv.includes('--strict');
  const outputPath = readArgValue('--output') || process.env.CONTENT_STUDIO_V2_PROVIDER_REPORT;
  const report = await buildProviderCheckReport(process.env);
  await writeJsonReport(outputPath, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(strict && hasProviderStrictFailure(report) ? 1 : 0);
}
