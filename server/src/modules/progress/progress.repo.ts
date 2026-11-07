import type Database from 'better-sqlite3';
import { all, get, likeContains, run } from '../../db/sql.js';
import { nowIso } from '../../lib/domain.js';

/**
 * SQL access for the mastery / progress surface. Everything learner-private filters on
 * `user_id = @userId` supplied by the service from the SESSION.
 */

export type MasterySources = {
  lessonsTotal: number;
  lessonsDone: number;
  lastCompletionAt: string | null;
  attempts: AttemptEvidence[];
};

export type AttemptEvidence = {
  is_correct: number | null;
  score: number;
  hints_used: number;
  created_at: string;
  submitted: unknown;
};

export type MasteryRow = {
  user_id: number;
  topic_id: number;
  coverage: number;
  performance: number;
  retention: number;
  score: number;
  level: string;
  attempts: number;
  lessons_done: number;
  last_touched_at: string | null;
  updated_at: string;
};

export function topicIdsForLesson(db: Database.Database, lessonId: number): number[] {
  return all<{ topic_id: number }>(db, 'SELECT topic_id FROM lesson_topics WHERE lesson_id = @lesson', {
    lesson: lessonId
  }).map((r) => Number(r.topic_id));
}

/** An exercise's topic plus any topics attached through the join table. */
export function topicIdsForExercise(db: Database.Database, exerciseId: number): number[] {
  return all<{ id: number }>(
    db,
    `SELECT DISTINCT t.id
       FROM topics t
      WHERE t.id = (SELECT topic_id FROM exercises WHERE id = @exercise)
         OR EXISTS (SELECT 1 FROM exercise_topics et WHERE et.exercise_id = @exercise AND et.topic_id = t.id)`,
    { exercise: exerciseId }
  ).map((row) => Number(row.id));
}

export function loadMasterySources(db: Database.Database, userId: number, topicId: number): MasterySources {
  const head = get<{ lessons_total: number; lessons_done: number; last_completion_at: string | null }>(
    db,
    `SELECT (SELECT COUNT(*) FROM lessons l JOIN lesson_topics lt ON lt.lesson_id = l.id
              WHERE lt.topic_id = @topic AND l.status = 'published') AS lessons_total,
            (SELECT COUNT(*) FROM lesson_completions lc
               JOIN lessons l ON l.id = lc.lesson_id
               JOIN lesson_topics lt ON lt.lesson_id = l.id
              WHERE lt.topic_id = @topic AND lc.user_id = @user AND l.status = 'published') AS lessons_done,
            (SELECT MAX(lc2.completed_at) FROM lesson_completions lc2
               JOIN lesson_topics lt2 ON lt2.lesson_id = lc2.lesson_id
              WHERE lt2.topic_id = @topic AND lc2.user_id = @user) AS last_completion_at`,
    { user: userId, topic: topicId }
  );
  // Exponential weighting means old rows contribute almost nothing, so reading the learner's own
  // attempt history for one topic is bounded by their activity, not by the catalogue.
  const attempts = all<AttemptEvidence>(
    db,
    `SELECT a.is_correct, a.score, a.hints_used, a.created_at, a.submitted
       FROM exercise_attempts a JOIN exercises e ON e.id = a.exercise_id
      WHERE a.user_id = @user
        AND (e.topic_id = @topic
             OR EXISTS (SELECT 1 FROM exercise_topics et WHERE et.exercise_id = e.id AND et.topic_id = @topic))
      ORDER BY a.created_at, a.id`,
    { user: userId, topic: topicId }
  );
  return {
    lessonsTotal: Number(head?.lessons_total ?? 0),
    lessonsDone: Number(head?.lessons_done ?? 0),
    lastCompletionAt: head?.last_completion_at ?? null,
    attempts
  };
}

export type MasteryWrite = {
  coverage: number;
  performance: number;
  retention: number;
  score: number;
  level: string;
  attempts: number;
  lessonsDone: number;
  lastTouchedAt: string | null;
};

