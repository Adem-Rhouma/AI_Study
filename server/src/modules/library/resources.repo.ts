import type Database from 'better-sqlite3';
import { all, get, likeContains, run } from '../../db/sql.js';
import { nowIso, type Difficulty } from '../../lib/domain.js';

export type ResourceSort = 'newest' | 'oldest' | 'title' | 'relevance';

export type ResourceSummary = {
  id: number;
  slug: string;
  title: string;
  description: string;
  type: string;
  url: string;
  authors: string;
  publisher: string;
  publishedYear: number | null;
  sourceName: string;
  difficulty: Difficulty;
  estMinutes: number | null;
  isCurated: boolean;
  verified: boolean;
  status: string;
  createdAt: string;
  updatedAt: string;
  topics: string[];
  bookmarked: boolean;
};

export type RelatedTopic = { slug: string; name: string; difficulty: Difficulty };

export type ResourceDetail = ResourceSummary & {
  relatedTopics: RelatedTopic[];
  tags: string[];
  similar: { slug: string; title: string; type: string; sharedTopics: number }[];
  appearsInCollections: { slug: string; title: string; kind: string }[];
};

export type ResourceFilters = {
  type?: string;
  difficulty?: string;
  topic?: string;
  domain?: string;
  tag?: string;
  q?: string;
  sort: ResourceSort;
  status: 'published' | 'all';
  limit: number;
  offset: number;
  userId: number | null;
};

/** Shared WHERE builder for the list + count queries so filters can never drift apart. */
function buildWhere(filters: ResourceFilters): { clause: string; params: Record<string, unknown> } {
  const where: string[] = [];
  const params: Record<string, unknown> = { userId: filters.userId ?? 0 };
  if (filters.status === 'all') where.push('1 = 1');
  else {
    where.push('r.status = @status');
    params.status = 'published';
  }
  if (filters.type) {
    where.push('r.type = @type');
    params.type = filters.type;
  }
  if (filters.difficulty && filters.difficulty !== 'all') {
    where.push('r.difficulty = @difficulty');
    params.difficulty = filters.difficulty;
  }
  if (filters.topic) {
    where.push(
      `EXISTS (SELECT 1 FROM resource_topics rt JOIN topics t ON t.id = rt.topic_id
        WHERE rt.resource_id = r.id AND t.slug = @topic)`
    );
    params.topic = filters.topic;
  }
  if (filters.domain) {
    where.push(
      `EXISTS (SELECT 1 FROM resource_topics rt JOIN topics t ON t.id = rt.topic_id
        JOIN subdomains s ON s.id = t.subdomain_id JOIN domains d ON d.id = s.domain_id
        WHERE rt.resource_id = r.id AND d.slug = @domain)`
    );
    params.domain = filters.domain;
  }
  if (filters.tag) {
    where.push(
      `EXISTS (SELECT 1 FROM resource_tags rg JOIN tags g ON g.id = rg.tag_id
        WHERE rg.resource_id = r.id AND g.slug = @tag)`
    );
    params.tag = filters.tag;
  }
  if (filters.q) {
    where.push(
      `(r.title LIKE @q ESCAPE '\\' OR r.description LIKE @q ESCAPE '\\' OR r.authors LIKE @q ESCAPE '\\' OR r.publisher LIKE @q ESCAPE '\\')`
    );
    params.q = likeContains(filters.q);
  }
  return { clause: `WHERE ${where.join(' AND ')}`, params };
}

function sortSql(filters: ResourceFilters): string {
  switch (filters.sort) {
    case 'newest':
      return 'r.created_at DESC, r.id DESC';
    case 'oldest':
      return 'r.created_at ASC, r.id ASC';
    case 'title':
      return 'r.title COLLATE NOCASE ASC';
    case 'relevance':
    default:
      if (filters.q) {
        // Title matches outrank description matches; recency (year) breaks ties.
        return `(CASE WHEN r.title LIKE @q ESCAPE '\\' THEN 0
                      WHEN r.description LIKE @q ESCAPE '\\' THEN 1
                      ELSE 2 END), (r.published_year IS NULL), r.published_year DESC, r.title COLLATE NOCASE ASC`;
      }
      return `(r.published_year IS NULL), r.published_year DESC, r.title COLLATE NOCASE ASC`;
  }
}

