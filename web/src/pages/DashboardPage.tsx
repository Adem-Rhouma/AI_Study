import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  BookMarked,
  CalendarClock,
  Compass,
  Flame,
  NotebookPen,
  Route as RouteIcon,
  Sparkles,
  Target
} from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { Dashboard, LearnerDashboard, MasteryLevel } from '../api/types';
import { useSession } from '../lib/session';
import { formatHours, formatMinutes, formatRelative, MASTERY_LABEL, MASTERY_ORDER, percent } from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, SectionHeader } from '../components/ui/Surface';
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/Feedback';
import { DifficultyChip } from '../components/ui/Chip';
import { ActivityHeatmap, ProgressBar, StatTile } from '../components/ui/Progress';
import { LinkButton } from '../components/ui/Button';

const CURATED_EVENTS_NOTE =
  'Events are curated by hand from official announcements, so dates can lag behind the organiser’s site. Always confirm on the official page before you travel or submit.';

export default function DashboardPage() {
  const query = useQuery({ queryKey: keys.dashboard, queryFn: () => api.get<Dashboard>('/dashboard') });

  if (query.isLoading) {
    return (
      <>
        <PageHeader title="Dashboard" />
        <SkeletonRows rows={6} />
      </>
    );
  }
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  return query.data.authenticated ? <LearnerView data={query.data} /> : <PublicView data={query.data} />;
}

function PublicView({ data }: { data: Extract<Dashboard, { authenticated: false }> }) {
  const stats = data.stats;
  const tiles: { label: string; value: number; to: string }[] = [
    { label: 'Topics mapped', value: stats.topics ?? 0, to: '/explore' },
    { label: 'Courses', value: stats.courses ?? 0, to: '/courses' },
    { label: 'Lessons', value: stats.lessons ?? 0, to: '/courses' },
    { label: 'Exercises', value: stats.exercises ?? 0, to: '/arena' }
  ];

  return (
    <>
      <PageHeader
        eyebrow="AI Mastery"
        title="Learn AI along the map, not along the hype cycle"
        description="A curriculum built from university syllabi, textbooks and the research literature, broken into lessons you can actually finish — with exercises that are graded and progress that is explained."
        actions={
          <>
            <LinkButton to="/register" variant="primary">
              Create an account
            </LinkButton>
            <LinkButton to="/explore" variant="secondary">
              Browse the map
            </LinkButton>
          </>
        }
      />

      <div className="mb-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <Link key={tile.label} to={tile.to} className="block">
            <StatTile label={tile.label} value={tile.value} className="h-full transition-shadow hover:shadow-2" />
          </Link>
        ))}
      </div>

      <section aria-labelledby="entry-points" className="mb-8">
        <SectionHeader
          eyebrow="Start here"
          title="Featured courses"
          description="Hand-built courses with real lesson content, worked derivations and graded exercises."
          actions={
            <LinkButton to="/courses" variant="ghost" size="sm">
              All courses <ArrowRight size={14} aria-hidden />
            </LinkButton>
          }
        />
        <div id="entry-points" className="mt-4 grid gap-4 md:grid-cols-2">
          {data.entryPoints.map((entry) => (
            <Card key={entry.slug} variant="interactive" className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-h4 font-semibold text-ink">
                  <Link to={`/courses/${entry.slug}`} className="transition-colors hover:text-accent-hover">
                    {entry.name}
                  </Link>
                </h3>
                <DifficultyChip difficulty={entry.difficulty} />
              </div>
              <p className="text-body text-ink-secondary">{entry.summary}</p>
              <div className="mt-auto flex items-center gap-3 pt-1 text-caption text-ink-muted">
                <span className="tnum">{formatHours(entry.estHours)} estimated</span>
                {entry.isFeatured && <span className="text-accent-hover">Featured</span>}
              </div>
            </Card>
          ))}
        </div>
        {data.entryPoints.length === 0 && (
          <EmptyState
            className="mt-4"
            title="No featured courses yet"
            description="The catalogue is still being populated. The topic map is browsable in the meantime."
            action={<LinkButton to="/explore">Explore AI</LinkButton>}
          />
        )}
      </section>

      <Card variant="sunken">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <h2 className="text-h4 font-semibold text-ink">Track progress across the whole map</h2>
            <p className="mt-1 text-caption text-ink-secondary">
              An account adds mastery estimates, reading positions, bookmarks, notes and learning-path progress.
            </p>
          </div>
          <div className="flex gap-2">
            <LinkButton to="/login" variant="secondary">
              Sign in
            </LinkButton>
            <LinkButton to="/register" variant="primary">
              Register
            </LinkButton>
          </div>
        </div>
      </Card>
    </>
  );
}

