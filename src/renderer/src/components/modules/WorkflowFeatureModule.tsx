import { useEffect, useMemo, useState } from 'react';
import type { AssetReviewRecord, GenerationLogEntry, InputSourcePurpose, InputSourceRecord, InputSourceStatus, PlatformDraftRecord, WorkflowDefinition, WorkflowInputField, WorkflowRunRecord, WorkflowRunStatus } from '../../../../shared/types';
import { inputSourceMatchesWorkflowDefinitionKey, selectWorkflowInputSourceIdsForDefinition, workflowInputPurposesForDefinitionKey } from '../../../../shared/inputSourcePolicy';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { PlatformDraftTraceList } from '../PlatformDraftTraceList';
import { ActionGroup, SelectableRecordCard, StatusPill, type StatusPillTone } from '../WorkbenchPrimitives';

export type WorkflowFeatureModuleKey = 'assets-sop' | 'assets-history' | 'workflow-definition' | 'workflow-canvas';
export type WorkflowRunAction =
  | 'open-brand-knowledge'
  | 'open-ip-knowledge'
  | 'open-scene-library'
  | 'open-prompt-draft'
  | 'open-asset-review'
  | 'open-reference-reverse'
  | 'open-image-workbench'
  | 'open-article-workbench'
  | 'open-video-prompt'
  | 'import-finished-video'
  | 'open-overlay'
  | 'open-mix-export'
  | 'open-platform-draft'
  | 'open-input-sources'
  | 'approve-workflow-review'
  | 'archive-workflow-assets';

type WorkflowRunNextAction = {
  action: WorkflowRunAction;
  title: string;
  description: string;
  primary?: boolean;
};

interface WorkflowFeatureModuleProps {
  module: WorkflowFeatureModuleKey;
  workspaceReady: boolean;
  busy: boolean;
  definitions: WorkflowDefinition[];
  runs: WorkflowRunRecord[];
  logs: GenerationLogEntry[];
  inputSources: InputSourceRecord[];
  assetReviews: AssetReviewRecord[];
  platformDrafts: PlatformDraftRecord[];
  copiedPlatformDraftId: string | null;
  activeDefinitionId: string;
  activeRunId: string;
  onSelectDefinition: (definitionId: string) => void;
  onSelectRun: (runId: string) => void;
  onCreateDraft: () => void;
  onPublishDefinition: (definitionId?: string) => void;
  onUpdateDefinition: (definition: WorkflowDefinition) => void;
  onStartRun: (definitionId?: string, inputs?: Record<string, string>, inputSourceIds?: string[]) => void;
  onOpenInputSources: () => void;
  onRunAction: (action: WorkflowRunAction, runId: string) => void;
  onRevealPath: (path: string) => void;
  onCopyPlatformDraft: (draftId: string) => void;
  onOpenPromptDraft: (promptDraftId: string) => void;
  onOpenSourceLog: (sourceLogId: string) => void;
}

const WORKFLOW_FEATURE_MODULES = new Set<string>([
  'assets-sop',
  'assets-history',
  'workflow-definition',
  'workflow-canvas',
]);

type WorkflowView = 'run' | 'history' | 'definition' | 'canvas';

const STATUS_LABELS: Record<WorkflowRunStatus, string> = {
  queued: '排队',
  running: '运行中',
  succeeded: '完成',
  failed: '失败',
  blocked: '待配置',
  cancelled: '取消',
};

const INPUT_SOURCE_PURPOSE_LABELS: Record<InputSourcePurpose, string> = {
  'brand-kb': '品牌 / 产品知识库',
  'ip-kb': 'IP 知识库',
  'ip-scenario-kb': 'IP 场景库',
  reference: '参考素材',
  'product-brief': '产品资料',
  'user-feedback': '评论 / 客服问题',
  'sop-input': '任务输入',
  'successful-asset': '成功素材',
};

const INPUT_SOURCE_STATUS_LABELS: Record<InputSourceStatus, string> = {
  registered: '已登记',
  converted: '已转换',
  blocked: '待补充',
  failed: '解析失败',
};

const INPUT_SOURCE_KIND_LABELS: Record<InputSourceRecord['kind'], string> = {
  docx: '文档',
  markdown: '文档',
  text: '文本',
  image: '图片',
  video: '视频',
  'sku-table': 'SKU 表',
  url: '网页',
  'manual-note': '手动记录',
};

const ASSET_KIND_LABELS: Record<AssetReviewRecord['kind'], string> = {
  image: '图片',
  video: '视频',
  overlay: '绿幕文案图',
};

export function isWorkflowFeatureModule(module: string): module is WorkflowFeatureModuleKey {
  return WORKFLOW_FEATURE_MODULES.has(module);
}

function isAdvancedWorkflowView(view: WorkflowView): boolean {
  return view === 'definition' || view === 'canvas';
}

function viewFromModule(module: WorkflowFeatureModuleKey): WorkflowView {
  if (module === 'assets-history') return 'history';
  if (module === 'workflow-definition') return 'definition';
  if (module === 'workflow-canvas') return 'canvas';
  return 'run';
}

function featureKeyFromView(view: WorkflowView): WorkflowFeatureModuleKey {
  if (view === 'history') return 'assets-history';
  if (view === 'definition') return 'workflow-definition';
  if (view === 'canvas') return 'workflow-canvas';
  return 'assets-sop';
}

function formatTime(value?: string): string {
  if (!value) return '未记录';
  return new Date(value).toLocaleString();
}

function statusClass(status: WorkflowRunStatus | WorkflowDefinition['status']): StatusPillTone {
  if (status === 'published' || status === 'succeeded') return 'ready';
  if (status === 'blocked' || status === 'failed') return 'blocked';
  return 'idle';
}

function inputSourcePurposeLabel(purpose: InputSourcePurpose): string {
  return INPUT_SOURCE_PURPOSE_LABELS[purpose] ?? purpose;
}

function inputSourceStatusLabel(status: InputSourceStatus): string {
  return INPUT_SOURCE_STATUS_LABELS[status] ?? status;
}

function inputSourceKindLabel(kind: InputSourceRecord['kind']): string {
  return INPUT_SOURCE_KIND_LABELS[kind] ?? kind;
}

function assetKindLabel(kind: AssetReviewRecord['kind']): string {
  return ASSET_KIND_LABELS[kind] ?? kind;
}

function inputSourceSummary(source: InputSourceRecord): string {
  return source.summary?.trim()
    || source.extractedText?.replace(/\s+/g, ' ').trim().slice(0, 120)
    || source.blockedReason
    || '已登记，可作为本次 SOP 的可追溯资料。';
}

function formatWorkflowValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '未记录';
  if (Array.isArray(value)) {
    if (!value.length) return '未记录';
    if (value.every((item) => typeof item === 'string' || typeof item === 'number')) {
      return value.map(String).join(' / ');
    }
    return `已记录 ${value.length} 项`;
  }
  if (typeof value === 'object') return `已记录 ${Object.keys(value as Record<string, unknown>).length} 项`;
  return String(value);
}

function workflowPayloadEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [['内容', formatWorkflowValue(value)]];
  const entries = Object.entries(value as Record<string, unknown>);
  return entries.length ? entries.map(([key, item]) => [workflowRunInputLabel(key), formatWorkflowValue(item)]) : [['内容', '未记录']];
}

function inputSourceTimestamp(source: InputSourceRecord): string {
  return formatTime(source.updatedAt || source.createdAt);
}

function sourceSignature(sources: InputSourceRecord[]): string {
  return sources
    .map((source) => `${source.id}:${source.purpose}:${source.updatedAt}:${source.tags.join(',')}`)
    .join('|');
}

function workflowRunInputLabel(key: string): string {
  if (key === 'source') return '补充资料说明';
  if (key === 'intent') return '用户意图';
  if (key === 'reviewOwner') return '审核人';
  if (key === 'platform') return '平台';
  if (key === 'duration') return '时长';
  return key;
}

function isRequiredWorkflowInput(field: WorkflowInputField): boolean {
  return (field.required === true && field.key !== 'source') || field.key === 'intent';
}

function workflowInputFieldLabel(field: WorkflowInputField): string {
  if (field.key === 'source') return '补充资料说明';
  return field.label;
}

function workflowInputFieldHelp(field: WorkflowInputField): string | undefined {
  if (field.key === 'source') return '资料已在下方选择；这里只补充本次口径、平台、限制或未登记的临时说明。';
  return field.help;
}

function stepStatus(run: WorkflowRunRecord, stepId: string): WorkflowRunStatus | undefined {
  return run.steps.find((step) => step.stepId === stepId)?.status;
}

