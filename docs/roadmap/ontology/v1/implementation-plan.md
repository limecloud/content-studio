# Ontology v1 实施计划

更新时间：2026-05-31
状态：Local Verified / Production Evidence Pending

## 1. 设计结论

v1 的目标不是新增一个孤立模块，而是在现有知识库、场景库、Prompt 工作台、SOP 和素材库之间补一个稳定的内容工程层。实现上坚持 KISS：Bugu 业务后端事实源优先，Content Studio 保留本地缓存、离线草稿和运行临时产物；先做可审核、可追溯、可生产、可同步的结构化闭环，再考虑 RDF / OWL 或外部图谱互操作。

最新设计原则要求：所有普通用户页面、原型和模块实现必须先通过业务 UI 契约。v1 不是“功能丰富的入口合集”，而是围绕一个具体业务对象完成输入、判断、审核、交接和回写的工作台。工程实现必须按 Application Service、Policy、Assembler、Store、Port / Adapter 拆分，不能把规则散落到 React、IPC 或 Bugu 路由里。

服务端边界：

- Bugu 是布谷内容工厂业务后端，承载内容项目、知识地图、生成流程、审核任务、生产交接行动记录、素材覆盖和知识包 release。
- LimeCore 是 OEM 云服务端，承载租户、账号、权益、发布中心、模型策略、Gateway、计费和 Agent App enablement。
- Content Studio 是桌面内容生产工作台，不直接拥有团队事实源。

v1 不覆盖两个专项：

- 抖音带货爆款视频拆解：保留在 `research-douyin-commerce-video-breakdown.md`。
- GEO / AEO 内容资产和答案引擎：保留在 `research-geo-aeo-content-ontology.md`。

通用 v1 聚焦其他高频内容工程需求：卖点拆解、场景穷举、品牌口径、IP 一致性、评论痛点、竞品差异化、素材覆盖、SOP 编排和内容行动复盘。

## 2. 可枚举变量体系

v1 的核心能力是把“穷举”变成可控矩阵，而不是一次性让 LLM 列清单。

| 变量域 | 枚举项 |
| --- | --- |
| 产品 | 品类、产品线、SKU、规格、功能、属性、工艺、成分、参数、价格带、包装、使用方式、适用条件、禁忌条件。 |
| 卖点 | 功能卖点、情绪卖点、身份卖点、效率卖点、省钱卖点、安全卖点、体验卖点、稀缺卖点、服务卖点、证据型卖点。 |
| 收益 | 直接收益、长期收益、替代收益、对比收益、风险降低、时间节省、成本节省、决策安心、社交表达。 |
| 主张 | 可证明主张、弱主张、待验证主张、禁用主张、对比主张、场景化主张、FAQ 式主张。 |
| 人群 | 角色、年龄段、消费层级、需求阶段、认知阶段、价格敏感度、信任水平、购买角色、决策阻碍、复购状态。 |
| 痛点 | 明确问题、隐性担忧、错误认知、购买异议、使用障碍、售后焦虑、替代方案不满、场景冲突。 |
| 场景 | 使用时刻、空间、任务、动作、触发事件、情绪、内容渠道、内容格式、CTA、风险边界。 |
| 品牌 | 定位、口径、语气、禁用表达、竞品边界、承诺边界、证据标准、视觉偏好、客服话术。 |
| IP | 身份、立场、观点、方法论、语言习惯、故事资产、反对什么、推荐什么、不可说什么。 |
| 竞品 | 竞品对象、内容结构、主张类型、证据类型、用户反馈、差异机会、不可搬运片段、需规避表达。 |
| 素材 | 图片、视频、口播、案例、测评、截图、评论、证书、报告、素材状态、覆盖组合、审核结论、表现标签。 |
| 行动 | 内容制造批次、阶段门禁、恢复任务、标准动作、发布检查、行动记录、复盘回写。 |

## 3. 阶段计划

### V1-P0：契约和文档定版

目标：

- 固化 v1 范围、数据模型、工作流和验收计划。
- 明确通用 v1 和两个专项 research 的边界。
- 明确 Agent Knowledge v0.7.2 是对外发布目标版本。
- 固化业务 UI 契约和反功能平铺门禁，避免原型和页面变成功能入口合集。

写集：

- `docs/roadmap/ontology/v1/*`
- `docs/roadmap/ontology/README.md`

验收：

- v1 文档能直接拆成工程任务。
- 文档中每个下游模块都有边界和验收标准。
- 不和现有 v2 知识库、场景库、PromptDraft、SOP 和素材库职责重复。
- 每个普通用户页面都有目标用户、业务对象、当前状态、唯一主动作、异常恢复和最终交付物。

### V1-P0.5：业务 UI 契约和模块设计门禁

目标：

- 把 `docs/aiprompts/business-ux-contract.md` 的要求落到 v1。
- 确认所有 v1 UI 不是能力概览、入口合集或状态卡片堆叠。
- 为后续代码实现建立模块设计门禁。

写集：

- `docs/roadmap/ontology/v1/business-ui-contract.md`
- `docs/roadmap/ontology/v1/module-design.md`
- `docs/roadmap/ontology/v1/prototype/README.md`
- `docs/roadmap/ontology/v1/acceptance-plan.md`

任务：

1. 为内容知识地图、卖点矩阵、场景矩阵、审核任务、团队知识包、内容制造批次、素材回写和行动记录写页面级契约。
2. 每个页面只保留一个主动作，辅助动作必须服务当前业务对象。
3. 定义待补资料、生成服务待配置、缺证据、发布检查未通过、缺素材、团队同步冲突和服务端不可用的恢复路径。
4. 明确普通用户禁用词表和替代表达。
5. 将模块模式收敛为 Application Service、Controller Hook、Store、Builder Strategy、Policy、State Machine、Assembler、Port / Adapter。
6. 明确暂不引入图数据库、CRDT、全量 Event Sourcing 和任意脚本运行时。

验收：

- `business-ui-contract.md` 能作为 UI / 原型 / 页面代码的前置门禁。
- `module-design.md` 明确每个设计模式的使用位置和非目标。
- 普通用户模块扫描不出现内部工程术语。
- Bugu 服务端规划不把内容业务继续堆进 OEM 路由大函数。

### V1-P1：核心类型、本地缓存和服务端同步契约

目标：

