import type {
  GenerationLogEntry,
  KnowledgeBaseView,
  KnowledgeCitation,
  KnowledgeSearchResult,
  LoadedSkill,
  SkillRef,
} from '../../../shared/types';

export function sourceLabel(source: LoadedSkill['source']): string {
  return {
    builtin: '内置',
    project: '项目',
    'project-compat': '项目兼容',
    user: '用户',
    'user-compat': '用户兼容',
  }[source];
}

export function baseLabel(base: KnowledgeBaseView['baseType']): string {
  return base === 'personal-ip-kb' ? '个人 IP 型' : '产品型';
}

export function sectionLabel(type: KnowledgeCitation['sectionType']): string {
  const labels: Record<KnowledgeCitation['sectionType'], string> = {
    science: '科学基础',
    brand: '品牌',
    product: '产品',
    'selling-point': '卖点',
    'scenario-script': '场景脚本',
    'objection-handling': '异议处理',
    compliance: '合规',
    qa: '问答',
    spec: '规格',
    profile: '人物档案',
    timeline: '履历',
    story: '故事',
    methodology: '方法论',
    quote: '金句',
    'voice-style': '写作风格',
    boundary: '边界',
  };
  return labels[type];
}

export function kindLabel(kind: GenerationLogEntry['kind']): string {
  return {
    article: '文章',
    image: '图片',
    video: '视频',
    'video-breakdown': '视频拆解',
    'video-script': '视频脚本',
    'prompt-pack': '提示词包',
    'scene-card': '场景卡',
  }[kind];
}

export function statusLabel(status: GenerationLogEntry['status']): string {
  return {
    queued: '排队中',
    running: '生成中',
    succeeded: '成功',
    failed: '失败',
    blocked: '已阻塞',
    cancelled: '已取消',
  }[status];
}

export function skillKey(skill: SkillRef): string {
  return `${skill.source}:${skill.slug}`;
}

export function clip(value: string, length = 180): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > length ? `${normalized.slice(0, length)}...` : normalized;
}

export function citationFromResult(result: KnowledgeSearchResult): KnowledgeCitation {
  return {
    knowledgeBaseId: result.knowledgeBaseId,
    sectionId: result.section.id,
    title: `${result.baseTitle} / ${result.section.title}`,
    sectionType: result.section.sectionType,
    excerpt: clip(result.section.content || result.section.summary || result.section.title, 220),
  };
}

export function isSameCitation(a: KnowledgeCitation, b: KnowledgeCitation): boolean {
  return a.knowledgeBaseId === b.knowledgeBaseId && a.sectionId === b.sectionId;
}

function recordValue(value: unknown, key: string): unknown {
  return value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
}

export function extractPromptFromLog(log: GenerationLogEntry): string {
  const directPrompt = recordValue(log.input, 'prompt');
  if (typeof directPrompt === 'string' && directPrompt.trim()) return directPrompt;
  const videoPrompt = recordValue(log.output, 'videoPrompt');
  if (typeof videoPrompt === 'string' && videoPrompt.trim()) return videoPrompt;
  const markdown = recordValue(log.output, 'markdown');
  if (typeof markdown === 'string' && markdown.trim()) return markdown;
  return JSON.stringify({ input: log.input, output: log.output }, null, 2);
}

function collectStringArray(value: unknown, key: string): string[] {
  const field = recordValue(value, key);
  return Array.isArray(field) ? field.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

export function extractLocalRefsFromLog(log: GenerationLogEntry): string[] {
  const refs = [
    ...collectStringArray(log.input, 'productImageRefs'),
    ...collectStringArray(log.input, 'referenceImageRefs'),
    ...collectStringArray(log.input, 'imageAssetRefs'),
    ...collectStringArray(log.input, 'videoAssetRefs'),
    ...collectStringArray(log.input, 'assetRefs'),
    ...collectStringArray(log.output, 'assetRefs'),
    ...(log.artifactRefs ?? []),
  ];
  return Array.from(new Set(refs.filter((item) => !/^https?:\/\//i.test(item))));
}

export function extractSkillSlugsFromLog(log: GenerationLogEntry): string[] {
  const selected = collectStringArray(log.input, 'selectedSkillSlugs');
  if (selected.length > 0) return Array.from(new Set(selected));
  if (log.kind === 'prompt-pack') return ['knowledge-citation-picker', 'prompt-pack-builder', 'brand-voice-keeper'];
  if (log.kind === 'scene-card') return ['scene-library-builder'];
  if (log.kind === 'article') return ['article-drafter', 'publish-checker'];
  if (log.kind === 'video-breakdown') return ['video-breakdown'];
  if (log.kind === 'video-script') return ['video-script-writer', 'compliance-reviewer'];
  if (log.kind === 'image') return ['ecommerce-image-prompt'];
  if (log.kind === 'video') return ['video-script-writer'];
  return [];
}
