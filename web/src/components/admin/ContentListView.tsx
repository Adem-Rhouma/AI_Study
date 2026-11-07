import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { keys } from '../../api/keys';
import type { AdminFieldSpec, AdminKindSpec, ContentListPage, ContentListRow } from '../../api/types';
import { formatDateTime, formatRelative } from '../../lib/format';
import {
  Button,
  Card,
  Chip,
  ConfirmDialog,
  DataTable,
  EmptyState,
  IconButton,
  Pagination,
  QueryBoundary,
  SearchInput,
  Select,
  type Column
} from '../ui';
import { useToast } from '../ui/Toast';
import { ContentEditor } from './ContentEditor';
import { refreshContentCaches } from './refreshCaches';

/** Which document the editor shows: null closes it, `{slug: null}` opens a row that does not exist yet. */
export type EditingTarget = { slug: string | null } | null;

/** How a row is addressed for reading, editing and deleting: its slug, or its id when it has none. */
const address = (row: ContentListRow): string => row.slug ?? String(row.id);

/** The status word is written in the control itself, so the colour is never the only signal. */
const STATUS_TEXT: Record<string, string> = {
  published: 'text-success',
  draft: 'text-warning',
  review: 'text-info',
  archived: 'text-ink-muted',
  open: 'text-success',
  ongoing: 'text-info',
  upcoming: 'text-ink-secondary',
  recurring: 'text-ink-secondary',
  closed: 'text-ink-muted'
};