export function saveMastery(db: Database.Database, userId: number, topicId: number, state: MasteryWrite): void {
  run(
    db,
    `INSERT INTO topic_mastery
       (user_id, topic_id, coverage, performance, retention, score, level, attempts, lessons_done, last_touched_at, updated_at)
     VALUES (@user, @topic, @coverage, @performance, @retention, @score, @level, @attempts, @lessonsDone, @lastTouchedAt, @timestamp)
     ON CONFLICT (user_id, topic_id) DO UPDATE SET
       coverage = excluded.coverage,
       performance = excluded.performance,
       retention = excluded.retention,
       score = excluded.score,
       level = excluded.level,
       attempts = excluded.attempts,
       lessons_done = excluded.lessons_done,
       last_touched_at = excluded.last_touched_at,
       updated_at = excluded.updated_at`,
    {
      user: userId,
      topic: topicId,
      coverage: state.coverage,
      performance: state.performance,
      retention: state.retention,
      score: state.score,
      level: state.level,
      attempts: state.attempts,
      lessonsDone: state.lessonsDone,
      lastTouchedAt: state.lastTouchedAt,
      timestamp: nowIso()
    }
  );
}

/** Delete only the rows a learner never touched — keeps the table free of permanent zero noise. */
export function dropMasteryIfEmpty(db: Database.Database, userId: number, topicId: number): number {
  return run(
    db,
    `DELETE FROM topic_mastery
      WHERE user_id = @user AND topic_id = @topic
        AND coverage = 0 AND performance = 0 AND score = 0 AND attempts = 0 AND lessons_done = 0`,
    { user: userId, topic: topicId }
  ).changes;
}

export const LEVEL_RANK_SQL = `CASE level
  WHEN 'mastered' THEN 5 WHEN 'proficient' THEN 4 WHEN 'practising' THEN 3
  WHEN 'learning' THEN 2 WHEN 'exposed' THEN 1 ELSE 0 END`;

