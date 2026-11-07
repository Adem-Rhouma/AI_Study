import { useEffect, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  BookMarked,
  CalendarDays,
  ExternalLink,
  FileText,
  FlaskConical,
  History,
  Library,
  Telescope,
  X
} from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type {
  CompetitionRow,
  CuratedCollectionDetail,
  EventsPage as EventsPayload,
  Milestone,
  MilestoneResponse,
  MustReads,
  ResearchArea,
  ResearchPaperPage,
  TopicDetail
} from '../api/types';
import {
  eventStatusLabel,
  eventStatusTone,
  eventTypeLabel,
  formatPartialDate,
  milestoneKindLabel,
  resourceTypeLabel
} from '../lib/format';
import { cn } from '../lib/cn';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Divider, SectionHeader } from '../components/ui/Surface';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { Button, LinkButton } from '../components/ui/Button';
import { EmptyState, InlineAlert, QueryBoundary, SkeletonCard, SkeletonRows } from '../components/ui/Feedback';
import { Input, SearchInput, Select } from '../components/ui/Field';
import { Pagination } from '../components/ui/Pagination';
import { Tabs, TabPanel } from '../components/ui/Tabs';
import { Markdown } from '../components/content/Markdown';

const TABS = ['overview', 'papers', 'timeline'] as const;
type Tab = (typeof TABS)[number];
const isTab = (value: string | null): value is Tab => value !== null && (TABS as readonly string[]).includes(value);

/** The taxonomy has more sub-areas than fit one screen; the rest stay one click away. */
const AREA_PREVIEW = 9;

type PaperSort = 'newest' | 'oldest' | 'title';

