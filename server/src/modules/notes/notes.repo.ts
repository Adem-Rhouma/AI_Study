import type Database from 'better-sqlite3';
import { all, get, insert, likeContains, run } from '../../db/sql.js';
import { nowIso } from '../../lib/domain.js';

export type NoteTargetKind = 'lesson' | 'topic' | 'resource' | 'course';

export const NOTE_TARGETS: NoteTargetKind[] = ['lesson', 'topic', 'resource', 'course'];

const TARGET_TABLE: Record<NoteTargetKind, { table: string; column: string }> = {
  lesson: { table: 'lessons', column: 'lesson_id' },
  topic: { table: 'topics', column: 'topic_id' },
  resource: { table: 'resources', column: 'resource_id' },
  course: { table: 'courses', column: 'course_id' }
};

export type NoteRow = {
  id: number;
  body: string;
  quote: string;
  block_id: number | null;
  lesson_id: number | null;
  topic_id: number | null;
  resource_id: number | null;
  course_id: number | null;
  created_at: string;
  updated_at: string;
};

export type NoteWithTarget = NoteRow & {
  targetKind: NoteTargetKind;
  targetSlug: string;
  targetTitle: string;
};

/** Resolves a target slug to its id, and keeps the kind/slug pair honest. */
export function resolveTarget(
  db: Database.Database,
  kind: NoteTargetKind,
  slug: string
): { id: number; slug: string; title: string } | null {
  const table = TARGET_TABLE[kind].table;
  const titleColumn = kind === 'topic' ? 'name' : 'title';
  return get<{ id: number; slug: string; title: string }>(
    db,
    `SELECT id, slug, ${titleColumn} AS title FROM ${table} WHERE slug = @slug`,
    { slug }
  ) ?? null;
}

const SELECT_WITH_TARGET = `
  SELECT n.id, n.body, n.quote, n.block_id, n.lesson_id, n.topic_id, n.resource_id, n.course_id,
         n.created_at, n.updated_at,
         CASE
           WHEN n.lesson_id IS NOT NULL THEN 'lesson'
           WHEN n.topic_id IS NOT NULL THEN 'topic'
           WHEN n.resource_id IS NOT NULL THEN 'resource'
           ELSE 'course'
         END AS targetKind,
         COALESCE(l.slug, t.slug, r.slug, c.slug) AS targetSlug,
         COALESCE(l.title, t.name, r.title, c.title) AS targetTitle
    FROM user_notes n
    LEFT JOIN lessons l ON l.id = n.lesson_id
    LEFT JOIN topics t ON t.id = n.topic_id
    LEFT JOIN resources r ON r.id = n.resource_id
    LEFT JOIN courses c ON c.id = n.course_id`;

