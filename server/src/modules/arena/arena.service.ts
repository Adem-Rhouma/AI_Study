import { z } from 'zod';
import type Database from 'better-sqlite3';
import { ApiError } from '../../lib/http.js';
import { parseJsonObject } from '../../lib/domain.js';
import { getPreferences } from '../auth/auth.repo.js';
import { hintCredit, recomputeTopicsForExercise, round4 } from '../progress/mastery.service.js';
import {
  attemptHistory,
  attemptTotals,
  attemptsByDifficulty,
  countAttempts,
  countPendingHintUnlocks,
  getExerciseBySlug,
  hintsOf,
  hintUnlockTotal,
  insertAttempt,
  listAttempts,
  listExercises,
  logAttemptMarker,
  logHintUnlock,
  masteryExtremes,
  optionsOf,
  recommendFallback,
  recommendFromPartialCoverage,
  relatedTopicsOf,
  tagsOf,
  unlockedHintIds,
  type ExerciseListRow
} from './arena.repo.js';
import { gradeExercise, type GradedOption } from './grading.js';

/** Both recommendation queries return this shape; `coverage` is null for fallback rows. */
type Recommendation = ExerciseListRow & { topic_slug: string | null; coverage: number | null };

const specSchema = z.object({
  expected: z.unknown().optional(),
  tolerance: z.unknown().optional(),
  unit: z.unknown().optional(),
  accepted: z.unknown().optional(),
  matchMode: z.unknown().optional(),
  pairs: z.unknown().optional(),
  options: z.unknown().optional(),
  starter: z.unknown().optional(),
  language: z.unknown().optional()
});

export type Viewer = { userId: number | null; canSeeDrafts: boolean };

const matchPairSchema = z.object({ left: z.string(), right: z.string() });

/** Split authored pairs into two columns so the answer key never crosses the wire. */
function matchColumns(pairs: unknown): { lefts: string[]; rights: string[] } | null {
  const parsed = z.array(matchPairSchema).safeParse(pairs);
  if (!parsed.success || parsed.data.length === 0) return null;
  return {
    lefts: parsed.data.map((pair) => pair.left),
    rights: [...new Set(parsed.data.map((pair) => pair.right))].sort((a, b) => a.localeCompare(b))
  };
}

function visibleToViewer(exercise: { status: string }, viewer: Viewer): boolean {
  return exercise.status === 'published' || viewer.canSeeDrafts;
}

function gradedOptions(db: Database.Database, exerciseId: number): GradedOption[] {
  return optionsOf(db, exerciseId).map((option) => ({
    label: option.label,
    text: option.text,
    isCorrect: option.is_correct === 1,
    feedback: option.feedback
  }));
}

export function listArenaExercises(db: Database.Database, viewer: Viewer, filters: {
  topic?: string;
  difficulty?: string;
  kind?: string;
  q?: string;
  status: string;
  limit: number;
  offset: number;
}) {
  const status = filters.status === 'all' && !viewer.canSeeDrafts ? 'published' : filters.status;
  const { rows, total } = listExercises(db, { ...filters, status, userId: viewer.userId });
  return {
    exercises: rows.map((row) => ({
      slug: row.slug,
      kind: row.kind,
      difficulty: row.difficulty,
      title: row.title,
      prompt: row.prompt.slice(0, 220),
      points: Number(row.points),
      status: row.status,
      topic: row.topic_slug ? { slug: row.topic_slug, name: row.topic_name } : null,
      lessonSlug: row.lesson_slug,
      hintCount: Number(row.hint_count),
      attempts: Number(row.attempts),
      bestScore: row.best_score === null ? null : Number(row.best_score),
      lastResult: row.last_result === null ? null : row.last_result === 1
    })),
    total
  };
}