- 在共享类型中定义内容知识地图、审核任务、内容制造批次、团队知识包和生产交接对象。
- 在 main 进程新增本地缓存和离线草稿 store，保存最近打开项目、知识地图、审核草稿和行动草稿。
- 定义与 Bugu 团队内容工作区同步所需的 tenant、workspace、revision、baseRevision、idempotencyKey 和 syncStatus 字段。
- 按 Application Service + Repository + Port 的模式拆分，禁止把业务规则堆到 IPC 或 React 组件。

写集：

- `src/shared/types.ts`
- `src/main/services/contentKnowledgeMapStore.ts`
- `src/main/services/contentKnowledgeMapBuilder.ts`
- `src/main/services/contentKnowledgeMapValidator.ts`
- `src/main/services/contentKnowledgeMapApplicationService.ts`
- `src/main/services/contentKnowledgeMapSyncPort.ts`
- `src/main/services/contentReviewTaskStore.ts`
- `src/main/services/contentReviewTaskBuilder.ts`
- `src/main/services/contentReviewTaskApplicationService.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`

任务：

1. 定义 `ContentKnowledgeMapRecord`、矩阵行、证据、约束、缺口和团队同步摘要。
2. 定义 `ContentReviewTask`、`ContentReviewDecision`、审核状态和审核动作。
3. 定义生产交接、审核、素材覆盖和知识包导出的产物引用和行动记录引用。
4. 本地保存 `.content-studio/content-knowledge-maps.json`、`content-knowledge-map-build-runs.json`、`content-review-tasks.json`、`content-production-handoffs.json` 和 `content-draft-changes.json`，定位为缓存、离线草稿和运行临时产物；旧内容制造批次缓存已退役。
5. 增加服务端同步字段：`tenantId`、`workspaceId`、`revision`、`baseRevision`、`syncStatus`、`lastSyncedAt`、`idempotencyKey`，本机阶段允许先以 `teamSync` 摘要表达。
6. 暴露 list / build / update / review / handoff / batch / export IPC，并通过 Bugu 适配器同步变更包、审核、行动记录、素材覆盖、同步冲突和 release；pull、逐项合并处理清单、服务端清单落库审计和素材覆盖待确认补充已补齐。

验收：

- 能生成内容知识地图草稿。
- 能读写卖点、痛点、场景、证据、约束和缺口。
- 能记录审核决策和行动记录。
- 能区分“已同步”“未同步”“离线草稿”“冲突待处理”。
- 未配置模型时不伪造构建结果，只返回 blocked。
- 内容知识地图版本、生成流程、审核任务、生产交接、离线变更和内容制造批次历史不在 Store 层按展示阈值截断；UI 分页只影响视图，不删除审计事实。

### V1-P1.5：Bugu 业务后端契约和 LimeCore 云底座对接

目标：

- 在 Bugu 侧定义内容工作区、知识地图、生成流程、审核任务、生产交接行动记录、素材覆盖和知识包 release API。
- 明确 LimeCore 只提供 OEM 云服务端能力：租户、账号、权益、模型策略、Gateway、发布中心和 Agent App enablement。
- 让 Content Studio 通过 API 同步，而不是把本地目录当团队事实源。

写集：

- `docs/roadmap/ontology/v1/server-integration-plan.md`
- Bugu 已落地位置：`workers/api-proxy/`、`scripts/oem-api-server.mjs`、业务 state store、对象存储适配和控制台入口。
- LimeCore 边界：control-plane / gateway / release center / Agent App enablement 只做 OEM 云底座校验与登记，不承载内容业务对象。

任务：

1. 定义 Bugu 业务 API：content workspaces、knowledge maps、build runs、review tasks、action records、material coverage、knowledge releases。
2. Bugu 负责业务角色、项目权限、revision、冲突、审核、行动记录和知识包 release 元数据。
3. Bugu 按需调用 LimeCore 校验租户、账号、权益、模型策略、Gateway、发布中心和 Agent App enablement。
4. Content Studio 通过 Bugu API 同步，不直接拼散乱服务端 URL。
5. 服务端写接口必须校验 `baseRevision`、业务角色、发布检查和幂等键。

验收：

- Content Studio 可以绑定 Bugu 团队内容工作区。
- 服务端能返回当前 revision、发布版本和用户权限。
- 冲突由服务端返回明确状态，桌面端能展示冲突队列、影响内容、版本差异、逐项合并处理清单和处理建议，并记录“以团队版本为准 / 保留本机修改 / 转人工确认”的处理方向；Bugu 保存合并处理清单、行动记录和新 revision。字段级回写当前只允许素材覆盖生成待确认补充审核任务，不静默覆盖团队当前内容。
- LimeCore 不被写成布谷内容工厂业务后端。

当前落地：

