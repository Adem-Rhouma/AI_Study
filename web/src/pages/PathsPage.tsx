import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BookOpen, Clock, Compass, Layers, Pause, Star } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { Difficulty, MyPaths, PathPage } from '../api/types';
import { useSession } from '../lib/session';
import { DIFFICULTY_LABEL, DIFFICULTY_ORDER, formatDate, formatHours, percent } from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, SectionHeader } from '../components/ui/Surface';
import { EmptyState, ErrorState, SkeletonCard } from '../components/ui/Feedback';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { SearchInput, Select } from '../components/ui/Field';
import { Pagination } from '../components/ui/Pagination';
import { ProgressBar } from '../components/ui/Progress';
import { LinkButton } from '../components/ui/Button';

type DifficultyFilter = Difficulty | 'all';

const STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  completed: 'Completed',
  abandoned: 'Abandoned'
};

export default function PathsPage() {
  const { session } = useSession();
  const signedIn = session.user !== null;

  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');
  const [featured, setFeatured] = useState(false);
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(9);

  const filters = { q: search, difficulty, featured, page, perPage };
  const query = useQuery({
    queryKey: keys.paths(filters),
    queryFn: () => api.get<PathPage>('/paths', filters),
    placeholderData: (previous) => previous
  });

  const mine = useQuery({
    queryKey: keys.myPaths,
    queryFn: () => api.get<MyPaths>('/paths/mine'),
    enabled: signedIn
  });

  const paths = query.data?.paths ?? [];
  const enrollments = mine.data?.enrollments ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Learning Paths"
        title="Ordered routes through the curriculum"
        description="A path sequences real topics and courses into stages with prerequisites made explicit. Progress on a path counts topics you have reached practising level on and courses you have completed — never lessons you merely opened."
      />

      {signedIn && (
        <section className="mb-8">
          <SectionHeader
            eyebrow="Yours"
            title="Your paths"
            description={
              mine.isLoading
                ? 'Loading your enrollments…'
                : enrollments.length === 0
                  ? 'You are not following a path yet. Pick one below, or browse the whole field in Explore AI first.'
                  : 'Status is yours to set — pausing keeps your progress and removes the path from your dashboard.'
            }
          />
          {mine.error ? (
            <ErrorState error={mine.error} onRetry={() => void mine.refetch()} />
          ) : enrollments.length > 0 ? (
            <ul className="mt-4 grid gap-3 md:grid-cols-2">
              {enrollments.map((entry) => (
                <li key={entry.slug}>
                  <Card as="article" variant="interactive" className="flex h-full flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-h4 font-semibold text-ink">
                        <Link to={`/paths/${entry.slug}`} className="transition-colors hover:text-accent-hover">
                          {entry.name}
                        </Link>
                      </h3>
                      <Chip icon={entry.status === 'paused' ? <Pause size={12} aria-hidden /> : undefined}>
                        {STATUS_LABEL[entry.status] ?? entry.status}
                      </Chip>
                    </div>
                    {entry.progress && (
                      <>
                        <ProgressBar value={entry.progress.percent} label={`${entry.name} progress`} size="sm" />
                        <p className="tnum text-caption text-ink-muted">
                          {entry.progress.topicsProficient}/{entry.progress.topicsTotal} topics at practising or above ·{' '}
                          {percent(entry.progress.percent)}
                        </p>
                      </>
                    )}
                    <p className="mt-auto text-caption text-ink-muted">
                      Started {formatDate(entry.startedAt)}
                      {entry.goalDate ? ` · goal ${formatDate(entry.goalDate)}` : ''}
                      {entry.completedAt ? ` · completed ${formatDate(entry.completedAt)}` : ''}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <form
          className="min-w-56 flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setSearch(q.trim());
            setPage(1);
          }}
        >
          <SearchInput
            ariaLabel="Search learning paths"
            value={q}
            placeholder="Search paths by name, summary or audience…"
            onValueChange={setQ}
          />
        </form>
        <Select
          aria-label="Filter by difficulty"
          value={difficulty}
          onChange={(event) => {
            setDifficulty(event.target.value as DifficultyFilter);
            setPage(1);
          }}
          className="w-44"
        >
          <option value="all">All difficulties</option>
          {DIFFICULTY_ORDER.map((level) => (
            <option key={level} value={level}>
              {DIFFICULTY_LABEL[level]}
            </option>
          ))}
        </Select>
        <label className="flex cursor-pointer items-center gap-2 pb-2 font-sans text-caption text-ink-secondary">
          <input
            type="checkbox"
            checked={featured}
            onChange={(event) => {
              setFeatured(event.target.checked);
              setPage(1);
            }}
            className="size-4 accent-[var(--accent)]"
          />
          Featured only
        </label>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }, (_, index) => (
            <SkeletonCard key={index} lines={5} />
          ))}
        </div>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : paths.length === 0 ? (
        <EmptyState
          icon={<Compass size={20} aria-hidden />}
          title="No paths match those filters"
          description="Try a different search term, or clear the difficulty and featured filters. You can also browse individual topics in Explore AI."
          action={
            <LinkButton
              to="/paths"
              variant="secondary"
              onClick={() => {
                setQ('');
                setSearch('');
                setDifficulty('all');
                setFeatured(false);
                setPage(1);
              }}
            >
              Clear filters
            </LinkButton>
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2">
            {paths.map((path) => (
              <li key={path.slug}>
                <Card as="article" variant="interactive" className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-h4 font-semibold text-ink">
                      <Link to={`/paths/${path.slug}`} className="transition-colors hover:text-accent-hover">
                        {path.name}
                      </Link>
                    </h2>
                    {path.isFeatured && (
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-pill bg-accent-soft px-2 py-0.5 text-caption font-medium text-accent-hover">
                        <Star size={12} aria-hidden /> Featured
                      </span>
                    )}
                  </div>

                  <p className="line-clamp-3 text-body text-ink-secondary">{path.summary}</p>

                  <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-ink-muted">
                    <div className="flex items-center gap-1.5">
                      <Layers size={13} aria-hidden /> <dd className="tnum">{path.topicCount} topics</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <BookOpen size={13} aria-hidden /> <dd className="tnum">{path.courseCount} courses</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock size={13} aria-hidden /> <dd className="tnum">{formatHours(path.estHours)}</dd>
                    </div>
                  </dl>

                  <div className="mt-auto space-y-2 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <DifficultyChip difficulty={path.difficulty} />
                      {path.enrolled && path.status && (
                        <Chip icon={path.status === 'paused' ? <Pause size={12} aria-hidden /> : undefined}>
                          {STATUS_LABEL[path.status] ?? path.status}
                        </Chip>
                      )}
                    </div>
                    {path.enrolled ? (
                      <>
                        <ProgressBar value={path.progress} label={`${path.name} progress`} size="sm" />
                        <div className="flex items-center justify-between gap-2">
                          <span className="tnum text-caption text-ink-muted">{percent(path.progress)} complete</span>
                          <LinkButton to={`/paths/${path.slug}`} size="sm">
                            Continue <ArrowRight size={14} aria-hidden />
                          </LinkButton>
                        </div>
                      </>
                    ) : (
                      <LinkButton to={`/paths/${path.slug}`} variant="secondary" size="sm">
                        View path
                      </LinkButton>
                    )}
                    {path.audience && <p className="truncate text-caption text-ink-muted">For: {path.audience}</p>}
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {query.data && (
            <Pagination
              className="mt-6"
              page={query.data.page}
              totalPages={query.data.totalPages}
              total={query.data.total}
              perPage={query.data.perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          )}
        </>
      )}
    </>
  );
}
