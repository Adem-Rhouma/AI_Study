import type Database from 'better-sqlite3';
import { z } from 'zod';
import { ApiError } from '../../lib/http.js';
import { difficultySchema, paginationSchema, resourceTypeSchema, slugSchema } from '../../lib/domain.js';
import {
  createUserCollection,
  deleteUserCollection,
  findResourceId,
  findUserCollection,
  getCuratedCollectionBySlug,
  getResourceBySlug,
  getResourceFacets,
  listCuratedCollections,
  listResources,
  listUserCollectionItems,
  listUserCollections,
  removeResourceBookmark,
  removeUserCollectionItem,
  setResourceBookmark,
  upsertUserCollectionItem,
  updateUserCollection,
  type ResourceFilters,
  type ResourceSort
} from './resources.repo.js';

export const resourceListQuerySchema = paginationSchema.extend({
  type: resourceTypeSchema.optional(),
  difficulty: difficultySchema.optional(),
  topic: slugSchema.optional(),
  domain: slugSchema.optional(),
  tag: z.string().trim().min(1).max(96).optional(),
  q: z.string().trim().max(160).default(''),
  sort: z.enum(['newest', 'oldest', 'title', 'relevance']).default('relevance'),
  status: z.enum(['published', 'all']).default('published')
});
export type ResourceListQuery = z.infer<typeof resourceListQuerySchema>;

export const collectionCreateSchema = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).default(''),
  isPublic: z.boolean().default(false)
});

export const collectionUpdateSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(500),
    isPublic: z.boolean()
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Provide at least one field to update' });

export const collectionItemSchema = z.object({
  resourceSlug: slugSchema,
  note: z.string().trim().max(500).default('')
});

type Caller = { userId: number | null; canSeeDrafts: boolean };

export function getResources(db: Database.Database, query: ResourceListQuery, caller: Caller) {
  // Draft visibility is a permission, not a preference: a learner can never opt into status=all.
  const status = query.status === 'all' && caller.canSeeDrafts ? 'all' : 'published';
  const filters: ResourceFilters = {
    ...(query.type ? { type: query.type } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    ...(query.topic ? { topic: query.topic } : {}),
    ...(query.domain ? { domain: query.domain } : {}),
    ...(query.tag ? { tag: query.tag } : {}),
    ...(query.q ? { q: query.q } : {}),
    sort: query.sort as ResourceSort,
    status,
    limit: query.perPage,
    offset: (query.page - 1) * query.perPage,
    userId: caller.userId
  };
  const { items, total } = listResources(db, filters);
  return {
    items,
    page: query.page,
    perPage: query.perPage,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.perPage))
  };
}

export function getResource(db: Database.Database, slug: string, caller: Caller) {
  const resource = getResourceBySlug(db, slug, { canSeeDrafts: caller.canSeeDrafts, userId: caller.userId });
  if (!resource) throw ApiError.notFound(`Unknown resource "${slug}"`);
  return resource;
}

export function getFacets(db: Database.Database) {
  return getResourceFacets(db);
}

export function bookmarkResource(db: Database.Database, slug: string, caller: { userId: number; canSeeDrafts: boolean }) {
  const resource = findResourceId(db, slug, caller.canSeeDrafts);
  if (!resource) throw ApiError.notFound(`Unknown resource "${slug}"`);
  setResourceBookmark(db, caller.userId, resource.id);
  return { slug, bookmarked: true };
}

export function unbookmarkResource(db: Database.Database, slug: string, caller: { userId: number; canSeeDrafts: boolean }) {
  const resource = findResourceId(db, slug, caller.canSeeDrafts);
  if (!resource) throw ApiError.notFound(`Unknown resource "${slug}"`);
  removeResourceBookmark(db, caller.userId, resource.id);
  return { slug, bookmarked: false };
}

export function getCuratedCollections(db: Database.Database, canSeeDrafts: boolean) {
  return listCuratedCollections(db, canSeeDrafts);
}

export function getCuratedCollection(db: Database.Database, slug: string, canSeeDrafts: boolean) {
  const collection = getCuratedCollectionBySlug(db, slug, canSeeDrafts);
  if (!collection) throw ApiError.notFound(`Unknown collection "${slug}"`);
  return collection;
}

// ------------------------------------------------------------------ user collections

/**
 * Ownership rule: a collection that exists but belongs to someone else answers exactly like a
 * missing one (404). A 403 would confirm the id exists and leak information.
 */
function requireOwnedCollection(db: Database.Database, id: number, userId: number) {
  const collection = findUserCollection(db, id, userId);
  if (!collection) throw ApiError.notFound(`Unknown collection "${id}"`);
  return collection;
}

export function getMyCollections(db: Database.Database, userId: number) {
  return { collections: listUserCollections(db, userId) };
}

export function getMyCollection(db: Database.Database, id: number, userId: number) {
  const collection = requireOwnedCollection(db, id, userId);
  return { collection, items: listUserCollectionItems(db, id) };
}

export function createMyCollection(db: Database.Database, userId: number, input: z.infer<typeof collectionCreateSchema>) {
  return { collection: createUserCollection(db, userId, input) };
}

export function updateMyCollection(
  db: Database.Database,
  id: number,
  userId: number,
  patch: z.infer<typeof collectionUpdateSchema>
) {
  requireOwnedCollection(db, id, userId);
  const updated = updateUserCollection(db, id, userId, patch);
  if (!updated) throw ApiError.notFound(`Unknown collection "${id}"`);
  return { collection: updated };
}

export function deleteMyCollection(db: Database.Database, id: number, userId: number) {
  requireOwnedCollection(db, id, userId);
  deleteUserCollection(db, id, userId);
  return { deleted: true, id };
}

export function addCollectionItem(
  db: Database.Database,
  id: number,
  userId: number,
  input: z.infer<typeof collectionItemSchema>,
  canSeeDrafts: boolean
) {
  requireOwnedCollection(db, id, userId);
  const resource = findResourceId(db, input.resourceSlug, canSeeDrafts);
  if (!resource) throw ApiError.notFound(`Unknown resource "${input.resourceSlug}"`);
  upsertUserCollectionItem(db, id, resource.id, input.note);
  return { collectionId: id, items: listUserCollectionItems(db, id) };
}

export function removeCollectionItem(db: Database.Database, id: number, userId: number, resourceSlug: string) {
  requireOwnedCollection(db, id, userId);
  const removed = removeUserCollectionItem(db, id, resourceSlug);
  return { collectionId: id, removed, items: listUserCollectionItems(db, id) };
}
