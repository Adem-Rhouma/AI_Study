import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ExternalLink, FolderPlus, Trash2 } from 'lucide-react';
import { api } from '../../api/client';
import { keys } from '../../api/keys';
import type { UserCollection, UserCollectionItem } from '../../api/types';
import { DIFFICULTY_LABEL, resourceTypeLabel } from '../../lib/format';
import { Card, SectionHeader } from '../ui/Surface';
import { EmptyState, ErrorState, errorMessage, InlineAlert, SkeletonRows } from '../ui/Feedback';
import { Button, IconButton } from '../ui/Button';
import { CheckboxField, Field, Input, Textarea } from '../ui/Field';

/**
 * The learner's own reading lists. Curated collections are editorial and read-only; these are
 * private by default and owned end to end by the signed-in account.
 */
export function MyCollections() {
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  const collections = useQuery({
    queryKey: keys.myCollections,
    queryFn: () => api.get<{ collections: UserCollection[] }>('/library/mine')
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.myCollections });
    void queryClient.invalidateQueries({ queryKey: keys.bookmarks });
  };

  const remove = useMutation({
    mutationFn: (id: number) => api.del(`/library/mine/${id}`),
    onSuccess: (_data, id) => {
      if (openId === id) setOpenId(null);
      invalidate();
    }
  });

  const list = collections.data?.collections ?? [];

  return (
    <Card>
      <SectionHeader
        eyebrow="Your library"
        title="Your collections"
        description="Private by default. Add resources to a collection from any resource page; a collection you delete takes its list with it, not the resources."
        actions={
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<FolderPlus size={14} aria-hidden />}
            onClick={() => setCreating((value) => !value)}
            aria-expanded={creating}
          >
            {creating ? 'Cancel' : 'New collection'}
          </Button>
        }
      />

      {creating && <CreateCollectionForm onCreated={() => { setCreating(false); invalidate(); }} />}

      <div className="mt-4">
        {collections.isLoading ? (
          <SkeletonRows rows={2} />
        ) : collections.error ? (
          <ErrorState error={collections.error} onRetry={() => void collections.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState
            title="No collections yet"
            description="Create one and start saving resources you want to come back to."
          />
        ) : (
          <ul className="space-y-2">
            {list.map((collection) => (
              <li key={collection.id} className="rounded-card border border-line bg-sunken">
                <div className="flex items-center gap-2 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setOpenId(openId === collection.id ? null : collection.id)}
                    aria-expanded={openId === collection.id}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    {openId === collection.id ? (
                      <ChevronDown size={15} className="shrink-0 text-ink-muted" aria-hidden />
                    ) : (
                      <ChevronRight size={15} className="shrink-0 text-ink-muted" aria-hidden />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate text-body font-medium text-ink">{collection.title}</span>
                      <span className="block text-caption text-ink-muted tnum">
                        {collection.itemCount} {collection.itemCount === 1 ? 'resource' : 'resources'}
                        {collection.isPublic ? ' · public' : ' · private'}
                      </span>
                    </span>
                  </button>
                  <IconButton
                    label={`Delete collection ${collection.title}`}
                    size="sm"
                    tone="danger"
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(collection.id)}
                  >
                    <Trash2 size={14} aria-hidden />
                  </IconButton>
                </div>
                {remove.isError && remove.variables === collection.id && (
                  <InlineAlert tone="danger" className="mx-3 mb-2">
                    {errorMessage(remove.error)}
                  </InlineAlert>
                )}
                {openId === collection.id && <CollectionItems id={collection.id} />}
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

function CreateCollectionForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () => api.post<{ collection: UserCollection }>('/library/mine', { title, description, isPublic }),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setIsPublic(false);
      setError(null);
      onCreated();
    },
    onError: (err) => setError(errorMessage(err))
  });

  const invalid = title.trim().length < 2;

  return (
    <form
      className="mt-4 space-y-3 rounded-card border border-line bg-raised p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!invalid) create.mutate();
      }}
    >
      <Field
        label="Title"
        htmlFor="collection-title"
        required
        error={invalid && title.length > 0 ? 'At least 2 characters.' : null}
      >
        <Input
          id="collection-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Transformer reading list"
          invalid={invalid && title.length > 0}
          maxLength={120}
        />
      </Field>
      <Field label="Description" htmlFor="collection-description" hint="optional">
        <Textarea
          id="collection-description"
          rows={2}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={500}
        />
      </Field>
      <CheckboxField
        checked={isPublic}
        onCheckedChange={setIsPublic}
        label="Make this collection public"
        description="Public collections can be shared by link. Private ones are visible only to you."
      />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      <Button type="submit" variant="primary" size="sm" loading={create.isPending} disabled={invalid}>
        Create collection
      </Button>
    </form>
  );
}

function CollectionItems({ id }: { id: number }) {
  const queryClient = useQueryClient();
  const items = useQuery({
    queryKey: keys.myCollection(id),
    queryFn: () => api.get<{ collection: UserCollection; items: UserCollectionItem[] }>(`/library/mine/${id}`)
  });

  const removeItem = useMutation({
    mutationFn: (slug: string) => api.del(`/library/mine/${id}/items/${slug}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.myCollection(id) });
      void queryClient.invalidateQueries({ queryKey: keys.myCollections });
      void queryClient.invalidateQueries({ queryKey: keys.bookmarks });
    }
  });

  if (items.isLoading) return <SkeletonRows rows={2} className="px-3 pb-3" />;
  if (items.error) {
    return (
      <div className="px-3 pb-3">
        <ErrorState error={items.error} onRetry={() => void items.refetch()} />
      </div>
    );
  }

  const list = items.data?.items ?? [];
  if (list.length === 0) {
    return (
      <p className="px-3 pb-3 text-caption text-ink-muted">
        Empty. Open any resource in the library and use “Save to collection”.
      </p>
    );
  }

  return (
    <ul className="space-y-1.5 border-t border-line px-3 py-2">
      {list.map((item) => (
        <li key={item.slug} className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Link to={`/resources/${item.slug}`} className="text-caption font-medium text-ink hover:text-accent-hover">
              {item.title}
            </Link>
            <span className="block text-caption text-ink-muted">
              {resourceTypeLabel(item.type)} · {DIFFICULTY_LABEL[item.difficulty]}
              {item.authors ? ` · ${item.authors}` : ''}
            </span>
            {item.note && <span className="block text-caption text-ink-secondary">{item.note}</span>}
          </div>
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 shrink-0 text-ink-muted transition-colors hover:text-accent-hover"
            aria-label={`Open ${item.title} in a new tab`}
          >
            <ExternalLink size={13} aria-hidden />
          </a>
          <IconButton
            label={`Remove ${item.title} from this collection`}
            size="sm"
            tone="danger"
            disabled={removeItem.isPending}
            onClick={() => removeItem.mutate(item.slug)}
          >
            <Trash2 size={13} aria-hidden />
          </IconButton>
        </li>
      ))}
    </ul>
  );
}
