import type {
  ContentKnowledgeMapEvidence,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentKnowledgeRelease,
  ContentKnowledgeReleaseReference,
  CreateTeamKnowledgePromptDraftInput,
  PromptDraft,
} from '../../shared/types';
import { ContentKnowledgeMapStore } from './contentKnowledgeMapStore';
import { ContentKnowledgeReleaseStore } from './contentKnowledgeReleaseStore';
import { PromptDraftStore } from './promptDraftStore';

function allRows(map: ContentKnowledgeMapRecord): ContentKnowledgeMapMatrixRow[] {
  return [...map.sellingPoints, ...map.painPoints, ...map.scenarios];
}

function releaseRef(release: ContentKnowledgeRelease): ContentKnowledgeReleaseReference {
  return {
    id: release.serverReleaseId || release.id,
    title: release.title,
    version: release.version,
    contentKnowledgeMapId: release.contentKnowledgeMapId,
    contentKnowledgeMapTitle: release.contentKnowledgeMapTitle,
    packageObjectKey: release.packageObjectKey,
    packagePublicUrl: release.packagePublicUrl,
    packageUploadStatus: release.packageUploadStatus,
    approvalStatus: release.approvalStatus,
  };
}

function sameRelease(release: ContentKnowledgeRelease, releaseId?: string): boolean {
  if (!releaseId) return false;
  return release.id === releaseId || release.serverReleaseId === releaseId;
}

function belongsToMap(release: ContentKnowledgeRelease, map: ContentKnowledgeMapRecord): boolean {
  return release.contentKnowledgeMapId === map.id ||
    Boolean(map.teamSync.releaseId && sameRelease(release, map.teamSync.releaseId));
}

function selectRelease(
  releases: ContentKnowledgeRelease[],
  map: ContentKnowledgeMapRecord,
  releaseId?: string,
): ContentKnowledgeRelease | undefined {
  const published = releases.filter((release) => release.status === 'published');
  if (releaseId) {
    return published.find((release) => sameRelease(release, releaseId) && belongsToMap(release, map));
  }
  if (map.teamSync.releaseId) {
    const matched = published.find((release) => sameRelease(release, map.teamSync.releaseId));
    if (matched && belongsToMap(matched, map)) return matched;
  }
  return published.find((release) => belongsToMap(release, map));
}

function evidencePreview(
  row: ContentKnowledgeMapMatrixRow,
  evidenceById: Map<string, ContentKnowledgeMapEvidence>,
): string {
  return row.evidenceRefs
    .map((id) => evidenceById.get(id))
    .filter((item): item is ContentKnowledgeMapEvidence => Boolean(item))
    .slice(0, 2)
    .map((item) => `${item.sourceTitle || '来源'}：${item.excerpt || item.claim}`)
    .join('；') || '等待补证据';
}

function materialLabel(status: ContentKnowledgeMapMatrixRow['materialStatus']): string {
  if (status === 'approved') return '素材可用';
  if (status === 'covered') return '有素材';
  if (status === 'rejected') return '素材驳回';
  return '缺素材';
}

