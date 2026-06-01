// Ontology v2 服务端 Mock API
// 纯 Node（零依赖），暴露 architecture.md / data-intake-workbench-prd.md 定义的端点。
// 启动：node server-mock/server.js  （默认端口 8799，可用 PORT 覆盖）
// 用途：与客户端原型 / 服务端控制台联调，验证接口契约。

const http = require('http');
const { URL } = require('url');
const db = require('./data.cjs');

const PORT = process.env.PORT || 8799;

// ---- 端点契约：method + path 模式 -> handler ----
// path 支持 :param 占位
const routes = [
  // 健康
  ['GET', '/health', () => ({ status: 'ok', service: 'ontology-v2-mock', ts: Date.now() })],

  // 多租户与安全
  ['GET', '/tenants', () => db.tenants],
  ['GET', '/tenants/:id', (p) => db.tenants.find(t => t.id === p.id) || err(404, 'tenant not found')],
  ['GET', '/vault', (p, q) => q.tenant ? db.vault.filter(v => v.tenant === q.tenant) : db.vault],

  // 数据接入工作台
  ['GET', '/intake/sources', () => db.sources],
  ['GET', '/intake/sources/:id', (p) => db.sources.find(s => s.id === p.id) || err(404, 'source not found')],
  ['GET', '/intake/sources/:id/mapping', (p) => {
    const s = db.sources.find(x => x.id === p.id); if (!s) return err(404, 'source not found');
    return { sourceId: s.id, adapter: s.adapter, fields: s.mapping.map(m => ({ source: m[0], ontology: m[1], status: m[2] })) };
  }],
  ['GET', '/intake/adapters', () => db.adapters],
  ['POST', '/intake/sources/:id/upgrade', (p, q, body) => {
    const s = db.sources.find(x => x.id === p.id); if (!s) return err(404, 'source not found');
    if (!s.upgrade) return err(409, 'already at max level');
    return { ok: true, sourceId: s.id, from: s.level, to: s.upgrade.next, blocker: s.upgrade.blocker, ticket: 'upgrade-' + s.id + '-' + Date.now() };
  }],

  // Agent 双 Runtime 调度
  ['GET', '/agent/runtimes', () => db.runtimes],
  ['GET', '/agent/jobs', (p, q) => q.runtime ? db.agentJobs.filter(j => j.runtime === q.runtime) : db.agentJobs],
  ['POST', '/agent/jobs', (p, q, body) => {
    // 模拟调度：用户在场默认本地；量大或显式 headless 转云端
    const headless = body && body.headless;
    const heavy = body && body.estimatedItems && body.estimatedItems > 100;
    const runtime = (headless || heavy) ? 'cloud' : 'local';
    const job = { id: 'job-' + Math.random().toString(16).slice(2, 6), type: (body && body.type) || 'unknown',
      tenant: (body && body.tenant) || 'tenant-A', runtime, status: runtime === 'cloud' ? 'queued' : 'running',
      handoffFrom: (!headless && heavy) ? 'local' : undefined, detail: heavy ? '批量转交服务端' : '本地低延迟' };
    return { ok: true, job, note: 'token via server proxy; weights never on client' };
  }],
  ['POST', '/agent/token', (p, q, body) => ({ ok: true, token: 'tmp-' + Math.random().toString(16).slice(2, 10), ttlSec: 900, note: '短期 token，不下发长期密钥' })],

  // 规则门禁与合规
  ['GET', '/gates', () => db.gates],
  ['GET', '/review/queue', (p, q) => q.tenant ? db.reviewQueue.filter(r => r.tenant === q.tenant) : db.reviewQueue],
  ['POST', '/gates/check', (p, q, body) => {
    // 服务端权威裁决：本地 agent 放行前必须回这里复核
    const claim = (body && body.claim) || '';
    const forbidden = ['三秒降温', '全网最低价', '彻底根治'];
    const hit = forbidden.find(f => claim.indexOf(f) >= 0);
    if (hit) return { decision: 'blocked', gate: 'efficacy', reason: '强功效/极限词无证据：' + hit, recovery: 'MissingEvidenceTask' };
    return { decision: 'passed', authority: 'server', note: '裁决以服务端为权威' };
  }],

  // 批次 / StageRun 状态
  ['GET', '/batches/:id', (p) => p.id === db.batch.id ? db.batch : err(404, 'batch not found')],
  ['GET', '/batches/:id/impact', (p) => {
    if (p.id !== db.batch.id) return err(404, 'batch not found');
    return { batchId: db.batch.id, intakeCoverage: db.batch.intakeCoverage,
      blockedTiers: ['premium', 'standard'], note: '素材覆盖 54% + 投放未接入，压低制造档位；补齐后回填升档',
      tierDistribution: db.batch.tierDistribution };
  }]
];

function err(code, msg) { const e = new Error(msg); e.statusCode = code; return e; }

function matchRoute(method, pathname) {
  for (const [m, pat, handler] of routes) {
    if (m !== method) continue;
    const patParts = pat.split('/').filter(Boolean);
    const pathParts = pathname.split('/').filter(Boolean);
    if (patParts.length !== pathParts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < patParts.length; i++) {
      if (patParts[i].startsWith(':')) params[patParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
      else if (patParts[i] !== pathParts[i]) { ok = false; break; }
    }
    if (ok) return { handler, params };
  }
  return null;
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const u = new URL(req.url, 'http://localhost');
  const query = Object.fromEntries(u.searchParams);
  const route = matchRoute(req.method, u.pathname);

  if (!route) {
    res.writeHead(404);
    return res.end(JSON.stringify({ error: 'not found', hint: 'GET /health 查看服务存活；端点见 README' }));
  }

  let raw = '';
  req.on('data', c => { raw += c; });
  req.on('end', () => {
    let body = null;
    if (raw) { try { body = JSON.parse(raw); } catch { /* ignore */ } }
    try {
      const out = route.handler(route.params, query, body);
      if (out instanceof Error) { res.writeHead(out.statusCode || 500); return res.end(JSON.stringify({ error: out.message })); }
      res.writeHead(200);
      res.end(JSON.stringify(out, null, 2));
    } catch (e) {
      res.writeHead(500);
      res.end(JSON.stringify({ error: String(e && e.message || e) }));
    }
  });
});

server.listen(PORT, () => {
  console.log('[ontology-v2-mock] listening on http://localhost:' + PORT);
  console.log('  GET  /health');
  console.log('  GET  /tenants            /tenants/:id');
  console.log('  GET  /intake/sources     /intake/sources/:id     /intake/sources/:id/mapping');
  console.log('  GET  /intake/adapters    POST /intake/sources/:id/upgrade');
  console.log('  GET  /agent/runtimes     /agent/jobs[?runtime=]   POST /agent/jobs   POST /agent/token');
  console.log('  GET  /gates              /review/queue[?tenant=]  POST /gates/check');
  console.log('  GET  /batches/:id        /batches/:id/impact      /vault[?tenant=]');
});
