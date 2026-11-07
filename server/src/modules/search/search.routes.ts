import { Router } from 'express';
import { z } from 'zod';
import { handler } from '../../lib/http.js';
import { groupHits, search, type SearchScope } from './search.repo.js';

export const searchRouter = Router();

const canSeeDrafts = (req: { user?: { role?: string } }) =>
  req.user !== undefined && (req.user.role === 'admin' || req.user.role === 'author');

const searchQuerySchema = z.object({
  q: z.string().trim().max(200).default(''),
  scope: z.enum(['all', 'topics', 'lessons', 'resources', 'exercises', 'paths', 'courses', 'collections']).default('all'),
  limit: z.coerce.number().int().min(1).max(60).default(20),
  page: z.coerce.number().int().min(1).max(2000).default(1)
});

searchRouter.get(
  '/',
  handler((req, res) => {
    const started = Date.now();
    const query = searchQuerySchema.parse(req.query);
    // An empty q is not an error: it returns trending topics + entry-point paths as suggestions
    // (see getSuggestions in search.repo.ts for the exact rule). HTTP 200 in every case.
    const { hits, usedFallback } = search(req.db, {
      term: query.q,
      scope: query.scope as SearchScope,
      limit: query.limit,
      offset: (query.page - 1) * query.limit,
      canSeeDrafts: canSeeDrafts(req)
    });
    res.json({
      hits,
      groups: groupHits(hits),
      usedFallback,
      tookMs: Math.max(0, Date.now() - started),
      query: { q: query.q, scope: query.scope, page: query.page, limit: query.limit }
    });
  })
);
