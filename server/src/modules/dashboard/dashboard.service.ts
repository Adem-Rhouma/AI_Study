import type Database from 'better-sqlite3';
import { all, get } from '../../db/sql.js';
import { getPreferences } from '../auth/auth.repo.js';
import { listCompetitions } from '../events/events.repo.js';
import { difficultyRank, type Difficulty } from '../../lib/domain.js';

/**
 * Dashboard aggregator. Every card is one real, bounded query set — no placeholder stats,
 * and every learner-scoped read filters by the SESSION user id only.
 *
 * Note on layering: the brief allocates this module only a service + routes file, so the
 * dashboard's read-only aggregation queries live here (through the db/sql helpers) rather
 * than in a repo file. They never write and never leave the session-user boundary.
 */

const MASTERY_LEVELS = ['new', 'exposed', 'learning', 'practising', 'proficient', 'mastered'] as const;

function isoDay(offsetDays: number): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function curriculumStats(db: Database.Database) {
  const row = get<Record<string, number>>(
    db,
    `SELECT
       (SELECT COUNT(*) FROM domains) AS domains,
       (SELECT COUNT(*) FROM subdomains) AS subdomains,
       (SELECT COUNT(*) FROM topics WHERE status = 'published') AS topics,
       (SELECT COUNT(*) FROM courses WHERE status = 'published') AS courses,
       (SELECT COUNT(*) FROM lessons WHERE status = 'published') AS lessons,
       (SELECT COUNT(*) FROM exercises WHERE status = 'published') AS exercises,
       (SELECT COUNT(*) FROM resources WHERE status = 'published') AS resources,
       (SELECT COUNT(*) FROM learning_paths WHERE status = 'published') AS paths,
       (SELECT COUNT(*) FROM curated_collections) AS collections,
       (SELECT COUNT(*) FROM milestones) AS milestones,
       (SELECT COUNT(*) FROM competitions WHERE status <> 'closed') AS events`
  );
  return Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k, Number(v)]));
}

function continueLearning(db: Database.Database, userId: number) {
  const recent = all<Record<string, unknown>>(
    db,
    `SELECT lc.lesson_id, lc.max_scroll, lc.last_block_index, lc.updated_at, lc.completed_at,
            l.slug, l.title, l.est_minutes, l.order_index, l.course_id,
            c.slug AS course_slug, c.title AS course_title
     FROM lesson_completions lc
     JOIN lessons l ON l.id = lc.lesson_id
     JOIN courses c ON c.id = l.course_id
     WHERE lc.user_id = @userId
     ORDER BY lc.updated_at DESC
     LIMIT 4`,
    { userId }
  );
  if (recent.length === 0) return [];
  // One follow-up query pulls every published lesson of the touched courses (with completion
  // flags) so "next lesson" is computed in JS instead of a per-row subquery loop.
  const courseIds = [...new Set(recent.map((r) => Number(r.course_id)))].map((n) => String(n)).join(',');
  const courseLessons = all<Record<string, unknown>>(
    db,
    `SELECT l.id, l.course_id, l.order_index, l.slug, l.title, l.est_minutes,
            EXISTS (SELECT 1 FROM lesson_completions lc WHERE lc.lesson_id = l.id AND lc.user_id = @userId) AS done
     FROM lessons l
     WHERE l.status = 'published' AND l.course_id IN (${courseIds})
     ORDER BY l.course_id, l.order_index`,
    { userId }
  );
  return recent.map((r) => {
    const courseId = Number(r.course_id);
    const orderIndex = Number(r.order_index);
    const siblings = courseLessons.filter((l) => Number(l.course_id) === courseId);
    const undone = siblings.filter((l) => Number(l.done) !== 1);
    const next = undone.find((l) => Number(l.order_index) > orderIndex) ?? undone[0];
    return {
      lessonSlug: String(r.slug),
      lessonTitle: String(r.title),
      courseSlug: String(r.course_slug),
      courseTitle: String(r.course_title),
      estMinutes: Number(r.est_minutes),
      position: { maxScroll: Number(r.max_scroll), lastBlockIndex: Number(r.last_block_index) },
      completedAt: String(r.completed_at),
      updatedAt: String(r.updated_at),
      nextLesson: next
        ? { slug: String(next.slug), title: String(next.title), estMinutes: Number(next.est_minutes) }
        : null
    };
  });
}

