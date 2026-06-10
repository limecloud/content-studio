import matter from 'gray-matter';
import yauzl from 'yauzl';
import { createWriteStream } from 'node:fs';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { Dirent, existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, delimiter as pathDelimiter, dirname, extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { CreateSkillInput, InstallSkillPackageResult, LoadedSkill, SkillMetadata, SkillPackageFileNode, SkillPackagePreview, SkillRef, SkillSource } from '../../shared/types';
import { getResourcesRoot } from './paths';

interface SkillPackageLayout {
  rootDir: string;
  skillPath: string;
  slug: string;
}

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
      version: typeof parsed.data.version === 'string' ? parsed.data.version : undefined,
      author: typeof parsed.data.author === 'string' ? parsed.data.author : undefined,
      globs: normalizeStringArray(parsed.data.globs),
      alwaysAllow: normalizeStringArray(parsed.data.alwaysAllow),
      requiredSources: normalizeStringArray(parsed.data.requiredSources),
      icon: typeof parsed.data.icon === 'string' ? parsed.data.icon : undefined,
    },
  };
}

function listSkillFiles(root: string): SkillPackageFileNode[] {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return [];
  }

  const files: SkillPackageFileNode[] = [];
  const appendDirectory = (currentPath: string, prefix = '') => {
    let entries: Dirent[] = [];
    try {
      entries = readdirSync(currentPath, { withFileTypes: true })
        .filter((entry) => !entry.name.startsWith('.'));
    } catch {
      return;
    }

    for (const entry of entries) {
      const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absolutePath = join(currentPath, entry.name);
      if (entry.isDirectory()) {
        appendTreeNode(files, relativePath, 'directory');
        appendDirectory(absolutePath, relativePath);
      } else if (entry.isFile()) {
        appendTreeNode(files, relativePath, 'file');
      }
    }
  };

  appendDirectory(root);
  return sortTree(files);
}

