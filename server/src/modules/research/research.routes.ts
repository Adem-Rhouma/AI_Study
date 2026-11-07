import { Router } from 'express';
import { z } from 'zod';
import { handler, queryInt } from '../../lib/http.js';
import { paginationSchema } from '../../lib/domain.js';
import { getMustReads, listMilestones, listPapers, listResearchAreas } from './research.repo.js';

export const researchRouter = Router();

const canSeeDrafts = (req: { user?: { role?: string } }) =>
  req.user !== undefined && (req.user.role === 'admin' || req.user.role === 'author');

researchRouter.get(
  '/topics',
  handler((req, res) => {
    res.json({ areas: listResearchAreas(req.db) });
  })
);

researchRouter.get(
  '/papers',
  handler((req, res) => {
    const query = paginationSchema
      .extend({
        topic: z.string().trim().max(96).optional(),
        year: z.coerce.number().int().min(-3000).max(2100).optional(),
        q: z.string().trim().max(160).default(''),
        sort: z.enum(['newest', 'oldest', 'title']).default('newest')
      })
      .parse(req.query);
    const { items, total } = listPapers(req.db, {
      ...(query.topic ? { topic: query.topic } : {}),
      ...(query.year ? { year: query.year } : {}),
      ...(query.q ? { q: query.q } : {}),
      sort: query.sort,
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      papers: items,
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage))
    });
  })
);

researchRouter.get(
  '/milestones',
  handler((req, res) => {
    // Curated "important AI developments": manually maintained, and the payload says so.
    const year = queryInt(req, 'year', 0, 0, 2100) || undefined;
    const kindRaw = req.query.kind;
    const kind = typeof kindRaw === 'string' && kindRaw ? kindRaw : undefined;
    const limit = queryInt(req, 'limit', 50, 1, 200);
    res.json({
      isCurated: true,
      milestones: listMilestones(req.db, { ...(year ? { year } : {}), ...(kind ? { kind } : {}), limit })
    });
  })
);

researchRouter.get(
  '/must-reads',
  handler((req, res) => {
    res.json(getMustReads(req.db, canSeeDrafts(req)));
  })
);
