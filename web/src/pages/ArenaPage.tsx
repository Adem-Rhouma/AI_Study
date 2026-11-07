import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Award, CheckCircle2, Filter, Lightbulb, ListChecks, Sparkles, Swords, X, XCircle } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { ArenaExercisePage, ArenaRecommendations, ArenaStats, Difficulty } from '../api/types';
import { useSession } from '../lib/session';
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_ORDER,
  EXERCISE_KIND_ORDER,
  exerciseKindLabel,
  percent
} from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, SectionHeader } from '../components/ui/Surface';
import { EmptyState, ErrorState, InlineAlert, SkeletonCard, SkeletonRows } from '../components/ui/Feedback';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { SearchInput, Select } from '../components/ui/Field';
import { Pagination } from '../components/ui/Pagination';
import { StatTile } from '../components/ui/Progress';
import { Button, LinkButton } from '../components/ui/Button';

type DifficultyFilter = Difficulty | 'all';
type KindFilter = string;

export default function ArenaPage() {
  const [params, setParams] = useSearchParams();
  const topic = params.get('topic') ?? '';
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');
  const [kind, setKind] = useState<KindFilter>('all');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);

  const filters = { q: search, difficulty, kind, page, perPage, ...(topic ? { topic } : {}) };
  const query = useQuery({
    queryKey: keys.exercises(filters),
    queryFn: () => api.get<ArenaExercisePage>('/arena/exercises', filters),
    placeholderData: (previous) => previous
  });

  const exercises = query.data?.exercises ?? [];
  // The list endpoint already carries the topic's display name, so no second request is needed.
  const topicName = exercises.find((exercise) => exercise.topic?.slug === topic)?.topic?.name ?? topic;
  const clearTopic = () => {
    params.delete('topic');
    setParams(params, { replace: true });
    setPage(1);
  };

  return (
    <>
      <PageHeader
        eyebrow="Problem Arena"
        title="Practice that changes your mastery"
        description="Graded problems drawn from the same topics as the lessons. Auto-graded kinds are marked instantly; derivations and code are stored for a human read, because this Arena has no code sandbox."
      >
        <InlineAlert tone="info" title="What counts as practice here">
          Auto-graded answers move your topic mastery. Hints are allowed and simply discount the credit on the attempt
          that follows them. Nothing is marked correct without an answer.
        </InlineAlert>
      </PageHeader>

      <SignedInPanel />

      {topic && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-secondary">Filtered to topic</span>
          <Chip tone="accent" icon={<Filter size={12} aria-hidden />}>
            {topicName}
          </Chip>
          <button
            type="button"
            onClick={clearTopic}
            className="inline-flex items-center gap-1 rounded-pill border border-line px-2 py-0.5 text-caption text-ink-secondary transition-colors hover:border-[var(--border-strong)] hover:text-ink"
          >
            <X size={12} aria-hidden /> Clear
          </button>
        </div>
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
            ariaLabel="Search exercises"
            value={q}
            placeholder="Search by title or prompt…"
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
        <Select
          aria-label="Filter by exercise kind"
          value={kind}
          onChange={(event) => {
            setKind(event.target.value);
            setPage(1);
          }}
          className="w-48"
        >
          <option value="all">All kinds</option>
          {EXERCISE_KIND_ORDER.map((value) => (
            <option key={value} value={value}>
              {exerciseKindLabel(value)}
            </option>
          ))}
        </Select>
      </div>

      {query.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonCard key={index} lines={4} />
          ))}
        </div>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : exercises.length === 0 ? (
        <EmptyState
          title="No exercises match those filters"
          description="Try a different search term, or clear the filters to see the whole Arena."
          icon={<Swords size={18} aria-hidden />}
          action={
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQ('');
                setSearch('');
                setDifficulty('all');
                setKind('all');
                if (topic) clearTopic();
                setPage(1);
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {exercises.map((exercise) => (
              <li key={exercise.slug}>
                <Card as="article" variant="interactive" className="flex h-full flex-col gap-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip>{exerciseKindLabel(exercise.kind)}</Chip>
                    <DifficultyChip difficulty={exercise.difficulty} />
                    <Chip tone="accent" icon={<Award size={12} aria-hidden />}>
                      <span className="tnum">{exercise.points} pts</span>
                    </Chip>
                  </div>

                  <h2 className="text-h4 font-semibold leading-snug text-ink">
                    <Link to={`/arena/${exercise.slug}`} className="transition-colors hover:text-accent-hover">
                      {exercise.title}
                    </Link>
                  </h2>
                  <p className="line-clamp-3 text-caption leading-relaxed text-ink-secondary">{exercise.prompt}</p>

                  <div className="mt-auto space-y-2 pt-1">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
                      {exercise.topic && (
                        <Link
                          to={`/explore/${exercise.topic.slug}`}
                          className="transition-colors hover:text-accent-hover"
                        >
                          {exercise.topic.name}
                        </Link>
                      )}
                      {exercise.hintCount > 0 && (
                        <span className="inline-flex items-center gap-1 tnum">
                          <Lightbulb size={12} aria-hidden /> {exercise.hintCount}
                          {exercise.hintCount === 1 ? ' hint' : ' hints'}
                        </span>
                      )}
                    </div>
                    <AttemptSummary attempts={exercise.attempts} bestScore={exercise.bestScore} lastResult={exercise.lastResult} />
                    <LinkButton to={`/arena/${exercise.slug}`} variant="secondary" size="sm">
                      {exercise.attempts > 0 ? 'Open again' : 'Start'}
                    </LinkButton>
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

function AttemptSummary({
  attempts,
  bestScore,
  lastResult
}: {
  attempts: number;
  bestScore: number | null;
  lastResult: boolean | null;
}) {
  if (attempts === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-caption text-ink-muted">
        <ListChecks size={13} aria-hidden /> Not attempted yet
      </span>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-secondary">
      <span className="tnum">
        {attempts} {attempts === 1 ? 'attempt' : 'attempts'}
      </span>
      {bestScore !== null && <span className="tnum">Best {percent(bestScore)}</span>}
      {lastResult === true && (
        <span className="inline-flex items-center gap-1 text-success">
          <CheckCircle2 size={13} aria-hidden /> Last correct
        </span>
      )}
      {lastResult === false && (
        <span className="inline-flex items-center gap-1 text-danger">
          <XCircle size={13} aria-hidden /> Last incorrect
        </span>
      )}
    </div>
  );
}

function SignedInPanel() {
  const { isAuthenticated } = useSession();
  const stats = useQuery({
    queryKey: keys.arenaStats,
    queryFn: () => api.get<ArenaStats>('/arena/stats'),
    enabled: isAuthenticated
  });
  const recommendations = useQuery({
    queryKey: keys.arenaRecommend(8),
    queryFn: () => api.get<ArenaRecommendations>('/arena/recommend', { limit: 8 }),
    enabled: isAuthenticated
  });

  if (!isAuthenticated) {
    return (
      <Card className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body text-ink-secondary">
            Sign in to record attempts, unlock hints and let your answers move your mastery.
          </p>
          <div className="flex gap-2">
            <LinkButton to="/login" variant="secondary" size="sm">
              Sign in
            </LinkButton>
            <LinkButton to="/register" size="sm">
              Create an account
            </LinkButton>
          </div>
        </div>
      </Card>
    );
  }

  const totals = stats.data?.totals;

  return (
    <section className="mb-8 space-y-5" aria-label="Your Arena activity">
      {stats.isLoading ? (
        <SkeletonRows rows={1} className="h-20" />
      ) : stats.error ? (
        <ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
      ) : (
        totals && (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              label="Attempts"
              value={<span className="tnum">{totals.attempts}</span>}
              hint={`across ${totals.exercisesTouched} exercises`}
              icon={<ListChecks size={15} aria-hidden />}
            />
            <StatTile
              label="Accuracy"
              value={<span className="tnum">{percent(totals.accuracy)}</span>}
              hint={`${totals.correct} auto-graded correct`}
              icon={<CheckCircle2 size={15} aria-hidden />}
            />
            <StatTile
              label="Awaiting review"
              value={<span className="tnum">{totals.awaitingReview}</span>}
              hint="derivations and code, never executed"
              icon={<Sparkles size={15} aria-hidden />}
            />
            <StatTile
              label="Hints used"
              value={<span className="tnum">{totals.hintsUsedOnAttempts}</span>}
              hint={`${totals.hintUnlocks} unlocks total`}
              icon={<Lightbulb size={15} aria-hidden />}
            />
          </div>
        )
      )}

      {totals && totals.attempts > 0 && stats.data && stats.data.weakestTopics.length > 0 && (
        <Card>
          <SectionHeader
            eyebrow="Where to practise"
            title="Lowest-scoring topics with attempts"
            description="Ordered by mastery score. These are topics you have already tried, so the gap is specific rather than merely unvisited."
          />
          <ul className="mt-3 flex flex-wrap gap-2">
            {stats.data.weakestTopics.map((topic) => (
              <li key={topic.slug}>
                <Link
                  to={`/arena?topic=${encodeURIComponent(topic.slug)}`}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-sunken px-2.5 py-1 text-caption text-ink-secondary transition-colors hover:border-[var(--border-strong)] hover:text-ink"
                >
                  {topic.name}
                  <span className="tnum text-ink-muted">{percent(topic.score)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {recommendations.isLoading ? (
        <SkeletonRows rows={2} />
      ) : recommendations.data && recommendations.data.recommended.length > 0 ? (
        <Card>
          <SectionHeader
            eyebrow="Recommended next"
            title="Picked from your coverage"
            description={`Chosen against your default difficulty (${recommendations.data.basedOnDifficulty}).`}
          />
          <ul className="mt-3 grid gap-3 md:grid-cols-2">
            {recommendations.data.recommended.map((item) => (
              <li key={item.slug} className="rounded-card border border-line bg-sunken p-3">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-body font-semibold text-ink">
                    <Link to={`/arena/${item.slug}`} className="transition-colors hover:text-accent-hover">
                      {item.title}
                    </Link>
                  </h3>
                  <Chip tone="accent">
                    <span className="tnum">{item.points} pts</span>
                  </Chip>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <Chip>{exerciseKindLabel(item.kind)}</Chip>
                  <DifficultyChip difficulty={item.difficulty} />
                </div>
                <p className="mt-2 text-caption leading-relaxed text-ink-secondary">{item.reason}</p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </section>
  );
}
