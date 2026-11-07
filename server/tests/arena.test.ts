import { describe, expect, it } from 'vitest';
import { insert, run } from '../src/db/sql.js';
import { freshDb, makeApp, registerUser, makeStaff, request, type TestUser } from './helpers.js';
import type { Db } from '../src/db/connection.js';

function addExercise(
  db: Db,
  input: {
    slug: string;
    kind: string;
    title?: string;
    prompt?: string;
    points?: number;
    status?: string;
    topicId?: number | null;
    lessonId?: number | null;
    spec?: Record<string, unknown>;
    solution?: string;
    explanation?: string;
  }
): number {
  const now = new Date().toISOString();
  return Number(
    insert(
      db,
      `INSERT INTO exercises (slug, kind, topic_id, lesson_id, difficulty, points, title, prompt, context,
          answer_spec, solution, explanation, answer_note, status, created_at, updated_at)
       VALUES (@slug, @kind, @topicId, @lessonId, 'beginner', @points, @title, @prompt, '',
          @spec, @solution, @explanation, '', @status, @now, @now)`,
      {
        slug: input.slug,
        kind: input.kind,
        topicId: input.topicId ?? null,
        lessonId: input.lessonId ?? null,
        points: input.points ?? 10,
        title: input.title ?? input.slug,
        prompt: input.prompt ?? 'Fixture prompt.',
        spec: JSON.stringify(input.spec ?? {}),
        solution: input.solution ?? 'Model solution text.',
        explanation: input.explanation ?? 'Why the answer is what it is.',
        status: input.status ?? 'published',
        now
      }
    )
  );
}

function addOption(db: Db, exerciseId: number, label: string, text: string, isCorrect: boolean, feedback?: string) {
  insert(
    db,
    `INSERT INTO exercise_options (exercise_id, label, text, is_correct, position, feedback)
     VALUES (@exerciseId, @label, @text, @isCorrect, @position, @feedback)`,
    { exerciseId, label, text, isCorrect: isCorrect ? 1 : 0, position: 0, feedback: feedback ?? null }
  );
}

function addHint(db: Db, exerciseId: number, position: number, text: string) {
  insert(db, 'INSERT INTO exercise_hints (exercise_id, position, text) VALUES (@exerciseId, @position, @text)', {
    exerciseId,
    position,
    text
  });
}

function setup() {
  const db = freshDb();
  const app = makeApp(db);
  const now = new Date().toISOString();
  const domainId = Number(
    insert(
      db,
      `INSERT INTO domains (slug, name, summary, order_index, created_at, updated_at)
       VALUES ('arena-domain','Arena Domain','',0,@now,@now)`,
      { now }
    )
  );
  const subdomainId = Number(
    insert(
      db,
      `INSERT INTO subdomains (domain_id, slug, name, summary, order_index, created_at, updated_at)
       VALUES (@domainId,'arena-sub','Arena Sub','',0,@now,@now)`,
      { domainId, now }
    )
  );
  const topicId = Number(
    insert(
      db,
      `INSERT INTO topics (subdomain_id, slug, name, difficulty, definition, explanation, created_at, updated_at)
       VALUES (@subdomainId,'gradient-descent','Gradient Descent','beginner','Definition.','Explanation.',@now,@now)`,
      { subdomainId, now }
    )
  );
  return { db, app, topicId };
}

async function attempt(app: ReturnType<typeof makeApp>, user: TestUser, slug: string, answer: unknown) {
  return request(app)
    .post(`/api/arena/exercises/${slug}/attempt`)
    .set('Cookie', user.cookie)
    .send({ answer, durationSeconds: 90 });
}

