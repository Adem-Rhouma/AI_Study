import type Database from 'better-sqlite3';

type Statement = Database.Statement;

const cache = new WeakMap<Database.Database, Map<string, Statement>>();

/**
 * Prepared statements are memoized per connection. better-sqlite3 parses on prepare, so this
 * keeps hot read paths (dashboards, topic pages) from re-parsing SQL on every request.
 */
export function prepare(db: Database.Database, text: string): Statement {
  let byText = cache.get(db);
  if (!byText) {
    byText = new Map();
    cache.set(db, byText);
  }
  let stmt = byText.get(text);
  if (!stmt) {
    stmt = db.prepare(text);
    byText.set(text, stmt);
  }
  return stmt;
}

export type SqlParams = Record<string, unknown> | unknown[];

/**
 * better-sqlite3 distinguishes anonymous (`?`) from named (`@x`) binds, and the call sites here
 * use both. Bindings are resolved from the statement text so callers never have to care.
 */
function bindValues(sql: string, params: SqlParams | undefined): unknown[] {
  if (params === undefined) return [];
  if (Array.isArray(params)) return params;
  const values = Object.values(params);
  if (sql.includes('?') && !sql.includes('@')) return values;
  return [params];
}

export function all<T>(db: Database.Database, text: string, params: SqlParams = {}): T[] {
  return prepare(db, text).all(...bindValues(text, params)) as T[];
}

export function get<T>(db: Database.Database, text: string, params: SqlParams = {}): T | undefined {
  return prepare(db, text).get(...bindValues(text, params)) as T | undefined;
}

export function run(db: Database.Database, text: string, params: SqlParams = {}) {
  return prepare(db, text).run(...bindValues(text, params));
}

export function insert(db: Database.Database, text: string, params: SqlParams = {}): number {
  const result = run(db, text, params);
  return Number(result.lastInsertRowid);
}

export function tx<T>(db: Database.Database, fn: () => T): T {
  const wrapped = db.transaction(fn);
  return wrapped();
}

export function likeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}
