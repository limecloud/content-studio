# 现有客户端能力融入 Ontology v2 评估

状态：Draft v2 / SOP Runtime Retired
更新时间：2026-06-01
关联：[`README.md`](./README.md)、[`architecture.md`](./architecture.md)、[`data-intake-workbench-prd.md`](./data-intake-workbench-prd.md)
代码基线：`content-studio` 客户端（Electron + React 19 + Lime App Server sidecar，src 约 6.7 万行 / 136 文件）

---

## 1. 核心判断

> 现有客户端不是「待改造的旧版」，而是 Ontology v2 缺失的**执行引擎与已实现底座**。

把代码读完后的结论与「看截图」时一致、但更强：现有客户端和 ontology v2 **高度互补**，而且客户端已经真实实现了 v2 设计里大量「未接入」的部分。

- **客户端 = 手 + 半个脑**：33+ 图片能力、视频生成、混剪、文章/脚本、知识库体系、审核闭环、生产交接、内容制造批次投影、基于 Lime App Server sidecar 的 Agent 编排——都是可复用底座。
- **ontology v2 = 另一半脑 + 纪律**：批次驱动、全量分档、数据接入成熟度分层、规则门禁、不伪造成片、本地/云端双 Runtime 拓扑。

两者关系不是「合并两个 UI」，而是：**ontology v2 提供编排骨架与纪律，现有客户端能力降级为阶段调用的工具 / agent / 事实源**。

---

## 2. 关键事实校正（相对此前基于截图的评估）

读码后发现，几处此前以为「v2 要新建」的能力，**客户端已经实现**：

| 此前以为要新建 | 实际已实现（代码位置） |
| --- | --- |
| Agent Runtime | `appServerSidecarService.ts`（随包 sidecar、JSON-RPC、packaged backend）+ `appServerPromptAgentService.ts`（Agent 会话投影） |
| 内容制造批次 / 运行追溯 | `contentBatchApplicationService.ts`、`contentBatchStore.ts`、`ontologyV2.ts`；旧 `workflowEngine.ts` 已退役，不再作为接入底座 |
| 知识库 / 事实源 | `brandKnowledgeBaseStore.ts` / `ipKnowledgeBaseStore.ts` / `contentKnowledgeMapStore.ts` |
| 规则门禁 / 合规 | `contentKnowledgeMapSensitivityPolicy.ts` / `contentProductionHandoffService.ts` + 提示词包合规边界 |
| 审核闭环 / 人工确认 | `contentReviewTaskApplicationService.ts` / `assetReviewStore.ts` / `contentProductionHandoffService.ts` |
| 不伪造成片纪律 | 已是工程约定：图片未配置返回可追溯 `blocked`，「不内置真实视频模型网关，不伪造成功素材」（README） |
| 数据接入 / 输入源 | `inputSourceStore.ts`（docx/md/image/video/url/sku-table）+ `documentTextExtractor.ts` |
| 团队协作 / 同步 | `contentWorkspaceSyncService.ts` / `contentDraftChangeStore.ts` / `contentKnowledgeReleaseStore.ts` |

**含义**：ontology v2 的落地不是从零开发，而是**在现有客户端骨架上做重组与补缺**。工作量与风险都比预想低。

---

## 3. 逐能力映射与取舍

### 3.1 直接保留为「制造阶段执行引擎」

| 现有能力 | 代码 | 映射到 v2 |
| --- | --- | --- |
| 33+ 图片能力（模特展示/换模特/换背景/换姿势/连拍/多视角/AI模特/改款/材质/改色/图案…） | `ImageShowcaseModule.tsx` + `dressingkit-ai-image-shared.json`（228 案例，数据驱动） | 制造阶段 ShotPlan 渲染引擎；按 Tier 分配（精品=精修+多视角，AI快产=全自动批量） |
| 视频生成 / AI视频 / 混剪包导出 | `VideoModule.tsx` / `mediaProvider.ts` / `mixPackageStore.ts` | 制造阶段视频产出——补上 v2「视频生成未接入」的缺口 |
| 图片精修 / 模特修改 / 局部精修 | `AssetsModule.tsx`(retouch) | 精品 Tier 的人工精修环节 |
| 素材拆解 | `referenceReverseService.ts` | 素材账本 + 竞品结构参考（喂 AssetUsageLedger） |
| 绿幕文案图 | `overlayCardStore.ts` | 制造阶段叠加层产出 |

### 3.2 直接接管为「事实层 / 规则层 / 质量层」

| 现有能力 | 代码 | 映射到 v2 |
| --- | --- | --- |
| 品牌/产品知识库 | `brandKnowledgeBaseStore.ts` | 事实层 ProductFact / 品牌口径 / ForbiddenExpression |
| IP 知识库 | `ipKnowledgeBaseStore.ts` | 事实层（IP 六层结构） |
| 内容知识地图 | `contentKnowledgeMapStore.ts` + `ContentKnowledgeMapModule.tsx` | 事实层知识库 + 卖点/痛点/证据矩阵 |
| 合规 / 敏感性检测 | `contentKnowledgeMapSensitivityPolicy.ts` | 审核阶段 ReviewGate / 规则门禁（已实现的门禁！） |
| 审核任务台 | `contentReviewTaskApplicationService.ts` | 审核阶段 ReviewDecision / HumanApproval / RecoveryTask |
| 生产交接 | `contentProductionHandoffService.ts` | 审核→调优的可交付包流转 |

### 3.3 保留为「工具 / 资产」，但不再当主入口

