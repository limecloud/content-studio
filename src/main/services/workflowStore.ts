import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import type {
  CreateWorkflowDraftInput,
  KnowledgeCitation,
  RecordWorkflowManualEventInput,
  StartWorkflowRunInput,
  WorkflowDefinition,
  WorkflowInputField,
  WorkflowRunRecord,
  WorkflowRunStep,
  WorkflowStepDefinition,
} from '../../shared/types';
import { readJsonFile, writeJsonFile } from './jsonStore';
import { getWorkspaceDataDir } from './paths';

function definitionsFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'workflow-definitions.json');
}

function runsFilePath(workspacePath: string): string {
  return join(getWorkspaceDataDir(workspacePath), 'workflow-runs.json');
}

function baseInputSchema(): WorkflowInputField[] {
  return [
    {
      key: 'source',
      label: '补充资料说明',
      type: 'textarea',
      help: '资料来源优先在执行页勾选；这里只补充本次口径、平台、限制或未登记的临时说明。',
    },
    {
      key: 'intent',
      label: '用户意图',
      type: 'textarea',
      required: true,
      help: '描述本次要生成的内容目标、平台和限制条件。',
    },
    {
      key: 'reviewOwner',
      label: '审核人',
      type: 'text',
      help: '记录人工审核责任人，客户端本地执行时可为空。',
    },
  ];
}

function isRequiredWorkflowInput(field: WorkflowInputField): boolean {
  return field.required === true || field.key === 'intent';
}

function missingRequiredInputs(
  definition: WorkflowDefinition,
  inputs: Record<string, string>,
  inputSourceIds: string[],
): string[] {
  const missing = definition.inputSchema
    .filter((field) => field.key !== 'source' && isRequiredWorkflowInput(field) && !inputs[field.key]?.trim())
    .map((field) => field.label);
  const sourceText = inputs.source?.trim() ?? '';
  if (!sourceText && inputSourceIds.length === 0 && definition.inputSchema.some((field) => field.key === 'source')) {
    return ['资料来源', ...missing];
  }
  return missing;
}

function citationDigest(citations: KnowledgeCitation[]): Array<Record<string, string>> {
  return citations.slice(0, 6).map((citation, index) => ({
    index: String(index + 1),
    knowledgeBaseId: citation.knowledgeBaseId,
    sectionId: citation.sectionId,
    title: citation.title,
    sectionType: citation.sectionType,
    excerpt: previewText(citation.excerpt, 160),
  }));
}

function step(
  id: string,
  title: string,
  kind: WorkflowStepDefinition['kind'],
  description: string,
  dependsOn: string[],
  outputKeys: string[],
  blockedReason?: string,
): WorkflowStepDefinition {
  return { id, title, kind, description, dependsOn, outputKeys, blockedReason };
}

