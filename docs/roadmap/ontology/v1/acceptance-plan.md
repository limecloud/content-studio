# Ontology v1 验收计划

更新时间：2026-05-30
状态：Draft / Field Supplement Cut

## 1. 完成定义

Ontology v1 完成必须同时满足：

- 能从品牌 / 产品、用户反馈、IP、竞品观察和素材库五类输入构建内容知识地图草稿。
- 能生成卖点、痛点、人群、场景、渠道、证据和素材状态覆盖矩阵。
- 能通过规则校验发现无证据主张、禁用表达、重复概念、孤立概念、粒度异常、IP 漂移和竞品搬运风险。
- 能人工审核知识点、主张、证据、规则和矩阵组合。
- 能从审核通过的矩阵组合发布到 SceneCard、PromptDraft 或 SOP 输入。
- 能通过提示词依据注入相关卖点、证据、规则和来源，而不是拼接完整原文。
- 能记录信号、作战目标、资源包、发布检查、执行队列和行动记录。
- 能将素材审核和表现回写覆盖矩阵。
- 能导出 Agent Knowledge v0.7.2 ontology-aware 知识包，可选包含 answer-ready `answers/`。
- 能通过 Bugu 团队内容工作区完成团队异步共享、审核、冲突处理和知识包发布；离线变更包只作为兜底。
- 普通用户主路径不暴露 Ontology 工程术语，只呈现内容知识地图、矩阵、证据、规则、团队知识包和行动记录。
- 普通用户页面通过业务 UI 契约：有当前业务对象、唯一主动作、异常恢复和明确交付去向。
- 已配置真实文字生成服务时，内容知识地图构建必须调用结构化生成任务，输出可追溯的卖点、痛点、场景、约束和资料缺口；本地规则只能作为 seed / evidence，不得冒充生成成功。
- 未配置模型时底层返回 blocked，普通用户界面显示“生成服务待配置”，不生成伪知识地图、伪证据或伪成功结果。

## 2. 验收用例

### AC-00：业务 UI 契约门禁

输入：

- 任意 v1 普通用户页面、HTML 原型或 renderer 模块。

期望：

- 页面能说明目标用户、当前业务对象、输入物、当前状态、唯一主动作、用户决策点、系统反馈、异常恢复、最终交付物和完成定义。
- 页面不是功能入口合集、能力说明页或状态卡片堆叠。
- 页面完成后能交付到 Prompt 工作台、场景库、SOP、素材库、团队知识包、行动记录或高级导出。

通过标准：

- 页面契约写入 [`business-ui-contract.md`](./business-ui-contract.md) 或对应原型 README。
- 普通用户 UI 文案扫描不命中工程禁用词。
- 主按钮只有一个；辅助动作能解释服务哪个当前业务对象。
- 空态、缺证据、待配置、冲突和服务端不可用都有恢复路径。

### AC-01：产品 brief 卖点拆解

输入：

- 一份产品 brief。
- 一份品牌知识库。

期望：

- 抽取产品、功能、属性、卖点、收益、主张、证据和禁用表达。
- 每条主张都有 evidence status。
- 无证据主张标记 `needs-verification`。
- 禁用表达进入 validation issue。

通过标准：

- 至少生成一个 `selling-point` 覆盖矩阵。
- ready 行可以生成 PromptDraft。
- PromptDraft 带 `ontologyId`、`coverageRowIds` 和 `sourceRefs`。

当前实现状态：

- `contentKnowledgeMapValidator.ts` 已补内容质量门禁：可交付条目缺证据、禁用 / 绝对化表达、重复或近似条目、孤立条目、粒度过粗 / 过细 / 混杂、IP 漂移和竞品 ready 风险都会进入缺口清单。
- 质量门禁在 main 侧执行，不依赖 renderer 判断；功能测试覆盖重复、孤立和粒度异常条目会把内容知识地图降为待处理。
- 审核任务页的改名 / 合并 / 拆分用于处理这些质量缺口，调整后仍需重新审核，不能绕过生产交接发布检查。
- 内容知识地图生成流程已写入 `ContentKnowledgeMapBuildRunStore`：输入收集、团队状态、生成服务检查、来源证据整理、结构化矩阵生成和质量检查都会形成步骤记录；待配置、缺结构化输出接口和模型失败路径也会写 blocked 记录，工作台可查看恢复原因。

### AC-02：SKU 表矩阵

输入：

- 多 SKU 表格文本。

期望：

- 抽取 SKU、规格、价格带、适用条件、差异化属性。
- 生成 SKU x 人群 x 场景 x 卖点矩阵。
- 重复 SKU 属性归一，不产生大量同义概念。

通过标准：

- 不同 SKU 的适用人群和卖点可以被筛选。
- 缺证据或不适用的组合不能进入 ready。

