import type {
  InputSourceRecord,
  IntakeMaturitySummary,
  ManufacturingPlanProjection,
  ManufacturingTier,
  ProductPlanBudgetLevel,
  ProductPlanCandidateProjection,
  ProductPlanDecision,
  ProductPlanItemProjection,
  ProductPlanProjection,
  ProductPlanWave,
} from './types';
import { buildIntakeMaturitySummary } from './intakeMaturity';

const TIER_LABELS: Record<ManufacturingTier, string> = {
  premium: '精品定制',
  standard: '标准产出',
  template: '批量模板',
  'ai-quick': 'AI 快产',
};

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function compactText(value?: string): string {
  return (value ?? '').replace(/\s+/g, ' ').trim();
}

function sourceBody(source: InputSourceRecord): string {
  const structuredBody = source.kind === 'sku-table' && source.extractedText
    ? source.extractedText
    : [source.title, source.summary, source.extractedText].filter(Boolean).join('\n');
  return [structuredBody]
    .filter(Boolean)
    .join('\n')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitDelimitedLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  return line.split(delimiter).map((cell) => cell.trim()).filter(Boolean);
}

function candidateFromDelimitedRows(source: InputSourceRecord): ProductPlanCandidateProjection[] {
  const lines = sourceBody(source).split(/\n+/).map((line) => line.trim()).filter(Boolean);
  const tableLines = lines.filter((line) => line.includes(',') || line.includes('\t'));
  if (tableLines.length < 2) return [];
  for (let index = 0; index < tableLines.length - 1; index += 1) {
    const headers = splitDelimitedLine(tableLines[index]).slice(0, 16);
    const hasSkuHeader = headers.some((header) => /sku|商品|产品|标题|品名|价格|库存|stock|price|name|title/i.test(header));
    if (headers.length < 2 || !hasSkuHeader) continue;
    return tableLines.slice(index + 1, index + 31).flatMap((line, rowIndex) => {
      const cells = splitDelimitedLine(line);
      if (cells.length < 2) return [];
      const row = Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? '']));
      const titleEntry = Object.entries(row).find(([key]) => /商品|产品|标题|品名|名称|name|title/i.test(key));
      const skuEntry = Object.entries(row).find(([key]) => /sku|货号|型号|规格/i.test(key));
      const stockEntry = Object.entries(row).find(([key]) => /库存|stock/i.test(key));
      const priceEntry = Object.entries(row).find(([key]) => /价格|price|售价/i.test(key));
      const title = compactText(String(titleEntry?.[1] || skuEntry?.[1] || `${source.title} ${rowIndex + 1}`));
      const skuHint = compactText(String(skuEntry?.[1] || title));
      const inventory = Number.parseFloat(String(stockEntry?.[1] ?? ''));
      const price = Number.parseFloat(String(priceEntry?.[1] ?? ''));
      return [{
        id: `${source.id}:row-${rowIndex + 1}`,
        title,
        sourceIds: [source.id],
        skuHints: [skuHint],
        inventory: Number.isFinite(inventory) ? inventory : undefined,
        price: Number.isFinite(price) ? price : undefined,
      }];
    });
  }
  return [];
}

function candidateFromProductBrief(source: InputSourceRecord): ProductPlanCandidateProjection {
  const body = sourceBody(source);
  const productName = body.split(/\n+/)
    .map((line) => line.match(/^(产品名称|产品名|商品名称|商品名|品名|名称)\s*[:：]\s*(.+)$/)?.[2])
    .find(Boolean);
  const skuHints = Array.from(new Set([
    ...body.split(/\n+/).flatMap((line) => line.match(/(?:SKU|sku|型号|规格)\s*[:：]\s*([^，,；;\n]+)/)?.[1] ?? []),
    source.title,
  ].map((item) => compactText(item)).filter(Boolean))).slice(0, 6);
  return {
    id: `${source.id}:brief`,
    title: compactText(productName || source.title),
    sourceIds: [source.id],
    skuHints,
  };
}

