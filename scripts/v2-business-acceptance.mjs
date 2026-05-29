import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { buildProviderCheckReport } from './v2-provider-check.mjs';
import { buildProductBriefPromptPlan, structureProductBriefSources } from '../src/shared/productBrief.ts';
import { buildScenePromptGroupContent } from '../src/shared/scenePromptComposer.ts';
import { clusterUserFeedbackSources } from '../src/shared/userFeedbackInsights.ts';

const DEFAULT_EXPECTATIONS = {
  ipLayerKeys: ['identity', 'values', 'language', 'methodology', 'materials', 'engine'],
  brandComplianceTerms: ['治疗', '绝对化'],
  productBriefFields: ['productName', 'sellingPoints', 'specsOrSku', 'scenarios', 'restrictions'],
  productBriefVariableTerms: ['产品名称', '卖点', '规格参数', '适用场景', '禁用表达', 'SKU 行数'],
  productBriefSkuMinimum: 1,
  productBriefPromptTypes: ['main-image', 'selling-point-image', 'detail-page-section'],
  productBriefPromptFields: ['type', 'title', 'prompt', 'sourceIds', 'sourceTrace', 'skuTrace', 'productName', 'sellingPoint', 'scenario', 'restrictions'],
  feedbackClusterKeys: ['price-trust', 'usage-friction', 'audience-fit', 'scenario-need'],
  feedbackMatrixFields: ['painPoint', 'audience', 'scenario', 'contentAngle'],
  feedbackTagMinimum: 2,
  feedbackTitleMinimum: 2,
  feedbackObjectionMinimum: 2,
  feedbackObjectionFields: ['painPoint', 'objection', 'response', 'evidence', 'boundary'],
  successfulAssetBoundaryTerms: ['已通过审核', '不复制竞品', '人工确认'],
  greenScreenCardTypes: ['title', 'selling-point', 'cta'],
  greenScreenCardFields: ['type', 'title', 'text', 'durationSeconds', 'assetPath', 'background', 'aspectRatio', 'promptDraftId'],
  greenScreenMaxTextLength: 28,
  videoBreakdownSegmentFields: ['timeRange', 'hook', 'visual', 'voiceover', 'rhythm', 'reusablePoint'],
  videoBreakdownBoundaryTerms: ['照搬', '授权', '合规'],
  videoScriptFields: ['title', 'script', 'storyboard', 'videoPrompt', 'publishCheck'],
  videoStoryboardFields: ['visual', 'voiceover', 'subtitle', 'rhythm'],
  workflowRunTraceSources: ['reference-log', 'video-breakdown-log', 'video-script-log', 'video-generation-log', 'mix-package', 'platform-draft'],
  imagePromptTerms: ['主体：', '画面：', '自然光', '负面约束：', '不要医疗化承诺'],
  videoPromptTerms: ['0-3s：', '3-9s：', '9-15s：', '自然光', '负面约束：', '不要竞品元素'],
  referencePromptFields: ['composition', 'lighting', 'negativePrompt', 'risks', 'qualityChecklist'],
  referenceSourceKinds: ['image', 'video'],
  referenceBoundaryTerms: ['复制竞品', '授权'],
  videoPackageFiles: ['videos/', 'overlays/', 'manifest.json', 'manifest.csv', 'import-guide.md'],
  videoPackageTraceFields: ['workflowRunId', 'promptDraftId', 'sourceId', 'packagedPath'],
  videoPackageAssetKinds: ['video', 'overlay'],
  videoPackageReviewStatuses: ['approved'],
  videoPackageGuideTerms: ['第三方混剪软件', 'manifest.csv', 'overlays/', 'videos/', '人工审核'],
  videoPackageExternalImportFields: ['toolName', 'importedAt', 'importedAssetKinds', 'importedFileCount', 'manifestImported', 'timelineCreated', 'result', 'evidenceFiles'],
  platformDraftFiles: ['draft.md', 'platform-copy.txt', 'format-guide.md', 'publish-checklist.md', 'manifest.json'],
  platformDraftTraceFields: ['workflowRunId', 'promptDraftId', 'sourceLogId'],
  platformDraftContentFields: ['draft', 'platformCopy', 'formatGuide', 'publishChecklist', 'publishBoundary'],
};

const LOCAL_SAMPLE = {
  mode: 'local-sample',
  brand: {
    title: '示例便携条包品牌',
    facts: [
      '便携条包，适合早餐后、办公室抽屉和通勤包中随手取用。',
      '内容表达优先讲真实使用场景和坚持门槛，再讲成分与规格。',
    ],
    compliance: [
      '不承诺治疗、见效、改善疾病或替代专业建议。',
      '不做无依据用户背书，不写绝对化收益。',
    ],
    expectedComplianceTerms: DEFAULT_EXPECTATIONS.brandComplianceTerms,
    scenes: [
      '早餐后顺手放进包里',
      '办公室抽屉里备用',
      '妈妈给孩子书包侧袋补充一条',
      '出差洗漱包旁边的日常补给',
      '周末家庭餐桌旁的轻量准备',
    ],
  },
  ip: {
    title: '示例个人 IP 知识库',
    layers: {
      identity: '内容工厂顾问，长期帮品牌把知识库转成可执行内容 SOP。',
      values: '真实、有来源、不过度承诺，宁可标记待补充也不编造。',
      language: '直接、具体、少口号，用运营能执行的话描述方法。',
      methodology: '先抽事实源，再拆场景，再生成 Prompt，最后进审核和复用。',
      materials: '可公开的工作坊记录、品牌访谈、提示词迭代和素材复盘。',
      engine: '围绕知识库、场景库、PromptDraft、SOP 和素材审核形成循环。',
    },
  },
  productBrief: {
    sources: [
      {
        id: 'sample-product-brief',
        kind: 'manual-note',
        purpose: 'product-brief',
        title: '示例产品 brief',
        tags: ['产品资料', 'brief'],
        extractedText: [
          '产品名称：每日轻补便携条包',
          '卖点：小条包装，早餐后、办公室和通勤包里都能随手取用',
          '规格：每盒 20 条，每条独立包装',
          '适用场景：早餐后、办公室抽屉、通勤包侧袋、出差洗漱包',
          '禁用表达：不承诺治疗、见效、改善疾病或替代专业建议',
        ].join('\n'),
      },
      {
        id: 'sample-sku-table',
        kind: 'sku-table',
        purpose: 'product-brief',
        title: '示例 SKU 表',
        tags: ['SKU', '规格'],
        extractedText: [
          'SKU,规格,价格,适用场景',
          'trial-10,10 条装,49,首次尝试',
          'family-30,30 条装,129,家庭常备',
        ].join('\n'),
      },
    ],
    expectedFields: DEFAULT_EXPECTATIONS.productBriefFields,
    expectedVariableTerms: DEFAULT_EXPECTATIONS.productBriefVariableTerms,
    expectedSkuRows: DEFAULT_EXPECTATIONS.productBriefSkuMinimum,
  },
  feedback: {
    sources: [
      {
        id: 'sample-user-feedback',
        kind: 'manual-note',
        purpose: 'user-feedback',
        title: '示例评论和客服问题',
        tags: ['评论', '客服问题'],
        extractedText: [
          '用户：价格有点贵，值不值，怕是智商税。',
          '差评：买了以后不知道怎么用，步骤太复杂，坚持几天就忘记。',
          '客服：孩子和老人能不能吃，敏感人群有没有禁忌？',
          '评论：早餐后放办公室抽屉和通勤包里会不会更方便？',
          '私信：发货包装会不会破损，售后怎么处理？',
          '问答：和别家同款有什么区别，哪个更适合上班族？',
        ].join('\n'),
      },
    ],
    expectedClusterKeys: DEFAULT_EXPECTATIONS.feedbackClusterKeys,
    expectedMatrixFields: DEFAULT_EXPECTATIONS.feedbackMatrixFields,
    expectedTagMinimum: DEFAULT_EXPECTATIONS.feedbackTagMinimum,
  },
  reference: {
    sources: ['参考图：早餐桌自然光构图', '参考视频：15 秒生活化手部动作'],
    expectedPromptFields: DEFAULT_EXPECTATIONS.referencePromptFields,
    actualPromptFields: DEFAULT_EXPECTATIONS.referencePromptFields,
    expectedSourceKinds: DEFAULT_EXPECTATIONS.referenceSourceKinds,
    expectedBoundaryTerms: DEFAULT_EXPECTATIONS.referenceBoundaryTerms,
    actualBoundaryTerms: [
      '不要复制竞品 Logo、包装、文案、人物肖像或可识别品牌元素。',
      '需要人工复核素材授权、商标和肖像风险。',
    ],
  },
  videoBreakdown: {
    sources: ['reference-video-a.mp4'],
    actual: {
      summary: '已拆解参考视频的钩子、镜头、字幕、节奏和可复用结构。',
      dimensions: ['开头钩子', '字幕口播', '镜头运镜', '转化设计'],
      segments: [
        {
          timeRange: '0-3s',
          hook: '先抛早餐后难坚持的真实痛点',
          visual: '早餐桌自然光，手把便携条包放进通勤包侧袋',
          voiceover: '很多人不是不知道要坚持，而是每天准备太麻烦。',
          subtitle: '早餐后顺手放进包里',
          rhythm: '快节奏钩子，镜头停留产品动作',
          reusablePoint: '用具体生活动作降低坚持门槛',
        },
      ],
      reusableFormula: ['痛点 -> 顺手使用 -> 事实边界'],
      risks: [
        { level: 'warning', message: '新脚本只能复用结构，不照搬原视频画面；发布前复核素材授权和合规表达。' },
      ],
    },
    script: {
      title: '便携条包 15 秒新视频脚本',
      script: '镜头 1：早餐后顺手放进包里。\n镜头 2：办公室抽屉备用。\n镜头 3：提醒不做夸张承诺。',
      storyboard: [
        {
          shot: 1,
          duration: '0-3s',
          visual: '自然光早餐桌，手拿起条包。',
          voiceover: '每天坚持，难的不是知道，而是顺手。',
          subtitle: '早餐后顺手完成',
          rhythm: '快速钩子',
        },
        {
          shot: 2,
          duration: '3-9s',
          visual: '办公室抽屉里备用条包。',
          voiceover: '放在真实会用到的位置，比临时想起来更容易。',
          subtitle: '办公室也能备用',
          rhythm: '中速说明',
        },
      ],
      videoPrompt: '15 秒 9:16 手机实拍视频，自然光，早餐桌和办公室抽屉两个真实场景，不复制原视频构图和品牌元素。',
      publishCheck: [
        { level: 'warning', message: '复核素材授权，避免照搬参考视频画面。' },
        { level: 'risk', message: '不要承诺治疗、见效或替代专业建议。' },
      ],
      breakdownLogId: 'sample-video-breakdown-log',
    },
    expectedSegmentFields: DEFAULT_EXPECTATIONS.videoBreakdownSegmentFields,
    expectedBoundaryTerms: DEFAULT_EXPECTATIONS.videoBreakdownBoundaryTerms,
    expectedScriptFields: DEFAULT_EXPECTATIONS.videoScriptFields,
    expectedStoryboardFields: DEFAULT_EXPECTATIONS.videoStoryboardFields,
  },
  videoPackage: {
    expectedFiles: DEFAULT_EXPECTATIONS.videoPackageFiles,
    actualFiles: DEFAULT_EXPECTATIONS.videoPackageFiles,
    requiredTraceFields: DEFAULT_EXPECTATIONS.videoPackageTraceFields,
    actualTraceFields: DEFAULT_EXPECTATIONS.videoPackageTraceFields,
    requiredAssetKinds: DEFAULT_EXPECTATIONS.videoPackageAssetKinds,
    actualAssetKinds: DEFAULT_EXPECTATIONS.videoPackageAssetKinds,
    requiredReviewStatuses: DEFAULT_EXPECTATIONS.videoPackageReviewStatuses,
    actualReviewStatuses: DEFAULT_EXPECTATIONS.videoPackageReviewStatuses,
  },
  platformDraft: {
    expectedFiles: DEFAULT_EXPECTATIONS.platformDraftFiles,
    actualFiles: DEFAULT_EXPECTATIONS.platformDraftFiles,
    requiredTraceFields: DEFAULT_EXPECTATIONS.platformDraftTraceFields,
    actualTraceFields: DEFAULT_EXPECTATIONS.platformDraftTraceFields,
    requiredContentFields: DEFAULT_EXPECTATIONS.platformDraftContentFields,
    actualContentFields: DEFAULT_EXPECTATIONS.platformDraftContentFields,
  },
  mediaCost: {
    actual: {
      model: 'sample-video-model',
      status: 'succeeded',
      durationSeconds: 10,
      currency: 'CNY',
      unitPrice: 1.5,
      estimatedCost: 15,
      source: 'provider-response',
    },
  },
  successfulAsset: {
    actual: {
      assetKey: 'generated:sample-image-log:0:sample-approved-image.png',
      kind: 'image',
      path: 'sample-approved-image.png',
      title: '已通过早餐桌素材',
      reviewStatus: 'approved',
      workflowRunId: 'sample-workflow-run',
      originalPromptDraftId: 'sample-image-prompt-draft',
      workflowArtifactRefs: [
        'generated:sample-image-log:0:sample-approved-image.png',
        'input-source:sample-successful-asset-source',
        'prompt-draft:sample-successful-asset-draft',
      ],
      distilledInputSource: {
        id: 'sample-successful-asset-source',
        kind: 'image',
        purpose: 'successful-asset',
        title: '成功素材沉淀 / 已通过早餐桌素材',
        sourcePath: 'sample-approved-image.png',
        tags: ['successful-asset', 'prompt-distilled', 'image', 'workflow-run'],
        relatedPromptDraftId: 'sample-image-prompt-draft',
        relatedSceneCardIds: ['sample-scene-card'],
        extractedText: [
          '素材状态：已通过审核。',
          '质量原因：真实早餐桌自然光，产品清楚但不过度硬广。',
          '复用 Prompt 草稿：早餐桌自然光，手部自然拿起便携条包。',
          '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
          '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
        ].join('\n'),
      },
      distilledPromptDraft: {
        id: 'sample-successful-asset-draft',
        title: '成功素材 Prompt：已通过早餐桌素材',
        purpose: 'image',
        status: 'confirmed',
        workflowRunId: 'sample-workflow-run',
        inputSourceIds: ['sample-successful-asset-source'],
        sceneCardIds: ['sample-scene-card'],
        model: 'local-successful-asset-distiller',
        content: [
          '素材状态：已通过审核。',
          '质量原因：真实早餐桌自然光，产品清楚但不过度硬广。',
          '复用 Prompt 草稿：早餐桌自然光，手部自然拿起便携条包。',
          '复用要求：只沉淀本方已通过审核的素材经验，不复制竞品 Logo、包装、文案或可识别元素。',
          '下游生成前需要人工确认产品事实、平台规则和禁用表达。',
        ].join('\n'),
      },
    },
    expectedBoundaryTerms: DEFAULT_EXPECTATIONS.successfulAssetBoundaryTerms,
  },
  greenScreen: {
    actualCards: [
      {
        id: 'sample-overlay-title',
        type: 'title',
        title: '标题卡',
        text: '早餐后顺手一次',
        durationSeconds: 3,
        assetPath: 'overlays/sample-overlay-title.svg',
        background: 'green-screen',
        aspectRatio: '9:16',
        promptDraftId: 'sample-video-prompt-draft',
        tags: ['绿幕文案图', '标题卡'],
      },
      {
        id: 'sample-overlay-selling-point',
        type: 'selling-point',
        title: '卖点卡',
        text: '便携条包抽屉包里都能放',
        durationSeconds: 4,
        assetPath: 'overlays/sample-overlay-selling-point.svg',
        background: 'green-screen',
        aspectRatio: '9:16',
        promptDraftId: 'sample-video-prompt-draft',
        tags: ['绿幕文案图', '卖点卡'],
      },
      {
        id: 'sample-overlay-cta',
        type: 'cta',
        title: '行动卡',
        text: '先从每天顺手一次开始',
        durationSeconds: 4,
        assetPath: 'overlays/sample-overlay-cta.svg',
        background: 'green-screen',
        aspectRatio: '9:16',
        promptDraftId: 'sample-video-prompt-draft',
        tags: ['绿幕文案图', '行动卡'],
      },
    ],
    actualReviewStatuses: ['approved'],
    expectedCardTypes: DEFAULT_EXPECTATIONS.greenScreenCardTypes,
    expectedCardFields: DEFAULT_EXPECTATIONS.greenScreenCardFields,
    maxTextLength: DEFAULT_EXPECTATIONS.greenScreenMaxTextLength,
  },
  trace: {
    expectedWorkflowRunId: 'sample-workflow-run',
    requiredSources: DEFAULT_EXPECTATIONS.workflowRunTraceSources,
    actualWorkflowRunRefs: [
      { source: 'reference-log', workflowRunId: 'sample-workflow-run' },
      { source: 'video-breakdown-log', workflowRunId: 'sample-workflow-run' },
      { source: 'video-script-log', workflowRunId: 'sample-workflow-run' },
      { source: 'video-generation-log', workflowRunId: 'sample-workflow-run' },
      { source: 'mix-package', workflowRunId: 'sample-workflow-run' },
      { source: 'platform-draft', workflowRunId: 'sample-workflow-run' },
    ],
  },
};

