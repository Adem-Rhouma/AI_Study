import type Database from 'better-sqlite3';
import { all, get, insert, likeContains, run } from '../../db/sql.js';
import { z } from 'zod';
import { nowIso, parseJsonArray } from '../../lib/domain.js';

export type PathRow = {
  id: number;
  slug: string;
  name: string;
  summary: string;
  description: string;
  audience: string;
  difficulty: string;
  est_hours: number;
  objectives: string;
  completion_criteria: string;
  prerequisites_note: string;
  outcome_note: string;
  status: string;
  is_featured: number;
  order_index: number;
};

export type PathListItem = {
  id: number;
  slug: string;
  name: string;
  summary: string;
  audience: string;
  difficulty: string;
  estHours: number;
  isFeatured: boolean;
  topicCount: number;
  courseCount: number;
  enrolled: boolean;
  status: string | null;
  progress: number;
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

function whereClause(filters: ListFilters): string {
  const clauses: string[] = [];
  if (!filters.canSeeDrafts) clauses.push("p.status = 'published'");
  if (filters.difficulty !== 'all') clauses.push('p.difficulty = @difficulty');
  if (filters.featured) clauses.push('p.is_featured = 1');
  if (filters.q) clauses.push(`(p.name LIKE @q ESCAPE '\\' OR p.summary LIKE @q ESCAPE '\\' OR p.audience LIKE @q ESCAPE '\\')`);
  return clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
}

export function listPaths(db: Database.Database, filters: ListFilters): { items: PathListItem[]; total: number } {
  const where = whereClause(filters);
  const params: Record<string, unknown> = {
    userId: filters.userId ?? 0,
    difficulty: filters.difficulty,
    q: likeContains(filters.q)
  };
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT p.id, p.slug, p.name, p.summary, p.audience, p.difficulty, p.est_hours, p.is_featured,
            (SELECT COUNT(*) FROM learning_path_topics x WHERE x.path_id = p.id) AS topic_count,
            (SELECT COUNT(*) FROM learning_path_courses y WHERE y.path_id = p.id) AS course_count,
            e.status AS enrollment_status
       FROM learning_paths p
       LEFT JOIN path_enrollments e ON e.path_id = p.id AND e.user_id = @userId
       ${where}
      ORDER BY p.is_featured DESC, p.order_index ASC, p.name ASC
      LIMIT @limit OFFSET @offset`,
    { ...params, limit: filters.limit, offset: filters.offset }
  );
  const totalRow = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM learning_paths p ${where}`, params);

  const items: PathListItem[] = rows.map((row) => ({
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    summary: String(row.summary ?? ''),
    audience: String(row.audience ?? ''),
    difficulty: String(row.difficulty),
    estHours: Number(row.est_hours ?? 0),
    isFeatured: Number(row.is_featured) === 1,
    topicCount: Number(row.topic_count ?? 0),
    courseCount: Number(row.course_count ?? 0),
    enrolled: row.enrollment_status !== null,
    status: row.enrollment_status === null ? null : String(row.enrollment_status),
    progress: 0
  }));

  if (filters.userId !== null && items.length > 0) {
    const progress = progressForPaths(
      db,
      filters.userId,
      items.map((item) => item.id)
    );
    for (const item of items) item.progress = progress.get(item.id)?.percent ?? 0;
  }
  return { items, total: Number(totalRow?.c ?? 0) };
}

