# 布谷AI内容工厂 Ontology 工作流模型

更新时间：2026-05-28  
状态：Draft

## 1. 设计结论

Ontology 构建必须拆成可验证步骤，不能依赖一次性端到端 prompt。推荐生产流程：

```text
选择输入源
-> 建立构建计划
-> 抽取候选概念
-> 归一和去重
-> 抽取关系
-> 生成证据和约束
-> 构建覆盖矩阵
-> 规则校验
-> 人工审核
-> 发布到场景库 / Prompt / SOP
-> 发布 Agent Knowledge ontology-aware 知识包
-> 组合 Signal / Objective / ResourceBundle
-> 执行标准 ActionType
-> 写入 ActionLog
-> 素材回写
```

这个流程优先解决 LLM 构建 Ontology 的四道坎：

| 难点 | 处理方式 |
| --- | --- |
| 类型数量未知 | 固定高层类型，允许概念实例增长；新类型必须人工确认。 |
| 幻觉 | 所有主张必须有 sourceRefs 和 evidence；无证据只能待验证。 |
| 粒度难控 | 增加 too-broad / usable / too-specific / duplicate 检查。 |
| 无标准答案 | 用版本、审核、覆盖率、证据率和业务可用性评估。 |

## 2. 五种方法流派的产品化用法

### 2.1 拆解派

生产主路径。

```text
概念抽取 -> 类型归一 -> 关系抽取 -> 证据绑定 -> 规则校验 -> 人审发布
```

适用：

- 品牌 / 产品知识库。
- SKU 和详情页素材。
- 合规敏感行业。
- 需要长期复用的内容资产。

布谷实现：

- `OntologyBuildRun` 记录每一步输入和输出。
- 每步生成结构化 JSON。
- 每步都能 blocked / retry / manual-review。

### 2.2 聚类派

用于发现用户真实语言。

```text
评论 / 差评 / 客服问题
-> 语义聚类
-> 痛点命名
-> 用户原声证据
-> 异议和选题方向
```

适用：

- 新品类。
- 不清楚用户痛点的项目。
- 需要大量选题和标题方向。

布谷实现：

- 每个痛点聚类必须保留原声证据。
- 聚类名默认 candidate，需要人工确认。
- 聚类结果可进入 `pain-point`、`objection`、`topic`。

### 2.3 两步走派

用于快速验证。

```text
先抽候选概念
-> 再分层成类型和关系
```

适用：

- 新项目启动。
- 用户只想先看大致结构。
- 输入源少、风险低。

布谷实现：

- 产物只能是 draft。
- 通过审核后才能进入可发布链路。

### 2.4 框架派

用于减少幻觉和口径漂移。

```text
内容工厂核心 schema / 行业规则
-> LLM 在 schema 内抽取
-> 规则校验
```

适用：

- 有行业标准或固定方法论的领域。
- 品牌语气和合规边界明确。
- IP 知识库六层体系。

布谷实现：

- 内置 `brand-product`、`ip`、`feedback` 三类模板。
- 后续支持行业规则包，但不进入 MVP。

### 2.5 直给派

只用于脑暴，不作为事实源。

```text
端到端 prompt -> 一份候选 Ontology
```

适用：

- 演示。
- 头脑风暴。
- 低风险探索。

布谷限制：

- 结果只能进入 `candidate`。
- 不允许直接生成 approved 概念、关系或可发布 Prompt。

## 3. 构建运行模型

### 3.1 `OntologyBuildRun`

字段建议：

- `id`
- `workspacePath`
- `ontologyId`
- `title`
- `method`
- `inputSourceIds`
- `status`
- `steps`
- `modelConfig`
- `validationSummary`
- `createdAt`
- `updatedAt`

方法：

```ts
export type OntologyBuildMethod =
  | 'decomposed'
  | 'cluster-first'
  | 'two-step'
  | 'framework-guided'
  | 'direct-draft';
```

状态：

```ts
export type OntologyBuildStatus =
  | 'draft'
  | 'running'
  | 'blocked'
  | 'needs-review'
  | 'completed'
  | 'failed';
```

### 3.2 `OntologyBuildStep`

步骤类型：

```ts
export type OntologyBuildStepKind =
  | 'collect-input'
  | 'extract-candidates'
  | 'cluster-feedback'
  | 'normalize-concepts'
  | 'extract-relations'
  | 'bind-evidence'
  | 'build-coverage-matrix'
  | 'validate-rules'
  | 'human-review'
  | 'publish-to-scene-library'
  | 'publish-to-prompt-draft'
  | 'publish-agent-knowledge-pack'
  | 'compose-campaign-cell'
  | 'execute-action-type'
  | 'write-action-log'
  | 'write-back-material-coverage'
  | 'export-interchange';
```

每个 step 至少保存：

- 输入引用。
- 模型和 prompt 版本。
- 输出摘要。
- 问题清单。
- blocked 原因。
- 人工修改记录。

## 4. 典型流程

### 4.1 产品卖点拆解流程

