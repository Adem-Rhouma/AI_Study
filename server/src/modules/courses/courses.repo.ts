import type Database from 'better-sqlite3';
import { all, get, insert, likeContains, run } from '../../db/sql.js';
import { z } from 'zod';
import { nowIso, parseJsonArray } from '../../lib/domain.js';

export type CourseRow = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  difficulty: string;
  status: string;
  est_hours: number;
  author: string;
  audience: string;
  objectives: string;
  prerequisites_note: string;
  completion_criteria: string;
  is_featured: number;
  order_index: number;
};

export type CourseListItem = {
  id: number;
  slug: string;
  title: string;
  subtitle: string;
  summary: string;
  difficulty: string;
  estHours: number;
  author: string;
  isFeatured: boolean;
  moduleCount: number;
  lessonCount: number;
  topicCount: number;
  enrolled: boolean;
  completedLessons: number;
  progress: number;
  nextLessonSlug: string | null;
};

type ListFilters = {
  q: string;
  difficulty: string;
  featured: boolean;
  userId: number | null;
  canSeeDrafts: boolean;
  limit: number;
  offset: number;
};

const SELECT_BODY = `
  SELECT c.id, c.slug, c.title, c.subtitle, c.summary, c.difficulty, c.status, c.est_hours,
         c.author, c.is_featured, c.order_index,
         (SELECT COUNT(*) FROM course_modules m WHERE m.course_id = c.id) AS module_count,
         (SELECT COUNT(*) FROM lessons l WHERE l.course_id = c.id AND l.status = 'published') AS lesson_count,
         (SELECT COUNT(*) FROM course_topics ct WHERE ct.course_id = c.id) AS topic_count,
         (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id AND e.user_id = @userId) AS enrolled,
         (SELECT COUNT(*) FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id
           WHERE lc.user_id = @userId AND l.course_id = c.id AND l.status = 'published') AS completed_lessons
    FROM courses c`;

function whereClause(filters: ListFilters): string {
  const clauses: string[] = [];
  if (!filters.canSeeDrafts) clauses.push("c.status = 'published'");
  if (filters.difficulty !== 'all') clauses.push('c.difficulty = @difficulty');
  if (filters.featured) clauses.push('c.is_featured = 1');
  if (filters.q) clauses.push(`(c.title LIKE @q ESCAPE '\\' OR c.summary LIKE @q ESCAPE '\\' OR c.subtitle LIKE @q ESCAPE '\\')`);
  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

function toListItem(row: Record<string, unknown>): CourseListItem {
  const lessonCount = Number(row.lesson_count ?? 0);
  const completed = Number(row.completed_lessons ?? 0);
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    subtitle: String(row.subtitle ?? ''),
    summary: String(row.summary ?? ''),
    difficulty: String(row.difficulty),
    estHours: Number(row.est_hours ?? 0),
    author: String(row.author ?? ''),
    isFeatured: Number(row.is_featured) === 1,
    moduleCount: Number(row.module_count ?? 0),
    lessonCount,
    topicCount: Number(row.topic_count ?? 0),
    enrolled: Number(row.enrolled) === 1,
    completedLessons: completed,
    progress: lessonCount > 0 ? Math.round((completed / lessonCount) * 1000) / 1000 : 0,
    nextLessonSlug: null
  };
}

