import type Database from 'better-sqlite3';
import { all, likeContains } from '../../db/sql.js';
import type { Difficulty } from '../../lib/domain.js';

export type SearchEntityType = 'topics' | 'lessons' | 'resources' | 'exercises' | 'paths' | 'courses' | 'collections';
export type SearchScope = 'all' | SearchEntityType;

export type SearchHit = {
  type: SearchEntityType;
  slug: string;
  title: string;
  snippet: string;
  /** Breadcrumb-ish context: "domain / subdomain" for topics, course title for lessons, type · year for resources. */
  context: string | null;
  difficulty: Difficulty | null;
  /** bm25() cost: lower is better; LIKE hits get 0/1 title-vs-body ranks. */
  score: number;
};

export const SEARCH_SCOPES: SearchScope[] = [
  'all',
  'topics',
  'lessons',
  'resources',
  'exercises',
  'paths',
  'courses',
  'collections'
];

const SCOPED_TYPES: Record<SearchScope, SearchEntityType[]> = {
  all: ['topics', 'lessons', 'resources', 'exercises', 'paths', 'courses', 'collections'],
  topics: ['topics'],
  lessons: ['lessons'],
  resources: ['resources'],
  exercises: ['exercises'],
  paths: ['paths'],
  courses: ['courses'],
  collections: ['collections']
};

/**
 * FTS5 injection safety: we never let raw user text reach the MATCH parser. The term is split
 * into unicode word tokens (dropping AND/OR/NOT, quotes, stars, dashes, parens, colons and any
 * other operator), each token becomes a quoted phrase, and they are AND-ed implicitly.
 * A quoted phrase is always valid syntax (or a plain no-match), so SyntaxError is impossible.
 * Returns null when nothing survives sanitising — the caller then uses the LIKE fallback.
 */
export function sanitizeFtsMatch(term: string): string | null {
  const tokens = term.toLowerCase().match(/[\p{L}\p{N}][\p{L}\p{N}_]*/gu);
  if (!tokens || tokens.length === 0) return null;
  const unique = [...new Set(tokens)].slice(0, 8);
  return unique.map((t) => `"${t.replace(/"/g, '')}"`).join(' ');
}

type SearchOptions = {
  db: Database.Database;
  term: string;
  scope: SearchScope;
  limit: number;
  offset: number;
  canSeeDrafts: boolean;
};

function draftGuard(canSeeDrafts: boolean, alias: string): string {
  return canSeeDrafts ? '' : ` AND ${alias}.status = 'published'`;
}

function ftsHits(db: Database.Database, match: string, types: SearchEntityType[], canSeeDrafts: boolean): SearchHit[] {
  const hits: SearchHit[] = [];
  const per = 40;
  if (types.includes('topics')) {
    hits.push(
      ...all<Record<string, unknown>>(
        db,
        `SELECT t.slug, t.name AS title,
                snippet(topics_fts, 1, '', '', ' ... ', 12) AS snippet,
                d.name || ' / ' || s.name AS context, t.difficulty,
                bm25(topics_fts, 10.0, 3.0, 1.0, 0.5) AS score
         FROM topics_fts JOIN topics t ON t.id = topics_fts.rowid
         JOIN subdomains s ON s.id = t.subdomain_id JOIN domains d ON d.id = s.domain_id
         WHERE topics_fts MATCH @match${draftGuard(canSeeDrafts, 't')}
         ORDER BY score LIMIT ${per}`,
        { match }
      ).map((r) => shape('topics', r, r.title))
    );
  }
  if (types.includes('lessons')) {
    const lessonDraft = canSeeDrafts
      ? ''
      : ` AND l.status = 'published' AND c.status = 'published'`;
    // Titles/summaries from lessons_fts; bodies come from blocks_fts joined back to lessons —
    // lesson snippets never read a denormalised copy.
    const fromTitles = all<Record<string, unknown>>(
      db,
      `SELECT l.slug, l.title, snippet(lessons_fts, 1, '', '', ' ... ', 12) AS snippet,
              c.title AS context, c.difficulty, bm25(lessons_fts, 10.0, 4.0) AS score
       FROM lessons_fts JOIN lessons l ON l.id = lessons_fts.rowid JOIN courses c ON c.id = l.course_id
       WHERE lessons_fts MATCH @match${lessonDraft}
       ORDER BY score LIMIT ${per}`,
      { match }
    );
    const fromBlocks = all<Record<string, unknown>>(
      db,
      `SELECT l.slug, l.title, snippet(blocks_fts, 0, '', '', ' ... ', 16) AS snippet,
              c.title AS context, c.difficulty, bm25(blocks_fts) - 5 AS score
       FROM blocks_fts JOIN lesson_blocks b ON b.id = blocks_fts.rowid
       JOIN lessons l ON l.id = b.lesson_id JOIN courses c ON c.id = l.course_id
       WHERE blocks_fts MATCH @match${lessonDraft}
       ORDER BY score LIMIT ${per}`,
      { match }
    );
    const best = new Map<string, SearchHit>();
    for (const r of [...fromTitles, ...fromBlocks]) {
      const hit = shape('lessons', r, r.title);
      const existing = best.get(hit.slug);
      if (!existing || hit.score < existing.score) best.set(hit.slug, hit);
    }
    hits.push(...best.values());
  }
  if (types.includes('resources')) {
    hits.push(
      ...all<Record<string, unknown>>(
        db,
        `SELECT r.slug, r.title, snippet(resources_fts, 1, '', '', ' ... ', 14) AS snippet,
                r.type || CASE WHEN r.published_year IS NULL THEN '' ELSE ' · ' || r.published_year END AS context,
                r.difficulty, bm25(resources_fts, 10.0, 4.0, 2.0, 1.0) AS score
         FROM resources_fts JOIN resources r ON r.id = resources_fts.rowid
         WHERE resources_fts MATCH @match${draftGuard(canSeeDrafts, 'r')}
         ORDER BY score LIMIT ${per}`,
        { match }
      ).map((r) => shape('resources', r, r.title))
    );
  }
  if (types.includes('exercises')) {
    hits.push(
      ...all<Record<string, unknown>>(
        db,
        `SELECT e.slug, e.title, snippet(exercises_fts, 1, '', '', ' ... ', 14) AS snippet,
                (SELECT t.name FROM exercise_topics et JOIN topics t ON t.id = et.topic_id
                  WHERE et.exercise_id = e.id LIMIT 1) AS context,
                e.difficulty, bm25(exercises_fts, 10.0, 5.0, 2.0) AS score
         FROM exercises_fts JOIN exercises e ON e.id = exercises_fts.rowid
         WHERE exercises_fts MATCH @match${draftGuard(canSeeDrafts, 'e')}
         ORDER BY score LIMIT ${per}`,
        { match }
      ).map((r) => shape('exercises', r, r.title))
    );
  }
  // paths / courses / collections have no FTS index (short label-ish rows); LIKE covers them in
  // both modes — they are appended by the fallback path and excluded from the "empty FTS" verdict.
  return hits;
}

