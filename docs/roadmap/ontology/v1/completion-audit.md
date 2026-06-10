# Ontology v1 完成度审计

更新时间：2026-06-01
状态：Local Verified / Production Evidence Pending

## 1. 审计结论

Ontology v1 当前不能标记为生产完成。

可以成立的结论：

- 本地实现已经覆盖 v1 主链：内容知识地图、矩阵、审核、生产交接、素材回写、团队知识包导出、内容制造批次、Bugu 同步适配器和在线验收脚本。
- 内容知识地图构建链路已从本地规则成功兜底升级为真实文字模型结构化生成：本地规则只生成 seed / evidence，真实运行时必须调用 `generate_content_knowledge_map`；模型失败、待配置、缺少结构化输出接口或空结果不会保存为伪成功知识地图。
- 内容知识地图生成流程已落成本地事实源：每次生成都会保存输入收集、团队状态、生成服务检查、来源证据整理、结构化矩阵生成和质量检查步骤；成功和 blocked 路径都可在工作台查看，不再只保存最终知识地图。
- 本地功能测试已通过，覆盖 v1 关键策略、UI 文案门禁、团队共享模拟、知识包导出、在线验收报告归档门禁和两账号同清单校验；UI 文案门禁已经覆盖内容知识地图、审核台、Prompt 工作台、agents 工作台和 SOP 执行页，并通过 retired guard 阻止旧作战入口回流。
- v1 HTML 原型已补成可交互确认版，普通用户不需要理解 Ontology 也能按业务对象下钻证据、风险、恢复路径和交付去向。
- Content Studio 真实客户端已补齐原型第一批关键承诺并完成旧作战运行时退役：内容知识地图支持矩阵行下钻查看证据、风险、恢复路径和交付去向；IP 口径、竞品观察、素材回写、团队知识包内容和高级导出可在真实页面切换查看；矩阵行可直接交接为真实 Prompt 草稿、场景卡和 SOP 执行链路，未审核组合先进入审核台；内容制造批次承接审核、制造、调优和复盘阶段，生产交接行动通过 Bugu `content-action-records` 保留审计和交付物引用。
- Content Studio 内容知识地图页已把“生成流程”落成真实详情页签：同一业务对象内可查看生成服务检查、来源证据整理、结构化矩阵生成、质量检查和团队同步步骤；失败或待配置时显示恢复路径，不再只在右侧摘要里展示少量步骤。
- Content Studio 已补结构化模型生成真实点击回归：普通用户登记输入源后点击“生成内容知识地图”，客户端会通过真实文字生成服务路由调用 `generate_content_knowledge_map`，页面显示模型输出的卖点、痛点、场景和生成流程，本机事实源保留模型名和步骤记录，不再只靠功能测试证明服务层调用。
- Content Studio 生产交接行动记录已补真实复盘和导出交付：复盘结论会追加为行动记录并同步团队，内容制造批次会把复盘要求投影为下一轮恢复任务；行动记录交付文件内容脱敏本机路径，并保留团队审计记录，不再只是 Agent 对话或只读时间线。
- Content Studio 已把矩阵行恢复动作落为真实任务：行详情中的补素材动作会创建 `material-supplement` 审核任务，状态为待补素材，并可与同一组合的发布审核任务并存；审核台可记录补素材决策并同步到 Bugu 适配器。
- Content Studio 已把素材库详情页的补素材入口落到真实任务链路：从素材覆盖组合创建 `material-supplement` 审核任务会进入审核台，按内容地图分组，避免只读覆盖视图或误用当前地图。
- Content Studio 已把补素材动作落为真实交付包：执行补素材清单会生成 `manifest.json`、`material-gap-list.md` 和 `material-gap-list.json`，行动记录写入交付文件引用，UI 展示交付物文件名，Bugu 行动记录同步 payload 会脱敏本机路径。
- Content Studio 已把素材库纳入内容知识地图构建输入：`AssetReviewStore` 的真实审核记录会进入 seed、模型 prompt、`asset-review` 证据、素材验证行、素材驳回复盘行和覆盖摘要；构建过程不写入本机素材路径。
- Content Studio 高级导出页已补真实包内容预览和文件下钻：点击“生成本机预览”后，普通用户能在页面看到 Agent Knowledge v0.7.2、可复用组合、证据、素材覆盖、答疑层、JSON-LD / Turtle / RDF/XML 互操作文件、`compiled/prompt-grounding.md`、zip 大小和 sha256；包文件列表跟随当前本机预览包，可切换读取 `compiled/prompt-grounding.md`、`assets/material-coverage.json` 等真实文件内容，不再只看文件名或摘要。
- Content Studio 审核调整动作已补真实客户端点击级闭环：审核任务页的改名、合并、拆分按钮会通过 IPC 调用 `ContentReviewTaskApplicationService`，回写内容知识地图矩阵、追加审核决策、生成并提交团队变更包；目标 E2E 使用本地 Bugu 内容工作区服务验证 HTTP 适配器请求和本地事实源。
- Content Studio 团队共享动作已补真实客户端点击级闭环：内容知识地图页可从真实 UI 创建变更包、提交团队工作区、导出 / 导入离线变更包、创建团队知识包版本；目标 E2E 验证 release 为 `published`、公开包 URL / object key / sha256 / size / 文件清单可追溯，并通过真实点击“导入变更包”进入主进程文件选择入口，验证导入包进入本机变更包事实源。
- Content Studio 已把输入源“共享范围”纳入团队共享安全门禁：普通用户只需要选择公开资料、团队内部、负责人确认或仅本机；内容知识地图保存 `sourceSensitivity` 摘要，包含仅本机资料时可以保留本机草稿，但不能同步到 Bugu、提交团队变更包或发布团队知识包。
- Content Studio 内容知识地图页已把共享范围门禁落成普通用户可见状态：页面显示“资料共享检查”、共享范围计数、受影响资料标题和恢复路径；包含仅本机资料时，主动作从“生成变更包”切到“处理共享范围”，点击后回到输入源页面处理，不需要普通用户理解 Ontology 或 sensitivity。
- Content Studio Prompt 工作台已补团队知识包手动消费闭环：普通用户手动生成 Prompt 草稿或启动 Prompt 协作时可以选择已发布团队知识包；草稿、会话和模型提示都会保留同一版本引用，避免只有生产交接路径绑定团队口径。
- Content Studio 内容知识地图团队知识包详情页已补真实交接：已发布团队知识包版本可以直接生成 Prompt 工作台草稿，草稿保留团队知识包版本、内容知识地图 ID、覆盖行 ID、来源引用、禁用边界和资料缺口；未发布版本或没有可复用组合时只显示恢复路径。
- Content Studio 内容知识地图页已补“拉取团队更新”真实入口：团队知识包当前对象区和右侧交付区都能触发工作区刷新，拉取 Bugu 团队知识包版本、同步冲突和团队行动记录；目标 E2E 注入远端已发布版本后点击该入口，验证页面和本机缓存都出现远端团队更新包。
- Content Studio 生产交接闭环门禁已补到 readiness：矩阵行进入 Prompt 草稿、场景卡、SOP 运行前必须经过发布检查和审核证据检查；团队知识包版本只绑定当前内容知识地图对应的已发布版本，没有本项目 release 时只能生成本机草稿，不能退回绑定其他项目知识包。
- 生产交接链路已补团队知识包版本边界：生成 Prompt 草稿、创建场景卡和启动 SOP 会把当前内容地图的已发布团队知识包写入下游产物和行动记录；当前地图没有 release 时不会借用其他项目 release，行动记录只展示“团队知识包：标题 版本”的业务追溯信息。
- 生产交接动作已补审核门禁：生成 Prompt 草稿、创建场景卡和启动 SOP 前会重新读取审核任务；历史 ready 交接也不能绕过未审核组合。
- Content Studio 本地 v1 事实源已补原子写和事务式读改写：内容知识地图、审核任务、生产交接、内容制造批次、团队知识包、变更包、输入源、素材审核、Prompt 草稿、场景卡、SOP 运行和生成日志的关键写入不会在并发 IPC 下互相覆盖。
- Content Studio 本地 Store 已补追加和不可变不变量：审核任务已有 `ReviewDecision`、生产交接已有行动记录、团队知识包已发布为 release 时，普通本机更新不能删除、覆盖或篡改历史事实。
- 内容知识地图版本、生成流程、审核任务、生产交接、离线变更、内容制造批次和团队知识包发布历史已去掉事实源层展示阈值截断；超过展示阈值的历史记录仍保留在本地事实源，UI 和同步刷新负责分批展示。
- Content Studio 已修复本地工作台加载阻断：远端同步冲突列表在未配置真实 Bugu 管理 token 时降级为空列表，不再阻断内容知识地图、输入源和团队知识包的本地读取。
- Bugu 业务后端已补 `content-knowledge-maps`、`content-build-runs` 和 `content-action-records` current 事实源：团队内容知识地图快照、覆盖摘要、质量问题、构建运行步骤和生产交接行动记录不再只存在于桌面本地 JSON 或 release 元数据里；Content Studio 构建完成后会先同步知识地图快照，再同步生成流程摘要，生产交接会追加行动记录，未登录 Bugu 时仍只保存本机缓存，不伪造团队同步。
- Content Studio 已补 current 事实源读回本机缓存：内容知识地图列表会分页拉取 Bugu `content-knowledge-maps`，生成流程列表会分页拉取 `content-build-runs`；团队刷新失败时只保留本机缓存，不把 release 或行动记录旁路当作完整团队事实源。

