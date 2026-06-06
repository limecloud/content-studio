# content-studio 接入 Lime App Server

> 状态：current planning source
> 更新时间：2026-06-06
> 作用：定义 content-studio 接入 Lime App Server 的边界、改动点、目录落点、阶段顺序、阻塞点与验收口径。
> 关联：Lime 仓库 `internal/roadmap/appserver/consumer-integration.md`（独立 App 消费方案）、`architecture.md`（`ElectronClient` 路径）。

## 1. 结论

content-studio 已经是成熟 Electron 应用，接入 Lime App Server **不改业务 UI、不改 IPC 合同**，工作集中在 main 进程维护 App Server sidecar lifecycle、JSON-RPC client 和 runtime facts 投影。`agent:run` 和 Prompt 工作台协作链路已全面切到随包 sidecar，旧客户端自带 runtime 已归为 `dead`。

核心思路：保持 renderer 和 preload 的调用面不变，只替换 main 进程里的执行后端；renderer 仍只接收既有 `AgentEvent` 投影。生产包必须携带 Lime `app-server` 与 packaged external backend，`APP_SERVER_BIN` 只允许本地开发 / 测试显式覆盖。

## 2. 现状锚点（已核实）

| 环节 | 位置 | 现状 |
| --- | --- | --- |
| 命令注册 | `src/main/ipc.ts:779-780` | `agent:run` / `agent:cancel` |
| 执行实现 | `src/main/services/appServerSidecarService.ts` | 默认启动 App Server sidecar 并委托 external backend |
| 事件投影 | `src/main/ipc.ts:471` | `webContents.send('agent:event:${taskId}', event)` |
| preload 暴露 | `src/preload/index.ts` | `contextBridge.exposeInMainWorld('contentStudio', api)` |
| 类型契约 | `src/shared/types.ts` | `AgentEvent` / `RunTaskInput` |
| 打包 | `electron-builder.yml` | `extraResources` 已带 `resources/app-server`，运行时解析到 `process.resourcesPath/app-server` |

## 3. 边界声明

| 分类 | 对象 | 说明 |
| --- | --- | --- |
| `不改` | renderer 业务组件 | 业务 UI 暂不接 sidecar，仍使用既有 Agent 投影 |
| `不改` | `agent:run` / `agent:cancel` IPC 名、`agent:event:${taskId}` 事件名 | 合同稳定，内部委托 sidecar |
| `current` | `src/main/services/appServerSidecarService.ts` | sidecar newline-delimited JSON-RPC 连接、health、external backend smoke、agent run/cancel |
| `current` | `resources/app-server/current/app-server(.exe)` + `resources/app-server/backend/content-backend.mjs` | 内容工厂随包 App Server 资源事实源 |
| `已新增` | `appServer:health` / `appServer:smoke` | 试点 IPC，不替代 `agent:run` |
| `已切换` | `src/main/ipc.ts` agent 接线 | `agent:run` 默认走 App Server，`agent:cancel` 优先取消 App Server task |
| `dead` | 客户端自带 SDK runtime / 第二套 runtime adapter | 不再保留 fallback 或新功能入口 |
| `当前实现` | main 侧轻量 JSON-RPC client | 直接消费 sidecar；后续如替换为官方 `app-server-client`，必须 pin 发布版本且不引入 Lime Rust workspace |

禁止方向（对齐 Lime `consumer-integration.md` §4）：

1. renderer 不直接 spawn sidecar。
2. renderer 不直接读写 App Server stdout。
3. 不把 Lime Rust workspace 拉进 content-studio 构建图。
4. 不复制 RuntimeCore / ExecutionBackend / AsterBackend。

## 4. 运行时路径

```text
目标形态：
Renderer
  -> contentStudio.runAgentTask (preload, 不变)
  -> ipcMain 'agent:run' (不变)
  -> AppServerSidecarService / JSON-RPC client
  -> app-server sidecar --stdio
  -> RuntimeCore -> ExecutionBackend
  -> agentSession/event notification
  -> webContents.send('agent:event:${taskId}') (事件名不变)
```

与现状对照：

```text
current:
  ipcMain 'agent:run'
  -> AppServerSidecarService.runAgent
  -> app-server sidecar --backend external
  -> notification
  -> webContents.send('agent:event:...')
```

## 5. 目录落点

对齐 Lime `consumer-integration.md` §4 推荐接入点：

