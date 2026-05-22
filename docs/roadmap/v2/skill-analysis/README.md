# 楚川流程 Skill 包分析

更新时间：2026-05-20
状态：Draft
分析对象：`/Users/coso/Documents/other/skills`

## 1. 解压结果

已将 5 个 `.skill` 包解压到 `docs/roadmap/v2/skill-analysis/extracted/`，原始文件未修改。

| 原始包 | 解压位置 | 结构说明 |
| --- | --- | --- |
| `ip-knowledge-base-builder.skill` | `extracted/ip-knowledge-base-builder/` | IP 知识库构建器，含主控 `SKILL.md`、六层架构和质量标准。 |
| `copywriting-master.skill` | `extracted/copywriting-master/` | 商业文案方法论，含主控 `SKILL.md` 和文案工具箱。 |
| `moments-copywriter.skill` | `extracted/` 根目录 | 朋友圈文案执行器，包内没有顶层目录，因此 `SKILL.md`、`QUALITY-AUDIT.md` 和 `references/` 直接位于解压根目录。 |
| `article-typesetting-master.skill` | `extracted/article-typesetting-master/` | 文章排版执行器，含平台规范、图文混排和模板。 |
| `ppt-master-高级.skill` | `extracted/ppt-master/` | PPT 全流程执行器，含 4 个场景引擎和共享设计/叙事体系。 |

注意：这些包中有明确版权或作者声明。产品设计上应吸收其“流程抽象”和“执行器模式”，不要未经授权直接复制第三方方法论内容作为内置商业模板。

## 2. 总体判断

这些 `.skill` 不是普通提示词，而是“方法论执行器”。它们把一个专家流程拆成：

```text
触发条件
-> 输入诊断
-> 场景 / 模式路由
-> 按需加载参考知识
-> 结构化生成
-> 质量评分 / 自检
-> 输出协议
```

这说明楚川流程不是“知识库直接生成内容”，而是：

```text
原始素材 / 知识库
-> 先变成可调用的知识体系或场景库
-> 再按具体业务目标选择 Skill 执行器
-> 生成文案、排版、PPT、Prompt 或其他交付物
-> 通过评分和自检回收为可复用资产
```

对布谷 v2 的关键启发是：系统不应该只保存 Prompt 文本，而应该保存 `SkillDefinition`、输入 schema、路由规则、输出 artifact 类型、质量检查和引用来源。

## 3. Skill 总览

| Skill | 在流程中的位置 | 输入 | 处理方式 | 输出 | 质量门槛 |
| --- | --- | --- | --- | --- | --- |
| `ip-knowledge-base-builder` | 上游知识库构建 | 访谈稿、个人介绍、聊天记录、简历、文章、视频文字稿、课程材料 | 先做素材诊断，再按六层 IP 知识库架构归类 | IP 知识库 Markdown、缺口清单、体检报告 | KQS：原声密度、细节具体度、判断力深度、声音辨识度、任务覆盖度、禁区清晰度 |
| `copywriting-master` | 下游商业文案生成 | 产品名、核心特点、受众、缺陷、使用场景、文案规格 | 用户视角分析、单一卖点提炼、技巧匹配、多版本输出 | 广告语、产品文案、品牌文案、营销短文案 | 禁用词、动词替代形容词、画面感、单一卖点、用户视角 |
| `moments-copywriter` | IP 私域 / 朋友圈运营 | 人设目标、行业、受众、风格、具体发布意图或原文案 | 四模式路由：创作、诊断、批量、日历；20 场景案例路由 | 朋友圈文案、诊断报告、批量内容、内容日历 | MQS：社交货币、钩子力、人设温度、折叠线、互动设计、视觉协同 |
| `article-typesetting-master` | 长文交付和平台适配 | 原始文章、目标平台、输出格式、配图需求 | BRL 排版系统，按平台加载规范和模板 | Markdown、公众号 HTML、小红书纯文本、排版规则指南 | 呼吸感、节奏感、层次感、平台格式限制、自检清单 |
| `ppt-master` | IP 产品化 / 提案 / 课程材料 | 主题、受众、目标、时长、风格、已有素材 | 五阶段：诊断、构思、内容、设计、交付；4 大场景引擎 | PPT 大纲、逐页脚本、演讲稿、视觉规范、交付检查 | 逻辑完整性、内容质量、设计规范、页数和演讲时长匹配 |

