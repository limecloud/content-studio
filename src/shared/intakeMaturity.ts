import type {
  InputSourceRecord,
  IntakeLevel,
  IntakeMaturitySummary,
  IntakeSourceProjection,
} from './types';

type IntakeBucketId =
  | 'product-inventory'
  | 'material-evidence'
  | 'search-feedback'
  | 'delivery-traffic'
  | 'platform-brand-rules'
  | 'human-approval';

interface IntakeBucketConfig {
  id: IntakeBucketId;
  name: string;
  outputObjects: string[];
  adapterName: string;
  adapterVersion: string;
  adapterReuseCount: number;
  match: (source: InputSourceRecord) => boolean;
  defaultMissing: string[];
  coverageWeight: number;
}

const BUCKETS: IntakeBucketConfig[] = [
  {
    id: 'product-inventory',
    name: '商品与库存',
    outputObjects: ['RawProductCandidate', 'NormalizedSku', 'SkuCluster'],
    adapterName: '通用 Excel 映射器',
    adapterVersion: 'v1',
    adapterReuseCount: 88,
    match: (source) => source.kind === 'sku-table' || source.purpose === 'product-brief',
    defaultMissing: ['SKU 表', '库存字段', '价格 / 活动边界'],
    coverageWeight: 24,
  },
  {
    id: 'material-evidence',
    name: '素材与证据',
    outputObjects: ['ClipAsset', 'Evidence', 'AssetUsageLedger'],
    adapterName: '飞书 / 网盘素材适配器',
    adapterVersion: 'v1',
    adapterReuseCount: 19,
    match: (source) => ['reference', 'successful-asset'].includes(source.purpose) || source.kind === 'image' || source.kind === 'video',
    defaultMissing: ['参考图 / 视频', '检测报告', '素材授权'],
    coverageWeight: 18,
  },
  {
    id: 'search-feedback',
    name: '搜索与评论',
    outputObjects: ['SearchSignal', 'IntentCluster', 'PainPoint'],
    adapterName: '评论 / 搜索词粘贴模板',
    adapterVersion: 'v1',
    adapterReuseCount: 31,
    match: (source) => source.purpose === 'user-feedback' && !isDeliveryTrafficSource(source),
    defaultMissing: ['评论原声', '搜索词', '客服问答'],
    coverageWeight: 18,
  },
  {
    id: 'delivery-traffic',
    name: '投放与流量',
    outputObjects: ['DeliveryMetric', 'BudgetPlan', 'KeywordFeedback'],
    adapterName: '巨量引擎投放适配器',
    adapterVersion: 'v0',
    adapterReuseCount: 9,
    match: isDeliveryTrafficSource,
    defaultMissing: ['投放报表', '预算', 'ROI / CTR'],
    coverageWeight: 14,
  },
  {
    id: 'platform-brand-rules',
    name: '平台与品牌规则',
    outputObjects: ['ForbiddenExpression', 'ReviewGate', 'RulePatch'],
    adapterName: '品牌规则文本模板',
    adapterVersion: 'v1',
    adapterReuseCount: 17,
    match: (source) =>
      source.purpose === 'brand-kb' ||
      source.purpose === 'competitor-observation' ||
      source.tags.some((tag) => /规则|合规|禁用|平台|品牌/i.test(tag)) ||
      /规则|合规|禁用|平台|品牌|红线/i.test(`${source.title} ${source.summary ?? ''}`),
    defaultMissing: ['品牌口径', '平台规则', '禁用表达'],
    coverageWeight: 14,
  },
  {
    id: 'human-approval',
    name: '人工确认',
    outputObjects: ['HumanApproval', 'RecoveryTask'],
    adapterName: '人工确认记录模板',
    adapterVersion: 'v1',
    adapterReuseCount: 12,
    match: (source) =>
      source.kind === 'manual-note' ||
      source.purpose === 'task-input' ||
      source.purpose === 'sop-input' ||
      source.tags.some((tag) => /确认|审批|人工|例外|复盘/i.test(tag)),
    defaultMissing: ['活动价确认', '风险例外', '拍摄确认'],
    coverageWeight: 12,
  },
];