- Bugu 已实现团队内容工作区、变更包、审核任务、审核结论、行动记录、素材覆盖、团队知识包版本的最小 API 和 smoke 覆盖；旧执行队列 API 不再是当前客户端事实源。
- Bugu 已实现同步冲突队列：旧 `baseRevision` 提交会返回 `409`，同时记录冲突队列、影响内容和处理建议；控制台可查看同步冲突并记录处理方向。
- Content Studio 已接入 Bugu 同步适配器，提交时不发送本机绝对路径；变更包、审核任务、审核结论、行动记录、素材覆盖、同步冲突和发布结果只以业务状态展示给普通用户。
- Content Studio 已把团队共享按钮落到真实客户端闭环：内容知识地图页可以从 UI 创建变更包、提交团队工作区、导出变更包、导入离线变更包和创建团队知识包版本；E2E 验证本地变更包事实源、Bugu HTTP payload、release URL / object key / sha256 / size 和包文件清单。
- Content Studio 内容知识地图页已接入同步冲突队列：用户可以看到冲突来源、摘要、版本差异、受影响的卖点 / 痛点 / 场景 / 证据和处理建议，选择处理方向后，本机地图回到待同步状态。
- Content Studio 和 Bugu 控制台已新增同步冲突逐项合并处理清单：基于受影响内容生成本机提交、团队当前内容、建议处理方式和下一步；该清单只辅助人工处理，不静默覆盖团队当前版本。
- Bugu 服务端已在冲突处理时接收合并处理清单，保存到冲突记录和行动记录，并推进团队 revision；当前不自动改写卖点、证据或场景字段。
- Content Studio 已补离线变更包导出 / 导入：`ContentWorkspaceSyncService.exportDraftChange` 生成 `manifest.json`、`draft-change.json` 和导入说明，导出前校验包内容不含密钥、凭证、本机 `workspacePath` 或本机绝对路径；`importDraftChange` 会把离线包转成本机变更包，等待用户提交团队工作区。
- Content Studio 已把素材覆盖字段级回写收敛为“待确认补充”：已通过素材会生成证据类审核任务并同步到 Bugu，内容负责人确认前不改写已发布主文案。
- Content Studio 已在 Agent Knowledge 导出时生成 zip、sha256 和 size；发布团队知识包时通过 Bugu 适配器提交包摘要和内容。
- Bugu 已在团队知识包 release 中登记发布包对象 key、公开 URL、上传状态和校验摘要；未配置公开对象存储时只登记 metadata-only，不伪造下载成功。
- Bugu 控制台已接入团队内容工作区面板，围绕当前工作区展示待处理审核、生产交接、行动记录、素材覆盖和团队知识包版本；可将旧知识包版本切回默认版本。
- Bugu 已补团队知识包发布审批：`requiresApproval`、`approvalStatus=pending`、`approvalSteps` 或工作区默认确认模板的版本不会自动成为默认版本；服务端支持多步骤确认、步骤角色校验和全部通过后设为默认；控制台可显示确认进度并切换“负责人确认 / 双负责人确认”模板。
- Content Studio 已能从 Bugu 拉取已同步工作区的团队知识包版本并写入本机缓存，保留本机预览路径，刷新时展示服务端包地址和分发状态。
- Content Studio 内容知识地图页已把“拉取团队更新”落到真实工作台：团队知识包当前对象区和右侧交付区都调用同一 `refresh()` 工作区刷新链路，拉取 Bugu 团队知识包版本、同步冲突和团队行动记录；目标 E2E 注入远端已发布版本后点击该入口，验证页面显示远端团队更新包、最近版本列表包含新版本，并且本机缓存能读取公开包地址和文件清单。
- Content Studio 内容知识地图页已补团队知识包详情浏览和真实交接：在右侧交付区展示团队版本、包文件、对象 key、sha256、确认状态和最近版本；已发布版本可通过 `ContentTeamKnowledgePromptDraftService` 直接生成带团队知识包版本、覆盖行、来源引用、禁用边界和资料缺口的 Prompt 草稿，用真实工作台承接 prototype 里的团队知识包浏览与复制到 Prompt 工作台需求；主进程会校验 release 属于当前内容知识地图，避免跨项目误绑定。
- Content Studio 生产交接会选择同一内容知识地图的已发布团队知识包，写入提示词依据、Prompt 草稿和交接记录；SOP 交接会通过 `WorkflowEngine` 执行到人工审核停顿点，保存团队知识包版本、步骤状态和产物线索，而不是只写一条空运行记录。
- Content Studio 已有功能测试模拟两个本地工作区的团队共享：用户 A 发布团队知识包，用户 B 拉取同一团队工作区版本，并绑定到 Prompt 草稿和 SOP 运行记录。
- Content Studio 已新增 `content:release:verify-online` 只读验收入口：通过 Bugu release 元数据或直接公开地址校验团队知识包下载地址、content-length 和 sha256；Bugu release 列表按 `limit / offset` 分页查找指定版本，避免版本较多时只验第一页；支持 `--output=...` 写出 JSON 执行报告；功能测试覆盖可下载版本、第二页 release 查找和 metadata-only 不可误判。
- Content Studio 已新增 `content:team:verify-online` 只读验收入口：通过两组账号 token 校验同一团队工作区、默认知识包、团队知识地图、生成流程、审核任务、生产交接行动记录和团队知识包版本是否对两端一致可见；验收会按 `limit / offset` 分页拉取清单，两账号看到的 `content-knowledge-maps`、`content-build-runs`、审核任务、行动记录和团队知识包版本 ID 清单必须完整且一致；支持 `--output=...` 写出 JSON 执行报告；功能测试覆盖双账号 token、分页清单和清单不一致拦截。
- Content Studio 已新增 `content:v1:verify-online` 总入口：一次汇总团队知识包下载验收和两账号团队共享验收，支持 `--output=...` 写出 v1 在线验收 JSON 报告；功能测试覆盖汇总报告。
- Content Studio 已新增 `content:v1:verify-report` 报告归档门禁：生产报告必须包含真实 Bugu 公网 API 地址、真实 workspace / release、http/https 公网公开包地址、size、sha256、两账号共享证据、`content-knowledge-maps` 同清单、`content-build-runs` 同清单、审核任务同清单、行动记录同清单、团队知识包版本同清单和完整分页拉取标记；localhost、内网地址和 mock 报告只能作为功能测试证据。
- Content Studio 已补 `contentKnowledgeMapBuilder.ts` 的 SKU / IP / 竞品输入策略：`sku-table` 解析为 SKU 组合和 SKU 场景，`IpKnowledgeBaseStore` 的六层体系进入证据、卖点和场景矩阵，`competitor-observation` 只生成待审核差异化机会、用户反馈模式和不可搬运边界；功能测试覆盖竞品不进入 ready。
- Content Studio 已补发布检查 policy：`contentKnowledgeMapValidator.ts` 识别禁用 / 绝对化表达、IP 漂移和竞品 ready 风险；`contentProductionHandoffPolicy.ts` 在审核通过后仍拦截禁用表达、竞品观察直交、缺 IP 边界和 IP 漂移；功能测试覆盖不创建下游 Prompt。
- Content Studio 已补生产交接权限 policy：生产动作执行前检查团队角色权限和平台规则 / 渠道发布边界；`viewer` 或无权限角色会被拦截，缺平台规则的生产动作不会创建下游产物，行动记录保留 `actorRole`。Bugu `content-action-records` 追加接口也按认证角色做服务端权限校验，防止绕过桌面端直接写入。
- Content Studio 已补矩阵组合治理：`src/shared/contentMatrixPlanning.ts` 统一处理状态 / 素材 / 关键词筛选、优先级 / 可信度 / 证据 / 素材缺口排序、分页和本批摘要；内容知识地图页可选择本页或当前筛选结果的本批条目生成审核任务。
- Content Studio 已补补素材任务：`GenerateContentReviewTasksInput.taskPurpose` 支持 `material-supplement`，`ContentReviewTask` 增加任务类型、待补素材状态和补素材决策动作；内容知识地图行详情可为当前组合创建真实补素材任务，任务进入审核列表和 Bugu 同步适配器，不与同一组合的发布审核任务互相覆盖。
- Bugu 业务后端已补补素材任务保真：`content-review-tasks` 保存并序列化 `taskPurpose`，`needs-material` 会作为待处理审核展示；`npm run smoke:oem-service` 覆盖同一目标同时存在发布审核任务和补素材任务，后续 release 使用补素材写入后的最新 workspace revision，避免旧 revision 覆盖。
- Content Studio 已补结构化覆盖维度：`ContentKnowledgeMapMatrixRow.dimensions` 保存人群、渠道、购买阶段、内容形式和使用场景；`contentKnowledgeMapBuilder.ts` 从 SKU 表、场景卡、品牌知识库、输入源标签和 IP 延伸场景生成维度；`contentMatrixPlanning.ts` 支持人群 / 渠道 / 内容形式筛选与维度摘要；真实页面显示并筛选这些维度，`sceneCardAssembler.ts` 和 Agent Knowledge 导出也会消费该字段。
- Content Studio 已把结构化覆盖维度推进到生产交接和内容制造批次：批次阶段会保留目标人群、渠道、内容形式和使用场景；生产交接会把这些变量写入 Prompt 草稿、场景卡和 SOP 运行输入，并同步到 Bugu 行动记录。
- Content Studio 已补指定矩阵行送审：`GenerateContentReviewTasksInput.targetRowIds` 支持只生成本批行的审核任务，ready 行也可进入人工批准，且不会带入未选行和缺口；功能测试覆盖去重和同步。
- Content Studio 已补团队行动记录刷新：`BuguContentWorkspaceSyncAdapter.listActionRecords` 复用 Bugu `content-action-records` GET 接口，将团队生产交接记录合并回本机内容制造批次和交接历史；功能测试覆盖跨设备行动记录拉取、本机记录保留和产物回填。
- Content Studio 已补 Agent Knowledge v0.7.2 导出校验：`knowledgePackExportPolicy.ts` 在写盘前检查 ready 行、ready 证据、必需文件、JSON 合法性、frontmatter、疑似密钥、本机路径和脚本 / 自动发布 / 刷量 / 排名操控内容；失败时 `createKnowledgeRelease` 不调用 Bugu 发布接口，只返回 blocked release。
- Content Studio 已把 v1 普通用户主路径纳入 UX 文案门禁：`scripts/v2-ux-copy-audit.mjs` 现在扫描内容知识地图、审核任务、内容制造批次、Prompt 工作台和 SOP 执行页，阻断功能入口合集和 Ontology / Concept / Relation / CoverageMatrix / PromptGroundingContext / DecisionGate / ActionLog 等工程术语进入普通用户页面；`content:v1:verify-readiness` 会校验覆盖范围，防止后续页面回退。
- Content Studio 已补 AC-10 构建前生成服务门禁：`ContentKnowledgeMapApplicationService` 在文字生成服务待配置时保存 blocked 内容知识地图记录，只保留来源和恢复原因，不生成卖点、痛点、场景、证据或规则矩阵；功能测试覆盖不生成伪知识地图。
- Content Studio 已把内容知识地图构建从“本地规则 seed 直接作为成功结果”升级为真实文字模型结构化生成：`contentKnowledgeMapBuilder.ts` 先生成可追溯 seed / evidence，再由 `TextGenerationService.generateJson` 执行 `generate_content_knowledge_map`，按固定 schema 输出卖点、痛点、场景、约束和资料缺口；模型失败、返回空矩阵、生成服务缺失或缺少结构化输出接口时保存待配置 / 失败记录，不回退成伪成功。
- Content Studio 已补内容知识地图生成流程记录：`ContentKnowledgeMapBuildRunStore` 保存输入收集、团队状态、生成服务检查、来源证据整理、结构化矩阵生成和质量检查步骤；成功和 blocked 路径都能在工作台看到模型、可用比例、证据数、缺口和恢复原因。
- Content Studio 已补内容知识地图“生成流程”详情页签：普通用户可在当前内容地图内切换查看每一步生成状态、失败原因和恢复动作；目标 E2E 覆盖页签切换、生成服务检查、结构化矩阵步骤和补输入源 / 重新生成地图恢复路径。
- Content Studio 已补 AC-03 用户反馈证据拆分：`user-feedback` 输入会生成逐条 `user-quote` / `customer-service-log` 证据，评论痛点矩阵行引用对应原声证据，功能测试覆盖痛点行不能只引用整份输入源。
- Content Studio 已补素材库作为构建输入：`ContentKnowledgeMapApplicationService` 读取 `AssetReviewStore`，`contentKnowledgeMapBuilder.ts` 把审核记录转成 `asset-review` 证据、素材验证行、素材驳回复盘行、素材场景和 `assetReviewCount`；模型 prompt 只包含标题、备注、标签、审核状态和来源引用，不包含本机路径，功能测试覆盖路径脱敏和素材状态落库。
- Content Studio 已把 prototype 中第一批关键交互落到真实工作台：内容知识地图行详情支持证据 / 风险 / 恢复路径 / 交付去向下钻，并提供审核任务、补素材任务、真实 Prompt 草稿、真实场景卡和真实 SOP 执行交接；未审核组合先进入审核台，已审核组合才进入下游产物。IP 口径、竞品观察、团队知识包、素材回写和高级导出均在真实页面可切换查看；目标 E2E 已覆盖这些路径。
- Content Studio 当前客户端已退役旧作战分组 5 个入口；内容制造批次页以选品、意图、建模、卖点、矩阵、制造、审核、调优和复盘阶段承接普通用户的生产编排，恢复任务和产物链路只来自真实输入、审核、交接和行动记录。
- Bugu 服务端和控制台保留旧作战动作的历史兼容展示，但 Content Studio 当前客户端不再读写 `content-command-centers` 或 `content-execution-queue`。
- Content Studio 已补未接生产 Bugu token 时的本地读取兜底：`ContentWorkspaceSyncService.listSyncConflicts` 捕获远端冲突列表读取失败并返回空列表，避免同步冲突 API 的权限错误阻断本地内容知识地图刷新。
- Content Studio 已补本地 JSON 事实源可靠性：`jsonStore.ts` 统一使用临时文件 + rename 原子写，并提供按文件串行的 `updateJsonFile` 事务式读改写；内容知识地图、审核任务、内容制造批次、生产交接、团队知识包、变更包、输入源、素材审核、Prompt 草稿、场景卡、SOP 定义 / 运行和生成日志等 v1 主链 store 已接入，避免并发 IPC 下 last-write-wins 丢审核和行动记录。功能测试覆盖并发写入不丢 ID。
- Content Studio 已补本地追加和不可变不变量：`ContentReviewTaskStore.update/updateMany` 禁止删除已有审核决策，生产交接行动记录禁止被普通本机更新删除，`ContentKnowledgeReleaseStore.save/update` 禁止普通本机更新原地修改已发布团队知识包版本；Bugu release 拉取改走 `syncFromTeam` 显式团队同步入口。
- Content Studio 已把生产交接行动记录和团队知识包发布历史从事实源截断改为完整保留：生产交接回填和 `ContentKnowledgeReleaseStore` 不再用 120 条截断删除历史记录；展示和刷新可分批，但 Store 不负责抹掉审计历史。
- 生产证据待补：真实生产 R2 / OSS 环境、真实账号权限和两台设备执行 `content:v1:verify-online`，再执行 `content:v1:verify-report -- --production` 后归档报告。

