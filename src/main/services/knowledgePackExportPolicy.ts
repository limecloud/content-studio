import type { ContentKnowledgeMapRecord } from '../../shared/types';

export interface KnowledgePackFileEntry {
  name: string;
  content: string;
}

const REQUIRED_FILES = [
  'KNOWLEDGE.md',
  'ontology/ontology.json',
  'ontology/concepts.json',
  'ontology/relations.json',
  'ontology/claims.json',
  'ontology/evidence.json',
  'ontology/constraints.json',
  'ontology/coverage.json',
];

const DATA_ONLY_FORBIDDEN_PATTERNS = [
  { pattern: /#!\/|\bfunction\s+\w+\s*\(|\bimport\s+.+\bfrom\b|\bexport\s+default\b/, label: '脚本代码' },
  { pattern: /\b(curl|npm|pnpm|yarn|git)\s+[-\w]/i, label: '命令行指令' },
  { pattern: /自动发布|绕过审核|刷量|伪装用户|排名操控|虚假互动/, label: '平台操控指令' },
];

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function hasReadyRows(map: ContentKnowledgeMapRecord): boolean {
  return [...map.sellingPoints, ...map.painPoints, ...map.scenarios].some((row) => row.status === 'ready');
}

function allExportedRowsReady(map: ContentKnowledgeMapRecord): boolean {
  return [...map.sellingPoints, ...map.painPoints, ...map.scenarios]
    .every((row) => row.status === 'ready');
}

function hasReadyEvidenceForReadyRows(map: ContentKnowledgeMapRecord): boolean {
  const readyEvidenceIds = new Set(map.evidence.filter((item) => item.status === 'ready').map((item) => item.id));
  return [...map.sellingPoints, ...map.painPoints, ...map.scenarios]
    .filter((row) => row.status === 'ready')
    .every((row) => row.evidenceRefs.length > 0 && row.evidenceRefs.every((id) => readyEvidenceIds.has(id)));
}

function hasSensitiveText(value: string): boolean {
  return /api[_-]?key|secret|token|password|sk-[A-Za-z0-9]/i.test(value);
}

function hasLocalPath(value: string): boolean {
  return /\/Users\/|\/private\/var\/|\/tmp\/content-studio|\/home\/|[A-Za-z]:\\/.test(value);
}

export function validateKnowledgePackSource(map: ContentKnowledgeMapRecord | undefined): string[] {
  if (!map) return ['缺少内容知识地图。'];
  const serialized = JSON.stringify({
    title: map.title,
    evidence: map.evidence,
    constraints: map.constraints,
    gaps: map.gaps,
  });
  return [
    map.status === 'ready' || map.status === 'published' ? '' : '知识地图仍有待补齐项，不能导出为团队知识包。',
    map.evidence.length ? '' : '缺少证据数据。',
    map.constraints.length ? '' : '缺少规则和禁用表达。',
    hasReadyRows(map) ? '' : '缺少可复用的已审核卖点、痛点或场景。',
    allExportedRowsReady(map) ? '' : '仍有待审核或缺证据的矩阵行，不能进入团队知识包。',
    hasReadyEvidenceForReadyRows(map) ? '' : '已审核矩阵行存在缺失或待确认的证据引用。',
    hasSensitiveText(serialized) ? '检测到疑似密钥或凭证文本，不能导出团队知识包。' : '',
    hasLocalPath(serialized) ? '检测到本机绝对路径，请先脱敏后再导出团队知识包。' : '',
  ].filter(Boolean);
}

export function validateKnowledgePackFiles(entries: KnowledgePackFileEntry[]): string[] {
  const names = new Set(entries.map((entry) => entry.name));
  const issues = REQUIRED_FILES
    .filter((name) => !names.has(name))
    .map((name) => `缺少知识包文件：${name}`);
  const knowledge = entries.find((entry) => entry.name === 'KNOWLEDGE.md')?.content ?? '';
  if (!/metadata:\s*\n[\s\S]*primaryOntology:\s*ontology\/ontology\.json/.test(knowledge)) {
    issues.push('KNOWLEDGE.md 缺少 metadata.primaryOntology。');
  }
  if (names.has('answers/questions.json') && !/primaryAnswers:\s*answers\/questions\.json/.test(knowledge)) {
    issues.push('KNOWLEDGE.md 缺少 metadata.primaryAnswers。');
  }
  entries.forEach((entry) => {
    if (((entry.name.endsWith('.json') || entry.name.endsWith('.jsonld')) && parseJson(entry.content) === null)) {
      issues.push(`${entry.name} 不是合法 JSON。`);
    }
    if (hasSensitiveText(entry.content)) {
      issues.push(`${entry.name} 含疑似密钥或凭证文本。`);
    }
    if (hasLocalPath(entry.content)) {
      issues.push(`${entry.name} 含本机绝对路径。`);
    }
    if (
      entry.name.startsWith('ontology/') ||
      entry.name.startsWith('answers/') ||
      entry.name.startsWith('assets/') ||
      entry.name.startsWith('interop/')
    ) {
      DATA_ONLY_FORBIDDEN_PATTERNS.forEach(({ pattern, label }) => {
        if (pattern.test(entry.content)) issues.push(`${entry.name} 含${label}，不符合数据层导出要求。`);
      });
    }
  });
  return Array.from(new Set(issues));
}
