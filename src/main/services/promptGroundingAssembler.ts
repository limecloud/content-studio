import type {
  ContentKnowledgeMapEvidence,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentKnowledgeReleaseReference,
  ContentProductionGroundingSummary,
  ContentReviewTask,
} from '../../shared/types';

function labelForTarget(type: ContentReviewTask['targetType']): string {
  if (type === 'selling-point') return '卖点';
  if (type === 'pain-point') return '痛点';
  if (type === 'scenario') return '场景';
  if (type === 'evidence') return '证据';
  if (type === 'constraint') return '规则';
  return '缺口';
}

function compactText(value: string | undefined, fallback = ''): string {
  return String(value ?? fallback).replace(/\s+/g, ' ').trim();
}

function clip(value: string | undefined, max = 220): string {
  const text = compactText(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function lineList(title: string, values: string[]): string[] {
  const lines = values.map((value) => clip(value)).filter(Boolean);
  return lines.length ? [title, ...lines.map((value, index) => `${index + 1}. ${value}`)] : [];
}

export function buildPromptGroundingSummary(input: {
  map: ContentKnowledgeMapRecord;
  task: ContentReviewTask;
  row: ContentKnowledgeMapMatrixRow;
  readyEvidence: ContentKnowledgeMapEvidence[];
  teamKnowledgeRelease?: ContentKnowledgeReleaseReference;
}): ContentProductionGroundingSummary {
  const { map, task, row, readyEvidence, teamKnowledgeRelease } = input;
  const evidenceLines = readyEvidence.map((evidence) =>
    `${clip(evidence.sourceTitle, 80)}：${clip(evidence.claim, 120)}。摘录：${clip(evidence.excerpt, 220)}`,
  );
  const content = [
    '# 提示词依据',
    '',
    `知识地图：${clip(map.title, 80)}`,
    `审核对象：${labelForTarget(task.targetType)} / ${clip(row.title, 80)}`,
    `矩阵组合 ID：${row.id}`,
    `审核任务 ID：${task.id}`,
    teamKnowledgeRelease ? `团队知识包：${clip(teamKnowledgeRelease.title, 80)} ${clip(teamKnowledgeRelease.version, 40)}` : '',
    `置信度：${row.confidence}`,
    '',
    '## 可用主张',
    clip(row.summary, 260),
    row.tags.length ? `标签：${row.tags.map((tag) => clip(tag, 24)).filter(Boolean).slice(0, 12).join('、')}` : '',
    '',
    ...lineList('## 已通过证据', evidenceLines),
    '',
    ...lineList('## 生成边界', map.constraints),
    '',
    ...lineList('## 来源引用', row.sourceRefs),
    '',
    '## 下游生成要求',
    '- 只使用上面的可用主张、已通过证据和生成边界。',
    '- 不补写没有证据支持的功效、背书、销量、平台表现或医学承诺。',
    '- 如需要扩展创意，只能扩展表达方式，不能扩展事实本身。',
    '- 输出需要同时服务文案、图片 Prompt、视频 Prompt 和内容任务拆解。',
  ].filter(Boolean).join('\n');

  return {
    title: `${clip(row.title, 80)} 提示词依据`,
    content,
    sourceKnowledgeMapId: map.id,
    sourceKnowledgeMapTitle: map.title,
    teamKnowledgeRelease,
    coverageRowIds: [row.id],
    sourceRefs: row.sourceRefs,
    evidenceRefs: readyEvidence.map((item) => item.id),
    constraints: map.constraints,
    readyEvidenceCount: readyEvidence.length,
  };
}
