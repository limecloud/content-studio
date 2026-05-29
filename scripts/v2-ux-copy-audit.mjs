import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(process.cwd());

export const V2_UX_COPY_AUDITS = [
  {
    path: 'docs/roadmap/v2/README.md',
    rules: productDocRules(),
  },
  {
    path: 'docs/roadmap/v2/prd.md',
    rules: productDocRules(),
  },
  {
    path: 'docs/roadmap/v2/ui-blueprint.md',
    rules: productDocRules(),
  },
  {
    path: 'docs/roadmap/v2/llm-playbook.md',
    rules: productDocRules(),
  },
  {
    path: 'docs/roadmap/v2/prototype/README.md',
    rules: [
      ...prototypeRules(),
      rule('visible-blocked-status', /\bblocked\b/, '原型契约不能把 blocked 当作普通用户可见状态。'),
    ],
  },
  {
    path: 'docs/roadmap/v2/prototype/index.html',
    rules: [
      ...prototypeRules(),
      rule('visible-blocked-status', /\bblocked\b/, '静态原型不能把 blocked 当作普通用户可见状态。'),
      rule('mock-visual-class', /\bmock-img\b|\bfake-input\b/, '静态原型不能继续使用 mock / fake 命名。'),
    ],
  },
  {
    path: 'docs/roadmap/v2/mix-import-evidence.example.json',
    rules: [
      rule('prompt-source-label', /Prompt 来源/, '导入证据示例应使用“提示词来源”。'),
    ],
  },
  {
    path: 'src/renderer/src/app/v2FeatureRegistry.ts',
    rules: [
      ...prototypeRules(),
      rule('internal-run-id', /\brun_[0-9A-Za-z_-]+/, 'v2 入口预览不能展示 run_* 内部编号。'),
      rule('visible-blocked-status', /status:\s*['"]blocked['"]/, 'v2 入口状态不能使用 blocked。'),
    ],
  },
  {
    path: 'src/renderer/src/app/v2FeatureTypes.ts',
    rules: [
      rule('visible-blocked-status', /['"]blocked['"]/, 'v2 入口状态类型不能允许 blocked。'),
    ],
  },
  {
    path: 'src/renderer/src/components/modules/V2FeatureModule.tsx',
    rules: [
      rule('visible-blocked-status', /feature\.status\s*===\s*['"]blocked['"]/, 'v2 入口组件不能判断并显示 blocked 状态。'),
    ],
  },
  {
    path: 'src/renderer/src/components/modules/WorkflowFeatureModule.tsx',
    rules: [
      rule('workflow-step-key-label', /步骤快照\s*\//, '运行详情产物线索不能展示步骤 key。'),
      rule('raw-artifact-title', /title=\{ref\}/, '运行详情产物线索 title 不能暴露原始 artifactRef。'),
      rule('raw-artifact-fallback', /return\s+ref(?:\.length|\s*;)/, '运行详情未知产物不能回退展示内部引用字符串。'),
    ],
  },
  {
    path: 'src/renderer/src/components/modules/ImageShowcaseModule.tsx',
    rules: noDeadStaticButtonRules(),
  },
  {
    path: 'src/renderer/src/components/modules/VideoShowcaseModule.tsx',
    rules: noDeadStaticButtonRules(),
  },
  {
    path: 'src/renderer/src/components/modules/VideoModule.tsx',
    rules: [
      rule('disabled-no-download-button', /<button[^>]*disabled[^>]*>\s*不下载\s*<\/button>/, '处理边界应用状态文本表达，不能做成不可点击按钮。'),
    ],
  },
  {
    path: 'src/renderer/src/components/SettingsDialog.tsx',
    rules: [
      rule('disabled-future-link-button', /<button[^>]*disabled[^>]*>[^<]*后续提供[^<]*<\/button>/, '未配置的外部链接应用状态文本表达，不能做成不可点击按钮。'),
    ],
  },
  {
    path: 'src/renderer/src/components/modules/SkillsModule.tsx',
    rules: [
      rule('disabled-try-chat-button', /<button[^>]*disabled[^>]*>\s*<SkillIcon name=["']message["'] \/>[\s\S]*?Try in chat[\s\S]*?<\/button>/, '未接通的 skill 试聊入口不能作为不可点击按钮展示。'),
    ],
  },
  {
    path: 'src/renderer/src/components/modules/ContentKnowledgeMapModule.tsx',
    rules: v1BusinessModuleRules(),
  },
  {
    path: 'src/renderer/src/components/modules/ContentReviewTasksModule.tsx',
    rules: v1BusinessModuleRules(),
  },
  {
    path: 'src/renderer/src/components/modules/BrandCommandCenterModule.tsx',
    rules: v1BusinessModuleRules(),
  },
];

function productDocRules() {
  return [
    ...flatFeatureListRules(),
    rule('mix-manifest-main-task', /混剪\s+manifest|导出\s+manifest|预览\s+manifest|写入\s+manifest|已入\s+manifest|manifest\s+主任务|manifest\s+导出/, '产品文档应把用户主任务写成“混剪清单 / 清单文件”。'),
    rule('prompt-ref-label', /PromptRef|Prompt 来源/, '产品文档应使用“提示词来源”。'),
    rule('provider-label', /\bprovider\b|Provider 状态|选择 provider|provider 未配置|配置 provider/i, '产品文档应使用“生成服务 / 待配置”。'),
    rule('visible-blocked-status', /\bblocked\b|pending external|waiting external/i, '产品文档不能把 blocked / pending external 当作普通用户可见状态。'),
  ];
}

function prototypeRules() {
  return [
    ...flatFeatureListRules(),
    rule('prototype-stage-copy', /服务还没有|探索阶段/, '普通用户界面不能出现内部阶段说明。'),
    rule('agent-session-label', /Agent 会话/, '普通用户界面应使用“对话”。'),
    rule('mix-manifest-main-task', /混剪\s+manifest|导出\s+manifest|预览\s+manifest|写入\s+manifest|已入\s+manifest|manifest\s+字段|JSON\/CSV.*manifest|badge">manifest|\+\s*manifest/, '普通用户界面应使用“混剪清单 / 清单文件”。'),
    rule('prompt-ref-label', /PromptRef|Prompt 来源/, '普通用户界面应使用“提示词来源”。'),
    rule('provider-label', /Provider 状态|选择 provider|provider 未配置|配置 provider/i, '普通用户界面应使用“生成服务 / 待配置”。'),
    rule('internal-run-id', /\brun_[0-9A-Za-z_-]+/, '普通用户界面不能展示 run_* 内部编号。'),
  ];
}

function flatFeatureListRules() {
  return [
    rule('flat-feature-overview', /功能概览|能力中心|功能清单|功能罗列|入口合集|入口集合|模块入口清单/, '普通用户页面应围绕业务对象和任务流组织，不能退回功能罗列式 UI。'),
  ];
}

function noDeadStaticButtonRules() {
  return [
    rule('disabled-copy-button', /<button[^>]*disabled[^>]*>\s*复制\s*<\/button>/, '没有可复制对象时不要展示不可点击的复制按钮。'),
  ];
}

function v1BusinessModuleRules() {
  return [
    ...flatFeatureListRules(),
    rule(
      'visible-ontology-engineering-term',
      /\b(Ontology|Concept|Relation|CoverageMatrix|PromptGroundingContext|DecisionGate|ActionLog)\b/,
      'v1 普通用户页面不能暴露 Ontology / Concept / Relation 等工程术语。',
    ),
  ];
}

function rule(id, pattern, message) {
  return { id, pattern, message };
}

function lineNumberForIndex(text, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) {
    if (text.charCodeAt(i) === 10) line += 1;
  }
  return line;
}

function lineExcerpt(text, index) {
  const start = text.lastIndexOf('\n', index) + 1;
  const nextBreak = text.indexOf('\n', index);
  const end = nextBreak === -1 ? text.length : nextBreak;
  return text.slice(start, end).trim();
}

async function checkFile(root, audit) {
  const filePath = resolve(root, audit.path);
  const text = await readFile(filePath, 'utf-8');
  const failures = [];

  for (const item of audit.rules) {
    const pattern = item.pattern.global ? item.pattern : new RegExp(item.pattern.source, `${item.pattern.flags}g`);
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      failures.push({
        ruleId: item.id,
        message: item.message,
        path: audit.path,
        line: lineNumberForIndex(text, index),
        match: match[0],
        excerpt: lineExcerpt(text, index),
      });
    }
  }

  return {
    path: audit.path,
    ruleCount: audit.rules.length,
    status: failures.length ? 'failed' : 'passed',
    failures,
  };
}

export async function buildV2UxCopyAudit(options = {}) {
  const root = options.projectRoot ?? projectRoot;
  const audits = options.audits ?? V2_UX_COPY_AUDITS;
  const checks = [];

  for (const audit of audits) {
    checks.push(await checkFile(root, audit));
  }

  const failed = checks.reduce((count, item) => count + item.failures.length, 0);
  return {
    schema: 'buguai.v2-ux-copy-audit.v1',
    checkedAt: new Date().toISOString(),
    summary: {
      files: checks.length,
      rules: checks.reduce((count, item) => count + item.ruleCount, 0),
      failed,
      passed: failed === 0,
    },
    checks,
  };
}

function printReport(report) {
  if (report.summary.failed === 0) {
    console.log(`v2 UX copy audit passed: ${report.summary.files} files, ${report.summary.rules} rules.`);
    return;
  }

  console.error(`v2 UX copy audit failed: ${report.summary.failed} issue(s).`);
  for (const check of report.checks) {
    for (const failure of check.failures) {
      console.error(`- ${failure.path}:${failure.line} [${failure.ruleId}] ${failure.message}`);
      console.error(`  match: ${failure.match}`);
      console.error(`  line: ${failure.excerpt}`);
    }
  }
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const report = await buildV2UxCopyAudit();
  printReport(report);
  process.exit(report.summary.failed === 0 ? 0 : 1);
}