```text
content-studio
  src/main/services/appServerSidecarService.ts  binary 解析 / spawn / JSON-RPC / run / cancel / smoke
  src/main/ipc.ts                              agent:run / agent:cancel 只走 App Server，appServer:* 试点 IPC
  src/preload/index.ts                         health / smoke facade，业务 agent facade 不变
  src/renderer/src/...                         不变
  resources/app-server/                        打包带入的 sidecar binary + manifest
```

## 6. 改动点明细

### 6.1 已新增 `appServerSidecarService.ts`：试点生命周期

main 进程职责（对齐 Lime `consumer-integration.md` §4）：

1. `resolveBinaryPath(...)`：按 `APP_SERVER_RESOURCES_DIR` / packaged `process.resourcesPath/app-server` → 显式开发测试 `APP_SERVER_BIN` override → repo resources 查找 sidecar，不硬编码用户路径。
2. `spawn` sidecar，完成 `initialize / initialized` 握手。
3. 临时生成 content-studio app policy，默认委托 packaged external backend，跑通 capability、turn、event、artifact 和 evidence。
4. 失败返回 explicit `ok: false` / `source: missing`，不伪造成功；生产包缺少随包 App Server 时必须暴露 blocked / missing。

```ts
const result = await appServer.runSmoke();
// result.eventTypes includes message.delta and artifact.snapshot
// result.artifactRefs includes content-studio-draft-smoke
```

### 6.2 `runAgent(...)`：会话与 turn 映射

把现有 `RunTaskInput` 映射到 App Server 的 session + turn：

```ts
const session = await sidecar.request('agentSession/start', {
  appId: 'content-studio',
  workspaceId,
});

const turn = await sidecar.request('agentSession/turn/start', {
  sessionId: session.result.session.sessionId,
  turnId,
  input: { text: input.prompt },
  runtimeOptions: {
    capabilityId: 'content.draft.generate',
    stream: true,
    metadata: {
      selectedSkillSlugs: input.selectedSkillSlugs ?? [],
      permissionMode: input.permissionMode,
    },
  },
  queueIfBusy: true,
  skipPreSubmitResume: true,
});
```

main 进程会持续消费 `agentSession/event`，直到收到 `turn.completed` / `turn.failed` / `turn.canceled` 终态；禁止用短暂静默假定任务完成。Agent turn 等待默认 120s，可通过 `CONTENT_STUDIO_APP_SERVER_AGENT_TIMEOUT_MS` 或 `APP_SERVER_AGENT_TIMEOUT_MS` 覆盖。

### 6.3 `ipc.ts`：agent 接线委托

`agent:run` 调用 App Server service，并把 `agentSession/event` notification 转成现有 `AgentEvent` 投影：

```ts
ipcMain.handle('agent:run', async (_event, input: RunTaskInput) => {
  const taskId = await appServer.runAgent(input, publish);
  return { taskId };
});
```

要点：

1. 事件 envelope 从 `agentSession/event` 映射到现有 `AgentEvent`（`assistant` / `tool` / `result` 等），保持 renderer 投影不变。
2. `agent:cancel` 映射到 `agentSession/turn/cancel`。
3. notification fanout 在 main 完成，renderer 只拿业务投影。

### 6.4 事件映射表

| App Server 公共事件 | content-studio `AgentEvent` | 说明 |
| --- | --- | --- |
| `turn.started` | 内部状态置 running | 可不直接投影 |
| `message.delta` | `{ type: 'assistant', text }` | 流式拼接 |
| `tool.started` / `tool.result` / `tool.failed` | tool 事件 | 按现有 UI 投影 |
| `action.required` | 走 `agentPromptSessions:respondAction` 类交互 | 需人工介入时 |
| `turn.completed` | `{ type: 'result', summary }` / `{ type: 'done' }` | 成功终态 |
| `turn.failed` / 任意 `*.failed` | `{ type: 'error', message }` | 失败终态，禁止继续发送 done |

## 7. 打包

对齐 Lime `consumer-integration.md` §5，`electron-builder.yml` 用 `extraResources` 带上 sidecar：

```yaml
extraResources:
  - from: resources/app-server
    to: app-server
    filter:
      - '**/*'
```

目录结构：

```text
resources/app-server/
  current/app-server
  darwin-arm64/app-server
  darwin-x64/app-server
  win32-x64/app-server.exe
  linux-x64/app-server
  app-server.release.json
  content-studio.policy.json
  backend/
```

运行时 binary 解析顺序：