不能成立的结论：

- 不能宣称“v1 已生产完成”。
- 不能把 localhost、内网地址、链路本地地址、mock server、两本地工作区模拟、人工截图或 metadata-only release 当作生产验收。
- 不能在没有真实公开包、真实两账号、真实 Bugu 团队工作区和生产报告归档校验前发布完成声明。

生产完成仍缺 4 类外部证据：

1. 真实 Bugu 业务后端工作区：`https://api.bugu.run` 返回真实团队内容工作区、团队 revision、知识地图、构建运行、审核任务、生产交接行动记录和默认知识包。
2. 两组真实团队账号：actor A / B 读取同一工作区、同一默认知识包、同一批团队知识包版本、同一批知识地图、同一批构建运行、同一批审核任务和同一批生产交接行动记录。
3. 真实对象存储公开包：R2 / OSS 公开地址可访问，大小和 sha256 与 Bugu release 元数据一致。
4. 生产归档报告：`content:v1:verify-online` 生成 JSON，随后通过 `content:v1:verify-report -- --production --require-api-base-url=https://api.bugu.run`。

## 2. 审计依据

| 来源 | 用途 |
| --- | --- |
| [`README.md`](./README.md) | v1 目标、当前落地进度、主链路和文档索引。 |
| [`acceptance-plan.md`](./acceptance-plan.md) | AC-00 到 AC-13 验收标准和当前实现状态。 |
| [`business-ui-contract.md`](./business-ui-contract.md) | 普通用户 UI 契约、禁用工程词和业务对象要求。 |
| [`module-design.md`](./module-design.md) | Renderer / IPC / Application Service / Policy / Store / Adapter 边界。 |
| [`server-integration-plan.md`](./server-integration-plan.md) | Bugu、LimeCore、Content Studio 的事实源分工。 |
| [`team-sharing-plan.md`](./team-sharing-plan.md) | 团队共享、离线草稿、冲突、权限和 release 规则。 |
| [`reports/README.md`](./reports/README.md) | 真实线上验收报告归档门禁。 |
| `scripts/verify-content-ontology-v1-online.mjs` | v1 在线验收总入口。 |
| `scripts/verify-content-ontology-v1-report.mjs` | v1 生产报告归档校验。 |
| `tests/functional/content-flow.test.mjs` | 本地功能测试和报告门禁覆盖。 |

