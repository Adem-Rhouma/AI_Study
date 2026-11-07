import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Db } from '../src/db/connection.js';
import { get, run } from '../src/db/sql.js';
import { updateAccount } from '../src/modules/admin/admin.service.js';
import { authLimiter } from '../src/modules/auth/auth.routes.js';
import { assistantLimiter } from '../src/modules/ai/ai.routes.js';
import { authHeader, freshDb, insertTopicFixture, makeApp, makeStaff, registerUser, request, type TestUser } from './helpers.js';

type App = ReturnType<typeof makeApp>;

let db: Db;
let app: App;

let admin: TestUser;
let author: TestUser;
let learner: TestUser;

beforeEach(async () => {
  db = freshDb();
  assistantLimiter.reset();
  authLimiter.reset();
  app = makeApp(db);
  admin = await makeStaff(app, db, 'studio-admin@example.com', 'admin');
  author = await makeStaff(app, db, 'studio-author@example.com', 'author');
  learner = await registerUser(app, { email: 'studio-learner@example.com' });
});

function topicDoc(over: Record<string, unknown> = {}) {
  return {
    name: 'Diffusion models',
    slug: 'diffusion-models',
    subdomain: 'test-sub',
    difficulty: 'advanced',
    definition: 'Generation by repeated denoising from a Gaussian prior.',
    ...over
  };
}

function courseDoc(over: Record<string, unknown> = {}) {
  return {
    title: 'Diffusion, properly',
    slug: 'diffusion-properly',
    difficulty: 'advanced',
    summary: 'From score matching to sampling.',
    status: 'draft',
    ...over
  };
}

describe('Content Studio access control', () => {
  it('refuses anonymous and learner callers', async () => {
    const anonymous = await request(app).get('/api/admin/overview');
    expect(anonymous.status).toBe(401);

    const asLearner = await request(app).get('/api/admin/overview').set(authHeader(learner));
    expect(asLearner.status).toBe(403);
    expect(asLearner.body.error.message).toMatch(/author or administrator/i);
  });

  it('lets authors edit content but keeps credentials and accounts to administrators', async () => {
    insertTopicFixture(db, { slug: 'seed-topic' });

    const overview = await request(app).get('/api/admin/overview').set(authHeader(author));
    expect(overview.status).toBe(200);

    const created = await request(app).post('/api/admin/content/topic').set(authHeader(author)).send(topicDoc());
    expect(created.status).toBe(201);

    const providerWrite = await request(app)
      .post('/api/admin/providers')
      .set(authHeader(author))
      .send({ name: 'Sneaky', adapter: 'openai_compatible', model: 'm', apiKey: 'sk-nope' });
    expect(providerWrite.status).toBe(403);

    const userList = await request(app).get('/api/admin/users').set(authHeader(author));
    expect(userList.status).toBe(403);
  });

  it('publishes only the presentation half of each descriptor', async () => {
    const res = await request(app).get('/api/admin/kinds').set(authHeader(admin));
    expect(res.status).toBe(200);
    expect(res.body.kinds.map((kind: { kind: string }) => kind.kind)).toEqual([
      'topic',
      'lesson',
      'exercise',
      'resource',
      'course',
      'path',
      'event',
      'milestone',
      'collection'
    ]);
    type PublishedField = Record<string, unknown>;
    const fields = res.body.kinds.flatMap((kind: { fields: PublishedField[] }) => kind.fields);
    expect(fields.find((field) => field.key === 'subdomain')).toMatchObject({ type: 'ref', target: 'subdomains' });

    // Section names and the adapter list come from the same metadata the editor renders, so a new
    // kind or a new provider wire format shows up in the studio without a frontend change.
    expect(res.body.kinds.map((kind: { label: string }) => kind.label)).toEqual([
      'Topics',
      'Lessons',
      'Exercises',
      'Resources',
      'Courses',
      'Learning paths',
      'Events and competitions',
      'Milestones',
      'Reading lists'
    ]);
    expect(res.body.providerAdapters).toEqual(['openai_compatible', 'anthropic', 'ollama']);

    // The child-row editors are built from the same metadata, so every shape a relation can name has
    // to be described — and described without a column name. "table" is a legitimate block type, so
    // the leak check reads property names instead of scanning the serialised blob.
    const itemShapes = res.body.itemShapes as Record<string, PublishedField[]>;
    expect(Object.keys(itemShapes).sort()).toEqual(
      ['block', 'collection-item', 'hint', 'module', 'option', 'path-topic', 'prerequisite', 'reference', 'topic-link'].sort()
    );
    const publishedKeys = new Set([
      ...fields,
      ...Object.values(itemShapes).flat(),
      ...res.body.kinds.flatMap((kind: { relations: PublishedField[]; listCounts: PublishedField[] }) => [...kind.relations, ...kind.listCounts])
    ].flatMap((field) => Object.keys(field)));
    for (const leak of ['column', 'table', 'sql', 'fk']) expect(publishedKeys.has(leak)).toBe(false);
    expect(itemShapes.block.find((field) => field.key === 'type')).toMatchObject({
      options: expect.arrayContaining(['worked_example'])
    });
    expect(itemShapes['collection-item'].find((field) => field.key === 'slug')).toMatchObject({ type: 'ref', target: 'resources' });
  });

  it('accepts exactly what the descriptor says a child row holds', async () => {
    // A block type the descriptor offers must save; one it does not must be rejected by name.
    const course = await request(app)
      .post('/api/admin/content/course')
      .set(authHeader(admin))
      .send({ title: 'Descriptor probe', slug: 'descriptor-probe', author: 'AI Mastery curriculum team' });
    expect(course.status).toBe(201);

    const lesson = await request(app)
      .post('/api/admin/content/lesson')
      .set(authHeader(admin))
      .send({
        title: 'Reading the descriptor',
        slug: 'reading-the-descriptor',
        course: 'descriptor-probe',
        blocks: [{ type: 'callout', text: 'Published from the metadata.', payload: { tone: 'info' } }]
      });
    expect(lesson.status).toBe(201);

    const current = await request(app).get('/api/admin/content/lesson/reading-the-descriptor').set(authHeader(admin));
    expect(current.status).toBe(200);

    const res = await request(app)
      .put('/api/admin/content/lesson/reading-the-descriptor')
      .set(authHeader(admin))
      .send({ ...current.body.doc, blocks: [{ type: 'not_a_block_type', text: 'Nope.' }] });
    expect(res.status).toBe(422);
    expect(res.body.error.details.some((issue: { field: string }) => issue.field === 'blocks.0.type')).toBe(true);
  });
});

