import type { ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '../../lib/cn';
import { EmptyState, SkeletonRows } from './Feedback';

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  sortKey?: string;
  align?: 'left' | 'right';
  className?: string;
};

export type SortState = { key: string; direction: 'asc' | 'desc' } | null;

/** Tables scroll horizontally on narrow screens instead of collapsing into unreadable stacks. */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  sort,
  onSortChange,
  loading,
  empty,
  dense,
  className
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string | number;
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  loading?: boolean;
  empty?: ReactNode;
  dense?: boolean;
  className?: string;
}) {
  if (loading) return <SkeletonRows rows={dense ? 6 : 4} />;
  if (rows.length === 0) return <>{empty ?? <EmptyState title="Nothing here yet" />}</>;

  return (
    <div className={cn('-mx-1 overflow-x-auto px-1', className)}>
      <table className="w-full border-collapse text-left text-body">
        <thead>
          <tr className="border-b border-line">
            {columns.map((column) => {
              const active = sort?.key === column.sortKey;
              const header = (
                <span className="inline-flex items-center gap-1">
                  {column.header}
                  {column.sortKey && onSortChange && (
                    <span className="text-ink-muted">
                      {active ? (
                        sort?.direction === 'asc' ? (
                          <ArrowUp size={13} aria-hidden />
                        ) : (
                          <ArrowDown size={13} aria-hidden />
                        )
                      ) : (
                        <ChevronsUpDown size={13} aria-hidden />
                      )}
                    </span>
                  )}
                </span>
              );
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (sort?.direction === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn(
                    'eyebrow whitespace-nowrap px-3 py-2 text-caption font-semibold',
                    column.align === 'right' && 'text-right',
                    column.className
                  )}
                >
                  {column.sortKey && onSortChange ? (
                    <button
                      type="button"
                      className="inline-flex cursor-pointer items-center gap-1 uppercase transition-colors hover:text-ink"
                      onClick={() =>
                        onSortChange(
                          active && sort?.direction === 'asc'
                            ? { key: column.sortKey!, direction: 'desc' }
                            : { key: column.sortKey!, direction: 'asc' }
                        )
                      }
                    >
                      {header}
                    </button>
                  ) : (
                    header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-[var(--border-subtle)] transition-colors last:border-0 hover:bg-sunken/60">
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={cn(
                    'px-3 align-middle text-ink-secondary',
                    dense ? 'py-1.5' : 'py-2.5',
                    column.align === 'right' && 'text-right tnum',
                    column.className
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