async function loadSkillFromDir(path: string, source: SkillSource): Promise<LoadedSkill | null> {
  const skillPath = join(path, 'SKILL.md');
  if (!existsSync(skillPath)) {
    return null;
  }
  const files = listSkillFiles(path);
  try {
    const content = await readFile(skillPath, 'utf-8');
    const parsed = parseSkill(content);
    const updatedAt = statSync(skillPath).mtime.toISOString();
    if (!parsed) {
      return {
        slug: basename(path),
        source,
        path,
        valid: false,
        content,
        files,
        updatedAt,
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
      content,
      files,
      updatedAt,
    };
  } catch (error) {
    return {
      slug: basename(path),
      source,
      path,
      valid: false,
      files,
      error: error instanceof Error ? error.message : String(error),
      metadata: { name: basename(path), description: 'Unreadable skill' },
    };
  }
}

function slugIsSafe(slug: string): boolean {
  return /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(slug) && slug !== '.' && slug !== '..';
}

function yamlString(value: string): string {
  return JSON.stringify(value);
}

function getManagedSkillPath(workspacePath: string, skill: SkillRef): string {
  if (skill.source !== 'project') {
    throw new Error('只有安装到当前工作区 .bugu/skills 的 skill 支持此操作。');
  }
  if (!slugIsSafe(skill.slug)) {
    throw new Error('skill slug 非法。');
  }
  const root = getBuguSkillRoot(workspacePath);
  const skillPath = join(root, skill.slug);
  assertInside(root, skillPath);
  return skillPath;
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

async function loadSkillFromPackage(packagePath: string, source: SkillSource): Promise<LoadedSkill | null> {
  try {
    const entries = await listPackageEntries(packagePath);
    const names = entries.map((item) => item.name);
    const layout = resolvePackageLayout(names, packagePath);
    const skillEntry = entries.find((item) => item.name === layout.skillPath && !item.isDirectory);
    if (!skillEntry) return null;

    const content = await withZip(packagePath, async (zipFile) => {
      let selectedContent = '';
      await new Promise<void>((resolveRead, rejectRead) => {
        zipFile.readEntry();
        zipFile.on('entry', async (entry) => {
          try {
            if (normalizeZipEntryName(entry.fileName) === layout.skillPath) {
              selectedContent = (await readEntryBuffer(zipFile, entry)).toString('utf-8');
              resolveRead();
              return;
            }
            zipFile.readEntry();
          } catch (error) {
            rejectRead(error);
          }
        });
        zipFile.on('end', resolveRead);
        zipFile.on('error', rejectRead);
      });
      return selectedContent;
    });

    const parsed = parseSkill(content);
    const files: SkillPackageFileNode[] = [];
    for (const item of entries) {
      const relativeName = packageRelativeName(item.name, layout);
      if (!relativeName) continue;
      appendTreeNode(files, relativeName, item.isDirectory ? 'directory' : 'file');
    }

    return {
      slug: layout.slug,
      source,
      path: packagePath,
      metadata: parsed?.metadata ?? { name: layout.slug, description: 'Invalid skill package' },
      valid: Boolean(parsed),
      content,
      files: sortTree(files),
      updatedAt: statSync(packagePath).mtime.toISOString(),
      error: parsed ? undefined : 'SKILL.md 缺少 name 或 description frontmatter',
    };
  } catch (error) {
    return {
      slug: slugFromPackagePath(packagePath),
      source,
      path: packagePath,
      metadata: { name: slugFromPackagePath(packagePath), description: 'Unreadable skill package' },
      valid: false,
      files: [],
      updatedAt: existsSync(packagePath) ? statSync(packagePath).mtime.toISOString() : undefined,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function loadSkillPackagesFromRoot(root: string, source: SkillSource): Promise<LoadedSkill[]> {
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    return [];
  }
  return Promise.all(
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.skill'))
      .map((entry) => loadSkillFromPackage(join(root, entry.name), source)),
  ).then((items) => items.filter((item): item is LoadedSkill => Boolean(item)));
}

function localSkillPackageRoots(): string[] {
  const envRoots = (process.env.CONTENT_STUDIO_EXTERNAL_SKILLS_DIRS || '')
    .split(pathDelimiter)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set([
    ...envRoots,
    join(homedir(), 'Documents', 'other', 'skills'),
  ]));
}

function getBuguSkillRoot(workspacePath: string): string {
  return join(workspacePath, '.bugu', 'skills');
}

function normalizeZipEntryName(name: string): string {
  return name.replace(/\\/g, '/').replace(/^\/+/, '');
}

function isIgnoredPackageEntry(name: string): boolean {
  const parts = normalizeZipEntryName(name).split('/').filter(Boolean);
  return parts[0] === '__MACOSX' || parts.some((part) => part === '.DS_Store' || part.startsWith('._'));
}

function assertSafePackageEntryName(name: string): void {
  const normalizedName = normalizeZipEntryName(name);
  if (!normalizedName || normalizedName.includes('\0')) {
    throw new Error('.skill 安装包包含非法路径。');
  }
  const parts = normalizedName.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('.skill 安装包包含非法路径。');
  }
}

function slugFromPackagePath(packagePath: string): string {
  const normalized = basename(packagePath, extname(packagePath))
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 80);
  return slugIsSafe(normalized) ? normalized : 'imported-skill';
}

function resolvePackageLayout(entries: string[], packagePath: string): SkillPackageLayout {
  const normalizedEntries = entries
    .map((entry) => normalizeZipEntryName(entry))
    .filter((entry) => entry && !isIgnoredPackageEntry(entry));
  if (normalizedEntries.some((entry) => entry === 'SKILL.md')) {
    return {
      rootDir: '',
      skillPath: 'SKILL.md',
      slug: slugFromPackagePath(packagePath),
    };
  }

  const roots = new Set(normalizedEntries.map((entry) => entry.split('/')[0]).filter(Boolean));
  if (roots.size !== 1) {
    throw new Error('.skill 安装包必须只包含一个顶层目录。');
  }
  const root = [...roots][0];
  if (root === '.' || root === '..' || root.includes('\0')) {
    throw new Error('.skill 安装包顶层目录名称非法。');
  }
  return {
    rootDir: root,
    skillPath: `${root}/SKILL.md`,
    slug: root,
  };
}

function packageRelativeName(name: string, layout: Pick<SkillPackageLayout, 'rootDir'>): string {
  const normalizedName = normalizeZipEntryName(name).replace(/\/$/, '');
  if (!layout.rootDir) return normalizedName;
  if (normalizedName === layout.rootDir) return '';
  if (!normalizedName.startsWith(`${layout.rootDir}/`)) return '';
  return normalizedName.slice(layout.rootDir.length + 1);
}

function normalizePackageRelativePath(relativePath: string): string {
  const normalizedPath = normalizeZipEntryName(relativePath);
  if (!normalizedPath || normalizedPath.includes('\0')) {
    throw new Error('安装包文件路径非法。');
  }
  const parts = normalizedPath.split('/').filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) {
    throw new Error('安装包文件路径非法。');
  }
  return parts.join('/');
}

