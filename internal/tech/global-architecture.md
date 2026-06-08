# content-studio 全局架构图

更新时间：2026-06-07  
状态：current

## 1. 架构结论

content-studio 是一个本地优先的 Electron 桌面内容工厂。Renderer 只负责业务 UI 和 runtime facts 投影；Electron main 负责 IPC、数据存储、模型配置、生成编排和 sidecar 生命周期；Agent runtime 与普通文字、图片、视频生成执行统一通过随包 Lime App Server sidecar 承接；文本、图片、视频能力按显式协议调用真实生成服务，未配置时返回 blocked 或 failed，不伪造成果。

当前架构收敛口径是：**AI 生成执行统一通过 Lime App Server capability / tool runtime；content-studio main 只负责业务对象组装、workspace 持久化、IPC 投影和历史日志写入。** `TextGenerationService` 与 `MediaProvider` 已在应用运行时降级为兼容 facade；旧 provider 直连路径只保留为未注入 App Server 时的迁移期兼容，不再作为新增能力事实源。

## 2. 全局架构

```mermaid
flowchart TB
  User["运营用户 / 内容生产者"]

  subgraph Desktop["Electron 桌面应用"]
    Renderer["React Renderer\nsrc/renderer/src"]
    Preload["Preload Bridge\nsrc/preload/index.ts"]
    Main["Electron Main / IPC Host\nsrc/main/ipc.ts"]
  end

  subgraph MainServices["Main 进程服务层"]
    Settings["设置 / 模型配置\nSettingsStore / ModelConfigStore"]
    WorkspaceStores["本地业务 Stores\n知识库 / Prompt / 场景 / 素材 / 日志 / 批次"]
    TextService["TextGenerationService\n兼容 facade / 委托 App Server"]
    MediaService["MediaProvider\n兼容 facade / 媒体日志适配"]
    PromptAgent["AppServerPromptAgentService\nPrompt 工作台 Agent 投影"]
    SidecarService["AppServerSidecarService\nsidecar lifecycle / JSON-RPC"]
    GenerationTasks["GenerationTaskService\n后台生成任务"]
    OemUpdate["OEM / 更新服务\nAuth / Update / Release 查询"]
  end

  subgraph AppServer["Lime App Server 随包 runtime"]
    Sidecar["app-server sidecar\nstdio newline JSON-RPC"]
    RuntimeCore["RuntimeCore / session / turn / task / tool / artifact / evidence"]
    Backend["packaged external backend / tools\nresources/app-server/backend/content-backend.mjs"]
  end

  subgraph ExternalProviders["外部真实生成服务"]
    TextHttp["文字模型 HTTP\nOpenAI Chat / Anthropic Messages / Gemini"]
    ImageHttp["图片生成 HTTP\nOpenAI Responses / Chat data URI / Gemini"]
    VideoHttp["视频理解 / 生成 HTTP\nGeneric HTTP"]
  end

  subgraph LocalWorkspace["本地工作区"]
    WorkspaceDir["workspace/.content-studio"]
    Skills["workspace/.bugu/skills\n兼容扫描 .claude / .agents"]
    SourceFiles["导入文件 / 转换稿 / 产物引用"]
  end

  subgraph Distribution["发布与分发资源"]
    AppServerResources["resources/app-server\ncurrent/app-server + release manifest + backend"]
    Builder["electron-builder extraResources"]
    Releases["GitHub Release / R2 latest / OEM 下载清单"]
  end

  User --> Renderer
  Renderer --> Preload
  Preload --> Main
  Main --> Settings
  Main --> WorkspaceStores
  Main --> TextService
  Main --> MediaService
  Main --> PromptAgent
  Main --> SidecarService
  Main --> GenerationTasks
  Main --> OemUpdate

  WorkspaceStores --> WorkspaceDir
  WorkspaceStores --> SourceFiles
  PromptAgent --> Skills
  PromptAgent --> SidecarService
  SidecarService --> Sidecar
  Sidecar --> RuntimeCore
  RuntimeCore --> Backend
  Backend --> TextHttp
  Backend --> ImageHttp
  Backend --> VideoHttp
  TextService --> SidecarService
  MediaService --> SidecarService
  GenerationTasks --> WorkspaceStores

  AppServerResources --> Builder
  Builder --> Releases
  OemUpdate --> Releases
```

