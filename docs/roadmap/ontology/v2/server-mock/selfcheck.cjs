// 启动 mock 服务并打全部端点，验证契约。零依赖。
// 运行：node server-mock/selfcheck.js
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 8798;
const base = 'http://localhost:' + PORT;
const srv = spawn(process.execPath, [path.join(__dirname, 'server.cjs')], { env: { ...process.env, PORT } });
srv.stderr.on('data', d => process.stderr.write(d));

function req(method, p, body) {
  return new Promise((resolve) => {
    const data = body ? JSON.stringify(body) : null;
    const u = new URL(base + p);
    const r = http.request({ method, hostname: u.hostname, port: u.port, path: u.pathname + u.search,
      headers: data ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } : {} }, (res) => {
      let buf = ''; res.on('data', c => buf += c);
      res.on('end', () => { let j; try { j = JSON.parse(buf); } catch { j = buf; } resolve({ code: res.statusCode, body: j }); });
    });
    r.on('error', () => resolve({ code: 0, body: null }));
    if (data) r.write(data); r.end();
  });
}

const checks = [
  ['GET', '/health', null, r => r.body.status === 'ok'],
  ['GET', '/tenants', null, r => Array.isArray(r.body) && r.body.length === 3],
  ['GET', '/tenants/tenant-A', null, r => r.body.id === 'tenant-A'],
  ['GET', '/tenants/nope', null, r => r.code === 404],
  ['GET', '/intake/sources', null, r => r.body.length === 6],
  ['GET', '/intake/sources/ads', null, r => r.body.coverage === 0 && r.body.health === 'bad'],
  ['GET', '/intake/sources/shop/mapping', null, r => r.body.fields.some(f => f.status === 'missing')],
  ['GET', '/intake/adapters', null, r => r.body.find(a => a.id === 'ad-excel-generic').reuseCount === 88],
  ['POST', '/intake/sources/ads/upgrade', {}, r => r.body.ok && r.body.to === 'L2'],
  ['POST', '/intake/sources/search/upgrade', {}, r => r.code === 409],
  ['GET', '/agent/runtimes', null, r => r.body.local.running === 14 && r.body.cloud.queued === 41],
  ['GET', '/agent/jobs?runtime=local', null, r => r.body.every(j => j.runtime === 'local')],
  ['POST', '/agent/jobs', { type: '卖点共创', tenant: 'tenant-A' }, r => r.body.job.runtime === 'local'],
  ['POST', '/agent/jobs', { type: '批量分档', estimatedItems: 286 }, r => r.body.job.runtime === 'cloud' && r.body.job.handoffFrom === 'local'],
  ['POST', '/agent/token', {}, r => r.body.ttlSec === 900],
  ['GET', '/gates', null, r => r.body.find(g => g.id === 'efficacy').passRate === 64],
  ['GET', '/review/queue?tenant=tenant-A', null, r => r.body.every(x => x.tenant === 'tenant-A')],
  ['POST', '/gates/check', { claim: '三秒降温立竿见影' }, r => r.body.decision === 'blocked'],
  ['POST', '/gates/check', { claim: '续航适合通勤' }, r => r.body.decision === 'passed'],
  ['GET', '/batches/batch-summer-fan-202606', null, r => r.body.stages.length === 9],
  ['GET', '/batches/batch-summer-fan-202606/impact', null, r => r.body.blockedTiers.includes('premium')]
];

setTimeout(async () => {
  let pass = 0, fail = 0;
  for (const [m, p, b, check] of checks) {
    const r = await req(m, p, b);
    let ok = false; try { ok = check(r); } catch {}
    console.log((ok ? '✓' : '✗') + ' ' + m + ' ' + p + (ok ? '' : '  -> code=' + r.code + ' body=' + JSON.stringify(r.body).slice(0, 80)));
    ok ? pass++ : fail++;
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  srv.kill();
  process.exit(fail ? 1 : 0);
}, 600);
