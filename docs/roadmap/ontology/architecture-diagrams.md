# 布谷AI内容工厂 Ontology 架构与流程图

更新时间：2026-05-28  
状态：Draft

## 1. 设计结论

Ontology 是 Content Studio 的内容工程中间层，不是独立图数据库产品。它位于输入源 / 知识库和场景库 / Prompt 工作台 / SOP / 素材库之间，负责把原始资料变成可审核、可追溯、可复用的概念、关系、主张、证据、约束和覆盖矩阵。

在此之上，Operational Ontology 把品牌舆论和获客动作纳入同一操作层：Signal 触发 Objective，Objective 组合 CampaignCell 和 ResourceBundle，标准 ActionType 经过 DecisionGate 后执行，并通过 ActionLog 和 FeedbackLoop 回写 Ontology。

内部事实源优先落在 `.content-studio/` 的本地 JSON 文件。对外发布时导出 Agent Knowledge v0.7.2 ontology-aware 知识包；互操作场景再导出 JSON-LD / RDF / Turtle。

## 2. 总体架构图

```mermaid
flowchart LR
  subgraph Renderer["Electron Renderer"]
    Shell["三栏工作台 Shell"]
    OntologyUI["Ontology 工作台"]
    ReviewUI["审核任务"]
    MatrixUI["卖点 / 场景覆盖矩阵"]
    CampaignUI["内容作战单元"]
    ActionUI["ActionLog / 复盘"]
    PromptUI["Prompt 工作台"]
    SceneUI["场景库"]
    SopUI["SOP 执行"]
    AssetUI["素材库"]
  end

  subgraph Preload["Preload API"]
    IPC["类型化 IPC Bridge"]
  end

  subgraph Main["Electron Main"]
    InputSourceStore["WorkflowInputSourceStore"]
    BrandKBStore["BrandKnowledgeBaseStore"]
    IpKBStore["IpKnowledgeBaseStore"]
    OntologyStore["OntologyStore"]
    OntologyRunStore["OntologyRunStore"]
    OntologyReviewStore["OntologyReviewStore"]
    ExtractionService["OntologyExtractionService"]
    CoverageService["OntologyCoverageService"]
    ValidationService["OntologyValidationService"]
    PublishService["OntologyPublishService"]
    ActionLogStore["OntologyActionLogStore"]
    OperationalService["OperationalOntologyService"]
    DecisionGateService["DecisionGateService"]
    AgentKnowledgeExport["AgentKnowledgeOntologyExportService"]
    PromptDraftStore["PromptDraftStore"]
    SceneStore["SceneLibraryStore"]
    WorkflowEngine["WorkflowEngine"]
    AssetReviewStore["AssetReviewStore"]
    TextService["TextGenerationService"]
    ModelConfig["ModelConfigStore"]
  end

  subgraph Local[".content-studio 工作区"]
    InputFiles["input-sources.json / 原始文件"]
    BrandKB["brand-knowledge-bases.json"]
    IpKB["ip-knowledge-bases.json"]
    OntologyFiles["ontologies/*.json"]
    RunFiles["ontology-runs.json"]
    ReviewFiles["ontology-reviews.json"]
    ActionFiles["ontology-actions.json"]
    SceneCards["scene-cards.json"]
    PromptDrafts["prompt-drafts.json"]
    WorkflowRuns["workflow-runs.json"]
    Assets["assets/"]
    AgentKnowledgePackage["exports/agentknowledge/<ontologyId>/"]
    InteropExport["exports/ontology/<ontologyId>/"]
  end

  subgraph Providers["模型与外部系统"]
    TextModel["文字模型 / Claude / Anthropic / OpenAI / Gemini"]
    ImageModel["图片模型"]
    VideoModel["视频模型 / 第三方平台"]
    ExternalKG["外部知识图谱工具"]
    AgentRuntime["Agent Knowledge 客户端"]
  end

  Shell --> OntologyUI
  Shell --> ReviewUI
  Shell --> MatrixUI
  Shell --> CampaignUI
  Shell --> ActionUI
  Shell --> PromptUI
  Shell --> SceneUI
  Shell --> SopUI
  Shell --> AssetUI

  OntologyUI --> IPC
  ReviewUI --> IPC
  MatrixUI --> IPC
  CampaignUI --> IPC
  ActionUI --> IPC
  PromptUI --> IPC
  SceneUI --> IPC
  SopUI --> IPC
  AssetUI --> IPC

  IPC --> OntologyStore
  IPC --> OntologyRunStore
  IPC --> OntologyReviewStore
  IPC --> ExtractionService
  IPC --> CoverageService
  IPC --> ValidationService
  IPC --> PublishService
  IPC --> ActionLogStore
  IPC --> OperationalService
  IPC --> DecisionGateService
  IPC --> AgentKnowledgeExport

  ExtractionService --> InputSourceStore
  ExtractionService --> BrandKBStore
  ExtractionService --> IpKBStore
  ExtractionService --> TextService
  ExtractionService --> OntologyStore
  ExtractionService --> OntologyRunStore
  CoverageService --> OntologyStore
  ValidationService --> OntologyStore
  OntologyReviewStore --> OntologyStore
  PublishService --> SceneStore
  PublishService --> PromptDraftStore
  PublishService --> WorkflowEngine
  PublishService --> AssetReviewStore
  PublishService --> ActionLogStore
  OperationalService --> OntologyStore
  OperationalService --> ActionLogStore
  OperationalService --> DecisionGateService
  DecisionGateService --> ValidationService
  AgentKnowledgeExport --> OntologyStore

  InputSourceStore --> InputFiles
  BrandKBStore --> BrandKB
  IpKBStore --> IpKB
  OntologyStore --> OntologyFiles
  OntologyRunStore --> RunFiles
  OntologyReviewStore --> ReviewFiles
  ActionLogStore --> ActionFiles
  SceneStore --> SceneCards
  PromptDraftStore --> PromptDrafts
  WorkflowEngine --> WorkflowRuns
  AssetReviewStore --> Assets
  AgentKnowledgeExport --> AgentKnowledgePackage
  AgentKnowledgeExport --> InteropExport

  TextService --> TextModel
  WorkflowEngine --> ImageModel
  WorkflowEngine --> VideoModel
  InteropExport --> ExternalKG
  AgentKnowledgePackage --> AgentRuntime
```

