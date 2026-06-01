# Ontology v2 电商短视频内容制造流水线原型

状态：Prototype Draft  
更新时间：2026-05-31

## 设计结论

本原型收敛为一个批次驱动的电商短视频内容制造流水线，所有界面都围绕当前批次、当前阶段、门禁结论和下游交付物展开。

产品形态判断：

```text
电商短视频内容制造流水线
= 批次对象
+ 数据入口 / 输入包
+ 阶段 SOP
+ 用户意图 / 流量信号
+ 商品 / 卖点 / 证据 / 素材事实源
+ 规则门禁
+ Agent 执行
+ 审核 / 投放调优 / 复盘闭环
```

SOP 不是最终产品形态，只是流水线的运行轨道。数据入口负责把外部系统、文件和人工输入变成可追溯输入包；知识库负责事实和关系，规则负责门禁，Agent 负责执行，审核负责放行，投放调优负责把创意接入流量和预算，复盘负责让下一批更准。

## 原型文件

- [`index.html`](./index.html)：可直接用浏览器打开的静态 HTML 原型。
- [`index-v2.html`](./index-v2.html)：重做版原型，含可钻取子页面、对象工作台、独立数据接入工作台。
- [`server-console.html`](./server-console.html)：服务端控制台原型（接入运维 / Agent 调度 / 门禁合规 / 多租户安全）。
- [`server-mock/`](./server-mock/)：服务端 Mock API（纯 Node，暴露 v2 架构端点，可与原型联调）。
- [`architecture.md`](./architecture.md)：系统整体架构（分层 / 客户端服务端切分 / 端到端流程 / 批次时序）。
- [`data-model.md`](./data-model.md)：从原型对象拆出的本地 TypeScript / JSON 数据模型草案。
- [`data-intake-workbench-prd.md`](./data-intake-workbench-prd.md)：数据接入工作台子系统 PRD。
- [`client-capability-migration.md`](./client-capability-migration.md)：现有客户端能力融入 v2 的评估（读码基线）。

## 当前业务对象

当前第一屏绑定一个真实批次，而不是展示能力列表：

```text
批次：batch-summer-fan-202606
名称：夏季便携风扇 A 组
目标：从 286 个候选 SKU 中筛出可制造商品，生成一批抖音转化短视频制造单，并把搜索意图、投放表现回写到下一轮
周期：7 天内产出 18 条可审核视频制造单，首批发布 6 条 A/B 实验视频
角色：电商运营 + 内容导演 + 审核负责人
```

第一屏必须回答：

- 当前有哪些数据源已接入。
- 当前哪些输入还缺失或待同步。
- 当前批次是什么商品战役。
- 当前走到哪个阶段。
- 当前哪里阻塞。
- 下一步主动作是什么。
- 阶段产物交付给哪个下游对象。

## 数据入口

这个系统的数据不能从阶段内部凭空生成，必须先经过输入层。输入层的职责是把外部数据、文件和人工判断转换成可追溯的 `InputBundle` / `IntakePacket`。

产品边界：

- 资料接入中心是全局子系统，不属于 `选品 / 意图 / 建模 / 卖点 / 矩阵 / 制造 / 审核 / 调优 / 复盘` 任一阶段。
- 主工作台只展示资料接入状态和入口按钮，不把完整接入系统铺进阶段页面。
- 阶段只消费资料接入中心生成的 `InputBundle`、`ArtifactRef` 和 `inputRefs`。
- 缺资料时，阶段生成 `MissingInputTask`，回到资料接入中心补齐，而不是在阶段内复制一套补资料系统。

当前原型把输入拆成六类：

- 商品与库存：店铺、ERP、库存、价格、活动、规格和上下架状态，生成 `RawProductCandidate`、`NormalizedSku`、`SkuCluster`。
- 素材与证据：详情页、说明书、检测报告、实拍素材、历史成片和素材库，生成 `ClipAsset`、`Evidence`、`AssetUsageLedger`。
- 搜索与评论：站内搜索、平台搜索、评论、客服问答和达人脚本，生成 `SearchSignal`、`IntentCluster`、`PainPoint`。
- 投放与流量：投放报表、预算、关键词、人群、点击、留存、成交和 ROI，生成 `DeliveryMetric`、`BudgetPlan`、`KeywordFeedback`。
- 平台与品牌规则：平台合规、品牌口径、审核记录和红线清单，生成 `ForbiddenExpression`、`ReviewGate`、`RulePatch`。
- 人工确认：运营、审核、投放和拍摄人员的判断，生成 `HumanApproval`、`RecoveryTask`。