### V1-P2：输入适配器

目标：

- 把现有输入源统一转成内容知识地图构建输入，不重复造数据管线。
- 当前实现由 `contentKnowledgeMapBuilder.ts` 内部纯函数承接；当输入规则稳定后再拆独立 adapter / strategy 文件。

写集：

- `src/main/services/contentKnowledgeMapBuilder.ts`
- `src/main/services/contentKnowledgeMapStrategies/productBriefStrategy.ts`
- `src/main/services/contentKnowledgeMapStrategies/feedbackStrategy.ts`
- `src/main/services/contentKnowledgeMapStrategies/ipVoiceStrategy.ts`
- `src/main/services/contentKnowledgeMapStrategies/competitorStrategy.ts`
- `src/main/services/contentKnowledgeMapStrategies/materialStrategy.ts`

任务：

1. 从 `WorkflowInputSourceStore` 读取产品 brief、表格文本、评论、客服问题和竞品观察。
2. 从 `BrandKnowledgeBaseStore` 读取品牌定位、口径、禁用表达和证据材料。
3. 从 `IpKnowledgeBaseStore` 读取 IP 六层体系。
4. 从素材库读取素材类型、渠道、审核标签、来源引用和表现数据。
5. 为每个输入片段生成稳定 `sourceRef`，后续主张和证据必须引用。

