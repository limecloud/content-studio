import { join } from 'node:path';
import type { SkillRef, SkillSelectionView } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

interface StoredSkillSelection {
  enabledSkills?: SkillRef[];
  updatedAt?: string;
}

const DEFAULT_ENABLED: SkillRef[] = [
  { slug: 'knowledge-citation-picker', source: 'builtin' },
  { slug: 'prompt-pack-builder', source: 'builtin' },
  { slug: 'scene-library-builder', source: 'builtin' },
  { slug: 'article-drafter', source: 'builtin' },
  { slug: 'publish-checker', source: 'builtin' },
];

function filePathFor(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'skill-selection.json');
}

function sameSkill(a: SkillRef, b: SkillRef): boolean {
  return a.slug === b.slug && a.source === b.source;
}

export class SkillSelectionStore {
  async read(workspacePath: string): Promise<SkillSelectionView> {
    const stored = await readJsonFile<StoredSkillSelection>(filePathFor(workspacePath), {});
    return {
      workspacePath,
      enabledSkills: stored.enabledSkills?.length ? stored.enabledSkills : DEFAULT_ENABLED,
      updatedAt: stored.updatedAt,
    };
  }

  async setEnabled(workspacePath: string, skill: SkillRef, enabled: boolean): Promise<SkillSelectionView> {
    const current = await this.read(workspacePath);
    const enabledSkills = enabled
      ? current.enabledSkills.some((item) => sameSkill(item, skill))
        ? current.enabledSkills
        : [...current.enabledSkills, skill]
      : current.enabledSkills.filter((item) => !sameSkill(item, skill));
    const next: StoredSkillSelection = { enabledSkills, updatedAt: new Date().toISOString() };
    await writeJsonFile(filePathFor(workspacePath), next);
    return this.read(workspacePath);
  }
}
