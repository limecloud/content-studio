import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GenerateOverlayCardsInput, OverlayCardDraft, OverlayCardRecord } from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceAssetDir, getWorkspaceDataDir } from './paths';

function overlayCardsFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'overlay-cards.json');
}

function overlayAssetDir(workspacePath: string): string {
  return join(getWorkspaceAssetDir(workspacePath), 'overlays');
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function compactTags(tags?: string[]): string[] {
  return Array.from(new Set((tags ?? []).map((tag) => tag.trim()).filter(Boolean))).slice(0, 12);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeFilePart(value: string): string {
  return normalizeText(value).replace(/[\\/:*?"<>|]/g, '-').slice(0, 40) || 'overlay';
}

function wrapText(text: string, maxChars: number): string[] {
  const normalized = normalizeText(text);
  if (!normalized) return [];
  const lines: string[] = [];
  let current = '';
  for (const char of normalized) {
    if (current.length >= maxChars && /[\s，。！？、,.!?]/.test(char)) {
      lines.push(current.trim());
      current = '';
      continue;
    }
    if (current.length >= maxChars) {
      lines.push(current.trim());
      current = char;
      continue;
    }
    current += char;
  }
  if (current.trim()) lines.push(current.trim());
  return lines.slice(0, 8);
}

function typeLabel(type: OverlayCardDraft['type']): string {
  if (type === 'title') return '标题卡';
  if (type === 'selling-point') return '卖点卡';
  if (type === 'quote') return '金句卡';
  if (type === 'cta') return '行动卡';
  return '字幕卡';
}

function renderSvg(card: OverlayCardRecord): string {
  const titleLines = wrapText(card.title, 12).slice(0, 2);
  const bodyLines = wrapText(card.text, 13);
  const bodyFontSize = bodyLines.length > 5 ? 76 : bodyLines.length > 3 ? 84 : 96;
  const titleStartY = 420;
  const bodyStartY = titleLines.length ? 680 : 540;
  const label = typeLabel(card.type);

  const titleText = titleLines.map((line, index) =>
    `<text x="540" y="${titleStartY + index * 104}" text-anchor="middle" class="title">${escapeXml(line)}</text>`,
  ).join('\n    ');
  const bodyText = bodyLines.map((line, index) =>
    `<text x="540" y="${bodyStartY + index * (bodyFontSize + 20)}" text-anchor="middle" class="body">${escapeXml(line)}</text>`,
  ).join('\n    ');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920" role="img" aria-label="${escapeXml(card.title)}">
  <defs>
    <filter id="textShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#05331a" flood-opacity="0.42"/>
    </filter>
  </defs>
  <rect width="1080" height="1920" fill="#00B140"/>
  <rect x="72" y="72" width="936" height="1776" rx="36" fill="none" stroke="rgba(255,255,255,0.34)" stroke-width="6"/>
  <text x="540" y="230" text-anchor="middle" class="label">${escapeXml(label)}</text>
  <g filter="url(#textShadow)">
    ${titleText}
    ${bodyText}
  </g>
  <text x="540" y="1720" text-anchor="middle" class="meta">${card.durationSeconds}s · chroma green · 9:16</text>
  <style>
    .label { fill: #EFFFF4; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 34px; font-weight: 700; letter-spacing: 0; }
    .title { fill: #FFFFFF; stroke: rgba(0,0,0,0.38); stroke-width: 4px; paint-order: stroke; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 92px; font-weight: 800; letter-spacing: 0; }
    .body { fill: #FFFFFF; stroke: rgba(0,0,0,0.36); stroke-width: 4px; paint-order: stroke; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: ${bodyFontSize}px; font-weight: 760; letter-spacing: 0; }
    .meta { fill: rgba(255,255,255,0.78); font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif; font-size: 28px; font-weight: 600; letter-spacing: 0; }
  </style>
</svg>
`;
}

export class OverlayCardStore {
  async list(workspacePath: string): Promise<OverlayCardRecord[]> {
    const cards = await readJsonFile<OverlayCardRecord[]>(overlayCardsFilePath(workspacePath), []);
    return cards.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async generate(input: GenerateOverlayCardsInput): Promise<OverlayCardRecord[]> {
    const validCards = input.cards
      .map((card) => ({
        ...card,
        title: normalizeText(card.title),
        text: normalizeText(card.text),
      }))
      .filter((card) => card.title || card.text)
      .slice(0, 40);
    if (validCards.length === 0) throw new Error('请至少填写一张绿幕文案卡。');

    const now = new Date().toISOString();
    const assetDir = overlayAssetDir(input.workspacePath);
    await mkdir(assetDir, { recursive: true });

    const records: OverlayCardRecord[] = [];
    for (const draft of validCards) {
      const id = randomUUID();
      const record: OverlayCardRecord = {
        id,
        workspacePath: input.workspacePath,
        promptDraftId: input.promptDraftId?.trim() || undefined,
        type: draft.type,
        title: draft.title || typeLabel(draft.type),
        text: draft.text || draft.title,
        durationSeconds: Math.max(1, Math.min(15, draft.durationSeconds ?? 3)),
        status: 'exported',
        assetPath: join(assetDir, `${safeFilePart(draft.title || draft.text)}-${id.slice(0, 8)}.svg`),
        background: 'green-screen',
        aspectRatio: '9:16',
        tags: compactTags(['绿幕文案图', typeLabel(draft.type), ...(draft.tags ?? [])]),
        createdAt: now,
        updatedAt: now,
      };
      await writeFile(record.assetPath, renderSvg(record), 'utf-8');
      records.push(record);
    }

    const existing = await this.list(input.workspacePath);
    await writeJsonFile(overlayCardsFilePath(input.workspacePath), [...records, ...existing].slice(0, 300));
    return records;
  }
}
