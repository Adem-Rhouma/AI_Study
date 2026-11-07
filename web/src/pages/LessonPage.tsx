import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Clock,
  ListTree,
  NotebookPen,
  Trash2,
  Undo2
} from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { LessonReader, NoteItem, ReadingPosition } from '../api/types';
import { useSession } from '../lib/session';
import { formatMinutes, formatRelative, percent } from '../lib/format';
import { cn } from '../lib/cn';
import { PageHeader } from '../components/layout/PageHeader';
import { StudyAssistant } from '../components/assistant/StudyAssistant';
import { BlockRenderer } from '../components/content/BlockRenderer';
import { Card, SectionHeader } from '../components/ui/Surface';
import { EmptyState, ErrorState, InlineAlert, SkeletonRows } from '../components/ui/Feedback';
import { Button, LinkButton } from '../components/ui/Button';
import { Chip } from '../components/ui/Chip';
import { ProgressBar } from '../components/ui/Progress';
import { Textarea } from '../components/ui/Field';
import { useToast } from '../components/ui/Toast';

const SAVE_INTERVAL_MS = 12_000;

export default function LessonPage() {
  const { slug = '' } = useParams();
  const query = useQuery({
    queryKey: keys.lesson(slug),
    queryFn: () => api.get<LessonReader>(`/learning/lessons/${slug}`),
    enabled: slug !== ''
  });

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Loading lesson…" />
        <SkeletonRows rows={8} />
      </>
    );
  }
  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="This lesson could not be loaded" />;
  }
  if (!query.data) return null;
  return <Reader key={slug} data={query.data.lesson} />;
}

