# 布谷AI内容工厂 v2 架构与流程图

更新时间：2026-06-06
状态：Current planning source

## 1. 设计结论

v2 的架构核心是「知识体系」「场景库」「Prompt 工作台」「工作流服务」和「产物登记」。品牌 / 产品知识库先生成 `PromptPack`，再生成 `SceneLibrary`，再生成 `PromptDraft` / `PromptGroup`；IP 素材先生成 `IpKnowledgeBase`，再延伸出 IP 运营场景库。参考图、参考视频、产品资料、SKU 表和竞品内容仍通过 `WorkflowInputSource` 进入大模型玩法。

底层 Agent 架构统一遵循 Lime App Server 路线：`Frontend / Electron Renderer -> Electron Desktop Host IPC -> Lime App Server JSON-RPC -> RuntimeCore / backend`。Electron Renderer 只做工作台 UI 和 runtime facts 投影；Preload 只暴露类型化 facade；Electron Main 是 Desktop Host，负责 IPC、sidecar 生命周期、JSON-RPC client、事件投影和本地内容工厂 store 协调；真正的多轮 Agent 运行、工具调度、权限事实、artifact 和 evidence 都来自 Lime App Server 的 RuntimeCore / backend。

当前落地版本已经具备协议化文字 provider、DOCX / Markdown 输入源抽取、PromptDraft 版本、AgentPromptSessionStore 会话、ReferenceReverseService 真实视觉反推、SOP 最小顺序执行器、知识引用随运行记录保存、品牌场景 SOP、图片生成后自动送审、素材审核、视频 Prompt 人工复制、成品视频导入、绿幕图和混剪包导出。Agent runtime 已收敛到 `AppServerSidecarService + AppServerPromptAgentService`：`agent:run` / Prompt 工作台会话通过 App Server JSON-RPC 进入 RuntimeCore / packaged external backend，再把 `agentSession/event`、artifact 和 evidence 投影回现有 UI；旧第三方 Agent runtime 与本地 SDK runtime 均归类为 `dead`，不再作为接入路径。

## 2. 系统架构图

