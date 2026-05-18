import { randomUUID } from 'node:crypto';
import { existsSync, readdirSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, extname, join, parse } from 'node:path';
import { XMLParser } from 'fast-xml-parser';
import * as yauzl from 'yauzl';
import type {
  KnowledgeBaseSource,
  KnowledgeBaseType,
  KnowledgeBaseView,
  KnowledgeSearchInput,
  KnowledgeSearchResult,
  KnowledgeSection,
  KnowledgeSectionType,
} from '../../shared/types';
import { getResourcesRoot, getWorkspaceKnowledgeDir } from './paths';

const SECTION_TYPES: Array<{ type: KnowledgeSectionType; keywords: string[] }> = [
  { type: 'compliance', keywords: ['合规', '红线', '禁忌', '不可', '风险', '边界'] },
  { type: 'science', keywords: ['科学', '研究', '机理', '文献', '实验', '循证'] },
  { type: 'brand', keywords: ['品牌', '定位', '理念', '主张', '价值'] },
  { type: 'product', keywords: ['产品', '成分', '配方', '规格', '卖点'] },
  { type: 'selling-point', keywords: ['卖点', '优势', '亮点', '利益点'] },
  { type: 'scenario-script', keywords: ['场景', '脚本', '话术', '种草', '口播'] },
  { type: 'objection-handling', keywords: ['异议', '反驳', '顾虑', '差评', '问题处理'] },
  { type: 'qa', keywords: ['问答', 'Q&A', 'FAQ', '问题'] },
  { type: 'spec', keywords: ['规格', '参数', '用法', '价格', '包装'] },
  { type: 'profile', keywords: ['人物', '档案', '个人', 'IP', '简介'] },
  { type: 'timeline', keywords: ['履历', '时间线', '经历', '年表'] },
  { type: 'story', keywords: ['故事', '案例', '转折', '经历'] },
  { type: 'methodology', keywords: ['方法论', '模型', '体系', '原则'] },
  { type: 'quote', keywords: ['金句', '表达', '观点', '语录'] },
  { type: 'voice-style', keywords: ['风格', '口吻', '语气', '写作'] },
  { type: 'boundary', keywords: ['禁忌', '边界', '不能说', '不建议'] },
];

function builtinDir(): string {
  return join(getResourcesRoot(), 'knowledge-bases');
}

function slugFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(extname(name).toLowerCase(), '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || `kb-${randomUUID().slice(0, 8)}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function excerpt(text: string, maxLength = 180): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength)}...` : normalized;
}

function detectBaseType(text: string, fileName = ''): KnowledgeBaseType {
  const haystack = `${fileName}\n${text}`;
  return /个人\s*IP|人物|履历|金句|方法论|写作风格|创始人|专家/.test(haystack) ? 'personal-ip-kb' : 'product-kb';
}

function detectSectionType(title: string, content: string, baseType: KnowledgeBaseType): KnowledgeSectionType {
  const haystack = `${title}\n${content}`;
  const matched = SECTION_TYPES.find((item) => item.keywords.some((keyword) => haystack.includes(keyword)));
  if (matched) return matched.type;
  return baseType === 'personal-ip-kb' ? 'profile' : 'product';
}

function inferTags(title: string, content: string, type: KnowledgeSectionType): string[] {
  const candidates = SECTION_TYPES.flatMap((item) => item.keywords).filter((keyword) => `${title}\n${content}`.includes(keyword));
  return unique([type, ...candidates]).slice(0, 8);
}

function normalizeSection(raw: Partial<KnowledgeSection>, index: number, baseType: KnowledgeBaseType): KnowledgeSection {
  const title = raw.title?.trim() || `知识片段 ${index + 1}`;
  const content = raw.content?.trim() || raw.summary?.trim() || '';
  const sectionType = raw.sectionType ?? detectSectionType(title, content, baseType);
  return {
    id: raw.id?.trim() || `${sectionType}-${index + 1}`,
    title,
    sectionType,
    tags: raw.tags?.length ? unique(raw.tags) : inferTags(title, content, sectionType),
    summary: raw.summary?.trim() || excerpt(content, 96),
    content,
  };
}