## 3. 事实源边界图

```mermaid
flowchart TD
  subgraph Editable["内部编辑态事实源"]
    InternalOntology[".content-studio/ontologies/*.json"]
    Runs["ontology-runs.json"]
    Reviews["ontology-reviews.json"]
    Materials["素材审核和覆盖回写"]
    Actions["ontology-actions.json"]
  end

  subgraph Publishable["可发布知识数据"]
    KnowledgeMd["KNOWLEDGE.md"]
    OntologyManifest["ontology/ontology.json"]
    Concepts["ontology/concepts.json"]
    Relations["ontology/relations.json"]
    Claims["ontology/claims.json"]
    Evidence["ontology/evidence.json"]
    Constraints["ontology/constraints.json"]
    Coverage["ontology/coverage.json"]
    Grounding["compiled/prompt-grounding.md"]
  end

  subgraph Runtime["运行时消费"]
    SubgraphSelector["相关子图选择"]
    PromptGrounding["PromptGroundingContext"]
    SceneCard["SceneCard"]
    PromptDraft["PromptDraft"]
    ReviewGate["审核和证据闸口"]
    DecisionGate["DecisionGate"]
    ActionLog["ActionLog"]
  end

  subgraph Interop["互操作导出"]
    JsonLd["ontology.jsonld"]
    Turtle["ontology.ttl"]
    RdfTool["外部 RDF / 图谱工具"]
  end

  InternalOntology --> KnowledgeMd
  InternalOntology --> OntologyManifest
  InternalOntology --> Concepts
  InternalOntology --> Relations
  InternalOntology --> Claims
  InternalOntology --> Evidence
  InternalOntology --> Constraints
  InternalOntology --> Coverage
  InternalOntology --> Grounding
  Runs --> KnowledgeMd
  Reviews --> ReviewGate
  Materials --> Coverage
  Actions --> ActionLog

  OntologyManifest --> SubgraphSelector
  Concepts --> SubgraphSelector
  Relations --> SubgraphSelector
  Claims --> ReviewGate
  Evidence --> ReviewGate
  Constraints --> ReviewGate
  Coverage --> SubgraphSelector
  SubgraphSelector --> PromptGrounding
  ReviewGate --> PromptGrounding
  ReviewGate --> DecisionGate
  DecisionGate --> ActionLog
  PromptGrounding --> SceneCard
  PromptGrounding --> PromptDraft
  SceneCard --> ActionLog
  PromptDraft --> ActionLog

  InternalOntology --> JsonLd
  InternalOntology --> Turtle
  JsonLd --> RdfTool
  Turtle --> RdfTool
```

