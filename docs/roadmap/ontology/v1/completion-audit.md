# Ontology v1 完成度审计

更新时间：2026-05-30
状态：Local Verified / Production Evidence Pending

## 1. 审计结论

Ontology v1 当前不能标记为生产完成。

可以成立的结论：

- 本地实现已经覆盖 v1 主链：内容知识地图、矩阵、审核、生产交接、素材回写、品牌战情室、团队知识包导出、Bugu 同步适配器和在线验收脚本。
- 内容知识地图构建链路已从本地规则成功兜底升级为真实文字模型结构化生成：本地规则只生成 seed / evidence，真实运行时必须调用 `generate_content_knowledge_map`；模型失败、待配置、缺少结构化输出接口或空结果不会保存为伪成功知识地图。
- 内容知识地图生成流程已落成本地事实源：每次生成都会保存输入收集、团队状态、生成服务检查、来源证据整理、结构化矩阵生成和质量检查步骤；成功和 blocked 路径都可在工作台查看，不再只保存最终知识地图。
- 本地功能测试已通过，覆盖 v1 关键策略、UI 文案门禁、团队共享模拟、知识包导出、在线验收报告归档门禁和两账号同清单校验。
- v1 HTML 原型已补成可交互确认版，普通用户不需要理解 Ontology 也能按业务对象下钻证据、风险、恢复路径和交付去向。
- Content Studio 真实客户端已补齐原型第一批关键承诺：内容知识地图支持矩阵行下钻查看证据、风险、恢复路径和交付去向；IP 口径、竞品观察、素材回写、团队知识包内容和高级导出可在真实页面切换查看；矩阵行可直接交接为真实 Prompt 草稿、场景卡和 SOP 运行记录，未审核组合先进入审核台；作战系统支持从左侧直接进入目标树、作战编组、执行队列和行动记录。
- Content Studio 已把矩阵行恢复动作落为真实任务：行详情中的补素材动作会创建 `material-supplement` 审核任务，状态为待补素材，并可与同一组合的发布审核任务并存；审核台可记录补素材决策并同步到 Bugu 适配器。
- 品牌战情室生产动作已补审核门禁：资源包记录覆盖内容组合和已通过审核组合，生成 Prompt 草稿、创建场景卡和启动 SOP 前会重新读取审核任务；新战情室和历史 ready 队列都不能绕过未审核组合。
- Content Studio 本地 v1 事实源已补原子写和事务式读改写：内容知识地图、审核任务、品牌战情室、生产交接、团队知识包、变更包、输入源、素材审核、Prompt 草稿、场景卡、SOP 运行和生成日志的关键写入不会在并发 IPC 下互相覆盖。
- Content Studio 本地 Store 已补追加和不可变不变量：审核任务已有 `ReviewDecision`、品牌战情室已有 `ActionRecord`、团队知识包已发布为 release 时，普通本机更新不能删除、覆盖或篡改历史事实。
- 内容知识地图版本、生成流程、审核任务、生产交接、离线变更、品牌战情室行动记录和团队知识包发布历史已去掉事实源层展示阈值截断；超过展示阈值的历史记录仍保留在本地事实源，UI 和同步刷新负责分批展示。
- Content Studio 已修复本地工作台加载阻断：远端同步冲突列表在未配置真实 Bugu 管理 token 时降级为空列表，不再阻断内容知识地图、输入源、团队知识包和品牌战情室的本地读取。

不能成立的结论：

- 不能宣称“v1 已生产完成”。
- 不能把 localhost、mock server、两本地工作区模拟、人工截图或 metadata-only release 当作生产验收。
- 不能在没有真实公开包、真实两账号、真实 Bugu 团队工作区和生产报告归档校验前发布完成声明。

生产完成仍缺 4 类外部证据：

