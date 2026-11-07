import bcrypt from 'bcryptjs';
import { z } from 'zod';
import type Database from 'better-sqlite3';
import { get, insert, run } from '../../db/sql.js';
import { ApiError } from '../../lib/http.js';
import { hashToken, randomToken } from '../../lib/crypto.js';
import { config } from '../../config.js';
import { nowIso } from '../../lib/domain.js';

export type UserRole = 'learner' | 'author' | 'admin';

export type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: UserRole;
  bio: string | null;
  avatar_url: string | null;
  is_active: number;
  failed_logins: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
};

export type PublicUser = {
  id: number;
  email: string;
  displayName: string;
  role: UserRole;
  bio: string | null;
  avatarUrl: string | null;
  createdAt: string;
  lastLoginAt: string | null;
};

export type PreferencesRow = {
  user_id: number;
  theme: 'light' | 'dark' | 'system';
  reduced_motion: number;
  ui_density: 'comfortable' | 'compact';
  daily_goal_minutes: number;
  default_difficulty: string;
  show_solutions_by_default: number;
  ai_assistant_enabled: number;
  updated_at: string;
};

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address').max(254),
  password: z
    .string()
    .min(10, 'Use at least 10 characters')
    .max(200, 'That password is too long')
    .refine((v) => /[a-zA-Z]/.test(v), 'Include at least one letter')
    .refine((v) => /[0-9]/.test(v), 'Include at least one number'),
  displayName: z.string().trim().min(2, 'At least 2 characters').max(60)
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().min(1).max(200)
});

export const preferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  reducedMotion: z.boolean().default(false),
  uiDensity: z.enum(['comfortable', 'compact']).default('comfortable'),
  dailyGoalMinutes: z.number().int().min(0).max(600).default(20),
  defaultDifficulty: z.enum(['introductory', 'beginner', 'intermediate', 'advanced', 'expert']).default('intermediate'),
  showSolutionsByDefault: z.boolean().default(false),
  aiAssistantEnabled: z.boolean().default(true)
});

// A constant dummy digest keeps the "unknown email" path roughly as slow as a real verify,
// so response time does not leak which addresses have accounts.
const DUMMY_DIGEST = bcrypt.hashSync('aim-timing-equaliser', 10);
const MAX_FAILED_LOGINS = 6;
const LOCK_MINUTES = 15;

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    bio: row.bio,
    avatarUrl: row.avatar_url,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at
  };
}

export function findUserByEmail(db: Database.Database, email: string): UserRow | undefined {
  return get<UserRow>(db, 'SELECT * FROM users WHERE email = ?', { email });
}

export function findUserById(db: Database.Database, id: number): UserRow | undefined {
  return get<UserRow>(db, 'SELECT * FROM users WHERE id = ?', { id });
}

export function createUser(db: Database.Database, input: { email: string; password: string; displayName: string; role?: UserRole }): UserRow {
  const timestamp = nowIso();
  const digest = bcrypt.hashSync(input.password, 10);
  const id = insert(
    db,
    `INSERT INTO users (email, password_hash, display_name, role, is_active, failed_logins, created_at, updated_at)
     VALUES (@email, @digest, @displayName, @role, 1, 0, @timestamp, @timestamp)`,
    { email: input.email, digest, displayName: input.displayName, role: input.role ?? 'learner', timestamp }
  );
  ensurePreferences(db, id, timestamp);
  const created = findUserById(db, id);
  if (!created) throw new ApiError(500, 'internal_error', 'Failed to create user record');
  return created;
}

export function setPassword(db: Database.Database, userId: number, password: string): void {
  run(db, 'UPDATE users SET password_hash = @digest, updated_at = @timestamp WHERE id = @id', {
    digest: bcrypt.hashSync(password, 10),
    timestamp: nowIso(),
    id: userId
  });
}

export function verifyPassword(password: string, digest: string | undefined): boolean {
  if (!digest) {
    bcrypt.compareSync(password, DUMMY_DIGEST);
    return false;
  }
  return bcrypt.compareSync(password, digest);
}

export function noteFailedLogin(db: Database.Database, row: UserRow): void {
  const failed = row.failed_logins + 1;
  const lockedUntil = failed >= MAX_FAILED_LOGINS ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null;
  run(
    db,
    `UPDATE users SET failed_logins = @failed, locked_until = @lockedUntil, updated_at = @timestamp WHERE id = @id`,
    { failed, lockedUntil, timestamp: nowIso(), id: row.id }
  );
}

export function noteSuccessfulLogin(db: Database.Database, userId: number): void {
  run(
    db,
    `UPDATE users SET failed_logins = 0, locked_until = NULL, last_login_at = @timestamp, updated_at = @timestamp WHERE id = @id`,
    { timestamp: nowIso(), id: userId }
  );
}

export function isLocked(row: UserRow): boolean {
  return row.locked_until !== null && row.locked_until > nowIso();
}

export type SessionRecord = {
  id: string;
  user_id: number;
  expires_at: string;
  last_seen_at: string;
};

export function createSession(
  db: Database.Database,
  userId: number,
  meta: { ip?: string; userAgent?: string } = {}
): { token: string; cookieValue: string; expiresAt: string } {
  const token = randomToken(32);
  const sessionId = hashToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + config.session.lifetimeDays * 86_400_000).toISOString();
  insert(
    db,
    `INSERT INTO sessions (id, user_id, created_at, last_seen_at, expires_at, ip_prefix, user_agent)
     VALUES (@id, @userId, @createdAt, @createdAt, @expiresAt, @ip, @agent)`,
    {
      id: sessionId,
      userId,
      createdAt: now.toISOString(),
      expiresAt: expires,
      ip: meta.ip ? meta.ip.split('.').slice(0, 3).join('.') : null,
      agent: meta.userAgent ? meta.userAgent.slice(0, 200) : null
    }
  );
  return { token, cookieValue: token, expiresAt: expires };
}

