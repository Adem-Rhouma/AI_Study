import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Layers, Search, X } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { Difficulty, DomainSummary, TopicGraph, TopicPage } from '../api/types';
import { DIFFICULTY_LABEL, DIFFICULTY_ORDER, formatMinutes } from '../lib/format';
import { cn } from '../lib/cn';
import { PageHeader } from '../components/layout/PageHeader';
import { TopicMap } from '../components/explore/TopicMap';
import { Card } from '../components/ui/Surface';
import { EmptyState, ErrorState, SkeletonCard, SkeletonRows } from '../components/ui/Feedback';
import { DifficultyChip, Chip } from '../components/ui/Chip';
import { SearchInput, Select } from '../components/ui/Field';
import { Pagination } from '../components/ui/Pagination';
import { Tabs } from '../components/ui/Tabs';

type DifficultyFilter = Difficulty | 'all';

export default function ExplorePage() {
  const [params, setParams] = useSearchParams();
  const urlDomain = params.get('domain') ?? '';
  const urlSubdomain = params.get('subdomain') ?? '';

  const [tab, setTab] = useState<'browse' | 'map'>('browse');
  const [domain, setDomain] = useState(urlDomain);
  const [subdomain, setSubdomain] = useState(urlSubdomain);
  const [difficulty, setDifficulty] = useState<DifficultyFilter>('all');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  // Other pages (research areas, topic maps) link in with ?domain= and ?subdomain=, and those
  // links do not remount this component — the URL has to be able to move the filters.
  useEffect(() => {
    setDomain(urlDomain);
    setSubdomain(urlSubdomain);
    setPage(1);
  }, [urlDomain, urlSubdomain]);

  const domainsQuery = useQuery({
    queryKey: keys.domains,
    queryFn: () => api.get<{ domains: DomainSummary[] }>('/curriculum/domains')
  });

  const filters = { domain, subdomain, difficulty, q: search, page, perPage: 24 };
  const topicsQuery = useQuery({
    queryKey: keys.topics(filters),
    queryFn: () => api.get<TopicPage>('/curriculum/topics', filters),
    placeholderData: (previous) => previous
  });

  const graphScope = { domain: domain || undefined };
  const graphQuery = useQuery({
    queryKey: keys.graph(graphScope),
    queryFn: () => api.get<TopicGraph>('/curriculum/graph', graphScope),
    enabled: tab === 'map'
  });

  const domains = domainsQuery.data?.domains ?? [];

  function selectDomain(slug: string) {
    setParams(slug && slug !== domain ? { domain: slug } : {}, { replace: true });
  }

  return (
    <>
      <PageHeader
        eyebrow="Explore AI"
        title="The map of the field"
        description="Every topic the platform teaches, organised by domain and connected by its prerequisites. Nothing here is generated on the fly — the map is curated data you can browse offline."
      />

      <Tabs
        items={[
          { value: 'browse', label: 'Browse topics', icon: <Search size={14} aria-hidden /> },
          { value: 'map', label: 'Prerequisite map', icon: <Layers size={14} aria-hidden /> }
        ]}
        value={tab}
        onValueChange={(value) => setTab(value as 'browse' | 'map')}
        className="mb-5"
      />

      {tab === 'browse' ? (
        <div className="grid gap-5 lg:grid-cols-[15rem_1fr]">
          <nav aria-label="Domains" className="lg:sticky lg:top-[calc(var(--topbar-height)+1rem)] lg:self-start">
            {domainsQuery.isLoading ? (
              <SkeletonCard lines={6} />
            ) : domainsQuery.error ? (
              <ErrorState error={domainsQuery.error} onRetry={() => void domainsQuery.refetch()} />
            ) : (
              <Card padded={false} className="overflow-hidden">
                <ul className="divide-y divide-[var(--border-subtle)]">
                  <li>
                    <button
                      type="button"
                      onClick={() => selectDomain('')}
                      aria-pressed={domain === ''}
                      className={cn(
                        'flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left font-sans text-caption transition-colors',
                        domain === '' ? 'bg-accent-soft text-accent-hover' : 'text-ink-secondary hover:bg-sunken'
                      )}
                    >
                      All domains
                      <span className="tnum text-ink-muted">
                        {domains.reduce((sum, entry) => sum + entry.topicCount, 0)}
                      </span>
                    </button>
                  </li>
                  {domains.map((entry) => (
                    <li key={entry.slug}>
                      <button
                        type="button"
                        onClick={() => selectDomain(entry.slug)}
                        aria-pressed={domain === entry.slug}
                        className={cn(
                          'flex w-full cursor-pointer items-start justify-between gap-2 px-3.5 py-2.5 text-left transition-colors',
                          domain === entry.slug ? 'bg-accent-soft text-accent-hover' : 'text-ink-secondary hover:bg-sunken'
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block font-sans text-caption font-medium">{entry.name}</span>
                          <span className="tnum block text-caption text-ink-muted">
                            {entry.subdomainCount} subdomains
                          </span>
                        </span>
                        <span className="tnum shrink-0 text-caption text-ink-muted">{entry.topicCount}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </nav>

          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-end gap-3">
              <form
                className="min-w-56 flex-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  setSearch(q.trim());
                  setPage(1);
                }}
              >
                <SearchInput
                  ariaLabel="Search topics"
                  value={q}
                  placeholder="Search by name or definition…"
                  onValueChange={setQ}
                />
              </form>
              <label className="flex items-end gap-2">
                <span className="sr-only">Filter by difficulty</span>
                <Select
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
              </label>
            </div>

            {subdomain !== '' && (
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Chip tone="accent">
                  Research area: {topicsQuery.data?.topics[0]?.subdomainName ?? subdomain}
                  <button
                    type="button"
                    aria-label="Clear the research area filter"
                    className="ml-1 cursor-pointer text-ink-muted transition-colors hover:text-ink"
                    onClick={() => setParams(domain ? { domain } : {}, { replace: true })}
                  >
                    <X size={12} aria-hidden />
                  </button>
                </Chip>
                <span className="text-caption text-ink-muted">
                  Topics inside one sub-area. Clear it to see the whole domain.
                </span>
              </div>
            )}

            {topicsQuery.isLoading ? (
              <SkeletonRows rows={6} />
            ) : topicsQuery.error ? (
              <ErrorState error={topicsQuery.error} onRetry={() => void topicsQuery.refetch()} />
            ) : topicsQuery.data && topicsQuery.data.topics.length === 0 ? (
              <EmptyState
                title="No topics match those filters"
                description="Try clearing the search box or picking a different domain."
                action={
                  <button
                    type="button"
                    className="rounded-input border border-line bg-raised px-3 py-1.5 font-sans text-caption text-ink transition-colors hover:bg-sunken"
                    onClick={() => {
                      setQ('');
                      setSearch('');
                      setDifficulty('all');
                      setParams({}, { replace: true });
                    }}
                  >
                    Clear filters
                  </button>
                }
              />
            ) : (
              <>
                <ul className="grid gap-3 md:grid-cols-2">
                  {(topicsQuery.data?.topics ?? []).map((topic) => (
                    <li key={topic.slug}>
                      <Card as="article" variant="interactive" className="flex h-full flex-col gap-2">
                        <div className="flex items-start justify-between gap-2">
                          <h2 className="font-sans text-small-title font-semibold text-ink">
                            <Link to={`/explore/${topic.slug}`} className="transition-colors hover:text-accent-hover">
                              {topic.name}
                            </Link>
                          </h2>
                          <DifficultyChip difficulty={topic.difficulty} />
                        </div>
                        <p className="text-caption text-ink-muted">{topic.subdomainName}</p>
                        <p className="prose line-clamp-3 text-caption text-ink-secondary">{topic.definition}</p>
                        <div className="mt-auto flex items-center gap-3 pt-2 text-caption text-ink-muted">
                          <span className="tnum">{formatMinutes(topic.estMinutes)}</span>
                          <span className="tnum">{topic.lessonCount} lessons</span>
                          <span className="tnum">{topic.exerciseCount} exercises</span>
                          <Link
                            to={`/explore/${topic.slug}`}
                            className="ml-auto inline-flex items-center gap-1 text-accent-hover"
                          >
                            Open <ArrowRight size={13} aria-hidden />
                          </Link>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
                {topicsQuery.data && topicsQuery.data.totalPages > 1 && (
                  <Pagination
                    className="mt-5"
                    page={topicsQuery.data.page}
                    totalPages={topicsQuery.data.totalPages}
                    total={topicsQuery.data.total}
                    perPage={topicsQuery.data.perPage}
                    onPageChange={setPage}
                  />
                )}
              </>
            )}
          </div>
        </div>
      ) : (
        <section aria-label="Prerequisite map">
          {graphQuery.isLoading ? (
            <SkeletonRows rows={8} />
          ) : graphQuery.error ? (
            <ErrorState error={graphQuery.error} onRetry={() => void graphQuery.refetch()} />
          ) : graphQuery.data ? (
            <TopicMap nodes={graphQuery.data.nodes} edges={graphQuery.data.edges} />
          ) : null}
        </section>
      )}
    </>
  );
}