function activePaths(db: Database.Database, userId: number) {
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT p.id, p.slug, p.name, pe.status, pe.started_at, pe.goal_date,
            (SELECT COUNT(*) FROM learning_path_stages st WHERE st.path_id = p.id) AS stage_count,
            (SELECT COUNT(*) FROM learning_path_topics pt WHERE pt.path_id = p.id) AS topic_count,
            (SELECT COUNT(DISTINCT pt.topic_id) FROM learning_path_topics pt WHERE pt.path_id = p.id
              AND EXISTS (SELECT 1 FROM lesson_completions lc JOIN lesson_topics lt ON lt.lesson_id = lc.lesson_id
                           WHERE lt.topic_id = pt.topic_id AND lc.user_id = @userId)) AS topics_done
     FROM path_enrollments pe JOIN learning_paths p ON p.id = pe.path_id
     WHERE pe.user_id = @userId AND pe.status = 'active'
     ORDER BY pe.started_at DESC LIMIT 5`,
    { userId }
  );
  if (rows.length === 0) return [];
  const pathIds = [...new Set(rows.map((r) => Number(r.id)))].map((n) => String(n)).join(',');
  const stages = all<Record<string, unknown>>(
    db,
    `SELECT st.path_id, st.title, st.order_index,
            (SELECT COUNT(*) FROM learning_path_topics pt WHERE pt.stage_id = st.id) AS topic_count,
            (SELECT COUNT(*) FROM learning_path_topics pt WHERE pt.stage_id = st.id
              AND EXISTS (SELECT 1 FROM lesson_completions lc JOIN lesson_topics lt ON lt.lesson_id = lc.lesson_id
                           WHERE lt.topic_id = pt.topic_id AND lc.user_id = @userId)) AS done_count
     FROM learning_path_stages st WHERE st.path_id IN (${pathIds})
     ORDER BY st.path_id, st.order_index`,
    { userId }
  );
  return rows.map((r) => {
    const id = Number(r.id);
    const pathStages = stages
      .filter((s) => Number(s.path_id) === id)
      .map((s) => ({
        title: String(s.title),
        topicCount: Number(s.topic_count),
        doneCount: Number(s.done_count)
      }));
    const current = pathStages.find((s) => s.doneCount < s.topicCount) ?? null;
    return {
      slug: String(r.slug),
      name: String(r.name),
      status: String(r.status),
      startedAt: String(r.started_at),
      goalDate: r.goal_date === null ? null : String(r.goal_date),
      stageCount: Number(r.stage_count),
      topicCount: Number(r.topic_count),
      topicsDone: Number(r.topics_done),
      progressPercent: Number(r.topic_count) ? Math.round((Number(r.topics_done) / Number(r.topic_count)) * 100) : 0,
      currentStage: current ? current.title : pathStages.length ? pathStages[pathStages.length - 1].title : null,
      stages: pathStages
    };
  });
}

function recommendedTopics(db: Database.Database, userId: number) {
  const prefs = getPreferences(db, userId);
  const pref = prefs.default_difficulty as Difficulty;
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT t.id, t.slug, t.name, t.difficulty, t.est_minutes,
            d.name AS domain_name, s.name AS subdomain_name,
            (SELECT COUNT(*) FROM topic_relations r WHERE r.topic_id = t.id AND r.kind = 'strict'
              AND NOT EXISTS (SELECT 1 FROM topic_mastery m WHERE m.user_id = @userId AND m.topic_id = r.requires_id
                               AND m.level IN ('practising','proficient','mastered'))) AS unmet_prereqs,
            (SELECT COUNT(*) FROM learning_path_topics pt JOIN learning_paths p ON p.id = pt.path_id
              AND p.status = 'published' WHERE pt.topic_id = t.id) AS path_count,
            (SELECT COUNT(*) FROM topic_relations r WHERE r.topic_id = t.id AND r.kind = 'strict') AS prereq_count
     FROM topics t
     JOIN subdomains s ON s.id = t.subdomain_id
     JOIN domains d ON d.id = s.domain_id
     WHERE t.status = 'published'
       AND NOT EXISTS (SELECT 1 FROM topic_mastery m WHERE m.user_id = @userId AND m.topic_id = t.id AND m.level <> 'new')
     ORDER BY unmet_prereqs, (CASE t.difficulty WHEN @pref THEN 0 ELSE 1 END),
       (CASE ABS(${diffRankSql('t.difficulty')} - @prefRank) WHEN 0 THEN 0 ELSE 1 END),
       ABS(${diffRankSql('t.difficulty')} - @prefRank), path_count DESC, t.name
     LIMIT 12`,
    { userId, pref, prefRank: difficultyRank[pref] }
  );
  return rows
    .filter((r) => Number(r.unmet_prereqs) === 0)
    .slice(0, 6)
    .map((r) => {
      const difficulty = String(r.difficulty) as Difficulty;
      const pathCount = Number(r.path_count);
      const prereqCount = Number(r.prereq_count);
      const reasons = [
        prereqCount === 0
          ? 'No prerequisites — open to you right now'
          : `All ${prereqCount} prerequisite${prereqCount === 1 ? '' : 's'} at practising or above`
      ];
      reasons.push(
        difficulty === pref
          ? `Matches your ${pref} difficulty preference`
          : `${difficulty[0].toUpperCase()}${difficulty.slice(1)} topic (your preference is ${pref})`
      );
      if (pathCount > 0) reasons.push(`Feeds ${pathCount} unlocked learning path${pathCount === 1 ? '' : 's'}`);
      reasons.push(`About ${Math.max(1, Math.round(Number(r.est_minutes) / 5) * 5)} minutes of study`);
      return {
        slug: String(r.slug),
        name: String(r.name),
        difficulty,
        domain: String(r.domain_name),
        subdomain: String(r.subdomain_name),
        estMinutes: Number(r.est_minutes),
        pathCount,
        reasons
      };
    });
}

