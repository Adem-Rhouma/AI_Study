import { describe, expect, it } from 'vitest';
import { insert, run } from '../src/db/sql.js';
import {
  freshDb,
  insertTopicFixture,
  makeApp,
  registerUser,
  request,
  seedLessonWithTopic,
  type TestUser
} from './helpers.js';
import type { Db } from '../src/db/connection.js';

type Ctx = { db: ReturnType<typeof freshDb>; app: ReturnType<typeof makeApp>; learner: TestUser };

function addExercise(db: Db, input: { slug: string; topicId: number; lessonId: number; spec: Record<string, unknown>; hints?: number }) {
  const now = new Date().toISOString();
  const id = Number(
    insert(
      db,
      `INSERT INTO exercises (slug, kind, topic_id, lesson_id, difficulty, points, title, prompt, context,
          answer_spec, solution, explanation, answer_note, status, created_at, updated_at)
       VALUES (@slug, 'numeric', @topicId, @lessonId, 'intermediate', 15, @slug, 'Pick the number.', '',
          @spec, 'Model solution.', 'Explanation.', '', 'published', @now, @now)`,
      { ...input, spec: JSON.stringify(input.spec), now }
    )
  );
  for (let position = 0; position < (input.hints ?? 0); position += 1) {
    insert(db, 'INSERT INTO exercise_hints (exercise_id, position, text) VALUES (@id, @position, @text)', {
      id,
      position,
      text: `Hint ${position + 1}: count the entries before converting to MiB.`
    });
  }
  return id;
}

/** One topic with one lesson and one exercise hanging off it — the smallest thing mastery can be derived from. */
async function setup(): Promise<Ctx & { topicId: number; lessonId: number; exerciseSlug: string }> {
  const db = freshDb();
  const app = makeApp(db);
  const learner = await registerUser(app, { email: 'progress@example.com' });
  const topicId = insertTopicFixture(db, { slug: 'attention-mechanics', name: 'Attention Mechanics' });
  const { lessonId } = seedLessonWithTopic(db, { lessonSlug: 'attention-lesson', topicId });
  addExercise(db, {
    slug: 'ex-attention-cost',
    topicId,
    lessonId,
    spec: { expected: 8, tolerance: 0.05 },
    hints: 2
  });
  return { db, app, learner, topicId, lessonId, exerciseSlug: 'ex-attention-cost' };
}

const completeLesson = (ctx: Ctx, slug = 'attention-lesson') =>
  request(ctx.app).post(`/api/learning/lessons/${slug}/complete`).set('Cookie', ctx.learner.cookie).send({ durationSeconds: 540 });

const attempt = (ctx: Ctx, answer: unknown) =>
  request(ctx.app).post('/api/arena/exercises/ex-attention-cost/attempt').set('Cookie', ctx.learner.cookie).send({ answer });