function mapResourceRow(row: Record<string, unknown>): ResourceSummary {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    description: String(row.description ?? ''),
    type: String(row.type),
    url: String(row.url),
    authors: String(row.authors ?? ''),
    publisher: String(row.publisher ?? ''),
    publishedYear: row.published_year === null ? null : Number(row.published_year),
    sourceName: String(row.source_name ?? ''),
    difficulty: String(row.difficulty) as Difficulty,
    estMinutes: row.est_minutes === null ? null : Number(row.est_minutes),
    isCurated: Number(row.is_curated) === 1,
    verified: Number(row.verified) === 1,
    status: String(row.status),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    topics: row.topic_names === null ? [] : String(row.topic_names).split('\u001f').filter(Boolean),
    bookmarked: row.bookmarked !== null && Number(row.bookmarked) === 1
  };
}

const RESOURCE_COLUMNS = `r.id, r.slug, r.title, r.description, r.type, r.url, r.authors, r.publisher,
  r.published_year, r.source_name, r.difficulty, r.est_minutes, r.is_curated, r.verified, r.status,
  r.created_at, r.updated_at`;

/**
 * One aggregated query: topic names (max 3) and the viewer's bookmark state ride along as
 * correlated subqueries so the list endpoint never fans out into N+1 reads.
 */
export function listResources(
  db: Database.Database,
  filters: ResourceFilters
): { items: ResourceSummary[]; total: number } {
  const { clause, params } = buildWhere(filters);
  const total = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM resources r ${clause}`, params)?.c ?? 0;
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT ${RESOURCE_COLUMNS},
            (SELECT group_concat(x.name, char(31)) FROM (
               SELECT t.name AS name FROM resource_topics rt JOIN topics t ON t.id = rt.topic_id
                WHERE rt.resource_id = r.id AND t.status = 'published' ORDER BY t.name LIMIT 3) AS x) AS topic_names,
            (SELECT 1 FROM user_resource_bookmarks ub
              WHERE ub.resource_id = r.id AND ub.user_id = @userId LIMIT 1) AS bookmarked
     FROM resources r ${clause}
     ORDER BY ${sortSql(filters)}
     LIMIT @limit OFFSET @offset`,
    { ...params, limit: filters.limit, offset: filters.offset }
  );
  return { items: rows.map(mapResourceRow), total };
}

export function getResourceBySlug(
  db: Database.Database,
  slug: string,
  opts: { canSeeDrafts: boolean; userId: number | null }
): ResourceDetail | null {
  const row = get<Record<string, unknown>>(
    db,
    `SELECT ${RESOURCE_COLUMNS},
            (SELECT group_concat(x.name, char(31)) FROM (
               SELECT t.name AS name FROM resource_topics rt JOIN topics t ON t.id = rt.topic_id
                WHERE rt.resource_id = r.id ORDER BY t.name LIMIT 3) AS x) AS topic_names,
            (SELECT 1 FROM user_resource_bookmarks ub
              WHERE ub.resource_id = r.id AND ub.user_id = @userId LIMIT 1) AS bookmarked
     FROM resources r WHERE r.slug = @slug`,
    { slug, userId: opts.userId ?? 0 }
  );
  if (!row) return null;
  if (!opts.canSeeDrafts && row.status !== 'published') return null;
  const base = mapResourceRow(row);
  const id = base.id;

  const relatedTopics = all<Record<string, unknown>>(
    db,
    `SELECT t.slug, t.name, t.difficulty FROM resource_topics rt JOIN topics t ON t.id = rt.topic_id
     WHERE rt.resource_id = @id ORDER BY t.name`,
    { id }
  ).map((t) => ({ slug: String(t.slug), name: String(t.name), difficulty: String(t.difficulty) as Difficulty }));

  const tags = all<{ name: string }>(
    db,
    `SELECT g.name FROM resource_tags rg JOIN tags g ON g.id = rg.tag_id WHERE rg.resource_id = @id ORDER BY g.name`,
    { id }
  ).map((t) => t.name);

  // Similarity = number of shared topics; ties broken alphabetically. Published-only.
  const similar = all<Record<string, unknown>>(
    db,
    `SELECT r2.slug, r2.title, r2.type, COUNT(*) AS shared
     FROM resource_topics a
     JOIN resource_topics b ON b.topic_id = a.topic_id AND b.resource_id <> a.resource_id
     JOIN resources r2 ON r2.id = b.resource_id
     WHERE a.resource_id = @id AND r2.status = 'published'
     GROUP BY r2.id ORDER BY shared DESC, r2.title COLLATE NOCASE ASC LIMIT 8`,
    { id }
  ).map((s) => ({
    slug: String(s.slug),
    title: String(s.title),
    type: String(s.type),
    sharedTopics: Number(s.shared)
  }));

  const appearsInCollections = all<{ slug: string; title: string; kind: string }>(
    db,
    `SELECT c.slug, c.title, c.kind FROM curated_collection_items ci
     JOIN curated_collections c ON c.id = ci.collection_id
     WHERE ci.resource_id = @id ORDER BY c.order_index, c.title`,
    { id }
  );

  return { ...base, relatedTopics, tags, similar, appearsInCollections };
}

