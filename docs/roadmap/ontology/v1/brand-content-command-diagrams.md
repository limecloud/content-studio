# 品牌内容作战系统图表

更新时间：2026-05-28
状态：Draft

本文是 [`brand-content-command-system.md`](./brand-content-command-system.md) 的图表补充，用于把品牌内容作战系统从“概念说明”落成可讨论的系统结构、流程、状态和时序。

## 1. 总体架构图

```mermaid
flowchart TB
  subgraph Inputs["输入和信号层"]
    Brief["产品 brief / SKU"]
    Brand["品牌口径 / 禁用表达"]
    Feedback["评论 / 客服 / 私域问题"]
    Competitor["竞品公开内容"]
    Assets["素材库 / 素材表现"]
    Market["热点 / 平台规则 / 投放表现"]
  end

  subgraph Knowledge["内容知识底座"]
    Map["内容知识地图"]
    Selling["卖点矩阵"]
    Scene["场景矩阵"]
    Evidence["证据和规则"]
    TeamPack["团队知识包"]
  end

  subgraph Command["品牌内容作战系统"]
    Radar["品牌战情室：信号雷达"]
    Goal["目标树"]
    Bundle["资源包编组"]
    Gate["发布检查"]
    Queue["执行队列"]
    Log["行动记录"]
    FeedbackLoop["复盘回写"]
  end

  subgraph Production["内容生产链路"]
    Prompt["Prompt 工作台"]
    SOP["SOP 工作流"]
    MaterialTasks["补素材 / 补证据任务"]
    Review["审核任务"]
    Output["脚本 / 图文 / FAQ / 场景卡"]
  end

  Inputs --> Map
  Map --> Selling
  Map --> Scene
  Map --> Evidence
  Evidence --> TeamPack
  TeamPack --> Radar
  Feedback --> Radar
  Competitor --> Radar
  Assets --> Radar
  Market --> Radar
  Radar --> Goal
  Goal --> Bundle
  Bundle --> Gate
  Gate -->|通过| Queue
  Gate -->|未通过| Review
  Gate -->|缺资源| MaterialTasks
  Queue --> Prompt
  Queue --> SOP
  Queue --> MaterialTasks
  Prompt --> Output
  SOP --> Output
  MaterialTasks --> Assets
  Output --> Log
  Log --> FeedbackLoop
  FeedbackLoop --> Selling
  FeedbackLoop --> Scene
  FeedbackLoop --> Radar
```

## 2. 服务端拓扑图

```mermaid
flowchart LR
  Desktop["Content Studio 桌面端"] --> Bugu["Bugu 业务后端"]
  Bugu --> Store["业务状态库"]
  Bugu --> Object["对象存储"]
  Bugu --> LimeCore["LimeCore OEM 云服务端"]
  LimeCore --> Tenant["租户 / 账号 / 权益"]
  LimeCore --> Gateway["Gateway / 模型策略 / 计费"]
  LimeCore --> ReleaseCenter["发布中心 / Agent App"]
  Store --> Workspace["团队内容工作区"]
  Store --> Queue["审核 / 执行队列"]
  Object --> Pack["团队知识包"]
  Pack --> Desktop
```

## 3. 作战闭环流程图

```mermaid
flowchart LR
  S1["发现信号"] --> S2["判断价值和风险"]
  S2 --> S3["选择作战目标"]
  S3 --> S4["组合资源包"]
  S4 --> S5{"发布检查"}
  S5 -->|通过| S6["进入执行队列"]
  S5 -->|缺证据| S7["补证据任务"]
  S5 -->|缺素材| S8["补素材任务"]
  S5 -->|品牌风险| S9["审核 / 改写 / 禁用"]
  S6 --> S10["生成 Prompt / 场景卡 / SOP 输入"]
  S10 --> S11["人工审核和外部发布交接"]
  S11 --> S12["表现和素材回写"]
  S12 --> S1
```

## 4. 用户作战时序图

