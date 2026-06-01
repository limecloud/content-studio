# Ontology v2 服务端 Mock API

状态：Draft v1 · 更新 2026-06-01
配套：[`../server-console.html`](../server-console.html)（控制台 UI）、[`../architecture.md`](../architecture.md)、[`../data-intake-workbench-prd.md`](../data-intake-workbench-prd.md)

纯 Node（零依赖）的 mock 服务，暴露 v2 架构定义的服务端接口，返回与控制台一致的 mock 数据，用于与客户端原型 / 控制台联调，验证接口契约。

## 启动

```bash
node server-mock/server.cjs          # 默认 8799
PORT=9001 node server-mock/server.cjs
```

## 端点

| Method | Path | 说明 |
| --- | --- | --- |
| GET | `/health` | 存活检查 |
| GET | `/tenants` · `/tenants/:id` | 租户列表 / 详情 |
| GET | `/vault[?tenant=]` | 密钥库（仅元信息，无明文） |
| GET | `/intake/sources` · `/:id` | 数据源成熟度 / 覆盖率 / 责任方 |
| GET | `/intake/sources/:id/mapping` | 字段映射（甲方字段→本体字段） |
| GET | `/intake/adapters` | 适配器注册表 |
| POST | `/intake/sources/:id/upgrade` | 发起 L(n)→L(n+1) 升级 |
| GET | `/agent/runtimes` | 本地 / 服务端双 Runtime 负载 |
| GET | `/agent/jobs[?runtime=]` | Agent 任务队列 |
| POST | `/agent/jobs` | 提交任务（模拟本地优先 / 量大转云端） |
| POST | `/agent/token` | 签发短期 token（不下发长期密钥） |
| GET | `/gates` | 规则门禁通过率 |
| GET | `/review/queue[?tenant=]` | 审核队列（待人工） |
| POST | `/gates/check` | 服务端权威裁决（本地 agent 放行前必经） |
| GET | `/batches/:id` | 批次 / StageRun 状态 |
| GET | `/batches/:id/impact` | 接入覆盖 → 制造档位因果 |

## 契约要点（对齐架构纪律）

- `POST /agent/jobs`：`headless` 或 `estimatedItems>100` 时调度到 `cloud`，否则 `local`，体现「用户在场本地优先、算力不足转交」。
- `POST /agent/token`：只发 900s 短期 token，呼应「密钥永不进本地」。
- `POST /gates/check`：强功效/极限词命中即 `blocked` 并给 `recovery`，呼应「门禁服务端权威裁决、不伪造放行」。
- `/batches/:id/impact`：覆盖率压低 `blockedTiers`，呼应「数据→质量因果」。

## 自检

```bash
node server-mock/selfcheck.cjs       # 启动服务并打全部端点，打印结果
```
