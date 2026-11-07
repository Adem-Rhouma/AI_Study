import { beforeEach, describe, expect, it } from 'vitest';
import { freshDb, makeApp, request, type Db } from './helpers.js';
import { insert } from '../src/db/sql.js';

/**
 * A query string only ever carries "true" or "false" as text, and Boolean("false") is true.
 * These assertions hold the line on what an unchecked "Featured only" box has to mean.
 */
describe('learning path listing', () => {
  let db: Db;
  let app: ReturnType<typeof makeApp>;

  beforeEach(() => {
    db = freshDb();
    app = makeApp(db);
    const now = new Date().toISOString();
    for (const [slug, featured] of [
      ['flagged-route', 1],
      ['quiet-route', 0]
    ] as const) {
      insert(
        db,
        `INSERT INTO learning_paths (slug, name, summary, difficulty, est_hours, status, is_featured, order_index, created_at, updated_at)
         VALUES (@slug, @name, 'A route through the catalogue.', 'intermediate', 20, 'published', @featured, @featured, @now, @now)`,
        { slug, name: slug === 'flagged-route' ? 'Flagged route' : 'Quiet route', featured, now }
      );
    }
  });

  async function slugs(query: string): Promise<string[]> {
    const res = await request(app).get(`/api/paths${query}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.paths.map((path: { slug: string }) => path.slug);
  }

  it('returns every published path when the featured filter is off', async () => {
    expect(await slugs('?featured=false')).toEqual(['flagged-route', 'quiet-route']);
    expect(await slugs('')).toEqual(['flagged-route', 'quiet-route']);
  });

  it('returns only featured paths when the filter is on', async () => {
    expect(await slugs('?featured=true')).toEqual(['flagged-route']);
  });

  it('keeps an unpublished path away from an anonymous listing', async () => {
    insert(
      db,
      `INSERT INTO learning_paths (slug, name, summary, difficulty, est_hours, status, is_featured, order_index, created_at, updated_at)
       VALUES ('draft-route','Draft route','', 'intermediate', 10, 'draft', 0, 9, @now, @now)`,
      { now: new Date().toISOString() }
    );
    expect(await slugs('')).toEqual(['flagged-route', 'quiet-route']);
  });
});