边界规则：

- `.content-studio/` 是可编辑事实源。
- Agent Knowledge 知识包是审核后的发布形态。
- `ontology/` 目录只保存结构化数据，不保存 workflow、工具调用、脚本或 prompt 指令。
- Prompt 工作台只加载相关子图，不注入完整 Ontology。
- Operational Action 必须写入 ActionLog；ActionLog 证明行动发生过，不证明产品事实。

## 4. 构建流程图

```mermaid
flowchart TD
  Start["选择输入源"] --> Plan["建立构建计划"]
  Plan --> Method{"选择构建方法"}

  Method --> Framework["框架派: 固定核心类型和规则"]
  Method --> Decomposed["拆解派: 分步抽取和校验"]
  Method --> Cluster["聚类派: 发现用户真实语言"]
  Method --> TwoStep["两步走: 候选概念再分层"]
  Method --> Direct["直给派: 仅草稿探索"]

  Framework --> Extract["抽取候选概念"]
  Decomposed --> Extract
  Cluster --> ClusterFeedback["评论 / 客服 / 差评聚类"]
  TwoStep --> Extract
  Direct --> CandidateOnly["生成 candidate 草稿"]

  ClusterFeedback --> Extract
  CandidateOnly --> Normalize["同义词归一和去重"]
  Extract --> Normalize
  Normalize --> Relations["抽取关系"]
  Relations --> Evidence["绑定主张证据"]
  Evidence --> Constraints["生成约束和禁用表达"]
  Constraints --> Coverage["构建覆盖矩阵"]
  Coverage --> Validate["规则校验"]
  Validate --> Issues{"是否有阻断问题"}
  Issues -->|有| ReviewQueue["进入人工审核任务"]
  Issues -->|无| ReviewQueue
  ReviewQueue --> Review["人工审核: 通过 / 驳回 / 合并 / 拆分 / 改名"]
  Review --> Approved{"是否达到发布条件"}
  Approved -->|否| Backlog["保留 draft / needs-verification"]
  Approved -->|是| Publish["发布到场景库 / PromptDraft / SOP / Agent Knowledge 包"]
  Publish --> ActionLog["写入 ActionLog"]
  Publish --> WriteBack["素材和效果回写 coverage"]
  ActionLog --> WriteBack
  WriteBack --> Iterate["下一轮增量构建"]
  Backlog --> Iterate
```

## 5. 内容生产闭环图

```mermaid
flowchart LR
  Input["产品资料 / SKU / 评论 / 知识库 / 竞品内容"] --> Ontology["轻量 Ontology"]
  Signals["热点 / 评论痛点 / 竞品动作 / 表现信号"] --> Objective["Objective"]
  Objective --> CampaignCell["CampaignCell"]
  CampaignCell --> ResourceBundle["ResourceBundle"]
  Ontology --> ClaimGate["主张证据闸口"]
  Ontology --> Matrix["卖点 / 痛点 / 人群 / 场景覆盖矩阵"]
  ClaimGate --> ReadyRows["可生产组合"]
  Matrix --> ReadyRows
  ReadyRows --> ResourceBundle

  ReadyRows --> Scene["SceneCard"]
  ReadyRows --> Prompt["PromptDraft"]
  ReadyRows --> Sop["SOP 输入"]
  ResourceBundle --> DecisionGate["DecisionGate"]
  DecisionGate --> ActionType["ActionType"]
  ActionType --> Prompt
  ActionType --> Scene
  ActionType --> Sop
  Prompt --> Article["文案 / 文章"]
  Prompt --> Image["图片 Prompt"]
  Prompt --> Video["视频 Prompt"]
  Sop --> Artifacts["生成素材"]
  Article --> Review["审核"]
  Image --> Review
  Video --> Review
  Artifacts --> Review
  Review --> AssetLibrary["素材库"]
  Review --> Reject["驳回 / 补证据 / 改约束"]
  AssetLibrary --> CoverageBack["覆盖矩阵回写"]
  Review --> ActionLog["ActionLog"]
  ActionLog --> Feedback["FeedbackLoop"]
  Reject --> Ontology
  CoverageBack --> Ontology
  Feedback --> Ontology
```

