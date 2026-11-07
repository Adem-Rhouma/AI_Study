import type Database from 'better-sqlite3';
import { all, get, likeContains } from '../../db/sql.js';
import type { Difficulty } from '../../lib/domain.js';

/**
 * Hard product rule: competition/event rows are curated by hand, never fetched live.
 * Every row carries isLiveData:false and its curation date, and every list response
 * repeats the disclaimer so no UI can accidentally present this as live data.
 */
export const EVENTS_DISCLAIMER =
  'Entries are curated manually by the AI Mastery team and are not fetched live. ' +
  'Dates, deadlines and rules change — always re-verify on the organiser\u2019s official page before relying on them.';

export const EVENT_STATUSES = ['upcoming', 'open', 'ongoing', 'closed', 'recurring'] as const;
export const EVENT_TYPES = ['competition', 'challenge', 'hackathon', 'conference', 'workshop', 'grant', 'summit'] as const;

export type CompetitionRow = {
  id: number;
  slug: string;
  name: string;
  organizer: string;
  type: string;
  url: string;
  summary: string;
  requirements: string;
  skillsPracticed: string[];
  difficulty: Difficulty;
  startDate: string | null;
  deadlineDate: string | null;
  location: string;
  status: string;
  /** Always false — this data is curated, never live (see EVENTS_DISCLAIMER). */
  isLiveData: false;
  sourceUpdatedAt: string;
};

export type CompetitionDetail = CompetitionRow & {
  relatedTopics: { slug: string; name: string; difficulty: Difficulty }[];
};

/** Split a free-text comma list into trimmed items; keeps empty arrays honest instead of guessing. */
function splitList(text: string): string[] {
  return text
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function mapRow(row: Record<string, unknown>): CompetitionRow {
  return {
    id: Number(row.id),
    slug: String(row.slug),
    name: String(row.name),
    organizer: String(row.organizer ?? ''),
    type: String(row.type),
    url: String(row.url),
    summary: String(row.summary ?? ''),
    requirements: String(row.requirements ?? ''),
    skillsPracticed: splitList(String(row.skills_practiced ?? '')),
    difficulty: String(row.difficulty) as Difficulty,
    startDate: row.start_date === null ? null : String(row.start_date),
    deadlineDate: row.deadline_date === null ? null : String(row.deadline_date),
    location: String(row.location ?? ''),
    status: String(row.status),
    isLiveData: false,
    sourceUpdatedAt: String(row.source_updated_at ?? '')
  };
}

const COMPETITION_COLUMNS = `c.id, c.slug, c.name, c.organizer, c.type, c.url, c.summary, c.requirements,
  c.skills_practiced, c.difficulty, c.start_date, c.deadline_date, c.location, c.status, c.is_live_data,
  c.source_updated_at`;

/**
 * Default ordering per the brief: open/recurring/ongoing first by deadline (no-deadline last),
 * then upcoming by start date, closed last.
 */
const DEFAULT_ORDER_SQL = `CASE c.status WHEN 'open' THEN 0 WHEN 'recurring' THEN 1 WHEN 'ongoing' THEN 2
  WHEN 'upcoming' THEN 3 ELSE 4 END,
  (c.deadline_date IS NULL), c.deadline_date ASC,
  (c.start_date IS NULL), c.start_date ASC`;

export function listCompetitions(
  db: Database.Database,
  filters: {
    status?: string;
    type?: string;
    difficulty?: string;
    q?: string;
    limit: number;
    offset: number;
  }
): { items: CompetitionRow[]; total: number } {
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: filters.limit, offset: filters.offset };
  if (filters.status && filters.status !== 'all') {
    where.push('c.status = @status');
    params.status = filters.status;
  } else if (!filters.status) {
    // Default view hides finished editions; status=all opts back in.
    where.push(`c.status <> 'closed'`);
  }
  if (filters.type && filters.type !== 'all') {
    where.push('c.type = @type');
    params.type = filters.type;
  }
  if (filters.difficulty && filters.difficulty !== 'all') {
    where.push('c.difficulty = @difficulty');
    params.difficulty = filters.difficulty;
  }
  if (filters.q) {
    where.push(`(c.name LIKE @q ESCAPE '\\' OR c.summary LIKE @q ESCAPE '\\' OR c.organizer LIKE @q ESCAPE '\\')`);
    params.q = likeContains(filters.q);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM competitions c ${clause}`, params)?.c ?? 0;
  const items = all<Record<string, unknown>>(
    db,
    `SELECT ${COMPETITION_COLUMNS} FROM competitions c ${clause} ORDER BY ${DEFAULT_ORDER_SQL} LIMIT @limit OFFSET @offset`,
    params
  ).map(mapRow);
  return { items, total };
}

export function getCompetitionBySlug(db: Database.Database, slug: string): CompetitionDetail | null {
  const row = get<Record<string, unknown>>(db, `SELECT ${COMPETITION_COLUMNS} FROM competitions c WHERE c.slug = ?`, {
    slug
  });
  if (!row) return null;
  const base = mapRow(row);
  const relatedTopics = all<Record<string, unknown>>(
    db,
    `SELECT t.slug, t.name, t.difficulty FROM competition_topics ct JOIN topics t ON t.id = ct.topic_id
     WHERE ct.competition_id = @id AND t.status = 'published' ORDER BY t.name`,
    { id: base.id }
  ).map((t) => ({ slug: String(t.slug), name: String(t.name), difficulty: String(t.difficulty) as Difficulty }));
  return { ...base, relatedTopics };
}

export type CalendarMonth = { month: string; label: string; items: CompetitionRow[] };

/**
 * Entries whose start_date OR deadline_date falls inside [today, today+days].
 * Grouped by month (YYYY-MM) newest-order-free: chronological within each month.
 */
export function getCalendar(db: Database.Database, days: number): { from: string; to: string; months: CalendarMonth[] } {
  const today = new Date();
  const from = today.toISOString().slice(0, 10);
  const to = new Date(today.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const rows = all<Record<string, unknown>>(
    db,
    `SELECT ${COMPETITION_COLUMNS},
            COALESCE(c.deadline_date, c.start_date) AS event_date
     FROM competitions c
     WHERE c.status <> 'closed'
       AND ((c.start_date BETWEEN @from AND @to) OR (c.deadline_date BETWEEN @from AND @to))
     ORDER BY event_date ASC, c.name COLLATE NOCASE ASC`,
    { from, to }
  );
  const months = new Map<string, CompetitionRow[]>();
  for (const row of rows) {
    const date = String(row.event_date ?? from);
    const key = date.slice(0, 7);
    const list = months.get(key) ?? [];
    const item = mapRow(row);
    // Pin each row to the date that put it in the window (deadline preferred).
    list.push(item);
    months.set(key, list);
  }
  const formatter = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' });
  return {
    from,
    to,
    months: [...months.entries()].map(([month, items]) => {
      const [y, m] = month.split('-').map(Number);
      return { month, label: formatter.format(new Date(Date.UTC(y, (m ?? 1) - 1, 1))), items };
    })
  };
}