function assertInside(basePath: string, targetPath: string): void {
  const delta = relative(resolve(basePath), resolve(targetPath));
  if (delta === '' || (!delta.startsWith('..') && !isAbsolute(delta))) return;
  throw new Error('.skill 安装包包含非法路径。');
}

function appendTreeNode(tree: SkillPackageFileNode[], path: string, kind: SkillPackageFileNode['kind']): void {
  const parts = path.split('/').filter(Boolean);
  let level = tree;
  parts.forEach((part, index) => {
    const nodePath = parts.slice(0, index + 1).join('/');
    const nodeKind = index === parts.length - 1 ? kind : 'directory';
    let node = level.find((item) => item.name === part);
    if (!node) {
      node = {
        name: part,
        path: nodePath,
        kind: nodeKind,
        children: nodeKind === 'directory' ? [] : undefined,
      };
      level.push(node);
    }
    if (nodeKind === 'directory') {
      node.children ??= [];
      level = node.children;
    }
  });
}

function sortTree(nodes: SkillPackageFileNode[]): SkillPackageFileNode[] {
  return nodes
    .map((node) => ({
      ...node,
      children: node.children ? sortTree(node.children) : undefined,
    }))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'file' ? -1 : 1;
      return a.name.localeCompare(b.name, 'zh-Hans-CN');
    });
}

function openZip(packagePath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolveOpen, rejectOpen) => {
    yauzl.open(packagePath, { lazyEntries: true }, (error, zipFile) => {
      if (error || !zipFile) rejectOpen(error ?? new Error('无法打开 .skill 安装包。'));
      else resolveOpen(zipFile);
    });
  });
}

async function withZip<T>(packagePath: string, handler: (zipFile: yauzl.ZipFile) => Promise<T>): Promise<T> {
  if (extname(packagePath).toLowerCase() !== '.skill') {
    throw new Error('请选择 .skill 安装包。');
  }
  const zipFile = await openZip(packagePath);
  try {
    return await handler(zipFile);
  } finally {
    zipFile.close();
  }
}

function readEntryBuffer(zipFile: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
  return new Promise((resolveRead, rejectRead) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        rejectRead(error ?? new Error('无法读取 .skill 安装包内容。'));
        return;
      }
      const chunks: Buffer[] = [];
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolveRead(Buffer.concat(chunks)));
      stream.on('error', rejectRead);
    });
  });
}

function writeEntryFile(zipFile: yauzl.ZipFile, entry: yauzl.Entry, targetPath: string): Promise<void> {
  return new Promise((resolveWrite, rejectWrite) => {
    zipFile.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        rejectWrite(error ?? new Error('无法读取 .skill 安装包内容。'));
        return;
      }
      const output = createWriteStream(targetPath);
      stream.on('error', rejectWrite);
      output.on('error', rejectWrite);
      output.on('finish', resolveWrite);
      stream.pipe(output);
    });
  });
}