/** Progress for many paths in ONE query — the list view must not fan out per path. */
export function progressForPaths(
  db: Database.Database,
  userId: number,
  pathIds: number[]
): Map<number, PathProgress> {
  const result = new Map<number, PathProgress>();
  if (pathIds.length === 0) return result;
  const ids = pathIds.map((id) => Number(id)).join(',');
  const rows = all<Record<string, number>>(
    db,
    `WITH units AS (
       SELECT x.path_id, 'topic' AS kind, x.topic_id AS topic_id, NULL AS course_id
         FROM learning_path_topics x WHERE x.path_id IN (${ids})
       UNION ALL
       SELECT y.path_id, 'course', NULL, y.course_id
         FROM learning_path_courses y WHERE y.path_id IN (${ids})
     )
     SELECT u.path_id,
            SUM(CASE WHEN u.kind = 'topic' THEN 1 ELSE 0 END) AS topics_total,
            SUM(CASE WHEN u.kind = 'topic' AND m.level IN ('practising','proficient','mastered') THEN 1 ELSE 0 END) AS topics_done,
            SUM(CASE WHEN u.kind = 'course' THEN 1 ELSE 0 END) AS courses_total,
            SUM(CASE WHEN u.kind = 'course' AND e.completed_at IS NOT NULL THEN 1 ELSE 0 END) AS courses_done
       FROM units u
       LEFT JOIN topic_mastery m ON m.topic_id = u.topic_id AND m.user_id = @userId
       LEFT JOIN course_enrollments e ON e.course_id = u.course_id AND e.user_id = @userId
      GROUP BY u.path_id`,
    { userId }
  );
  for (const row of rows) {
    const topicsTotal = Number(row.topics_total ?? 0);
    const topicsDone = Number(row.topics_done ?? 0);
    const coursesTotal = Number(row.courses_total ?? 0);
    const coursesDone = Number(row.courses_done ?? 0);
    const units = topicsTotal + coursesTotal;
    result.set(Number(row.path_id), {
      topicsTotal,
      topicsProficient: topicsDone,
      lessonsTotal: coursesTotal,
      lessonsDone: coursesDone,
      percent: units > 0 ? Math.round(((topicsDone + coursesDone) / units) * 1000) / 1000 : 0
    });
  }
  return result;
}

export function pathBySlug(db: Database.Database, slug: string): PathRow | null {
  return get<PathRow>(db, 'SELECT * FROM learning_paths WHERE slug = @slug', { slug }) ?? null;
}

export function objectivesOf(row: PathRow): string[] {
  return parseJsonArray(row.objectives, z.string());
}

export type PathProgress = {
  topicsTotal: number;
  topicsProficient: number;
  lessonsTotal: number;
  lessonsDone: number;
  percent: number;
};

/**
 * A path's topics count as done when the learner reaches `practising` or above — the level rule
 * in docs/adr/0003-mastery-model.md, never mere lesson views.
 */