## 3. 分层职责

| 层级 | 代码路径 | 职责 | 禁止事项 |
| --- | --- | --- | --- |
| Renderer | `src/renderer/src/` | 页面、组件、用户交互、runtime facts 展示。 | 不直接读取 API Key，不 spawn sidecar，不读取 App Server stdout。 |
| Preload | `src/preload/index.ts` | 暴露类型化 `window.contentStudio` facade。 | 不承载业务状态，不绕过 IPC 访问 main service。 |
| Shared Contract | `src/shared/types.ts` | main / preload / renderer 的协议事实源。 | IPC 字段不能只改调用方。 |
| Electron Main | `src/main/ipc.ts` | 注册 IPC、组装服务、向 renderer 广播事件。 | 不把 UI-only state 当执行事实源。 |
| Main Services | `src/main/services/` | 本地 store、业务应用服务、Agent 投影、发布/更新服务。 | 不新增第二套 Agent runtime adapter。 |
| Providers | `src/main/providers/` | 保留未注入 App Server 时的文字、图片、视频协议化 HTTP 兼容实现；应用运行时由 App Server backend / tools 执行。 | 不在 provider 直连路径新增业务能力。 |
| Lime App Server | `resources/app-server` + `AppServerSidecarService` | Agent session / turn / runtime events / artifacts / evidence。 | 不在 renderer 中模拟 runtime 成功。 |
| Workspace | `.content-studio/` | 本地业务对象、日志、产物引用和草稿事实源。 | 不硬编码用户目录。 |

## 4. 路径治理分类

| 路径 | 当前分类 | 当前目标 | 退出条件 |
| --- | --- | --- | --- |
| `AppServerSidecarService` | `current` | 唯一 runtime 执行入口，新增 `runCapabilityTurn` 一类通用 capability 调用。 | 不适用。 |
| `AppServerPromptAgentService` | `current` | 继续作为 Prompt 工作台业务投影层，内部调用通用 capability turn。 | 不适用。 |
| `TextGenerationService` | `compat` | 兼容 facade，应用运行时内部委托 App Server `content.text.generate`。 | 所有文字生成调用不再需要未注入兼容测试后，删除旧直连 provider。 |
| `MediaProvider` | `compat` | 兼容 facade，负责旧 IPC 返回值和 generation log 适配，应用运行时委托 App Server `content.image.generate` / `content.video.generate`。 | 图片、视频 artifact 契约稳定后，缩小为纯 adapter 并删除直连 provider HTTP。 |
| `src/main/providers/textGenerationProvider.ts` | `deprecated` | 下沉为 App Server backend / tool 实现，或迁移后删除。 | 没有 main service 直接引用。 |
| `src/main/providers/imageGenerationProvider.ts` | `deprecated` | 下沉为 App Server image tool 实现，或迁移后删除。 | 图片生成、局部精修和历史重试都走 App Server artifact。 |
| 旧本地 Agent SDK runtime | `dead` | 禁止恢复。 | 不适用。 |

## 5. Runtime 架构

```mermaid
flowchart LR
  UI["Renderer Agent UI"]
  API["window.contentStudio.*\nrunTask / generateArticle / generateImage / generateVideo"]
  IPC["ipcMain\nagent:* / prompt / article / image / video"]
  SidecarSvc["AppServerSidecarService"]
  Facade["兼容 facade\nTextGenerationService / MediaProvider"]
  Sidecar["app-server --stdio --backend external"]
  Core["RuntimeCore"]
  Backend["content-backend.mjs / tools"]
  Provider["真实生成服务 HTTP\n文字 / 图片 / 视频"]
  Events["agent:event:${taskId}\nAgentPromptSession.providerEvents"]
  Logs["workspace/.content-studio\nGenerationLog / artifactRefs"]

  UI --> API
  API --> IPC
  IPC --> Facade
  IPC --> SidecarSvc
  Facade --> SidecarSvc
  SidecarSvc --> Sidecar
  Sidecar --> Core
  Core --> Backend
  Backend --> Provider
  Core --> Sidecar
  Sidecar --> SidecarSvc
  SidecarSvc --> Events
  SidecarSvc --> Logs
  Events --> UI
```