function normalizeKnowledgeBase(raw: Partial<KnowledgeBaseView>, source: KnowledgeBaseSource, sourcePath?: string): KnowledgeBaseView {
  const now = new Date().toISOString();
  const sectionText = JSON.stringify(raw.sections ?? []);
  const baseType = raw.baseType ?? detectBaseType(`${raw.title ?? ''}\n${raw.description ?? ''}\n${sectionText}`, sourcePath);
  const sections = (raw.sections ?? []).map((section, index) => normalizeSection(section, index, baseType)).filter((section) => section.content);
  return {
    id: raw.id?.trim() || slugFromName(sourcePath ? basename(sourcePath) : `knowledge-${randomUUID().slice(0, 8)}.json`),
    source,
    baseType,
    title: raw.title?.trim() || parse(sourcePath ?? '').name || '未命名知识库',
    description: raw.description?.trim() || (baseType === 'personal-ip-kb' ? '个人 IP 型成型知识库' : '产品型成型知识库'),
    sourcePath,
    sections,
    tags: raw.tags?.length ? unique(raw.tags) : unique(sections.flatMap((section) => section.tags)).slice(0, 12),
    createdAt: raw.createdAt ?? now,
    updatedAt: raw.updatedAt ?? now,
  };
}

function buildSectionsFromText(text: string, baseType: KnowledgeBaseType): KnowledgeSection[] {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const chunks: Array<{ title: string; content: string[] }> = [];
  let current: { title: string; content: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    const heading = /^(#{1,4}\s+|[一二三四五六七八九十0-9]+[、.．]\s*)/.test(trimmed) || (trimmed.length <= 36 && /[:：]$/.test(trimmed));
    if (heading) {
      if (current && current.content.join('\n').trim()) chunks.push(current);
      current = { title: trimmed.replace(/^#{1,4}\s+/, '').replace(/[:：]$/, ''), content: [] };
    } else if (trimmed) {
      if (!current) current = { title: baseType === 'personal-ip-kb' ? '个人 IP 总览' : '产品知识总览', content: [] };
      current.content.push(trimmed);
    }
  }
  if (current && current.content.join('\n').trim()) chunks.push(current);

  const fallbackChunks = chunks.length ? chunks : [{ title: '知识库全文', content: [text] }];
  return fallbackChunks.flatMap((chunk, chunkIndex) => {
    const content = chunk.content.join('\n');
    if (content.length <= 1600) return [normalizeSection({ title: chunk.title, content }, chunkIndex, baseType)];
    const parts = content.match(/[\s\S]{1,1400}(?:\n|$)/g) ?? [content];
    return parts.map((part, partIndex) => normalizeSection({ title: `${chunk.title} ${partIndex + 1}`, content: part }, chunkIndex * 10 + partIndex, baseType));
  });
}

function collectXmlText(node: unknown, output: string[]): void {
  if (typeof node === 'string' || typeof node === 'number') {
    output.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((item) => collectXmlText(item, output));
    return;
  }
  if (!node || typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'w:t' || key.endsWith(':t')) {
      collectXmlText(value, output);
    } else {
      collectXmlText(value, output);
    }
  }
}

async function readDocxEntry(filePath: string, entryName: string): Promise<string> {
  return new Promise((resolve, reject) => {
    yauzl.open(filePath, { lazyEntries: true }, (openError, zipFile) => {
      if (openError || !zipFile) {
        reject(openError ?? new Error('无法打开 DOCX 文件'));
        return;
      }
      let settled = false;
      zipFile.readEntry();
      zipFile.on('entry', (entry) => {
        if (entry.fileName !== entryName) {
          zipFile.readEntry();
          return;
        }
        zipFile.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) {
            settled = true;
            zipFile.close();
            reject(streamError ?? new Error('无法读取 DOCX 内容'));
            return;
          }
          const chunks: Buffer[] = [];
          stream.on('data', (chunk: Buffer) => chunks.push(chunk));
          stream.on('end', () => {
            settled = true;
            zipFile.close();
            resolve(Buffer.concat(chunks).toString('utf-8'));
          });
          stream.on('error', (error) => {
            settled = true;
            zipFile.close();
            reject(error);
          });
        });
      });
      zipFile.on('end', () => {
        if (!settled) reject(new Error(`DOCX 缺少 ${entryName}`));
      });
      zipFile.on('error', reject);
    });
  });
}

async function extractDocxText(filePath: string): Promise<string> {
  const xml = await readDocxEntry(filePath, 'word/document.xml');
  const parser = new XMLParser({ ignoreAttributes: false });
  const parsed = parser.parse(xml);
  const text: string[] = [];
  collectXmlText(parsed, text);
  return text.join(' ').replace(/\s+/g, ' ').trim();
}

