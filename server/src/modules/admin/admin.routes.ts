import type { Request } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireStaff } from '../../lib/auth-context.js';
import { ApiError, handler, param, queryInt, queryString } from '../../lib/http.js';
import { paginationSchema } from '../../lib/domain.js';
import {
  createKind,
  deleteProvider,
  listKind,
  listProviders,
  listUsers,
  overview,
  recentChanges,
  readKind,
  refs,
  removeKind,
  revision,
  revisions,
  saveProvider,
  setKindStatus,
  studioDescriptor,
  testProvider,
  updateAccount,
  updateKind
} from './admin.service.js';
import type { Staff } from './admin.repo.js';

export const adminRouter = Router();

/**
 * Everything here writes curriculum or platform state, so the guard is the product decision: authors
 * edit content, only administrators touch provider credentials and other people's accounts.
 */
adminRouter.use(requireStaff);

function actor(req: Request): Staff {
  return { id: req.user!.id, name: req.user!.displayName };
}

function positiveId(req: Request, name = 'id'): number {
  const value = Number(param(req, name));
  if (!Number.isInteger(value) || value <= 0) throw ApiError.badRequest(`Invalid ${name}.`);
  return value;
}

adminRouter.get(
  '/kinds',
  handler((_req, res) => {
    res.json(studioDescriptor());
  })
);

adminRouter.get(
  '/overview',
  handler((req, res) => {
    res.json(overview(req.db));
  })
);

adminRouter.get(
  '/changes',
  handler((req, res) => {
    res.json({ changes: recentChanges(req.db, queryInt(req, 'limit', 40, 1, 200)) });
  })
);

const listQuery = paginationSchema.extend({
  q: z.string().trim().max(200).default(''),
  status: z.string().trim().max(40).default('all')
});

adminRouter.get(
  '/content/:kind',
  handler((req, res) => {
    const query = listQuery.parse(req.query);
    const { items, total } = listKind(req.db, param(req, 'kind'), {
      q: query.q,
      status: query.status,
      limit: query.perPage,
      offset: (query.page - 1) * query.perPage
    });
    res.json({
      items,
      page: query.page,
      perPage: query.perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / query.perPage))
    });
  })
);

/** The editor's selects are filled from here, so the browser never has to know a table name. */
adminRouter.get(
  '/refs/:target',
  handler((req, res) => {
    res.json({
      options: refs(req.db, param(req, 'target'), queryString(req, 'course', '') || null, queryString(req, 'q'), 200)
    });
  })
);

adminRouter.get(
  '/content/:kind/:ref',
  handler((req, res) => {
    res.json(readKind(req.db, param(req, 'kind'), param(req, 'ref')));
  })
);

adminRouter.post(
  '/content/:kind',
  handler((req, res) => {
    res.status(201).json(createKind(req.db, param(req, 'kind'), req.body, actor(req)));
  })
);

adminRouter.put(
  '/content/:kind/:ref',
  handler((req, res) => {
    res.json(updateKind(req.db, param(req, 'kind'), param(req, 'ref'), req.body, actor(req)));
  })
);

adminRouter.delete(
  '/content/:kind/:ref',
  handler((req, res) => {
    const kind = param(req, 'kind');
    const ref = param(req, 'ref');
    removeKind(req.db, kind, ref, actor(req));
    res.json({ deleted: true, kind, ref });
  })
);

const statusBody = z.object({ status: z.string().trim().min(1).max(40) }).strict();

adminRouter.post(
  '/content/:kind/:ref/status',
  handler((req, res) => {
    const { status } = statusBody.parse(req.body ?? {});
    const kind = param(req, 'kind');
    const ref = param(req, 'ref');
    setKindStatus(req.db, kind, ref, status, actor(req));
    res.json({ kind, ref, status });
  })
);

adminRouter.get(
  '/content/lesson/:ref/revisions',
  handler((req, res) => {
    res.json({ revisions: revisions(req.db, param(req, 'ref'), queryInt(req, 'limit', 20, 1, 100)) });
  })
);

adminRouter.get(
  '/content/lesson/:ref/revisions/:id',
  handler((req, res) => {
    res.json(revision(req.db, param(req, 'ref'), positiveId(req)));
  })
);

// ------------------------------------------------------------ AI providers

adminRouter.get(
  '/providers',
  handler((req, res) => {
    res.json({ providers: listProviders(req.db) });
  })
);

adminRouter.post(
  '/providers',
  requireAdmin,
  handler((req, res) => {
    res.status(201).json(saveProvider(req.db, req.body, null, actor(req)));
  })
);

adminRouter.put(
  '/providers/:id',
  requireAdmin,
  handler((req, res) => {
    res.json(saveProvider(req.db, req.body, positiveId(req), actor(req)));
  })
);

adminRouter.delete(
  '/providers/:id',
  requireAdmin,
  handler((req, res) => {
    const id = positiveId(req);
    deleteProvider(req.db, id, actor(req));
    res.json({ deleted: true, id });
  })
);

adminRouter.post(
  '/providers/:id/test',
  requireAdmin,
  handler(async (req, res) => {
    res.json(await testProvider(req.db, positiveId(req)));
  })
);

// ------------------------------------------------------------ accounts

const userQuery = paginationSchema.extend({ q: z.string().trim().max(200).default('') });

adminRouter.get(
  '/users',
  requireAdmin,
  handler((req, res) => {
    const query = userQuery.parse(req.query);
    res.json(listUsers(req.db, { q: query.q, limit: query.perPage, offset: (query.page - 1) * query.perPage }));
  })
);

adminRouter.patch(
  '/users/:id',
  requireAdmin,
  handler((req, res) => {
    res.json(updateAccount(req.db, positiveId(req), req.body, { ...actor(req), role: req.user!.role }));
  })
);
