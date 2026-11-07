import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth-context.js';
import { ApiError, handler, param } from '../../lib/http.js';
import { difficultySchema, paginationSchema, queryBoolean } from '../../lib/domain.js';
import { getCourseOutline } from '../learning/lesson.service.js';
import { findLessonBySlug } from '../learning/lesson.repo.js';
import {
  courseBySlug,
  courseObjectives,
  courseTopics,
  enroll,
  enrollment,
  listCourses,
  markCourseCompleteIfDone,
  nextLesson,
  noteLastLesson,
  unenroll
} from './courses.repo.js';

export const coursesRouter = Router();

const canSeeDrafts = (req: { user?: { role?: string } }) =>
  req.user !== undefined && (req.user.role === 'admin' || req.user.role === 'author');

const listSchema = paginationSchema.extend({
  q: z.string().trim().max(120).default(''),
  difficulty: z.union([difficultySchema, z.literal('all')]).default('all'),
  featured: queryBoolean,
  status: z.enum(['published', 'all']).default('published')
});

coursesRouter.get(
  '/',
  handler((req, res) => {
    const query = listSchema.parse(req.query);
    const staff = canSeeDrafts(req) && query.status === 'all';
    const { items, total } = listCourses(req.db, {
      q: query.q,
      difficulty: query.difficulty,
      featured: query.featured,
      userId: req.user?.id ?? null,
      canSeeDrafts: staff,
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      courses: items,
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage))
    });
  })
);

coursesRouter.get(
  '/:slug',
  handler((req, res) => {
    const slug = param(req, 'slug');
    const row = courseBySlug(req.db, slug);
    if (!row) throw ApiError.notFound(`Unknown course "${slug}"`);
    if (row.status !== 'published' && !canSeeDrafts(req)) throw ApiError.notFound(`Unknown course "${slug}"`);

    const outline = getCourseOutline(req.db, slug, {
      userId: req.user?.id ?? null,
      canSeeDrafts: canSeeDrafts(req)
    });
    const topics = courseTopics(req.db, row.id);
    const enrolment = req.user ? enrollment(req.db, req.user.id, row.id) : null;

    res.json({
      course: {
        slug: row.slug,
        title: row.title,
        subtitle: row.subtitle,
        summary: row.summary,
        difficulty: row.difficulty,
        status: row.status,
        estHours: Number(row.est_hours),
        author: row.author,
        audience: row.audience,
        objectives: courseObjectives(row),
        prerequisitesNote: row.prerequisites_note,
        completionCriteria: row.completion_criteria,
        isFeatured: Number(row.is_featured) === 1
      },
      topics: topics.map((topic) => ({
        slug: topic.slug,
        name: topic.name,
        difficulty: topic.difficulty,
        estMinutes: Number(topic.est_minutes)
      })),
      modules: outline.modules,
      totals: outline.totals,
      enrollment: enrolment
        ? {
            enrolled: true,
            startedAt: enrolment.started_at,
            completedAt: enrolment.completed_at,
            lastLessonId: enrolment.last_lesson_id
          }
        : null
    });
  })
);

coursesRouter.post(
  '/:slug/enroll',
  requireAuth,
  handler((req, res) => {
    const slug = param(req, 'slug');
    const row = courseBySlug(req.db, slug);
    if (!row) throw ApiError.notFound(`Unknown course "${slug}"`);
    if (row.status !== 'published') throw ApiError.notFound(`Unknown course "${slug}"`);
    enroll(req.db, req.user!.id, row.id);
    res.json({ enrolled: true, courseSlug: row.slug });
  })
);

coursesRouter.delete(
  '/:slug/enroll',
  requireAuth,
  handler((req, res) => {
    const slug = param(req, 'slug');
    const row = courseBySlug(req.db, slug);
    if (!row) throw ApiError.notFound(`Unknown course "${slug}"`);
    const removed = unenroll(req.db, req.user!.id, row.id);
    res.json({ enrolled: false, removed: removed > 0 });
  })
);

/** Resume pointer: the next unfinished lesson in course order, or null when the course is done. */
coursesRouter.get(
  '/:slug/next',
  handler((req, res) => {
    const slug = param(req, 'slug');
    const row = courseBySlug(req.db, slug);
    if (!row) throw ApiError.notFound(`Unknown course "${slug}"`);
    if (row.status !== 'published' && !canSeeDrafts(req)) throw ApiError.notFound(`Unknown course "${slug}"`);
    res.json({ courseSlug: slug, nextLessonSlug: nextLesson(req.db, req.user?.id ?? null, row.id) });
  })
);

/** Called by the lesson page when the learner navigates away, so "resume" points at the right lesson. */
coursesRouter.post(
  '/:slug/resume',
  requireAuth,
  handler((req, res) => {
    const body = z.object({ lessonSlug: z.string().trim().min(1).max(120) }).parse(req.body ?? {});
    const row = courseBySlug(req.db, param(req, 'slug'));
    if (!row) throw ApiError.notFound(`Unknown course "${param(req, 'slug')}"`);
    const lesson = findLessonBySlug(req.db, body.lessonSlug);
    if (!lesson) throw ApiError.notFound(`Unknown lesson "${body.lessonSlug}"`);
    enroll(req.db, req.user!.id, row.id);
    noteLastLesson(req.db, req.user!.id, row.id, lesson.id);
    markCourseCompleteIfDone(req.db, req.user!.id, row.id);
    res.json({ ok: true, courseSlug: row.slug, lessonSlug: lesson.slug });
  })
);