1. 真实 Bugu 业务后端工作区：`https://api.bugu.run` 返回真实团队内容工作区、团队 revision、审核任务、执行队列、行动记录和默认知识包。
2. 两组真实团队账号：actor A / B 读取同一工作区、同一默认知识包、同一批审核任务和同一批执行队列。
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
| 功能测试 | `npm run test:functional` | 通过。`v2 UX copy audit passed: 19 files, 63 rules`；`content-flow.test.mjs` 通过。 |
| 内容知识地图模型生成回归 | `npm run test:functional` | 通过。覆盖 `generate_content_knowledge_map` 结构化生成调用、模型输出矩阵落库、模型资料缺口进入 gaps，以及未配置生成服务 / 缺少结构化输出接口不产生伪矩阵。 |
| 内容知识地图生成流程记录 | `npm run test:functional` | 通过。覆盖成功路径生成流程记录，以及生成服务待配置 / 缺结构化输出接口时的 blocked 步骤记录。 |
| Playwright E2E | `npm run test:e2e` | 通过。29 个用例全通过，包含视频素材包 SOP 二次运行、审核交接、品牌战情室对话、SOP 表单运行和业务主链待配置边界。 |
| v1 本地 readiness | `npm run content:v1:verify-readiness` | 通过。必需文档、实现文件、验证脚本、package scripts、原型禁用词和完成度审计均通过；真实线上报告缺失以 warning 呈现。 |
| 本地总闸覆盖 | `npm run verify:local` 脚本 | 已接入 `content:v1:verify-readiness`，全量本地验证会自动执行 v1 readiness gate。 |
| 本地总闸实测 | `npm run verify:local`，2026-05-30 00:23 CST | 通过。覆盖 typecheck、v1 readiness、build、v2 provider / acceptance / UX copy、functional、Electron smoke 和 29 个 Playwright E2E。 |
| 作战系统真实入口 | Content Studio 左侧导航和 `BrandCommandCenterModule` | 通过本地编译和 E2E。品牌战情室、目标树、作战编组、执行队列和行动记录都进入同一真实业务模块，不再只是 prototype 页签。 |
| 矩阵下钻真实入口 | `ContentKnowledgeMapModule` | 通过本地编译和 E2E。矩阵行可点击查看证据摘录、素材状态、恢复路径、交付去向，并可生成审核任务。 |
| v1 生产 readiness | `npm run content:v1:verify-readiness -- --require-production-report` | 按预期失败。失败原因是缺少真实线上 v1 验收报告，证明本地 gate 不会把缺失生产证据误判为完成。 |
| v1 prototype 脚本语法 | 抽取 `prototype/index.html` 内 `<script>` 后执行 `node --check -` | 通过。 |
| v1 prototype 禁用词扫描 | 扫描普通用户禁用工程词、TODO、未实现、placeholder、静态反馈文案 | 未命中。 |
| v1 prototype 点击验证 | Playwright + 系统 Chrome 打开 `prototype/index.html`，验证卖点矩阵下钻、Prompt 交付、Prompt/SOP/素材库导航、知识包目录切换 | 通过，截图：`/tmp/content-studio-ontology-v1-prototype.png`。 |
| v1 文档空白检查 | `git diff --check -- docs/roadmap/ontology/v1` | 通过。 |
| 线上报告目录 | `find docs/roadmap/ontology/v1/reports -maxdepth 1 -type f` | 仅有 README 和 schema，没有真实 `<date>-online-acceptance.json`。 |
| 真实客户端 v1 下钻回归 | `npm run test:e2e -- -g "内容知识地图 v1 真实工作台支持下钻、素材回写和作战入口"`，2026-05-30 | 通过。验证内容知识地图种子数据写入、工作区刷新、矩阵行下钻、真实 Prompt 草稿交接、真实场景卡交接、真实 SOP 运行交接、IP 口径、竞品观察、团队知识包详情、素材回写、高级导出、本机预览、目标树、作战编组、执行队列和行动记录；素材回写页点击“创建补素材任务”后会进入审核台，并从 preload API 读取到 `material-supplement / needs-material / request-material` 任务；执行队列页点击“记录交接”后会写入非 `handoff:*` 队列行动记录、生成真实 Prompt 草稿，并把队列状态推进为 `handed-off`。 |
| 品牌战情室审核门禁回归 | `npm run test:functional`；`npm run test:e2e -- -g "内容知识地图 v1 真实工作台支持下钻、素材回写和作战入口"`，2026-05-30 | 通过。功能测试覆盖未审核资源包生成待审核队列、历史 ready 队列未全量审核时不创建 Prompt 草稿；目标 E2E 种子改为先生成审核任务并提交通过，再构建和执行战情室。 |
| v1 本地事实源并发写入回归 | `npm run test:functional -- --test-name-pattern "v1 本地事实源并发写入不会丢失审核和行动记录"`，2026-05-30 | 通过。并发写入内容知识地图、审核任务、品牌战情室、生产交接记录和 SOP 草案定义，不丢 ID、不覆盖行动记录。 |
| v1 追加 / 不可变不变量回归 | `npm run test:functional -- --test-name-pattern "v1 本地事实源禁止覆盖已有审核决策、行动记录和已发布知识包版本"`，2026-05-30 | 通过。已有审核决策、品牌战情室行动记录和已发布团队知识包版本不能通过普通本机 update / save 被删除、覆盖或篡改。 |
| v1 审计历史保留回归 | `npm run test:functional -- --test-name-pattern "v1 本地事实源超过展示阈值仍保留审计历史"`，2026-05-30 | 通过。内容地图、生成流程、变更包、审核任务、生产交接和品牌战情室超过旧展示阈值后仍保留最早记录。 |
| v1 补素材任务真实落库 | `npm run test:functional -- --test-name-pattern "内容知识地图可为同一组合创建独立补素材任务"`，2026-05-30 | 通过。同一矩阵组合可同时创建发布审核任务和补素材任务；补素材任务进入审核任务 Store、状态为待补素材、决策为补素材并同步到测试团队适配器。 |
| Bugu 补素材任务服务端保真 | `/Users/coso/Documents/dev/ai/bugu/bugu`：`npm run smoke:oem-service`、`npm run typecheck`，2026-05-30 | 通过。Bugu `content-review-tasks` 保存并返回 `taskPurpose=material-supplement`、`status=needs-material`、`suggestedAction=request-material`；控制台待处理审核列表展示待补素材任务。 |
| v1 团队知识包同步和历史保留 | `npm run test:functional -- --test-name-pattern "v1 团队知识包远端同步可刷新元数据并保留发布历史"`，2026-05-30 | 通过。Bugu 团队工作区拉取走显式同步入口，保留本机预览路径；超过 120 条团队知识包历史后仍不截断本地事实源。 |
| 品牌战情室行动历史保留 | `npm run test:functional -- --test-name-pattern "v1 品牌战情室行动记录超过展示阈值也保留审计历史"`，2026-05-30 | 通过。130 条本机历史记录刷新团队记录后仍全部保留，并追加团队新记录。 |
| 未接生产 Bugu token 的本地兜底 | `ContentWorkspaceSyncService.listSyncConflicts` | 通过目标 E2E 间接覆盖。远端冲突读取失败时返回空冲突列表，避免本地工作台因 `admin token missing or invalid` 整体回到空态。 |