```mermaid
flowchart LR
  subgraph Renderer[Electron Renderer]
    Shell[三栏工作台 Shell]
    PromptStudio[Prompt 工作台]
    KnowledgeHub[知识中台]
    SceneView[场景库页]
    IpView[IP 知识库页]
    Reverse[对标反推页]
    SOP[SOP 执行页]
    Canvas[Canvas 编排视图]
    Review[人工审核台]
    Assets[素材库]
    Settings["模型 / Provider 设置"]
  end

  subgraph Preload[Preload API]
    IPC[类型化 IPC Bridge]
  end

  subgraph Main[Electron Main / Desktop Host]
    InputSource[WorkflowInputSourceStore]
    AgentSession[AgentPromptSessionStore]
    PromptDraft[PromptDraftStore]
    BrandKB[BrandKnowledgeBaseStore]
    IpKB[IpKnowledgeBaseStore]
    PromptGroup[PromptPack / Scene / PromptDraft 组合]
    WorkflowDef[WorkflowDefinitionStore]
    WorkflowRun[WorkflowRunStore]
    WorkflowEngine[WorkflowEngine]
    AppServerPrompt[AppServerPromptAgentService]
    AppServerSidecar[AppServerSidecarService]
    JsonRpcClient[App Server JSON-RPC Client]
    PermissionProjection[Permission / Action Projection]
    SkillRegistry["SkillManager / Skill Catalog"]
    AgentEvents[AgentEvent Projection]
    ArtifactEvidence[Artifact / Evidence Projection]
    ArtifactStore[WorkflowArtifactStore（规划中）]
    KB[KnowledgeBaseStore]
    PromptPack[PromptPackService]
    Scene[SceneLibraryStore]
    ReferenceReverse[ReferenceReverseService]
    AssetReview[AssetReviewStore]
    MixPackage[MixPackageStore]
    Text[TextGenerationService]
    Vision[VisionAnalysisService]
    Image[ImageProvider]
    Video[VideoProvider]
    Export[ExportPackageService]
    Logs[GenerationLogStore]
    ModelConfig[ModelConfigStore]
  end

  subgraph Local[工作区文件]
    InputSources[input-sources.json]
    BrandKnowledge[brand-knowledge-bases.json]
    IpKnowledge[ip-knowledge-bases.json]
    SceneCards[scene-cards.json]
    PromptPacks[prompt-packs.json]
    Sessions[agent-prompt-sessions.json]
    Drafts[prompt-drafts.json]
    SkillDefs["skill-definitions.json / .bugu/skills"]
    Definitions[workflow-definitions.json]
    Runs[workflow-runs.json]
    AssetReviews[asset-reviews.json]
    MixPackages[mix-packages.json]
    Artifacts[workflow-artifacts.json（规划中）]
    AssetFiles["assets/"]
    LogFiles[generation-logs.json]
  end

  subgraph AppServer[Lime App Server JSON-RPC]
    AppServerBinary["app-server sidecar --stdio"]
    RuntimeCore[RuntimeCore]
    ExecutionBackend[ExecutionBackend]
    PackagedBackend["content-backend.mjs"]
    RuntimeEvents["agentSession/event"]
    RuntimeArtifacts["artifact/read"]
    RuntimeEvidence["evidence/export"]
  end

  subgraph Providers[协议化模型与人工外部工具]
    TextModel["Anthropic Messages / OpenAI Chat / Gemini GenerateContent"]
    VisionModel["多模态理解 HTTP provider"]
    ImageModel[图片生成服务]
    VideoAPI["Vidu / Runway / Generic HTTP 视频 API"]
    External["RunningHub / 第三方视频平台"]
    Mix[第三方混剪软件]
  end

  Shell --> SOP
  Shell --> PromptStudio
  Shell --> KnowledgeHub
  Shell --> SceneView
  Shell --> IpView
  Shell --> Reverse
  Shell --> Canvas
  Shell --> Review
  Shell --> Assets
  Shell --> Settings

  PromptStudio --> IPC
  KnowledgeHub --> IPC
  SceneView --> IPC
  IpView --> IPC
  Reverse --> IPC
  SOP --> IPC
  Canvas --> IPC
  Review --> IPC
  Assets --> IPC
  Settings --> IPC

  IPC --> InputSource
  IPC --> AgentSession
  IPC --> PromptDraft
  IPC --> BrandKB
  IPC --> IpKB
  IPC --> Scene
  IPC --> PromptGroup
  IPC --> WorkflowDef
  IPC --> WorkflowRun
  IPC --> WorkflowEngine
  IPC --> AppServerSidecar
  IPC --> AssetReview
  IPC --> MixPackage
  IPC --> ModelConfig

  WorkflowEngine --> InputSource
  WorkflowEngine --> AgentSession
  WorkflowEngine --> PromptDraft
  WorkflowEngine --> KB
  WorkflowEngine --> BrandKB
  WorkflowEngine --> IpKB
  WorkflowEngine --> PromptPack
  WorkflowEngine --> Scene
  WorkflowEngine --> PromptGroup
  WorkflowEngine --> AppServerPrompt
  WorkflowEngine --> Text
  WorkflowEngine --> Vision
  WorkflowEngine --> Image
  WorkflowEngine --> Video
  WorkflowEngine --> Export
  WorkflowEngine --> Logs
  WorkflowEngine --> ReferenceReverse
  WorkflowEngine --> AssetReview

  AppServerPrompt --> AppServerSidecar
  AppServerSidecar --> JsonRpcClient
  JsonRpcClient --> AppServerBinary
  AppServerBinary --> RuntimeCore
  RuntimeCore --> ExecutionBackend
  ExecutionBackend --> PackagedBackend
  PackagedBackend --> TextModel
  RuntimeCore --> RuntimeEvents
  RuntimeCore --> RuntimeArtifacts
  RuntimeCore --> RuntimeEvidence
  RuntimeEvents --> AgentEvents
  RuntimeArtifacts --> ArtifactEvidence
  RuntimeEvidence --> ArtifactEvidence
  AgentEvents --> PermissionProjection
  PermissionProjection --> AgentSession
  ArtifactEvidence --> AgentSession
  ArtifactEvidence --> WorkflowRun
  ArtifactEvidence --> PromptDraft
  AppServerPrompt --> AgentSession
  AppServerPrompt --> PromptDraft
  AppServerSidecar --> AgentEvents
  AppServerSidecar --> ArtifactEvidence
  AppServerSidecar --> IPC
  AppServerPrompt --> SkillRegistry
  AgentEvents --> AgentSession
  AgentEvents --> WorkflowRun
  AgentEvents --> IPC

  AgentSession --> AppServerPrompt
  AgentSession --> Text
  AgentSession --> Vision
  PromptDraft --> PromptPack
  ReferenceReverse --> PromptDraft

  InputSource --> InputSources
  BrandKB --> BrandKnowledge
  IpKB --> IpKnowledge
  Scene --> SceneCards
  PromptPack --> PromptPacks
  AgentSession --> Sessions
  PromptDraft --> Drafts
  SkillRegistry --> SkillDefs
  WorkflowDef --> Definitions
  WorkflowRun --> Runs
  AssetReview --> AssetReviews
  MixPackage --> MixPackages
  ArtifactStore --> Artifacts
  ArtifactStore --> AssetFiles
  Logs --> LogFiles

  Text --> TextModel
  Vision --> VisionModel
  Image --> ImageModel
  Video --> VideoAPI
  Video --> External
  Export --> Mix
```