| 现有能力 | 代码 | 映射到 v2 |
| --- | --- | --- |
| 提示词包 / 提示词草稿 / Prompt 工作台 | `promptPackService.ts` / `promptDraftStore.ts` / `PromptWorkbenchModule.tsx` | 卖点→Hook 供料 / 可复用 Prompt 资产，供制造调用 |
| 场景库 | `sceneLibraryStore.ts` | 卖点阶段 Scenario / 矩阵变量 |
| 视频脚本 / 视频 Prompt | `videoWorkflowService.ts` | 制造分镜 ShotPlan 供料 |
| 文章 / 标题 / 脚本生成 | `articleGenerationService.ts` | 制造阶段文本产出工具 |
| 输入源 / 文档转换 | `inputSourceStore.ts` | 接入工作台的 L0 入口（上传 docx/sku-table/参考图视频） |
| 成片视频导入 | `VideoImportModule.tsx` | 接入层导入历史 / 复盘历史表现 |

### 3.4 必须改造 / 收敛

| 现有形态 | 问题 | v2 处理 |
| --- | --- | --- |
| 7 分类 × 33+ 功能宫格导航（`NAV_GROUPS` / `v2FeatureRegistry.ts`） | 是「能力入口合集」，与 ontology v2「只围绕批次、不做能力入口合集」的 UI 契约正面冲突 | 能力保留为可调用 tool/agent，**宫格不再当主导航**；改为批次驱动主路径 |
| 「选功能→上传素材→生成」用户当编排器 | 用户要自己知道该用「换模特」还是「换姿势」 | 改为 agent 在阶段上下文里自动调能力，用户看结果和改 |
| 旧品牌战情室（信号→目标→资源→队列） | 客户端运行时已退役；与 ontology v2 的批次/阶段是**两套编排心智**，并存会割裂 | 不作为 v2 当前入口保留；历史能力只允许沉淀为内容制造批次、阶段恢复任务和生产交接行动记录 |

---

## 4. 唯一要守的纪律

现有客户端本质是**能力入口合集**（选功能→传素材→生成，用户当编排器）；ontology v2 README 第一条 UI 契约是「只围绕当前批次展开，**不做能力入口合集**」。这是两者唯一的正面冲突。

纪律一句话：**保留能力作为可被调用的 tool/agent，杀掉宫格作为主导航。**

- 现在：用户从宫格挑「换背景」→ 传图 → 生成
- v2 后：制造阶段 ShotPlan 自己调「换背景」工具，事实/素材/禁用表达已绑好，agent 当编排器
- 那 33+ 功能不消失，从「用户逐个点的菜单」变成「agent 在正确上下文自动调的能力」

---

## 5. 与已定架构的衔接

- **接 Tier（商品规划分档）**：这些生成能力正是制造档位的引擎。精品档=真人拍摄+图片精修+多视角；AI快产档=全自动跑换模特/换背景/视频生成。33+ 功能就是 Tier 落地的引擎。
- **接统一 Runtime（architecture §5）**：生成能力是 tools。当前本地桌面端通过随包 Lime App Server sidecar 进入 RuntimeCore / backend；轻交互（提示词调试、单图精修）和重渲染（视频生成）的调度差异应落到 App Server policy / backend 能力，不在 content-studio 再建第二套 runtime。批量调度需要从内容制造批次、Agent 任务契约和 tool 定义抽共享层，不能复用已退役的 `workflowEngine.ts`。
- **接不伪造成片**：客户端已守此纪律（blocked 而非占位）。接入真引擎后，blocked 可变真产出，但仍过审核门禁。
- **接数据接入工作台（PRD）**：`inputSourceStore.ts` 已支持多类型输入，是 L0 自助接入的现成实现；缺的是成熟度分层 L0/L1/L2 与适配器库。

---

## 6. 落地优先级建议

| 优先级 | 动作 | 理由 |
| --- | --- | --- |
| P0 | 确立批次驱动主路径，宫格降级为 agent 工具池 | 解决唯一架构冲突，是 v2 成立的前提 |
| P0 | 把 33+ 图片能力 + 视频生成挂到制造阶段，按 Tier 调度 | 直接补上 v2「制造未接入」，复用最大资产 |
| P1 | 合规/审核服务接管为 v2 规则门禁与审核阶段 | 已实现，接线即可 |
| P1 | 知识库三件套接管为事实层 | 已实现，统一事实源 |
| P1 | 数据接入成熟度分层 + 适配器库（基于 inputSourceStore 扩展） | 见接入 PRD，规模化前提 |
| P2 | 旧品牌战情室历史能力归档 | 不回流旧入口；只把可复用的目标、资源和复盘语义并入批次阶段 |
| P2 | 从内容制造批次、Agent 任务契约和 tool 定义抽双 Runtime 调度基础 | 不复活旧 `workflowEngine.ts`，按 architecture §5 重新定义共享层 |

---

## 7. 待决策问题

1. **两套 v2 的关系**：客户端有自己的 `docs/roadmap/v2/`（已实现路线），我们在 `docs/roadmap/ontology/v2/`（本体重构）。是把 ontology v2 作为客户端 v2 的「下一阶段重构」，还是平行的设计探索？需要先对齐，否则两条线会越走越远。
2. **宫格过渡**：33+ 功能宫格是现有用户的肌肉记忆，直接砍会断崖。是否需要过渡期内「批次主路径 + 宫格作为高级/直达入口」并存？
3. **数据驱动配置的复用**：`dressingkit-ai-image-shared.json`（228 案例）这类数据驱动资产，如何映射成 v2 的 tool 定义 + Tier 能力表？
4. **Lime App Server 与统一 Runtime**：现有 `AppServerSidecarService` 是本地桌面 host 的唯一 Agent runtime 通道，服务端批量调度是否复用同一套 agent / tool 定义？（architecture §5 要求「同一套定义、统一 runtime 事实」，需验证当前内容制造批次和 tool 契约可否抽出共享定义层）
