import type {
  ArticleGenerationRequest,
  GenerationLogEntry,
  GlobalGenerationParams,
  KnowledgeBaseType,
  KnowledgeSectionType,
} from '../../../shared/types';
import type { ColorTheme, NavItem } from './types';

export const DEFAULT_PARAMS: GlobalGenerationParams = {
  textModel: 'claude-sonnet-4-5',
  imageModel: 'gpt-image-2',
  videoModel: 'veo-3.1',
  runMode: 'single',
  count: 1,
  aspectRatio: '4:5',
  resolution: '2k',
  quality: 'medium',
};

export const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  { title: '图片', items: [{ key: 'image', label: '图片引擎', badge: 'current' }, { label: '合规检测', disabled: true, badge: '后续接入' }, { label: 'AI 对话', disabled: true, badge: '后续接入' }, { label: '图片精修', disabled: true, badge: '后续接入' }] },
  { title: '视频', items: [{ key: 'video', label: '视频引擎', badge: '爆款拆解' }, { label: '创意视频', disabled: true, badge: '后续接入' }, { label: '自定义视频', disabled: true, badge: '后续接入' }] },
  { title: '文案', items: [{ key: 'article', label: '文章生成', badge: 'Claude' }] },
  { title: '知识库', items: [{ key: 'knowledge', label: '成型知识库' }] },
  { title: '资产', items: [{ key: 'assets', label: '素材库 / 历史' }] },
  { title: '管理', items: [{ key: 'skills', label: 'Skills 管理' }] },
];

export const PIPELINE_STEPS = ['知识库', '提示词包', '场景库', '图片素材', '视频队列', '文章生成'];

export const VIDEO_DIMENSIONS = ['开头钩子', '钩子评分', '语气风格', '卖点逻辑', '镜头运镜', '画面构图', '关键词视觉元素', '字幕口播', '情绪曲线', '节奏密度', '视觉风格', '转化设计', '爆点因素', '内容公式', '转场方式', '用户停留点'];

export const HISTORY_FILTERS: Array<{ value: GenerationLogEntry['kind'] | 'all'; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'article', label: '文章' },
  { value: 'image', label: '图片' },
  { value: 'video-breakdown', label: '拆解' },
  { value: 'video-script', label: '脚本' },
  { value: 'video', label: '视频队列' },
];

export const KNOWLEDGE_BASE_FILTERS: Array<{ value: KnowledgeBaseType | 'all'; label: string }> = [
  { value: 'all', label: '全部知识库' },
  { value: 'product-kb', label: '产品型' },
  { value: 'personal-ip-kb', label: '个人 IP 型' },
];

export const KNOWLEDGE_SECTION_FILTERS: Array<{ value: KnowledgeSectionType | 'all'; label: string }> = [
  { value: 'all', label: '全部章节' },
  { value: 'product', label: '产品' },
  { value: 'selling-point', label: '卖点' },
  { value: 'scenario-script', label: '场景脚本' },
  { value: 'compliance', label: '合规' },
  { value: 'profile', label: '人物档案' },
  { value: 'methodology', label: '方法论' },
  { value: 'voice-style', label: '写作风格' },
  { value: 'boundary', label: '边界' },
];

export const ARTICLE_TYPE_OPTIONS: Array<{ value: ArticleGenerationRequest['articleType']; label: string }> = [
  { value: 'wechat-longform', label: '公众号长文' },
  { value: 'xiaohongshu-note', label: '小红书笔记' },
  { value: 'product-seeding', label: '商品种草文' },
  { value: 'detail-page-copy', label: '详情页文案' },
  { value: 'short-video-script', label: '短视频口播稿' },
];

export const ARTICLE_LENGTH_OPTIONS: Array<{ value: ArticleGenerationRequest['length']; label: string }> = [
  { value: 'short', label: '短内容' },
  { value: 'medium', label: '中等篇幅' },
  { value: 'long', label: '长文' },
  { value: 'custom', label: '自定义' },
];

export const COLOR_THEME_OPTIONS: Array<{ value: ColorTheme; label: string; description: string; color: string }> = [
  { value: 'emerald', label: '森绿', description: '克制专业的绿色主调', color: '#395745' },
  { value: 'ocean', label: '海洋', description: '清爽可信的蓝绿色', color: '#0E7490' },
  { value: 'vintage', label: '复古', description: '温和纸感的暖色调', color: '#92400E' },
  { value: 'neon', label: '霓虹', description: '高识别度的现代强调色', color: '#0891B2' },
  { value: 'lime', label: '青柠', description: '活力清新的黄绿配色', color: '#65A30D' },
  { value: 'dusk', label: '黄昏', description: '柔和温暖的暮色调', color: '#9A3412' },
  { value: 'minimal', label: '极简', description: '清晰专业的深蓝商务风', color: '#1D4ED8' },
  { value: 'vibrant', label: '活力', description: '时尚有冲击力的科技风', color: '#0D9488' },
  { value: 'nature', label: '自然', description: '舒适放松的自然风', color: '#15803D' },
  { value: 'arts', label: '文艺', description: '宁静高雅的灰蓝文艺风', color: '#475569' },
  { value: 'luxury', label: '奢华', description: '尊贵权威的黑金商务风', color: '#B45309' },
];
