import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const backendPath = new URL('../resources/app-server/backend/content-backend.mjs', import.meta.url);
const ONE_PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

async function runBackend(input, env = {}) {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [backendPath.pathname], {
      env: {
        ...process.env,
        CONTENT_STUDIO_TEXT_API_KEY: '',
        OPENAI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        GEMINI_API_KEY: '',
        GOOGLE_API_KEY: '',
        CONTENT_STUDIO_IMAGE_API_KEY: '',
        CONTENT_STUDIO_VIDEO_API_KEY: '',
        IMAGE_API_KEY: '',
        VIDEO_API_KEY: '',
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('backend test timed out'));
    }, 5000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.stdin.end(`${JSON.stringify(input)}\n`);
  });
}

async function withJsonServer(handler, run) {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', async () => {
      const record = {
        method: request.method,
        url: request.url,
        headers: request.headers,
        body: body ? JSON.parse(body) : undefined,
      };
      requests.push(record);
      try {
        const result = await handler(record);
        response.statusCode = result.status ?? 200;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify(result.body));
      } catch (error) {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ error: { message: error instanceof Error ? error.message : String(error) } }));
      }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    return await run(`http://127.0.0.1:${port}`, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('packaged App Server backend returns turn.failed when text model is unavailable', async () => {
  const result = await runBackend({
    kind: 'turnStart',
    request: { input: { text: '写一篇内容草稿' } },
  });

  assert.notEqual(result.code, 0);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.events[0].type, 'turn.failed');
  assert.match(payload.events[0].payload.message, /文字模型未配置/);
  assert.match(result.stderr, /文字模型未配置/);
});

test('packaged App Server backend echo mode emits draft artifact and completion', async () => {
  const result = await runBackend({
    kind: 'turnStart',
    request: { input: { text: '基于新品卖点写一篇公众号草稿' } },
  }, {
    CONTENT_STUDIO_APP_SERVER_BACKEND_ECHO: '1',
  });

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.ok(payload.events.some((event) => event.type === 'message.delta'));
  assert.ok(payload.events.some((event) =>
    event.type === 'artifact.snapshot' &&
    event.payload.title === 'Content Studio Draft' &&
    event.payload.content.includes('基于新品卖点写一篇公众号草稿')
  ));
  assert.ok(payload.events.some((event) => event.type === 'turn.completed'));
});

test('packaged App Server backend emits protocol cancel event', async () => {
  const result = await runBackend({
    kind: 'turnCancel',
    request: {
      session: { sessionId: 'sess_cancel' },
      turn: { turnId: 'turn_cancel' },
    },
  });

  assert.equal(result.code, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload.events.map((event) => event.type), ['turn.canceled']);
});

test('packaged App Server backend calls OpenAI chat protocol and maps draft artifact', async () => {
  await withJsonServer(async (request) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer openai-test-key');
    assert.equal(request.body.model, 'gpt-test');
    assert.equal(request.body.messages.at(-1).content, '生成 OpenAI 草稿');
    return {
      body: {
        choices: [
          { message: { content: '# OpenAI 草稿\n\n正文' } },
        ],
      },
    };
  }, async (baseUrl, requests) => {
    const result = await runBackend({
      kind: 'turnStart',
      request: { input: { text: '生成 OpenAI 草稿' } },
    }, {
      CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
      CONTENT_STUDIO_TEXT_MODEL: 'gpt-test',
      CONTENT_STUDIO_TEXT_API_KEY: 'openai-test-key',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests.length, 1);
    const payload = JSON.parse(result.stdout);
    assert.ok(payload.events.some((event) =>
      event.type === 'artifact.snapshot' &&
      event.payload.content.includes('OpenAI 草稿') &&
      event.payload.protocol === 'openai-chat'
    ));
    assert.ok(payload.events.some((event) => event.type === 'turn.completed'));
  });
});

