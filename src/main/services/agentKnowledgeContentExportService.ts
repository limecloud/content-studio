import { createHash } from 'node:crypto';
import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';
import type {
  ContentKnowledgeMapRecord,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgePackFilePreview,
  ContentKnowledgePackExportResult,
  ExportContentKnowledgePackInput,
  ReadContentKnowledgePackFileInput,
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

function pathInside(root: string, target: string): boolean {
  const delta = relative(root, target);
  return delta === '' || (!delta.startsWith('..') && !isAbsolute(delta));
}

function normalizePackageRelativePath(value: string): string {
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '..' || part === '.' || part.includes('\0'))) {
    throw new Error('知识包文件路径非法。');
  }
  return parts.join('/');
}

function blockedFilePreview(relativePath: string, issue: string): ContentKnowledgePackFilePreview {
  return {
    status: 'blocked',
    relativePath,
    issues: [issue],
  };
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

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function ttlLiteral(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
}

function iriSegment(value: string): string {
  return encodeURIComponent(value.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '') || 'item');
}

function rowType(row: ContentKnowledgeMapMatrixRow, map: ContentKnowledgeMapRecord): 'selling-point' | 'pain-point' | 'scenario' {
  if (map.painPoints.some((item) => item.id === row.id)) return 'pain-point';
  if (map.scenarios.some((item) => item.id === row.id)) return 'scenario';
  return 'selling-point';
}

function buildMaterialCoverage(map: ContentKnowledgeMapRecord) {
  return [...map.sellingPoints, ...map.painPoints, ...map.scenarios].map((row) => ({
    rowId: row.id,
    rowType: rowType(row, map),
    title: row.title,
    materialStatus: row.materialStatus ?? 'missing',
    materialRefs: row.materialRefs ?? [],
    performanceTags: row.performanceTags ?? [],
    dimensions: row.dimensions ?? {},
    evidenceRefs: row.evidenceRefs,
    status: row.status,
  }));
}

function buildJsonLd(map: ContentKnowledgeMapRecord, concepts: ReturnType<typeof buildConcepts>, relations: ReturnType<typeof buildRelations>) {
  return {
    '@context': {
      bugu: 'https://schema.bugu.run/content-knowledge#',
      title: 'bugu:title',
      summary: 'bugu:summary',
      status: 'bugu:status',
      supportedBy: { '@id': 'bugu:supportedBy', '@type': '@id' },
      concepts: { '@id': 'bugu:concepts', '@container': '@list' },
      relations: { '@id': 'bugu:relations', '@container': '@list' },
    },
    '@id': `bugu:content-map/${iriSegment(map.id)}`,
    '@type': 'bugu:ContentKnowledgeMap',
    title: map.title,
    status: map.status,
    concepts: concepts.map((concept) => ({
      '@id': `bugu:concept/${iriSegment(concept.id)}`,
      '@type': `bugu:${concept.type}`,
      title: concept.title,
      summary: concept.summary,
      status: concept.status,
      dimensions: concept.dimensions ?? {},
      tags: concept.tags,
    })),
    relations: relations.map((relation) => ({
      from: `bugu:concept/${iriSegment(relation.from)}`,
      type: relation.type,
      to: `bugu:evidence/${iriSegment(relation.to)}`,
    })),
    evidence: map.evidence.map((item) => ({
      '@id': `bugu:evidence/${iriSegment(item.id)}`,
      '@type': `bugu:${item.sourceType}`,
      title: item.sourceTitle,
      claim: item.claim,
      excerpt: item.excerpt,
      status: item.status,
    })),
  };
}

function buildTurtle(map: ContentKnowledgeMapRecord, concepts: ReturnType<typeof buildConcepts>, relations: ReturnType<typeof buildRelations>): string {
  const lines = [
    '@prefix bugu: <https://schema.bugu.run/content-knowledge#> .',
    '@prefix map: <https://schema.bugu.run/content-map/> .',
    '@prefix concept: <https://schema.bugu.run/concept/> .',
    '@prefix evidence: <https://schema.bugu.run/evidence/> .',
    '',
    `map:${iriSegment(map.id)} a bugu:ContentKnowledgeMap ;`,
    `  bugu:title ${ttlLiteral(map.title)} ;`,
    `  bugu:status ${ttlLiteral(map.status)} .`,
    '',
  ];
  concepts.forEach((concept) => {
    lines.push(
      `concept:${iriSegment(concept.id)} a bugu:${concept.type} ;`,
      `  bugu:title ${ttlLiteral(concept.title)} ;`,
      `  bugu:summary ${ttlLiteral(concept.summary)} ;`,
      `  bugu:status ${ttlLiteral(concept.status)} .`,
      '',
    );
  });
  map.evidence.forEach((item) => {
    lines.push(
      `evidence:${iriSegment(item.id)} a bugu:${item.sourceType} ;`,
      `  bugu:title ${ttlLiteral(item.sourceTitle)} ;`,
      `  bugu:claim ${ttlLiteral(item.claim)} ;`,
      `  bugu:status ${ttlLiteral(item.status)} .`,
      '',
    );
  });
  relations.forEach((relation) => {
    lines.push(`concept:${iriSegment(relation.from)} bugu:${relation.type} evidence:${iriSegment(relation.to)} .`);
  });
  return `${lines.join('\n')}\n`;
}

