import type { NextFunction, Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { ApiError } from './http.js';
import { findUserById, readSession, touchSession, toPublicUser, type PublicUser } from '../modules/auth/auth.repo.js';
import { config } from '../config.js';

declare global {
  namespace Express {
    interface Request {
      db: Database.Database;
      user?: PublicUser;
      sessionId?: string;
    }
  }
}

/** Session activity is recorded at most once a minute to keep reads from writing constantly. */
const LAST_SEEN_UPDATE_INTERVAL_MS = 60_000;

export function attachDatabase(db: Database.Database) {
  return (req: Request, _res: Response, next: NextFunction) => {
    req.db = db;
    next();
  };
}

/** Resolves the session cookie when present. Never throws — anonymous access is legitimate. */
export function attachUser(req: Request, _res: Response, next: NextFunction): void {
  const token = req.cookies?.[config.session.cookieName];
  if (!token || typeof token !== 'string') {
    next();
    return;
  }
  const session = readSession(req.db, token);
  if (!session || session.expires_at <= new Date().toISOString()) {
    next();
    return;
  }
  const user = findUserById(req.db, Number(session.user_id));
  if (!user || user.is_active !== 1) {
    next();
    return;
  }
  req.user = toPublicUser(user);
  req.sessionId = session.id;
  const oneMinuteAgo = new Date(Date.now() - LAST_SEEN_UPDATE_INTERVAL_MS).toISOString();
  if (session.last_seen_at < oneMinuteAgo) touchSession(req.db, session.id);
  next();
}

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) next(ApiError.unauthorized());
  else next();
}

export function requireRole(...roles: PublicUser['role'][]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      return next(ApiError.forbidden('This area needs an author or administrator account.'));
    }
    next();
  };
}

export const requireStaff = requireRole('author', 'admin');
export const requireAdmin = requireRole('admin');
