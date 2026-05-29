import { randomUUID } from 'node:crypto';
import type {
  BrandKnowledgeBaseRecord,
  BuildContentKnowledgeMapInput,
  ContentKnowledgeMapCoverageDimensions,
  ContentKnowledgeMapEvidence,
  ContentKnowledgeMapMatrixRow,
  InputSourceRecord,
  IpKnowledgeBaseRecord,
  PromptDraft,
  SceneCard,
} from '../../shared/types';

export interface ContentKnowledgeMapBuildSources {
  inputSources: InputSourceRecord[];
  brandKnowledgeBases: BrandKnowledgeBaseRecord[];
  ipKnowledgeBases: IpKnowledgeBaseRecord[];
  sceneCards: SceneCard[];
  promptDrafts: PromptDraft[];
}

export interface ContentKnowledgeMapBuildResult {
  title: string;
  sourceInputSourceIds: string[];
  brandKnowledgeBaseIds: string[];
  ipKnowledgeBaseIds: string[];
  sceneCardIds: string[];
  promptDraftIds: string[];
  sellingPoints: ContentKnowledgeMapMatrixRow[];
  painPoints: ContentKnowledgeMapMatrixRow[];
  scenarios: ContentKnowledgeMapMatrixRow[];
  evidence: ContentKnowledgeMapEvidence[];
  constraints: string[];
  gaps?: string[];
  model: string;
  skuRowCount: number;
  competitorObservationCount: number;
}

export interface ContentKnowledgeMapModelRow {
  title?: string;
  summary?: string;
  tags?: string[];
  dimensions?: ContentKnowledgeMapCoverageDimensions;
  sourceRefs?: string[];
  evidenceRefs?: string[];
  confidence?: number;
  status?: ContentKnowledgeMapMatrixRow['status'];
  materialStatus?: ContentKnowledgeMapMatrixRow['materialStatus'];
}

export interface ContentKnowledgeMapModelOutput {
  title?: string;
  sellingPoints?: ContentKnowledgeMapModelRow[];
  painPoints?: ContentKnowledgeMapModelRow[];
  scenarios?: ContentKnowledgeMapModelRow[];
  constraints?: string[];
  gaps?: string[];
}

