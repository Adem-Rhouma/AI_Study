import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

export type Crumb = { label: ReactNode; to?: string };

export function Breadcrumbs({ items, className }: { items: Crumb[]; className?: string }) {
  return (
    <nav aria-label="Breadcrumb" className={cn('mb-3', className)}>
      <ol className="flex flex-wrap items-center gap-1 text-caption text-ink-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-1">
              {item.to && !last ? (
                <Link to={item.to} className="transition-colors hover:text-accent-hover">
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={cn(last && 'text-ink-secondary')}>
                  {item.label}
                </span>
              )}
              {!last && <ChevronRight size={13} aria-hidden className="text-ink-muted/60" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  crumbs,
  children,
  className
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  crumbs?: Crumb[];
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn('mb-6', className)}>
      {crumbs && crumbs.length > 0 && <Breadcrumbs items={crumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1 text-caption">{eyebrow}</p>}
          <h1 className="text-h1 font-semibold tracking-tight text-ink">{title}</h1>
          {description && (
            <p className="mt-2 max-w-2xl text-body leading-relaxed text-ink-secondary">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}
