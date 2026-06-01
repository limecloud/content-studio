import type {
  ContentKnowledgeMapRecord,
  ContentKnowledgeMapSourceSensitivitySummary,
  InputSourceRecord,
  InputSourceSensitivity,
} from '../../shared/types';

const sensitivityRank: Record<InputSourceSensitivity, number> = {
  public: 0,
  internal: 1,
  confidential: 2,
  restricted: 3,
};

function emptyCounts(): Record<InputSourceSensitivity, number> {
  return {
    public: 0,
    internal: 0,
    confidential: 0,
    restricted: 0,
  };
}

function higherSensitivity(
  current: InputSourceSensitivity,
  next: InputSourceSensitivity,
): InputSourceSensitivity {
  return sensitivityRank[next] > sensitivityRank[current] ? next : current;
}

function sourceTitle(source: InputSourceRecord): string {
  return source.title.trim() || source.id;
}

export function summarizeInputSourceSensitivity(
  sources: InputSourceRecord[],
): ContentKnowledgeMapSourceSensitivitySummary {
  const counts = emptyCounts();
  let highest: InputSourceSensitivity = 'public';
  const restrictedSourceTitles: string[] = [];
  const confidentialSourceTitles: string[] = [];

  for (const source of sources) {
    const sensitivity = source.sensitivity || 'internal';
    counts[sensitivity] += 1;
    highest = higherSensitivity(highest, sensitivity);
    if (sensitivity === 'restricted') restrictedSourceTitles.push(sourceTitle(source));
    if (sensitivity === 'confidential') confidentialSourceTitles.push(sourceTitle(source));
  }

  if (!sources.length) highest = 'internal';
  return {
    highest,
    counts,
    restrictedSourceTitles: restrictedSourceTitles.slice(0, 8),
    confidentialSourceTitles: confidentialSourceTitles.slice(0, 8),
  };
}

export function contentKnowledgeMapSensitiveIssues(map: ContentKnowledgeMapRecord): string[] {
  const values = [
    map.title,
    ...map.gaps,
    ...map.constraints,
    ...map.evidence.map((item) => `${item.sourceTitle} ${item.excerpt}`),
  ];
  return [
    values.some((value) => /api[_-]?key|secret|token|password|sk-[A-Za-z0-9]/i.test(value))
      ? '检测到疑似密钥或凭证文本，不能同步或发布。'
      : '',
    values.some((value) => /\/Users\/|C:\\\\|\/home\//.test(value))
      ? '检测到本机绝对路径，请先脱敏后再同步或发布。'
      : '',
    map.sourceSensitivity?.counts.restricted
      ? `包含仅本机可用资料，不能同步或发布：${map.sourceSensitivity.restrictedSourceTitles.join('、') || '未命名资料'}。`
      : '',
  ].filter(Boolean);
}