function compactText(value: string | undefined, fallback = ''): string {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function clip(value: string, max = 160): string {
  const text = compactText(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function uniqueStrings(values: Array<string | undefined>, limit = 12): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const item = compactText(value);
    const key = item.toLowerCase();
    if (!item || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

function optionalDimensions(input: ContentKnowledgeMapCoverageDimensions): ContentKnowledgeMapCoverageDimensions | undefined {
  const dimensions: ContentKnowledgeMapCoverageDimensions = {};
  const audiences = uniqueStrings(input.audiences ?? [], 8);
  const channels = uniqueStrings(input.channels ?? [], 8);
  const stages = uniqueStrings(input.stages ?? [], 8);
  const contentFormats = uniqueStrings(input.contentFormats ?? [], 8);
  const useCases = uniqueStrings(input.useCases ?? [], 8);
  if (audiences.length) dimensions.audiences = audiences;
  if (channels.length) dimensions.channels = channels;
  if (stages.length) dimensions.stages = stages;
  if (contentFormats.length) dimensions.contentFormats = contentFormats;
  if (useCases.length) dimensions.useCases = useCases;
  return Object.keys(dimensions).length ? dimensions : undefined;
}

function includesAny(value: string | undefined, patterns: RegExp[]): boolean {
  const text = compactText(value);
  return patterns.some((pattern) => pattern.test(text));
}

function pickRecords<T extends { id: string }>(records: T[], ids?: string[]): T[] {
  if (!ids?.length) return records;
  const selected = new Set(ids);
  return records.filter((record) => selected.has(record.id));
}

function sourceRef(type: string, id?: string): string {
  return id ? `${type}:${id}` : type;
}

function extractLines(text: string | undefined, limit = 8): string[] {
  return uniqueStrings(
    compactText(text)
      .split(/[\n。！？!?；;]+/)
      .map((line) => line.replace(/^[-*•\d.\s]+/, '').trim()),
    limit,
  );
}

function sourceText(source: InputSourceRecord): string {
  return compactText([source.title, source.summary, source.extractedText, ...source.tags].filter(Boolean).join('\n'));
}

function isSkuSource(source: InputSourceRecord): boolean {
  return source.kind === 'sku-table' || includesAny(sourceText(source), [/SKU/i, /规格/, /价格带/, /价格/, /型号/]);
}

function isCompetitorSource(source: InputSourceRecord): boolean {
  return source.purpose === 'competitor-observation' || includesAny(sourceText(source), [/竞品/, /竞对/, /对标/, /竞争/, /competitor/i]);
}

function parseTableRows(text: string | undefined, limit = 12): Array<Record<string, string>> {
  const lines = compactText(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const headers = lines[0].split(delimiter).map((item) => item.trim()).filter(Boolean);
  if (headers.length < 2) return [];
  return lines.slice(1, limit + 1).map((line) => {
    const values = line.split(delimiter).map((item) => item.trim());
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? '']));
  }).filter((row) => Object.values(row).some(Boolean));
}

function summarizeTableRow(row: Record<string, string>): string {
  return Object.entries(row)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}：${value}`)
    .join(' / ');
}

function titleFromSkuRow(row: Record<string, string>, fallback: string): string {
  const sku = row.SKU || row.sku || row['型号'] || row['款式'] || row['规格'] || row['名称'];
  const spec = row['规格'] || row['容量'] || row['型号'] || row['适用场景'] || row['价格'];
  return uniqueStrings([sku, spec].filter(Boolean), 2).join(' / ') || fallback;
}

function valueFromRow(row: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    const direct = compactText(row[key]);
    if (direct) return direct;
    const matchedKey = Object.keys(row).find((candidate) => candidate.toLowerCase() === key.toLowerCase());
    const matchedValue = matchedKey ? compactText(row[matchedKey]) : '';
    if (matchedValue) return matchedValue;
  }
  return undefined;
}

function compactOptionalValues(values: Array<string | undefined>): string[] {
  return values.map((value) => compactText(value)).filter(Boolean);
}

function sourceDimensionHints(source: InputSourceRecord): ContentKnowledgeMapCoverageDimensions {
  return optionalDimensions({
    channels: source.tags.filter((tag) => /抖音|小红书|视频号|公众号|私域|直播|电商/.test(tag)),
    contentFormats: source.tags.filter((tag) => /图文|短视频|口播|直播|详情页|种草|测评|FAQ|私域/.test(tag)),
    useCases: source.tags.filter((tag) => /通勤|办公室|家庭|出差|带娃|户外|桌面|包内/.test(tag)),
  }) ?? {};
}

function skuDimensions(row: Record<string, string>, source: InputSourceRecord): ContentKnowledgeMapCoverageDimensions | undefined {
  const sourceHints = sourceDimensionHints(source);
  return optionalDimensions({
    audiences: compactOptionalValues([valueFromRow(row, ['人群', '目标人群', '受众', '用户', '适用人群']), ...(sourceHints.audiences ?? [])]),
    channels: compactOptionalValues([valueFromRow(row, ['渠道', '平台', '内容渠道']), ...(sourceHints.channels ?? [])]),
    stages: compactOptionalValues([valueFromRow(row, ['阶段', '购买阶段', '认知阶段', '需求阶段'])]),
    contentFormats: compactOptionalValues([valueFromRow(row, ['内容形式', '格式', '体裁']), ...(sourceHints.contentFormats ?? [])]),
    useCases: compactOptionalValues([valueFromRow(row, ['适用场景', '使用场景', '场景']), ...(sourceHints.useCases ?? [])]),
  });
}

function evidenceFromInput(source: InputSourceRecord): ContentKnowledgeMapEvidence {
  const excerpt = clip(source.extractedText || source.summary || source.blockedReason || source.title, 180);
  return {
    id: randomUUID(),
    sourceType: 'input-source',
    sourceId: source.id,
    sourceTitle: source.title,
    claim: source.summary ? clip(source.summary, 90) : source.title,
    excerpt: excerpt || '输入源尚未转换成可读文本。',
    status: source.status === 'converted' ? 'ready' : 'needs-review',
  };
}

function feedbackEvidenceType(source: InputSourceRecord): ContentKnowledgeMapEvidence['sourceType'] {
  return source.tags.some((tag) => /客服|私信|问答|售后/.test(tag)) || /客服|私信|问答|售后/.test(source.title)
    ? 'customer-service-log'
    : 'user-quote';
}

function feedbackLineKey(sourceId: string, line: string): string {
  return `${sourceId}:${compactText(line).toLowerCase()}`;
}

function evidenceFromFeedbackLine(source: InputSourceRecord, line: string): ContentKnowledgeMapEvidence {
  const sourceType = feedbackEvidenceType(source);
  return {
    id: randomUUID(),
    sourceType,
    sourceId: source.id,
    sourceTitle: source.title,
    claim: sourceType === 'customer-service-log' ? `客服记录：${clip(line, 76)}` : `用户原声：${clip(line, 76)}`,
    excerpt: clip(line, 180),
    status: source.status === 'converted' ? 'ready' : 'needs-review',
  };
}

function evidenceFromBrand(record: BrandKnowledgeBaseRecord, claim: string): ContentKnowledgeMapEvidence {
  return {
    id: randomUUID(),
    sourceType: 'brand-knowledge-base',
    sourceId: record.id,
    sourceTitle: record.title,
    claim: clip(claim, 90),
    excerpt: clip(claim, 180),
    status: record.status === 'ready' ? 'ready' : 'needs-review',
  };
}

function evidenceFromIp(record: IpKnowledgeBaseRecord, label: string, claim: string): ContentKnowledgeMapEvidence {
  return {
    id: randomUUID(),
    sourceType: 'ip-knowledge-base',
    sourceId: record.id,
    sourceTitle: record.title,
    claim: clip(`${label}：${claim}`, 90),
    excerpt: clip(claim, 180),
    status: record.status === 'ready' ? 'ready' : 'needs-review',
  };
}

function evidenceFromScene(scene: SceneCard): ContentKnowledgeMapEvidence {
  return {
    id: randomUUID(),
    sourceType: 'scene-card',
    sourceId: scene.id,
    sourceTitle: scene.title,
    claim: clip(scene.sellingPoint || scene.usageScene, 90),
    excerpt: clip([scene.audience, scene.painPoint, scene.usageScene, scene.sellingPoint].filter(Boolean).join(' / '), 180),
    status: 'ready',
  };
}

function rowFromItem(input: {
  title: string;
  summary?: string;
  tags?: string[];
  dimensions?: ContentKnowledgeMapCoverageDimensions;
  sourceRefs?: string[];
  evidenceRefs?: string[];
  confidence?: number;
  status?: ContentKnowledgeMapMatrixRow['status'];
}): ContentKnowledgeMapMatrixRow {
  const evidenceRefs = uniqueStrings(input.evidenceRefs ?? [], 8);
  return {
    id: randomUUID(),
    title: clip(input.title, 80),
    summary: clip(input.summary || input.title, 180),
    tags: uniqueStrings(input.tags ?? [], 6),
    dimensions: optionalDimensions(input.dimensions ?? {}),
    sourceRefs: uniqueStrings(input.sourceRefs ?? [], 10),
    evidenceRefs,
    confidence: Math.max(0, Math.min(100, Math.round(input.confidence ?? (evidenceRefs.length ? 78 : 45)))),
    status: input.status ?? (evidenceRefs.length ? 'ready' : 'needs-evidence'),
  };
}

function dedupeRows(rows: ContentKnowledgeMapMatrixRow[], limit = 12): ContentKnowledgeMapMatrixRow[] {
  const seen = new Set<string>();
  const result: ContentKnowledgeMapMatrixRow[] = [];
  for (const row of rows) {
    const key = row.title.toLowerCase();
    if (!row.title || seen.has(key)) continue;
    seen.add(key);
    result.push(row);
    if (result.length >= limit) break;
  }
  return result;
}

function compactLines(values: string[], limit = 8): string[] {
  return uniqueStrings(values.map((value) => clip(value, 180)), limit);
}

function validRowStatus(value: unknown): ContentKnowledgeMapMatrixRow['status'] | undefined {
  if (value === 'ready' || value === 'needs-evidence' || value === 'needs-review') return value;
  return undefined;
}

function validMaterialStatus(value: unknown): ContentKnowledgeMapMatrixRow['materialStatus'] | undefined {
  if (value === 'missing' || value === 'covered' || value === 'approved' || value === 'rejected') return value;
  return undefined;
}

function normalizeDimensions(input: ContentKnowledgeMapCoverageDimensions | undefined): ContentKnowledgeMapCoverageDimensions | undefined {
  if (!input || typeof input !== 'object') return undefined;
  return optionalDimensions({
    audiences: normalizeStringArray(input.audiences, 8),
    channels: normalizeStringArray(input.channels, 8),
    stages: normalizeStringArray(input.stages, 8),
    contentFormats: normalizeStringArray(input.contentFormats, 8),
    useCases: normalizeStringArray(input.useCases, 8),
  });
}

function normalizeStringArray(value: unknown, limit = 12): string[] {
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.map((item) => typeof item === 'string' ? item : String(item ?? '')), limit);
}

function rowLooksCompetitor(row: ContentKnowledgeMapModelRow): boolean {
  return includesAny(
    [
      row.title,
      row.summary,
      ...(Array.isArray(row.tags) ? row.tags : []),
      ...(Array.isArray(row.sourceRefs) ? row.sourceRefs : []),
    ].filter(Boolean).join(' '),
    [/竞品/, /竞对/, /对标/, /不可搬运/, /competitor/i],
  );
}

function normalizeModelRows(input: {
  rows: ContentKnowledgeMapModelRow[] | undefined;
  fallbackRows: ContentKnowledgeMapMatrixRow[];
  evidence: ContentKnowledgeMapEvidence[];
  defaultTag: string;
  limit: number;
}): ContentKnowledgeMapMatrixRow[] {
  const evidenceIds = new Set(input.evidence.map((item) => item.id));
  const evidenceIdsBySource = new Map<string, string[]>();
  for (const item of input.evidence) {
    const ref = sourceRef(item.sourceType, item.sourceId);
    evidenceIdsBySource.set(ref, [...(evidenceIdsBySource.get(ref) ?? []), item.id]);
  }
  const validSourceRefs = new Set([
    ...Array.from(evidenceIdsBySource.keys()),
    ...input.fallbackRows.flatMap((row) => row.sourceRefs),
  ]);
  const fallbackByTitle = new Map(input.fallbackRows.map((row) => [row.title.toLowerCase(), row]));
  const normalized = normalizeArrayLike(input.rows).map((row): ContentKnowledgeMapMatrixRow | null => {
    const title = clip(row.title || '', 80);
    if (!title) return null;
    const fallback = fallbackByTitle.get(title.toLowerCase());
    const sourceRefs = uniqueStrings([
      ...normalizeStringArray(row.sourceRefs, 10).filter((ref) => validSourceRefs.has(ref)),
      ...(fallback?.sourceRefs ?? []),
    ], 10);
    const evidenceRefs = uniqueStrings([
      ...normalizeStringArray(row.evidenceRefs, 8).filter((id) => evidenceIds.has(id)),
      ...sourceRefs.flatMap((ref) => evidenceIdsBySource.get(ref) ?? []),
      ...(fallback?.evidenceRefs ?? []),
    ], 8);
    const competitor = rowLooksCompetitor(row);
    const status = competitor
      ? 'needs-review'
      : validRowStatus(row.status) ?? fallback?.status ?? (evidenceRefs.length ? 'ready' : 'needs-evidence');
    const normalizedRow: ContentKnowledgeMapMatrixRow = {
      id: randomUUID(),
      title,
      summary: clip(row.summary || fallback?.summary || title, 180),
      tags: uniqueStrings([input.defaultTag, ...normalizeStringArray(row.tags, 6), ...(fallback?.tags ?? [])], 8),
      dimensions: normalizeDimensions(row.dimensions) ?? fallback?.dimensions,
      sourceRefs,
      evidenceRefs,
      materialStatus: validMaterialStatus(row.materialStatus) ?? fallback?.materialStatus,
      materialRefs: fallback?.materialRefs,
      performanceTags: fallback?.performanceTags,
      confidence: Math.max(0, Math.min(100, Math.round(Number(row.confidence ?? fallback?.confidence ?? (evidenceRefs.length ? 76 : 42))))),
      status,
    };
    return normalizedRow;
  }).filter((row): row is ContentKnowledgeMapMatrixRow => Boolean(row));

  return dedupeRows(normalized, input.limit);
}

function normalizeArrayLike<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

function sourceDigest(input: ContentKnowledgeMapBuildSources): Array<Record<string, unknown>> {
  return [
    ...input.inputSources.map((source) => ({
      kind: 'input-source',
      ref: sourceRef('input-source', source.id),
      id: source.id,
      purpose: source.purpose,
      title: source.title,
      status: source.status,
      tags: source.tags,
      text: clip([source.summary, source.extractedText].filter(Boolean).join('\n'), 900),
    })),
    ...input.brandKnowledgeBases.map((record) => ({
      kind: 'brand-knowledge-base',
      ref: sourceRef('brand-knowledge-base', record.id),
      id: record.id,
      title: record.title,
      status: record.status,
      audience: record.audience,
      productFacts: compactLines(record.productFacts, 8),
      coreSellingPoints: compactLines(record.coreSellingPoints, 8),
      complianceBoundaries: compactLines(record.complianceBoundaries, 8),
      sceneSeeds: compactLines(record.sceneSeeds, 8),
      brandVoice: clip(record.brandVoice, 260),
    })),
    ...input.ipKnowledgeBases.map((record) => ({
      kind: 'ip-knowledge-base',
      ref: sourceRef('ip-knowledge-base', record.id),
      id: record.id,
      title: record.title,
      status: record.status,
      completeness: record.completeness,
      layers: record.layers,
      missingLayers: record.missingLayers,
      extensionScenes: record.extensionScenes,
    })),
    ...input.sceneCards.map((scene) => ({
      kind: 'scene-card',
      ref: sourceRef('scene-card', scene.id),
      id: scene.id,
      title: scene.title,
      audience: scene.audience,
      painPoint: scene.painPoint,
      usageScene: scene.usageScene,
      sellingPoint: scene.sellingPoint,
      voiceoverDirection: scene.voiceoverDirection,
    })),
    ...input.promptDrafts.map((draft) => ({
      kind: 'prompt-draft',
      ref: sourceRef('prompt-draft', draft.id),
      id: draft.id,
      title: draft.title,
      purpose: draft.purpose,
      status: draft.status,
      content: clip(draft.versions.find((version) => version.id === draft.activeVersionId)?.content ?? draft.versions[0]?.content ?? '', 600),
    })),
  ];
}

function seedDigest(seed: ContentKnowledgeMapBuildResult): Record<string, unknown> {
  return {
    title: seed.title,
    skuRowCount: seed.skuRowCount,
    competitorObservationCount: seed.competitorObservationCount,
    evidence: seed.evidence.map((item) => ({
      id: item.id,
      sourceRef: sourceRef(item.sourceType, item.sourceId),
      sourceType: item.sourceType,
      sourceTitle: item.sourceTitle,
      claim: item.claim,
      excerpt: item.excerpt,
      status: item.status,
    })),
    seedRows: {
      sellingPoints: seed.sellingPoints.map(rowForModelPrompt),
      painPoints: seed.painPoints.map(rowForModelPrompt),
      scenarios: seed.scenarios.map(rowForModelPrompt),
    },
    constraints: seed.constraints,
  };
}

function rowForModelPrompt(row: ContentKnowledgeMapMatrixRow): Record<string, unknown> {
  return {
    title: row.title,
    summary: row.summary,
    tags: row.tags,
    dimensions: row.dimensions,
    sourceRefs: row.sourceRefs,
    evidenceRefs: row.evidenceRefs,
    confidence: row.confidence,
    status: row.status,
  };
}

export function contentKnowledgeMapModelSchema(): Record<string, unknown> {
  const rowSchema = {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'summary', 'tags', 'sourceRefs', 'evidenceRefs', 'confidence', 'status'],
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      tags: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      dimensions: {
        type: 'object',
        additionalProperties: false,
        properties: {
          audiences: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          channels: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          stages: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          contentFormats: { type: 'array', items: { type: 'string' }, maxItems: 8 },
          useCases: { type: 'array', items: { type: 'string' }, maxItems: 8 },
        },
      },
      sourceRefs: { type: 'array', items: { type: 'string' }, maxItems: 10 },
      evidenceRefs: { type: 'array', items: { type: 'string' }, maxItems: 8 },
      confidence: { type: 'number', minimum: 0, maximum: 100 },
      status: { type: 'string', enum: ['ready', 'needs-evidence', 'needs-review'] },
      materialStatus: { type: 'string', enum: ['missing', 'covered', 'approved', 'rejected'] },
    },
  };
  return {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'sellingPoints', 'painPoints', 'scenarios', 'constraints', 'gaps'],
    properties: {
      title: { type: 'string' },
      sellingPoints: { type: 'array', items: rowSchema, maxItems: 24 },
      painPoints: { type: 'array', items: rowSchema, maxItems: 24 },
      scenarios: { type: 'array', items: rowSchema, maxItems: 24 },
      constraints: { type: 'array', items: { type: 'string' }, maxItems: 16 },
      gaps: { type: 'array', items: { type: 'string' }, maxItems: 16 },
    },
  };
}

export function buildContentKnowledgeMapModelPrompt(input: {
  buildInput: BuildContentKnowledgeMapInput;
  sources: ContentKnowledgeMapBuildSources;
  seed: ContentKnowledgeMapBuildResult;
}): string {
  return JSON.stringify({
    task: 'generate_content_knowledge_map',
    instructions: [
      '基于真实输入源构建内容知识地图，不编造产品事实、用户原声、功效、价格、测试结果或案例。',
      '先做概念拆解、聚类命名、层级归并和风险校验，再输出卖点、痛点、场景三类矩阵。',
      '所有行只能引用 provided seed.evidence 中已有 evidenceRefs，或 sources 中已有 sourceRefs；证据不足时 status 使用 needs-evidence 或 needs-review。',
      '竞品观察只能转成差异化机会或风险边界，不能作为本品牌事实，相关行必须 needs-review。',
      '输出普通运营可理解的业务词，不输出 Ontology、RDF、schema、node、edge 等工程词。',
    ],
    requestedTitle: input.buildInput.title,
    sources: sourceDigest(input.sources),
    seed: seedDigest(input.seed),
  });
}

export function buildContentKnowledgeMapFromModelOutput(input: {
  buildInput: BuildContentKnowledgeMapInput;
  sources: ContentKnowledgeMapBuildSources;
  seed: ContentKnowledgeMapBuildResult;
  output: ContentKnowledgeMapModelOutput;
  model: string;
}): ContentKnowledgeMapBuildResult {
  const sellingPoints = normalizeModelRows({
    rows: input.output.sellingPoints,
    fallbackRows: input.seed.sellingPoints,
    evidence: input.seed.evidence,
    defaultTag: '卖点',
    limit: 24,
  });
  const painPoints = normalizeModelRows({
    rows: input.output.painPoints,
    fallbackRows: input.seed.painPoints,
    evidence: input.seed.evidence,
    defaultTag: '痛点',
    limit: 24,
  });
  const scenarios = normalizeModelRows({
    rows: input.output.scenarios,
    fallbackRows: input.seed.scenarios,
    evidence: input.seed.evidence,
    defaultTag: '场景',
    limit: 24,
  });
  return {
    ...input.seed,
    title: compactText(input.output.title, input.seed.title),
    sellingPoints,
    painPoints,
    scenarios,
    constraints: uniqueStrings([
      ...normalizeStringArray(input.output.constraints, 16),
      ...input.seed.constraints,
    ], 16),
    gaps: normalizeStringArray(input.output.gaps, 16),
    model: input.model,
  };
}

export function buildContentKnowledgeMapDraft(
  input: BuildContentKnowledgeMapInput,
  sources: ContentKnowledgeMapBuildSources,
): ContentKnowledgeMapBuildResult {
  const selectedInputs = pickRecords(sources.inputSources, input.inputSourceIds);
  const selectedBrands = pickRecords(sources.brandKnowledgeBases, input.brandKnowledgeBaseIds);
  const selectedIps = pickRecords(sources.ipKnowledgeBases, input.ipKnowledgeBaseIds);
  const selectedScenes = pickRecords(sources.sceneCards, input.sceneCardIds);
  const selectedDrafts = pickRecords(sources.promptDrafts, input.promptDraftIds);
  const skuSources = selectedInputs.filter(isSkuSource);
  const skuRows = skuSources.flatMap((source) =>
    parseTableRows(source.extractedText || source.summary).map((row) => ({ source, row })),
  );
  const competitorSources = selectedInputs.filter(isCompetitorSource);
  const feedbackSources = selectedInputs.filter((source) => source.purpose === 'user-feedback');
  const feedbackLines = feedbackSources.flatMap((source) =>
    extractLines(source.extractedText || source.summary, 8).map((line) => ({ source, line })),
  );
  const feedbackEvidence = feedbackLines.map(({ source, line }) => evidenceFromFeedbackLine(source, line));
  const evidence = [
    ...selectedInputs.map(evidenceFromInput),
    ...feedbackEvidence,
    ...selectedBrands.flatMap((record) => [
      ...record.productFacts.slice(0, 4).map((claim) => evidenceFromBrand(record, claim)),
      ...record.coreSellingPoints.slice(0, 6).map((claim) => evidenceFromBrand(record, claim)),
    ]),
    ...selectedIps.flatMap((record) => [
      evidenceFromIp(record, '身份', record.layers.identity),
      evidenceFromIp(record, '价值观', record.layers.values),
      evidenceFromIp(record, '语言规则', record.layers.language),
      evidenceFromIp(record, '判断方法', record.layers.methodology),
      evidenceFromIp(record, '故事素材', record.layers.materials),
      evidenceFromIp(record, '创作引擎', record.layers.engine),
    ].filter((item) => item.excerpt && !/待补齐/.test(item.excerpt))),
    ...selectedScenes.slice(0, 12).map(evidenceFromScene),
  ];
  const evidenceBySource = new Map<string, string[]>();
  for (const item of evidence) {
    const ref = sourceRef(item.sourceType, item.sourceId);
    evidenceBySource.set(ref, [...(evidenceBySource.get(ref) ?? []), item.id]);
  }
  const feedbackEvidenceByLine = new Map<string, string[]>();
  feedbackEvidence.forEach((item) => {
    if (!item.sourceId) return;
    const key = feedbackLineKey(item.sourceId, item.excerpt);
    feedbackEvidenceByLine.set(key, [...(feedbackEvidenceByLine.get(key) ?? []), item.id]);
  });

  const sellingPoints = dedupeRows([
    ...selectedBrands.flatMap((record) =>
      record.coreSellingPoints.map((point) =>
      rowFromItem({
        title: point,
        summary: `${record.title}：${point}`,
        tags: ['卖点', '品牌资料'],
        dimensions: { audiences: [record.audience] },
        sourceRefs: [sourceRef('brand-knowledge-base', record.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('brand-knowledge-base', record.id)),
        confidence: record.status === 'ready' ? 86 : 62,
        }),
      ),
    ),
    ...selectedScenes.map((scene) =>
      rowFromItem({
        title: scene.sellingPoint,
        summary: [scene.audience, scene.usageScene, scene.voiceoverDirection].filter(Boolean).join(' / '),
        tags: ['场景卖点', scene.audience],
        dimensions: {
          audiences: [scene.audience],
          contentFormats: ['图片', '短视频'],
          useCases: [scene.usageScene],
        },
        sourceRefs: [sourceRef('scene-card', scene.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('scene-card', scene.id)),
        confidence: 76,
      }),
    ),
    ...selectedInputs
      .filter((source) => ['product-brief', 'brand-kb'].includes(source.purpose))
      .flatMap((source) => extractLines(source.extractedText || source.summary, 4).map((line) =>
        rowFromItem({
        title: line,
        summary: `${source.title}：${line}`,
        tags: ['输入源', source.purpose],
        dimensions: sourceDimensionHints(source),
        sourceRefs: [sourceRef('input-source', source.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('input-source', source.id)),
        confidence: source.status === 'converted' ? 70 : 42,
        }),
      )),
    ...skuRows.map(({ source, row }) =>
      rowFromItem({
        title: `SKU：${titleFromSkuRow(row, source.title)}`,
        summary: summarizeTableRow(row),
        tags: uniqueStrings(['SKU矩阵', row['适用场景'], row['价格'], row['价格带'], row['人群']], 6),
        dimensions: skuDimensions(row, source),
        sourceRefs: [sourceRef('input-source', source.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('input-source', source.id)),
        confidence: source.status === 'converted' ? 78 : 48,
      }),
    ),
    ...selectedIps.flatMap((record) => [
      rowFromItem({
        title: `${record.title}：核心立场`,
        summary: uniqueStrings([record.layers.identity, record.layers.values, record.layers.methodology], 3).join(' / '),
        tags: ['IP立场', '表达边界'],
        dimensions: { contentFormats: record.extensionScenes },
        sourceRefs: [sourceRef('ip-knowledge-base', record.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('ip-knowledge-base', record.id)),
        confidence: record.status === 'ready' ? Math.max(62, record.completeness) : 48,
        status: record.status === 'ready' && record.completeness >= 70 ? 'ready' : 'needs-review',
      }),
      rowFromItem({
        title: `${record.title}：语言规则`,
        summary: record.layers.language,
        tags: ['IP语言', '口播规则'],
        dimensions: { contentFormats: record.extensionScenes },
        sourceRefs: [sourceRef('ip-knowledge-base', record.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('ip-knowledge-base', record.id)),
        confidence: record.status === 'ready' ? Math.max(62, record.completeness) : 48,
        status: record.status === 'ready' && record.completeness >= 70 ? 'ready' : 'needs-review',
      }),
    ]),
    ...competitorSources.flatMap((source) => extractLines(source.extractedText || source.summary, 4).map((line) =>
      rowFromItem({
        title: `差异化机会：${line}`,
        summary: `${source.title}：${line}`,
        tags: ['竞品观察', '差异化机会', '需人工确认'],
        dimensions: sourceDimensionHints(source),
        sourceRefs: [sourceRef('input-source', source.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('input-source', source.id)),
        confidence: 54,
        status: 'needs-review',
      }),
    )),
  ], 16);

  const painPoints = dedupeRows([
    ...selectedInputs
      .filter((source) => source.purpose === 'user-feedback')
      .flatMap((source) => extractLines(source.extractedText || source.summary, 8).map((line) =>
        rowFromItem({
        title: line,
        summary: `${source.title}：${line}`,
        tags: ['评论痛点', '用户原声'],
        dimensions: sourceDimensionHints(source),
        sourceRefs: [sourceRef('input-source', source.id)],
        evidenceRefs: feedbackEvidenceByLine.get(feedbackLineKey(source.id, line)) ?? evidenceBySource.get(sourceRef('input-source', source.id)),
        confidence: source.status === 'converted' ? 82 : 48,
        }),
      )),
    ...selectedScenes.map((scene) =>
      rowFromItem({
        title: scene.painPoint,
        summary: `${scene.audience} / ${scene.usageScene}`,
        tags: ['场景痛点', scene.audience],
        dimensions: {
          audiences: [scene.audience],
          contentFormats: ['图片', '短视频'],
          useCases: [scene.usageScene],
        },
        sourceRefs: [sourceRef('scene-card', scene.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('scene-card', scene.id)),
        confidence: 74,
      }),
    ),
    ...competitorSources.flatMap((source) => extractLines(source.extractedText || source.summary, 4).map((line) =>
      rowFromItem({
        title: `竞品反馈模式：${line}`,
        summary: `${source.title} 中观察到的用户异议或内容机会，不能作为本品牌事实证据。`,
        tags: ['竞品观察', '异议模式', '需审核'],
        dimensions: sourceDimensionHints(source),
        sourceRefs: [sourceRef('input-source', source.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('input-source', source.id)),
        confidence: 52,
        status: 'needs-review',
      }),
    )),
  ], 14);

  const scenarios = dedupeRows([
    ...skuRows.map(({ source, row }) =>
      rowFromItem({
        title: `SKU 场景：${titleFromSkuRow(row, source.title)}`,
        summary: summarizeTableRow(row),
        tags: uniqueStrings(['SKU场景', row['适用场景'], row['人群'], row['渠道']], 6),
        dimensions: skuDimensions(row, source),
        sourceRefs: [sourceRef('input-source', source.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('input-source', source.id)),
        confidence: source.status === 'converted' ? 76 : 46,
      }),
    ),
    ...selectedScenes.map((scene) =>
      rowFromItem({
        title: scene.title,
        summary: [scene.audience, scene.usageScene, scene.visualComposition, scene.voiceoverDirection].filter(Boolean).join(' / '),
        tags: ['场景卡', scene.audience],
        dimensions: {
          audiences: [scene.audience],
          contentFormats: ['图片', '短视频'],
          useCases: [scene.usageScene],
        },
        sourceRefs: [sourceRef('scene-card', scene.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('scene-card', scene.id)),
        confidence: 84,
      }),
    ),
    ...selectedBrands.flatMap((record) =>
      record.sceneSeeds.map((seed) =>
        rowFromItem({
        title: seed,
        summary: `${record.title} 场景种子`,
        tags: ['场景种子'],
        dimensions: { audiences: [record.audience], useCases: [seed] },
        sourceRefs: [sourceRef('brand-knowledge-base', record.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('brand-knowledge-base', record.id)),
        confidence: 68,
        }),
      ),
    ),
    ...selectedIps.flatMap((record) =>
      record.extensionScenes.map((scene) =>
        rowFromItem({
        title: `${record.title} / ${scene}`,
        summary: `基于同一 IP 知识库延伸到 ${scene}，形式可变，但身份、观点和语言规则不能漂移。`,
        tags: ['IP场景', scene],
        dimensions: { contentFormats: [scene] },
        sourceRefs: [sourceRef('ip-knowledge-base', record.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('ip-knowledge-base', record.id)),
        confidence: record.status === 'ready' ? Math.max(62, record.completeness) : 48,
          status: record.status === 'ready' && record.completeness >= 70 ? 'ready' : 'needs-review',
        }),
      ),
    ),
    ...competitorSources.flatMap((source) => extractLines(source.extractedText || source.summary, 3).map((line) =>
      rowFromItem({
        title: `竞品内容结构参考：${line}`,
        summary: '只用于识别结构、证据类型和差异化机会，不复制对方文案、包装、Logo 或可识别创意。',
        tags: ['竞品结构', '不可搬运'],
        dimensions: sourceDimensionHints(source),
        sourceRefs: [sourceRef('input-source', source.id)],
        evidenceRefs: evidenceBySource.get(sourceRef('input-source', source.id)),
        confidence: 50,
        status: 'needs-review',
      }),
    )),
  ], 16);

  const constraints = uniqueStrings([
    ...selectedBrands.flatMap((record) => record.complianceBoundaries),
    ...selectedIps.flatMap((record) => [
      record.layers.language ? `IP 语言规则：${record.layers.language}` : '',
      record.layers.values ? `IP 核心立场不能漂移：${record.layers.values}` : '',
      record.missingLayers.length ? `IP 知识库缺口：${record.missingLayers.join('、')}` : '',
    ]),
    competitorSources.length ? '竞品观察只允许用于结构、证据类型和差异化机会，不能作为本品牌事实证据。' : '',
    competitorSources.length ? '禁止复制竞品 Logo、包装、文案、人物肖像或可识别创意元素。' : '',
    ...selectedInputs.filter((source) => source.tags.some((tag) => /合规|禁用|边界/.test(tag))).map((source) => source.summary),
    '涉及功效、效果、对比和背书时必须回到证据来源。',
    '未进入审核的卖点只允许作为草稿，不进入发布交接。',
  ], 12);

  return {
    title: compactText(input.title, `${selectedBrands[0]?.title ?? selectedInputs[0]?.title ?? '内容项目'} 知识地图`),
    sourceInputSourceIds: selectedInputs.map((source) => source.id),
    brandKnowledgeBaseIds: selectedBrands.map((record) => record.id),
    ipKnowledgeBaseIds: selectedIps.map((record) => record.id),
    sceneCardIds: selectedScenes.map((scene) => scene.id),
    promptDraftIds: selectedDrafts.map((draft) => draft.id),
    sellingPoints,
    painPoints,
    scenarios,
    evidence,
    constraints,
    model: 'local-rule',
    skuRowCount: skuRows.length,
    competitorObservationCount: competitorSources.length,
  };
}
