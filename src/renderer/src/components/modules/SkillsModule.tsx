import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { LoadedSkill, SkillPackageFileNode, SkillSelectionView } from '../../../../shared/types';
import { skillKey, sourceLabel } from '../../app/formatters';
import { DetailDialog } from '../DetailDialog';

interface CreateSkillDraft {
  slug: string;
  name?: string;
  description?: string;
}

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
  onCreateSkill: (draft: CreateSkillDraft) => void;
  onUploadSkillPackage: () => void;
  onOpenSkillFolder: (skill: LoadedSkill) => void;
  onRenameSkill: (skill: LoadedSkill, nextSlug: string) => void;
  onReplaceSkillPackage: (skill: LoadedSkill) => void;
  onUninstallSkill: (skill: LoadedSkill) => void;
  onToggleSkill: (skill: LoadedSkill) => void;
  onCopySkillPath: (skill: LoadedSkill) => void;
  onOpenSkillPackage: (packagePath: string) => void;
  onReadSkillFile: (skill: LoadedSkill, relativePath: string) => Promise<string>;
}

type SkillScope = 'all' | 'builtin' | 'installed';
type SkillSort = 'default' | 'name' | 'source';
type SkillIconName =
  | 'search'
  | 'plus'
  | 'bookOpen'
  | 'filePlus'
  | 'upload'
  | 'message'
  | 'pencil'
  | 'replace'
  | 'folder'
  | 'trash'
  | 'copy'
  | 'chevronDown'
  | 'eye'
  | 'code'
  | 'moreVertical';

type SkillMarkdownBlock =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }
  | { kind: 'quote'; text: string }
  | { kind: 'code'; language?: string; text: string };

const SKILL_SCOPE_TABS: Array<{ key: SkillScope; label: string }> = [
  { key: 'all', label: '技能广场' },
  { key: 'builtin', label: '内置' },
  { key: 'installed', label: '用户安装' },
];

const ICON_PATHS: Record<SkillIconName, ReactNode> = {
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m16.5 16.5 3.5 3.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  bookOpen: (
    <>
      <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5z" />
      <path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5A2.5 2.5 0 0 1 20 21.5z" />
    </>
  ),
  filePlus: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M12 11v6M9 14h6" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M4 20h16" />
    </>
  ),
  message: (
    <>
      <path d="M21 12a8 8 0 0 1-8 8H6l-4 3 1.4-5.2A8 8 0 1 1 21 12z" />
      <path d="M8 11h8M8 15h5" />
    </>
  ),
  pencil: (
    <>
      <path d="M17 3 21 7 10 18l-5 1 1-5z" />
      <path d="m15 5 4 4" />
    </>
  ),
  replace: (
    <>
      <path d="M16 3h5v5" />
      <path d="m21 3-7 7" />
      <path d="M8 21H3v-5" />
      <path d="m3 21 7-7" />
    </>
  ),
  folder: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 10h18" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M10 11v6M14 11v6" />
      <path d="M6 7l1 14h10l1-14" />
      <path d="M9 7V4h6v3" />
    </>
  ),
  copy: (
    <>
      <rect x="8" y="8" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1" />
    </>
  ),
  chevronDown: <path d="m6 9 6 6 6-6" />,
  eye: (
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  code: <path d="m8 9-4 3 4 3M16 9l4 3-4 3M14 5l-4 14" />,
  moreVertical: (
    <>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" />
    </>
  ),
};

function SkillIcon({ name }: { name: SkillIconName }) {
  return (
    <svg className="skill-ui-icon" viewBox="0 0 24 24" aria-hidden="true">
      {ICON_PATHS[name]}
    </svg>
  );
}

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

function formatSkillDate(value?: string): string {
  if (!value) return '未记录';
  const time = Date.parse(value);
  return Number.isFinite(time) ? new Date(time).toLocaleDateString('zh-Hans-CN', { year: 'numeric', month: 'short', day: 'numeric' }) : value;
}