function likeHits(db: Database.Database, term: string, types: SearchEntityType[], canSeeDrafts: boolean): SearchHit[] {
  const like = likeContains(term);
  const hits: SearchHit[] = [];
  const per = 40;
  const rank = (titleCol: string) => `(CASE WHEN ${titleCol} LIKE @like ESCAPE '\\' THEN 0 ELSE 1 END)`;
  if (types.includes('topics')) {
    hits.push(
      ...all<Record<string, unknown>>(
        db,
        `SELECT t.slug, t.name AS title, substr(t.definition, 1, 140) AS snippet,
                d.name || ' / ' || s.name AS context, t.difficulty,
                ${rank('t.name')} AS score
         FROM topics t JOIN subdomains s ON s.id = t.subdomain_id JOIN domains d ON d.id = s.domain_id
         WHERE (t.name LIKE @like ESCAPE '\\' OR t.definition LIKE @like ESCAPE '\\')${draftGuard(canSeeDrafts, 't')}
         ORDER BY score, t.name LIMIT ${per}`,
        { like }
      ).map((r) => shape('topics', r, r.title))
    );
  }
  if (types.includes('lessons')) {
    const lessonDraft = canSeeDrafts ? '' : ` AND l.status = 'published' AND c.status = 'published'`;
    const fromMeta = all<Record<string, unknown>>(
      db,
      `SELECT l.slug, l.title, substr(l.summary, 1, 140) AS snippet, c.title AS context, c.difficulty, 0 AS score
       FROM lessons l JOIN courses c ON c.id = l.course_id
       WHERE (l.title LIKE @like ESCAPE '\\' OR l.summary LIKE @like ESCAPE '\\')${lessonDraft}
       ORDER BY l.title LIMIT ${per}`,
      { like }
    );
    const fromBlocks = all<Record<string, unknown>>(
      db,
      `SELECT l.slug, l.title, substr(b.text, 1, 160) AS snippet, c.title AS context, c.difficulty, 1 AS score
       FROM lesson_blocks b JOIN lessons l ON l.id = b.lesson_id JOIN courses c ON c.id = l.course_id
       WHERE b.text LIKE @like ESCAPE '\\'${lessonDraft}
       ORDER BY l.title LIMIT ${per}`,
      { like }
    );
    const best = new Map<string, SearchHit>();
    for (const r of [...fromMeta, ...fromBlocks]) {
      const hit = shape('lessons', r, r.title);
      const existing = best.get(hit.slug);
      if (!existing || hit.score < existing.score) best.set(hit.slug, hit);
    }
    hits.push(...best.values());
  }
  if (types.includes('resources')) {
    hits.push(
      ...all<Record<string, unknown>>(
        db,
        `SELECT r.slug, r.title, substr(r.description, 1, 140) AS snippet,
                r.type || CASE WHEN r.published_year IS NULL THEN '' ELSE ' · ' || r.published_year END AS context,
                r.difficulty, ${rank('r.title')} AS score
         FROM resources r
         WHERE (r.title LIKE @like ESCAPE '\\' OR r.description LIKE @like ESCAPE '\\'
                OR r.authors LIKE @like ESCAPE '\\')${draftGuard(canSeeDrafts, 'r')}
         ORDER BY score, r.title LIMIT ${per}`,
        { like }
      ).map((r) => shape('resources', r, r.title))
    );
  }
  if (types.includes('exercises')) {
    hits.push(
      ...all<Record<string, unknown>>(
        db,
        `SELECT e.slug, e.title, substr(e.prompt, 1, 140) AS snippet,
                (SELECT t.name FROM exercise_topics et JOIN topics t ON t.id = et.topic_id
                  WHERE et.exercise_id = e.id LIMIT 1) AS context,
                e.difficulty, ${rank('e.title')} AS score
         FROM exercises e
         WHERE (e.title LIKE @like ESCAPE '\\' OR e.prompt LIKE @like ESCAPE '\\')${draftGuard(canSeeDrafts, 'e')}
         ORDER BY score, e.title LIMIT ${per}`,
        { like }
      ).map((r) => shape('exercises', r, r.title))
    );
  }
  if (types.includes('paths')) {
    hits.push(
      ...all<Record<string, unknown>>(
        db,
        `SELECT p.slug, p.name AS title, substr(p.summary, 1, 140) AS snippet, p.audience AS context,
                p.difficulty, ${rank('p.name')} AS score
         FROM learning_paths p
         WHERE (p.name LIKE @like ESCAPE '\\' OR p.summary LIKE @like ESCAPE '\\')
           ${canSeeDrafts ? '' : `AND p.status = 'published'`}
         ORDER BY score, p.name LIMIT ${per}`,
        { like }
      ).map((r) => shape('paths', r, r.title))
    );
  }
  if (types.includes('courses')) {
    hits.push(
      ...all<Record<string, unknown>>(
        db,
        `SELECT c.slug, c.title, substr(c.summary, 1, 140) AS snippet, c.author AS context,
                c.difficulty, ${rank('c.title')} AS score
         FROM courses c
         WHERE (c.title LIKE @like ESCAPE '\\' OR c.summary LIKE @like ESCAPE '\\')${draftGuard(canSeeDrafts, 'c')}
         ORDER BY score, c.title LIMIT ${per}`,
        { like }
      ).map((r) => shape('courses', r, r.title))
    );
  }
  if (types.includes('collections')) {
    hits.push(
      ...all<Record<string, unknown>>(
        db,
        `SELECT cc.slug, cc.title, substr(cc.description, 1, 140) AS snippet, cc.kind AS context,
                NULL AS difficulty, ${rank('cc.title')} AS score
         FROM curated_collections cc
         WHERE cc.title LIKE @like ESCAPE '\\' OR cc.description LIKE @like ESCAPE '\\'
         ORDER BY score, cc.title LIMIT ${per}`,
        { like }
      ).map((r) => shape('collections', r, r.title))
    );
  }
  return hits;
}

