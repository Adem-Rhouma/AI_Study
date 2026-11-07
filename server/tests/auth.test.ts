import { describe, expect, it } from 'vitest';
import { freshDb, makeApp, registerUser, authHeader, request, makeStaff, insertTopicFixture } from './helpers.js';
import type { Db } from '../src/db/connection.js';

/** Scalar from a COUNT(*) query, so the assertions below read as numbers. */
function rowCount(db: Db, sql: string, ...args: unknown[]): number {
  return Number((db.prepare(sql).get(...args) as { c: number }).c);
}

describe('authentication', () => {
  it('registers, authenticates and isolates a session', async () => {
    const db = freshDb();
    const app = makeApp(db);
    const user = await registerUser(app, { email: 'one@example.com' });
    expect(user.cookie).toMatch(/aim_session=/);

    const me = await request(app).get('/api/auth/me').set(authHeader(user));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('one@example.com');
    expect(me.body.user.role).toBe('learner');

    const anonymous = await request(app).get('/api/auth/me');
    expect(anonymous.body.user).toBeNull();
  });

  it('rejects weak passwords and duplicate emails', async () => {
    const app = makeApp(freshDb());
    const weak = await request(app).post('/api/auth/register').send({ email: 'a@example.com', password: 'short', displayName: 'A' });
    expect(weak.status).toBe(422);
    expect(weak.body.error.code).toBe('validation_failed');

    await request(app).post('/api/auth/register').send({ email: 'dup@example.com', password: 'Password-12345', displayName: 'Dup' });
    const dup = await request(app).post('/api/auth/register').send({ email: 'dup@example.com', password: 'Password-12345', displayName: 'Dup' });
    expect(dup.status).toBe(409);
  });

  it('does not leak whether an email exists on login or reset', async () => {
    const app = makeApp(freshDb());
    const unknown = await request(app).post('/api/auth/login').send({ email: 'ghost@example.com', password: 'Password-12345' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error.message).toBe('Email or password is incorrect.');

    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@example.com' });
    expect(forgot.status).toBe(200);
    expect(forgot.body.devLink).toBeUndefined();

    await request(app).post('/api/auth/register').send({ email: 'real@example.com', password: 'Password-12345', displayName: 'Real' });
    const forgotReal = await request(app).post('/api/auth/forgot-password').send({ email: 'real@example.com' });
    expect(forgotReal.status).toBe(200);
    expect(typeof forgotReal.body.devLink).toBe('string');
  });

  it('locks the account after repeated failures', async () => {
    const app = makeApp(freshDb());
    await request(app).post('/api/auth/register').send({ email: 'lock@example.com', password: 'Password-12345', displayName: 'Lock' });
    for (let i = 0; i < 6; i += 1) {
      await request(app).post('/api/auth/login').send({ email: 'lock@example.com', password: 'nope-nope-nope' });
    }
    const attempt = await request(app).post('/api/auth/login').send({ email: 'lock@example.com', password: 'Password-12345' });
    expect(attempt.status).toBe(429);
  });

  it('resets the password and invalidates old sessions', async () => {
    const db = freshDb();
    const app = makeApp(db);
    const user = await registerUser(app, { email: 'reset@example.com' });
    const forgot = await request(app).post('/api/auth/forgot-password').send({ email: 'reset@example.com' });
    const link = String(forgot.body.devLink);
    const token = decodeURIComponent(link.split('token=')[1]);

    const reset = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Brand-New-Password-9' });
    expect(reset.status).toBe(200);

    const replay = await request(app).post('/api/auth/reset-password').send({ token, newPassword: 'Another-Password-99' });
    expect(replay.status).toBe(400);

    const stale = await request(app).get('/api/auth/me').set(authHeader(user));
    expect(stale.body.user).toBeNull();

    const relogin = await request(app).post('/api/auth/login').send({ email: 'reset@example.com', password: 'Brand-New-Password-9' });
    expect(relogin.status).toBe(200);
  });

  it('protects staff-only preferences and exposes role checks', async () => {
    const db = freshDb();
    const app = makeApp(db);
    const learner = await registerUser(app, { email: 'learner@example.com' });
    const staff = await makeStaff(app, db, 'staff@example.com', 'admin');

    const prefs = await request(app).put('/api/auth/me/preferences').set(authHeader(learner)).send({ theme: 'dark', dailyGoalMinutes: 45 });
    expect(prefs.status).toBe(200);
    expect(prefs.body.preferences.dailyGoalMinutes).toBe(45);

    const noCookie = await request(app).put('/api/auth/me/preferences').send({ theme: 'dark' });
    expect(noCookie.status).toBe(401);

    const meStaff = await request(app).get('/api/auth/me').set(authHeader(staff));
    expect(meStaff.body.user.role).toBe('admin');
  });

  it('logs out by destroying the session row', async () => {
    const db = freshDb();
    const app = makeApp(db);
    const user = await registerUser(app, { email: 'bye@example.com' });
    const out = await request(app).post('/api/auth/logout').set(authHeader(user));
    expect(out.status).toBe(200);
    const count = db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?').get(user.id) as { c: number };
    expect(count.c).toBe(0);
  });

  it('erases an account with its rows, and only its own rows', async () => {
    const db = freshDb();
    const app = makeApp(db);
    const doomed = await registerUser(app, { email: 'doomed@example.com' });
    const neighbour = await registerUser(app, { email: 'neighbour@example.com' });
    const topicId = insertTopicFixture(db, { slug: 'doomed-topic' });

    for (const user of [doomed, neighbour]) {
      db.prepare(
        `INSERT INTO topic_mastery (user_id, topic_id, score, level, updated_at) VALUES (?, ?, 0.5, 'learning', 'now')`
      ).run(user.id, topicId);
    }
    const note = await request(app)
      .post('/api/notes')
      .set(authHeader(doomed))
      .send({ kind: 'topic', slug: 'doomed-topic', body: 'A private note.' });
    expect(note.status).toBe(201);

    const badPassword = await request(app)
      .delete('/api/auth/me')
      .set(authHeader(doomed))
      .send({ password: 'not-the-password', confirm: 'DELETE' });
    expect(badPassword.status).toBe(401);
    expect(rowCount(db, 'SELECT COUNT(*) AS c FROM users WHERE id = ?', doomed.id)).toBe(1);

    const wrongWord = await request(app)
      .delete('/api/auth/me')
      .set(authHeader(doomed))
      .send({ password: doomed.password, confirm: 'delete' });
    expect(wrongWord.status).toBe(400);
    expect(rowCount(db, 'SELECT COUNT(*) AS c FROM user_notes WHERE user_id = ?', doomed.id)).toBe(1);

    const gone = await request(app)
      .delete('/api/auth/me')
      .set(authHeader(doomed))
      .send({ password: doomed.password, confirm: 'DELETE' });
    expect(gone.status).toBe(200);

    expect(rowCount(db, 'SELECT COUNT(*) AS c FROM users WHERE id = ?', doomed.id)).toBe(0);
    expect(rowCount(db, 'SELECT COUNT(*) AS c FROM user_notes WHERE user_id = ?', doomed.id)).toBe(0);
    expect(rowCount(db, 'SELECT COUNT(*) AS c FROM topic_mastery WHERE user_id = ?', doomed.id)).toBe(0);
    expect(rowCount(db, 'SELECT COUNT(*) AS c FROM user_preferences WHERE user_id = ?', doomed.id)).toBe(0);
    expect(rowCount(db, 'SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?', doomed.id)).toBe(0);

    // The stale cookie must not resolve to anything any more.
    const after = await request(app).get('/api/auth/me').set(authHeader(doomed));
    expect(after.body.user).toBeNull();

    // The neighbour and the curriculum are untouched — content is never collateral damage.
    const stillHere = await request(app).get('/api/auth/me').set(authHeader(neighbour));
    expect(stillHere.body.user.email).toBe('neighbour@example.com');
    expect(rowCount(db, 'SELECT COUNT(*) AS c FROM topic_mastery WHERE user_id = ?', neighbour.id)).toBe(1);
    expect(rowCount(db, 'SELECT COUNT(*) AS c FROM topics WHERE id = ?', topicId)).toBe(1);
  });
});
