import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  GenerateIpKnowledgeBaseInput,
  IpKnowledgeBaseLayers,
  IpKnowledgeBaseRecord,
  KnowledgeCitation,
} from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { TextGenerationService, TextProviderBlockedError, TextProviderFailedError } from './textGenerationService';

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'ip-knowledge-bases.json');
}

function sortRecords(records: IpKnowledgeBaseRecord[]): IpKnowledgeBaseRecord[] {
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

function blockedRecord(input: GenerateIpKnowledgeBaseInput, reason: string): IpKnowledgeBaseRecord {
  const layers: IpKnowledgeBaseLayers = {
    identity: `生成服务未完成：${reason}`,
    values: '生成服务接通后重新抽取',
    language: '生成服务接通后重新抽取',
    methodology: '生成服务接通后重新抽取',
    materials: '生成服务接通后重新抽取',
    engine: '生成服务接通后重新抽取',
  };
  return {
    id: randomUUID(),
    workspacePath: input.workspacePath,
    title: inferTitle(input.citations, input.title),
    status: 'blocked',
    sourceKnowledgeBaseId: input.citations[0]?.knowledgeBaseId,
    sourceCitationIds: input.citations.map((citation) => `${citation.knowledgeBaseId}:${citation.sectionId}`),
    layers,
    missingLayers: Object.entries(layers).filter(([, value]) => /待补齐/.test(value)).map(([key]) => key),
    completeness: completeness(layers),
    extensionScenes: compactList(
      input.citations.filter((citation) => ['scenario-script', 'qa', 'story'].includes(citation.sectionType)).map((citation) => citation.excerpt),
      ['口播', '朋友圈', '私域回复'],
    ),
    model: 'blocked:text-provider',
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
    return sortRecords(records);
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
      return updateJsonFile<IpKnowledgeBaseRecord[], IpKnowledgeBaseRecord>(
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
      return updateJsonFile<IpKnowledgeBaseRecord[], IpKnowledgeBaseRecord>(
        filePathFor(input.workspacePath),
        [],
        (records) => ({
          value: [record, ...sortRecords(records)].slice(0, 80),
          result: record,
        }),
      );
    }
  }

  async update(input: IpKnowledgeBaseRecord): Promise<IpKnowledgeBaseRecord> {
    return updateJsonFile<IpKnowledgeBaseRecord[], IpKnowledgeBaseRecord>(
      filePathFor(input.workspacePath),
      [],
      (current) => {
        const records = sortRecords(current);
        if (!records.some((record) => record.id === input.id)) throw new Error(`IP 知识库不存在: ${input.id}`);
        const updated: IpKnowledgeBaseRecord = { ...input, updatedAt: new Date().toISOString() };
        return {
          value: records.map((record) => (record.id === input.id ? updated : record)),
          result: updated,
        };
      },
    );
  }
}