function LearnerView({ data }: { data: LearnerDashboard }) {
  const { session } = useSession();
  const firstName = session.user?.displayName?.split(' ')[0] ?? 'there';
  const { activity, masterySummary } = data;

  return (
    <>
      <PageHeader
        eyebrow="Dashboard"
        title={`Welcome back, ${firstName}`}
        description="Everything below is derived from your own reading positions, exercise attempts and completions."
        actions={
          <LinkButton to="/explore" variant="secondary" size="sm">
            <Compass size={15} aria-hidden /> Explore AI
          </LinkButton>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <ContinueLearning data={data} />
          <RecommendedTopics data={data} />
          <ActivePaths data={data} />
        </div>

        <div className="space-y-4">
          <Card>
            <SectionHeader title="This fortnight" eyebrow="Activity" />
            <div className="mt-3 grid grid-cols-2 gap-3">
              <StatTile
                label="Weekly minutes"
                value={activity.weeklyMinutes}
                hint={`${percent(Math.min(1, activity.weeklyGoalPercent / 100))} of your weekly target`}
              />
              <StatTile
                label="Streak"
                value={activity.currentStreakDays}
                hint={activity.currentStreakDays === 1 ? 'day in a row' : 'days in a row'}
                icon={<Flame size={14} aria-hidden />}
              />
              <StatTile label="Daily goal" value={`${activity.dailyGoalMinutes}m`} />
              <StatTile label="Total time" value={formatHours(activity.totalHours)} />
            </div>
            <ActivityHeatmap
              className="mt-4"
              cells={activity.last14Days.map((day) => ({ date: day.day, minutes: day.minutes }))}
            />
            <p className="mt-2 text-caption text-ink-muted">
              Minutes are recorded when you read a lesson or submit an exercise — never just from opening a page.
            </p>
          </Card>

          <MasteryPanel summary={masterySummary} />
          <UpcomingEvents data={data} />
          <RecentlySaved data={data} />
        </div>
      </div>
    </>
  );
}

function ContinueLearning({ data }: { data: LearnerDashboard }) {
  if (data.continueLearning.length === 0) {
    return (
      <Card>
        <SectionHeader eyebrow="Pick up" title="Continue learning" />
        <EmptyState
          className="mt-4"
          title="Nothing in progress"
          description="Open a lesson and your reading position will show up here next time."
          action={<LinkButton to="/courses">Browse courses</LinkButton>}
        />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        eyebrow="Pick up"
        title="Continue learning"
        description="Ordered by when you last read. Progress is your furthest scroll in the lesson."
        actions={
          <LinkButton to="/progress" variant="ghost" size="sm">
            All progress <ArrowRight size={14} aria-hidden />
          </LinkButton>
        }
      />
      <ul className="mt-4 space-y-3">
        {data.continueLearning.map((entry) => (
          <li key={entry.lessonSlug}>
            <Card as="div" variant="interactive" className="p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-sans text-small-title font-semibold text-ink">
                    <Link to={`/lessons/${entry.lessonSlug}`} className="transition-colors hover:text-accent-hover">
                      {entry.lessonTitle}
                    </Link>
                  </h3>
                  <p className="truncate text-caption text-ink-muted">
                    <Link to={`/courses/${entry.courseSlug}`} className="hover:text-ink-secondary">
                      {entry.courseTitle}
                    </Link>{' '}
                    · {formatMinutes(entry.estMinutes)} · updated {formatRelative(entry.updatedAt)}
                  </p>
                </div>
                <LinkButton to={`/lessons/${entry.lessonSlug}`} size="sm">
                  Resume <ArrowRight size={14} aria-hidden />
                </LinkButton>
              </div>
              <ProgressBar
                className="mt-3"
                value={entry.position.maxScroll}
                label={`${entry.lessonTitle} reading progress`}
              />
              <div className="mt-1.5 flex items-center justify-between text-caption text-ink-muted">
                <span className="tnum">{percent(entry.position.maxScroll)} read</span>
                {entry.nextLesson && (
                  <Link to={`/lessons/${entry.nextLesson.slug}`} className="hover:text-accent-hover">
                    Next: {entry.nextLesson.title}
                  </Link>
                )}
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecommendedTopics({ data }: { data: LearnerDashboard }) {
  if (data.recommendedTopics.length === 0) return null;
  return (
    <Card>
      <SectionHeader
        eyebrow="Suggested"
        title="Next topics to study"
        description="Chosen from the prerequisite graph: topics whose prerequisites you have already covered."
        actions={
          <LinkButton to="/explore" variant="ghost" size="sm">
            Open the map <ArrowRight size={14} aria-hidden />
          </LinkButton>
        }
      />
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {data.recommendedTopics.map((topic) => (
          <li key={topic.slug}>
            <Card as="div" variant="interactive" className="flex h-full flex-col gap-2 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-sans text-small-title font-semibold text-ink">
                  <Link to={`/explore/${topic.slug}`} className="transition-colors hover:text-accent-hover">
                    {topic.name}
                  </Link>
                </h3>
                <DifficultyChip difficulty={topic.difficulty} />
              </div>
              <p className="text-caption text-ink-muted">
                {topic.domain} · {topic.subdomain} · {formatMinutes(topic.estMinutes)}
              </p>
              <ul className="mt-auto space-y-1 pt-1">
                {topic.reasons.map((reason) => (
                  <li key={reason} className="flex items-start gap-1.5 text-caption text-ink-secondary">
                    <Sparkles size={13} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                    {reason}
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ActivePaths({ data }: { data: LearnerDashboard }) {
  if (data.activePaths.length === 0) {
    return (
      <Card>
        <SectionHeader eyebrow="Goals" title="Learning paths" />
        <EmptyState
          className="mt-4"
          icon={<RouteIcon size={18} aria-hidden />}
          title="No path started"
          description="A path sequences topics toward a role or goal and shows how far you are through each stage."
          action={<LinkButton to="/paths">See learning paths</LinkButton>}
        />
      </Card>
    );
  }

  return (
    <Card>
      <SectionHeader
        eyebrow="Goals"
        title="Learning paths"
        actions={
          <LinkButton to="/paths" variant="ghost" size="sm">
            All paths <ArrowRight size={14} aria-hidden />
          </LinkButton>
        }
      />
      <ul className="mt-4 space-y-3">
        {data.activePaths.map((path) => (
          <li key={path.slug}>
            <Card as="div" variant="interactive" className="p-3.5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-sans text-small-title font-semibold text-ink">
                  <Link to={`/paths/${path.slug}`} className="transition-colors hover:text-accent-hover">
                    {path.name}
                  </Link>
                </h3>
                <span className="tnum text-caption text-ink-muted">
                  {path.topicsDone}/{path.topicCount} topics
                </span>
              </div>
              <ProgressBar className="mt-2" value={path.progressPercent / 100} label={`${path.name} progress`} />
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
                {path.currentStage && <span>Current stage: {path.currentStage}</span>}
                {path.goalDate && <span>Target: {path.goalDate}</span>}
                <span className="tnum">{Math.round(path.progressPercent)}% complete</span>
              </div>
              {path.stages.length > 0 && (
                <ol className="mt-3 flex flex-wrap gap-1.5">
                  {path.stages.map((stage) => {
                    const done = stage.topicCount > 0 && stage.doneCount >= stage.topicCount;
                    return (
                      <li
                        key={stage.title}
                        className={`rounded-pill border px-2 py-0.5 text-caption ${
                          done
                            ? 'border-success/40 bg-success-soft text-success'
                            : stage.doneCount > 0
                              ? 'border-accent/40 bg-accent-soft text-accent-hover'
                              : 'border-line bg-sunken text-ink-muted'
                        }`}
                      >
                        {stage.title} <span className="tnum">{stage.doneCount}/{stage.topicCount}</span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MasteryPanel({ summary }: { summary: LearnerDashboard['masterySummary'] }) {
  const total = MASTERY_ORDER.reduce((sum, level) => sum + (summary.byLevel[level] ?? 0), 0);

  return (
    <Card>
      <SectionHeader
        eyebrow="Mastery"
        title="Where you stand"
        description="Mastery is computed from coverage, exercise performance and how recently you practised — not from opening a lesson."
        actions={
          <LinkButton to="/progress" variant="ghost" size="sm">
            Details
          </LinkButton>
        }
      />
      {total === 0 ? (
        <EmptyState
          className="mt-4"
          icon={<Target size={18} aria-hidden />}
          title="No mastery estimates yet"
          description="Complete an exercise or mark a lesson done and the model will start scoring topics you have touched."
        />
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {MASTERY_ORDER.map((level: MasteryLevel) => {
              const count = summary.byLevel[level] ?? 0;
              return (
                <li key={level} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 font-sans text-caption text-ink-secondary">
                    {MASTERY_LABEL[level]}
                  </span>
                  <ProgressBar
                    value={count / total}
                    size="sm"
                    tone={count === 0 ? 'muted' : 'accent'}
                    label={`${MASTERY_LABEL[level]} topics`}
                  />
                  <span className="tnum w-8 shrink-0 text-right text-caption text-ink-muted">{count}</span>
                </li>
              );
            })}
          </ul>
          {summary.weakest.length > 0 && (
            <div className="mt-4 border-t border-[var(--border-subtle)] pt-3">
              <h3 className="eyebrow text-caption">Worth revisiting</h3>
              <ul className="mt-2 space-y-1.5">
                {summary.weakest.slice(0, 5).map((topic) => (
                  <li key={topic.slug} className="flex items-baseline justify-between gap-2 text-caption">
                    <Link to={`/explore/${topic.slug}`} className="min-w-0 truncate text-ink hover:text-accent-hover">
                      {topic.name}
                    </Link>
                    <span className="tnum shrink-0 text-ink-muted">
                      {topic.level} · {percent(topic.score)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function UpcomingEvents({ data }: { data: LearnerDashboard }) {
  if (data.upcomingEvents.length === 0) return null;
  return (
    <Card>
      <SectionHeader
        eyebrow="Research & discover"
        title="Coming up"
        actions={
          <LinkButton to="/research" variant="ghost" size="sm">
            All events
          </LinkButton>
        }
      />
      <ul className="mt-3 space-y-2.5">
        {data.upcomingEvents.slice(0, 4).map((event) => (
          <li key={event.slug} className="flex items-start gap-2">
            <CalendarClock size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
            <div className="min-w-0">
              <Link
                to={`/research/events/${event.slug}`}
                className="block truncate font-sans text-caption font-medium text-ink hover:text-accent-hover"
              >
                {event.name}
              </Link>
              <p className="tnum text-caption text-ink-muted">
                {event.organizer} · {event.startDate ?? event.deadlineDate ?? 'date not listed'}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 border-t border-[var(--border-subtle)] pt-2 text-caption text-ink-muted">
        {CURATED_EVENTS_NOTE}
      </p>
    </Card>
  );
}

function RecentlySaved({ data }: { data: LearnerDashboard }) {
  const { bookmarks, notes } = data.savedRecently;
  if (bookmarks.length === 0 && notes.length === 0) return null;

  return (
    <Card>
      <SectionHeader eyebrow="Saved" title="Recently" />
      {bookmarks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {bookmarks.slice(0, 4).map((item) => (
            <li key={`${item.type}:${item.slug}`} className="flex items-start gap-2">
              <BookMarked size={14} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0">
                <Link
                  to={`/resources/${item.slug}`}
                  className="block truncate font-sans text-caption font-medium text-ink hover:text-accent-hover"
                >
                  {item.title}
                </Link>
                <p className="text-caption text-ink-muted">
                  {item.type} · saved {formatRelative(item.savedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {notes.length > 0 && (
        <ul className="mt-3 space-y-2 border-t border-[var(--border-subtle)] pt-3">
          {notes.slice(0, 3).map((note) => (
            <li key={note.id} className="flex items-start gap-2">
              <NotebookPen size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
              <div className="min-w-0">
                <p className="font-sans text-caption text-ink-secondary">
                  {note.body.length > 90 ? `${note.body.slice(0, 90)}…` : note.body}
                </p>
                <p className="text-caption text-ink-muted">
                  {note.entityTitle ?? note.entityType} · {formatRelative(note.updatedAt)}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 border-t border-[var(--border-subtle)] pt-2">
        <LinkButton to="/settings" variant="ghost" size="sm">
          Bookmarks & notes
        </LinkButton>
      </div>
    </Card>
  );
}
