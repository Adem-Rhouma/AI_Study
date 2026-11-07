import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth-context.js';
import { ApiError, handler, param } from '../../lib/http.js';
import { difficultySchema, paginationSchema, queryBoolean } from '../../lib/domain.js';
import { all } from '../../db/sql.js';
import {
  enroll,
  enrollment,
  objectivesOf,
  pathBySlug,
  pathProgress,
  prerequisiteTopics,
  progressForPaths,
  setStatus,
  setGoalDate,
  stageItems,
  stagesOf,
  unenroll,
  listPaths
} from './paths.repo.js';

export const pathsRouter = Router();

const canSeeDrafts = (req: { user?: { role?: string } }) =>
  req.user !== undefined && (req.user.role === 'admin' || req.user.role === 'author');

const listSchema = paginationSchema.extend({
  q: z.string().trim().max(120).default(''),
  difficulty: z.union([difficultySchema, z.literal('all')]).default('all'),
  featured: queryBoolean,
  status: z.enum(['published', 'all']).default('published')
});

const goalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .nullish();

pathsRouter.get(
  '/',
  handler((req, res) => {
    const query = listSchema.parse(req.query);
    const { items, total } = listPaths(req.db, {
      q: query.q,
      difficulty: query.difficulty,
      featured: query.featured,
      userId: req.user?.id ?? null,
      canSeeDrafts: canSeeDrafts(req) && query.status === 'all',
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      paths: items,
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage))
    });
  })
);

pathsRouter.get(
  '/mine',
  requireAuth,
  handler((req, res) => {
    const rows = all<Record<string, unknown>>(
      req.db,
      `SELECT p.id, p.slug, p.name, p.difficulty, p.est_hours AS estHours, e.status,
              e.started_at AS startedAt, e.goal_date AS goalDate, e.completed_at AS completedAt
         FROM path_enrollments e JOIN learning_paths p ON p.id = e.path_id
        WHERE e.user_id = @userId
        ORDER BY e.started_at DESC`,
      { userId: req.user!.id }
    );
    const progress = progressForPaths(
      req.db,
      req.user!.id,
      rows.map((row) => Number(row.id))
    );
    res.json({
      enrollments: rows.map((row) => ({
        ...row,
        progress: progress.get(Number(row.id)) ?? null
      }))
    });
  })
);

pathsRouter.get(
  '/:slug',
  handler((req, res) => {
    const slug = param(req, 'slug');
    const row = pathBySlug(req.db, slug);
    if (!row) throw ApiError.notFound(`Unknown learning path "${slug}"`);
    if (row.status !== 'published' && !canSeeDrafts(req)) throw ApiError.notFound(`Unknown learning path "${slug}"`);

    const userId = req.user?.id ?? null;
    const stages = stagesOf(req.db, row.id);
    const items = stageItems(req.db, row.id, userId);
    const enrolment = userId ? enrollment(req.db, userId, row.id) : null;

    const grouped = new Map<number | null, typeof items>();
    for (const item of items) {
      const key = item.stage_id === null ? null : Number(item.stage_id);
      const list = grouped.get(key) ?? [];
      list.push(item);
      grouped.set(key, list);
    }
    const serialise = (list: typeof items) =>
      list.map((item) => ({
        kind: item.kind,
        slug: item.slug,
        title: item.title,
        summary: item.summary,
        estMinutes: Number(item.est_minutes),
        optional: Number(item.is_optional) === 1,
        note: item.note,
        done: Number(item.done) === 1,
        level: item.level
      }));

    res.json({
      path: {
        slug: row.slug,
        name: row.name,
        summary: row.summary,
        description: row.description,
        audience: row.audience,
        difficulty: row.difficulty,
        estHours: Number(row.est_hours),
        status: row.status,
        objectives: objectivesOf(row),
        completionCriteria: row.completion_criteria,
        prerequisitesNote: row.prerequisites_note,
        outcomeNote: row.outcome_note,
        isFeatured: Number(row.is_featured) === 1
      },
      prerequisites: prerequisiteTopics(req.db, row.id),
      stages: [
        ...stages.map((stage) => ({
          id: Number(stage.id),
          title: stage.title,
          summary: stage.summary,
          orderIndex: Number(stage.order_index),
          items: serialise(grouped.get(Number(stage.id)) ?? [])
        })),
        ...(grouped.get(null)?.length
          ? [{ id: null as number | null, title: 'Unordered', summary: '', orderIndex: 999, items: serialise(grouped.get(null) ?? []) }]
          : [])
      ],
      progress: userId ? pathProgress(req.db, userId, row.id) : null,
      enrollment: enrolment
        ? {
            status: enrolment.status,
            startedAt: enrolment.started_at,
            goalDate: enrolment.goal_date,
            completedAt: enrolment.completed_at
          }
        : null
    });
  })
);

pathsRouter.post(
  '/:slug/enroll',
  requireAuth,
  handler((req, res) => {
    const body = z.object({ goalDate }).parse(req.body ?? {});
    const slug = param(req, 'slug');
    const row = pathBySlug(req.db, slug);
    if (!row) throw ApiError.notFound(`Unknown learning path "${slug}"`);
    if (row.status !== 'published') throw ApiError.notFound(`Unknown learning path "${slug}"`);
    enroll(req.db, req.user!.id, row.id, body.goalDate ?? null);
    res.json({ enrolled: true, pathSlug: row.slug, progress: pathProgress(req.db, req.user!.id, row.id) });
  })
);

pathsRouter.patch(
  '/:slug/enroll',
  requireAuth,
  handler((req, res) => {
    const body = z
      .object({ status: z.enum(['active', 'paused', 'completed', 'abandoned']).optional(), goalDate })
      .parse(req.body ?? {});
    const slug = param(req, 'slug');
    const row = pathBySlug(req.db, slug);
    if (!row) throw ApiError.notFound(`Unknown learning path "${slug}"`);
    if (!enrollment(req.db, req.user!.id, row.id)) throw ApiError.notFound('You are not enrolled in that path.');
    if (body.status) setStatus(req.db, req.user!.id, row.id, body.status);
    if (body.goalDate !== undefined) setGoalDate(req.db, req.user!.id, row.id, body.goalDate ?? null);
    res.json({ ok: true, enrollment: enrollment(req.db, req.user!.id, row.id) });
  })
);

pathsRouter.delete(
  '/:slug/enroll',
  requireAuth,
  handler((req, res) => {
    const slug = param(req, 'slug');
    const row = pathBySlug(req.db, slug);
    if (!row) throw ApiError.notFound(`Unknown learning path "${slug}"`);
    const removed = unenroll(req.db, req.user!.id, row.id);
    res.json({ enrolled: false, removed: removed > 0 });
  })
);