function seedDefinitions(workspacePath: string, now: string): WorkflowDefinition[] {
  return [
    {
      id: 'workflow-brand-scene-prompts',
      workspacePath,
      key: 'brand-scene-prompts',
      version: 'v0.1',
      title: '品牌知识库场景提示词 SOP',
      description: '从品牌 / 产品知识库引用抽取品牌知识库、提示词包、场景库和场景 Prompt 组，沉淀为可复用 SOP。',
      status: 'published',
      priority: 'P0',
      inputSchema: baseInputSchema(),
      steps: [
        step('input_register', '登记输入源', 'input', '记录知识引用、用户意图和审核责任人。', [], ['InputSource']),
        step('brand_extract', '抽取品牌知识库', 'build-brand-knowledge-base', '基于知识引用抽取品牌知识库六层、卖点和合规边界。', ['input_register'], ['BrandKnowledgeBase']),
        step('prompt_pack', '生成提示词包', 'generate-prompt-pack', '从知识引用生成品牌口吻、视觉风格和平台约束。', ['brand_extract'], ['PromptPack']),
        step('scene_library', '生成场景库', 'generate-scene-library', '把提示词包转成结构化场景卡。', ['prompt_pack'], ['SceneCard[]']),
        step('prompt_group', '生成提示词组', 'generate-prompt-group', '基于场景卡和用户意图输出可直接下游使用的 Prompt 草稿。', ['scene_library'], ['PromptDraft']),
        step('human_review', '人工审核', 'review', '确认场景、提示词和下游用途。', ['prompt_group'], ['ReviewResult']),
        step('asset_store', '入历史', 'asset-store', '保存品牌知识库、场景库和 Prompt 草稿引用。', ['human_review'], ['RunArchive']),
      ],
      reviewRules: ['品牌知识库必须回到知识引用，不得编造卖点。', '场景卡必须保留合规边界和输出用途。', 'Prompt 组必须可直接进入图片 / 视频 / 文案下游。'],
      outputSpec: ['BrandKnowledgeBase', 'PromptPack', 'SceneCard[]', 'PromptDraft', 'RunArchive'],
      tags: ['品牌', '场景库', 'Prompt组'],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      id: 'workflow-xiaohongshu-seeding-image',
      workspacePath,
      key: 'xiaohongshu-seeding-image',
      version: 'v0.2',
      title: '小红书种草图 SOP',
      description: '产品图、参考图和产品资料进入对标反推，再生成结构化 Prompt、图片候选、审核结果和素材库记录。',
      status: 'published',
      priority: 'P0',
      inputSchema: [
        ...baseInputSchema(),
        { key: 'platform', label: '平台', type: 'select', options: ['小红书', '抖音图文', '详情页'], required: true },
      ],
      steps: [
        step('input_register', '登记输入源', 'input', '记录产品图、参考图、产品资料和用户意图。', [], ['InputSource']),
        step('reference_reverse', '对标图反推', 'reference-reverse', '反推构图、光线、留白区和可复用风格，不复制竞品元素。', ['input_register'], ['ReferenceAnalysis']),
        step('prompt_generate', '生成图片 Prompt', 'prompt-generate', '结合品牌事实、场景库和反推结果生成可编辑 Prompt。', ['reference_reverse'], ['PromptVersion']),
        step('image_generate', '图片生成', 'image-generate', '调用真实图片 provider 生成候选图；未配置时必须 blocked。', ['prompt_generate'], ['ImageArtifact']),
        step('human_review', '人工审核', 'review', '检查事实、合规、文字可读性和 AI 味。', ['image_generate'], ['ReviewResult']),
        step('asset_store', '入素材库', 'asset-store', '通过审核后写入素材库和来源追溯。', ['human_review'], ['AssetRecord']),
      ],
      reviewRules: ['不复制竞品 Logo / 包装可识别元素。', '不得编造产品功效和背书。', '图片文字必须可读，无法确认时进入人工审核。'],
      outputSpec: ['图片候选', 'PromptVersion', 'ReviewResult', 'AssetRecord'],
      tags: ['图片', '小红书', '对标反推'],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      id: 'workflow-product-commercial-assets',
      workspacePath,
      key: 'product-commercial-assets',
      version: 'v0.1',
      title: '产品商业素材 SOP',
      description: '把产品 brief、SKU 表和参考详情页整理成主图、卖点图和详情页模块 Prompt，再进入真实图片生成、审核和素材库。',
      status: 'published',
      priority: 'P1',
      inputSchema: [
        ...baseInputSchema(),
        { key: 'platform', label: '电商平台', type: 'select', options: ['天猫 / 淘宝', '抖音小店', '小红书店铺', '京东', '通用电商'], required: true },
      ],
      steps: [
        step('input_register', '登记产品资料', 'input', '记录产品 brief、SKU 表、参考详情页和本次素材目标。', [], ['InputSource']),
        step('product_brief_structure', '结构化产品资料', 'structure-product-brief', '从产品资料和 SKU 表整理产品名、卖点、规格、场景和禁用表达，字段缺失时阻塞补齐。', ['input_register'], ['ProductBrief', 'PromptPlan']),
        step('prompt_generate', '生成商业图片 Prompt', 'prompt-generate', '输出主图、卖点图和详情页模块三类可编辑 Prompt，并保留 SKU / 输入源追溯。', ['product_brief_structure'], ['PromptVersion']),
        step('image_generate', '图片生成', 'image-generate', '调用真实图片 provider 生成候选图；未配置时必须 blocked。', ['prompt_generate'], ['ImageArtifact']),
        step('human_review', '人工审核', 'review', '审核卖点事实、SKU 追溯、画面可用性和合规边界。', ['image_generate'], ['ReviewResult']),
        step('asset_store', '入素材库', 'asset-store', '通过审核后写入素材库，并保留产品资料、SKU 行和 Prompt 版本来源。', ['human_review'], ['AssetRecord']),
      ],
      reviewRules: ['不得编造产品卖点、功效、背书或 SKU 信息。', '每个图片 Prompt 必须能追溯到产品资料、SKU 行或参考详情页。', '不得使用治疗承诺、绝对化表达和无法证实的对比。'],
      outputSpec: ['ProductBrief', 'ProductBriefPromptPlan', 'PromptDraft', 'ImageArtifact', 'ReviewResult', 'AssetRecord'],
      tags: ['产品资料', '电商', '商业素材'],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      id: 'workflow-feedback-topic-matrix',
      workspacePath,
      key: 'feedback-topic-matrix',
      version: 'v0.1',
      title: '评论痛点选题 SOP',
      description: '从评论、差评、客服问题和私信原声聚类痛点，生成选题方向、客服异议话术和后续文案 Prompt。',
      status: 'published',
      priority: 'P2',
      inputSchema: [
        ...baseInputSchema(),
        { key: 'platform', label: '内容平台', type: 'select', options: ['小红书', '抖音', '视频号', '公众号', '私域', '通用'], required: true },
      ],
      steps: [
        step('input_register', '登记评论原声', 'input', '记录评论、差评、客服问题、私信和本次选题目标。', [], ['InputSource']),
        step('feedback_cluster', '聚类用户痛点', 'cluster-user-feedback', '把真实用户语言整理为痛点矩阵、选题方向、推荐标签和客服异议话术。', ['input_register'], ['FeedbackPainPointInsight']),
        step('prompt_generate', '生成选题文案 Prompt', 'prompt-generate', '把痛点矩阵转成可编辑的标题、脚本或文章 Prompt 草稿。', ['feedback_cluster'], ['PromptVersion']),
        step('human_review', '人工审核', 'review', '确认选题方向、用户原声、客服边界和合规表达。', ['prompt_generate'], ['ReviewResult']),
        step('asset_store', '入历史', 'asset-store', '保存痛点矩阵、Prompt 草稿、标签和输入源追溯。', ['human_review'], ['RunArchive']),
      ],
      reviewRules: ['痛点和标题方向必须来自真实评论、差评、客服问题或私信原声。', '客服话术必须保留人工复核边界，不替代专业建议。', '不得制造未出现的痛点、竞品结论或功效承诺。'],
      outputSpec: ['FeedbackPainPointInsight', 'TitleDirection[]', 'ObjectionResponse[]', 'PromptDraft', 'RunArchive'],
      tags: ['评论', '痛点', '选题'],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      id: 'workflow-green-screen-card-package',
      workspacePath,
      key: 'green-screen-card-package',
      version: 'v0.1',
      title: '绿幕文案图 SOP',
      description: '把口播脚本、卖点列表或 CTA 文案拆成标题卡、卖点卡和行动卡，生成本地 9:16 绿幕 SVG 并进入人工审核。',
      status: 'published',
      priority: 'P1',
      inputSchema: [
        ...baseInputSchema(),
        { key: 'duration', label: '默认时长', type: 'number', required: true, help: '每张绿幕卡建议 3-5 秒。' },
      ],
      steps: [
        step('input_register', '登记脚本 / 卖点', 'input', '记录口播脚本、卖点列表、CTA 和本次混剪用途。', [], ['InputSource']),
        step('prompt_generate', '生成绿幕文案 Prompt', 'prompt-generate', '把脚本或卖点整理为可拆卡的绿幕文案 Prompt 草稿。', ['input_register'], ['PromptVersion']),
        step('overlay_cards', '生成绿幕文案图', 'overlay-generate', '从脚本 / 卖点拆出标题卡、卖点卡和 CTA 卡，本地生成 9:16 绿幕 SVG。', ['prompt_generate'], ['OverlayCards']),
        step('human_review', '人工审核', 'review', '审核绿幕文案图是否可读、时长是否合理、是否可进入混剪包。', ['overlay_cards'], ['ReviewResult']),
        step('asset_store', '入素材库', 'asset-store', '通过审核后写入素材库，作为混剪包 overlay 候选素材。', ['human_review'], ['AssetRecord']),
      ],
      reviewRules: ['绿幕卡文案必须来自脚本、卖点或用户意图，不凭空制造承诺。', '文案过长必须拆分，不能强行塞进单张卡。', '进入混剪包前必须人工确认可读性、时长和 Prompt 来源。'],
      outputSpec: ['PromptDraft', 'OverlayCards', 'ReviewResult', 'AssetRecord'],
      tags: ['绿幕文案图', '视频', '混剪'],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      id: 'workflow-ip-longform',
      workspacePath,
      key: 'ip-longform',
      version: 'v0.2',
      title: '公众号 IP 内容 SOP',
      description: '先抽取 IP 六层知识库，再由 Claude SDK Agent 读取 IP 知识库和用户意图，追问缺口后生成结构化长文草稿。',
      status: 'published',
      priority: 'P0',
      inputSchema: baseInputSchema(),
      steps: [
        step('input_register', '登记输入源', 'input', '记录 IP 知识库、选题、读者和约束。', [], ['InputSource']),
        step('ip_extract', '抽取 IP 知识库', 'build-ip-knowledge-base', '基于 IP 知识引用抽取身份、价值观、语言、判断、素材和创作引擎六层。', ['input_register'], ['IpKnowledgeBase']),
        step('agent_read', 'Agent 读取知识库', 'agent-read', '读取 IP 六层知识库、输入源和用户意图，识别缺口后生成首版草稿。', ['ip_extract'], ['KnowledgeMap']),
        step('prompt_generate', '生成文章 Prompt', 'prompt-generate', '结合知识缺口和用户意图生成正文提示词。', ['agent_read'], ['PromptVersion']),
        step('human_review', '人工审核', 'review', '确认人设口吻、观点边界和事实引用。', ['prompt_generate'], ['ReviewResult']),
        step('asset_store', '入历史', 'asset-store', '保存 Prompt、草稿和引用来源。', ['human_review'], ['RunArchive']),
      ],
      reviewRules: ['IP 观点必须回到知识库原文或用户确认。', '缺少案例时应追问，不编故事。', '语言风格不得和 IP 声音层冲突。'],
      outputSpec: ['KnowledgeMap', 'PromptVersion', 'MarkdownDraft', 'RunArchive'],
      tags: ['文案', 'IP', '公众号'],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      id: 'workflow-video-material-package',
      workspacePath,
      key: 'video-material-package',
      version: 'v0.2',
      title: '视频素材包 SOP',
      description: '生成 15 秒视频 Prompt、绿幕文案图和混剪 manifest；第三方视频生成后手动导入成品素材。',
      status: 'published',
      priority: 'P1',
      inputSchema: [
        ...baseInputSchema(),
        { key: 'duration', label: '单条素材秒数', type: 'number', required: true, help: '当前建议 15 秒。' },
      ],
      steps: [
        step('input_register', '登记输入源', 'input', '记录图片素材、脚本、场景库和第三方平台选择。', [], ['InputSource']),
        step('prompt_generate', '生成视频 Prompt', 'video-prompt', '输出可复制到第三方平台的 15 秒视频 Prompt。', ['input_register'], ['VideoPrompt']),
        step('prompt_copy', '复制到第三方平台', 'manual-video-prompt-copy', '记录人工复制 Prompt 到 RunningHub / Vidu / Runway 等平台，不在软件内创建外部任务。', ['prompt_generate'], ['PromptCopyTrace']),
        step('finished_video_import', '导入成品视频', 'manual-video-import', '第三方平台生成完成后，手动导入本地 15 秒视频素材并关联原 Prompt。', ['prompt_copy'], ['FinishedVideoInputSource']),
        step('overlay_cards', '生成绿幕文案图', 'overlay-generate', '从视频 Prompt / 脚本拆出标题卡、卖点卡、金句卡和 CTA 卡，本地生成 9:16 绿幕 SVG。', ['finished_video_import'], ['OverlayCards']),
        step('human_review', '人工审核', 'review', '审核成品视频、绿幕卡和图片素材是否可进入混剪包。', ['overlay_cards'], ['ReviewResult']),
        step('export_manifest', '导出混剪包', 'export', '导出素材文件夹和 manifest，交给第三方混剪软件。', ['human_review'], ['MixManifest']),
      ],
      reviewRules: ['视频生成平台不在本软件创建任务，只记录 Prompt 和手动导入结果。', 'manifest 必须保留 PromptRef 和输入源。'],
      outputSpec: ['VideoPrompt', 'OverlayImages', 'MixManifest'],
      tags: ['视频', '混剪', 'manifest'],
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
  ];
}

function customDraftDefinition(workspacePath: string, now: string): WorkflowDefinition {
  return {
    id: 'workflow-custom-sop-draft-source',
    workspacePath,
    key: 'custom-sop',
    version: 'v0.1',
    title: '自定义 SOP',
    description: '从 PromptDraft 或人工方法论沉淀的通用 SOP 草案，发布前必须确认输入、步骤、审核和导出规则。',
    status: 'draft',
    priority: 'P2',
    inputSchema: baseInputSchema(),
    steps: [
      step('input_register', '登记输入源', 'input', '记录本次 SOP 需要读取的文档、素材、用户意图和审核责任人。', [], ['InputSource']),
      step('agent_read', 'Agent 读取和追问', 'agent-read', '读取输入源和用户意图，识别缺口并沉淀可执行方法。', ['input_register'], ['AgentSession']),
      step('prompt_generate', '生成 Prompt / 执行草稿', 'prompt-generate', '根据已确认的方法生成可下游执行的 Prompt 或操作草稿。', ['agent_read'], ['PromptDraft']),
      step('human_review', '人工审核', 'review', '确认事实来源、步骤顺序、下游边界和交付标准。', ['prompt_generate'], ['ReviewResult']),
      step('asset_store', '归档为可复用 SOP', 'asset-store', '保存输入源、Prompt 版本、审核结论和后续产物引用。', ['human_review'], ['RunArchive']),
    ],
    reviewRules: [
      '不得把未验证的方法直接发布为正式 SOP。',
      '必须保留输入源、用户意图、Prompt 版本和人工审核记录。',
      '如果包含图片、视频或混剪步骤，必须明确真实 provider、手工交接或 blocked 边界。',
    ],
    outputSpec: ['InputSource', 'AgentSession', 'PromptDraft', 'ReviewResult', 'RunArchive'],
    tags: ['自定义', 'PromptDraft', 'SOP'],
    createdAt: now,
    updatedAt: now,
  };
}

function sortDefinitions(definitions: WorkflowDefinition[]): WorkflowDefinition[] {
  const statusRank = { published: 0, draft: 1, archived: 2 };
  return [...definitions].sort((a, b) => {
    const statusDelta = statusRank[a.status] - statusRank[b.status];
    if (statusDelta !== 0) return statusDelta;
    return b.updatedAt.localeCompare(a.updatedAt);
  });
}

function sameBuiltinDefinition(a: WorkflowDefinition, b: WorkflowDefinition): boolean {
  return a.id === b.id || a.key === b.key;
}

function workflowKeyMatches(key: string, baseKey: string): boolean {
  return key === baseKey || key.startsWith(`${baseKey}-draft-`);
}

function isBrandSceneWorkflow(run: WorkflowRunRecord): boolean {
  return workflowKeyMatches(run.workflowKey, 'brand-scene-prompts');
}

function isXiaohongshuImageWorkflow(run: WorkflowRunRecord): boolean {
  return workflowKeyMatches(run.workflowKey, 'xiaohongshu-seeding-image');
}

function isIpLongformWorkflow(run: WorkflowRunRecord): boolean {
  return workflowKeyMatches(run.workflowKey, 'ip-longform');
}

function isVideoMaterialWorkflow(run: WorkflowRunRecord): boolean {
  return workflowKeyMatches(run.workflowKey, 'video-material-package');
}

function mergeSeedDefinitions(existing: WorkflowDefinition[], seeded: WorkflowDefinition[]): {
  definitions: WorkflowDefinition[];
  changed: boolean;
} {
  let changed = false;
  const next = [...existing];
  for (const seed of seeded) {
    const index = next.findIndex((definition) => sameBuiltinDefinition(definition, seed));
    if (index < 0) {
      next.push(seed);
      changed = true;
      continue;
    }
    const current = next[index];
    if (current.id === seed.id && current.version !== seed.version) {
      next[index] = {
        ...seed,
        createdAt: current.createdAt,
        updatedAt: seed.updatedAt,
      };
      changed = true;
    }
  }
  return { definitions: next.slice(0, 80), changed };
}

function sortRuns(runs: WorkflowRunRecord[]): WorkflowRunRecord[] {
  return [...runs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function defaultInputs(definition: WorkflowDefinition, inputs?: Record<string, string>): Record<string, string> {
  return Object.fromEntries(definition.inputSchema.map((field) => [field.key, String(inputs?.[field.key] ?? '')]));
}

function previewText(value?: string, limit = 180): string {
  const normalized = value?.replace(/\s+/g, ' ').trim() ?? '';
  if (!normalized) return '未填写';
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, limit)}…`;
}

function compactInputs(inputs: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(inputs)
      .filter(([, value]) => Boolean(String(value).trim()))
      .map(([key, value]) => [key, String(value).trim()]),
  );
}

function buildStepInputSnapshot(
  definition: WorkflowDefinition,
  step: WorkflowStepDefinition,
  inputs: Record<string, string>,
  citations: KnowledgeCitation[],
  inputSourceIds: string[],
): Record<string, unknown> {
  return {
    workflowKey: definition.key,
    stepId: step.id,
    stepKind: step.kind,
    dependsOn: step.dependsOn,
    outputKeys: step.outputKeys,
    submittedInputs: compactInputs(inputs),
    selectedInputSourceIds: inputSourceIds,
    selectedCitations: citationDigest(citations),
    focus: {
      source: previewText(inputs.source),
      intent: previewText(inputs.intent),
      reviewOwner: previewText(inputs.reviewOwner, 80),
    },
  };
}

function buildStepOutputSnapshot(
  definition: WorkflowDefinition,
  step: WorkflowStepDefinition,
  inputs: Record<string, string>,
  status: WorkflowRunStep['status'],
  missingRequired: string[],
): Record<string, unknown> {
  if (missingRequired.length > 0) {
    return {
      summary: `缺少必填字段：${missingRequired.join('、')}`,
      missingRequired,
      action: 'wait-for-input',
      outputKeys: step.outputKeys,
    };
  }

  if (status === 'blocked') {
    return {
      summary: step.blockedReason ?? '当前步骤阻塞。',
      blockedReason: step.blockedReason ?? 'WORKFLOW_STEP_BLOCKED',
      action: 'wait-for-executor',
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'input') {
    return {
      summary: '已登记输入，保留输入源、用户意图和审核责任人。',
      inputDigest: {
        source: previewText(inputs.source, 240),
        intent: previewText(inputs.intent, 240),
        reviewOwner: previewText(inputs.reviewOwner, 80),
      },
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'build-brand-knowledge-base') {
    return {
      summary: '已从知识引用抽取品牌知识库，保留卖点、合规边界和场景种子。',
      sourceDigest: previewText(inputs.source, 240),
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'build-ip-knowledge-base') {
    return {
      summary: '已从 IP 知识引用抽取六层知识库，保留场景延伸和缺口。',
      sourceDigest: previewText(inputs.source, 240),
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'structure-product-brief') {
    return {
      summary: '已进入产品资料结构化步骤，等待整理产品变量、SKU 和 Prompt 计划。',
      sourceDigest: previewText(inputs.source, 240),
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'cluster-user-feedback') {
    return {
      summary: '已进入评论痛点聚类步骤，等待整理用户问题矩阵、选题方向和客服异议话术。',
      sourceDigest: previewText(inputs.source, 240),
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'generate-prompt-pack') {
    return {
      summary: '已把知识引用整理为品牌提示词包，供场景库和下游 Prompt 组复用。',
      sourceDigest: previewText(inputs.source, 240),
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'generate-scene-library') {
    return {
      summary: '已生成结构化场景库，向下游输出场景卡和可复用画面建议。',
      sourceDigest: previewText(inputs.source, 240),
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'generate-prompt-group') {
    return {
      summary: '已基于场景卡生成可直接进入图片 / 视频 / 文案下游的 Prompt 草稿。',
      sourceDigest: previewText(inputs.source, 240),
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'agent-read') {
    return {
      summary: 'Agent 读取知识体系和输入源，提取用于后续 Prompt 生成的事实、限制和风格。',
      sourceDigest: previewText(inputs.source, 240),
      intentDigest: previewText(inputs.intent, 240),
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'reference-reverse') {
    return {
      summary: '参考图 / 对标资料进入视觉反推轨道，等待人工确认后进入 Prompt 草稿。',
      referenceDigest: previewText(inputs.source, 240),
      visualFocus: '构图、光线、留白区、镜头感和真实感',
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'prompt-generate') {
    return {
      summary: '生成可下游复制的 Prompt 草稿，保留事实来源和合规边界。',
      promptIntent: previewText(inputs.intent, 240),
      platformHint: previewText(inputs.platform, 80),
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'image-generate') {
    return {
      summary: '调用真实图片 provider 生成候选图；未配置时应保持 blocked。',
      providerMode: 'image-provider',
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'video-prompt') {
    return {
      summary: '生成可复制到第三方平台的视频 Prompt，不在软件内创建外部任务。',
      providerMode: 'manual-copy',
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'manual-video-prompt-copy') {
    return {
      summary: '等待人工复制 Prompt 到第三方视频生成平台，只记录复制动作和目标平台。',
      providerMode: 'manual-copy',
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'manual-video-import') {
    return {
      summary: '等待用户把第三方平台生成的成品视频导入软件，并关联原视频 Prompt。',
      providerMode: 'manual-import',
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'overlay-generate') {
    return {
      summary: '等待从 Prompt 或脚本生成本地绿幕文案图，产物进入混剪候选素材。',
      providerMode: 'local-overlay',
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'review') {
    return {
      summary: '人工审核结果会决定通过、驳回、重生成还是入库。',
      reviewRules: definition.reviewRules,
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'asset-store') {
    return {
      summary: '通过审核后进入素材库，并保留 runId、stepId 和来源引用。',
      destination: 'asset-library',
      outputKeys: step.outputKeys,
    };
  }

  if (step.kind === 'export') {
    return {
      summary: '导出可交给第三方混剪软件的素材包与 manifest。',
      destination: 'mix-package',
      outputKeys: step.outputKeys,
    };
  }

  return {
    summary: '步骤已进入运行记录，等待真实执行器接入。',
    outputKeys: step.outputKeys,
  };
}

function runSteps(
  definition: WorkflowDefinition,
  inputs: Record<string, string>,
  citations: KnowledgeCitation[],
  inputSourceIds: string[],
  missingRequired: string[],
  now: string,
  runId: string,
): { steps: WorkflowRunStep[]; artifactRefs: string[] } {
  const blockedIndex = definition.steps.findIndex((item) => item.blockedReason);
  const artifactRefs = new Set<string>();

  const steps = definition.steps.map((item, index) => {
    let status: WorkflowRunStep['status'];
    let summary: string;
    let error: string | undefined;

    if (missingRequired.length > 0) {
      status = index === 0 ? 'blocked' : 'queued';
      summary = index === 0
        ? `缺少必填字段：${missingRequired.join('、')}`
        : '等待输入补齐后执行。';
      error = index === 0 ? 'WORKFLOW_REQUIRED_INPUT_MISSING' : undefined;
    } else if (blockedIndex >= 0 && index === blockedIndex) {
      status = 'blocked';
      summary = item.blockedReason ?? '当前步骤阻塞。';
      error = 'WORKFLOW_STEP_EXECUTOR_NOT_CONNECTED';
    } else if (index === 0) {
      status = 'succeeded';
      summary = `已登记输入，等待「${definition.steps[1]?.title ?? '后续步骤'}」继续处理。`;
      error = undefined;
    } else if (blockedIndex >= 0 && index > blockedIndex) {
      status = 'queued';
      summary = '等待前序步骤和阻塞项恢复。';
      error = undefined;
    } else {
      status = 'queued';
      summary = '已进入运行记录，等待后续步骤执行。';
      error = undefined;
    }

    const stepArtifactRef = `workflow-run:${runId}:step:${item.id}`;
    artifactRefs.add(stepArtifactRef);
    const record: WorkflowRunStep = {
      stepId: item.id,
      title: item.title,
      status,
      summary,
      input: buildStepInputSnapshot(definition, item, inputs, citations, inputSourceIds),
      output: buildStepOutputSnapshot(definition, item, inputs, status, missingRequired),
      error,
      startedAt: status === 'succeeded' || status === 'blocked' ? now : undefined,
      completedAt: status === 'succeeded' || status === 'blocked' ? now : undefined,
    };

    return record;
  });

  return { steps, artifactRefs: Array.from(artifactRefs) };
}

function outputObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function updateStep(
  run: WorkflowRunRecord,
  stepId: string,
  patch: {
    status: WorkflowRunStep['status'];
    summary: string;
    output?: Record<string, unknown>;
    error?: string;
    completed?: boolean;
  },
  now: string,
): WorkflowRunRecord {
  if (!run.steps.some((stepItem) => stepItem.stepId === stepId)) {
    throw new Error(`运行记录缺少步骤：${stepId}`);
  }
  return {
    ...run,
    steps: run.steps.map((stepItem) => {
      if (stepItem.stepId !== stepId) return stepItem;
      return {
        ...stepItem,
        status: patch.status,
        summary: patch.summary,
        output: { ...outputObject(stepItem.output), ...(patch.output ?? {}) },
        error: patch.error,
        startedAt: stepItem.startedAt ?? now,
        completedAt: patch.completed ?? patch.status === 'succeeded' ? now : stepItem.completedAt,
      };
    }),
  };
}

function queueStep(
  run: WorkflowRunRecord,
  stepId: string,
  summary: string,
  output: Record<string, unknown>,
  now: string,
): WorkflowRunRecord {
  const stepItem = run.steps.find((item) => item.stepId === stepId);
  if (!stepItem || stepItem.status === 'succeeded') return run;
  return updateStep(run, stepId, {
    status: 'queued',
    summary,
    output,
    completed: false,
  }, now);
}

function stepSucceeded(run: WorkflowRunRecord, stepId: string): boolean {
  return run.steps.find((stepItem) => stepItem.stepId === stepId)?.status === 'succeeded';
}

function finalizeManualRun(
  run: WorkflowRunRecord,
  fallbackSummary: string,
  now: string,
): WorkflowRunRecord {
  const failed = run.steps.find((stepItem) => stepItem.status === 'failed');
  if (failed) {
    return {
      ...run,
      status: 'failed',
      summary: `执行失败于「${failed.title}」：${failed.summary ?? failed.error ?? fallbackSummary}`,
      updatedAt: now,
    };
  }
  const blocked = run.steps.find((stepItem) => stepItem.status === 'blocked');
  if (blocked) {
    return {
      ...run,
      status: 'blocked',
      summary: `阻塞于「${blocked.title}」：${blocked.summary ?? blocked.error ?? fallbackSummary}`,
      updatedAt: now,
    };
  }
  const queued = run.steps.find((stepItem) => stepItem.status === 'queued');
  if (queued) {
    return {
      ...run,
      status: 'queued',
      summary: `视频素材包 SOP 已推进，下一步等待「${queued.title}」。`,
      updatedAt: now,
    };
  }
  return {
    ...run,
    status: 'succeeded',
    summary: '视频素材包 SOP 已完成：Prompt 复制、成品视频导入、绿幕文案图、人工审核和混剪 manifest 均已留痕。',
    updatedAt: now,
  };
}

function applyManualEvent(
  run: WorkflowRunRecord,
  input: RecordWorkflowManualEventInput,
): WorkflowRunRecord {
  const now = new Date().toISOString();
  let next = run;
  const refs: string[] = [];
  const summary = input.summary?.trim();

  if (input.event === 'video-prompt-copied') {
    if (input.promptDraftId) refs.push(`prompt-draft:${input.promptDraftId}`);
    next = updateStep(next, 'prompt_generate', {
      status: 'succeeded',
      summary: '已确认视频 PromptDraft，可复制到第三方视频平台。',
      output: {
        promptDraftId: input.promptDraftId,
        action: 'manual-prompt-draft-confirmed',
        confirmedAt: now,
      },
    }, now);
    next = updateStep(next, 'prompt_copy', {
      status: 'succeeded',
      summary: summary || '已记录 Prompt 复制动作，后续等待第三方平台生成完成并手动导入成品视频。',
      output: {
        promptDraftId: input.promptDraftId,
        action: 'manual-copy-to-third-party-video-platform',
        copiedAt: now,
      },
    }, now);
    next = queueStep(next, 'finished_video_import', '等待导入第三方平台生成后的本地成品视频。', {
      expectedPromptDraftId: input.promptDraftId,
    }, now);
  } else if (input.event === 'finished-video-imported') {
    if (input.inputSourceId) refs.push(`input-source:${input.inputSourceId}`);
    if (input.promptDraftId) refs.push(`prompt-draft:${input.promptDraftId}`);
    next = updateStep(next, 'finished_video_import', {
      status: 'succeeded',
      summary: summary || '已导入第三方平台生成的成品视频，并关联原视频 Prompt。',
      output: {
        inputSourceId: input.inputSourceId,
        promptDraftId: input.promptDraftId,
        importedAt: now,
      },
    }, now);
    next = queueStep(next, 'overlay_cards', '等待生成绿幕文案图并进入混剪候选素材。', {
      relatedInputSourceId: input.inputSourceId,
      relatedPromptDraftId: input.promptDraftId,
    }, now);
  } else if (input.event === 'overlay-cards-generated') {
    const overlayCardIds = input.overlayCardIds?.filter(Boolean) ?? [];
    refs.push(...overlayCardIds.map((id) => `overlay-card:${id}`));
    if (input.promptDraftId) refs.push(`prompt-draft:${input.promptDraftId}`);
    next = updateStep(next, 'overlay_cards', {
      status: 'succeeded',
      summary: summary || `已生成 ${overlayCardIds.length} 张绿幕文案图。`,
      output: {
        overlayCardIds,
        promptDraftId: input.promptDraftId,
        generatedAt: now,
      },
    }, now);
    next = queueStep(next, 'human_review', '等待人工审核视频、绿幕卡和素材是否可进入混剪包。', {
      overlayCardIds,
    }, now);
  } else if (input.event === 'asset-reviewed') {
    if (input.assetReviewId) refs.push(`asset-review:${input.assetReviewId}`);
    if (input.assetKey) refs.push(input.assetKey);
    if (!stepSucceeded(next, 'overlay_cards')) {
      next = queueStep(next, 'overlay_cards', '已记录部分素材审核结果，仍需先生成绿幕文案图后再统一审核混剪素材。', {
        action: 'waiting-overlay-before-mix-review',
        earlyAssetReviewId: input.assetReviewId,
        earlyAssetKey: input.assetKey,
        reviewedAt: now,
      }, now);
    } else {
      next = updateStep(next, 'human_review', {
        status: 'succeeded',
        summary: summary || '已记录人工审核结果，素材可进入混剪包导出。',
        output: {
          assetReviewId: input.assetReviewId,
          assetKey: input.assetKey,
          reviewedAt: now,
        },
      }, now);
      next = queueStep(next, 'export_manifest', '等待导出混剪包文件夹和 manifest。', {
        assetReviewId: input.assetReviewId,
        assetKey: input.assetKey,
      }, now);
    }
  } else if (input.event === 'asset-review-rejected') {
    if (input.assetReviewId) refs.push(`asset-review:${input.assetReviewId}`);
    if (input.assetKey) refs.push(input.assetKey);
    next = updateStep(next, 'human_review', {
      status: 'blocked',
      summary: summary || '素材审核已驳回，等待回炉重做后重新提交审核。',
      output: {
        assetReviewId: input.assetReviewId,
        assetKey: input.assetKey,
        action: 'asset-review-rejected',
        rejectedAt: now,
      },
      error: 'WORKFLOW_ASSET_REVIEW_REJECTED',
    }, now);
  } else if (input.event === 'asset-prompt-distilled') {
    if (input.inputSourceId) refs.push(`input-source:${input.inputSourceId}`);
    if (input.promptDraftId) refs.push(`prompt-draft:${input.promptDraftId}`);
    if (input.assetKey) refs.push(input.assetKey);
  } else if (input.event === 'mix-package-exported') {
    if (input.mixPackageId) refs.push(`mix-package:${input.mixPackageId}`);
    if (input.manifestPath) refs.push(input.manifestPath);
    if (input.manifestCsvPath) refs.push(input.manifestCsvPath);
    if (input.importGuidePath) refs.push(input.importGuidePath);
    if (input.packageDir) refs.push(input.packageDir);
    next = updateStep(next, 'export_manifest', {
      status: 'succeeded',
      summary: summary || '已导出混剪包文件夹和 manifest，可交给第三方混剪软件。',
      output: {
        mixPackageId: input.mixPackageId,
        manifestPath: input.manifestPath,
        manifestCsvPath: input.manifestCsvPath,
        importGuidePath: input.importGuidePath,
        packageDir: input.packageDir,
        exportedAt: now,
      },
    }, now);
  } else if (input.event === 'mix-package-import-verified') {
    if (input.mixPackageId) refs.push(`mix-package:${input.mixPackageId}`);
    if (input.externalImportEvidencePath) refs.push(input.externalImportEvidencePath);
    if (input.packageDir) refs.push(input.packageDir);
    next = updateStep(next, 'export_manifest', {
      status: 'succeeded',
      summary: summary || '已登记第三方混剪工具导入证据。',
      output: {
        mixPackageId: input.mixPackageId,
        externalImportEvidencePath: input.externalImportEvidencePath,
        packageDir: input.packageDir,
        verifiedAt: now,
      },
    }, now);
  }

  next = {
    ...next,
    artifactRefs: Array.from(new Set([...next.artifactRefs, ...refs.filter(Boolean)])),
  };
  return finalizeManualRun(next, summary || '已记录视频素材包 SOP 手工事件。', now);
}

function finalizeIpLongformManualRun(
  run: WorkflowRunRecord,
  fallbackSummary: string,
  now: string,
): WorkflowRunRecord {
  const failed = run.steps.find((stepItem) => stepItem.status === 'failed');
  if (failed) {
    return {
      ...run,
      status: 'failed',
      summary: `执行失败于「${failed.title}」：${failed.summary ?? failed.error ?? fallbackSummary}`,
      updatedAt: now,
    };
  }
  const blocked = run.steps.find((stepItem) => stepItem.status === 'blocked');
  if (blocked) {
    return {
      ...run,
      status: 'blocked',
      summary: `阻塞于「${blocked.title}」：${blocked.summary ?? blocked.error ?? fallbackSummary}`,
      updatedAt: now,
    };
  }
  const queued = run.steps.find((stepItem) => stepItem.status === 'queued');
  if (queued) {
    return {
      ...run,
      status: 'queued',
      summary: `公众号 IP 内容 SOP 已推进，下一步等待「${queued.title}」。`,
      updatedAt: now,
    };
  }
  return {
    ...run,
    status: 'succeeded',
    summary: '公众号 IP 内容 SOP 已完成：IP 知识库、Agent Prompt、文章草稿、人工确认和 Markdown 交付均已留痕。',
    updatedAt: now,
  };
}

function applyIpLongformManualEvent(
  run: WorkflowRunRecord,
  input: RecordWorkflowManualEventInput,
): WorkflowRunRecord {
  const now = new Date().toISOString();
  let next = run;
  const refs: string[] = [];
  const summary = input.summary?.trim();

  if (input.promptDraftId) refs.push(`prompt-draft:${input.promptDraftId}`);
  if (input.inputSourceId) refs.push(`input-source:${input.inputSourceId}`);
  if (input.generationLogId) refs.push(`generation-log:${input.generationLogId}`);

  if (input.event === 'article-draft-generated') {
    next = queueStep(next, 'human_review', summary || '文章草稿已生成，等待人工审核后导出 Markdown。', {
      promptDraftId: input.promptDraftId,
      generationLogId: input.generationLogId,
      action: 'article-draft-generated',
      generatedAt: now,
    }, now);
  } else if (input.event === 'article-markdown-exported') {
    if (input.exportPath) refs.push(input.exportPath);
    next = updateStep(next, 'human_review', {
      status: 'succeeded',
      summary: summary || '已人工确认文章草稿并导出 Markdown。',
      output: {
        promptDraftId: input.promptDraftId,
        generationLogId: input.generationLogId,
        exportPath: input.exportPath,
        reviewedAt: now,
      },
    }, now);
    next = updateStep(next, 'asset_store', {
      status: 'succeeded',
      summary: '已保存文章 Markdown、Prompt 和来源引用，后续可从历史和导出文件继续使用。',
      output: {
        promptDraftId: input.promptDraftId,
        generationLogId: input.generationLogId,
        exportPath: input.exportPath,
        archivedAt: now,
      },
    }, now);
  } else if (input.event === 'article-platform-draft-exported') {
    if (input.exportPath) refs.push(input.exportPath);
    if (input.manifestPath) refs.push(input.manifestPath);
    if (input.packageDir) refs.push(input.packageDir);
    next = updateStep(next, 'human_review', {
      status: 'succeeded',
      summary: summary || '已人工确认文章草稿并导出平台草稿包。',
      output: {
        promptDraftId: input.promptDraftId,
        generationLogId: input.generationLogId,
        exportPath: input.exportPath,
        manifestPath: input.manifestPath,
        packageDir: input.packageDir,
        reviewedAt: now,
      },
    }, now);
    next = updateStep(next, 'asset_store', {
      status: 'succeeded',
      summary: '已保存平台草稿包、正文 Markdown、发布前检查和来源追溯。',
      output: {
        promptDraftId: input.promptDraftId,
        generationLogId: input.generationLogId,
        exportPath: input.exportPath,
        manifestPath: input.manifestPath,
        packageDir: input.packageDir,
        archivedAt: now,
      },
    }, now);
  } else if (input.event === 'ip-scenario-extended') {
    // 只追加 IP 场景延伸产物引用，不改变长文 SOP 当前停顿节点。
  } else {
    throw new Error('当前手工事件不适用于公众号 IP 内容 SOP。');
  }

  next = {
    ...next,
    artifactRefs: Array.from(new Set([...next.artifactRefs, ...refs.filter(Boolean)])),
  };
  return finalizeIpLongformManualRun(next, summary || '已记录公众号 IP 内容 SOP 手工事件。', now);
}

function contentWorkflowCompletionSummary(run: WorkflowRunRecord): string {
  if (isBrandSceneWorkflow(run)) {
    return '品牌知识库场景提示词 SOP 已完成：品牌知识库、场景库、Prompt 草稿、人工审核和历史归档均已留痕。';
  }
  if (isXiaohongshuImageWorkflow(run)) {
    return '小红书种草图 SOP 已完成：对标反推、图片 Prompt、候选图、人工审核和素材入库均已留痕。';
  }
  return `${run.title} 已完成：审核、归档和来源引用均已留痕。`;
}

function finalizeContentManualRun(
  run: WorkflowRunRecord,
  fallbackSummary: string,
  now: string,
): WorkflowRunRecord {
  const failed = run.steps.find((stepItem) => stepItem.status === 'failed');
  if (failed) {
    return {
      ...run,
      status: 'failed',
      summary: `执行失败于「${failed.title}」：${failed.summary ?? failed.error ?? fallbackSummary}`,
      updatedAt: now,
    };
  }
  const blocked = run.steps.find((stepItem) => stepItem.status === 'blocked');
  if (blocked) {
    return {
      ...run,
      status: 'blocked',
      summary: `阻塞于「${blocked.title}」：${blocked.summary ?? blocked.error ?? fallbackSummary}`,
      updatedAt: now,
    };
  }
  const queued = run.steps.find((stepItem) => stepItem.status === 'queued');
  if (queued) {
    return {
      ...run,
      status: 'queued',
      summary: `${run.title} 已推进，下一步等待「${queued.title}」。`,
      updatedAt: now,
    };
  }
  return {
    ...run,
    status: 'succeeded',
    summary: contentWorkflowCompletionSummary(run),
    updatedAt: now,
  };
}

function applyContentManualEvent(
  run: WorkflowRunRecord,
  input: RecordWorkflowManualEventInput,
): WorkflowRunRecord {
  const now = new Date().toISOString();
  let next = run;
  const refs: string[] = [];
  const summary = input.summary?.trim();
  const archiveDestination = isXiaohongshuImageWorkflow(run) ? '素材库' : '历史';

  if (input.assetReviewId) refs.push(`asset-review:${input.assetReviewId}`);
  if (input.assetKey) refs.push(input.assetKey);
  const imageAssetRefs = input.assetRefs?.filter(Boolean) ?? [];

  if (input.event === 'asset-prompt-distilled') {
    if (input.inputSourceId) refs.push(`input-source:${input.inputSourceId}`);
    if (input.promptDraftId) refs.push(`prompt-draft:${input.promptDraftId}`);
  } else if (input.event === 'workflow-review-approved') {
    next = updateStep(next, 'human_review', {
      status: 'succeeded',
      summary: summary || '已人工确认本次 SOP 产物可进入归档。',
      output: {
        action: 'workflow-review-approved',
        reviewOwner: run.inputs.reviewOwner,
        approvedAt: now,
      },
    }, now);
    next = queueStep(next, 'asset_store', `等待把本次 SOP 产物写入${archiveDestination}并留痕。`, {
      action: 'waiting-workflow-archive',
      approvedAt: now,
    }, now);
  } else if (input.event === 'workflow-asset-archived') {
    if (run.steps.find((stepItem) => stepItem.stepId === 'human_review')?.status !== 'succeeded') {
      next = updateStep(next, 'human_review', {
        status: 'succeeded',
        summary: '已人工确认本次 SOP 产物可进入归档。',
        output: {
          action: 'workflow-review-approved',
          reviewOwner: run.inputs.reviewOwner,
          approvedAt: now,
        },
      }, now);
    }
    next = updateStep(next, 'asset_store', {
      status: 'succeeded',
      summary: summary || `已把本次 SOP 产物写入${archiveDestination}并保留来源追溯。`,
      output: {
        action: 'workflow-asset-archived',
        destination: archiveDestination,
        artifactRefs: run.artifactRefs,
        archivedAt: now,
      },
    }, now);
  } else if (input.event === 'image-candidates-generated') {
    if (input.generationLogId) refs.push(`generation-log:${input.generationLogId}`);
    refs.push(...imageAssetRefs);
    if (next.steps.some((stepItem) => stepItem.stepId === 'prompt_generate' && stepItem.status !== 'succeeded')) {
      next = updateStep(next, 'prompt_generate', {
        status: 'succeeded',
        summary: '已确认图片 Prompt，并在图片工作台执行生成。',
        output: {
          action: 'image-prompt-confirmed',
          generationLogId: input.generationLogId,
          confirmedAt: now,
        },
      }, now);
    }
    next = updateStep(next, 'image_generate', {
      status: 'succeeded',
      summary: summary || `已从图片工作台生成 ${imageAssetRefs.length || 1} 个候选图，并回写到本次 SOP。`,
      output: {
        action: 'image-candidates-generated',
        generationLogId: input.generationLogId,
        assetRefs: imageAssetRefs,
        generatedAt: now,
      },
    }, now);
    next = queueStep(next, 'human_review', '等待人工审核图片候选，通过、驳回或回炉。', {
      action: 'waiting-image-asset-review',
      generationLogId: input.generationLogId,
      assetRefs: imageAssetRefs,
    }, now);
  } else if (input.event === 'asset-reviewed') {
    next = updateStep(next, 'human_review', {
      status: 'succeeded',
      summary: summary || '已人工审核通过图片候选，并写入素材库。',
      output: {
        action: 'asset-reviewed',
        assetReviewId: input.assetReviewId,
        assetKey: input.assetKey,
        reviewedAt: now,
      },
    }, now);
    next = updateStep(next, 'asset_store', {
      status: 'succeeded',
      summary: '已把通过审核的图片素材写入素材库并保留运行来源。',
      output: {
        action: 'asset-store',
        assetReviewId: input.assetReviewId,
        assetKey: input.assetKey,
        archivedAt: now,
      },
    }, now);
  } else if (input.event === 'asset-review-rejected') {
    next = updateStep(next, 'human_review', {
      status: 'blocked',
      summary: summary || '图片候选已被人工驳回，等待回炉重做后重新提交审核。',
      output: {
        action: 'asset-review-rejected',
        assetReviewId: input.assetReviewId,
        assetKey: input.assetKey,
        rejectedAt: now,
      },
      error: 'WORKFLOW_ASSET_REVIEW_REJECTED',
    }, now);
  } else {
    throw new Error('当前手工事件不适用于该内容 SOP。');
  }

  next = {
    ...next,
    artifactRefs: Array.from(new Set([...next.artifactRefs, ...refs.filter(Boolean)])),
  };
  return finalizeContentManualRun(next, summary || '已记录内容 SOP 手工事件。', now);
}

function canApplyContentManualEvent(run: WorkflowRunRecord, input: RecordWorkflowManualEventInput): boolean {
  const eventSupported =
    input.event === 'workflow-review-approved'
    || input.event === 'workflow-asset-archived'
    || input.event === 'image-candidates-generated'
    || input.event === 'asset-reviewed'
    || input.event === 'asset-review-rejected'
    || input.event === 'asset-prompt-distilled';
  if (!eventSupported) return false;
  if (input.event === 'image-candidates-generated' && !run.steps.some((stepItem) => stepItem.stepId === 'image_generate')) {
    return false;
  }
  return run.steps.some((stepItem) => stepItem.stepId === 'human_review')
    && run.steps.some((stepItem) => stepItem.stepId === 'asset_store');
}

export class WorkflowStore {
  async listDefinitions(workspacePath: string): Promise<WorkflowDefinition[]> {
    const filePath = definitionsFilePath(workspacePath);
    const existing = await readJsonFile<WorkflowDefinition[]>(filePath, []);
    const seeded = seedDefinitions(workspacePath, new Date().toISOString());
    if (existing.length > 0) {
      const merged = mergeSeedDefinitions(existing, seeded);
      if (merged.changed) await writeJsonFile(filePath, merged.definitions);
      return sortDefinitions(merged.definitions);
    }

    await writeJsonFile(filePath, seeded);
    return sortDefinitions(seeded);
  }

  async createDraft(input: CreateWorkflowDraftInput): Promise<WorkflowDefinition> {
    const definitions = await this.listDefinitions(input.workspacePath);
    const now = new Date().toISOString();
    const source = input.templateKey
      ? definitions.find((item) => item.key === input.templateKey) ?? definitions[0]
      : customDraftDefinition(input.workspacePath, now);
    const draft: WorkflowDefinition = {
      ...source,
      id: randomUUID(),
      workspacePath: input.workspacePath,
      key: `${source.key}-draft-${Date.now()}`,
      version: 'v0.1',
      title: input.title?.trim() || `${source.title} 草案`,
      description: input.description?.trim() || source.description || '本地 SOP 草案，发布前必须确认输入、步骤、审核和导出规则。',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
      publishedAt: undefined,
    };
    await writeJsonFile(definitionsFilePath(input.workspacePath), [draft, ...definitions].slice(0, 80));
    return draft;
  }

  async updateDefinition(input: WorkflowDefinition): Promise<WorkflowDefinition> {
    const definitions = await this.listDefinitions(input.workspacePath);
    if (!definitions.some((item) => item.id === input.id)) throw new Error(`工作流定义不存在: ${input.id}`);
    const now = new Date().toISOString();
    const updated: WorkflowDefinition = {
      ...input,
      updatedAt: now,
      publishedAt: input.status === 'published' ? input.publishedAt ?? now : input.publishedAt,
    };
    await writeJsonFile(definitionsFilePath(input.workspacePath), definitions.map((item) => (item.id === input.id ? updated : item)));
    return updated;
  }

  async listRuns(workspacePath: string): Promise<WorkflowRunRecord[]> {
    return sortRuns(await readJsonFile<WorkflowRunRecord[]>(runsFilePath(workspacePath), []));
  }

  async updateRun(input: WorkflowRunRecord): Promise<WorkflowRunRecord> {
    const runs = await this.listRuns(input.workspacePath);
    if (!runs.some((run) => run.id === input.id)) throw new Error(`工作流运行记录不存在: ${input.id}`);
    const updated: WorkflowRunRecord = {
      ...input,
      artifactRefs: Array.from(new Set(input.artifactRefs)),
      updatedAt: new Date().toISOString(),
    };
    await writeJsonFile(
      runsFilePath(input.workspacePath),
      runs.map((run) => (run.id === input.id ? updated : run)),
    );
    return updated;
  }

  async recordManualEvent(input: RecordWorkflowManualEventInput): Promise<WorkflowRunRecord> {
    const runs = await this.listRuns(input.workspacePath);
    const run = runs.find((item) => item.id === input.workflowRunId);
    if (!run) throw new Error(`工作流运行记录不存在: ${input.workflowRunId}`);

    let updated: WorkflowRunRecord;
    if (isVideoMaterialWorkflow(run)) {
      updated = applyManualEvent(run, input);
    } else if (isIpLongformWorkflow(run)) {
      updated = applyIpLongformManualEvent(run, input);
    } else if (canApplyContentManualEvent(run, input)) {
      updated = applyContentManualEvent(run, input);
    } else {
      throw new Error('当前手工事件只适用于已接入回写的 SOP。');
    }

    await writeJsonFile(
      runsFilePath(input.workspacePath),
      runs.map((item) => (item.id === run.id ? updated : item)),
    );
    return updated;
  }

  async startRun(input: StartWorkflowRunInput): Promise<WorkflowRunRecord> {
    const definitions = await this.listDefinitions(input.workspacePath);
    const definition = definitions.find((item) => item.id === input.workflowDefinitionId);
    if (!definition) throw new Error(`工作流定义不存在: ${input.workflowDefinitionId}`);
    if (definition.status !== 'published') throw new Error('只有已发布的 SOP 定义可以运行。');

    const inputs = defaultInputs(definition, input.inputs);
    const citations = input.citations ?? [];
    const inputSourceIds = input.inputSourceIds ?? [];
    const missingRequired = missingRequiredInputs(definition, inputs, inputSourceIds);
    const now = new Date().toISOString();
    const runId = randomUUID();
    const firstBlocked = definition.steps.find((item) => item.blockedReason);
    const stepBundle = runSteps(definition, inputs, citations, inputSourceIds, missingRequired, now, runId);
    const run: WorkflowRunRecord = {
      id: runId,
      workspacePath: input.workspacePath,
      workflowDefinitionId: definition.id,
      workflowKey: definition.key,
      workflowVersion: definition.version,
      title: definition.title,
      status: missingRequired.length > 0 || firstBlocked ? 'blocked' : 'queued',
      summary: missingRequired.length > 0
        ? `缺少必填字段：${missingRequired.join('、')}`
        : firstBlocked
          ? `已保存运行记录，阻塞于「${firstBlocked.title}」：${firstBlocked.blockedReason}`
          : `已保存运行记录，等待后续步骤执行：${definition.steps.slice(1).map((item) => item.title).join(' / ') || '无后续步骤'}`,
      inputs,
      inputSourceIds,
      citations,
      steps: stepBundle.steps,
      artifactRefs: stepBundle.artifactRefs,
      createdAt: now,
      updatedAt: now,
    };
    const runs = await this.listRuns(input.workspacePath);
    await writeJsonFile(runsFilePath(input.workspacePath), [run, ...runs].slice(0, 200));
    return run;
  }
}
