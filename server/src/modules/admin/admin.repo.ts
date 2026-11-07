import type Database from 'better-sqlite3';
import { all, get, insert, likeContains, run, tx } from '../../db/sql.js';
import { nowIso } from '../../lib/domain.js';
import { ApiError } from '../../lib/http.js';
import { ADMIN_KINDS, kindOrThrow, type AdminField, type AdminKind, type AdminRelation, type RefTarget } from './admin.kinds.js';

/** `identify` is what a document writes back; `label` is the column a staff member reads. */
const REF_TABLES: Record<RefTarget, { table: string; identify: 'slug' | 'title'; label: string }> = {
  courses: { table: 'courses', identify: 'slug', label: 'title' },
  topics: { table: 'topics', identify: 'slug', label: 'name' },
  lessons: { table: 'lessons', identify: 'slug', label: 'title' },
  resources: { table: 'resources', identify: 'slug', label: 'title' },
  subdomains: { table: 'subdomains', identify: 'slug', label: 'name' },
  course_modules: { table: 'course_modules', identify: 'title', label: 'title' }
};

export type ContentListItem = {
  id: number;
  slug: string | null;
  title: string;
  status: string | null;
  updatedAt: string | null;
  counts: Record<string, number>;
};

export type ContentDocument = {
  meta: { id: number; slug: string | null; title: string; status: string | null; createdAt: string; updatedAt: string | null };
  doc: Record<string, unknown>;
};

/** Every list query gives the table this alias, which is what `listCounts` subqueries assume. */
const ALIAS = 'k';

function titleColumnOf(kind: AdminKind) {
  return kind.title;
}

function hasSlug(kind: AdminKind) {
  return kind.slugColumn !== undefined;
}

function selectColumns(kind: AdminKind): string {
  const columns = [`${ALIAS}.id`, `${ALIAS}.${titleColumnOf(kind)} AS title`];
  if (hasSlug(kind)) columns.push(`${ALIAS}.${kind.slugColumn} AS slug`);
  if (kind.statusColumn) columns.push(`${ALIAS}.${kind.statusColumn} AS status`);
  if (kind.updatedColumn) columns.push(`${ALIAS}.updated_at AS updated_at`);
  for (const count of kind.listCounts ?? []) columns.push(`${count.sql} AS ${count.key}`);
  return columns.join(', ');
}