function buildRdfXml(map: ContentKnowledgeMapRecord, concepts: ReturnType<typeof buildConcepts>, relations: ReturnType<typeof buildRelations>): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:bugu="https://schema.bugu.run/content-knowledge#">',
    `  <bugu:ContentKnowledgeMap rdf:about="https://schema.bugu.run/content-map/${iriSegment(map.id)}">`,
    `    <bugu:title>${xmlEscape(map.title)}</bugu:title>`,
    `    <bugu:status>${xmlEscape(map.status)}</bugu:status>`,
    '  </bugu:ContentKnowledgeMap>',
    ...concepts.map((concept) => [
      `  <bugu:${concept.type} rdf:about="https://schema.bugu.run/concept/${iriSegment(concept.id)}">`,
      `    <bugu:title>${xmlEscape(concept.title)}</bugu:title>`,
      `    <bugu:summary>${xmlEscape(concept.summary)}</bugu:summary>`,
      `    <bugu:status>${xmlEscape(concept.status)}</bugu:status>`,
      ...relations
        .filter((relation) => relation.from === concept.id)
        .map((relation) => `    <bugu:${relation.type} rdf:resource="https://schema.bugu.run/evidence/${iriSegment(relation.to)}" />`),
      `  </bugu:${concept.type}>`,
    ].join('\n')),
    ...map.evidence.map((item) => [
      `  <bugu:${item.sourceType} rdf:about="https://schema.bugu.run/evidence/${iriSegment(item.id)}">`,
      `    <bugu:title>${xmlEscape(item.sourceTitle)}</bugu:title>`,
      `    <bugu:claim>${xmlEscape(item.claim)}</bugu:claim>`,
      `    <bugu:status>${xmlEscape(item.status)}</bugu:status>`,
      `  </bugu:${item.sourceType}>`,
    ].join('\n')),
    '</rdf:RDF>',
    '',
  ].join('\n');
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
      '本知识包是数据层导出，用于 Prompt、内容制造和 Agent 客户端按需读取；不包含工具脚本、自动发布指令或平台操控指令。',
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
    jsonEntry('assets/material-coverage.json', buildMaterialCoverage(map)),
    jsonEntry('interop/ontology.jsonld', buildJsonLd(map, concepts, relations)),
    textEntry('interop/ontology.ttl', buildTurtle(map, concepts, relations)),
    textEntry('interop/ontology.rdf', buildRdfXml(map, concepts, relations)),
    textEntry('compiled/prompt-grounding.md', groundingMarkdown(map)),
  ];
}

function buildExportPreview(map: ContentKnowledgeMapRecord): NonNullable<ContentKnowledgePackExportResult['preview']> {
  const readyRows = [map.sellingPoints, map.painPoints, map.scenarios]
    .flat()
    .filter((row) => row.status === 'ready');
  const materialCoverageCount = readyRows.filter((row) => (
    row.materialStatus === 'covered' ||
    row.materialStatus === 'approved' ||
    Boolean(row.materialRefs?.length)
  )).length;
  return {
    agentKnowledgeVersion: '0.7.2',
    readyRowCount: readyRows.length,
    readyEvidenceCount: map.evidence.filter((item) => item.status === 'ready').length,
    materialCoverageCount,
    interopFormats: ['JSON-LD', 'Turtle', 'RDF/XML'],
    answerQuestionCount: map.painPoints.slice(0, 20).length,
    promptGroundingFile: 'compiled/prompt-grounding.md',
  };
}

export class AgentKnowledgeContentExportService {
  constructor(private readonly maps: ContentKnowledgeMapStore) {}

  async readPackFile(input: ReadContentKnowledgePackFileInput): Promise<ContentKnowledgePackFilePreview> {
    if (!input.packageDir?.trim()) {
      return blockedFilePreview(input.relativePath, '当前没有可读取的本机知识包预览。先生成本机预览，或拉取带本机包路径的团队版本。');
    }

    let relativePath = input.relativePath;
    try {
      relativePath = normalizePackageRelativePath(input.relativePath);
    } catch (error) {
      return blockedFilePreview(input.relativePath, error instanceof Error ? error.message : '知识包文件路径非法。');
    }

    try {
      const workspaceDataDir = await realpath(resolve(getWorkspaceDataDir(input.workspacePath))).catch(() => resolve(getWorkspaceDataDir(input.workspacePath)));
      const packageDir = await realpath(resolve(input.packageDir));
      if (!pathInside(workspaceDataDir, packageDir)) {
        return blockedFilePreview(relativePath, '只能读取当前工作区生成的知识包预览文件。');
      }

      const filePath = resolve(packageDir, relativePath);
      if (!pathInside(packageDir, filePath)) {
        return blockedFilePreview(relativePath, '知识包文件路径越界。');
      }
      const realFilePath = await realpath(filePath);
      if (!pathInside(packageDir, realFilePath)) {
        return blockedFilePreview(relativePath, '知识包文件路径越界。');
      }

      const fileStat = await stat(realFilePath);
      if (!fileStat.isFile()) {
        return blockedFilePreview(relativePath, '该路径不是可预览文件。');
      }
      const maxBytes = Math.min(Math.max(input.maxBytes ?? 64 * 1024, 1024), 256 * 1024);
      const content = await readFile(realFilePath);
      const truncated = content.length > maxBytes;
      return {
        status: 'loaded',
        relativePath,
        content: content.subarray(0, maxBytes).toString('utf8'),
        size: content.length,
        truncated,
        issues: [],
      };
    } catch (error) {
      return blockedFilePreview(relativePath, error instanceof Error ? error.message : '知识包文件读取失败。');
    }
  }

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
    const assetsDir = join(packageDir, 'assets');
    const interopDir = join(packageDir, 'interop');
    const compiledDir = join(packageDir, 'compiled');
    await Promise.all([
      mkdir(ontologyDir, { recursive: true }),
      mkdir(answersDir, { recursive: true }),
      mkdir(assetsDir, { recursive: true }),
      mkdir(interopDir, { recursive: true }),
      mkdir(compiledDir, { recursive: true }),
    ]);

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
      preview: buildExportPreview(map),
      files,
      issues: [],
    };
  }
}
