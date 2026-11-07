import type Database from 'better-sqlite3';
import { all, get, insert, likeContains, run } from '../../db/sql.js';
import { nowIso } from '../../lib/domain.js';

/** SQL for the Problem Arena. Learner-private reads always bind the SESSION `user_id`. */

export type ExerciseListRow = {
  id: number;
  slug: string;
  kind: string;
  difficulty: string;
  title: string;
  prompt: string;
  points: number;
  status: string;
  topic_slug: string | null;
  topic_name: string | null;
  lesson_slug: string | null;
  hint_count: number;
  attempts: number;
  best_score: number | null;
  last_result: number | null;
};

export type ExerciseFullRow = {
  id: number;
  slug: string;
  kind: string;
  difficulty: string;
  title: string;
  prompt: string;
  context: string;
  answer_spec: unknown;
  solution: string;
  explanation: string;
  answer_note: string;
  points: number;
  status: string;
  lesson_id: number | null;
  topic_slug: string | null;
  topic_name: string | null;
  lesson_slug: string | null;
  lesson_title: string | null;
};

export type OptionRow = { id: number; label: string; text: string; is_correct: number; position: number; feedback: string | null };
export type HintRow = { id: number; position: number; text: string };

export function listExercises(
  db: Database.Database,
  filters: {
    topic?: string;
    difficulty?: string;
    kind?: string;
    q?: string;
    status: string;
    userId: number | null;
    limit: number;
    offset: number;
  }
): { rows: ExerciseListRow[]; total: number } {
  const user = filters.userId ?? 0;
  const where: string[] = [];
  const params: Record<string, unknown> = { user };
  if (filters.status === 'all') {
    where.push('1 = 1');
  } else {
    where.push("e.status = 'published'");
    if (filters.status !== 'published') where.push('1 = 0');
  }
  if (filters.topic) {
    where.push(`(t.slug = @topic OR EXISTS (SELECT 1 FROM exercise_topics et2 JOIN topics t2 ON t2.id = et2.topic_id
                 WHERE et2.exercise_id = e.id AND t2.slug = @topic))`);
    params.topic = filters.topic;
  }
  if (filters.difficulty && filters.difficulty !== 'all') {
    where.push('e.difficulty = @difficulty');
    params.difficulty = filters.difficulty;
  }
  if (filters.kind && filters.kind !== 'all') {
    where.push('e.kind = @kind');
    params.kind = filters.kind;
  }
  if (filters.q) {
    where.push("(e.title LIKE @q ESCAPE '\\' OR e.prompt LIKE @q ESCAPE '\\')");
    params.q = likeContains(filters.q);
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const from = `FROM exercises e LEFT JOIN topics t ON t.id = e.topic_id LEFT JOIN lessons l ON l.id = e.lesson_id`;
  const total = get<{ c: number }>(db, `SELECT COUNT(*) AS c ${from} ${clause}`, params);
  const rows = all<ExerciseListRow>(
    db,
    `SELECT e.id, e.slug, e.kind, e.difficulty, e.title, e.prompt, e.points, e.status,
            t.slug AS topic_slug, t.name AS topic_name, l.slug AS lesson_slug,
            (SELECT COUNT(*) FROM exercise_hints h WHERE h.exercise_id = e.id) AS hint_count,
            (SELECT COUNT(*) FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = @user) AS attempts,
            (SELECT MAX(a.score) FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = @user) AS best_score,
            (SELECT a.is_correct FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = @user
              ORDER BY a.id DESC LIMIT 1) AS last_result
     ${from} ${clause}
     ORDER BY e.difficulty, e.title LIMIT @limit OFFSET @offset`,
    { ...params, limit: filters.limit, offset: filters.offset }
  );
  return { rows, total: Number(total?.c ?? rows.length) };
}

export function getExerciseBySlug(db: Database.Database, slug: string): ExerciseFullRow | null {
  const row = get<ExerciseFullRow>(
    db,
    `SELECT e.id, e.slug, e.kind, e.difficulty, e.title, e.prompt, e.context, e.answer_spec, e.solution,
            e.explanation, e.answer_note, e.points, e.status, e.lesson_id,
            t.slug AS topic_slug, t.name AS topic_name, l.slug AS lesson_slug, l.title AS lesson_title
       FROM exercises e
       LEFT JOIN topics t ON t.id = e.topic_id
       LEFT JOIN lessons l ON l.id = e.lesson_id
      WHERE e.slug = @slug`,
    { slug }
  );
  return row ?? null;
}

export function optionsOf(db: Database.Database, exerciseId: number): OptionRow[] {
  return all<OptionRow>(
    db,
    'SELECT id, label, text, is_correct, position, feedback FROM exercise_options WHERE exercise_id = @id ORDER BY position, id',
    { id: exerciseId }
  );
}

export function hintsOf(db: Database.Database, exerciseId: number): HintRow[] {
  return all<HintRow>(db, 'SELECT id, position, text FROM exercise_hints WHERE exercise_id = @id ORDER BY position, id', {
    id: exerciseId
  });
}

export function topicsOf(db: Database.Database, exerciseId: number): { slug: string; name: string }[] {
  return all<{ slug: string; name: string }>(
    db,
    `SELECT DISTINCT t.slug, t.name FROM topics t
      WHERE t.id = (SELECT topic_id FROM exercises WHERE id = @id)
         OR EXISTS (SELECT 1 FROM exercise_topics et WHERE et.exercise_id = @id AND et.topic_id = t.id)
      ORDER BY t.name`,
    { id: exerciseId }
  );
}

export function tagsOf(db: Database.Database, exerciseId: number): string[] {
  return all<{ name: string }>(
    db,
    `SELECT g.name FROM tags g JOIN exercise_tags gt ON gt.tag_id = g.id WHERE gt.exercise_id = @id ORDER BY g.name`,
    { id: exerciseId }
  ).map((row) => row.name);
}

export function relatedTopicsOf(db: Database.Database, exerciseId: number): { slug: string; name: string }[] {
  return all<{ slug: string; name: string }>(
    db,
    `SELECT t.slug, t.name FROM topics t
      WHERE t.status = 'published'
        AND (t.id = (SELECT topic_id FROM exercises WHERE id = @id)
             OR EXISTS (SELECT 1 FROM exercise_topics et WHERE et.exercise_id = @id AND et.topic_id = t.id)
             OR EXISTS (SELECT 1 FROM lesson_topics lt JOIN lessons l ON l.id = lt.lesson_id
                         WHERE l.id = (SELECT lesson_id FROM exercises WHERE id = @id) AND lt.topic_id = t.id))
        AND t.id <> COALESCE((SELECT topic_id FROM exercises WHERE id = @id), -1)
      ORDER BY t.name LIMIT 6`,
    { id: exerciseId }
  );
}

export function attemptHistory(db: Database.Database, userId: number, exerciseId: number, limit = 10) {
  return all<Record<string, unknown>>(
    db,
    `SELECT id, attempt_index, hints_used, score, is_correct, duration_seconds, feedback, submitted, created_at
       FROM exercise_attempts WHERE user_id = @user AND exercise_id = @exercise
      ORDER BY id DESC LIMIT @limit`,
    { user: userId, exercise: exerciseId, limit }
  );
}

export function listAttempts(db: Database.Database, userId: number, filters: { topic?: string; limit: number; offset: number }) {
  const where: string[] = ['a.user_id = @user'];
  const params: Record<string, unknown> = { user: userId, limit: filters.limit, offset: filters.offset };
  if (filters.topic) {
    where.push(`(t.slug = @topic OR EXISTS (SELECT 1 FROM exercise_topics et JOIN topics t2 ON t2.id = et.topic_id
                 WHERE et.exercise_id = a.exercise_id AND t2.slug = @topic))`);
    params.topic = filters.topic;
  }
  const clause = `FROM exercise_attempts a JOIN exercises e ON e.id = a.exercise_id
                  LEFT JOIN topics t ON t.id = e.topic_id WHERE ${where.join(' AND ')}`;
  const total = get<{ c: number }>(db, `SELECT COUNT(*) AS c ${clause}`, params);
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT a.id, a.attempt_index, a.hints_used, a.score, a.is_correct, a.duration_seconds,
            a.feedback, a.created_at, e.slug AS exercise_slug, e.title AS exercise_title,
            e.kind, e.difficulty, t.slug AS topic_slug
     ${clause} ORDER BY a.id DESC LIMIT @limit OFFSET @offset`,
    params
  );
  return { rows, total: Number(total?.c ?? rows.length) };
}

export function insertAttempt(
  db: Database.Database,
  input: {
    userId: number;
    exerciseId: number;
    submitted: unknown;
    isCorrect: boolean | null;
    score: number;
    hintsUsed: number;
    attemptIndex: number;
    durationSeconds: number | null;
    feedback: string;
  }
): number {
  return insert(
    db,
    `INSERT INTO exercise_attempts
       (user_id, exercise_id, submitted, is_correct, score, hints_used, attempt_index, duration_seconds, feedback, created_at)
     VALUES (@user, @exercise, @submitted, @isCorrect, @score, @hintsUsed, @attemptIndex, @duration, @feedback, @timestamp)`,
    {
      user: input.userId,
      exercise: input.exerciseId,
      submitted: JSON.stringify(input.submitted ?? {}),
      isCorrect: input.isCorrect === null ? null : input.isCorrect ? 1 : 0,
      score: input.score,
      hintsUsed: input.hintsUsed,
      attemptIndex: input.attemptIndex,
      duration: input.durationSeconds,
      feedback: input.feedback,
      timestamp: nowIso()
    }
  );
}

export function countAttempts(db: Database.Database, userId: number, exerciseId: number): number {
  return Number(
    get<{ c: number }>(db, 'SELECT COUNT(*) AS c FROM exercise_attempts WHERE user_id = @user AND exercise_id = @exercise', {
      user: userId,
      exercise: exerciseId
    })?.c ?? 0
  );
}

/**
 * Hint unlocks are recorded as activity rows against the hint id and consumed by the next graded
 * attempt for the same exercise: `hints_used` counts unlocks after the last `attempt` marker, so
 * the discount is a real server-side effect and never trusts the client.
 */
export function countPendingHintUnlocks(db: Database.Database, userId: number, exerciseId: number): number {
  return Number(
    get<{ c: number }>(
      db,
      `SELECT COUNT(*) AS c FROM activity_log
        WHERE user_id = @user AND action = 'hint_unlocked' AND entity_type = 'exercise_hint'
          AND entity_id IN (SELECT id FROM exercise_hints WHERE exercise_id = @exercise)
          AND id > COALESCE((SELECT MAX(id) FROM activity_log
                               WHERE user_id = @user AND action = 'attempt'
                                 AND entity_type = 'exercise' AND entity_id = @exercise), 0)`,
      { user: userId, exercise: exerciseId }
    )?.c ?? 0
  );
}

export function unlockedHintIds(db: Database.Database, userId: number, exerciseId: number): number[] {
  return all<{ id: number }>(
    db,
    `SELECT DISTINCT entity_id AS id FROM activity_log
      WHERE user_id = @user AND action = 'hint_unlocked' AND entity_type = 'exercise_hint'
        AND entity_id IN (SELECT id FROM exercise_hints WHERE exercise_id = @exercise)`,
    { user: userId, exercise: exerciseId }
  ).map((r) => Number(r.id));
}

export function logHintUnlock(db: Database.Database, userId: number, hintId: number): void {
  const timestamp = nowIso();
  run(
    db,
    `INSERT INTO activity_log (user_id, day, action, entity_type, entity_id, minutes, created_at)
     VALUES (@user, @day, 'hint_unlocked', 'exercise_hint', @hint, 0, @timestamp)`,
    { user: userId, day: timestamp.slice(0, 10), hint: hintId, timestamp }
  );
}

export function logAttemptMarker(db: Database.Database, userId: number, exerciseId: number, minutes: number): void {
  const timestamp = nowIso();
  run(
    db,
    `INSERT INTO activity_log (user_id, day, action, entity_type, entity_id, minutes, created_at)
     VALUES (@user, @day, 'attempt', 'exercise', @exercise, @minutes, @timestamp)`,
    { user: userId, day: timestamp.slice(0, 10), exercise: exerciseId, minutes, timestamp }
  );
}

export function attemptsByDifficulty(db: Database.Database, userId: number) {
  return all<{ difficulty: string; attempts: number; correct: number; awaiting_review: number; hints_used: number; score: number }>(
    db,
    `SELECT e.difficulty,
            COUNT(*) AS attempts,
            SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END) AS correct,
            SUM(CASE WHEN a.is_correct IS NULL THEN 1 ELSE 0 END) AS awaiting_review,
            COALESCE(SUM(a.hints_used), 0) AS hints_used,
            COALESCE(SUM(a.score), 0) AS score
       FROM exercise_attempts a JOIN exercises e ON e.id = a.exercise_id
      WHERE a.user_id = @user GROUP BY e.difficulty ORDER BY e.difficulty`,
    { user: userId }
  );
}

export function attemptTotals(db: Database.Database, userId: number) {
  return get<{ attempts: number; correct: number; awaiting_review: number; hints_used: number; exercises: number }>(
    db,
    `SELECT COUNT(*) AS attempts,
            COALESCE(SUM(CASE WHEN a.is_correct = 1 THEN 1 ELSE 0 END), 0) AS correct,
            COALESCE(SUM(CASE WHEN a.is_correct IS NULL THEN 1 ELSE 0 END), 0) AS awaiting_review,
            COALESCE(SUM(a.hints_used), 0) AS hints_used,
            COUNT(DISTINCT a.exercise_id) AS exercises
       FROM exercise_attempts a WHERE a.user_id = @user`,
    { user: userId }
  );
}

export function hintUnlockTotal(db: Database.Database, userId: number): number {
  return Number(
    get<{ c: number }>(
      db,
      `SELECT COUNT(*) AS c FROM activity_log WHERE user_id = @user AND action = 'hint_unlocked' AND entity_type = 'exercise'`,
      { user: userId }
    )?.c ?? 0
  );
}

export function masteryExtremes(db: Database.Database, userId: number, direction: 'weak' | 'strong') {
  return all<{ slug: string; name: string; level: string; score: number; attempts: number }>(
    db,
    `SELECT t.slug, t.name, m.level, m.score, m.attempts
       FROM topic_mastery m JOIN topics t ON t.id = m.topic_id
      WHERE m.user_id = @user AND m.attempts > 0
      ORDER BY m.score ${direction === 'weak' ? 'ASC' : 'DESC'}, t.name ASC LIMIT 3`,
    { user: userId }
  );
}

export function recommendFromPartialCoverage(db: Database.Database, userId: number, difficulty: string, limit: number) {
  return all<ExerciseListRow & { topic_slug: string; coverage: number }>(
    db,
    `SELECT e.id, e.slug, e.kind, e.difficulty, e.title, e.prompt, e.points, e.status,
            t.slug AS topic_slug, t.name AS topic_name, NULL AS lesson_slug,
            (SELECT COUNT(*) FROM exercise_hints h WHERE h.exercise_id = e.id) AS hint_count,
            (SELECT COUNT(*) FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = @user) AS attempts,
            (SELECT MAX(a.score) FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = @user) AS best_score,
            NULL AS last_result,
            tm.coverage AS coverage
       FROM exercises e
       JOIN exercise_topics et ON et.exercise_id = e.id
       JOIN topic_mastery tm ON tm.topic_id = et.topic_id AND tm.user_id = @user
       JOIN topics t ON t.id = et.topic_id
      WHERE e.status = 'published' AND tm.coverage > 0 AND tm.attempts < 5
        AND (SELECT COUNT(*) FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = @user) < 5
      ORDER BY CASE WHEN e.difficulty = @difficulty THEN 0 ELSE 1 END, tm.score ASC, e.difficulty, e.title
      LIMIT @limit`,
    { user: userId, difficulty, limit }
  );
}

export function recommendFallback(db: Database.Database, userId: number, difficulty: string, excludeIds: number[], limit: number) {
  if (limit <= 0) return [];
  const binds: Record<string, unknown> = { user: userId, difficulty, limit };
  const placeholders = excludeIds.map((id, i) => {
    binds[`x${i}`] = Number(id);
    return `@x${i}`;
  });
  const notIn = excludeIds.length > 0 ? `AND e.id NOT IN (${placeholders.join(',')})` : '';
  return all<ExerciseListRow & { topic_slug: string | null; coverage: number | null }>(
    db,
    `SELECT e.id, e.slug, e.kind, e.difficulty, e.title, e.prompt, e.points, e.status,
            t.slug AS topic_slug, t.name AS topic_name, NULL AS lesson_slug,
            (SELECT COUNT(*) FROM exercise_hints h WHERE h.exercise_id = e.id) AS hint_count,
            (SELECT COUNT(*) FROM exercise_attempts a WHERE a.exercise_id = e.id AND a.user_id = @user) AS attempts,
            NULL AS best_score, NULL AS last_result, NULL AS coverage
       FROM exercises e LEFT JOIN topics t ON t.id = e.topic_id
      WHERE e.status = 'published' ${notIn}
      ORDER BY CASE WHEN e.difficulty = @difficulty THEN 0 ELSE 1 END, attempts ASC, e.difficulty, e.title
      LIMIT @limit`,
    binds
  );
}
