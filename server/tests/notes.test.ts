import { describe, expect, it } from 'vitest';
import { insert, run } from '../src/db/sql.js';
import { freshDb, makeApp, registerUser, authHeader, request, insertTopicFixture, seedLessonWithTopic } from './helpers.js';

type Db = ReturnType<typeof freshDb>;

function addResource(db: Db, slug: string, title = `Resource ${slug}`): number {
  const now = new Date().toISOString();
  return Number(
    insert(
      db,
      `INSERT INTO resources (slug, title, description, type, url, authors, publisher, published_year,
          source_name, difficulty, est_minutes, status, created_at, updated_at)
       VALUES (@slug, @title, 'Description.', 'paper', @url, 'Someone', 'Publisher', 2024, 'arxiv',
          'intermediate', 30, 'published', @now, @now)`,
      { slug, title, url: `https://example.com/${slug}`, now }
    )
  );
}

function content(db: Db) {
  const topicId = insertTopicFixture(db, { slug: 'attention', name: 'Attention Mechanics' });
  const { lessonId } = seedLessonWithTopic(db, { lessonSlug: 'attention-lesson', topicId });
  const resourceId = addResource(db, 'attention-paper');
  return { topicId, lessonId, resourceId };
}

describe('notes and bookmarks', () => {
  it('requires a session on every notes route', async () => {
    const app = makeApp(freshDb());
    for (const [method, path] of [
      ['get', '/api/notes'],
      ['post', '/api/notes'],
      ['get', '/api/notes/bookmarks']
    ] as const) {
      const res = await request(app)[method](path);
      expect(res.status).toBe(401);
    }
  });

  it('stores a note against its target and reads it back with the target title', async () => {
    const db = freshDb();
    const app = makeApp(db);
    const user = await registerUser(app, { email: 'notes-author@example.com' });
    content(db);

    const created = await request(app)
      .post('/api/notes')
      .set(authHeader(user))
      .send({ kind: 'lesson', slug: 'attention-lesson', body: 'Scale by sqrt(dk) before softmax.', quote: 'why scale?' });
    expect(created.status).toBe(201);
    expect(created.body.note).toMatchObject({
      body: 'Scale by sqrt(dk) before softmax.',
      quote: 'why scale?',
      target: { kind: 'lesson', slug: 'attention-lesson', title: 'Fixture Lesson' }
    });

    const list = await request(app).get('/api/notes').set(authHeader(user));
    expect(list.status).toBe(200);
    expect(list.body.total).toBe(1);
    expect(list.body.notes[0].id).toBe(created.body.note.id);

    // The kind filter works on its own — it is not a modifier that only means something with a slug.
    expect((await request(app).get('/api/notes?kind=lesson').set(authHeader(user))).body.total).toBe(1);
    expect((await request(app).get('/api/notes?kind=topic').set(authHeader(user))).body.total).toBe(0);

    const filtered = await request(app).get('/api/notes?kind=topic&q=softmax').set(authHeader(user));
    expect(filtered.body.total).toBe(0);
    const searched = await request(app).get('/api/notes?kind=lesson&q=softmax').set(authHeader(user));
    expect(searched.body.total).toBe(1);

    const byTarget = await request(app).get('/api/notes?kind=lesson&slug=attention-lesson').set(authHeader(user));
    expect(byTarget.body.total).toBe(1);
  });

  it('edits and deletes a note, and refuses to touch another learner’s', async () => {
    const db = freshDb();
    const app = makeApp(db);
    const owner = await registerUser(app, { email: 'notes-owner@example.com' });
    const stranger = await registerUser(app, { email: 'notes-stranger@example.com' });
    content(db);

    const created = await request(app)
      .post('/api/notes')
      .set(authHeader(owner))
      .send({ kind: 'topic', slug: 'attention', body: 'First version' });
    const id = created.body.note.id;

    const patched = await request(app).patch(`/api/notes/${id}`).set(authHeader(owner)).send({ body: 'Second version' });
    expect(patched.status).toBe(200);
    expect(patched.body.note.body).toBe('Second version');

    const strangerPatch = await request(app)
      .patch(`/api/notes/${id}`)
      .set(authHeader(stranger))
      .send({ body: 'Hijacked' });
    expect(strangerPatch.status).toBe(404);
    const strangerDelete = await request(app).delete(`/api/notes/${id}`).set(authHeader(stranger));
    expect(strangerDelete.status).toBe(404);

    const stillThere = await request(app).get('/api/notes').set(authHeader(owner));
    expect(stillThere.body.notes[0].body).toBe('Second version');

    expect((await request(app).delete(`/api/notes/${id}`).set(authHeader(owner))).status).toBe(200);
    expect((await request(app).get('/api/notes').set(authHeader(owner))).body.total).toBe(0);
  });

  it('validates the body, the target and the block before writing anything', async () => {
    const db = freshDb();
    const app = makeApp(db);
    const user = await registerUser(app, { email: 'notes-valid@example.com' });
    const { lessonId } = content(db);
    const other = seedLessonWithTopic(db, { lessonSlug: 'other-lesson', topicId: lessonId });
    const blockOfOther = Number(db.prepare('SELECT id FROM lesson_blocks WHERE lesson_id = ?').get(other.lessonId)?.id);

    const empty = await request(app).post('/api/notes').set(authHeader(user)).send({ kind: 'topic', slug: 'attention', body: '   ' });
    expect(empty.status).toBe(422);

    const missing = await request(app)
      .post('/api/notes')
      .set(authHeader(user))
      .send({ kind: 'topic', slug: 'no-such-topic', body: 'Text' });
    expect(missing.status).toBe(404);

    // A block only means something on a lesson note, and only a block of that same lesson.
    const blockOnTopic = await request(app)
      .post('/api/notes')
      .set(authHeader(user))
      .send({ kind: 'topic', slug: 'attention', body: 'Text', blockId: blockOfOther });
    expect(blockOnTopic.status).toBe(400);

    const foreignBlock = await request(app)
      .post('/api/notes')
      .set(authHeader(user))
      .send({ kind: 'lesson', slug: 'attention-lesson', body: 'Text', blockId: blockOfOther });
    expect(foreignBlock.status).toBe(400);

    const ownBlock = Number(db.prepare('SELECT id FROM lesson_blocks WHERE lesson_id = ?').get(lessonId)?.id);
    const anchored = await request(app)
      .post('/api/notes')
      .set(authHeader(user))
      .send({ kind: 'lesson', slug: 'attention-lesson', body: 'Anchored note', blockId: ownBlock });
    expect(anchored.status).toBe(201);
    expect(anchored.body.note.blockId).toBe(ownBlock);
    expect((await request(app).get('/api/notes').set(authHeader(user))).body.total).toBe(1);
  });

  it('lists bookmarks from every kind in one page, newest first', async () => {
    const db = freshDb();
    const app = makeApp(db);
    const user = await registerUser(app, { email: 'bookmarks@example.com' });
    const { topicId, lessonId } = content(db);

    for (const [kind, slug] of [
      ['lesson', 'attention-lesson'],
      ['topic', 'attention'],
      ['resource', 'attention-paper']
    ] as const) {
      const added = await request(app).post(`/api/notes/bookmarks/${kind}/${slug}`).set(authHeader(user));
      expect(added.status).toBe(200);
      expect(added.body).toEqual({ bookmarked: true, kind, slug });
    }

    // Stamp the three rows a day apart: the assertion below is about ORDER BY, not about which
    // millisecond the requests happened to land in.
    run(db, "UPDATE user_lesson_bookmarks SET created_at = '2026-01-01T00:00:00.000Z' WHERE user_id = @id", { id: user.id });
    run(db, "UPDATE user_topic_bookmarks SET created_at = '2026-01-02T00:00:00.000Z' WHERE user_id = @id", { id: user.id });
    run(db, "UPDATE user_resource_bookmarks SET created_at = '2026-01-03T00:00:00.000Z' WHERE user_id = @id", { id: user.id });

    const all = await request(app).get('/api/notes/bookmarks').set(authHeader(user));
    expect(all.status).toBe(200);
    expect(all.body.bookmarks.map((row: { kind: string }) => row.kind)).toEqual(['resource', 'topic', 'lesson']);
    expect(all.body.bookmarks.map((row: { slug: string }) => row.slug)).toEqual([
      'attention-paper',
      'attention',
      'attention-lesson'
    ]);

    const oneKind = await request(app).get('/api/notes/bookmarks?kind=topic').set(authHeader(user));
    expect(oneKind.body.bookmarks).toHaveLength(1);
    expect(oneKind.body.bookmarks[0].title).toBe('Attention Mechanics');

    const check = await request(app).get('/api/notes/bookmarks/lesson/attention-lesson').set(authHeader(user));
    expect(check.body.bookmarked).toBe(true);

    const removed = await request(app).delete('/api/notes/bookmarks/topic/attention').set(authHeader(user));
    expect(removed.body).toEqual({ bookmarked: false, kind: 'topic', slug: 'attention' });
    expect((await request(app).get('/api/notes/bookmarks').set(authHeader(user))).body.bookmarks).toHaveLength(2);

    // A bookmark is a set: adding twice keeps one row, and removing is idempotent for the client.
    const again = await request(app).post('/api/notes/bookmarks/lesson/attention-lesson').set(authHeader(user));
    expect(again.status).toBe(200);
    expect((await request(app).get('/api/notes/bookmarks?kind=lesson').set(authHeader(user))).body.bookmarks).toHaveLength(1);

    expect((await request(app).post('/api/notes/bookmarks/topic/missing').set(authHeader(user))).status).toBe(404);
    expect((await request(app).post('/api/notes/bookmarks/course/whatever').set(authHeader(user))).status).toBe(422);

    // Isolation: a second learner sees none of this, and cannot unbookmark it either.
    const stranger = await registerUser(app, { email: 'bookmarks-stranger@example.com' });
    expect((await request(app).get('/api/notes/bookmarks').set(authHeader(stranger))).body.bookmarks).toHaveLength(0);
    expect((await request(app).delete('/api/notes/bookmarks/lesson/attention-lesson').set(authHeader(stranger))).status).toBe(200);
    expect((await request(app).get('/api/notes/bookmarks?kind=lesson').set(authHeader(user))).body.bookmarks).toHaveLength(1);
    expect(count(db, 'SELECT COUNT(*) AS c FROM user_lesson_bookmarks WHERE lesson_id = @id', { id: lessonId })).toBe(1);
    expect(count(db, 'SELECT COUNT(*) AS c FROM user_topic_bookmarks WHERE topic_id = @id', { id: topicId })).toBe(0);
    expect(count(db, 'SELECT COUNT(*) AS c FROM user_resource_bookmarks')).toBe(1);
  });
});

/** Scalar from a COUNT(*) query, so the row assertions above read as numbers. */
function count(db: Db, sql: string, params: Record<string, unknown> = {}): number {
  return Number((db.prepare(sql).get(params) as { c: number }).c);
}