## 3. 本轮实测证据

| 检查 | 命令 / 证据 | 结果 |
| --- | --- | --- |
| TypeScript 契约 | `npm run typecheck` | 通过。 |
| 生产构建 | `npm run build` | 通过。main、preload 和 renderer 都完成 production build。 |
| Electron smoke | `npm run smoke:electron` | 通过。桌面端可启动，preload bridge 可用，核心 blocked 路径和技能页点击流通过。 |
| 功能测试 | `npm run test:functional` | 通过。`v2 UX copy audit` 已纳入 v1 五个普通用户主路径模块；`content-flow.test.mjs` 通过。 |
| 内容知识地图模型生成回归 | `npm run test:functional` | 通过。覆盖 `generate_content_knowledge_map` 结构化生成调用、模型输出矩阵落库、模型资料缺口进入 gaps，以及未配置生成服务 / 缺少结构化输出接口不产生伪矩阵。 |
| 内容知识地图生成流程记录 | `npm run test:functional` | 通过。覆盖成功路径生成流程记录，以及生成服务待配置 / 缺结构化输出接口时的 blocked 步骤记录。 |
| 素材库构建输入回归 | `npm run test:functional`，2026-05-30 | 通过。覆盖 `AssetReviewStore` 审核记录进入 `generate_content_knowledge_map` prompt、生成 `asset-review` 证据、落库 `assetReviewCount`、保留 `materialRefs` / `performanceTags` / 驳回状态，并验证 prompt 和本地知识地图不泄漏本机素材路径。 |
| Playwright E2E | `npm run test:e2e` | 通过。33 个用例全通过，包含视频素材包 SOP 二次运行、审核交接、SOP 表单运行、内容知识地图 v1 真实工作台、内容制造批次和业务主链待配置边界。 |
| v1 本地 readiness | `npm run content:v1:verify-readiness` | 通过。必需文档、实现文件、验证脚本、package scripts、原型禁用词、完成度审计、文档状态口径、历史状态措辞、三类 current 主事实源、compat 旁路边界、团队知识包详情页到 Prompt 工作台真实交接门禁和 Agent Knowledge 包文件下钻门禁均通过；真实线上报告缺失以 warning 呈现。 |
| 本地总闸覆盖 | `npm run verify:local` 脚本 | 已接入 `content:v1:verify-readiness`，全量本地验证会自动执行 v1 readiness gate。 |
| 本地总闸实测 | `npm run verify:local`，2026-06-01 02:49 CST | 通过。覆盖 typecheck、v1 readiness、build、v2 provider / acceptance / UX copy、154 条 functional、Electron smoke 和 33 个 Playwright E2E；本地无真实 Provider Key 时 provider strict gate 按预期 blocked，但验收和业务主链 blocked 路径通过。 |
| 旧作战运行时退役门禁 | readiness / v2 UX copy audit | 通过。旧品牌战情室、目标树、作战编组和执行队列运行时已退役，客户端 current 入口收敛到内容知识地图、审核台、内容制造批次、生产交接行动记录和团队知识包。 |
| 矩阵下钻真实入口 | `ContentKnowledgeMapModule` | 通过本地编译和 E2E。矩阵行可点击查看证据摘录、素材状态、恢复路径、交付去向，并可生成审核任务。 |
| 矩阵行状态化主动作 | `npm run test:e2e -- -g "内容知识地图 v1 真实工作台支持下钻、素材回写和作战入口"`，2026-06-01 | 通过。ready 行详情主动作直接生成 Prompt 草稿；缺证据行详情主动作显示“创建补证据任务”，生产交接按钮置灰，点击后进入审核台并显示待补证据任务。`matrix-row-primary-action-gate` 已纳入 readiness，防止行详情退回为不分状态的泛化按钮。 |
| v1 生产 readiness | `npm run content:v1:verify-readiness -- --require-production-report` | 按预期失败。失败原因是缺少真实线上 v1 验收报告，证明本地 gate 不会把缺失生产证据误判为完成。 |
| v1 生产 readiness 复核 | `npm run content:v1:verify-readiness -- --require-production-report`，2026-05-30 | 按预期失败。输出明确为 `[失败] 缺少真实线上 v1 验收报告`，本地实现继续保持 `Production Evidence Pending`。 |
| v1 prototype 脚本语法 | 抽取 `prototype/index.html` 内 `<script>` 后执行 `node --check -` | 通过。 |
| v1 prototype 禁用词扫描 | 扫描普通用户禁用工程词、TODO、未实现、placeholder、静态反馈文案 | 未命中。 |
| v1 prototype 点击验证 | Playwright + 系统 Chrome 打开 `prototype/index.html`，验证卖点矩阵下钻、Prompt 交付、Prompt/SOP/素材库导航、知识包目录切换 | 通过，截图：`/tmp/content-studio-ontology-v1-prototype.png`。 |
| v1 文档空白检查 | `git diff --check -- docs/roadmap/ontology/v1` | 通过。 |
| 线上报告目录 | `find docs/roadmap/ontology/v1/reports -maxdepth 1 -type f` | 仅有 README 和 schema，没有真实 `<date>-online-acceptance.json`。 |
| 真实客户端 v1 下钻回归 | `npm run test:e2e -- -g "内容知识地图 v1 真实工作台支持下钻"`，2026-06-01 | 通过。验证内容知识地图种子数据写入、工作区刷新、生成流程详情页签、矩阵行下钻、真实 Prompt 草稿交接、真实场景卡交接、真实 SOP 运行交接、IP 口径、竞品观察、团队知识包详情、团队知识包详情页直接生成 Prompt 草稿、素材回写、高级导出和本机预览；高级导出页可读取 `compiled/prompt-grounding.md` 与 `assets/material-coverage.json`，团队知识包 Prompt 草稿包含团队版本、地图标题、覆盖行、来源引用、可复用卖点、禁用边界和节奏等下游变量；素材回写页和素材库详情页都能创建真实补素材任务并进入审核台；生产交接行动记录会写入真实 Prompt 草稿、场景卡、SOP 运行和素材覆盖回写引用，不能只更新页面文案。 |
| 旧作战快照退役保护 | `npm run content:v1:verify-readiness`，2026-06-01 | 通过。readiness 会检查旧品牌战情室运行时文件、IPC / preload / shared type / dev bridge / functional / E2E 引用和旧 Bugu 路由均已移除，防止客户端退回旧作战快照。 |
| 团队知识包主动作收敛 | `npm run test:e2e -- -g "内容知识地图 v1 真实工作台支持下钻、素材回写和作战入口"`，2026-05-30 | 通过。团队知识包当前对象区只保留 1 个主动作，右侧交付栏不再渲染第二个 `.primary` 按钮，避免普通用户同时看到多个同等权重的“生成 Prompt 草稿”。 |
| 审核调整真实客户端回归 | `npm run test:e2e -- -g "审核任务调整动作会真实改写内容知识地图"`，2026-05-30 | 通过。真实点击审核任务页“保存改名 / 合并所选 / 拆分成 2 条”，验证内容知识地图矩阵行被改名、合并后保留证据 / 素材 / 表现标签、拆分后生成两个待审核且缺素材的子条目；审核决策追加到同一任务，团队变更包通过 Bugu 适配器同步。 |
| 团队共享真实客户端回归 | `npm run test:e2e -- -g "内容知识地图团队共享按钮会真实生成变更包和知识包版本"`，2026-05-31 | 通过。真实点击内容知识地图页“生成变更包 / 提交团队工作区 / 导出变更包 / 导入变更包 / 创建知识包版本 / 拉取团队更新”，导入阶段通过主进程“选择内容变更包”入口选中真实导出目录，不再用 preload 直调替代 UI 验收；验证本机存在已同步变更包和导入本机草稿，release 为 `published`，公开包 URL、object key、zip sha256、size、`KNOWLEDGE.md / manifest.json / ontology/ontology.json` 文件清单和 Bugu HTTP payload 均可追溯；远端已发布版本注入后，点击“拉取团队更新”会显示远端团队更新包并写入本机团队版本缓存。 |
| 输入源共享范围安全门禁 | `npm run test:functional -- --test-name-pattern "输入源共享范围会进入内容地图并阻止仅本机资料发布到团队"`，2026-06-01 | 通过。覆盖手动登记和用户反馈输入源的共享范围推断，内容知识地图写入 `sourceSensitivity`，包含仅本机资料时创建团队变更包和团队知识包发布都返回 blocked，Bugu 同步 / 发布适配器不被调用。 |
| 资料共享检查真实客户端回归 | `npm run test:e2e -- -g "内容知识地图会把仅本机资料阻断展示为共享范围处理任务"`，2026-06-01 | 通过。目标 E2E 种入包含“仅本机投放复盘”的内容地图，验证内容知识地图页显示“资料共享检查”、仅本机资料标题、“包含不能同步或发布的资料”和“1 个仅本机资料”；底部主动作不再出现“生成变更包”，点击“处理共享范围”会进入输入源页面并看到该资料的“仅本机”共享范围。 |
| 同步冲突真实客户端回归 | `npm run test:e2e -- -g "内容知识地图团队共享按钮会真实生成变更包和知识包版本"`，2026-05-31 | 通过。目标 E2E 注入旧版本提交冲突，真实点击“拉取团队更新 / 查看清单 / 按清单转人工确认”，验证 Bugu `content-sync-conflicts` 收到 `resolutionAction=manual-review-recorded` 和逐项 `mergeDraft.rows`，本机内容地图回到 `pending-sync`，避免冲突只停留在提示文案。 |
| 生产交接审核门禁回归 | `npm run test:functional`；`npm run test:e2e -- -g "内容知识地图 v1 真实工作台支持下钻"`，2026-05-30 | 通过。功能测试覆盖未审核矩阵组合生成待审核任务、历史交接请求未全量审核时不创建 Prompt 草稿；目标 E2E 种子改为先生成审核任务并提交通过，再执行生产交接。 |
| 结构化模型生成真实点击回归 | `npm run test:e2e -- -g "内容知识地图页点击生成会调用真实结构化文字服务并显示模型矩阵"`，2026-05-31 | 通过。真实点击输入源页“登记文本输入源”登记产品资料、手动粘贴 SKU 表、评论 / 客服问题和竞品观察，再点击内容知识地图页“生成内容知识地图”；验证本地 OpenAI Chat 兼容服务收到 `generate_content_knowledge_map` 请求，页面显示模型生成卖点、痛点、场景和生成流程，本机内容地图与生成流程记录 `test-text-model`，同时保留 SKU 组合、评论痛点和竞品边界；同一点击链路会写入 Bugu `content-knowledge-maps` 和 `content-build-runs`，payload 包含矩阵快照、生成步骤和 base revision，并把服务端 revision 回写到本机地图和生成流程。 |
| v1 本地事实源并发写入回归 | `npm run test:functional -- --test-name-pattern "v1 本地事实源并发写入不会丢失审核和行动记录"`，2026-05-30 | 通过。并发写入内容知识地图、审核任务、内容制造批次、生产交接记录和 SOP 草案定义，不丢 ID、不覆盖行动记录。 |
| v1 追加 / 不可变不变量回归 | `npm run test:functional -- --test-name-pattern "v1 本地事实源禁止覆盖已有审核决策、行动记录和已发布知识包版本"`，2026-05-30 | 通过。已有审核决策、生产交接行动记录和已发布团队知识包版本不能通过普通本机 update / save 被删除、覆盖或篡改。 |
| v1 审计历史保留回归 | `npm run test:functional -- --test-name-pattern "v1 本地事实源超过展示阈值仍保留审计历史"`，2026-05-30 | 通过。内容地图、生成流程、变更包、审核任务、内容制造批次和生产交接超过旧展示阈值后仍保留最早记录。 |
| v1 补素材任务真实落库 | `npm run test:functional -- --test-name-pattern "内容知识地图可为同一组合创建独立补素材任务"`，2026-05-30 | 通过。同一矩阵组合可同时创建发布审核任务和补素材任务；补素材任务进入审核任务 Store、状态为待补素材、决策为补素材并同步到测试团队适配器。 |
| 生产交接补素材交付包 | `npm run test:functional -- --test-name-pattern "生产交接"`，2026-05-30 | 通过。补素材动作会创建 `material-supplement / needs-material / request-material` 审核任务，并生成 `manifest.json`、`material-gap-list.md`、`material-gap-list.json`；清单写入审核任务 ID、缺口行和素材状态，包内不泄漏本机工作区路径。 |
| Bugu 补素材任务服务端保真 | `/Users/coso/Documents/dev/ai/bugu/bugu`：`npm run smoke:oem-service`、`npm run typecheck`，2026-05-30 | 通过。Bugu `content-review-tasks` 保存并返回 `taskPurpose=material-supplement`、`status=needs-material`、`suggestedAction=request-material`；控制台待处理审核列表展示待补素材任务。 |
| v1 团队知识包同步和历史保留 | `npm run test:functional -- --test-name-pattern "v1 团队知识包远端同步可刷新元数据并保留发布历史"`，2026-05-30 | 通过。Bugu 团队工作区拉取走显式同步入口，保留本机预览路径；超过 120 条团队知识包历史后仍不截断本地事实源。 |
| Prompt 工作台团队知识包绑定 | `npm run test:functional -- --test-name-pattern "Prompt 工作台手动草稿和协作会绑定团队知识包版本"`，2026-05-30 | 通过。手动草稿和 Prompt 协作都会保存同一团队知识包版本，草稿内容和会话消息均包含版本提示。 |
| SOP 执行团队知识包选择 | `npm run test:functional -- --test-name-pattern "SOP 执行可以显式选择团队知识包版本"`；`npm run test:e2e -- -g "SOP 执行页显式选择资料并写入运行记录"`，2026-05-31 | 通过。SOP 执行表单可选择已发布团队知识包版本；运行记录保存 `teamKnowledgeRelease`，并写入 `team-knowledge-release:<releaseId>` 产物线索，持久化记录和本轮返回一致；真实客户端点击级回归覆盖下拉选择版本后再运行 SOP。 |
| 团队知识包详情页 Prompt 交接服务化 | `npm run test:functional -- --test-name-pattern "团队知识包详情页交接会在主进程生成带版本依据的 Prompt 草稿"`，2026-05-30 | 通过。`ContentTeamKnowledgePromptDraftService` 校验当前内容知识地图的已发布团队知识包版本，生成 Prompt 草稿并保存团队版本、地图标题、覆盖行、来源引用、禁用边界、资料缺口和短视频变量；草稿不写入本机工作区路径。 |
| 生产交接闭环门禁 | `npm run test:functional -- --test-name-pattern "生产交接不会把其他内容知识地图的团队知识包误绑定到本机草稿"`；`npm run content:v1:verify-readiness`，2026-05-30 | 通过。生产交接只绑定当前内容知识地图对应的已发布团队知识包；没有本项目 release 时，Prompt 草稿、提示词依据和行动记录不写其他项目团队版本，发布检查仍保留“仅可作为本机草稿”的恢复提示。 |
| 生产交接团队知识包版本边界 | `npm run test:functional -- --test-name-pattern "生产交接"`，2026-05-31 | 通过。生产交接生成 Prompt 草稿、场景卡和 SOP 运行时绑定当前地图团队知识包版本，并写入行动记录；只有其他项目 release 时不绑定错误团队知识包。 |
| Agent Knowledge 高级导出互操作 | `npm run test:functional -- --test-name-pattern "Agent Knowledge 导出会校验 v0.7.2 数据包并在失败时阻止发布"`，2026-06-01 | 通过。导出包真实包含 `assets/material-coverage.json`、`interop/ontology.jsonld`、`interop/ontology.ttl` 和 `interop/ontology.rdf`；功能测试读取 `compiled/prompt-grounding.md` 并校验卖点和规则内容，同时阻断包内越界路径、工作区外包目录和符号链接越界，避免 UI 下钻读取任意本机文件；`agent-knowledge-pack-file-preview-gate` 会把服务端安全读取、IPC / preload、真实 UI 切换、滚动预览、功能测试和 E2E 证据纳入 readiness。 |
| 生产交接行动历史保留 | `npm run test:functional -- --test-name-pattern "生产交接"`，2026-05-30 | 通过。大量本机历史记录刷新团队记录后仍全部保留，并追加团队新记录。 |
| 生产交接行动记录导出 | `npm run test:functional -- --test-name-pattern "生产交接"`，2026-05-30 | 通过。导出会生成 `manifest.json`、`action-records.md` 和 `action-records.json`，包内不写本机工作区路径，并追加 `export-action-records` 团队行动记录。 |
| 生产交接主动作确认 | `npm run test:functional -- --test-name-pattern "生产交接"`，2026-05-30 | 通过。Prompt 草稿、场景卡、SOP 运行和素材覆盖回写都写入行动记录并同步团队事实源。 |
| Bugu 生产交接服务端保真 | `/Users/coso/Documents/dev/ai/bugu/bugu`：`npm run smoke:oem-service`、`npm run typecheck`，2026-05-30 | 通过。Bugu `content-action-records` 可保存、分页筛选并返回生产交接动作；控制台以业务动作显示，不降级为泛化“内容动作”。 |
| Bugu 行动记录交付物服务端安全 | `/Users/coso/Documents/dev/ai/bugu/bugu`：`npm run smoke:oem-service`、`npm run typecheck`，2026-05-30 | 通过。Bugu `content-action-records` 直接拒绝本机绝对路径、`file://`、临时目录路径和带 `api_key / token / secret / password` 查询参数的 `artifactRefs`，避免团队事实源保存不可共享路径或凭证线索。 |
| Bugu 服务端策略门禁 | `/Users/coso/Documents/dev/ai/bugu/bugu`：`npm run smoke:oem-service`；`npm run content:v1:verify-readiness`，2026-05-31 | 通过。readiness 会检查 Bugu 服务端 revision、幂等、角色权限、发布审批和安全策略的代码路径，并要求 smoke 覆盖 release 创建权限、幂等、revision 冲突、安全 payload 和内网公开包地址拦截；只读角色不能创建团队知识包或追加行动记录，旧 `baseRevision` 不能覆盖团队当前版本，不安全发布包 payload、内网公开包地址和行动交付物引用会被服务端拒绝。 |
| 团队共享版本 / current 主事实源 / 业务流同清单和同交付物门禁 | `npm run test:functional -- --test-name-pattern "团队知识包在线验收脚本会分页查找指定 release"`；`npm run test:functional -- --test-name-pattern "团队知识包在线验收要求生产公开包具备大小和 sha256"`；`npm run test:functional -- --test-name-pattern "团队知识包在线验收会拒绝非公网公开包地址"`；`npm run test:functional -- --test-name-pattern "团队共享在线验收要求两个账号看到同一工作区、团队知识包和交付物引用"`；`npm run test:functional -- --test-name-pattern "团队共享在线验收会拒绝空的团队主事实源清单"`；`npm run test:functional -- --test-name-pattern "团队共享在线验收会拒绝空的团队审核任务和行动记录"`；`npm run test:functional -- --test-name-pattern "Ontology v1 在线验收可以汇总知识包和团队共享报告"`；`npm run test:functional -- --test-name-pattern "Ontology v1 生产验收报告归档会拒绝本地 mock 报告"`，2026-06-01 | 通过。`content:release:verify-online` 按分页查找指定 release，不只验证第一页；`content:v1:verify-online --require-public-package` 会把公开包要求传给 release 验收，要求上传状态为 `stored`、包大小大于 0、sha256 为 64 位十六进制、公开包地址为 http/https 公网地址，并拒绝 `file://`、相对路径、本机地址、内网 IP、链路本地地址、IPv6 ULA / link-local 和 IPv4-mapped loopback；`content:team:verify-online` 按分页完整拉取并比对 `content-knowledge-maps`、`content-build-runs` 两类 current 主事实源的非空清单，以及非空 `releaseCount` / `releaseIds` / `releaseListComplete`、`reviewTaskCount` / `reviewTaskIds`、`actionRecordCount` / `actionRecordIds`；同时要求两账号看到相同 `actionArtifactRecordIds` 和 `actionArtifactRefsByRecordId`；交付物引用不能包含本机绝对路径、`file://` 或疑似凭证，并且必须包含 `material-gap-list.json`。`content:v1:verify-report -- --production` 拒绝团队知识包版本为空（`team-release-present`）、版本数量 / ID 清单 / 完整拉取标记不一致，以及知识地图和构建运行 current 主事实源为空、审核任务为空（`team-review-present`）、行动记录为空（`team-action-present`）、交付物引用缺失或不一致、交付物引用不安全、补素材清单缺失、公开包 `publicUrl` 不是 http/https 公网地址、API base 不是公网地址、ID 清单数量少于 count、清单未完整拉取，以及生产模式下跳过 release 或 team 任一顶层验收段（`skipped-section`）的生产报告；schema 已把团队知识包版本摘要、审核任务摘要、行动记录摘要、交付物引用摘要、公开包 URL 形态和完整拉取标记列为必需字段。 |
| Bugu 团队清单分页保真 | `/Users/coso/Documents/dev/ai/bugu/bugu`：`npm run smoke:oem-service`，2026-05-30 | 通过。Bugu `content-review-tasks` 和 `content-action-records` 均返回 `limit / offset / total`，smoke 覆盖 `offset=1` 分页，避免生产验收脚本只验证第一页。 |
| 未接生产 Bugu token 的本地兜底 | `ContentWorkspaceSyncService.listSyncConflicts` | 通过目标 E2E 间接覆盖。远端冲突读取失败时返回空冲突列表，避免本地工作台因 `admin token missing or invalid` 整体回到空态。 |