function shape(type: SearchEntityType, r: Record<string, unknown>, title: unknown): SearchHit {
  return {
    type,
    slug: String(r.slug),
    title: String(title ?? ''),
    snippet: r.snippet === null ? '' : String(r.snippet),
    context: r.context === null || r.context === undefined || r.context === '' ? null : String(r.context),
    difficulty:
      r.difficulty === null || r.difficulty === undefined ? null : (String(r.difficulty) as Difficulty),
    score: Number(r.score ?? 0)
  };
}

/**
 * Empty-query suggestions: what a fresh visitor should start from. Trending = published topics
 * with the most published lessons (real popularity signal, no fabricated metrics); entry points
 * = featured + easiest paths. Returned as normal SearchHits so one renderer handles both modes.
 */
export function getSuggestions(db: Database.Database, limit: number): SearchHit[] {
  const trending = all<Record<string, unknown>>(
    db,
    `SELECT t.slug, t.name AS title, substr(t.definition, 1, 140) AS snippet,
            d.name || ' / ' || s.name AS context, t.difficulty,
            (SELECT COUNT(*) FROM lesson_topics lt JOIN lessons l ON l.id = lt.lesson_id
              WHERE lt.topic_id = t.id AND l.status = 'published') AS lesson_count
     FROM topics t JOIN subdomains s ON s.id = t.subdomain_id JOIN domains d ON d.id = s.domain_id
     WHERE t.status = 'published'
     ORDER BY lesson_count DESC, d.order_index, t.name LIMIT 6`
  ).map((r) => ({ ...shape('topics', r, r.title), score: -Number(r.lesson_count ?? 0) }));
  const entryPaths = all<Record<string, unknown>>(
    db,
    `SELECT p.slug, p.name AS title, substr(p.summary, 1, 140) AS snippet, p.audience AS context, p.difficulty
     FROM learning_paths p WHERE p.status = 'published'
     ORDER BY p.is_featured DESC,
       CASE p.difficulty WHEN 'introductory' THEN 0 WHEN 'beginner' THEN 1 WHEN 'intermediate' THEN 2
         WHEN 'advanced' THEN 3 ELSE 4 END, p.est_hours ASC LIMIT 4`
  ).map((r) => ({ ...shape('paths', r, r.title), score: 0 }));
  return [...trending, ...entryPaths].slice(0, Math.max(1, Math.min(limit, 20)));
}