输入流转：

```text
外部来源 / 文件 / 人工
-> SourceConnector
-> IntakePacket
-> 解析 / 清洗 / 去重 / 归一
-> InputBundle
-> 阶段 inputRefs
-> 阶段产物
```

补齐入口：

- 连接系统：接店铺、ERP、素材库、广告后台、评论系统，适合持续同步。
- 上传文件：上传 SKU 表、说明书、检测报告、素材包、历史成片和投放 CSV。
- 粘贴文本 / 链接：粘贴搜索词、评论、客服问答、竞品标题和达人脚本。
- 人工录入 / 确认：录入活动价边界、预算阈值、风险例外、审核意见和拍摄确认。
- 导入历史项目：导入历史视频、审核结论、素材账本和投放表现。
- 创建补拍 / 补证据任务：当素材、证据、授权或人工确认缺失时，直接生成 `MissingInputTask`。

原型交互：

- 主工作台点击“打开接入中心”，进入全局资料接入中心弹窗。
- 点击任一数据源卡片，会打开补齐资料弹窗，展示当前来源应生成的对象。
- 点击任一补齐资料入口，会打开对应表单，例如连接系统、上传文件、粘贴文本或人工确认。
- 点击任一缺口任务，会带着缺口上下文打开表单，明确补齐方式、目标阶段和输出对象。
- 弹窗支持保存为 `FillActionRequest` 草稿，或生成 `IntakePacket` / `InputBundle`。

缺口任务必须能回答：

- 缺什么资料。
- 去哪里补。
- 用什么方式补。
- 补完生成哪个对象。
- 交付给哪个阶段。
- 谁负责确认。

门禁：

- 没有来源的输入不能写入事实源。
- 文件导入必须保留原始文件引用和解析结果。
- 搜索词、评论和投放词只能提供意图和痛点，不能直接成为产品事实。
- 投放数据只能驱动调优和复盘，不能证明产品功效。
- 人工确认必须记录确认人、确认时间和适用边界。

## 阶段细节包

细节不能被删掉，也不能重新散成页面拼盘。正确组织方式是：

```text
流水线主结构
+ 阶段细节包
  + 细节卡
  + 业务对象明细
  + 阶段工作样例
  + 输出契约
```

每个阶段都必须保留足够的操作细节：

- 选品阶段要能处理电商大量 SKU：商品簇、评分模型、硬拦截、补资源任务和深建模门槛。
- 意图阶段要能理解流量入口：搜索词、评论、客服问答、购买角色、使用场景和隐含担忧。
- 建模阶段要能说明事实来源：商品事实、证据等级、素材覆盖、竞品隔离和禁用表达。
- 卖点阶段要能让 LLM 罗列但不乱写：痛点、卖点、主张分级、证据约束、Hook 供料和禁用表达。
- 矩阵阶段要能穷举 Hook 和组合变量：人群、痛点、卖点、首镜、场景、Offer、语气和实验变量。
- 制造阶段要落到视频结构：4-5 个约 15 秒片段、黄金三秒、镜头清单、语气语调姿态和素材复用上限。
- 审核阶段要能反向创建任务：改写、补证据、补素材、人工确认和可交付包。
- 调优阶段要能连接生意结果：关键词、人群、预算、留存、点击、成交、ROI、加预算和停投动作。
- 复盘阶段要能回写下一轮：变量权重、素材疲劳、痛点异议、违规反馈和规则更新。

因此，页面上仍然只有一条 SOP 主线，但当前阶段下会展开具体对象、规则、Agent 任务、变量和结构化输出。这样既避免入口罗列，也不会丢掉真实业务细节。

### 阶段工作样例

`index.html` 里每个阶段都补了一个可执行样例表，用来把“系统应该怎么做”落到具体数据：

- 选品：SKU / 商品簇评分样例，展示大量选品如何进入深建模、暂缓或拦截。
- 意图：搜索和评论意图样例，展示词面背后的购买角色、使用场景、隐含担忧和禁止写入边界。
- 建模：事实抽取样例，展示 ProductFact、Evidence、PainPoint 和禁用表达如何分开。
- 卖点：LLM 卖点罗列样例，展示痛点、事实、候选卖点、证据处理和下游结果。
- 矩阵：Hook 穷举样例，展示 Hook 模式、0-3 秒候选、首镜、语气和过滤结果。
- 制造：4-5 段视频制造样例，展示黄金三秒、片段功能、语气姿态、素材和门禁。
- 审核：反向任务样例，展示审核问题如何变成改写、补证据、补素材和人工确认。
- 调优：投放调优样例，展示预算、关键词、ROI、素材疲劳和人工确认如何生成动作。
- 复盘：回写样例，展示表现数据如何更新变量权重、素材疲劳和规则，而不是污染产品事实。

