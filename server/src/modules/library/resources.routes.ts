import { Router } from 'express';
import { z } from 'zod';
import { handler, param } from '../../lib/http.js';
import { requireAuth } from '../../lib/auth-context.js';
import { idParam } from '../../lib/domain.js';
import {
  addCollectionItem,
  bookmarkResource,
  collectionCreateSchema,
  collectionItemSchema,
  collectionUpdateSchema,
  createMyCollection,
  deleteMyCollection,
  getCuratedCollection,
  getCuratedCollections,
  getFacets,
  getMyCollection,
  getMyCollections,
  getResource,
  getResources,
  removeCollectionItem,
  resourceListQuerySchema,
  unbookmarkResource,
  updateMyCollection
} from './resources.service.js';

export const libraryRouter = Router();

const canSeeDrafts = (req: { user?: { role?: string } }) =>
  req.user !== undefined && (req.user.role === 'admin' || req.user.role === 'author');

libraryRouter.get(
  '/resources',
  handler((req, res) => {
    const query = resourceListQuerySchema.parse(req.query);
    res.json(getResources(req.db, query, { userId: req.user?.id ?? null, canSeeDrafts: canSeeDrafts(req) }));
  })
);

libraryRouter.get(
  '/facets',
  handler((req, res) => {
    // Counts per type and difficulty so filter chips render without a second round trip.
    res.json(getFacets(req.db));
  })
);

libraryRouter.get(
  '/collections',
  handler((req, res) => {
    res.json({ collections: getCuratedCollections(req.db, canSeeDrafts(req)) });
  })
);

libraryRouter.get(
  '/collections/:slug',
  handler((req, res) => {
    res.json({ collection: getCuratedCollection(req.db, param(req, 'slug'), canSeeDrafts(req)) });
  })
);

libraryRouter.post(
  '/resources/:slug/bookmark',
  requireAuth,
  handler((req, res) => {
    res.json(bookmarkResource(req.db, param(req, 'slug'), { userId: req.user!.id, canSeeDrafts: canSeeDrafts(req) }));
  })
);

libraryRouter.delete(
  '/resources/:slug/bookmark',
  requireAuth,
  handler((req, res) => {
    res.json(unbookmarkResource(req.db, param(req, 'slug'), { userId: req.user!.id, canSeeDrafts: canSeeDrafts(req) }));
  })
);

// ------------------------------------------------------------- user collections (auth)

libraryRouter.get(
  '/mine',
  requireAuth,
  handler((req, res) => {
    res.json(getMyCollections(req.db, req.user!.id));
  })
);

libraryRouter.post(
  '/mine',
  requireAuth,
  handler((req, res) => {
    const body = collectionCreateSchema.parse(req.body);
    res.status(201).json(createMyCollection(req.db, req.user!.id, body));
  })
);

libraryRouter.get(
  '/mine/:id',
  requireAuth,
  handler((req, res) => {
    res.json(getMyCollection(req.db, idParam.parse(param(req, 'id')), req.user!.id));
  })
);

libraryRouter.patch(
  '/mine/:id',
  requireAuth,
  handler((req, res) => {
    const patch = collectionUpdateSchema.parse(req.body);
    res.json(updateMyCollection(req.db, idParam.parse(param(req, 'id')), req.user!.id, patch));
  })
);

libraryRouter.delete(
  '/mine/:id',
  requireAuth,
  handler((req, res) => {
    res.json(deleteMyCollection(req.db, idParam.parse(param(req, 'id')), req.user!.id));
  })
);

libraryRouter.post(
  '/mine/:id/items',
  requireAuth,
  handler((req, res) => {
    const body = collectionItemSchema.parse(req.body);
    res.status(201).json(addCollectionItem(req.db, idParam.parse(param(req, 'id')), req.user!.id, body, canSeeDrafts(req)));
  })
);

libraryRouter.delete(
  '/mine/:id/items/:resourceSlug',
  requireAuth,
  handler((req, res) => {
    res.json(removeCollectionItem(req.db, idParam.parse(param(req, 'id')), req.user!.id, param(req, 'resourceSlug')));
  })
);

libraryRouter.get(
  '/resources/:slug',
  handler((req, res) => {
    // Kept after the literal routes so "/facets" and "/collections" are never shadowed.
    const slugPattern = z.string().trim().min(2).max(96);
    const slug = slugPattern.parse(param(req, 'slug'));
    res.json({ resource: getResource(req.db, slug, { userId: req.user?.id ?? null, canSeeDrafts: canSeeDrafts(req) }) });
  })
);
