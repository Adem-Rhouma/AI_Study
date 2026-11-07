import { describe, expect, it } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import { attachDatabase, attachUser } from '../src/lib/auth-context.js';
import { ApiError, errorResponse } from '../src/lib/http.js';
import { authRouter } from '../src/modules/auth/auth.routes.js';
import { libraryRouter } from '../src/modules/library/resources.routes.js';
import { insert, run } from '../src/db/sql.js';
import { freshDb, registerUser, makeStaff, authHeader, request, insertTopicFixture } from './helpers.js';

type Db = ReturnType<typeof freshDb>;

// The lead owns src/routes.ts; until the mount lands, this harness wires the router under test
// into an app that mirrors createApp's middleware chain (auth, cookie session, error handling).
function makeLibraryApp(db: Db) {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(attachDatabase(db));
  app.use(attachUser);
  app.use('/api/auth', authRouter);
  app.use('/api/library', libraryRouter);
  app.use((_req, _res, next) => next(ApiError.notFound('no route')));
  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const { status, body } = errorResponse(err);
    if (status >= 500) console.error('[test-error]', req.path, err);
    if (!res.headersSent) res.status(status).json(body);
  });
  return app;
}

function addResource(
  db: Db,
  input: {
    slug: string;
    title: string;
    type?: string;
    difficulty?: string;
    status?: string;
    year?: number | null;
    description?: string;
    authors?: string;
  }
): number {
  const now = new Date().toISOString();
  return insert(
    db,
    `INSERT INTO resources (slug, title, description, type, url, authors, publisher, published_year, source_name,
        difficulty, est_minutes, status, created_at, updated_at)
     VALUES (@slug, @title, @description, @type, @url, @authors, @publisher, @year, 'arxiv', @difficulty, 30, @status, @now, @now)`,
    {
      slug: input.slug,
      title: input.title,
      description: input.description ?? `${input.title} description`,
      type: input.type ?? 'paper',
      url: `https://example.com/${input.slug}`,
      authors: input.authors ?? 'Someone, Another',
      publisher: 'Test Publisher',
      year: input.year === undefined ? 2024 : input.year,
      difficulty: input.difficulty ?? 'intermediate',
      status: input.status ?? 'published',
      now
    }
  );
}

function linkTopic(db: Db, resourceId: number, topicId: number) {
  run(db, 'INSERT INTO resource_topics (resource_id, topic_id) VALUES (@r, @t)', { r: resourceId, t: topicId });
}

function addTag(db: Db, slug: string, name: string): number {
  insert(db, 'INSERT INTO tags (slug, name) VALUES (@slug, @name)', { slug, name });
  return Number(db.prepare('SELECT id FROM tags WHERE slug = ?').get(slug)?.id);
}