function buildCandidates(inputSources: InputSourceRecord[]): ProductPlanCandidateProjection[] {
  const productSources = inputSources.filter((source) => source.kind === 'sku-table' || source.purpose === 'product-brief');
  const candidates = productSources.flatMap((source) =>
    source.kind === 'sku-table' ? candidateFromDelimitedRows(source) : [],
  );
  if (candidates.length) return candidates;
  return productSources.map(candidateFromProductBrief);
}

function scoreFromCoverage(maturity: IntakeMaturitySummary, sourceName: string): number {
  return maturity.projections.find((source) => source.name === sourceName)?.coverage ?? 0;
}

function scoreCandidate(input: {
  candidate: ProductPlanCandidateProjection;
  maturity: IntakeMaturitySummary;
  manufacturing?: ManufacturingPlanProjection;
  index: number;
}): Omit<ProductPlanItemProjection, 'id' | 'skuId' | 'title' | 'clusterTitle' | 'sourceIds' | 'reasons' | 'recoveryActions'> {
  const productCoverage = scoreFromCoverage(input.maturity, '商品与库存');
  const materialCoverage = input.manufacturing?.materialCoveragePercent ?? scoreFromCoverage(input.maturity, '素材与证据');
  const evidenceCoverage = input.manufacturing?.evidenceCoveragePercent ?? scoreFromCoverage(input.maturity, '素材与证据');
  const trafficCoverage = scoreFromCoverage(input.maturity, '投放与流量');
  const rulesCoverage = scoreFromCoverage(input.maturity, '平台与品牌规则');
  const inventoryScore = input.candidate.inventory === undefined
    ? Math.max(35, Math.min(72, productCoverage))
    : input.candidate.inventory <= 0
      ? 0
      : input.candidate.inventory < 10
        ? 38
        : input.candidate.inventory < 50
          ? 62
          : 86;
  const marginScore = input.candidate.price === undefined
    ? Math.max(42, Math.min(76, productCoverage))
    : input.candidate.price <= 0
      ? 0
      : input.candidate.price < 20
        ? 48
        : input.candidate.price < 80
          ? 66
          : 78;
  const opportunityScore = clampScore(52 + (trafficCoverage * 0.25) + (input.index % 4) * 4);
  const evidenceScore = clampScore(evidenceCoverage);
  const assetScore = clampScore(materialCoverage);
  const riskScore = clampScore(100 - Math.max(10, rulesCoverage || 35));
  const totalScore = clampScore((opportunityScore * 0.24) + (marginScore * 0.16) + (inventoryScore * 0.18) + (evidenceScore * 0.18) + (assetScore * 0.16) - (riskScore * 0.08));
  const manufacturingTier: ManufacturingTier = input.candidate.inventory === 0
    ? 'ai-quick'
    : totalScore >= 76 && materialCoverage >= 75 && evidenceCoverage >= 75
      ? 'premium'
      : totalScore >= 60 && materialCoverage >= 45 && evidenceCoverage >= 50
        ? 'standard'
        : totalScore >= 42
          ? 'template'
          : 'ai-quick';
  const wave: ProductPlanWave = manufacturingTier === 'premium' || manufacturingTier === 'standard'
    ? 'W1'
    : manufacturingTier === 'template'
      ? 'W2'
      : 'W3';
  const decision: ProductPlanDecision = manufacturingTier === 'premium'
    ? 'deep-modeling'
    : manufacturingTier === 'standard'
      ? 'standard-production'
      : manufacturingTier === 'template'
        ? 'template-production'
        : 'ai-quick';
  const budgetLevel: ProductPlanBudgetLevel = manufacturingTier === 'premium'
    ? 'high'
    : manufacturingTier === 'standard'
      ? 'medium-high'
      : manufacturingTier === 'template'
        ? 'medium'
        : 'low';
  const confidence = productCoverage >= 75 && evidenceCoverage >= 70
    ? 'high'
    : productCoverage >= 40 || evidenceCoverage >= 40
      ? 'medium'
      : 'low';
  return {
    manufacturingTier,
    tierLabel: TIER_LABELS[manufacturingTier],
    wave,
    budgetLevel,
    decision,
    opportunityScore,
    marginScore,
    inventoryScore,
    evidenceScore,
    assetScore,
    riskScore,
    totalScore,
    confidence,
  };
}