1. `APP_SERVER_RESOURCES_DIR/current/app-server(.exe)` 或 `${platform}-${arch}/app-server(.exe)`：打包输入目录 / smoke 明确指定资源。
2. packaged `process.resourcesPath/app-server/current/app-server(.exe)` 或 `${platform}-${arch}/app-server(.exe)`：生产包主路径。
3. `APP_SERVER_BIN`：仅当 `CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE=1` 时启用，用于本地开发 / functional fake sidecar 测试；即使开启，仍不能抢占前两类资源路径。
4. repo dev fallback `resources/app-server/current/app-server(.exe)`：源码仓库本地验证。

生产必须从 manifest 选 artifact、校验 sha256，并把结果打包进 `resources/app-server`。正式包不依赖 `APP_SERVER_BIN`。

默认 backend 解析顺序：

1. `CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND`：显式覆盖，用于联调或替换 backend。
2. `APP_SERVER_RESOURCES_DIR/backend/content-backend.mjs`：资源目录 smoke / 打包输入目录验证。
3. packaged resources `app-server/backend/content-backend.mjs`。
4. repo dev fallback `resources/app-server/backend/content-backend.mjs`。

默认 backend 使用 `CONTENT_STUDIO_TEXT_*` / 通用 LLM env 调真实 HTTP 文本模型生成 Markdown artifact；缺少模型配置时返回明确失败，不伪造成功。

当前资源准备入口：

```bash
npm run app-server:prepare -- \
  --manifest /path/to/app-server.release.json \
  --resources-dir resources/app-server

APP_SERVER_RESOURCES_DIR=resources/app-server npm run smoke:app-server
```

`app-server:prepare` 会按当前平台选择 artifact，复制或下载 sidecar，校验 sha256，写入 `resources/app-server/current` 与 `resources/app-server/app-server.release.json`。

正式 release workflow 已串联：

```bash
APP_SERVER_RELEASE_MANIFEST=/path/or/url/app-server.release.json \
npm run app-server:prepare:release
```

GitHub release build 在 `prepare-oem-build.mjs` 前执行资源准备，并设置 `CONTENT_STUDIO_REQUIRE_APP_SERVER_RESOURCES=1`，强制 OEM 打包前检查：

```text
resources/app-server/current/app-server(.exe)
resources/app-server/app-server.release.json
resources/app-server/backend/content-backend.mjs
```

OEM builder config 同时保留原有 `resources -> resources`，并额外映射 `resources/app-server -> app-server`，确保运行时 `process.resourcesPath/app-server/...` 可解析 sidecar。`assert-oem-artifact-scope.mjs` 在 release 模式下也会检查最终产物包含 App Server binary、release manifest 和 packaged backend。

## 8. 阶段顺序

```text
阶段 A：client skeleton（不依赖 Lime 真实 backend）
  - 新建 AppServerSidecarService 轻量 JSON-RPC client
  - 本地用随包 resources 或显式 APP_SERVER_BIN override 指向 Lime debug binary
  - 跑通 initialize -> startSession -> startTurn -> event -> shutdown
  退出条件：已完成，agent:run 能产出事件并投影到 renderer

阶段 B：真实 Agent flow（依赖 Lime App Server P4）
  - Lime backend 已有 host-independent external backend seam
  - content-studio 已有 appServer:smoke 试点 IPC
  - agent:run 默认走 App Server，旧客户端自带 runtime 已删除
  - packaged backend 已接入 resources/app-server/backend/content-backend.mjs
  - functional tests 覆盖 packaged backend 缺模型 error、echo artifact、真实 sidecar event projection、metadata / queue flags 透传、慢 backend cancel 不假完成、backend stderr crash error 投影、同一 service 下一任务恢复
  - app-server:backend:test 覆盖 OpenAI Chat / Anthropic Messages / Gemini GenerateContent 三种协议级请求与响应映射，本地 mock server 不依赖外网密钥
  - app-server:backend:live 提供发布前真实模型环境验收入口，要求真实 provider key，禁止 echo mode，成功条件是 packaged backend 产出 artifact.snapshot 和 turn.completed
  退出条件：app-server:backend:live 在受控发布环境用真实生产密钥 / 真实网络模型跑通并留存结果，更接近生产环境的长流式输出压测和带退避策略的自动 restart / retry 跑通

阶段 C：打包与 CI 同步
  - electron-builder extraResources 带 sidecar
  - app-server:prepare 已能按 manifest 下载 / 复制、校验 sha256、放入 resources/app-server/current
  - resources smoke 已能通过 APP_SERVER_RESOURCES_DIR 验证 packaged resources 路径
  - runtime resolver 已固定 packaged resources 优先于 APP_SERVER_BIN override
  - CI / release verify job 已覆盖 app-server:prepare:test 与 app-server:backend:test
  - release build 已在 OEM 打包前串联 app-server:prepare:release，并检查最终产物 App Server 资源
  - 2026-06-06 npm run dist:mac 通过，zip / DMG 分发包均包含 app-server sidecar、release manifest 和 packaged backend；只读挂载 DMG 后用镜像内 app-server 资源跑通 smoke
  退出条件：已完成；后续只补真实生产环境模型与更强生命周期验收

阶段 D：旧链路下线
  - 旧客户端自带 runtime 已删除，后续只补治理扫描和生产强验证
  退出条件：无旧 runtime import、旧协议名或废弃环境变量残留
```