```text
产品 brief / SKU / 品牌知识库
-> 抽取功能、属性、卖点、收益、主张、禁用表达
-> 绑定产品规格和文档证据
-> 关联目标人群、痛点和场景
-> 生成卖点矩阵
-> 校验无证据主张和敏感表达
-> 品牌负责人审核
-> 输出场景卡和 PromptDraft
```

验收：

- 每条卖点都有 `sourceRefs`。
- 每条 claim 都有 evidence status。
- 禁止表达不能进入最终 Prompt。

### 4.2 评论痛点聚类流程

```text
评论 / 差评 / 客服问答
-> 清洗文本
-> 聚类用户问题
-> 命名痛点和异议
-> 提取用户原声
-> 映射到产品卖点或待补卖点
-> 生成选题矩阵
```

验收：

- 每个痛点至少有一条原声。
- LLM 推断和用户原话必须区分。
- 没有对应卖点的问题要进入产品资料待补清单。

### 4.3 场景穷举流程

```text
人群 + 痛点 + 卖点 + 证据 + 渠道目标
-> 生成候选组合
-> 去重和排序
-> 标记缺证据 / 缺素材 / 待审核
-> 选择 ready 组合
-> 生成图片 Prompt / 视频 Prompt / 文案角度
```

排序依据：

- 证据强度。
- 目标人群优先级。
- 渠道适配度。
- 已有素材覆盖。
- 风险等级。

### 4.4 IP Ontology 流程

```text
IP 知识库 / 访谈稿 / 课程材料
-> 抽取身份、观点、语言、方法论、故事、创作规则
-> 建立 IP 概念关系
-> 绑定原文引用
-> 生成平台场景
-> 审核口吻和禁区
-> 输出口播 / 文案 / 私域 Prompt
```

约束：

- 不把 IP 观点当产品功效证据。
- 不让不同平台生成互相冲突的人设。
- 所有 IP 场景延伸必须引用同一 IP 知识库版本。

### 4.5 成功素材回写流程

```text
审核通过素材
-> 读取 Prompt、输入源、生成参数、审核标签
-> 关联覆盖矩阵行
-> 标记表现原因
-> 更新素材覆盖状态
-> 为后续 SOP 排序提供依据
```

边界：

- 成功素材可以证明“这个组合产出过好素材”，不能证明产品事实。
- 从竞品参考图来的结构只能沉淀风格和构图，不复制可识别品牌元素。

### 4.6 Agent Knowledge 知识包发布流程

```text
审核通过的 Ontology
-> 选择发布范围和版本号
-> 写入 KNOWLEDGE.md frontmatter
-> 写入 ontology/ 数据文件
-> 写入 compiled/prompt-grounding.md
-> 校验 type、primaryOntology、runtime.mode 和 provenance
-> 发布到知识库目录或导出目录
```

验收：

- 独立包使用 `type: content-ontology`；作为品牌 / IP 知识包支撑层时，必须设置 `metadata.primaryOntology`。
- `ontology/` 只包含结构化数据，不包含 Skill、workflow、工具调用或 prompt 指令。
- 运行时只加载相关子图，不把完整 Ontology 注入 Prompt。
- 包校验失败时不覆盖已发布版本。

### 4.7 动态内容作战流程

```text
Signal: 热点 / 评论痛点 / 竞品动作 / 投放表现
-> Objective: 拉新 / 转化 / 异议解释 / 品牌信任
-> CampaignCell: 负责人 + Agent + 目标渠道 + 时间窗口
-> ResourceBundle: 卖点 + 证据 + 素材 + Prompt + SOP + 约束
-> DecisionGate: 证据、权限、品牌口径和平台规则校验
-> ActionType: 生成 Prompt / 发起审核 / 启动 SOP / 补证据
-> ActionLog: 记录输入、输出、阻断原因和复盘
-> FeedbackLoop: 更新覆盖矩阵、素材优先级和后续目标
```

适用：

- 热点出现后快速生成一组可审核内容角度。
- 竞品动作出现后，围绕差异化卖点生成反应内容。
- 评论里出现高频异议后，快速补证据、生成解释型内容。
- 某组素材表现好后，扩大到相似人群、渠道或场景。

约束：

- Signal 只是行动触发器，不是事实证据。
- CampaignCell 不是多人项目管理系统；MVP / v1 只围绕内容行动做轻量编组。
- ActionType 必须先通过 DecisionGate，不能绕过证据、审核和平台规则。
- ActionLog 记录行动效果，不把转化表现当作产品事实证据。

## 5. 校验规则

MVP 内置规则：

