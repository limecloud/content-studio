import type {
  BrandCommandActionRecord,
  BrandCommandCampaignCell,
  BrandCommandCenterRecord,
  BrandCommandQueueItem,
  BrandCommandResourceBundle,
  ContentTeamRole,
} from '../../shared/types';

export interface BrandCommandExecutionPolicyInput {
  record: BrandCommandCenterRecord;
  queueItem: BrandCommandQueueItem;
  resourceBundle?: BrandCommandResourceBundle;
  campaignCell?: BrandCommandCampaignCell;
  recentActions: BrandCommandActionRecord[];
  actorRole?: ContentTeamRole;
}

export interface BrandCommandExecutionPolicyResult {
  allowed: boolean;
  issues: string[];
  recoveryAction?: string;
}

function combinedText(input: {
  record: BrandCommandCenterRecord;
  resourceBundle?: BrandCommandResourceBundle;
  campaignCell?: BrandCommandCampaignCell;
}): string {
  return [
    input.record.title,
    input.campaignCell?.title,
    input.resourceBundle?.title,
    ...(input.resourceBundle?.sellingPointRefs ?? []),
    ...(input.resourceBundle?.sceneRefs ?? []),
    ...(input.resourceBundle?.constraints ?? []),
    ...(input.resourceBundle?.gaps ?? []),
  ].filter(Boolean).join(' ');
}

function isProductionAction(actionType: BrandCommandQueueItem['actionType']): boolean {
  return actionType === 'generate-prompt-draft' ||
    actionType === 'create-scene-card' ||
    actionType === 'launch-sop-run';
}

function canExecuteAction(role: ContentTeamRole | undefined, actionType: BrandCommandQueueItem['actionType']): boolean {
  if (!role) return true;
  if (role === 'owner' || role === 'content-engineer') return true;
  if (role === 'operator') return actionType !== 'write-back-material-coverage';
  if (role === 'reviewer') {
    return actionType === 'request-review' ||
      actionType === 'request-evidence' ||
      actionType === 'create-material-gap-list';
  }
  return false;
}

function hasPlatformRule(input: BrandCommandExecutionPolicyInput): boolean {
  const text = [
    ...(input.resourceBundle?.constraints ?? []),
    ...input.record.constraints,
    ...(input.campaignCell?.decisionChecks ?? []).flatMap((check) => [check.label, check.message, check.recoveryAction ?? '']),
  ].join(' ');
  return /平台|渠道|发布|合规|规则|禁用|小红书|抖音|公众号|私域/.test(text);
}

function alreadyExecuted(input: BrandCommandExecutionPolicyInput): boolean {
  return input.recentActions.some((action) =>
    action.queueItemId === input.queueItem.id &&
    (action.outcome === 'handoff' || action.outcome === 'written-back'),
  );
}

export function checkBrandCommandExecution(
  input: BrandCommandExecutionPolicyInput,
): BrandCommandExecutionPolicyResult {
  if (input.queueItem.status !== 'ready') return { allowed: true, issues: [] };

  const decisionIssues = input.campaignCell?.decisionChecks
    .filter((check) => check.status !== 'passed')
    .map((check) => `${check.label}：${check.message}`) ?? [];
  const text = combinedText(input);
  const hasCompetitorSignal = /竞品|竞对|对标/.test(text);
  const hasCompetitorBoundary = /竞品|竞对|不可搬运|禁止复制|差异化/.test((input.resourceBundle?.constraints ?? []).join(' '));
  const materialRequired = isProductionAction(input.queueItem.actionType);
  const sopRequired = input.queueItem.actionType === 'launch-sop-run';
  const materialCoverageRequired = input.queueItem.actionType === 'write-back-material-coverage';
  const issues = [
    input.resourceBundle ? '' : '找不到动作绑定的资源包，不能执行交接。',
    input.campaignCell ? '' : '找不到动作绑定的作战单元，不能执行交接。',
    input.resourceBundle?.evidenceRefs.length ? '' : '资源包缺少可追溯证据。',
    materialRequired && !(input.resourceBundle?.materialRefs.length) ? '资源包缺少可用素材，不能直接交接生产。' : '',
    sopRequired && !(input.resourceBundle?.sopRefs.length) ? '资源包没有绑定可运行 SOP，不能启动 SOP。' : '',
    materialCoverageRequired && !(input.resourceBundle?.sourceKnowledgeMapId || input.record.sourceKnowledgeMapId) ? '资源包没有绑定内容知识地图，不能回写素材覆盖。' : '',
    materialCoverageRequired && !(input.resourceBundle?.materialRefs.length) ? '资源包缺少可回写素材，不能更新素材覆盖。' : '',
    input.resourceBundle?.constraints.length || input.record.constraints.length ? '' : '缺少品牌边界、禁用表达或平台规则检查。',
    materialRequired && !hasPlatformRule(input) ? '缺少平台规则或渠道发布边界，不能执行队列动作。' : '',
    canExecuteAction(input.actorRole, input.queueItem.actionType) ? '' : `当前团队角色 ${input.actorRole} 无权执行该动作。`,
    input.resourceBundle?.gaps.length ? `资源包仍有缺口：${input.resourceBundle.gaps.slice(0, 3).join(' / ')}` : '',
    input.campaignCell?.channels.length ? '' : '作战单元缺少目标渠道。',
    hasCompetitorSignal && !hasCompetitorBoundary ? '包含竞品或对标信号，但缺少不可搬运边界。' : '',
    alreadyExecuted(input) ? '该队列动作已经记录过交接结果，不能重复执行。' : '',
    ...decisionIssues,
  ].filter(Boolean);

  return {
    allowed: issues.length === 0,
    issues,
    recoveryAction: issues.length ? '先补齐证据、素材、品牌边界或改写风险内容，再重新记录交接。' : undefined,
  };
}
