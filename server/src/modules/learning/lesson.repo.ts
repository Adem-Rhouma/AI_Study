import type Database from 'better-sqlite3';
import { all, get, run } from '../../db/sql.js';
import { nowIso } from '../../lib/domain.js';

/**
 * SQL for the lesson reader, reading position, completions and the course outline.
 * Every learner-private statement binds `user_id` / the settings key from the SESSION user.
 */

export type LessonContextRow = {
  id: number;
  slug: string;
  title: string;
  summary: string;
  status: string;
  est_minutes: number;
  order_index: number;
  course_id: number;
  course_slug: string;
  course_title: string;
  course_difficulty: string;
  course_status: string;
  module_id: number | null;
  module_title: string | null;
  module_order: number | null;
};

export type BlockRow = {
  id: number;
  order_index: number;
  type: string;
  text: string;
  payload: unknown;
};

export type ExerciseStubRow = {
  id: number;
  slug: string;
  kind: string;
  difficulty: string;
  title: string;
  prompt: string;
  context: string;
  points: number;
  answer_note: string;
  status: string;
  hint_count: number;
};

export type OptionRow = {
  exercise_id: number;
  label: string;
  text: string;
  position: number;
};

export type CompletionRow = {
  user_id: number;
  lesson_id: number;
  source: string;
  max_scroll: number;
  last_block_index: number;
  duration_seconds: number;
  completed_at: string;
  updated_at: string;
};

export type ReadingPosition = { maxScroll: number; lastBlockIndex: number; updatedAt: string };

export function findLessonBySlug(db: Database.Database, slug: string): LessonContextRow | null {
  const row = get<LessonContextRow>(
    db,
    `SELECT l.id, l.slug, l.title, l.summary, l.status, l.est_minutes, l.order_index,
            c.id AS course_id, c.slug AS course_slug, c.title AS course_title, c.difficulty AS course_difficulty,
            c.status AS course_status, m.id AS module_id, m.title AS module_title, m.order_index AS module_order
       FROM lessons l
       JOIN courses c ON c.id = l.course_id
       LEFT JOIN course_modules m ON m.id = l.module_id
      WHERE l.slug = @slug`,
    { slug }
  );
  return row ?? null;
}

export function lessonBlocks(db: Database.Database, lessonId: number): BlockRow[] {
  return all<BlockRow>(
    db,
    'SELECT id, order_index, type, text, payload FROM lesson_blocks WHERE lesson_id = @lesson ORDER BY order_index, id',
    { lesson: lessonId }
  );
}

export function lessonTopicSlugs(db: Database.Database, lessonId: number): { slug: string; name: string }[] {
  return all<{ slug: string; name: string }>(
    db,
    `SELECT t.slug, t.name FROM topics t JOIN lesson_topics lt ON lt.topic_id = t.id
      WHERE lt.lesson_id = @lesson AND t.status = 'published' ORDER BY t.name`,
    { lesson: lessonId }
  );
}

export function lessonReferences(db: Database.Database, lessonId: number) {
  return all<{ position: number; title: string; authors: string | null; year: number | null; type: string; url: string | null; note: string | null }>(
    db,
    `SELECT position, title, authors, year, type, url, note FROM lesson_references
      WHERE lesson_id = @lesson ORDER BY position, id`,
    { lesson: lessonId }
  );
}

/** One query for every exercise referenced by the lesson's blocks — no per-block round trip. */
export function exercisesBySlugs(db: Database.Database, slugs: string[]): ExerciseStubRow[] {
  if (slugs.length === 0) return [];
  const binds: Record<string, unknown> = {};
  const placeholders = slugs.map((slug, i) => {
    binds[`s${i}`] = slug;
    return `@s${i}`;
  });
  return all<ExerciseStubRow>(
    db,
    `SELECT e.id, e.slug, e.kind, e.difficulty, e.title, e.prompt, e.context, e.points, e.answer_note, e.status,
            (SELECT COUNT(*) FROM exercise_hints h WHERE h.exercise_id = e.id) AS hint_count
       FROM exercises e WHERE e.slug IN (${placeholders.join(',')})`,
    binds
  );
}

