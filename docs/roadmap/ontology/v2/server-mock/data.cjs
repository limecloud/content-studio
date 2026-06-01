// Ontology v2 服务端 Mock 数据
// 与 server-console.html 的 DB 对齐，作为 API 契约的事实源。
// 纯数据，无依赖。

const tenants = [
  { id: 'tenant-A', name: '夏季风扇品牌方', deploy: 'public_cloud', mode: 'brand_full', sku: 286, coverage: 62, agents: 'local+cloud', quota: 72, health: 'ok' },
  { id: 'tenant-B', name: '小家电代运营', deploy: 'public_cloud', mode: 'agency_capacity', sku: 1240, coverage: 71, agents: 'cloud', quota: 88, health: 'warn' },
  { id: 'tenant-C', name: '服饰大客户', deploy: 'vpc', mode: 'brand_full', sku: 3508, coverage: 84, agents: 'local+cloud', quota: 56, health: 'ok' }
];

const sources = [
  { id: 'shop', name: '商品与库存', level: 'L1', responsibility: 'implementation', coverage: 92, freshness: 'T+1', confidence: 'high', health: 'ok', adapter: 'ad-taobao-v3',
    mapping: [['商品标题', 'NormalizedSku.title', 'mapped'], ['销售价', 'NormalizedSku.price', 'mapped'], ['规格', 'NormalizedSku.spec', 'ai_inferred'], ['库存数', 'NormalizedSku.stock', 'mapped'], ['活动价', null, 'missing']],
    upgrade: { next: 'L2', direction: '直连用友 ERP，库存实时', blocker: '实施配置 U8 接口（约 2 人日）' } },
  { id: 'search', name: '搜索与评论', level: 'L2', responsibility: 'system_auto', coverage: 88, freshness: 'realtime', confidence: 'high', health: 'ok', adapter: 'ad-douyin-v2',
    mapping: [['搜索词', 'SearchSignal.term', 'mapped'], ['评论正文', 'PainPoint.raw', 'mapped'], ['客服问答', 'IntentCluster', 'mapped']],
    upgrade: null },
  { id: 'rules', name: '平台与品牌规则', level: 'L1', responsibility: 'self_serve', coverage: 79, freshness: 'on_demand', confidence: 'high', health: 'ok', adapter: 'ad-excel-generic',
    mapping: [['禁用词', 'ForbiddenExpression', 'mapped'], ['功效边界', 'ReviewGate.rule', 'mapped'], ['类目特殊规则', null, 'missing']],
    upgrade: { next: 'L2', direction: '订阅平台合规推送', blocker: '平台合规 API 准入审核' } },
  { id: 'content', name: '素材与证据', level: 'L0', responsibility: 'self_serve', coverage: 54, freshness: 'manual', confidence: 'mid', health: 'warn', adapter: 'ad-feishu-asset',
    mapping: [['详情页主图', 'ClipAsset', 'mapped'], ['检测报告 PDF', 'Evidence', 'ocr_pending'], ['历史成片', null, 'missing']],
    upgrade: { next: 'L1', direction: '授权飞书目录自动归集', blocker: '甲方整理素材命名规范（约 0.5 人日）' } },
  { id: 'manual', name: '人工确认', level: 'L0', responsibility: 'self_serve', coverage: 61, freshness: 'event', confidence: 'mid', health: 'warn', adapter: 'ad-excel-generic',
    mapping: [['活动价边界', 'HumanApproval.offer', 'pending'], ['预算阈值', 'HumanApproval.budget', 'mapped']],
    upgrade: { next: 'L1', direction: '模板化确认表单 + 待办提醒', blocker: '配置确认表单模板（约 0.5 人日）' } },
  { id: 'ads', name: '投放与流量', level: 'L0', responsibility: 'implementation', coverage: 0, freshness: 'none', confidence: 'none', health: 'bad', adapter: 'ad-oceanengine',
    mapping: [['投放花费', 'DeliveryMetric.cost', 'missing'], ['3秒留存', 'DeliveryMetric.retention', 'missing'], ['转化', 'DeliveryMetric.cvr', 'missing']],
    upgrade: { next: 'L2', direction: '直连巨量引擎，实时回写', blocker: '甲方授权广告账户 + 实施配置（约 1.5 人日）' } }
];

const adapters = [
  { id: 'ad-excel-generic', name: '通用 Excel 映射器', platform: 'excel', reuseCount: 88, responsibility: 'system_auto', version: 'v4' },
  { id: 'ad-taobao-v3', name: '淘宝/天猫商品模板', platform: 'taobao', reuseCount: 41, responsibility: 'system_auto', version: 'v3' },
  { id: 'ad-douyin-v2', name: '抖音商品模板', platform: 'douyin', reuseCount: 23, responsibility: 'system_auto', version: 'v2' },
  { id: 'ad-feishu-asset', name: '飞书/网盘素材适配器', platform: 'feishu', reuseCount: 19, responsibility: 'self_serve', version: 'v2' },
  { id: 'ad-yonyou-erp', name: '用友 ERP 适配器', platform: 'yonyou', reuseCount: 12, responsibility: 'implementation', version: 'v1' },
  { id: 'ad-oceanengine', name: '巨量引擎投放适配器', platform: 'oceanengine', reuseCount: 9, responsibility: 'implementation', version: 'v1' }
];