## 流水线阶段

```text
选品
-> 意图
-> 建模
-> 卖点
-> 矩阵
-> 制造
-> 审核
-> 调优
-> 复盘
```

### 1. 选品

目的：商品很多时，先筛选，不让所有 SKU 都进入深建模和视频生产。

输入：店铺商品、ERP、库存、广告、评论、客服、达人反馈。  
输出：`DeepModelingTask[]`。

关键门禁：库存、毛利、平台风险、素材覆盖。  
典型产物：选品评分表、深建模任务、补资源任务、拦截清单。

### 2. 意图

目的：把搜索词、评论、客服问答和投放词包翻译成购买意图、使用场景和隐含担忧。

输入：搜索词、站内搜索、评论、客服问答、达人脚本、投放词包、竞品标题。  
输出：`IntentCluster[]` / `TrafficIntent[]`。

关键门禁：来源可追溯、噪声过滤、敏感属性边界、意图不能替代产品事实。  
典型产物：意图簇、流量意图、新客词包、噪声清单。

### 3. 建模

目的：把入选商品变成可执行对象，而不是让 Agent 直接读一堆资料。

输入：深建模任务、商品资料、SKU 表、素材清单、平台规则。  
输出：`ProjectOntologyPatch`。

关键门禁：来源可追溯、竞品事实隔离、强主张证据、SKU 和活动条件。  
典型产物：商品事实卡、证据包、风险预审、素材覆盖图。

### 4. 卖点

目的：把事实、痛点和证据组合成可发布主张、弱表达和禁用表达。

输入：`ProductFact`、`PainPoint`、`Evidence`、`Scenario`、`Offer`。  
输出：`SellingPoint[]` / `Claim[]`。

关键门禁：评论不能升级为事实、强主张必须有 verified 证据、禁用词不得进入 Hook / 字幕 / 封面。  
典型产物：卖点知识包、主张库、补证据任务、Hook 供料。

### 5. 矩阵

目的：把人群、痛点、卖点、Hook、素材、Offer 和实验变量排成可制造任务。

输入：卖点知识包、变量字典、素材账本、历史表现。  
输出：`MatrixRow[]`。

关键门禁：证据、素材复用、实验变量数量、交易条件。  
典型产物：矩阵行、视频种子、阻塞原因、实验计划。

### 6. 制造

目的：输出可审核的视频制造单，不伪造成片成功。

输入：`VideoSeed`、`ClipAsset`、`VoiceDirection`、审核规则。  
输出：`VideoManufacturingJob`。

关键门禁：4-5 段、60-75 秒、黄金三秒、素材复用、证据引用。  
典型产物：视频制造单、分镜表、素材缺口、发布包草稿。

### 7. 审核

目的：作为质量门禁，而不是末端盖章。

输入：视频制造单、主张、证据、素材账本、Offer。  
输出：`ReviewDecision[]`。

关键门禁：强功效、价格条件、素材真实性、竞品边界。  
典型产物：审核结论、改写任务、补证据任务、可交付包。

### 8. 调优

目的：把审核通过的创意连接到搜索词、人群、预算和投放表现，生成可执行优化动作。

输入：可交付包、关键词信号、人群信号、预算计划、投放指标。  
输出：`OptimizationAction[]`。

关键门禁：预算阈值、归因边界、合规放行、预算提升人工确认。  
典型产物：预算计划、投放指标、调优动作、词包反馈。

### 9. 复盘

目的：把表现写回变量权重、素材疲劳、痛点发现和审核规则。

输入：发布表现、评论、商品点击、成交、违规、素材表现。  
输出：`KnowledgeUpdate[]`。

关键门禁：实验归因、事实边界、素材疲劳、违规反馈。  
典型产物：实验复盘、变量权重更新、素材疲劳更新、规则更新。

## 后台能力分层

用户主路径只看到流水线。后台能力按职责支撑每个阶段：

```text
事实层：商品、SKU、意图、卖点、证据、素材、评论、竞品观察、投放表现、实验反馈
规则层：结构、证据、素材复用、平台合规、品牌口径、预算阈值、实验归因
执行层：选品、意图、建模、卖点、矩阵、导演、素材、审核、投放、复盘 Agent
质量层：阶段门禁、审核结论、Harness 样例、人工确认、恢复动作
记忆层：搜索词回写、表现回写、变量权重、素材疲劳、痛点异议、规则更新
```