当前实现状态：

- Content Studio 构建器已识别 `sku-table` 或带 SKU / 规格 / 价格字段的产品资料，解析表头和行数据，生成 SKU 组合与 SKU 场景矩阵。
- 覆盖摘要已记录 `skuRowCount`，普通用户可在内容知识地图详情看到 SKU 覆盖数量。
- 内容知识地图矩阵已支持按状态、素材、关键词筛选，按优先级、可信度、证据数和素材缺口排序，并支持分页和本批送审，避免 SKU x 人群 x 场景组合一次性淹没 UI。
- SKU、人群、渠道、内容形式和使用场景已进入 `ContentKnowledgeMapMatrixRow.dimensions` 结构化字段，不再只依赖标签文本；矩阵可按人群 / 渠道 / 内容形式筛选，行详情、场景卡交接和 Agent Knowledge 导出都会保留这些维度。
- 品牌战情室会继续消费这些结构化维度：资源包、作战单元和执行队列保存目标人群、渠道、内容形式和使用场景；生成 Prompt 草稿、场景卡和 SOP 运行时会把这些变量写入真实下游输入。
- Content Studio validation policy 会识别禁用 / 绝对化表达，命中后把知识地图降为待处理状态，不允许直接走确定性生产交接。

### AC-03：用户反馈痛点聚类

输入：

- 评论、差评、客服问答或人工访谈摘录。

期望：

- 聚类痛点、异议、用户原声和购买障碍。
- 每个痛点至少有一条 `user-quote` 或 `customer-service-log` 证据。
- 没有对应卖点的问题进入待补资料清单。

通过标准：

- 能生成痛点 x 人群 x 场景 x 卖点矩阵。
- LLM 推断和用户原话有明确区分。

当前实现状态：

- `contentKnowledgeMapBuilder.ts` 已把 `user-feedback` 输入拆成逐条 `user-quote` / `customer-service-log` 证据，不再只用整份输入源作为痛点证据。
- 评论痛点行会引用对应原声证据；用户原话和本地规则生成的矩阵行通过 evidence `sourceType` 和行标签区分。
- 内容知识地图矩阵证据列已显示可读证据摘要，并优先展示用户原声 / 客服记录，普通用户不需要打开证据 ID 才能判断痛点来源。
- 功能测试覆盖评论痛点行必须引用 `user-quote` 证据。

### AC-04：品牌口径和禁用表达

输入：

- 品牌定位、语气规则、禁用词和合规边界。

期望：

- 生成 `brand-voice`、`forbidden-wording`、`requires-evidence` 约束。
- 发布前 DecisionGate 检查禁用表达。

通过标准：

- 含禁用表达的 coverage row 被 blocked。
- 审核台展示 blocked 原因和来源。

当前实现状态：

- `contentKnowledgeMapValidator.ts` 会把“绝对安全、全网最、100%、保证、治疗、见效、官方认证、专家认证”等高风险表达写入缺口。
- `contentProductionHandoffPolicy.ts` 在审核通过后仍会二次检查禁用 / 绝对化表达；命中时返回 blocked，不生成 PromptDraft 或 SceneCard。

### AC-05：IP 人设一致性

输入：

- IP 知识库六层体系。
- 一个目标渠道和内容主题。

期望：

- 抽取身份、立场、观点、方法论、语言规则和故事资产。
- 生成 IP 内容矩阵。
- 与核心立场冲突的表达进入 `ip-voice-drift`。

通过标准：

- IP 内容 PromptGroundingContext 引用同一 IP 知识库版本。
- 不同渠道输出可调整形式，但不能改变核心观点。

当前实现状态：

- Content Studio 构建器已读取 `IpKnowledgeBaseStore`，把身份、价值观、语言规则、判断方法、故事素材和创作引擎写入证据。
- IP 核心立场、语言规则和延伸场景会进入卖点 / 场景矩阵，并附带“IP 核心立场不能漂移”和语言规则约束。
- 覆盖摘要已记录 `ipKnowledgeBaseCount`，用于提示当前知识地图是否接入同一 IP 版本。
- validation policy 和生产交接 policy 会拦截疑似 IP 漂移表达，例如“官方认证、专家认证、唯一、绝对、100%、保证”等；命中时需要人工改写。

### AC-06：竞品观察和差异化机会

输入：

- 竞品公开内容、人工观察或竞品页面摘要。

期望：

- 提取竞品内容结构、主张类型、证据类型和用户反馈模式。
- 生成差异化机会和不可搬运边界。

通过标准：

- 竞品材料不能作为本品牌事实证据。
- 可识别竞品文案或创意不进入 PromptDraft。
- 竞品影响品牌定位前必须人工审核。

当前实现状态：

