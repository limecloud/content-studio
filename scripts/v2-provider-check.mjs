import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const DEFAULTS = {
  textProtocol: 'claude-sdk',
  textEndpoint: 'https://api.anthropic.com',
  textModel: 'claude-sonnet-4-5',
  imageProtocol: 'openai-responses',
  imageEndpoint: 'https://api.openai.com/v1',
  imageModel: 'gpt-image-2',
  imageOuterModel: 'gpt-5.5',
  videoModel: 'veo-3.1',
  visionModel: 'vision-provider',
};

const TEXT_PROTOCOLS = new Set(['claude-sdk', 'anthropic-messages', 'openai-chat', 'gemini-generate-content']);
const IMAGE_PROTOCOLS = new Set(['openai-responses', 'openai-chat-data-uri', 'gemini-generate-content']);

function textRequiredEnv(protocol) {
  if (protocol === 'openai-chat') return ['CONTENT_STUDIO_TEXT_API_KEY or OPENAI_API_KEY'];
  if (protocol === 'gemini-generate-content') return ['CONTENT_STUDIO_TEXT_API_KEY or GEMINI_API_KEY or GOOGLE_API_KEY'];
  if (protocol === 'claude-sdk') return ['CONTENT_STUDIO_TEXT_API_KEY or ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN'];
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
    'ANTHROPIC_API_KEY',
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

function providerRecovery(check) {
  const reason = check.reason || (check.status === 'failed' ? 'PROVIDER_CHECK_FAILED' : '');
  if (reason === 'TEXT_PROVIDER_KEY_MISSING') {
    return {
      requiredEnv: textRequiredEnv(check.protocol),
      nextAction: '配置文字模型 Key 后重跑 provider 检查；Claude SDK 可复用 Claude Code OAuth。',
    };
  }
  if (reason === 'VISION_ENDPOINT_MISSING') {
    return {
      requiredEnv: ['CONTENT_STUDIO_VISION_ENDPOINT or CONTENT_STUDIO_IMAGE_UNDERSTANDING_ENDPOINT'],
      nextAction: '配置视觉理解 endpoint 后重跑；对标图反推必须由真实视觉服务返回结构化结果。',
    };
  }
  if (reason === 'IMAGE_PROVIDER_KEY_MISSING') {
    return {
      requiredEnv: imageRequiredEnv(check.protocol),
      nextAction: '配置图片生成 Key 后重跑；图片生成必须走真实 provider，不生成占位图。',
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

async function checkTextProvider(env, allowNetwork) {
  const protocol = textProtocol(env);
  const model = envValue(env, 'CONTENT_STUDIO_TEXT_MODEL') || DEFAULTS.textModel;
  const endpoint = cleanBaseUrl(envValue(env, 'CONTENT_STUDIO_TEXT_BASE_URL'), DEFAULTS.textEndpoint);
  const key = textKey(env, protocol);
  const oauthToken = envValue(env, 'CLAUDE_CODE_OAUTH_TOKEN');
  if (!key && !(protocol === 'claude-sdk' && oauthToken)) {
    return providerCheck('text', 'blocked', {
      protocol,
      model,
      reason: 'TEXT_PROVIDER_KEY_MISSING',
      configured: configuredFlags({ apiKey: key, oauthToken }),
    });
  }
  if (!allowNetwork) {
    return providerCheck('text', 'ready', {
      protocol,
      model,
      reason: 'NETWORK_CHECK_NOT_ENABLED',
      configured: configuredFlags({ apiKey: key, oauthToken }),
    });
  }

  try {
    if (protocol === 'openai-chat') {
      await postJson(`${endpoint || 'https://api.openai.com/v1'}/chat/completions`, {
        authorization: `Bearer ${key}`,
      }, {
        model,
        messages: [{ role: 'user', content: 'Return JSON {"ok":true} only.' }],
        response_format: { type: 'json_object' },
        max_tokens: 32,
      });
    } else if (protocol === 'gemini-generate-content') {
      const root = endpoint || 'https://generativelanguage.googleapis.com/v1beta';
      const base = /\/v\d(?:beta)?$/i.test(root) ? root : `${root}/v1beta`;
      await postJson(`${base}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {}, {
        contents: [{ role: 'user', parts: [{ text: 'Return JSON {"ok":true} only.' }] }],
      });
    } else {
      await postJson(`${endpoint || 'https://api.anthropic.com'}/v1/messages`, {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      }, {
        model,
        max_tokens: 32,
        messages: [{ role: 'user', content: 'Return JSON {"ok":true} only.' }],
      });
    }
    return providerCheck('text', 'succeeded', { protocol, model, configured: configuredFlags({ apiKey: key, oauthToken }) });
  } catch (error) {
    return providerCheck('text', 'failed', {
      protocol,
      model,
      configured: configuredFlags({ apiKey: key, oauthToken }),
      error: sanitizeError(error instanceof Error ? error.message : String(error)),
    });
  }
}

async function checkVisionProvider(env, allowNetwork) {
  const endpoint = envValue(env, 'CONTENT_STUDIO_VISION_ENDPOINT', 'CONTENT_STUDIO_IMAGE_UNDERSTANDING_ENDPOINT');
  const key = envValue(env, 'CONTENT_STUDIO_VISION_API_KEY', 'CONTENT_STUDIO_IMAGE_UNDERSTANDING_API_KEY', 'CONTENT_STUDIO_IMAGE_API_KEY', 'IMAGE_API_KEY');
  const model = envValue(env, 'CONTENT_STUDIO_VISION_MODEL') || DEFAULTS.visionModel;
  if (!endpoint) {
    return providerCheck('vision', 'blocked', {
      model,
      reason: 'VISION_ENDPOINT_MISSING',
      configured: configuredFlags({ endpoint, apiKey: key }),
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
    await postJson(endpoint, key ? { authorization: `Bearer ${key}` } : {}, {
      operation: 'reference-reverse',
      model,
      user_intent: 'v2 provider validation',
      reference_sources: [{ id: 'provider-check-reference', title: 'provider check reference', kind: 'image', purpose: 'reference' }],
      product_sources: [],
      requirements: ['Return prompt, negativePrompt, risks and qualityChecklist.'],
    });
    return providerCheck('vision', 'succeeded', { model, hasApiKey: Boolean(key), configured: configuredFlags({ endpoint, apiKey: key }) });
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
  const model = envValue(env, 'CONTENT_STUDIO_IMAGE_MODEL') || DEFAULTS.imageModel;
  const endpoint = cleanBaseUrl(envValue(env, 'CONTENT_STUDIO_IMAGE_BASE_URL'), DEFAULTS.imageEndpoint);
  if (!key) {
    return providerCheck('image', 'blocked', {
      protocol,
      model,
      reason: 'IMAGE_PROVIDER_KEY_MISSING',
      configured: configuredFlags({ apiKey: key }),
    });
  }
  if (!allowNetwork || !allowMedia) {
    return providerCheck('image', 'ready', {
      protocol,
      model,
      reason: !allowNetwork ? 'NETWORK_CHECK_NOT_ENABLED' : 'MEDIA_CHECK_NOT_ENABLED',
      configured: configuredFlags({ apiKey: key }),
    });
  }
  return providerCheck('image', 'skipped', {
    protocol,
    model,
    endpoint,
    reason: 'IMAGE_MEDIA_CHECK_USE_APP_WORKFLOW',
    configured: configuredFlags({ apiKey: key }),
  });
}

async function checkVideoProvider(env, allowNetwork, allowMedia) {
  const endpoint = envValue(env, 'CONTENT_STUDIO_VIDEO_ENDPOINT');
  const key = envValue(env, 'CONTENT_STUDIO_VIDEO_API_KEY', 'VIDEO_API_KEY');
  const model = envValue(env, 'CONTENT_STUDIO_VIDEO_MODEL') || DEFAULTS.videoModel;
  if (!endpoint || !key) {
    return providerCheck('video', 'blocked', {
      model,
      reason: !endpoint ? 'VIDEO_ENDPOINT_MISSING' : 'VIDEO_PROVIDER_KEY_MISSING',
      configured: configuredFlags({ endpoint, apiKey: key }),
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
    await postJson(endpoint, { authorization: `Bearer ${key}` }, {
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
    return providerCheck('video', 'succeeded', { model, configured: configuredFlags({ endpoint, apiKey: key }) });
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
  const reasons = [
    !report.networkAllowed ? 'NETWORK_CHECK_NOT_ENABLED' : '',
    !report.mediaAllowed ? 'MEDIA_CHECK_NOT_ENABLED' : '',
    failedChecks.length ? 'PROVIDER_CHECK_FAILED' : '',
    blockedChecks.length ? 'PROVIDER_CHECK_BLOCKED' : '',
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
    },
    failedChecks,
    blockedChecks,
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
    if ((check.status === 'blocked' || check.status === 'failed') && check.nextAction) {
      actions.push(`${check.name}: ${check.nextAction}`);
    }
  }
  return Array.from(new Set(actions));
}

export function hasProviderStrictFailure(report) {
  return report.strictGate ? !report.strictGate.passed : report.summary.failed > 0 || report.summary.blocked > 0;
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
