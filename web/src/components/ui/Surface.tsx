import type { ElementType, HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export type CardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: 'default' | 'interactive' | 'sunken' | 'inverse';
  padded?: boolean;
  as?: 'div' | 'article' | 'section' | 'li';
};

/** Cards use a border for structure and reserve shadows for hover/motion states. */
export function Card({ variant = 'default', padded = true, as = 'div', className, children, ...rest }: CardProps) {
  const Tag = as as ElementType;
  const props = rest as Record<string, unknown>;
  return (
    <Tag
      className={cn(
        'rounded-card border transition-shadow duration-150',
        variant === 'default' && 'border-line bg-raised',
        variant === 'interactive' &&
          'border-line bg-raised hover:border-[var(--border-strong)] hover:shadow-2',
        variant === 'sunken' && 'border-line bg-sunken',
        variant === 'inverse' && 'border-transparent bg-inverse text-ink-inverse',
        padded && 'p-4',
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  description,
  actions,
  className
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        {eyebrow && <span className="eyebrow text-caption">{eyebrow}</span>}
        <h2 className="text-h3 font-semibold text-ink">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-caption text-ink-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Divider({ className, label }: { className?: string; label?: string }) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3 text-caption text-ink-muted', className)}>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
        <span className="eyebrow">{label}</span>
        <span className="h-px flex-1 bg-[var(--border-subtle)]" />
      </div>
    );
  }
  return <hr className={cn('border-0 border-t border-[var(--border-subtle)]', className)} />;
}