export function listMastery(
  db: Database.Database,
  userId: number,
  filters: { limit: number; offset: number; q?: string; level?: string; domain?: string }
): { rows: (MasteryRow & { slug: string; name: string; difficulty: string; subdomainName: string; domainName: string })[]; total: number } {
  const clauses = ['m.user_id = @user'];
  if (filters.q) clauses.push(`(t.name LIKE @q ESCAPE '\\' OR t.slug LIKE @q ESCAPE '\\')`);
  if (filters.level && filters.level !== 'all') clauses.push('m.level = @level');
  if (filters.domain && filters.domain !== 'all') clauses.push('d.slug = @domain');
  const where = `WHERE ${clauses.join(' AND ')}`;
  const params = {
    user: userId,
    q: likeContains(filters.q ?? ''),
    level: filters.level ?? 'all',
    domain: filters.domain ?? 'all',
    limit: filters.limit,
    offset: filters.offset
  };
  const rows = all<MasteryRow & { slug: string; name: string; difficulty: string; subdomainName: string; domainName: string }>(
    db,
    `SELECT m.user_id, m.topic_id, m.coverage, m.performance, m.retention, m.score, m.level,
            m.attempts, m.lessons_done, m.last_touched_at, m.updated_at,
            t.slug, t.name, t.difficulty, s.name AS subdomainName, d.name AS domainName
       FROM topic_mastery m
       JOIN topics t ON t.id = m.topic_id
       JOIN subdomains s ON s.id = t.subdomain_id
       JOIN domains d ON d.id = s.domain_id
      ${where}
      ORDER BY ${LEVEL_RANK_SQL} DESC, m.score DESC, t.name ASC
      LIMIT @limit OFFSET @offset`,
    params
  );
  const total = get<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c
       FROM topic_mastery m JOIN topics t ON t.id = m.topic_id
       JOIN subdomains s ON s.id = t.subdomain_id JOIN domains d ON d.id = s.domain_id
      ${where}`,
    params
  );
  return { rows, total: Number(total?.c ?? 0) };
}

export function getMasteryByTopicSlug(
  db: Database.Database,
  userId: number,
  slug: string
): (MasteryRow & { slug: string; name: string; difficulty: string; estMinutes: number; lessonCount: number }) | null {
  const row = get<MasteryRow & { slug: string; name: string; difficulty: string; estMinutes: number; lessonCount: number }>(
    db,
    `SELECT m.user_id, m.topic_id, m.coverage, m.performance, m.retention, m.score, m.level,
            m.attempts, m.lessons_done, m.last_touched_at, m.updated_at,
            t.slug, t.name, t.difficulty, t.est_minutes AS estMinutes,
            (SELECT COUNT(*) FROM lessons l JOIN lesson_topics lt ON lt.lesson_id = l.id
              WHERE lt.topic_id = t.id AND l.status = 'published') AS lessonCount
       FROM topic_mastery m JOIN topics t ON t.id = m.topic_id
      WHERE m.user_id = @user AND t.slug = @slug`,
    { user: userId, slug }
  );
  return row ?? null;
}

export function masteryByLevel(db: Database.Database, userId: number): { level: string; count: number }[] {
  return all<{ level: string; count: number }>(
    db,
    'SELECT level, COUNT(*) AS count FROM topic_mastery WHERE user_id = @user GROUP BY level',
    { user: userId }
  );
}

/** Topics older than `staleBefore` (ISO) that have not reached `proficient`. */
export function revalidationQueue(db: Database.Database, userId: number, staleBefore: string) {
  return all<{ slug: string; name: string; level: string; score: number; lastTouchedAt: string | null }>(
    db,
    `SELECT t.slug, t.name, m.level, m.score, m.last_touched_at AS lastTouchedAt
       FROM topic_mastery m JOIN topics t ON t.id = m.topic_id
      WHERE m.user_id = @user
        AND m.level IN ('new','exposed','learning','practising')
        AND COALESCE(m.last_touched_at, m.updated_at) < @staleBefore
      ORDER BY m.score ASC, t.name ASC
      LIMIT 20`,
    { user: userId, staleBefore }
  );
}

export function overviewAggregates(db: Database.Database, userId: number, weekStart: string) {
  const today = new Date().toISOString().slice(0, 10);
  return get<Record<string, number>>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id
          WHERE lc.user_id = @user AND l.status = 'published') AS lessons_done,
       (SELECT COUNT(DISTINCT a.exercise_id) FROM exercise_attempts a WHERE a.user_id = @user) AS exercises_attempted,
       (SELECT COUNT(*) FROM exercise_attempts a WHERE a.user_id = @user) AS attempts,
       (SELECT COUNT(*) FROM exercise_attempts a WHERE a.user_id = @user AND a.is_correct = 1) AS correct_attempts,
       (SELECT COALESCE(SUM(a.hints_used), 0) FROM exercise_attempts a WHERE a.user_id = @user) AS hints_used,
       (SELECT COUNT(*) FROM topic_mastery m WHERE m.user_id = @user) AS topics_touched,
       (SELECT COUNT(DISTINCT al.day) FROM activity_log al WHERE al.user_id = @user AND al.day >= @weekStart) AS days_active_week,
       (SELECT COALESCE(SUM(al.minutes), 0) FROM activity_log al WHERE al.user_id = @user AND al.day >= @weekStart) AS minutes_week,
       (SELECT COALESCE(SUM(al.minutes), 0) FROM activity_log al WHERE al.user_id = @user AND al.day = @today) AS minutes_today,
       (SELECT up.daily_goal_minutes FROM user_preferences up WHERE up.user_id = @user) AS daily_goal_minutes`,
    { user: userId, weekStart, today }
  );
}

export function activityDays(db: Database.Database, userId: number, fromDay: string) {
  return all<{ day: string; minutes: number; actions: number }>(
    db,
    `SELECT day, SUM(minutes) AS minutes, COUNT(*) AS actions
       FROM activity_log WHERE user_id = @user AND day >= @fromDay
      GROUP BY day ORDER BY day ASC`,
    { user: userId, fromDay }
  );
}

export function enrolledPaths(db: Database.Database, userId: number) {
  return all<{ id: number; slug: string; name: string; status: string; startedAt: string; goalDate: string | null }>(
    db,
    `SELECT p.id, p.slug, p.name, pe.status, pe.started_at AS startedAt, pe.goal_date AS goalDate
       FROM path_enrollments pe JOIN learning_paths p ON p.id = pe.path_id
      WHERE pe.user_id = @user AND p.status = 'published'
      ORDER BY pe.started_at DESC`,
    { user: userId }
  );
}

/**
 * Stage rollups for every path in ONE aggregated query (no N+1 per stage).
 * A stage counts a topic as done when the learner's mastery row for it reaches `proficient`, and a
 * lesson as done when it belongs to this stage's topics. `IS` compares stage ids null-safely, so the
 * unstage bucket (stage_id NULL) aggregates on its own instead of being lost.
 */