function skillMarkdownBody(content?: string): string {
  if (!content) return '未读取到 SKILL.md 正文。';
  return content.replace(/^---[\s\S]*?---\s*/, '').trim();
}

function isMarkdownBlockStart(line: string): boolean {
  const trimmed = line.trim();
  return /^(#{1,3})\s+/.test(trimmed)
    || /^```/.test(trimmed)
    || /^[-*]\s+/.test(trimmed)
    || /^\d+\.\s+/.test(trimmed)
    || /^>\s?/.test(trimmed);
}

function parseSkillMarkdown(markdown: string): SkillMarkdownBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const blocks: SkillMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed) {
      index += 1;
      continue;
    }

    const codeMatch = trimmed.match(/^```(.*)$/);
    if (codeMatch) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ kind: 'code', language: codeMatch[1]?.trim(), text: codeLines.join('\n') });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      blocks.push({
        kind: 'heading',
        level: Math.min(headingMatch[1].length, 3) as 1 | 2 | 3,
        text: headingMatch[2].trim(),
      });
      index += 1;
      continue;
    }

    if (/^[-*]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
      const ordered = /^\d+\.\s+/.test(trimmed);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].trim();
        const match = ordered ? item.match(/^\d+\.\s+(.+)$/) : item.match(/^[-*]\s+(.+)$/);
        if (!match) break;
        items.push(match[1].trim());
        index += 1;
      }
      blocks.push({ kind: 'list', ordered, items });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index].trim())) {
        quoteLines.push(lines[index].trim().replace(/^>\s?/, ''));
        index += 1;
      }
      blocks.push({ kind: 'quote', text: quoteLines.join(' ') });
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() && !isMarkdownBlockStart(lines[index])) {
      paragraphLines.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ kind: 'paragraph', text: paragraphLines.join(' ') });
  }

  return blocks;
}

function renderInlineMarkdown(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((part, index) => {
    if (part.startsWith('`') && part.endsWith('`')) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function isManagedProjectSkill(skill: LoadedSkill): boolean {
  return skill.source === 'project' && /[/\\]\.bugu[/\\]skills[/\\]/.test(skill.path);
}

function SkillDocument({ content }: { content?: string }) {
  const blocks = parseSkillMarkdown(skillMarkdownBody(content));
  return (
    <div className="skill-document-body">
      {blocks.map((block, index) => {
        if (block.kind === 'heading') {
          const Heading = `h${block.level}` as 'h1' | 'h2' | 'h3';
          return <Heading key={index}>{renderInlineMarkdown(block.text)}</Heading>;
        }
        if (block.kind === 'list') {
          const List = block.ordered ? 'ol' : 'ul';
          return (
            <List key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>{renderInlineMarkdown(item)}</li>
              ))}
            </List>
          );
        }
        if (block.kind === 'quote') {
          return <blockquote key={index}>{renderInlineMarkdown(block.text)}</blockquote>;
        }
        if (block.kind === 'code') {
          return (
            <pre key={index} className="skill-document-code">
              <code>{block.text}</code>
            </pre>
          );
        }
        return <p key={index}>{renderInlineMarkdown(block.text)}</p>;
      })}
    </div>
  );
}

function flattenSkillFiles(nodes: SkillPackageFileNode[] = []): SkillPackageFileNode[] {
  return nodes.flatMap((node) => [
    node,
    ...flattenSkillFiles(node.children),
  ]);
}

function firstSkillFilePath(nodes: SkillPackageFileNode[] = []): string {
  const files = flattenSkillFiles(nodes).filter((node) => node.kind === 'file');
  return files.find((node) => node.path === 'SKILL.md')?.path ?? files[0]?.path ?? 'SKILL.md';
}

function fileGlyph(node: SkillPackageFileNode): string {
  if (node.kind === 'directory') return '▸';
  if (node.name.endsWith('.md')) return '◇';
  return '·';
}