export function ContentListView({
  kind,
  itemShapes,
  q,
  status,
  page,
  perPage,
  editing,
  onFiltersChange,
  onEditingChange
}: {
  kind: AdminKindSpec;
  itemShapes: Record<string, AdminFieldSpec[]>;
  q: string;
  status: string;
  page: number;
  perPage: number;
  editing: EditingTarget;
  onFiltersChange: (filters: { q?: string; status?: string; page?: number; perPage?: number }) => void;
  onEditingChange: (editing: EditingTarget) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [deleting, setDeleting] = useState<ContentListRow | null>(null);

  const list = useQuery({
    queryKey: keys.adminContent(kind.kind, { q, status, page, perPage }),
    queryFn: () =>
      api.get<ContentListPage>(`/admin/content/${kind.kind}`, { q, status, page, perPage }),
    placeholderData: (previous) => previous
  });

  const setStatus = useMutation({
    mutationFn: ({ ref, status }: { ref: string; status: string }) =>
      api.post<{ kind: string; ref: string; status: string }>(`/admin/content/${kind.kind}/${encodeURIComponent(ref)}/status`, { status }),
    onSuccess: (result) => {
      refreshContentCaches(queryClient);
      toast.info(`${result.ref} is now ${result.status}.`);
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'The status change failed.')
  });

  const remove = useMutation({
    mutationFn: (ref: string) => api.del<{ deleted: boolean; kind: string; ref: string }>(`/admin/content/${kind.kind}/${encodeURIComponent(ref)}`),
    onSuccess: (result) => {
      refreshContentCaches(queryClient);
      setDeleting(null);
      toast.info(`Deleted ${result.ref}.`);
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'The delete failed.')
  });

  const columns: Column<ContentListRow>[] = [
    {
      key: 'title',
      header: kind.fields[0]?.label ?? 'Title',
      cell: (row) => (
        <span className="block min-w-0">
          <button
            type="button"
            className="cursor-pointer text-left font-medium text-ink transition-colors hover:text-accent-hover"
            onClick={() => onEditingChange({ slug: address(row) })}
          >
            {row.title}
          </button>
          {row.slug && <span className="block truncate text-caption text-ink-muted">{row.slug}</span>}
        </span>
      )
    },
    {
      key: 'counts',
      header: 'Holds',
      cell: (row) => (
        <span className="flex flex-wrap gap-1.5">
          {kind.listCounts.length === 0 && <span className="text-ink-muted">—</span>}
          {kind.listCounts.map((count) => (
            <Chip key={count.key} tone="neutral">
              <span className="tnum">{row.counts[count.key] ?? 0}</span> {count.label}
            </Chip>
          ))}
        </span>
      )
    },
    ...(kind.statuses
      ? [
          {
            key: 'status',
            header: 'Status',
            cell: (row: ContentListRow) => (
              <Select
                aria-label={`Status for ${row.title}`}
                value={row.status ?? ''}
                className={`w-auto py-1 text-caption font-medium ${(row.status && STATUS_TEXT[row.status]) || 'text-ink-secondary'}`}
                onChange={(event) => setStatus.mutate({ ref: address(row), status: event.target.value })}
              >
                {row.status && !kind.statuses?.includes(row.status) && <option value={row.status}>{row.status}</option>}
                {kind.statuses?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </Select>
            )
          } as Column<ContentListRow>
        ]
      : []),
    {
      key: 'updated',
      header: 'Updated',
      cell: (row) => (row.updatedAt ? <span title={formatDateTime(row.updatedAt)}>{formatRelative(row.updatedAt)}</span> : <span className="text-ink-muted">—</span>)
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      cell: (row) => (
        <span className="inline-flex gap-1">
          <IconButton label={`Edit ${row.title}`} size="sm" onClick={() => onEditingChange({ slug: address(row) })}>
            <Pencil size={14} aria-hidden />
          </IconButton>
          <IconButton label={`Delete ${row.title}`} size="sm" tone="danger" onClick={() => setDeleting(row)}>
            <Trash2 size={14} aria-hidden />
          </IconButton>
        </span>
      )
    }
  ];

  const total = list.data?.total ?? 0;
  const filtered = q !== '' || status !== 'all';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            className="w-56"
            value={q}
            ariaLabel={`Search ${kind.label}`}
            placeholder={`Search ${kind.label}…`}
            onValueChange={(value) => onFiltersChange({ q: value, page: 1 })}
          />
          {kind.statuses && (
            <Select
              aria-label="Filter by status"
              value={status}
              className="w-auto"
              onChange={(event) => onFiltersChange({ status: event.target.value, page: 1 })}
            >
              <option value="all">Every status</option>
              {kind.statuses.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          )}
        </div>
        <Button variant="primary" onClick={() => onEditingChange({ slug: null })} iconLeft={<Plus size={15} aria-hidden />}>
          New {kind.kind}
        </Button>
      </div>

      <QueryBoundary
        state={list}
        onRetry={() => void list.refetch()}
        isEmpty={total === 0}
        empty={
          <EmptyState
            title={filtered ? 'Nothing matches those filters' : `No ${kind.label.toLowerCase()} yet`}
            description={
              filtered
                ? 'Clear the search box or choose every status to see the rest.'
                : `The first ${kind.kind} written here appears on the learner-facing pages as soon as it is published.`
            }
            action={
              <Button variant="secondary" onClick={() => onEditingChange({ slug: null })} iconLeft={<Plus size={15} aria-hidden />}>
                New {kind.kind}
              </Button>
            }
          />
        }
        loading={
          <Card variant="sunken" className="space-y-2">
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-full" />
            <div className="skeleton h-9 w-2/3" />
          </Card>
        }
      >
        <DataTable rows={list.data?.items ?? []} columns={columns} rowKey={(row) => row.id} />
        <Pagination
          page={list.data?.page ?? page}
          totalPages={list.data?.totalPages ?? 1}
          total={total}
          perPage={perPage}
          perPageOptions={[24, 50, 100]}
          onPageChange={(next) => onFiltersChange({ page: next })}
          onPerPageChange={(next) => onFiltersChange({ perPage: next, page: 1 })}
        />
      </QueryBoundary>

      <ContentEditor
        kind={kind}
        itemShapes={itemShapes}
        slug={editing?.slug ?? null}
        open={editing !== null}
        onOpenChange={(open) => !open && onEditingChange(null)}
      />

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.title ?? ''}?`}
        body={
          <>
            <p>
              {kind.consequence} Deleting removes the row and the child tables attached to it; the audit trail keeps
              the record that it existed.
            </p>
            <p className="mt-2 text-ink-muted">Archiving instead keeps it readable for anybody who already has it.</p>
          </>
        }
        confirmLabel="Delete permanently"
        busy={remove.isPending}
        onConfirm={() => deleting && remove.mutate(address(deleting))}
      />
    </div>
  );
}