function reasonsForItem(item: Omit<ProductPlanItemProjection, 'reasons' | 'recoveryActions'>): string[] {
  return [
    `总分 ${item.totalScore}，进入${item.tierLabel}。`,
    `推广波次 ${item.wave}，预算等级 ${item.budgetLevel}。`,
    item.inventoryScore <= 40 ? '库存或库存字段不足，先低置信排产。' : '库存条件可支撑当前排期。',
    item.evidenceScore < 50 ? '证据覆盖不足，强主张需要降级或补证据。' : '证据覆盖可支撑建模和卖点阶段。',
    item.assetScore < 45 ? '素材覆盖不足，先用模板或 AI 快产兜底。' : '素材覆盖可支撑标准以上制造。',
  ].slice(0, 5);
}

function recoveryActionsForItem(item: Omit<ProductPlanItemProjection, 'reasons' | 'recoveryActions'>): string[] {
  return [
    item.inventoryScore <= 40 ? '补库存、价格或活动边界。' : '',
    item.evidenceScore < 50 ? '补测试报告、说明书或品牌证据。' : '',
    item.assetScore < 45 ? '补参考图、实拍视频或素材授权。' : '',
    item.riskScore > 55 ? '补平台规则或人工确认风险例外。' : '',
  ].filter(Boolean);
}

export function buildProductPlanProjection(input: {
  inputSources: InputSourceRecord[];
  intake?: IntakeMaturitySummary;
  manufacturing?: ManufacturingPlanProjection;
}): ProductPlanProjection {
  const maturity = input.intake ?? buildIntakeMaturitySummary(input.inputSources);
  const candidates = buildCandidates(input.inputSources);
  const plannedItems: ProductPlanItemProjection[] = candidates.map((candidate, index) => {
    const scored = scoreCandidate({ candidate, maturity, manufacturing: input.manufacturing, index });
    const base = {
      id: `product-plan:${candidate.id}`,
      skuId: candidate.skuHints[0] || candidate.id,
      title: candidate.title,
      clusterTitle: candidate.title.replace(/\s+(标准版|升级版|Pro|Mini|Max)$/i, ''),
      sourceIds: candidate.sourceIds,
      ...scored,
    };
    return {
      ...base,
      reasons: reasonsForItem(base),
      recoveryActions: recoveryActionsForItem(base),
    };
  });
  const distribution = plannedItems.reduce<Record<ManufacturingTier, number>>(
    (summary, item) => ({ ...summary, [item.manufacturingTier]: summary[item.manufacturingTier] + 1 }),
    { premium: 0, standard: 0, template: 0, 'ai-quick': 0 },
  );
  const waves = plannedItems.reduce<Record<ProductPlanWave, number>>(
    (summary, item) => ({ ...summary, [item.wave]: summary[item.wave] + 1 }),
    { W1: 0, W2: 0, W3: 0 },
  );
  const bottleneckCount = plannedItems.filter((item) => item.recoveryActions.length > 0 || item.confidence === 'low').length;
  return {
    mode: 'brand-full-coverage',
    modeLabel: '品牌全量',
    summary: plannedItems.length
      ? `${plannedItems.length} 个候选商品全部获得制造档位和推广波次；潜力只决定资源投入，不做淘汰。`
      : '尚未接入商品资料；补 SKU 表或产品 Brief 后生成全量商品规划。',
    candidateCount: candidates.length,
    plannedCount: plannedItems.length,
    allCovered: candidates.length === plannedItems.length,
    topTierCount: distribution.premium + distribution.standard,
    bottleneckCount,
    inputCoveragePercent: maturity.averageCoverage,
    distribution,
    waves,
    items: plannedItems,
  };
}
