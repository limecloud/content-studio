import { useEffect, useMemo, useState } from 'react';
import type {
  AgentPromptSession,
  BrandKnowledgeBaseRecord,
  ContentKnowledgeMapBuildRunRecord,
  ContentKnowledgeMapEvidence,
  ContentKnowledgeMapMatrixRow,
  ContentKnowledgeMapRecord,
  ContentKnowledgePackFilePreview,
  ContentKnowledgeRelease,
  ContentKnowledgePackExportResult,
  ContentMaterialCoverageResult,
  ContentProductionHandoffTarget,
  ContentSyncConflict,
  ContentSyncConflictResolutionAction,
  ContentWorkspaceSyncResult,
  InputSourceRecord,
  InputSourceSensitivity,
  PromptDraft,
  PromptDraftPurpose,
  SceneCard,
} from '../../../../shared/types';
import {
  planContentMatrixRows,
  summarizeContentMatrixRows,
  type ContentMatrixFilterState,
  type ContentMatrixMaterialFilter,
  type ContentMatrixPlan,
  type ContentMatrixSortKey,
  type ContentMatrixStatusFilter,
} from '../../../../shared/contentMatrixPlanning';
import { V2_FEATURES } from '../../app/v2FeatureRegistry';
import type { ModuleKey } from '../../app/types';
import { clip } from '../../app/formatters';
import { buildContentSyncConflictMergeDraft } from '../../../../shared/contentSyncConflictMerge';
import { AgentSessionPanel, type AgentActionResolver, type AgentExecutionStep } from '../agent/AgentSessionPanel';
import { ModuleCommandCenter } from '../ModuleCommandCenter';
import { ActionGroup, SelectableRecordCard, StatusPill } from '../WorkbenchPrimitives';

type DetailTab = 'selling' | 'pain' | 'scenario' | 'ip' | 'competitor' | 'build' | 'evidence' | 'gaps' | 'team' | 'materials' | 'export';

interface ContentKnowledgeMapModuleProps {
  workspaceReady: boolean;
  busy: boolean;
  inputSources: InputSourceRecord[];
  brandKnowledgeBases: BrandKnowledgeBaseRecord[];
  sceneCards: SceneCard[];
  promptDrafts: PromptDraft[];
  contentKnowledgeMaps: ContentKnowledgeMapRecord[];
  contentKnowledgeMapBuildRuns: ContentKnowledgeMapBuildRunRecord[];
  teamChangePackages: Array<{ id: string }>;
  teamKnowledgePackageVersions: ContentKnowledgeRelease[];
  teamSyncConflicts: ContentSyncConflict[];
  contentWorkspaceSyncResult: ContentWorkspaceSyncResult | null;
  activeContentKnowledgeMap?: ContentKnowledgeMapRecord;
  activeContentKnowledgeMapId: string;
  setActiveContentKnowledgeMapId: (recordId: string) => void;
  onBuildContentKnowledgeMap: () => void;
  onExportContentKnowledgePack: () => void;
  onWriteBackContentMaterialCoverage: () => void;
  onCreateTeamChangePackage: () => void;
  onSubmitTeamChangePackage: () => void;
  onExportTeamChangePackage: () => void;
  onImportTeamChangePackage: () => void;
  onResolveTeamSyncConflict: (conflict: ContentSyncConflict, resolutionAction: ContentSyncConflictResolutionAction) => void;
  onCreateTeamKnowledgePackage: () => void;
  onCreateTeamKnowledgePromptDraft: () => void;
  onRefreshTeamKnowledgeUpdates: () => void;
  onGenerateContentReviewTasksForRows: (rowIds: string[]) => void;
  onGenerateContentMaterialTasksForRows: (rowIds: string[]) => void;
  onCreateContentProductionHandoffForRow: (rowId: string, target: ContentProductionHandoffTarget) => void;
  contentKnowledgePackExport: ContentKnowledgePackExportResult | null;
  contentKnowledgePackFilePreview: ContentKnowledgePackFilePreview | null;
  onReadContentKnowledgePackFile: (input: { packageDir?: string; relativePath: string }) => void;
  contentMaterialCoverage: ContentMaterialCoverageResult | null;
  agentPromptSessions: AgentPromptSession[];
  activeAgentPromptSessionId: string;
  textModel?: string;
  onSelectAgentSession: (sessionId: string) => void;
  onResolveAgentAction?: AgentActionResolver;
  onStartAgentSession: (input: {
    title?: string;
    purpose: PromptDraftPurpose;
    userIntent: string;
    inputSourceIds: string[];
    sceneCardIds?: string[];
    textModel?: string;
  }) => void;
  onContinueAgentSession: (input: { sessionId: string; message: string; textModel?: string }) => void;
  onSelectModule: (module: ModuleKey) => void;
}

const MAP_STATUS_LABELS: Record<ContentKnowledgeMapRecord['status'], string> = {
  draft: '草稿',
  ready: '可用',
  'needs-review': '待补齐',
  blocked: '待处理',
  published: '已发布',
};

const SYNC_STATUS_LABELS: Record<ContentKnowledgeMapRecord['syncStatus'], string> = {
  'local-only': '本机草稿',
  'pending-sync': '待同步',
  synced: '已同步',
  conflict: '有冲突',
  blocked: '同步待处理',
};

const BUILD_RUN_STATUS_LABELS: Record<ContentKnowledgeMapBuildRunRecord['status'], string> = {
  completed: '已生成',
  blocked: '待处理',
  failed: '生成失败',
};

const TAB_LABELS: Array<{ key: DetailTab; label: string }> = [
  { key: 'selling', label: '卖点矩阵' },
  { key: 'pain', label: '痛点矩阵' },
  { key: 'scenario', label: '场景矩阵' },
  { key: 'ip', label: 'IP 口径' },
  { key: 'competitor', label: '竞品观察' },
  { key: 'build', label: '生成流程' },
  { key: 'evidence', label: '证据' },
  { key: 'gaps', label: '缺口' },
  { key: 'team', label: '团队知识包' },
  { key: 'materials', label: '素材回写' },
  { key: 'export', label: '高级导出' },
];

const MATRIX_STATUS_OPTIONS: Array<{ value: ContentMatrixStatusFilter; label: string }> = [
  { value: 'all', label: '全部状态' },
  { value: 'ready', label: '可用' },
  { value: 'needs-review', label: '待审核' },
  { value: 'needs-evidence', label: '缺证据' },
];

const MATRIX_MATERIAL_OPTIONS: Array<{ value: ContentMatrixMaterialFilter; label: string }> = [
  { value: 'all', label: '全部素材' },
  { value: 'missing', label: '缺素材' },
  { value: 'covered', label: '有素材' },
  { value: 'approved', label: '素材可用' },
  { value: 'rejected', label: '素材驳回' },
];

const MATRIX_SORT_OPTIONS: Array<{ value: ContentMatrixSortKey; label: string }> = [
  { value: 'priority', label: '优先处理' },
  { value: 'confidence-desc', label: '可信度高' },
  { value: 'evidence-desc', label: '证据多' },
  { value: 'material-gap', label: '先看缺素材' },
];

const AGENT_SESSION_STATUS_LABELS: Record<AgentPromptSession['status'], string> = {
  active: '会话中',
  'waiting-user': '等你补充',
  'draft-created': '已输出',
  blocked: '待配置',
  closed: '已关闭',
};

const AGENT_MESSAGE_KIND_LABELS: Record<AgentPromptSession['messages'][number]['kind'], string> = {
  intent: '任务',
  draft: '输出',
  adjustment: '追问',
  note: '记录',
};

const SOURCE_SHARING_LABELS: Record<InputSourceSensitivity, string> = {
  public: '公开资料',
  internal: '团队内部',
  confidential: '负责人确认',
  restricted: '仅本机',
};

function mapStatusTone(status?: ContentKnowledgeMapRecord['status']) {
  if (status === 'ready' || status === 'published') return 'ready';
  if (status === 'blocked' || status === 'needs-review') return 'blocked';
  return 'idle';
}

function buildRunStatusTone(status?: ContentKnowledgeMapBuildRunRecord['status']) {
  if (status === 'completed') return 'ready';
  if (status === 'blocked' || status === 'failed') return 'blocked';
  return 'idle';
}

function buildRunStepClass(status: ContentKnowledgeMapBuildRunRecord['steps'][number]['status']): string {
  if (status === 'completed') return 'ready';
  if (status === 'blocked' || status === 'failed') return 'blocked';
  return '';
}

function syncStatusTone(status?: ContentKnowledgeMapRecord['syncStatus']) {
  if (status === 'synced') return 'ready';
  if (status === 'blocked' || status === 'conflict') return 'blocked';
  return 'idle';
}

function agentSessionTone(status?: AgentPromptSession['status']) {
  if (status === 'blocked' || status === 'closed') return 'blocked';
  if (status === 'draft-created' || status === 'active') return 'ready';
  return 'idle';
}

function agentMessageTitle(message: AgentPromptSession['messages'][number]): string {
  if (message.role === 'user') return message.kind === 'adjustment' ? '你的补充' : '你的任务';
  if (message.role === 'assistant') return '地图建议';
  return '系统记录';
}

function compactAgentMessage(message: AgentPromptSession['messages'][number]): string {
  const content = message.content.trim();
  const userIntent = content.match(/用户意图：\n([\s\S]*?)(\n\n输入源快照：|\n\n本轮 skills：|$)/)?.[1]?.trim();
  if (message.role === 'user' && userIntent) return userIntent.split('\n').filter(Boolean).slice(0, 6).join('\n');
  const promptDraft = content.match(/Prompt 草稿：\n([\s\S]*?)(\n\n需要追问|\n\n仍需追问|\n\n来源与合规提醒|\n\n下游检查清单|\n\n本轮调整：|$)/)?.[1]?.trim();
  if (message.role === 'assistant' && promptDraft) return promptDraft.split('\n').filter(Boolean).slice(0, 8).join('\n');
  return content.split('\n').filter(Boolean).slice(0, 8).join('\n');
}

function rowStatusLabel(status: ContentKnowledgeMapMatrixRow['status']): string {
  if (status === 'ready') return '可用';
  if (status === 'needs-review') return '待审核';
  return '缺证据';
}

function evidenceStatusLabel(status: ContentKnowledgeMapEvidence['status']): string {
  if (status === 'ready') return '可引用';
  if (status === 'missing') return '缺证据';
  return '待确认';
}

function materialStatusLabel(status?: ContentKnowledgeMapMatrixRow['materialStatus']): string {
  if (status === 'approved') return '素材可用';
  if (status === 'covered') return '有素材';
  if (status === 'rejected') return '素材驳回';
  return '缺素材';
}