## 9. 本地开发

对齐 Lime `consumer-integration.md` §6：

```bash
# 默认验证仓库 resources/app-server/current/app-server
npm run smoke:app-server

# 验证 release manifest -> resources/current -> resources smoke
npm run app-server:prepare -- --manifest /path/to/app-server.release.json
APP_SERVER_RESOURCES_DIR=resources/app-server npm run smoke:app-server

# 显式指向 Lime 本地 debug sidecar，仅开发 / 测试
CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE=1 \
APP_SERVER_BIN=/path/to/app-server \
npm run smoke:app-server

# 可选：显式覆盖 external backend command
CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE=1 \
APP_SERVER_BIN=/path/to/app-server \
CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND=/path/to/backend \
npm run start

# 默认 packaged backend 使用真实文本模型配置
CONTENT_STUDIO_TEXT_PROTOCOL=openai-chat \
CONTENT_STUDIO_TEXT_API_KEY=... \
npm run start
```

如果后续把 main 侧轻量 client 替换为 `app-server-client`，本地联调可用 `npm link` 或 `file:` 依赖；生产依赖必须 pin 到发布版本。禁止把 `/Users/...` 绝对路径写进 repo。

## 10. 验收口径

1. IPC 合同稳定：`agent:run` / `agent:cancel` 命令名与 `agent:event:${taskId}` 事件名不变。
2. renderer 零改动：业务组件和 preload 调用面不触及。
3. main 委托 sidecar：`agent:run` 默认走 App Server，不再直接调客户端自带 runtime，也不保留显式 fallback。
4. 不 import Lime Rust crate：当前仅依赖 sidecar binary 和 main 进程 JSON-RPC client；如后续引入 `app-server-client`，必须 pin 到发布版本。
5. sidecar 被 pin：生产包从 manifest 选 artifact 并校验 sha256。
6. 生命周期完整：main 能 spawn / initialize / cancel / shutdown / restart。
7. renderer 只拿投影：不直接 spawn sidecar、不读 stdout。

### 10.1 2026-06-06 macOS 分发验证

已完成：

- `npm run dist:mac` 通过，生成 `release/布谷AI-0.18.0-arm64.dmg`、`release/布谷AI-0.18.0-arm64-mac.zip` 和对应 blockmap。
- `unzip -l release/布谷AI-0.18.0-arm64-mac.zip` 确认 zip 内包含 `Contents/Resources/app-server/current/app-server`、`Contents/Resources/app-server/app-server.release.json` 和 `Contents/Resources/app-server/backend/content-backend.mjs`。
- `hdiutil verify release/布谷AI-0.18.0-arm64.dmg` 通过，校验和有效。
- 只读挂载 DMG 后，`APP_SERVER_RESOURCES_DIR=/tmp/content-studio-dmg-verify/布谷AI.app/Contents/Resources/app-server npm run smoke:app-server` 通过，返回 `source=resources`、`protocol=appserver.v0`、`content.draft.generate`、`message.delta`、`artifact.snapshot`、`content-studio-draft-smoke`、evidence events 和 evidence artifacts。
- `npm run app-server:backend:live` 在无真实 provider key 环境下按预期失败，错误为缺少真实 provider config，且 echo mode 不允许；这证明 live gate 不会在无 Key 环境伪造成发布通过。

当前判断：

- macOS 分发包已经证明 Lime App Server 被打包进内容工厂，且镜像内 sidecar 可以从 packaged resources 运行完整 smoke。
- 发布级真实模型验收仍必须在受控密钥环境运行 `npm run app-server:backend:live`，并留存真实 provider 输出证据。