export function listCourses(db: Database.Database, filters: ListFilters): { items: CourseListItem[]; total: number } {
  const where = whereClause(filters);
  const params: Record<string, unknown> = {
    userId: filters.userId ?? 0,
    difficulty: filters.difficulty,
    q: likeContains(filters.q)
  };
  const rows = all<Record<string, unknown>>(
    db,
    `${SELECT_BODY} ${where}
      ORDER BY c.is_featured DESC, c.order_index ASC, c.title ASC
      LIMIT @limit OFFSET @offset`,
    { ...params, limit: filters.limit, offset: filters.offset }
  );
  const totalRow = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM courses c ${where}`, params);
  const items = rows.map(toListItem);
  if (filters.userId !== null) attachNextLesson(db, filters.userId, items);
  return { items, total: Number(totalRow?.c ?? 0) };
}

/** One query for the whole page: the first published, not-yet-completed lesson per course. */
function attachNextLesson(db: Database.Database, userId: number, items: CourseListItem[]): void {
  if (items.length === 0) return;
  const ids = items.map((item) => item.id);
  const placeholders = ids.map((id) => String(id)).join(',');
  const rows = all<{ course_id: number; slug: string }>(
    db,
    `SELECT l.course_id, l.slug
       FROM lessons l
      WHERE l.status = 'published' AND l.course_id IN (${placeholders})
        AND NOT EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.lesson_id = l.id AND lc.user_id = @userId)
      ORDER BY l.course_id, l.order_index ASC, l.id ASC`
  , { userId });
  const first = new Map<number, string>();
  for (const row of rows) {
    const key = Number(row.course_id);
    if (!first.has(key)) first.set(key, String(row.slug));
  }
  for (const item of items) item.nextLessonSlug = first.get(item.id) ?? null;
}

export function courseBySlug(db: Database.Database, slug: string): CourseRow | null {  return get<CourseRow>(db, 'SELECT * FROM courses WHERE slug = @slug', { slug }) ?? null;
}

export function courseTopics(db: Database.Database, courseId: number) {
  return all<{ slug: string; name: string; difficulty: string; est_minutes: number }>(
    db,
    `SELECT t.slug, t.name, t.difficulty, t.est_minutes
       FROM course_topics ct JOIN topics t ON t.id = ct.topic_id
      WHERE ct.course_id = @courseId AND t.status = 'published'
      ORDER BY t.name ASC`,
    { courseId }
  );
}

export type EnrollmentRow = {
  user_id: number;
  course_id: number;
  started_at: string;
  last_lesson_id: number | null;
  completed_at: string | null;
};

export function enrollment(db: Database.Database, userId: number, courseId: number): EnrollmentRow | null {
  return get<EnrollmentRow>(
    db,
    'SELECT * FROM course_enrollments WHERE user_id = @userId AND course_id = @courseId',
    { userId, courseId }
  ) ?? null;
}

export function enroll(db: Database.Database, userId: number, courseId: number): void {
  const existing = enrollment(db, userId, courseId);
  if (existing) return;
  insert(
    db,
    'INSERT INTO course_enrollments (user_id, course_id, started_at) VALUES (@userId, @courseId, @startedAt)',
    { userId, courseId, startedAt: nowIso() }
  );
}

export function unenroll(db: Database.Database, userId: number, courseId: number): number {
  return run(
    db,
    'DELETE FROM course_enrollments WHERE user_id = @userId AND course_id = @courseId',
    { userId, courseId }
  ).changes;
}

export function noteLastLesson(db: Database.Database, userId: number, courseId: number, lessonId: number): void {
  run(
    db,
    `UPDATE course_enrollments SET last_lesson_id = @lessonId
      WHERE user_id = @userId AND course_id = @courseId`,
    { userId, courseId, lessonId }
  );
}

export function markCourseCompleteIfDone(db: Database.Database, userId: number, courseId: number): boolean {
  const counts = get<{ total: number; done: number }>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM lessons WHERE course_id = @courseId AND status = 'published') AS total,
       (SELECT COUNT(*) FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id
         WHERE l.course_id = @courseId AND lc.user_id = @userId) AS done`,
    { courseId, userId }
  );
  const total = Number(counts?.total ?? 0);
  const done = Number(counts?.done ?? 0);
  if (total === 0 || done < total) return false;
  run(
    db,
    `UPDATE course_enrollments SET completed_at = @at
      WHERE user_id = @userId AND course_id = @courseId AND completed_at IS NULL`,
    { userId, courseId, at: nowIso() }
  );
  return true;
}

export function nextLesson(db: Database.Database, userId: number | null, courseId: number): string | null {
  const row = get<{ slug: string }>(
    db,
    `SELECT l.slug FROM lessons l
      WHERE l.course_id = @courseId AND l.status = 'published'
        AND NOT EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.lesson_id = l.id AND lc.user_id = @userId)
      ORDER BY l.order_index ASC, l.id ASC
      LIMIT 1`,
    { courseId, userId: userId ?? 0 }
  );
  return row?.slug ?? null;
}

export function clearCourseCompletion(db: Database.Database, userId: number, courseId: number): void {
  run(
    db,
    `UPDATE course_enrollments SET completed_at = NULL WHERE user_id = @userId AND course_id = @courseId`,
    { userId, courseId }
  );
}

export function courseObjectives(row: CourseRow): string[] {
  return parseJsonArray(row.objectives, z.string());
}