运行时不变量：

1. `agent:run` 和 Prompt 工作台都通过 App Server sidecar。
2. `agent:cancel` 映射到 `agentSession/turn/cancel`。
3. `message.delta`、`artifact.snapshot`、`turn.completed`、`turn.failed` 等事件由 main 投影给 UI。
4. 缺少 sidecar、backend 或模型 Key 时返回明确错误，不 fallback 到旧 SDK runtime。
5. 新增生成能力时，只允许新增 App Server capability / tool；旧 IPC 可以保留，但必须委托 App Server。

## 6. 目标能力分层

| Capability | 范围 | 首选迁移阶段 |
| --- | --- | --- |
| `content.text.generate` | 通用文本 / JSON 生成，替代 `TextGenerationService.generateJson` 直连。 | 已落地 |
| `content.article.generate` | 文章和平台草稿 Markdown。 | 规划 |
| `content.prompt.generate` | 提示词包、场景、Prompt 草稿。 | 规划 |
| `content.video.analyze` | 视频拆解、爆款特征提取。 | 待迁移 |
| `content.video.script.generate` | 视频脚本、质检、单镜头重写。 | 待迁移 |
| `content.image.generate` | 图片生成、输出 artifactRefs。 | 已落地 |
| `content.video.generate` | 视频生成请求、provider job、blocked 队列和下载 artifact。 | 已落地 |

## 7. 数据与产物关系

```mermaid
flowchart TD
  Input["输入源\nDOCX / Markdown / 图片 / 视频 / 表格 / 手动记录"]
  KB["品牌知识库 / IP 知识库"]
  PromptPack["提示词包"]
  Scene["场景库"]
  PromptDraft["Prompt 草稿 / Agent 会话"]
  Content["文章 / 图片 / 视频请求 / 脚本"]
  Review["素材审核 / 内容审核"]
  Library["素材库 / 历史 / 交付物"]
  Workspace["workspace/.content-studio"]

  Input --> KB
  KB --> PromptPack
  KB --> Scene
  PromptPack --> PromptDraft
  Scene --> PromptDraft
  PromptDraft --> Content
  Content --> Review
  Review --> Library
  Input --> Workspace
  KB --> Workspace
  PromptPack --> Workspace
  Scene --> Workspace
  PromptDraft --> Workspace
  Content --> Workspace
  Review --> Workspace
  Library --> Workspace
```

## 8. 发布资源架构

```mermaid
flowchart LR
  Manifest["App Server release manifest"]
  Prepare["npm run app-server:prepare:release\n校验 sha256"]
  Resources["resources/app-server/current/app-server\nresources/app-server/app-server.release.json\nresources/app-server/backend/content-backend.mjs"]
  Build["electron-builder extraResources"]
  Artifact["macOS / Windows / Linux 安装包"]
  Smoke["smoke:app-server\nDMG / .app resources 验证"]

  Manifest --> Prepare
  Prepare --> Resources
  Resources --> Build
  Build --> Artifact
  Artifact --> Smoke
```

发布不变量：

1. 生产包必须携带 `app-server` binary、release manifest 和 packaged backend。
2. `APP_SERVER_BIN` 只用于开发 / 测试覆盖，且不能抢占 packaged resources。
3. OEM 打包前必须检查 App Server 资源存在。
4. macOS 当前默认 unsigned internal preview，正式签名另开任务处理。

## 9. 关键验收命令

```bash
npm run typecheck
npm run build
npm run app-server:backend:test
npm run smoke:app-server
npm run smoke:electron
npm run verify:local
```

发布或打包变更还必须按目标平台执行 `npm run dist:*`。
