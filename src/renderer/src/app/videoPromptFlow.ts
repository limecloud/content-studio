import type { InputSourceRecord, PromptDraft } from '../../../shared/types';
import { isPromptDistilledSource } from '../../../shared/inputSourcePolicy';

export const VIDEO_PROMPT_TARGET_OPTIONS = [
  { value: 'runninghub', label: 'RunningHub' },
  { value: 'vidu', label: 'Vidu' },
  { value: 'runway', label: 'Runway' },
  { value: 'kling', label: '可灵' },
  { value: 'other-third-party-video-platform', label: '其他第三方' },
];

export type VideoPromptHandoffStatus = 'not-copied' | 'waiting-import' | 'imported';

export interface VideoPromptHandoff {
  status: VideoPromptHandoffStatus;
  label: string;
  className: 'idle' | 'warning' | 'ready';
  description: string;
  importedCount: number;
  lastImportedAt?: string;
}

export function targetLabel(value?: string): string {
  if (!value) return '未记录';
  return VIDEO_PROMPT_TARGET_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function isFinishedVideoSource(source: InputSourceRecord): boolean {
  return source.purpose === 'successful-asset'
    && source.kind === 'video'
    && !isPromptDistilledSource(source);
}

export function finishedVideoSources(inputSources: InputSourceRecord[]): InputSourceRecord[] {
  return inputSources.filter(isFinishedVideoSource);
}

export function finishedVideoSourcesForDraft(
  inputSources: InputSourceRecord[],
  draftId?: string,
): InputSourceRecord[] {
  if (!draftId) return [];
  return finishedVideoSources(inputSources).filter((source) => source.relatedPromptDraftId === draftId);
}

export function videoPromptHandoff(
  draft: PromptDraft | undefined,
  inputSources: InputSourceRecord[],
): VideoPromptHandoff {
  if (!draft) {
    return {
      status: 'not-copied',
      label: '未选择 Prompt',
      className: 'idle',
      description: '先选择或生成一个视频 Prompt。',
      importedCount: 0,
    };
  }
  const imported = finishedVideoSourcesForDraft(inputSources, draft.id);
  if (imported.length > 0) {
    return {
      status: 'imported',
      label: '已导入成品',
      className: 'ready',
      description: `已导入 ${imported.length} 条本地成品视频，可进入审核和混剪包。`,
      importedCount: imported.length,
      lastImportedAt: imported[0]?.createdAt,
    };
  }
  if ((draft.copyCount ?? 0) > 0 || draft.lastCopiedAt) {
    return {
      status: 'waiting-import',
      label: '已复制待导入',
      className: 'warning',
      description: 'Prompt 已复制到第三方平台，等待用户把生成后的视频文件手动导入。',
      importedCount: 0,
    };
  }
  return {
    status: 'not-copied',
    label: '未复制',
    className: 'idle',
    description: '先复制视频 Prompt 到第三方平台，再回到软件导入成品视频。',
    importedCount: 0,
  };
}