describe('library: resources', () => {
  it('hides drafts from anonymous and learners but lets staff opt in with status=all', async () => {
    const db = freshDb();
    const app = makeLibraryApp(db);
    addResource(db, { slug: 'pub-1', title: 'Published One' });
    addResource(db, { slug: 'pub-2', title: 'Published Two' });
    addResource(db, { slug: 'secret-draft', title: 'Draft Work', status: 'draft' });

    const anon = await request(app).get('/api/library/resources');
    expect(anon.status).toBe(200);
    expect(anon.body.total).toBe(2);
    expect(anon.body.items.map((r: { slug: string }) => r.slug)).toEqual(
      expect.arrayContaining(['pub-1', 'pub-2'])
    );

    const learner = await registerUser(app, { email: 'lib-learner@example.com' });
    const learnerAll = await request(app).get('/api/library/resources?status=all').set(authHeader(learner));
    expect(learnerAll.body.total).toBe(2); // a learner cannot opt into drafts

    const staff = await makeStaff(app, db, 'lib-staff@example.com', 'admin');
    const staffDefault = await request(app).get('/api/library/resources').set(authHeader(staff));
    expect(staffDefault.body.total).toBe(2);
    const staffAll = await request(app).get('/api/library/resources?status=all').set(authHeader(staff));
    expect(staffAll.body.total).toBe(3);

    const draftDetail = await request(app).get('/api/library/resources/secret-draft').set(authHeader(learner));
    expect(draftDetail.status).toBe(404);
    const staffDetail = await request(app).get('/api/library/resources/secret-draft').set(authHeader(staff));
    expect(staffDetail.status).toBe(200);
  });

  it('combines type, difficulty, topic, domain, tag and free-text filters', async () => {
    const db = freshDb();
    const app = makeLibraryApp(db);
    const topicId = insertTopicFixture(db, { slug: 'attention', name: 'Attention Mechanisms' });
    const tagId = addTag(db, 'transformers', 'Transformers');

    const r1 = addResource(db, { slug: 'deep-dive', title: 'Deep Dive into Attention', type: 'paper', difficulty: 'advanced' });
    const r2 = addResource(db, { slug: 'intro-guide', title: 'Gentle Intro', type: 'tutorial', difficulty: 'beginner' });
    const r3 = addResource(db, { slug: 'survey-attention', title: 'Attention Survey', type: 'survey', difficulty: 'advanced' });
    linkTopic(db, r1, topicId);
    linkTopic(db, r3, topicId);
    run(db, 'INSERT INTO resource_tags (resource_id, tag_id) VALUES (@r, @t)', { r: r1, t: tagId });

    const typeDiff = await request(app).get('/api/library/resources?type=paper&difficulty=advanced');
    expect(typeDiff.body.items.map((r: { slug: string }) => r.slug)).toEqual(['deep-dive']);

    const byTopic = await request(app).get('/api/library/resources?topic=attention');
    expect(byTopic.body.total).toBe(2);

    const byDomain = await request(app).get('/api/library/resources?domain=test-domain');
    expect(byDomain.body.total).toBe(2);
    const byOtherDomain = await request(app).get('/api/library/resources?domain=no-such-domain');
    expect(byOtherDomain.body.total).toBe(0);

    const byTag = await request(app).get('/api/library/resources?tag=transformers');
    expect(byTag.body.items.map((r: { slug: string }) => r.slug)).toEqual(['deep-dive']);

    const combo = await request(app).get('/api/library/resources?topic=attention&q=survey');
    expect(combo.body.total).toBe(1);
    expect(combo.body.items[0].slug).toBe('survey-attention');
    // topic names ride in the SAME query (no N+1): max 3 names per item
    expect(combo.body.items[0].topics).toEqual(['Attention Mechanisms']);

    const badType = await request(app).get('/api/library/resources?type=flyer');
    expect(badType.status).toBe(422);
  });

  it('sorts, paginates, clamps perPage and handles pages beyond the last', async () => {
    const db = freshDb();
    const app = makeLibraryApp(db);
    for (const [slug, title] of [
      ['a1', 'Echo Handbook'],
      ['a2', 'Alpha Handbook'],
      ['a3', 'Zulu Handbook'],
      ['a4', 'Mike Handbook'],
      ['a5', 'Bravo Handbook']
    ] as const) {
      addResource(db, { slug, title });
    }
    run(db, `UPDATE resources SET created_at = CASE slug
        WHEN 'a1' THEN '2024-01-01T00:00:00.000Z' WHEN 'a2' THEN '2024-05-01T00:00:00.000Z'
        WHEN 'a3' THEN '2024-03-01T00:00:00.000Z' WHEN 'a4' THEN '2024-04-01T00:00:00.000Z'
        ELSE '2024-02-01T00:00:00.000Z' END`);

    const byTitle = await request(app).get('/api/library/resources?sort=title&perPage=10');
    expect(byTitle.body.items.map((r: { title: string }) => r.title)).toEqual([
      'Alpha Handbook',
      'Bravo Handbook',
      'Echo Handbook',
      'Mike Handbook',
      'Zulu Handbook'
    ]);

    const oldest = await request(app).get('/api/library/resources?sort=oldest&perPage=10');
    expect(oldest.body.items[0].slug).toBe('a1');
    const newest = await request(app).get('/api/library/resources?sort=newest&perPage=10');
    expect(newest.body.items[0].slug).toBe('a2');

    const p2 = await request(app).get('/api/library/resources?sort=title&page=2&perPage=2');
    expect(p2.body.items.map((r: { slug: string }) => r.slug)).toEqual(['a1', 'a4']);
    expect(p2.body.totalPages).toBe(3);

    const beyond = await request(app).get('/api/library/resources?page=99&perPage=2');
    expect(beyond.status).toBe(200);
    expect(beyond.body.items).toEqual([]);
    expect(beyond.body.total).toBe(5);

    const clamp = await request(app).get('/api/library/resources?perPage=500');
    expect(clamp.status).toBe(422);
  });

  it('exposes facets for filter chips in one round trip', async () => {
    const db = freshDb();
    const app = makeLibraryApp(db);
    addResource(db, { slug: 'f1', title: 'F1', type: 'paper', difficulty: 'advanced' });
    addResource(db, { slug: 'f2', title: 'F2', type: 'paper', difficulty: 'beginner' });
    addResource(db, { slug: 'f3', title: 'F3', type: 'book', difficulty: 'beginner' });
    addResource(db, { slug: 'f4', title: 'F4', status: 'draft' });

    const res = await request(app).get('/api/library/facets');
    expect(res.status).toBe(200);
    const types = Object.fromEntries(res.body.types.map((t: { value: string; count: number }) => [t.value, t.count]));
    expect(types).toEqual({ paper: 2, book: 1 }); // draft excluded
    const diffs = Object.fromEntries(res.body.difficulties.map((d: { value: string; count: number }) => [d.value, d.count]));
    expect(diffs.beginner).toBe(2);
    expect(diffs.advanced).toBe(1);
    expect(diffs.introductory).toBeUndefined();
  });

  it('treats bookmarks as idempotent per user and reflects them in the list', async () => {
    const db = freshDb();
    const app = makeLibraryApp(db);
    addResource(db, { slug: 'bm-1', title: 'Bookmark Me' });
    addResource(db, { slug: 'bm-2', title: 'Ignore Me' });

    const anon = await request(app).post('/api/library/resources/bm-1/bookmark');
    expect(anon.status).toBe(401);

    const alice = await registerUser(app, { email: 'bm-alice@example.com' });
    const first = await request(app).post('/api/library/resources/bm-1/bookmark').set(authHeader(alice));
    expect(first.status).toBe(200);
    expect(first.body.bookmarked).toBe(true);
    const again = await request(app).post('/api/library/resources/bm-1/bookmark').set(authHeader(alice));
    expect(again.body.bookmarked).toBe(true);
    const rows = db.prepare('SELECT COUNT(*) AS c FROM user_resource_bookmarks').get() as { c: number };
    expect(rows.c).toBe(1);

    const list = await request(app).get('/api/library/resources').set(authHeader(alice));
    const bm1 = list.body.items.find((r: { slug: string }) => r.slug === 'bm-1');
    expect(bm1.bookmarked).toBe(true);
    const bm2 = list.body.items.find((r: { slug: string }) => r.slug === 'bm-2');
    expect(bm2.bookmarked).toBe(false);

    const bob = await registerUser(app, { email: 'bm-bob@example.com' });
    const bobList = await request(app).get('/api/library/resources').set(authHeader(bob));
    expect(bobList.body.items.find((r: { slug: string }) => r.slug === 'bm-1').bookmarked).toBe(false);

    const detail = await request(app).get('/api/library/resources/bm-1').set(authHeader(alice));
    expect(detail.body.resource.bookmarked).toBe(true);

    const drop = await request(app).delete('/api/library/resources/bm-1/bookmark').set(authHeader(alice));
    expect(drop.body.bookmarked).toBe(false);
    const ghost = await request(app).post('/api/library/resources/no-such-resource/bookmark').set(authHeader(alice));
    expect(ghost.status).toBe(404);
  });

  it('returns full detail with related topics, similar resources and collections', async () => {
    const db = freshDb();
    const app = makeLibraryApp(db);
    const tAttention = insertTopicFixture(db, { slug: 'attention', name: 'Attention' });
    const tOptim = insertTopicFixture(db, { slug: 'optimizers', name: 'Optimizers' });

    const main = addResource(db, { slug: 'main-ref', title: 'Main Reference' });
    const simA = addResource(db, { slug: 'sim-a', title: 'Similar A' });
    const simB = addResource(db, { slug: 'sim-b', title: 'Similar B' });
    linkTopic(db, main, tAttention);
    linkTopic(db, main, tOptim);
    linkTopic(db, simA, tAttention);
    linkTopic(db, simA, tOptim);
    linkTopic(db, simB, tAttention);

    const collId = insert(
      db,
      `INSERT INTO curated_collections (slug, title, description, kind, order_index, created_at, updated_at)
       VALUES ('essentials', 'Essentials', 'start here', 'must-read', 0, '2024-01-01', '2024-01-01')`
    );
    run(db, `INSERT INTO curated_collection_items (collection_id, resource_id, position, note) VALUES (@c, @r, 0, 'read first')`, {
      c: collId,
      r: main
    });

    const res = await request(app).get('/api/library/resources/main-ref');
    expect(res.status).toBe(200);
    const r = res.body.resource;
    expect(r.slug).toBe('main-ref');
    expect(r.relatedTopics.map((t: { slug: string }) => t.slug)).toEqual(['attention', 'optimizers']);
    expect(r.similar[0].slug).toBe('sim-a'); // 2 shared topics beats 1
    expect(r.similar[0].sharedTopics).toBe(2);
    expect(r.similar).toHaveLength(2);
    expect(r.appearsInCollections).toEqual([{ slug: 'essentials', title: 'Essentials', kind: 'must-read' }]);
    expect(r.bookmarked).toBe(false);
  });

  it('serves curated collections with ordered items and notes', async () => {
    const db = freshDb();
    const app = makeLibraryApp(db);
    const r1 = addResource(db, { slug: 'c-res-1', title: 'First Read' });
    const r2 = addResource(db, { slug: 'c-res-2', title: 'Second Read' });
    const collId = insert(
      db,
      `INSERT INTO curated_collections (slug, title, description, kind, order_index, created_at, updated_at)
       VALUES ('trail', 'Reading Trail', 'guided path', 'reading-list', 1, '2024-01-01', '2024-01-01')`
    );
    run(db, `INSERT INTO curated_collection_items (collection_id, resource_id, position, note) VALUES (@c, @r, 1, 'second')`, {
      c: collId,
      r: r2
    });
    run(db, `INSERT INTO curated_collection_items (collection_id, resource_id, position, note) VALUES (@c, @r, 0, 'first')`, {
      c: collId,
      r: r1
    });

    const list = await request(app).get('/api/library/collections');
    expect(list.status).toBe(200);
    expect(list.body.collections[0]).toMatchObject({ slug: 'trail', title: 'Reading Trail', itemCount: 2 });

    const detail = await request(app).get('/api/library/collections/trail');
    expect(detail.body.collection.items.map((i: { slug: string }) => i.slug)).toEqual(['c-res-1', 'c-res-2']);
    expect(detail.body.collection.items[0].note).toBe('first');
    expect((await request(app).get('/api/library/collections/nope')).status).toBe(404);
  });
});

