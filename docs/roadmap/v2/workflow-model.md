# 布谷AI内容工厂 v2 工作流模型

更新时间：2026-05-20
状态：Draft

## 1. 设计结论

v2 的核心抽象不是页面，也不是 canvas，而是“知识体系 + 场景库 + Prompt 草稿 + 可执行 SOP”。`WorkflowDefinition` 负责描述已经跑顺的 SOP；Prompt 的生成和调整可以来自品牌 / 产品知识库抽取的场景库，也可以来自 IP 知识库的运营场景库，还可以来自视觉模型对参考图 / 参考视频的反推，或来自产品资料、SKU 表、竞品内容和历史成功素材。

```text
BrandKnowledgeBase 负责品牌 / 产品事实、卖点和合规边界
IpKnowledgeBase 负责个人 IP 的身份、价值观、语言、方法论、素材和创作引擎
SceneLibrary 负责把知识库抽成可生产场景
PromptGroup 负责把场景转成可复制提示词组
WorkflowInputSource 负责统一记录参考图、参考视频、产品资料、SKU 表和竞品内容
AgentPromptSession 负责按用户意图读取知识体系和输入源并多轮调整 Prompt
PromptDraft 负责保存可编辑、可确认、可物化的 Prompt
WorkflowDefinition 负责描述 SOP
WorkflowRun 负责记录一次执行
WorkflowStep 负责复用能力
WorkflowArtifact 负责统一沉淀结果
Canvas 负责可视化编辑，不负责存储事实
```

当前 runtime 已落地的 `WorkflowStepKind` 以 `src/shared/types.ts` 为准：
`input`、`build-brand-knowledge-base`、`agent-read`、`reference-reverse`、`generate-prompt-pack`、`generate-scene-library`、`generate-prompt-group`、`prompt-generate`、`image-generate`、`video-prompt`、`review`、`asset-store`、`export`。
更细的结构化抽取、质量检查、导入视频和打标能力仍属于下一阶段扩展候选，下文后面的模型示例会在需要时继续展开。

## 2. 为什么不能只做 canvas

canvas 适合看依赖和编排复杂流程，但不能作为唯一交互：

- 简单 SOP 用 canvas 会变慢。
- 文本 diff 和版本审阅困难。
- 输入 schema、审核规则和导出规则不容易在画布上表达完整。
- 普通运营只需要选择 SOP、填字段、点生成。
- 复杂流程才需要拉线和节点编辑。

因此 v2 采用双视图：

| 视图 | 用户 | 用途 |
| --- | --- | --- |
| 品牌场景库 | 品牌运营 / 短视频运营 | 从品牌 / 产品知识库抽取场景，再生成提示词组。 |
| IP 知识库 | IP 主理人 / IP 运营 | 构建六层 IP 知识库，并延伸运营场景库。 |
| Prompt 工作台 | 运营 / 内容负责人 | 选择场景库或输入源，说明意图，多轮调整 Prompt。 |
| 对标反推视图 | 运营 / 设计助理 | 上传参考图 / 视频，反推结构、风格和 Prompt。 |
| SOP 表单视图 | 运营 / 内容人员 | 执行固定流程。 |
| 运行详情视图 | 审核 / 复盘人员 | 查看步骤、输入、输出和错误。 |
| Canvas 编排视图 | 内容工程师 | 编辑复杂依赖、分支和并行。 |

## 3. 输入源和 Agent 会话草案

### 3.1 统一输入源

```ts
export type WorkflowInputSourceKind =
  | 'brand-knowledge-document'
  | 'ip-knowledge-document'
  | 'knowledge-document'
  | 'reference-image'
  | 'reference-video'
  | 'product-brief'
  | 'sku-table'
  | 'competitor-content'
  | 'user-feedback'
  | 'successful-asset'
  | 'ip-scenario-kb'
  | 'manual-text';

export interface WorkflowInputSource {
  id: string;
  workspacePath: string;
  kind: WorkflowInputSourceKind;
  title: string;
  sourcePath?: string;
  text?: string;
  artifactId?: string;
  metadata: Record<string, unknown>;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeBaseDocument {
  id: string;
  workspacePath: string;
  title: string;
  sourcePath: string;
  markdownPath?: string;
  documentType: 'ip' | 'brand-product' | 'product-project' | 'pain-point' | 'competitor' | 'generic';
  tags: string[];
  summary?: string;
  createdAt: string;
  updatedAt: string;
}
```

