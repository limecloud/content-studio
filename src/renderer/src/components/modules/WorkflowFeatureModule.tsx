import { useEffect, useMemo, useState } from 'react';
import type { WorkflowDefinition, WorkflowRunRecord, WorkflowRunStatus } from '../../../../shared/types';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
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
  activeDefinitionId: string;
  activeRunId: string;
  onSelectDefinition: (definitionId: string) => void;
  onSelectRun: (runId: string) => void;
  onCreateDraft: () => void;
  onPublishDefinition: (definitionId?: string) => void;
  onUpdateDefinition: (definition: WorkflowDefinition) => void;
  onStartRun: (definitionId?: string, inputs?: Record<string, string>) => void;
  onRunAction: (action: WorkflowRunAction, runId: string) => void;
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
  blocked: '阻塞',
  cancelled: '取消',
};

export function isWorkflowFeatureModule(module: string): module is WorkflowFeatureModuleKey {
  return WORKFLOW_FEATURE_MODULES.has(module);
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

function formatJson(value: unknown): string {
  if (value === undefined) return '无';
  if (value === null) return '无';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function statusClass(status: WorkflowRunStatus | WorkflowDefinition['status']): StatusPillTone {
  if (status === 'published' || status === 'succeeded') return 'ready';
  if (status === 'blocked' || status === 'failed') return 'blocked';
  return 'idle';
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
        : '生成视频 Prompt 阶段阻塞或待处理，进入工作台补输入、确认 Prompt 或配置文字模型。',
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
        ? '把本次 SOP 的图片 Prompt 带入图片生成工作台，继续执行真实图片 provider。'
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
  const brandKnowledgeBaseId = stepOutputValue(run, ['brandKnowledgeBaseId']);
  const ipKnowledgeBaseId = stepOutputValue(run, ['ipKnowledgeBaseId']);
  const promptPackId = stepOutputValue(run, ['promptPackId']);
  const sceneCardIds = stepOutputValues(run, ['sceneCardIds']);
  const promptDraftId = stepOutputValue(run, ['promptDraftId', 'expectedPromptDraftId', 'relatedPromptDraftId']);
  const assetReviewIds = stepOutputValues(run, ['assetReviewIds', 'assetReviewId']);

  if (brandKnowledgeBaseId) {
    actions.push({
      action: 'open-brand-knowledge',
      title: '打开品牌知识库',
      description: '查看本次 SOP 抽取出的品牌口吻、卖点、场景种子和合规边界。',
    });
  }
  if (ipKnowledgeBaseId) {
    actions.push({
      action: 'open-ip-knowledge',
      title: '打开 IP 知识库',
      description: '查看本次 SOP 抽取出的身份、价值观、语言、方法和场景延伸。',
    });
  }
  if (promptPackId || sceneCardIds.length > 0) {
    actions.push({
      action: 'open-scene-library',
      title: '打开场景库',
      description: `${sceneCardIds.length || 0} 张场景卡，可继续生成图片、视频或文案 Prompt。`,
    });
  }
  if (promptDraftId) {
    actions.push({
      action: 'open-prompt-draft',
      title: '打开 Prompt 草稿',
      description: '进入 Prompt 工作台继续审核、改写、复制或物化为 SOP。',
    });
  }
  if (assetReviewIds.length > 0) {
    actions.push({
      action: 'open-asset-review',
      title: '打开素材审核',
      description: `${assetReviewIds.length} 条素材审核记录，可确认通过、驳回或回炉。`,
    });
  }

  return actions;
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
          <p className="eyebrow">WorkflowDefinition</p>
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
              <span>{field.type}{field.required ? ' / 必填' : ''}</span>
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
}: {
  definition?: WorkflowDefinition;
  workspaceReady: boolean;
  busy: boolean;
  onCreateDraft: () => void;
  onPublishDefinition: (definitionId?: string) => void;
}) {
  if (!definition) {
    return (
      <section className="panel workflow-canvas-panel">
        <div className="empty-state">当前工作区还没有可查看的工作流定义。</div>
      </section>
    );
  }

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
      <div className="workflow-canvas-map">
        {definition.steps.map((step, index) => (
          <article key={step.id} className={`workflow-canvas-node ${step.blockedReason ? 'blocked' : ''}`}>
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
      <div className="inline-warning">
        Canvas 这里只读同一份 WorkflowDefinition，不另存坐标数据；普通用户仍从 SOP 表单执行，避免画布成为新的事实源。
      </div>
    </section>
  );
}

function SopRunner({
  definition,
  latestRun,
  workspaceReady,
  busy,
  onStartRun,
  onSelectRun,
  onRunAction,
  onOpenHistory,
}: {
  definition?: WorkflowDefinition;
  latestRun?: WorkflowRunRecord;
  workspaceReady: boolean;
  busy: boolean;
  onStartRun: (definitionId?: string, inputs?: Record<string, string>) => void;
  onSelectRun: (runId: string) => void;
  onRunAction: (action: WorkflowRunAction, runId: string) => void;
  onOpenHistory: () => void;
}) {
  const [inputs, setInputs] = useState<Record<string, string>>({});

  useEffect(() => {
    setInputs(Object.fromEntries((definition?.inputSchema ?? []).map((field) => [field.key, ''])));
  }, [definition?.id]);

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

  return (
    <section className="panel workflow-runner-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">表单化执行</p>
          <h3>{definition.title}</h3>
        </div>
        <button
          className="primary small"
          disabled={!canRun}
          onClick={() => onStartRun(definition.id, inputs)}
        >
          运行 SOP
        </button>
      </div>
      <div className="workflow-form-grid">
        {definition.inputSchema.map((field) => (
          <label key={field.key}>
            <span>{field.label}{field.required ? ' *' : ''}</span>
            {field.type === 'textarea' ? (
              <textarea
                value={inputs[field.key] ?? ''}
                onChange={(event) => setInputs((current) => ({ ...current, [field.key]: event.target.value }))}
                placeholder={field.help}
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
                placeholder={field.help}
              />
            )}
          </label>
        ))}
      </div>
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
  selectedStepId,
  onSelectStepId,
  workspaceReady,
  busy,
  onRunAction,
}: {
  run?: WorkflowRunRecord;
  selectedStepId: string;
  onSelectStepId: (stepId: string) => void;
  workspaceReady: boolean;
  busy: boolean;
  onRunAction: (action: WorkflowRunAction, runId: string) => void;
}) {
  const selectedStep =
    run?.steps.find((step) => step.stepId === selectedStepId) ??
    run?.steps[0];
  const nextAction = run ? nextWorkflowRunAction(run) : null;
  const artifactActions = run ? workflowRunArtifactActions(run) : [];

  if (!run) {
    return (
      <section className="panel workflow-run-detail-panel">
        <div className="empty-state">先选择一条 SOP 运行记录，右侧会显示输入、步骤输入输出和 artifact 引用。</div>
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
            <span>这些入口来自步骤输出的真实 ID，不新增一级导航。</span>
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

      <div className="workflow-meta-grid compact">
        <span><strong>创建时间</strong><em>{formatTime(run.createdAt)}</em></span>
        <span><strong>更新状态</strong><em>{formatTime(run.updatedAt)}</em></span>
        <span><strong>步骤数</strong><em>{run.steps.length} 步</em></span>
        <span><strong>产物引用</strong><em>{run.artifactRefs.length} 条</em></span>
        <span><strong>知识引用</strong><em>{run.citations?.length ?? 0} 条</em></span>
      </div>

      <div className="workflow-two-column">
        <article>
          <h4>输入</h4>
          {Object.entries(run.inputs).map(([key, value]) => (
            <div key={key} className="workflow-list-row">
              <strong>{key}</strong>
              <span>{value || '未填写'}</span>
            </div>
          ))}
        </article>
        <article>
          <h4>Artifact 引用</h4>
          <div className="workflow-run-steps">
            {run.artifactRefs.length > 0 ? run.artifactRefs.map((ref) => (
              <span key={ref}>{ref}</span>
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
                <span><strong>步骤 ID</strong><em>{selectedStep.stepId}</em></span>
              </div>
              <div className="workflow-two-column">
                <article>
                  <h4>步骤输入</h4>
                  <pre className="workflow-run-json">{formatJson(selectedStep.input)}</pre>
                </article>
                <article>
                  <h4>步骤输出</h4>
                  <pre className="workflow-run-json">{formatJson(selectedStep.output)}</pre>
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
  onSelectRun,
  workspaceReady,
  busy,
  onRunAction,
}: {
  runs: WorkflowRunRecord[];
  selectedRun?: WorkflowRunRecord;
  onSelectRun: (runId: string) => void;
  workspaceReady: boolean;
  busy: boolean;
  onRunAction: (action: WorkflowRunAction, runId: string) => void;
}) {
  const [selectedStepId, setSelectedStepId] = useState(selectedRun?.steps[0]?.stepId ?? '');

  useEffect(() => {
    setSelectedStepId(selectedRun?.steps[0]?.stepId ?? '');
  }, [selectedRun?.id]);

  return (
    <section className="panel workflow-history-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">WorkflowRun</p>
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
            <div className="empty-state">还没有 SOP 运行记录。运行 SOP 会先保存输入、步骤和 blocked 恢复路径。</div>
          ) : null}
        </aside>
        <RunDetail
          run={selectedRun}
          selectedStepId={selectedStepId}
          onSelectStepId={setSelectedStepId}
          workspaceReady={workspaceReady}
          busy={busy}
          onRunAction={onRunAction}
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
  activeDefinitionId,
  activeRunId,
  onSelectDefinition,
  onCreateDraft,
  onPublishDefinition,
  onUpdateDefinition,
  onStartRun,
  onSelectRun,
  onRunAction,
}: WorkflowFeatureModuleProps) {
  const [activeView, setActiveView] = useState<WorkflowView>(() => viewFromModule(module));

  useEffect(() => {
    setActiveView(viewFromModule(module));
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
  const viewTabs: Array<{ key: WorkflowView; label: string; hint: string }> = [
    { key: 'run', label: '执行表单', hint: `${publishedDefinitions.length} 个可运行` },
    { key: 'history', label: '运行记录', hint: `${runs.length} 条` },
    { key: 'definition', label: '定义管理', hint: `${definitions.length} 个版本` },
    { key: 'canvas', label: 'Canvas', hint: '高级视图' },
  ];

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
              workspaceReady={workspaceReady}
              busy={busy}
              onStartRun={onStartRun}
              onSelectRun={onSelectRun}
              onRunAction={onRunAction}
              onOpenHistory={() => setActiveView('history')}
            />
          ) : activeView === 'history' ? (
            <RunHistory
              runs={runs}
              selectedRun={activeRun}
              onSelectRun={onSelectRun}
              workspaceReady={workspaceReady}
              busy={busy}
              onRunAction={onRunAction}
            />
          ) : activeView === 'canvas' ? (
            <CanvasDefinitionView
              definition={activeDefinition}
              workspaceReady={workspaceReady}
              busy={busy}
              onCreateDraft={onCreateDraft}
              onPublishDefinition={onPublishDefinition}
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
