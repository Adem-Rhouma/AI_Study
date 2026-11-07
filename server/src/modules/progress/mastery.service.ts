import { z } from 'zod';
import type Database from 'better-sqlite3';
import {
  dropMasteryIfEmpty,
  loadMasterySources,
  saveMastery,
  topicIdsForExercise,
  topicIdsForLesson
} from './progress.repo.js';

/**
 * ADR-0003 implemented literally. One definition of mastery, derived from source rows on every
 * recompute; the stored columns exist only so the UI can render "why this level" without math.
 */

export const MASTERY_LEVELS = ['new', 'exposed', 'learning', 'practising', 'proficient', 'mastered'] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

export const WEIGHTS = { coverage: 0.45, performance: 0.45, retention: 0.1 } as const;
export const HINT_DISCOUNT_STEP = 0.2;
export const RETENTION_DECAY_DAYS = 45;
export const PERFORMANCE_HALF_LIFE_DAYS = 30;
export const REVALIDATION_STALE_DAYS = 90;
export const MASTERED_TOUCH_DAYS = 180;

const LEVEL_RANK: Record<MasteryLevel, number> = {
  new: 0,
  exposed: 1,
  learning: 2,
  practising: 3,
  proficient: 4,
  mastered: 5
};

export function levelRank(level: MasteryLevel): number {
  return LEVEL_RANK[level];
}

export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** An attempt that consumed the n-th hint is credited max(0, 1 - 0.2n) (ADR rule 1). */
export function hintCredit(hintsUsed: number): number {
  return Math.max(0, 1 - HINT_DISCOUNT_STEP * Math.max(0, Math.trunc(hintsUsed)));
}

export type MasteryState = {
  coverage: number;
  performance: number;
  retention: number;
  score: number;
  attempts: number;
  lessonsDone: number;
  lastTouchedAt: string | null;
  level: MasteryLevel;
};

export type MasteryWhy = MasteryState & { reasons: string[] };

const solutionSeenSchema = z.object({ solutionViewed: z.boolean().optional() });

function solutionWasViewed(submitted: unknown): boolean {
  if (typeof submitted === 'string') {
    try {
      return solutionSeenSchema.safeParse(JSON.parse(submitted)).data?.solutionViewed === true;
    } catch {
      return false;
    }
  }
  return solutionSeenSchema.safeParse(submitted).data?.solutionViewed === true;
}

export function daysBetween(iso: string, nowMs: number): number {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (nowMs - then) / 86_400_000);
}

/**
 * Retention is capped at its 10% weight: time alone can neither erase nor inflate demonstrated
 * ability (ADR rule 3). A learner idle for 60 days loses at most 0.10 * (1 - exp(-60/45)) ~= 0.07.
 */
export function retentionFor(lastTouchedAt: string | null, nowMs: number): number {
  if (!lastTouchedAt) return 0;
  return round4(Math.exp(-daysBetween(lastTouchedAt, nowMs) / RETENTION_DECAY_DAYS));
}

/**
 * Performance = hint-discounted correctness, exponentially weighted toward recent attempts.
 * Solution-viewed attempts are kept in history but credit 0 (ADR rule 2); submissions that are
 * still awaiting review carry no evidence at all and are excluded from both sides of the mean.
 */
export function performanceFor(
  attempts: { is_correct: number | null; score: number; hints_used: number; created_at: string; submitted: unknown }[],
  nowMs: number
): number {
  let weighted = 0;
  let total = 0;
  for (const attempt of attempts) {
    const awaitingReview = attempt.is_correct === null && !solutionWasViewed(attempt.submitted);
    if (awaitingReview) continue;
    const age = daysBetween(attempt.created_at, nowMs);
    const weight = 0.5 ** (age / PERFORMANCE_HALF_LIFE_DAYS);
    const credit = solutionWasViewed(attempt.submitted) ? 0 : Math.min(1, Math.max(0, Number(attempt.score) || 0));
    weighted += weight * credit;
    total += weight;
  }
  if (total <= 0) return 0;
  return round4(weighted / total);
}

