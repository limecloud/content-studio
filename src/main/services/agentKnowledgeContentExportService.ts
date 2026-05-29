import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  ContentKnowledgeMapRecord,
  ContentKnowledgePackExportResult,
  ExportContentKnowledgePackInput,
} from '../../shared/types';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import {
  type KnowledgePackFileEntry,
  validateKnowledgePackFiles,
  validateKnowledgePackSource,
} from './knowledgePackExportPolicy';
import { getWorkspaceDataDir } from './paths';

function safeSegment(value: string): string {
  return value
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'content-knowledge-pack';
}

function relativeFile(path: string, root: string): string {
  return path.startsWith(root) ? path.slice(root.length + 1).replace(/\\/g, '/') : path.replace(/\\/g, '/');
}

const CRC32_TABLE = new Uint32Array(256).map((_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createStoredZip(entries: Array<{ name: string; data: Buffer }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8');
    const checksum = crc32(entry.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(entry.data.length, 18);
    local.writeUInt32LE(entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    localParts.push(local, name, entry.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(entry.data.length, 20);
    central.writeUInt32LE(entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + entry.data.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function buildConcepts(map: ContentKnowledgeMapRecord) {
  return [
    ...map.sellingPoints.map((row) => ({ id: row.id, type: 'selling-point', title: row.title, summary: row.summary, tags: row.tags, dimensions: row.dimensions, status: row.status })),
    ...map.painPoints.map((row) => ({ id: row.id, type: 'pain-point', title: row.title, summary: row.summary, tags: row.tags, dimensions: row.dimensions, status: row.status })),
    ...map.scenarios.map((row) => ({ id: row.id, type: 'scenario', title: row.title, summary: row.summary, tags: row.tags, dimensions: row.dimensions, status: row.status })),
  ];
}

function buildRelations(map: ContentKnowledgeMapRecord) {
  return [
    ...map.sellingPoints.flatMap((row) => row.evidenceRefs.map((evidenceId) => ({ from: row.id, type: 'supported-by', to: evidenceId }))),
    ...map.painPoints.flatMap((row) => row.evidenceRefs.map((evidenceId) => ({ from: row.id, type: 'heard-in', to: evidenceId }))),
    ...map.scenarios.flatMap((row) => row.evidenceRefs.map((evidenceId) => ({ from: row.id, type: 'grounded-by', to: evidenceId }))),
  ];
}

function groundingMarkdown(map: ContentKnowledgeMapRecord): string {
  return [
    `# ${map.title} 提示词依据`,
    '',
    '## 可用卖点',
    ...map.sellingPoints.slice(0, 12).map((row) => `- ${row.title}：${row.summary}`),
    '',
    '## 用户痛点',
    ...map.painPoints.slice(0, 12).map((row) => `- ${row.title}：${row.summary}`),
    '',
    '## 场景',
    ...map.scenarios.slice(0, 12).map((row) => `- ${row.title}：${row.summary}`),
    '',
    '## 规则和禁用边界',
    ...map.constraints.map((item) => `- ${item}`),
    '',
    '## 缺口',
    ...(map.gaps.length ? map.gaps.map((item) => `- ${item}`) : ['- 暂无。']),
    '',
  ].join('\n');
}

function jsonEntry(name: string, value: unknown): KnowledgePackFileEntry {
  return { name, content: `${JSON.stringify(value, null, 2)}\n` };
}

function textEntry(name: string, content: string): KnowledgePackFileEntry {
  return { name, content };
}

function buildPackageEntries(map: ContentKnowledgeMapRecord): KnowledgePackFileEntry[] {
  const concepts = buildConcepts(map);
  const relations = buildRelations(map);
  return [
    textEntry('KNOWLEDGE.md', [
      '---',
      'type: content-ontology',
      'runtime:',
      '  mode: data',
      'metadata:',
      '  primaryOntology: ontology/ontology.json',
      '  primaryAnswers: answers/questions.json',
      '  producedBy: content-studio',
      '---',
      '',
      `# ${map.title}`,
      '',
      '本知识包是数据层导出，用于 Prompt、SOP 和 Agent 客户端按需读取；不包含工具脚本、自动发布指令或平台操控指令。',
      '',
    ].join('\n')),
    jsonEntry('ontology/ontology.json', {
      id: map.id,
      title: map.title,
      schemaVersion: 1,
      status: map.status,
      source: 'content-studio',
      coverage: map.coverage,
      createdAt: map.createdAt,
      updatedAt: map.updatedAt,
    }),
    jsonEntry('ontology/concepts.json', concepts),
    jsonEntry('ontology/relations.json', relations),
    jsonEntry('ontology/claims.json', map.sellingPoints.map((row) => ({
      id: row.id,
      title: row.title,
      summary: row.summary,
      dimensions: row.dimensions,
      evidenceRefs: row.evidenceRefs,
      status: row.status,
    }))),
    jsonEntry('ontology/evidence.json', map.evidence.map((item) => ({ ...item, sourceId: item.sourceId }))),
    jsonEntry('ontology/constraints.json', map.constraints.map((content, index) => ({ id: `constraint-${index + 1}`, content }))),
    jsonEntry('ontology/coverage.json', {
      sellingPoints: map.sellingPoints,
      painPoints: map.painPoints,
      scenarios: map.scenarios,
      gaps: map.gaps,
      summary: map.coverage,
    }),
    jsonEntry('answers/questions.json', map.painPoints.slice(0, 20).map((row) => ({
      id: `question-${row.id}`,
      question: row.title,
      sourceRowId: row.id,
    }))),
    jsonEntry('answers/answer-blocks.json', map.sellingPoints.slice(0, 20).map((row) => ({
      id: `answer-${row.id}`,
      title: row.title,
      content: row.summary,
      citationRefs: row.evidenceRefs,
    }))),
    jsonEntry('answers/citation-targets.json', map.evidence.map((item) => ({
      id: item.id,
      title: item.sourceTitle,
      excerpt: item.excerpt,
    }))),
    textEntry('compiled/prompt-grounding.md', groundingMarkdown(map)),
  ];
}

export class AgentKnowledgeContentExportService {
  constructor(private readonly maps: ContentKnowledgeMapStore) {}

  async exportPack(input: ExportContentKnowledgePackInput): Promise<ContentKnowledgePackExportResult> {
    const maps = await this.maps.list(input.workspacePath);
    const map = input.contentKnowledgeMapId
      ? maps.find((item) => item.id === input.contentKnowledgeMapId)
      : maps[0];
    const issues = validateKnowledgePackSource(map);
    if (!map || issues.length) {
      return { status: 'blocked', files: [], issues };
    }
    const entries = buildPackageEntries(map);
    const packageIssues = validateKnowledgePackFiles(entries);
    if (packageIssues.length) {
      return { status: 'blocked', files: [], issues: packageIssues };
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const packageDir = join(getWorkspaceDataDir(input.workspacePath), 'exports', 'agentknowledge', `${safeSegment(map.title)}-${stamp}`);
    const ontologyDir = join(packageDir, 'ontology');
    const answersDir = join(packageDir, 'answers');
    const compiledDir = join(packageDir, 'compiled');
    await Promise.all([mkdir(ontologyDir, { recursive: true }), mkdir(answersDir, { recursive: true }), mkdir(compiledDir, { recursive: true })]);

    const files: string[] = [];
    for (const entry of entries) {
      const filePath = join(packageDir, entry.name);
      await writeFile(filePath, entry.content, 'utf8');
      files.push(relativeFile(filePath, packageDir));
    }
    const manifestPath = join(packageDir, 'manifest.json');
    const manifestEntry = jsonEntry('manifest.json', {
      schema: 'buguai.agentknowledge.content-ontology.v1',
      agentKnowledgeVersion: '0.7.2',
      mapId: map.id,
      title: map.title,
      files,
      exportedAt: new Date().toISOString(),
    });
    await writeFile(manifestPath, manifestEntry.content, 'utf8');
    files.push('manifest.json');
    const packageArchiveFileName = `${safeSegment(map.title)}.agentknowledge.zip`;
    const packageArchivePath = join(packageDir, packageArchiveFileName);
    const archiveEntries = await Promise.all(files.map(async (file) => ({
      name: file,
      data: await readFile(join(packageDir, file)),
    })));
    const archive = createStoredZip(archiveEntries);
    await writeFile(packageArchivePath, archive);
    return {
      status: 'exported',
      packageDir,
      knowledgePath: join(packageDir, 'KNOWLEDGE.md'),
      manifestPath,
      packageArchivePath,
      packageArchiveFileName,
      packageArchiveSha256: createHash('sha256').update(archive).digest('hex'),
      packageArchiveSize: archive.length,
      files,
      issues: [],
    };
  }
}
