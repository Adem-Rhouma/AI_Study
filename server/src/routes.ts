import express, { type Express } from 'express';
import { authRouter } from './modules/auth/auth.routes.js';
import { curriculumRouter } from './modules/curriculum/curriculum.routes.js';
import { dashboardRouter } from './modules/dashboard/dashboard.routes.js';
import { learningRouter } from './modules/learning/learning.routes.js';
import { arenaRouter } from './modules/arena/arena.routes.js';
import { libraryRouter } from './modules/library/resources.routes.js';
import { researchRouter } from './modules/research/research.routes.js';
import { eventsRouter } from './modules/events/events.routes.js';
import { searchRouter } from './modules/search/search.routes.js';
import { pathsRouter } from './modules/paths/paths.routes.js';
import { coursesRouter } from './modules/courses/courses.routes.js';
import { progressRouter } from './modules/progress/progress.routes.js';
import { notesRouter } from './modules/notes/notes.routes.js';
import { aiRouter } from './modules/ai/ai.routes.js';
import { adminRouter } from './modules/admin/admin.routes.js';

export function registerRoutes(app: Express): void {
  const api = express.Router();

  api.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'ai-mastery-api', time: new Date().toISOString() });
  });

  api.use('/auth', authRouter);
  api.use('/curriculum', curriculumRouter);
  api.use('/dashboard', dashboardRouter);
  api.use('/courses', coursesRouter);
  api.use('/paths', pathsRouter);
  api.use('/learning', learningRouter);
  api.use('/arena', arenaRouter);
  api.use('/library', libraryRouter);
  api.use('/progress', progressRouter);
  api.use('/notes', notesRouter);
  api.use('/ai', aiRouter);
  api.use('/research', researchRouter);
  api.use('/events', eventsRouter);
  api.use('/search', searchRouter);
  api.use('/admin', adminRouter);

  app.use('/api', api);
}
