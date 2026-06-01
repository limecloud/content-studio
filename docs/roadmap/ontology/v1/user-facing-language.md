# v1 用户可见命名和产品边界

更新时间：2026-05-31
状态：Local Verified / Production Evidence Pending

## 1. 设计结论

普通使用者不需要知道 `Ontology`。`Ontology`、`Concept`、`Relation`、`CoverageMatrix`、`PromptGroundingContext`、`ActionLog` 这些词只允许出现在工程实现、导出标准、调试信息和面向内容工程师的高级说明里。

产品界面要把这套能力包装成用户能直接理解的内容生产对象：

```text
Ontology -> 内容知识地图
Concept -> 知识点 / 卖点 / 痛点 / 人群 / 场景
Relation -> 关联关系
CoverageMatrix -> 卖点矩阵 / 场景矩阵 / 素材覆盖表
PromptGroundingContext -> 提示词依据
ActionLog -> 行动记录
KnowledgeRelease -> 团队知识包版本
Signal -> 内容信号
Objective -> 作战目标
CampaignCell -> 作战单元
ResourceBundle -> 资源包
DecisionGate -> 发布检查
ExecutionQueue -> 执行队列
```

用户关心的是“我能不能稳定拆卖点、穷举场景、知道缺什么素材、让团队复用同一套口径，并把市场信号快速编组成内容行动”，不是“我在构建本体论”。

## 2. 用户分层

| 用户 | 是否看到 Ontology 术语 | 应看到的产品语言 |
| --- | --- | --- |
| 普通运营 | 不看到。 | 内容知识地图、卖点矩阵、场景矩阵、审核任务、素材缺口、团队知识包、品牌战情室。 |
| 品牌负责人 | 不看到。 | 品牌口径、可用主张、证据状态、风险提醒、发布版本。 |
| 审核人员 | 不看到。 | 主张、证据、来源、禁用表达、审核结论、风险等级。 |
| 内容工程师 | 可在高级模式看到。 | 内容知识地图为主，内部字段和导出路径可显示技术名。 |
| 开发者 / Agent 客户端 | 可以看到。 | `OntologyWorkspace`、`Concept`、`Relation`、`metadata.primaryOntology` 等协议对象。 |

## 3. 命名映射

| 内部术语 | 用户可见名称 | 使用位置 |
| --- | --- | --- |
| `OntologyWorkspace` | 内容知识地图 / 项目知识地图 | 顶部导航、工作区列表、团队共享。 |
| `Concept` | 知识点 | 只在需要泛化时使用；更多时候直接叫卖点、痛点、人群、场景。 |
| `Relation` | 关联关系 | 高级详情、审核解释。 |
| `Evidence` | 证据 / 来源 | 审核任务、主张详情、风险提示。 |
| `Constraint` | 规则 / 禁用表达 / 品牌边界 | 审核任务、生成设置。 |
| `CoverageMatrix` | 卖点矩阵 / 场景矩阵 / 素材覆盖表 | 主视图、筛选、发布入口。 |
| `PromptGroundingContext` | 提示词依据 | 生成前预览、Prompt 工作台。 |
| `Signal` | 市场信号 / 内容信号 | 品牌战情室、复盘。 |
| `Objective` | 作战目标 | 品牌战情室、作战编组、SOP。 |
| `CampaignCell` | 作战单元 | 作战编组、执行队列。 |
| `ResourceBundle` | 资源包 | 作战编组、SOP。 |
| `DecisionGate` | 发布检查 / 执行检查 | 审核、发布、SOP。 |
| `ActionLog` | 行动记录 | 复盘、追溯。 |
| `ExecutionQueue` | 执行队列 | 作战系统、动作交接。 |
| `DraftChange` | 变更包 / 未同步草稿 | 团队共享、导入导出。 |
| `KnowledgeRelease` | 团队知识包版本 | 团队共享、运行时选择。 |
| Agent Knowledge 包 | 团队知识包 / Agent 知识包 | 发布和高级设置。 |