function runSearch(opts: SearchOptions): { hits: SearchHit[]; usedFallback: boolean } {
  const term = opts.term.trim();
  const types = SCOPED_TYPES[opts.scope] ?? SCOPED_TYPES.all;
  if (term === '') return { hits: getSuggestions(opts.db, opts.limit + opts.offset), usedFallback: false };

  const match = sanitizeFtsMatch(term);
  const ftsEligible = match !== null && term.length >= 3;
  let hits: SearchHit[] = [];
  let usedFallback = !ftsEligible;
  if (ftsEligible) {
    try {
      // The label-only scopes (paths/courses/collections) always ride the LIKE channel; for the
      // "FTS returned nothing" verdict we only look at the FTS-indexed scopes.
      const ftsTypes = types.filter((t) => t !== 'paths' && t !== 'courses' && t !== 'collections');
      hits = match !== null ? ftsHits(opts.db, match, ftsTypes, opts.canSeeDrafts) : [];
      const hasLabelScopes = types.length !== ftsTypes.length;
      if (hits.length === 0 && !hasLabelScopes) usedFallback = true;
    } catch (err) {
      // Defensive: even a sanitised query failing (tokenizer edge cases) must degrade, not 500.
      console.log('[search] FTS failed, falling back to LIKE:', err instanceof Error ? err.message : err);
      usedFallback = true;
    }
  }
  if (usedFallback) hits = likeHits(opts.db, term, types, opts.canSeeDrafts);
  else if (types.some((t) => t === 'paths' || t === 'courses' || t === 'collections')) {
    const labelTypes = types.filter((t) => t === 'paths' || t === 'courses' || t === 'collections');
    const seen = new Set(hits.map((h) => `${h.type}:${h.slug}`));
    for (const h of likeHits(opts.db, term, labelTypes, opts.canSeeDrafts)) {
      if (!seen.has(`${h.type}:${h.slug}`)) hits.push(h);
    }
  }
  hits.sort((a, b) => a.score - b.score || a.title.localeCompare(b.title));
  return { hits: hits.slice(opts.offset, opts.offset + opts.limit), usedFallback };
}

/** Public reuse point: synchronous, scope-filtered, published-only hits ranked best-first. */
export function searchAll(
  db: Database.Database,
  input: { term: string; scope?: SearchScope; limit?: number }
): SearchHit[] {
  const { hits } = runSearch({
    db,
    term: input.term,
    scope: input.scope ?? 'all',
    limit: Math.min(Math.max(input.limit ?? 40, 1), 60),
    offset: 0,
    canSeeDrafts: false
  });
  return hits;
}

export function search(
  db: Database.Database,
  input: { term: string; scope: SearchScope; limit: number; offset: number; canSeeDrafts: boolean }
): { hits: SearchHit[]; usedFallback: boolean } {
  return runSearch({ db, ...input });
}

export function groupHits(hits: SearchHit[]): { type: SearchEntityType; label: string; count: number; items: SearchHit[] }[] {
  const labels: Record<SearchEntityType, string> = {
    topics: 'Topics',
    lessons: 'Lessons',
    resources: 'Resources',
    exercises: 'Exercises',
    paths: 'Learning paths',
    courses: 'Courses',
    collections: 'Collections'
  };
  const order: SearchEntityType[] = ['topics', 'lessons', 'resources', 'exercises', 'paths', 'courses', 'collections'];
  const byType = new Map<SearchEntityType, SearchHit[]>();
  for (const h of hits) {
    const list = byType.get(h.type) ?? [];
    list.push(h);
    byType.set(h.type, list);
  }
  return order
    .filter((t) => byType.has(t))
    .map((t) => {
      const items = byType.get(t) ?? [];
      return { type: t, label: labels[t], count: items.length, items };
    });
}
