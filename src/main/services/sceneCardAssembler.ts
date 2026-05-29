import type {
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentReviewTask,
  CreateSceneCardFromContentInput,
} from '../../shared/types';

function inputSourceIdsFromRefs(sourceRefs: string[]): string[] {
  return sourceRefs
    .filter((ref) => ref.startsWith('input-source:'))
    .map((ref) => ref.slice('input-source:'.length))
    .filter(Boolean);
}

export function buildSceneCardFromKnowledgeMap(input: {
  workspacePath: string;
  map: ContentKnowledgeMapRecord;
  task: ContentReviewTask;
  row: ContentKnowledgeMapMatrixRow;
}): CreateSceneCardFromContentInput {
  const { workspacePath, map, task, row } = input;
  const targetLabel = task.targetType === 'pain-point' ? '痛点处理' : task.targetType === 'scenario' ? '场景表达' : '卖点表达';
  const audience = row.dimensions?.audiences?.[0]
    ?? row.tags.find((tag) => !['卖点', '品牌资料', '场景卖点', '评论痛点', '用户原声', '场景卡'].includes(tag))
    ?? '待细分目标人群';
  const usageScene = row.dimensions?.useCases?.[0] ?? (task.targetType === 'scenario' ? row.title : row.summary);
  return {
    workspacePath,
    promptPackId: `content-knowledge-map:${map.id}`,
    inputSourceIds: inputSourceIdsFromRefs(row.sourceRefs),
    contentKnowledgeMapId: map.id,
    contentKnowledgeMapTitle: map.title,
    coverageRowIds: [row.id],
    sourceRefs: row.sourceRefs,
    title: `${row.title} · ${targetLabel}`,
    audience,
    painPoint: task.targetType === 'pain-point' ? row.title : '围绕该组合对应的购买异议或使用阻碍展开。',
    usageScene,
    visualComposition: `画面围绕「${row.title}」展开，保留真实使用动作、产品细节和可验证证据，不做夸张效果承诺。`,
    sellingPoint: task.targetType === 'selling-point' ? row.title : row.summary,
    voiceoverDirection: `用克制、可追溯的口吻表达「${row.title}」，避免无证据背书。`,
    imageMaterialSuggestion: `生成一张围绕「${row.title}」的内容场景图，突出使用状态、产品细节和可信证据。`,
    videoMaterialSuggestion: `生成 15-30 秒短视频分镜：痛点进入、卖点解释、证据露出、行动建议。核心组合：${row.title}。`,
    citations: [],
  };
}
