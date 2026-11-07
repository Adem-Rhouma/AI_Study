import { openDatabase, type Db } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { insert, run } from '../src/db/sql.js';
import { createUser } from '../src/modules/auth/auth.repo.js';
import { createApp } from '../src/app.js';
import request from 'supertest';

export type TestUser = { email: string; password: string; cookie: string; id: number };

/** Fresh in-memory database with all migrations applied. */
export function freshDb(): Db {
  const db = openDatabase(':memory:');
  migrate(db);
  return db;
}

export function makeApp(db: Db) {
  return createApp(db);
}

export async function registerUser(
  app: ReturnType<typeof createApp>,
  input: { email: string; password?: string; displayName?: string } = { email: `u${Math.random().toString(36).slice(2, 9)}@example.com` }
): Promise<TestUser> {
  const password = input.password ?? 'Password-12345';
  const displayName = input.displayName ?? 'Test Learner';
  const res = await request(app).post('/api/auth/register').send({ email: input.email, password, displayName });
  if (res.status !== 201) throw new Error(`register failed (${res.status}): ${JSON.stringify(res.body)}`);
  const cookie = String(res.headers['set-cookie']?.[0] ?? '').split(';')[0];
  return { email: input.email, password, cookie, id: Number(res.body.user.id) };
}

export async function makeStaff(
  app: ReturnType<typeof createApp>,
  db: Db,
  email: string,
  role: 'admin' | 'author' = 'admin'
): Promise<TestUser> {
  const user = await registerUser(app, { email, displayName: role + ' user' });
  run(db, 'UPDATE users SET role = @role WHERE id = @id', { role, id: user.id });
  return user;
}

export function authHeader(user: TestUser) {
  return { Cookie: user.cookie };
}

export function insertTopicFixture(db: Db, input: { slug: string; name?: string; subdomainId?: number; difficulty?: string }) {
  const domainId = Number(
    db.prepare(`SELECT id FROM domains LIMIT 1`).get()?.id ??
      Number(run(db, `INSERT INTO domains (slug, name, summary, order_index, created_at, updated_at) VALUES ('test-domain','Test Domain','',0,'now','now')`).lastInsertRowid)
  );
  const subdomainId =
    input.subdomainId ??
    Number(
      db.prepare('SELECT id FROM subdomains WHERE domain_id = ?').get(domainId)?.id ??
        Number(
          run(db, `INSERT INTO subdomains (domain_id, slug, name, summary, order_index, created_at, updated_at)
                  VALUES (@domainId, 'test-sub', 'Test Subdomain', '', 0, 'now', 'now')`, { domainId }).lastInsertRowid
        )
    );
  return Number(
    insert(
      db,
      `INSERT INTO topics (subdomain_id, slug, name, difficulty, definition, explanation, created_at, updated_at)
       VALUES (@subdomainId, @slug, @name, @difficulty, 'Definition.', 'Explanation text.', @now, @now)`,
      {
        subdomainId,
        slug: input.slug,
        name: input.name ?? input.slug,
        difficulty: input.difficulty ?? 'intermediate',
        now: new Date().toISOString()
      }
    )
  );
}


export function seedLessonWithTopic(db: Db, input: { courseSlug?: string; lessonSlug: string; topicId: number; status?: string }) {
  const now = new Date().toISOString();
  const courseId = Number(
    insert(
      db,
      `INSERT INTO courses (slug, title, subtitle, summary, difficulty, status, est_hours, author, audience,
          objectives, prerequisites_note, completion_criteria, is_featured, order_index, created_at, updated_at)
       VALUES (@slug, 'Fixture Course', '', 'Summary for the fixture course.', 'intermediate', @status, 2, 'QA', '', '[]', '', '', 0, 0, @now, @now)`,
      { slug: input.courseSlug ?? `fixture-course-${input.lessonSlug}`, status: 'published', now }
    )
  );
  const lessonId = Number(
    insert(
      db,
      `INSERT INTO lessons (course_id, slug, title, summary, order_index, status, est_minutes, created_at, updated_at)
       VALUES (@courseId, @slug, 'Fixture Lesson', 'Summary', 1, @status, 10, @now, @now)`,
      { courseId, slug: input.lessonSlug, status: input.status ?? 'published', now }
    )
  );
  run(db, 'INSERT INTO lesson_topics (lesson_id, topic_id) VALUES (@l, @t)', { l: lessonId, t: input.topicId });
  run(db, 'INSERT INTO lesson_blocks (lesson_id, order_index, type, text, payload, created_at, updated_at) VALUES (@l, 0, @type, @text, \'{}\', @now, @now)', {
    l: lessonId,
    type: 'prose',
    text: 'Intro paragraph.',
    now
  });
  return { courseId, lessonId };
}

export { request };
