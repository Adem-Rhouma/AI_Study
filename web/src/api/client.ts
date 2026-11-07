/** Single place where the frontend talks HTTP. Nothing else may call fetch(). */

export class ApiError extends Error {
  readonly status: number;
  readonly details?: Record<string, string>;

  constructor(message: string, status: number, details?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function buildUrl(path: string, query?: Query): string {
  const url = new URL(`/api${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return `${url.pathname}${url.search}`;
}

async function request<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  options: { query?: Query; body?: unknown } = {}
): Promise<T> {
  const init: RequestInit = {
    method,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' }
  };
  if (options.body !== undefined) {
    (init.headers as Record<string, string>)['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), init);
  } catch {
    throw new ApiError('Cannot reach the server. Is the API running?', 0);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const payload: unknown = text ? safeParse(text) : null;

  if (!response.ok) {
    throw readError(payload, response.status);
  }

  return (payload ?? null) as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: 'Server returned a response that is not JSON.' };
  }
}

/** Field issues arrive as [{ field, message }]; forms key them by field name. */
function fieldDetails(details: unknown): Record<string, string> | undefined {
  if (!Array.isArray(details)) return undefined;
  const map: Record<string, string> = {};
  for (const entry of details) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { field, message } = entry as { field?: unknown; message?: unknown };
    if (typeof field === 'string' && field !== '') map[field] = String(message ?? '');
  }
  return Object.keys(map).length > 0 ? map : undefined;
}

function readError(payload: unknown, status: number): ApiError {
  const body = (payload ?? {}) as { error?: unknown; message?: string };
  const error = body.error;
  if (typeof error === 'object' && error !== null) {
    const envelope = error as { message?: string; details?: unknown };
    return new ApiError(envelope.message ?? `Request failed (${status})`, status, fieldDetails(envelope.details));
  }
  return new ApiError(typeof error === 'string' ? error : (body.message ?? `Request failed (${status})`), status);
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>('GET', path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, { body }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, { body }),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, { body }),
  del: <T>(path: string, body?: unknown) => request<T>('DELETE', path, { body })
};
