import { useEffect, type ReactNode } from 'react';

interface DetailDialogProps {
  eyebrow?: string;
  title: string;
  description?: string;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
  onClose: () => void;
}

export function DetailDialog({
  eyebrow = 'Detail',
  title,
  description,
  className,
  bodyClassName,
  children,
  onClose,
}: DetailDialogProps) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="detail-dialog-backdrop" role="presentation" onClick={onClose}>
      <section className={`detail-dialog-card${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-labelledby="detail-dialog-title" onClick={(event) => event.stopPropagation()}>
        <header className="detail-dialog-header">
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="detail-dialog-title">{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <button className="ghost small" onClick={onClose}>关闭</button>
        </header>
        <div className={`detail-dialog-body${bodyClassName ? ` ${bodyClassName}` : ''}`}>{children}</div>
      </section>
    </div>
  );
}
