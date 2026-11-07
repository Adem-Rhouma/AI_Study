import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, ExternalLink, NotebookPen, Pencil, Trash2, X } from 'lucide-react';
import { api } from '../../api/client';
import { keys } from '../../api/keys';
import type { BookmarkList, NoteItem, NotePage, NoteTargetKind } from '../../api/types';
import { formatDate, formatRelative } from '../../lib/format';
import { Button, IconButton } from '../ui/Button';
import { Card } from '../ui/Surface';
import { Chip } from '../ui/Chip';
import { EmptyState, ErrorState, InlineAlert, SkeletonRows, errorMessage } from '../ui/Feedback';
import { Field, SearchInput, Select, Textarea } from '../ui/Field';
import { ConfirmDialog } from '../ui/Overlay';
import { Pagination } from '../ui/Pagination';
import { useToast } from '../ui/Toast';

const KIND_LABEL: Record<NoteTargetKind, string> = {
  lesson: 'Lesson',
  topic: 'Topic',
  resource: 'Resource',
  course: 'Course'
};

/** Where a note's or bookmark's target lives. `course` is note-only; bookmarks are the first three. */
export function targetRoute(kind: NoteTargetKind, slug: string): string {
  switch (kind) {
    case 'lesson':
      return `/lessons/${slug}`;
    case 'topic':
      return `/explore/${slug}`;
    case 'resource':
      return `/resources/${slug}`;
    default:
      return `/courses/${slug}`;
  }
}

const PER_PAGE = 10;