function isDeliveryTrafficSource(source: InputSourceRecord): boolean {
  return (
    source.tags.some((tag) => /投放|roi|ad|metric|表现|转化|点击|ctr|cpa|预算/i.test(tag)) ||
    /投放|roi|广告|转化|点击|表现|ctr|cpa|预算/i.test(`${source.title} ${source.summary ?? ''}`)
  );
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function sourceQualityScore(source: InputSourceRecord): number {
  if (source.status === 'converted') return 100;
  if (source.status === 'registered') return source.sourcePath || source.sourceUrl ? 45 : 35;
  if (source.status === 'blocked') return source.kind === 'image' || source.kind === 'video' || source.kind === 'sku-table' ? 28 : 20;
  return 0;
}

function latestTimestamp(sources: InputSourceRecord[]): number {
  return sources.reduce((latest, source) => Math.max(latest, Date.parse(source.updatedAt || source.createdAt) || 0), 0);
}

function levelForSources(sources: InputSourceRecord[], coverage: number): IntakeLevel {
  if (sources.some((source) => source.sourceUrl && /api|oauth|webhook|sync|同步|直连/i.test(`${source.sourceUrl} ${source.tags.join(' ')}`))) return 'L2';
  if (sources.some((source) => source.kind === 'sku-table' || source.tags.some((tag) => /csv|excel|导出|映射|定期|t\+1/i.test(tag))) || coverage >= 75) return 'L1';
  return 'L0';
}

function freshnessFor(sources: InputSourceRecord[], level: IntakeLevel): string {
  if (!sources.length) return '未接入';
  if (level === 'L2') return '实时';
  if (level === 'L1') return 'T+1 / 定期导出';
  const latest = latestTimestamp(sources);
  if (!latest) return '手动上传';
  const ageDays = Math.floor((Date.now() - latest) / 86_400_000);
  if (ageDays <= 0) return '今天手动更新';
  if (ageDays <= 7) return `${ageDays} 天前手动更新`;
  return '超过 7 天未更新';
}

function confidenceFor(coverage: number, sources: InputSourceRecord[]): IntakeSourceProjection['confidence'] {
  if (!sources.length || coverage === 0) return '无';
  if (coverage >= 75 && sources.some((source) => source.status === 'converted')) return '高';
  if (coverage >= 40) return '中';
  return '低';
}

function healthFor(coverage: number, sources: InputSourceRecord[]): IntakeSourceProjection['health'] {
  if (!sources.length || coverage < 25) return 'bad';
  if (sources.some((source) => source.status === 'blocked' || source.status === 'failed') || coverage < 60) return 'warn';
  if (coverage >= 80) return 'ok';
  return 'info';
}

function responsibilityFor(bucket: IntakeBucketConfig, level: IntakeLevel, sources: InputSourceRecord[]): IntakeSourceProjection['responsibility'] {
  if (level === 'L2' || bucket.id === 'delivery-traffic') return 'implementation';
  if (sources.some((source) => source.status === 'converted') && sources.length >= 2) return 'system-auto';
  return 'self-serve';
}

function upgradeFor(level: IntakeLevel, coverage: number, bucket: IntakeBucketConfig): IntakeSourceProjection['upgrade'] | undefined {
  if (level === 'L2') return undefined;
  if (level === 'L0') {
    return {
      next: 'L1',
      action: `用 ${bucket.adapterName} 建立字段映射`,
      blocker: coverage < 40 ? '缺少可读文件或关键字段' : '需要确认字段映射模板',
    };
  }
  return {
    next: 'L2',
    action: '发起服务端直连 / 内网 Agent 接入',
    blocker: '需要服务端接入引擎、凭证托管和实施确认',
  };
}

function fieldMappingsFor(bucket: IntakeBucketConfig, sources: InputSourceRecord[], coverage: number): IntakeSourceProjection['fieldMappings'] {
  const mappedCount = sources.filter((source) => source.status === 'converted').length;
  return bucket.defaultMissing.map((field, index) => ({
    sourceField: sources[index]?.title ?? field,
    ontologyField: bucket.outputObjects[Math.min(index, bucket.outputObjects.length - 1)] ?? bucket.outputObjects[0],
    status: sources[index]?.status === 'converted'
      ? 'mapped'
      : sources[index]?.status === 'registered'
        ? 'ai-inferred'
        : sources[index]?.status === 'blocked'
          ? 'ocr-pending'
          : mappedCount || coverage >= 50
            ? 'ai-inferred'
            : 'missing',
  }));
}

function impactFor(bucket: IntakeBucketConfig, coverage: number): IntakeSourceProjection['impact'] {
  const blocksTier: IntakeSourceProjection['impact']['blocksTier'] = [];
  if (coverage < 80) blocksTier.push('premium');
  if (coverage < 60) blocksTier.push('standard');
  if (coverage < 35) blocksTier.push('template');
  if (coverage < 15) blocksTier.push('ai-quick');
  const note = coverage >= 80
    ? `${bucket.name} 覆盖较高，可支撑标准 / 精品制造档位。`
    : coverage >= 45
      ? `${bucket.name} 覆盖不足，高要求素材会降到标准或模板档，补齐后可升档。`
      : `${bucket.name} 是当前制造档位瓶颈，系统应低置信兜底，不阻塞流水线。`;
  return { blocksTier, note };
}

function bucketCoverage(bucket: IntakeBucketConfig, sources: InputSourceRecord[]): number {
  if (!sources.length) return 0;
  const score = sources.reduce((sum, source) => sum + sourceQualityScore(source), 0) / Math.max(sources.length, 1);
  const diversityBonus = Math.min(20, (sources.length - 1) * 8);
  return clampPercent((score * 0.8) + diversityBonus + bucket.coverageWeight * 0.2);
}

export function buildIntakeMaturitySummary(inputSources: InputSourceRecord[]): IntakeMaturitySummary {
  const projections = BUCKETS.map((bucket) => {
    const sources = inputSources.filter(bucket.match);
    const coverage = bucketCoverage(bucket, sources);
    const level = levelForSources(sources, coverage);
    return {
      id: bucket.id,
      name: bucket.name,
      level,
      responsibility: responsibilityFor(bucket, level, sources),
      adapterName: bucket.adapterName,
      adapterVersion: bucket.adapterVersion,
      adapterReuseCount: bucket.adapterReuseCount,
      coverage,
      freshness: freshnessFor(sources, level),
      confidence: confidenceFor(coverage, sources),
      health: healthFor(coverage, sources),
      outputObjects: bucket.outputObjects,
      sourceIds: sources.map((source) => source.id),
      missingSourceCount: Math.max(0, bucket.defaultMissing.length - sources.length),
      fieldMappings: fieldMappingsFor(bucket, sources, coverage),
      impact: impactFor(bucket, coverage),
      upgrade: upgradeFor(level, coverage, bucket),
    } satisfies IntakeSourceProjection;
  });
  const averageCoverage = projections.length
    ? clampPercent(projections.reduce((sum, source) => sum + source.coverage, 0) / projections.length)
    : 0;
  return {
    averageCoverage,
    selfServeSourceCount: projections.filter((source) => source.responsibility === 'self-serve').length,
    l2SourceCount: projections.filter((source) => source.level === 'L2').length,
    bottleneckCount: projections.filter((source) => source.coverage < 45 || source.health === 'bad').length,
    sourceCount: projections.length,
    projections,
  };
}
