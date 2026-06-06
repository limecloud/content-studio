# 布谷AI内容工厂 v1 架构与流程图

更新时间：2026-05-19
状态：Archived historical source

> 归档说明：本文件保留 v1 阶段架构图，包含已废弃的本地 SDK runtime 设想。当前架构图以 `docs/roadmap/v2/architecture-diagrams.md` 和 `docs/roadmap/limeagent/` 为准：Renderer 只经 Preload / IPC 进入 Electron Desktop Host，由 main 侧通过 Lime App Server JSON-RPC 连接 RuntimeCore / backend，且 Lime `app-server` sidecar 随内容工厂打包。

## 1. 设计结论

v1 的核心链路是「已成型知识库 -> 品牌 / 产品提示词包 -> 产品场景库 -> 文案 / 脚本 / 图片提示词 -> 图片素材 -> 视频素材 / 视频生成队列」。

第一期不做策略分析、不抓竞品、不抓差评、不自动搭建知识库；系统只消费已经整理好的产品型知识库和个人 IP 型知识库。

## 2. 系统架构图

```mermaid
flowchart LR
  subgraph Renderer[Electron Renderer]
    Workbench[三栏工作台 Shell]
    Article[文章生成]
    KB[已成型知识库]
    PromptPack[品牌提示词包]
    Scene[产品场景库]
    Image[图片生成]
    Video[视频生成]
    Assets[素材库 / 生成历史]
    能力UI[skills 管理]
    SettingsUI[模型配置]
  end

  subgraph Preload[Preload API]
    IPC[类型化 IPC Bridge]
  end

  subgraph Main[Electron Main]
    Settings[SettingsStore]
    ModelConfig[ModelConfigStore]
    能力Manager[SkillManager]
    能力Selection[SkillSelectionStore]
    KBStore[KnowledgeBaseStore]
    PromptPackService[PromptPackService]
    SceneStore[SceneLibraryStore]
    ArticleService[ArticleGenerationService]
    TextRouter[TextGenerationService / TextProviderRouter]
    Media生成服务[Media生成服务 Adapter]
    ImageRouter[ImageGeneration生成服务]
    GenerationLog[GenerationLogStore]
  end

  subgraph Local[本地 工作区]
    KBDocs[DOCX / MD / TXT / JSON 知识库]
    能力Files[.claude/skills]
    AssetFiles[生成素材文件]
    Logs[生成日志]
  end

  subgraph Models[模型 / SDK]
    Claude[Claude SDK / Anthropic Messages]
    OpenAI[OpenAI Chat / Responses]
    Gemini[Gemini GenerateContent]
    VideoModel[视频模型]
  end

  Workbench --> Article
  Workbench --> KB
  Workbench --> PromptPack
  Workbench --> Scene
  Workbench --> Image
  Workbench --> Video
  Workbench --> Assets
  Workbench --> 能力UI
  Workbench --> SettingsUI

  Article --> IPC
  KB --> IPC
  PromptPack --> IPC
  Scene --> IPC
  Image --> IPC
  Video --> IPC
  Assets --> IPC
  能力UI --> IPC
  SettingsUI --> IPC

  IPC --> Settings
  IPC --> ModelConfig
  IPC --> 能力Manager
  IPC --> 能力Selection
  IPC --> KBStore
  IPC --> PromptPackService
  IPC --> SceneStore
  IPC --> ArticleService
  IPC --> TextRouter
  IPC --> Media生成服务
  IPC --> GenerationLog

  KBStore --> KBDocs
  能力Manager --> 能力Files
  GenerationLog --> Logs
  Media生成服务 --> AssetFiles

  PromptPackService --> TextRouter
  SceneStore --> TextRouter
  ArticleService --> TextRouter
  TextRouter --> Claude
  TextRouter --> OpenAI
  TextRouter --> Gemini
  Media生成服务 --> ImageRouter
  ImageRouter --> OpenAI
  ImageRouter --> Gemini
  Media生成服务 --> VideoModel
```

## 3. 内容工程流程图

