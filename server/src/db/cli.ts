import { openDatabase, closeDb } from './connection.js';
import { migrate, resetDatabase } from './migrate.js';
import { config } from '../config.js';

const command = process.argv[2];

function fail(message: string): never {
  console.error(`\n  ! ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const db = openDatabase();
  try {
    if (command === 'migrate') {
      const result = migrate(db);
      if (result.applied.length === 0) {
        console.log(`database up to date (${result.skipped} migration(s) already applied)`);
      } else {
        console.log(`applied: ${result.applied.join(', ')}`);
      }
      if (result.problems.length) fail(result.problems.join('\n  ! '));
      console.log(`sqlite: ${config.dbPath}`);
    } else if (command === 'reset') {
      resetDatabase(db);
      migrate(db);
      console.log('database reset and migrated');
      const { seedAll } = await import('../seed/index.js');
      const summary = await seedAll(db);
      console.log(summary.lines.map((l) => `  ${l}`).join('\n'));
    } else if (command === 'seed') {
      migrate(db);
      const { seedAll } = await import('../seed/index.js');
      const summary = await seedAll(db);
      console.log(summary.lines.map((l) => `  ${l}`).join('\n'));
    } else {
      fail(`unknown command "${command ?? ''}" — use migrate | seed | reset`);
    }
  } finally {
    closeDb();
  }
}

main().catch((err) => fail(err instanceof Error ? err.stack ?? err.message : String(err)));
