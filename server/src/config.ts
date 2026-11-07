import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const projectRoot = path.resolve(import.meta.dirname, '..', '..');

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const raw = env(name, '');
  if (raw === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

const dataDir = path.resolve(env('DATA_DIR', path.join(projectRoot, 'server', 'data')));
const dbPath = env('DB_PATH', path.join(dataDir, 'ai-mastery.sqlite'));
const uploadDir = path.resolve(env('UPLOAD_DIR', path.join(dataDir, 'uploads')));
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

/**
 * A stable 256-bit secret. Without APP_SECRET we persist one under the data dir instead of
 * putting provider API keys in the database in plaintext.
 */
function loadSecret(): { secret: Buffer; source: 'env' | 'file' } {
  const fromEnv = env('APP_SECRET', '');
  if (fromEnv.length >= 16) {
    return { secret: crypto.createHash('sha256').update(fromEnv, 'utf8').digest(), source: 'env' };
  }
  const keyFile = path.join(dataDir, 'app.key');
  if (fs.existsSync(keyFile)) {
    const hex = fs.readFileSync(keyFile, 'utf8').trim();
    if (hex.length === 64) return { secret: Buffer.from(hex, 'hex'), source: 'file' };
  }
  const fresh = crypto.randomBytes(32);
  fs.writeFileSync(keyFile, fresh.toString('hex'), { mode: 0o600 });
  return { secret: fresh, source: 'file' };
}

const secret = loadSecret();

export const config = {
  env: env('NODE_ENV', 'development'),
  isProduction: env('NODE_ENV', 'development') === 'production',
  port: int('PORT', 4000),
  webOrigin: env('WEB_ORIGIN', 'http://localhost:5173'),
  projectRoot,
  dataDir,
  dbPath,
  uploadDir,
  curriculumDir: path.resolve(env('CURRICULUM_DIR', path.join(projectRoot, 'server', 'data', 'curriculum'))),
  webDist: path.join(projectRoot, 'web', 'dist'),
  secret: secret.secret,
  secretSource: secret.source,
  session: {
    cookieName: env('COOKIE_NAME', 'aim_session'),
    lifetimeDays: int('SESSION_LIFETIME_DAYS', 30),
    secureCookies: env('COOKIE_SECURE', '') === 'true' || env('NODE_ENV', '') === 'production'
  },
  rateLimit: {
    authPerMinute: int('RATE_LIMIT_AUTH', 20),
    aiPerMinute: int('RATE_LIMIT_AI', 20),
    generalPerMinute: int('RATE_LIMIT_GENERAL', 240)
  },
  ai: {
    // Env-configured provider used when no provider row is enabled in the admin UI.
    enabledByEnv: env('AI_PROVIDER', '') !== '',
    provider: env('AI_PROVIDER', '') as '' | 'openai_compatible' | 'anthropic' | 'ollama',
    baseUrl: env('AI_BASE_URL', ''),
    apiKey: env('AI_API_KEY', ''),
    model: env('AI_MODEL', '')
  },
  seedAdmin: {
    email: env('SEED_ADMIN_EMAIL', 'admin@aimastery.local'),
    password: env('SEED_ADMIN_PASSWORD', 'ChangeMe-2026!')
  },
  logLevel: env('LOG_LEVEL', 'info')
} as const;

export type AppConfig = typeof config;