## 6. 构建时序图

```mermaid
sequenceDiagram
  actor Operator as 运营 / 内容工程师
  participant UI as Ontology 工作台
  participant IPC as IPC Bridge
  participant Build as OntologyExtractionService
  participant Source as InputSource / Knowledge Store
  participant Text as TextGenerationService
  participant Validate as OntologyValidationService
  participant Store as OntologyStore
  participant Run as OntologyRunStore
  participant Review as 审核任务

  Operator->>UI: 选择输入源和构建方法
  UI->>IPC: ontology:createBuildRun
  IPC->>Build: 创建构建计划
  Build->>Source: 读取产品资料 / SKU / 评论 / 知识库
  Source-->>Build: 返回文本和 sourceRefs
  Build->>Text: 请求结构化抽取 JSON
  alt 模型未配置
    Text-->>Build: blocked:text-provider
    Build->>Run: 写入 blocked 运行记录
    Build-->>UI: 返回 blocked 状态
  else 模型可用
    Text-->>Build: 候选概念 / 关系 / 证据 / 约束
    Build->>Validate: 校验证据、重复、粒度和禁用表达
    Validate-->>Build: validationIssues
    Build->>Store: 保存 Ontology draft
    Build->>Run: 保存运行记录、模型配置和 prompt 版本
    Build->>Review: 创建人工审核任务
    Build-->>UI: 返回 draft、矩阵和问题清单
  end
  UI-->>Operator: 展示候选结构和审核任务
```

## 7. 审核发布时序图

```mermaid
sequenceDiagram
  actor Reviewer as 品牌负责人 / 审核人员
  participant UI as 审核界面
  participant IPC as IPC Bridge
  participant ReviewStore as OntologyReviewStore
  participant Store as OntologyStore
  participant Validator as OntologyValidationService
  participant Publish as OntologyPublishService
  participant Scene as SceneLibraryStore
  participant Prompt as PromptDraftStore
  participant Sop as WorkflowEngine

  Reviewer->>UI: 审核概念、主张、证据和覆盖矩阵行
  UI->>IPC: ontology:reviewDecision
  IPC->>ReviewStore: 写入通过 / 驳回 / 合并 / 拆分 / 改名
  ReviewStore->>Store: 更新 item status 和 evidence status
  Store->>Validator: 重新校验发布条件
  Validator-->>Store: 返回 ready rows 和 blocking issues

  alt 存在阻断问题
    Store-->>UI: 返回缺证据 / 禁用表达 / 未审核项
    UI-->>Reviewer: 要求补证据或继续审核
  else 达到发布条件
    UI->>IPC: ontology:publish
    IPC->>Publish: 发布 selected coverage rows
    Publish->>Scene: 写入 SceneCard
    Publish->>Prompt: 写入 PromptDraft 和 PromptGroundingContext
    Publish->>Sop: 写入 SOP 输入引用
    Publish-->>UI: 返回发布结果
    UI-->>Reviewer: 展示下游产物链接
  end
```

## 8. Agent Knowledge 包发布和消费时序图

```mermaid
sequenceDiagram
  actor Engineer as 内容工程师
  participant UI as Ontology 工作台
  participant Export as AgentKnowledgeOntologyExportService
  participant Store as OntologyStore
  participant Review as OntologyReviewStore
  participant Files as exports/agentknowledge/<ontologyId>
  participant Client as Agent Knowledge 客户端
  participant Prompt as Prompt 工作台

  Engineer->>UI: 选择发布为 Agent Knowledge 知识包
  UI->>Export: exportOntologyKnowledgePack(ontologyId, version)
  Export->>Store: 读取 Ontology、概念、关系、证据、约束和覆盖矩阵
  Export->>Review: 检查审核状态和 provenance
  alt 包校验失败
    Export-->>UI: 返回缺 primaryOntology / 未审核主张 / 可执行指令风险
  else 包校验通过
    Export->>Files: 写入 KNOWLEDGE.md
    Export->>Files: 写入 ontology/*.json
    Export->>Files: 写入 compiled/prompt-grounding.md
    Export-->>UI: 返回包路径和版本
  end

  Client->>Files: 发现 KNOWLEDGE.md frontmatter
  Client->>Files: 读取 metadata.primaryOntology
  Client->>Client: 选择当前任务相关子图
  Client->>Prompt: 注入 PromptGroundingContext
```

