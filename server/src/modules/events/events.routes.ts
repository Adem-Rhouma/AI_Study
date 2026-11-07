import { Router } from 'express';
import { z } from 'zod';
import { ApiError, handler, param, queryInt } from '../../lib/http.js';
import { paginationSchema } from '../../lib/domain.js';
import { EVENTS_DISCLAIMER, getCalendar, getCompetitionBySlug, listCompetitions } from './events.repo.js';

export const eventsRouter = Router();

eventsRouter.get(
  '/',
  handler((req, res) => {
    const query = paginationSchema
      .extend({
        status: z.enum(['upcoming', 'open', 'ongoing', 'closed', 'recurring', 'all']).optional(),
        type: z.enum(['competition', 'challenge', 'hackathon', 'conference', 'workshop', 'grant', 'summit', 'all']).optional(),
        difficulty: z.enum(['introductory', 'beginner', 'intermediate', 'advanced', 'expert', 'all']).optional(),
        q: z.string().trim().max(160).optional()
      })
      .parse(req.query);
    const { items, total } = listCompetitions(req.db, {
      ...(query.status ? { status: query.status } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.difficulty ? { difficulty: query.difficulty } : {}),
      ...(query.q ? { q: query.q } : {}),
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      events: items,
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage)),
      // Every row also carries isLiveData:false + sourceUpdatedAt; this is belt and braces.
      isLiveData: false,
      disclaimer: EVENTS_DISCLAIMER
    });
  })
);

eventsRouter.get(
  '/calendar',
  handler((req, res) => {
    const days = queryInt(req, 'days', 120, 7, 730);
    res.json({ ...getCalendar(req.db, days), days, isLiveData: false, disclaimer: EVENTS_DISCLAIMER });
  })
);

eventsRouter.get(
  '/:slug',
  handler((req, res) => {
    const competition = getCompetitionBySlug(req.db, param(req, 'slug'));
    if (!competition) throw ApiError.notFound(`Unknown event "${param(req, 'slug')}"`);
    res.json({ event: competition, isLiveData: false, disclaimer: EVENTS_DISCLAIMER });
  })
);