async function listPackageEntries(packagePath: string): Promise<Array<{ entry: yauzl.Entry; name: string; isDirectory: boolean }>> {
  return withZip(packagePath, (zipFile) => new Promise((resolveList, rejectList) => {
    const entries: Array<{ entry: yauzl.Entry; name: string; isDirectory: boolean }> = [];
    zipFile.readEntry();
    zipFile.on('entry', (entry) => {
      const name = normalizeZipEntryName(entry.fileName);
      if (name && !isIgnoredPackageEntry(name)) {
        assertSafePackageEntryName(name);
        entries.push({ entry, name, isDirectory: /\/$/.test(entry.fileName) });
      }
      zipFile.readEntry();
    });
    zipFile.on('end', () => resolveList(entries));
    zipFile.on('error', rejectList);
  }));
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
        { path: getBuguSkillRoot(workspacePath), source: 'project' },
        { path: join(workspacePath, '.claude', 'skills'), source: 'project' },
        { path: join(workspacePath, '.agents', 'skills'), source: 'project-compat' },
      );
    }
    const skills = (await Promise.all(roots.map((root) => loadSkillsFromRoot(root.path, root.source)))).flat();
    const packagedSkills = (await Promise.all(
      localSkillPackageRoots().map((root) => loadSkillPackagesFromRoot(root, 'user-compat')),
    )).flat();
    return [...skills, ...packagedSkills].sort((a, b) => `${a.source}:${a.slug}`.localeCompare(`${b.source}:${b.slug}`));
  }

  async installBuiltin(slug: string, workspacePath: string): Promise<void> {
    const source = join(getResourcesRoot(), 'skills', slug);
    if (!existsSync(source) || !statSync(source).isDirectory()) {
      throw new Error(`内置能力不存在: ${slug}`);
    }
    const target = join(getBuguSkillRoot(workspacePath), slug);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target, { recursive: true, force: true });
  }

  async createProjectSkill(input: CreateSkillInput): Promise<InstallSkillPackageResult> {
    const slug = input.slug.trim();
    if (!slugIsSafe(slug)) {
      throw new Error('skill slug 只能包含字母、数字、点、下划线和连字符。');
    }
    const root = getBuguSkillRoot(input.workspacePath);
    const target = join(root, slug);
    assertInside(root, target);
    if (existsSync(target)) {
      throw new Error(`目标 skill 已存在: ${slug}`);
    }

    const name = input.name?.trim() || slug;
    const description = input.description?.trim() || `用于 ${name} 的本地 skill。`;
    const instructions = input.instructions?.trim();
    const content = [
      '---',
      `name: ${yamlString(name)}`,
      `description: ${yamlString(description)}`,
      'version: "1.0.0"',
      'author: "You"',
      '---',
      '',
      `# ${name}`,
      '',
      description,
      '',
      '## 使用方式',
      '',
      instructions || [
        '- 描述这个 skill 的适用场景。',
        '- 写清楚输入、输出和约束。',
      ].join('\n'),
      '',
    ].join('\n');

    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'SKILL.md'), content, 'utf-8');
    const skill = await loadSkillFromDir(target, 'project');
    if (!skill) throw new Error('创建后未找到可用 SKILL.md。');
    return {
      skill,
      skills: await this.scan(input.workspacePath),
      targetPath: target,
    };
  }

  async renameProjectSkill(workspacePath: string, skill: SkillRef, nextSlug: string): Promise<SkillRef> {
    if (!slugIsSafe(nextSlug)) {
      throw new Error('新的 skill slug 只能包含字母、数字、点、下划线和连字符。');
    }
    const currentPath = getManagedSkillPath(workspacePath, skill);
    if (!existsSync(currentPath) || !statSync(currentPath).isDirectory()) {
      throw new Error('当前工作区未找到该 skill。');
    }
    const targetPath = join(getBuguSkillRoot(workspacePath), nextSlug);
    assertInside(getBuguSkillRoot(workspacePath), targetPath);
    if (existsSync(targetPath)) {
      throw new Error(`目标 skill 已存在: ${nextSlug}`);
    }
    await rename(currentPath, targetPath);
    return { slug: nextSlug, source: 'project' };
  }

  async uninstallProjectSkill(workspacePath: string, skill: SkillRef): Promise<void> {
    const skillPath = getManagedSkillPath(workspacePath, skill);
    if (!existsSync(skillPath)) return;
    await rm(skillPath, { recursive: true, force: true });
  }

  async replaceProjectSkill(packagePath: string, workspacePath: string, skill: SkillRef): Promise<InstallSkillPackageResult> {
    const targetPath = getManagedSkillPath(workspacePath, skill);
    const preview = await this.previewPackage(packagePath, workspacePath);
    if (preview.slug !== skill.slug) {
      throw new Error(`替换包 slug 是 ${preview.slug}，与当前 skill ${skill.slug} 不一致。`);
    }
    if (!existsSync(targetPath)) {
      throw new Error('当前工作区未找到该 skill。');
    }
    return this.installPackage(packagePath, workspacePath, true);
  }

  async readSkillFile(workspacePath: string | undefined, skill: SkillRef, relativePath: string): Promise<string> {
    const loaded = (await this.scan(workspacePath)).find((item) => item.slug === skill.slug && item.source === skill.source);
    if (!loaded) {
      throw new Error('未找到该 skill。');
    }
    if (extname(loaded.path).toLowerCase() === '.skill') {
      return this.readPackageFile(loaded.path, relativePath);
    }
    const normalizedRelativePath = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!normalizedRelativePath || normalizedRelativePath.includes('\0')) {
      throw new Error('skill 文件路径非法。');
    }
    const filePath = resolve(loaded.path, normalizedRelativePath);
    assertInside(loaded.path, filePath);
    if (!existsSync(filePath) || !statSync(filePath).isFile()) {
      throw new Error(`skill 文件不存在: ${relativePath}`);
    }
    return readFile(filePath, 'utf-8');
  }

  async previewPackage(packagePath: string, workspacePath?: string): Promise<SkillPackagePreview> {
    const entries = await listPackageEntries(packagePath);
    const names = entries.map((item) => item.name);
    const layout = resolvePackageLayout(names, packagePath);
    const skillEntry = entries.find((item) => item.name === layout.skillPath && !item.isDirectory);
    if (!skillEntry) throw new Error('.skill 安装包缺少 SKILL.md。');

    const selectedContent = await withZip(packagePath, async (zipFile) => {
      let content = '';
      await new Promise<void>((resolveRead, rejectRead) => {
        zipFile.readEntry();
        zipFile.on('entry', async (entry) => {
          try {
            if (normalizeZipEntryName(entry.fileName) === layout.skillPath) {
              content = (await readEntryBuffer(zipFile, entry)).toString('utf-8');
              resolveRead();
              return;
            }
            zipFile.readEntry();
          } catch (error) {
            rejectRead(error);
          }
        });
        zipFile.on('end', resolveRead);
        zipFile.on('error', rejectRead);
      });
      return content;
    });

    const parsed = parseSkill(selectedContent);
    if (!parsed) throw new Error('SKILL.md 缺少 name 或 description frontmatter。');

    const files: SkillPackageFileNode[] = [];
    for (const item of entries) {
      const relativeName = packageRelativeName(item.name, layout);
      if (!relativeName) continue;
      appendTreeNode(files, relativeName, item.isDirectory ? 'directory' : 'file');
    }

    const slug = layout.slug;
    const targetPath = workspacePath ? join(getBuguSkillRoot(workspacePath), slug) : undefined;
    return {
      packagePath,
      slug,
      metadata: parsed.metadata,
      rootDir: layout.rootDir,
      targetPath,
      targetExists: targetPath ? existsSync(targetPath) : false,
      files: sortTree(files),
      selectedPath: 'SKILL.md',
      selectedContent,
    };
  }

  async readPackageFile(packagePath: string, relativePath: string): Promise<string> {
    const entries = await listPackageEntries(packagePath);
    const layout = resolvePackageLayout(entries.map((item) => item.name), packagePath);
    const normalizedRelativePath = normalizePackageRelativePath(relativePath);
    const wantedPath = layout.rootDir ? `${layout.rootDir}/${normalizedRelativePath}` : normalizedRelativePath;
    return withZip(packagePath, async (zipFile) => {
      let content: string | null = null;
      await new Promise<void>((resolveRead, rejectRead) => {
        zipFile.readEntry();
        zipFile.on('entry', async (entry) => {
          try {
            if (normalizeZipEntryName(entry.fileName) === wantedPath) {
              content = (await readEntryBuffer(zipFile, entry)).toString('utf-8');
              resolveRead();
              return;
            }
            zipFile.readEntry();
          } catch (error) {
            rejectRead(error);
          }
        });
        zipFile.on('end', resolveRead);
        zipFile.on('error', rejectRead);
      });
      if (content === null) throw new Error(`安装包内不存在文件: ${relativePath}`);
      return content;
    });
  }

  async installPackage(packagePath: string, workspacePath: string, overwrite = false): Promise<InstallSkillPackageResult> {
    const preview = await this.previewPackage(packagePath, workspacePath);
    const target = preview.targetPath;
    if (!target) throw new Error('缺少安装目标工作区。');
    if (existsSync(target)) {
      if (!overwrite) throw new Error('目标 skill 已存在，需要确认覆盖安装。');
      await rm(target, { recursive: true, force: true });
    }
    await mkdir(target, { recursive: true });

    await withZip(packagePath, (zipFile) => new Promise<void>((resolveInstall, rejectInstall) => {
      zipFile.readEntry();
      zipFile.on('entry', async (entry) => {
        try {
          const name = normalizeZipEntryName(entry.fileName);
          if (isIgnoredPackageEntry(name)) {
            zipFile.readEntry();
            return;
          }
          assertSafePackageEntryName(name);
          const relativeName = packageRelativeName(name, preview);
          if (!relativeName) {
            zipFile.readEntry();
            return;
          }
          const outputPath = resolve(target, relativeName);
          assertInside(target, outputPath);
          if (/\/$/.test(entry.fileName)) {
            await mkdir(outputPath, { recursive: true });
          } else {
            await mkdir(dirname(outputPath), { recursive: true });
            await writeEntryFile(zipFile, entry, outputPath);
          }
          zipFile.readEntry();
        } catch (error) {
          rejectInstall(error);
        }
      });
      zipFile.on('end', resolveInstall);
      zipFile.on('error', rejectInstall);
    }));

    const skill = await loadSkillFromDir(target, 'project');
    if (!skill) throw new Error('安装后未找到可用 SKILL.md。');
    return {
      skill,
      skills: await this.scan(workspacePath),
      targetPath: target,
    };
  }
}
