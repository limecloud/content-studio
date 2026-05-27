# 布谷AI内容工厂 Ontology 路线图

更新时间：2026-05-28  
状态：Draft

## 一句话目标

把 Ontology 做成布谷AI内容工厂的“内容生产知识地图 + 内容作战操作层”：用结构化概念、关系和约束承接品牌 / 产品 / IP / 用户反馈 / 竞品 / 素材事实，再把信号、目标、人员 / Agent、素材、SOP 和行动日志组合成可执行的品牌获客闭环。

```text
输入源
-> 轻量 Ontology
-> 卖点 / 痛点 / 人群 / 场景 / 证据 / 约束矩阵
-> 信号 / 目标 / 资源包 / 行动类型 / 决策闸口
-> 场景库 / 提示词组 / SOP / 审核规则 / 行动日志
-> 文章 / 图片 / 视频 Prompt / 绿幕图 / 混剪素材包 / 获客复盘
```

## 产品定位

- **面向用户**：品牌运营、新媒体运营、电商运营、短视频团队、个人 IP 内容团队、内容工程师和审核人员。
- **核心对象**：Ontology Workspace、Concept、Relation、Evidence、Constraint、Coverage Matrix、Signal、Objective、Campaign Cell、Resource Bundle、Action Type、Action Log、Review Task、Prompt Grounding Context。
- **首要场景**：把产品资料、用户评论、竞品内容和知识库文档变成可复用的内容生产结构，再把市场信号快速编组成内容行动，而不是每次把原始文档直接扔给 LLM。
- **产品形态**：本地客户端里的内容工程层，事实源优先落在工作区 `.content-studio/`；对外发布时遵循 Agent Knowledge v0.7.0 ontology-aware 知识包标准。
- **工程边界**：先使用 JSON 事实源和规则校验；需要互操作时优先导出 Agent Knowledge 知识包，再导出 JSON-LD / RDF / Turtle，不把 RDF / OWL 存储作为 MVP 前置条件。

## 为什么需要 Ontology

当前 v2 已经具备知识库、场景库、PromptDraft、SOP 和素材库，但复杂内容生产仍会遇到四类问题：

| 问题 | 影响 |
| --- | --- |
| 直接把文档交给 LLM。 | 同一产品的卖点、痛点和表达边界每次生成不一致。 |
| 卖点、痛点、人群、场景散落在不同模块。 | 难以判断哪些组合已经覆盖，哪些还缺素材或证据。 |
| 用户要求“各种穷举”。 | 靠 prompt 要列表容易漏项，也容易重复命名。 |
| 内容主张缺证据。 | 审核人员无法判断能不能发布，模型容易编造功效和结论。 |

Ontology 的价值不是做学术本体，而是给内容生产建立稳定的中间层：

```text
Claim 必须有 Evidence
SellingPoint 必须关联 Feature / Benefit / Audience
Scene 必须关联 Audience / PainPoint / Moment / Channel
Prompt 必须可追溯 Concept / Relation / Constraint
Artifact 必须回写已覆盖的矩阵组合
Action 必须留下 ActionLog
Signal 必须能触发 Objective / CampaignCell / ResourceBundle
```

## Operational Ontology：内容作战操作层

Palantir Ontology 的启发不是军用场景本身，而是“把现实资源映射成可调度对象，并把行动也纳入 Ontology”。放到布谷，品牌舆论和获客更像一个动态有机系统：信号不断出现，资源需要快速重组，每个运营、内容工程师和 Agent 都是带权限、上下文和目标的内容作战单元。

布谷的产品化表达：

| 对象 | 含义 | 例子 |
| --- | --- | --- |
| `Signal` | 外部或内部变化信号。 | 热点、竞品动作、评论痛点、投放表现、平台规则变化。 |
| `Objective` | 当前行动目标。 | 拉新、转化、解释异议、守住品牌口径、抢占新品类关键词。 |
| `CampaignCell` | 临时内容作战单元。 | 1 个运营 + 1 个审核人 + 1 个 Agent + 3 个 SOP + 20 条素材。 |
| `ResourceBundle` | 可快速组合的资源包。 | 卖点、证据、Prompt、素材、场景、达人、渠道、SOP。 |
| `ActionType` | 标准化可执行动作。 | 生成 10 条小红书选题、补证据、发起审核、导出视频 Prompt。 |
| `ActionLog` | 行动和结果记录。 | 谁在什么时候用哪些资源做了什么，结果如何，回写了什么。 |
| `DecisionGate` | 决策和合规闸口。 | 证据不足不能发布、医疗化表达拦截、品牌负责人确认。 |

这个操作层的边界是：做真实品牌表达、证据驱动获客和内容复盘，不做虚假舆论操控，不绕过平台规则和审核。

## v2 / v3 关系

- v2 的 `BrandKnowledgeBase`、`IpKnowledgeBase`、`SceneLibrary`、`PromptDraft` 和 `WorkflowRun` 是 Ontology 的直接上游和下游。
- Ontology 不替代 v2 知识库，也不替代场景库；它在两者之间补上“概念、关系、证据、约束和覆盖矩阵”。
- v3 的品牌前台和素材中台可以消费已审核的 Ontology 标签、素材关系和案例结构，但 v3 不负责构建 Ontology。
- `content-studio` 仍是 Ontology 构建和内容生产事实源；站点侧只读取已发布资产和元数据。

## 与 Agent Knowledge v0.7.0 的关系

Agent Knowledge v0.7.0 是 Ontology 发布和消费的标准边界，Content Studio 是 Ontology 构建、审核和内容生产的工作台。