describe('progress', () => {
  it('refuses to describe a learner it cannot identify', async () => {
    const { app } = await setup();
    for (const path of ['/api/progress/overview', '/api/progress/mastery', '/api/progress/export']) {
      const res = await request(app).get(path);
      expect(res.status, path).toBe(401);
    }
  });

  it('reports nothing claimed when the account has done nothing', async () => {
    const { app, learner } = await setup();
    const res = await request(app).get('/api/progress/overview').set('Cookie', learner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.overview).toMatchObject({ lessonsDone: 0, attempts: 0, correctAttempts: 0, accuracy: 0, topicsTouched: 0 });
    expect(res.body.levels).toEqual([]);
    expect(res.body.streak).toEqual({ current: 0, longest: 0, todayActive: false });
    expect(res.body.dueForReview).toEqual([]);
  });

  it('derives a score from a completion plus a graded attempt and shows the arithmetic', async () => {
    const ctx = await setup();
    await completeLesson(ctx);
    const graded = await attempt(ctx, 8);
    expect(graded.status).toBe(201);

    const list = await request(ctx.app).get('/api/progress/mastery').set('Cookie', ctx.learner.cookie);
    expect(list.status).toBe(200);
    expect(list.body.mastery).toHaveLength(1);
    const row = list.body.mastery[0];
    expect(row).toMatchObject({
      topicSlug: 'attention-mechanics',
      coverage: 1,
      performance: 1,
      score: 1,
      attempts: 1,
      lessonsDone: 1,
      level: 'learning'
    });
    // 'learning' rather than 'practising': one attempt is not yet the three the level asks for.
    expect(row.reasons.join('\n')).toContain('Score = 0.45·coverage + 0.45·performance + 0.10·retention');
    expect(row.reasons.join('\n')).toContain('2 more attempt(s) to reach practising');

    const detail = await request(ctx.app).get('/api/progress/mastery/attention-mechanics').set('Cookie', ctx.learner.cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.evidence).toMatchObject({ lessons: { total: 1, done: 1 } });
    expect(detail.body.evidence.attempts).toEqual([
      expect.objectContaining({ correct: true, score: 1, hintsUsed: 0 })
    ]);
    expect(detail.body.why).toEqual(row.reasons);
  });

  it('counts only graded evidence toward the overview and the activity log', async () => {
    const ctx = await setup();
    await completeLesson(ctx);
    await attempt(ctx, 3);
    await attempt(ctx, 8);

    const overview = await request(ctx.app).get('/api/progress/overview').set('Cookie', ctx.learner.cookie);
    expect(overview.body.overview).toMatchObject({
      lessonsDone: 1,
      exercisesAttempted: 1,
      attempts: 2,
      correctAttempts: 1,
      accuracy: 0.5,
      topicsTouched: 1
    });
    expect(overview.body.overview.minutesToday).toBeGreaterThan(0);
    expect(overview.body.streak).toEqual({ current: 1, longest: 1, todayActive: true });

    const activity = await request(ctx.app).get('/api/progress/activity?days=30').set('Cookie', ctx.learner.cookie);
    const today = new Date().toISOString().slice(0, 10);
    expect(activity.body.days).toEqual([expect.objectContaining({ day: today, actions: 3 })]);
  });

  it('discounts a hint-backed answer inside the stored performance term', async () => {
    const ctx = await setup();
    const unlocked = await request(ctx.app)
      .post('/api/arena/exercises/ex-attention-cost/hint')
      .set('Cookie', ctx.learner.cookie)
      .send({ index: 0 });
    expect(unlocked.status).toBe(200);
    await attempt(ctx, 8);

    const detail = await request(ctx.app).get('/api/progress/mastery/attention-mechanics').set('Cookie', ctx.learner.cookie);
    expect(detail.body.mastery).toMatchObject({ performance: 0.8, coverage: 0, level: 'exposed' });
  });

  it('lists a stale topic as due for a recheck once the touch ages out', async () => {
    const ctx = await setup();
    await completeLesson(ctx);
    const stale = new Date(Date.now() - 120 * 86_400_000).toISOString();
    run(ctx.db, 'UPDATE topic_mastery SET last_touched_at = @stale', { stale });

    const review = await request(ctx.app).get('/api/progress/review').set('Cookie', ctx.learner.cookie);
    expect(review.body.queue).toEqual([
      expect.objectContaining({ slug: 'attention-mechanics', level: 'learning', lastTouchedAt: stale })
    ]);

    const overview = await request(ctx.app).get('/api/progress/overview').set('Cookie', ctx.learner.cookie);
    expect(overview.body.dueForReview).toHaveLength(1);
    const row = (await request(ctx.app).get('/api/progress/mastery').set('Cookie', ctx.learner.cookie)).body.mastery[0];
    expect(row.needsRevalidation).toBe(true);
  });

  it('filters the mastery table by search, level and domain', async () => {
    const ctx = await setup();
    await completeLesson(ctx);
    const other = insertTopicFixture(ctx.db, { slug: 'quantiles', name: 'Quantile Regression' });
    const { lessonId } = seedLessonWithTopic(ctx.db, { courseSlug: 'other-course', lessonSlug: 'quantile-lesson', topicId: other });
    void lessonId;
    await completeLesson(ctx, 'quantile-lesson');

    const q = await request(ctx.app).get('/api/progress/mastery?q=attention').set('Cookie', ctx.learner.cookie);
    expect(q.body.mastery.map((m: { topicSlug: string }) => m.topicSlug)).toEqual(['attention-mechanics']);

    const level = await request(ctx.app)
      .get('/api/progress/mastery?level=practising')
      .set('Cookie', ctx.learner.cookie);
    expect(level.body.mastery).toEqual([]);
    expect(level.body.total).toBe(0);

    const domain = await request(ctx.app)
      .get('/api/progress/mastery?domain=test-domain')
      .set('Cookie', ctx.learner.cookie);
    expect(domain.body.total).toBe(2);

    const badDomain = await request(ctx.app)
      .get('/api/progress/mastery?domain=no-such-domain')
      .set('Cookie', ctx.learner.cookie);
    expect(badDomain.body.total).toBe(0);
  });

  it('404s on a topic the learner has never touched, naming the topic back', async () => {
    const ctx = await setup();
    const res = await request(ctx.app).get('/api/progress/mastery/never-touched').set('Cookie', ctx.learner.cookie);
    expect(res.status).toBe(404);
    expect(res.body.error.message).toContain('never-touched');
  });

  it('keeps one account’s evidence out of another account’s progress', async () => {
    const ctx = await setup();
    await completeLesson(ctx);
    await attempt(ctx, 8);
    const other = await registerUser(ctx.app, { email: 'other@example.com' });

    const overview = await request(ctx.app).get('/api/progress/overview').set('Cookie', other.cookie);
    expect(overview.body.overview).toMatchObject({ lessonsDone: 0, attempts: 0, topicsTouched: 0 });
    const mastery = await request(ctx.app).get('/api/progress/mastery').set('Cookie', other.cookie);
    expect(mastery.body.mastery).toEqual([]);
    const detail = await request(ctx.app)
      .get('/api/progress/mastery/attention-mechanics')
      .set('Cookie', other.cookie);
    expect(detail.status).toBe(404);
  });

  it('exports every row the account owns and nothing belonging to anyone else', async () => {
    const ctx = await setup();
    await completeLesson(ctx);
    await attempt(ctx, 8);
    await request(ctx.app)
      .post('/api/notes')
      .set('Cookie', ctx.learner.cookie)
      .send({ kind: 'lesson', slug: 'attention-lesson', body: 'Softmax over rows, not columns.' });

    const res = await request(ctx.app).get('/api/progress/export').set('Cookie', ctx.learner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.mastery).toHaveLength(1);
    expect(res.body.lessonCompletions).toHaveLength(1);
    expect(res.body.exerciseAttempts).toHaveLength(1);
    expect(res.body.notes).toHaveLength(1);
    expect(res.body.totals).toMatchObject({ mastery_rows: 1, completions: 1, attempts: 1 });
    expect(new Date(res.body.exportedAt).toString()).not.toBe('Invalid Date');
  });

  it('starts a learner on paths with nothing enrolled', async () => {
    const ctx = await setup();
    const res = await request(ctx.app).get('/api/progress/paths').set('Cookie', ctx.learner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.paths).toEqual([]);
  });

  it('scopes each stage rollup to that stage and to the enrolled learner', async () => {
    const ctx = await setup();
    const now = new Date().toISOString();
    const otherTopic = insertTopicFixture(ctx.db, { slug: 'quantiles', name: 'Quantile Regression' });
    seedLessonWithTopic(ctx.db, { courseSlug: 'other-course', lessonSlug: 'quantile-lesson', topicId: otherTopic });

    const pathId = Number(
      insert(
        ctx.db,
        `INSERT INTO learning_paths (slug, name, summary, description, audience, difficulty, est_hours, objectives,
            completion_criteria, prerequisites_note, outcome_note, status, is_featured, order_index, created_at, updated_at)
         VALUES ('qa-path', 'QA Path', '', '', '', 'beginner', 10, '[]', '', '', '', 'published', 0, 0, @now, @now)`,
        { now }
      )
    );
    const stageOne = Number(insert(ctx.db, `INSERT INTO learning_path_stages (path_id, title, summary, order_index) VALUES (@p, 'Stage one', '', 0)`, { p: pathId }));
    const stageTwo = Number(insert(ctx.db, `INSERT INTO learning_path_stages (path_id, title, summary, order_index) VALUES (@p, 'Stage two', '', 1)`, { p: pathId }));
    insert(ctx.db, `INSERT INTO learning_path_topics (path_id, topic_id, stage_id, order_index) VALUES (@p, @t, @s, 0)`, {
      p: pathId,
      t: ctx.topicId,
      s: stageOne
    });
    insert(ctx.db, `INSERT INTO learning_path_topics (path_id, topic_id, stage_id, order_index) VALUES (@p, @t, @s, 0)`, {
      p: pathId,
      t: otherTopic,
      s: stageTwo
    });
    run(ctx.db, `INSERT INTO path_enrollments (user_id, path_id, status, started_at) VALUES (@u, @p, 'active', @now)`, {
      u: ctx.learner.id,
      p: pathId,
      now
    });

    await completeLesson(ctx);

    const res = await request(ctx.app).get('/api/progress/paths').set('Cookie', ctx.learner.cookie);
    expect(res.status).toBe(200);
    expect(res.body.paths).toHaveLength(1);
    const path = res.body.paths[0];
    expect(path).toMatchObject({ slug: 'qa-path', name: 'QA Path', status: 'active' });
    expect(path.stages).toEqual([
      // 'exposed' mastery is not 'proficient', so no topic counts as done from a completion alone.
      expect.objectContaining({ title: 'Stage one', topicsTotal: 1, topicsDone: 0, lessonsTotal: 1, lessonsDone: 1 }),
      expect.objectContaining({ title: 'Stage two', topicsTotal: 1, topicsDone: 0, lessonsTotal: 1, lessonsDone: 0 })
    ]);
  });
});