export function readSession(db: Database.Database, cookieValue: string): SessionRecord | undefined {
  const id = hashToken(cookieValue);
  return get<SessionRecord>(db, 'SELECT id, user_id, expires_at, last_seen_at FROM sessions WHERE id = ?', {
    id
  });
}

export function touchSession(db: Database.Database, sessionId: string): void {
  run(db, 'UPDATE sessions SET last_seen_at = @timestamp WHERE id = @id', { timestamp: nowIso(), id: sessionId });
}

export function destroySession(db: Database.Database, cookieValue: string): void {
  run(db, 'DELETE FROM sessions WHERE id = @id', { id: hashToken(cookieValue) });
}

export function destroyAllSessions(db: Database.Database, userId: number, exceptSessionId?: string): void {
  if (exceptSessionId) {
    run(db, 'DELETE FROM sessions WHERE user_id = @userId AND id <> @keep', { userId, keep: exceptSessionId });
    return;
  }
  run(db, 'DELETE FROM sessions WHERE user_id = @userId', { userId });
}

export function purgeExpiredSessions(db: Database.Database): number {
  return run(db, 'DELETE FROM sessions WHERE expires_at < @timestamp', { timestamp: nowIso() }).changes;
}

/**
 * Erasing an account. Every personal row (mastery, attempts, notes, bookmarks, enrolments,
 * collections, sessions, resets, preferences) hangs off users(id) with ON DELETE CASCADE, so this
 * single statement is the whole deletion. Curriculum the user authored survives: created_by is
 * ON DELETE SET NULL by design, so content is never collateral damage of an account going away.
 */
export function deleteUser(db: Database.Database, userId: number): number {
  return run(db, 'DELETE FROM users WHERE id = @userId', { userId }).changes;
}

export function createPasswordReset(db: Database.Database, userId: number): { token: string; expiresAt: string } {
  const token = randomToken(24);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  insert(db, 'INSERT INTO password_resets (id, user_id, created_at, expires_at) VALUES (@id, @userId, @now, @expiresAt)', {
    id: hashToken(token),
    userId,
    now: nowIso(),
    expiresAt
  });
  return { token, expiresAt };
}

export function consumePasswordReset(db: Database.Database, token: string): UserRow {
  const row = get<{ id: string; user_id: number; expires_at: string; used_at: string | null }>(
    db,
    'SELECT id, user_id, expires_at, used_at FROM password_resets WHERE id = ?',
    { id: hashToken(token) }
  );
  if (!row || row.used_at !== null || row.expires_at < nowIso()) {
    throw ApiError.badRequest('That reset link is invalid or has expired. Request a new one.');
  }
  run(db, 'UPDATE password_resets SET used_at = @timestamp WHERE id = @id', { timestamp: nowIso(), id: row.id });
  const user = findUserById(db, row.user_id);
  if (!user) throw ApiError.badRequest('That reset link no longer matches an account.');
  return user;
}

export function getPreferences(db: Database.Database, userId: number): PreferencesRow {
  const timestamp = nowIso();
  ensurePreferences(db, userId, timestamp);
  const row = get<PreferencesRow>(db, 'SELECT * FROM user_preferences WHERE user_id = ?', { user_id: userId });
  if (!row) throw new ApiError(500, 'internal_error', 'Preferences row missing');
  return row;
}

export function savePreferences(db: Database.Database, userId: number, prefs: z.infer<typeof preferencesSchema>): PreferencesRow {
  ensurePreferences(db, userId, nowIso());
  run(
    db,
    `UPDATE user_preferences SET
        theme = @theme, reduced_motion = @reducedMotion, ui_density = @uiDensity,
        daily_goal_minutes = @dailyGoalMinutes, default_difficulty = @defaultDifficulty,
        show_solutions_by_default = @showSolutionsByDefault, ai_assistant_enabled = @aiEnabled,
        updated_at = @timestamp
     WHERE user_id = @userId`,
    {
      theme: prefs.theme,
      reducedMotion: prefs.reducedMotion ? 1 : 0,
      uiDensity: prefs.uiDensity,
      dailyGoalMinutes: prefs.dailyGoalMinutes,
      defaultDifficulty: prefs.defaultDifficulty,
      showSolutionsByDefault: prefs.showSolutionsByDefault ? 1 : 0,
      aiEnabled: prefs.aiAssistantEnabled ? 1 : 0,
      timestamp: nowIso(),
      userId
    }
  );
  return getPreferences(db, userId);
}

export function preferencesToJson(row: PreferencesRow) {
  return {
    theme: row.theme,
    reducedMotion: row.reduced_motion === 1,
    uiDensity: row.ui_density,
    dailyGoalMinutes: row.daily_goal_minutes,
    defaultDifficulty: row.default_difficulty,
    showSolutionsByDefault: row.show_solutions_by_default === 1,
    aiAssistantEnabled: row.ai_assistant_enabled === 1
  };
}

function ensurePreferences(db: Database.Database, userId: number, timestamp: string): void {
  run(
    db,
    `INSERT INTO user_preferences (user_id, updated_at) VALUES (@userId, @timestamp)
     ON CONFLICT (user_id) DO NOTHING`,
    { userId, timestamp }
  );
}