export function listNotes(
  db: Database.Database,
  userId: number,
  filters: { kind?: NoteTargetKind; targetId?: number; q?: string; limit: number; offset: number }
): { rows: NoteWithTarget[]; total: number } {
  const clauses = ['n.user_id = @userId'];
  const params: Record<string, unknown> = { userId, q: likeContains(filters.q ?? ''), limit: filters.limit, offset: filters.offset };
  if (filters.kind) {
    const column = TARGET_TABLE[filters.kind].column;
    // A kind on its own means "notes attached to that kind of thing"; with a slug it narrows to one.
    if (filters.targetId !== undefined) {
      clauses.push(`n.${column} = @targetId`);
      params.targetId = filters.targetId;
    } else {
      clauses.push(`n.${column} IS NOT NULL`);
    }
  }
  if (filters.q) clauses.push(`(n.body LIKE @q ESCAPE '\\' OR n.quote LIKE @q ESCAPE '\\')`);
  const where = `WHERE ${clauses.join(' AND ')}`;
  const rows = all<NoteWithTarget>(
    db,
    `${SELECT_WITH_TARGET} ${where} ORDER BY n.updated_at DESC LIMIT @limit OFFSET @offset`,
    params
  );
  const total = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM user_notes n ${where}`, params);
  return { rows, total: Number(total?.c ?? 0) };
}

export function getNote(db: Database.Database, userId: number, id: number): NoteWithTarget | null {
  return get<NoteWithTarget>(db, `${SELECT_WITH_TARGET} WHERE n.user_id = @userId AND n.id = @id`, { userId, id }) ?? null;
}

export type CreateNoteInput = {
  userId: number;
  kind: NoteTargetKind;
  targetId: number;
  body: string;
  quote: string;
  blockId: number | null;
};

export function createNote(db: Database.Database, input: CreateNoteInput): number {
  const at = nowIso();
  return insert(
    db,
    `INSERT INTO user_notes (user_id, lesson_id, topic_id, resource_id, course_id, body, quote, block_id, created_at, updated_at)
     VALUES (@userId, @lesson_id, @topic_id, @resource_id, @course_id, @body, @quote, @blockId, @at, @at)`,
    {
      userId: input.userId,
      lesson_id: input.kind === 'lesson' ? input.targetId : null,
      topic_id: input.kind === 'topic' ? input.targetId : null,
      resource_id: input.kind === 'resource' ? input.targetId : null,
      course_id: input.kind === 'course' ? input.targetId : null,
      body: input.body,
      quote: input.quote,
      blockId: input.kind === 'lesson' ? input.blockId : null,
      at
    }
  );
}

export function updateNote(
  db: Database.Database,
  userId: number,
  id: number,
  patch: { body?: string; quote?: string }
): number {
  const sets: string[] = ['updated_at = @at'];
  const params: Record<string, unknown> = { userId, id, at: nowIso() };
  if (patch.body !== undefined) {
    sets.push('body = @body');
    params.body = patch.body;
  }
  if (patch.quote !== undefined) {
    sets.push('quote = @quote');
    params.quote = patch.quote;
  }
  return run(db, `UPDATE user_notes SET ${sets.join(', ')} WHERE user_id = @userId AND id = @id`, params).changes;
}

export function deleteNote(db: Database.Database, userId: number, id: number): number {
  return run(db, 'DELETE FROM user_notes WHERE user_id = @userId AND id = @id', { userId, id }).changes;
}

export type BookmarkRow = { kind: NoteTargetKind; slug: string; title: string; created_at: string };

const BOOKMARK_SELECTS: Record<NoteTargetKind, string> = {
  // `AS created_at` is load-bearing: the column exists on both the bookmark table and the joined
  // content table, and an ambiguous bare name in a compound ORDER BY is rejected outright.
  lesson: `SELECT 'lesson' AS kind, l.slug, l.title AS title, b.created_at AS created_at
             FROM user_lesson_bookmarks b JOIN lessons l ON l.id = b.lesson_id
            WHERE b.user_id = @userId`,
  topic: `SELECT 'topic' AS kind, t.slug, t.name AS title, b.created_at AS created_at
            FROM user_topic_bookmarks b JOIN topics t ON t.id = b.topic_id
           WHERE b.user_id = @userId`,
  resource: `SELECT 'resource' AS kind, r.slug, r.title AS title, b.created_at AS created_at
               FROM user_resource_bookmarks b JOIN resources r ON r.id = b.resource_id
              WHERE b.user_id = @userId`,
  course: '' // courses are not bookmarkable; enrollment is the course-level equivalent
};

export function listBookmarks(db: Database.Database, userId: number, kinds: NoteTargetKind[]): BookmarkRow[] {
  const parts = kinds.filter((kind) => BOOKMARK_SELECTS[kind] !== '').map((kind) => BOOKMARK_SELECTS[kind]);
  if (parts.length === 0) return [];
  const statement = `${parts.join('\n UNION ALL\n')} ORDER BY created_at DESC LIMIT 500`;
  return all<BookmarkRow>(db, statement, { userId });
}

export function addBookmark(db: Database.Database, userId: number, kind: NoteTargetKind, targetId: number): void {
  const table =
    kind === 'lesson'
      ? 'user_lesson_bookmarks'
      : kind === 'topic'
        ? 'user_topic_bookmarks'
        : 'user_resource_bookmarks';
  const column = kind === 'lesson' ? 'lesson_id' : kind === 'topic' ? 'topic_id' : 'resource_id';
  run(
    db,
    `INSERT INTO ${table} (user_id, ${column}, created_at) VALUES (@userId, @targetId, @at)
     ON CONFLICT DO NOTHING`,
    { userId, targetId, at: nowIso() }
  );
}

export function removeBookmark(db: Database.Database, userId: number, kind: NoteTargetKind, targetId: number): number {
  const table =
    kind === 'lesson'
      ? 'user_lesson_bookmarks'
      : kind === 'topic'
        ? 'user_topic_bookmarks'
        : 'user_resource_bookmarks';
  const column = kind === 'lesson' ? 'lesson_id' : kind === 'topic' ? 'topic_id' : 'resource_id';
  return run(db, `DELETE FROM ${table} WHERE user_id = @userId AND ${column} = @targetId`, { userId, targetId }).changes;
}

export function isBookmarked(db: Database.Database, userId: number, kind: NoteTargetKind, targetId: number): boolean {
  const table =
    kind === 'lesson'
      ? 'user_lesson_bookmarks'
      : kind === 'topic'
        ? 'user_topic_bookmarks'
        : 'user_resource_bookmarks';
  const column = kind === 'lesson' ? 'lesson_id' : kind === 'topic' ? 'topic_id' : 'resource_id';
  const row = get<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM ${table} WHERE user_id = @userId AND ${column} = @targetId`,
    { userId, targetId }
  );
  return Number(row?.c ?? 0) > 0;
}
