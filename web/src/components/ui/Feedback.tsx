import type { ReactNode } from 'react';
import { AlertTriangle, Info, Loader2, SearchX, TriangleAlert } from 'lucide-react';
import { cn } from '../../lib/cn';
import { ApiError } from '../../api/client';
import { Button } from './Button';

export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-live="polite" className={cn('inline-flex items-center gap-2', className)}>
      <Loader2 size={16} className="animate-spin text-accent" aria-hidden />
      <span className="sr-only">{label ?? 'Loading'}</span>
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('skeleton h-4 w-full', className)} />;
}

/** Placeholder shaped like a content card so loading does not shift the layout. */
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-2 rounded-card border border-line bg-raised p-4', className)}>
      <Skeleton className="h-4 w-1/3" />
      {Array.from({ length: lines }).map((_, index) => (
        <Skeleton key={index} className={cn('h-3', index === lines - 1 ? 'w-2/3' : 'w-full')} />
      ))}
    </div>
  );
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div aria-hidden className={cn('space-y-2', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-10 w-full" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
  className
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('rounded-card border border-dashed border-line-strong bg-sunken px-6 py-10 text-center', className)}>
      <div className="mx-auto grid size-10 place-items-center rounded-pill border border-line bg-raised text-ink-muted">
        {icon ?? <SearchX size={18} aria-hidden />}
      </div>
      <h3 className="mt-3 text-small-title font-semibold text-ink">{title}</h3>
      {description && <p className="mx-auto mt-1 max-w-md text-caption text-ink-secondary">{description}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function InlineAlert({
  tone = 'info',
  title,
  children,
  action,
  className
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-info/35 bg-info-soft text-info',
    success: 'border-success/35 bg-success-soft text-success',
    warning: 'border-warning/40 bg-warning-soft text-warning',
    danger: 'border-danger/35 bg-danger-soft text-danger'
  } as const;
  const icons = {
    info: <Info size={16} aria-hidden />,
    success: <Info size={16} aria-hidden />,
    warning: <AlertTriangle size={16} aria-hidden />,
    danger: <TriangleAlert size={16} aria-hidden />
  } as const;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2.5 rounded-card border px-3.5 py-3', tones[tone], className)}
    >
      <span className="mt-0.5 shrink-0">{icons[tone]}</span>
      <div className="min-w-0 flex-1 text-caption">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'text-ink-secondary')}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}

export function ErrorState({
  error,
  onRetry,
  title = 'This could not be loaded',
  className
}: {
  error: unknown;
  onRetry?: () => void;
  title?: string;
  className?: string;
}) {
  const status = error instanceof ApiError ? error.status : undefined;
  const hint =
    status === 401
      ? 'Sign in to see this.'
      : status === 403
        ? 'Your account does not have access to this.'
        : status === 404
          ? 'It may have been moved or removed.'
          : status === 429
            ? 'Too many requests — wait a moment and try again.'
            : undefined;
  return (
    <div className={cn('rounded-card border border-danger/35 bg-danger-soft/40 px-5 py-6', className)} role="alert">
      <div className="flex items-start gap-2.5">
        <TriangleAlert size={18} className="mt-0.5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0">
          <h3 className="text-small-title font-semibold text-ink">{title}</h3>
          <p className="mt-1 text-caption text-ink-secondary">{errorMessage(error)}</p>
          {hint && <p className="mt-0.5 text-caption text-ink-muted">{hint}</p>}
          {onRetry && (
            <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
              Try again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

type QueryState = { isLoading: boolean; error: unknown; isFetching?: boolean };

/** One place where loading, error and empty are handled so no page can forget a state. */
export function QueryBoundary({
  state,
  onRetry,
  isEmpty,
  loading,
  empty,
  children,
  className
}: {
  state: QueryState;
  onRetry?: () => void;
  isEmpty?: boolean;
  loading?: ReactNode;
  empty?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  if (state.isLoading) return <>{loading ?? <SkeletonRows />}</>;
  if (state.error) return <ErrorState error={state.error} onRetry={onRetry} className={className} />;
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}