- Content Studio 已新增 `competitor-observation` 输入用途，并在输入源、Prompt 工作台、SOP 输入和视频 Prompt 可用资料中显示为“竞品观察”。
- 内容知识地图构建器会把竞品公开内容转成差异化机会、竞品反馈模式和内容结构参考，但这些矩阵行默认 `needs-review`，不会直接成为 ready 发布项。
- 构建器自动加入“竞品观察只允许用于结构、证据类型和差异化机会，不能作为本品牌事实证据”和“禁止复制竞品 Logo、包装、文案、人物肖像或可识别创意元素”约束。
- 生产交接 policy 会阻断竞品观察行直接进入 Prompt 工作台；必须先转写为本品牌已审核卖点或场景。
- 内容知识地图矩阵支持筛出竞品边界相关行并生成指定行审核任务；ready 行也可按本批进入人工批准，不再只能生成系统判定的风险项。

### AC-07：素材覆盖回写

输入：

- 一批图片 / 视频 / 文案素材。
- 素材审核结论和表现标签。

期望：

- 素材关联卖点、痛点、人群、场景、渠道和 PromptDraft。
- coverage row 的素材状态被更新。
- 高表现组合可被排序推荐。

通过标准：

- 素材库能展示每个素材覆盖了哪些组合。
- 覆盖矩阵能展示缺素材、缺证据和高表现组合。
- 表现标签不自动变成事实主张。
- 已通过素材可以生成“待确认补充”审核任务，用于补证据、补规则或补素材标签。
- 待确认补充同步到 Bugu 团队审核前后都不能自动改写已发布卖点、痛点、场景或主文案。

当前实现状态：

- `ContentMaterialFeedbackService` 已从已通过素材回写内容知识地图矩阵行，更新 `materialStatus`、`materialRefs` 和 `performanceTags`。
- `materialCoverageAssembler.ts` 支持显式 `coverage:<rowId>` / `row:<rowId>` 标签、来源匹配和标题 / 标签文本匹配；表现标签只抽取为排序和复盘信号。
- 素材库页面已从内容知识地图的 `materialRefs` 派生“覆盖内容组合”视图：素材卡片显示覆盖数量，素材详情可展开查看对应卖点 / 痛点 / 场景组合、证据数、来源数、素材状态和表现标签。
- 素材详情明确提示表现标签只用于排序和复盘，不会直接改写卖点、痛点或场景文案。
- 已通过素材回写会生成“待确认补充”审核任务并可同步到 Bugu；该任务只用于补证据、补规则或补素材标签，不自动提交审核结论，不自动覆盖团队当前主文案。
- 矩阵行下钻中的“创建补素材任务”已接入真实审核任务链路：同一组合可以同时保留发布审核任务和补素材任务，补素材任务状态为“待补素材”，建议处理为“补素材”，并会尝试同步到 Bugu 团队工作区。
- 素材回写页的“创建补素材任务”按钮不是静态入口：目标 E2E 会点击该按钮，验证真实页面跳到审核台，并通过 `listContentReviewTasks` 读取到 `taskPurpose=material-supplement`、`status=needs-material`、`suggestedAction=request-material` 的任务。
- 功能测试覆盖素材覆盖同步不泄漏本机路径、素材库覆盖视图可反查每个素材覆盖的组合、待确认补充任务同步、补素材任务真实落库和不自动改写主文案。

### AC-08：Prompt Grounding 子图注入

输入：

- 一个 ready coverage row。
- 一个目标渠道和内容类型。

期望：

- 只选择相关概念、主张、证据、约束和禁用表达。
- 不注入完整原始文档。

通过标准：

- PromptGroundingContext 不包含 rejected、forbidden、deprecated 对象。
- `needs-verification` 内容不会被写成确定性主张。

当前实现状态：

- `ContentProductionHandoffService` 只处理已通过审核任务，并由 `contentProductionHandoffPolicy.ts` 检查证据、禁用表达、竞品边界和 IP 边界。
- policy 不通过时只写入 blocked 交接记录，不创建 PromptDraft、SceneCard 或提示词依据。
- `promptGroundingAssembler.ts` 只注入当前审核组合、已通过证据短摘录、生成边界和来源引用，不拼接完整原始文档。
- 发布检查会阻断已标记禁用 / 高风险的矩阵组合，避免它进入提示词依据。
- 功能测试覆盖提示词依据只包含已通过证据、长证据被短摘录、未通过证据不进入内容，以及禁用标记组合被拦截。

### AC-08A：审核调整闭环

输入：

- 一个已生成的审核任务。
- 同一内容知识地图中的相近卖点、痛点或场景条目。

期望：