/** Option `feedback` is answer-key text, so the reader query never selects the column. */
export function optionsForExercises(db: Database.Database, exerciseIds: number[]): OptionRow[] {
  if (exerciseIds.length === 0) return [];
  const binds: Record<string, unknown> = {};
  const placeholders = exerciseIds.map((id, i) => {
    binds[`e${i}`] = Number(id);
    return `@e${i}`;
  });
  return all<OptionRow>(
    db,
    `SELECT exercise_id, label, text, position FROM exercise_options
      WHERE exercise_id IN (${placeholders.join(',')}) ORDER BY exercise_id, position, id`,
    binds
  );
}

/** Course order = module order, then lesson order. Used for prev/next and the outline. */
export function courseLessonOrder(db: Database.Database, courseId: number) {
  return all<{ id: number; slug: string; title: string; status: string }>(
    db,
    `SELECT l.id, l.slug, l.title, l.status FROM lessons l
      LEFT JOIN course_modules m ON m.id = l.module_id
      WHERE l.course_id = @course
      ORDER BY COALESCE(m.order_index, -1), l.order_index, l.id`,
    { course: courseId }
  );
}

export function courseModules(db: Database.Database, courseId: number) {
  return all<{ id: number; title: string; summary: string; order_index: number }>(
    db,
    'SELECT id, title, summary, order_index FROM course_modules WHERE course_id = @course ORDER BY order_index, id',
    { course: courseId }
  );
}

export function findCourseBySlug(db: Database.Database, slug: string) {
  const row = get<{ id: number; slug: string; title: string; summary: string; difficulty: string; status: string; estHours: number }>(
    db,
    `SELECT id, slug, title, summary, difficulty, status, est_hours AS estHours
       FROM courses WHERE slug = @slug`,
    { slug }
  );
  return row ?? null;
}

export function courseLessonsWithState(db: Database.Database, courseId: number, userId: number | null) {
  return all<{
    id: number;
    slug: string;
    title: string;
    summary: string;
    status: string;
    est_minutes: number;
    order_index: number;
    module_id: number | null;
    completed_at: string | null;
    max_scroll: number | null;
    last_block_index: number | null;
    block_count: number;
  }>(
    db,
    `SELECT l.id, l.slug, l.title, l.summary, l.status, l.est_minutes, l.order_index, l.module_id,
            lc.completed_at, lc.max_scroll, lc.last_block_index,
            (SELECT COUNT(*) FROM lesson_blocks b WHERE b.lesson_id = l.id) AS block_count
       FROM lessons l
       LEFT JOIN lesson_completions lc ON lc.lesson_id = l.id AND lc.user_id = @user
      WHERE l.course_id = @course
      ORDER BY COALESCE((SELECT m.order_index FROM course_modules m WHERE m.id = l.module_id), -1), l.order_index, l.id`,
    { course: courseId, user: userId ?? 0 }
  );
}

export function getCompletion(db: Database.Database, userId: number, lessonId: number): CompletionRow | null {
  const row = get<CompletionRow>(
    db,
    `SELECT user_id, lesson_id, source, max_scroll, last_block_index, duration_seconds, completed_at, updated_at
       FROM lesson_completions WHERE user_id = @user AND lesson_id = @lesson`,
    { user: userId, lesson: lessonId }
  );
  return row ?? null;
}

export function isLessonBookmarked(db: Database.Database, userId: number, lessonId: number): boolean {
  return get<{ id: number }>(
    db,
    'SELECT lesson_id AS id FROM user_lesson_bookmarks WHERE user_id = @user AND lesson_id = @lesson',
    { user: userId, lesson: lessonId }
  ) !== undefined;
}

/**
 * Reading position before completion cannot live in `lesson_completions` — a row there means
 * "completed" for coverage (ADR rule 5). It is parked in `app_settings` under a key that embeds
 * the SESSION user id, so it is per-user and never client-addressable.
 */
function positionKey(userId: number, lessonId: number): string {
  return `learning.position.${Number(userId)}.${Number(lessonId)}`;
}

export function readPosition(db: Database.Database, userId: number, lessonId: number): ReadingPosition | null {
  const row = get<{ value: unknown; updated_at: string }>(db, 'SELECT value, updated_at FROM app_settings WHERE key = @key', {
    key: positionKey(userId, lessonId)
  });
  if (!row) return null;
  try {
    const parsed = JSON.parse(typeof row.value === 'string' ? row.value : String(row.value)) as {
      maxScroll?: number;
      lastBlockIndex?: number;
    };
    return {
      maxScroll: Math.min(1, Math.max(0, Number(parsed.maxScroll) || 0)),
      lastBlockIndex: Math.max(0, Math.trunc(Number(parsed.lastBlockIndex) || 0)),
      updatedAt: row.updated_at
    };
  } catch {
    return null;
  }
}

