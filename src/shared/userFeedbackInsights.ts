import type { InputSourceKind, InputSourcePurpose } from './types';

export interface UserFeedbackSourceLike {
  id: string;
  kind: InputSourceKind;
  purpose: InputSourcePurpose;
  title: string;
  tags: string[];
  summary?: string;
  extractedText?: string;
}

export interface FeedbackPainPointCluster {
  key: string;
  label: string;
  count: number;
  examples: string[];
  audienceHints: string[];
  scenarioHints: string[];
  titleDirections: string[];
  tags: string[];
}

export interface FeedbackObjectionResponse {
  painPoint: string;
  objection: string;
  audience: string;
  scenario: string;
  response: string;
  evidence: string;
  boundary: string;
}

export interface FeedbackPainPointInsight {
  sourceIds: string[];
  sourceTitles: string[];
  totalLines: number;
  clusters: FeedbackPainPointCluster[];
  recommendedTags: string[];
  titleDirections: string[];
  objectionResponses: FeedbackObjectionResponse[];
  matrix: Array<{
    painPoint: string;
    audience: string;
    scenario: string;
    contentAngle: string;
    evidence: string;
  }>;
}

const CLUSTER_DEFINITIONS: Array<{
  key: string;
  label: string;
  keywords: string[];
  tags: string[];
  contentAngle: string;
}> = [
  {
    key: 'price-trust',
    label: '价格和信任顾虑',
    keywords: ['贵', '价格', '优惠', '划算', '值不值', '真假', '智商税', '有没有用', '效果'],
    tags: ['价格顾虑', '信任建立'],
    contentAngle: '先解释真实价值和适用边界，再给低风险尝试理由。',
  },
  {
    key: 'usage-friction',
    label: '使用门槛和坚持成本',
    keywords: ['怎么用', '不会', '麻烦', '坚持', '忘记', '没时间', '太复杂', '难操作', '步骤'],
    tags: ['使用门槛', '习惯养成'],
    contentAngle: '把使用步骤拆成低门槛场景，降低第一次行动成本。',
  },
  {
    key: 'audience-fit',
    label: '适用人群和禁忌边界',
    keywords: ['适合', '能不能', '孩子', '老人', '孕', '敏感', '人群', '禁忌', '过敏'],
    tags: ['人群匹配', '合规边界'],
    contentAngle: '明确适合谁、不适合谁，并提醒人工复核专业边界。',
  },
  {
    key: 'scenario-need',
    label: '具体场景需求',
    keywords: ['早餐', '办公室', '通勤', '出差', '旅行', '宿舍', '家里', '上班', '送礼', '运动'],
    tags: ['场景内容', '真实使用'],
    contentAngle: '围绕具体地点和时间写真实使用画面。',
  },
  {
    key: 'delivery-packaging',
    label: '交付和包装问题',
    keywords: ['发货', '快递', '物流', '包装', '破损', '漏', '退换', '售后'],
    tags: ['售后问题', '包装体验'],
    contentAngle: '把售后和包装问题转成购买前说明或客服话术。',
  },
  {
    key: 'comparison',
    label: '对比和替代选择',
    keywords: ['对比', '别家', '竞品', '替代', '同款', '哪个', '区别'],
    tags: ['竞品对比', '差异化'],
    contentAngle: '只讲可证明差异，不复制竞品可识别元素。',
  },
];

function normalizeText(value?: string): string {
  return (value ?? '').replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').trim();
}

function unique(items: string[], limit = 12): string[] {
  return Array.from(new Set(items.map((item) => item.trim()).filter(Boolean))).slice(0, limit);
}

function feedbackSourceText(source: UserFeedbackSourceLike): string {
  const body = normalizeText(source.extractedText || source.summary);
  return body || normalizeText(source.title);
}

function isFeedbackSource(source: UserFeedbackSourceLike): boolean {
  if (source.purpose === 'user-feedback') return true;
  return source.tags.some((tag) => /评论|差评|客服|用户反馈|私信|问答|feedback/i.test(tag));
}

