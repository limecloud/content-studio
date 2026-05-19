import { useState } from 'react';
import type { LoadedSkill, SkillSelectionView } from '../../../../shared/types';
import { skillKey, sourceLabel } from '../../app/formatters';
import { DetailDialog } from '../DetailDialog';

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
  const [detailSkillKey, setDetailSkillKey] = useState<string | null>(null);
  const detailSkill = detailSkillKey ? skills.find((skill) => skillKey(skill) === detailSkillKey) : undefined;
  const openSkillDetail = (key: string) => {
    onSelectSkill(key);
    setDetailSkillKey(key);
  };

  return (
    <section className="module-grid">
      <article className="panel full-panel">
        <div className="panel-title"><div><p className="eyebrow">能力库</p><h3>内容生成能力</h3></div><span className="status-pill">{skillSelection?.enabledSkills.length ?? 0} 已启用</span></div>
        <div className="skills-grid">
          {skills.map((skill) => {
            const key = skillKey(skill);
            const enabled = enabledSkillKeys.has(key);
            return (
              <article key={key} className={`skill-card ${selectedSkillKey === key ? 'active' : ''} ${enabled ? 'enabled' : ''} ${skill.valid ? '' : 'invalid'}`}>
                <button className="skill-card-main" onClick={() => openSkillDetail(key)}>
                  <strong>{skill.metadata.icon ?? '◇'} {skill.metadata.name}</strong>
                  <p>{skill.metadata.description}</p>
                  <small>{sourceLabel(skill.source)} · {skill.slug}</small>
                  {skill.error ? <em>{skill.error}</em> : null}
                </button>
                <div className="skill-actions">
                  <button className="ghost small" onClick={() => openSkillDetail(key)}>详情</button>
                  {skill.source === 'builtin' ? <button className="ghost small" disabled={!workspaceReady} onClick={() => onInstallSkill(skill.slug)}>安装</button> : null}
                  <button className="primary small" disabled={!workspaceReady || !skill.valid} onClick={() => onToggleSkill(skill)}>{enabled ? '停用' : '启用'}</button>
                </div>
              </article>
            );
          })}
        </div>
      </article>

      {detailSkill ? (
        <DetailDialog
          eyebrow="能力详情"
          title={`${detailSkill.metadata.icon ?? '◇'} ${detailSkill.metadata.name}`}
          description={detailSkill.metadata.description}
          onClose={() => setDetailSkillKey(null)}
        >
          <div className="detail-panel">
            <div className="status-line">
              <span>{sourceLabel(detailSkill.source)}</span>
              <span>{detailSkill.valid ? '有效' : '无效'}</span>
              <span>{enabledSkillKeys.has(skillKey(detailSkill)) ? '当前启用' : '未启用'}</span>
            </div>
            <div className="path-code">{detailSkill.path}</div>
            <div className="header-actions inline-actions">
              <button className="ghost small" onClick={() => onCopySkillPath(detailSkill)}>
                {copiedSkillKey === skillKey(detailSkill) ? '已复制路径' : '复制路径'}
              </button>
              <button className="primary small" disabled={!workspaceReady || !detailSkill.valid} onClick={() => onToggleSkill(detailSkill)}>
                {enabledSkillKeys.has(skillKey(detailSkill)) ? '停用此能力' : '启用此能力'}
              </button>
            </div>
            {detailSkill.error ? <div className="error-banner">{detailSkill.error}</div> : null}
            <div className="metadata-grid">
              <span>slug: {detailSkill.slug}</span>
              <span>source: {detailSkill.source}</span>
              <span>valid: {String(detailSkill.valid)}</span>
            </div>
            <div className="detail-stack">
              <strong>globs</strong>
              <p>{detailSkill.metadata.globs?.join(' / ') || '未声明'}</p>
              <strong>alwaysAllow</strong>
              <p>{detailSkill.metadata.alwaysAllow?.join(' / ') || '未声明'}</p>
              <strong>requiredSources</strong>
              <p>{detailSkill.metadata.requiredSources?.join(' / ') || '未声明'}</p>
            </div>
          </div>
        </DetailDialog>
      ) : null}
    </section>
  );
}
