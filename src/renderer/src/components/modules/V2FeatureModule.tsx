import { V2_FEATURES, getV2FeatureActionTarget } from '../../app/v2FeatureRegistry';
import type { ModuleKey, V2ModuleKey } from '../../app/types';
import type { V2FeatureActionTarget } from '../../app/v2FeatureTypes';
import { ModuleCommandCenter } from '../ModuleCommandCenter';

interface V2FeatureModuleProps {
  module: V2ModuleKey;
  onSelectModule: (module: ModuleKey) => void;
}

export function V2FeatureModule({ module, onSelectModule }: V2FeatureModuleProps) {
  const feature = V2_FEATURES[module];
  const primaryTarget = getV2FeatureActionTarget(module, 'primary');
  const secondaryTarget = getV2FeatureActionTarget(module, 'secondary');

  function handleAction(target: V2FeatureActionTarget) {
    onSelectModule(target.module);
  }

  return (
    <section className="module-managed-workbench">
      <ModuleCommandCenter
        eyebrow={feature.eyebrow}
        title={feature.title}
        description={feature.description}
        density="flow"
        actions={(
          <div className="v2-feature-actions">
            <span className={`status-pill ${feature.status === '待配置' ? 'blocked' : 'idle'}`}>
              {feature.status}
            </span>
            <button
              type="button"
              className="primary small"
              disabled={!primaryTarget}
              onClick={() => primaryTarget && handleAction(primaryTarget)}
            >
              {feature.primaryAction}
            </button>
            <button
              type="button"
              className="ghost small"
              disabled={!secondaryTarget}
              onClick={() => secondaryTarget && handleAction(secondaryTarget)}
            >
              {feature.secondaryAction}
            </button>
          </div>
        )}
      >
        <div className="module-command-flow">
          <div>
            <p className="eyebrow">业务链路</p>
            <h3>{feature.scope}</h3>
          </div>
        </div>
        <div className="v2-flow-steps module-command-steps">
          {feature.flow.map((step) => (
            <span key={step}>{step}</span>
          ))}
        </div>
      </ModuleCommandCenter>

      <div className="v2-feature-grid">
        {feature.cards.map((card) => (
          <article key={card.title} className="v2-feature-card panel">
            <h3>{card.title}</h3>
            <p>{card.text}</p>
            <div className="chip-row tight">
              {card.items.map((item) => (
                <span key={item} className="chip-button active">{item}</span>
              ))}
            </div>
          </article>
        ))}
      </div>

      <section className="v2-feature-grid">
        <article className="v2-feature-preview panel">
          <p className="eyebrow">当前产物预览</p>
          <pre>{feature.preview}</pre>
        </article>
        <article className="v2-feature-card panel">
          <h3>运行状态</h3>
          <p>这里展示当前能力的可运行状态、来源追溯和恢复路径；未配置真实能力时只保留待配置记录。</p>
          <div className="v2-state-row">
            <span>本地工作区</span>
            <span>来源追溯</span>
            <span>待配置恢复路径</span>
          </div>
        </article>
      </section>

      <section className="v2-feature-table panel">
        <div className="v2-feature-row header">
          <span>对象</span>
          <span>状态</span>
          <span>字段</span>
          <span>下一步</span>
        </div>
        {feature.table.map(([object, status, field, next]) => (
          <div key={`${object}:${field}`} className="v2-feature-row">
            <strong>{object}</strong>
            <span>{status}</span>
            <span>{field}</span>
            <span>{next}</span>
          </div>
        ))}
      </section>
    </section>
  );
}