## 关键系统规则

- 视频由 4-5 个约 15 秒片段组成，总时长 60-75 秒。
- 首段 0-3 秒必须有可追溯 Hook 和商品可见线索。
- 同一素材最多进入 4 条混剪，达到上限后必须替换、补拍或人工确认。
- 产品主张必须绑定证据；缺证据强功效表达不能进入脚本、字幕、封面或口播。
- 评论只能提供痛点和用户原声，不能升级为产品事实。
- 搜索词和投放词只能提供用户意图、流量入口和购买任务，不能升级为产品事实。
- 竞品观察只能作为结构参考，不能作为本品牌事实证据。
- 投放表现只能证明内容行动和预算效果，不能替代产品事实证据。
- 预算自动提升超过阈值时必须进入人工确认，不能由 Agent 无上限加预算。
- Agent 只能执行阶段任务，不能绕过素材账本、规则门禁和审核闸口。

## 核心对象草案

```text
SourceConnector
IntakePacket
InputBundle
InputLineage
MissingInputTask
FillActionRequest
RawProductCandidate
NormalizedSku
SkuCluster
SelectionScore
DeepModelingTask
SearchSignal
IntentCluster
TrafficIntent
KeywordSignal
IntentNoise
ProductFact
SkuFact
PainPoint
Objection
Scenario
SellingPoint
Claim
Evidence
ForbiddenExpression
HookPattern
HookCandidate
VariableDictionary
MatrixRow
VideoSeed
VideoManufacturingJob
VideoBlueprint
SegmentPlan
ShotPlan
ScriptLine
VoiceDirection
AssetRequirement
ClipAsset
AssetFingerprint
AssetUsageLedger
MaterialGapTask
AgentTask
AgentRun
HumanApproval
ReviewGate
ReviewDecision
BudgetPlan
DeliveryMetric
OptimizationAction
KeywordFeedback
AudienceFeedback
ExperimentPlan
PerformanceFeedback
KnowledgeUpdate
```

## 本地文件草案

```text
.content-studio/ontology-v2/product-selection.json
.content-studio/ontology-v2/stage-runs.json
.content-studio/ontology-v2/source-connectors.json
.content-studio/ontology-v2/intake-packets.json
.content-studio/ontology-v2/input-bundles.json
.content-studio/ontology-v2/input-lineage.json
.content-studio/ontology-v2/missing-input-tasks.json
.content-studio/ontology-v2/fill-action-requests.json
.content-studio/ontology-v2/search-signals.json
.content-studio/ontology-v2/intent-clusters.json
.content-studio/ontology-v2/product-facts.json
.content-studio/ontology-v2/evidence.json
.content-studio/ontology-v2/selling-points.json
.content-studio/ontology-v2/hook-candidates.json
.content-studio/ontology-v2/variable-dictionary.json
.content-studio/ontology-v2/matrix-rows.json
.content-studio/ontology-v2/video-jobs.json
.content-studio/ontology-v2/asset-ledger.json
.content-studio/ontology-v2/review-decisions.json
.content-studio/ontology-v2/budget-plans.json
.content-studio/ontology-v2/delivery-metrics.json
.content-studio/ontology-v2/optimization-actions.json
.content-studio/ontology-v2/agent-runs.json
.content-studio/ontology-v2/feedback-updates.json
.content-studio/ontology-v2/rules.json
```

## UI 契约

本原型的普通用户界面必须保持以下契约：

- 只围绕当前批次展开，不做能力入口合集。
- 左侧是阶段 SOP，不是功能导航大全。
- 中间是当前阶段的任务、门禁和交付物。
- 右侧是当前业务对象、输入输出、主动作和系统边界。
- 每个阶段只保留一个主动作。
- 任何阻塞都必须给出恢复路径。
- 任何产物都必须交付给下游对象。

## 下一步

下一刀应把 `data-model.md` 中的草案收敛成可落地的 TypeScript 数据模型和本地 JSON 校验器：

1. 定义 `SourceConnector`、`IntakePacket`、`InputBundle`、`ContentBatch`、`StageRun`、`SelectionScore`、`IntentCluster`、`SellingPoint`、`HookCandidate`、`MatrixRow`、`VideoManufacturingJob`、`ReviewDecision`、`OptimizationAction`、`KnowledgeUpdate` 类型。
2. 为每个阶段补 shape-like validator。
3. 用一组 Harness 样例验证正例、边界、负例和例外。
4. 再考虑是否需要 JSON-LD / RDF / SHACL 互操作导出。