`successful-asset` 同时覆盖两类事实：一类是用户导入或模型生成后通过审核的真实图片 / 视频素材；另一类是从成功素材反向沉淀出的 Prompt 追溯输入源。后者必须带 `prompt-distilled` 标签，只参与 PromptDraft 和 SOP artifactRefs 追溯，不再进入素材库 / 混剪包的媒体候选列表，避免同一路径产生重复候选或丢失原审核状态。

`KnowledgeBaseDocument` 可以继续保留，用于管理 DOCX / Markdown 原文和转换稿。品牌 / 产品知识库和 IP 知识库不能只包装成泛化 `knowledge-document`，需要分别生成 `BrandKnowledgeBase` 或 `IpKnowledgeBase`，再进入场景库或 Prompt 会话。

### 3.2 品牌 / 产品知识库、IP 知识库和场景库

```ts
export interface BrandKnowledgeBase {
  id: string;
  workspacePath: string;
  title: string;
  documentIds: string[];
  brandTone?: string;
  productFacts: string[];
  sellingPoints: string[];
  targetAudiences: string[];
  complianceRules: string[];
  sourceRefs: WorkflowSourceRef[];
  createdAt: string;
  updatedAt: string;
}

export interface IpKnowledgeBase {
  id: string;
  workspacePath: string;
  title: string;
  documentIds: string[];
  version: string;
  layers: IpKnowledgeLayer[];
  completenessScore?: number;
  sourceRefs: WorkflowSourceRef[];
  createdAt: string;
  updatedAt: string;
}

export interface IpKnowledgeLayer {
  key:
    | 'identity-anchor'
    | 'values-and-positions'
    | 'voice-and-language'
    | 'decision-logic'
    | 'content-materials'
    | 'creation-engine';
  title: string;
  status: 'missing' | 'partial' | 'complete';
  items: string[];
  sourceRefs: WorkflowSourceRef[];
}

export interface SceneLibrary {
  id: string;
  workspacePath: string;
  title: string;
  sourceKind: 'brand-product' | 'ip-operation' | 'reference-reverse' | 'mixed';
  brandKnowledgeBaseId?: string;
  ipKnowledgeBaseId?: string;
  sceneCards: SceneCard[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface SceneCard {
  id: string;
  title: string;
  audience: string;
  problem: string;
  season?: string;
  space: string;
  action: string;
  emotion: string;
  camera: string;
  complianceRules: string[];
  outputUsage: Array<'image' | 'video-prompt' | 'copy' | 'green-screen-card'>;
  sourceRefs: WorkflowSourceRef[];
}

export interface PromptGroup {
  id: string;
  workspacePath: string;
  sceneLibraryId?: string;
  sceneCardIds: string[];
  usage: 'image' | 'video-prompt' | 'copy' | 'green-screen-card' | 'sop' | 'skill';
  prompts: PromptDraft[];
  status: 'draft' | 'confirmed' | 'materialized';
  createdAt: string;
  updatedAt: string;
}
```

### 3.3 Agent 会话和 Prompt 草稿

```ts

export interface AgentPromptSession {
  id: string;
  workspacePath: string;
  title: string;
  inputSourceIds: string[];
  documentIds?: string[];
  brandKnowledgeBaseId?: string;
  ipKnowledgeBaseId?: string;
  sceneLibraryId?: string;
  promptGroupId?: string;
  userIntent: string;
  mode: 'brand-scene-agent' | 'ip-knowledge-agent' | 'knowledge-agent' | 'reference-reverse' | 'mixed' | 'batch';
  status: 'draft' | 'running' | 'waiting-user' | 'confirmed' | 'archived';
  turns: AgentPromptTurn[];
  confirmedPromptId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AgentPromptTurn {
  id: string;
  role: 'user' | 'agent';
  content: string;
  sourceRefs?: WorkflowSourceRef[];
  createdAt: string;
}

export interface WorkflowSourceRef {
  sourceId: string;
  kind: WorkflowInputSourceKind | 'model-output' | 'manual';
  label?: string;
  excerpt?: string;
  path?: string;
  range?: string;
  artifactId?: string;
}

export interface PromptDraft {
  id: string;
  workspacePath: string;
  sessionId: string;
  title: string;
  prompt: string;
  usage: 'copy' | 'image' | 'video-prompt' | 'green-screen-card' | 'sop' | 'skill';
  status: 'draft' | 'confirmed' | 'materialized';
  sourceInputSourceIds: string[];
  sceneCardIds?: string[];
  sourceRefs: WorkflowSourceRef[];
  createdAt: string;
  updatedAt: string;
}
```

