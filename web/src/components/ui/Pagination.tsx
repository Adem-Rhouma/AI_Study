import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';
import { Button } from './Button';
import { Select } from './Field';

/** Compact window around the current page: 1 … 4 5 6 … 20. */
function pageWindow(page: number, totalPages: number): (number | 'gap')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1);
  const window = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  if (page <= 3) [2, 3, 4].forEach((n) => window.add(n));
  if (page >= totalPages - 2) [totalPages - 3, totalPages - 2, totalPages - 1].forEach((n) => window.add(n));
  const sorted = [...window].filter((n) => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  const out: (number | 'gap')[] = [];
  sorted.forEach((n, index) => {
    if (index > 0 && n - sorted[index - 1]! > 1) out.push('gap');
    out.push(n);
  });
  return out;
}

export function Pagination({
  page,
  totalPages,
  total,
  perPage,
  onPageChange,
  onPerPageChange,
  perPageOptions = [10, 20, 50],
  className
}: {
  page: number;
  totalPages: number;
  total?: number;
  perPage?: number;
  onPageChange: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  perPageOptions?: number[];
  className?: string;
}) {
  if (totalPages <= 1 && !onPerPageChange) return null;
  const from = total === undefined ? undefined : Math.min(total, (page - 1) * (perPage ?? 0) + 1);
  const to = total === undefined || perPage === undefined ? undefined : Math.min(total, page * perPage);

  return (
    <nav aria-label="Pagination" className={cn('flex flex-wrap items-center justify-between gap-3', className)}>
      <p className="text-caption text-ink-muted tnum">
        {from !== undefined && to !== undefined
          ? `Showing ${from}–${to} of ${total}`
          : `Page ${page} of ${totalPages}`}
      </p>
      <div className="flex items-center gap-3">
        {onPerPageChange && perPage !== undefined && (
          <label className="flex items-center gap-2 text-caption text-ink-muted">
            Per page
            <Select
              aria-label="Results per page"
              value={String(perPage)}
              onChange={(event) => onPerPageChange(Number(event.target.value))}
              className="w-auto py-1 text-caption"
            >
              {perPageOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </label>
        )}
        {totalPages > 1 && (
          <ul className="flex items-center gap-1">
            <li>
              <Button
                variant="ghost"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft size={15} aria-hidden />
              </Button>
            </li>
            {pageWindow(page, totalPages).map((entry, index) =>
              entry === 'gap' ? (
                <li key={`gap-${index}`} className="px-1 text-caption text-ink-muted" aria-hidden>
                  …
                </li>
              ) : (
                <li key={entry}>
                  <button
                    type="button"
                    onClick={() => onPageChange(entry)}
                    aria-current={entry === page ? 'page' : undefined}
                    className={cn(
                      'tnum min-w-8 cursor-pointer rounded-input px-2 py-1 text-caption font-medium transition-colors',
                      entry === page
                        ? 'bg-accent text-on-accent'
                        : 'text-ink-secondary hover:bg-sunken hover:text-ink'
                    )}
                  >
                    {entry}
                  </button>
                </li>
              )
            )}
            <li>
              <Button
                variant="ghost"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => onPageChange(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight size={15} aria-hidden />
              </Button>
            </li>
          </ul>
        )}
      </div>
    </nav>
  );
}
