import type { LoadedSkill, SkillSelectionView } from '../../../../shared/types';
import { skillKey, sourceLabel } from '../../app/formatters';

interface SkillsModuleProps {
  skills: LoadedSkill[];
  enabledSkillKeys: Set<string>;
  skillSelection: SkillSelectionView | null;
  activeSkill?: LoadedSkill;
  activeSkillKey: string;
  copiedSkillKey: string | null;
  workspaceReady: boolean;
  onSelectSkill: (key: string) => void;
  onInstallSkill: (slug: string) => void;
  onToggleSkill: (skill: LoadedSkill) => void;
  onCopySkillPath: (skill: LoadedSkill) => void;
}

export function SkillsModule({
  skills,
  enabledSkillKeys,
  skillSelection,
  activeSkill,
  activeSkillKey,
  copiedSkillKey,
  workspaceReady,
  onSelectSkill,
  onInstallSkill,
  onToggleSkill,
  onCopySkillPath,
}: SkillsModuleProps) {
  const selectedSkillKey = activeSkill ? skillKey(activeSkill) : activeSkillKey;

  return (
    <section className="module-grid two-col">
      <article className="panel">
        <div className="panel-title"><div><p className="eyebrow">Skills</p><h3>高级能力库</h3></div><span className="status-pill">{skillSelection?.enabledSkills.length ?? 0} 已启用</span></div>
        <div className="skills-grid">
          {skills.map((skill) => {
            const key = skillKey(skill);
            const enabled = enabledSkillKeys.has(key);
            return (
              <article key={key} className={`skill-card ${selectedSkillKey === key ? 'active' : ''} ${enabled ? 'enabled' : ''} ${skill.valid ? '' : 'invalid'}`}>
                <button className="skill-card-main" onClick={() => onSelectSkill(key)}>
                  <strong>{skill.metadata.icon ?? '◇'} {skill.metadata.name}</strong>
                  <p>{skill.metadata.description}</p>
                  <small>{sourceLabel(skill.source)} · {skill.slug}</small>
                  {skill.error ? <em>{skill.error}</em> : null}
                </button>
                <div className="skill-actions">
                  {skill.source === 'builtin' ? <button className="ghost small" disabled={!workspaceReady} onClick={() => onInstallSkill(skill.slug)}>安装</button> : null}
                  <button className="primary small" disabled={!workspaceReady || !skill.valid} onClick={() => onToggleSkill(skill)}>{enabled ? '停用' : '启用'}</button>
                </div>
              </article>
            );
          })}
        </div>
      </article>

      <article className="panel detail-panel">
        <div className="panel-title"><div><p className="eyebrow">Skill Detail</p><h3>能力详情</h3></div></div>
        {activeSkill ? (
          <>
            <div className="status-line">
              <span>{sourceLabel(activeSkill.source)}</span>
              <span>{activeSkill.valid ? '有效' : '无效'}</span>
              <span>{enabledSkillKeys.has(skillKey(activeSkill)) ? '当前启用' : '未启用'}</span>
            </div>
            <h3>{activeSkill.metadata.icon ?? '◇'} {activeSkill.metadata.name}</h3>
            <p>{activeSkill.metadata.description}</p>
            <div className="path-code">{activeSkill.path}</div>
            <div className="header-actions inline-actions">
              <button className="ghost small" onClick={() => onCopySkillPath(activeSkill)}>
                {copiedSkillKey === skillKey(activeSkill) ? '已复制路径' : '复制路径'}
              </button>
              <button className="primary small" disabled={!workspaceReady || !activeSkill.valid} onClick={() => onToggleSkill(activeSkill)}>
                {enabledSkillKeys.has(skillKey(activeSkill)) ? '停用此 Skill' : '启用此 Skill'}
              </button>
            </div>
            {activeSkill.error ? <div className="error-banner">{activeSkill.error}</div> : null}
            <div className="metadata-grid">
              <span>slug: {activeSkill.slug}</span>
              <span>source: {activeSkill.source}</span>
              <span>valid: {String(activeSkill.valid)}</span>
            </div>
            <div className="detail-stack">
              <strong>globs</strong>
              <p>{activeSkill.metadata.globs?.join(' / ') || '未声明'}</p>
              <strong>alwaysAllow</strong>
              <p>{activeSkill.metadata.alwaysAllow?.join(' / ') || '未声明'}</p>
              <strong>requiredSources</strong>
              <p>{activeSkill.metadata.requiredSources?.join(' / ') || '未声明'}</p>
            </div>
          </>
        ) : <div className="empty-state">扫描到 Skills 后，选择一项查看 frontmatter、来源、路径和校验错误。</div>}
      </article>
    </section>
  );
}