function diffRankSql(column: string): string {
  return `CASE ${column} WHEN 'introductory' THEN 0 WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2
    WHEN 'advanced' THEN 3 ELSE 4 END`;
}

function masterySummary(db: Database.Database, userId: number) {
  const counts = all<{ level: string; c: number }>(
    db,
    'SELECT level, COUNT(*) AS c FROM topic_mastery WHERE user_id = @userId GROUP BY level',
    { userId }
  );
  const byLevel = Object.fromEntries(MASTERY_LEVELS.map((l) => [l, 0])) as Record<(typeof MASTERY_LEVELS)[number], number>;
  for (const row of counts) byLevel[row.level as (typeof MASTERY_LEVELS)[number]] = row.c;
  const weakest = all<Record<string, unknown>>(
    db,
    `SELECT t.slug, t.name, m.score, m.level, m.attempts
     FROM topic_mastery m JOIN topics t ON t.id = m.topic_id
     WHERE m.user_id = @userId AND m.attempts > 0
     ORDER BY m.score ASC LIMIT 5`,
    { userId }
  ).map((w) => ({
    slug: String(w.slug),
    name: String(w.name),
    score: Number(Number(w.score).toFixed(4)),
    level: String(w.level),
    attempts: Number(w.attempts)
  }));
  return { byLevel, weakest };
}

function activity(db: Database.Database, userId: number) {
  const prefs = getPreferences(db, userId);
  const from14 = isoDay(-13);
  const series = all<{ day: string; minutes: number }>(
    db,
    `SELECT day, SUM(minutes) AS minutes FROM activity_log
     WHERE user_id = @userId AND day >= @from GROUP BY day ORDER BY day`,
    { userId, from: from14 }
  );
  const activeDays = all<{ day: string }>(
    db,
    'SELECT DISTINCT day FROM activity_log WHERE user_id = @userId AND minutes > 0 ORDER BY day DESC LIMIT 400',
    { userId }
  ).map((r) => r.day);
  let streak = 0;
  let cursor = new Date();
  const hasToday = activeDays.includes(cursor.toISOString().slice(0, 10));
  if (!hasToday) cursor = new Date(cursor.getTime() - 86_400_000); // a streak may also end yesterday
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!activeDays.includes(key)) break;
    streak += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  const from7 = isoDay(-6);
  const weeklyMinutes = series.filter((s) => s.day >= from7).reduce((sum, s) => sum + Number(s.minutes), 0);
  const totalMinutes = Number(
    get<{ m: number | null }>(db, 'SELECT COALESCE(SUM(minutes), 0) AS m FROM activity_log WHERE user_id = @userId', {
      userId
    })?.m ?? 0
  );
  const goal = Number(prefs.daily_goal_minutes);
  return {
    dailyGoalMinutes: goal,
    last14Days: series.map((s) => ({ day: s.day, minutes: Number(s.minutes) })),
    weeklyMinutes,
    weeklyGoalPercent: goal * 7 > 0 ? Math.round((weeklyMinutes / (goal * 7)) * 100) : 0,
    currentStreakDays: streak,
    totalHours: Math.round((totalMinutes / 60) * 10) / 10
  };
}

