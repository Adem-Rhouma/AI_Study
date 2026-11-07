import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../lib/auth-context.js';
import { ApiError, handler, param, queryInt } from '../../lib/http.js';
import { all, get } from '../../db/sql.js';
import { paginationSchema } from '../../lib/domain.js';
import { needsRevalidation, revalidationStaleBefore, whyFromRow } from './mastery.service.js';
import {
  activityDays,
  enrolledPaths,
  exportActivity,
  exportAttempts,
  exportCompletions,
  exportMastery,
  getMasteryByTopicSlug,
  listMastery,
  loadMasterySources,
  masteryByLevel,
  overviewAggregates,
  pathStageCounts,
  revalidationQueue,
  stageTitles
} from './progress.repo.js';

export const progressRouter = Router();

function weekStart(): string {
  const now = new Date();
  const day = (now.getDay() + 6) % 7; // Monday-anchored week
  now.setHours(0, 0, 0, 0);
  now.setDate(now.getDate() - day);
  return now.toISOString().slice(0, 10);
}

/** Consecutive days with recorded activity, counted backwards from today or yesterday. */
function streakFromDays(days: string[]): { current: number; longest: number; todayActive: boolean } {
  const set = new Set(days);
  const iso = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
  const todayActive = set.has(iso(0));
  let current = 0;
  for (let offset = todayActive ? 0 : 1; ; offset++) {
    if (!set.has(iso(-offset))) break;
    current++;
    if (offset > 400) break;
  }
  const sorted = [...set].sort();
  let longest = 0;
  let run = 0;
  let previous: number | null = null;
  for (const day of sorted) {
    const stamp = Date.parse(day);
    run = previous !== null && stamp - previous === 86_400_000 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = stamp;
  }
  return { current, longest, todayActive };
}

const masteryListSchema = paginationSchema.extend({
  q: z.string().trim().max(120).default(''),
  level: z.string().trim().max(24).default('all'),
  domain: z.string().trim().max(96).default('all')
});

progressRouter.use(requireAuth);

progressRouter.get(
  '/overview',
  handler((req, res) => {
    const userId = req.user!.id;
    const aggregates = overviewAggregates(req.db, userId, weekStart()) ?? {};
    const levels = masteryByLevel(req.db, userId);
    const days = activityDays(req.db, userId, new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10));
    const streak = streakFromDays(days.map((row) => row.day));
    const due = revalidationQueue(req.db, userId, revalidationStaleBefore());
    const totals = Object.fromEntries(Object.entries(aggregates).map(([key, value]) => [key, Number(value ?? 0)]));
    const attempts = totals.attempts ?? 0;
    res.json({
      overview: {
        lessonsDone: totals.lessons_done ?? 0,
        exercisesAttempted: totals.exercises_attempted ?? 0,
        attempts: totals.attempts ?? 0,
        correctAttempts: totals.correct_attempts ?? 0,
        accuracy: attempts > 0 ? Math.round(((totals.correct_attempts ?? 0) / attempts) * 1000) / 1000 : 0,
        hintsUsed: totals.hints_used ?? 0,
        topicsTouched: totals.topics_touched ?? 0,
        minutesWeek: totals.minutes_week ?? 0,
        minutesToday: totals.minutes_today ?? 0,
        daysActiveWeek: totals.days_active_week ?? 0,
        dailyGoalMinutes: totals.daily_goal_minutes ?? 0
      },
      levels: levels.map((row) => ({ level: row.level, count: Number(row.count) })),
      streak,
      dueForReview: due
    });
  })
);

progressRouter.get(
  '/mastery',
  handler((req, res) => {
    const query = masteryListSchema.parse(req.query);
    const { rows, total } = listMastery(req.db, req.user!.id, {
      q: query.q,
      level: query.level,
      domain: query.domain,
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      mastery: rows.map((row) => {
        const state = whyFromRow(row);
        return {
          ...state,
          topicSlug: row.slug,
          topicName: row.name,
          difficulty: row.difficulty,
          subdomainName: row.subdomainName,
          domainName: row.domainName,
          needsRevalidation: needsRevalidation(state)
        };
      }),
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage))
    });
  })
);