function normalizeFeedbackLine(line: string): string {
  return line
    .replace(/^[-*#\d.\s]+/, '')
    .replace(/^(用户|客户|客服|评论|差评|问)[:：]\s*/, '')
    .trim();
}

function feedbackLines(sources: UserFeedbackSourceLike[]): string[] {
  return unique(
    sources
      .flatMap((source) => feedbackSourceText(source).split('\n'))
      .map(normalizeFeedbackLine)
      .filter((line) => line.length >= 3),
    120,
  );
}

function inferAudience(line: string): string {
  if (/孩子|儿童|学生|妈妈|家长/.test(line)) return '家长 / 孩子相关用户';
  if (/老人|爸妈|父母|长辈/.test(line)) return '家庭长辈决策者';
  if (/上班|办公室|加班|通勤/.test(line)) return '办公和通勤人群';
  if (/新手|第一次|不会/.test(line)) return '新手用户';
  return '相关目标用户';
}

function inferScenario(line: string): string {
  if (/早餐|早上|起床/.test(line)) return '早餐后';
  if (/办公室|上班|加班/.test(line)) return '办公室';
  if (/通勤|包里|出门/.test(line)) return '通勤路上';
  if (/出差|旅行/.test(line)) return '出差 / 旅行';
  if (/家里|家庭/.test(line)) return '家庭场景';
  return '用户提问场景';
}

function titleDirection(label: string, example: string): string {
  const clipped = example.length > 28 ? `${example.slice(0, 28)}...` : example;
  return `${label}：围绕“${clipped}”写问题型标题`;
}

function emptyInsight(): FeedbackPainPointInsight {
  return {
    sourceIds: [],
    sourceTitles: [],
    totalLines: 0,
    clusters: [],
    recommendedTags: [],
    titleDirections: [],
    objectionResponses: [],
    matrix: [],
  };
}

function objectionBoundary(key: string): string {
  if (key === 'price-trust') return '只解释可证明价值和试用边界，不承诺效果，不制造价格焦虑。';
  if (key === 'usage-friction') return '只给低门槛使用建议，不替用户编造坚持结果。';
  if (key === 'audience-fit') return '涉及孩子、老人、孕期、敏感人群时必须人工复核专业边界，不替代专业建议。';
  if (key === 'delivery-packaging') return '只说明已确认的发货、包装和售后规则，不承诺未配置的服务。';
  if (key === 'comparison') return '只比较可证明差异，不贬低竞品，不复制竞品可识别元素。';
  return '保留用户原问题，生成内容前由人工确认产品事实和平台边界。';
}

function objectionResponse(cluster: FeedbackPainPointCluster): FeedbackObjectionResponse {
  const evidence = cluster.examples[0] ?? '';
  const audience = cluster.audienceHints[0] ?? '相关目标用户';
  const scenario = cluster.scenarioHints[0] ?? '用户提问场景';
  const boundary = objectionBoundary(cluster.key);
  return {
    painPoint: cluster.label,
    objection: evidence,
    audience,
    scenario,
    response: `先回应“${evidence}”这个真实顾虑，再按${scenario}说明已确认的信息；无法确认的功效、适用边界或售后规则要请人工复核后再回复。`,
    evidence,
    boundary,
  };
}

export function clusterUserFeedbackSources(sources: UserFeedbackSourceLike[]): FeedbackPainPointInsight {
  const feedbackSources = sources.filter(isFeedbackSource);
  if (!feedbackSources.length) return emptyInsight();
  const lines = feedbackLines(feedbackSources);
  const clusters = CLUSTER_DEFINITIONS.flatMap((definition) => {
    const examples = lines.filter((line) => definition.keywords.some((keyword) => line.includes(keyword))).slice(0, 6);
    if (!examples.length) return [];
    return [{
      key: definition.key,
      label: definition.label,
      count: examples.length,
      examples,
      audienceHints: unique(examples.map(inferAudience), 4),
      scenarioHints: unique(examples.map(inferScenario), 4),
      titleDirections: examples.slice(0, 3).map((example) => titleDirection(definition.label, example)),
      tags: definition.tags,
    }];
  });
  const fallbackExamples = clusters.length ? [] : lines.slice(0, 6);
  const finalClusters = clusters.length ? clusters : fallbackExamples.length ? [{
    key: 'unclassified',
    label: '待人工归类的真实问题',
    count: fallbackExamples.length,
    examples: fallbackExamples,
    audienceHints: unique(fallbackExamples.map(inferAudience), 4),
    scenarioHints: unique(fallbackExamples.map(inferScenario), 4),
    titleDirections: fallbackExamples.slice(0, 3).map((example) => titleDirection('真实问题', example)),
    tags: ['待归类', '真实用户语言'],
  }] : [];
  const matrix = finalClusters.map((cluster) => ({
    painPoint: cluster.label,
    audience: cluster.audienceHints.join(' / ') || '相关目标用户',
    scenario: cluster.scenarioHints.join(' / ') || '用户提问场景',
    contentAngle: CLUSTER_DEFINITIONS.find((definition) => definition.key === cluster.key)?.contentAngle
      ?? '先保留原始问题，再人工判断内容角度。',
    evidence: cluster.examples[0] ?? '',
  }));
  return {
    sourceIds: feedbackSources.map((source) => source.id),
    sourceTitles: feedbackSources.map((source) => source.title),
    totalLines: lines.length,
    clusters: finalClusters,
    recommendedTags: unique(finalClusters.flatMap((cluster) => cluster.tags), 16),
    titleDirections: unique(finalClusters.flatMap((cluster) => cluster.titleDirections), 12),
    objectionResponses: finalClusters.map(objectionResponse),
    matrix,
  };
}
