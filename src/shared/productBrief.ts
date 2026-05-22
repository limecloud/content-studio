import type { InputSourceKind, InputSourcePurpose } from './types';

export interface ProductBriefSourceLike {
  id: string;
  kind: InputSourceKind;
  purpose: InputSourcePurpose;
  title: string;
  tags: string[];
  summary?: string;
  extractedText?: string;
}

export interface StructuredProductBrief {
  sourceIds: string[];
  sourceTitles: string[];
  productName: string;
  sellingPoints: string[];
  specs: string[];
  scenarios: string[];
  restrictions: string[];
  skuRows: Array<Record<string, string>>;
  missingFields: string[];
  variableTable: string;
}

export type ProductBriefPromptType = 'main-image' | 'selling-point-image' | 'detail-page-section';

export interface ProductBriefPromptPlanItem {
  type: ProductBriefPromptType;
  label: string;
  title: string;
  prompt: string;
  sourceIds: string[];
  skuTrace: string;
  productName: string;
  sellingPoint: string;
  scenario: string;
  restrictions: string;
}

const PRODUCT_NAME_RE = /^(产品名称|产品名|品名|商品名称|商品名|名称|Product(?:\s*Name)?)\s*[:：]\s*(.+)$/i;
const SELLING_POINT_RE = /^(卖点|核心卖点|优势|亮点|特点|功效|价值)\s*[:：]\s*(.+)$/i;
const SPEC_RE = /^(规格|参数|成分|容量|尺寸|价格|型号|货号|SKU|sku)\s*[:：]\s*(.+)$/i;
const SCENARIO_RE = /^(适用场景|使用场景|场景|适用人群|目标人群|人群|痛点|需求)\s*[:：]\s*(.+)$/i;
const RESTRICTION_RE = /^(禁用表达|禁止|不得|不要|避免|合规|边界|风险|不能)\s*[:：]\s*(.+)$/i;
const RESTRICTION_TEXT_RE = /(禁用|禁止|不得|不要|避免|不承诺|不能|合规|边界|风险)/;

