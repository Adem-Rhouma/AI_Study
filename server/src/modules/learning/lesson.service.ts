import { z } from 'zod';
import type Database from 'better-sqlite3';
import { ApiError } from '../../lib/http.js';
import { parseJsonObject, nowIso } from '../../lib/domain.js';
import { recomputeTopicsForLesson } from '../progress/mastery.service.js';
import { clearCourseCompletion, markCourseCompleteIfDone } from '../courses/courses.repo.js';
import {
  clearPosition,
  courseLessonOrder,
  courseLessonsWithState,
  courseModules,
  deleteCompletion,
  exercisesBySlugs,
  findCourseBySlug,
  findLessonBySlug,
  getCompletion,
  isLessonBookmarked,
  lessonBlocks,
  lessonReferences,
  lessonTopicSlugs,
  logActivity,
  minutesFromDuration,
  optionsForExercises,
  readPosition,
  upsertCompletion,
  writePosition,
  type ExerciseStubRow
} from './lesson.repo.js';

const payloadSchema = z.record(z.string(), z.unknown());

export type ReaderExercise = {
  slug: string;
  kind: string;
  difficulty: string;
  title: string;
  prompt: string;
  context: string;
  points: number;
  answerNote: string;
  hintCount: number;
  status: string;
  options: { label: string; text: string }[];
};

export type ReaderBlock = {
  index: number;
  type: BlockType;
  text: string;
  payload: Record<string, unknown>;
  exercise: ReaderExercise | null;
};

const blockTypes = [
  'heading', 'prose', 'list', 'callout', 'math', 'derivation', 'worked_example', 'definition',
  'theorem', 'code', 'exercise', 'quiz', 'image', 'table', 'quote', 'interactive', 'comparison',
  'timeline', 'reference', 'checklist', 'tabs'
] as const;

export type BlockType = (typeof blockTypes)[number];

function asBlockType(value: string): BlockType {
  return (blockTypes as readonly string[]).includes(value) ? (value as BlockType) : 'prose';
}

const completionSources = ['manual', 'exercise', 'quiz'] as const;
export type CompletionSource = (typeof completionSources)[number];

function completionSource(value: string): CompletionSource {
  return (completionSources as readonly string[]).includes(value) ? (value as CompletionSource) : 'manual';
}