## 4. AC 逐项审计

状态定义：

- `Local Verified`：本地实现、功能测试、文档和脚本足以证明本地闭环成立。
- `Production Pending`：本地闭环成立，但生产完成还需要真实 Bugu / 账号 / 对象存储证据。
- `Not Complete`：当前证据不足以证明该项已经实现。

| AC | 验收项 | 当前状态 | 本地证据 | 生产缺口 |
| --- | --- | --- | --- | --- |
| AC-00 | 业务 UI 契约门禁 | Local Verified | `business-ui-contract.md`；`prototype/README.md`；v1 prototype 点击验证；`v2-ux-copy-audit` 纳入功能测试；团队知识包详情页目标 E2E 检查当前对象区唯一主动作，右侧交付栏只做辅助入口；矩阵行状态化主动作目标 E2E 和 readiness 覆盖。 | 仍需真实用户点击级验收确认普通运营不需要理解 Ontology。 |
| AC-01 | 产品 brief 卖点拆解 | Local Verified | `contentKnowledgeMapBuilder.ts`、`contentKnowledgeMapValidator.ts`；功能测试覆盖缺证据、禁用表达、PromptDraft 交接。 | 真实产品 brief / 品牌资料生产验收。 |
| AC-02 | SKU 表矩阵 | Local Verified | 构建器识别 SKU / 规格 / 价格字段；手动粘贴 CSV 风格 SKU 表保留换行并解析成 SKU 场景；矩阵支持筛选、排序、分页和本批送审；功能测试和真实客户端 E2E 覆盖。 | 真实 SKU 表批量组合质量验收。 |
| AC-03 | 用户反馈痛点聚类 | Local Verified | `user-feedback` 拆成 `user-quote` / `customer-service-log` 证据；矩阵证据列显示用户原声；功能测试覆盖。 | 真实评论 / 客服记录聚类质量验收。 |
| AC-04 | 品牌口径和禁用表达 | Local Verified | validation policy 和 production handoff policy 二次检查禁用 / 绝对化表达；功能测试覆盖被拦截路径。 | 真实品牌规则库和审核人员复核。 |
| AC-05 | IP 人设一致性 | Local Verified | 构建器读取 IP 六层知识库；`ContentMatrixRiskPolicy` 输出 `ip-voice-drift` / `IP 口径漂移`；validation、审核任务和生产交接共用；功能测试覆盖 high 风险标签和降级建议动作。 | 真实 IP 素材跨平台输出验收。 |
| AC-06 | 竞品观察和差异化机会 | Local Verified | `competitor-observation` 输入用途；竞品行默认待审核；生产交接阻断竞品观察直交 Prompt。 | 真实竞品观察边界和法务 / 品牌审核验收。 |
| AC-07 | 素材覆盖回写 | Local Verified | `ContentKnowledgeMapApplicationService` 构建时读取 `AssetReviewStore`，生成 `asset-review` 证据、素材验证行、素材驳回复盘行和 `assetReviewCount`；`ContentMaterialFeedbackService`、`materialCoverageAssembler.ts` 支持回写覆盖组合；素材库详情可反查覆盖组合，并可直接从覆盖组合创建真实补素材审核任务；内容知识地图素材回写页可创建真实补素材审核任务；`asset-library-material-task-gate`、功能测试和目标 E2E 覆盖构建输入不泄漏本机路径、不改写事实、补素材任务真实落库。 | 真实素材库和表现数据回写验收。 |
| AC-08 | 提示词依据子图注入 | Local Verified | `PromptGroundingAssembler` 只注入当前组合、已通过证据短摘录和边界；功能测试覆盖长证据截断和未通过证据排除。 | 真实 Prompt 工作台内容质量验收。 |
| AC-08A | 审核调整闭环 | Local Verified | 审核任务支持改名、合并、拆分；main 侧更新地图并提交变更包；Bugu payload 同步；功能测试和真实客户端 E2E 覆盖 UI 点击、地图回写、决策追加和变更包同步。 | 真实团队审核人员操作验收。 |
| AC-09 | 生产交接行动记录 | Local Verified | `ContentProductionHandoffService`、生产交接 policy、审核任务、素材覆盖回写、Prompt 草稿、场景卡、SOP 运行和团队行动记录；功能测试覆盖 Bugu 行动记录拉取、权限拦截、未审核组合待审核、历史交接请求审核二次拦截、补素材交付包、复盘行动记录、团队知识包版本绑定和跨地图错绑防护；目标 E2E 覆盖审核通过后在内容知识地图行详情执行交接，并验证真实 Prompt 草稿、真实场景卡、真实 SOP 运行、素材覆盖回写和团队行动记录。 | 真实团队、多席位、跨设备行动记录验收。 |
| AC-10 | 真实生成服务和待配置兜底 | Local Verified | `ContentKnowledgeMapApplicationService` 可调用 `TextGenerationService.generateJson` 执行 `generate_content_knowledge_map`，模型输出经固定 schema、来源 / 证据约束和 validation policy 落库；生成服务待配置、失败、缺少结构化输出接口或空矩阵时保存待配置 / 失败记录，不生成伪矩阵 / 伪证据；`ContentKnowledgeMapBuildRunStore` 保存成功和 blocked 生成流程记录；Bugu `content-knowledge-maps` 保存团队地图快照，`content-build-runs` 保存团队生成流程摘要；功能测试覆盖服务层策略；目标 E2E 覆盖普通用户点击“生成内容知识地图”后通过真实文字服务路由生成模型矩阵、显示生成流程，并向 Bugu 测试服务写入地图快照和生成流程 payload。 | 仍需真实模型 Key / 真实产品资料执行质量验收；无 Key 环境表现已本地覆盖。 |
| AC-11 | Agent Knowledge v0.7.2 导出 | Local Verified | `AgentKnowledgeContentExportService` 生成 `KNOWLEDGE.md`、`ontology/`、`answers/`、`assets/material-coverage.json`、`interop/ontology.jsonld` / `ontology.ttl` / `ontology.rdf`、zip、sha256 / size；导出 policy 阻断敏感内容、本机路径、脚本和操控指令；`contentKnowledgePack:readFile` 只读取当前工作区本机预览包并阻断越界读取；功能测试覆盖素材覆盖、互操作文件、预览摘要、真实文件读取和安全阻断；目标 E2E 覆盖高级导出页真实点击生成本机预览、切换读取 `compiled/prompt-grounding.md` 与 `assets/material-coverage.json`。 | 真实包上传到 R2 / OSS 后公开地址和 sha256 校验。 |
| AC-12 | 团队共享和 Release | Production Pending | Bugu smoke、本地双工作区模拟、知识地图快照服务端事实源、构建运行服务端事实源、同步冲突、release 拉取、团队知识包绑定、Prompt 工作台选择团队知识包、SOP 执行表单选择团队知识包、补素材任务保真、行动记录交付物服务端安全校验、输入源共享范围门禁、资料共享检查真实客户端回归、在线验收脚本、报告门禁、本地事实源并发写入、追加不变量、已发布 release 不可变、发布历史保留、真实客户端点击创建 / 提交 / 导出 / 导入变更包、发布团队知识包版本、拉取团队更新和同步冲突处理均已覆盖。 | 必须使用真实 Bugu 工作区、两真实账号和真实公开包执行 `content:v1:verify-online` 并归档生产报告。 |
| AC-13 | 普通用户不感知 Ontology | Local Verified | `v2-ux-copy-audit` 扫描内容知识地图、审核台、内容制造批次、Prompt 工作台、agents 工作台和 SOP 执行页；readiness 检查覆盖范围；prototype 禁用工程词扫描未命中；业务 UI 契约已落文档。 | 真实用户验收仍需确认文案理解成本。 |