function buildTeamKnowledgePromptContent(
  map: ContentKnowledgeMapRecord,
  release: ContentKnowledgeRelease,
  rows: ContentKnowledgeMapMatrixRow[],
): string {
  const evidenceById = new Map(map.evidence.map((item) => [item.id, item]));
  const sellingRows = rows.filter((row) => map.sellingPoints.some((item) => item.id === row.id));
  const painRows = rows.filter((row) => map.painPoints.some((item) => item.id === row.id));
  const scenarioRows = rows.filter((row) => map.scenarios.some((item) => item.id === row.id));
  const rowLines = (items: ContentKnowledgeMapMatrixRow[]) => (
    items.length
      ? items.map((row, index) => [
          `${index + 1}. ${row.title}`,
          `   - 要点：${row.summary}`,
          `   - 人群：${row.dimensions?.audiences?.join(' / ') || '未细分'}`,
          `   - 渠道：${row.dimensions?.channels?.join(' / ') || '未限定'}`,
          `   - 形式：${row.dimensions?.contentFormats?.join(' / ') || '未限定'}`,
          `   - 证据：${evidencePreview(row, evidenceById)}`,
          `   - 素材状态：${materialLabel(row.materialStatus)}`,
        ].join('\n'))
      : ['- 暂无可用内容']
  );
  return [
    `# ${map.title} / Prompt 草稿交接`,
    '',
    `团队知识包：${release.title} ${release.version}`,
    `地图状态：${map.status === 'published' ? '已发布' : '可用'} / ${map.coverage.readyPercent}% 可用`,
    `可追溯来源：${map.sourceInputSourceIds.length} 个输入源，${map.evidence.filter((item) => item.status === 'ready').length} 条可引用证据`,
    '',
    '## 使用边界',
    '- 这份草稿只能作为团队口径和 Prompt 依据，不能把知识包标题、版本号或文件地址当成产品事实。',
    '- 只使用下方卖点、痛点、场景、证据和规则边界，不编造功效、背书、用户案例或平台数据。',
    '- 缺证据、缺素材、竞品观察和禁用表达必须保留人工确认，不写成确定性承诺。',
    '',
    '## 可复用卖点',
    ...rowLines(sellingRows),
    '',
    '## 用户痛点',
    ...rowLines(painRows),
    '',
    '## 场景组合',
    ...rowLines(scenarioRows),
    '',
    '## 禁用边界',
    ...(map.constraints.length ? map.constraints.slice(0, 8).map((item) => `- ${item}`) : ['- 暂无规则边界，请先补充品牌禁用表达和平台规则。']),
    '',
    '## 资料缺口',
    ...(map.gaps.length ? map.gaps.slice(0, 8).map((item) => `- ${item}`) : ['- 当前没有已登记缺口，仍需在发布前复核平台规则和素材权限。']),
    '',
    '## 下游 Prompt 要求',
    '- 先明确目标人群、场景、产品事实和素材可用性。',
    '- 输出图片 / 短视频 / 文案 Prompt 时，必须保留来源约束、画面要素、语气、节奏、禁用表达和人工确认清单。',
    '- 如果进入短视频生产，必须补充节奏、语气、情绪、背景音乐、说话速度、镜头动作、字幕和素材缺口。',
  ].join('\n');
}

export class ContentTeamKnowledgePromptDraftService {
  constructor(
    private readonly maps: ContentKnowledgeMapStore,
    private readonly releases: ContentKnowledgeReleaseStore,
    private readonly promptDrafts: PromptDraftStore,
  ) {}

  async create(input: CreateTeamKnowledgePromptDraftInput): Promise<PromptDraft> {
    const maps = await this.maps.list(input.workspacePath);
    const map = input.contentKnowledgeMapId
      ? maps.find((item) => item.id === input.contentKnowledgeMapId)
      : maps[0];
    if (!map) throw new Error('请先生成内容知识地图。');

    const releases = await this.releases.list(input.workspacePath);
    const release = selectRelease(releases, map, input.contentKnowledgeReleaseId);
    if (!release) throw new Error('请先发布当前内容知识地图的团队知识包版本，再生成 Prompt 草稿。');

    const readyRows = allRows(map).filter((row) => row.status === 'ready').slice(0, 12);
    if (!readyRows.length) throw new Error('当前没有可复用组合，请先完成审核或补证据。');

    const sourceRefs = Array.from(new Set([
      `content-knowledge-map:${map.id}`,
      `content-knowledge-release:${release.serverReleaseId || release.id}`,
      ...readyRows.flatMap((row) => row.sourceRefs),
    ]));
    const draft = await this.promptDrafts.createFromContent({
      workspacePath: input.workspacePath,
      contentKnowledgeMapId: map.id,
      contentKnowledgeMapTitle: map.title,
      teamKnowledgeRelease: releaseRef(release),
      coverageRowIds: readyRows.map((row) => row.id),
      sourceRefs,
      title: `${release.title} ${release.version} / Prompt 依据`,
      purpose: 'image',
      userIntent: [
        `基于团队知识包「${release.title} ${release.version}」生成可复用 Prompt 草稿。`,
        '请先确认目标平台、素材类型和当前缺口，再输出图片、短视频或文案 Prompt。',
      ].join('\n'),
      inputSourceIds: map.sourceInputSourceIds,
      sceneCardIds: map.sceneCardIds,
      content: buildTeamKnowledgePromptContent(map, release, readyRows),
      note: '由团队知识包详情页生成，可在 agents 继续协作和确认。',
      model: 'local-team-knowledge-package-handoff',
      status: 'draft',
    });

    const promptDraftIds = Array.from(new Set([...map.promptDraftIds, draft.id]));
    await this.maps.update({
      ...map,
      promptDraftIds,
      coverage: {
        ...map.coverage,
        promptDraftCount: promptDraftIds.length,
      },
    });
    return draft;
  }
}
