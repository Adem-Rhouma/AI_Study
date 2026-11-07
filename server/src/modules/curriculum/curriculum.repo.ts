import type Database from 'better-sqlite3';
import { all, get, likeContains } from '../../db/sql.js';
import { parseJsonArray, type Difficulty } from '../../lib/domain.js';
import { z } from 'zod';

const stringItem = z.string();

export type DomainSummary = {
  id: number;
  slug: string;
  name: string;
  summary: string;
  orderIndex: number;
  subdomainCount: number;
  topicCount: number;
};

export type TopicLight = {
  id: number;
  slug: string;
  name: string;
  difficulty: Difficulty;
  definition: string;
  subdomainId: number;
  subdomainName: string;
  estMinutes: number;
  lessonCount: number;
  exerciseCount: number;
};

export type TopicRelation = {
  slug: string;
  name: string;
  difficulty: Difficulty;
  kind: 'strict' | 'recommended' | 'related' | 'extension';
  note: string | null;
  direction: 'requires' | 'unlocks' | 'lateral';
};

export type FurtherReading = {
  title: string;
  authors: string | null;
  year: number | null;
  type: string;
  url: string | null;
  note: string | null;
};

export type TopicDetail = {
  id: number;
  slug: string;
  name: string;
  difficulty: Difficulty;
  status: string;
  definition: string;
  explanation: string;
  learningObjectives: string[];
  keyResults: string[];
  mathFoundations: string[];
  applications: string[];
  misconceptions: string[];
  openProblems: string | null;
  historyNote: string | null;
  estMinutes: number;
  tags: string[];
  breadcrumb: { slug: string; name: string; type: 'domain' | 'subdomain' }[];
  relations: TopicRelation[];
  furtherReading: FurtherReading[];
  lessons: { slug: string; title: string; courseSlug: string; courseTitle: string; estMinutes: number }[];
  exercises: { slug: string; title: string; difficulty: Difficulty; kind: string }[];
  resources: { slug: string; title: string; type: string; url: string; authors: string; year: number | null }[];
  relatedPaths: { slug: string; name: string }[];
};

export type GraphNode = {
  id: number;
  slug: string;
  name: string;
  difficulty: Difficulty;
  subdomainSlug: string;
  subdomainName: string;
  domainSlug: string;
  estMinutes: number;
};

export type GraphEdge = { source: number; target: number; kind: TopicRelation['kind'] };

export function listDomains(db: Database.Database, includeDrafts = false): DomainSummary[] {
  const statusFilter = includeDrafts ? '' : "AND t.status = 'published'";
  return all<Record<string, unknown>>(
    db,
    `SELECT d.id, d.slug, d.name, d.summary, d.order_index,
            (SELECT COUNT(*) FROM subdomains s WHERE s.domain_id = d.id) AS subdomain_count,
            (SELECT COUNT(*) FROM topics t WHERE t.subdomain_id IN (SELECT id FROM subdomains WHERE domain_id = d.id) ${statusFilter}) AS topic_count
     FROM domains d
     ORDER BY d.order_index, d.name`
  ).map((r) => ({
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    summary: String(r.summary ?? ''),
    orderIndex: Number(r.order_index),
    subdomainCount: Number(r.subdomain_count),
    topicCount: Number(r.topic_count)
  }));
}

