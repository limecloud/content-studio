import type { ModuleKey, V2ModuleKey } from './types';
import type { V2FeatureActionSlot, V2FeatureActionTarget, V2FeatureSpec } from './v2FeatureTypes';

export const V2_FEATURES: Record<V2ModuleKey, V2FeatureSpec> = {
  'material-breakdown': {
    eyebrow: '图片 / 提示词',
    title: '拆解素材',
    description: '上传参考素材和本方产品资料，AI 拆解画面结构并生成可复制到外部生图工具的 Prompt。',
    scope: '参考素材 -> 产品约束 -> AI 拆解 -> Prompt 草稿',
    status: 'Prompt 入口',
    primaryAction: '生成提示词',
    secondaryAction: '保存 Prompt',
    flow: ['上传参考素材', '关联产品', 'AI 拆解', 'Prompt 编辑', '复制外部'],
    cards: [
      { title: '拆解维度', text: '结构化输出构图、主体位置、光线、背景、文字区域、画幅和可复用风格。', items: ['构图与画幅', '光线与背景', '留白与风格'] },
      { title: '合规边界', text: '只学习风格结构，不复制竞品可识别元素，不编造产品卖点。', items: ['去除竞品元素', '保留来源引用', 'Prompt 可追溯'] },
    ],
    preview: '竖版 4:5，产品位于右下三分之一，早餐桌自然光，左上保留标题空间，手机实拍感。',
    table: [['参考素材', '已上传', '构图 / 光线', '可分析'], ['产品图', '已关联', '产品实物', '替换主体'], ['Prompt', '草稿', '可编辑', '复制外部']],
  },
  'image-green-screen': {
    eyebrow: '图片 / 视频素材',
    title: '绿幕文案图',
    description: '从脚本或卖点列表拆出标题卡、卖点卡、金句卡和 CTA 卡，导出 PNG / WebP 并写入混剪清单。',
    scope: '脚本 / 卖点 -> 绿幕文案图 -> 混剪清单',
    status: '可运行入口',
    primaryAction: '生成绿幕图',
    secondaryAction: '写入清单',
    flow: ['导入脚本', '拆文案卡', '选择版式', '生成图片', '可读性审核', '导出'],
    cards: [
      { title: '文案拆分', text: '文案过长时提示拆分，不强行压缩到不可读。', items: ['标题卡', '卖点卡', '金句卡', 'CTA 卡'] },
      { title: '导出字段', text: '每张图记录用途、画幅、出现时长、背景类型和关联脚本段落。', items: ['出现时长', '背景类型', '脚本段落'] },
    ],
    preview: '标题卡：早餐后 10 秒钟的小习惯。卖点卡：便携条包，放进包里或抽屉都不占地方。',
    table: [['标题卡 01', '通过', '9:16 PNG', '入清单'], ['卖点卡 03', '需拆分', '文案过长', '待处理'], ['CTA 卡', '草稿', '透明背景', '可导出']],
  },
  'video-script': {
    eyebrow: '视频 / 脚本',
    title: '视频脚本',
    description: '基于参考视频拆解、图片素材、品牌 / IP 知识库和卖点生成脚本、分镜和字幕结构。',
    scope: '参考视频 / 图片素材 -> 脚本 -> 分镜 Prompt',
    status: '可运行入口',
    primaryAction: '生成脚本',
    secondaryAction: '拆成绿幕卡',
    flow: ['选择卖点', '选择风格', '生成脚本', '确认分镜', '生成 Prompt', '导出'],
    cards: [
      { title: '脚本结构', text: '用钩子、场景、卖点、证明和 CTA 组织短视频脚本。', items: ['钩子', '场景', 'CTA'] },
      { title: '知识引用', text: 'IP 类脚本保持人设口吻；产品类脚本保持事实和合规边界。', items: ['IP 口吻', '产品事实', '禁用表达'] },
    ],
    preview: '0-3s：坚持一件小事最难的是开始。3-9s：早餐后顺手放一包进包里。9-15s：把复杂动作变成日常习惯。',
    table: [['脚本 v1', '草稿', '15 秒', '待确认'], ['字幕卡', '可生成', '3 张', '绿幕图'], ['分镜 Prompt', '待生成', '5 段', '视频 Prompt']],
  },
  'video-prompt': {
    eyebrow: '视频 / 外部生成',
    title: '视频 Prompt',
    description: '生成可复制到第三方平台的 15 秒视频 Prompt。软件只记录 Prompt 和复制动作，第三方生成过程脱离软件。',
    scope: '图片素材 / 场景卡 -> 视频 Prompt -> 外部生成记录',
    status: '可运行入口',
    primaryAction: '复制视频 Prompt',
    secondaryAction: '导入成品视频',
    flow: ['选择场景', '生成 Prompt', '复制外部', '第三方生成', '手动导入', '入库'],
    cards: [
      { title: '外部边界', text: '不创建第三方任务、不轮询状态、不绑定第三方任务编号。', items: ['只记录复制动作', '追溯原 Prompt', '成品手动导入'] },
      { title: '内部可选', text: '当成本可接受时可走内部视频生成服务，但不是默认主路径。', items: ['第三方平台', '真实生成服务', '待配置状态'] },
    ],
    preview: '15 秒，9:16，早餐桌自然光，手拿条包入镜，倒入水杯后放回书包侧袋，镜头轻微手持。',
    table: [['Prompt v3', '已复制外部', '第三方平台', '等待手动导入'], ['成品视频', '未导入', '本地文件', '可选'], ['内部生成', '未启用', '成本高', '待配置']],
  },
  'video-import': {
    eyebrow: '视频 / 入库',
    title: '成品视频导入',
    description: '第三方生成后由用户手动导入视频文件，并选择关联原提示词、图片素材和历史运行记录。',
    scope: '第三方成品视频 -> 手动导入 -> 素材审核入库',
    status: '可运行入口',
    primaryAction: '导入成品视频',
    secondaryAction: '关联原提示词',
    flow: ['选择文件', '关联提示词', '补充标签', '生成缩略图', '审核', '入素材库'],
    cards: [
      { title: '导入字段', text: '不要求第三方任务编号，只记录本地文件和本软件内的提示词来源。', items: ['本地文件', '提示词来源', '输入素材'] },
      { title: '审核', text: '导入后仍需要人工确认用途、画幅、时长和合规状态。', items: ['通过', '驳回', '入库标签'] },
    ],
    preview: '导入 mp4，关联“视频 Prompt v3”和图片候选 02，打上早餐场景、9:16、15s 标签。',
    table: [['成品视频', '待导入', 'mp4', '选择文件'], ['提示词', '已关联', '视频 Prompt', '可追溯'], ['素材库', '待审核', '视频素材', '入库']],
  },
  'video-mix-export': {
    eyebrow: '视频 / 导出',
    title: '混剪包导出',
    description: '导出第三方混剪软件可读取的素材文件夹和混剪清单，包含图片、绿幕图、可选视频、文案字段、标签和用途。',
    scope: '通过素材 -> 素材文件夹 -> 混剪清单',
    status: '可运行入口',
    primaryAction: '导出混剪包',
    secondaryAction: '预览清单',
    flow: ['选择通过素材', '补齐标签', '生成清单', '导出文件夹', '交给混剪软件'],
    cards: [
      { title: '包结构', text: 'v2 不做时间线剪辑和成片渲染，只准备可混剪素材包。', items: ['图片文件夹', '绿幕图文件夹', '视频文件夹'] },
      { title: '清单字段', text: '包含素材用途、画幅、时长、文案、平台、提示词来源和历史记录。', items: ['素材编号', '出现时长', '提示词来源'] },
    ],
    preview: '抖音 / 剪映混剪包：图片 18 张、绿幕图 8 张、视频片段 3 条，已关联原提示词和历史运行记录。',
    table: [['图片素材', '18 张', '通过审核', '导出'], ['绿幕图', '8 张', '通过审核', '导出'], ['视频片段', '3 条', '可选', '导出']],
  },
  'video-creative': {
    eyebrow: '视频 / 创意',
    title: '创意视频',
    description: '围绕品牌 / IP 资产生成氛围视频、产品场景动效和短片段创意方向，最终沉淀为视频 Prompt 或素材包。',
    scope: '成功素材 / 场景库 -> 创意方向 -> 视频 Prompt',
    status: 'Prompt 入口',
    primaryAction: '生成创意方向',
    secondaryAction: '转为视频 Prompt',
    flow: ['选择资产', '生成方向', '确认风格', '生成 Prompt', '复制外部', '导入素材'],
    cards: [
      { title: '创意来源', text: '可来自成功图片、IP 语气、品牌场景库或爆款视频拆解。', items: ['成功素材', '场景库', '拆解报告'] },
      { title: '产物边界', text: '不承诺成片，只输出可执行的视频 Prompt 和素材建议。', items: ['氛围动效', '产品场景', '镜头语言'] },
    ],
    preview: '从早餐桌静物图过渡到书包侧袋近景，强调“顺手放进去”的低门槛动作。',
    table: [['方向 01', '生活化', '15s', '可转 Prompt'], ['方向 02', '产品近景', '8s', '可转 Prompt'], ['方向 03', 'IP 口播', '20s', '需脚本']],
  },
  'video-custom': {
    eyebrow: '视频 / 自定义',
    title: '自定义视频',
    description: '高级用户配置时长、画幅、镜头段落、参考图和参考视频，最终仍生成可复制的视频 Prompt。',
    scope: '自定义镜头表单 -> 视频 Prompt -> 外部复制 / 可选内部执行',
    status: 'Prompt 入口',
    primaryAction: '保存视频配置',
    secondaryAction: '生成 Prompt',
    flow: ['填写字段', '配置镜头', '生成 Prompt', '复制外部', '可选内部执行', '记录'],
    cards: [
      { title: '字段配置', text: '不把节点图暴露给普通用户，用表单控制镜头、动作、时长和输出。', items: ['时长', '画幅', '镜头段落'] },
      { title: '交接状态', text: '默认复制到第三方平台；内部执行只是成本可接受时的可选能力。', items: ['外部复制', '手动导入', '内部可选'] },
    ],
    preview: '镜头 1：产品特写 3s；镜头 2：手部动作 6s；镜头 3：场景收束 6s。',
    table: [['镜头段', '5 段', '完整', '生成 Prompt'], ['外部复制', '可用', '第三方平台', '推荐'], ['内部执行', '可选', '成本较高', '待配置']],
  },
  'article-title': {
    eyebrow: '文案 / 标题',
    title: '标题生成',
    description: '围绕平台、场景卡、痛点和 IP / 品牌口吻生成标题矩阵，并保留来源和禁用表达。',
    scope: '痛点 / 场景 / 平台 -> 标题矩阵 -> 正文入口',
    status: 'Prompt 入口',
    primaryAction: '生成标题矩阵',
    secondaryAction: '发送到文章',
    flow: ['选择平台', '选择痛点', '生成标题', '评分筛选', '发送正文', '入库'],
    cards: [
      { title: '标题角度', text: '从评论、差评和客服问题中聚类痛点，输出真实用户语言。', items: ['问题型', '场景型', '反常识型'] },
      { title: '平台差异', text: '同一素材可生成小红书、公众号、视频号不同标题。', items: ['小红书', '公众号', '视频号'] },
    ],
    preview: '早餐后这 10 秒，才是最容易坚持的小习惯。',
    table: [['标题组 A', '小红书', '种草', '待选'], ['标题组 B', '公众号', '深度', '待选'], ['标题组 C', '视频号', '口播', '可发送']],
  },
  'article-script': {
    eyebrow: '文案 / 脚本',
    title: '脚本生成',
    description: '生成口播脚本、分镜脚本和绿幕文案图内容，可接入视频 Prompt 和混剪包。',
    scope: '知识引用 / 卖点 -> 口播脚本 -> 绿幕文案图',
    status: 'Prompt 入口',
    primaryAction: '生成脚本',
    secondaryAction: '拆成绿幕图',
    flow: ['选择知识', '生成口播', '拆分字幕', '生成绿幕图', '视频 Prompt', '导出'],
    cards: [
      { title: '脚本类型', text: '支持短视频口播、产品讲解、IP 观点和私域回复。', items: ['口播', '分镜', '字幕卡'] },
      { title: '下游联动', text: '脚本可以进入视频 Prompt、绿幕文案图和混剪包。', items: ['视频 Prompt', '绿幕图', '混剪清单'] },
    ],
    preview: '很多人不是不想坚持，而是动作太复杂。把它变成早餐后顺手做的一件事，门槛就低很多。',
    table: [['口播 v1', '草稿', '60s', '待审'], ['短视频 v1', '可用', '15s', '可转 Prompt'], ['字幕卡', '8 张', '待生成', '绿幕图']],
  },
  'knowledge-brand': {
    eyebrow: '知识库 / 品牌链路',
    title: '品牌 / 产品知识库',
    description: '先抽取品牌调性、产品事实、卖点、目标人群和合规边界，再进入场景库生成下游 Prompt。',
    scope: '品牌 / 产品文档 -> 结构化知识库 -> 场景库',
    status: '可运行入口',
    primaryAction: '抽取品牌知识库',
    secondaryAction: '生成场景库',
    flow: ['导入 DOCX', '抽取事实', '确认卖点', '标注合规', '生成场景库', '生成提示词组'],
    cards: [
      { title: '抽取结果', text: '把 DOCX 中的事实、卖点、人群和禁用表达结构化，但不替代原文。', items: ['产品事实', '目标人群', '合规边界'] },
      { title: '下游边界', text: '品牌知识库不能直接跳 Prompt，中间必须有场景卡或内容任务结构。', items: ['场景库', '卖点卡', 'Prompt 组'] },
    ],
    preview: '合规边界：避免“治疗、见效、最强、根治”等承诺；优先表达使用场景、坚持门槛和便携性。',
    table: [['品牌调性', '已抽取', '温和可信', '可确认'], ['卖点卡', '12 条', '待审核', '可编辑'], ['场景库', '未生成', '下一步', '主按钮']],
  },
};

