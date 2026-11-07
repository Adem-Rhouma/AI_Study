import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { DIFFICULTY_BARS, DIFFICULTY_LABEL, MASTERY_COLOR, MASTERY_LABEL, MASTERY_ORDER } from '../../lib/format';
import type { Difficulty, MasteryLevel, RelationKind } from '../../api/types';
import { Link } from 'react-router-dom';

type Tone = 'neutral' | 'accent' | 'info' | 'success' | 'warning' | 'danger';

const TONES: Record<Tone, string> = {
  neutral: 'border-line bg-sunken text-ink-secondary',
  accent: 'border-[var(--accent-soft)] bg-[var(--accent-soft)] text-accent-hover',
  info: 'border-transparent bg-info-soft text-info',
  success: 'border-transparent bg-success-soft text-success',
  warning: 'border-transparent bg-warning-soft text-warning',
  danger: 'border-transparent bg-danger-soft text-danger'
};

export function Chip({
  tone = 'neutral',
  className,
  children,
  icon
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-pill border px-2 py-0.5 text-caption font-medium leading-5',
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}

export function Badge({ count, tone = 'accent', className }: { count: number; tone?: Tone; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        'inline-grid min-w-5 place-items-center rounded-pill px-1.5 text-caption font-semibold tnum',
        TONES[tone],
        className
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

/** Bars rather than hue alone: the ramp survives greyscale printing and colour-blind viewing. */
export function DifficultyChip({ difficulty, className }: { difficulty: Difficulty; className?: string }) {
  const bars = DIFFICULTY_BARS[difficulty];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-pill border border-line bg-sunken px-2 py-0.5 text-caption font-medium text-ink-secondary',
        className
      )}
    >
      <span aria-hidden className="flex items-end gap-0.5">
        {[1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn('w-1 rounded-sm', step <= bars ? 'bg-accent' : 'bg-[var(--border-strong)]')}
            style={{ height: 4 + step * 2 }}
          />
        ))}
      </span>
      {DIFFICULTY_LABEL[difficulty]}
    </span>
  );
}

export function MasteryChip({
  level,
  topicSlug,
  stale,
  className
}: {
  level: MasteryLevel;
  topicSlug?: string;
  stale?: boolean;
  className?: string;
}) {
  const filled = MASTERY_ORDER.indexOf(level);
  const body = (
    <>
      <span aria-hidden className="flex items-end gap-0.5">
        {[0, 1, 2, 3, 4, 5].map((step) => (
          <span
            key={step}
            className={cn('w-1.5 rounded-sm', step <= filled ? '' : 'bg-[var(--border-strong)]')}
            style={{ height: 5 + step * 2, background: step <= filled ? MASTERY_COLOR[level] : undefined }}
          />
        ))}
      </span>
      {MASTERY_LABEL[level]}
      {stale && <span className="text-warning">· needs revalidation</span>}
    </>
  );
  const shared = cn(
    'inline-flex items-center gap-1.5 rounded-pill border border-line bg-raised px-2 py-0.5 text-caption font-medium text-ink-secondary',
    className
  );
  if (topicSlug) {
    return (
      <Link to={`/explore/${topicSlug}`} className={shared}>
        {body}
      </Link>
    );
  }
  return <span className={shared}>{body}</span>;
}

export const RELATION_TONE: Record<RelationKind, Tone> = {
  strict: 'accent',
  recommended: 'info',
  related: 'neutral',
  extension: 'success'
};

export function RelationChip({ kind, label }: { kind: RelationKind; label?: string }) {
  return <Chip tone={RELATION_TONE[kind]}>{label ?? kind}</Chip>;
}