验收：

- 至少支持品牌 / 产品、用户反馈、IP、竞品、素材五类输入。
- 每个构建输入都能追溯原始来源。
- 输入适配器只做转换，不直接生成结论。

### V1-P3：构建服务

目标：

- 用框架派 + 拆解派 + 聚类派构建候选内容知识地图，降低幻觉和粒度漂移。
- 构建服务采用 Builder Strategy + Validation Policy；Builder 不落盘，Validator 不调用模型。

写集：

- `src/main/services/contentKnowledgeMapBuilder.ts`
- `src/main/services/contentKnowledgeMapValidator.ts`
- `src/main/services/contentKnowledgeMapStrategies/*`
- `src/main/services/contentMapValidationPolicy.ts`

任务：

1. 基于固定 schema 抽取候选概念，禁止模型自由发明顶层类型。
2. 对同义词、近义卖点、重复痛点和过细场景做归一。
3. 建立关系：卖点支持收益、主张由证据支持、痛点由卖点解决、场景适配渠道。
4. 绑定证据：产品规格、用户原声、知识库段落、人工备注和素材引用。
5. 生成覆盖矩阵：人群 x 痛点 x 卖点 x 场景 x 渠道 x 素材状态 x 证据状态。
6. 生成 validation issues：无证据主张、禁用表达、重复概念、孤立概念、粒度异常和来源缺失。
7. 真实运行时必须调用文字生成服务输出结构化矩阵；本地规则只负责 seed、证据候选和无模型测试工具，不能在配置了模型后冒充生成成功。

验收：

- 每个 `claim` 至少有 evidence status。
- 每个用户痛点至少保留一条用户原声或客服问答。
- 模型输出必须引用已有 `sourceRefs` 和 `evidenceRefs`；证据不足只能进入 `needs-evidence` 或 `needs-review`，不能直接进入可交付状态。
- 覆盖矩阵支持筛选、排序、分页和本批送审，避免组合爆炸淹没 UI。

当前落地：

- `contentKnowledgeMapValidator.ts` 已从单纯完整度检查升级为质量门禁：检测可交付缺证据、禁用 / 绝对化表达、重复或近似条目、孤立条目、粒度过粗 / 过细 / 混杂、IP 漂移和竞品 ready 风险。
- `ContentKnowledgeMapApplicationService` 在真实运行时会通过 `TextGenerationService.generateJson` 调用 `generate_content_knowledge_map`，模型 prompt 只包含来源摘要、seed rows 和 evidence；模型只能引用已有来源和证据，竞品相关行强制待审核。
- 模型 prompt 已纳入素材审核来源摘要和素材 seed 行，但素材表现只能作为素材可用性、拍摄场景和复盘标签，不能替代产品事实、功效证据或用户原声。
- `buildContentKnowledgeMapFromModelOutput` 会清洗模型输出、丢弃无效来源 / 证据引用、补齐 evidenceRefs、合并模型资料缺口，并把结果交给 `contentKnowledgeMapValidator.ts` 统一校验。
- 若文字模型不可用、调用失败、返回空矩阵或缺少结构化输出接口，服务端保存待配置 / 失败记录；不会把本地规则 seed 保存成已生成的知识地图。
- 重复、孤立和粒度异常不会在 renderer 中被静默修正，而是进入缺口清单和审核调整闭环，由审核人员通过改名、合并或拆分处理。
- 功能测试已覆盖模型结构化生成调用、生成服务待配置不生成伪矩阵、重复 / 孤立 / 粒度异常会触发待处理状态，避免文档只声明质量门禁但实现没有校验。

### V1-P4：内容知识地图工作台和审核台

目标：

- 给用户可操作的矩阵和审核任务，而不是暴露复杂图编辑器。
- 用户界面命名为“内容知识地图、卖点矩阵、场景矩阵、审核任务”，普通用户不需要知道 Ontology。
- Renderer 只做 View 和 Controller Hook，不承载矩阵生成、审核状态迁移或发布检查算法。

写集：

- 当前入口收敛到知识库、素材库、Prompt 工作台和 Agents；旧独立知识地图、审核任务和内容制造批次页面已退役。
- `src/renderer/src/styles/modules-command.css`
- `src/renderer/src/app/useContentStudioApp.ts`
- `src/renderer/src/components/ModuleOutlet.tsx`
- `docs/roadmap/ontology/v1/user-facing-language.md`

任务：

1. 展示工作区、构建运行、质量指标和主要矩阵。
2. 支持按产品、人群、痛点、场景、渠道、证据状态、审核状态和素材状态筛选，并支持关键词检索、排序、分页和本批送审。
3. 审核动作支持通过、驳回、合并、拆分、改名、降级待验证和标记禁用。
4. 审核台展示证据、来源、风险、约束和推荐处理方式。
5. 审核通过前不允许发布到场景库、PromptDraft 或 SOP。
6. 普通用户 UI 文案不得出现 `Ontology`、`Concept`、`Relation`、`CoverageMatrix` 等工程术语。