describe('Content documents', () => {
  beforeEach(() => {
    insertTopicFixture(db, { slug: 'seed-topic' });
  });

  it('creates, reads, updates and deletes a topic, recording every step', async () => {
    const created = await request(app).post('/api/admin/content/topic').set(authHeader(author)).send(topicDoc());
    expect(created.status).toBe(201);
    expect(created.body).toEqual({ id: expect.any(Number), ref: 'diffusion-models' });

    const read = await request(app).get('/api/admin/content/topic/diffusion-models').set(authHeader(author));
    expect(read.status).toBe(200);
    expect(read.body.meta).toMatchObject({ slug: 'diffusion-models', title: 'Diffusion models', status: 'published' });
    expect(read.body.doc).toMatchObject({ slug: 'diffusion-models', subdomain: 'test-sub', tags: [], learningObjectives: [] });

    const updated = await request(app)
      .put('/api/admin/content/topic/diffusion-models')
      .set(authHeader(author))
      .send(topicDoc({ definition: 'Sampling is trained to undo a fixed noise schedule.' }));
    expect(updated.status).toBe(200);

    const searched = await request(app).get('/api/search?q=noise%20schedule').set(authHeader(learner));
    expect(JSON.stringify(searched.body)).toContain('diffusion-models');

    const archived = await request(app)
      .post('/api/admin/content/topic/diffusion-models/status')
      .set(authHeader(author))
      .send({ status: 'archived' });
    expect(archived.status).toBe(200);

    const list = await request(app).get('/api/admin/content/topic?status=archived').set(authHeader(author));
    expect(list.body.items.map((item: { slug: string }) => item.slug)).toContain('diffusion-models');

    const removed = await request(app).delete('/api/admin/content/topic/diffusion-models').set(authHeader(author));
    expect(removed.status).toBe(200);
    const after = await request(app).get('/api/admin/content/topic/diffusion-models').set(authHeader(author));
    expect(after.status).toBe(404);

    const changes = await request(app).get('/api/admin/changes?limit=20').set(authHeader(author));
    const summaries = changes.body.changes.map((change: { summary: string }) => change.summary).join(' | ');
    expect(summaries).toMatch(/Created topic "diffusion-models"/);
    expect(summaries).toMatch(/Updated topic "diffusion-models"/);
    expect(summaries).toMatch(/Diffusion models → archived/);
    expect(summaries).toMatch(/Deleted topic "diffusion-models"/);
    const createdRow = changes.body.changes.find((change: { summary: string }) => change.summary.includes('Created topic'));
    expect(createdRow).toMatchObject({ actor: 'author user', kind: 'topic', ref: 'diffusion-models', action: 'create' });
  });

  it('keeps a deleted staff account from erasing the audit trail', async () => {
    await request(app).post('/api/admin/content/topic').set(authHeader(author)).send(topicDoc());
    run(db, 'DELETE FROM users WHERE id = @id', { id: author.id });

    const changes = await request(app).get('/api/admin/changes').set(authHeader(admin));
    expect(changes.body.changes.some((change: { actor: string }) => change.actor === 'author user')).toBe(true);
  });

  it('rejects unknown kinds, unknown columns and broken references', async () => {
    const badKind = await request(app).get('/api/admin/content/widgets').set(authHeader(author));
    expect(badKind.status).toBe(400);
    expect(badKind.body.error.message).toMatch(/not an editable content type/);

    const extraField = await request(app)
      .post('/api/admin/content/topic')
      .set(authHeader(author))
      .send({ ...topicDoc(), isLive: true });
    expect(extraField.status).toBe(422);
    expect(extraField.body.error.details[0]).toMatchObject({ field: 'isLive' });

    const badSlug = await request(app).post('/api/admin/content/topic').set(authHeader(author)).send(topicDoc({ slug: 'Bad Slug' }));
    expect(badSlug.status).toBe(422);
    expect(badSlug.body.error.details[0].message).toMatch(/lowercase/i);

    const badRef = await request(app).post('/api/admin/content/topic').set(authHeader(author)).send(topicDoc({ subdomain: 'nope' }));
    expect(badRef.status).toBe(400);
    expect(badRef.body.error.message).toMatch(/Unknown subdomain "nope"/);
  });

  it('refuses a topic that requires itself', async () => {
    const res = await request(app)
      .post('/api/admin/content/topic')
      .set(authHeader(author))
      .send({ ...topicDoc(), prerequisites: [{ slug: 'diffusion-models', kind: 'strict' }] });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/cannot require itself/);
  });

  it('writes a lesson with blocks and snapshots the previous version on every edit', async () => {
    const course = await request(app).post('/api/admin/content/course').set(authHeader(author)).send(courseDoc());
    expect(course.status).toBe(201);

    const lessonDoc = {
      title: 'Forward diffusion',
      slug: 'forward-diffusion',
      course: 'diffusion-properly',
      summary: 'How the noise gets in.',
      estMinutes: 20,
      status: 'draft',
      blocks: [
        { type: 'heading', text: 'The noising process' },
        { type: 'prose', text: 'Each step mixes a little more Gaussian noise into the sample.' }
      ],
      references: [{ title: 'Denoising Diffusion Probabilistic Models', authors: 'Ho, Jain and Abbeel', year: 2020, type: 'paper' }],
      topics: [{ slug: 'seed-topic' }]
    };

    const created = await request(app).post('/api/admin/content/lesson').set(authHeader(author)).send(lessonDoc);
    expect(created.status).toBe(201);

    const read = await request(app).get('/api/admin/content/lesson/forward-diffusion').set(authHeader(author));
    expect(read.body.doc.blocks).toHaveLength(2);
    expect(read.body.doc.references[0]).toMatchObject({ title: 'Denoising Diffusion Probabilistic Models', year: 2020 });
    expect(read.body.doc.topics).toEqual([{ slug: 'seed-topic' }]);

    await request(app)
      .put('/api/admin/content/lesson/forward-diffusion')
      .set(authHeader(author))
      .send({ ...lessonDoc, blocks: [{ type: 'prose', text: 'Replaced with a shorter explanation.' }] });

    const list = await request(app).get('/api/admin/content/lesson/forward-diffusion/revisions').set(authHeader(author));
    expect(list.body.revisions).toHaveLength(1);
    expect(list.body.revisions[0]).toMatchObject({ blockCount: 2, note: 'Saved automatically before this edit.' });

    const detail = await request(app).get(`/api/admin/content/lesson/forward-diffusion/revisions/${list.body.revisions[0].id}`).set(authHeader(author));
    expect(detail.status).toBe(200);
    expect(detail.body.lesson.title).toBe('Forward diffusion');
    expect(detail.body.blocks.map((block: { text: string }) => block.text)).toContain('Each step mixes a little more Gaussian noise into the sample.');

    const missing = await request(app).get('/api/admin/content/lesson/forward-diffusion/revisions/9999').set(authHeader(author));
    expect(missing.status).toBe(404);

    // A draft stays a draft: the study route the learner uses does not serve it.
    const learnerView = await request(app).get('/api/learning/lessons/forward-diffusion').set(authHeader(learner));
    expect(learnerView.status).toBe(404);
  });

  it('keeps lesson modules attached to the course that names them', async () => {
    await request(app)
      .post('/api/admin/content/course')
      .set(authHeader(author))
      .send(courseDoc({ modules: [{ title: 'Foundations', summary: 'The generative model.' }] }));

    const wrongCourse = await request(app)
      .post('/api/admin/content/lesson')
      .set(authHeader(author))
      .send({ title: 'L', slug: 'l-one', course: 'diffusion-properly', module: 'Foundations', status: 'draft' });
    expect(wrongCourse.status).toBe(201);
    const read = await request(app).get('/api/admin/content/lesson/l-one').set(authHeader(author));
    expect(read.body.doc.module).toBe('Foundations');

    const other = await request(app).post('/api/admin/content/course').set(authHeader(author)).send(courseDoc({ slug: 'other-course', title: 'Other' }));
    expect(other.status).toBe(201);
    const misplaced = await request(app)
      .post('/api/admin/content/lesson')
      .set(authHeader(author))
      .send({ title: 'L2', slug: 'l-two', course: 'other-course', module: 'Foundations', status: 'draft' });
    expect(misplaced.status).toBe(400);
    expect(misplaced.body.error.message).toMatch(/has no module called "Foundations"/);
  });

  it('will not empty a module that still holds lessons', async () => {
    await request(app)
      .post('/api/admin/content/course')
      .set(authHeader(author))
      .send(courseDoc({ modules: [{ title: 'Foundations' }, { title: 'Sampling' }] }));
    await request(app)
      .post('/api/admin/content/lesson')
      .set(authHeader(author))
      .send({ title: 'L', slug: 'l-one', course: 'diffusion-properly', module: 'Foundations', status: 'draft' });

    const removed = await request(app)
      .put('/api/admin/content/course/diffusion-properly')
      .set(authHeader(author))
      .send(courseDoc({ modules: [{ title: 'Sampling' }] }));
    expect(removed.status).toBe(400);
    expect(removed.body.error.message).toMatch(/Move them to another module first/);

    // the refused save changed nothing at all
    const course = await request(app).get('/api/admin/content/course/diffusion-properly').set(authHeader(author));
    expect(course.body.doc.modules.map((module: { title: string }) => module.title)).toEqual(['Foundations', 'Sampling']);

    const renamed = await request(app)
      .put('/api/admin/content/course/diffusion-properly')
      .set(authHeader(author))
      .send(courseDoc({ modules: [{ title: 'Foundations', summary: 'The forward process.' }, { title: 'Sampling' }] }));
    expect(renamed.status).toBe(200);
    const after = await request(app).get('/api/admin/content/lesson/l-one').set(authHeader(author));
    expect(after.body.doc.module).toBe('Foundations');
  });

  it('refuses to save a published exercise nobody can be marked right on', async () => {
    const exerciseDoc = {
      title: 'Read the noise schedule',
      slug: 'read-the-noise-schedule',
      kind: 'single_choice',
      difficulty: 'advanced',
      prompt: 'What does a larger beta_t mean?',
      status: 'published',
      points: 10,
      options: [
        { label: 'A', text: 'More noise is mixed in at that step', isCorrect: true },
        { label: 'B', text: 'The model is retrained', isCorrect: false }
      ],
      hints: [{ text: 'Think about the marginal q(x_t | x_{t-1}).' }]
    };
    const created = await request(app).post('/api/admin/content/exercise').set(authHeader(author)).send(exerciseDoc);
    expect(created.status).toBe(201);

    const read = await request(app).get('/api/admin/content/exercise/read-the-noise-schedule').set(authHeader(author));
    expect(read.body.doc.options[0]).toMatchObject({ label: 'A', isCorrect: true });
    expect(read.body.doc.hints).toHaveLength(1);

    // Publishing a question whose key marks nobody right is refused where the key is written…
    const unmarkable = await request(app)
      .post('/api/admin/content/exercise')
      .set(authHeader(author))
      .send({ ...exerciseDoc, slug: 'no-right-answer', options: exerciseDoc.options.map((option) => ({ ...option, isCorrect: false })) });
    expect(unmarkable.status).toBe(422);
    expect(unmarkable.body.error.details[0].field).toBe('answerSpec');

    // …a true/false with an empty answer key is refused the same way, and a draft may still be parked.
    const blankKey = await request(app)
      .post('/api/admin/content/exercise')
      .set(authHeader(author))
      .send({ ...exerciseDoc, slug: 'tf-no-key', kind: 'true_false', status: 'published', options: [], answerSpec: { kind: 'true_false' } });
    expect(blankKey.status).toBe(422);
    expect(blankKey.body.error.details[0]).toMatchObject({ field: 'answerSpec' });
    expect(blankKey.body.error.details[0].message).toMatch(/expected/);
    const parked = await request(app)
      .post('/api/admin/content/exercise')
      .set(authHeader(author))
      .send({ ...exerciseDoc, slug: 'draft-no-key', kind: 'true_false', status: 'draft', options: [], answerSpec: {} });
    expect(parked.status).toBe(201);

    // The status endpoint moves a row without rewriting its key, so the health checks are its backstop.
    const moved = await request(app)
      .post('/api/admin/content/exercise/draft-no-key/status')
      .set(authHeader(author))
      .send({ status: 'published' });
    expect(moved.status).toBe(200);

    const overview = await request(app).get('/api/admin/overview').set(authHeader(author));
    const health = overview.body.health as { key: string; count: number }[];
    expect(health.find((check) => check.key === 'unmarkable')?.count).toBe(1);

    const learnerView = await request(app).get('/api/admin/content/exercise/read-the-noise-schedule').set(authHeader(learner));
    expect(learnerView.status).toBe(403);
  });

  it('lists, filters and counts without a hand-written page per kind', async () => {
    await request(app).post('/api/admin/content/resource').set(authHeader(author)).send({
      title: 'Denoising Diffusion Probabilistic Models',
      slug: 'ddpm-paper',
      type: 'paper',
      url: 'https://arxiv.org/abs/2006.11239',
      authors: 'Ho, Jain and Abbeel',
      difficulty: 'advanced',
      status: 'published'
    });

    const listed = await request(app).get('/api/admin/content/resource?q=ddpm').set(authHeader(author));
    expect(listed.body.total).toBe(1);
    expect(listed.body.items[0]).toMatchObject({ slug: 'ddpm-paper', status: 'published' });

    const collection = await request(app)
      .post('/api/admin/content/collection')
      .set(authHeader(author))
      .send({ title: 'Generative modelling', slug: 'generative-modelling', kind: 'reading-list', items: [{ slug: 'ddpm-paper', note: 'Start here.' }] });
    expect(collection.status).toBe(201);

    const read = await request(app).get('/api/admin/content/collection/generative-modelling').set(authHeader(author));
    expect(read.body.doc.items).toEqual([{ slug: 'ddpm-paper', note: 'Start here.' }]);

    const broken = await request(app)
      .post('/api/admin/content/collection')
      .set(authHeader(author))
      .send({ title: 'Ghost list', slug: 'ghost-list', kind: 'reading-list', items: [{ slug: 'not-a-resource' }] });
    expect(broken.status).toBe(400);
    expect(broken.body.error.message).toMatch(/Unknown resource "not-a-resource"/);
  });

  it('offers every linkable content type the editor can write', async () => {
    insertTopicFixture(db, { slug: 'backpropagation', name: 'Backpropagation' });
    await request(app).post('/api/admin/content/course').set(authHeader(author)).send(courseDoc({ modules: [{ title: 'Foundations' }] }));
    await request(app)
      .post('/api/admin/content/resource')
      .set(authHeader(author))
      .send({ title: 'Attention Is All You Need', slug: 'attention-paper', type: 'paper', url: 'https://arxiv.org/abs/1706.03762', difficulty: 'advanced' });

    const topics = await request(app).get('/api/admin/refs/topics?q=back').set(authHeader(author));
    expect(topics.body.options).toEqual([{ value: 'backpropagation', label: 'Backpropagation' }]);

    const subdomains = await request(app).get('/api/admin/refs/subdomains').set(authHeader(author));
    expect(subdomains.body.options).toEqual([{ value: 'test-sub', label: 'Test Subdomain' }]);

    // Reading lists pick resources by slug, so the same picker has to work for them.
    const resources = await request(app).get('/api/admin/refs/resources').set(authHeader(author));
    expect(resources.body.options).toEqual([{ value: 'attention-paper', label: 'Attention Is All You Need' }]);

    const modules = await request(app).get('/api/admin/refs/course_modules?course=diffusion-properly').set(authHeader(author));
    expect(modules.body.options).toEqual([{ value: 'Foundations', label: 'Foundations' }]);

    const scoped = await request(app).get('/api/admin/refs/course_modules').set(authHeader(author));
    expect(scoped.status).toBe(400);
    expect(scoped.body.error.message).toMatch(/Modules belong to a course/);

    const ghostCourse = await request(app).get('/api/admin/refs/course_modules?course=no-such-course').set(authHeader(author));
    expect(ghostCourse.status).toBe(404);

    const notLinkable = await request(app).get('/api/admin/refs/sessions').set(authHeader(author));
    expect(notLinkable.status).toBe(400);
    expect(notLinkable.body.error.message).toMatch(/not a linkable content type/);
  });

  it('will not let staff claim curated events are live', async () => {
    const event = await request(app)
      .post('/api/admin/content/event')
      .set(authHeader(author))
      .send({
        name: 'AI for Good',
        slug: 'ai-for-good-global-challenge',
        organizer: 'United Nations',
        type: 'competition',
        url: 'https://aiforgood.itu.int/',
        difficulty: 'intermediate',
        status: 'upcoming'
      });
    expect(event.status).toBe(201);

    const body = await request(app)
      .post('/api/admin/content/event')
      .set(authHeader(author))
      .send({
        name: 'Fake',
        slug: 'fake-live',
        organizer: 'Nobody',
        type: 'competition',
        url: 'https://example.org/',
        difficulty: 'beginner',
        status: 'upcoming',
        isLiveData: 1
      });
    expect(body.status).toBe(422);

    const kind = await request(app).get('/api/admin/kinds').set(authHeader(author));
    const eventKind = kind.body.kinds.find((entry: { kind: string }) => entry.kind === 'event');
    expect(eventKind.fields.map((field: { key: string }) => field.key)).not.toContain('isLiveData');
    expect(eventKind.consequence).toMatch(/never claims a date it did not read/);
  });

  it('requires a dated source for a milestone and addresses milestones by id', async () => {
    const created = await request(app)
      .post('/api/admin/content/milestone')
      .set(authHeader(author))
      .send({
        occurredOn: '2017-06-12',
        title: 'Attention Is All You Need posted',
        summary: 'The transformer architecture.',
        kind: 'paper',
        url: 'https://arxiv.org/abs/1706.03762',
        sourceName: 'arXiv:1706.03762'
      });
    expect(created.status).toBe(201);
    expect(created.body.ref).toBe(String(created.body.id));

    const read = await request(app).get(`/api/admin/content/milestone/${created.body.id}`).set(authHeader(author));
    expect(read.body.doc.occurredOn).toBe('2017-06-12');
    expect(read.body.meta.slug).toBeNull();

    const undated = await request(app)
      .post('/api/admin/content/milestone')
      .set(authHeader(author))
      .send({ occurredOn: 'summer 2017', title: 'Bad date', kind: 'paper', url: 'https://example.org', sourceName: 'x' });
    expect(undated.status).toBe(422);

    const noStatus = await request(app).post(`/api/admin/content/milestone/${created.body.id}/status`).set(authHeader(author)).send({ status: 'draft' });
    expect(noStatus.status).toBe(400);
  });

  it('reports content that would embarrass the curriculum', async () => {
    await request(app).post('/api/admin/content/course').set(authHeader(author)).send(courseDoc());
    await request(app)
      .post('/api/admin/content/lesson')
      .set(authHeader(author))
      .send({ title: 'Empty', slug: 'empty-lesson', course: 'diffusion-properly', status: 'published' });

    const overview = await request(app).get('/api/admin/overview').set(authHeader(author));
    const health = overview.body.health as { key: string; count: number }[];
    expect(health.find((check) => check.key === 'empty_lessons')?.count).toBe(1);
    expect(overview.body.content.find((entry: { kind: string }) => entry.kind === 'milestone')).toMatchObject({ total: 0 });
    expect(overview.body.assistant).toMatchObject({ configured: false, enabled: 0 });
  });
});

