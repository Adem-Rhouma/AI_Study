import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookMarked, Bookmark, BookmarkCheck, ExternalLink, Library, ShieldCheck, Tag, X } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type {
  BookmarkResult,
  CuratedCollection,
  Difficulty,
  ResourceFacets,
  ResourcePage,
  ResourceType
} from '../api/types';
import { useSession } from '../lib/session';
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_ORDER,
  formatMinutes,
  resourceTypeLabel,
  RESOURCE_TYPE_ORDER
} from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, SectionHeader } from '../components/ui/Surface';
import { EmptyState, ErrorState, errorMessage, InlineAlert, SkeletonCard } from '../components/ui/Feedback';
import { Button, IconButton, LinkButton } from '../components/ui/Button';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { SearchInput, Select } from '../components/ui/Field';
import { Pagination } from '../components/ui/Pagination';
import { MyCollections } from '../components/library/MyCollections';

type Sort = 'relevance' | 'newest' | 'oldest' | 'title';

const SORT_LABEL: Record<Sort, string> = {
  relevance: 'Most relevant',
  newest: 'Newest first',
  oldest: 'Oldest first',
  title: 'Title A–Z'
};

export default function ResourcesPage() {
  const { isAuthenticated } = useSession();
  const queryClient = useQueryClient();

  const [params, setParams] = useSearchParams();
  const urlType = params.get('type');
  const urlTag = params.get('tag');

  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [type, setType] = useState<ResourceType | 'all'>(
    urlType && RESOURCE_TYPE_ORDER.includes(urlType) ? (urlType as ResourceType) : 'all'
  );
  const [tag, setTag] = useState(urlTag ?? '');
  const [difficulty, setDifficulty] = useState<Difficulty | 'all'>('all');
  const [sort, setSort] = useState<Sort>('relevance');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(12);

  // Resource pages link here with ?type= and ?tag=, and those links do not remount this component.
  useEffect(() => {
    if (urlType && RESOURCE_TYPE_ORDER.includes(urlType)) setType(urlType as ResourceType);
    setTag(urlTag ?? '');
    setPage(1);
  }, [urlType, urlTag]);

  const filters = { q: search, type, difficulty, sort, page, perPage, ...(tag ? { tag } : {}) };
  const resources = useQuery({
    queryKey: keys.resources(filters),
    queryFn: () => api.get<ResourcePage>('/library/resources', filters),
    placeholderData: (previous) => previous
  });
  const facets = useQuery({
    queryKey: keys.resourceFacets,
    queryFn: () => api.get<ResourceFacets>('/library/facets')
  });
  const collections = useQuery({
    queryKey: keys.curatedCollections,
    queryFn: () => api.get<{ collections: CuratedCollection[] }>('/library/collections')
  });

  const bookmark = useMutation({
    mutationFn: ({ slug, next }: { slug: string; next: boolean }) =>
      next
        ? api.post<BookmarkResult>(`/library/resources/${slug}/bookmark`)
        : api.del<BookmarkResult>(`/library/resources/${slug}/bookmark`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.resourcesAll });
      void queryClient.invalidateQueries({ queryKey: keys.bookmarks });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    }
  });

  const items = resources.data?.items ?? [];
  const curated = collections.data?.collections ?? [];

  const resetFilters = () => {
    setQ('');
    setSearch('');
    setType('all');
    setDifficulty('all');
    setSort('relevance');
    if (urlTag) clearTag();
    setPage(1);
  };

  const clearTag = () => {
    const next = new URLSearchParams(params);
    next.delete('tag');
    setParams(next, { replace: true });
  };

  return (
    <>
      <PageHeader
        eyebrow="Resources"
        title="The library"
        description="Books, papers, surveys, courses, lecture notes and tools — each entry recorded with its authors, publisher and year, and marked whether it was checked against the source."
      />

      {curated.length > 0 && (
        <section className="mb-8" aria-labelledby="curated-heading">
          <SectionHeader
            eyebrow="Curated lists"
            title={<span id="curated-heading">Reading trails</span>}
            description="Ordered lists assembled by hand. The order is an argument about what to read first, not a popularity ranking."
          />
          <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {curated.map((collection) => (
              <li key={collection.slug}>
                <Card as="article" variant="interactive" className="flex h-full flex-col gap-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-body font-semibold text-ink">
                      <Link
                        to={`/resources/collections/${collection.slug}`}
                        className="transition-colors hover:text-accent-hover"
                      >
                        {collection.title}
                      </Link>
                    </h3>
                    <Chip tone="accent" icon={<BookMarked size={12} aria-hidden />}>
                      <span className="tnum">{collection.itemCount}</span>
                    </Chip>
                  </div>
                  <p className="line-clamp-3 text-caption leading-relaxed text-ink-secondary">
                    {collection.description}
                  </p>
                  <span className="mt-auto pt-1 text-caption text-ink-muted">{collection.kind}</span>
                </Card>
              </li>
            ))}
          </ul>
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
            ariaLabel="Search the library"
            value={q}
            placeholder="Search by title, description, author or publisher…"
            onValueChange={setQ}
          />
        </form>
        <Select
          aria-label="Filter by resource type"
          value={type}
          onChange={(event) => {
            setType(event.target.value as ResourceType | 'all');
            setPage(1);
          }}
          className="w-44"
        >
          <option value="all">All types</option>
          {(facets.data?.types ?? []).map((facet) => (
            <option key={facet.value} value={facet.value}>
              {resourceTypeLabel(facet.value)} ({facet.count})
            </option>
          ))}
        </Select>
        <Select
          aria-label="Filter by difficulty"
          value={difficulty}
          onChange={(event) => {
            setDifficulty(event.target.value as Difficulty | 'all');
            setPage(1);
          }}
          className="w-44"
        >
          <option value="all">All difficulties</option>
          {(facets.data?.difficulties ?? DIFFICULTY_ORDER.map((level) => ({ value: level, count: 0 }))).map(
            (facet) => (
              <option key={facet.value} value={facet.value}>
                {DIFFICULTY_LABEL[facet.value as Difficulty]}
                {facet.count > 0 ? ` (${facet.count})` : ''}
              </option>
            )
          )}
        </Select>
        <Select
          aria-label="Sort resources"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as Sort);
            setPage(1);
          }}
          className="w-40"
        >
          {(Object.keys(SORT_LABEL) as Sort[]).map((value) => (
            <option key={value} value={value}>
              {SORT_LABEL[value]}
            </option>
          ))}
        </Select>
      </div>

      {tag && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-caption text-ink-secondary">Filtered to tag</span>
          <Chip tone="accent" icon={<Tag size={12} aria-hidden />}>
            {tag}
          </Chip>
          <button
            type="button"
            onClick={clearTag}
            className="inline-flex items-center gap-1 rounded-pill border border-line px-2 py-0.5 text-caption text-ink-secondary transition-colors hover:border-[var(--border-strong)] hover:text-ink"
          >
            <X size={12} aria-hidden /> Clear
          </button>
        </div>
      )}

      {bookmark.isError && (
        <InlineAlert tone="danger" className="mb-4">
          {errorMessage(bookmark.error)}
        </InlineAlert>
      )}

      {resources.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <SkeletonCard key={index} lines={4} />
          ))}
        </div>
      ) : resources.error ? (
        <ErrorState error={resources.error} onRetry={() => void resources.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Library size={18} aria-hidden />}
          title="Nothing in the library matches those filters"
          description="Try a broader search term, or clear the type and difficulty filters."
          action={
            <Button variant="secondary" size="sm" onClick={resetFilters}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((resource) => (
              <li key={resource.slug}>
                <Card as="article" variant="interactive" className="flex h-full flex-col gap-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Chip tone="accent">{resourceTypeLabel(resource.type)}</Chip>
                      {resource.verified && (
                        <Chip tone="success" icon={<ShieldCheck size={12} aria-hidden />}>
                          Checked
                        </Chip>
                      )}
                    </div>
                    {isAuthenticated && (
                      <IconButton
                        label={resource.bookmarked ? `Remove bookmark from ${resource.title}` : `Bookmark ${resource.title}`}
                        size="sm"
                        disabled={bookmark.isPending}
                        onClick={() => bookmark.mutate({ slug: resource.slug, next: !resource.bookmarked })}
                      >
                        {resource.bookmarked ? (
                          <BookmarkCheck size={15} className="text-accent" aria-hidden />
                        ) : (
                          <Bookmark size={15} aria-hidden />
                        )}
                      </IconButton>
                    )}
                  </div>

                  <h2 className="text-h4 font-semibold leading-snug text-ink">
                    <Link to={`/resources/${resource.slug}`} className="transition-colors hover:text-accent-hover">
                      {resource.title}
                    </Link>
                  </h2>
                  <p className="line-clamp-3 text-caption leading-relaxed text-ink-secondary">
                    {resource.description}
                  </p>

                  <dl className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ink-muted">
                    {resource.authors && <dd className="truncate">{resource.authors}</dd>}
                    {resource.publishedYear !== null && <dd className="tnum">{resource.publishedYear}</dd>}
                    {resource.publisher && <dd className="truncate">{resource.publisher}</dd>}
                    {resource.estMinutes !== null && <dd className="tnum">{formatMinutes(resource.estMinutes)}</dd>}
                  </dl>

                  <div className="mt-auto space-y-2 pt-1">
                    <DifficultyChip difficulty={resource.difficulty} />
                    {resource.topics.length > 0 && (
                      <p className="truncate text-caption text-ink-muted">{resource.topics.join(' · ')}</p>
                    )}
                    <div className="flex items-center gap-2">
                      <LinkButton to={`/resources/${resource.slug}`} variant="secondary" size="sm">
                        Details
                      </LinkButton>
                      <a
                        href={resource.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-caption text-ink-secondary transition-colors hover:text-accent-hover"
                      >
                        <ExternalLink size={13} aria-hidden /> Source
                      </a>
                    </div>
                  </div>
                </Card>
              </li>
            ))}
          </ul>

          {resources.data && (
            <Pagination
              className="mt-6"
              page={resources.data.page}
              totalPages={resources.data.totalPages}
              total={resources.data.total}
              perPage={resources.data.perPage}
              onPageChange={setPage}
              onPerPageChange={setPerPage}
            />
          )}
        </>
      )}

      {isAuthenticated && (
        <div className="mt-8">
          <MyCollections />
        </div>
      )}
    </>
  );
}