验收：

- 普通运营能在矩阵视图完成筛选和发布选择。
- 审核人员能解释某条内容为什么可用或不可用。
- 禁用表达和待验证主张不能进入可发布 Prompt。
- 用户测试中，运营角色不理解 Ontology 也能完成卖点拆解、场景穷举、审核和发布。

当前落地：

- 内容知识地图页已支持状态、素材、关键词筛选，优先级、可信度、证据数和素材缺口排序，分页查看以及本批摘要。
- 用户可以勾选本页条目，或直接按当前页前 N 条生成本批审核任务；该动作只服务当前矩阵，不替代页面主链路。
- 本批送审通过 `targetRowIds` 进入 main 侧审核任务 Application Service，UI 不承担审核生成规则。
- 审核任务页已支持改名、合并同类条目和拆分过粗条目；renderer 只提交结构化审核 payload，`ContentReviewTaskApplicationService` 负责更新内容知识地图行、重算证据 / 来源 / 素材线索、提交知识地图变更包，并把调整快照写入审核决策。
- 审核任务页已补证据和来源详情层：从内容知识地图展开证据原文 / 摘录、证据来源类型、证据状态、来源引用和推荐恢复路径；审核人员能直接判断通过、补证据、禁用、降级待确认或驳回，不再只依赖证据数量。
- Bugu 审核结论已保存结构化 payload，团队侧可追溯改名、合并和拆分的输入；功能测试覆盖改名、合并、拆分对内容知识地图、变更包同步和审核决策的回写。

### V1-P5：发布到内容生产链路

目标：

- 让审核通过的内容知识地图组合驱动现有内容生产，而不是停留在结构化知识列表。
- 采用 Production Handoff 模式：Policy 负责准入，Assembler 负责最小相关上下文，Target Adapter 负责写入 PromptDraft / SceneCard / SOP。

写集：

- `src/main/services/contentProductionHandoffService.ts`
- `src/main/services/contentProductionHandoffPolicy.ts`
- `src/main/services/promptGroundingAssembler.ts`
- `src/main/services/sceneCardAssembler.ts`
- `src/main/services/sceneLibraryStore.ts`
- `src/main/services/promptDraftStore.ts`
- `src/main/services/workflowEngine.ts`
- `src/main/ipc.ts`
- `src/preload/index.ts`
- 当前审核任务消费入口收敛到素材库和生产交接服务；旧独立审核任务页面已退役。

任务：

1. 将审核通过的矩阵组合转换为 `SceneCard`。
2. 生成提示词依据，只注入相关卖点、证据、约束、禁用表达和来源引用。
3. 批量生成文案、图片和视频 PromptDraft。
4. 将 ready 矩阵组合作为 SOP 输入。
5. 生产交接动作全部写入行动记录或本机交接摘要，并通过 Bugu 行动记录 API 追加到团队事实源。

验收：

- Prompt 不包含禁止表达和未验证主张。
- `SceneCard` 和 `PromptDraft` 能追溯 `ontologyId`、`coverageRowIds` 和 `sourceRefs`。
- SOP 运行记录能关联知识地图子图和行动记录。

当前落地：

- `ContentProductionHandoffService` 已将审核通过的矩阵组合交接为 Prompt 草稿、场景卡和 / 或 SOP 运行记录，并通过 `contentProductionHandoffPolicy.ts` 二次检查审核状态、证据、禁用表达、竞品直交、IP 边界和 IP 漂移。
- 禁用表达、禁用标记、竞品直交和 IP 口径漂移已收敛到 `ContentMatrixRiskPolicy`，validation、审核任务和生产交接复用同一套结构化风险判断，避免三处规则漂移。
- 内容知识地图行详情已复用 `ContentProductionHandoffService`：用户点击生成 Prompt、场景卡或启动 SOP 时，不再只是跳转到空页面；已审核组合会创建真实下游记录并打开对应工作台，未审核组合会先创建审核任务。
- 生产交接已写入结构化行动记录：包含 `batchId`、输入摘要、输出摘要、操作者、覆盖行、证据、来源、团队知识包版本、发布检查项、Prompt 草稿 / 场景卡 / SOP 运行 ID 和下一步，并通过 Bugu 既有 `content-action-records` API 追加到团队事实源。
- 发布检查拦截时不会创建 PromptDraft 或 SceneCard，但会写入 `blocked` 行动记录，保留拦截原因、检查项、恢复路径和团队同步状态。
- `promptGroundingAssembler.ts` 已收敛为短摘录注入：只写当前审核组合、已通过证据、生成边界和来源引用，不拼接完整原始文档或未通过证据。
- `contentProductionHandoffPolicy.ts` 会阻断已标记禁用 / 高风险的矩阵组合进入提示词依据。
- 若同一内容知识地图已有内容制造批次，生产交接行动会同步回填到批次运行历史；成功交接映射为 `generate-prompt-draft` / `create-scene-card` / `launch-sop-run`，发布检查拦截映射为 `content-production-blocked`。
- 内容制造批次已记录 `handoffStatus`、`handoffRefs`、`lastHandoffSummary`、`lastBlockedReason`、Prompt 草稿、场景卡和 SOP 运行引用；用户在批次页可以直接看到交接产物或待处理原因。
- 内容制造批次已提供团队行动记录刷新路径：其他设备产生的生产交接会进入本机行动记录，并回填批次产物摘要。
- 生产交接行动记录已补“写入复盘记录”：复盘结论会作为 `review-action-records` 行动记录追加到本机事实源，并复用 Bugu `content-action-records` 通道同步到团队事实源；复盘只反哺下一轮批次恢复任务、素材覆盖和补资源判断，不自动改写产品主张。
- 生产交接行动记录已补“导出行动记录”：主进程生成脱敏后的 `manifest.json`、`action-records.md` 和 `action-records.json` 本机交付文件，并追加 `export-action-records` 行动记录同步团队，避免导出只停留在 UI 提示。
- 审核任务页已展示交接后的发布检查摘要，普通用户可看到“审核结论、证据、发布边界、团队知识包”的通过或待处理状态。

### V1-P6：素材回写和高表现组合

目标：

- 让素材库反哺内容知识地图，形成覆盖缺口和高表现组合。
- 采用 Feedback Loop 模式，素材表现只作为排序和复盘信号，不自动覆盖事实和审核结论。

