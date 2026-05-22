import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import type { ExportPlatformDraftInput, PlatformDraftExportResult, PlatformDraftRecord, ReadPlatformDraftCopyTextInput } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceAssetDir, getWorkspaceDataDir } from './paths';
import { GenerationLogStore } from './generationLogStore';

function normalizeText(value: string | undefined, fallback: string): string {
  const normalized = String(value ?? '').replace(/\s+/g, ' ').trim();
  return normalized || fallback;
}

function safeFilePart(value: string): string {
  return normalizeText(value, 'platform-draft')
    .replace(/[\\/:*?"<>|]/g, '-')
    .slice(0, 64) || 'platform-draft';
}

function platformDraftAssetDir(workspacePath: string): string {
  return join(getWorkspaceAssetDir(workspacePath), 'platform-drafts');
}

function platformDraftsFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'platform-drafts.json');
}

function checklistMarkdown(input: ExportPlatformDraftInput): string {
  const checks = input.publishCheck.length
    ? input.publishCheck
    : [{ level: 'warning' as const, message: '请人工复核正文事实、平台格式和合规表达。' }];
  const contextLines = [
    `- 平台：${normalizeText(input.platform, '未指定平台')}`,
    input.topic ? `- 主题：${input.topic}` : '',
    input.audience ? `- 目标读者：${input.audience}` : '',
    input.tone ? `- 口吻：${input.tone}` : '',
  ].filter(Boolean);
  return [
    `# ${normalizeText(input.title, '文章草稿')} 发布前检查`,
    '',
    ...contextLines,
    '',
    '## 检查项',
    '',
    ...checks.map((item) => `- [ ] ${item.level.toUpperCase()}：${item.message}`),
    '',
    '## 交付边界',
    '',
    '- 本包只用于人工复制到目标平台前检查，不包含平台账号、授权或自动发布任务。',
    '- 发布前需要人工确认平台格式、封面、配图、引用事实和高风险表达。',
    '',
  ].join('\n');
}

function removeMarkdownSyntax(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*[-*]\s+/gm, '- ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function platformKind(platform: string): 'wechat' | 'xiaohongshu' | 'zhihu' | 'generic' {
  const value = platform.toLowerCase();
  if (/公众号|微信|wechat/.test(value)) return 'wechat';
  if (/小红书|xiaohongshu|red/.test(value)) return 'xiaohongshu';
  if (/知乎|zhihu/.test(value)) return 'zhihu';
  return 'generic';
}

function platformCopyText(input: ExportPlatformDraftInput): string {
  const title = normalizeText(input.title, '文章草稿');
  const kind = platformKind(input.platform);
  if (kind === 'xiaohongshu') {
    return [
      title,
      '',
      removeMarkdownSyntax(input.markdown),
      '',
      '发布前补充：封面图、话题标签、首评引导和平台禁用词需要人工确认。',
      '',
    ].join('\n');
  }
  if (kind === 'wechat') {
    return [
      `标题：${title}`,
      '',
      '正文：',
      input.markdown.trim(),
      '',
      '发布前补充：封面图、摘要、作者信息、原文链接和配图位置需要人工确认。',
      '',
    ].join('\n');
  }
  if (kind === 'zhihu') {
    return [
      `# ${title}`,
      '',
      input.markdown.trim(),
      '',
      '发布前补充：问题匹配、引用来源、利益相关说明和评论区引导需要人工确认。',
      '',
    ].join('\n');
  }
  return [
    title,
    '',
    input.markdown.trim(),
    '',
    '发布前补充：目标平台标题、封面、配图和合规表达需要人工确认。',
    '',
  ].join('\n');
}

function formatGuideMarkdown(input: ExportPlatformDraftInput): string {
  const kind = platformKind(input.platform);
  const platform = normalizeText(input.platform, '通用平台');
  const rules: Record<ReturnType<typeof platformKind>, string[]> = {
    wechat: [
      '标题放入公众号标题栏，正文内保留一个清晰开头，不重复 H1。',
      '正文段落保持 2-5 行一段，关键小标题可用 H2 / 加粗处理。',
      '封面、摘要和配图位置必须人工确认。',
      '发布前复核事实引用、功效表达、绝对化词和医疗化暗示。',
    ],
    xiaohongshu: [
      '使用 `platform-copy.txt` 的纯文本版本，不直接复制 Markdown 标记。',
      '首段先讲具体场景或痛点，避免平台感知为硬广。',
      '话题标签、封面标题和评论区引导必须人工补齐。',
      '发布前复核夸张承诺、功效暗示和违禁词。',
    ],
    zhihu: [
      '围绕具体问题组织正文，避免像单向广告稿。',
      '保留引用和事实依据，必要时补利益相关说明。',
      '小标题服务论证层次，不堆叠营销话术。',
      '发布前复核案例真实性和可验证来源。',
    ],
    generic: [
      '先确认目标平台标题、摘要、封面和正文格式限制。',
      '根据平台编辑器决定是否保留 Markdown 标记。',
      '发布前复核事实引用、配图版权、合规边界和 CTA。',
      '本地草稿包不代表已发布，需要人工复制和最终确认。',
    ],
  };
  return [
    `# ${platform} 格式指南`,
    '',
    ...rules[kind].map((rule) => `- ${rule}`),
    '',
  ].join('\n');
}

