# Lime Agent 接入路线图

> 状态：current planning source
> 更新时间：2026-06-06
> Owner：content-studio 主进程 / Agent runtime 集成
> 定位：content-studio 如何接入 Lime App Server，并把 Agent runtime 全面收敛到 Lime Agent Server sidecar。

## 1. 背景

content-studio 的 Agent 执行已从客户端自带 runtime 收敛到 Lime Agent Server sidecar：

```text
renderer -> contentStudio.runAgentTask (preload)
  -> ipcMain 'agent:run' (src/main/ipc.ts:779)
  -> AppServerSidecarService
  -> app-server sidecar + packaged external backend
  -> webContents.send('agent:event:${taskId}') (src/main/ipc.ts:471)
```

Lime 侧把 Agent runtime 服务化成 App Server（见 Lime 仓库 `internal/roadmap/appserver/`），对外发布：

1. `app-server-client` npm package（JSON-RPC client + sidecar 启动 helper；content-studio 当前尚未引入 npm 依赖）。
2. `app-server` sidecar binary（stdio newline-delimited JSON-RPC）。
3. release manifest（version / platform / sha256）。

本路线图定义 content-studio 作为第一批消费方如何接入，且**不复制 Lime runtime、不 import Lime Rust crate**。

## 2. 事实源声明

| 分类 | 对象 | 说明 |
| --- | --- | --- |
| `current` | `docs/roadmap/limeagent/*` | content-studio 接入 App Server 的规划与边界 |
| `current` | 随包 Lime `app-server` sidecar + packaged external backend | 真实 Agent runtime 来源，必须进入内容工厂安装包 |
| `compat` | `agent:run` / `agent:cancel` IPC 合同 | 命令名和事件名保持不变，内部改为委托 sidecar |
| `dead` | 客户端自带 SDK runtime / 第二套 runtime adapter / 在 content-studio 内重写 RuntimeCore | 不作为接入方向 |

## 3. 文档索引

| 文档 | 作用 |
| --- | --- |
| [integration.md](./integration.md) | 接入边界、改动点、目录落点、阶段顺序、阻塞点与验收口径。 |

## 4. 主目标

1. content-studio 通过 `AppServerSidecarService` 消费 Lime App Server。
2. sidecar 由 Electron main 管理生命周期，renderer 只拿业务投影。
3. 保持现有 `agent:run` / `agent:cancel` IPC 合同与 `agent:event:${taskId}` 事件名不变。
4. sidecar binary 由 release manifest pin 住并校验 sha256，随 `electron-builder` 打包到 `process.resourcesPath/app-server`。
5. 不 import Lime Rust crate，不复制 RuntimeCore / ExecutionBackend / AsterBackend。

## 5. 非目标

1. 不重写 content-studio 业务 UI 和内容工厂主链。
2. 不在 renderer 直接 spawn sidecar 或读 stdout。
3. 不恢复客户端自带 SDK runtime 或显式 fallback。
4. 不在 content-studio 内自建第二套 Agent runtime。

## 6. 当前状态

Lime standalone `app-server` binary 已支持 host-independent `external` backend，content-studio 已把 `agent:run` 默认路径切到 App Server：

```text
content-studio AppServerSidecarService
  -> app-server --stdio --backend external --backend-command resources/app-server/backend/content-backend.mjs --app-policy content-studio.policy.json
  -> initialize
  -> capability/list
  -> agentSession/start
  -> agentSession/turn/start
  -> agentSession/event
  -> AgentEvent(status / assistant / result / error / done)
  -> artifact/read
  -> evidence/export
```

已落地：

1. `src/main/services/appServerSidecarService.ts`：main 进程管理 App Server newline-delimited JSON-RPC sidecar、external backend smoke 和 health check。
2. `appServer:health` / `appServer:smoke` IPC：renderer 可通过 preload 查询接入状态，但当前不改变业务 UI。
3. `npm run smoke:app-server`：默认验证 `resources/app-server/current/app-server(.exe)`；也可通过 `APP_SERVER_RESOURCES_DIR` 验证打包输入目录。
4. `electron-builder.yml`：通过 `extraResources` 把 `resources/app-server` 打包进内容工厂。
5. `agent:run` 默认委托 `AppServerSidecarService.runAgent(...)`，保持 `agent:event:${taskId}` 事件合同不变。
6. `agent:cancel` 只取消 App Server running task；旧 runtime 已归为 `dead`，不保留显式 fallback。
7. functional tests 已覆盖 packaged backend 文本模型未配置 error、packaged backend echo artifact、显式 external backend 事件投影、metadata / queue flags 透传、慢 backend cancel 不假完成、backend stderr crash error 投影、同一 service 下一任务恢复和 smoke 链路。
8. `npm run app-server:prepare`：从 Lime release manifest 选择当前平台 artifact，复制 / 下载 sidecar，校验 sha256，写入 `resources/app-server/current` 和 `app-server.release.json`。
9. `APP_SERVER_RESOURCES_DIR=... npm run smoke:app-server`：已支持 resources 路径 smoke，验证打包输入目录可启动；`APP_SERVER_BIN` 仅在 `CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE=1` 时作为开发 / 测试覆盖。
10. `resources/app-server/backend/content-backend.mjs`：默认 packaged external backend，按 `CONTENT_STUDIO_TEXT_*` / 通用 LLM env 调真实 HTTP 文本模型生成 Markdown artifact；未配置模型时返回明确失败，不伪造成功。
11. `npm run app-server:backend:test`：直接验证 packaged backend 缺模型失败、echo 成功，以及 OpenAI Chat / Anthropic Messages / Gemini GenerateContent 三种协议级请求与响应映射；测试使用本地 HTTP server，不依赖外网密钥。
12. `npm run app-server:backend:live`：发布前真实模型环境验收入口；要求真实 provider key，禁止 echo mode，成功条件是 packaged backend 真实产出 `artifact.snapshot` 和 `turn.completed`。
13. 2026-06-06 已完成 macOS 分发包验证：`npm run dist:mac` 生成 `布谷AI-0.18.0-arm64.dmg` 和 `布谷AI-0.18.0-arm64-mac.zip`；zip 与只读挂载 DMG 均确认包含 `Contents/Resources/app-server/current/app-server`、`app-server.release.json` 和 `backend/content-backend.mjs`；镜像内 `APP_SERVER_RESOURCES_DIR=... npm run smoke:app-server` 返回 `source=resources`、`protocol=appserver.v0`、`content.draft.generate`、runtime events、artifact 和 evidence。

仍未完成：

1. `app-server:backend:live` 仍需在受控发布环境用真实生产密钥 / 真实网络模型跑过并留存结果。
2. 更接近生产环境的长流式输出压测、自动 restart / retry 退避策略仍需扩展。
3. 更细的治理守卫仍可继续补充，例如对旧 runtime import、旧协议名和废弃环境变量做 CI 扫描。

CI / release 已完成串联：

1. `npm run app-server:prepare:release` 通过 `APP_SERVER_RELEASE_MANIFEST` / `APP_SERVER_RELEASE_MANIFEST_URL` 从 release manifest 准备当前 runner 平台 sidecar。
2. GitHub release build 在 `prepare-oem-build.mjs` 前执行资源准备，并用 `CONTENT_STUDIO_REQUIRE_APP_SERVER_RESOURCES=1` 强制检查 `current/app-server(.exe)`、`app-server.release.json` 和 packaged backend。
3. CI / release verify job 均运行 `app-server:prepare:test` 与 `app-server:backend:test`，不依赖真实发布 manifest。
