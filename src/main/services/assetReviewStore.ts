import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type { AssetReviewRecord, ReviewAssetInput } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function assetReviewsFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'asset-reviews.json');
}

function normalizeText(value?: string): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function compactTags(tags?: string[]): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 16);
}

export class AssetReviewStore {
  async list(workspacePath: string): Promise<AssetReviewRecord[]> {
    const reviews = await readJsonFile<AssetReviewRecord[]>(assetReviewsFilePath(workspacePath), []);
    return reviews.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async review(input: ReviewAssetInput): Promise<AssetReviewRecord> {
    const assetKey = normalizeText(input.assetKey);
    const path = normalizeText(input.path);
    if (!assetKey) throw new Error('审核素材缺少 assetKey。');
    if (!path) throw new Error('审核素材缺少本地路径。');
    const now = new Date().toISOString();
    const reviews = await this.list(input.workspacePath);
    const existing = reviews.find((review) => review.assetKey === assetKey);
    const record: AssetReviewRecord = {
      id: existing?.id ?? randomUUID(),
      workspacePath: input.workspacePath,
      assetKey,
      kind: input.kind,
      sourceType: input.sourceType,
      sourceId: normalizeText(input.sourceId) || undefined,
      path,
      title: normalizeText(input.title) || path.split(/[\\/]/).filter(Boolean).pop() || '未命名素材',
      status: input.status,
      note: normalizeText(input.note) || undefined,
      tags: compactTags(input.tags),
      reviewedAt: input.status === 'pending' ? existing?.reviewedAt : now,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    const next = existing
      ? reviews.map((review) => (review.assetKey === assetKey ? record : review))
      : [record, ...reviews];
    await writeJsonFile(assetReviewsFilePath(input.workspacePath), next.slice(0, 500));
    return record;
  }

  async requireApproved(workspacePath: string, assetKeys: string[]): Promise<void> {
    const reviews = await this.list(workspacePath);
    const approved = new Set(
      reviews
        .filter((review) => review.status === 'approved')
        .map((review) => review.assetKey),
    );
    const missing = Array.from(new Set(assetKeys.filter((key) => !approved.has(key))));
    if (missing.length > 0) {
      throw new Error(`混剪包只能导出已通过审核的素材，请先审核：${missing.slice(0, 5).join(', ')}`);
    }
  }
}
