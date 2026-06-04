import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { basename, extname, join, relative } from 'node:path';
import type {
  ExportMixPackageInput,
  MixPackageAssetInput,
  MixPackageAssetKind,
  MixPackageExternalImportEvidence,
  MixPackageManifestAsset,
  MixPackageRecord,
  RecordMixPackageImportEvidenceInput,
} from '../../shared/types';
import { AssetReviewStore } from './assetReviewStore';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceAssetDir, getWorkspaceDataDir } from './paths';

function mixPackagesFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'mix-packages.json');
}

function mixPackagesAssetDir(workspacePath: string): string {
  return join(getWorkspaceAssetDir(workspacePath), 'mix-packages');
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function compactTags(tags?: string[]): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 16);
}

function safeFilePart(value: string): string {
  return normalizeText(value).replace(/[\\/:*?"<>|]/g, '-').slice(0, 56) || 'mix-package';
}

function assetFolder(kind: MixPackageAssetInput['kind']): string {
  if (kind === 'image') return 'images';
  if (kind === 'video') return 'videos';
  return 'overlays';
}

function ensureLocalPath(path: string): void {
  if (!path.trim()) throw new Error('混剪包素材路径不能为空。');
  if (/^https?:\/\//i.test(path)) throw new Error(`混剪包当前只支持本地文件：${path}`);
  if (!existsSync(path)) throw new Error(`混剪包素材不存在：${path}`);
}

function buildPackagedFileName(asset: MixPackageAssetInput, index: number): string {
  const ext = extname(asset.path) || (asset.kind === 'overlay' ? '.svg' : '');
  const name = safeFilePart(asset.title || basename(asset.path, ext));
  return `${String(index + 1).padStart(3, '0')}-${asset.kind}-${name}${ext}`;
}

function csvCell(value: unknown): string {
  const text = Array.isArray(value)
    ? value.join('|')
    : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
}

function buildManifestCsv(record: MixPackageRecord): string {
  const header = [
    'index',
    'id',
    'kind',
    'title',
    'packagedPath',
    'originalPath',
    'reviewId',
    'reviewStatus',
    'sourceType',
    'sourceId',
    'promptDraftId',
    'relatedSceneCardIds',
    'durationSeconds',
    'tags',
  ];
  const rows = record.assets.map((asset, index) => [
    index + 1,
    asset.id,
    asset.kind,
    asset.title,
    asset.packagedPath ?? '',
    asset.originalPath,
    asset.reviewId ?? '',
    asset.reviewStatus ?? '',
    asset.sourceType ?? '',
    asset.sourceId ?? '',
    asset.promptDraftId ?? '',
    asset.relatedSceneCardIds ?? [],
    asset.durationSeconds ?? '',
    asset.tags,
  ].map(csvCell).join(','));
  return [
    header.map(csvCell).join(','),
    ...rows,
    '',
  ].join('\n');
}

function packagePath(packageDir: string, path?: string): string {
  if (!path) return '-';
  const relativePath = relative(packageDir, path).replace(/\\/g, '/');
  if (!relativePath || relativePath.startsWith('..')) return path;
  return relativePath;
}

function buildImportGuide(record: MixPackageRecord): string {
  const counts = {
    images: record.assets.filter((asset) => asset.kind === 'image').length,
    videos: record.assets.filter((asset) => asset.kind === 'video').length,
    overlays: record.assets.filter((asset) => asset.kind === 'overlay').length,
  };
  const assetRows = record.assets.map((asset, index) => [
    `| ${index + 1}`,
    asset.kind,
    asset.title,
    packagePath(record.packageDir, asset.packagedPath),
    asset.reviewStatus ?? '-',
    asset.durationSeconds ? `${asset.durationSeconds}s` : '-',
    asset.promptDraftId ?? '-',
    '|',
  ].join(' | '));

  const lines = [
    `# ${record.title} 导入说明`,
    '',
    `目标平台：${record.platform}`,
    `导出时间：${record.createdAt}`,
    `素材统计：images/ ${counts.images}，videos/ ${counts.videos}，overlays/ ${counts.overlays}`,
    '',
    '## 交付文件',
    '',
    '- 清单文件 `manifest.json`：完整机器可读清单，保留历史运行、提示词、来源和审核状态。',
    '- CSV 简表 `manifest.csv`：给剪辑人员或第三方混剪软件导入 / 对表使用。',
    '- `images/`：已通过审核的图片素材。',
    '- `videos/`：用户手动导入或生成后已通过审核的视频素材。',
    '- `overlays/`：绿幕文案图，按 `durationSeconds` 设置出现时长。',
    '',
    '## 导入步骤',
    '',
    '1. 在第三方混剪软件中新建项目，先导入 `videos/` 和 `images/` 里的主体素材。',
    '2. 再导入 `overlays/` 里的绿幕文案图，按 `durationSeconds` 放到对应片段上方。',
    '3. 对绿幕图使用色度抠除 / 透明叠加；如果软件不支持批量读取清单文件，使用 `manifest.csv` 对照素材用途和提示词来源。',
    '4. 发布前复核人工审核状态、授权边界、产品事实和平台禁用表达。',
    '',
    '## 交付边界',
    '',
    '- 本软件只导出素材文件夹和清单文件，不做时间线剪辑、成片渲染或自动发布。',
    '- 第三方视频生成和第三方混剪过程不进入本软件任务状态。',
    '- 如需替换素材，先在素材库重新审核通过后再导出新的混剪包。',
    '',
    '## 素材清单',
    '',
    '| # | 类型 | 标题 | 包内路径 | 审核 | 时长 | 提示词来源 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...assetRows,
  ];
  if (record.notes) {
    lines.push('', `备注：${record.notes}`);
  }
  lines.push('');
  return lines.join('\n');
}

function validAssetKind(kind: string): kind is MixPackageAssetKind {
  return kind === 'image' || kind === 'video' || kind === 'overlay';
}

function normalizeImportedAssetKinds(kinds: MixPackageAssetKind[]): MixPackageAssetKind[] {
  return Array.from(new Set(kinds.filter((kind): kind is MixPackageAssetKind => validAssetKind(kind)))).slice(0, 3);
}

function relativeEvidenceFile(packageDir: string, filePath: string): string {
  const normalized = filePath.trim().replace(/\\/g, '/');
  if (!normalized) return '';
  const relativePath = relative(packageDir, normalized).replace(/\\/g, '/');
  if (relativePath && !relativePath.startsWith('..')) return relativePath;
  return normalized;
}

function buildImportCheckMarkdown(record: MixPackageRecord, evidence: MixPackageExternalImportEvidence): string {
  return [
    `# ${record.title} 第三方导入验收`,
    '',
    `混剪工具：${evidence.toolName}`,
    `导入时间：${evidence.importedAt}`,
    `验收人：${evidence.operator || '未记录'}`,
    `导入素材：${evidence.importedAssetKinds.join(' / ') || '未记录'}`,
    `导入文件数：${evidence.importedFileCount}`,
    `清单文件已导入或已核对：${evidence.manifestImported ? '是' : '否'}`,
    `时间线已创建：${evidence.timelineCreated ? '是' : '否'}`,
    `验收结果：${evidence.result}`,
    '',
    '## 备注',
    '',
    evidence.notes || '未记录备注。',
    '',
    '## 证据文件',
    '',
    ...evidence.evidenceFiles.map((filePath) => `- ${filePath}`),
    '',
  ].join('\n');
}

export class MixPackageStore {
  constructor(private readonly assetReviews: AssetReviewStore) {}

  async list(workspacePath: string): Promise<MixPackageRecord[]> {
    const packages = await readJsonFile<MixPackageRecord[]>(mixPackagesFilePath(workspacePath), []);
    return packages.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async exportPackage(input: ExportMixPackageInput): Promise<MixPackageRecord> {
    const assets = input.assets.filter((asset) => asset.path.trim()).slice(0, 200);
    if (!normalizeText(input.title)) throw new Error('混剪包标题不能为空。');
    if (assets.length === 0) throw new Error('请至少选择一个素材后再导出混剪包。');
    await this.assetReviews.requireApproved(input.workspacePath, assets.map((asset) => asset.id));
    const approvedReviews = new Map(
      (await this.assetReviews.list(input.workspacePath))
        .filter((review) => review.status === 'approved')
        .map((review) => [review.assetKey, review]),
    );

    const now = new Date().toISOString();
    const id = randomUUID();
    const packageDir = join(mixPackagesAssetDir(input.workspacePath), `${safeFilePart(input.title)}-${id.slice(0, 8)}`);
    await mkdir(packageDir, { recursive: true });

    const manifestAssets: MixPackageManifestAsset[] = [];
    for (const [index, asset] of assets.entries()) {
      ensureLocalPath(asset.path);
      const folder = assetFolder(asset.kind);
      const targetDir = join(packageDir, folder);
      await mkdir(targetDir, { recursive: true });
      const packagedPath = join(targetDir, buildPackagedFileName(asset, index));
      await copyFile(asset.path, packagedPath);
      manifestAssets.push({
        id: asset.id,
        kind: asset.kind,
        title: normalizeText(asset.title) || basename(asset.path),
        originalPath: asset.path,
        packagedPath,
        reviewId: approvedReviews.get(asset.id)?.id,
        reviewStatus: 'approved',
        sourceType: asset.sourceType,
        sourceId: asset.sourceId?.trim() || undefined,
        promptDraftId: asset.promptDraftId?.trim() || undefined,
        promptText: asset.promptText?.trim() || undefined,
        relatedSceneCardIds: asset.relatedSceneCardIds?.filter(Boolean).slice(0, 24),
        durationSeconds: asset.durationSeconds,
        tags: compactTags(asset.tags),
      });
    }

    const manifestPath = join(packageDir, 'manifest.json');
    const manifestCsvPath = join(packageDir, 'manifest.csv');
    const importGuidePath = join(packageDir, 'import-guide.md');
    const record: MixPackageRecord = {
      id,
      workspacePath: input.workspacePath,
      workflowRunId: input.workflowRunId?.trim() || undefined,
      title: normalizeText(input.title),
      platform: normalizeText(input.platform) || 'third-party-mix-tool',
      packageDir,
      manifestPath,
      manifestCsvPath,
      importGuidePath,
      assets: manifestAssets,
      notes: input.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    await writeFile(manifestPath, `${JSON.stringify({
      schema: 'buguai.mix-package.v1',
      id: record.id,
      workflowRunId: record.workflowRunId,
      title: record.title,
      platform: record.platform,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      packageDir: record.packageDir,
      files: {
        manifest: basename(record.manifestPath),
        manifestCsv: basename(record.manifestCsvPath ?? 'manifest.csv'),
        importGuide: basename(record.importGuidePath ?? 'import-guide.md'),
      },
      notes: record.notes,
      assets: record.assets,
    }, null, 2)}\n`, 'utf-8');
    await writeFile(manifestCsvPath, buildManifestCsv(record), 'utf-8');
    await writeFile(importGuidePath, buildImportGuide(record), 'utf-8');

    const existing = await this.list(input.workspacePath);
    await writeJsonFile(mixPackagesFilePath(input.workspacePath), [record, ...existing].slice(0, 120));
    return record;
  }

  async recordImportEvidence(input: RecordMixPackageImportEvidenceInput): Promise<MixPackageRecord> {
    const packages = await this.list(input.workspacePath);
    const record = packages.find((item) => item.id === input.mixPackageId);
    if (!record) throw new Error('未找到要登记导入证据的混剪包。');
    const toolName = normalizeText(input.toolName);
    if (!toolName) throw new Error('请填写第三方混剪工具名称。');
    const importedAt = normalizeText(input.importedAt) || new Date().toISOString();
    const importedAssetKinds = normalizeImportedAssetKinds(input.importedAssetKinds);
    if (importedAssetKinds.length === 0) throw new Error('请至少选择一种已导入素材类型。');
    const importedFileCount = Math.max(0, Math.floor(Number(input.importedFileCount) || 0));
    if (importedFileCount === 0) throw new Error('请填写已导入文件数。');
    const result = input.result === 'needs-fix' || input.result === 'rejected' ? input.result : 'verified';
    const evidencePath = join(record.packageDir, 'import-evidence.json');
    const importCheckPath = join(record.packageDir, 'import-check.md');
    const extraEvidenceFiles = (input.evidenceFiles ?? [])
      .map((filePath) => relativeEvidenceFile(record.packageDir, filePath))
      .filter(Boolean);
    const evidenceFiles = Array.from(new Set(['import-check.md', ...extraEvidenceFiles]));
    const now = new Date().toISOString();
    const evidence: MixPackageExternalImportEvidence = {
      toolName,
      importedAt,
      operator: normalizeText(input.operator ?? '') || undefined,
      importedAssetKinds,
      importedFileCount,
      manifestImported: Boolean(input.manifestImported),
      timelineCreated: Boolean(input.timelineCreated),
      result,
      notes: input.notes?.trim() || undefined,
      evidenceFiles,
      evidencePath,
      updatedAt: now,
    };
    await mkdir(record.packageDir, { recursive: true });
    await writeFile(importCheckPath, buildImportCheckMarkdown(record, evidence), 'utf-8');
    await writeFile(evidencePath, `${JSON.stringify({
      toolName: evidence.toolName,
      importedAt: evidence.importedAt,
      operator: evidence.operator,
      importedAssetKinds: evidence.importedAssetKinds,
      importedFileCount: evidence.importedFileCount,
      manifestImported: evidence.manifestImported,
      timelineCreated: evidence.timelineCreated,
      result: evidence.result,
      notes: evidence.notes,
      evidenceFiles: evidence.evidenceFiles,
    }, null, 2)}\n`, 'utf-8');
    const updated: MixPackageRecord = {
      ...record,
      externalImportEvidencePath: evidencePath,
      externalImportEvidence: evidence,
      updatedAt: now,
    };
    await writeJsonFile(
      mixPackagesFilePath(input.workspacePath),
      packages.map((item) => (item.id === updated.id ? updated : item)),
    );
    return updated;
  }
}
