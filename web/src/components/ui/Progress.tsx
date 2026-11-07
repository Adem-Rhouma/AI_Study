import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { MASTERY_COLOR, MASTERY_LABEL, MASTERY_ORDER, percent } from '../../lib/format';
import type { MasteryLevel } from '../../api/types';

export function ProgressBar({
  value,
  className,
  tone = 'accent',
  size = 'md',
  label
}: {
  value: number;
  className?: string;
  tone?: 'accent' | 'success' | 'warning' | 'muted';
  size?: 'sm' | 'md';
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const tones = {
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    muted: 'bg-[var(--border-strong)]'
  } as const;
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn('w-full overflow-hidden rounded-pill bg-sunken', size === 'sm' ? 'h-1' : 'h-1.5', className)}
    >
      <div
        className={cn('h-full rounded-pill transition-[width] duration-300', tones[tone])}
        style={{ width: `${clamped * 100}%` }}
      />
    </div>
  );
}

/** Mastery shown as a ramp plus the level name, never by colour alone. */
export function MasteryMeter({ level, score, className }: { level: MasteryLevel; score?: number; className?: string }) {
  const index = MASTERY_ORDER.indexOf(level);
  return (
    <div className={cn('space-y-1', className)}>
      <div className="flex items-center justify-between gap-2 text-caption">
        <span className="font-medium text-ink">{MASTERY_LABEL[level]}</span>
        {score !== undefined && <span className="tnum text-ink-muted">{percent(score)}</span>}
      </div>
      <div className="flex gap-1" aria-hidden>
        {MASTERY_ORDER.map((step, position) => (
          <span
            key={step}
            className="h-1.5 flex-1 rounded-pill"
            style={{ background: position <= index ? MASTERY_COLOR[level] : 'var(--border-subtle)' }}
          />
        ))}
      </div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  icon,
  className,
  tone = 'default'
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  className?: string;
  tone?: 'default' | 'accent';
}) {
  return (
    <div
      className={cn(
        'rounded-card border p-4',
        tone === 'accent' ? 'border-transparent bg-accent-soft' : 'border-line bg-raised',
        className
      )}
    >
      <div className="flex items-center gap-2 text-caption text-ink-secondary">
        {icon && <span className="text-ink-muted">{icon}</span>}
        <span className="eyebrow">{label}</span>
      </div>
      <p className="tnum mt-1.5 text-h2 font-semibold text-ink">{value}</p>
      {hint && <p className="mt-0.5 text-caption text-ink-muted">{hint}</p>}
    </div>
  );
}

export type HeatCell = { date: string; minutes: number };

/** Activity heatmap: five intensity steps of the accent, each also carrying a title for screen readers. */
export function ActivityHeatmap({ cells, className }: { cells: HeatCell[]; className?: string }) {
  const peak = Math.max(1, ...cells.map((cell) => cell.minutes));
  const levelOf = (minutes: number) => {
    if (minutes <= 0) return 0;
    const ratio = minutes / peak;
    if (ratio < 0.15) return 1;
    if (ratio < 0.35) return 2;
    if (ratio < 0.6) return 3;
    if (ratio < 0.85) return 4;
    return 5;
  };
  return (
    <div className={cn('flex flex-wrap gap-1', className)}>
      {cells.map((cell) => {
        const level = levelOf(cell.minutes);
        return (
          <span
            key={cell.date}
            title={`${cell.date}: ${cell.minutes} min`}
            className="size-3 rounded-[3px] border border-line/60"
            style={{
              background:
                level === 0
                  ? 'var(--bg-sunken)'
                  : `color-mix(in oklab, var(--accent) ${level * 18}%, var(--bg-sunken))`
            }}
          >
            <span className="sr-only">
              {cell.date}: {cell.minutes} minutes
            </span>
          </span>
        );
      })}
    </div>
  );
}