export default function ResearchPage() {
  const [params, setParams] = useSearchParams();
  const urlTab = params.get('tab');
  const urlTopic = params.get('topic');

  const [tab, setTab] = useState<Tab>(isTab(urlTab) ? urlTab : 'overview');
  const [topic, setTopic] = useState(urlTopic ?? '');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [year, setYear] = useState('');
  const [sort, setSort] = useState<PaperSort>('newest');
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState('all');
  const [areaDomain, setAreaDomain] = useState('all');
  const [showAllAreas, setShowAllAreas] = useState(false);

  // Other pages link here with ?tab= and ?topic=; those links do not remount this component.
  useEffect(() => {
    if (isTab(urlTab)) setTab(urlTab);
    setTopic(urlTopic ?? '');
  }, [urlTab, urlTopic]);

  const areas = useQuery({
    queryKey: keys.researchAreas,
    queryFn: () => api.get<{ areas: ResearchArea[] }>('/research/topics')
  });

  const mustReads = useQuery({
    queryKey: keys.mustReads,
    queryFn: () => api.get<MustReads>('/research/must-reads')
  });

  const paperFilters = {
    q: search,
    sort,
    page,
    perPage: 12,
    ...(topic ? { topic } : {}),
    ...(year ? { year } : {})
  };
  const papers = useQuery({
    queryKey: keys.researchPapers(paperFilters),
    queryFn: () => api.get<ResearchPaperPage>('/research/papers', paperFilters),
    enabled: tab === 'papers',
    placeholderData: (previous) => previous
  });

  // The unfiltered copy exists so the kind/year pickers keep every option while a filter is on.
  const allMilestones = useQuery({
    queryKey: keys.milestones({ facetSource: true }),
    queryFn: () => api.get<MilestoneResponse>('/research/milestones', { limit: 200 }),
    enabled: tab === 'timeline'
  });
  const milestoneFilters = { limit: 200, ...(kind === 'all' ? {} : { kind }) };
  const milestones = useQuery({
    queryKey: keys.milestones(milestoneFilters),
    queryFn: () => api.get<MilestoneResponse>('/research/milestones', milestoneFilters),
    enabled: tab === 'timeline'
  });

  const topicLabel = useQuery({
    queryKey: keys.topic(topic),
    queryFn: () => api.get<TopicDetail>(`/curriculum/topics/${topic}`),
    enabled: topic !== ''
  });

  const events = useQuery({
    queryKey: keys.competitions({ perPage: 5 }),
    queryFn: () => api.get<EventsPayload>('/events', { perPage: 5 }),
    enabled: tab === 'overview'
  });

  function selectTopic(slug: string) {
    setTopic(slug);
    setTab('papers');
    setPage(1);
    setParams(slug ? { topic: slug, tab: 'papers' } : {}, { replace: true });
  }

  const allAreas = areas.data?.areas ?? [];
  const areaDomains = [...new Map(allAreas.map((area) => [area.domainSlug, area.domainName])).entries()]
    .map(([slug, name]) => ({ slug, name, count: allAreas.filter((area) => area.domainSlug === slug).length }));
  const filteredAreas = areaDomain === 'all' ? allAreas : allAreas.filter((area) => area.domainSlug === areaDomain);
  const visibleAreas = showAllAreas ? filteredAreas : filteredAreas.slice(0, AREA_PREVIEW);

  const milestoneOptions = allMilestones.data?.milestones ?? [];
  const kinds = [...new Set(milestoneOptions.map((item) => item.kind))];
  const years = [...new Set(milestoneOptions.map((item) => item.occurredOn.slice(0, 4)))].sort((a, b) => b.localeCompare(a));

  return (
    <>
      <PageHeader
        eyebrow="Research & Discover"
        title="Where the field is going"
        description="Papers and surveys from the library, a timeline of the results that changed the discipline, and the reading lists our editors keep. Everything here is curated by people and attributed to its source — nothing is generated on the fly."
        actions={
          <LinkButton variant="secondary" to="/research/events">
            <CalendarDays size={15} aria-hidden /> Competitions & events
          </LinkButton>
        }
      />

      <Tabs
        items={[
          { value: 'overview', label: 'Overview', icon: <Telescope size={14} aria-hidden /> },
          {
            value: 'papers',
            label: 'Papers & surveys',
            icon: <FileText size={14} aria-hidden />,
            ...(papers.data ? { count: papers.data.total } : {})
          },
          {
            value: 'timeline',
            label: 'Timeline',
            icon: <History size={14} aria-hidden />,
            ...(allMilestones.data ? { count: allMilestones.data.milestones.length } : {})
          }
        ]}
        value={tab}
        onValueChange={(value) => setTab(value as Tab)}
        className="mb-6"
        ariaLabel="Research sections"
      >
        <TabPanel value="overview">
          <div className="space-y-8">
            <section aria-labelledby="reading-lists" className="space-y-3">
              <SectionHeader
                eyebrow="Editorial"
                title="Reading lists"
                description="Two maintained lists: the shortest route in, and the current edge of the field."
              />
              <QueryBoundary
                state={mustReads}
                onRetry={() => void mustReads.refetch()}
                loading={<SkeletonCard lines={4} />}
              >
                <div className="grid gap-4 lg:grid-cols-2">
                  {[
                    { data: mustReads.data?.mustRead, icon: <BookMarked size={15} aria-hidden />, label: 'Must read' },
                    { data: mustReads.data?.frontier, icon: <Telescope size={15} aria-hidden />, label: 'Frontier' }
                  ].map((entry) =>
                    entry.data ? (
                      <ReadingListCard key={entry.label} label={entry.label} icon={entry.icon} collection={entry.data} />
                    ) : (
                      <Card key={entry.label} className="h-full">
                        <SectionHeader eyebrow={entry.label} title="Nothing published yet" />
                        <p className="mt-2 text-caption text-ink-muted">
                          This list has no published entries. It will appear here as soon as an editor fills it.
                        </p>
                      </Card>
                    )
                  )}
                </div>
              </QueryBoundary>
            </section>

            <section aria-labelledby="areas" className="space-y-3">
              <SectionHeader
                eyebrow="Active research areas"
                title="What people are working on"
                description="These areas are counted straight from the curriculum and the library, so a zero means the platform has no published material there yet — not that the area is unimportant."
              />
              <QueryBoundary
                state={areas}
                onRetry={() => void areas.refetch()}
                loading={<SkeletonRows rows={4} />}
                isEmpty={areas.data?.areas.length === 0}
                empty={<EmptyState title="No research areas yet" description="The curriculum has no published subdomains." />}
              >
                <>
                  <label className="flex items-center gap-2">
                    <span className="text-caption font-medium text-ink-secondary">Domain</span>
                    <Select
                      aria-label="Filter research areas by domain"
                      value={areaDomain}
                      onChange={(event) => {
                        setAreaDomain(event.target.value);
                        setShowAllAreas(false);
                      }}
                      className="w-72"
                    >
                      <option value="all">All domains ({areas.data?.areas.length ?? 0} areas)</option>
                      {areaDomains.map((entry) => (
                        <option key={entry.slug} value={entry.slug}>
                          {entry.name} ({entry.count})
                        </option>
                      ))}
                    </Select>
                  </label>
                  <div className="space-y-3">
                    <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {visibleAreas.map((area) => (
                        <li key={area.slug}>
                          <Card as="article" variant="interactive" className="flex h-full flex-col gap-2">
                            <span className="eyebrow text-caption">{area.domainName}</span>
                            <h3 className="font-sans text-small-title font-semibold leading-snug text-ink">
                              <Link
                                to={`/explore?subdomain=${area.slug}`}
                                className="transition-colors hover:text-accent-hover"
                              >
                                {area.name}
                              </Link>
                            </h3>
                            <p className="prose line-clamp-4 text-caption text-ink-secondary">{area.summary}</p>
                            <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-2">
                              <Chip icon={<FlaskConical size={12} aria-hidden />}>
                                <span className="tnum">{area.topicCount} topics</span>
                              </Chip>
                              <Chip icon={<Library size={12} aria-hidden />}>
                                <span className="tnum">{area.resourceCount} resources</span>
                              </Chip>
                            </div>
                          </Card>
                        </li>
                      ))}
                    </ul>
                    {filteredAreas.length > AREA_PREVIEW && (
                      <Button variant="ghost" size="sm" onClick={() => setShowAllAreas((current) => !current)}>
                        {showAllAreas
                          ? 'Show fewer areas'
                          : `Show all ${filteredAreas.length} areas in this domain`}
                      </Button>
                    )}
                  </div>
                </>
              </QueryBoundary>
            </section>

            <section aria-labelledby="events-teaser" className="space-y-3">
              <SectionHeader
                eyebrow="Competitions & events"
                title="Where to test yourself"
                description="Curated by hand. Dates and rules change every edition, so the organiser's own page is always the authority."
              />
              <QueryBoundary state={events} onRetry={() => void events.refetch()} loading={<SkeletonRows rows={2} />}>
                {events.data && (
                  <>
                    <InlineAlert tone="info">{events.data.disclaimer}</InlineAlert>
                    <ul className="grid gap-3 md:grid-cols-2">
                      {(events.data.events ?? []).map((event: CompetitionRow) => (
                        <li key={event.slug}>
                          <Card as="article" variant="interactive" className="flex h-full flex-col gap-1.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Chip tone={eventStatusTone(event.status)}>{eventStatusLabel(event.status)}</Chip>
                              <Chip>{eventTypeLabel(event.type)}</Chip>
                            </div>
                            <h3 className="font-sans text-small-title font-semibold text-ink">
                              <Link
                                to={`/research/events/${event.slug}`}
                                className="transition-colors hover:text-accent-hover"
                              >
                                {event.name}
                              </Link>
                            </h3>
                            <p className="text-caption text-ink-muted">{event.organizer}</p>
                          </Card>
                        </li>
                      ))}
                    </ul>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-caption text-ink-muted tnum">{events.data.total} entries in total</span>
                      <LinkButton variant="ghost" size="sm" to="/research/events">
                        See all competitions & events
                      </LinkButton>
                    </div>
                  </>
                )}
              </QueryBoundary>
            </section>
          </div>
        </TabPanel>

        <TabPanel value="papers">
          <div className="space-y-4">
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                setSearch(q.trim());
                setPage(1);
              }}
            >
              <SearchInput
                className="min-w-56 flex-1"
                ariaLabel="Search papers and surveys"
                value={q}
                placeholder="Search title, authors or abstract…"
                onValueChange={setQ}
              />
              <label className="flex items-end gap-2">
                <span className="text-caption font-medium text-ink-secondary">Year</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  min={1900}
                  max={2100}
                  placeholder="Any"
                  value={year}
                  onChange={(event) => {
                    setYear(event.target.value);
                    setPage(1);
                  }}
                  className="w-24"
                  aria-label="Filter by publication year"
                />
              </label>
              <label className="flex items-end gap-2">
                <span className="text-caption font-medium text-ink-secondary">Sort</span>
                <Select
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value as PaperSort);
                    setPage(1);
                  }}
                  className="w-36"
                  aria-label="Sort papers"
                >
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                  <option value="title">Title A–Z</option>
                </Select>
              </label>
              <Button type="submit" variant="secondary">
                Search
              </Button>
            </form>

            {(topic !== '' || search !== '' || year !== '') && (
              <div className="flex flex-wrap items-center gap-2">
                {topic !== '' && (
                  <Chip tone="accent">
                    Topic: {topicLabel.data?.name ?? topic}
                    <button
                      type="button"
                      aria-label="Clear the topic filter"
                      className="ml-1 cursor-pointer text-ink-muted transition-colors hover:text-ink"
                      onClick={() => selectTopic('')}
                    >
                      <X size={12} aria-hidden />
                    </button>
                  </Chip>
                )}
                {search !== '' && <Chip>Matching “{search}”</Chip>}
                {year !== '' && <Chip>Published in {year}</Chip>}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQ('');
                    setSearch('');
                    setYear('');
                    selectTopic('');
                  }}
                >
                  Clear all
                </Button>
              </div>
            )}

            <QueryBoundary
              state={papers}
              onRetry={() => void papers.refetch()}
              loading={<SkeletonRows rows={5} />}
              isEmpty={papers.data?.papers.length === 0}
              empty={
                <EmptyState
                  title="No papers match those filters"
                  description="Only published papers and surveys appear here. Try a broader search, or clear the topic filter."
                  action={
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        setQ('');
                        setSearch('');
                        setYear('');
                        selectTopic('');
                      }}
                    >
                      Clear filters
                    </Button>
                  }
                />
              }
            >
              <>
                <p className="text-caption text-ink-muted">
                  Attribution is recorded as the library holds it. Open an entry to see whether we re-checked it against
                  the source.
                </p>
                <ul className="space-y-3">
                  {(papers.data?.papers ?? []).map((paper) => (
                    <li key={paper.slug}>
                      <Card as="article" variant="interactive" className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Chip tone="accent">{resourceTypeLabel(paper.type)}</Chip>
                          <DifficultyChip difficulty={paper.difficulty} />
                          {paper.year !== null && <Chip className="tnum">{paper.year}</Chip>}
                          {paper.verified && <Chip tone="success">Checked</Chip>}
                        </div>
                        <h3 className="font-sans text-small-title font-semibold leading-snug text-ink">
                          <Link to={`/resources/${paper.slug}`} className="transition-colors hover:text-accent-hover">
                            {paper.title}
                          </Link>
                        </h3>
                        <p className="text-caption text-ink-muted">
                          {[paper.authors, paper.publisher].filter(Boolean).join(' · ') || 'Author not recorded'}
                        </p>
                        {paper.description && (
                          <p className="prose line-clamp-3 text-caption text-ink-secondary">{paper.description}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3">
                          <a
                            href={paper.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-caption text-ink-secondary transition-colors hover:text-accent-hover"
                          >
                            <ExternalLink size={13} aria-hidden /> Read at {paper.sourceName || 'the source'}
                          </a>
                          <Link
                            to={`/resources/${paper.slug}`}
                            className="inline-flex items-center gap-1 text-caption text-accent-hover"
                          >
                            Library entry
                          </Link>
                        </div>
                      </Card>
                    </li>
                  ))}
                </ul>
                {papers.data && (
                  <Pagination
                    className="mt-5"
                    page={papers.data.page}
                    totalPages={papers.data.totalPages}
                    total={papers.data.total}
                    perPage={papers.data.perPage}
                    onPageChange={setPage}
                  />
                )}
              </>
            </QueryBoundary>
          </div>
        </TabPanel>

        <TabPanel value="timeline">
          <div className="space-y-4">
            <InlineAlert tone="info" title="Curated by hand, not scraped">
              Every entry was written and dated by an editor and cites the source it came from. The timeline is a
              teaching aid: it shows why each result mattered, not a complete history of the field.
            </InlineAlert>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setKind('all')}
                aria-pressed={kind === 'all'}
                className={cn(
                  'cursor-pointer rounded-pill border px-3 py-1 text-caption font-medium transition-colors',
                  kind === 'all'
                    ? 'border-accent bg-accent text-on-accent'
                    : 'border-line bg-raised text-ink-secondary hover:bg-sunken'
                )}
              >
                All
              </button>
              {kinds.map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  aria-pressed={kind === value}
                  className={cn(
                    'cursor-pointer rounded-pill border px-3 py-1 text-caption font-medium transition-colors',
                    kind === value
                      ? 'border-accent bg-accent text-on-accent'
                      : 'border-line bg-raised text-ink-secondary hover:bg-sunken'
                  )}
                >
                  {milestoneKindLabel(value)}
                </button>
              ))}
            </div>

            <QueryBoundary
              state={milestones}
              onRetry={() => void milestones.refetch()}
              loading={<SkeletonRows rows={6} />}
              isEmpty={milestones.data?.milestones.length === 0}
              empty={
                <EmptyState
                  title="Nothing recorded for that filter"
                  description="This kind has no curated entries yet."
                  action={
                    <Button variant="secondary" size="sm" onClick={() => setKind('all')}>
                      Show everything
                    </Button>
                  }
                />
              }
            >
              <MilestoneTimeline milestones={milestones.data?.milestones ?? []} onTopicFilter={selectTopic} activeTopic={topic} />
            </QueryBoundary>

            {years.length > 0 && (
              <>
                <Divider label="Jump to a year" />
                <div className="flex flex-wrap gap-1.5">
                  {years.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setYear(value);
                        setTab('papers');
                        setPage(1);
                      }}
                      className="cursor-pointer rounded-input border border-line bg-raised px-2.5 py-1 text-caption text-ink-secondary tnum transition-colors hover:bg-sunken hover:text-ink"
                    >
                      {value}
                    </button>
                  ))}
                </div>
                <p className="text-caption text-ink-muted">
                  Years open the papers list filtered to that publication year.
                </p>
              </>
            )}
          </div>
        </TabPanel>
      </Tabs>
    </>
  );
}