## 4. 核心类型草案

```ts
export type WorkflowPlatform =
  | 'wechat'
  | 'xiaohongshu'
  | 'douyin'
  | 'video-account'
  | 'bilibili'
  | 'zhihu'
  | 'ecommerce-detail'
  | 'generic';

export type WorkflowStepKind =
  | 'collect-input'
  | 'agent-read-knowledge'
  | 'build-brand-knowledge-base'
  | 'build-ip-knowledge-base'
  | 'generate-scene-library'
  | 'generate-prompt-group'
  | 'analyze-reference-image'
  | 'analyze-reference-video'
  | 'reverse-engineer-prompt'
  | 'structure-product-brief'
  | 'cluster-user-feedback'
  | 'refine-prompt'
  | 'confirm-prompt'
  | 'generate-prompt-pack'
  | 'generate-copy'
  | 'generate-image'
  | 'generate-green-screen-card'
  | 'create-video-prompt'
  | 'mark-video-prompt-copied'
  | 'import-video-file'
  | 'quality-check'
  | 'review'
  | 'tag-assets'
  | 'export-package';

export type WorkflowRunStatus =
  | 'draft'
  | 'ready'
  | 'running'
  | 'waiting-review'
  | 'waiting-user'
  | 'succeeded'
  | 'failed'
  | 'blocked'
  | 'cancelled';

export type WorkflowArtifactKind =
  | 'copy'
  | 'title'
  | 'prompt'
  | 'prompt-group'
  | 'scene-card'
  | 'scene-library'
  | 'analysis'
  | 'image'
  | 'green-screen-card'
  | 'video-prompt'
  | 'video-clip'
  | 'markdown'
  | 'manifest';
```

## 5. WorkflowDefinition

工作流定义是 SOP 的事实源。

```ts
export interface WorkflowDefinition {
  id: string;
  version: string;
  name: string;
  description?: string;
  platform: WorkflowPlatform;
  category: 'copy' | 'image' | 'video-material' | 'mixed-package';
  inputSchema: WorkflowInputField[];
  inputSourceRequirements: WorkflowInputSourceRequirement[];
  promptSessionPolicy?: WorkflowPromptSessionPolicy;
  steps: WorkflowStepDefinition[];
  artifactRules: WorkflowArtifactRule[];
  reviewPolicy: WorkflowReviewPolicy;
  exportProfiles: WorkflowExportProfile[];
  builtin?: boolean;
  createdAt: string;
  updatedAt: string;
}
```

### 5.1 输入字段

```ts
export interface WorkflowInputField {
  key: string;
  label: string;
  kind: 'text' | 'textarea' | 'single' | 'multi' | 'image-list' | 'video-list' | 'file-list';
  required?: boolean;
  options?: string[];
  defaultValue?: string | string[];
  helpText?: string;
}
```

### 5.2 输入源要求

```ts
export interface WorkflowInputSourceRequirement {
  key: string;
  label: string;
  required: boolean;
  acceptedKinds: WorkflowInputSourceKind[];
  documentTypes?: KnowledgeBaseDocument['documentType'][];
  minSources?: number;
  maxSources?: number;
  role?: 'fact-source' | 'style-reference' | 'product-subject' | 'competitor' | 'batch-params' | 'quality-baseline';
}
```

示例：

```ts
const xiaohongshuReverseImageRequirement: WorkflowInputSourceRequirement = {
  key: 'referenceImages',
  label: '对标参考图',
  required: true,
  acceptedKinds: ['reference-image'],
  minSources: 1,
  maxSources: 10,
  role: 'style-reference'
};
```

知识库驱动 SOP 可以要求 `knowledge-document`；无知识库扒图 SOP 则只要求 `reference-image` 和 `product-brief`。

### 5.3 Agent 会话策略

```ts
export interface WorkflowPromptSessionPolicy {
  requireUserIntent: boolean;
  allowMultiTurnRefinement: boolean;
  allowedModes: AgentPromptSession['mode'][];
  materializeAs?: Array<'prompt-pack' | 'sop' | 'skill'>;
}
```