export function NotesPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [kind, setKind] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const params = { ...(kind ? { kind } : {}), ...(search ? { q: search } : {}), page, perPage: PER_PAGE };
  const notes = useQuery({
    queryKey: keys.notes(params),
    queryFn: () => api.get<NotePage>('/notes', params),
    placeholderData: (previous) => previous
  });

  const rows = notes.data?.notes ?? [];

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ['notes'] });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  };

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/notes/${id}`),
    onSuccess: invalidate,
    onError: (error) => toast.danger(errorMessage(error))
  });

  if (notes.isLoading) return <SkeletonRows rows={4} />;
  if (notes.error) return <ErrorState error={notes.error} onRetry={() => void notes.refetch()} />;

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          setSearch(searchInput.trim());
          setPage(1);
        }}
      >
        <SearchInput
          className="min-w-52 flex-1 sm:max-w-sm"
          ariaLabel="Search your notes"
          value={searchInput}
          placeholder="Search note text…"
          onValueChange={setSearchInput}
        />
        <label className="flex items-end gap-2">
          <span className="sr-only">Filter by kind</span>
          <Select
            aria-label="Filter notes by kind"
            value={kind}
            onChange={(event) => {
              setKind(event.target.value);
              setPage(1);
            }}
            className="w-44"
          >
            <option value="">All kinds</option>
            <option value="lesson">Lessons</option>
            <option value="topic">Topics</option>
            <option value="resource">Resources</option>
            <option value="course">Courses</option>
          </Select>
        </label>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {(search !== '' || kind !== '') && (
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setSearch('');
              setSearchInput('');
              setKind('');
              setPage(1);
            }}
          >
            Reset
          </Button>
        )}
      </form>

      {remove.isError && <InlineAlert tone="danger">{errorMessage(remove.error)}</InlineAlert>}

      {rows.length === 0 ? (
        <EmptyState
          icon={<NotebookPen size={18} aria-hidden />}
          title={search || kind ? 'No notes match that filter' : 'No notes yet'}
          description={
            search || kind
              ? 'Notes are saved per lesson, topic, resource or course. Widen the filter to see the rest.'
              : 'Open any lesson, topic or resource and write a note there — everything you save appears here, and only you can see it.'
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {rows.map((note) => (
              <li key={note.id}>
                <NoteCard
                  note={note}
                  onDelete={() => remove.mutate(note.id)}
                  deleting={remove.isPending && remove.variables === note.id}
                />
              </li>
            ))}
          </ul>
          <Pagination
            page={notes.data?.page ?? page}
            totalPages={notes.data?.totalPages ?? 1}
            total={notes.data?.total}
            perPage={notes.data?.perPage}
            onPageChange={setPage}
          />
        </>
      )}
    </div>
  );
}

function NoteCard({
  note,
  onDelete,
  deleting
}: {
  note: NoteItem;
  onDelete: () => void;
  deleting: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);
  const [confirming, setConfirming] = useState(false);

  const save = useMutation({
    mutationFn: () => api.patch(`/notes/${note.id}`, { body: draft.trim() }),
    onSuccess: () => {
      setEditing(false);
      void queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.info('Note updated.');
    },
    onError: (error) => toast.danger(errorMessage(error))
  });

  return (
    <Card as="article" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Chip tone="neutral">{KIND_LABEL[note.target.kind]}</Chip>
        <Link
          to={targetRoute(note.target.kind, note.target.slug)}
          className="min-w-0 flex-1 truncate text-caption font-medium text-ink transition-colors hover:text-accent-hover"
        >
          {note.target.title}
          <span className="ml-1 inline-flex items-center gap-1 text-ink-muted">
            <ExternalLink size={12} aria-hidden />
          </span>
        </Link>
        <span className="tnum shrink-0 text-caption text-ink-muted" title={`Created ${formatDate(note.createdAt)}`}>
          {formatRelative(note.updatedAt)}
        </span>
      </div>

      {note.quote !== '' && (
        <blockquote className="border-l-2 border-line pl-3 text-caption italic text-ink-muted">
          {note.quote}
        </blockquote>
      )}

      {editing ? (
        <div className="space-y-2">
          <Field label="Note" htmlFor={`note-${note.id}`}>
            <Textarea id={`note-${note.id}`} value={draft} rows={4} onChange={(event) => setDraft(event.target.value)} />
          </Field>
          {save.isError && <InlineAlert tone="danger">{errorMessage(save.error)}</InlineAlert>}
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={save.isPending}
              disabled={draft.trim() === ''}
              onClick={() => save.mutate()}
            >
              Save note
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDraft(note.body);
                setEditing(false);
              }}
            >
              <X size={14} aria-hidden /> Cancel
            </Button>
          </div>
        </div>
      ) : (
        <p className="whitespace-pre-wrap text-body leading-relaxed text-ink-secondary">{note.body}</p>
      )}

      {!editing && (
        <div className="flex gap-1">
          <IconButton
            label={`Edit note on ${note.target.title}`}
            size="sm"
            onClick={() => setEditing(true)}
          >
            <Pencil size={14} aria-hidden />
          </IconButton>
          <IconButton
            label={`Delete note on ${note.target.title}`}
            size="sm"
            tone="danger"
            disabled={deleting}
            onClick={() => setConfirming(true)}
          >
            <Trash2 size={14} aria-hidden />
          </IconButton>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Delete this note?"
        body={`The note attached to “${note.target.title}” will be removed from your account. This cannot be undone.`}
        confirmLabel="Delete note"
        busy={deleting}
        onConfirm={() => {
          setConfirming(false);
          onDelete();
        }}
      />
    </Card>
  );
}

export function BookmarksPanel() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const bookmarks = useQuery({
    queryKey: keys.bookmarks,
    queryFn: () => api.get<BookmarkList>('/notes/bookmarks')
  });

  const remove = useMutation({
    mutationFn: (item: { kind: string; slug: string }) => api.del(`/notes/bookmarks/${item.kind}/${item.slug}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.bookmarks });
      void queryClient.invalidateQueries({ queryKey: ['resources'] });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
    onError: (error) => toast.danger(errorMessage(error))
  });

  if (bookmarks.isLoading) return <SkeletonRows rows={3} />;
  if (bookmarks.error) return <ErrorState error={bookmarks.error} onRetry={() => void bookmarks.refetch()} />;

  const rows = bookmarks.data?.bookmarks ?? [];
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Bookmark size={18} aria-hidden />}
        title="Nothing bookmarked yet"
        description="Use the Bookmark button on any lesson, topic or resource to park it here for later."
      />
    );
  }

  return (
    <div className="space-y-4">
      {remove.isError && <InlineAlert tone="danger">{errorMessage(remove.error)}</InlineAlert>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {rows.map((item) => (
          <li key={`${item.kind}:${item.slug}`}>
            <Card as="article" variant="interactive" className="flex items-start gap-3">
              <span className="mt-0.5 shrink-0 text-accent">
                <Bookmark size={15} aria-hidden className="fill-current" />
              </span>
              <span className="min-w-0 flex-1">
                <Link
                  to={targetRoute(item.kind, item.slug)}
                  className="block truncate text-body font-medium text-ink transition-colors hover:text-accent-hover"
                >
                  {item.title}
                </Link>
                <span className="block text-caption text-ink-muted">
                  {KIND_LABEL[item.kind]} · saved {formatDate(item.created_at)}
                </span>
              </span>
              <IconButton
                label={`Remove bookmark from ${item.title}`}
                size="sm"
                tone="danger"
                disabled={remove.isPending}
                onClick={() => remove.mutate({ kind: item.kind, slug: item.slug })}
              >
                <X size={14} aria-hidden />
              </IconButton>
            </Card>
          </li>
        ))}
      </ul>
    </div>
  );
}
