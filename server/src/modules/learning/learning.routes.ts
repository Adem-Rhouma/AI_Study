import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth-context.js';
import { handler, param } from '../../lib/http.js';
import {
  completeLesson,
  getCourseOutline,
  getLessonReader,
  saveReadingPosition,
  withdrawCompletion
} from './lesson.service.js';

export const learningRouter = Router();

const canSeeDrafts = (req: { user?: { role?: string } }) =>
  req.user !== undefined && (req.user.role === 'admin' || req.user.role === 'author');

const viewer = (req: { user?: { id: number; role: string } }) => ({
  userId: req.user?.id ?? null,
  canSeeDrafts: canSeeDrafts(req)
});

const positionSchema = z.object({
  blockIndex: z.number().int().min(0).max(500),
  maxScroll: z.number().min(0).max(1),
  durationSeconds: z.number().int().min(0).max(7200).optional()
});

const completeSchema = z.object({
  durationSeconds: z.number().int().min(0).max(7200).optional()
});

learningRouter.get(
  '/lessons/:slug',
  handler((req, res) => {
    res.json(getLessonReader(req.db, param(req, 'slug'), viewer(req)));
  })
);

learningRouter.patch(
  '/lessons/:slug/position',
  requireAuth,
  handler((req, res) => {
    const body = positionSchema.parse(req.body ?? {});
    res.json(saveReadingPosition(req.db, req.user!.id, param(req, 'slug'), body));
  })
);

learningRouter.post(
  '/lessons/:slug/complete',
  requireAuth,
  handler((req, res) => {
    const body = completeSchema.parse(req.body ?? {});
    res.json(completeLesson(req.db, req.user!.id, param(req, 'slug'), body.durationSeconds));
  })
);

learningRouter.delete(
  '/lessons/:slug/complete',
  requireAuth,
  handler((req, res) => {
    res.json(withdrawCompletion(req.db, req.user!.id, param(req, 'slug')));
  })
);

learningRouter.get(
  '/course/:slug/outline',
  handler((req, res) => {
    res.json(getCourseOutline(req.db, param(req, 'slug'), viewer(req)));
  })
);