export function listContent(
  db: Database.Database,
  kind: AdminKind,
  filters: { q: string; status: string; limit: number; offset: number }
): { items: ContentListItem[]; total: number } {
  const where: string[] = [];
  const params: Record<string, unknown> = {};

  if (filters.q !== '') {
    const search = [`${ALIAS}.${titleColumnOf(kind)} LIKE @q ESCAPE '\\'`];
    if (hasSlug(kind)) search.push(`${ALIAS}.${kind.slugColumn} LIKE @q ESCAPE '\\'`);
    where.push(`(${search.join(' OR ')})`);
    params.q = likeContains(filters.q);
  }
  if (filters.status !== 'all' && kind.statusColumn) {
    where.push(`${ALIAS}.${kind.statusColumn} = @status`);
    params.status = filters.status;
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order = kind.updatedColumn ? `${ALIAS}.updated_at DESC, ${ALIAS}.id DESC` : `${ALIAS}.id DESC`;

  const total = Number(
    get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${kind.table} ${ALIAS} ${clause}`, params)?.n ?? 0
  );

  const rows = all<Record<string, unknown>>(
    db,
    `SELECT ${selectColumns(kind)} FROM ${kind.table} ${ALIAS} ${clause} ORDER BY ${order} LIMIT @limit OFFSET @offset`,
    { ...params, limit: filters.limit, offset: filters.offset }
  );

  const items = rows.map((row) => {
    const counts: Record<string, number> = {};
    for (const count of kind.listCounts ?? []) {
      counts[count.key] = Number(row[count.key] ?? 0);
    }
    return {
      id: Number(row.id),
      slug: (row.slug as string | undefined) ?? null,
      title: String(row.title ?? ''),
      status: (row.status as string | undefined) ?? null,
      updatedAt: (row.updated_at as string | undefined) ?? null,
      counts
    };
  });

  return { items, total };
}

/** Slugged tables are addressed by slug (that is what the editor puts in the address bar); milestones, which have no slug, by id. */
function rowByIdOrSlug(db: Database.Database, kind: AdminKind, ref: string) {
  const column = kind.slugColumn ?? 'id';
  const params = column === 'id' ? { ref: Number(ref) } : { ref };
  const row = get<Record<string, unknown>>(db, `SELECT * FROM ${kind.table} WHERE ${column} = @ref`, params);
  if (!row) throw ApiError.notFound(`No ${kind.kind} matches "${ref}".`);
  return row;
}

function resolveRef(db: Database.Database, target: RefTarget, value: unknown, scope: { courseId: number | null }): number | null {
  if (value === null || value === undefined || value === '') return null;
  const spec = REF_TABLES[target];
  const column = spec.identify;
  if (target === 'course_modules') {
    if (scope.courseId === null) throw ApiError.badRequest('Pick the course before naming a module.');
    const row = get<{ id: number }>(db, `SELECT id FROM ${spec.table} WHERE ${column} = @value AND course_id = @courseId`, {
      value: String(value),
      courseId: scope.courseId
    });
    if (!row) throw ApiError.badRequest(`The selected course has no module called "${String(value)}".`);
    return row.id;
  }
  const row = get<{ id: number }>(db, `SELECT id FROM ${spec.table} WHERE ${column} = @value`, { value: String(value) });
  if (!row) throw ApiError.badRequest(`Unknown ${target.replace(/s$/, '')} "${String(value)}".`);
  return row.id;
}

function refValueFor(db: Database.Database, table: string, field: AdminField, row: Record<string, unknown>): string | null {
  const id = row[columnName(db, table, field)];
  if (id === null || id === undefined) return null;
  const spec = REF_TABLES[field.target as RefTarget];
  const found = get<Record<string, unknown>>(db, `SELECT ${spec.identify} AS value FROM ${spec.table} WHERE id = @id`, { id: Number(id) });
  return found ? String(found.value) : null;
}

const columnCache = new Map<string, Map<string, { notNull: boolean; defaultValue: string | null }>>();

function tableInfo(db: Database.Database, table: string) {
  let info = columnCache.get(table);
  if (!info) {
    info = new Map(
      all<{ name: string; notnull: number; dflt_value: string | null }>(db, `PRAGMA table_info(${table})`).map((row) => [
        row.name,
        { notNull: row.notnull === 1, defaultValue: row.dflt_value }
      ])
    );
    columnCache.set(table, info);
  }
  return info;
}

/**
 * A document key maps to a snake_case column unless the descriptor names one, and the answer is
 * checked against the real table. Column names are the one part of a query this module cannot
 * parameterise, so a descriptor typo surfaces here rather than as broken SQL.
 */
function columnName(db: Database.Database, table: string, field: AdminField): string {
  const name = field.column ?? field.key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
  if (!tableInfo(db, table).has(name)) {
    throw new Error(`Content descriptor names a column that does not exist: ${table}.${name}`);
  }
  return name;
}

export const REF_TARGET_NAMES = Object.keys(REF_TABLES) as RefTarget[];

/**
 * The choices a `ref` field can offer. The editor needs them to render a select, and the names stay
 * on this side of the wire: the browser only ever sees the value it would write back.
 */
export function refOptions(db: Database.Database, target: RefTarget, courseId: number | null, q: string, limit: number) {
  const spec = REF_TABLES[target];
  const labelColumn = spec.label;
  if (target === 'course_modules') {
    if (courseId === null) throw ApiError.badRequest('Choose the course before listing its modules.');
    return all<Record<string, unknown>>(
      db,
      `SELECT ${labelColumn} AS value, ${labelColumn} AS label FROM ${spec.table}
        WHERE course_id = @courseId ORDER BY order_index ASC, id ASC LIMIT @limit`,
      { courseId, limit }
    );
  }
  const params: Record<string, unknown> = { needle: likeContains(q), limit };
  const where = q === '' ? '' : `WHERE ${labelColumn} LIKE @needle ESCAPE '\\' OR slug LIKE @needle ESCAPE '\\'`;
  return all<Record<string, unknown>>(
    db,
    `SELECT ${spec.identify} AS value, ${labelColumn} AS label FROM ${spec.table} ${where}
      ORDER BY ${labelColumn} ASC LIMIT @limit`,
    params
  );
}

function toColumnValue(field: AdminField, value: unknown): unknown {
  if (value === undefined || value === null) {
    return field.type === 'string-list' || field.type === 'json' ? JSON.stringify(field.type === 'json' ? {} : []) : null;
  }
  switch (field.type) {
    case 'boolean':
      return value ? 1 : 0;
    case 'string-list':
      return JSON.stringify(value);
    case 'json':
      return JSON.stringify(value ?? {});
    case 'number':
      return Number(value);
    default:
      return value;
  }
}

function fromColumnValue(field: AdminField, raw: unknown): unknown {
  if (field.type === 'boolean') return raw === 1 || raw === true;
  if (field.type === 'string-list' || field.type === 'json') {
    if (typeof raw !== 'string') return field.type === 'json' ? {} : [];
    try {
      return JSON.parse(raw);
    } catch {
      return field.type === 'json' ? {} : [];
    }
  }
  if (field.type === 'number') return raw === null || raw === undefined ? null : Number(raw);
  if (raw === null || raw === undefined) return null;
  return raw;
}

/** Ordered refs first: a module is looked up inside the course the same document names. */
function orderedRefFields(kind: AdminKind): AdminField[] {
  const refs = kind.fields.filter((field) => field.type === 'ref');
  return [...refs.filter((f) => f.target !== 'course_modules'), ...refs.filter((f) => f.target === 'course_modules')];
}

function columnMap(db: Database.Database, kind: AdminKind, doc: Record<string, unknown>): Record<string, unknown> {
  const map: Record<string, unknown> = {};
  const info = tableInfo(db, kind.table);
  const scope = { courseId: null as number | null };

  /**
   * An empty optional field is written as NULL, which a `NOT NULL DEFAULT ''` column rejects. When
   * the column has a default we leave it out of the statement and let the table answer for itself;
   * when it has none, the field is genuinely missing and the writer hears about it in plain words.
   */
  const put = (field: AdminField, name: string, value: unknown) => {
    if (value === null) {
      const column = info.get(name);
      if (column?.notNull) {
        if (column.defaultValue === null) {
          throw ApiError.unprocessable(`A ${kind.kind} needs a value for "${field.label}".`, [{ field: field.key, message: 'Required.' }]);
        }
        return;
      }
    }
    map[name] = value;
  };

  for (const field of orderedRefFields(kind)) {
    const id = resolveRef(db, field.target as RefTarget, doc[field.key], scope);
    put(field, columnName(db, kind.table, field), id);
    if (field.target === 'courses') scope.courseId = id;
  }
  for (const field of kind.fields) {
    if (field.type === 'ref') continue;
    put(field, columnName(db, kind.table, field), toColumnValue(field, doc[field.key]));
  }
  return map;
}

export function readContent(db: Database.Database, kind: AdminKind, ref: string): ContentDocument {
  const row = rowByIdOrSlug(db, kind, ref);
  const doc: Record<string, unknown> = {};
  for (const field of kind.fields) {
    if (field.type === 'ref') doc[field.key] = refValueFor(db, kind.table, field, row);
    else doc[field.key] = fromColumnValue(field, row[columnName(db, kind.table, field)]);
  }
  for (const relation of kind.relations) doc[relation.key] = readItems(db, relation, Number(row.id));

  return {
    meta: {
      id: Number(row.id),
      slug: hasSlug(kind) ? String(row[kind.slugColumn as string] ?? '') : null,
      title: String(row[titleColumnOf(kind)] ?? ''),
      status: kind.statusColumn ? String(row[kind.statusColumn] ?? '') : null,
      createdAt: String(row.created_at ?? ''),
      updatedAt: kind.updatedColumn ? String(row.updated_at ?? '') : null
    },
    doc
  };
}

function readItems(db: Database.Database, relation: AdminRelation, parentId: number): unknown[] {
  // Link tables have no id column of their own, so ordering falls back to the far side or the rowid.
  const order = relation.position
    ? `${relation.position} ASC, rowid ASC`
    : relation.other
      ? `${relation.other} ASC`
      : 'rowid ASC';
  const rows = all<Record<string, unknown>>(db, `SELECT * FROM ${relation.table} WHERE ${relation.fk} = @id ORDER BY ${order}`, {
    id: parentId
  });
  return rows.map((row) => itemFromRow(db, relation, row));
}

function topicSlug(db: Database.Database, id: number | null): string | null {
  if (id === null) return null;
  const row = get<{ slug: string }>(db, 'SELECT slug FROM topics WHERE id = @id', { id });
  return row?.slug ?? null;
}

function itemFromRow(db: Database.Database, relation: AdminRelation, row: Record<string, unknown>): unknown {
  switch (relation.shape) {
    case 'block':
      return { type: row.type, text: row.text, payload: safeParse(row.payload, {}) };
    case 'reference':
      return {
        title: row.title,
        authors: row.authors ?? null,
        year: row.year === null || row.year === undefined ? null : Number(row.year),
        type: row.type,
        url: row.url ?? null,
        note: row.note ?? null
      };
    case 'option':
      return { label: row.label, text: row.text, isCorrect: row.is_correct === 1, feedback: row.feedback ?? null };
    case 'hint':
      return { text: row.text };
    case 'prerequisite':
      return { slug: topicSlug(db, Number(row.requires_id)) ?? '', kind: row.kind, note: row.note ?? null };
    case 'topic-link':
      return { slug: topicSlug(db, Number(row[relation.other ?? 'topic_id'])) ?? '' };
    case 'path-topic':
      return { slug: topicSlug(db, Number(row.topic_id)) ?? '' };
    case 'collection-item': {
      const resource = get<{ slug: string }>(db, 'SELECT slug FROM resources WHERE id = @id', { id: Number(row.resource_id) });
      return { slug: resource?.slug ?? '', note: row.note ?? '' };
    }
    case 'module':
      return { title: String(row.title ?? ''), summary: String(row.summary ?? '') };
  }
}

function safeParse(raw: unknown, fallback: unknown): unknown {
  if (typeof raw !== 'string') return raw ?? fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeItems(db: Database.Database, relation: AdminRelation, parentId: number, items: unknown[]) {
  // Modules are the one child table lessons point at, so they are edited in place rather than
  // rebuilt: delete-and-reinsert would silently ungroup every lesson in the course.
  if (relation.shape === 'module') return writeModules(db, parentId, items);

  // These shapes join on a slug, and the table's primary key will not hold the same pair twice.
  if (['topic-link', 'path-topic', 'collection-item', 'prerequisite'].includes(relation.shape)) {
    const slugs = items.map((item) => String((item as { slug: string }).slug));
    const duplicate = slugs.find((slug, index) => slugs.indexOf(slug) !== index);
    if (duplicate !== undefined) throw ApiError.badRequest(`"${duplicate}" is listed twice.`);
  }

  run(db, `DELETE FROM ${relation.table} WHERE ${relation.fk} = @id`, { id: parentId });
  const stamp = nowIso();

  items.forEach((raw, index) => {
    const item = raw as Record<string, unknown>;
    switch (relation.shape) {
      case 'block':
        insert(
          db,
          `INSERT INTO lesson_blocks (lesson_id, order_index, type, text, payload, created_at, updated_at)
           VALUES (@parent, @position, @type, @text, @payload, @now, @now)`,
          { parent: parentId, position: index, type: item.type, text: item.text ?? '', payload: JSON.stringify(item.payload ?? {}), now: stamp }
        );
        break;
      case 'reference':
        insert(
          db,
          `INSERT INTO ${relation.table} (${relation.fk}, position, title, authors, year, type, url, note)
           VALUES (@parent, @position, @title, @authors, @year, @type, @url, @note)`,
          {
            parent: parentId,
            position: index,
            title: item.title,
            authors: emptyToNull(item.authors),
            year: item.year === null || item.year === undefined ? null : Number(item.year),
            type: item.type,
            url: emptyToNull(item.url),
            note: emptyToNull(item.note)
          }
        );
        break;
      case 'option':
        insert(
          db,
          `INSERT INTO exercise_options (exercise_id, label, text, is_correct, position, feedback)
           VALUES (@parent, @label, @text, @isCorrect, @position, @feedback)`,
          {
            parent: parentId,
            label: item.label,
            text: item.text,
            isCorrect: item.isCorrect ? 1 : 0,
            position: index,
            feedback: emptyToNull(item.feedback)
          }
        );
        break;
      case 'hint':
        insert(db, `INSERT INTO exercise_hints (exercise_id, position, text) VALUES (@parent, @position, @text)`, {
          parent: parentId,
          position: index,
          text: item.text
        });
        break;
      case 'prerequisite': {
        const requiresId = resolveRef(db, 'topics', item.slug, { courseId: null });
        if (requiresId === null) throw ApiError.badRequest(`Unknown prerequisite topic "${String(item.slug)}".`);
        if (requiresId === parentId) throw ApiError.badRequest('A topic cannot require itself.');
        insert(
          db,
          `INSERT INTO topic_relations (topic_id, requires_id, kind, note) VALUES (@parent, @requires, @kind, @note)`,
          { parent: parentId, requires: requiresId, kind: item.kind, note: emptyToNull(item.note) }
        );
        break;
      }
      case 'topic-link':
      case 'path-topic': {
        const topicId = resolveRef(db, 'topics', item.slug, { courseId: null });
        if (topicId === null) throw ApiError.badRequest(`Unknown topic "${String(item.slug)}".`);
        if (relation.shape === 'topic-link') {
          insert(db, `INSERT INTO ${relation.table} (${relation.fk}, topic_id) VALUES (@parent, @topic)`, {
            parent: parentId,
            topic: topicId
          });
        } else {
          // Keep any stage the curriculum build already assigned to this topic.
          const stage = get<{ stage_id: number | null }>(
            db,
            `SELECT stage_id FROM ${relation.table} WHERE path_id = @parent AND topic_id = @topic`,
            { parent: parentId, topic: topicId }
          );
          run(db, `DELETE FROM ${relation.table} WHERE path_id = @parent AND topic_id = @topic`, { parent: parentId, topic: topicId });
          insert(
            db,
            `INSERT INTO ${relation.table} (path_id, topic_id, stage_id, order_index, is_optional)
             VALUES (@parent, @topic, @stage, @position, 0)`,
            { parent: parentId, topic: topicId, stage: stage?.stage_id ?? null, position: index }
          );
        }
        break;
      }
      case 'collection-item': {
        const resource = get<{ id: number }>(db, 'SELECT id FROM resources WHERE slug = @slug', { slug: String(item.slug) });
        if (!resource) throw ApiError.badRequest(`Unknown resource "${String(item.slug)}" in this collection.`);
        insert(
          db,
          `INSERT INTO curated_collection_items (collection_id, resource_id, position, note) VALUES (@parent, @resource, @position, @note)`,
          { parent: parentId, resource: resource.id, position: index, note: String(item.note ?? '') }
        );
        break;
      }
    }
  });
}

function emptyToNull(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text === '' ? null : text;
}

/** Titles are the stable key staff see, so a module that keeps its name keeps its identity and its lessons. */
function writeModules(db: Database.Database, courseId: number, items: unknown[]): void {
  const names = new Set<string>();
  for (const raw of items) {
    const title = String((raw as { title: string }).title);
    if (names.has(title)) throw ApiError.badRequest(`Two modules are both called "${title}".`);
    names.add(title);
  }
  const existing = new Map<string, { id: number }>(
    all<{ id: number; title: string }>(db, 'SELECT id, title FROM course_modules WHERE course_id = @id', { id: courseId }).map((row) => [
      row.title,
      { id: Number(row.id) }
    ])
  );

  items.forEach((raw, index) => {
    const item = raw as { title: string; summary?: string | null };
    const found = existing.get(item.title);
    if (found === undefined) {
      insert(db, 'INSERT INTO course_modules (course_id, title, summary, order_index) VALUES (@course, @title, @summary, @position)', {
        course: courseId,
        title: item.title,
        summary: item.summary ?? '',
        position: index
      });
      return;
    }
    existing.delete(item.title);
    run(db, 'UPDATE course_modules SET summary = @summary, order_index = @position WHERE id = @id', {
      summary: item.summary ?? '',
      position: index,
      id: found.id
    });
  });

  for (const [title, module] of existing) {
    const attached = Number(get<{ n: number }>(db, 'SELECT COUNT(*) AS n FROM lessons WHERE module_id = @id', { id: module.id })?.n ?? 0);
    if (attached > 0) {
      throw ApiError.badRequest(`"${title}" still has ${attached} lesson${attached === 1 ? '' : 's'} in it. Move them to another module first.`);
    }
    run(db, 'DELETE FROM course_modules WHERE id = @id', { id: module.id });
  }
}

export type Staff = { id: number; name: string };

export function saveContent(
  db: Database.Database,
  kind: AdminKind,
  doc: Record<string, unknown>,
  ref: string | null,
  actor: Staff
): { id: number; ref: string } {
  return tx(db, () => {
    const columns = columnMap(db, kind, doc);
    const stamp = nowIso();
    const readableRef = hasSlug(kind) ? String(doc[kind.slugColumn ?? 'slug'] ?? '') : null;
    let id: number;

    if (ref === null) {
      columns.created_at = stamp;
      if (kind.updatedColumn) columns.updated_at = stamp;
      const names = Object.keys(columns);
      id = insert(
        db,
        `INSERT INTO ${kind.table} (${names.join(', ')}) VALUES (${names.map((n) => `@${n}`).join(', ')})`,
        columns
      );
    } else {
      const existing = rowByIdOrSlug(db, kind, ref);
      id = Number(existing.id);
      if (kind.kind === 'lesson') snapshotLesson(db, id, actor, existing);
      const assignment = Object.keys(columns)
        .filter((name) => name !== 'created_at')
        .map((name) => `${name} = @${name}`);
      if (kind.updatedColumn) assignment.push('updated_at = @stamp');
      run(db, `UPDATE ${kind.table} SET ${assignment.join(', ')} WHERE id = @id`, { ...columns, id, stamp });
    }

    for (const relation of kind.relations) {
      if (doc[relation.key] === undefined) continue;
      writeItems(db, relation, id, doc[relation.key] as unknown[]);
    }

    const target = readableRef ?? String(id);
    recordChange(db, actor, kind.kind, id, target, ref === null ? 'create' : 'update', `${ref === null ? 'Created' : 'Updated'} ${kind.kind} "${target}"`);
    return { id, ref: target };
  });
}

function snapshotLesson(db: Database.Database, lessonId: number, actor: Staff, existing: Record<string, unknown>) {
  const blocks = all<Record<string, unknown>>(db, 'SELECT * FROM lesson_blocks WHERE lesson_id = @id ORDER BY order_index', { id: lessonId });
  insert(db, `INSERT INTO lesson_revisions (lesson_id, edited_by, created_at, snapshot, note) VALUES (@id, @actor, @now, @snapshot, @note)`, {
    id: lessonId,
    actor: actor.id,
    now: nowIso(),
    snapshot: JSON.stringify({ lesson: existing, blocks }),
    note: 'Saved automatically before this edit.'
  });
}

/** The point of the snapshot is that a bad save is recoverable, so the old text has to be readable. */
export function lessonRevisions(db: Database.Database, ref: string, limit: number) {
  const lesson = rowByIdOrSlug(db, kindOrThrow('lesson'), ref);
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT r.id, r.created_at, r.note, r.snapshot, u.display_name AS editor
       FROM lesson_revisions r
       LEFT JOIN users u ON u.id = r.edited_by
      WHERE r.lesson_id = @id
      ORDER BY r.id DESC
      LIMIT @limit`,
    { id: Number(lesson.id), limit }
  );
  return rows.map((row) => ({
    id: Number(row.id),
    createdAt: String(row.created_at),
    editor: row.editor === null || row.editor === undefined ? 'Someone who has since left' : String(row.editor),
    note: String(row.note ?? ''),
    blockCount: readSnapshot(row.snapshot).blocks.length
  }));
}

export function lessonRevision(db: Database.Database, ref: string, revisionId: number) {
  const lesson = rowByIdOrSlug(db, kindOrThrow('lesson'), ref);
  const row = get<Record<string, unknown>>(
    db,
    `SELECT r.*, u.display_name AS editor FROM lesson_revisions r
      LEFT JOIN users u ON u.id = r.edited_by
     WHERE r.id = @revision AND r.lesson_id = @lesson`,
    { revision: revisionId, lesson: Number(lesson.id) }
  );
  if (!row) throw ApiError.notFound(`That lesson has no saved version ${revisionId}.`);
  const snapshot = readSnapshot(row.snapshot);
  return {
    id: Number(row.id),
    createdAt: String(row.created_at),
    editor: row.editor === null || row.editor === undefined ? 'Someone who has since left' : String(row.editor),
    note: String(row.note ?? ''),
    lesson: {
      title: String(snapshot.lesson.title ?? ''),
      summary: String(snapshot.lesson.summary ?? ''),
      status: String(snapshot.lesson.status ?? ''),
      estimatedMinutes:
        snapshot.lesson.estimated_minutes === null || snapshot.lesson.estimated_minutes === undefined
          ? null
          : Number(snapshot.lesson.estimated_minutes)
    },
    blocks: snapshot.blocks
  };
}

type LessonSnapshot = { lesson: Record<string, unknown>; blocks: { type: string; text: string; payload: unknown }[] };

function readSnapshot(raw: unknown): LessonSnapshot {
  const parsed = safeParse(raw, {}) as Partial<LessonSnapshot>;
  const blocks = Array.isArray(parsed.blocks) ? parsed.blocks : [];
  return {
    lesson: parsed.lesson && typeof parsed.lesson === 'object' ? parsed.lesson : {},
    blocks: blocks.map((block) => {
      const b = (block ?? {}) as Record<string, unknown>;
      return { type: String(b.type ?? ''), text: String(b.text ?? ''), payload: safeParse(b.payload, {}) };
    })
  };
}

export function deleteContent(db: Database.Database, kind: AdminKind, ref: string, actor: Staff): string {
  return tx(db, () => {
    const row = rowByIdOrSlug(db, kind, ref);
    recordChange(db, actor, kind.kind, Number(row.id), ref, 'delete', `Deleted ${kind.kind} "${ref}"`);
    run(db, `DELETE FROM ${kind.table} WHERE id = @id`, { id: Number(row.id) });
    return String(row[titleColumnOf(kind)] ?? ref);
  });
}

export function setStatus(db: Database.Database, kind: AdminKind, ref: string, status: string, actor: Staff): string {
  if (!kind.statusColumn || !kind.statuses?.includes(status)) {
    throw ApiError.badRequest(`A ${kind.kind} cannot move to "${status}".`);
  }
  const row = rowByIdOrSlug(db, kind, ref);
  const title = String(row[titleColumnOf(kind)] ?? ref);
  run(db, `UPDATE ${kind.table} SET ${kind.statusColumn} = @status${kind.updatedColumn ? ', updated_at = @now' : ''} WHERE id = @id`, {
    status,
    now: nowIso(),
    id: Number(row.id)
  });
  recordChange(db, actor, kind.kind, Number(row.id), ref, 'status', `${title} → ${status}`);
  return title;
}

export function recordChange(
  db: Database.Database,
  actor: Staff,
  kind: string,
  entityId: number | null,
  entityRef: string,
  action: 'create' | 'update' | 'delete' | 'status' | 'provider' | 'user',
  summary: string
) {
  insert(
    db,
    `INSERT INTO content_changes (actor_id, actor_name, kind, entity_id, entity_ref, action, summary, created_at)
     VALUES (@actor, @name, @kind, @entity, @ref, @action, @summary, @now)`,
    {
      actor: actor.id,
      name: actor.name,
      kind,
      entity: entityId,
      ref: entityRef.slice(0, 120),
      action,
      summary: summary.slice(0, 300),
      now: nowIso()
    }
  );
}

export type OverviewContentRow = {
  kind: string;
  label: string;
  total: number;
  /** Null when this type has no published state, so the studio never implies one it cannot do. */
  published: number | null;
  unpublished: number | null;
  /** Life-cycle tally (open, upcoming, …) for the types that use one instead of a publish switch. */
  statuses: { status: string; count: number }[];
};

export type Overview = {
  content: OverviewContentRow[];
  people: { learners: number; staff: number; active: number };
  assistant: { configured: boolean; providers: number; enabled: number };
  recent: { id: number; at: string; who: string; action: string; kind: string }[];
  health: { key: string; label: string; kind: string; count: number; note: string }[];
};

export function overview(db: Database.Database): Overview {
  const content = ADMIN_KINDS.map<OverviewContentRow>((kind) => {
    const status = kind.statusColumn;
    const publishable = status !== undefined && (kind.statuses ?? []).includes('published');
    const total = Number(get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${kind.table}`)?.n ?? 0);
    const published = publishable
      ? Number(get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM ${kind.table} WHERE ${status} = 'published'`)?.n ?? 0)
      : null;
    const statuses = status === undefined || publishable
      ? []
      : all<{ status: string; n: number }>(
          db,
          `SELECT COALESCE(${status}, 'unset') AS status, COUNT(*) AS n FROM ${kind.table} GROUP BY 1 ORDER BY n DESC, status`
        ).map((row) => ({ status: row.status, count: Number(row.n) }));
    return {
      kind: kind.kind,
      label: kind.label,
      total,
      published,
      unpublished: published === null ? null : total - published,
      statuses
    };
  });

  const people = get<{ learners: number; staff: number; active: number }>(
    db,
    `SELECT SUM(CASE WHEN role = 'learner' THEN 1 ELSE 0 END) AS learners,
            SUM(CASE WHEN role IN ('author','admin') THEN 1 ELSE 0 END) AS staff,
            SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) AS active
       FROM users`
  );

  const providers = get<{ n: number; enabled: number }>(
    db,
    'SELECT COUNT(*) AS n, SUM(CASE WHEN is_enabled = 1 THEN 1 ELSE 0 END) AS enabled FROM ai_providers'
  );

  const recent = changeLog(db, 12);

  return {
    content,
    people: { learners: Number(people?.learners ?? 0), staff: Number(people?.staff ?? 0), active: Number(people?.active ?? 0) },
    assistant: { configured: Number(providers?.enabled ?? 0) > 0, providers: Number(providers?.n ?? 0), enabled: Number(providers?.enabled ?? 0) },
    recent: recent.map((row) => ({
      id: Number(row.id),
      at: String(row.created_at),
      who: String(row.actor_name),
      action: String(row.summary),
      kind: String(row.kind)
    })),
    health: contentHealth(db)
  };
}

