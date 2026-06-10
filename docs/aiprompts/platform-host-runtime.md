# 平台宿主 Agent Runtime 联调流程

> 状态：current playbook
> 更新时间：2026-06-10
> 适用：验证 Content Studio 通过 `lime-desktop-platform` Host Bridge 调用 Lime App Server runtime provider store。

## 1. 验收目标

本流程只验收真实平台宿主链路，不使用 Content Studio fake bridge、不使用 standalone sidecar 代替宿主证据。

```text
Content Studio agents
  -> LIME_RUNTIME_BRIDGE
  -> lime-desktop-platform /capability/invoke lime.agent
  -> app-server --stdio --backend runtime --data-dir <platform userData>/app-server
  -> provider store
  -> LLM API
  -> agentSession/event / artifact.snapshot
```

通过条件：

- `platform-host:runtime:live` 输出 `mode=lime-desktop-platform`。
- bridge source 来自真实宿主 descriptor。
- `lime.agent` payload 只包含业务上下文、`providerPreference`、`modelPreference`，不包含 key/token/secret。
- App Server 返回 `sessionId`、`turnId`、runtime events 和 `artifact.snapshot`。
- Provider key 只存在于 Lime App Server provider store / 平台设置，不进入 Product App env、payload 或 workspace。

## 2. 平台侧准备

在 `lime-desktop-platform` 启动真实宿主和 App Server sidecar：

```bash
cd "$LIME_DESKTOP_PLATFORM_ROOT"
npm run build

APP_SERVER_BIN="$APP_SERVER_BIN" \
npm run smoke:app-server-sidecar
```

如使用 packaged resources：

```bash
APP_SERVER_RESOURCE_DIR="/path/to/resources/app-server" \
npm run smoke:app-server-sidecar:package-resources
```

要求：

- App Server 必须以 `--backend runtime` 连接。
- data root 使用平台宿主管理的 `<Platform userData>/app-server` 或隔离测试目录。
- Provider 设置通过平台 UI / App Server provider store 写入，不把 API Key 传给 Content Studio。

## 3. Lime App Server 准备

如需本地构建 App Server：

```bash
cd "$LIME_APP_SERVER_ROOT"
cargo build --manifest-path "lime-rs/Cargo.toml" -p app-server
```

最小 runtime 启动条件：

```bash
APP_SERVER_DATA_DIR="<isolated-data-dir>" \
"/path/to/app-server" --stdio --backend runtime --data-dir "<isolated-data-dir>"
```

Provider store 必须已有可用 provider/key/model。若需要 live provider smoke，必须显式授权，例如 `LIME_ALLOW_LIVE_PROVIDER_SMOKE=1` 或对应平台流程；不要在 Content Studio 进程环境中设置 provider key。

## 4. Content Studio 验收命令

由 `lime-desktop-platform` 启动 Content Studio 后，宿主会提供 `LIME_RUNTIME_BRIDGE`。在同一运行环境中执行：

```bash
cd "$CONTENT_STUDIO_ROOT"
npm run platform-host:runtime:live -- \
  --provider "<appServerProviderId>" \
  --model "<modelId>"
```

成功输出示例：

```text
[platform-host:runtime:live] ok mode=lime-desktop-platform source=env host=electron/<version> entry=<entryKey> provider=<providerId> model=<modelId> session=<sessionId> turn=<turnId> events=message.delta,artifact.snapshot,turn.completed artifact=<title> terminal=turn.completed
```

没有真实宿主或 provider/model 偏好时必须失败；失败不是回归，表示不能把当前环境计为真实联调证据。

standalone provider store live 只能作为过渡验证：

```bash
npm run app-server:runtime:live -- \
  --data-dir "<isolated-data-dir>" \
  --provider "<appServerProviderId>" \
  --model "<modelId>"
```

## 5. 跨仓平台 Smoke

当需要验证真实 `lime-desktop-platform` Electron、runtime bridge discovery、App Server JSON-RPC 和 Product App live gate 是否能串起来，但不想调用正式上游 LLM API 时，使用平台仓库的 external fixture smoke：

```bash
cd "$LIME_DESKTOP_PLATFORM_ROOT"
npm run smoke:product-app-runtime-live -- \
  --content-studio-root "$CONTENT_STUDIO_ROOT" \
  --zhongcao-root "$ZHONGCAO_ROOT" \
  --app-server-bin "$APP_SERVER_BIN"
```

2026-06-10 已跑通该 smoke。成功输出包含：

```text
mode=lime-desktop-platform
source=discovery
events=message.delta,artifact.snapshot,turn.completed
artifact=平台 Runtime 生成草稿
```

该 smoke 的价值：

- 使用真实 `lime-desktop-platform` Electron 和 runtime bridge discovery，不是 Content Studio fake bridge。
- 平台模型设置会写入 App Server provider store，并由 Content Studio `platform-host:runtime:live` 通过 discovery 调 `lime.agent`。
- 后端是本地 external fixture，不调用正式上游 LLM API；因此它不能替代真实 Provider / `--backend runtime` live 验收。

## 6. 留证清单

联调完成后在路线图或验收记录中记录：

- `lime-desktop-platform` commit / 版本。
- `app-server` commit / binary sha256 / data-dir 类型。
- Provider id、model id、provider store readiness 结果。
- `platform-host:runtime:live` 完整命令和输出。
- Content Studio agents E2E 截图或日志，证明入口页、发送、运行事实、交付物正常。
- 确认 payload/env/workspace 中无 key/token/secret。
- 若使用 `smoke:product-app-runtime-live`，必须标注为 external fixture 宿主证据，不得声明已完成真实上游 LLM Provider live。

## 7. 明确不算通过的情况

- 只跑 fake `withPlatformRuntimeBridge` functional 测试。
- 只跑 `npm run app-server:runtime:live` standalone gate。
- 只跑 `smoke:app-server-stdio` 的 unavailable backend。
- 只证明 `lime.agent` blocked / fail-closed。
- 只跑 `smoke:product-app-runtime-live` 却声明真实上游 LLM Provider live 已完成。
- Product App 通过 env 或 payload 传 provider key。
