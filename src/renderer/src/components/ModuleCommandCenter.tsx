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
  return (
    <header className={`module-command-center module-command-center--${density} panel`} data-density={density}>
      <div className="module-command-top">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions}
      </div>
      {children}
    </header>
  );
}
