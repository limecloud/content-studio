import matter from 'gray-matter';
import { cp, mkdir, readFile } from 'node:fs/promises';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import type { LoadedSkill, SkillMetadata, SkillSource } from '../../shared/types';
import { getResourcesRoot } from './paths';

function normalizeStringArray(value: unknown): string[] | undefined {
  const values = typeof value === 'string' ? [value] : Array.isArray(value) ? value : undefined;
  const normalized = values?.filter((item): item is string => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  return normalized && normalized.length > 0 ? Array.from(new Set(normalized)) : undefined;
}

function parseSkill(content: string): { metadata: SkillMetadata } | null {
  const parsed = matter(content);
  if (typeof parsed.data.name !== 'string' || typeof parsed.data.description !== 'string') {
    return null;
  }
  return {
    metadata: {
      name: parsed.data.name,
      description: parsed.data.description,
      globs: normalizeStringArray(parsed.data.globs),
      alwaysAllow: normalizeStringArray(parsed.data.alwaysAllow),
      requiredSources: normalizeStringArray(parsed.data.requiredSources),
      icon: typeof parsed.data.icon === 'string' ? parsed.data.icon : undefined,
    },
  };
}

async function loadSkillFromDir(path: string, source: SkillSource): Promise<LoadedSkill | null> {
  const skillPath = join(path, 'SKILL.md');
  if (!existsSync(skillPath)) {
    return null;
  }
  try {
    const parsed = parseSkill(await readFile(skillPath, 'utf-8'));
    if (!parsed) {
      return {
        slug: basename(path),
        source,
        path,
        valid: false,
        error: 'SKILL.md 缺少 name 或 description frontmatter',
        metadata: { name: basename(path), description: 'Invalid skill' },
      };
    }
    return {
      slug: basename(path),
      source,
      path,
      metadata: parsed.metadata,
      valid: true,
    };
  } catch (error) {
    return {
      slug: basename(path),
      source,
      path,
      valid: false,
      error: error instanceof Error ? error.message : String(error),
      metadata: { name: basename(path), description: 'Unreadable skill' },
    };
  }
}

async function loadSkillsFromRoot(root: string, source: SkillSource): Promise<LoadedSkill[]> {
  if (!existsSync(root)) {
    return [];
  }
  return Promise.all(
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => loadSkillFromDir(join(root, entry.name), source)),
  ).then((items) => items.filter((item): item is LoadedSkill => Boolean(item)));
}

export class SkillManager {
  async scan(workspacePath?: string): Promise<LoadedSkill[]> {
    const roots: Array<{ path: string; source: SkillSource }> = [
      { path: join(getResourcesRoot(), 'skills'), source: 'builtin' },
    ];
    if (process.env.CONTENT_STUDIO_INCLUDE_USER_SKILLS === '1') {
      roots.push(
        { path: join(homedir(), '.claude', 'skills'), source: 'user' },
        { path: join(homedir(), '.agents', 'skills'), source: 'user-compat' },
      );
    }
    if (workspacePath) {
      roots.unshift(
        { path: join(workspacePath, '.claude', 'skills'), source: 'project' },
        { path: join(workspacePath, '.agents', 'skills'), source: 'project-compat' },
      );
    }
    const skills = (await Promise.all(roots.map((root) => loadSkillsFromRoot(root.path, root.source)))).flat();
    return skills.sort((a, b) => `${a.source}:${a.slug}`.localeCompare(`${b.source}:${b.slug}`));
  }

  async installBuiltin(slug: string, workspacePath: string): Promise<void> {
    const source = join(getResourcesRoot(), 'skills', slug);
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      throw new Error(`内置能力不存在: ${slug}`);
    }
    const target = join(workspacePath, '.claude', 'skills', slug);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, force: true });
  }
}