const ACCEPTED_EXTERNAL_IMPORT_RESULTS = new Set(['verified', 'completed', 'complete', 'imported', 'succeeded', 'success', 'approved']);

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeInputSource(value, fallbackPurpose) {
  const source = asObject(value);
  return {
    id: String(source.id || source.title || ''),
    kind: String(source.kind || 'manual-note'),
    purpose: String(source.purpose || fallbackPurpose),
    title: String(source.title || source.id || '未命名输入源'),
    tags: asArray(source.tags).map(String).filter(Boolean),
    summary: String(source.summary || ''),
    extractedText: String(source.extractedText || source.text || ''),
  };
}

function promptDraftContent(value) {
  const draft = asObject(value);
  if (String(draft.content || '').trim()) return String(draft.content).trim();
  const versions = asArray(draft.versions).map((version) => asObject(version));
  const activeVersionId = String(draft.activeVersionId || '');
  const active = versions.find((version) => String(version.id || '') === activeVersionId) ?? versions.at(-1);
  return String(active?.content || '').trim();
}

function normalizeSuccessfulAssetActual(value) {
  const actual = asObject(value);
  const source = asObject(actual.distilledInputSource);
  const draft = asObject(actual.distilledPromptDraft);
  const manualEvent = asObject(actual.manualEvent);
  return {
    assetKey: String(actual.assetKey || ''),
    kind: String(actual.kind || ''),
    path: String(actual.path || ''),
    title: String(actual.title || ''),
    reviewStatus: String(actual.reviewStatus || ''),
    workflowRunId: String(actual.workflowRunId || ''),
    originalPromptDraftId: String(actual.originalPromptDraftId || ''),
    workflowArtifactRefs: asArray(actual.workflowArtifactRefs).map(String).filter(Boolean),
    distilledInputSource: {
      id: String(source.id || ''),
      kind: String(source.kind || ''),
      purpose: String(source.purpose || ''),
      title: String(source.title || ''),
      sourcePath: String(source.sourcePath || ''),
      tags: asArray(source.tags).map(String).filter(Boolean),
      extractedText: String(source.extractedText || source.text || source.summary || ''),
      relatedPromptDraftId: String(source.relatedPromptDraftId || ''),
      relatedSceneCardIds: asArray(source.relatedSceneCardIds).map(String).filter(Boolean),
      workflowRunId: String(source.workflowRunId || ''),
    },
    distilledPromptDraft: {
      id: String(draft.id || ''),
      title: String(draft.title || ''),
      purpose: String(draft.purpose || ''),
      status: String(draft.status || ''),
      workflowRunId: String(draft.workflowRunId || ''),
      inputSourceIds: asArray(draft.inputSourceIds).map(String).filter(Boolean),
      sceneCardIds: asArray(draft.sceneCardIds).map(String).filter(Boolean),
      model: String(draft.model || ''),
      content: promptDraftContent(draft),
    },
    manualEvent: {
      event: String(manualEvent.event || ''),
      inputSourceId: String(manualEvent.inputSourceId || ''),
      promptDraftId: String(manualEvent.promptDraftId || ''),
      assetKey: String(manualEvent.assetKey || ''),
    },
  };
}

function normalizeOverlayCard(value) {
  const card = asObject(value);
  return {
    id: String(card.id || ''),
    type: String(card.type || ''),
    title: String(card.title || ''),
    text: String(card.text || ''),
    durationSeconds: Number(card.durationSeconds || 0),
    assetPath: String(card.assetPath || card.path || ''),
    background: String(card.background || ''),
    aspectRatio: String(card.aspectRatio || ''),
    promptDraftId: String(card.promptDraftId || ''),
    tags: asArray(card.tags).map(String).filter(Boolean),
  };
}

function normalizeExternalMixImportEvidence(value) {
  const evidence = asObject(value);
  return {
    toolName: String(evidence.toolName || evidence.tool || ''),
    importedAt: String(evidence.importedAt || evidence.checkedAt || ''),
    operator: String(evidence.operator || evidence.reviewer || ''),
    importedAssetKinds: asArray(evidence.importedAssetKinds || evidence.assetKinds).map(String).filter(Boolean),
    importedFileCount: Number(evidence.importedFileCount || evidence.fileCount || 0),
    manifestImported: Boolean(evidence.manifestImported),
    timelineCreated: Boolean(evidence.timelineCreated),
    result: String(evidence.result || evidence.status || ''),
    notes: String(evidence.notes || evidence.summary || ''),
    evidenceFiles: asArray(evidence.evidenceFiles || evidence.files)
      .map(String)
      .filter(Boolean),
    verifiedEvidenceFiles: asArray(evidence.verifiedEvidenceFiles)
      .map(String)
      .filter(Boolean),
    missingEvidenceFiles: asArray(evidence.missingEvidenceFiles)
      .map(String)
      .filter(Boolean),
    outOfScopeEvidenceFiles: asArray(evidence.outOfScopeEvidenceFiles)
      .map(String)
      .filter(Boolean),
  };
}