export function pathStageCounts(db: Database.Database, userId: number, pathIds: number[]) {
  if (pathIds.length === 0) return [];
  const binds: Record<string, unknown> = { user: userId };
  const placeholders = pathIds.map((id, i) => {
    binds[`p${i}`] = id;
    return `@p${i}`;
  });
  return all<{ path_id: number; stage_id: number | null; topics_total: number; topics_done: number; lessons_total: number; lessons_done: number }>(
    db,
    `SELECT pt.path_id, pt.stage_id,
            COUNT(*) AS topics_total,
            SUM(CASE WHEN m.level IN ('proficient','mastered') THEN 1 ELSE 0 END) AS topics_done,
            (SELECT COUNT(DISTINCT l.id) FROM lessons l
               JOIN lesson_topics lt ON lt.lesson_id = l.id
              WHERE l.status = 'published'
                AND lt.topic_id IN (SELECT topic_id FROM learning_path_topics x
                                     WHERE x.path_id = pt.path_id AND x.stage_id IS pt.stage_id)) AS lessons_total,
            (SELECT COUNT(DISTINCT l.id) FROM lesson_completions lc
               JOIN lessons l ON l.id = lc.lesson_id
               JOIN lesson_topics lt ON lt.lesson_id = l.id
              WHERE lc.user_id = @user AND l.status = 'published'
                AND lt.topic_id IN (SELECT topic_id FROM learning_path_topics x
                                     WHERE x.path_id = pt.path_id AND x.stage_id IS pt.stage_id)) AS lessons_done
       FROM learning_path_topics pt
       LEFT JOIN topic_mastery m ON m.topic_id = pt.topic_id AND m.user_id = @user
      WHERE pt.path_id IN (${placeholders.join(',')})
      GROUP BY pt.path_id, pt.stage_id`,
    binds
  );
}

export function stageTitles(db: Database.Database, pathIds: number[]) {
  if (pathIds.length === 0) return [];
  const binds: Record<string, unknown> = {};
  const placeholders = pathIds.map((id, i) => {
    binds[`p${i}`] = id;
    return `@p${i}`;
  });
  return all<{ id: number | null; path_id: number; title: string; order_index: number }>(
    db,
    `SELECT id, path_id, title, order_index FROM learning_path_stages
      WHERE path_id IN (${placeholders.join(',')}) ORDER BY path_id, order_index`,
    binds
  );
}

export function exportMastery(db: Database.Database, userId: number) {
  return all<Record<string, unknown>>(
    db,
    `SELECT t.slug AS topic_slug, m.coverage, m.performance, m.retention, m.score, m.level,
            m.attempts, m.lessons_done, m.last_touched_at, m.updated_at
       FROM topic_mastery m JOIN topics t ON t.id = m.topic_id WHERE m.user_id = @user ORDER BY t.slug`,
    { user: userId }
  );
}

export function exportCompletions(db: Database.Database, userId: number) {
  return all<Record<string, unknown>>(
    db,
    `SELECT l.slug AS lesson_slug, lc.source, lc.max_scroll, lc.last_block_index, lc.duration_seconds,
            lc.completed_at, lc.updated_at
       FROM lesson_completions lc JOIN lessons l ON l.id = lc.lesson_id
      WHERE lc.user_id = @user ORDER BY lc.completed_at`,
    { user: userId }
  );
}

export function exportAttempts(db: Database.Database, userId: number) {
  return all<Record<string, unknown>>(
    db,
    `SELECT e.slug AS exercise_slug, a.attempt_index, a.hints_used, a.score, a.is_correct,
            a.duration_seconds, a.feedback, a.created_at
       FROM exercise_attempts a JOIN exercises e ON e.id = a.exercise_id
      WHERE a.user_id = @user ORDER BY a.id`,
    { user: userId }
  );
}

export function exportActivity(db: Database.Database, userId: number) {
  return all<Record<string, unknown>>(
    db,
    `SELECT day, action, entity_type, entity_id, minutes, created_at FROM activity_log
      WHERE user_id = @user ORDER BY id`,
    { user: userId }
  );
}