- 审核人员可以改名、合并重复 / 相近条目，或把过粗条目拆成多个可单独审核的条目。
- 调整动作由 main 侧服务更新内容知识地图，不在 renderer 中直接改矩阵。
- 调整后条目退回待审核或待补证据状态，不能直接进入生产交接。
- 团队审核记录保留结构化调整输入和调整快照。

通过标准：

- 改名会更新当前条目的标题和摘要，并写入审核决策。
- 合并会保留证据、来源、素材引用和表现标签，不丢失可追溯线索。
- 拆分会生成多个待审核条目，不继承已覆盖素材状态。
- Bugu 审核结论保存调整 payload，团队成员能看到调整依据。

当前实现状态：

- `ContentReviewDecisionAction` 已支持 `rename-target`、`merge-related` 和 `split-target`。
- `ContentReviewTaskApplicationService` 会在提交决策时更新对应内容知识地图行、提交知识地图变更包，并把调整快照写入 `ContentReviewDecision.afterSnapshot`。
- 审核任务页已提供当前条目的改名、同类合并和拆分控件；普通用户看到的是条目、证据、来源和团队状态，不暴露内部工程术语。
- 审核任务详情已展开证据原文 / 摘录、证据来源类型、证据状态、来源引用和推荐恢复路径；审核人员可以直接判断通过、补证据、禁用、降级待确认或驳回，而不是只看到证据数量。
- Bugu `content-review-decisions` 已保存结构化 payload；功能测试覆盖改名、合并、拆分的地图回写、变更包同步和审核决策同步。

### AC-09：品牌内容作战系统

输入：

- 一个评论痛点、竞品动作或素材表现信号。
- 一个转化、拉新、风险拦截或素材补充目标。
- 若干 ready coverage rows、素材和 SOP。

期望：

- 信号进入品牌战情室，并显示来源、价值、风险和建议目标。
- 创建作战单元和资源包，资源包列出卖点、证据、素材、Prompt / SOP、禁用表达和缺口。
- 发布检查覆盖证据、审核状态、禁用表达、竞品边界、权限、素材可用性和平台规则。
- 生成执行队列，并区分可执行、待审核、待补资源和已拦截动作。
- 执行 `generate-prompt-draft`、`create-scene-card` 或 `launch-sop-run`。
- 写入行动记录。

通过标准：

- 发布检查未通过时不执行动作，并保留未通过原因。
- 生产动作必须绑定已通过审核的内容组合；旧队列或历史资源包不能绕过审核状态直接生成 Prompt 草稿、场景卡或 SOP 运行。
- 执行队列能展示可恢复处理：补证据、补素材、发起审核、改写或禁用。
- 行动记录能追溯信号、目标、资源、产物、审核和回写。
- 不做自动发布、虚假互动、刷量、伪装用户或绕过平台规则。

当前实现状态：

