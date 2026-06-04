import type {
  AssetReviewRecord,
  ContentKnowledgeMapRecord,
  GenerationLogEntry,
  InputSourceRecord,
  IntakeMaturitySummary,
  ManufacturingCapabilityProjection,
  ManufacturingPlanProjection,
  ManufacturingTier,
  PromptDraft,
} from './types';
import { buildIntakeMaturitySummary } from './intakeMaturity';

const TIER_LABELS: Record<ManufacturingTier, string> = {
  premium: '精品定制',
  standard: '标准产出',
  template: '批量模板',
  'ai-quick': 'AI 快产',
};

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function mapRows(map?: ContentKnowledgeMapRecord) {
  return map ? [...map.sellingPoints, ...map.painPoints, ...map.scenarios] : [];
}

function materialCoveragePercent(map: ContentKnowledgeMapRecord | undefined, approvedAssetCount: number): number {
  const rows = mapRows(map);
  if (!rows.length) return approvedAssetCount ? 45 : 0;
  const coveredRows = rows.filter((row) => row.materialStatus === 'approved' || (row.materialRefs?.length ?? 0) > 0).length;
  return clampPercent((coveredRows / rows.length) * 100);
}

function evidenceCoveragePercent(map?: ContentKnowledgeMapRecord): number {
  const rows = mapRows(map);
  if (!rows.length) return 0;
  const evidencedRows = rows.filter((row) => row.evidenceRefs.length > 0 && row.status !== 'needs-evidence').length;
  return clampPercent((evidencedRows / rows.length) * 100);
}

function promptDraftMatchesManufacturing(draft: PromptDraft): boolean {
  return draft.purpose === 'video' || draft.purpose === 'image' || draft.purpose === 'green-screen';
}

function manufacturingLog(log: GenerationLogEntry): boolean {
  return ['image', 'video', 'video-script', 'video-breakdown'].includes(log.kind);
}

function sourceHasVisualMaterial(source: InputSourceRecord): boolean {
  return source.purpose === 'reference' ||
    source.purpose === 'successful-asset' ||
    source.kind === 'image' ||
    source.kind === 'video';
}

function blockedTiers(input: {
  intake: IntakeMaturitySummary;
  materialCoverage: number;
  evidenceCoverage: number;
}): ManufacturingTier[] {
  const tiers: ManufacturingTier[] = ['premium', 'standard', 'template', 'ai-quick'];
  const blocked = new Set<ManufacturingTier>();
  if (input.materialCoverage < 75 || input.evidenceCoverage < 75) blocked.add('premium');
  if (input.materialCoverage < 45 || input.evidenceCoverage < 50 || input.intake.averageCoverage < 45) blocked.add('standard');
  if (input.intake.averageCoverage < 25) blocked.add('template');
  return tiers.filter((tier) => blocked.has(tier));
}

function recommendedTier(blocked: ManufacturingTier[]): ManufacturingTier {
  for (const tier of ['premium', 'standard', 'template', 'ai-quick'] as ManufacturingTier[]) {
    if (!blocked.includes(tier)) return tier;
  }
  return 'ai-quick';
}

function tierReason(input: {
  tier: ManufacturingTier;
  materialCoverage: number;
  evidenceCoverage: number;
  intake: IntakeMaturitySummary;
}): string {
  if (input.tier === 'premium') {
    return `素材覆盖 ${input.materialCoverage}%、证据覆盖 ${input.evidenceCoverage}%、接入覆盖 ${input.intake.averageCoverage}%，可进入精品定制。`;
  }
  if (input.tier === 'standard') {
    return `当前素材覆盖 ${input.materialCoverage}%、证据覆盖 ${input.evidenceCoverage}%，适合标准产出；补素材和证据后升精品。`;
  }
  if (input.tier === 'template') {
    return `接入覆盖 ${input.intake.averageCoverage}% 或素材覆盖不足，先用批量模板兜底，不阻塞本批制造。`;
  }
  return `数据或素材瓶颈较多，先走 AI 快产和视频 Prompt 交接，后续补齐后回填升档。`;
}

function capability(input: Omit<ManufacturingCapabilityProjection, 'priority'> & { priority?: number }): ManufacturingCapabilityProjection {
  return { ...input, priority: input.priority ?? 50 };
}