export function deriveLevel(state: Omit<MasteryState, 'level'>): MasteryLevel {
  const { coverage, score, attempts, lessonsDone, lastTouchedAt } = state;
  const recent = lastTouchedAt !== null && daysBetween(lastTouchedAt, Date.now()) <= MASTERED_TOUCH_DAYS;
  if (score >= 0.85 && coverage >= 1 && attempts >= 8 && recent) return 'mastered';
  if (score >= 0.65 && coverage >= 0.5 && attempts >= 5) return 'proficient';
  if (attempts >= 3 && score >= 0.35) return 'practising';
  if (coverage >= 0.5) return 'learning';
  if (lessonsDone > 0 || attempts > 0) return 'exposed';
  return 'new';
}

export function computeMasteryState(db: Database.Database, userId: number, topicId: number): MasteryState {
  const sources = loadMasterySources(db, userId, topicId);
  const nowMs = Date.now();
  const coverage = sources.lessonsTotal > 0 ? round4(sources.lessonsDone / sources.lessonsTotal) : 0;
  const lastAttemptAt = sources.attempts.length > 0 ? sources.attempts[sources.attempts.length - 1].created_at : null;
  const touches = [sources.lastCompletionAt, lastAttemptAt].filter((v): v is string => typeof v === 'string');
  const lastTouchedAt = touches.length > 0 ? touches.sort().at(-1)! : null;
  const performance = performanceFor(sources.attempts, nowMs);
  const retention = retentionFor(lastTouchedAt, nowMs);
  const score = round4(WEIGHTS.coverage * coverage + WEIGHTS.performance * performance + WEIGHTS.retention * retention);
  const base = { coverage, performance, retention, score, attempts: sources.attempts.length, lessonsDone: sources.lessonsDone, lastTouchedAt };
  return { ...base, level: deriveLevel(base) };
}

/** Renders "why this level" from the stored columns alone — no recomputation, per ADR-0003. */
export function buildWhy(state: MasteryState): MasteryWhy {
  const reasons: string[] = [];
  reasons.push(
    `Score = 0.45·coverage + 0.45·performance + 0.10·retention = ` +
      `0.45·${state.coverage} + 0.45·${state.performance} + 0.10·${state.retention} = ${state.score}.`
  );
  reasons.push(
    state.lessonsDone > 0
      ? `Coverage ${state.coverage}: ${state.lessonsDone} lesson${state.lessonsDone === 1 ? '' : 's'} of this topic completed by explicit action.`
      : `Coverage ${state.coverage}: no lesson of this topic completed yet. Opening a lesson never counts.`
  );
  reasons.push(
    state.attempts > 0
      ? `Performance ${state.performance} from ${state.attempts} graded attempt${state.attempts === 1 ? '' : 's'}, weighted toward the most recent; hints discount credit (1 hint = ×0.8) and a viewed solution credits 0.`
      : `Performance ${state.performance}: no exercise evidence yet, so nothing can be credited.`
  );
  if (state.lastTouchedAt) {
    const days = Math.floor(daysBetween(state.lastTouchedAt, Date.now()));
    reasons.push(`Retention ${state.retention}: last meaningful touch ${days} day${days === 1 ? '' : 's'} ago. It can move the score by at most 0.10.`);
  } else {
    reasons.push('Retention 0: this topic has never been touched.');
  }
  reasons.push(levelSentence(state));
  const next = nextStep(state);
  if (next) reasons.push(next);
  if (needsRevalidation(state)) {
    reasons.push(`Revalidation suggested: touched more than ${REVALIDATION_STALE_DAYS} days ago and below proficient — a five-minute recheck, not a re-read.`);
  }
  return { ...state, reasons };
}