test('packaged App Server backend calls OpenAI chat protocol for JSON capability', async () => {
  await withJsonServer(async (request) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1/chat/completions');
    assert.equal(request.headers.authorization, 'Bearer openai-json-key');
    assert.equal(request.body.model, 'gpt-json-test');
    assert.equal(request.body.response_format.type, 'json_object');
    assert.match(request.body.messages[0].content, /JSON Schema/);
    assert.equal(request.body.messages.at(-1).content, '{"task":"json_test"}');
    return {
      body: {
        choices: [
          { message: { content: '{"ok":true,"name":"App Server JSON"}' } },
        ],
      },
    };
  }, async (baseUrl, requests) => {
    const result = await runBackend({
      kind: 'turnStart',
      request: {
        input: {
          text: '{"task":"json_test"}',
          systemPrompt: '只输出 JSON。',
          responseKind: 'json',
          schema: {
            type: 'object',
            required: ['ok', 'name'],
            properties: { ok: { type: 'boolean' }, name: { type: 'string' } },
          },
        },
        runtimeOptions: { capabilityId: 'content.text.generate' },
      },
    }, {
      CONTENT_STUDIO_TEXT_PROTOCOL: 'openai-chat',
      CONTENT_STUDIO_TEXT_MODEL: 'gpt-json-test',
      CONTENT_STUDIO_TEXT_API_KEY: 'openai-json-key',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests.length, 1);
    const payload = JSON.parse(result.stdout);
    assert.ok(payload.events.some((event) =>
      event.type === 'message.delta' &&
      event.payload.responseKind === 'json' &&
      event.payload.capabilityId === 'content.text.generate'
    ));
    assert.ok(payload.events.some((event) =>
      event.type === 'artifact.snapshot' &&
      event.payload.kind === 'json' &&
      event.payload.title === 'Content Studio Text JSON' &&
      event.payload.content === '{"ok":true,"name":"App Server JSON"}' &&
      event.payload.model === 'gpt-json-test'
    ));
    assert.ok(payload.events.some((event) =>
      event.type === 'turn.completed' &&
      event.payload.summary === '文字 JSON 已生成'
    ));
  });
});

test('packaged App Server backend calls Anthropic messages protocol and maps draft artifact', async () => {
  await withJsonServer(async (request) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1/messages');
    assert.equal(request.headers['x-api-key'], 'anthropic-test-key');
    assert.equal(request.headers['anthropic-version'], '2023-06-01');
    assert.equal(request.body.model, 'claude-test');
    assert.equal(request.body.messages[0].content, '生成 Anthropic 草稿');
    return {
      body: {
        content: [
          { type: 'text', text: '# Anthropic 草稿\n\n正文' },
        ],
      },
    };
  }, async (baseUrl, requests) => {
    const result = await runBackend({
      kind: 'turnStart',
      request: { input: { text: '生成 Anthropic 草稿' } },
    }, {
      CONTENT_STUDIO_TEXT_PROTOCOL: 'anthropic-messages',
      CONTENT_STUDIO_TEXT_MODEL: 'claude-test',
      CONTENT_STUDIO_TEXT_API_KEY: 'anthropic-test-key',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests.length, 1);
    const payload = JSON.parse(result.stdout);
    assert.ok(payload.events.some((event) =>
      event.type === 'artifact.snapshot' &&
      event.payload.content.includes('Anthropic 草稿') &&
      event.payload.protocol === 'anthropic-messages'
    ));
    assert.ok(payload.events.some((event) => event.type === 'turn.completed'));
  });
});

test('packaged App Server backend calls Gemini generateContent protocol and maps draft artifact', async () => {
  await withJsonServer(async (request) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/v1beta/models/gemini-test%2Fmodel:generateContent');
    assert.equal(request.headers['x-goog-api-key'], 'gemini-test-key');
    assert.equal(request.body.contents[0].parts[0].text, '生成 Gemini 草稿');
    return {
      body: {
        candidates: [
          { content: { parts: [{ text: '# Gemini 草稿\n\n正文' }] } },
        ],
      },
    };
  }, async (baseUrl, requests) => {
    const result = await runBackend({
      kind: 'turnStart',
      request: { input: { text: '生成 Gemini 草稿' } },
    }, {
      CONTENT_STUDIO_TEXT_PROTOCOL: 'gemini-generate-content',
      CONTENT_STUDIO_TEXT_MODEL: 'gemini-test/model',
      CONTENT_STUDIO_TEXT_API_KEY: 'gemini-test-key',
      CONTENT_STUDIO_TEXT_BASE_URL: baseUrl,
    });

    assert.equal(result.code, 0, result.stderr);
    assert.equal(requests.length, 1);
    const payload = JSON.parse(result.stdout);
    assert.ok(payload.events.some((event) =>
      event.type === 'artifact.snapshot' &&
      event.payload.content.includes('Gemini 草稿') &&
      event.payload.protocol === 'gemini-generate-content'
    ));
    assert.ok(payload.events.some((event) => event.type === 'turn.completed'));
  });
});