- 生产交接链路已输出结构化行动记录，覆盖成功交接和发布检查 blocked 两种状态。
- 行动记录包含批次、覆盖行、证据、来源、团队知识包版本、发布检查项、Prompt 草稿 / 场景卡 / SOP 运行 ID、操作者和下一步，可作为品牌战情室行动记录和团队审计的输入。
- 内容知识地图行详情已接入同一生产交接链路：点击“生成 Prompt 草稿 / 生成场景卡 / 启动 SOP”会复用已通过的发布审核任务并创建真实下游产物；如果当前组合尚未通过审核，则先生成审核任务并进入审核台，不绕过发布检查。
- 品牌战情室信号雷达已覆盖评论痛点、竞品动作、素材表现、投放表现、平台热点 / 搜索问题和品牌风险；竞品、投放和素材表现信号会保留风险边界，只触发作战目标和资源包，不自动写成产品事实。
- 品牌战情室资源包已从内容知识地图矩阵行读取真实素材引用 `materialRefs`，不再用场景名兜底伪造素材覆盖；发布检查中的“素材”项以真实素材引用为准。
- 品牌战情室 ready 动作记录前会由 `BrandCommandExecutionPolicy` 二次检查资源包、证据、素材、品牌边界、竞品不可搬运边界、渠道、平台规则、团队角色权限和重复执行风险；检查未通过时队列转为已拦截，并保留恢复建议。
- 品牌战情室资源包已记录覆盖的内容组合和已通过审核组合；`generate-prompt-draft`、`create-scene-card` 和 `launch-sop-run` 必须在资源包覆盖行全部审核通过后才会执行。构建新战情室时未审核组合会进入待审核队列，记录历史 ready 队列动作时也会重新读取审核任务并二次拦截。
- 品牌战情室执行队列的 `generate-prompt-draft` ready 动作会创建真实 Prompt 草稿并回填资源包；`create-scene-card` ready 动作会创建真实场景卡、写入行动记录并回填资源包；`launch-sop-run` ready 动作会创建真实 SOP 运行记录并回填 `workflow-run` 交接引用；`write-back-material-coverage` 动作会调用素材覆盖回写服务，成功后队列转为已回写，失败时保留 blocked 原因；补证据 / 补素材 / 送审动作会创建真实审核任务并可同步到 Bugu，避免队列记录伪造成已生成产物。
- 目标 E2E 已覆盖普通用户点击执行队列页“记录交接”：动作必须写入真实 `PromptDraft`，产生非 `handoff:*` 队列行动记录，并把对应队列推进为 `handed-off`，不能只更新页面文案。
- 品牌战情室资源包和执行队列已显示并同步目标人群、渠道、内容形式和使用场景；Prompt 草稿包含“投放组合”，场景卡优先使用资源包人群和使用场景，SOP 运行输入包含目标人群、目标渠道、内容形式和使用场景。
- 生产交接行动记录已追加到 Bugu 侧 `content-action-records` 团队事实源，并把同步状态回写到本机交接记录；blocked 交接也会留下可审计记录。Bugu 会保留操作者角色 `actorRole`，并在追加行动记录时按认证角色拒绝只读等无权限写入。
- 同一内容知识地图已有品牌战情室时，生产交接行动会回填到战情室行动记录列表，普通用户可在品牌战情室看到审核页交接或拦截结果。
- 品牌战情室已补目标树视图：信号会转成作战目标，目标详情展示类型、优先级、渠道、成功标准、关联信号、资源包和队列动作，避免用户只看到资源包和执行动作却看不到为什么要执行，以及目标后续交付到哪里。
- 品牌战情室资源包已能字段级显示交接状态、Prompt 草稿、场景卡、交接摘要和 blocked 原因。
- 品牌战情室已补可审计详情层：资源包不再只显示引用 ID，而是展开卖点 / 痛点、场景、证据摘录、禁用边界、资源缺口、素材和交接引用；执行队列逐条显示动作类型、交付去向、负责人 / Agent 席位、渠道、时间窗口、团队同步、发布检查消息和恢复路径；行动记录逐条显示操作者角色、产物引用、素材回写、拦截原因和团队记录状态。
- 作战分组左侧入口已补真实直达验收：点击“品牌战情室、目标树、作战编组、执行队列、行动记录”必须分别显示对应页面标题、当前业务对象、主判断、主动作、交付去向和真实数据图表；图表只能从当前 `BrandCommandCenterRecord`、内容知识地图、队列和行动记录计算，不能使用 mock / 示例数据兜底。
- Content Studio 已能通过 Bugu `content-action-records` 只读接口刷新团队行动记录，并把跨设备生产交接记录合并回本机品牌战情室和资源包交接状态；功能测试覆盖团队记录拉取、去重、本机记录保留、资源包交接回填、无权限角色拦截和缺平台规则拦截。

### AC-10：未配置模型 blocked

输入：

- 任意 Ontology 构建任务。
- 当前没有显式配置可用模型。

期望：

- 构建运行进入 blocked。
- 保存 blocked 原因。
- 不生成伪概念、伪证据或伪矩阵。

通过标准：

- UI 可以看到 blocked 状态和恢复建议。
- 本地缓存和离线草稿不会出现伪成功运行。

当前实现状态：

- `ContentKnowledgeMapApplicationService` 已在构建前检查文字生成服务运行配置；生成服务待配置时保存 blocked 内容知识地图记录。
- 生成服务可用时，服务会先用本地规则生成 seed / evidence，再调用 `TextGenerationService.generateJson` 执行 `generate_content_knowledge_map`；模型输出按固定 schema 归一为卖点、痛点、场景、约束和资料缺口。
- 模型只能引用已有 `sourceRefs` 和 `evidenceRefs`；无效来源 / 证据会被丢弃，证据不足的行不能伪装成 ready，竞品相关行强制进入待审核。
- 模型调用失败、返回空矩阵、生成服务不可用或缺少结构化输出接口时，保存待配置 / 失败记录，不把本地 seed 回退保存为成功知识地图。
- blocked 记录只保留输入源 / 知识库引用和恢复原因，`sellingPoints`、`painPoints`、`scenarios`、`evidence`、`constraints` 均为空，`model` 标记为 `blocked:text-provider`，避免把本地规则结果伪装成已生成知识地图。
- 功能测试覆盖真实结构化生成任务被调用、生成服务待配置 / 缺少结构化输出接口时不生成伪矩阵、伪证据或伪成功记录。
- 功能测试覆盖生成流程记录：成功路径保留模型、readyPercent、证据数和步骤；生成服务待配置、缺少结构化输出接口时保留 blocked 步骤，不只保存最终知识地图。

### AC-11：Agent Knowledge v0.7.2 导出

输入：

- 一个审核通过的 Ontology 工作区。

期望：

