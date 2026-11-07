import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Activity as ActivityIcon,
  Award,
  ChevronDown,
  ChevronUp,
  Download,
  Flame,
  ListChecks,
  Route as RouteIcon,
  Target,
  Timer
} from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type {
  ActivityPayload,
  MasteryDetail,
  MasteryListItem,
  MasteryListPage,
  ProgressExport,
  ProgressOverview,
  ProgressPaths,
  MasteryLevel
} from '../api/types';
import { useSession } from '../lib/session';
import {
  formatDateTime,
  formatMinutes,
  formatRelative,
  MASTERY_LABEL,
  MASTERY_ORDER,
  percent
} from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, SectionHeader } from '../components/ui/Surface';
import { EmptyState, ErrorState, InlineAlert, QueryBoundary, SkeletonRows } from '../components/ui/Feedback';
import { Button, IconButton, LinkButton } from '../components/ui/Button';
import { Chip, DifficultyChip, MasteryChip } from '../components/ui/Chip';
import { Field, SearchInput, Select } from '../components/ui/Field';
import { ActivityHeatmap, ProgressBar, StatTile } from '../components/ui/Progress';
import { DataTable, type Column } from '../components/ui/Table';
import { Pagination } from '../components/ui/Pagination';
import { TabPanel, Tabs } from '../components/ui/Tabs';
import { useToast } from '../components/ui/Toast';

const TABS = ['overview', 'mastery', 'activity', 'paths'] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string | null): value is Tab => (TABS as readonly string[]).includes(value ?? '');

const ACTIVITY_RANGES = [
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
  { days: 180, label: 'Last 6 months' },
  { days: 365, label: 'Last year' }
] as const;

export default function ProgressPage() {
  const [params, setParams] = useSearchParams();
  const { session } = useSession();
  const urlTab = params.get('tab');
  const [tab, setTab] = useState<Tab>(isTab(urlTab) ? urlTab : 'overview');

  useEffect(() => {
    if (isTab(urlTab)) setTab(urlTab);
  }, [urlTab]);

  const overview = useQuery({
    queryKey: keys.progressOverview,
    queryFn: () => api.get<ProgressOverview>('/progress/overview'),
    enabled: Boolean(session.user)
  });

  if (!session.user) {
    return (
      <>
        <PageHeader eyebrow="Progress" title="Mastery over time" />
        <EmptyState
          icon={<Target size={18} aria-hidden />}
          title="Progress lives in your account"
          description="Sign in to see mastery estimates, the reasons behind each level, your activity history and export a copy of everything we store about you."
          action={
            <>
              <LinkButton to="/login">Sign in</LinkButton>
              <LinkButton to="/register" variant="secondary">
                Create an account
              </LinkButton>
            </>
          }
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Progress"
        title="Mastery over time"
        description="Every figure here is derived from what you did: lessons you marked complete and exercises you submitted. Reading a page, staying on it for a minute or opening a lesson never counts as knowing it."
        actions={<ExportButton />}
      />

      <Tabs
        items={[
          { value: 'overview', label: 'Overview', icon: <ActivityIcon size={14} aria-hidden /> },
          {
            value: 'mastery',
            label: 'Topic mastery',
            icon: <Award size={14} aria-hidden />,
            count: overview.data?.overview.topicsTouched
          },
          { value: 'activity', label: 'Activity', icon: <Timer size={14} aria-hidden /> },
          { value: 'paths', label: 'Paths', icon: <RouteIcon size={14} aria-hidden /> }
        ]}
        value={tab}
        onValueChange={(next) => {
          setTab(isTab(next) ? next : 'overview');
          setParams(next === 'overview' ? {} : { tab: next }, { replace: true });
        }}
        ariaLabel="Progress sections"
      >
        <TabPanel value="overview">
          <OverviewPanel />
        </TabPanel>
        <TabPanel value="mastery">
          <MasteryPanel />
        </TabPanel>
        <TabPanel value="activity">
          <ActivityPanel />
        </TabPanel>
        <TabPanel value="paths">
          <PathsPanel />
        </TabPanel>
      </Tabs>
    </>
  );
}

function ExportButton() {
  const toast = useToast();
  const exportData = useMutation({
    mutationFn: () => api.get<ProgressExport>('/progress/export'),
    onSuccess: (payload) => {
      downloadJson(`ai-mastery-progress-${payload.exportedAt.slice(0, 10)}.json`, payload);
      const rows = Object.values(payload.totals).reduce((sum, count) => sum + count, 0);
      toast.success(`Exported ${rows} rows of your own data as JSON.`);
    },
    onError: (error) => toast.danger(error instanceof Error ? error.message : 'Export failed.')
  });

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => exportData.mutate()}
      loading={exportData.isPending}
      title="Download every row this account owns"
    >
      <Download size={15} aria-hidden /> Export my data
    </Button>
  );
}