export function pathProgress(db: Database.Database, userId: number, pathId: number): PathProgress {
  const row = get<Record<string, number>>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM learning_path_topics x WHERE x.path_id = @pathId) AS topics_total,
       (SELECT COUNT(*) FROM learning_path_topics x JOIN topic_mastery m
          ON m.topic_id = x.topic_id AND m.user_id = @userId
        WHERE x.path_id = @pathId
          AND m.level IN ('practising','proficient','mastered')) AS topics_done,
       (SELECT COUNT(DISTINCT l.id) FROM lessons l JOIN lesson_topics lt ON lt.lesson_id = l.id
         JOIN learning_path_topics x ON x.topic_id = lt.topic_id
        WHERE x.path_id = @pathId AND l.status = 'published') AS lessons_total,
       (SELECT COUNT(DISTINCT l.id) FROM lessons l JOIN lesson_topics lt ON lt.lesson_id = l.id
         JOIN learning_path_topics x ON x.topic_id = lt.topic_id
         JOIN lesson_completions lc ON lc.lesson_id = l.id AND lc.user_id = @userId
        WHERE x.path_id = @pathId AND l.status = 'published') AS lessons_done`,
    { pathId, userId }
  );
  const topicsTotal = Number(row?.topics_total ?? 0);
  const topicsDone = Number(row?.topics_done ?? 0);
  const lessonsTotal = Number(row?.lessons_total ?? 0);
  const lessonsDone = Number(row?.lessons_done ?? 0);
  const units = topicsTotal + lessonsTotal;
  return {
    topicsTotal,
    topicsProficient: topicsDone,
    lessonsTotal,
    lessonsDone,
    percent: units > 0 ? Math.round(((topicsDone + lessonsDone) / units) * 1000) / 1000 : 0
  };
}

export type StageRow = { id: number; title: string; summary: string; order_index: number };

export function stagesOf(db: Database.Database, pathId: number): StageRow[] {
  return all<StageRow>(
    db,
    'SELECT * FROM learning_path_stages WHERE path_id = @pathId ORDER BY order_index ASC, id ASC',
    { pathId }
  );
}

export type StageItemRow = {
  kind: 'topic' | 'course';
  id: number;
  slug: string;
  title: string;
  summary: string;
  stage_id: number | null;
  order_index: number;
  is_optional: number;
  note: string | null;
  est_minutes: number;
  done: number;
  level: string | null;
};

/** Topics and courses of one path in a single UNION query, with the learner's state joined in. */
export function stageItems(db: Database.Database, pathId: number, userId: number | null): StageItemRow[] {
  return all<StageItemRow>(
    db,
    `SELECT 'topic' AS kind, t.id, t.slug, t.name AS title, t.definition AS summary,
            x.stage_id, x.order_index, x.is_optional, x.note, t.est_minutes,
            CASE WHEN m.level IN ('practising','proficient','mastered') THEN 1 ELSE 0 END AS done,
            m.level AS level
       FROM learning_path_topics x
       JOIN topics t ON t.id = x.topic_id
       LEFT JOIN topic_mastery m ON m.topic_id = t.id AND m.user_id = @userId
      WHERE x.path_id = @pathId AND t.status = 'published'
     UNION ALL
     SELECT 'course' AS kind, c.id, c.slug, c.title, c.summary,
            y.stage_id, y.order_index, y.is_optional, NULL AS note,
            CAST(c.est_hours * 60 AS INTEGER) AS est_minutes,
            CASE WHEN e.completed_at IS NOT NULL THEN 1 ELSE 0 END AS done,
            NULL AS level
       FROM learning_path_courses y
       JOIN courses c ON c.id = y.course_id
       LEFT JOIN course_enrollments e ON e.course_id = c.id AND e.user_id = @userId
      WHERE y.path_id = @pathId AND c.status = 'published'
      ORDER BY stage_id ASC NULLS LAST, order_index ASC`,
    { pathId, userId: userId ?? 0 }
  );
}

export type EnrollmentRow = {
  user_id: number;
  path_id: number;
  status: string;
  started_at: string;
  goal_date: string | null;
  completed_at: string | null;
};

export function enrollment(db: Database.Database, userId: number, pathId: number): EnrollmentRow | null {
  return get<EnrollmentRow>(
    db,
    'SELECT * FROM path_enrollments WHERE user_id = @userId AND path_id = @pathId',
    { userId, pathId }
  ) ?? null;
}

export function enroll(db: Database.Database, userId: number, pathId: number, goalDate: string | null): void {
  if (enrollment(db, userId, pathId)) {
    run(
      db,
      `UPDATE path_enrollments SET status = 'active' WHERE user_id = @userId AND path_id = @pathId`,
      { userId, pathId }
    );
    return;
  }
  insert(
    db,
    `INSERT INTO path_enrollments (user_id, path_id, status, started_at, goal_date)
     VALUES (@userId, @pathId, 'active', @startedAt, @goalDate)`,
    { userId, pathId, startedAt: nowIso(), goalDate }
  );
}

export function setStatus(
  db: Database.Database,
  userId: number,
  pathId: number,
  status: 'active' | 'paused' | 'completed' | 'abandoned'
): number {
  const completedAt = status === 'completed' ? nowIso() : null;
  return run(
    db,
    `UPDATE path_enrollments SET status = @status, completed_at = COALESCE(@completedAt, completed_at)
      WHERE user_id = @userId AND path_id = @pathId`,
    { userId, pathId, status, completedAt }
  ).changes;
}

export function setGoalDate(db: Database.Database, userId: number, pathId: number, goalDate: string | null): number {
  return run(
    db,
    'UPDATE path_enrollments SET goal_date = @goalDate WHERE user_id = @userId AND path_id = @pathId',
    { userId, pathId, goalDate }
  ).changes;
}

export function unenroll(db: Database.Database, userId: number, pathId: number): number {
  return run(db, 'DELETE FROM path_enrollments WHERE user_id = @userId AND path_id = @pathId', {
    userId,
    pathId
  }).changes;
}

export function prerequisiteTopics(db: Database.Database, pathId: number) {
  return all<{ slug: string; name: string; difficulty: string }>(
    db,
    `SELECT DISTINCT t.slug, t.name, t.difficulty
       FROM topic_relations r
       JOIN learning_path_topics x ON x.topic_id = r.topic_id
       JOIN topics t ON t.id = r.requires_id
      WHERE x.path_id = @pathId AND r.kind = 'strict' AND t.status = 'published'
        AND t.id NOT IN (SELECT topic_id FROM learning_path_topics WHERE path_id = @pathId)
      ORDER BY t.name ASC`,
    { pathId }
  );
}