async function parseKnowledgeFile(filePath: string, source: KnowledgeBaseSource): Promise<KnowledgeBaseView> {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.json') {
    const raw = JSON.parse(await readFile(filePath, 'utf-8')) as Partial<KnowledgeBaseView>;
    return normalizeKnowledgeBase(raw, source, filePath);
  }
  const text = ext === '.docx' ? await extractDocxText(filePath) : await readFile(filePath, 'utf-8');
  const baseType = detectBaseType(text, basename(filePath));
  const sections = buildSectionsFromText(text, baseType);
  return normalizeKnowledgeBase(
    {
      id: `${slugFromName(basename(filePath))}-${randomUUID().slice(0, 8)}`,
      baseType,
      title: parse(filePath).name,
      description: `${ext.replace('.', '').toUpperCase()} 导入的成型知识库`,
      sections,
      tags: unique(sections.flatMap((section) => section.tags)).slice(0, 12),
    },
    source,
    filePath,
  );
}

async function listFromDirectory(root: string, source: KnowledgeBaseSource): Promise<KnowledgeBaseView[]> {
  if (!existsSync(root)) return [];
  const files = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(root, entry.name));
  const bases = await Promise.all(
    files.map(async (filePath) => {
      try {
        return await parseKnowledgeFile(filePath, source);
      } catch {
        return null;
      }
    }),
  );
  return bases.filter((item): item is KnowledgeBaseView => Boolean(item));
}

function scoreSection(query: string, base: KnowledgeBaseView, section: KnowledgeSection): number {
  if (!query) return 1;
  const words = unique(query.toLowerCase().split(/\s+/));
  const haystack = `${base.title}\n${base.tags.join(' ')}\n${section.title}\n${section.tags.join(' ')}\n${section.summary ?? ''}\n${section.content}`.toLowerCase();
  return words.reduce((score, word) => score + (haystack.includes(word) ? 8 : 0), 0) + (section.title.toLowerCase().includes(query.toLowerCase()) ? 10 : 0);
}

export class KnowledgeBaseStore {
  async list(workspacePath?: string): Promise<KnowledgeBaseView[]> {
    const builtin = await listFromDirectory(builtinDir(), 'builtin');
    const workspace = workspacePath ? await listFromDirectory(getWorkspaceKnowledgeDir(workspacePath), 'workspace') : [];
    return [...workspace, ...builtin].sort((a, b) => a.title.localeCompare(b.title, 'zh-CN'));
  }

  async importFile(workspacePath: string, filePath: string): Promise<KnowledgeBaseView> {
    const parsed = await parseKnowledgeFile(filePath, 'workspace');
    const targetDir = getWorkspaceKnowledgeDir(workspacePath);
    await mkdir(targetDir, { recursive: true });
    const stored: KnowledgeBaseView = { ...parsed, source: 'workspace', sourcePath: filePath, updatedAt: new Date().toISOString() };
    await writeFile(join(targetDir, `${stored.id}.json`), `${JSON.stringify(stored, null, 2)}\n`, 'utf-8');
    return stored;
  }

  async installBuiltin(id: string, workspacePath: string): Promise<KnowledgeBaseView> {
    const builtins = await listFromDirectory(builtinDir(), 'builtin');
    const builtin = builtins.find((item) => item.id === id);
    if (!builtin) throw new Error(`内置知识库不存在: ${id}`);
    const targetDir = getWorkspaceKnowledgeDir(workspacePath);
    await mkdir(targetDir, { recursive: true });
    const installed: KnowledgeBaseView = {
      ...builtin,
      id: `${builtin.id}-workspace`,
      source: 'workspace',
      sourcePath: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(join(targetDir, `${installed.id}.json`), `${JSON.stringify(installed, null, 2)}\n`, 'utf-8');
    return installed;
  }

  async search(input: KnowledgeSearchInput): Promise<KnowledgeSearchResult[]> {
    const bases = await this.list(input.workspacePath);
    const query = input.query?.trim() ?? '';
    const tag = input.tag?.trim();
    const results: KnowledgeSearchResult[] = [];
    for (const base of bases) {
      if (input.baseType && input.baseType !== 'all' && base.baseType !== input.baseType) continue;
      for (const section of base.sections) {
        if (input.sectionType && input.sectionType !== 'all' && section.sectionType !== input.sectionType) continue;
        if (tag && !base.tags.includes(tag) && !section.tags.includes(tag)) continue;
        const score = scoreSection(query, base, section);
        if (!query || score > 0) {
          results.push({ knowledgeBaseId: base.id, baseTitle: base.title, baseType: base.baseType, source: base.source, section, score });
        }
      }
    }
    return results.sort((a, b) => b.score - a.score).slice(0, 48);
  }
}