## 6. WorkflowStep

每个步骤只做一类事，遵循单一职责：

```ts
export interface WorkflowStepDefinition {
  id: string;
  name: string;
  kind: WorkflowStepKind;
  dependsOn?: string[];
  inputs: Record<string, WorkflowValueRef>;
  config?: Record<string, unknown>;
  produces: WorkflowArtifactKind[];
  retryable?: boolean;
  optional?: boolean;
}
```

`WorkflowValueRef` 用于引用用户输入、输入源、前序步骤输出或全局上下文：

```ts
export type WorkflowValueRef =
  | { source: 'input'; key: string }
  | { source: 'input-source'; key: string }
  | { source: 'step-output'; stepId: string; key: string }
  | { source: 'context'; key: 'brandKnowledgeBase' | 'ipKnowledgeBase' | 'sceneLibrary' | 'promptGroup' | 'promptDraft' | 'promptPack' | 'sourceRefs' | 'params' | 'selectedAssets' };
```

## 7. WorkflowRun

运行记录是一次 SOP 执行的事实源：

```ts
export interface WorkflowRun {
  id: string;
  workspacePath: string;
  definitionId: string;
  definitionVersion: string;
  status: WorkflowRunStatus;
  title: string;
  platform: WorkflowPlatform;
  input: Record<string, unknown>;
  inputSourceIds: string[];
  sourceRefs: WorkflowSourceRef[];
  documentIds?: string[];
  brandKnowledgeBaseId?: string;
  ipKnowledgeBaseId?: string;
  sceneLibraryId?: string;
  promptGroupIds?: string[];
  promptSessionId?: string;
  promptDraftIds?: string[];
  promptPackId?: string;
  stepRuns: WorkflowStepRun[];
  artifactIds: string[];
  createdAt: string;
  updatedAt: string;
}
```

步骤运行：

```ts
export interface WorkflowStepRun {
  stepId: string;
  status: WorkflowRunStatus;
  startedAt?: string;
  finishedAt?: string;
  input?: unknown;
  output?: unknown;
  artifactIds?: string[];
  logId?: string;
  error?: string;
}
```

## 8. WorkflowArtifact

产物模型用于统一文案、图片、视频 Prompt、手动导入视频和导出包：

```ts
export interface WorkflowArtifact {
  id: string;
  workspacePath: string;
  runId: string;
  stepId: string;
  kind: WorkflowArtifactKind;
  title: string;
  status: 'draft' | 'pending-review' | 'approved' | 'rejected' | 'exported' | 'archived';
  platform: WorkflowPlatform;
  refs: string[];
  text?: string;
  metadata: Record<string, unknown>;
  tags: string[];
  sourceInputSourceIds?: string[];
  sourceRefs?: WorkflowSourceRef[];
  promptDraftId?: string;
  sourceLogId?: string;
  createdAt: string;
  updatedAt: string;
}
```

## 9. 内置步骤建议

| 步骤类型 | 输入 | 输出 |
| --- | --- | --- |
| `collect-input` | 用户字段、素材 | 标准化输入 |
| `agent-read-knowledge` | 知识库文档、用户意图 | Agent 摘要、引用和追问 |
| `build-brand-knowledge-base` | 品牌 / 产品知识引用 | 品牌知识库、卖点、合规边界 |
| `generate-prompt-pack` | 品牌知识库、知识引用 | Prompt Pack |
| `generate-scene-library` | Prompt Pack、知识引用 | 结构化场景卡 |
| `generate-prompt-group` | 场景卡、用户意图 | 图片 / 视频 / 文案 PromptDraft |
| `analyze-reference-image` | 参考图、产品图 | 构图 / 光线 / 文字 / 风格分析 |
| `analyze-reference-video` | 参考视频 | 镜头 / 节奏 / 脚本 / 字幕结构分析 |
| `reverse-engineer-prompt` | 参考分析、产品资料 | 同风格 Prompt 草稿 |
| `structure-product-brief` | 产品资料、SKU 表 | 产品变量、卖点、禁用表达 |
| `cluster-user-feedback` | 评论、差评、客服问题 | 痛点矩阵、选题方向 |
| `refine-prompt` | Agent 会话、多轮用户反馈 | Prompt 草稿 |
| `confirm-prompt` | Prompt 草稿 | 已确认 Prompt |
| `generate-prompt-pack` | 已确认 Prompt / 稳定模板 | Prompt Pack |
| `generate-copy` | Prompt、平台、主题 | 文案 / 标题 |
| `generate-image` | 产品图、参考图、提示词 | 图片素材 |
| `generate-green-screen-card` | 文案、样式参数 | 绿幕文案图 |
| `create-video-prompt` | 图片、卖点、时长、画幅 | 可复制到第三方平台的视频 Prompt |
| `mark-video-prompt-copied` | 视频 Prompt | 复制记录，不跟踪第三方任务 |
| `import-video-file` | 用户手动导入的视频文件 | 可选视频素材 |
| `quality-check` | 任意产物、规则 | 风险、评分、重生成建议 |
| `review` | 任意产物 | 审核结果 |
| `tag-assets` | 任意产物 | 素材标签 |
| `export-package` | 通过审核的素材 | 混剪素材包 |