async function getDroppedSkillPackagePath(file: File): Promise<string | null> {
  const directPath = (file as File & { path?: string }).path;
  if (typeof directPath === 'string' && directPath.trim()) {
    return directPath;
  }

  try {
    const bridgedPath = window.contentStudio.getPathForFile(file);
    if (bridgedPath?.trim()) return bridgedPath;
  } catch {
    // Electron 的 File.path 在新版本不稳定；下面用文件内容暂存为本地 .skill 继续安装。
  }

  const data = await file.arrayBuffer();
  return window.contentStudio.stageSkillPackage({
    fileName: file.name,
    data,
  });
}

function hasFileDrag(event: Pick<DragEvent, 'dataTransfer'>): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

function SkillFileTree({
  nodes,
  selectedPath,
  onSelect,
}: {
  nodes: SkillPackageFileNode[];
  selectedPath: string;
  onSelect: (path: string) => void;
}) {
  return (
    <div className="skill-file-tree">
      {nodes.map((node) => (
        <div key={node.path} className="skill-file-tree-node">
          <button
            type="button"
            className={selectedPath === node.path ? 'active' : ''}
            disabled={node.kind === 'directory'}
            onClick={() => node.kind === 'file' && onSelect(node.path)}
          >
            <span>{fileGlyph(node)}</span>
            {node.name}
          </button>
          {node.children?.length ? (
            <div className="skill-file-tree-children">
              <SkillFileTree nodes={node.children} selectedPath={selectedPath} onSelect={onSelect} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
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
  onCreateSkill,
  onUploadSkillPackage,
  onOpenSkillFolder,
  onRenameSkill,
  onReplaceSkillPackage,
  onUninstallSkill,
  onToggleSkill,
  onCopySkillPath,
  onOpenSkillPackage,
  onReadSkillFile,
}: SkillsModuleProps) {
  const selectedSkillKey = activeSkill ? skillKey(activeSkill) : activeSkillKey;
  const [detailSkillKey, setDetailSkillKey] = useState<string | null>(null);
  const [dialogSkillKey, setDialogSkillKey] = useState<string | null>(null);
  const [scopeFilter, setScopeFilter] = useState<SkillScope>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SkillSort>('default');
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState('SKILL.md');
  const [selectedFileContent, setSelectedFileContent] = useState('');
  const [markdownViewMode, setMarkdownViewMode] = useState<'preview' | 'source'>('preview');
  const [selectedFileBusy, setSelectedFileBusy] = useState(false);
  const [selectedFileError, setSelectedFileError] = useState<string | null>(null);
  const [collapsedSkillGroups, setCollapsedSkillGroups] = useState({
    personal: false,
    builtin: false,
  });
  const dragDepthRef = useRef(0);

  const detailSkill = detailSkillKey ? skills.find((skill) => skillKey(skill) === detailSkillKey) : undefined;
  const dialogSkill = dialogSkillKey ? skills.find((skill) => skillKey(skill) === dialogSkillKey) : undefined;
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
  const selectedSkill = detailSkill ?? activeSkill ?? filteredSkills[0] ?? skills[0];
  const selectedKey = selectedSkill ? skillKey(selectedSkill) : '';
  const managedSelected = selectedSkill ? isManagedProjectSkill(selectedSkill) : false;
  const selectedEnabled = selectedSkill ? enabledSkillKeys.has(skillKey(selectedSkill)) : false;
  const selectedCopied = selectedSkill ? copiedSkillKey === skillKey(selectedSkill) : false;
  const personalSkills = filteredSkills.filter((skill) => !isBuiltinSkill(skill));
  const builtinSkills = filteredSkills.filter(isBuiltinSkill);
  const selectedFiles = selectedSkill?.files?.length ? selectedSkill.files : [{ name: 'SKILL.md', path: 'SKILL.md', kind: 'file' as const }];
  const hasMultipleFiles = flattenSkillFiles(selectedFiles).filter((node) => node.kind === 'file').length > 1;
  const selectedFileIsMarkdown = selectedFilePath.toLowerCase().endsWith('.md');

  useEffect(() => {
    if (!selectedSkill) return;
    const nextPath = firstSkillFilePath(selectedSkill.files);
    setSelectedFilePath(nextPath);
    setSelectedFileContent(nextPath === 'SKILL.md' ? selectedSkill.content ?? '' : '');
    setMarkdownViewMode('preview');
    setSelectedFileError(null);
  }, [selectedSkill?.path, selectedSkill?.updatedAt]);

  useEffect(() => {
    if (!selectedSkill) return;
    let alive = true;
    setSelectedFileBusy(true);
    setSelectedFileError(null);
    const load = selectedFilePath === 'SKILL.md'
      ? Promise.resolve(selectedSkill.content ?? '')
      : onReadSkillFile(selectedSkill, selectedFilePath);
    void load
      .then((content) => {
        if (alive) setSelectedFileContent(content);
      })
      .catch((error) => {
        if (alive) {
          setSelectedFileError(error instanceof Error ? error.message : String(error));
          setSelectedFileContent('');
        }
      })
      .finally(() => {
        if (alive) setSelectedFileBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [onReadSkillFile, selectedFilePath, selectedSkill?.path, selectedSkill?.updatedAt]);

  const openSkillDetail = (key: string) => {
    onSelectSkill(key);
    setDetailSkillKey(key);
    setSkillMenuOpen(false);
  };

  const selectSkillFile = (path: string) => {
    setSelectedFilePath(path);
    setMarkdownViewMode('preview');
  };

  const browseSkills = () => {
    setScopeFilter('all');
    setSearchQuery('');
    setCreateMenuOpen(false);
  };

  const createProjectSkill = () => {
    const slug = window.prompt('输入新的 skill slug，例如 article-typesetting')?.trim();
    if (!slug) return;
    const name = window.prompt('输入 skill 显示名称', slug)?.trim();
    const description = window.prompt('输入 skill 描述', `用于 ${name || slug} 的本地 skill。`)?.trim();
    onCreateSkill({
      slug,
      name: name || undefined,
      description: description || undefined,
    });
    setCreateMenuOpen(false);
  };

  const renameSelectedSkill = () => {
    if (!selectedSkill) return;
    const nextSlug = window.prompt('输入新的 skill 名称', selectedSkill.slug)?.trim();
    if (!nextSlug || nextSlug === selectedSkill.slug) return;
    onRenameSkill(selectedSkill, nextSlug);
    setDetailSkillKey(skillKey({ slug: nextSlug, source: 'project' }));
    setSkillMenuOpen(false);
  };

  const replaceSelectedSkill = () => {
    if (!selectedSkill) return;
    if (!window.confirm(`确定替换 ${selectedSkill.slug}？请选择同名 .skill 安装包。`)) return;
    onReplaceSkillPackage(selectedSkill);
    setSkillMenuOpen(false);
  };

  const uninstallSelectedSkill = () => {
    if (!selectedSkill) return;
    if (!window.confirm(`确定卸载 ${selectedSkill.slug}？此操作会删除工作区 .bugu/skills 中的该目录。`)) return;
    onUninstallSkill(selectedSkill);
    setDetailSkillKey(null);
    setSkillMenuOpen(false);
  };

  const toggleSkillGroup = (group: keyof typeof collapsedSkillGroups) => {
    setCollapsedSkillGroups((current) => ({
      ...current,
      [group]: !current[group],
    }));
  };

  useEffect(() => {
    const handleDragEnter = (event: DragEvent) => {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      if (!workspaceReady) return;
      dragDepthRef.current += 1;
      setDragActive(true);
    };

    const handleDragOver = (event: DragEvent) => {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      if (!workspaceReady) return;
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return;
      dataTransfer.dropEffect = 'copy';
      setDragActive(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      if (!workspaceReady) return;
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDragActive(false);
      }
    };

    const handleDrop = async (event: DragEvent) => {
      if (!hasFileDrag(event)) return;
      event.preventDefault();
      dragDepthRef.current = 0;
      setDragActive(false);
      setDropError(null);

      if (!workspaceReady) {
        setDropError('请先选择工作区，再拖入 .skill 安装包。');
        return;
      }

      const skillFile = Array.from(event.dataTransfer?.files ?? [])
        .find((file) => file.name.toLowerCase().endsWith('.skill'));
      if (!skillFile) {
        setDropError('仅支持拖入 .skill 安装包。');
        return;
      }

      try {
        const packagePath = await getDroppedSkillPackagePath(skillFile);
        if (!packagePath) {
          setDropError('无法读取拖入文件，请使用上传按钮选择 .skill。');
          return;
        }
        onOpenSkillPackage(packagePath);
      } catch (error) {
        setDropError(error instanceof Error ? error.message : String(error));
        return;
      }
    };

    window.addEventListener('dragenter', handleDragEnter, true);
    window.addEventListener('dragover', handleDragOver, true);
    window.addEventListener('dragleave', handleDragLeave, true);
    window.addEventListener('drop', handleDrop, true);
    return () => {
      window.removeEventListener('dragenter', handleDragEnter, true);
      window.removeEventListener('dragover', handleDragOver, true);
      window.removeEventListener('dragleave', handleDragLeave, true);
      window.removeEventListener('drop', handleDrop, true);
    };
  }, [onOpenSkillPackage, workspaceReady]);

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
    <section
      className={`skills-manager-shell ${dragActive ? 'drag-over' : ''}`}
      data-skill-drop-target="true"
    >
      {dragActive ? (
        <div className="skills-drop-overlay">
          <div>
            <SkillIcon name="upload" />
            <strong>松开安装 .skill</strong>
            <span>安装目标：当前工作区 .bugu/skills</span>
          </div>
        </div>
      ) : null}
      <aside className="skills-manager-sidebar">
        <header className="skills-manager-sidebar-head">
          <h2>skills 管理</h2>
          <div className="skills-manager-toolbar">
            <button className="icon-button" type="button" title="搜索">
              <SkillIcon name="search" />
            </button>
            <div className="skills-menu-anchor">
              <button
                className="icon-button"
                type="button"
                title="添加 skill"
                onClick={() => setCreateMenuOpen((current) => !current)}
              >
                <SkillIcon name="plus" />
              </button>
              {createMenuOpen ? (
                <div className="skills-popover skills-create-menu">
                  <button type="button" onClick={browseSkills}>
                    <SkillIcon name="bookOpen" />
                    Browse skills
                  </button>
                  <button type="button" disabled={!workspaceReady} onClick={createProjectSkill}>
                    <SkillIcon name="filePlus" />
                    Create skill
                  </button>
                  <button
                    type="button"
                    disabled={!workspaceReady}
                    onClick={() => {
                      setCreateMenuOpen(false);
                      onUploadSkillPackage();
                    }}
                  >
                    <SkillIcon name="upload" />
                    Upload a skill
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="skills-manager-filter">
          {dropError ? <div className="skills-drop-error">{dropError}</div> : null}
          <button
            className="skills-drop-target-button"
            type="button"
            disabled={!workspaceReady}
            onClick={onUploadSkillPackage}
          >
            <SkillIcon name="upload" />
            <span>
              <strong>安装 .skill</strong>
              <small>点击选择，或拖入此页面</small>
            </span>
          </button>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="搜索技能"
          />
          <select value={scopeFilter} onChange={(event) => setScopeFilter(event.target.value as SkillScope)}>
            {SKILL_SCOPE_TABS.map((tab) => (
              <option key={tab.key} value={tab.key}>
                {tab.label}
              </option>
            ))}
          </select>
          <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SkillSort)}>
            <option value="default">默认排序</option>
            <option value="name">按名称</option>
            <option value="source">按来源</option>
          </select>
        </div>

        <div className="skills-manager-list">
          <section>
            <button
              className={`skills-group-title ${collapsedSkillGroups.personal ? 'collapsed' : ''}`}
              type="button"
              aria-expanded={!collapsedSkillGroups.personal}
              onClick={() => toggleSkillGroup('personal')}
            >
              <SkillIcon name="chevronDown" />
              Personal skills
              <em>{personalSkills.length}</em>
            </button>
            {!collapsedSkillGroups.personal && personalSkills.map((skill) => {
              const key = skillKey(skill);
              return (
                <button
                  key={key}
                  className={`skills-list-item ${selectedKey === key ? 'active' : ''}`}
                  type="button"
                  onClick={() => openSkillDetail(key)}
                >
                  <span className="skill-list-icon">{skill.metadata.icon ?? '◇'}</span>
                  <strong>{skill.slug}</strong>
                  {enabledSkillKeys.has(key) ? <small>●</small> : null}
                </button>
              );
            })}
          </section>

          <section>
            <button
              className={`skills-group-title ${collapsedSkillGroups.builtin ? 'collapsed' : ''}`}
              type="button"
              aria-expanded={!collapsedSkillGroups.builtin}
              onClick={() => toggleSkillGroup('builtin')}
            >
              <SkillIcon name="chevronDown" />
              Built-in skills
              <em>{builtinSkills.length}</em>
            </button>
            {!collapsedSkillGroups.builtin && builtinSkills.map((skill) => {
              const key = skillKey(skill);
              return (
                <button
                  key={key}
                  className={`skills-list-item ${selectedKey === key ? 'active' : ''}`}
                  type="button"
                  onClick={() => openSkillDetail(key)}
                >
                  <span className="skill-list-icon">{skill.metadata.icon ?? '◇'}</span>
                  <strong>{skill.slug}</strong>
                  {enabledSkillKeys.has(key) ? <small>●</small> : null}
                </button>
              );
            })}
          </section>
        </div>
      </aside>

      <main className="skills-manager-detail">
        {selectedSkill ? (
          <>
            <header className="skill-doc-header">
              <div className="skill-doc-title-block">
                <h2>{selectedSkill.slug}</h2>
                <dl className="skill-doc-meta">
                  <div>
                    <dt>Added by</dt>
                    <dd>{selectedSkill.metadata.author ?? (selectedSkill.source === 'builtin' ? '布谷AI' : 'You')}</dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>{formatSkillDate(selectedSkill.updatedAt)}</dd>
                  </div>
                  <div>
                    <dt>Trigger</dt>
                    <dd>Slash command + auto</dd>
                  </div>
                </dl>
                <p className="skill-doc-description-label">Description</p>
                <p className="skill-doc-description">{selectedSkill.metadata.description}</p>
              </div>

              <div className="skill-doc-actions">
                <button className="ghost small" type="button" onClick={() => setDialogSkillKey(selectedKey)}>
                  详情
                </button>
                <button
                  className={`skill-toggle ${selectedEnabled ? 'active' : ''}`}
                  type="button"
                  disabled={!workspaceReady || !selectedSkill.valid}
                  title={selectedEnabled ? '停用 skill' : '启用 skill'}
                  onClick={() => onToggleSkill(selectedSkill)}
                >
                  <span></span>
                </button>
                <div className="skills-menu-anchor">
                  <button
                    className="icon-button"
                    type="button"
                    title="更多操作"
                    onClick={() => setSkillMenuOpen((current) => !current)}
                  >
                    <SkillIcon name="moreVertical" />
                  </button>
                  {skillMenuOpen ? (
                    <div className="skills-popover skill-action-menu">
                      <button type="button" disabled>
                        <SkillIcon name="message" />
                        Try in chat
                      </button>
                      {selectedSkill.source === 'builtin' ? (
                        <button type="button" disabled={!workspaceReady} onClick={() => {
                          onInstallSkill(selectedSkill.slug);
                          setSkillMenuOpen(false);
                        }}>
                          <SkillIcon name="filePlus" />
                          Install to workspace
                        </button>
                      ) : null}
                      <button type="button" disabled={!managedSelected} onClick={renameSelectedSkill}>
                        <SkillIcon name="pencil" />
                        Rename
                      </button>
                      <button type="button" disabled={!managedSelected} onClick={replaceSelectedSkill}>
                        <SkillIcon name="replace" />
                        Replace
                      </button>
                      <hr />
                      <button type="button" onClick={() => {
                        onOpenSkillFolder(selectedSkill);
                        setSkillMenuOpen(false);
                      }}>
                        <SkillIcon name="folder" />
                        Show in Folder
                      </button>
                      <button type="button" onClick={() => {
                        onCopySkillPath(selectedSkill);
                        setSkillMenuOpen(false);
                      }}>
                        <SkillIcon name="copy" />
                        {selectedCopied ? 'Copied' : 'Copy Path'}
                      </button>
                      <hr />
                      <button className="danger" type="button" disabled={!managedSelected} onClick={uninstallSelectedSkill}>
                        <SkillIcon name="trash" />
                        Uninstall
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </header>

            <section className="skill-doc-card">
              <div className="skill-doc-card-toolbar">
                <span>Version</span>
                <strong>{selectedSkill.metadata.version ?? '1.0'}</strong>
                <span>Source</span>
                <strong>{sourceLabel(selectedSkill.source)}</strong>
                <span>Status</span>
                <strong>{selectedSkill.valid ? '有效' : '无效'}</strong>
              </div>
              {selectedSkill.error ? <div className="error-banner">{selectedSkill.error}</div> : null}
              <div className={`skill-file-viewer ${hasMultipleFiles ? 'with-tree' : ''}`}>
                {hasMultipleFiles ? (
                  <aside className="skill-file-sidebar">
	                    <SkillFileTree
	                      nodes={selectedFiles}
	                      selectedPath={selectedFilePath}
	                      onSelect={selectSkillFile}
	                    />
                  </aside>
                ) : null}
                <main className="skill-file-content">
	                  <div className="skill-file-content-head">
	                    <span>{selectedFilePath}</span>
	                    <div className="skill-file-head-actions">
	                      {selectedFileBusy ? <strong>读取中</strong> : null}
	                      {selectedFileIsMarkdown ? (
	                        <div className="skill-markdown-toggle" role="group" aria-label="Markdown 显示模式">
	                          <button
	                            className={markdownViewMode === 'preview' ? 'active' : ''}
	                            type="button"
	                            title="预览"
	                            aria-pressed={markdownViewMode === 'preview'}
	                            onClick={() => setMarkdownViewMode('preview')}
	                          >
	                            <SkillIcon name="eye" />
	                          </button>
	                          <button
	                            className={markdownViewMode === 'source' ? 'active' : ''}
	                            type="button"
	                            title="源码"
	                            aria-pressed={markdownViewMode === 'source'}
	                            onClick={() => setMarkdownViewMode('source')}
	                          >
	                            <SkillIcon name="code" />
	                          </button>
	                        </div>
	                      ) : null}
	                    </div>
	                  </div>
	                  {selectedFileError ? <div className="error-banner">{selectedFileError}</div> : null}
	                  {selectedFileIsMarkdown && markdownViewMode === 'preview' ? (
	                    <SkillDocument content={selectedFileContent} />
	                  ) : (
                    <pre className="skill-document-code skill-plain-file">
                      <code>{selectedFileContent}</code>
                    </pre>
                  )}
                </main>
              </div>
            </section>
          </>
        ) : (
          <div className="empty-state">当前没有可显示的 skill。</div>
        )}
      </main>
      {dialogSkill ? (
        <DetailDialog
          eyebrow={sourceLabel(dialogSkill.source)}
          title={dialogSkill.metadata.name}
          description={dialogSkill.metadata.description}
          onClose={() => setDialogSkillKey(null)}
        >
          <div className="skill-doc-card-toolbar">
            <span>Slug</span>
            <strong>{dialogSkill.slug}</strong>
            <span>Version</span>
            <strong>{dialogSkill.metadata.version ?? '1.0'}</strong>
            <span>Status</span>
            <strong>{dialogSkill.valid ? '有效' : '无效'}</strong>
          </div>
          {dialogSkill.error ? <div className="error-banner">{dialogSkill.error}</div> : null}
          <SkillDocument content={dialogSkill.content} />
        </DetailDialog>
      ) : null}
    </section>
  );
}
