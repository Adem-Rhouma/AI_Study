import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { Layers, Search, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import { SEARCH_SCOPES, type SearchHit, type SearchResponse, type SearchScope } from '../api/types';
import { groupSearchHits, highlightChunks, SEARCH_HIT_LABEL, SEARCH_SCOPE_LABEL, hitRoute, searchTokens } from '../lib/search';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, SectionHeader } from '../components/ui/Surface';
import { DifficultyChip } from '../components/ui/Chip';
import { Button } from '../components/ui/Button';
import { EmptyState, ErrorState, InlineAlert, SkeletonRows } from '../components/ui/Feedback';
import { SearchInput } from '../components/ui/Field';
import { Tabs } from '../components/ui/Tabs';

const PAGE_SIZE = 30;

const isScope = (value: string | null): value is SearchScope =>
  (SEARCH_SCOPES as readonly string[]).includes(value ?? '');

export default function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q')?.trim() ?? '';
  const urlScope = params.get('scope');
  const scope: SearchScope = isScope(urlScope) ? urlScope : 'all';

  const [term, setTerm] = useState(q);
  useEffect(() => setTerm(q), [q]);

  const query = useInfiniteQuery({
    queryKey: keys.search(q, scope, PAGE_SIZE),
    queryFn: ({ pageParam }) =>
      api.get<SearchResponse>('/search', { q, scope, limit: PAGE_SIZE, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hits.length === PAGE_SIZE ? allPages.length + 1 : undefined,
    placeholderData: (previous) => previous
  });

  const pages = query.data?.pages ?? [];
  const hits = useMemo(() => pages.flatMap((page) => page.hits), [pages]);
  const groups = useMemo(() => groupSearchHits(hits), [hits]);
  const lastPage = pages[pages.length - 1];
  const tokens = useMemo(() => searchTokens(q), [q]);
  const isSuggesting = q === '';

  function submit(event: FormEvent) {
    event.preventDefault();
    const next = term.trim();
    setParams(next === '' ? (scope === 'all' ? {} : { scope }) : { q: next, ...(scope === 'all' ? {} : { scope }) });
  }

  function changeScope(next: string) {
    const chosen = isScope(next) ? next : 'all';
    const search: Record<string, string> = {};
    if (q !== '') search.q = q;
    if (chosen !== 'all') search.scope = chosen;
    setParams(search);
  }

  return (
    <>
      <PageHeader
        eyebrow="Find"
        title="Search everything"
        description="Topics, lessons (including their bodies), problems, resources, courses, learning paths and curated collections — all indexed from the content this platform actually holds."
      />

      <div className="space-y-5">
        <form onSubmit={submit} role="search" className="flex flex-wrap items-center gap-3">
          <SearchInput
            className="min-w-0 flex-1 sm:max-w-xl"
            ariaLabel="Search the platform"
            value={term}
            placeholder="Try “attention”, “gradient descent” or “quantisation”…"
            onValueChange={setTerm}
          />
          <Button type="submit" variant="primary">
            <Search size={15} aria-hidden />
            Search
          </Button>
          {q !== '' && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setTerm('');
                setParams(scope === 'all' ? {} : { scope });
              }}
            >
              Clear
            </Button>
          )}
        </form>

        <Tabs
          variant="pill"
          ariaLabel="Search within"
          value={scope}
          onValueChange={changeScope}
          items={SEARCH_SCOPES.map((value) => ({ value, label: SEARCH_SCOPE_LABEL[value] }))}
        />

        {query.error ? (
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        ) : query.isLoading ? (
          <SkeletonRows rows={6} />
        ) : hits.length === 0 ? (
          <NoResults q={q} scope={scope} onClear={() => changeScope('all')} />
        ) : (
          <>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-caption text-ink-muted">
              <p role="status" className="tnum">
                {isSuggesting
                  ? `${hits.length} starting ${hits.length === 1 ? 'point' : 'points'}`
                  : `${hits.length} ${hits.length === 1 ? 'match' : 'matches'} for “${q}”`}
              </p>
              {lastPage && !isSuggesting && <p className="tnum">in {lastPage.tookMs} ms</p>}
              {scope !== 'all' && <p>limited to {SEARCH_SCOPE_LABEL[scope].toLowerCase()}</p>}
            </div>

            {isSuggesting ? (
              <InlineAlert tone="info" title="Nothing searched yet">
                Below are the topics with the most published lessons right now and the paths most
                learners start from. They are derived from the current curriculum, not hand-picked.
              </InlineAlert>
            ) : (
              lastPage?.usedFallback === true && (
                <InlineAlert tone="info" title="Plain text match">
                  The ranked full-text index found nothing for that wording (it needs at least three
                  letters and real words), so these are direct title-and-body matches instead.
                </InlineAlert>
              )
            )}

            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.type} aria-label={group.label} className="space-y-3">
                  <SectionHeader eyebrow={group.type === 'exercises' ? 'Problem arena' : undefined} title={group.label} />
                  <ul className="grid gap-3 sm:grid-cols-2">
                    {group.items.map((hit) => (
                      <li key={`${hit.type}:${hit.slug}`}>
                        <HitCard hit={hit} tokens={tokens} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>

            {query.hasNextPage && (
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  onClick={() => void query.fetchNextPage()}
                  loading={query.isFetchingNextPage}
                >
                  <Layers size={15} aria-hidden />
                  Load the next {PAGE_SIZE}
                </Button>
                <p className="text-caption text-ink-muted">
                  Showing {hits.length}. Narrow the query or pick a section to reach the rest faster.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
}

function HitCard({ hit, tokens }: { hit: SearchHit; tokens: string[] }) {
  return (
    <Card
      as="article"
      variant="interactive"
      className="flex h-full flex-col gap-1.5"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="eyebrow text-caption">{SEARCH_HIT_LABEL[hit.type]}</span>
        {hit.difficulty && <DifficultyChip difficulty={hit.difficulty} />}
      </div>
      <h3 className="text-body font-semibold leading-snug text-ink">
        {/* The label repeats the visible title plus the kind, so highlighting cannot break the name. */}
        <Link
          to={hitRoute(hit)}
          aria-label={`${hit.title} — open ${SEARCH_HIT_LABEL[hit.type]}`}
          className="transition-colors hover:text-accent-hover"
        >
          <Highlight text={hit.title} tokens={tokens} />
        </Link>
      </h3>
      {hit.context && <p className="text-caption text-ink-muted">{hit.context}</p>}
      {hit.snippet !== '' && (
        <p className="line-clamp-3 text-caption leading-relaxed text-ink-secondary">
          <Highlight text={hit.snippet} tokens={tokens} />
        </p>
      )}
    </Card>
  );
}

/**
 * Matched chunks become `<mark>`; the rest stay bare text nodes. Wrapping them in a `<span>` would
 * trim the whitespace at chunk boundaries and a screen reader would announce "Attentionmechanics".
 */
function Highlight({ text, tokens }: { text: string; tokens: string[] }) {
  return (
    <>
      {highlightChunks(text, tokens).map(([chunk, matched], index) =>
        matched ? (
          <mark key={index} className="rounded-[3px] bg-[var(--accent-soft)] px-0.5 text-ink">
            {chunk}
          </mark>
        ) : (
          <Fragment key={index}>{chunk}</Fragment>
        )
      )}
    </>
  );
}

function NoResults({ q, scope, onClear }: { q: string; scope: SearchScope; onClear: () => void }) {
  if (q === '') {
    return (
      <EmptyState
        icon={<Sparkles size={18} aria-hidden />}
        title="Search the whole curriculum"
        description="Type a term, a concept or the title of a course. Three letters or more use the ranked index; anything shorter falls back to plain text matching."
      />
    );
  }
  return (
    <EmptyState
      title={scope === 'all' ? `Nothing matches “${q}”` : `No ${SEARCH_SCOPE_LABEL[scope].toLowerCase()} match “${q}”`}
      description={
        scope === 'all'
          ? 'The index only covers published content, so a term that exists nowhere in the curriculum will return nothing at all. Try a broader word, or the name of the idea rather than its notation.'
          : 'That section is filtered. Clear the filter to search across everything.'
      }
      action={
        scope !== 'all' ? (
          <Button variant="secondary" size="sm" onClick={onClear}>
            Search across everything
          </Button>
        ) : undefined
      }
    />
  );
}