export type Facet = { value: string; count: number };

export function getResourceFacets(db: Database.Database): { types: Facet[]; difficulties: Facet[] } {
  const rows = all<{ type: string; difficulty: string; c: number }>(
    db,
    `SELECT type, difficulty, COUNT(*) AS c FROM resources WHERE status = 'published' GROUP BY type, difficulty`
  );
  const byType = new Map<string, number>();
  const byDifficulty = new Map<string, number>();
  for (const r of rows) {
    byType.set(r.type, (byType.get(r.type) ?? 0) + r.c);
    byDifficulty.set(r.difficulty, (byDifficulty.get(r.difficulty) ?? 0) + r.c);
  }
  const order = ['introductory', 'beginner', 'intermediate', 'advanced', 'expert'];
  const sortFacet = (map: Map<string, number>): Facet[] =>
    [...map.entries()]
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => {
        const da = order.indexOf(a.value);
        const db_ = order.indexOf(b.value);
        if (da !== -1 || db_ !== -1) return (da === -1 ? 99 : da) - (db_ === -1 ? 99 : db_);
        return b.count - a.count || a.value.localeCompare(b.value);
      });
  return {
    types: [...byType.entries()].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value)),
    difficulties: sortFacet(byDifficulty)
  };
}

/** Returns the visible resource id for a slug, or null when it does not exist / is a draft. */
export function findResourceId(db: Database.Database, slug: string, canSeeDrafts: boolean): { id: number; title: string } | null {
  const row = get<{ id: number; title: string; status: string }>(
    db,
    'SELECT id, title, status FROM resources WHERE slug = ?',
    { slug }
  );
  if (!row) return null;
  if (!canSeeDrafts && row.status !== 'published') return null;
  return { id: row.id, title: row.title };
}

export function setResourceBookmark(db: Database.Database, userId: number, resourceId: number): void {
  run(
    db,
    `INSERT INTO user_resource_bookmarks (user_id, resource_id, created_at) VALUES (@userId, @resourceId, @now)
     ON CONFLICT (user_id, resource_id) DO NOTHING`,
    { userId, resourceId, now: nowIso() }
  );
}

export function removeResourceBookmark(db: Database.Database, userId: number, resourceId: number): void {
  run(db, 'DELETE FROM user_resource_bookmarks WHERE user_id = @userId AND resource_id = @resourceId', {
    userId,
    resourceId
  });
}

// ---------------------------------------------------------------- curated collections

export type CuratedCollection = {
  slug: string;
  title: string;
  description: string;
  kind: string;
  itemCount: number;
  updatedAt: string;
};

export function listCuratedCollections(db: Database.Database, canSeeDrafts: boolean): CuratedCollection[] {
  const itemFilter = canSeeDrafts ? '' : `AND r.status = 'published'`;
  return all<Record<string, unknown>>(
    db,
    `SELECT c.slug, c.title, c.description, c.kind, c.updated_at,
            (SELECT COUNT(*) FROM curated_collection_items ci JOIN resources r ON r.id = ci.resource_id
              WHERE ci.collection_id = c.id ${itemFilter}) AS item_count
     FROM curated_collections c
     ORDER BY c.order_index, c.title`
  ).map((c) => ({
    slug: String(c.slug),
    title: String(c.title),
    description: String(c.description ?? ''),
    kind: String(c.kind),
    itemCount: Number(c.item_count),
    updatedAt: String(c.updated_at)
  }));
}

