# App Server Sidecar Resources

本目录用于随 Electron 包携带 Lime 发布的 `app-server` sidecar、release manifest、App policy 和 external backend command。

生产包目标结构：

```text
resources/app-server/
  current/app-server
  current/app-server.exe
  app-server.release.json
  content-studio.policy.json
  backend/content-backend.mjs
```

本仓库不提交平台二进制。发布流水线应从 Lime App Server release manifest 选择平台产物、校验 sha256，再放入本目录或 electron-builder `extraResources` 输入目录。

准备资源：

```bash
npm run app-server:prepare -- \
  --manifest /path/to/app-server.release.json \
  --resources-dir resources/app-server
```

正式 release workflow 使用同一脚本入口，但通过环境变量传入 manifest：

```bash
APP_SERVER_RELEASE_MANIFEST=/path/or/url/app-server.release.json \
npm run app-server:prepare:release
```

GitHub Actions release job 会在 OEM 打包前执行 `app-server:prepare:release`，并用 `CONTENT_STUDIO_REQUIRE_APP_SERVER_RESOURCES=1` 让 `prepare-oem-build.mjs` 检查以下资源存在；缺失时直接失败：

```text
resources/app-server/current/app-server
resources/app-server/app-server.release.json
resources/app-server/backend/content-backend.mjs
```

`artifact.url` 支持 `http(s)`、`file://`、绝对路径、相对 manifest 文件的路径，或 Lime `dist-electron` 使用的 `app-resource://app-server/<platform>/app-server` 本地资源路径。远程 manifest 不能使用 `app-resource://`，避免把宿主私有资源路径误当成网络下载地址。脚本会写入：

```text
resources/app-server/current/app-server
resources/app-server/app-server.release.json
```

同平台 artifact 会在写入 `current/` 前执行 runtime provider store 预检：

- `app-server --help` 必须包含 `--data-dir`。
- `app-server --stdio --backend unavailable --data-dir <tmp>` 必须能响应 `modelProvider/list`。
- 预检失败会中止准备并清理临时文件，避免把只支持旧 external smoke 的 binary 打进 release 资源。

跨平台准备无法在当前主机执行 binary，会返回 `runtimeProviderStore=skipped-cross-platform`。`CONTENT_STUDIO_SKIP_APP_SERVER_RUNTIME_PROVIDER_STORE_CHECK=1` 或 `--skip-runtime-provider-store-check 1` 只允许本地临时诊断使用，正式 release 不应跳过。

本地对接 Lime `dist-electron` 产物时可直接使用 Lime 仓库生成的 release manifest：

```bash
npm run app-server:prepare -- \
  --manifest /Users/coso/Documents/dev/ai/aiclientproxy/lime/dist-electron/app-server.release.json \
  --resources-dir /tmp/content-studio-app-server-verify
```

通过标准是输出 `runtimeProviderStore=validated`，并且 sha256 与 Lime manifest 中的 artifact 一致。该命令用于验证 release resource 准备链路，不要求把 220MB 平台二进制提交进本仓库。

默认 smoke 验证仓库 `resources/app-server/current/app-server(.exe)`：

```bash
npm run smoke:app-server
```

验证 resources 路径可用：

```bash
APP_SERVER_RESOURCES_DIR=resources/app-server npm run smoke:app-server
```

显式指向 Lime 本地 debug sidecar 时，必须打开开发 / 测试覆盖开关。即使打开该开关，运行时仍优先使用 `APP_SERVER_RESOURCES_DIR` 和随包 `process.resourcesPath/app-server`：

```bash
CONTENT_STUDIO_ALLOW_APP_SERVER_BIN_OVERRIDE=1 \
APP_SERVER_BIN=/path/to/app-server \
npm run smoke:app-server
```

默认 Agent backend：

```bash
npm run app-server:backend:test
```

发布前真实模型验收：

```bash
CONTENT_STUDIO_TEXT_PROTOCOL=openai-chat \
CONTENT_STUDIO_TEXT_MODEL=gpt-4o-mini \
CONTENT_STUDIO_TEXT_API_KEY=... \
npm run app-server:backend:live
```

`app-server:backend:live` 只用于受控发布环境。它不允许 `CONTENT_STUDIO_APP_SERVER_BACKEND_ECHO=1`，也不会进入默认 CI；缺少真实 provider key 时会明确失败。

`AI agents` runtime 主链还需要额外跑 `npm run app-server:runtime:live` 或 `npm run platform-host:runtime:live`。当前仓库内旧 `resources/app-server/current/app-server` 若不支持 `--data-dir` / `modelProvider/list`，只能作为 packaged external backend smoke 证据，不能作为 provider store live 证据。

运行时也有同等守卫：`AppServerSidecarService.runPromptTurn` 在启动 `--backend runtime` 前会先执行 `--data-dir` 与 `modelProvider/list` 预检；失败时 agents 主链会 fail closed，不会回退到旧 external backend 或 Product App 本地 Key。

`backend/content-backend.mjs` 是 packaged external backend。它读取 App Server stdin JSON `{ kind, request }`，输出 `{ events }`，并按 capability 调用真实生成服务：

- `content.draft.generate` / `content.text.generate`：按 `CONTENT_STUDIO_TEXT_*` / 通用 LLM 环境变量调用真实 HTTP 文本模型，支持 Markdown 和 JSON artifact；未配置文本模型时返回 `turn.failed`。
- `content.image.generate`：按 `CONTENT_STUDIO_IMAGE_*` 调用真实图片生成服务，输出图片 artifactRefs；未配置时返回 blocked 契约，不生成占位素材。
- `content.video.generate`：按 `CONTENT_STUDIO_VIDEO_*` 调用 Generic HTTP 视频服务，输出视频 artifactRefs、provider job artifact 或 blocked 队列文件；未配置时只保存可追溯队列请求。

所有能力都不会伪造成功。`CONTENT_STUDIO_APP_SERVER_BACKEND_COMMAND` 只用于显式覆盖默认 backend。