describe('library: user collections', () => {
  it('creates, updates, deletes and isolates collections per owner', async () => {
    const db = freshDb();
    const app = makeLibraryApp(db);
    addResource(db, { slug: 'uc-res-1', title: 'Collection Resource' });
    addResource(db, { slug: 'uc-res-2', title: 'Another Resource' });

    const anon = await request(app).get('/api/library/mine');
    expect(anon.status).toBe(401);

    const alice = await registerUser(app, { email: 'uc-alice@example.com' });
    const created = await request(app)
      .post('/api/library/mine')
      .set(authHeader(alice))
      .send({ title: 'My Reading', description: 'notes', isPublic: true });
    expect(created.status).toBe(201);
    expect(created.body.collection.title).toBe('My Reading');
    expect(created.body.collection.isPublic).toBe(true);
    const id = created.body.collection.id;

    const added = await request(app)
      .post(`/api/library/mine/${id}/items`)
      .set(authHeader(alice))
      .send({ resourceSlug: 'uc-res-1', note: 'key paper' });
    expect(added.status).toBe(201);
    expect(added.body.items).toHaveLength(1);
    expect(added.body.items[0].note).toBe('key paper');
    // idempotent re-add refreshes the note instead of duplicating
    const readded = await request(app)
      .post(`/api/library/mine/${id}/items`)
      .set(authHeader(alice))
      .send({ resourceSlug: 'uc-res-1', note: 'updated note' });
    expect(readded.body.items).toHaveLength(1);
    expect(readded.body.items[0].note).toBe('updated note');

    const patched = await request(app)
      .patch(`/api/library/mine/${id}`)
      .set(authHeader(alice))
      .send({ title: 'Renamed' });
    expect(patched.body.collection.title).toBe('Renamed');
    const emptyPatch = await request(app).patch(`/api/library/mine/${id}`).set(authHeader(alice)).send({});
    expect(emptyPatch.status).toBe(422);

    const mine = await request(app).get('/api/library/mine').set(authHeader(alice));
    expect(mine.body.collections).toHaveLength(1);
    expect(mine.body.collections[0].itemCount).toBe(1);

    // Bob must not learn the collection exists: every route answers 404, never 403.
    const bob = await registerUser(app, { email: 'uc-bob@example.com' });
    expect((await request(app).get(`/api/library/mine/${id}`).set(authHeader(bob))).status).toBe(404);
    expect((await request(app).patch(`/api/library/mine/${id}`).set(authHeader(bob)).send({ title: 'Hijack' })).status).toBe(404);
    expect((await request(app).post(`/api/library/mine/${id}/items`).set(authHeader(bob)).send({ resourceSlug: 'uc-res-2' })).status).toBe(404);
    expect((await request(app).delete(`/api/library/mine/${id}/items/uc-res-1`).set(authHeader(bob))).status).toBe(404);
    expect((await request(app).delete(`/api/library/mine/${id}`).set(authHeader(bob))).status).toBe(404);

    const bobMine = await request(app).get('/api/library/mine').set(authHeader(bob));
    expect(bobMine.body.collections).toEqual([]);

    const removed = await request(app).delete(`/api/library/mine/${id}/items/uc-res-1`).set(authHeader(alice));
    expect(removed.body.removed).toBe(true);
    expect(removed.body.items).toEqual([]);

    const deleted = await request(app).delete(`/api/library/mine/${id}`).set(authHeader(alice));
    expect(deleted.body.deleted).toBe(true);
    expect(db.prepare('SELECT COUNT(*) AS c FROM user_collections').get()).toEqual({ c: 0 });
    const unknownItem = await request(app)
      .post(`/api/library/mine/9999/items`)
      .set(authHeader(alice))
      .send({ resourceSlug: 'uc-res-1' });
    expect(unknownItem.status).toBe(404);
  });
});