function savedRecently(db: Database.Database, userId: number) {
  const bookmarks = all<Record<string, unknown>>(
    db,
    `SELECT r.slug, r.title, r.type, ub.created_at
     FROM user_resource_bookmarks ub JOIN resources r ON r.id = ub.resource_id
     WHERE ub.user_id = @userId ORDER BY ub.created_at DESC LIMIT 5`,
    { userId }
  ).map((b) => ({
    slug: String(b.slug),
    title: String(b.title),
    type: String(b.type),
    savedAt: String(b.created_at)
  }));
  const notes = all<Record<string, unknown>>(
    db,
    `SELECT n.id, n.body, n.updated_at,
            COALESCE(l.slug, t.slug, rs.slug, c.slug) AS entity_slug,
            COALESCE(l.title, t.name, rs.title, c.title) AS entity_title,
            CASE WHEN n.lesson_id IS NOT NULL THEN 'lesson'
                 WHEN n.topic_id IS NOT NULL THEN 'topic'
                 WHEN n.resource_id IS NOT NULL THEN 'resource'
                 ELSE 'course' END AS entity_type
     FROM user_notes n
     LEFT JOIN lessons l ON l.id = n.lesson_id
     LEFT JOIN topics t ON t.id = n.topic_id
     LEFT JOIN resources rs ON rs.id = n.resource_id
     LEFT JOIN courses c ON c.id = n.course_id
     WHERE n.user_id = @userId ORDER BY n.updated_at DESC LIMIT 5`,
    { userId }
  ).map((n) => ({
    id: Number(n.id),
    body: String(n.body),
    updatedAt: String(n.updated_at),
    entitySlug: n.entity_slug === null ? null : String(n.entity_slug),
    entityTitle: n.entity_title === null ? null : String(n.entity_title),
    entityType: String(n.entity_type)
  }));
  return { bookmarks, notes };
}

export function getLearnerDashboard(db: Database.Database, userId: number) {
  return {
    authenticated: true,
    continueLearning: continueLearning(db, userId),
    activePaths: activePaths(db, userId),
    recommendedTopics: recommendedTopics(db, userId),
    masterySummary: masterySummary(db, userId),
    activity: activity(db, userId),
    upcomingEvents: listCompetitions(db, { limit: 3, offset: 0 }).items,
    savedRecently: savedRecently(db, userId),
    curriculumStats: curriculumStats(db)
  };
}

/** Anonymous visitors get no learner data at all — just corpus stats and 3 entry-point paths. */
export function getPublicDashboard(db: Database.Database) {
  const entryPoints = all<Record<string, unknown>>(
    db,
    `SELECT slug, name, summary, difficulty, est_hours, is_featured
     FROM learning_paths WHERE status = 'published'
     ORDER BY is_featured DESC,
       CASE difficulty WHEN 'introductory' THEN 0 WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2
         WHEN 'advanced' THEN 3 ELSE 4 END,
       est_hours ASC
     LIMIT 3`
  ).map((p) => ({
    slug: String(p.slug),
    name: String(p.name),
    summary: String(p.summary ?? ''),
    difficulty: String(p.difficulty) as Difficulty,
    estHours: Number(p.est_hours),
    isFeatured: Number(p.is_featured) === 1
  }));
  return { authenticated: false, stats: curriculumStats(db), entryPoints };
}