function matrixDimensionOptions(rows: ContentKnowledgeMapMatrixRow[], key: 'audiences' | 'channels' | 'contentFormats'): string[] {
  return Array.from(new Set(rows.flatMap((row) => row.dimensions?.[key] ?? []))).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function rowDimensionText(
  row: ContentKnowledgeMapMatrixRow,
  key: 'audiences' | 'channels' | 'contentFormats' | 'useCases',
  fallback: string,
): string {
  const values = row.dimensions?.[key] ?? [];
  return values.length ? values.join(' / ') : fallback;
}

function teamSyncMessage(map?: ContentKnowledgeMapRecord): string {
  if (!map) return '生成内容知识地图后，才能创建变更包并发布团队知识包版本。';
  if (map.syncStatus === 'synced') {
    const revision = map.teamSync.revision ? `，团队版本 ${map.teamSync.revision}` : '';
    return `已同步到 Bugu 团队工作区${revision}，可以创建团队知识包版本。`;
  }
  if (map.syncStatus === 'conflict') return '团队工作区已有更新，需要先处理冲突，再发布团队知识包版本。';
  if (map.syncStatus === 'pending-sync') return '变更包待提交，提交后团队成员可基于同一版本继续生产。';
  if (map.syncStatus === 'blocked') return map.teamSync.message || '团队同步未完成，当前内容已保存在本机。';
  return '当前仍是本机草稿，先生成变更包并提交到团队工作区。';
}

function sourceSharingLabel(value?: InputSourceSensitivity): string {
  return value ? SOURCE_SHARING_LABELS[value] : '团队内部';
}

function sourceSharingTone(value?: InputSourceSensitivity) {
  if (value === 'restricted') return 'blocked';
  if (value === 'public' || value === 'internal') return 'ready';
  return 'idle';
}

function restrictedSourceMessage(map?: ContentKnowledgeMapRecord): string | null {
  const summary = map?.sourceSensitivity;
  const hasRestrictedSummary = Boolean(summary?.counts.restricted);
  const teamMessage = map?.teamSync.message ?? '';
  const hasRestrictedMessage = /仅本机|共享范围|禁止共享/.test(teamMessage);
  if (!hasRestrictedSummary && !hasRestrictedMessage) return null;

  const titles = summary?.restrictedSourceTitles ?? [];
  const sourceNames = titles.length
    ? `${titles.slice(0, 3).join('、')}${titles.length > 3 ? ` 等 ${titles.length} 个资料` : ''}`
    : '当前内容地图里的部分资料';
  return `包含仅本机资料：${sourceNames}。处理共享范围后才能同步或发布团队知识包。`;
}

function exportResultMessage(result: ContentKnowledgePackExportResult): string {
  if (result.status === 'exported') {
    return `本机预览已生成，包含 ${result.files.length} 个文件。发布团队知识包版本后，团队成员可在下游任务中选择使用。`;
  }
  return result.issues.join(' / ') || '发布检查未通过，暂不能生成知识包预览。';
}

function syncResultTitle(result: ContentWorkspaceSyncResult): string {
  if (result.status === 'created') return '变更包已生成';
  if (result.status === 'submitted') return '已提交团队工作区';
  if (result.status === 'released') return '团队知识包已发布';
  if (result.status === 'exported') return '离线变更包已导出';
  if (result.status === 'imported') return '离线变更包已导入';
  if (result.conflict?.status === 'resolved') return '冲突处理已记录';
  if (result.status === 'conflict') return '团队版本有冲突';
  return '团队共享未完成';
}

function syncResultMessage(result: ContentWorkspaceSyncResult): string {
  if (result.status === 'created') {
    return result.draftChange?.summary || '变更包已保存，下一步提交到团队工作区。';
  }
  if (result.status === 'submitted') {
    const revision = result.teamSync?.revision ? `团队版本 ${result.teamSync.revision}` : '团队版本已更新';
    return `${revision}，可以创建团队知识包版本。`;
  }
  if (result.status === 'released') {
    const version = result.release?.version ? `${result.release.version} ` : '';
    const revision = result.teamSync?.revision ? `，团队版本 ${result.teamSync.revision}` : '';
    const packageState = result.release?.packagePublicUrl ? '，团队知识包可下载' : result.release?.packageObjectKey ? '，发布包已登记' : '';
    return `${version}已成为团队可用版本${revision}${packageState}。`;
  }
  if (result.status === 'exported') {
    return result.packageDir ? `已保存到 ${result.packageDir}，可用于离线交付或审计归档。` : '变更包已导出，可用于离线交付或审计归档。';
  }
  if (result.status === 'imported') {
    return result.draftChange?.title ? `${result.draftChange.title} 已进入本机变更包，下一步提交团队工作区。` : '变更包已导入，下一步提交团队工作区。';
  }
  if (result.conflict?.status === 'resolved') {
    return result.issues[0] || '冲突处理已记录，请重新生成变更包并提交团队工作区。';
  }
  return result.teamSync?.message || result.issues.join(' / ') || '请检查团队工作区连接、冲突或发布检查结果。';
}

function conflictSourceLabel(sourceType: ContentSyncConflict['sourceType']): string {
  if (sourceType === 'draft-change') return '变更包';
  if (sourceType === 'review-task') return '审核任务';
  if (sourceType === 'review-decision') return '审核结论';
  if (sourceType === 'knowledge-release') return '团队知识包';
  return '团队同步';
}

function conflictObjectTypeLabel(objectType?: NonNullable<ContentSyncConflict['affectedObjects']>[number]['objectType']): string {
  if (objectType === 'content-map') return '内容地图';
  if (objectType === 'selling-point') return '卖点';
  if (objectType === 'pain-point') return '痛点';
  if (objectType === 'scenario') return '场景';
  if (objectType === 'evidence') return '证据';
  if (objectType === 'constraint') return '规则';
  if (objectType === 'gap') return '资料缺口';
  if (objectType === 'release') return '团队版本';
  if (objectType === 'review-task') return '审核项';
  if (objectType === 'action') return '行动记录';
  return '影响内容';
}

function conflictImpactLabel(impact?: NonNullable<ContentSyncConflict['affectedObjects']>[number]['impact']): string {
  if (impact === 'high') return '高影响';
  if (impact === 'low') return '低影响';
  return '中影响';
}

function conflictAffectedObjects(conflict: ContentSyncConflict): NonNullable<ContentSyncConflict['affectedObjects']> {
  if (conflict.affectedObjects?.length) return conflict.affectedObjects.slice(0, 4);
  return conflict.affectedObjectIds.slice(0, 4).map((objectId) => ({
    id: objectId,
    objectId,
    objectType: 'unknown',
    title: objectId,
    summary: '本机提交影响该内容项，团队当前版本已更新。',
    impact: 'medium',
    recommendation: '重新同步团队当前版本后，再由内容负责人判断是否保留本机修改。',
  }));
}

function releaseDeliveryLabel(release?: ContentKnowledgeRelease): string {
  if (!release) return '等待发布团队知识包';
  if (release.packagePublicUrl) return '团队知识包可下载';
  if (release.packageObjectKey) return '团队知识包已登记';
  if (release.packageArchivePath) return '本机预览已生成';
  return '等待发布团队知识包';
}

interface MatrixRowsViewInput {
  plan: ContentMatrixPlan;
  evidenceById: Map<string, ContentKnowledgeMapEvidence>;
  selectedRowIds: string[];
  focusedRowId?: string;
  onToggleRow: (rowId: string) => void;
  onFocusRow: (rowId: string) => void;
  onTogglePageRows: () => void;
}

function evidenceTypeLabel(sourceType: ContentKnowledgeMapEvidence['sourceType']): string {
  if (sourceType === 'input-source') return '输入资料';
  if (sourceType === 'user-quote') return '用户原声';
  if (sourceType === 'customer-service-log') return '客服记录';
  if (sourceType === 'brand-knowledge-base') return '品牌资料';
  if (sourceType === 'ip-knowledge-base') return 'IP 资料';
  if (sourceType === 'scene-card') return '场景卡';
  if (sourceType === 'prompt-draft') return '提示词草稿';
  if (sourceType === 'asset-review') return '素材审核';
  if (sourceType === 'generated-inference') return '推理结果';
  if (sourceType === 'manual') return '人工补充';
  return '证据';
}

function evidencePreview(row: ContentKnowledgeMapMatrixRow, evidenceById: Map<string, ContentKnowledgeMapEvidence>): string {
  const items = row.evidenceRefs.map((id) => evidenceById.get(id)).filter((item): item is ContentKnowledgeMapEvidence => Boolean(item));
  const preferred = items.find((item) => item.sourceType === 'user-quote' || item.sourceType === 'customer-service-log') ?? items[0];
  if (!preferred) return '等待补证据';
  return `${evidenceTypeLabel(preferred.sourceType)}：${clip(preferred.excerpt || preferred.claim, 72)}`;
}

function allMatrixRows(map?: ContentKnowledgeMapRecord): ContentKnowledgeMapMatrixRow[] {
  if (!map) return [];
  return [...map.sellingPoints, ...map.painPoints, ...map.scenarios];
}

function rowMatchesIp(row: ContentKnowledgeMapMatrixRow, evidenceById: Map<string, ContentKnowledgeMapEvidence>): boolean {
  const text = `${row.title} ${row.summary} ${row.tags.join(' ')} ${row.sourceRefs.join(' ')}`;
  if (/IP|口播|语言规则|核心立场|表达边界/.test(text)) return true;
  return row.evidenceRefs.some((id) => evidenceById.get(id)?.sourceType === 'ip-knowledge-base');
}

function rowMatchesCompetitor(row: ContentKnowledgeMapMatrixRow): boolean {
  const text = `${row.title} ${row.summary} ${row.tags.join(' ')}`;
  return /竞品|竞对|对标|差异化机会|不可搬运|异议模式/.test(text);
}

function rowRecoveryMessage(row: ContentKnowledgeMapMatrixRow): string {
  if (row.status === 'ready' && row.materialStatus !== 'missing') return '已具备交接条件，可以先生成 Prompt 草稿，发布前仍会经过证据、品牌和平台边界检查。';
  if (row.status === 'needs-evidence') return '先补产品报告、用户原声、客服记录或人工说明；补齐前不能写成确定性主张。';
  if (row.materialStatus === 'missing') return '先创建补素材任务，补齐可用图片、视频或案例后再进入生产交接。';
  if (row.tags.some((tag) => /竞品|不可搬运/.test(tag))) return '先转写为本品牌已审核机会，不能直接复制竞品表达或视觉元素。';
  return '送审后由品牌负责人确认命名、证据和表达边界，再交给 Prompt 或场景库。';
}

function rowDeliveryMessage(row: ContentKnowledgeMapMatrixRow): string {
  if (row.status !== 'ready') return '当前只能生成审核任务或补资料任务，不能直接交给生产。';
  if (row.materialStatus === 'missing') return '可先生成图文 Prompt；视频和混剪方向需要补素材后再交接。';
  return '通过审核后可生成 Prompt 草稿、场景库和素材审核。';
}

function renderMatrixRows({
  plan,
  evidenceById,
  selectedRowIds,
  focusedRowId,
  onToggleRow,
  onFocusRow,
  onTogglePageRows,
}: MatrixRowsViewInput) {
  if (!plan.filteredRows.length) return <div className="empty-state">当前筛选下没有可展示的条目，请调整状态、素材或关键词。</div>;
  const pageRowIds = new Set(plan.pageRows.map((row) => row.id));
  const allPageRowsSelected = plan.pageRows.length > 0 && plan.pageRows.every((row) => selectedRowIds.includes(row.id));
  return (
    <>
      <div className="content-map-table">
        <table>
          <thead>
            <tr>
              <th className="content-map-row-select">
                <input
                  aria-label="选择本页条目"
                  checked={allPageRowsSelected}
                  type="checkbox"
                  onChange={onTogglePageRows}
                />
              </th>
              <th>条目</th>
              <th>说明</th>
              <th>人群 / 渠道</th>
              <th>标签</th>
              <th>证据</th>
              <th>素材</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {plan.pageRows.map((row) => (
              <tr
                key={row.id}
                className={`${selectedRowIds.includes(row.id) ? 'selected' : pageRowIds.has(row.id) ? '' : ''} ${focusedRowId === row.id ? 'focused' : ''}`.trim() || undefined}
                onClick={() => onFocusRow(row.id)}
              >
                <td className="content-map-row-select">
                  <input
                    aria-label={`选择${row.title}`}
                    checked={selectedRowIds.includes(row.id)}
                    type="checkbox"
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => onToggleRow(row.id)}
                  />
                </td>
                <td>
                  <strong>{row.title}</strong>
                  <small>{row.confidence}% 可信 · {row.sourceRefs.length} 个来源</small>
                </td>
                <td>{row.summary}</td>
                <td>
                  <strong>{rowDimensionText(row, 'audiences', '待细分人群')}</strong>
                  <small>{rowDimensionText(row, 'channels', '待定渠道')}</small>
                  <small>{rowDimensionText(row, 'contentFormats', '待定形式')}</small>
                </td>
                <td>
                  <span>{row.tags.join(' / ') || '未标注'}</span>
                  {row.performanceTags?.length ? <small>{row.performanceTags.join(' / ')}</small> : null}
                </td>
                <td>
                  <strong>{row.evidenceRefs.length} 条</strong>
                  <small>{evidencePreview(row, evidenceById)}</small>
                </td>
                <td>
                  <StatusPill tone={row.materialStatus === 'approved' || row.materialStatus === 'covered' ? 'ready' : 'idle'}>
                    {materialStatusLabel(row.materialStatus)}
                  </StatusPill>
                  {row.materialRefs?.length ? <small>{row.materialRefs.length} 个素材</small> : null}
                </td>
                <td><StatusPill tone={row.status === 'ready' ? 'ready' : 'blocked'}>{rowStatusLabel(row.status)}</StatusPill></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!plan.pageRows.length ? <div className="empty-state">当前页没有条目，请返回上一页或调整筛选。</div> : null}
    </>
  );
}

function renderEvidence(items: ContentKnowledgeMapEvidence[]) {
  if (!items.length) return <div className="empty-state">暂无证据。先导入可读输入源或抽取品牌 / 产品知识库。</div>;
  return (
    <div className="content-map-evidence-list">
      {items.map((item) => (
        <article key={item.id}>
          <div>
            <strong>{item.claim}</strong>
            <StatusPill tone={item.status === 'ready' ? 'ready' : 'blocked'}>{evidenceStatusLabel(item.status)}</StatusPill>
          </div>
          <p>{item.excerpt}</p>
          <small>{item.sourceTitle}</small>
        </article>
      ))}
    </div>
  );
}

function renderMatrixRowDetail(
  row: ContentKnowledgeMapMatrixRow | undefined,
  evidenceById: Map<string, ContentKnowledgeMapEvidence>,
  onGenerateReviewTask: (rowId: string) => void,
  onGenerateMaterialTask: (rowId: string) => void,
  onCreateHandoff: (rowId: string, target: ContentProductionHandoffTarget) => void,
  onSelectModule: (module: ModuleKey) => void,
  busy: boolean,
  workspaceReady: boolean,
) {
  if (!row) {
    return (
      <div className="content-map-row-detail empty">
        <strong>选择一个矩阵组合</strong>
        <span>点击卖点、痛点、场景、IP 或竞品行后，这里会显示证据、风险、恢复路径和交付去向。</span>
      </div>
    );
  }
  const evidenceItems = row.evidenceRefs
    .map((id) => evidenceById.get(id))
    .filter((item): item is ContentKnowledgeMapEvidence => Boolean(item));
  const rowReady = row.status === 'ready';
  const primaryAction = rowReady
    ? {
        label: '生成 Prompt 草稿',
        onClick: () => onCreateHandoff(row.id, 'prompt-draft' as const),
      }
    : {
        label: row.status === 'needs-evidence' ? '创建补证据任务' : '生成审核任务',
        onClick: () => onGenerateReviewTask(row.id),
      };
  const productionActionDisabled = !workspaceReady || busy || !rowReady;
  return (
    <div className="content-map-row-detail">
      <div className="content-map-row-detail-head">
        <div>
          <span className="eyebrow">当前组合</span>
          <strong>{row.title}</strong>
        </div>
        <StatusPill tone={row.status === 'ready' ? 'ready' : 'blocked'}>{rowStatusLabel(row.status)}</StatusPill>
      </div>
      <p>{row.summary}</p>
      <div className="content-map-row-detail-tags">
        {row.tags.map((tag) => <span key={tag}>{tag}</span>)}
        {row.performanceTags?.map((tag) => <span key={tag} className="ready">{tag}</span>)}
      </div>
      <dl className="content-map-row-detail-facts">
        <div><dt>可信度</dt><dd>{row.confidence}%</dd></div>
        <div><dt>来源</dt><dd>{row.sourceRefs.length} 个</dd></div>
        <div><dt>证据</dt><dd>{row.evidenceRefs.length} 条</dd></div>
        <div><dt>素材</dt><dd>{materialStatusLabel(row.materialStatus)}</dd></div>
        <div><dt>人群</dt><dd>{rowDimensionText(row, 'audiences', '待细分')}</dd></div>
        <div><dt>渠道</dt><dd>{rowDimensionText(row, 'channels', '待定')}</dd></div>
        <div><dt>形式</dt><dd>{rowDimensionText(row, 'contentFormats', '待定')}</dd></div>
        <div><dt>场景</dt><dd>{rowDimensionText(row, 'useCases', '待细分')}</dd></div>
      </dl>
      <section>
        <strong>证据摘录</strong>
        {evidenceItems.length ? evidenceItems.slice(0, 4).map((item) => (
          <article key={item.id}>
            <span>{evidenceTypeLabel(item.sourceType)} · {evidenceStatusLabel(item.status)}</span>
            <p>{item.excerpt || item.claim}</p>
            <small>{item.sourceTitle}</small>
          </article>
        )) : <span className="content-map-row-empty">暂无可引用证据，需要先补资料或人工说明。</span>}
      </section>
      <section>
        <strong>恢复路径</strong>
        <p>{rowRecoveryMessage(row)}</p>
      </section>
      <section>
        <strong>交付去向</strong>
        <p>{rowDeliveryMessage(row)}</p>
      </section>
      <div className="content-map-row-detail-actions">
        <button
          className="primary small"
          disabled={!workspaceReady || busy}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </button>
        <button
          className="ghost small"
          disabled={!workspaceReady || busy}
          onClick={() => onGenerateMaterialTask(row.id)}
        >
          创建补素材任务
        </button>
        <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge-review')}>
          去审核任务
        </button>
        {!rowReady ? (
          <button
            className="ghost small"
            disabled
            title="先补证据或完成审核后再交给生产。"
            onClick={() => onCreateHandoff(row.id, 'prompt-draft')}
          >
            生成 Prompt 草稿
          </button>
        ) : null}
        <button
          className="ghost small"
          disabled={productionActionDisabled}
          title={!rowReady ? '先补证据或完成审核后再交给生产。' : undefined}
          onClick={() => onCreateHandoff(row.id, 'scene-card')}
        >
          生成场景卡
        </button>
        <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('agents')}>
          去 agents
        </button>
      </div>
    </div>
  );
}

function renderTeamKnowledgePackageContent(input: {
  map: ContentKnowledgeMapRecord;
  release?: ContentKnowledgeRelease;
  readyForPrompt: boolean;
  readyRowCount: number;
  workspaceReady: boolean;
  busy: boolean;
  onCreatePromptDraft: () => void;
  onCreateTeamKnowledgePackage: () => void;
  onRefreshTeamKnowledgeUpdates: () => void;
}) {
  const { map, release } = input;
  const readySelling = map.sellingPoints.filter((row) => row.status === 'ready').slice(0, 5);
  const readyScenarios = map.scenarios.filter((row) => row.status === 'ready').slice(0, 5);
  const painRows = map.painPoints.slice(0, 5);
  const evidenceItems = map.evidence.filter((item) => item.status === 'ready').slice(0, 5);
  const materialRows = allMatrixRows(map).filter((row) => row.materialRefs?.length || row.materialStatus === 'missing').slice(0, 5);
  return (
    <div className="content-map-package-content">
      <div className="content-map-package-head">
        <div>
          <span className="eyebrow">团队复用内容</span>
          <h4>{release ? `${release.title} ${release.version}` : map.title}</h4>
        </div>
        <StatusPill tone={release?.status === 'published' ? 'ready' : 'idle'}>{release ? releaseDeliveryLabel(release) : '等待创建版本'}</StatusPill>
      </div>
      <ActionGroup align="left" className="content-map-package-primary-actions">
        <button
          className="primary small"
          disabled={!input.workspaceReady || input.busy || !input.readyForPrompt || !input.readyRowCount}
          onClick={input.onCreatePromptDraft}
        >
          生成 Prompt 草稿
        </button>
        <button
          className="ghost small"
          disabled={!input.workspaceReady || input.busy}
          onClick={input.onCreateTeamKnowledgePackage}
        >
          创建知识包版本
        </button>
        <button
          className="ghost small"
          disabled={!input.workspaceReady || input.busy}
          onClick={input.onRefreshTeamKnowledgeUpdates}
        >
          拉取团队更新
        </button>
        {!input.readyForPrompt ? (
          <span className="content-map-action-note">先发布团队知识包版本，再生成带版本引用的 Prompt 草稿。</span>
        ) : !input.readyRowCount ? (
          <span className="content-map-action-note">先完成审核或补证据，至少需要 1 个可复用组合。</span>
        ) : null}
      </ActionGroup>
      <div className="content-map-package-grid">
        <section>
          <strong>产品事实 / 证据</strong>
          {evidenceItems.map((item) => <p key={item.id}>{item.claim}：{clip(item.excerpt, 90)}</p>)}
          {!evidenceItems.length ? <p>暂无可引用证据。</p> : null}
        </section>
        <section>
          <strong>卖点与证据</strong>
          {readySelling.map((row) => <p key={row.id}>{row.title}：{clip(row.summary, 90)}</p>)}
          {!readySelling.length ? <p>暂无可发布卖点。</p> : null}
        </section>
        <section>
          <strong>痛点 / FAQ 线索</strong>
          {painRows.map((row) => <p key={row.id}>{row.title}：{clip(evidencePreview(row, new Map(map.evidence.map((item) => [item.id, item]))), 90)}</p>)}
          {!painRows.length ? <p>暂无评论痛点或 FAQ 线索。</p> : null}
        </section>
        <section>
          <strong>场景卡</strong>
          {readyScenarios.map((row) => <p key={row.id}>{row.title}：{clip(row.summary, 90)}</p>)}
          {!readyScenarios.length ? <p>暂无可交接场景。</p> : null}
        </section>
        <section>
          <strong>素材覆盖</strong>
          {materialRows.map((row) => <p key={row.id}>{row.title}：{materialStatusLabel(row.materialStatus)}{row.materialRefs?.length ? `，${row.materialRefs.length} 个素材` : ''}</p>)}
          {!materialRows.length ? <p>暂无素材覆盖记录。</p> : null}
        </section>
        <section>
          <strong>提示词依据</strong>
          <p>下游只注入当前组合、已通过证据短摘录、禁用边界和来源引用，不拼接完整原文。</p>
          <p>{map.constraints.slice(0, 3).join(' / ') || '暂无额外规则。'}</p>
        </section>
      </div>
    </div>
  );
}

function renderMaterialFeedbackContent(input: {
  map: ContentKnowledgeMapRecord;
  result: ContentMaterialCoverageResult | null;
  onWriteBack: () => void;
  onCreateMaterialTasks: (rowIds: string[]) => void;
  onSelectModule: (module: ModuleKey) => void;
  busy: boolean;
  workspaceReady: boolean;
}) {
  const rows = allMatrixRows(input.map);
  const coveredRows = rows
    .filter((row) => row.materialRefs?.length || row.materialStatus === 'approved' || row.materialStatus === 'covered')
    .slice(0, 6);
  const missingRows = rows
    .filter((row) => !row.materialRefs?.length || row.materialStatus === 'missing')
    .slice(0, 6);
  const highPerformanceRows = rows
    .filter((row) => row.performanceTags?.length)
    .slice(0, 6);
  return (
    <div className="content-map-material-panel">
      <div className="content-map-package-head">
        <div>
          <span className="eyebrow">素材覆盖</span>
          <h4>{input.map.title}</h4>
        </div>
        <StatusPill tone={coveredRows.length ? 'ready' : 'idle'}>
          {coveredRows.length ? `${coveredRows.length} 个组合已覆盖` : '等待回写'}
        </StatusPill>
      </div>
      <div className="content-map-material-grid">
        <section>
          <strong>已覆盖组合</strong>
          {coveredRows.length ? coveredRows.map((row) => (
            <p key={row.id}>{row.title}：{materialStatusLabel(row.materialStatus)}{row.materialRefs?.length ? `，${row.materialRefs.length} 个素材` : ''}</p>
          )) : <p>暂无已回写素材。先在素材库通过审核，再回到这里回写覆盖关系。</p>}
        </section>
        <section>
          <strong>待补素材</strong>
          {missingRows.length ? missingRows.map((row) => (
            <p key={row.id}>{row.title}：{row.status === 'ready' ? '可先交接图文 Prompt，视频和混剪需补素材。' : '先补证据或审核，再安排素材。'}</p>
          )) : <p>当前矩阵没有明显素材缺口。</p>}
        </section>
        <section>
          <strong>表现标签</strong>
          {highPerformanceRows.length ? highPerformanceRows.map((row) => (
            <p key={row.id}>{row.title}：{row.performanceTags?.join(' / ')}</p>
          )) : <p>暂无表现标签。表现只用于排序和复盘，不会自动改写产品事实。</p>}
        </section>
        <section>
          <strong>本次回写结果</strong>
          {input.result ? (
            <p>
              {input.result.status === 'updated'
                ? `${input.result.updatedRowCount} 个组合已更新，已审核素材 ${input.result.approvedAssetCount} 个，待确认补充 ${input.result.pendingSupplementTaskCount ?? 0} 条。`
                : input.result.issues.join(' / ')}
            </p>
          ) : (
            <p>点击回写后，会把已通过素材关联到卖点、痛点和场景组合，并生成待确认补充任务。</p>
          )}
        </section>
      </div>
      <ActionGroup align="left" className="content-map-section-actions">
        <button className="primary small" disabled={!input.workspaceReady || input.busy} onClick={input.onWriteBack}>
          回写素材覆盖
        </button>
        <button
          className="ghost small"
          disabled={!input.workspaceReady || input.busy || !missingRows.length}
          onClick={() => input.onCreateMaterialTasks(missingRows.map((row) => row.id))}
        >
          创建补素材任务
        </button>
        <button className="ghost small" disabled={!input.workspaceReady || input.busy} onClick={() => input.onSelectModule('assets')}>
          去素材库
        </button>
        <button className="ghost small" disabled={!input.workspaceReady || input.busy} onClick={() => input.onSelectModule('assets')}>
          看素材追溯
        </button>
      </ActionGroup>
    </div>
  );
}

function orderPackagePreviewFiles(files: string[]): string[] {
  const priority = [
    'KNOWLEDGE.md',
    'compiled/prompt-grounding.md',
    'assets/material-coverage.json',
    'answers/questions.json',
    'manifest.json',
  ];
  const rank = (file: string): number => {
    const exactIndex = priority.indexOf(file);
    if (exactIndex >= 0) return exactIndex;
    if (file.startsWith('ontology/')) return priority.length;
    if (file.startsWith('interop/')) return priority.length + 1;
    if (file.startsWith('assets/')) return priority.length + 2;
    if (file.startsWith('answers/')) return priority.length + 3;
    return priority.length + 4;
  };

  return Array.from(new Set(files)).sort((left, right) => {
    const rankDelta = rank(left) - rank(right);
    return rankDelta || left.localeCompare(right);
  });
}

function renderAdvancedExportContent(input: {
  map: ContentKnowledgeMapRecord;
  release?: ContentKnowledgeRelease;
  exportResult: ContentKnowledgePackExportResult | null;
  filePreview: ContentKnowledgePackFilePreview | null;
  selectedFile: string;
  onExportContentKnowledgePack: () => void;
  onCreateTeamKnowledgePackage: () => void;
  onCreateTeamKnowledgePromptDraft: () => void;
  onReadFile: (input: { packageDir?: string; relativePath: string }) => void;
  onSelectModule: (module: ModuleKey) => void;
  busy: boolean;
  workspaceReady: boolean;
}) {
  const rows = allMatrixRows(input.map);
  const readyRows = rows.filter((row) => row.status === 'ready');
  const releaseReadyForPrompt = input.release?.status === 'published';
  const previewPackageDir = input.exportResult?.packageDir ?? input.release?.packageDir;
  const files = input.exportResult?.files.length
    ? input.exportResult.files
    : input.release?.files.length
      ? input.release.files
      : ['KNOWLEDGE.md', 'ontology/ontology.json', 'ontology/coverage.json', 'answers/questions.json'];
  const previewableFiles = orderPackagePreviewFiles(files.filter((file) => !file.endsWith('.zip')));
  const archiveSizeKb = input.exportResult?.packageArchiveSize
    ? Math.max(1, Math.round(input.exportResult.packageArchiveSize / 1024))
    : null;
  const archiveSha = input.exportResult?.packageArchiveSha256
    ? input.exportResult.packageArchiveSha256.slice(0, 12)
    : '';
  const checks = [
    { label: '知识地图可用', ready: input.map.status === 'ready' || input.map.status === 'published' },
    { label: `${readyRows.length} 个可复用组合`, ready: readyRows.length > 0 },
    { label: `${input.map.evidence.filter((item) => item.status === 'ready').length} 条可引用证据`, ready: input.map.evidence.some((item) => item.status === 'ready') },
    { label: `${input.map.constraints.length} 条规则边界`, ready: input.map.constraints.length > 0 },
    { label: input.release ? releaseDeliveryLabel(input.release) : '等待团队知识包版本', ready: Boolean(input.release) },
  ];
  return (
    <div className="content-map-export-panel">
      <div className="content-map-package-head">
        <div>
          <span className="eyebrow">高级导出</span>
          <h4>{input.release ? `${input.release.title} ${input.release.version}` : `${input.map.title} 导出预览`}</h4>
        </div>
        <StatusPill tone={input.release?.status === 'published' ? 'ready' : 'idle'}>
          {input.release ? releaseDeliveryLabel(input.release) : '本机预览'}
        </StatusPill>
      </div>
      <div className="content-map-export-grid">
        <section>
          <strong>发布检查</strong>
          {checks.map((check) => <span key={check.label} className={check.ready ? 'ready' : ''}>{check.label}</span>)}
        </section>
        <section>
          <strong>包文件</strong>
          <div className="content-map-package-file-list">
            {previewableFiles.map((file) => (
              <button
                key={file}
                className={input.selectedFile === file ? 'active' : ''}
                disabled={!input.workspaceReady || input.busy || !previewPackageDir}
                type="button"
                onClick={() => input.onReadFile({ packageDir: previewPackageDir, relativePath: file })}
              >
                {file}
              </button>
            ))}
          </div>
          {!previewPackageDir ? <p>先生成本机预览，才能查看具体文件内容。</p> : null}
        </section>
        <section>
          <strong>本机预览内容</strong>
          {input.exportResult?.preview ? (
            <>
              <span className="ready">Agent Knowledge v{input.exportResult.preview.agentKnowledgeVersion}</span>
              <span>{input.exportResult.preview.readyRowCount} 个可复用内容组合</span>
              <span>{input.exportResult.preview.readyEvidenceCount} 条可引用证据</span>
              <span>{input.exportResult.preview.materialCoverageCount} 条素材覆盖</span>
              <span>{input.exportResult.preview.answerQuestionCount} 个答疑问题</span>
              <span>{input.exportResult.preview.interopFormats.join(' / ')} 互操作文件</span>
              <span>{input.exportResult.preview.promptGroundingFile}</span>
            </>
          ) : (
            <p>生成本机预览后，这里会显示知识包版本、素材覆盖、答疑层和互操作文件。</p>
          )}
        </section>
        <section>
          <strong>包校验</strong>
          {input.exportResult?.status === 'exported' ? (
            <>
              <span className="ready">{archiveSizeKb} KB</span>
              <span>sha256 {archiveSha}...</span>
              <span>{input.exportResult.packageArchiveFileName}</span>
            </>
          ) : (
            <p>生成后会显示 zip 大小、sha256 和本机文件名，用于和团队发布包比对。</p>
          )}
        </section>
        <section>
          <strong>下游消费</strong>
          <p>Prompt 草稿、场景库和素材审核都应引用同一团队知识包版本。</p>
          <p>{input.release?.packagePublicUrl ? '公开包地址已登记，可进入生产下载校验。' : '当前仍需真实 Bugu 工作区和公开包地址完成生产验收。'}</p>
        </section>
        <section>
          <strong>安全边界</strong>
          <p>导出前会阻断凭证、本机绝对路径、未审核主张、命令行指令和自动发布指令。</p>
          <p>{input.exportResult ? exportResultMessage(input.exportResult) : '尚未生成本机预览。'}</p>
        </section>
        <section className="content-map-package-file-preview">
          <strong>包内容详情</strong>
          {input.filePreview ? (
            input.filePreview.status === 'loaded' ? (
              <>
                <span className="ready">{input.filePreview.relativePath} · {input.filePreview.size ?? 0} 字节</span>
                {input.filePreview.truncated ? <span>内容较长，已显示前半部分。</span> : null}
                <pre>{input.filePreview.content}</pre>
              </>
            ) : (
              <>
                <span className="warn">{input.filePreview.relativePath}</span>
                <p>{input.filePreview.issues.join(' / ')}</p>
              </>
            )
          ) : (
            <p>选择 KNOWLEDGE、coverage、答疑或互操作文件后，这里会读取本机预览里的真实内容。</p>
          )}
        </section>
      </div>
      <ActionGroup align="left" className="content-map-section-actions">
        <button className="primary small" disabled={!input.workspaceReady || input.busy} onClick={input.onExportContentKnowledgePack}>
          生成本机预览
        </button>
        <button className="ghost small" disabled={!input.workspaceReady || input.busy} onClick={input.onCreateTeamKnowledgePackage}>
          创建知识包版本
        </button>
        <button
          className="ghost small"
          disabled={!input.workspaceReady || input.busy || !releaseReadyForPrompt || !readyRows.length}
          onClick={input.onCreateTeamKnowledgePromptDraft}
        >
          生成 Prompt 草稿
        </button>
        <button className="ghost small" disabled={!input.workspaceReady || input.busy} onClick={() => input.onSelectModule('agents')}>
          去 agents
        </button>
      </ActionGroup>
    </div>
  );
}

function renderBuildRunContent(run: ContentKnowledgeMapBuildRunRecord | undefined) {
  if (!run) {
    return (
      <div className="content-map-build-run empty">
        <strong>暂无生成流程</strong>
        <span>点击生成内容知识地图后，这里会显示输入、生成、校验和团队状态。</span>
      </div>
    );
  }
  return (
    <div className="content-map-build-run">
      <div className="section-title">
        <h3>最近生成流程</h3>
        <StatusPill tone={buildRunStatusTone(run.status)}>{BUILD_RUN_STATUS_LABELS[run.status]}</StatusPill>
      </div>
      <div className="content-map-build-run-summary">
        <div><strong>{run.readyPercent}%</strong><span>可用内容</span></div>
        <div><strong>{run.evidenceCount}</strong><span>证据</span></div>
        <div><strong>{run.gapCount}</strong><span>待处理</span></div>
      </div>
      <div className="content-map-build-run-steps">
        {run.steps.map((step) => (
          <article key={`${run.id}:${step.key}`} className={buildRunStepClass(step.status)}>
            <div>
              <strong>{step.title}</strong>
              <span>{step.status === 'completed' ? '完成' : step.status === 'skipped' ? '跳过' : '待处理'}</span>
            </div>
            <p>{step.message}</p>
          </article>
        ))}
      </div>
      {run.issues.length ? (
        <div className="content-map-build-run-issues">
          {run.issues.slice(0, 3).map((issue) => <span key={issue}>{issue}</span>)}
        </div>
      ) : null}
      <small>{new Date(run.completedAt).toLocaleString()} · {run.model ?? '生成服务'}</small>
    </div>
  );
}

function renderBuildRunDetailContent(input: {
  run: ContentKnowledgeMapBuildRunRecord | undefined;
  workspaceReady: boolean;
  busy: boolean;
  onBuildContentKnowledgeMap: () => void;
  onGenerateReviewTasks: () => void;
  onSelectModule: (module: ModuleKey) => void;
}) {
  if (!input.run) {
    return (
      <div className="content-map-build-detail empty">
        <strong>暂无生成流程</strong>
        <span>先导入产品资料、评论或素材，再生成内容知识地图。系统会记录输入、生成、质量检查和团队同步结果。</span>
        <ActionGroup align="left">
          <button className="primary small" disabled={!input.workspaceReady || input.busy} onClick={input.onBuildContentKnowledgeMap}>
            生成内容知识地图
          </button>
          <button className="ghost small" disabled={!input.workspaceReady || input.busy} onClick={() => input.onSelectModule('knowledge-inputs')}>
            补输入源
          </button>
        </ActionGroup>
      </div>
    );
  }
  const hasBlockedStep = input.run.steps.some((step) => step.status === 'blocked' || step.status === 'failed');
  return (
    <div className="content-map-build-detail">
      <div className="content-map-package-head">
        <div>
          <span className="eyebrow">生成流程</span>
          <h4>{input.run.title}</h4>
          <small>{new Date(input.run.completedAt).toLocaleString()} · {input.run.model ?? '生成服务'}</small>
        </div>
        <StatusPill tone={buildRunStatusTone(input.run.status)}>{BUILD_RUN_STATUS_LABELS[input.run.status]}</StatusPill>
      </div>
      <div className="content-map-build-detail-summary">
        <div><strong>{input.run.readyPercent}%</strong><span>可用内容</span></div>
        <div><strong>{input.run.evidenceCount}</strong><span>证据</span></div>
        <div><strong>{input.run.gapCount}</strong><span>待处理</span></div>
        <div><strong>{input.run.steps.length}</strong><span>流程步骤</span></div>
      </div>
      <div className="content-map-build-detail-steps">
        {input.run.steps.map((step, index) => (
          <article key={`${input.run?.id}:${step.key}`} className={buildRunStepClass(step.status)}>
            <b>{index + 1}</b>
            <div>
              <strong>{step.title}</strong>
              <span>{step.status === 'completed' ? '完成' : step.status === 'skipped' ? '跳过' : step.status === 'failed' ? '失败' : '待处理'}</span>
              <p>{step.message}</p>
            </div>
          </article>
        ))}
      </div>
      {input.run.issues.length ? (
        <section className="content-map-build-detail-issues">
          <strong>待处理问题</strong>
          <div>
            {input.run.issues.slice(0, 8).map((issue) => <span key={issue}>{issue}</span>)}
          </div>
        </section>
      ) : null}
      <section className="content-map-build-detail-recovery">
        <strong>下一步</strong>
        <p>{hasBlockedStep ? '先按问题清单补输入源、配置生成服务或处理缺证据项，再重新生成或送审。' : '生成结果可进入审核任务、团队知识包、Prompt 草稿或场景卡。'}</p>
        <ActionGroup align="left">
          <button
            className="primary small"
            disabled={!input.workspaceReady || input.busy || hasBlockedStep}
            onClick={input.onGenerateReviewTasks}
          >
            生成审核任务
          </button>
          <button className="ghost small" disabled={!input.workspaceReady || input.busy} onClick={input.onBuildContentKnowledgeMap}>
            重新生成地图
          </button>
          <button className="ghost small" disabled={!input.workspaceReady || input.busy} onClick={() => input.onSelectModule('knowledge-inputs')}>
            补输入源
          </button>
        </ActionGroup>
      </section>
    </div>
  );
}

export function ContentKnowledgeMapModule({
  workspaceReady,
  busy,
  inputSources,
  brandKnowledgeBases,
  sceneCards,
  promptDrafts,
  contentKnowledgeMaps,
  contentKnowledgeMapBuildRuns,
  teamChangePackages,
  teamKnowledgePackageVersions,
  teamSyncConflicts,
  contentWorkspaceSyncResult,
  activeContentKnowledgeMap,
  activeContentKnowledgeMapId,
  setActiveContentKnowledgeMapId,
  onBuildContentKnowledgeMap,
  onExportContentKnowledgePack,
  onWriteBackContentMaterialCoverage,
  onCreateTeamChangePackage,
  onSubmitTeamChangePackage,
  onExportTeamChangePackage,
  onImportTeamChangePackage,
  onResolveTeamSyncConflict,
  onCreateTeamKnowledgePackage,
  onCreateTeamKnowledgePromptDraft,
  onRefreshTeamKnowledgeUpdates,
  onGenerateContentReviewTasksForRows,
  onGenerateContentMaterialTasksForRows,
  onCreateContentProductionHandoffForRow,
  contentKnowledgePackExport,
  contentKnowledgePackFilePreview,
  onReadContentKnowledgePackFile,
  contentMaterialCoverage,
  agentPromptSessions,
  activeAgentPromptSessionId,
  textModel,
  onSelectAgentSession,
  onResolveAgentAction,
  onStartAgentSession,
  onContinueAgentSession,
  onSelectModule,
}: ContentKnowledgeMapModuleProps) {
  const feature = V2_FEATURES['knowledge-map'];
  const [activeTab, setActiveTab] = useState<DetailTab>('selling');
  const [expandedConflictId, setExpandedConflictId] = useState('');
  const [agentMessage, setAgentMessage] = useState('请检查当前内容知识地图的资料缺口、证据风险和下一步交付动作。');
  const [matrixFilter, setMatrixFilter] = useState<ContentMatrixFilterState>({
    status: 'all',
    material: 'all',
    audience: 'all',
    channel: 'all',
    contentFormat: 'all',
    query: '',
  });
  const [matrixSortKey, setMatrixSortKey] = useState<ContentMatrixSortKey>('priority');
  const [matrixPageIndex, setMatrixPageIndex] = useState(0);
  const [matrixPageSize, setMatrixPageSize] = useState(12);
  const [matrixBatchSize, setMatrixBatchSize] = useState(8);
  const [selectedMatrixRowIds, setSelectedMatrixRowIds] = useState<string[]>([]);
  const [focusedMatrixRowId, setFocusedMatrixRowId] = useState('');
  const [selectedPackageFile, setSelectedPackageFile] = useState('KNOWLEDGE.md');
  const activeMap = activeContentKnowledgeMap ?? contentKnowledgeMaps[0];
  const latestBuildRun = useMemo(
    () => {
      if (!contentKnowledgeMapBuildRuns.length) return undefined;
      if (!activeMap) return contentKnowledgeMapBuildRuns[0];
      return contentKnowledgeMapBuildRuns.find((run) => run.contentKnowledgeMapId === activeMap.id) ?? contentKnowledgeMapBuildRuns[0];
    },
    [activeMap, contentKnowledgeMapBuildRuns],
  );
  const hasInputs = inputSources.length > 0;
  const hasBrandKnowledge = brandKnowledgeBases.length > 0;
  const hasMap = Boolean(activeMap);
  const readyPercent = activeMap?.coverage.readyPercent ?? 0;
  const syncLabel = activeMap ? SYNC_STATUS_LABELS[activeMap.syncStatus] : '未生成';
  const mapReadyForTeam = activeMap?.status === 'ready' || activeMap?.status === 'published';
  const openTeamConflicts = teamSyncConflicts.filter((conflict) => conflict.status === 'open');
  const sharingSummary = activeMap?.sourceSensitivity;
  const restrictedSourceCount = sharingSummary?.counts.restricted ?? 0;
  const confidentialSourceCount = sharingSummary?.counts.confidential ?? 0;
  const restrictedSharingMessage = restrictedSourceMessage(activeMap);
  const hasSourceSharingGate = Boolean(restrictedSharingMessage);
  const latestTeamRelease = activeMap
    ? teamKnowledgePackageVersions.find((release) =>
        release.contentKnowledgeMapId === activeMap.id ||
        release.id === activeMap.teamSync.releaseId ||
        release.serverReleaseId === activeMap.teamSync.releaseId,
      )
    : teamKnowledgePackageVersions[0];
  const latestTeamReleaseReadyForPrompt = latestTeamRelease?.status === 'published';
  const teamPromptReadyRowCount = activeMap ? allMatrixRows(activeMap).filter((row) => row.status === 'ready').length : 0;
  const evidenceById = useMemo(
    () => new Map((activeMap?.evidence ?? []).map((item) => [item.id, item])),
    [activeMap],
  );
  const relatedAgentSessions = useMemo(
    () => agentPromptSessions.filter((session) => (
      session.title.includes('内容知识地图 Agent') ||
      session.title.includes('内容知识地图协作') ||
      session.userIntent.includes('内容知识地图 Agent') ||
      session.userIntent.includes('内容知识地图协作') ||
      (activeMap ? session.userIntent.includes(activeMap.id) || session.userIntent.includes(activeMap.title) : false)
    )),
    [activeMap, agentPromptSessions],
  );
  const activeAgentSession =
    relatedAgentSessions.find((session) => session.id === activeAgentPromptSessionId) ??
    relatedAgentSessions[0];
  const agentInputSourceIds = activeMap?.sourceInputSourceIds.length
    ? activeMap.sourceInputSourceIds
    : inputSources.filter((source) => source.status === 'converted' || source.status === 'registered').slice(0, 8).map((source) => source.id);
  const agentSceneCardIds = activeMap?.sceneCardIds.length
    ? activeMap.sceneCardIds
    : sceneCards.slice(0, 8).map((scene) => scene.id);
  const activeMatrixRows = useMemo(() => {
    if (!activeMap) return [];
    if (activeTab === 'selling') return activeMap.sellingPoints;
    if (activeTab === 'pain') return activeMap.painPoints;
    if (activeTab === 'scenario') return activeMap.scenarios;
    if (activeTab === 'ip') return allMatrixRows(activeMap).filter((row) => rowMatchesIp(row, evidenceById));
    if (activeTab === 'competitor') return allMatrixRows(activeMap).filter(rowMatchesCompetitor);
    return [];
  }, [activeMap, activeTab, evidenceById]);
  const matrixPlan = useMemo(() => planContentMatrixRows({
    rows: activeMatrixRows,
    filter: matrixFilter,
    sortKey: matrixSortKey,
    pageIndex: matrixPageIndex,
    pageSize: matrixPageSize,
    batchSize: matrixBatchSize,
  }), [activeMatrixRows, matrixBatchSize, matrixFilter, matrixPageIndex, matrixPageSize, matrixSortKey]);
  const selectedMatrixRows = useMemo(() => {
    const selectedIds = new Set(selectedMatrixRowIds);
    return matrixPlan.filteredRows.filter((row) => selectedIds.has(row.id));
  }, [matrixPlan.filteredRows, selectedMatrixRowIds]);
  const focusedMatrixRow = useMemo(
    () => matrixPlan.filteredRows.find((row) => row.id === focusedMatrixRowId) ?? matrixPlan.pageRows[0],
    [focusedMatrixRowId, matrixPlan.filteredRows, matrixPlan.pageRows],
  );
  const batchTargetRows = selectedMatrixRows.length ? selectedMatrixRows : matrixPlan.batchRows;
  const batchTargetSummary = useMemo(
    () => summarizeContentMatrixRows(batchTargetRows),
    [batchTargetRows],
  );
  const matrixAudienceOptions = useMemo(() => matrixDimensionOptions(activeMatrixRows, 'audiences'), [activeMatrixRows]);
  const matrixChannelOptions = useMemo(() => matrixDimensionOptions(activeMatrixRows, 'channels'), [activeMatrixRows]);
  const matrixFormatOptions = useMemo(() => matrixDimensionOptions(activeMatrixRows, 'contentFormats'), [activeMatrixRows]);
  const batchTargetRowIds = batchTargetRows.map((row) => row.id);
  const isMatrixTab = activeTab === 'selling' || activeTab === 'pain' || activeTab === 'scenario' || activeTab === 'ip' || activeTab === 'competitor';
  const updateMatrixFilter = (patch: Partial<ContentMatrixFilterState>) => {
    setMatrixFilter((current) => ({ ...current, ...patch }));
    setMatrixPageIndex(0);
    setSelectedMatrixRowIds([]);
  };
  const updateMatrixSortKey = (nextSortKey: ContentMatrixSortKey) => {
    setMatrixSortKey(nextSortKey);
    setMatrixPageIndex(0);
  };
  const updateMatrixPageSize = (nextPageSize: number) => {
    setMatrixPageSize(nextPageSize);
    setMatrixPageIndex(0);
  };
  const updateMatrixBatchSize = (nextBatchSize: number) => {
    setMatrixBatchSize(nextBatchSize);
    setMatrixPageIndex(0);
  };
  const toggleMatrixRow = (rowId: string) => {
    setSelectedMatrixRowIds((current) => (
      current.includes(rowId)
        ? current.filter((id) => id !== rowId)
        : [...current, rowId]
    ));
  };
  const toggleMatrixPageRows = () => {
    const pageRowIds = matrixPlan.pageRows.map((row) => row.id);
    const allSelected = pageRowIds.length > 0 && pageRowIds.every((rowId) => selectedMatrixRowIds.includes(rowId));
    setSelectedMatrixRowIds((current) => (
      allSelected
        ? current.filter((rowId) => !pageRowIds.includes(rowId))
        : Array.from(new Set([...current, ...pageRowIds]))
    ));
  };
  useEffect(() => {
    setMatrixPageIndex(0);
    setSelectedMatrixRowIds([]);
    setFocusedMatrixRowId('');
  }, [activeMap?.id, activeTab]);
  useEffect(() => {
    setSelectedPackageFile('KNOWLEDGE.md');
  }, [activeMap?.id]);
  const primaryAction = !activeMap
    ? {
        label: '生成内容知识地图',
        onClick: onBuildContentKnowledgeMap,
        disabled: !workspaceReady || busy,
        hint: '先把输入源、品牌知识库、场景和提示词草稿整理成可审核矩阵。',
      }
    : hasSourceSharingGate
      ? {
          label: '处理共享范围',
          onClick: () => onSelectModule('knowledge-inputs'),
          disabled: !workspaceReady || busy,
          hint: restrictedSharingMessage ?? '当前内容地图包含不能进入团队的资料，先回到输入源处理共享范围。',
        }
    : !mapReadyForTeam
      ? {
          label: '补齐资料缺口',
          onClick: () => onSelectModule('knowledge-inputs'),
          disabled: !workspaceReady || busy,
          hint: activeMap.gaps[0] || '当前地图仍有待补齐项，不能发布为团队知识包版本。',
        }
      : openTeamConflicts.length
        ? {
            label: '查看合并清单',
            onClick: () => setExpandedConflictId(openTeamConflicts[0].id),
            disabled: !workspaceReady || busy,
            hint: '团队已有旧版本提交，先查看逐项差异和处理建议，避免覆盖团队当前版本。',
          }
      : activeMap.syncStatus !== 'synced'
        ? teamChangePackages.length
          ? {
              label: '提交团队工作区',
              onClick: onSubmitTeamChangePackage,
              disabled: !workspaceReady || busy,
              hint: '提交后，团队成员会基于同一版本继续生产和审核。',
            }
          : {
              label: '生成变更包',
              onClick: onCreateTeamChangePackage,
              disabled: !workspaceReady || busy,
              hint: '先把本机草稿整理成可审计变更包，再提交到团队工作区。',
            }
        : {
            label: '创建知识包版本',
            onClick: onCreateTeamKnowledgePackage,
            disabled: !workspaceReady || busy,
            hint: '发布后，Prompt 草稿和内容生产链路可以选择这个团队版本。',
          };
  const deliveryChecks = [
    {
      label: `${activeMap?.coverage.inputSourceCount ?? inputSources.length} 个输入源`,
      ready: Boolean(activeMap?.coverage.inputSourceCount || inputSources.length),
    },
    {
      label: `${activeMap?.coverage.evidenceCount ?? 0} 条证据`,
      ready: Boolean(activeMap?.coverage.evidenceCount),
    },
    {
      label: `${activeMap?.coverage.skuRowCount ?? 0} 个 SKU 组合`,
      ready: Boolean(activeMap?.coverage.skuRowCount),
    },
    {
      label: `${activeMap?.coverage.competitorObservationCount ?? 0} 条竞品观察`,
      ready: Boolean(activeMap?.coverage.competitorObservationCount),
    },
    {
      label: `${activeMap?.coverage.assetReviewCount ?? 0} 条素材审核`,
      ready: Boolean(activeMap?.coverage.assetReviewCount),
    },
    {
      label: `${activeMap?.constraints.length ?? 0} 条规则边界`,
      ready: Boolean(activeMap?.constraints.length),
    },
    {
      label: `${activeMap?.coverage.gapCount ?? 0} 个待补缺口`,
      ready: Boolean(activeMap && activeMap.coverage.gapCount === 0),
    },
    {
      label: `${restrictedSourceCount} 个仅本机资料`,
      ready: Boolean(activeMap && restrictedSourceCount === 0),
    },
    {
      label: `${confidentialSourceCount} 个负责人确认资料`,
      ready: Boolean(activeMap),
    },
    {
      label: `${matrixPlan.summary.audienceCount} 个人群维度`,
      ready: Boolean(matrixPlan.summary.audienceCount),
    },
    {
      label: `${matrixPlan.summary.channelCount} 个渠道维度`,
      ready: Boolean(matrixPlan.summary.channelCount),
    },
    {
      label: `${activeMap?.sellingPoints.length ?? 0} 个卖点`,
      ready: Boolean(activeMap?.sellingPoints.length),
    },
    {
      label: `${activeMap?.scenarios.length ?? 0} 个场景`,
      ready: Boolean(activeMap?.scenarios.length),
    },
  ];
  const agentSteps: AgentExecutionStep[] = [
    {
      key: 'inputs',
      title: '输入源',
      detail: `${inputSources.length} 个输入源`,
      state: hasInputs ? 'done' : 'active',
    },
    {
      key: 'brand',
      title: '品牌知识库',
      detail: `${brandKnowledgeBases.length} 个品牌 / 产品知识库`,
      state: hasBrandKnowledge ? 'done' : hasInputs ? 'active' : 'blocked',
    },
    {
      key: 'map',
      title: '内容地图',
      detail: activeMap ? `${readyPercent}% 可用` : '等待生成卖点、痛点、场景和证据矩阵',
      state: hasMap ? 'done' : hasBrandKnowledge ? 'active' : 'idle',
    },
    {
      key: 'team',
      title: '团队共享',
      detail: teamSyncMessage(activeMap),
      state: hasSourceSharingGate ? 'blocked' : activeMap?.syncStatus === 'synced' ? 'done' : openTeamConflicts.length ? 'blocked' : hasMap ? 'active' : 'idle',
    },
    {
      key: 'handoff',
      title: '生产交付',
      detail: '交给场景库、Prompt 草稿和审核任务',
      state: hasMap ? 'active' : 'idle',
    },
  ];
  const agentContext = (
    <div className="knowledge-agent-context-grid">
      <article>
        <span>输入状态</span>
        <strong>{hasInputs ? `${inputSources.length} 个输入源` : '缺少输入源'}</strong>
        <small>{hasBrandKnowledge ? `${brandKnowledgeBases.length} 个品牌知识库可引用` : '需要先抽取品牌 / 产品事实'}</small>
      </article>
      <article>
        <span>当前地图</span>
        <strong>{activeMap?.title ?? '尚未生成内容知识地图'}</strong>
        <small>{activeMap ? `${MAP_STATUS_LABELS[activeMap.status]} · ${syncLabel}` : '等待生成可审核矩阵'}</small>
      </article>
      <article>
        <span>交付去向</span>
        <strong>{latestTeamRelease ? releaseDeliveryLabel(latestTeamRelease) : '团队知识包 / 下游生产'}</strong>
        <small>{primaryAction.hint}</small>
      </article>
    </div>
  );
  const startKnowledgeMapAgent = () => {
    const trimmed = agentMessage.trim();
    if (!trimmed) return;
    onStartAgentSession({
      title: `${activeMap?.title ?? '内容知识地图'} / 内容知识地图协作`,
      purpose: 'content-task',
      userIntent: [
        '内容知识地图协作',
        activeMap ? `当前地图：${activeMap.title}（${activeMap.id}）` : '当前还没有内容知识地图。',
        activeMap ? `地图状态：${MAP_STATUS_LABELS[activeMap.status]} / ${syncLabel} / ${readyPercent}% 可用。` : '',
        `用户请求：${trimmed}`,
        '请基于真实输入源、品牌知识库、场景卡、Prompt 草稿、证据、缺口和团队同步状态，给出下一步可执行建议；不要编造未出现的资料。',
      ].filter(Boolean).join('\n'),
      inputSourceIds: agentInputSourceIds,
      sceneCardIds: agentSceneCardIds,
      textModel,
    });
  };
  const continueKnowledgeMapAgent = () => {
    const trimmed = agentMessage.trim();
    if (!activeAgentSession || !trimmed) return;
    onContinueAgentSession({ sessionId: activeAgentSession.id, message: trimmed, textModel });
  };

  return (
    <section className="knowledge-brand-workbench content-map-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="compact"
        actions={(
          <div className="v2-feature-actions">
            <StatusPill tone={activeMap ? mapStatusTone(activeMap.status) : 'idle'}>
              {activeMap ? MAP_STATUS_LABELS[activeMap.status] : '待生成'}
            </StatusPill>
            <StatusPill tone={syncStatusTone(activeMap?.syncStatus)}>{syncLabel}</StatusPill>
            <StatusPill tone={readyPercent >= 70 ? 'ready' : hasMap ? 'blocked' : 'idle'}>{readyPercent}% 可用</StatusPill>
          </div>
        )}
      />

      <AgentSessionPanel
        eyebrow="知识地图助手"
        title={activeMap?.title ?? '内容知识地图协作'}
        session={activeAgentSession}
        sessions={relatedAgentSessions}
        transcriptLabel={activeAgentSession ? activeAgentSession.title : hasMap ? '内容知识地图处理结果' : '等待生成内容知识地图'}
        statusLabel={activeAgentSession ? AGENT_SESSION_STATUS_LABELS[activeAgentSession.status] : activeMap ? `${MAP_STATUS_LABELS[activeMap.status]} · ${syncLabel}` : '待生成'}
        statusTone={activeAgentSession ? agentSessionTone(activeAgentSession.status) : activeMap ? mapStatusTone(activeMap.status) : 'idle'}
        steps={agentSteps}
        runningLabel={busy ? '正在处理内容知识地图任务' : undefined}
        context={agentContext}
        artifact={(
          <div className="content-map-layout">
        <aside className="panel prompt-draft-list-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">版本</p>
              <h3>内容知识地图</h3>
            </div>
            <StatusPill tone="idle">{contentKnowledgeMaps.length} 版</StatusPill>
          </div>
          <div className="prompt-draft-list">
            {contentKnowledgeMaps.map((record) => (
              <SelectableRecordCard
                key={record.id}
                className="prompt-draft-card"
                active={record.id === activeContentKnowledgeMapId}
                status={MAP_STATUS_LABELS[record.status]}
                statusTone={mapStatusTone(record.status)}
                title={record.title}
                meta={`${record.coverage.readyPercent}% 可用 · ${SYNC_STATUS_LABELS[record.syncStatus]}`}
                description={record.gaps[0] ? clip(record.gaps[0], 72) : '卖点、痛点和场景矩阵已可交给下游任务。'}
                onClick={() => setActiveContentKnowledgeMapId(record.id)}
              />
            ))}
            {contentKnowledgeMaps.length === 0 ? <div className="empty-state">还没有内容知识地图。补资料后点击生成。</div> : null}
          </div>
        </aside>

        <section className="panel content-map-detail-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">详情</p>
              <h3>{activeMap?.title ?? '尚未生成内容知识地图'}</h3>
            </div>
            {activeMap ? <StatusPill tone={mapStatusTone(activeMap.status)}>{MAP_STATUS_LABELS[activeMap.status]}</StatusPill> : null}
          </div>

          {activeMap ? (
            <>
              <div className="content-map-stat-grid">
                <article><strong>{activeMap.coverage.inputSourceCount}</strong><span>输入源</span></article>
                <article><strong>{activeMap.coverage.ipKnowledgeBaseCount ?? 0}</strong><span>IP 版本</span></article>
                <article><strong>{activeMap.sellingPoints.length}</strong><span>卖点</span></article>
                <article><strong>{activeMap.painPoints.length}</strong><span>痛点</span></article>
                <article><strong>{activeMap.scenarios.length}</strong><span>场景</span></article>
                <article><strong>{activeMap.coverage.skuRowCount ?? 0}</strong><span>SKU</span></article>
                <article><strong>{activeMap.coverage.competitorObservationCount ?? 0}</strong><span>竞品观察</span></article>
                <article><strong>{activeMap.coverage.assetReviewCount ?? 0}</strong><span>素材审核</span></article>
                <article><strong>{activeMap.coverage.evidenceCount}</strong><span>证据</span></article>
                <article><strong>{activeMap.coverage.gapCount}</strong><span>缺口</span></article>
              </div>

              <div className="content-map-sync-note">
                <strong>团队同步</strong>
                <span>{teamSyncMessage(activeMap)}</span>
              </div>

              {sharingSummary ? (
                <div className={`content-map-sharing-card ${restrictedSourceCount ? 'blocked' : confidentialSourceCount ? 'pending' : 'ready'}`}>
                  <div className="content-map-sharing-head">
                    <div>
                      <strong>资料共享检查</strong>
                      <span>{restrictedSourceCount ? '包含不能同步或发布的资料' : confidentialSourceCount ? '含负责人确认资料，发布前需复核' : '当前资料可进入团队流转'}</span>
                    </div>
                    <StatusPill tone={sourceSharingTone(sharingSummary.highest)}>
                      {sourceSharingLabel(sharingSummary.highest)}
                    </StatusPill>
                  </div>
                  <div className="content-map-sharing-counts" aria-label="资料共享范围统计">
                    <span><b>{sharingSummary.counts.public}</b>公开资料</span>
                    <span><b>{sharingSummary.counts.internal}</b>团队内部</span>
                    <span><b>{sharingSummary.counts.confidential}</b>负责人确认</span>
                    <span className={restrictedSourceCount ? 'blocked' : 'ready'}><b>{sharingSummary.counts.restricted}</b>仅本机</span>
                  </div>
                  {restrictedSharingMessage ? (
                    <div className="content-map-sharing-issue">
                      <span>{restrictedSharingMessage}</span>
                      <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge-inputs')}>
                        回到输入源处理共享范围
                      </button>
                    </div>
                  ) : sharingSummary.confidentialSourceTitles.length ? (
                    <p>需负责人确认：{sharingSummary.confidentialSourceTitles.slice(0, 3).join('、')}</p>
                  ) : (
                    <p>发布前仍会检查本机路径、凭证线索和不可共享资料。</p>
                  )}
                </div>
              ) : null}

              <div className="content-map-tabs" role="tablist" aria-label="内容知识地图详情">
                {TAB_LABELS.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={activeTab === tab.key ? 'active' : ''}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {isMatrixTab ? (
                <>
                  <div className="content-map-matrix-toolbar">
                    <div className="content-map-filter-grid">
                      <label>
                        <span>状态</span>
                        <select
                          value={matrixFilter.status}
                          onChange={(event) => updateMatrixFilter({ status: event.target.value as ContentMatrixStatusFilter })}
                        >
                          {MATRIX_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>素材</span>
                        <select
                          value={matrixFilter.material}
                          onChange={(event) => updateMatrixFilter({ material: event.target.value as ContentMatrixMaterialFilter })}
                        >
                          {MATRIX_MATERIAL_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>排序</span>
                        <select
                          value={matrixSortKey}
                          onChange={(event) => updateMatrixSortKey(event.target.value as ContentMatrixSortKey)}
                        >
                          {MATRIX_SORT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span>关键词</span>
                        <input
                          value={matrixFilter.query}
                          placeholder="卖点、痛点、场景、来源"
                          onChange={(event) => updateMatrixFilter({ query: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>人群</span>
                        <select
                          value={matrixFilter.audience}
                          onChange={(event) => updateMatrixFilter({ audience: event.target.value })}
                        >
                          <option value="all">全部人群</option>
                          {matrixAudienceOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>渠道</span>
                        <select
                          value={matrixFilter.channel}
                          onChange={(event) => updateMatrixFilter({ channel: event.target.value })}
                        >
                          <option value="all">全部渠道</option>
                          {matrixChannelOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>形式</span>
                        <select
                          value={matrixFilter.contentFormat}
                          onChange={(event) => updateMatrixFilter({ contentFormat: event.target.value })}
                        >
                          <option value="all">全部形式</option>
                          {matrixFormatOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                        </select>
                      </label>
                      <label>
                        <span>每页</span>
                        <select value={matrixPageSize} onChange={(event) => updateMatrixPageSize(Number(event.target.value))}>
                          {[8, 12, 20, 40].map((size) => <option key={size} value={size}>{size} 条</option>)}
                        </select>
                      </label>
                      <label>
                        <span>本批</span>
                        <select value={matrixBatchSize} onChange={(event) => updateMatrixBatchSize(Number(event.target.value))}>
                          {[4, 8, 12, 20].map((size) => <option key={size} value={size}>{size} 条</option>)}
                        </select>
                      </label>
                    </div>
                    <div className="content-map-batch-summary">
                      <span>筛选 {matrixPlan.summary.total} 条</span>
                      <span>本批 {batchTargetSummary.total} 条</span>
                      <span>{batchTargetSummary.readyCount} 可用</span>
                      <span>{batchTargetSummary.needsReviewCount} 待审核</span>
                      <span>{batchTargetSummary.needsEvidenceCount} 缺证据</span>
                      <span>{batchTargetSummary.materialMissingCount} 缺素材</span>
                      <span>{batchTargetSummary.competitorRiskCount} 竞品边界</span>
                      <span>{batchTargetSummary.ipLinkedCount} IP 口吻</span>
                      <button
                        className="ghost small"
                        disabled={!workspaceReady || busy || !batchTargetRowIds.length}
                        onClick={() => onGenerateContentReviewTasksForRows(batchTargetRowIds)}
                      >
                        生成本批审核任务
                      </button>
                    </div>
                  </div>
                  {renderMatrixRows({
                    plan: matrixPlan,
                    evidenceById,
                    selectedRowIds: selectedMatrixRowIds,
                    focusedRowId: focusedMatrixRow?.id,
                    onToggleRow: toggleMatrixRow,
                    onFocusRow: setFocusedMatrixRowId,
                    onTogglePageRows: toggleMatrixPageRows,
                  })}
                  {renderMatrixRowDetail(
                    focusedMatrixRow,
                    evidenceById,
                    (rowId) => onGenerateContentReviewTasksForRows([rowId]),
                    (rowId) => onGenerateContentMaterialTasksForRows([rowId]),
                    onCreateContentProductionHandoffForRow,
                    onSelectModule,
                    busy,
                    workspaceReady,
                  )}
                  <div className="content-map-pagination">
                    <button
                      className="ghost small"
                      disabled={!matrixPlan.hasPreviousPage}
                      onClick={() => setMatrixPageIndex((current) => Math.max(0, current - 1))}
                    >
                      上一页
                    </button>
                    <span>
                      第 {matrixPlan.pageIndex + 1} / {matrixPlan.pageCount} 页 · 本页 {matrixPlan.pageSummary.total} 条 · 已选 {selectedMatrixRows.length} 条
                    </span>
                    <button
                      className="ghost small"
                      disabled={!matrixPlan.hasNextPage}
                      onClick={() => setMatrixPageIndex((current) => current + 1)}
                    >
                      下一页
                    </button>
                  </div>
                </>
              ) : null}
              {activeTab === 'evidence' ? renderEvidence(activeMap.evidence) : null}
              {activeTab === 'gaps' ? (
                <div className="content-map-gap-list">
                  {activeMap.gaps.map((gap) => <span key={gap}>{gap}</span>)}
                  {activeMap.constraints.map((constraint) => <span key={constraint} className="ready">{constraint}</span>)}
                  {!activeMap.gaps.length && !activeMap.constraints.length ? <div className="empty-state">暂无缺口或规则。</div> : null}
                </div>
              ) : null}
              {activeTab === 'build' ? renderBuildRunDetailContent({
                run: latestBuildRun,
                workspaceReady,
                busy,
                onBuildContentKnowledgeMap,
                onGenerateReviewTasks: () => onGenerateContentReviewTasksForRows(batchTargetRowIds),
                onSelectModule,
              }) : null}
              {activeTab === 'team' ? renderTeamKnowledgePackageContent({
                map: activeMap,
                release: latestTeamRelease,
                readyForPrompt: Boolean(latestTeamReleaseReadyForPrompt),
                readyRowCount: teamPromptReadyRowCount,
                workspaceReady,
                busy,
                onCreatePromptDraft: onCreateTeamKnowledgePromptDraft,
                onCreateTeamKnowledgePackage,
                onRefreshTeamKnowledgeUpdates,
              }) : null}
              {activeTab === 'materials' ? renderMaterialFeedbackContent({
                map: activeMap,
                result: contentMaterialCoverage,
                onWriteBack: onWriteBackContentMaterialCoverage,
                onCreateMaterialTasks: onGenerateContentMaterialTasksForRows,
                onSelectModule,
                busy,
                workspaceReady,
              }) : null}
              {activeTab === 'export' ? renderAdvancedExportContent({
                map: activeMap,
                release: latestTeamRelease,
                exportResult: contentKnowledgePackExport,
                filePreview: contentKnowledgePackFilePreview,
                selectedFile: selectedPackageFile,
                onExportContentKnowledgePack,
                onCreateTeamKnowledgePackage,
                onCreateTeamKnowledgePromptDraft,
                onReadFile: (input) => {
                  setSelectedPackageFile(input.relativePath);
                  onReadContentKnowledgePackFile(input);
                },
                onSelectModule,
                busy,
                workspaceReady,
              }) : null}
            </>
          ) : (
            <div className="empty-state">内容知识地图会把输入源、品牌知识库、场景卡和 Prompt 草稿整理成可审核矩阵。</div>
          )}
        </section>

        <aside className="panel content-map-handoff-panel">
          <div className="panel-title">
            <div>
              <p className="eyebrow">交付</p>
              <h3>团队知识包</h3>
            </div>
          </div>

          <div className="content-map-delivery-card">
            <strong>{latestTeamRelease ? `${latestTeamRelease.title} ${latestTeamRelease.version}` : activeMap?.title ?? '等待生成内容知识地图'}</strong>
            <span>{latestTeamRelease ? releaseDeliveryLabel(latestTeamRelease) : primaryAction.hint}</span>
            {latestTeamRelease?.packagePublicUrl ? (
              <a href={latestTeamRelease.packagePublicUrl} rel="noreferrer" target="_blank">打开团队知识包</a>
            ) : null}
            <ActionGroup align="left" className="content-map-delivery-actions">
              <button
                className="ghost small"
                disabled={!workspaceReady || busy || !latestTeamReleaseReadyForPrompt || !teamPromptReadyRowCount}
                onClick={onCreateTeamKnowledgePromptDraft}
              >
                生成 Prompt 草稿
              </button>
              <button
                className="ghost small"
                disabled={!workspaceReady || busy || !activeMap}
                onClick={() => onSelectModule('agents')}
              >
                去 agents
              </button>
              <button
                className="ghost small"
                disabled={!workspaceReady || busy}
                onClick={onRefreshTeamKnowledgeUpdates}
              >
                拉取团队更新
              </button>
            </ActionGroup>
            {!latestTeamReleaseReadyForPrompt ? (
              <small>发布团队知识包版本后，才能把同一团队口径交给 Prompt 草稿。</small>
            ) : !teamPromptReadyRowCount ? (
              <small>先完成审核或补证据，至少需要 1 个可复用组合。</small>
            ) : null}
          </div>

          {latestTeamRelease ? (
            <div className="content-map-release-browser">
              <div className="section-title">
                <h3>团队版本详情</h3>
                <span>{teamKnowledgePackageVersions.length} 个版本</span>
              </div>
              <div className="content-map-release-facts">
                <div><strong>版本</strong><span>{latestTeamRelease.version}</span></div>
                <div><strong>状态</strong><span>{releaseDeliveryLabel(latestTeamRelease)}</span></div>
                <div><strong>文件</strong><span>{latestTeamRelease.files.length} 个</span></div>
                <div><strong>大小</strong><span>{latestTeamRelease.packageArchiveSize ? `${Math.round(latestTeamRelease.packageArchiveSize / 1024)} KB` : '等待登记'}</span></div>
              </div>
              <div className="content-map-release-file-list">
                {(latestTeamRelease.files.length ? latestTeamRelease.files : ['KNOWLEDGE.md', 'manifest.json']).slice(0, 8).map((file) => (
                  <span key={file}>{file}</span>
                ))}
              </div>
              <div className="content-map-release-trace">
                {latestTeamRelease.packageObjectKey ? <span>对象：{clip(latestTeamRelease.packageObjectKey, 96)}</span> : null}
                {latestTeamRelease.packageArchiveSha256 ? <span>校验：{clip(latestTeamRelease.packageArchiveSha256, 24)}</span> : null}
                {latestTeamRelease.approvalStatus ? <span>确认：{latestTeamRelease.approvalStatus === 'approved' ? '已确认' : latestTeamRelease.approvalStatus === 'pending' ? '待确认' : '已驳回'}</span> : null}
              </div>
              {teamKnowledgePackageVersions.length > 1 ? (
                <div className="content-map-release-history">
                  {teamKnowledgePackageVersions.slice(0, 3).map((release) => (
                    <div key={release.id}>
                      <strong>{release.version}</strong>
                      <span>{release.status === 'published' ? '已发布' : release.status === 'local-preview' ? '本机预览' : '未完成'}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="content-map-check-list" aria-label="发布检查">
            {deliveryChecks.map((check) => (
              <span key={check.label} className={check.ready ? 'ready' : ''}>{check.label}</span>
            ))}
          </div>

          <div className="workflow-run-steps">
            <span className={brandKnowledgeBases.length ? 'ready' : ''}>{brandKnowledgeBases.length} 个品牌 / 产品知识库</span>
            <span className={sceneCards.length ? 'ready' : ''}>{sceneCards.length} 张场景卡</span>
            <span className={promptDrafts.length ? 'ready' : ''}>{promptDrafts.length} 个 Prompt 草稿</span>
            <span className={latestBuildRun ? 'ready' : ''}>{contentKnowledgeMapBuildRuns.length} 条生成流程</span>
            <span className={teamChangePackages.length ? 'ready' : ''}>{teamChangePackages.length} 个变更包</span>
            <span className={openTeamConflicts.length ? '' : 'ready'}>{openTeamConflicts.length} 个同步冲突</span>
            <span className={teamKnowledgePackageVersions.length ? 'ready' : ''}>{teamKnowledgePackageVersions.length} 个团队版本</span>
          </div>
          {renderBuildRunContent(latestBuildRun)}
          <div className="content-map-conflict-list">
            <strong>同步冲突</strong>
            {openTeamConflicts.length ? (
              openTeamConflicts.slice(0, 3).map((conflict) => {
                const mergeDraft = buildContentSyncConflictMergeDraft(conflict);
                const expanded = expandedConflictId === conflict.id;
                return (
                  <article key={conflict.id}>
                    <div>
                      <span>{conflictSourceLabel(conflict.sourceType)}</span>
                      <StatusPill tone="blocked">待处理</StatusPill>
                    </div>
                    <h4>{conflict.title}</h4>
                    <p>{conflict.summary}</p>
                    <small>本机基于版本 {conflict.baseRevision || '未知'}，团队当前版本 {conflict.serverRevision || '未知'}。</small>
                    <div className="content-map-conflict-details">
                      <span>需要判断的内容</span>
                      <ul>
                        {conflictAffectedObjects(conflict).map((item) => (
                          <li key={item.id}>
                            <div>
                              <b>{item.title}</b>
                              <em>{conflictObjectTypeLabel(item.objectType)} · {conflictImpactLabel(item.impact)}</em>
                            </div>
                            <p>{clip(item.summary, 96)}</p>
                            <small>
                              {item.localValue ? `本机提交：${item.localValue}。` : ''}
                              {item.teamValue ? `团队状态：${item.teamValue}。` : ''}
                              {item.recommendation}
                            </small>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="content-map-merge-summary">
                      <div>
                        <strong>合并处理清单</strong>
                        <span>{mergeDraft.summary}</span>
                      </div>
                      <button
                        className="ghost small"
                        disabled={!workspaceReady || busy}
                        onClick={() => setExpandedConflictId(expanded ? '' : conflict.id)}
                      >
                        {expanded ? '收起清单' : '查看清单'}
                      </button>
                    </div>
                    {expanded ? (
                      <div className="content-map-merge-draft">
                        {mergeDraft.rows.map((row) => (
                          <section key={row.id}>
                            <div>
                              <strong>{row.objectTitle}</strong>
                              <StatusPill tone={row.suggestedDecision === 'manual-review' ? 'blocked' : 'idle'}>
                                {row.suggestedDecisionLabel}
                              </StatusPill>
                            </div>
                            <dl>
                              <div>
                                <dt>字段</dt>
                                <dd>{row.objectTypeLabel} / {row.fieldLabel}</dd>
                              </div>
                              <div>
                                <dt>本机提交</dt>
                                <dd>{row.localValue}</dd>
                              </div>
                              <div>
                                <dt>团队当前</dt>
                                <dd>{row.teamValue}</dd>
                              </div>
                            </dl>
                            <p>{row.reason}</p>
                            <small>{row.nextStep}</small>
                          </section>
                        ))}
                      </div>
                    ) : null}
                    <div className="content-map-conflict-actions">
                      <button
                        className="ghost small"
                        disabled={!workspaceReady || busy}
                        onClick={() => onResolveTeamSyncConflict(conflict, 'keep-team-version')}
                      >
                        保留团队内容
                      </button>
                      <button
                        className="ghost small"
                        disabled={!workspaceReady || busy}
                        onClick={() => onResolveTeamSyncConflict(conflict, 'keep-local-change')}
                      >
                        重新提交本机修改
                      </button>
                      <button
                        className="ghost small"
                        disabled={!workspaceReady || busy}
                        onClick={() => onResolveTeamSyncConflict(conflict, 'manual-review-recorded')}
                      >
                        按清单转人工确认
                      </button>
                    </div>
                  </article>
                );
              })
            ) : (
              <span className="content-map-conflict-empty">暂无同步冲突。旧版本提交会进入这里，不会覆盖团队当前版本。</span>
            )}
          </div>
          {contentKnowledgePackExport ? (
            <div className="content-map-export-note">
              <strong>{contentKnowledgePackExport.status === 'exported' ? '本机预览已生成' : '发布检查未通过'}</strong>
              <span>{exportResultMessage(contentKnowledgePackExport)}</span>
            </div>
          ) : null}
          {contentMaterialCoverage ? (
            <div className="content-map-export-note">
              <strong>{contentMaterialCoverage.status === 'updated' ? '素材已回写' : '素材未匹配'}</strong>
              <span>
                {contentMaterialCoverage.status === 'updated'
                  ? `${contentMaterialCoverage.updatedRowCount} 个矩阵组合已关联素材，已审核素材 ${contentMaterialCoverage.approvedAssetCount} 个，待确认补充 ${contentMaterialCoverage.pendingSupplementTaskCount ?? 0} 条。`
                  : contentMaterialCoverage.issues.join(' / ')}
              </span>
            </div>
          ) : null}
          {contentWorkspaceSyncResult ? (
            <div className="content-map-export-note">
              <strong>{syncResultTitle(contentWorkspaceSyncResult)}</strong>
              <span>{syncResultMessage(contentWorkspaceSyncResult)}</span>
            </div>
          ) : null}
        </aside>
          </div>
        )}
        footer={(
          <>
            <label className="prompt-session-adjustment knowledge-agent-composer">
              <span>{activeAgentSession ? '继续对话' : '地图要求'}</span>
              <textarea value={agentMessage} onChange={(event) => setAgentMessage(event.target.value)} />
            </label>
            <ActionGroup align="left" className="knowledge-agent-actions">
              {activeAgentSession ? (
                <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim()} onClick={continueKnowledgeMapAgent}>
                  继续会话
                </button>
              ) : (
                <button className="primary small" disabled={!workspaceReady || busy || !agentMessage.trim()} onClick={startKnowledgeMapAgent}>
                  开始生成
                </button>
              )}
              <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge-inputs')}>补输入源</button>
              <button className="ghost small" disabled={!workspaceReady || busy} onClick={() => onSelectModule('knowledge-brand')}>抽取品牌知识库</button>
              <button className="ghost small" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>
                {primaryAction.label}
              </button>
              <button className="ghost small" disabled={!workspaceReady || busy || !teamChangePackages.length} onClick={onExportTeamChangePackage}>
                导出变更包
              </button>
              <button className="ghost small" disabled={!workspaceReady || busy} onClick={onImportTeamChangePackage}>
                导入变更包
              </button>
              {activeMap ? (
                <button className="ghost small" disabled={!workspaceReady || busy} onClick={onBuildContentKnowledgeMap}>
                  重新生成地图
                </button>
              ) : null}
              <button className="ghost small" disabled={!workspaceReady || busy || !activeMap} onClick={() => onSelectModule('knowledge-scenes')}>去场景库</button>
              <button className="ghost small" disabled={!workspaceReady || busy || !latestTeamReleaseReadyForPrompt || !teamPromptReadyRowCount} onClick={onCreateTeamKnowledgePromptDraft}>生成 Prompt 草稿</button>
              <button className="ghost small" disabled={!workspaceReady || busy || !activeMap} onClick={onWriteBackContentMaterialCoverage}>回写素材</button>
              <button className="ghost small" disabled={!workspaceReady || busy || !activeMap} onClick={onExportContentKnowledgePack}>生成本机预览</button>
            </ActionGroup>
          </>
        )}
        empty={(
          <>
            <strong>等待生成内容知识地图</strong>
            <span>补齐输入源和品牌知识库后，Agent 会整理卖点、痛点、场景、证据和缺口。</span>
          </>
        )}
        onSelectSession={onSelectAgentSession}
        onResolveAction={onResolveAgentAction}
        messageTitle={agentMessageTitle}
        messageMeta={(message) => `${AGENT_MESSAGE_KIND_LABELS[message.kind]} · ${new Date(message.createdAt).toLocaleString()}`}
        messagePreview={compactAgentMessage}
      />
    </section>
  );
}