function normalizeAcceptanceInput(input = LOCAL_SAMPLE) {
  const raw = asObject(input);
  const brand = asObject(raw.brand);
  const ip = asObject(raw.ip);
  const productBrief = asObject(raw.productBrief);
  const feedback = asObject(raw.feedback);
  const reference = asObject(raw.reference);
  const videoBreakdown = asObject(raw.videoBreakdown);
  const successfulAsset = asObject(raw.successfulAsset);
  const greenScreen = asObject(raw.greenScreen);
  const videoPackage = asObject(raw.videoPackage);
  const platformDraft = asObject(raw.platformDraft);
  const mediaCost = asObject(raw.mediaCost);
  const actualMediaCost = asObject(mediaCost.actual);
  const trace = asObject(raw.trace);
  return {
    mode: raw.mode === 'external-input' || raw.mode === 'local-sample' || raw.mode === 'workspace'
      ? raw.mode
      : 'external-input',
    workspacePath: String(raw.workspacePath || ''),
    brand: {
      title: String(brand.title || ''),
      facts: asArray(brand.facts).map(String).filter(Boolean),
      compliance: asArray(brand.compliance).map(String).filter(Boolean),
      expectedComplianceTerms: asArray(brand.expectedComplianceTerms).length
        ? asArray(brand.expectedComplianceTerms).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.brandComplianceTerms,
      scenes: asArray(brand.scenes),
    },
    ip: {
      title: String(ip.title || ''),
      layers: asObject(ip.layers),
    },
    productBrief: {
      sources: asArray(productBrief.sources)
        .map((source) => normalizeInputSource(source, 'product-brief'))
        .filter((source) => source.id || source.title || source.extractedText),
      expectedFields: asArray(productBrief.expectedFields).length
        ? asArray(productBrief.expectedFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.productBriefFields,
      expectedVariableTerms: asArray(productBrief.expectedVariableTerms).length
        ? asArray(productBrief.expectedVariableTerms).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.productBriefVariableTerms,
      expectedSkuRows: Number(productBrief.expectedSkuRows ?? DEFAULT_EXPECTATIONS.productBriefSkuMinimum),
      expectedPromptTypes: asArray(productBrief.expectedPromptTypes).length
        ? asArray(productBrief.expectedPromptTypes).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.productBriefPromptTypes,
      expectedPromptFields: asArray(productBrief.expectedPromptFields).length
        ? asArray(productBrief.expectedPromptFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.productBriefPromptFields,
    },
    feedback: {
      sources: asArray(feedback.sources)
        .map((source) => normalizeInputSource(source, 'user-feedback'))
        .filter((source) => source.id || source.title || source.extractedText),
      expectedClusterKeys: asArray(feedback.expectedClusterKeys).length
        ? asArray(feedback.expectedClusterKeys).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.feedbackClusterKeys,
      expectedMatrixFields: asArray(feedback.expectedMatrixFields).length
        ? asArray(feedback.expectedMatrixFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.feedbackMatrixFields,
      expectedTagMinimum: Number(feedback.expectedTagMinimum ?? DEFAULT_EXPECTATIONS.feedbackTagMinimum),
      expectedTitleMinimum: Number(feedback.expectedTitleMinimum ?? DEFAULT_EXPECTATIONS.feedbackTitleMinimum),
      expectedObjectionMinimum: Number(feedback.expectedObjectionMinimum ?? DEFAULT_EXPECTATIONS.feedbackObjectionMinimum),
      expectedObjectionFields: asArray(feedback.expectedObjectionFields).length
        ? asArray(feedback.expectedObjectionFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.feedbackObjectionFields,
    },
    reference: {
      sources: asArray(reference.sources).map(String).filter(Boolean),
      expectedPromptFields: asArray(reference.expectedPromptFields).length
        ? asArray(reference.expectedPromptFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.referencePromptFields,
      actualPromptFields: asArray(reference.actualPromptFields).map(String).filter(Boolean),
      expectedSourceKinds: asArray(reference.expectedSourceKinds).length
        ? asArray(reference.expectedSourceKinds).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.referenceSourceKinds,
      actualSourceKinds: asArray(reference.actualSourceKinds).map(String).filter(Boolean),
      expectedBoundaryTerms: asArray(reference.expectedBoundaryTerms).length
        ? asArray(reference.expectedBoundaryTerms).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.referenceBoundaryTerms,
      actualBoundaryTerms: asArray(reference.actualBoundaryTerms).map(String).filter(Boolean),
    },
    videoBreakdown: {
      sources: asArray(videoBreakdown.sources).map(String).filter(Boolean),
      actual: asObject(videoBreakdown.actual),
      script: asObject(videoBreakdown.script),
      expectedSegmentFields: asArray(videoBreakdown.expectedSegmentFields).length
        ? asArray(videoBreakdown.expectedSegmentFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.videoBreakdownSegmentFields,
      expectedBoundaryTerms: asArray(videoBreakdown.expectedBoundaryTerms).length
        ? asArray(videoBreakdown.expectedBoundaryTerms).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.videoBreakdownBoundaryTerms,
      expectedScriptFields: asArray(videoBreakdown.expectedScriptFields).length
        ? asArray(videoBreakdown.expectedScriptFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.videoScriptFields,
      expectedStoryboardFields: asArray(videoBreakdown.expectedStoryboardFields).length
        ? asArray(videoBreakdown.expectedStoryboardFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.videoStoryboardFields,
    },
    successfulAsset: {
      actual: normalizeSuccessfulAssetActual(successfulAsset.actual),
      expectedBoundaryTerms: asArray(successfulAsset.expectedBoundaryTerms).length
        ? asArray(successfulAsset.expectedBoundaryTerms).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.successfulAssetBoundaryTerms,
    },
    greenScreen: {
      actualCards: asArray(greenScreen.actualCards)
        .map(normalizeOverlayCard)
        .filter((card) => card.id || card.title || card.text || card.assetPath),
      actualReviewStatuses: asArray(greenScreen.actualReviewStatuses).map(String).filter(Boolean),
      expectedCardTypes: asArray(greenScreen.expectedCardTypes).length
        ? asArray(greenScreen.expectedCardTypes).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.greenScreenCardTypes,
      expectedCardFields: asArray(greenScreen.expectedCardFields).length
        ? asArray(greenScreen.expectedCardFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.greenScreenCardFields,
      maxTextLength: Number(greenScreen.maxTextLength ?? DEFAULT_EXPECTATIONS.greenScreenMaxTextLength),
    },
    videoPackage: {
      expectedFiles: asArray(videoPackage.expectedFiles).length
        ? asArray(videoPackage.expectedFiles).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.videoPackageFiles,
      actualFiles: asArray(videoPackage.actualFiles).map(String).filter(Boolean),
      requiredTraceFields: asArray(videoPackage.requiredTraceFields).length
        ? asArray(videoPackage.requiredTraceFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.videoPackageTraceFields,
      actualTraceFields: asArray(videoPackage.actualTraceFields).map(String).filter(Boolean),
      requiredAssetKinds: asArray(videoPackage.requiredAssetKinds).length
        ? asArray(videoPackage.requiredAssetKinds).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.videoPackageAssetKinds,
      actualAssetKinds: asArray(videoPackage.actualAssetKinds).map(String).filter(Boolean),
      requiredReviewStatuses: asArray(videoPackage.requiredReviewStatuses).length
        ? asArray(videoPackage.requiredReviewStatuses).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.videoPackageReviewStatuses,
      actualReviewStatuses: asArray(videoPackage.actualReviewStatuses).map(String).filter(Boolean),
      expectedGuideTerms: asArray(videoPackage.expectedGuideTerms).length
        ? asArray(videoPackage.expectedGuideTerms).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.videoPackageGuideTerms,
      actualGuideTerms: asArray(videoPackage.actualGuideTerms).map(String).filter(Boolean),
      packageDir: String(videoPackage.packageDir || ''),
      manifestPath: String(videoPackage.manifestPath || ''),
      importGuidePath: String(videoPackage.importGuidePath || ''),
      declaredPackagedFilePaths: asArray(videoPackage.declaredPackagedFilePaths).map(String).filter(Boolean),
      actualPackagedFilePaths: asArray(videoPackage.actualPackagedFilePaths).map(String).filter(Boolean),
      missingPackagedFilePaths: asArray(videoPackage.missingPackagedFilePaths).map(String).filter(Boolean),
      unverifiedPackagedFilePaths: asArray(videoPackage.unverifiedPackagedFilePaths).map(String).filter(Boolean),
      requireExternalImportEvidence: Boolean(videoPackage.requireExternalImportEvidence || raw.requireExternalMixEvidence),
      externalImportEvidencePath: String(videoPackage.externalImportEvidencePath || ''),
      externalImportEvidence: normalizeExternalMixImportEvidence(videoPackage.externalImportEvidence),
    },
    platformDraft: {
      expectedFiles: asArray(platformDraft.expectedFiles).length
        ? asArray(platformDraft.expectedFiles).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.platformDraftFiles,
      actualFiles: asArray(platformDraft.actualFiles).map(String).filter(Boolean),
      requiredTraceFields: asArray(platformDraft.requiredTraceFields).length
        ? asArray(platformDraft.requiredTraceFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.platformDraftTraceFields,
      actualTraceFields: asArray(platformDraft.actualTraceFields).map(String).filter(Boolean),
      requiredContentFields: asArray(platformDraft.requiredContentFields).length
        ? asArray(platformDraft.requiredContentFields).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.platformDraftContentFields,
      actualContentFields: asArray(platformDraft.actualContentFields).map(String).filter(Boolean),
      packageDir: String(platformDraft.packageDir || ''),
      manifestPath: String(platformDraft.manifestPath || ''),
    },
    mediaCost: {
      actual: {
        model: String(actualMediaCost.model || ''),
        status: String(actualMediaCost.status || ''),
        durationSeconds: Number(actualMediaCost.durationSeconds || 0),
        currency: String(actualMediaCost.currency || ''),
        unitPrice: Number(actualMediaCost.unitPrice || 0),
        estimatedCost: Number(actualMediaCost.estimatedCost || 0),
        source: String(actualMediaCost.source || ''),
      },
    },
    trace: {
      expectedWorkflowRunId: String(trace.expectedWorkflowRunId || ''),
      requiredSources: asArray(trace.requiredSources).length
        ? asArray(trace.requiredSources).map(String).filter(Boolean)
        : DEFAULT_EXPECTATIONS.workflowRunTraceSources,
      actualWorkflowRunRefs: asArray(trace.actualWorkflowRunRefs)
        .map((item) => asObject(item))
        .map((item) => ({
          source: String(item.source || ''),
          workflowRunId: String(item.workflowRunId || ''),
        }))
        .filter((item) => item.source && item.workflowRunId),
    },
  };
}

export async function loadAcceptanceInput(inputPath) {
  const raw = await readFile(resolve(inputPath), 'utf-8');
  return normalizeAcceptanceInput(JSON.parse(raw));
}

function passCheck(id, title, evidence, details = {}) {
  return { id, title, status: 'pass', evidence, ...details };
}

function failCheck(id, title, evidence, details = {}) {
  return { id, title, status: 'fail', evidence, ...details };
}

function sceneTitle(scene) {
  if (typeof scene === 'string') return scene;
  return String(asObject(scene).title || '');
}

function buildPromptGroup(prefix, scenes, count) {
  const sceneTitles = scenes.map(sceneTitle).filter(Boolean);
  return Array.from({ length: count }, (_, index) => ({
    title: `${prefix} ${String(index + 1).padStart(2, '0')}`,
    scene: sceneTitles[index % sceneTitles.length] ?? '',
    constraints: ['真实手机实拍', '自然光', '产品清楚不过度硬广', '不写医疗化承诺', '不复制竞品元素'],
  }));
}

function buildSceneCards(sample) {
  return sample.brand.scenes.map((scene, index) => {
    const value = asObject(scene);
    const title = typeof scene === 'string' ? scene : String(value.title || '');
    return {
      id: `sample-scene-${index + 1}`,
      promptPackId: 'sample-prompt-pack',
      inputSourceIds: ['sample-brand-input'],
      title,
      audience: String(value.audience || (index === 2 ? '有家庭补给需求的妈妈' : '早餐后和办公室场景用户')),
      painPoint: String(value.painPoint || '日常补给容易忘记，坚持门槛高。'),
      usageScene: String(value.usageScene || title),
      visualComposition: String(value.visualComposition || '产品自然放在真实桌面或包内，人物只露手部动作，自然光，画面干净但有生活痕迹。'),
      sellingPoint: String(value.sellingPoint || '便携条包降低准备和携带门槛。'),
      voiceoverDirection: String(value.voiceoverDirection || '像真实使用者解释，不夸张，不喊口号。'),
      imageMaterialSuggestion: String(value.imageMaterialSuggestion || '生成真实手机实拍的小红书生活场景图。'),
      videoMaterialSuggestion: String(value.videoMaterialSuggestion || '生成 15 秒可混剪的生活化手部动作素材。'),
      sourceCitationIds: asArray(value.sourceCitationIds).length ? value.sourceCitationIds.map(String) : ['sample-brand-citation'],
      tags: asArray(value.tags).length ? value.tags.map(String) : ['local-sample', 'brand-scene'],
      createdAt: '2026-05-22T00:00:00.000Z',
      updatedAt: '2026-05-22T00:00:00.000Z',
    };
  }).filter((scene) => scene.title);
}

function countHeading(content, heading) {
  return content.match(new RegExp(`^### ${heading}`, 'gm'))?.length ?? 0;
}

function missingTerms(content, terms) {
  return terms.filter((term) => !content.includes(term));
}

function brandAcceptance(sample) {
  const sceneCards = buildSceneCards(sample);
  const imagePromptContent = buildScenePromptGroupContent(
    'image',
    '生成小红书真实生活场景图片 Prompt。',
    sceneCards,
  );
  const videoPromptContent = buildScenePromptGroupContent(
    'video',
    '生成可复制到图生视频工具的 15 秒素材 Prompt。',
    sceneCards,
  );
  const imagePrompts = buildPromptGroup('图片 Prompt', sample.brand.scenes, 10);
  const videoPrompts = buildPromptGroup('视频 Prompt', sample.brand.scenes, 10);
  const imagePromptCount = countHeading(imagePromptContent, '图片 Prompt');
  const videoPromptCount = countHeading(videoPromptContent, '视频 Prompt');
  const imageMissingTerms = missingTerms(imagePromptContent, DEFAULT_EXPECTATIONS.imagePromptTerms);
  const videoMissingTerms = missingTerms(videoPromptContent, DEFAULT_EXPECTATIONS.videoPromptTerms);
  const complianceText = sample.brand.compliance.join('\n');
  const missingComplianceTerms = sample.brand.expectedComplianceTerms
    .filter((term) => !complianceText.includes(term));
  const checks = [
    sample.brand.facts.length >= 2
      ? passCheck('brand-facts', '品牌事实可追溯', '验收资料含产品事实和使用场景。', { count: sample.brand.facts.length })
      : failCheck('brand-facts', '品牌事实可追溯', '品牌事实不足。'),
    sample.brand.compliance.length >= 2 && missingComplianceTerms.length === 0
      ? passCheck('brand-compliance', '合规边界明确', '验收资料含医疗化和绝对化表达边界。', {
        requiredTerms: sample.brand.expectedComplianceTerms,
        actualCompliance: sample.brand.compliance,
      })
      : failCheck('brand-compliance', '合规边界明确', '合规边界不足，或未证明医疗化 / 绝对化表达边界。', {
        requiredTerms: sample.brand.expectedComplianceTerms,
        actualCompliance: sample.brand.compliance,
        missingTerms: missingComplianceTerms,
      }),
    imagePromptCount === 10 && videoPromptCount === 10
      ? passCheck('scene-prompt-count', '场景库可产出 10 组图片和 10 组视频 Prompt', '生产 Prompt 组合器输出数量与 PRD 验收口径一致。', { imagePromptCount, videoPromptCount })
      : failCheck('scene-prompt-count', '场景 Prompt 数量', '生产 Prompt 组合器输出数量不足。', { imagePromptCount, videoPromptCount }),
    imagePromptContent.includes('不要医疗化承诺') && videoPromptContent.includes('不要竞品元素')
      ? passCheck('scene-prompt-boundary', '场景 Prompt 合规边界保留', '图片和视频 Prompt 保留医疗化、竞品元素和虚假功效边界。')
      : failCheck('scene-prompt-boundary', '场景 Prompt 合规边界保留', '生产 Prompt 组合器输出缺少必要边界。'),
    imageMissingTerms.length === 0 && videoMissingTerms.length === 0
      ? passCheck('scene-prompt-structure', '场景 Prompt 结构可执行', '图片和视频 Prompt 均包含主体、画面、光线、真实感和负面约束。', {
        requiredImageTerms: DEFAULT_EXPECTATIONS.imagePromptTerms,
        requiredVideoTerms: DEFAULT_EXPECTATIONS.videoPromptTerms,
      })
      : failCheck('scene-prompt-structure', '场景 Prompt 结构可执行', '生产 Prompt 组合器输出缺少可执行结构字段。', {
        imageMissingTerms,
        videoMissingTerms,
      }),
  ];
  return {
    sample: sample.brand.title,
    sceneCardCount: sceneCards.length,
    imagePrompts,
    videoPrompts,
    promptGroupEvidence: {
      imagePromptCount,
      videoPromptCount,
      imagePromptExcerpt: imagePromptContent.split('\n').slice(0, 10).join('\n'),
      videoPromptExcerpt: videoPromptContent.split('\n').slice(0, 10).join('\n'),
    },
    checks,
  };
}

function ipAcceptance(sample) {
  const missingLayers = DEFAULT_EXPECTATIONS.ipLayerKeys
    .filter((key) => !String(sample.ip.layers[key] ?? '').trim());
  return {
    sample: sample.ip.title,
    completeness: Math.round(((DEFAULT_EXPECTATIONS.ipLayerKeys.length - missingLayers.length) / DEFAULT_EXPECTATIONS.ipLayerKeys.length) * 100),
    missingLayers,
    extensionScenes: ['口播', '长文', '朋友圈', '私域回复', '产品化咨询'],
    checks: [
      missingLayers.length === 0
        ? passCheck('ip-six-layers', 'IP 六层完整', '身份、价值观、语言、方法论、素材、创作引擎均有内容。', { completeness: 100 })
        : failCheck('ip-six-layers', 'IP 六层完整', '存在待补层级。', { missingLayers }),
    ],
  };
}

function productBriefFieldValue(brief, field) {
  if (field === 'productName') return brief.productName.trim();
  if (field === 'sellingPoints') return brief.sellingPoints;
  if (field === 'specs') return brief.specs;
  if (field === 'skuRows') return brief.skuRows;
  if (field === 'specsOrSku') return [...brief.specs, ...brief.skuRows.map((row) => JSON.stringify(row))];
  if (field === 'scenarios') return brief.scenarios;
  if (field === 'restrictions') return brief.restrictions;
  return [];
}

function hasProductBriefField(brief, field) {
  const value = productBriefFieldValue(brief, field);
  return Array.isArray(value) ? value.length > 0 : Boolean(value);
}

function productPromptMissingFields(prompt, fields) {
  const value = asObject(prompt);
  return fields.filter((field) => {
    const fieldValue = value[field];
    return Array.isArray(fieldValue) ? fieldValue.length === 0 : !String(fieldValue ?? '').trim();
  });
}

function productBriefAcceptance(sample) {
  const brief = structureProductBriefSources(sample.productBrief.sources);
  const promptPlan = buildProductBriefPromptPlan(brief);
  const expectedRows = Number.isFinite(sample.productBrief.expectedSkuRows)
    ? sample.productBrief.expectedSkuRows
    : DEFAULT_EXPECTATIONS.productBriefSkuMinimum;
  const missingFieldKeys = sample.productBrief.expectedFields
    .filter((field) => !hasProductBriefField(brief, field));
  const missingVariableTerms = sample.productBrief.expectedVariableTerms
    .filter((term) => !brief.variableTable.includes(term));
  const missingFieldClaims = [
    { label: '产品名称', empty: !brief.productName.trim() },
    { label: '卖点', empty: brief.sellingPoints.length === 0 },
    { label: '规格 / SKU', empty: brief.specs.length === 0 && brief.skuRows.length === 0 },
    { label: '适用场景 / 人群', empty: brief.scenarios.length === 0 },
    { label: '禁用表达 / 合规边界', empty: brief.restrictions.length === 0 },
  ];
  const unreportedMissingFields = missingFieldClaims
    .filter((field) => field.empty && !brief.missingFields.includes(field.label))
    .map((field) => field.label);
  const actualPromptTypes = Array.from(new Set(promptPlan.map((item) => item.type).filter(Boolean)));
  const missingPromptTypes = missingItems(sample.productBrief.expectedPromptTypes, actualPromptTypes);
  const promptRowsWithMissingFields = promptPlan
    .map((prompt, index) => ({
      index,
      type: prompt.type,
      title: prompt.title,
      missingFields: productPromptMissingFields(prompt, sample.productBrief.expectedPromptFields),
    }))
    .filter((row) => row.missingFields.length > 0);
  const promptRowsMissingTrace = promptPlan
    .map((prompt) => {
      const leakedSourceIds = prompt.sourceIds.filter((sourceId) => prompt.prompt.includes(sourceId));
      const issues = [
        prompt.sourceIds.length === 0 ? '缺少底层 sourceIds' : '',
        !String(prompt.sourceTrace ?? '').trim() ? '缺少资料追溯摘要' : '',
        !prompt.skuTrace.trim() || prompt.skuTrace === '未提供 SKU 行' ? '缺少 SKU / 规格追溯' : '',
        !prompt.prompt.includes('追溯资料') ? '用户可见 Prompt 缺少资料追溯' : '',
        prompt.prompt.includes('追溯输入源') ? '用户可见 Prompt 泄露内部追溯字段' : '',
        leakedSourceIds.length > 0 ? '用户可见 Prompt 泄露 source id' : '',
        !prompt.prompt.includes('禁用表达') ? '缺少禁用表达追溯' : '',
      ].filter(Boolean);
      return {
        type: prompt.type,
        title: prompt.title,
        skuTrace: prompt.skuTrace,
        sourceTrace: prompt.sourceTrace,
        sourceIds: prompt.sourceIds,
        leakedSourceIds,
        issues,
      };
    })
    .filter((row) => row.issues.length > 0);
  return {
    sourceIds: brief.sourceIds,
    sourceTitles: brief.sourceTitles,
    productName: brief.productName,
    missingFields: brief.missingFields,
    skuRows: brief.skuRows,
    variableTable: brief.variableTable,
    promptPlan,
    checks: [
      brief.sourceIds.length > 0 && missingFieldKeys.length === 0
        ? passCheck('product-brief-fields', '产品资料字段完整', '产品资料已整理出产品名称、卖点、规格 / SKU、适用场景和禁用表达。', {
          expectedFields: sample.productBrief.expectedFields,
          missingFields: missingFieldKeys,
        })
        : failCheck('product-brief-fields', '产品资料字段完整', '产品资料缺少普通用户下游生产所需字段。', {
          expectedFields: sample.productBrief.expectedFields,
          missingFields: missingFieldKeys,
          structuredMissingFields: brief.missingFields,
        }),
      brief.sourceIds.length > 0 && unreportedMissingFields.length === 0
        ? passCheck('product-brief-no-fabrication', '缺字段不编造', '解析器只整理用户明示字段；缺项会进入待补字段，而不是自动补写卖点。', {
          structuredMissingFields: brief.missingFields,
        })
        : failCheck('product-brief-no-fabrication', '缺字段不编造', '缺少输入源，或缺失字段没有被显式标记为待补。', {
          structuredMissingFields: brief.missingFields,
          unreportedMissingFields,
        }),
      brief.skuRows.length >= expectedRows
        ? passCheck('product-brief-sku', 'SKU 变量可用', '产品资料至少包含一行 SKU / 规格变量，可支撑主图、卖点图和详情页变体。', {
          expectedSkuRows: expectedRows,
          actualSkuRows: brief.skuRows.length,
        })
        : failCheck('product-brief-sku', 'SKU 变量可用', '产品资料缺少 SKU 行，无法证明批量变体链路可用。', {
          expectedSkuRows: expectedRows,
          actualSkuRows: brief.skuRows.length,
        }),
      brief.sourceIds.length > 0 && brief.missingFields.length === 0 && missingVariableTerms.length === 0 && !brief.variableTable.includes('待补充')
        ? passCheck('product-brief-downstream-ready', '产品变量表可交接下游', '变量表包含产品名称、卖点、规格、场景、禁用表达和 SKU 行数，可进入 Prompt / 图片生产。', {
          requiredTerms: sample.productBrief.expectedVariableTerms,
          variableTable: brief.variableTable,
        })
        : failCheck('product-brief-downstream-ready', '产品变量表可交接下游', '变量表仍有待补字段，不能作为普通用户下游生产的可用输入。', {
          requiredTerms: sample.productBrief.expectedVariableTerms,
          missingVariableTerms,
          variableTable: brief.variableTable,
          structuredMissingFields: brief.missingFields,
        }),
      missingPromptTypes.length === 0 && promptRowsWithMissingFields.length === 0
        ? passCheck('product-brief-prompt-plan', '产品资料可生成三类图片 Prompt', '产品资料已形成主图、卖点图和详情页模块 Prompt 计划。', {
          expectedPromptTypes: sample.productBrief.expectedPromptTypes,
          actualPromptTypes,
          promptCount: promptPlan.length,
        })
        : failCheck('product-brief-prompt-plan', '产品资料可生成三类图片 Prompt', '产品资料未能形成主图、卖点图和详情页模块 Prompt。', {
          expectedPromptTypes: sample.productBrief.expectedPromptTypes,
          actualPromptTypes,
          missingPromptTypes,
          promptRowsWithMissingFields,
        }),
      brief.sourceIds.length > 0 && brief.skuRows.length >= expectedRows && promptRowsMissingTrace.length === 0
        ? passCheck('product-brief-prompt-trace', '产品 Prompt 保留资料和 SKU 追溯', '主图、卖点图和详情页 Prompt 均保留底层 sourceIds，并向普通用户展示资料数量、SKU / 规格和禁用表达追溯。', {
          sourceIds: brief.sourceIds,
          skuRows: brief.skuRows.length,
        })
        : failCheck('product-brief-prompt-trace', '产品 Prompt 保留资料和 SKU 追溯', '产品 Prompt 缺少底层 sourceIds、资料数量、SKU / 规格或禁用表达追溯，或泄露了 source id / 内部追溯字段。', {
          sourceIds: brief.sourceIds,
          skuRows: brief.skuRows.length,
          promptRowsMissingTrace,
        }),
    ],
  };
}

function feedbackEvidenceText(sources) {
  return sources
    .map((source) => [
      source.title,
      source.summary,
      source.extractedText,
    ].filter(Boolean).join('\n'))
    .join('\n');
}

function feedbackAcceptance(sample) {
  const insight = clusterUserFeedbackSources(sample.feedback.sources);
  const clusterKeys = insight.clusters.map((cluster) => cluster.key);
  const missingClusterKeys = missingItems(sample.feedback.expectedClusterKeys, clusterKeys);
  const matrixRowsWithMissingFields = insight.matrix
    .map((row, index) => ({
      index,
      missingFields: sample.feedback.expectedMatrixFields
        .filter((field) => !String(row[field] ?? '').trim()),
    }))
    .filter((row) => row.missingFields.length > 0);
  const sourceText = feedbackEvidenceText(sample.feedback.sources);
  const missingEvidenceExamples = insight.clusters
    .flatMap((cluster) => cluster.examples)
    .filter((example) => example && !sourceText.includes(example));
  const objectionRowsWithMissingFields = insight.objectionResponses
    .map((row, index) => ({
      index,
      painPoint: row.painPoint,
      missingFields: sample.feedback.expectedObjectionFields
        .filter((field) => !String(row[field] ?? '').trim()),
    }))
    .filter((row) => row.missingFields.length > 0);
  const objectionResponsesMissingEvidence = insight.objectionResponses
    .filter((row) => row.evidence && !sourceText.includes(row.evidence))
    .map((row) => row.evidence);
  return {
    sourceIds: insight.sourceIds,
    sourceTitles: insight.sourceTitles,
    totalLines: insight.totalLines,
    clusters: insight.clusters,
    recommendedTags: insight.recommendedTags,
    titleDirections: insight.titleDirections,
    objectionResponses: insight.objectionResponses,
    matrix: insight.matrix,
    checks: [
      insight.sourceIds.length > 0 && missingClusterKeys.length === 0
        ? passCheck('feedback-clusters', '评论痛点聚类覆盖关键问题', '评论和客服问题已覆盖价格信任、使用门槛、人群边界和场景需求。', {
          expectedClusterKeys: sample.feedback.expectedClusterKeys,
          actualClusterKeys: clusterKeys,
        })
        : failCheck('feedback-clusters', '评论痛点聚类覆盖关键问题', '评论样本不足，无法证明关键痛点聚类可用。', {
          expectedClusterKeys: sample.feedback.expectedClusterKeys,
          actualClusterKeys: clusterKeys,
          missingClusterKeys,
        }),
      insight.matrix.length > 0 && matrixRowsWithMissingFields.length === 0
        ? passCheck('feedback-matrix', '用户问题矩阵可用', '痛点、人群、场景和内容角度均已结构化，可进入标题和内容生产。', {
          expectedMatrixFields: sample.feedback.expectedMatrixFields,
          matrixCount: insight.matrix.length,
        })
        : failCheck('feedback-matrix', '用户问题矩阵可用', '用户问题矩阵缺少下游生产字段。', {
          expectedMatrixFields: sample.feedback.expectedMatrixFields,
          matrixCount: insight.matrix.length,
          matrixRowsWithMissingFields,
        }),
      insight.recommendedTags.length >= sample.feedback.expectedTagMinimum
        ? passCheck('feedback-tags', '评论可沉淀素材标签', '评论痛点已产出可用于素材库和选题筛选的标签。', {
          expectedTagMinimum: sample.feedback.expectedTagMinimum,
          recommendedTags: insight.recommendedTags,
        })
        : failCheck('feedback-tags', '评论可沉淀素材标签', '评论痛点标签不足，无法支撑普通用户筛选和复用。', {
          expectedTagMinimum: sample.feedback.expectedTagMinimum,
          recommendedTags: insight.recommendedTags,
        }),
      insight.clusters.length > 0 && missingEvidenceExamples.length === 0
        ? passCheck('feedback-evidence', '痛点引用真实原声', '每个聚类示例都来自用户输入原文，不编造用户问题。', {
          exampleCount: insight.clusters.flatMap((cluster) => cluster.examples).length,
        })
        : failCheck('feedback-evidence', '痛点引用真实原声', '缺少可追溯评论原声，或聚类示例未出现在输入源中。', {
          missingEvidenceExamples,
        }),
      insight.titleDirections.length >= sample.feedback.expectedTitleMinimum
        ? passCheck('feedback-title-directions', '评论可生成标题方向', '用户原声已转成可进入标题矩阵和选题生产的方向。', {
          expectedTitleMinimum: sample.feedback.expectedTitleMinimum,
          titleDirections: insight.titleDirections,
        })
        : failCheck('feedback-title-directions', '评论可生成标题方向', '标题方向不足，无法证明评论痛点能支撑标题矩阵。', {
          expectedTitleMinimum: sample.feedback.expectedTitleMinimum,
          titleDirections: insight.titleDirections,
        }),
      insight.objectionResponses.length >= sample.feedback.expectedObjectionMinimum &&
        objectionRowsWithMissingFields.length === 0 &&
        objectionResponsesMissingEvidence.length === 0
        ? passCheck('feedback-objection-responses', '客服异议话术可用', '评论和客服问题已生成带原声证据与回复边界的异议处理话术。', {
          expectedObjectionMinimum: sample.feedback.expectedObjectionMinimum,
          expectedObjectionFields: sample.feedback.expectedObjectionFields,
          responseCount: insight.objectionResponses.length,
        })
        : failCheck('feedback-objection-responses', '客服异议话术可用', '客服异议处理话术不足，或缺少原声证据 / 回复边界。', {
          expectedObjectionMinimum: sample.feedback.expectedObjectionMinimum,
          expectedObjectionFields: sample.feedback.expectedObjectionFields,
          responseCount: insight.objectionResponses.length,
          objectionRowsWithMissingFields,
          objectionResponsesMissingEvidence,
        }),
    ],
  };
}

function missingItems(expected, actual) {
  const actualSet = new Set(actual);
  return expected.filter((item) => !actualSet.has(item));
}

async function readJsonIfExists(path) {
  if (!path) return undefined;
  try {
    return JSON.parse(await readFile(resolve(path), 'utf-8'));
  } catch {
    return undefined;
  }
}

function newest(items) {
  return [...asArray(items)].sort((a, b) =>
    String(b?.updatedAt ?? b?.createdAt ?? '').localeCompare(String(a?.updatedAt ?? a?.createdAt ?? '')),
  )[0];
}

function workspaceDataPath(workspacePath, fileName) {
  return join(resolve(workspacePath), '.content-studio', fileName);
}

function stringList(values) {
  return asArray(values).map(String).map((item) => item.trim()).filter(Boolean);
}

function textMatchesAny(value, patterns) {
  return patterns.some((pattern) => pattern.test(value));
}

function searchableInputSourceText(source) {
  const value = asObject(source);
  return [
    value.purpose,
    value.kind,
    value.title,
    ...asArray(value.tags),
  ].map(String).join(' ');
}

function isProductBriefInputSource(source) {
  const value = asObject(source);
  if (value.purpose === 'product-brief' || value.kind === 'sku-table') return true;
  return textMatchesAny(searchableInputSourceText(value), [/sku/i, /产品资料/, /brief/i, /卖点/, /规格/]);
}

function isFeedbackInputSource(source) {
  const value = asObject(source);
  if (value.purpose === 'user-feedback') return true;
  return textMatchesAny(searchableInputSourceText(value), [/评论/, /差评/, /客服/, /用户反馈/, /私信/, /问答/, /feedback/i]);
}

function isSuccessfulAssetInputSource(source) {
  const value = asObject(source);
  if (value.purpose !== 'successful-asset') return false;
  const tags = asArray(value.tags).map(String);
  return tags.includes('prompt-distilled') || String(value.title || '').includes('成功素材');
}

function findPromptDraftForDistilledSource(promptDrafts, source) {
  const sourceId = String(asObject(source).id || '');
  if (!sourceId) return undefined;
  return newest(asArray(promptDrafts).filter((draft) =>
    asArray(asObject(draft).inputSourceIds).map(String).includes(sourceId),
  ));
}

function findReviewForDistilledSource(assetReviews, source) {
  const value = asObject(source);
  const sourcePath = String(value.sourcePath || '');
  const title = String(value.title || '');
  return newest(asArray(assetReviews)
    .map((review) => asObject(review))
    .filter((review) => String(review.status || '') === 'approved')
    .filter((review) => {
      const reviewPath = String(review.path || '');
      const reviewTitle = String(review.title || '');
      return (sourcePath && reviewPath === sourcePath) ||
        (sourcePath && reviewPath.endsWith(basename(sourcePath))) ||
        (reviewTitle && title.includes(reviewTitle));
    }));
}

function artifactRefsForSuccessfulAsset(workflowRuns, source, draft, review) {
  const workflowRunId = String(asObject(source).workflowRunId || asObject(draft).workflowRunId || asObject(review).workflowRunId || '');
  const run = asArray(workflowRuns).map((item) => asObject(item)).find((item) => String(item.id || '') === workflowRunId);
  return asArray(run?.artifactRefs).map(String).filter(Boolean);
}

function referenceFieldsFromLog(log) {
  const analysis = asObject(asObject(log?.output).analysis);
  return DEFAULT_EXPECTATIONS.referencePromptFields.filter((field) => {
    const value = analysis[field];
    return Array.isArray(value) ? value.length > 0 : Boolean(String(value ?? '').trim());
  });
}

function referenceBoundaryTermsFromLog(log) {
  const analysis = asObject(asObject(log?.output).analysis);
  return [
    String(analysis.negativePrompt || ''),
    ...stringList(analysis.risks),
    ...stringList(analysis.qualityChecklist),
  ].map((item) => item.trim()).filter(Boolean);
}

function referenceSourcesFromLog(log) {
  const input = asObject(log?.input);
  const sources = asArray(input.referenceSources)
    .map((source) => asObject(source).title || asObject(source).id || asObject(source).sourcePath)
    .map(String)
    .filter(Boolean);
  return sources.length ? sources : stringList(input.referenceSourceIds);
}

function referenceSourceKind(source) {
  const value = String(source || '').toLowerCase();
  if (/\.(png|jpe?g|webp|gif|heic|avif)(\?|#|$)/.test(value) || value.includes('参考图') || value.includes('图片')) {
    return 'image';
  }
  if (/\.(mp4|mov|webm|m4v|avi)(\?|#|$)/.test(value) || value.includes('参考视频') || value.includes('视频')) {
    return 'video';
  }
  return '';
}

function referenceSourceKinds(sources) {
  return Array.from(new Set(sources.map(referenceSourceKind).filter(Boolean)));
}

function referenceSourceKindFromPayload(source) {
  const value = asObject(source);
  const kind = String(value.kind || '').toLowerCase();
  const purpose = String(value.purpose || '').toLowerCase();
  if (kind === 'image' || kind === 'reference-image') return 'image';
  if (kind === 'video' || kind === 'reference-video') return 'video';
  if (purpose === 'reference-image') return 'image';
  if (purpose === 'reference-video') return 'video';
  return referenceSourceKind([
    value.sourcePath,
    value.sourceUrl,
    value.title,
    value.id,
  ].filter(Boolean).join(' '));
}

function referenceSourceKindsFromLog(log) {
  const input = asObject(log?.input);
  const fromPayload = asArray(input.referenceSources)
    .map(referenceSourceKindFromPayload)
    .filter(Boolean);
  if (fromPayload.length) return Array.from(new Set(fromPayload));
  return referenceSourceKinds(referenceSourcesFromLog(log));
}

function mediaCostFromVideoLog(log) {
  const output = asObject(log?.output);
  const cost = asObject(output.costEstimate);
  return {
    model: String(output.model || log?.model || ''),
    status: String(log?.status || ''),
    durationSeconds: Number(output.durationSeconds || cost.durationSeconds || 0),
    currency: String(cost.currency || ''),
    unitPrice: Number(cost.unitPrice || 0),
    estimatedCost: Number(cost.estimatedCost || 0),
    source: String(cost.source || ''),
  };
}

function reviewStatusesFromAssetReviews(assetReviews, mixManifest) {
  const assetKeys = new Set(asArray(asObject(mixManifest).assets)
    .map((asset) => String(asObject(asset).id || '').trim())
    .filter(Boolean));
  if (assetKeys.size === 0) return [];
  return Array.from(new Set(asArray(assetReviews)
    .map((review) => asObject(review))
    .filter((review) => assetKeys.has(String(review.assetKey || '').trim()))
    .map((review) => String(review.status || '').trim())
    .filter(Boolean)));
}

function reviewStatusesFromOverlayCards(assetReviews, overlayCards) {
  const overlayIds = new Set(asArray(overlayCards)
    .map((card) => String(asObject(card).id || '').trim())
    .filter(Boolean));
  if (overlayIds.size === 0) return [];
  return Array.from(new Set(asArray(assetReviews)
    .map((review) => asObject(review))
    .filter((review) => String(review.kind || '') === 'overlay')
    .filter((review) => {
      const sourceId = String(review.sourceId || '').trim();
      const assetKey = String(review.assetKey || '').trim();
      return overlayIds.has(sourceId) || Array.from(overlayIds).some((id) => assetKey === `overlay:${id}`);
    })
    .map((review) => String(review.status || '').trim())
    .filter(Boolean)));
}

export async function loadWorkspaceAcceptanceInput(workspacePath) {
  const root = resolve(workspacePath);
  const [
    brandRecords,
    ipRecords,
    sceneCards,
    generationLogs,
    mixPackages,
    platformDrafts,
    assetReviews,
    inputSources,
    promptDrafts,
    workflowRuns,
    overlayCards,
  ] = await Promise.all([
    readJsonIfExists(workspaceDataPath(root, 'brand-knowledge-bases.json')),
    readJsonIfExists(workspaceDataPath(root, 'ip-knowledge-bases.json')),
    readJsonIfExists(workspaceDataPath(root, 'scene-cards.json')),
    readJsonIfExists(workspaceDataPath(root, 'generation-logs.json')),
    readJsonIfExists(workspaceDataPath(root, 'mix-packages.json')),
    readJsonIfExists(workspaceDataPath(root, 'platform-drafts.json')),
    readJsonIfExists(workspaceDataPath(root, 'asset-reviews.json')),
    readJsonIfExists(workspaceDataPath(root, 'input-sources.json')),
    readJsonIfExists(workspaceDataPath(root, 'prompt-drafts.json')),
    readJsonIfExists(workspaceDataPath(root, 'workflow-runs.json')),
    readJsonIfExists(workspaceDataPath(root, 'overlay-cards.json')),
  ]);
  const brand = newest(brandRecords);
  const ip = newest(ipRecords);
  const referenceLog = newest(asArray(generationLogs).filter((log) =>
    log?.kind === 'reference-reverse' && log?.status === 'succeeded',
  ));
  const videoLog = newest(asArray(generationLogs).filter((log) =>
    log?.kind === 'video' && asObject(log?.output).costEstimate,
  ));
  const videoBreakdownLog = newest(asArray(generationLogs).filter((log) =>
    log?.kind === 'video-breakdown' && log?.status === 'succeeded',
  ));
  const videoScriptLog = newest(asArray(generationLogs).filter((log) =>
    log?.kind === 'video-script' && log?.status === 'succeeded',
  ));
  const mixPackage = newest(mixPackages);
  const platformDraft = newest(platformDrafts);
  const distilledSource = newest(asArray(inputSources).filter(isSuccessfulAssetInputSource));
  const distilledDraft = findPromptDraftForDistilledSource(promptDrafts, distilledSource);
  const distilledReview = findReviewForDistilledSource(assetReviews, distilledSource);
  const distilledWorkflowRefs = artifactRefsForSuccessfulAsset(workflowRuns, distilledSource, distilledDraft, distilledReview);
  const mixManifestPath = mixPackage?.manifestPath ||
    (mixPackage?.packageDir ? join(mixPackage.packageDir, 'manifest.json') : '');
  const mixManifest = await readJsonIfExists(mixManifestPath);
  const scenes = asArray(sceneCards).length
    ? asArray(sceneCards).slice(0, 8)
    : stringList(brand?.sceneSeeds);
  return normalizeAcceptanceInput({
    mode: 'workspace',
    workspacePath: root,
    brand: {
      title: brand?.title,
      facts: [
        ...stringList(brand?.productFacts),
        ...stringList(brand?.coreSellingPoints),
      ],
      compliance: stringList(brand?.complianceBoundaries),
      scenes,
    },
    ip: {
      title: ip?.title,
      layers: asObject(ip?.layers),
    },
    productBrief: {
      sources: asArray(inputSources)
        .filter(isProductBriefInputSource)
        .map((source) => normalizeInputSource(source, 'product-brief')),
    },
    feedback: {
      sources: asArray(inputSources)
        .filter(isFeedbackInputSource)
        .map((source) => normalizeInputSource(source, 'user-feedback')),
    },
    reference: {
      sources: referenceSourcesFromLog(referenceLog),
      actualPromptFields: referenceFieldsFromLog(referenceLog),
      actualSourceKinds: referenceSourceKindsFromLog(referenceLog),
      actualBoundaryTerms: referenceBoundaryTermsFromLog(referenceLog),
    },
    videoBreakdown: {
      sources: [
        String(asObject(videoBreakdownLog?.input).source || ''),
        ...referenceSourcesFromLog(videoBreakdownLog),
      ].filter(Boolean),
      actual: asObject(videoBreakdownLog?.output),
      script: {
        ...asObject(videoScriptLog?.output),
        breakdownLogId: String(asObject(videoScriptLog?.input).breakdownLogId || videoBreakdownLog?.id || ''),
      },
    },
    videoPackage: {
      packageDir: mixPackage?.packageDir,
      manifestPath: mixPackage?.manifestPath,
      importGuidePath: mixPackage?.importGuidePath,
      actualFiles: mixPackage?.manifestCsvPath ? ['manifest.csv'] : [],
      actualReviewStatuses: reviewStatusesFromAssetReviews(assetReviews, mixManifest),
    },
    platformDraft: {
      packageDir: platformDraft?.packageDir,
      manifestPath: platformDraft?.manifestPath,
    },
    mediaCost: {
      actual: mediaCostFromVideoLog(videoLog),
    },
    successfulAsset: {
      actual: {
        assetKey: distilledReview?.assetKey,
        kind: distilledReview?.kind || distilledSource?.kind,
        path: distilledReview?.path || distilledSource?.sourcePath,
        title: distilledReview?.title || distilledSource?.title,
        reviewStatus: distilledReview?.status,
        workflowRunId: distilledSource?.workflowRunId || distilledDraft?.workflowRunId || distilledReview?.workflowRunId,
        originalPromptDraftId: distilledSource?.relatedPromptDraftId,
        workflowArtifactRefs: distilledWorkflowRefs,
        distilledInputSource: distilledSource,
        distilledPromptDraft: distilledDraft,
      },
    },
    greenScreen: {
      actualCards: asArray(overlayCards).map(normalizeOverlayCard),
      actualReviewStatuses: reviewStatusesFromOverlayCards(assetReviews, overlayCards),
    },
    trace: {
      actualWorkflowRunRefs: [
        { source: 'reference-log', workflowRunId: referenceLog?.workflowRunId },
        { source: 'video-breakdown-log', workflowRunId: videoBreakdownLog?.workflowRunId },
        { source: 'video-script-log', workflowRunId: videoScriptLog?.workflowRunId },
        { source: 'video-generation-log', workflowRunId: videoLog?.workflowRunId },
        { source: 'mix-package', workflowRunId: mixPackage?.workflowRunId },
        { source: 'platform-draft', workflowRunId: platformDraft?.workflowRunId },
      ],
    },
  });
}

async function listPackageFiles(packageDir) {
  if (!packageDir) return [];
  try {
    const entries = await readdir(resolve(packageDir), { withFileTypes: true });
    return entries.map((entry) => entry.isDirectory() ? `${entry.name}/` : entry.name);
  } catch {
    return [];
  }
}

function traceFieldsFromMixManifest(manifest) {
  const fields = new Set();
  if (manifest && typeof manifest === 'object') {
    if ('workflowRunId' in manifest) fields.add('workflowRunId');
    const assets = Array.isArray(manifest.assets) ? manifest.assets : [];
    for (const asset of assets) {
      if (!asset || typeof asset !== 'object') continue;
      for (const key of ['promptDraftId', 'sourceId', 'packagedPath']) {
        if (key in asset) fields.add(key);
      }
    }
  }
  return Array.from(fields);
}

function assetKindsFromMixManifest(manifest) {
  return Array.from(new Set(asArray(asObject(manifest).assets)
    .map((asset) => String(asObject(asset).kind || '').trim())
    .filter(Boolean)));
}

function reviewStatusesFromMixManifest(manifest) {
  return Array.from(new Set(asArray(asObject(manifest).assets)
    .map((asset) => String(asObject(asset).reviewStatus || '').trim())
    .filter(Boolean)));
}

async function packagedFileEvidenceFromMixManifest(packageDir, manifest) {
  const declaredPaths = asArray(asObject(manifest).assets)
    .map((asset) => String(asObject(asset).packagedPath || '').trim())
    .filter(Boolean);
  const fileEvidence = await packagedFileEvidenceFromPaths(packageDir, declaredPaths);
  return { declaredPaths, ...fileEvidence };
}

function traceFieldsFromPlatformManifest(manifest) {
  const fields = new Set();
  const value = asObject(manifest);
  for (const key of DEFAULT_EXPECTATIONS.platformDraftTraceFields) {
    if (key in value) fields.add(key);
  }
  return Array.from(fields);
}

async function readableDraftFile(packageDir, manifest, key, fallbackName) {
  const fileName = String(asObject(asObject(manifest).files)[key] || fallbackName);
  if (!packageDir || !fileName) return '';
  try {
    return await readFile(resolve(packageDir, fileName), 'utf-8');
  } catch {
    return '';
  }
}

async function contentFieldsFromPlatformDraft(packageDir, manifest) {
  const fields = [];
  const draft = await readableDraftFile(packageDir, manifest, 'markdown', 'draft.md');
  const platformCopy = await readableDraftFile(packageDir, manifest, 'platformCopy', 'platform-copy.txt');
  const formatGuide = await readableDraftFile(packageDir, manifest, 'formatGuide', 'format-guide.md');
  const checklist = await readableDraftFile(packageDir, manifest, 'checklist', 'publish-checklist.md');

  if (draft.trim().length >= 20) fields.push('draft');
  if (platformCopy.includes('发布前补充') && platformCopy.trim().length >= 20) fields.push('platformCopy');
  if (formatGuide.includes('格式指南') && /发布前复核|平台格式|目标平台/.test(formatGuide)) fields.push('formatGuide');
  if (checklist.includes('检查项') && checklist.includes('交付边界')) fields.push('publishChecklist');
  if (/不包含.*自动发布|不自动发布|不代表已发布/.test(checklist) && /人工确认|人工复制|最终确认/.test(checklist)) {
    fields.push('publishBoundary');
  }
  return fields;
}

async function presentTermsFromFile(filePath, expectedTerms) {
  if (!filePath) return [];
  try {
    const content = await readFile(resolve(filePath), 'utf-8');
    return expectedTerms.filter((term) => content.includes(term));
  } catch {
    return [];
  }
}

async function isFile(path) {
  if (!path) return false;
  try {
    return (await stat(resolve(path))).isFile();
  } catch {
    return false;
  }
}

async function isNonEmptyFile(path) {
  if (!path) return false;
  try {
    const info = await stat(resolve(path));
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}

function resolveMaybeRelative(baseDir, filePath) {
  if (!filePath) return '';
  if (isAbsolute(filePath)) return resolve(filePath);
  return baseDir ? resolve(baseDir, filePath) : resolve(filePath);
}

function isWithinDirectory(baseDir, filePath) {
  if (!baseDir || !filePath) return true;
  const distance = relative(resolve(baseDir), resolve(filePath));
  return distance === '' || (distance && !distance.startsWith('..') && !isAbsolute(distance));
}

async function packagedFileEvidenceFromPaths(baseDir, filePaths) {
  const existingPaths = [];
  const missingPaths = [];
  const base = baseDir ? resolve(baseDir) : '';

  for (const filePath of filePaths) {
    const resolvedPath = resolveMaybeRelative(base, filePath);
    if (await isNonEmptyFile(resolvedPath)) {
      existingPaths.push(resolvedPath);
    } else {
      missingPaths.push(resolvedPath);
    }
  }

  return { existingPaths, missingPaths };
}

async function hydrateExternalImportEvidenceFiles(evidence, baseDir) {
  const value = normalizeExternalMixImportEvidence(evidence);
  const verifiedEvidenceFiles = [];
  const missingEvidenceFiles = [];
  const outOfScopeEvidenceFiles = [];
  const base = baseDir ? resolve(baseDir) : '';
  for (const filePath of value.evidenceFiles) {
    const resolvedPath = resolveMaybeRelative(base, filePath);
    if (base && !isWithinDirectory(base, resolvedPath)) {
      outOfScopeEvidenceFiles.push(resolvedPath);
      continue;
    }
    if (await isNonEmptyFile(resolvedPath)) {
      verifiedEvidenceFiles.push(resolvedPath);
    } else {
      missingEvidenceFiles.push(resolvedPath);
    }
  }
  return {
    ...value,
    verifiedEvidenceFiles: Array.from(new Set([...value.verifiedEvidenceFiles, ...verifiedEvidenceFiles])),
    missingEvidenceFiles: Array.from(new Set([...value.missingEvidenceFiles, ...missingEvidenceFiles])),
    outOfScopeEvidenceFiles: Array.from(new Set([...value.outOfScopeEvidenceFiles, ...outOfScopeEvidenceFiles])),
  };
}

function workflowRunRefsFromManifest(source, manifest) {
  const workflowRunId = String(asObject(manifest).workflowRunId || '').trim();
  return workflowRunId ? [{ source, workflowRunId }] : [];
}

async function hydrateAcceptanceInputEvidence(sample) {
  const next = {
    ...sample,
    videoPackage: { ...sample.videoPackage },
    platformDraft: { ...sample.platformDraft },
    trace: {
      ...sample.trace,
      actualWorkflowRunRefs: [...sample.trace.actualWorkflowRunRefs],
    },
  };
  if (next.videoPackage.packageDir) {
    next.videoPackage.actualFiles = Array.from(new Set([
      ...next.videoPackage.actualFiles,
      ...await listPackageFiles(next.videoPackage.packageDir),
    ]));
  }
  const mixManifestPath = next.videoPackage.manifestPath ||
    (next.videoPackage.packageDir ? join(next.videoPackage.packageDir, 'manifest.json') : '');
  const packageDirForEvidence = next.videoPackage.packageDir ||
    (mixManifestPath ? dirname(mixManifestPath) : '');
  if (next.videoPackage.actualPackagedFilePaths.length) {
    const manualPackagedFileEvidence = await packagedFileEvidenceFromPaths(
      packageDirForEvidence,
      next.videoPackage.actualPackagedFilePaths,
    );
    next.videoPackage.unverifiedPackagedFilePaths = Array.from(new Set([
      ...next.videoPackage.unverifiedPackagedFilePaths,
      ...next.videoPackage.actualPackagedFilePaths,
    ]));
    next.videoPackage.actualPackagedFilePaths = manualPackagedFileEvidence.existingPaths;
    next.videoPackage.missingPackagedFilePaths = Array.from(new Set([
      ...next.videoPackage.missingPackagedFilePaths,
      ...manualPackagedFileEvidence.missingPaths,
    ]));
  }
  const mixManifest = await readJsonIfExists(mixManifestPath);
  if (mixManifest && !next.videoPackage.actualFiles.includes('manifest.json')) {
    next.videoPackage.actualFiles = Array.from(new Set([...next.videoPackage.actualFiles, basename(mixManifestPath)]));
  }
  if (mixManifest && next.videoPackage.actualTraceFields.length === 0) {
    next.videoPackage.actualTraceFields = traceFieldsFromMixManifest(mixManifest);
  }
  if (mixManifest && next.videoPackage.actualAssetKinds.length === 0) {
    next.videoPackage.actualAssetKinds = assetKindsFromMixManifest(mixManifest);
  }
  if (mixManifest && next.videoPackage.actualReviewStatuses.length === 0) {
    next.videoPackage.actualReviewStatuses = reviewStatusesFromMixManifest(mixManifest);
  }
  if (mixManifest) {
    const packageDir = next.videoPackage.packageDir || dirname(mixManifestPath);
    const packagedFileEvidence = await packagedFileEvidenceFromMixManifest(packageDir, mixManifest);
    next.videoPackage.declaredPackagedFilePaths = Array.from(new Set([
      ...next.videoPackage.declaredPackagedFilePaths,
      ...packagedFileEvidence.declaredPaths,
    ]));
    next.videoPackage.actualPackagedFilePaths = Array.from(new Set([
      ...next.videoPackage.actualPackagedFilePaths,
      ...packagedFileEvidence.existingPaths,
    ]));
    next.videoPackage.missingPackagedFilePaths = Array.from(new Set([
      ...next.videoPackage.missingPackagedFilePaths,
      ...packagedFileEvidence.missingPaths,
    ]));
  }
  next.trace.actualWorkflowRunRefs = [
    ...next.trace.actualWorkflowRunRefs,
    ...workflowRunRefsFromManifest('mix-package-manifest', mixManifest),
  ];
  const importGuidePath = next.videoPackage.importGuidePath ||
    (next.videoPackage.packageDir ? join(next.videoPackage.packageDir, 'import-guide.md') : '');
  if (await isFile(importGuidePath) && !next.videoPackage.actualFiles.includes(basename(importGuidePath))) {
    next.videoPackage.actualFiles = Array.from(new Set([...next.videoPackage.actualFiles, basename(importGuidePath)]));
  }
  if (importGuidePath && next.videoPackage.actualGuideTerms.length === 0) {
    next.videoPackage.actualGuideTerms = await presentTermsFromFile(importGuidePath, next.videoPackage.expectedGuideTerms);
  }
  const configuredImportEvidencePath = next.videoPackage.externalImportEvidencePath
    ? resolveMaybeRelative(packageDirForEvidence, next.videoPackage.externalImportEvidencePath)
    : '';
  const defaultImportEvidencePath = packageDirForEvidence
    ? join(packageDirForEvidence, 'import-evidence.json')
    : '';
  const externalImportEvidencePath = configuredImportEvidencePath ||
    ((await isFile(defaultImportEvidencePath)) ? defaultImportEvidencePath : '');
  const fileExternalImportEvidence = await readJsonIfExists(externalImportEvidencePath);
  next.videoPackage.externalImportEvidencePath = externalImportEvidencePath;
  next.videoPackage.externalImportEvidence = await hydrateExternalImportEvidenceFiles(
    fileExternalImportEvidence
      ? {
          ...next.videoPackage.externalImportEvidence,
          ...fileExternalImportEvidence,
          evidenceFiles: [
            ...next.videoPackage.externalImportEvidence.evidenceFiles,
            ...asArray(asObject(fileExternalImportEvidence).evidenceFiles || asObject(fileExternalImportEvidence).files),
          ],
        }
      : next.videoPackage.externalImportEvidence,
    packageDirForEvidence,
  );

  if (next.platformDraft.packageDir) {
    next.platformDraft.actualFiles = Array.from(new Set([
      ...next.platformDraft.actualFiles,
      ...await listPackageFiles(next.platformDraft.packageDir),
    ]));
  }
  const platformManifestPath = next.platformDraft.manifestPath ||
    (next.platformDraft.packageDir ? join(next.platformDraft.packageDir, 'manifest.json') : '');
  const platformManifest = await readJsonIfExists(platformManifestPath);
  if (platformManifest?.files && typeof platformManifest.files === 'object' && next.platformDraft.actualFiles.length === 0) {
    next.platformDraft.actualFiles = Object.values(platformManifest.files).map(String).filter(Boolean);
  }
  if (platformManifest && !next.platformDraft.actualFiles.includes('manifest.json')) {
    next.platformDraft.actualFiles = Array.from(new Set([...next.platformDraft.actualFiles, basename(platformManifestPath)]));
  }
  if (platformManifest && next.platformDraft.actualTraceFields.length === 0) {
    next.platformDraft.actualTraceFields = traceFieldsFromPlatformManifest(platformManifest);
  }
  if (next.platformDraft.packageDir && next.platformDraft.actualContentFields.length === 0) {
    next.platformDraft.actualContentFields = await contentFieldsFromPlatformDraft(next.platformDraft.packageDir, platformManifest);
  }
  next.trace.actualWorkflowRunRefs = [
    ...next.trace.actualWorkflowRunRefs,
    ...workflowRunRefsFromManifest('platform-draft-manifest', platformManifest),
  ];
  return next;
}

function referenceAcceptance(sample) {
  const actualPromptFields = sample.reference.actualPromptFields.length
    ? sample.reference.actualPromptFields
    : sample.mode === 'local-sample' ? sample.reference.expectedPromptFields : [];
  const missingPromptFields = missingItems(sample.reference.expectedPromptFields, actualPromptFields);
  const actualSourceKinds = sample.reference.actualSourceKinds.length
    ? sample.reference.actualSourceKinds
    : referenceSourceKinds(sample.reference.sources);
  const missingSourceKinds = missingItems(sample.reference.expectedSourceKinds, actualSourceKinds);
  const actualBoundaryTerms = sample.reference.actualBoundaryTerms.length
    ? sample.reference.actualBoundaryTerms
    : sample.mode === 'local-sample' ? sample.reference.expectedBoundaryTerms : [];
  const boundaryText = actualBoundaryTerms.join('\n');
  const missingBoundaryTerms = sample.reference.expectedBoundaryTerms
    .filter((term) => !boundaryText.includes(term));
  return {
    sampleSources: sample.reference.sources,
    sourceKinds: actualSourceKinds,
    boundaryTerms: actualBoundaryTerms,
    checks: [
      missingPromptFields.length === 0
        ? passCheck('reference-fields', '对标图反推字段完整', '验收结果包含构图、光线、负面约束、风险和质检清单。', {
          requiredFields: sample.reference.expectedPromptFields,
          actualFields: actualPromptFields,
        })
        : failCheck('reference-fields', '对标图反推字段完整', '对标图反推字段缺失。', {
          requiredFields: sample.reference.expectedPromptFields,
          actualFields: actualPromptFields,
          missingFields: missingPromptFields,
        }),
      sample.reference.sources.length > 0 && missingBoundaryTerms.length === 0
        ? passCheck('reference-boundary', '对标图反推不复制竞品元素', '验收边界要求只复用构图、光线、镜头、留白和真实感，并显式保留竞品复制与授权风险约束。', {
          requiredBoundaryTerms: sample.reference.expectedBoundaryTerms,
          actualBoundaryTerms,
        })
        : failCheck('reference-boundary', '对标图反推不复制竞品元素', '缺少参考来源，或对标反推输出没有证明竞品复制和授权风险边界。', {
          requiredBoundaryTerms: sample.reference.expectedBoundaryTerms,
          actualBoundaryTerms,
          missingBoundaryTerms,
        }),
      missingSourceKinds.length === 0
        ? passCheck('reference-source-kinds', '参考图和参考视频来源齐全', '验收资料同时包含图片和视频参考来源。', {
          requiredSourceKinds: sample.reference.expectedSourceKinds,
          actualSourceKinds,
        })
        : failCheck('reference-source-kinds', '参考图和参考视频来源齐全', '参考来源不足，无法覆盖图像和视频两类对标反推。', {
          requiredSourceKinds: sample.reference.expectedSourceKinds,
          actualSourceKinds,
          missingSourceKinds,
        }),
    ],
  };
}

function objectMissingFields(value, fields) {
  const source = asObject(value);
  return fields.filter((field) => {
    const fieldValue = source[field];
    return Array.isArray(fieldValue) ? fieldValue.length === 0 : !String(fieldValue ?? '').trim();
  });
}

function videoBreakdownAcceptance(sample) {
  const actual = asObject(sample.videoBreakdown.actual);
  const script = asObject(sample.videoBreakdown.script);
  const segments = asArray(actual.segments).map((segment) => asObject(segment));
  const storyboard = asArray(script.storyboard).map((shot) => asObject(shot));
  const segmentRowsWithMissingFields = segments
    .map((segment, index) => ({
      index,
      missingFields: objectMissingFields(segment, sample.videoBreakdown.expectedSegmentFields),
    }))
    .filter((item) => item.missingFields.length > 0);
  const storyboardRowsWithMissingFields = storyboard
    .map((shot, index) => ({
      index,
      missingFields: objectMissingFields(shot, sample.videoBreakdown.expectedStoryboardFields),
    }))
    .filter((item) => item.missingFields.length > 0);
  const risks = asArray(actual.risks)
    .map((risk) => String(asObject(risk).message || risk).trim())
    .filter(Boolean);
  const riskText = risks.join('\n');
  const missingBoundaryTerms = sample.videoBreakdown.expectedBoundaryTerms
    .filter((term) => !riskText.includes(term));
  const reusableFormula = asArray(actual.reusableFormula).map(String).filter(Boolean);
  const missingScriptFields = sample.videoBreakdown.expectedScriptFields.filter((field) => {
    if (field === 'storyboard') return storyboard.length === 0;
    if (field === 'publishCheck') return asArray(script.publishCheck).length === 0;
    return !String(script[field] ?? '').trim();
  });
  const linkedBreakdown = Boolean(String(script.breakdownLogId || '').trim()) || sample.mode === 'local-sample';
  return {
    sources: sample.videoBreakdown.sources,
    summary: String(actual.summary || ''),
    dimensions: asArray(actual.dimensions).map(String).filter(Boolean),
    segments,
    reusableFormula,
    risks,
    script: {
      title: String(script.title || ''),
      storyboard,
      videoPrompt: String(script.videoPrompt || ''),
      publishCheck: asArray(script.publishCheck),
      breakdownLogId: String(script.breakdownLogId || ''),
    },
    checks: [
      sample.videoBreakdown.sources.length > 0 && segments.length > 0 && segmentRowsWithMissingFields.length === 0
        ? passCheck('video-breakdown-segments', '参考视频拆解片段完整', '参考视频已拆出时间段、钩子、画面、口播、节奏和可复用点。', {
          expectedSegmentFields: sample.videoBreakdown.expectedSegmentFields,
          segmentCount: segments.length,
        })
        : failCheck('video-breakdown-segments', '参考视频拆解片段完整', '缺少参考视频来源，或拆解片段字段不足。', {
          expectedSegmentFields: sample.videoBreakdown.expectedSegmentFields,
          segmentCount: segments.length,
          segmentRowsWithMissingFields,
        }),
      reusableFormula.length > 0 && missingBoundaryTerms.length === 0
        ? passCheck('video-breakdown-boundary', '参考视频只复用结构不照搬', '拆解结果保留可复用公式，同时显式提示照搬、授权和合规风险。', {
          reusableFormula,
          requiredBoundaryTerms: sample.videoBreakdown.expectedBoundaryTerms,
          risks,
        })
        : failCheck('video-breakdown-boundary', '参考视频只复用结构不照搬', '拆解结果缺少可复用公式，或没有证明照搬、授权、合规边界。', {
          reusableFormula,
          requiredBoundaryTerms: sample.videoBreakdown.expectedBoundaryTerms,
          risks,
          missingBoundaryTerms,
        }),
      missingScriptFields.length === 0 && storyboardRowsWithMissingFields.length === 0
        ? passCheck('video-script-structure', '视频脚本分镜可执行', '新视频脚本包含标题、正文、分镜、视频 Prompt 和发布检查。', {
          expectedScriptFields: sample.videoBreakdown.expectedScriptFields,
          expectedStoryboardFields: sample.videoBreakdown.expectedStoryboardFields,
          storyboardCount: storyboard.length,
        })
        : failCheck('video-script-structure', '视频脚本分镜可执行', '视频脚本缺少普通用户下游生产所需字段。', {
          expectedScriptFields: sample.videoBreakdown.expectedScriptFields,
          missingScriptFields,
          expectedStoryboardFields: sample.videoBreakdown.expectedStoryboardFields,
          storyboardRowsWithMissingFields,
        }),
      linkedBreakdown && String(script.videoPrompt || '').trim()
        ? passCheck('video-script-trace', '脚本关联拆解来源', '视频脚本保留拆解来源或 local-sample 明示来源，可追溯参考视频结构。', {
          breakdownLogId: String(script.breakdownLogId || ''),
        })
        : failCheck('video-script-trace', '脚本关联拆解来源', '视频脚本没有关联拆解来源，无法证明由参考视频结构进入新脚本。', {
          breakdownLogId: String(script.breakdownLogId || ''),
        }),
    ],
  };
}

function overlayCardMissingFields(card, fields) {
  return fields.filter((field) => {
    if (field === 'durationSeconds') return Number(card.durationSeconds || 0) <= 0;
    return !String(card[field] ?? '').trim();
  });
}

function greenScreenAcceptance(sample) {
  const cards = sample.greenScreen.actualCards;
  const actualTypes = Array.from(new Set(cards.map((card) => card.type).filter(Boolean)));
  const missingTypes = missingItems(sample.greenScreen.expectedCardTypes, actualTypes);
  const rowsWithMissingFields = cards
    .map((card, index) => ({
      index,
      title: card.title,
      missingFields: overlayCardMissingFields(card, sample.greenScreen.expectedCardFields),
    }))
    .filter((row) => row.missingFields.length > 0);
  const invalidFormatRows = cards
    .map((card, index) => ({
      index,
      title: card.title,
      assetPath: card.assetPath,
      background: card.background,
      aspectRatio: card.aspectRatio,
    }))
    .filter((row) =>
      !/\.(svg|png|webp)$/i.test(row.assetPath) ||
      row.background !== 'green-screen' ||
      row.aspectRatio !== '9:16',
    );
  const tooLongRows = cards
    .map((card, index) => ({ index, title: card.title, text: card.text, length: card.text.length }))
    .filter((row) => row.length > sample.greenScreen.maxTextLength);
  const reviewStatuses = sample.greenScreen.actualReviewStatuses.length
    ? sample.greenScreen.actualReviewStatuses
    : sample.mode === 'local-sample' ? ['approved'] : [];
  return {
    cards,
    actualTypes,
    reviewStatuses,
    checks: [
      cards.length > 0 && missingTypes.length === 0
        ? passCheck('green-screen-card-types', '绿幕文案图卡片类型完整', '标题卡、卖点卡和行动卡均已生成，可服务第三方混剪叠加。', {
          expectedCardTypes: sample.greenScreen.expectedCardTypes,
          actualTypes,
        })
        : failCheck('green-screen-card-types', '绿幕文案图卡片类型完整', '绿幕文案图缺少标题卡、卖点卡或行动卡。', {
          expectedCardTypes: sample.greenScreen.expectedCardTypes,
          actualTypes,
          missingTypes,
        }),
      rowsWithMissingFields.length === 0 && cards.length > 0
        ? passCheck('green-screen-card-fields', '绿幕文案图字段可交付', '每张绿幕卡都保留文案、时长、素材路径、画幅、背景和 PromptDraft 关联。', {
          expectedCardFields: sample.greenScreen.expectedCardFields,
          cardCount: cards.length,
        })
        : failCheck('green-screen-card-fields', '绿幕文案图字段可交付', '绿幕文案图缺少混剪交付字段。', {
          expectedCardFields: sample.greenScreen.expectedCardFields,
          rowsWithMissingFields,
        }),
      invalidFormatRows.length === 0 && cards.length > 0
        ? passCheck('green-screen-card-format', '绿幕文案图格式适合混剪', '绿幕卡为 9:16 绿幕背景，资产文件可进入 overlays 目录。', {
          acceptedExtensions: ['svg', 'png', 'webp'],
        })
        : failCheck('green-screen-card-format', '绿幕文案图格式适合混剪', '绿幕卡格式、画幅或背景不符合混剪要求。', {
          invalidFormatRows,
        }),
      tooLongRows.length === 0 && cards.length > 0
        ? passCheck('green-screen-card-readable', '绿幕文案图文案可读', '每张绿幕卡文案长度可读，过长内容应拆分成多张卡。', {
          maxTextLength: sample.greenScreen.maxTextLength,
        })
        : failCheck('green-screen-card-readable', '绿幕文案图文案可读', '部分绿幕卡文案过长，普通用户需要先拆分再导出。', {
          maxTextLength: sample.greenScreen.maxTextLength,
          tooLongRows,
        }),
      reviewStatuses.includes('approved') && !reviewStatuses.includes('rejected')
        ? passCheck('green-screen-card-approved', '绿幕文案图已通过审核', '绿幕图通过审核后才能进入混剪包。', {
          reviewStatuses,
        })
        : failCheck('green-screen-card-approved', '绿幕文案图已通过审核', '绿幕图未通过审核，不能进入混剪包。', {
          reviewStatuses,
        }),
    ],
  };
}

function successfulAssetAcceptance(sample) {
  const actual = sample.successfulAsset.actual;
  const source = actual.distilledInputSource;
  const draft = actual.distilledPromptDraft;
  const sourceTags = new Set(source.tags);
  const content = [
    source.extractedText,
    draft.content,
  ].filter(Boolean).join('\n');
  const missingBoundaryTerms = sample.successfulAsset.expectedBoundaryTerms
    .filter((term) => !content.includes(term));
  const sourceLinkedToDraft = Boolean(source.id && draft.inputSourceIds.includes(source.id));
  const linkedOriginalPrompt = Boolean(source.relatedPromptDraftId || actual.originalPromptDraftId);
  const workflowRefs = new Set(actual.workflowArtifactRefs);
  const workflowRefMissing = [
    source.id ? `input-source:${source.id}` : '',
    draft.id ? `prompt-draft:${draft.id}` : '',
    actual.assetKey,
  ].filter(Boolean).filter((ref) => !workflowRefs.has(ref));
  return {
    asset: {
      assetKey: actual.assetKey,
      kind: actual.kind,
      path: actual.path,
      title: actual.title,
      reviewStatus: actual.reviewStatus,
      workflowRunId: actual.workflowRunId,
      originalPromptDraftId: actual.originalPromptDraftId,
    },
    distilledInputSource: source,
    distilledPromptDraft: draft,
    workflowArtifactRefs: actual.workflowArtifactRefs,
    checks: [
      actual.reviewStatus === 'approved' && Boolean(actual.assetKey || actual.path)
        ? passCheck('successful-asset-approved', '成功素材必须先通过审核', '只有已通过审核的本方素材才能反向沉淀 Prompt。', {
          reviewStatus: actual.reviewStatus,
          assetKey: actual.assetKey,
          path: actual.path,
        })
        : failCheck('successful-asset-approved', '成功素材必须先通过审核', '素材未通过审核，不能作为成功经验沉淀。', {
          reviewStatus: actual.reviewStatus,
          assetKey: actual.assetKey,
          path: actual.path,
        }),
      source.purpose === 'successful-asset' && sourceTags.has('prompt-distilled') && Boolean(source.sourcePath || actual.path) && linkedOriginalPrompt
        ? passCheck('successful-asset-source-trace', '成功素材输入源可追溯', '沉淀输入源保留 successful-asset 用途、prompt-distilled 标签、原素材路径和原 Prompt 关联。', {
          sourceId: source.id,
          tags: source.tags,
          sourcePath: source.sourcePath,
          relatedPromptDraftId: source.relatedPromptDraftId || actual.originalPromptDraftId,
        })
        : failCheck('successful-asset-source-trace', '成功素材输入源可追溯', '沉淀输入源缺少用途、标签、原素材路径或原 Prompt 关联。', {
          sourceId: source.id,
          purpose: source.purpose,
          tags: source.tags,
          sourcePath: source.sourcePath,
          relatedPromptDraftId: source.relatedPromptDraftId || actual.originalPromptDraftId,
        }),
      draft.status === 'confirmed' && ['image', 'video'].includes(draft.purpose) && sourceLinkedToDraft
        ? passCheck('successful-asset-prompt-draft', '成功素材生成可复用 Prompt 草稿', '已通过素材沉淀为确认态图片 / 视频 PromptDraft，并绑定沉淀输入源。', {
          draftId: draft.id,
          purpose: draft.purpose,
          promptDraftStatus: draft.status,
          inputSourceIds: draft.inputSourceIds,
        })
        : failCheck('successful-asset-prompt-draft', '成功素材生成可复用 Prompt 草稿', '缺少确认态 PromptDraft，或 PromptDraft 没有关联沉淀输入源。', {
          draftId: draft.id,
          purpose: draft.purpose,
          promptDraftStatus: draft.status,
          inputSourceIds: draft.inputSourceIds,
          expectedInputSourceId: source.id,
        }),
      missingBoundaryTerms.length === 0 && /复用 Prompt 草稿|质量原因|复用要求/.test(content)
        ? passCheck('successful-asset-reuse-boundary', '成功经验只复用本方素材', '沉淀内容保留质量原因、复用 Prompt 和不复制竞品 / 人工确认边界。', {
          requiredBoundaryTerms: sample.successfulAsset.expectedBoundaryTerms,
        })
        : failCheck('successful-asset-reuse-boundary', '成功经验只复用本方素材', '沉淀内容缺少质量原因、复用 Prompt 或不复制竞品 / 人工确认边界。', {
          requiredBoundaryTerms: sample.successfulAsset.expectedBoundaryTerms,
          missingBoundaryTerms,
        }),
      actual.workflowRunId
        ? workflowRefMissing.length === 0
          ? passCheck('successful-asset-workflow-trace', '成功素材回写 SOP 运行', 'SOP 运行记录保留原素材、沉淀输入源和 PromptDraft 引用。', {
            workflowRunId: actual.workflowRunId,
            workflowArtifactRefs: actual.workflowArtifactRefs,
          })
          : failCheck('successful-asset-workflow-trace', '成功素材回写 SOP 运行', 'SOP 运行记录缺少成功素材沉淀引用。', {
            workflowRunId: actual.workflowRunId,
            missingRefs: workflowRefMissing,
            workflowArtifactRefs: actual.workflowArtifactRefs,
          })
        : passCheck('successful-asset-workflow-trace', '成功素材回写 SOP 运行', '该素材未关联 SOP 运行，仅校验输入源和 PromptDraft 追溯。'),
    ],
  };
}

function deliveryAcceptance(sample) {
  const videoFiles = sample.videoPackage.actualFiles.length
    ? sample.videoPackage.actualFiles
    : sample.mode === 'local-sample' ? sample.videoPackage.expectedFiles : [];
  const videoTraceFields = sample.videoPackage.actualTraceFields.length
    ? sample.videoPackage.actualTraceFields
    : sample.mode === 'local-sample' ? sample.videoPackage.requiredTraceFields : [];
  const videoAssetKinds = sample.videoPackage.actualAssetKinds.length
    ? sample.videoPackage.actualAssetKinds
    : sample.mode === 'local-sample' ? sample.videoPackage.requiredAssetKinds : [];
  const videoReviewStatuses = sample.videoPackage.actualReviewStatuses.length
    ? sample.videoPackage.actualReviewStatuses
    : sample.mode === 'local-sample' ? sample.videoPackage.requiredReviewStatuses : [];
  const videoGuideTerms = sample.videoPackage.actualGuideTerms.length
    ? sample.videoPackage.actualGuideTerms
    : sample.mode === 'local-sample' ? sample.videoPackage.expectedGuideTerms : [];
  const platformFiles = sample.platformDraft.actualFiles.length
    ? sample.platformDraft.actualFiles
    : sample.mode === 'local-sample' ? sample.platformDraft.expectedFiles : [];
  const platformTraceFields = sample.platformDraft.actualTraceFields.length
    ? sample.platformDraft.actualTraceFields
    : sample.mode === 'local-sample' ? sample.platformDraft.requiredTraceFields : [];
  const platformContentFields = sample.platformDraft.actualContentFields.length
    ? sample.platformDraft.actualContentFields
    : sample.mode === 'local-sample' ? sample.platformDraft.requiredContentFields : [];
  const missingVideoFiles = missingItems(sample.videoPackage.expectedFiles, videoFiles);
  const missingTraceFields = missingItems(sample.videoPackage.requiredTraceFields, videoTraceFields);
  const missingAssetKinds = missingItems(sample.videoPackage.requiredAssetKinds, videoAssetKinds);
  const missingReviewStatuses = missingItems(sample.videoPackage.requiredReviewStatuses, videoReviewStatuses);
  const missingGuideTerms = missingItems(sample.videoPackage.expectedGuideTerms, videoGuideTerms);
  const requiresPackagedFileEvidence = Boolean(sample.videoPackage.packageDir || sample.videoPackage.manifestPath);
  const hasVerifiedPackagedFiles = !requiresPackagedFileEvidence ||
    (sample.videoPackage.declaredPackagedFilePaths.length > 0 &&
      sample.videoPackage.actualPackagedFilePaths.length > 0 &&
      sample.videoPackage.missingPackagedFilePaths.length === 0);
  const externalImportEvidence = sample.videoPackage.externalImportEvidence;
  const hasExternalImportEvidence = Boolean(
    externalImportEvidence.toolName ||
    externalImportEvidence.importedAt ||
    externalImportEvidence.importedAssetKinds.length ||
    externalImportEvidence.manifestImported ||
    externalImportEvidence.evidenceFiles.length ||
    externalImportEvidence.verifiedEvidenceFiles.length,
  );
  const requiresExternalImportEvidence = Boolean(sample.videoPackage.requireExternalImportEvidence || hasExternalImportEvidence);
  const requiredImportedFileCount = Math.max(1, sample.videoPackage.requiredAssetKinds.length);
  const hasImportedFileCount = externalImportEvidence.importedFileCount >= requiredImportedFileCount;
  const hasCompletedImportResult = hasAcceptedExternalImportResult(externalImportEvidence.result);
  const missingExternalImportFields = [
    externalImportEvidence.toolName ? '' : 'toolName',
    externalImportEvidence.importedAt ? '' : 'importedAt',
    externalImportEvidence.importedAssetKinds.length ? '' : 'importedAssetKinds',
    hasImportedFileCount ? '' : 'importedFileCount',
    externalImportEvidence.manifestImported ? '' : 'manifestImported',
    externalImportEvidence.timelineCreated ? '' : 'timelineCreated',
    hasCompletedImportResult ? '' : 'result',
    externalImportEvidence.verifiedEvidenceFiles.length ? '' : 'evidenceFiles',
  ].filter(Boolean);
  const missingExternalImportKinds = missingItems(sample.videoPackage.requiredAssetKinds, externalImportEvidence.importedAssetKinds);
  const externalImportEvidencePassed = requiresExternalImportEvidence &&
    missingExternalImportFields.length === 0 &&
    missingExternalImportKinds.length === 0 &&
    externalImportEvidence.missingEvidenceFiles.length === 0 &&
    externalImportEvidence.outOfScopeEvidenceFiles.length === 0;
  const missingPlatformFiles = missingItems(sample.platformDraft.expectedFiles, platformFiles);
  const missingPlatformTraceFields = missingItems(sample.platformDraft.requiredTraceFields, platformTraceFields);
  const missingPlatformContentFields = missingItems(sample.platformDraft.requiredContentFields, platformContentFields);
  return {
    checks: [
      missingVideoFiles.length === 0
        ? passCheck('mix-package-files', '混剪包双 manifest 交付', '视频素材包包含素材目录、manifest.json 和 manifest.csv。', {
          expectedFiles: sample.videoPackage.expectedFiles,
          actualFiles: videoFiles,
        })
        : failCheck('mix-package-files', '混剪包双 manifest 交付', '视频素材包文件缺失。', {
          expectedFiles: sample.videoPackage.expectedFiles,
          actualFiles: videoFiles,
          missingFiles: missingVideoFiles,
        }),
      missingTraceFields.length === 0
        ? passCheck('mix-package-trace', '混剪素材追溯字段完整', 'manifest 保留 SOP、PromptDraft、来源和打包路径。', {
          requiredTraceFields: sample.videoPackage.requiredTraceFields,
          actualTraceFields: videoTraceFields,
        })
        : failCheck('mix-package-trace', '混剪素材追溯字段完整', '混剪 manifest 追溯字段缺失。', {
          requiredTraceFields: sample.videoPackage.requiredTraceFields,
          actualTraceFields: videoTraceFields,
          missingFields: missingTraceFields,
        }),
      missingAssetKinds.length === 0 && hasVerifiedPackagedFiles
        ? passCheck('mix-package-assets', '混剪包包含可用素材', requiresPackagedFileEvidence
          ? '混剪 manifest 包含必需素材记录，且 packagedPath 指向的素材文件真实存在。'
          : '混剪 manifest 包含必需素材记录，避免空壳交付包。', {
          requiredAssetKinds: sample.videoPackage.requiredAssetKinds,
          actualAssetKinds: videoAssetKinds,
          declaredPackagedFilePaths: sample.videoPackage.declaredPackagedFilePaths,
          actualPackagedFilePaths: sample.videoPackage.actualPackagedFilePaths,
          unverifiedPackagedFilePaths: sample.videoPackage.unverifiedPackagedFilePaths,
        })
        : failCheck('mix-package-assets', '混剪包包含可用素材', '混剪 manifest 缺少可用素材记录，或 packagedPath 指向的素材文件不存在。', {
          requiredAssetKinds: sample.videoPackage.requiredAssetKinds,
          actualAssetKinds: videoAssetKinds,
          missingAssetKinds,
          declaredPackagedFilePaths: sample.videoPackage.declaredPackagedFilePaths,
          actualPackagedFilePaths: sample.videoPackage.actualPackagedFilePaths,
          missingPackagedFilePaths: sample.videoPackage.missingPackagedFilePaths,
          unverifiedPackagedFilePaths: sample.videoPackage.unverifiedPackagedFilePaths,
        }),
      missingReviewStatuses.length === 0
        ? passCheck('mix-package-approved-assets', '混剪包素材已通过审核', '混剪 manifest 保留素材审核状态，证明导出前已通过审核门槛。', {
          requiredReviewStatuses: sample.videoPackage.requiredReviewStatuses,
          actualReviewStatuses: videoReviewStatuses,
        })
        : failCheck('mix-package-approved-assets', '混剪包素材已通过审核', '混剪 manifest 缺少 approved 审核状态，无法证明素材已过审。', {
          requiredReviewStatuses: sample.videoPackage.requiredReviewStatuses,
          actualReviewStatuses: videoReviewStatuses,
          missingStatuses: missingReviewStatuses,
        }),
      missingGuideTerms.length === 0
        ? passCheck('mix-package-import-guide', '混剪包导入说明可交接', '混剪包包含剪辑人员可读的导入说明，覆盖第三方工具、目录、CSV 和人工审核边界。', {
          expectedGuideTerms: sample.videoPackage.expectedGuideTerms,
          actualGuideTerms: videoGuideTerms,
        })
        : failCheck('mix-package-import-guide', '混剪包导入说明可交接', '混剪包缺少可读导入说明，或说明没有覆盖剪辑人员需要的交接信息。', {
          expectedGuideTerms: sample.videoPackage.expectedGuideTerms,
          actualGuideTerms: videoGuideTerms,
          missingGuideTerms,
        }),
      ...(
        requiresExternalImportEvidence
          ? [
              externalImportEvidencePassed
                ? passCheck('mix-package-external-import', '真实混剪工具导入证据', '第三方混剪软件已按导入说明完成真实导入，并保留可复核证据文件。', {
                  requiredFields: DEFAULT_EXPECTATIONS.videoPackageExternalImportFields,
                  toolName: externalImportEvidence.toolName,
                  importedAt: externalImportEvidence.importedAt,
                  operator: externalImportEvidence.operator,
                  importedAssetKinds: externalImportEvidence.importedAssetKinds,
                  importedFileCount: externalImportEvidence.importedFileCount,
                  requiredImportedFileCount,
                  manifestImported: externalImportEvidence.manifestImported,
                  timelineCreated: externalImportEvidence.timelineCreated,
                  result: externalImportEvidence.result,
                  evidenceFiles: externalImportEvidence.verifiedEvidenceFiles,
                })
                : failCheck('mix-package-external-import', '真实混剪工具导入证据', '缺少第三方混剪软件真实导入证据，不能证明 US-08 / UC-12 已完成外部工具验收。', {
                  requiredFields: DEFAULT_EXPECTATIONS.videoPackageExternalImportFields,
                  missingFields: missingExternalImportFields,
                  requiredAssetKinds: sample.videoPackage.requiredAssetKinds,
                  importedAssetKinds: externalImportEvidence.importedAssetKinds,
                  missingAssetKinds: missingExternalImportKinds,
                  importedFileCount: externalImportEvidence.importedFileCount,
                  requiredImportedFileCount,
                  timelineCreated: externalImportEvidence.timelineCreated,
                  result: externalImportEvidence.result,
                  acceptedResults: Array.from(ACCEPTED_EXTERNAL_IMPORT_RESULTS),
                  evidenceFiles: externalImportEvidence.evidenceFiles,
                  verifiedEvidenceFiles: externalImportEvidence.verifiedEvidenceFiles,
                  missingEvidenceFiles: externalImportEvidence.missingEvidenceFiles,
                  outOfScopeEvidenceFiles: externalImportEvidence.outOfScopeEvidenceFiles,
                  externalImportEvidencePath: sample.videoPackage.externalImportEvidencePath,
                }),
            ]
          : []
      ),
      missingPlatformFiles.length === 0
        ? passCheck('platform-draft-files', '平台草稿包本地交付完整', '平台草稿包包含正文、复制稿、格式指南、检查清单和 manifest。', {
          expectedFiles: sample.platformDraft.expectedFiles,
          actualFiles: platformFiles,
        })
        : failCheck('platform-draft-files', '平台草稿包本地交付完整', '平台草稿包交付文件缺失。', {
          expectedFiles: sample.platformDraft.expectedFiles,
          actualFiles: platformFiles,
          missingFiles: missingPlatformFiles,
        }),
      missingPlatformTraceFields.length === 0
        ? passCheck('platform-draft-trace', '平台草稿包追溯字段完整', '平台草稿 manifest 保留 SOP、PromptDraft 和来源文章记录。', {
          requiredTraceFields: sample.platformDraft.requiredTraceFields,
          actualTraceFields: platformTraceFields,
        })
        : failCheck('platform-draft-trace', '平台草稿包追溯字段完整', '平台草稿 manifest 追溯字段缺失。', {
          requiredTraceFields: sample.platformDraft.requiredTraceFields,
          actualTraceFields: platformTraceFields,
          missingFields: missingPlatformTraceFields,
        }),
      missingPlatformContentFields.length === 0
        ? passCheck('platform-draft-content', '平台草稿包内容可发布前复核', '平台草稿包正文、复制稿、格式指南、发布检查清单和人工发布边界均有可复核内容。', {
          requiredContentFields: sample.platformDraft.requiredContentFields,
          actualContentFields: platformContentFields,
        })
        : failCheck('platform-draft-content', '平台草稿包内容可发布前复核', '平台草稿包内容或人工发布边界证据不足，不能只证明空文件存在。', {
          requiredContentFields: sample.platformDraft.requiredContentFields,
          actualContentFields: platformContentFields,
          missingFields: missingPlatformContentFields,
        }),
    ],
  };
}

function mediaCostAcceptance(sample) {
  const actual = sample.mediaCost.actual;
  const acceptedSources = ['provider-response', 'env', 'default-internal-api'];
  const hasAcceptedSource = acceptedSources.includes(actual.source);
  const hasCost = actual.durationSeconds > 0 &&
    actual.estimatedCost > 0 &&
    actual.unitPrice >= 0 &&
    actual.currency.trim() &&
    hasAcceptedSource;
  return {
    actual,
    checks: [
      hasCost
        ? passCheck('video-cost-present', '视频成本边界可追溯', '验收资料包含视频模型、时长、币种、单价和估算总成本。', { actual })
        : failCheck('video-cost-present', '视频成本边界可追溯', '缺少视频成本估算，无法评估内部视频 API 成本边界。', { actual }),
      actual.durationSeconds > 0
        ? passCheck('video-cost-duration', '视频时长有效', '视频成本按正数时长估算。', { durationSeconds: actual.durationSeconds })
        : failCheck('video-cost-duration', '视频时长有效', '视频成本缺少有效时长。', { durationSeconds: actual.durationSeconds }),
      actual.estimatedCost > 0 && actual.currency.trim() && hasAcceptedSource
        ? passCheck('video-cost-total', '视频总成本有效', '视频成本估算包含正数金额、币种和白名单成本来源。', { estimatedCost: actual.estimatedCost, currency: actual.currency, source: actual.source, acceptedSources })
        : failCheck('video-cost-total', '视频总成本有效', '视频成本估算缺少正数金额、币种或可信成本来源。', { estimatedCost: actual.estimatedCost, currency: actual.currency, source: actual.source, acceptedSources }),
    ],
  };
}

function traceAcceptance(sample) {
  const refs = sample.trace.actualWorkflowRunRefs
    .map((item) => ({
      source: item.source,
      workflowRunId: String(item.workflowRunId || '').trim(),
    }))
    .filter((item) => item.source && item.workflowRunId);
  const uniqueWorkflowRunIds = Array.from(new Set(refs.map((item) => item.workflowRunId)));
  const expectedWorkflowRunId = sample.trace.expectedWorkflowRunId.trim();
  const sourceMatches = (requiredSource, actualSource) =>
    actualSource === requiredSource ||
    actualSource.startsWith(`${requiredSource}-`) ||
    (requiredSource === 'mix-package' && actualSource.startsWith('mix-package')) ||
    (requiredSource === 'platform-draft' && actualSource.startsWith('platform-draft')) ||
    (requiredSource === 'video-breakdown-log' && actualSource.startsWith('video-breakdown')) ||
    (requiredSource === 'video-script-log' && actualSource.startsWith('video-script')) ||
    (requiredSource === 'video-generation-log' && actualSource.startsWith('video-generation'));
  const missingSources = sample.trace.requiredSources
    .filter((requiredSource) => !refs.some((ref) => sourceMatches(requiredSource, ref.source)));
  return {
    refs,
    uniqueWorkflowRunIds,
    requiredSources: sample.trace.requiredSources,
    missingSources,
    checks: [
      refs.length > 0
        ? passCheck('workflow-run-trace-present', '跨产物 runId 可追溯', '验收资料包含至少一个 workflowRunId。', { refs })
        : failCheck('workflow-run-trace-present', '跨产物 runId 可追溯', '缺少 workflowRunId，无法证明产物来自同一条 SOP 运行。'),
      missingSources.length === 0
        ? passCheck('workflow-run-trace-coverage', '跨产物 runId 覆盖关键产物', '对标反推、视频拆解、视频脚本、视频生成、混剪包和平台草稿包均有 runId 证据。', {
          requiredSources: sample.trace.requiredSources,
          refs,
        })
        : failCheck('workflow-run-trace-coverage', '跨产物 runId 覆盖关键产物', '部分关键产物缺少 runId 证据，无法证明主链没有断开。', {
          requiredSources: sample.trace.requiredSources,
          missingSources,
          refs,
        }),
      uniqueWorkflowRunIds.length === 1
        ? passCheck('workflow-run-trace-consistent', '跨产物 runId 一致', '对标反推、视频拆解、视频脚本、视频生成、混剪包和平台草稿证据未出现 runId 分叉。', { workflowRunId: uniqueWorkflowRunIds[0], refs })
        : failCheck('workflow-run-trace-consistent', '跨产物 runId 一致', '验收证据出现多个 workflowRunId。', { workflowRunIds: uniqueWorkflowRunIds, refs }),
      expectedWorkflowRunId
        ? uniqueWorkflowRunIds.length === 1 && uniqueWorkflowRunIds[0] === expectedWorkflowRunId
          ? passCheck('workflow-run-trace-expected', '指定 runId 匹配', '验收证据指向指定 SOP 运行。', { expectedWorkflowRunId })
          : failCheck('workflow-run-trace-expected', '指定 runId 匹配', '验收证据未指向指定 SOP 运行。', { expectedWorkflowRunId, workflowRunIds: uniqueWorkflowRunIds })
        : passCheck('workflow-run-trace-expected', '指定 runId 匹配', '未指定 expectedWorkflowRunId，仅校验一致性。'),
    ],
  };
}

function evidenceTextValues(sample) {
  const sourceValues = (source) => [
    source.id,
    source.title,
    source.kind,
    source.purpose,
    source.sourcePath,
    source.extractedText,
    source.text,
    ...asArray(source.tags),
  ];
  const successfulInput = asObject(sample.successfulAsset.actual.distilledInputSource);
  const successfulDraft = asObject(sample.successfulAsset.actual.distilledPromptDraft);
  const values = [
    sample.workspacePath,
    sample.brand.title,
    ...asArray(sample.brand.facts),
    ...asArray(sample.brand.compliance),
    ...asArray(sample.brand.scenes).flatMap((scene) => typeof scene === 'string'
      ? [scene]
      : [asObject(scene).title, asObject(scene).usageScene, asObject(scene).painPoint, asObject(scene).sellingPoint]),
    sample.ip.title,
    ...Object.values(asObject(sample.ip.layers)),
    ...sample.productBrief.sources.flatMap(sourceValues),
    ...sample.feedback.sources.flatMap(sourceValues),
    ...sample.reference.sources,
    ...sample.videoBreakdown.sources,
    asObject(sample.videoBreakdown.actual).summary,
    asObject(sample.videoBreakdown.script).title,
    asObject(sample.videoBreakdown.script).script,
    asObject(sample.videoBreakdown.script).videoPrompt,
    asObject(sample.videoBreakdown.script).breakdownLogId,
    ...sample.greenScreen.actualCards.flatMap((card) => [card.id, card.title, card.text, card.assetPath, card.promptDraftId]),
    sample.successfulAsset.actual.assetKey,
    sample.successfulAsset.actual.path,
    sample.successfulAsset.actual.workflowRunId,
    sample.successfulAsset.actual.originalPromptDraftId,
    ...sourceValues(successfulInput),
    successfulDraft.id,
    successfulDraft.title,
    successfulDraft.workflowRunId,
    successfulDraft.content,
    sample.videoPackage.packageDir,
    sample.videoPackage.manifestPath,
    sample.videoPackage.externalImportEvidence.toolName,
    sample.videoPackage.externalImportEvidence.operator,
    ...sample.videoPackage.externalImportEvidence.evidenceFiles,
    sample.platformDraft.packageDir,
    sample.platformDraft.manifestPath,
    ...sample.trace.actualWorkflowRunRefs.flatMap((ref) => [asObject(ref).source, asObject(ref).workflowRunId]),
  ];
  return values.map(String).map((item) => item.trim()).filter(Boolean);
}

function sampleLikeEvidenceValues(sample) {
  return evidenceTextValues(sample).filter((value) => /(^|[/_-])sample([/_-]|$)|\bmock\b|(^|[/_-])mock([/_-]|$)|示例|样例/i.test(value));
}

function hasAllItems(expected, actual) {
  return missingItems(expected, actual).length === 0;
}

function hasAcceptedExternalImportResult(result) {
  return ACCEPTED_EXTERNAL_IMPORT_RESULTS.has(String(result || '').trim().toLowerCase());
}

function realWorkspaceEvidenceAcceptance(sample, providerReport, options = {}) {
  if (!options.requireRealWorkspaceEvidence) return { checks: [] };
  const videoSegments = asArray(asObject(sample.videoBreakdown.actual).segments);
  const storyboard = asArray(asObject(sample.videoBreakdown.script).storyboard);
  const greenScreenTypes = Array.from(new Set(sample.greenScreen.actualCards.map((card) => card.type).filter(Boolean)));
  const successfulAsset = sample.successfulAsset.actual;
  const successfulInput = asObject(successfulAsset.distilledInputSource);
  const successfulDraft = asObject(successfulAsset.distilledPromptDraft);
  const trace = traceAcceptance(sample);
  const sampleLikeValues = sampleLikeEvidenceValues(sample);
  const externalImportEvidence = sample.videoPackage.externalImportEvidence;
  const hasExternalMixImportEvidence = Boolean(
    externalImportEvidence.toolName &&
    externalImportEvidence.importedAt &&
    hasAllItems(sample.videoPackage.requiredAssetKinds, externalImportEvidence.importedAssetKinds) &&
    externalImportEvidence.importedFileCount >= Math.max(1, sample.videoPackage.requiredAssetKinds.length) &&
    externalImportEvidence.manifestImported &&
    externalImportEvidence.timelineCreated &&
    hasAcceptedExternalImportResult(externalImportEvidence.result) &&
    externalImportEvidence.verifiedEvidenceFiles.length > 0 &&
    externalImportEvidence.missingEvidenceFiles.length === 0 &&
    externalImportEvidence.outOfScopeEvidenceFiles.length === 0,
  );
  const missing = [
    sample.mode === 'workspace' ? '' : '必须使用 --workspace 从真实工作区读取产物',
    sample.workspacePath ? '' : '缺少 workspacePath',
    sample.productBrief.sources.length ? '' : '缺少真实产品 brief / SKU 输入源',
    sample.feedback.sources.length ? '' : '缺少真实评论 / 客服 / 差评输入源',
    hasAllItems(DEFAULT_EXPECTATIONS.referenceSourceKinds, sample.reference.actualSourceKinds) ? '' : '缺少参考图和参考视频反推来源',
    videoSegments.length ? '' : '缺少参考视频拆解片段',
    storyboard.length ? '' : '缺少基于拆解生成的新视频脚本分镜',
    hasAllItems(DEFAULT_EXPECTATIONS.greenScreenCardTypes, greenScreenTypes) ? '' : '缺少标题卡 / 卖点卡 / CTA 绿幕图',
    sample.greenScreen.actualReviewStatuses.includes('approved') ? '' : '缺少绿幕图 approved 审核证据',
    successfulAsset.reviewStatus === 'approved' ? '' : '缺少已通过审核的成功素材',
    successfulInput.id ? '' : '缺少 successful-asset 输入源沉淀证据',
    successfulDraft.id ? '' : '缺少成功素材沉淀 PromptDraft',
    sample.videoPackage.packageDir || sample.videoPackage.manifestPath ? '' : '缺少混剪包目录或 manifest',
    sample.videoPackage.declaredPackagedFilePaths.length ? '' : '缺少混剪包 manifest packagedPath 声明',
    sample.videoPackage.actualPackagedFilePaths.length ? '' : '缺少混剪包素材文件实存证据',
    sample.videoPackage.missingPackagedFilePaths.length === 0 ? '' : '混剪包 manifest 指向的素材文件不存在',
    hasExternalMixImportEvidence ? '' : '缺少真实第三方混剪导入证据文件',
    sample.platformDraft.packageDir || sample.platformDraft.manifestPath ? '' : '缺少平台草稿包目录或 manifest',
    trace.missingSources.length === 0 ? '' : '关键产物 runId 覆盖不完整',
    trace.uniqueWorkflowRunIds.length === 1 ? '' : '关键产物 runId 不一致',
    providerReport.strictGate.passed ? '' : '真实 provider strict 未通过；请用 verify:v2:evidence --provider-strict 联调',
    sampleLikeValues.length === 0 ? '' : '验收证据仍包含 sample / 示例占位内容',
  ].filter(Boolean);
  return {
    sampleLikeValues,
    checks: [
      missing.length === 0
        ? passCheck('real-workspace-evidence', '真实工作区验收门槛', '真实工作区已覆盖产品资料、评论反馈、参考图 / 视频、绿幕图、成功素材、混剪包、平台草稿包、runId 和 provider strict 证据。', {
          workspacePath: sample.workspacePath,
          providerStrictPassed: providerReport.strictGate.passed,
        })
        : failCheck('real-workspace-evidence', '真实工作区验收门槛', '缺少真实工作区闭环证据，不能把 local-sample、外部手填清单或 provider dry-run 当作 v2 完成。', {
          workspacePath: sample.workspacePath,
          mode: sample.mode,
          missing,
          declaredPackagedFilePaths: sample.videoPackage.declaredPackagedFilePaths,
          actualPackagedFilePaths: sample.videoPackage.actualPackagedFilePaths,
          missingPackagedFilePaths: sample.videoPackage.missingPackagedFilePaths,
          unverifiedPackagedFilePaths: sample.videoPackage.unverifiedPackagedFilePaths,
          sampleLikeValues,
          providerStrictPassed: providerReport.strictGate.passed,
          providerStrictReasons: providerReport.strictGate.reasons,
          nextActions: [
            '用 --workspace 指向真实 App 工作区，而不是只跑 local-sample。',
            '导入真实产品 brief / SKU、评论客服语料、参考图和参考视频后重新跑主链。',
            '完成绿幕图审核、成功素材沉淀、混剪包和平台草稿包导出。',
            '按 import-guide.md 在真实第三方混剪工具导入视频和绿幕素材，并保存截图、录屏说明或 import-check.md 验收记录。',
            '使用 verify:v2:evidence --provider-strict --allow-network --allow-media 生成真实 provider 联调证据。',
          ],
        }),
    ],
  };
}

export async function buildBusinessAcceptanceReport(env = process.env, options = {}) {
  const sample = await hydrateAcceptanceInputEvidence(normalizeAcceptanceInput(options.acceptanceInput ?? LOCAL_SAMPLE));
  const requireExternalMixEvidence = Boolean(options.requireExternalMixEvidence || options.requireRealWorkspaceEvidence);
  if (requireExternalMixEvidence) {
    sample.videoPackage.requireExternalImportEvidence = true;
  }
  const mode = options.mode ?? sample.mode;
  sample.mode = mode;
  const providerReport = options.providerReport ?? await buildProviderCheckReport(env, {
    allowNetwork: false,
    allowMedia: false,
  });
  const sections = {
    provider: providerReport,
    realEvidence: realWorkspaceEvidenceAcceptance(sample, providerReport, {
      requireRealWorkspaceEvidence: Boolean(options.requireRealWorkspaceEvidence),
    }),
    brand: brandAcceptance(sample),
    ip: ipAcceptance(sample),
    productBrief: productBriefAcceptance(sample),
    feedback: feedbackAcceptance(sample),
    reference: referenceAcceptance(sample),
    videoBreakdown: videoBreakdownAcceptance(sample),
    greenScreen: greenScreenAcceptance(sample),
    successfulAsset: successfulAssetAcceptance(sample),
    delivery: deliveryAcceptance(sample),
    mediaCost: mediaCostAcceptance(sample),
    trace: traceAcceptance(sample),
  };
  const checks = [
    ...sections.realEvidence.checks,
    ...sections.brand.checks,
    ...sections.ip.checks,
    ...sections.productBrief.checks,
    ...sections.feedback.checks,
    ...sections.reference.checks,
    ...sections.videoBreakdown.checks,
    ...sections.greenScreen.checks,
    ...sections.successfulAsset.checks,
    ...sections.delivery.checks,
    ...sections.mediaCost.checks,
    ...sections.trace.checks,
  ];
  const failed = checks.filter((check) => check.status !== 'pass');
  return {
    schema: 'buguai.v2-business-acceptance.v1',
    checkedAt: new Date().toISOString(),
    mode,
    summary: {
      total: checks.length,
      passed: checks.length - failed.length,
      failed: failed.length,
      providerBlocked: providerReport.summary.blocked,
      providerReady: providerReport.summary.ready,
      providerSucceeded: providerReport.summary.succeeded,
    },
    sections,
  };
}

function readArgValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasArgFlag(...names) {
  return names.some((name) => process.argv.includes(name));
}

export async function writeJsonReport(outputPath, report) {
  if (!outputPath) return;
  const target = resolve(outputPath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
}

const isMain = process.argv[1]?.endsWith('/v2-business-acceptance.mjs') || process.argv[1]?.endsWith('\\v2-business-acceptance.mjs');
if (isMain) {
  const inputPath = readArgValue('--input') || process.env.CONTENT_STUDIO_V2_ACCEPTANCE_INPUT;
  const workspacePath = readArgValue('--workspace') || process.env.CONTENT_STUDIO_V2_ACCEPTANCE_WORKSPACE;
  const outputPath = readArgValue('--output') || process.env.CONTENT_STUDIO_V2_ACCEPTANCE_REPORT;
  const requireRealWorkspaceEvidence = hasArgFlag('--require-real-workspace-evidence', '--require-real-business-evidence') ||
    process.env.CONTENT_STUDIO_REQUIRE_REAL_WORKSPACE_EVIDENCE === '1';
  const requireExternalMixEvidence = hasArgFlag('--require-external-mix-evidence', '--require-mix-import-evidence') ||
    process.env.CONTENT_STUDIO_REQUIRE_MIX_IMPORT_EVIDENCE === '1' ||
    requireRealWorkspaceEvidence;
  const acceptanceInput = inputPath
    ? await loadAcceptanceInput(inputPath)
    : workspacePath
      ? await loadWorkspaceAcceptanceInput(workspacePath)
      : { ...LOCAL_SAMPLE, mode: 'local-sample' };
  const report = await buildBusinessAcceptanceReport(process.env, {
    acceptanceInput,
    mode: inputPath ? 'external-input' : workspacePath ? 'workspace' : 'local-sample',
    requireExternalMixEvidence,
    requireRealWorkspaceEvidence,
  });
  await writeJsonReport(outputPath, report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.summary.failed > 0 ? 1 : 0);
}