- 生成 `KNOWLEDGE.md`。
- 生成 `ontology/ontology.json`、`concepts.json`、`relations.json`、`claims.json`、`evidence.json`、`constraints.json`、`coverage.json`。
- 可选生成 `answers/questions.json`、`answers/answer-blocks.json`、`answers/citation-targets.json`。
- frontmatter 包含 `metadata.primaryOntology`，如有 answer-ready 层则包含 `metadata.primaryAnswers`。

通过标准：

- 包校验通过。
- 包校验失败时不覆盖已发布包。
- `ontology/` 和 `answers/` 不包含 workflow、工具脚本或排名操控指令。

当前实现状态：

- `AgentKnowledgeContentExportService` 已生成 `KNOWLEDGE.md`、`ontology/`、`answers/`、`compiled/prompt-grounding.md`、`manifest.json` 和 zip 包，并写入 sha256 / size。
- `knowledgePackExportPolicy.ts` 已补导出前源数据校验和组包校验：缺 ready 行、缺 ready 证据、待审核矩阵行、疑似密钥、本机绝对路径、脚本 / 命令行 / 自动发布 / 刷量 / 排名操控内容都会阻断导出。
- `ContentWorkspaceSyncService.createKnowledgeRelease` 在导出失败时不会调用 Bugu 发布接口，只保存 blocked release 和问题原因，避免把不合格包发布为团队版本。
- 功能测试覆盖可导出 v0.7.2 数据包、`metadata.primaryOntology` / `metadata.primaryAnswers`、脚本命令污染阻断、待审核矩阵阻断发布和发布接口未调用。

### AC-12：团队共享和 Release

输入：

- 用户 A 本地修改一个 Ontology 工作区。
- 用户 B 拥有同一个 Bugu 团队内容工作区权限。

期望：

- 用户 A 提交离线草稿或变更包到 Bugu 团队内容工作区。
- 用户 B 拉取后看到差异、作者、团队版本、影响对象和待审核项。
- 内容负责人能在 Bugu 控制台看到当前团队工作区、待处理审核、执行队列、行动记录、素材覆盖和团队知识包版本。
- 冲突进入冲突队列，不被静默覆盖；服务端和桌面端都能记录人工处理结论。
- 审核后的 revision 能发布为团队知识包和 Agent Knowledge v0.7.2 包。

通过标准：

- 两个本地工作区可以通过 Bugu 完成一次变更提交、拉取和合并。
- Bugu 控制台团队内容工作区面板能展示服务端同步状态、同步冲突、影响内容、处理建议和处理方向，且空态能提示回到客户端同步。
- `ReviewDecision` 和 `ActionLog` 在同步后保持 append-only。
- Prompt 工作台和 SOP 能选择团队 release 作为知识源。
- Bugu 业务后端保存团队 revision、审核、行动记录和发布版本；LimeCore 只校验 OEM 云底座相关的租户、权益、模型策略和发布中心边界。
- 离线导出包不包含 API Key、登录凭证和本机绝对路径。
- Content Studio 本地缓存和离线草稿写入必须原子化；并发提交审核任务、行动记录、生产交接或知识包版本时不能因 read-modify-write 竞争丢记录。
- 本地普通更新不能删除已有 `ReviewDecision` 或 `ActionRecord`；修正只能追加新记录，不能覆盖审计历史。
- 本地普通更新不能原地修改已发布团队知识包版本；修正内容、包文件、sha256、对象存储地址或版本号必须创建新 release，Bugu 团队工作区拉取使用显式同步入口。
- 行动记录和团队知识包发布历史可以在 UI 和同步接口分批展示，但本地事实源不能因为展示阈值删除历史记录。

当前实现状态：

