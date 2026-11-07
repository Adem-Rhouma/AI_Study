import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb, insertTopicFixture, makeApp, makeStaff, registerUser, authHeader, request, type TestUser } from './helpers.js';
import { run } from '../src/db/sql.js';
import type { Db } from '../src/db/connection.js';

/**
 * The topic page is the entry point of Explore, and it reads six relations-bearing queries.
 * Every one of them has to bind its topic id — an unbound `@id` returned a 500 for every topic here.
 */
describe('curriculum topic pages', () => {
  let db: Db;
  let app: ReturnType<typeof makeApp>;
  let learner: TestUser;

  beforeEach(async () => {
    db = freshDb();
    app = makeApp(db);
    learner = await registerUser(app, { email: 'reader@example.com' });
  });

  /** topic_relations is directional: `dependent` cannot be understood without `prerequisite`. */
  function relate(dependentSlug: string, prerequisiteSlug: string, kind = 'strict') {
    const dependent = db.prepare('SELECT id FROM topics WHERE slug = ?').get(dependentSlug) as { id: number };
    const prerequisite = db.prepare('SELECT id FROM topics WHERE slug = ?').get(prerequisiteSlug) as { id: number };
    run(
      db,
      `INSERT INTO topic_relations (topic_id, requires_id, kind, note)
       VALUES (@topic, @requires, @kind, 'Needed before the derivation.')`,
      { topic: dependent.id, requires: prerequisite.id, kind }
    );
  }

  it('loads a topic with its prerequisites and what it unlocks', async () => {
    insertTopicFixture(db, { slug: 'linear-models', name: 'Linear models' });
    insertTopicFixture(db, { slug: 'least-squares', name: 'Least squares' });
    relate('least-squares', 'linear-models');

    const dependent = await request(app).get('/api/curriculum/topics/least-squares').set(authHeader(learner));
    expect(dependent.status, JSON.stringify(dependent.body)).toBe(200);
    expect(dependent.body.topic.name).toBe('Least squares');
    expect(dependent.body.topic.relations).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'linear-models', direction: 'requires', kind: 'strict' })])
    );

    const prerequisite = await request(app).get('/api/curriculum/topics/linear-models').set(authHeader(learner));
    expect(prerequisite.status).toBe(200);
    expect(prerequisite.body.topic.relations).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'least-squares', direction: 'unlocks' })])
    );
  });

  it('offers lateral topics that share the subdomain and a tag', async () => {
    insertTopicFixture(db, { slug: 'a-topic', name: 'A topic' });
    insertTopicFixture(db, { slug: 'b-topic', name: 'B topic' });
    run(db, `INSERT INTO tags (slug, name) VALUES ('opt','Optimisation')`);
    for (const slug of ['a-topic', 'b-topic']) {
      const topic = db.prepare('SELECT id FROM topics WHERE slug = ?').get(slug) as { id: number };
      const tag = db.prepare('SELECT id FROM tags WHERE slug = ?').get('opt') as { id: number };
      run(db, 'INSERT INTO topic_tags (topic_id, tag_id) VALUES (@t, @g)', { t: topic.id, g: tag.id });
    }

    const res = await request(app).get('/api/curriculum/topics/a-topic').set(authHeader(learner));
    expect(res.status).toBe(200);
    expect(res.body.topic.relations).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: 'b-topic', direction: 'lateral', kind: 'related' })])
    );
  });

  it('keeps an unpublished topic away from a learner and shows it to staff', async () => {
    insertTopicFixture(db, { slug: 'draft-topic', name: 'Draft topic' });
    run(db, `UPDATE topics SET status = 'draft' WHERE slug = 'draft-topic'`);

    expect((await request(app).get('/api/curriculum/topics/draft-topic').set(authHeader(learner))).status).toBe(404);

    const author = await makeStaff(app, db, 'curriculum-author@example.com', 'author');
    const asStaff = await request(app).get('/api/curriculum/topics/draft-topic').set(authHeader(author));
    expect(asStaff.status).toBe(200);
    expect(asStaff.body.topic.status).toBe('draft');
  });

  it('returns a not-found rather than a server error for a slug that does not exist', async () => {
    const res = await request(app).get('/api/curriculum/topics/no-such-topic').set(authHeader(learner));
    expect(res.status).toBe(404);
    expect(res.body.error.message).toMatch(/no-such-topic/);
  });

  it('serves the graph the prerequisite map is drawn from', async () => {
    insertTopicFixture(db, { slug: 'node-a', name: 'Node A' });
    insertTopicFixture(db, { slug: 'node-b', name: 'Node B' });
    relate('node-b', 'node-a');

    const res = await request(app).get('/api/curriculum/graph').set(authHeader(learner));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const bySlug = Object.fromEntries(res.body.nodes.map((n: { slug: string; id: number }) => [n.slug, n.id]));
    expect(res.body.edges).toEqual([
      expect.objectContaining({ source: bySlug['node-a'], target: bySlug['node-b'], kind: 'strict' })
    ]);
  });
});
