import type { ModuleKey } from '../app/types';

const DASHBOARD_CARDS: Array<{
  module: ModuleKey;
  index: string;
  title: string;
  description: string;
  statLabel: string;
}> = [
  { module: 'knowledge', index: '01', title: '知识库列表', description: '从成型知识库选择引用，生成品牌口吻、视觉风格和合规边界。', statLabel: '提示词包' },
  { module: 'image', index: '02', title: '图片素材工作台', description: '使用场景卡、产品图和参考图调用真实图片 Provider。', statLabel: '场景卡' },
  { module: 'video', index: '03', title: '视频脚本工作台', description: '生成短视频脚本；视频 Provider 未配置时只保存队列文件。', statLabel: '视频队列' },
  { module: 'article', index: '04', title: '文章生成工作台', description: '把知识引用和场景卡转成大纲、正文和发布检查。', statLabel: '正文草稿' },
  { module: 'assets', index: '05', title: '素材库 / 历史', description: '回看输入输出、素材路径、模型参数和重试入口。', statLabel: '历史记录' },
  { module: 'skills', index: '06', title: 'Skills 管理', description: '管理参与生成链路的内置、项目和用户级 Skills。', statLabel: '启用能力' },
];

interface WorkbenchDashboardProps {
  workspaceReady: boolean;
  promptPacksCount: number;
  sceneCardsCount: number;
  logsCount: number;
  skillsCount: number;
  enabledSkillsCount: number;
  activeModule: ModuleKey;
  onOpenModule: (module: ModuleKey) => void;
}

function cardStat(module: ModuleKey, props: WorkbenchDashboardProps): string {
  if (module === 'knowledge') return `${props.promptPacksCount} 个`;
  if (module === 'image') return `${props.sceneCardsCount} 张`;
  if (module === 'video') return `${props.logsCount} 条历史`;
  if (module === 'assets') return `${props.logsCount} 条`;
  if (module === 'skills') return `${props.enabledSkillsCount}/${props.skillsCount}`;
  return props.workspaceReady ? '可生成' : '待工作区';
}

export function WorkbenchDashboard(props: WorkbenchDashboardProps) {
  return (
    <section className="workbench-dashboard">
      <div className="dashboard-hero panel">
        <div>
          <p className="eyebrow">Main Workbench</p>
          <h2>列表页留在主工作台，详情再进弹窗</h2>
          <p>主界面承载列表、筛选和当前模块工作台；详情、编辑、配置和历史明细再进入独立弹窗，避免把一级页面藏起来。</p>
        </div>
        <button className="primary" onClick={() => props.onOpenModule(props.activeModule)}>
          查看当前模块
        </button>
      </div>

      <div className="module-launch-grid">
        {DASHBOARD_CARDS.map((card) => (
          <button
            key={card.module}
            className={`module-launch-card ${props.activeModule === card.module ? 'active' : ''}`}
            onClick={() => props.onOpenModule(card.module)}
          >
            <span>{card.index}</span>
            <strong>{card.title}</strong>
            <p>{card.description}</p>
            <em>{card.statLabel} · {cardStat(card.module, props)}</em>
          </button>
        ))}
      </div>
    </section>
  );
}