function stepOutputValue(run: WorkflowRunRecord, keys: string[]): string | undefined {
  for (const step of run.steps) {
    if (!step.output || typeof step.output !== 'object' || Array.isArray(step.output)) continue;
    const output = step.output as Record<string, unknown>;
    for (const key of keys) {
      const value = output[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
  }
  return undefined;
}

function stepOutputValues(run: WorkflowRunRecord, keys: string[]): string[] {
  const values: string[] = [];
  for (const step of run.steps) {
    if (!step.output || typeof step.output !== 'object' || Array.isArray(step.output)) continue;
    const output = step.output as Record<string, unknown>;
    for (const key of keys) {
      const value = output[key];
      if (typeof value === 'string' && value.trim()) values.push(value);
      if (Array.isArray(value)) {
        values.push(...value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0));
      }
    }
  }
  return Array.from(new Set(values));
}

function artifactRefIds(run: WorkflowRunRecord, prefix: string): string[] {
  const marker = `${prefix}:`;
  return Array.from(new Set(run.artifactRefs
    .filter((ref) => ref.startsWith(marker))
    .map((ref) => ref.slice(marker.length).trim())
    .filter(Boolean)));
}

function hasPathArtifactRef(run: WorkflowRunRecord, matcher: (ref: string) => boolean): boolean {
  return run.artifactRefs.some((ref) => {
    const normalized = ref.replace(/\\/g, '/');
    return matcher(normalized);
  });
}

function pushWorkflowArtifactAction(
  actions: Array<{ action: WorkflowRunAction; title: string; description: string }>,
  action: WorkflowRunAction,
  title: string,
  description: string,
): void {
  if (actions.some((item) => item.action === action)) return;
  actions.push({ action, title, description });
}

function artifactRefLabel(ref: string): string {
  const colonParts = ref.split(':');
  const pathParts = ref.replace(/\\/g, '/').split('/').filter(Boolean);
  if (ref.startsWith('workflow-run:')) return `步骤快照 / ${colonParts[colonParts.length - 1] ?? 'step'}`;
  if (ref.startsWith('brand-knowledge-base:')) return '品牌知识库';
  if (ref.startsWith('ip-knowledge-base:')) return 'IP 知识库';
  if (ref.startsWith('prompt-pack:')) return '提示词包';
  if (ref.startsWith('scene-card:')) return '场景卡';
  if (ref.startsWith('prompt-draft:')) return '提示词草稿';
  if (ref.startsWith('input-source:')) return '输入源';
  if (ref.startsWith('generation-log:')) return '生成记录';
  if (ref.startsWith('asset-review:')) return '素材审核';
  if (ref.startsWith('overlay-card:')) return '绿幕文案图';
  if (ref.startsWith('mix-package:')) return '混剪包';
  if (ref.startsWith('generated:')) return '生成素材';
  if (ref.startsWith('/') || /^[A-Za-z]:[\\/]/.test(ref)) {
    if (ref.replace(/\\/g, '/').includes('/platform-drafts/')) return '平台草稿包';
    return pathParts[pathParts.length - 1] ?? '本地文件';
  }
  return ref.length > 32 ? `${ref.slice(0, 24)}...` : ref;
}

function workflowKeyMatches(key: string, baseKey: string): boolean {
  return key === baseKey || key.startsWith(`${baseKey}-draft-`);
}

function hasStepSucceeded(run: WorkflowRunRecord, stepId: string): boolean {
  return stepStatus(run, stepId) === 'succeeded';
}

function isStepPending(run: WorkflowRunRecord, stepId: string): boolean {
  const status = stepStatus(run, stepId);
  return status === 'queued' || status === 'blocked' || status === 'running';
}

function currentWaitingStep(run: WorkflowRunRecord) {
  return run.steps.find((step) => step.status === 'blocked')
    ?? run.steps.find((step) => step.status === 'running')
    ?? run.steps.find((step) => step.status === 'queued');
}

function nextVideoMaterialAction(run: WorkflowRunRecord): WorkflowRunNextAction | null {
  if (!workflowKeyMatches(run.workflowKey, 'video-material-package')) return null;
  const promptDraftId = stepOutputValue(run, ['promptDraftId', 'expectedPromptDraftId', 'relatedPromptDraftId']);

  if (!hasStepSucceeded(run, 'prompt_generate') && isStepPending(run, 'prompt_generate')) {
    return {
      action: 'open-video-prompt',
      title: promptDraftId ? '打开视频 Prompt' : '进入视频 Prompt',
      description: promptDraftId
        ? '视频 Prompt 已保存但仍需确认或复制，进入视频 Prompt 工作台继续处理。'
        : '生成视频 Prompt 阶段待配置或待处理，进入工作台补输入、确认 Prompt 或配置文字模型。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'prompt_copy') && isStepPending(run, 'prompt_copy')) {
    return {
      action: 'open-video-prompt',
      title: promptDraftId ? '打开视频 Prompt' : '进入视频 Prompt',
      description: promptDraftId
        ? '继续使用本次 SOP 生成的视频 Prompt，并复制到 RunningHub / Vidu / Runway。'
        : '先生成或确认 15 秒视频素材 Prompt，再记录复制动作。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'finished_video_import') && isStepPending(run, 'finished_video_import')) {
    return {
      action: 'import-finished-video',
      title: '导入成品视频',
      description: '选择第三方平台生成后的本地 mp4 / mov 文件，并关联原视频 Prompt。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'overlay_cards') && isStepPending(run, 'overlay_cards')) {
    return {
      action: 'open-overlay',
      title: '编辑并生成绿幕图',
      description: '从 Prompt / 脚本拆标题卡、卖点卡、金句卡和 CTA 卡，生成本地绿幕文案图。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'human_review') && isStepPending(run, 'human_review')) {
    return {
      action: 'open-mix-export',
      title: '审核混剪素材',
      description: '检查导入视频、绿幕图和图片素材，通过后进入混剪包导出。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'export_manifest') && isStepPending(run, 'export_manifest')) {
    return {
      action: 'open-mix-export',
      title: '导出混剪包',
      description: '导出素材文件夹和 manifest，交给剪映或第三方混剪软件。',
      primary: true,
    };
  }

  return {
    action: 'open-mix-export',
    title: '查看混剪包',
    description: 'SOP 已完成，可查看已导出的素材包、manifest 和素材追溯。',
  };
}

function nextImageSopAction(run: WorkflowRunRecord): WorkflowRunNextAction | null {
  if (!workflowKeyMatches(run.workflowKey, 'xiaohongshu-seeding-image')) return null;
  const promptDraftId = stepOutputValue(run, ['promptDraftId']);

  if (!hasStepSucceeded(run, 'reference_reverse') && isStepPending(run, 'reference_reverse')) {
    return {
      action: 'open-reference-reverse',
      title: '打开对标图反推',
      description: '补参考图、产品资料或视觉理解配置，重新生成可追溯图片 Prompt。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'image_generate') && isStepPending(run, 'image_generate')) {
    return {
      action: promptDraftId ? 'open-image-workbench' : 'open-prompt-draft',
      title: promptDraftId ? '打开图片工作台' : '打开 Prompt 草稿',
      description: promptDraftId
        ? '把本次 SOP 的图片 Prompt 带入图片生成工作台，继续执行真实图片生成服务。'
        : '先确认图片 Prompt，再进入图片生成。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'human_review') && isStepPending(run, 'human_review')) {
    return {
      action: 'open-asset-review',
      title: '打开素材审核',
      description: '审核本次 SOP 生成的图片候选，确认通过、驳回或回炉。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'asset_store') && isStepPending(run, 'asset_store')) {
    return {
      action: 'open-asset-review',
      title: '查看素材入库',
      description: '确认通过审核的图片素材已经沉淀到素材库。',
      primary: true,
    };
  }

  return null;
}

function nextProductCommercialAction(run: WorkflowRunRecord): WorkflowRunNextAction | null {
  if (!workflowKeyMatches(run.workflowKey, 'product-commercial-assets')) return null;
  const promptDraftId = stepOutputValue(run, ['promptDraftId']);

  if (!hasStepSucceeded(run, 'input_register') && isStepPending(run, 'input_register')) {
    return {
      action: 'open-input-sources',
      title: '登记产品资料',
      description: '先补产品 brief、SKU 表或参考详情页，本次 SOP 才能生成可追溯的商业图片 Prompt。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'product_brief_structure') && isStepPending(run, 'product_brief_structure')) {
    return {
      action: 'open-input-sources',
      title: '补齐产品资料',
      description: '产品名、卖点、规格 / SKU、适用场景或禁用表达仍有缺口，先补资料再重新运行。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'prompt_generate') && isStepPending(run, 'prompt_generate')) {
    return {
      action: 'open-prompt-draft',
      title: promptDraftId ? '打开商业图片 Prompt' : '进入 Prompt 工作台',
      description: promptDraftId
        ? '检查主图、卖点图和详情页模块 Prompt，确认 SKU 与产品资料追溯后再生成图片。'
        : '先生成或确认商业图片 Prompt，再进入图片生成。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'image_generate') && isStepPending(run, 'image_generate')) {
    return {
      action: 'open-image-workbench',
      title: '打开图片工作台',
      description: '把本次商业图片 Prompt 带入图片生成，继续执行真实图片生成服务或处理待配置项。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'human_review') && isStepPending(run, 'human_review')) {
    return {
      action: 'open-asset-review',
      title: '审核商业素材',
      description: '核对图片候选、SKU 追溯、卖点事实和合规边界，通过后入素材库。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'asset_store') && isStepPending(run, 'asset_store')) {
    return {
      action: 'open-asset-review',
      title: '查看素材入库',
      description: '确认通过审核的商业图片素材已经沉淀到素材库。',
      primary: true,
    };
  }

  return {
    action: 'open-asset-review',
    title: '查看商业素材',
    description: 'SOP 已完成，可继续在审核台查看素材来源、Prompt 和入库状态。',
  };
}

function nextFeedbackTopicAction(run: WorkflowRunRecord): WorkflowRunNextAction | null {
  if (!workflowKeyMatches(run.workflowKey, 'feedback-topic-matrix')) return null;
  const promptDraftId = stepOutputValue(run, ['promptDraftId']);

  if (!hasStepSucceeded(run, 'input_register') && isStepPending(run, 'input_register')) {
    return {
      action: 'open-input-sources',
      title: '登记评论原声',
      description: '先登记评论、差评、客服问题或私信原声，痛点和标题方向必须来自真实用户语言。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'feedback_cluster') && isStepPending(run, 'feedback_cluster')) {
    return {
      action: 'open-input-sources',
      title: '补充用户反馈',
      description: '评论 / 客服资料不足以聚类痛点，先补真实反馈再重新运行。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'prompt_generate') && isStepPending(run, 'prompt_generate')) {
    return {
      action: 'open-prompt-draft',
      title: promptDraftId ? '打开选题 Prompt' : '进入 Prompt 工作台',
      description: promptDraftId
        ? '查看痛点矩阵派生的标题、脚本或文章 Prompt，确认后再进入文案生产。'
        : '先把痛点矩阵转成可编辑文案 Prompt。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'human_review') && isStepPending(run, 'human_review')) {
    return {
      action: 'open-prompt-draft',
      title: '审核选题 Prompt',
      description: '检查标题方向、客服异议话术和合规边界，确认来自真实评论后再用于文案生产。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'asset_store') && isStepPending(run, 'asset_store')) {
    return {
      action: 'archive-workflow-assets',
      title: '保存痛点矩阵',
      description: '把痛点矩阵、选题 Prompt、标签和输入源追溯写入运行历史。',
      primary: true,
    };
  }

  return {
    action: 'open-prompt-draft',
    title: '查看选题 Prompt',
    description: 'SOP 已完成，可继续从 Prompt 工作台生成文章、脚本或标题。',
  };
}

function nextGreenScreenCardAction(run: WorkflowRunRecord): WorkflowRunNextAction | null {
  if (!workflowKeyMatches(run.workflowKey, 'green-screen-card-package')) return null;
  const promptDraftId = stepOutputValue(run, ['promptDraftId']);

  if (!hasStepSucceeded(run, 'input_register') && isStepPending(run, 'input_register')) {
    return {
      action: 'open-input-sources',
      title: '登记脚本 / 卖点',
      description: '先补口播脚本、卖点列表或 CTA 文案，再拆成标题卡、卖点卡和行动卡。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'prompt_generate') && isStepPending(run, 'prompt_generate')) {
    return {
      action: 'open-prompt-draft',
      title: promptDraftId ? '打开绿幕 Prompt' : '进入 Prompt 工作台',
      description: promptDraftId
        ? '先检查绿幕卡拆分口径，确认文案长度和卡片类型后再生成。'
        : '先把脚本 / 卖点整理为绿幕文案图 Prompt。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'overlay_cards') && isStepPending(run, 'overlay_cards')) {
    return {
      action: 'open-overlay',
      title: '打开绿幕文案图',
      description: '把本次 SOP 的脚本和 Prompt 带入绿幕文案图工作台，继续拆卡、编辑和生成。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'human_review') && isStepPending(run, 'human_review')) {
    return {
      action: 'open-asset-review',
      title: '审核绿幕图',
      description: '检查标题卡、卖点卡和 CTA 卡是否可读，通过后进入混剪包素材候选。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'asset_store') && isStepPending(run, 'asset_store')) {
    return {
      action: 'open-asset-review',
      title: '确认绿幕图入库',
      description: '确认通过审核的绿幕文案图已经进入素材库，可用于混剪包导出。',
      primary: true,
    };
  }

  return {
    action: 'open-mix-export',
    title: '导出混剪包',
    description: 'SOP 已完成，可把绿幕文案图加入 manifest，交给第三方混剪软件。',
  };
}

function nextBrandSopAction(run: WorkflowRunRecord): WorkflowRunNextAction | null {
  if (!workflowKeyMatches(run.workflowKey, 'brand-scene-prompts')) return null;

  if (!hasStepSucceeded(run, 'human_review') && isStepPending(run, 'human_review')) {
    return {
      action: 'approve-workflow-review',
      title: '确认审核通过',
      description: '确认品牌知识库、场景卡和 Prompt 草稿可作为本次 SOP 产物进入历史。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'asset_store') && isStepPending(run, 'asset_store')) {
    return {
      action: 'archive-workflow-assets',
      title: '入历史留痕',
      description: '把本次 SOP 生成的品牌知识库、场景库和 Prompt 草稿写入运行历史。',
      primary: true,
    };
  }

  return {
    action: 'open-scene-library',
    title: '查看场景库',
    description: 'SOP 已完成，可继续从场景库派生图片、视频或文案 Prompt。',
  };
}

function nextIpLongformAction(run: WorkflowRunRecord): WorkflowRunNextAction | null {
  if (!workflowKeyMatches(run.workflowKey, 'ip-longform')) return null;
  const promptDraftId = stepOutputValue(run, ['promptDraftId']);

  if (!hasStepSucceeded(run, 'ip_extract') && isStepPending(run, 'ip_extract')) {
    return {
      action: 'open-ip-knowledge',
      title: '打开 IP 知识库',
      description: '补 IP 知识引用或重新构建六层 IP 知识库。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'agent_read') && isStepPending(run, 'agent_read')) {
    return {
      action: 'open-prompt-draft',
      title: promptDraftId ? '打开 Agent 会话' : '打开 Prompt 工作台',
      description: '继续查看 Agent 读取知识库后的追问、草稿和缺口。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'prompt_generate') && isStepPending(run, 'prompt_generate')) {
    return {
      action: 'open-prompt-draft',
      title: '打开文章 Prompt',
      description: '确认文章 Prompt 草稿后进入正文生成。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'human_review') && isStepPending(run, 'human_review')) {
    return {
      action: 'open-article-workbench',
      title: '进入文章生成',
      description: '把本次 SOP 的 IP 知识库和文章 Prompt 带入文章生成工作台。',
      primary: true,
    };
  }

  if (!hasStepSucceeded(run, 'asset_store') && isStepPending(run, 'asset_store')) {
    return {
      action: 'open-article-workbench',
      title: '查看文章草稿',
      description: '继续导出 Markdown，或回到 Prompt 草稿调整。',
      primary: true,
    };
  }

  return null;
}

function nextWorkflowRunAction(run: WorkflowRunRecord): WorkflowRunNextAction | null {
  return nextVideoMaterialAction(run)
    ?? nextImageSopAction(run)
    ?? nextProductCommercialAction(run)
    ?? nextFeedbackTopicAction(run)
    ?? nextGreenScreenCardAction(run)
    ?? nextBrandSopAction(run)
    ?? nextIpLongformAction(run);
}

function workflowRunArtifactActions(run: WorkflowRunRecord): Array<{
  action: WorkflowRunAction;
  title: string;
  description: string;
}> {
  const actions: Array<{
    action: WorkflowRunAction;
    title: string;
    description: string;
  }> = [];
  const isVideoRun = workflowKeyMatches(run.workflowKey, 'video-material-package');
  const brandKnowledgeBaseId = stepOutputValue(run, ['brandKnowledgeBaseId']);
  const ipKnowledgeBaseId = stepOutputValue(run, ['ipKnowledgeBaseId']);
  const promptPackId = stepOutputValue(run, ['promptPackId']);
  const promptPackRefIds = artifactRefIds(run, 'prompt-pack');
  const sceneCardIds = Array.from(new Set([
    ...stepOutputValues(run, ['sceneCardIds']),
    ...artifactRefIds(run, 'scene-card'),
  ]));
  const promptDraftId = stepOutputValue(run, ['promptDraftId', 'expectedPromptDraftId', 'relatedPromptDraftId']);
  const promptDraftRefIds = artifactRefIds(run, 'prompt-draft');
  const overlayCardIds = Array.from(new Set([
    ...stepOutputValues(run, ['overlayCardIds']),
    ...artifactRefIds(run, 'overlay-card'),
  ]));
  const assetReviewIds = Array.from(new Set([
    ...stepOutputValues(run, ['assetReviewIds', 'assetReviewId']),
    ...artifactRefIds(run, 'asset-review'),
  ]));
  const generatedAssetRefs = stepOutputValues(run, ['assetRefs'])
    .concat(run.artifactRefs.filter((ref) => ref.startsWith('generated:')));
  const generationLogIds = artifactRefIds(run, 'generation-log');
  const mixPackageId = stepOutputValue(run, ['mixPackageId']);
  const mixPackageRefIds = artifactRefIds(run, 'mix-package');
  const hasMixExportPath = Boolean(stepOutputValue(run, ['manifestPath', 'packageDir']))
    || hasPathArtifactRef(run, (ref) => /(^|\/)manifest\.json$/i.test(ref) || ref.includes('/mix-packages/'));
  const hasPlatformDraftPath = hasPathArtifactRef(run, (ref) => ref.includes('/platform-drafts/'));

  if (brandKnowledgeBaseId || artifactRefIds(run, 'brand-knowledge-base').length > 0) {
    pushWorkflowArtifactAction(
      actions,
      'open-brand-knowledge',
      '打开品牌知识库',
      '查看本次 SOP 抽取出的品牌口吻、卖点、场景种子和合规边界。',
    );
  }
  if (ipKnowledgeBaseId || artifactRefIds(run, 'ip-knowledge-base').length > 0) {
    pushWorkflowArtifactAction(
      actions,
      'open-ip-knowledge',
      '打开 IP 知识库',
      '查看本次 SOP 抽取出的身份、价值观、语言、方法和场景延伸。',
    );
  }
  if (promptPackId || promptPackRefIds.length > 0 || sceneCardIds.length > 0) {
    pushWorkflowArtifactAction(
      actions,
      'open-scene-library',
      '打开场景库',
      `${sceneCardIds.length || 0} 张场景卡，可继续生成图片、视频或文案 Prompt。`,
    );
  }
  if (promptDraftId || promptDraftRefIds.length > 0) {
    pushWorkflowArtifactAction(
      actions,
      'open-prompt-draft',
      '打开提示词草稿',
      '进入 Prompt 工作台继续审核、改写、复制或物化为 SOP。',
    );
  }
  if (overlayCardIds.length > 0) {
    pushWorkflowArtifactAction(
      actions,
      'open-overlay',
      '打开绿幕文案图',
      `${overlayCardIds.length} 张绿幕文案图，可继续编辑或重新生成。`,
    );
  }
  if (hasPlatformDraftPath) {
    pushWorkflowArtifactAction(
      actions,
      'open-platform-draft',
      '打开平台草稿包',
      '打开本地草稿包文件夹，继续复制正文、发布前检查和 manifest。',
    );
  }
  const hasReviewableAssets = assetReviewIds.length > 0 || generatedAssetRefs.length > 0;
  if (hasReviewableAssets && !isVideoRun) {
    pushWorkflowArtifactAction(
      actions,
      'open-asset-review',
      '打开素材审核',
      `${assetReviewIds.length || generatedAssetRefs.length || generationLogIds.length} 条素材记录，可确认通过、驳回或回炉。`,
    );
  }
  if (isVideoRun && (mixPackageId || mixPackageRefIds.length > 0 || hasMixExportPath || hasReviewableAssets || overlayCardIds.length > 0)) {
    pushWorkflowArtifactAction(
      actions,
      'open-mix-export',
      mixPackageId || mixPackageRefIds.length > 0 || hasMixExportPath ? '打开混剪包' : '打开混剪素材',
      mixPackageId || mixPackageRefIds.length > 0 || hasMixExportPath
        ? '查看已导出的素材文件夹、manifest 和第三方混剪交接信息。'
        : '进入混剪包工作台审核视频、绿幕图和图片素材。',
    );
  }

  return actions;
}

function assetKeyForLogAsset(logId: string, index: number, path: string): string {
  return `generated:${logId}:${index}:${path}`;
}

function assetLineageForRun(run: WorkflowRunRecord, logs: GenerationLogEntry[], reviews: AssetReviewRecord[]) {
  const runLogs = logs.filter((log) => log.workflowRunId === run.id && (log.kind === 'image' || log.kind === 'video'));
  const runReviews = reviews.filter((review) => review.workflowRunId === run.id);
  const reviewByKey = new Map(runReviews.map((review) => [review.assetKey, review]));
  const reworkLogs = runLogs.filter((log) => Boolean(log.reworkSource));
  const reworkLogIds = new Set(reworkLogs.map((log) => log.id));
  const rejectedReviews = runReviews.filter((review) => review.status === 'rejected');
  const approvedReworkReviews = runReviews.filter((review) =>
    review.status === 'approved' &&
    (review.sourceId ? reworkLogIds.has(review.sourceId) : reworkLogs.some((log) => review.assetKey.includes(log.id))),
  );
  const approvedBaseReviews = runReviews.filter((review) =>
    review.status === 'approved' &&
    !approvedReworkReviews.some((item) => item.id === review.id),
  );

  return {
    runLogs,
    reworkLogs,
    rejectedReviews,
    approvedReworkReviews,
    approvedBaseReviews,
    reviewByKey,
  };
}

function normalizeArtifactPath(value: string): string {
  return value.replace(/\\/g, '/');
}

function platformDraftsForRun(run: WorkflowRunRecord, drafts: PlatformDraftRecord[]): PlatformDraftRecord[] {
  const artifactRefs = new Set(run.artifactRefs.map(normalizeArtifactPath));
  const runPathText = run.artifactRefs.map(normalizeArtifactPath).join('\n');
  return drafts.filter((draft) => {
    if (draft.workflowRunId === run.id) return true;
    const refs = [
      draft.packageDir,
      draft.manifestPath,
      draft.markdownPath,
      draft.platformCopyPath,
      draft.metadataPath,
      draft.checklistPath,
    ].map(normalizeArtifactPath);
    return refs.some((ref) => artifactRefs.has(ref) || runPathText.includes(ref));
  });
}

function shortRef(value?: string): string {
  if (!value) return '未记录';
  return value.length > 36 ? `${value.slice(0, 32)}...` : value;
}

function DefinitionCard({
  definition,
  active,
  onSelect,
}: {
  definition: WorkflowDefinition;
  active: boolean;
  onSelect: () => void;
}) {
  return (
    <SelectableRecordCard
      className="workflow-definition-card"
      active={active}
      status={definition.status}
      statusTone={statusClass(definition.status)}
      title={definition.title}
      meta={`${definition.priority} · ${definition.version} · ${definition.tags.join(' / ')}`}
      description={definition.description}
      onClick={onSelect}
    />
  );
}

function DefinitionDetail({
  definition,
  workspaceReady,
  busy,
  onCreateDraft,
  onPublishDefinition,
  onUpdateDefinition,
}: {
  definition?: WorkflowDefinition;
  workspaceReady: boolean;
  busy: boolean;
  onCreateDraft: () => void;
  onPublishDefinition: (definitionId?: string) => void;
  onUpdateDefinition: (definition: WorkflowDefinition) => void;
}) {
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [priorityDraft, setPriorityDraft] = useState<WorkflowDefinition['priority']>('P1');
  const [versionDraft, setVersionDraft] = useState('');
  const [tagsDraft, setTagsDraft] = useState('');
  const [reviewRulesDraft, setReviewRulesDraft] = useState('');
  const [outputSpecDraft, setOutputSpecDraft] = useState('');
  const [inputSchemaDraft, setInputSchemaDraft] = useState('[]');
  const [stepsDraft, setStepsDraft] = useState('[]');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    setTitleDraft(definition?.title ?? '');
    setDescriptionDraft(definition?.description ?? '');
    setPriorityDraft(definition?.priority ?? 'P1');
    setVersionDraft(definition?.version ?? '');
    setTagsDraft((definition?.tags ?? []).join('\n'));
    setReviewRulesDraft((definition?.reviewRules ?? []).join('\n'));
    setOutputSpecDraft((definition?.outputSpec ?? []).join('\n'));
    setInputSchemaDraft(JSON.stringify(definition?.inputSchema ?? [], null, 2));
    setStepsDraft(JSON.stringify(definition?.steps ?? [], null, 2));
    setEditError('');
  }, [definition?.id]);

  if (!definition) {
    return (
      <section className="panel workflow-detail-panel">
        <div className="empty-state">当前工作区还没有工作流定义。</div>
      </section>
    );
  }

  const editable = definition.status !== 'published';
  const parseLines = (value: string): string[] =>
    value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  const parseJsonArray = <T,>(label: string, value: string): T[] => {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) throw new Error(`${label} 必须是 JSON 数组。`);
    return parsed as T[];
  };
  const saveDefinition = () => {
    if (!definition) return;
    try {
      const inputSchema = parseJsonArray<WorkflowDefinition['inputSchema'][number]>('输入字段', inputSchemaDraft);
      const steps = parseJsonArray<WorkflowDefinition['steps'][number]>('执行步骤', stepsDraft);
      if (!titleDraft.trim()) throw new Error('SOP 名称不能为空。');
      if (!versionDraft.trim()) throw new Error('版本不能为空。');
      if (inputSchema.length === 0) throw new Error('至少需要一个输入字段。');
      if (steps.length === 0) throw new Error('至少需要一个执行步骤。');
      setEditError('');
      onUpdateDefinition({
        ...definition,
        title: titleDraft.trim(),
        description: descriptionDraft.trim(),
        priority: priorityDraft,
        version: versionDraft.trim(),
        tags: parseLines(tagsDraft),
        reviewRules: parseLines(reviewRulesDraft),
        outputSpec: parseLines(outputSpecDraft),
        inputSchema,
        steps,
      });
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="panel workflow-detail-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">SOP 定义</p>
          <h3>{definition.title}</h3>
        </div>
        <ActionGroup>
          <button className="ghost small" disabled={!workspaceReady || busy} onClick={onCreateDraft}>
            生成 SOP 草案
          </button>
          <button
            className="primary small"
            disabled={!workspaceReady || busy || definition.status === 'published'}
            onClick={() => onPublishDefinition(definition.id)}
          >
            发布为可运行
          </button>
        </ActionGroup>
      </div>
      <div className="workflow-definition-editor">
        <div className="form-grid">
          <label>
            <span>SOP 名称</span>
            <input value={titleDraft} disabled={!editable || busy} onChange={(event) => setTitleDraft(event.target.value)} />
          </label>
          <label>
            <span>版本</span>
            <input value={versionDraft} disabled={!editable || busy} onChange={(event) => setVersionDraft(event.target.value)} />
          </label>
          <label>
            <span>优先级</span>
            <select value={priorityDraft} disabled={!editable || busy} onChange={(event) => setPriorityDraft(event.target.value as WorkflowDefinition['priority'])}>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
          </label>
          <label>
            <span>标签（每行一个）</span>
            <textarea value={tagsDraft} disabled={!editable || busy} onChange={(event) => setTagsDraft(event.target.value)} />
          </label>
        </div>
        <label className="field-label">描述</label>
        <textarea value={descriptionDraft} disabled={!editable || busy} onChange={(event) => setDescriptionDraft(event.target.value)} />
        <div className="workflow-two-column">
          <label>
            <span>审核规则（每行一个）</span>
            <textarea value={reviewRulesDraft} disabled={!editable || busy} onChange={(event) => setReviewRulesDraft(event.target.value)} />
          </label>
          <label>
            <span>输出规格（每行一个）</span>
            <textarea value={outputSpecDraft} disabled={!editable || busy} onChange={(event) => setOutputSpecDraft(event.target.value)} />
          </label>
        </div>
        <div className="workflow-two-column">
          <label>
            <span>输入字段 JSON</span>
            <textarea value={inputSchemaDraft} disabled={!editable || busy} onChange={(event) => setInputSchemaDraft(event.target.value)} />
          </label>
          <label>
            <span>执行步骤 JSON</span>
            <textarea value={stepsDraft} disabled={!editable || busy} onChange={(event) => setStepsDraft(event.target.value)} />
          </label>
        </div>
        <ActionGroup>
          <button className="primary small" disabled={!workspaceReady || busy || !editable} onClick={saveDefinition}>
            保存 SOP 定义
          </button>
          {definition.status === 'published' ? <span className="status-pill">已发布定义需要先复制为草案再编辑</span> : null}
          {editError ? <span className="status-pill blocked">{editError}</span> : null}
        </ActionGroup>
      </div>
      <div className="workflow-meta-grid">
        <span><strong>状态</strong><em>{definition.status}</em></span>
        <span><strong>版本</strong><em>{definition.version}</em></span>
        <span><strong>优先级</strong><em>{definition.priority}</em></span>
        <span><strong>更新时间</strong><em>{formatTime(definition.updatedAt)}</em></span>
      </div>
      <div className="workflow-two-column">
        <article>
          <h4>输入字段</h4>
          {definition.inputSchema.map((field) => (
            <div key={field.key} className="workflow-list-row">
              <strong>{field.label}</strong>
              <span>{field.type}{isRequiredWorkflowInput(field) ? ' / 必填' : ''}</span>
            </div>
          ))}
        </article>
        <article>
          <h4>审核规则</h4>
          {definition.reviewRules.map((rule) => (
            <div key={rule} className="workflow-list-row compact">
              <span>{rule}</span>
            </div>
          ))}
        </article>
      </div>
      <div className="workflow-step-list">
        {definition.steps.map((step, index) => (
          <article key={step.id} className="workflow-step-card">
            <span>{String(index + 1).padStart(2, '0')}</span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
              <small>{step.kind} · 输出：{step.outputKeys.join(' / ')}</small>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function CanvasDefinitionView({
  definition,
  workspaceReady,
  busy,
  onCreateDraft,
  onPublishDefinition,
  onUpdateDefinition,
}: {
  definition?: WorkflowDefinition;
  workspaceReady: boolean;
  busy: boolean;
  onCreateDraft: () => void;
  onPublishDefinition: (definitionId?: string) => void;
  onUpdateDefinition: (definition: WorkflowDefinition) => void;
}) {
  const [activeStepId, setActiveStepId] = useState('');
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [dependsOnDraft, setDependsOnDraft] = useState('');
  const [outputKeysDraft, setOutputKeysDraft] = useState('');
  const [blockedReasonDraft, setBlockedReasonDraft] = useState('');
  const [editError, setEditError] = useState('');

  useEffect(() => {
    setActiveStepId(definition?.steps[0]?.id ?? '');
    setEditError('');
  }, [definition?.id]);

  const activeStep =
    definition?.steps.find((step) => step.id === activeStepId) ??
    definition?.steps[0];

  useEffect(() => {
    setTitleDraft(activeStep?.title ?? '');
    setDescriptionDraft(activeStep?.description ?? '');
    setDependsOnDraft((activeStep?.dependsOn ?? []).join('\n'));
    setOutputKeysDraft((activeStep?.outputKeys ?? []).join('\n'));
    setBlockedReasonDraft(activeStep?.blockedReason ?? '');
    setEditError('');
  }, [definition?.id, activeStep?.id]);

  if (!definition) {
    return (
      <section className="panel workflow-canvas-panel">
        <div className="empty-state">当前工作区还没有可查看的工作流定义。</div>
      </section>
    );
  }

  const editable = definition.status !== 'published';
  const parseLines = (value: string): string[] =>
    value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
  const saveActiveStep = () => {
    if (!activeStep || !editable) return;
    try {
      if (!titleDraft.trim()) throw new Error('节点标题不能为空。');
      if (!descriptionDraft.trim()) throw new Error('节点说明不能为空。');
      const stepIds = new Set(definition.steps.map((step) => step.id));
      const dependsOn = parseLines(dependsOnDraft);
      const invalidDependency = dependsOn.find((stepId) => stepId === activeStep.id || !stepIds.has(stepId));
      if (invalidDependency) throw new Error(`依赖节点不存在或不能依赖自身：${invalidDependency}`);
      const outputKeys = parseLines(outputKeysDraft);
      if (outputKeys.length === 0) throw new Error('至少需要一个输出键。');
      setEditError('');
      onUpdateDefinition({
        ...definition,
        steps: definition.steps.map((step) =>
          step.id === activeStep.id
            ? {
              ...step,
              title: titleDraft.trim(),
              description: descriptionDraft.trim(),
              dependsOn,
              outputKeys,
              blockedReason: blockedReasonDraft.trim() || undefined,
            }
            : step,
        ),
      });
    } catch (error) {
      setEditError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="panel workflow-canvas-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Workflow Canvas</p>
          <h3>{definition.title}</h3>
        </div>
        <ActionGroup>
          <button className="ghost small" disabled={!workspaceReady || busy} onClick={onCreateDraft}>
            复制为草案
          </button>
          <button
            className="primary small"
            disabled={!workspaceReady || busy || definition.status === 'published'}
            onClick={() => onPublishDefinition(definition.id)}
          >
            发布定义
          </button>
        </ActionGroup>
      </div>
      <div className="workflow-canvas-workbench">
        <div className="workflow-canvas-map">
          {definition.steps.map((step, index) => (
            <article
              key={step.id}
              className={`workflow-canvas-node ${step.blockedReason ? 'blocked' : ''} ${step.id === activeStep?.id ? 'active' : ''}`}
              tabIndex={0}
              role="button"
              onClick={() => setActiveStepId(step.id)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') setActiveStepId(step.id);
              }}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{step.title}</strong>
                <small>{step.kind} · 输出 {step.outputKeys.join(' / ')}</small>
                <p>{step.description}</p>
                {step.dependsOn.length ? <em>依赖：{step.dependsOn.join(' / ')}</em> : <em>入口节点</em>}
                {step.blockedReason ? <b>{step.blockedReason}</b> : null}
              </div>
            </article>
          ))}
        </div>
        <aside className="workflow-canvas-editor">
          <div>
            <p className="eyebrow">节点轻编辑</p>
            <h4>{activeStep?.id ?? '未选择节点'}</h4>
            <span>只编辑同一份 SOP 定义，不保存画布坐标。</span>
          </div>
          {activeStep ? (
            <>
              <label>
                <span>节点标题</span>
                <input value={titleDraft} disabled={!editable || busy} onChange={(event) => setTitleDraft(event.target.value)} />
              </label>
              <label>
                <span>节点说明</span>
                <textarea value={descriptionDraft} disabled={!editable || busy} onChange={(event) => setDescriptionDraft(event.target.value)} />
              </label>
              <div className="workflow-two-column">
                <label>
                  <span>依赖节点 ID</span>
                  <textarea value={dependsOnDraft} disabled={!editable || busy} onChange={(event) => setDependsOnDraft(event.target.value)} />
                </label>
                <label>
                  <span>输出键</span>
                  <textarea value={outputKeysDraft} disabled={!editable || busy} onChange={(event) => setOutputKeysDraft(event.target.value)} />
                </label>
              </div>
              <label>
                <span>待配置原因（可选）</span>
                <textarea value={blockedReasonDraft} disabled={!editable || busy} onChange={(event) => setBlockedReasonDraft(event.target.value)} />
              </label>
              <ActionGroup align="left">
                <button className="primary small" disabled={!workspaceReady || busy || !editable} onClick={saveActiveStep}>
                  保存节点到定义
                </button>
                {definition.status === 'published' ? <span className="status-pill">已发布定义需要先复制为草案再编辑</span> : null}
                {editError ? <span className="status-pill blocked">{editError}</span> : null}
              </ActionGroup>
            </>
          ) : null}
        </aside>
      </div>
      <div className="inline-warning">
        Canvas 只作为高级轻编辑视图；普通用户仍从 SOP 表单执行，工作流事实源仍是可版本化的 SOP 定义。
      </div>
    </section>
  );
}

function SopRunner({
  definition,
  latestRun,
  inputSources,
  workspaceReady,
  busy,
  onStartRun,
  onSelectRun,
  onRunAction,
  onOpenInputSources,
  onOpenHistory,
}: {
  definition?: WorkflowDefinition;
  latestRun?: WorkflowRunRecord;
  inputSources: InputSourceRecord[];
  workspaceReady: boolean;
  busy: boolean;
  onStartRun: (definitionId?: string, inputs?: Record<string, string>, inputSourceIds?: string[]) => void;
  onSelectRun: (runId: string) => void;
  onRunAction: (action: WorkflowRunAction, runId: string) => void;
  onOpenInputSources: () => void;
  onOpenHistory: () => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [selectedInputSourceIds, setSelectedInputSourceIds] = useState<string[]>([]);
  const inputSourcesSignature = useMemo(() => sourceSignature(inputSources), [inputSources]);
  const matchingInputSources = useMemo(
    () => definition
      ? inputSources
        .filter((source) => inputSourceMatchesWorkflowDefinitionKey(source, definition.key))
        .slice(0, 12)
      : [],
    [definition?.key, inputSourcesSignature],
  );

  useEffect(() => {
    setInputs(Object.fromEntries((definition?.inputSchema ?? []).map((field) => [field.key, ''])));
  }, [definition?.id]);

  useEffect(() => {
    setSelectedInputSourceIds(definition ? selectWorkflowInputSourceIdsForDefinition(definition, inputSources) : []);
  }, [definition?.id, inputSourcesSignature]);

  if (!definition) {
    return (
      <section className="panel workflow-runner-panel">
        <div className="empty-state">没有可运行的 SOP 定义。</div>
      </section>
    );
  }

  const canRun = workspaceReady && !busy && definition.status === 'published';
  const latestRunNextAction = latestRun ? nextWorkflowRunAction(latestRun) : null;
  const latestWaitingStep = latestRun ? currentWaitingStep(latestRun) : null;
  const latestStepSummaries = latestRun
    ? latestRun.steps
      .filter((step) => Boolean(step.summary?.trim()))
      .slice(-4)
    : [];
  const missingRequiredFields = definition.inputSchema
    .filter((field) => isRequiredWorkflowInput(field) && !(inputs[field.key] ?? '').trim())
    .map(workflowInputFieldLabel);
  const canRunInputs = missingRequiredFields.length === 0;
  const hasAdHocSourceText = Boolean(inputs.source?.trim());
  const selectedInputSources = matchingInputSources.filter((source) => selectedInputSourceIds.includes(source.id));
  const requiredPurposeLabels = workflowInputPurposesForDefinitionKey(definition.key)
    .map(inputSourcePurposeLabel)
    .slice(0, 5);
  const canRunSources = selectedInputSources.length > 0 || hasAdHocSourceText;
  const missingSourceMessage = matchingInputSources.length === 0
    ? `请先登记可追溯资料：${requiredPurposeLabels.join('、')}，或直接在“补充资料说明”里粘贴本次资料。`
    : '请至少选择一个资料来源，或在“补充资料说明”里粘贴本次临时资料。';

  function toggleInputSource(sourceId: string): void {
    setSelectedInputSourceIds((current) =>
      current.includes(sourceId)
        ? current.filter((id) => id !== sourceId)
        : [...current, sourceId],
    );
  }

  return (
    <section className="panel workflow-runner-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">表单化执行</p>
          <h3>{definition.title}</h3>
        </div>
        <button
          className="primary small"
          disabled={!canRun || !canRunInputs || !canRunSources}
          onClick={() => onStartRun(definition.id, inputs, selectedInputSources.map((source) => source.id))}
        >
          运行 SOP
        </button>
      </div>
      <div className="workflow-form-grid">
        {definition.inputSchema.map((field) => (
          <label key={field.key}>
            <span>{workflowInputFieldLabel(field)}{isRequiredWorkflowInput(field) ? ' *' : ''}</span>
            {field.type === 'textarea' ? (
              <textarea
                value={inputs[field.key] ?? ''}
                onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))}
                placeholder={workflowInputFieldHelp(field)}
              />
            ) : field.type === 'select' ? (
              <select
                value={inputs[field.key] ?? ''}
                onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))}
              >
                <option value="">请选择</option>
                {(field.options ?? []).map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                value={inputs[field.key] ?? ''}
                type={field.type === 'number' ? 'number' : 'text'}
                onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))}
                placeholder={workflowInputFieldHelp(field)}
              />
            )}
          </label>
        ))}
      </div>
      <div className="workflow-input-source-picker">
        <div className="workflow-input-source-picker-head">
          <div>
            <p className="eyebrow">本次使用资料</p>
            <h4>{selectedInputSources.length} / {matchingInputSources.length} 个资料已选择</h4>
          </div>
          <ActionGroup>
            <button
              type="button"
              className="ghost small"
              disabled={!matchingInputSources.length}
              onClick={() => setSelectedInputSourceIds(matchingInputSources.map((source) => source.id))}
            >
              选择推荐资料
            </button>
            <button type="button" className="ghost small" onClick={onOpenInputSources}>
              去登记资料
            </button>
          </ActionGroup>
        </div>
        <div className="workflow-input-source-hints">
          {requiredPurposeLabels.map((label) => <span key={label}>{label}</span>)}
          {hasAdHocSourceText ? <span>已粘贴临时资料，将自动留痕</span> : null}
        </div>
        {matchingInputSources.length ? (
          <div className="workflow-input-source-list">
            {matchingInputSources.map((source) => (
              <label key={source.id} className="workflow-input-source-option">
                <input
                  type="checkbox"
                  checked={selectedInputSourceIds.includes(source.id)}
                  onChange={() => toggleInputSource(source.id)}
                />
                <span>
                  <strong>{source.title}</strong>
                  <small>
                    {inputSourcePurposeLabel(source.purpose)} · {inputSourceKindLabel(source.kind)} · {inputSourceStatusLabel(source.status)} · {inputSourceTimestamp(source)}
                  </small>
                  <em>{inputSourceSummary(source)}</em>
                </span>
              </label>
            ))}
          </div>
        ) : (
          <div className="empty-state">还没有适合这个 SOP 的已登记资料。可以先去登记资料；也可以直接在上方“补充资料说明”粘贴本次资料，运行时会自动登记成可追溯输入源。</div>
        )}
      </div>
      {!canRunInputs ? (
        <div className="inline-warning">
          请先补齐必填字段：{missingRequiredFields.join('、')}。补齐后再运行 SOP，避免生成不可执行的待配置记录。
        </div>
      ) : null}
      {!canRunSources ? (
        <div className="inline-warning workflow-runner-warning">
          <span>{missingSourceMessage}资料会写入运行记录，后续素材审核、Prompt 回炉和混剪包才能追溯。</span>
          <button type="button" className="ghost small" onClick={onOpenInputSources}>
            去输入源 / 文档转换
          </button>
        </div>
      ) : null}
      {definition.status !== 'published' ? (
        <div className="inline-warning">
          当前 SOP 还未发布。请在高级维护中确认输入、步骤、审核和导出规则后再运行。
        </div>
      ) : null}
      {latestRun ? (
        <div className="workflow-latest-run">
          <div className="workflow-latest-run-head">
            <StatusPill tone={statusClass(latestRun.status)}>{STATUS_LABELS[latestRun.status]}</StatusPill>
            <div>
              <strong>{latestRun.title}</strong>
              <span>{latestRun.summary}</span>
              <small>
                {latestWaitingStep ? `当前等待：${latestWaitingStep.title}` : '没有等待中的步骤'} · {formatTime(latestRun.createdAt)}
              </small>
            </div>
          </div>
          <div className="workflow-run-steps">
            {latestRun.steps.map((step) => (
              <span key={step.stepId} className={statusClass(step.status)}>
                {step.title}
              </span>
            ))}
          </div>
          {latestStepSummaries.length ? (
            <div className="workflow-latest-run-trace">
              <p className="eyebrow">最近步骤</p>
              {latestStepSummaries.map((step) => (
                <span key={step.stepId}>
                  <strong>{step.title}</strong>
                  <em>{step.summary}</em>
                </span>
              ))}
            </div>
          ) : null}
          {latestRunNextAction ? (
            <div className="workflow-latest-run-next">
              <div>
                <p className="eyebrow">下一步</p>
                <strong>{latestRunNextAction.title}</strong>
                <span>{latestRunNextAction.description}</span>
              </div>
              <ActionGroup>
                <button
                  className={latestRunNextAction.primary ? 'primary small' : 'ghost small'}
                  disabled={!workspaceReady || busy}
                  onClick={() => onRunAction(latestRunNextAction.action, latestRun.id)}
                >
                  继续下一步
                </button>
                <button className="ghost small" onClick={() => { onSelectRun(latestRun.id); onOpenHistory(); }}>
                  查看运行详情
                </button>
              </ActionGroup>
            </div>
          ) : (
            <ActionGroup>
              <button className="ghost small" onClick={() => { onSelectRun(latestRun.id); onOpenHistory(); }}>
                查看运行详情
              </button>
            </ActionGroup>
          )}
        </div>
      ) : null}
    </section>
  );
}

function RunDetail({
  run,
  logs,
  inputSources,
  assetReviews,
  platformDrafts,
  copiedPlatformDraftId,
  selectedStepId,
  onSelectStepId,
  workspaceReady,
  busy,
  onRunAction,
  onRevealPath,
  onCopyPlatformDraft,
  onOpenPromptDraft,
  onOpenSourceLog,
}: {
  run?: WorkflowRunRecord;
  logs: GenerationLogEntry[];
  inputSources: InputSourceRecord[];
  assetReviews: AssetReviewRecord[];
  platformDrafts: PlatformDraftRecord[];
  copiedPlatformDraftId: string | null;
  selectedStepId: string;
  onSelectStepId: (stepId: string) => void;
  workspaceReady: boolean;
  busy: boolean;
  onRunAction: (action: WorkflowRunAction, runId: string) => void;
  onRevealPath: (path: string) => void;
  onCopyPlatformDraft: (draftId: string) => void;
  onOpenPromptDraft: (promptDraftId: string) => void;
  onOpenSourceLog: (sourceLogId: string) => void;
}) {
  const selectedStep =
    run?.steps.find((step) => step.stepId === selectedStepId) ??
    run?.steps[0];
  const nextAction = run ? nextWorkflowRunAction(run) : null;
  const artifactActions = run ? workflowRunArtifactActions(run) : [];
  const lineage = run ? assetLineageForRun(run, logs, assetReviews) : null;
  const runPlatformDrafts = run ? platformDraftsForRun(run, platformDrafts).slice(0, 6) : [];
  const runSourceIds = run?.inputSourceIds ?? [];
  const runSourceRecords = runSourceIds
    .map((sourceId) => inputSources.find((source) => source.id === sourceId))
    .filter((source): source is InputSourceRecord => Boolean(source));
  const userSelectedSources = runSourceRecords.filter((source) => !source.tags.includes('workflow-run'));
  const workflowRunSources = runSourceRecords.filter((source) => source.tags.includes('workflow-run'));
  const missingSourceIds = runSourceIds.filter((sourceId) => !runSourceRecords.some((source) => source.id === sourceId));

  if (!run) {
    return (
      <section className="panel workflow-run-detail-panel">
        <div className="empty-state">先选择一条 SOP 运行记录，右侧会显示本次输入、步骤结果、资料来源和产物线索。</div>
      </section>
    );
  }

  return (
    <section className="panel workflow-run-detail-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">运行详情</p>
          <h3>{run.title}</h3>
        </div>
        <div className="workflow-summary-stack compact">
          <StatusPill tone={statusClass(run.status)}>{STATUS_LABELS[run.status]}</StatusPill>
          <StatusPill>{run.workflowKey}@{run.workflowVersion}</StatusPill>
        </div>
      </div>

      <p>{run.summary}</p>

      {nextAction ? (
        <div className="workflow-run-action-panel">
          <div>
            <p className="eyebrow">下一步动作</p>
            <strong>{nextAction.title}</strong>
            <span>{nextAction.description}</span>
          </div>
          <button
            className={nextAction.primary ? 'primary small' : 'ghost small'}
            disabled={!workspaceReady || busy}
            onClick={() => onRunAction(nextAction.action, run.id)}
          >
            {nextAction.title}
          </button>
        </div>
      ) : null}

      {artifactActions.length ? (
        <div className="workflow-run-artifact-panel">
          <div>
            <p className="eyebrow">产物快捷入口</p>
            <strong>打开本次 SOP 已生成的业务产物</strong>
            <span>这些入口来自步骤输出和真实产物引用，不新增一级导航。</span>
          </div>
          <div className="workflow-run-artifact-actions">
            {artifactActions.map((item) => (
              <button
                key={item.action}
                type="button"
                className="ghost small"
                disabled={!workspaceReady || busy}
                title={item.description}
                onClick={() => onRunAction(item.action, run.id)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {runPlatformDrafts.length ? (
        <div className="workflow-platform-draft-panel">
          <div>
            <p className="eyebrow">平台草稿包</p>
            <strong>本次 SOP 已导出的本地交付包</strong>
            <span>可直接打开草稿包、复制发布文案，并反查提示词或文章来源记录。</span>
          </div>
          <PlatformDraftTraceList
            drafts={runPlatformDrafts}
            busy={busy}
            workspaceReady={workspaceReady}
            copiedDraftId={copiedPlatformDraftId}
            onRevealPath={onRevealPath}
            onCopyPlatformDraft={onCopyPlatformDraft}
            onOpenPromptDraft={onOpenPromptDraft}
            onOpenSourceLog={onOpenSourceLog}
          />
        </div>
      ) : null}

      <div className="workflow-meta-grid compact">
        <span><strong>创建时间</strong><em>{formatTime(run.createdAt)}</em></span>
        <span><strong>更新状态</strong><em>{formatTime(run.updatedAt)}</em></span>
        <span><strong>步骤数</strong><em>{run.steps.length} 步</em></span>
        <span><strong>产物线索</strong><em>{run.artifactRefs.length} 条</em></span>
        <span><strong>资料来源</strong><em>{runSourceIds.length} 个</em></span>
        <span><strong>知识引用</strong><em>{run.citations?.length ?? 0} 条</em></span>
      </div>

      {runSourceIds.length ? (
        <div className="workflow-citation-panel workflow-run-source-panel">
          <h4>本次资料来源</h4>
          <div className="workflow-citation-list">
            {(userSelectedSources.length ? userSelectedSources : workflowRunSources).map((source) => (
              <article key={source.id} className="workflow-citation-card">
                <strong>{source.title}</strong>
                <small>
                  {inputSourcePurposeLabel(source.purpose)} · {inputSourceKindLabel(source.kind)} · {inputSourceStatusLabel(source.status)}
                  {source.tags.includes('workflow-run') ? ' · 运行补充记录' : ''}
                </small>
                <p>{inputSourceSummary(source)}</p>
              </article>
            ))}
            {userSelectedSources.length && workflowRunSources.length ? (
              <article key="workflow-run-sources" className="workflow-citation-card">
                <strong>运行补充记录</strong>
                <small>{workflowRunSources.length} 条</small>
                <p>{workflowRunSources.map((source) => source.title).join(' / ')}</p>
              </article>
            ) : null}
            {missingSourceIds.map((sourceId) => (
              <article key={sourceId} className="workflow-citation-card">
                <strong>未加载资料</strong>
                <small>输入源记录缺失</small>
                <p>运行记录保留了这条资料线索，但当前输入源列表里没有对应记录，请刷新或重新登记资料。</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="workflow-two-column">
        <article>
          <h4>输入</h4>
          {Object.entries(run.inputs).map(([key, value]) => (
            <div key={key} className="workflow-list-row">
              <strong>{workflowRunInputLabel(key)}</strong>
              <span>{value || '未填写'}</span>
            </div>
          ))}
        </article>
        <article>
          <h4>产物线索</h4>
          <div className="workflow-run-steps">
            {run.artifactRefs.length > 0 ? run.artifactRefs.map((ref) => (
              <span key={ref} title={ref}>{artifactRefLabel(ref)}</span>
            )) : <span className="idle">暂无引用</span>}
          </div>
        </article>
      </div>

      {run.citations?.length ? (
        <div className="workflow-citation-panel">
          <h4>知识引用</h4>
          <div className="workflow-citation-list">
            {run.citations.map((citation, index) => (
              <article key={`${citation.knowledgeBaseId}:${citation.sectionId}:${index}`} className="workflow-citation-card">
                <strong>{citation.title}</strong>
                <small>{citation.sectionType}</small>
                <p>{citation.excerpt}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {lineage && (
        lineage.rejectedReviews.length > 0 ||
        lineage.reworkLogs.length > 0 ||
        lineage.approvedReworkReviews.length > 0 ||
        lineage.approvedBaseReviews.length > 0
      ) ? (
        <div className="workflow-citation-panel">
          <h4>素材审核与回炉</h4>
          <div className="workflow-citation-list">
            {lineage.rejectedReviews.map((review) => (
              <article key={`rejected:${review.id}`} className="workflow-citation-card">
                <strong>原驳回素材：{review.title}</strong>
                <small>{assetKindLabel(review.kind)} · 原素材记录</small>
                <p>{review.note ?? '未记录驳回原因。'}</p>
              </article>
            ))}
            {lineage.reworkLogs.map((log) => (
              <article key={`rework:${log.id}`} className="workflow-citation-card">
                <strong>回炉生成：{log.title}</strong>
                <small>
                  原素材记录 · 新候选素材
                </small>
                <p>{log.reworkSource?.reviewNote ?? log.summary ?? '已基于驳回素材回炉生成候选图。'}</p>
                <div className="workflow-run-steps">
                  {(log.artifactRefs ?? []).map((assetRef, index) => {
                    const review = lineage.reviewByKey.get(assetKeyForLogAsset(log.id, index, assetRef));
                    return (
                      <span key={assetRef} className={review?.status === 'approved' ? 'ready' : review?.status === 'rejected' ? 'blocked' : 'idle'}>
                        {review?.status === 'approved' ? '新通过素材' : review?.status === 'rejected' ? '新素材驳回' : '新候选素材'}
                      </span>
                    );
                  })}
                </div>
              </article>
            ))}
            {lineage.approvedReworkReviews.map((review) => (
              <article key={`approved-rework:${review.id}`} className="workflow-citation-card">
                <strong>新通过素材：{review.title}</strong>
                <small>{assetKindLabel(review.kind)} · 已通过并入库</small>
                <p>{review.note ?? '回炉后人工审核通过，可进入素材库。'}</p>
              </article>
            ))}
            {lineage.approvedBaseReviews.map((review) => (
              <article key={`approved-base:${review.id}`} className="workflow-citation-card">
                <strong>通过素材：{review.title}</strong>
                <small>{assetKindLabel(review.kind)} · 已通过并入库</small>
                <p>{review.note ?? '人工审核通过，可进入素材库。'}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <div className="workflow-run-step-layout">
        <aside className="workflow-run-step-list">
          {run.steps.map((step, index) => (
            <button
              key={step.stepId}
              type="button"
              className={`workflow-step-card ${selectedStep?.stepId === step.stepId ? 'active' : ''}`}
              onClick={() => onSelectStepId(step.stepId)}
            >
              <span>{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{step.title}</strong>
                <p>{step.summary ?? '暂无摘要'}</p>
                <small>{STATUS_LABELS[step.status]}</small>
              </div>
            </button>
          ))}
        </aside>
        <article className="workflow-run-step-detail">
          {selectedStep ? (
            <>
              <div className="panel-title">
                <div>
                  <p className="eyebrow">步骤轨迹</p>
                  <h4>{selectedStep.title}</h4>
                </div>
                <StatusPill tone={statusClass(selectedStep.status)}>{STATUS_LABELS[selectedStep.status]}</StatusPill>
              </div>
              <div className="workflow-meta-grid compact">
                <span><strong>开始</strong><em>{formatTime(selectedStep.startedAt)}</em></span>
                <span><strong>完成</strong><em>{formatTime(selectedStep.completedAt)}</em></span>
                <span><strong>错误</strong><em>{selectedStep.error ?? '无'}</em></span>
                <span><strong>步骤记录</strong><em>已保留</em></span>
              </div>
              <div className="workflow-two-column">
                <article>
                  <h4>步骤输入</h4>
                  {workflowPayloadEntries(selectedStep.input).map(([key, value]) => (
                    <div key={key} className="workflow-list-row">
                      <strong>{key}</strong>
                      <span>{value}</span>
                    </div>
                  ))}
                </article>
                <article>
                  <h4>步骤输出</h4>
                  {workflowPayloadEntries(selectedStep.output).map(([key, value]) => (
                    <div key={key} className="workflow-list-row">
                      <strong>{key}</strong>
                      <span>{value}</span>
                    </div>
                  ))}
                </article>
              </div>
            </>
          ) : (
            <div className="empty-state">没有可查看的步骤。</div>
          )}
        </article>
      </div>
    </section>
  );
}

function RunHistory({
  runs,
  selectedRun,
  logs,
  inputSources,
  assetReviews,
  platformDrafts,
  copiedPlatformDraftId,
  onSelectRun,
  workspaceReady,
  busy,
  onRunAction,
  onRevealPath,
  onCopyPlatformDraft,
  onOpenPromptDraft,
  onOpenSourceLog,
}: {
  runs: WorkflowRunRecord[];
  selectedRun?: WorkflowRunRecord;
  logs: GenerationLogEntry[];
  inputSources: InputSourceRecord[];
  assetReviews: AssetReviewRecord[];
  platformDrafts: PlatformDraftRecord[];
  copiedPlatformDraftId: string | null;
  onSelectRun: (runId: string) => void;
  workspaceReady: boolean;
  busy: boolean;
  onRunAction: (action: WorkflowRunAction, runId: string) => void;
  onRevealPath: (path: string) => void;
  onCopyPlatformDraft: (draftId: string) => void;
  onOpenPromptDraft: (promptDraftId: string) => void;
  onOpenSourceLog: (sourceLogId: string) => void;
}) {
  const [selectedStepId, setSelectedStepId] = useState(selectedRun?.steps[0]?.stepId ?? '');

  useEffect(() => {
    setSelectedStepId(selectedRun?.steps[0]?.stepId ?? '');
  }, [selectedRun?.id]);

  return (
    <section className="panel workflow-history-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">SOP 运行记录</p>
          <h3>运行历史</h3>
        </div>
        <StatusPill>{runs.length} 条</StatusPill>
      </div>
      <div className="workflow-history-layout">
        <aside className="workflow-run-list">
          {runs.map((run) => (
            <SelectableRecordCard
              key={run.id}
              className="workflow-run-card"
              active={run.id === selectedRun?.id}
              status={STATUS_LABELS[run.status]}
              statusTone={statusClass(run.status)}
              title={run.title}
              meta={`${run.workflowKey}@${run.workflowVersion} · ${formatTime(run.createdAt)}`}
              description={run.summary}
              onClick={() => onSelectRun(run.id)}
            >
              <div className="workflow-run-steps">
                {run.steps.map((step) => (
                  <span key={step.stepId} className={statusClass(step.status)}>
                    {step.title}
                  </span>
                ))}
              </div>
            </SelectableRecordCard>
          ))}
          {runs.length === 0 ? (
            <div className="empty-state">还没有 SOP 运行记录。运行 SOP 会先保存输入、步骤和待配置恢复路径。</div>
          ) : null}
        </aside>
        <RunDetail
          run={selectedRun}
          logs={logs}
          inputSources={inputSources}
          assetReviews={assetReviews}
          platformDrafts={platformDrafts}
          copiedPlatformDraftId={copiedPlatformDraftId}
          selectedStepId={selectedStepId}
          onSelectStepId={setSelectedStepId}
          workspaceReady={workspaceReady}
          busy={busy}
          onRunAction={onRunAction}
          onRevealPath={onRevealPath}
          onCopyPlatformDraft={onCopyPlatformDraft}
          onOpenPromptDraft={onOpenPromptDraft}
          onOpenSourceLog={onOpenSourceLog}
        />
      </div>
    </section>
  );
}

export function WorkflowFeatureModule({
  module,
  workspaceReady,
  busy,
  definitions,
  runs,
  logs,
  inputSources,
  assetReviews,
  platformDrafts,
  copiedPlatformDraftId,
  activeDefinitionId,
  activeRunId,
  onSelectDefinition,
  onCreateDraft,
  onPublishDefinition,
  onUpdateDefinition,
  onStartRun,
  onSelectRun,
  onRunAction,
  onOpenInputSources,
  onRevealPath,
  onCopyPlatformDraft,
  onOpenPromptDraft,
  onOpenSourceLog,
}: WorkflowFeatureModuleProps) {
  const [activeView, setActiveView] = useState<WorkflowView>(() => viewFromModule(module));
  const [advancedOpen, setAdvancedOpen] = useState(() => isAdvancedWorkflowView(viewFromModule(module)));

  useEffect(() => {
    const nextView = viewFromModule(module);
    setActiveView(nextView);
    if (isAdvancedWorkflowView(nextView)) setAdvancedOpen(true);
  }, [module]);

  const feature = V2_FEATURES[featureKeyFromView(activeView)];
  const publishedDefinitions = useMemo(
    () => definitions.filter((definition) => definition.status === 'published'),
    [definitions],
  );
  const activeRunById = runs.find((run) => run.id === activeRunId);
  const activeRunDefinitionId =
    activeView === 'run' && activeRunById
      ? activeRunById.workflowDefinitionId
      : undefined;
  const activeDefinition =
    definitions.find((definition) => definition.id === activeDefinitionId) ??
    definitions.find((definition) => definition.id === activeRunDefinitionId) ??
    publishedDefinitions[0] ??
    definitions[0];
  const activeRun =
    activeRunById ??
    runs.find((run) => run.workflowDefinitionId === activeDefinition?.id) ??
    runs[0];
  const visibleDefinitions = activeView === 'run' ? publishedDefinitions : definitions;
  const runnerDefinition = activeDefinition?.status === 'published' ? activeDefinition : publishedDefinitions[0];
  const latestRun =
    activeView === 'run'
      ? activeRunById
        ?? runs.find((run) => run.workflowDefinitionId === runnerDefinition?.id)
        ?? runs[0]
      : runs.find((run) => run.workflowDefinitionId === activeDefinition?.id);
  const baseViewTabs: Array<{ key: WorkflowView; label: string; hint: string }> = [
    { key: 'run', label: '执行表单', hint: `${publishedDefinitions.length} 个可运行` },
    { key: 'history', label: '运行记录', hint: `${runs.length} 条` },
  ];
  const advancedViewTabs: Array<{ key: WorkflowView; label: string; hint: string }> = [
    { key: 'definition', label: '定义管理', hint: `${definitions.length} 个版本` },
    { key: 'canvas', label: 'Canvas', hint: '高级视图' },
  ];
  const viewTabs = advancedOpen ? [...baseViewTabs, ...advancedViewTabs] : baseViewTabs;

  function toggleAdvancedViews(): void {
    setAdvancedOpen((current) => {
      const next = !current;
      if (!next && isAdvancedWorkflowView(activeView)) setActiveView('run');
      return next;
    });
  }

  return (
    <section className="workflow-feature-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="managed"
        actions={(
          <div className="workflow-summary-stack">
            <StatusPill tone="ready">{publishedDefinitions.length} 个可运行</StatusPill>
            <StatusPill>{runs.length} 条运行记录</StatusPill>
          </div>
        )}
      >
        <nav className="workflow-view-tabs module-command-tabs" role="tablist" aria-label="SOP 内部视图">
          {viewTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={activeView === tab.key}
              className={activeView === tab.key ? 'active' : ''}
              onClick={() => setActiveView(tab.key)}
            >
              <strong>{tab.label}</strong>
              <span>{tab.hint}</span>
            </button>
          ))}
          <button
            type="button"
            className={`workflow-advanced-tab ${advancedOpen ? 'active' : ''}`}
            onClick={toggleAdvancedViews}
          >
            <strong>高级维护</strong>
            <span>{advancedOpen ? '收起定义 / Canvas' : '定义 / Canvas'}</span>
          </button>
        </nav>
      </ModuleCommandCenter>

      <div className="workflow-feature-layout">
        <aside className="panel workflow-definition-list">
          <div className="panel-title">
            <div>
              <p className="eyebrow">定义列表</p>
              <h3>SOP</h3>
            </div>
          </div>
          {visibleDefinitions.map((definition) => (
            <DefinitionCard
              key={definition.id}
              definition={definition}
              active={definition.id === activeDefinition?.id}
              onSelect={() => {
                onSelectDefinition(definition.id);
                if (activeView === 'run') onSelectRun('');
              }}
            />
          ))}
          {visibleDefinitions.length === 0 ? <div className="empty-state">暂无定义。</div> : null}
        </aside>

        <main className="workflow-feature-main">
          {activeView === 'run' ? (
            <SopRunner
              definition={runnerDefinition}
              latestRun={latestRun}
              inputSources={inputSources}
              workspaceReady={workspaceReady}
              busy={busy}
              onStartRun={onStartRun}
              onSelectRun={onSelectRun}
              onRunAction={onRunAction}
              onOpenInputSources={onOpenInputSources}
              onOpenHistory={() => setActiveView('history')}
            />
          ) : activeView === 'history' ? (
            <RunHistory
              runs={runs}
              selectedRun={activeRun}
              logs={logs}
              inputSources={inputSources}
              assetReviews={assetReviews}
              platformDrafts={platformDrafts}
              copiedPlatformDraftId={copiedPlatformDraftId}
              onSelectRun={onSelectRun}
              workspaceReady={workspaceReady}
              busy={busy}
              onRunAction={onRunAction}
              onRevealPath={onRevealPath}
              onCopyPlatformDraft={onCopyPlatformDraft}
              onOpenPromptDraft={onOpenPromptDraft}
              onOpenSourceLog={onOpenSourceLog}
            />
          ) : activeView === 'canvas' ? (
            <CanvasDefinitionView
              definition={activeDefinition}
              workspaceReady={workspaceReady}
              busy={busy}
              onCreateDraft={onCreateDraft}
              onPublishDefinition={onPublishDefinition}
              onUpdateDefinition={onUpdateDefinition}
            />
          ) : (
            <DefinitionDetail
              definition={activeDefinition}
              workspaceReady={workspaceReady}
              busy={busy}
              onCreateDraft={onCreateDraft}
              onPublishDefinition={onPublishDefinition}
              onUpdateDefinition={onUpdateDefinition}
            />
          )}
        </main>
      </div>
    </section>
  );
}