## 3. Lime App Server JSON-RPC Agent Runtime 架构图

Lime 路线的关键约束是：Frontend 不拥有 runtime，Electron Desktop Host 不实现第二套 runtime，App Server JSON-RPC 是唯一 runtime 通道。会话、thread、turn、tool、action、artifact 和 evidence 都是 RuntimeCore / backend facts；content-studio 只把这些 facts 投影到 `AgentPromptSession`、`WorkflowRun`、`PromptDraft` 和 UI。

```mermaid
flowchart TD
  subgraph UI[Electron Renderer]
    Chat["Prompt 工作台 / Agent 会话"]
    Form[SOP 表单执行]
    SkillUI[Skill 管理]
    ReviewUI["运行详情 / 审核台"]
  end

  subgraph Preload[Preload Typed Facade]
    RunFacade["contentStudio.runAgentTask"]
    CancelFacade["contentStudio.cancelAgentTask"]
    HealthFacade["contentStudio.getAppServerHealth"]
    SmokeFacade["contentStudio.runAppServerSmoke"]
  end

  subgraph Host[Electron Main / Desktop Host IPC]
    AgentRun["ipcMain agent:run"]
    AgentCancel["ipcMain agent:cancel"]
    HealthIPC["ipcMain appServer:health"]
    SmokeIPC["ipcMain appServer:smoke"]
    SessionStore[AgentPromptSessionStore]
    RunStore[WorkflowRunStore]
    PromptDraftStore[PromptDraftStore]
    SkillRegistry["SkillManager / Skill Catalog"]
    SourceResolver["InputSource / Knowledge Resolver"]
    PromptAgent[AppServerPromptAgentService]
    SidecarService[AppServerSidecarService]
    JsonRpcClient["App Server JSON-RPC stdio client"]
    EventMapper["Runtime Event Projection"]
    ArtifactMapper["Artifact / Evidence Projection"]
  end

  subgraph AppServer[Lime App Server]
    Initialize["initialize / initialized"]
    Capability["capability/list"]
    SessionStart["agentSession/start"]
    TurnStart["agentSession/turn/start"]
    TurnCancel["agentSession/turn/cancel"]
    RuntimeEvent["agentSession/event notification"]
    ArtifactRead["artifact/read"]
    EvidenceExport["evidence/export"]
    RuntimeCore[RuntimeCore]
    Backend["ExecutionBackend / packaged external backend"]
  end

  subgraph Workspace[工作区事实源]
    Docs["DOCX / Markdown / 原始素材"]
    Skills[".bugu/skills / skill-definitions.json"]
    Sessions[agent-prompt-sessions.json]
    Runs[workflow-runs.json]
    Drafts[prompt-drafts.json]
    Artifacts[workflow-artifacts.json（规划中）]
  end

  Chat --> RunFacade
  Form --> RunFacade
  SkillUI --> RunFacade
  ReviewUI --> CancelFacade
  RunFacade --> AgentRun
  CancelFacade --> AgentCancel
  HealthFacade --> HealthIPC
  SmokeFacade --> SmokeIPC

  AgentRun --> SidecarService
  AgentCancel --> SidecarService
  HealthIPC --> SidecarService
  SmokeIPC --> SidecarService
  PromptAgent --> SidecarService
  PromptAgent --> SourceResolver
  PromptAgent --> SkillRegistry
  PromptAgent --> SessionStore
  PromptAgent --> PromptDraftStore
  SourceResolver --> Docs
  SkillRegistry --> Skills

  SidecarService --> JsonRpcClient
  JsonRpcClient --> Initialize
  JsonRpcClient --> Capability
  JsonRpcClient --> SessionStart
  JsonRpcClient --> TurnStart
  JsonRpcClient --> TurnCancel
  JsonRpcClient --> RuntimeEvent
  JsonRpcClient --> ArtifactRead
  JsonRpcClient --> EvidenceExport
  Initialize --> RuntimeCore
  Capability --> RuntimeCore
  SessionStart --> RuntimeCore
  TurnStart --> RuntimeCore
  TurnCancel --> RuntimeCore
  RuntimeCore --> Backend
  Backend --> RuntimeEvent
  Backend --> ArtifactRead
  Backend --> EvidenceExport

  RuntimeEvent --> EventMapper
  ArtifactRead --> ArtifactMapper
  EvidenceExport --> ArtifactMapper
  EventMapper --> SessionStore
  EventMapper --> RunStore
  EventMapper --> ReviewUI
  ArtifactMapper --> PromptDraftStore
  ArtifactMapper --> RunStore
  EventMapper --> ReviewUI

  SessionStore --> Sessions
  RunStore --> Runs
  PromptDraftStore --> Drafts
  ArtifactMapper --> Artifacts
```