- 已有 Bugu smoke 覆盖团队工作区、变更包、旧版本冲突登记、冲突处理结论、审核、队列、行动记录、素材覆盖和知识包版本。
- 已有 Bugu smoke 覆盖补素材审核任务：同一目标可保存发布审核任务和 `material-supplement` 补素材任务，服务端返回 `needs-material` / `request-material`，控制台待处理列表会计入待补素材任务。
- 已有 Content Studio 功能测试覆盖同步冲突拉取、影响内容明细、处理方向记录和本机地图回到待同步状态。
- 已有 Content Studio 功能测试覆盖同步冲突逐项合并处理清单：高影响内容转人工确认，资料缺口 / 证据 / 规则可作为补充清单，且不默认覆盖团队版本；Bugu 控制台已复用同一处理清单语义展示服务端视角，Bugu smoke 覆盖清单落库、行动记录追加和团队 revision 推进。
- 已有 Content Studio 功能测试覆盖离线变更包导出 / 导入：导出包包含 `manifest.json`、`draft-change.json` 和导入说明，不包含 `workspacePath`、疑似密钥、凭证或本机绝对路径；导入后成为当前工作区的本机变更包。
- 已有 Content Studio 功能测试覆盖 Agent Knowledge zip 生成、发布包摘要提交、请求体不泄漏本机路径和 release 回写包地址。
- 已有 Bugu smoke 覆盖团队知识包 release 登记 `packageObjectKey` 与 `packageUploadStatus`。
- 已有 Bugu smoke 覆盖新版本成为默认团队知识包，以及控制台同源 API 回滚默认版本。
- 已有 Bugu smoke 覆盖团队知识包待确认、低权限角色不能批准、负责人批准后才能成为默认版本，以及负责人驳回后不会影响当前默认版本。
- 已有 Content Studio 功能测试覆盖团队知识包版本拉取、服务端包地址合并和本机预览路径保留；真实页面已展示团队版本、包文件、对象 key、sha256、确认状态和最近版本。
- 已有 Content Studio 功能测试覆盖两个本地工作区模拟用户 A / B：用户 A 发布团队知识包，用户 B 拉取同一团队工作区版本，并把该版本绑定到 Prompt 草稿和 SOP 运行记录。
- 已有 Content Studio 功能测试覆盖生产交接生成 Prompt 草稿时绑定团队知识包版本，以及 SOP 运行记录保留团队知识包版本。
- 已有 Content Studio 功能测试覆盖品牌战情室从 Bugu 团队工作区刷新行动记录，并把其他设备产生的生产交接记录回填到本机资源包交接状态。
- 已有 Content Studio 功能测试覆盖 v1 本地事实源并发写入：内容知识地图、审核任务、品牌战情室、生产交接记录和 SOP 草案定义并发写入时不丢 ID、不覆盖行动记录；`jsonStore.ts` 使用原子写和按文件事务式更新。
- 已有 Content Studio 功能测试覆盖追加 / 不可变不变量：已有审核决策、品牌战情室行动记录和已发布团队知识包版本不能通过普通本机 update / save 被删除、覆盖或篡改。
- 已有 Content Studio 功能测试覆盖历史保留：品牌战情室超过 120 条本机行动记录后刷新团队记录，历史记录仍保留并追加团队新记录；团队知识包发布历史超过 120 条后也不会被本地事实源截断。
- 已有 Content Studio 功能测试覆盖团队知识包远端同步：Bugu release 拉取走 `syncFromTeam`，可刷新服务端包地址、sha256、确认状态和版本元数据，同时保留本机预览路径并避免同一 `serverReleaseId` 生成重复记录。
- 已有 Content Studio 功能测试覆盖 `content:release:verify-online` 只读验收：公开包地址、大小和 sha256 校验通过；metadata-only 版本不会被误判为可分发成功。
- 已新增 v1 在线验收总入口 `content:v1:verify-online`，可汇总 `content:release:verify-online` 和 `content:team:verify-online`，并输出 JSON 报告。
- 团队共享在线验收已补“同清单”检查：两账号不仅要能读取审核任务和执行队列接口，还要看到相同 `reviewTaskIds` 和 `executionQueueIds`；生产归档门禁会拒绝两账号任务 / 队列 ID 不一致的报告。
- 已新增 v1 生产验收报告归档门禁 `content:v1:verify-report`，本地 mock / localhost 报告不能被当作生产通过证据。
- 剩余验收是用真实用户 / 两台设备和真实 R2 / OSS 环境执行并归档报告。

生产只读验收命令：

```bash
npm run content:v1:verify-online -- \
  --tenant=tenant-seenx \
  --workspace-id=<bugu-workspace-id> \
  --release-id=<release-id> \
  --actor-a-token=<user-a-token> \
  --actor-b-token=<user-b-token> \
  --require-public-package \
  --output=docs/roadmap/ontology/v1/reports/<date>-online-acceptance.json
```

约束：该命令只允许读取 Bugu release 元数据和公开包地址，不写入 Bugu、R2 或 OSS；未确认生产凭证和目标 release 前，不把本地 mock 通过当作生产完成。

生产报告归档校验：

```bash
npm run content:v1:verify-report -- \
  --report=docs/roadmap/ontology/v1/reports/<date>-online-acceptance.json \
  --production \
  --require-api-base-url=https://api.bugu.run
```

归档规则见 [`reports/README.md`](./reports/README.md)，JSON schema 见 [`reports/v1-online-acceptance.schema.json`](./reports/v1-online-acceptance.schema.json)。

完成度审计见 [`completion-audit.md`](./completion-audit.md)。在该文件状态仍为 `Production Evidence Pending` 时，v1 只能声明本地实现和本地验证推进中，不能声明生产完成。

### AC-13：普通用户不感知 Ontology

输入：

- 普通运营角色进入 v1 主路径。
- 任务包括生成卖点矩阵、筛选场景、提交审核、生成 PromptDraft 和使用团队知识包。