## 4. 楚川过程中可能的使用顺序

### 4.1 IP 运营链路

```text
访谈稿 / 课程内容 / 聊天记录 / 个人经历
-> ip-knowledge-base-builder
-> 六层 IP 知识库
-> 根据目标选择下游 Skill
   -> moments-copywriter：朋友圈、私域、个人 IP 日常运营
   -> copywriting-master：商业文案、产品卖点、转化文案
   -> article-typesetting-master：公众号、小红书、知乎等文章排版
   -> ppt-master：课程、提案、汇报、付费产品材料
-> 产物审核
-> 成功内容回收入库
```

这里的关键不是“用一个 IP 知识库回答所有问题”，而是先把 IP 的身份、观点、语言、判断力和素材库建起来，再由不同场景执行器调用。这样才能避免每个场景重新发明人设。

### 4.2 品牌 / 产品内容链路

当前 5 个包里没有专门的“品牌场景库构建器”，但可以推断楚川流程会这样使用：

```text
品牌 / 产品知识库
-> 场景库：人群、问题、空间、动作、情绪、镜头、合规边界
-> 提示词组：图片 Prompt、图生视频 Prompt、文案 Prompt
-> copywriting-master：卖点和商业文案
-> article-typesetting-master：平台文章排版
-> 可选视频 Prompt 外部生成
-> 素材库 / 混剪素材包
```

所以布谷 v2 应补一个自有的 `brand-scene-builder` 能力：它不直接生成图片 Prompt，而是先把品牌 / 产品知识库抽成结构化场景卡，再由 Prompt 生成器下游生产图片、视频和文案提示词。

### 4.3 无知识库玩法

这些 Skill 也提示了一个方向：知识库不是唯一入口。很多执行器只需要明确输入字段和目标场景，例如：

```text
产品资料 + 使用场景
-> copywriting-master
-> 商业文案
```

```text
原始文章 + 平台
-> article-typesetting-master
-> 平台适配排版
```

```text
发布目标 + 人设粗画像
-> moments-copywriter
-> 朋友圈文案 / 内容日历
```

这与 v2 的“无知识库扒图、参考视频拆解、产品资料结构化”一致。系统应该允许输入源直接进入 Skill 执行器，不强制先建知识库。

## 5. 每个 Skill 的实际用法

### 5.1 `ip-knowledge-base-builder`

它是上游的“知识库炼制器”，不是内容生成器。使用过程：

1. 用户提供 IP 原始素材。
2. Agent 先输出素材诊断：素材类型、字数、密度、明显缺口、预计输出。
3. Agent 按六层结构生成知识库。
4. 每段内容标注来源：原声、推断、待补充。
5. 末尾输出知识库体检报告。
6. 再引导用户选择：直接使用、补充采集、生成话术、生成内容。

对产品的映射：

| 产品对象 | 映射字段 |
| --- | --- |
| `IpKnowledgeBase` | 六层结构、版本、完整度、来源引用 |
| `IpKnowledgeLayer` | 身份锚定、价值观立场、声音语言、判断逻辑、内容素材、创作引擎 |
| `QualityReport` | KQS 分数、缺口、当前可支撑任务、尚不支撑任务 |
| `AgentPromptSession` | 素材诊断、多轮补充、知识库更新记录 |

必须保留的产品原则：

- 缺素材时标记待补充，不编造。
- 原声优先，推断必须标注。
- 失败经历、判断逻辑和禁区比简历更重要。
- 输出目标是让后续 AI 能调用，而不是写一篇漂亮人物介绍。

### 5.2 `copywriting-master`

它是商业文案执行器，适合品牌 / 产品链路的文案侧。使用过程：

1. 收集产品名称、核心特点、目标受众、产品缺陷、使用场景、文案规格。
2. 从用户视角分析痛点、需求和场景。
3. 只选一个核心卖点。
4. 根据场景选择技巧：形容词转动词、情绪词、缺陷转化、画面感、数字、帮消费者问问题。
5. 输出多个文案方案和推荐理由。
6. 执行禁用词、画面感、单一卖点等自检。