const V2_FEATURE_ACTION_TARGETS: Partial<
  Record<V2ModuleKey, Partial<Record<V2FeatureActionSlot, V2FeatureActionTarget>>>
> = {
  'material-breakdown': {
    secondary: { type: 'module', module: 'agents' },
  },
  'image-green-screen': {
    secondary: { type: 'module', module: 'video-mix-export' },
  },
  'video-script': {
    secondary: { type: 'module', module: 'image-green-screen' },
  },
  'video-prompt': {
    secondary: { type: 'module', module: 'video-import' },
  },
  'video-import': {
    secondary: { type: 'module', module: 'video-prompt' },
  },
  'video-mix-export': {
    secondary: { type: 'module', module: 'assets' },
  },
  'article-title': {
    secondary: { type: 'module', module: 'article' },
  },
  'article-script': {
    secondary: { type: 'module', module: 'image-green-screen' },
  },
  'knowledge-brand': {
    primary: { type: 'module', module: 'knowledge' },
    secondary: { type: 'module', module: 'knowledge' },
  },
};

export function isV2FeatureModule(module: ModuleKey): module is V2ModuleKey {
  return Object.prototype.hasOwnProperty.call(V2_FEATURES, module);
}

export function getV2FeatureActionTarget(
  module: V2ModuleKey,
  slot: V2FeatureActionSlot,
): V2FeatureActionTarget | undefined {
  return V2_FEATURE_ACTION_TARGETS[module]?.[slot];
}