## 5. 不能宣称完成的硬门槛

以下任一项缺失时，v1 只能称为本地已验证，不能称为生产完成：

| 门槛 | 必需证据 | 当前状态 |
| --- | --- | --- |
| 真实 Bugu API | 报告 `target.apiBaseUrl` 是 `https://api.bugu.run`，且非 localhost / 127.0.0.1。 | 缺失。 |
| 真实团队工作区 | `target.workspaceId` 对应真实团队内容工作区，revision 非空。 | 缺失。 |
| 两真实账号 | actor A / B 的工作区、默认 release、审核任务 ID、行动记录 ID 一致。 | 缺失。 |
| 公开 release 包 | release 为 published / approved，`package.publicUrl` 是 http/https 公开地址且可访问，`size > 0`，`sha256` 为 64 位十六进制。 | 缺失。 |
| 生产报告归档 | `docs/roadmap/ontology/v1/reports/<date>-online-acceptance.json` 由 `content:v1:verify-online` 生成，并通过生产模式校验。 | 缺失。 |

## 6. 允许和禁止的完成表述

允许：

- “v1 本地实现已经覆盖主链，功能测试通过。”
- “v1 已具备生产只读验收脚本和生产报告归档门禁。”
- “v1 仍待真实 Bugu、真实双账号和真实对象存储公开包完成生产验收。”

禁止：

- “v1 已完成。”
- “v1 已发布生产完成。”
- “本地 mock / localhost 报告证明 v1 完成。”
- “metadata-only release 可视为团队知识包分发完成。”

## 7. 下一步

1. 准备真实 Bugu 团队内容工作区、已批准团队知识包 release 和两个不同团队账号。
2. 确认 release 包已经上传到真实 R2 / OSS，公开地址可访问，size 和 sha256 可复核。
3. 运行：

```bash
npm run content:v1:verify-online -- \
  --tenant=<tenant-id> \
  --workspace-id=<bugu-workspace-id> \
  --release-id=<release-id> \
  --actor-a-token=<user-a-token> \
  --actor-b-token=<user-b-token> \
  --require-public-package \
  --output=docs/roadmap/ontology/v1/reports/<yyyy-mm-dd>-online-acceptance.json
```

4. 运行：

```bash
npm run content:v1:verify-report -- \
  --report=docs/roadmap/ontology/v1/reports/<yyyy-mm-dd>-online-acceptance.json \
  --production \
  --require-api-base-url=https://api.bugu.run
```

5. 报告通过后，再按 AC 表重新审计一次，才允许把本文件状态改为 `Production Verified`。
