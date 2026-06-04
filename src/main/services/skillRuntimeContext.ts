import matter from 'gray-matter';
import type { LoadedSkill, SkillRef, SkillSource } from '../../shared/types';
import { SkillManager } from './skillManager';

const MAX_SKILL_CHARS = 6_000;
const MAX_TOTAL_CHARS = 24_000;

const SOURCE_PRIORITY: Record<SkillSource, number> = {
  project: 0,
  'project-compat': 1,
  builtin: 2,
  user: 3,
  'user-compat': 4,
};

export interface SkillRuntimeContext {
  skillRefs: SkillRef[];
  selectedSkills: LoadedSkill[];
  promptText: string;
  summaryText: string;
  sdkSkillNames: string[];
  additionalDirectories: string[];
}

function skillKey(skill: SkillRef): string {
  return `${skill.source}:${skill.slug}`;
}

function uniqueSkillRefs(skills: SkillRef[] | undefined): SkillRef[] {
  const seen = new Set<string>();
  const refs: SkillRef[] = [];
  for (const skill of skills ?? []) {
    const slug = skill.slug?.trim();
    if (!slug) continue;
    const ref = { slug, source: skill.source };
    const key = skillKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    refs.push(ref);
  }
  return refs;
}

function uniqueSlugs(slugs: string[] | undefined): string[] {
  return Array.from(new Set((slugs ?? []).map((slug) => slug.trim()).filter(Boolean)));
}

function sortByRuntimePriority(skills: LoadedSkill[]): LoadedSkill[] {
  return [...skills].sort((a, b) => {
    const priorityDiff = SOURCE_PRIORITY[a.source] - SOURCE_PRIORITY[b.source];
    if (priorityDiff !== 0) return priorityDiff;
    return a.slug.localeCompare(b.slug, 'zh-Hans-CN');
  });
}

function resolveSelectedSkills(
  allSkills: LoadedSkill[],
  selectedSkills?: SkillRef[],
  selectedSkillSlugs?: string[],
): LoadedSkill[] {
  const validSkills = sortByRuntimePriority(allSkills.filter((skill) => skill.valid));
  const refs = uniqueSkillRefs(selectedSkills);
  if (refs.length) {
    const byKey = new Map(validSkills.map((skill) => [skillKey(skill), skill]));
    return refs.map((ref) => byKey.get(skillKey(ref))).filter((skill): skill is LoadedSkill => Boolean(skill));
  }

  const slugs = uniqueSlugs(selectedSkillSlugs);
  if (!slugs.length) return [];
  return slugs
    .map((slug) => validSkills.find((skill) => skill.slug === slug || skill.metadata.name === slug))
    .filter((skill): skill is LoadedSkill => Boolean(skill));
}

function skillBody(skill: LoadedSkill): string {
  const content = skill.content?.trim();
  if (!content) return '';
  try {
    return matter(content).content.trim();
  } catch {
    return content;
  }
}

function formatSkillForPrompt(skill: LoadedSkill, availableChars: number): string {
  const body = skillBody(skill);
  const clippedBody = body.slice(0, Math.max(0, Math.min(MAX_SKILL_CHARS, availableChars)));
  return [
    `### ${skill.metadata.name}`,
    `slug: ${skill.slug}`,
    `source: ${skill.source}`,
    `description: ${skill.metadata.description}`,
    skill.metadata.requiredSources?.length ? `requiredSources: ${skill.metadata.requiredSources.join(', ')}` : '',
    skill.metadata.alwaysAllow?.length ? `alwaysAllow: ${skill.metadata.alwaysAllow.join(', ')}` : '',
    '',
    clippedBody ? '执行规范：' : '',
    clippedBody,
    body.length > clippedBody.length ? '\n[skill 内容已按上下文长度截断]' : '',
  ].filter(Boolean).join('\n');
}

export async function buildSkillRuntimeContext(
  skillManager: SkillManager,
  workspacePath: string,
  input: {
    selectedSkills?: SkillRef[];
    selectedSkillSlugs?: string[];
  },
): Promise<SkillRuntimeContext> {
  const selectedRefs = uniqueSkillRefs(input.selectedSkills);
  const selectedSlugs = uniqueSlugs(input.selectedSkillSlugs);
  if (!selectedRefs.length && !selectedSlugs.length) {
    return {
      skillRefs: [],
      selectedSkills: [],
      promptText: '',
      summaryText: '未选择 skill。',
      sdkSkillNames: [],
      additionalDirectories: [],
    };
  }
  const selectedSkills = resolveSelectedSkills(
    await skillManager.scan(workspacePath),
    selectedRefs,
    selectedSlugs,
  );
  if (!selectedSkills.length) {
    return {
      skillRefs: [],
      selectedSkills: [],
      promptText: '',
      summaryText: '未选择 skill。',
      sdkSkillNames: [],
      additionalDirectories: [],
    };
  }

  let remaining = MAX_TOTAL_CHARS;
  const blocks: string[] = [];
  for (const skill of selectedSkills) {
    if (remaining <= 0) break;
    const block = formatSkillForPrompt(skill, remaining);
    remaining -= block.length;
    blocks.push(block);
  }

  const summaryText = selectedSkills
    .map((skill) => `${skill.metadata.name}（${skill.slug} / ${skill.source}）`)
    .join('、');

  return {
    skillRefs: selectedSkills.map((skill) => ({ slug: skill.slug, source: skill.source })),
    selectedSkills,
    promptText: [
      '本轮启用的 skills：',
      summaryText,
      '',
      '执行要求：',
      '- 优先遵守下列 skill 的适用场景、输入、输出、流程和约束。',
      '- skill 与用户意图或输入源冲突时，明确指出冲突，不要硬套。',
      '- 不要编造 skill、输入源或知识库中没有的事实。',
      '',
      ...blocks,
    ].join('\n'),
    summaryText,
    sdkSkillNames: Array.from(new Set(selectedSkills.flatMap((skill) => [skill.metadata.name, skill.slug]).filter(Boolean))),
    additionalDirectories: Array.from(new Set(selectedSkills.map((skill) => skill.path).filter(Boolean))),
  };
}
