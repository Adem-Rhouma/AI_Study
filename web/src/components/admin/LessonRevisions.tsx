import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { History } from 'lucide-react';
import { api } from '../../api/client';
import { keys } from '../../api/keys';
import type { LessonRevision, LessonRevisionDetail } from '../../api/types';
import { formatDateTime } from '../../lib/format';
import { Button, Card, Chip, DataTable, Modal, QueryBoundary, type Column } from '../ui';

/**
 * A lesson is the one content type whose previous text the server keeps, so the editor can show what
 * a save replaced instead of asking somebody to remember it.
 */
export function LessonRevisions({ slug }: { slug: string }) {
  const [viewing, setViewing] = useState<number | null>(null);

  const list = useQuery({
    queryKey: keys.adminRevisions(slug),
    queryFn: () => api.get<{ revisions: LessonRevision[] }>(`/admin/content/lesson/${encodeURIComponent(slug)}/revisions`)
  });

  const columns: Column<LessonRevision>[] = [
    { key: 'at', header: 'Saved', cell: (row) => <span className="whitespace-nowrap">{formatDateTime(row.createdAt)}</span> },
    { key: 'editor', header: 'By', cell: (row) => row.editor },
    { key: 'note', header: 'Why', cell: (row) => <span className="text-ink-muted">{row.note || '—'}</span> },
    {
      key: 'blocks',
      header: 'Blocks',
      align: 'right',
      cell: (row) => <span className="tnum">{row.blockCount}</span>
    },
    {
      key: 'view',
      header: '',
      align: 'right',
      cell: (row) => (
        <Button size="sm" variant="secondary" onClick={() => setViewing(row.id)}>
          View
        </Button>
      )
    }
  ];

  return (
    <section className="space-y-2">
      <header className="flex items-center gap-2">
        <History size={15} className="text-ink-muted" aria-hidden />
        <h4 className="eyebrow text-caption font-semibold text-ink-secondary">Versions kept before each save</h4>
      </header>
      <QueryBoundary
        state={list}
        onRetry={() => void list.refetch()}
        isEmpty={(list.data?.revisions.length ?? 0) === 0}
        empty={<Card variant="sunken" className="text-caption text-ink-muted">Nothing has been replaced yet. The next edit to this lesson keeps what it overwrote.</Card>}
      >
        <DataTable rows={list.data?.revisions ?? []} columns={columns} rowKey={(row) => row.id} dense />
      </QueryBoundary>

      {viewing !== null && <RevisionDetail slug={slug} id={viewing} onClose={() => setViewing(null)} />}
    </section>
  );
}

function RevisionDetail({ slug, id, onClose }: { slug: string; id: number; onClose: () => void }) {
  const detail = useQuery({
    queryKey: keys.adminRevision(slug, id),
    queryFn: () => api.get<LessonRevisionDetail>(`/admin/content/lesson/${encodeURIComponent(slug)}/revisions/${id}`)
  });

  return (
    <Modal open onOpenChange={(open) => !open && onClose()} size="lg" title={`Version ${id}`} description={detail.data ? `${detail.data.lesson.title} as it stood ${formatDateTime(detail.data.createdAt)}` : undefined}>
      {detail.isLoading && <p className="text-caption text-ink-muted">Loading…</p>}
      {detail.error && <p className="text-caption text-danger">This version could not be read.</p>}
      {detail.data && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-caption text-ink-secondary">
            <Chip tone="neutral">{detail.data.lesson.status}</Chip>
            <span>{detail.data.lesson.estimatedMinutes} min</span>
            <span className="text-ink-muted">·</span>
            <span>edited by {detail.data.editor}</span>
          </div>
          {detail.data.lesson.summary && <p className="text-caption text-ink-secondary">{detail.data.lesson.summary}</p>}
          <ol className="space-y-2">
            {detail.data.blocks.map((block, index) => (
              <li key={index} className="rounded-card border border-line bg-sunken/60 p-3">
                <p className="eyebrow mb-1 text-caption text-ink-muted">
                  {index + 1}. {block.type}
                </p>
                <p className="whitespace-pre-wrap text-caption text-ink-secondary">{block.text}</p>
              </li>
            ))}
          </ol>
          <div className="flex justify-end">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