export type CuratedCollectionItem = {
  position: number;
  note: string;
  slug: string;
  title: string;
  type: string;
  authors: string;
  publisher: string;
  publishedYear: number | null;
  url: string;
  difficulty: Difficulty;
};

export function getCuratedCollectionBySlug(
  db: Database.Database,
  slug: string,
  canSeeDrafts: boolean
): (CuratedCollection & { items: CuratedCollectionItem[] }) | null {
  const header = get<Record<string, unknown>>(
    db,
    `SELECT c.*,
            (SELECT COUNT(*) FROM curated_collection_items ci JOIN resources r ON r.id = ci.resource_id
              WHERE ci.collection_id = c.id ${canSeeDrafts ? '' : `AND r.status = 'published'`}) AS item_count
     FROM curated_collections c WHERE c.slug = ?`,
    { slug }
  );
  if (!header) return null;
  const items = all<Record<string, unknown>>(
    db,
    `SELECT ci.position, ci.note, r.slug, r.title, r.type, r.authors, r.publisher, r.published_year, r.url, r.difficulty
     FROM curated_collection_items ci JOIN resources r ON r.id = ci.resource_id
     WHERE ci.collection_id = @id ${canSeeDrafts ? '' : `AND r.status = 'published'`}
     ORDER BY ci.position, r.title`,
    { id: Number(header.id) }
  ).map<CuratedCollectionItem>((i) => ({
    position: Number(i.position),
    note: String(i.note ?? ''),
    slug: String(i.slug),
    title: String(i.title),
    type: String(i.type),
    authors: String(i.authors ?? ''),
    publisher: String(i.publisher ?? ''),
    publishedYear: i.published_year === null ? null : Number(i.published_year),
    url: String(i.url),
    difficulty: String(i.difficulty) as Difficulty
  }));
  return {
    slug: String(header.slug),
    title: String(header.title),
    description: String(header.description ?? ''),
    kind: String(header.kind),
    itemCount: Number(header.item_count),
    updatedAt: String(header.updated_at),
    items
  };
}

/** First collection of a kind, ordered by editorial order_index — used by /research/must-reads. */
export function getCuratedCollectionByKind(
  db: Database.Database,
  kind: string,
  canSeeDrafts: boolean
): (CuratedCollection & { items: CuratedCollectionItem[] }) | null {
  const row = get<{ slug: string }>(
    db,
    'SELECT slug FROM curated_collections WHERE kind = ? ORDER BY order_index, id LIMIT 1',
    { kind }
  );
  return row ? getCuratedCollectionBySlug(db, row.slug, canSeeDrafts) : null;
}

// ---------------------------------------------------------------- user collections

export type UserCollection = {
  id: number;
  title: string;
  description: string;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
  itemCount: number;
};