/**
 * Counts of content that would embarrass the curriculum if it shipped: a published lesson with no
 * body, a choice question nobody can answer correctly, a claim without a source.
 */
function contentHealth(db: Database.Database) {
  const checks: { key: string; label: string; kind: string; note: string; sql: string }[] = [
    {
      key: 'empty_lessons',
      label: 'Published lessons with no content blocks',
      kind: 'lesson',
      note: 'A lesson page with nothing in it reads as broken.',
      sql: `SELECT COUNT(*) AS n FROM lessons l WHERE l.status = 'published' AND NOT EXISTS (SELECT 1 FROM lesson_blocks b WHERE b.lesson_id = l.id)`
    },
    {
      key: 'unmarkable',
      label: 'Published questions nobody can be marked right on',
      kind: 'exercise',
      note: 'Choice questions need one correct option; true/false needs its answer in the answer spec.',
      sql: `SELECT COUNT(*) AS n FROM exercises e WHERE e.status = 'published'
              AND (
                (e.kind IN ('single_choice','multi_choice')
                  AND NOT EXISTS (SELECT 1 FROM exercise_options o WHERE o.exercise_id = e.id AND o.is_correct = 1))
                OR (e.kind = 'true_false' AND json_extract(e.answer_spec, '\$.expected') IS NULL
                  AND NOT EXISTS (SELECT 1 FROM exercise_options o WHERE o.exercise_id = e.id AND o.is_correct = 1))
              )`
    },
    {
      key: 'thin_topics',
      label: 'Published topics with an empty definition',
      kind: 'topic',
      note: 'The definition is the first thing an explore page shows.',
      sql: `SELECT COUNT(*) AS n FROM topics WHERE status = 'published' AND TRIM(definition) = ''`
    },
    {
      key: 'unverified_links',
      label: 'Published resources not marked as link-checked',
      kind: 'resource',
      note: 'Checked here means somebody opened the link and compared it with the description.',
      sql: `SELECT COUNT(*) AS n FROM resources WHERE status = 'published' AND verified = 0`
    },
    {
      key: 'empty_collections',
      label: 'Reading lists with no resources',
      kind: 'collection',
      note: 'An empty list is worse than no list.',
      sql: `SELECT COUNT(*) AS n FROM curated_collections c WHERE NOT EXISTS (SELECT 1 FROM curated_collection_items i WHERE i.collection_id = c.id)`
    },
    {
      key: 'empty_paths',
      label: 'Published paths with no topics',
      kind: 'path',
      note: 'Learners cannot make progress on a path that sequences nothing.',
      sql: `SELECT COUNT(*) AS n FROM learning_paths p WHERE p.status = 'published' AND NOT EXISTS (SELECT 1 FROM learning_path_topics pt WHERE pt.path_id = p.id)`
    },
    {
      key: 'orphan_exercises',
      label: 'Published exercises attached to unpublished content',
      kind: 'exercise',
      note: 'Either publish the lesson too, or move the exercise somewhere reachable.',
      sql: `SELECT COUNT(*) AS n FROM exercises e WHERE e.status = 'published' AND e.lesson_id IS NOT NULL
              AND NOT EXISTS (SELECT 1 FROM lessons l WHERE l.id = e.lesson_id AND l.status = 'published')`
    }
  ];

  return checks.map((check) => ({
    key: check.key,
    label: check.label,
    kind: check.kind,
    note: check.note,
    count: Number(get<{ n: number }>(db, check.sql)?.n ?? 0)
  }));
}

