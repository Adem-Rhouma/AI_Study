import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth-context.js';
import { handler, param } from '../../lib/http.js';
import { exerciseKinds, difficultySchema, paginationSchema } from '../../lib/domain.js';
import {
  arenaStats,
  getArenaExercise,
  listArenaExercises,
  listMyAttempts,
  recommendExercises,
  submitAttempt,
  unlockHint,
  type Viewer
} from './arena.service.js';

export const arenaRouter = Router();

const canSeeDrafts = (req: { user?: { role?: string } }) =>
  req.user !== undefined && (req.user.role === 'admin' || req.user.role === 'author');

const viewer = (req: { user?: { id: number; role: string } }): Viewer => ({
  userId: req.user?.id ?? null,
  canSeeDrafts: canSeeDrafts(req)
});

const listQuery = paginationSchema.extend({
  topic: z.string().trim().max(96).optional(),
  difficulty: difficultySchema.or(z.literal('all')).default('all'),
  kind: exerciseKindSchemaSafe(),
  q: z.string().trim().max(120).default(''),
  status: z.enum(['published', 'all']).default('published')
});

/** Keep the enum permissive-but-checked so a bad `kind` is a 422, not a silent filter-off. */
function exerciseKindSchemaSafe() {
  return z.enum([...exerciseKinds, 'all']).default('all');
}

const hintBody = z.object({ index: z.number().int().min(0).max(5) });

const attemptBody = z.object({
  answer: z
    .unknown()
    .refine((value) => value !== undefined && value !== null, 'An answer is required.'),
  durationSeconds: z.number().int().min(0).max(7200).optional()
});

arenaRouter.get(
  '/exercises',
  handler((req, res) => {
    const query = listQuery.parse(req.query);
    const result = listArenaExercises(req.db, viewer(req), {
      topic: query.topic,
      difficulty: query.difficulty,
      kind: query.kind,
      q: query.q,
      status: query.status,
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      exercises: result.exercises,
      page: query.page,
      perPage: query.perPage,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / query.perPage))
    });
  })
);

arenaRouter.get(
  '/exercises/:slug',
  handler((req, res) => {
    res.json(getArenaExercise(req.db, param(req, 'slug'), viewer(req)));
  })
);

arenaRouter.post(
  '/exercises/:slug/hint',
  requireAuth,
  handler((req, res) => {
    const body = hintBody.parse(req.body ?? {});
    res.json(unlockHint(req.db, req.user!.id, param(req, 'slug'), body.index));
  })
);

arenaRouter.post(
  '/exercises/:slug/attempt',
  requireAuth,
  handler((req, res) => {
    const body = attemptBody.parse(req.body ?? {});
    res.status(201).json(submitAttempt(req.db, req.user!.id, param(req, 'slug'), body));
  })
);

arenaRouter.get(
  '/attempts',
  requireAuth,
  handler((req, res) => {
    const query = paginationSchema.extend({ topic: z.string().trim().max(96).optional() }).parse(req.query);
    const result = listMyAttempts(req.db, req.user!.id, {
      topic: query.topic,
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      attempts: result.attempts,
      page: query.page,
      perPage: query.perPage,
      total: result.total,
      totalPages: Math.max(1, Math.ceil(result.total / query.perPage))
    });
  })
);

arenaRouter.get(
  '/stats',
  requireAuth,
  handler((req, res) => {
    res.json(arenaStats(req.db, req.user!.id));
  })
);

arenaRouter.get(
  '/recommend',
  requireAuth,
  handler((req, res) => {
    const query = z.object({ limit: z.coerce.number().int().min(1).max(20).default(8) }).parse(req.query);
    res.json(recommendExercises(req.db, req.user!.id, query.limit));
  })
);