写集：

- `src/main/services/contentMaterialFeedbackService.ts`
- `src/main/services/materialCoverageAssembler.ts`
- `src/main/services/materialFeedbackPolicy.ts`
- `src/main/services/assetReviewStore.ts`
- `src/renderer/src/app/assetCoverage.ts`
- `src/renderer/src/components/modules/AssetsModule.tsx`

任务：

1. 素材关联卖点、痛点、人群、场景、渠道和 PromptDraft。
2. 素材审核通过后更新 coverage row 的 `materialStatus`。
3. 表现数据回写为 `performanceTag`，例如高转化、高收藏、高完播、高复用。
4. 矩阵优先展示缺素材、缺证据和高表现可复用组合。

验收：

- 素材库能看到素材覆盖了哪些组合。
- 内容知识地图矩阵能看到哪些组合已有素材、哪些仍是空白。
- 高表现标签只作为排序信号，不自动生成事实主张。

当前落地：

- `ContentMaterialFeedbackService` 已把已通过素材回写到内容知识地图矩阵行，并把素材覆盖结果同步到 Bugu 团队工作区；同步 payload 不包含素材本机路径。
- `src/renderer/src/app/assetCoverage.ts` 从内容知识地图的 `materialRefs` 派生素材覆盖索引，不新增重复事实源；素材库卡片和详情页据此展示每个素材覆盖的卖点 / 痛点 / 场景组合。
- 素材回写后的表现标签只显示为排序和复盘信号；待确认补充通过审核任务进入人工确认，不自动改写已发布主文案。
- 内容知识地图素材回写页已能把缺素材组合转成真实 `material-supplement` 审核任务；点击后进入审核台，任务状态为待补素材，建议处理为补素材，并可与同一组合的发布审核任务并存。
- 素材库详情页已补真实任务入口：`AssetsModule` 从当前素材的覆盖组合读取内容地图 ID 和组合 ID，交给 `useContentStudioApp.generateContentMaterialTasksForCoverageRows()` 按地图分组创建 `material-supplement` 审核任务，并跳到审核台；这条链路复用审核任务事实源，不在素材库新增第二套任务表。
- 功能测试和目标 E2E 已覆盖团队同步、本机路径不泄漏、素材覆盖索引、待确认补充任务、补素材任务真实落库和不自动提交审核结论。

### V1-P7：内容制造批次和生产交接

目标：

- 支持按选品、意图、建模、卖点、矩阵、制造、审核、调优和复盘推进内容制造，同时保留证据、审核和平台规则边界。
- 把操作层产品化为内容制造批次、阶段门禁、恢复任务、生产交接行动记录和复盘回写，而不是停留在单个“内容行动”表格。

写集：

- `src/main/services/contentProductionHandoffService.ts`
- `docs/roadmap/ontology/v2/client-capability-migration.md`

任务：

1. 建立批次阶段：选品、意图、建模、卖点、矩阵、制造、审核、调优和复盘。
2. 建立阶段门禁：输入完整度、审核状态、素材覆盖、团队知识包版本、平台规则和人工确认。
3. 建立恢复任务：补输入、补证据、补素材、重新审核、处理共享范围和回写素材覆盖。
4. 执行标准生产交接：生成 PromptDraft、创建 SceneCard、发起审核、请求补证据、启动 SOP、生成素材缺口清单、回写素材覆盖。
5. 每次执行前跑发布检查，检查证据、审核状态、禁用表达、竞品边界、权限、素材可用性和平台规则。
6. 每次执行后写入行动记录，并把审核结论、素材表现和下一步建议回写覆盖矩阵和批次复盘。

验收：

- 一个评论痛点、竞品动作或素材表现能进入内容制造批次，并被映射到阶段恢复任务。
- 一个批次能展示明确阶段、当前门禁、下游产物和恢复路径。
- 阶段产物必须列出卖点、证据、素材、Prompt / SOP、禁用表达和缺口。
- 发布检查未通过时不执行动作，并展示可恢复处理：补证据、补素材、发起审核或改写。
- 行动记录能串起批次、覆盖行、产物、审核、素材表现和回写。
- 不做自动发布、虚假互动、刷量、伪装用户或绕过平台规则。

当前落地：

- 旧内容制造批次运行时已退役；生产交接、素材覆盖、审核任务和 Agent 会话成为当前运行事实源。
- 生产交接继续负责生成 Prompt 草稿、场景卡、SOP 运行、补素材交付包和素材覆盖回写，并通过 Bugu `content-action-records` 追加团队行动记录。
- 真实客户端不再保留内容制造批次页，相关产物链路从素材库、Prompt 工作台、Agents 和运行追溯进入。
- 旧品牌战情室、目标树、作战编组和执行队列运行时已退役；readiness 和 v2 UX copy audit 会阻止旧入口、旧 IPC、旧 Bugu 路由和旧文案回流到当前客户端。

### V1-P8：Agent Knowledge v0.7.2 导出

目标：

- 把审核后的内容知识地图发布为 Agent Knowledge v0.7.2 知识包，供知识库、Prompt 工作台和后续 Agent 客户端消费。
- 采用 Export Assembler + Export Policy，导出前检查审核状态、敏感字段、本机路径和包结构。

写集：

- `src/main/services/agentKnowledgeContentExportService.ts`
- `src/main/services/knowledgePackExportPolicy.ts`
- 当前知识包导出入口收敛到主工作台服务和运行追溯；旧独立知识地图页面已退役。

任务：

1. 生成 `KNOWLEDGE.md`，包含 `type: content-ontology`、`runtime.mode: data`、`metadata.primaryOntology`。
2. 生成 `ontology/ontology.json`、`ontology/concepts.json`、`ontology/relations.json`、`ontology/claims.json`、`ontology/evidence.json`、`ontology/constraints.json`、`ontology/coverage.json`。
3. 可选生成 `answers/`：`questions.json`、`answer-blocks.json`、`citation-targets.json`，并声明 `metadata.primaryAnswers`。
4. 生成 `assets/material-coverage.json`，保留素材覆盖关系、素材引用和表现标签，但不写本机素材路径。
5. 生成高级互操作文件：`interop/ontology.jsonld`、`interop/ontology.ttl`、`interop/ontology.rdf`，只作为外部图谱工具分析输入，不作为运行时事实源。
6. 生成 `compiled/prompt-grounding.md`，只放运行时可注入摘要，不放构建 prompt。
7. 增加包校验，失败时不覆盖已有发布包。

当前落地：

