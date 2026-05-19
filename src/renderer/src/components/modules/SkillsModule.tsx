import { useMemo, useState } from 'react';
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

type SkillScope = 'all' | 'builtin' | 'installed';
type SkillSort = 'default' | 'name' | 'source';

const SKILL_SCOPE_TABS: Array<{ key: SkillScope; label: string }> = [
  { key: 'all', label: '技能广场' },
  { key: 'builtin', label: '内置' },
  { key: 'installed', label: '用户安装' },
];

function normalizeText(value: string): string {
  return value.toLowerCase().trim();
}

function isBuiltinSkill(skill: LoadedSkill): boolean {
  return skill.source === 'builtin';
}

function scopeOf(skill: LoadedSkill): Exclude<SkillScope, 'all'> {
  return isBuiltinSkill(skill) ? 'builtin' : 'installed';
}

function compareSkills(a: LoadedSkill, b: LoadedSkill, enabledSkillKeys: Set<string>, sort: SkillSort): number {
  const aEnabled = enabledSkillKeys.has(skillKey(a));
  const bEnabled = enabledSkillKeys.has(skillKey(b));

  if (sort === 'name') {
    return a.metadata.name.localeCompare(b.metadata.name, 'zh-Hans-CN');
  }

  if (sort === 'source' && a.source !== b.source) {
    return scopeOf(a) === 'builtin' ? -1 : 1;
  }

  if (aEnabled !== bEnabled) {
    return aEnabled ? -1 : 1;
  }

  if (a.source !== b.source) {
    return scopeOf(a) === 'builtin' ? -1 : 1;
  }

  return a.metadata.name.localeCompare(b.metadata.name, 'zh-Hans-CN');
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
  const [scopeFilter, setScopeFilter] = useState<SkillScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SkillSort>('default');

  const detailSkill = detailSkillKey ? skills.find((skill) => skillKey(skill) === detailSkillKey) : undefined;
  const enabledCount = skillSelection?.enabledSkills.length ?? 0;
  const builtinCount = skills.filter(isBuiltinSkill).length;
  const installedCount = skills.length - builtinCount;

  const filteredSkills = useMemo(() => {
    const query = normalizeText(searchQuery);
    return skills
      .filter((skill) => {
        if (scopeFilter !== 'all' && scopeOf(skill) !== scopeFilter) return false;
        if (!query) return true;
        return [
          skill.metadata.name,
          skill.metadata.description,
          skill.slug,
          skill.path,
          skill.error ?? '',
          sourceLabel(skill.source),
        ].some((value) => normalizeText(value).includes(query));
      })
      .sort((a, b) => compareSkills(a, b, enabledSkillKeys, sortMode));
  }, [enabledSkillKeys, scopeFilter, searchQuery, skills, sortMode]);

  const featuredSkills = filteredSkills.filter(isBuiltinSkill).slice(0, 6);
  const featuredSkillKeys = new Set(featuredSkills.map((skill) => skillKey(skill)));
  const otherSkills = filteredSkills.filter((skill) => !featuredSkillKeys.has(skillKey(skill)));
  const heroSkills = useMemo(() => [...skills].sort((a, b) => compareSkills(a, b, enabledSkillKeys, 'default')).slice(0, 3), [enabledSkillKeys, skills]);

  const openSkillDetail = (key: string) => {
    onSelectSkill(key);
    setDetailSkillKey(key);
  };

  const renderSkillCard = (skill: LoadedSkill) => {
    const key = skillKey(skill);
    const enabled = enabledSkillKeys.has(key);
    return (
      <article key={key} className={`skill-card ${selectedSkillKey === key ? 'active' : ''} ${enabled ? 'enabled' : ''} ${skill.valid ? '' : 'invalid'}`}>
        <button className="skill-card-main" onClick={() => openSkillDetail(key)} aria-expanded={selectedSkillKey === key}>
          <div className="skill-card-topline">
            <span className="skill-icon">{skill.metadata.icon ?? '◇'}</span>
            <div className="skill-card-heading">
              <strong>{skill.metadata.name}</strong>
              <small>{skill.slug}</small>
            </div>
            <span className="skill-source-pill">{sourceLabel(skill.source)}</span>
          </div>
          <p>{skill.metadata.description}</p>
          <div className="skill-card-meta">
            <span>{skill.valid ? '有效' : '无效'}</span>
            <span>{enabled ? '已启用' : '未启用'}</span>
            {skill.error ? <span className="skill-error-pill">错误</span> : null}
          </div>
          {skill.error ? <em>{skill.error}</em> : null}
        </button>
        <div className="skill-actions">
          <button className="ghost small" onClick={() => openSkillDetail(key)}>详情</button>
          {skill.source === 'builtin' ? <button className="ghost small" disabled={!workspaceReady} onClick={() => onInstallSkill(skill.slug)}>安装</button> : null}
          <button className="primary small" disabled={!workspaceReady || !skill.valid} onClick={() => onToggleSkill(skill)}>
            {enabled ? '停用' : '启用'}
          </button>
        </div>
      </article>
    );
  };

  return (
    <section className="skills-workbench">
      <header className="panel skills-hero">
        <div className="skills-hero-copy">
          <p className="eyebrow">skills</p>
          <h2>skills 管理</h2>
          <p>安装与管理技能，在对话中扩展内容工厂的能力。</p>
          <div className="skills-hero-stats">
            <span><strong>{skills.length}</strong><small>总数</small></span>
            <span><strong>{enabledCount}</strong><small>已启用</small></span>
            <span><strong>{builtinCount}</strong><small>内置</small></span>
          </div>
          <div className="skills-source-tabs" role="tablist" aria-label="技能分类">
            {SKILL_SCOPE_TABS.map((tab) => {
              const count = tab.key === 'all' ? skills.length : tab.key === 'builtin' ? builtinCount : installedCount;
              return (
                <button
                  key={tab.key}
                  role="tab"
                  aria-selected={scopeFilter === tab.key}
                  className={scopeFilter === tab.key ? 'active' : ''}
                  onClick={() => setScopeFilter(tab.key)}
                >
                  <strong>{tab.label}</strong>
                  <span>{count}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="skills-hero-side">
          <div className="skills-toolbar-actions">
            <label className="skills-search">
              <span>搜索技能</span>
              <input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="搜索技能名称、slug 或说明"
              />
            </label>
            <label className="skills-sort">
              <span>排序</span>
              <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SkillSort)}>
                <option value="default">默认</option>
                <option value="name">名称</option>
                <option value="source">来源</option>
              </select>
            </label>
          </div>
          <div className="skills-hero-visual" aria-hidden="true">
            {heroSkills.map((skill, index) => (
              <article key={skillKey(skill)} className={`skills-hero-card skills-hero-card-${index + 1}`}>
                <span>{skill.metadata.icon ?? '◇'}</span>
                <strong>{skill.metadata.name}</strong>
                <small>{sourceLabel(skill.source)} · {skill.slug}</small>
              </article>
            ))}
          </div>
        </div>
      </header>

      <section className="skills-section-block">
        <div className="skills-section-header">
          <div>
            <p className="eyebrow">官方精选</p>
            <h3>官方精选</h3>
          </div>
          <span>{featuredSkills.length} 个</span>
        </div>
        {featuredSkills.length > 0 ? (
          <div className="skills-card-grid">
            {featuredSkills.map(renderSkillCard)}
          </div>
        ) : (
          <div className="empty-state">没有符合当前筛选条件的内置技能。</div>
        )}
      </section>

      <section className="skills-section-block">
        <div className="skills-section-header">
          <div>
            <p className="eyebrow">其他技能</p>
            <h3>其他技能</h3>
          </div>
          <span>{otherSkills.length} 个</span>
        </div>
        {otherSkills.length > 0 ? (
          <div className="skills-card-grid">
            {otherSkills.map(renderSkillCard)}
          </div>
        ) : (
          <div className="empty-state">没有更多符合当前筛选条件的技能。</div>
        )}
      </section>

      {detailSkill ? (
        <DetailDialog
          eyebrow="skills 详情"
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
                {enabledSkillKeys.has(skillKey(detailSkill)) ? '停用此 skill' : '启用此 skill'}
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