## 4. AC 逐项审计

状态定义：

- `Local Verified`：本地实现、功能测试、文档和脚本足以证明本地闭环成立。
- `Production Pending`：本地闭环成立，但生产完成还需要真实 Bugu / 账号 / 对象存储证据。
- `Not Complete`：当前证据不足以证明该项已经实现。

| AC | 验收项 | 当前状态 | 本地证据 | 生产缺口 |
| --- | --- | --- | --- | --- |
| AC-00 | 业务 UI 契约门禁 | Local Verified | `business-ui-contract.md`；`prototype/README.md`；v1 prototype 点击验证；`v2-ux-copy-audit` 纳入功能测试。 | 仍需真实用户点击级验收确认普通运营不需要理解 Ontology。 |
| AC-01 | 产品 brief 卖点拆解 | Local Verified | `contentKnowledgeMapBuilder.ts`、`contentKnowledgeMapValidator.ts`；功能测试覆盖缺证据、禁用表达、PromptDraft 交接。 | 真实产品 brief / 品牌资料生产验收。 |
| AC-02 | SKU 表矩阵 | Local Verified | 构建器识别 SKU / 规格 / 价格字段；矩阵支持筛选、排序、分页和本批送审；功能测试覆盖。 | 真实 SKU 表批量组合质量验收。 |
| AC-03 | 用户反馈痛点聚类 | Local Verified | `user-feedback` 拆成 `user-quote` / `customer-service-log` 证据；矩阵证据列显示用户原声；功能测试覆盖。 | 真实评论 / 客服记录聚类质量验收。 |
| AC-04 | 品牌口径和禁用表达 | Local Verified | validation policy 和 production handoff policy 二次检查禁用 / 绝对化表达；功能测试覆盖被拦截路径。 | 真实品牌规则库和审核人员复核。 |
| AC-05 | IP 人设一致性 | Local Verified | 构建器读取 IP 六层知识库；IP 漂移表达进入拦截；功能测试覆盖。 | 真实 IP 素材跨平台输出验收。 |
| AC-06 | 竞品观察和差异化机会 | Local Verified | `competitor-observation` 输入用途；竞品行默认待审核；生产交接阻断竞品观察直交 Prompt。 | 真实竞品观察边界和法务 / 品牌审核验收。 |
| AC-07 | 素材覆盖回写 | Local Verified | `ContentMaterialFeedbackService`、`materialCoverageAssembler.ts`；素材库详情可反查覆盖组合；内容知识地图素材回写页可创建真实补素材审核任务；功能测试和目标 E2E 覆盖不改写事实、补素材任务真实落库。 | 真实素材库和表现数据回写验收。 |
| AC-08 | 提示词依据子图注入 | Local Verified | `PromptGroundingAssembler` 只注入当前组合、已通过证据短摘录和边界；功能测试覆盖长证据截断和未通过证据排除。 | 真实 Prompt 工作台内容质量验收。 |
| AC-08A | 审核调整闭环 | Local Verified | 审核任务支持改名、合并、拆分；main 侧更新地图并提交变更包；Bugu payload 同步；功能测试覆盖。 | 真实团队审核人员操作验收。 |
| AC-09 | 品牌内容作战系统 | Local Verified | `BrandCommandCenterApplicationService`、执行 policy、资源包、队列、行动记录、目标树和详情视图；功能测试覆盖 Bugu 行动记录拉取、权限拦截、未审核资源包待审核、历史 ready 队列审核二次拦截；目标 E2E 覆盖审核通过后在执行队列页面点击交接，并验证真实 Prompt 草稿、队列行动记录和 `handed-off` 状态。 | 真实团队战情室、多席位、跨设备行动记录验收。 |
| AC-10 | 真实生成服务和待配置兜底 | Local Verified | `ContentKnowledgeMapApplicationService` 可调用 `TextGenerationService.generateJson` 执行 `generate_content_knowledge_map`，模型输出经固定 schema、来源 / 证据约束和 validation policy 落库；生成服务待配置、失败、缺少结构化输出接口或空矩阵时保存待配置 / 失败记录，不生成伪矩阵 / 伪证据；`ContentKnowledgeMapBuildRunStore` 保存成功和 blocked 生成流程记录；功能测试覆盖。 | 仍需真实模型 Key / 真实产品资料执行质量验收；无 Key 环境表现已本地覆盖。 |
| AC-11 | Agent Knowledge v0.7.2 导出 | Local Verified | `AgentKnowledgeContentExportService` 生成 `KNOWLEDGE.md`、`ontology/`、`answers/`、zip、sha256 / size；导出 policy 阻断敏感内容；功能测试覆盖。 | 真实包上传到 R2 / OSS 后公开地址和 sha256 校验。 |
| AC-12 | 团队共享和 Release | Production Pending | Bugu smoke、本地双工作区模拟、同步冲突、release 拉取、团队知识包绑定、补素材任务保真、在线验收脚本、报告门禁、本地事实源并发写入、追加不变量、已发布 release 不可变和发布历史保留回归均已覆盖。 | 必须使用真实 Bugu 工作区、两真实账号和真实公开包执行 `content:v1:verify-online` 并归档生产报告。 |
| AC-13 | 普通用户不感知 Ontology | Local Verified | `v2-ux-copy-audit` 扫描 v1 普通用户模块；prototype 禁用工程词扫描未命中；业务 UI 契约已落文档。 | 真实用户验收仍需确认文案理解成本。 |

## 5. 不能宣称完成的硬门槛

以下任一项缺失时，v1 只能称为本地实现和本地验证推进中，不能称为生产完成：

| 门槛 | 必需证据 | 当前状态 |
| --- | --- | --- |
| 真实 Bugu API | 报告 `target.apiBaseUrl` 是 `https://api.bugu.run`，且非 localhost / 127.0.0.1。 | 缺失。 |
| 真实团队工作区 | `target.workspaceId` 对应真实团队内容工作区，revision 非空。 | 缺失。 |
| 两真实账号 | actor A / B 的 workspace、默认 release、review task IDs、execution queue IDs 一致。 | 缺失。 |
| 公开 release 包 | release 为 published / approved，`package.publicUrl` 可访问，`size > 0`，`sha256` 为 64 位十六进制。 | 缺失。 |
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