## 4. 导航建议

不建议在主导航直接放 `Ontology`。

建议导航：

```text
内容知识地图
卖点矩阵
场景矩阵
审核任务
团队知识包
品牌战情室
作战编组
执行队列
素材回写
行动记录
```

高级设置或开发者模式中可以出现：

```text
Ontology 导出
Agent Knowledge v0.7.2
JSON-LD / RDF 导出
内部对象 ID
```

## 5. 文案规则

产品 UI 文案必须遵守：

- 不对普通用户解释“什么是 Ontology”。
- 不把按钮命名为“构建 Ontology”，改为“生成知识地图”或“生成卖点矩阵”。
- 不把错误提示写成“Ontology validation failed”，改为“知识地图检查未通过”。
- 不把 `coverage row` 展示给用户，改为“矩阵组合”或“内容组合”。
- 不把 `DecisionGate blocked` 展示给用户，改为“发布检查未通过”。
- 不把 `DraftChange` 展示给普通用户，改为“变更包”或“未同步草稿”；高级详情可显示技术名。
- 不把页面命名或空态写成“功能概览”“能力中心”“功能清单”“入口合集”“模块入口”或“功能罗列”。
- 不把 `Provider` 展示给普通用户，改为“生成服务”。
- 不把 `manifest` 展示给普通用户，改为“清单文件”。
- 不把 `blocked` 展示给普通用户，按原因改为“生成服务待配置”“发布检查未通过”“待补资料”或“暂不可用”。
- 不把按钮做成并列能力矩阵；每个页面只保留一个当前主动作。

业务页面第一屏必须回答：

```text
用户正在处理什么对象
当前缺什么
下一步点什么
系统如何反馈
完成后交付到哪里
```

## 6. UI 信息架构

普通用户第一屏应该看到业务结果，而不是图谱术语：

| 页面 | 第一优先级 | 第二优先级 | 高级信息 |
| --- | --- | --- | --- |
| 内容知识地图 | 知识地图质量、输入源、可用矩阵。 | 最近构建、缺证据、待审核。 | 内部对象数量、schemaVersion。 |
| 卖点矩阵 | 卖点、适用人群、证据状态、可生成内容。 | 缺素材、缺证据、风险。 | conceptIds、relationIds。 |
| 场景矩阵 | 人群、痛点、场景、渠道、内容角度。 | 优先级、推荐动作。 | coverageRowIds。 |
| 审核任务 | 主张、来源、证据、风险、建议。 | 通过 / 驳回 / 补证据。 | validation issue id。 |
| 团队知识包 | 当前版本、发布人、更新时间、下游消费。 | 变更包、冲突、回滚。 | Agent Knowledge 文件路径。 |
| 品牌战情室 | 信号雷达、目标树、今日战役、风险摘要。 | 创建作战目标、选择优先级。 | Signal / Objective id。 |
| 作战编组 | 作战目标、资源包、负责人、渠道、发布检查。 | 组包、送审、生成执行队列。 | ResourceBundle / CampaignCell id。 |
| 执行队列 | 可执行、待审核、待补资源、已拦截动作。 | 执行动作、补资源、查看未通过原因。 | ActionType / queue item id。 |
| 素材回写 | 素材覆盖、高表现组合、缺口任务。 | 回写覆盖、创建补素材任务。 | materialCoverage id。 |

## 7. 验收标准

- 普通用户主路径不出现 `Ontology`、`Concept`、`Relation`、`CoverageMatrix`、`PromptGroundingContext` 等英文工程术语。
- 空状态、按钮、错误提示、确认弹窗使用业务语言。
- 高级模式可以展示内部对象名，但必须作为调试 / 导出信息。
- 文档、代码和导出协议仍保留内部术语，避免工程模型失真。
- 用户测试中，运营角色能在不知道 Ontology 概念的情况下完成卖点拆解、场景穷举、审核、团队共享、作战编组、执行队列处理和复盘回写。
