import type { LoadedSkill, SkillSelectionView } from '../../../../shared/types';
import { skillKey, sourceLabel } from '../../app/formatters';

interface SkillsModuleProps {
  skills: LoadedSkill[];
  enabledSkillKeys: Set<string>;
  skillSelection: SkillSelectionView | null;
  workspaceReady: boolean;
  onInstallSkill: (slug: string) => void;
  onToggleSkill: (skill: LoadedSkill) => void;
}

export function SkillsModule({ skills, enabledSkillKeys, skillSelection, workspaceReady, onInstallSkill, onToggleSkill }: SkillsModuleProps) {
  return (
    <section className="panel full-panel">
      <div className="panel-title"><div><p className="eyebrow">Skills</p><h3>高级能力库</h3></div><span className="status-pill">{skillSelection?.enabledSkills.length ?? 0} 已启用</span></div>
      <div className="skills-grid">
        {skills.map((skill) => {
          const enabled = enabledSkillKeys.has(skillKey(skill));
          return (
            <article key={`${skill.source}:${skill.slug}`} className={`skill-card ${enabled ? 'enabled' : ''} ${skill.valid ? '' : 'invalid'}`}>
              <div>
                <strong>{skill.metadata.icon ?? '◇'} {skill.metadata.name}</strong>
                <p>{skill.metadata.description}</p>
                <small>{sourceLabel(skill.source)} · {skill.slug}</small>
                {skill.error ? <em>{skill.error}</em> : null}
              </div>
              <div className="skill-actions">
                {skill.source === 'builtin' ? <button className="ghost small" disabled={!workspaceReady} onClick={() => onInstallSkill(skill.slug)}>安装</button> : null}
                <button className="primary small" disabled={!workspaceReady || !skill.valid} onClick={() => onToggleSkill(skill)}>{enabled ? '停用' : '启用'}</button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
