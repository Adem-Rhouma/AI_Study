import type Database from 'better-sqlite3';
import { all, get, likeContains } from '../../db/sql.js';
import { getCuratedCollectionByKind } from '../library/resources.repo.js';
import type { Difficulty } from '../../lib/domain.js';

export type ResearchArea = {
  slug: string;
  name: string;
  summary: string;
  domainSlug: string;
  domainName: string;
  topicCount: number;
  resourceCount: number;
};

/**
 * Research areas are derived from the real taxonomy (domains/subdomains) with corpus counts,
 * so the section is populated from content rather than a hand-maintained editorial feed.
 * One aggregated query; the counts ride as correlated subqueries.
 */
export function listResearchAreas(db: Database.Database): ResearchArea[] {
  return all<Record<string, unknown>>(
    db,
    `SELECT s.slug, s.name, s.summary, d.slug AS domain_slug, d.name AS domain_name,
            (SELECT COUNT(*) FROM topics t WHERE t.subdomain_id = s.id AND t.status = 'published') AS topic_count,
            (SELECT COUNT(DISTINCT r.id) FROM resources r
              WHERE r.status = 'published'
                AND EXISTS (SELECT 1 FROM resource_topics rt JOIN topics t2 ON t2.id = rt.topic_id
                             WHERE rt.resource_id = r.id AND t2.subdomain_id = s.id)) AS resource_count
     FROM subdomains s JOIN domains d ON d.id = s.domain_id
     ORDER BY d.order_index, s.order_index, s.name`
  ).map((r) => ({
    slug: String(r.slug),
    name: String(r.name),
    summary: String(r.summary ?? ''),
    domainSlug: String(r.domain_slug),
    domainName: String(r.domain_name),
    topicCount: Number(r.topic_count),
    resourceCount: Number(r.resource_count)
  }));
}

export type PaperRow = {
  slug: string;
  title: string;
  description: string;
  type: string;
  authors: string;
  publisher: string;
  year: number | null;
  url: string;
  difficulty: Difficulty;
  sourceName: string;
  verified: boolean;
};

/**
 * Papers and surveys from the corpus with attribution kept verbatim (authors, publisher, year,
 * url exactly as stored). Default order: published_year desc (nulls last) then title.
 */
export function listPapers(
  db: Database.Database,
  filters: { topic?: string; year?: number; q?: string; sort: 'newest' | 'oldest' | 'title'; limit: number; offset: number }
): { items: PaperRow[]; total: number } {
  const where = [`r.status = 'published'`, `r.type IN ('paper', 'survey')`];
  const params: Record<string, unknown> = { limit: filters.limit, offset: filters.offset };
  if (filters.topic) {
    where.push(
      `EXISTS (SELECT 1 FROM resource_topics rt JOIN topics t ON t.id = rt.topic_id
        WHERE rt.resource_id = r.id AND t.slug = @topic)`
    );
    params.topic = filters.topic;
  }
  if (filters.year) {
    where.push('r.published_year = @year');
    params.year = filters.year;
  }
  if (filters.q) {
    where.push(`(r.title LIKE @q ESCAPE '\\' OR r.authors LIKE @q ESCAPE '\\' OR r.description LIKE @q ESCAPE '\\')`);
    params.q = likeContains(filters.q);
  }
  const clause = `WHERE ${where.join(' AND ')}`;
  const total = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM resources r ${clause}`, params)?.c ?? 0;
  const order =
    filters.sort === 'title'
      ? 'r.title COLLATE NOCASE ASC'
      : filters.sort === 'oldest'
        ? '(r.published_year IS NULL), r.published_year ASC, r.title COLLATE NOCASE ASC'
        : '(r.published_year IS NULL), r.published_year DESC, r.title COLLATE NOCASE ASC';
  const items = all<Record<string, unknown>>(
    db,
    `SELECT r.slug, r.title, r.description, r.type, r.authors, r.publisher, r.published_year, r.url,
            r.difficulty, r.source_name, r.verified
     FROM resources r ${clause} ORDER BY ${order} LIMIT @limit OFFSET @offset`,
    params
  ).map<PaperRow>((r) => ({
    slug: String(r.slug),
    title: String(r.title),
    description: String(r.description ?? ''),
    type: String(r.type),
    authors: String(r.authors ?? ''),
    publisher: String(r.publisher ?? ''),
    year: r.published_year === null ? null : Number(r.published_year),
    url: String(r.url),
    difficulty: String(r.difficulty) as Difficulty,
    sourceName: String(r.source_name ?? ''),
    verified: Number(r.verified) === 1
  }));
  return { items, total };
}

export type MilestoneRow = {
  id: number;
  occurredOn: string;
  title: string;
  summary: string;
  kind: string;
  url: string | null;
  sourceName: string;
  topicSlug: string | null;
  topicName: string | null;
  /** Hard product rule: this list is manually curated — say so in the payload so the UI can too. */
  isCurated: true;
  curatedAt: string;
};

export function listMilestones(
  db: Database.Database,
  filters: { year?: number; kind?: string; limit: number }
): MilestoneRow[] {
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: filters.limit };
  if (filters.year) {
    where.push('substr(m.occurred_on, 1, 4) = @year');
    params.year = String(filters.year);
  }
  if (filters.kind) {
    where.push('m.kind = @kind');
    params.kind = filters.kind;
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return all<Record<string, unknown>>(
    db,
    `SELECT m.id, m.occurred_on, m.title, m.summary, m.kind, m.url, m.source_name, m.created_at,
            t.slug AS topic_slug, t.name AS topic_name
     FROM milestones m LEFT JOIN topics t ON t.id = m.topic_id
     ${clause}
     ORDER BY m.occurred_on DESC, m.id DESC
     LIMIT @limit`,
    params
  ).map((r) => ({
    id: Number(r.id),
    occurredOn: String(r.occurred_on),
    title: String(r.title),
    summary: String(r.summary ?? ''),
    kind: String(r.kind),
    url: r.url === null ? null : String(r.url),
    sourceName: String(r.source_name ?? ''),
    topicSlug: r.topic_slug === null ? null : String(r.topic_slug),
    topicName: r.topic_name === null ? null : String(r.topic_name),
    isCurated: true as const,
    curatedAt: String(r.created_at)
  }));
}

/** Top 'must-read' and 'frontier' curated collections with their ordered items. */
export function getMustReads(db: Database.Database, canSeeDrafts: boolean) {
  return {
    mustRead: getCuratedCollectionByKind(db, 'must-read', canSeeDrafts),
    frontier: getCuratedCollectionByKind(db, 'frontier', canSeeDrafts)
  };
}
