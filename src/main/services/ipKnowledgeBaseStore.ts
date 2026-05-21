import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  GenerateIpKnowledgeBaseInput,
  IpKnowledgeBaseLayers,
  IpKnowledgeBaseRecord,
  KnowledgeCitation,
} from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { TextGenerationService, TextProviderBlockedError, TextProviderFailedError } from './textGenerationService';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'ip-knowledge-bases.json');
}

function compactList(values: string[] | undefined, fallback: string[]): string[] {
  const normalized = (values ?? []).map((value) => String(value).replace(/\s+/g, ' ').trim()).filter(Boolean);
  return (normalized.length ? normalized : fallback).slice(0, 8);
}

function compactText(value: string | undefined, fallback: string): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function inferTitle(citations: KnowledgeCitation[], fallback?: string): string {
  if (fallback?.trim()) return fallback.trim();
  const first = citations[0];
  return first ? `${first.title.split(' / ')[0]} IP 知识库` : '个人 IP 知识库';
}

function completeness(layers: IpKnowledgeBaseLayers): number {
  const values = Object.values(layers);
  const filled = values.filter((value) => String(value).trim().length > 0).length;
  return Math.round((filled / values.length) * 100);
}

function localRecord(input: GenerateIpKnowledgeBaseInput, reason?: string): IpKnowledgeBaseRecord {
  const layers: IpKnowledgeBaseLayers = {
    identity: compactText(undefined, '身份待补齐'),
    values: compactText(undefined, '价值观待补齐'),
    language: compactText(undefined, '语言风格待补齐'),
    methodology: compactText(undefined, '判断方法待补齐'),
    materials: compactText(undefined, '素材故事待补齐'),
    engine: compactText(undefined, '创作引擎待补齐'),
  };
  return {
    id: randomUUID(),
    workspacePath: input.workspacePath,
    title: inferTitle(input.citations, input.title),
    status: reason ? 'draft' : 'ready',
    sourceKnowledgeBaseId: input.citations[0]?.knowledgeBaseId,
    sourceCitationIds: input.citations.map((citation) => `${citation.knowledgeBaseId}:${citation.sectionId}`),
    layers,
    missingLayers: Object.entries(layers).filter(([, value]) => /待补齐/.test(value)).map(([key]) => key),
    completeness: completeness(layers),
    extensionScenes: compactList(
      input.citations.filter((citation) => ['scenario-script', 'qa', 'story'].includes(citation.sectionType)).map((citation) => citation.excerpt),
      ['口播', '朋友圈', '私域回复'],
    ),
    model: reason ? 'fallback:local-rule' : 'local-rule',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

const IP_KB_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'layers', 'extensionScenes'],
  properties: {
    title: { type: 'string' },
    layers: {
      type: 'object',
      additionalProperties: false,
      required: ['identity', 'values', 'language', 'methodology', 'materials', 'engine'],
      properties: {
        identity: { type: 'string' },
        values: { type: 'string' },
        language: { type: 'string' },
        methodology: { type: 'string' },
        materials: { type: 'string' },
        engine: { type: 'string' },
      },
    },
    extensionScenes: { type: 'array', items: { type: 'string' } },
    missingLayers: { type: 'array', items: { type: 'string' } },
  },
};

interface IpKnowledgeBaseModelOutput {
  title: string;
  layers: IpKnowledgeBaseLayers;
  extensionScenes: string[];
  missingLayers?: string[];
}

export class IpKnowledgeBaseStore {
  constructor(private readonly text: TextGenerationService) {}

  async list(workspacePath: string): Promise<IpKnowledgeBaseRecord[]> {
    const records = await readJsonFile<IpKnowledgeBaseRecord[]>(filePathFor(workspacePath), []);
    return records.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async generate(input: GenerateIpKnowledgeBaseInput): Promise<IpKnowledgeBaseRecord> {
    if (input.citations.length === 0) throw new Error('生成 IP 知识库至少需要 1 条知识引用。');
    const now = new Date().toISOString();
    try {
      const result = await this.text.generateJson<IpKnowledgeBaseModelOutput>({
        workspacePath: input.workspacePath,
        systemPrompt: '你是 IP 知识库抽取 Agent。你必须只基于知识引用，抽取身份、价值观、语言、判断方法、素材和创作引擎六层，不编造人设。',
        prompt: JSON.stringify({
          task: 'generate_ip_knowledge_base',
          title: input.title ?? '',
          citations: input.citations.map((citation, index) => ({
            index: index + 1,
            title: citation.title,
            sectionType: citation.sectionType,
            excerpt: citation.excerpt,
          })),
        }, null, 2),
        schema: IP_KB_SCHEMA,
        maxTurns: 2,
      });
      const layers = {
        identity: compactText(result.value.layers.identity, '身份待补齐'),
        values: compactText(result.value.layers.values, '价值观待补齐'),
        language: compactText(result.value.layers.language, '语言风格待补齐'),
        methodology: compactText(result.value.layers.methodology, '判断方法待补齐'),
        materials: compactText(result.value.layers.materials, '素材故事待补齐'),
        engine: compactText(result.value.layers.engine, '创作引擎待补齐'),
      } satisfies IpKnowledgeBaseLayers;
      const record: IpKnowledgeBaseRecord = {
        id: randomUUID(),
        workspacePath: input.workspacePath,
        title: compactText(result.value.title || input.title, inferTitle(input.citations)),
        status: 'ready',
        sourceKnowledgeBaseId: input.citations[0]?.knowledgeBaseId,
        sourceCitationIds: input.citations.map((citation) => `${citation.knowledgeBaseId}:${citation.sectionId}`),
        layers,
        missingLayers: (result.value.missingLayers ?? []).map((item) => String(item).trim()).filter(Boolean),
        completeness: completeness(layers),
        extensionScenes: compactList(result.value.extensionScenes, ['口播', '朋友圈', '私域回复']),
        model: result.model,
        createdAt: now,
        updatedAt: now,
      };
      const existing = await this.list(input.workspacePath);
      await writeJsonFile(filePathFor(input.workspacePath), [record, ...existing].slice(0, 80));
      return record;
    } catch (error) {
      const reason = error instanceof TextProviderBlockedError
        ? error.message
        : error instanceof TextProviderFailedError
          ? `文字模型生成失败：${error.message}`
          : `文字模型生成异常：${error instanceof Error ? error.message : String(error)}`;
      const record = localRecord(input, reason);
      record.createdAt = now;
      record.updatedAt = now;
      const existing = await this.list(input.workspacePath);
      await writeJsonFile(filePathFor(input.workspacePath), [record, ...existing].slice(0, 80));
      return record;
    }
  }

  async update(input: IpKnowledgeBaseRecord): Promise<IpKnowledgeBaseRecord> {
    const records = await this.list(input.workspacePath);
    if (!records.some((record) => record.id === input.id)) throw new Error(`IP 知识库不存在: ${input.id}`);
    const updated: IpKnowledgeBaseRecord = { ...input, updatedAt: new Date().toISOString() };
    await writeJsonFile(filePathFor(input.workspacePath), records.map((record) => (record.id === input.id ? updated : record)));
    return updated;
  }
}