export function buildManufacturingPlanProjection(input: {
  inputSources: InputSourceRecord[];
  knowledgeMap?: ContentKnowledgeMapRecord;
  promptDrafts: PromptDraft[];
  logs: GenerationLogEntry[];
  assetReviews: AssetReviewRecord[];
  intake?: IntakeMaturitySummary;
}): ManufacturingPlanProjection {
  const intake = input.intake ?? buildIntakeMaturitySummary(input.inputSources);
  const approvedAssets = input.assetReviews.filter((review) => review.status === 'approved');
  const approvedAssetCount = approvedAssets.length;
  const materialCoverage = materialCoveragePercent(input.knowledgeMap, approvedAssetCount);
  const evidenceCoverage = evidenceCoveragePercent(input.knowledgeMap);
  const readyPromptCount = input.promptDrafts.filter(promptDraftMatchesManufacturing).length;
  const manufacturingArtifactCount =
    input.logs.filter((log) => manufacturingLog(log) && log.status === 'succeeded').length +
    input.promptDrafts.filter(promptDraftMatchesManufacturing).length;
  const visualSourceCount = input.inputSources.filter(sourceHasVisualMaterial).length;
  const hasProductInput = input.inputSources.some((source) => source.purpose === 'product-brief' || source.kind === 'sku-table');
  const hasSellingRows = mapRows(input.knowledgeMap).some((row) => row.status === 'ready');
  const blocked = blockedTiers({ intake, materialCoverage, evidenceCoverage });
  const tier = recommendedTier(blocked);

  const capabilities: ManufacturingCapabilityProjection[] = [
    capability({
      id: 'image-generation',
      title: '图片素材生成',
      targetModule: 'image',
      status: hasProductInput || hasSellingRows ? 'ready' : 'needs-input',
      tier,
      priority: tier === 'premium' || tier === 'standard' ? 90 : 70,
      reason: '复用现有图片生成、换背景、换姿势、多视角等能力，作为制造阶段的图片候选工具池。',
      requiredInputs: ['产品资料', '卖点 / 场景', '参考素材可选'],
      output: '候选图片进入素材审核',
      blockedReason: hasProductInput || hasSellingRows ? undefined : '缺产品资料或内容知识地图。',
    }),
    capability({
      id: 'video-prompt',
      title: '视频 Prompt 制造单',
      targetModule: 'video-prompt',
      status: readyPromptCount ? 'done' : hasProductInput || hasSellingRows ? 'ready' : 'needs-input',
      tier,
      priority: 100,
      reason: '视频第三方生成只复制 Prompt，不创建外部任务；成品必须手动导入后审核。',
      requiredInputs: ['批次目标', '卖点 / 场景', '禁用边界'],
      output: '可复制到第三方平台的视频 Prompt',
      blockedReason: hasProductInput || hasSellingRows ? undefined : '缺批次目标或可追溯卖点。',
    }),
    capability({
      id: 'green-screen',
      title: '绿幕文案图',
      targetModule: 'image-green-screen',
      status: hasSellingRows ? 'ready' : 'needs-input',
      tier: tier === 'premium' ? 'standard' : tier,
      priority: 65,
      reason: '把卖点、Hook 和 CTA 拆成可混剪文案卡，降低视频产能压力。',
      requiredInputs: ['脚本 / 卖点', 'CTA', '画幅'],
      output: 'PNG / WebP 文案卡进入混剪清单',
      blockedReason: hasSellingRows ? undefined : '缺卖点或脚本结构。',
    }),
    capability({
      id: 'mix-export',
      title: '混剪包导出',
      targetModule: 'video-mix-export',
      status: approvedAssetCount ? 'ready' : 'needs-input',
      tier: approvedAssetCount >= 3 ? tier : 'template',
      priority: approvedAssetCount ? 75 : 35,
      reason: '只导出素材文件夹和清单，不做时间线剪辑或伪造成片。',
      requiredInputs: ['已通过素材', '文案卡', 'Prompt 来源'],
      output: '第三方混剪软件素材包',
      blockedReason: approvedAssetCount ? undefined : '需要先通过素材审核。',
    }),
    capability({
      id: 'retouch',
      title: '图片精修 / 回炉',
      targetModule: 'image-retouch',
      status: approvedAssets.some((asset) => asset.kind === 'image') ? 'ready' : 'needs-input',
      tier: 'premium',
      priority: tier === 'premium' ? 80 : 30,
      reason: '精品档需要对通过图片做局部精修、扩图和 Prompt 模板回炉。',
      requiredInputs: ['已通过图片素材'],
      output: '精修版本或成功素材 Prompt',
      blockedReason: approvedAssets.some((asset) => asset.kind === 'image') ? undefined : '缺已通过图片素材。',
    }),
    capability({
      id: 'video-import',
      title: '成品视频导入',
      targetModule: 'video-import',
      status: visualSourceCount || readyPromptCount ? 'ready' : 'needs-input',
      tier,
      priority: 60,
      reason: '第三方生成后只能手动导入本地成品，并关联原 Prompt 进入审核。',
      requiredInputs: ['视频 Prompt', '本地成品视频'],
      output: '待审核视频素材',
      blockedReason: visualSourceCount || readyPromptCount ? undefined : '先生成视频 Prompt 或准备成品文件。',
    }),
  ].sort((a, b) => b.priority - a.priority);

  const primary = capabilities.find((item) => item.status === 'ready') ?? capabilities.find((item) => item.status === 'needs-input');

  return {
    recommendedTier: tier,
    tierLabel: TIER_LABELS[tier],
    tierReason: tierReason({ tier, materialCoverage, evidenceCoverage, intake }),
    blockedTiers: blocked,
    capabilities,
    primaryCapabilityId: primary?.id,
    materialCoveragePercent: materialCoverage,
    evidenceCoveragePercent: evidenceCoverage,
    readyPromptCount,
    approvedAssetCount,
    manufacturingArtifactCount,
  };
}