```mermaid
flowchart TD
  Start([开始]) --> SelectKB[选择产品型 / 个人 IP 型成型知识库]
  SelectKB --> ImportKB{是否需要导入文件?}
  ImportKB -- 是 --> ImportDoc[导入 DOCX / MD / TXT / JSON]
  ImportKB -- 否 --> BuiltinKB[使用内置样例知识库]
  ImportDoc --> IndexKB[建立本地索引和章节结构]
  BuiltinKB --> IndexKB

  IndexKB --> PickCitation[选择知识引用片段]
  PickCitation --> BuildPrompt[生成品牌 / 产品提示词包]
  BuildPrompt --> BuildScene[生成产品场景库]

  BuildScene --> ArticleFlow[生成文章 / 种草文 / 详情页文案]
  BuildScene --> ScriptFlow[生成短视频脚本 / 口播]
  BuildScene --> ImagePrompt[生成图片提示词]
  BuildScene --> VideoPrompt[生成视频提示词]

  ImagePrompt --> ImageGen[图片模型生成图片素材]
  ImageGen --> ImageAssets[图片素材入库]
  ScriptFlow --> VideoInput[脚本 + 场景 + 素材]
  VideoPrompt --> VideoInput
  ImageAssets --> VideoInput
  VideoInput --> VideoGen[视频生成队列]

  ArticleFlow --> History[生成历史 / 素材库]
  ImageAssets --> History
  VideoGen --> History
  History --> Review[回看 / 导出 / 复用参数]
  Review --> End([结束])
```

## 4. 知识库接入时序图

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant R as Renderer 知识库页
  participant P as Preload IPC
  participant K as KnowledgeBaseStore
  participant F as 工作区 文件
  participant L as GenerationLogStore

  U->>R: 选择内置知识库或导入成型文件
  R->>P: knowledge:importOrSelect(input)
  P->>K: importOrSelect(input)
  K->>F: 读取 DOCX / MD / TXT / JSON
  K->>K: 解析章节、类型、标签、摘要
  K->>F: 写入本地索引
  K-->>P: KnowledgeBaseView
  P-->>R: 展示知识库结构
  U->>R: 搜索关键词 / 标签 / 章节类型
  R->>P: knowledge:search(query)
  P->>K: search(query)
  K-->>R: 匹配片段
  U->>R: 选择引用片段
  R->>P: knowledge:selectCitation(citation)
  P->>L: 记录引用选择事件
```

## 5. 品牌提示词包与场景库时序图

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant R as Renderer 场景库页
  participant P as Preload IPC
  participant K as KnowledgeBaseStore
  participant S as 能力SelectionStore
  participant T as TextGenerationService / ProviderRouter
  participant PP as PromptPackService
  participant SC as SceneLibraryStore
  participant L as GenerationLogStore

  U->>R: 选择知识引用并点击生成提示词包
  R->>P: promptPack:generate(citations)
  P->>K: resolveCitations(citations)
  K-->>P: 引用原文和章节类型
  P->>S: getEnabled能力(工作区)
  S-->>P: brand-voice / citation-picker 等 能力
  P->>T: generateJson(提示词包生成任务)
  T-->>PP: 品牌口吻、视觉风格、合规边界、平台约束
  PP->>L: 记录提示词包生成
  PP-->>R: PromptPack

  U->>R: 基于提示词包生成产品场景库
  R->>P: scene:generate(promptPackId, citations)
  P->>T: generateJson(场景库生成任务)
  T-->>SC: 人群、痛点、场景、画面、卖点、口播、素材建议
  SC->>L: 记录场景卡生成
  SC-->>R: SceneCards
```

## 6. 图片素材生成时序图

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant R as Renderer 图片生成
  participant P as Preload IPC
  participant SC as SceneLibraryStore
  participant PP as PromptPackService
  participant M as Media生成服务
  participant I as ImageGeneration生成服务 / 图片协议生成服务
  participant A as 素材库
  participant L as GenerationLogStore

  U->>R: 选择场景卡、产品图、参考图
  R->>P: image:buildPrompt(sceneId, promptPackId, params)
  P->>SC: getScene(sceneId)
  P->>PP: getPromptPack(promptPackId)
  SC-->>P: 场景卡
  PP-->>P: 图片提示词片段和合规边界
  P-->>R: 图片提示词草稿
  U->>R: 编辑提示词并启动渲染
  R->>P: image:generate(request)
  P->>M: generateImage(request)
  M->>I: 按 openai-responses / openai-chat-data-uri / gemini-generate-content 调用
  I-->>M: 图片 data URI / inlineData / 错误
  M->>A: 保存图片素材
  M->>L: 写入输入、模型、知识引用、场景卡、错误或结果
  M-->>R: 图片预览 / 错误态
