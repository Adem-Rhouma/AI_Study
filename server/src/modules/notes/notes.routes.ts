import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth-context.js';
import { ApiError, handler, param } from '../../lib/http.js';
import { paginationSchema } from '../../lib/domain.js';
import { get } from '../../db/sql.js';
import {
  addBookmark,
  createNote,
  deleteNote,
  getNote,
  isBookmarked,
  listBookmarks,
  listNotes,
  removeBookmark,
  resolveTarget,
  updateNote,
  type NoteTargetKind,
  type NoteWithTarget
} from './notes.repo.js';

export const notesRouter = Router();

const kindSchema = z.enum(['lesson', 'topic', 'resource', 'course']);
const bookmarkKindSchema = z.enum(['lesson', 'topic', 'resource']);

notesRouter.use(requireAuth);

/** One projection for every response that carries a note, so the list and the write paths agree. */
function presentNote(row: NoteWithTarget | null) {
  if (!row) return null;
  return {
    id: Number(row.id),
    body: row.body,
    quote: row.quote,
    blockId: row.block_id === null ? null : Number(row.block_id),
    target: { kind: row.targetKind, slug: row.targetSlug, title: row.targetTitle },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const listSchema = paginationSchema.extend({
  kind: kindSchema.optional(),
  slug: z.string().trim().max(120).optional(),
  q: z.string().trim().max(120).default('')
});

const createSchema = z.object({
  kind: kindSchema,
  slug: z.string().trim().min(1).max(120),
  body: z.string().trim().min(1).max(20_000),
  quote: z.string().trim().max(2_000).default(''),
  blockId: z.number().int().positive().nullish()
});

const updateSchema = z
  .object({
    body: z.string().trim().min(1).max(20_000).optional(),
    quote: z.string().trim().max(2_000).optional()
  })
  .refine((value) => value.body !== undefined || value.quote !== undefined, {
    message: 'Provide body or quote to update.'
  });

notesRouter.get(
  '/',
  handler((req, res) => {
    const query = listSchema.parse(req.query);
    const userId = req.user!.id;
    let targetId: number | undefined;
    if (query.kind && query.slug) {
      const target = resolveTarget(req.db, query.kind, query.slug);
      if (!target) throw ApiError.notFound(`Unknown ${query.kind} "${query.slug}"`);
      targetId = target.id;
    }
    const { rows, total } = listNotes(req.db, userId, {
      kind: query.kind,
      targetId,
      q: query.q,
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      notes: rows.map(presentNote),
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage))
    });
  })
);

notesRouter.post(
  '/',
  handler((req, res) => {
    const input = createSchema.parse(req.body ?? {});
    const userId = req.user!.id;
    const target = resolveTarget(req.db, input.kind, input.slug);
    if (!target) throw ApiError.notFound(`Unknown ${input.kind} "${input.slug}"`);
    if (input.blockId) {
      if (input.kind !== 'lesson') throw ApiError.badRequest('Only lesson notes can point at a block.');
      const block = get<{ id: number }>(
        req.db,
        'SELECT id FROM lesson_blocks WHERE id = @id AND lesson_id = @lessonId',
        { id: input.blockId, lessonId: target.id }
      );
      if (!block) throw ApiError.badRequest('That block does not belong to this lesson.');
    }
    const id = createNote(req.db, {
      userId,
      kind: input.kind,
      targetId: target.id,
      body: input.body,
      quote: input.quote,
      blockId: input.blockId ?? null
    });
    res.status(201).json({ note: presentNote(getNote(req.db, userId, id)) });
  })
);

notesRouter.patch(
  '/:id',
  handler((req, res) => {
    const input = updateSchema.parse(req.body ?? {});
    const userId = req.user!.id;
    const id = Number(param(req, 'id'));
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid note id.');
    if (!getNote(req.db, userId, id)) throw ApiError.notFound('Note not found.');
    updateNote(req.db, userId, id, { body: input.body, quote: input.quote });
    res.json({ note: presentNote(getNote(req.db, userId, id)) });
  })
);

notesRouter.delete(
  '/:id',
  handler((req, res) => {
    const userId = req.user!.id;
    const id = Number(param(req, 'id'));
    if (!Number.isInteger(id) || id <= 0) throw ApiError.badRequest('Invalid note id.');
    const removed = deleteNote(req.db, userId, id);
    if (removed === 0) throw ApiError.notFound('Note not found.');
    res.json({ deleted: true, id });
  })
);

notesRouter.get(
  '/bookmarks',
  handler((req, res) => {
    const requested = z
      .string()
      .transform((value) => value.split(',').map((part) => part.trim()).filter(Boolean))
      .optional()
      .parse(req.query.kind);
    const kinds = (requested ?? bookmarkKindSchema.options).filter((kind): kind is NoteTargetKind =>
      bookmarkKindSchema.options.includes(kind as never)
    );
    res.json({ bookmarks: listBookmarks(req.db, req.user!.id, kinds) });
  })
);

notesRouter.post(
  '/bookmarks/:kind/:slug',
  handler((req, res) => {
    const kind = bookmarkKindSchema.parse(param(req, 'kind'));
    const slug = param(req, 'slug');
    const target = resolveTarget(req.db, kind, slug);
    if (!target) throw ApiError.notFound(`Unknown ${kind} "${slug}"`);
    addBookmark(req.db, req.user!.id, kind, target.id);
    res.json({ bookmarked: true, kind, slug });
  })
);

notesRouter.delete(
  '/bookmarks/:kind/:slug',
  handler((req, res) => {
    const kind = bookmarkKindSchema.parse(param(req, 'kind'));
    const slug = param(req, 'slug');
    const target = resolveTarget(req.db, kind, slug);
    if (!target) throw ApiError.notFound(`Unknown ${kind} "${slug}"`);
    removeBookmark(req.db, req.user!.id, kind, target.id);
    res.json({ bookmarked: false, kind, slug });
  })
);

notesRouter.get(
  '/bookmarks/:kind/:slug',
  handler((req, res) => {
    const kind = bookmarkKindSchema.parse(param(req, 'kind'));
    const slug = param(req, 'slug');
    const target = resolveTarget(req.db, kind, slug);
    if (!target) throw ApiError.notFound(`Unknown ${kind} "${slug}"`);
    res.json({ bookmarked: isBookmarked(req.db, req.user!.id, kind, target.id), kind, slug });
  })
);