| 规则 | 说明 | 阻断级别 |
| --- | --- | --- |
| 主张必须有证据 | `claim` 没有 evidence 时标记待验证。 | warning / blocking 按行业配置 |
| 禁止表达拦截 | 命中 forbidden claim 或合规禁词。 | blocking |
| 重复概念合并 | alias 或语义高度相似。 | warning |
| 孤立概念检查 | 没有任何有效 relation。 | warning |
| 粒度过粗 | 如“效果好”“高品质”。 | warning |
| 粒度过细 | 如只出现一次且无复用价值的描述。 | info / warning |
| 来源缺失 | 没有 sourceRef。 | blocking |
| 待验证不能发布 | `needs-verification` 不进可发布 Prompt。 | blocking |
| 行动必须可追溯 | 标准动作必须写入 ActionLog。 | blocking |
| 信号不能替代证据 | 热点、竞品动作和投放表现不能直接支撑产品事实。 | blocking |
| CampaignCell 权限检查 | Agent 或操作者只能执行角色允许的 ActionType。 | blocking |

## 6. 人工审核任务

审核界面不应该让用户直接编辑复杂图，而应提供任务化列表：

- 待确认概念。
- 疑似重复概念。
- 无证据主张。
- 高风险表达。
- 关系冲突。
- 待合并 / 拆分概念。
- 覆盖矩阵 ready 组合确认。

审核动作：

- 通过。
- 驳回。
- 合并。
- 拆分。
- 改名。
- 降级为待验证。
- 标记禁止使用。

## 7. 发布到下游

### 7.1 发布到场景库

Coverage row 可以转换成 `SceneCard`：

```text
audience <- audience concept
problem <- pain-point concept
space <- scenario / space concept
action <- action concept
emotion <- emotion concept
complianceRules <- constraints
sourceRefs <- evidence and source refs
```

### 7.2 发布到 PromptDraft

PromptDraft 使用 `PromptGroundingContext`：

```text
允许使用的主张
可引用证据
目标人群和场景
渠道规则
语气规则
负面约束
禁止表达
```

### 7.3 发布到 SOP

SOP 可按矩阵行批量执行：

```text
选择 20 个 ready rows
-> 为每行生成 PromptDraft
-> 调用图片 / 文案 / 视频 Prompt
-> 审核
-> 回写 coverage
```

### 7.4 发布到 Agent Knowledge 知识包

发布包用于知识库和 Agent 客户端消费，不替代内部 Ontology Store。

```text
OntologyWorkspace
-> ontology-aware knowledge package
-> KNOWLEDGE.md
-> ontology/ontology.json
-> metadata.primaryOntology
-> runtime.mode=data
```

发布后，下游模块按任务选择子图：

```text
目标渠道 + 选中 coverage row
-> 相关概念和关系
-> 已批准主张
-> 证据摘录
-> 约束和禁用表达
-> PromptGroundingContext
```

### 7.5 执行 Operational Action

标准动作把覆盖矩阵、资源包和 SOP 变成可审计的操作：

```text
选择 Signal / Objective
-> 选择 ready coverage rows
-> 组合 ResourceBundle
-> 检查 DecisionGate
-> 执行 ActionType
-> 写入 ActionLog
-> 回写 CoverageMatrix / FeedbackLoop
```

推荐最小 ActionType：

| ActionType | 输出 | 必要闸口 |
| --- | --- | --- |
| `generate-prompt-draft` | `PromptDraft` | 主张已审核、禁用表达已拦截。 |
| `generate-scene-cards` | `SceneCard[]` | 场景组合 ready。 |
| `launch-sop-run` | `WorkflowRun` | SOP 输入合法，素材和模型配置可用。 |
| `request-evidence` | 补证据任务 | 缺证据主张存在 sourceRef 或待补说明。 |
| `request-review` | 审核任务 | 有候选概念、主张或矩阵行。 |
| `write-back-material-coverage` | Coverage update | 素材已审核。 |

## 8. 失败和 blocked 状态

| 场景 | 处理 |
| --- | --- |
| 未配置文字模型 | `blocked:text-provider`，不生成候选 Ontology。 |
| 输入源无法解析 | 保留文件记录，标记 `blocked:input-parse`。 |
| 证据不足 | 生成 draft，但主张为 `needs-verification`。 |
| 组合过多 | 分批生成，优先输出高证据、高优先级组合。 |
| 人审未完成 | 不发布到场景库或 PromptDraft。 |
| Agent Knowledge 包校验失败 | 保留内部事实源，不覆盖已发布知识包。 |
| DecisionGate 未通过 | 不执行 ActionType，写入 `blocked:decision-gate`。 |
| 操作者权限不足 | 不执行动作，写入 `blocked:permission`。 |
| 导出失败 | 不影响本地 Ontology 事实源。 |

## 9. 设计边界

- 不用 prompt 让模型直接“给我最终本体并发布”。
- 不把聚类名称当事实；聚类名是组织方式，用户原声才是证据。
- 不把模型推断当高强度证据。
- 不让普通用户必须学习 RDF、OWL、SPARQL。
- 不跳过人工审核来追求自动化完整度。
- 不把 Agent Knowledge `ontology/` 目录写成可执行 Skill、workflow 或 prompt 指令。
- 不把 Operational Ontology 做成自动发帖、刷量或舆论操控系统。
- 不把 CampaignCell 扩展成通用项目管理；只服务内容目标、资源组合、动作执行和复盘。