export function providerRows(db: Database.Database) {
  return all<Record<string, unknown>>(db, 'SELECT * FROM ai_providers ORDER BY priority ASC, id ASC');
}

export function userRows(db: Database.Database, filters: { q: string; limit: number; offset: number }) {
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: filters.limit, offset: filters.offset };
  if (filters.q !== '') {
    where.push(`(email LIKE @q ESCAPE '\\' OR display_name LIKE @q ESCAPE '\\')`);
    params.q = likeContains(filters.q);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = Number(get<{ n: number }>(db, `SELECT COUNT(*) AS n FROM users ${clause}`, params)?.n ?? 0);
  const items = all<Record<string, unknown>>(
    db,
    `SELECT id, email, display_name, role, is_active, created_at, last_login_at,
            (SELECT COUNT(*) FROM sessions s WHERE CAST(s.user_id AS INTEGER) = users.id AND s.expires_at > @now) AS sessions
       FROM users ${clause} ORDER BY id ASC LIMIT @limit OFFSET @offset`,
    { ...params, now: nowIso() }
  );
  return { items, total };
}


// ------------------------------------------------------------ providers and accounts
//
// The service decides what is legal; this module is the only place that knows these tables' columns.

export type ProviderWrite = {
  name: string;
  adapter: string;
  baseUrl: string;
  model: string;
  ciphertext: string;
  hint: string;
  isEnabled: boolean;
  priority: number;
  temperature: number;
  maxTokens: number;
  timeoutMs: number;
};