export function getDomainTree(db: Database.Database, domainSlug: string, includeDrafts = false): {
  domain: { slug: string; name: string; summary: string };
  subdomains: { slug: string; name: string; summary: string; topics: TopicLight[] }[];
} | null {
  const domain = get<{ id: number; slug: string; name: string; summary: string }>(
    db,
    'SELECT id, slug, name, summary FROM domains WHERE slug = ?',
    { slug: domainSlug }
  );
  if (!domain) return null;
  const subdomains = all<{ id: number; slug: string; name: string; summary: string }>(
    db,
    'SELECT id, slug, name, summary FROM subdomains WHERE domain_id = ? ORDER BY order_index, name',
    { domain_id: domain.id }
  );
  const statusFilter = includeDrafts ? '' : "WHERE status = 'published'";
  const topicRows = all<Record<string, unknown>>(
    db,
    `SELECT id, subdomain_id, slug, name, difficulty, definition, est_minutes,
            (SELECT COUNT(*) FROM lesson_topics lt JOIN lessons l ON l.id = lt.lesson_id WHERE lt.topic_id = topics.id AND l.status = 'published') AS lesson_count,
            (SELECT COUNT(*) FROM exercise_topics et JOIN exercises e ON e.id = et.exercise_id WHERE et.topic_id = topics.id AND e.status = 'published') AS exercise_count
     FROM topics ${statusFilter} ORDER BY difficulty, name`
  );
  const bySubdomain = new Map<number, TopicLight[]>();
  for (const row of topicRows) {
    const subId = Number(row.subdomain_id);
    const list = bySubdomain.get(subId) ?? [];
    list.push(mapTopicLight(row, subId, ''));
    bySubdomain.set(subId, list);
  }
  return {
    domain: { slug: domain.slug, name: domain.name, summary: domain.summary },
    subdomains: subdomains.map((s) => ({
      slug: s.slug,
      name: s.name,
      summary: s.summary,
      topics: (bySubdomain.get(s.id) ?? []).map((t) => ({ ...t, subdomainName: s.name }))
    }))
  };
}

function mapTopicLight(row: Record<string, unknown>, subdomainId: number, subdomainName: string): TopicLight {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    difficulty: String(row.difficulty) as Difficulty,
    definition: String(row.definition ?? ''),
    subdomainId,
    subdomainName,
    estMinutes: Number(row.est_minutes ?? 0),
    lessonCount: Number(row.lesson_count ?? 0),
    exerciseCount: Number(row.exercise_count ?? 0)
  };
}