describe('arena', () => {
  it('lists published exercises and hides drafts from learners but not from staff', async () => {
    const { db, app } = setup();
    addExercise(db, { slug: 'ex-public', kind: 'true_false' });
    addExercise(db, { slug: 'ex-draft', kind: 'true_false', status: 'draft' });

    const anonymous = await request(app).get('/api/arena/exercises');
    expect(anonymous.status).toBe(200);
    expect(anonymous.body.exercises.map((e: { slug: string }) => e.slug)).toEqual(['ex-public']);

    const learner = await registerUser(app, { email: 'learner@example.com' });
    const asLearner = await request(app).get('/api/arena/exercises?status=all').set('Cookie', learner.cookie);
    expect(asLearner.body.exercises.map((e: { slug: string }) => e.slug)).toEqual(['ex-public']);

    const admin = await makeStaff(app, db, 'admin@example.com');
    const asAdmin = await request(app).get('/api/arena/exercises?status=all').set('Cookie', admin.cookie);
    expect(asAdmin.body.exercises.map((e: { slug: string }) => e.slug).sort()).toEqual(['ex-draft', 'ex-public']);
  });

  it('never sends the answer key to a learner', async () => {
    const { db, app, topicId } = setup();
    const id = addExercise(db, {
      slug: 'ex-numeric',
      kind: 'numeric',
      topicId,
      spec: { expected: 0.38, tolerance: 0.01, unit: 'ms' },
      solution: 'SECRET SOLUTION'
    });
    addHint(db, id, 0, 'First hint');

    const res = await request(app).get('/api/arena/exercises/ex-numeric');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('SECRET SOLUTION');
    expect(body).not.toContain('0.38');
    expect(res.body.exercise.answerSpec.tolerance).toBe(0.01);
    expect(res.body.exercise.answerSpec.unit).toBe('ms');
    expect(res.body.exercise.hints.available).toEqual([{ position: 0, unlocked: false, text: null }]);
    expect(res.body.exercise.topic).toEqual({ slug: 'gradient-descent', name: 'Gradient Descent' });
  });

  it('withholds per-option feedback until the attempt is graded', async () => {
    const { db, app } = setup();
    const id = addExercise(db, { slug: 'ex-choice', kind: 'single_choice' });
    addOption(db, id, 'A', 'The wrong story.', false, 'SECRET: A is wrong');
    addOption(db, id, 'B', 'The right story.', true, 'SECRET: B is right');

    const before = await request(app).get('/api/arena/exercises/ex-choice');
    expect(before.status).toBe(200);
    expect(before.body.exercise.options).toEqual([
      { label: 'A', text: 'The wrong story.' },
      { label: 'B', text: 'The right story.' }
    ]);
    expect(JSON.stringify(before.body)).not.toContain('SECRET');

    const learner = await registerUser(app, { email: 'picker@example.com' });
    const graded = await attempt(app, learner, 'ex-choice', 'A');
    expect(graded.status).toBe(201);
    expect(graded.body.optionFeedback.map((o: { label: string }) => o.label)).toEqual(['A', 'B']);
    expect(graded.body.optionFeedback.map((o: { feedback: string }) => o.feedback)).toEqual([
      'SECRET: A is wrong',
      'SECRET: B is right'
    ]);
  });

  it('splits a match exercise into two columns so it is answerable without leaking the pairing', async () => {
    const { db, app } = setup();
    addExercise(db, {
      slug: 'ex-match',
      kind: 'match',
      spec: {
        pairs: [
          { left: 'Keeps a second moment', right: 'Adam' },
          { left: 'Keeps no state', right: 'SGD' },
          { left: 'Needs bias correction', right: 'Adam' }
        ]
      }
    });

    const res = await request(app).get('/api/arena/exercises/ex-match');
    expect(res.body.exercise.answerSpec.pairCount).toBe(3);
    expect(res.body.exercise.answerSpec.match).toEqual({
      lefts: ['Keeps a second moment', 'Keeps no state', 'Needs bias correction'],
      rights: ['Adam', 'SGD']
    });
    expect(JSON.stringify(res.body)).not.toContain('pairs');
  });

  it('grades a numeric answer against tolerance and only explains it once it is correct', async () => {
    const { db, app } = setup();
    addExercise(db, { slug: 'ex-num', kind: 'numeric', spec: { expected: 48, tolerance: 0.5 } });
    const learner = await registerUser(app, { email: 'num@example.com' });

    const wrong = await attempt(app, learner, 'ex-num', { value: '40' });
    expect(wrong.status).toBe(201);
    expect(wrong.body.isCorrect).toBe(false);
    expect(wrong.body.score).toBe(0);
    expect(wrong.body.explanation).toBeNull();
    expect(wrong.body.nextAction).toBe('retry');

    const right = await attempt(app, learner, 'ex-num', { value: '48' });
    expect(right.body.isCorrect).toBe(true);
    expect(right.body.score).toBe(1);
    expect(right.body.awardedPoints).toBe(10);
    expect(right.body.explanation).toBe('Why the answer is what it is.');
    expect(right.body.nextAction).toBe('next_exercise');
  });

  it('flags a unit mismatch instead of silently accepting it', async () => {
    const { db, app } = setup();
    addExercise(db, { slug: 'ex-unit', kind: 'numeric', spec: { expected: 8, tolerance: 0, unit: 'mib' } });
    const learner = await registerUser(app, { email: 'unit@example.com' });

    const res = await attempt(app, learner, 'ex-unit', { value: 8, unit: 'MB' });
    expect(res.body.isCorrect).toBe(true);
    expect(res.body.feedback.toLowerCase()).toContain('unit');
  });

  it('discounts credit for hints and keeps unlocked hint text visible on later visits', async () => {
    const { db, app } = setup();
    const id = addExercise(db, { slug: 'ex-hinted', kind: 'numeric', spec: { expected: 1, tolerance: 0 } });
    addHint(db, id, 0, 'Hint zero');
    addHint(db, id, 1, 'Hint one');
    const learner = await registerUser(app, { email: 'hint@example.com' });

    const locked = await request(app).get('/api/arena/exercises/ex-hinted').set('Cookie', learner.cookie);
    expect(locked.body.exercise.hints.available.map((h: { text: string | null }) => h.text)).toEqual([null, null]);

    const unlock = await request(app)
      .post('/api/arena/exercises/ex-hinted/hint')
      .set('Cookie', learner.cookie)
      .send({ index: 1 });
    expect(unlock.status).toBe(200);
    expect(unlock.body.text).toBe('Hint one');
    expect(unlock.body.unlockedPositions).toEqual([
      { position: 0, unlocked: true },
      { position: 1, unlocked: true }
    ]);

    const after = await request(app).get('/api/arena/exercises/ex-hinted').set('Cookie', learner.cookie);
    expect(after.body.exercise.hints.available).toEqual([
      { position: 0, unlocked: true, text: 'Hint zero' },
      { position: 1, unlocked: true, text: 'Hint one' }
    ]);

    const graded = await attempt(app, learner, 'ex-hinted', 1);
    expect(graded.body.isCorrect).toBe(true);
    expect(graded.body.attempt.hintsUsed).toBe(2);
    expect(graded.body.attempt.hintDiscount).toBe(0.6);
    expect(graded.body.score).toBe(0.6);
    expect(graded.body.awardedPoints).toBe(6);
  });

  it('rejects a hint index that does not exist and requires a session', async () => {
    const { db, app } = setup();
    const id = addExercise(db, { slug: 'ex-one-hint', kind: 'true_false', spec: { expected: true } });
    addHint(db, id, 0, 'Only hint');
    const learner = await registerUser(app, { email: 'range@example.com' });

    const outOfRange = await request(app)
      .post('/api/arena/exercises/ex-one-hint/hint')
      .set('Cookie', learner.cookie)
      .send({ index: 3 });
    expect(outOfRange.status).toBe(422);

    const anonymous = await request(app).post('/api/arena/exercises/ex-one-hint/hint').send({ index: 0 });
    expect(anonymous.status).toBe(401);
  });

  it('gives partial credit per matched pair', async () => {
    const { db, app } = setup();
    addExercise(db, {
      slug: 'ex-match-grade',
      kind: 'match',
      points: 15,
      spec: {
        pairs: [
          { left: 'a', right: 'Adam' },
          { left: 'b', right: 'SGD' }
        ]
      }
    });
    const learner = await registerUser(app, { email: 'match@example.com' });

    const res = await attempt(app, learner, 'ex-match-grade', [
      { left: 'a', right: 'Adam' },
      { left: 'b', right: 'Adam' }
    ]);
    expect(res.body.isCorrect).toBe(false);
    expect(res.body.score).toBe(0.5);
    expect(res.body.awardedPoints).toBe(7.5);
  });

  it('records derivations and code as awaiting review, credits nothing, and says no code ran', async () => {
    const { db, app } = setup();
    addExercise(db, { slug: 'ex-code', kind: 'code', spec: { language: 'python', starter: 'def f():' } });
    addExercise(db, { slug: 'ex-derivation', kind: 'derivation' });
    const learner = await registerUser(app, { email: 'review@example.com' });

    const code = await attempt(app, learner, 'ex-code', 'def f():\n    return 1');
    expect(code.body.isCorrect).toBeNull();
    expect(code.body.score).toBe(0);
    expect(code.body.needsReview).toBe(true);
    expect(code.body.nextAction).toBe('await_review');
    expect(code.body.sandboxNote).toContain('no sandbox');
    expect(code.body.feedback).toContain('never executed');
    // Revealing the model solution is why a review submission earns no mastery credit.
    expect(code.body.modelSolution).toBe('Model solution text.');

    const derivation = await attempt(app, learner, 'ex-derivation', 'Step 1 …');
    expect(derivation.body.isCorrect).toBeNull();
    expect(derivation.body.sandboxNote).toBeNull();
    expect(derivation.body.modelSolution).toBe('Model solution text.');
  });

  it('refuses an empty answer with a 422 rather than grading it as wrong', async () => {
    const { db, app } = setup();
    addExercise(db, { slug: 'ex-empty', kind: 'short_answer', spec: { accepted: ['yes'], matchMode: 'equals' } });
    const learner = await registerUser(app, { email: 'empty@example.com' });

    const res = await attempt(app, learner, 'ex-empty', '   ');
    expect(res.status).toBe(422);
  });

  it('returns option-level feedback for a multiple choice answer', async () => {
    const { db, app } = setup();
    const id = addExercise(db, { slug: 'ex-mc', kind: 'multi_choice' });
    addOption(db, id, 'a', 'Correct one', true, 'Yes — this is right.');
    addOption(db, id, 'b', 'Wrong one', false, 'No — this is a common trap.');
    const learner = await registerUser(app, { email: 'mc@example.com' });

    const res = await attempt(app, learner, 'ex-mc', ['a', 'b']);
    expect(res.body.isCorrect).toBe(false);
    expect(res.body.score).toBe(0);
    expect(res.body.optionFeedback).toEqual([
      { label: 'a', text: 'Correct one', correct: true, chosen: true, feedback: 'Yes — this is right.' },
      { label: 'b', text: 'Wrong one', correct: false, chosen: true, feedback: 'No — this is a common trap.' }
    ]);
  });

  it('keeps attempt history and stats per account', async () => {
    const { db, app } = setup();
    addExercise(db, { slug: 'ex-shared', kind: 'true_false', spec: { expected: true } });
    const first = await registerUser(app, { email: 'first@example.com' });
    const second = await registerUser(app, { email: 'second@example.com' });

    await attempt(app, first, 'ex-shared', true);
    await attempt(app, first, 'ex-shared', false);

    const firstHistory = await request(app).get('/api/arena/attempts').set('Cookie', first.cookie);
    expect(firstHistory.body.total).toBe(2);
    // Newest first, so the learner's most recent attempt is the one they see at the top.
    expect(firstHistory.body.attempts.map((a: { isCorrect: boolean }) => a.isCorrect)).toEqual([false, true]);
    expect(firstHistory.body.attempts.map((a: { attemptIndex: number }) => a.attemptIndex)).toEqual([2, 1]);

    const secondHistory = await request(app).get('/api/arena/attempts').set('Cookie', second.cookie);
    expect(secondHistory.body.total).toBe(0);

    const stats = await request(app).get('/api/arena/stats').set('Cookie', first.cookie);
    expect(stats.body.totals.attempts).toBe(2);
    expect(stats.body.totals.correct).toBe(1);
    expect(stats.body.totals.accuracy).toBe(0.5);

    const anonymousStats = await request(app).get('/api/arena/stats');
    expect(anonymousStats.status).toBe(401);
  });

  it('404s on an unknown exercise instead of leaking which drafts exist', async () => {
    const { db, app } = setup();
    addExercise(db, { slug: 'ex-hidden-draft', kind: 'true_false', status: 'draft' });
    const learner = await registerUser(app, { email: 'missing@example.com' });

    expect((await request(app).get('/api/arena/exercises/nope')).status).toBe(404);
    expect((await request(app).get('/api/arena/exercises/ex-hidden-draft').set('Cookie', learner.cookie)).status).toBe(
      404
    );
  });

  it('filters by kind, difficulty and topic, and 422s on an unknown kind', async () => {
    const { db, app, topicId } = setup();
    addExercise(db, { slug: 'ex-a', kind: 'numeric', topicId });
    addExercise(db, { slug: 'ex-b', kind: 'code' });

    const byKind = await request(app).get('/api/arena/exercises?kind=code');
    expect(byKind.body.exercises.map((e: { slug: string }) => e.slug)).toEqual(['ex-b']);

    const byTopic = await request(app).get('/api/arena/exercises?topic=gradient-descent');
    expect(byTopic.body.exercises.map((e: { slug: string }) => e.slug)).toEqual(['ex-a']);

    const badKind = await request(app).get('/api/arena/exercises?kind=telepathy');
    expect(badKind.status).toBe(422);
  });

  it('recomputes topic mastery after an attempt', async () => {
    const { db, app, topicId } = setup();
    const id = addExercise(db, { slug: 'ex-mastery', kind: 'true_false', topicId, spec: { expected: true } });
    run(db, 'INSERT INTO exercise_topics (exercise_id, topic_id) VALUES (@id, @topicId)', { id, topicId });
    const learner = await registerUser(app, { email: 'mastery@example.com' });

    await attempt(app, learner, 'ex-mastery', true);

    const row = db
      .prepare('SELECT level, score, performance, attempts FROM topic_mastery WHERE user_id = ? AND topic_id = ?')
      .get(learner.id, topicId) as { level: string; score: number; performance: number; attempts: number };
    expect(row.attempts).toBe(1);
    expect(row.performance).toBe(1);
    expect(['exposed', 'learning', 'practising']).toContain(row.level);
  });
});