test('packaged App Server backend calls image capability through OpenAI Responses protocol', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'content-studio-backend-image-'));
  try {
    await withJsonServer(async (request) => {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/v1/responses');
      assert.equal(request.headers.authorization, 'Bearer image-test-key');
      assert.equal(request.body.model, 'outer-image-test');
      assert.equal(request.body.tools[0].model, 'inner-image-test');
      assert.equal(request.body.input, '生成 App Server 图片');
      return {
        body: { output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] },
      };
    }, async (baseUrl, requests) => {
      const result = await runBackend({
        kind: 'turnStart',
        request: {
          input: {
            request: {
              workspacePath,
              prompt: '生成 App Server 图片',
              params: { imageModel: 'inner-image-test', count: 1 },
            },
          },
          runtimeOptions: { capabilityId: 'content.image.generate' },
        },
      }, {
        CONTENT_STUDIO_IMAGE_PROTOCOL: 'openai-responses',
        CONTENT_STUDIO_IMAGE_MODEL: 'inner-image-test',
        CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'outer-image-test',
        CONTENT_STUDIO_IMAGE_API_KEY: 'image-test-key',
        CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      });

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(result.stdout);
      const artifact = payload.events.find((event) => event.type === 'artifact.snapshot');
      assert.equal(artifact.payload.status, 'succeeded');
      assert.equal(artifact.payload.capabilityId, 'content.image.generate');
      assert.equal(artifact.payload.assetRefs.length, 1);
      assert.equal(existsSync(artifact.payload.assetRefs[0]), true);
      assert.ok(payload.events.some((event) => event.type === 'turn.completed' && event.payload.status === 'succeeded'));
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('packaged App Server backend keeps image business prompt when input is flattened by sidecar backend', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'content-studio-backend-image-flat-'));
  try {
    await withJsonServer(async (request) => {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/v1/responses');
      assert.equal(request.body.input.includes('产品一致性规则'), true);
      assert.equal(request.body.input.includes('负面约束'), true);
      assert.equal(request.body.input.includes('SOP 自定义规则：包装颜色、文字和袋型必须一致'), true);
      assert.equal(request.body.input.includes('SOP 自定义负面：不要添加无来源 Logo'), true);
      return {
        body: { output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] },
      };
    }, async (baseUrl, requests) => {
      const result = await runBackend({
        kind: 'turnStart',
        request: {
          input: {
            text: [
              '早餐桌自然光，手拿便携条包，产品主体清晰。',
              '产品一致性规则：SOP 自定义规则：包装颜色、文字和袋型必须一致。',
              '负面约束：SOP 自定义负面：不要添加无来源 Logo。',
            ].join('\n'),
          },
          workspacePath,
          params: { imageModel: 'inner-image-test', count: 1 },
          runtimeOptions: { capabilityId: 'content.image.generate' },
        },
      }, {
        CONTENT_STUDIO_IMAGE_PROTOCOL: 'openai-responses',
        CONTENT_STUDIO_IMAGE_MODEL: 'inner-image-test',
        CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'outer-image-test',
        CONTENT_STUDIO_IMAGE_API_KEY: 'image-test-key',
        CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      });

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(result.stdout);
      const artifact = payload.events.find((event) => event.type === 'artifact.snapshot');
      assert.equal(artifact.payload.status, 'succeeded');
      assert.equal(artifact.payload.assetRefs.length, 1);
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('packaged App Server backend keeps image business prompt from turn text fallback', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'content-studio-backend-image-text-'));
  try {
    await withJsonServer(async (request) => {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/v1/responses');
      assert.equal(request.body.input.includes('产品一致性规则'), true);
      assert.equal(request.body.input.includes('负面约束'), true);
      assert.equal(request.body.input.includes('SOP 自定义规则：包装颜色、文字和袋型必须一致'), true);
      assert.equal(request.body.input.includes('SOP 自定义负面：不要添加无来源 Logo'), true);
      return {
        body: { output: [{ type: 'image_generation_call', result: ONE_PIXEL_PNG }] },
      };
    }, async (baseUrl, requests) => {
      const result = await runBackend({
        kind: 'turnStart',
        request: {
          input: {
            text: [
            '早餐桌自然光，手拿便携条包，产品主体清晰。',
            '产品一致性规则：SOP 自定义规则：包装颜色、文字和袋型必须一致。',
            '负面约束：SOP 自定义负面：不要添加无来源 Logo。',
            ].join('\n'),
            request: {
              workspacePath,
              params: { imageModel: 'inner-image-test', count: 1 },
            },
          },
          runtimeOptions: { capabilityId: 'content.image.generate' },
        },
      }, {
        CONTENT_STUDIO_IMAGE_PROTOCOL: 'openai-responses',
        CONTENT_STUDIO_IMAGE_MODEL: 'inner-image-test',
        CONTENT_STUDIO_IMAGE_OUTER_MODEL: 'outer-image-test',
        CONTENT_STUDIO_IMAGE_API_KEY: 'image-test-key',
        CONTENT_STUDIO_IMAGE_BASE_URL: baseUrl,
      });

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(result.stdout);
      const artifact = payload.events.find((event) => event.type === 'artifact.snapshot');
      assert.equal(artifact.payload.status, 'succeeded');
      assert.equal(artifact.payload.assetRefs.length, 1);
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('packaged App Server backend calls generic video capability and stores returned asset', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'content-studio-backend-video-'));
  try {
    await withJsonServer(async (request) => {
      assert.equal(request.method, 'POST');
      assert.equal(request.url, '/video');
      assert.equal(request.headers.authorization, 'Bearer video-test-key');
      assert.equal(request.body.model, 'video-test-model');
      assert.equal(request.body.duration_seconds, 7);
      return {
        body: {
          video_base64: Buffer.from('content-studio-video').toString('base64'),
          cost: 14,
          currency: 'CNY',
        },
      };
    }, async (baseUrl, requests) => {
      const result = await runBackend({
        kind: 'turnStart',
        request: {
          input: {
            request: {
              workspacePath,
              prompt: '生成 App Server 视频',
              script: '视频脚本',
              imageAssetRefs: [],
              videoAssetRefs: [],
              citations: [],
              selectedSkillSlugs: ['video-script-writer'],
              params: { videoModel: 'video-test-model', aspectRatio: '4:5', durationSeconds: 7 },
            },
          },
          runtimeOptions: { capabilityId: 'content.video.generate' },
        },
      }, {
        CONTENT_STUDIO_VIDEO_PROVIDER: 'generic-http',
        CONTENT_STUDIO_VIDEO_MODEL: 'video-test-model',
        CONTENT_STUDIO_VIDEO_ENDPOINT: `${baseUrl}/video`,
        CONTENT_STUDIO_VIDEO_API_KEY: 'video-test-key',
      });

      assert.equal(result.code, 0, result.stderr);
      assert.equal(requests.length, 1);
      const payload = JSON.parse(result.stdout);
      const artifact = payload.events.find((event) => event.type === 'artifact.snapshot');
      assert.equal(artifact.payload.status, 'succeeded');
      assert.equal(artifact.payload.capabilityId, 'content.video.generate');
      assert.equal(artifact.payload.billing.estimatedCost, 14);
      assert.equal(artifact.payload.assetRefs.length, 1);
      assert.equal(existsSync(artifact.payload.assetRefs[0]), true);
    });
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});

test('packaged App Server backend stores blocked video queue when provider is unavailable', async () => {
  const workspacePath = await mkdtemp(join(tmpdir(), 'content-studio-backend-video-blocked-'));
  try {
    const result = await runBackend({
      kind: 'turnStart',
      request: {
        input: {
          request: {
            workspacePath,
            prompt: '保存 blocked 队列',
            imageAssetRefs: [],
            videoAssetRefs: [],
            citations: [],
            selectedSkillSlugs: [],
            params: { videoModel: 'video-blocked-model', aspectRatio: '16:9', durationSeconds: 5 },
          },
        },
        runtimeOptions: { capabilityId: 'content.video.generate' },
      },
    }, {
      CONTENT_STUDIO_VIDEO_PROVIDER: 'disabled',
      CONTENT_STUDIO_VIDEO_MODEL: 'video-blocked-model',
    });

    assert.equal(result.code, 0, result.stderr);
    const payload = JSON.parse(result.stdout);
    const artifact = payload.events.find((event) => event.type === 'artifact.snapshot');
    assert.equal(artifact.payload.status, 'blocked');
    assert.equal(artifact.payload.error, 'VIDEO_PROVIDER_NOT_CONFIGURED');
    assert.equal(artifact.payload.assetRefs.length, 2);
    assert.equal(artifact.payload.assetRefs.every((assetRef) => existsSync(assetRef)), true);
    assert.ok(payload.events.some((event) => event.type === 'turn.completed' && event.payload.status === 'blocked'));
  } finally {
    await rm(workspacePath, { recursive: true, force: true });
  }
});