function mapUserCollection(row: Record<string, unknown>): UserCollection {
  return {
    id: Number(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    isPublic: Number(row.is_public) === 1,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    itemCount: Number(row.item_count ?? 0)
  };
}

const USER_COLLECTION_SELECT = `SELECT uc.id, uc.title, uc.description, uc.is_public, uc.created_at, uc.updated_at,
    (SELECT COUNT(*) FROM user_collection_items ui JOIN resources r ON r.id = ui.resource_id
      WHERE ui.collection_id = uc.id) AS item_count
  FROM user_collections uc`;

export function listUserCollections(db: Database.Database, userId: number): UserCollection[] {
  return all<Record<string, unknown>>(
    db,
    `${USER_COLLECTION_SELECT} WHERE uc.user_id = @userId ORDER BY uc.updated_at DESC, uc.id DESC`,
    { userId }
  ).map(mapUserCollection);
}

/** Ownership is part of the lookup: a foreign id reads exactly like a missing id (404, never 403). */
export function findUserCollection(db: Database.Database, id: number, userId: number): UserCollection | null {
  const row = get<Record<string, unknown>>(db, `${USER_COLLECTION_SELECT} WHERE uc.id = @id AND uc.user_id = @userId`, {
    id,
    userId
  });
  return row ? mapUserCollection(row) : null;
}

export function createUserCollection(
  db: Database.Database,
  userId: number,
  input: { title: string; description: string; isPublic: boolean }
): UserCollection {
  const timestamp = nowIso();
  const id = Number(
    run(
      db,
      `INSERT INTO user_collections (user_id, title, description, is_public, created_at, updated_at)
       VALUES (@userId, @title, @description, @isPublic, @timestamp, @timestamp)`,
      { userId, title: input.title, description: input.description, isPublic: input.isPublic ? 1 : 0, timestamp }
    ).lastInsertRowid
  );
  const created = findUserCollection(db, id, userId);
  if (!created) throw new Error('Failed to create user collection');
  return created;
}

export function updateUserCollection(
  db: Database.Database,
  id: number,
  userId: number,
  patch: { title?: string; description?: string; isPublic?: boolean }
): UserCollection | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, userId, timestamp: nowIso() };
  if (patch.title !== undefined) {
    sets.push('title = @title');
    params.title = patch.title;
  }
  if (patch.description !== undefined) {
    sets.push('description = @description');
    params.description = patch.description;
  }
  if (patch.isPublic !== undefined) {
    sets.push('is_public = @isPublic');
    params.isPublic = patch.isPublic ? 1 : 0;
  }
  if (sets.length === 0) return findUserCollection(db, id, userId);
  sets.push('updated_at = @timestamp');
  run(db, `UPDATE user_collections SET ${sets.join(', ')} WHERE id = @id AND user_id = @userId`, params);
  return findUserCollection(db, id, userId);
}

export function deleteUserCollection(db: Database.Database, id: number, userId: number): boolean {
  return run(db, 'DELETE FROM user_collections WHERE id = @id AND user_id = @userId', { id, userId }).changes > 0;
}

export type UserCollectionItem = {
  position: number;
  note: string;
  slug: string;
  title: string;
  type: string;
  url: string;
  authors: string;
  difficulty: Difficulty;
};

export function listUserCollectionItems(db: Database.Database, collectionId: number): UserCollectionItem[] {
  return all<Record<string, unknown>>(
    db,
    `SELECT ui.position, ui.note, r.slug, r.title, r.type, r.url, r.authors, r.difficulty
     FROM user_collection_items ui JOIN resources r ON r.id = ui.resource_id
     WHERE ui.collection_id = @id ORDER BY ui.position, r.title`,
    { id: collectionId }
  ).map((i) => ({
    position: Number(i.position),
    note: String(i.note ?? ''),
    slug: String(i.slug),
    title: String(i.title),
    type: String(i.type),
    url: String(i.url),
    authors: String(i.authors ?? ''),
    difficulty: String(i.difficulty) as Difficulty
  }));
}

/** Idempotent: re-adding the same resource just refreshes the note/position. */
export function upsertUserCollectionItem(
  db: Database.Database,
  collectionId: number,
  resourceId: number,
  note: string
): void {
  const nextPosition =
    Number(
      get<{ m: number }>(
        db,
        'SELECT COALESCE(MAX(position), -1) AS m FROM user_collection_items WHERE collection_id = @id',
        { id: collectionId }
      )?.m ?? -1
    ) + 1;
  run(
    db,
    `INSERT INTO user_collection_items (collection_id, resource_id, position, note)
     VALUES (@collectionId, @resourceId, @position, @note)
     ON CONFLICT (collection_id, resource_id) DO UPDATE SET note = excluded.note`,
    { collectionId, resourceId, position: nextPosition, note }
  );
}

export function removeUserCollectionItem(db: Database.Database, collectionId: number, resourceSlug: string): boolean {
  return (
    run(
      db,
      `DELETE FROM user_collection_items
       WHERE collection_id = @id
         AND resource_id IN (SELECT id FROM resources WHERE slug = @slug)`,
      { id: collectionId, slug: resourceSlug }
    ).changes > 0
  );
}