function exerciseSlugFromPayload(payload: Record<string, unknown>): string | null {
  for (const key of ['exerciseSlug', 'slug', 'exercise']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

/** Learner-safe projection of an exercise: never `solution`, `answer_spec`, `is_correct` or option `feedback`. */
function toReaderExercise(row: ExerciseStubRow, options: { label: string; text: string }[]): ReaderExercise {
  return {
    slug: row.slug,
    kind: row.kind,
    difficulty: row.difficulty,
    title: row.title,
    prompt: row.prompt,
    context: row.context,
    points: Number(row.points),
    answerNote: row.answer_note ?? '',
    hintCount: Number(row.hint_count),
    status: row.status,
    options
  };
}

export function getLessonReader(
  db: Database.Database,
  slug: string,
  viewer: { userId: number | null; canSeeDrafts: boolean }
) {
  const lesson = findLessonBySlug(db, slug);
  if (!lesson) throw ApiError.notFound(`Unknown lesson "${slug}"`);
  const visible = lesson.status === 'published' && lesson.course_status === 'published';
  if (!visible && !viewer.canSeeDrafts) throw ApiError.notFound(`Unknown lesson "${slug}"`);

  const rows = lessonBlocks(db, lesson.id);
  const slugs: string[] = [];
  for (const row of rows) {
    if (row.type !== 'exercise') continue;
    const payload = parseJsonObject(row.payload, payloadSchema) ?? {};
    const exerciseSlug = exerciseSlugFromPayload(payload);
    if (exerciseSlug) slugs.push(exerciseSlug);
  }
  const stubs = exercisesBySlugs(db, [...new Set(slugs)]);
  const stubBySlug = new Map(stubs.map((stub) => [stub.slug, stub]));
  const optionRows = optionsForExercises(db, stubs.map((stub) => stub.id));
  const optionsByExercise = new Map<number, { label: string; text: string }[]>();
  for (const option of optionRows) {
    const list = optionsByExercise.get(Number(option.exercise_id)) ?? [];
    list.push({ label: option.label, text: option.text });
    optionsByExercise.set(Number(option.exercise_id), list);
  }

  const blocks: ReaderBlock[] = rows.map((row, index) => {
    const payload = parseJsonObject(row.payload, payloadSchema) ?? {};
    const stub = row.type === 'exercise' ? stubBySlug.get(exerciseSlugFromPayload(payload) ?? '') : undefined;
    const hidden = stub !== undefined && stub.status !== 'published' && !viewer.canSeeDrafts;
    return {
      index,
      type: asBlockType(row.type),
      text: row.text ?? '',
      payload,
      exercise: stub && !hidden ? toReaderExercise(stub, optionsByExercise.get(stub.id) ?? []) : null
    };
  });

  const completion = viewer.userId ? getCompletion(db, viewer.userId, lesson.id) : null;
  const storedPosition = completion ? null : viewer.userId ? readPosition(db, viewer.userId, lesson.id) : null;
  const siblings = courseLessonOrder(db, lesson.course_id).filter(
    (sibling) => viewer.canSeeDrafts || sibling.status === 'published'
  );
  const position = siblings.findIndex((sibling) => sibling.id === lesson.id);

  return {
    lesson: {
      slug: lesson.slug,
      title: lesson.title,
      summary: lesson.summary,
      status: lesson.status,
      estMinutes: Number(lesson.est_minutes),
      orderIndex: Number(lesson.order_index),
      course: {
        slug: lesson.course_slug,
        title: lesson.course_title,
        difficulty: lesson.course_difficulty,
        status: lesson.course_status
      },
      module: lesson.module_id === null ? null : { id: Number(lesson.module_id), title: lesson.module_title, orderIndex: lesson.module_order },
      topics: lessonTopicSlugs(db, lesson.id),
      blocks,
      references: lessonReferences(db, lesson.id),
      prev: position > 0 ? siblings[position - 1] : null,
      next: position >= 0 && position < siblings.length - 1 ? siblings[position + 1] : null,
      bookmarked: viewer.userId ? isLessonBookmarked(db, viewer.userId, lesson.id) : false,
      completion: completion
        ? {
            completed: true,
            source: completion.source,
            completedAt: completion.completed_at,
            maxScroll: Number(completion.max_scroll),
            lastBlockIndex: Number(completion.last_block_index),
            durationSeconds: Number(completion.duration_seconds)
          }
        : null,
      maxScroll: completion ? Number(completion.max_scroll) : storedPosition?.maxScroll ?? 0,
      lastBlockIndex: completion ? Number(completion.last_block_index) : storedPosition?.lastBlockIndex ?? 0,
      blockCount: blocks.length,
      staffEditable: viewer.canSeeDrafts
    }
  };
}

export function saveReadingPosition(
  db: Database.Database,
  userId: number,
  slug: string,
  input: { blockIndex: number; maxScroll: number; durationSeconds?: number }
) {
  const lesson = findLessonBySlug(db, slug);
  if (!lesson) throw ApiError.notFound(`Unknown lesson "${slug}"`);
  if (lesson.status !== 'published') throw ApiError.notFound(`Unknown lesson "${slug}"`);

  const lastBlockIndex = Math.max(0, Math.trunc(input.blockIndex));
  const maxScroll = Math.min(1, Math.max(0, input.maxScroll));
  // Never auto-complete: the row in lesson_completions is only written by an explicit action.
  const completion = getCompletion(db, userId, lesson.id);
  const stored = completion
    ? { maxScroll, lastBlockIndex, updatedAt: nowIso() }
    : writePosition(db, userId, lesson.id, { maxScroll, lastBlockIndex });
  if (completion) {
    upsertCompletion(db, {
      userId,
      lessonId: lesson.id,
      source: completionSource(completion.source),
      maxScroll,
      lastBlockIndex,
      durationSeconds: 0
    });
  }
  const minutes = minutesFromDuration(input.durationSeconds);
  if (minutes > 0) logActivity(db, { userId, action: 'read', entityType: 'lesson', entityId: lesson.id, minutes });
  return {
    lessonSlug: lesson.slug,
    maxScroll: stored.maxScroll,
    lastBlockIndex: stored.lastBlockIndex,
    updatedAt: stored.updatedAt,
    completed: completion !== null,
    minutesRecorded: minutes
  };
}

export function completeLesson(db: Database.Database, userId: number, slug: string, durationSeconds?: number) {
  const lesson = findLessonBySlug(db, slug);
  if (!lesson) throw ApiError.notFound(`Unknown lesson "${slug}"`);
  if (lesson.status !== 'published') throw ApiError.forbidden('Only published lessons can be completed.');

  const stored = readPosition(db, userId, lesson.id);
  const row = upsertCompletion(db, {
    userId,
    lessonId: lesson.id,
    source: 'manual',
    maxScroll: stored?.maxScroll ?? 1,
    lastBlockIndex: stored?.lastBlockIndex ?? 0,
    durationSeconds: durationSeconds ?? 0
  });
  clearPosition(db, userId, lesson.id);
  const minutes = minutesFromDuration(durationSeconds);
  logActivity(db, { userId, action: 'complete', entityType: 'lesson', entityId: lesson.id, minutes });
  recomputeTopicsForLesson(db, userId, lesson.id);
  markCourseCompleteIfDone(db, userId, lesson.course_id);
  return {
    lessonSlug: lesson.slug,
    completed: true,
    source: row.source,
    completedAt: row.completed_at,
    alreadyCompleted: row.updated_at !== row.completed_at,
    maxScroll: Number(row.max_scroll),
    lastBlockIndex: Number(row.last_block_index)
  };
}

export function withdrawCompletion(db: Database.Database, userId: number, slug: string) {
  const lesson = findLessonBySlug(db, slug);
  if (!lesson) throw ApiError.notFound(`Unknown lesson "${slug}"`);
  const removed = deleteCompletion(db, userId, lesson.id);
  if (removed === 0) return { lessonSlug: lesson.slug, completed: false, withdrawn: false };
  logActivity(db, { userId, action: 'completion_withdrawn', entityType: 'lesson', entityId: lesson.id, minutes: 0 });
  recomputeTopicsForLesson(db, userId, lesson.id);
  clearCourseCompletion(db, userId, lesson.course_id);
  return { lessonSlug: lesson.slug, completed: false, withdrawn: true };
}

export function getCourseOutline(
  db: Database.Database,
  courseSlug: string,
  viewer: { userId: number | null; canSeeDrafts: boolean }
) {
  const course = findCourseBySlug(db, courseSlug);
  if (!course) throw ApiError.notFound(`Unknown course "${courseSlug}"`);
  if (course.status !== 'published' && !viewer.canSeeDrafts) {
    throw ApiError.notFound(`Unknown course "${courseSlug}"`);
  }
  const modules = courseModules(db, course.id);
  const rows = courseLessonsWithState(db, course.id, viewer.userId);
  const grouped = new Map<number | null, Record<string, unknown>[]>();
  for (const row of rows) {
    const visible = row.status === 'published' || viewer.canSeeDrafts;
    if (!visible) continue;
    const key = row.module_id === null ? null : Number(row.module_id);
    const list = grouped.get(key) ?? [];
    list.push({
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      status: row.status,
      estMinutes: Number(row.est_minutes),
      orderIndex: Number(row.order_index),
      blockCount: Number(row.block_count),
      completed: row.completed_at !== null,
      completedAt: row.completed_at,
      maxScroll: Number(row.max_scroll ?? 0),
      lastBlockIndex: Number(row.last_block_index ?? 0)
    });
    grouped.set(key, list);
  }
  const unmoduled = grouped.get(null) ?? [];
  return {
    course: {
      slug: course.slug,
      title: course.title,
      summary: course.summary,
      difficulty: course.difficulty,
      status: course.status,
      estHours: course.estHours
    },
    modules: [
      ...modules.map((module) => ({
        id: Number(module.id),
        title: module.title,
        summary: module.summary,
        orderIndex: Number(module.order_index),
        lessons: grouped.get(Number(module.id)) ?? []
      })),
      ...(unmoduled.length > 0 ? [{ id: null, title: 'Unordered', summary: '', orderIndex: 999, lessons: unmoduled }] : [])
    ],
    totals: {
      lessons: rows.filter((row) => row.status === 'published' || viewer.canSeeDrafts).length,
      completed: rows.filter((row) => row.completed_at !== null).length
    }
  };
}