export function getArenaExercise(db: Database.Database, slug: string, viewer: Viewer) {
  const exercise = getExerciseBySlug(db, slug);
  if (!exercise || !visibleToViewer(exercise, viewer)) throw ApiError.notFound(`Unknown exercise "${slug}"`);
  const spec = parseJsonObject(exercise.answer_spec, specSchema) ?? {};
  const options = optionsOf(db, exercise.id);
  const hints = hintsOf(db, exercise.id);
  const unlocked = viewer.userId ? new Set(unlockedHintIds(db, viewer.userId, exercise.id)) : new Set<number>();
  const related = relatedTopicsOf(db, exercise.id);
  return {
    exercise: {
      slug: exercise.slug,
      kind: exercise.kind,
      difficulty: exercise.difficulty,
      title: exercise.title,
      prompt: exercise.prompt,
      context: exercise.context,
      answerNote: exercise.answer_note,
      points: Number(exercise.points),
      status: exercise.status,
      // Deliberately absent: `solution`, `answer_spec.expected`, and option `is_correct`.
      answerSpec: {
        matchMode: spec.matchMode ?? null,
        tolerance: spec.tolerance ?? 0,
        unit: spec.unit ?? null,
        pairCount: Array.isArray(spec.pairs) ? spec.pairs.length : 0,
        starter: spec.starter ?? '',
        language: spec.language ?? null,
        // Match exercises need their stems to be answerable, so the two columns are sent apart:
        // pairing them back together is exactly what the exercise asks the learner to do.
        match: matchColumns(spec.pairs)
      },
      // Option `feedback` is deliberately absent here too: it reads "Correct." for the keyed options,
      // so it is part of the answer key and only travels with a graded attempt.
      options: options.map((option) => ({ label: option.label, text: option.text })),
      hints: {
        count: hints.length,
        // A hint the learner has already paid for is shown again on every visit; the rest stay locked.
        available: hints.map((hint) => ({
          position: Number(hint.position),
          unlocked: unlocked.has(hint.id),
          text: unlocked.has(hint.id) ? hint.text : null
        }))
      },
      tags: tagsOf(db, exercise.id),
      topic: exercise.topic_slug
        ? { slug: exercise.topic_slug, name: exercise.topic_name ?? exercise.topic_slug }
        : null,
      lesson: exercise.lesson_slug
        ? { slug: exercise.lesson_slug, title: exercise.lesson_title ?? exercise.lesson_slug }
        : null,
      topics: [...new Set([...(exercise.topic_slug ? [exercise.topic_slug] : []), ...related.map((t) => t.slug)])],
      relatedTopics: related,
      attempts: viewer.userId
        ? attemptHistory(db, viewer.userId, exercise.id).map((row) => ({
            id: Number(row.id),
            attemptIndex: Number(row.attempt_index),
            hintsUsed: Number(row.hints_used),
            score: Number(row.score),
            isCorrect: row.is_correct === null ? null : Number(row.is_correct) === 1,
            durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
            feedback: String(row.feedback ?? ''),
            createdAt: String(row.created_at)
          }))
        : []
    }
  };
}

export function unlockHint(db: Database.Database, userId: number, slug: string, index: number) {
  const exercise = getExerciseBySlug(db, slug);
  if (!exercise || exercise.status !== 'published') throw ApiError.notFound(`Unknown exercise "${slug}"`);
  const hints = hintsOf(db, exercise.id);
  if (!Number.isInteger(index) || index < 0 || index >= hints.length) {
    throw ApiError.unprocessable(`This exercise has hints 0..${Math.max(0, hints.length - 1)}.`);
  }
  const hint = hints[index];
  const seen = new Set(unlockedHintIds(db, userId, exercise.id));
  // Persist every hint up to `index`, not just this one: the response below reports them all as
  // unlocked, and a later GET has to agree with it or the learner loses hint text on reload.
  for (let i = 0; i <= index; i += 1) {
    if (!seen.has(hints[i].id)) logHintUnlock(db, userId, hints[i].id);
  }
  return {
    exerciseSlug: exercise.slug,
    index,
    text: hint.text,
    unlockedPositions: hints.map((h, i) => ({ position: Number(h.position), unlocked: i <= index })),
    appliedToNextAttempt: hints.length > 0,
    note: 'This hint is counted when your next attempt is graded — the discount is applied by the server.'
  };
}

export function submitAttempt(
  db: Database.Database,
  userId: number,
  slug: string,
  input: { answer: unknown; durationSeconds?: number }
) {
  const exercise = getExerciseBySlug(db, slug);
  if (!exercise) throw ApiError.notFound(`Unknown exercise "${slug}"`);
  if (exercise.status !== 'published') throw ApiError.notFound(`Unknown exercise "${slug}"`);

  const spec = (parseJsonObject(exercise.answer_spec, specSchema) ?? {}) as Record<string, unknown>;
  const outcome = gradeExercise({ kind: exercise.kind, spec, options: gradedOptions(db, exercise.id), answer: input.answer });

  const hintCount = hintsOf(db, exercise.id).length;
  const hintsUsed = Math.min(countPendingHintUnlocks(db, userId, exercise.id), Math.max(hintCount, 1) * 3);
  const discount = hintCredit(hintsUsed);
  // A review-kind submission reveals the model solution, so it credits nothing (ADR rule 2).
  const solutionViewed = outcome.needsReview;
  const rawCredit = Math.min(1, Math.max(0, outcome.credit));
  const score = round4(solutionViewed ? 0 : rawCredit * discount);
  const attemptIndex = countAttempts(db, userId, exercise.id) + 1;

  const attemptId = insertAndRecompute(db, userId, exercise, {
    answer: input.answer,
    solutionViewed,
    isCorrect: outcome.isCorrect,
    score,
    hintsUsed,
    attemptIndex,
    durationSeconds: input.durationSeconds ?? null,
    feedback: outcome.feedback
  });

  const showExplanation = outcome.isCorrect === true;
  return {
    attempt: { id: attemptId, attemptIndex, hintsUsed, score, isCorrect: outcome.isCorrect, hintDiscount: round4(discount) },
    isCorrect: outcome.isCorrect,
    score,
    maxPoints: Number(exercise.points),
    awardedPoints: round4(Number(exercise.points) * score),
    feedback: outcome.feedback,
    optionFeedback: outcome.optionFeedback,
    explanationShownOnlyIfCorrect: !solutionViewed,
    explanation: showExplanation ? exercise.explanation : null,
    modelSolution: solutionViewed ? exercise.solution : null,
    needsReview: outcome.needsReview,
    sandboxNote: exercise.kind === 'code' ? 'No code was executed: this Arena has no sandbox.' : null,
    nextAction: outcome.needsReview ? 'await_review' : outcome.isCorrect === true ? 'next_exercise' : 'retry'
  };
}

