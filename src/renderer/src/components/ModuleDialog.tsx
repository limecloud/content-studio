import { NAV_GROUPS } from '../app/constants';
import type { ReactNode } from 'react';
import type { ModuleKey } from '../app/types';

const MODULE_TITLES: Record<ModuleKey, { eyebrow: string; title: string; description: string }> = {
  image: { eyebrow: 'Image Engine', title: '图片引擎', description: '上传素材、选择场景卡，并调用真实图片 Provider 生成可追溯素材。' },
  video: { eyebrow: 'Video Engine', title: '视频引擎', description: '基于知识库生成脚本；未配置真实视频 Provider 时只创建 blocked 队列。' },
  article: { eyebrow: 'Article Studio', title: '文章生成', description: '基于知识引用、提示词包和场景卡生成正文草稿。' },
  knowledge: { eyebrow: 'Knowledge Hub', title: '成型知识库', description: '管理产品型 / 个人 IP 知识库、引用片段和提示词包。' },
  assets: { eyebrow: 'Asset Library', title: '素材库 / 历史', description: '回看生成记录、输入输出、素材路径和重试入口。' },
  skills: { eyebrow: 'Skills Manager', title: 'Skills 管理', description: '扫描、安装、启用并检查当前内容生成能力。' },
};

interface ModuleDialogProps {
  activeModule: ModuleKey;
  children: ReactNode;
  error?: string | null;
  onClose: () => void;
  onSelectModule: (module: ModuleKey) => void;
}

export function ModuleDialog({ activeModule, children, error, onClose, onSelectModule }: ModuleDialogProps) {
  const meta = MODULE_TITLES[activeModule];
  const moduleItems = NAV_GROUPS.flatMap((group) => group.items).filter((item) => item.key);

  return (
    <div className="module-dialog-backdrop" role="presentation">
      <section className="module-dialog-card" role="dialog" aria-modal="true" aria-labelledby="module-dialog-title">
        <header className="module-dialog-header">
          <div>
            <p className="eyebrow">{meta.eyebrow}</p>
            <h2 id="module-dialog-title">{meta.title}</h2>
            <p>{meta.description}</p>
          </div>
          <button className="ghost small" onClick={onClose}>关闭弹窗</button>
        </header>
        <nav className="module-dialog-tabs" aria-label="功能弹窗切换">
          {moduleItems.map((item) => (
            <button
              key={item.key}
              className={activeModule === item.key ? 'active' : ''}
              onClick={() => item.key && onSelectModule(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="module-dialog-body">
          {error ? <div className="error-banner module-error">{error}</div> : null}
          {children}
        </div>
      </section>
    </div>
  );
}