function levelSentence(state: MasteryState): string {
  switch (state.level) {
    case 'mastered':
      return `Level mastered: score ${state.score} ≥ 0.85, every published lesson complete (coverage 1), ${state.attempts} attempts ≥ 8, and a touch inside 180 days.`;
    case 'proficient':
      return `Level proficient: score ${state.score} ≥ 0.65 with coverage ${state.coverage} ≥ 0.5 and ${state.attempts} attempts ≥ 5.`;
    case 'practising':
      return `Level practising: ${state.attempts} attempts ≥ 3 and score ${state.score} ≥ 0.35.`;
    case 'learning':
      return `Level learning: coverage ${state.coverage} is at least half of the topic's published lessons.`;
    case 'exposed':
      return `Level exposed: ${state.lessonsDone} lesson(s) done and ${state.attempts} attempt(s) made — contact only, no evidence of recall yet.`;
    default:
      return 'Level new: nothing completed and no attempt recorded.';
  }
}

function nextStep(state: MasteryState): string | null {
  if (state.level === 'mastered') return null;
  const missing: string[] = [];
  if (state.attempts < 3) {
    missing.push(`${3 - state.attempts} more attempt(s) to reach practising`);
  } else if (state.level !== 'proficient') {
    if (state.attempts < 5) missing.push(`${5 - state.attempts} more attempt(s) for the proficient bar`);
    if (state.coverage < 0.5) missing.push("half of the topic's lessons are still incomplete");
    if (state.score < 0.65) missing.push(`score ${state.score} is below the 0.65 proficient bar`);
  }
  if (state.attempts >= 8 && state.coverage >= 1 && state.score < 0.85) {
    missing.push(`mastered needs score ≥ 0.85 (now ${state.score})`);
  }
  if (missing.length === 0) return null;
  return `Next step: ${missing.join('; ')}.`;
}

/** ISO day before which a topic counts as stale enough to suggest revalidation. */
export function revalidationStaleBefore(nowMs = Date.now()): string {
  return new Date(nowMs - REVALIDATION_STALE_DAYS * 86_400_000).toISOString();
}

export function needsRevalidation(state: MasteryState): boolean {
  if (levelRank(state.level) >= LEVEL_RANK.proficient) return false;
  const stamp = state.lastTouchedAt;
  if (!stamp) return false;
  return daysBetween(stamp, Date.now()) > REVALIDATION_STALE_DAYS;
}

/** Recompute is derived from source rows; a cached value is never trusted. */
export function recomputeTopicMastery(db: Database.Database, userId: number, topicId: number): void {
  const state = computeMasteryState(db, userId, topicId);
  saveMastery(db, userId, topicId, state);
  dropMasteryIfEmpty(db, userId, topicId);
}

export function recomputeTopicsForLesson(db: Database.Database, userId: number, lessonId: number): void {
  for (const topicId of topicIdsForLesson(db, lessonId)) recomputeTopicMastery(db, userId, topicId);
}

export function recomputeTopicsForExercise(db: Database.Database, userId: number, exerciseId: number): void {
  for (const topicId of topicIdsForExercise(db, exerciseId)) recomputeTopicMastery(db, userId, topicId);
}

/** Public shape for the progress API: stored columns plus the explainability payload. */
export function whyFromRow(row: {
  coverage: number;
  performance: number;
  retention: number;
  score: number;
  level: string;
  attempts: number;
  lessons_done: number;
  last_touched_at: string | null;
}): MasteryWhy {
  const state: MasteryState = {
    coverage: Number(row.coverage),
    performance: Number(row.performance),
    retention: Number(row.retention),
    score: Number(row.score),
    attempts: Number(row.attempts),
    lessonsDone: Number(row.lessons_done),
    lastTouchedAt: row.last_touched_at ?? null,
    level: (MASTERY_LEVELS as readonly string[]).includes(row.level) ? (row.level as MasteryLevel) : 'new'
  };
  return buildWhy(state);
}
