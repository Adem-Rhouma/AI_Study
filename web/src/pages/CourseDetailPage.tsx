import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, BookOpen, CheckCircle2, Clock, Target, Users } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { CourseDetail } from '../api/types';
import { useSession } from '../lib/session';
import { DIFFICULTY_LABEL, formatHours, formatMinutes, percent } from '../lib/format';
import { cn } from '../lib/cn';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Divider, SectionHeader } from '../components/ui/Surface';
import { ErrorState, InlineAlert, SkeletonRows } from '../components/ui/Feedback';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { Button, LinkButton } from '../components/ui/Button';
import { ProgressBar } from '../components/ui/Progress';
import { useToast } from '../components/ui/Toast';

export default function CourseDetailPage() {
  const { slug = '' } = useParams();
  const queryClient = useQueryClient();
  const { session } = useSession();
  const toast = useToast();
  const [tab, setTab] = useState<'outline' | 'about'>('outline');

  const query = useQuery({
    queryKey: keys.course(slug),
    queryFn: () => api.get<CourseDetail>(`/courses/${slug}`),
    enabled: slug !== ''
  });

  const enroll = useMutation({
    mutationFn: () => api.post<{ enrolled: boolean }>(`/courses/${slug}/enroll`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.course(slug) });
      void queryClient.invalidateQueries({ queryKey: keys.courses() });
      toast.success('Enrolled. Your progress on this course is now tracked.');
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not enrol')
  });

  const unenroll = useMutation({
    mutationFn: () => api.del<{ enrolled: boolean }>(`/courses/${slug}/enroll`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.course(slug) });
      void queryClient.invalidateQueries({ queryKey: keys.courses() });
      toast.info('Removed this course from your list.');
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Could not unenrol')
  });

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Loading course…" />
        <SkeletonRows rows={8} />
      </>
    );
  }
  if (query.error) {
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} title="This course could not be loaded" />;
  }
  const data = query.data;
  if (!data) return null;

  const { course, modules, totals, topics, enrollment } = data;
  const progress = totals.lessons > 0 ? totals.completed / totals.lessons : 0;
  const firstLesson = modules.flatMap((module) => module.lessons)[0];
  const nextLesson = modules.flatMap((module) => module.lessons).find((lesson) => !lesson.completed);

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'Courses', to: '/courses' }, { label: course.title }]}
        eyebrow={course.isFeatured ? 'Featured course' : 'Course'}
        title={course.title}
        description={course.summary}
        actions={
          session.user ? (
            enrollment ? (
              <Button
                variant="secondary"
                onClick={() => unenroll.mutate()}
                disabled={unenroll.isPending}
              >
                {unenroll.isPending ? 'Removing…' : 'Leave course'}
              </Button>
            ) : (
              <Button variant="primary" onClick={() => enroll.mutate()} disabled={enroll.isPending}>
                {enroll.isPending ? 'Enrolling…' : 'Enrol'}
              </Button>
            )
          ) : (
            <LinkButton to="/login" variant="primary" state={{ from: `/courses/${course.slug}` }}>
              Sign in to enrol
            </LinkButton>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          <DifficultyChip difficulty={course.difficulty} />
          <Chip icon={<Clock size={12} aria-hidden />}>{formatHours(course.estHours)}</Chip>
          <Chip icon={<BookOpen size={12} aria-hidden />}>{totals.lessons} lessons</Chip>
          <Chip icon={<Users size={12} aria-hidden />}>{course.audience}</Chip>
          <Chip>{course.author}</Chip>
        </div>
      </PageHeader>

      {enrollment && (
        <Card className="mb-5" variant="sunken">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-sans text-small-title font-semibold text-ink">
                {enrollment.completedAt ? 'Course completed' : `${totals.completed} of ${totals.lessons} lessons done`}
              </p>
              <p className="mt-0.5 text-caption text-ink-muted">
                {enrollment.completedAt
                  ? `Completed ${enrollment.completedAt}`
                  : course.completionCriteria || 'Complete every published lesson to finish this course.'}
              </p>
            </div>
            {nextLesson && (
              <LinkButton to={`/lessons/${nextLesson.slug}`}>
                {totals.completed === 0 ? 'Start first lesson' : 'Continue'} <ArrowRight size={14} aria-hidden />
              </LinkButton>
            )}
          </div>
          <ProgressBar className="mt-3" value={progress} label={`${course.title} completion`} />
          <p className="tnum mt-1 text-caption text-ink-muted">{percent(progress)} complete</p>
        </Card>
      )}

      <div className="mb-5 flex gap-1 border-b border-[var(--border-subtle)]" role="tablist" aria-label="Course sections">
        {(['outline', 'about'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            onClick={() => setTab(value)}
            className={cn(
              '-mb-px cursor-pointer border-b-2 px-3 py-2 font-sans text-caption font-medium capitalize transition-colors',
              tab === value
                ? 'border-accent text-accent-hover'
                : 'border-transparent text-ink-muted hover:text-ink-secondary'
            )}
          >
            {value === 'outline' ? `Outline (${totals.lessons})` : 'About this course'}
          </button>
        ))}
      </div>

      {tab === 'outline' ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
          <div className="min-w-0 space-y-4">
            {modules.length === 0 && (
              <InlineAlert tone="warning" title="No published lessons yet">
                This course exists in the catalogue but its lessons are still being written.
              </InlineAlert>
            )}
            {modules.map((module, index) => (
              <Card key={module.id ?? `unmoduled-${index}`}>
                <SectionHeader
                  eyebrow={`Module ${index + 1}`}
                  title={module.title}
                  description={module.summary || undefined}
                  actions={
                    <span className="tnum text-caption text-ink-muted">
                      {module.lessons.filter((lesson) => lesson.completed).length}/{module.lessons.length}
                    </span>
                  }
                />
                <ol className="mt-3 divide-y divide-[var(--border-subtle)]">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.slug}>
                      <Link
                        to={`/lessons/${lesson.slug}`}
                        className="flex items-start gap-3 px-1 py-2.5 transition-colors hover:bg-sunken"
                      >
                        <span className="mt-0.5 shrink-0">
                          {lesson.completed ? (
                            <CheckCircle2 size={16} className="text-success" aria-label="Completed" />
                          ) : lesson.maxScroll > 0 ? (
                            <span
                              className="grid size-4 place-items-center rounded-pill border border-accent text-[9px] font-semibold text-accent-hover"
                              aria-label="In progress"
                            >
                              {Math.round(lesson.maxScroll * 100)}
                            </span>
                          ) : (
                            <span className="grid size-4 place-items-center rounded-pill border border-line text-[9px] text-ink-muted">
                              {lesson.orderIndex + 1}
                            </span>
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-sans text-body font-medium text-ink">{lesson.title}</span>
                          {lesson.summary && (
                            <span className="mt-0.5 block text-caption text-ink-secondary">{lesson.summary}</span>
                          )}
                          <span className="tnum mt-1 block text-caption text-ink-muted">
                            {formatMinutes(lesson.estMinutes)} · {lesson.blockCount} blocks
                            {lesson.status !== 'published' && ` · ${lesson.status}`}
                          </span>
                        </span>
                        <ArrowRight size={15} className="mt-1 shrink-0 text-ink-muted" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ol>
              </Card>
            ))}
            {firstLesson && !enrollment && (
              <Card variant="sunken" className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-caption text-ink-secondary">
                  You can read any lesson without enrolling. Enrolling records your progress and unlocks the resume
                  pointer.
                </p>
                <LinkButton to={`/lessons/${firstLesson.slug}`} variant="secondary">
                  Read the first lesson
                </LinkButton>
              </Card>
            )}
          </div>

          <aside className="space-y-4 lg:sticky lg:top-[calc(var(--topbar-height)+1rem)] lg:self-start">
            <Card>
              <SectionHeader eyebrow="Covers" title="Topics" />
              {topics.length === 0 ? (
                <p className="mt-3 text-caption text-ink-muted">No curriculum topics are linked to this course yet.</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
                  {topics.map((topic) => (
                    <li key={topic.slug} className="flex items-baseline justify-between gap-2">
                      <Link
                        to={`/explore/${topic.slug}`}
                        className="min-w-0 truncate font-sans text-caption text-ink hover:text-accent-hover"
                      >
                        {topic.name}
                      </Link>
                      <span className="tnum shrink-0 text-caption text-ink-muted">
                        {formatMinutes(topic.estMinutes)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <SectionHeader eyebrow="At a glance" title="Course facts" />
              <dl className="mt-3 space-y-2 text-caption">
                <Fact label="Difficulty" value={DIFFICULTY_LABEL[course.difficulty]} />
                <Fact label="Estimated time" value={formatHours(course.estHours)} />
                <Fact label="Author" value={course.author} />
                <Fact label="Audience" value={course.audience} />
                <Fact label="Status" value={course.status} />
              </dl>
            </Card>
          </aside>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <SectionHeader eyebrow="Outcomes" title="What you will be able to do" />
            {course.objectives.length === 0 ? (
              <p className="mt-3 text-caption text-ink-muted">Objectives are not recorded for this course yet.</p>
            ) : (
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-body text-ink-secondary">
                {course.objectives.map((objective) => (
                  <li key={objective}>{objective}</li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <SectionHeader eyebrow="Before you start" title="Prerequisites" />
            <p className="mt-3 text-body text-ink-secondary">
              {course.prerequisitesNote || 'No prerequisites are recorded — assume only the course’s stated audience.'}
            </p>
            <Divider className="my-4" />
            <SectionHeader eyebrow="Finish line" title="Completion criteria" />
            <p className="mt-3 text-body text-ink-secondary">
              {course.completionCriteria || 'Every published lesson marked complete.'}
            </p>
          </Card>

          <Card className="md:col-span-2" variant="sunken">
            <div className="flex items-start gap-3">
              <Target size={18} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <div>
                <h2 className="text-h4 font-semibold text-ink">How mastery works here</h2>
                <p className="mt-1 text-body text-ink-secondary">
                  Opening a lesson never counts as mastering its topics. Topic mastery is estimated from coverage,
                  graded exercise performance and how recently you practised, and every score can be expanded to show
                  which signals produced it.
                </p>
                <LinkButton to="/progress" variant="ghost" size="sm" className="mt-2">
                  See your mastery breakdown
                </LinkButton>
              </div>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium capitalize text-ink">{value}</dd>
    </div>
  );
}
