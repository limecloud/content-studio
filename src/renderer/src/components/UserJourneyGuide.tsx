import type { ReactNode } from 'react';
import type { ModuleKey } from '../app/types';

export type JourneyStepState = 'done' | 'active' | 'next' | 'blocked' | 'idle';

export interface JourneyStep {
  key: string;
  title: string;
  description: string;
  state?: JourneyStepState;
  module?: ModuleKey;
}

export interface JourneyAction {
  label: string;
  primary?: boolean;
  disabled?: boolean;
  help?: string;
  module?: ModuleKey;
  onClick?: () => void;
}

interface UserJourneyGuideProps {
  title: string;
  description: string;
  steps: JourneyStep[];
  actions?: JourneyAction[];
  aside?: ReactNode;
  onSelectModule?: (module: ModuleKey) => void;
}

const STEP_STATE_LABELS: Record<JourneyStepState, string> = {
  done: '已完成',
  active: '当前',
  next: '下一步',
  blocked: '待补齐',
  idle: '待处理',
};

function actionHandler(
  action: JourneyAction,
  onSelectModule?: (module: ModuleKey) => void,
): (() => void) | undefined {
  if (action.onClick) return action.onClick;
  if (action.module && onSelectModule) return () => onSelectModule(action.module as ModuleKey);
  return undefined;
}

export function UserJourneyGuide({
  title,
  description,
  steps,
  actions = [],
  aside,
  onSelectModule,
}: UserJourneyGuideProps) {
  return (
    <section className="user-journey-guide panel" aria-label={title}>
      <div className="user-journey-head">
        <div>
          <p className="eyebrow">普通用户任务路径</p>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        {aside ? <div className="user-journey-aside">{aside}</div> : null}
      </div>

      <ol className="user-journey-steps">
        {steps.map((step, index) => {
          const state = step.state ?? 'idle';
          const handleClick = step.module && onSelectModule
            ? () => onSelectModule(step.module as ModuleKey)
            : undefined;
          const content = (
            <>
              <span className={`journey-step-index ${state}`}>{index + 1}</span>
              <span>
                <strong>{step.title}</strong>
                <small>{step.description}</small>
              </span>
              <em className={`journey-step-state ${state}`}>{STEP_STATE_LABELS[state]}</em>
            </>
          );
          return (
            <li key={step.key} className={state}>
              {handleClick ? (
                <button type="button" onClick={handleClick}>
                  {content}
                </button>
              ) : (
                <div>{content}</div>
              )}
            </li>
          );
        })}
      </ol>

      {actions.length ? (
        <div className="user-journey-actions">
          {actions.map((action) => {
            const handleClick = actionHandler(action, onSelectModule);
            return (
              <button
                key={action.label}
                type="button"
                className={action.primary ? 'primary small' : 'ghost small'}
                disabled={action.disabled || !handleClick}
                onClick={handleClick}
                title={action.help}
              >
                {action.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
