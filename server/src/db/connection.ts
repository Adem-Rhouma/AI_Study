import Database from 'better-sqlite3';
import { config } from '../config.js';

export type Db = Database.Database;

let handle: Db | null = null;

export function openDatabase(location: string = config.dbPath): Db {
  const db = new Database(location);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  return db;
}

/** Process-wide connection used by the HTTP server and scripts. */
export function getDb(): Db {
  if (!handle) handle = openDatabase();
  return handle;
}

export function closeDb(): void {
  if (handle) {
    handle.close();
    handle = null;
  }
}