function downloadJson(filename: string, payload: unknown) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function OverviewPanel() {
  const query = useQuery({
    queryKey: keys.progressOverview,
    queryFn: () => api.get<ProgressOverview>('/progress/overview')
  });

  if (query.isLoading) return <SkeletonRows rows={5} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  const totals = query.data.overview;
  const hasEvidence = totals.attempts > 0 || totals.lessonsDone > 0;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Lessons complete"
          value={totals.lessonsDone}
          hint="Marked done by you, not auto-scored by scrolling"
        />
        <StatTile label="Topics touched" value={totals.topicsTouched} hint="Topics with at least one completion or attempt" />
        <StatTile
          label="Graded attempts"
          value={totals.attempts}
          hint={`${totals.correctAttempts} correct · ${percent(totals.accuracy)} accuracy`}
        />
        <StatTile
          label="This week"
          value={formatMinutes(totals.minutesWeek)}
          hint={
            totals.dailyGoalMinutes > 0
              ? `${totals.daysActiveWeek} active day${totals.daysActiveWeek === 1 ? '' : 's'} · goal ${totals.dailyGoalMinutes} min/day`
              : `${totals.daysActiveWeek} active day${totals.daysActiveWeek === 1 ? '' : 's'} · no daily goal set`
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <LevelDistribution levels={query.data.levels} />
          {!hasEvidence && (
            <Card variant="sunken">
              <InlineAlert
                tone="info"
                title="Nothing to score yet"
                action={
                  <LinkButton to="/courses" size="sm">
                    Start a course
                  </LinkButton>
                }
              >
                Mastery needs evidence: finish a lesson and submit at least one exercise. Until then every topic stays at
                “new”, which is the honest answer rather than a guess.
              </InlineAlert>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <SectionHeader eyebrow="Consistency" title="Streak" />
            <div className="mt-3 flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-pill border border-line bg-sunken text-accent">
                <Flame size={18} aria-hidden />
              </span>
              <div>
                <p className="tnum text-h3 font-semibold text-ink">{query.data.streak.current}</p>
                <p className="text-caption text-ink-muted">
                  {query.data.streak.todayActive
                    ? `days in a row · today counts${query.data.streak.current === 1 ? '' : ', longest run ' + query.data.streak.longest}`
                    : `day streak · longest run ${query.data.streak.longest}`}
                </p>
              </div>
            </div>
            <p className="mt-3 border-t border-[var(--border-subtle)] pt-2 text-caption text-ink-muted">
              A day counts when you complete a lesson or submit an exercise. Minutes spent reading only add up in the
              activity log, never to a streak.
            </p>
          </Card>

          <ReviewQueue items={query.data.dueForReview} />
        </div>
      </div>
    </div>
  );
}

function LevelDistribution({ levels }: { levels: ProgressOverview['levels'] }) {
  const counts = new Map(levels.map((row) => [row.level, row.count]));
  const total = MASTERY_ORDER.reduce((sum, level) => sum + (counts.get(level) ?? 0), 0);

  return (
    <Card>
      <SectionHeader
        eyebrow="Distribution"
        title="Topics by mastery level"
        description="Level comes from coverage, hint-discounted performance and a capped retention term — see any topic for the arithmetic."
        actions={
          <LinkButton to="/progress?tab=mastery" variant="ghost" size="sm">
            Every topic
          </LinkButton>
        }
      />
      {total === 0 ? (
        <EmptyState
          className="mt-4"
          title="No mastery estimates yet"
          description="Complete a lesson or submit an exercise and the model starts scoring the topics involved."
        />
      ) : (
        <ul className="mt-4 space-y-2.5">
          {MASTERY_ORDER.map((level: MasteryLevel) => {
            const count = counts.get(level) ?? 0;
            return (
              <li key={level} className="flex items-center gap-3">
                <span className="w-24 shrink-0 font-sans text-caption text-ink-secondary">{MASTERY_LABEL[level]}</span>
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
      )}
    </Card>
  );
}

function ReviewQueue({ items }: { items: ProgressOverview['dueForReview'] }) {
  return (
    <Card>
      <SectionHeader
        eyebrow="Spaced practice"
        title="Due for a recheck"
        description="Topics below proficient that have not been touched for 90 days."
      />
      {items.length === 0 ? (
        <p className="mt-3 text-caption text-ink-muted">
          Nothing is overdue. When a topic goes 90 days without a completion or attempt it shows up here.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => (
            <li key={item.slug} className="flex items-start justify-between gap-2">
              <Link
                to={`/explore/${item.slug}`}
                className="min-w-0 truncate font-sans text-caption font-medium text-ink hover:text-accent-hover"
              >
                {item.name}
              </Link>
              <span className="tnum shrink-0 text-caption text-ink-muted">
                {MASTERY_LABEL[item.level]} · {percent(item.score)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function MasteryPanel() {
  const [params] = useSearchParams();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [level, setLevel] = useState<string>('all');
  const [domain, setDomain] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(20);
  const [selected, setSelected] = useState<string | null>(params.get('topic'));

  const domains = useQuery({ queryKey: keys.domains, queryFn: () => api.get<{ domains: { slug: string; name: string }[] }>('/curriculum/domains') });

  const filters = { q: search, level, domain, page, perPage };
  const list = useQuery({
    queryKey: keys.masteryList(filters),
    queryFn: () => api.get<MasteryListPage>('/progress/mastery', filters),
    placeholderData: (previous) => previous
  });

  const rows = list.data?.mastery ?? [];
  const selectedRow = rows.find((row) => row.topicSlug === selected) ?? null;

  function apply(next: Partial<{ q: string; level: string; domain: string }>) {
    setPage(1);
    if ('q' in next) setSearch(next.q ?? '');
    if ('level' in next) setLevel(next.level ?? 'all');
    if ('domain' in next) setDomain(next.domain ?? 'all');
  }

  const columns: Column<MasteryListItem>[] = [
    {
      key: 'topic',
      header: 'Topic',
      cell: (row) => (
        <div className="min-w-0">
          <Link
            to={`/explore/${row.topicSlug}`}
            className="font-sans text-body font-medium text-ink transition-colors hover:text-accent-hover"
          >
            {row.topicName}
          </Link>
          <p className="truncate text-caption text-ink-muted">
            {row.domainName} · {row.subdomainName}
          </p>
        </div>
      )
    },
    {
      key: 'level',
      header: 'Level',
      cell: (row) => <MasteryChip level={row.level} stale={row.needsRevalidation} />
    },
    {
      key: 'score',
      header: 'Score',
      align: 'right',
      cell: (row) => <span className="tnum">{percent(row.score)}</span>
    },
    {
      key: 'coverage',
      header: 'Coverage',
      align: 'right',
      cell: (row) => <span className="tnum">{percent(row.coverage)}</span>
    },
    {
      key: 'performance',
      header: 'Performance',
      align: 'right',
      cell: (row) => <span className="tnum">{percent(row.performance)}</span>
    },
    {
      key: 'attempts',
      header: 'Attempts',
      align: 'right',
      cell: (row) => <span className="tnum">{row.attempts}</span>
    },
    {
      key: 'touched',
      header: 'Last touched',
      cell: (row) => <span className="text-caption text-ink-muted">{formatRelative(row.lastTouchedAt)}</span>
    },
    {
      key: 'why',
      header: <span className="sr-only">Why this level</span>,
      align: 'right',
      cell: (row) => (
        <IconButton
          label={selected === row.topicSlug ? 'Hide the reasoning' : 'Show the reasoning'}
          size="sm"
          onClick={() => setSelected(selected === row.topicSlug ? null : row.topicSlug)}
        >
          {selected === row.topicSlug ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
        </IconButton>
      )
    }
  ];

  const hasFilters = search !== '' || level !== 'all' || domain !== 'all';

  return (
    <div className="space-y-4">
      <Card padded={false} className="p-4">
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            apply({ q: q.trim() });
          }}
        >
          <SearchInput
            ariaLabel="Find a topic by name"
            value={q}
            onValueChange={(next) => {
              setQ(next);
              if (next === '') apply({ q: '' });
            }}
            placeholder="Topic name"
            className="min-w-56 flex-1"
          />
          <Field label="Level" htmlFor="mastery-level" className="w-40">
            <Select id="mastery-level" value={level} onChange={(event) => apply({ level: event.target.value })}>
              <option value="all">All levels</option>
              {MASTERY_ORDER.map((step) => (
                <option key={step} value={step}>
                  {MASTERY_LABEL[step]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Domain" htmlFor="mastery-domain" className="w-56">
            <Select id="mastery-domain" value={domain} onChange={(event) => apply({ domain: event.target.value })}>
              <option value="all">All domains</option>
              {(domains.data?.domains ?? []).map((item) => (
                <option key={item.slug} value={item.slug}>
                  {item.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setQ('');
                apply({ q: '', level: 'all', domain: 'all' });
              }}
            >
              Clear
            </Button>
          )}
        </form>
      </Card>

      <QueryBoundary
        state={{ isLoading: list.isLoading, error: list.error }}
        onRetry={() => void list.refetch()}
      >
        <Card padded={false} className="overflow-visible">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.topicSlug}
            empty={
              <EmptyState
                title={hasFilters ? 'No topics match those filters' : 'No mastery estimates yet'}
                description={
                  hasFilters
                    ? 'Widen the filters, or clear them to see every topic you have touched.'
                    : 'Finish a lesson or submit an exercise and this table starts filling in.'
                }
                action={
                  hasFilters ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setQ('');
                        apply({ q: '', level: 'all', domain: 'all' });
                      }}
                    >
                      Clear filters
                    </Button>
                  ) : (
                    <LinkButton to="/courses">Browse courses</LinkButton>
                  )
                }
              />
            }
          />
        </Card>
        <Pagination
          className="px-4 pb-4"
          page={list.data?.page ?? 1}
          totalPages={list.data?.totalPages ?? 1}
          total={list.data?.total}
          perPage={list.data?.perPage ?? perPage}
          onPageChange={setPage}
          onPerPageChange={(next) => {
            setPerPage(next);
            setPage(1);
          }}
          perPageOptions={[10, 20, 50]}
        />
      </QueryBoundary>

      {selectedRow && <WhyPanel row={selectedRow} onClose={() => setSelected(null)} />}
    </div>
  );
}

function WhyPanel({ row, onClose }: { row: MasteryListItem; onClose: () => void }) {
  const detail = useQuery({
    queryKey: keys.topicMastery(row.topicSlug),
    queryFn: () => api.get<MasteryDetail>(`/progress/mastery/${row.topicSlug}`)
  });

  return (
    <Card className="scroll-mt-24">
      <SectionHeader
        eyebrow={MASTERY_LABEL[row.level]}
        title={`Why ${row.topicName} sits here`}
        description="Recomputed from your own completions and graded attempts; the stored numbers are only a rendering of that arithmetic."
        actions={
          <Button variant="ghost" size="sm" onClick={onClose}>
            Close
          </Button>
        }
      />
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <MasteryChip level={row.level} stale={row.needsRevalidation} />
        <DifficultyChip difficulty={row.difficulty} />
        <Chip tone="neutral">{row.domainName}</Chip>
      </div>
      <ol className="mt-4 space-y-2">
        {row.reasons.map((reason) => (
          <li key={reason} className="flex gap-2 text-caption text-ink-secondary">
            <ListChecks size={14} className="mt-0.5 shrink-0 text-ink-muted" aria-hidden />
            <span>{reason}</span>
          </li>
        ))}
      </ol>

      {detail.isLoading && <p className="mt-4 text-caption text-ink-muted">Loading the evidence…</p>}
      {detail.error && (
        <p className="mt-4 text-caption text-danger">{detail.error instanceof Error ? detail.error.message : 'Evidence unavailable.'}</p>
      )}
      {detail.data && (
        <div className="mt-5 grid gap-4 border-t border-[var(--border-subtle)] pt-4 sm:grid-cols-2">
          <div>
            <h3 className="eyebrow text-caption">Lesson evidence</h3>
            <p className="mt-1 text-caption text-ink-secondary">
              {detail.data.evidence.lessons.done} of {detail.data.evidence.lessons.total} published lessons of this
              topic completed
              {detail.data.evidence.lessons.lastCompletionAt
                ? ` · last on ${formatDateTime(detail.data.evidence.lessons.lastCompletionAt)}`
                : ''}
              .
            </p>
            <ProgressBar
              className="mt-2"
              value={
                detail.data.evidence.lessons.total > 0
                  ? detail.data.evidence.lessons.done / detail.data.evidence.lessons.total
                  : 0
              }
              label="Lesson coverage"
            />
          </div>
          <div>
            <h3 className="eyebrow text-caption">Recent graded attempts</h3>
            {detail.data.evidence.attempts.length === 0 ? (
              <p className="mt-1 text-caption text-ink-muted">
                No attempts yet, so performance is credited at zero rather than guessed.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {detail.data.evidence.attempts.slice(0, 5).map((attempt) => (
                  <li key={attempt.at} className="flex items-baseline justify-between gap-2 text-caption">
                    <span className="text-ink-secondary">{formatDateTime(attempt.at)}</span>
                    <span className="tnum text-ink-muted">
                      {percent(attempt.score)}
                      {attempt.hintsUsed > 0 ? ` · ${attempt.hintsUsed} hint${attempt.hintsUsed === 1 ? '' : 's'}` : ''}
                      {attempt.correct === null ? ' · awaiting review' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

function ActivityPanel() {
  const [range, setRange] = useState<number>(90);
  const activity = useQuery({
    queryKey: keys.activity(range),
    queryFn: () => api.get<ActivityPayload>('/progress/activity', { days: range })
  });

  const cells = useMemo(() => {
    const byDay = new Map((activity.data?.days ?? []).map((row) => [row.day, row.minutes]));
    const out: { date: string; minutes: number }[] = [];
    for (let offset = range - 1; offset >= 0; offset--) {
      const date = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
      out.push({ date, minutes: byDay.get(date) ?? 0 });
    }
    return out;
  }, [activity.data, range]);

  const active = cells.filter((cell) => cell.minutes > 0);
  const totalMinutes = active.reduce((sum, cell) => sum + cell.minutes, 0);
  const busiest = active.reduce((best, cell) => (cell.minutes > best.minutes ? cell : best), {
    date: '',
    minutes: 0
  });

  return (
    <div className="space-y-4">
      {activity.isLoading && <SkeletonRows rows={3} />}
      {activity.error && <ErrorState error={activity.error} onRetry={() => void activity.refetch()} />}
      {activity.data && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Active days" value={active.length} hint={`of ${range} days in the window`} />
            <StatTile label="Time recorded" value={formatMinutes(totalMinutes)} hint="Reading a lesson or solving an exercise" />
            <StatTile
              label="Longest session"
              value={busiest.minutes > 0 ? formatMinutes(busiest.minutes) : '—'}
              hint={busiest.date ? `on ${busiest.date}` : 'nothing logged yet'}
            />
          </div>

          <Card>
            <SectionHeader
              eyebrow="History"
              title="When you showed up"
              actions={
                <Field label="Range" htmlFor="activity-range" className="w-40">
                  <Select
                    id="activity-range"
                    value={String(range)}
                    onChange={(event) => setRange(Number(event.target.value))}
                  >
                    {ACTIVITY_RANGES.map((option) => (
                      <option key={option.days} value={option.days}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              }
            />
            {active.length === 0 ? (
              <EmptyState
                className="mt-4"
                title="No activity in this window"
                description="Minutes appear once you read a lesson to the end of a block or submit an exercise. Scroll time alone is never logged."
                action={<LinkButton to="/courses">Open a course</LinkButton>}
              />
            ) : (
              <>
                <ActivityHeatmap className="mt-4" cells={cells} />
                <p className="mt-3 text-caption text-ink-muted">
                  {range > 90
                    ? 'This window is wider than the log retains day by day, so older days may read as empty even when you were active.'
                    : 'Each square is one day, darkest where you spent the most time. Hover or focus a square for the exact figure.'}
                </p>
              </>
            )}
          </Card>

          <Card padded={false}>
            <DataTable
              rows={active.slice(0, 14).reverse()}
              columns={[
                { key: 'day', header: 'Day', cell: (row) => <span className="tnum">{row.date}</span> },
                {
                  key: 'minutes',
                  header: 'Minutes',
                  align: 'right',
                  cell: (row) => <span className="tnum">{row.minutes}</span>
                }
              ]}
              rowKey={(row) => row.date}
              empty={<EmptyState title="No logged sessions" />}
            />
          </Card>
        </>
      )}
    </div>
  );
}

function PathsPanel() {
  const query = useQuery({
    queryKey: keys.progressPaths,
    queryFn: () => api.get<ProgressPaths>('/progress/paths')
  });

  if (query.isLoading) return <SkeletonRows rows={3} />;
  if (query.error) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const paths = query.data?.paths ?? [];
  if (paths.length === 0) {
    return (
      <EmptyState
        icon={<RouteIcon size={18} aria-hidden />}
        title="No learning paths started"
        description="A path sequences topics into stages. Enrolling here is what makes the stage-by-stage breakdown appear."
        action={<LinkButton to="/paths">Browse learning paths</LinkButton>}
      />
    );
  }

  return (
    <div className="space-y-4">
      {paths.map((path) => {
        const topicsTotal = path.stages.reduce((sum, stage) => sum + stage.topicsTotal, 0);
        const topicsDone = path.stages.reduce((sum, stage) => sum + stage.topicsDone, 0);
        return (
          <Card key={path.slug}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-h4 font-semibold text-ink">
                <Link to={`/paths/${path.slug}`} className="transition-colors hover:text-accent-hover">
                  {path.name}
                </Link>
              </h2>
              <div className="flex items-center gap-2">
                <Chip tone={path.status === 'completed' ? 'success' : path.status === 'abandoned' ? 'neutral' : 'accent'}>
                  {path.status}
                </Chip>
                <span className="tnum text-caption text-ink-muted">
                  {topicsDone}/{topicsTotal} topics
                </span>
              </div>
            </div>
            <ProgressBar
              className="mt-3"
              value={topicsTotal > 0 ? topicsDone / topicsTotal : 0}
              label={`${path.name} progress`}
            />
            <p className="mt-2 text-caption text-ink-muted">
              {path.goalDate ? `Target date ${path.goalDate}.` : 'No target date set.'} Started{' '}
              {path.startedAt ? formatRelative(path.startedAt) : 'recently'}.
            </p>
            <ul className="mt-4 space-y-2.5">
              {path.stages.map((stage) => (
                <li key={`${path.slug}:${stage.stageId ?? 'unordered'}`} className="flex items-center gap-3">
                  <span className="w-40 shrink-0 truncate font-sans text-caption text-ink-secondary">{stage.title}</span>
                  <ProgressBar
                    value={stage.topicsTotal > 0 ? stage.topicsDone / stage.topicsTotal : 0}
                    size="sm"
                    tone={stage.topicsTotal > 0 && stage.topicsDone >= stage.topicsTotal ? 'success' : 'accent'}
                    label={`${stage.title} topics`}
                  />
                  <span className="tnum w-20 shrink-0 text-right text-caption text-ink-muted">
                    {stage.topicsDone}/{stage.topicsTotal} · {stage.lessonsDone}/{stage.lessonsTotal} lessons
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}
