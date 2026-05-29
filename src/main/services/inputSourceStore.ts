import { randomUUID } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import type {
  InputSourceKind,
  InputSourcePurpose,
  InputSourceRecord,
  ImportInputSourceFromFileOptions,
  RegisterInputSourceInput,
} from '../../shared/types';
import { readJsonFile, updateJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';
import { extractTextFromFile } from './documentTextExtractor';

function inputSourcesFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'input-sources.json');
}

function inputSourceAssetDir(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'input-sources');
}

function sortSources(sources: InputSourceRecord[]): InputSourceRecord[] {
  return [...sources].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function inferKind(filePath: string): InputSourceKind {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.docx') return 'docx';
  if (ext === '.md' || ext === '.markdown') return 'markdown';
  if (ext === '.txt') return 'text';
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif'].includes(ext)) return 'image';
  if (['.mp4', '.mov', '.webm', '.m4v'].includes(ext)) return 'video';
  if (['.csv', '.tsv', '.xlsx', '.xls'].includes(ext)) return 'sku-table';
  return 'manual-note';
}

function compactTags(tags?: string[]): string[] {
  return Array.from(
    new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean)),
  ).slice(0, 12);
}

function normalizeText(value?: string): string | undefined {
  const normalized = value
    ?.replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return normalized || undefined;
}

function blockedReasonFor(kind: InputSourceKind): string | undefined {
  if (kind === 'docx') return 'DOCX 已登记原文件，但未能抽取可用文本。请转换为 Markdown 后重试，或检查文档是否为空。';
  if (kind === 'video') return '视频已登记原文件；如需内容理解，请在能力配置中接入视频理解服务。';
  if (kind === 'image') return '图片已登记原文件；如需视觉分析，请在能力配置中接入图像理解服务。';
  if (kind === 'sku-table') return 'SKU 表已登记原文件；如需结构化字段，请配置表格解析能力或手动补齐。';
  return undefined;
}

function statusFor(kind: InputSourceKind, text?: string): InputSourceRecord['status'] {
  if (text?.trim()) return 'converted';
  return blockedReasonFor(kind) ? 'blocked' : 'registered';
}

function buildSummary(input: RegisterInputSourceInput, kind: InputSourceKind): string {
  const summary = normalizeText(input.summary);
  if (summary) return summary;
  const text = normalizeText(input.text);
  if (text) return text.replace(/\s+/g, ' ').slice(0, 160);
  if (input.sourcePath) return `已登记文件：${basename(input.sourcePath)}`;
  if (input.sourceUrl) return `已登记链接：${input.sourceUrl}`;
  return `${kind} 输入源`;
}

export class InputSourceStore {
  async list(workspacePath: string): Promise<InputSourceRecord[]> {
    const sources = await readJsonFile<InputSourceRecord[]>(inputSourcesFilePath(workspacePath), []);
    return sortSources(sources);
  }

  async remove(workspacePath: string, sourceId: string): Promise<InputSourceRecord | null> {
    const id = sourceId.trim();
    if (!id) throw new Error('输入源 ID 为空。');
    return updateJsonFile<InputSourceRecord[], InputSourceRecord | null>(
      inputSourcesFilePath(workspacePath),
      [],
      (current) => {
        const existing = sortSources(current);
        const removed = existing.find((source) => source.id === id) ?? null;
        return {
          value: removed ? existing.filter((source) => source.id !== id) : existing,
          result: removed,
        };
      },
    );
  }

  async register(input: RegisterInputSourceInput): Promise<InputSourceRecord> {
    const now = new Date().toISOString();
    const text = normalizeText(input.text);
    const sourcePath = input.sourcePath?.trim() || undefined;
    const sourceUrl = input.sourceUrl?.trim() || undefined;
    const kind = input.kind;
    const record: InputSourceRecord = {
      id: randomUUID(),
      workspacePath: input.workspacePath,
      workflowRunId: input.workflowRunId?.trim() || undefined,
      kind,
      status: statusFor(kind, text),
      purpose: input.purpose,
      title: input.title.trim() || (sourcePath ? basename(sourcePath) : '未命名输入源'),
      sourcePath,
      sourceUrl,
      tags: compactTags(input.tags),
      summary: buildSummary(input, kind),
      extractedText: text,
      artifactRefs: sourcePath ? [sourcePath] : [],
      relatedPromptDraftId: input.relatedPromptDraftId?.trim() || undefined,
      relatedSceneCardIds: input.relatedSceneCardIds?.filter(Boolean).slice(0, 12),
      blockedReason: text ? undefined : blockedReasonFor(kind),
      createdAt: now,
      updatedAt: now,
    };

    if (text) {
      const markdownDir = join(inputSourceAssetDir(input.workspacePath), 'markdown');
      await mkdir(markdownDir, { recursive: true });
      const markdownPath = join(markdownDir, `${record.id}.md`);
      await writeFile(markdownPath, `${text}\n`, 'utf-8');
      record.markdownPath = markdownPath;
      record.artifactRefs = Array.from(new Set([...record.artifactRefs, markdownPath]));
    }

    return updateJsonFile<InputSourceRecord[], InputSourceRecord>(
      inputSourcesFilePath(input.workspacePath),
      [],
      (sources) => ({
        value: [record, ...sortSources(sources)].slice(0, 300),
        result: record,
      }),
    );
  }

  async importFile(
    workspacePath: string,
    filePath: string,
    purpose: InputSourcePurpose,
    options?: ImportInputSourceFromFileOptions,
  ): Promise<InputSourceRecord> {
    const kind = inferKind(filePath);
    const targetDir = inputSourceAssetDir(workspacePath);
    await mkdir(targetDir, { recursive: true });
    const safeName = `${Date.now()}-${basename(filePath).replace(/[\\/:*?"<>|]/g, '-')}`;
    const storedPath = join(targetDir, safeName);
    await copyFile(filePath, storedPath);
    let extractedText: string | undefined;
    let extractionSummary: string | undefined;
    try {
      extractedText = normalizeText(await extractTextFromFile(storedPath, kind));
      if (extractedText) {
        extractionSummary = `已复制并抽取 ${extractedText.length} 字文本：${extractedText.replace(/\s+/g, ' ').slice(0, 120)}`;
      }
    } catch (error) {
      extractionSummary = `已复制到工作区输入源，但文本抽取失败：${error instanceof Error ? error.message : String(error)}`;
    }
    return this.register({
      workspacePath,
      kind,
      purpose,
      title: basename(filePath),
      sourcePath: storedPath,
      tags: [purpose, kind, ...(options?.tags ?? [])],
      summary: extractionSummary ?? `已复制到工作区输入源：${basename(filePath)}`,
      text: extractedText,
      workflowRunId: options?.workflowRunId,
      relatedPromptDraftId: options?.relatedPromptDraftId,
      relatedSceneCardIds: options?.relatedSceneCardIds,
    });
  }
}