## 10. 示例：无知识库小红书扒图 SOP

```text
输入：
  参考图、产品图、产品名称、卖点补充、目标人群

步骤：
  1. collect-input
  2. analyze-reference-image: 识别构图、光线、文字、道具、画幅和平台风格
  3. structure-product-brief: 把用户补充的产品资料整理成生成变量
  4. reverse-engineer-prompt: 反推同风格图片 Prompt
  5. refine-prompt: 用户多轮调整风格和产品表达
  6. confirm-prompt
  7. generate-image: 生成 4 张同风格种草图
  8. quality-check: 检查文字、主体一致性和侵权风险
  9. review
  10. tag-assets
  11. export-package

输出：
  参考图分析、Prompt 草稿、种草图、质检结果、素材标签
```

## 11. 示例：知识库驱动 IP 内容 SOP

```text
输入：
  IP 知识库文档、用户意图、平台、主题

步骤：
  1. collect-input
  2. agent-read-knowledge: 读取 IP / 产品知识库文档
  3. refine-prompt: 按用户意图多轮调整内容 Prompt
  4. confirm-prompt
  5. generate-copy: 标题 3 条 + 正文 / 口播脚本
  6. quality-check: 检查事实、口吻和合规风险
  7. review
  8. tag-assets
  9. export-package

输出：
  平台文案、提示词、引用来源、审核报告、素材标签
```

## 12. 示例：混合商业素材 SOP

```text
输入：
  产品知识库、产品图、竞品参考图、卖点补充、平台

步骤：
  1. collect-input
  2. agent-read-knowledge: 提取卖点、证据和禁用表达
  3. analyze-reference-image: 反推竞品图视觉结构
  4. reverse-engineer-prompt: 合并产品事实和参考风格
  5. refine-prompt
  6. generate-copy: 标题和卖点文案
  7. generate-image: 产品种草图 / 详情页模块图
  8. quality-check
  9. review
  10. tag-assets
  11. export-package

输出：
  标题、卖点文案、图片素材、Prompt、质检报告、素材包
```

## 13. 示例：视频 Prompt 与混剪素材 SOP

```text
输入：
  产品图、已通过图片素材、卖点文案、目标平台

步骤：
  1. generate-copy: 口播脚本 / 分镜建议
  2. generate-green-screen-card: 标题卡 / 卖点卡 / CTA 卡
  3. create-video-prompt: 生成 15 秒图生视频 Prompt
  4. mark-video-prompt-copied: 用户复制 Prompt 到 RunningHub / 第三方平台
  5. import-video-file: 可选导入第三方生成后的视频文件
  6. quality-check
  7. tag-assets
  8. export-package: 混剪素材包

输出：
  视频 Prompt、复制记录、可选 15 秒视频素材、绿幕图、混剪 manifest
```

## 14. 存储建议

v2 仍优先使用工作区文件，不引入数据库：

```text
.content-studio/
  workflow-input-sources.json
  workflow-definitions.json
  workflow-runs.json
  workflow-artifacts.json
  knowledge-documents.json
  agent-prompt-sessions.json
  prompt-drafts.json
  generation-logs.json
  prompt-packs.json
  scene-cards.json
  assets/
    images/
    videos/
    green-screen/
    packages/
```

后续如果需要协作和检索，再迁移到数据库或云端素材库。
