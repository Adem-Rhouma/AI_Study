import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import { keys } from '../../api/keys';
import type { AdminFieldSpec, AdminKindSpec, ContentDocument, ContentSaveResult } from '../../api/types';
import { Button, ErrorState, FormErrors, InlineAlert, Modal, SkeletonRows } from '../ui';
import { useToast } from '../ui/Toast';
import { emptyFieldValue, FieldControl, type FieldScope } from './FieldControl';
import { LessonRevisions } from './LessonRevisions';
import { refreshContentCaches } from './refreshCaches';
import { RelationEditor } from './RelationEditor';

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value);
}

function asItems(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map((entry) => (entry && typeof entry === 'object' ? (entry as Record<string, unknown>) : {})) : [];
}

/** What a brand new document starts with: the server's own defaults, wherever it has any. */
function emptyDocument(kind: AdminKindSpec): Record<string, unknown> {
  const doc: Record<string, unknown> = {};
  for (const field of kind.fields) doc[field.key] = emptyFieldValue(field);
  for (const relation of kind.relations) doc[relation.key] = [];
  return doc;
}

/**
 * JSON columns are edited as text, so the document has to become a value again before it is sent.
 * Anything that does not parse is named here rather than saved as the stale object it replaced.
 */
function materialiseJson(
  kind: AdminKindSpec,
  itemShapes: Record<string, AdminFieldSpec[]>,
  doc: Record<string, unknown>
): { payload: Record<string, unknown>; problems: string[] } {
  const problems: string[] = [];

  function parse(raw: unknown, label: string): unknown {
    if (typeof raw !== 'string') return raw;
    if (raw.trim() === '') return {};
    try {
      return JSON.parse(raw);
    } catch {
      problems.push(label);
      return undefined;
    }
  }

  const payload: Record<string, unknown> = { ...doc };
  for (const field of kind.fields) {
    if (field.type === 'json') payload[field.key] = parse(doc[field.key], field.label);
  }
  for (const relation of kind.relations) {
    const fields = itemShapes[relation.shape] ?? [];
    if (!fields.some((field) => field.type === 'json')) continue;
    payload[relation.key] = asItems(doc[relation.key]).map((item, index) => {
      const row = { ...item };
      for (const field of fields) {
        if (field.type === 'json') row[field.key] = parse(item[field.key], `${relation.label}, row ${index + 1}: ${field.label}`);
      }
      return row;
    });
  }
  return { payload, problems };
}

/**
 * The editor for one content type, assembled from the descriptor: fields, child tables, and for a
 * lesson the versions kept before each save. No content type has a page of its own.
 */
export function ContentEditor({
  kind,
  itemShapes,
  slug,
  open,
  onOpenChange
}: {
  kind: AdminKindSpec;
  itemShapes: Record<string, AdminFieldSpec[]>;
  /** The row's slug, its id as text when the table has none, or null for a document not written yet. */
  slug: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const noun = kind.kind;
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={slug === null ? `New ${noun}` : `Editing ${noun}`}
      description={slug === null ? 'Nothing is visible to learners until its status says published.' : text(slug)}
    >
      {open && <DocumentForm key={`${kind.kind}:${slug ?? 'new'}`} kind={kind} itemShapes={itemShapes} slug={slug} onClose={() => onOpenChange(false)} />}
    </Modal>
  );
}

function DocumentForm({
  kind,
  itemShapes,
  slug,
  onClose
}: {
  kind: AdminKindSpec;
  itemShapes: Record<string, AdminFieldSpec[]>;
  slug: string | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const loaded = useQuery({
    queryKey: keys.adminDocument(kind.kind, slug ?? ''),
    queryFn: () => api.get<ContentDocument>(`/admin/content/${kind.kind}/${encodeURIComponent(slug!)}`),
    enabled: slug !== null
  });

  const [doc, setDoc] = useState<Record<string, unknown> | null>(() => (slug === null ? emptyDocument(kind) : null));

  useEffect(() => {
    if (loaded.data) setDoc((current) => current ?? loaded.data!.doc);
  }, [loaded.data]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      slug === null
        ? api.post<ContentSaveResult>(`/admin/content/${kind.kind}`, payload)
        : api.put<ContentSaveResult>(`/admin/content/${kind.kind}/${encodeURIComponent(slug)}`, payload),
    onSuccess: (result) => {
      refreshContentCaches(queryClient);
      toast.info(slug === null ? `Created ${result.ref}.` : `Saved ${result.ref}.`);
      onClose();
    }
  });

  const { payload, problems } = useMemo(() => materialiseJson(kind, itemShapes, doc ?? {}), [kind, itemShapes, doc]);

  if (doc === null) {
    if (loaded.error) return <ErrorState error={loaded.error} onRetry={() => void loaded.refetch()} />;
    return <SkeletonRows rows={6} />;
  }

  const serverProblems = save.error instanceof ApiError ? (save.error.details ?? {}) : {};
  const fieldKeys = new Set(kind.fields.map((field) => field.key));
  const unsurfaced = Object.fromEntries(Object.entries(serverProblems).filter(([key]) => !fieldKeys.has(key)));

  // Modules only exist inside a course, so that picker waits for the course named in this document.
  const scope: FieldScope = { course: typeof doc.course === 'string' && doc.course !== '' ? doc.course : null };

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (problems.length > 0) return;
        save.mutate(payload);
      }}
      className="space-y-5"
      noValidate
    >
      <p className="text-caption text-ink-secondary">{kind.consequence}</p>

      {problems.length > 0 && (
        <InlineAlert tone="danger" title="Fix this JSON first">
          <ul className="list-disc space-y-0.5 pl-4">
            {problems.map((label) => (
              <li key={label}>{label} is not valid JSON.</li>
            ))}
          </ul>
        </InlineAlert>
      )}

      {save.isError && (
        <>
          <InlineAlert tone="danger" title="Not saved">
            {save.error instanceof Error ? save.error.message : 'The server refused this document.'}
          </InlineAlert>
          <FormErrors details={unsurfaced} />
        </>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {kind.fields.map((field) => (
          <div
            key={field.key}
            className={field.type === 'textarea' || field.type === 'json' || field.type === 'string-list' ? 'sm:col-span-2' : undefined}
          >
            <FieldControl
              spec={field}
              value={doc[field.key]}
              scope={scope}
              error={serverProblems[field.key] ?? null}
              onChange={(value) => setDoc((current) => ({ ...(current ?? {}), [field.key]: value }))}
            />
          </div>
        ))}
      </div>

      {kind.relations.map((relation) => (
        <RelationEditor
          key={relation.key}
          label={relation.label}
          fields={itemShapes[relation.shape] ?? []}
          items={asItems(doc[relation.key])}
          scope={scope}
          onChange={(items) => setDoc((current) => ({ ...(current ?? {}), [relation.key]: items }))}
        />
      ))}

      {kind.kind === 'lesson' && slug !== null && <LessonRevisions slug={slug} />}

      <div className="sticky bottom-[-1.25rem] -mx-5 -mb-5 flex flex-wrap items-center justify-end gap-2 border-t border-line bg-raised px-5 py-3">
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={save.isPending} disabled={problems.length > 0}>
          {slug === null ? `Create ${kind.kind}` : 'Save changes'}
        </Button>
      </div>
    </form>
  );
}
