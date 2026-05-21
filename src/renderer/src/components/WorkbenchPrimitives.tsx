import type { ReactNode } from 'react';

export type StatusPillTone = 'idle' | 'ready' | 'blocked';

interface StatusPillProps {
  tone?: StatusPillTone;
  className?: string;
  children: ReactNode;
}

interface ActionGroupProps {
  align?: 'left' | 'right';
  className?: string;
  children: ReactNode;
}

interface SelectableRecordCardProps {
  active?: boolean;
  className?: string;
  status?: ReactNode;
  statusTone?: StatusPillTone;
  title: ReactNode;
  meta?: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  onClick: () => void;
}

export function StatusPill({ tone = 'idle', className = '', children }: StatusPillProps) {
  const classes = ['status-pill', tone, className].filter(Boolean).join(' ');
  return <span className={classes}>{children}</span>;
}

export function ActionGroup({ align = 'right', className = '', children }: ActionGroupProps) {
  const classes = ['workflow-actions', align === 'left' ? 'left' : '', className].filter(Boolean).join(' ');
  return <div className={classes}>{children}</div>;
}

export function SelectableRecordCard({
  active = false,
  className = '',
  status,
  statusTone = 'idle',
  title,
  meta,
  description,
  children,
  onClick,
}: SelectableRecordCardProps) {
  const classes = ['record-card', className, active ? 'active' : ''].filter(Boolean).join(' ');

  return (
    <button type="button" className={classes} onClick={onClick}>
      {status ? <StatusPill tone={statusTone}>{status}</StatusPill> : null}
      <strong>{title}</strong>
      {meta ? <small>{meta}</small> : null}
      {description ? <p>{description}</p> : null}
      {children}
    </button>
  );
}
