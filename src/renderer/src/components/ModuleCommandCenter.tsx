import type { ReactNode } from 'react';

type ModuleCommandCenterDensity = 'compact' | 'managed' | 'flow';

interface ModuleCommandCenterProps {
  eyebrow: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  density?: ModuleCommandCenterDensity;
  children?: ReactNode;
}

export function ModuleCommandCenter({
  eyebrow,
  title,
  description,
  actions,
  density = 'managed',
  children,
}: ModuleCommandCenterProps) {
  const compactDescription =
    density === 'compact' && typeof description === 'string' ? description : '';
  return (
    <header className={`module-command-center module-command-center--${density} panel`} data-density={density}>
      <div className="module-command-top">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <div className="module-command-title-row">
            <h2>{title}</h2>
            {compactDescription ? (
              <span className="module-command-help" aria-label="页面说明" title={compactDescription}>?</span>
            ) : null}
          </div>
          {description && density !== 'compact' ? <p>{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </header>
  );
}