```mermaid
sequenceDiagram
  participant Operator as 运营
  participant Radar as 品牌战情室
  participant Map as 内容知识地图
  participant Gate as 发布检查
  participant Queue as 执行队列
  participant Prompt as Prompt 工作台 / SOP
  participant Review as 审核人员
  participant Assets as 素材库

  Operator->>Radar: 选择“评论集中问续航”信号
  Radar->>Map: 查询相关卖点、证据、场景和素材
  Map-->>Radar: 返回续航资源包候选
  Operator->>Radar: 设定目标：解释异议 / 转化
  Radar->>Gate: 检查资源包
  Gate-->>Radar: 通过图文和 FAQ，短视频缺 9:16 素材
  Radar->>Queue: 生成执行队列
  Queue->>Prompt: 生成小红书标题和私域 FAQ
  Queue->>Assets: 创建 9:16 通勤视频补拍任务
  Prompt-->>Review: 产物进入人工审核
  Review-->>Queue: 审核通过 / 修改建议
  Queue->>Assets: 记录产物和素材关联
  Assets-->>Radar: 回写表现和覆盖状态
```

## 5. 执行队列状态图

```mermaid
stateDiagram-v2
  [*] --> Draft: 作战编组生成
  Draft --> Ready: 发布检查通过
  Draft --> NeedsReview: 需要品牌 / 合规审核
  Draft --> NeedsResource: 缺证据 / 缺素材 / 缺价格确认
  Draft --> Blocked: 禁用表达 / 越权 / 高风险

  NeedsReview --> Ready: 审核通过
  NeedsReview --> Blocked: 审核驳回
  NeedsReview --> NeedsResource: 需要补证据

  NeedsResource --> Ready: 资源补齐
  NeedsResource --> Blocked: 无法补齐或风险过高

  Ready --> Executing: 用户执行
  Executing --> Handoff: 产物交接
  Handoff --> WrittenBack: 素材 / 表现回写
  WrittenBack --> [*]

  Blocked --> [*]
```

## 6. 资源包结构图

```mermaid
flowchart TB
  Bundle["资源包"]
  Bundle --> Fact["产品事实：SKU / 参数 / 价格带"]
  Bundle --> Claim["卖点主张：可用表达 / 弱表达 / 禁用表达"]
  Bundle --> Evidence["证据：测试 / 原声 / 客服 / 素材"]
  Bundle --> Audience["人群和痛点：阶段 / 异议 / 原声"]
  Bundle --> Scene["场景：时刻 / 空间 / 渠道 / 格式"]
  Bundle --> Asset["素材：图片 / 视频 / 截图 / 案例"]
  Bundle --> Prompt["Prompt / SOP：提示词依据 / 场景卡 / 模板"]
  Bundle --> Boundary["边界：品牌 / 合规 / 竞品 / 平台"]
  Bundle --> Gap["缺口：缺证据 / 缺素材 / 缺审核"]
```

## 7. 团队席位和权限图

```mermaid
flowchart LR
  Owner["战役负责人"] --> Goal["定目标 / 排优先级"]
  Analyst["信号分析"] --> Radar["信号雷达"]
  Operator["内容运营"] --> Bundle["资源包编组"]
  Reviewer["品牌审核"] --> Gate["发布检查"]
  Producer["素材负责人"] --> Material["补素材 / 素材回写"]
  Agent["Agent 操作者"] --> Queue["执行队列"]

  Radar --> Goal
  Goal --> Bundle
  Bundle --> Gate
  Gate --> Queue
  Queue --> Material
  Queue --> Log["行动记录"]
  Material --> Log
```

## 8. 数据回写图

```mermaid
flowchart TD
  Output["内容产物"] --> ReviewResult["审核结论"]
  Output --> Performance["表现数据"]
  Output --> MaterialLink["素材关联"]
  ReviewResult --> Log["行动记录"]
  Performance --> Log
  MaterialLink --> Log
  Log --> Coverage["覆盖矩阵"]
  Log --> Assets["素材覆盖"]
  Log --> Signal["新信号 / 下一步建议"]
  Coverage --> ResourceRank["资源包排序"]
  Assets --> ResourceRank
  Signal --> Radar["品牌战情室"]
```

## 9. 页面映射图

```mermaid
flowchart LR
  Map["内容知识地图"] --> Matrix["卖点 / 场景 / 评论痛点矩阵"]
  Matrix --> Review["审核任务"]
  Review --> Pack["团队知识包"]
  Pack --> Command["品牌战情室"]
  Command --> Compose["作战编组"]
  Compose --> Queue["执行队列"]
  Queue --> Prompt["Prompt / SOP / 补素材"]
  Prompt --> Log["行动记录"]
  Log --> Material["素材回写"]
  Material --> Matrix
```