## 9. 状态流转图

### 9.1 Ontology item 状态

```mermaid
stateDiagram-v2
  [*] --> candidate
  candidate --> needs_review: 抽取完成
  needs_review --> approved: 人工通过
  needs_review --> rejected: 人工驳回
  needs_review --> candidate: 改名 / 拆分 / 合并后重检
  approved --> deprecated: 后续版本替换
  approved --> disputed: 新证据冲突
  disputed --> needs_review: 进入复核
  rejected --> [*]
  deprecated --> [*]
```

### 9.2 覆盖矩阵行状态

```mermaid
stateDiagram-v2
  [*] --> needs_review
  needs_review --> missing_evidence: 主张缺证据
  needs_review --> missing_material: 缺可用素材
  needs_review --> blocked: 命中禁用表达或合规风险
  needs_review --> ready: 审核通过且证据可用
  missing_evidence --> ready: 补证据并通过
  missing_material --> ready: 补素材或降低素材要求
  ready --> covered: 生成并审核通过
  covered --> ready: 需要复用或再生产
  blocked --> needs_review: 修改约束后复核
```

### 9.3 ActionLog 状态

```mermaid
stateDiagram-v2
  [*] --> planned
  planned --> running: DecisionGate 通过
  planned --> blocked: DecisionGate 阻断
  running --> review_required: 需要人工审核
  running --> completed: 动作完成
  running --> failed: 执行失败
  review_required --> completed: 审核通过并写回
  review_required --> blocked: 审核驳回
  completed --> [*]
  blocked --> [*]
  failed --> [*]
```

## 10. 动态内容作战时序图

```mermaid
sequenceDiagram
  actor Lead as 增长负责人 / 运营
  participant UI as 内容作战单元界面
  participant Ops as OperationalOntologyService
  participant Store as OntologyStore
  participant Gate as DecisionGateService
  participant Action as OntologyPublishService / WorkflowEngine
  participant Log as OntologyActionLogStore
  participant Review as 审核台

  Lead->>UI: 选择 Signal 并设定 Objective
  UI->>Ops: createCampaignCell(signalId, objective)
  Ops->>Store: 读取 ready coverage rows、证据、约束和素材
  Ops-->>UI: 推荐 ResourceBundle
  Lead->>UI: 选择 ActionType
  UI->>Gate: 检查证据、审核状态、权限和平台规则
  alt DecisionGate 未通过
    Gate-->>UI: 返回 blocked 原因
    UI->>Log: 写入 blocked ActionLog
  else DecisionGate 通过
    Gate-->>Action: 执行动作
    Action-->>Review: 需要审核的产物进入审核台
    Action-->>Log: 写入 running / completed ActionLog
    Review-->>Log: 回写审核结果
    Log-->>Store: 更新覆盖矩阵和 FeedbackLoop
  end
```

## 11. MVP 架构边界

| 进入 MVP | 不进入 MVP |
| --- | --- |
| 本地 JSON Ontology Store。 | 云端图数据库。 |
| 候选概念、关系、证据、约束和覆盖矩阵。 | 完整 OWL 编辑器。 |
| 最小 ActionLog。 | 多 CampaignCell 协同和复杂排班。 |
| Agent Knowledge v0.7.2 知识包导出。 | 将 `ontology/` 作为 Skill 或 workflow 执行目录。 |
| PromptGroundingContext 子图选择。 | 把完整 Ontology 直接塞进 Prompt。 |
| 人工审核和 blocked 状态。 | 无人值守自动发布。 |
| DecisionGate 规则雏形。 | 舆论操控、刷量、自动发帖。 |
| JSON-LD / RDF / Turtle 后置导出。 | SPARQL 作为 MVP 查询引擎。 |