export function providerById(db: Database.Database, id: number): Record<string, unknown> {
  const row = get<Record<string, unknown>>(db, 'SELECT * FROM ai_providers WHERE id = @id', { id });
  if (!row) throw ApiError.notFound(`No provider with id ${id}.`);
  return row;
}

export function providerNameTaken(db: Database.Database, name: string, exceptId: number): boolean {
  return get<{ id: number }>(db, 'SELECT id FROM ai_providers WHERE name = @name AND id <> @id', { name, id: exceptId }) !== undefined;
}

export function writeProvider(db: Database.Database, values: ProviderWrite, id: number | null): number {
  if (id === null) {
    const now = nowIso();
    return insert(
      db,
      `INSERT INTO ai_providers (name, adapter, base_url, model, api_key_ciphertext, api_key_hint, is_enabled, priority, temperature, max_tokens, timeout_ms, created_at, updated_at)
       VALUES (@name, @adapter, @baseUrl, @model, @ciphertext, @hint, @isEnabled, @priority, @temperature, @maxTokens, @timeoutMs, @now, @now)`,
      { ...values, isEnabled: values.isEnabled ? 1 : 0, now }
    );
  }
  run(
    db,
    `UPDATE ai_providers SET name = @name, adapter = @adapter, base_url = @baseUrl, model = @model,
            api_key_ciphertext = @ciphertext, api_key_hint = @hint, is_enabled = @isEnabled,
            priority = @priority, temperature = @temperature, max_tokens = @maxTokens, timeout_ms = @timeoutMs,
            updated_at = @now
     WHERE id = @id`,
    { ...values, isEnabled: values.isEnabled ? 1 : 0, now: nowIso(), id }
  );
  return id;
}