describe('Providers and accounts', () => {
  it('never sends a stored key back to the browser', async () => {
    const created = await request(app)
      .post('/api/admin/providers')
      .set(authHeader(admin))
      .send({ name: 'Primary', adapter: 'openai_compatible', baseUrl: 'https://api.provider.test/v1', model: 'reply-v1', apiKey: 'sk-SECRET-BLOB', isEnabled: true });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({ name: 'Primary', keyStored: true, isEnabled: true });
    expect(JSON.stringify(created.body)).not.toContain('sk-SECRET-BLOB');
    expect(created.body.keyHint).not.toContain('sk-SECRET-BLOB');

    const listed = await request(app).get('/api/admin/providers').set(authHeader(admin));
    expect(JSON.stringify(listed.body)).not.toContain('sk-SECRET-BLOB');

    const stored = get<{ api_key_ciphertext: string }>(db, 'SELECT api_key_ciphertext FROM ai_providers WHERE id = @id', { id: created.body.id });
    expect(stored?.api_key_ciphertext).toBeTruthy();
    expect(stored?.api_key_ciphertext).not.toContain('sk-SECRET-BLOB');

    // a blank key on update means "keep what is stored"
    const updated = await request(app)
      .put(`/api/admin/providers/${created.body.id}`)
      .set(authHeader(admin))
      .send({ name: 'Primary', adapter: 'openai_compatible', model: 'reply-v2', apiKey: '', isEnabled: true });
    expect(updated.status).toBe(200);
    expect(updated.body.model).toBe('reply-v2');
    expect(get<{ api_key_ciphertext: string }>(db, 'SELECT api_key_ciphertext FROM ai_providers WHERE id = @id', { id: created.body.id }))
      .toEqual(stored);

    const fresh = await request(app)
      .post('/api/admin/providers')
      .set(authHeader(admin))
      .send({ name: 'No Key', adapter: 'openai_compatible', model: 'm', apiKey: '' });
    expect(fresh.status).toBe(400);
    expect(fresh.body.error.message).toMatch(/needs an API key/);

    const status = await request(app).get('/api/ai/status').set(authHeader(learner));
    expect(status.body).toMatchObject({ configured: true, provider: { name: 'Primary', model: 'reply-v2' } });
  });

  it('tests a provider with a real request and reports what came back', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: { headers: Record<string, string>; body: string }) => {
        calls.push({ auth: init.headers.authorization, body: JSON.parse(init.body) });
        return new Response(JSON.stringify({ choices: [{ message: { content: 'ready' }, finish_reason: 'stop' }], model: 'reply-v1' }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      })
    );

    const created = await request(app)
      .post('/api/admin/providers')
      .set(authHeader(admin))
      .send({ name: 'Checked', adapter: 'openai_compatible', baseUrl: 'https://api.provider.test/v1', model: 'reply-v1', apiKey: 'sk-CHECKME' });

    const tested = await request(app).post(`/api/admin/providers/${created.body.id}/test`).set(authHeader(admin));
    expect(tested.status).toBe(200);
    expect(tested.body).toMatchObject({ ok: true, model: 'reply-v1', excerpt: 'ready' });
    expect((calls[0] as { auth: string }).auth).toBe('Bearer sk-CHECKME');
    expect(tested.body.latencyMs).toBeGreaterThanOrEqual(0);

    const missing = await request(app).post('/api/admin/providers/4242/test').set(authHeader(admin));
    expect(missing.status).toBe(404);
    vi.unstubAllGlobals();
  });

  it('records provider work in the same audit trail as content', async () => {
    const created = await request(app)
      .post('/api/admin/providers')
      .set(authHeader(admin))
      .send({ name: 'Audited', adapter: 'ollama', baseUrl: 'http://127.0.0.1:11434', model: 'small', apiKey: 'local' });
    await request(app).delete(`/api/admin/providers/${created.body.id}`).set(authHeader(admin));

    const changes = await request(app).get('/api/admin/changes').set(authHeader(admin));
    const summaries = changes.body.changes.map((change: { summary: string }) => change.summary);
    expect(summaries).toContain('Added provider "Audited"');
    expect(summaries).toContain('Removed provider "Audited"');
  });

  it('will not let the last administrator lock the team out', async () => {
    const second = await makeStaff(app, db, 'second-admin@example.com', 'admin');

    const self = await request(app).patch(`/api/admin/users/${admin.id}`).set(authHeader(admin)).send({ role: 'learner' });
    expect(self.status).toBe(400);
    expect(self.body.error.message).toMatch(/your own access/);

    const selfOff = await request(app).patch(`/api/admin/users/${admin.id}`).set(authHeader(admin)).send({ isActive: false });
    expect(selfOff.status).toBe(400);

    const demoted = await request(app).patch(`/api/admin/users/${second.id}`).set(authHeader(admin)).send({ role: 'learner' });
    expect(demoted.status).toBe(200);
    expect(get<{ role: string }>(db, 'SELECT role FROM users WHERE id = @id', { id: second.id })?.role).toBe('learner');

    // The last-administrator guard needs an actor who is no longer an active admin themselves, which
    // no HTTP route can produce — a session for a deactivated account is refused before it gets here.
    run(db, "UPDATE users SET role = 'author' WHERE id = @id", { id: admin.id });
    const sole = await makeStaff(app, db, 'sole-admin@example.com', 'admin');
    expect(() => updateAccount(db, sole.id, { role: 'learner' }, { id: admin.id, name: 'Demoted', role: 'author' })).toThrowError(
      /last active administrator/
    );
  });

  it('deactivating an account ends its sessions', async () => {
    const target = await registerUser(app, { email: 'leaving@example.com' });
    expect((await request(app).get('/api/auth/me').set(authHeader(target))).body.user).not.toBeNull();

    const res = await request(app).patch(`/api/admin/users/${target.id}`).set(authHeader(admin)).send({ isActive: false });
    expect(res.status).toBe(200);
    expect((await request(app).get('/api/auth/me').set(authHeader(target))).body.user).toBeNull();

    const users = await request(app).get('/api/admin/users?q=leaving').set(authHeader(admin));
    expect(users.body.items[0]).toMatchObject({ email: 'leaving@example.com', isActive: false, sessions: 0 });

    const nothing = await request(app).patch(`/api/admin/users/${target.id}`).set(authHeader(admin)).send({});
    expect(nothing.status).toBe(400);

    const unknown = await request(app).patch('/api/admin/users/9999').set(authHeader(admin)).send({ role: 'author' });
    expect(unknown.status).toBe(404);
  });

  it('refuses a second provider with the same name', async () => {
    const body = { name: 'Twin', adapter: 'openai_compatible', model: 'm', apiKey: 'sk-one' };
    const first = await request(app).post('/api/admin/providers').set(authHeader(admin)).send(body);
    expect(first.status).toBe(201);
    const second = await request(app).post('/api/admin/providers').set(authHeader(admin)).send({ ...body, apiKey: 'sk-two' });
    expect(second.status).toBe(409);
  });
});
