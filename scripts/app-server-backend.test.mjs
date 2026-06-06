import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';

const backendPath = new URL('../resources/app-server/backend/content-backend.mjs', import.meta.url);

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