对产品的映射：

| 产品对象 | 映射字段 |
| --- | --- |
| `ScenarioSkill` | `copywriting-master` |
| `SkillInputSchema` | 产品、受众、场景、缺陷、规格、目标平台 |
| `PromptDraft` | 文案生成提示词或最终文案 |
| `QualityCheck` | 禁用词、单一卖点、用户视角、画面感 |

它适合接在品牌 / 产品知识库、产品 brief、SKU 表和场景库后面，不适合作为 IP 知识库构建入口。

### 5.3 `moments-copywriter`

它是朋友圈 / 私域运营执行器，最能体现“场景路由 + 质检评分”。使用过程：

1. 判断用户请求属于创作、诊断、批量、日历中的哪一种。
2. CREATE 模式下匹配 20 个朋友圈场景之一。
3. 按场景读取案例文件，学习结构和策略，不照抄文字。
4. 结合人设画像：目标、行业、风格、受众。
5. 输出文案正文、配图建议、评论区策略。
6. 用 MQS 六维评分或 12 项 Self-Check 检查。

对产品的映射：

| 产品对象 | 映射字段 |
| --- | --- |
| `SkillMode` | `create`、`diagnose`、`batch`、`calendar` |
| `SkillRoute` | 20 个朋友圈场景路由 |
| `IpScenarioKnowledgeBase` | 朋友圈运营场景库、内容节奏、评论区策略 |
| `QualityScore` | MQS 六维评分和评级 |

这类 Skill 不只是生成一条文案，还会生成运营建议。布谷如果要承接它，应把“配图建议、评论区策略、发布时间、场景分类”作为结构化产物保存，而不是只保存正文。

### 5.4 `article-typesetting-master`

它是内容交付阶段的排版执行器，适合在文章正文生成后使用。使用过程：

1. 诊断原文类型、目标平台、长度、结构和配图状态。
2. 按 BRL 系统处理呼吸感、节奏感和层次感。
3. 根据平台加载规范：公众号、小红书、知乎、头条、邮件 / 博客。
4. 输出 Markdown、HTML 或排版规则指南。
5. 进行排版自检。

对产品的映射：

| 产品对象 | 映射字段 |
| --- | --- |
| `ArticleArtifact` | 原文、排版稿、平台、格式 |
| `PlatformSpec` | 字数、段落、标题、图片、HTML / Markdown 限制 |
| `ExportFormat` | Markdown、HTML、纯文本、规则指南 |
| `QualityCheck` | 段落长度、视觉断点、标题层级、平台限制 |

它说明 v2 的“文章生成”不应该停在正文，还需要一个平台适配阶段。正文、排版稿和最终导出稿应该是不同 artifact。

### 5.5 `ppt-master`

它是更复杂的交付执行器，适合 IP 产品化、课程、路演、汇报和提案材料。使用过程：

1. 先做六要素诊断：场景、受众、目标、时间、风格、素材现状。
2. 路由到 4 个引擎：路演、汇报、提案、培训。
3. 用故事线框架提炼核心信息和大纲。
4. 按引擎生成逐页内容。
5. 用设计系统和配色库生成视觉规范。
6. 用交付清单完成自审。

对产品的映射：

| 产品对象 | 映射字段 |
| --- | --- |
| `PresentationArtifact` | 大纲、逐页脚本、演讲稿、视觉规范 |
| `SkillEngine` | pitch、report、proposal、training |
| `DeliveryChecklist` | 逻辑、内容、设计、时长、演讲备注 |
| `IpScenarioKnowledgeBase` | 课程、提案、付费产品材料 |

这类 Skill 证明“场景延伸知识库”不仅是文案场景，也包括更高客单价的产品化材料。

## 6. 对布谷 v2 的模型补充

建议在现有 `WorkflowDefinition` 之外补充 Skill 抽象：

```ts
export interface SkillDefinition {
  id: string;
  name: string;
  title: string;
  version: string;
  source: 'internal' | 'imported' | 'licensed';
  category: 'knowledge-builder' | 'copywriting' | 'private-domain' | 'typesetting' | 'presentation' | 'prompt-builder';
  triggerRules: SkillTriggerRule[];
  inputSchema: SkillInputField[];
  modes: SkillMode[];
  routes: SkillRoute[];
  requiredReferences: SkillReference[];
  outputArtifacts: SkillOutputArtifact[];
  qualityChecks: SkillQualityCheck[];
  guardrails: string[];
}
```

