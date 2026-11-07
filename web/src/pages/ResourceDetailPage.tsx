import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark, BookmarkCheck, ExternalLink, FolderInput, ShieldCheck } from 'lucide-react';
import { api } from '../api/client';
import { keys } from '../api/keys';
import type { BookmarkResult, ResourceDetail, UserCollection } from '../api/types';
import { useSession } from '../lib/session';
import { DIFFICULTY_LABEL, formatDate, formatMinutes, resourceTypeLabel } from '../lib/format';
import { Breadcrumbs, PageHeader } from '../components/layout/PageHeader';
import { Card, Divider, SectionHeader } from '../components/ui/Surface';
import { ErrorState, errorMessage, InlineAlert, SkeletonRows } from '../components/ui/Feedback';
import { AnchorButton, Button, LinkButton } from '../components/ui/Button';
import { Chip, DifficultyChip } from '../components/ui/Chip';
import { Field, Input, Select } from '../components/ui/Field';
import { Markdown } from '../components/content/Markdown';

export default function ResourceDetailPage() {
  const { slug = '' } = useParams();
  const { isAuthenticated } = useSession();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: keys.resource(slug),
    queryFn: () => api.get<{ resource: ResourceDetail }>(`/library/resources/${slug}`)
  });

  const bookmark = useMutation({
    mutationFn: (next: boolean) =>
      next
        ? api.post<BookmarkResult>(`/library/resources/${slug}/bookmark`)
        : api.del<BookmarkResult>(`/library/resources/${slug}/bookmark`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.resourcesAll });
      void queryClient.invalidateQueries({ queryKey: keys.bookmarks });
      void queryClient.invalidateQueries({ queryKey: keys.dashboard });
    }
  });

  if (query.isLoading) {
    return (
      <>
        <PageHeader eyebrow="Resources" title="Loading resource…" />
        <SkeletonRows rows={6} />
      </>
    );
  }

  if (query.error || !query.data) {
    return (
      <>
        <Breadcrumbs items={[{ label: 'Resources', to: '/resources' }, { label: 'Not found' }]} />
        <PageHeader eyebrow="Resources" title="Resource unavailable" />
        <ErrorState error={query.error ?? new Error('This resource is not in the library.')} onRetry={() => void query.refetch()} />
      </>
    );
  }

  const resource = query.data.resource;

  return (
    <>
      <PageHeader
        eyebrow={resourceTypeLabel(resource.type)}
        title={resource.title}
        crumbs={[{ label: 'Resources', to: '/resources' }, { label: resource.title }]}
        actions={
          <>
            <AnchorButton href={resource.url} variant="primary" size="sm">
              <ExternalLink size={14} aria-hidden /> Open source
            </AnchorButton>
            {isAuthenticated && (
              <Button
                size="sm"
                variant="secondary"
                loading={bookmark.isPending}
                iconLeft={
                  resource.bookmarked ? (
                    <BookmarkCheck size={14} aria-hidden />
                  ) : (
                    <Bookmark size={14} aria-hidden />
                  )
                }
                onClick={() => bookmark.mutate(!resource.bookmarked)}
              >
                {resource.bookmarked ? 'Bookmarked' : 'Bookmark'}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip tone="accent">{resourceTypeLabel(resource.type)}</Chip>
          <DifficultyChip difficulty={resource.difficulty} />
          {resource.verified && (
            <Chip tone="success" icon={<ShieldCheck size={12} aria-hidden />}>
              Checked against the source
            </Chip>
          )}
          {resource.isCurated && <Chip tone="info">Curated</Chip>}
          {resource.publishedYear !== null && <Chip>{resource.publishedYear}</Chip>}
        </div>
      </PageHeader>

      {resource.status !== 'published' && (
        <InlineAlert tone="warning" className="mb-5" title="Not published">
          Visible to you because your account has author or admin rights. Learners cannot see this entry yet.
        </InlineAlert>
      )}
      {bookmark.isError && (
        <InlineAlert tone="danger" className="mb-5">
          {errorMessage(bookmark.error)}
        </InlineAlert>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-5">
          <Card>
            <Markdown source={resource.description} withIds={false} />
            <Divider className="my-4" label="Bibliographic record" />
            <dl className="grid gap-x-6 gap-y-2 text-caption sm:grid-cols-2">
              <MetaRow label="Authors" value={resource.authors} />
              <MetaRow label="Publisher" value={resource.publisher} />
              <MetaRow label="Year" value={resource.publishedYear === null ? '—' : String(resource.publishedYear)} />
              <MetaRow label="Source" value={resource.sourceName} />
              <MetaRow label="Estimated time" value={resource.estMinutes === null ? '—' : formatMinutes(resource.estMinutes)} />
              <MetaRow label="Added" value={formatDate(resource.createdAt)} />
            </dl>
            <p className="mt-3 text-caption leading-relaxed text-ink-muted">
              {resource.verified
                ? 'This entry was checked against the source before it was published here.'
                : 'This entry has not been independently re-checked against the source; treat the bibliographic details as recorded, not verified.'}
            </p>
          </Card>

          {resource.similar.length > 0 && (
            <Card>
              <SectionHeader
                eyebrow="Related by topic"
                title="Read alongside"
                description="Ranked by how many curriculum topics the two entries share — not by citation count."
              />
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {resource.similar.map((item) => (
                  <li key={item.slug}>
                    <Link
                      to={`/resources/${item.slug}`}
                      className="block rounded-card border border-line bg-sunken px-3 py-2 transition-colors hover:border-[var(--border-strong)]"
                    >
                      <span className="block text-caption font-medium text-ink">{item.title}</span>
                      <span className="block text-caption text-ink-muted">
                        {resourceTypeLabel(item.type)} · {item.sharedTopics} shared{' '}
                        {item.sharedTopics === 1 ? 'topic' : 'topics'}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {isAuthenticated && <SaveToCollection resourceSlug={resource.slug} />}
        </div>

        <aside className="space-y-4">
          <Card>
            <SectionHeader eyebrow="Curriculum" title="Topics this covers" />
            {resource.relatedTopics.length === 0 ? (
              <p className="mt-3 text-caption text-ink-muted">Not linked to a curriculum topic yet.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {resource.relatedTopics.map((topic) => (
                  <li key={topic.slug}>
                    <Link
                      to={`/explore/${topic.slug}`}
                      className="block rounded-card border border-line bg-sunken px-3 py-2 text-caption text-ink transition-colors hover:border-[var(--border-strong)]"
                    >
                      {topic.name}
                      <span className="block text-ink-muted">{DIFFICULTY_LABEL[topic.difficulty]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {resource.appearsInCollections.length > 0 && (
            <Card>
              <SectionHeader eyebrow="Editorial" title="Appears in" />
              <ul className="mt-3 space-y-1.5">
                {resource.appearsInCollections.map((collection) => (
                  <li key={collection.slug}>
                    <Link
                      to={`/resources/collections/${collection.slug}`}
                      className="text-caption text-ink-secondary transition-colors hover:text-accent-hover"
                    >
                      {collection.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {resource.tags.length > 0 && (
            <Card>
              <SectionHeader eyebrow="Tags" title="Filed under" />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {resource.tags.map((tag) => (
                  <LinkButton key={tag} to={`/resources?tag=${encodeURIComponent(tag)}`} variant="ghost" size="sm">
                    {tag}
                  </LinkButton>
                ))}
              </div>
            </Card>
          )}

          <Card>
            <SectionHeader eyebrow="More" title="Browse the library" />
            <div className="mt-3 flex flex-wrap gap-2">
              <LinkButton to="/resources" variant="secondary" size="sm">
                All resources
              </LinkButton>
              <LinkButton to={`/resources?type=${resource.type}`} variant="ghost" size="sm">
                More {resourceTypeLabel(resource.type).toLowerCase()}
              </LinkButton>
            </div>
          </Card>
        </aside>
      </div>
    </>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-ink">{value === '' ? '—' : value}</dd>
    </div>
  );
}

function SaveToCollection({ resourceSlug }: { resourceSlug: string }) {
  const queryClient = useQueryClient();
  const [collectionId, setCollectionId] = useState('');
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const collections = useQuery({
    queryKey: keys.myCollections,
    queryFn: () => api.get<{ collections: UserCollection[] }>('/library/mine')
  });

  const list = collections.data?.collections ?? [];
  useEffect(() => {
    if (collectionId === '' && list.length > 0) setCollectionId(String(list[0].id));
  }, [collectionId, list]);

  const add = useMutation({
    mutationFn: () =>
      api.post(`/library/mine/${collectionId}/items`, { resourceSlug, note: note.trim() }),
    onSuccess: () => {
      setNote('');
      setFeedback('Saved to your collection.');
      void queryClient.invalidateQueries({ queryKey: keys.myCollections });
      void queryClient.invalidateQueries({ queryKey: keys.myCollection(Number(collectionId)) });
      void queryClient.invalidateQueries({ queryKey: keys.bookmarks });
    },
    onError: (error) => setFeedback(errorMessage(error))
  });

  return (
    <Card>
      <SectionHeader
        eyebrow="Your library"
        title="Save to a collection"
        description="Collections are yours. Adding an entry here does not change the resource or anyone else's library."
      />
      {collections.isLoading ? (
        <SkeletonRows rows={2} className="mt-3" />
      ) : list.length === 0 ? (
        <InlineAlert tone="info" className="mt-3" title="No collections yet">
          Create one on the <Link to="/resources" className="underline">library page</Link> and it will appear here.
        </InlineAlert>
      ) : (
        <form
          className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            setFeedback(null);
            add.mutate();
          }}
        >
          <Field label="Collection" htmlFor="save-collection">
            <Select
              id="save-collection"
              value={collectionId}
              onChange={(event) => setCollectionId(event.target.value)}
            >
              {list.map((collection) => (
                <option key={collection.id} value={String(collection.id)}>
                  {collection.title} ({collection.itemCount})
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Note" htmlFor="save-note" hint="optional">
            <Input
              id="save-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Why this one, and when to read it"
            />
          </Field>
          <Button
            type="submit"
            variant="primary"
            size="md"
            loading={add.isPending}
            disabled={collectionId === ''}
            iconLeft={<FolderInput size={15} aria-hidden />}
          >
            Save
          </Button>
        </form>
      )}
      {feedback && (
        <p role="status" className="mt-2 text-caption text-ink-secondary">
          {feedback}
        </p>
      )}
    </Card>
  );
}
