import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  BrandKnowledgeBaseRecord,
  GenerateBrandKnowledgeBaseInput,
  KnowledgeCitation,
} from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { TextGenerationService, TextProviderBlockedError, TextProviderFailedError } from './textGenerationService';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'brand-knowledge-bases.json');
}

function sortRecords(records: BrandKnowledgeBaseRecord[]): BrandKnowledgeBaseRecord[] {
  return [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function compactList(values: string[] | undefined, fallback: string[]): string[] {
  const normalized = (values ?? []).map((value) => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean);
  return (normalized.length ? normalized : fallback).slice(0, 8);
}

function compactText(value: string | undefined, fallback: string): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

const DEFAULT_COMPLIANCE_BOUNDARIES = [
  '不承诺治疗、见效、改善疾病或替代专业建议',
  '不写绝对化收益，不做无依据背书',
];

function complianceList(values: string[] | undefined): string[] {
  const normalized = compactList(values, DEFAULT_COMPLIANCE_BOUNDARIES);
  const text = normalized.join('\n');
  return compactList([
    ...normalized,
    text.includes('治疗') ? '' : DEFAULT_COMPLIANCE_BOUNDARIES[0],
    text.includes('绝对化') ? '' : DEFAULT_COMPLIANCE_BOUNDARIES[1],
  ], DEFAULT_COMPLIANCE_BOUNDARIES);
}

function inferTitle(citations: KnowledgeCitation[], fallback?: string): string {
  if (fallback?.trim()) return fallback.trim();
  const first = citations[0];
  return first ? `${first.title.split(' / ')[0]} 品牌知识库` : '品牌 / 产品知识库';
}

function blockedRecord(input: GenerateBrandKnowledgeBaseInput, reason: string): BrandKnowledgeBaseRecord {
  const productFacts = compactList(
    input.citations.flatMap((citation) => [
      citation.excerpt.slice(0, 120),
    ]),
    ['待补充产品事实'],
  );
  const complianceBoundaries = complianceList(
    input.citations.filter((citation) => citation.sectionType === 'compliance' || citation.sectionType === 'boundary').map((citation) => citation.excerpt),
  );
  const coreSellingPoints = compactList(
    input.citations.filter((citation) => ['product', 'selling-point', 'spec', 'brand'].includes(citation.sectionType)).map((citation) => citation.excerpt),
    ['先讲使用场景，再讲卖点'],
  );
  const sceneSeeds = compactList(
    input.citations.filter((citation) => ['scenario-script', 'qa', 'objection-handling'].includes(citation.sectionType)).map((citation) => citation.excerpt),
    ['早餐后', '办公室抽屉', '家庭场景'],
  );
  const promptFragments = compactList([
    `blocked：${reason}`,
  ], ['真实生活场景、自然光、少字、可读、可复用。']);
  return {
    id: randomUUID(),
    workspacePath: input.workspacePath,
    title: inferTitle(input.citations, input.title),
    status: 'blocked',
    sourceKnowledgeBaseId: input.citations[0]?.knowledgeBaseId,
    sourceCitationIds: input.citations.map((citation) => `${citation.knowledgeBaseId}:${citation.sectionId}`),
    brandVoice: `生成服务未完成：${reason}`,
    audience: '生成服务接通后重新抽取',
    productFacts,
    coreSellingPoints,
    complianceBoundaries,
    sceneSeeds,
    promptFragments,
    model: 'blocked:text-provider',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const BRAND_KB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'brandVoice', 'audience', 'productFacts', 'coreSellingPoints', 'complianceBoundaries', 'sceneSeeds', 'promptFragments'],
  properties: {
    title: { type: 'string' },
    brandVoice: { type: 'string' },
    audience: { type: 'string' },
    productFacts: { type: 'array', items: { type: 'string' } },
    coreSellingPoints: { type: 'array', items: { type: 'string' } },
    complianceBoundaries: { type: 'array', items: { type: 'string' } },
    sceneSeeds: { type: 'array', items: { type: 'string' } },
    promptFragments: { type: 'array', items: { type: 'string' } },
  },
};

interface BrandKnowledgeBaseModelOutput {
  title: string;
  brandVoice: string;
  audience: string;
  productFacts: string[];
  coreSellingPoints: string[];
  complianceBoundaries: string[];
  sceneSeeds: string[];
  promptFragments: string[];
}

export class BrandKnowledgeBaseStore {
  constructor(private readonly text: TextGenerationService) {}

  async list(workspacePath: string): Promise<BrandKnowledgeBaseRecord[]> {
    const records = await readJsonFile<BrandKnowledgeBaseRecord[]>(filePathFor(workspacePath), []);
    return sortRecords(records);
  }

  async generate(input: GenerateBrandKnowledgeBaseInput): Promise<BrandKnowledgeBaseRecord> {
    if (input.citations.length === 0) throw new Error('生成品牌知识库至少需要 1 条知识引用。');
    const now = new Date().toISOString();
    try {
      const result = await this.text.generateJson<BrandKnowledgeBaseModelOutput>({
        workspacePath: input.workspacePath,
        systemPrompt: '你是品牌知识库抽取 Agent。你必须只基于知识引用，提炼品牌知识库，不编造卖点、功效或背书。',
        prompt: JSON.stringify({
          task: 'generate_brand_knowledge_base',
          title: input.title ?? '',
          citations: input.citations.map((citation, index) => ({
            index: index + 1,
            title: citation.title,
            sectionType: citation.sectionType,
            excerpt: citation.excerpt,
          })),
        }, null, 2),
        schema: BRAND_KB_SCHEMA,
        maxTurns: 2,
      });
      const value = result.value;
      const record: BrandKnowledgeBaseRecord = {
        id: randomUUID(),
        workspacePath: input.workspacePath,
        title: compactText(value.title || input.title, inferTitle(input.citations)),
        status: 'ready',
        sourceKnowledgeBaseId: input.citations[0]?.knowledgeBaseId,
        sourceCitationIds: input.citations.map((citation) => `${citation.knowledgeBaseId}:${citation.sectionId}`),
        brandVoice: compactText(value.brandVoice, '表达要克制、可信、先场景后卖点。'),
        audience: compactText(value.audience, '目标用户待补齐'),
        productFacts: compactList(value.productFacts, ['待补充产品事实']),
        coreSellingPoints: compactList(value.coreSellingPoints, ['先讲使用场景，再讲卖点']),
        complianceBoundaries: complianceList(value.complianceBoundaries),
        sceneSeeds: compactList(value.sceneSeeds, ['早餐后', '办公室抽屉', '家庭场景']),
        promptFragments: compactList(value.promptFragments, ['真实生活场景、自然光、少字、可读、可复用。']),
        model: result.model,
        createdAt: now,
        updatedAt: now,
      };
      return updateJsonFile<BrandKnowledgeBaseRecord[], BrandKnowledgeBaseRecord>(
        filePathFor(input.workspacePath),
        [],
        (records) => ({
          value: [record, ...sortRecords(records)].slice(0, 80),
          result: record,
        }),
      );
    } catch (error) {
      const reason = error instanceof TextProviderBlockedError
        ? error.message
        : error instanceof TextProviderFailedError
          ? `文字模型生成失败：${error.message}`
          : `文字模型生成异常：${error instanceof Error ? error.message : String(error)}`;
      const record = blockedRecord(input, reason);
      record.createdAt = now;
      record.updatedAt = now;
      return updateJsonFile<BrandKnowledgeBaseRecord[], BrandKnowledgeBaseRecord>(
        filePathFor(input.workspacePath),
        [],
        (records) => ({
          value: [record, ...sortRecords(records)].slice(0, 80),
          result: record,
        }),
      );
    }
  }

  async update(input: BrandKnowledgeBaseRecord): Promise<BrandKnowledgeBaseRecord> {
    return updateJsonFile<BrandKnowledgeBaseRecord[], BrandKnowledgeBaseRecord>(
      filePathFor(input.workspacePath),
      [],
      (current) => {
        const records = sortRecords(current);
        if (!records.some((record) => record.id === input.id)) throw new Error(`品牌知识库不存在: ${input.id}`);
        const updated: BrandKnowledgeBaseRecord = { ...input, updatedAt: new Date().toISOString() };
        return {
          value: records.map((record) => (record.id === input.id ? updated : record)),
          result: updated,
        };
      },
    );
  }
}
