import { config } from './config.js';
import { getDb, closeDb } from './db/connection.js';
import { migrate } from './db/migrate.js';
import { createApp } from './app.js';
import { purgeExpiredSessions } from './modules/auth/auth.repo.js';

const db = getDb();
const migration = migrate(db);
if (migration.applied.length > 0) {
  console.log(`[db] applied ${migration.applied.length} migration(s): ${migration.applied.join(', ')}`);
}
for (const problem of migration.problems) console.warn(`[db] ${problem}`);

const app = createApp(db);
const server = app.listen(config.port, () => {
  console.log(`[api] AI Mastery listening on http://localhost:${config.port} (${config.env})`);
  console.log(`[api] database: ${config.dbPath}`);
  console.log(
    `[api] secret: ${config.secretSource === 'env' ? 'APP_SECRET' : 'generated app.key file'}; ` +
      `AI provider: ${config.ai.enabledByEnv ? config.ai.provider : 'configure in admin or set AI_PROVIDER'}`
  );
});

const cleanup = setInterval(() => {
  const removed = purgeExpiredSessions(db);
  if (removed > 0) console.log(`[auth] purged ${removed} expired session(s)`);
}, 60 * 60 * 1000);
cleanup.unref();

function shutdown(signal: string): void {
  console.log(`\n[api] ${signal} received, closing`);
  server.close(() => {
    closeDb();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