export class PlatformDraftStore {
  constructor(private readonly logs: GenerationLogStore) {}

  async list(workspacePath: string): Promise<PlatformDraftRecord[]> {
    const records = await readJsonFile<PlatformDraftRecord[]>(platformDraftsFilePath(workspacePath), []);
    return records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async readCopyText(input: ReadPlatformDraftCopyTextInput): Promise<string> {
    const draft = (await this.list(input.workspacePath)).find((record) => record.id === input.draftId);
    if (!draft) throw new Error('平台草稿包不存在，请刷新后重试。');

    const baseDir = resolve(platformDraftAssetDir(input.workspacePath));
    const targetPath = resolve(draft.platformCopyPath);
    const relativePath = relative(baseDir, targetPath);
    if (!relativePath || relativePath.startsWith('..') || isAbsolute(relativePath)) {
      throw new Error('平台发布文案不在当前工作区草稿包内。');
    }

    try {
      const text = await readFile(targetPath, 'utf-8');
      if (!text.trim()) throw new Error('平台发布文案为空，请重新导出草稿包。');
      return text;
    } catch (error) {
      if (error instanceof Error && error.message.includes('平台发布文案为空')) throw error;
      throw new Error('无法读取平台发布文案，请重新导出草稿包。');
    }
  }

  async exportDraft(input: ExportPlatformDraftInput): Promise<PlatformDraftExportResult> {
    const title = normalizeText(input.title, '文章草稿');
    const platform = normalizeText(input.platform, '通用平台');
    const markdown = input.markdown.trim();
    if (!markdown) throw new Error('平台草稿正文不能为空。');

    const now = new Date().toISOString();
    const id = randomUUID();
    const packageDir = join(platformDraftAssetDir(input.workspacePath), `${safeFilePart(`${platform}-${title}`)}-${id.slice(0, 8)}`);
    await mkdir(packageDir, { recursive: true });

    const markdownPath = join(packageDir, 'draft.md');
    const platformCopyPath = join(packageDir, 'platform-copy.txt');
    const formatGuidePath = join(packageDir, 'format-guide.md');
    const checklistPath = join(packageDir, 'publish-checklist.md');
    const metadataPath = join(packageDir, 'metadata.json');
    const manifestPath = join(packageDir, 'manifest.json');

    const metadata = {
      schema: 'buguai.platform-draft.metadata.v1',
      id,
      title,
      platform,
      workflowRunId: input.workflowRunId?.trim() || undefined,
      promptDraftId: input.promptDraftId?.trim() || undefined,
      sourceLogId: input.sourceLogId?.trim() || undefined,
      topic: input.topic?.trim() || undefined,
      audience: input.audience?.trim() || undefined,
      tone: input.tone?.trim() || undefined,
      createdAt: now,
      publishCheck: input.publishCheck,
    };
    const result: PlatformDraftExportResult = {
      packageDir,
      markdownPath,
      platformCopyPath,
      formatGuidePath,
      metadataPath,
      checklistPath,
      manifestPath,
    };
    const manifest = {
      schema: 'buguai.platform-draft.v1',
      id,
      title,
      platform,
      createdAt: now,
      packageDir,
      files: {
        markdown: basename(markdownPath),
        platformCopy: basename(platformCopyPath),
        formatGuide: basename(formatGuidePath),
        checklist: basename(checklistPath),
        metadata: basename(metadataPath),
      },
      paths: result,
      workflowRunId: metadata.workflowRunId,
      promptDraftId: metadata.promptDraftId,
      sourceLogId: metadata.sourceLogId,
    };

    await writeFile(markdownPath, `${markdown}\n`, 'utf-8');
    await writeFile(platformCopyPath, platformCopyText(input), 'utf-8');
    await writeFile(formatGuidePath, formatGuideMarkdown(input), 'utf-8');
    await writeFile(checklistPath, checklistMarkdown(input), 'utf-8');
    await writeFile(metadataPath, `${JSON.stringify(metadata, null, 2)}\n`, 'utf-8');
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');

    if (metadata.sourceLogId) {
      await this.logs.addArtifactRef(input.workspacePath, metadata.sourceLogId, manifestPath);
      await this.logs.addArtifactRef(input.workspacePath, metadata.sourceLogId, markdownPath);
      await this.logs.addArtifactRef(input.workspacePath, metadata.sourceLogId, platformCopyPath);
    }

    const record: PlatformDraftRecord = {
      id,
      workspacePath: input.workspacePath,
      workflowRunId: metadata.workflowRunId,
      promptDraftId: metadata.promptDraftId,
      sourceLogId: metadata.sourceLogId,
      title,
      platform,
      topic: metadata.topic,
      audience: metadata.audience,
      tone: metadata.tone,
      publishCheck: input.publishCheck,
      createdAt: now,
      updatedAt: now,
      ...result,
    };
    const existing = await this.list(input.workspacePath);
    await writeJsonFile(platformDraftsFilePath(input.workspacePath), [record, ...existing].slice(0, 200));
    return result;
  }
}