function normalizeText(value?: string): string {
  return (value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function unique(items: string[], limit = 12): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function productSourceText(source: ProductBriefSourceLike): string {
  const body = source.extractedText || source.summary;
  return normalizeText([source.title, body].filter(Boolean).join('\n'));
}

function isProductBriefSource(source: ProductBriefSourceLike): boolean {
  if (source.purpose === 'product-brief' || source.kind === 'sku-table') return true;
  return source.tags.some((tag) => /sku|产品资料|brief|卖点|规格/i.test(tag));
}

function linesFromSources(sources: ProductBriefSourceLike[]): string[] {
  return sources
    .flatMap((source) => productSourceText(source).split('\n'))
    .map((line) => line.replace(/^[-*#\d.\s]+/, '').trim())
    .filter(Boolean);
}

function collectMatches(lines: string[], pattern: RegExp): string[] {
  return unique(lines.map((line) => line.match(pattern)?.[2] ?? ''));
}

function firstMatch(lines: string[], pattern: RegExp): string {
  return collectMatches(lines, pattern)[0] ?? '';
}

function collectRestrictionLines(lines: string[]): string[] {
  return unique([
    ...collectMatches(lines, RESTRICTION_RE),
    ...lines.filter((line) => RESTRICTION_TEXT_RE.test(line)),
  ], 16);
}

function splitDelimitedLine(line: string): string[] {
  const delimiter = line.includes('\t') ? '\t' : ',';
  return line.split(delimiter).map((cell) => cell.trim()).filter(Boolean);
}

function parseDelimitedSkuRows(lines: string[]): Array<Record<string, string>> {
  const tableLines = lines.filter((line) => line.includes(',') || line.includes('\t'));
  if (tableLines.length < 2) return [];
  for (let index = 0; index < tableLines.length - 1; index += 1) {
    const headers = splitDelimitedLine(tableLines[index]).slice(0, 12);
    const hasSkuHeader = headers.some((header) => /sku|规格|型号|货号|价格|容量|尺寸|颜色|Product|Variant/i.test(header));
    if (headers.length < 2 || !hasSkuHeader) continue;
    const rows = tableLines.slice(index + 1, index + 21).flatMap((line) => {
      const cells = splitDelimitedLine(line);
      if (cells.length < 2) return [];
      return [Object.fromEntries(headers.map((header, cellIndex) => [header, cells[cellIndex] ?? '']))];
    });
    if (rows.length > 0) return rows;
  }
  return [];
}

function parseMarkdownSkuRows(lines: string[]): Array<Record<string, string>> {
  const tableLines = lines.filter((line) => line.trim().startsWith('|') && line.includes('|'));
  if (tableLines.length < 3) return [];
  const headers = tableLines[0].split('|').map((cell) => cell.trim()).filter(Boolean).slice(0, 12);
  if (headers.length < 2) return [];
  return tableLines.slice(2, 22).flatMap((line) => {
    const cells = line.split('|').map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 2) return [];
    return [Object.fromEntries(headers.map((header, index) => [header, cells[index] ?? '']))];
  });
}

function formatVariableTable(brief: Omit<StructuredProductBrief, 'variableTable'>): string {
  const rows = [
    ['产品名称', brief.productName || '待补充'],
    ['卖点', brief.sellingPoints.join('；') || '待补充'],
    ['规格参数', brief.specs.join('；') || '待补充'],
    ['适用场景', brief.scenarios.join('；') || '待补充'],
    ['禁用表达', brief.restrictions.join('；') || '待补充'],
    ['SKU 行数', String(brief.skuRows.length)],
  ];
  return rows.map(([key, value]) => `${key}：${value}`).join('\n');
}

function firstText(items: string[], fallback: string): string {
  return items.map((item) => item.trim()).find(Boolean) ?? fallback;
}

function formatSkuTrace(brief: StructuredProductBrief): string {
  const sku = brief.skuRows[0];
  if (sku) {
    return Object.entries(sku)
      .filter(([, value]) => String(value).trim())
      .slice(0, 6)
      .map(([key, value]) => `${key}=${value}`)
      .join('；');
  }
  return firstText(brief.specs, '未提供 SKU 行');
}

function productPromptBase(brief: StructuredProductBrief) {
  return {
    sourceIds: brief.sourceIds,
    sourceTrace: brief.sourceIds.length ? `已关联 ${brief.sourceIds.length} 份产品资料 / SKU 表` : '待补充产品资料 / SKU 表',
    skuTrace: formatSkuTrace(brief),
    productName: brief.productName || '待补充产品名称',
    sellingPoint: firstText(brief.sellingPoints, '待补充卖点'),
    scenario: firstText(brief.scenarios, '待补充适用场景'),
    restrictions: firstText(brief.restrictions, '待补充禁用表达'),
  };
}

export function buildProductBriefPromptPlan(brief: StructuredProductBrief): ProductBriefPromptPlanItem[] {
  const base = productPromptBase(brief);
  return [
    {
      ...base,
      type: 'main-image',
      label: '主图 Prompt',
      title: `${base.productName} 主图 Prompt`,
      prompt: [
        `产品：${base.productName}`,
        `SKU / 规格：${base.skuTrace}`,
        `画面：电商主图，产品清楚，背景干净，突出 ${base.sellingPoint}`,
        `场景：${base.scenario}`,
        `禁用表达：${base.restrictions}`,
        `追溯资料：${base.sourceTrace}`,
      ].join('\n'),
    },
    {
      ...base,
      type: 'selling-point-image',
      label: '卖点图 Prompt',
      title: `${base.productName} 卖点图 Prompt`,
      prompt: [
        `产品：${base.productName}`,
        `核心卖点：${base.sellingPoint}`,
        `SKU / 规格：${base.skuTrace}`,
        `画面：围绕真实使用动作表达卖点，不堆砌大字报，保留适合平台排版的留白`,
        `场景：${base.scenario}`,
        `禁用表达：${base.restrictions}`,
        `追溯资料：${base.sourceTrace}`,
      ].join('\n'),
    },
    {
      ...base,
      type: 'detail-page-section',
      label: '详情页模块 Prompt',
      title: `${base.productName} 详情页模块 Prompt`,
      prompt: [
        `产品：${base.productName}`,
        `详情页模块：问题场景 -> 产品卖点 -> 规格 / SKU -> 使用边界`,
        `SKU / 规格：${base.skuTrace}`,
        `使用场景：${base.scenario}`,
        `卖点证据：${base.sellingPoint}`,
        `禁用表达：${base.restrictions}`,
        `追溯资料：${base.sourceTrace}`,
      ].join('\n'),
    },
  ];
}

export function structureProductBriefSources(sources: ProductBriefSourceLike[]): StructuredProductBrief {
  const productSources = sources.filter(isProductBriefSource);
  const lines = linesFromSources(productSources);
  const skuRows = [
    ...parseMarkdownSkuRows(lines),
    ...parseDelimitedSkuRows(lines),
  ].slice(0, 20);
  const brief = {
    sourceIds: productSources.map((source) => source.id),
    sourceTitles: productSources.map((source) => source.title),
    productName: firstMatch(lines, PRODUCT_NAME_RE),
    sellingPoints: collectMatches(lines, SELLING_POINT_RE),
    specs: collectMatches(lines, SPEC_RE),
    scenarios: collectMatches(lines, SCENARIO_RE),
    restrictions: collectRestrictionLines(lines),
    skuRows,
    missingFields: [] as string[],
  };
  brief.missingFields = [
    brief.productName ? '' : '产品名称',
    brief.sellingPoints.length ? '' : '卖点',
    brief.specs.length || brief.skuRows.length ? '' : '规格 / SKU',
    brief.scenarios.length ? '' : '适用场景 / 人群',
    brief.restrictions.length ? '' : '禁用表达 / 合规边界',
  ].filter(Boolean);
  return {
    ...brief,
    variableTable: formatVariableTable(brief),
  };
}