export function writePosition(
  db: Database.Database,
  userId: number,
  lessonId: number,
  position: { maxScroll: number; lastBlockIndex: number }
): ReadingPosition {
  const timestamp = nowIso();
  run(
    db,
    `INSERT INTO app_settings (key, value, updated_at) VALUES (@key, @value, @timestamp)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    { key: positionKey(userId, lessonId), value: JSON.stringify(position), timestamp }
  );
  return { ...position, updatedAt: timestamp };
}

export function clearPosition(db: Database.Database, userId: number, lessonId: number): void {
  run(db, 'DELETE FROM app_settings WHERE key = @key', { key: positionKey(userId, lessonId) });
}

/**
 * Idempotent completion: an existing row keeps its original `completed_at` and accumulates time;
 * only the resume columns and `updated_at` move.
 */
export function upsertCompletion(
  db: Database.Database,
  input: { userId: number; lessonId: number; source: 'manual' | 'exercise' | 'quiz'; maxScroll: number; lastBlockIndex: number; durationSeconds: number }
): CompletionRow {
  const timestamp = nowIso();
  run(
    db,
    `INSERT INTO lesson_completions
       (user_id, lesson_id, source, max_scroll, last_block_index, duration_seconds, completed_at, updated_at)
     VALUES (@user, @lesson, @source, @maxScroll, @lastBlockIndex, @duration, @timestamp, @timestamp)
     ON CONFLICT (user_id, lesson_id) DO UPDATE SET
       source = excluded.source,
       max_scroll = excluded.max_scroll,
       last_block_index = excluded.last_block_index,
       duration_seconds = lesson_completions.duration_seconds + excluded.duration_seconds,
       updated_at = excluded.updated_at`,
    {
      user: input.userId,
      lesson: input.lessonId,
      source: input.source,
      maxScroll: input.maxScroll,
      lastBlockIndex: input.lastBlockIndex,
      duration: input.durationSeconds,
      timestamp
    }
  );
  const row = getCompletion(db, input.userId, input.lessonId);
  if (!row) throw new Error('completion row missing after upsert');
  return row;
}

export function deleteCompletion(db: Database.Database, userId: number, lessonId: number): number {
  return run(db, 'DELETE FROM lesson_completions WHERE user_id = @user AND lesson_id = @lesson', {
    user: userId,
    lesson: lessonId
  }).changes;
}

export type ActivityWrite = {
  userId: number;
  action: string;
  entityType: string;
  entityId: number;
  minutes: number;
};

/**
 * Time-on-task is recorded for the dashboard only and never scored (ADR rule 4). Read rows are
 * merged per day+lesson so a chatty resume endpoint cannot flood the log.
 */
export function logActivity(db: Database.Database, input: ActivityWrite): void {
  const timestamp = nowIso();
  const day = timestamp.slice(0, 10);
  if (input.action === 'read') {
    const changed = run(
      db,
      `UPDATE activity_log SET minutes = minutes + @minutes, created_at = @timestamp
        WHERE id = (SELECT id FROM activity_log
                     WHERE user_id = @user AND day = @day AND action = 'read'
                       AND entity_type = @entityType AND entity_id = @entityId
                     ORDER BY id DESC LIMIT 1)`,
      { minutes: input.minutes, timestamp, user: input.userId, day, entityType: input.entityType, entityId: input.entityId }
    ).changes;
    if (changed > 0) return;
  }
  run(
    db,
    `INSERT INTO activity_log (user_id, day, action, entity_type, entity_id, minutes, created_at)
     VALUES (@user, @day, @action, @entityType, @entityId, @minutes, @timestamp)`,
    {
      user: input.userId,
      day,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      minutes: input.minutes,
      timestamp
    }
  );
}

export function minutesFromDuration(durationSeconds: number | undefined): number {
  if (!durationSeconds || durationSeconds <= 0) return 0;
  return Math.max(1, Math.round(durationSeconds / 60));
}