```ts
export interface SkillRun {
  id: string;
  skillDefinitionId: string;
  workspacePath: string;
  inputSourceIds: string[];
  knowledgeBaseIds: string[];
  mode?: string;
  route?: string;
  status: 'draft' | 'running' | 'waiting-user' | 'blocked' | 'completed' | 'failed';
  turns: AgentPromptTurn[];
  outputArtifactIds: string[];
  qualityReportId?: string;
  sourceRefs: WorkflowSourceRef[];
  createdAt: string;
  updatedAt: string;
}
```

这样可以把 `.skill` 包抽象为产品可管理的能力，而不是写死在某个页面里。

## 7. 对 v2 路线图的修正建议

现有 v2 文档已经把品牌 / 产品知识库和 IP 知识库拆开。基于这批 Skill，还需要补充三点：

1. **Skill 是 SOP 的执行单元**  
   `WorkflowDefinition` 描述流程，`SkillDefinition` 描述某一步怎么执行、怎么路由、怎么质检。一个 SOP 可以调用多个 Skill。

2. **知识库构建和内容生成是两类 Skill**  
   `ip-knowledge-base-builder` 是知识库构建器；`copywriting-master`、`moments-copywriter`、`article-typesetting-master`、`ppt-master` 是下游内容执行器。两者不能混为一类。

3. **质量评分需要结构化保存**  
   KQS、MQS、排版自检、PPT 自审都应该统一为 `QualityReport`，并关联到 `SkillRun` 和 artifact。否则团队无法复盘为什么某次产物可用。

## 8. 建议优先级

### P0：先做自有 Skill 运行模型

- 支持导入或登记 `SkillDefinition`。
- 支持 `SkillRun` 保存输入、模式、路由、输出和质量报告。
- 先内置自有抽象，不直接商业化复制第三方包内容。

### P0：IP 知识库构建器产品化

- 支持原始素材导入。
- 支持六层结构展示。
- 支持素材诊断和体检报告。
- 支持缺口追问和版本更新。

### P0：品牌场景库构建器补齐

- 这批包缺少品牌 / 产品场景库构建器，但我们的主链必须有。
- 输入品牌 / 产品知识库后，先生成结构化 `SceneLibrary`。
- 再生成图片 / 图生视频 Prompt 组。

### P1：下游内容 Skill

- 朋友圈 / 私域文案。
- 商业文案。
- 文章排版。
- PPT / 课程 / 提案材料。

### P1：统一质量报告

- `QualityReport` 支持分数、维度、问题、建议、是否通过。
- 在审核台中展示质量报告。
- 成功素材回炉时记录对应评分。

## 9. 产品落地方式

推荐不要把 Skill 做成普通 canvas 节点拖拽起步，而是按三层使用：

| 层级 | 面向用户 | 交互 |
| --- | --- | --- |
| Agent 会话层 | 运营、IP 主理人 | 上传素材、说明目标、多轮调整 |
| SOP 表单层 | 日常执行用户 | 选择玩法、填写字段、运行 |
| Skill 管理层 | 内容工程师 | 管理 Skill 定义、输入 schema、路由和质检 |

Canvas 可以作为高级视图展示 SOP 如何调用多个 Skill，但不能成为唯一入口。

## 10. 结论

楚川这套流程的核心不是单个 Prompt，而是“可复用方法论 + 场景路由 + 质量检查”的执行体系。对布谷 v2 来说，正确做法是：

```text
输入源
-> 知识体系或场景库
-> SkillDefinition 选择和路由
-> Agent 多轮执行
-> 结构化 artifact
-> QualityReport
-> 审核 / 入库 / 复用
```

短期应优先实现 IP 知识库构建器、品牌场景库构建器和 SkillRun 记录模型。下游朋友圈、商业文案、文章排版和 PPT 可以作为第一批场景 Skill，但需要以自有模板和授权内容落地，避免直接把第三方 `.skill` 原文作为产品内置资产。
