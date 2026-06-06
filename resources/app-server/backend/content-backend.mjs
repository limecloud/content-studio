#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const DEFAULT_PROTOCOL = 'openai-chat';
const DEFAULT_MODEL = 'gpt-4o-mini';

function readInput() {
  return JSON.parse(readFileSync(0, 'utf8'));
}

function textInput(request) {
  const value = request?.input?.text;
  return typeof value === 'string' && value.trim() ? value.trim() : '请生成一篇内容草稿。';
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

function artifactEvent(markdown, prompt, config) {
  return {
    type: 'artifact.snapshot',
    payload: {
      artifactId: 'content-studio-draft',
      title: 'Content Studio Draft',
      kind: 'markdown',
      path: '.content-studio/app-server/content-studio-draft.md',
      content: markdown,
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

function completedEvent(markdown, config) {
  return {
    type: 'turn.completed',
    payload: {
      summary: markdown.split('\n').find((line) => line.trim())?.replace(/^#+\s*/, '') || '内容草稿已生成',
      protocol: config.protocol,
      model: config.model,
    },
  };
}

async function generateWithOpenAI(prompt, config) {
  const response = await fetch(resolveOpenAIEndpoint(config.baseUrl), {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: '你是中文内容主编。直接输出可发布的 Markdown 草稿，不要解释生成过程。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.4,
      max_tokens: config.maxTokens,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `OpenAI HTTP ${response.status}`);
  return collectText(payload?.choices?.[0]?.message?.content);
}

async function generateWithAnthropic(prompt, config) {
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
      system: '你是中文内容主编。直接输出可发布的 Markdown 草稿，不要解释生成过程。',
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Anthropic HTTP ${response.status}`);
  return collectText(payload?.content);
}

async function generateWithGemini(prompt, config) {
  const response = await fetch(resolveGeminiEndpoint(config.baseUrl, config.model), {
    method: 'POST',
    headers: {
      'x-goog-api-key': config.apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: '你是中文内容主编。直接输出可发布的 Markdown 草稿，不要解释生成过程。' }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: config.maxTokens },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || `Gemini HTTP ${response.status}`);
  return collectText(payload?.candidates?.[0]?.content?.parts);
}

async function generateMarkdown(prompt, config) {
  if (process.env.CONTENT_STUDIO_APP_SERVER_BACKEND_ECHO === '1') {
    return `# App Server 内容草稿\n\n${prompt}`;
  }
  if (!config.apiKey) {
    throw new Error('文字模型未配置：请设置 CONTENT_STUDIO_TEXT_API_KEY / OPENAI_API_KEY / ANTHROPIC_API_KEY / GEMINI_API_KEY。');
  }
  if (config.protocol === 'anthropic-messages') return markdownFromText(await generateWithAnthropic(prompt, config), prompt);
  if (config.protocol === 'gemini-generate-content') return markdownFromText(await generateWithGemini(prompt, config), prompt);
  if (config.protocol === 'openai-chat') return markdownFromText(await generateWithOpenAI(prompt, config), prompt);
  throw new Error(`不支持的 App Server backend 文本协议：${config.protocol}`);
}

async function handle(input) {
  const config = runtimeConfig();
  if (input.kind === 'turnCancel') {
    return { events: [{ type: 'turn.canceled', payload: { ok: true } }] };
  }
  if (input.kind !== 'turnStart') return { events: [] };

  const prompt = textInput(input.request);
  try {
    const markdown = await generateMarkdown(prompt, config);
    return {
      events: [
        {
          type: 'message.delta',
          payload: {
            text: markdown.slice(0, 800),
            protocol: config.protocol,
            model: config.model,
          },
        },
        artifactEvent(markdown, prompt, config),
        completedEvent(markdown, config),
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
