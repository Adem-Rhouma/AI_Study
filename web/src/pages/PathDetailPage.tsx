import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  Compass,
  Layers,
  Pause,
  Play,
  Target
} from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { PathDetail } from '../api/types';
import { useSession } from '../lib/session';
import { DIFFICULTY_LABEL, formatDate, formatHours, formatMinutes, percent } from '../lib/format';
import { cn } from '../lib/cn';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Divider, SectionHeader } from '../components/ui/Surface';
import { ErrorState, InlineAlert, SkeletonRows } from '../components/ui/Feedback';
import { Chip, DifficultyChip, MasteryChip } from '../components/ui/Chip';
import { Button, LinkButton } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/Progress';
import { Markdown } from '../components/content/Markdown';
import { useToast } from '../components/ui/Toast';

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  abandoned: 'Abandoned'
};

export default function PathDetailPage() {
  const { slug = '' } = useParams();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<'stages' | 'about'>('stages');
  const [goalDate, setGoalDate] = useState('');

  const query = useQuery({
    queryKey: keys.path(slug),
    queryFn: () => api.get<PathDetail>(`/paths/${slug}`),
    enabled: slug !== ''
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.path(slug) });
    void queryClient.invalidateQueries({ queryKey: keys.myPaths });
    void queryClient.invalidateQueries({ queryKey: ['paths'] });
    void queryClient.invalidateQueries({ queryKey: keys.dashboard });
  };

  const enroll = useMutation({
    mutationFn: (goal: string | null) => api.post<{ enrolled: boolean }>(`/paths/${slug}/enroll`, { goalDate: goal }),
    onSuccess: () => {
      invalidate();
      toast.success('You are following this path. It now appears on your dashboard.');
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not follow this path')
  });

  const setStatus = useMutation({
    mutationFn: (status: 'active' | 'paused' | 'completed') =>
      api.patch<{ ok: boolean }>(`/paths/${slug}/enroll`, { status }),
    onSuccess: (_data, status) => {
      invalidate();
      toast.info(
        status === 'paused'
          ? 'Path paused. Your progress is kept.'
          : status === 'completed'
            ? 'Path marked complete.'
            : 'Path resumed.'
      );
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not update this path')
  });

  const saveGoal = useMutation({
    mutationFn: (goal: string | null) => api.patch<{ ok: boolean }>(`/paths/${slug}/enroll`, { goalDate: goal }),
    onSuccess: () => {
      invalidate();
      toast.success('Target date saved.');
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not save the target date')
  });

  const unenroll = useMutation({
    mutationFn: () => api.del<{ enrolled: boolean }>(`/paths/${slug}/enroll`),
    onSuccess: () => {
      invalidate();
      toast.info('Removed this path from your list. Topic mastery you have earned is kept.');
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not remove this path')
  });

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Loading path…" />
        <SkeletonRows rows={8} />
      </>
    );
  }
  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="This path could not be loaded" />;
  }
  const data = query.data;
  if (!data) return null;

  const { path, stages, prerequisites, progress, enrollment } = data;
  const signedIn = session.user !== null;
  const allItems = stages.flatMap((stage) => stage.items);
  const nextItem = allItems.find((item) => !item.done && !item.optional);
  const topicCount = allItems.filter((item) => item.kind === 'topic').length;
  const courseCount = allItems.filter((item) => item.kind === 'course').length;

  return (
    <>
      <nav aria-label="Breadcrumb" className="mb-3 flex items-center gap-1.5 text-caption text-ink-muted">
        <Link to="/paths" className="transition-colors hover:text-accent-hover">
          Learning Paths
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink-secondary">{path.name}</span>
      </nav>

      <PageHeader
        eyebrow={path.isFeatured ? 'Featured path' : 'Learning path'}
        title={path.name}
        description={path.summary}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <DifficultyChip difficulty={path.difficulty} />
            <Chip icon={<Clock size={12} aria-hidden />}>{formatHours(path.estHours)}</Chip>
            <Chip icon={<Layers size={12} aria-hidden />}>{topicCount} topics</Chip>
            <Chip icon={<BookOpen size={12} aria-hidden />}>{courseCount} courses</Chip>
          </div>
        }
      />

      {!signedIn && (
        <InlineAlert tone="info" className="mb-5">
          You are browsing without an account.{' '}
          <Link to="/register" className="font-medium underline">
            Create one
          </Link>{' '}
          to follow this path and have your mastery tracked across its topics.
        </InlineAlert>
      )}

      {signedIn && !enrollment && (
        <Card className="mb-5 flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-h4 font-semibold text-ink">Follow this path</h2>
            <p className="mt-1 text-caption text-ink-secondary">
              Following adds it to your dashboard and starts tracking progress. Optionally set a target date — it is a
              reminder for you, not a deadline the platform enforces.
            </p>
          </div>
          <label className="flex flex-col gap-1 text-caption text-ink-secondary">
            Target date
            <input
              type="date"
              value={goalDate}
              onChange={(event) => setGoalDate(event.target.value)}
              className="rounded-input border border-line bg-raised px-2.5 py-1.5 font-sans text-caption text-ink"
            />
          </label>
          <Button onClick={() => enroll.mutate(goalDate === '' ? null : goalDate)} disabled={enroll.isPending}>
            {enroll.isPending ? 'Following…' : 'Follow path'}
          </Button>
        </Card>
      )}

      {signedIn && enrollment && (
        <Card className="mb-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Target size={16} aria-hidden className="text-accent" />
              <h2 className="text-h4 font-semibold text-ink">Your progress</h2>
              <Chip tone={enrollment.status === 'paused' ? 'warning' : 'accent'}>
                {STATUS_LABEL[enrollment.status] ?? enrollment.status}
              </Chip>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {enrollment.status === 'paused' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={<Play size={14} aria-hidden />}
                  onClick={() => setStatus.mutate('active')}
                  disabled={setStatus.isPending}
                >
                  Resume
                </Button>
              ) : enrollment.status !== 'completed' ? (
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={<Pause size={14} aria-hidden />}
                  onClick={() => setStatus.mutate('paused')}
                  disabled={setStatus.isPending}
                >
                  Pause
                </Button>
              ) : null}
              {enrollment.status !== 'completed' && (
                <Button
                  size="sm"
                  variant="secondary"
                  iconLeft={<CheckCircle2 size={14} aria-hidden />}
                  onClick={() => setStatus.mutate('completed')}
                  disabled={setStatus.isPending}
                >
                  Mark complete
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => unenroll.mutate()} disabled={unenroll.isPending}>
                Remove
              </Button>
            </div>
          </div>

          {progress && (
            <>
              <ProgressBar value={progress.percent} label={`${path.name} progress`} />
              <dl className="grid gap-3 sm:grid-cols-3">
                <div>
                  <dt className="text-caption text-ink-muted">Topics at practising or above</dt>
                  <dd className="tnum text-h4 font-semibold text-ink">
                    {progress.topicsProficient}
                    <span className="text-caption font-normal text-ink-muted"> / {progress.topicsTotal}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Lessons completed on path topics</dt>
                  <dd className="tnum text-h4 font-semibold text-ink">
                    {progress.lessonsDone}
                    <span className="text-caption font-normal text-ink-muted"> / {progress.lessonsTotal}</span>
                  </dd>
                </div>
                <div>
                  <dt className="text-caption text-ink-muted">Overall</dt>
                  <dd className="tnum text-h4 font-semibold text-ink">{percent(progress.percent)}</dd>
                </div>
              </dl>
            </>
          )}

          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <label className="flex flex-col gap-1 text-caption text-ink-secondary">
              Target date
              <input
                type="date"
                value={enrollment.goalDate ?? ''}
                onChange={(event) => setGoalDate(event.target.value)}
                onBlur={() => {
                  const next = goalDate === '' ? null : goalDate;
                  if (next !== enrollment.goalDate) saveGoal.mutate(next);
                }}
                className="rounded-input border border-line bg-raised px-2.5 py-1.5 font-sans text-caption text-ink"
              />
            </label>
            {enrollment.goalDate && (
              <p className="text-caption text-ink-muted">Currently set to {formatDate(enrollment.goalDate)}</p>
            )}
            <p className="ml-auto text-caption text-ink-muted">Following since {formatDate(enrollment.startedAt)}</p>
          </div>
        </Card>
      )}

      {nextItem && (
        <Card variant="sunken" className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <span className="eyebrow text-caption">Next up</span>
            <p className="text-body font-medium text-ink">{nextItem.title}</p>
            <p className="text-caption text-ink-muted">
              {nextItem.kind === 'course' ? 'Course' : 'Topic'} · {formatMinutes(nextItem.estMinutes)}
            </p>
          </div>
          <LinkButton to={nextItem.kind === 'course' ? `/courses/${nextItem.slug}` : `/explore/${nextItem.slug}`}>
            Open <ArrowRight size={14} aria-hidden />
          </LinkButton>
        </Card>
      )}

      <div className="mb-6 flex gap-1 border-b border-line" role="tablist" aria-label="Path sections">
        {(['stages', 'about'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`path-tab-${value}`}
            aria-selected={tab === value}
            aria-controls={`path-panel-${value}`}
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px cursor-pointer border-b-2 border-transparent px-3 py-2 font-sans text-caption font-medium text-ink-secondary transition-colors hover:text-ink',
              tab === value && 'border-accent text-ink'
            )}
          >
            {value === 'stages' ? `Stages (${stages.length})` : 'About this path'}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`path-panel-${tab}`} aria-labelledby={`path-tab-${tab}`}>
        {tab === 'stages' ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-6">
              {prerequisites.length > 0 && (
                <Card variant="sunken">
                  <SectionHeader
                    eyebrow="Before you start"
                    title="Prerequisites outside this path"
                    description="These topics are strict prerequisites of topics inside the path but are not part of it. They are listed so you can decide whether to cover them first — the path does not block you."
                  />
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {prerequisites.map((item) => (
                      <li key={item.slug}>
                        <Link
                          to={`/explore/${item.slug}`}
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-raised px-2.5 py-1 text-caption text-ink-secondary transition-colors hover:border-[var(--border-strong)] hover:text-ink"
                        >
                          {item.name}
                          <span className="text-ink-muted">{DIFFICULTY_LABEL[item.difficulty]}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {stages.length === 0 ? (
                <Card>
                  <p className="text-body text-ink-secondary">
                    This path has no stages yet. Its outline is still being authored.
                  </p>
                </Card>
              ) : (
                stages.map((stage, index) => {
                  const done = stage.items.filter((item) => item.done).length;
                  return (
                    <section key={stage.id ?? `unordered-${index}`}>
                      <SectionHeader
                        eyebrow={`Stage ${index + 1}`}
                        title={stage.title}
                        description={stage.summary || undefined}
                        actions={
                          <Chip tone={done === stage.items.length && stage.items.length > 0 ? 'success' : 'neutral'}>
                            {done}/{stage.items.length} done
                          </Chip>
                        }
                      />
                      <ol className="mt-3 space-y-2">
                        {stage.items.map((item) => (
                          <li key={`${item.kind}:${item.slug}`}>
                            <Card as="article" padded className="flex items-start gap-3">
                              <span
                                aria-hidden
                                className={cn(
                                  'mt-0.5 grid size-6 shrink-0 place-items-center rounded-pill border text-caption font-semibold',
                                  item.done
                                    ? 'border-transparent bg-accent-soft text-accent-hover'
                                    : 'border-line bg-sunken text-ink-muted'
                                )}
                              >
                                {item.done ? <CheckCircle2 size={14} /> : index + 1}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Link
                                    to={item.kind === 'course' ? `/courses/${item.slug}` : `/explore/${item.slug}`}
                                    className="text-body font-medium text-ink transition-colors hover:text-accent-hover"
                                  >
                                    {item.title}
                                  </Link>
                                  <Chip tone="neutral">
                                    {item.kind === 'course' ? (
                                      <>
                                        <BookOpen size={11} aria-hidden /> Course
                                      </>
                                    ) : (
                                      <>
                                        <Compass size={11} aria-hidden /> Topic
                                      </>
                                    )}
                                  </Chip>
                                  {item.optional && <Chip tone="warning">Optional</Chip>}
                                  {item.level && <MasteryChip level={item.level} topicSlug={item.slug} />}
                                </div>
                                {item.summary && (
                                  <p className="mt-1 line-clamp-2 text-caption text-ink-secondary">{item.summary}</p>
                                )}
                                {item.note && <p className="mt-1 text-caption text-ink-muted">{item.note}</p>}
                                <p className="mt-1 text-caption text-ink-muted">
                                  About {formatMinutes(item.estMinutes)}
                                </p>
                              </div>
                              <LinkButton
                                to={item.kind === 'course' ? `/courses/${item.slug}` : `/explore/${item.slug}`}
                                size="sm"
                                variant="secondary"
                                className="shrink-0"
                              >
                                Open
                              </LinkButton>
                            </Card>
                          </li>
                        ))}
                      </ol>
                    </section>
                  );
                })
              )}

              <InlineAlert tone="info">
                Progress here reflects mastery, not exposure: a topic counts as done when your estimated mastery reaches
                practising or above, which requires exercise evidence rather than reading. Opening a lesson never moves
                this number on its own.
              </InlineAlert>
            </div>

            <aside className="space-y-4">
              <Card>
                <SectionHeader title="At a glance" />
                <Divider className="my-3" />
                <dl className="space-y-2 text-caption">
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Level</dt>
                    <dd className="text-ink">{DIFFICULTY_LABEL[path.difficulty]}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Estimated time</dt>
                    <dd className="tnum text-ink">{formatHours(path.estHours)}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Topics</dt>
                    <dd className="tnum text-ink">{topicCount}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Courses</dt>
                    <dd className="tnum text-ink">{courseCount}</dd>
                  </div>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-muted">Stages</dt>
                    <dd className="tnum text-ink">{stages.length}</dd>
                  </div>
                </dl>
                {path.audience && (
                  <>
                    <Divider className="my-3" />
                    <p className="text-caption text-ink-muted">
                      <span className="font-medium text-ink-secondary">Who it is for: </span>
                      {path.audience}
                    </p>
                  </>
                )}
              </Card>

              {path.completionCriteria && (
                <Card variant="sunken">
                  <SectionHeader title="Completion criteria" />
                  <p className="mt-2 text-caption text-ink-secondary">{path.completionCriteria}</p>
                </Card>
              )}
            </aside>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="space-y-5">
              {path.description ? (
                <Card>
                  <Markdown source={path.description} className="prose-block" />
                </Card>
              ) : (
                <Card>
                  <p className="text-body text-ink-secondary">No long description has been written for this path yet.</p>
                </Card>
              )}

              {path.objectives.length > 0 && (
                <Card>
                  <SectionHeader title="What you will be able to do" />
                  <ul className="mt-3 space-y-2">
                    {path.objectives.map((objective) => (
                      <li key={objective} className="flex gap-2 text-body text-ink-secondary">
                        <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                        {objective}
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {path.outcomeNote && (
                <Card variant="sunken">
                  <SectionHeader title="Where this leads" />
                  <p className="mt-2 text-body text-ink-secondary">{path.outcomeNote}</p>
                </Card>
              )}
            </div>

            <aside className="space-y-4">
              {path.prerequisitesNote && (
                <Card>
                  <SectionHeader title="Before you start" />
                  <p className="mt-2 text-caption text-ink-secondary">{path.prerequisitesNote}</p>
                </Card>
              )}
              <Card variant="sunken">
                <SectionHeader title="How paths work here" />
                <ul className="mt-2 space-y-2 text-caption text-ink-secondary">
                  <li>A path is an ordered suggestion, not a gate: every topic remains reachable on its own.</li>
                  <li>
                    Stages list the topics and courses in the order their prerequisites imply. Optional items deepen a
                    stage without blocking the next one.
                  </li>
                  <li>
                    Progress is computed from your mastery estimates and course completions, so it moves only when there
                    is evidence you can apply the material.
                  </li>
                </ul>
              </Card>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
