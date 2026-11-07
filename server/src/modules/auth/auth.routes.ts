import { Router } from 'express';
import { z } from 'zod';
import { ApiError, handler } from '../../lib/http.js';
import { RateLimiter } from '../../lib/rateLimit.js';
import { config } from '../../config.js';
import { requireAuth } from '../../lib/auth-context.js';
import {
  consumePasswordReset,
  createPasswordReset,
  createSession,
  createUser,
  destroyAllSessions,
  destroySession,
  deleteUser,
  findUserByEmail,
  findUserById,
  getPreferences,
  isLocked,
  loginSchema,
  noteFailedLogin,
  noteSuccessfulLogin,
  preferencesSchema,
  preferencesToJson,
  registerSchema,
  savePreferences,
  setPassword,
  toPublicUser,
  verifyPassword
} from './auth.repo.js';

/** Per-minute signup budget. Exported so a test can start from an empty window. */
export const authLimiter = new RateLimiter(config.rateLimit.authPerMinute, 60_000, 'authentication');

function cookieOptions(maxAgeMs: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: config.session.secureCookies,
    path: '/',
    maxAge: maxAgeMs
  };
}

function sessionMeta(req: { ip?: string; headers: Record<string, string | string[] | undefined> }) {
  const agent = req.headers['user-agent'];
  return { ip: req.ip, userAgent: typeof agent === 'string' ? agent : undefined };
}

/**
 * Password-reset transport. This build has no outbound SMTP dependency: when no transport is
 * configured the link is written to the server log (and, outside production, returned to the
 * client) so the flow is complete and testable locally. Replace this one function with a real
 * mailer for production delivery.
 */
function deliverResetEmail(email: string, token: string): string | null {
  const link = `${config.webOrigin}/reset-password?token=${token}`;
  console.log(`[auth] Password reset link for ${email}: ${link}`);
  if (config.isProduction && process.env.MAIL_TRANSPORT !== 'console') return null;
  return link;
}

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: registerSchema.shape.password
});

const deleteAccountSchema = z.object({
  password: z.string().min(1).max(200),
  confirm: z.string().max(60).default('')
});

const resetRequestSchema = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

const resetConfirmSchema = z.object({
  token: z.string().min(8).max(200),
  newPassword: registerSchema.shape.password
});

export const authRouter = Router();

authRouter.post(
  '/register',
  handler((req, res) => {
    const input = registerSchema.parse(req.body);
    authLimiter.check(`register:${req.ip ?? 'unknown'}:${input.email}`);
    if (findUserByEmail(req.db, input.email)) {
      throw ApiError.conflict('An account already uses that email address.');
    }
    const user = createUser(req.db, input);
    const session = createSession(req.db, user.id, sessionMeta(req));
    res
      .cookie(config.session.cookieName, session.cookieValue, cookieOptions(config.session.lifetimeDays * 86_400_000))
      .status(201)
      .json({ user: toPublicUser(user), preferences: preferencesToJson(getPreferences(req.db, user.id)) });
  })
);

authRouter.post(
  '/login',
  handler((req, res) => {
    const input = loginSchema.parse(req.body);
    authLimiter.check(`login:${req.ip ?? 'unknown'}:${input.email}`);
    const row = findUserByEmail(req.db, input.email);
    if (row && isLocked(row)) {
      throw ApiError.tooMany('Too many failed attempts. Try again in a few minutes.', 900);
    }
    if (!row || row.is_active !== 1 || !verifyPassword(input.password, row.password_hash)) {
      if (row) noteFailedLogin(req.db, row);
      throw ApiError.unauthorized('Email or password is incorrect.');
    }
    noteSuccessfulLogin(req.db, row.id);
    const session = createSession(req.db, row.id, sessionMeta(req));
    res
      .cookie(config.session.cookieName, session.cookieValue, cookieOptions(config.session.lifetimeDays * 86_400_000))
      .json({ user: toPublicUser(row), preferences: preferencesToJson(getPreferences(req.db, row.id)) });
  })
);

authRouter.post(
  '/logout',
  handler((req, res) => {
    const token = req.cookies?.[config.session.cookieName];
    if (typeof token === 'string') destroySession(req.db, token);
    res.clearCookie(config.session.cookieName, { path: '/' }).json({ ok: true });
  })
);

authRouter.get(
  '/me',
  handler((req, res) => {
    if (!req.user) {
      res.json({ user: null, preferences: null });
      return;
    }
    res.json({ user: req.user, preferences: preferencesToJson(getPreferences(req.db, req.user.id)) });
  })
);

