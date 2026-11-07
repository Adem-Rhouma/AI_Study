import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, ListOrdered } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { CuratedCollection, CuratedCollectionDetail } from '../api/types';
import { DIFFICULTY_LABEL, formatDate, resourceTypeLabel } from '../lib/format';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, SectionHeader } from '../components/ui/Surface';
import { EmptyState, ErrorState, SkeletonRows } from '../components/ui/Feedback';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { Markdown } from '../components/content/Markdown';

export default function CollectionPage() {
  const { slug = '' } = useParams();

  const query = useQuery({
    queryKey: keys.curatedCollection(slug),
    queryFn: () => api.get<{ collection: CuratedCollectionDetail }>(`/library/collections/${slug}`)
  });
  const others = useQuery({
    queryKey: keys.curatedCollections,
    queryFn: () => api.get<{ collections: CuratedCollection[] }>('/library/collections')
  });

  if (query.isLoading) {
    return (
      <>
        <PageHeader eyebrow="Curated list" title="Loading collection…" />
        <SkeletonRows rows={6} />
      </>
    );
  }

  if (query.error || !query.data) {
    return (
      <>
        <PageHeader
          eyebrow="Curated list"
          title="Collection unavailable"
          crumbs={[{ label: 'Resources', to: '/resources' }, { label: 'Not found' }]}
        />
        <ErrorState
          error={query.error ?? new Error('This collection is not in the library.')}
          onRetry={() => void query.refetch()}
        />
      </>
    );
  }

  const collection = query.data.collection;
  const siblings = (others.data?.collections ?? []).filter((item) => item.slug !== collection.slug);

  return (
    <>
      <PageHeader
        eyebrow={collection.kind}
        title={collection.title}
        crumbs={[{ label: 'Resources', to: '/resources' }, { label: collection.title }]}
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="accent" icon={<ListOrdered size={12} aria-hidden />}>
            <span className="tnum">{collection.itemCount} entries</span>
          </Chip>
          <Chip>Last updated {formatDate(collection.updatedAt)}</Chip>
        </div>
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="min-w-0 space-y-5">
          {collection.description && (
            <Card>
              <Markdown source={collection.description} withIds={false} />
            </Card>
          )}

          {collection.items.length === 0 ? (
            <EmptyState
              title="This collection has no published entries yet"
              description="The list exists but every resource in it is still a draft."
            />
          ) : (
            <ol className="space-y-3">
              {collection.items.map((item) => (
                <li key={item.slug}>
                  <Card as="article" variant="interactive" className="flex gap-3">
                    <span
                      aria-hidden
                      className="grid size-8 shrink-0 place-items-center rounded-pill border border-line bg-sunken font-mono text-caption text-ink-muted tnum"
                    >
                      {item.position + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <Chip tone="accent">{resourceTypeLabel(item.type)}</Chip>
                        <DifficultyChip difficulty={item.difficulty} />
                        {item.publishedYear !== null && <Chip>{item.publishedYear}</Chip>}
                      </div>
                      <h2 className="mt-1.5 text-body font-semibold leading-snug text-ink">
                        <Link to={`/resources/${item.slug}`} className="transition-colors hover:text-accent-hover">
                          {item.title}
                        </Link>
                      </h2>
                      <p className="mt-0.5 text-caption text-ink-muted">
                        {[item.authors, item.publisher].filter(Boolean).join(' · ')}
                      </p>
                      {item.note && (
                        <p className="mt-1.5 text-caption leading-relaxed text-ink-secondary">{item.note}</p>
                      )}
                      <div className="mt-2 flex items-center gap-3">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-caption text-ink-secondary transition-colors hover:text-accent-hover"
                        >
                          <ExternalLink size={13} aria-hidden /> Source
                        </a>
                        <span className="text-caption text-ink-muted">{DIFFICULTY_LABEL[item.difficulty]}</span>
                      </div>
                    </div>
                  </Card>
                </li>
              ))}
            </ol>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <SectionHeader eyebrow="Curated lists" title="Other reading trails" />
            {siblings.length === 0 ? (
              <p className="mt-3 text-caption text-ink-muted">This is the only curated list right now.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {siblings.map((item) => (
                  <li key={item.slug}>
                    <Link
                      to={`/resources/collections/${item.slug}`}
                      className="block rounded-card border border-line bg-sunken px-3 py-2 text-caption text-ink transition-colors hover:border-[var(--border-strong)]"
                    >
                      {item.title}
                      <span className="block text-ink-muted tnum">{item.itemCount} entries</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