- `AgentKnowledgeContentExportService` 先组装完整包内容，再由 `knowledgePackExportPolicy.ts` 校验，通过后才创建目录、写文件和生成 zip。
- 导出包已包含 `assets/material-coverage.json` 和 `interop/ontology.jsonld` / `interop/ontology.ttl` / `interop/ontology.rdf`；高级互操作文件只用于外部分析，不替代 Bugu 业务服务事实源。
- 导出校验覆盖必需文件、`metadata.primaryOntology`、`metadata.primaryAnswers`、JSON / JSON-LD 合法性、疑似凭证、本机路径、脚本代码、命令行指令、自动发布、刷量、伪装用户和排名操控内容；`assets/` 与 `interop/` 同样纳入数据层安全校验。
- 已审核矩阵行必须引用 ready 证据；待审核或缺证据矩阵行不能进入团队知识包。
- 发布团队知识包前复用同一导出门禁；失败时不会调用 Bugu release API。
- 功能测试已覆盖成功导出、素材覆盖文件、JSON-LD / Turtle / RDF 互操作文件、污染内容阻断和待审核矩阵阻断发布。

验收：

- 导出包能通过 Agent Knowledge v0.7.2 校验。
- `ontology/` 和 `answers/` 都是数据层，不包含 workflow、工具脚本或排名操控指令。
- 客户端只加载相关子图，不加载完整 Ontology。

### V1-P9：Bugu 团队共享和 Release 通道

目标：

- 让内容知识地图能通过 Bugu 业务后端在团队内共享、审核、合并、发布和消费，而不是停留在个人本机或共享目录。
- 采用 Ports and Adapters + Revision Policy；Bugu 是业务事实源，Content Studio 只保存本地缓存和离线草稿。

写集：

- `src/shared/types.ts`
- `src/main/services/contentWorkspaceSyncService.ts`
- `src/main/services/contentDraftChangeStore.ts`
- `src/main/services/contentKnowledgeReleaseStore.ts`
- `src/main/services/buguContentWorkspaceSyncAdapter.ts`
- `src/main/services/agentKnowledgeContentExportService.ts`
- 当前团队共享消费入口收敛到主工作台服务和运行追溯；旧独立知识地图页面已退役。
- `docs/roadmap/ontology/v1/team-sharing-plan.md`

任务：

1. 定义 `ContentTeamWorkspace`、`TeamMember`、`DraftChange`、`KnowledgeRelease` 和 `ContentWorkspaceSyncPolicy`。
2. 支持本地离线草稿、手动导出 / 导入变更包，显示 diff、作者、baseRevision 和影响对象。
3. 支持提交到 Bugu 团队内容工作区，由服务端保存团队 revision、审核、行动记录、素材覆盖和 release。
4. 支持服务端冲突队列，复杂冲突交给 UI 处理。
5. `ReviewDecision` 和 `ActionLog` 采用 append-only，同步时禁止静默覆盖。
6. 审核后的 revision 可以发布为 Agent Knowledge v0.7.2 release，供 Prompt 工作台和 SOP 选择并在运行记录中追溯。
7. 导出 / 同步前检查 API Key、凭证、本机绝对路径和敏感来源摘录。
8. 共享目录 / Git repo 只作为离线交付、审计归档或灾备兜底，不作为 v1 团队事实源。
9. 发布包如需进入 OEM 云发布中心、下载或 Agent App enablement，再由 Bugu 调用 LimeCore 登记。

验收：

- 两个用户可以通过 Bugu 共享同一个内容工作区，并看到同一服务端 revision。
- 冲突能被检测并进入冲突队列，不能 silent last-write-wins。
- 本地缓存和离线草稿在并发 IPC 写入时不能 silent last-write-wins 丢失审核任务、行动记录、生产交接或知识包版本。
- 本地更新不能删除已有 `ReviewDecision` 或 `ActionRecord`；如需修正错误记录，只能追加新的审核决策、行动记录或冲突处理记录。
- 本地更新不能原地改写已发布团队知识包 release；如需修正包内容、版本号、sha256、对象存储地址或文件清单，只能创建新 release 或从 Bugu 团队工作区显式同步。
- 团队 release 能被 Prompt 工作台和 SOP 作为默认知识源消费；手动 Prompt 草稿、Prompt 协作会话、团队知识包详情页生成的 Prompt 草稿、生产交接 Prompt 草稿和 SOP 运行记录都能看到使用的团队知识包版本。
- 离线导出包不包含模型密钥、登录凭证或本机绝对路径。

## 4. 依赖顺序

```text
P1 类型、本地缓存和服务端同步契约
-> P1.5 Bugu 业务后端契约和 LimeCore 云底座对接
-> P2 输入适配器
-> P3 构建服务
-> P4 工作台和审核
-> P5 发布到内容生产链路
-> P6 素材回写
-> P7 内容制造批次和生产交接
-> P8 Agent Knowledge v0.7.2 导出
-> P9 团队共享和 Release 通道
```

其中 P1-P5 是 v1 最小可交付闭环，P6-P9 是 v1 完整闭环。团队共享影响 P1 的类型字段和 P4 的审核 UI，不能等到最后才补数据契约。

## 5. 风险控制

| 风险 | 控制方式 |
| --- | --- |
| 过度建模 | 只做内容生产需要的概念、关系、证据、约束和矩阵。 |
| 组合爆炸 | 矩阵已支持优先级、筛选、分页和本批送审；生产交接已记录批次、覆盖行和发布检查；Bugu 审核任务和行动记录已支持服务端分页与常用筛选；桌面端生产交接行动记录刷新已按当前对象分批拉取。 |
| LLM 幻觉 | 主张必须绑定 `sourceRefs` 和 evidence status，推断只能 candidate。 |
| 竞品搬运 | 竞品适配器只提取结构和差异机会，不复制可识别文案和创意。 |
| 品牌口径漂移 | 品牌约束和 IP 规则作为发布检查的硬条件。 |
| 操作层滥用 | 不做自动发布、刷量、虚假互动和绕过审核；所有行动写入行动记录。 |
| 标准分裂 | Bugu 是团队业务事实源，`.content-studio/` 只做缓存、离线草稿和运行临时产物；LimeCore 只做 OEM 云底座；对外统一导出 Agent Knowledge v0.7.2。 |
| 团队共享冲突 | Bugu 使用 `baseRevision`、object hash、业务角色校验和冲突队列，禁止静默覆盖。 |
| 敏感数据泄露 | 共享前检查 API Key、凭证、本机路径和敏感来源摘录。 |
