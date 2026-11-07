import { describe, expect, it } from 'vitest';
import { insert, run } from '../src/db/sql.js';
import { freshDb, insertTopicFixture, makeApp, makeStaff, request, seedLessonWithTopic } from './helpers.js';

type Db = ReturnType<typeof freshDb>;

function addResource(db: Db, slug: string, title: string, description: string, status = 'published'): number {
  const now = new Date().toISOString();
  return Number(
    insert(
      db,
      `INSERT INTO resources (slug, title, description, type, url, authors, publisher, published_year, source_name,
          difficulty, est_minutes, status, created_at, updated_at)
       VALUES (@slug, @title, @description, 'book', @url, 'Author A', 'Press', 2020, 'test', 'intermediate', 60,
          @status, @now, @now)`,
      { slug, title, description, url: `https://example.com/${slug}`, status, now }
    )
  );
}

function addCollection(db: Db, slug: string, title: string, description: string, resourceIds: number[]): void {
  const now = new Date().toISOString();
  const id = Number(
    insert(
      db,
      `INSERT INTO curated_collections (slug, title, description, kind, order_index, created_at, updated_at)
       VALUES (@slug, @title, @description, 'reading-list', 0, @now, @now)`,
      { slug, title, description, now }
    )
  );
  resourceIds.forEach((resourceId, position) => {
    run(db, 'INSERT INTO curated_collection_items (collection_id, resource_id, note, position) VALUES (@c, @r, @note, @p)', {
      c: id,
      r: resourceId,
      note: '',
      p: position
    });
  });
}

function setup(): { db: Db; app: ReturnType<typeof makeApp> } {
  const db = freshDb();
  const topicId = insertTopicFixture(db, { slug: 'attention-mechanics', name: 'Attention Mechanics' });
  const resourceId = addResource(db, 'deep-book', 'Deep Learning Book', 'A textbook on deep learning fundamentals.');
  addCollection(db, 'start-here', 'Start Here Collection', 'Five resources worth your first month.', [resourceId]);
  seedLessonWithTopic(db, { courseSlug: 'attention-course', lessonSlug: 'attention-lesson', topicId });
  return { db, app: makeApp(db) };
}

describe('search', () => {
  it('returns suggestions rather than an error when the query is empty', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/search');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.hits)).toBe(true);
    expect(res.body.query.q).toBe('');
    expect(res.body.hits.some((h: { type: string }) => h.type === 'topics')).toBe(true);
  });

  it('finds a topic by name through the FTS index', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/search?q=attention');
    expect(res.status).toBe(200);
    const slugs = res.body.hits.map((h: { slug: string }) => h.slug);
    expect(slugs).toContain('attention-mechanics');
    expect(res.body.usedFallback).toBe(false);
  });

  it('finds a curated collection by title', async () => {
    // Regression: the collections LIKE query bound @like without passing parameters,
    // which made every default-scope search fail with a 500.
    const { app } = setup();
    const res = await request(app).get('/api/search?q=collection');
    expect(res.status).toBe(200);
    expect(res.body.hits.some((h: { type: string; slug: string }) => h.type === 'collections' && h.slug === 'start-here')).toBe(true);
  });

  it('finds a collection through the FTS channel too, when another scope matches', async () => {
    const { app, db } = setup();
    run(db, "UPDATE curated_collections SET title = 'Attention Reading List' WHERE slug = 'start-here'");
    const res = await request(app).get('/api/search?q=attention');
    expect(res.status).toBe(200);
    expect(res.body.usedFallback).toBe(false);
    expect(res.body.hits.some((h: { type: string; slug: string }) => h.type === 'collections')).toBe(true);
  });

  it('falls back to LIKE for terms too short for FTS', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/search?q=at');
    expect(res.status).toBe(200);
    expect(res.body.usedFallback).toBe(true);
    expect(res.body.hits.some((h: { slug: string }) => h.slug === 'attention-mechanics')).toBe(true);
  });

  it('honours the scope filter', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/search?q=fixture&scope=lessons');
    expect(res.status).toBe(200);
    expect(res.body.hits.some((h: { slug: string }) => h.slug === 'attention-lesson')).toBe(true);
    expect(res.body.hits.every((h: { type: string }) => h.type === 'lessons')).toBe(true);
  });

  it('returns no hits when the term matches only another scope', async () => {
    const { app } = setup();
    // "attention" appears in the topic name and course slug, not in any lesson text.
    const res = await request(app).get('/api/search?q=attention&scope=lessons');
    expect(res.status).toBe(200);
    expect(res.body.hits).toEqual([]);
  });

  it('rejects an unknown scope with 422 instead of searching everything', async () => {
    const { app } = setup();
    const res = await request(app).get('/api/search?q=attention&scope=nonsense');
    expect(res.status).toBe(422);
  });

  it('does not 500 on FTS-hostile input', async () => {
    const { app } = setup();
    for (const q of ['"', 'AND', 'attention*', 'a" OR b', '\\', '(', 'NEAR(a b)']) {
      const res = await request(app).get('/api/search').query({ q });
      expect(res.status, `query ${q}`).toBe(200);
    }
  });

  it('hides draft content from anonymous visitors and shows it to staff', async () => {
    const { app, db } = setup();
    addResource(db, 'draft-resource', 'Quantum Attention Drafts', 'An unpublished resource about attention.', 'draft');
    const anonymous = await request(app).get('/api/search?q=quantum');
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.hits.some((h: { slug: string }) => h.slug === 'draft-resource')).toBe(false);

    const staff = await makeStaff(app, db, 'search-admin@example.com', 'admin');
    const asStaff = await request(app).get('/api/search?q=quantum').set('Cookie', staff.cookie);
    expect(asStaff.status).toBe(200);
    expect(asStaff.body.hits.some((h: { slug: string }) => h.slug === 'draft-resource')).toBe(true);
  });

  it('paginates without repeating hits', async () => {
    const { app, db } = setup();
    for (let i = 0; i < 6; i += 1) {
      insertTopicFixture(db, { slug: `attention-variant-${i}`, name: `Attention Variant ${i}` });
    }
    const page1 = await request(app).get('/api/search?q=attention&limit=3&page=1');
    const page2 = await request(app).get('/api/search?q=attention&limit=3&page=2');
    expect(page1.status).toBe(200);
    expect(page2.status).toBe(200);
    expect(page1.body.hits.length).toBe(3);
    const first = page1.body.hits.map((h: { slug: string }) => h.slug);
    const second = page2.body.hits.map((h: { slug: string }) => h.slug);
    expect(second.some((slug: string) => first.includes(slug))).toBe(false);
  });
});
