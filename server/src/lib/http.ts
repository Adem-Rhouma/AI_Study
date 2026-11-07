import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }

  static badRequest(message: string, details?: unknown) {
    return new ApiError(400, 'bad_request', message, details);
  }
  static unauthorized(message = 'Authentication required') {
    return new ApiError(401, 'unauthorized', message);
  }
  static forbidden(message = 'Not allowed') {
    return new ApiError(403, 'forbidden', message);
  }
  static notFound(message = 'Not found') {
    return new ApiError(404, 'not_found', message);
  }
  static conflict(message: string) {
    return new ApiError(409, 'conflict', message);
  }
  static tooMany(message = 'Too many requests', retryAfterSeconds = 60) {
    return new ApiError(429, 'rate_limited', message, { retryAfterSeconds });
  }
  static unprocessable(message: string, details?: unknown) {
    return new ApiError(422, 'unprocessable', message, details);
  }
}

/** Wraps async handlers so rejected promises reach the error middleware. */
export function handler(fn: (req: Request, res: Response, next: NextFunction) => unknown): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** Express 5 types params loosely; this normalises a required path segment. */
export function param(req: Request, name: string): string {
  const value = req.params[name];
  const single = Array.isArray(value) ? value[0] : value;
  if (single === undefined || single === '') {
    throw ApiError.badRequest(`Missing path parameter "${name}"`);
  }
  return single;
}

export function queryInt(req: Request, name: string, fallback: number, min: number, max: number): number {
  const raw = req.query[name];
  const text = Array.isArray(raw) ? raw[0] : raw;
  if (typeof text !== 'string' || text === '') return fallback;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function queryString(req: Request, name: string, fallback = ''): string {
  const raw = req.query[name];
  const text = Array.isArray(raw) ? raw[0] : raw;
  return typeof text === 'string' ? text : fallback;
}

export function errorResponse(err: unknown): { status: number; body: unknown } {
  if (err instanceof ApiError) {
    return {
      status: err.status,
      body: {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details === undefined ? {} : { details: err.details })
        }
      }
    };
  }
  if (err instanceof ZodError) {
    return {
      status: 422,
      body: {
        error: {
          code: 'validation_failed',
          message: 'Some fields need attention.',
          details: err.issues.map((issue) => ({
            field: issue.path.join('.') || 'body',
            message: issue.message
          }))
        }
      }
    };
  }
  const message = err instanceof Error ? err.message : 'Unexpected server error';
  const expose = process.env.NODE_ENV !== 'production';
  return { status: 500, body: { error: { code: 'internal_error', message: expose ? message : 'Internal server error' } } };
}