运行约束：

- `AgentPromptSession` 是多轮 Prompt 生产的本地投影边界，保存用户意图、Agent 追问、来源引用、App Server session / turn id 和事件。
- `WorkflowRun` 是 SOP 执行边界，引用一个或多个 `AgentPromptSession`、`SkillRun` 和 artifact。
- RuntimeCore / backend 可以按 App Server policy 调用工具、生成 artifact 和导出 evidence；所有 `*.failed`、`action.required`、tool、artifact 事件都必须映射为可审计的 `AgentEvent` 或 `executionEvents`。
- Electron Main 只负责 JSON-RPC client、生命周期和投影，不在 content-studio 内重写 RuntimeCore、ExecutionBackend 或第二套 runtime adapter。
- Renderer 不直接 spawn sidecar、不读取 stdout、不持有 JSON-RPC message；它只能消费 Preload 暴露的 typed facade 和业务事件投影。
- 文本、视觉、图片、视频模型仍走各自显式 HTTP provider；Agent runtime 统一由 App Server 调度，不再保留旧第三方 Agent runtime 或本地 SDK runtime fallback。

## 4. 通用 SOP 执行流程

```mermaid
flowchart TD
  Start([选择 SOP]) --> Input["填写输入字段 / 上传素材"]
  Input --> Source["选择知识体系或输入源: 品牌知识库 / IP 知识库 / 场景库 / 参考图 / 参考视频 / 产品资料 / SKU / 竞品内容"]
  Source --> SourceKind{输入源类型}

  SourceKind -- 品牌 / 产品知识库 --> BrandScene[抽取场景库]
  SourceKind -- IP 知识库 --> IpScene[生成 IP 运营场景库]
  SourceKind -- 知识库文档 --> AgentRead[Agent 读取文档]
  SourceKind -- 参考图 --> ImageReverse["反推构图 / 风格 / 图片 Prompt"]
  SourceKind -- 参考视频 --> VideoReverse["拆解镜头 / 脚本 / 节奏"]
  SourceKind -- 产品资料 / SKU --> Brief[结构化产品变量]
  SourceKind -- 竞品 / 评论 --> Competitor["拆解结构 / 聚类痛点"]

  BrandScene --> PromptGroup[提示词组]
  IpScene --> PromptGroup
  PromptGroup --> PromptDraft[Prompt 草稿]
  AgentRead --> PromptDraft
  ImageReverse --> PromptDraft
  VideoReverse --> PromptDraft
  Brief --> PromptDraft
  Competitor --> PromptDraft

  PromptDraft --> Refine["用户多轮调整 / 确认"]
  Refine --> RunSteps[执行工作流步骤]

  RunSteps --> Copy["生成文案 / 标题 / 脚本"]
  RunSteps --> Image["生成图片 / 绿幕文案图"]
  RunSteps --> VideoPrompt[生成视频 Prompt]
  RunSteps --> Quality["模型质检 / 评分"]

  Copy --> Quality
  Image --> Quality
  VideoPrompt --> Quality
  Quality --> Review[人工审核]

  Review --> Decision{审核通过?}
  Decision -- 否 --> Regenerate["改 Prompt / 定向重生成"]
  Regenerate --> Refine
  Decision -- 是 --> Tag[素材打标]
  Tag --> Assets[进入素材库]
  Assets --> Export["导出平台草稿 / 混剪素材包"]
  Export --> End([结束])
```

## 5. 视频生成路径

```mermaid
flowchart TD
  VideoInput[视频提示词 + 图片素材 + 时长 + 画幅] --> Mode{生成模式}

  Mode -- 内部 API --> Internal[调用 VideoProvider internal-api]
  Internal --> CostCheck["记录模型 / 成本 / 状态"]
  CostCheck --> Clip[写入 15 秒视频素材]

  Mode -- 人工外部平台 --> CopyPrompt[复制视频 Prompt]
  CopyPrompt --> UserRun["用户在 RunningHub / 第三方平台生成"]
  UserRun --> OutsideEnd([外部流程结束])
  UserRun -. 可选 .-> Import[手动导入成品视频文件]
  Import --> Clip

  CopyPrompt --> PromptArtifact[登记 WorkflowArtifact: video-prompt]
  Clip --> Artifact[登记 WorkflowArtifact: video-clip]
  Artifact --> Review[人工审核]
  Review --> Library[素材库]
```