export function deleteProviderRow(db: Database.Database, id: number): void {
  run(db, 'DELETE FROM ai_providers WHERE id = @id', { id });
}

export type Account = { id: number; role: string; isActive: boolean; displayName: string };

export function accountById(db: Database.Database, id: number): Account {
  const row = get<Record<string, unknown>>(db, 'SELECT id, role, is_active, display_name FROM users WHERE id = @id', { id });
  if (!row) throw ApiError.notFound(`No account with id ${id}.`);
  return { id: Number(row.id), role: String(row.role), isActive: row.is_active === 1, displayName: String(row.display_name) };
}

export function writeAccount(db: Database.Database, id: number, role: string, isActive: boolean): void {
  run(db, 'UPDATE users SET role = @role, is_active = @active, updated_at = @now WHERE id = @id', {
    role,
    active: isActive ? 1 : 0,
    now: nowIso(),
    id
  });
}

export function signOutEverywhere(db: Database.Database, userId: number): void {
  run(db, 'DELETE FROM sessions WHERE CAST(user_id AS INTEGER) = @id', { id: userId });
}

export function otherActiveAdmins(db: Database.Database, id: number): number {
  return Number(
    get<{ n: number }>(db, "SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND is_active = 1 AND id <> @id", { id })?.n ?? 0
  );
}

export function changeLog(db: Database.Database, limit: number) {
  return all<Record<string, unknown>>(
    db,
    `SELECT c.id, c.created_at, c.actor_name, c.kind, c.entity_ref, c.action, c.summary,
            CASE WHEN c.actor_id IS NULL THEN 0 ELSE 1 END AS actor_exists
       FROM content_changes c ORDER BY c.id DESC LIMIT @limit`,
    { limit }
  );
}