| 层级 | 职责 |
| --- | --- |
| Content Studio 内部事实源 | 保存 `.content-studio/ontologies/*.json`、运行记录、审核记录、覆盖矩阵和素材回写。 |
| Agent Knowledge 知识包 | 将审核后的 Ontology 发布为目录包，入口为 `KNOWLEDGE.md`，结构化数据放入 `ontology/`。 |
| 运行时消费 | 客户端按任务选择相关子图，注入概念、主张、证据、约束和覆盖矩阵行，不注入完整 Ontology。 |

发布包必须满足：

- `KNOWLEDGE.md` frontmatter 使用 `type: content-ontology`，或作为品牌 / IP 知识包的支撑层使用现有领域类型。
- `metadata.primaryOntology` 指向 `ontology/ontology.json`。
- `runtime.mode` 使用 `data`，明确这是数据层。
- `ontology/` 只保存概念、关系、主张、证据、约束和覆盖矩阵，不保存 workflow 指令、工具脚本或可执行 Skill。
- `metadata.producedBy` 和运行记录保存 Content Studio 或 Builder Skill provenance，但运行时消费知识包时不得执行构建 Skill。

## 方法路线

布谷优先采用 **框架派 + 拆解派 + 聚类派**，避免把生产链路建立在一次性 prompt 上。

| 方法 | 适用场景 | 布谷采用方式 |
| --- | --- | --- |
| 框架派 | 行业已有标准、品牌已有方法论、合规要求明确。 | 先定义内容工厂核心类型和关系，再让 LLM 在框架内抽取。 |
| 拆解派 | 生产级稳定构建。 | 抽取概念、归一命名、建立关系、校验证据、人工审核分步执行。 |
| 聚类派 | 新领域、新品类、用户语言不稳定。 | 从评论、差评、客服问题和竞品内容聚类痛点、异议和选题。 |
| 两步走派 | 快速验证新项目。 | 先提取候选概念，再分层成卖点、痛点、人群和场景。 |
| 直给派 | 脑暴和样例探索。 | 只允许作为草稿，不直接进入可发布事实源。 |

## 文档索引

| 文档 | 用途 |
| --- | --- |
| [`prd.md`](./prd.md) | Ontology 产品需求、角色、用户故事、用例、主路径、范围和验收标准。 |
| [`architecture-diagrams.md`](./architecture-diagrams.md) | 总体架构图、事实源边界、构建流程、生产闭环、时序图和状态流转图。 |
| [`ontology-model.md`](./ontology-model.md) | 轻量 Ontology 类型、关系、证据、约束、覆盖矩阵和本地事实源模型。 |
| [`workflow-model.md`](./workflow-model.md) | LLM 构建 Ontology 的分步流程、五种方法流派、质检和人工审核。 |
| [`implementation-plan.md`](./implementation-plan.md) | MVP、v1 和远景阶段计划、写集、验证方式和完成标准。 |

## MVP 优先级

| 优先做 | 不进 MVP |
| --- | --- |
| 内容生产核心类型：产品、功能、卖点、痛点、人群、场景、证据、约束、Prompt 角度。 | 完整 OWL 编辑器。 |
| 从产品资料、知识库、评论和竞品内容抽取候选概念。 | 云端图数据库。 |
| 同义词归一、重复概念合并、粒度检查。 | 自动行业本体市场。 |
| 卖点拆解和场景穷举矩阵。 | 多人协作权限。 |
| 主张必须关联证据。 | 自动发布。 |
| 人工审核后进入场景库、提示词组和 SOP。 | 无人值守全自动内容生成。 |
| 本地 JSON 事实源、可追溯运行记录和 Agent Knowledge v0.7.0 知识包导出。 | 强制 RDF / OWL 作为运行时事实源。 |
| 最小 ActionLog：记录从矩阵组合到 PromptDraft / SOP 的行动链路。 | 舆论操控、自动发布和跨平台刷量。 |

## 完成定义

Ontology MVP 可宣称完成需要同时满足：

- 能从至少 3 类输入源构建轻量 Ontology：品牌 / 产品知识库、产品 brief / SKU、用户评论 / 客服问题。
- 能输出稳定的卖点拆解：功能、属性、用户收益、痛点、证据、人群、场景和禁用表达。
- 能生成覆盖矩阵，并标出已覆盖、缺证据、缺素材和待审核组合。
- 能从审核通过的矩阵组合生成场景卡、PromptDraft 或 SOP 输入。
- 能导出 Agent Knowledge v0.7.0 ontology-aware 知识包，包含 `KNOWLEDGE.md`、`ontology/ontology.json` 和 `metadata.primaryOntology`。
- 能对每条内容主张保留来源引用和证据状态。
- 能拦截无证据主张、重复概念、孤立概念、过粗 / 过细粒度和敏感表达。
- 关键路径有本地验证；未配置模型时返回可追溯 blocked，不伪造 Ontology 成功。

v1 可宣称完成需要额外满足：

- Ontology 能跨品牌 / 产品 / IP / 用户反馈 / 素材库形成闭环。
- 成功素材能回写覆盖矩阵，形成可复用的“高表现组合”。
- Prompt 工作台能按目标渠道注入相关子图，而不是塞完整原文。
- 审核台能基于 Ontology 解释素材为什么可用、缺什么证据、适合什么渠道。
- 支持 Signal -> Objective -> CampaignCell -> ResourceBundle -> ActionLog 的动态编组闭环。
- 支持导出 JSON-LD / RDF / Turtle 之一作为互操作格式，但运行时仍以本地工作区事实源为准。