function insertAndRecompute(
  db: Database.Database,
  userId: number,
  exercise: { id: number },
  data: {
    answer: unknown;
    solutionViewed: boolean;
    isCorrect: boolean | null;
    score: number;
    hintsUsed: number;
    attemptIndex: number;
    durationSeconds: number | null;
    feedback: string;
  }
): number {
  const id = insertAttempt(db, {
    userId,
    exerciseId: exercise.id,
    submitted: { answer: data.answer, ...(data.solutionViewed ? { solutionViewed: true } : {}) },
    isCorrect: data.isCorrect,
    score: data.score,
    hintsUsed: data.hintsUsed,
    attemptIndex: data.attemptIndex,
    durationSeconds: data.durationSeconds,
    feedback: data.feedback
  });
  logAttemptMarker(db, userId, exercise.id, data.durationSeconds ? Math.max(1, Math.round(data.durationSeconds / 60)) : 0);
  recomputeTopicsForExercise(db, userId, exercise.id);
  return id;
}

export function listMyAttempts(db: Database.Database, userId: number, filters: { topic?: string; limit: number; offset: number }) {
  const { rows, total } = listAttempts(db, userId, filters);
  return {
    attempts: rows.map((row) => ({
      id: Number(row.id),
      exerciseSlug: String(row.exercise_slug),
      exerciseTitle: String(row.exercise_title),
      kind: String(row.kind),
      difficulty: String(row.difficulty),
      topicSlug: row.topic_slug === null ? null : String(row.topic_slug),
      attemptIndex: Number(row.attempt_index),
      hintsUsed: Number(row.hints_used),
      score: Number(row.score),
      isCorrect: row.is_correct === null ? null : Number(row.is_correct) === 1,
      durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      feedback: String(row.feedback ?? ''),
      createdAt: String(row.created_at)
    })),
    total
  };
}

export function arenaStats(db: Database.Database, userId: number) {
  const totals = attemptTotals(db, userId);
  const byDifficulty = attemptsByDifficulty(db, userId);
  return {
    totals: {
      attempts: Number(totals?.attempts ?? 0),
      exercisesTouched: Number(totals?.exercises ?? 0),
      correct: Number(totals?.correct ?? 0),
      accuracy: totals && Number(totals.attempts) > 0 ? round4(Number(totals.correct) / Number(totals.attempts)) : 0,
      awaitingReview: Number(totals?.awaiting_review ?? 0),
      hintsUsedOnAttempts: Number(totals?.hints_used ?? 0),
      hintUnlocks: hintUnlockTotal(db, userId)
    },
    byDifficulty: byDifficulty.map((row) => ({
      difficulty: row.difficulty,
      attempts: Number(row.attempts),
      correct: Number(row.correct),
      awaitingReview: Number(row.awaiting_review),
      hintsUsed: Number(row.hints_used),
      accuracy: Number(row.attempts) > 0 ? round4(Number(row.correct) / Number(row.attempts)) : 0
    })),
    weakestTopics: masteryExtremes(db, userId, 'weak'),
    strongestTopics: masteryExtremes(db, userId, 'strong')
  };
}

export function recommendExercises(db: Database.Database, userId: number, limit: number) {
  const preferences = getPreferences(db, userId);
  const wanted = Math.min(10, Math.max(6, limit));
  const primary = recommendFromPartialCoverage(db, userId, preferences.default_difficulty, wanted);
  const chosen: Recommendation[] = primary.slice(0, wanted);
  const seen = new Set(chosen.map((row) => Number(row.id)));
  if (chosen.length < 6) {
    for (const row of recommendFallback(db, userId, preferences.default_difficulty, [...seen], wanted - chosen.length)) {
      if (seen.has(Number(row.id))) continue;
      chosen.push(row);
      seen.add(Number(row.id));
    }
  }
  return {
    recommended: chosen.map((row, index) => ({
      slug: row.slug,
      title: row.title,
      kind: row.kind,
      difficulty: row.difficulty,
      points: Number(row.points),
      topic: row.topic_slug ? { slug: row.topic_slug, name: row.topic_name } : null,
      attempts: Number(row.attempts),
      reason:
        Number(row.coverage ?? 0) > 0
          ? `You have covered ${round4(Number(row.coverage))} of this topic but have fewer than 5 attempts on it.`
          : index === 0
            ? `Nothing to recommend from your coverage yet, so this is a next exercise at your default difficulty (${preferences.default_difficulty}).`
            : `A nearby exercise at your default difficulty (${preferences.default_difficulty}).`
    })),
    basedOnDifficulty: preferences.default_difficulty
  };
}