期望：

- 主导航、按钮、空状态、错误提示和确认弹窗使用业务语言。
- 页面展示“内容知识地图”“卖点矩阵”“场景矩阵”“审核任务”“团队知识包”“行动记录”。
- 不出现 `Ontology`、`Concept`、`Relation`、`CoverageMatrix`、`PromptGroundingContext` 等工程术语。

通过标准：

- 用户能在不了解 Ontology 概念的情况下完成主路径。
- 高级模式可以显示内部对象名，但必须标记为开发者 / 导出信息。
- 自动化或快照测试覆盖主路径文案。

当前实现状态：

- `scripts/v2-ux-copy-audit.mjs` 已扩展扫描 v1 普通用户模块：内容知识地图、审核任务和品牌战情室。
- 扫描规则会拦截功能入口合集文案，以及 `Ontology`、`Concept`、`Relation`、`CoverageMatrix`、`PromptGroundingContext`、`DecisionGate`、`ActionLog` 等工程术语出现在普通用户模块中。
- `npm run test:functional` 会执行该文案门禁，当前覆盖 19 个文件、63 条规则。

## 3. 工程验证

文档阶段：

```bash
git diff --check -- docs/roadmap/ontology
```

实现阶段最小验证：

```bash
npm run typecheck
npm run content:v1:verify-readiness
```

本地总闸：

```bash
npm run verify:local
```

`verify:local` 已包含 `content:v1:verify-readiness`，默认本地模式会在缺少真实线上报告时给出 warning 但不失败；生产发布完成声明仍必须额外运行严格线上报告门禁。

涉及构建、IPC、preload、PromptDraft、SOP 或素材回写时：

```bash
npm run build
npm run smoke:electron
```

建议新增功能测试：

```bash
npm run test:functional -- ontology
```

在线验收报告归档：

```bash
npm run content:v1:verify-readiness -- --require-production-report
npm run content:v1:verify-report -- \
  --report=docs/roadmap/ontology/v1/reports/<date>-online-acceptance.json \
  --production \
  --require-api-base-url=https://api.bugu.run
```

功能测试至少覆盖：

- 创建 OntologyWorkspace。
- 输入适配器生成 sourceRefs。
- 模型未配置 blocked。
- 产品 brief 构建卖点矩阵。
- 评论构建痛点矩阵。
- 矩阵筛选、排序、分页、本批摘要和指定行送审。
- 审核通过后发布 PromptDraft。
- 禁用表达被 DecisionGate blocked。
- ActionLog 写入。
- 素材覆盖回写。
- Agent Knowledge v0.7.2 导出校验。
- Bugu 团队工作区同步、离线变更包导出 / 导入、冲突检测和团队 release 消费。
- 普通用户主路径文案不暴露 Ontology 工程术语。

## 4. 发布前检查

| 检查项 | 标准 |
| --- | --- |
| 类型契约 | `src/shared/types.ts`、main、preload、renderer 同步。 |
| 本地缓存 | `.content-studio/` 文件可读写，旧工作区不被破坏，未同步草稿不会被误标记为已发布。 |
| 模型调用 | 所有构建步骤可 blocked，不伪造成功。 |
| 审核闸口 | 未审核、禁用和待验证主张不能发布。 |
| Prompt 注入 | 只注入相关子图，不拼接完整原文。 |
| 素材回写 | 素材表现只作为排序和复盘信号。 |
| 操作层 | ActionType 必须经过 DecisionGate 并写 ActionLog。 |
| Agent Knowledge | 导出包符合 v0.7.2，`ontology/` 和 `answers/` 都是数据层。 |
| 团队共享 | change set 保留 diff 和作者，冲突不静默覆盖，release 可被下游消费。 |
| 用户命名 | 普通用户界面使用业务语言，高级模式才显示工程术语。 |

## 5. 残余风险

| 风险 | 可接受条件 |
| --- | --- |
| 覆盖矩阵组合过多 | 已提供状态 / 素材 / 关键词筛选、优先级 / 可信度 / 证据 / 素材缺口排序、分页和本批送审；Bugu 审核任务、行动记录和执行队列已支持服务端分页与常用筛选；桌面端品牌战情室行动记录刷新已按当前对象分批拉取；本地 JSON 事实源已补原子写和事务式更新，降低并发提交时丢记录风险。 |
| 模型抽取不稳定 | 所有结果先进入 candidate，审核后才可发布。 |
| 竞品边界不清 | 竞品观察只进入结构和机会，不进入可复制表达。 |
| 用户误把高表现当事实 | UI 必须区分证据强度和表现标签。 |
| 操作层被误用 | 不做自动发布，所有动作保留审计日志和 blocked 原因。 |