## 6. 素材沉淀流程

```mermaid
flowchart LR
  BrandSource[BrandKnowledgeBase] --> SceneCards[SceneLibrary]
  IpSource[IpKnowledgeBase] --> SceneCards
  SceneCards --> PromptGroups[PromptPack / Scene / PromptDraft 组合]
  PromptGroups --> Run[WorkflowRun]
  Sources[WorkflowInputSource] --> Run
  Session[AgentPromptSession] --> Run
  Draft[PromptDraft] --> Run
  Run[WorkflowRun] --> Artifacts[WorkflowArtifact（规划中）]
  Logs[GenerationLog] --> Artifacts
  SourceRefs[WorkflowSourceRef] --> Artifacts
  Params[模型参数] --> Artifacts

  Artifacts --> Tag["标签 / 平台 / 状态"]
  Tag --> Library[素材库]
  Library --> Reuse[复用到下一次 SOP]
  Library --> Reverse["成功素材反向沉淀 Prompt / Skill"]
  Library --> Package[导出素材包]
```

## 7. Canvas 与事实源关系

```mermaid
flowchart LR
  Json[WorkflowDefinition JSON] --> Engine[WorkflowEngine]
  Json --> Form[SOP 表单视图]
  Json --> Canvas[Canvas 视图]

  Canvas -- 编辑节点 / 连线 --> Json
  Form -- 执行固定 SOP --> Engine
  Engine --> Run[WorkflowRun]
  Run --> Detail[运行详情视图]
```

原则：

- `WorkflowDefinition JSON` 是事实源。
- canvas 只能读写定义，不能成为唯一存储。
- 表单视图和 canvas 必须使用同一份定义。
- 运行时只读 definition snapshot，避免执行中被编辑影响。

## 8. Provider 边界

```mermaid
flowchart TD
  WorkflowEngine --> TextProvider
  WorkflowEngine --> VisionProvider
  WorkflowEngine --> ImageProvider
  WorkflowEngine --> VideoProvider
  WorkflowEngine --> PromptExport
  WorkflowEngine --> ExportProvider

  TextProvider --> AnthropicText["Anthropic Messages HTTP"]
  TextProvider --> OpenAIText[OpenAI Chat]
  TextProvider --> GeminiText[Gemini GenerateContent]

  VisionProvider --> AnthropicVision["Anthropic Messages Vision HTTP"]
  VisionProvider --> OpenAIVision["OpenAI / GPT Image 理解"]
  VisionProvider --> GeminiVision[Gemini 多模态]

  ImageProvider --> GPTImage["GPT Image / Responses"]
  ImageProvider --> SD[Stable Diffusion 兼容端点]
  ImageProvider --> GeminiImage[Gemini Image]

  PromptExport --> PromptText["复制视频 Prompt / 导出 Markdown"]
  VideoProvider --> InternalVideo["Vidu / Runway / 其他 API"]
  VideoProvider --> ManualImport[手动导入成品视频]

  ExportProvider --> Manifest["JSON / CSV / XMP"]
  ExportProvider --> Folder[素材文件夹]
```

## 9. 错误与 blocked 状态

| 场景 | 状态 | 要求 |
| --- | --- | --- |
| 文字模型未配置 | `blocked` | 不生成伪文案，记录原因。 |
| 多模态理解模型未配置 | `blocked` | 对标图 / 视频反推不能伪造分析。 |
| 图片 provider 未配置 | `blocked` | 不生成占位图。 |
| 视频内部 API 未配置 | `blocked` | 内部生成不可用，但仍可复制视频 Prompt 到第三方平台。 |
| 第三方视频未导入 | 无运行状态 | 第三方流程脱离软件；软件只保留视频 Prompt 和复制记录。 |
| 审核驳回 | `rejected` | 保留产物和原因，可重生成。 |

## 10. 数据文件建议

```text
.content-studio/
  workflow-input-sources.json
  agent-prompt-sessions.json
  prompt-drafts.json
  workflow-definitions.json
  workflow-runs.json
  workflow-artifacts.json
  generation-logs.json
  prompt-packs.json
  scene-cards.json
  assets/
    images/
    videos/
    green-screen/
    mix-packages/
```