progressRouter.get(
  '/mastery/:topicSlug',
  handler((req, res) => {
    const slug = param(req, 'topicSlug');
    const userId = req.user!.id;
    const row = getMasteryByTopicSlug(req.db, userId, slug);
    if (!row) throw ApiError.notFound(`No mastery record for "${slug}". Study a lesson or solve an exercise first.`);
    const state = whyFromRow(row);
    const sources = loadMasterySources(req.db, userId, row.topic_id);
    res.json({
      topicSlug: row.slug,
      topicName: row.name,
      difficulty: row.difficulty,
      mastery: state,
      why: state.reasons,
      evidence: {
        lessons: { total: sources.lessonsTotal, done: sources.lessonsDone, lastCompletionAt: sources.lastCompletionAt },
        attempts: sources.attempts.map((attempt) => ({
          at: attempt.created_at,
          correct: attempt.is_correct === null ? null : attempt.is_correct === 1,
          score: Number(attempt.score),
          hintsUsed: Number(attempt.hints_used)
        }))
      }
    });
  })
);

progressRouter.get(
  '/activity',
  handler((req, res) => {
    const days = queryInt(req, 'days', 90, 7, 400);
    const from = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const rows = activityDays(req.db, req.user!.id, from);
    res.json({
      days: rows.map((row) => ({ day: row.day, minutes: Number(row.minutes), actions: Number(row.actions) })),
      from
    });
  })
);

progressRouter.get(
  '/review',
  handler((req, res) => {
    res.json({ queue: revalidationQueue(req.db, req.user!.id, revalidationStaleBefore()) });
  })
);

progressRouter.get(
  '/paths',
  handler((req, res) => {
    const userId = req.user!.id;
    const enrollments = enrolledPaths(req.db, userId);
    const pathIds = enrollments.map((row) => Number(row.id));
    const counts = pathStageCounts(req.db, userId, pathIds);
    const titles = stageTitles(req.db, pathIds);
    const titleByStage = new Map(titles.map((row) => [`${row.path_id}:${row.id}`, row.title]));
    res.json({
      paths: enrollments.map((row) => ({
        slug: row.slug,
        name: row.name,
        status: row.status,
        startedAt: row.startedAt,
        goalDate: row.goalDate,
        stages: counts
          .filter((count) => Number(count.path_id) === Number(row.id))
          .map((count) => ({
            stageId: count.stage_id === null ? null : Number(count.stage_id),
            title: titleByStage.get(`${row.id}:${count.stage_id}`) ?? 'Unordered',
            topicsTotal: Number(count.topics_total),
            topicsDone: Number(count.topics_done),
            lessonsTotal: Number(count.lessons_total),
            lessonsDone: Number(count.lessons_done)
          }))
      }))
    });
  })
);

/** Full personal-data export: every row this account owns, as JSON. */
progressRouter.get(
  '/export',
  handler((req, res) => {
    const userId = req.user!.id;
    res.json({
      exportedAt: new Date().toISOString(),
      mastery: exportMastery(req.db, userId),
      lessonCompletions: exportCompletions(req.db, userId),
      exerciseAttempts: exportAttempts(req.db, userId),
      activity: exportActivity(req.db, userId),
      notes: all<{ id: number; body: string; created_at: string; updated_at: string; lesson_id: number | null; topic_id: number | null; resource_id: number | null; course_id: number | null }>(
        req.db,
        'SELECT * FROM user_notes WHERE user_id = @userId ORDER BY updated_at DESC',
        { userId }
      ),
      totals: get<Record<string, number>>(
        req.db,
        `SELECT
           (SELECT COUNT(*) FROM topic_mastery WHERE user_id = @userId) AS mastery_rows,
           (SELECT COUNT(*) FROM lesson_completions WHERE user_id = @userId) AS completions,
           (SELECT COUNT(*) FROM exercise_attempts WHERE user_id = @userId) AS attempts,
           (SELECT COUNT(*) FROM activity_log WHERE user_id = @userId) AS activity_events`,
        { userId }
      )
    });
  })
);