function ReadingListCard({
  label,
  icon,
  collection
}: {
  label: string;
  icon: ReactNode;
  collection: CuratedCollectionDetail;
}) {
  return (
    <Card as="article" className="flex h-full flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="eyebrow flex items-center gap-1.5 text-caption">
            {icon}
            {label}
          </span>
          <h3 className="mt-1 font-sans text-small-title font-semibold leading-snug text-ink">{collection.title}</h3>
        </div>
        <Chip className="tnum shrink-0">{collection.itemCount}</Chip>
      </div>
      {collection.description && <Markdown source={collection.description} withIds={false} />}
      {collection.items.length > 0 && (
        <ol className="space-y-1.5">
          {collection.items.slice(0, 5).map((item) => (
            <li key={item.slug} className="flex gap-2 text-caption">
              <span aria-hidden className="shrink-0 text-ink-muted tnum">
                {item.position + 1}.
              </span>
              <span className="min-w-0">
                <Link to={`/resources/${item.slug}`} className="text-ink transition-colors hover:text-accent-hover">
                  {item.title}
                </Link>
                <span className="block text-ink-muted">
                  {[resourceTypeLabel(item.type), item.authors].filter(Boolean).join(' · ')}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
      <LinkButton
        variant="ghost"
        size="sm"
        to={`/resources/collections/${collection.slug}`}
        className="mt-auto self-start"
      >
        Open the full list
      </LinkButton>
    </Card>
  );
}

function MilestoneTimeline({
  milestones,
  onTopicFilter,
  activeTopic
}: {
  milestones: Milestone[];
  onTopicFilter: (slug: string) => void;
  activeTopic: string;
}) {
  const groups = new Map<string, Milestone[]>();
  for (const milestone of milestones) {
    const year = milestone.occurredOn.slice(0, 4);
    groups.set(year, [...(groups.get(year) ?? []), milestone]);
  }

  return (
    <ol className="space-y-6">
      {[...groups.entries()].map(([year, items]) => (
        <li key={year}>
          <h3 className="mb-2 font-sans text-small-title font-semibold text-ink tnum">{year}</h3>
          <ol className="relative space-y-3 border-l border-line pl-5">
            {items.map((milestone) => {
              const topicSlug = milestone.topicSlug;
              return (
              <li key={milestone.id} className="relative">
                <span
                  aria-hidden
                  className="absolute -left-[26px] top-2 size-2.5 rounded-full border border-line bg-accent"
                />
                <Card as="article" className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Chip>{milestoneKindLabel(milestone.kind)}</Chip>
                    <Chip className="tnum">{formatPartialDate(milestone.occurredOn)}</Chip>
                    {milestone.sourceName && <Chip tone="neutral">Source: {milestone.sourceName}</Chip>}
                  </div>
                  <h4 className="font-sans text-small-title font-semibold leading-snug text-ink">{milestone.title}</h4>
                  {milestone.summary && (
                    <p className="prose text-caption leading-relaxed text-ink-secondary">{milestone.summary}</p>
                  )}
                  <div className="flex flex-wrap items-center gap-3">
                    {milestone.url && (
                      <a
                        href={milestone.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-caption text-ink-secondary transition-colors hover:text-accent-hover"
                      >
                        <ExternalLink size={13} aria-hidden /> Original source
                      </a>
                    )}
                    {topicSlug && milestone.topicName && (
                      <>
                        <Link
                          to={`/explore/${topicSlug}`}
                          className="text-caption text-accent-hover transition-colors hover:underline"
                        >
                          Topic: {milestone.topicName}
                        </Link>
                        {topicSlug !== activeTopic && (
                          <button
                            type="button"
                            onClick={() => onTopicFilter(topicSlug)}
                            className="cursor-pointer text-caption text-ink-muted transition-colors hover:text-ink"
                          >
                            Find papers on this
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </Card>
              </li>
              );
            })}
          </ol>
        </li>
      ))}
    </ol>
  );
}