export function listTopics(
  db: Database.Database,
  filters: {
    domain?: string;
    subdomain?: string;
    difficulty?: Difficulty | 'all';
    q?: string;
    status?: string;
    limit: number;
    offset: number;
  }
): { topics: TopicLight[]; total: number } {
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  where.push(filters.status === 'all' ? '1 = 1' : 't.status = @status');
  params.status = filters.status ?? 'published';
  if (filters.domain) {
    where.push('d.slug = @domain');
    params.domain = filters.domain;
  }
  if (filters.subdomain) {
    where.push('s.slug = @subdomain');
    params.subdomain = filters.subdomain;
  }
  if (filters.difficulty && filters.difficulty !== 'all') {
    where.push('t.difficulty = @difficulty');
    params.difficulty = filters.difficulty;
  }
  if (filters.q) {
    where.push('(t.name LIKE @q ESCAPE \'\\\' OR t.definition LIKE @q ESCAPE \'\\\')');
    params.q = likeContains(filters.q);
  }
  const from = `FROM topics t
     JOIN subdomains s ON s.id = t.subdomain_id
     JOIN domains d ON d.id = s.domain_id`;
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const totalRow = get<{ c: number }>(db, `SELECT COUNT(*) AS c ${from} ${clause}`, params);
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT t.id, t.subdomain_id, t.slug, t.name, t.difficulty, t.definition, t.est_minutes,
            s.name AS subdomain_name,
            (SELECT COUNT(*) FROM lesson_topics lt JOIN lessons l ON l.id = lt.lesson_id WHERE lt.topic_id = t.id AND l.status = 'published') AS lesson_count,
            (SELECT COUNT(*) FROM exercise_topics et JOIN exercises e ON e.id = et.exercise_id WHERE et.topic_id = t.id AND e.status = 'published') AS exercise_count
     ${from} ${clause}
     ORDER BY d.order_index, s.order_index, ${DIFFICULTY_ORDER_SQL}, t.name
     LIMIT @limit OFFSET @offset`,
    { ...params, limit: filters.limit, offset: filters.offset }
  );
  return {
    topics: rows.map((r) => ({ ...mapTopicLight(r, Number(r.subdomain_id), String(r.subdomain_name)) })),
    total: totalRow?.c ?? rows.length
  };
}

export function getTopicBySlug(db: Database.Database, slug: string, canSeeDrafts = false): TopicDetail | null {
  const row = get<Record<string, unknown>>(
    db,
    `SELECT t.*, s.slug AS subdomain_slug, s.name AS subdomain_name, s.summary AS subdomain_summary,
            d.slug AS domain_slug, d.name AS domain_name, d.id AS domain_id
     FROM topics t
     JOIN subdomains s ON s.id = t.subdomain_id
     JOIN domains d ON d.id = s.domain_id
     WHERE t.slug = ?`,
    { slug }
  );
  if (!row) return null;
  if (!canSeeDrafts && row.status !== 'published') return null;
  const topicId = Number(row.id);

  // Draft topics must not leak into a learner's prerequisite list any more than they leak as pages.
  const publishedOnly = canSeeDrafts ? '' : `AND o.status = 'published'`;
  const relationRows = all<Record<string, unknown>>(
    db,
    `SELECT 'requires' AS direction, r.kind, r.note, o.slug, o.name, o.difficulty
       FROM topic_relations r JOIN topics o ON o.id = r.requires_id WHERE r.topic_id = @id ${publishedOnly}
     UNION ALL
     SELECT 'unlocks' AS direction, r.kind, r.note, o.slug, o.name, o.difficulty
       FROM topic_relations r JOIN topics o ON o.id = r.topic_id WHERE r.requires_id = @id ${publishedOnly}
     ORDER BY direction, kind, name`,
    { id: topicId }
  );
  const lateral = all<Record<string, unknown>>(
    db,
    `SELECT 'lateral' AS direction, 'related' AS kind, NULL AS note, o.slug, o.name, o.difficulty
     FROM topics o
     WHERE o.id <> @id
       AND o.subdomain_id = (SELECT subdomain_id FROM topics WHERE id = @id)
       ${publishedOnly}
       AND EXISTS (SELECT 1 FROM topic_tags mine
                   JOIN topic_tags theirs ON theirs.tag_id = mine.tag_id
                   WHERE mine.topic_id = @id AND theirs.topic_id = o.id)
     LIMIT 8`,
    { id: topicId }
  );
  const relations: TopicRelation[] = [...relationRows, ...lateral].map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
    difficulty: String(r.difficulty) as Difficulty,
    kind: String(r.kind) as TopicRelation['kind'],
    note: r.note === null || r.note === undefined ? null : String(r.note),
    direction: String(r.direction) as TopicRelation['direction']
  }));

  const reading = all<Record<string, unknown>>(
    db,
    'SELECT title, authors, year, type, url, note FROM topic_further_reading WHERE topic_id = ? ORDER BY position, id',
    { topic_id: topicId }
  ).map<FurtherReading>((r) => ({
    title: String(r.title),
    authors: r.authors === null ? null : String(r.authors),
    year: r.year === null ? null : Number(r.year),
    type: String(r.type),
    url: r.url === null ? null : String(r.url),
    note: r.note === null ? null : String(r.note)
  }));

  const lessons = all<Record<string, unknown>>(
    db,
    `SELECT l.slug, l.title, l.est_minutes, c.slug AS course_slug, c.title AS course_title
     FROM lessons l
     JOIN lesson_topics lt ON lt.lesson_id = l.id
     JOIN courses c ON c.id = l.course_id
     WHERE lt.topic_id = @id AND l.status = 'published' AND c.status = 'published'
     ORDER BY c.order_index, l.order_index`,
    { id: topicId }
  ).map((r) => ({
    slug: String(r.slug),
    title: String(r.title),
    courseSlug: String(r.course_slug),
    courseTitle: String(r.course_title),
    estMinutes: Number(r.est_minutes)
  }));

  const exercises = all<Record<string, unknown>>(
    db,
    `SELECT e.slug, e.title, e.difficulty, e.kind FROM exercises e
     JOIN exercise_topics et ON et.exercise_id = e.id
     WHERE et.topic_id = @id AND e.status = 'published'
     ORDER BY e.difficulty, e.points LIMIT 20`,
    { id: topicId }
  ).map((r) => ({
    slug: String(r.slug),
    title: String(r.title),
    difficulty: String(r.difficulty) as Difficulty,
    kind: String(r.kind)
  }));

  const resources = all<Record<string, unknown>>(
    db,
    `SELECT rs.slug, rs.title, rs.type, rs.url, rs.authors, rs.published_year
     FROM resources rs JOIN resource_topics rt ON rt.resource_id = rs.id
     WHERE rt.topic_id = @id AND rs.status = 'published'
     ORDER BY rs.published_year DESC, rs.title LIMIT 20`,
    { id: topicId }
  ).map((r) => ({
    slug: String(r.slug),
    title: String(r.title),
    type: String(r.type),
    url: String(r.url),
    authors: String(r.authors ?? ''),
    year: r.published_year === null ? null : Number(r.published_year)
  }));

  const relatedPaths = all<{ slug: string; name: string }>(
    db,
    `SELECT DISTINCT p.slug, p.name FROM learning_paths p
     JOIN learning_path_topics pt ON pt.path_id = p.id
     WHERE pt.topic_id = @id AND p.status = 'published'
     ORDER BY p.order_index LIMIT 8`,
    { id: topicId }
  );

  const tags = all<{ name: string }>(
    db,
    `SELECT g.name FROM tags g JOIN topic_tags tt ON tt.tag_id = g.id WHERE tt.topic_id = ? ORDER BY g.name`,
    { topic_id: topicId }
  );

  return {
    id: topicId,
    slug: String(row.slug),
    name: String(row.name),
    difficulty: String(row.difficulty) as Difficulty,
    status: String(row.status),
    definition: String(row.definition ?? ''),
    explanation: String(row.explanation ?? ''),
    learningObjectives: parseJsonArray(row.learning_objectives, stringItem),
    keyResults: parseJsonArray(row.key_results, stringItem),
    mathFoundations: parseJsonArray(row.math_foundations, stringItem),
    applications: parseJsonArray(row.applications, stringItem),
    misconceptions: parseJsonArray(row.misconceptions, stringItem),
    openProblems: row.open_problems === null ? null : String(row.open_problems),
    historyNote: row.history_note === null ? null : String(row.history_note),
    estMinutes: Number(row.est_minutes ?? 0),
    tags: tags.map((t) => t.name),
    breadcrumb: [
      { slug: String(row.domain_slug), name: String(row.domain_name), type: 'domain' },
      { slug: String(row.subdomain_slug), name: String(row.subdomain_name), type: 'subdomain' }
    ],
    relations,
    furtherReading: reading,
    lessons,
    exercises,
    resources,
    relatedPaths
  };
}

export const DIFFICULTY_ORDER_SQL = `CASE difficulty
  WHEN 'introductory' THEN 0 WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2
  WHEN 'advanced' THEN 3 ELSE 4 END`;

function orderTopicsByScope(): string {
  return `ORDER BY d.order_index, s.order_index, ${DIFFICULTY_ORDER_SQL}, t.name`;
}

function scopedNodes(
  db: Database.Database,
  where: string[],
  params: Record<string, unknown>,
  limit: number
): GraphNode[] {
  return all<Record<string, unknown>>(
    db,
    `SELECT t.id, t.slug, t.name, t.difficulty, t.est_minutes, s.slug AS subdomain_slug, s.name AS subdomain_name, d.slug AS domain_slug
     FROM topics t JOIN subdomains s ON s.id = t.subdomain_id JOIN domains d ON d.id = s.domain_id
     WHERE ${where.join(' AND ')}
     ${orderTopicsByScope()}
     LIMIT @limit`,
    { ...params, limit }
  ).map((n) => ({
    id: Number(n.id),
    slug: String(n.slug),
    name: String(n.name),
    difficulty: String(n.difficulty) as Difficulty,
    subdomainSlug: String(n.subdomain_slug),
    subdomainName: String(n.subdomain_name),
    domainSlug: String(n.domain_slug),
    estMinutes: Number(n.est_minutes)
  }));
}

/** Graph restricted to a domain or subdomain scope; edges only between included topics. */
export function buildGraph(
  db: Database.Database,
  scope: { domain?: string; subdomain?: string },
  limit = 220
): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const where = ["t.status = 'published'"];
  const params: Record<string, unknown> = {};
  if (scope.subdomain) {
    where.push('s.slug = @subdomain');
    params.subdomain = scope.subdomain;
  } else if (scope.domain) {
    where.push('d.slug = @domain');
    params.domain = scope.domain;
  }
  const nodes = scopedNodes(db, where, params, limit);
  if (nodes.length === 0) return { nodes, edges: [] };
  return { nodes, edges: edgesAmong(db, new Set(nodes.map((n) => n.id))) };
}

/**
 * k-hop neighbourhood around one topic. This is the primitive the topic page uses: whole-curriculum
 * graphs are unreadable, a 1-2 hop view is not.
 */
export function buildNeighborhood(
  db: Database.Database,
  topicSlug: string,
  depth = 1
): { center: string | null; nodes: GraphNode[]; edges: GraphEdge[] } {
  const maxDepth = Math.min(Math.max(depth, 1), 3);
  const seed = get<{ id: number; slug: string }>(db, 'SELECT id, slug FROM topics WHERE slug = ?', { slug: topicSlug });
  if (!seed) return { center: null, nodes: [], edges: [] };
  const nodeRows = all<Record<string, unknown>>(
    db,
    `WITH RECURSIVE reach(id, depth) AS (
        SELECT @seedId, 0
        UNION ALL
        SELECT CASE WHEN r.topic_id = reach.id THEN r.requires_id ELSE r.topic_id END, reach.depth + 1
          FROM topic_relations r JOIN reach ON (r.topic_id = reach.id OR r.requires_id = reach.id)
         WHERE reach.depth < @maxDepth
      )
     SELECT DISTINCT t.id, t.slug, t.name, t.difficulty, t.est_minutes, s.slug AS subdomain_slug, s.name AS subdomain_name, d.slug AS domain_slug,
            reach.depth AS hop
     FROM reach JOIN topics t ON t.id = reach.id
     JOIN subdomains s ON s.id = t.subdomain_id JOIN domains d ON d.id = s.domain_id
     WHERE t.status = 'published'
     ORDER BY hop, ${DIFFICULTY_ORDER_SQL}, t.name
     LIMIT 120`,
    { seedId: seed.id, maxDepth }
  );
  const nodes = nodeRows.map((n) => ({
    id: Number(n.id),
    slug: String(n.slug),
    name: String(n.name),
    difficulty: String(n.difficulty) as Difficulty,
    subdomainSlug: String(n.subdomain_slug),
    subdomainName: String(n.subdomain_name),
    domainSlug: String(n.domain_slug),
    estMinutes: Number(n.est_minutes)
  }));
  const ids = new Set(nodes.map((n) => n.id));
  return { center: seed.slug, nodes, edges: edgesAmong(db, ids) };
}

/** Edges whose endpoints are both in `ids`. Placeholders are generated from integer ids only. */
function edgesAmong(db: Database.Database, ids: Set<number>): GraphEdge[] {
  if (ids.size === 0) return [];
  const list = [...ids].map((id) => String(id)).join(',');
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT DISTINCT r.requires_id AS source, r.topic_id AS target, r.kind
     FROM topic_relations r
     JOIN topics a ON a.id = r.topic_id
     JOIN topics b ON b.id = r.requires_id
     WHERE a.status = 'published' AND b.status = 'published'
       AND (r.topic_id IN (${list}) OR r.requires_id IN (${list}))`
  );
  return rows
    .filter((e) => ids.has(Number(e.source)) && ids.has(Number(e.target)))
    .map((e) => ({ source: Number(e.source), target: Number(e.target), kind: String(e.kind) as GraphEdge['kind'] }));
}