```

## 7. 图片素材到视频生成时序图

```mermaid
sequenceDiagram
  autonumber
  participant U as 用户
  participant R as Renderer 视频生成
  participant P as Preload IPC
  participant A as 素材库
  participant SC as SceneLibraryStore
  participant T as TextGenerationService / ProviderRouter
  participant M as Media生成服务
  participant V as 视频模型
  participant L as GenerationLogStore

  U->>R: 选择图片素材、场景卡、脚本或参考视频拆解
  R->>P: video:preparePrompt(input)
  P->>A: getAssets(imageAssetIds)
  P->>SC: getScene(sceneId)
  P->>T: generateJson(视频提示词 / 镜头脚本整理任务)
  T-->>P: 视频提示词、镜头、节奏、字幕和素材映射
  P-->>R: 视频生成草稿
  U->>R: 编辑视频提示词并加入队列
  R->>P: video:enqueue(request)
  P->>M: generateVideo(request)
  M->>V: 调用视频模型或返回未配置错误
  V-->>M: 视频任务状态 / 结果
  M->>L: 写入素材、脚本、场景卡、模型和状态
  M-->>R: 队列状态和历史记录
```

## 8. 数据关系图

```mermaid
erDiagram
  KNOWLEDGE_BASE ||--o{ KNOWLEDGE_SECTION : contains
  KNOWLEDGE_SECTION ||--o{ KNOWLEDGE_CITATION : selected_as
  KNOWLEDGE_CITATION ||--o{ PROMPT_PACK : derives
  PROMPT_PACK ||--o{ SCENE_CARD : derives
  SCENE_CARD ||--o{ ARTICLE_DRAFT : generates
  SCENE_CARD ||--o{ IMAGE_ASSET : generates
  SCENE_CARD ||--o{ VIDEO_SCRIPT : generates
  IMAGE_ASSET ||--o{ VIDEO_TASK : feeds
  VIDEO_SCRIPT ||--o{ VIDEO_TASK : feeds
  PROMPT_PACK ||--o{ GENERATION_LOG : references
  SCENE_CARD ||--o{ GENERATION_LOG : references
  KNOWLEDGE_CITATION ||--o{ GENERATION_LOG : references

  KNOWLEDGE_BASE {
    string id
    string baseType
    string title
    string sourcePath
    string createdAt
  }

  KNOWLEDGE_SECTION {
    string id
    string sectionType
    string title
    string content
    string tags
  }

  PROMPT_PACK {
    string id
    string name
    string voice
    string visualStyle
    string complianceBoundary
  }

  SCENE_CARD {
    string id
    string audience
    string painPoint
    string scene
    string sellingPoint
    string materialSuggestion
  }

  GENERATION_LOG {
    string id
    string type
    string model
    string status
    string createdAt
  }
```

## 9. v1 与后续版本边界

```mermaid
flowchart LR
  subgraph V1[v1 做]
    A[已成型知识库接入]
    B[关键词 / 标签 / 章节检索]
    C[手动选择引用]
    D[品牌提示词包]
    E[产品场景库]
    F[文章 / 图片 / 视频生成]
    G[本地素材库和生成历史]
  end

  subgraph Future[后续版本]
    H[竞品抓取]
    I[用户差评采集]
    J[店铺诊断]
    K[策略报告]
    L[AI 自动搭建知识库]
    M[向量 向量检索]
    N[批量处理 / 定时任务]
    O[云端协作知识库]
  end

  A --> B --> C --> D --> E --> F --> G
  H -.后置.-> K
  I -.后置.-> K
  J -.后置.-> K
  K -.后置.-> L
  L -.后置.-> M
```