function Reader({ data }: { data: LessonReader['lesson'] }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const toast = useToast();
  const signedIn = session.user !== null;

  const articleRef = useRef<HTMLDivElement>(null);
  const blockRefs = useRef(new Map<number, HTMLElement>());
  const [blockIndex, setBlockIndex] = useState(data.lastBlockIndex);
  const [maxScroll, setMaxScroll] = useState(data.maxScroll);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showResume, setShowResume] = useState(!data.completion && data.lastBlockIndex > 0);
  const visibleSeconds = useRef(0);
  const completed = data.completion !== null;

  const headings = useMemo(
    () =>
      data.blocks
        .filter((block) => block.type === 'heading' && block.text.trim() !== '')
        .map((block) => ({ index: block.index, text: block.text, level: Number(block.payload.level ?? 2) })),
    [data.blocks]
  );

  /* ---------------------------------------------------------- position tracking */

  useEffect(() => {
    if (!signedIn) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const doc = document.documentElement;
      const scrollable = doc.scrollHeight - window.innerHeight;
      const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 1;
      setMaxScroll((previous) => (Math.abs(previous - ratio) > 0.005 ? ratio : previous));

      let furthest = 0;
      for (const [index, element] of blockRefs.current) {
        if (element.getBoundingClientRect().top <= window.innerHeight * 0.75) furthest = Math.max(furthest, index);
      }
      setBlockIndex((previous) => (previous === furthest ? previous : furthest));
    };
    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    measure();
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [signedIn]);

  useEffect(() => {
    if (!signedIn) return;
    let timer = 0;
    const tick = () => {
      if (document.visibilityState === 'visible') visibleSeconds.current += 5;
    };
    timer = window.setInterval(tick, 5_000);
    return () => window.clearInterval(timer);
  }, [signedIn]);

  const savePosition = useCallback(
    async (flush = false) => {
      if (!signedIn) return;
      const seconds = visibleSeconds.current;
      visibleSeconds.current = 0;
      try {
        const result = await api.patch<ReadingPosition>(`/learning/lessons/${data.slug}/position`, {
          blockIndex,
          maxScroll,
          durationSeconds: seconds
        });
        setSavedAt(result.updatedAt);
        if (flush) void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      } catch {
        visibleSeconds.current += seconds;
      }
    },
    [blockIndex, data.slug, maxScroll, queryClient, signedIn]
  );

  useEffect(() => {
    if (!signedIn) return;
    const timer = window.setInterval(() => void savePosition(), SAVE_INTERVAL_MS);
    const onHide = () => void savePosition(true);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
      void savePosition(true);
    };
  }, [savePosition, signedIn]);

  /* --------------------------------------------------------------- course resume */

  useEffect(() => {
    if (!signedIn) return;
    const id = window.setTimeout(() => {
      void api.post(`/courses/${data.course.slug}/resume`, { lessonSlug: data.slug }).catch(() => undefined);
    }, 2_000);
    return () => window.clearTimeout(id);
  }, [data.course.slug, data.slug, signedIn]);

  /* ------------------------------------------------------------------ mutations */

  const complete = useMutation({
    mutationFn: () => api.post(`/learning/lessons/${data.slug}/complete`, { durationSeconds: visibleSeconds.current }),
    onSuccess: () => {
      setShowResume(false);
      void queryClient.invalidateQueries({ queryKey: keys.lesson(data.slug) });
      void queryClient.invalidateQueries({ queryKey: keys.course(data.course.slug) });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: keys.progressAll });
      toast.success('Lesson marked complete. Topic mastery estimates were recomputed.');
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not save completion')
  });

  const withdraw = useMutation({
    mutationFn: () => api.del(`/learning/lessons/${data.slug}/complete`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.lesson(data.slug) });
      void queryClient.invalidateQueries({ queryKey: keys.course(data.course.slug) });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
      void queryClient.invalidateQueries({ queryKey: keys.progressAll });
      toast.info('Completion withdrawn.');
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not withdraw completion')
  });

  const bookmark = useMutation({
    mutationFn: async () => {
      const path = `/notes/bookmarks/lesson/${data.slug}`;
      return data.bookmarked ? api.del(path) : api.post(path);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.lesson(data.slug) });
      void queryClient.invalidateQueries({ queryKey: keys.bookmarks });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not change the bookmark')
  });

  /* ----------------------------------------------------------------------- notes */

  const notesQuery = useQuery({
    queryKey: keys.notes({ kind: 'lesson', slug: data.slug }),
    queryFn: () => api.get<{ notes: NoteItem[] }>('/notes', { kind: 'lesson', slug: data.slug }),
    enabled: signedIn
  });
  const [draft, setDraft] = useState('');
  const createNote = useMutation({
    mutationFn: () => api.post('/notes', { kind: 'lesson', slug: data.slug, body: draft.trim() }),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: keys.notes({ kind: 'lesson', slug: data.slug }) });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not save the note')
  });
  const deleteNote = useMutation({
    mutationFn: (id: number) => api.del(`/notes/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: keys.notes({ kind: 'lesson', slug: data.slug }) }),
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not delete the note')
  });

  const scrollTo = (index: number) => {
    const element = blockRefs.current.get(index);
    if (!element) return;
    const top = element.getBoundingClientRect().top + window.scrollY - 96;
    window.scrollTo({ top, behavior: 'smooth' });
    setShowResume(false);
  };

  return (
    <>
      <PageHeader
        crumbs={[
          { label: 'Courses', to: '/courses' },
          { label: data.course.title, to: `/courses/${data.course.slug}` },
          ...(data.module ? [{ label: data.module.title }] : []),
          { label: data.title }
        ]}
        eyebrow={data.module ? `${data.course.title} · ${data.module.title}` : data.course.title}
        title={data.title}
        description={data.summary}
        actions={
          signedIn ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => bookmark.mutate()}
                disabled={bookmark.isPending}
                aria-pressed={data.bookmarked}
              >
                <Bookmark size={15} aria-hidden className={data.bookmarked ? 'fill-current text-accent' : undefined} />
                {data.bookmarked ? 'Bookmarked' : 'Bookmark'}
              </Button>
              {completed ? (
                <Button variant="secondary" size="sm" onClick={() => withdraw.mutate()} disabled={withdraw.isPending}>
                  <Undo2 size={15} aria-hidden /> Withdraw completion
                </Button>
              ) : (
                <Button variant="primary" size="sm" onClick={() => complete.mutate()} disabled={complete.isPending}>
                  <CheckCircle2 size={15} aria-hidden />
                  {complete.isPending ? 'Saving…' : 'Mark complete'}
                </Button>
              )}
            </>
          ) : (
            <LinkButton to="/login" variant="secondary" size="sm" state={{ from: `/lessons/${data.slug}` }}>
              Sign in to save progress
            </LinkButton>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <Chip icon={<Clock size={12} aria-hidden />}>{formatMinutes(data.estMinutes)}</Chip>
          <Chip>{data.blockCount} blocks</Chip>
          {data.topics.map((topic) => (
            <Link key={topic.slug} to={`/explore/${topic.slug}`}>
              <Chip tone="accent">{topic.name}</Chip>
            </Link>
          ))}
          {completed && (
            <Chip tone="success" icon={<CheckCircle2 size={12} aria-hidden />}>
              Completed {formatRelative(data.completion?.completedAt)}
            </Chip>
          )}
        </div>
      </PageHeader>

      {signedIn && (
        <div className="mb-5 space-y-2">
          <ProgressBar value={maxScroll} label="Reading progress" />
          <p className="tnum flex items-center justify-between text-caption text-ink-muted">
            <span>{percent(maxScroll)} read · block {blockIndex + 1} of {data.blockCount}</span>
            <span>{savedAt ? `Position saved ${formatRelative(savedAt)}` : 'Position not saved yet'}</span>
          </p>
        </div>
      )}

      {showResume && (
        <InlineAlert
          className="mb-5"
          tone="info"
          title="You left off partway through"
          action={
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => scrollTo(data.lastBlockIndex)}>
                Jump to my place
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowResume(false)}>
                Start over
              </Button>
            </div>
          }
        >
          Your last recorded position was block {data.lastBlockIndex + 1}. Marking a lesson complete is always a
          separate, explicit action — reading alone never counts as mastery.
        </InlineAlert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_17rem]">
        <div className="min-w-0">
          <article ref={articleRef} className="prose">
            {data.blocks.map((block) => (
              <div
                key={block.index}
                id={`block-${block.index}`}
                ref={(element) => {
                  if (element) blockRefs.current.set(block.index, element);
                  else blockRefs.current.delete(block.index);
                }}
                className="scroll-mt-24"
              >
                <BlockRenderer block={block} storageKey={`lesson:${data.slug}`} />
              </div>
            ))}
          </article>

          {data.references.length > 0 && (
            <section aria-labelledby="lesson-references" className="mt-10">
              <h2 id="lesson-references" className="text-h3 font-semibold text-ink">
                References
              </h2>
              <ol className="mt-3 space-y-2">
                {data.references.map((reference, index) => (
                  <li key={index} className="font-sans text-caption">
                    <span className="tnum mr-2 text-ink-muted">[{reference.position || index + 1}]</span>
                    {reference.url ? (
                      <a
                        href={reference.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-ink underline decoration-dotted hover:text-accent-hover"
                      >
                        {reference.title}
                      </a>
                    ) : (
                      <span className="font-medium text-ink">{reference.title}</span>
                    )}
                    <span className="text-ink-muted">
                      {' '}
                      {[reference.authors, reference.year ? String(reference.year) : null, reference.type]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {reference.note && <span className="block text-ink-secondary">{reference.note}</span>}
                  </li>
                ))}
              </ol>
              <p className="mt-3 text-caption text-ink-muted">
                References are recorded with the lesson. Entries that could not be verified against a primary source
                were removed rather than approximated.
              </p>
            </section>
          )}

          <nav aria-label="Lesson navigation" className="mt-10 grid gap-3 border-t border-[var(--border-subtle)] pt-6 sm:grid-cols-2">
            {data.prev ? (
              <LinkButton to={`/lessons/${data.prev.slug}`} variant="secondary" className="justify-start">
                <ArrowLeft size={15} aria-hidden />
                <span className="min-w-0 text-left">
                  <span className="block text-caption text-ink-muted">Previous</span>
                  <span className="block truncate">{data.prev.title}</span>
                </span>
              </LinkButton>
            ) : (
              <LinkButton to={`/courses/${data.course.slug}`} variant="ghost" className="justify-start">
                <ArrowLeft size={15} aria-hidden /> Course overview
              </LinkButton>
            )}
            {data.next ? (
              <LinkButton to={`/lessons/${data.next.slug}`} className="justify-end sm:col-start-2">
                <span className="min-w-0 text-right">
                  <span className="block text-caption opacity-80">Next</span>
                  <span className="block truncate">{data.next.title}</span>
                </span>
                <ArrowRight size={15} aria-hidden />
              </LinkButton>
            ) : (
              <Button
                variant="primary"
                className="justify-end sm:col-start-2"
                onClick={() => navigate(`/courses/${data.course.slug}`)}
              >
                Back to the course <ChevronRight size={15} aria-hidden />
              </Button>
            )}
          </nav>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-[calc(var(--topbar-height)+1rem)] lg:self-start">
          <Card>
            <SectionHeader eyebrow="Contents" title="On this page" actions={<ListTree size={15} aria-hidden />} />
            {headings.length === 0 ? (
              <p className="mt-3 text-caption text-ink-muted">This lesson has no section headings.</p>
            ) : (
              <ol className="mt-3 space-y-1">
                {headings.map((heading) => (
                  <li key={heading.index} style={{ paddingLeft: Math.max(0, (heading.level - 2) * 10) }}>
                    <button
                      type="button"
                      onClick={() => scrollTo(heading.index)}
                      className="w-full cursor-pointer truncate rounded-input px-1.5 py-1 text-left font-sans text-caption text-ink-secondary transition-colors hover:bg-sunken hover:text-accent-hover"
                    >
                      {heading.text}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          {signedIn && (
            <Card>
              <SectionHeader eyebrow="Notes" title="Your notes" actions={<NotebookPen size={15} aria-hidden />} />
              <form
                className="mt-3 space-y-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (draft.trim() !== '') createNote.mutate();
                }}
              >
                <Textarea
                  aria-label="New note"
                  rows={3}
                  value={draft}
                  placeholder="Write a note about this lesson…"
                  onChange={(event) => setDraft(event.target.value)}
                />
                <Button type="submit" size="sm" disabled={draft.trim() === '' || createNote.isPending}>
                  {createNote.isPending ? 'Saving…' : 'Add note'}
                </Button>
              </form>

              {notesQuery.isLoading ? (
                <p className="mt-3 text-caption text-ink-muted">Loading notes…</p>
              ) : notesQuery.error ? (
                <ErrorState error={notesQuery.error} onRetry={() => void notesQuery.refetch()} />
              ) : (notesQuery.data?.notes.length ?? 0) === 0 ? (
                <p className="mt-3 text-caption text-ink-muted">No notes on this lesson yet.</p>
              ) : (
                <ul className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
                  {notesQuery.data?.notes.map((note) => (
                    <li key={note.id} className="group">
                      <p className="whitespace-pre-wrap font-sans text-caption text-ink-secondary">{note.body}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="text-caption text-ink-muted">{formatRelative(note.updatedAt)}</span>
                        <button
                          type="button"
                          onClick={() => deleteNote.mutate(note.id)}
                          aria-label="Delete note"
                          className={cn(
                            'cursor-pointer rounded-input p-1 text-ink-muted opacity-0 transition-opacity',
                            'group-hover:opacity-100 focus-visible:opacity-100 hover:text-danger'
                          )}
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {signedIn && <StudyAssistant context={{ kind: 'lesson', slug: data.slug }} entryTitle={data.title} />}

          {data.topics.length > 0 && (
            <Card>
              <SectionHeader eyebrow="Curriculum" title="Topics covered" />
              <ul className="mt-3 space-y-1.5">
                {data.topics.map((topic) => (
                  <li key={topic.slug}>
                    <Link to={`/explore/${topic.slug}`} className="font-sans text-caption text-ink hover:text-accent-hover">
                      {topic.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {data.staffEditable && (
            <InlineAlert tone="warning" title="Staff preview">
              Your role can see unpublished lessons and exercises. Learners only see published content.
            </InlineAlert>
          )}
        </aside>
      </div>

      {!completed && (
        <Card className="mt-8 flex flex-wrap items-center justify-between gap-3" variant="sunken">
          <div className="min-w-0">
            <h2 className="text-h4 font-semibold text-ink">Finished reading?</h2>
            <p className="mt-1 text-caption text-ink-secondary">
              Completion is recorded only when you ask for it, and it feeds coverage — not performance — in the mastery
              model. Exercises still need to be attempted in the Problem Arena.
            </p>
          </div>
          {signedIn ? (
            <Button variant="primary" onClick={() => complete.mutate()} disabled={complete.isPending}>
              <CheckCircle2 size={15} aria-hidden /> Mark lesson complete
            </Button>
          ) : (
            <EmptyState
              title="Sign in to record completion"
              action={<LinkButton to="/login" state={{ from: `/lessons/${data.slug}` }}>Sign in</LinkButton>}
            />
          )}
        </Card>
      )}
    </>
  );
}