authRouter.patch(
  '/me',
  requireAuth,
  handler((req, res) => {
    const body = z
      .object({ displayName: z.string().trim().min(2).max(60).optional(), bio: z.string().trim().max(600).nullable().optional() })
      .parse(req.body);
    if (body.displayName !== undefined) {
      req.db.prepare('UPDATE users SET display_name = @v, updated_at = @t WHERE id = @id').run({
        v: body.displayName,
        t: new Date().toISOString(),
        id: req.user!.id
      });
    }
    if (body.bio !== undefined) {
      req.db.prepare('UPDATE users SET bio = @v, updated_at = @t WHERE id = @id').run({
        v: body.bio,
        t: new Date().toISOString(),
        id: req.user!.id
      });
    }
    const updated = findUserById(req.db, req.user!.id);
    if (!updated) throw ApiError.notFound('Account not found');
    res.json({ user: toPublicUser(updated), preferences: preferencesToJson(getPreferences(req.db, updated.id)) });
  })
);

authRouter.get(
  '/me/preferences',
  requireAuth,
  handler((req, res) => {
    res.json({ preferences: preferencesToJson(getPreferences(req.db, req.user!.id)) });
  })
);

authRouter.put(
  '/me/preferences',
  requireAuth,
  handler((req, res) => {
    const prefs = preferencesSchema.parse(req.body);
    const row = savePreferences(req.db, req.user!.id, prefs);
    res.json({ preferences: preferencesToJson(row) });
  })
);

authRouter.post(
  '/me/password',
  requireAuth,
  handler((req, res) => {
    const body = changePasswordSchema.parse(req.body);
    const row = findUserById(req.db, req.user!.id);
    if (!row || !verifyPassword(body.currentPassword, row.password_hash)) {
      throw ApiError.unauthorized('Your current password is not correct.');
    }
    setPassword(req.db, row.id, body.newPassword);
    destroyAllSessions(req.db, row.id, req.sessionId);
    res.json({ ok: true, note: 'Other devices were signed out.' });
  })
);

/**
 * Erasing an account for good. Deliberately harder than a password change: the current password
 * plus the literal word, because one click should never be able to delete a learner's history.
 * Sessions are destroyed first so no request can be served from a row that is about to vanish.
 */
authRouter.delete(
  '/me',
  requireAuth,
  handler((req, res) => {
    const body = deleteAccountSchema.parse(req.body ?? {});
    const row = findUserById(req.db, req.user!.id);
    if (!row) throw ApiError.notFound('Account not found');
    authLimiter.check(`delete-account:${req.ip ?? 'unknown'}:${row.id}`);
    if (!verifyPassword(body.password, row.password_hash)) {
      throw ApiError.unauthorized('Your password is not correct.');
    }
    if (body.confirm !== 'DELETE') {
      throw ApiError.badRequest('Type DELETE exactly to confirm the removal.');
    }
    destroyAllSessions(req.db, row.id);
    const removed = deleteUser(req.db, row.id);
    if (removed === 0) throw ApiError.notFound('Account not found');
    res.clearCookie(config.session.cookieName, { path: '/' }).json({
      ok: true,
      note: 'Your account and everything stored against it were deleted.'
    });
  })
);

authRouter.post(
  '/forgot-password',
  handler((req, res) => {
    const { email } = resetRequestSchema.parse(req.body);
    authLimiter.check(`forgot:${req.ip ?? 'unknown'}:${email}`);
    const row = findUserByEmail(req.db, email);
    let devLink: string | null = null;
    if (row) {
      const { token } = createPasswordReset(req.db, row.id);
      devLink = deliverResetEmail(email, token);
    }
    // Always the same response: this endpoint must not confirm which addresses exist.
    res.json({
      ok: true,
      message: 'If an account exists for that address, a reset link has been generated.',
      ...(devLink ? { devLink } : {})
    });
  })
);

authRouter.post(
  '/reset-password',
  handler((req, res) => {
    const body = resetConfirmSchema.parse(req.body);
    authLimiter.check(`reset:${req.ip ?? 'unknown'}`);
    const user = consumePasswordReset(req.db, body.token);
    setPassword(req.db, user.id, body.newPassword);
    destroyAllSessions(req.db, user.id);
    res.clearCookie(config.session.cookieName, { path: '/' }).json({ ok: true });
  })
);
