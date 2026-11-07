import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './connection.js';

const migrationsDir = path.join(import.meta.dirname, 'migrations');

type Migration = { name: string; sql: string };

function readMigrations(): Migration[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migration directory not found: ${migrationsDir}`);
  }
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort()
    .map((f) => ({ name: f, sql: fs.readFileSync(path.join(migrationsDir, f), 'utf8') }));
}

function ensureRegistry(db: Db): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name      TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL,
      checksum  TEXT NOT NULL
    );
  `);
}

function checksum(sql: string): string {
  return Buffer.from(sql.replace(/\r\n/g, '\n'), 'utf8').toString('base64url').slice(0, 32);
}

export type MigrateResult = { applied: string[]; skipped: number; problems: string[] };

export function migrate(db: Db): MigrateResult {
  ensureRegistry(db);
  const appliedRows = db.prepare('SELECT name, checksum FROM _migrations').all() as {
    name: string;
    checksum: string;
  }[];
  const appliedByName = new Map(appliedRows.map((r) => [r.name, r.checksum]));
  const applied: string[] = [];
  const problems: string[] = [];
  let skipped = 0;

  for (const m of readMigrations()) {
    const existing = appliedByName.get(m.name);
    if (existing !== undefined) {
      if (existing !== checksum(m.sql)) {
        problems.push(
          `${m.name} changed after it was applied (checksum ${existing} -> ${checksum(m.sql)}). ` +
            'Add a new migration instead of editing history.'
        );
      }
      skipped += 1;
      continue;
    }
    db.exec('BEGIN');
    try {
      db.exec(m.sql);
      db.prepare('INSERT INTO _migrations (name, applied_at, checksum) VALUES (?, ?, ?)').run(
        m.name,
        new Date().toISOString(),
        checksum(m.sql)
      );
      db.exec('COMMIT');
      applied.push(m.name);
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Migration ${m.name} failed: ${(err as Error).message}`, { cause: err });
    }
  }

  const violations = db.prepare('PRAGMA foreign_key_check').all() as { table: string }[];
  if (violations.length > 0) {
    problems.push(`foreign_key_check reported ${violations.length} violation(s)`);
  }
  const integrity = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
  if (integrity.integrity_check !== 'ok') problems.push(`integrity_check: ${integrity.integrity_check}`);

  return { applied, skipped, problems };
}

export function resetDatabase(db: Db): void {
  const tables = db
    .prepare(
      "SELECT name, type FROM sqlite_master WHERE type IN ('table','view','trigger') AND name NOT LIKE 'sqlite_%'"
    )
    .all() as { name: string; type: string }[];
  db.exec('PRAGMA foreign_keys = OFF');
  db.exec('BEGIN');
  try {
    for (const t of tables) {
      if (t.type === 'trigger') continue; // dropped with its table
      db.exec(`DROP ${t.type === 'view' ? 'VIEW' : 'TABLE'} IF EXISTS "${t.name.replace(/"/g, '""')}"`);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('VACUUM');
}

export function listMigrations(): string[] {
  return readMigrations().map((m) => m.name);
}