const runtimes = {
  local: { name: '本地 Agent Runtime', running: 14, queued: 3, capacity: 'client_compute', note: '用户在场默认本地·低延迟交互创作' },
  cloud: { name: '服务端 Agent Runtime', running: 22, queued: 41, capacity: 'elastic_pool', note: '无头/定时/批量/离线兜底' }
};

const agentJobs = [
  { id: 'job-7f3a', type: '卖点共创', tenant: 'tenant-A', runtime: 'local', status: 'running', detail: 'claude-agent · 3 轮' },
  { id: 'job-8b21', type: '286 SKU 分档', tenant: 'tenant-B', runtime: 'cloud', handoffFrom: 'local', status: 'running', detail: '批量 · 64%' },
  { id: 'job-9c04', type: '矩阵生成', tenant: 'tenant-A', runtime: 'cloud', status: 'queued', detail: '864 组待处理' },
  { id: 'job-a15e', type: '视频批量渲染', tenant: 'tenant-C', runtime: 'cloud', status: 'running', detail: '18 单 · 11 完成' },
  { id: 'job-b290', type: '夜间复盘', tenant: 'tenant-B', runtime: 'cloud', status: 'scheduled', detail: '02:00 触发' }
];

const gates = [
  { id: 'evidence', name: '证据合规', passRate: 91, rule: '强主张须 verified 证据', health: 'ok' },
  { id: 'platform', name: '平台表达', passRate: 88, rule: '禁用词/极限词/价格越界', health: 'ok' },
  { id: 'asset', name: '素材真实性', passRate: 76, rule: '复用上限/AI标注/授权', health: 'warn' },
  { id: 'structure', name: '结构门禁', passRate: 97, rule: '4-5段/黄金三秒', health: 'ok' },
  { id: 'budget', name: '预算阈值', passRate: 82, rule: '超阈值转人工确认', health: 'warn' },
  { id: 'efficacy', name: '强功效', passRate: 64, rule: '三秒降温类无测试拦截', health: 'bad' }
];

const reviewQueue = [
  { id: 'rp-fan-018', issue: '三秒降温缺测试条件', risk: 'high', tenant: 'tenant-A', status: 'needs_human', recovery: 'MissingEvidenceTask' },
  { id: 'offer-boundary', issue: '券后价缺活动时间', risk: 'mid', tenant: 'tenant-A', status: 'needs_human', recovery: 'HumanApproval' },
  { id: 'asset-auth', issue: '通勤侧脸镜头授权缺失', risk: 'mid', tenant: 'tenant-C', status: 'needs_human', recovery: 'MaterialGapTask' },
  { id: 'budget-raise', issue: '+65% 超自动阈值 40%', risk: 'high', tenant: 'tenant-B', status: 'needs_human', recovery: 'HumanApproval' }
];

const vault = [
  { tenant: 'tenant-A', credential: '抖店 OAuth Token', status: 'active', expiry: 'T+6d', heldBy: 'server_vault' },
  { tenant: 'tenant-B', credential: '巨量引擎广告账户', status: 'active', expiry: 'T+2d', heldBy: 'server_vault' },
  { tenant: 'tenant-C', credential: '用友 U8 内网凭证', status: 'active', expiry: 'long', heldBy: 'edge_agent' },
  { tenant: 'tenant-A', credential: '店铺 API Key', status: 'active', expiry: 'long', heldBy: 'server_vault' }
];

// 一个示例批次（StageRun 状态，连接接入覆盖 → 制造档位）
const batch = {
  id: 'batch-summer-fan-202606', tenant: 'tenant-A', title: '夏季便携风扇 A 组',
  coverageMode: 'brand_full', intakeCoverage: 62,
  stages: [
    { no: '01', id: 'selection', name: '商品规划', status: 'current', output: 'ProductPlan[]' },
    { no: '02', id: 'intent', name: '意图', status: 'running', output: 'IntentCluster[]' },
    { no: '03', id: 'modeling', name: '建模', status: 'running', output: 'ProductFact' },
    { no: '04', id: 'selling', name: '卖点', status: 'pending', output: 'SellingPoint[]' },
    { no: '05', id: 'matrix', name: '矩阵', status: 'pending', output: 'MatrixRow[]' },
    { no: '06', id: 'manufacturing', name: '制造', status: 'blocked', output: 'VideoManufacturingJob', blockReason: '素材覆盖 54% + 投放未接入' },
    { no: '07', id: 'review', name: '审核', status: 'pending', output: 'ReviewDecision[]' },
    { no: '08', id: 'optimization', name: '调优', status: 'pending', output: 'OptimizationAction[]' },
    { no: '09', id: 'feedback', name: '复盘', status: 'pending', output: 'KnowledgeUpdate[]' }
  ],
  tierDistribution: { premium: 14, standard: 36, template: 92, ai_quick: 144 }
};

module.exports = { tenants, sources, adapters, runtimes, agentJobs, gates, reviewQueue, vault, batch };
